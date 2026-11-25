#!/usr/bin/env python3
"""The treatments' own pages, sold like the best shop pages (the owner, 24-25.11: „ca la cele mai bune ecom stores”, light,
explained like to a 5-year-old, black only for the Black Friday moments).
  python3 v2/tratamente.py      writes v2/src/tratament-<id>.html for every treatment, then run python3 v2/build.py
Words only from v2/products-content.json (the site's own pages, the price list, the creative machine's knowledge); nothing
invented. The order: the picture, the name, the promise, the price and the button; what it does in three tiles; the real
results (only the approved set, only this treatment); how it works (an explainer drawn here, step by step, plus the site's
video when there is one); the zones (tap one, it is chosen in the buy box); who it is for; the session; what goes well with
it; the questions; the reviews and the last call. v2/pp.css draws it, v2/pp.js drives it (the price and the zone from
/api/shop, the cart through window.C360Shop of v2/shop.js). The pictures come from v2/art.json when they exist."""
import json, os, re, html, math, random, unicodedata
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, 'src')
C = json.load(open(os.path.join(HERE, 'products-content.json'), encoding='utf-8'))
ITEMS = C if isinstance(C, list) else C.get('products', [])
BY = {x['id']: x for x in ITEMS}
try: ART = json.load(open(os.path.join(HERE, 'art.json'), encoding='utf-8'))
except (OSError, ValueError): ART = {}
PRICES = json.load(open(os.path.join(ROOT, 'api', '_lib', 'price-list.gen.json'), encoding='utf-8'))['items']
e = lambda s: html.escape(str(s if s is not None else ''), quote=True)
lei = lambda n: '{:,}'.format(int(round(n))).replace(',', '.') + ' lei'
PCT = 50
ARROW = '{{arrow}}'
def ro_min(m):
    """Romanian minutes: 15 minute, 10-15 minute, 30 de minute"""
    m = str(m).replace(' min', '')
    last = int(re.findall(r'\d+', m)[-1]) % 100
    return m + (' de minute' if last == 0 or last >= 20 else ' minute')

# ---------------------------------------------------------------- the picture of each treatment (v2/art.json, else a cut-out)
# until v2/art.json has the treatment's own picture: the site's own studio photos (brand_asset/concern-*.webp), the calmest one
# for each treatment, with the crop that shows the treated area (never a before/after)
PHOTO = {
 'liposonix': ('concern-grasime', '50% 62%'), 'cavitatie': ('concern-belly-3', '50% 45%'), 'ems': ('concern-tonifiere', '50% 55%'),
 'radiofrecventa': ('concern-celulita', '50% 40%'), 'hifu-corp': ('concern-belly-2', '40% 55%'), 'impachetare': ('concern-detox', '50% 55%'),
 'hifu': ('concern-gusa', '50% 58%'), 'rf-sculpt-gusa': ('concern-chin-1', '45% 60%'), 'biolifting': ('concern-chin-3', '50% 55%'),
 'hifu-full-face': ('concern-face-2', '50% 30%'), 'biolifting-full-face': ('concern-riduri', '50% 35%'), 'rf-sculpt-full-face': ('concern-chin-2', '50% 50%'),
 'restart': ('concern-stralucire', '50% 35%'), 'masaj-facial': ('faciale-closeup', '50% 40%'), 'hidratare': ('concern-pete', '50% 35%'),
 'antirid': ('concern-face-2', '50% 25%'), 'redness': ('concern-ten-problematic', '50% 40%'), 'sebum-off': ('concern-ten-problematic', '50% 55%'),
 'microneedling': ('concern-pete', '50% 45%'), 'periocular': ('concern-riduri', '50% 28%'), 'epilare': ('epilare-legs', '50% 70%'),
}
def pic(x):
    for k in (x.get('pp'), x['id']):
        a = ART.get(k) if k else None
        if a and a.get('img'): return a['img'], True
    f = PHOTO.get(x['id'], ('concern-stralucire', '50% 40%'))[0]
    return '/brand_asset/%s.webp' % f, False
def pic_pos(x): return PHOTO.get(x['id'], ('', '50% 40%'))[1]
def art_video(x):
    for k in (x.get('pp'), x['id']):
        a = ART.get(k) if k else None
        if a and a.get('video'): return a['video']
    return ''

# ---------------------------------------------------------------- the laser zones (the price list rows, the server's ids)
def fold(s):
    s = unicodedata.normalize('NFD', str(s)); s = ''.join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r'^-|-$', '', re.sub(r'[^a-z0-9]+', '-', s))
def epi_list():
    out = []
    for t in PRICES:
        if t.get('group') != 'epilare' or t.get('sessions') != 1: continue
        parts = t['title'].split(' · ')
        men = 'bărbați' in parts
        zone = [p for p in parts if p not in ('Epilare laser', 'Elysion Pro', 'femei', 'bărbați', '1 ședință')][0]
        z = re.sub(r' \(.*\)', '', zone)
        out.append({'id': fold('epilare ' + z + (' barbati' if men else '')), 'key': fold(z), 'label': z, 'g': 'm' if men else 'f', 'full': t['price'], 'minutes': t['minutes'],
                    'both': fold(z) == 'full-body'})
    return out
EPI = epi_list()
def epi_keys():
    """[(key, label, genders)], Full Body first, then the price list's order"""
    seen = {}
    for z in EPI:
        k = z['key']
        if k not in seen: seen[k] = [z['label'], set()]
        seen[k][1].update('fm' if z['both'] else z['g'])
    keys = sorted(seen, key=lambda k: k != 'full-body')
    return [(k, seen[k][0], ''.join(sorted(seen[k][1]))) for k in keys]

# ---------------------------------------------------------------- small line icons (24px, stroke)
IC = {
 'target': '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
 'cells': '<circle cx="8" cy="9" r="4"/><circle cx="16.5" cy="10" r="3.2"/><circle cx="11.5" cy="16.5" r="3.4"/>',
 'flow': '<path d="M3 9c3-3 6 3 9 0s6-3 9 0"/><path d="M3 15c3-3 6 3 9 0s4-2.6 6-1.4"/><path d="M17 11.5l2.6 2.3-2.4 2.5"/>',
 'wave': '<path d="M12 4a8 8 0 0 1 0 16"/><path d="M12 8a4 4 0 0 1 0 8"/><path d="M3 12h5"/>',
 'magnet': '<path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 7h3M15 7h3"/>',
 'bolt': '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
 'muscle': '<path d="M6.5 8v8M3.5 10v4M17.5 8v8M20.5 10v4M6.5 12h11"/>',
 'heat': '<path d="M12 3c.8 3.4 5 5 5 10a5 5 0 0 1-10 0c0-2.6 1.6-3.8 2-5.6 1 .9 1.7 2 1.8 3.1C12.4 8.7 12.6 6 12 3z"/>',
 'fibers': '<path d="M3 7c3-2 5 2 9 0s6 2 9 0"/><path d="M3 12c3-2 5 2 9 0s6 2 9 0"/><path d="M3 17c3-2 5 2 9 0s6 2 9 0"/>',
 'smooth': '<path d="M3 16c4-1.5 14-1.5 18 0"/><path d="M12 4.5l1.2 3.3 3.3 1.2-3.3 1.2L12 13.5l-1.2-3.3L7.5 9l3.3-1.2z"/>',
 'lift': '<path d="M4 19c4-3 12-3 16 0"/><path d="M12 15V4M8 8l4-4 4 4"/>',
 'spark': '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16v4M17 18h4"/>',
 'hand': '<path d="M8 11.5V6a1.5 1.5 0 0 1 3 0v5M11 10.5V4.5a1.5 1.5 0 0 1 3 0v6M14 10.5V6a1.5 1.5 0 0 1 3 0v6.5M17 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-5.1-2.9l-2.4-4a1.5 1.5 0 0 1 2.6-1.5L8 14"/>',
 'face': '<path d="M12 3c-4 0-7 3.2-7 7.6 0 4.8 3.3 9.4 7 9.4s7-4.6 7-9.4C19 6.2 16 3 12 3z"/><path d="M9.5 10.5h.01M14.5 10.5h.01"/><path d="M9.8 14.6c1.3 1 3.1 1 4.4 0"/>',
 'layers': '<path d="M12 3 3 8l9 5 9-5z"/><path d="M3 12.5l9 5 9-5"/><path d="M3 17l9 5 9-5"/>',
 'drop': '<path d="M12 3c3.2 4.2 6 7.2 6 11a6 6 0 0 1-12 0c0-3.8 2.8-6.8 6-11z"/><path d="M9 15a3 3 0 0 0 3 3"/>',
 'shield': '<path d="M12 3 5 6v5.5c0 4.4 3 7.6 7 9.5 4-1.9 7-5.1 7-9.5V6z"/><path d="M9 12l2 2 4-4"/>',
 'lines': '<path d="M3 8c3-1.6 6 1.6 9 0s6-1.6 9 0"/><path d="M3 13c3-1.6 6 1.6 9 0s6-1.6 9 0"/><path d="M6 18c2-1 4 1 6 0"/>',
 'clock': '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
 'calm': '<path d="M5 19C5 10.5 11 5 19.5 4.5 19 13 13.5 19 5 19z"/><path d="M5 19l7.5-7.5"/>',
 'balance': '<path d="M12 4v16M7 20h10M5 7h14"/><path d="M5 7l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/>',
 'pore': '<path d="M3 9c3 0 5 0 6.5 3.5S11 17 12 17s1-1 2.5-4.5S18 9 21 9"/><circle cx="12" cy="7" r="2"/>',
 'dots': '<g fill="currentColor" stroke="none"><circle cx="6" cy="6" r="1.4"/><circle cx="12" cy="6" r="1.4"/><circle cx="18" cy="6" r="1.4"/><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/><circle cx="6" cy="18" r="1.4"/><circle cx="12" cy="18" r="1.4"/><circle cx="18" cy="18" r="1.4"/></g>',
 'eye': '<path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
 'laser': '<path d="M12 3v6"/><path d="M8 5.5l2 3.5M16 5.5l-2 3.5"/><path d="M12 12v9M9 21h6"/><circle cx="12" cy="12" r="2"/>',
 'feel': '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
 'refresh': '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>',
 'repeat': '<path d="M4 12a7 7 0 0 1 12-5l2 2"/><path d="M18 5v4h-4"/><path d="M20 12a7 7 0 0 1-12 5l-2-2"/><path d="M6 19v-4h4"/>',
 'calendar': '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
 'pin': '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
 'lock': '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
 'check': '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
 'x': '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
 'plus': '<path d="M12 5v14M5 12h14"/>',
 'play': '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" fill="currentColor" stroke="none"/>',
 'sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
}
def icon(k, cls='ic'):
    return '<svg class="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">%s</svg>' % (cls, IC.get(k, IC['spark']))
STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg>'
GLOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z"/></svg>'
REVIEWS = [  # the site's three Google reviews, word for word (v2/README.md)
    ('Maria Muntean', 'Timișoara', 'O experiență foarte plăcută, atmosfera relaxantă, iar rezultatul a fost exact pe măsura așteptărilor.'),
    ('Alina Galuțiu', 'Arad', 'O experiență minunată, d-na Andreea m-a abordat cu căldură și profesionalism.'),
    ('Simona-Mihaela J.', 'Timișoara', 'Locație frumoasă, curată, liniștită. Domnișoara este minunată, rezultatul este vizibil.'),
]

# ======================================================================================= the explainers (SVG, step by step)
# Each scene is drawn in a 520 x 420 box. v2/pp.css moves it: .k1/.k2/.k3 appear from that step on, .o1/.o2/.o3 show only
# during that step, .h2/.h3 leave at that step, .lp loops while the scene plays; the rest is each scene's own (.a-<id>).
W = 520
SKIN, DERM, FAT, CELL, CELLS, MUS, MUSL = '#f5e2d8', '#fbeee6', '#fdf6ea', '#fffaf1', '#ead8b3', '#f3d8d2', '#e9c3bb'
TEAL, TEAL2, INK, WARM = '#14a596', '#5fd4c6', '#16181c', '#e9a58f'
FRAME = '<rect x=".5" y="118.5" width="519" height="301" rx="26" fill="none" stroke="rgba(11,11,13,.07)"/>'
FACE_D = 'M300 64 C356 64 392 104 392 160 C392 198 390 232 384 262 C370 292 344 334 300 342 C256 334 230 292 216 262 C208 232 208 198 208 160 C208 104 244 64 300 64Z'

