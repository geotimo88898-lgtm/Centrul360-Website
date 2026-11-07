#!/usr/bin/env python3
"""Ask Gemini (Vertex) to listen to an audio file and answer a question about it. python3 listen.py <file> "<question>" """
import base64, json, os, sys, subprocess, tempfile, urllib.request
KEY = os.environ['VERTEX_API_KEY']
f, q = sys.argv[1], sys.argv[2]
tmp = tempfile.mktemp(suffix='.mp3')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', f, '-ac', '1', '-b:a', '64k', tmp], check=True)
body = {'contents': [{'role': 'user', 'parts': [{'inlineData': {'mimeType': 'audio/mp3', 'data': base64.b64encode(open(tmp, 'rb').read()).decode()}}, {'text': q}]}]}
u = 'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3-flash-preview:generateContent?key=' + KEY
r = json.load(urllib.request.urlopen(urllib.request.Request(u, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}), timeout=300))
print(''.join(p.get('text', '') for p in r['candidates'][0]['content']['parts']))
os.remove(tmp)
