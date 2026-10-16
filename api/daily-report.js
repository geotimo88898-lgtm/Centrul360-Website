// GET /api/daily-report: the owner's report at the end of the day, on her phone and in the bell. Called by the
// Vercel cron in vercel.json each evening. Only the cron sends it: with CRON_SECRET set, the requests that carry it;
// without, Vercel's own cron caller (its user agent); or the owner signed in. Anyone else gets 401 (it pushes to her
// phone, so it isn't open to the world).
// ?preview=1 (signed in as the owner) shows the numbers without sending anything.
//   paid today (both cities, by method), the card on the POS (myPOS: total, payments, average), the
//   appointments of the day (done, cancelled), the bookings made today and the new leads.
// Then a warning of its own, when some POS payments of the day have no încasare in the portal (the same matching as
// Încasări → POS myPOS: same day, same sum within 50 bani, same city when both are known, the nearest in time);
// myPOS's history is read first, for any payment its live notice missed.
// And a warning for each POS that has taken no payment for 3 days or more (switched off, broken, the payments
// going through another one), again every 3 days while it lasts.
// And the ads of the last 3 days doing very well (RECLAMĂ TOP 🚀) or very badly (ATENȚIE ⚠️), marked the same way as in
// Panou → KPI (_lib/kpi.js): the same ad at most once every 3 days, at most 3 bad and 2 good ones an evening.

const { readJSON, writeJSON } = require('./_lib/store');
const { getSession } = require('./_lib/auth');
const { notifyMany, adminIds } = require('./_lib/notify');
const M = require('./_lib/mypos');
const KPI = require('./_lib/kpi');

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const dayOf = (iso) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(iso)) : '');
const lei = (n) => Math.round(n).toLocaleString('ro-RO') + ' lei';
const lei2 = (n) => (Math.round(n * 100) / 100).toLocaleString('ro-RO') + ' lei';
const hhmm = (iso) => new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
const plural = (n, one, many) => (n === 1 ? '1 ' + one : n + (n % 100 >= 20 || (n && n % 100 === 0) ? ' de ' : ' ') + many);
const cardPart = (s) => (s.method === 'card' ? Number(s.amount || 0) : s.method === 'cash_card' && s.split ? Number(s.split.card || 0) : 0);

// the day's POS payments that no card încasare in the portal accounts for
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const IDLE = 'data/mypos-idle.json'; // { tid: the day it was last said }
async function idlePos(store, day, posList, devices) {
  const said = (await store.readJSON(IDLE, {})) || {};
  const out = [];
  (devices || []).filter((d) => d.tid && d.city).forEach((d) => {
    const last = posList.filter((p) => p.tid === d.tid && p.amount > 0 && !p.cancelled).reduce((m, p) => (p.day > m ? p.day : m), '');
    if (!last) return; // never used as far as the history reaches: nothing to go by
    const days = daysBetween(last, day);
    if (days < 3) { delete said[d.tid]; return; }
    if (said[d.tid] && daysBetween(said[d.tid], day) < 3) return;
    out.push({ tid: d.tid, city: d.city, model: d.model || 'POS', days, last });
    said[d.tid] = day;
  });
  await store.writeJSON(IDLE, said, { quiet: true });
  return out;
}

function unrecorded(day, sales, posList, devices) {
  const cityOf = (tid) => ((devices || []).find((d) => d.tid === tid) || {}).city || '';
  const cards = sales.filter((s) => s.source === 'incasare' && s.date === day && cardPart(s) > 0)
    .map((s) => ({ id: s.id, amt: cardPart(s), city: s.location || '', t: Date.parse(s.createdAt) || Date.parse(day + 'T12:00:00') }));
  const used = new Set();
  const out = [];
  posList.filter((p) => p.day === day && !p.cancelled && p.amount > 0).sort((a, b) => (a.at < b.at ? -1 : 1)).forEach((p) => {
    const pc = cityOf(p.tid), pt = Date.parse(p.at);
    let best = null;
    cards.forEach((x) => {
      if (used.has(x.id) || Math.abs(x.amt - p.amount) > 0.5 || (pc && x.city && x.city !== pc)) return;
      const dt = Math.abs(x.t - pt);
      if (!best || dt < best.dt) best = { x, dt };
    });
    if (best) used.add(best.x.id); else out.push({ amount: p.amount, at: p.at, city: pc, tid: p.tid });
  });
  return out;
}
const RO_DAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const RO_MONTHS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];

