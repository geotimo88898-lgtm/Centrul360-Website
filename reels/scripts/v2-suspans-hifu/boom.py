#!/usr/bin/env python3
"""The calm opening and the BOOM of v2-suspans-hifu (the owner, 15.11: „la început ceva super chill și calm dar foarte
catchy … și după BUM vine asta cu honorable”).

    python3 scripts/v2-suspans-hifu/boom.py        (from reels/; run once after sfx.py --v3, before mix.py)

1. The opening's own sounds, next to the premium set in engine/sfx/v3 (git-ignored, like whoosh_fall.py):
   - glass_pulse_0..2: one soft glass bowl struck very gently (inharmonic partials, two close tones that beat slowly,
     a felt-mallet transient), a long calm decay; it opens the reel on frame 0
   - pend_air_0..3: the air of a swinging ball, a soft low swish whose loudest moment is in its middle (the cue is
     placed with "peak": the ball passes the bottom of its arc there), a little rise and fall in pitch (Doppler)
2. The preview track with the opening's silence in front: engine/music/owner-weongo-boom.wav = PAD seconds of digital
   silence, then the owner's WE ON GO II from 0 s (the honorable part), 20 s of it (the explicit lyrics come after ~24 s).
   mix.py plays music/<musicFile>.wav from "musicStart" at reel 0 and cannot start a song later, so the silence is in
   the file (git-ignored, like the song). PAD = 14.0 - 11.094: the hit at 11.094 s of the song (the reveal) lands on
   frame 420 (14.0 s) and the song's first hit (its transient at 0.1006 s) on frame 90, 3.0066 s, the cut."""
import os, wave
import numpy as np

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
ENG = os.path.join(HERE, '..', '..', 'engine')
OUT = os.path.join(ENG, 'sfx', 'v3')
HIT_SONG, HIT_REEL = 11.094, 14.0
PAD = HIT_REEL - HIT_SONG


def write(path, y):
    y = np.asarray(y, np.float32)
    if y.ndim == 1: y = np.stack([y, y], 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())


def room(rng, y, amt=0.12, dec=0.18):
    ir = rng.standard_normal((int(0.6 * SR), 2)) * np.exp(-np.arange(int(0.6 * SR)) / (dec * SR))[:, None]
    n = len(y); m = 1 << int(np.ceil(np.log2(n + len(ir))))
    wet = np.stack([np.fft.irfft(np.fft.rfft(y[:, c], m) * np.fft.rfft(ir[:, c], m), m)[:n] for c in (0, 1)], 1)
    return y + amt * wet / (np.abs(wet).max() + 1e-9) * np.abs(y).max()


def glass_pulse(seed, f0):
    rng = np.random.default_rng(seed)
    dur = 3.4; n = int(dur * SR); t = np.arange(n) / SR
    y = np.zeros(n)
    for ratio, amp, dec in ((1.0, 1.0, 2.2), (2.71, 0.34, 1.1), (5.12, 0.12, 0.55), (8.2, 0.05, 0.3)):
        for det, a in ((1.0, 1.0), (1.0 + 0.9 / (f0 * ratio), 0.8)):  # two close tones: a slow beating, like a real bowl
            y += amp * a * np.sin(2 * np.pi * f0 * ratio * det * t + rng.random() * 6.28) * np.exp(-t / dec)
    att = 1 - np.exp(-t / 0.006)  # a felt mallet: no click, a soft start
    y *= att
    tr = rng.standard_normal(n) * np.exp(-t / 0.004) * 0.25  # the touch of the mallet, very short, low-passed
    tr = np.convolve(tr, np.ones(24) / 24, 'same')
    y = (y + tr) / 2.4
    st = np.stack([y * (1 + 0.04 * np.sin(2 * np.pi * 0.7 * t)), y * (1 - 0.04 * np.sin(2 * np.pi * 0.7 * t))], 1)
    st = room(rng, st, 0.18, 0.35)
    st *= np.clip((dur - t) / 0.4, 0, 1)[:, None]
    return st / np.abs(st).max() * 0.8


def pend_air(seed, fc):
    rng = np.random.default_rng(seed)
    dur = 0.62; n = int(dur * SR); t = np.arange(n) / SR; p = t / dur
    x = rng.standard_normal(n + 4096)
    N, H = 1024, 128; win = np.hanning(N); f = np.fft.rfftfreq(N, 1 / SR); f[0] = 1
    out = np.zeros(n + 2 * N); nrm = np.zeros(n + 2 * N)
    for a in range(0, n, H):
        q = min(1, (a + N / 2) / n)
        c = fc * (0.82 + 0.36 * np.sin(np.pi * q))  # the pitch rises as it comes, falls as it goes
        sh = np.exp(-0.5 * (np.log2(f / c) / 0.9) ** 2)
        yy = np.fft.irfft(np.fft.rfft(x[a:a + N] * win) * sh) * win
        out[a:a + N] += yy; nrm[a:a + N] += win ** 2
    y = (out / np.maximum(nrm, 1e-6))[N // 2: N // 2 + n]
    env = np.sin(np.pi * p) ** 2.2  # loudest in the middle (the bottom of the arc)
    y = y * env; y /= np.abs(y).max()
    st = np.stack([y, y], 1)
    st = room(rng, st, 0.08, 0.12)
    return st / np.abs(st).max() * 0.7


def main():
    os.makedirs(OUT, exist_ok=True)
    for i, f0 in enumerate((392.0, 415.3, 440.0)):
        write(os.path.join(OUT, 'glass_pulse_%d.wav' % i), glass_pulse(100 + i, f0))
    for i, fc in enumerate((420, 480, 540, 600)):
        write(os.path.join(OUT, 'pend_air_%d.wav' % i), pend_air(200 + i, fc))
    song = os.path.join(ENG, 'music', 'owner-weongo.wav')
    with wave.open(song) as w:
        assert w.getframerate() == SR and w.getnchannels() == 2
        y = np.frombuffer(w.readframes(int(20 * SR)), '<i2').reshape(-1, 2)
    pad = np.zeros((int(round(PAD * SR)), 2), '<i2')
    with wave.open(os.path.join(ENG, 'music', 'owner-weongo-boom.wav'), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(np.concatenate([pad, y]).astype('<i2').tobytes())
    print('sfx/v3: glass_pulse ×3, pend_air ×4; music/owner-weongo-boom.wav: %.3f s of silence, then the song from 0 s (the cut at %.4f s)' % (PAD, PAD + 0.1006))


if __name__ == '__main__':
    main()
