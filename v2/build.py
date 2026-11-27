#!/usr/bin/env python3
"""Builds the v2 pages: v2/src/<name>.html (a meta block + the page's sections) inside v2/src/_shell.html
(head, header, menu, footer, phone dock, scripts), written to v2/<path>.html.
  python3 v2/build.py            all pages
  python3 v2/build.py celulita   only some
A page starts with:
<!--meta
title: Celulită | Radiofrecvență, cavitație și EMS · Centrul360
description: one sentence for Google
path: celulita              (default: the file name; "index" for the home page)
city: Timișoara             (optional: booking buttons of the header, menu and dock go straight to this clinic)
dock: off                   (optional: no phone dock, e.g. thank-you pages)
robots: noindex,nofollow    (optional: for pages Google should not list, e.g. thank-you pages; the preview is always noindex)
pixel: Lead                 (optional: Meta pixel events besides PageView, e.g. on a thank-you page; uses ?eid=)
q: a, c                     (optional: the owner's open questions shown on this page in the preview, see QUESTIONS)
Tracking (the pixel, Google Ads tags) goes between <!--live--> and <!--/live-->: the /v2/ preview leaves it out.
-->
Inside a page, {{base}} is the site root of the preview (/v2/) and {{arrow}} the button arrow."""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
BASE = os.environ.get('V2_BASE', '/v2/')
OUT = os.environ.get('V2_OUT', HERE)      # where the pages are written (the swap writes the site root)
ROBOTS = os.environ.get('V2_ROBOTS', 'noindex,nofollow')
ARROW = '<svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
MARK = ('<svg class="mk" viewBox="130 130 550 550" aria-hidden="true" fill="none" stroke="currentColor">'
        '<circle class="ring" cx="405" cy="405" r="262" stroke-width="1.6" vector-effect="non-scaling-stroke" pathLength="100"/>'
        '<ellipse class="ev" cx="405" cy="405" rx="104" ry="207" stroke-width="1.6" vector-effect="non-scaling-stroke"/>'
        '<ellipse class="eh" cx="405" cy="405" rx="207" ry="113" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>')

# the shop's pages (the slider, all the offers, a treatment's page) ask for the shop's data from the head, before the styles, so
# their first screen does not wait for v2/shop.js to arrive first (speed, 25.11); v2/shop.js and v2/pp.js take the answers
SHOP_HEAD = ("<script>/* the shop's data, asked for at once (v2/shop.js and v2/pp.js use these answers) */window.C360Pre={shop:fetch('/api/shop',"
             "{headers:{Accept:'application/json'}}).then(function(r){return r.json()}),art:fetch('/v2/art.json',{headers:{Accept:'application/json'}})"
             ".then(function(r){return r.ok?r.json():{}})};C360Pre.shop.catch(function(){});C360Pre.art.catch(function(){});</script>")
SHOP_MARK = re.compile(r'data-bfs\b|data-bfo\b|id="tp-data"')
# what the shell marks <!--late--> ... <!--/late--> (the Christmas touches, the card's buy window, the lead filter's script): on
# the shop's pages it is needed only on a tap or a link (?lf=1, #cumpara), so there it loads after the page: its styles in their
# place (before the stylesheet that follows them in the shell), then its scripts in order. Every other page keeps it as it is.
LATE = re.compile(r'<!--late-->(.*?)<!--/late-->', re.S)
def late(out):
    css, js, nxt = [], [], []
    def take(m):
        n = re.match(r'\s*<link rel="stylesheet" href="([^"]+)">', out[m.end():])
        if n and not nxt: nxt.append(n.group(1))
        css.extend(re.findall(r'<link rel="stylesheet" href="([^"]+)">', m.group(1)))
        js.extend(re.findall(r'<script src="([^"]+)" defer></script>', m.group(1)))
        return ''
    out = LATE.sub(take, out)
    if not css and not js: return out
    load = ("<script>/* after the first screen (the shop's pages, v2/build.py): %s */(function(){var go=function(){"
            "var h=document.querySelector('link[href=\"%s\"]');%s.forEach(function(u){var l=document.createElement('link');"
            "l.rel='stylesheet';l.href=u;document.head.insertBefore(l,h)});%s.forEach(function(u){var s=document.createElement('script');"
            "s.src=u;s.async=false;document.body.appendChild(s)})};if(document.readyState==='complete')go();else addEventListener('load',go)})();</script>\n"
            % (', '.join(u.split('/')[-1] for u in css + js), nxt[0] if nxt else '/v2/head.css', json.dumps(css), json.dumps(js)))
    return out.replace('</body>', load + '</body>')

