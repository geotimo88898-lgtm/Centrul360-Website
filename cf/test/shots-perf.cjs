// Capturi ale ecranului Portal → Performanța site-ului pe telefon (390x844) și calculator (1440x900), cu date de probă LOCALE
// (Blob simulat, vizite trecute prin aceleași funcții ca datele reale): NODE_PATH=/opt/node-tools/node_modules node cf/test/shots-perf.cjs <dosar>
// Portalul adevărat (portal.html și modulele lui) e servit ca https://admin.centrul360.com/ prin rutele Playwright, cu un
// cont de admin de test; restul /api/ răspunde gol. Verifică: fără erori din ecranul ăsta, fără derulare laterală, fără liniuțe lungi.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const { call, API } = require('./perf-mock.cjs');
const ROOT = path.join(__dirname, '..', '..'), out = process.argv[2] || '/tmp/shots-c360';
fs.mkdirSync(out, { recursive: true });
const portal = require(API + '/portal-perf'), perf = require(API + '/_lib/perf');
const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', json: 'application/json', woff2: 'font/woff2' };
const DATA = { v: 't1', isAdmin: true, me: { id: 'test', name: 'Admin Test', role: 'admin', location: '-', prefs: { startPage: 'performanta' } }, admin: { pendingSales: [], pendingTime: 0, pendingLeave: 0, employees: [] },
  employees: [], clients: [], sales: [], appointments: [], leads: [], offers: [], services: [], products: [] };

async function seed() {
  let s = 5; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, pick = (a) => a[Math.floor(rnd() * a.length)];
  const now = Date.now(), hr = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hourCycle: 'h23' }).format(new Date())), span = Math.max(1, hr) * 3600e3, real = Date.now;
  const pages = ['/', '/', '/', '/celulita', '/celulita', '/epilare-laser', '/grasime-localizata', '/programare', '/programare', '/oferte', '/timisoara', '/arad', '/rezultate', '/multumesc', '/v2/celulita'];
  for (let i = 0; i < 130; i++) {
    Date.now = () => now - Math.floor(rnd() * span);
    const page = pick(pages), dev = pick(['m', 'm', 'm', 'm', 'd', 't']), heavy = page === '/' && dev === 'm';
    const lcp = Math.round((dev === 'm' ? 1800 : 1100) + rnd() * (heavy ? 3400 : 1700));
    await perf.ingest({ page, dev, br: pick(dev === 'd' ? ['Chrome', 'Edge', 'Safari'] : ['Safari', 'Chrome', 'Facebook', 'Instagram']), os: dev === 'd' ? 'Windows' : 'iOS', country: pick(['RO', 'RO', 'RO', 'RO', 'IT', 'DE']), conn: '4g', nav: 'navigate',
      v: { lcp, fcp: Math.round(lcp * 0.55), ttfb: Math.round(120 + rnd() * 600), cls: rnd() < 0.12 ? 170 : Math.round(rnd() * 30), inp: Math.round(60 + rnd() * (dev === 'm' ? 250 : 120)) },
      w: { html: 48000, js: 210000, css: 60000, img: heavy ? 2600000 : 500000 + Math.round(rnd() * 500000), font: 90000, media: page === '/' ? 1400000 : 0, other: 4000, req: 26 },
      top: [{ u: heavy ? '/brand_asset/video-prezentare.mp4' : '/brand_asset/hero.webp', t: heavy ? 'media' : 'img', s: heavy ? 1400000 : 380000, d: 900 }, { u: '/tailwind-built.css', t: 'css', s: 60000, d: 200 }, { u: '/c360.js', t: 'js', s: 90000, d: 180 }] });
  }
  Date.now = () => now - 2 * 3600e3;
  for (let i = 0; i < 3; i++) await perf.ingest({ page: '/programare', br: 'Safari', e: [{ t: 'js', m: "TypeError: undefined is not an object (evaluating 'slot.start')", s: '/c360-book.js:214:19', c: 1 }] });
  await perf.ingest({ page: '/programare', br: 'Chrome', e: [{ t: 'api', m: 'POST /api/booking 502', s: 'browser', c: 1 }] });
  Date.now = real;
  global.fetch = async (u) => { await new Promise((r) => setTimeout(r, /api/.test(u) ? 6 : 14)); return { status: 200, arrayBuffer: async () => new ArrayBuffer(50000) }; };
  for (let i = 0; i < 5; i++) { Date.now = () => now - (5 - i) * 50 * 60e3; await perf.probe('cron'); }
  Date.now = real;
}

(async () => {
  const errs = [], browser = await chromium.launch();
  async function shoot(tag) {
    for (const [w, h, d] of [[390, 844, 'tel'], [1440, 900, 'pc']]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: d === 'tel', hasTouch: d === 'tel', locale: 'ro-RO', timezoneId: 'Europe/Bucharest', reducedMotion: 'reduce' });
      await ctx.route('https://admin.centrul360.com/**', async (route) => {
        const u = new URL(route.request().url());
        if (u.pathname === '/api/portal-data') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DATA) });
        if (u.pathname === '/api/portal-pulse') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ rev: 1, build: 'test' }) });
        if (u.pathname === '/api/portal-perf') { const x = await call(portal, { method: route.request().method(), query: Object.fromEntries(u.searchParams), body: route.request().postDataJSON ? (() => { try { return route.request().postDataJSON(); } catch (e) { return null; } })() : null }); return route.fulfill({ status: x.status, contentType: 'application/json', body: JSON.stringify(x.body) }); }
        if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        let f = path.join(ROOT, u.pathname === '/' ? 'portal.html' : u.pathname.slice(1));
        if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
        if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
        return route.fulfill({ status: 200, contentType: TYPES[path.extname(f).slice(1)] || 'application/octet-stream', body: fs.readFileSync(f) });
      });
      await ctx.route(/fonts\.(googleapis|gstatic)\.com|supabase|facebook/, (route) => route.fulfill({ status: 204, body: '' }));
      const p = await ctx.newPage();
      p.on('pageerror', (e) => { if (/portal-perf/.test(e.stack || '')) errs.push(d + ' ' + e.message); });
      await p.goto('https://admin.centrul360.com/#performanta');
      await p.waitForSelector('#panel-performanta .pf-tiles', { timeout: 20000 });
      await p.waitForTimeout(1500);
      await p.evaluate(() => { document.querySelectorAll('.c360-intro,.gm-intro,.k-cover').forEach((x) => x.remove()); });
      await p.screenshot({ path: out + '/' + d + '-perf' + tag + '.png' });
      await p.screenshot({ path: out + '/' + d + '-perf' + tag + '-tot.png', fullPage: true });
      const bad = await p.evaluate(() => { const r = [], pn = document.getElementById('panel-performanta'); if (document.documentElement.scrollWidth > innerWidth + 1) r.push('derulare laterală ' + document.documentElement.scrollWidth); const m = pn.innerText.match(/.{0,30}[–—].{0,30}/); if (m) r.push('liniuță lungă: ' + m[0]); if (!document.querySelector('#tabsNav [data-tab="performanta"]:not(.hidden)')) r.push('butonul din meniu lipsește'); return r; });
      bad.forEach((x) => errs.push(d + tag + ': ' + x));
      await ctx.close();
    }
  }
  await shoot('-gol'); await seed(); await shoot('');
  await browser.close();
  console.log(errs.length ? 'PROBLEME:\n' + errs.join('\n') : 'fără probleme', '\ncapturi în', out);
  process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
