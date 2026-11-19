// The upsell commission, paid on the money actually received (George, 16.11): the same 4% (_lib/cats.js commissionOf),
// but of each payment that came in for the upsell (its first payment, then every later one toward the rest of the
// package, _lib/dues.js), each in the month that payment came in. A refund (_lib/refunds.js) takes 4% of the money
// returned back off, in the refund's month.
//
//   From November 2026 (NEW_FROM): an upsell whose payment is in November or later. Anything earlier keeps the rule it
//   was paid under (the whole value's commission, in its month), so October's salaries stay exactly as they were paid. A
//   refund of an older upsell still takes 4% of the money returned, and, when it closes the package, 4% of the rest that
//   will never come in (that upsell's commission was paid on the whole value).
//   Commission requests added by hand (origin 'manual', no payment behind them) keep the whole value too.
//
// Leaving (Echipa → „A plecat”, _lib/left.js): what she earned up to her last day stays hers (in its months, the last one
// included); a payment that comes in after it brings her nothing, and a refund made after it takes nothing off her.
//
// No payment, no commission: a request whose payment was deleted (or whose upsell was taken off it) brings nothing, never
// the whole value. Under the cash rule a request counts at most its value (u.amount, kept equal to the package's value).
//
// The approval stays one per upsell (Aprobări). Approved: its lines count in their months, later payments included,
// without asking again. Waiting: its lines show as "în așteptare" in their months. Rejected: nothing.
//
// A line: { date, kind: 'pay' | 'whole' | 'refund' | 'rest', cash (lei of money), lei (commission, minus for a cut),
//   upsellId, status, what, client, paidSoFar, total, refundId? }

const { commissionOf } = require('./cats');
const M = require('./money');

const NEW_FROM = '2026-11';

// Bonusul pe pachete (George, 19.11; for good from 20.11, „aș vrea să rămână mereu”), from 23.11: each payment received for an upsell of 1.500 lei or more brings a fixed
// bonus instead of the 4%: 1.500-1.999 = 100 lei, 2.000-2.499 = 150 lei (George, 20.11), 2.500-2.999 = 200 lei, 3.000+ = 350 lei. It counts the money that came
// in, payment by payment (an advance of 1.500 on a 3.000 package is a 1.500 payment, 100 lei; the other 1.500 paid later
// is another 1.500 payment, 100 lei that day). From the first such payment of the day (George, 20.11: the minimum of 2 a day
// is gone, perDay 1, so the first sale is already a win); every payment under 1.500 keeps the normal 4%.
// A refund of an upsell that brought a bonus takes back the same share of what it brought (its lei per lei paid).
const PACK = { from: '2026-11-23', until: '', tiers: [{ min: 3000, lei: 350 }, { min: 2500, lei: 200 }, { min: 2000, lei: 150 }, { min: 1500, lei: 100 }], perDay: 1, shortDay: 1, shortHours: 6 };
// On top of it (George, 20.11), on the payments that bring the package bonus:
//   third: her 3rd payment of 1.500+ of the day and every one after it +50 lei each (by the time it came in)
//   again: a client who had bought a package before buys another one +100 lei, on the first payment of the new one
const EXTRA = { third: 50, again: 100 };
const packTier = (cash, date) => (date >= PACK.from && (!PACK.until || date <= PACK.until) ? PACK.tiers.find((t) => cash >= t.min) || null : null);
const packMinOf = (emp) => { const h = Number(emp && emp.contractedHoursPerDay); return h > 0 && h < PACK.shortHours ? PACK.shortDay : PACK.perDay; };
const r2 = M.r2;
const monthOf = (d) => String(d || '').slice(0, 7);
const isUpsellReq = (s) => !!s && s.source !== 'incasare' && s.source !== 'manual';
const cashRule = (u) => !!u && u.origin === 'upsell' && !!u.incasareId && monthOf(u.date) >= NEW_FROM;
const bucharestDay = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t)) : ''; };

