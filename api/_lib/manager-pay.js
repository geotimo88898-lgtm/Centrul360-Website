// The manager's pay (her signed job description, the owner 15.11):
//   base      the net salary the owner sets in Echipa. The first 30 days after she became manager are the probation;
//             the salary after it is a second number on her record (netSalaryAfter). Nothing changes by itself: the
//             owner changes netSalary, and Echipa reminds him once the probation is over.
//   bonus     5% of the month's profit of the clinics she runs, paid only in a month when every cosmetician of those
//             clinics (the ones who finished the official training) collects more than 1.500 lei a day worked.
//             collected = what Încasări credits to her (who did the treatment); days worked = the days she clocked in,
//             plus the days she has collections without a clock-in (the same rule as the Manager page)
//   profit    the clinics' collections minus the month's costs (Costuri lunare, typed by the owner: no figure is ever
//             in this code). Fixed lines by name only; the rents in EUR at the month's rate; the ads read from Meta,
//             the commissions and the overtime from Salariu (each can be overwritten by the owner).
//   final     the owner closes the month: the bonus he confirms is what she is paid (payroll.js counts it).
//
// Documents: data/month-costs.json { v, months: { 'YYYY-MM': entry } } (admin only, never sent to anyone else)
//            data/manager-bonus.json { '<employeeId>|YYYY-MM': { lei, at, by } }

const PAY = require('./payroll');
const TB = require('./timebank');

const RATE = 0.05;          // of the month's profit
const MIN_PER_DAY = 1500;   // lei collected per day worked, every trained cosmetician, more than this
const PROBATION_DAYS = 30;
const COSTS_KEY = 'data/month-costs.json';
const FINAL_KEY = 'data/manager-bonus.json';
const CLINICS = ['Timișoara', 'Arad'];

// the lines of the month, by name only (the owner types the amounts)
const LINES = [
  { key: 'credits', label: 'Credite', kind: 'fixed' },
  { key: 'rentTm', label: 'Chirie Timișoara', kind: 'fixed', eur: true, city: 'Timișoara' },
  { key: 'rentAr', label: 'Chirie Arad', kind: 'fixed', eur: true, city: 'Arad' },
  { key: 'laser', label: 'Rata aparatului laser', kind: 'fixed' },
  { key: 'accounting', label: 'Contabilitate', kind: 'fixed' },
  { key: 'salaries', label: 'Salarii brute', kind: 'fixed' },
  { key: 'claude', label: 'Claude', kind: 'fixed' },
  { key: 'ads', label: 'Reclame Meta', kind: 'var', auto: 'Meta' },
  // rec: the sum of the month's records in Plăți și cheltuieli (api/_lib/expenses.js), plus what was typed here before
  { key: 'taxes', label: 'Taxe la stat (TVA, contribuții, impozite)', kind: 'var', rec: true },
  { key: 'utilities', label: 'Utilități', kind: 'var', rec: true },
  { key: 'consumables', label: 'Consumabile', kind: 'var', rec: true },
  { key: 'commissions', label: 'Comisioane și bonusuri', kind: 'var', auto: 'Salariu' },
  { key: 'overtime', label: 'Ore suplimentare', kind: 'var', auto: 'Salariu' },
  // read from Meta's WhatsApp pricing (api/_lib/wa-cost.js, the owner 16.11); a month typed before keeps its sum
  { key: 'whatsapp', label: 'Mesaje WhatsApp', kind: 'var', auto: 'Meta WhatsApp' },
  { key: 'other', label: 'Alte cheltuieli neprevăzute', kind: 'var', rec: true },
];
const LINE = Object.fromEntries(LINES.map((l) => [l.key, l]));

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const lastDay = (m) => m + '-' + String(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate()).padStart(2, '0');
const prevMonth = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 2, 1)).toISOString().slice(0, 7);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
// a money field: a number of at least 0, or null (not typed)
const amount = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n >= 0 && n < 1e8 ? r2(n) : null; };
// the clinic of a row, whatever the spelling
const clinicOf = (s) => (/arad/i.test(String(s || '')) ? 'Arad' : /timi/i.test(String(s || '')) ? 'Timișoara' : '');
const managesOf = (e) => require('./roles').managesOf(e);

