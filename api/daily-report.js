// GET /api/daily-report: the owner's report at the end of the day, on her phone and in the bell. Called by the
// Vercel cron in vercel.json each evening; with CRON_SECRET set, only requests that carry it are accepted.
// ?preview=1 (signed in as the owner) shows the numbers without sending anything.
//   paid today (both cities, by method), the card on the POS (myPOS), the appointments of the day (done,
//   cancelled), the bookings made today and the new leads

const { readJSON, writeJSON } = require('./_lib/store');
const { getSession } = require('./_lib/auth');
const { notifyMany, adminIds } = require('./_lib/notify');

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const dayOf = (iso) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(iso)) : '');
const lei = (n) => Math.round(n).toLocaleString('ro-RO') + ' lei';
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
  const ofDay = appts.filter((a) => a.date === day && a.status !== 'concediu');
  return {
    day, total, methods: m, byCity, count: paid.length,
    pos: { total: posTotal, count: posToday.filter((p) => p.amount > 0).length, connected: !!(pos.list || []).length },
    appointments: { total: ofDay.filter((a) => a.status !== 'anulata').length, done: ofDay.filter((a) => a.status === 'finalizata').length, cancelled: ofDay.filter((a) => a.status === 'anulata').length },
    booked: appts.filter((a) => a.createdBy !== 'highlevel' && dayOf(a.createdAt) === day && a.status !== 'concediu').length,
    leads: leads.filter((l) => dayOf(l.createdAt) === day).length,
  };
}

function words(n) {
  const d = new Date(n.day + 'T12:00:00Z');
  const title = 'Raportul zilei · ' + RO_DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + RO_MONTHS[d.getUTCMonth()];
  const parts = ['Încasat ' + lei(n.total) + (n.total ? ' (card ' + lei(n.methods.card) + ', cash ' + lei(n.methods.cash) + (n.methods.transfer ? ', transfer ' + lei(n.methods.transfer) : '') + ')' : '')];
  if (n.pos.connected) parts.push('POS ' + lei(n.pos.total));
  parts.push(n.appointments.done + ' din ' + n.appointments.total + ' programări făcute');
  parts.push(n.booked + ' programări noi', n.leads + ' leaduri');
  return { title, text: parts.join(' · ') };
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
  if (secret && req.headers.authorization !== 'Bearer ' + secret && !owner) { res.status(401).json({ error: 'unauthorized' }); return; }
  const n = await numbers(today());
  const w = words(n);
  const store = { readJSON, writeJSON };
  const pushed = await notifyMany(store, await adminIds(store), { kind: 'report', tone: 'info', title: w.title, text: w.text, go: 'incasari', tag: 'report-' + n.day });
  res.status(200).json({ ok: true, pushed, words: w });
};
