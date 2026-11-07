// The apps' launcher icons and splash screens (mobile-app: Android + iOS, android-app) with the real Centrul360 mark
// (ring + two ellipses), written over the files in place at their own sizes.   node v2/tools/app-icons.js
const { chromium } = require('playwright'); const fs = require('fs'); const os = require('os'); const { execFileSync } = require('child_process');
const ROOT = __dirname + '/../..';
const MARK = (stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${143 - stroke / 2} ${143 - stroke / 2} ${524 + stroke} ${524 + stroke}" width="2048" height="2048"><g fill="none" stroke="#0b0b0d" stroke-width="${stroke}"><circle cx="405" cy="405" r="262"/><ellipse cx="405" cy="405" rx="104" ry="207"/><ellipse cx="405" cy="405" rx="207" ry="113"/></g></svg>`;
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 2048, height: 2048 } });
  const out = {};
  for (const [k, stroke] of [['bold', 34], ['thin', 24]]) {
    await p.setContent('<html><body style="margin:0;background:transparent">' + MARK(stroke) + '</body></html>');
    out[k] = os.tmpdir() + '/mark-' + k + '.png'; await p.screenshot({ path: out[k], omitBackground: true, clip: { x: 0, y: 0, width: 2048, height: 2048 } });
  }
  await b.close();
  const py = `
import sys, glob, os
from PIL import Image, ImageDraw
R = sys.argv[1]; bold = Image.open(sys.argv[2]).convert('RGBA'); thin = Image.open(sys.argv[3]).convert('RGBA')
def mark(src, px):
    return src.resize((px, px), Image.LANCZOS)
def icon(size, kind):
    if kind == 'fg':      # adaptive icon foreground: the mark inside the 66% safe zone, transparent
        im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); m = mark(bold, int(size * .46))
    elif kind == 'round':
        im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); ImageDraw.Draw(im).ellipse([0, 0, size - 1, size - 1], fill=(255, 255, 255, 255)); m = mark(bold, int(size * .6))
    elif kind == 'ios':   # iOS masks the corners itself: a full white square
        im = Image.new('RGBA', (size, size), (255, 255, 255, 255)); m = mark(thin, int(size * .6))
    else:                 # legacy square icon: white, rounded corners
        im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); ImageDraw.Draw(im).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * .22), fill=(255, 255, 255, 255)); m = mark(bold, int(size * .6))
    im.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2)); return im
def splash(w, h):
    im = Image.new('RGBA', (w, h), (255, 255, 255, 255)); m = mark(thin, int(min(w, h) * .22)); im.alpha_composite(m, ((w - m.width) // 2, (h - m.height) // 2)); return im
n = 0
for f in glob.glob(R + '/mobile-app/**/*.png', recursive=True) + glob.glob(R + '/android-app/**/*.png', recursive=True):
    base = os.path.basename(f); w, h = Image.open(f).size
    if base.startswith('ic_launcher_foreground'): im = icon(w, 'fg')
    elif base.startswith('ic_launcher_round'): im = icon(w, 'round')
    elif base.startswith('ic_launcher'): im = icon(w, 'square')
    elif base.startswith('AppIcon'): im = icon(w, 'ios').convert('RGB')
    elif base.startswith('splash'): im = splash(w, h).convert('RGB')
    else: continue
    im.save(f, optimize=True); n += 1
print('icons written:', n)
`;
  console.log(execFileSync('python3', ['-c', py, ROOT, out.bold, out.thin]).toString().trim());
})();
