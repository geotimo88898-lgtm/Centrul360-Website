#!/usr/bin/env python3
"""The dive's own sound (v2-crema-straturi, the director, 15.11: „a whoosh that falls in pitch with the descent”).

    python3 scripts/v2-crema-straturi/whoosh_fall.py        (from reels/; writes engine/sfx/v3/whoosh_fall_0..2.wav)

The engine's library has no falling whoosh and mix.py cannot bend a sound's pitch, so this makes one category more,
"whoosh_fall", next to the premium set (engine/sfx/ is git-ignored and built by sfx.py: run this once after sfx.py --v3).
Without these files mix.py simply leaves the cue out and the scene's fallback (whoosh_through on the same frame) plays.

One sound, about 3 s: air (noise through a band that falls from about 2.6 kHz to 200 Hz), a soft tone gliding down
under it, a little room. Its loudest moment is 1.62 s in: the scene asks for the peak on the cut in the middle of the
dive ("peak": true), so the sound starts with the descent and its tail ends as the camera lands."""
import os, sys, wave
import numpy as np

SR = 48000
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'engine', 'sfx', 'v3')
PEAK_AT = 1.62


def band_noise(rng, n, fc, bw):
    """noise whose band centre follows fc (one value a sample), bw octaves wide: shaped frame by frame in the spectrum"""
    N, H = 2048, 256
    x = rng.standard_normal(n + N)
    win = np.hanning(N)
    out = np.zeros(n + 2 * N); norm = np.zeros(n + 2 * N)
    f = np.fft.rfftfreq(N, 1 / SR); f[0] = 1.0
    for a in range(0, n, H):
        c = fc[min(n - 1, a + N // 2)]
        shape = np.exp(-0.5 * (np.log2(f / c) / bw) ** 2) + 0.12 * np.exp(-0.5 * (np.log2(f / (c * 3.2)) / 0.8) ** 2)   # the band, and a little air above it
        y = np.fft.irfft(np.fft.rfft(x[a:a + N] * win) * shape) * win
        out[a:a + N] += y; norm[a:a + N] += win ** 2
    return (out / np.maximum(norm, 1e-6))[N // 2: N // 2 + n]


def make(seed, f_hi, f_lo, tone_hi, tone_lo, dur):
    rng = np.random.default_rng(seed)
    n = int(dur * SR); t = np.arange(n) / SR; p = t / dur
    fc = f_hi * (f_lo / f_hi) ** (p ** 0.85)                       # the air falls fastest at the start, like something passing downward
    env = np.where(t < PEAK_AT, (t / PEAK_AT) ** 1.8, np.exp(-(t - PEAK_AT) / 0.5))
    env = env * (1 + 0.22 * np.exp(-((t - PEAK_AT) / 0.045) ** 2))  # a small crest exactly on the peak (the mix aligns it to the frame)
    env *= np.clip((dur - t) / 0.3, 0, 1) * np.clip(t / 0.05, 0, 1)
    common = band_noise(rng, n, fc, 0.85)
    L = 0.75 * common + 0.6 * band_noise(rng, n, fc * 1.04, 0.85)
    Rr = 0.75 * common + 0.6 * band_noise(rng, n, fc * 0.96, 0.85)
    air = np.stack([L, Rr], 1); air /= np.abs(air).max()
    # the tone under the air: three close sines gliding down, a little tremolo; quiet, it only gives the fall a pitch
    ft = tone_hi * (tone_lo / tone_hi) ** (p ** 0.9)
    tone = np.zeros(n)
    for k, det in enumerate((1.0, 1.006, 0.5)):
        ph = 2 * np.pi * np.cumsum(ft * det) / SR + rng.random() * 6.28
        tone += (1.0 if k < 2 else 0.8) * np.sin(ph)
    tone *= (0.85 + 0.15 * np.sin(2 * np.pi * 5.3 * t)) / 2.8
    y = (air * 0.9 + np.stack([tone, tone], 1) * 0.3) * env[:, None]
    # a small room: a short decaying noise, well under the sound
    ir = rng.standard_normal((int(0.4 * SR), 2)) * np.exp(-np.arange(int(0.4 * SR)) / (0.11 * SR))[:, None]
    m = 1 << int(np.ceil(np.log2(n + len(ir))))
    wet = np.stack([np.fft.irfft(np.fft.rfft(y[:, c], m) * np.fft.rfft(ir[:, c], m), m)[:n] for c in (0, 1)], 1)
    y = y + 0.1 * wet / (np.abs(wet).max() + 1e-9) * np.abs(y).max()
    # a slow pan from slightly left to slightly right (the camera sways on the way down)
    pan = 0.12 * np.sin(2 * np.pi * 0.21 * t + seed)
    y[:, 0] *= 1 - pan; y[:, 1] *= 1 + pan
    return y / np.abs(y).max() * 0.85


def main():
    os.makedirs(OUT, exist_ok=True)
    for i, (hi, lo, th, tl, d) in enumerate([(2600, 200, 330, 62, 3.0), (2400, 190, 300, 58, 3.05), (2800, 215, 360, 66, 2.95)]):
        y = make(41 + i, hi, lo, th, tl, d)
        p = os.path.join(OUT, 'whoosh_fall_%d.wav' % i)
        with wave.open(p, 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())
        env = np.convolve(np.abs(y).sum(1), np.ones(240) / 240, 'same')
        print('%s  %.2f s, loudest at %.2f s, rms %.3f' % (os.path.relpath(p), len(y) / SR, np.argmax(env) / SR, np.sqrt((y ** 2).mean())))


if __name__ == '__main__':
    main()
