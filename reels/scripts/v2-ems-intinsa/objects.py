#!/usr/bin/env python3
"""The cut-out objects of the editorial collage (formats x / x-b): python3 objects.py [name ...] [--force]
One consistent style (a black and white studio photograph, matte, soft light from the upper left), generated with the
engine's image module (engine/imagen.py: the same model, key and cache folder engine/img/<hash>.png) on a flat chroma
green, then keyed here into a clean alpha cut-out (the object is monochrome, so the matte is simply "how green is it";
the edge colour is un-mixed from the background and the object is stored as pure grey: no spill is left).
→ scripts/<reel>/objects/<name>.png (RGBA, trimmed) and scripts/<reel>/images.json (name → cache file, prompt).
Objects are symbols, never proof: no faces, no real persons, no devices, no before/after. The count is printed."""
import hashlib, importlib.util, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.join(HERE, '..', '..', 'engine')
spec = importlib.util.spec_from_file_location('imagen', os.path.join(ENGINE, 'imagen.py'))
IM = importlib.util.module_from_spec(spec); spec.loader.exec_module(IM)

STYLE = ('Black and white studio photograph for an editorial paper collage: strictly monochrome, a rich tonal range from deep '
         'charcoal to bright white, soft diffused daylight from the upper left, crisp focus across the whole object, fine '
         'detail, matte surfaces, nothing mirror-like. The object is isolated, centered, fully inside the frame with a clear '
         'margin on every side. Background: one perfectly flat, uniform, pure chroma key green (#00FF00) filling the whole '
         'frame edge to edge, with no gradient, no floor, no horizon, no cast shadow, no reflection, no vignette. No green '
         'light and no green reflections on the object. No text, no letters, no numbers, no logos, no watermark, no border.')

OBJECTS = {
    'v2-ems-intinsa': {
        'statue': ('16:9', 'An antique Greek marble sculpture of a draped female figure reclining on her side on a low plain marble plinth, '
                   'seen from behind: her back is toward the viewer, she rests on one elbow with her head turned fully away so that no face '
                   'is visible at all, only the back of the head with a simple carved chignon. She is fully draped in a long carved chiton '
                   'with deep flowing folds, legs stretched out along the plinth. In the style of the Parthenon pediment figures, white '
                   'marble with gentle weathering. A museum piece, calm and elegant. The sculpture is large in the frame: it spans about 85 percent of the frame width.'),
        'dumbbell': ('16:9', 'A single classic dumbbell with two round matte black cast-iron heads and a knurled matte steel handle, slightly '
                     'worn, lying horizontally, seen from a three-quarter front angle.'),
        'stopwatch': ('1:1', 'A vintage mechanical stopwatch seen straight from the front, perfectly circular: a matte brushed-steel case, a '
                      'crown with a ring on top, a plain white enamel dial with fine black tick marks around the edge and no numerals, and '
                      'one thin black hand pointing straight up. The stopwatch is large: it fills about 80 percent of the frame height.'),
        'magnifier': ('1:1', 'A classic magnifying glass seen straight from above, lying flat: a large round lens in a thin matte black metal '
                      'rim and a turned dark wooden handle pointing to the lower right corner. The glass is perfectly clear and shows only '
                      'the same flat green background through it, with no reflections, no highlights and no distortion. The magnifying glass is large: it spans the frame diagonally.'),
        'plane': ('4:3', 'A folded paper airplane made of plain white paper with crisp sharp folds, seen from above at a three-quarter angle, '
                  'its nose pointing to the upper right, soft grey shading on its folds. The paper airplane is large: it spans about 80 percent of the frame width.'),
    },
    'v2-crema-straturi': {
        'jar': ('1:1', 'A luxury face cream jar, closed: a low, wide cylindrical jar of frosted white glass with a smooth matte white lid, '
                'unbranded and completely plain, seen exactly from the side at eye level (a perfect side elevation, the top of the lid not '
                'visible), standing upright.'),
    },
}