# the open questions for the owner (preview only): each page lists its letters in its meta block (q: a, b)
QUESTIONS = {
    'h': 'Cookies: politica spune că acordul se dă prin banner, dar site-ul nu are banner. Îl adaug?',
}
def asks(meta):
    qs = [q.strip() for q in meta.get('q', '').split(',') if q.strip() in QUESTIONS]
    if BASE != '/v2/' or not qs: return ''
    return ('<details class="prevq"><summary>De confirmat: ' + ', '.join(qs) + '</summary><ol>' +
            ''.join('<li><b>' + q + '.</b> ' + QUESTIONS[q] + '</li>' for q in qs) + '</ol></details>')

def build(name):
    raw = open(os.path.join(SRC, name + '.html'), encoding='utf-8').read()
    m = re.match(r'\s*<!--meta\n(.*?)-->\n', raw, re.S)
    if not m: sys.exit(name + ': the page must start with a <!--meta ... --> block')
    meta = dict(l.split(':', 1) for l in m.group(1).strip().splitlines() if ':' in l)
    meta = {k.strip(): v.strip() for k, v in meta.items()}
    body = raw[m.end():]
    city = meta.get('city', '')
    citybook = ' data-book-city="%s"' % city if city else ''
    slot = ' data-slot="%s"' % city if city else ' data-slot'
    dock = '' if meta.get('dock') == 'off' else (
        # no free consultation any more (the owner, 25.11): the phone's dock leads to the offers, paid online at -50%
        '<div class="dock"><div class="t"><b>-50%% la plata online</b>până duminică, 29 noiembrie</div>'
        '<a class="btn book gold" href="%soferte">Vezi ofertele</a></div>' % BASE)
    path = meta.get('path', name)
    url = '' if path == 'index' else path
    og = path if os.path.exists(os.path.join(HERE, '..', 'brand_asset', 'og', path + '.jpg')) else 'index'
    title = meta.get('title', 'Centrul360')
    first = title.split(' | ')[0].split(' · ')[0].strip()
    ogtitle = meta.get('og-title', title if path == 'index' or 'Centrul360' in first else first + ' · Centrul360')
    shell = open(os.path.join(SRC, '_shell.html'), encoding='utf-8').read()
    out = (shell.replace('{{shop}}\n', SHOP_HEAD + '\n' if SHOP_MARK.search(body) else '').replace('{{body}}', body.strip())
           .replace('{{title}}', title).replace('{{ogtitle}}', ogtitle.replace('"', '&quot;')).replace('{{url}}', url).replace('{{og}}', og)
           .replace('{{description}}', meta.get('description', '').replace('"', '&quot;'))
           .replace('{{pixel}}', ''.join("\nfbq('track', '%s', {}, EID);" % e.strip() for e in meta.get('pixel', '').split(',') if e.strip()))
           .replace('{{robots}}', ROBOTS if BASE == '/v2/' else meta.get('robots', 'index,follow')).replace('{{dock}}', dock)
           .replace('{{prev}}', ('<div class="prev">Previzualizare v2</div>' + asks(meta)) if BASE == '/v2/' else '')
           .replace('{{citybook}}', citybook).replace('{{mark}}', MARK).replace('{{arrow}}', ARROW).replace('{{base}}', BASE))
    # the event id the form put in the address (?eid=), so the browser event and the server's copy count once
    out = out.replace('EID);', "(function(){var e=new URLSearchParams(location.search).get('eid');return e?{eventID:e}:{};})());")
    # the preview (/v2/) sends no tracking at all: no pixel, no Google Ads conversions (<!--live--> ... <!--/live-->)
    if BASE == '/v2/': out = re.sub(r'<!--live-->.*?<!--/live-->', '', out, flags=re.S)
    else: out = out.replace('<!--live-->', '').replace('<!--/live-->', '')
    out = late(out) if SHOP_MARK.search(body) else LATE.sub(lambda m: m.group(1), out)
    # what came from the preview (the owner, 27.11: v3's menu motion and v3's card size, on this design; one reason per card;
    # the struck price red; the liquid glass, Chrome only): on every page since his „bun, publish” (27.11), live and preview
    if True:
        last = list(re.finditer(r'<link rel="stylesheet" href="[^"]+">', out))[-1]   # after every other style, the shop's included
        # and the liquid glass on what floats over the page (27.11, v2/lg.js: Chrome only, the rest unchanged)
        out = out[:last.end()] + '\n<link rel="stylesheet" href="/v2/m3.css">\n<script src="/v2/m3.js" defer></script>' + \
            '\n<link rel="stylesheet" href="/v2/lg.css">\n<script src="/v2/lg.js" defer></script>' + out[last.end():]
    if '—' in out or '–' in out: sys.exit(name + ': a long dash slipped in')
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, path + '.html'), 'w', encoding='utf-8').write(out)
    print('built', path + '.html')

names = sys.argv[1:] or sorted(f[:-5] for f in os.listdir(SRC) if f.endswith('.html') and not f.startswith('_'))
for n in names: build(n)
