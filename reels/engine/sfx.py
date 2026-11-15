#!/usr/bin/env python3
"""Sunetele reels-urilor, sintetizate (fără mostre, fără licențe): numpy + scipy.
  python3 sfx.py  → sfx/hit.wav, sfx/riser.wav (v1, cârligul sonor) și sfx/v2/<categorie>_<n>.wav (v2: 4-6 variante
                    pe categorie, 48 kHz; whoosh/swoosh în stereo, cu trecere stânga→dreapta)
Categoriile v2 (motorul le pune singur, din animații; mix.py alege varianta, tonul și nivelul):
  whoosh_s, whoosh_l, whoosh_r (invers, urcă spre o lovitură), swoosh, swoosh_up, swoosh_down, shutter (aparat foto),
  click (UI), key (tastă), pop, bubble, tick, riser, riser_s, impact, boom, subdrop, shimmer, sparkle, glitch, paper,
  snap (magnetic), chime, shatter (sticlă)."""
import sys, os, subprocess, wave
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
    for i, root in enumerate((261.63, 293.66, 329.63)):  # resolve: a warm major chord (root, third, fifth, octave), a soft attack, a long tail
        d = 2.6; x = tt(d); y = np.zeros(len(x))
        for k, (m, g) in enumerate(((1, 1.0), (1.26, 0.7), (1.5, 0.75), (2, 0.45), (0.5, 0.5))):
            fr = root * m
            y += g * (np.sin(2 * np.pi * fr * x) + 0.25 * np.sin(2 * np.pi * fr * 2.01 * x) * np.exp(-x * 2.5)) * np.exp(-x * (0.9 + 0.2 * k))
        y *= np.clip(x / 0.05, 0, 1)
        y += lp(rng.standard_normal(len(x)), 3000) * np.exp(-x * 3) * 0.04
        put('resolve', i, pan_sweep(y, -0.15, 0.15), 0.6)
    print('v1: hit, riser · v2: ' + ', '.join('%s×%d' % kv for kv in S.items()) + ' → ' + OUT2)


# ---------------------------------------------------------------------------------------------------------------
# v3, the premium set (15.11, the owner: „fă-le cu sound effects nice, nu doar așa”). Every sound is layered: a transient,
# a body, a tail; a small synthesized room; stereo; 3-8 variations a category; nothing that beeps. Written to sfx/v3
# (mix.py, sound "v3", takes a category from sfx/v3 first, then sfx/v2). The category names are the contract:
#   tick_soft, tap, dot, whoosh_cut, riser_soft          (as before, redesigned)
#   shutter       a mechanical camera shutter: mirror slap, two curtain ticks, mirror return, body resonance, room
#   swoosh_end    an airy swoosh with a tail, into a held ending (its peak is placed on the cut)
#   whoosh_through a deep fly-through whoosh (a camera move through an element)
#   card_flip     a card or a sheet flicked: a short swish and a soft landing
#   shimmer_soft  a soft glassy shimmer (light, bloom)
#   grain         one grain of sand on glass (8 variations), sand_flow a stream of fine sand that thickens
#   pulse         a soft low heartbeat (suspense), suck_in a reverse swell that ends on a hit, hit_deep the hit itself
OUT3 = os.path.join(OUT, 'v3')


def save3(path, y, peak=0.9):
    """like save(), but the first sample stays (a transient starts on its frame): only a 0.3 ms guard and a soft end"""
    y = st(np.asarray(y, dtype=np.float64)); y = y / (np.max(np.abs(y)) + 1e-9) * peak
    g = int(0.0003 * SR); y[:g] *= np.linspace(0, 1, g)[:, None]
    f = min(len(y) // 4, int(0.02 * SR)); y[-f:] *= np.linspace(1, 0, f)[:, None]
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())


def st(y): return y if y.ndim == 2 else np.stack([y, y], 1)


def fit_len(y, n):
    y = st(y)
    if len(y) >= n: return y[:n]
    return np.concatenate([y, np.zeros((n - len(y), 2))])