def defs(sid, extra=''):
    return ('<defs><clipPath id="%s-c"><rect x="0" y="118" width="520" height="302" rx="26"/></clipPath>'
            '<radialGradient id="%s-g"><stop offset="0" stop-color="#14a596" stop-opacity=".55"/><stop offset=".5" stop-color="#5fd4c6" stop-opacity=".22"/><stop offset="1" stop-color="#5fd4c6" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="%s-w"><stop offset="0" stop-color="#f2a184" stop-opacity=".75"/><stop offset=".55" stop-color="#f6c2ad" stop-opacity=".3"/><stop offset="1" stop-color="#f6c2ad" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="%s-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fd4c6" stop-opacity=".05"/><stop offset="1" stop-color="#14a596" stop-opacity=".38"/></linearGradient>'
            '<clipPath id="%s-f"><path d="%s"/></clipPath>'
            '<radialGradient id="%s-s"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="%s-cool" x1="0" x2="1"><stop offset="0" stop-color="#bfece6" stop-opacity="0"/><stop offset=".5" stop-color="#bfece6" stop-opacity=".9"/><stop offset="1" stop-color="#bfece6" stop-opacity="0"/></linearGradient>'
            '%s</defs>') % (sid, sid, sid, sid, sid, FACE_D, sid, sid, extra)

def cells(rows, x0=20, dx=40, r=17, hit=None, cls=''):
    out = []
    for i, y in enumerate(rows):
        x = x0 + (0 if i % 2 == 0 else dx / 2)
        while x < W + r:
            c = cls
            if hit and math.hypot(x - hit[0], y - hit[1]) < hit[2]: c += ' hit'
            out.append('<circle class="cl%s" cx="%.0f" cy="%.0f" r="%d" fill="%s" stroke="%s" stroke-width="1.4"/>' % (c, x, y, r, CELL, CELLS))
            x += dx
    return ''.join(out)

def tissue(sid, skin=(118, 154), mus=(326, 420), rows=(182, 220, 258, 296), hit=None, extra=''):
    s = ['<g clip-path="url(#%s-c)">' % sid, '<rect x="0" y="118" width="520" height="302" fill="%s"/>' % FAT,
         '<rect x="0" y="%d" width="520" height="%d" fill="%s"/>' % (skin[0], skin[1] - skin[0], SKIN),
         '<rect x="0" y="%d" width="520" height="%d" fill="%s"/>' % (mus[0], mus[1] - mus[0], MUS),
         ''.join('<path d="M0 %d H520" stroke="%s" stroke-width="2"/>' % (y, MUSL) for y in range(mus[0] + 18, mus[1], 20)),
         '<path d="M0 %d.5H520M0 %d.5H520" stroke="rgba(150,110,90,.18)"/>' % (skin[1], mus[0])]
    if rows: s.append('<g class="cells">%s</g>' % cells(rows, hit=hit))
    s.append(extra + '</g>' + FRAME)
    return ''.join(s)

