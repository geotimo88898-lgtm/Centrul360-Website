#!/usr/bin/env python3
"""The music bed: short instrumental clips from Lyria (Vertex), all in the same key and tempo, so they can be
chained with crossfades under a whole film.  python3 music.py <n clips>"""
import base64, json, os, sys, urllib.request, time
KEY = os.environ['VERTEX_API_KEY']
URL = 'https://aiplatform.googleapis.com/v1/publishers/google/models/lyria-002:predict?key=' + KEY
HERE = os.path.dirname(os.path.abspath(__file__))
PROMPT = ('Light, catchy, warm instrumental background music for a friendly explainer video. Soft marimba, plucked acoustic guitar, '
          'gentle finger snaps and claps, airy pads, light bass. Positive, calm, modern, clean, like an Apple product tutorial. '
          'C major, 100 BPM, steady groove, no build-ups, no drops, no vocals.')
NEG = 'vocals, singing, voice, choir, heavy drums, distortion, aggressive, sad, dramatic, sudden changes'
n = int(sys.argv[1]) if len(sys.argv) > 1 else 6
os.makedirs(os.path.join(HERE, 'music'), exist_ok=True)
for i in range(n):
    out = os.path.join(HERE, 'music', 'bed%02d.wav' % i)
    if os.path.exists(out): continue
    body = {'instances': [{'prompt': PROMPT, 'negative_prompt': NEG, 'seed': 1000 + i}], 'parameters': {}}
    for k in range(4):
        try:
            r = json.load(urllib.request.urlopen(urllib.request.Request(URL, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}), timeout=240))
            open(out, 'wb').write(base64.b64decode(r['predictions'][0]['bytesBase64Encoded'])); print('ok', out); break
        except Exception as e:
            print('retry', i, str(e)[:120]); time.sleep(5)
