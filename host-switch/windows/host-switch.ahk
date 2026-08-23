; Mouse-follows-keyboard, Windows side. The Magic-layer BT keys tap
; Ctrl+Shift+F17-F19 before hopping (tools/edits/bt-mouse-follow.js); this
; turns each tap into an HID++ ChangeHost push of the MX Master 3S.
; Needs hidapitester.exe next to this script. Autostart without admin:
; shell:startup -> shortcut to "AutoHotkey64.exe <path>\host-switch.ahk".
#Requires AutoHotkey v2.0
#SingleInstance Force

; How the mouse pairs to THIS machine: "BT" (direct Bluetooth) or "BOLT"
; (the USB receiver). For BOLT, set the receiver slot the mouse occupies
; (1 or 2) — probe command in ../README.md.
CONNECTION := "BT"
BOLT_SLOT := 1

HID := A_ScriptDir "\hidapitester.exe"

PushMouse(channel) { ; mouse channel, 1-based
    host := Format("0x{:02X}", channel - 1)
    if (CONNECTION = "BOLT")
        args := "--vidpid 046D:C548 --usage 0x0001 --usagePage 0xFF00 --open --length 7 --send-output 0x10,"
            . Format("0x{:02X}", BOLT_SLOT) . ",0x0A,0x1e," . host . ",0x00,0x00"
    else
        args := "--vidpid 046D:B034 --usagePage 0xFF43 --usage 0x0202 --open --length 20 --send-output 0x11,0x02,0x0A,0x1e," . host
    Run('"' HID '" ' args, , "Hide")
}

; Same table on every machine: the hotkey names where the KEYBOARD is going;
; push the mouse to that machine's mouse channel. Receiving the hotkey for
; the machine you're already on is a harmless no-op.
^+F17::PushMouse(2) ; Mac
^+F18::PushMouse(1) ; work laptop
^+F19::PushMouse(3) ; Windows desktop
; F20 (profile 3) is unused on the keyboard side.