def device(x, y, w=104, h=46, cls='dev'):
    return ('<g class="%s"><path d="M%d %d C%d %d %d %d %d %d" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round"/><rect x="%d" y="%d" width="%d" height="%d" rx="16" fill="%s"/><rect x="%d" y="%d" width="%d" height="4" rx="2" fill="%s"/></g>'
            % (cls, x, y, x, y - 20, x + 30, y - 34, x + 80, y - 40, INK, x - w // 2, y, w, h, INK, x - w // 4, y + h - 9, w // 2, TEAL2))

LEG_C = {'piele': SKIN, 'derma': DERM, 'grasime': '#f3e6c6', 'muschi': MUS, 'energie': TEAL, 'caldura': WARM, 'folicul': '#5b4636', 'sebum': '#e8c86a', 'pigment': '#b98a6a', 'apa': '#7cc8e8', 'rosu': '#e07a7a'}
LEG_L = {'piele': 'Piele', 'derma': 'Dermă', 'grasime': 'Grăsime', 'muschi': 'Mușchi', 'energie': 'Energie', 'caldura': 'Căldură', 'folicul': 'Folicul', 'sebum': 'Sebum', 'pigment': 'Pigment', 'apa': 'Apă', 'rosu': 'Roșeață'}
def legend(*items): return '<ul class="tp-leg">%s</ul>' % ''.join('<li><i style="background:%s"></i>%s</li>' % (LEG_C[k], LEG_L[k]) for k in items)
def chip(x, y, w, text, cls):
    return '<g class="%s"><rect x="%d" y="%d" width="%d" height="40" rx="20" fill="#fff" stroke="rgba(11,11,13,.08)"/><text x="%d" y="%d" text-anchor="middle" font-size="17" font-weight="600" fill="%s">%s</text></g>' % (cls, x, y, w, x + w // 2, y + 26, INK, e(text))

def sc_liposonix(sid):
    cx, cy = 260, 238
    bits = ''.join('<circle class="bit k2" cx="%d" cy="%d" r="3.4" fill="%s" style="--dx:%dpx;--dy:%dpx;transition-delay:%dms"/>' % (cx + dx, cy + dy, TEAL2, 250 - dx, 70 - dy, 60 * i)
                   for i, (dx, dy) in enumerate([(-20, -12), (14, -18), (22, 8), (-8, 20), (-26, 10), (6, -2), (30, -6), (-12, -24)]))
    vessel = '<path class="k3" d="M0 312 C120 300 220 324 330 306 S470 296 520 304" fill="none" stroke="#e7b9ac" stroke-width="9" stroke-linecap="round" opacity=".7"/>'
    body = tissue(sid, hit=(cx, cy, 52), extra=vessel +
                  '<polygon class="k1 h3 beam" points="210,126 310,126 263,%d 257,%d" fill="url(#%s-b)"/>' % (cy, cy, sid) +
                  '<circle class="o2 focus lp" cx="%d" cy="%d" r="58" fill="url(#%s-g)"/>' % (cx, cy, sid) + bits)
    waves = ''.join('<path class="k1 h3 wv lp w%d" d="M230 116 Q260 128 290 116" fill="none" stroke="%s" stroke-width="2.4" stroke-linecap="round"/>' % (i, TEAL) for i in range(3))
    return body + waves + device(260, 64, cls='dev h3') + chip(330, 40, 168, '6-8 săptămâni', 'k3 wk'), legend('piele', 'grasime', 'muschi', 'energie')

def sc_cavitatie(sid):
    rings = ''.join('<circle class="k1 h3 ring lp r%d" cx="260" cy="122" r="40" fill="none" stroke="%s" stroke-width="2"/>' % (i, TEAL) for i in range(4))
    rnd = random.Random(7); bub = ''
    for i in range(26):
        x = rnd.randint(30, 500); y = rnd.randint(176, 310); r = rnd.choice([3, 4, 5, 6])
        bub += '<circle class="k2 h3 bub lp" cx="%d" cy="%d" r="%d" fill="rgba(255,255,255,.75)" stroke="%s" stroke-width="1.3" style="animation-delay:%dms;transition-delay:%dms"/>' % (x, y, r, TEAL2, rnd.randint(0, 1600), i * 40)
    flow = '<path class="k3" d="M0 318 C120 306 220 330 330 312 S470 302 520 310" fill="none" stroke="#e7b9ac" stroke-width="9" stroke-linecap="round" opacity=".7"/>' + ''.join('<circle class="k3 fl lp" cx="0" cy="314" r="4.5" fill="%s" style="animation-delay:%dms"/>' % (TEAL, i * 700) for i in range(4))
    body = tissue(sid, extra=rings + bub + flow)
    head = '<g class="dev h3"><path d="M260 70 C260 44 300 30 350 26" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round"/><circle cx="260" cy="88" r="32" fill="%s"/><circle cx="260" cy="88" r="18" fill="none" stroke="%s" stroke-width="2.5"/></g>' % (INK, INK, TEAL2)
    return body + head, legend('piele', 'grasime', 'muschi', 'energie')

def sc_ems(sid):
    fib = ''.join('<rect x="%d" y="%d" width="%d" height="22" rx="11" fill="#f0cdc6" stroke="#e2aea4" stroke-width="1.5"/>' % (x, y, w)
                  for (x, y, w) in [(14, 234, 150), (176, 234, 160), (348, 234, 160), (40, 264, 180), (232, 264, 150), (394, 264, 120), (14, 294, 130), (156, 294, 180), (348, 294, 160),
                                    (60, 324, 170), (242, 324, 170), (424, 324, 90), (14, 354, 150), (176, 354, 160), (348, 354, 160), (50, 384, 180), (242, 384, 160)])
    field = ''.join('<path class="k1 h3 fld lp" d="M%d 106 C%d %d %d %d %d 106" fill="none" stroke="%s" stroke-width="2" stroke-dasharray="6 9"/>' % (260 - w, 260 - w, 106 + d, 260 + w, 106 + d, 260 + w, TEAL) for (w, d) in [(60, 180), (110, 240), (160, 290)])
    body = tissue(sid, skin=(118, 148), mus=(214, 420), rows=(172, 200), extra='<g class="musc">' + fib + '</g>' + '<path class="k3 tone" d="M0 215 H520" stroke="#d98f80" stroke-width="3"/>')
    pad = '<g class="dev"><path d="M380 70 C400 40 430 30 470 28" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round"/><rect x="140" y="62" width="240" height="44" rx="20" fill="%s"/><ellipse cx="260" cy="84" rx="44" ry="10" fill="none" stroke="%s" stroke-width="2"/><ellipse cx="260" cy="84" rx="24" ry="5" fill="none" stroke="%s" stroke-width="2"/></g>' % (INK, INK, TEAL2, TEAL2)
    return body + field + pad + chip(12, 12, 236, 'până la 20.000 / ședință', 'k2 cnt'), legend('piele', 'grasime', 'muschi', 'energie')

def sc_radiofrecventa(sid):
    bumpy = 'M0 150 C20 140 40 140 60 150 S100 160 120 148 S160 136 180 150 S220 162 240 148 S280 136 300 150 S340 162 360 148 S400 136 420 150 S460 162 480 148 S510 140 520 148 V118 H0Z'
    flat = 'M0 146 C120 144 220 146 300 145 S440 144 520 146 V118 H0Z'
    sept = ''.join('<path d="M%d 152 L%d 318" stroke="#e5c9b8" stroke-width="3"/>' % (x, x + 4) for x in (60, 120, 180, 240, 300, 360, 420, 480))
    lob = ''.join('<ellipse class="lb" cx="%d" cy="226" rx="24" ry="54" fill="%s" stroke="%s" stroke-width="1.4"/>' % (x, CELL, CELLS) for x in (30, 90, 150, 210, 270, 330, 390, 450, 510))
    heat = ''.join('<circle class="k2 h3 ht lp" cx="%d" cy="166" r="76" fill="url(#%s-w)" style="animation-delay:%dms"/>' % (x, sid, i * 500) for i, x in enumerate((110, 260, 410)))
    coll_w = ''.join('<path class="h3" d="M%d 166 q10 -8 20 0 t20 0 t20 0" fill="none" stroke="#d9a38f" stroke-width="2"/>' % x for x in range(20, 500, 70))
    coll_t = ''.join('<path class="k3" d="M%d 166 h60" fill="none" stroke="#c9826c" stroke-width="2.4" stroke-linecap="round"/>' % x for x in range(20, 500, 70))
    arrows = ''.join('<path class="o1 pull" d="M%d 250 v26 m-6 -8 l6 8 l6 -8" fill="none" stroke="#c98b73" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' % x for x in (122, 242, 362))
    s = ['<g clip-path="url(#%s-c)">' % sid, '<rect x="0" y="118" width="520" height="302" fill="%s"/>' % FAT, lob, sept, arrows,
         '<rect x="0" y="318" width="520" height="102" fill="%s"/>' % MUS, ''.join('<path d="M0 %d H520" stroke="%s" stroke-width="2"/>' % (y, MUSL) for y in range(336, 420, 20)),
         '<rect x="0" y="146" width="520" height="40" fill="%s"/>' % DERM, heat, coll_w, coll_t,
         '<rect x="0" y="118" width="520" height="34" fill="%s"/>' % SKIN, '</g>',
         '<path class="h3" d="%s" fill="#fff"/>' % bumpy, '<path class="k3" d="%s" fill="#fff"/>' % flat, FRAME]
    hp = '<g class="k2 h3 roll lp"><rect x="200" y="74" width="120" height="44" rx="18" fill="%s"/><rect x="214" y="110" width="34" height="8" rx="4" fill="#f2a184"/><rect x="272" y="110" width="34" height="8" rx="4" fill="#f2a184"/><path d="M260 74 C260 52 300 40 350 36" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round"/></g>' % (INK, INK)
    return ''.join(s) + hp, legend('piele', 'grasime', 'muschi', 'caldura')

def sc_hifu_corp(sid):
    pts = ''.join('<g class="k1 pt" style="transition-delay:%dms"><circle cx="%d" cy="236" r="16" fill="url(#%s-g)"/><circle cx="%d" cy="236" r="3.6" fill="%s"/></g>' % (i * 180, x, sid, x, TEAL) for i, x in enumerate(range(70, 470, 50)))
    sag = 'M0 118 H520 V160 C400 168 320 176 260 176 S120 168 0 160Z'
    taut = 'M0 118 H520 V152 H0Z'
    small = '<g class="cells2">%s</g>' % cells((236,), x0=70, dx=50, r=13, cls=' hit')
    body = tissue(sid, skin=(118, 152), mus=(300, 420), rows=(186, 286), extra=small + pts + '<path d="M0 270 H520" stroke="#e6cdb0" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round"/>')
    skin = '<g clip-path="url(#%s-c)"><path class="h3" d="%s" fill="%s"/><path class="k3" d="%s" fill="%s"/></g>' % (sid, sag, SKIN, taut, SKIN)
    up = ''.join('<path class="k3 upa" d="M%d 108 v-30 m-8 10 l8 -10 l8 10" fill="none" stroke="%s" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' % (x, TEAL) for x in (130, 260, 390))
    cart = '<g class="k1 h3 slide lp"><rect x="30" y="62" width="90" height="44" rx="14" fill="%s"/><rect x="52" y="98" width="46" height="4" rx="2" fill="%s"/></g>' % (INK, TEAL2)
    return body + skin + up + cart, legend('piele', 'grasime', 'muschi', 'energie')

def sc_impachetare(sid):
    body = body_parts(False)[0]
    T = 'translate(260 6) scale(1.06) translate(-150 -222)'
    puffy = '<g class="h3"><path d="%s" transform="translate(260 0) scale(1.07 1) translate(-260 0) %s" fill="#f4d9ce" stroke="#e5bcae" stroke-width="2"/></g>' % (body, T)
    slim = '<g class="k3"><path d="%s" transform="%s" fill="%s" stroke="#e5c3b6" stroke-width="2"/></g>' % (body, T, SKIN)
    base = '<path d="%s" transform="%s" fill="%s" stroke="#e5c3b6" stroke-width="2"/>' % (body, T, SKIN)
    clip = '<clipPath id="%s-l"><path d="%s" transform="%s"/></clipPath><clipPath id="%s-r"><rect x="205" y="0" width="110" height="420"/></clipPath>' % (sid, body, T, sid)
    bands = '<g clip-path="url(#%s-l)"><g clip-path="url(#%s-r)">%s</g></g>' % (sid, sid, ''.join(
        '<rect class="k1 h3 bd" x="190" y="%d" width="140" height="34" rx="12" fill="#efb39d" style="transition-delay:%dms"/>' % (y, i * 240) for i, y in enumerate((70, 132, 194, 256, 318))))
    heat = ''.join('<path class="k1 h3 sh lp" d="M%d %d c-8 -10 8 -18 0 -28 s8 -18 0 -28" fill="none" stroke="#f2a184" stroke-width="2.4" stroke-linecap="round" style="animation-delay:%dms"/>' % (x, y, i * 400)
                   for i, (x, y) in enumerate(((168, 200), (190, 120), (352, 200), (330, 120))))
    flow = ''.join('<path class="k2 h3 up lp" d="M%d 400 C%d 320 %d 200 %d 70" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 14"/>' % (x, x - 2, x + 2, x, TEAL) for x in (238, 282))
    spark = '<g class="k3"><path d="M410 110l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" fill="%s"/><path d="M110 230l3.5 9 9 3.5-9 3.5-3.5 9-3.5-9-9-3.5 9-3.5z" fill="%s" opacity=".7"/></g>' % (TEAL2, TEAL2)
    fade = '<defs><linearGradient id="%s-t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fcfcfd"/><stop offset="1" stop-color="#fcfcfd" stop-opacity="0"/></linearGradient></defs><rect x="40" y="-2" width="440" height="70" fill="url(#%s-t)"/>' % (sid, sid)
    return '<defs>%s</defs>' % clip + base + puffy + slim + bands + heat + flow + spark + fade, legend('piele', 'caldura', 'energie')

def profile(fuller):
    """a face in profile, looking right; fuller = a softer chin and jaw line"""
    chin = ('C384 252 392 270 384 290 C376 312 348 326 318 330 C300 334 290 346 286 360' if fuller else
            'C384 252 396 270 392 286 C386 300 360 304 330 306 C312 308 298 330 290 360')
    return ('M300 20 C340 20 370 44 378 82 C382 102 380 118 390 134 L410 168 C414 176 408 180 400 182 L396 186 C402 194 398 200 394 204 '
            'C400 210 398 220 390 224 C386 234 388 244 384 252 ' + chin + ' L280 420 L120 420 C124 380 120 340 112 300 '
            'C96 250 90 190 104 130 C120 60 200 20 300 20Z')
PROF_FEAT = ('<path d="M352 112 q12 -6 24 0" fill="none" stroke="#b99a8c" stroke-width="2.4" stroke-linecap="round"/><path d="M360 128 q8 4 14 0" fill="none" stroke="#b99a8c" stroke-width="2" stroke-linecap="round"/>'
             '<path d="M380 214 q6 2 10 -1" fill="none" stroke="#c98f80" stroke-width="2.4" stroke-linecap="round"/><path d="M196 120 C210 98 240 86 262 92" fill="none" stroke="rgba(150,110,90,.22)" stroke-width="2"/>'
             '<path d="M334 22 C272 8 190 22 140 70 C104 104 94 162 102 216 C108 258 122 288 142 306 C150 264 152 226 162 194 C178 142 212 98 262 76 C300 60 344 56 376 64 C370 42 356 28 334 22Z" fill="#e7d8ce"/>')
def prof_face():
    return '<path class="h3" d="%s" fill="%s" stroke="#e3c3b4" stroke-width="2"/><path class="k3" d="%s" fill="%s" stroke="#e3c3b4" stroke-width="2"/>' % (profile(True), SKIN, profile(False), SKIN) + PROF_FEAT

def sc_hifu(sid):
    pts = ''.join('<g class="k1 pt" style="transition-delay:%dms"><circle cx="%d" cy="%d" r="15" fill="url(#%s-g)"/><circle cx="%d" cy="%d" r="3.6" fill="%s"/></g>' % (i * 170, x, y, sid, x, y, TEAL)
                  for i, (x, y) in enumerate([(356, 292), (336, 300), (316, 306), (296, 312), (348, 270), (328, 280), (308, 288)]))
    jaw = '<path class="k3 jw" d="M232 236 C268 286 330 300 384 288" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round" pathLength="100"/>' % TEAL
    arr = ''.join('<path class="k2 h3 upa" d="M%d %d l-10 -26 m-6 10 l6 -10 l10 6" fill="none" stroke="%s" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' % (x, y, TEAL) for (x, y) in [(330, 276), (296, 262)])
    tr = '<g class="o1 dev"><g transform="rotate(-24 420 340)"><rect x="370" y="318" width="110" height="40" rx="14" fill="%s"/><rect x="392" y="318" width="64" height="4" rx="2" fill="%s"/></g></g>' % (INK, TEAL2)
    return prof_face() + pts + arr + jaw + tr, legend('piele', 'energie')

def sc_rf_sculpt_gusa(sid):
    glow = '<ellipse class="k1 h3 gl lp" cx="318" cy="292" rx="70" ry="44" fill="url(#%s-w)"/>' % sid
    roller = '<g class="k1 h3 rol lp"><path d="M0 0 C10 20 30 40 60 60" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round" transform="translate(6 6)"/><circle cx="0" cy="0" r="16" fill="%s"/><circle cx="0" cy="0" r="7" fill="#f2a184"/></g>' % (INK, INK)
    strokes = ''.join('<path class="k2 h3 ms lp" d="M%d %d q24 -16 48 0" fill="none" stroke="#e9a58f" stroke-width="2.8" stroke-linecap="round" style="animation-delay:%dms"/>' % (x, y, i * 400) for i, (x, y) in enumerate([(262, 300), (302, 314), (342, 318)]))
    jaw = '<path class="k3 jw" d="M240 250 C280 296 340 306 384 292" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round" pathLength="100"/>' % TEAL
    return prof_face() + glow + strokes + roller + jaw, legend('piele', 'caldura')

def face_front(sag=False):
    jaw = ('C380 300 352 344 300 352 C248 344 220 300 216 262' if sag else 'C370 292 344 334 300 342 C256 334 230 292 216 262')
    return '<path d="M300 64 C356 64 392 104 392 160 C392 198 390 232 384 262 %s C208 232 208 198 208 160 C208 104 244 64 300 64Z" fill="%s" stroke="#e3c3b4" stroke-width="2"/>' % (jaw, SKIN)
FACE_FEAT = ('<path d="M244 160 q20 -12 40 0 M316 160 q20 -12 40 0" fill="none" stroke="#b99a8c" stroke-width="2.4" stroke-linecap="round"/>'
             '<path d="M248 186 q16 8 32 0 M320 186 q16 8 32 0" fill="none" stroke="#a88a7c" stroke-width="2.2" stroke-linecap="round"/>'
             '<path d="M300 196 C296 220 292 236 300 244" fill="none" stroke="#c9a597" stroke-width="2" stroke-linecap="round"/>'
             '<path d="M276 282 q24 14 48 0" fill="none" stroke="#c98f80" stroke-width="2.6" stroke-linecap="round"/>')
NECK = '<path d="M262 330 C264 360 260 392 252 420 H348 C340 392 336 360 338 330" fill="%s" stroke="#e3c3b4" stroke-width="2"/>' % SKIN
HAIR = '<path d="M300 40 C380 40 424 96 420 170 C418 214 420 250 430 300 C410 250 400 200 396 150 C384 100 340 82 300 84 C260 82 216 100 204 150 C200 200 190 250 170 300 C180 250 182 214 180 170 C176 96 220 40 300 40Z" fill="#e9dbd2"/>'

def sc_hifu_full_face(sid):
    P = [(260, 102), (300, 96), (340, 102), (236, 214), (256, 240), (364, 214), (344, 240), (240, 282), (270, 310), (330, 310), (360, 282), (284, 370), (316, 370)]
    pts = ''.join('<g class="k1 pt" style="transition-delay:%dms"><circle cx="%d" cy="%d" r="13" fill="url(#%s-g)"/><circle cx="%d" cy="%d" r="3.2" fill="%s"/></g>' % (i * 110, x, y, sid, x, y, TEAL) for i, (x, y) in enumerate(P))
    arr = ''.join('<path class="k2 h3 upa" d="M%d %d l%d -22 m%d 2 l%d -2 l2 9" fill="none" stroke="%s" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' % (x, y, d * 12, -d * 10, d * 10, TEAL)
                  for (x, y, d) in [(232, 262, -1), (368, 262, 1), (226, 200, -1), (374, 200, 1)])
    jaw = '<path class="k3 jw" d="M216 262 C230 292 256 334 300 342 C344 334 370 292 384 262" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round" pathLength="100"/>' % TEAL
    face = HAIR + NECK + '<g class="h3">%s</g><g class="k3">%s</g>' % (face_front(True), face_front(False)) + FACE_FEAT
    return face + pts + arr + jaw, legend('piele', 'energie')

def sc_biolifting_full_face(sid):
    mesh = ''.join('<path d="M210 %d C260 %d 340 %d 390 %d" fill="none" stroke="%s" stroke-width="1.4"/>' % (y, y - 8, y + 8, y, TEAL2) for y in range(110, 340, 28))
    mesh += ''.join('<path d="M%d 90 C%d 180 %d 260 %d 346" fill="none" stroke="%s" stroke-width="1.4"/>' % (x, x - 6, x + 6, x, TEAL2) for x in range(228, 380, 28))
    lines = '<g class="h3">' + ''.join('<path d="%s" fill="none" stroke="#c79c8c" stroke-width="1.8" stroke-linecap="round"/>' % d for d in ('M270 112 q30 -6 60 0', 'M276 124 q24 -5 48 0', 'M226 194 l-12 -6 M226 202 l-14 0', 'M374 194 l12 -6 M374 202 l14 0', 'M262 262 q-8 14 -4 26', 'M338 262 q8 14 4 26')) + '</g>'
    sweep = '<g clip-path="url(#%s-f)"><circle class="k1 sw lp" cx="300" cy="120" r="92" fill="url(#%s-w)"/><g class="k2 mesh">%s</g><rect class="k3 glow" x="200" y="60" width="200" height="290" fill="#fff"/></g>' % (sid, sid, mesh)
    return HAIR + NECK + face_front(False) + FACE_FEAT + lines + sweep, legend('piele', 'caldura', 'energie')

def sc_rf_sculpt_full_face(sid):
    strokes = ''.join('<path class="k2 ms" d="%s" fill="none" stroke="#e48e73" stroke-width="3" stroke-linecap="round" pathLength="100" style="transition-delay:%dms"/>' % (d, i * 220)
                      for i, d in enumerate(['M282 112 C260 104 240 108 226 120', 'M318 112 C340 104 360 108 374 120', 'M270 230 C246 214 230 200 222 176', 'M330 230 C354 214 370 200 378 176', 'M290 304 C258 300 236 284 224 262', 'M310 304 C342 300 364 284 376 262']))
    drain = ''.join('<path class="k2 dr lp" d="%s" fill="none" stroke="%s" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="3 12"/>' % (d, TEAL) for d in ('M226 262 C232 310 252 340 264 400', 'M374 262 C368 310 348 340 336 400'))
    warm = '<g clip-path="url(#%s-f)"><rect class="k1 h3 wm" x="200" y="60" width="200" height="290" fill="#f2a184"/><circle class="k3 tone" cx="300" cy="170" r="150" fill="url(#%s-s)"/></g>' % (sid, sid)
    return HAIR + NECK + '<g class="h3">%s</g><g class="k3">%s</g>' % (face_front(True), face_front(False)) + FACE_FEAT + warm + strokes + drain, legend('piele', 'caldura', 'energie')

def sc_biolifting(sid):
    deep = 'M0 118 H520 V150 L246 150 L260 198 L274 150 L520 150 V118Z'
    soft = 'M0 118 H520 V150 L274 150 Q260 162 246 150 L0 150Z'
    wavy = ''.join('<path class="h2" d="M%d %d q15 -12 30 0 t30 0 t30 0 t30 0" fill="none" stroke="#dba996" stroke-width="2.4"/>' % (x, y) for x in (20, 190, 360) for y in (206, 242, 278))
    tight = ''.join('<path class="k2" d="M%d %d h120" fill="none" stroke="#cf8f78" stroke-width="2.6" stroke-linecap="round"/>' % (x, y) for x in (20, 190, 360) for y in (206, 242, 278))
    new = ''.join('<path class="k3 nc" d="M%d %d h96" fill="none" stroke="%s" stroke-width="2.6" stroke-linecap="round" pathLength="100" style="transition-delay:%dms"/>' % (x, y, TEAL, i * 90) for i, (x, y) in enumerate([(40, 224), (210, 260), (370, 224), (80, 296), (250, 296), (400, 260)]))
    s = ['<g clip-path="url(#%s-c)">' % sid, '<rect x="0" y="118" width="520" height="302" fill="%s"/>' % DERM,
         '<rect x="0" y="322" width="520" height="98" fill="%s"/>' % FAT, cells((358, 400), r=18),
         '<circle class="k1 h3 ht lp" cx="260" cy="236" r="160" fill="url(#%s-w)"/>' % sid, wavy, tight, new,
         '<rect x="0" y="118" width="520" height="32" fill="%s"/>' % SKIN, '<g class="h3"><path d="M238 117 L260 188 L282 117Z" fill="#f9fafa" stroke="#dfbfb0" stroke-width="1.6" stroke-linejoin="round"/></g>', '<g class="k3"><path d="M238 117 Q260 132 282 117Z" fill="#f9fafa" stroke="#e6cdc0" stroke-width="1.4"/></g>', '</g>', FRAME]
    tip = '<g class="o1"><path d="M330 70 C330 48 370 36 420 32" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round"/><rect x="300" y="64" width="60" height="44" rx="16" fill="%s"/><rect x="314" y="104" width="32" height="6" rx="3" fill="#f2a184"/></g>' % (INK, INK)
    return ''.join(s) + tip, legend('piele', 'derma', 'caldura', 'energie')

def sc_restart(sid):
    flakes = ''.join('<rect class="h2 fk" x="%d" y="%d" width="%d" height="9" rx="4" fill="#efe2d6" stroke="#dcc8b8" transform="rotate(%d %d %d)" style="--fy:%dpx;transition-delay:%dms"/>' % (x, y, w, r, x, y, -40 - (i % 3) * 14, i * 60)
                     for i, (x, y, w, r) in enumerate([(30, 146, 40, -8), (90, 150, 34, 10), (150, 144, 44, -4), (214, 150, 30, 12), (270, 146, 42, -10), (336, 150, 36, 6), (396, 145, 40, -6), (456, 150, 34, 9)]))
    scat = ''.join('<path class="o1" d="M%d 146 l%d %d" stroke="#f2c14e" stroke-width="2.6" stroke-linecap="round"/>' % (x, dx, dy) for (x, dx, dy) in [(100, -34, -30), (190, 20, -40), (280, -10, -46), (370, 36, -26), (460, -30, -38)])
    inc = ''.join('<path d="M%d 40 L%d 146" stroke="#f2c14e" stroke-width="2.6" stroke-linecap="round" opacity=".55"/>' % (x, x + 60) for x in (40, 130, 220, 310, 400))
    refl = ''.join('<path class="k3" d="M%d 146 L%d 40" stroke="#f2c14e" stroke-width="2.6" stroke-linecap="round"/>' % (x + 60, x + 120) for x in (40, 130, 220, 310))
    drops = ''.join('<path class="k2 h3 dp lp" d="M%d 168 c0 0 -7 9 -7 14 a7 7 0 0 0 14 0 c0 -5 -7 -14 -7 -14z" fill="#8fd3ef" style="animation-delay:%dms"/>' % (x, i * 350) for i, x in enumerate((80, 200, 320, 440)))
    cellrow = ''.join('<rect class="sc" x="%d" y="%d" width="50" height="30" rx="12" fill="#fbefe7" stroke="#ecd2c4" stroke-width="1.4"/>' % (x + (28 if k % 2 else 0), y, ) for k, y in enumerate((170, 206, 242)) for x in range(-10, 520, 56))
    s = ['<g clip-path="url(#%s-c)">' % sid, '<rect x="0" y="118" width="520" height="302" fill="%s"/>' % DERM, '<g class="plump">%s</g>' % cellrow,
         '<rect x="0" y="282" width="520" height="138" fill="%s"/>' % FAT, cells((318, 360, 402), r=18), drops,
         '<rect x="0" y="118" width="520" height="32" fill="%s"/>' % SKIN, '<rect class="k3 sheen" x="0" y="118" width="520" height="32" fill="#fffaf5"/>', '</g>', FRAME]
    return inc + ''.join(s) + flakes + scat + refl, legend('piele', 'derma', 'apa')

def sc_hidratare(sid):
    bricks = ''.join('<rect x="%d" y="%d" width="70" height="26" rx="10" fill="#f8e7dc" stroke="#e6cbbb" stroke-width="1.4"/>' % (x + 5, y)
                     for r, y in enumerate((150, 184, 218)) for x in range(-20 + (r % 2) * 40, 520, 80))
    mortar = ''.join('<path class="k3" d="M0 %d H520" stroke="%s" stroke-width="4" stroke-linecap="round" opacity=".6"/>' % (y, TEAL2) for y in (180, 214, 248))
    out = ''.join('<path class="o1 es lp" d="M%d 146 v-26 m-6 8 l6 -8 l6 8" fill="none" stroke="#7cc8e8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="animation-delay:%dms"/>' % (x, i * 300) for i, x in enumerate((90, 210, 330, 450)))
    inn = ''.join('<path class="k2 h3 dp lp" d="M%d 60 c0 0 -8 10 -8 16 a8 8 0 0 0 16 0 c0 -6 -8 -16 -8 -16z" fill="#8fd3ef" style="animation-delay:%dms"/>' % (x, i * 280) for i, x in enumerate((70, 170, 270, 370, 470)))
    s = ['<g clip-path="url(#%s-c)">' % sid, '<rect x="0" y="118" width="520" height="302" fill="%s"/>' % DERM, '<rect class="k2 wet" x="0" y="118" width="520" height="160" fill="#d9f0fa"/>', '<g class="plump">%s</g>' % bricks, mortar,
         '<rect x="0" y="290" width="520" height="130" fill="%s"/>' % FAT, cells((330, 372, 414), r=18), '</g>', FRAME]
    shield = '<path class="k3" d="M0 146 H520" stroke="%s" stroke-width="5" stroke-linecap="round"/>' % TEAL
    return ''.join(s) + shield + out + inn, legend('piele', 'derma', 'apa')

def sc_antirid(sid):
    deep = 'M0 118 H520 V152 L424 152 L404 196 L384 152 L282 152 L256 212 L230 152 L126 152 L104 200 L82 152 L0 152Z'
    soft = 'M0 118 H520 V152 L424 152 Q404 162 384 152 L282 152 Q256 168 230 152 L126 152 Q104 164 82 152 L0 152Z'
    rise = ''.join('<circle class="k2 h3 rs lp" cx="%d" cy="306" r="9" fill="#fbefe7" stroke="%s" stroke-width="1.6" style="animation-delay:%dms"/>' % (x, TEAL2, i * 380) for i, x in enumerate((70, 150, 230, 310, 390, 470)))
    old = ''.join('<rect class="h3" x="%d" y="%d" width="46" height="18" rx="7" fill="#f3e2d6" stroke="#e3c9b8"/>' % (x, y) for k, y in enumerate((166, 194)) for x in range(4 + k * 26, 520, 52))
    new = ''.join('<rect class="k3" x="%d" y="%d" width="46" height="22" rx="9" fill="#fff4ec" stroke="#ebcdbc"/>' % (x, y) for k, y in enumerate((164, 192)) for x in range(4 + k * 26, 520, 52))
    spark = ''.join('<path class="k2 sp" d="M%d %d l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" fill="%s" style="transition-delay:%dms"/>' % (x, y, TEAL2, i * 200) for i, (x, y) in enumerate([(130, 236), (300, 252), (440, 230)]))
    s = ['<g clip-path="url(#%s-c)">' % sid, '<rect x="0" y="118" width="520" height="302" fill="%s"/>' % DERM, old, new,
         '<path d="M0 320 H520" stroke="#e6c7b6" stroke-width="3" stroke-dasharray="1 9" stroke-linecap="round"/>', rise, spark,
         '<rect x="0" y="118" width="520" height="34" fill="%s"/>' % SKIN, '<g class="h3"><path d="M84 117 L104 164 L124 117Z" fill="#f9fafa" stroke="#dfbfb0" stroke-width="1.6" stroke-linejoin="round"/><path d="M230 117 L256 178 L282 117Z" fill="#f9fafa" stroke="#dfbfb0" stroke-width="1.6" stroke-linejoin="round"/><path d="M384 117 L404 162 L424 117Z" fill="#f9fafa" stroke="#dfbfb0" stroke-width="1.6" stroke-linejoin="round"/></g>', '<g class="k3"><path d="M84 117 Q104 132 124 117Z" fill="#f9fafa" stroke="#e6cdc0" stroke-width="1.4"/><path d="M230 117 Q256 132 282 117Z" fill="#f9fafa" stroke="#e6cdc0" stroke-width="1.4"/><path d="M384 117 Q404 132 424 117Z" fill="#f9fafa" stroke="#e6cdc0" stroke-width="1.4"/></g>',
         '<rect x="0" y="340" width="520" height="80" fill="%s"/>' % FAT, cells((376, 414), r=18), '</g>', FRAME]
    return ''.join(s), legend('piele', 'derma', 'energie')

def sc_redness(sid):
    caps = ''.join('<path d="M%d %d c20 -14 30 14 50 0 s30 14 50 0 s30 -14 50 0" fill="none" stroke="#e07a7a" stroke-width="3" stroke-linecap="round"/>' % (x, y) for (x, y) in [(20, 200), (200, 230), (340, 196), (70, 266), (300, 274)])
    s = ['<g clip-path="url(#%s-c)">' % sid, '<rect x="0" y="118" width="520" height="302" fill="%s"/>' % DERM, '<g class="caps">%s</g>' % caps,
         '<rect x="0" y="310" width="520" height="110" fill="%s"/>' % FAT, cells((346, 390), r=18),
         '<rect x="0" y="118" width="520" height="38" fill="%s"/>' % SKIN, '<rect class="red" x="0" y="118" width="520" height="150" fill="#ef9a94"/>',
         '<rect class="k2 h3 cool lp" x="-200" y="118" width="200" height="200" fill="url(#%s-cool)"/>' % sid, '</g>', FRAME]
    bar = '<path class="k3" d="M0 156 H520" stroke="%s" stroke-width="5" stroke-linecap="round"/>' % TEAL
    leaf = '<g class="k2"><circle cx="452" cy="64" r="30" fill="#e8f7f4"/><path d="M440 76c0-14 10-24 24-24 0 14-10 24-24 24zM440 76l12-12" fill="none" stroke="%s" stroke-width="2.4" stroke-linecap="round"/></g>' % TEAL
    return ''.join(s) + bar + leaf, legend('piele', 'rosu', 'energie')

def sc_sebum_off(sid):
    pore = 'M0 118 H520 V150 H320 C292 150 284 170 278 210 C274 236 268 250 260 250 C252 250 246 236 242 210 C236 170 228 150 200 150 H0Z'
    plug = '<g class="h2 plug"><path d="M236 150 C244 160 246 190 250 214 C254 236 266 236 270 214 C274 190 276 160 284 150Z" fill="#e8c86a"/><circle cx="260" cy="146" r="10" fill="#d9b04a"/></g>'
    infl = '<circle class="o1 inf lp" cx="260" cy="214" r="84" fill="#ef9a94"/>'
    gland = '<ellipse cx="222" cy="282" rx="26" ry="18" fill="#f3e3b5" stroke="#e2c98a" stroke-width="1.6"/><ellipse cx="298" cy="282" rx="26" ry="18" fill="#f3e3b5" stroke="#e2c98a" stroke-width="1.6"/>'
    drop = '<circle class="k3 sd lp" cx="260" cy="250" r="5" fill="#e8c86a"/>'
    bub = ''.join('<circle class="o2 bb lp" cx="%d" cy="%d" r="%d" fill="#fff" stroke="%s" stroke-width="1.4" style="animation-delay:%dms"/>' % (x, y, r, TEAL2, i * 260) for i, (x, y, r) in enumerate([(248, 226, 6), (272, 204, 5), (256, 184, 7), (266, 238, 4), (252, 164, 5)]))
    s = ['<g clip-path="url(#%s-c)">' % sid, '<rect x="0" y="118" width="520" height="302" fill="%s"/>' % DERM, infl, gland,
         '<rect x="0" y="330" width="520" height="90" fill="%s"/>' % FAT, cells((366, 408), r=18),
         '<path d="%s" fill="%s"/>' % (pore, SKIN), plug, drop, bub, '</g>', FRAME]
    ok = '<g class="k3"><circle cx="452" cy="64" r="30" fill="#e8f7f4"/><path d="M438 64l9 9 18-18" fill="none" stroke="%s" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>' % TEAL
    return ''.join(s) + ok, legend('piele', 'sebum', 'rosu')

def sc_microneedling(sid):
    spots = ''.join('<ellipse cx="%d" cy="%d" rx="%d" ry="7" fill="#b98a6a"/>' % (x, y, rx) for (x, y, rx) in [(80, 138, 26), (210, 140, 20), (330, 137, 30), (450, 139, 22)])
    ch = ''.join('<path class="k1 ch" d="M%d 156 v40" stroke="#c98f80" stroke-width="2" stroke-linecap="round" style="transition-delay:%dms"/>' % (x, (i % 8) * 80) for i, x in enumerate(range(40, 500, 32)))
    parts = ''.join('<circle class="k2 h3 pr lp" cx="%d" cy="150" r="4.5" fill="%s" style="animation-delay:%dms"/>' % (x, TEAL, (i % 5) * 260) for i, x in enumerate(range(56, 500, 64)))
    s = ['<g clip-path="url(#%s-c)">' % sid, '<rect x="0" y="118" width="520" height="302" fill="%s"/>' % DERM,
         '<rect x="0" y="300" width="520" height="120" fill="%s"/>' % FAT, cells((338, 382), r=18),
         '<rect x="0" y="118" width="520" height="40" fill="%s"/>' % SKIN, '<g class="spots">%s</g>' % spots, ch, parts,
         '<rect class="k3 sheen" x="0" y="118" width="520" height="40" fill="#fff6f0"/>', '</g>', FRAME]
    pen = '<g class="o1 pen lp"><rect x="200" y="40" width="120" height="50" rx="16" fill="%s"/>%s</g>' % (INK, ''.join('<path d="M%d 90 v10" stroke="#8a8f98" stroke-width="2"/>' % x for x in range(214, 310, 12)))
    sun = '<g class="k3"><circle cx="452" cy="64" r="30" fill="#fff3d6"/><g transform="translate(440 52)" color="#d99a1e">%s</g></g>' % icon('sun').replace('class="ic"', 'width="24" height="24"')
    return ''.join(s) + pen + sun, legend('piele', 'pigment', 'energie')

def sc_periocular(sid):
    eye = ('<path d="M90 180 C150 120 300 110 400 170" fill="none" stroke="#b99a8c" stroke-width="3" stroke-linecap="round"/>'
           '<path d="M120 196 C200 232 320 230 390 186" fill="none" stroke="#a88a7c" stroke-width="3.4" stroke-linecap="round"/>'
           + ''.join('<path d="M%d %d l%d 16" stroke="#7d665a" stroke-width="2.4" stroke-linecap="round"/>' % (x, y, d) for (x, y, d) in [(150, 212, -4), (180, 222, -3), (210, 228, -1), (240, 230, 0), (270, 229, 1), (300, 225, 2), (330, 216, 3), (356, 204, 4)]))
    dark = '<path class="dk" d="M120 214 C200 268 320 266 392 206 C380 262 320 300 250 300 C180 300 132 262 120 214Z" fill="#a98a9c"/>'
    lines = '<g class="h3">' + ''.join('<path d="%s" fill="none" stroke="#c79c8c" stroke-width="2" stroke-linecap="round"/>' % d for d in ('M410 170 l38 -12', 'M412 186 l40 2', 'M408 200 l36 14')) + '</g>'
    pts = [(x, 250 + int(18 * math.sin(x / 40))) for x in range(150, 380, 20)] + [(x, 276 + int(10 * math.sin(x / 50))) for x in range(180, 350, 24)]
    dots = ''.join('<circle class="k1 h3 nd" cx="%d" cy="%d" r="3" fill="#c98f80" style="transition-delay:%dms"/>' % (x, y, i * 50) for i, (x, y) in enumerate(pts))
    drops = ''.join('<circle class="k2 h3 hy lp" cx="%d" cy="%d" r="5" fill="#8fd3ef" style="animation-delay:%dms"/>' % (x, y, i * 300) for i, (x, y) in enumerate([(190, 244), (250, 262), (310, 256), (360, 236)]))
    bg = '<rect x="0" y="20" width="520" height="380" rx="26" fill="%s"/><path d="M60 110 C160 70 320 60 450 100" fill="none" stroke="#d8bfb2" stroke-width="10" stroke-linecap="round"/>' % SKIN
    glow = '<ellipse class="k3 gw" cx="256" cy="260" rx="160" ry="56" fill="url(#xperiocular-s)"/>'
    return bg + dark + glow + eye + lines + dots + drops, legend('piele', 'apa', 'energie')

def sc_masaj_facial(sid):
    bust = '<path d="M120 420 C130 372 190 352 252 344 C262 330 264 300 262 240 H338 C336 300 338 330 348 344 C410 352 470 372 480 420Z" fill="%s" stroke="#e3c3b4" stroke-width="2"/>' % SKIN
    head = '<path d="M300 40 C350 40 388 76 388 132 C388 172 384 206 374 232 C360 268 334 292 300 298 C266 292 240 268 226 232 C216 206 212 172 212 132 C212 76 250 40 300 40Z" fill="%s" stroke="#e3c3b4" stroke-width="2"/>' % SKIN
    hr = '<path d="M300 22 C372 22 410 70 404 140 C392 100 360 70 300 70 C240 70 208 100 196 140 C190 70 228 22 300 22Z" fill="#e9dbd2"/>'
    feat = '<path d="M252 138 q16 8 32 0 M316 138 q16 8 32 0" fill="none" stroke="#a88a7c" stroke-width="2.4" stroke-linecap="round"/><path d="M280 228 q20 10 40 0" fill="none" stroke="#c98f80" stroke-width="2.6" stroke-linecap="round"/>'
    def orb(cx, cy, r, d): return '<g class="o1 orb lp" style="transform-origin:%dpx %dpx;animation-delay:%dms"><circle cx="%d" cy="%d" r="18" fill="#e48e73" opacity=".2"/><circle cx="%d" cy="%d" r="8" fill="#e48e73"/></g>' % (cx, cy, d, cx + r, cy, cx + r, cy)
    s1 = orb(300, 64, 40, 0) + orb(258, 180, 24, 300) + orb(342, 180, 24, 600)
    st = ''.join('<path class="k2 ms" d="%s" fill="none" stroke="#e48e73" stroke-width="3" stroke-linecap="round" pathLength="100" style="transition-delay:%dms"/>' % (d, i * 260) for i, d in enumerate(['M300 300 V344', 'M276 304 C270 322 262 334 250 346', 'M324 304 C330 322 338 334 350 346', 'M230 372 C260 360 340 360 370 372', 'M210 396 C260 384 340 384 390 396']))
    calm = ''.join('<circle class="k3 br lp" cx="300" cy="170" r="150" fill="none" stroke="%s" stroke-width="2" style="animation-delay:%dms"/>' % (TEAL2, i * 1200) for i in range(3))
    return calm + bust + hr + head + feat + s1 + st, legend('piele', 'caldura', 'energie')

def sc_epilare(sid):
    fol, hair = '', ''
    for i, x in enumerate((130, 260, 390)):
        fol += ('<g class="fo">' +
                '<path d="M%d 300 C%d 260 %d 200 %d 148" stroke="#e2c6b6" stroke-width="18" stroke-linecap="round" fill="none"/>' % (x, x - 2, x + 2, x) +
                '<path class="shaft" d="M%d 300 C%d 260 %d 200 %d 118" stroke="#3a2c24" stroke-width="5" stroke-linecap="round" fill="none"/>' % (x, x - 2, x + 2, x) +
                '<ellipse class="bulb" cx="%d" cy="306" rx="16" ry="20" fill="#5b4636"/>' % x +
                '<ellipse class="k2 h3 bglow" cx="%d" cy="306" rx="38" ry="42" fill="url(#%s-w)"/>' % (x, sid) +
                '<circle class="o2 hd lp" cx="%d" cy="150" r="7" fill="#f28a5c" style="animation-delay:%dms"/>' % (x, i * 260) + '</g>')
        hair += '<path class="h3 hr" d="M%d 122 C%d 100 %d 84 %d 66" stroke="#3a2c24" stroke-width="5" stroke-linecap="round" fill="none"/>' % (x, x + 4, x + 10, x + 20)
    s = ['<g clip-path="url(#%s-c)">' % sid, '<rect x="0" y="118" width="520" height="302" fill="%s"/>' % DERM,
         '<rect x="0" y="350" width="520" height="70" fill="%s"/>' % FAT, '<rect x="0" y="118" width="520" height="30" fill="%s"/>' % SKIN,
         fol, '<rect class="k3 sheen" x="0" y="118" width="520" height="30" fill="#fff6f0"/>', '</g>', FRAME]
    beam = '<polygon class="o1 lz lp" points="150,62 370,62 470,148 50,148" fill="#f28a5c"/>'
    hp = '<g class="h3"><rect x="170" y="20" width="180" height="42" rx="16" fill="%s"/><rect x="200" y="56" width="120" height="6" rx="3" fill="#8fd3ef"/></g>' % INK
    cool = '<g class="o1"><rect x="380" y="18" width="128" height="34" rx="17" fill="#eef8fd"/><text x="444" y="41" text-anchor="middle" font-size="15.5" font-weight="600" fill="#2b7fa3">răcire activă</text></g>'
    return ''.join(s) + hair + beam + hp + cool, legend('piele', 'folicul', 'caldura')

SCENES = {'liposonix': sc_liposonix, 'cavitatie': sc_cavitatie, 'ems': sc_ems, 'radiofrecventa': sc_radiofrecventa, 'hifu-corp': sc_hifu_corp,
          'impachetare': sc_impachetare, 'hifu': sc_hifu, 'rf-sculpt-gusa': sc_rf_sculpt_gusa, 'biolifting': sc_biolifting,
          'hifu-full-face': sc_hifu_full_face, 'biolifting-full-face': sc_biolifting_full_face, 'rf-sculpt-full-face': sc_rf_sculpt_full_face,
          'restart': sc_restart, 'masaj-facial': sc_masaj_facial, 'hidratare': sc_hidratare, 'antirid': sc_antirid, 'redness': sc_redness,
          'sebum-off': sc_sebum_off, 'microneedling': sc_microneedling, 'periocular': sc_periocular, 'epilare': sc_epilare}
VIEW = {'hifu-full-face': '120 30 360 390', 'biolifting-full-face': '120 30 360 390', 'rf-sculpt-full-face': '120 30 360 390', 'masaj-facial': '100 0 400 420',
        'hifu': '90 10 420 410', 'rf-sculpt-gusa': '90 10 420 410', 'impachetare': '40 0 440 420', 'periocular': '0 10 520 400'}

def scene(x):
    a = x['how'].get('anim') or x['id']
    sid = 'x' + re.sub(r'[^a-z0-9]', '', a)
    body, leg = SCENES[a](sid)
    label = 'Cum funcționează %s: %s.' % (x['name'], '; '.join(s['b'] + ' ' + s['t'] for s in x['how']['steps']))
    return a, '<svg class="tp-sv" viewBox="%s" role="img" aria-label="%s">%s%s</svg>' % (VIEW.get(a, '0 0 520 420'), e(label), defs(sid), body), leg

# ======================================================================================= the maps (body, face)
def spline(pts, closed=True):
    """a smooth path through the points (Catmull-Rom as cubic Béziers)"""
    n = len(pts); d = 'M%.1f %.1f' % pts[0]
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n] if (closed or i > 0) else pts[i]; p1 = pts[i]; p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n] if (closed or i + 2 < n) else p2
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6); c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += ' C%.1f %.1f %.1f %.1f %.1f %.1f' % (c1[0], c1[1], c2[0], c2[1], p2[0], p2[1])
    return d + ('Z' if closed else '')
