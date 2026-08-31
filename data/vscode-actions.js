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
 * `pos` only, no `altPos` — nothing on this layer is mirrored, and the
 * layer is reached one way as of 2026-08-31: Magic + `N`/`M` (#42/#43),
 * which is `&to` and latches until you Magic back to a base. The `RAlt`
 * thumb that used to hold it went back to being Option/Alt, and no other
 * key could take the hold without costing a quad key — see PLAN.md.
 *
 * Physical split (2026-08-24, matches PLAN.md §WM redesign v2.1's
 * focus/movement split): right hand row2 (`J K L ;`, positions 31-34) =
 * FOCUS — which panel has attention. Left hand row2 (`A S D F`, positions
 * 25-28) = MOVEMENT — move the current tab, or resize the layout by
 * maximizing/restoring the focused group. The movement quad first shipped
 * on row1 (12-15), a row offset from the focus quad and reported as
 * confusing for exactly that reason; 2026-08-25 moved it to row2-left,
 * displacing two pre-existing one-off bindings (split-editor, the
 * undocumented Alt+K) to the now-free row1 slots (12/13).
 *
 * **Revised 2026-08-28: both quads read `← ↑ ↓ →`, and the focus quad
 * moved from `H J K L` (30-33) to `J K L ;` (31-34)** — then back to
 * `H J K L` on 2026-08-31, when `'` became the layer door and the right
 * pinky could no longer reach `;` while holding it. `LC(R)` went with it,
 * from `H` to `Y` (18). Arrow order and every chord->command assignment
 * are untouched, so this stays firmware-only. They used to read
 * `← ↓ ↑ →` — vim order — on the theory that this layer's whole point was
 * mirroring vim's `⌃W` window model. That justification doesn't hold up:
 * there's no vim, no Vim extension, and no `⌃W` habit anywhere in this
 * toolchain (see os/vscode/ — nothing vim-related is installed), so the
 * quad was reproducing a keybinding you never press. Meanwhile it
 * disagreed with Cursor/Cursor_macOS's arrow diamond and with WM's own
 * row1 swap quad, both of which have always been `← ↑ ↓ →`.
 *
 * One rule now covers every directional quad on the board: **`←` `↑` `↓`
 * `→`, left to right, on whichever four keys the quad occupies.** Cursor's
 * diamond is untouched and always was the reference; WM and VS Code came
 * to it. See data/wm-actions.js for the WM half.
 *
 * Chord->command assignments did NOT change — `LC(LS(F13))` is still
 * navigateLeft, `LC(LS(F14))` still navigateDown, and so on, which is why
 * `F14`/`F15` now appear "out of order" reading the keymap left to right.
 * That was deliberate: it keeps this a firmware-only change, so
 * os/vscode/keybindings.jsonc is unchanged and neither machine needs its
 * keybindings.json re-merged. Reflash and it's done.
 *
 * `LC(R)` (openRecent) moved to the freed `H` (30); it was on `;` (34),
 * which the focus quad then needed. Superseded 2026-08-31: it now sits on
 * `Y` (18), `H` having gone back to the focus quad. Everything else on the layer
 * (editor/terminal/Claude commands) rides VS Code's own defaults or a
 * handful of one-off custom chords, unrelated to the focus/movement split.
 *
 * Chord provenance:
 *  - `LC(LS(F13-16))` (J K L ;, focus quad) and `LS(F19)` (terminal
 *    profile picker) were custom-assigned 2026-08-23 because VS Code ships
 *    no default for those specific commands — see os/vscode/keybindings.jsonc.
 *  - `LA(LS(F13-17))` (move-tab quad + maximize) — same reasoning, added
 *    2026-08-24, also in os/vscode/keybindings.jsonc. Deliberately NOT
 *    a chord band the WM daemons already claim (bare/`LC`/`LA`/`LS`-alone
 *    `F13`-`F20`) — those are OS-global hotkeys and would eat the
 *    keystroke before VS Code ever saw it, regardless of window focus.
 *  - Everything else emits VS Code's own factory-default chord for that
 *    command (Reopen Closed Editor, Split Editor, etc.) — nothing custom
 *    to install for those, they just need the physical key to reach them.
 *
 * **2026-08-28: the three unknowns here are resolved.** The Claude
 * extension's command IDs and the mystery `LA(K)` were all read straight
 * out of the installed extension's own `package.json`
 * (`contributes.keybindings`, anthropic.claude-code 2.1.250) rather than
 * guessed at: `LA(K)` is Insert @-Mention, and the Claude keys are
 * `claude-vscode.editor.open` and the `focus`/`blur`/`terminal.open.keyboard`
 * trio. The trio matters — one chord, three commands separated by `when`
 * clauses, so a Windows install that binds only `focus` gets a key that
 * focuses and never blurs. os/vscode/ carries the entries and the reason
 * Windows needs them at all (its defaults are Start menu and Task Manager).
 */
(function (root) {
  root.G80_VSCODE_ACTIONS = [
    // ==================================================== RIGHT hand — focus domain
    { key: 'LC(LS(F13))', pos: 31, group: 'focus', label: '←', prompt: 'Focus the panel to your LEFT',
      command: 'workbench.action.navigateLeft' },
    { key: 'LC(LS(F15))', pos: 32, group: 'focus', label: '↑', prompt: 'Focus the panel ABOVE',
      command: 'workbench.action.navigateUp' },
    { key: 'LC(LS(F14))', pos: 33, group: 'focus', label: '↓', prompt: 'Focus the panel BELOW',
      command: 'workbench.action.navigateDown' },
    { key: 'LC(LS(F16))', pos: 34, group: 'focus', label: '→', prompt: 'Focus the panel to your RIGHT',
      command: 'workbench.action.navigateRight' },

    // ==================================================== LEFT hand — movement domain (added 2026-08-24, repositioned 2026-08-25)
    { key: 'LA(LS(F17))', pos: 24, group: 'movement', label: '⤢', prompt: 'Maximize the focused pane (others hide) — press again to restore',
      command: 'workbench.action.toggleMaximizeEditorGroup' },
    { key: 'LA(LS(F13))', pos: 25, group: 'movement', label: '←', prompt: 'Move the current tab into the pane to your LEFT',
      command: 'workbench.action.moveEditorToLeftGroup' },
    { key: 'LA(LS(F15))', pos: 26, group: 'movement', label: '↑', prompt: 'Move the current tab into the pane ABOVE',
      command: 'workbench.action.moveEditorToAboveGroup' },
    { key: 'LA(LS(F14))', pos: 27, group: 'movement', label: '↓', prompt: 'Move the current tab into the pane BELOW',
      command: 'workbench.action.moveEditorToBelowGroup' },
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
      command: 'workbench.action.showAllEditorsByMostRecentlyUsed (was quickOpenPreviousRecentlyUsedEditor — see os/vscode/keybindings.jsonc for why)' },
    { key: 'LG(BSLH)', winKey: 'LC(BSLH)', pos: 12, group: 'editor', label: 'split', prompt: 'Split the editor',
      command: 'workbench.action.splitEditor' },
    { key: 'LC(R)', pos: 30, group: 'editor', label: 'recent', prompt: 'Open a recently opened file, folder, or workspace',
      command: 'workbench.action.openRecent' },

    // ------------------------------------------------------------- terminal
    { key: 'LC(GRAVE)', pos: 17, group: 'terminal', label: 'toggle', prompt: 'Show or hide the integrated terminal',
      command: 'workbench.action.terminal.toggleTerminal' },
    { key: 'LC(LS(GRAVE))', pos: 29, group: 'terminal', label: 'new', prompt: 'Create a new terminal',
      command: 'workbench.action.terminal.new' },
    { key: 'LS(F19)', pos: 41, group: 'terminal', label: 'profile', prompt: 'Open a new terminal, choosing which shell/profile',
      command: 'workbench.action.terminal.newWithProfile' },

    // --------------------------------------------------------------- claude
    { key: 'LG(LS(ESC))', winKey: 'LS(F18)', pos: 39, group: 'claude', label: 'session', prompt: 'Claude extension — open Claude in a new tab (new session)',
      command: 'claude-vscode.editor.open — mac rides the extension default (⌘⇧Esc); win needs an entry, its default Ctrl+Shift+Esc is Task Manager. See os/vscode/keybindings.windows.jsonc' },
    { key: 'LG(ESC)', winKey: 'LS(F17)', pos: 40, group: 'claude', label: 'focus', prompt: 'Claude extension — focus ⇄ blur (dedicated key, added 2026-08-25 — the layer\'s own route to focus/blur — since 2026-08-31 there is no base-layer tap for it, the RAlt thumb having gone back to being a plain Option/Alt key)',
      command: 'claude-vscode.focus / .blur / .terminal.open.keyboard — one chord, three commands split by `when`. mac rides the extension default (⌘Esc); win needs all three bound, its default Ctrl+Esc opens the Start menu. See os/vscode/keybindings.windows.jsonc' },

    // ---------------------------------------------------------------- other
    { key: 'LA(K)', pos: 13, group: 'other', label: '@', prompt: 'Insert an @-mention reference to the current file/selection into the Claude input',
      command: 'claude-vscode.insertAtMention — the extension\'s own default (Alt+K, editorTextFocus), same on both OSes, nothing to install' }
  ];
})(typeof self !== 'undefined' ? self : this);
