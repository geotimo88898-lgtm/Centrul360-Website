#!/usr/bin/env python3
"""When exactly is each word said? python3 wordtimes.py <id> [--show]
The engine spreads a line's words by their letters; a scene that brings a key word in „exactly when it is said” (kinetic
type, a counter that lands on a number) needs better. For every spoken line (timing.json: the continuous take cut into
lines) this measures the voice itself:
  1. the speech envelope (150-4000 Hz, 10 ms frames) gives where the line's speech starts and ends and its inner pauses;
  2. the pauses are matched to the text's punctuation (the longest ones, in order), so each phrase has real edges;
  3. inside a phrase the words share the time by their sounds (syllables weigh most), and each word's start then snaps
     to the nearest dip of the envelope (a syllable edge) within 80 ms.
→ script.json "words": { "L0": [["Crema", 0.06], ["ta", 0.31], …], … } (seconds from the line's start; the spoken text,
numbers as words). The scenes s-dive.js and s-colaj.js read it; without it they fall back to the engine's estimate."""
import json, os, re, subprocess, sys
import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__)); SCRIPTS = os.path.join(HERE, '..')
SR = 16000; HOP = 160
VOW = 'aeiouăâîAEIOUĂÂÎ'


def envelope(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    y = np.frombuffer(raw, '<i2').astype(np.float32) / 32768
    b, a = signal.butter(2, [150 / (SR / 2), 4000 / (SR / 2)], 'band'); y = signal.lfilter(b, a, y)
    m = len(y) // HOP; rms = np.sqrt((y[:m * HOP].reshape(m, HOP) ** 2).mean(1) + 1e-10)
    db = 20 * np.log10(rms); return db, signal.savgol_filter(db, 5, 2)


def syllables(w):
    w = re.sub(r"[^a-zăâîșțA-ZĂÂÎȘȚ-]", '', w)
    n = 0
    for part in w.split('-'):
        g = re.findall('[' + VOW + ']+', part); k = len(g)
        if k > 1 and re.search('[^' + VOW + '][iI]$', part): k -= 1            # a final -i after a consonant is not a syllable (pomi, ani)
        n += max(1, k) if part else 0
    return max(1, n)


def weight(w):
    core = re.sub(r"[^a-zăâîșțA-ZĂÂÎȘȚ]", '', w)
    return syllables(w) * 1.0 + 0.3 * len(re.findall('[^' + VOW + ']', core)) + 0.25


def line_words(path, text):
    db, sm = envelope(path); n = len(db); top = np.percentile(db, 95); th = top - 30
    sp = np.where(db > th)[0]; t0, t1 = sp[0], sp[-1] + 1
    # inner pauses: quiet runs of at least 70 ms
    q = db < th - 2; runs = []; k = t0
    while k < t1:
        if q[k]:
            a = k
            while k < t1 and q[k]: k += 1
            if k - a >= 7: runs.append((a, k))
        else: k += 1
    words = text.split(); marks = [i for i, w in enumerate(words[:-1]) if re.search(r'[,.;:]$', w)]   # a pause is expected after these words
    # match pauses to punctuation: expected position by weight share, prefer long pauses
    W = np.array([weight(w) for w in words]); cum = np.cumsum(W) / W.sum()
    use = {}
    cand = sorted(runs, key=lambda r: -(r[1] - r[0]))
    for a, b in cand:
        if not marks: break
        pos = ((a + b) / 2 - t0) / (t1 - t0)
        mi = min((m for m in marks if m not in use), key=lambda m: abs(cum[m] - pos), default=None)
        if mi is not None and abs(cum[mi] - pos) < 0.16: use[mi] = (a, b)
    # phrases between the matched pauses
    edges = [(-1, t0)] + [(m, None) for m in sorted(use)] + [(len(words) - 1, t1)]
    out = [None] * len(words); start = t0; prev = -1
    for m in sorted(use) + [len(words) - 1]:
        end = use[m][0] if m in use else t1
        idx = list(range(prev + 1, m + 1)); w = W[idx]; c = np.concatenate([[0], np.cumsum(w)]) / w.sum()
        for j, i in enumerate(idx): out[i] = start + c[j] * (end - start)
        if m in use: start = use[m][1]
        prev = m
    # snap every word start (not the first of a phrase) to the nearest dip of the envelope
    dips = signal.argrelmin(sm, order=3)[0]
    res = []
    for i, f in enumerate(out):
        first = i == 0 or (i - 1) in use
        if not first and len(dips):
            d = dips[np.argmin(np.abs(dips - f))]
            if abs(d - f) <= 8: f = d
        res.append([words[i], round(float(f) * HOP / SR, 3)])
    for i in range(1, len(res)):                                           # keep the order
        if res[i][1] <= res[i - 1][1] + 0.03: res[i][1] = round(res[i - 1][1] + 0.05, 3)
    return res, (t0 * HOP / SR, t1 * HOP / SR), [(a * HOP / SR, b * HOP / SR) for a, b in runs], sorted(use)


def main():
    rid = sys.argv[1]; base = os.path.join(SCRIPTS, rid)
    S = json.load(open(os.path.join(base, 'script.json'))); T = json.load(open(os.path.join(base, 'timing.json')))
    out = {}
    for k, v in T.items():
        if k.startswith('_'): continue
        ws, span, runs, used = line_words(os.path.join(base, v['file']), v['text'])
        out[k] = ws
        if '--show' in sys.argv:
            print(k, 'speech %.2f-%.2f of %.2f s; pauses %s; matched after words %s' % (span[0], span[1], v['dur'], ['%.2f-%.2f' % r for r in runs], used))
            print('   ' + '  '.join('%s@%.2f' % (w, t) for w, t in ws))
    S['words'] = out
    S['wordsNote'] = 'Timpii cuvintelor, măsurați pe voce (wordtimes.py: pauzele reale la punctuație, apoi silabele); scenele îi folosesc pentru textul cinetic și contoare.'
    json.dump(S, open(os.path.join(base, 'script.json'), 'w'), ensure_ascii=False, indent=1)
    print(rid + ': word times for %d lines written to script.json' % len(out))


if __name__ == '__main__':
    main()
