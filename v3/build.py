#!/usr/bin/env python3
"""The v3 site (the editorial redesign, the owner 27.11: „curățenie totală după reel, ca în forma finală”): v3/src/<name>.html
(a meta block + the page's sections) inside v3/src/_shell.html, written to v3/<path>.html. Preview only until the owner's „da”:
the live site (the root pages and /v2/) is not touched by anything here.
  python3 v3/build.py            all pages
  python3 v3/build.py oferte     only some
A page starts with:
<!--meta
title: HIFU | Lifting fără operație | Centrul360
description: one sentence for Google
path: tratament-hifu        (default: the file name; "index" for the home page)
dock: off | offers          (default offers: the glass dock with the online price and „Vezi ofertele”; a page with its own dock: off)
dock_href: #tratamente       (optional: where the dock's button leads; dock_cta: its words)
robots: noindex,nofollow    (optional; the preview is always noindex)
pixel: Lead                 (optional: Meta pixel events besides PageView, e.g. on a thank-you page; uses ?eid=)
-->
Inside a page, {{base}} is the site root (/v3/ in the preview). Tracking goes between <!--live--> and <!--/live-->: the preview
leaves it out. No long dashes, no interpuncts in what she reads (the build refuses them: the reel's sign 02).
Before v3 replaces the live pages: qa/price-list.cjs builds api/_lib/price-list.gen.json (the server's prices) from the hidden
#lista of v2/src/preturi.html; keep that file (or move that source) when the swap is done."""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
BASE = os.environ.get('V3_BASE', '/v3/')
OUT = os.environ.get('V3_OUT', HERE)
PREVIEW = BASE != '/'
MARK = ('<svg class="mk" viewBox="130 130 550 550" aria-hidden="true" fill="none" stroke="currentColor">'
        '<circle cx="405" cy="405" r="262" stroke-width="1.6" vector-effect="non-scaling-stroke"/>'
        '<ellipse cx="405" cy="405" rx="104" ry="207" stroke-width="1.6" vector-effect="non-scaling-stroke"/>'
        '<ellipse cx="405" cy="405" rx="207" ry="113" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>')
# the shop's pages ask for the shop's data from the head, before the styles (speed): v3/shop.js and v3/pp.js take the answers
SHOP_HEAD = ("<script>window.C360Pre={shop:fetch('/api/shop',{headers:{Accept:'application/json'}}).then(function(r){return r.json()}),"
             "art:fetch('" + BASE.replace('/', '\\/') + "art.json',{headers:{Accept:'application/json'}}).then(function(r){return r.ok?r.json():{}})};"
             "C360Pre.shop.catch(function(){});C360Pre.art.catch(function(){});</script>")
SHOP_MARK = re.compile(r'data-bfs\b|data-bfo\b|id="tp-data"|data-shop-ids|data-ed-offers')
# the dock of a page that has none of its own: the online price line (the server's terms, v3/ed.js) and the way to the offers
DOCK = ('<div class="dk" data-dk><div class="dk-in"><p class="dk-t"><b data-dk-t>Prețuri online</b><span data-dk-s>Plătești online, alegi ora după</span></p>'
        '<a class="btn" href="{{dock_href}}">{{dock_cta}}</a></div></div>')


# the reel's sign 18 (two-word sentences): the old pages' short sentences, said as one (v3 only; the live text stays as it is)
TWO = [('Tu stai întinsă. Aparatul lucrează.', 'Tu stai întinsă, aparatul lucrează.'),
       ('cu un ritm susținut la început. Apoi întreținere.', 'cu un ritm susținut la început, apoi cu ședințe de întreținere.'),
       ('Energie în profunzime. Contur redefinit.', 'Energie în profunzime, pentru un contur redefinit.'),
       ('E confortabil. După curățare', 'Ședința e confortabilă, iar după curățare'),
       ('Piele mai fermă, cu colagenul tău. Fără bisturiu.', 'Piele mai fermă, cu colagenul tău, fără bisturiu.'),
       ('adaptate exact tipului tău de ten. Fără recuperare.', 'adaptate exact tipului tău de ten, fără recuperare.'),
       ('Menținem rezultatul. Hidratarea și mișcarea ajută mult.', 'Menținem rezultatul, iar hidratarea și mișcarea ajută mult.'),
       ('Menținem tonusul. Mișcarea și o alimentație echilibrată susțin rezultatul.', 'Menținem tonusul, iar mișcarea și o alimentație echilibrată susțin rezultatul.'),
       ('O ședință. La reevaluare', 'O singură ședință, iar la reevaluare'),
       ('>Pentru fermitate.<', '>Pentru o piele mai fermă.<'),
       ('Relaxare profundă. Pielea arată odihnită și luminoasă.', 'Relaxare profundă, iar pielea arată odihnită și luminoasă.'),
       ('>Relaxare profundă.<', '>O stare de relaxare profundă.<'),
       ('20.000 de contracții. Zero efort.', '20.000 de contracții într-o ședință, fără efort.')]
