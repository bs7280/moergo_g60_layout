# Firmware — build the keyboard from this repo

Vendored from [moergo-keyboards/go60-zmk-config](https://github.com/moergo-keyboards/go60-zmk-config)
(MIT), building against MoErgo's open-source ZMK fork
[moergo-sc/zmk](https://github.com/moergo-sc/zmk). The one file that matters is
`config/go60.keymap` — put there by `node tools/firmware-sync.js`, never by
hand, so it can't silently diverge from `layouts/`.

## The loop

```sh
node tools/firmware-sync.js    # layouts/<newest .keymap> -> config/go60.keymap
git commit && git push         # GitHub Actions builds go60.uf2
tools/flash.sh                 # downloads the release, flashes both halves
```

The Actions workflow (`.github/workflows/firmware.yml`) publishes every main
build to the rolling `firmware-latest` release, so the download URL never
changes. It also keeps the uf2 as a build artifact for older runs.

The sync script refuses to copy a keymap that's older than the newest layout
`.json` — that means the keymap export is stale and would silently build old
firmware. Export a fresh one from my.moergo.com/go60 (import the newest JSON
first) or pass `--force` if you know better.

## Local build (optional, no website, no GitHub)

Docker (MoErgo's shrink-wrapped toolchain — slow first run, cached after):

```sh
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
