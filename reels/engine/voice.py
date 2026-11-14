#!/usr/bin/env python3
"""Vocea unui reel: motorul de voce al filmelor Academiei (academy-vsl/src/engine/voice.py: Gemini TTS pe Vertex, fiecare
replică ascultată înapoi și refăcută dacă nu spune exact textul).
  python3 voice.py <id>   → scripts/<id>/voice/*.wav + scripts/<id>/timing.json   (cheia din VERTEX_API_KEY)
v1 (scripturile fără "v": 2): vocea Aoede, stil alert, grăbită x1.14 (ca înainte, din cache).
v2 ("v": 2): vocea, modelul și stilul din voice.json (alegerea proprietarului, 12.11: Callirrhoe pe
gemini-2.5-pro-preview-tts, femeie caldă, naturală, fără ton de reclamă); cârligul cu un stil ceva mai viu
(style_hook), răspunsul cu o pauză firească (style_payoff). Cheile din timing.json: L0, L1, ... (ordinea replicilor:
hook, beats, payoff, end), textul = tts sau say, fără asteriscuri."""
import importlib.util, json, os, re, subprocess, sys, wave
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('academy_voice', os.path.join(HERE, '..', '..', 'academy-vsl', 'src', 'engine', 'voice.py'))
V = importlib.util.module_from_spec(spec)
spec.loader.exec_module(V)
V.FILMS = os.path.join(HERE, '..', 'scripts')
V1_STYLE = ('Cheerful, bright young Romanian woman in her 20s, like a popular short-video creator telling a friend something '
            'surprising: lively and quick pace, smiling, natural and warm, playful, never salesy, never deep or slow.')
TEMPO = float(os.environ.get('TEMPO', '1.14'))
# how the voice is told to say a word (the "tts" text) → how the listener writes it (the screen spelling). A take that
# says the word right is accepted, instead of being made again on every run (14.11: „es-em-a-es” was heard as SMAS)
PHONETIC = {'es-em-a-es': 'SMAS'}
_wer = V.wer
def _screen(t):
    for a, b in PHONETIC.items(): t = t.replace(a, b)
    return t
# Romanian pronunciation (14.11): the screen spelling → how the voice is told to say it (voice.json "pronounce"); the
# checks compare both sides in the screen spelling, whichever way the listener writes the word
_CFG = json.load(open(os.path.join(HERE, 'voice.json')))
PRON = _CFG.get('pronounce', {})
def _sub(m, t, flags=0):
    for a, b in m.items(): t = re.sub(r'(?<![\w-])' + re.escape(a) + r'(?![\w-])', b, t, flags=flags)
    return t
def pronounce(t, m=None): return _sub(m or PRON, t)
def canon(t):
    t = _screen(t)
    back = {}
    for scr, vo in list(PRON.items()) + [(k, v) for k, vs in _CFG.get('pronounce_variants', {}).items() for v in vs]:
        back[vo] = scr
    for vo, scr in sorted(back.items(), key=lambda x: -len(x[0])):
        pat = r'(?<![\w-])' + r'[\s-]?'.join(re.escape(p) for p in re.split(r'[\s-]+', vo)) + r'(?![\w-])'
        t = re.sub(pat, scr, t, flags=re.I)
    return t
V.wer = lambda a, b: _wer(canon(a), canon(b))


def active_wpm(path, text):
    """words per minute while she speaks (the take's pauses left out: silencedetect at -35 dB, 0.12 s)"""
    import re
    out = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', 'silencedetect=n=-35dB:d=0.12', '-f', 'null', '-'], capture_output=True, text=True).stderr
    sil = sum(float(x) for x in re.findall(r'silence_duration: ([\d.]+)', out))
    n = len(re.findall(r"[\w-]+", text))
    return n / max(0.3, V.dur(path) - sil) * 60


def faster(rid, tempo, pace=None, lo=1.0, hi=1.25, over=None):
    """every take sped up after the cache (atempo keeps the pitch); with `pace` (words per minute while she speaks), each
    take gets its own factor so all lines reach the same pace (a slow take more, a quick one less), within lo..hi"""
    base = os.path.join(V.FILMS, rid)
    p = os.path.join(base, 'timing.json')
    T = json.load(open(p))
    for k, v in T.items():
        src = os.path.join(base, v['file'])
        if '.t' in os.path.basename(src): continue
        f = tempo if not pace else min(hi, max(lo, pace / active_wpm(src, v['text'])))
        if over and k in over: f = min(f, float(over[k]))  # a line's own cap (a domain, a name: every sound must stay)
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
    over = {}
    parts = [('hook', S.get('hook')), ('beat', S.get('beats')), ('payoff', S.get('payoff')), ('resolve', S.get('resolve')), ('outro', S.get('outro'))]
    bs = [b for _, part in parts for b in as_list(part)] + ([S['end']] if S.get('end') and S['end'].get('say') else [])
    for i, b in enumerate(bs):
        if b.get('tempo'): over['L%d' % i] = b['tempo']
    if pace: faster(rid, tempo, float(pace), float(cfg.get('tempo_min', 1.1)), float(cfg.get('tempo_max', 1.25)), over)
    elif tempo != 1.0: faster(rid, tempo)


