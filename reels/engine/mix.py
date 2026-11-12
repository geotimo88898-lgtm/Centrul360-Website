#!/usr/bin/env python3
"""Sunetul unui reel: vocea la timpii ei, un efect pe fiecare animație (cârligul: hit + whoosh pe primele cuvinte),
muzica pop dedesubt (mai încet cât vorbește). Citește scripts/<id>/build/film.json (de la render.cjs) și timing.json.
  python3 mix.py <id>  →  scripts/<id>/build/audio.wav (48 kHz stereo, -14 LUFS, cum le vor rețelele)"""
import json, os, subprocess, sys, wave, glob, zlib
import numpy as np

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
SFX_DIRS = [os.path.join(HERE, 'sfx'), os.path.join(HERE, '..', '..', 'academy-vsl', 'src', 'engine', 'sfx')]


def read(path):
    with wave.open(path) as w:
        n, ch, sr = w.getnframes(), w.getnchannels(), w.getframerate()
        y = np.frombuffer(w.readframes(n), '<i2').astype(np.float32) / 32768
    y = y.reshape(-1, 2) if ch == 2 else np.stack([y, y], 1)
    if sr != SR:
        x = np.arange(0, len(y), sr / SR)
        y = np.stack([np.interp(x, np.arange(len(y)), y[:, c]) for c in (0, 1)], 1)
    return y


def add(buf, y, t, g=1.0, pan=0.0):
    i = int(round(t * SR))
    if i < 0: y = y[-i:]; i = 0
    j = min(len(buf), i + len(y))
    if j <= i: return
    buf[i:j, 0] += y[:j - i, 0] * (1 - max(0, pan)) * g
    buf[i:j, 1] += y[:j - i, 1] * (1 + min(0, pan)) * g


def main():
    rid = sys.argv[1]
    base = os.path.join(HERE, '..', 'scripts', rid)
    F = json.load(open(os.path.join(base, 'build', 'film.json')))
    TIM = json.load(open(os.path.join(base, 'timing.json')))
    total = F['total']
    n = int(total * SR) + SR
    voice, fx, music = (np.zeros((n, 2), np.float32) for _ in range(3))
    for b in F['beats']:
        tm = TIM.get(b['key'])
        if tm: add(voice, read(os.path.join(base, tm['file'])), b['t0'], 1.0)
    GAIN = {'pop': 0.4, 'pop2': 0.5, 'soft': 0.35, 'swish': 0.3, 'whoosh': 0.32, 'zoom': 0.3, 'check': 0.4, 'ding': 0.4, 'blip': 0.35,
            'bubble': 0.5, 'bubble2': 0.5, 'alert': 0.38, 'count': 0.5, 'pen': 0.5, 'paper': 0.3, 'rise': 0.5, 'shimmer': 0.4, 'shutter': 0.55,
            'hit': 0.85, 'riser': 0.5}
    cache, last, k = {}, {}, 0
    for c in F['cues']:
        s = c['sfx']
        if s not in cache:
            p = next((os.path.join(d, s + '.wav') for d in SFX_DIRS if os.path.exists(os.path.join(d, s + '.wav'))), None)
            if not p: continue
            cache[s] = read(p)
        if c['t'] - last.get(s, -9) < 0.09: continue
        last[s] = c['t']; k += 1
        add(fx, cache[s], c['t'], GAIN.get(s, 0.45) * c.get('gain', 1), pan=((k % 5) - 2) * 0.08)
    beds = sorted(glob.glob(os.path.join(HERE, 'music', 'pop*.wav')))
    if beds:
        order = beds[zlib.crc32(rid.encode()) % len(beds):] + beds[:zlib.crc32(rid.encode()) % len(beds)]
        t, i, XF = 0.0, 0, 2.0
        while t < total + 1:  # one clip is ~32 s; longer reels chain the next with a crossfade
            y = read(order[i % len(order)])[: -int(0.3 * SR)]
            m = int(XF * SR); env = np.ones(len(y), np.float32)
            if t > 0: env[:m] = np.linspace(0, 1, m)
            env[-m:] = np.minimum(env[-m:], np.linspace(1, 0, m))
            add(music, y * env[:, None], t, 1.0)
            t += len(y) / SR - XF; i += 1
        act = np.abs(voice[:, 0]); hop = 480
        on = (act[: len(act) // hop * hop].reshape(-1, hop).max(1) > 0.02).astype(np.float32)
        g = np.zeros_like(on); z = 0.0
        for j, v in enumerate(on):
            z = z + (v - z) * (0.5 if v > z else 0.08); g[j] = z
        duck = 1 - 0.5 * np.repeat(g, hop)
        duck = np.concatenate([duck, np.full(n - len(duck), duck[-1] if len(duck) else 1)])
        music *= (0.3 * duck)[:, None]
        fo = int(1.5 * SR); end = int(total * SR)
        music[:int(0.05 * SR)] *= np.linspace(0, 1, int(0.05 * SR))[:, None]  # the beat is there from the first frame
        music[end - fo:end] *= np.linspace(1, 0, fo)[:, None]; music[end:] = 0
    out = (voice + fx * 0.62 + music)[: int((total + 0.1) * SR)]
    build = os.path.join(base, 'build'); raw = os.path.join(build, 'audio.raw.wav')
    with wave.open(raw, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(out / max(1.0, np.max(np.abs(out)) * 1.05), -1, 1) * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', str(SR), os.path.join(build, 'audio.wav')], check=True)
    os.remove(raw)
    print(f'{rid}: audio {total:.1f} s, {len(F["beats"])} lines, {k} sound effects, music {"on" if beds else "off"}')


if __name__ == '__main__':
    main()
