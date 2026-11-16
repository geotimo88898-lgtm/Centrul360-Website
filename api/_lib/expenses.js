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
// Paid in parts (the owner, 16.11: „fă să pot să plătesc și parțial”): a row is paid when its parts reach its sum; the
// tick pays what is left in one go. A row's sum can be changed for one month (amt), the owner adds his own rows
// (utilități, TVA, furnizori: once, or every month from one on), and the variable categories with a payment day show as
// rows when they have a sum (Taxe la stat on the 25th unless he changes it). Someone who left (Echipa → „A plecat”) has
// no salary row from the month she left on (api/_lib/left.js outOfMonth): her last pay is settled outside the list.
//
// data/expense-tracker.json { v: 1,
//   months: { 'YYYY-MM': { parts: { rowKey: [{ id, date, lei, note, at, by, byName }] },
//                          paid: { rowKey: { at, by, byName, lei, note } }   (before 16.11: one tick, read as one part)
//                          amt: { rowKey: { lei, at, by } }                    (this month's sum instead of the usual one)
//                          own: [{ id, label, lei, day, note, at, by }]        (his rows of this month only)
//                          skip: { rowKey: true }                              (a monthly row left out of this month)
//                          rec: { line: [{ id, date, lei, note, kind, at, by }] } } },
//   repeat: [{ id, label, lei, day, note, from, until, at, by }],              (his rows every month from `from`)
//   recDays: { line: 1..31 | 0 },                                              (a category's payment day, 0: not a row)
//   autoPay: { rowKey: true | false } }                                        („Se plătește automat”: paid on its day by itself)
// Automatic (the owner, 16.11: „ce poți extrage automat, să faci asta”), each row says its source (src): the salaries
// from Salariu, the fixed lines from Costuri lunare, Reclame Meta and Mesaje WhatsApp from Meta (paid by the card as
// they are spent), Taxe la stat (salarii) calculated per person (ro-salary-tax.js) until the accountant's sum is typed,
// Taxe la stat (TVA and the others) from Variabile. His monthly rows come every month by themselves.
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
// what Meta takes from the card by itself (the sums: api/_lib/manager-pay.js adsOf / waOf, Centrul360's campaigns only)
const CARD = [{ key: 'ads', label: 'Reclame Meta', src: 'Meta' }, { key: 'whatsapp', label: 'Mesaje WhatsApp', src: 'Meta WhatsApp' }];
const FIRST = '2026-11'; // the first month of the tracker
const ALERT_FROM = '2026-11-17'; // the payments due before the tracker existed don't ring

