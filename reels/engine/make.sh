#!/usr/bin/env bash
# One reel, start to end: ./make.sh <id> [poster second]
#   voice (checked line by line) → layout check → frames → sound → H.264 + cover + flash check
# Needs VERTEX_API_KEY for the voice (cached after). First time on a machine: npm i, python3 sfx.py, python3 music.py 3.
set -euo pipefail
cd "$(dirname "$0")"
id=$1
python3 voice.py "$id"
node check.cjs "$id" || echo "(check found something: look above)"
node render.cjs "$id" "${WORKERS:-3}"
python3 mix.py "$id"
./encode.sh "$id" "${2:-1.2}"
