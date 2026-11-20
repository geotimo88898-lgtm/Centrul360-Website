// POST /api/portal-manager, the Manager page (the owner, 15.11: a manager runs both clinics). The owner and the manager
// only, checked here on every call (api/_lib/roles.js). Never profit, costs, salaries or ad spend: the numbers are the
// clinic's own work (collections, the calendar, the leads, the messages), the same ones reception already sees.
//
//   { action: 'stats', month? }        this month, per clinic: each cosmetician's collections per day worked vs 1500 lei
//                                      (the bonus condition), the calendar booked vs the team's hours (target: full + 50%),
//                                      consultations followed by a package, new leads contacted within 5 minutes, the
//                                      messages still waiting for an answer now
//   { action: 'context', city }        the numbers sent with „Anunță-l pe George”: leads (7 days back), consultations and
//                                      free hours (7 days ahead), the show-up rate (30 days back)
//   { action: 'feedback', city, level, details }   the lead volume as she sees it; the admins are told (bell + phone)
//   { action: 'feedback_list' }
//   { action: 'close_prefill', city, date }        what the system says for that day: cash, card, transfer, the POS
//   { action: 'close', city, date, cashCounted, posAmount, cashFate: 'ridicare'|'depus', deposited, note }
//   { action: 'closes_list' }
//   { action: 'pos', city, from, to }  the myPOS card payments of a clinic (only the payments, never the account balance)
//   { action: 'report_draft', week }   the week's numbers (week = its Monday)
//   { action: 'report_send', week, notes, problems }  saved with the numbers of that moment; the admins are told
//   { action: 'reports_list' }
//   { action: 'today' }               „Azi” (the owner, 20.11): the day at a glance, per clinic: the calendar today and
//                                      tomorrow vs the target, the leads nobody called, who hasn't come yet, tomorrow's
//                                      bookings to confirm, new clients with no program photographed, each cosmetician's
//                                      new clients, programs and packages today
//   { action: 'ready' }               „Ce au citit” (20.11): per person of her clinics, the regulation and the job description
//                                      confirmed or not, the trainings read and passed
//   { action: 'ready_remind', ids? }   a reminder to each one (or to those ids) of what she still has to read
//   { action: 'rules', period: 'azi' | '7z' }  Reguli: the regulation kept or not, per clinic (api/_lib/rules.js)
// Data: data/manager-feedback.json, data/day-closes.json, data/manager-reports.json (newest last, the last 400 kept).

const MONEY = require('./_lib/money');
const crypto = require('crypto');
const { readJSON, writeJSON, readJSONTagged, writeJSONIf } = require('./_lib/store');
const { requireManage } = require('./_lib/roles');
const N = require('./_lib/notify');
const T = require('./_lib/team-schedule');
const B = require('./_lib/booking');

const CITIES = ['Timișoara', 'Arad'];
const TARGET_PER_DAY = 1500;       // lei collected per day worked, every cosmetician (the owner's monthly target)
const TARGET_FILL = 1.5;           // the calendar's fallback target (per clinic it is full plus the no-shows of 60 days, clinic.js)
const LEVELS = { mult_putine: 'mult prea puține', putin_putine: 'puțin prea puține', potrivit: 'potrivit', putin_multe: 'puțin prea multe', mult_multe: 'mult prea multe' };
// how good the leads are (16.11), and the reasons she can tick
const QUALITY = { foarte_slabe: 'foarte slabe', slabe: 'slabe', ok: 'OK', bune: 'bune', foarte_bune: 'foarte bune' };
const REASONS = { nu_raspund: 'Nu răspund', nu_stiu: 'Nu știu de ce au lăsat datele', doar_pret: 'Vor doar prețul', alt_oras: 'Nu sunt din oraș', doar_gratuit: 'Vor doar gratuit',
  se_programeaza: 'Interesate, se programează', altele: 'Altele' };
const FATES = { ridicare: 'păstrat pentru ridicare', depus: 'depus în contul firmei' };
const KEEP = 400;

// The package bonus of a day (payments of 1.500+, with their +50 / +100), paid at the end of the shift (the owner, 20.11):
// what it is, what was already handed over (a „manual” line with origin 'bonus-paid', minus, so the month's salary
// doesn't pay it twice) and what is still to give
function bonusToday(empId, day, sales, cctx) {
  const CM = require('./_lib/commission');
  let earned = 0;
  (sales || []).forEach((u) => { if (CM.isUpsellReq(u) && u.employeeId === empId && u.status !== 'rejected') CM.linesOf(u, cctx).forEach((l) => { if (l.kind === 'pay' && l.date === day && l.pack) earned += l.lei; }); });
  const paid = (sales || []).filter((x) => x && x.source === 'manual' && x.origin === 'bonus-paid' && x.employeeId === empId && x.date === day && x.status === 'approved').reduce((a, x) => a - (Number(x.commission) || 0), 0);
  const r = (n) => Math.round(n * 100) / 100;
  return { earned: r(earned), paid: r(paid), due: r(Math.max(0, earned - paid)) };
}