const L = require('./left');
const RT = require('./ro-salary-tax');
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
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const okLei = (v) => v == null || Number.isFinite(Number(v));
function normDoc(d) {
  const x = obj(d);
  return Object.assign({}, x, { v: 1, months: obj(x.months), recDays: obj(x.recDays), autoPay: obj(x.autoPay),
    repeat: Array.isArray(x.repeat) ? x.repeat.filter((r) => r && r.id && isMonth(r.from) && okLei(r.lei)) : [] });
}
async function loadDoc(readJSON) { return normDoc(await readJSON(KEY, null)); }
function monthOf(doc, m) {
  const x = obj(doc && doc.months && doc.months[m]);
  const rec = {}, parts = {};
  REC_KEYS.forEach((k) => { rec[k] = Array.isArray(x.rec && x.rec[k]) ? x.rec[k].filter((e) => e && Number.isFinite(Number(e.lei))) : []; });
  Object.keys(obj(x.parts)).forEach((k) => { if (Array.isArray(x.parts[k])) parts[k] = x.parts[k].filter((p) => p && p.id && Number.isFinite(Number(p.lei))); });
  return { paid: obj(x.paid), parts, amt: obj(x.amt), own: Array.isArray(x.own) ? x.own.filter((o) => o && o.id && okLei(o.lei)) : [], skip: obj(x.skip), rec };
}
// the month as it is written (made when missing), for a change
function monthW(doc, m) {
  const x = obj(doc.months[m]);
  ['paid', 'parts', 'amt', 'skip', 'rec'].forEach((k) => { x[k] = obj(x[k]); });
  x.own = Array.isArray(x.own) ? x.own : [];
  doc.months[m] = x;
  return x;
}
// a category's payment day: 1..31, or null when it is not a payment row (Taxe la stat: the 25th unless changed)
function recDayOf(doc, k) {
  const raw = obj(doc && doc.recDays)[k];
  if (raw == null || raw === '') return k === 'taxes' ? TAX_DAY : null;
  const v = Math.round(Number(raw));
  return v >= 1 && v <= 31 ? v : null;
}
// a row paid by itself: his choice per row (doc.autoPay, kept for every month); the card rows are, unless he turns it off;
// the salaries never (they are paid by hand)
function autoPayOf(doc, r) {
  if (r.group === 'sal') return false;
  const v = obj(doc && doc.autoPay)[r.key];
  return v == null ? r.group === 'card' : !!v;
}
// his monthly rows that show in a month
const repeatsIn = (doc, m) => (doc.repeat || []).filter((r) => r.from <= m && (!isMonth(r.until) || m <= r.until));
const isoDay = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t)) : ''; };
const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

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
// Each row: lei (what is due this month: his sum for the month when he changed it, orig the usual one), parts (what was
// paid, in parts), paidLei, rest (what is left, 0 when paid), done, partial, state (of what is left).
function tracker(ctx, month) {
  const MP = require('./manager-pay');
  const PAY = require('./payroll');
  const TB = require('./timebank');
  const day = today(), cur = day.slice(0, 7);
  const doc = ctx.exp || normDoc(null);
  const mine = monthOf(doc, month);
  const rows = [];
  // the state of what is left on a row: paid, late, today / soon (3 days), later; nodate: no fixed day
  const stateOf = (due, done) => {
    if (done) return 'paid';
    if (!due) return month < cur ? 'late' : 'nodate';
    const left = daysBetween(day, due);
    return left < 0 ? 'late' : left === 0 ? 'today' : left <= 3 ? 'soon' : 'later';
  };
  const push = (r) => rows.push(r);

  // Salarii nete: the pay of the month before, one row per person. Not for someone who left (active: false): from the month
  // she left on there is no row, the pay of the month before included; an account turned off without a day, never
  // (left.js outOfMonth). The owner, 16.11: „nu o mai include”, her last pay is settled outside the list. The months
  // before she left keep her row.
  const pm = prevMonth(month), pmCurrent = pm === cur;
  const team = (ctx.employees || []).filter((e) => e && e.id !== 'admin' && e.role !== 'admin');
  const payMemo = new Map();
  const payOf = (e) => payMemo.get(e.id) || payMemo.set(e.id, PAY.monthPay({ emp: e, month: pm, isCurrent: pmCurrent, sales: ctx.sales, dues: ctx.dues, payouts: (ctx.tbAll && ctx.tbAll.payouts) || [], bank: pmCurrent ? TB.ledger(e.id, ctx.tbAll) : null, attendance: ctx.attendance, appointments: ctx.appointments, finals: ctx.finals })).get(e.id);
  team.filter((e) => !L.outOfMonth(e, month)).forEach((e) => {
    const p = payOf(e);
    const total = r2(p.total);
    if (!(total > 0)) return;
    const extras = [['ore suplimentare', p.overtimeLei], ['comision', p.commission], ['bonus', (Number(p.bonus) || 0) + (Number(p.manual) || 0) + (Number(p.managerBonus) || 0)]]
      .filter(([, v]) => Number(v) > 0).map(([label, lei]) => ({ label, lei: r2(lei) }));
    push({ key: 'sal:' + e.id, group: 'sal', label: e.name || 'Angajat', sub: 'Salariul pe ' + monthName(pm), due: dayOf(month, payDayOf(e)), payDay: payDayOf(e), lei: total, base: r2(p.base), extras, src: 'Salariu' });
  });

  // the taxes on the salaries of the month before (the owner, 16.11: „le poți calcula și tu”), per person, by the rules of
  // api/_lib/ro-salary-tax.js: the same people as the salary rows (who left: not from the month she left on), her gross
  // when stored, else worked out from her net, what came on top counted as salary too. Never final: the accountant's
  // sum typed in Variabile → Taxe la stat → „Din salarii” takes its place
  const people = team.filter((e) => !L.outOfMonth(e, month)).map((e) => {
    const p = payOf(e), baseNet = Number(p.base) || 0;
    if (!(baseNet > 0)) return null;
    const x = RT.personMonth({ baseNet, extraNet: Math.max(0, (Number(p.total) || 0) - baseNet), month: pm, grossStored: e.grossSalary, dependants: e.dependants });
    return { id: e.id, name: e.name || 'Angajat', gross: x.gross, cas: x.cas, cass: x.cass, tax: x.tax, cam: x.cam, untaxed: x.untaxed, total: x.state, derived: x.derived };
  }).filter(Boolean);
  const calc = people.length ? { month: pm, people, total: people.reduce((a, x) => a + x.total, 0), gross: people.reduce((a, x) => a + x.gross, 0),
    rates: { year: RT.RATES.year, cas: RT.RATES.cas, cass: RT.RATES.cass, tax: RT.RATES.tax, cam: RT.RATES.cam, minWage: RT.minWageOf(pm) } } : null;

  // the variable categories with a payment day (Taxe la stat: the 25th, always a row; the others once they have a sum)
  REC.forEach((c) => {
    const d = recDayOf(doc, c.key);
    if (d == null) return;
    const list = mine.rec[c.key], key = c.key === 'taxes' ? 'taxes' : 'rec:' + c.key;
    if (c.key === 'taxes') {
      // two rows: the taxes on the salaries (calculated, or the accountant's sum typed as „Din salarii”) and the others (TVA...)
      const sal = list.filter((e) => e.kind === 'salarii'), rest = list.filter((e) => e.kind !== 'salarii');
      if (calc || sal.length || mine.parts.taxsal || mine.amt.taxsal) {
        push({ key: 'taxsal', group: 'tax', line: 'taxes', label: 'Taxe la stat (salarii)', sub: 'CAS, CASS, impozit, CAM pe ' + monthName(pm), due: dayOf(month, d), payDay: d,
          lei: sal.length ? recSum(sal) : calc ? r2(calc.total) : null, entries: sal.length, calc, typed: sal.length > 0, src: sal.length ? 'Variabile, suma de la contabilă' : 'calculat din salarii' });
      }
      push({ key, group: 'tax', line: c.key, label: c.label, sub: 'TVA și alte taxe', due: dayOf(month, d), payDay: d, lei: rest.length ? recSum(rest) : null, entries: rest.length, src: 'Variabile' });
      return;
    }
    const lei = list.length ? recSum(list) : null;
    if (!(lei > 0) && !mine.parts[key] && !mine.amt[key] && !mine.paid[key]) return;
    push({ key, group: 'rec', line: c.key, label: c.label, sub: c.hint || '', due: dayOf(month, d), payDay: d, lei, entries: list.length, src: 'Variabile' });
  });

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
    push({ key: f.key, group: 'fixed', label: f.label, due: f.day ? dayOf(month, f.day) : null, lei, eur: f.eur ? v : undefined, from, src: 'Costuri lunare' });
  });

  // what Meta takes from the card by itself as it is spent (ads, WhatsApp): rows paid as the spend happens.
  // ctx.spend { ads: { lei, at }, whatsapp: { lei, at } } is read by the page (api/portal-plati.js); without it, no rows
  CARD.forEach((c) => {
    const sp = ctx.spend && ctx.spend[c.key];
    if (!sp || sp.lei == null || !(Number(sp.lei) > 0)) return;
    push({ key: 'auto:' + c.key, group: 'card', label: c.label, sub: 'se plătește automat cu cardul', due: null, lei: r2(sp.lei), at: sp.at || '', upToday: month === cur, src: c.src });
  });

  // his own rows: this month's, and the monthly ones (unless left out of this month)
  const ownRow = (o, repeat) => ({ key: 'o:' + o.id, group: 'own', label: o.label || 'Plată', sub: o.note || '', due: o.day ? dayOf(month, o.day) : null, payDay: o.day || null,
    lei: o.lei == null || o.lei === '' ? null : r2(o.lei), own: { id: o.id, repeat, day: o.day || null, note: o.note || '', from: repeat ? o.from : month }, src: 'scrisă de tine' });
  mine.own.forEach((o) => push(ownRow(o, false)));
  repeatsIn(doc, month).forEach((o) => { if (!mine.skip['o:' + o.id]) push(ownRow(o, true)); });

  // this month's sum, the parts paid, what is left
  rows.forEach((r) => {
    const o = mine.amt[r.key];
    // (his rows of one month carry their own sum; a monthly one can have another sum this month)
    if (o && o.lei != null && o.lei !== '' && Number.isFinite(Number(o.lei)) && !(r.group === 'own' && !r.own.repeat)) { r.orig = r.lei; r.lei = r2(o.lei); r.changed = true; }
    let parts = mine.parts[r.key];
    if (!parts) {
      // a tick from before the parts: one part, the sum of that moment (or today's, when it had none)
      const p = mine.paid[r.key];
      parts = p ? [{ id: 'p0', date: isoDay(p.at) || day, lei: r2(p.lei != null ? p.lei : r.lei != null ? r.lei : 0), note: p.note || '', at: p.at || '', by: p.by || '', byName: p.byName || '', legacy: true }] : [];
    }
    parts = parts.map((p) => Object.assign({}, p, { lei: r2(p.lei) })).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.at).localeCompare(String(b.at)));
    // paid by itself (a direct debit, the card): on its day (no day: from the start of the month) what is left is paid,
    // a part marked „automat” that is never stored, so it follows the sum; turned off, the row is to pay again
    r.autoPay = autoPayOf(doc, r);
    const manual = r2(parts.reduce((a, p) => a + p.lei, 0));
    if (r.autoPay && r.lei != null && r.lei - manual > 0.005 && (r.due ? r.due <= day : month <= cur)) {
      parts.push({ id: 'auto', date: r.due || (month < cur ? dayOf(month, 31) : day), lei: r2(r.lei - manual), note: '', at: '', by: '', byName: 'automat', auto: true });
    }
    const paidLei = r2(parts.reduce((a, p) => a + p.lei, 0));
    const done = parts.length > 0 && (r.lei == null || paidLei >= r.lei - 0.005);
    const last = parts[parts.length - 1];
    Object.assign(r, {
      parts, paidLei, done, partial: !done && paidLei > 0, rest: r.lei == null ? null : done ? 0 : r2(r.lei - paidLei),
      paid: done ? { at: last.at, by: last.by, byName: last.byName, lei: paidLei, note: last.note || '' } : null,
      state: stateOf(r.due, done), left: r.due ? daysBetween(day, r.due) : null,
    });
  });

  // by day (no day: last), then the salaries first, then by name
  const G = { sal: 0, tax: 1, rec: 2, fixed: 3, own: 4, card: 5 };
  rows.sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : G[a.group] !== G[b.group] ? G[a.group] - G[b.group] : String(a.label).localeCompare(String(b.label), 'ro'));
  // the totals: what was paid (the parts too) and what is left; planned = paid + left (a row paid above its sum counts what was paid)
  const sum = (f, v) => r2(rows.filter(f).reduce((a, r) => a + (Number(v(r)) || 0), 0));
  const paid = sum(() => true, (r) => r.paidLei), toPay = sum((r) => !r.done, (r) => r.rest);
  const late = rows.filter((r) => r.state === 'late');
  return {
    month, current: month === cur, today: day, rows,
    summary: { paid, toPay, planned: r2(paid + toPay), late: late.length, lateLei: sum((r) => r.state === 'late', (r) => r.rest), soon: rows.filter((r) => r.state === 'today' || r.state === 'soon').length,
      missing: rows.filter((r) => !r.done && r.lei == null).length, count: rows.length, paidCount: rows.filter((r) => r.done).length, partial: rows.filter((r) => r.partial).length },
  };
}
// the next payment still to make from today on (this month, else the next one): its row, and how many more fall that day
function nextDue(ctx, month, t) {
  const day = today(), cur = day.slice(0, 7);
  if (month < cur) return null;
  const pick = (tt) => {
    const open = tt.rows.filter((r) => !r.done && !r.autoPay && r.due && r.due >= day);
    if (!open.length) return null;
    const same = open.filter((r) => r.due === open[0].due), r = same[0];
    return { key: r.key, month: tt.month, label: r.label, group: r.group, due: r.due, lei: r.rest != null ? r.rest : r.lei, left: r.left,
      more: same.length - 1, moreLei: r2(same.slice(1).reduce((a, x) => a + (Number(x.rest) || 0), 0)) };
  };
  return pick(t || tracker(ctx, month)) || (month === cur ? pick(tracker(ctx, nextMonth(month))) : null);
}

