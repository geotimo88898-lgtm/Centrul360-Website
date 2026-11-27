#!/usr/bin/env python3
"""The problem pages of the v3 site (Grăsime localizată, Celulită...; the owner 27.11: „curățenie totală după reel”): the same
words as the live pages (v2/src/<page>.html: the promise, how it works, the real results, why it does not go away, how it goes,
the treatments with their online price, for whom, the questions, the reviews), drawn as the reel's final form: the problem in one
word edge to edge, a photo cut out over it, the facts in the corners; then a Swiss grid of rows, no mascot, no marquee, no
drawings, no dots between words, no Black Friday words (the price of the moment is the shop's, on the tiles and in the dock).
  python3 v3/probleme.py   (then python3 v3/build.py)"""
import html, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
V2 = os.path.join(ROOT, 'v2', 'src')
SRC = os.path.join(HERE, 'src')
CUT = json.load(open(os.path.join(HERE, 'img', 'cut', 'index.json'), encoding='utf-8'))

# word: the problem, edge to edge; cut: its picture (v3/img/cut); name: the problem in the corner; tr: what we treat it with;
# main: the treatment page of the first button; mainName; offers: the heading of the treatments; end: the last word
P = {
    'grasime-localizata': dict(word=['Grăsime'], cut='hifu-corp--abdomen', name='Grăsime localizată', tr='Liposonix, 40K Slim, HIFU',
                               main='tratament-liposonix', mainName='Liposonix', where='Timișoara și Arad'),
    'celulita': dict(word=['Celulită'], cut='radiofrecventa--coapse', name='Celulită', tr='Red Sculpt, 40K Slim, împachetare',
                     main='tratament-radiofrecventa', mainName='Red Sculpt', where='Timișoara și Arad'),
    'tonifiere-musculara': dict(word=['Tonifiere'], cut='p-ems', name='Tonifiere musculară', tr='EMS, electrostimulare magnetică',
                                main='tratament-ems', mainName='EMS', where='Doar în Timișoara',
                                promise='Mii de contracții într-o singură ședință, fără ore la sală.'),
    'detox-drenaj': dict(word=['Detox'], cut='impachetare', name='Detox și drenaj', tr='Împachetare la cald, presoterapie, termocuvertă',
                         main='tratament-impachetare', mainName='Împachetarea la cald', where='Doar în Timișoara'),
    'gusa-barbie-dubla': dict(word=['Gușă'], cut='home-biolifting-full-face', name='Gușă și bărbie dublă', tr='HIFU, BioLifting',
                              main='tratament-hifu', mainName='HIFU', where='Timișoara și Arad'),
    'riduri-linii-fine': dict(word=['Riduri'], cut='home-hifu-full-face', name='Riduri și lifting', tr='HIFU Full Face, BioLifting',
                              main='tratament-hifu-full-face', mainName='HIFU Full Face', where='Timișoara și Arad'),
    'ten-problematic': dict(word=['Acnee'], cut='home-sebum-off', name='Ten problematic', tr='Sebum Off, Redness, Hidratare',
                            main='tratament-sebum-off', mainName='Sebum Off', where='Timișoara și Arad'),
    'ten-lipsit-de-stralucire': dict(word=['Strălucire'], cut='home-hidratare', name='Ten fără strălucire', tr='Restart, Hidratare',
                                     main='tratament-restart', mainName='Restart', where='Timișoara și Arad'),
    'pete-pigmentare': dict(word=['Pete'], cut='home-restart', name='Pete și pigmentare', tr='Restart, Hidratare, Redness',
                            main='tratament-restart', mainName='Restart', where='Timișoara și Arad'),
}
PLAY = ('<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.6-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z"/></svg>')


def txt(h):
    """the words of a bit of the old page: no tags, no italic word, no dot between words, no arrow"""
    h = re.sub(r'\{\{arrow\}\}', '', h or '')
    h = re.sub(r'<svg.*?</svg>', '', h, flags=re.S)
    h = re.sub(r'</?(em|i|span|small|b|strong)[^>]*>', '', h)
    h = re.sub(r'\s+', ' ', h).strip()
    return re.sub(r'\s*(&nbsp;)?·(&nbsp;)?\s*', ', ', h)


