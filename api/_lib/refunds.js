// Rambursare (George, 16.11): money given back to a client, on a payment or on a package she pays in parts. The owner
// and the manager (only for her clinics) make one in Încasări; cosmeticians and reception cannot.
//
// A refund is a row of its own in data/sales.json: source 'incasare', kind 'refund', a negative amount, dated the day the
// money went back (from November 2026: October is closed). So every total that sums Încasări sees the real cash
// (_lib/money.js). The payment it came from stays as it was; Încasări marks it „rambursat parțial / integral”.
//
// Where the money comes out of, in this order: the package the payment paid into (its own upsell first, then an older
// package's rest it paid), then the session. A whole-package refund walks all the package's payments. Never more than was
// paid on it (minus what was already refunded).
//
// What it changes:
//   the package (_lib/dues.js): a negative part {saleId: the refund, amount: -lei} lowers what was paid, and its value goes
//     down by the same (the rest she owes stays). "Închide pachetul": the rest is cancelled too (nothing left to collect).
//   the commission (_lib/commission.js): 4% of the money taken out of an upsell comes off whoever earned it, in the
//     refund's month; one still waiting for approval simply waits for less.
// Undoing it (refund_undo) takes all of it back: the row goes, the package gets its part and its value back.
//
// The row: { id, source: 'incasare', kind: 'refund', refundOf, scope: 'payment' | 'package', dueId?, amount: -lei, date,
//   method, reason, from: [{ saleId, key, dueId, upsellId, lei }], dues: [{ dueId, lei, cut }], restCut: [{ dueId, upsellId,
//   lei }], whole, employeeId (who made it), performedBy, appointmentId, clientId, client, location, categories, treatment }

const crypto = require('crypto');
const D = require('./dues');
const M = require('./money');
const { commissionOf } = require('./cats');

const r2 = M.r2;
const FROM = '2026-11-01'; // October's salaries are paid: a refund is dated from November on
const upsellOf = (sales, saleId) => (sales || []).find((x) => x && x.source === 'comision' && x.incasareId === saleId && x.status !== 'rejected') || null;

// what one payment is made of, in the order a refund takes from it
function piecesOf(sale, sales, dues) {
  const out = [];
  const started = (dues || []).find((d) => d.saleId === sale.id);
  const own = upsellOf(sales, sale.id);
  if (started) {
    const p = (started.payments || []).find((x) => x.saleId === sale.id && Number(x.amount) > 0);
    if (p) out.push({ key: 'd:' + started.id, dueId: started.id, upsellId: own ? own.id : '', lei: r2(p.amount) });
  } else if (Number(sale.upsell) > 0) {
    const lei = sale.parts ? r2(sale.parts.upsell) : r2(Math.min(Number(sale.upsell), Number(sale.amount)));
    if (lei > 0) out.push({ key: 'u:' + sale.id, dueId: '', upsellId: own ? own.id : '', lei });
  }
  (dues || []).forEach((d) => {
    if (d === started) return;
    (d.payments || []).forEach((p) => {
      if (p.saleId !== sale.id || !(Number(p.amount) > 0)) return;
      const u = upsellOf(sales, d.saleId);
      out.push({ key: 'd:' + d.id, dueId: d.id, upsellId: u ? u.id : '', lei: r2(p.amount) });
    });
  });
  const used = out.reduce((a, x) => a + x.lei, 0);
  if (Number(sale.amount) - used > 0.005) out.push({ key: 's', dueId: '', upsellId: '', lei: r2(Number(sale.amount) - used) });
  return out;
}

// what was already refunded of a payment, by piece: { key: lei } and the total
function refundedOf(sales, saleId, except) {
  const by = {};
  let total = 0;
  (sales || []).forEach((r) => {
    if (!M.isRefund(r) || r.id === except) return;
    (r.from || []).forEach((p) => { if (p.saleId === saleId) { by[p.key] = r2((by[p.key] || 0) + p.lei); total += p.lei; } });
  });
  return { by, total: r2(total) };
}