# ---------------------------------------------------------------------------------------------------------------
# The continuous take (14.11, the default for all v2 reels: „the intonation and everything should make sense together
# with the sentences”): the whole script read once, as one connected explanation, in one style; then cut into its lines
# at the sentence pauses (aligned to the text and checked line by line by the listener); one uniform tempo, only when
# the take is slower than ~190 words a minute, at most x1.08; the natural pauses kept, only the long ones (> 0.45 s)
# brought down to ~0.3 s. When the cut does not match the text it stops, loudly: no silent fall-back to separate takes.
CONT_SR = 48000


def _read(path):
    import numpy as np
    with wave.open(path) as w:
        y = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float32) / 32768
        return y, w.getframerate()


def _write(path, y, sr):
    import numpy as np
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())


def _pauses(y, sr, th=-40.0, min_len=0.1):
    """the quiet runs (start, end) in seconds, 10 ms frames"""
    import numpy as np
    hop = sr // 100; m = len(y) // hop
    db = 20 * np.log10(np.sqrt((y[: m * hop].reshape(m, hop) ** 2).mean(1) + 1e-12))
    q = db < th; out, k = [], 0
    while k < m:
        if q[k]:
            a = k
            while k < m and q[k]: k += 1
            if (k - a) / 100 >= min_len and a > 0 and k < m: out.append((a / 100, k / 100))
        else: k += 1
    return out


def _shorten(y, sr, longer=0.45, to=0.3):
    """only the long pauses lose their middle, down to `to` seconds"""
    import numpy as np
    keep, last = [], 0
    for a, b in _pauses(y, sr, -42.0, longer):
        cut0, cut1 = int((a + to / 2) * sr), int((b - to / 2) * sr)
        keep.append(y[last:cut0]); last = cut1
    keep.append(y[last:])
    return np.concatenate(keep)


def _align(y, sr, texts):
    """n-1 cut points among the pauses, close to where the text says the line ends (by its share of the letters),
    preferring the longer pauses; dynamic programming, in order"""
    P = _pauses(y, sr, -40.0, 0.1)
    n = len(texts)
    if len(P) < n - 1: return None
    t0 = 0.0; t1 = len(y) / sr
    tot = sum(len(t) for t in texts); acc, exp = 0, []
    for t in texts[:-1]: acc += len(t); exp.append(t0 + (t1 - t0) * acc / tot)
    INF = 1e9; m = len(P)
    cost = [[INF] * m for _ in range(n - 1)]; back = [[-1] * m for _ in range(n - 1)]
    c = lambda k, j: abs((P[j][0] + P[j][1]) / 2 - exp[k]) - 1.6 * min(P[j][1] - P[j][0], 0.6)
    for j in range(m): cost[0][j] = c(0, j)
    for k in range(1, n - 1):
        best, bi = INF, -1
        for j in range(m):
            if j > 0 and cost[k - 1][j - 1] < best: best, bi = cost[k - 1][j - 1], j - 1
            if bi >= 0: cost[k][j] = best + c(k, j); back[k][j] = bi
    j = min(range(m), key=lambda j: cost[n - 2][j]); pick = [j]
    for k in range(n - 2, 0, -1): j = back[k][j]; pick.append(j)
    return [P[j] for j in reversed(pick)]


