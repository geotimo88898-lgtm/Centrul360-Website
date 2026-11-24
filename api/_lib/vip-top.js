// The best clients of a clinic, for a personal call (the owner, 24.11: the VIP card offered by phone to the most loyal
// ones). Read only. Ranked by the money she paid in the last 12 months (Încasări, net of refunds), then by her visits in
// those months, then by how recently she came. One person per phone (her client files, her payments and her bookings
// merged by the last 9 digits). Left out: the team (by phone or full name), test records, anyone who already holds or is
// buying the VIP card (data/card-sarbatori.json, tier 9900). Names and phones are for the admin's answer only: never
// written to a log.

const { readJSON } = require('./store');
const { normalizePhone } = require('./clients');
const C = require('./clinic');
const B = require('./booking');
const M = require('./money');

const VIP = 9900;
const isTest = (n) => /\btest\b/i.test(String(n || ''));
const words = (n) => C.fold(n).replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

async function top({ city, n }) {
  const want = C.clinicOf(city);
  const lim = Math.max(1, Math.min(150, Number(n) || 30));
  const [clients, sales, appts, orders, emps] = await Promise.all([readJSON('data/clients.json', []), readJSON('data/sales.json', []),
    readJSON('data/appointments.json', []), readJSON('data/card-sarbatori.json', []), readJSON('data/employees.json', [])]);
  const N = C.normalize({ leads: [], appts, sales, convos: [], emps });
  const today = B.roNow().date, from = C.addDay(today, -365);

  const staffP = new Set(emps.map((e) => C.d9(e && e.phone)).filter((x) => x.length === 9));
  const staffN = new Set(emps.map((e) => words(e && e.name)).filter((x) => x.split(' ').length >= 2));
  const byId = new Map(clients.filter(Boolean).map((c) => [c.id, c]));
  const byName = new Map();
  clients.forEach((c) => { const w = c && words(c.name); const p = c && C.d9(c.phone); if (!w || p.length !== 9) return; byName.set(w, byName.has(w) && byName.get(w) !== p ? null : p); });
  const keyOf = (id, phone, name) => {
    const p = C.d9(phone || (byId.get(id) || {}).phone);
    if (p.length === 9) return p;
    const q = byName.get(words(name));
    return q || '';
  };

  const P = new Map();
  const get = (k) => { if (!P.has(k)) P.set(k, { k, names: {}, phone: '', paid12: 0, paidAll: 0, card: 0, money: {}, seen: {}, days: new Set(), days12: new Set(), tr: {}, files: new Set(), cards: [], test: false }); return P.get(k); };
  const nameOf = (p, nm, w) => { const s = String(nm || '').trim(); if (s) p.names[s] = (p.names[s] || 0) + (w || 1); if (isTest(s)) p.test = true; };
  const visitOn = (p, d, loc, tr) => {
    if (!d || d > today) return;
    p.days.add(d); if (d >= from) p.days12.add(d);
    const c = C.clinicOf(loc); if (c) p.seen[c] = (p.seen[c] || 0) + 1;
    const t = String(tr || '').trim().slice(0, 80);
    if (t && !C.isConsult({ treatment: t })) p.tr[t] = (p.tr[t] || 0) + 1;
  };

  clients.forEach((c) => { if (!c) return; const k = keyOf(c.id, c.phone, c.name); if (!k) return; const p = get(k); nameOf(p, c.name, 3); p.files.add(c.id); if (!p.phone) p.phone = normalizePhone(c.phone); if (C.clinicOf(c.location)) p.home = C.clinicOf(c.location); });

  const apptById = new Map(N.appts.filter(Boolean).map((a) => [a.id, a]));
  const counted = new Set();
  N.sales.forEach((s) => {
    if (!M.isMoney(s)) return;
    const k = keyOf(s.clientId, s.clientPhone, s.client); if (!k) return;
    const p = get(k); nameOf(p, s.client);
    if (!p.phone && s.clientPhone) p.phone = normalizePhone(s.clientPhone);
    const a = Number(s.amount) || 0;
    p.paidAll += a; if (s.date >= from) p.paid12 += a;
    const c = C.clinicOf(s.location); if (c) p.money[c] = (p.money[c] || 0) + a;
    if (s.cardOrderId) { p.card += a; return; }
    if (!M.isPayment(s)) return;
    const ap = s.appointmentId && apptById.get(s.appointmentId);
    if (ap) counted.add(ap.id);
    if (s.appointmentId || !s.dueId) visitOn(p, s.visitDate || s.date, s.location, s.treatment || (ap && ap.treatment));
  });
  N.appts.forEach((a) => {
    if (!C.visit(a) || counted.has(a.id) || !(a.status === 'finalizata' || a.paidSaleId)) return;
    const k = keyOf(a.clientId, a.clientPhone, a.clientName); if (!k) return;
    const p = get(k); nameOf(p, a.clientName);
    visitOn(p, a.date, a.location, a.treatment);
  });
  (orders || []).forEach((r) => {
    if (!r || r.testPay || r.cancelledBy === 'test' || ['anulat', 'draft', 'matching'].includes(r.status)) return;
    const k = C.d9(r.phone); if (k.length !== 9 || !P.has(k)) return;
    P.get(k).cards.push({ tier: Number(r.tier) || 0, qty: Number(r.qty) || 1, status: r.status || '', credit: Number(r.credit) || 0 });
  });

  const out = { staff: 0, test: 0, vip: 0, otherCity: 0, noMoney: 0 };
  const rows = [];
  P.forEach((p) => {
    const name = Object.keys(p.names).sort((x, y) => p.names[y] - p.names[x] || y.length - x.length)[0] || '';
    if (staffP.has(p.k) || (name && staffN.has(words(name)))) { out.staff++; return; }
    if (p.test || isTest(name)) { out.test++; return; }
    if (!(p.paidAll > 0)) { out.noMoney++; return; }
    if (p.cards.some((x) => x.tier === VIP && ['platit', 'rezervat', 'asteptare', 'lead'].includes(x.status))) { out.vip++; return; }
    const best = (o) => Object.keys(o).sort((x, y) => o[y] - o[x])[0] || '';
    const home = best(p.money) || best(p.seen) || p.home || '';
    if (want && home !== want) { out.otherCity++; return; }
    const days = [...p.days].sort();
    rows.push({
      name, phone: p.phone || ('0' + p.k), city: home,
      paid12: M.r2(p.paid12), paidAll: M.r2(p.paidAll), cardLei: M.r2(p.card),
      visits12: p.days12.size, visits: p.days.size, firstVisit: days[0] || '', lastVisit: days[days.length - 1] || '',
      treatments: Object.entries(p.tr).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([t, c]) => ({ t, n: c })),
      cards: p.cards, files: p.files.size,
    });
  });
  rows.sort((x, y) => y.paid12 - x.paid12 || y.visits12 - x.visits12 || String(y.lastVisit).localeCompare(String(x.lastVisit)));
  return { ok: true, today, from, city: want || 'toate', paying: rows.length, left: out, list: rows.slice(0, lim) };
}

module.exports = { top };
