// Plăți și cheltuieli (the owner, 16.11): the month's payments with their day and a „Plătit” tick, and the variable
// expenses kept as records. Owner only: never sent to the manager (api/portal-plati.js checks it on every call), the
// days of the month included („datele exacte sunt doar pentru admin”).
//
// The payments of a month M (the days live here, on the server, never in the page):
//   Salarii nete      one row per person, her pay for M-1 (Salariu: salary + overtime + commission + bonuses), on her
//                     „Ziua salariului” (Echipa → her card, payDay; 15 when not set)
//   Taxe la stat      the 25th, the sum of the month's records under Taxe la stat (typed by the owner)
//   Credite           the 30th (the last day in a shorter month)          } the amounts: Costuri lunare of M (the
//   Rata laser        the 15th                                              } last month that has them while M isn't
//   Claude            the 6th                                               } saved yet, marked)
//   Chirii, Contabilitate   no fixed day
// The records (no deadline): Taxe la stat, Utilități, Consumabile, Alte cheltuieli, several entries a month each, summed
// into the month's costs (api/_lib/manager-pay.js costsOf), so into the profit and the manager's bonus. Taxes paid on the
// salaries (kind 'salarii') are left out of the profit: the gross salaries line already has them.
//
// data/expense-tracker.json { v: 1, months: { 'YYYY-MM': { paid: { rowKey: { at, by, byName, lei, note } },
//                                                          rec: { line: [{ id, date, lei, note, kind, at, by }] } } } }
// data/expense-alerts.json  { day, sent: { 'YYYY-MM|rowKey|due|late': at } }

const crypto = require('crypto');

const KEY = 'data/expense-tracker.json';
const ALERTS = 'data/expense-alerts.json';
const PAYDAY = 15;
const REC = [
  { key: 'taxes', label: 'Taxe la stat', hint: 'TVA, contribuții, impozite', kinds: [['tva', 'TVA'], ['salarii', 'Din salarii'], ['alte', 'Alte taxe']] },
  { key: 'utilities', label: 'Utilități', hint: 'curent, apă, gaz, internet' },
  { key: 'consumables', label: 'Consumabile' },
  { key: 'other', label: 'Alte cheltuieli neprevăzute' },
];
const REC_KEYS = REC.map((r) => r.key);
// the fixed payments: their line in Costuri lunare and their day (null: no fixed day)
const FIXED = [
  { key: 'credits', label: 'Credite', day: 30 },
  { key: 'laser', label: 'Rata aparatului laser', day: 15 },
  { key: 'claude', label: 'Claude', day: 6 },
  { key: 'rentTm', label: 'Chirie Timișoara', day: null, eur: true },
  { key: 'rentAr', label: 'Chirie Arad', day: null, eur: true },
  { key: 'accounting', label: 'Contabilitate', day: null },
];
const TAX_DAY = 25;
const FIRST = '2026-11'; // the first month of the tracker
const ALERT_FROM = '2026-11-17'; // the payments due before the tracker existed don't ring

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const daysIn = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
const dayOf = (m, d) => m + '-' + String(Math.min(Math.max(1, d), daysIn(m))).padStart(2, '0');
const prevMonth = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 2, 1)).toISOString().slice(0, 7);
const nextMonth = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString().slice(0, 7);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const roHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hour12: false }).format(new Date()));
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const MON = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const monthName = (m) => MON[+m.slice(5, 7) - 1];
const payDayOf = (e) => { const n = Math.round(Number(e && e.payDay)); return n >= 1 && n <= 31 ? n : PAYDAY; };

// ------------------------------------------------------------------ the document
async function loadDoc(readJSON) {
  const d = await readJSON(KEY, null);
  return { v: 1, months: d && d.months && typeof d.months === 'object' ? d.months : {} };
}
function monthOf(doc, m) {
  const x = doc && doc.months && doc.months[m] && typeof doc.months[m] === 'object' ? doc.months[m] : {};
  const rec = {};
  REC_KEYS.forEach((k) => { rec[k] = Array.isArray(x.rec && x.rec[k]) ? x.rec[k].filter((e) => e && Number.isFinite(Number(e.lei))) : []; });
  return { paid: x.paid && typeof x.paid === 'object' ? x.paid : {}, rec };
}
// what the records add to a month's costs, per line (the taxes on the salaries left out: they are in the gross salaries)
function recCosts(doc, m) {
  const x = monthOf(doc, m), out = {};
  REC_KEYS.forEach((k) => { out[k] = r2(x.rec[k].filter((e) => !(k === 'taxes' && e.kind === 'salarii')).reduce((a, e) => a + Number(e.lei), 0)); });
  return out;
}
const recSum = (list) => r2((list || []).reduce((a, e) => a + Number(e.lei), 0));
const newEntry = (b, by) => ({ id: crypto.randomUUID().slice(0, 12), date: b.date, lei: b.lei, note: b.note || '', kind: b.kind || '', at: new Date().toISOString(), by });

