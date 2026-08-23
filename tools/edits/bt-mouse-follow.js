#!/usr/bin/env node
/*
 * Make the Magic-layer BT profile keys drag the mouse along.
 *
 *   node tools/edits/bt-mouse-follow.js IN.json OUT.json
 *
 * Values are absolute, not increments — running it twice is the same as
 * running it once.
 *
 * --------------------------------------------------------------- THE PROBLEM
 *
 * The MX Master 3S pairs to the same machines as the keyboard, but switching
 * it means flipping it over for the channel button. Software CAN move it: the
 * HID++ `ChangeHost` feature (0x1814, index 0x0A on the 3S) — the catch is the
 * command only works on the machine the mouse is CURRENTLY connected to. You
 * can push the mouse away; you can never pull it.
 *
 * The BT profile keys are the one place that constraint costs nothing: at the
 * moment you press one, the keyboard is still talking to the machine being
 * left — which is exactly the machine that owns the mouse. So: tap a hotkey
 * the desktop can hear, give it time to land, THEN hop. A per-machine listener
 * (Hammerspoon on macOS, AutoHotkey on Windows) turns the hotkey into the
 * hidapitester push. Same listener table on every machine.
 *
 * ------------------------------------------------------------------- HOTKEYS
 *
 * PLAN.md reserves plain F13–F20 and LS(F13–F16) for the WM layers, and
 * wm-shift-verbs.js asserts F21–F24 never appear (macOS has no keycodes above
 * F20). So the hop hotkeys are the tile row plus Ctrl:
 *
 *   profile    0             1             2             3
 *   hotkey     LC(LS(F17))   LC(LS(F18))   LC(LS(F19))   LC(LS(F20))
 *
 * The tap is invisible to apps (nothing binds Ctrl+Shift+F17–F20), and
 * pressing the profile you are already on just pushes the mouse to where it
 * already is — a no-op at the mouse end.
 *
 * ------------------------------------------------------------------ THE EDIT
 *
 * The stock `&bt_N` keys are firmware macros (`&out OUT_BLE` + `&bt BT_SEL N`)
 * that ship in the Glove80 firmware, so they can't be extended — they are
 * REPLACED: every `&bt_N` key becomes `&bt_hop_N`, a layout-defined macro
 * that taps the hotkey, waits WAIT_MS for the report to flush over the dying
 * link, then does exactly what the stock macro did.
 */
'use strict';

var fs = require('fs');
var path = require('path');

// Between the hotkey tap and the profile hop. BLE delivers a report within a
// connection interval (7.5–15 ms); 125 ms is margin, not science.
var WAIT_MS = 125;
var TAP_MS = 30;

// Hop hotkey per profile: LC(LS(F<BASE+N>)).
var BASE_FKEY = 17;
var PROFILES = 4;

// -----------------------------------------------------------------------

var IN = process.argv[2];
var OUT = process.argv[3];
if (!IN || !OUT) {
  console.error('usage: node tools/edits/bt-mouse-follow.js IN.json OUT.json');
  process.exit(1);
}

var ROOT = path.resolve(__dirname, '../..');
var Parse = require(path.join(ROOT, 'js/parse.js'));

var d = JSON.parse(fs.readFileSync(IN, 'utf8'));
var log = [];

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

function fkeyOf(profile) { return 'F' + (BASE_FKEY + profile); }

/** `{value:'LC',params:[{value:'LS',params:[{value:'F17'}]}]}` -> "LC(LS(F17))" */
function flat(p) {
  if (p == null) return '';
  var kids = (p.params || []).map(flat).join(',');
  return String(p.value) + (kids ? '(' + kids + ')' : '');
}

function hotkeyBinding(profile) {
  return {
    value: '&kp',
    params: [{ value: 'LC', params: [{ value: 'LS', params: [{ value: fkeyOf(profile) }] }] }]
  };
}

/* The hotkeys must mean nothing else on this keyboard. The WM layers' plain
 * F17–F20 are fine — different chord — but the exact LC(LS(...)) form
 * appearing anywhere outside our own macros would fire the mouse push from
 * some unrelated key. */
var reserved = {};
for (var i = 0; i < PROFILES; i++) reserved['LC(LS(' + fkeyOf(i) + '))'] = true;

function scanBindings(list, where) {
  (list || []).forEach(function (b) {
    if (!b) return;
    (b.params || []).forEach(function (p) {
      if (reserved[flat(p)]) fail('hotkey ' + flat(p) + ' already in use at ' + where);
    });
  });
}
d.layers.forEach(function (layer, li) {
  scanBindings(layer, 'layer ' + (d.layer_names[li] || li));
});
(d.macros || []).forEach(function (m) {
  if (!/^&bt_hop_\d+$/.test(m.name)) scanBindings(m.bindings, 'macro ' + m.name);
});

/* Upsert the &bt_hop_N macros. */
d.macros = d.macros || [];
for (var n = 0; n < PROFILES; n++) {
  var mac = {
    name: '&bt_hop_' + n,
    description: 'BT profile ' + n + ', mouse follows — taps Ctrl+Shift+' + fkeyOf(n) +
      ' so the machine being left pushes the MX Master to the same host, then hops',
    waitMs: WAIT_MS,
    tapMs: TAP_MS,
    bindings: [
      hotkeyBinding(n),
      { value: '&out', params: [{ value: 'OUT_BLE' }] },
      { value: '&bt', params: [{ value: 'BT_SEL' }, { value: n }] }
    ],
    params: []
  };
  var at = d.macros.map(function (m) { return m.name; }).indexOf(mac.name);
  log.push((at < 0 ? 'add    ' : 'update ') + mac.name + '  = Ctrl+Shift+' +
    fkeyOf(n) + ' … ' + WAIT_MS + 'ms … OUT_BLE, BT_SEL ' + n);
  if (at < 0) d.macros.push(mac); else d.macros[at] = mac;
}

/* Swap every &bt_N key over. */
var swapped = 0;
d.layers.forEach(function (layer, li) {
  layer.forEach(function (b, ki) {
    var m = b && /^&bt_([0-3])$/.exec(b.value);
    if (!m) return;
    layer[ki] = { value: '&bt_hop_' + m[1] };
    swapped++;
    log.push('swap   ' + (d.layer_names[li] || li) + ' pos ' + ki +
      '  &bt_' + m[1] + ' -> &bt_hop_' + m[1]);
  });
});
if (!swapped) fail('no &bt_N keys found — nothing to hop.');
if (swapped !== PROFILES) log.push('note   expected ' + PROFILES + ' BT keys, swapped ' + swapped);

// -----------------------------------------------------------------------

var out = JSON.stringify(d, null, 2) + '\n';
var check = Parse.parseAuto(out, { title: 'edited' });
if (check.error) fail('result does not parse: ' + check.error);
if (check.ok === false) {
  console.error('ABORT: result fails validation:');
  check.errors.forEach(function (e) { console.error('  ' + e); });
  process.exit(1);
}

fs.writeFileSync(OUT, out);
log.forEach(function (l) { console.log('  ' + l); });
console.log('\nwrote ' + OUT + '  (' + check.layers.length + ' layers, validates clean)');