// ------------------------------------------------------------------ the owner's notices
// where a notice opens (portal-plati.js, #cheltuieli/<what>@<month>): one payment, its row lit up; several, the filter
// of their month (late: Întârziate, due today: De plătit)
function alertLink(list, kind) {
  const months = Array.from(new Set(list.map((r) => r.month).filter(Boolean)));
  if (list.length === 1 && list[0].key) return 'cheltuieli/' + list[0].key + (list[0].month ? '@' + list[0].month : '');
  return 'cheltuieli/' + kind + (months.length === 1 ? '@' + months[0] : '');
}
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
      if (r.paid || r.autoPay || !r.due || r.due < ALERT_FROM) return;
      const k = m + '|' + r.key + '|';
      if (r.state === 'today' && !st.sent[k + 'due']) due.push(Object.assign({ k: k + 'due', month: m }, r));
      if (r.state === 'late' && !st.sent[k + 'late']) late.push(Object.assign({ k: k + 'late', month: m }, r));
    });
  }
  const say = (list) => {
    const sal = list.filter((r) => r.group === 'sal'), rest = list.filter((r) => r.group !== 'sal');
    const due = (r) => (r.rest != null ? r.rest : r.lei);
    const parts = rest.map((r) => r.label + (due(r) != null ? ' ' + N.leiTxt(due(r)) + (r.partial ? ' rămas' : '') : r.key === 'taxes' ? ' (scrie suma)' : ''));
    if (sal.length) parts.unshift('Salarii nete (' + sal.length + ') ' + N.leiTxt(sal.reduce((a, r) => a + (Number(due(r)) || 0), 0)));
    return parts.join(' · ');
  };
  const owners = await N.ownerIds({ readJSON });
  const store = { readJSON, writeJSON };
  if (due.length) await N.notifyMany(store, owners, { kind: 'alert', tone: 'warn', go: alertLink(due, 'open'), tag: 'plati-azi-' + day, title: due.length === 1 ? 'DE PLĂTIT AZI 💳' : due.length + ' PLĂȚI AZI 💳', text: say(due) + '. Cheltuieli.' });
  if (late.length) await N.notifyMany(store, owners, { kind: 'alert', tone: 'bad', go: alertLink(late, 'late'), tag: 'plati-late-' + day, title: late.length === 1 ? 'PLATĂ ÎNTÂRZIATĂ ⚠️' : late.length + ' PLĂȚI ÎNTÂRZIATE ⚠️', text: say(late) + (late.length === 1 ? '. Bifeaz-o când e plătită.' : '. Bifează-le când sunt plătite.') });
  due.concat(late).forEach((r) => { st.sent[r.k] = new Date().toISOString(); });
  // the marks of months long gone are dropped
  const keepFrom = prevMonth(prevMonth(cur));
  Object.keys(st.sent).forEach((k) => { if (k.slice(0, 7) < keepFrom) delete st.sent[k]; });
  st.day = day;
  await writeJSON(ALERTS, st, { quiet: true });
  return { due: due.length, late: late.length };
}

module.exports = { alertLink, FIRST, KEY, REC, REC_KEYS, FIXED, CARD, autoPayOf, PAYDAY, TAX_DAY, normDoc, loadDoc, monthOf, monthW, recDayOf, repeatsIn, newId, recCosts, recSum, newEntry, tracker, nextDue, run, isMonth, isDay, prevMonth, nextMonth, today, payDayOf };
