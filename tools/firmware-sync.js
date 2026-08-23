#!/usr/bin/env node
/*
 * Put the newest exported .keymap where the firmware build reads it:
 *
 *   layouts/<newest .keymap>  ->  firmware/config/go60.keymap
 *
 * This is the only way go60.keymap should ever change — sync, don't edit, so
 * the firmware can't diverge from what the viewer and cheat sheet show.
 *
 * Refuses when a layout .json is newer than the newest .keymap: that means
 * the JSON has edits the keymap export doesn't have, and building it would
 * silently flash old firmware. Fix by importing the newest JSON at
 * my.moergo.com/go60 and exporting a fresh keymap — or pass --force if the
 * newer JSON genuinely changes nothing (it almost always changes something).
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var Parse = require(path.join(ROOT, 'js/parse.js'));

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

function newest(dir, re) {
  var files = fs.readdirSync(dir)
    .filter(function (f) { return re.test(f); })
    .map(function (f) {
      var p = path.join(dir, f);
      return { p: p, name: f, mtime: fs.statSync(p).mtimeMs };
    })
    .sort(function (a, b) { return b.mtime - a.mtime; });
  return files[0] || null;
}

var dir = path.join(ROOT, 'layouts');
var keymap = newest(dir, /\.keymap$/i);
var json = newest(dir, /\.json$/i);
var force = process.argv.indexOf('--force') >= 0;

if (!keymap) fail('no .keymap in layouts/ — export one from my.moergo.com/go60.');

if (json && json.mtime > keymap.mtime && !force) {
  fail('the keymap export is STALE.\n' +
    '  newest .json:   ' + json.name + '\n' +
    '  newest .keymap: ' + keymap.name + '  (older)\n' +
    'Import the newest JSON at my.moergo.com/go60, Export the keymap into\n' +
    'layouts/, and re-run. (--force to override.)');
}

var text = fs.readFileSync(keymap.p, 'utf8');
var model = Parse.parseAuto(text, { title: keymap.name });
if (model.error) fail('keymap does not parse: ' + model.error);
if (model.ok === false) {
  console.error('ABORT: keymap fails validation:');
  (model.errors || []).forEach(function (e) { console.error('  ' + e); });
  process.exit(1);
}

var out = path.join(ROOT, 'firmware', 'config', 'go60.keymap');
fs.writeFileSync(out, text);
console.log('synced ' + keymap.name + ' -> firmware/config/go60.keymap');
console.log('  ' + model.layers.length + ' layers, ' + (model.combos || []).length +
  ' combos, validates clean');
console.log('\ncommit + push to build, then: tools/flash.sh');
