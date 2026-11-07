#!/usr/bin/env bash
# One film, start to end: ./make.sh <film> [poster second]
#   voice (Pulcherrima, checked line by line) → layout check → frames → sound → H.264 + poster + flash check
# Needs VERTEX_API_KEY. First time on a machine: npm i (here), python3 sfx.py, python3 music.py 8.
set -euo pipefail
cd "$(dirname "$0")"
film=$1
python3 voice.py "$film"
node check.cjs "$film" || echo "(check found something: look above)"
node render.cjs "$film" "${WORKERS:-3}"
python3 mix.py "$film"
./encode.sh "$film" "${2:-6}"
