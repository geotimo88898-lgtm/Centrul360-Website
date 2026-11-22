// „Cardul de Sărbători” followed as a campaign (the owner, 21.11: Admin → Campanii, the picker's second campaign): the
// WhatsApp message to the warmest 250 (api/_lib/card-blast.js), what they did on the site (api/_lib/site-funnel.js
// segments) and the card's orders and money (data/card-sarbatori.json, read only), per clinic and in all, so he sees
// where people drop. Every number is counted from what is kept; what can't be known is null (the portal shows „—”).
//
//   WhatsApp   cardblast/state.json (the list), cardblast/sent.json (accepted by Meta: the message id; refused: the
//              error), cardblast/ev/<delivered|read|failed>/<id> (Meta's statuses, from the webhook, since
//              cardblast/ev-since.txt), cardblast/in/<id> (what a person of the list wrote back: a button, words, a stop),
//              and Meta's own count of the template (template_analytics: sent, delivered, read, the button clicks), when
//              the account gives it
//   Site       the visitors who came with utm_campaign=card-sarbatori (any page after), and all the visitors of
//              /card-sarbatori, phone and computer apart; the orders of the same people come from the orders' own track
//   Money      the orders: online / in the clinic, paid, waiting, expired, cancelled, cashed, credit, by card, the minutes
//              to the payment, the stock; „din campanie” = an order made after the send by a phone of the list, or from
//              the campaign's link
//   Lots       card-blast's batches: who they were (seg, visits, what she paid us, her last visit, a booking ahead at the
//              send), when and with which message (sent[k].t: 990 / 290 / 490), and each lot's numbers side by side
//   People     each one of the list: her steps, her next booking (data/appointments.json), her lot and message
// cardblast/kpi-cache.json keeps what was read once (her answers, the failure codes, Meta's count for 10 minutes).

const { readJSON, writeJSON, readBinary } = require('./store');
const CB = require('./card-blast');
const C = require('./card-sarbatori');
const F = require('./site-funnel');

const KEY = 'card';
const NAME = 'Cardul de Sărbători';
const CAMP = 'card-sarbatori'; // the button's link: /card-sarbatori?utm_source=whatsapp&utm_campaign=card-sarbatori
const CITIES = ['Timișoara', 'Arad'];
const TAG = { 'Timișoara': 'tm', Arad: 'ar' };
const CACHE = CB.P + 'kpi-cache.json';
const META_MS = 10 * 60e3;
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const nowISO = () => new Date().toISOString();
const MOBILE = /Mobi|Android|iPhone|iPad|iPod/i;
const WHY = {
  131026: 'numărul nu are WhatsApp sau nu poate primi mesaje', 131049: 'Meta l-a oprit (limita de mesaje de marketing pentru ea)',
  131050: 'a oprit mesajele de marketing', 130472: 'Meta nu l-a livrat (un test al Meta pe numărul ei)', 131047: 'fereastra de 24 de ore',
  131051: 'tip de mesaj nesuportat', 131053: 'poza nu s-a putut trimite', 131000: 'eroare la Meta', 100: 'parametru greșit', 132000: 'șablonul nu se potrivește',
  132001: 'șablonul nu există', 132015: 'șablonul e oprit', 132016: 'șablonul e oprit',
};
const why = (code, text) => WHY[code] || (code ? 'cod ' + code : String(text || 'necunoscut').slice(0, 80));

// ---------------------------------------------------------------- reading
async function listed(prefix) {
  const { list } = require('@vercel/blob');
  const out = []; let cursor;
  for (let i = 0; i < 30; i++) {
    const r = await list({ prefix, cursor, limit: 1000 });
    (r.blobs || []).forEach((b) => out.push({ id: String(b.pathname).slice(prefix.length), at: b.uploadedAt ? new Date(b.uploadedAt).toISOString() : '' }));
    if (!r.hasMore) break;
    cursor = r.cursor;
  }
  return out;
}
const text = async (key) => { const b = await readBinary(key).catch(() => null); return b ? b.toString('utf8') : ''; };
const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2); return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2); };
const sum = (a, f) => a.reduce((n, x) => n + (Number(f(x)) || 0), 0);
const roKey = (ms, unit) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return p.year + '-' + p.month + '-' + p.day + (unit === 'day' ? '' : ' ' + p.hour);
};