async function numbers(day) {
  const [sales, appts, leads, pos] = await Promise.all([
    readJSON('data/sales.json', []), readJSON('data/appointments.json', []), readJSON('data/leads.json', []), readJSON('data/mypos-payments.json', { list: [] }),
  ]);
  const paid = sales.filter((s) => s.source === 'incasare' && s.date === day);
  const m = { card: 0, cash: 0, transfer: 0 };
  const byCity = {};
  paid.forEach((s) => {
    if (s.method === 'cash_card' && s.split) { m.cash += Number(s.split.cash || 0); m.card += Number(s.split.card || 0); }
    else if (m[s.method] != null) m[s.method] += Number(s.amount || 0);
    byCity[s.location || '-'] = (byCity[s.location || '-'] || 0) + Number(s.amount || 0);
  });
  const total = paid.reduce((a, s) => a + Number(s.amount || 0), 0);
  const posToday = (pos.list || []).filter((p) => p.day === day && !p.cancelled);
  const posTotal = posToday.reduce((a, p) => a + p.amount, 0);
  const posPaid = posToday.filter((p) => p.amount > 0);
  const conn = await M.loadConn(readJSON);
  const ofDay = appts.filter((a) => a.date === day && a.status !== 'concediu');
  return {
    day, total, methods: m, byCity, count: paid.length,
    pos: { total: posTotal, count: posPaid.length, avg: posPaid.length ? Math.round(posPaid.reduce((a, p) => a + p.amount, 0) / posPaid.length * 100) / 100 : 0, connected: !!(pos.list || []).length,
      unrecorded: unrecorded(day, sales, pos.list || [], conn.devices) },
    appointments: { total: ofDay.filter((a) => a.status !== 'anulata').length, done: ofDay.filter((a) => a.status === 'finalizata').length, cancelled: ofDay.filter((a) => a.status === 'anulata').length },
    booked: appts.filter((a) => a.createdBy !== 'highlevel' && dayOf(a.createdAt) === day && a.status !== 'concediu').length,
    leads: leads.filter((l) => dayOf(l.createdAt) === day).length,
  };
}

function words(n) {
  const d = new Date(n.day + 'T12:00:00Z');
  const title = 'RAPORTUL ZILEI 📊 - ' + RO_DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + RO_MONTHS[d.getUTCMonth()];
  const parts = ['Încasat ' + lei(n.total) + (n.total ? ' (card ' + lei(n.methods.card) + ', cash ' + lei(n.methods.cash) + (n.methods.transfer ? ', transfer ' + lei(n.methods.transfer) : '') + ')' : '')];
  if (n.pos.connected) parts.push('POS ' + lei(n.pos.total) + (n.pos.count ? ' (' + plural(n.pos.count, 'plată', 'plăți') + ', bon mediu ' + lei(n.pos.avg) + ')' : ''));
  parts.push(n.appointments.done + ' din ' + n.appointments.total + ' programări făcute');
  parts.push(n.booked + ' programări noi', n.leads + ' leaduri');
  return { title, text: parts.join(' · ') };
}

