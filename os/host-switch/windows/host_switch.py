#!/usr/bin/env python3
"""The mouse follows the keyboard, Windows side. No admin, no install, no deps.

The Magic-layer BT keys tap Ctrl+Shift+F17-F19 before hopping profiles
(tools/edits/bt-mouse-follow.js). This listens for those chords and turns each
one into an HID++ ChangeHost push, so the MX Master 3S lands on the same
machine the keyboard just went to.

Same job as host-switch.ahk, for machines where AutoHotkey and hidapitester.exe
can't be installed: CPython + ctypes, standard library only. Nothing to pip
install, no unsigned exe for AppLocker or EDR to object to, no elevation.
RegisterHotKey for the chords (the same mechanism the Windows WM daemon already
uses on this hardware) and setupapi/hid.dll for the HID write.

    python host_switch.py                # run the listener
    pythonw host_switch.py               # ...with no console window
    python host_switch.py probe          # what's connected, is the wiring sound
    python host_switch.py info           # how many hosts, which one the mouse is on
    python host_switch.py switch 2       # push to channel 2, no hotkey involved
    python host_switch.py run --dry-run  # prove the chords arrive, move nothing

Start with `probe`. It only reads, so it can't strand the mouse on another
machine, and it prints every number the push depends on.
"""

# --------------------------------------------------------------------- config

# The table, identical on every machine: the chord names where the KEYBOARD is
# going, the value is that machine's mouse channel (1-based, as on the mouse's
# own button). Receiving the chord for the machine you are already on is a
# harmless no-op. F20 (BT profile 3) is deliberately unmapped.
MACHINES = {
    "F17": (2, "macOS"),
    "F18": (1, "work laptop"),
    "F19": (3, "personal Windows"),
}

# Bolt/Unifying receiver only: which receiver slot the mouse is paired into.
# None probes for it once at startup. Ignored when the mouse reaches this
# machine over Bluetooth, which needs no slot at all.
BOLT_SLOT = None

# ChangeHost (HID++ feature 0x1814) index on the MX Master 3S. Resolved from the
# device at startup; this is only the fallback for when the device won't answer
# a read. 0x0A is verified on Ben's mouse.
CHANGEHOST_FALLBACK = 0x0A

# ------------------------------------------------------------------- /config

import argparse
import ctypes
import os
import sys
import threading
import time
from collections import namedtuple
from ctypes import wintypes

if sys.platform != "win32":
    sys.exit("host_switch.py is the Windows listener; macOS uses ../mac/init.lua")

hid = ctypes.WinDLL("hid")
setupapi = ctypes.WinDLL("setupapi")
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
user32 = ctypes.WinDLL("user32", use_last_error=True)

VID_LOGITECH = 0x046D

# Two ways the mouse can be reachable, each its own HID usage page. Matching on
# usage page rather than product id is deliberate: it survives a different
# Logitech mouse, a re-pair, and the BLE product id varying by Windows version.
UP_BLUETOOTH = 0xFF43  # mouse paired straight to this machine
USAGE_BT_LONG = 0x0202
UP_RECEIVER = 0xFF00  # mouse reached through a Bolt/Unifying receiver
USAGE_RECV_SHORT = 0x0001

REPORT_LONG = 0x11  # 20-byte HID++ report
REPORT_SHORT = 0x10  # 7-byte HID++ report
DEVICE_INDEX_BT = 0x02  # device index over direct Bluetooth (verified)

# HID++ software id. Arbitrary (any of 1-15), but these two values reproduce the
# exact bytes documented in ../README.md, so a capture matches the docs.
SWID_GET = 0x0D
SWID_SET = 0x0E

FEATURE_ROOT = 0x00
FEATURE_ID_CHANGEHOST = 0x1814
ERROR_FEATURE_INDEX = 0xFF

