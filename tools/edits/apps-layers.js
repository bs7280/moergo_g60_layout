#!/usr/bin/env node
/*
 * Add the apps layers — VSCode_macOS, VSCode_Win, Teams — and wire their
 * entry points.
 *
 *   node tools/edits/apps-layers.js IN.json OUT.json
 *
 * Design (full detail, boards, open decisions):
 * https://claude.ai/code/artifact/042e018d-8e3e-464a-afe6-f38896f7c56e
 *
 * ------------------------------------------------------------- THE LAYERS
 *
 * VSCode_macOS / VSCode_Win — same 15 positions, same finger motions, only
 * the emitted chord differs where the OS or the app disagrees (U/I/S/C/R).
 * Defaults-first: wherever VS Code or the Claude extension ships a chord,
 * that's what's emitted, so muscle memory still works on a bare laptop.
 * Right hand (H J K L) is directional panel focus, vim ⌃W-style — VS Code
 * ships no default for this, so it's the one genuinely custom chord bank
 * (⌃⇧F13-F16). Left hand is state change: terminal, split, Claude verbs.
 *
 * Teams — Windows-base only, re-tuned in v5 to be chat-first rather than
 * meeting-first (mute/camera/raise-hand didn't make the cut — they're one
 * native chord away with no layer held, for the rare call that needs them).
 * Teams can't rebind its own shortcuts, so every key emits Teams' actual
 * accelerator. Base-layer arrows show through while the layer is held, for
 * chat-list walking (Enter still commits the switch — Teams only highlights
 * as you arrow).
 *
 * ------------------------------------------------------------- ENTRY KEYS
 *
 * #57 (RAlt thumb), both bases: hold = the matching VSCode layer, tap =
 * focus/blur Claude. Reuses &thumb_v2_TKZ, the same generic hold-tap already
 * doing this job at #54/#55/#58 — no new custom behavior needed. Costs raw
 * held-RAlt; the mod_tab combos already hold modifiers for alt-tabbing, so
 * nothing is lost there.
 *
 * #53 (End, bottom-right corner), HRM_WinLinx only: hold = Teams, tap = End
 * (unchanged). HRM_macOS's #53 is untouched — Teams isn't reachable from the
 * Mac base. Also &thumb_v2_TKZ; the corner position is naturally isolated
 * from normal typing, same reasoning that lets #54/#55/#58 rely on timing
 * alone with no positional guard.
 */
'use strict';

var fs = require('fs');
var path = require('path');

var IN = process.argv[2];
var OUT = process.argv[3];
if (!IN || !OUT) {
  console.error('usage: node tools/edits/apps-layers.js IN.json OUT.json');
  process.exit(1);
}

var ROOT = path.resolve(__dirname, '../..');
var Parse = require(path.join(ROOT, 'js/parse.js'));

var d = JSON.parse(fs.readFileSync(IN, 'utf8'));
var log = [];

function fail(msg) { console.error('ABORT: ' + msg); process.exit(1); }

/** `&kp LG(LS(LEFT))` — modifiers nest as params carrying params. */
function kp(spec) {
  var parts = String(spec).split(/[()]/).filter(Boolean);   // LG,LS,LEFT
  var node = { value: parts.pop() };
  while (parts.length) node = { value: parts.pop(), params: [node] };
  return { value: '&kp', params: [node] };
}

/** Same nesting as kp(), without the outer &kp — for a hold-tap's tap arg. */
function kpArg(spec) { return kp(spec).params[0]; }

// ------------------------------------------------------------- preflight

var MACOS = d.layer_names.indexOf('HRM_macOS');
var WIN = d.layer_names.indexOf('HRM_WinLinx');
if (MACOS < 0 || WIN < 0) fail('expected HRM_macOS and HRM_WinLinx.');

['VSCode_macOS', 'VSCode_Win', 'Teams'].forEach(function (n) {
  if (d.layer_names.indexOf(n) >= 0) fail(n + ' already exists — nothing to do.');
});

if ((d.holdTaps || []).map(function (h) { return h.name; }).indexOf('&thumb_v2_TKZ') < 0) {
  fail('expected &thumb_v2_TKZ to already exist — layout has moved.');
}

[MACOS, WIN].forEach(function (li) {
  var b57 = d.layers[li][57];
  if (!b57 || b57.value !== '&kp' || !b57.params || b57.params[0].value !== 'RALT') {
    fail(d.layer_names[li] + ' #57 is not plain `&kp RALT` — layout has moved.');
  }
  var b53 = d.layers[li][53];
  if (!b53 || b53.value !== '&kp' || !b53.params || b53.params[0].value !== 'END') {
    fail(d.layer_names[li] + ' #53 is not plain `&kp END` — layout has moved.');
  }
});

// ------------------------------------------------------------ build a layer

function blankLayer() {
  var l = [];
  for (var i = 0; i < 60; i++) l.push({ value: '&trans' });
  return l;
}

function applyBindings(layer, table) {
  Object.keys(table).forEach(function (pos) { layer[Number(pos)] = kp(table[pos]); });
}

