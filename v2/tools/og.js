// Social sharing images (1200x630) for the v2 pages: logo, the page's headline, Nuki, the gift and the rating.
const { chromium } = require('playwright'); const fs = require('fs'); const { execSync } = require('child_process');
const ROOT = '/home/user/centrul360-website';
const TREAT = { 'grasime-localizata': 'Corp', celulita: 'Corp', 'tonifiere-musculara': 'Corp', 'detox-drenaj': 'Corp',
  'riduri-linii-fine': 'Față', 'gusa-barbie-dubla': 'Față', 'pete-pigmentare': 'Față', 'ten-problematic': 'Față', 'ten-lipsit-de-stralucire': 'Față', 'epilare-laser': 'Epilare laser' };
const FIXED = {
  index: ['Clinică', 'Medicină estetică <em>non-invazivă.</em>', 'salut-pa'],
  oferte: ['Oferte', 'Ofertele de <em>acum.</em>', 'cadou'], preturi: ['Prețuri', 'Prețuri <em>clare.</em>', 'fisa'],
  rezultate: ['Rezultate', 'Rezultate <em>reale.</em>', 'stea-google'], 'catalog-rezultate': ['Catalog', '40 de cazuri <em>reale.</em>', 'aparat-foto'],
  echipa: ['Echipa', 'Oamenii din <em>spatele rezultatelor.</em>', 'mana-inima'], timisoara: ['Clinica', 'Centrul360 <em>Timișoara.</em>', 'receptie'],
  arad: ['Clinica', 'Centrul360 <em>Arad.</em>', 'bucurie'], programare: ['Programare', 'Programează-te în <em>30 de secunde.</em>', 'calendar'],
};
const TM = ['epilare-laser', 'tonifiere-musculara', 'detox-drenaj', 'timisoara'];
const cityOf = (k) => (TM.includes(k) ? 'Timișoara' : k === 'arad' ? 'Arad' : 'Timișoara și Arad');
const pages = {};
for (const [k, v] of Object.entries(FIXED)) pages[k] = { eye: v[0], h: v[1], pose: v[2] };
for (const [k, eye] of Object.entries(TREAT)) {
  const f = ROOT + '/v2/src/' + k + '.html'; if (!fs.existsSync(f)) continue;
  const s = fs.readFileSync(f, 'utf8'), h = (/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(s) || [])[1], pose = (/class="nuki"[\s\S]*?ipostaze\/([a-z-]+)\.webp/.exec(s) || [])[1];
  if (h) pages[k] = { eye, h: h.trim(), pose: pose || 'prezinta' };
}
const only = process.argv.slice(2);
const MARK = '<svg viewBox="122 122 566 566" width="46" height="46" fill="none" stroke="#0b0b0d" stroke-width="30"><circle cx="405" cy="405" r="262"/><ellipse cx="405" cy="405" rx="104" ry="207"/><ellipse cx="405" cy="405" rx="207" ry="113"/></svg>';
const G = '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.4 5.4 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.96-2.91l-3.86-3c-1.08.72-2.45 1.16-4.1 1.16-3.15 0-5.82-2.13-6.77-4.99H1.24v3.09A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.23 14.26a7.2 7.2 0 0 1 0-4.52V6.65H1.24a12 12 0 0 0 0 10.7l3.99-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.24 6.65l3.99 3.09C6.18 6.88 8.85 4.75 12 4.75z"/></svg>';
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
  for (const [k, c] of Object.entries(pages)) {
    if (only.length && !only.includes(k)) continue;
    const len = c.h.replace(/<[^>]+>/g, '').length, fs_ = len > 52 ? 58 : len > 38 ? 66 : len > 26 ? 76 : 86;
    const img = 'data:image/webp;base64,' + fs.readFileSync(ROOT + '/brand_asset/mascota/ipostaze/' + c.pose + '.webp').toString('base64');
    await p.setContent(`<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&family=Fraunces:ital,opsz,wght@1,9..144,400&family=Montserrat:wght@300;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;overflow:hidden;font-family:Inter,sans-serif;color:#0b0b0d;-webkit-font-smoothing:antialiased;
background:radial-gradient(60% 75% at 92% 8%,rgba(95,212,198,.34),transparent 62%),radial-gradient(50% 60% at 0% 100%,rgba(20,165,150,.13),transparent 60%),linear-gradient(180deg,#fff,#f6fbfa)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(11,11,13,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(11,11,13,.05) 1px,transparent 1px);background-size:56px 56px;-webkit-mask-image:radial-gradient(60% 70% at 35% 40%,#000,transparent 75%)}
.l{position:absolute;left:72px;top:64px;bottom:60px;width:680px;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:14px;font-family:Montserrat;font-weight:800;font-size:27px;letter-spacing:-.005em}.brand span{font-weight:300}
.eye{margin-top:auto;display:flex;align-items:center;gap:12px;font-size:19px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#646b75}
.eye i{width:10px;height:10px;border-radius:50%;background:#14a596;box-shadow:0 0 0 6px rgba(20,165,150,.14)}
h1{margin:22px 0 0;font-weight:800;font-size:${fs_}px;line-height:1.0;letter-spacing:-.045em}
h1 em{font-family:Fraunces,serif;font-style:italic;font-weight:400;letter-spacing:-.02em;color:#0b7f74}
h1 .w{display:inline}
.foot{margin-top:34px;display:flex;align-items:center;gap:22px;font-size:21px;color:#262a30}
.pill{white-space:nowrap;font-size:20px;display:flex;align-items:center;gap:10px;padding:12px 22px;border-radius:999px;color:#fff;font-weight:600;background:linear-gradient(180deg,#1bb9a9,#0f9083);box-shadow:0 14px 30px -14px rgba(16,145,132,.7)}
.g{display:flex;align-items:center;gap:9px;font-weight:600;white-space:nowrap}.g small{font-weight:500;color:#646b75;font-size:19px}
.r{position:absolute;right:30px;top:40px;bottom:30px;width:430px;display:grid;place-items:center}
.orb{position:absolute;width:420px;height:420px;border-radius:50%;background:radial-gradient(circle at 50% 45%,rgba(95,212,198,.42),rgba(95,212,198,.1) 52%,transparent 70%)}
.ring{position:absolute;width:470px;height:470px;border-radius:50%;border:1.5px solid rgba(20,165,150,.18)}
.r img{position:relative;width:400px;height:auto;filter:drop-shadow(0 30px 34px rgba(11,60,55,.2))}
.sh{position:absolute;bottom:22px;width:170px;height:20px;border-radius:50%;background:radial-gradient(closest-side,rgba(11,60,55,.18),transparent)}
</style></head><body><div class="grid"></div>
<div class="l"><div class="brand">${MARK}<div>CENTRUL360<span>.COM</span></div></div>
<div class="eye"><i></i>${c.eye} · ${cityOf(k)}</div><h1>${c.h}</h1>
<div class="foot"><div class="pill">Consultație gratuită + masaj facial cadou</div><div class="g">${G}5,0 <small>· 300+ recenzii</small></div></div></div>
<div class="r"><span class="orb"></span><span class="ring"></span><img src="${img}"><span class="sh"></span></div></body></html>`, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    const big = require('os').tmpdir() + '/og-' + k + '.png'; await p.screenshot({ path: big });
    execSync(`python3 -c "from PIL import Image; Image.open('${big}').convert('RGB').resize((1200,630), Image.LANCZOS).save('${ROOT}/brand_asset/og/${k}.jpg', quality=90, optimize=True, progressive=True)"`);
    console.log('og', k, c.pose);
  }
  await b.close();
})();
