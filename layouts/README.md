# layouts/

Drop your Go60 config here.

- **`.json`** — my.moergo.com/go60 → open your layout → **Export**
  (needs "Enable local config" under Experimental Settings)
- **`.keymap`** — the ZMK devicetree the firmware builds from

Keep **both**. They carry slightly different information and disagree in
exactly one place, so cross-reading them is a free correctness check:

| | `.json` | `.keymap` |
| --- | --- | --- |
| goes back *into* the editor | yes | no |
| `uuid` / `parent_uuid` lineage | yes | no |
| combo + macro descriptions | 19/19, 15/15 | comments only |
| `&magic` parameters | **stripped** | kept |
| hold-tap term/quick/idle/flavor | yes | yes |

If you only keep one, keep the **`.json`** — it's the only one with an import
path back to the editor, and the only one that remembers this layout is a fork
of Moosy's original.

Files accumulate one per scripted edit, oldest first, so a bisect is possible.
The current one is whichever is newest — today that's
`TailorKey v4.2m⁶ +apps-layers.json` (19 layers). See PLAN.md for what each edit did.

`tools/keymap.js` and `tools/bake.js` read the **newest** file here. The HTML
viewer can't read the filesystem (it runs from `file://`), so either bake, or
drag the file onto the window — it sticks in `localStorage` after that.

Keep a pristine copy of the working `.uf2` and `.json` *outside* this repo
before the first scripted edit.
