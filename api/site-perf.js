// POST /api/site-perf {p, n?, c?, v?, w?, r?, e?}: cât de repede s-a încărcat pagina pentru vizitatorul ăsta, cât a cântărit și
// ce s-a stricat (c360-perf.js o măsoară în browser și o trimite o dată, când pagina se ascunde; erorile și la câteva secunde
// după ce apar). Pentru Portal → Admin → Performanța site-ului (_lib/perf.js).
// Nimic personal: fără cookie, fără id, IP-ul nu se păstrează (doar un minut în memorie, pentru limită); dispozitivul și
// browserul vin din user agent, țara de la platformă. Roboții nu se numără. Răspunde mereu 204.
// Cât sunt vizitatori, verifică și adresele importante, cel mult o dată la 10 minute (după răspuns).
const perf = require('./_lib/perf');

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|meta-externalagent|preview|headless|lighthouse|pingdom|monitor|curl|wget|python|node-fetch|undici|axios|go-http|java\/|okhttp|scrapy|httpclient|pagespeed|gtmetrix/i;
const HITS = new Map(); // ip -> [câte, începutul minutului]; doar în instanța asta
const MAX = 20;
function limited(ip) {
  const now = Date.now(), h = HITS.get(ip);
  if (HITS.size > 5000) HITS.forEach((v, k) => { if (now - v[1] > 60000) HITS.delete(k); });
  if (!h || now - h[1] > 60000) { HITS.set(ip, [1, now]); return false; }
  h[0]++; return h[0] > MAX;
}
// user agentul, redus la trei cuvinte: telefon / tabletă / calculator, browserul, sistemul
function ua(s) {
  s = String(s || '');
  const dev = /iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(s) ? 't' : /Mobi|iPhone|iPod|Android|Windows Phone/i.test(s) ? 'm' : 'd';
  const br = /FBAN|FBAV|FB_IAB|FBIOS/.test(s) ? 'Facebook' : /Instagram/.test(s) ? 'Instagram' : /SamsungBrowser/.test(s) ? 'Samsung' : /Edg(e|A|iOS)?\//.test(s) ? 'Edge'
    : /Firefox|FxiOS/.test(s) ? 'Firefox' : /OPR\/|Opera/.test(s) ? 'Opera' : /CriOS|Chrome\//.test(s) ? 'Chrome' : /Safari\//.test(s) ? 'Safari' : 'Altul';
  const os = /iPhone|iPad|iPod/.test(s) ? 'iOS' : /Android/.test(s) ? 'Android' : /Windows/.test(s) ? 'Windows' : /Mac OS X|Macintosh/.test(s) ? 'macOS' : /CrOS/.test(s) ? 'ChromeOS' : /Linux/.test(s) ? 'Linux' : '';
  return { dev, br, os };
}
const str = (v, k) => String(v == null ? '' : v).slice(0, k);
function waitUntil() {
  try { const c = globalThis[Symbol.for('@vercel/request-context')], ctx = c && typeof c.get === 'function' ? c.get() : null; return ctx && typeof ctx.waitUntil === 'function' ? (p) => ctx.waitUntil(p) : null; } catch (e) { return null; }
}

module.exports = async (req, res) => {
  const done = () => { res.statusCode = 204; res.setHeader('Cache-Control', 'no-store'); res.end(); };
  const agent = String(req.headers['user-agent'] || '');
  if (req.method !== 'POST' || !agent || BOT.test(agent)) return done();
  let b = req.body;
  if (Buffer.isBuffer(b)) b = b.toString('utf8');
  if (typeof b === 'string') { try { b = b.length < 8000 ? JSON.parse(b) : null; } catch (e) { b = null; } }
  if (!b || typeof b !== 'object' || typeof b.p !== 'string') return done();
  const ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '?').split(',')[0].trim();
  if (limited(ip)) return done();
  const u = ua(agent), country = String(req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || '').slice(0, 2).toUpperCase().replace(/[^A-Z]/g, '');
  const x = { page: str(b.p, 120).split(/[?#]/)[0], dev: u.dev, br: u.br, os: u.os, country: country === 'XX' || country === 'T1' ? '' : country, conn: str(b.c, 8), nav: str(b.n, 12),
    v: b.v && typeof b.v === 'object' ? b.v : null, w: b.w && typeof b.w === 'object' ? b.w : null, top: Array.isArray(b.r) ? b.r : null, e: Array.isArray(b.e) ? b.e : null };
  if (!x.v && !x.w && !x.e) return done();
  try { await perf.ingest(x); } catch (e) { console.error('site-perf', e.message); }
  const later = () => perf.probeIfDue(10 * 60e3).catch(() => 0);
  const wu = waitUntil();
  if (wu) { wu(later()); done(); } else { done(); await later(); }
};
