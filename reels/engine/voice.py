#!/usr/bin/env python3
"""Vocea unui reel: motorul de voce al filmelor Academiei (academy-vsl/src/engine/voice.py: Gemini TTS pe Vertex, fiecare
replică ascultată înapoi și refăcută dacă nu spune exact textul).
  python3 voice.py <id>   → scripts/<id>/voice/*.wav + scripts/<id>/timing.json   (cheia din VERTEX_API_KEY)
v1 (scripturile fără "v": 2): vocea Aoede, stil alert, grăbită x1.14 (ca înainte, din cache).
v2 ("v": 2): vocea, modelul și stilul din voice.json (alegerea proprietarului, 12.11: Callirrhoe pe
gemini-2.5-pro-preview-tts, femeie caldă, naturală, fără ton de reclamă); cârligul cu un stil ceva mai viu
(style_hook), răspunsul cu o pauză firească (style_payoff). Cheile din timing.json: L0, L1, ... (ordinea replicilor:
hook, beats, payoff, end), textul = tts sau say, fără asteriscuri."""
import importlib.util, json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('academy_voice', os.path.join(HERE, '..', '..', 'academy-vsl', 'src', 'engine', 'voice.py'))
V = importlib.util.module_from_spec(spec)
spec.loader.exec_module(V)
V.FILMS = os.path.join(HERE, '..', 'scripts')
V1_STYLE = ('Cheerful, bright young Romanian woman in her 20s, like a popular short-video creator telling a friend something '
            'surprising: lively and quick pace, smiling, natural and warm, playful, never salesy, never deep or slow.')
TEMPO = float(os.environ.get('TEMPO', '1.14'))


def active_wpm(path, text):
    """words per minute while she speaks (the take's pauses left out: silencedetect at -35 dB, 0.12 s)"""
    import re
    out = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'silencedetect=n=-35dB:d=0.12', '-f', 'null', '-'], capture_output=True, text=True).stderr
    sil = sum(float(x) for x in re.findall(r'silence_duration: ([\d.]+)', out))
    n = len(re.findall(r"[\w-]+", text))
    return n / max(0.3, V.dur(path) - sil) * 60


def faster(rid, tempo, pace=None, lo=1.0, hi=1.25):
    """every take sped up after the cache (atempo keeps the pitch); with `pace` (words per minute while she speaks), each
    take gets its own factor so all lines reach the same pace (a slow take more, a quick one less), within lo..hi"""
    base = os.path.join(V.FILMS, rid)
    p = os.path.join(base, 'timing.json')
    T = json.load(open(p))
    for k, v in T.items():
        src = os.path.join(base, v['file'])
        if '.t' in os.path.basename(src): continue
        f = tempo if not pace else min(hi, max(lo, pace / active_wpm(src, v['text'])))
        if abs(f - 1) < 0.005: continue
        dst = src[:-4] + '.t%d.wav' % round(f * 100)
        if not os.path.exists(dst):
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, '-af', 'atempo=%.3f' % f, dst], check=True)
        v['file'] = os.path.relpath(dst, base)
        v['dur'] = round(V.dur(dst), 3)
        v['tempo'] = round(f, 3)
    json.dump(T, open(p, 'w'), ensure_ascii=False, indent=0)
    print(f'{rid}: tempo ' + ('x%.2f' % tempo if not pace else 'to %d wpm (x%.2f-%.2f per line)' % (pace, lo, hi)) + f', {sum(v["dur"] for v in T.values()):.1f} s of voice')


def as_list(x): return [] if x is None else x if isinstance(x, list) else [x]


def v2_lines(S):
    """the spoken lines of a v2 script, in order, with their role (the engine numbers them the same way)"""
    out = []
    for role, part in (('hook', S.get('hook')), ('beat', S.get('beats')), ('payoff', S.get('payoff')), ('resolve', S.get('resolve')), ('outro', S.get('outro'))):
        for b in as_list(part): out.append((role, b))
    if S.get('end') and S['end'].get('say'): out.append(('end', S['end']))
    return [('L%d' % i, role, (b.get('tts') or b['say']).replace('*', '').strip()) for i, (role, b) in enumerate(out)]


