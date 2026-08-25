#!/usr/bin/env node
/*
 * Rebuild WM_Win (the Windows WM layer) from data/wm-actions.js — v2,
 * targeting the proven Python daemon (RegisterHotKey, F13-F24 + modifiers)
 * instead of native Win+arrow snapping.
 *
 *   node tools/edits/wm-redesign-win.js IN.json OUT.json
 *
 * Same rebuild-in-place approach as tools/edits/wm-redesign-mac.js (see
 * that file for why appending isn't needed here, unlike the old
 * wm-win-layer.js this replaces). Binds ALL 41 actions in
 * data/wm-actions.js, not just the 27 shared with macOS — Windows also
 * owns the 14 workspace actions (F21-F24, which don't exist on macOS at
 * all, so there's no cross-OS collision to negotiate).
 *
 * Emission per action: `a.winKey` if the action's Windows behavior
 * genuinely differs from macOS (native Win+chord for place-halves,
 * minimize/restore — 6 actions), otherwise the same `a.key` macOS emits.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var IN = process.argv[2];
var OUT = process.argv[3];
if (!IN || !OUT) {
  console.error('usage: node tools/edits/wm-redesign-win.js IN.json OUT.json');
  process.exit(1);
}

var ROOT = path.resolve(__dirname, '../..');
var Parse = require(path.join(ROOT, 'js/parse.js'));
var ACTIONS = require(path.join(ROOT, 'data/wm-actions.js')).G80_WM_ACTIONS;

var d = JSON.parse(fs.readFileSync(IN, 'utf8'));
var log = [];

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

/** `&kp LG(LEFT)` / `&kp LC(F17)` — modifiers nest as params carrying params. */
function kp(spec) {
  var parts = String(spec).split(/[()]/).filter(Boolean);
  var node = { value: parts.pop() };
  while (parts.length) node = { value: parts.pop(), params: [node] };
  return { value: '&kp', params: [node] };
}

var WIN_BASE = d.layer_names.indexOf('HRM_WinLinx');
var WM_WIN = d.layer_names.indexOf('WM_Win');
if (WIN_BASE < 0 || WM_WIN < 0) fail('expected HRM_WinLinx and WM_Win layers.');

// ------------------------------------------------------------ build the layer

var layer = [];
for (var i = 0; i < 60; i++) layer.push({ value: '&trans' });

var used = new Array(60).fill(false);
[0, 36, 56].forEach(function (p) { used[p] = true; });

layer[0] = { value: '&to', params: [{ value: WIN_BASE }] };
layer[56] = { value: '&tog', params: [{ value: WM_WIN }] };

var bound = 0, native = 0;
ACTIONS.forEach(function (a) {
  var chord = a.winKey || a.key;
  [a.pos, a.altPos].forEach(function (p) {
    if (p == null) return;
    if (used[p]) fail('position ' + p + ' double-bound (last: ' + a.key + ', ' + a.label + ')');
    used[p] = true;
    layer[p] = kp(chord);
    bound++;
    if (a.winKey) native++;
  });
});

d.layers[WM_WIN] = layer;

log.push('WM_Win (layer ' + WM_WIN + ') rebuilt — ' + bound + ' positions bound from data/wm-actions.js (' +
  native + ' native Win+chord, ' + (bound - native) + ' daemon F-key chords)');
log.push('fixed: #0 panic -> HRM_WinLinx, #56 toggle-exit, #36/#29/#30 left transparent');

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