def body_parts(m=False):
    """a calm front silhouette in a 300 x 610 box, one outline (neck, arms, legs); m = broader shoulders, straighter waist"""
    k = 1 if not m else 0
    R = [(161, 84), (162, 102), (180 + 8 * (1 - k), 110), (198 + 10 * (1 - k), 118), (209 + 10 * (1 - k), 134), (213 + 10 * (1 - k), 172), (218 + 8 * (1 - k), 236),
         (225 + 6 * (1 - k), 296), (229 + 6 * (1 - k), 334), (233 + 6 * (1 - k), 358), (227 + 6 * (1 - k), 376), (219 + 6 * (1 - k), 362), (217 + 6 * (1 - k), 334),
         (208 + 6 * (1 - k), 294), (203 + 6 * (1 - k), 238), (196 + 8 * (1 - k), 172), (190 + 8 * (1 - k), 168), (188 + 8 * (1 - k), 200), (178 + 12 * (1 - k), 246),
         (196 - 2 * (1 - k), 300), (197 - 2 * (1 - k), 352), (186, 420), (183, 456), (188, 512), (178, 572), (176, 588), (182, 600), (157, 600), (158, 584),
         (159, 514), (160, 456), (159, 404), (155, 350), (150, 340)]
    L = [(300 - x, y) for x, y in reversed(R[:-1])]
    head = 'M150 20 C168 20 180 35 180 56 C180 78 167 94 150 94 C133 94 120 78 120 56 C120 35 132 20 150 20Z'
    return [spline(R + L), head]

