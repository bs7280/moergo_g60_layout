#!/usr/bin/env node
/*
 * Raise the Mouse layer's DEFAULT pointer speed without touching the tiers.
 *
 *   node tools/edits/mouse-speed.js IN.json OUT.json
 *
 * Values are absolute, not increments — running it twice is the same as
 * running it once.
 *
 * --------------------------------------------------------------- THE PROBLEM
 *
 * The movement keys emit stock `&mmv MOVE_*`, whose velocity is the firmware
 * default (ZMK_POINTING_DEFAULT_MOVE_VAL, 600 px/s at full ramp) — this layout
 * sets no config parameters and no custom devicetree, so the resting speed of
 * the Mouse layer IS the slow tier for practical purposes. TailorKey's design
 * assumes you ride the Fast hold as cruising speed; if you don't, the default
 * feels glacial, and the dedicated Slow hold (×1/9) barely reads as different.
 *
 * The only zero-code lever is the one TailorKey already uses: `&zip_xy_scaler`
 * nodes in the input listeners, gated per layer. There is no node for the
 * Mouse layer itself — so we add one.
 *
 * ------------------------------------------------------------------ STACKING
 *
 * Listener nodes chain: while you hold a speed key, BOTH the Mouse layer and
 * the tier layer are active, so both scalers apply. A ×2 base node therefore
 * turns ×12 warp into ×24 unless the tier nodes are rescaled. The knobs below
 * are ABSOLUTE multipliers (relative to the firmware base); the script divides
 * the base back out of each tier node so the held speeds keep their stock
 * feel and only the resting speed changes.
 *
 * If, on the device, holding Fast feels SLOWER than it did before this edit,
 * the stacking assumption is wrong for your firmware — set STACKS = false and
 * re-run, which writes the tier targets into the nodes verbatim.
 *
 * ------------------------------------------------------------------ THE KNOBS
 */
'use strict';

var fs = require('fs');
var path = require('path');

// Default speed ×2 (≈1200 px/s at full ramp). Deliberately not ×3: Fast (×3)
// has to stay meaningfully above the default or the hold becomes pointless.
var BASE = [2, 1];

// Absolute tier multipliers — stock TailorKey values, i.e. "don't change how
// the holds feel". Written as [multiplier, divisor].
var TIERS = {
  slow: [1, 9],
  fast: [3, 1],
  warp: [12, 1]
};

// Listener nodes chain when several matching layers are active — see above.
var STACKS = true;

/*
 * Scroll has the OPPOSITE problem — the firmware default is too fast, not too
 * slow — so it gets the opposite treatment. Movement keeps the tiers' absolute
 * speeds because they were tuned right and only the base was off. For scroll,
 * everything above the base was off by the same amount, so the whole family
 * shifts down together: the base node scales it and the tier nodes are left
 * at their stock RELATIVE values, which chaining then applies on top of the
 * new base. Hold Fast (×3) and you're back at exactly the old default.
 */
var SCROLL_BASE = [1, 3];

// -----------------------------------------------------------------------

var IN = process.argv[2];
var OUT = process.argv[3];
if (!IN || !OUT) {
  console.error('usage: node tools/edits/mouse-speed.js IN.json OUT.json');
  process.exit(1);
}

var ROOT = path.resolve(__dirname, '../..');
var Parse = require(path.join(ROOT, 'js/parse.js'));

var d = JSON.parse(fs.readFileSync(IN, 'utf8'));
var log = [];

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function reduce(f) {
  var g = gcd(f[0], f[1]);
  return [f[0] / g, f[1] / g];
}

/* The tier node keeps its absolute feel: node × base = target. */
function nodeParams(target) {
  if (!STACKS) return target.slice();
  return reduce([target[0] * BASE[1], target[1] * BASE[0]]);
}

// The Mouse layer is the one that moves the pointer, not the one named Mouse.
var mouseIdx = -1, best = 0;
d.layers.forEach(function (layer, li) {
  var n = layer.filter(function (b) { return b && b.value === '&mmv'; }).length;
  if (n > best) { best = n; mouseIdx = li; }
});
if (mouseIdx < 0) fail('no layer binds &mmv — nothing to speed up.');

function findListener(code) {
  var l = (d.inputListeners || []).filter(function (x) { return x.code === code; })[0];
  if (!l) fail('no ' + code + ' in this export.');
  l.nodes = l.nodes || [];
  return l;
}

/** The listener node for the Mouse layer itself — added if missing. */
function baseNodeOf(listener, scalerCode, params, label) {
  var node = listener.nodes.filter(function (n) {
    return (n.layers || []).length === 1 && n.layers[0] === mouseIdx;
  })[0];
  if (!node) {
    node = {
      code: 'LAYER_' + (d.layer_names[mouseIdx] || 'Mouse'),
      description: 'base ' + label + ' (tools/edits/mouse-speed.js)',
      layers: [mouseIdx],
      inputProcessors: []
    };
    listener.nodes.unshift(node);
  }
  var scaler = (node.inputProcessors || []).filter(function (p) {
    return p.code === scalerCode;
  })[0];
  if (!scaler) {
    scaler = { code: scalerCode, params: [] };
    node.inputProcessors.push(scaler);
  }
  log.push((d.layer_names[mouseIdx] || 'Mouse') + '  base ' + label + ' -> ' +
    reduce(params).join(':') + '  (was firmware default ×1)');
  scaler.params = reduce(params);
}

var listener = findListener('&mmv_input_listener');

/* Rescale the existing tier nodes, matched by layer name. */
listener.nodes.forEach(function (node) {
  var name = (node.layers || []).map(function (l) {
    return d.layer_names[l] || String(l);
  }).join(',');
  var tier = /slow/i.test(name) ? 'slow' : /warp/i.test(name) ? 'warp'
    : /fast/i.test(name) ? 'fast' : null;
  var scaler = (node.inputProcessors || []).filter(function (p) {
    return p.code === '&zip_xy_scaler';
  })[0];
  if (!tier || !scaler) {
    if ((node.layers || []).indexOf(mouseIdx) < 0) {
      log.push('skip  ' + name + '  (no tier match — left alone)');
    }
    return;
  }
  var want = nodeParams(TIERS[tier]);
  log.push(name + '  scaler ' + scaler.params.join(':') + ' -> ' + want.join(':') +
    '  (abs ×' + TIERS[tier][0] + '/' + TIERS[tier][1] + ')');
  scaler.params = want;
});

/* Add — or update — the base nodes for the Mouse layer itself. Scroll tier
 * nodes are untouched on purpose: their stock values are relative to the new
 * base once chaining applies (see SCROLL_BASE above). */
baseNodeOf(listener, '&zip_xy_scaler', BASE, 'pointer speed');
baseNodeOf(findListener('&msc_input_listener'), '&zip_scroll_scaler', SCROLL_BASE, 'scroll rate');

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
