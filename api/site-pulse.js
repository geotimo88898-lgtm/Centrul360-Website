// /api/site-pulse: the site, seen from the portal (Admin → Site).
//
// POST (public, from the site's own pages: /site-pulse.js): one page view. No cookie, nothing kept on the visitor's device and
// nothing that names a person: the page's path, the site it came from (only its host), the campaign (utm_source), phone or
// computer, how long the page took to load. One visitor = one daily fingerprint made here from the address and the browser
// with a secret, changed every day, never reversible (like Plausible); the address itself is never kept.
// Counted per hour in data/site/<YYYY-MM-DD-HH>.json (a conditional write, so two views at once both count).
//
// GET (admin): ?view=stats  → who is on the site right now (seen in the last 5 minutes, and on which page), today hour by hour,
//                             the last 7 / 30 days, top pages, where they came from, phones vs computers, load time; plus what
//                             the site brought: the sign-ups (leads with source "site") and the online bookings.
//              ?view=health → the main pages asked right now: answer, time, size; kept (the last 400 checks) for the history.

const { readJSON, readJSONTagged, writeJSON, writeJSONIf } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const crypto = require('crypto');

const ORIGIN = /^https:\/\/([\w-]+\.)?centrul360\.com$/;
const LIVE_MS = 5 * 60e3;
const HEALTH_KEY = 'data/site-health.json';
const PAGES = ['/', '/oferte', '/programare', '/preturi', '/rezultate', '/echipa', '/grasime-localizata', '/epilare-laser', '/timisoara', '/arad', '/v2/', '/sitemap.xml', '/robots.txt', '/api/offers-public'];
const tries = new Map();

const ro = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).format(d).replace(', ', '-').replace(/[^\d-]/g, '');
const dayOf = (d) => ro(d).slice(0, 10);
const hourKey = (d) => 'data/site/' + ro(d).slice(0, 13) + '.json';
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const bump = (o, k, n) => { if (!k) return; o[k] = (o[k] || 0) + (n || 1); };

async function hit(req, res) {
  const origin = String(req.headers.origin || '');
  if (origin && !ORIGIN.test(origin) && !/^http:\/\/localhost(:\d+)?$/.test(origin)) { res.status(403).end(); return; }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  const now = Date.now();
  const mine = (tries.get(ip) || []).filter((t) => now - t < 60e3);
  if (mine.length >= 40) { res.status(204).end(); return; }
  tries.set(ip, mine.concat(now));
  if (tries.size > 5000) tries.clear();
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  if (Buffer.isBuffer(b)) { try { b = JSON.parse(b.toString('utf8')); } catch (e) { b = {}; } }
  const ua = String(req.headers['user-agent'] || '');
  if (/bot|crawl|spider|slurp|preview|headless|lighthouse/i.test(ua)) { res.status(204).end(); return; }
  const sid = crypto.createHmac('sha256', String(process.env.PORTAL_SECRET || 'c360')).update(dayOf(new Date(now)) + '|' + ip + '|' + ua).digest('base64url').slice(0, 16);
  const beat = !!b.h; // the page is still open (every minute while it is visible): she is still there, no new view
  // the city the visit comes from (Cloudflare's, by the address; the address itself is never kept): for the globe
  const gp = String(req.headers['x-c360-geo'] || '').split('|').map((x) => { try { return decodeURIComponent(x); } catch (e) { return ''; } });
  const geo = gp[0] ? [clip(gp[0], 2), clip(gp[1], 40), Math.round(Number(gp[2]) * 10) / 10 || 0, Math.round(Number(gp[3]) * 10) / 10 || 0] : null;
  const path = clip(String(b.p || '/').split('?')[0].split('#')[0], 120) || '/';
  if (!sid || /^\/(api|portal|login|creative|fise)\b/.test(path)) { res.status(204).end(); return; }
  let ref = clip(b.r, 80).toLowerCase().replace(/^www\./, '');
  if (/centrul360\.com$/.test(ref)) ref = '';
  const utm = clip(b.u, 40).toLowerCase().replace(/[^\w.-]/g, '');
  const dev = b.d === 'm' ? 'm' : 'd';
  const ms = Math.max(0, Math.min(60000, Math.round(Number(b.t) || 0)));
  const key = hourKey(new Date(now));
  for (let i = 0; i < 4; i++) {
    const { data, etag } = await readJSONTagged(key, null);
    const h = data || { v: 1, views: 0, s: {}, p: {}, r: {}, u: {}, d: {}, t: [0, 0], g: {} };
    const known = h.s[sid];
    if (beat && !known) break; // a heartbeat from a visit counted in the hour before: nothing to add
    if (!beat) h.views++;
    if (!known && Object.keys(h.s).length < 6000) h.s[sid] = [now, now, path, dev, ref || utm || '', geo];
    else if (known) { known[1] = now; known[2] = path; }
    if (!beat) bump(h.p, path);
    if (!known) { bump(h.r, ref || (utm ? 'campanie: ' + utm : 'direct')); bump(h.d, dev); if (utm) bump(h.u, utm); if (geo) { h.g = h.g || {}; bump(h.g, geo[1] ? geo[1] + ', ' + geo[0] : geo[0]); } }
    if (ms && !beat) { h.t[0] += ms; h.t[1]++; }
    try {
      const ok = etag ? await writeJSONIf(key, h, etag, { quiet: true }) : (await writeJSON(key, h, { quiet: true }), true);
      if (ok) break; // someone else counted at the same moment: read again and add ours on top
    } catch (e) { if (i === 3) console.error('site-pulse hit:', e.message); }
  }
  res.status(204).end();
}