// what the lines are read from, once per request; employees (optional): their last day, for who left
function context(sales, dues, employees) {
  const byId = new Map(), dueByStart = new Map(), cuts = new Map(), until = new Map();
  (employees || []).forEach((e) => { const d = require('./left').leftAt(e); if (d) until.set(e.id, d); });
  (sales || []).forEach((s) => { if (s && s.id) byId.set(s.id, s); });
  (dues || []).forEach((d) => { if (d && d.saleId) dueByStart.set(d.saleId, d); });
  (sales || []).forEach((r) => {
    if (!M.isRefund(r)) return;
    (r.from || []).forEach((p) => { if (p.upsellId && p.lei > 0) (cuts.get(p.upsellId) || cuts.set(p.upsellId, []).get(p.upsellId)).push({ r, lei: p.lei, kind: 'refund' }); });
    (r.restCut || []).forEach((p) => { if (p.upsellId && p.lei > 0) (cuts.get(p.upsellId) || cuts.set(p.upsellId, []).get(p.upsellId)).push({ r, lei: p.lei, kind: 'rest' }); });
  });
  const emps = new Map();
  (employees || []).forEach((e) => { if (e && e.id) emps.set(e.id, e); });
  return { byId, dueByStart, cuts, until, sales: sales || [], emps };
}
// a client who bought a package before this one (any earlier upsell of the same client, not rejected)
function boughtBefore(u, C) {
  const cid = (C.byId.get(u.incasareId) || {}).clientId;
  if (!cid) return false;
  if (!C.firstBuy) {
    C.firstBuy = new Map();
    (C.sales || []).forEach((x) => {
      if (!isUpsellReq(x) || x.status === 'rejected') return;
      const c = (C.byId.get(x.incasareId) || {}).clientId;
      if (!c) return;
      const k = String(x.date || '') + '|' + (x.createdAt || '') + '|' + x.id, was = C.firstBuy.get(c);
      if (!was || k < was) C.firstBuy.set(c, k);
    });
  }
  const first = C.firstBuy.get(cid);
  return !!first && !first.endsWith('|' + u.id);
}
// how many payments of 1.500+ each person took on each day of the bonus (key 'employeeId|date'), once per context
function packDays(C) {
  if (C.packDays) return C.packDays;
  const m = new Map();
  C.packDays = m;
  (C.sales || []).forEach((u) => {
    if (!isUpsellReq(u) || u.status === 'rejected') return;
    rawLinesOf(u, C).forEach((l) => { if (l.kind === 'pay' && packTier(l.cash, l.date)) { const k = u.employeeId + '|' + l.date; (m.get(k) || m.set(k, []).get(k)).push({ id: u.id, at: l.at || u.createdAt || '' }); } });
  });
  // each payment's place in her day (0 = the first), by the time it came in
  C.packRank = new Map();
  m.forEach((list, k) => {
    list.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    list.forEach((x, i) => C.packRank.set(x.id + '|' + k.split('|')[1] + '|' + x.at, i));
  });
  return m;
}
// the payment's part that went to the upsell (no package rest: it was paid whole now), or null when the payment is gone
function upsellPaidOf(u, C) {
  const s = C.byId.get(u.incasareId);
  if (!s || s.source !== 'incasare' || s.kind === 'refund') return null;
  if (s.parts) return r2(s.parts.upsell);
  return r2(Math.min(Number(s.upsell) || 0, Number(s.amount) || 0));
}

// every line of one commission request, whatever the month, with the package bonus where it applies
function linesOf(u, C) {
  const out = rawLinesOf(u, C);
  if (!out.some((l) => l.kind === 'pay' && packTier(l.cash, l.date))) return out;
  const days = packDays(C), min = packMinOf(C.emps && C.emps.get(u.employeeId));
  let paid = 0, lei = 0, firstPack = true;
  const again = boughtBefore(u, C);
  out.forEach((l) => {
    if (l.kind !== 'pay') return;
    const t = packTier(l.cash, l.date);
    if (t && (days.get(u.employeeId + '|' + l.date) || []).length >= min) {
      l.lei = Math.max(t.lei, l.lei); l.pack = t.min; // never under the 4% (a payment of 8.750+)
      const extra = [];
      if ((C.packRank.get(u.id + '|' + l.date + '|' + (l.at || u.createdAt || '')) || 0) >= 2) extra.push(['third', EXTRA.third]);
      if (again && firstPack) extra.push(['again', EXTRA.again]);
      firstPack = false;
      if (extra.length) { l.extras = extra.map((x) => x[0]); l.packLei = l.lei; l.lei = r2(l.lei + extra.reduce((a, x) => a + x[1], 0)); }
    }
    paid += l.cash; lei += l.lei;
  });
  if (out.some((l) => l.pack) && paid > 0) out.forEach((l) => { if (l.kind === 'refund') l.lei = r2(Math.max(-lei, l.cash * lei / paid)); });
  return out;
}

