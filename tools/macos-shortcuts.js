#!/usr/bin/env node
/*
 * RETIRED (WM redesign v2, see PLAN.md). v2's macOS catalog has no Mission
 * Control space-move or App Shortcut Minimize actions to check — minimize
 * is now `focused:minimize()` inside the Hammerspoon daemon, not a macOS
 * system shortcut. Left in place as history, like the other one-shot edit
 * scripts in tools/edits/ — not maintained going forward.
 *
 * Everything below this notice is the PRE-v2 script, unmodified.
 *
 * Check the three WM keys that Rectangle can't own.
 *
 *   node tools/macos-shortcuts.js
 *
 * Rectangle covers nine of the twelve. The other three are macOS's own:
 * two Mission Control space moves and Minimize. Those live in two different
 * preference domains with two different encodings, and neither reports failure
 * — a shortcut that didn't take just silently does nothing. Hence this.
 *
 * Read-only. It never writes; it tells you what macOS currently thinks.
 *
 * --------------------------------------------------------------- ENCODINGS
 *
 * Mission Control lives in com.apple.symbolichotkeys as numbered actions:
 * 79 = move left a space, 81 = move right. Each value is
 * `parameters = (character, keyCode, modifierMask)`, where character is 65535
 * for keys that type nothing. An entry with `enabled = 1` and NO value dict is
 * still on the factory shortcut — enabled says nothing about what it's bound to.
 *
 * App Shortcuts live in NSGlobalDomain's NSUserKeyEquivalents, keyed by the
 * literal menu title, and encode the key as a CHARACTER, not a keycode:
 * F13-F16 are U+F710-U+F713, prefixed $ shift, ~ option, ^ control, @ command.
 * The menu title must match the menu item exactly or it binds to nothing.
 */
'use strict';

var cp = require('child_process');
var path = require('path');
var vm = require('vm');
var fs = require('fs');

var ROOT = path.resolve(__dirname, '..');

// Carbon keycodes, same table as tools/rectangle-config.js.
var KEYCODE = { F13: 105, F14: 107, F15: 113, F16: 106, F17: 64, F18: 79, F19: 80, F20: 90 };
// NSF13FunctionKey .. NSF16FunctionKey — the characters App Shortcuts want.
var FNCHAR = { F13: 0xF710, F14: 0xF711, F15: 0xF712, F16: 0xF713 };

var HOTKEY = { 79: 'Move left a space', 81: 'Move right a space' };

function readDomain(domain) {
  try {
    var out = cp.execSync('defaults export ' + domain + ' - 2>/dev/null | plutil -convert json -o - -',
      { encoding: 'utf8', maxBuffer: 8 << 20 });
    return JSON.parse(out);
  } catch (e) { return null; }
}

function actions() {
  var sandbox = {}; sandbox.self = sandbox; vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/wm-actions.js'), 'utf8'), sandbox);
  return sandbox.G80_WM_ACTIONS || [];
}

/** "LS(F15)" -> {base:'F15', shift:true} */
function split(key) {
  var m = /^LS\((F\d\d)\)$/.exec(key);
  return { base: m ? m[1] : key, shift: !!m };
}

var wm = actions();
function byMacTarget(re) { return wm.filter(function (a) { return re.test(a.mac || ''); }); }

var problems = 0;
function report(ok, label, detail) {
  if (!ok) problems++;
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + label + (detail ? '  — ' + detail : ''));
}

// ------------------------------------------------------- Mission Control

console.log('\nMission Control  (System Settings → Keyboard → Keyboard Shortcuts)');

var sym = readDomain('com.apple.symbolichotkeys');
var keys = sym && sym.AppleSymbolicHotKeys;

Object.keys(HOTKEY).forEach(function (id) {
  var want = wm.filter(function (a) { return (a.mac || '').indexOf(HOTKEY[id]) >= 0; })[0];
  if (!want) return;
  var wantCode = KEYCODE[split(want.key).base];
  var e = keys && keys[id];

  if (!e) return report(false, HOTKEY[id], 'no entry at all');
  if (!e.enabled) return report(false, HOTKEY[id], 'disabled');
  var v = e.value && e.value.parameters;
  if (!v) return report(false, HOTKEY[id], 'still on the factory shortcut (no custom value)');
  if (v[1] !== wantCode) {
    return report(false, HOTKEY[id], 'bound to keyCode ' + v[1] + ', want ' + wantCode + ' (' + want.key + ')');
  }
  report(true, HOTKEY[id], want.key + ' — keyCode ' + v[1] + ', modifiers ' + v[2]);
});

// ----------------------------------------------------------- App Shortcuts

console.log('\nApp Shortcuts  (All Applications)');

var glob = readDomain('-globalDomain') || readDomain('NSGlobalDomain');
var eq = (glob && glob.NSUserKeyEquivalents) || null;

byMacTarget(/App Shortcut/).forEach(function (a) {
  var title = (a.mac.split('→')[1] || '').trim();          // "App Shortcut → Minimize"
  var s = split(a.key);
  var want = (s.shift ? '$' : '') + String.fromCharCode(FNCHAR[s.base]);
  var hex = (s.shift ? '$' : '') + '\\U' + FNCHAR[s.base].toString(16);

  if (!eq) return report(false, title, 'no App Shortcuts defined at all — want ' + a.key + ' (' + hex + ')');
  var got = eq[title];
  if (got == null) return report(false, title, 'not set — want ' + a.key + ' (' + hex + ')');
  if (got !== want) {
    var shown = Array.prototype.map.call(got, function (c) {
      var n = c.charCodeAt(0);
      return n > 0xF000 ? '\\U' + n.toString(16) : c;
    }).join('');
    return report(false, title, 'set to ' + shown + ', want ' + hex);
  }
  report(true, title, a.key);
});

// ------------------------------------------------------------------ summary

if (problems) {
  console.log('\n' + problems + ' to fix. These are set by hand once — the encodings above are what');
  console.log('to expect afterwards. Re-run to confirm, and remember a new App Shortcut');
  console.log('only reaches an app the next time it launches.');
} else {
  console.log('\nAll three set. Every one of the 12 WM actions is now bound on this machine.');
}
process.exit(0);
