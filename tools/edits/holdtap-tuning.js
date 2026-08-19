#!/usr/bin/env node
/*
 * Settle the home-row hold-taps: the HRMs and the two WM layer-taps.
 *
 *   node tools/edits/holdtap-tuning.js IN.json OUT.json
 *
 * (Thumbs live in thumb-timing.js — different keys, different trade-off.)
 *
 * ------------------------------------------------------------------- FLAVOUR
 *
 * Every hold-tap TailorKey ships is `tap-preferred`: only the tapping term can
 * trigger a hold, so no amount of fast rolling can turn a letter into a
 * modifier. `&WM_hold_v1` and `&WM_hold_H_v1` were added as `hold-preferred`,
 * which triggers the hold the instant any trigger key is pressed. That was a
 * deliberate call for snappiness — and it made them the only two keys on the
 * board that could fire from a roll. On a home row. Next to eight keys that
 * can't.
 *
 * Consistency wins here: matching the convention costs a deliberate hold and
 * removes a whole class of misfire.
 *
 * The positional guard still earns its keep under tap-preferred — pressing a
 * key outside the trigger list resolves the tap immediately instead of waiting
 * out the term, so ordinary words stay fast.
 *
 * ---------------------------------------------------------------- IDLE FLOOR
 *
 * The HRM idle guards read 150, 150, 150, 100 across pinky/ring/middle/index —
 * both hands. The index finger is the fastest and the most rolled-through, so
 * it is the one position that least deserves the weakest guard. Treating that
 * as an oversight rather than a design and levelling it up to the floor.
 *
 * The tapping-term gradient (280/240/210/190 by finger) is NOT touched. That
 * one is clearly deliberate: slower fingers get longer terms.
 */
'use strict';

var fs = require('fs');
var path = require('path');

// ------------------------------------------------------------------- knobs

var FLAVOR     = 'tap-preferred';                        // for the WM layer-taps
var WM_TAPS    = ['&WM_hold_v1', '&WM_hold_H_v1'];
var IDLE_FLOOR = 150;                                    // no HRM below this

// -----------------------------------------------------------------------

var IN = process.argv[2];
var OUT = process.argv[3];
if (!IN || !OUT) {
  console.error('usage: node tools/edits/holdtap-tuning.js IN.json OUT.json');
  process.exit(1);
}

var ROOT = path.resolve(__dirname, '../..');
var Parse = require(path.join(ROOT, 'js/parse.js'));

var d = JSON.parse(fs.readFileSync(IN, 'utf8'));
var log = [];

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

WM_TAPS.forEach(function (name) {
  var h = (d.holdTaps || []).filter(function (x) { return x.name === name; })[0];
  if (!h) fail('hold-tap ' + name + ' not found.');
  if (h.flavor === FLAVOR) { log.push(name + '  already ' + FLAVOR); return; }
  log.push(name + '  flavor ' + h.flavor + ' -> ' + FLAVOR);
  h.flavor = FLAVOR;
});

(d.holdTaps || []).forEach(function (h) {
  if (!/^&HRM_/.test(h.name)) return;
  if (h.requirePriorIdleMs == null || h.requirePriorIdleMs >= IDLE_FLOOR) return;
  log.push(h.name + '  idle ' + h.requirePriorIdleMs + ' -> ' + IDLE_FLOOR);
  h.requirePriorIdleMs = IDLE_FLOOR;
});

// Nothing on the home row should still be able to fire from a roll.
var stragglers = (d.holdTaps || []).filter(function (h) {
  return /^&(HRM_|WM_hold)/.test(h.name) && h.flavor !== 'tap-preferred';
});
if (stragglers.length) {
  fail('still not tap-preferred: ' + stragglers.map(function (h) { return h.name; }).join(', '));
}
log.push('all home-row hold-taps are tap-preferred with idle >= ' + IDLE_FLOOR);

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
