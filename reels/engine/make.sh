#!/usr/bin/env bash
# One reel, start to end: ./make.sh <id> [cover second]
#   v1: voice (checked line by line) → layout check → frames → sound → H.264 + cover + flash check
#   v2 ("v": 2): + real site screenshots for a "site" end (site.cjs) and the AI panels (imagen.py, ≤ 8, cached)
# Needs VERTEX_API_KEY for the voice and the images (both cached after). First time on a machine:
#   npm i, python3 sfx.py, python3 music.py all (moods; paid, ~0,06 $ a clip, existing ones are kept).
set -euo pipefail
cd "$(dirname "$0")"
id=$1
if python3 -c "import json,sys; sys.exit(0 if json.load(open('../scripts/$id/script.json')).get('v') == 2 else 1)"; then
  python3 -c "import json,sys; e=json.load(open('../scripts/$id/script.json')).get('end') or {}; sys.exit(0 if e.get('type') == 'site' else 1)" && node site.cjs "$id"
  python3 imagen.py "$id"
fi
python3 voice.py "$id"
node check.cjs "$id" || echo "(check found something: look above)"
node render.cjs "$id" "${WORKERS:-4}"
python3 mix.py "$id"
./encode.sh "$id" "${2:-2.2}"
