/*
 * Teams layer: position -> what the chord does in Microsoft Teams.
 *
 * Source of truth for the intents is the apps-layers design doc (the
 * "Go60 · Apps layers plan" artifact); every entry here was verified
 * against the flashed keymap — position and emission both — before this
 * file was written. The layer itself is Windows-base only and deliberately
 * chat-first: no mute/camera/raise-hand, those are one native chord away
 * without a layer.
 *
 * `pos` is the ZMK key position (the base-layer letter is the mnemonic);
 * `key` is the chord the layer emits there, which is Teams' own default
 * binding for the action — nothing to configure on the OS side.
 */
(function (root) {
  root.G80_TEAMS_ACTIONS = [
    // ---- find things
    { key: 'LC(E)', pos: 15, group: 'search', label: 'search', prompt: 'Search everywhere — messages, files, people' },
    { key: 'LC(G)', pos: 29, group: 'search', label: 'go to', prompt: 'Go straight to a chat / channel — type its name, Enter' },
    { key: 'LC(F)', pos: 28, group: 'search', label: 'find here', prompt: 'Find in this chat / channel' },

    // ---- chats
    { key: 'LC(N2)', pos: 39, group: 'chat', label: 'open chat', prompt: 'Open Chat (2nd app in the bar)' },
    { key: 'LC(N)', pos: 42, group: 'chat', label: 'new chat', prompt: 'Start a new chat' },

    // ---- move focus around the app
    { key: 'LC(LS(F6))', pos: 31, group: 'nav', label: 'prev pane', prompt: 'Previous section' },
    { key: 'LC(F6)', pos: 32, group: 'nav', label: 'next pane', prompt: 'Next section' },
    { key: 'LC(L)', pos: 33, group: 'nav', label: 'chat list', prompt: 'Focus the chat list — arrows highlight, Enter opens' },
    { key: 'LC(LA(U))', pos: 19, group: 'nav', label: 'unread', prompt: 'Filter the chat list to unread only' },
    { key: 'LC(M)', pos: 43, group: 'nav', label: 'messages', prompt: 'Focus the message pane — scroll/read the open conversation' },

    // ---- write
    { key: 'LC(R)', pos: 17, group: 'compose', label: 'compose', prompt: 'Go to the compose box — cursor lands ready to type' },
    { key: 'LA(LS(R))', pos: 16, group: 'compose', label: 'reply', prompt: 'Reply to the last message' },
    { key: 'LC(LA(R))', pos: 40, group: 'compose', label: 'react', prompt: 'React to the last message (opens the emoji picker)' },
    { key: 'LC(LS(X))', pos: 38, group: 'compose', label: 'expand', prompt: 'Expand compose — multi-line, formatting toolbar' }
  ];
})(typeof self !== 'undefined' ? self : this);
