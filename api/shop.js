// /api/shop: the site's shop (api/_lib/shop.js). Public, our own pages only (Origin), a few tries per address.
//   GET  ?city=Timișoara        → { ok, terms: { now, bf, end, pct, tiers, needs, impulse }, products: [...] }  (no city: both clinics)
//   POST { action: 'quote', city, items: [price list id] }   → the cart priced by the server
//   POST { action: 'hold', city, items, visit: 'consult' | 'first', date, time, page, src, prev, prevKey }
//        the hour held while she pays (booking-holds.js), the cart on it → { ok, hold: { id, key, until }, quote }
//        then the page pays it with C360Pay.open({ kind: 'shop', ref: hold.id }) (api/pay.js); the hour is free available
//        days come from /api/booking (GET ?service=consult, or ?service=custom&treatment=<the main treatment>)
const crypto = require('crypto');
const { readJSON } = require('./_lib/store');
const S = require('./_lib/shop');
const B = require('./_lib/booking');
const H = require('./_lib/booking-holds');

const tries = new Map();
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const cityOf = (v) => B.CITIES.find((c) => B.fold(c) === B.fold(v)) || '';
const ourOrigin = (o) => !o || /^https:\/\/([\w-]+\.)?centrul360\.com$/.test(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

async function hold(req, res, b) {
  const P = require('./_lib/pay');
  const city = cityOf(b.city);
  if (!city) { res.status(400).json({ error: 'missing_city' }); return; }
  const [cfg, st] = await Promise.all([B.settings({ team: true }), P.status()]);
  if (!cfg.on) { res.status(409).json({ error: 'off' }); return; }
  if (!st.on) { res.status(409).json({ error: 'pay_off' }); return; }
  const q = await S.quote(city, b.items);
  if (q.error) { res.status(400).json({ error: q.error, id: q.id }); return; }
  const visit = b.visit === 'consult' ? 'consult' : 'first';
  const minutes = visit === 'consult' ? 30 : q.main.minutes;
  const date = clip(b.date, 10), time = clip(b.time, 5);
  if (!B.isDate(date) || B.toMin(time) == null) { res.status(400).json({ error: 'bad_time' }); return; }
  const appts = await readJSON('data/appointments.json', []);
  const holds = await H.all();
  if (b.prev) { const old = holds.find((h) => h && h.id === String(b.prev) && h.key === String(b.prevKey || '')); if (old) { await H.release(old.id); old.released = 'now'; } }
  if (!B.freeOn(cfg, city, date, minutes, appts.concat(H.asAppts(holds))).includes(time)) { res.status(409).json({ error: 'taken' }); return; }
  const what = S.summary(q);
  const title = (visit === 'consult' ? 'Consultație gratuită · comandă online: ' : 'Prima ședință · comandă online: ') + what;
  const main = require('./_lib/pay').treatment(q.main.id, city);
  const capi = require('./_lib/meta-capi');
  const h = await H.add({
    key: crypto.randomBytes(12).toString('hex'), city,
    svc: { id: 'custom', title: title.slice(0, 200), price: q.amount, old: q.full, minutes, cat: visit === 'consult' ? '' : main && main.cat === 'epilare' ? 'epilare' : (main && main.cat) || 'corporale', treatment: visit === 'consult' ? '' : q.main.id },
    // the sessions and the zone she chose travel with the hold (the payment is priced from them, api/_lib/shop.js payQuote)
    cart: { items: q.lines.map((l) => ({ id: l.id, zone: l.zone, qty: l.qty })), visit, at: new Date().toISOString() },
    date, time, endTime: B.hhmm(B.toMin(time) + minutes), page: clip(b.page, 120), src: b.src && typeof b.src === 'object' ? b.src : null,
    cookie: /(^|;\s*)_fbc=fb\./.test(String((req.headers && req.headers.cookie) || '')) ? '_fbc=fb.' : '',
    app: B.appOf(req.headers && req.headers['user-agent']), track: capi.fromRequest(req, b.page),
  });
  const again = await H.all();
  const mine = again.find((x) => x.id === h.id);
  if (B.overbooked(cfg, appts.concat(H.asAppts(again.filter((x) => x.id !== h.id && Date.parse(x.createdAt) <= Date.parse(h.createdAt)))), { id: 'hold-' + h.id, location: city, date, time, endTime: h.endTime })) {
    await H.release(h.id);
    res.status(409).json({ error: 'taken' });
    return;
  }
  res.status(200).json({ ok: true, hold: { id: h.id, key: h.key, until: (mine || h).until, minutes: H.HOLD_MIN }, quote: q });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!ourOrigin(String(req.headers.origin || ''))) { res.status(403).json({ error: 'forbidden' }); return; }
  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      const city = cityOf(q.city);
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=60');
      const all = S.catalog(city);
      // the packages apart: the shop's grids show the sessions, the cart offers the packages
      res.status(200).json({ ok: true, city, terms: await S.terms(), products: all.filter((p) => !p.pack), packs: all.filter((p) => p.pack) });
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    let b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    const ip = String(req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || '').split(',')[0].trim() || 'x';
    const now = Date.now();
    const mine = (tries.get(ip) || []).filter((t) => now - t < 10 * 60e3);
    if (mine.length >= 120) { res.status(429).json({ error: 'too_many' }); return; }
    tries.set(ip, mine.concat(now));
    if (b.hp || b.website) { res.status(200).json({ ok: true }); return; }
    if (b.action === 'quote') {
      const city = cityOf(b.city);
      if (!city) { res.status(400).json({ error: 'missing_city' }); return; }
      const r = await S.quote(city, b.items);
      res.status(r.error ? 400 : 200).json(r.error ? r : Object.assign({ ok: true }, r));
      return;
    }
    if (b.action === 'hold') { await hold(req, res, b); return; }
    res.status(400).json({ error: 'bad_action' });
  } catch (err) {
    console.error('shop error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