// ------------------------------------------------------------------ the numbers
function emptyDay() { return { views: 0, visitors: 0, p: {}, r: {}, d: {}, g: {}, t: [0, 0], hours: Array(24).fill(0) }; }
function addHour(day, h, hour) {
  if (!h) return;
  day.views += h.views || 0;
  day.visitors += Object.keys(h.s || {}).length;
  day.hours[hour] += h.views || 0;
  ['p', 'r', 'd', 'g'].forEach((k) => Object.keys(h[k] || {}).forEach((x) => bump(day[k] = day[k] || {}, x, h[k][x])));
  if (h.t) { day.t[0] += h.t[0]; day.t[1] += h.t[1]; }
}
async function readDay(date, isToday) {
  if (!isToday) { const c = await readJSON('data/site/day-' + date + '.json', null).catch(() => null); if (c) return c; }
  const day = emptyDay();
  const hours = await Promise.all(Array.from({ length: 24 }, (_, i) => readJSON('data/site/' + date + '-' + String(i).padStart(2, '0') + '.json', null).catch(() => null)));
  hours.forEach((h, i) => addHour(day, h, i));
  // a finished day is kept as one document: the next reading of it is one read, not 24
  if (!isToday) await writeJSON('data/site/day-' + date + '.json', day, { quiet: true }).catch(() => {});
  return day;
}
const top = (o, n) => Object.keys(o || {}).map((k) => ({ k, n: o[k] })).sort((a, b) => b.n - a.n).slice(0, n);