def sec(s, sid=None, has=None):
    for a, b in re.findall(r'<section([^>]*)>(.*?)</section>', s, re.S):
        if sid and re.search(r'id="%s"' % sid, a): return b
        if has and has in b: return b
    return ''


def head(b):
    h2 = re.search(r'<h2[^>]*>(.*?)</h2>', b, re.S)
    ld = re.search(r'<p class="lead[^"]*">(.*?)</p>', b, re.S)
    return (txt(h2.group(1)) if h2 else ''), (txt(ld.group(1)) if ld else '')


def sh(h2, lead=''):
    return '<div class="sh"><h2 class="t2">%s</h2>%s</div>' % (h2, ('<p class="lead">%s</p>' % lead) if lead else '')


def page(pid):
    c = P[pid]
    s = open(os.path.join(V2, pid + '.html'), encoding='utf-8').read()
    meta = dict(re.findall(r'^(title|description): (.*)$', s, re.M))
    title = re.sub(r'\s*·\s*', ' | ', meta['title']).replace(' | Centrul360 Timișoara și Arad', ' | Centrul360').replace(' | Centrul360 Timișoara', ' | Centrul360')
    if 'Centrul360' not in title: title += ' | Centrul360'
    desc = re.sub(r'\s*-50% la plata online\.?', '', meta['description']).strip()
    h1 = txt(re.search(r'<h1[^>]*>(.*?)</h1>', s, re.S).group(1))
    hero_lead = txt(re.search(r'<section class="hero">.*?<p class="lead[^"]*">(.*?)</p>', s, re.S).group(1))
    n = c['cut']; whole = CUT.get(n) == 2
    out = ['<!--meta\ntitle: %s\ndescription: %s\npath: %s\ndock_href: #tratamente\ndock_cta: Vezi prețurile\n-->' % (title, desc, pid)]
    out.append('<link rel="preload" as="image" href="{{base}}img/cut/%s.webp" fetchpriority="high">\n<link rel="stylesheet" href="{{base}}shop.css">' % n)
    # the first screen (27.11, the owner: conversion, warmth, nothing for decor): her problem, the page's headline, what we do,
    # one button to the prices, the results one tap away, the proof
    has_rz = bool(sec(s, 'rezultate'))
    out.append(''.join([
        '<section class="hx" aria-label="%s"><div class="wrap hx-g"><div class="hx-t">' % html.escape(c['name']),
        '<span class="hx-eye">%s</span>' % c['name'],
        '<h1>%s</h1>' % h1,
        '<p class="hx-p">%s</p>' % hero_lead,
        '<div class="hx-cta"><a class="btn lg" href="#tratamente">Vezi tratamentele și prețurile</a>%s</div>' % ('<a class="lk" href="#rezultate">Vezi rezultatele</a>' if has_rz else ''),
        '<ul class="hx-ok"><li class="st"><i aria-hidden="true">★★★★★</i>5,0 pe Google, din peste 300 de recenzii</li><li><span data-terms>Prețuri mai mici la plata online</span></li><li>Cu %s, %s</li></ul>' % (c['tr'], ('doar' + c['where'][4:]) if c['where'].startswith('Doar') else 'în ' + c['where']),
        '</div><div class="hx-fig"><img src="{{base}}img/cut/%s.webp" alt="" fetchpriority="high" decoding="async"></div>' % n,
        '</div></section>']))
    # the promise, in a sentence; why it does not go away (the old „scrub”)
    sc = sec(s, has='class="scrub"')
    st = txt(re.search(r'<p class="scrub"[^>]*>(.*?)</p>', sc, re.S).group(1)) if sc else ''
    out.append('<section class="s" id="de-ce"><div class="wrap"><p class="stmt">%s</p>%s</div></section>' % (
        st or hero_lead, ('<p class="lead" style="margin-top:clamp(28px,3vw,40px);max-width:52ch">%s</p>' % hero_lead) if st else ''))
    # how it works (+ the video, when the page has one)
    cm = sec(s, 'cum'); h2, ld = head(cm)
    steps = [(txt(re.sub(r'^\s*\d+\s*·\s*', '', b)), txt(t)) for b, t in re.findall(r'<li><b>(.*?)</b>(.*?)</li>', cm, re.S)]
    fv = sec(s, 'video'); vid = ''
    if fv:
        v = re.search(r'<video src="([^"]+)" poster="([^"]+)"', fv)
        eye = re.search(r'<span class="eye">(.*?)</span>', fv, re.S)
        vh2, vld = head(fv)
        vid = ('<div class="hw-v"><div class="vd" style="--ar:16/9"><video src="%s" poster="%s" playsinline preload="none" aria-label="%s"></video>'
               '<button type="button" aria-label="Pornește video-ul">%s</button></div><p class="fine">%s. %s</p></div>' % (
                   v.group(1), v.group(2), html.escape(vh2), PLAY, txt(eye.group(1)) if eye else 'Video', vld))
    ol = '<ol class="stp%s" style="--n:%d">%s</ol>' % ('' if vid else ' row', len(steps), ''.join('<li><b>%s</b>%s</li>' % (b, t) for b, t in steps))
    out.append('<section class="s" id="cum"><div class="wrap">%s%s</div></section>' % (sh(h2, ld), ('<div class="hw">%s%s</div>' % (vid, ol)) if vid else ol))
    # what we use (Detox: three treatments)
    tr = sec(s, 'tratamente')
    if tr:
        h2, ld = head(tr)
        rows = ''
        for k, b, p, a in re.findall(r'<div class="card[^"]*"><span class="k">(.*?)</span><b>(.*?)</b><p>(.*?)</p>(.*?)</div>', tr, re.S):
            href = re.search(r'href="([^"]+)"', a)
            rows += '<div><span class="lbl">%s</span><div class="rw"><b>%s</b><p>%s</p>%s</div></div>' % (
                txt(k), txt(b), txt(p), ('<p style="margin-top:12px"><a class="lk" href="%s">Despre %s</a></p>' % (href.group(1), txt(b).lower())) if href else '')
        out.append('<section class="s tight" id="ce-folosim"><div class="wrap">%s<div class="rows">%s</div></div></section>' % (sh(h2, ld), rows))
    # the real results (the approved set, as the old page has them)
    rz = sec(s, 'rezultate')
    figs = re.findall(r'<img src="([^"]+)" alt="([^"]*)" width="(\d+)" height="(\d+)"[^>]*></div><figcaption><b>(.*?)</b><span>(.*?)</span></figcaption>', rz, re.S)
    if figs:
        note = re.search(r'<p class="fine"[^>]*>(.*?)</p>', rz, re.S)
        out.append('<section class="s tight" id="rezultate"><div class="wrap">%s<div class="cs%s">%s</div><p class="fine">%s</p></div></section>' % (
            sh('Rezultate reale, fotografiate la noi.', 'Clientele noastre, înainte și după, cu acordul lor.'), ' one' if len(figs) == 1 else '',
            ''.join('<figure><img src="%s" alt="%s" width="%s" height="%s" loading="lazy" decoding="async"><figcaption><b>%s</b><span>%s</span></figcaption></figure>' % (
                src, html.escape(txt(alt)), w, h, txt(b), txt(sp)) for src, alt, w, h, b, sp in figs),
            txt(note.group(1)) if note else 'Rezultatele diferă de la o persoană la alta.'))
    # how it goes (the old timeline)
    pr = sec(s, 'protocol'); h2, ld = head(pr)
    items = re.findall(r'<li[^>]*><small>(.*?)</small><b>(.*?)</b>\s*<p>(.*?)</p></li>', pr, re.S)
    if items:
        out.append('<section class="s tight" id="cum-decurge"><div class="wrap">%s<ol class="rows">%s</ol></div></section>' % (
            sh(h2, ld), ''.join('<li><span class="lbl">%s</span><div class="rw"><b>%s</b><p>%s</p></div></li>' % (txt(a), txt(b), txt(p)) for a, b, p in items)))
    # the treatments, with the shop's online price
    ids = re.search(r'data-shop-ids="([^"]+)"', s).group(1)
    out.append('<section class="s tight" id="tratamente"><div class="wrap">%s<div class="pl-box" data-shop-ids="%s" data-max="4"></div>'
               '<p style="margin-top:40px"><a class="btn ol" href="{{base}}oferte">Toate tratamentele</a></p></div></section>' % (
                   sh('Tratamentele, cu prețul online.', 'Alegi tratamentul, plătești online și îți alegi clinica, ziua și ora.'), ids))
    # for whom
    ft = sec(s, has='class="wrap fit"')
    yes = re.findall(r'<li><i>.*?</i><span>(.*?)</span></li>', re.search(r'class="card yes">(.*?)</ul>', ft, re.S).group(1), re.S)
    no = re.findall(r'<li><i>.*?</i><span>(.*?)</span></li>', re.search(r'class="card no">(.*?)</ul>', ft, re.S).group(1), re.S)
    out.append('<section class="s tight" id="pentru-cine"><div class="wrap">%s<div class="fit"><div><h3>E pentru tine dacă</h3><ul>%s</ul></div><div><h3>Nu e pentru tine dacă</h3><ul>%s</ul></div></div></div></section>' % (
        sh('E potrivit pentru tine?'), ''.join('<li>%s</li>' % txt(x) for x in yes), ''.join('<li>%s</li>' % txt(x) for x in no)))
    # the questions
    fq = sec(s, 'intrebari')
    qs = re.findall(r'<div class="q"><button type="button">(.*?)<span class="pm"></span></button>\s*<div class="a"><div>(.*?)</div></div></div>', fq, re.S)
    out.append('<section class="s tight" id="intrebari"><div class="wrap qa-g"><div class="sh"><h2 class="t2">Întrebări</h2></div><div class="qa">%s</div></div></section>' % ''.join(
        '<details><summary>%s<i aria-hidden="true"></i></summary><div class="a">%s</div></details>' % (txt(q), ''.join('<p>%s</p>' % txt(p) for p in re.findall(r'<p>(.*?)</p>', a, re.S))) for q, a in qs))
    # the reviews (the real ones of the old page)
    rv = sec(s, has='class="revs"')
    revs = re.findall(r'<div class="card rev[^"]*">.*?<p>(.*?)</p><small>(.*?)</small></div>', rv, re.S)
    out.append('<section class="s tight" id="recenzii"><div class="wrap">%s<div class="rv-score"><b>5,0</b><span>din 5 pe Google, din peste 300 de recenzii</span></div><div class="rv-q">%s</div></div></section>' % (
        sh('Ce spun clientele.', 'Recenziile sunt de pe Google, scrise de clientele noastre din Timișoara și Arad.'),
        ''.join('<figure><blockquote>%s</blockquote><figcaption>%s</figcaption></figure>' % (txt(q), txt(w)) for q, w in revs)))
    # the last word
    out.append('<section class="end"><div class="wrap"><h2 class="t2">Începe cu %s, la ora aleasă de tine.</h2>'
               '<p class="lead">Plătești online prețul de pe site, apoi alegi clinica, ziua și ora.</p>'
               '<p style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center"><a class="btn lg" href="{{base}}%s">Despre %s</a><a class="btn lg ol" href="{{base}}oferte">Toate ofertele</a></p></div></section>' % (
                   c['mainName'], c['main'], c['mainName']))
    out.append('<script src="{{base}}shop.js" defer></script>')
    body = '\n'.join(out) + '\n'
    for bad in ('-50%', 'vineri', 'Black Friday', 'Jumătate de preț', 'jumătate de preț', 'Nuki'):
        if bad in re.sub(r'<video[^>]*>', '', body) and not (bad == 'Nuki' and 'spuse de Nuki' in body):
            print('  note:', pid, 'has', bad)
    open(os.path.join(SRC, pid + '.html'), 'w', encoding='utf-8').write(body)
    return pid


if __name__ == '__main__':
    for k in P: print('wrote', page(k))
