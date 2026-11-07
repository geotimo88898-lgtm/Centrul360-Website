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
import os, re, sys
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

# the open questions for the owner (preview only): each page lists its letters in its meta block (q: a, b)
QUESTIONS = {
    'c': 'Epilare: rămâne „aproximativ 90% din fire dispar după a 5-a ședință”? Filmulețul e făcut la clinică?',
    'e': 'Laser Full Body: în Admin e 490 lei, pe pagina veche 599. E corect prețul din Admin?',
    'f': 'Ai poze reale înainte/după pentru acnee, celulită și epilare?',
    'g': 'PDF-ul cu catalogul de rezultate e cel actual?',
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
        '<div class="dock"><div class="t"%s data-slot-mode="dock"><b>Consultație gratuită</b>+ masaj facial cadou</div>'
        '<button type="button" class="btn book" data-book data-book-service="consult"%s>Programează-mă</button></div>' % (slot, citybook))
    path = meta.get('path', name)
    url = '' if path == 'index' else path
    og = path if os.path.exists(os.path.join(HERE, '..', 'brand_asset', 'og', path + '.jpg')) else 'index'
    title = meta.get('title', 'Centrul360')
    first = title.split(' | ')[0].split(' · ')[0].strip()
    ogtitle = meta.get('og-title', title if path == 'index' or 'Centrul360' in first else first + ' · Centrul360')
    shell = open(os.path.join(SRC, '_shell.html'), encoding='utf-8').read()
    out = (shell.replace('{{body}}', body.strip())
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
    if '—' in out or '–' in out: sys.exit(name + ': a long dash slipped in')
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, path + '.html'), 'w', encoding='utf-8').write(out)
    print('built', path + '.html')

names = sys.argv[1:] or sorted(f[:-5] for f in os.listdir(SRC) if f.endswith('.html') and not f.startswith('_'))
for n in names: build(n)
