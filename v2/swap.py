#!/usr/bin/env python3
"""The swap: the v2 pages become centrul360.com. Only on the owner's „da”.
  python3 v2/swap.py --out <dir>   builds the live site into <dir> (to test it; nothing in the repo changes)
  python3 v2/swap.py --apply       writes the live pages over the old ones in the site root, plus sitemap.xml
The addresses stay exactly the same (/, /celulita, /oferte, /termeni...), so Google keeps every page and every
link from ads or posts still works; the old pages stay in git history (undo = revert that commit).
Live means: no "Previzualizare" badge, no open questions, robots index (thank-you pages stay noindex), the Meta
pixel and the Google tag on, links to the root. The /v2/ preview keeps working for the next changes."""
import os, re, subprocess, sys, datetime, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SITE = 'https://www.centrul360.com/'

args = sys.argv[1:]
if '--apply' in args: out = ROOT
elif '--out' in args: out = os.path.abspath(args[args.index('--out') + 1])
else: out = tempfile.mkdtemp(prefix='c360-swap-'); print('dry run into', out)

subprocess.run([sys.executable, os.path.join(HERE, 'build.py')], check=True, stdout=subprocess.DEVNULL,
               env=dict(os.environ, V2_BASE='/', V2_OUT=out))

pages = sorted(f[:-5] for f in os.listdir(os.path.join(HERE, 'src')) if f.endswith('.html') and not f.startswith('_'))
built, index = [], []
for name in pages:
    raw = open(os.path.join(HERE, 'src', name + '.html'), encoding='utf-8').read()
    meta = dict(l.split(':', 1) for l in re.match(r'\s*<!--meta\n(.*?)-->', raw, re.S).group(1).strip().splitlines() if ':' in l)
    meta = {k.strip(): v.strip() for k, v in meta.items()}
    path = meta.get('path', name)
    html = open(os.path.join(out, path + '.html'), encoding='utf-8').read()
    # what the live site must never carry
    for bad in ('Previzualizare v2', 'class="prevq"'):
        if bad in html: sys.exit(path + ': the live page still has „' + bad + '”')
    links = [l for l in re.findall(r'href="(/v2/[^"#?]*)', html) if not re.search(r'\.(css|js|webmanifest|png|jpe?g|webp|svg|mp4|pdf)$', l)]
    if links: sys.exit(path + ': links to the preview: ' + ', '.join(sorted(set(links))))
    want = 'noindex' if 'noindex' in meta.get('robots', '') else 'index,follow'
    if 'name="robots" content="' + want not in html: sys.exit(path + ': robots should be ' + want)
    if "fbq('init'" not in html: sys.exit(path + ': no Meta pixel on the live page')
    if "gtag('config'" not in html: sys.exit(path + ': no Google tag on the live page')
    built.append(path)
    if 'noindex' not in meta.get('robots', ''): index.append('' if path == 'index' else path)

today = datetime.date.today().isoformat()
sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
           ''.join('  <url><loc>%s%s</loc><lastmod>%s</lastmod></url>\n' % (SITE, p, today) for p in index) + '</urlset>\n')
open(os.path.join(out, 'sitemap.xml'), 'w', encoding='utf-8').write(sitemap)

left = sorted(f[:-5] for f in os.listdir(ROOT) if f.endswith('.html') and f[:-5] not in built and not f.startswith('portal'))
print('live pages:', len(built), '· in the sitemap:', len(index))
print('old pages left as they are (their own flows):', ', '.join(left) or 'none')
