#!/usr/bin/env python3
"""Sunetul unui reel: vocea la timpii ei, efectele pe animații, muzica dedesubt (mai încet cât vorbește), -14 LUFS.
Citește scripts/<id>/build/film.json (de la render.cjs) și timing.json.
  python3 mix.py <id>  →  scripts/<id>/build/audio.wav (48 kHz stereo, -14 LUFS integrat, vârf real ≤ -1.5 dBTP)
v1: ca înainte (efectele Academiei + hit/riser, muzica pop).
v2 (film.v == 2): efectele din sfx/v2 pe categorii (motorul le pune din animații): pentru fiecare se alege o variantă
(niciodată aceeași de două ori la rând), un ton (±5 %) și un nivel (±1,5 dB), după aroma temei (film.sfx); prea multe
în aceeași clipă se răresc (cele mai importante rămân: lovituri, tranziții, riser), țintă 1-3 pe secundă (tastele nu
se numără). Muzica: starea temei (film.music, music/<stare>NN.wav), coborâtă sub voce (sidechain), fără fade la final
când reel-ul e buclă. Loudness: loudnorm în două treceri."""
import json, os, subprocess, sys, wave, glob, zlib, re
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


def loudnorm(raw, out, I=-14, TP=-1.5):
    """two passes: measure, then normalise with the measured values (linear when possible)"""
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', raw, '-af', 'loudnorm=I=%d:TP=%.1f:LRA=11:print_format=json' % (I, TP), '-f', 'null', '-'], capture_output=True, text=True)
    m = json.loads(re.findall(r'\{[^{}]*\}', r.stderr, re.S)[-1])
    af = ('loudnorm=I=%d:TP=%.1f:LRA=11:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true'
          % (I, TP, m['input_i'], m['input_tp'], m['input_lra'], m['input_thresh'], m['target_offset']))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af', af, '-ar', str(SR), out], check=True)


def measure(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True)
    s = r.stderr[r.stderr.rfind('Summary:'):]
    I = re.search(r'I:\s+(-?[\d.]+) LUFS', s); TPk = re.search(r'Peak:\s+(-?[\d.]+) dBFS', s)
    return (float(I.group(1)) if I else None), (float(TPk.group(1)) if TPk else None)


def main_v1(rid, base, F, TIM):
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
        bed_track(music, beds, rid, total, n)
        duck(music, voice, n, depth=0.5, level=0.3)
        fo = int(1.5 * SR); end = int(total * SR)
        music[:int(0.05 * SR)] *= np.linspace(0, 1, int(0.05 * SR))[:, None]
        music[end - fo:end] *= np.linspace(1, 0, fo)[:, None]; music[end:] = 0
    out = (voice + fx * 0.62 + music)[: int((total + 0.1) * SR)]
    write_master(base, out, rid, '%d lines, %d sound effects, music %s' % (len(F['beats']), k, 'on' if beds else 'off'))


def bed_track(music, beds, rid, total, n, XF=2.0):
    k0 = zlib.crc32(rid.encode()) % len(beds)
    order = beds[k0:] + beds[:k0]
    t, i = 0.0, 0
    while t < total + 1:  # one clip is ~32 s; longer reels chain the next with a crossfade
        y = read(order[i % len(order)])[: -int(0.3 * SR)]
        m = int(XF * SR); env = np.ones(len(y), np.float32)
        if t > 0: env[:m] = np.linspace(0, 1, m)
        env[-m:] = np.minimum(env[-m:], np.linspace(1, 0, m))
        add(music, y * env[:, None], t, 1.0)
        t += len(y) / SR - XF; i += 1
    return os.path.basename(order[0])


def duck(music, voice, n, depth=0.6, level=0.3, attack=0.04, release=0.32):
    """sidechain: the music goes down while the voice speaks (smooth attack and release)"""
    hop = 240
    act = np.abs(voice[:, 0])
    m = len(act) // hop
    rms = np.sqrt((act[: m * hop].reshape(m, hop) ** 2).mean(1))
    on = np.clip((20 * np.log10(rms + 1e-6) + 46) / 14, 0, 1)  # -46 dB → 0, -32 dB → 1
    g = np.zeros_like(on); z = 0.0
    ka, kr = 1 - np.exp(-hop / (attack * SR)), 1 - np.exp(-hop / (release * SR))
    for j, v in enumerate(on):
        z += (v - z) * (ka if v > z else kr); g[j] = z
    d = 1 - depth * np.repeat(g, hop)
    d = np.concatenate([d, np.full(n - len(d), d[-1] if len(d) else 1)])
    music *= (level * d)[:, None]


