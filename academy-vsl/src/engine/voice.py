#!/usr/bin/env python3
"""The voice of a film: one wav per line, Pulcherrima (Gemini TTS on Vertex), in Romanian.

  python3 voice.py <film>            make the missing lines, check them, write timing.json
  python3 voice.py <film> --recheck  listen again to every line (transcribe) and remake the ones that fail

Every line is transcribed back (Gemini on Vertex) and compared with its text; a line that does not say exactly its
text is made again (up to 4 tries; the best one is kept and reported). The key comes from VERTEX_API_KEY and is
never printed or written anywhere.
"""
import base64, hashlib, json, os, re, subprocess, sys, unicodedata, urllib.request, urllib.error, time, wave
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
FILMS = os.path.join(HERE, '..', 'films')
VOICE = 'Aoede'  # the owner's pick (7.11), sample 3: brighter and cuter than Pulcherrima
MODEL = 'gemini-2.5-flash-preview-tts'
STYLE = 'Cute, cheerful young Romanian woman in her early 20s, bright and light voice, smiling, lively and quick pace, playful like a friendly cartoon guide, never deep or slow.'
ASR = 'gemini-3.5-flash'  # quick; a line it does not hear exactly gets a second listen from ASR2
ASR2 = 'gemini-3-flash-preview'
KEY = os.environ.get('VERTEX_API_KEY', '')
URL = 'https://aiplatform.googleapis.com/v1/publishers/google/models/{}:generateContent?key={}'
# the voice model answers much faster (and is not throttled) on its regional endpoint
REGIONAL = 'https://us-central1-aiplatform.googleapis.com/v1/projects/{}/locations/us-central1/publishers/google/models/{}:generateContent?key={}'
PROJECT = os.environ.get('VERTEX_PROJECT_NUMBER', '')  # the key's project number (regional endpoint); empty: the global one


def call(model, body, tries=14):
    for k in range(tries):
        url = REGIONAL.format(PROJECT, model, KEY) if model == MODEL and PROJECT else URL.format(model, KEY)
        req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        try:
            return json.load(urllib.request.urlopen(req, timeout=60))
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:200]
            if e.code in (429, 500, 503, 504) and k < tries - 1:
                print('  retry', model, e.code, flush=True); time.sleep(min(60, 8 * (k + 1))); continue
            raise RuntimeError('HTTP %d %s' % (e.code, msg))
        except Exception as e:  # network
            print('  retry', model, str(e)[:80], flush=True)
            if k < tries - 1:
                time.sleep(4 * (k + 1)); continue
            raise


def tts(text):
    body = {'contents': [{'role': 'user', 'parts': [{'text': STYLE + '\nRead this Romanian text aloud, exactly as written, nothing else:\n' + text}]}],
            'generationConfig': {'responseModalities': ['AUDIO'], 'temperature': 0.7,
                                 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': VOICE}}}}}
    r = call(MODEL, body)
    part = r['candidates'][0]['content']['parts'][0]['inlineData']
    return base64.b64decode(part['data'])  # 24 kHz 16-bit mono PCM


def transcribe(wav_path, model=None):
    data = base64.b64encode(open(wav_path, 'rb').read()).decode()
    body = {'contents': [{'role': 'user', 'parts': [
        {'inlineData': {'mimeType': 'audio/wav', 'data': data}},
        {'text': 'Transcribe this Romanian audio word for word, with Romanian diacritics. Write numbers as words. Output only the transcription.'}]}],
        'generationConfig': {'temperature': 0}}
    r = call(model or ASR, body)
    return ''.join(p.get('text', '') for p in r['candidates'][0]['content']['parts']).strip()


def hear(wav_path, text):
    """what the line says: a second listener when the first does not hear it exactly"""
    h1 = transcribe(wav_path)
    if wer(text, h1)[1] == 0:
        return h1
    try:
        h2 = transcribe(wav_path, ASR2)
    except Exception:
        return h1
    return h2 if wer(text, h2)[1] < wer(text, h1)[1] else h1


def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    s = re.sub(r"[^a-z0-9 ]+", ' ', s.replace('-', ' '))
    # spoken the same: "nu îi" = "nu-i", "ce îți" = "ce-ți", "cearceaf" = "cearșaf"
    SAME = {'ii': 'i', 'iti': 'ti', 'il': 'l', 'imi': 'mi', 'isi': 'si', 'iei': 'iei', 'cearsaf': 'cearceaf', 'cearsaful': 'cearceaful', 'cearsafuri': 'cearceafuri'}
    return [SAME.get(w, w) for w in s.split()]


def wer(a, b):
    a, b = norm(a), norm(b)
    d = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        p, d[0] = d[0], i
        for j in range(1, len(b) + 1):
            p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] != b[j - 1]))
    return d[len(b)] / max(1, len(a)), d[len(b)]