VK = {"F13": 0x7C, "F14": 0x7D, "F15": 0x7E, "F16": 0x7F, "F17": 0x80,
      "F18": 0x81, "F19": 0x82, "F20": 0x83, "F21": 0x84, "F22": 0x85,
      "F23": 0x86, "F24": 0x87}
MOD_SHIFT, MOD_CONTROL, MOD_NOREPEAT = 0x0004, 0x0002, 0x4000
WM_HOTKEY, WM_QUIT = 0x0312, 0x0012
PM_REMOVE, QS_ALLINPUT = 0x0001, 0x04FF
ERROR_HOTKEY_ALREADY_REGISTERED = 1409

GENERIC_READ, GENERIC_WRITE = 0x80000000, 0x40000000
FILE_SHARE_READ, FILE_SHARE_WRITE = 0x00000001, 0x00000002
OPEN_EXISTING = 3
FILE_FLAG_OVERLAPPED = 0x40000000
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value
ERROR_IO_PENDING = 997
WAIT_OBJECT_0, WAIT_TIMEOUT = 0x0, 0x102
DIGCF_PRESENT, DIGCF_DEVICEINTERFACE = 0x02, 0x10
HIDP_STATUS_SUCCESS = 0x00110000


# ------------------------------------------------------------------- logging

def _log_path():
    here = os.path.dirname(os.path.abspath(__file__))
    for folder in (here, os.environ.get("TEMP", ""), os.environ.get("TMP", "")):
        if folder and os.path.isdir(folder) and os.access(folder, os.W_OK):
            return os.path.join(folder, "host-switch.log")
    return None


LOG_PATH = _log_path()
_log_lock = threading.Lock()


def log(message):
    """stderr when there is one (pythonw.exe has none), and always the file."""
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + message
    with _log_lock:
        if sys.stderr is not None:
            try:
                print(line, file=sys.stderr, flush=True)
            except Exception:
                pass
        if LOG_PATH:
            try:
                with open(LOG_PATH, "a", encoding="utf-8") as fh:
                    fh.write(line + "\n")
            except Exception:
                pass


def _trim_log(limit=512 * 1024):
    try:
        if LOG_PATH and os.path.getsize(LOG_PATH) > limit:
            os.remove(LOG_PATH)
    except OSError:
        pass


# ----------------------------------------------------------- win32 structures

class GUID(ctypes.Structure):
    _fields_ = [("Data1", wintypes.DWORD), ("Data2", wintypes.WORD),
                ("Data3", wintypes.WORD), ("Data4", ctypes.c_ubyte * 8)]


class SP_DEVICE_INTERFACE_DATA(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.DWORD), ("InterfaceClassGuid", GUID),
                ("Flags", wintypes.DWORD), ("Reserved", ctypes.c_void_p)]


class HIDD_ATTRIBUTES(ctypes.Structure):
    _fields_ = [("Size", wintypes.DWORD), ("VendorID", wintypes.USHORT),
                ("ProductID", wintypes.USHORT), ("VersionNumber", wintypes.USHORT)]


class HIDP_CAPS(ctypes.Structure):
    _fields_ = [("Usage", wintypes.USHORT), ("UsagePage", wintypes.USHORT),
                ("InputReportByteLength", wintypes.USHORT),
                ("OutputReportByteLength", wintypes.USHORT),
                ("FeatureReportByteLength", wintypes.USHORT),
                ("Reserved", wintypes.USHORT * 17),
                ("NumberLinkCollectionNodes", wintypes.USHORT),
                ("NumberInputButtonCaps", wintypes.USHORT),
                ("NumberInputValueCaps", wintypes.USHORT),
                ("NumberInputDataIndices", wintypes.USHORT),
                ("NumberOutputButtonCaps", wintypes.USHORT),
                ("NumberOutputValueCaps", wintypes.USHORT),
                ("NumberOutputDataIndices", wintypes.USHORT),
                ("NumberFeatureButtonCaps", wintypes.USHORT),
                ("NumberFeatureValueCaps", wintypes.USHORT),
                ("NumberFeatureDataIndices", wintypes.USHORT)]


