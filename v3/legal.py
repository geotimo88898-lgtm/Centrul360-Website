#!/usr/bin/env python3
"""The legal pages of the v3 site (Termeni, Cookies, Confidențialitate, Garanție și returnare): the current text exactly (from
v2/src/<page>.html), set in one readable column (.doc) under a plain first screen; the guarantee's request form keeps its fields,
its endpoint and its script, in the v3 form's look (.fm). The clause numbers of a legal text stay (they are the text).
  python3 v3/legal.py   (then python3 v3/build.py)"""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
V2 = os.path.join(os.path.dirname(HERE), 'v2', 'src')
SRC = os.path.join(HERE, 'src')
PAGES = ['termeni', 'cookies', 'politica-de-confidentialitate', 'politica-de-garantie']
STYLE = '''<style>
.ph.lgl .t2{ max-width:20ch; }
.ph.lgl .lead{ margin-top:24px; max-width:60ch; }
.doc .sum{ margin:0 0 48px; padding:24px 0; border-top:1px solid var(--ln); border-bottom:1px solid var(--ln); }
.doc .sum p:first-child{ color:var(--tx); font-weight:600; }
.doc > p:first-child{ margin-top:0; }
.doc strong{ color:var(--tx); font-weight:600; }
.doc .fm{ margin:24px 0 8px; max-width:none; }
.pg-two{ display:grid; gap:18px; }
@media (min-width:640px){ .pg-two{ grid-template-columns:1fr 1fr; } }
.pg-hp{ position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden; }
.pg-err{ font-size:15px; font-weight:600; color:#ff8a80; }
.pg-err:empty{ display:none; }
.pg-done{ padding:20px 0; border-top:1px solid var(--ln); border-bottom:1px solid var(--ln); font-size:17px; color:var(--tx); }
.pg-small{ font-size:14px; color:var(--tx3); }
</style>'''


def clean(h):
    h = h.replace('{{arrow}}', '')
    h = re.sub(r'</?em>', '', h)
    h = re.sub(r'\s+·\s+', ', ', h)
    return h


def page(name):
    s = open(os.path.join(V2, name + '.html'), encoding='utf-8').read()
    meta = dict(re.findall(r'^(title|description|path|robots): (.*)$', s.split('-->', 1)[0], re.M))
    title = re.sub(r'\s*·\s*', ' | ', meta['title']).replace(' | Centrul360 Timișoara și Arad', ' | Centrul360')
    hero = re.search(r'<section class="lg-hero">(.*?)</section>', s, re.S).group(1)
    h1 = clean(re.sub(r'<[^>]+>', '', re.search(r'<h1[^>]*>(.*?)</h1>', hero, re.S).group(1))).strip()
    lead = clean(re.search(r'<p class="lead">(.*?)</p>', hero, re.S).group(1)).strip()
    body = re.search(r'<div class="lg">(.*)</div></div></section>', s, re.S).group(1)
    body = clean(body)
    # the fonts the v3 site asks Google for (the cookie policy names them)
    body = body.replace('Încărcăm fonturile Fraunces și Inter de la Google Fonts', 'Încărcăm fonturile Inter, Inter Tight și Montserrat de la Google Fonts')
    body = body.replace('<div class="pg-sum">', '<div class="sum">')
    body = body.replace('class="pg-f"', 'class="pg-f fm"').replace('class="btn book"', 'class="btn"').replace('class="pg-ok"', 'class="pg-ok chk"')
    script = ''.join(re.findall(r'(<script>.*?</script>)', s.split('</section>')[-1], re.S))
    out = ['<!--meta\ntitle: %s\ndescription: %s\npath: %s\ndock: off\n%s-->' % (title, meta['description'], meta.get('path', name), ('robots: %s\n' % meta['robots']) if meta.get('robots') else ''),
           STYLE,
           '<section class="ph lgl" aria-label="%s"><div class="wrap"><h1 class="t2">%s</h1><p class="lead">%s</p></div></section>' % (h1, h1, lead),
           '<section class="s tight"><div class="wrap"><div class="doc">%s</div></div></section>' % body.strip(),
           script]
    open(os.path.join(SRC, name + '.html'), 'w', encoding='utf-8').write('\n'.join(x for x in out if x) + '\n')
    return name


if __name__ == '__main__':
    for p in PAGES: print('wrote', page(p))
