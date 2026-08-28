#!/usr/bin/env python3
"""Check host_switch.py without a Windows machine, a mouse, or admin rights.

The interesting part of the listener is four bytes wide, and getting them wrong
sends the mouse somewhere you then can't reach it from. So this asserts the
reports it builds against the HID++ bytes documented in ../README.md, and
exercises the discovery and retry logic with the device layer stubbed out.

It loads host_switch.py with the win32 surface mocked, so it runs anywhere:

    python3 test_host_switch.py

Note it cannot check struct sizes: off Windows, `wintypes.DWORD` is a 64-bit
`c_ulong`, so `sizeof` lies. It checks instead that no struct size is hardcoded
except the one Microsoft documents as a literal.
"""

import ctypes
import importlib.util
import os
import sys
import types
from unittest import mock

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "host_switch.py")


class _Stub(object):
    """Stands in for a WinDLL. Nothing here should reach a real syscall."""

    def __init__(self, name):
        self._name = name

    def __getattr__(self, item):
        fn = mock.MagicMock(name="%s.%s" % (self._name, item))
        fn.restype = None
        fn.argtypes = None
        setattr(self, item, fn)
        return fn


def load():
    with mock.patch.object(sys, "platform", "win32"), \
            mock.patch.object(ctypes, "WinDLL", lambda n, **kw: _Stub(n), create=True):
        spec = importlib.util.spec_from_file_location("host_switch", SRC)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module


hs = load()
FAILURES = []


def eq(label, got, want):
    ok = got == want
    print(("  ok   " if ok else "  FAIL ") + label)
    if not ok:
        print("        got  %r\n        want %r" % (got, want))
        FAILURES.append(label)


def hexes(data):
    return ",".join("0x%02x" % b for b in data)


Iface = hs.HidInterface
BT = Iface("bt", 0x046D, 0xB034, 0xFF43, 0x0202, 20, 20)
RECV = Iface("recv", 0x046D, 0xC548, 0xFF00, 0x0001, 7, 7)
OTHER = Iface("kbd", 0x046D, 0xC52B, 0x0001, 0x0006, 8, 8)

bt = hs.Link(BT, "bluetooth", hs.DEVICE_INDEX_BT, hs.REPORT_LONG, 20)
bolt = hs.Link(RECV, "receiver", 1, hs.REPORT_SHORT, 7)


print("push over bluetooth  (README: 0x11,0x02,0x0A,0x1e,<target-1>, 20 bytes)")
for channel, target in ((1, 0x00), (2, 0x01), (3, 0x02)):
    report = bt.report(0x0A, 1, bytes([channel - 1]), swid=hs.SWID_SET)
    eq("channel %d" % channel, hexes(report),
       hexes(bytes([0x11, 0x02, 0x0A, 0x1E, target]) + bytes(15)))
eq("padded to the collection's report length", len(bt.report(0x0A, 1, b"\x00")), 20)

print("push over a receiver (README: 0x10,<slot>,0x0A,0x1e,<target-1>,0x00,0x00)")
eq("slot 1, channel 2", hexes(bolt.report(0x0A, 1, b"\x01", swid=hs.SWID_SET)),
   hexes(bytes([0x10, 0x01, 0x0A, 0x1E, 0x01, 0x00, 0x00])))
eq("slot 2 addresses the slot", bolt.report(0x0A, 1, b"\x01")[1], 0x01)
eq("short report stays 7 bytes", len(bolt.report(0x0A, 1, b"\x00")), 7)

print("getHostInfo, the read-only probe (README: 0x11,0x02,0x0A,0x0d)")
eq("bluetooth", hexes(bt.report(0x0A, 0, b"", swid=hs.SWID_GET)[:4]),
   hexes(bytes([0x11, 0x02, 0x0A, 0x0D])))
eq("receiver", hexes(bolt.report(0x0A, 0, b"", swid=hs.SWID_GET)),
   hexes(bytes([0x10, 0x01, 0x0A, 0x0D, 0x00, 0x00, 0x00])))

print("root getFeature(0x1814), how the ChangeHost index gets resolved")
eq("bluetooth", hexes(bt.report(0x00, 0, b"\x18\x14", swid=hs.SWID_GET)[:6]),
   hexes(bytes([0x11, 0x02, 0x00, 0x0D, 0x18, 0x14])))

print("the function/software-id nibble packing")
eq("setCurrentHost is function 1", (1 << 4) | hs.SWID_SET, 0x1E)
eq("getHostInfo is function 0", (0 << 4) | hs.SWID_GET, 0x0D)

print("the table, against ../README.md, ../mac/init.lua and host-switch.ahk")
eq("Ctrl+Shift+F17 -> macOS, channel 2", hs.MACHINES["F17"][0], 2)
eq("Ctrl+Shift+F18 -> work laptop, channel 1", hs.MACHINES["F18"][0], 1)
eq("Ctrl+Shift+F19 -> personal Windows, channel 3", hs.MACHINES["F19"][0], 3)
eq("F20 stays unmapped", "F20" in hs.MACHINES, False)
eq("every channel is reachable", sorted(c for c, _ in hs.MACHINES.values()), [1, 2, 3])
eq("VK_F17", hs.VK["F17"], 0x80)
eq("chord is Ctrl+Shift", hs.MOD_CONTROL | hs.MOD_SHIFT, 0x0006)