async function stats(res) {
  const now = new Date();
  const today = dayOf(now);
  const days = [];
  for (let i = 29; i >= 0; i--) days.push(dayOf(new Date(now.getTime() - i * 864e5)));
  const [byDay, cur, prev, leads] = await Promise.all([
    Promise.all(days.map((d) => readDay(d, d === today))),
    readJSON(hourKey(now), null).catch(() => null),
    readJSON(hourKey(new Date(now.getTime() - 3600e3)), null).catch(() => null),
    readJSON('data/leads.json', []),
  ]);
  // who is on the site now: seen in the last 5 minutes, with the page they are on
  const live = {};
  [prev, cur].forEach((h) => Object.keys((h && h.s) || {}).forEach((sid) => { const x = h.s[sid]; if (now - x[1] < LIVE_MS) live[sid] = { path: x[2], dev: x[3], from: x[4], at: x[1], geo: x[5] || null }; }));
  const sum = (arr, k) => arr.reduce((a, d) => a + (d[k] || 0), 0);
  const merge = (arr) => { const o = emptyDay(); arr.forEach((d) => { o.views += d.views; o.visitors += d.visitors; ['p', 'r', 'd', 'g'].forEach((k) => Object.keys(d[k] || {}).forEach((x) => bump(o[k], x, d[k][x]))); o.t[0] += d.t[0]; o.t[1] += d.t[1]; }); return o; };
  const t = byDay[byDay.length - 1], w = merge(byDay.slice(-7)), m = merge(byDay);
  // what the site brought (real, from the Pipeline): sign-ups and online bookings, per day
  const siteLeads = (leads || []).filter((l) => l.source === 'site');
  const perDay = (pred) => days.map((d) => siteLeads.filter((l) => pred(l) && dayOf(new Date(l.createdAt || 0)) === d).length);
  const forms = perDay((l) => l.createdBy !== 'site-booking'), books = perDay((l) => l.createdBy === 'site-booking');
  const s7 = (a) => a.slice(-7).reduce((x, y) => x + y, 0), s30 = (a) => a.reduce((x, y) => x + y, 0);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    now: now.toISOString(), counting: !!(sum(byDay, 'views') || cur),
    live: Object.keys(live).map((k) => live[k]).sort((a, b) => b.at - a.at),
    today: { views: t.views, visitors: t.visitors, hours: t.hours, load: t.t[1] ? Math.round(t.t[0] / t.t[1]) : null, pages: top(t.p, 8), from: top(t.r, 6), dev: t.d },
    week: { views: w.views, visitors: w.visitors, load: w.t[1] ? Math.round(w.t[0] / w.t[1]) : null, pages: top(w.p, 8), from: top(w.r, 8), dev: w.d, places: top(w.g, 8) },
    month: { views: m.views, visitors: m.visitors },
    days: days.map((d, i) => ({ d, views: byDay[i].views, visitors: byDay[i].visitors, forms: forms[i], books: books[i] })),
    brought: { today: { forms: forms[29], books: books[29] }, week: { forms: s7(forms), books: s7(books) }, month: { forms: s30(forms), books: s30(books) } },
  });
}

async function health(req, res) {
  const base = 'https://www.centrul360.com';
  const rows = await Promise.all(PAGES.map(async (p) => {
    const t0 = Date.now();
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 10000);
      const r = await fetch(base + p, { redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': 'Centrul360-Health/1.0' } });
      const buf = await r.arrayBuffer(); clearTimeout(to);
      return { p, status: r.status, ms: Date.now() - t0, kb: Math.round(buf.byteLength / 102.4) / 10 };
    } catch (e) { return { p, status: 0, ms: Date.now() - t0, kb: 0, err: e.name === 'AbortError' ? 'timeout' : 'nu răspunde' }; }
  }));
  const ok = rows.filter((r) => r.status >= 200 && r.status < 400).length;
  const check = { at: new Date().toISOString(), ok, n: rows.length, ms: Math.round(rows.reduce((a, r) => a + r.ms, 0) / rows.length) };
  let hist = await readJSON(HEALTH_KEY, []).catch(() => []);
  if (!Array.isArray(hist)) hist = [];
  const last = hist[hist.length - 1];
  // at most one kept check every 10 minutes (the page asks every minute while it is open)
  if (!last || Date.now() - Date.parse(last.at) > 10 * 60e3) { hist.push(check); hist = hist.slice(-400); await writeJSON(HEALTH_KEY, hist, { quiet: true }).catch(() => {}); }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ rows, check, history: hist.slice(-144) });
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') return await hit(req, res);
    if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const session = await requireAdmin(req, res);
    if (!session) return;
    if ((req.query || {}).view === 'health') return await health(req, res);
    return await stats(res);
  } catch (err) {
    console.error('site-pulse error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'server_error' });
  }
};
