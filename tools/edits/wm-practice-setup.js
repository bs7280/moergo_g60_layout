#!/usr/bin/env node
/*
 * One edit pass against a Go60 layout export.
 *
 *   node tools/edits/wm-practice-setup.js IN.json OUT.json
 *
 * Kept in the repo rather than run ad-hoc so the change is reviewable, and
 * re-runnable against a fresh export if you edit in the browser first.
 * Writes a new file; never touches the input. Run tools/diff.js afterwards.
 *
 * What it does:
 *
 *   1. capslock combo — add HRM_WinLinx to its layer list. It was registered
 *      on macOS + Autoshift only, so it silently did nothing on Windows.
 *   2. thumb hold-taps — add require-prior-idle-ms 100 to space_v3_TKZ and
 *      thumb_v2_TKZ. They were the only two hold-taps in the layout with no
 *      idle guard, and the only two on `balanced` flavor, which is the
 *      combination that eats keystrokes during rolls.
 *   3. HRM_WinLinx right pinky — LGUI -> RGUI. Every other right-hand mod in
 *      the layout uses the R variant; this one was the odd one out.
 *   4. WM_practice layer — bind F13-F24 across the three action rows, a layer
 *      toggle on the left thumb, and a panic exit.
 *   5. WM entry — a positional hold-tap on G, on both base layers, plus a
 *      deliberate `&to` entry on the Magic layer.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var IN = process.argv[2];
var OUT = process.argv[3];
if (!IN || !OUT) {
  console.error('usage: node tools/edits/wm-practice-setup.js IN.json OUT.json');
  process.exit(1);
}

var ROOT = path.resolve(__dirname, '../..');
var Parse = require(path.join(ROOT, 'js/parse.js'));

var d = JSON.parse(fs.readFileSync(IN, 'utf8'));
var log = [];

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

// Bindings are {value, params:[{value}]}; numbers stay numbers.
function b(value, params) {
  return { value: value, params: (params || []).map(function (p) { return { value: p }; }) };
}

// ---------------------------------------------------------------- preflight

var WM = d.layer_names.indexOf('WM_practice');
if (WM < 0) fail('no layer named WM_practice — create it in the editor first.');
if (WM !== d.layers.length - 1) {
  fail('WM_practice is at index ' + WM + ', not last. Layer references are numeric; ' +
       'this script assumes it was appended.');
}
var MACOS = d.layer_names.indexOf('HRM_macOS');
var WIN = d.layer_names.indexOf('HRM_WinLinx');
var MAGIC = d.layer_names.indexOf('Magic');
if (MACOS < 0 || WIN < 0 || MAGIC < 0) fail('expected HRM_macOS, HRM_WinLinx and Magic layers.');

// ------------------------------------------------------- 1. capslock combo

var caps = d.combos.filter(function (c) { return /caps/i.test(c.name); })[0];
if (!caps) fail('no capslock combo found.');
if (caps.layers.indexOf(WIN) < 0) {
  caps.layers = caps.layers.concat([WIN]).sort(function (x, y) { return x - y; });
  log.push('capslock combo -> layers ' + JSON.stringify(caps.layers));
}

// -------------------------------------------------- 2. thumb hold-tap guard

['&space_v3_TKZ', '&thumb_v2_TKZ'].forEach(function (name) {
  var h = d.holdTaps.filter(function (x) { return x.name === name; })[0];
  if (!h) fail('hold-tap ' + name + ' not found.');
  if (h.requirePriorIdleMs == null) {
    h.requirePriorIdleMs = 100;
    log.push(name + ' -> requirePriorIdleMs 100');
  }
});

// ------------------------------------------------ 3. WinLinx right pinky mod

var RP = 34;
var cur = d.layers[WIN][RP];
if (cur && cur.value === '&HRM_right_pinky_v1_TKZ' && cur.params[0].value === 'LGUI') {
  cur.params[0].value = 'RGUI';
  log.push('HRM_WinLinx #34 right pinky -> RGUI (was LGUI)');
}

// ------------------------------------------------------ 4. WM_practice layer

// Right hand, three rows. Tile row is left/up/down/right to match the Cursor
// layers' existing arrows on these same positions — not vim order.
var ACTIONS = [
  [19, 'F13'], [20, 'F14'], [21, 'F15'], [22, 'F16'],   // travel: mon← desk← desk→ mon→
  [31, 'F17'], [32, 'F18'], [33, 'F19'], [34, 'F20'],   // tile:   ←  ↑  ↓  →
  [43, 'F21'], [44, 'F22'], [45, 'F23'], [46, 'F24']    // verbs:  full center min restore
];
/*
 * CORRECTION to the design doc: `&tog` here is an EXIT, not a latch.
 *
 * The doc says "while the left index holds G, the left thumb is idle; tapping
 * it latches the layer." ZMK can't do that. `zmk_keymap_layer_toggle` is a
 * plain bitmask test with no refcount — holding G already set layer 14 active,
 * so `&tog 14` sees it active and DEACTIVATES it, and then releasing G calls
 * deactivate again. You end up on the base layer mid-hold.
 *
 * A toggle can only latch a layer that is currently off, so the way in has to
 * be reachable without holding the layer: that's the `&to WM` on the Magic
 * layer at the bottom of this file. Enter latched from there, and #56 is how
 * you get back out.
 */