print("refuses to build something the wire can't carry")
try:
    bolt.report(0x0A, 1, b"\x00\x01\x02\x03\x04\x05")
    eq("overlong params raise", False, True)
except hs.HidError:
    eq("overlong params raise", True, True)
for bad in (0, 4, -1):
    try:
        hs.push(bt, bad)
        eq("push refuses channel %r" % bad, False, True)
    except ValueError:
        eq("push refuses channel %r" % bad, True, True)

print("discovery prefers the link that actually owns the mouse")
hs.enumerate_hid = lambda vid=None: [OTHER, RECV, BT]
eq("bluetooth beats a receiver", hs.find_link().kind, "bluetooth")
hs.enumerate_hid = lambda vid=None: [OTHER, RECV]
eq("falls back to the receiver", hs.find_link(bolt_slot=2).kind, "receiver")
eq("honours the configured slot", hs.find_link(bolt_slot=2).device_index, 2)
eq("receiver uses short reports", hs.find_link(bolt_slot=2).report_id, 0x10)
hs.enumerate_hid = lambda vid=None: [OTHER]
try:
    hs.find_link()
    eq("no mouse here is an error, not a crash", False, True)
except hs.HidError as exc:
    eq("no mouse here is an error, not a crash", "not on this machine" in str(exc), True)

print("the slot probe walks slots in order and stops at the first answer")
hs.enumerate_hid = lambda vid=None: [RECV]
tried = []


def _resolve(link, quiet=False):
    tried.append(link.device_index)
    return link.device_index == 3


hs.resolve_feature = _resolve
eq("lands on the answering slot", hs.find_link(bolt_slot=None).device_index, 3)
eq("tried 1, 2, 3 and stopped", tried, [1, 2, 3])

print("a stale link costs one retry, not the keypress")
hs.enumerate_hid = lambda vid=None: [BT]
hs.resolve_feature = lambda link, quiet=False: True
pushes = []


def _flaky(link, channel):
    pushes.append(channel)
    if len(pushes) == 1:
        raise hs.HidError("device went away")


hs.push = _flaky
hs.Listener().dispatch("F18")
eq("rediscovered and pushed the same channel", pushes, [1, 1])

pushes[:] = []
hs.Listener(dry_run=True).dispatch("F17")
eq("dry run moves nothing", pushes, [])

print("switch takes a channel, a machine name, or a chord")
hs.push = lambda link, channel: pushes.append(channel)
for target, want in (("2", 2), ("work", 1), ("F19", 3), ("mac", 2), ("PERSONAL", 3)):
    pushes[:] = []
    hs.cmd_switch(types.SimpleNamespace(target=target, slot=None))
    eq("switch %-8s -> channel %d" % (target, want), pushes, [want])
pushes[:] = []
eq("unknown target exits 2", hs.cmd_switch(types.SimpleNamespace(target="nope", slot=None)), 2)
eq("...without pushing anything", pushes, [])

print("struct sizes are never hardcoded, bar the documented literal")
source = open(SRC).read()
eq("HIDD_ATTRIBUTES.Size from sizeof", "attrs.Size = ctypes.sizeof(attrs)" in source, True)
eq("SP_DEVICE_INTERFACE_DATA.cbSize from sizeof",
   "iface.cbSize = ctypes.sizeof(SP_DEVICE_INTERFACE_DATA)" in source, True)
eq("only the detail cbSize is a literal", source.count("_DETAIL_CBSIZE = 8 if"), 1)
eq("HIDP_CAPS is 32 USHORTs", sum(
    ctypes.sizeof(t) // 2 if not hasattr(t, "_length_") else t._length_
    for _, t in hs.HIDP_CAPS._fields_), 32)

print("every win32 call has a declared prototype")
# The bug this catches: an undeclared HANDLE argument is marshalled as a 32-bit
# int and truncated. It only bites on a machine that hands out a high handle,
# which is to say it bites once, remotely, on the machine you can't debug.
import ast
DLLS = {"kernel32", "user32", "hid", "setupapi"}
called, declared = set(), set()
for node in ast.walk(ast.parse(source)):
    # Any mention of `kernel32.X` counts, not just `kernel32.X(...)`: the write
    # and read paths pass the function by reference into a shared helper, and
    # those need prototypes every bit as much as a direct call.
    if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) \
            and node.value.id in DLLS:
        called.add(node.attr)
    if isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Attribute) and target.attr == "argtypes" \
                    and isinstance(target.value, ast.Attribute) \
                    and isinstance(target.value.value, ast.Name) \
                    and target.value.value.id in DLLS:
                declared.add(target.value.attr)
eq("nothing called without argtypes", sorted(called - declared), [])
eq("and something was actually checked", len(called) >= 15, True)

print("\nstdlib only — no import would need a pip install")
eq("no third-party imports", sorted(
    line.split()[1].split(".")[0] for line in source.splitlines()
    if line.startswith("import ") or line.startswith("from ")), sorted(
    ["argparse", "ctypes", "os", "sys", "threading", "time", "collections", "ctypes"]))

print("\n%s" % ("all checks passed" if not FAILURES
                else "%d FAILED: %s" % (len(FAILURES), ", ".join(FAILURES))))
sys.exit(1 if FAILURES else 0)
