#!/usr/bin/env node
/*
 * CLI companion to the HTML viewer — same parser, terminal output.
 * Useful for asking questions about the layout without opening a browser.
 *
 *   node tools/keymap.js layers                 list layers
 *   node tools/keymap.js show [layer]           print a layer as a grid
 *   node tools/keymap.js all                    print every layer
 *   node tools/keymap.js find <text>            where is this binding?
 *   node tools/keymap.js key <index>            one position across all layers
 *   node tools/keymap.js stats                  key-count summary
 *
 * Reads the newest file in layouts/ (.json or .keymap), or pass --file=PATH.
 * Go60 only — anything else is rejected rather than rendered on wrong geometry.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var Geo = require(path.join(ROOT, 'js/geometry.js'));
var Codes = require(path.join(ROOT, 'js/keycodes.js'));
var Parse = require(path.join(ROOT, 'js/parse.js'));

// --------------------------------------------------------------- input file

function pickSource(explicit) {
  if (explicit) {
    return { text: fs.readFileSync(explicit, 'utf8'), name: explicit };
  }
  var dir = path.join(ROOT, 'layouts');
  var files = [];
  try {
    files = fs.readdirSync(dir)
      .filter(function (f) { return /\.(json|keymap|dtsi)$/i.test(f); })
      .map(function (f) {
        var p = path.join(dir, f);
        return { p: p, mtime: fs.statSync(p).mtimeMs };
      })
      .sort(function (a, b) { return b.mtime - a.mtime; });
  } catch (e) { /* no layouts dir yet */ }

  if (files.length) {
    return { text: fs.readFileSync(files[0].p, 'utf8'), name: path.relative(ROOT, files[0].p) };
  }
  console.error('No layout found. Put a Go60 .json export in layouts/, or pass --file=PATH.');
  process.exit(1);
}

// ------------------------------------------------------------------ display

var OS = process.env.G80_OS || 'mac';

function ctxFor(model) {
  return { os: OS, layerNames: model.layerNames, defines: model.defines, behaviors: model.behaviors };
}

function boardFor() {
  return Geo.BOARD;
}

function cellText(f) {
  if (f.cls === 'none') return '';
  if (f.cls === 'trans') return '▽';
  if (f.top && f.main) return f.top + '/' + f.main;
  return f.main || f.top || '?';
}

function pad(s, n) {
  s = String(s);
  var len = [].concat(Array.from(s)).length;
  if (len > n - 1) { s = Array.from(s).slice(0, n - 1).join(''); len = n - 1; }
  return s + ' '.repeat(Math.max(1, n - len));
}

function renderLayer(model, li, width) {
  var ctx = ctxFor(model);
  var binds = model.layers[li];
  var W = width || 9;
  var lines = boardFor(model).gridRows.map(function (row) {
    return row.map(function (seg) {
      return seg.map(function (i) {
        return i == null ? ' '.repeat(W) : pad(cellText(Codes.format(binds[i], ctx)), W);
      }).join('');
    }).join(' ').replace(/\s+$/, '');
  });
  return lines.join('\n');
}

function header(model, src) {
  var geo = boardFor(model);
  var extra = (model.combos && model.combos.length) ? '  ·  ' + model.combos.length + ' combos' : '';
  return model.title + '   [' + src.name + ']\n' +
    geo.label + ' (' + geo.name + ', ' + model.keyCount + ' keys)  ·  ' +
    model.layers.length + ' layers' + extra + '\n' +
    model.layerNames.map(function (n, i) { return i + '=' + n; }).join('  ');
}

// --------------------------------------------------------------------- main

