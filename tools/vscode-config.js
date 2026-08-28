#!/usr/bin/env node
/*
 * Does this machine actually have the VS Code config the keyboard expects?
 *
 *   node tools/vscode-config.js            # check every editor found here
 *   node tools/vscode-config.js print      # the block to paste, for this OS
 *
 * The keyboard half of this repo is self-verifying — the keymap parses or
 * the build fails. The OS half wasn't: `os/vscode/*.jsonc` documented what
 * to merge, and whether anyone had merged it was folklore. This closes
 * that. It reads the SAME files you paste from, so there is one source of
 * truth, not a checked-in list that can drift from the documented one.
 *
 * Read-only by design. Merging JSONC into a hand-commented file without
 * mangling the comments is a genuinely hard problem and not worth solving
 * for a two-minute paste; this tells you exactly what's missing and gets
 * out of the way.
 *
 * Options:
 *   --platform=mac|win|linux   check as if on that OS (default: this one)
 *   --dir=PATH                 check one editor's User/ dir explicitly
 *   --verbose                  also list what's already correct
 */
'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');

var ROOT = path.resolve(__dirname, '..');
var CONF = path.join(ROOT, 'os', 'vscode');

// ---------------------------------------------------------------- JSONC

/**
 * Comments and trailing commas out, JSON in. A character scanner rather
 * than a regex because `"https://x"` and `"a, }"` are both legal strings
 * that a regex happily destroys — and VS Code's own config files are full
 * of URLs.
 */
function stripJsonc(text) {
  var out = '';
  var i = 0;
  var n = text.length;
  while (i < n) {
    var c = text[i];
    if (c === '"') {
      var start = i++;
      while (i < n) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === '"') { i++; break; }
        i++;
      }
      out += text.slice(start, i);
      continue;
    }
    if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  // trailing commas: `, }` / `, ]` — legal in JSONC, fatal in JSON.parse
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function readJsonc(file) {
  var text = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(stripJsonc(text));
  } catch (e) {
    throw new Error(file + ' does not parse as JSONC: ' + e.message);
  }
}

// ------------------------------------------------------------ comparison

/**
 * `ctrl+shift+f13` and `shift+ctrl+f13` are the same binding; VS Code
 * accepts either spelling. Sort the modifiers, keep the final key last,
 * and treat a chord (`ctrl+k ctrl+s`) as a sequence of those.
 */
function normKey(key) {
  return String(key || '').toLowerCase().trim().split(/\s+/).map(function (part) {
    var t = part.split('+');
    var last = t.pop();
    return t.sort().concat(last).join('+');
  }).join(' ');
}

function normWhen(when) {
  return String(when === undefined || when === null ? '' : when).replace(/\s+/g, ' ').trim();
}

function sameBinding(a, b) {
  return a.command === b.command &&
    normKey(a.key) === normKey(b.key) &&
    normWhen(a.when) === normWhen(b.when);
}

function describe(b) {
  return b.key + '  ->  ' + b.command + (b.when ? '   [when: ' + b.when + ']' : '');
}

// -------------------------------------------------------- where configs live

/**
 * Every editor in the VS Code family keeps User/ in the same place per OS,
 * differing only in the product folder name. Cursor is included because
 * this Mac runs both and the layer is editor-agnostic — anything that isn't
 * installed simply doesn't show up.
 */
var PRODUCTS = ['Code', 'Code - Insiders', 'Cursor', 'VSCodium', 'Windsurf'];

