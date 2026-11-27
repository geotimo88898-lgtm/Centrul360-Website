#!/usr/bin/env python3
"""The treatments' own pages of the v3 site (the editorial redesign, the owner 27.11): v3/src/tratament-<id>.html, from the same
facts as the live pages (v2/products-content.json, the price list, the approved before/after, the explainers), drawn as the
reel's final form: the treatment's name edge to edge, its photo cut out and floated over it, the facts in the corners, one glass
dock with the price and „Rezervă”; then the choice (zone, sessions), the real results, how it works, for whom, the session, the
packages, the questions, the reviews, the last word. v3/pp.js runs the choice and the dock, v3/shop.js the cart.
  python3 v3/tratamente.py   (then python3 v3/build.py)"""
import importlib.util, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, 'src')
spec = importlib.util.spec_from_file_location('t2', os.path.join(ROOT, 'v2', 'tratamente.py'))
t2 = importlib.util.module_from_spec(spec); spec.loader.exec_module(t2)
e, lei, PCT = t2.e, t2.lei, t2.PCT
CUT = json.load(open(os.path.join(HERE, 'img', 'cut', 'index.json'), encoding='utf-8'))

# the name, as the monumental words (one line, or two when it is long)
WORDS = {'liposonix': ['Liposonix'], 'cavitatie': ['40K Slim'], 'ems': ['EMS'], 'radiofrecventa': ['Red Sculpt'], 'hifu-corp': ['HIFU', 'Corp'],
         'impachetare': ['Împachetare'], 'hifu': ['HIFU'], 'biolifting': ['BioLifting'], 'hifu-full-face': ['HIFU', 'Full Face'],
         'biolifting-full-face': ['BioLifting', 'Full Face'], 'restart': ['Restart'], 'masaj-facial': ['Masaj', 'Facial'], 'hidratare': ['Hidratare'],
         'antirid': ['Antirid'], 'redness': ['Redness'], 'sebum-off': ['Sebum Off'], 'epilare': ['Epilare']}
ALL_BODY = ('liposonix', 'cavitatie', 'radiofrecventa', 'hifu-corp', 'ems')
ALL_FACE = ('hifu', 'biolifting')


def clean(t):
    """what she reads: no dot between words (the reel's sign 02)"""
    return re.sub(r'\s+·\s+', ', ', str(t or ''))


def slug(z):
    import unicodedata
    s = unicodedata.normalize('NFD', z); s = ''.join(c for c in s if unicodedata.category(c) != 'Mn').lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def cut_of(x, z0):
    i = x['id']
    n = i + '--' + slug(z0) if z0 and (i + '--' + slug(z0)) in CUT else i
    return n if n in CUT else None


def hero(x, zones, z0):
    """the first screen (27.11, the owner: conversion, warmth, nothing for decor): what it is, for what, the price and one button;
    the zone, the promise, the price follow her choice (v3/pp.js: [data-tp-zn], [data-tp-promise], [data-tp-price], [data-tp-img])"""
    i = x['id']
    n = cut_of(x, z0)
    city = 'Doar în Timișoara' if x['cities'] == ['Timișoara'] else 'În Timișoara și Arad'
    mins = t2.ro_min(x.get('minutesLabel') or x['minutes']) if x.get('minutes') else ''
    kind = clean(x['kind'])
    full = x['full']
    return ''.join([
        '<section class="hx tp-hx" aria-label="%s"><div class="wrap hx-g"><div class="hx-t">' % e(x['name']),
        '<span class="hx-eye" data-tp-eye>%s</span>' % e(kind),
        '<h1>%s%s</h1>' % (e(x['name']), (' <span class="tp-hz" data-tp-zn>%s</span>' % e(z0)) if z0 else ''),
        '<p class="hx-p" data-tp-promise>%s</p>' % e(clean(x['promise'])),
        '<p class="hx-pr"><b data-tp-price>%s</b><s data-tp-full>%s</s><span data-terms>la plata online</span></p>' % (t2.bf(full), lei(full)),
        '<div class="hx-cta"><a class="btn lg" href="#cumpara">%s</a></div>' % ('Alege zona și rezervă' if zones else 'Rezervă'),
        '<ul class="hx-ok" data-tp-bul><li class="st"><i aria-hidden="true">★★★★★</i>5,0 pe Google, din peste 300 de recenzii</li>%s</ul>' % ''.join(
            '<li><span>%s</span></li>' % e(clean(b)) for b in x['bullets']),
        '</div>',
        ('<div class="hx-fig"><img data-tp-img src="{{base}}img/cut/%s.webp" alt="%s" fetchpriority="high" decoding="async" style="view-transition-name:pic-%s"></div>'
         % (n, e(x['name']), re.sub(r'[^a-z0-9-]', '', x.get('pp') or i))) if n else '',
        '</div></section>'])

