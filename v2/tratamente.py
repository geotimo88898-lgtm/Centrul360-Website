#!/usr/bin/env python3
"""The treatments' own pages (the owner, 24-25.11: „fiecare tratament să aibă un product page, ca la cele mai bune magazine
online, simplu, curat, convingător”).
  python3 v2/tratamente.py      writes v2/src/tratament-<id>.html for every treatment, then run python3 v2/build.py
The order sells like a great shop page: the picture, the promise, the price and the button first; then the proof (the real
results, the Google score), how it works (the site's own animation, the video when there is one), what it solves, the session,
who it is for, why Centrul360, the reviews, what goes well with it, the questions, the last call with the timer.
Words only from v2/products-content.json (the site's own pages) and the site's facts; nothing invented. The price, the
sessions, the zone, the button and the phone's buy bar are filled live by v2/shop.js ([data-pp]) from /api/shop."""
import json, os, re, html
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, 'src')
C = json.load(open(os.path.join(HERE, 'products-content.json'), encoding='utf-8'))
items = C if isinstance(C, list) else C.get('products', [])
e = lambda s: html.escape(str(s or ''), quote=True)
NEED = {'liposonix': 'corp', 'cavitatie': 'corp', 'ems': 'corp', 'radiofrecventa': 'corp', 'hifu-corp': 'corp', 'impachetare': 'corp',
        'hifu': 'gusa', 'rf-sculpt-gusa': 'gusa', 'biolifting': 'gusa', 'epilare': 'epilare'}
NEED_T = {'corp': 'Corp', 'gusa': 'Gușă și contur', 'fata': 'Față', 'epilare': 'Epilare laser'}
TM_ONLY = {'ems', 'impachetare', 'epilare'}
STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg>'
REVIEWS = [  # the site's three Google reviews, word for word (v2/README.md)
    ('Maria Muntean', 'Timișoara', 'O experiență foarte plăcută, atmosfera relaxantă, iar rezultatul a fost exact pe măsura așteptărilor.'),
    ('Alina Galuțiu', 'Arad', 'O experiență minunată, d-na Andreea m-a abordat cu căldură și profesionalism.'),
    ('Simona-Mihaela J.', 'Timișoara', 'Locație frumoasă, curată, liniștită. Domnișoara este minunată, rezultatul este vizibil.'),
]
def pic(i):
    """the treatment's own picture when it was made (brand_asset/tratamente/), else the card's cut-out"""
    own = os.path.join(ROOT, 'brand_asset', 'tratamente', ('epilare-full-body' if i == 'epilare' else i) + '.webp')
    if os.path.exists(own): return '/brand_asset/tratamente/%s.webp' % ('epilare-full-body' if i == 'epilare' else i)
    n = NEED.get(i, 'fata')
    return '/brand_asset/oferte/%s.webp?v=3' % ('epilare' if n == 'epilare' else 'hifu-gusa' if n == 'gusa' else 'facial' if n == 'fata' else 'cavitatie' if i in ('cavitatie', 'ems') else 'liposonix')
def video(i):
    f = os.path.join(ROOT, 'brand_asset', 'tratamente', 'video', i + '.mp4')
    return '/brand_asset/tratamente/video/%s.mp4' % i if os.path.exists(f) else ''

def explainer(page):
    if not page: return ''
    try: s = open(os.path.join(SRC, page), encoding='utf-8').read()
    except OSError: return ''
    m = re.search(r'<figure class="card proc[\s\S]*?</figure>', s)
    if not m: return ''
    return ''.join(re.findall(r'<style>[\s\S]*?</style>', s)) + '<div class="pp-how">' + m.group(0) + '</div>'

def sec(eyb, h2, body, cls=''):
    return '<section class="pp-s%s"><div class="wrap"><p class="eyb">%s</p><h2>%s</h2>%s</div></section>' % (cls, e(eyb), h2, body)

