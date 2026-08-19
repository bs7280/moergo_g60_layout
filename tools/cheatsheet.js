#!/usr/bin/env node
/*
 * Bake the whole layout into one tall SVG — docs/cheatsheet.svg — sized for a
 * vertical monitor and embeddable in the README, so the sheet is readable
 * anywhere github.com is (no Pages, no build, no JS).
 *
 *   node tools/cheatsheet.js                 newest file in layouts/
 *   node tools/cheatsheet.js --file=PATH     a specific export
 *   node tools/cheatsheet.js --out=PATH      somewhere else (default docs/cheatsheet.svg)
 *
 * Same parser and renderer as the pages, so the SVG can't disagree with them.
 * Go60 only; parse/validation failures exit 1 rather than draw a wrong board.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var Parse = require(path.join(ROOT, 'js/parse.js'));
var Sheet = require(path.join(ROOT, 'js/sheet.js'));
var WM = require(path.join(ROOT, 'data/wm-actions.js'));

function arg(name) {
  var pre = '--' + name + '=';
  for (var i = 2; i < process.argv.length; i++) {
    if (process.argv[i].indexOf(pre) === 0) return process.argv[i].slice(pre.length);
  }
  return null;
}

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

var src = pickSource(arg('file'));
var model = Parse.parseAuto(src.text, { title: path.basename(src.name) });

if (model.error) { console.error('Parse error: ' + model.error); process.exit(1); }
if (model.ok === false || (model.errors && model.errors.length)) {
  console.error('Refusing to draw ' + src.name + ':');
  (model.errors || []).forEach(function (e) { console.error('  error: ' + e); });
  process.exit(1);
}
(model.warnings || []).forEach(function (w) { console.error('warning: ' + w); });

var out = arg('out') || path.join(ROOT, 'docs', 'cheatsheet.svg');
var built = Sheet.build(model, {
  title: model.title,
  source: src.name,
  generated: new Date().toISOString().slice(0, 10),
  wmActions: WM.G80_WM_ACTIONS
});

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, built.svg);
console.log('wrote ' + path.relative(ROOT, out) + '  (' + built.width + '×' + built.height +
  ', ' + (built.svg.length / 1024).toFixed(0) + ' KB, ' + model.layers.length + ' layers)');