# what one zone is (the owner, 27.11: „la 320 nu e tot abdomenul”; only Liposonix and HIFU corporal)
ZONE_NOTE = {
    'liposonix': 'O zonă: abdomenul inferior sau superior, coapsele interior sau exterior, flancurile, brațele sau zona lombară. Tot abdomenul înseamnă 2 zone.',
    'hifu-corp': 'O zonă: abdomenul inferior sau superior, coapsele interior sau exterior, brațele, gambele sau zona lombară. Tot abdomenul înseamnă 2 zone.',
}


def buy(x, zones, sess, full, z0):
    """the choice: the zone, the sessions, the price; „Rezervă” (v3/pp.js: [data-tp-buy] and the rest)"""
    i = x['id']
    opts = []
    if zones:
        extra = ''
        if i in ALL_BODY and len(zones) > 1: extra = '<button type="button" data-tp-zone="Full Body" aria-pressed="false">Full Body</button>'
        if i in ALL_FACE: extra = '<button type="button" data-tp-zone="Full Face" aria-pressed="false">Full Face</button>'
        opts.append('<div class="tp-o"><span class="lbl">Zona</span><div class="tp-ch" role="group" aria-label="Zona">%s%s</div>%s</div>' % (
            ''.join('<button type="button" data-tp-zone="%s" aria-pressed="%s">%s</button>' % (e(z), 'true' if k == 0 else 'false', e(z)) for k, z in enumerate(zones)), extra,
            ('<p class="fine tp-zdef">%s</p>' % e(ZONE_NOTE[i])) if i in ZONE_NOTE else ''))
    opts.append('<div class="tp-o"><span class="lbl">Câte ședințe</span><div class="tp-ch" role="group" aria-label="Câte ședințe">%s</div></div>' % ''.join(
        '<button type="button" data-tp-n="%d" aria-pressed="%s">%s</button>' % (n, 'true' if n == 1 else 'false', '1 ședință' if n == 1 else '%d ședințe' % n) for n in sess))
    return ''.join([
        '<section class="s tp-buy" id="cumpara"><div class="wrap"><div class="tp-cfg" data-tp-buy>',
        '<div class="tp-cfg-b"><h2 class="t3">Alege și rezervă</h2>%s' % ''.join(opts),
        '<p class="tp-pr"><b data-tp-price>%s</b><s data-tp-full>%s</s></p><p class="tp-per"><span data-tp-per>o ședință</span>, <span data-tp-save>Economisești %s</span></p>' % (t2.bf(full), lei(full), t2.bf(full)),
        '<button type="button" class="btn lg tp-cta" data-tp-add>Rezervă</button>',
        '<p class="fine">Plătești online, cu cardul. %s Alegi ziua și ora imediat după plată.</p></div>' % ('Doar în Timișoara.' if x['cities'] == ['Timișoara'] else 'Alegi clinica, Timișoara sau Arad.'),
        ('<script type="application/json" data-tp-zc>%s</script>' % json.dumps(dict(x['zoneCopy'], _={'kind': x['kind'], 'promise': x['promise'], 'bullets': x['bullets']}), ensure_ascii=False).replace('</', '<\\/')) if x.get('zoneCopy') else '',
        '</div></div></section>'])


def results(x):
    rs = x.get('results') or []
    if not rs: return ''
    figs = ''.join('<figure><img src="%s" alt="Înainte și după: %s, %s" width="%d" height="%d" loading="lazy" decoding="async"><figcaption><b>%s</b><span>%s</span></figcaption></figure>' % (
        e(r['src']), e(r['title']), e(clean(r['sub'])), r['w'], r['h'], e(r['title']), e(clean(r['sub']))) for r in rs)
    return ('<section class="s" id="rezultate"><div class="wrap"><div class="sh"><h2 class="t2">%s</h2><p class="lead">%s</p></div><div class="cs%s">%s</div><p class="fine">%s</p></div></section>' % (
        'Rezultate reale, fotografiate la noi.', 'Clientele noastre, înainte și după, cu acordul lor.', ' one' if len(rs) == 1 else '', figs,
        e(x.get('resultsNote') or 'Rezultatele diferă de la o persoană la alta.')))


def steps_of(x):
    """the steps of how it works, in words: (title, text) as html, without the 1 · 2 · 3 of the old pages (the reel's sign 09)"""
    pr = t2.proc_fig(x)
    if pr:
        return [(re.sub(r'^\s*\d+\s*·\s*', '', b).strip(), clean(t).strip()) for b, t in re.findall(r'<li><b>(.*?)</b>(.*?)</li>', pr[1], re.S)]
    return [(e(clean(s['b'])), e(clean(s['t']))) for s in x['how']['steps']]


