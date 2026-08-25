-- Mouse-follows-keyboard, macOS side. The Magic-layer BT keys tap
-- Ctrl+Shift+F17-F19 before hopping (tools/edits/bt-mouse-follow.js); this
-- turns each tap into an HID++ ChangeHost push of the MX Master 3S.
-- Load from ~/.hammerspoon/init.lua:
--   dofile(".../host-switch/mac/init.lua")

local HIDAPITESTER = os.getenv("HOME") .. "/bin/hidapitester"

-- The mouse pairs to this Mac over Bluetooth (046D:B034). A machine using
-- the Bolt receiver instead needs the 7-byte form — see ../README.md.
local function pushMouse(channel) -- mouse channel, 1-based
  hs.task.new(HIDAPITESTER, nil, {
    "--vidpid", "046D:B034", "--usagePage", "0xFF43", "--usage", "0x0202",
    "--open", "--length", "20",
    "--send-output", string.format("0x11,0x02,0x0A,0x1e,0x%02X", channel - 1),
  }):start()
end

-- Same table on every machine: the hotkey names where the KEYBOARD is going;
-- push the mouse to that machine's mouse channel. Receiving the hotkey for
-- the machine you're already on is a harmless no-op.
hs.hotkey.bind({ "ctrl", "shift" }, "f17", function() pushMouse(2) end) -- Mac
hs.hotkey.bind({ "ctrl", "shift" }, "f18", function() pushMouse(1) end) -- work laptop
hs.hotkey.bind({ "ctrl", "shift" }, "f19", function() pushMouse(3) end) -- Windows desktop
-- F20 (profile 3) is unused on the keyboard side.