def continuous(rid, S, cfg):
    import numpy as np, hashlib, tempfile
    base = os.path.join(V.FILMS, rid); cache = os.path.join(base, 'voice'); os.makedirs(cache, exist_ok=True)
    L = v2_lines(S); texts = [t for _, _, t in L]
    for t in texts: assert '—' not in t and '–' not in t, 'long dash in: ' + t
    V.STYLE = cfg['style'] + ' ' + cfg.get('style_continuous', '')
    full = ' '.join(texts)  # the screen spelling (what the checks compare)
    VAR = cfg.get('pronounce_variants', {})
    def prompt_for(k):  # the k-th try: the pronunciation map, with the k-th spelling of the words that have variants
        m = dict(PRON); m.update({w: vs[min(k, len(vs) - 1)] for w, vs in VAR.items()})
        said = ' '.join(pronounce(t, m) for t in texts)
        return (V.STYLE + '\nCitește cu voce tare textul de mai jos, în română, exact cum e scris, fără să adaugi sau să schimbi '
                'nimic: o singură explicație legată, cu intonație firească de la o propoziție la alta și pauze scurte, '
                'firești, între propoziții. Ritm viu, cam ' + str(int(cfg.get('pace_wpm', 190))) + ' de cuvinte pe minut.'
                + (' ' + S['voiceNote'] if S.get('voiceNote') else '') + '\n\n' + said)
    prompt = prompt_for(0)
    h = hashlib.sha1((V.VOICE + V.MODEL + prompt).encode()).hexdigest()[:16]
    take = os.path.join(cache, 'cont-' + h + '.wav')
    if '--retake' in sys.argv and os.path.exists(take):
        for f in os.listdir(cache):
            if f.startswith('cont-' + h): os.remove(os.path.join(cache, f))
    terms = [w for w in cfg.get('pronounce_check', {}) if re.search(r'(?<![\w-])' + re.escape(w) + r'(?![\w-])', full)]
    if not os.path.exists(take):
        best = None
        for k in range(int(cfg.get('continuous_tries', 3))):
            tmp = take + '.try%d.wav' % k
            V.pcm_to_wav(V.tts_raw(prompt_for(k)), tmp)
            heard = V.hear(tmp, full); e, n = V.wer(full, heard)  # a second listener when the first is not sure
            pr = pron_check(tmp, terms, cfg) if terms else {}
            eng = [w for w, ok in pr.items() if w != '_answer' and not ok]
            print(f'  take {k + 1}: {V.dur(tmp):.1f} s, {n} words off' + (', pronounced the English way: ' + ', '.join(eng) if eng else (', pronunciation Romanian: ' + ', '.join(terms) if terms else '')))
            score = (n + 2 * len(eng), k)
            if best is None or score < best[0]: best = (score, tmp, heard, n, pr, k)
            if n == 0 and not eng: break
        os.replace(best[1], take)
        for f in os.listdir(cache):
            if f.startswith(os.path.basename(take) + '.try'): os.remove(os.path.join(cache, f))
        json.dump({'heard': best[2], 'errs': best[3], 'pronunciation': best[4], 'try': best[5], 'prompt': prompt_for(best[5])}, open(take + '.json', 'w'), ensure_ascii=False)
    meta = json.load(open(take + '.json'))
    if meta['errs'] > 0: sys.exit(f'{rid}: the continuous take does not say the text exactly ({meta["errs"]} words off; heard: {meta["heard"]}). Stopping: make it again with --retake.')
    y, sr = _read(take)
    # the pace: one tempo for the whole take, only when it is slow
    wpm = active_wpm(take, full); f = 1.0
    if wpm < 190: f = min(float(cfg.get('continuous_tempo_max', 1.08)), 190 / wpm)
    if S.get('tempo'): f = float(S['tempo'])  # the reel's own uniform tempo for the whole take (e.g. a take read too fast: x0.94)
    if abs(f - 1) > 0.005:
        with tempfile.TemporaryDirectory() as d:
            _write(os.path.join(d, 'a.wav'), y, sr)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(d, 'a.wav'), '-af', 'atempo=%.3f' % f, os.path.join(d, 'b.wav')], check=True)
            y, sr = _read(os.path.join(d, 'b.wav'))
    y = _shorten(y, sr)
    cuts = _align(y, sr, texts)
    if cuts is None: sys.exit(f'{rid}: the continuous take has fewer pauses than lines; it cannot be cut. Stopping (no fall-back to separate takes).')
    # each line: from just before its first word to just before the next line's first word (its trailing pause stays with it)
    edges = [0.0] + [max(a, b - 0.06) for a, b in cuts] + [len(y) / sr]
    speech_end = [a for a, b in cuts] + [len(y) / sr]
    timing, bad = {'_mode': 'continuous', '_tempo': round(f, 3), '_wpm_take': round(wpm)}, []
    for i, (key, role, text) in enumerate(L):
        a, b = edges[i], edges[i + 1]
        seg = y[int(a * sr): int(b * sr)]
        fade = int(0.01 * sr); seg = seg.copy(); seg[:fade] *= np.linspace(0, 1, fade); seg[-fade:] *= np.linspace(1, 0, fade)
        path = os.path.join(cache, 'cont-' + h + '-%s.wav' % key)
        _write(path, seg, sr)
        heard = V.transcribe(path); e, n = V.wer(text, heard)
        if n:  # a second listener, briefly (it times out often): only to settle a doubtful line
            try:
                h2 = _quick_transcribe(path, V.ASR2); e2, n2 = V.wer(text, h2)
                if n2 < n: heard, n = h2, n2
            except Exception as ex: print('  (second listener unavailable: ' + str(ex)[:60] + ')')
        hw, tw = V.norm(heard), V.norm(_screen(text))
        cut_ok = bool(hw) and (hw[0] == tw[0] or hw[-1] == tw[-1])  # the cut: the line starts or ends on its own words
        if n: bad.append((key, text, heard, n, cut_ok))
        timing[key] = {'text': text, 'dur': round(len(seg) / sr, 3), 'speech': round(speech_end[i] - a, 3), 'file': os.path.relpath(path, base), 'role': role}
    json.dump(timing, open(os.path.join(base, 'timing.json'), 'w'), ensure_ascii=False, indent=0)
    words = len(re.findall(r"[\w-]+", full)); tot = sum(v['dur'] for k, v in timing.items() if not k.startswith('_'))
    print(f'{rid}: one continuous take, {len(L)} lines, {tot:.1f} s, tempo x{f:.2f} (take at {wpm:.0f} wpm), {len(bad)} lines not heard exactly')
    # the whole take says the text exactly (checked above); a short clip heard alone can be misheard by the listener,
    # so a line only fails when its cut is wrong (neither its first nor its last word where they should be)
    for b in bad: print('  heard alone', b[0], '|', b[1], '| heard:', b[2], '' if b[4] else '| THE CUT IS WRONG')
    wrong = [b for b in bad if not b[4]]
    if wrong: sys.exit(f'{rid}: the cut does not match the text on {len(wrong)} lines. Stopping: listen, then fix the pauses or make the take again.')


