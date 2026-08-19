#!/usr/bin/env node
/*
 * Move the verb row off F21-F24, which macOS cannot see.
 *
 *   node tools/edits/wm-shift-verbs.js IN.json OUT.json
 *
 * F21-F24 exist in the USB HID spec and Windows handles them, but Carbon never
 * assigned them virtual keycodes, so no macOS app can bind them — confirmed by
 * testing, after a first round of research said the ceiling was folklore and a
 * second round said it wasn't. It is real.
 *
 * The fix keeps every position exactly where it is and changes only what the
 * caps emit:
 *
 *   travel   F13      F14      F15      F16
 *   tile     F17      F18      F19      F20
 *   verbs    LS(F13)  LS(F14)  LS(F15)  LS(F16)      <- was F21-F24
 *
 * Shift because it is inert here: an F-key produces no text, so shifting one
 * has no side effect to collide with, and both Rectangle and PowerToys bind
 * modified F-keys without complaint. The whole set now lives inside F13-F20,
 * which every OS agrees about.
 *
 * "Verbs are the travel row plus Shift" is also the easiest thing to remember
 * when you are staring at a shortcut recorder.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var IN = process.argv[2];
var OUT = process.argv[3];
if (!IN || !OUT) {
  console.error('usage: node tools/edits/wm-shift-verbs.js IN.json OUT.json');
  process.exit(1);
}

var ROOT = path.resolve(__dirname, '../..');
var Parse = require(path.join(ROOT, 'js/parse.js'));

var d = JSON.parse(fs.readFileSync(IN, 'utf8'));
var log = [];

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

/** `&kp LS(F13)` — a modified keycode is a param carrying its own param. */
function shifted(key) {
  return { value: '&kp', params: [{ value: 'LS', params: [{ value: key }] }] };
}

var WM = d.layer_names.indexOf('WM_practice');
if (WM < 0) fail('no layer named WM_practice.');

// Verb row, both hands, in left-to-right order on each.
var VERBS = [
  { pos: 43, was: 'F21', now: 'F13' }, { pos: 44, was: 'F22', now: 'F14' },
  { pos: 45, was: 'F23', now: 'F15' }, { pos: 46, was: 'F24', now: 'F16' },
  { pos: 37, was: 'F21', now: 'F13' }, { pos: 38, was: 'F22', now: 'F14' },
  { pos: 39, was: 'F23', now: 'F15' }, { pos: 40, was: 'F24', now: 'F16' }
];

VERBS.forEach(function (v) {
  var cur = d.layers[WM][v.pos];
  if (!cur || cur.value !== '&kp' || !cur.params[0] || cur.params[0].value !== v.was) {
    fail('WM_practice #' + v.pos + ' is not `&kp ' + v.was + '` — refusing to rewrite it.');
  }
  d.layers[WM][v.pos] = shifted(v.now);
});
log.push('verb row (8 positions) F21-F24 -> LS(F13)-LS(F16)');

// Nothing should still emit an F2x that macOS can't see.
var stranded = [];
d.layers.forEach(function (layer, li) {
  layer.forEach(function (b, i) {
    if (b && b.value === '&kp' && b.params[0] && /^F2[1-4]$/.test(b.params[0].value)) {
      stranded.push(d.layer_names[li] + ' #' + i + ' ' + b.params[0].value);
    }
  });
});
if (stranded.length) fail('still bound to unusable F-keys:\n       ' + stranded.join('\n       '));
log.push('no F21-F24 left anywhere in the layout');

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