def pcm_to_wav(pcm, path):
    raw = path + '.raw.wav'
    with wave.open(raw, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(pcm)
    # trim the silence at both ends, keep a breath; 48 kHz for the mix
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af',
                    'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse,'
                    'highpass=f=70,aresample=48000', '-ac', '1', path], check=True)
    os.remove(raw)


def dur(path):
    with wave.open(path) as w:
        return w.getnframes() / w.getframerate()


def lines(film):
    S = json.load(open(os.path.join(FILMS, film, 'script.json')))
    out = []
    for si, sc in enumerate(S['scenes']):
        for bi, b in enumerate(sc.get('beats', [])):
            text = b.get('tts') or b['say']
            assert '—' not in text and '–' not in text, 'long dash in: ' + text
            out.append((f'{si}.{bi}', text))
    return out


def take_path(cache, text):
    h = hashlib.sha1((VOICE + MODEL + STYLE + text).encode()).hexdigest()[:16]
    return os.path.join(cache, h + '.wav')


def split_batch(pcm, n):
    """cut one take of n lines at its n-1 longest pauses → n PCM pieces (or None)"""
    import numpy as np
    y = np.frombuffer(pcm, '<i2').astype(np.float32) / 32768
    hop = 240  # 10 ms at 24 kHz
    m = len(y) // hop
    rms = np.sqrt((y[: m * hop].reshape(m, hop) ** 2).mean(1) + 1e-12)
    db = 20 * np.log10(rms)
    quiet = db < -42
    runs, k = [], 0
    while k < m:
        if quiet[k]:
            a = k
            while k < m and quiet[k]: k += 1
            if a > 5 and k < m - 5: runs.append((k - a, a, k))
        else:
            k += 1
    if len(runs) < n - 1: return None
    cuts = sorted(sorted(runs, reverse=True)[: n - 1], key=lambda r: r[1])
    if n > 1 and cuts[-1][0] < 22: return None  # the shortest chosen pause must be a real pause (>= 0.22 s)
    pts = [0] + [((a + b) // 2) * hop for _, a, b in cuts] + [len(y)]
    return [pcm[pts[i] * 2: pts[i + 1] * 2] for i in range(n)]


def batch(texts):
    body = '\n\n'.join(texts)
    pcm = tts_raw(STYLE + '\nRead these Romanian lines aloud, exactly as written, in this order, nothing else. '
                  'Make a long, clear pause of about two seconds between the lines.\n\n' + body)
    return split_batch(pcm, len(texts))


def tts_raw(prompt):
    body = {'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
            'generationConfig': {'responseModalities': ['AUDIO'], 'temperature': 0.7,
                                 'speechConfig': {'voiceConfig': {'prebuiltVoiceConfig': {'voiceName': VOICE}}}}}
    r = call(MODEL, body)
    return base64.b64decode(r['candidates'][0]['content']['parts'][0]['inlineData']['data'])


def check(path, text):
    heard = hear(path, text)
    e, n = wer(text, heard)
    d = dur(path)
    cps = len(text) / max(0.1, d)
    bad = cps < 7 or cps > 24
    return {'heard': heard, 'wer': e, 'errs': n + (5 if bad else 0), 'ok': n == 0 and not bad, 'cps': round(cps, 1)}


def make_scene(texts, cache, recheck=False, log=print):
    """the lines of one scene: the missing ones in one take, cut at the pauses; a line that does not say its text
    exactly is made again (in a smaller take, then alone), up to 4 rounds"""
    todo = []
    for t in texts:
        p = take_path(cache, t)
        m = json.load(open(p + '.json')) if os.path.exists(p + '.json') else None
        if m and os.path.exists(p) and not m.get('ok') and m.get('heard') and wer(t, m['heard'])[1] == 0 and 7 <= (m.get('cps') or 12) <= 24:
            m['ok'] = True; m['errs'] = 0; json.dump(m, open(p + '.json', 'w'), ensure_ascii=False)  # heard right, by the rules of today
        if m and os.path.exists(p) and (m.get('ok') and not recheck):
            continue
        if m and os.path.exists(p) and recheck:
            c = check(p, t); c['tries'] = m.get('tries', 1)
            json.dump(c, open(p + '.json', 'w'), ensure_ascii=False)
            if c['ok']: continue
        todo.append(t)
    rnd = 0
    while todo and rnd < 4:
        rnd += 1
        groups = [todo[i:i + 6] for i in range(0, len(todo), 6)] if rnd <= 2 else [[t] for t in todo]
        nxt = []
        for g in groups:
            pieces = batch(g) if len(g) > 1 else [tts_raw(STYLE + '\nRead this Romanian text aloud, exactly as written, nothing else:\n' + g[0])]
            if pieces is None:  # could not cut it: each line alone
                pieces = [tts_raw(STYLE + '\nRead this Romanian text aloud, exactly as written, nothing else:\n' + t) for t in g]
            tmps = []
            for t, pc in zip(g, pieces):
                tmp = take_path(cache, t) + '.new.wav'
                pcm_to_wav(pc, tmp)
                tmps.append(tmp)
            # one listen for the whole take; only when it is not exact, each line on its own (in parallel)
            whole = None
            if len(g) > 1:
                cat = take_path(cache, g[0]) + '.cat.wav'
                subprocess.run(['ffmpeg', '-v', 'error', '-y'] + sum([['-i', x] for x in tmps], []) + ['-filter_complex',
                               ''.join('[%d]apad=pad_dur=0.6[a%d];' % (i, i) for i in range(len(tmps))) + ''.join('[a%d]' % i for i in range(len(tmps))) + 'concat=n=%d:v=0:a=1' % len(tmps), cat], check=True)
                heard = hear(cat, ' '.join(g)); os.remove(cat)
                if wer(' '.join(g), heard)[1] == 0:
                    whole = heard
            if whole is not None:
                checks = []
                for t, tmp in zip(g, tmps):
                    cps = len(t) / max(0.1, dur(tmp))
                    checks.append({'heard': '(in take) ' + t, 'wer': 0.0, 'errs': 0 if 7 <= cps <= 24 else 5, 'ok': 7 <= cps <= 24, 'cps': round(cps, 1)})
            else:
                with ThreadPoolExecutor(len(g)) as ex2:
                    checks = list(ex2.map(lambda a: check(a[0], a[1]), zip(tmps, g)))
            for t, tmp, c in zip(g, tmps, checks):
                p = take_path(cache, t)
                old = json.load(open(p + '.json')) if os.path.exists(p + '.json') else None
                c['tries'] = (old or {}).get('tries', 0) + 1
                if old is None or not os.path.exists(p) or c['errs'] <= old.get('errs', 99):
                    os.replace(tmp, p); json.dump(c, open(p + '.json', 'w'), ensure_ascii=False)
                else:
                    os.remove(tmp)
                    old['tries'] = c['tries']; json.dump(old, open(p + '.json', 'w'), ensure_ascii=False)
                if not json.load(open(p + '.json'))['ok']:
                    nxt.append(t)
        todo = nxt
    log('  scene done, %d not exact' % len(todo))


def main():
    film = sys.argv[1]
    recheck = '--recheck' in sys.argv
    if not KEY:
        sys.exit('VERTEX_API_KEY is missing')
    cache = os.path.join(FILMS, film, 'voice')
    os.makedirs(cache, exist_ok=True)
    S = json.load(open(os.path.join(FILMS, film, 'script.json')))
    scenes = [[(f'{si}.{bi}', b.get('tts') or b['say']) for bi, b in enumerate(sc.get('beats', []))] for si, sc in enumerate(S['scenes'])]
    for sc in scenes:
        for _, t in sc:
            assert '\u2014' not in t and '\u2013' not in t, 'long dash in: ' + t
    with ThreadPoolExecutor(int(os.environ.get('VOICE_THREADS', '3'))) as ex:
        list(ex.map(lambda sc: make_scene([t for _, t in sc], cache, recheck), [sc for sc in scenes if sc]))
    timing, bad = {}, []
    L = [x for sc in scenes for x in sc]
    for key, text in L:
        path = take_path(cache, text)
        m = json.load(open(path + '.json'))
        timing[key] = {'text': text, 'dur': round(dur(path), 3), 'file': os.path.relpath(path, os.path.join(FILMS, film))}
        if not m.get('ok'):
            bad.append((key, text, m.get('heard'), m.get('cps')))
    json.dump(timing, open(os.path.join(FILMS, film, 'timing.json'), 'w'), ensure_ascii=False, indent=0)
    tot = sum(v['dur'] for v in timing.values())
    print(f'{film}: {len(L)} lines, {tot:.0f} s of voice, {len(bad)} not exact')
    for b in bad:
        print('  NOT EXACT', b[0], '|', b[1], '| heard:', b[2], '| cps', b[3])


if __name__ == '__main__':
    main()
