// Real screenshots of the live site for the "site" ending (never invented site content):
//   node site.cjs <reel id>        → the pages its end asks for (end.pages: [{key, url, section, tap}])
//   node site.cjs --page <url> <#section> <key> [tap selector]
// → engine/site/<key>.png (390 css px wide at DPR 2 = 780 px, the section only) + engine/site/nav.png (the site's
//   header, drawn over the page in the reel's browser) + engine/site/manifest.json (sizes, the tap targets' boxes).
// The cookie banner is refused; the floating booking dock, the reading-progress line and the cookie banner are hidden
// (overlays, not page content). Captures older than 7 days are taken again (--fresh: always).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = 'https://www.centrul360.com';
const OUT = path.join(__dirname, 'site');
const MAN = path.join(OUT, 'manifest.json');
const HIDE = '.dock, .ck, .progress, .aura, .sl-badge, #sl-m, #sl-g { display: none !important; } html { scroll-behavior: auto !important; }';
async function page(ctx, url) {
  const p = await ctx.newPage();
  await p.goto(BASE + url, { waitUntil: 'networkidle', timeout: 60000 });
  const no = await p.$('text=Refuz'); if (no) { await no.click().catch(() => {}); await p.waitForTimeout(300); }
  await p.addStyleTag({ content: HIDE });
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 300) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(90); } // the reveal animations play
  return p;
}
async function capture(ctx, M, spec) {
  const p = await page(ctx, spec.url);
  const box = await p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; e.scrollIntoView({ block: 'start' }); const r = e.getBoundingClientRect(); return { x: 0, y: r.top + window.scrollY, w: document.documentElement.clientWidth, h: r.height }; }, spec.section);
  if (!box) throw new Error('no section ' + spec.section + ' on ' + spec.url);
  await p.waitForTimeout(1200);
  const header = await p.evaluate(() => { const hd = document.querySelector('header'); return hd ? hd.getBoundingClientRect().bottom + 8 : 0; });
  // the header is sticky: it is drawn separately (nav.png), here it is hidden
  await p.addStyleTag({ content: 'header { visibility: hidden !important; }' });
  const file = spec.key.replace(/[^a-z0-9-]+/gi, '_') + '.png';
  await p.screenshot({ path: path.join(OUT, file), fullPage: true, clip: { x: 0, y: box.y, width: box.w, height: Math.min(box.h, 4000) } }); // the section only (never what is above it)
  const taps = {};
  for (const sel of [].concat(spec.tap || [])) {
    const r = await p.evaluate(([sec, sel]) => { const s = document.querySelector(sec), e = s && s.querySelector(sel); if (!e) return null; const a = s.getBoundingClientRect(), b = e.getBoundingClientRect(); return { x: b.left, y: b.top - a.top, w: b.width, h: b.height }; }, [spec.section, sel]);
    if (r) taps[sel] = { x: r.x * 2, y: r.y * 2, w: r.w * 2, h: r.h * 2 };
  }
  M.shots[spec.key] = { file, w: box.w * 2, h: Math.round(Math.min(box.h, 4000) * 2), url: BASE + spec.url, section: spec.section, taps, at: new Date().toISOString() };
  if (!M.nav) {
    await p.addStyleTag({ content: 'header { visibility: visible !important; }' });
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(500);
    const nb = await p.evaluate(() => { const hd = document.querySelector('header'); const r = hd.getBoundingClientRect(); return { h: r.bottom + 10 }; });
    await p.screenshot({ path: path.join(OUT, 'nav.png'), clip: { x: 0, y: 0, width: box.w, height: nb.h } });
    M.nav = { file: 'nav.png', w: box.w * 2, h: Math.round(nb.h * 2) };
  }
  await p.close();
  console.log('captured', spec.key, M.shots[spec.key].w + '×' + M.shots[spec.key].h, Object.keys(taps).join(', '));
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const M = fs.existsSync(MAN) ? JSON.parse(fs.readFileSync(MAN, 'utf8')) : { shots: {} };
  M.shots = M.shots || {};
  let specs = [];
  const a = process.argv.slice(2).filter((x) => x !== '--fresh');
  if (a[0] === '--page') specs = [{ url: a[1], section: a[2], key: a[3], tap: a[4] }];
  else {
    const S = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', a[0], 'script.json'), 'utf8'));
    specs = ((S.end && S.end.pages) || []).map((pg) => ({ url: pg.url, section: pg.section, key: pg.key, tap: typeof pg.tap === 'string' ? pg.tap : undefined }));
  }
  const fresh = process.argv.includes('--fresh');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ro-RO' });
  for (const s of specs) {
    const old = M.shots[s.key];
    if (!fresh && old && Date.now() - Date.parse(old.at) < 7 * 864e5 && fs.existsSync(path.join(OUT, old.file)) && (!s.tap || (old.taps || {})[s.tap])) { console.log('cached', s.key); continue; }
    if (fresh) delete M.nav;
    await capture(ctx, M, s);
  }
  await b.close();
  fs.writeFileSync(MAN, JSON.stringify(M, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