def tp_limit(y, ceil_db=-2.2, release=0.12):
    """true-peak limiter: 4x oversampled peaks, 5 ms look-ahead, smooth release (no clipping, no pumping)"""
    from scipy import signal, ndimage
    c = 10 ** (ceil_db / 20)
    up = np.max(np.abs(np.stack([signal.resample_poly(y[:, ch], 4, 1) for ch in (0, 1)], 1)), 1)
    pk = up[: len(y) * 4].reshape(-1, 4).max(1)
    need = np.minimum(1.0, c / (pk + 1e-9))
    la = int(0.005 * SR)
    g = ndimage.minimum_filter1d(need, size=2 * la + 1, origin=0)
    out = np.empty_like(g); z = 1.0; k = 1 - np.exp(-1 / (release * SR))
    for i, v in enumerate(g):
        z = v if v < z else z + (v - z) * k
        out[i] = z
    out = ndimage.uniform_filter1d(out, size=la)
    out = np.minimum(out, ndimage.minimum_filter1d(need, size=la, origin=0))
    return (y * out[:, None]).astype(np.float32)


def lufs(y):
    tmp = os.path.join('/tmp', 'c360-lufs-%d.wav' % os.getpid())
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())
    I, TP = measure(tmp); os.remove(tmp); return I, TP


def write_master(base, out, rid, info, target=-14.0):
    """gain to -14 LUFS (measured, EBU R128), then a true-peak limiter at -2.2 dBTP (AAC adds a little), twice"""
    build = os.path.join(base, 'build')
    y = out.astype(np.float32)
    for i in range(3):
        I, _ = lufs(y)
        if I is None: break
        if i and abs(I - target) < 0.15: break
        y = tp_limit(y * 10 ** ((target - I) / 20))
    a = int(0.025 * SR); y[:a] *= np.linspace(0, 1, a)[:, None] ** 2  # AAC overshoots on a full-level first sample (+5 dB): a 25 ms fade-in
    final = os.path.join(build, 'audio.wav')
    with wave.open(final, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype('<i2').tobytes())
    I, TP = measure(final)
    print(f'{rid}: {info}; master {I} LUFS, true peak {TP} dBTP')


# ------------------------------------------------------------------ v2
FLAVOR = {  # per theme: pitch spread, a low-pass (Hz, 0 = none), category level multipliers
    'soft': {'spread': 0.04, 'lp': 7500, 'mul': {'impact': 0.8, 'boom': 0.7, 'glitch': 0.6, 'key': 0.8}},
    'crisp': {'spread': 0.05, 'lp': 0, 'mul': {'click': 1.15, 'tick': 1.1}},
    'airy': {'spread': 0.05, 'lp': 0, 'mul': {'whoosh_s': 1.1, 'whoosh_l': 1.1, 'shimmer': 1.2, 'impact': 0.85}},
    'warm': {'spread': 0.03, 'lp': 9000, 'mul': {'paper': 1.2, 'impact': 0.85, 'glitch': 0.5}},
    'digital': {'spread': 0.07, 'lp': 0, 'mul': {'glitch': 1.2, 'click': 1.1, 'shimmer': 0.8}},
    'punchy': {'spread': 0.05, 'lp': 0, 'mul': {'impact': 1.15, 'pop': 1.15, 'snap': 1.1}},
}
BASE = {'whoosh_s': 0.55, 'whoosh_l': 0.5, 'whoosh_r': 0.5, 'swoosh': 0.42, 'swoosh_up': 0.42, 'swoosh_down': 0.42, 'shutter': 0.6, 'click': 0.45,
        'key': 0.32, 'pop': 0.5, 'bubble': 0.45, 'tick': 0.42, 'riser': 0.55, 'riser_s': 0.45, 'impact': 0.85, 'boom': 0.7, 'subdrop': 0.75,
        'shimmer': 0.38, 'sparkle': 0.4, 'glitch': 0.38, 'paper': 0.45, 'snap': 0.55, 'chime': 0.42, 'shatter': 0.7}


def lowpass(y, fc):
    from scipy import signal
    b, a = signal.butter(2, fc / (SR / 2), 'low')
    return signal.lfilter(b, a, y, axis=0).astype(np.float32)


