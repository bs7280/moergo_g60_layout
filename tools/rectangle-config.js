#!/usr/bin/env node
/*
 * RETIRED (WM redesign v2, see PLAN.md). data/wm-actions.js no longer
 * describes Rectangle actions at all — the macOS WM layer targets a
 * Hammerspoon daemon instead, and this script's ACTION map / regex
 * (`/^LS\((F\d\d)\)$/`) predate the Ctrl/Alt-modified chords v2 uses, so
 * running this now would silently find nothing to write rather than error.
 * Left in place as history, like the other one-shot edit scripts in
 * tools/edits/ — not maintained going forward.
 *
 * Everything below this notice is the PRE-v2 script, unmodified.
 *
 * Write the WM layer's F-keys into a Rectangle config.
 *
 *   node tools/rectangle-config.js [IN.json] [OUT.json]
 *
 * Defaults to ~/Downloads/RectangleConfig.json in, and config/ in the repo out.
 * Import the result with Rectangle → Settings → gear → Import Config.
 *
 * Reads the action list from data/wm-actions.js, so this stays in sync with
 * the drill and the cheat sheet — the same join, third consumer. Everything in
 * your exported config that isn't one of these shortcuts is copied through
 * untouched, so this is safe to re-run after changing anything in Rectangle.
 *
 * ------------------------------------------------------------------ KEYCODES
 *
 * Rectangle stores Carbon virtual keycodes. F13-F20 have stable, documented
 * constants (kVK_F13 = 0x69 and friends). F21-F24 DO NOT — Carbon never
 * assigned them, which is why no macOS app can bind them however cleanly the
 * keyboard sends them. Tested, not assumed.
 *
 * That is why the layer's verb row emits LS(F13)-LS(F16): everything stays
 * inside the range macOS understands, and Shift is inert on an F-key. All
 * twelve resolve to a real (keyCode, modifierFlags) pair, so nothing here has
 * to be recorded by hand.
 *
 * The script also takes a chord off any other action holding it. Recording
 * shortcuts by hand down Rectangle's settings list is a reliable way to put a
 * key on the wrong action, and Rectangle stores duplicates without complaint.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');

/*
 * In: wherever Rectangle exported to. Out: the repo, so the generated config is
 * versioned next to the layout that implies it and survives a new machine.
 */
var IN = process.argv[2] || path.join(os.homedir(), 'Downloads', 'RectangleConfig.json');
var OUT = process.argv[3] || path.join(ROOT, 'config', 'RectangleConfig-wm.json');

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

/*
 * Carbon kVK_* — only the ones macOS actually defines. F21-F24 have none,
 * which is why the verb row emits LS(F13)-LS(F16) instead. Confirmed against a
 * real Rectangle export: it recorded F17-F20 as exactly 64/79/80/90.
 */
var KEYCODE = {
  F13: 105, F14: 107, F15: 113, F16: 106,
  F17: 64,  F18: 79,  F19: 80,  F20: 90
};

// NSEventModifierFlagShift (1 << 17). Ctrl+Opt, for reference, is 786432.
var SHIFT = 131072;

// Which Rectangle action each key drives. null = Rectangle can't do it.
var ACTION = {
  F13: 'previousDisplay',
  F14: null,                  // desktop switching — System Settings > Mission Control
  F15: null,                  // ditto
  F16: 'nextDisplay',
  F17: 'leftHalf',
  F18: 'topHalf',
  F19: 'bottomHalf',
  F20: 'rightHalf',
  'LS(F13)': 'maximize',
  'LS(F14)': 'center',
  'LS(F15)': null,            // minimize — System Settings > App Shortcuts
  'LS(F16)': 'restore'
};

/** "LS(F13)" -> {keyCode, modifierFlags}; null when macOS has no keycode. */
function resolve(key) {
  var m = /^LS\((F\d\d)\)$/.exec(key);
  var base = m ? m[1] : key;
  var code = KEYCODE[base];
  if (code == null) return null;
  return { keyCode: code, modifierFlags: m ? SHIFT : 0 };
}

// ------------------------------------------------------------------- inputs