function userDirs(platform) {
  var home = os.homedir();
  var bases = [];
  if (platform === 'mac') {
    bases.push(path.join(home, 'Library', 'Application Support'));
  } else if (platform === 'win') {
    bases.push(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'));
  } else {
    bases.push(path.join(home, '.config'));
  }
  var found = [];
  bases.forEach(function (base) {
    PRODUCTS.forEach(function (product) {
      var dir = path.join(base, product, 'User');
      if (fs.existsSync(dir)) found.push({ name: product, dir: dir });
    });
  });
  return found;
}

// ------------------------------------------------------------------ check

function requiredBindings(platform) {
  var req = readJsonc(path.join(CONF, 'keybindings.jsonc')).slice();
  if (platform === 'win') {
    req = req.concat(readJsonc(path.join(CONF, 'keybindings.windows.jsonc')));
  }
  return req;
}

function requiredSkipShell() {
  return readJsonc(path.join(CONF, 'settings.jsonc'))['terminal.integrated.commandsToSkipShell'] || [];
}

function checkEditor(entry, platform, verbose) {
  var problems = [];
  var notes = [];

  var kbFile = path.join(entry.dir, 'keybindings.json');
  var live = [];
  if (!fs.existsSync(kbFile)) {
    problems.push('no keybindings.json at all — paste the whole file');
  } else {
    try {
      live = readJsonc(kbFile) || [];
    } catch (e) {
      problems.push(e.message);
      live = null;
    }
  }
  if (live) {
    requiredBindings(platform).forEach(function (want) {
      var hit = live.some(function (have) { return sameBinding(want, have); });
      if (hit) { if (verbose) notes.push('ok      ' + describe(want)); }
      else {
        // a same-chord-different-command entry is worth calling out: it
        // means something else already answers that key
        var clash = live.filter(function (have) {
          return normKey(have.key) === normKey(want.key) && have.command !== want.command;
        });
        problems.push('missing ' + describe(want) +
          (clash.length ? '\n            (that chord is bound to ' +
            clash.map(function (c) { return c.command; }).join(', ') + ')' : ''));
      }
    });
  }

  var setFile = path.join(entry.dir, 'settings.json');
  var skip = null;
  if (!fs.existsSync(setFile)) {
    problems.push('no settings.json — add terminal.integrated.commandsToSkipShell');
  } else {
    try {
      skip = (readJsonc(setFile) || {})['terminal.integrated.commandsToSkipShell'];
    } catch (e) {
      problems.push(e.message);
    }
  }
  if (skip !== null) {
    var have = skip || [];
    var missing = requiredSkipShell().filter(function (cmd) { return have.indexOf(cmd) < 0; });
    if (missing.length) {
      problems.push('commandsToSkipShell is missing ' + missing.length + ':\n            ' +
        missing.join('\n            ') +
        '\n            (symptom: these do nothing while the terminal has focus)');
    } else if (verbose) {
      notes.push('ok      commandsToSkipShell has all ' + requiredSkipShell().length);
    }
  }

  return { problems: problems, notes: notes };
}

// ------------------------------------------------------------------- main

var args = process.argv.slice(2);
var verbose = args.indexOf('--verbose') >= 0;
var platArg = (args.filter(function (a) { return a.indexOf('--platform=') === 0; })[0] || '').split('=')[1];
var dirArg = (args.filter(function (a) { return a.indexOf('--dir=') === 0; })[0] || '').split('=')[1];
var platform = platArg || (process.platform === 'darwin' ? 'mac' :
  process.platform === 'win32' ? 'win' : 'linux');

if (['mac', 'win', 'linux'].indexOf(platform) < 0) {
  console.error('ABORT: --platform must be mac, win or linux');
  process.exit(1);
}

if (args[0] === 'print') {
  console.log('// ---- keybindings.json  (merge into the array)');
  console.log(JSON.stringify(requiredBindings(platform), null, 2));
  console.log('\n// ---- settings.json  (merge into the object)');
  console.log(JSON.stringify({
    'terminal.integrated.commandsToSkipShell': requiredSkipShell()
  }, null, 2));
  process.exit(0);
}

var editors = dirArg ? [{ name: path.basename(path.dirname(dirArg)), dir: dirArg }]
  : userDirs(platform);

console.log('platform: ' + platform + '   (config: os/vscode/)');

if (!editors.length) {
  console.error('\nNo VS Code-family User/ directory found. Looked for ' +
    PRODUCTS.join(', ') + '.\nPass --dir=PATH if yours lives somewhere else.');
  process.exit(1);
}

var bad = 0;
editors.forEach(function (entry) {
  var res;
  try {
    res = checkEditor(entry, platform, verbose);
  } catch (e) {
    res = { problems: [e.message], notes: [] };
  }
  console.log('\n' + entry.name + '  ' + entry.dir);
  res.notes.forEach(function (n) { console.log('    ' + n); });
  if (!res.problems.length) {
    console.log('    all good');
  } else {
    bad++;
    res.problems.forEach(function (p) { console.log('    ' + p); });
  }
});

if (bad) {
  console.log('\n' + bad + ' of ' + editors.length + ' need work. To see what to paste:');
  console.log('  node tools/vscode-config.js print --platform=' + platform);
  process.exit(1);
}
console.log('\nEverything os/vscode/ asks for is installed.');
