#!/usr/bin/env node
/*
 * Rebuild WM_practice (the macOS WM layer) from data/wm-actions.js — v2,
 * the richer catalog described there (focus-direction, swap, cycle,
 * resize, extra placement regions, minimize/restore; no workspaces).
 *
 *   node tools/edits/wm-redesign-mac.js IN.json OUT.json
 *
 * Unlike tools/edits/wm-win-layer.js (which APPENDED a new layer),
 * this REBUILDS an existing layer's content in place — WM_practice already
 * exists at a known index, and every reference to it (`&WM_hold_v1 14 G`,
 * Magic's `&to 14`, WM_Win's panic key) is numeric, so overwriting the
 * layer array without touching `layer_names`/`layers` length is safe and
 * everything upstream keeps working unmodified.
 *
 * data/wm-actions.js is the single source of truth for position/chord —
 * this script does not hardcode a second copy of the table. Every action
 * with `os !== 'win'` gets bound here via its `key` (the mac/F-key-pattern
 * emission); win-only workspace actions are skipped entirely.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var IN = process.argv[2];
var OUT = process.argv[3];
if (!IN || !OUT) {
  console.error('usage: node tools/edits/wm-redesign-mac.js IN.json OUT.json');
  process.exit(1);
}

var ROOT = path.resolve(__dirname, '../..');
var Parse = require(path.join(ROOT, 'js/parse.js'));
var ACTIONS = require(path.join(ROOT, 'data/wm-actions.js')).G80_WM_ACTIONS;

var d = JSON.parse(fs.readFileSync(IN, 'utf8'));
var log = [];

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

/** `&kp LC(LS(F17))` — modifiers nest as params carrying params. */
function kp(spec) {
  var parts = String(spec).split(/[()]/).filter(Boolean);
  var node = { value: parts.pop() };
  while (parts.length) node = { value: parts.pop(), params: [node] };
  return { value: '&kp', params: [node] };
}

var MACOS = d.layer_names.indexOf('HRM_macOS');
var WM_MAC = d.layer_names.indexOf('WM_practice');
if (MACOS < 0 || WM_MAC < 0) fail('expected HRM_macOS and WM_practice layers.');

// ------------------------------------------------------------ build the layer

var layer = [];
for (var i = 0; i < 60; i++) layer.push({ value: '&trans' });

var used = new Array(60).fill(false);
var FIXED = { 0: '&to(' + MACOS + ')', 29: 'G hold-tap trigger', 30: 'H hold-tap trigger', 36: 'Magic fallthrough', 56: '&tog(' + WM_MAC + ')' };
Object.keys(FIXED).forEach(function (p) { used[+p] = true; });

layer[0] = { value: '&to', params: [{ value: MACOS }] };
layer[56] = { value: '&tog', params: [{ value: WM_MAC }] };

var bound = 0;
ACTIONS.forEach(function (a) {
  if (a.os === 'win') return;   // workspace actions don't exist on macOS
  [a.pos, a.altPos].forEach(function (p) {
    if (p == null) return;
    if (used[p]) fail('position ' + p + ' double-bound (last: ' + a.key + ', ' + a.label + ')');
    used[p] = true;
    layer[p] = kp(a.key);
    bound++;
  });
});

d.layers[WM_MAC] = layer;

log.push('WM_practice (layer ' + WM_MAC + ') rebuilt — ' + bound + ' positions bound from data/wm-actions.js');
log.push('fixed: #0 panic -> HRM_macOS, #56 toggle-exit, #29/#30/#36 left transparent');

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
