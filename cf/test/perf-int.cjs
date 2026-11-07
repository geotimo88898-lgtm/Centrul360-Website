// node cf/test/perf-int.cjs: /api/site-perf (ce trimite browserul), /api/portal-perf (raportul, verificarea) și
// api/_lib/perf.js pe Blob simulat în memorie. Fără rețea. Verifică: roboții și gunoiul nu intră, p75 exact pe praguri,
// vizitele bune / slabe, erorile grupate și curățate (fără email, fără telefon), greutatea, verificările serverului
// (disponibilitate, p50 / p95, căderea prima), vizitele deodată fără pierderi, limita pe minut, doar adminul vede.
const assert = require('assert');
const { store, call, setAdmin, API } = require('./perf-mock.cjs');
const site = require(API + '/site-perf'), portal = require(API + '/portal-perf'), perf = require(API + '/_lib/perf');
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
let ipN = 0;
const post = (b, h = {}) => call(site, { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b), headers: Object.assign({ 'user-agent': IPHONE, 'cf-ipcountry': 'ro', 'cf-connecting-ip': '10.0.0.' + (++ipN) }, h) });
const dayDoc = () => JSON.parse(store.get('perf/day/' + perf.day(Date.now()) + '.json').body);
const rep = async (p = 'today') => (await call(portal, { query: { period: p } })).body;
let asked = [];
global.fetch = async (u) => { asked.push(u); return { status: 200, arrayBuffer: async () => new ArrayBuffer(10) }; };

