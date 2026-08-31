-- os/wm/mac/init.lua — the macOS WM daemon behind the WM_practice layer.
--
-- The keyboard's WM layer emits one-modifier-deep F13-F20 chords; this file
-- turns each one into a window operation. The authoritative chord→action
-- table is data/wm-actions.js — the BINDINGS table below mirrors its macOS
-- rows one-for-one, in the same order. Nothing else may claim
-- bare/Ctrl/Alt/Shift+F13-F20 (os/vscode/README.md §Chord registry).
--
-- Focus, swap and cycle are hand-rolled geometry, not the hs.window
-- builtins: focusWindowWest/East/North/South have open correctness bugs
-- (#2558 wrong-app-focus, #3574 hangs). The algorithm is the Windows
-- daemon's, as recorded in PLAN.md: keep candidates whose center lies in
-- the target direction, prefer those overlapping on the perpendicular
-- axis, nearest center wins, never wrap. Workspaces are deliberately
-- absent on macOS — Mission Control covers them, and
-- hs.spaces.moveWindowToSpace is broken on Sequoia (#3698).
--
-- Load from ~/.hammerspoon/init.lua:
--   dofile("/Users/benshaughnessy/code/keyboard_layout_visualizer/os/wm/mac/init.lua")
--
-- Verify without touching the keyboard (needs hs.ipc, see os/wm/README.md):
--   hs -c 'print(WM.selftest())'   -- pure-geometry checks, no windows moved
--   hs -c 'print(WM.status())'     -- accessibility, bindings, focus history

-- Re-dofile safety: drop the previous incarnation's hotkeys and watcher so
-- iterating with `hs -c 'dofile(...)'` never double-binds.
if type(WM) == "table" and WM._teardown then WM._teardown() end

local M = { hotkeys = {} }

-- The WM is the thing that moves windows here, so it owns this
-- config-global: animated setFrame reads as lag, not polish.
hs.window.animationDuration = 0

-- Knobs. WRAP_CYCLE=false follows PLAN.md's "non-wrapping" spec for the
-- ported algorithm — at either end of the monitor, cycle does nothing and
-- you come back with the other key. Flip to true for alt-tab-style wrap.
local WRAP_CYCLE  = false
local RESIZE_STEP = 0.05 -- of the screen dimension, per press
local MIN_W, MIN_H = 200, 150

------------------------------------------------------------------ geometry
-- Pure functions over plain {x,y,w,h,id} tables so selftest() can exercise
-- them against synthetic layouts with no windows (and no accessibility).

local geom = {}
M.geom = geom

local function cx(f) return f.x + f.w / 2 end
local function cy(f) return f.y + f.h / 2 end

-- Overlap in pixels on the axis perpendicular to travel: y-overlap when
-- moving left/right, x-overlap when moving up/down.
function geom.overlap(a, b, horizontal)
  if horizontal then
    return math.min(a.y + a.h, b.y + b.h) - math.max(a.y, b.y)
  end
  return math.min(a.x + a.w, b.x + b.w) - math.max(a.x, b.x)
end

-- The directional pick. Returns the index into `frames` of the window to
-- act on, or nil (non-wrapping: nothing in that direction means no-op).
function geom.pick(from, frames, dir)
  local horizontal = dir == "left" or dir == "right"
  local sign = (dir == "left" or dir == "up") and -1 or 1
  local best, bestDist, bestOverlaps
  for i, f in ipairs(frames) do
    local d = horizontal and (cx(f) - cx(from)) or (cy(f) - cy(from))
    if d * sign > 0 then -- center strictly in the target direction
      local overlaps = geom.overlap(from, f, horizontal) > 0
      local dist = (cx(f) - cx(from)) ^ 2 + (cy(f) - cy(from)) ^ 2
      local better
      if best == nil then better = true
      elseif overlaps ~= bestOverlaps then better = overlaps
      else better = dist < bestDist end
      if better then best, bestDist, bestOverlaps = i, dist, overlaps end
    end
  end
  return best
end

-- Stable screen-position order for cycle: x, then y, then id — the same
-- window always has the same rank no matter what has focus.
function geom.order(frames)
  local idx = {}
  for i in ipairs(frames) do idx[#idx + 1] = i end
  table.sort(idx, function(a, b)
    local fa, fb = frames[a], frames[b]
    if fa.x ~= fb.x then return fa.x < fb.x end
    if fa.y ~= fb.y then return fa.y < fb.y end
    return (fa.id or a) < (fb.id or b)
  end)
  return idx
end

------------------------------------------------------------------- windows

local function focusedWin()
  local w = hs.window.focusedWindow()
  if w and w:isStandard() then return w end
end

local function plainFrame(w)
  local f = w:frame()
  return { x = f.x, y = f.y, w = f.w, h = f.h, id = w:id() }
end

-- Visible standard windows, front to back (current Space only — which is
-- what "the windows I can see" should mean). Optionally one screen only,
-- optionally minus one window.
local function candidates(screen, exclude)
  local out = {}
  for _, w in ipairs(hs.window.orderedWindows()) do
    if w:isStandard()
      and (not screen or w:screen():id() == screen:id())
      and (not exclude or w:id() ~= exclude:id()) then
      out[#out + 1] = w
    end
  end
  return out
end

local function pickDirectional(dir)
  local f = focusedWin()
  if not f then return end
  local cands = candidates(nil, f)
  local frames = {}
  for i, w in ipairs(cands) do frames[i] = plainFrame(w) end
  local i = geom.pick(plainFrame(f), frames, dir)
  return f, i and cands[i]
end

------------------------------------------------------------------- actions

local function focusDirection(dir)
  local _, target = pickDirectional(dir)
  if target then target:focus() end
end

-- Self-inverse, two setFrame calls; focus stays on the window that moved.
local function swapDirection(dir)
  local f, target = pickDirectional(dir)
  if not target then return end
  local a, b = f:frame(), target:frame()
  f:setFrame(b)
  target:setFrame(a)
end

local function cycle(step) -- +1 next, -1 prev, this monitor only
  local f = focusedWin()
  if not f then return end
  local wins = candidates(f:screen(), nil)
  local frames = {}
  for i, w in ipairs(wins) do frames[i] = plainFrame(w) end
  local order = geom.order(frames)
  local rank
  for r, i in ipairs(order) do
    if wins[i]:id() == f:id() then rank = r break end
  end
  if not rank then return end
  local dest = rank + step
  if WRAP_CYCLE then dest = ((dest - 1) % #order) + 1
  elseif dest < 1 or dest > #order then return end
  wins[order[dest]]:focus()
end

local function focusMonitor(dir) -- "west" | "east": frontmost window there
  local f = focusedWin()
  local scr = f and f:screen() or hs.screen.mainScreen()
  local target = dir == "west" and scr:toWest() or scr:toEast()
  if not target then return end
  for _, w in ipairs(hs.window.orderedWindows()) do
    if w:isStandard() and w:screen():id() == target:id() then
      w:focus()
      return
    end
  end
end

-- Focus-toggle needs history the OS doesn't keep. Deliberately NOT
-- hs.window.filter: its focus subscription watches every window of every
-- app and can stall the main runloop for minutes after a focus change
-- (observed here 2026-08-29, confirmed by sampling the process). A 1.5s
-- poll of just the frontmost window is one AX call to one app, catches
-- every switch at human timescales, and toggling is itself a focus change
-- the next tick records — so two presses bounce between the same two
-- windows, same as a watcher would.
local hist = { cur = nil, prev = nil }
local function noteFocus(w)
  if not w then return end
  local id = w:id()
  if id ~= hist.cur then
    hist.prev, hist.cur = hist.cur, id
  end
end
local focusPoll = hs.timer.doEvery(1.5, function()
  noteFocus(hs.window.focusedWindow())
end)

local function focusToggle()
  local w = hist.prev and hs.window.get(hist.prev)
  if w then w:focus() end
end

local UNITS = {
  full   = hs.geometry(0, 0, 1, 1), -- fill the screen, not OS-native maximize
  left   = hs.geometry(0, 0, 0.5, 1),
  top    = hs.geometry(0, 0, 1, 0.5),
  bottom = hs.geometry(0, 0.5, 1, 0.5),
  right  = hs.geometry(0.5, 0, 0.5, 1),
  center = hs.geometry(0.15, 0.15, 0.7, 0.7),
  nw     = hs.geometry(0, 0, 0.5, 0.5),
  se     = hs.geometry(0.5, 0.5, 0.5, 0.5),
}

local function place(unit)
  local f = focusedWin()
  if f then f:moveToUnit(UNITS[unit]) end
end

-- Grow/shrink about the window's own center, clamped to its screen and to
-- a floor small enough that repeated "narrower" can't lose the window.
local function resize(dim, sign)
  local f = focusedWin()
  if not f then return end
  local fr, sf = f:frame(), f:screen():frame()
  if dim == "w" then
    local nw = math.max(MIN_W, math.min(sf.w, fr.w + sf.w * RESIZE_STEP * sign))
    fr.x, fr.w = fr.x - (nw - fr.w) / 2, nw
  else
    local nh = math.max(MIN_H, math.min(sf.h, fr.h + sf.h * RESIZE_STEP * sign))
    fr.y, fr.h = fr.y - (nh - fr.h) / 2, nh
  end
  if fr.x < sf.x then fr.x = sf.x end
  if fr.y < sf.y then fr.y = sf.y end
  if fr.x + fr.w > sf.x + sf.w then fr.x = sf.x + sf.w - fr.w end
  if fr.y + fr.h > sf.y + sf.h then fr.y = sf.y + sf.h - fr.h end
  f:setFrame(fr)
end

-- Restore can't use the focused window (a minimized window isn't focused),
-- so minimize keeps a stack of what *we* minimized and restore pops it —
-- falling back to any minimized window if the stack runs dry.
local minimizedStack = {}

local function minimizeFocused()
  local f = focusedWin()
  if not f then return end
  minimizedStack[#minimizedStack + 1] = f:id()
  f:minimize()
end

local function restoreLast()
  while #minimizedStack > 0 do
    local w = hs.window.get(table.remove(minimizedStack))
    if w and w:isMinimized() then
      w:unminimize()
      w:focus()
      return
    end
  end
  local all = hs.window.minimizedWindows()
  if all and all[1] then
    all[1]:unminimize()
    all[1]:focus()
  end
end

------------------------------------------------------------------ bindings
-- One row per macOS row of data/wm-actions.js, same order. `key` there is
-- ZMK notation: LS( )=shift, LC( )=ctrl, LA( )=alt.

local BINDINGS = {
  -- LEFT hand — focus domain -------------------------------------------
  { {},        "f13", function() focusDirection("left") end },  -- F13     focus ←
  { {},        "f14", function() focusDirection("up") end },    -- F14     focus ↑
  { {},        "f15", function() focusDirection("down") end },  -- F15     focus ↓
  { {},        "f16", function() focusDirection("right") end }, -- F16     focus →
  { {"shift"}, "f15", focusToggle },                            -- LS(F15) previous window
  { {"shift"}, "f13", function() focusMonitor("west") end },    -- LS(F13) monitor ⇤
  { {"alt"},   "f19", function() cycle(-1) end },               -- LA(F19) cycle ◀
  { {"alt"},   "f20", function() cycle(1) end },                -- LA(F20) cycle ▶
  { {"shift"}, "f14", function() focusMonitor("east") end },    -- LS(F14) monitor ⇥
  -- RIGHT hand — movement domain ---------------------------------------
  { {"ctrl"},  "f13", function() swapDirection("left") end },   -- LC(F13) swap ←
  { {"ctrl"},  "f14", function() swapDirection("up") end },     -- LC(F14) swap ↑
  { {"ctrl"},  "f15", function() swapDirection("down") end },   -- LC(F15) swap ↓
  { {"ctrl"},  "f16", function() swapDirection("right") end },  -- LC(F16) swap →
  { {"alt"},   "f13", function() place("full") end },           -- LA(F13) full
  { {},        "f17", function() place("left") end },           -- F17     left half
  { {},        "f18", function() place("top") end },            -- F18     top half
  { {},        "f19", function() place("bottom") end },         -- F19     bottom half
  { {},        "f20", function() place("right") end },          -- F20     right half
  { {"alt"},   "f14", function() place("center") end },         -- LA(F14) center 70%
  { {"ctrl"},  "f17", function() resize("w", 1) end },          -- LC(F17) wider
  { {"ctrl"},  "f18", function() resize("w", -1) end },         -- LC(F18) narrower
  { {"ctrl"},  "f19", function() resize("h", 1) end },          -- LC(F19) taller
  { {"ctrl"},  "f20", function() resize("h", -1) end },         -- LC(F20) shorter
  { {"alt"},   "f15", function() place("nw") end },             -- LA(F15) NW quarter
  { {"alt"},   "f16", minimizeFocused },                        -- LA(F16) minimize
  { {"alt"},   "f17", restoreLast },                            -- LA(F17) restore
  { {"alt"},   "f18", function() place("se") end },             -- LA(F18) SE quarter
}

for _, b in ipairs(BINDINGS) do
  M.hotkeys[#M.hotkeys + 1] = hs.hotkey.bind(b[1], b[2], b[3])
end

function M._teardown()
  for _, hk in ipairs(M.hotkeys) do hk:delete() end
  M.hotkeys = {}
  focusPoll:stop()
end

----------------------------------------------------------------- checking

function M.status()
  return table.concat({
    "accessibility: " .. tostring(hs.accessibilityState()),
    "hotkeys bound: " .. #M.hotkeys .. " of " .. #BINDINGS,
    "focus history: cur=" .. tostring(hist.cur) .. " prev=" .. tostring(hist.prev),
    "wrap cycle: " .. tostring(WRAP_CYCLE) .. ", resize step: " .. RESIZE_STEP,
  }, "\n")
end

-- Pure-geometry checks against a synthetic two-monitor layout. Runs with
-- no windows, no accessibility, and moves nothing — safe anywhere.
function M.selftest()
  local n, fails = 0, {}
  local function eq(got, want, name)
    n = n + 1
    if got ~= want then
      fails[#fails + 1] = name .. ": got " .. tostring(got) .. ", want " .. tostring(want)
    end
  end

  -- Monitor A 1440x900 at origin, monitor B 1920x1080 to its right.
  local a1 = { x = 0,    y = 0, w = 720,  h = 900,  id = 1 } -- A, left half
  local a2 = { x = 720,  y = 0, w = 720,  h = 900,  id = 2 } -- A, right half
  local b1 = { x = 1440, y = 0, w = 1920, h = 1080, id = 3 } -- B, full

  eq(geom.pick(a1, { a2, b1 }, "right"), 1, "nearest wins rightward")
  eq(geom.pick(a2, { a1, b1 }, "right"), 2, "crosses the monitor seam")
  eq(geom.pick(a2, { a1, b1 }, "left"), 1, "reversible: back left")
  eq(geom.pick(b1, { a1, a2 }, "left"), 2, "from B, nearest on A")
  eq(geom.pick(a1, { a2, b1 }, "up"), nil, "non-wrapping: nothing above")

  -- Farther-but-overlapping beats nearer-but-clear of the travel lane.
  local from = { x = 0,   y = 0,   w = 400, h = 300, id = 4 }
  local low  = { x = 500, y = 400, w = 200, h = 200, id = 5 } -- near, no y-overlap
  local lane = { x = 900, y = 50,  w = 200, h = 200, id = 6 } -- far, y-overlaps
  eq(geom.pick(from, { low, lane }, "right"), 2, "perpendicular overlap preferred")
  eq(geom.pick(from, { low }, "right"), 1, "no-overlap still beats nothing")

  -- Vertical stack: down and up find each other.
  local top = { x = 100, y = 0,   w = 300, h = 300, id = 7 }
  local bot = { x = 100, y = 400, w = 300, h = 300, id = 8 }
  eq(geom.pick(top, { bot }, "down"), 1, "down finds the stacked window")
  eq(geom.pick(bot, { top }, "up"), 1, "up reverses it")

  -- Cycle order is by position (x, then y, then id), not input order.
  eq(table.concat(geom.order({ b1, a2, a1 }), ","), "3,2,1", "order sorts by x")
  eq(table.concat(geom.order({ bot, top }), ","), "2,1", "order falls back to y")

  if #fails > 0 then return "FAIL\n" .. table.concat(fails, "\n") end
  return "ok — " .. n .. " checks"
end

WM = M
return M
