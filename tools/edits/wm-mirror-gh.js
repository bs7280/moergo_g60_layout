#!/usr/bin/env node
/*
 * Mirror the WM practice layer onto the left hand, with `H` as a second
 * entrypoint.
 *
 *   node tools/edits/wm-mirror-gh.js IN.json OUT.json
 *
 * Why: holding `G` (left index) frees the right hand, so the actions live on
 * the right. Holding `H` (right index) frees the left hand — same actions,
 * left-hand copy. Either hand can drive; the other one holds. Writes a new
 * file; never touches the input. Run tools/diff.js afterwards.
 *
 * ------------------------------------------------------------------ LAYOUT
 *
 * SPATIAL, not finger-mirrored. The four tile keys read ← ↑ ↓ → left-to-right
 * on BOTH hands:
 *
 *   right (hold H)   J  K  L  ;      31 32 33 34      ←  ↑  ↓  →
 *   left  (hold G)   A  S  D  F      25 26 27 28      ←  ↑  ↓  →
 *
 * A true finger-mirror (left index = ←, matching right index = ←) would make
 * the left hand read → ↓ ↑ ← from A to F, so the leftmost key would move a
 * window right. That breaks the one-spatial-map principle this layer exists to
 * uphold — see the long comment in data/wm-actions.js. Flip MODE to 'finger'
 * if you'd rather train same-finger and accept the reversal.
 *
 * Note the Cursor layer is NOT a precedent either way: its left hand is
 * modifiers (LGUI/LALT/LCTRL/LSHFT) plus two select macros, and the arrows
 * exist only on 31-34. There was nothing to copy.
 *
 * ------------------------------------------------------------- MISFIRE RISK
 *
 * `H` is riskier than `G` and the idle guard is set higher to compensate.
 *
 * The positional guard only blocks a hold when the NEXT key is outside the
 * trigger set. H's trigger set is the left hand, which contains `A` and `E` —
 * so "have", "has", "he", "her", "help" are all h-followed-by-a-trigger. The
 * only thing standing between you and a misfire is require-prior-idle-ms, and
 * sentence-initial "He" / "Have" follows exactly the kind of pause that
 * defeats a 150ms guard.
 *
 * So H gets 250ms. Entering the WM layer is a deliberate act — you stop typing
 * to rearrange windows — so a longer pause costs nothing and kills the common
 * case. G keeps 150ms: its triggers are the right hand, so "ge/ga/gr" are all
 * safe and only "go/give/glad/guess" are exposed.
 *
 * If G does start misfiring on "go", raise IDLE_G here rather than inventing a
 * new mechanism.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var IN = process.argv[2];
var OUT = process.argv[3];
if (!IN || !OUT) {
  console.error('usage: node tools/edits/wm-mirror-gh.js IN.json OUT.json');
  process.exit(1);
}

var ROOT = path.resolve(__dirname, '../..');
var Parse = require(path.join(ROOT, 'js/parse.js'));

var MODE = 'spatial';   // 'spatial' | 'finger'
var IDLE_H = 250;       // require-prior-idle-ms for the H entrypoint
var H_POS = 30;
var HT_NAME = '&WM_hold_H_v1';

var d = JSON.parse(fs.readFileSync(IN, 'utf8'));
var log = [];

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

function b(value, params) {
  return { value: value, params: (params || []).map(function (p) { return { value: p }; }) };
}

// ---------------------------------------------------------------- preflight

var WM = d.layer_names.indexOf('WM_practice');
if (WM < 0) fail('no layer named WM_practice — run wm-practice-setup.js first.');
var MACOS = d.layer_names.indexOf('HRM_macOS');
var WIN = d.layer_names.indexOf('HRM_WinLinx');
if (MACOS < 0 || WIN < 0) fail('expected HRM_macOS and HRM_WinLinx layers.');

var G_HT = d.holdTaps.filter(function (h) { return h.name === '&WM_hold_v1'; })[0];
if (!G_HT) fail('&WM_hold_v1 not found — this script extends that setup, it does not replace it.');

/*
 * Rows are 12 wide, split 6 per hand, so the left-hand mirror of a right-hand
 * position is (rowStart + 11 - pos). Derived rather than hardcoded so a
 * position-map slip can't silently put a key on the wrong finger.
 */
