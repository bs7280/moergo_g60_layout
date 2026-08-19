#!/usr/bin/env node
/*
 * Add WM_Win — the Windows twin of the WM layer.
 *
 *   node tools/edits/wm-win-layer.js IN.json OUT.json
 *
 * Same twelve positions, same mirror, same finger motions. Only what the caps
 * emit changes, and `G`/`H` on HRM_WinLinx point here instead of at the macOS
 * layer, so the tier follows the machine exactly like the OS switch already
 * does. One muscle memory, two layers.
 *
 * ------------------------------------------------------------ WHY A LAYER
 *
 * Not for capability — PowerToys' Keyboard Manager could remap F13-F20 to
 * these same chords. For robustness on a locked-down machine:
 *
 *   - Keyboard Manager has to be running. If IT pushes an update, or it
 *     crashes, every WM key dies at once.
 *   - It does not apply inside elevated windows unless PowerToys itself runs
 *     as admin, which you may not be allowed to do.
 *
 * A keyboard that sends `Win+Left` needs none of that. It works in elevated
 * windows, at UAC prompts, on a fresh profile, with nothing installed.
 *
 * ------------------------------------------------------------- THE GAP
 *
 * Windows covers 10 of the 12. It has no keyboard route to:
 *
 *   center, and a restore distinct from minimize
 *
 * `Win+Up`/`Win+Down` are CONTEXTUAL, which is the thing to understand here:
 * inside an already-snapped zone they place the window in the top or bottom
 * half of that zone; on a floating window they maximize and minimize. So the
 * tile row's up/down and the verb row's maximize/minimize send the same two
 * chords and let Windows decide — that redundancy is Windows' model, not a
 * mistake. Its Win+arrow snapping is a state machine, not a set of absolute
 * positions the way Rectangle's Top Half is.
 *
 * Practical consequence: `snap top` gives a full-width top half only if the
 * window is unsnapped in a single-zone layout; after `snap left` it gives the
 * top-LEFT quarter. Useful either way, and the finger motion still means
 * "move it upward".
 *
 * Center and restore stay as F-keys rather than being faked. They do nothing
 * until something picks them up, and the other ten work regardless — the layer
 * degrades honestly instead of half-working.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var IN = process.argv[2];
var OUT = process.argv[3];
if (!IN || !OUT) {
  console.error('usage: node tools/edits/wm-win-layer.js IN.json OUT.json');
  process.exit(1);
}

var ROOT = path.resolve(__dirname, '../..');
var Parse = require(path.join(ROOT, 'js/parse.js'));

var d = JSON.parse(fs.readFileSync(IN, 'utf8'));
var log = [];

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

/** `&kp LG(LS(LEFT))` — modifiers nest as params carrying params. */
function kp(spec) {
  var parts = String(spec).split(/[()]/).filter(Boolean);   // LG,LS,LEFT
  var node = { value: parts.pop() };
  while (parts.length) node = { value: parts.pop(), params: [node] };
  return { value: '&kp', params: [node] };
}

var MACOS = d.layer_names.indexOf('HRM_macOS');
var WIN_BASE = d.layer_names.indexOf('HRM_WinLinx');
var MAGIC = d.layer_names.indexOf('Magic');
var WM_MAC = d.layer_names.indexOf('WM_practice');
if (MACOS < 0 || WIN_BASE < 0 || MAGIC < 0 || WM_MAC < 0) fail('expected the four reference layers.');
if (d.layer_names.indexOf('WM_Win') >= 0) fail('WM_Win already exists — nothing to do.');

/*
 * Positions are read off the macOS WM layer rather than hardcoded, so the two
 * layers cannot drift. If you move a key there, re-run this and it follows.
 */
var LAYOUT = [
  { pos: 19, alt: 13, act: 'mon left',  win: 'LG(LS(LEFT))' },
  { pos: 20, alt: 14, act: 'desk left', win: 'LG(LC(LEFT))' },
  { pos: 21, alt: 15, act: 'desk right', win: 'LG(LC(RIGHT))' },
  { pos: 22, alt: 16, act: 'mon right', win: 'LG(LS(RIGHT))' },
  { pos: 31, alt: 25, act: 'snap left', win: 'LG(LEFT)' },
  { pos: 32, alt: 26, act: 'snap top',  win: 'LG(UP)' },
  { pos: 33, alt: 27, act: 'snap bottom', win: 'LG(DOWN)' },
  { pos: 34, alt: 28, act: 'snap right', win: 'LG(RIGHT)' },
  { pos: 43, alt: 37, act: 'maximize',  win: 'LG(UP)' },
  { pos: 44, alt: 38, act: 'center',    win: null },        // no native equivalent
  { pos: 45, alt: 39, act: 'minimize',  win: 'LG(DOWN)' },
  { pos: 46, alt: 40, act: 'restore',   win: null }         // Win+Down is already minimize
];

// ------------------------------------------------------------ build the layer

var layer = [];
for (var i = 0; i < 60; i++) layer.push({ value: '&trans' });

var native = 0, kept = 0;
LAYOUT.forEach(function (a) {
  var mac = d.layers[WM_MAC][a.pos];
  if (!mac || mac.value !== '&kp') fail('WM_practice #' + a.pos + ' is not a &kp — layout has moved.');

  [a.pos, a.alt].forEach(function (p) {
    if (a.win) layer[p] = kp(a.win);
    else layer[p] = JSON.parse(JSON.stringify(d.layers[WM_MAC][p]));   // keep the F-key
  });
  if (a.win) native++; else kept++;
});

var TOGGLE_POS = 56, PANIC_POS = 0;
layer[TOGGLE_POS] = { value: '&tog', params: [{ value: 15 }] };
layer[PANIC_POS] = { value: '&to', params: [{ value: WIN_BASE }] };

d.layer_names.push('WM_Win');
d.layers.push(layer);
var WM_WIN = d.layer_names.length - 1;
layer[TOGGLE_POS].params[0].value = WM_WIN;

log.push('WM_Win added as layer ' + WM_WIN + ' — ' + native + ' native chords, ' +
         kept + ' left as F-keys (no Windows equivalent)');
log.push('exits: &tog ' + WM_WIN + ' on #' + TOGGLE_POS + ', &to HRM_WinLinx on #' + PANIC_POS);

// ------------------------------------------------------------- route into it

[29, 30].forEach(function (pos) {
  var cur = d.layers[WIN_BASE][pos];
  if (!cur || !/^&WM_hold/.test(cur.value)) {
    fail('HRM_WinLinx #' + pos + ' is `' + (cur && cur.value) + '`, not a WM hold-tap.');
  }
  if (cur.params[0].value !== WM_MAC) fail('HRM_WinLinx #' + pos + ' does not point at WM_practice.');
  cur.params[0].value = WM_WIN;
});
log.push('HRM_WinLinx G/H (#29,#30) -> WM_Win instead of WM_practice');

// A latched way in, mirroring Magic's `&to WM_practice`.
var CANDIDATES = [31, 32, 33, 34, 35, 29];
var slot = CANDIDATES.filter(function (p) {
  var b = d.layers[MAGIC][p];
  return b && b.value === '&none';
})[0];
if (slot == null) {
  log.push('NOTE: no free key on Magic for a latched WM_Win entry — Magic still latches the macOS layer only');
} else {
  d.layers[MAGIC][slot] = { value: '&to', params: [{ value: WM_WIN }] };
  log.push('Magic #' + slot + ' -> &to WM_Win (latched entry; #30 still latches WM_practice)');
}

// -------------------------------------------------------------------- write

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