def put_at(buf, y, t, g=1.0):
    y = st(y); i = int(t * SR); n = min(len(y), len(buf) - i)
    if n > 0: buf[i:i + n] += y[:n] * g


def room(y, rng, wet=0.12, t60=0.25, pre=0.006, bright=6500, tail=None):
    """a small room: a few early reflections and a short decaying noise tail, different on each side"""
    y = st(y); n = int(SR * (tail or t60 * 1.3))
    out = np.zeros((len(y) + n, 2)); out[:len(y)] = y
    for ch in (0, 1):
        ir = lp(hp(rng.standard_normal(n), 300), bright) * np.exp(-6.9 * np.arange(n) / SR / t60) * 0.5
        for k in range(5):
            i = int(SR * (pre + 0.004 + rng.random() * 0.028)); ir[i] += (0.7 - 0.1 * k) * (1 if rng.random() > 0.4 else -1)
        ir[:int(SR * pre)] = 0
        ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
        w = signal.fftconvolve(y[:, ch], ir)[:len(out)]
        out[:len(w), ch] += wet * w
    return out


def modes(d, freqs, rates, gains, rng, attack=0.0006, bend=0.0):
    """damped partials (a struck body): freq Hz, decay rate 1/s, gain; a tiny pitch bend down on the strike"""
    x = tt(d); y = np.zeros(len(x))
    for f, r, g in zip(freqs, rates, gains):
        fr = f * (1 + bend * np.exp(-x * 90))
        y += g * np.sin(2 * np.pi * np.cumsum(fr) / SR + rng.random() * 6.283) * np.exp(-x * r)
    return y * (1 - np.exp(-x / attack))


def burst(rng, d, lo, hi, rate, order=2):
    x = tt(d); return bp(rng.standard_normal(len(x)), lo, hi, order) * np.exp(-x * rate)


def sat(y, drive=1.4): return np.tanh(y * drive) / np.tanh(drive)


def lay(*ys):
    """layers of different lengths, summed from their start"""
    z = np.zeros(max(len(y) for y in ys))
    for y in ys: z[:len(y)] += y
    return z


def widen(y, rng, ms=0.3):
    """mono → stereo: a tiny delay on one side and a little decorrelated air"""
    y = np.asarray(y); k = max(1, int(ms * SR / 1000)); r = np.concatenate([np.zeros(k), y[:-k]])
    air = hp(rng.standard_normal(len(y)), 5000) * np.abs(signal.hilbert(y)) * 0.12
    return np.stack([y + air * 0.5, r - air * 0.5], 1)


def air_sweep(rng, d, f0, f1, f2, peak, q=1.4, hi=0.25, low=0.35, low_fc=420):
    """a layered whoosh: a moving band of air, a low body and a breathy top, peaking at `peak` (0..1)"""
    n = int(SR * d); x = np.linspace(0, 1, n)
    fc = np.where(x < peak, f0 + (f1 - f0) * np.clip(x / peak, 0, 1) ** 1.6, f1 + (f2 - f1) * np.clip((x - peak) / (1 - peak), 0, 1) ** 0.7)
    e = env_ad(n, 0, 5.0, peak)
    a = svf_bp(rng.standard_normal(n), fc, q) * e
    a2 = svf_bp(rng.standard_normal(n), fc * 1.9, q * 0.8) * e * 0.35
    body = lp(rng.standard_normal(n), low_fc) * env_ad(n, 0, 4.0, min(0.95, peak + 0.05)) * low
    top = hp(rng.standard_normal(n), 6500) * env_ad(n, 0, 7.0, peak) ** 1.5 * hi
    return a + a2 + body + top