def video_of(x):
    v = x.get('video') or t2.VSL.get(x['id'])
    if not v: return ''
    return ('<div class="hw-v"><div class="vd" style="--ar:%s"><video src="%s" poster="%s" playsinline preload="none" aria-label="%s"></video>'
            '<button type="button" aria-label="Pornește video-ul"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z"/></svg></button></div>'
            '<p class="fine">%s</p></div>' % (v.get('ratio') or '16/9', e(v['src']), e(v['poster']), e(v['title']), e(clean(v.get('sub') or v['title']))))


def how(x):
    """how it works: the steps in words (the old drawings were made for the light site: not here), beside the video when there is one"""
    h = x['how']
    head = '<div class="sh"><h2 class="t2">%s</h2><p class="lead">%s</p></div>' % (e(clean(re.sub(r'</?em>', '', h['h']))), e(clean(h['text'])))
    st = steps_of(x)
    vid = video_of(x)
    ol = '<ol class="stp%s" style="--n:%d">%s</ol>' % ('' if vid else ' row', len(st), ''.join('<li><b>%s</b>%s</li>' % (b, t) for b, t in st))
    body = ('<div class="hw">%s%s</div>' % (vid, ol)) if vid else ol
    return '<section class="s" id="cum-functioneaza"><div class="wrap">%s%s</div></section>' % (head, body)


def fit(x):
    f = x.get('fit') or {}
    if not f.get('yes'): return ''
    yes = '<div><h3>E pentru tine dacă</h3><ul>%s</ul></div>' % ''.join('<li>%s</li>' % e(clean(y)) for y in f['yes'])
    no = '<div><h3>Nu e pentru tine dacă</h3><ul>%s</ul></div>' % ''.join('<li>%s</li>' % e(clean(y)) for y in f['no']) if f.get('no') else ''
    return '<section class="s tight"><div class="wrap"><div class="sh"><h2 class="t2">E potrivit pentru tine?</h2></div><div class="fit">%s%s</div></div></section>' % (yes, no)


def session(x):
    ses = x.get('session') or {}
    facts = []
    if x.get('minutes'): facts.append(('Durata', t2.ro_min(x.get('minutesLabel') or x['minutes'])))
    for k, lab in (('feel', 'Ce simți'), ('recovery', 'Recuperarea'), ('sessions', 'Câte ședințe'), ('when', 'Când se vede')):
        if ses.get(k): facts.append((lab, ses[k]))
    facts.append(('Unde', 'Doar în Timișoara, Str. Bucegi 7' if x['cities'] == ['Timișoara'] else 'În ambele clinici, Timișoara și Arad'))
    return '<section class="s tight"><div class="wrap"><div class="sh"><h2 class="t2">Ce te așteaptă la ședință.</h2></div><ul class="rows">%s</ul></div></section>' % ''.join(
        '<li><span class="lbl">%s</span><div class="rw"><p style="margin:0;color:var(--tx)">%s</p></div></li>' % (e(a), e(clean(b))) for a, b in facts)


def pairs(x):
    rows = []
    for p in x.get('pairs', []):
        q = t2.BY.get(p['id'])
        if not q: continue
        rows.append('<div class="pk-r" data-tp-pair="%s"><div class="pk-t"><a href="{{base}}tratament-%s"><b>%s</b></a><p>%s</p></div><div class="pk-p"><b data-tp-pp>%s</b><s data-tp-pf>%s</s></div>'
                    '<button type="button" class="pk-add" data-tp-plus="%s" aria-label="Adaugă %s în coș"><span class="a1">Adaugă</span><span class="a2">În coș</span></button></div>' % (
                        e(q['id']), q['id'], e(q['name']), e(clean(p['why'])), t2.bf(q['full']), lei(q['full']), e(q.get('pp') or q['id']), e(q['name'])))
    body = ('<div class="sh"><h2 class="t2">Merge bine împreună cu.</h2><p class="lead">Procedurile se completează între ele. Le adaugi în aceeași comandă.</p></div><div class="pkl">%s</div>' % ''.join(rows)) if rows else ''
    # v3/pp.js puts here the packages that hold this treatment, when there are (the owner, 25.11: „în ce pachet se regăsește ședința”)
    return '<section class="s tight tp-pairs-s"%s><div class="wrap">%s</div></section>' % ('' if rows else ' hidden', body)


def faq(x):
    if not x.get('faq'): return ''
    return '<section class="s tight"><div class="wrap qa-g"><div class="sh"><h2 class="t2">Întrebări</h2></div><div class="qa">%s</div></div></section>' % ''.join(
        '<details><summary>%s<i aria-hidden="true"></i></summary><div class="a"><p>%s</p></div></details>' % (e(clean(f['q'])), e(clean(f['a']))) for f in x['faq'])


