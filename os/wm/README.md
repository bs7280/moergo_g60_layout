# wm/ — the WM daemons behind the WM layers

The keyboard's WM layer emits one-modifier-deep `F13`–`F20` chords; a daemon
on each machine turns them into window operations. The authoritative
chord→action table is [`data/wm-actions.js`](../../data/wm-actions.js) — both
daemons implement its rows, and the cheat sheet (`wm.html`) renders them.

| | daemon | status |
| --- | --- | --- |
| macOS | `mac/init.lua`, Hammerspoon | ✅ installed on the Mac 2026-08-29 |
| Windows | Python, `RegisterHotKey` + `WM_HOTKEY` | ✅ proven on the work laptop, still uncommitted — belongs at `windows/` here |

## macOS

27 actions: directional focus, focus-toggle, focus-monitor, spatial window
cycle, directional swap, halves/quarters/full/center placement, resize about
center, minimize/restore. No workspaces on macOS — Mission Control covers
the need, and `hs.spaces.moveWindowToSpace` is broken on Sequoia (#3698).

Focus, swap and cycle are hand-rolled geometry (the Windows daemon's
algorithm: candidates whose center lies in the target direction, prefer
perpendicular-axis overlap, nearest wins, never wrap) rather than
`hs.window:focusWindowWest()` and friends, which have open correctness bugs
(#2558, #3574).

### Install

[Hammerspoon](https://www.hammerspoon.org) in `~/Applications` (clear the
quarantine bit or macOS runs it translocated, which breaks the `hs` CLI
symlink on every relaunch), Accessibility granted, and this
`~/.hammerspoon/init.lua`:

```lua
-- Thin loader — everything real lives in the keyboard repo, so the upgrade
-- path is `git pull` + Reload Config.
require("hs.ipc")
hs.ipc.cliInstall(os.getenv("HOME")) -- `hs` CLI into ~/bin

local REPO = "/Users/benshaughnessy/code/keyboard_layout_visualizer"
for _, rel in ipairs({
  "/os/host-switch/mac/init.lua", -- the mouse follows the keyboard
  "/os/wm/mac/init.lua",          -- the WM daemon behind the WM_practice layer
}) do
  local ok, err = pcall(dofile, REPO .. rel)
  if not ok then
    print("load failed: " .. rel .. "\n" .. tostring(err))
    hs.notify.new({ title = "Hammerspoon", informativeText = "load failed: " .. rel }):send()
  end
end
```

### What else has to be true on the machine

The chords only reach Hammerspoon if nothing upstream claims them first.
Three things held them on this Mac and had to be cleared (2026-08-29):

- **macOS brightness shortcuts** owned bare `F14`/`F15` (symbolic hotkeys
  53/54 — enabled by default, invisible in the plist until overridden).
  Disabled via `defaults write com.apple.symbolichotkeys`.
- **v1's Mission Control bindings** put move-space on `Ctrl+F14`/`F15`
  (ids 79–82), shadowing swap-↑/↓. Reset to factory `Ctrl+←`/`→`.
- **Rectangle** still carried the whole v1 F-key config. Quit; the daemon
  replaces it.

A leftover global App Shortcut `Minimize = ⇧F15` (v1) is harmless while the
daemon runs (the hotkey wins) but should be deleted:
`defaults delete -g NSUserKeyEquivalents`, or System Settings → Keyboard →
App Shortcuts.

### Checking it

```sh
~/bin/hs -c 'print(WM.selftest())'  # pure-geometry checks, moves nothing
~/bin/hs -c 'print(WM.status())'    # accessibility, 27/27 bound, history
```

`selftest` runs the directional/ordering algorithm against a synthetic
two-monitor layout, so it works with no windows open and no Accessibility.
`status` says whether all 27 chords actually registered — a missing one
means something else claimed it (see above).

Two gotchas for headless poking, both learned the hard way (2026-08-29):
redirect stdin — `hs -c '...' < /dev/null` — because after `-c` the CLI
also reads stdin for more commands and will sit forever on a pipe that
never closes, *after* the payload already ran; and don't test hotkeys with
`hs.eventtap.keyStroke` — synthetic events don't trigger Carbon hotkeys on
this machine, so only a real keypress proves that link.

## Windows

The daemon lives on the work laptop and is still uncommitted; it belongs at
`windows/` here. `RegisterHotKey` + `WM_HOTKEY`, `ctypes` against user32 and
dwmapi, no admin and nothing to install — same constraints as
`../host-switch/windows/host_switch.py`, for the same reason. 41 actions:
everything macOS has, plus the 14 minimize-based workspace keys on `F21`-`F24`.

### 2026-09-01 — six chords moved off native Snap, so the daemon owns them now

`WM_Win` used to send native `Win`+arrow for the four place-halves (positions
31-34) and for minimize/restore (51-52) — the one part of the board the daemon
didn't cover. It doesn't any more. Those six positions now emit exactly what
the macOS layer emits:

| position | was | now | action |
| --- | --- | --- | --- |
| 31 | `Win+←` | `F17` | place region=left |
| 32 | `Win+↑` | `F18` | place region=top |
| 33 | `Win+↓` | `F19` | place region=bottom |
| 34 | `Win+→` | `F20` | place region=right |
| 51 | `Win+↓` | `Alt+F16` | minimize |
| 52 | `Win+↑` | `Alt+F17` | restore |

**The daemon has to be binding all six before this flash is an improvement.**
Everything else on the layer was already going to it; these are the only new
rows. If a half-snap does nothing after reflashing, that chord is what to
check first.

Why bother: Snap was never quite the intent. `Win+↑` maximizes rather than
taking the top half, `Win+↓` un-maximizes before it minimizes (so the same key
means two things depending on state), and Windows 11 answers `Win+←` with a
Snap Layouts flyout instead of just snapping. Depending on it also meant the
layer behaved differently on two Windows machines that are supposed to be one
muscle memory. With this change all 27 shared actions emit the same chord on
both OS layers, and the daemon — not the OS — is the only thing that differs.

`data/wm-actions.js` no longer carries a `winKey` field at all; `key` is the
one chord for both layers.