// the plan of a refund, without writing anything: { error } or { sale, due, take: [...], lei, max, restCut, cuts, ... }
// b: { id (the payment), scope: 'payment' | 'package', dueId?, amount, close }
function plan(sales, dues, b) {
  const sale = (sales || []).find((s) => s && s.id === b.id && M.isPayment(s));
  if (!sale) return { error: 'entry_not_found', code: 404 };
  const pieces = piecesOf(sale, sales, dues);
  const pkgPieces = pieces.filter((p) => p.dueId);
  const scope = b.scope === 'package' ? 'package' : 'payment';
  let due = null, avail = [];
  if (scope === 'package') {
    const dueId = String(b.dueId || (pkgPieces[0] && pkgPieces[0].dueId) || '');
    due = (dues || []).find((d) => d.id === dueId) || null;
    if (!due || !pkgPieces.some((p) => p.dueId === due.id)) return { error: 'invalid_due', code: 400 };
    // every payment of the package, oldest first
    (due.payments || []).filter((p) => Number(p.amount) > 0).forEach((p) => {
      const s = (sales || []).find((x) => x.id === p.saleId);
      if (!s) return;
      const key = 'd:' + due.id;
      const left = r2(Number(p.amount) - (refundedOf(sales, s.id).by[key] || 0));
      if (left > 0) avail.push({ saleId: s.id, key, dueId: due.id, upsellId: (upsellOf(sales, due.saleId) || {}).id || '', lei: left, date: s.date });
    });
  } else {
    const done = refundedOf(sales, sale.id).by;
    avail = pieces.map((p) => Object.assign({ saleId: sale.id, date: sale.date }, p, { lei: r2(p.lei - (done[p.key] || 0)) })).filter((p) => p.lei > 0);
    const first = avail.find((p) => p.dueId);
    due = first ? (dues || []).find((d) => d.id === first.dueId) || null : null;
  }
  const max = r2(avail.reduce((a, p) => a + p.lei, 0));
  const lei = b.amount == null || b.amount === '' ? max : r2(b.amount);
  if (!(lei > 0)) return { error: 'invalid_amount', code: 400, max };
  if (lei > max + 0.005) return { error: 'over_paid', code: 400, max };
  let left = lei;
  const take = [];
  avail.forEach((p) => { if (left <= 0) return; const t = r2(Math.min(left, p.lei)); left = r2(left - t); take.push({ saleId: p.saleId, key: p.key, dueId: p.dueId || '', upsellId: p.upsellId || '', lei: t }); });
  const close = !!(b.close && due && D.rest(due) > 0);
  const restCut = close ? [{ dueId: due.id, upsellId: (upsellOf(sales, due.saleId) || {}).id || '', lei: r2(D.rest(due)) }] : [];
  // the commission that goes, per request (the cash rule: 4% of the money; an older upsell also its rest when closed)
  const CM = require('./commission');
  const byU = new Map();
  take.concat(restCut.map((x) => Object.assign({ rest: true }, x))).forEach((p) => {
    if (!p.upsellId) return;
    const u = (sales || []).find((x) => x.id === p.upsellId);
    if (!u || (p.rest && CM.cashRule(u))) return;
    const c = byU.get(u.id) || { upsellId: u.id, employeeId: u.employeeId, status: u.status, lei: 0, cash: 0 };
    c.cash = r2(c.cash + p.lei); c.lei = r2(c.lei + commissionOf(p.lei));
    byU.set(u.id, c);
  });
  const fromPkg = r2(take.filter((p) => p.dueId).reduce((a, p) => a + p.lei, 0));
  const total = refundedOf(sales, sale.id).total;
  return {
    sale, due, scope, lei, max, take, restCut, close, cuts: [...byU.values()],
    whole: scope === 'package' ? lei >= max - 0.005 : r2(total + lei) >= r2(sale.amount) - 0.005,
    fromPkg, fromSession: r2(lei - fromPkg),
    pkg: due ? { id: due.id, what: due.what, total: r2(due.total), paid: r2(due.paid), rest: D.rest(due) } : null,
  };
}

// writes it: the refund row (into the sales list given, the caller saves it) and the package's parts
async function apply(store, sales, p, b, session) {
  const sale = p.sale;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const dueCuts = new Map();
  p.take.forEach((t) => { if (t.dueId) dueCuts.set(t.dueId, r2((dueCuts.get(t.dueId) || 0) + t.lei)); });
  const duesOut = [...dueCuts.entries()].map(([dueId, lei]) => ({ dueId, lei, cut: r2(lei + (p.restCut.find((x) => x.dueId === dueId) || { lei: 0 }).lei) }));
  p.restCut.forEach((x) => { if (!dueCuts.has(x.dueId)) duesOut.push({ dueId: x.dueId, lei: 0, cut: x.lei }); });
  const method = ['card', 'cash', 'transfer'].includes(b.method) ? b.method : sale.method === 'cash_card' ? 'card' : sale.method || 'cash';
  const row = {
    id, source: 'incasare', kind: 'refund', refundOf: sale.id, scope: p.scope, ...(p.due && p.scope === 'package' ? { dueId: p.due.id } : {}),
    employeeId: session.employeeId, performedBy: sale.performedBy || '', appointmentId: sale.appointmentId || '', clientId: sale.clientId || '', client: sale.client || '',
    date: b.date, location: sale.location || '', categories: sale.categories || [], category: sale.category || '', treatment: 'Rambursare · ' + String((p.due && p.due.what) || sale.treatment || '').replace(/^Upsell · /, ''),
    amount: -p.lei, upsell: 0, method, split: null, status: 'recorded', commission: 0,
    reason: String(b.reason || '').trim().slice(0, 300), note: '', whole: p.whole,
    from: p.take, dues: duesOut, restCut: p.restCut, createdAt: now, decidedAt: null,
  };
  sales.push(row);
  // the packages: a negative part; the value goes down by it (and by the rest, when closed)
  if (duesOut.length) {
    const list = await store.readJSON(D.KEY, []);
    duesOut.forEach((x) => {
      const d = list.find((y) => y.id === x.dueId);
      if (!d) return;
      if (x.lei > 0) d.payments.push({ saleId: id, amount: -x.lei, at: now, refund: true });
      d.total = r2(Number(d.total) - x.cut);
      d.paid = r2((d.payments || []).reduce((a, q) => a + Number(q.amount || 0), 0));
      d.closedAt = D.rest(d) <= 0 ? d.closedAt || now : null;
    });
    await store.writeJSON(D.KEY, list);
  }
  return row;
}

// takes it back: the package gets its part and its value back (the caller drops the row and saves the sales)
async function undo(store, row) {
  if (!row || !(row.dues || []).length) return;
  const list = await store.readJSON(D.KEY, []);
  row.dues.forEach((x) => {
    const d = list.find((y) => y.id === x.dueId);
    if (!d) return;
    d.payments = (d.payments || []).filter((q) => q.saleId !== row.id);
    d.total = r2(Number(d.total) + Number(x.cut || 0));
    d.paid = r2(d.payments.reduce((a, q) => a + Number(q.amount || 0), 0));
    d.closedAt = D.rest(d) <= 0 ? d.closedAt || new Date().toISOString() : null;
  });
  await store.writeJSON(D.KEY, list);
}

module.exports = { FROM, piecesOf, refundedOf, plan, apply, undo };