// „Azi”: what the manager has to see and do now (no lei of the clinic, only counts and names)
async function todayOf(mine) {
  const C = require('./_lib/clinic');
  const CM = require('./_lib/commission');
  const FU = require('./_lib/followups');
  const [appts, sales, clients, emps, leads, stagesRaw, dues, cfg] = await Promise.all([readJSON('data/appointments.json', []), readJSON('data/sales.json', []),
    readJSON('data/clients.json', []), readJSON('data/employees.json', []), readJSON('data/leads.json', []), readJSON('data/pipeline-stages.json', null),
    readJSON('data/client-dues.json', []), B.settings({ team: true })]);
  const N = C.normalize({ leads, appts, sales, convos: [], emps });
  const now = B.roNow(), day = now.date, tomorrow = C.addDay(day, 1);
  const stages = Array.isArray(stagesRaw) && stagesRaw.length ? stagesRaw : [];
  const kind = (id) => (stages.find((x) => x.id === id) || {}).kind || 'open';
  const test = (n) => /^\s*test\b/i.test(String(n || ''));
  const tg = C.fillTargets(N.appts, N.sales, CITIES, day, clients);
  const minOf = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  // clients who already had a visit before today: the others are new
  const seenBefore = new Set(N.appts.filter((a) => a && a.date < day && a.status === 'finalizata' && a.clientId).map((a) => a.clientId));
  const cctx = CM.context(N.sales, dues, emps);
  const cos = emps.filter((e) => e && e.active !== false && e.role === 'cosmetician');
  const out = {};
  mine.filter((c) => CITIES.includes(c)).forEach((city) => {
    const fill = C.fillDays(cfg, city, day, 2, N.appts, tg[city] ? tg[city].target : null);
    const ap = N.appts.filter((a) => a && a.location === city && !test(a.clientName) && a.status !== 'concediu');
    const todays = ap.filter((a) => a.date === day && a.status !== 'anulata');
    const late = todays.filter((a) => (a.status === 'programata' || a.status === 'confirmata') && minOf(a.time) != null && minOf(a.time) + 15 < now.min)
      .map((a) => ({ id: a.id, client: a.clientName || '', time: a.time || '', who: a.cosmeticianName || '' }));
    const confirm = ap.filter((a) => a.date === tomorrow && C.toConfirm(a)).map((a) => ({ id: a.id, client: a.clientName || '', time: a.time || '' }));
    const fresh = N.leads.filter((l) => l && l.location === city && !test(l.name) && kind(l.stage) !== 'won' && kind(l.stage) !== 'lost' && !l.lastContactAt && !l.contactCount)
      .map((l) => ({ id: l.id, name: l.name || '', interest: l.interest || '', at: l.createdAt || '', grade: l.grade || '' }))
      .sort((a, b) => (a.at < b.at ? -1 : 1));
    // the warm ones first: the last 2 days; older ones only counted (the call queue has them)
    const since = new Date(Date.now() - 48 * 3600e3).toISOString();
    const older = fresh.filter((l) => l.at < since).length;
    const warm = fresh.filter((l) => l.at >= since).map((l) => Object.assign(l, { mins: Math.max(0, Math.round((Date.now() - Date.parse(l.at)) / 60e3)) }));
    const isNew = (a) => C.isConsult(a) || !a.clientId || !seenBefore.has(a.clientId);
    const doneNew = todays.filter((a) => a.status === 'finalizata' && isNew(a));
    const noProgram = doneNew.filter((a) => !a.program).map((a) => ({ id: a.id, client: a.clientName || '', who: a.cosmeticianName || '', time: a.time || '' }));
    const people = cos.filter((e) => C.clinicOf(e.location) === city || todays.some((a) => a.cosmeticianId === e.id)).map((e) => {
      const mineToday = todays.filter((a) => a.cosmeticianId === e.id);
      const news = mineToday.filter((a) => isNew(a));
      let packs = 0;
      N.sales.forEach((u) => { if (CM.isUpsellReq(u) && u.employeeId === e.id && u.status !== 'rejected') CM.linesOf(u, cctx).forEach((l) => { if (l.kind === 'pay' && l.date === day && l.pack && !l.topup) packs++; }); });
      const due = bonusToday(e.id, day, N.sales, cctx);
      return { id: e.id, name: e.name || '', clients: mineToday.length, newClients: news.length, programs: news.filter((a) => a.program).length, packages: packs, bonus: due };
    }).filter((p) => p.clients || p.packages);
    out[city] = { fill, uncalled: warm, uncalledOlder: older, late, confirm, noProgram, people };
  });
  return { ok: true, today: day, tomorrow, now: now.min, cities: out };
}
// „Ce au citit” (the owner, 20.11: the manager sees who read the regulation, the job description and the trainings,
// and reminds them in one tap): per person of her clinics, the version in force of each text confirmed or not, and the
// trainings read and passed (the cosmeticians' chapters, as Traininguri shows them)
const READY_KEY = 'data/ready-reminders.json';
const TRAIN_HIDE = ['vanzari', 'cabina']; // what Traininguri hides from the cosmeticians (portal-academy.js areaCards)
async function readyOf(mine, meId) {
  const C = require('./_lib/clinic');
  const RG = require('./portal-regulament');
  const { mergeAcademy } = require('./_lib/academy');
  const [emps, cfg, prog, regDoc, fisaDoc, sent] = await Promise.all([readJSON('data/employees.json', []), readJSON('data/config.json', null),
    readJSON('data/academy-progress.json', {}), RG.load(RG.DOCS.regulament), RG.load(RG.DOCS.fisa), readJSON(READY_KEY, {})]);
  const ac = mergeAcademy((cfg && cfg.academy) || null);
  const chapters = ac.manuals.filter((m) => (m.roles || []).includes('cosmetician') && !TRAIN_HIDE.includes(m.id))
    .flatMap((m) => m.chapters.map((c) => ({ ref: 'm:' + m.id + '/' + c.id, title: c.title || '', manual: m.title || '', quiz: (c.quiz || []).length > 0 })));
  const cur = (d) => d.versions[d.versions.length - 1] || null;
  const reg = cur(regDoc), fisa = cur(fisaDoc);
  const sign = (doc, v, D, e) => (v && D.signs.includes(e.role) ? { at: (doc.acks[v.id] || {})[e.id] || '' } : null);
  const people = (emps || []).filter((e) => e && e.active !== false && e.id !== meId && ['cosmetician', 'receptie', 'manager'].includes(e.role) && mine.includes(C.clinicOf(e.location)))
    .map((e) => {
      const p = Object.assign({ read: {}, quiz: {} }, prog[e.id] || {});
      let train = null;
      if (e.role === 'cosmetician' && chapters.length) {
        const tests = chapters.filter((c) => c.quiz);
        const q = (c) => p.quiz[c.ref];
        const stamps = [].concat(Object.values(p.read || {}), Object.values(p.quiz || {}).map((x) => x && x.at)).filter(Boolean).sort();
        train = { read: chapters.filter((c) => p.read[c.ref]).length, total: chapters.length, tests: tests.length,
          passed: tests.filter((c) => q(c) && q(c).total && q(c).best === q(c).total).length, last: stamps[stamps.length - 1] || '',
          items: chapters.map((c) => ({ title: c.title, manual: c.manual, read: !!p.read[c.ref], quiz: c.quiz ? (q(c) ? { best: q(c).best, total: q(c).total } : { best: null, total: 0 }) : null })) };
      }
      const r = sign(regDoc, reg, RG.DOCS.regulament, e), f = sign(fisaDoc, fisa, RG.DOCS.fisa, e);
      const todo = [];
      if (r && !r.at) todo.push('regulament');
      if (f && !f.at) todo.push('fisa');
      if (train && (train.read < train.total || train.passed < train.tests)) todo.push('train');
      return { id: e.id, name: e.name || '', role: e.role, city: C.clinicOf(e.location), reg: r, fisa: f, train, todo, reminded: sent[e.id] || '' };
    })
    .sort((a, b) => b.todo.length - a.todo.length || a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
  const ver = (v) => (v ? { n: v.n, at: v.at } : null);
  return { ok: true, reg: ver(reg), fisa: ver(fisa), people };
}
// the reminder: each one hears only what she still has, and opens the first of it
async function readyRemind(mine, meId, ids) {
  const R = await readyOf(mine, meId);
  const want = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null;
  const to = R.people.filter((p) => p.todo.length && (!want || want.has(p.id)));
  const words = (p) => p.todo.map((t) => (t === 'regulament' ? 'Regulamentul intern' : t === 'fisa' ? 'Fișa postului'
    : (p.train.total - p.train.read ? (p.train.total - p.train.read) + ' ' + (p.train.total - p.train.read === 1 ? 'capitol' : 'capitole') + ' din Traininguri' : 'testele din Traininguri')));
  const day = B.roNow().date;
  for (const p of to) {
    const go = p.todo[0] === 'regulament' ? 'regulament' : p.todo[0] === 'fisa' ? 'fisapost' : 'traininguri';
    await N.notify({ readJSON, writeJSON }, p.id, { kind: 'info', tone: 'info', go, tag: 'ready-' + day,
      title: 'DE CITIT ÎN PORTAL 📚', text: 'Mai ai: ' + words(p).join(', ') + '. Citește și confirmă la final.' });
  }
  if (to.length) {
    for (let i = 0; i < 3; i++) {
      const sent = await readJSON(READY_KEY, {});
      const at = new Date().toISOString();
      to.forEach((p) => { sent[p.id] = at; });
      await writeJSON(READY_KEY, sent);
      const chk = await readJSON(READY_KEY, {});
      if (to.every((p) => chk[p.id] === at)) break;
    }
  }
  return { ok: true, sent: to.length };
}
const KEYS = { feedback: 'data/manager-feedback.json', closes: 'data/day-closes.json', reports: 'data/manager-reports.json' };

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !isNaN(Date.parse(d + 'T12:00:00Z'));
const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const roNow = () => B.roNow();
const roDay = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? B.roNow(t).date : ''; };
const monthEnd = (m) => { const [y, mo] = m.split('-').map(Number); return m + '-' + String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0'); };
const tag = (c) => N.cityTag(c).trim();

// a list kept in the store that two people can add to at once (never one over the other)
async function append(key, row) {
  for (let i = 0; i < 6; i++) {
    const { data, etag } = await readJSONTagged(key, []);
    const list = (Array.isArray(data) ? data : []).concat([row]).slice(-KEEP);
    if (await writeJSONIf(key, list, etag)) return row;
  }
  throw new Error('manager store busy');
}

// the clinic's numbers (the same on the KPI page): api/_lib/clinic.js
const { visit, isConsult, fill, fillTargets, cosmeticians, consults, leadSpeed, waitingNow, showRate, normalize, paidDays, cameBy } = require('./_lib/clinic');

async function load() {
  const [emps, sales, appts, attendance, leads, convos, cfg, clients] = await Promise.all([
    readJSON('data/employees.json', []), readJSON('data/sales.json', []), readJSON('data/appointments.json', []), readJSON('data/attendance.json', []),
    readJSON('data/leads.json', []), readJSON('data/whatsapp-conversations.json', []), B.settings({ team: true }), readJSON('data/clients.json', []),
  ]);
  // the clinic of every record written one way (the KPI page counts from the same, api/_lib/clinic.js)
  const n = normalize({ leads, appts, sales, convos, emps });
  return { emps, sales: n.sales, appts: n.appts, attendance, leads: n.leads, convos: n.convos, cfg, clients };
}

async function stats(month, mine) {
  const now = roNow();
  const m = /^\d{4}-\d{2}$/.test(String(month || '')) && month <= now.date.slice(0, 7) ? month : now.date.slice(0, 7);
  const from = m + '-01', to = m === now.date.slice(0, 7) ? now.date : monthEnd(m);
  const D = await load();
  const waiting = await waitingNow(D.convos);
  // the calendar's target per clinic: full plus the no-shows of the last 60 days (api/_lib/clinic.js fillTargets)
  const tg = fillTargets(D.appts, D.sales, mine, now.date, D.clients);
  const cities = {};
  mine.forEach((city) => {
    const team = cosmeticians(D.emps, D.sales, D.attendance, city, from, to, D.appts);
    // the bonus condition: the trained ones who worked (someone „în formare” is shown, not counted: _lib/manager-pay.js)
    const counted = team.filter((x) => x.days > 0 && !x.trainee);
    cities[city] = {
      team,
      bonus: { ok: counted.length > 0 && counted.every((x) => x.ok), counted: counted.length, below: counted.filter((x) => !x.ok).length, trainees: team.filter((x) => x.trainee && x.days > 0).length },
      fillMonth: fill(D.cfg, city, from, to, D.appts, tg[city].target),
      fillAhead: fill(D.cfg, city, now.date, addDay(now.date, 6), D.appts, tg[city].target),
      fillTarget: tg[city],
      schedule: !!(D.cfg.team && T.hasSchedule(D.cfg.team.doc, city, D.cfg.team.ids)),
      consults: consults(D.appts, D.sales, city, from, to),
      leads: leadSpeed(D.leads, D.convos, D.cfg, city, from, to),
      waiting: waiting[city] || 0,
    };
  });
  return { ok: true, month: m, from, to, clinics: mine, targets: { perDay: TARGET_PER_DAY, fill: TARGET_FILL * 100, fillBy: 'noshow60', consults: 50, leads5: 100 }, waitingSocial: waiting.social || 0, cities };
}

async function context(city) {
  const now = roNow();
  const D = await load();
  const since = Date.now() - 7 * 864e5;
  const ahead = addDay(now.date, 6);
  const tg = fillTargets(D.appts, D.sales, [city], now.date, D.clients)[city];
  const f = fill(D.cfg, city, now.date, ahead, D.appts, tg.target);
  // the leads of the last 7 days and what they became (the KPI funnel's rules, api/_lib/kpi.js): answered when called = a call or
  // message noted with an answer (anything but „nu răspunde” / „număr greșit”), or booked
  const K = require('./_lib/kpi');
  const M = K.model({ leads: D.leads, appointments: D.appts, sales: D.sales, clients: D.clients, conversations: D.convos, candidates: await require('./_lib/wa-waiting').candidates().catch(() => null) });
  const raw = new Map(D.leads.map((l) => [l.id, l]));
  const L7 = M.L.filter((l) => l.fresh && l.city === city && l.at >= since);
  const f7 = K.funnelOf(L7);
  const answered = L7.filter((l) => l.appts.length || l.pays.length || ((raw.get(l.id) || {}).activities || []).some((a) => a.type === 'contact' && a.outcome && !['nu_raspunde', 'numar_gresit'].includes(a.outcome))).length;
  return {
    city,
    quality7: { leads: f7.leads, contacted: f7.contacted, answered, booked: f7.booked, came: f7.came, paid: f7.paid },
    fillTarget: tg.target, noShow60: tg.noShow, noShowCounts: { due: tg.due, came: tg.came, missed: tg.missed, since: tg.since, from: tg.from },
    leads7: D.leads.filter((l) => l.location === city && Date.parse(l.createdAt) >= since).length,
    consultsNext7: D.appts.filter((a) => visit(a) && isConsult(a) && a.location === city && a.date >= now.date && a.date <= ahead).length,
    visitsNext7: D.appts.filter((a) => visit(a) && a.location === city && a.date >= now.date && a.date <= ahead).length,
    freeHoursNext7: f.freeHours, capHoursNext7: f.capHours, bookedHoursNext7: f.bookedHours, fillNext7: f.pct,
    show30: showRate(D.appts, city, now.date, D.sales, 30, D.clients),
    at: new Date().toISOString(),
  };
}

// ------------------------------------------------------------------ the day's close
async function prefill(city, date) {
  // a payment without its clinic written takes its visit's (or its cosmetician's), as everywhere else (api/_lib/clinic.js)
  const [all, appts, emps] = await Promise.all([readJSON('data/sales.json', []), readJSON('data/appointments.json', []), readJSON('data/employees.json', [])]);
  const sales = normalize({ sales: all.filter((s) => s && s.source === 'incasare' && s.date === date), appts, emps }).sales.filter((s) => s.location === city);
  let cash = 0, card = 0, transfer = 0;
  sales.forEach((s) => {
    const a = Number(s.amount) || 0;
    if (s.method === 'cash') cash += a;
    else if (s.method === 'card') card += a;
    else if (s.method === 'transfer') transfer += a;
    else if (s.method === 'cash_card') { cash += Number(s.split && s.split.cash) || 0; card += Number(s.split && s.split.card) || 0; }
  });
  const pos = await posOf(city, date, date);
  return { city, date, count: sales.filter(MONEY.isPayment).length, refunds: MONEY.refundsOf(sales).lei, cash: r2(cash), card: r2(card), transfer: r2(transfer),
    pos: pos.connected ? { connected: true, total: r2(pos.payments.filter((p) => !p.cancelled).reduce((a, p) => a + p.amount, 0)), count: pos.payments.filter((p) => !p.cancelled && p.amount > 0).length, terminals: pos.terminals } : { connected: false } };
}

// the clinic's POS payments (myPOS, Integrări: each terminal has its clinic). Payments only; the balance is never read here.
async function posOf(city, from, to) {
  const M = require('./_lib/mypos');
  const conn = await M.loadConn(readJSON);
  if (!M.connected(conn)) return { connected: false, payments: [], terminals: 0 };
  const tids = new Set((conn.devices || []).filter((d) => d.city === city).map((d) => d.tid));
  let pay = await readJSON(M.PAY, { list: [] });
  const fromMs = Date.parse(from + 'T00:00:00+03:00') - 864e5;
  const stale = !pay.syncedAt || Date.now() - Date.parse(pay.syncedAt) > 10 * 60e3;
  const older = !pay.coverFrom || fromMs < Date.parse(pay.coverFrom);
  if (stale || older) {
    try { await M.sync({ readJSON, writeJSON }, older ? { fromMs } : {}); pay = await readJSON(M.PAY, { list: [] }); } catch (e) { /* the payments read before */ }
  }
  const payments = (pay.list || []).filter((p) => tids.has(p.tid) && p.day >= from && p.day <= to)
    .map((p) => ({ id: p.id, at: p.at, day: p.day, amount: r2(p.amount), currency: p.currency || 'RON', pan: p.pan || '', tid: p.tid, cancelled: !!p.cancelled, refund: p.amount < 0 }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  return { connected: true, payments, terminals: tids.size, syncedAt: pay.syncedAt || '' };
}

// ------------------------------------------------------------------ the week's report
function weekNumbers(D, monday, mine) {
  const sunday = addDay(monday, 6);
  const out = {};
  // she came: the KPI page's rule (finished, paid, or she paid something that day: api/_lib/clinic.js cameBy)
  const paid = paidDays(D.sales);
  mine.forEach((city) => {
    const inc = D.sales.filter((s) => s.source === 'incasare' && (s.location || '') === city && s.date >= monday && s.date <= sunday);
    const team = cosmeticians(D.emps, D.sales, D.attendance, city, monday, sunday);
    const visits = D.appts.filter((a) => visit(a) && a.location === city && a.date >= monday && a.date <= sunday);
    const cancelled = D.appts.filter((a) => a && a.location === city && a.status === 'anulata' && a.date >= monday && a.date <= sunday && !a.block);
    const made = D.appts.filter((a) => a && a.location === city && !a.block && a.status !== 'concediu' && roDay(a.createdAt) >= monday && roDay(a.createdAt) <= sunday);
    const worked = team.filter((x) => x.days > 0);
    out[city] = {
      collected: MONEY.net(inc), payments: inc.filter(MONEY.isPayment).length, refunds: MONEY.refundsOf(inc),
      perDayAvg: worked.length ? Math.round(worked.reduce((a, x) => a + x.perDay, 0) / worked.length) : 0,
      team: team.map((x) => ({ name: x.name, days: x.days, collected: x.collected, perDay: x.perDay, ...(x.trainee ? { trainee: true, label: x.label } : {}) })),
      booked: made.length, visits: visits.length, shows: visits.filter((a) => cameBy(a, paid)).length, cancelled: cancelled.length,
      consults: consults(D.appts, D.sales, city, monday, sunday),
      leads: D.leads.filter((l) => l.location === city && roDay(l.createdAt) >= monday && roDay(l.createdAt) <= sunday).length,
    };
  });
  return out;
}
const mondayOf = (d) => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return addDay(d, w === 0 ? -6 : 1 - w); };

// ------------------------------------------------------------------ handler
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = await requireManage(req, res);
  if (!session) return;
  const b = req.body || {};
  const fail = (code, error) => res.status(code).json({ error });
  const store = { readJSON, writeJSON };
  // the clinics on this page: the manager's own list (Echipa → her clinics; a clinic opened later is not added by itself),
  // all of them for the owner
  const mine = session.role === 'manager' ? (await require('./_lib/city').cityOf(session, readJSON)) || [] : CITIES;
  const cityOk = (c) => mine.includes(c);
  const seen = (row) => session.role !== 'manager' || (row.city ? mine.includes(row.city) : true);
  const who = async () => {
    if (session.employeeId === 'admin') return 'Admin';
    const e = (await readJSON('data/employees.json', [])).find((x) => x.id === session.employeeId);
    return (e && e.name) || '';
  };
  try {
    if (b.action === 'stats') { res.status(200).json(await stats(b.month, mine)); return; }
    if (b.action === 'today') { res.status(200).json(await todayOf(mine)); return; }
    if (b.action === 'ready') { res.status(200).json(await readyOf(mine, session.employeeId)); return; }
    if (b.action === 'ready_remind') { res.status(200).json(await readyRemind(mine, session.employeeId, b.ids)); return; }
    // „Dă bonusul”: the day's package bonus handed over at the end of the shift; the amount is the server's, never the page's
    if (b.action === 'bonus_pay') {
      const CM = require('./_lib/commission');
      const [sales, dues, emps] = await Promise.all([readJSON('data/sales.json', []), readJSON('data/client-dues.json', []), readJSON('data/employees.json', [])]);
      const emp = emps.find((e) => e && e.id === b.employeeId && e.role === 'cosmetician');
      if (!emp) { res.status(404).json({ error: 'not_found' }); return; }
      if (session.role === 'manager' && !mine.includes(require('./_lib/clinic').clinicOf(emp.location))) { res.status(403).json({ error: 'forbidden' }); return; }
      const day = B.roNow().date;
      const x = bonusToday(emp.id, day, sales, CM.context(sales, dues, emps));
      if (!(x.due > 0)) { res.status(400).json({ error: 'nothing_due' }); return; }
      const now = new Date().toISOString(), by = await who();
      sales.push({ id: crypto.randomUUID(), source: 'manual', origin: 'bonus-paid', employeeId: emp.id, date: day, categories: [], category: '', treatment: 'Bonus pachete primit pe loc',
        amount: 0, commission: -x.due, note: 'Dat la sfârșitul programului' + (by ? ', de ' + by : ''), clientId: '', client: '', status: 'approved', createdAt: now, decidedAt: now, addedBy: session.employeeId });
      await writeJSON('data/sales.json', sales);
      await N.notify({ readJSON, writeJSON }, emp.id, { kind: 'commission', tone: 'good', title: 'BONUS PRIMIT 💵 - ' + x.due.toLocaleString('ro-RO') + ' lei', text: 'Bonusul pachetelor de azi, dat pe loc.', go: 'comision' }).catch(() => 0);
      res.status(200).json({ ok: true, paid: x.due });
      return;
    }
    // „Reguli”: whether the internal regulation is kept, read only, per clinic, today or the last 7 days (api/_lib/rules.js);
    // the manager sees her clinics' people, never herself
    if (b.action === 'rules') {
      const team = await require('./_lib/roles').teamOf(session, readJSON);
      const r = await require('./_lib/rules').compute({ clinics: [].concat(mine), team, period: b.period === 'azi' ? 'azi' : '7z' });
      res.status(200).json(Object.assign({ ok: true }, r));
      return;
    }

    if (b.action === 'context') {
      if (!cityOk(b.city)) return fail(400, 'invalid_city');
      res.status(200).json({ ok: true, context: await context(b.city) });
      return;
    }

    if (b.action === 'feedback') {
      if (!cityOk(b.city)) return fail(400, 'invalid_city');
      if (!LEVELS[b.level]) return fail(400, 'invalid_level');
      if (!QUALITY[b.quality]) return fail(400, 'invalid_quality');
      const details = clip(b.details, 1500);
      const reasons = [...new Set((Array.isArray(b.reasons) ? b.reasons : []).filter((x) => REASONS[x]))];
      const row = { id: crypto.randomUUID(), at: new Date().toISOString(), by: session.employeeId, byName: await who(), city: b.city, level: b.level, quality: b.quality, reasons, details, context: await context(b.city) };
      await append(KEYS.feedback, row);
      const c = row.context;
      const arrow = /putine/.test(b.level) ? '📉' : /multe/.test(b.level) ? '📈' : '👌';
      await N.notifyMany(store, await N.adminIds(store), {
        kind: 'alert', tone: b.level === 'potrivit' ? 'good' : 'warn', go: 'manager/rapoarte', tag: 'mgr-fb-' + row.id,
        title: 'LEADURI ' + tag(b.city) + ' ' + arrow + ' - ' + LEVELS[b.level] + ', calitate ' + QUALITY[b.quality],
        text: (row.byName ? row.byName.split(' ')[0] + ': ' : '') + (reasons.length ? reasons.map((x) => REASONS[x]).join(', ') + ' · ' : '') + (details ? details.slice(0, 80) + ' · ' : '') +
          (c.quality7 ? c.quality7.leads + ' leaduri în 7 zile: ' + c.quality7.answered + (c.quality7.answered === 1 ? ' a răspuns, ' : ' au răspuns, ') + c.quality7.booked + ' programate, ' + c.quality7.came + (c.quality7.came === 1 ? ' a venit, ' : ' au venit, ') + c.quality7.paid + (c.quality7.paid === 1 ? ' a plătit' : ' au plătit') : c.leads7 + ' leaduri în 7 zile') + ' · ' + c.freeHoursNext7 + ' ore libere',
      });
      res.status(200).json({ ok: true, feedback: row });
      return;
    }
    if (b.action === 'feedback_list') {
      const list = (await readJSON(KEYS.feedback, [])).filter(seen).reverse().slice(0, 100);
      res.status(200).json({ ok: true, feedback: list, levels: LEVELS, quality: QUALITY, reasons: REASONS });
      return;
    }

    if (b.action === 'close_prefill') {
      if (!cityOk(b.city)) return fail(400, 'invalid_city');
      const date = isDay(b.date) ? b.date : roNow().date;
      const closes = (await readJSON(KEYS.closes, [])).filter(seen);
      res.status(200).json({ ok: true, system: await prefill(b.city, date), last: closes.filter((x) => x.city === b.city && x.date === date).slice(-1)[0] || null });
      return;
    }
    if (b.action === 'close') {
      if (!cityOk(b.city)) return fail(400, 'invalid_city');
      const date = isDay(b.date) ? b.date : '';
      if (!date || date > roNow().date) return fail(400, 'invalid_date');
      const counted = Number(b.cashCounted);
      if (!Number.isFinite(counted) || counted < 0 || counted > 1e6) return fail(400, 'invalid_cash');
      const posIn = b.posAmount === '' || b.posAmount == null ? null : Number(b.posAmount);
      if (posIn != null && (!Number.isFinite(posIn) || posIn < 0 || posIn > 1e6)) return fail(400, 'invalid_pos');
      if (!FATES[b.cashFate]) return fail(400, 'invalid_fate');
      const deposited = b.cashFate === 'depus' ? Number(b.deposited) : 0;
      if (b.cashFate === 'depus' && (!Number.isFinite(deposited) || deposited <= 0 || deposited > 1e6)) return fail(400, 'invalid_deposit');
      const sys = await prefill(b.city, date);
      const pos = posIn != null ? r2(posIn) : sys.pos.connected ? sys.pos.total : null;
      const row = {
        id: crypto.randomUUID(), at: new Date().toISOString(), by: session.employeeId, byName: await who(), city: b.city, date,
        system: { cash: sys.cash, card: sys.card, transfer: sys.transfer, count: sys.count, pos: sys.pos.connected ? sys.pos.total : null },
        cashCounted: r2(counted), pos, posSource: posIn != null ? 'scris' : sys.pos.connected ? 'myPOS' : '',
        cashDiff: r2(counted - sys.cash), cardDiff: pos != null ? r2(pos - sys.card) : null,
        cashFate: b.cashFate, deposited: r2(deposited), note: clip(b.note, 600),
      };
      await append(KEYS.closes, row);
      const off = Math.abs(row.cashDiff) >= 1 || (row.cardDiff != null && Math.abs(row.cardDiff) >= 1);
      const money = (n) => N.leiTxt(n);
      await N.notifyMany(store, await N.adminIds(store), {
        kind: 'report', tone: off ? 'warn' : 'good', go: 'manager/casa', tag: 'mgr-close-' + b.city + '-' + date,
        // a close that adds up stays in the bell; a difference or a deposit rings on the phone too
        ownerPush: off || b.cashFate === 'depus',
        title: 'ÎNCHIDERE ZI ' + tag(b.city) + ' 🧾 - ' + (off ? 'diferență' : 'în regulă'),
        text: 'Cash ' + money(row.cashCounted) + (row.cashDiff ? ' (' + (row.cashDiff > 0 ? '+' : '') + money(row.cashDiff) + ')' : '') +
          (row.pos != null ? ' · POS ' + money(row.pos) + (row.cardDiff ? ' (' + (row.cardDiff > 0 ? '+' : '') + money(row.cardDiff) + ')' : '') : '') +
          ' · ' + (b.cashFate === 'depus' ? 'depus ' + money(row.deposited) : 'cash pentru ridicare'),
      });
      res.status(200).json({ ok: true, close: row });
      return;
    }
    if (b.action === 'closes_list') {
      const list = (await readJSON(KEYS.closes, [])).filter(seen).reverse().slice(0, 120);
      res.status(200).json({ ok: true, closes: list, fates: FATES });
      return;
    }

    if (b.action === 'pos') {
      if (!cityOk(b.city)) return fail(400, 'invalid_city');
      const today = roNow().date;
      const to = isDay(b.to) && b.to <= today ? b.to : today;
      let from = isDay(b.from) ? b.from : addDay(to, -6);
      if (from > to) from = to;
      if (from < addDay(to, -62)) from = addDay(to, -62);
      const p = await posOf(b.city, from, to);
      res.status(200).json({ ok: true, city: b.city, from, to, connected: p.connected, terminals: p.terminals, syncedAt: p.syncedAt || '', payments: p.payments });
      return;
    }

    if (b.action === 'report_draft' || b.action === 'report_send') {
      const today = roNow().date;
      // no week given: on a Monday the week that just ended (Monday to Sunday), else this week so far
      const monday = isDay(b.week) ? mondayOf(b.week) : new Date(today + 'T12:00:00Z').getUTCDay() === 1 ? addDay(mondayOf(today), -7) : mondayOf(today);
      if (monday > today) return fail(400, 'invalid_week');
      const numbers = weekNumbers(await load(), monday, mine);
      if (b.action === 'report_draft') { res.status(200).json({ ok: true, week: monday, to: addDay(monday, 6), numbers }); return; }
      const notes = clip(b.notes, 3000), problems = clip(b.problems, 3000);
      if (!notes && !problems) return fail(400, 'missing_notes');
      const row = { id: crypto.randomUUID(), at: new Date().toISOString(), by: session.employeeId, byName: await who(), week: monday, to: addDay(monday, 6), numbers, notes, problems };
      await append(KEYS.reports, row);
      const sum = mine.map((c) => tag(c) + ' ' + N.leiTxt(numbers[c].collected)).join(' · ');
      await N.notifyMany(store, await N.adminIds(store), {
        kind: 'report', tone: problems ? 'warn' : 'info', go: 'manager/rapoarte', tag: 'mgr-rep-' + row.id,
        title: 'RAPORT SĂPTĂMÂNAL 📋 - ' + monday.slice(8, 10) + '.' + monday.slice(5, 7) + '-' + row.to.slice(8, 10) + '.' + row.to.slice(5, 7),
        text: sum + (problems ? ' · Probleme: ' + problems.slice(0, 80) : ''),
      });
      res.status(200).json({ ok: true, report: row });
      return;
    }
    if (b.action === 'reports_list') {
      // the manager: the reports of her clinics (each one holds the numbers of the clinics it was written for)
      const list = (await readJSON(KEYS.reports, [])).filter((r) => session.role !== 'manager' || Object.keys(r.numbers || {}).some((c) => mine.includes(c))).reverse().slice(0, 60);
      res.status(200).json({ ok: true, reports: list });
      return;
    }

    fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-manager error:', err.message);
    res.status(500).json({ error: 'manager_failed' });
  }
};
