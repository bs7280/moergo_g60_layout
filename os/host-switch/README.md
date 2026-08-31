# host-switch/ — the mouse follows the keyboard

The Magic-layer BT keys don't just hop the keyboard anymore: each one first
taps **Ctrl+Shift+F17–F19** (see `tools/edits/bt-mouse-follow.js`), and a tiny
listener on each machine turns that into an HID++ `ChangeHost` push that sends
the MX Master 3S to the same destination.

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

Both halves of every row are confirmed. `bt_hop_0` is the leftmost of the
four Magic-layer BT keys and goes to the Mac, then work, then the desktop;
the mouse channels are as above.

| machine | mouse channel | how we know |
| --- | --- | --- |
| macOS | 2 | read back off the mouse — `ChangeHost getHostInfo` answered `03 01`, i.e. 3 hosts, currently channel 2 |
| work laptop | 1 | Ben, from the channel button he'd otherwise be pressing |
| personal Windows | 3 | same |

The Mac row is worth having both ways, because it pins the two numbering
schemes together: the channel the mouse *reports* over HID++ is the same
number as the one on its underside button. That's what makes the other two
rows trustworthy without reading them back — they're known in button
numbers, and the protocol speaks button numbers.

What's still unproven here is the *code*, not the table. If a hop sends the
mouse somewhere unexpected, suspect the listener before suspecting these
numbers. Correcting a row is a one-line edit on one machine and no reflash:
the keymap only ever says *which BT profile*, never which mouse channel, so
every mapping question is answered script-side on purpose.

## The listeners

| | listener | HID write | needs |
| --- | --- | --- | --- |
| macOS | `mac/init.lua` | `hidapitester` | Hammerspoon + one binary |
| Windows | **`windows/host_switch.py`** | itself, via `ctypes` | Python. Nothing else |
| Windows | `windows/host-switch.ahk` | `hidapitester.exe` | AutoHotkey + one binary |

Nothing here needs admin rights on any OS — deliberate, one of these machines
is a locked-down work laptop. The Python listener goes further and needs
nothing *installed*: no `pip install`, no unsigned exe for AppLocker or EDR to
have an opinion about, no portable interpreter to smuggle in. It is one
standard-library file that talks to `setupapi.dll` and `hid.dll` directly. Use
it on the work laptop; the AutoHotkey script is still the shorter answer on a
machine where AHK is already welcome.

## Windows, the Python listener

Copy `windows/host_switch.py` anywhere in your profile. Then:

```
python host_switch.py probe
```

`probe` only reads, so it can't strand the mouse on a machine you can't reach
it from. It prints every Logitech HID interface it can see, which link it would
use, the ChangeHost feature index it read back off the device, and how many
hosts the mouse has and which one it's on right now. If that last part lines up
with reality, the wiring is sound.

```
python host_switch.py switch 2   # push once, by hand
python host_switch.py run        # the listener
pythonw host_switch.py run       # ...with no console window
```

Autostart without admin: `Win+R` → `shell:startup` → drop in a shortcut to
`pythonw.exe <path>\host_switch.py`. `pythonw` has no stdout to lose, so the
listener always also appends to `host-switch.log` next to the script.

Before trusting it with the mouse, prove the chords arrive:

```
python host_switch.py run --dry-run
```

Then press the Magic-layer BT keys. Every chord that reaches the listener is
logged and nothing moves. A chord that doesn't show up was eaten by something
with an earlier `RegisterHotKey` claim — the WM daemon, PowerToys, or a second
copy of this script (the log says which chords it failed to claim, and why).

There's nothing to configure for the common case. It finds the mouse by HID
usage page rather than product id, so a re-pair, a Windows BLE product-id
change, or a different Logitech mouse all still work; it prefers a direct
Bluetooth link over a receiver, because if the mouse is on this machine over
Bluetooth then that's the link that owns it; and if it's on a Bolt receiver it
probes the receiver slots itself. `probe` prints the slot it found — put it in
`BOLT_SLOT` at the top of the file to skip that at startup. The `MACHINES`
table at the top is the table above, and the only thing worth editing if the
channel assignment ever changes.

It checks itself, from any machine, no mouse required:

```
python3 windows/test_host_switch.py
```

That asserts the reports it builds are byte-for-byte the commands documented
below, and that discovery, retry and the machine table behave. Worth running
after touching either file — four wrong bytes send the mouse somewhere you then
can't reach it from.

## Windows, the AutoHotkey listener

Make a folder, e.g. `%USERPROFILE%\host-switch\`, containing:

1. `hidapitester.exe` — from the
   [v0.6 release](https://github.com/todbot/hidapitester/releases/tag/v0.6)
   (`hidapitester-windows-x86_64.zip`)
2. [AutoHotkey v2](https://www.autohotkey.com) — the **portable zip** works
   from any folder, no installer
3. `host-switch.ahk` from `windows/` here

Edit the two constants at the top of the script — `CONNECTION` is `"BT"` or
`"BOLT"` depending on how the mouse pairs to *that* machine, and `BOLT_SLOT`
matters only for the receiver (`host_switch.py probe` will tell you both).
Then autostart it without admin: `Win+R` → `shell:startup` → drop in a
shortcut to `AutoHotkey64.exe <path>\host-switch.ahk`.

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
dofile("/Users/benshaughnessy/code/keyboard_layout_visualizer/os/host-switch/mac/init.lua")
```

Reload the Hammerspoon config. If the hotkeys don't fire, grant Hammerspoon
Accessibility (System Settings → Privacy & Security) — user-level, no admin.

## Finding the Bolt slot by hand (receiver machines only)

`host_switch.py probe` does this for you. With `hidapitester`, and the mouse ON
that machine via the Bolt receiver, try slot `0x01`, then `0x02` if it times
out:

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

The feature index is per-device, not per-model, so `0x0A` is a fact about this
mouse rather than about `ChangeHost`. `host_switch.py` asks the device for it
at startup — root feature `0x00`, function 0, with `0x18 0x14` as the argument,
which answers with the index — and only falls back to `0x0A` if the device
won't answer a read. The software id (the low nibble of byte 3) is arbitrary;
`0x0d`/`0x1e` here just reproduce the commands above exactly.
