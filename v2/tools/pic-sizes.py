#!/usr/bin/env python3
"""Small copies of the treatments' pictures (v2/art.json), for the places where the picture is small (speed, 25.11).
  python3 v2/tools/pic-sizes.py
For every picture of v2/art.json under /brand_asset/tratamente/ it writes <id>-600.webp (the 2-up tiles of the offers, the
cart's suggestions) and <id>-300.webp (the cart, the popover, the pairs), the same photo made smaller, and records them in
art.json as "w": [300, 600]. v2/shop.js and v2/tratamente.py use a small copy only when "w" says it exists.
Run it again after a picture changes (and keep the same ?v= on the copies: they take the one of the picture).
It also writes an 800-wide copy of each case of the approved before/after set (brand_asset/catalog/cazul-NN-*-800.webp, the
same photo made smaller) for the home page's small moving row, where a picture is at most 266 x 179 px on a phone (x3) and
371 x 250 on a computer (x2)."""
import glob, json, os, re
from PIL import Image
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(HERE)
ART = os.path.join(HERE, 'art.json')
SIZES = ((600, 82), (300, 80))  # width, webp quality

art = json.load(open(ART, encoding='utf-8'))
for key, a in art.items():
    img = str(a.get('img') or '')
    path = img.split('?')[0]
    if not path.startswith('/brand_asset/tratamente/') or not path.endswith('.webp'):
        continue
    src = os.path.join(ROOT, path.lstrip('/'))
    if not os.path.exists(src):
        continue
    im = Image.open(src)
    im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') else 'RGB')
    done = []
    for w, q in SIZES:
        if im.width <= w:
            continue
        h = round(im.height * w / im.width)
        im.resize((w, h), Image.LANCZOS).save(src[:-5] + '-%d.webp' % w, 'WEBP', quality=q, method=6)
        done.append(w)
    a['w'] = sorted(done)
    print(key, path, done)
out = json.dumps(art, ensure_ascii=False, indent=2)
out = re.sub(r'\[\s*([0-9, \n]*?)\s*\]', lambda m: '[' + ', '.join(re.findall(r'\d+', m.group(1))) + ']', out)
open(ART, 'w', encoding='utf-8').write(out + '\n')

# the approved before/after set (21.11; v2/README.md): an 800-wide copy for the home page's row
CASES = ('02', '05', '08', '11', '16', '23', '24', '35', '37', '39')
for n in CASES:
    for src in glob.glob(os.path.join(ROOT, 'brand_asset', 'catalog', 'cazul-%s-*.webp' % n)):
        if src.endswith('-800.webp'):
            continue
        im = Image.open(src).convert('RGB')
        if im.width > 800:
            im.resize((800, round(im.height * 800 / im.width)), Image.LANCZOS).save(src[:-5] + '-800.webp', 'WEBP', quality=82, method=6)
            print(os.path.basename(src), '800')