def main_v3():
    os.makedirs(OUT3, exist_ok=True)
    rng = np.random.default_rng(36015)
    count = {}
    def put(cat, i, y, peak=0.9): save3(os.path.join(OUT3, '%s_%d.wav' % (cat, i)), y, peak); count[cat] = count.get(cat, 0) + 1

    # ---- shutter: the mirror goes up (a slap with a body), the two curtains tick, the mirror comes back, a breath of motor
    for i in range(5):
        k = 1 + (-0.06, -0.025, 0.0, 0.03, 0.065)[i]
        d = 0.26; y = np.zeros(int(SR * d))
        def slap(t, g, kk, low, bright=1.0):
            b = lay(burst(rng, 0.012, 1500, 7500, 560) * 0.8, burst(rng, 0.004, 4500, 11000, 2000) * 0.35, burst(rng, 0.018, 1100, 3200, 330) * 0.55)
            m = modes(0.1, [455 * kk, 800 * kk, 1340 * kk, 1820 * kk, 2280 * kk, 3450 * kk], [58, 80, 115, 150, 190, 300], [1.0, 0.62, 0.55, 0.34, 0.3, 0.1], rng, bend=0.04)
            th = modes(0.09, [low, low * 1.9], [44, 66], [0.7, 0.3], rng, attack=0.0015, bend=0.25)
            n = max(len(b), len(m), len(th)); z = np.zeros(n); z[:len(b)] += b * 0.75 * bright; z[:len(m)] += m * 0.95; z[:len(th)] += th * 0.7
            j = int(t * SR); y[j:j + n] += z[:len(y) - j] * g
        slap(0.0, 1.0, k, 190)
        for t, g in ((0.017 + 0.003 * i, 0.5), (0.041 + 0.004 * i, 0.42)):  # the curtains
            c = burst(rng, 0.006, 2600, 9500, 1400) + modes(0.012, [2900 * k, 4700 * k], [520, 700], [0.4, 0.2], rng)[:int(0.006 * SR)]
            j = int(t * SR); y[j:j + len(c)] += c * g * 0.6
        slap(0.064 + 0.005 * i, 0.62, k * 0.9, 165, bright=0.5)
        x = tt(0.085); whirr = bp(rng.standard_normal(len(x)), 650, 2600) * (0.6 + 0.4 * np.sin(2 * np.pi * (84 + 6 * i) * x)) * np.sin(np.pi * x / 0.085) ** 2
        j = int(0.008 * SR); y[j:j + len(whirr)] += whirr * 0.07
        put('shutter', i, room(widen(lp(sat(y, 1.6), 10500), rng, 0.25), rng, wet=0.1, t60=0.16, bright=6000), 0.85)

    # ---- tick_soft: a small dry "tk": a click, a tiny wooden-glassy body, a little room
    for i in range(6):
        k = 1 + 0.045 * (i - 2.5)
        y = np.zeros(int(SR * 0.07))
        c = burst(rng, 0.004, 3800, 11000, 1800) * 0.8
        m = modes(0.06, [2050 * k, 3320 * k, 5150 * k, 620 * k], [240, 320, 460, 280], [0.5, 0.3, 0.16, 0.22], rng, bend=0.03)
        y[:len(c)] += c; y[:len(m)] += m
        put('tick_soft', i, room(widen(y, rng, 0.15), rng, wet=0.07, t60=0.1, bright=8000), 0.5)

    # ---- tap: a felt mallet on a wooden surface: thud, body partials, a little contact noise, room
    for i in range(6):
        k = 1 + 0.06 * (i - 2.5)
        y = np.zeros(int(SR * 0.2))
        th = lp(rng.standard_normal(int(SR * 0.012)), 1400) * np.exp(-tt(0.012) * 380)
        m = modes(0.2, [168 * k, 292 * k, 515 * k, 880 * k, 1420 * k], [30, 42, 68, 105, 170], [1.0, 0.6, 0.36, 0.2, 0.1], rng, attack=0.001, bend=0.12)
        ct = burst(rng, 0.008, 1600, 4800, 520) * 0.22
        y[:len(th)] += th * 0.6; y[:len(m)] += m; y[:len(ct)] += ct
        put('tap', i, room(widen(sat(y, 1.3), rng, 0.2), rng, wet=0.1, t60=0.2, bright=5000), 0.7)

    # ---- dot: a soft mallet on glass: inharmonic partials, a slow beat between the sides, a breath of air
    for i, f in enumerate((1568.0, 1760.0, 1975.5, 2093.0)):
        d = 0.95; x = tt(d)
        def glass(ff):
            return sum(g * np.sin(2 * np.pi * ff * r * x + ph) * np.exp(-x * dc) for r, g, dc, ph in ((1, 1.0, 5.5, 0), (2.76, 0.42, 9, 1.3), (5.4, 0.18, 15, 2.1), (8.93, 0.07, 24, 0.4))) * (1 - np.exp(-x / 0.004))
        l, r = glass(f), glass(f * 1.0035)
        br = hp(rng.standard_normal(len(x)), 5200) * np.exp(-x * 160) * 0.07
        put('dot', i, room(np.stack([l + br, r + br], 1), rng, wet=0.16, t60=0.55, bright=7000), 0.5)

    # ---- whoosh_cut: a transition: air that swells into the cut (peak at ~70 %) and lets go fast, with a short tail
    for i in range(5):
        y = air_sweep(rng, 0.52 + 0.05 * i, 240 + 40 * i, 3000 + 260 * i, 1000, 0.7, q=1.6)
        put('whoosh_cut', i, room(pan_sweep(y, -0.55, 0.55), rng, wet=0.14, t60=0.3), 0.75)

    # ---- swoosh_end: into a held ending: a longer airy swoosh, a soft low body, a tail that stays in the room
    for i in range(4):
        y = air_sweep(rng, 1.05 + 0.08 * i, 300, 5200 + 300 * i, 1400, 0.6, q=1.3, hi=0.32, low=0.3)
        put('swoosh_end', i, room(pan_sweep(y, -0.65 + 0.1 * i, 0.65), rng, wet=0.26, t60=0.7, bright=5500), 0.8)

    # ---- whoosh_through: the camera flies through something: a deep body, a wide sweep, a long tail
    for i in range(3):
        d = 1.05 + 0.1 * i; n = int(SR * d); x = np.linspace(0, 1, n)
        y = air_sweep(rng, d, 180, 6500 + 400 * i, 800, 0.64, q=1.2, hi=0.3, low=0.55, low_fc=300)
        sub = np.sin(2 * np.pi * np.cumsum(78 - 34 * x) / SR) * env_ad(n, 0, 4.0, 0.66) * 0.5
        sub += 0.3 * np.sin(2 * np.pi * np.cumsum(2 * (78 - 34 * x)) / SR) * env_ad(n, 0, 4.5, 0.66) * 0.5
        put('whoosh_through', i, room(pan_sweep(y, -0.7, 0.7) + st(sub), rng, wet=0.24, t60=0.8, bright=5000), 0.85)

    # ---- riser_soft: a build: rising air with a quickening flutter and a faint glassy cluster, ends open
    for i in range(3):
        d = 1.1 + 0.2 * i; n = int(SR * d); x = np.linspace(0, 1, n)
        trem = 1 - 0.28 * (0.5 + 0.5 * np.sin(2 * np.pi * np.cumsum(6 + 14 * x ** 2) / SR)) * x
        a = svf_bp(rng.standard_normal(n), 420 + 6200 * x ** 1.7, 1.5) * x ** 2.1 * trem
        cl = sum(np.sin(2 * np.pi * np.cumsum(f * (1 + 0.5 * x ** 1.5)) / SR + rng.random() * 6.28) for f in (523.3, 784.0, 1046.5, 1318.5)) * x ** 2.6 * 0.05
        low = lp(rng.standard_normal(n), 900) * x ** 3 * 0.25
        y = a * 0.8 + cl + low; y[-int(0.03 * SR):] *= np.linspace(1, 0, int(0.03 * SR))
        put('riser_soft', i, room(pan_sweep(y, -0.35, 0.35), rng, wet=0.22, t60=0.45), 0.6)

    # ---- card_flip: a card flicked through the air and set down
    for i in range(4):
        n = int(SR * 0.11); x = np.linspace(0, 1, n)
        sw = svf_bp(rng.standard_normal(n), 1500 + 4200 * np.sin(np.pi * x) ** 1.2 + 300 * i, 1.8) * env_ad(n, 0, 5, 0.42)
        y = np.zeros(int(SR * 0.24)); y[:n] += sw * 0.8
        land = modes(0.12, [215 + 14 * i, 392 + 20 * i, 760], [55, 80, 130], [0.6, 0.3, 0.14], rng, attack=0.001, bend=0.1) + np.pad(burst(rng, 0.006, 1800, 5200, 600) * 0.2, (0, int(SR * 0.12) - int(SR * 0.006)))
        j = int(0.085 * SR); y[j:j + len(land)] += land[:len(y) - j] * 0.55
        put('card_flip', i, room(pan_sweep(y, -0.3 + 0.2 * i, 0.3 - 0.2 * i), rng, wet=0.1, t60=0.2), 0.65)

    # ---- shimmer_soft: light on glass: a few high partials that bloom and fade, air around them
    for i in range(3):
        d = 1.1; x = tt(d); e = (1 - np.exp(-x / 0.07)) * np.exp(-x * 3.2)
        fs = np.array([2637, 3136, 3951, 4699, 6272]) * (1 + 0.03 * i)
        l = sum(np.sin(2 * np.pi * f * (1 + 0.002 * rng.standard_normal()) * x + rng.random() * 6.28) * g for f, g in zip(fs, (1, 0.7, 0.5, 0.35, 0.2)))
        r = sum(np.sin(2 * np.pi * f * (1 + 0.002 * rng.standard_normal()) * x + rng.random() * 6.28) * g for f, g in zip(fs, (1, 0.7, 0.5, 0.35, 0.2)))
        air = hp(rng.standard_normal(len(x)), 7500) * e * 0.5
        put('shimmer_soft', i, room(np.stack([l * e + air, r * e + air], 1), rng, wet=0.3, t60=0.8, bright=8000), 0.45)

    # ---- grain: one grain of sand lands on glass: a hair-thin click, a tiny bright ring, a smaller bounce
    for i in range(8):
        k = 1 + 0.07 * (i - 3.5)
        y = np.zeros(int(SR * 0.09))
        def one(g, kk):
            c = hp(rng.standard_normal(int(SR * 0.0012)), 4500) * np.exp(-tt(0.0012) * 3500)
            m = modes(0.02, [5900 * kk, 8300 * kk, 11200 * kk, 2400 * kk], [850, 1100, 1500, 700], [0.6, 0.4, 0.2, 0.25], rng, attack=0.0002)
            z = np.zeros(len(m)); z[:len(c)] += c; return (z + m) * g
        a = one(1.0, k); y[:len(a)] += a
        j = int((0.02 + 0.022 * rng.random()) * SR); b = one(0.32, k * 1.12); y[j:j + len(b)] += b
        if i % 2: j2 = j + int((0.012 + 0.01 * rng.random()) * SR); c2 = one(0.14, k * 1.2); y[j2:j2 + len(c2)] += c2[:len(y) - j2]
        pan = (rng.random() * 2 - 1) * 0.45
        put('grain', i, room(np.stack([y * np.cos((pan + 1) * np.pi / 4), y * np.sin((pan + 1) * np.pi / 4)], 1), rng, wet=0.14, t60=0.1, bright=9000), 0.5)

    # ---- sand_flow: a stream of fine sand that thickens: many tiny grains and a soft hiss under them
    for i in range(3):
        d = 2.0; n = int(SR * d); x = np.linspace(0, 1, n); y = np.zeros((n, 2))
        t = 0.0
        while t < d - 0.02:
            rate = 30 + 240 * (t / d) ** 1.4; t += rng.exponential(1 / rate)
            if t >= d - 0.01: break
            m = int(SR * 0.004); g = hp(rng.standard_normal(m), 3800 + 2500 * rng.random()) * np.exp(-tt(0.004) * (1400 + 900 * rng.random())) * (0.3 + 0.7 * rng.random())
            pn = rng.random(); j = int(t * SR); y[j:j + m, 0] += g[:n - j] * np.cos(pn * np.pi / 2); y[j:j + m, 1] += g[:n - j] * np.sin(pn * np.pi / 2)
        hiss = bp(rng.standard_normal(n), 3800, 10500) * (0.15 + 0.85 * x ** 1.3) * 0.16
        y += np.stack([hiss, np.roll(hiss, 37)], 1)
        fade = int(0.06 * SR); y[:fade] *= np.linspace(0, 1, fade)[:, None]; y[-fade:] *= np.linspace(1, 0, fade)[:, None]
        put('sand_flow', i, room(y, rng, wet=0.1, t60=0.15, bright=9000), 0.5)

    # ---- pulse: a soft low heartbeat (it carries a second partial, so a phone can play it)
    for i in range(3):
        d = 0.42; x = tt(d); f0 = 58 + 4 * i
        fr = f0 * (1 + 0.35 * np.exp(-x * 30))
        y = (np.sin(2 * np.pi * np.cumsum(fr) / SR) + 0.38 * np.sin(2 * np.pi * np.cumsum(2 * fr) / SR) + 0.12 * np.sin(2 * np.pi * np.cumsum(3 * fr) / SR)) * (1 - np.exp(-x / 0.006)) * np.exp(-x * 13)
        y += lp(rng.standard_normal(len(x)), 320) * np.exp(-x * 90) * 0.25
        put('pulse', i, room(st(sat(y, 1.2)), rng, wet=0.08, t60=0.25, bright=1800), 0.8)

    # ---- suck_in: a reverse swell that ends dead on the hit (mix.py places its peak on the cut)
    for i in range(3):
        d = 0.75 + 0.12 * i; n = int(SR * d); x = np.linspace(0, 1, n)
        a = svf_bp(rng.standard_normal(n), 300 + 5200 * x ** 2.2, 1.3) * np.exp(5.2 * (x - 1))
        tone = sum(np.sin(2 * np.pi * np.cumsum(f * (0.8 + 0.2 * x)) / SR) for f in (196, 293.7, 392)) * np.exp(6 * (x - 1)) * 0.07
        low = lp(rng.standard_normal(n), 500) * np.exp(4.5 * (x - 1)) * 0.4
        y = a + tone + low; y[-int(0.004 * SR):] *= np.linspace(1, 0, int(0.004 * SR))
        put('suck_in', i, pan_sweep(y, -0.2, 0.2) + st(np.zeros(n)), 0.8)

    # ---- hit_deep: the hit: a punch, a sub that falls, a slam of air, a long wash that stays in the room
    for i in range(3):
        d = 2.0; x = tt(d); n = len(x)
        sub = np.sin(2 * np.pi * np.cumsum(36 + (62 + 4 * i) * np.exp(-x * 5.5)) / SR) * np.exp(-x * 2.8)
        sub += 0.34 * np.sin(2 * np.pi * np.cumsum(2 * (36 + (62 + 4 * i) * np.exp(-x * 5.5))) / SR) * np.exp(-x * 3.6)
        punch = np.sin(2 * np.pi * np.cumsum(52 + 150 * np.exp(-x * 42)) / SR) * np.exp(-x * 17)
        slam = np.zeros(n); b1 = burst(rng, 0.06, 180, 3800, 55); b2 = burst(rng, 0.012, 2500, 11000, 420)
        slam[:len(b1)] += b1; slam[:len(b2)] += b2 * 0.6
        dry = st(sat(sub * 0.9 + punch * 0.8 + slam * 0.55, 1.7))
        wash = hp(rng.standard_normal(n), 2200) * np.exp(-x * 9) * 0.5
        y = room(dry + pan_sweep(wash, -0.4, 0.4), rng, wet=0.5, t60=1.5, bright=4800, tail=1.6)
        put('hit_deep', i, y, 0.95)

    print('v3 (premium): ' + ', '.join('%s×%d' % kv for kv in count.items()) + ' → ' + OUT3)


if __name__ == '__main__':
    main_v3() if '--v3' in sys.argv else main()
