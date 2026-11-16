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
// The approval stays one per upsell (Aprobări). Approved: its lines count in their months, later payments included,
// without asking again. Waiting: its lines show as "în așteptare" in their months. Rejected: nothing.
//
// A line: { date, kind: 'pay' | 'whole' | 'refund' | 'rest', cash (lei of money), lei (commission, minus for a cut),
//   upsellId, status, what, client, paidSoFar, total, refundId? }

const { commissionOf } = require('./cats');
const M = require('./money');

const NEW_FROM = '2026-11';
const r2 = M.r2;
const monthOf = (d) => String(d || '').slice(0, 7);
const isUpsellReq = (s) => !!s && s.source !== 'incasare' && s.source !== 'manual';
const cashRule = (u) => !!u && u.origin === 'upsell' && !!u.incasareId && monthOf(u.date) >= NEW_FROM;
const bucharestDay = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t)) : ''; };

// what the lines are read from, once per request
function context(sales, dues) {
  const byId = new Map(), dueByStart = new Map(), cuts = new Map();
  (sales || []).forEach((s) => { if (s && s.id) byId.set(s.id, s); });
  (dues || []).forEach((d) => { if (d && d.saleId) dueByStart.set(d.saleId, d); });
  (sales || []).forEach((r) => {
    if (!M.isRefund(r)) return;
    (r.from || []).forEach((p) => { if (p.upsellId && p.lei > 0) (cuts.get(p.upsellId) || cuts.set(p.upsellId, []).get(p.upsellId)).push({ r, lei: p.lei, kind: 'refund' }); });
    (r.restCut || []).forEach((p) => { if (p.upsellId && p.lei > 0) (cuts.get(p.upsellId) || cuts.set(p.upsellId, []).get(p.upsellId)).push({ r, lei: p.lei, kind: 'rest' }); });
  });
  return { byId, dueByStart, cuts };
}

// every line of one commission request, whatever the month
function linesOf(u, C) {
  if (!isUpsellReq(u) || u.status === 'rejected') return [];
  const base = { upsellId: u.id, status: u.status, what: String(u.treatment || '').replace(/^Upsell · /, ''), client: u.client || '' };
  const total = r2(u.amount);
  const out = [];
  const cash = cashRule(u);
  if (cash) {
    const due = C.dueByStart.get(u.incasareId);
    const pays = due ? (due.payments || []).filter((p) => Number(p.amount) > 0).map((p) => {
      const s = C.byId.get(p.saleId);
      return { date: (s && s.date) || bucharestDay(p.at) || u.date, cash: r2(p.amount) };
    }) : [{ date: u.date, cash: total }];
    let sofar = 0;
    pays.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).forEach((p) => {
      const c = r2(Math.min(p.cash, Math.max(0, total - sofar))); // never more than the upsell's value
      if (!(c > 0)) return;
      sofar = r2(sofar + c);
      out.push(Object.assign({ date: p.date, kind: 'pay', cash: c, lei: commissionOf(c), paidSoFar: sofar, total }, base));
    });
  } else {
    out.push(Object.assign({ date: u.date, kind: 'whole', cash: total, lei: r2(u.status === 'approved' ? u.commission : u.commission || commissionOf(u.amount)), paidSoFar: total, total }, base));
  }
  (C.cuts.get(u.id) || []).forEach((c) => {
    if (c.kind === 'rest' && cash) return; // a rest never paid brought no commission under the cash rule
    out.push(Object.assign({ date: c.r.date, kind: c.kind, cash: -c.lei, lei: -commissionOf(c.lei), refundId: c.r.id, total, reason: c.r.reason || '' }, base));
  });
  return out;
}

// the rest still to come of an upsell under the cash rule (its package's rest): { rest, lei } or null
function toComeOf(u, C) {
  if (!cashRule(u) || u.status === 'rejected') return null;
  const due = C.dueByStart.get(u.incasareId);
  if (!due) return null;
  const rest = r2(Math.max(0, Number(due.total) - Number(due.paid)));
  return rest > 0 ? { upsellId: u.id, what: String(u.treatment || '').replace(/^Upsell · /, ''), client: u.client || '', rest, lei: commissionOf(rest), paid: r2(due.paid), total: r2(due.total), status: u.status } : null;
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

module.exports = { NEW_FROM, cashRule, context, linesOf, toComeOf, monthOfPerson, summaryOf, isUpsellReq };
