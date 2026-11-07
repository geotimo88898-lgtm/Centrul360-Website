#!/usr/bin/env bash
# The final file: node render.cjs + python3 mix.py first. ./encode.sh <film> [poster second]
# → academy-vsl/<film>.mp4 (H.264 + AAC, faststart, under 20 MB) and academy-vsl/<film>.webp (poster)
set -euo pipefail
film=$1
here=$(cd "$(dirname "$0")" && pwd)
b="$here/../films/$film/build"
out="$here/../../$film.mp4"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$b/video.mp4")
# the bitrate that keeps the file under 19 MB (sound 96 kb/s), at most 2.4 Mb/s
vb=$(python3 -c "d=float('$dur'); print(int(min(2400, (19.0e6*8/d - 100e3)/1000)))")
cd "$b"
ffmpeg -v error -y -i video.mp4 -c:v libx264 -preset slow -tune animation -b:v ${vb}k -maxrate $((vb*2))k -bufsize $((vb*4))k -pix_fmt yuv420p -pass 1 -passlogfile x264 -an -f mp4 /dev/null
ffmpeg -v error -y -i video.mp4 -i audio.wav -c:v libx264 -preset slow -tune animation -b:v ${vb}k -maxrate $((vb*2))k -bufsize $((vb*4))k -pix_fmt yuv420p -pass 2 -passlogfile x264 \
  -c:a aac -b:a 96k -ac 2 -movflags +faststart -shortest "$out"
rm -f x264*.log x264*.mbtree
ps=${2:-6}
ffmpeg -v error -y -ss "$ps" -i video.mp4 -frames:v 1 -vf scale=1280:720 -c:v libwebp -quality 82 "$here/../../$film.webp"
python3 "$here/flash.py" "$out"
ls -la "$out" "$here/../../$film.webp" | awk '{print $5, $9}'
echo "$film: ${dur%.*} s, video ${vb} kb/s"
