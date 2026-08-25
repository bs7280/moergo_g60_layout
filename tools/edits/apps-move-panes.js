#!/usr/bin/env node
/*
 * Add a "move tab to pane" quad + a maximize-editor-group toggle to
 * VSCode_macOS / VSCode_Win — the movement half of the same focus/movement
 * split just built for the WM layers (PLAN.md §WM redesign v2.1). The
 * existing H/J/K/L panel-FOCUS quad (Ctrl+Shift+F13-16 -> navigateLeft/
 * Down/Up/Right, right hand, row2) is untouched; this adds the MOVEMENT
 * half on the left hand, which was almost entirely unused.
 *
 *   node tools/edits/apps-move-panes.js IN.json OUT.json
 *
 * Positions (row1-left 12-15, + row2-left outer 24) were verified free on
 * both layers before writing this — VSCode_macOS/Win already bind 15 of 60
 * positions (T, `, [, ], Ctrl+Tab, Alt+K, \, Ctrl+Shift+`, the H/J/K/L
 * quad, Ctrl+R, the Claude chord, the terminal-profile-picker chord); none
 * of those overlap what's added here.
 *
 * Same chord on BOTH OS layers — VS Code's move/maximize command IDs are
 * cross-platform, no native-vs-daemon divergence like the WM layer's
 * place-half row, so there's nothing to native-ize per OS.
 *
 * Chord bank: LA(LS(F13-17)) — verified unused anywhere in the layout
 * (grepped every layer). Deliberately NOT the single-modifier bands
 * (bare/LC/LA/LS-alone F13-F20) the WM layers' Python/Hammerspoon daemons
 * already claim — those are GLOBAL hotkeys (RegisterHotKey doesn't care
 * which app has focus), so reusing one here would mean the daemon eats the
 * keystroke before VS Code ever sees it. LA(LS(...)) is a fresh 2-deep
 * bank nobody's touched, so there's no such collision.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var IN = process.argv[2];
var OUT = process.argv[3];
if (!IN || !OUT) {
  console.error('usage: node tools/edits/apps-move-panes.js IN.json OUT.json');
  process.exit(1);
}

var ROOT = path.resolve(__dirname, '../..');
var Parse = require(path.join(ROOT, 'js/parse.js'));

var d = JSON.parse(fs.readFileSync(IN, 'utf8'));
var log = [];

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

/** `&kp LA(LS(F13))` — modifiers nest as params carrying params. */
function kp(spec) {
  var parts = String(spec).split(/[()]/).filter(Boolean);
  var node = { value: parts.pop() };
  while (parts.length) node = { value: parts.pop(), params: [node] };
  return { value: '&kp', params: [node] };
}

var LAYOUT = [
  { pos: 12, chord: 'LA(LS(F13))', desc: 'move tab left  -> workbench.action.moveEditorToLeftGroup' },
  { pos: 13, chord: 'LA(LS(F14))', desc: 'move tab down  -> workbench.action.moveEditorToBelowGroup' },
  { pos: 14, chord: 'LA(LS(F15))', desc: 'move tab up    -> workbench.action.moveEditorToAboveGroup' },
  { pos: 15, chord: 'LA(LS(F16))', desc: 'move tab right -> workbench.action.moveEditorToRightGroup' },
  { pos: 24, chord: 'LA(LS(F17))', desc: 'maximize/restore editor group -> workbench.action.toggleMaximizeEditorGroup' }
];

['VSCode_macOS', 'VSCode_Win'].forEach(function (name) {
  var li = d.layer_names.indexOf(name);
  if (li < 0) fail('expected a ' + name + ' layer.');
  LAYOUT.forEach(function (a) {
    var cur = d.layers[li][a.pos];
    if (!cur || cur.value !== '&trans') {
      fail(name + ' #' + a.pos + ' is not &trans (`' + (cur && cur.value) + '`) — layout has moved, re-check free positions.');
    }
    d.layers[li][a.pos] = kp(a.chord);
  });
  log.push(name + ': bound ' + LAYOUT.length + ' new positions (move-tab quad + maximize)');
});

// -------------------------------------------------------------------- write

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
LAYOUT.forEach(function (a) { console.log('  #' + a.pos + ' ' + a.chord + '  ' + a.desc); });
console.log('\nwrote ' + OUT + '  (' + check.layers.length + ' layers, validates clean)');
