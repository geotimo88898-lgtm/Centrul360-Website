#!/usr/bin/env python3
"""Vocea unui reel: același motor ca filmele Academiei (academy-vsl/src/engine/voice.py: Gemini TTS pe Vertex, fiecare
replică ascultată înapoi și refăcută dacă nu spune exact textul), doar cu folderul reels/scripts, un stil mai alert
și replicile grăbite ușor (TEMPO, implicit 1.14, fără schimbarea tonului), ca reel-ul să încapă în 20-35 s.
  python3 voice.py <id>   → scripts/<id>/voice/*.wav + scripts/<id>/timing.json   (cheia din VERTEX_API_KEY)"""
import importlib.util, json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('academy_voice', os.path.join(HERE, '..', '..', 'academy-vsl', 'src', 'engine', 'voice.py'))
V = importlib.util.module_from_spec(spec)
spec.loader.exec_module(V)
V.FILMS = os.path.join(HERE, '..', 'scripts')
# aceeași voce ca filmele (alegerea proprietarului), ritm de reel: viu, rapid, natural
V.STYLE = ('Cheerful, bright young Romanian woman in her 20s, like a popular short-video creator telling a friend something '
           'surprising: lively and quick pace, smiling, natural and warm, playful, never salesy, never deep or slow.')
TEMPO = float(os.environ.get('TEMPO', '1.14'))


def faster(rid):
    base = os.path.join(V.FILMS, rid)
    p = os.path.join(base, 'timing.json')
    T = json.load(open(p))
    for k, v in T.items():
        src = os.path.join(base, v['file'])
        if TEMPO == 1 or '.t' in os.path.basename(src): continue
        dst = src[:-4] + '.t%d.wav' % round(TEMPO * 100)
        if not os.path.exists(dst):
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', 'atempo=%.3f' % TEMPO, dst], check=True)
        v['file'] = os.path.relpath(dst, base)
        v['dur'] = round(V.dur(dst), 3)
    json.dump(T, open(p, 'w'), ensure_ascii=False, indent=0)
    print(f'{rid}: tempo x{TEMPO}, {sum(v["dur"] for v in T.values()):.1f} s of voice')


if __name__ == '__main__':
    V.main()
    faster(sys.argv[1])