def thin(cues):
    """at most one cue per 70 ms (the more important stays), at most 4 a second (keys apart)"""
    cues = sorted(cues, key=lambda c: c['t'])
    keep = []
    for c in cues:
        if c['cat'] == 'key': keep.append(c); continue
        clash = [k for k in keep if k['cat'] != 'key' and abs(k['t'] - c['t']) < 0.07]
        if clash:
            worst = min(clash, key=lambda k: k['prio'])
            if c['prio'] > worst['prio']: keep.remove(worst); keep.append(c)
            continue
        keep.append(c)
    keep.sort(key=lambda c: c['t'])
    while True:
        nk = [c for c in keep if c['cat'] != 'key']
        over = None
        for i, c in enumerate(nk):
            win = [k for k in nk[i:] if k['t'] < c['t'] + 1.0]
            if len(win) > 4: over = win; break
        if not over: break
        keep.remove(min(over, key=lambda k: (k['prio'], -k['t'])))
    return keep


def main_v2(rid, base, F, TIM):
    total = F['total']
    n = int(total * SR) + SR
    voice, fx, music = (np.zeros((n, 2), np.float32) for _ in range(3))
    for b in F['beats']:
        tm = TIM.get(b['key'])
        if tm and tm.get('text') == b['text']: add(voice, read(os.path.join(base, tm['file'])), b['t0'], 1.0)
    fl = FLAVOR.get(F.get('sfx') or 'crisp', FLAVOR['crisp'])
    rng = np.random.default_rng(zlib.crc32(rid.encode()))
    lib = {}
    for p in sorted(glob.glob(os.path.join(HERE, 'sfx', 'v2', '*.wav'))):
        cat = os.path.basename(p).rsplit('_', 1)[0]; lib.setdefault(cat, []).append(p)
    cache, last = {}, {}
    cues = thin([c for c in F['cues'] if c['cat'] in lib])
    for c in cues:
        vs = lib[c['cat']]
        choices = [v for v in vs if v != last.get(c['cat'])] or vs
        v = choices[int(rng.integers(len(choices)))]; last[c['cat']] = v
        if v not in cache:
            y = read(v)
            if fl['lp']: y = lowpass(y, fl['lp'])
            cache[v] = y
        y = cache[v]
        pitch = 1 + (rng.random() * 2 - 1) * fl['spread']
        if abs(pitch - 1) > 0.004:
            x = np.arange(0, len(y) - 1, pitch)
            y = np.stack([np.interp(x, np.arange(len(y)), y[:, ch]) for ch in (0, 1)], 1).astype(np.float32)
        g = BASE.get(c['cat'], 0.45) * fl['mul'].get(c['cat'], 1) * c.get('gain', 1) * 10 ** ((rng.random() * 2 - 1) * 1.5 / 20)
        pan = c.get('pan') if c.get('pan') is not None else (rng.random() * 2 - 1) * 0.18
        add(fx, y, c['t'], g, pan)
    mood = F.get('music') or 'pop'
    beds = sorted(glob.glob(os.path.join(HERE, 'music', mood + '[0-9][0-9].wav'))) or sorted(glob.glob(os.path.join(HERE, 'music', 'pop*.wav')))
    bed = None
    if beds:
        bed = bed_track(music, beds, rid, total, n)
        duck(music, voice, n, depth=0.62, level=0.34)
        end = int(total * SR)
        if F.get('loop'):  # a loop: no fade (a few ms at both ends, against clicks)
            a = int(0.02 * SR); music[:a] *= np.linspace(0, 1, a)[:, None]; music[end - a:end] *= np.linspace(1, 0, a)[:, None]
        else:
            fo = int(1.4 * SR); music[:int(0.03 * SR)] *= np.linspace(0, 1, int(0.03 * SR))[:, None]; music[end - fo:end] *= np.linspace(1, 0, fo)[:, None]
        music[end:] = 0
    out = (voice + fx * 0.7 + music)[: int((total + 0.02) * SR)]
    nk = [c for c in cues if c['cat'] != 'key']
    per = np.bincount(np.array([int(c['t']) for c in nk], dtype=int), minlength=int(total) + 1) if nk else np.zeros(1)
    info = '%d lines, %d sound effects (%d keys), %.1f a second on average, max %d in a second, music %s' % (
        len(F['beats']), len(cues), len(cues) - len(nk), len(nk) / max(1, total), int(per.max()), bed or 'off')
    json.dump({'cues': cues, 'per_second': per.tolist(), 'bed': bed}, open(os.path.join(base, 'build', 'sfx-used.json'), 'w'))
    write_master(base, out, rid, info)


def main():
    rid = sys.argv[1]
    base = os.path.join(HERE, '..', 'scripts', rid)
    F = json.load(open(os.path.join(base, 'build', 'film.json')))
    TIM = json.load(open(os.path.join(base, 'timing.json')))
    (main_v2 if F.get('v') == 2 else main_v1)(rid, base, F, TIM)


if __name__ == '__main__':
    main()