BODY_Z = {  # zone → (side, shape, geometry) in the 300 x 610 box of one figure
 'Abdomen': ('f', 'ellipse', (150, 262, 30, 30)), 'Flancuri': ('f', 'pair', (150, 262, 30, 9, 24)), 'Coapse': ('f', 'pair', (150, 396, 25, 21, 40)),
 'Brațe': ('f', 'pair', (150, 204, 58, 11, 36)), 'Gambe': ('f', 'pair', (150, 512, 23, 13, 34)), 'Zona lombară': ('b', 'ellipse', (150, 264, 32, 20)),
 'Fese': ('b', 'pair', (150, 320, 22, 22, 24)), 'Zona sutien': ('b', 'ellipse', (150, 190, 40, 14)),
}
EPI_Z = {
 'full-body': ('f', 'all', None), 'axile': ('f', 'pair', (150, 168, 43, 8, 11)), 'antebrate': ('f', 'pair', (150, 294, 66, 10, 30)), 'brate-total': ('f', 'pair', (150, 250, 61, 13, 100)),
 'maini-laba-piciorului': ('f', 'pair', (150, 358, 76, 10, 17)), 'areole-mamare': ('f', 'pair', (150, 184, 17, 7, 7)), 'piept': ('f', 'ellipse', (150, 184, 34, 20)),
 'umeri': ('f', 'pair', (150, 122, 46, 15, 11)), 'abdomen': ('f', 'ellipse', (150, 262, 30, 30)), 'linie-bikini': ('f', 'ellipse', (150, 322, 26, 9)),
 'linia-alba': ('f', 'ellipse', (150, 286, 4, 26)), 'inghinal-total': ('f', 'ellipse', (150, 330, 22, 14)), 'fese': ('b', 'pair', (150, 320, 22, 22, 24)),
 'labii-interfesieri': ('b', 'ellipse', (150, 338, 7, 16)), 'zona-lombara': ('b', 'ellipse', (150, 264, 32, 20)), 'spate-integral': ('b', 'ellipse', (150, 196, 44, 72)),
 'picior-scurt': ('f', 'pair', (150, 516, 23, 15, 46)), 'picior-lung': ('f', 'pair', (150, 466, 23, 22, 124)), 'fata-complet': ('f', 'ellipse', (150, 56, 28, 34)),
 'contur-barba-gat': ('f', 'ellipse', (150, 92, 18, 12)),
}
EPI_DOTS = ('fata-complet', 'axile', 'brate-total', 'piept', 'abdomen', 'inghinal-total', 'picior-lung', 'spate-integral', 'zona-lombara', 'fese', 'umeri', 'contur-barba-gat')