def key(src, dst, pad=12, glass=False):
    im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    green = g - np.maximum(r, b)                      # how green a pixel is: ~0 on a grey object, high on the background
    lum0 = 0.299 * r + 0.587 * g + 0.114 * b
    edge = np.concatenate([im[:24].reshape(-1, 3), im[-24:].reshape(-1, 3), im[:, :24].reshape(-1, 3), im[:, -24:].reshape(-1, 3)])
    B = np.median(edge, axis=0)                       # the background colour, measured on the frame's border
    gB = B[1] - max(B[0], B[2]); lB = 0.299 * B[0] + 0.587 * B[1] + 0.114 * B[2]
    assert gB > 0.06, 'the background is not green enough to key (%.3f)' % gB
    # a background pixel, lit or in the object's cast shadow, is the background colour times a factor: as green as its
    # brightness says. An object pixel is grey at any brightness. q: 1 on the background (and its shadows), 0 on the object
    q = green / (gB * np.maximum(lum0 / lB, 0.25))
    a = 1 - np.clip((q - 0.3) / 0.5, 0, 1)
    # the object's own colour: un-mix the background from the edge pixels, then keep the grey only (no spill)
    aa = np.clip(a, 0.08, 1)[..., None]
    F = np.clip((im - (1 - aa) * B * np.clip(lum0 / lB, 0.3, 1)[..., None]) / aa, 0, 1)
    lum = 0.299 * F[..., 0] + 0.587 * F[..., 1] + 0.114 * F[..., 2]
    lum = np.where(a > 0.97, lum0 - 0.587 * np.clip(green, 0, 1) * 0.6, lum)   # inside: the photograph itself, a green tint taken out
    if not glass:                                      # a green reflection inside the object would have cut a hole: fill it
        solid = ndimage.binary_fill_holes(a > 0.5)
        a = np.maximum(a, ndimage.binary_erosion(solid, iterations=3).astype(np.float32))
    a = ndimage.gaussian_filter(a, 0.7)
    a = np.clip((a - 0.2) / 0.7, 0, 1)                 # a slightly tighter, clean edge (no halo)
    lab, n = ndimage.label(a > 0.3)                    # drop specks: keep the components that are a real part of the object
    if n > 1:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1)); keep = [i + 1 for i, s in enumerate(sizes) if s > 0.004 * sizes.max()]
        a = a * np.isin(ndimage.grey_dilation(lab, size=5), keep)
    ys, xs = np.where(a > 0.02)
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(a.shape[0], ys.max() + pad), max(0, xs.min() - pad), min(a.shape[1], xs.max() + pad)
    out = np.dstack([lum, lum, lum, a])[y0:y1, x0:x1]
    Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(dst)
    return out.shape[1], out.shape[0], float((a > 0.5).mean())


def main():
    args = [x for x in sys.argv[1:] if not x.startswith('--')]; force = '--force' in sys.argv
    made = cached = 0
    for rid, objs in OBJECTS.items():
        base = os.path.join(HERE, '..', rid); os.makedirs(os.path.join(base, 'objects'), exist_ok=True)
        mp = os.path.join(base, 'images.json'); M = json.load(open(mp)) if os.path.exists(mp) else {}
        for name, (ar, what) in objs.items():
            if args and name not in args: continue
            salt = os.environ.get('SALT_' + name.upper(), '')
            prompt = what + ' ' + STYLE + (' ' + salt if salt else '')
            h = hashlib.sha1((prompt + ar).encode()).hexdigest()[:16]; raw = os.path.join(ENGINE, 'img', h + '.png')
            if os.path.exists(raw) and not force: cached += 1
            else:
                if not IM.KEY: sys.exit('VERTEX_API_KEY is missing')
                open(raw, 'wb').write(IM.gen_gemini(prompt, ar)); made += 1
            w, hh, cover = key(raw, os.path.join(base, 'objects', name + '.png'), glass=name in ('magnifier',))
            M[name] = {'file': h + '.png', 'prompt': what, 'ar': ar, 'cutout': 'objects/' + name + '.png'}
            print('%s/%s: %dx%d, object covers %.0f %% of the raw frame (%s)' % (rid, name, w, hh, cover * 100, h))
        json.dump(M, open(mp, 'w'), ensure_ascii=False, indent=1)
    print('made now: %d, from cache: %d' % (made, cached))


if __name__ == '__main__':
    main()
