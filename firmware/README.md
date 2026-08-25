# Firmware — build the keyboard from this repo

Vendored from [moergo-keyboards/go60-zmk-config](https://github.com/moergo-keyboards/go60-zmk-config)
(MIT), building against MoErgo's open-source ZMK fork
[moergo-sc/zmk](https://github.com/moergo-sc/zmk). The keymap the build
compiles is `config/go60.keymap`, which is **generated, gitignored, and never
edited**: CI regenerates it from the canonical `layouts/go60.keymap` on every
build via `node tools/firmware-sync.js`, which also validates it (Go60, 60
bindings per layer, behaviours resolve) and fails the build rather than
compile something wrong.

## The loop

```sh
$EDITOR layouts/go60.keymap    # the layout is the source of truth
git commit && git push         # GitHub Actions syncs, validates, builds
tools/flash.sh                 # downloads the release, flashes both halves
```

The Actions workflow (`.github/workflows/firmware.yml`) publishes every main
build to the rolling `firmware-latest` release, so the download URL never
changes. It also keeps the uf2 as a build artifact for older runs.

## Local build (optional, no website, no GitHub)

Docker (MoErgo's shrink-wrapped toolchain — slow first run, cached after):

```sh
node tools/firmware-sync.js    # place the keymap first — CI does this for you, local builds don't
cd firmware && ./build.sh      # -> firmware/go60.uf2
```

Bare nix, if you have it:

```sh
git clone https://github.com/moergo-sc/zmk firmware/src
nix-build firmware/config -o combined && cp combined/go60.uf2 .
```

## Flashing

The build is one combined image — flash **both halves with the same file**.
Magic + the bootloader key puts a half into bootloader mode (it mounts as a
USB drive); `tools/flash.sh` waits for the drive, copies, and waits for the
second half. The copy step sometimes reports an I/O error as the drive ejects
itself mid-copy — that's normal for UF2 bootloaders and the flash still took.
