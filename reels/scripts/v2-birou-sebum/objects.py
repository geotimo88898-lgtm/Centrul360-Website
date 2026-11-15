#!/usr/bin/env python3
"""The desk objects of v2-birou-sebum (format x-b, the bright desk collage): python3 objects.py [name ...] [--force]
One style, different from the black and white collage of v2-ems-intinsa: soft natural colour, a flat lay seen from
straight above, window light from the upper RIGHT. Generated with the engine's image module (engine/imagen.py: the
same model, key and cache folder) on a flat chroma MAGENTA (the objects are white, silver, rose gold and turquoise, so
magenta never appears in them), then keyed here into a clean alpha cut-out with the background un-mixed from the edges.
→ objects/<name>.png (RGBA, trimmed) and images.json. Generic objects only: no faces, no people, no results."""
import hashlib, importlib.util, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.join(HERE, '..', '..', 'engine')
spec = importlib.util.spec_from_file_location('imagen', os.path.join(ENGINE, 'imagen.py'))
IM = importlib.util.module_from_spec(spec); spec.loader.exec_module(IM)

STYLE = ('Studio product photograph for a clean editorial desk collage, a flat lay seen exactly from straight above (top-down, '
         'orthographic feel, no perspective tilt). Soft natural colours, bright and airy, soft diffused window daylight from the upper '
         'right, crisp focus across the whole object, fine realistic detail. The object is isolated, centered, fully inside the '
         'frame with a generous margin on every side. Background: one perfectly flat, uniform, pure chroma key magenta (#FF00FF) '
         'filling the whole frame edge to edge, with no gradient, no floor texture, no cast shadow, no reflection, no vignette. No '
         'magenta or pink light and no magenta reflections on the object. No text, no letters, no numbers, no logos, no brand '
         'marks, no watermark, no border.')

OBJECTS = {
    'soap': ('4:3', 'A plain bar of pure white soap, a smooth rounded rectangle with softly bevelled edges, unbranded and completely '
             'blank, slightly worn and satin matte, lying flat. It fills about 70 percent of the frame width.'),
    'glasses': ('16:9', 'A pair of round reading glasses lying flat with both temples folded, thin matte dark graphite metal wire frame, two '
                'perfectly round lenses. The lenses are perfectly clear and show only the same flat magenta background through them, '
                'with no reflections, no highlights and no distortion. The glasses span about 85 percent of the frame width.'),
    'pencil': ('16:9', 'A slim mechanical drafting pencil with a smooth matte rose gold metal body, a fine knurled grip, a thin metal tip with '
               'a fine graphite lead, and a simple metal clip, lying horizontally with the tip pointing to the left. It spans about 85 '
               'percent of the frame width.'),
    'level': ('16:9', 'A short torpedo spirit level lying horizontally: a slim body of brushed silver aluminium with softly rounded ends, and '
              'in its exact centre one single horizontal glass vial window showing clear pale turquoise liquid with one small air bubble '
              'exactly in the middle between two thin black lines. No other vials, no markings. It spans about 85 percent of the frame width.'),
    'note': ('3:4', 'A single sheet torn from a small top-bound spiral notepad: plain bright white paper with faint pale grey horizontal ruled '
             'lines and no margin line, the top edge torn with a row of small ragged holes from the spiral, lying perfectly flat, completely '
             'blank with nothing written on it. It fills about 75 percent of the frame height.'),
}


def key(src, dst, pad=14, glass=False):
    im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    edge = np.concatenate([im[:24].reshape(-1, 3), im[-24:].reshape(-1, 3), im[:, :24].reshape(-1, 3), im[:, -24:].reshape(-1, 3)])
    B = np.median(edge, axis=0)
    mag = np.minimum(r, b) - g                        # how magenta a pixel is: ~0 on white, silver, rose gold, turquoise
    mB = min(B[0], B[2]) - B[1]
    assert mB > 0.12, 'the background is not magenta enough to key (%.3f)' % mB
    lum0 = (r + b) / 2; lB = (B[0] + B[2]) / 2
    q = mag / (mB * np.maximum(lum0 / lB, 0.25))
    a = 1 - np.clip((q - 0.25) / 0.5, 0, 1)
    aa = np.clip(a, 0.08, 1)[..., None]
    F = np.clip((im - (1 - aa) * B * np.clip(lum0 / lB, 0.3, 1)[..., None]) / aa, 0, 1)
    # spill: an object pixel never keeps more red+blue than its green allows (take the magenta cast out)
    sp = np.clip(np.minimum(F[..., 0], F[..., 2]) - F[..., 1], 0, 1) * (a < 0.97)
    F[..., 0] -= sp * 0.9; F[..., 2] -= sp * 0.9
    if not glass:
        solid = ndimage.binary_fill_holes(a > 0.5)
        a = np.maximum(a, ndimage.binary_erosion(solid, iterations=3).astype(np.float32))
    a = ndimage.gaussian_filter(a, 0.7)
    a = np.clip((a - 0.2) / 0.7, 0, 1)
    lab, n = ndimage.label(a > 0.3)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1)); keep = [i + 1 for i, s in enumerate(sizes) if s > 0.004 * sizes.max()]
        a = a * np.isin(ndimage.grey_dilation(lab, size=5), keep)
    ys, xs = np.where(a > 0.02)
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + pad), max(0, xs.min() - pad), min(a.shape[1], xs.max() + pad)
    out = np.dstack([np.clip(F, 0, 1), a])[y0:y1, x0:x1]
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').save(dst)
    return out.shape[1], out.shape[0], float((a > 0.5).mean()), (x0, y0)