def reviews():
    return ('<section class="s tight" id="recenzii"><div class="wrap"><div class="sh"><h2 class="t2">Ce spun clientele.</h2></div>'
            '<div class="rv-score"><b>5,0</b><span>din 5 pe Google, din peste 300 de recenzii, Timișoara și Arad</span></div><div class="rv-q">%s</div></div></section>' % ''.join(
                '<figure><blockquote>„%s”</blockquote><figcaption>%s, %s</figcaption></figure>' % (e(t), e(n), e(c)) for n, c, t in t2.REVIEWS))


def end(x, full, z0):
    return ('<section class="end tp-end"><div class="wrap tp-end-c"><h2 class="t2">%s</h2><p class="tp-pr" style="justify-content:center"><b data-tp-price>%s</b><s data-tp-full>%s</s></p>'
            '<p class="lead">Plătești online, cu cardul. Alegi clinica, ziua și ora după.</p><button type="button" class="btn lg" data-tp-add>Rezervă</button></div></section>' % (
                e(x['name']), t2.bf(full), lei(full)))


def dock(x, full, z0):
    bag = ('<button type="button" class="tp-bag" data-tp-bag data-cart hidden tabindex="-1" aria-label="Coșul tău"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
           '<path d="M5.2 8.5h13.6l-.9 10.6a2 2 0 0 1-2 1.9H8.1a2 2 0 0 1-2-1.9z"/><path d="M8.8 10.5V7.2a3.2 3.2 0 0 1 6.4 0v3.3"/></svg><i></i></button>')
    return ('<div class="dk tp-dk" data-tp-bar aria-hidden="true"><div class="dk-in"><p class="dk-t"><b data-tp-name>%s</b><span><b data-tp-price>%s</b><s data-tp-full>%s</s></span></p>%s'
            '<button type="button" class="btn" data-tp-add tabindex="-1">Rezervă</button></div></div>' % (e(x['name'] + (' ' + z0 if z0 else '')), t2.bf(full), lei(full), bag))


def page(x):
    i = x['id']; ppid = x.get('pp') or i
    zones = x.get('zones') or []; sess = x.get('sess') or [1, 3, 6]; full = x['full']
    z0 = zones[0] if zones else ''
    title = x['name'] + ' | ' + clean(x['kind']).replace(', ', ', ') + ' | Centrul360'
    out = ['<!--meta\ntitle: %s\ndescription: %s\ndock: off\n-->' % (title, clean(x['promise'] + ' ' + ' '.join(b + '.' for b in x['bullets']))),
           '<link rel="stylesheet" href="{{base}}shop.css">']
    data = {'id': ppid, 'page': i, 'name': x['name'], 'zones': zones, 'sess': sess, 'full': full, 'minutes': x.get('minutes'), 'cities': x['cities'], 'pct': PCT,
            'pairs': [p['id'] for p in x.get('pairs', [])], 'epi': None}
    out.append('<script type="application/json" id="tp-data">%s</script>' % json.dumps(data, ensure_ascii=False).replace('</', '<\\/'))
    n = cut_of(x, z0)
    if n: out.append('<link rel="preload" as="image" href="{{base}}img/cut/%s.webp" fetchpriority="high">' % n)
    out.append('<div class="tp" data-tp="%s">' % e(i))
    out.append(hero(x, zones, z0))
    out.append(buy(x, zones, sess, full, z0))
    out.append(results(x))
    out.append(how(x))
    out.append(fit(x))
    out.append(session(x))
    out.append(pairs(x))
    out.append(faq(x))
    out.append(reviews())
    out.append(end(x, full, z0))
    out.append(dock(x, full, z0))
    out.append('</div><script src="{{base}}shop.js" defer></script><script src="{{base}}pp.js" defer></script>')
    return '\n'.join(s for s in out if s) + '\n'


if __name__ == '__main__':
    n = 0
    for x in t2.ITEMS:
        if x['id'] == 'epilare':
            # laser epilation, not sold for now (the owner, 25.11): its shop page leads to the device's page
            s = ('<!--meta\ntitle: Epilare laser, Elysion Pro | Centrul360\ndescription: Epilare laser cu Elysion Pro, la Centrul360 Timișoara.\n'
                 'robots: noindex,follow\ndock: off\n-->\n<style>@view-transition{navigation:none}</style><script>location.replace("{{base}}epilare-laser" + location.search + location.hash)</script>\n'
                 '<section class="s"><div class="wrap"><p class="lead"><a class="lk" href="{{base}}epilare-laser">Epilare laser, Elysion Pro</a></p></div></section>\n')
        else:
            s = page(x)
        if '—' in s or '–' in s: raise SystemExit(x['id'] + ': a long dash slipped in')
        open(os.path.join(SRC, 'tratament-%s.html' % x['id']), 'w', encoding='utf-8').write(s)
        n += 1
    print('wrote', n, 'pages')