def _quick_transcribe(path, model):
    import base64
    data = base64.b64encode(open(path, 'rb').read()).decode()
    body = {'contents': [{'role': 'user', 'parts': [{'inlineData': {'mimeType': 'audio/wav', 'data': data}},
            {'text': 'Transcribe this Romanian audio word for word, with Romanian diacritics. Write numbers as words. Output only the transcription.'}]}], 'generationConfig': {'temperature': 0}}
    r = V.call(model, body, tries=2)
    return ''.join(p.get('text', '') for p in r['candidates'][0]['content']['parts']).strip()


def pron_check(path, terms, cfg):
    """the listener: is each abbreviation / name said the Romanian way? {term: True when Romanian}"""
    import base64
    Q = cfg.get('pronounce_check', {})
    data = base64.b64encode(open(path, 'rb').read()).decode()
    ask = ('Ascultă înregistrarea în română și spune cum e pronunțat fiecare termen. ' + ' '.join(f'{w}: {Q[w]}?' for w in terms) +
           ' Răspunde pe câte un rând, exact așa: TERMEN: românește sau TERMEN: englezește (la SMAS: „cuvânt” sau „litere”).')
    body = {'contents': [{'role': 'user', 'parts': [{'inlineData': {'mimeType': 'audio/wav', 'data': data}}, {'text': ask}]}], 'generationConfig': {'temperature': 0}}
    r = V.call(V.ASR, body)
    ans = ''.join(p.get('text', '') for p in r['candidates'][0]['content']['parts']).strip()
    out = {}
    for w in terms:
        m = re.search(re.escape(w) + r'\s*:\s*([^\n;]+)', ans, re.I)
        v = (m.group(1) if m else '').lower()
        out[w] = bool(v) and ('englez' not in v) and ('liter' not in v or w != 'SMAS')
    out['_answer'] = ans
    return out


def judge(path):
    """the listener's short opinion on the whole narration (continuity, joins, intonation, sense)"""
    import base64
    data = base64.b64encode(open(path, 'rb').read()).decode()
    body = {'contents': [{'role': 'user', 'parts': [{'inlineData': {'mimeType': 'audio/wav', 'data': data}}, {'text':
        'Ascultă această narațiune în română. Sună ca o singură narațiune continuă și firească? Sunt îmbinări tăiate, '
        'intonație ciudată sau vreo propoziție care nu are sens în context? Răspunde scurt, în română, în 2-4 propoziții.'}]}],
        'generationConfig': {'temperature': 0}}
    r = V.call(V.ASR, body)
    return ''.join(p.get('text', '') for p in r['candidates'][0]['content']['parts']).strip()


if __name__ == '__main__':
    rid = sys.argv[1]
    S = json.load(open(os.path.join(V.FILMS, rid, 'script.json')))
    cfg0 = json.load(open(os.path.join(HERE, 'voice.json')))
    if S.get('v') == 2 and S.get('voiceMode', cfg0.get('mode', 'lines')) == 'continuous':
        if not V.KEY: sys.exit('VERTEX_API_KEY is missing')
        V.VOICE, V.MODEL = cfg0['voice'], cfg0['model']
        continuous(rid, S, cfg0)
    elif S.get('v') == 2:
        main_v2(rid, S)
    else:
        V.STYLE = V1_STYLE
        V.main()
        faster(rid, TEMPO)
