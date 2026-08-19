#!/usr/bin/env node
/*
 * Diff two Go60 layouts in layout terms, not JSON terms.
 *
 *   node tools/diff.js OLD NEW [--semantic]
 *
 * --semantic compares what each key *means* rather than how it's spelled, so
 * a .json and a .keymap of the same layout come out clean. `&mo 11` and
 * `&mo LAYER_MouseFast` are the same key; only one of them is a change.
 *
 * Answers "what did I change before typing got worse" — which is a question
 * a raw JSON diff is bad at, because it shows you `{"value":"&kp"...}` noise
 * and hides that layer 6 position 29 stopped being a plain G.
 *
 * Also the safety net for scripted edits: make the edit, diff it, then upload.
 * Both files must validate; a rejected layout is not diffed.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var Geo = require(path.join(ROOT, 'js/geometry.js'));
var Codes = require(path.join(ROOT, 'js/keycodes.js'));
var Parse = require(path.join(ROOT, 'js/parse.js'));

var OS = process.env.G80_OS || 'mac';
var BOARD = Geo.BOARD;

function load(p) {
  var text = fs.readFileSync(p, 'utf8');
  var m = Parse.parseAuto(text, { title: path.basename(p).replace(/\.[^.]+$/, '') });
  if (m.error) { console.error(p + ': ' + m.error); process.exit(1); }
  if (m.ok === false) {
    console.error('Refusing to diff ' + p + ':');
    m.errors.forEach(function (e) { console.error('  error: ' + e); });
    process.exit(1);
  }
  m.fileName = p;
  return m;
}

function ctxFor(m) {
  return { os: OS, layerNames: m.layerNames, defines: m.defines, behaviors: m.behaviors };
}

/** "&lt 6 SPACE" -> "&lt 6 SPACE  (Symbol / Space)" */
function annotate(binding, ctx) {
  var f = Codes.format(binding, ctx);
  var legend = [f.top, f.main].filter(Boolean).join(' / ') || f.cls;
  return binding + '   (' + legend + ')';
}

/**
 * Comparable form of what a key does, ignoring how the binding is spelled.
 * `sub` is deliberately excluded — it's a qualifier ("tap-dance", "hold"),
 * not part of what the key does, and it differs between formats for keys
 * that behave identically.
 */
function legendOf(binding, ctx) {
  var f = Codes.format(binding, ctx);
  return [f.top, f.main, f.cls, f.layer].join('|');
}

function pos(i) {
  var k = BOARD.keys[i];
  return '#' + String(i).padEnd(3) + (k ? BOARD.posLabel(k) : '?');
}

function section(title) {
  console.log('\n' + title);
  console.log('─'.repeat(Math.max(20, title.length)));
}