class OVERLAPPED(ctypes.Structure):
    _fields_ = [("Internal", ctypes.c_void_p), ("InternalHigh", ctypes.c_void_p),
                ("Offset", wintypes.DWORD), ("OffsetHigh", wintypes.DWORD),
                ("hEvent", wintypes.HANDLE)]


# Every prototype below is load-bearing, not decoration. A HANDLE is
# pointer-sized; left undeclared, ctypes marshals the Python int as a 32-bit
# `int` and silently truncates any handle above 2^32 — a bug that hides until
# the one machine that hands out a high handle.
setupapi.SetupDiGetClassDevsW.restype = wintypes.HANDLE
setupapi.SetupDiGetClassDevsW.argtypes = [ctypes.POINTER(GUID), wintypes.LPCWSTR,
                                          wintypes.HWND, wintypes.DWORD]
setupapi.SetupDiEnumDeviceInterfaces.restype = wintypes.BOOL
setupapi.SetupDiEnumDeviceInterfaces.argtypes = [
    wintypes.HANDLE, ctypes.c_void_p, ctypes.POINTER(GUID), wintypes.DWORD,
    ctypes.POINTER(SP_DEVICE_INTERFACE_DATA)]
setupapi.SetupDiGetDeviceInterfaceDetailW.restype = wintypes.BOOL
setupapi.SetupDiGetDeviceInterfaceDetailW.argtypes = [
    wintypes.HANDLE, ctypes.POINTER(SP_DEVICE_INTERFACE_DATA), ctypes.c_void_p,
    wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
setupapi.SetupDiDestroyDeviceInfoList.restype = wintypes.BOOL
setupapi.SetupDiDestroyDeviceInfoList.argtypes = [wintypes.HANDLE]

kernel32.CreateFileW.restype = wintypes.HANDLE
kernel32.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD,
                                 ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD,
                                 wintypes.HANDLE]
kernel32.CreateEventW.restype = wintypes.HANDLE
kernel32.CreateEventW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.BOOL,
                                  wintypes.LPCWSTR]
kernel32.CloseHandle.restype = wintypes.BOOL
kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
kernel32.WaitForSingleObject.restype = wintypes.DWORD
kernel32.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
kernel32.CancelIo.restype = wintypes.BOOL
kernel32.CancelIo.argtypes = [wintypes.HANDLE]
kernel32.ReadFile.restype = wintypes.BOOL
kernel32.ReadFile.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
                              ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(OVERLAPPED)]
kernel32.WriteFile.restype = wintypes.BOOL
kernel32.WriteFile.argtypes = kernel32.ReadFile.argtypes
kernel32.GetOverlappedResult.restype = wintypes.BOOL
kernel32.GetOverlappedResult.argtypes = [wintypes.HANDLE, ctypes.POINTER(OVERLAPPED),
                                         ctypes.POINTER(wintypes.DWORD), wintypes.BOOL]

hid.HidD_GetHidGuid.restype = None
hid.HidD_GetHidGuid.argtypes = [ctypes.POINTER(GUID)]
hid.HidD_GetAttributes.restype = wintypes.BOOLEAN
hid.HidD_GetAttributes.argtypes = [wintypes.HANDLE, ctypes.POINTER(HIDD_ATTRIBUTES)]
hid.HidD_GetPreparsedData.restype = wintypes.BOOLEAN
hid.HidD_GetPreparsedData.argtypes = [wintypes.HANDLE, ctypes.POINTER(ctypes.c_void_p)]
hid.HidD_FreePreparsedData.restype = wintypes.BOOLEAN
hid.HidD_FreePreparsedData.argtypes = [ctypes.c_void_p]
hid.HidP_GetCaps.restype = wintypes.LONG
hid.HidP_GetCaps.argtypes = [ctypes.c_void_p, ctypes.POINTER(HIDP_CAPS)]

