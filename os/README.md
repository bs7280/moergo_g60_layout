# os/ — the machine side

A keymap can only send keystrokes. Everything the layout *means* beyond
that — "focus the pane to my left", "send this window to the left monitor",
"bring the mouse with me" — is configuration on the receiving machine. That
config is the other half of the layout, and it lives here so a new machine
is a checkout plus a few pastes rather than an archaeology project.

| | what | machines |
| --- | --- | --- |
| [`vscode/`](vscode/) | the editor half of the `VSCode_macOS` / `VSCode_Win` layers — custom chords, and the one setting that keeps them alive inside the integrated terminal | mac ✅ · windows ⬜ |
| [`host-switch/`](host-switch/) | the mouse follows the keyboard: Magic-layer BT keys push the MX Master 3S to the same host. Hammerspoon on the Mac; on Windows either a dependency-free Python listener or the AutoHotkey one | mac ✅ · windows ✅ |
| [`wm/`](wm/) | the WM daemons behind the `WM_Win` / `WM_practice` layers. macOS: Hammerspoon, 27 actions, hand-rolled directional geometry. Windows: Python, `RegisterHotKey` + `WM_HOTKEY`, no admin — proven on real 3-monitor hardware but still only on that machine. `data/wm-actions.js` describes what every key does on both | mac ✅ · windows ✅ (uncommitted) |

Two rules everything here follows:

- **No admin rights, anywhere.** Deliberate — one of these machines is a
  locked-down work laptop. User-profile JSON, a user-level HID write, a
  portable AutoHotkey exe. Nothing that needs an installer or an
  administrator. Where even *installing* is off the table, the fallback is
  stdlib Python and `ctypes` against the Win32 API — which is what both
  `host-switch/windows/host_switch.py` and the WM daemon do.
- **Chords are a shared namespace.** OS-global hotkeys (the WM daemons,
  host-switch) win over application bindings (VS Code) no matter what has
  focus, so the F13–F24 space is divided up on purpose. The registry lives
  in [`vscode/README.md`](vscode/README.md#chord-registry); check it before
  claiming anything new.
