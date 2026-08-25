/*
 * The VS Code half of the join — same idea as data/wm-actions.js (a
 * position knows a chord, this file says what the chord DOES), scaled down
 * for a much smaller layer: 21 real bindings total across VSCode_macOS/
 * VSCode_Win. Most shipped 2026-08-23; the move-tab-to-pane quad + maximize
 * toggle were added 2026-08-24 (then repositioned 2026-08-25 — see below);
 * a dedicated Claude-focus key was added 2026-08-25.
 *
 * Simpler schema than wm-actions.js on purpose: WM targets two entirely
 * different OS-level tools (a daemon on each side), so `mac`/`win` needed
 * to be separate prose describing what to configure. VS Code is ONE
 * command system that happens to run on both OSes — a `command` is the
 * same command ID regardless of which machine it's flashed to, so there's
 * one `command` field, and only `key`/`winKey` differ when VS Code's own
 * default chord happens to differ by OS (5 of the 20 do; the other 15 emit
 * the identical chord on both layers).
 *
 * `pos` only, no `altPos` — nothing on this layer is mirrored (there's no
 * G/H-style dual-hand entry here; the whole layer is reached by holding
 * one key, `RAlt`, so both hands are free once it's held and mirroring
 * would just be pure duplication for no benefit).
 *
 * Physical split (2026-08-24, matches PLAN.md §WM redesign v2.1's
 * focus/movement split): right hand (H/J/K/L, row2, unchanged since
 * 2026-08-23) = FOCUS — which panel has attention. Left hand row2
 * (A/S/D/F, positions 25-28) = MOVEMENT — move the current tab, or resize
 * the layout by maximizing/restoring the focused group. **Revised
 * 2026-08-25**: the movement quad first shipped on row1 (12-15), offset
 * one row from H/J/K/L — reported as confusing precisely because it wasn't
 * a true mirror. Moved to row2-left (25-28), the actual mirror image of
 * H/J/K/L's row2-right, displacing two pre-existing one-off bindings
 * (split-editor, the undocumented Alt+K) to the now-free row1 slots
 * (12/13). Everything else on the layer (editor/terminal/Claude commands)
 * rides VS Code's own defaults or a handful of one-off custom chords,
 * unrelated to the focus/movement split.
 *
 * Chord provenance:
 *  - `LC(LS(F13-16))` (H J K L, focus quad) and `LS(F19)` (terminal
 *    profile picker) were custom-assigned 2026-08-23 because VS Code ships
 *    no default for those specific commands — see os/vscode-keybindings.jsonc.
 *  - `LA(LS(F13-17))` (move-tab quad + maximize) — same reasoning, added
 *    2026-08-24, also in os/vscode-keybindings.jsonc. Deliberately NOT
 *    a chord band the WM daemons already claim (bare/`LC`/`LA`/`LS`-alone
 *    `F13`-`F20`) — those are OS-global hotkeys and would eat the
 *    keystroke before VS Code ever saw it, regardless of window focus.
 *  - Everything else emits VS Code's own factory-default chord for that
 *    command (Reopen Closed Editor, Split Editor, etc.) — nothing custom
 *    to install for those, they just need the physical key to reach them.
 */