user32.RegisterHotKey.restype = wintypes.BOOL
user32.RegisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.UINT,
                                  wintypes.UINT]
user32.UnregisterHotKey.restype = wintypes.BOOL
user32.UnregisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int]
user32.PeekMessageW.restype = wintypes.BOOL
user32.PeekMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND,
                                wintypes.UINT, wintypes.UINT, wintypes.UINT]
user32.MsgWaitForMultipleObjects.restype = wintypes.DWORD
user32.MsgWaitForMultipleObjects.argtypes = [wintypes.DWORD, ctypes.c_void_p,
                                             wintypes.BOOL, wintypes.DWORD,
                                             wintypes.DWORD]

# Documented cbSize of SP_DEVICE_INTERFACE_DETAIL_DATA_W: 8 on 64-bit, 6 on
# 32-bit. Not sizeof() — ctypes pads the struct to 8 either way.
_DETAIL_CBSIZE = 8 if ctypes.sizeof(ctypes.c_void_p) == 8 else 6

HidInterface = namedtuple("HidInterface",
                          "path vid pid usage_page usage in_len out_len")


def enumerate_hid(vid=VID_LOGITECH):
    """Every present HID interface belonging to `vid`, with its usages."""
    guid = GUID()
    hid.HidD_GetHidGuid(ctypes.byref(guid))
    devinfo = setupapi.SetupDiGetClassDevsW(
        ctypes.byref(guid), None, None, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE)
    if not devinfo or devinfo == INVALID_HANDLE_VALUE:
        raise OSError("SetupDiGetClassDevs failed")

    found = []
    try:
        iface = SP_DEVICE_INTERFACE_DATA()
        iface.cbSize = ctypes.sizeof(SP_DEVICE_INTERFACE_DATA)
        index = 0
        while setupapi.SetupDiEnumDeviceInterfaces(
                devinfo, None, ctypes.byref(guid), index, ctypes.byref(iface)):
            index += 1
            needed = wintypes.DWORD(0)
            setupapi.SetupDiGetDeviceInterfaceDetailW(
                devinfo, ctypes.byref(iface), None, 0, ctypes.byref(needed), None)
            if not needed.value:
                continue
            buf = ctypes.create_string_buffer(needed.value)
            ctypes.cast(buf, ctypes.POINTER(wintypes.DWORD))[0] = _DETAIL_CBSIZE
            if not setupapi.SetupDiGetDeviceInterfaceDetailW(
                    devinfo, ctypes.byref(iface), buf, needed.value, None, None):
                continue
            # DevicePath is the WCHAR array immediately after the DWORD cbSize.
            path = ctypes.wstring_at(ctypes.addressof(buf) + ctypes.sizeof(wintypes.DWORD))
            entry = _describe(path, vid)
            if entry:
                found.append(entry)
    finally:
        setupapi.SetupDiDestroyDeviceInfoList(devinfo)
    return found


def _describe(path, vid):
    """Open with zero access purely to read attributes — never blocked, never
    disturbs whatever else has the device open."""
    handle = kernel32.CreateFileW(path, 0, FILE_SHARE_READ | FILE_SHARE_WRITE,
                                  None, OPEN_EXISTING, 0, None)
    if not handle or handle == INVALID_HANDLE_VALUE:
        return None
    try:
        attrs = HIDD_ATTRIBUTES()
        attrs.Size = ctypes.sizeof(attrs)
        if not hid.HidD_GetAttributes(handle, ctypes.byref(attrs)):
            return None
        if vid is not None and attrs.VendorID != vid:
            return None
        preparsed = ctypes.c_void_p()
        if not hid.HidD_GetPreparsedData(handle, ctypes.byref(preparsed)):
            return None
        try:
            caps = HIDP_CAPS()
            if hid.HidP_GetCaps(preparsed, ctypes.byref(caps)) != HIDP_STATUS_SUCCESS:
                return None
        finally:
            hid.HidD_FreePreparsedData(preparsed)
        return HidInterface(path, attrs.VendorID, attrs.ProductID, caps.UsagePage,
                            caps.Usage, caps.InputReportByteLength,
                            caps.OutputReportByteLength)
    finally:
        kernel32.CloseHandle(handle)