TWO_RE = [(re.compile(r'Fără recuperare\. ([A-ZĂÂÎȘȚ])'), lambda m: 'Fără recuperare: ' + m.group(1).lower()),
          (re.compile(r'>Fără recuperare\.<'), lambda m: '>Nu e nevoie de recuperare.<')]


def build(name):
    raw = open(os.path.join(SRC, name + '.html'), encoding='utf-8').read()
    m = re.match(r'\s*<!--meta\n(.*?)-->\n', raw, re.S)
    if not m: sys.exit(name + ': the page must start with a <!--meta ... --> block')
    meta = {k.strip(): v.strip() for k, v in (l.split(':', 1) for l in m.group(1).strip().splitlines() if ':' in l)}
    body = raw[m.end():]
    path = meta.get('path', name)
    url = '' if path == 'index' else path
    og = path if os.path.exists(os.path.join(HERE, '..', 'brand_asset', 'og', path + '.jpg')) else 'index'
    title = meta.get('title', 'Centrul360')
    shell = open(os.path.join(SRC, '_shell.html'), encoding='utf-8').read()
    dock = '' if meta.get('dock') == 'off' else DOCK
    out = (shell.replace('{{shop}}\n', SHOP_HEAD + '\n' if SHOP_MARK.search(body) else '').replace('{{body}}', body.strip())
           .replace('{{dock}}', dock).replace('{{dock_href}}', meta.get('dock_href', '{{base}}oferte')).replace('{{dock_cta}}', meta.get('dock_cta', 'Vezi ofertele'))
           .replace('{{title}}', title).replace('{{url}}', url).replace('{{og}}', og)
           .replace('{{description}}', meta.get('description', '').replace('"', '&quot;'))
           .replace('{{pixel}}', ''.join("\nfbq('track', '%s', {}, EID);" % e.strip() for e in meta.get('pixel', '').split(',') if e.strip()))
           .replace('{{robots}}', 'noindex,nofollow' if PREVIEW else meta.get('robots', 'index,follow'))
           .replace('{{bodyclass}}', meta.get('body', ''))
           .replace('{{prev}}', '<p class="ft-prev">Previzualizare, nepublicată</p>' if PREVIEW else '')
           .replace('{{mark}}', MARK).replace('{{base}}', BASE))
    out = out.replace('EID);', "(function(){var e=new URLSearchParams(location.search).get('eid');return e?{eventID:e}:{};})());")
    for x, y in TWO: out = out.replace(x, y)
    for r, f in TWO_RE: out = r.sub(f, out)
    if PREVIEW: out = re.sub(r'<!--live-->.*?<!--/live-->', '', out, flags=re.S)
    else: out = out.replace('<!--live-->', '').replace('<!--/live-->', '')
    if '—' in out or '–' in out: sys.exit(name + ': a long dash slipped in')
    # what she reads: no interpunct between words (the reel's sign 02); titles, scripts, styles and attributes are not read
    vis = re.sub(r'<(script|style|title|svg)\b.*?</\1>', '', out, flags=re.S | re.I)
    vis = re.sub(r'<[^>]+>', ' ', vis)
    if ' · ' in vis: sys.exit(name + ': an interpunct between words in the page: ' + vis[max(0, vis.index(' · ') - 60):vis.index(' · ') + 60].strip())
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, path + '.html'), 'w', encoding='utf-8').write(out)
    print('built', path + '.html')


names = sys.argv[1:] or sorted(f[:-5] for f in os.listdir(SRC) if f.endswith('.html') and not f.startswith('_'))
for n in names: build(n)
