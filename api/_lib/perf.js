// Performanța site-ului (Portal → Admin → Performanța site-ului): cât de repede se încarcă paginile site-ului la oamenii
// reali, ce se strică, cum răspunde serverul și cât de grele sunt paginile. Aceeași logică ca adminul Summitlane (praguri
// web.dev, p75 din histograme, bun / mediu / slab, „Ce trebuie reparat” în ordinea impactului, erorile grupate, verificările).
// Doar date reale: ce a măsurat browserul vizitatorului (c360-perf.js -> POST /api/site-perf) și ce măsoară portalul cerând
// adresele importante (la „Verifică serverul acum”, la ceasul din oră în oră, cel mult o dată la 10 minute cât sunt vizitatori).
// Nimic personal: fără id, fără IP, fără cookie; calea fără query, dispozitivul și browserul din user agent, țara de la platformă.
//
// Stocarea (Blob / R2, fără bază de date): un document pe zi, scris cu „doar dacă nu s-a schimbat între timp” (ifMatch), ca
// două vizite deodată să nu se șteargă una pe alta:
//   perf/day/<zi>.json    histogramele zilei (pagină, dispozitiv, țară, cifră), pe ore, vizitele verzi / roșii, greutatea,
//                         fișierele grele, erorile grupate și ultimele 30 de vizite
//   perf/probe/<zi>.json  verificările serverului ale zilei (pe adresă: câte, câte au răspuns, histograma timpului, ultimele)
//   perf/meta.json        ultima verificare automată
// Zilele sunt ale României (Europe/Bucharest). Nu trece prin _lib/store.js: nu e date de portal, nu mișcă revizia (portalul
// nu se reîmprospătează la fiecare vizită pe site).
const crypto = require('crypto');
const { put, get } = require('@vercel/blob');

// ---------- cifrele (pragurile web.dev: bun până la primul număr, slab peste al doilea) ----------
const METRICS = ['lcp', 'inp', 'cls', 'fcp', 'ttfb'];
const T = { lcp: [2500, 4000], inp: [200, 500], cls: [100, 250], fcp: [1800, 3000], ttfb: [800, 1800] }; // cls x 1000
const MS = [25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1400, 1600, 1800, 2000, 2250, 2500, 2750, 3000, 3500, 4000, 4500, 5000, 6000, 7000, 8000, 10000, 12000, 15000, 20000, 30000, 60000];
const CLS = [0, 10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000];
const edges = (m) => (m === 'cls' ? CLS : MS);
function bucket(m, v) { const E = edges(m); for (let i = 0; i < E.length; i++) if (v <= E[i]) return i; return E.length; }
function rateOf(m, v) { return v <= T[m][0] ? 'good' : v <= T[m][1] ? 'ni' : 'poor'; }
function bucketRate(m, b) { const E = edges(m); return rateOf(m, b < E.length ? E[b] : Infinity); }
function quant(m, h, q) {
  const E = edges(m), keys = Object.keys(h || {}).map(Number).sort((a, b) => a - b);
  let N = 0; keys.forEach((k) => { N += h[k]; }); if (!N) return null;
  const want = q * N; let cum = 0;
  for (const b of keys) {
    const c = h[b];
    if (cum + c >= want) {
      if (m === 'cls' && b === 0) return 0;
      const lo = b === 0 ? 0 : E[b - 1], hi = b < E.length ? E[b] : E[E.length - 1] * 1.5;
      return Math.round(lo + (hi - lo) * Math.max(0, Math.min(1, (want - cum) / c)));
    }
    cum += c;
  }
  return E[E.length - 1];
}
function summary(m, h) {
  if (!h) return null;
  let n = 0, good = 0, ni = 0, poor = 0;
  Object.keys(h).forEach((k) => { const c = h[k], r = bucketRate(m, +k); n += c; if (r === 'good') good += c; else if (r === 'ni') ni += c; else poor += c; });
  if (!n) return null;
  const p75 = quant(m, h, 0.75);
  return { n, p75, rate: rateOf(m, p75), good, ni, poor };
}
const addH = (into, h) => { Object.keys(h || {}).forEach((b) => { into[b] = (into[b] || 0) + h[b]; }); return into; };