# ------------------------------------------------------------------ raw HID io

class HidError(Exception):
    pass


class HidppError(HidError):
    """The device answered, and said no."""


class _OpenDevice(object):
    """One overlapped handle, so both directions can carry a timeout. A HID
    write that hangs must not take the hotkey loop with it."""

    def __init__(self, path, readable=True):
        access = GENERIC_WRITE | (GENERIC_READ if readable else 0)
        self.handle = kernel32.CreateFileW(
            path, access, FILE_SHARE_READ | FILE_SHARE_WRITE, None,
            OPEN_EXISTING, FILE_FLAG_OVERLAPPED, None)
        if not self.handle or self.handle == INVALID_HANDLE_VALUE:
            err = ctypes.get_last_error()
            raise HidError("cannot open device (error %d)%s" % (
                err, " — access denied, another process may hold it exclusively"
                if err == 5 else ""))

    def close(self):
        if self.handle and self.handle != INVALID_HANDLE_VALUE:
            kernel32.CloseHandle(self.handle)
            self.handle = INVALID_HANDLE_VALUE

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def _io(self, func, buf, length, timeout_ms):
        overlapped = OVERLAPPED()
        overlapped.hEvent = kernel32.CreateEventW(None, True, False, None)
        if not overlapped.hEvent:
            raise HidError("CreateEvent failed")
        try:
            moved = wintypes.DWORD(0)
            ok = func(self.handle, buf, length, ctypes.byref(moved),
                      ctypes.byref(overlapped))
            if not ok:
                err = ctypes.get_last_error()
                if err != ERROR_IO_PENDING:
                    raise HidError("i/o failed (error %d)" % err)
                if kernel32.WaitForSingleObject(overlapped.hEvent, timeout_ms) != WAIT_OBJECT_0:
                    # Cancel, then block until the driver is genuinely finished
                    # with `buf` and `overlapped`. Returning while it still owns
                    # them is a use-after-free waiting for a slow read.
                    kernel32.CancelIo(self.handle)
                    kernel32.GetOverlappedResult(self.handle, ctypes.byref(overlapped),
                                                 ctypes.byref(moved), True)
                    return None
                if not kernel32.GetOverlappedResult(
                        self.handle, ctypes.byref(overlapped), ctypes.byref(moved), False):
                    raise HidError("i/o failed (error %d)" % ctypes.get_last_error())
            return moved.value
        finally:
            kernel32.CloseHandle(overlapped.hEvent)

    def write(self, data, timeout_ms=1500):
        buf = ctypes.create_string_buffer(bytes(data), len(data))
        if self._io(kernel32.WriteFile, buf, len(data), timeout_ms) is None:
            raise HidError("write timed out after %dms" % timeout_ms)

    def read(self, length, timeout_ms=1500):
        buf = ctypes.create_string_buffer(length)
        moved = self._io(kernel32.ReadFile, buf, length, timeout_ms)
        return None if moved is None else buf.raw[:moved]


# --------------------------------------------------------------- HID++ on top