// ------------------------------------------------------------------ the costs document
function cleanEntry(x) {
  x = x && typeof x === 'object' ? x : {};
  const lines = {}, over = {};
  LINES.forEach((l) => {
    if (!l.auto) lines[l.key] = amount(x.lines && x.lines[l.key]);
    else over[l.key] = amount(x.over && x.over[l.key]);
  });
  // WhatsApp was a typed line before it was read from Meta: a month typed then keeps its sum, as the owner's override
  if (over.whatsapp == null && x.lines && amount(x.lines.whatsapp) != null) over.whatsapp = amount(x.lines.whatsapp);
  const p = x.proposal && typeof x.proposal === 'object' ? x.proposal : null;
  return {
    eurRate: amount(x.eurRate), lines, over, savedAt: x.savedAt || '', savedBy: x.savedBy || '',
    adsAuto: x.adsAuto && Number.isFinite(Number(x.adsAuto.lei)) ? { lei: r2(x.adsAuto.lei), at: x.adsAuto.at || '' } : null,
    waAuto: x.waAuto && Number.isFinite(Number(x.waAuto.lei)) ? { lei: r2(x.waAuto.lei), at: x.waAuto.at || '', byCity: x.waAuto.byCity && typeof x.waAuto.byCity === 'object' ? x.waAuto.byCity : null } : null,
    proposal: p ? { consumables: amount(p.consumables), other: amount(p.other), note: String(p.note || '').slice(0, 500), at: p.at || '', by: p.by || '', byName: p.byName || '', status: ['pending', 'accepted', 'declined'].includes(p.status) ? p.status : 'pending', decidedAt: p.decidedAt || '' } : null,
  };
}
async function loadCosts(readJSON) {
  const d = await readJSON(COSTS_KEY, null);
  return { v: 1, months: d && d.months && typeof d.months === 'object' ? d.months : {} };
}

// ------------------------------------------------------------------ what the month brings in and what it costs
// the collections of her clinics: every payment recorded in Încasări, in the month, up to a day
function collectionsOf(sales, appts, emps, clinics, month, upto) {
  const home = new Map((emps || []).map((e) => [e.id, clinicOf(e && e.location)]));
  const apptCity = new Map((appts || []).filter(Boolean).map((a) => [a.id, clinicOf(a.location)]));
  const all = CLINICS.every((c) => clinics.includes(c));
  let total = 0;
  (sales || []).forEach((s) => {
    if (!s || s.source !== 'incasare' || String(s.date).slice(0, 7) !== month || (upto && s.date > upto)) return;
    const c = clinicOf(s.location) || (s.appointmentId && apptCity.get(s.appointmentId)) || home.get(s.performedBy) || '';
    if (c ? clinics.includes(c) : all) total += Number(s.amount) || 0;
  });
  return r2(total);
}

// the condition: every trained cosmetician of her clinics over 1.500 lei a day worked
function conditionOf(emps, sales, attendance, clinics, month, upto) {
  const from = month + '-01', to = upto && upto < lastDay(month) ? upto : lastDay(month);
  const people = [], training = [];
  // someone who left is out from the month she left (_lib/left.js); her payments still count in the clinic's money
  (emps || []).filter((e) => e && e.role === 'cosmetician' && clinics.includes(clinicOf(e.location)) && !require('./left').outOfMonth(e, month)).forEach((e) => {
    const mine = (sales || []).filter((s) => s && s.source === 'incasare' && s.performedBy === e.id && s.date >= from && s.date <= to);
    const collected = r2(mine.reduce((a, s) => a + (Number(s.amount) || 0), 0));
    const punched = new Set((attendance || []).filter((x) => x && x.employeeId === e.id && x.checkIn && x.date >= from && x.date <= to).map((x) => x.date));
    mine.forEach((s) => punched.add(s.date)); // a day with collections and no clock-in counts as worked
    const days = punched.size;
    if (e.active === false && !days) return; // she left before this month
    const row = { id: e.id, name: e.name || '', location: clinicOf(e.location), collected, days, perDay: days ? Math.round(collected / days) : 0, ok: days > 0 && collected / days > MIN_PER_DAY };
    if (e.trainedOfficial === false) training.push({ id: e.id, name: row.name, location: row.location });
    else people.push(row);
  });
  const counted = people.filter((p) => p.days > 0);
  people.sort((a, b) => b.perDay - a.perDay);
  return { min: MIN_PER_DAY, people, training, ok: counted.length > 0 && counted.every((p) => p.ok) };
}