// ------------------------------------------------------------------ the payments of a month
// ctx: api/_lib/manager-pay.js loadCtx (employees, sales, payroll documents, the costs, the euro) plus ctx.exp (loadDoc)
function tracker(ctx, month) {
  const MP = require('./manager-pay');
  const PAY = require('./payroll');
  const TB = require('./timebank');
  const day = today(), cur = day.slice(0, 7);
  const mine = monthOf(ctx.exp, month);
  const rows = [];
  // the state of a row with a date: paid, late, today / soon (3 days), later; none: no fixed day
  const stateOf = (due, paid) => {
    if (paid) return 'paid';
    if (!due) return month < cur ? 'late' : 'nodate';
    const left = daysBetween(day, due);
    return left < 0 ? 'late' : left === 0 ? 'today' : left <= 3 ? 'soon' : 'later';
  };
  const push = (r) => { const p = mine.paid[r.key] || null; rows.push(Object.assign(r, { paid: p, state: stateOf(r.due, p), left: r.due ? daysBetween(day, r.due) : null })); };

  // Salarii nete: the pay of the month before, one row per person
  const pm = prevMonth(month), pmCurrent = pm === cur;
  (ctx.employees || []).filter((e) => e && e.id !== 'admin' && e.role !== 'admin').forEach((e) => {
    const p = PAY.monthPay({ emp: e, month: pm, isCurrent: pmCurrent, sales: ctx.sales, payouts: (ctx.tbAll && ctx.tbAll.payouts) || [], bank: pmCurrent ? TB.ledger(e.id, ctx.tbAll) : null, attendance: ctx.attendance, appointments: ctx.appointments, finals: ctx.finals });
    const total = r2(p.total);
    if (!(total > 0)) return;
    const extras = [['ore suplimentare', p.overtimeLei], ['comision', p.commission], ['bonus', (Number(p.bonus) || 0) + (Number(p.manual) || 0) + (Number(p.managerBonus) || 0)]]
      .filter(([, v]) => Number(v) > 0).map(([label, lei]) => ({ label, lei: r2(lei) }));
    push({ key: 'sal:' + e.id, group: 'sal', label: e.name || 'Angajat', sub: 'Salariul pe ' + monthName(pm), due: dayOf(month, payDayOf(e)), payDay: payDayOf(e), lei: total, base: r2(p.base), extras, active: e.active !== false });
  });

  // Taxe la stat: the month's records
  const taxes = mine.rec.taxes;
  push({ key: 'taxes', group: 'tax', label: 'Taxe la stat', sub: 'TVA, contribuții, impozite', due: dayOf(month, TAX_DAY), lei: taxes.length ? recSum(taxes) : null, entries: taxes.length });

  // the fixed lines: Costuri lunare of the month, else the last month before it that has the line
  const eur = ctx.eur && ctx.eur.rate ? ctx.eur.rate : null;
  FIXED.forEach((f) => {
    let v = null, from = '';
    for (let m = month, i = 0; i < 4 && v == null; m = prevMonth(m), i++) {
      const en = ctx.costs.months[m];
      const t = en && en.lines ? MP.amount(en.lines[f.key]) : null;
      if (t != null) { v = t; from = m === month ? '' : m; }
    }
    const rate = eur || (ctx.costs.months[month] && MP.amount(ctx.costs.months[month].eurRate)) || null;
    const lei = v == null ? null : f.eur ? (rate ? r2(v * rate) : null) : v;
    push({ key: f.key, group: 'fixed', label: f.label, due: f.day ? dayOf(month, f.day) : null, lei, eur: f.eur ? v : undefined, from });
  });

  // by day (no day: last), then by name
  rows.sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : a.group === b.group ? String(a.label).localeCompare(String(b.label), 'ro') : a.group === 'sal' ? -1 : 1);
  const sum = (f) => r2(rows.filter(f).reduce((a, r) => a + (Number(r.paid ? (r.paid.lei != null ? r.paid.lei : r.lei) : r.lei) || 0), 0));
  const late = rows.filter((r) => r.state === 'late');
  return {
    month, current: month === cur, today: day, rows,
    summary: { paid: sum((r) => r.paid), toPay: sum((r) => !r.paid), late: late.length, lateLei: sum((r) => r.state === 'late'), soon: rows.filter((r) => r.state === 'today' || r.state === 'soon').length, missing: rows.filter((r) => !r.paid && r.lei == null).length, count: rows.length, paidCount: rows.filter((r) => r.paid).length },
  };
}

