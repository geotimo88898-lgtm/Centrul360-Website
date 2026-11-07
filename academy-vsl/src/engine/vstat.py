#!/usr/bin/env python3
"""Which lines of a film are not exact yet: python3 vstat.py <film>"""
import json, hashlib, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from voice import VOICE, MODEL, STYLE
film = sys.argv[1]
base = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'films', film)
S = json.load(open(os.path.join(base, 'script.json')))
n = ok = 0
for si, sc in enumerate(S['scenes']):
    for bi, b in enumerate(sc.get('beats', [])):
        n += 1
        t = b.get('tts') or b['say']; h = hashlib.sha1((VOICE + MODEL + STYLE + t).encode()).hexdigest()[:16]
        p = os.path.join(base, 'voice', h + '.wav.json')
        if not os.path.exists(p): continue
        m = json.load(open(p))
        if m['ok']: ok += 1
        else: print(f'{si}.{bi} | {t} | heard: {m["heard"]} | cps {m.get("cps")} tries {m["tries"]}')
print(f'{film}: {ok}/{n} exact')
