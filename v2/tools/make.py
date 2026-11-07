import os, sys, asyncio
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mk import mark
OUT = '/home/user/centrul360-website/brand_asset/brand'
svgs = {
  'mark.svg': mark(),                                   # the brand master, ink, transparent
  'mark-white.svg': mark(color='#ffffff'),
  'favicon.svg': mark(stroke=46, dark=True),            # bolder for 16-32 px, white in dark mode
}
for n, s in svgs.items(): open(os.path.join(OUT, n), 'w').write(s)
# raster jobs: name, svg, px
jobs = [
  ('favicon-16.png', mark(stroke=58), 16), ('favicon-32.png', mark(stroke=46), 32), ('favicon-48.png', mark(stroke=40), 48),
  ('apple-touch-icon.png', mark(stroke=30, bg='#ffffff', pad=150), 180),
  ('icon-192.png', mark(stroke=30, bg='#ffffff', pad=150), 192), ('icon-512.png', mark(stroke=24, bg='#ffffff', pad=150), 512),
  ('icon-maskable-512.png', mark(stroke=24, bg='#ffffff', pad=330), 512),
]
open('jobs.json','w').write(__import__('json').dumps(jobs))
