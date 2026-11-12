#!/usr/bin/env python3
"""Sunetele reels-urilor, sintetizate (fără mostre, fără licențe): numpy + scipy.
  python3 sfx.py  → sfx/hit.wav, sfx/riser.wav (v1, cârligul sonor) și sfx/v2/<categorie>_<n>.wav (v2: 4-6 variante
                    pe categorie, 48 kHz; whoosh/swoosh în stereo, cu trecere stânga→dreapta)
Categoriile v2 (motorul le pune singur, din animații; mix.py alege varianta, tonul și nivelul):
  whoosh_s, whoosh_l, whoosh_r (invers, urcă spre o lovitură), swoosh, swoosh_up, swoosh_down, shutter (aparat foto),
  click (UI), key (tastă), pop, bubble, tick, riser, riser_s, impact, boom, subdrop, shimmer, sparkle, glitch, paper,
  snap (magnetic), chime, shatter (sticlă)."""
import os, subprocess, wave
import numpy as np
from scipy import signal

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'sfx')
OUT2 = os.path.join(OUT, 'v2')
ACADEMY = os.path.join(HERE, '..', '..', 'academy-vsl', 'src', 'engine')


def tt(d): return np.arange(int(SR * d)) / SR


def save(path, y, peak=0.9):
    y = np.asarray(y, dtype=np.float64)
    y = y / (np.max(np.abs(y)) + 1e-9) * peak
    ch = 2 if y.ndim == 2 else 1
    fade = min(len(y) // 4, int(0.004 * SR))
    if fade:
        ramp = np.linspace(0, 1, fade)
        if ch == 2: y[:fade] *= ramp[:, None]; y[-fade:] *= ramp[::-1][:, None]
        else: y[:fade] *= ramp; y[-fade:] *= ramp[::-1]
    with wave.open(path, 'wb') as w:
        w.setnchannels(ch); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())


def lp(y, fc, order=2): b, a = signal.butter(order, min(fc, SR / 2 - 100) / (SR / 2), 'low'); return signal.lfilter(b, a, y)
def hp(y, fc, order=2): b, a = signal.butter(order, fc / (SR / 2), 'high'); return signal.lfilter(b, a, y)
def bp(y, lo, hi, order=2): b, a = signal.butter(order, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], 'band'); return signal.lfilter(b, a, y)


def svf_bp(x, fc, q=1.2):
    """band-pass with a moving centre frequency (state-variable filter); fc is an array"""
    y = np.zeros_like(x); low = band = 0.0
    f = 2 * np.sin(np.pi * np.clip(fc, 20, SR / 6) / SR); damp = 1 / q
    for i in range(len(x)):
        high = x[i] - low - damp * band
        band += f[i] * high; low += f[i] * band
        y[i] = band
    return y


def env_ad(n, a, d_curve=5.0, peak_at=None):
    x = np.linspace(0, 1, n)
    pk = peak_at if peak_at is not None else a
    up = np.clip(x / max(pk, 1e-4), 0, 1) ** 2
    down = np.exp(-d_curve * np.clip(x - pk, 0, None) / max(1 - pk, 1e-4))
    return up * down


def pan_sweep(y, a=-0.7, b=0.7):
    p = np.linspace(a, b, len(y))
    l = np.cos((p + 1) * np.pi / 4); r = np.sin((p + 1) * np.pi / 4)
    return np.stack([y * l, y * r], 1)


def whoosh(rng, d, f0, f1, f2, peak=0.55, q=1.6, rev=False):
    n = int(SR * d); x = np.linspace(0, 1, n)
    fc = np.where(x < peak, f0 + (f1 - f0) * (x / peak) ** 1.5, f1 + (f2 - f1) * ((x - peak) / (1 - peak)))
    nz = rng.standard_normal(n)
    y = svf_bp(nz, fc, q) * 0.8 + lp(nz, 380) * 0.5
    y *= env_ad(n, 0, 4.5, peak)
    if rev: y = y[::-1] * 1.0
    return pan_sweep(y, -0.6, 0.6) if not rev else pan_sweep(y, 0.5, -0.1)


def chirp(d, f0, f1, curve=1.0, harm=((1, 1.0),)):
    x = tt(d); fr = f0 + (f1 - f0) * (x / d) ** curve
    ph = 2 * np.pi * np.cumsum(fr) / SR
    return sum(g * np.sin(k * ph) for k, g in harm)


def decay(d, rate): return np.exp(-rate * tt(d))