class Link(object):
    """How the mouse is reachable from here, and how to address it."""

    def __init__(self, iface, kind, device_index, report_id, nominal_out):
        self.iface = iface
        self.kind = kind  # "bluetooth" | "receiver"
        self.device_index = device_index
        self.report_id = report_id
        self.out_len = iface.out_len or nominal_out
        self.in_len = iface.in_len or nominal_out
        self.feature = CHANGEHOST_FALLBACK
        self.feature_resolved = False

    def __str__(self):
        where = ("bluetooth" if self.kind == "bluetooth"
                 else "receiver slot %d" % self.device_index)
        return "%04X:%04X over %s, feature 0x%02X%s" % (
            self.iface.vid, self.iface.pid, where, self.feature,
            "" if self.feature_resolved else " (assumed)")

    def report(self, feature, function, params=b"", swid=SWID_GET):
        body = bytes([self.report_id, self.device_index, feature,
                      (function << 4) | swid]) + bytes(params)
        if len(body) > self.out_len:
            raise HidError("report longer than the collection allows")
        return body + bytes(self.out_len - len(body))

    def send(self, report):
        with _OpenDevice(self.iface.path, readable=False) as dev:
            dev.write(report)

    def request(self, feature, function, params=b"", swid=SWID_GET, timeout_ms=2500):
        """Send and wait for the matching answer, stepping over any unsolicited
        notification that arrives on the same collection first."""
        want = (function << 4) | swid
        with _OpenDevice(self.iface.path) as dev:
            dev.write(self.report(feature, function, params, swid))
            deadline = time.monotonic() + timeout_ms / 1000.0
            while True:
                remaining = int((deadline - time.monotonic()) * 1000)
                if remaining <= 0:
                    return None
                packet = dev.read(self.in_len, remaining)
                if packet is None or len(packet) < 5:
                    return None
                if packet[1] != self.device_index or packet[3] != want:
                    continue  # someone else's traffic
                if packet[2] == ERROR_FEATURE_INDEX:
                    raise HidppError("device refused: feature 0x%02X error 0x%02X"
                                     % (packet[4], packet[5] if len(packet) > 5 else 0))
                if packet[2] == feature:
                    return packet


def find_link(bolt_slot=BOLT_SLOT):
    """Bluetooth first — if the mouse is on this machine directly, that is the
    link that owns it. A receiver is only the answer when it isn't."""
    interfaces = enumerate_hid(VID_LOGITECH)

    for iface in interfaces:
        if iface.usage_page == UP_BLUETOOTH and iface.usage == USAGE_BT_LONG:
            return Link(iface, "bluetooth", DEVICE_INDEX_BT, REPORT_LONG, 20)

    for iface in interfaces:
        if iface.usage_page == UP_RECEIVER and iface.usage == USAGE_RECV_SHORT:
            if bolt_slot:
                return Link(iface, "receiver", bolt_slot, REPORT_SHORT, 7)
            for slot in range(1, 7):
                candidate = Link(iface, "receiver", slot, REPORT_SHORT, 7)
                if resolve_feature(candidate, quiet=True):
                    return candidate
            raise HidError("found a receiver but no slot answered ChangeHost — "
                           "is the mouse paired to it and awake?")

    raise HidError("no Logitech HID++ interface found — the mouse is not on "
                   "this machine right now, or it is asleep")


def resolve_feature(link, quiet=False):
    """Ask the device where ChangeHost lives rather than trusting a constant.
    Falls back silently: the push works either way on this mouse."""
    try:
        answer = link.request(FEATURE_ROOT, 0,
                              bytes([FEATURE_ID_CHANGEHOST >> 8,
                                     FEATURE_ID_CHANGEHOST & 0xFF]),
                              swid=SWID_GET, timeout_ms=1200)
    except (HidError, OSError) as exc:
        if not quiet:
            log("feature probe failed (%s); assuming 0x%02X" % (exc, link.feature))
        return False
    if not answer or not answer[4]:
        if not quiet:
            log("device did not report a ChangeHost index; assuming 0x%02X" % link.feature)
        return False
    link.feature = answer[4]
    link.feature_resolved = True
    return True


def get_host_info(link):
    """(host count, current host 1-based). Read-only — safe to run any time."""
    answer = link.request(link.feature, 0, b"", swid=SWID_GET)
    if not answer:
        return None
    return answer[4], answer[5] + 1