function main() {
  var argv = process.argv.slice(2);
  var fileArg = null;
  argv = argv.filter(function (a) {
    var m = /^--file=(.*)$/.exec(a);
    if (m) { fileArg = m[1]; return false; }
    return true;
  });

  var cmd = argv[0] || 'show';
  var src = pickSource(fileArg);
  var model = Parse.parseAuto(src.text,
    { title: path.basename(src.name).replace(/\.[^.]+$/, '') });
  if (model.error) { console.error('Parse error: ' + model.error); process.exit(1); }
  model.fileName = src.name;

  if (model.ok === false) {
    console.error('Refusing to read ' + src.name + ':');
    model.errors.forEach(function (e) { console.error('  error: ' + e); });
    process.exit(1);
  }
  (model.warnings || []).forEach(function (w) { console.error('warning: ' + w); });

  var ctx = ctxFor(model);

  if (cmd === 'layers') {
    console.log(header(model, src));
    return;
  }

  if (cmd === 'show' || cmd === 'all') {
    console.log(header(model, src) + '\n');
    var list = cmd === 'all'
      ? model.layerNames.map(function (_, i) { return i; })
      : [resolveLayer(model, argv[1]) || 0];
    list.forEach(function (li) {
      console.log('── ' + li + '  ' + model.layerNames[li] + ' ' + '─'.repeat(Math.max(0, 60 - String(model.layerNames[li]).length)));
      console.log(renderLayer(model, li));
      console.log('');
    });
    return;
  }

  if (cmd === 'find') {
    var needle = argv.slice(1).join(' ').toLowerCase();
    if (!needle) { console.error('usage: find <text>'); process.exit(1); }
    var found = 0;
    model.layers.forEach(function (layer, li) {
      layer.forEach(function (b, i) {
        var f = Codes.format(b, ctx);
        var hay = (b + ' ' + f.main + ' ' + f.top + ' ' + f.sub + ' ' + f.desc).toLowerCase();
        if (hay.indexOf(needle) < 0) return;
        found++;
        var gk = boardFor(model);
        console.log(
          pad(li + ' ' + model.layerNames[li], 18) +
          pad('#' + i, 6) + pad(gk.keys[i] ? gk.posLabel(gk.keys[i]) : '?', 22) + b);
      });
    });
    if (!found) { console.log('no match for "' + needle + '"'); process.exit(2); }
    return;
  }

  if (cmd === 'key') {
    var idx = parseInt(argv[1], 10);
    var geoK = boardFor(model);
    if (!(idx >= 0 && idx < geoK.count)) {
      console.error('usage: key <0-' + (geoK.count - 1) + '>'); process.exit(1);
    }
    var k = geoK.keys[idx];
    console.log('#' + idx + '  ' + geoK.posLabel(k) + '   (' + k.side + ', ' + k.cluster + ', ' + k.finger + ')');
    model.layers.forEach(function (layer, li) {
      var f = Codes.format(layer[idx], ctx);
      console.log('  ' + pad(li + ' ' + model.layerNames[li], 18) + pad(layer[idx], 24) + f.desc);
    });
    return;
  }

  if (cmd === 'stats') {
    console.log(header(model, src) + '\n');
    model.layers.forEach(function (layer, li) {
      var counts = {};
      layer.forEach(function (b) {
        var c = Codes.format(b, ctx).cls;
        counts[c] = (counts[c] || 0) + 1;
      });
      var bound = model.keyCount - (counts.none || 0) - (counts.trans || 0);
      console.log(pad(li + ' ' + model.layerNames[li], 20) +
        pad(bound + ' bound', 12) +
        Object.keys(counts).sort().map(function (c) { return c + ':' + counts[c]; }).join(' '));
    });
    var behs = Object.keys(model.behaviors || {});
    if (behs.length) console.log('\ncustom behaviours: ' + behs.join(', '));
    return;
  }

  if (cmd === 'combos') {
    var geoC = boardFor(model);
    if (!model.combos.length) { console.log('no combos in this layout'); return; }
    console.log(header(model, src) + '\n');
    model.combos.forEach(function (c) {
      var where = c.layers.length
        ? c.layers.map(function (l) { return model.layerNames[l] || l; }).join(', ')
        : 'all layers';
      console.log(pad(c.name || '(unnamed)', 26) + pad(c.binding, 22) +
        'keys ' + c.keys.map(function (i) {
          return '#' + i + (geoC.keys[i] ? '(' + geoC.posLabel(geoC.keys[i]) + ')' : '');
        }).join(' + ') + '  ·  ' + where + (c.timeoutMs ? '  ·  ' + c.timeoutMs + 'ms' : ''));
      if (c.desc) console.log('  ' + c.desc);
    });
    return;
  }

  if (cmd === 'behaviors') {
    console.log(header(model, src) + '\n');
    Object.keys(model.behaviors).sort().forEach(function (n) {
      var b = model.behaviors[n];
      var timing = b.kind === 'hold-tap'
        ? 'term:' + pad(b.tappingTermMs == null ? '—' : b.tappingTermMs, 6) +
          'quick:' + pad(b.quickTapMs == null ? '—' : b.quickTapMs, 6) +
          'idle:' + pad(b.requirePriorIdleMs == null ? '—' : b.requirePriorIdleMs, 6) +
          pad(b.flavor || '', 15)
        : '';
      console.log(pad('&' + n, 26) + pad(b.kind, 11) + timing + (b.bindings || []).join(' , '));
      if (b.desc) console.log('    ' + String(b.desc).split('\n')[0].slice(0, 110));
    });
    return;
  }

  console.error('unknown command: ' + cmd);
  console.error('try: layers | show [layer] | all | find <text> | key <index> | stats | combos | behaviors');
  process.exit(1);
}

function resolveLayer(model, arg) {
  if (arg == null) return 0;
  if (/^\d+$/.test(arg)) return parseInt(arg, 10);
  var i = model.layerNames.findIndex(function (n) {
    return n.toLowerCase() === String(arg).toLowerCase();
  });
  return i >= 0 ? i : 0;
}

main();
