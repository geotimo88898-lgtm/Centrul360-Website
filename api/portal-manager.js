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
// Data: data/manager-feedback.json, data/day-closes.json, data/manager-reports.json (newest last, the last 400 kept).

const crypto = require('crypto');
const { readJSON, writeJSON, readJSONTagged, writeJSONIf } = require('./_lib/store');
const { requireManage } = require('./_lib/roles');
const N = require('./_lib/notify');
const T = require('./_lib/team-schedule');
const B = require('./_lib/booking');

const CITIES = ['Timișoara', 'Arad'];
const TARGET_PER_DAY = 1500;       // lei collected per day worked, every cosmetician (the owner's monthly target)
const TARGET_FILL = 1.5;           // the calendar: full plus 50% (the show-up rate eats the rest)
const LEVELS = { mult_putine: 'mult prea puține', putin_putine: 'puțin prea puține', potrivit: 'potrivit', putin_multe: 'puțin prea multe', mult_multe: 'mult prea multe' };
const FATES = { ridicare: 'păstrat pentru ridicare', depus: 'depus în contul firmei' };
const KEEP = 400;
const KEYS = { feedback: 'data/manager-feedback.json', closes: 'data/day-closes.json', reports: 'data/manager-reports.json' };
const SELF = ['facebook-webhook', 'site-form']; // leads that came by themselves (not typed in by the team)

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !isNaN(Date.parse(d + 'T12:00:00Z'));
const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const roNow = () => B.roNow();
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null; };
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const roDay = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? B.roNow(t).date : ''; };
const roMin = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? B.roNow(t).min : null; };
const monthEnd = (m) => { const [y, mo] = m.split('-').map(Number); return m + '-' + String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0'); };
const cityOk = (c) => CITIES.includes(c);
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

// ------------------------------------------------------------------ what the calendar holds
const visit = (a) => a && a.status !== 'anulata' && a.status !== 'concediu' && !a.block;
const isConsult = (a) => /consulta/.test(fold(a && a.treatment));
// minutes of an appointment (no end: an hour, as the booking counts it)
function apptMin(a) {
  const s = toMin(a.time), e = toMin(a.endTime);
  if (s == null) return 0;
  return e != null && e > s ? e - s : 60;
}
// the team's minutes for clients that day in a city: the cosmeticians' shifts once the city has a weekly schedule
// (Calendar → Program echipă), else the clinic's hours times its places (Calendar → Online) minus who is on leave
function capMin(cfg, city, date, appts) {
  const c = cfg.cities[city], d = c && c.days[new Date(date + 'T12:00:00Z').getUTCDay()];
  if (!d || !d.on || (c.closed || []).includes(date)) return 0;
  const dayAppts = appts.filter((a) => a && a.location === city && a.date === date && a.status !== 'anulata');
  if (dayAppts.some((a) => (a.status === 'concediu' || a.block) && !a.time && !a.cosmeticianId)) return 0; // the clinic closed that day
  const t = cfg.team;
  if (t && T.hasSchedule(t.doc, city, t.ids)) {
    return T.whoWorks(t.doc, date, city, { appts, ids: t.ids }).reduce((n, w) => n + Math.max(0, (toMin(w.to) || 0) - (toMin(w.from) || 0)), 0);
  }
  const off = new Set(dayAppts.filter((a) => (a.status === 'concediu' || a.block) && !a.time && a.cosmeticianId).map((a) => a.cosmeticianId)).size;
  return Math.max(0, (toMin(d.to) || 0) - (toMin(d.from) || 0)) * Math.max(0, (Number(d.at) || 0) - off);
}
function fill(cfg, city, from, to, appts) {
  let cap = 0, booked = 0;
  for (let d = from; d <= to; d = addDay(d, 1)) {
    cap += capMin(cfg, city, d, appts);
    booked += appts.filter((a) => visit(a) && a.location === city && a.date === d).reduce((n, a) => n + apptMin(a), 0);
  }
  return { capHours: Math.round(cap / 6) / 10, bookedHours: Math.round(booked / 6) / 10, pct: cap ? Math.round((booked / cap) * 100) : null, targetPct: TARGET_FILL * 100,
    targetHours: Math.round((cap * TARGET_FILL) / 6) / 10, freeHours: Math.max(0, Math.round((cap - booked) / 6) / 10) };
}

// ------------------------------------------------------------------ the numbers of a period, per clinic
// money: collections attributed to who did the treatment (Încasări → „Cine a făcut tratamentul”); days worked: the days
// she clocked in (Condică), or, when she never clocks in, the days she has collections (said so)
function cosmeticians(emps, sales, attendance, city, from, to) {
  return emps.filter((e) => e.role === 'cosmetician' && e.active !== false && e.location === city).map((e) => {
    const mine = sales.filter((s) => s.source === 'incasare' && s.performedBy === e.id && s.date >= from && s.date <= to);
    const collected = r2(mine.reduce((a, s) => a + (Number(s.amount) || 0), 0));
    const punched = new Set(attendance.filter((x) => x.employeeId === e.id && x.checkIn && x.date >= from && x.date <= to).map((x) => x.date));
    const byPay = new Set(mine.map((s) => s.date));
    const days = punched.size || byPay.size;
    const perDay = days ? Math.round(collected / days) : 0;
    return { id: e.id, name: e.name || '', days, daysFrom: punched.size ? 'pontaj' : byPay.size ? 'incasari' : '', collected, perDay, ok: days > 0 && perDay >= TARGET_PER_DAY, gap: days ? Math.max(0, TARGET_PER_DAY - perDay) : TARGET_PER_DAY };
  });
}

// consultations that took place (not cancelled, up to today) and those followed, within 7 days, by a payment with a
// package or an upsell for the same client (the data has no „consultation → package” link: this is the closest real one)
function consults(appts, sales, city, from, to) {
  const list = appts.filter((a) => visit(a) && isConsult(a) && a.location === city && a.date >= from && a.date <= to);
  const sold = sales.filter((s) => s.source === 'incasare' && (Number(s.upsell) > 0 || Number(s.packageTotal) > 0));
  const same = (a, s) => (a.clientId && s.clientId && a.clientId === s.clientId) || (!!a.clientPhone && d9(a.clientPhone).length === 9 && s.clientPhone && d9(s.clientPhone) === d9(a.clientPhone)) ||
    (!a.clientId && a.clientName && s.client && fold(a.clientName) === fold(s.client));
  const closed = list.filter((a) => sold.some((s) => same(a, s) && s.date >= a.date && s.date <= addDay(a.date, 7)));
  return { total: list.length, done: list.filter((a) => a.status === 'finalizata').length, withPackage: closed.length, pct: list.length ? Math.round((closed.length / list.length) * 100) : null };
}

// new leads (from the ads and the site) and how fast a person reached them: the first call or note logged in the
// Pipeline, a booking, or the first WhatsApp answer a person wrote (not the automatic ones)
function firstOutByPhone(convos) {
  const m = new Map();
  (convos || []).forEach((c) => {
    const k = d9(c.phone);
    if (k.length !== 9) return;
    const outs = (c.messages || []).filter((x) => x.direction === 'out' && !x.auto && x.timestamp).map((x) => x.timestamp).sort();
    if (outs.length) m.set(k, outs);
  });
  return m;
}
function leadSpeed(leads, convos, cfg, city, from, to) {
  const outs = firstOutByPhone(convos);
  const list = leads.filter((l) => (SELF.includes(l.createdBy) || ['facebook', 'site', 'instagram'].includes(l.source)) && l.location === city && roDay(l.createdAt) >= from && roDay(l.createdAt) <= to);
  const rows = list.map((l) => {
    const at = Date.parse(l.createdAt);
    const acts = (l.activities || []).filter((a) => ['contact', 'booking'].includes(a.type) && a.author && Date.parse(a.at) >= at).map((a) => Date.parse(a.at));
    const wa = (outs.get(d9(l.phone)) || []).map((t) => Date.parse(t)).filter((t) => t >= at);
    const first = Math.min(...acts.concat(wa), Infinity);
    const c = cfg.cities[city], d = c && c.days[new Date(roDay(l.createdAt) + 'T12:00:00Z').getUTCDay()], mm = roMin(l.createdAt);
    const open = !!(d && d.on && mm != null && mm >= toMin(d.from) && mm < toMin(d.to) && !(c.closed || []).includes(roDay(l.createdAt)));
    return { mins: Number.isFinite(first) ? (first - at) / 60e3 : null, open };
  });
  const inHours = rows.filter((r) => r.open);
  const within = (xs) => xs.filter((r) => r.mins != null && r.mins <= 5).length;
  const reached = rows.filter((r) => r.mins != null).map((r) => r.mins).sort((a, b) => a - b);
  return { total: rows.length, within5: within(rows), pct: rows.length ? Math.round((within(rows) / rows.length) * 100) : null,
    inHours: inHours.length, inHoursWithin5: within(inHours), inHoursPct: inHours.length ? Math.round((within(inHours) / inHours.length) * 100) : null,
    never: rows.filter((r) => r.mins == null).length, median: reached.length ? Math.round(reached[Math.floor(reached.length / 2)]) : null };
}

// the conversations waiting for an answer now (she wrote last, nobody answered, nobody marked „Rezolvat”: Mesaje's rule)
async function waitingNow(convos) {
  const items = (convos || []).map((c) => {
    const msgs = c.messages || [], last = msgs[msgs.length - 1];
    return { phone: c.phone, location: c.location || '', lastText: last ? last.text : '', lastDirection: last ? last.direction : '',
      lastInAt: msgs.reduce((a, m) => (m.direction === 'in' && m.timestamp > a ? m.timestamp : a), ''),
      lastReplyAt: msgs.reduce((a, m) => (m.direction === 'out' && !m.auto && m.timestamp > a ? m.timestamp : a), '') };
  });
  const ig = await require('./_lib/social-inbox').list().catch(() => []);
  const all = items.concat(ig);
  await require('./_lib/wa-waiting').mark(all).catch(() => {});
  const w = all.filter((x) => x.waiting);
  const out = { social: w.filter((x) => !x.location).length };
  CITIES.forEach((c) => { out[c] = w.filter((x) => x.location === c).length; });
  return out;
}

// show-up: of the visits that were due in the last 30 days (not moved), how many came (finalizată); cancellations count
// as not come, the ones never marked too (said so in the page)
function showRate(appts, city, today) {
  const from = addDay(today, -30);
  const due = appts.filter((a) => a && a.location === city && a.date >= from && a.date < today && a.status !== 'concediu' && !a.block && a.status !== 'reprogramata');
  const came = due.filter((a) => a.status === 'finalizata').length;
  return { due: due.length, came, pct: due.length ? Math.round((came / due.length) * 100) : null };
}

async function load() {
  const [emps, sales, appts, attendance, leads, convos, cfg] = await Promise.all([
    readJSON('data/employees.json', []), readJSON('data/sales.json', []), readJSON('data/appointments.json', []), readJSON('data/attendance.json', []),
    readJSON('data/leads.json', []), readJSON('data/whatsapp-conversations.json', []), B.settings({ team: true }),
  ]);
  return { emps, sales, appts, attendance, leads, convos, cfg };
}

async function stats(month) {
  const now = roNow();
  const m = /^\d{4}-\d{2}$/.test(String(month || '')) && month <= now.date.slice(0, 7) ? month : now.date.slice(0, 7);
  const from = m + '-01', to = m === now.date.slice(0, 7) ? now.date : monthEnd(m);
  const D = await load();
  const waiting = await waitingNow(D.convos);
  const cities = {};
  CITIES.forEach((city) => {
    const team = cosmeticians(D.emps, D.sales, D.attendance, city, from, to);
    const counted = team.filter((x) => x.days > 0);
    cities[city] = {
      team,
      bonus: { ok: counted.length > 0 && counted.every((x) => x.ok), counted: counted.length, below: counted.filter((x) => !x.ok).length },
      fillMonth: fill(D.cfg, city, from, to, D.appts),
      fillAhead: fill(D.cfg, city, now.date, addDay(now.date, 6), D.appts),
      schedule: !!(D.cfg.team && T.hasSchedule(D.cfg.team.doc, city, D.cfg.team.ids)),
      consults: consults(D.appts, D.sales, city, from, to),
      leads: leadSpeed(D.leads, D.convos, D.cfg, city, from, to),
      waiting: waiting[city] || 0,
    };
  });
  return { ok: true, month: m, from, to, targets: { perDay: TARGET_PER_DAY, fill: TARGET_FILL * 100, consults: 50, leads5: 100 }, waitingSocial: waiting.social || 0, cities };
}

async function context(city) {
  const now = roNow();
  const D = await load();
  const since = Date.now() - 7 * 864e5;
  const ahead = addDay(now.date, 6);
  const f = fill(D.cfg, city, now.date, ahead, D.appts);
  return {
    city,
    leads7: D.leads.filter((l) => l.location === city && Date.parse(l.createdAt) >= since).length,
    consultsNext7: D.appts.filter((a) => visit(a) && isConsult(a) && a.location === city && a.date >= now.date && a.date <= ahead).length,
    visitsNext7: D.appts.filter((a) => visit(a) && a.location === city && a.date >= now.date && a.date <= ahead).length,
    freeHoursNext7: f.freeHours, capHoursNext7: f.capHours, bookedHoursNext7: f.bookedHours, fillNext7: f.pct,
    show30: showRate(D.appts, city, now.date),
    at: new Date().toISOString(),
  };
}

// ------------------------------------------------------------------ the day's close
async function prefill(city, date) {
  const sales = (await readJSON('data/sales.json', [])).filter((s) => s.source === 'incasare' && s.date === date && (s.location || '') === city);
  let cash = 0, card = 0, transfer = 0;
  sales.forEach((s) => {
    const a = Number(s.amount) || 0;
    if (s.method === 'cash') cash += a;
    else if (s.method === 'card') card += a;
    else if (s.method === 'transfer') transfer += a;
    else if (s.method === 'cash_card') { cash += Number(s.split && s.split.cash) || 0; card += Number(s.split && s.split.card) || 0; }
  });
  const pos = await posOf(city, date, date);
  return { city, date, count: sales.length, cash: r2(cash), card: r2(card), transfer: r2(transfer),
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
function weekNumbers(D, monday) {
  const sunday = addDay(monday, 6);
  const out = {};
  CITIES.forEach((city) => {
    const inc = D.sales.filter((s) => s.source === 'incasare' && (s.location || '') === city && s.date >= monday && s.date <= sunday);
    const team = cosmeticians(D.emps, D.sales, D.attendance, city, monday, sunday);
    const visits = D.appts.filter((a) => visit(a) && a.location === city && a.date >= monday && a.date <= sunday);
    const cancelled = D.appts.filter((a) => a && a.location === city && a.status === 'anulata' && a.date >= monday && a.date <= sunday && !a.block);
    const made = D.appts.filter((a) => a && a.location === city && !a.block && a.status !== 'concediu' && roDay(a.createdAt) >= monday && roDay(a.createdAt) <= sunday);
    const worked = team.filter((x) => x.days > 0);
    out[city] = {
      collected: r2(inc.reduce((a, s) => a + (Number(s.amount) || 0), 0)), payments: inc.length,
      perDayAvg: worked.length ? Math.round(worked.reduce((a, x) => a + x.perDay, 0) / worked.length) : 0,
      team: team.map((x) => ({ name: x.name, days: x.days, collected: x.collected, perDay: x.perDay })),
      booked: made.length, visits: visits.length, shows: visits.filter((a) => a.status === 'finalizata').length, cancelled: cancelled.length,
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
  const who = async () => {
    if (session.employeeId === 'admin') return 'Admin';
    const e = (await readJSON('data/employees.json', [])).find((x) => x.id === session.employeeId);
    return (e && e.name) || '';
  };
  try {
    if (b.action === 'stats') { res.status(200).json(await stats(b.month)); return; }

    if (b.action === 'context') {
      if (!cityOk(b.city)) return fail(400, 'invalid_city');
      res.status(200).json({ ok: true, context: await context(b.city) });
      return;
    }

    if (b.action === 'feedback') {
      if (!cityOk(b.city)) return fail(400, 'invalid_city');
      if (!LEVELS[b.level]) return fail(400, 'invalid_level');
      const details = clip(b.details, 1500);
      const row = { id: crypto.randomUUID(), at: new Date().toISOString(), by: session.employeeId, byName: await who(), city: b.city, level: b.level, details, context: await context(b.city) };
      await append(KEYS.feedback, row);
      const c = row.context;
      const arrow = /putine/.test(b.level) ? '📉' : /multe/.test(b.level) ? '📈' : '👌';
      await N.notifyMany(store, await N.adminIds(store), {
        kind: 'alert', tone: b.level === 'potrivit' ? 'good' : 'warn', go: 'manager', tag: 'mgr-fb-' + row.id,
        title: 'LEADURI ' + tag(b.city) + ' ' + arrow + ' - ' + LEVELS[b.level],
        text: (row.byName ? row.byName.split(' ')[0] + ': ' : '') + (details ? details.slice(0, 90) + ' · ' : '') + c.leads7 + ' leaduri în 7 zile · ' + c.freeHoursNext7 + ' ore libere în 7 zile',
      });
      res.status(200).json({ ok: true, feedback: row });
      return;
    }
    if (b.action === 'feedback_list') {
      const list = (await readJSON(KEYS.feedback, [])).slice().reverse().slice(0, 100);
      res.status(200).json({ ok: true, feedback: list, levels: LEVELS });
      return;
    }

    if (b.action === 'close_prefill') {
      if (!cityOk(b.city)) return fail(400, 'invalid_city');
      const date = isDay(b.date) ? b.date : roNow().date;
      const closes = await readJSON(KEYS.closes, []);
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
        kind: 'report', tone: off ? 'warn' : 'good', go: 'manager', tag: 'mgr-close-' + b.city + '-' + date,
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
      const list = (await readJSON(KEYS.closes, [])).slice().reverse().slice(0, 120);
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
      const monday = isDay(b.week) ? mondayOf(b.week) : mondayOf(today);
      if (monday > today) return fail(400, 'invalid_week');
      const numbers = weekNumbers(await load(), monday);
      if (b.action === 'report_draft') { res.status(200).json({ ok: true, week: monday, to: addDay(monday, 6), numbers }); return; }
      const notes = clip(b.notes, 3000), problems = clip(b.problems, 3000);
      if (!notes && !problems) return fail(400, 'missing_notes');
      const row = { id: crypto.randomUUID(), at: new Date().toISOString(), by: session.employeeId, byName: await who(), week: monday, to: addDay(monday, 6), numbers, notes, problems };
      await append(KEYS.reports, row);
      const sum = CITIES.map((c) => tag(c) + ' ' + N.leiTxt(numbers[c].collected)).join(' · ');
      await N.notifyMany(store, await N.adminIds(store), {
        kind: 'report', tone: problems ? 'warn' : 'info', go: 'manager', tag: 'mgr-rep-' + row.id,
        title: 'RAPORT SĂPTĂMÂNAL 📋 - ' + monday.slice(8, 10) + '.' + monday.slice(5, 7) + '-' + row.to.slice(8, 10) + '.' + row.to.slice(5, 7),
        text: sum + (problems ? ' · Probleme: ' + problems.slice(0, 80) : ''),
      });
      res.status(200).json({ ok: true, report: row });
      return;
    }
    if (b.action === 'reports_list') {
      const list = (await readJSON(KEYS.reports, [])).slice().reverse().slice(0, 60);
      res.status(200).json({ ok: true, reports: list });
      return;
    }

    fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-manager error:', err.message);
    res.status(500).json({ error: 'manager_failed' });
  }
};
