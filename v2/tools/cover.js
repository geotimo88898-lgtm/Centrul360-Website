// Facebook page cover (1640x856, Meta's size): the site's look. Everything that matters sits in the middle 1500x620, which
// both the desktop crop (820x312, top and bottom cut) and the phone crop (640x360, sides cut) show; the bottom left stays
// clear for the profile picture. Writes brand_asset/social/fb-cover-<variant>.jpg and a preview with both crops.
//   node v2/tools/cover.js
const { chromium } = require('playwright'); const fs = require('fs'); const os = require('os'); const { execSync } = require('child_process');
const ROOT = __dirname + '/../..';
const OUT = ROOT + '/brand_asset/social';
fs.mkdirSync(OUT, { recursive: true });
const b64 = (f) => 'data:image/webp;base64,' + fs.readFileSync(ROOT + '/brand_asset/mascota/ipostaze/' + f + '.webp').toString('base64');
const MARK = (s, c) => `<svg viewBox="122 122 566 566" width="${s}" height="${s}" fill="none" stroke="${c || '#0b0b0d'}" stroke-width="28"><circle cx="405" cy="405" r="262"/><ellipse cx="405" cy="405" rx="104" ry="207"/><ellipse cx="405" cy="405" rx="207" ry="113"/></svg>`;
const G = '<svg viewBox="0 0 24 24" width="30" height="30"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.4 5.4 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.96-2.91l-3.86-3c-1.08.72-2.45 1.16-4.1 1.16-3.15 0-5.82-2.13-6.77-4.99H1.24v3.09A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.23 14.26a7.2 7.2 0 0 1 0-4.52V6.65H1.24a12 12 0 0 0 0 10.7l3.99-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.24 6.65l3.99 3.09C6.18 6.88 8.85 4.75 12 4.75z"/></svg>';
const CSS = `*{box-sizing:border-box}body{margin:0;width:1640px;height:856px;overflow:hidden;font-family:Inter,sans-serif;color:#0b0b0d;-webkit-font-smoothing:antialiased;
background:radial-gradient(55% 80% at 80% 30%,rgba(95,212,198,.36),transparent 62%),radial-gradient(45% 60% at 5% 95%,rgba(20,165,150,.12),transparent 60%),linear-gradient(180deg,#fff,#f5fbfa)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(11,11,13,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(11,11,13,.045) 1px,transparent 1px);background-size:64px 64px;-webkit-mask-image:radial-gradient(55% 70% at 40% 50%,#000,transparent 78%)}
em{font-family:Fraunces,serif;font-style:italic;font-weight:400;letter-spacing:-.02em;color:#0b7f74}
.brand{display:flex;align-items:center;gap:16px;font-family:Montserrat;font-weight:800;font-size:34px;letter-spacing:-.005em}.brand span{font-weight:300}
.eye{display:flex;align-items:center;gap:14px;font-size:22px;font-weight:600;letter-spacing:.17em;text-transform:uppercase;color:#646b75}
.eye i{width:11px;height:11px;border-radius:50%;background:#14a596;box-shadow:0 0 0 7px rgba(20,165,150,.14)}
h1{margin:0;font-weight:800;letter-spacing:-.048em;line-height:.98}
.pill{display:inline-flex;align-items:center;gap:12px;padding:16px 28px;border-radius:999px;color:#fff;font-size:24px;font-weight:600;white-space:nowrap;background:linear-gradient(180deg,#1bb9a9,#0f9083);box-shadow:0 16px 34px -16px rgba(16,145,132,.75)}
.pill svg{width:24px;height:24px}
.g{display:flex;align-items:center;gap:10px;font-size:24px;font-weight:600;white-space:nowrap}.g small{font-weight:500;color:#646b75;font-size:22px}
.stage{position:absolute;display:grid;place-items:center}
.orb{position:absolute;border-radius:50%;background:radial-gradient(circle at 50% 45%,rgba(95,212,198,.42),rgba(95,212,198,.1) 52%,transparent 70%)}
.ring{position:absolute;border-radius:50%;border:1.5px solid rgba(20,165,150,.2)}
.ring i{position:absolute;width:12px;height:12px;border-radius:50%;background:#14a596;box-shadow:0 0 16px rgba(20,165,150,.6)}
.stage img{position:relative;filter:drop-shadow(0 34px 38px rgba(11,60,55,.2))}
.sh{position:absolute;border-radius:50%;background:radial-gradient(closest-side,rgba(11,60,55,.2),transparent)}`;
const GIFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>';
const variants = {
  // A: the clinic and Nuki, the offer in one line
  nuki: `<div class="grid"></div>
<div style="position:absolute;left:150px;top:150px;width:860px;display:flex;flex-direction:column;gap:30px">
  <div class="brand">${MARK(52)}<div>CENTRUL360<span>.COM</span></div></div>
  <div class="eye"><i></i>Timișoara · Arad</div>
  <h1 style="font-size:104px">Medicină estetică<br><em>non-invazivă.</em></h1>
  <div style="display:flex;align-items:center;gap:28px;margin-top:6px"><div class="pill">${GIFT}Consultație gratuită + masaj facial cadou</div><div class="g">${G}5,0 <small>· 300+ recenzii Google</small></div></div>
</div>
<div class="stage" style="left:1040px;top:90px;width:520px;height:640px"><span class="orb" style="width:520px;height:520px"></span><span class="ring" style="width:600px;height:600px"><i style="top:-6px;left:294px"></i></span><img src="${b64('salut-pa')}" style="width:470px"><span class="sh" style="bottom:22px;width:210px;height:24px"></span></div>`,
  // B: the promise of the brand, centred
  clean: `<div class="grid"></div>
<div style="position:absolute;left:0;right:0;top:178px;display:flex;flex-direction:column;align-items:center;gap:30px;text-align:center">
  <div class="brand">${MARK(56)}<div>CENTRUL360<span>.COM</span></div></div>
  <h1 style="font-size:116px">Rezultate reale,<br><em>fără bisturiu.</em></h1>
  <div style="display:flex;align-items:center;gap:28px"><div class="pill">${GIFT}Consultație gratuită + masaj facial cadou</div><div class="g">${G}5,0 <small>· 300+ recenzii Google</small></div></div>
  <div class="eye"><i></i>Timișoara · Str. Bucegi 7 &nbsp;&nbsp;·&nbsp;&nbsp; Arad · Str. Ioan Alexandru 16-18</div>
</div>`,
};
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1640, height: 856 }, deviceScaleFactor: 2 });
  for (const [k, html] of Object.entries(variants)) {
    await p.setContent(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&family=Fraunces:ital,opsz,wght@1,9..144,400&family=Montserrat:wght@300;800&display=swap" rel="stylesheet"><style>${CSS}</style></head><body>${html}</body></html>`, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    const big = os.tmpdir() + '/cover-' + k + '.png'; await p.screenshot({ path: big });
    const out = OUT + '/fb-cover-' + k;
    execSync(`python3 -c "
from PIL import Image, ImageDraw
im = Image.open('${big}').convert('RGB').resize((1640, 856), Image.LANCZOS)
im.save('${out}.jpg', quality=93, optimize=True, progressive=True)
im.save('${out}.png', optimize=True)
# what Facebook shows: desktop 820x312 (the middle band), phone 640x360 (the middle)
pv = Image.new('RGB', (1640 + 40, 856 + 40 + 640), 'white'); pv.paste(im, (20, 20)); d = ImageDraw.Draw(pv)
h = int(1640 * 312 / 820); y = (856 - h) // 2; d.rectangle([20, 20 + y, 20 + 1639, 20 + y + h], outline=(230, 60, 60), width=4)
w = int(856 * 640 / 360); x = (1640 - w) // 2; d.rectangle([20 + x, 20, 20 + x + w, 20 + 855], outline=(40, 110, 230), width=4)
d.text((24, 856 + 30), 'rosu: ce se vede pe calculator   albastru: ce se vede pe telefon', fill=(60, 60, 60))
pv.crop((0, 0, 1680, 900)).save('${OUT}/preview-' + '${k}' + '.png')
"`);
    console.log('cover', k);
  }
  await b.close();
})();