function main() {
  var argv = process.argv.slice(2);
  var semantic = argv.indexOf('--semantic') >= 0;
  argv = argv.filter(function (x) { return x !== '--semantic'; });
  var a = argv[0], b = argv[1];
  if (!a || !b) {
    console.error('usage: node tools/diff.js OLD NEW [--semantic]');
    process.exit(1);
  }
  var A = load(a), B = load(b);
  var ca = ctxFor(A), cb = ctxFor(B);
  var changes = 0;

  console.log('old: ' + A.title + '   [' + A.fileName + ']');
  console.log('new: ' + B.title + '   [' + B.fileName + ']');

  // ---------------------------------------------------------------- layers
  var added = B.layerNames.filter(function (n) { return A.layerNames.indexOf(n) < 0; });
  var removed = A.layerNames.filter(function (n) { return B.layerNames.indexOf(n) < 0; });
  var moved = [];
  A.layerNames.forEach(function (n, i) {
    var j = B.layerNames.indexOf(n);
    if (j >= 0 && j !== i) moved.push(n + ': ' + i + ' -> ' + j);
  });

  if (added.length || removed.length || moved.length) {
    section('Layers');
    added.forEach(function (n) { console.log('  + ' + n + ' (index ' + B.layerNames.indexOf(n) + ')'); });
    removed.forEach(function (n) { console.log('  - ' + n + ' (was index ' + A.layerNames.indexOf(n) + ')'); });
    moved.forEach(function (m) {
      console.log('  ! moved  ' + m + '  — numeric layer references elsewhere now point somewhere else');
    });
    changes += added.length + removed.length + moved.length;
  }

  // -------------------------------------------------------------- bindings
  // Match layers by name so an appended layer doesn't shift everything.
  var bindingChanges = 0;
  A.layerNames.forEach(function (name, ai) {
    var bi = B.layerNames.indexOf(name);
    if (bi < 0) return;
    var la = A.layers[ai], lb = B.layers[bi];
    var rows = [];
    for (var i = 0; i < Math.max(la.length, lb.length); i++) {
      var x = (la[i] || '').trim(), y = (lb[i] || '').trim();
      var same = semantic ? legendOf(x, ca) === legendOf(y, cb) : x === y;
      if (!same) rows.push({ i: i, from: x, to: y });
    }
    if (!rows.length) return;
    section('Layer ' + bi + '  ' + name + '   (' + rows.length + ' key' + (rows.length > 1 ? 's' : '') + ')');
    rows.forEach(function (r) {
      console.log('  ' + pos(r.i));
      console.log('    - ' + annotate(r.from, ca));
      console.log('    + ' + annotate(r.to, cb));
    });
    bindingChanges += rows.length;
  });
  changes += bindingChanges;

  // ---------------------------------------------------------------- combos
  var comboKey = function (c) { return c.name || (c.binding + '@' + c.keys.join(',')); };
  var ma = {}, mb = {};
  A.combos.forEach(function (c) { ma[comboKey(c)] = c; });
  B.combos.forEach(function (c) { mb[comboKey(c)] = c; });
  var comboLines = [];
  Object.keys(mb).forEach(function (k) {
    var y = mb[k], x = ma[k];
    var layersOf = function (c, m) {
      return c.layers.length ? c.layers.map(function (l) { return m.layerNames[l] || l; }).join(', ') : 'all layers';
    };
    if (!x) {
      comboLines.push('  + ' + k + '  ' + y.binding + '  keys ' + y.keys.join('+') + '  on ' + layersOf(y, B));
      return;
    }
    var fields = [];
    var bindSame = semantic
      ? legendOf(x.binding, ca) === legendOf(y.binding, cb)
      : x.binding === y.binding;
    if (!bindSame) fields.push('binding ' + x.binding + ' -> ' + y.binding);
    if (x.keys.join(',') !== y.keys.join(',')) fields.push('keys ' + x.keys.join('+') + ' -> ' + y.keys.join('+'));
    if (layersOf(x, A) !== layersOf(y, B)) fields.push('layers ' + layersOf(x, A) + ' -> ' + layersOf(y, B));
    if ((x.timeoutMs || '') !== (y.timeoutMs || '')) fields.push('timeout ' + x.timeoutMs + ' -> ' + y.timeoutMs + 'ms');
    if (fields.length) comboLines.push('  ~ ' + k + '  ' + fields.join('; '));
  });
  Object.keys(ma).forEach(function (k) {
    if (!mb[k]) comboLines.push('  - ' + k + '  ' + ma[k].binding);
  });
  if (comboLines.length) {
    section('Combos');
    comboLines.forEach(function (l) { console.log(l); });
    changes += comboLines.length;
  }

  // ------------------------------------------------------------- behaviors
  var TIMING = ['tappingTermMs', 'quickTapMs', 'requirePriorIdleMs', 'flavor'];
  var behLines = [];
  Object.keys(B.behaviors).forEach(function (n) {
    var y = B.behaviors[n], x = A.behaviors[n];
    if (!x) { behLines.push('  + &' + n + '  (' + y.kind + ')'); return; }
    var fields = [];
    TIMING.forEach(function (f) {
      var xv = x[f] == null ? '—' : x[f];
      var yv = y[f] == null ? '—' : y[f];
      if (String(xv) !== String(yv)) fields.push(f.replace(/Ms$/, '') + ' ' + xv + ' -> ' + yv);
    });
    if ((x.bindings || []).join(',') !== (y.bindings || []).join(',')) {
      fields.push('bindings <' + (x.bindings || []).join(', ') + '> -> <' + (y.bindings || []).join(', ') + '>');
    }
    if (fields.length) behLines.push('  ~ &' + n + '  ' + fields.join('; '));
  });
  Object.keys(A.behaviors).forEach(function (n) {
    if (!B.behaviors[n]) behLines.push('  - &' + n + '  (' + A.behaviors[n].kind + ')');
  });
  if (behLines.length) {
    section('Behaviours');
    behLines.forEach(function (l) { console.log(l); });
    changes += behLines.length;
  }

  console.log();
  if (!changes) console.log('No functional differences.');
  else console.log(changes + ' change' + (changes > 1 ? 's' : '') + '  ·  ' + bindingChanges + ' key binding' + (bindingChanges === 1 ? '' : 's'));
  process.exit(changes ? 0 : 0);
}

main();
