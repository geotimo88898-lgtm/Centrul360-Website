#!/usr/bin/env python3
"""Fondul muzical al reels-urilor: clipuri instrumentale scurte de la Lyria (Vertex), pop luminos, ~30 s fiecare.
Fiecare reel ia un clip (ales după id), mix.py îl leagă cu crossfade dacă reel-ul e mai lung.
  python3 music.py <n clipuri>   → music/pop00.wav ...  (cheia din VERTEX_API_KEY, niciodată afișată)"""
import base64, json, os, sys, urllib.request, time
KEY = os.environ['VERTEX_API_KEY']
URL = 'https://aiplatform.googleapis.com/v1/publishers/google/models/lyria-002:predict?key=' + KEY
HERE = os.path.dirname(os.path.abspath(__file__))
PROMPT = ('Light, upbeat, catchy modern pop instrumental for a fun short social video. Bouncy plucked synths, bright claps, '
          'finger snaps, punchy but soft kick, warm bass, playful and positive, TikTok style, clean mix. '
          '112 BPM, major key, steady groove from the first second, no long intro, no build-ups, no drops, no vocals.')
NEG = 'vocals, singing, voice, choir, heavy drums, distortion, aggressive, sad, dramatic, slow intro, sudden changes'
n = int(sys.argv[1]) if len(sys.argv) > 1 else 3
os.makedirs(os.path.join(HERE, 'music'), exist_ok=True)
for i in range(n):
    out = os.path.join(HERE, 'music', 'pop%02d.wav' % i)
    if os.path.exists(out): continue
    body = {'instances': [{'prompt': PROMPT, 'negative_prompt': NEG, 'seed': 360 + i}], 'parameters': {}}
    for k in range(4):
        try:
            r = json.load(urllib.request.urlopen(urllib.request.Request(URL, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}), timeout=240))
            open(out, 'wb').write(base64.b64decode(r['predictions'][0]['bytesBase64Encoded'])); print('ok', out); break
        except Exception as e:
            print('retry', i, str(e)[:120]); time.sleep(5)
