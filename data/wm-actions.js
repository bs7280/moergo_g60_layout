/*
 * The WM half of the join.
 *
 * Your layout knows "position 31 emits F13". It cannot know what F13 *means* —
 * that lives in a WM config that doesn't exist yet. So it lives here, and the
 * practice harness joins the two on the F-key.
 *
 * `pos` / `altPos` are only a fallback for before the layer is flashed. Once a
 * layer in your exported layout actually binds F13–F24, practice.js reads the
 * real positions from it and ignores these.
 *
 * `mac` / `win` say what to CONFIGURE, not what the key emits — the emission
 * is read off the layout, because there are now two WM layers (F-keys for
 * macOS, native chords for Windows) and hardcoding either would drift.
 *
 * `prompt` is what you get drilled on. Phrase it as intent, not as the label —
 * the skill being trained is "I want the window on the left" -> finger, not
 * "the key called snap-left" -> finger.
 *
 * Layout — the layer is mirrored, so every action has two positions. Hold `G`
 * (left index) and the right hand is free; hold `H` (right index) and the left
 * hand is. `pos` is the right-hand key, `altPos` the left-hand one.
 *
 *            hold G ->  right hand      hold H ->  left hand
 *   travel   [ mon← ] [ desk← ] [ desk→ ] [ mon→ ]      U I O P  /  Q W E R
 *   tile     [  ←   ] [   ↑   ] [   ↓   ] [  →   ]      J K L ;  /  A S D F
 *   verbs    [ full ] [center ] [  min  ] [restore]     M , . /  /  Z X C V
 *
 * The verb row emits LS(F13)-LS(F16), not F21-F24. macOS cannot see F21+ —
 * Carbon never gave them virtual keycodes — so the whole set lives inside
 * F13-F20 and the verbs are 'the travel row plus Shift'.
 *
 * There is deliberately no CLOSE here. It used to be F23, which is the same
 * finger as snap-down (F19) one row up — so a slightly low "snap to the bottom
 * half" closed the window instead. That's the only irreversible action in the
 * set sitting under the most-used one. Closing is an application action you
 * already have on Cmd/Ctrl+W; this layer arranges windows, it doesn't destroy
 * them. Minimize took the slot because it's the missing verb and it's undoable.
 *
 * Read left-to-right on BOTH hands — the left hand is a spatial copy, not a
 * finger mirror. Same-finger mirroring would put ← under the left index and →
 * under the left pinky, so the leftmost key would move a window right. See
 * tools/edits/wm-mirror-gh.js if you want to flip that.
 *
 * NOTE — the tile row is ← ↑ ↓ →, NOT the vim-order ← ↓ ↑ → in the design doc.
 * That's deliberate: this layout's Cursor and Cursor_macOS layers already bind
 * positions 31-34 as LEFT / UP / DOWN / RIGHT, and the Mouse layer agrees
 * (middle finger = up). Using vim order here would put snap-up and snap-down on
 * the opposite fingers from the arrows you already use, which is exactly the
 * two-spatial-maps problem the one-map principle exists to avoid.
 *
 * If you'd rather go vim-order, swap it in the layer AND in the Cursor layers,
 * not just here.
 */
(function (root) {
  root.G80_WM_ACTIONS = [
    // ---- travel row: move between monitors and desktops
    { key: 'F13', pos: 19, altPos: 13, group: 'travel', label: 'mon ←', prompt: 'Send this window to the monitor on your LEFT',
      mac: 'Rectangle → Move to Previous Display', win: 'native' },
    { key: 'F14', pos: 20, altPos: 14, group: 'travel', label: 'desk ←', prompt: 'Go to the PREVIOUS desktop',
      mac: 'Mission Control → Move left a space', win: 'native' },
    { key: 'F15', pos: 21, altPos: 15, group: 'travel', label: 'desk →', prompt: 'Go to the NEXT desktop',
      mac: 'Mission Control → Move right a space', win: 'native' },
    { key: 'F16', pos: 22, altPos: 16, group: 'travel', label: 'mon →', prompt: 'Send this window to the monitor on your RIGHT',
      mac: 'Rectangle → Move to Next Display', win: 'native' },

    // ---- tile row: matches the Cursor layers' existing ← ↑ ↓ → on 31-34
    { key: 'F17', pos: 31, altPos: 25, group: 'tile', label: '←', prompt: 'Snap the window to the LEFT half',
      mac: 'Rectangle → Left Half', win: 'native' },
    { key: 'F18', pos: 32, altPos: 26, group: 'tile', label: '↑', prompt: 'Snap the window to the TOP half',
      mac: 'Rectangle → Top Half', win: 'native' },
    { key: 'F19', pos: 33, altPos: 27, group: 'tile', label: '↓', prompt: 'Snap the window to the BOTTOM half',
      mac: 'Rectangle → Bottom Half', win: 'native' },
    { key: 'F20', pos: 34, altPos: 28, group: 'tile', label: '→', prompt: 'Snap the window to the RIGHT half',
      mac: 'Rectangle → Right Half', win: 'native' },

    // ---- verb row: whole-window actions
    { key: 'LS(F13)', pos: 43, altPos: 37, group: 'verb', label: 'full', prompt: 'Maximize — fill the screen',
      mac: 'Rectangle → Maximize', win: 'native' },
    { key: 'LS(F14)', pos: 44, altPos: 38, group: 'verb', label: 'center', prompt: 'Center the window without resizing it',
      mac: 'Rectangle → Center', win: 'needs a helper' },
    { key: 'LS(F15)', pos: 45, altPos: 39, group: 'verb', label: 'min', prompt: 'Minimize the window',
      mac: 'App Shortcut → Minimize', win: 'native' },
    { key: 'LS(F16)', pos: 46, altPos: 40, group: 'verb', label: 'restore', prompt: 'Restore — undo the maximize',
      mac: 'Rectangle → Restore', win: 'needs a helper' }
  ];
})(typeof self !== 'undefined' ? self : this);
