#!/usr/bin/env python3
"""Sunetul unui reel: vocea la timpii ei, efectele pe animații, muzica dedesubt, constantă (regula din 14.11), -14 LUFS.
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


def write_master(base, out, rid, info, target=-14.0, name='audio.wav'):
    """gain to -14 LUFS (measured, EBU R128), then a true-peak limiter at -2.2 dBTP (AAC adds a little), twice"""
    build = os.path.join(base, 'build')
    y = out.astype(np.float32)
    for i in range(3):
        I, _ = lufs(y)
        if I is None: break
        if i and abs(I - target) < 0.15: break
        y = tp_limit(y * 10 ** ((target - I) / 20))
    a = int(0.025 * SR); y[:a] *= np.linspace(0, 1, a)[:, None] ** 2  # AAC overshoots on a full-level first sample (+5 dB): a 25 ms fade-in
    final = os.path.join(build, name)
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
        'shimmer': 0.38, 'sparkle': 0.4, 'glitch': 0.38, 'paper': 0.45, 'snap': 0.55, 'chime': 0.42, 'shatter': 0.7, 'resolve': 0.6}


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


# the music's constant level (the owner, 14.11): first the level where the voice is still clearly understood (8 dB of voice
# over music in the speech band, 1-4 kHz, while she speaks, and the machine listener hears every word: listen.py), then
# „puțin mai tare”: +2 dB of music (6 dB in the speech band); then, after the next viewing, „dă puțintel mai tare la
# muzică”: +1.5 dB more. So the default is 4.5 dB in the speech band (checked with listen.py); the broadband offset is printed.
MUSIC_UNDER_VOICE = float(os.environ.get('MUSIC_UNDER_VOICE', '4.5'))


def peaking(y, f0, gain_db, q=0.8):
    """a static peaking EQ (RBJ cookbook)"""
    from scipy import signal
    A = 10 ** (gain_db / 40); w0 = 2 * np.pi * f0 / SR; al = np.sin(w0) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w0), 1 - al * A]; a = [1 + al / A, -2 * np.cos(w0), 1 - al / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], y, axis=0).astype(np.float32)


def constant_bed(music, voice, total):
    """the owner's rule (14.11): the music stays constant the whole time, „semi tare” in the background, the voice on top.
    One fixed gain (chosen so the voice is MUSIC_UNDER_VOICE dB over it while she speaks), a gentle static dip where
    speech lives (-3 dB at 2.5 kHz), no ducking, no automation; only a click-free tail of 0.3 s on the last frames."""
    end = int(total * SR)
    from scipy import signal
    music[:] = peaking(music, 2500, -3.0)
    sp = np.abs(voice[:, 0]) > 0.02
    bb, aa = signal.butter(2, [1000 / (SR / 2), 4000 / (SR / 2)], 'band')
    v = np.sqrt(np.mean(signal.lfilter(bb, aa, voice[:, 0])[sp] ** 2)) if sp.any() else 0.05
    # the song's own dynamics stay (a quiet intro, a fuller chorus): the gain is set on its louder moments (the 85th
    # percentile of half-second levels while she speaks), so the voice is clear everywhere, even where the song swells
    mb = signal.lfilter(bb, aa, music[:, 0]); win = int(0.5 * SR)
    lv = [np.sqrt(np.mean(mb[i:i + win][sp[i:i + win]] ** 2)) for i in range(0, end - win, win) if sp[i:i + win].mean() > 0.3]
    m = (np.percentile(lv, 85) if lv else np.sqrt(np.mean(mb[sp] ** 2))) + 1e-9
    music *= (v / m) / (10 ** (MUSIC_UNDER_VOICE / 20))  # one gain for the whole reel
    a = int(0.3 * SR); music[end - a:end] *= np.linspace(1, 0, a)[:, None]; music[end:] = 0


def carve(music, voice):
    """a song with its own vocals: while our voice speaks, its 0.9-4 kHz band (where speech lives) steps back"""
    from scipy import signal
    b, a = signal.butter(2, [900 / (SR / 2), 4000 / (SR / 2)], 'band')
    mid = signal.lfilter(b, a, music, axis=0).astype(np.float32)
    hop = 480; act = np.abs(voice[:, 0]); m = len(act) // hop
    rms = np.sqrt((act[: m * hop].reshape(m, hop) ** 2).mean(1)); on = np.clip((20 * np.log10(rms + 1e-6) + 46) / 12, 0, 1)
    env = np.convolve(on, np.ones(15) / 15, 'same'); env = np.repeat(env, hop); env = np.concatenate([env, np.zeros(len(music) - len(env))])
    music -= mid * (0.6 * env)[:, None]


def shape_music(music, F, total):
    """the music follows the story: a filter build into the payoff, then the drop (+2 dB for a few seconds);
    at the outro it settles under the resolving chord (a loop: it ends there; else it stays low under the end)"""
    from scipy import signal
    n = len(music)
    t = np.arange(n) / SR
    pay, out = F.get('payoff'), F.get('outro')
    if pay:
        b, a = signal.butter(2, 700 / (SR / 2), 'low')
        low = signal.lfilter(b, a, music, axis=0).astype(np.float32)
        w = np.clip((t - (pay - 1.6)) / 1.4, 0, 1) * (t < pay)  # 0 → 1 while it builds, back to 0 on the payoff
        music[:] = music * (1 - w[:, None] * 0.85) + low * (w[:, None] * 0.85) * 1.15
        lift = 1 + 0.26 * np.clip((t - pay) / 0.05, 0, 1) * np.clip(1 - (t - pay - 3.0) / 1.5, 0, 1) * (t >= pay)
        music *= lift[:, None]
    if out:
        floor = 0.0 if F.get('loop') else 0.38
        g = 1 - (1 - floor) * np.clip((t - (out - 0.35)) / 0.9, 0, 1)
        music *= g[:, None].astype(np.float32)


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
        if c['t'] < 0.15 and c['cat'] in ('impact', 'boom', 'whoosh_s'): g *= 0.4  # the hook hit stays, but never masks the first words
        pan = c.get('pan') if c.get('pan') is not None else (rng.random() * 2 - 1) * 0.18
        add(fx, y, c['t'], g, pan)
    # the music (the owner, 14.11): the previews use exactly his track (music/owner-free.wav, git-ignored), never a
    # generated one; he posts from the apps and adds the licensed sound there, so a clean file (voice + effects) is made too
    song = os.path.join(HERE, 'music', (F.get('musicFile') or 'owner-free') + '.wav')
    start = float(F.get('musicStart') if F.get('musicStart') is not None else 0.395)
    bed = None
    if os.path.exists(song):
        y = read(song); a = int(start * SR)
        seg = y[a: a + len(music)]; music[: len(seg)] = seg
        bed = os.path.basename(song) + ' from %.2f s' % start
        constant_bed(music, voice, total)
    else:
        print('  ! the owner\'s track is missing (' + song + '): the preview has no music')
    n2 = int((total + 0.02) * SR)
    out = (voice + fx * 0.7 + music)[:n2]
    clean = (voice + fx * 0.7)[:n2]
    sp = np.abs(voice[:, 0]) > 0.02
    vom = 20 * np.log10((np.sqrt(np.mean(voice[sp, 0] ** 2)) + 1e-9) / (np.sqrt(np.mean(music[sp, 0] ** 2)) + 1e-9)) if sp.any() and bed else 0
    vb = 0
    if sp.any() and bed:  # the same ratio in the band where speech is understood (1-4 kHz): the human clarity check
        from scipy import signal
        bb, aa = signal.butter(2, [1000 / (SR / 2), 4000 / (SR / 2)], 'band')
        V1 = signal.lfilter(bb, aa, voice[:, 0]); M1 = signal.lfilter(bb, aa, music[:, 0])
        vb = 20 * np.log10((np.sqrt(np.mean(V1[sp] ** 2)) + 1e-9) / (np.sqrt(np.mean(M1[sp] ** 2)) + 1e-9))
    nk = [c for c in cues if c['cat'] != 'key']
    per = np.bincount(np.array([int(c['t']) for c in nk], dtype=int), minlength=int(total) + 1) if nk else np.zeros(1)
    info = '%d lines, %d sound effects (%d keys), %.1f a second on average, max %d in a second, music %s (constant), voice over music %.1f dB (%.1f dB at 1-4 kHz)' % (
        len(F['beats']), len(cues), len(cues) - len(nk), len(nk) / max(1, total), int(per.max()), bed or 'off', vom, vb)
    json.dump({'cues': cues, 'per_second': per.tolist(), 'bed': bed}, open(os.path.join(base, 'build', 'sfx-used.json'), 'w'))
    write_master(base, out, rid, 'preview: ' + info)
    write_master(base, clean, rid, 'clean (voice + effects, for posting)', name='audio-clean.wav')


def main():
    rid = sys.argv[1]
    base = os.path.join(HERE, '..', 'scripts', rid)
    F = json.load(open(os.path.join(base, 'build', 'film.json')))
    TIM = json.load(open(os.path.join(base, 'timing.json')))
    (main_v2 if F.get('v') == 2 else main_v1)(rid, base, F, TIM)


if __name__ == '__main__':
    main()
