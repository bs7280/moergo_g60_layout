# vscode/ — the editor half of the apps layers

The keyboard has two VS Code layers, `VSCode_macOS` (16) and `VSCode_Win`
(17), reached one way: **Magic + `N`** (macOS) / **Magic + `M`** (Windows).
That is a `&to`, so it latches — you stay in the layer until you Magic back
out to a base, Typing or Autoshift, exactly like the WM layers one row up.
21 keys are bound on each. This folder is everything the editor needs on the
other end of that — and, just as importantly, a written record of how little
that is and why.

> **There is no hold door any more, and that is deliberate.** Until
> 2026-08-31 the layer was held on the `RAlt` thumb (#57), which cost the
> board its only Option/Alt key outside the home-row mods; that thumb is a
> plain `&kp RALT` again. No other key can take over the hold: both quads use
> all four fingers of their hand, so any pinky-column door blocks its own
> hand — `'` blocks `;` (focus-right), `Esc`/`Tab` block `A` (move-left).
> Thumbs are the only non-quad fingers and all six are spoken for. See
> PLAN.md for the full walk-through.

`vscode.html` in the repo root draws the layer as *what it does*; this file
covers *what to install so it does it*.

```sh
node tools/vscode-config.js              # is this machine set up?
node tools/vscode-config.js print        # the exact block to paste
```

## Design rule: defaults-first

Wherever VS Code or the Claude extension already ships a chord for a
command, **the keyboard emits that chord** rather than a made-up one. That
is why the layer has per-OS twins at all: `⌘⇧T` on the Mac and `Ctrl+⇧T` on
Windows are the same command with different factory chords, so the two
layers differ at those positions and nowhere else.

The payoff is that muscle memory survives a bare laptop with no Go60
attached, and that the install here stays small enough to actually do on a
locked-down machine.

Of the 21 bound keys:

| | mac | win |
| --- | --- | --- |
| ride an existing VS Code / extension default — **install nothing** | 10 | 8 |
| need a custom entry in `keybindings.json` | 11 | 13 |

The 11 shared ones are the commands VS Code genuinely ships **unbound**:
the four `navigate*` panel-focus commands, the five
`moveEditorTo*Group`/`toggleMaximize*` movement commands, the terminal
profile picker, and the MRU-editor swap. Windows adds two more because
Windows itself steals the Claude extension's chords — see below.

## The three things that have to be true

1. **The custom chords are bound** — `keybindings.jsonc`, plus
   `keybindings.windows.jsonc` on Windows.
2. **The chords reach VS Code at all.** Nothing else on the machine may
   claim them as a *global* hotkey; see §Chord registry.
3. **They still work when the terminal has focus** — `settings.jsonc`.
   Miss this one and everything appears to work until you test it from a
   terminal pane, then appears completely broken. It cost a real debugging
   session on 2026-08-25.

## The files

| file | what | where it goes |
| --- | --- | --- |
| `keybindings.jsonc` | the 11 custom chords + 2 personal terminal-focus bindings. Identical on both OSes | merge into `keybindings.json` |
| `keybindings.windows.jsonc` | 4 more entries, Windows only — the Claude extension remaps | merge into `keybindings.json` |
| `settings.jsonc` | `terminal.integrated.commandsToSkipShell` — 10 command IDs | merge into `settings.json` |

`keybindings.jsonc` is verbatim what is installed on the Mac today —
`node tools/vscode-config.js` on that machine reports `all good` against
this exact file, which is what makes "the macOS config is in the repo" a
checkable claim rather than an assertion.

## Where it goes

Open the files from inside the editor rather than hunting for paths —
`Ctrl+Shift+P` → **Preferences: Open Keyboard Shortcuts (JSON)** and
**Preferences: Open User Settings (JSON)**. They land in:

| OS | directory |
| --- | --- |
| macOS | `~/Library/Application Support/<product>/User/` |
| Windows | `%APPDATA%\<product>\User\` |
| Linux | `~/.config/<product>/User/` |

…where `<product>` is `Code`, `Cursor`, `Code - Insiders`, `VSCodium` or
`Windsurf`. Nothing here is VS Code-specific beyond the command IDs, so
every fork in that family takes the same config; this Mac has it in both
`Code` and `Cursor`. `tools/vscode-config.js` checks all of them.

None of this needs admin rights — it is a user-profile JSON file, which is
the whole reason the layer was designed around editor config instead of an
input remapper.

## Building the Windows side

1. **Flash the board** if you haven't. `VSCode_Win` is layer 17; the WM
   side is separate and already done. Check with
   `node tools/keymap.js show 17`.
2. **Install the Claude Code extension** first if you want the two
   Claude keys — the command IDs are only real once it's installed.
3. **Paste the keybindings.** Open Keyboard Shortcuts (JSON) and merge
   *both* `keybindings.jsonc` and `keybindings.windows.jsonc` into the one
   top-level array. `node tools/vscode-config.js print --platform=win`
   emits both, already merged, as plain JSON.
4. **Paste the setting.** Merge `settings.jsonc` into User Settings (JSON).
5. **Verify:** `node tools/vscode-config.js` on that machine. It reads the
   editor's real files and lists anything missing, including "that chord is
   already bound to something else."
6. **Test from a terminal pane, not just an editor pane.** That is the case
   step 4 exists for, and the only one that fails silently.

### Windows-specific gotchas

**Windows eats the Claude extension's own chords.** The extension's
defaults are `Ctrl+Esc` (focus/blur) and `Ctrl+Shift+Esc` (open in new
tab). On Windows those are the **Start menu** and **Task Manager** — the
shell takes them before any application is consulted, so the defaults-first
rule can't apply. This is the entire reason `keybindings.windows.jsonc`
exists: the layer sends `Shift+F17` / `Shift+F18` at those two positions
instead, and those entries point them at the real commands.

**Focus/blur is one chord and three commands.** The extension discriminates
by `when` clause (`editorTextFocus`, and whether `claudeCode.useTerminal`
is on), so all three entries have to be pasted or the toggle only works in
one direction. They're all in the file.

**Don't let the WM daemon claim these chords.** The Windows WM daemon
registers its hotkeys with `RegisterHotKey`, which is system-global and
wins over any application — including a focused VS Code. It owns bare,
`Ctrl+`, `Alt+` and `Shift+` `F13`–`F24`. The VS Code chords deliberately
sit outside that: `Ctrl+Shift+F13`–`F16`, `Alt+Shift+F13`–`F17`, and
`Shift+F17`–`F19`. If a chord here stops working on Windows and works on
the Mac, a global registration is the first thing to check.

**PowerToys**, if it's running, also grabs hotkeys globally. Same test.

## Chord registry

The claims to honour when adding anything to F-key space. Two of these
were nearly stepped on during planning, which is why the table exists.

| bank | owner | scope |
| --- | --- | --- |
| bare / `Ctrl` / `Alt` / `Shift` + `F13`–`F24` | WM daemons (Hammerspoon, Windows Python daemon) | OS-global |
| `Ctrl+Shift+F17`–`F19` | mouse host-switch (`os/host-switch/`) | OS-global |
| `Ctrl+Shift+F13`–`F16` | VS Code panel-focus quad | app-local |
| `Alt+Shift+F13`–`F17` | VS Code move-tab quad + maximize | app-local |
| `Shift+F17`–`F19` | Claude focus / new session (Windows) + terminal profile picker | app-local |
| `Shift+F16`, `Shift+F20` | free — the only space left, spend deliberately | — |

`F21`–`F24` are usable on Windows only: macOS has no Carbon keycode for
them, so nothing there can be bound to them (see PLAN.md). The `WM_Win`
layer uses them; no macOS layer can.

Note how close two of these run: host-switch owns `Ctrl+Shift+F17`–`F19`
and VS Code owns `Ctrl+Shift+F13`–`F16` — adjacent banks, opposite scopes.
An OS-global claim anywhere in `Ctrl+Shift+F13`–`F16` would silently kill
the panel-focus quad in every app.

## Deliberately not here

- **The rest of `settings.json`.** Formatter choices, Bazel excludes and
  `go.goroot` paths are personal and machine-specific, and some carry work
  paths that don't belong in a public repo. Nothing in them affects the
  keyboard. Worth copying by hand to a new machine if you want the same
  editor feel: `workbench.panel.defaultLocation: "right"`,
  `claudeCode.preferredLocation: "panel"`, `editor.minimap.enabled: false`,
  and the `explorer.fileNesting.patterns` block.
- **The WM daemons.** The Windows one (Python, `RegisterHotKey` +
  `WM_HOTKEY`, no admin) lives on that machine and isn't vendored here yet;
  the macOS one doesn't exist. `data/wm-actions.js` describes what each key
  is supposed to do on both. That's the next thing this folder should grow.
- **An installer.** Merging JSONC into a hand-commented file without
  wrecking the comments is a real problem and not worth solving for a
  two-minute paste, so `tools/vscode-config.js` is read-only: it tells you
  what's missing and prints what to paste.
