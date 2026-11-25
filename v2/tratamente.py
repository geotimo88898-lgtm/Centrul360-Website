#!/usr/bin/env python3
"""The treatments' own pages (the owner, 24.11: „fiecare tratament să aibă un product page, cu tot despre el”).
  python3 v2/tratamente.py      writes v2/src/tratament-<id>.html for every treatment, then run python3 v2/build.py
The words come only from v2/products-content.json (taken from the site's own pages, nothing invented); the explainer
animation („Cum funcționează”) is the one of the site's page that explains the same technology (its figure.card.proc and
its <style>). The price, the sessions, the zone and the button are filled live by v2/shop.js ([data-pp]), from /api/shop."""
import json, os, re, html
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
C = json.load(open(os.path.join(HERE, 'products-content.json'), encoding='utf-8'))
items = C if isinstance(C, list) else C.get('products', [])
e = lambda s: html.escape(str(s or ''), quote=True)
NEED = {'liposonix': 'corp', 'cavitatie': 'corp', 'ems': 'corp', 'radiofrecventa': 'corp', 'hifu-corp': 'corp', 'impachetare': 'corp',
        'hifu': 'gusa', 'rf-sculpt-gusa': 'gusa', 'biolifting': 'gusa', 'epilare': 'epilare'}
NEED_T = {'corp': 'Corp', 'gusa': 'Gușă și contur', 'fata': 'Față', 'epilare': 'Epilare laser'}
TM_ONLY = {'ems', 'impachetare', 'epilare'}
def pic(i):  # the same cut-outs as the cards (api/_lib/shop.js picOf)
    n = NEED.get(i, 'fata')
    return 'epilare' if n == 'epilare' else 'hifu-gusa' if n == 'gusa' else 'facial' if n == 'fata' else 'cavitatie' if i in ('cavitatie', 'ems') else 'liposonix'

def explainer(page):
    if not page: return ''
    try: s = open(os.path.join(SRC, page), encoding='utf-8').read()
    except OSError: return ''
    m = re.search(r'<figure class="card proc[\s\S]*?</figure>', s)
    if not m: return ''
    styles = ''.join(re.findall(r'<style>[\s\S]*?</style>', s))
    return styles + '<div class="pp-how">' + m.group(0) + '</div>'

