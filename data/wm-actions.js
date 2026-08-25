/*
 * The WM half of the join — v2.1, one hand per domain, zero duplication.
 *
 * v2 (first pass) kept v1's mirroring for the 3 "anchor" diamonds (focus,
 * place-half, swap) — every action reachable from either hand, at the cost
 * of 24 duplicated positions. That was the right call at v1's 12 actions
 * (mirroring "wasted" 20% of the board); at v2's 41/27 actions it was the
 * wrong call — the same 24 positions now compete with everything else for
 * room, and mirroring's actual benefit (act with whichever hand is free)
 * doesn't need duplication to work: it needs A free hand, not EITHER hand.
 * The Magic-latch entry already gives hands-free access to the whole board
 * regardless of mirroring, so momentary-hold's marginal value was just
 * "quick single tap without fully latching" — preserved below by giving
 * each hold key a FIXED, memorable domain instead of identical content.
 *
 * So: LEFT hand = focus (where attention goes), RIGHT hand = movement
 * (what happens to the window). Hold `G` (left hand) → right hand acts →
 * right hand's domain is movement. Hold `H` (right hand) → left hand acts
 * → left hand's domain is focus. One rule, not "which hand has the action
 * I want" for all 27 shared actions.
 *
 * This was free to do: the left hand was never constrained by anything —
 * Cursor's left hand does home-row mods + select macros, unrelated.
 *
 * **Revised 2026-08-25: place-half moved from `J K L ;` (31-34) to
 * `H J K L` (30-33), independently of Cursor/Cursor_macOS.** Both used to
 * read left-to-right as `← ↑ ↓ →` starting at `J` — not vim semantics,
 * just reading order, and the two layers shared that position purely
 * because it was convenient, not because the underlying idea matched. That
 * put WM at odds with the VSCode layer's `H J K L` quad, which uses REAL
 * vim semantics (`h`=left, `j`=down, `k`=up, `l`=right) — `J` meant "left"
 * on WM/Cursor and "down" on VS Code, a real muscle-memory trap. First fix
 * moved Cursor/Cursor_macOS's diamond too, to keep everything aligned; on
 * reflection that traded away something real — Cursor is a general
 * arrow/editing layer (and doubles for gaming), not a vim-navigation one,
 * so there was no matching mnemonic there to protect, and its `J K L ;`
 * had its own accumulated muscle memory. **Cursor/Cursor_macOS reverted to
 * `J K L ;`**; only WM's place-half (and the VSCode layer it's now
 * matching) use vim order. The two are simply independent now — no shared
 * position, no shared convention, each aligned with what actually needs it.
 * `K` (up) is still the same key in both WM's and Cursor's conventions,
 * pure coincidence.
 *
 * Windows: a proven Python daemon (`RegisterHotKey` + `WM_HOTKEY`, no admin
 * needed) exposes directional window focus, window swap, resize, a stable
 * screen-position window cycle, minimize-based fake workspaces, and ~25
 * named placement regions — verified end to end on real 3-monitor hardware.
 *
 * macOS: no daemon exists yet. The `mac` field below describes the intended
 * Hammerspoon call for each action. `hs.window:focusWindowWest/East/North/
 * South()` exists but has open correctness bugs (#2558 wrong-app-focus,
 * #3574 hangs) — focus, swap, and cycle are all meant to be HAND-ROLLED
 * ports of the Windows daemon's own proven geometry algorithm (reversible,
 * non-wrapping, sorted by screen position), not the Hammerspoon builtins.
 * Workspaces are cut entirely from macOS: `hs.spaces.moveWindowToSpace` is
 * confirmed broken on Sequoia (open issue #3698, fix unmerged), and Mission
 * Control already covers the underlying need.
 *
 * `pos` is the ONE physical position for every action now — no `altPos`,
 * no mirroring, full stop. Same position on both OS layers for every
 * shared action (one physical map, two emissions, same principle as v1,
 * just without the duplication). `key` is always the macOS/F-key-pattern
 * representation, even for the 6 actions (place-halves, minimize, restore)
 * where Windows uses a native `Win`+chord instead — those carry an
 * explicit `winKey` that `tools/edits/wm-redesign-win.js` reads instead of
 * `key`; everything else emits `key` unchanged on both OS layers.
 *
 * `os: 'win'` marks the 14 workspace actions that don't exist on macOS at
 * all (omitted `os` means both). These live on `F21`-`F24`, which macOS
 * cannot even address (no Carbon virtual keycode past F20) — zero
 * collision risk by construction, not by careful avoidance.
 *
 * Physical layout (ZMK position numbers, verified against the live keymap
 * and js/geometry.js, not estimated):
 *
 *   LEFT hand — focus domain            RIGHT hand — movement domain
 *   row1:  12   13  14  15  16   17     row1:  18   19  20  21  22   23
 *          tog  ←   ◀   ▶   →    (–)          (–)  ←   ↑   ↓   →    full
 *          focus-dir + cycle flanked          swap                 place-extra
 *          by focus-monitor W/E
 *
 *   row2:  24   25  26  27  28   29     row2:  30  31  32  33  34   35
 *          (–)  ←   ↑   ↓   →    (G)          (H) ←   ↓   ↑   →    center
 *          focus-direction (moved            place-half — vim order,
 *          here from row1)                    independent of Cursor
 *
 *   row3:  (magic) ws5 ws-un ws-show (–) (–)  row3:  (magic) wider narrower taller (–)
 *          Windows workspace overflow          resize
 *          (borrows this hand's freed row3 —
 *          administrative, not "focus" content)
 *
 *   nav-row (48-53, was Home/Left/Right/Up/Down/End): right hand only now —
 *   51=minimize, 52=restore, 53=SE quadrant. Left hand's nav-row (48-50) is
 *   unused/spare.
 *
 * `G`(29) is still untouched `&trans` — inert either way, since it's the
 * key you're holding when you'd otherwise reach for it. `H`(30) is
 * DIFFERENT as of 2026-08-25: it now holds place-left (was `&trans`
 * through v2/v2.1). That's safe precisely because it's the OTHER hand's
 * hold key — holding `G` (left hand) to free the right hand, then
 * pressing `H` with that same right hand's index finger, is two different
 * fingers on two different physical switches, nothing self-referential
 * about it. It only goes inert if you enter via holding `H` itself
 * (right hand occupied holding the key down) — which is fine, since
 * holding `H` is for the LEFT hand's focus actions, not the right hand's
 * movement ones. Position 36 (Magic fallthrough) stays `&trans` for the
 * same reason as before — Magic must stay reachable by fallthrough from
 * inside the layer.
 *
 * Minimize/restore aren't in either daemon's original action list — added
 * back here (dropping 2 of what would've been 4 extra place-quadrants)
 * since minimize is far more common than a third/fourth quadrant, and
 * macOS otherwise had zero fallback for it (Windows already covers it
 * contextually via the unchanged Win+Up/Win+Down at the place-half row).
 *
 * Reserved elsewhere, never bind these regardless of future edits:
 *   LC(LS(F17))-LC(LS(F20))   bt-mouse-follow.js BT-hop macros, both OS
 *   LC(LS(F13))-LC(LS(F16))   apps-layers.js VS Code panel-focus quad, both OS
 *   LS(F17), LS(F18)          apps-layers.js VS Code chords, Windows only
 *   LS(F19)                   apps-layers.js VS Code terminal picker, both OS
 */