// what Salariu already knows for the month: the commissions and bonuses, the overtime of the people of her clinics
async function payrollAutos(ctx, clinics, month, isCurrent) {
  let commissions = 0, overtime = 0;
  (ctx.employees || []).filter((e) => e && e.id !== 'admin' && e.role !== 'admin').forEach((e) => {
    const mine = e.role === 'manager' ? managesOf(e).some((c) => clinics.includes(c)) : clinics.includes(clinicOf(e.location));
    if (!mine) return;
    const p = PAY.monthPay({ emp: e, month, isCurrent, sales: ctx.sales, payouts: ctx.tbAll.payouts || [], bank: isCurrent ? TB.ledger(e.id, ctx.tbAll) : null, attendance: ctx.attendance, appointments: ctx.appointments });
    commissions += (Number(p.commission) || 0) + (Number(p.bonus) || 0) + (Number(p.manual) || 0);
    overtime += Number(p.overtimeLei) || 0;
  });
  return { commissions: r2(commissions), overtime: r2(overtime) };
}

// Meta's spend for the month on her clinics' campaigns (TM / AR in the name; the rest shared), kept a few hours
async function adsOf(readJSON, clinics, month, day, opts) {
  try {
    const conn = await require('./facebook').loadConnection(readJSON);
    if (!conn || !conn.userToken || !conn.adAccountId) return null;
    const since = month + '-01', until = day < lastDay(month) ? day : lastDay(month);
    if (since > until) return opts && opts.detail ? { lei: 0, at: '' } : 0;
    const current = day <= lastDay(month);
    const r = await require('./ads-cache').cached('mgr-spend-' + month, current ? 3 * 3600e3 : 24 * 3600e3,
      () => require('./meta-ads').adSpend(conn, 'custom', { since, until }), { keep: true });
    if (!r || r.error || !Array.isArray(r.rows)) return null;
    const all = CLINICS.every((c) => clinics.includes(c));
    let lei = 0;
    r.rows.forEach((x) => {
      if (all) { lei += x.spend; return; }
      const n = String(x.campaignName || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
      const c = /(^|[^A-Z])(TM|TIMI)/.test(n) ? 'Timișoara' : /(^|[^A-Z])(AR|ARAD)([^A-Z]|$)/.test(n) ? 'Arad' : '';
      lei += c ? (clinics.includes(c) ? x.spend : 0) : x.spend * clinics.length / CLINICS.length;
    });
    // detail: when Meta was read (the owner sees „din Meta, actualizat la …”)
    return opts && opts.detail ? { lei: r2(lei), at: r.readAt ? new Date(r.readAt).toISOString() : '', stale: !!r.stale } : r2(lei);
  } catch (e) { return null; }
}

// the WhatsApp messages of her clinics this month, from Meta (api/_lib/wa-cost.js): { lei, at, stale } or { error }
async function waOf(readJSON, clinics, month, day) {
  try {
    const r = await require('./wa-cost').monthCost(readJSON, month, day);
    if (!r || r.error) return { error: (r && r.error) || 'Meta nu a răspuns' };
    const all = CLINICS.every((c) => clinics.includes(c));
    const lei = all ? r.lei : r2(clinics.reduce((a, c) => a + (Number(r.byCity && r.byCity[c]) || 0), 0));
    return { lei, byCity: r.byCity || {}, at: r.readAt ? new Date(r.readAt).toISOString() : '', stale: !!r.stale, staleWhy: r.staleWhy || '', none: !!r.none };
  } catch (e) { return { error: e.message }; }
}

// every line of the month, in lei, with where it comes from; filled = the owner saved the month and nothing is missing.
// recs: what the records of Plăți și cheltuieli add per line (api/_lib/expenses.js recCosts)
function costsOf(entry, autos, clinics, recs) {
  const rows = LINES.filter((l) => !l.city || clinics.includes(l.city)).map((l) => {
    if (l.rec) {
      const t = entry.lines[l.key], r = Number(recs && recs[l.key]) || 0;
      return { key: l.key, label: l.label, kind: l.kind, rec: true, lei: r2((t || 0) + r), typed: t, recLei: r, source: r ? 'records' : t != null ? 'typed' : 'empty' };
    }
    if (l.auto) {
      const o = entry.over[l.key], a = autos[l.key];
      return { key: l.key, label: l.label, kind: l.kind, auto: l.auto, lei: o != null ? o : a != null ? a : null, autoLei: a != null ? a : null, source: o != null ? 'manual' : a != null ? 'auto' : 'missing' };
    }
    const t = entry.lines[l.key];
    if (l.eur) return { key: l.key, label: l.label, kind: l.kind, eur: t, lei: t != null && entry.eurRate ? r2(t * entry.eurRate) : t === 0 ? 0 : null, source: t == null ? 'missing' : 'typed' };
    return { key: l.key, label: l.label, kind: l.kind, lei: t != null ? t : l.kind === 'var' ? 0 : null, source: t == null ? (l.kind === 'var' ? 'empty' : 'missing') : 'typed' };
  });
  const missing = rows.filter((r) => r.lei == null).map((r) => r.key);
  const sum = (k) => r2(rows.filter((r) => !k || r.kind === k).reduce((a, r) => a + (Number(r.lei) || 0), 0));
  return { rows, missing, fixed: sum('fixed'), variable: sum('var'), total: sum(), filled: !!entry.savedAt && !missing.length };
}

// ------------------------------------------------------------------ the manager's month
const probationOf = (emp, day) => {
  const since = isDay(emp && emp.roleSince) ? emp.roleSince : '';
  if (!since) return null;
  const end = addDay(since, PROBATION_DAYS);
  const after = Number(emp.netSalaryAfter) > 0 ? Number(emp.netSalaryAfter) : null;
  const base = Number(emp.netSalary) || 0;
  const over = day >= end;
  // the owner is reminded: the probation is over and the salary is still the probation's (or was never changed since)
  const remind = over && (after ? base < after : !(String(emp.netSalaryChangedAt || '') >= end));
  return { since, end, inProbation: !over, after, base, remind };
};
// the months she is a manager in (her record's roleSince; an older record: the current month only)
const managerFrom = (emp) => (isDay(emp && emp.roleSince) ? emp.roleSince.slice(0, 7) : '');

async function loadCtx(readJSON) {
  const { writeJSON } = require('./store');
  const [employees, sales, attendance, appointments, tbAll, costs, finals, eur, exp] = await Promise.all([
    readJSON('data/employees.json', []), readJSON('data/sales.json', []), readJSON('data/attendance.json', []), readJSON('data/appointments.json', []),
    TB.loadAll(readJSON), loadCosts(readJSON), readJSON(FINAL_KEY, {}), require('./eur-rate').eurToday(readJSON, writeJSON).catch(() => null),
    require('./expenses').loadDoc(readJSON),
  ]);
  return { employees, sales, attendance, appointments, tbAll, costs, finals: finals && typeof finals === 'object' ? finals : {}, eur, exp };
}
// the rents in euro always at today's BNR rate (the owner, 16.11); the rate saved with the month only when the BNR
// was never reached
function withEur(entry, eur) {
  if (eur && eur.rate) { entry.eurRate = eur.rate; entry.eurFrom = { source: 'bnr', bank: eur.source || 'BNR', date: eur.date }; }
  else if (entry.eurRate) entry.eurFrom = { source: 'saved' };
  return entry;
}

// one month of a manager: the condition, the profit and the bonus "if the month closed today" (the current month: up to
// today; a past month: all of it), the final bonus when the owner set it. full: the costs and the collections (admin)
async function monthOf(readJSON, ctx, emp, month, opts) {
  const day = today(), isCurrent = month === day.slice(0, 7);
  const upto = isCurrent ? day : lastDay(month);
  const clinics = managesOf(emp);
  const entry = withEur(cleanEntry(ctx.costs.months[month]), ctx.eur);
  const condition = conditionOf(ctx.employees, ctx.sales, ctx.attendance, clinics, month, upto);
  const fin = ctx.finals[emp.id + '|' + month];
  const final = fin && Number.isFinite(Number(fin.lei)) ? { lei: r2(fin.lei), at: fin.at || '' } : null;
  // the expensive parts (Meta, the payroll) only where they are used: the owner's view, or a month he has saved
  const need = (opts && opts.full) || !!entry.savedAt;
  let costs = null, collections = null, profit = null;
  if (need) {
    const autos = await payrollAutos(ctx, clinics, month, isCurrent);
    autos.ads = entry.over.ads != null ? null : await adsOf(readJSON, clinics, month, day);
    if (autos.ads == null && entry.adsAuto) autos.ads = entry.adsAuto.lei; // Meta can't be read now: what it said when the month was saved
    const wa = entry.over.whatsapp != null ? null : await waOf(readJSON, clinics, month, day);
    autos.whatsapp = wa && !wa.error ? wa.lei : null;
    if (autos.whatsapp == null && entry.waAuto) autos.whatsapp = CLINICS.every((c) => clinics.includes(c)) || !entry.waAuto.byCity ? entry.waAuto.lei : r2(clinics.reduce((a, c) => a + (Number(entry.waAuto.byCity[c]) || 0), 0));
    costs = costsOf(entry, autos, clinics, require('./expenses').recCosts(ctx.exp, month));
    collections = collectionsOf(ctx.sales, ctx.appointments, ctx.employees, clinics, month, upto);
    profit = r2(collections - costs.total);
  }
  const filled = !!(costs && costs.filled);
  const potential = filled ? Math.round(Math.max(0, profit) * RATE) : null;
  const out = {
    month, current: isCurrent, clinics, rate: RATE, condition, filled, final,
    estimate: filled ? { profit, bonus: condition.ok ? potential : 0, potential } : null,
  };
  if (opts && opts.full) Object.assign(out, { costs, collections, profit, entry: { eurRate: entry.eurRate, eurFrom: entry.eurFrom, savedAt: entry.savedAt, proposal: entry.proposal } });
  else out.proposal = entry.proposal ? { consumables: entry.proposal.consumables, other: entry.proposal.other, note: entry.proposal.note, at: entry.proposal.at, status: entry.proposal.status } : null;
  return out;
}

// her Salariu: the month asked, the months since she became manager (6 at most), the probation
async function view(readJSON, empId, month, opts) {
  const ctx = await loadCtx(readJSON);
  const emp = ctx.employees.find((e) => e && e.id === empId && e.role === 'manager');
  if (!emp) return null;
  const day = today(), cur = day.slice(0, 7);
  const m = isMonth(month) && month <= cur ? month : cur;
  const from = managerFrom(emp) || cur;
  const months = [];
  for (let x = cur; x >= from && months.length < 6; x = prevMonth(x)) months.push(x);
  const main = await monthOf(readJSON, ctx, emp, m, opts);
  const history = [];
  for (const x of months) {
    const r = x === m ? main : await monthOf(readJSON, ctx, emp, x, null);
    history.push({ month: x, final: r.final, estimate: r.estimate ? r.estimate.bonus : null, ok: r.condition.ok, filled: r.filled });
  }
  return { ok: true, name: emp.name, managerFrom: from, month: main, history, probation: probationOf(emp, day), rule: { rate: RATE, min: MIN_PER_DAY, probationDays: PROBATION_DAYS } };
}

module.exports = { waOf, withEur, RATE, MIN_PER_DAY, PROBATION_DAYS, COSTS_KEY, FINAL_KEY, LINES, LINE, cleanEntry, loadCosts, loadCtx, collectionsOf, conditionOf, payrollAutos, adsOf, costsOf, monthOf, view, probationOf, managerFrom, amount, isMonth, prevMonth, lastDay, today, clinicOf };
