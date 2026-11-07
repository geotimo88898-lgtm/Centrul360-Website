#!/usr/bin/env python3
"""The sound of a film: the voice lines at their times, a sound effect on each animation, the music bed under it
all (lower while she speaks). Reads films/<id>/build/film.json (written by render.cjs) and timing.json.
  python3 mix.py <film>  →  films/<id>/build/audio.wav (48 kHz stereo, -16 LUFS)"""
import json, os, subprocess, sys, wave, glob
import numpy as np

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))


def read(path):
    with wave.open(path) as w:
        n, ch, sr = w.getnframes(), w.getnchannels(), w.getframerate()
        y = np.frombuffer(w.readframes(n), '<i2').astype(np.float32) / 32768
    if ch == 2:
        y = y.reshape(-1, 2)
    else:
        y = np.stack([y, y], 1)
    if sr != SR:
        x = np.arange(0, len(y), sr / SR)
        y = np.stack([np.interp(x, np.arange(len(y)), y[:, c]) for c in (0, 1)], 1)
    return y


def add(buf, y, t, g=1.0, pan=0.0):
    i = int(round(t * SR))
    if i < 0:
        y = y[-i:]; i = 0
    j = min(len(buf), i + len(y))
    if j <= i: return
    l, r = (1 - max(0, pan)) * g, (1 + min(0, pan)) * g
    buf[i:j, 0] += y[:j - i, 0] * l
    buf[i:j, 1] += y[:j - i, 1] * r


def main():
    film = sys.argv[1]
    base = os.path.join(HERE, '..', 'films', film)
    F = json.load(open(os.path.join(base, 'build', 'film.json')))
    TIM = json.load(open(os.path.join(base, 'timing.json')))
    total = F['total']
    n = int(total * SR) + SR
    voice = np.zeros((n, 2), np.float32)
    fx = np.zeros((n, 2), np.float32)
    for b in F['beats']:
        tm = TIM.get(b['key'])
        if not tm: continue
        add(voice, read(os.path.join(base, tm['file'])), b['t0'], 1.0)
    # sound effects: not two of the same within 90 ms, a little to the left or right so they breathe
    cache, last = {}, {}
    GAIN = {'pop': 0.4, 'pop2': 0.5, 'soft': 0.35, 'swish': 0.3, 'whoosh': 0.28, 'zoom': 0.3, 'check': 0.4, 'ding': 0.4, 'blip': 0.4,
            'bubble': 0.5, 'bubble2': 0.5, 'alert': 0.38, 'count': 0.5, 'pen': 0.6, 'paper': 0.3, 'rise': 0.55, 'shimmer': 0.4, 'shutter': 0.55}
    k = 0
    for c in F['cues']:
        s = c['sfx']
        if s not in cache:
            p = os.path.join(HERE, 'sfx', s + '.wav')
            if not os.path.exists(p): continue
            cache[s] = read(p)
        if c['t'] - last.get(s, -9) < 0.09: continue
        last[s] = c['t']; k += 1
        add(fx, cache[s], c['t'], GAIN.get(s, 0.45) * c.get('gain', 1), pan=((k % 5) - 2) * 0.08)
    # music: the clips chained with 3 s crossfades, from a different start for every film
    beds = sorted(glob.glob(os.path.join(HERE, 'music', 'bed*.wav')))
    music = np.zeros((n, 2), np.float32)
    if beds:
        off = sum(map(ord, film)) % len(beds)
        order = beds[off:] + beds[:off]
        t, i, XF = 0.0, 0, 3.0
        while t < total + 1:
            y = read(order[i % len(order)])
            y = y[: len(y) - int(0.4 * SR)]  # the clip's own tail fade
            m = int(XF * SR)
            env = np.ones(len(y), np.float32)
            env[:m] = np.linspace(0, 1, m) if t > 0 else 1
            env[-m:] = np.linspace(1, 0, m)
            add(music, y * env[:, None], t, 1.0)
            t += len(y) / SR - XF; i += 1
        # quieter while she speaks (smooth)
        act = np.abs(voice[:, 0])
        hop = 480
        frames = act[: len(act) // hop * hop].reshape(-1, hop).max(1)
        on = (frames > 0.02).astype(np.float32)
        # hold, then smooth: 150 ms attack, 600 ms release
        g = np.zeros_like(on); z = 0.0
        for j, v in enumerate(on):
            z = z + (v - z) * (0.5 if v > z else 0.06); g[j] = z
        duck = 1 - 0.45 * np.repeat(g, hop)
        duck = np.concatenate([duck, np.full(n - len(duck), duck[-1] if len(duck) else 1)])
        music *= (0.2 * duck)[:, None]
        fi, fo = int(1.2 * SR), int(3.5 * SR)
        music[:fi] *= np.linspace(0, 1, fi)[:, None]
        end = int(total * SR)
        music[end - fo:end] *= np.linspace(1, 0, fo)[:, None]
        music[end:] = 0
    out = voice + fx * 0.62 + music
    out = out[: int((total + 0.3) * SR)]
    build = os.path.join(base, 'build')
    raw = os.path.join(build, 'audio.raw.wav')
    with wave.open(raw, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(out / max(1.0, np.max(np.abs(out)) * 1.05), -1, 1) * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', str(SR), os.path.join(build, 'audio.wav')], check=True)
    os.remove(raw)
    print(f'{film}: audio {total:.1f} s, {len(F["beats"])} lines, {k} sound effects, music {"on" if beds else "off"}')


if __name__ == '__main__':
    main()