def region(shape, g, key):
    if shape == 'ellipse':
        return '<ellipse class="rg" data-tp-region="%s" cx="%d" cy="%d" rx="%d" ry="%d"/>' % (e(key), g[0], g[1], g[2], g[3])
    if shape == 'pair':
        return ''.join('<ellipse class="rg" data-tp-region="%s" cx="%d" cy="%d" rx="%d" ry="%d"/>' % (e(key), g[0] + s * g[2], g[1], g[3], g[4]) for s in (-1, 1))
    return ''
def dot(x, y, key, label, gattr=''):
    return ('<g class="hs" data-tp-zone="%s"%s aria-label="%s"><circle class="hit" cx="%d" cy="%d" r="20"/><circle class="ring" cx="%d" cy="%d" r="11"/><circle class="pt" cx="%d" cy="%d" r="5"/></g>'
            % (e(key), gattr, e(label), x, y, x, y, x, y))
def dot_at(shape, g):
    return (g[0], g[1]) if shape == 'ellipse' else (g[0] + g[2], g[1])

def body_map(keys, sid, epi=False, labels=None, genders=None):
    Z = EPI_Z if epi else BODY_Z
    sides = ['f', 'b'] if any(Z.get(k, ('',))[0] == 'b' for k in keys) else ['f']
    figs = []
    for n, side in enumerate(sides):
        sil = ''
        for g in (('w', 'm') if epi else ('w',)):
            parts = body_parts(g == 'm')
            mark = ('<path d="M150 112 V318" fill="none" stroke="rgba(150,110,90,.28)" stroke-width="1.6" stroke-dasharray="3 6"/>' if side == 'b'
                    else '<path d="M147 270 q3 3 6 0" fill="none" stroke="rgba(150,110,90,.45)" stroke-width="1.6" stroke-linecap="round"/>')
            sil += '<g class="fig%s">%s%s</g>' % (' g-' + g if epi else '', ''.join('<path d="%s"/>' % d for d in parts), mark)
        clip = '<clipPath id="%s-%s">%s</clipPath>' % (sid, side, ''.join('<path d="%s"/>' % d for d in body_parts(False)))
        regs = ''.join(region(Z[k][1], Z[k][2], k) for k in keys if k in Z and Z[k][0] == side)
        if epi and 'full-body' in keys: regs += '<rect class="rg" data-tp-region="full-body" x="0" y="100" width="300" height="510"/>'
        dots = ''
        for k in keys:
            if k not in Z or Z[k][0] != side or Z[k][1] not in ('ellipse', 'pair'): continue
            if epi and k not in EPI_DOTS: continue
            x, y = dot_at(Z[k][1], Z[k][2])
            dots += dot(x, y, k, (labels or {}).get(k, k), (' data-gx="%s"' % genders[k]) if epi else '')
        figs.append('<g transform="translate(%d 0)"><defs>%s</defs>%s<g clip-path="url(#%s-%s)">%s</g>%s<text class="cap" x="150" y="640" text-anchor="middle">%s</text></g>'
                    % (n * 300, clip, sil, sid, side, regs, dots, 'Față' if side == 'f' else 'Spate'))
    return '<svg class="tp-body" viewBox="-6 6 %d 650" role="img" aria-label="Zonele tratabile">%s</svg>' % (300 * len(sides) + 12, ''.join(figs))