const AD_SAID = 'data/ad-alerts.json'; // { adId: the day it was last said }
async function adAlerts(store, ids, day) {
  const conn = await require('./_lib/facebook').loadConnection(readJSON);
  if (!conn || !conn.userToken || !conn.adAccountId) return 0;
  const r = KPI.rangeOf('custom', { since: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(Date.now() - 2 * 864e5)), until: day });
  const ads = await KPI.adsFor(conn, r);
  if (!ads.rows) return 0;
  const [offers, leads, appointments, sales, clients] = await Promise.all([require('./_lib/offers').loadOffers(readJSON), readJSON('data/leads.json', []),
    readJSON('data/appointments.json', []), readJSON('data/sales.json', []), readJSON('data/clients.json', [])]);
  const view = KPI.adsOf(KPI.model({ offers, leads, appointments, sales, clients }), r, ads);
  const said = await readJSON(AD_SAID, {});
  const fresh = (a) => !said[a.id] || daysBetween(said[a.id], day) >= 3;
  const bad = view.rows.filter((a) => a.flag === 'bad' && a.status === 'ACTIVE' && fresh(a)).slice(0, 3);
  const top = view.rows.filter((a) => a.flag === 'top' && fresh(a)).slice(0, 2);
  for (const a of bad.concat(top)) {
    await notifyMany(store, ids, { kind: 'alert', tone: a.flag === 'bad' ? 'bad' : 'good', go: 'panou', tag: 'ad-' + a.id + '-' + day,
      title: (a.flag === 'bad' ? 'ATENȚIE ⚠️ - reclama ' : 'RECLAMĂ TOP 🚀 - ') + String(a.name || 'fără nume').slice(0, 60), text: 'Ultimele 3 zile: ' + a.why.join(' · ') });
    said[a.id] = day;
  }
  if (bad.length || top.length) await writeJSON(AD_SAID, said);
  return bad.length + top.length;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = getSession(req);
  const owner = session && session.role === 'admin' && !session.viewer;
  if (req.query && req.query.preview) {
    if (!owner) { res.status(401).json({ error: 'not_authenticated' }); return; }
    const n = await numbers(String(req.query.day || today()));
    res.status(200).json(Object.assign({ words: words(n) }, n));
    return;
  }
  const secret = process.env.CRON_SECRET;
  const cron = secret ? req.headers.authorization === 'Bearer ' + secret : /vercel-cron/i.test(String(req.headers['user-agent'] || ''));
  if (!cron && !owner) { res.status(401).json({ error: 'unauthorized' }); return; }
  const store = { readJSON, writeJSON };
  // any POS payment the live notice missed comes in first (a failed read only leaves the check to what is known)
  try { if (M.connected(await M.loadConn(readJSON))) await M.sync(store, {}); } catch (e) { /* the report goes anyway */ }
  const n = await numbers(today());
  const w = words(n);
  const ids = await adminIds(store);
  const pushed = await notifyMany(store, ids, { kind: 'report', tone: 'info', title: w.title, text: w.text, go: 'incasari', tag: 'report-' + n.day });
  const un = n.pos.unrecorded || [];
  if (un.length) {
    const line = (p) => lei2(p.amount) + ', ' + hhmm(p.at) + (p.city ? ', ' + p.city : '');
    await notifyMany(store, ids, {
      kind: 'alert', tone: 'bad', go: 'incasari', tag: 'unrec-' + n.day,
      title: 'ATENȚIE ⚠️ - ' + (un.length === 1 ? '1 plată pe POS neînregistrată' : plural(un.length, 'plată', 'plăți') + ' pe POS neînregistrate'),
      text: un.slice(0, 4).map(line).join(' · ') + (un.length > 4 ? ' · și încă ' + (un.length - 4) : ''),
    });
  }
  let idle = [];
  try {
    const conn = await M.loadConn(readJSON);
    idle = await idlePos(store, n.day, (await readJSON(M.PAY, { list: [] })).list || [], conn.devices);
    for (const p of idle) {
      const dd = new Date(p.last + 'T12:00:00Z');
      await notifyMany(store, ids, {
        kind: 'alert', tone: 'bad', go: 'incasari', tag: 'idle-' + p.tid + '-' + n.day,
        title: 'ATENȚIE ⚠️ - POS ' + p.city + ' fără plăți de ' + plural(p.days, 'zi', 'zile'),
        text: 'Ultima plată: ' + RO_DAYS[dd.getUTCDay()] + ' ' + dd.getUTCDate() + ' ' + RO_MONTHS[dd.getUTCMonth()] + ' · ' + p.model + ' · TID ' + p.tid,
      });
    }
  } catch (e) { /* the report went */ }
  let ads = 0;
  try { ads = await adAlerts(store, ids, n.day); } catch (e) { console.error('daily-report ads:', e.message); }
  res.status(200).json({ ok: true, pushed, words: w, unrecorded: un.length, idle: idle.length, ads });
};