// Meta's count of the card's template, per clinic (template_analytics, if the account gives it), kept 10 minutes
async function metaCount(fromMs, cache) {
  if (cache.meta && Date.now() - Date.parse(cache.meta.at) < META_MS) return cache.meta;
  const WA = require('./whatsapp'), WT = require('./wa-templates');
  const out = { at: nowISO(), by: {} };
  let tpls = [], cfg = null;
  try { tpls = (await WT.load()).templates; cfg = await WA.loadConfig(); } catch (e) { CITIES.forEach((c) => { out.by[c] = { error: 'nu se pot citi șabloanele' }; }); return out; }
  for (const c of CITIES) {
    const n = cfg.numbers[c] || {};
    const t = tpls.filter((x) => x.fastcash === 'card_sarbatori_' + TAG[c] && WT.approvedFor(x, n.wabaId)).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
    const id = t && ((t.meta || {})[n.wabaId] || {}).id;
    if (!n.token || !n.wabaId || !id) { out.by[c] = { error: 'șablonul nu e aprobat pe numărul clinicii' }; continue; }
    try {
      const q = new URLSearchParams({ start: String(Math.floor(fromMs / 864e5) * 86400), end: String(Math.floor(Date.now() / 1000)), granularity: 'DAILY',
        metric_types: JSON.stringify(['SENT', 'DELIVERED', 'READ', 'CLICKED']), template_ids: JSON.stringify([id]) });
      const r = await fetch(WA.GRAPH + '/' + encodeURIComponent(n.wabaId) + '/template_analytics?' + q, { headers: { Authorization: 'Bearer ' + n.token } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { out.by[c] = { error: String(((j && j.error) || {}).message || r.status).slice(0, 120) }; continue; }
      const pts = [].concat(...((j.data || []).map((x) => x.data_points || [])));
      const clicks = {};
      pts.forEach((p) => (p.clicked || []).forEach((x) => { const k = (x.type || '') + '|' + (x.button_content || ''); clicks[k] = (clicks[k] || 0) + (Number(x.count) || 0); }));
      out.by[c] = { sent: sum(pts, (p) => p.sent), delivered: sum(pts, (p) => p.delivered), read: sum(pts, (p) => p.read),
        clicks: Object.keys(clicks).map((k) => ({ type: k.split('|')[0], text: k.split('|').slice(1).join('|'), n: clicks[k] })) };
    } catch (e) { out.by[c] = { error: 'rețea' }; }
  }
  return out;
}

// ---------------------------------------------------------------- the numbers
const blankWa = () => ({ list: 0, sent: 0, failed: 0, failedSend: 0, failedLater: 0, waiting: 0, delivered: 0, read: 0, replied: 0, taps: 0, stop: 0, texts: 0 });
const blankMoney = () => ({ online: 0, onlinePaid: 0, onlineWaiting: 0, onlineExpired: 0, resv: 0, resvOpen: 0, clinicPaid: 0, cancelled: 0, paid: 0, cards: 0, cash: 0, credit: 0, open: 0, potential: 0, minOnline: [], minClinic: [] });
// an order still to be paid: a reservation or a request (to call), or an online one still in its 2 hours
const isOpen = (r, now) => r.status === 'rezervat' || r.status === 'lead' || ((r.status === 'asteptare' || r.status === 'matching') && now - Date.parse(r.created) < C.HOLD_MS);
// which message a send was (card-blast sent[k].t, else her own p.pre): the card it leads with
const msgOf = (pre) => (/_290$/.test(String(pre || '')) ? '290' : /_490$/.test(String(pre || '')) ? '490' : '990');

function moneyOf(orders, now) {
  const by = { total: blankMoney() };
  CITIES.forEach((c) => { by[c] = blankMoney(); });
  const tiers = {};
  Object.keys(C.TIERS).forEach((t) => { tiers[t] = { orders: 0, paid: 0, cards: 0, cash: 0 }; });
  orders.forEach((r) => {
    const rows = [by.total].concat(by[r.city] ? [by[r.city]] : []);
    const paid = r.status === 'platit', waiting = r.status === 'asteptare' || r.status === 'matching';
    const age = now - Date.parse(r.created);
    const mins = paid && r.paidAt ? Math.max(0, (Date.parse(r.paidAt) - Date.parse(r.created)) / 60e3) : null;
    rows.forEach((x) => {
      if (r.pay === 'online' || r.convertedAt) x.online++;
      if (r.pay !== 'online') x.resv++;
      if (paid) { x.paid++; x.cards += C.qtyOf(r); x.cash += Number(r.paidAmount) || Number(r.amount) || 0; x.credit += Number(r.credit) || 0; }
      if (paid && r.paidVia === 'online') { x.onlinePaid++; if (mins != null) x.minOnline.push(mins); }
      if (paid && r.paidVia !== 'online') { x.clinicPaid++; if (mins != null) x.minClinic.push(mins); }
      if (waiting) { if (age < C.HOLD_MS) x.onlineWaiting++; else x.onlineExpired++; }
      if (r.status === 'rezervat' || r.status === 'lead') x.resvOpen++;
      if (isOpen(r, now)) { x.open++; x.potential += Number(r.amount) || 0; }
      if (r.status === 'anulat') x.cancelled++;
    });
    const t = tiers[r.tier];
    if (t) { t.orders++; if (paid) { t.paid++; t.cards += C.qtyOf(r); t.cash += Number(r.paidAmount) || Number(r.amount) || 0; } }
  });
  Object.values(by).forEach((x) => { x.minOnline = median(x.minOnline); x.minClinic = median(x.minClinic); });
  return { by, tiers };
}

async function view(opts) {
  const now = Date.now();
  const [st, sent, cache0, ordersRaw, clients, appts, tplsAll] = await Promise.all([
    readJSON(CB.STATE, null).then((x) => Object.assign({ list: [], armed: false, pickedAt: '', doneAt: '', note: '' }, x || {})),
    readJSON(CB.SENT, null).then((x) => x || {}),
    readJSON(CACHE, null).then((x) => x || {}).catch(() => ({})),
    readJSON(C.KEY, []).catch(() => []),
    readJSON('data/clients.json', []).catch(() => []),
    readJSON('data/appointments.json', []).catch(() => []),
    require('./wa-templates').load().then((d) => d.templates || []).catch(() => []),
  ]);
  const cache = { in: cache0.in || {}, fail: cache0.fail || {}, meta: cache0.meta || null };
  const list = Array.isArray(st.list) ? st.list : [];
  const byK = new Map(list.map((p) => [p.k, p]));
  const sentAt = Object.values(sent).map((x) => Date.parse(x && x.at)).filter((t) => t > 0);
  const from = sentAt.length ? Math.min(...sentAt) : 0;
  const to = sentAt.length ? Math.max(...sentAt) : 0;

  // ---- WhatsApp
  const [dl, rd, fl, inb, sinceTxt] = await Promise.all(['delivered', 'read', 'failed'].map((s) => listed(CB.P + 'ev/' + s + '/').catch(() => []))
    .concat([listed(CB.P + 'in/').catch(() => []), text(CB.P + 'ev-since.txt')]));
  const idOf = new Map(); // the message id (as its mark is named) → k
  const safe = (id) => String(id || '').replace(/[^\w.-]/g, '_').slice(0, 160);
  Object.keys(sent).forEach((k) => { if (sent[k] && sent[k].w) idOf.set(safe(sent[k].w), k); });
  const per = new Map(); // k → { delivered, read, failed, readAt }
  const mark = (k) => { if (!per.has(k)) per.set(k, {}); return per.get(k); };
  dl.concat(rd).forEach((x) => { const k = idOf.get(x.id); if (!k) return; const m = mark(k); m.delivered = true; if (x.at && (!m.deliveredAt || x.at < m.deliveredAt)) m.deliveredAt = x.at; });
  rd.forEach((x) => { const k = idOf.get(x.id); if (k) { mark(k).read = true; mark(k).readAt = x.at; } });
  const failLater = [];
  for (const x of fl) {
    const k = idOf.get(x.id); if (!k) continue;
    if (!(x.id in cache.fail)) cache.fail[x.id] = String((await text(CB.P + 'ev/failed/' + x.id)).split('|')[1] || '');
    mark(k).failed = true; mark(k).failedAt = x.at; mark(k).failCode = Number(cache.fail[x.id]) || 0; failLater.push({ k, code: Number(cache.fail[x.id]) || 0 });
  }
  // her answers (read once, kept in the cache)
  for (const x of inb) {
    if (cache.in[x.id]) continue;
    try { cache.in[x.id] = JSON.parse(await text(CB.P + 'in/' + x.id)); } catch (e) { cache.in[x.id] = { k: '', kind: 'text', text: '', at: x.at }; }
  }
  const answers = new Map(); // k → [answer]
  Object.keys(cache.in).forEach((id) => { const a = cache.in[id]; if (a && byK.has(a.k)) answers.set(a.k, (answers.get(a.k) || []).concat(Object.assign({ id }, a))); });

  // per batch too (api/_lib/card-blast.js pickMore: batch 2; the first ones have none)
  const batchOf = (p) => String((p && p.batch) || 1);
  const batches = [...new Set(list.map(batchOf))].sort((a, b) => Number(a) - Number(b));
  const waBy = {};
  ['all'].concat(batches).forEach((b) => { waBy[b] = { total: blankWa() }; CITIES.forEach((c) => { waBy[b][c] = blankWa(); }); });
  const wa = waBy.all;
  const reasons = {};
  const reason = (city, code, e) => { const k = String(code || e || '?').slice(0, 40); const r = reasons[k] = reasons[k] || { code: code || 0, why: why(code, e), n: 0, by: {} }; r.n++; r.by[city] = (r.by[city] || 0) + 1; };
  list.forEach((p) => {
    const wb = waBy[batchOf(p)];
    const rows = [wa.total, wb.total].concat(wa[p.city] ? [wa[p.city], wb[p.city]] : []);
    const s = sent[p.k], m = per.get(p.k) || {}, ans = answers.get(p.k) || [];
    rows.forEach((x) => {
      x.list++;
      if (!s) { x.waiting++; return; }
      if (s.e) { x.failed++; x.failedSend++; return; }
      x.sent++;
      if (m.failed && !m.delivered) { x.failed++; x.failedLater++; }
      if (m.delivered || m.read) x.delivered++;
      if (m.read) x.read++;
      if (ans.length) x.replied++;
      if (ans.some((a) => a.kind === 'tap')) x.taps++;
      if (ans.some((a) => a.kind === 'stop')) x.stop++;
      if (ans.some((a) => a.kind === 'text')) x.texts++;
    });
    if (s && s.e) reason(p.city, s.code, s.e);
  });
  failLater.forEach((f) => { if (!(per.get(f.k) || {}).delivered) reason((byK.get(f.k) || {}).city || '', f.code, ''); });
  const tracked = sinceTxt ? Date.parse(sinceTxt) : 0;
  const meta = from ? await metaCount(from, cache).catch(() => ({ at: nowISO(), by: {} })) : { at: nowISO(), by: {} };
  cache.meta = meta;

  // ---- the orders: since the send, the campaign's (her phone on the list, or the link) and the rest
  const now0 = now;
  const orders = (Array.isArray(ordersRaw) ? ordersRaw : []).filter((r) => r && r.status !== 'draft').map((r) => C.norm(r));
  // her personal link's token (api/_lib/card-blast.js tokenOf) → her
  const byTok = new Map(list.map((p) => [CB.tokenOf(p.k), p.k]));
  const whoOf = (r) => (byK.has(d9(r.phone)) ? d9(r.phone) : byTok.get(String((r.track || {}).ct || '')) || '');
  const fromCamp = (r) => {
    if (!from || Date.parse(r.created) < from) return '';
    if (whoOf(r)) return 'list';
    if (String((r.track || {}).utm_campaign || '').toLowerCase() === CAMP) return 'link';
    return '';
  };
  const since = orders.filter((r) => from && Date.parse(r.created) >= from);
  const camp = since.filter((r) => fromCamp(r));
  const campBy = { all: moneyOf(camp, now) };
  batches.forEach((b) => { campBy[b] = moneyOf(camp.filter((r) => { const k = whoOf(r); return k && batchOf(byK.get(k)) === b; }), now); });
  const split = { list: { orders: 0, paid: 0, cash: 0 }, link: { orders: 0, paid: 0, cash: 0 }, rest: { orders: 0, paid: 0, cash: 0 } };
  since.forEach((r) => { const x = split[fromCamp(r) || 'rest']; x.orders++; if (r.status === 'platit') { x.paid++; x.cash += Number(r.paidAmount) || Number(r.amount) || 0; } });
  const cfg = await C.settings();
  const cnt = C.counter(orders, now0, cfg);
  const stock = { left: cnt.left, sold: cnt.sold, max: cfg.max, wave: cnt.wave.n, waves: cnt.wave.of, waveSize: cfg.wave, totalLeft: Math.max(0, cfg.max - cnt.sold), open: cnt.open };

  // ---- the site: the campaign's visitors and the card page's, phone and computer apart, with the orders of each
  const seg = from ? await F.segments(new Date(from).toISOString()).catch(() => null) : null;
  const daySet = new Set((seg && seg.days) || []);
  const isCardPage = (r) => { try { return /^\/card-sarbatori(\.html)?\/?$/.test(new URL(String(r.page || '')).pathname); } catch (e) { return false; } };
  const devOf = (r) => (MOBILE.test(String((r.track || {}).ua || '')) ? 'm' : 'd');
  const site = {};
  [['camp', 'c:' + CAMP + ':'], ['page', 'p:card:']].forEach(([name, pre]) => {
    site[name] = {};
    ['m', 'd'].forEach((dev) => {
      const s = Object.assign({ visit: 0, seen: 0, buy: 0, pay: 0, res: 0, rsent: 0 }, ((seg && seg.segs) || {})[pre + dev] || {});
      const mine = orders.filter((r) => daySet.has(roKey(Date.parse(r.created), 'day')) && devOf(r) === dev && (name === 'camp' ? String((r.track || {}).utm_campaign || '').toLowerCase() === CAMP : isCardPage(r)));
      s.order = mine.filter((r) => r.pay === 'online').length;
      s.paid = mine.filter((r) => r.pay === 'online' && r.status === 'platit').length;
      s.resv = mine.filter((r) => r.pay !== 'online').length;
      s.cpaid = mine.filter((r) => r.pay !== 'online' && r.status === 'platit').length;
      site[name][dev] = s;
    });
  });

  // ---- by hour since the send (by day past 3 days): sent, read, visits from the link, the campaign's orders and payments
  let hours = null;
  if (from) {
    const unit = now - from > 72 * 3600e3 ? 'day' : 'hour';
    const keys = [];
    for (let t = Math.floor(from / 3600e3) * 3600e3; t <= now; t += 3600e3) { const k = roKey(t, unit); if (keys[keys.length - 1] !== k) keys.push(k); }
    const idx = new Map(keys.map((k, i) => [k, i]));
    const row = () => keys.map(() => 0);
    const h = { unit, keys, sent: row(), read: row(), visits: row(), orders: row(), paid: row() };
    const put = (arr, iso) => { const t = Date.parse(iso); if (!(t > 0)) return; const i = idx.get(roKey(t, unit)); if (i != null) arr[i]++; };
    Object.values(sent).forEach((x) => { if (x && x.w) put(h.sent, x.at); });
    per.forEach((x) => { if (x.read && x.readAt) put(h.read, x.readAt); });
    const vh = Object.assign({}, ((seg && seg.hours) || {})['c:' + CAMP + ':m'] || {});
    Object.entries(((seg && seg.hours) || {})['c:' + CAMP + ':d'] || {}).forEach(([k, n]) => { vh[k] = (vh[k] || 0) + n; });
    Object.entries(vh).forEach(([k, n]) => { const i = idx.get(unit === 'day' ? k.slice(0, 10) : k); if (i != null) h.visits[i] += n; });
    camp.forEach((r) => { put(h.orders, r.created); if (r.status === 'platit') put(h.paid, r.paidAt); });
    hours = h;
  }

  // ---- the people (the admin portal shows her name and phone, like Transformarea's people)
  const nameOf = new Map();
  (Array.isArray(clients) ? clients : []).forEach((c) => { const k = d9(c && c.phone); if (k.length === 9 && c.name && !nameOf.has(k)) nameOf.set(k, c.name); });
  const ordOf = new Map();
  camp.filter((r) => fromCamp(r) === 'list').forEach((r) => { const k = whoOf(r); ordOf.set(k, (ordOf.get(k) || []).concat({ id: r.id, tier: r.tier, qty: r.qty, amount: r.amount, pay: r.pay, status: r.status, converted: !!r.convertedAt, trail: (r.trail || []).slice(-30).map((e) => ({ at: e.at, ev: e.ev, note: e.note || '' })), naming: (r.naming && r.naming.state) || '', expired: (r.status === 'asteptare' || r.status === 'matching') && now0 - Date.parse(r.created) >= C.HOLD_MS, paidVia: r.paidVia || '', created: r.created, paidAt: r.paidAt || '' })); });
  // ---- each person of the list, her steps in order with their times (the site's only through her personal link)
  const tokSteps = (seg && seg.tokens) || {};
  const everyone = list.map((p) => {
    const s = sent[p.k] || null, m = per.get(p.k) || {}, ans = (answers.get(p.k) || []).sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const site = tokSteps[CB.tokenOf(p.k)] || null;
    const t = (ms) => (ms ? new Date(ms).toISOString() : '');
    return {
      k: p.k, name: nameOf.get(p.k) || p.fn || '', phone: '0' + p.k, city: p.city, seg: p.seg, batch: batchOf(p),
      sent: s && s.w ? s.at : '', fail: s && s.e ? why(s.code, s.e) : m.failed && !m.delivered ? why(m.failCode, '') : '',
      delivered: m.delivered ? m.deliveredAt || '' : null, read: m.read ? m.readAt || '' : null,
      answers: ans.map((a) => ({ at: a.at, kind: a.kind, text: a.text })),
      site: site ? { visit: t(site.visit), seen: t(site.seen), buy: t(site.buy), res: t(site.res), pay: t(site.pay) } : null,
      orders: ordOf.get(p.k) || [],
    };
  });
  const tokens = everyone.filter((x) => x.site).length;

  // ---- her visits (the appointments of her client file): the last one done, the next one booked now, one booked when the
  // message went (made before it, still not cancelled)
  const today = roKey(now, 'day');
  const cid = new Map(); // phone → client ids
  (Array.isArray(clients) ? clients : []).forEach((c) => { const k = d9(c && c.phone); if (k.length === 9 && c.id) cid.set(k, (cid.get(k) || []).concat(c.id)); });
  const apOf = new Map(); // client id or phone → appointments
  (Array.isArray(appts) ? appts : []).forEach((a) => {
    if (!a || !a.date) return;
    if (a.clientId) apOf.set(a.clientId, (apOf.get(a.clientId) || []).concat(a));
    const k = d9(a.clientPhone); if (k.length === 9) apOf.set('p' + k, (apOf.get('p' + k) || []).concat(a));
  });
  const visitsOf = (k) => { const seen = new Set(); return (cid.get(k) || []).concat('p' + k).flatMap((id) => apOf.get(id) || []).filter((a) => (seen.has(a.id) ? false : seen.add(a.id))); };
  const dead = (a) => /anulat|neprezent/.test(String(a.status || ''));
  const visit = new Map();
  list.forEach((p) => {
    const as = visitsOf(p.k), s = sent[p.k];
    const done = as.filter((a) => a.status === 'finalizata' && a.date <= today).map((a) => a.date).sort();
    const next = as.filter((a) => a.date >= today && !dead(a) && a.status !== 'finalizata').sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')))[0] || null;
    const sendDay = s && s.at ? roKey(Date.parse(s.at), 'day') : '';
    const atSend = !!(sendDay && as.some((a) => a.date >= sendDay && !dead(a) && (!a.createdAt || a.createdAt <= s.at)));
    visit.set(p.k, { last: done[done.length - 1] || '', next: next ? { date: next.date, time: next.time || '', city: next.location || '', what: String(next.treatment || '').slice(0, 60) } : null, atSend });
  });
  everyone.forEach((x) => { const v = visit.get(x.k) || {}; x.appt = v.next || null; x.msg = msgOf((sent[x.k] || {}).t || (byK.get(x.k) || {}).pre || st.pre); });

  // ---- the lots (card-blast batches): who they were, when and with what message, and how each did, side by side
  const tplImg = (pre) => { const t = tplsAll.filter((x) => x.fastcash === (pre || 'card_sarbatori') + '_tm' || x.fastcash === (pre || 'card_sarbatori') + '_ar').sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0]; return t ? require('./wa-templates').imageOf(t) || '' : ''; };
  const ageDays = (d) => (d ? (Date.parse(today) - Date.parse(d)) / 864e5 : null);
  const lots = batches.map((b) => {
    const ps = list.filter((p) => batchOf(p) === b), ev = everyone.filter((x) => x.batch === b);
    // the message: what went (sent[k].t); before anything went, what is planned (her p.pre, else the list's)
    const went = ps.filter((p) => sent[p.k] && sent[p.k].w);
    const pres = went.length ? went.map((p) => sent[p.k].t || '') : ps.map((p) => p.pre || st.pre || '');
    const msgs = {}; pres.forEach((x) => { const m = msgOf(x); msgs[m] = (msgs[m] || 0) + 1; });
    const keys = Object.keys(msgs);
    const segs = {}; ps.forEach((p) => { segs[p.seg || 'client'] = (segs[p.seg || 'client'] || 0) + 1; });
    const vis = ps.map((p) => Number(p.visits)).filter((n) => Number.isFinite(n));
    const paid = ps.map((p) => p.paid).filter((n) => typeof n === 'number' && n > 0);
    const rec = { m1: 0, m3: 0, m6: 0, m12: 0, older: 0, never: 0 };
    ps.forEach((p) => { const a = ageDays((visit.get(p.k) || {}).last); rec[a == null ? 'never' : a <= 30 ? 'm1' : a <= 91 ? 'm3' : a <= 182 ? 'm6' : a <= 365 ? 'm12' : 'older']++; });
    const at = ps.map((p) => sent[p.k] && sent[p.k].w ? Date.parse(sent[p.k].at) : 0).filter((t) => t > 0);
    const w = waBy[b].total, mo = campBy[b].by.total;
    const won = ev.filter((x) => x.orders.some((o) => o.status === 'platit' || isOpen(o, now))).length;
    const allPre = [...new Set(pres)];
    return {
      b, n: ps.length, msg: keys.length > 1 ? 'mix' : keys[0] || '990', msgs, img: tplImg(allPre.length === 1 ? allPre[0] : ''), segs,
      visits: vis.length ? { min: Math.min(...vis), med: median(vis), max: Math.max(...vis) } : null, paidMed: paid.length ? median(paid) : null, recency: rec,
      atSend: ps.filter((p) => (visit.get(p.k) || {}).atSend).length, cities: { 'Timișoara': ps.filter((p) => p.city === 'Timișoara').length, Arad: ps.filter((p) => p.city === 'Arad').length },
      first: at.length ? new Date(Math.min(...at)).toISOString() : '', last: at.length ? new Date(Math.max(...at)).toISOString() : '',
      stats: { sent: w.sent, delivered: w.delivered, read: w.read, replied: w.replied, taps: w.taps, requests: mo.resv, paidOnline: mo.onlinePaid, paidClinic: mo.clinicPaid,
        cash: mo.cash, potential: mo.potential, open: mo.open, won, conv: w.sent ? Math.round((won / w.sent) * 1000) / 10 : null },
    };
  });
  // the best lot: the most people won (paid or asked) per message sent, among lots with 20 sent or more
  const ranked = lots.filter((l) => l.stats.sent >= 20 && l.stats.conv != null).sort((a, b) => b.stats.conv - a.stats.conv || b.stats.cash - a.stats.cash);
  const best = ranked.length > 1 && ranked[0].stats.conv > 0 ? ranked[0].b : '';

  await writeJSON(CACHE, cache, { quiet: true }).catch(() => {});
  return {
    ok: true, key: KEY, name: NAME, at: nowISO(),
    state: { armed: !!st.armed, pickedAt: st.pickedAt || '', doneAt: st.doneAt || '', note: st.note || '', from: from ? new Date(from).toISOString() : '', to: to ? new Date(to).toISOString() : '', tracked: tracked ? new Date(tracked).toISOString() : '' },
    wa, waBy, batches, lots, best, fails: Object.values(reasons).sort((a, b) => b.n - a.n), meta,
    site, money: { camp: campBy.all, campBy, all: moneyOf(orders, now0), split }, stock, hours, people: everyone, tokens,
  };
}

module.exports = { KEY, NAME, CAMP, view, moneyOf };
