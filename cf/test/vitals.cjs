// Măsurarea vitezei (c360-perf.js) într-un Chromium real, cap-coadă: NODE_PATH=/opt/node-tools/node_modules node cf/test/vitals.cjs
// O pagină de test servită ca https://www.centrul360.com/ (rutele Playwright, nimic nu iese de pe calculator), cu o poză mare,
// o deplasare târzie, un buton lent, o eroare JS, o promisiune respinsă, o poză lipsă și /api/offers-public care răspunde 502.
// Semnalele trec prin adevăratul api/site-perf.js în Blob simulat, iar raportul din portal trebuie să arate ce a măsurat
// browserul. La final, o pagină reală a site-ului (celulita.html) cu rândul <script src="/c360-perf.js" defer> trimite și ea.
const assert = require('assert'), path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const { call, API } = require('./perf-mock.cjs');
const ROOT = path.join(__dirname, '..', '..');
const site = require(API + '/site-perf'), portal = require(API + '/portal-perf');
global.fetch = async () => ({ status: 200, arrayBuffer: async () => new ArrayBuffer(1) });

const PAGE = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>t</title>
<style>body{margin:0;font:16px system-ui} img.hero{display:block;width:100%;height:420px;object-fit:cover} button{font-size:20px;padding:20px;margin:20px}</style></head>
<body><div id="top"></div><h1>Pagina de test</h1><img class="hero" src="/brand_asset/hero.svg" alt=""><p>Text</p><img src="/lipsa.webp" alt="">
<button id="slow">Buton lent</button><button id="api">Cheamă API</button>
<script>
setTimeout(function () { var d = document.createElement("div"); d.style.height = "180px"; d.textContent = "banner târziu"; document.getElementById("top").appendChild(d); }, 400);
document.getElementById("slow").addEventListener("click", function () { var t = performance.now(); while (performance.now() - t < 260) {} document.body.style.background = "#eee"; });
document.getElementById("api").addEventListener("click", function () { fetch("/api/offers-public?x=1").then(function () {}); });
setTimeout(function () { throw new TypeError("boom is not a function"); }, 200);
setTimeout(function () { Promise.reject(new Error("programarea a eșuat pentru ana@example.com")); }, 250);
</script><script src="/c360-perf.js" defer></script></body></html>`;
const HERO = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#c2410c"/><circle cx="600" cy="400" r="300" fill="#fff"/><!--' + 'x'.repeat(900000) + '--></svg>');
const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', woff2: 'font/woff2' };

(async () => {
  const b = await chromium.launch(), posts = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
  let real = false;
  await ctx.route('https://www.centrul360.com/**', async (route) => {
    const r = route.request(), u = new URL(r.url());
    if (u.pathname === '/' && !real) return route.fulfill({ status: 200, contentType: 'text/html', body: PAGE });
    if (u.pathname === '/brand_asset/hero.svg') { await new Promise((x) => setTimeout(x, 350)); return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: HERO }); }
    if (u.pathname === '/api/offers-public' && !real) return route.fulfill({ status: 502, contentType: 'application/json', body: '{}' });
    if (u.pathname === '/api/site-perf') {
      const body = r.postData(); posts.push({ real, body: JSON.parse(body) });
      const x = await call(site, { method: 'POST', body, headers: { 'user-agent': r.headers()['user-agent'], 'cf-ipcountry': 'RO', 'cf-connecting-ip': '1.2.3.4' } });
      return route.fulfill({ status: x.status, body: '' });
    }
    if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    let f = path.join(ROOT, u.pathname === '/' ? 'index.html' : u.pathname.slice(1));
    if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: 'nf' });
    let body = fs.readFileSync(f);
    // pagina reală, cu rândul pe care îl pune sesiunea site-ului
    if (f.endsWith('.html')) body = String(body).replace('</body>', '<script src="/c360-perf.js" defer></script></body>');
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(f).slice(1)] || 'application/octet-stream', body });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|connect\.facebook\.net|googletagmanager|google-analytics/, (route) => route.fulfill({ status: 204, body: '' }));
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('https://www.centrul360.com/?utm_source=facebook&fbclid=abc', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.click('#slow'); await p.waitForTimeout(300);
  await p.click('#api'); await p.waitForTimeout(3800);
  const hide = (pg) => pg.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange', { bubbles: true })); });
  await hide(p); await p.waitForTimeout(600); await hide(p); await p.waitForTimeout(600);
  real = true;
  const p2 = await ctx.newPage(); await p2.goto('https://www.centrul360.com/celulita', { waitUntil: 'load' }); await p2.waitForTimeout(1500);
  await hide(p2); await p2.waitForTimeout(800);
  await b.close();

  const test = posts.filter((x) => !x.real), vit = test.filter((x) => x.body.v), errOnly = test.filter((x) => !x.body.v && x.body.e);
  console.log('semnale:', posts.length, JSON.stringify(test.map((x) => x.body)).slice(0, 1400));
  assert.equal(vit.length, 1, 'o dată pe vizită');
  const v = vit[0].body.v;
  assert.ok(v.ttfb >= 0 && v.fcp > 0 && v.lcp >= v.fcp, JSON.stringify(v));
  assert.ok(v.lcp >= 300, 'LCP ' + v.lcp); assert.ok(v.cls > 0, 'CLS ' + v.cls); assert.ok(v.inp >= 200, 'INP ' + v.inp);
  assert.equal(vit[0].body.p, '/');
  assert.ok(!JSON.stringify(posts).match(/fbclid|utm_source|ana@example/), 'fără query, fără email');
  assert.ok(vit[0].body.w.img >= 900000); assert.equal(vit[0].body.r[0].u, '/brand_asset/hero.svg');
  const allE = test.flatMap((x) => x.body.e || []);
  assert.ok(allE.some((e) => e.t === 'js' && /boom/.test(e.m)), 'eroarea JS');
  assert.ok(allE.some((e) => e.t === 'promise'), 'promisiunea respinsă');
  assert.equal(allE.filter((e) => e.t === 'res' && /lipsa\.webp/.test(e.m)).reduce((n, e) => n + e.c, 0), 1, 'poza lipsă, o dată');
  assert.ok(allE.some((e) => e.t === 'api' && /GET \/api\/offers-public 502/.test(e.m)), 'apelul API eșuat');
  assert.ok(errOnly.length >= 1, 'erorile pleacă și singure');
  const realV = posts.filter((x) => x.real && x.body.v);
  assert.equal(realV.length, 1, 'pagina reală trimite semnalul'); assert.equal(realV[0].body.p, '/celulita');
  const r = (await call(portal, { query: { period: 'today' } })).body;
  assert.equal(r.views.n, 2); assert.ok(r.stream.some((x) => x.lcp === v.lcp && x.dev === 'm' && x.br === 'Chrome' && x.country === 'RO'));
  assert.ok(r.kinds.some((k) => k.kind === 'service'), 'pagina tratamentului e la „Pe pagini”');
  assert.ok(r.errors.groups.length >= 4); assert.ok(!r.errors.groups.some((e) => /@/.test(e.msg)));
  console.log('erorile paginilor (așteptate):', errs.join(' | '));
  console.log('vitals: toate verificările au trecut', JSON.stringify(v));
})().catch((e) => { console.error(e); process.exit(1); });