(async () => {
  // roboții, fără user agent, gunoi: nimic scris
  await post({ p: '/', v: { lcp: 1000 } }, { 'user-agent': 'Googlebot/2.1' });
  await post({ p: '/', v: { lcp: 1000 } }, { 'user-agent': '' });
  await post('nu e json'); await post({ v: { lcp: 1000 } });
  await post({ p: '/', v: { lcp: -5, inp: 'x', cls: 1e9, ttfb: 200000 } });
  assert.ok(![...store.keys()].some((k) => k.startsWith('perf/day/')), 'nimic scris pentru roboți și gunoi');
  // 8 vizite pe programare, de pe iPhone: LCP 1000..4500 (4 bune, 2 medii, 2 slabe), una cu CLS slab
  const L = [1000, 1500, 2000, 2500, 2600, 3000, 4100, 4500];
  for (let i = 0; i < L.length; i++) await post({ p: '/programare?utm_source=fb&tel=1234567890', n: 'navigate', c: '4g', v: { lcp: L[i], fcp: 900, ttfb: 300, cls: i === 0 ? 300 : 0, inp: 120 },
    w: { html: 20000, js: 300000, css: 40000, img: 900000, font: 80000, media: 0, other: 0, req: 30 }, r: [{ u: '/brand_asset/hero.webp', t: 'img', s: 600000, d: 800 }, { u: '/c360.js', t: 'js', s: 250000, d: 300 }] });
  const doc = dayDoc();
  assert.equal(doc.recent.length, 8); assert.equal(doc.recent[0].page, '/programare'); assert.equal(doc.recent[0].kind, 'booking'); assert.equal(doc.recent[0].country, 'RO');
  assert.ok(!JSON.stringify([...store.values()]).match(/utm|1234567890|10\.0\.0/), 'fără query, fără telefon, fără IP');
  setAdmin(false); assert.equal((await call(portal)).status, 401, 'doar adminul'); setAdmin(true);
  let r = await rep();
  assert.equal(r.views.n, 8); assert.equal(r.views.poor, 3); assert.equal(r.views.good, 3);
  assert.equal(r.vitals.lcp.good, 4); assert.equal(r.vitals.lcp.ni, 2); assert.equal(r.vitals.lcp.poor, 2);
  assert.ok(r.vitals.lcp.p75 > 2750 && r.vitals.lcp.p75 <= 3000, 'p75: ' + r.vitals.lcp.p75);
  assert.equal(r.vitals.cls.p75, 0); assert.equal(r.vitals.cls.poor, 1);
  assert.equal(r.kinds[0].kind, 'booking'); assert.equal(r.devs[0].dev, 'm'); assert.equal(r.countries[0].country, 'RO');
  assert.equal(r.trend.by, 'hour'); assert.ok(r.trend.m.lcp.some((x) => x > 2750 && x <= 3000), 'p75 pe ore');
  assert.equal(r.weight[0].avg, 1340000); assert.equal(r.heavy[0].url, '/brand_asset/hero.webp');
  // site-ul nou din /v2 e numărat pe același rol
  assert.equal(perf.kindOf('/v2/celulita'), 'service'); assert.equal(perf.kindOf('/celulita.html'), 'service'); assert.equal(perf.kindOf('/multumesc'), 'thanks');
  // erorile
  for (let i = 0; i < 3; i++) await post({ p: '/programare', e: [{ t: 'js', m: 'TypeError: x is undefined', s: '/c360-book.js:12:4', c: 1 }] });
  await post({ p: '/programare', e: [{ t: 'api', m: 'POST /api/booking 502 pentru ana@example.com 1234567890', s: 'browser', c: 2 }] });
  r = await rep();
  assert.equal(r.errors.groups.length, 2); assert.equal(r.errors.groups[0].n, 3);
  assert.ok(!/@|1234567890/.test(r.errors.groups.find((e) => e.type === 'api').msg), 'curățat');
  assert.equal(r.errors.tot.js.n, 3); assert.equal(r.errors.tot.api.n, 2);
  // 20 de vizite deodată pe același document: niciuna pierdută (scriere doar peste aceeași versiune)
  await Promise.all(Array.from({ length: 20 }, () => post({ p: '/', v: { lcp: 900 } })));
  assert.equal((await rep()).views.n, 28, '8 + 20, nimic pierdut');
  // limita pe minut
  for (let i = 0; i < 25; i++) await post({ p: '/', v: { lcp: 900 } }, { 'cf-connecting-ip': '9.9.9.9' });
  assert.equal((await rep()).views.n, 48, 'cel mult 20 pe minut de la aceeași adresă');
  // serverul: vizitele de mai sus au pornit o verificare automată (o dată); acum butonul, cu programarea căzută
  assert.equal(asked.length, perf.TARGETS.length, 'o singură verificare automată, oricâte vizite: ' + asked.length);
  global.fetch = async (u) => ({ status: /programare/.test(u) ? 503 : 200, arrayBuffer: async () => new ArrayBuffer(10) });
  const pr = await call(portal, { method: 'POST', body: { action: 'probe' } });
  assert.equal(pr.status, 200); assert.equal(pr.body.r.length, 5);
  r = await rep();
  const b = r.servers.list.find((x) => x.target === 'booking');
  assert.equal(b.n, 2); assert.equal(b.up, 1); assert.equal(b.last.code, 503); assert.ok(r.servers.list[0].p50 != null);
  assert.equal(r.fix[0].kind, 'down'); assert.equal(r.fix[0].target, 'booking');
  assert.ok(r.fix.some((f) => f.kind === 'vital' && f.metric === 'lcp' && f.page === 'booking'));
  // internetul nu ajunge la propriile adrese, prin Worker da: se verifică prin Worker, nu apare o cădere falsă
  global.fetch = async (u, o) => { if (o.headers['x-c360-probe']) throw new Error('no route'); return { status: 200, arrayBuffer: async () => new ArrayBuffer(1) }; };
  const inner = await perf.probe('cron');
  assert.ok(inner.r.every((x) => x.inner && x.code === 200), 'verificat prin Worker');
  // nimic nu răspunde deloc la verificarea automată: nu se scrie
  global.fetch = async () => { throw new Error('jos'); };
  const sk = await perf.probe('auto'); assert.ok(sk.skipped);
  // cronul din oră în oră are pasul „perf”
  assert.ok(/\['perf'/.test(require('fs').readFileSync(API + '/automation-tick.js', 'utf8')));
  // 7 zile: perioada de dinainte și graficul pe zile
  const w = await rep('7d'); assert.equal(w.trend.by, 'day'); assert.equal(w.trend.x.length, 7); assert.equal(w.views.n, 48);
  console.log('perf-int: toate verificările au trecut');
})().catch((e) => { console.error(e); process.exit(1); });