def push(link, channel):
    """setCurrentHost. One-way by nature: this only works from the machine the
    mouse is on now, which is why it hangs off the key that leaves it."""
    if not 1 <= channel <= 3:
        raise ValueError("channel must be 1-3")
    link.send(link.report(link.feature, 1, bytes([channel - 1]), swid=SWID_SET))


# ------------------------------------------------------------------- commands

def cmd_probe(args):
    print("Logitech HID interfaces on this machine:")
    interfaces = enumerate_hid(VID_LOGITECH)
    if not interfaces:
        print("  (none — is the mouse on this machine and awake?)")
    for iface in interfaces:
        note = ""
        if iface.usage_page == UP_BLUETOOTH and iface.usage == USAGE_BT_LONG:
            note = "  <- HID++ long, direct Bluetooth"
        elif iface.usage_page == UP_RECEIVER and iface.usage == USAGE_RECV_SHORT:
            note = "  <- HID++ short, receiver"
        print("  %04X:%04X  usage %04X:%04X  in %2d out %2d%s"
              % (iface.vid, iface.pid, iface.usage_page, iface.usage,
                 iface.in_len, iface.out_len, note))

    print()
    link = find_link(args.slot)
    resolve_feature(link)
    print("link: %s" % link)
    if link.kind == "receiver":
        print("      set BOLT_SLOT = %d to skip the slot probe at startup"
              % link.device_index)

    # A refusal here shouldn't cost you the rest of the diagnostic — the point
    # of `probe` is to print everything it managed to learn.
    try:
        info = get_host_info(link)
    except (HidError, OSError) as exc:
        print("hosts: %s" % exc)
        info = None
    if info:
        print("hosts: %d, mouse is on channel %d" % info)
        for chord, (channel, label) in sorted(MACHINES.items()):
            here = "  <- this machine, by the numbers" if channel == info[1] else ""
            print("  Ctrl+Shift+%s -> channel %d  %s%s" % (chord, channel, label, here))
    else:
        print("hosts: no answer to the read.")
        print("  Pushing may still work — it is write-only and needs no reply.")
        print("  Try: python host_switch.py switch <channel>, with another")
        print("  mouse to hand in case it lands somewhere unexpected.")
    return 0


def cmd_info(args):
    link = find_link(args.slot)
    resolve_feature(link)
    info = get_host_info(link)
    if not info:
        print("no answer from %s" % link)
        return 1
    print("%s\n%d hosts, currently on channel %d" % (link, info[0], info[1]))
    return 0


def cmd_switch(args):
    target = args.target
    channel = None
    if target.isdigit():
        channel = int(target)
    else:
        for chord, (chan, label) in MACHINES.items():
            if label.lower().startswith(target.lower()) or chord.lower() == target.lower():
                channel = chan
                break
    if channel is None:
        print("unknown target %r — give a channel 1-3 or one of: %s"
              % (target, ", ".join(sorted(l for _, l in MACHINES.values()))))
        return 2
    link = find_link(args.slot)
    resolve_feature(link)
    push(link, channel)
    print("pushed to channel %d via %s" % (channel, link))
    return 0


# ------------------------------------------------------------------- listener

