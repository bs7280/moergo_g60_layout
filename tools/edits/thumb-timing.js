#!/usr/bin/env node
/*
 * Retune the thumb hold-taps — space, enter, backspace, delete.
 *
 *   node tools/edits/thumb-timing.js IN.json OUT.json
 *
 * Edit the numbers below and re-run. Values are absolute, not increments, so
 * running it twice is the same as running it once, and you can walk them back
 * down as you get faster without unpicking anything.
 *
 * ------------------------------------------------------ WHICH DELAY IS WHICH
 *
 * There are two, they do different jobs, and only one of them is usually the
 * cause of "I keep mistyping":
 *
 *   tapping-term-ms        how long you must hold before it counts as a hold.
 *                          Raise it and a thumb you rested on too long stays a
 *                          space instead of turning into a layer.
 *
 *   require-prior-idle-ms  if you pressed ANY other key less than this long
 *                          ago, this key can only be a tap. This is the one
 *                          that protects fast typing: rolling from a letter
 *                          straight into space can no longer reach the layer,
 *                          no matter how the timing lands.
 *
 * Typing errors while learning are nearly always rolls, so require-prior-idle
 * is the higher-leverage number of the two. Raise both, but expect that one to
 * be what actually fixes it.
 *
 * The cost is symmetric and worth knowing: a longer idle guard means that when
 * you genuinely DO want the layer straight after typing, you have to pause
 * first. Too high and deliberate use starts feeling refused.
 *
 * Raising both was tried first and was not enough on its own — see FLAVOR
 * below, which is the setting that actually changed the outcome.
 */
'use strict';

var fs = require('fs');
var path = require('path');

// ------------------------------------------------------------------- knobs

var FLAVOR  = 'tap-preferred';      // was balanced
var TARGETS = {
  // Space carries a bigger idle guard than the rest — see LATENCY below.
  '&space_v3_TKZ': { term: 250, idle: 200 },
  '&thumb_v2_TKZ': { term: 250, idle: 150 }
};

/*
 * ------------------------------------------------------------------ LATENCY
 *
 * Under tap-preferred a hold-tap can't be decided on press, so ZMK queues what
 * follows until it resolves on release. Roll into the next letter with the
 * thumb still down and the whole burst stalls — which is what "space is slow
 * when I type fast" is.
 *
 * require-prior-idle-ms is the escape hatch, and it works the opposite way
 * round from what you'd expect: if the previous key was pressed inside the
 * window, the hold-tap is decided as a TAP IMMEDIATELY. No queue, no wait, no
 * possibility of a misfire. So RAISING it makes fast typing faster, because
 * more spaces get short-circuited instead of waiting on your thumb.
 *
 * It only fails to help when your inter-key gap exceeds the window — i.e. when
 * you're typing slowly, which is exactly when the latency doesn't bother you.
 *
 * Space gets 200 because it follows a letter constantly. The cost is that
 * reaching Symbol now needs a ~200ms pause before pressing space; if that
 * starts feeling refused, come down rather than up.
 */

/*
 * FLAVOR is the big lever, and it changes the rule rather than a number:
 *
 *   balanced       a hold triggers if you press AND release another key while
 *                  the thumb is down — even 20ms in. Rolling off a letter into
 *                  space can reach the layer no matter how the timing lands,
 *                  which is why raising the numbers alone didn't fix it.
 *
 *   tap-preferred  ONLY the tapping term can trigger a hold. Other keys never
 *                  do; they're emitted as themselves. Roll as fast as you like
 *                  and space stays space.
 *
 * The cost lands entirely on deliberate use: to reach a layer you must hold
 * the thumb for the full term *before* pressing anything. If that feels
 * sluggish, lower `term` — under tap-preferred that's much safer than it was
 * under balanced, because the term is no longer the only thing standing
 * between a fast roll and a misfire.
 */

// -----------------------------------------------------------------------

var IN = process.argv[2];
var OUT = process.argv[3];
if (!IN || !OUT) {
  console.error('usage: node tools/edits/thumb-timing.js IN.json OUT.json');
  process.exit(1);
}

var ROOT = path.resolve(__dirname, '../..');
var Parse = require(path.join(ROOT, 'js/parse.js'));

var d = JSON.parse(fs.readFileSync(IN, 'utf8'));
var log = [];

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

Object.keys(TARGETS).forEach(function (name) {
  var want = TARGETS[name];
  var h = (d.holdTaps || []).filter(function (x) { return x.name === name; })[0];
  if (!h) fail('hold-tap ' + name + ' not found.');

  var before = { t: h.tappingTermMs, i: h.requirePriorIdleMs, f: h.flavor };
  h.tappingTermMs = want.term;
  h.requirePriorIdleMs = want.idle;
  h.flavor = FLAVOR;

  var parts = [];
  if (before.t !== want.term) parts.push('term ' + before.t + ' -> ' + want.term);
  if (before.i !== want.idle) parts.push('idle ' + before.i + ' -> ' + want.idle);
  if (before.f !== FLAVOR) parts.push('flavor ' + before.f + ' -> ' + FLAVOR);
  log.push(name + '  ' + (parts.length ? parts.join(',  ') : 'unchanged'));
});

/*
 * quick-tap-ms is deliberately untouched. It's the window in which tapping a
 * key twice repeats the tap instead of holding — that's what lets you hold
 * backspace to delete a run of characters. Raising the other two doesn't
 * affect it, and lowering it would break key repeat.
 */

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
