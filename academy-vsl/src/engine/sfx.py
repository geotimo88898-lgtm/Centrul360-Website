#!/usr/bin/env python3
"""The sound effects, synthesized (no samples): light, clean, short. python3 sfx.py → sfx/<name>.wav (48 kHz mono)."""
import os, wave
import numpy as np

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'sfx')
rng = np.random.default_rng(7)


def t(d):
    return np.arange(int(SR * d)) / SR


def env(n, a=0.004, d=None, curve=6.0):
    x = np.arange(n) / SR
    att = np.clip(x / max(a, 1e-4), 0, 1)
    dec = np.exp(-curve * x / (d or (n / SR)))
    return att * dec


def tone(f, d, a=0.003, curve=7.0, harm=((1, 1.0),), f_end=None):
    x = t(d)
    if f_end is None:
        ph = 2 * np.pi * f * x
    else:
        fr = f * (f_end / f) ** (x / d)
        ph = 2 * np.pi * np.cumsum(fr) / SR
    y = sum(g * np.sin(k * ph) for k, g in harm)
    return y * env(len(x), a, d, curve)


def lp(y, fc):  # one-pole low pass; fc may be an array
    a = np.exp(-2 * np.pi * np.broadcast_to(fc, y.shape) / SR)
    out = np.empty_like(y); z = 0.0
    for i in range(len(y)):
        z = (1 - a[i]) * y[i] + a[i] * z; out[i] = z
    return out


def hp(y, fc):
    return y - lp(y, fc)


def bp(y, lo, hi):
    return lp(hp(y, lo), hi)


def noise(d):
    return rng.standard_normal(int(SR * d))


def marimba(f, d=0.35, g=1.0):
    return g * tone(f, d, 0.002, 9, ((1, 1.0), (4, 0.18), (10, 0.05)))


def cat(*parts, gap=0.0):
    out = np.zeros(0)
    for p in parts:
        out = np.concatenate([out, p, np.zeros(int(SR * gap))])
    return out


def mix(*items):  # (signal, offset s)
    n = max(int(o * SR) + len(s) for s, o in items)
    out = np.zeros(n)
    for s, o in items:
        i = int(o * SR); out[i:i + len(s)] += s
    return out


def fades(y, fi=0.003, fo=0.02):
    n = len(y); a = int(fi * SR); b = int(fo * SR)
    if a: y[:a] *= np.linspace(0, 1, a)
    if b: y[-b:] *= np.linspace(1, 0, b)
    return y


def norm(y, peak):
    m = np.max(np.abs(y)) or 1
    return y / m * peak


S = {}
S['pop'] = norm(tone(560, 0.11, 0.003, 8, ((1, 1), (2, 0.08)), f_end=300), 0.42)
S['pop2'] = norm(mix((tone(480, 0.16, 0.001, 7, ((1, 1), (2, 0.2)), f_end=220), 0), (marimba(1568, 0.3, 0.25), 0.03)), 0.55)
S['soft'] = norm(tone(1250, 0.05, 0.001, 9) * 0.6 + 0.4 * bp(noise(0.05), 2000, 6000) * env(int(SR * .05), 0.001, 0.02, 9), 0.22)
x = t(0.34); fc = 300 + 2600 * np.sin(np.pi * x / 0.34) ** 2
S['swish'] = norm(fades(lp(hp(noise(0.34), 300), fc) * np.sin(np.pi * x / 0.34) ** 2, 0.01, 0.05), 0.22)
x = t(0.62); fc = 200 + 1800 * np.sin(np.pi * (x / 0.62) ** 0.8) ** 2
S['whoosh'] = norm(fades(lp(hp(noise(0.62), 120), fc) * np.sin(np.pi * (x / 0.62) ** 0.7) ** 3, 0.01, 0.08), 0.25)
x = t(0.36); fc = 250 + 2400 * (x / 0.36) ** 2
S['zoom'] = norm(fades(lp(hp(noise(0.36), 250), fc) * np.sin(np.pi * x / 0.36) ** 2, 0.01, 0.06), 0.2)
S['check'] = norm(mix((tone(1046.5, 0.3, 0.005, 7, ((1, 1), (2, 0.1))), 0), (tone(1568, 0.5, 0.005, 6, ((1, 1), (2, 0.1))), 0.08)), 0.3)
S['ding'] = norm(tone(1318.5, 0.7, 0.003, 6.5, ((1, 1), (2.0, 0.18), (3.0, 0.05))), 0.26)
S['blip'] = norm(tone(660, 0.09, 0.008, 8), 0.14)
S['bubble'] = norm(mix((tone(880, 0.09, 0.002, 7, f_end=1100), 0), (tone(1320, 0.12, 0.002, 7, f_end=1600), 0.07)), 0.36)
S['bubble2'] = norm(mix((tone(880, 0.09, 0.004, 7, f_end=760), 0), (tone(660, 0.13, 0.004, 7, f_end=600), 0.07)), 0.34)
S['alert'] = norm(mix((marimba(523.25, 0.4), 0), (marimba(392, 0.55), 0.12)), 0.5)
ticks = [(tone(1200, 0.03, 0.002, 9), 1.2 * (1 - (1 - k / 9) ** 2)) for k in range(9)]
S['count'] = norm(mix(*ticks, (tone(1046.5, 0.6, 0.005, 6, ((1, 1), (2, 0.08))), 1.25)), 0.2)
x = t(0.5); am = 0.5 + 0.5 * np.sin(2 * np.pi * 17 * x) ** 2
S['pen'] = norm(fades(bp(noise(0.5), 900, 2600) * am * np.sin(np.pi * x / 0.5) ** 1.5, 0.02, 0.08), 0.07)
x = t(0.42)
S['paper'] = norm(fades(bp(noise(0.42), 400, 2200) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 6 * x))) * np.exp(-5 * x), 0.02, 0.08), 0.18)
x = t(1.3); fr = 200 * (8 ** (x / 1.3))
S['rise'] = 0.6 * norm(fades(lp(hp(noise(1.3), 300), 300 + 5000 * (x / 1.3) ** 2) * (x / 1.3) ** 2 + 0.25 * np.sin(2 * np.pi * np.cumsum(fr) / SR) * (x / 1.3) ** 3, 0.05, 0.08), 0.35)
S['shimmer'] = norm(mix(*[(tone(f, 1.2, 0.01, 5, ((1, 1), (2, 0.06))) * (0.9 - 0.15 * i), 0.09 * i) for i, f in enumerate([783.99, 1046.5, 1318.5])]), 0.26)
S['shutter'] = norm(mix((tone(1250, 0.05, 0.001, 9) * 0.6 + 0.4 * bp(noise(0.05), 1500, 4000) * env(int(SR * .05), 0.001, 0.02, 9), 0), (tone(900, 0.06, 0.001, 9) * 0.6, 0.07)), 0.24)

os.makedirs(OUT, exist_ok=True)
for k, y in S.items():
    y = np.clip(y, -1, 1)
    with wave.open(os.path.join(OUT, k + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((y * 32767).astype('<i2').tobytes())
print(len(S), 'sounds →', OUT)