def main():
    os.makedirs(OUT2, exist_ok=True)
    rng = np.random.default_rng(360)
    # ---------------- v1 (kept): hit + riser on the first words
    if not os.path.exists(os.path.join(ACADEMY, 'sfx', 'pop.wav')):
        subprocess.run(['python3', os.path.join(ACADEMY, 'sfx.py')], check=False)
    d = 0.55; x = tt(d)
    f = 42 + 68 * np.exp(-x * 18)
    save(os.path.join(OUT, 'hit.wav'), np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 7.5) + rng.standard_normal(len(x)) * np.exp(-x * 160) * 0.5 + lp(rng.standard_normal(len(x)), 2500) * np.exp(-x * 14) * 0.35)
    d = 0.5; x = tt(d)
    save(os.path.join(OUT, 'riser.wav'), (np.sin(2 * np.pi * np.cumsum(300 + 900 * (x / d) ** 2) / SR) * 0.35 + lp(rng.standard_normal(len(x)), 4000) * 0.8) * (x / d) ** 2.2, 0.6)

    S = {}
    def put(cat, i, y, peak=0.9): save(os.path.join(OUT2, '%s_%d.wav' % (cat, i)), y, peak); S[cat] = S.get(cat, 0) + 1

    for i in range(5):  # short whoosh (transitions)
        put('whoosh_s', i, whoosh(rng, 0.36 + 0.05 * i, 300 + 60 * i, 2200 + 300 * i, 700, 0.5 + 0.04 * i), 0.85)
    for i in range(4):  # long whoosh
        put('whoosh_l', i, whoosh(rng, 0.8 + 0.1 * i, 180, 1600 + 250 * i, 400, 0.6, 1.2), 0.85)
    for i in range(4):  # reverse whoosh: swells into a point (the loop, the payoff)
        put('whoosh_r', i, whoosh(rng, 0.65 + 0.08 * i, 300, 2600 + 200 * i, 900, 0.5, 1.4, rev=True), 0.8)
    for i in range(5):  # swoosh (elements sliding)
        put('swoosh', i, whoosh(rng, 0.24 + 0.03 * i, 900, 3600 + 300 * i, 1600, 0.45, 2.2), 0.8)
    for i in range(5):  # swoosh up / down: a pitched air movement
        n = int(SR * (0.3 + 0.03 * i)); xx = np.linspace(0, 1, n)
        nz = rng.standard_normal(n)
        up = svf_bp(nz, 600 + 5200 * xx ** 1.3, 2.5) * env_ad(n, 0, 3.5, 0.7) + 0.18 * chirp(n / SR, 380 + 40 * i, 1500 + 120 * i, 1.4) * env_ad(n, 0, 4, 0.75)
        put('swoosh_up', i, pan_sweep(up, -0.3, 0.3), 0.75)
        dn = svf_bp(nz, 5000 - 4300 * xx ** 0.7, 2.5) * env_ad(n, 0, 4, 0.25) + 0.16 * chirp(n / SR, 1400 + 100 * i, 320, 0.7) * env_ad(n, 0, 4, 0.2)
        put('swoosh_down', i, pan_sweep(dn, 0.3, -0.3), 0.75)
    for i in range(4):  # camera shutter: two mechanical clicks + a spring
        n = int(SR * 0.22); y = np.zeros(n)
        for at, fr, g in ((0.0, 2300 + 150 * i, 1.0), (0.07 + 0.012 * i, 1500 + 100 * i, 0.75)):
            k = int(at * SR); m = int(0.05 * SR)
            burst = hp(rng.standard_normal(m), 1800) * np.exp(-tt(0.05) * 260)
            ring = np.sin(2 * np.pi * fr * tt(0.05)) * np.exp(-tt(0.05) * 90) * 0.6
            y[k:k + m] += (burst + ring) * g
        y += lp(rng.standard_normal(n), 1200) * np.exp(-tt(0.22) * 30) * 0.15
        put('shutter', i, y, 0.85)
    for i in range(5):  # UI click
        n = int(SR * 0.05)
        put('click', i, hp(rng.standard_normal(n), 2500) * np.exp(-tt(0.05) * 400) + np.sin(2 * np.pi * (2600 + 300 * i) * tt(0.05)) * np.exp(-tt(0.05) * 160) * 0.5, 0.7)
    for i in range(8):  # keyboard key: a thock + a short release
        n = int(SR * 0.11); y = np.zeros(n)
        m = int(0.03 * SR)
        y[:m] += bp(rng.standard_normal(m), 1400 + 120 * i, 5000) * np.exp(-tt(0.03) * 220)
        y[:m] += np.sin(2 * np.pi * (170 + 12 * i) * tt(0.03)) * np.exp(-tt(0.03) * 120) * 0.7
        k = int((0.055 + 0.004 * i) * SR); m2 = int(0.02 * SR)
        y[k:k + m2] += hp(rng.standard_normal(m2), 3000) * np.exp(-tt(0.02) * 350) * 0.35
        put('key', i, y, 0.7)
    for i in range(5):  # pop
        d = 0.09; x = tt(d)
        f = 950 + 90 * i; y = np.sin(2 * np.pi * np.cumsum(f * np.exp(-x * 34) + 160) / SR) * np.exp(-x * 42)
        put('pop', i, y + hp(rng.standard_normal(len(x)), 3000) * np.exp(-x * 900) * 0.3, 0.8)
    for i in range(4):  # bubble
        d = 0.14; x = tt(d)
        y = np.sin(2 * np.pi * np.cumsum(260 + 120 * i + 900 * (x / d) ** 1.6) / SR) * np.sin(np.pi * np.clip(x / d, 0, 1)) ** 1.5
        put('bubble', i, y, 0.75)
    for i in range(5):  # tick (wood)
        d = 0.06; x = tt(d)
        put('tick', i, (np.sin(2 * np.pi * (2300 + 200 * i) * x) + 0.5 * np.sin(2 * np.pi * (5600 + 300 * i) * x)) * np.exp(-x * 170) + hp(rng.standard_normal(len(x)), 4000) * np.exp(-x * 1500) * 0.4, 0.7)
    for i, d in enumerate((1.25, 1.4, 1.1)):  # riser: noise + a rising tone, tremolo speeding up, a sudden stop
        x = tt(d); p = x / d
        nz = svf_bp(rng.standard_normal(len(x)), 300 + 7000 * p ** 2, 1.4)
        tone = chirp(d, 220 + 30 * i, 880 + 60 * i, 2.0, ((1, 1), (2, .3), (3, .12)))
        trem = 0.75 + 0.25 * np.sin(2 * np.pi * np.cumsum(4 + 22 * p ** 2) / SR)
        put('riser', i, pan_sweep((nz * 0.7 + tone * 0.28) * p ** 2.4 * trem, -0.2, 0.2), 0.75)
    for i, d in enumerate((0.55, 0.65, 0.5)):
        x = tt(d); p = x / d
        put('riser_s', i, (svf_bp(rng.standard_normal(len(x)), 500 + 6000 * p ** 2, 1.6) * 0.8 + chirp(d, 400, 1300, 2) * 0.2) * p ** 2, 0.7)
    for i in range(4):  # impact: thump + click + smack + tail
        d = 0.9; x = tt(d)
        f = 46 + (84 + 8 * i) * np.exp(-x * 20)
        thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 6)
        smack = bp(rng.standard_normal(len(x)), 700, 3500) * np.exp(-x * 40) * 0.6
        click = hp(rng.standard_normal(len(x)), 3000) * np.exp(-x * 500) * 0.5
        tail = lp(rng.standard_normal(len(x)), 1800) * np.exp(-x * 7) * 0.18
        put('impact', i, np.tanh(1.6 * (thump + smack + click + tail)), 0.95)
    for i in range(3):  # boom: cinematic low hit
        d = 1.8; x = tt(d)
        f = 30 + (34 + 6 * i) * np.exp(-x * 4)
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 2.4) + lp(rng.standard_normal(len(x)), 400) * np.exp(-x * 3) * 0.5 + bp(rng.standard_normal(len(x)), 500, 3000) * np.exp(-x * 30) * 0.4
        put('boom', i, np.tanh(1.4 * y), 0.95)
    for i in range(3):  # sub drop
        d = 1.0 + 0.1 * i; x = tt(d)
        put('subdrop', i, np.tanh(1.3 * np.sin(2 * np.pi * np.cumsum(110 * (35 / 110) ** (x / d)) / SR) * np.clip(x / 0.03, 0, 1) * np.exp(-x * 2.2)), 0.9)
    for i in range(4):  # shimmer: bell partials starting one after the other
        d = 1.1; x = tt(d); y = np.zeros(len(x))
        r2 = np.random.default_rng(100 + i)
        for k in range(14):
            fr = 1800 + r2.random() * 6200; at = r2.random() * 0.5; kk = int(at * SR)
            seg = np.sin(2 * np.pi * fr * tt(d - at)) * np.exp(-tt(d - at) * (5 + r2.random() * 5)) * (0.4 + r2.random() * 0.6)
            y[kk:kk + len(seg)] += seg[: len(y) - kk]
        y += hp(rng.standard_normal(len(x)), 6000) * np.sin(np.pi * np.clip(x / d, 0, 1)) * 0.12
        put('shimmer', i, pan_sweep(y, -0.4, 0.4), 0.6)
    for i in range(4):  # sparkle: three quick pings going up
        d = 0.5; x = tt(d); y = np.zeros(len(x))
        for k, fr in enumerate(np.array([1, 1.26, 1.5]) * (2093 + 120 * i)):
            kk = int(k * 0.07 * SR); seg = np.sin(2 * np.pi * fr * tt(d - k * 0.07)) * np.exp(-tt(d - k * 0.07) * 14)
            y[kk:kk + len(seg)] += seg[: len(y) - kk]
        put('sparkle', i, y, 0.55)
    for i in range(4):  # glitch: digital stutters (short, never loud)
        r2 = np.random.default_rng(200 + i); parts = []
        for k in range(8 + i):
            dd = 0.012 + r2.random() * 0.03; x = tt(dd)
            kind = r2.integers(3)
            if kind == 0: s = np.sign(np.sin(2 * np.pi * (200 + r2.random() * 1800) * x))
            elif kind == 1: s = np.round(r2.standard_normal(len(x)) * 3) / 3
            else: s = np.zeros(len(x))
            parts.append(s * (0.4 + r2.random() * 0.6))
        put('glitch', i, lp(np.concatenate(parts), 9000), 0.55)
    for i in range(4):  # paper slide
        d = 0.32 + 0.04 * i; x = tt(d)
        fr = 1 + 0.6 * np.abs(np.sin(2 * np.pi * (19 + 3 * i) * x))
        y = bp(rng.standard_normal(len(x)), 900, 6500) * np.sin(np.pi * np.clip(x / d, 0, 1)) ** 1.2 * fr
        put('paper', i, pan_sweep(y, -0.3, 0.3), 0.6)
    for i in range(4):  # magnetic snap
        d = 0.25; x = tt(d)
        y = hp(rng.standard_normal(len(x)), 3500) * np.exp(-x * 700) + np.sin(2 * np.pi * np.cumsum(240 * np.exp(-x * 6) + 120 + 10 * i) / SR) * np.exp(-x * 26) * 0.9 + np.sin(2 * np.pi * (1700 + 90 * i) * x) * np.exp(-x * 34) * 0.25
        put('snap', i, y, 0.85)
    for i in range(3):  # chime: two soft bell notes
        d = 1.1; x = tt(d); y = np.zeros(len(x))
        base = [1318.5, 1567.98, 1760][i]
        for k, (fr, at) in enumerate(((base, 0), (base * 1.5, 0.09))):
            kk = int(at * SR); xx = tt(d - at)
            y[kk:] += (np.sin(2 * np.pi * fr * xx) + 0.3 * np.sin(2 * np.pi * fr * 2.76 * xx) * np.exp(-xx * 6)) * np.exp(-xx * 4.5)
        put('chime', i, y, 0.55)
    for i in range(3):  # shatter: glass (a crack, then many little shards)
        d = 1.2; x = tt(d); r2 = np.random.default_rng(300 + i)
        y = hp(rng.standard_normal(len(x)), 2500) * np.exp(-x * 25) * 0.8
        for k in range(60):
            at = r2.random() ** 1.8 * 0.9; kk = int(at * SR); fr = 2500 + r2.random() * 7000; dd = 0.05 + r2.random() * 0.12
            seg = np.sin(2 * np.pi * fr * tt(dd)) * np.exp(-tt(dd) * (40 + r2.random() * 60)) * (0.2 + r2.random() * 0.5) * np.exp(-at * 2)
            y[kk:kk + len(seg)] += seg[: len(y) - kk]
        y += np.sin(2 * np.pi * np.cumsum(60 * np.exp(-x * 8) + 50) / SR) * np.exp(-x * 12) * 0.5
        put('shatter', i, pan_sweep(y, -0.5, 0.5), 0.9)
    print('v1: hit, riser · v2: ' + ', '.join('%s×%d' % kv for kv in S.items()) + ' → ' + OUT2)


if __name__ == '__main__':
    main()