def page(x):
    i = x['id']; need = NEED.get(i, 'fata'); pp = 'epilare-full-body' if i == 'epilare' else i
    how = x.get('how') or {}; ses = x.get('session') or {}; fit = x.get('fit') or {}
    out = ['<!--meta', 'title: %s -50%% la plata online · Centrul360 Timișoara și Arad' % x['title'],
           'description: %s' % (x.get('lead') or x['title']).replace('\n', ' '), 'dock: off', '-->',
           '<link rel="stylesheet" href="/v2/shop.css">', "<script>document.body.classList.add('bfo-page')</script>", '<div class="pp">']
    probs = x.get('problems') or []
    out.append('<section class="pp-hero"><div class="wrap"><div class="pp-tx"><p class="eyb">Black Friday · %s</p><h1>%s</h1>' % (e(NEED_T[need]), e(x['title'])))
    if x.get('lead'): out.append('<p class="lead">%s</p>' % e(x['lead']))
    out.append('<div class="pp-buy" data-pp="%s"><div class="sh-wait">Încarc prețul…</div></div></div>' % pp)
    out.append('<div class="pp-pic"><img src="/brand_asset/oferte/%s.webp?v=3" alt="" decoding="async"></div></div></section>' % pic(i))
    if probs:
        out.append('<section class="pp-s"><div class="wrap"><p class="eyb">Ce rezolvă</p><h2>Pentru ce e.</h2><ul class="pp-list">%s</ul></div></section>' % ''.join('<li>%s</li>' % e(p) for p in probs))
    ex = explainer(how.get('explainerFrom'))
    if how.get('text') or ex or how.get('steps'):
        out.append('<section class="pp-s"><div class="wrap"><p class="eyb">Cum funcționează</p><h2>Simplu, pe scurt.</h2>')
        if how.get('text'): out.append('<p class="pp-p">%s</p>' % e(how['text']))
        if ex: out.append(ex)
        if how.get('steps'): out.append('<ol class="pp-steps" style="margin-top:22px">%s</ol>' % ''.join('<li>%s</li>' % e(s) for s in how['steps']))
        out.append('</div></section>')
    facts = []
    if ses.get('minutes'): facts.append(('Durata', '%s min' % ses['minutes']))
    if ses.get('sessions'): facts.append(('Câte ședințe', ses['sessions']))
    if ses.get('feel'): facts.append(('Ce simți', ses['feel']))
    facts.append(('Unde', 'Doar în Timișoara' if i in TM_ONLY else 'Timișoara și Arad'))
    out.append('<section class="pp-s"><div class="wrap"><p class="eyb">Ședința</p><h2>Ce te așteaptă.</h2><div class="pp-facts">%s</div>' % ''.join('<div><small>%s</small><b>%s</b></div>' % (e(a), e(b)) for a, b in facts))
    if x.get('zones'): out.append('<p class="pp-l" style="margin:26px 0 12px">Zone</p><div class="pp-zones">%s</div>' % ''.join('<span>%s</span>' % e(z) for z in x['zones']))
    out.append('</div></section>')
    if i == 'epilare':
        out.append('<section class="pp-s"><div class="wrap"><p class="eyb">Pe zone</p><h2>Alege zona.</h2><div class="epi"><div class="epi-h"><b>Prețuri -50%</b><div class="seg d sm"><button type="button" data-g="f" aria-pressed="true">Femei</button><button type="button" data-g="m" aria-pressed="false">Bărbați</button></div></div><ul data-epi></ul></div></div></section>')
    if x.get('results'):
        out.append('<section class="pp-s"><div class="wrap"><p class="eyb">Rezultate reale</p><h2>Clientele noastre, fotografiate la noi.</h2><div class="pp-res">%s</div><p class="pp-fine">Rezultatele diferă de la o persoană la alta.</p></div></section>' %
                   ''.join('<figure><img src="%s" alt="Înainte și după: %s" loading="lazy" decoding="async"><figcaption>%s</figcaption></figure>' % (e(r['src']), e(r.get('zone') or x['title']), e(' · '.join(filter(None, [r.get('zone'), r.get('caption')])))) for r in x['results']))
    if fit.get('yes') or fit.get('no'):
        out.append('<section class="pp-s"><div class="wrap"><p class="eyb">E pentru tine?</p><h2>Spus sincer.</h2><div class="pp-fit">')
        if fit.get('yes'): out.append('<div><h3>E pentru tine dacă</h3><ul>%s</ul></div>' % ''.join('<li>%s</li>' % e(y) for y in fit['yes']))
        if fit.get('no'): out.append('<div><h3>Nu e pentru tine dacă</h3><ul>%s</ul></div>' % ''.join('<li>%s</li>' % e(y) for y in fit['no']))
        out.append('</div></div></section>')
    out.append('<section class="pp-s"><div class="wrap"><p class="eyb">Merge super în combinație cu</p><h2>Pentru un rezultat complet.</h2><div class="pp-pairs" data-pp-pairs></div></div></section>')
    if x.get('faq'):
        out.append('<section class="pp-s"><div class="wrap"><p class="eyb">Întrebări</p><h2>Bine de știut.</h2><div class="pp-faq">%s</div></div></section>' %
                   ''.join('<details><summary>%s</summary><p>%s</p></details>' % (e(f['q']), e(f['a'])) for f in x['faq']))
    out.append('<section class="pp-end"><div class="wrap"><p class="eyb">Black Friday</p><h2 style="margin:14px 0 0;color:var(--tx);font-size:clamp(1.9rem,4.6vw,3rem);letter-spacing:-.04em">-50% doar la plata online.</h2><div data-tm></div><button type="button" class="btn book gold" data-ppadd style="height:52px;padding:0 28px;font-size:16px;font-weight:600">Rezervă oferta{{arrow}}</button></div></section>')
    out.append('</div><script src="/v2/shop.js" defer></script>')
    return '\n'.join(out) + '\n'

if __name__ == '__main__':
    for x in items:
        open(os.path.join(SRC, 'tratament-%s.html' % x['id']), 'w', encoding='utf-8').write(page(x))
    print('wrote', len(items), 'pages')
