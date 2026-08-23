#!/usr/bin/env bash
#
# Flash the Go60: download the latest built firmware (or take a local file)
# and copy it to each half's UF2 bootloader drive as it appears.
#
#   tools/flash.sh                    # latest firmware-latest release
#   tools/flash.sh path/to/go60.uf2   # a local build
#   tools/flash.sh --once             # single half only
#
# The build is one combined image: BOTH halves get the same file. Enter
# bootloader mode per half with Magic + its bootloader key; the half mounts
# as a USB drive containing INFO_UF2.TXT, which is how it's detected here —
# no reliance on the volume's name.
set -euo pipefail

URL="https://github.com/bs7280/moergo_g60_layout/releases/download/firmware-latest/go60.uf2"
HALVES=2
SRC=""

for arg in "$@"; do
  case "$arg" in
    --once) HALVES=1 ;;
    *) SRC="$arg" ;;
  esac
done

if [ -z "$SRC" ]; then
  SRC="$(mktemp -d)/go60.uf2"
  echo "downloading $URL"
  curl -fSL --progress-bar -o "$SRC" "$URL" || {
    echo "download failed — is the repo private, or no release yet?" >&2
    echo "grab go60.uf2 yourself and run: tools/flash.sh path/to/go60.uf2" >&2
    exit 1
  }
fi

# UF2 files start with the magic "UF2\n" — catch an HTML error page early.
[ "$(head -c 4 "$SRC")" = "$(printf 'UF2\n')" ] || {
  echo "$SRC is not a UF2 file — refusing to flash it." >&2
  exit 1
}
echo "firmware: $SRC ($(du -h "$SRC" | cut -f1 | tr -d ' '))"

find_uf2_volume() {
  local v
  for v in /Volumes/*/; do
    [ -f "$v/INFO_UF2.TXT" ] && { echo "$v"; return 0; }
  done
  return 1
}

for ((half = 1; half <= HALVES; half++)); do
  echo
  echo "[$half/$HALVES] Put a half into bootloader mode (Magic + bootloader key)…"
  until vol="$(find_uf2_volume)"; do sleep 1; done
  echo "  found $vol — copying"
  # The drive yanks itself mid-copy once the flash lands; macOS reports that
  # as an I/O error. Judge success by the volume disappearing, not by cp.
  cp "$SRC" "$vol" 2>/dev/null || true
  until [ ! -d "$vol" ]; do sleep 1; done
  echo "  flashed — drive ejected itself"
done

echo
echo "Done. All $HALVES half(s) flashed with the same image."