function mirrorOf(pos) {
  var rowStart = Math.floor(pos / 12) * 12;
  var m = rowStart + 11 - (pos - rowStart);
  if (m < 0 || m > 59) fail('mirror of ' + pos + ' is off-board (' + m + ')');
  return m;
}

// Right-hand action rows, in left-to-right order, as bound by wm-practice-setup.
var ROWS = [
  { group: 'travel', pos: [19, 20, 21, 22], keys: ['F13', 'F14', 'F15', 'F16'] },
  { group: 'tile',   pos: [31, 32, 33, 34], keys: ['F17', 'F18', 'F19', 'F20'] },
  { group: 'verb',   pos: [43, 44, 45, 46], keys: ['F21', 'F22', 'F23', 'F24'] }
];

// Confirm the right hand is actually bound the way we think before mirroring it.
ROWS.forEach(function (r) {
  r.pos.forEach(function (p, i) {
    var cur = d.layers[WM][p];
    if (!cur || cur.value !== '&kp' || cur.params[0].value !== r.keys[i]) {
      fail('WM_practice #' + p + ' is not `&kp ' + r.keys[i] + '` — refusing to mirror a layer ' +
           'that does not match the expected arrangement.');
    }
  });
});

// ------------------------------------------------------- 1. left-hand copy

var leftPositions = [];

ROWS.forEach(function (r) {
  // Mirrored positions, still in left-to-right order (mirrorOf reverses them).
  var dest = r.pos.map(mirrorOf).sort(function (x, y) { return x - y; });
  var keys = MODE === 'finger' ? r.keys.slice().reverse() : r.keys;

  dest.forEach(function (p, i) {
    var cur = d.layers[WM][p];
    if (cur && cur.value !== '&trans') {
      fail('WM_practice #' + p + ' is `' + cur.value + '`, not `&trans` — refusing to overwrite.');
    }
    d.layers[WM][p] = b('&kp', [keys[i]]);
    leftPositions.push(p);
  });
  log.push(r.group + ': ' + dest.join(',') + ' -> ' + keys.join(',') + '  (' + MODE + ')');
});

// ------------------------------------------------------- 2. H entrypoint

var TOGGLE_POS = 56;
var PANIC_POS = 0;
var triggers = leftPositions.concat([TOGGLE_POS, PANIC_POS]).sort(function (x, y) { return x - y; });

if (!d.holdTaps.some(function (h) { return h.name === HT_NAME; })) {
  d.holdTaps.push({
    name: HT_NAME,
    description: 'WM practice layer entry on H, mirroring the G entry. Positional: only the ' +
      'LEFT-hand WM keys can trigger the hold. Higher idle guard than G because H is followed ' +
      'by a trigger key in "have"/"he"/"has", which G is not.',
    bindings: ['&mo', '&kp'],
    tappingTermMs: G_HT.tappingTermMs,
    flavor: G_HT.flavor,
    quickTapMs: G_HT.quickTapMs,
    requirePriorIdleMs: IDLE_H,
    holdTriggerOnRelease: false,
    holdTriggerKeyPositions: triggers
  });
  log.push(HT_NAME + ' added (' + G_HT.tappingTermMs + 'ms, idle ' + IDLE_H + ', ' +
           G_HT.flavor + ', ' + triggers.length + ' trigger positions)');
}

[MACOS, WIN].forEach(function (li) {
  var h = d.layers[li][H_POS];
  if (!h || h.value !== '&kp' || h.params[0].value !== 'H') {
    fail('layer ' + li + ' position ' + H_POS + ' is not a plain `&kp H` — refusing to overwrite it.');
  }
  d.layers[li][H_POS] = b(HT_NAME, [WM, 'H']);
});
log.push('H (#' + H_POS + ') -> ' + HT_NAME + ' ' + WM + ' H on both base layers');

/*
 * G's trigger list is deliberately NOT extended with the left-hand positions.
 * You hold G to use the right hand; letting a left-hand key resolve G's hold
 * would re-open every "ga/ge/gr" misfire the positional guard exists to close.
 */

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
