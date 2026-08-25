# layouts/ — one file, the layout

`go60.keymap` is the canonical layout: ZMK devicetree, the same format the
firmware compiles and every page and tool in this repo parses natively. Edit
it (directly, or via a reviewed edit script), then:

```sh
node tools/bake.js         # viewer + cheat sheet pick it up
node tools/cheatsheet.js   # regenerate docs/cheatsheet.svg for the README
git commit && git push     # CI builds go60.uf2 -> firmware-latest release
tools/flash.sh             # both halves, same file
```

## Where did everything go?

Until 2026-08-24 this directory held every iteration of the layout as MoErgo
JSON exports — the my.moergo.com era, when the website was the only way to
build firmware and `tools/edits/*.js` scripts patched the JSON between
imports. That era ended when the firmware pipeline moved into this repo and
the keymap became the source of truth.

The history is all in git, not lost:

- the 13 JSON iterations and the JSON-era edit scripts (`tools/edits/`),
  each documenting one decision, live up to commit `8948ef8`
- `tailorkey_v1.uf2`, the original known-good firmware, is at
  `git show 4b2e9c7:layouts/tailorkey_v1.uf2` — though any
  `firmware-latest` release asset is a better recovery image by now

A `.json` should never appear here again; if one does, `tools/firmware-sync.js`
treats it as a red flag (see its header).
