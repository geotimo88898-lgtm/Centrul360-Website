#!/usr/bin/env bash
# The final file: node render.cjs + python3 mix.py first. ./encode.sh <id> [poster second]
# → reels/out/<id>.mp4 (1080×1920, 30 fps, H.264 High + AAC 192k, faststart: what the 4 networks take best)
#   and reels/out/<id>.jpg (the cover). Then the flash check of the Academy (photosensitive safety).
set -euo pipefail
id=$1
here=$(cd "$(dirname "$0")" && pwd)
b="$here/../scripts/$id/build"
out="$here/../out"
mkdir -p "$out"
ffmpeg -v error -y -i "$b/video.mp4" -i "$b/audio.wav" -c:v libx264 -preset slow -tune animation -crf 18 -profile:v high -level 4.2 -pix_fmt yuv420p -r 30 -g 60 \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart -shortest "$out/$id.mp4"
ffmpeg -v error -y -ss "${2:-1.2}" -i "$b/video.mp4" -frames:v 1 -q:v 2 "$out/$id.jpg"
python3 "$here/../../academy-vsl/src/engine/flash.py" "$out/$id.mp4" || echo "(flash check: look above)"
ls -la "$out/$id.mp4" "$out/$id.jpg" | awk '{print $5, $9}'
