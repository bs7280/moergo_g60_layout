# host-switch/ — the mouse follows the keyboard

The Magic-layer BT keys don't just hop the keyboard anymore: each one first
taps **Ctrl+Shift+F17–F19** (see `tools/edits/bt-mouse-follow.js`), and a tiny
listener on each machine turns that into an HID++ `ChangeHost` push that sends
the MX Master 3S to the same destination. The listener is Hammerspoon on the
Mac, AutoHotkey on Windows; the actual push is one
[`hidapitester`](https://github.com/todbot/hidapitester) command.

Why a hotkey and not a daemon: `ChangeHost` only works from the machine the
mouse is *currently* on — you can push the mouse away, never pull it. The BT
key fires while the keyboard is still talking to the machine being left, which
is exactly the machine that owns the mouse. Ordering solved by construction.

## The table (same on every machine)

| hotkey | keyboard goes to | mouse channel to push |
| --- | --- | --- |
| Ctrl+Shift+F17 | macOS | 2 |
| Ctrl+Shift+F18 | work laptop | 1 |
| Ctrl+Shift+F19 | personal Windows | 3 |

Every machine binds all three. Receiving the hotkey for the machine you're
already on means the keyboard wasn't going anywhere — the push is a no-op.

Nothing here needs admin rights on any OS. `hidapitester` is a single static
binary, and user-level HID access is enough to write to the mouse's vendor
collection.

## macOS

```sh
mkdir -p ~/bin && cd ~/bin
curl -sLO https://github.com/todbot/hidapitester/releases/download/v0.6/hidapitester-macos-universal.zip
unzip -o hidapitester-macos-universal.zip && rm hidapitester-macos-universal.zip
chmod +x hidapitester && xattr -d com.apple.quarantine hidapitester 2>/dev/null
```

Install [Hammerspoon](https://www.hammerspoon.org), then add to
`~/.hammerspoon/init.lua`:

```lua
dofile("/Users/benshaughnessy/code/keyboard_layout_visualizer/host-switch/mac/init.lua")
```

Reload the Hammerspoon config. If the hotkeys don't fire, grant Hammerspoon
Accessibility (System Settings → Privacy & Security) — user-level, no admin.

## Windows (both machines)

Make a folder, e.g. `%USERPROFILE%\host-switch\`, containing:

1. `hidapitester.exe` — from the
   [v0.6 release](https://github.com/todbot/hidapitester/releases/tag/v0.6)
   (`hidapitester-windows-x86_64.zip`)
2. [AutoHotkey v2](https://www.autohotkey.com) — the **portable zip** works
   from any folder, no installer
3. `host-switch.ahk` from `windows/` here

Edit the two constants at the top of the script — `CONNECTION` is `"BT"` or
`"BOLT"` depending on how the mouse pairs to *that* machine, and `BOLT_SLOT`
matters only for the receiver. Then autostart it without admin: `Win+R` →
`shell:startup` → drop in a shortcut to
`AutoHotkey64.exe <path>\host-switch.ahk`.

If IT blocks the unsigned exes on the work laptop, the same HID writes can be
done from pure Python (`pip install --user hid` or the approach in
[logitech-flow-kvm](https://github.com/coddingtonbear/logitech-flow-kvm)) —
still no admin.

## Finding the Bolt slot (receiver machines only)

With the mouse ON that machine via the Bolt receiver, try slot `0x01`, then
`0x02` if it times out:

```
hidapitester --vidpid 046D:C548 --usage 0x0001 --usagePage 0xFF00 --open --length 7 --timeout 2500 --send-output 0x10,0x01,0x0A,0x0d,0x00,0x00,0x00 --read-input
```

The slot that answers `... 0A 0D 03 0N 00` is the mouse: `03` = three
channels, `0N` = current channel, 0-based. Put that slot in `BOLT_SLOT`.

## Testing without yanking the mouse

The same read is safe over Bluetooth (this is `ChangeHost getHostInfo`,
read-only):

```
hidapitester --vidpid 046D:B034 --usagePage 0xFF43 --usage 0x0202 --open --length 20 --timeout 2500 --send-output 0x11,0x02,0x0A,0x0d --read-input
```

Expect `11 02 0A 0D 03 01 ...` on the Mac — 3 channels, currently channel 2
(`01`, 0-based). Once that answers, test a real push from a machine the mouse
is on, with another input device handy to push it back — or just press the
matching Magic-layer BT key, which is the whole point.

## Anatomy of the push

```
0x11  0x02  0x0A  0x1e  0xNN     Bluetooth form (20-byte report, rest zeros)
0x10  slot  0x0A  0x1e  0xNN     Bolt form (7-byte report)
 |     |     |     |     └ target channel minus 1
 |     |     |     └ function 1 (setCurrentHost) | software id
 |     |     └ ChangeHost (0x1814) feature index on the MX Master 3S
 |     └ device index: 0x02 over BT, receiver slot over Bolt
 └ HID++ report id: 0x11 long / 0x10 short
```