// ------------------------------------------------------------------ the owner's notices
// Once a day from 9:00 (Romania): what is due today and what is late, once per payment per month (bell and phone,
// the owner only; never the manager). Grouped in one line when several come the same day.
async function run() {
  const { readJSON, writeJSON } = require('./store');
  const N = require('./notify');
  const day = today();
  const st = (await readJSON(ALERTS, null)) || { day: '', sent: {} };
  if (st.day === day || roHour() < 9) return { skipped: true };
  const MP = require('./manager-pay');
  const ctx = await MP.loadCtx(readJSON);
  const cur = day.slice(0, 7);
  const due = [], late = [];
  for (const m of [prevMonth(cur), cur].filter((x) => x >= FIRST)) {
    const t = tracker(ctx, m);
    t.rows.forEach((r) => {
      if (r.paid || !r.due || r.due < ALERT_FROM) return;
      const k = m + '|' + r.key + '|';
      if (r.state === 'today' && !st.sent[k + 'due']) due.push(Object.assign({ k: k + 'due' }, r));
      if (r.state === 'late' && !st.sent[k + 'late']) late.push(Object.assign({ k: k + 'late' }, r));
    });
  }
  const say = (list) => {
    const sal = list.filter((r) => r.group === 'sal'), rest = list.filter((r) => r.group !== 'sal');
    const parts = rest.map((r) => r.label + (r.lei != null ? ' ' + N.leiTxt(r.lei) : r.key === 'taxes' ? ' (scrie suma)' : ''));
    if (sal.length) parts.unshift('Salarii nete (' + sal.length + ') ' + N.leiTxt(sal.reduce((a, r) => a + (Number(r.lei) || 0), 0)));
    return parts.join(' · ');
  };
  const owners = await N.ownerIds({ readJSON });
  const store = { readJSON, writeJSON };
  if (due.length) await N.notifyMany(store, owners, { kind: 'alert', tone: 'warn', go: 'angajati', tag: 'plati-azi-' + day, title: due.length === 1 ? 'DE PLĂTIT AZI 💳' : due.length + ' PLĂȚI AZI 💳', text: say(due) + '. Echipa → Costuri → Plăți.' });
  if (late.length) await N.notifyMany(store, owners, { kind: 'alert', tone: 'bad', go: 'angajati', tag: 'plati-late-' + day, title: late.length === 1 ? 'PLATĂ ÎNTÂRZIATĂ ⚠️' : late.length + ' PLĂȚI ÎNTÂRZIATE ⚠️', text: say(late) + (late.length === 1 ? '. Bifeaz-o când e plătită.' : '. Bifează-le când sunt plătite.') });
  due.concat(late).forEach((r) => { st.sent[r.k] = new Date().toISOString(); });
  // the marks of months long gone are dropped
  const keepFrom = prevMonth(prevMonth(cur));
  Object.keys(st.sent).forEach((k) => { if (k.slice(0, 7) < keepFrom) delete st.sent[k]; });
  st.day = day;
  await writeJSON(ALERTS, st, { quiet: true });
  return { due: due.length, late: late.length };
}

module.exports = { FIRST, KEY, REC, REC_KEYS, FIXED, PAYDAY, TAX_DAY, loadDoc, monthOf, recCosts, recSum, newEntry, tracker, run, isMonth, isDay, prevMonth, nextMonth, today, payDayOf };