def main_v2(rid, S):
    cfg = json.load(open(os.path.join(HERE, 'voice.json')))
    if not V.KEY: sys.exit('VERTEX_API_KEY is missing')
    V.VOICE, V.MODEL = cfg['voice'], cfg['model']
    base = os.path.join(V.FILMS, rid); cache = os.path.join(base, 'voice'); os.makedirs(cache, exist_ok=True)
    L = v2_lines(S)
    for _, _, t in L: assert '—' not in t and '–' not in t, 'long dash in: ' + t
    styles = {'hook': cfg.get('style_hook') or cfg['style'], 'payoff': cfg.get('style_payoff') or cfg['style'], 'outro': cfg.get('style_outro') or cfg['style']}
    style_of = lambda role: (cfg['style'] + ' ' + styles[role]) if role in styles else cfg['style']
    for role in ('hook', 'beat', 'payoff', 'resolve', 'outro', 'end'):  # one style at a time (the style is part of the take and of its cache key)
        texts = [t for _, r, t in L if r == role]
        if not texts: continue
        V.STYLE = style_of(role)
        try:
            V.make_scene(texts, cache)
        except RuntimeError as e:
            if cfg.get('fallback_model') and V.MODEL != cfg['fallback_model']:
                print('  ' + V.MODEL + ' failed (' + str(e)[:80] + '), trying ' + cfg['fallback_model']); V.MODEL = cfg['fallback_model']; V.make_scene(texts, cache)
            else: raise
    timing, bad = {}, []
    for key, role, text in L:
        V.STYLE = style_of(role)
        path = V.take_path(cache, text)
        m = json.load(open(path + '.json'))
        timing[key] = {'text': text, 'dur': round(V.dur(path), 3), 'file': os.path.relpath(path, base), 'role': role}
        if not m.get('ok'): bad.append((key, text, m.get('heard'), m.get('cps')))
    json.dump(timing, open(os.path.join(base, 'timing.json'), 'w'), ensure_ascii=False, indent=0)
    # a take much longer than its text can hold another line too (a scene split in the wrong place, 14.11: line 4 began
    # with line 3): listen to it (python3 listen.py) and trim or redo it before rendering
    for key, v in timing.items():
        exp = len(v['text']) / 15.5
        if v['dur'] > 1.45 * exp + 0.4: print(f'  SUSPICIOUS {key}: {v["dur"]:.1f} s for {len(v["text"])} characters (expected ~{exp:.1f} s): another line inside the take?')
    print(f'{rid}: {len(L)} lines, {sum(v["dur"] for v in timing.values()):.1f} s of voice ({V.VOICE}, {V.MODEL}), {len(bad)} not exact')
    for b in bad: print('  NOT EXACT', b[0], '|', b[1], '| heard:', b[2], '| cps', b[3])
    # the pace (14.11, „vocea e cam încetă”): every take is sped up after the cache (atempo keeps the pitch); the default
    # is voice.json "tempo", a script can set its own "tempo"; the cached takes stay as they are
    tempo = float(S.get('tempo', cfg.get('tempo', 1.0)))
    pace = S.get('pace_wpm', cfg.get('pace_wpm'))
    if pace: faster(rid, tempo, float(pace), float(cfg.get('tempo_min', 1.1)), float(cfg.get('tempo_max', 1.25)))
    elif tempo != 1.0: faster(rid, tempo)


if __name__ == '__main__':
    rid = sys.argv[1]
    S = json.load(open(os.path.join(V.FILMS, rid, 'script.json')))
    if S.get('v') == 2:
        main_v2(rid, S)
    else:
        V.STYLE = V1_STYLE
        V.main()
        faster(rid, TEMPO)