// the lines at the normal 4%, before the package bonus
function rawLinesOf(u, C) {
  if (!isUpsellReq(u) || u.status === 'rejected') return [];
  const base = { upsellId: u.id, status: u.status, what: String(u.treatment || '').replace(/^Upsell · /, ''), client: u.client || '' };
  const total = r2(u.amount);
  const out = [];
  const cash = cashRule(u);
  const until = (C.until && C.until.get(u.employeeId)) || '';
  if (cash) {
    const due = C.dueByStart.get(u.incasareId);
    let pays;
    if (due) {
      // the money given back counts too (a negative part, its refund's day): what comes in after it can earn again, up to
      // the value (a 3.000 package, 1.000 paid and given back, then 3.000 paid: 4% of 3.000 in all)
      pays = (due.payments || []).filter((p) => Number(p.amount) !== 0).map((p) => {
        const s = C.byId.get(p.saleId);
        return { date: (s && s.date) || bucharestDay(p.at) || u.date, at: p.at || '', cash: r2(p.amount), back: Number(p.amount) < 0 };
      });
    } else {
      // paid whole at once (no rest, so no package was started): its payment's upsell part; the payment gone: nothing
      const paid = upsellPaidOf(u, C);
      const s = C.byId.get(u.incasareId);
      pays = paid > 0 ? [{ date: (s && s.date) || u.date, at: (s && s.createdAt) || '', cash: paid }] : [];
    }
    let sofar = 0;
    pays.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.at || '') < String(b.at || '') ? -1 : String(a.at || '') > String(b.at || '') ? 1 : 0)).forEach((p) => {
      if (p.back) { sofar = r2(Math.max(0, sofar + p.cash)); return; } // its line is the refund's own (below)
      const c = r2(Math.min(p.cash, Math.max(0, total - sofar))); // never more than the upsell's value
      if (!(c > 0)) return;
      sofar = r2(sofar + c);
      if (until && p.date > until) return; // came in after her last day: not hers
      out.push(Object.assign({ date: p.date, at: p.at || '', kind: 'pay', cash: c, lei: commissionOf(c), paidSoFar: sofar, total }, base));
    });
  } else {
    if (!(until && u.date > until)) out.push(Object.assign({ date: u.date, kind: 'whole', cash: total, lei: r2(u.status === 'approved' ? u.commission : u.commission || commissionOf(u.amount)), paidSoFar: total, total }, base));
  }
  (C.cuts.get(u.id) || []).forEach((c) => {
    if (c.kind === 'rest' && cash) return; // a rest never paid brought no commission under the cash rule
    if (until && c.r.date > until) return; // a refund after she left takes nothing off her
    out.push(Object.assign({ date: c.r.date, kind: c.kind, cash: -c.lei, lei: -commissionOf(c.lei), refundId: c.r.id, total, reason: c.r.reason || '' }, base));
  });
  return out;
}

// the rest still to come of an upsell under the cash rule (its package's rest, at most what is left of its value before
// the commission stops): { rest, lei } or null. Nothing comes to someone who left.
function toComeOf(u, C) {
  if (!cashRule(u) || u.status === 'rejected') return null;
  if (C.until && C.until.get(u.employeeId)) return null;
  const due = C.dueByStart.get(u.incasareId);
  if (!due) return null;
  const counted = r2(linesOf(u, C).filter((l) => l.kind === 'pay' || l.kind === 'refund').reduce((a, l) => a + l.cash, 0)); // net of what went back
  const rest = r2(Math.min(Math.max(0, Number(due.total) - Number(due.paid)), Math.max(0, r2(u.amount) - counted)));
  return rest > 0 ? { upsellId: u.id, what: String(u.treatment || '').replace(/^Upsell · /, ''), client: u.client || '', rest, lei: commissionOf(rest), paid: r2(due.paid), total: r2(due.total), status: u.status } : null;
}
// what a payment of `cash` lei toward the package of this upsell brings her now (the cap of toComeOf): lei
function nextPayLei(u, C, cash) {
  const t = toComeOf(u, C);
  return t ? commissionOf(Math.min(r2(cash), t.rest)) : 0;
}

// one person's commission in a month (from NEW_FROM; the months before keep payroll.js's own count)
function monthOfPerson(sales, dues, employeeId, month, isCurrent, C0) {
  const C = C0 || context(sales, dues);
  let commission = 0, waiting = 0, upsells = 0;
  const lines = [], toCome = [];
  (sales || []).forEach((u) => {
    if (!isUpsellReq(u) || u.employeeId !== employeeId || u.status === 'rejected') return;
    if (u.status === 'approved' && monthOf(u.date) === month) upsells += 1;
    linesOf(u, C).forEach((l) => {
      if (monthOf(l.date) !== month) return;
      if (u.status === 'approved') commission += l.lei; else waiting += l.lei;
      lines.push(l);
    });
    if (isCurrent) { const t = toComeOf(u, C); if (t) toCome.push(t); }
  });
  lines.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { commission: r2(commission), waiting: r2(waiting), upsells, lines, toCome };
}

// a commission request with what it has brought so far (Salariu, Aprobări): { rule, paid, total, lei, rest, restLei }
function summaryOf(u, C) {
  if (!isUpsellReq(u)) return null;
  const lines = linesOf(u, C);
  const t = toComeOf(u, C);
  const paid = r2(lines.filter((l) => l.kind === 'pay' || l.kind === 'whole').reduce((a, l) => a + l.cash, 0));
  const refunded = r2(-lines.filter((l) => l.kind === 'refund').reduce((a, l) => a + l.cash, 0));
  return { rule: cashRule(u) ? 'cash' : 'whole', paid, refunded, total: r2(u.amount), lei: r2(lines.reduce((a, l) => a + l.lei, 0)), rest: t ? t.rest : 0, restLei: t ? t.lei : 0 };
}

module.exports = { NEW_FROM, PACK, EXTRA, packTier, packMinOf, packDays, cashRule, context, linesOf, toComeOf, nextPayLei, monthOfPerson, summaryOf, isUpsellReq, upsellPaidOf };