(function (root) {
  root.G80_VSCODE_ACTIONS = [
    // ==================================================== RIGHT hand — focus domain
    { key: 'LC(LS(F13))', pos: 30, group: 'focus', label: '←', prompt: 'Focus the panel to your LEFT',
      command: 'workbench.action.navigateLeft' },
    { key: 'LC(LS(F14))', pos: 31, group: 'focus', label: '↓', prompt: 'Focus the panel BELOW',
      command: 'workbench.action.navigateDown' },
    { key: 'LC(LS(F15))', pos: 32, group: 'focus', label: '↑', prompt: 'Focus the panel ABOVE',
      command: 'workbench.action.navigateUp' },
    { key: 'LC(LS(F16))', pos: 33, group: 'focus', label: '→', prompt: 'Focus the panel to your RIGHT',
      command: 'workbench.action.navigateRight' },

    // ==================================================== LEFT hand — movement domain (added 2026-08-24, repositioned 2026-08-25)
    { key: 'LA(LS(F17))', pos: 24, group: 'movement', label: '⤢', prompt: 'Maximize the focused pane (others hide) — press again to restore',
      command: 'workbench.action.toggleMaximizeEditorGroup' },
    { key: 'LA(LS(F13))', pos: 25, group: 'movement', label: '←', prompt: 'Move the current tab into the pane to your LEFT',
      command: 'workbench.action.moveEditorToLeftGroup' },
    { key: 'LA(LS(F14))', pos: 26, group: 'movement', label: '↓', prompt: 'Move the current tab into the pane BELOW',
      command: 'workbench.action.moveEditorToBelowGroup' },
    { key: 'LA(LS(F15))', pos: 27, group: 'movement', label: '↑', prompt: 'Move the current tab into the pane ABOVE',
      command: 'workbench.action.moveEditorToAboveGroup' },
    { key: 'LA(LS(F16))', pos: 28, group: 'movement', label: '→', prompt: 'Move the current tab into the pane to your RIGHT',
      command: 'workbench.action.moveEditorToRightGroup' },

    // -------------------------------------------------------------- editor / tabs
    { key: 'LG(LS(T))', winKey: 'LC(LS(T))', pos: 16, group: 'editor', label: 'reopen', prompt: 'Reopen the last closed editor',
      command: 'workbench.action.reopenClosedEditor' },
    { key: 'LG(LS(LBKT))', winKey: 'LC(PG_UP)', pos: 19, group: 'editor', label: 'prev', prompt: 'Previous editor tab (or terminal tab, if a terminal is focused)',
      command: 'workbench.action.previousEditor / previousEditorInGroup — context-smart, see PLAN.md' },
    { key: 'LG(LS(RBKT))', winKey: 'LC(PG_DN)', pos: 20, group: 'editor', label: 'next', prompt: 'Next editor tab (or terminal tab, if a terminal is focused)',
      command: 'workbench.action.nextEditor / nextEditorInGroup — context-smart, see PLAN.md' },
    { key: 'LC(TAB)', pos: 21, group: 'editor', label: 'switch', prompt: 'Open the most-recently-used editor list as a normal picker — arrow keys/typing, Enter to confirm',
      command: 'workbench.action.showAllEditorsByMostRecentlyUsed (was quickOpenPreviousRecentlyUsedEditor — see os/vscode-keybindings.jsonc for why)' },
    { key: 'LG(BSLH)', winKey: 'LC(BSLH)', pos: 12, group: 'editor', label: 'split', prompt: 'Split the editor',
      command: 'workbench.action.splitEditor' },
    { key: 'LC(R)', pos: 34, group: 'editor', label: 'recent', prompt: 'Open a recently opened file, folder, or workspace',
      command: 'workbench.action.openRecent' },

    // ------------------------------------------------------------- terminal
    { key: 'LC(GRAVE)', pos: 17, group: 'terminal', label: 'toggle', prompt: 'Show or hide the integrated terminal',
      command: 'workbench.action.terminal.toggleTerminal' },
    { key: 'LC(LS(GRAVE))', pos: 29, group: 'terminal', label: 'new', prompt: 'Create a new terminal',
      command: 'workbench.action.terminal.new' },
    { key: 'LS(F19)', pos: 41, group: 'terminal', label: 'profile', prompt: 'Open a new terminal, choosing which shell/profile',
      command: 'workbench.action.terminal.newWithProfile' },

    // --------------------------------------------------------------- claude
    { key: 'LG(LS(ESC))', winKey: 'LS(F18)', pos: 39, group: 'claude', label: 'session', prompt: 'Claude extension — new session (Windows chord unverified, see os/vscode-keybindings.jsonc)',
      command: 'claude-extension new session — command ID not confirmed on Windows' },
    { key: 'LG(ESC)', winKey: 'LS(F17)', pos: 40, group: 'claude', label: 'focus', prompt: 'Claude extension — focus ⇄ blur (dedicated key, added 2026-08-25 — same chord as the RAlt-tap shortcut, but reachable without any tap/hold timing risk once you\'re already holding RAlt into this layer)',
      command: 'mac: extension default (Cmd+Esc, already works — no keybindings.json entry needed). win: command ID not confirmed, see os/vscode-keybindings.jsonc' },

    // ---------------------------------------------------------------- other
    { key: 'LA(K)', pos: 13, group: 'other', label: '?', prompt: 'Alt+K — bound since 2026-08-23, purpose not documented; check your real VS Code keybindings.json before relying on it',
      command: 'undocumented — verify' }
  ];
})(typeof self !== 'undefined' ? self : this);