// Positions verified against js/geometry.js and `node tools/keymap.js show
// HRM_macOS` — not re-derived here, so a moved layout won't silently drift.

var VSCODE_COMMON = {           // identical chord on both OSes
  30: 'LC(LS(F13))',            // H  panel focus <- (no default; custom)
  31: 'LC(LS(F14))',            // J  panel focus down (no default; custom)
  32: 'LC(LS(F15))',            // K  panel focus up (no default; custom)
  33: 'LC(LS(F16))',            // L  panel focus -> (no default; custom)
  21: 'LC(TAB)',                 // O  MRU tab flip
  34: 'LC(R)',                   // ;  projects / openRecent
  17: 'LC(GRAVE)',               // T  toggle terminal
  29: 'LC(LS(GRAVE))',           // G  new terminal
  41: 'LS(F19)',                 // B  new terminal by profile (no default; custom)
  25: 'LA(K)'                    // A  @-mention current file/selection to Claude
};
var VSCODE_MAC_ONLY = {
  19: 'LG(LS(LBKT))',            // U  prev tab
  20: 'LG(LS(RBKT))',            // I  next tab
  26: 'LG(BSLH)',                 // S  split editor
  39: 'LG(LS(ESC))',              // C  new Claude session
  16: 'LG(LS(T))'                 // R  reopen closed session
};
var VSCODE_WIN_ONLY = {
  19: 'LC(PG_UP)',
  20: 'LC(PG_DN)',
  26: 'LC(BSLH)',
  39: 'LS(F18)',                  // custom on win — ⌃⇧Esc is Task Manager
  16: 'LC(LS(T))'
};

var vscodeMac = blankLayer();
applyBindings(vscodeMac, VSCODE_COMMON);
applyBindings(vscodeMac, VSCODE_MAC_ONLY);

var vscodeWin = blankLayer();
applyBindings(vscodeWin, VSCODE_COMMON);
applyBindings(vscodeWin, VSCODE_WIN_ONLY);

d.layer_names.push('VSCode_macOS');
d.layers.push(vscodeMac);
var VSCODE_MACOS = d.layer_names.length - 1;

d.layer_names.push('VSCode_Win');
d.layers.push(vscodeWin);
var VSCODE_WIN = d.layer_names.length - 1;

log.push('VSCode_macOS added as layer ' + VSCODE_MACOS + ' (' +
  Object.keys(VSCODE_COMMON).length + ' shared + ' + Object.keys(VSCODE_MAC_ONLY).length + ' mac-only chords)');
log.push('VSCode_Win added as layer ' + VSCODE_WIN + ' (' +
  Object.keys(VSCODE_COMMON).length + ' shared + ' + Object.keys(VSCODE_WIN_ONLY).length + ' win-only chords)');

// --------------------------------------------------- Teams (Windows-base only)

var TEAMS_BINDINGS = {
  15: 'LC(E)',                    // E  search everywhere
  29: 'LC(G)',                    // G  go straight to a chat/channel by name
  28: 'LC(F)',                    // F  find in this chat/channel
  39: 'LC(N2)',                   // C  open Chat (2nd app in bar)
  42: 'LC(N)',                    // N  new chat
  31: 'LC(LS(F6))',               // J  previous section
  32: 'LC(F6)',                   // K  next section
  33: 'LC(L)',                    // L  focus the chat list
  19: 'LC(LA(U))',                // U  filter to unread only
  43: 'LC(M)',                    // M  focus the message pane (read/scroll)
  17: 'LC(R)',                    // T  go to the compose box
  16: 'LA(LS(R))',                // R  reply to the last message
  40: 'LC(LA(R))',                // V  react to the last message
  38: 'LC(LS(X))'                 // X  expand compose (multi-line/formatting)
};

var teams = blankLayer();
applyBindings(teams, TEAMS_BINDINGS);
d.layer_names.push('Teams');
d.layers.push(teams);
var TEAMS = d.layer_names.length - 1;
log.push('Teams added as layer ' + TEAMS + ' (' + Object.keys(TEAMS_BINDINGS).length +
  ' chords, chat-first — zero meeting-only keys)');

// ------------------------------------------------------------- entry keys

d.layers[MACOS][57] = { value: '&thumb_v2_TKZ', params: [{ value: VSCODE_MACOS }, kpArg('LG(ESC)')] };
d.layers[WIN][57] = { value: '&thumb_v2_TKZ', params: [{ value: VSCODE_WIN }, kpArg('LS(F17)')] };
log.push('HRM_macOS #57: RALT -> hold VSCode_macOS / tap LG(ESC) (focus/blur Claude)');
log.push('HRM_WinLinx #57: RALT -> hold VSCode_Win / tap LS(F17) (focus/blur Claude)');

d.layers[WIN][53] = { value: '&thumb_v2_TKZ', params: [{ value: TEAMS }, kpArg('END')] };
log.push('HRM_WinLinx #53: END -> hold Teams / tap END (unchanged); HRM_macOS #53 untouched');

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
console.log('\nwrote ' + OUT + '  (' + check.layers.length + ' layers, validates clean)');
