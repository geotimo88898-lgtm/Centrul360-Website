// The money that came in, in one place (16.11). Încasări holds every payment (source 'incasare'); a refund (Rambursare,
// api/_lib/refunds.js) is a row of its own there, with a negative amount, dated the day the money went back. So "net
// collected" is simply the sum of those rows, and every screen (Încasări, Panou, KPI, Cheltuieli, the manager's pay and
// bonus, the 1.500 rule, the weekly report) reads it through net(): none computes it differently.
//   isPayment(s)   a payment (counted as a visit, a day worked, a ticket)
//   isRefund(s)    a refund row (money out; never a visit or a day worked)
//   net(rows, keep)        payments minus refunds (keep: an optional filter)
//   refundsOf(rows, keep)  { gross, lei, count, net, pct }: what was refunded, and its share of what came in (gross)

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isMoney = (s) => !!s && s.source === 'incasare';
const isRefund = (s) => isMoney(s) && s.kind === 'refund';
const isPayment = (s) => isMoney(s) && s.kind !== 'refund';

function net(rows, keep) {
  let t = 0;
  (rows || []).forEach((s) => { if (isMoney(s) && (!keep || keep(s))) t += Number(s.amount) || 0; });
  return r2(t);
}

function refundsOf(rows, keep) {
  let gross = 0, lei = 0, count = 0;
  (rows || []).forEach((s) => {
    if (!isMoney(s) || (keep && !keep(s))) return;
    if (isRefund(s)) { lei += -(Number(s.amount) || 0); count += 1; } else gross += Number(s.amount) || 0;
  });
  return { gross: r2(gross), lei: r2(lei), count, net: r2(gross - lei), pct: gross > 0 ? Math.round((lei / gross) * 1000) / 10 : 0 };
}

module.exports = { r2, isMoney, isRefund, isPayment, net, refundsOf };
