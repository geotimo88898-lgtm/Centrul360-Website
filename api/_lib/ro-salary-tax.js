// The taxes on a salary paid to the state (the owner, 16.11: „taxele la stat din salarii le poți calcula și tu”), the 25th of
// the month after. Used by Cheltuieli → Plăți (api/_lib/expenses.js) for the row „Taxe la stat (salarii)”, never as the
// final figure: the accountant's sum typed in Variabile („Din salarii”) or on the row replaces it.
//
// THE RATES, one block to update every year. 2026, from the Codul fiscal (Legea 227/2015, consolidated):
//   art. 138  CAS (pension), the employee: 25% of the gross
//   art. 156  CASS (health), the employee: 10% of the gross
//   art. 64   income tax: 10% of (gross - CAS - CASS - deducerea personală)
//   art. 77   deducerea personală de bază: for a gross up to the minimum wage + 2.000 lei; up to the minimum wage a share
//             of the minimum wage by dependants (20%, 25%, 30%, 35%, 45% for 0..4+), 0,5 points less for every 50 lei
//             (or part of them) above it; rounded to the leu
//   art. 220^3 CAM (work insurance), the employer: 2,25% of the gross
//   O.U.G. 89/2025 (art. III): the sum not taxed at the minimum wage: 300 lei for January to June 2026 (gross up to 4.300),
//             200 lei for July to December 2026 (gross up to 4.600), when the base salary in the contract is the minimum
//             wage, full time at the main job; no tax and no contributions on it (CAM included, as for 2024 and 2025)
//   H.G. 146/2025 and the one for July: the minimum gross wage 4.050 lei, 4.325 lei from 1 July 2026
// Not known here, so left out: the extra deduction for those under 26 or with children in school, part-time contracts,
// days not worked. Every sum rounded to the leu.
const RATES = {
  year: 2026,
  cas: 0.25, cass: 0.10, tax: 0.10, cam: 0.0225,
  minWage: [{ from: '2026-01', lei: 4050 }, { from: '2026-07', lei: 4325 }],
  untaxed: [{ from: '2026-01', lei: 300, upTo: 4300 }, { from: '2026-07', lei: 200, upTo: 4600 }],
  deduction: { over: 2000, step: 50, less: 0.005, share: [0.20, 0.25, 0.30, 0.35, 0.45] },
};

const lei = (n) => Math.round(Number(n) || 0);
const atMonth = (list, month) => list.filter((x) => x.from <= month).pop() || list[0];
const minWageOf = (month) => atMonth(RATES.minWage, month).lei;

// deducerea personală de bază for a gross in a month (art. 77)
function deductionOf(gross, month, dependants) {
  const min = minWageOf(month), d = RATES.deduction;
  if (gross > min + d.over) return 0;
  const share0 = d.share[Math.max(0, Math.min(d.share.length - 1, Math.round(Number(dependants) || 0)))];
  const steps = gross <= min ? 0 : Math.ceil((gross - min) / d.step);
  const share = share0 - steps * d.less;
  return share > 0 ? lei(share * min) : 0;
}
// a month's gross salary → what the employee and the employer owe; baseGross: the base salary in the contract (the sum
// not taxed only when it is the minimum wage); dependants: 0 unless known
function fromGross(gross, month, opts) {
  const o = opts || {};
  const g = lei(gross), base = o.baseGross != null ? lei(o.baseGross) : g;
  const u = atMonth(RATES.untaxed, month);
  const untaxed = base === minWageOf(month) && g <= u.upTo ? u.lei : 0;
  const G = g - untaxed;
  const cas = lei(G * RATES.cas), cass = lei(G * RATES.cass);
  const ded = deductionOf(g, month, o.dependants);
  const tax = lei(Math.max(0, G - cas - cass - ded) * RATES.tax);
  const cam = lei(G * RATES.cam);
  return { gross: g, untaxed, cas, cass, deduction: ded, tax, cam, net: g - cas - cass - tax, state: cas + cass + tax + cam };
}
// the gross that gives a net (the smallest one, by halving). The sum not taxed makes the net jump at the minimum wage, so
// the two cases are searched apart: the base salary itself at the minimum wage (its net matched to the leu), or, with a
// base at the minimum wage (baseGross), a gross up to the ceiling with the sum not taxed; else without it
function grossFromNet(net, month, opts) {
  const want = lei(net);
  if (!(want > 0)) return 0;
  const o = opts || {}, min = minWageOf(month), u = atMonth(RATES.untaxed, month);
  const no = (g) => fromGross(g, month, { baseGross: -1, dependants: o.dependants }).net;
  const fac = (g) => fromGross(g, month, { baseGross: min, dependants: o.dependants }).net;
  const search = (fn, lo, hi) => { while (fn(hi) < want) hi *= 2; while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (fn(mid) >= want) hi = mid; else lo = mid + 1; } return lo; };
  if (o.baseGross == null) { if (Math.abs(fac(min) - want) <= 1) return min; }
  else if (lei(o.baseGross) === min && want <= fac(u.upTo)) return Math.max(min, search(fac, min, u.upTo));
  return search(no, want, want * 3 + 1000);
}
// one person's month: the base net (her card in Echipa) and what came on top (overtime, commission, bonuses: salary
// income too, art. 76); her gross when it is stored (grossSalary), else worked out from the net
function personMonth({ baseNet, extraNet, month, grossStored, dependants }) {
  const baseGross = Number(grossStored) > 0 ? lei(grossStored) : grossFromNet(baseNet, month, { dependants });
  const totalNet = lei((Number(baseNet) || 0) + (Number(extraNet) || 0));
  const gross = Number(extraNet) > 0 ? Math.max(baseGross, grossFromNet(totalNet, month, { baseGross, dependants })) : baseGross;
  return Object.assign(fromGross(gross, month, { baseGross, dependants }), { baseGross, derived: !(Number(grossStored) > 0) });
}

module.exports = { RATES, minWageOf, deductionOf, fromGross, grossFromNet, personMonth };
