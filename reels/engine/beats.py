#!/usr/bin/env python3
"""The beat grid of a music bed and its catchiest part, for a reel that uses a chosen track (script "musicFile").
  python3 beats.py <music/name.wav> [reel seconds]
→ tempo (BPM, refined), the beat phase, the downbeats (bar starts), the energy of each 8-bar phrase (all, bass, the
  vocal band), and the suggested start: a downbeat at the beginning of the most energetic, most „hooky” phrase after
  the intro (the vocal band weighs most). The script then gets "musicStart" (seconds) and "beat": {"bpm", "phase"},
  so the hook hit lands on a downbeat and the cuts snap to the beat."""
import json, subprocess, sys
import numpy as np
from scipy import signal

SR = 22050


def load(p):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', p, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, '<i2').astype(np.float32) / 32768


def main():
    path = sys.argv[1]; need = float(sys.argv[2]) if len(sys.argv) > 2 else 45
    y = load(path); dur = len(y) / SR
    hop = 256; fps = SR / hop
    f, t, Z = signal.stft(y, SR, nperseg=1024, noverlap=1024 - hop); M = np.log1p(np.abs(Z) * 100)
    flux = np.maximum(0, np.diff(M, axis=1)).sum(0)
    low = np.maximum(0, np.diff(M[(f > 30) & (f < 150)], axis=1)).sum(0)
    on = flux - np.convolve(flux, np.ones(32) / 32, 'same'); on = np.maximum(on, 0)
    # tempo: a comb over the onset envelope, 100-140 BPM, 0.01 BPM steps around the autocorrelation peak
    ac = np.correlate(on, on, 'full')[len(on) - 1:]
    lag = np.arange(1, len(ac)); bpms = 60 * fps / lag; m = (bpms > 100) & (bpms < 140)
    b0 = bpms[m][np.argmax(ac[1:][m])]
    best = (0, b0)
    for bpm in np.arange(b0 - 1.5, b0 + 1.5, 0.01):
        per = 60 / bpm * fps; idx = (np.arange(0, len(on) / per) * per).astype(int)
        sc = max(on[np.clip(idx + k, 0, len(on) - 1)].sum() for k in range(0, int(per), 2))
        if sc > best[0]: best = (sc, bpm)
    bpm = best[1]; per = 60 / bpm
    # phase: where the low onsets (the kick) sit
    ph = np.linspace(0, per, 96, endpoint=False)
    kick = [low[np.clip(((np.arange(0, dur / per) * per + p) * fps).astype(int), 0, len(low) - 1)].sum() for p in ph]
    phase = float(ph[int(np.argmax(kick))])
    beats = np.arange(phase, dur, per)
    # downbeats: of the 4 possible bar starts, the one where the harmony changes most (spectral novelty at bar lines)
    chroma_like = M[(f > 150) & (f < 2000)]
    nov = np.r_[0, np.abs(np.diff(signal.medfilt(chroma_like.mean(0), 9)))]
    bar0 = int(np.argmax([sum(nov[min(len(nov) - 1, int(b * fps))] for b in beats[k::4]) for k in range(4)]))
    bars = beats[bar0::4]
    # phrases of 8 bars: loudness, bass, vocal band
    def band(lo, hi, a, b):
        s0, s1 = int(a * fps), int(b * fps); return float(np.mean(M[(f >= lo) & (f < hi), s0:s1])) if s1 > s0 else 0
    phrases = []
    for i in range(0, len(bars) - 8, 8):
        a, b = bars[i], bars[i + 8]
        phrases.append({'start': round(float(a), 3), 'all': band(30, 8000, a, b), 'bass': band(30, 200, a, b), 'vocal': band(800, 3500, a, b)})
    for k in ('all', 'bass', 'vocal'):
        v = np.array([p[k] for p in phrases]); v = (v - v.min()) / (np.ptp(v) + 1e-9)
        for p, x in zip(phrases, v): p[k + '_n'] = round(float(x), 3)
    for p in phrases: p['score'] = round(0.5 * p['vocal_n'] + 0.3 * p['all_n'] + 0.2 * p['bass_n'], 3)
    ok = [p for p in phrases if p['start'] > 20 and p['start'] + need < dur]
    pick = max(ok, key=lambda p: p['score']) if ok else phrases[0]
    out = {'file': path, 'duration': round(dur, 2), 'bpm': round(bpm, 2), 'beat': round(per, 4), 'phase': round(phase, 3), 'bar_offset': bar0,
           'suggested_start': pick['start'], 'phrases': [{k: p[k] for k in ('start', 'score', 'all_n', 'bass_n', 'vocal_n')} for p in phrases]}
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main()