def page(x):
    i = x['id']; need = NEED.get(i, 'fata'); pp = 'epilare-full-body' if i == 'epilare' else i
    how = x.get('how') or {}; ses = x.get('session') or {}; fit = x.get('fit') or {}
    out = ['<!--meta', 'title: %s -50%% la plata online · Centrul360 Timișoara și Arad' % x['title'],
           'description: %s' % (x.get('lead') or x['title']).replace('\n', ' '), 'dock: off', '-->',
           '<link rel="stylesheet" href="/v2/shop.css">', "<script>document.body.classList.add('bfo-page')</script>", '<div class="pp">']
    # 1. the first screen: the picture, the promise, the proof, the price, the button
    out.append('<section class="pp-hero"><div class="wrap"><div class="pp-pic"><img src="%s" alt="%s" decoding="async" fetchpriority="high"></div><div class="pp-tx">' % (pic(i), e(x['title'])))
    out.append('<div class="pp-chips"><span class="pp-off">-50%% Black Friday</span><a class="pp-g" href="#recenzii">%s<b>5,0</b> Google · 300+ recenzii</a></div>' % STAR)
    out.append('<h1>%s</h1>' % e(x['title']))
    if x.get('lead'): out.append('<p class="lead">%s</p>' % e(x['lead']))
    out.append('<ul class="pp-hi" data-pp-hi></ul>')
    out.append('<div class="pp-buy" data-pp="%s"><div class="sh-wait">Încarc prețul…</div></div><div data-tm></div></div></div></section>' % pp)
    # 2. the proof first: the real results
    if x.get('results'):
        out.append(sec('Rezultate reale', 'Clientele noastre, <em>fotografiate la noi.</em>',
            '<div class="pp-res">%s</div><p class="pp-fine">Rezultatele diferă de la o persoană la alta.</p>' %
            ''.join('<figure><img src="%s" alt="Înainte și după: %s" loading="lazy" decoding="async"><figcaption><b>%s</b>%s</figcaption></figure>' % (
                e(r['src']), e(r.get('zone') or x['title']), e(r.get('zone') or ''), e(r.get('caption') or '')) for r in x['results'])))
    # 3. how it works: the video, the animation, three steps
    vid = video(i); ex = explainer(how.get('explainerFrom'))
    if how.get('text') or ex or vid or how.get('steps'):
        body = ''
        if how.get('text'): body += '<p class="pp-p">%s</p>' % e(how['text'])
        if vid: body += '<figure class="pp-vid"><video src="%s" muted playsinline loop autoplay preload="metadata" aria-label="Cum funcționează %s"></video><figcaption>Imagini ilustrative</figcaption></figure>' % (vid, e(x['title']))
        if ex: body += ex
        if how.get('steps'): body += '<ol class="pp-steps">%s</ol>' % ''.join('<li>%s</li>' % e(s) for s in how['steps'])
        out.append(sec('Cum funcționează', 'Simplu, <em>pe scurt.</em>', body))
    # 4. what it solves
    if x.get('problems'):
        out.append(sec('Ce rezolvă', 'E pentru <em>asta.</em>', '<ul class="pp-list">%s</ul>' % ''.join('<li>%s</li>' % e(p) for p in x['problems'])))
    # 5. the session
    facts = []
    if ses.get('minutes'): facts.append(('Durata', '%s min' % ses['minutes']))
    if ses.get('feel'): facts.append(('Ce simți', ses['feel']))
    if ses.get('sessions'): facts.append(('Câte ședințe', ses['sessions']))
    facts.append(('Unde', 'Doar în Timișoara' if i in TM_ONLY else 'Timișoara și Arad'))
    body = '<div class="pp-facts">%s</div>' % ''.join('<div><small>%s</small><b>%s</b></div>' % (e(a), e(b)) for a, b in facts)
    if x.get('zones'): body += '<p class="pp-l" style="margin:26px 0 12px">Zone</p><div class="pp-zones">%s</div>' % ''.join('<span>%s</span>' % e(z) for z in x['zones'])
    out.append(sec('Ședința', 'Ce te <em>așteaptă.</em>', body))
    if i == 'epilare':
        out.append(sec('Pe zone', 'Alege <em>zona.</em>', '<div class="epi"><div class="epi-h"><b>Prețuri -50%</b><div class="seg d sm"><button type="button" data-g="f" aria-pressed="true">Femei</button><button type="button" data-g="m" aria-pressed="false">Bărbați</button></div></div><ul data-epi></ul></div>'))
    # 6. who it is for
    if fit.get('yes') or fit.get('no'):
        body = '<div class="pp-fit">'
        if fit.get('yes'): body += '<div class="y"><h3>E pentru tine dacă</h3><ul>%s</ul></div>' % ''.join('<li>%s</li>' % e(y) for y in fit['yes'])
        if fit.get('no'): body += '<div class="n"><h3>Nu e pentru tine dacă</h3><ul>%s</ul></div>' % ''.join('<li>%s</li>' % e(y) for y in fit['no'])
        out.append(sec('E pentru tine?', 'Spus <em>sincer.</em>', body + '</div>'))
    # 7. why here: the site's own facts
    out.append(sec('De ce Centrul360', 'În mâini <em>bune.</em>', '<ul class="pp-why"><li><b>5,0 pe Google</b><span>peste 300 de recenzii</span></li><li><b>Aparatură medicală certificată</b><span>proceduri non-invazive</span></li><li><b>Consultația e gratuită</b><span>dacă vrei, începi cu ea</span></li><li><b>Două clinici</b><span>Timișoara și Arad</span></li></ul>'))
    # 8. the reviews
    out.append('<section class="pp-s" id="recenzii"><div class="wrap"><p class="eyb">Recenzii Google</p><h2><span class="pp-stars">%s</span> 5,0 <em>din 300+ recenzii.</em></h2><div class="pp-revs">%s</div></div></section>' % (
        STAR * 5, ''.join('<figure><blockquote>„%s”</blockquote><figcaption>%s · %s</figcaption></figure>' % (e(t), e(n), e(c)) for n, c, t in REVIEWS)))
    # 9. what goes well with it
    out.append(sec('Merge super în combinație cu', 'Pentru un rezultat <em>complet.</em>', '<div class="pp-pairs" data-pp-pairs></div>'))
    # 10. the questions
    if x.get('faq'):
        out.append(sec('Întrebări', 'Bine de <em>știut.</em>', '<div class="pp-faq">%s</div>' % ''.join('<details><summary>%s</summary><p>%s</p></details>' % (e(f['q']), e(f['a'])) for f in x['faq'])))
    # 11. the last call
    out.append('<section class="pp-end"><div class="wrap"><p class="eyb">Black Friday</p><h2>%s, <em>la jumătate de preț.</em></h2><p class="pp-p" style="margin:12px auto 0">Doar la plata online, cu cardul. Alegi ora după.</p><div data-tm></div><button type="button" class="btn book gold" data-ppadd>Rezervă oferta{{arrow}}</button></div></section>' % e(x['title']))
    out.append('</div><script src="/v2/shop.js" defer></script>')
    return '\n'.join(out) + '\n'

if __name__ == '__main__':
    for x in items:
        open(os.path.join(SRC, 'tratament-%s.html' % x['id']), 'w', encoding='utf-8').write(page(x))
    print('wrote', len(items), 'pages')