FACE_Z = {  # zone → (shape, geometry, dot position) in the bust drawing
 'Scalp': ('path', 'M204 120 C206 70 248 40 300 40 C352 40 394 70 396 120 C380 92 344 82 300 84 C256 82 220 92 204 120Z', (300, 58)),
 'Frunte': ('ellipse', (300, 118, 66, 26), (300, 114)), 'Periocular': ('pair', (300, 170, 44, 30, 16), (344, 172)),
 'Pomeți': ('pair', (300, 218, 60, 26, 20), (360, 216)), 'Față': ('path', FACE_D, (300, 236)),
 'Contur mandibular': ('path', 'M214 262 C230 300 256 334 300 342 C344 334 370 300 386 262 L374 256 C362 290 340 322 300 328 C260 322 238 290 226 256Z', (362, 300)),
 'Gușă': ('ellipse', (300, 350, 44, 16), (300, 352)), 'Gât': ('ellipse', (300, 390, 38, 22), (300, 394)),
 'Decolteu': ('ellipse', (300, 448, 110, 26), (300, 446)), 'Perioral': ('ellipse', (300, 282, 40, 20), (300, 282)),
}
def face_map(show, tappable):
    hd = ('<path class="hair" d="M300 40 C380 40 424 96 420 170 C418 214 420 250 430 300 C410 250 400 200 396 150 C384 100 340 82 300 84 C260 82 216 100 204 150 C200 200 190 250 170 300 C180 250 182 214 180 170 C176 96 220 40 300 40Z"/>'
          '<path class="sk" d="M130 480 C136 440 200 424 252 414 C262 398 264 372 262 330 H338 C336 372 338 398 348 414 C400 424 464 440 470 480Z"/>'
          '<path class="sk" d="%s"/>' % FACE_D +
          '<path class="ft" d="M244 160 q20 -12 40 0 M316 160 q20 -12 40 0"/><path class="ft" d="M248 186 q16 8 32 0 M320 186 q16 8 32 0"/>'
          '<path class="ft" d="M300 196 C296 220 292 236 300 244"/><path class="ft lip" d="M276 282 q24 14 48 0"/>')
    regs, dots = '', ''
    for z in show:
        if z not in FACE_Z: continue
        kind, g, (lx, ly) = FACE_Z[z]
        if kind == 'path': regs += '<path class="rg" data-tp-region="%s" d="%s"/>' % (e(z), g)
        elif kind == 'ellipse': regs += '<ellipse class="rg" data-tp-region="%s" cx="%d" cy="%d" rx="%d" ry="%d"/>' % (e(z), g[0], g[1], g[2], g[3])
        else: regs += ''.join('<ellipse class="rg" data-tp-region="%s" cx="%d" cy="%d" rx="%d" ry="%d"/>' % (e(z), g[0] + s * g[2], g[1], g[3], g[4]) for s in (-1, 1))
        if tappable: dots += dot(lx, ly, z, z)
    return '<svg class="tp-face" viewBox="130 24 340 466" role="img" aria-label="Zonele tratate">%s<g class="rgs">%s</g>%s</svg>' % (hd, regs, dots)

# ======================================================================================= the page
def eyebrow(t, cls=''): return '<p class="tp-eye%s">%s</p>' % (cls, e(t))
def head(eye, h2, lead='', cls=''):
    return '<header class="tp-head%s">%s<h2>%s</h2>%s</header>' % (cls, eyebrow(eye), h2, '<p class="tp-lead">%s</p>' % e(lead) if lead else '')
def bf(full): return lei(full * (100 - PCT) / 100)

def buybox(x, zones, sess, full, epi):
    out = ['<div class="tp-buy" data-tp-buy id="cumpara">',
           '<div class="tp-buy-h"><span class="tp-bf"><i></i>Black Friday</span><div class="tp-tm" data-tp-tm aria-label="Timpul rămas"><span>Se încheie în</span>'
           '<b data-u="0">00</b><small>z</small><b data-u="1">00</b><small>h</small><b data-u="2">00</b><small>m</small><b data-u="3">00</b><small>s</small></div></div>']
    if epi:
        out.append('<div class="tp-opt"><p class="tp-l">Pentru</p><div class="tp-seg" role="group" aria-label="Pentru"><button type="button" data-tp-g="f" aria-pressed="true">Femei</button><button type="button" data-tp-g="m" aria-pressed="false">Bărbați</button></div></div>')
        out.append('<div class="tp-opt"><p class="tp-l">Zona</p><div class="tp-chips sc" role="group" aria-label="Zona">%s</div></div>' % ''.join(
            '<button type="button" data-tp-zone="%s" data-gx="%s" aria-pressed="%s"%s>%s</button>' % (k, g, 'true' if k == 'full-body' else 'false', '' if 'f' in g else ' hidden', e(lab)) for k, lab, g in epi_keys()))
    elif zones:
        out.append('<div class="tp-opt"><p class="tp-l">Zona</p><div class="tp-chips" role="group" aria-label="Zona">%s</div></div>' % ''.join(
            '<button type="button" data-tp-zone="%s" aria-pressed="%s">%s</button>' % (e(z), 'true' if i == 0 else 'false', e(z)) for i, z in enumerate(zones)))
    out.append('<div class="tp-opt"><p class="tp-l">Câte ședințe</p><div class="tp-seg" role="group" aria-label="Câte ședințe">%s</div></div>' % ''.join(
        '<button type="button" data-tp-n="%d" aria-pressed="%s">%d×</button>' % (n, 'true' if n == 1 else 'false', n) for n in sess))
    out.append('<div class="tp-pr"><b data-tp-price>%s</b><s data-tp-full>%s</s><span class="tp-pct">-%d%%</span></div>' % (bf(full), lei(full), PCT))
    out.append('<p class="tp-save"><span data-tp-save>Economisești %s</span><span class="tp-per" data-tp-per>o ședință</span></p>' % bf(full))
    out.append('<button type="button" class="btn book gold tp-cta" data-tp-add>Rezervă oferta%s</button>' % ARROW)
    out.append('<p class="tp-fine">%s Plata doar online, cu cardul. Alegi ziua și ora după.</p></div>' % icon('lock'))
    return ''.join(out)

def trust(x):
    city = 'Doar în Timișoara' if x['cities'] == ['Timișoara'] else 'Timișoara și Arad'
    return ('<ul class="tp-trust"><li><a href="#recenzii">%s<span><b>5,0</b> Google · 300+ recenzii</span></a></li><li>%s<span>Plată securizată</span></li><li>%s<span>%s</span></li></ul>'
            % (GLOGO, icon('lock'), icon('pin'), city))