(function (root) {
  root.G80_WM_ACTIONS = [
    // ==================================================== LEFT hand — focus domain
    // ---------------------------------------------------------- focus-direction
    { key: 'F13', pos: 25, group: 'focus', label: '←', prompt: 'Focus the window to your LEFT',
      mac: 'Hammerspoon → hand-rolled focus_direction(\'left\')', win: 'daemon → focus-direction direction=left' },
    { key: 'F14', pos: 26, group: 'focus', label: '↑', prompt: 'Focus the window ABOVE',
      mac: 'Hammerspoon → hand-rolled focus_direction(\'up\')', win: 'daemon → focus-direction direction=up' },
    { key: 'F15', pos: 27, group: 'focus', label: '↓', prompt: 'Focus the window BELOW',
      mac: 'Hammerspoon → hand-rolled focus_direction(\'down\')', win: 'daemon → focus-direction direction=down' },
    { key: 'F16', pos: 28, group: 'focus', label: '→', prompt: 'Focus the window to your RIGHT',
      mac: 'Hammerspoon → hand-rolled focus_direction(\'right\')', win: 'daemon → focus-direction direction=right' },

    // -------------------------------------------------------- focus-toggle / monitor / cycle
    { key: 'LS(F15)', pos: 12, group: 'focus', label: '⇄', prompt: 'Jump back to the window you were on before this one',
      mac: 'Hammerspoon → focus the previously-focused window (tracked by a focus watcher)', win: 'daemon → focus-toggle' },
    { key: 'LS(F13)', pos: 13, group: 'monitor', label: '⇤', prompt: 'Focus the frontmost window on the monitor to your LEFT',
      mac: 'Hammerspoon → focus frontmost window on screen:toWest()', win: 'daemon → focus-monitor monitor=left' },
    { key: 'LA(F19)', pos: 14, group: 'cycle', label: '◀', prompt: 'Cycle to the PREVIOUS window on this monitor',
      mac: 'Hammerspoon → hand-rolled cycle, sorted by screen position, prev', win: 'daemon → cycle-window direction=prev' },
    { key: 'LA(F20)', pos: 15, group: 'cycle', label: '▶', prompt: 'Cycle to the NEXT window on this monitor',
      mac: 'Hammerspoon → hand-rolled cycle, sorted by screen position, next', win: 'daemon → cycle-window direction=next' },
    { key: 'LS(F14)', pos: 16, group: 'monitor', label: '⇥', prompt: 'Focus the frontmost window on the monitor to your RIGHT',
      mac: 'Hammerspoon → focus frontmost window on screen:toEast()', win: 'daemon → focus-monitor monitor=right' },

    // ==================================================== RIGHT hand — movement domain
    // ------------------------------------------------------------- swap
    { key: 'LC(F13)', pos: 19, group: 'swap', label: '←', prompt: 'Swap places with the window to your LEFT',
      mac: 'Hammerspoon → hand-rolled swap(\'left\')', win: 'daemon → swap direction=left' },
    { key: 'LC(F14)', pos: 20, group: 'swap', label: '↑', prompt: 'Swap places with the window ABOVE',
      mac: 'Hammerspoon → hand-rolled swap(\'up\')', win: 'daemon → swap direction=up' },
    { key: 'LC(F15)', pos: 21, group: 'swap', label: '↓', prompt: 'Swap places with the window BELOW',
      mac: 'Hammerspoon → hand-rolled swap(\'down\')', win: 'daemon → swap direction=down' },
    { key: 'LC(F16)', pos: 22, group: 'swap', label: '→', prompt: 'Swap places with the window to your RIGHT',
      mac: 'Hammerspoon → hand-rolled swap(\'right\')', win: 'daemon → swap direction=right' },
    { key: 'LA(F13)', pos: 23, group: 'place', label: 'full', prompt: 'Fill the whole screen (not OS-native maximize)',
      mac: 'Hammerspoon → moveToUnit(full)', win: 'daemon → place region=full' },

    // ------------------------------------------------- place: halves (repositioned 2026-08-25, see doc comment)
    { key: 'F17', pos: 30, group: 'place', label: '←', prompt: 'Snap the window to the LEFT half',
      mac: 'Hammerspoon → moveToUnit(left-half)', win: 'native — Win+Left', winKey: 'LG(LEFT)' },
    { key: 'F19', pos: 31, group: 'place', label: '↓', prompt: 'Snap the window to the BOTTOM half',
      mac: 'Hammerspoon → moveToUnit(bottom-half)', win: 'native — Win+Down', winKey: 'LG(DOWN)' },
    { key: 'F18', pos: 32, group: 'place', label: '↑', prompt: 'Snap the window to the TOP half',
      mac: 'Hammerspoon → moveToUnit(top-half)', win: 'native — Win+Up', winKey: 'LG(UP)' },
    { key: 'F20', pos: 33, group: 'place', label: '→', prompt: 'Snap the window to the RIGHT half',
      mac: 'Hammerspoon → moveToUnit(right-half)', win: 'native — Win+Right', winKey: 'LG(RIGHT)' },
    { key: 'LA(F14)', pos: 35, group: 'place', label: 'center', prompt: 'Center the window without maximizing it',
      mac: 'Hammerspoon → moveToUnit(center, 70%)', win: 'daemon → place region=center' },

    // ------------------------------------------------------------- resize
    { key: 'LC(F17)', pos: 43, group: 'resize', label: 'wider', prompt: 'Grow the window WIDER, about its own center',
      mac: 'Hammerspoon → setFrame, grow about center', win: 'daemon → resize direction=wider' },
    { key: 'LC(F18)', pos: 44, group: 'resize', label: 'narrower', prompt: 'Shrink the window NARROWER, about its own center',
      mac: 'Hammerspoon → setFrame, shrink about center', win: 'daemon → resize direction=narrower' },
    { key: 'LC(F19)', pos: 45, group: 'resize', label: 'taller', prompt: 'Grow the window TALLER, about its own center',
      mac: 'Hammerspoon → setFrame, grow about center', win: 'daemon → resize direction=taller' },
    { key: 'LC(F20)', pos: 46, group: 'resize', label: 'shorter', prompt: 'Shrink the window SHORTER, about its own center',
      mac: 'Hammerspoon → setFrame, shrink about center', win: 'daemon → resize direction=shorter' },
    { key: 'LA(F15)', pos: 47, group: 'place', label: 'NW', prompt: 'Snap the window to the TOP-LEFT quarter',
      mac: 'Hammerspoon → moveToUnit(top-left)', win: 'daemon → place region=top-left' },

    // -------------------------------------------------- place: minimize/restore + last quadrant
    { key: 'LA(F16)', pos: 51, group: 'place', label: 'min', prompt: 'Minimize the window',
      mac: 'Hammerspoon → focused:minimize()', win: 'native — Win+Down (same chord as snap-bottom; redundant on purpose)', winKey: 'LG(DOWN)' },
    { key: 'LA(F17)', pos: 52, group: 'place', label: 'restore', prompt: 'Un-minimize / restore the window',
      mac: 'Hammerspoon → focused:unminimize()', win: 'native — Win+Up (same chord as snap-top; redundant on purpose)', winKey: 'LG(UP)' },
    { key: 'LA(F18)', pos: 53, group: 'place', label: 'SE', prompt: 'Snap the window to the BOTTOM-RIGHT quarter',
      mac: 'Hammerspoon → moveToUnit(bottom-right)', win: 'daemon → place region=bottom-right' },

    // ============================== workspaces (Windows only — borrows the focus hand's freed row3)
    { key: 'F21', pos: 1, group: 'workspace', label: '1', prompt: 'Switch to workspace 1', os: 'win',
      win: 'daemon → workspace-switch workspace=1' },
    { key: 'F22', pos: 2, group: 'workspace', label: '2', prompt: 'Switch to workspace 2', os: 'win',
      win: 'daemon → workspace-switch workspace=2' },
    { key: 'F23', pos: 3, group: 'workspace', label: '3', prompt: 'Switch to workspace 3', os: 'win',
      win: 'daemon → workspace-switch workspace=3' },
    { key: 'F24', pos: 4, group: 'workspace', label: '4', prompt: 'Switch to workspace 4', os: 'win',
      win: 'daemon → workspace-switch workspace=4' },
    { key: 'LC(F21)', pos: 5, group: 'workspace', label: '5', prompt: 'Switch to workspace 5', os: 'win',
      win: 'daemon → workspace-switch workspace=5' },
    { key: 'LC(F22)', pos: 6, group: 'workspace', label: '6', prompt: 'Switch to workspace 6', os: 'win',
      win: 'daemon → workspace-switch workspace=6' },
    { key: 'LA(F21)', pos: 7, group: 'workspace', label: 'assign 1', prompt: 'Move the focused window to workspace 1 (does not switch to it)', os: 'win',
      win: 'daemon → workspace-assign workspace=1' },
    { key: 'LA(F22)', pos: 8, group: 'workspace', label: 'assign 2', prompt: 'Move the focused window to workspace 2 (does not switch to it)', os: 'win',
      win: 'daemon → workspace-assign workspace=2' },
    { key: 'LA(F23)', pos: 9, group: 'workspace', label: 'assign 3', prompt: 'Move the focused window to workspace 3 (does not switch to it)', os: 'win',
      win: 'daemon → workspace-assign workspace=3' },
    { key: 'LA(F24)', pos: 10, group: 'workspace', label: 'assign 4', prompt: 'Move the focused window to workspace 4 (does not switch to it)', os: 'win',
      win: 'daemon → workspace-assign workspace=4' },
    { key: 'LC(F23)', pos: 11, group: 'workspace', label: 'assign 5', prompt: 'Move the focused window to workspace 5 (does not switch to it)', os: 'win',
      win: 'daemon → workspace-assign workspace=5' },
    { key: 'LC(F24)', pos: 37, group: 'workspace', label: 'assign 6', prompt: 'Move the focused window to workspace 6 (does not switch to it)', os: 'win',
      win: 'daemon → workspace-assign workspace=6' },
    { key: 'LS(F23)', pos: 38, group: 'workspace', label: 'unassign', prompt: 'Remove the focused window from any workspace', os: 'win',
      win: 'daemon → workspace-unassign' },
    { key: 'LS(F24)', pos: 39, group: 'workspace', label: 'show', prompt: 'Print which workspace every window is on — the only way to see it', os: 'win',
      win: 'daemon → workspace-show' }
  ];
})(typeof self !== 'undefined' ? self : this);