var TOGGLE_POS = 56;   // left thumb, outer end — unlatch (see above)
var PANIC_POS = 0;     // far top-left corner

ACTIONS.forEach(function (a) {
  d.layers[WM][a[0]] = b('&kp', [a[1]]);
});
d.layers[WM][TOGGLE_POS] = b('&tog', [WM]);
d.layers[WM][PANIC_POS] = b('&to', [MACOS]);
log.push('WM_practice: F13-F24 on 12 positions, &tog on #' + TOGGLE_POS + ', &to base on #' + PANIC_POS);

// ------------------------------------------------------------- 5. entrypoint

/*
 * Positional hold-tap. `holdTriggerKeyPositions` is the real misfire guard:
 * holding G only reaches the layer if the *next* key is one of the WM keys.
 * Press anything else and it resolves as a plain `g`, so "bag" and "right"
 * cannot activate it no matter how slowly they're typed. That's stronger than
 * timing alone, and it's the same mechanism the home-row mods already use.
 */
var HT_NAME = '&WM_hold_v1';
var triggers = ACTIONS.map(function (a) { return a[0]; }).concat([TOGGLE_POS, PANIC_POS]);
if (!d.holdTaps.some(function (h) { return h.name === HT_NAME; })) {
  d.holdTaps.push({
    name: HT_NAME,
    description: 'WM practice layer entry on G. Positional: only the WM keys can ' +
      'trigger the hold, so ordinary words containing g resolve as a tap.',
    bindings: ['&mo', '&kp'],
    tappingTermMs: 250,
    flavor: 'hold-preferred',
    quickTapMs: 300,
    requirePriorIdleMs: 150,
    holdTriggerOnRelease: false,
    holdTriggerKeyPositions: triggers
  });
  log.push(HT_NAME + ' added (250ms, idle 150, hold-preferred, ' + triggers.length + ' trigger positions)');
}

var G_POS = 29;
[MACOS, WIN].forEach(function (li) {
  var g = d.layers[li][G_POS];
  if (!g || g.value !== '&kp' || g.params[0].value !== 'G') {
    fail('layer ' + li + ' position ' + G_POS + ' is not a plain `&kp G` — refusing to overwrite it.');
  }
  d.layers[li][G_POS] = b(HT_NAME, [WM, 'G']);
});
log.push('G (#29) -> ' + HT_NAME + ' ' + WM + ' G on both base layers');

// A way in that does not depend on the hold-tap behaving.
var MAGIC_ENTRY = 30;
if (d.layers[MAGIC][MAGIC_ENTRY].value === '&none') {
  d.layers[MAGIC][MAGIC_ENTRY] = b('&to', [WM]);
  log.push('Magic #' + MAGIC_ENTRY + ' -> &to WM_practice');
}

// ------------------------------------------------------------------- write

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