// ---------- zilele și paginile ----------
const TZ = 'Europe/Bucharest';
const dayF = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const hourF = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' });
const day = (t) => dayF.format(new Date(t));
const hourOf = (t) => Number(hourF.format(new Date(t))) % 24;
const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
function period(key, now) {
  now = now || Date.now();
  const today = day(now), n = key === '30d' ? 30 : key === '7d' ? 7 : 1, since = addDays(today, 1 - n);
  return { key: n === 30 ? '30d' : n === 7 ? '7d' : 'today', since, until: today, today, prev: { since: addDays(since, -n), until: addDays(since, -1) } };
}
// paginile site-ului (și ale site-ului nou din /v2, cât e în previzualizare), după rolul lor în drumul spre programare
const KINDS = ['home', 'service', 'offers', 'booking', 'thanks', 'results', 'city', 'legal', 'other'];
const SERVICES = /^\/(celulita|epilare-laser|grasime-localizata|gusa-barbie-dubla|detox-drenaj|pete-pigmentare|riduri-linii-fine|ten-lipsit-de-stralucire|ten-problematic|tonifiere-musculara|nou-inchis|nou-luminos)$/;
function kindOf(p) {
  p = String(p || '/').toLowerCase().replace(/\.html$/, '').replace(/\/index$/, '/').replace(/^\/v2(?=\/|$)/, '').replace(/(.)\/$/, '$1') || '/';
  if (p === '/') return 'home';
  if (SERVICES.test(p)) return 'service';
  if (p === '/oferte' || p === '/preturi') return 'offers';
  if (p === '/programare' || p === '/avans-programare') return 'booking';
  if (/^\/(multumesc|multumesc-cadou|avans-multumesc)$/.test(p)) return 'thanks';
  if (p === '/rezultate' || p === '/catalog-rezultate' || p === '/echipa') return 'results';
  if (p === '/arad' || p === '/timisoara') return 'city';
  if (/^\/(termeni|politica-de-confidentialitate|cookies)$/.test(p)) return 'legal';
  return 'other';
}
const cut = (s, n, re) => String(s == null ? '' : s).replace(re, '').slice(0, n);
function pathOf(p) { let s = String(p || '').split(/[?#]/)[0]; s = cut(s, 80, /[^\w\-./~%]/g); if (!s || s[0] !== '/') s = '/' + s; return s; }
// ce poate păstra un mesaj de eroare: fără emailuri, fără numere lungi (telefoane) sau id-uri, fără query string
function clean(s, n) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f]+/g, ' ').replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, '<email>')
    .replace(/(https?:\/\/[^\s?#"']+)[?#][^\s"']*/g, '$1').replace(/\b(pi|cus|sub|in|ch|pm|seti|cs)_[A-Za-z0-9]+/g, '$1_…')
    .replace(/\b[0-9a-f]{16,}\b/gi, '…').replace(/\d{5,}/g, '#').replace(/\s+/g, ' ').trim().slice(0, n);
}
const num = (v, max) => { const x = Number(v); return isFinite(x) && x >= 0 && x <= max ? Math.round(x) : null; };

// ---------- documentele: citit cu versiunea, scris doar peste aceeași versiune ----------
async function readDoc(path) {
  const r = await get(path, { access: 'private', useCache: false }).catch((e) => { if (/not.?found/i.test((e && (e.name + e.message)) || '')) return null; throw e; });
  if (!r || r.statusCode !== 200 || !r.stream) return { data: null, etag: '' };
  const chunks = []; for await (const c of r.stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  let data = null; try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { data = null; }
  return { data, etag: String((r.blob && r.blob.etag) || '').replace(/^W\//, '') };
}
// fn(doc) schimbă documentul pe loc; dacă altcineva l-a scris între timp, se citește din nou și se reface (cel mult 8 ori)
async function update(path, empty, fn) {
  for (let i = 0; i < 8; i++) {
    const { data, etag } = await readDoc(path);
    const doc = data || empty();
    fn(doc);
    try {
      await put(path, JSON.stringify(doc), Object.assign({ access: 'private', addRandomSuffix: false, contentType: 'application/json' }, etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }));
      return doc;
    } catch (e) {
      if (!/precondition|etag|already exists|412|409/i.test(String((e && e.message) || e))) throw e;
      await new Promise((r) => setTimeout(r, 15 + Math.random() * 60 * (i + 1)));
    }
  }
  throw new Error('perf: documentul ' + path + ' e scris de prea mulți deodată');
}
const emptyDay = () => ({ h: {}, hh: {}, vw: {}, w: {}, res: {}, e: {}, recent: [] });

// ---------- ce trimite browserul: o vizită (cifre, greutate, fișiere grele) și/sau erorile ei ----------
// b = {page, dev, br, os, country, conn, nav, v: {lcp, inp, cls (x1000), fcp, ttfb}, w: {html, js, css, img, font, media, other, req},
//      top: [{u, t, s, d}], e: [{t: js|promise|res|api, m, s, c}]}
const PARTS = ['html', 'js', 'css', 'img', 'font', 'media', 'other'];
async function ingest(b) {
  const now = Date.now(), d = day(now), hr = hourOf(now), page = pathOf(b.page), kind = kindOf(page);
  const dev = ['m', 't', 'd'].indexOf(b.dev) >= 0 ? b.dev : 'd', country = cut(b.country, 2, /[^A-Za-z]/g).toUpperCase();
  const br = cut(b.br, 16, /[^\w ]/g), os = cut(b.os, 12, /[^\w ]/g), nav = cut(b.nav, 12, /[^\w_-]/g), restored = nav === 'back_forward' || nav === 'restore';
  const got = {};
  if (b.v && typeof b.v === 'object') METRICS.forEach((m) => { const x = num(b.v[m], m === 'cls' ? 50000 : 120000); if (x != null) got[m] = x; });
  const has = Object.keys(got);
  let W = null;
  if (b.w && typeof b.w === 'object' && !restored) { W = PARTS.concat(['req']).map((k) => num(b.w[k], k === 'req' ? 5000 : 500e6) || 0); if (!W.slice(0, 7).some(Boolean)) W = null; }
  const top = restored ? [] : (Array.isArray(b.top) ? b.top : []).slice(0, 6).map((r) => {
    const s = num(r && r.s, 500e6), u = clean(r && r.u, 120), t = PARTS.indexOf(r && r.t) >= 0 ? r.t : 'other';
    return s && u ? [u, t, s, num(r.d, 600000) || 0] : null;
  }).filter(Boolean);
  const errs = (Array.isArray(b.e) ? b.e : []).slice(0, 5).map((e) => {
    const t = ['js', 'promise', 'res', 'api'].indexOf(e && e.t) >= 0 ? e.t : null, m = clean(e && e.m, 180), s = clean(e && e.s, 140);
    return t && m ? { t, m, s, c: Math.min(50, Math.max(1, num(e.c, 1000) || 1)) } : null;
  }).filter(Boolean);
  if (!has.length && !W && !errs.length) return { ok: true, kept: 0 };
  await update('perf/day/' + d + '.json', emptyDay, (doc) => {
    has.forEach((m) => {
      const k = kind + '|' + dev + '|' + country + '|' + m, bk = bucket(m, got[m]);
      (doc.h[k] = doc.h[k] || {})[bk] = (doc.h[k][bk] || 0) + 1;
      const kh = m + '|' + hr; (doc.hh[kh] = doc.hh[kh] || {})[bk] = (doc.hh[kh][bk] || 0) + 1;
    });
    if (has.length) {
      const rates = has.map((m) => rateOf(m, got[m])), k = kind + '|' + dev, z = doc.vw[k] = doc.vw[k] || [0, 0, 0];
      z[0]++; if (rates.every((r) => r === 'good')) z[1]++; if (rates.indexOf('poor') >= 0) z[2]++;
      doc.recent.unshift({ at: now, kind, page, dev, br, os, country, lcp: got.lcp, inp: got.inp, cls: got.cls, fcp: got.fcp, ttfb: got.ttfb, kb: W ? Math.round(W.slice(0, 7).reduce((a, x) => a + x, 0) / 1024) : null });
      doc.recent.length = Math.min(doc.recent.length, 30);
    }
    if (W) { const z = doc.w[kind] = doc.w[kind] || [0, 0, 0, 0, 0, 0, 0, 0, 0]; z[0]++; W.forEach((v, i) => { z[i + 1] += v; }); }
    top.forEach(([u, t, s, ms]) => {
      const k = kind + '|' + u;
      if (!doc.res[k] && Object.keys(doc.res).length >= 300) return; // o zi cu sute de fișiere diferite: se păstrează primele 300
      const z = doc.res[k] = doc.res[k] || [t, 0, 0, 0]; z[1]++; z[2] += s; z[3] += ms;
    });
    errs.forEach((e) => {
      const h = crypto.createHash('sha256').update([e.t, e.m, e.t === 'api' ? '' : e.s].join('|')).digest('hex').slice(0, 20);
      if (!doc.e[h] && Object.keys(doc.e).length >= 300) return;
      const g = doc.e[h] = doc.e[h] || { t: e.t, m: e.m, s: e.s, p: page, b: br, n: 0, first: now, last: now };
      g.n += e.c; g.last = now; g.p = page; g.b = br;
    });
  });
  return { ok: true, kept: has.length + (W ? 1 : 0) + errs.length };
}

// ---------- serverul: adresele importante ----------
const SITE = 'https://www.centrul360.com', ADMIN = 'https://admin.centrul360.com';
const TARGETS = [['home', SITE + '/'], ['service', SITE + '/celulita'], ['booking', SITE + '/programare'], ['offers', SITE + '/api/offers-public'], ['portal', ADMIN + '/']];
async function check(url, net) {
  const t0 = Date.now(), c = new AbortController(), timer = setTimeout(() => c.abort(), 10000);
  try {
    // pe Cloudflare, cererile spre propriile adrese se rezolvă în Worker (cf/self-fetch.js); „x-c360-probe” le trimite pe
    // internet, ca la un vizitator
    const r = await fetch(url, { method: 'GET', redirect: 'manual', signal: c.signal, headers: Object.assign({ 'User-Agent': 'Centrul360Portal/1.0 (perf probe)', 'Cache-Control': 'no-cache' }, net ? { 'x-c360-probe': '1' } : {}) });
    const hdr = Date.now() - t0; let bytes = 0;
    try { bytes = (await r.arrayBuffer()).byteLength; } catch (e) { /* */ }
    return { code: r.status, ms: Date.now() - t0, hdr, bytes };
  } catch (e) { return { code: 0, ms: Date.now() - t0, hdr: 0, bytes: 0 }; }
  finally { clearTimeout(timer); }
}
const up = (code) => code >= 200 && code < 400;
// how = "now" (butonul) | "cron" (ceasul din oră în oră) | "auto" (cât sunt vizitatori)
async function probe(how, list) {
  list = list || TARGETS;
  const now = Date.now();
  let r = await Promise.all(list.map(async ([tg, url]) => Object.assign({ tg, url }, await check(url, true))));
  // dacă internetul nu ajunge deloc la propriile adrese (Workerul nu se poate cere pe sine), verificarea se face prin Worker:
  // timpul e atunci doar al serverului; niciodată o cădere falsă
  if (r.every((x) => x.code === 0)) {
    const inner = await Promise.all(list.map(async ([tg, url]) => Object.assign({ tg, url, inner: true }, await check(url, false))));
    if (inner.some((x) => x.code !== 0)) r = inner;
    else if (how !== 'now') return { at: now, r, skipped: true };
  }
  await update('perf/probe/' + day(now) + '.json', () => ({ p: {}, recent: [] }), (doc) => {
    r.forEach((x) => {
      const z = doc.p[x.tg] = doc.p[x.tg] || { n: 0, up: 0, ms: 0, h: {} };
      z.n++; z.ms += x.ms; if (up(x.code)) { z.up++; const b = bucket('ttfb', x.ms); z.h[b] = (z.h[b] || 0) + 1; }
      doc.recent.push([now, x.tg, x.code, x.ms, how + (x.inner ? '-intern' : '')]);
    });
    if (doc.recent.length > 600) doc.recent.splice(0, doc.recent.length - 600);
  });
  await put('perf/meta.json', JSON.stringify({ probeAt: now }), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' }).catch(() => 0);
  return { at: now, r };
}
// cât sunt vizitatori: cel mult o verificare la `gapMs` (fără tranzacții: în cel mai rău caz două deodată, nu mai multe)
async function probeIfDue(gapMs) {
  const m = (await readDoc('perf/meta.json').catch(() => ({ data: null }))).data;
  if (m && m.probeAt && Date.now() - m.probeAt < gapMs) return null;
  await put('perf/meta.json', JSON.stringify({ probeAt: Date.now() }), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' }).catch(() => 0);
  return probe('auto');
}

// ---------- raportul pentru ecran ----------
async function report(o) {
  const now = Date.now(), days = [], pdays = [];
  for (let d = o.since; d <= o.until; d = addDays(d, 1)) days.push(d);
  for (let d = o.prev.since; d <= o.prev.until; d = addDays(d, 1)) pdays.push(d);
  const pDays = days.indexOf(addDays(o.today, -1)) >= 0 ? days : days.concat([addDays(o.today, -1)]);
  const [cur, prv, pr, meta] = await Promise.all([
    Promise.all(days.map((d) => readDoc('perf/day/' + d + '.json').then((x) => x.data || emptyDay()))),
    Promise.all(pdays.map((d) => readDoc('perf/day/' + d + '.json').then((x) => x.data || emptyDay()))),
    Promise.all(pDays.map((d) => readDoc('perf/probe/' + d + '.json').then((x) => ({ d, doc: x.data || { p: {}, recent: [] } })))),
    readDoc('perf/meta.json').then((x) => x.data).catch(() => null)
  ]);
  const H = {}, V = {}, Wt = {}, RES = {}, E = {}, byDay = {};
  const add = (key, m, h) => { const x = H[key] = H[key] || {}; x[m] = addH(x[m] || {}, h); };
  const vadd = (key, z) => { const x = V[key] = V[key] || { n: 0, good: 0, poor: 0 }; x.n += z[0]; x.good += z[1]; x.poor += z[2]; };
  cur.forEach((doc, i) => {
    Object.keys(doc.h).forEach((k) => {
      const [kind, dev, c, m] = k.split('|'), h = doc.h[k];
      add('all', m, h); add('kind:' + kind, m, h); add('dev:' + dev, m, h); add('kd:' + kind + ':' + dev, m, h); if (c) add('c:' + c, m, h);
      const y = byDay[days[i]] = byDay[days[i]] || {}; y[m] = addH(y[m] || {}, h);
    });
    Object.keys(doc.vw).forEach((k) => { const [kind, dev] = k.split('|'); vadd('all', doc.vw[k]); vadd('kind:' + kind, doc.vw[k]); vadd('dev:' + dev, doc.vw[k]); });
    Object.keys(doc.w).forEach((k) => { const x = Wt[k] = Wt[k] || [0, 0, 0, 0, 0, 0, 0, 0, 0]; doc.w[k].forEach((v, j) => { x[j] += v; }); });
    Object.keys(doc.res).forEach((k) => { const z = doc.res[k], x = RES[k] = RES[k] || [z[0], 0, 0, 0]; x[1] += z[1]; x[2] += z[2]; x[3] += z[3]; });
    Object.keys(doc.e).forEach((k) => { const g = doc.e[k], x = E[k]; if (!x) E[k] = Object.assign({}, g); else { x.n += g.n; x.first = Math.min(x.first, g.first); if (g.last >= x.last) { x.last = g.last; x.p = g.p; x.b = g.b; } } });
  });
  const P = {}, pv = { n: 0, good: 0, poor: 0 }, ep = {};
  prv.forEach((doc) => {
    Object.keys(doc.h).forEach((k) => { const m = k.split('|')[3]; P[m] = addH(P[m] || {}, doc.h[k]); });
    Object.keys(doc.vw).forEach((k) => { const z = doc.vw[k]; pv.n += z[0]; pv.good += z[1]; pv.poor += z[2]; });
    Object.keys(doc.e).forEach((k) => { const g = doc.e[k]; ep[g.t] = (ep[g.t] || 0) + g.n; });
  });
  const sumAll = (key) => { const out = {}; METRICS.forEach((m) => { out[m] = summary(m, H[key] && H[key][m]); }); return out; };
  const vitals = sumAll('all'), prev = {}; METRICS.forEach((m) => { const s = summary(m, P[m]); prev[m] = s ? s.p75 : null; });
  const kinds = KINDS.map((k) => ({ kind: k, m: sumAll('kind:' + k), v: V['kind:' + k] || { n: 0, good: 0, poor: 0 } })).filter((x) => x.v.n);
  const devs = ['m', 't', 'd'].map((d) => ({ dev: d, m: sumAll('dev:' + d), v: V['dev:' + d] || { n: 0, good: 0, poor: 0 } })).filter((x) => x.v.n);
  const countries = Object.keys(H).filter((k) => k.indexOf('c:') === 0).map((k) => { const m = sumAll(k); return { country: k.slice(2), m, n: Math.max.apply(null, METRICS.map((x) => (m[x] ? m[x].n : 0))) }; })
    .sort((p, q) => q.n - p.n).slice(0, 12);
  let trend;
  if (o.since === o.until) {
    const lastH = o.until === day(now) ? hourOf(now) : 23, hours = []; for (let h = 0; h <= lastH; h++) hours.push(h);
    trend = { by: 'hour', x: hours.map((h) => o.since + 'T' + String(h).padStart(2, '0')), m: {} };
    METRICS.forEach((m) => { trend.m[m] = hours.map((h) => { const s = summary(m, cur[0].hh[m + '|' + h]); return s ? s.p75 : null; }); });
  } else {
    trend = { by: 'day', x: days, m: {} };
    METRICS.forEach((m) => { trend.m[m] = days.map((d) => { const s = summary(m, byDay[d] && byDay[d][m]); return s ? s.p75 : null; }); });
  }
  const groups = Object.keys(E).map((h) => { const g = E[h]; return { h, type: g.t, msg: g.m, src: g.s, page: g.p, br: g.b, n: g.n, first: g.first, last: g.last }; })
    .sort((p, q) => q.n - p.n || q.last - p.last).slice(0, 40);
  const tot = {}; Object.keys(E).forEach((h) => { const g = E[h], x = tot[g.t] = tot[g.t] || { n: 0, g: 0 }; x.n += g.n; x.g++; });
  // serverul
  const PR = {}, recent = [];
  pr.forEach(({ d, doc }) => {
    if (days.indexOf(d) >= 0) Object.keys(doc.p).forEach((k) => { const z = doc.p[k], x = PR[k] = PR[k] || { n: 0, up: 0, ms: 0, h: {} }; x.n += z.n; x.up += z.up; x.ms += z.ms; addH(x.h, z.h); });
    (doc.recent || []).forEach((r) => { if (r[0] > now - 48 * 3600e3) recent.push(r); });
  });
  recent.sort((a, b) => a[0] - b[0]);
  const list = TARGETS.map(([k, u]) => ({ target: k, path: u })).concat(Object.keys(PR).filter((k) => !TARGETS.some((t) => t[0] === k)).map((k) => ({ target: k, path: '' })));
  const servers = list.map(({ target, path }) => {
    const mine = recent.filter((r) => r[1] === target), last = mine[mine.length - 1], z = PR[target];
    return { target, path, last: last ? { code: last[2], ms: last[3], at: last[0], up: up(last[2]), how: last[4] } : null,
      n: z ? z.n : 0, up: z ? z.up : 0, avg: z && z.n ? Math.round(z.ms / z.n) : null, p50: z ? quant('ttfb', z.h, 0.5) : null, p95: z ? quant('ttfb', z.h, 0.95) : null,
      spark: mine.map((r) => [r[0], up(r[2]) ? r[3] : null]) };
  });
  const weight = Object.keys(Wt).map((kind) => {
    const z = Wt[kind], n = z[0], parts = {}; PARTS.forEach((p, i) => { parts[p] = Math.round(z[i + 1] / n); });
    return { kind, n, req: Math.round(z[8] / n), avg: PARTS.reduce((a, p) => a + parts[p], 0), parts };
  }).sort((p, q) => q.avg - p.avg);
  const heavy = Object.keys(RES).map((k) => { const z = RES[k]; return { kind: k.split('|')[0], url: k.slice(k.indexOf('|') + 1), type: z[0], n: z[1], avg: Math.round(z[2] / z[1]), ms: Math.round(z[3] / z[1]) }; })
    .sort((p, q) => q.avg - p.avg).slice(0, 12);
  const stream = (cur[cur.length - 1].recent || []).slice(0, 25);
  const out = {
    since: o.since, until: o.until, thresholds: T,
    views: V.all || { n: 0, good: 0, poor: 0 }, prev_views: pv.n ? pv : null,
    vitals, prev, kinds, devs, countries, trend,
    errors: { groups, tot, prev: ep },
    servers: { last: meta && meta.probeAt ? meta.probeAt : null, list: servers },
    weight, heavy, stream
  };
  out.fix = fixes(out, H);
  return out;
}

// „Ce trebuie reparat”: tot ce e roșu sau galben, în ordinea vizitelor atinse și a locului (programarea, întâi)
const KW = { booking: 3, service: 2.5, offers: 2.5, home: 2, city: 2, results: 1.5, thanks: 1.5, legal: 0.5, other: 0.5 };
function fixes(r, H) {
  const L = [];
  r.servers.list.forEach((x) => {
    if (x.last && !x.last.up) L.push({ kind: 'down', sev: 3, score: 1e9, target: x.target, path: x.path, code: x.last.code, at: x.last.at });
    else if (x.n && x.up / x.n < 0.995) L.push({ kind: 'uptime', sev: 2, score: 1e7 * (1 - x.up / x.n), target: x.target, path: x.path, up: x.up / x.n, n: x.n });
    else if (x.p95 != null && x.p95 > 1500) L.push({ kind: 'slowsrv', sev: 1, score: x.p95, target: x.target, path: x.path, p95: x.p95 });
  });
  Object.keys(H).filter((k) => k.indexOf('kd:') === 0).forEach((k) => {
    const [, kind, dev] = k.split(':');
    ['lcp', 'inp', 'cls', 'ttfb'].forEach((m) => {
      const s = summary(m, H[k][m]); if (!s || s.rate === 'good') return;
      const bad = s.poor + s.ni * 0.4;
      L.push({ kind: 'vital', sev: s.rate === 'poor' ? 2 : 1, score: bad * (KW[kind] || 1) * (s.rate === 'poor' ? 3 : 1) * (s.n < 5 ? 0.4 : 1), page: kind, dev, metric: m, p75: s.p75, n: s.n, slow: (s.poor + s.ni) / s.n, few: s.n < 5 });
    });
  });
  (r.errors.groups || []).forEach((e) => {
    const k = kindOf(e.page);
    L.push({ kind: 'error', sev: e.type === 'api' || k === 'booking' ? 2 : 1, score: e.n * (KW[k] || 1) * (e.type === 'api' ? 4 : 2), type: e.type, msg: e.msg, page: e.page, n: e.n, last: e.last });
  });
  r.weight.forEach((w) => { if (w.avg > 3 * 1048576) L.push({ kind: 'weight', sev: w.avg > 6 * 1048576 ? 2 : 1, score: w.n * (KW[w.kind] || 1) * (w.avg / 1048576) * 0.3, page: w.kind, avg: w.avg, n: w.n, parts: w.parts }); });
  return L.sort((p, q) => q.score - p.score).slice(0, 10);
}

module.exports = { ingest, probe, probeIfDue, report, period, kindOf, bucket, quant, summary, rateOf, clean, day, METRICS, T, KINDS, TARGETS };