def page(x):
    i = x['id']; ppid = x.get('pp') or i; epi = i == 'epilare'
    zones = x.get('zones') or []; sess = x.get('sess') or [1, 3, 6]; full = x['full']
    img, own = pic(x)
    hasz = bool(zones) or epi
    z0 = 'Full Body' if epi else (zones[0] if zones else '')
    out = ['<!--meta\ntitle: %s -50%% · Black Friday · Centrul360\ndescription: %s\ndock: off\n-->' % (x['name'], x['promise'] + ' ' + ' '.join(b + '.' for b in x['bullets'])),
           '<link rel="stylesheet" href="/v2/shop.css"><link rel="stylesheet" href="/v2/pp.css">']
    data = {'id': ppid, 'page': i, 'name': x['name'], 'zones': zones, 'sess': sess, 'full': full, 'minutes': x.get('minutes'), 'cities': x['cities'], 'pct': PCT,
            'pairs': [p['id'] for p in x.get('pairs', [])], 'epi': EPI if epi else None}
    out.append('<script type="application/json" id="tp-data">%s</script>' % json.dumps(data, ensure_ascii=False).replace('</', '<\\/'))
    out.append('<div class="tp" data-tp="%s">' % e(i))

    # ---- 1. the hero: picture, name, promise, bullets, the Black Friday buy box, the trust row
    name_h = e(x['name']) + (' <em class="tp-zn" data-tp-zn>%s</em>' % e(z0) if hasz else '')
    out.append('<section class="tp-hero"><div class="wrap tp-hero-g">'
               '<div class="tp-stage%s"><div class="tp-glow" aria-hidden="true"></div><img src="%s" alt="%s" decoding="async" fetchpriority="high" data-tp-img style="view-transition-name:pic-%s;object-position:%s"><span class="tp-tag">-%d%% la plata online</span></div>'
               % (' own' if own else '', e(img), e(x['name']), re.sub(r'[^a-z0-9-]', '', ppid), pic_pos(x) if not own else 'center bottom', PCT))
    out.append('<div class="tp-hx">%s<h1>%s</h1><p class="tp-promise">%s</p><ul class="tp-bul">%s</ul>%s%s</div></div></section>' % (
        eyebrow(x['kind']), name_h, e(x['promise']), ''.join('<li>%s<span>%s</span></li>' % (icon('check'), e(b)) for b in x['bullets']),
        buybox(x, zones, sess, full, epi), trust(x)))

    # ---- 2. what it does, in three tiles
    out.append('<section class="tp-s tp-what"><div class="wrap">%s<div class="tp-tiles">%s</div></div></section>' % (
        head('Ce face, pe scurt', 'Trei lucruri, <em>spuse simplu.</em>'),
        ''.join('<article class="tp-tile rv"><span class="tp-ico">%s</span><h3>%s</h3><p>%s</p></article>' % (icon(t['icon']), e(t['t']), e(t['s'])) for t in x['tiles'])))

    # ---- 3. the real results: only the approved set, only this treatment
    if x.get('results'):
        rs = x['results']
        figs = ''.join('<figure class="tp-case rv" style="--ar:%.4f"><img src="%s" alt="Înainte și după: %s, %s" width="%d" height="%d" loading="lazy" decoding="async"><figcaption><small>Cazul %s</small><b>%s</b><span>%s</span></figcaption></figure>' % (
            r['w'] / r['h'], e(r['src']), e(r['title']), e(r['sub']), r['w'], r['h'], e(r['case']), e(r['title']), e(r['sub'])) for r in rs)
        out.append('<section class="tp-s tp-res" id="rezultate"><div class="wrap">%s<div class="tp-cases n%d">%s</div><p class="tp-note">%s</p></div></section>' % (
            head('Rezultate reale', x.get('resultsH') or 'Nu promitem. <em>Îți arătăm.</em>', x.get('resultsLead') or 'Clientele noastre, fotografiate la noi, înainte și după.'),
            len(rs), figs, e(x.get('resultsNote') or 'Rezultatele diferă de la o persoană la alta.')))

    # ---- 4. how it works: the explainer, step by step, and the video
    a, svg, leg = scene(x)
    steps = ''.join('<li><button type="button" data-tp-s="%d"><span class="n">0%d</span><span class="t"><b>%s</b> %s</span><i class="bar"><i></i></i></button></li>' % (k + 1, k + 1, e(s['b']), e(s['t'])) for k, s in enumerate(x['how']['steps']))
    vid = ''
    v = x.get('video')
    av = art_video(x)
    if av: v = {'src': av, 'title': 'Cum funcționează, pe scurt.', 'sub': 'Video ilustrativ', 'loop': True}
    if v and v.get('loop'):
        vid = '<figure class="tp-vid loop rv"><div class="ph"><video src="%s" muted playsinline loop preload="metadata" data-tp-auto aria-label="%s"></video></div><figcaption><b>%s</b><span>%s</span></figcaption></figure>' % (e(v['src']), e(v['title']), e(v['title']), e(v['sub']))
    elif v:
        vid = ('<figure class="tp-vid rv%s"><div class="ph"><video src="%s" poster="%s" playsinline preload="none" aria-label="%s"></video><button type="button" class="tp-play" data-tp-play aria-label="Pornește video-ul">%s</button></div><figcaption><b>%s</b><span>%s</span></figcaption></figure>'
               % (' wide' if v.get('ratio') else '', e(v['src']), e(v['poster']), e(v['title']), icon('play'), e(v['title']), e(v['sub'])))
    out.append('<section class="tp-s tp-how" id="cum-functioneaza"><div class="wrap">%s<div class="tp-how-g"><figure class="tp-anim a-%s" data-tp-anim data-step="0">%s<figcaption>%s<span class="tp-ill">Ilustrație</span></figcaption></figure><ol class="tp-steps">%s</ol></div>%s</div></section>' % (
        head('Cum funcționează', x['how']['h'], x['how']['text']), a, svg, leg, steps, vid))

    # ---- 5. the zones: tap one, it is chosen in the buy box
    mz = x.get('mapZones') or []
    if x.get('map') and (zones or mz or epi):
        sid = 'm' + re.sub(r'[^a-z0-9]', '', i)
        tap = bool(zones) or epi
        if epi:
            ek = epi_keys(); labels = {k: lab for k, lab, g in ek}; genders = {k: g for k, lab, g in ek}
            svgm = body_map([k for k, lab, g in ek], sid, epi=True, labels=labels, genders=genders)
            side = ('<div class="tp-seg lt" role="group" aria-label="Pentru"><button type="button" data-tp-g="f" aria-pressed="true">Femei</button><button type="button" data-tp-g="m" aria-pressed="false">Bărbați</button></div>'
                    '<div class="tp-zchips">%s</div>' % ''.join('<button type="button" data-tp-zone="%s" data-gx="%s" aria-pressed="%s"%s>%s</button>' % (k, g, 'true' if k == 'full-body' else 'false', '' if 'f' in g else ' hidden', e(lab)) for k, lab, g in ek))
            h2, lead = 'Alege zona. <em>Apasă pe ea.</em>', 'Tot corpul sau doar zonele tale. Full Body înseamnă toate zonele de corp, fără față.'
        elif x['map'] == 'body':
            svgm = body_map(zones, sid)
            side = '<div class="tp-zchips">%s</div>' % ''.join('<button type="button" data-tp-zone="%s" aria-pressed="%s">%s</button>' % (e(z), 'true' if k == 0 else 'false', e(z)) for k, z in enumerate(zones))
            h2, lead = 'Alege zona. <em>Apasă pe ea.</em>', 'Prețul e pe zonă și pe ședință. Zona aleasă trece direct în coș.'
        else:
            svgm = face_map(zones or mz, bool(zones))
            if zones:
                side = '<div class="tp-zchips">%s</div>' % ''.join('<button type="button" data-tp-zone="%s" aria-pressed="%s">%s</button>' % (e(z), 'true' if k == 0 else 'false', e(z)) for k, z in enumerate(zones))
                h2, lead = 'Alege zona. <em>Apasă pe ea.</em>', 'O zonă mică a feței, la alegere. Zona aleasă trece direct în coș.'
            else:
                side = '<ul class="tp-zlist">%s</ul>' % ''.join('<li>%s<span>%s</span></li>' % (icon('check'), e(z)) for z in mz)
                h2, lead = 'Unde <em>lucrează.</em>', 'Zonele pe care le lucrăm într-o ședință.'
        readout = ('<div class="tp-pick"><div><small>Ai ales</small><b data-tp-name>%s</b><span class="pz"><b data-tp-price>%s</b> <s data-tp-full>%s</s></span></div><button type="button" class="btn book gold tp-cta sm" data-tp-add>Rezervă%s</button></div>'
                   % (e(x['name'] + ' ' + z0), bf(full), lei(full), ARROW)) if tap else ''
        out.append('<section class="tp-s tp-zones" id="zone"><div class="wrap">%s<div class="tp-map-g%s"><div class="tp-map%s%s">%s</div><div class="tp-map-side">%s%s</div></div></div></section>' % (
            head('Zone', h2, lead), ' tp-tapz' if tap else '', ' pick' if tap else '', ' tp-epi' if epi else '', svgm, side, readout))

    # ---- 6. who it is for, in her words
    fit = x.get('fit') or {}
    if x.get('voice') or fit.get('yes'):
        body = ''
        if x.get('voice'): body += '<ul class="tp-voice">%s</ul>' % ''.join('<li class="rv">%s</li>' % e(v) for v in x['voice'])
        if x.get('why'): body += '<p class="tp-why rv"><b>Nu e vina ta.</b> %s</p>' % e(re.sub(r'\s*Nu e vina ta\.$', '', x['why']))
        if fit.get('yes'):
            body += '<div class="tp-fit"><div class="y rv"><h3>E pentru tine dacă</h3><ul>%s</ul></div>%s</div>' % (
                ''.join('<li>%s<span>%s</span></li>' % (icon('check'), e(y)) for y in fit['yes']),
                '<div class="n rv"><h3>Nu e pentru tine dacă</h3><ul>%s</ul></div>' % ''.join('<li>%s<span>%s</span></li>' % (icon('x'), e(y)) for y in fit['no']) if fit.get('no') else '')
        out.append('<section class="tp-s tp-who"><div class="wrap">%s%s</div></section>' % (head('Pentru cine e', 'Sună <em>cunoscut?</em>'), body))

    # ---- 7. the session
    ses = x.get('session') or {}
    facts = []
    if epi: facts.append(('clock', 'Durata', 'De la 15 minute pentru o zonă mică, până la 90 de minute pentru Full Body.'))
    elif x.get('minutes'): facts.append(('clock', 'Durata', ro_min(x.get('minutesLabel') or x['minutes'])))
    for k, ic, lab in (('feel', 'feel', 'Ce simți'), ('recovery', 'refresh', 'Recuperarea'), ('sessions', 'repeat', 'Câte ședințe'), ('when', 'calendar', 'Când se vede')):
        if ses.get(k): facts.append((ic, lab, ses[k]))
    facts.append(('pin', 'Unde', 'Doar în Timișoara, Str. Bucegi 7' if x['cities'] == ['Timișoara'] else 'În ambele clinici, Timișoara și Arad'))
    out.append('<section class="tp-s tp-ses"><div class="wrap">%s<dl class="tp-facts">%s</dl></div></section>' % (
        head('Ședința', 'Ce te <em>așteaptă.</em>'), ''.join('<div class="rv"><dt>%s<span>%s</span></dt><dd>%s</dd></div>' % (icon(ic), e(a_), e(b_)) for ic, a_, b_ in facts)))

    # ---- (laser only) the written guarantee, as the site states it
    if x.get('guarantee'):
        out.append('<section class="tp-s tp-gar" id="garantie"><div class="wrap"><div class="tp-gar-c rv"><span class="tp-gar-i">%s</span><div>%s<h2>Dacă părul crește la loc, <em>continuăm gratuit.</em></h2>'
                   '<p>Dacă, după protocolul complet recomandat de noi, părul crește la loc ca înainte, continuăm gratuit până nu mai e nevoie. De aceea la consultație îți spunem sincer dacă ești sau nu un caz potrivit.</p>'
                   '<details class="tp-cond"><summary>Condițiile garanției<i aria-hidden="true"></i></summary><div class="a"><p><b>Protocolul complet înseamnă:</b> toate ședințele recomandate de specialistă, la intervalele indicate, fără pauze nereprogramate; indicațiile de înainte și după ședință, respectate; evaluarea de la final, făcută de specialistă (cu poze).</p>'
                   '<p><b>Garanția nu acoperă:</b> firul alb, blond, roșcat sau foarte fin, pe care laserul nu îl vede; cauze hormonale sau medicamentoase noi (de exemplu sarcina sau tratamente hormonale); zonele care nu au fost tratate în protocol.</p>'
                   '<p>Garanția înseamnă ședințe gratuite în plus, nu bani înapoi. Toate detaliile, în <a href="{{base}}politica-de-garantie">Politica de garanție și returnare</a>.</p></div></details></div></div></div></section>' % (
                       icon('shield'), eyebrow('Garanție scrisă · epilare laser')))

    # ---- 8. what goes well with it (the server's pairs, with the reason)
    prs = []
    for p in x.get('pairs', []):
        q = BY.get(p['id'])
        if not q: continue
        qi, qown = pic(q)
        prs.append('<article class="tp-pair rv" data-tp-pair="%s"><a class="th" href="{{base}}tratament-%s" tabindex="-1" aria-hidden="true"><img src="%s" alt="" loading="lazy" decoding="async" style="object-position:%s"></a>'
                   '<div class="tx"><a href="{{base}}tratament-%s"><b>%s</b></a><p>%s</p><span class="pz"><b data-tp-pp>%s</b> <s data-tp-pf>%s</s></span></div>'
                   '<button type="button" class="tp-plus" data-tp-plus="%s" aria-label="Adaugă %s în coș">%s</button></article>' % (
                       e(q['id']), q['id'], e(qi), 'center top' if qown else pic_pos(q), q['id'], e(q['name']), e(p['why']), bf(q['full']), lei(q['full']), e(q.get('pp') or q['id']), e(q['name']), icon('plus')))
    # the laser: the other zones (the server's EPIL_PAIRS and the face, which Full Body leaves out); pp.js shows the ones that add
    # something to what she picked (with Full Body: only the face) and switches them to the men's rows
    for p in (x.get('epiPairs') or []):
        row = [z for z in EPI if z['key'] == p['key'] and z['g'] == 'f'] or [z for z in EPI if z['key'] == p['key']]
        if not row: continue
        z = row[0]; qi, _ = pic(x)
        prs.append('<article class="tp-pair rv" data-tp-ekey="%s"><a class="th" href="#cumpara" tabindex="-1" aria-hidden="true"><img src="%s" alt="" loading="lazy" decoding="async"></a>'
                   '<div class="tx"><a href="#cumpara"><b data-tp-en>Epilare %s</b></a><p>%s</p><span class="pz"><b data-tp-pp>%s</b> <s data-tp-pf>%s</s></span></div>'
                   '<button type="button" class="tp-plus" data-tp-plus="%s" aria-label="Adaugă Epilare %s în coș">%s</button></article>' % (
                       e(p['key']), e(qi), e(z['label']), e(p['why']), bf(z['full']), lei(z['full']), e(z['id']), e(z['label']), icon('plus')))
    if prs:
        lead = 'Încă o zonă, în aceeași comandă, tot la -50%.' if x.get('epiPairs') else 'Procedurile se completează între ele. Le adaugi cu un tap, tot la -50%.'
        out.append('<section class="tp-s tp-pairs-s"><div class="wrap">%s<div class="tp-pairs">%s</div></div></section>' % (
            head('Merge super în combinație cu', 'Mai bine <em>împreună.</em>', lead), ''.join(prs)))

    # ---- 9. the questions
    if x.get('faq'):
        out.append('<section class="tp-s tp-q"><div class="wrap tp-q-g">%s<div class="tp-faq">%s</div></div></section>' % (
            head('Întrebări', 'Bine de <em>știut.</em>', '', ' left'),
            ''.join('<details><summary><span>%s</span><i aria-hidden="true"></i></summary><div class="a"><p>%s</p></div></details>' % (e(f['q']), e(f['a'])) for f in x['faq'])))

    # ---- 10. the reviews (only the real ones) and the last call
    out.append('<section class="tp-s tp-rev" id="recenzii"><div class="wrap"><div class="tp-score rv"><span class="g">%s</span><b>5,0</b><span class="st">%s</span><p>300+ recenzii Google · Timișoara și Arad</p></div><div class="tp-revs">%s</div></div></section>' % (
        GLOGO, STAR * 5, ''.join('<figure class="rv"><span class="st">%s</span><blockquote>„%s”</blockquote><figcaption><b>%s</b> · %s</figcaption></figure>' % (STAR * 5, e(t), e(n), e(c)) for n, c, t in REVIEWS)))
    out.append('<section class="tp-s tp-end"><div class="wrap"><div class="tp-end-c">%s<h2>%s, <em>la jumătate de preț.</em></h2><p>Doar la plata online, cu cardul, până vineri 27.11, la 23:59. Alegi ziua și ora după.</p>'
               '<div class="tp-cells" data-tp-tm aria-label="Timpul rămas">%s</div><div class="tp-end-pr"><b data-tp-price>%s</b> <s data-tp-full>%s</s></div><button type="button" class="btn book gold tp-cta" data-tp-add>Rezervă oferta%s</button></div></div></section>' % (
                   eyebrow('Black Friday · -50%', ' dk'), e(x['name']), ''.join('<i><b data-u="%d">00</b><small>%s</small></i>' % (k, u) for k, u in enumerate(('zile', 'ore', 'min', 'sec'))), bf(full), lei(full), ARROW))

    # ---- the phone's buy bar
    out.append('<div class="tp-bar" data-tp-bar aria-hidden="true"><div class="tx"><b data-tp-name>%s</b><span><b data-tp-price>%s</b> <s data-tp-full>%s</s></span></div><button type="button" class="btn book gold" data-tp-add tabindex="-1">Rezervă%s</button></div>' % (
        e(x['name'] + (' ' + z0 if hasz else '')), bf(full), lei(full), ARROW))
    out.append('</div><script src="/v2/shop.js" defer></script><script src="/v2/pp.js" defer></script>')
    return '\n'.join(out) + '\n'

if __name__ == '__main__':
    for x in ITEMS:
        s = page(x)
        if '—' in s or '–' in s: raise SystemExit(x['id'] + ': a long dash slipped in')
        open(os.path.join(SRC, 'tratament-%s.html' % x['id']), 'w', encoding='utf-8').write(s)
    print('wrote', len(ITEMS), 'pages')
