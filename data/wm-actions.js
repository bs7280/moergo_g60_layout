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
 * **Revised 2026-08-28: place-half is back on `J K L ;` (31-34), reading
 * `← ↑ ↓ →` — and now so is every other directional quad on the board.**
 * The 08-25 pass moved place-half to `H J K L` in vim order to match the
 * VSCode layer, on the theory that vim's mapping was the mnemonic worth
 * building muscle memory around. It isn't, here: there is no vim, no Vim
 * extension, no `⌃W` habit anywhere in the toolchain — the vim
 * alignment was aspirational, and it cost real consistency to hold.
 *
 * What it cost was visible on THIS layer, not across layers. The right
 * hand carries two directional quads one row apart, and 08-25 changed only
 * one of them:
 *
 *   row1 swap        `U I O P` (19-22)   ← ↑ ↓ →     untouched
 *   row2 place-half  `H J K L`  (30-33)  ← ↓ ↑ →     vim, as of 08-25
 *
 * Same hand, adjacent rows, not column-aligned, and "up" was the 2nd key
 * of one quad and the 3rd of the other. The left hand's focus quad
 * (`A S D F`, 25-28) was `← ↑ ↓ →` all along too, so vim order was the odd
 * one out on its own layer, matching nothing here and one quad elsewhere.
 *
 * So place-half moved one column right and swapped its middle two: swap
 * and place-half are now column-aligned AND same-order, the whole layer
 * reads one way, and it happens to agree with Cursor/Cursor_macOS and the
 * VSCode layer as well. One rule for the whole board: **`←` `↑` `↓` `→`,
 * left to right, on whichever four keys the quad occupies.** (Mouse and
 * Keypad keep their inverted-T — a different shape, not a different order.)
 *
 * Chord assignments did NOT change — `F17`-`F20` still mean left/top/
 * bottom/right to both daemons, only the key emitting each one moved. No
 * daemon config, Hammerspoon script, or OS-side file needs touching for
 * this; reflash and it's done. `F17`-`F20` now also run in numeric order
 * left-to-right across the quad, which they didn't before.
 *
 * `K` (up) is at position 32 through all of this — it was the one key the
 * two conventions always agreed on, and it never moved.
 *
 * Both daemons exist now. macOS: `os/wm/mac/init.lua` (Hammerspoon), in
 * this repo. Windows: the Python daemon (`RegisterHotKey` + `WM_HOTKEY` +
 * `ctypes`, no admin and nothing to install), which lives on the work
 * laptop and is still uncommitted. The `mac`/`win` fields below name the
 * call each one makes.
 *
 * Focus, swap and cycle are HAND-ROLLED geometry in both — the same
 * algorithm, ported: candidates whose center lies in the target direction,
 * prefer perpendicular-axis overlap, nearest wins, never wrap. On macOS
 * that is because `hs.window:focusWindowWest/East/North/South()` has open
 * correctness bugs (#2558 wrong-app-focus, #3574 hangs); on Windows there
 * is no builtin to have a bug.
 *
 * Workspaces are cut entirely from macOS: `hs.spaces.moveWindowToSpace` is
 * confirmed broken on Sequoia (open issue #3698, fix unmerged), and Mission
 * Control already covers the underlying need.
 *
 * `pos` is the ONE physical position for every action now — no `altPos`,
 * no mirroring, full stop. Same position on both OS layers for every
 * shared action (one physical map, two emissions, same principle as v1,
 * just without the duplication).
 *
 * **Revised 2026-09-01: there is no `winKey` any more.** Six actions used
 * to carry one — place-halves on `LG(LEFT/UP/DOWN/RIGHT)`, minimize and
 * restore on `LG(DOWN)`/`LG(UP)` — so that `WM_Win` leaned on native
 * Windows Snap for the one part of the board the old daemon didn't cover.
 * The Windows daemon covers those six the same way it covers the other
 * 35, so all 27 shared actions emit the SAME chord on both OS layers and
 * `key` is the only chord field left. Snap was never quite the intent
 * anyway: `Win+Up` maximizes rather than taking the top half, `Win+Down`
 * un-maximizes before it minimizes, and Windows 11 answers `Win+Left`
 * with a Snap Layouts flyout. The daemon just sets the rect.
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
 *          (–)  ←   ↑   ↓   →    (G)          (H)  ←   ↑   ↓   →   center
 *          focus-direction (moved            place-half — column-aligned
 *          here from row1)                    under row1's swap quad
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
 * `G`(29) and `H`(30) are both untouched `&trans` again — 08-25 briefly
 * gave `H` place-left; the 08-28 shift handed it back. Both are inert by
 * design: each is the key you're holding when you'd otherwise reach for
 * it, so neither can carry content that's reachable from its own entry.
 * Leaving both empty is the simpler invariant — no per-key reasoning
 * about which entry path makes which binding live.
 *
 * The hold-`H` entry does put the right index on `H`, one column from
 * `J`(←), so the movement quad is awkward to drive from that entry. Fine
 * by design: holding `H` frees the LEFT hand, and the left hand's domain
 * is focus, not movement. Reach movement via hold-`G` or the Magic latch.
 *
 * Position 36 (Magic fallthrough) stays `&trans` for the same reason as
 * before — Magic must stay reachable by fallthrough from inside the layer.
 *
 * Minimize/restore aren't in either daemon's original action list — added
 * back here (dropping 2 of what would've been 4 extra place-quadrants)
 * since minimize is far more common than a third/fourth quadrant, and
 * neither OS had a fallback for it once the layer stopped emitting
 * `Win`+arrow. Both daemons implement it directly, and restore pops a
 * stack of what the minimize key minimized rather than guessing.
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

    // ------------------------------------------------- place: halves (repositioned 2026-08-28, see doc comment)
    { key: 'F17', pos: 31, group: 'place', label: '←', prompt: 'Snap the window to the LEFT half',
      mac: 'Hammerspoon → moveToUnit(left-half)', win: 'daemon → place region=left' },
    { key: 'F18', pos: 32, group: 'place', label: '↑', prompt: 'Snap the window to the TOP half',
      mac: 'Hammerspoon → moveToUnit(top-half)', win: 'daemon → place region=top' },
    { key: 'F19', pos: 33, group: 'place', label: '↓', prompt: 'Snap the window to the BOTTOM half',
      mac: 'Hammerspoon → moveToUnit(bottom-half)', win: 'daemon → place region=bottom' },
    { key: 'F20', pos: 34, group: 'place', label: '→', prompt: 'Snap the window to the RIGHT half',
      mac: 'Hammerspoon → moveToUnit(right-half)', win: 'daemon → place region=right' },
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
      mac: 'Hammerspoon → focused:minimize()', win: 'daemon → minimize' },
    { key: 'LA(F17)', pos: 52, group: 'place', label: 'restore', prompt: 'Un-minimize / restore the window',
      mac: 'Hammerspoon → focused:unminimize()', win: 'daemon → restore' },
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