class Listener(object):
    def __init__(self, slot=None, dry_run=False):
        self.slot = slot
        self.dry_run = dry_run
        self._lock = threading.Lock()
        self._link = None

    def link(self, refresh=False):
        """Cached: enumeration is cheap but not free, and the answer only
        changes when the mouse comes back on a different transport."""
        with self._lock:
            if refresh:
                self._link = None
            if self._link is None:
                self._link = find_link(self.slot)
                resolve_feature(self._link)
                log("link: %s" % self._link)
            return self._link

    def dispatch(self, chord):
        channel, label = MACHINES[chord]
        if self.dry_run:
            log("[dry run] %s -> channel %d (%s)" % (chord, channel, label))
            return
        for attempt in (0, 1):
            try:
                push(self.link(refresh=bool(attempt)), channel)
                log("%s -> channel %d (%s)" % (chord, channel, label))
                return
            except (HidError, OSError) as exc:
                if attempt:
                    log("%s -> channel %d FAILED: %s" % (chord, channel, exc))
                else:
                    log("%s: %s — rediscovering" % (chord, exc))

    def run(self):
        registered = []
        for index, chord in enumerate(sorted(MACHINES), start=1):
            if user32.RegisterHotKey(None, index, MOD_CONTROL | MOD_SHIFT | MOD_NOREPEAT,
                                     VK[chord]):
                registered.append((index, chord))
            else:
                err = ctypes.get_last_error()
                log("could not claim Ctrl+Shift+%s (error %d)%s" % (
                    chord, err,
                    " — already taken; another copy of this script, the WM "
                    "daemon, or PowerToys" if err == ERROR_HOTKEY_ALREADY_REGISTERED
                    else ""))
        if not registered:
            log("no chords claimed; nothing to listen for")
            return 1

        by_id = dict(registered)
        log("listening on %s%s" % (
            ", ".join("Ctrl+Shift+" + chord for _, chord in registered),
            " (dry run)" if self.dry_run else ""))
        if LOG_PATH:
            log("log: %s" % LOG_PATH)

        # The mouse may well be on another machine right now, which is not an
        # error — it just means there is nothing here to talk to yet.
        try:
            self.link()
        except (HidError, OSError) as exc:
            log("no mouse here yet (%s); will look again on the first chord" % exc)

        # A timed wake rather than a blocking GetMessage: GetMessage parks in
        # C and never gives the interpreter a chance to run a signal handler,
        # so Ctrl+C wouldn't stop the listener until some other message
        # happened along. Waking four times a second costs nothing and keeps
        # it killable — which matters most during `run --dry-run`.
        msg = wintypes.MSG()
        try:
            while True:
                user32.MsgWaitForMultipleObjects(0, None, False, 250, QS_ALLINPUT)
                while user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, PM_REMOVE):
                    if msg.message == WM_QUIT:
                        return 0
                    if msg.message == WM_HOTKEY and msg.wParam in by_id:
                        # Off the message loop: a slow HID write must not delay
                        # the next chord, and the keyboard is mid-hop already.
                        threading.Thread(target=self.dispatch,
                                         args=(by_id[msg.wParam],), daemon=True).start()
        except KeyboardInterrupt:
            pass
        finally:
            for index, _ in registered:
                user32.UnregisterHotKey(None, index)
            log("stopped")
        return 0


def cmd_run(args):
    _trim_log()
    return Listener(args.slot, args.dry_run).run()


def main(argv=None):
    parser = argparse.ArgumentParser(
        description=__doc__.splitlines()[0],
        formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--slot", type=int, default=BOLT_SLOT,
                        help="receiver slot the mouse is paired into (default: probe)")
    subs = parser.add_subparsers(dest="command")

    run = subs.add_parser("run", help="listen for the chords (default)")
    run.add_argument("--dry-run", action="store_true",
                     help="log the chords, move nothing")
    run.set_defaults(func=cmd_run)

    subs.add_parser("probe", help="what is connected and whether it answers"
                    ).set_defaults(func=cmd_probe)
    subs.add_parser("info", help="host count and current channel"
                    ).set_defaults(func=cmd_info)

    switch = subs.add_parser("switch", help="push the mouse now, no hotkey")
    switch.add_argument("target", help="channel 1-3, a machine name, or a chord")
    switch.set_defaults(func=cmd_switch)

    args = parser.parse_args(argv)
    if not getattr(args, "command", None):
        args.func, args.dry_run = cmd_run, False
    try:
        return args.func(args)
    except (HidError, OSError) as exc:
        log(str(exc))
        return 1


if __name__ == "__main__":
    sys.exit(main())
