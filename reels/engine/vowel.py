#!/usr/bin/env python3
"""Which vowel opens a word, measured (not asked): „hifu” (Romanian i) or „hai-fu” (English ai)?
  python3 vowel.py <wav or mp4> [start s] [duration s]
Tracks the first two formants (LPC) on the voiced frames: a Romanian „i” stays low and closed (F1 ~250-350 Hz, F2 ~2500+),
the English „ai” starts open (F1 ~700-1000 Hz, F2 ~1400) and glides up. 14.11: the listener's answer to „hi-fu or
hai-fu?” changes with the music and with how the question is put; the formants do not. Used on the line that starts
with HIFU (scripts/<id>/voice/cont-…-L<n>.wav)."""
import os, subprocess, sys, tempfile
import numpy as np
from scipy.signal import lfilter


def load(path, sr=10000):
    with tempfile.TemporaryDirectory() as d:
        w = os.path.join(d, 'a.raw')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 's16le', w], check=True)
        return np.frombuffer(open(w, 'rb').read(), '<i2').astype(np.float32) / 32768, sr


def formants(x, sr, order=12):
    x = lfilter([1, -0.63], 1, x * np.hamming(len(x)))
    r = np.correlate(x, x, 'full')[len(x) - 1:len(x) + order]
    a = np.zeros(order + 1); a[0] = 1; e = r[0]
    for i in range(1, order + 1):  # Levinson-Durbin
        k = -(r[i] + np.dot(a[1:i], r[i - 1:0:-1])) / e
        a[1:i] = a[1:i] + k * a[i - 1:0:-1]; a[i] = k; e *= 1 - k * k
    fr = sorted(np.angle(z) * sr / (2 * np.pi) for z in np.roots(a) if np.imag(z) >= 0 and abs(z) > 0.8)
    return [f for f in fr if f > 200][:2]


def first_vowel(path, t0=0.0, dur=0.45):
    y, sr = load(path); seg = y[int(t0 * sr):int((t0 + dur) * sr)]
    out = []
    for i in range(0, len(seg) - 250, 100):
        f = seg[i:i + 250]
        if np.sqrt((f ** 2).mean()) > 0.02 and ((f[:-1] * f[1:]) < 0).mean() < 0.25:
            F = formants(f, sr)
            if len(F) == 2: out.append((round(t0 + i / sr, 2), int(F[0]), int(F[1])))
    head = [x for x in out[:4]]
    f1 = np.median([x[1] for x in head]) if head else 0
    verdict = 'i (românește)' if head and f1 < 450 else 'a/ai (englezește)' if head and f1 > 600 else 'neclar'
    return verdict, out[:10]


if __name__ == '__main__':
    p = sys.argv[1]; t0 = float(sys.argv[2]) if len(sys.argv) > 2 else 0.0; d = float(sys.argv[3]) if len(sys.argv) > 3 else 0.45
    v, tr = first_vowel(p, t0, d)
    print(os.path.basename(p) + ': first vowel ' + v + ' | (t, F1, F2): ' + ', '.join('(%.2f, %d, %d)' % x for x in tr))