def main():
    args = [x for x in sys.argv[1:] if not x.startswith('--')]; force = '--force' in sys.argv
    made = cached = 0
    os.makedirs(os.path.join(HERE, 'objects'), exist_ok=True)
    mp = os.path.join(HERE, 'images.json'); M = json.load(open(mp)) if os.path.exists(mp) else {}
    for name, (ar, what) in OBJECTS.items():
        if args and name not in args: continue
        salt = os.environ.get('SALT_' + name.upper(), '')
        prompt = what + ' ' + STYLE + (' ' + salt if salt else '')
        h = hashlib.sha1((prompt + ar).encode()).hexdigest()[:16]; raw = os.path.join(ENGINE, 'img', h + '.png')
        if os.path.exists(raw) and not force: cached += 1
        else:
            if not IM.KEY: sys.exit('VERTEX_API_KEY is missing')
            open(raw, 'wb').write(IM.gen_gemini(prompt, ar)); made += 1
        w, hh, cover, off = key(raw, os.path.join(HERE, 'objects', name + '.png'), glass=name in ('glasses',))
        M[name] = {'file': h + '.png', 'prompt': what, 'ar': ar, 'cutout': 'objects/' + name + '.png', 'offset': [int(off[0]), int(off[1])]}
        print('%s: %dx%d, covers %.0f %% of the raw frame (%s)' % (name, w, hh, cover * 100, h))
    json.dump(M, open(mp, 'w'), ensure_ascii=False, indent=1)
    print('made now: %d, from cache: %d' % (made, cached))


if __name__ == '__main__':
    main()


def finish():
    """per-object touch-ups after keying: the pencil in one rose gold (the clip kept the magenta in its reflections),
    the note's spiral hole without the background seen through it, the level's vial turquoise instead of green"""
    d = os.path.join(HERE, 'objects')
    p = os.path.join(d, 'pencil.png'); im = np.asarray(Image.open(p)).astype(np.float32) / 255
    L = (0.299 * im[..., 0] + 0.587 * im[..., 1] + 0.114 * im[..., 2])
    stops = np.array([[0.0, 0.20, 0.12, 0.10], [0.45, 0.62, 0.40, 0.35], [0.7, 0.81, 0.56, 0.49], [0.9, 0.92, 0.74, 0.68], [1.0, 0.99, 0.91, 0.87]])
    out = np.stack([np.interp(L, stops[:, 0], stops[:, k]) for k in (1, 2, 3)], -1)
    Image.fromarray((np.dstack([out, im[..., 3]]) * 255 + 0.5).astype(np.uint8), 'RGBA').save(p)
    p = os.path.join(d, 'note.png'); im = np.asarray(Image.open(p)).astype(np.float32) / 255
    red = (im[..., 0] - np.minimum(im[..., 1], im[..., 2])) > 0.12
    red = ndimage.binary_dilation(red, iterations=2); im[..., 3] = np.where(red, 0, im[..., 3])
    Image.fromarray((im * 255 + 0.5).astype(np.uint8), 'RGBA').save(p)
    p = os.path.join(d, 'level.png'); im = np.asarray(Image.open(p)).astype(np.float32) / 255
    g = (im[..., 1] - np.maximum(im[..., 0], im[..., 2])); m = np.clip(g / 0.25, 0, 1)[..., None]
    L = (0.3 * im[..., 0] + 0.6 * im[..., 1] + 0.1 * im[..., 2])[..., None]
    tq = np.concatenate([L * 0.32, L * 1.02, L * 0.93], -1)
    im[..., :3] = np.clip(im[..., :3] * (1 - m) + tq * m, 0, 1)
    Image.fromarray((im * 255 + 0.5).astype(np.uint8), 'RGBA').save(p)
    for n in ('note', 'soap'):  # white things stay neutral (no pink left at the torn holes)
        p = os.path.join(d, n + '.png'); im = np.asarray(Image.open(p)).astype(np.float32); L = 0.3 * im[..., 0] + 0.59 * im[..., 1] + 0.11 * im[..., 2]
        im[..., 0] = im[..., 1] = L; im[..., 2] = np.clip(L * 1.01, 0, 255); Image.fromarray(im.astype(np.uint8), 'RGBA').save(p)
    print('touch-ups: pencil, note, level, soap')


if 'finish' in sys.argv: finish()
