#!/usr/bin/env python3
"""Sunetele reels-urilor. Refolosește sunetele sintetizate ale Academiei (academy-vsl/src/engine/sfx.py → sfx/ acolo)
și adaugă aici cârligul sonor: `hit` (lovitură scurtă, joasă, cu un pocnet curat) și `riser` (urcare scurtă, 0,5 s),
puse pe primele cuvinte ale fiecărui reel.  python3 sfx.py → sfx/hit.wav, sfx/riser.wav (48 kHz mono)"""
import os, subprocess, wave
import numpy as np

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'sfx')
ACADEMY = os.path.join(HERE, '..', '..', 'academy-vsl', 'src', 'engine')
rng = np.random.default_rng(360)


def save(name, y, peak=0.9):
    y = y / (np.max(np.abs(y)) + 1e-9) * peak
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())


def lp(y, fc):
    a = np.exp(-2 * np.pi * fc / SR); out = np.zeros_like(y); z = 0.0
    for i, v in enumerate(y):
        z = (1 - a) * v + a * z; out[i] = z
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    if not os.path.exists(os.path.join(ACADEMY, 'sfx', 'pop.wav')):
        subprocess.run(['python3', os.path.join(ACADEMY, 'sfx.py')], check=True)
    # hit: a pitched-down sine thump (110 → 42 Hz) + a short bright click + a little noise tail
    d = 0.55; x = np.arange(int(SR * d)) / SR
    f = 42 + 68 * np.exp(-x * 18)
    thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x * 7.5)
    click = rng.standard_normal(len(x)) * np.exp(-x * 160) * 0.5
    tail = lp(rng.standard_normal(len(x)), 2500) * np.exp(-x * 14) * 0.35
    save('hit', thump + click + tail)
    # riser: filtered noise + a rising tone, 0.5 s, ends abruptly (the hit lands on its end)
    d = 0.5; x = np.arange(int(SR * d)) / SR
    env = (x / d) ** 2.2
    tone = np.sin(2 * np.pi * np.cumsum(300 + 900 * (x / d) ** 2) / SR) * 0.35
    noise = lp(rng.standard_normal(len(x)), 4000) * 0.8
    save('riser', (tone + noise) * env, 0.6)
    print('hit, riser →', OUT)


if __name__ == '__main__':
    main()
