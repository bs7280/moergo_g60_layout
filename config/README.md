# config/

The OS half of the join, versioned. The layout says "position 31 emits F17";
these say "F17 means snap left". Neither is much use without the other, so they
live in the same repo.

## `RectangleConfig-wm.json`

Generated — don't hand-edit. Regenerate with:

```sh
node tools/rectangle-config.js            # reads ~/Downloads/RectangleConfig.json
node tools/rectangle-config.js IN.json    # or point it somewhere else
```

It reads the action list from `data/wm-actions.js`, so it can't drift from the
drill or the cheat sheet, and copies through every Rectangle setting it doesn't
own. Export your current config first (**Rectangle → Settings → gear → Export
Config**) so your own preferences survive; import the result the same way.

Nine of the twelve actions are Rectangle's. Two need `allowAnyShortcut`, which
the generator turns on if it's off — bare F-keys are otherwise silently
rejected on import.

## Not in here, because they aren't Rectangle's

Three actions belong to macOS itself and have no config file to check in. They
are set by hand once, and `node tools/macos-shortcuts.js` verifies them:

| | where | encoding it lands as |
| --- | --- | --- |
| `F14` / `F15` desktop | Keyboard Shortcuts → Mission Control | keyCode 107 / 113, modifiers **8388608** |
| `LS(F15)` minimize | Keyboard Shortcuts → App Shortcuts, All Applications, menu title `Minimize` | `$\Uf712` |

The 8388608 is `NSEventModifierFlagFunction` — macOS tags F-keys with it even
when you press no modifier, so a stored value of 0 there means the shortcut
didn't take.

## Windows

Nothing to check in. `WM_Win` (layer 15) emits native `Win`+chords straight
from the keyboard, so ten of the twelve need no configuration at all — that
being the entire reason it exists rather than living in PowerToys' Keyboard
Manager. The two gaps (center, restore) are unbound.
