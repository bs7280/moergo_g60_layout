#!/usr/bin/env node
/*
 * Make the Typing layer actually free of home-row hold-taps.
 *
 *   node tools/edits/typing-layer-plain.js IN.json OUT.json
 *
 * The Typing layer's whole job is turning the home-row mods off, and it does
 * that by binding A-S-D-F / J-K-L-; as plain keys and leaving the rest &trans.
 * Anything it leaves transparent falls through to the base layer — so the
 * moment we made G and H into WM layer-taps, two live hold-taps appeared in
 * the middle of the layer that exists to not have any.
 *
 * Rather than hardcode G and H, this derives the fix: walk the base layer's
 * home row, find every position whose binding is a hold-tap, and make sure the
 * Typing layer binds that key's TAP behaviour outright. Add another home-row
 * hold-tap later and re-running this catches it too.
 *
 * Thumbs are deliberately out of scope. Those hold-taps are how you reach
 * Symbol, Cursor and the rest; a Typing layer without them couldn't type a
 * bracket. It's the home row that needs to be inert, not the whole board.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '../..');
var Parse = require(path.join(ROOT, 'js/parse.js'));

var IN = process.argv[2];
var OUT = process.argv[3];
if (!IN || !OUT) {
  console.error('usage: node tools/edits/typing-layer-plain.js IN.json OUT.json');
  process.exit(1);
}

var HOME_ROW = [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35];

var d = JSON.parse(fs.readFileSync(IN, 'utf8'));
var log = [];

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

var TYPING = d.layer_names.indexOf('Typing');
var BASE = d.layer_names.indexOf('HRM_macOS');
if (TYPING < 0 || BASE < 0) fail('expected Typing and HRM_macOS layers.');

var holdTaps = {};
(d.holdTaps || []).forEach(function (h) { holdTaps[h.name] = h; });

var added = 0, already = 0;

HOME_ROW.forEach(function (pos) {
  var base = d.layers[BASE][pos];
  if (!base) return;
  var ht = holdTaps[base.value] || holdTaps[String(base.value).replace(/^&/, '')];
  if (!ht) return;                                   // not a hold-tap; nothing to neutralise

  /*
   * Hold-tap params are positional: params[0] feeds bindings[0] (the hold),
   * params[1] feeds bindings[1] (the tap). So the tap is bindings[1] applied
   * to params[1] — `&HRM_left_pinky LCTRL A` taps `&kp A`, and
   * `&WM_hold_v1 14 G` taps `&kp G`.
   */
  var tapBehavior = (ht.bindings || [])[1];
  var tapParam = (base.params || [])[1];
  if (!tapBehavior || !tapParam) {
    fail('#' + pos + ' uses ' + base.value + ', whose tap side cannot be read — ' +
         'refusing to guess what it should type.');
  }

  var want = { value: tapBehavior, params: [{ value: tapParam.value }] };
  var cur = d.layers[TYPING][pos];

  if (cur && cur.value === want.value && cur.params && cur.params[0] &&
      cur.params[0].value === want.params[0].value) {
    already++;
    return;
  }
  if (cur && cur.value !== '&trans') {
    fail('Typing #' + pos + ' is `' + cur.value + '`, not &trans and not the plain key — ' +
         'refusing to overwrite a deliberate binding.');
  }

  d.layers[TYPING][pos] = want;
  log.push('Typing #' + pos + '  ' + base.value + ' ' +
    (base.params || []).map(function (p) { return p.value; }).join(' ') +
    '  ->  ' + tapBehavior + ' ' + tapParam.value);
  added++;
});

if (!added) log.push('nothing to do — every home-row hold-tap is already neutralised');
log.push(already + ' already plain, ' + added + ' fixed');

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