if (!fs.existsSync(IN)) {
  fail('no config at ' + IN + '\n       Export one: Rectangle → Settings → gear → Export Config.');
}
var cfg = JSON.parse(fs.readFileSync(IN, 'utf8'));
if (cfg.bundleId !== 'com.knollsoft.Rectangle') fail('not a Rectangle export (bundleId=' + cfg.bundleId + ')');
cfg.shortcuts = cfg.shortcuts || {};

// data/wm-actions.js is a browser IIFE; run it in a sandbox to read the list.
var sandbox = {};
sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/wm-actions.js'), 'utf8'), sandbox);
var actions = sandbox.G80_WM_ACTIONS || [];
if (!actions.length) fail('data/wm-actions.js exported no actions.');

/*
 * Bare F-keys have no modifier, which Rectangle only accepts when
 * `allowAnyShortcut` is on. Without it the import lands and silently does
 * nothing, which is a miserable thing to debug.
 */
var allow = cfg.defaults && cfg.defaults.allowAnyShortcut;
if (!allow || allow.bool !== true) {
  cfg.defaults = cfg.defaults || {};
  cfg.defaults.allowAnyShortcut = { bool: true };
  console.log('  note: turned on allowAnyShortcut — bare F-keys need it');
}

// -------------------------------------------------------------------- apply

var bound = [], manual = [], unknown = [], cleared = [];

actions.forEach(function (a) {
  var name = ACTION[a.key];
  if (name === undefined) return;                       // not one of our keys
  if (name === null) { manual.push({ a: a }); return; }

  var sc = resolve(a.key);
  if (!sc) { unknown.push({ a: a, name: name, had: cfg.shortcuts[name] }); return; }

  /*
   * Take this chord off any other action first. Rectangle will happily store
   * the same shortcut twice and then behave unpredictably — and recording by
   * hand down the settings list is exactly how a key ends up on the wrong
   * action, so this is the common case, not a corner one.
   */
  Object.keys(cfg.shortcuts).forEach(function (other) {
    if (other === name) return;
    var o = cfg.shortcuts[other];
    if (o && o.keyCode === sc.keyCode && o.modifierFlags === sc.modifierFlags) {
      delete cfg.shortcuts[other];
      cleared.push({ from: other, key: a.key, to: name });
    }
  });

  cfg.shortcuts[name] = sc;
  bound.push({ a: a, name: name, sc: sc });
});

fs.writeFileSync(OUT, JSON.stringify(cfg, null, 2) + '\n');

// ------------------------------------------------------------------- report

function pad(s, n) { s = String(s); return s + Array(Math.max(1, n - s.length + 1)).join(' '); }

console.log('\nBound in Rectangle');
bound.forEach(function (b) {
  console.log('  ' + pad(b.a.key, 9) + pad(b.a.label, 9) + pad('-> ' + b.name, 20) +
    'keyCode ' + pad(b.sc.keyCode, 4) +
    (b.sc.modifierFlags ? 'flags ' + b.sc.modifierFlags + ' (shift)' : 'no modifier'));
});

if (cleared.length) {
  console.log('\nCleared — these had the same chord and would have fought:');
  cleared.forEach(function (c) {
    console.log('  ' + pad(c.from, 18) + 'was on ' + pad(c.key, 9) + '(now ' + c.to + ')');
  });
}

if (unknown.length) {
  console.log('\nStill unbound — macOS defines no Carbon keycode for these, so they');
  console.log('cannot be written blind. Record each one in Rectangle, export, re-run:');
  unknown.forEach(function (u) {
    console.log('  ' + pad(u.a.key, 9) + pad(u.a.label, 9) + pad('-> ' + u.name, 20) +
      (u.had ? 'currently the stock chord (keyCode ' + u.had.keyCode + ')' : 'unbound'));
  });
}

if (manual.length) {
  console.log('\nNot Rectangle actions — bind these in System Settings → Keyboard:');
  manual.forEach(function (m) {
    console.log('  ' + pad(m.a.key, 9) + pad(m.a.label, 9) + (m.a.mac || '—'));
  });
}

console.log('\nwrote ' + OUT);
console.log('import: Rectangle → Settings → gear icon → Import Config');
