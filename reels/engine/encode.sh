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
ffmpeg -v error -y -i "$b/video.mp4" -i "$b/audio.wav" -c:v libx264 -preset slow -tune animation -crf 19 -maxrate 8M -bufsize 16M -profile:v high -level 4.2 -pix_fmt yuv420p -r 30 -g 60 \
  -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart -shortest "$out/$id.mp4"
ffmpeg -v error -y -ss "${2:-1.2}" -i "$b/video.mp4" -frames:v 1 -q:v 2 "$out/$id.jpg"
# the clean file for posting (the owner, 14.11): the same picture, voice + effects only; he adds the licensed sound in the app
if [ -f "$b/audio-clean.wav" ]; then
  ffmpeg -v error -y -i "$out/$id.mp4" -i "$b/audio-clean.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart -shortest "$out/$id-clean.mp4"
  ffmpeg -hide_banner -nostats -i "$out/$id-clean.mp4" -af ebur128=peak=true:framelog=quiet -f null - 2>&1 | awk '/I:/{i=$2} /Peak:/{p=$2} END{print "clean file: " i " LUFS, true peak " p " dBTP"}'
fi
python3 "$here/../../academy-vsl/src/engine/flash.py" "$out/$id.mp4" || echo "(flash check: look above)"
ffmpeg -hide_banner -nostats -i "$out/$id.mp4" -af ebur128=peak=true:framelog=quiet -f null - 2>&1 | awk '/I:/{i=$2} /Peak:/{p=$2} END{print "final file: " i " LUFS, true peak " p " dBTP (want -14 and <= -1)"}'
ls -la "$out/$id.mp4" "$out/$id.jpg" | awk '{print $5, $9}'
