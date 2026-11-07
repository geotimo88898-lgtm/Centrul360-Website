# Filmele de training (Traininguri)

Filmele din portal → Traininguri: parcursul clientei, cele 4 fișe și câte unul pentru fiecare tratament.
Prezintă Nuki, vocea e Pulcherrima (Gemini TTS pe Vertex), în română.

- `films/<id>/script.json`: scenele filmului. Fiecare scenă are replici (`beats`): `say` e ce se aude și ce apare ca subtitlu,
  `tts` (opțional) e cum se citește (numere în litere), `cap` (opțional) e subtitlul, `pose` e ipostaza lui Nuki.
- `films/<id>/timing.json`: cât durează fiecare replică (scris de `voice.py`).
- `films/_gen/`: generatoarele scenariilor pentru fișe (`fise.py`, `program.py`) și tratamente (`tratamente.py`, din
  `api/_lib/academy-extra.js`: `node -e` → `schemes.json`).
- `engine/`: scena (`stage.html`, `engine.js`, `style.css`), vocea (`voice.py`, verificată replică cu replică),
  verificarea (`check.cjs`: nimic tăiat sau suprapus, Nuki 60-70% pe ecran, o schimbare la cel mult 20 s),
  randarea (`render.cjs`), sunetul (`sfx.py`, `music.py`, `mix.py`), codarea (`encode.sh`, `flash.py`).

Un film, de la cap la coadă: `cd engine && ./make.sh <id>` → `academy-vsl/<id>.mp4` + `academy-vsl/<id>.webp`.
Prima dată pe o mașină: `npm i`, `python3 sfx.py`, `python3 music.py 8` (cu `VERTEX_API_KEY`).
Fără prețuri și fără nume de cliente în filme: prețurile se schimbă în Admin.
