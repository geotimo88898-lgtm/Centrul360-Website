// The clinic's own work, per clinic: the numbers the Manager page (api/portal-manager.js) and the KPI page (api/kpi.js)
// show the same way. Collections per cosmetician per day worked vs 1500 lei, the calendar booked vs the team's hours
// (target: full + 50%), consultations followed by a package, new leads reached within 5 minutes, the messages waiting,
// the show-up rate, the collections by method. Never profit, costs, salaries or ad spend.
const T = require('./team-schedule');
const B = require('./booking');
const L = require('./left');

const CITIES = ['Timișoara', 'Arad'];
const TARGET_PER_DAY = 1500;       // lei collected per day worked, every cosmetician (the owner's monthly target)
const TARGET_FILL = 1.5;           // the calendar's target when there are too few visits to know the no-shows: full plus 50%
// the calendar's target (the owner, 16.11): full plus the share of clients who didn't come in the last 60 days, per clinic
// (fewer than 20 visits due there: both clinics together; still too few: 150%)
const NOSHOW_DAYS = 60, NOSHOW_MIN = 20;
const SELF = ['facebook-webhook', 'site-form']; // leads that came by themselves (not typed in by the team)

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null; };
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const roDay = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? B.roNow(t).date : ''; };
const roMin = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? B.roNow(t).min : null; };

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
  // someone who left counts up to her last day (her shifts, her place), never after it (team.until, _lib/booking.js)
  if (t && T.hasSchedule(t.doc, city, t.ids)) {
    return T.whoWorks(t.doc, date, city, { appts, ids: t.ids, until: t.until }).reduce((n, w) => n + Math.max(0, (toMin(w.to) || 0) - (toMin(w.from) || 0)), 0);
  }
  const off = new Set(dayAppts.filter((a) => (a.status === 'concediu' || a.block) && !a.time && a.cosmeticianId).map((a) => a.cosmeticianId)).size;
  // without a schedule: no more places than the cosmeticians of the clinic that day, once one of them has left
  let at = Number(d.at) || 0;
  if (t && t.people && t.gone && t.gone.some((g) => g.location === city)) at = Math.min(at, t.people.filter((p) => p.location === city).length + t.gone.filter((g) => g.location === city && date <= g.leftAt).length);
  return Math.max(0, (toMin(d.to) || 0) - (toMin(d.from) || 0)) * Math.max(0, at - off);
}
// a booking left on someone who had left by its day („A plecat”, _lib/left.js): not the remaining team's time, it waits
// for someone to take it (Calendar → „rămase fără cosmeticiană”)
const orphaned = (cfg, a) => { const u = cfg && cfg.team && cfg.team.until; return !!(u && a.cosmeticianId && u.has(a.cosmeticianId) && a.date > u.get(a.cosmeticianId)); };
function fill(cfg, city, from, to, appts, targetPct) {
  const tp = targetPct || TARGET_FILL * 100;
  let cap = 0, booked = 0, orphan = 0;
  for (let d = from; d <= to; d = addDay(d, 1)) {
    cap += capMin(cfg, city, d, appts);
    appts.forEach((a) => { if (!visit(a) || a.location !== city || a.date !== d) return; if (orphaned(cfg, a)) orphan += apptMin(a); else booked += apptMin(a); });
  }
  return { capHours: Math.round(cap / 6) / 10, bookedHours: Math.round(booked / 6) / 10, pct: cap ? Math.round((booked / cap) * 100) : null, targetPct: tp,
    targetHours: Math.round((cap * tp / 100) / 6) / 10, freeHours: Math.max(0, Math.round((cap - booked) / 6) / 10), orphanHours: Math.round(orphan / 6) / 10 };
}

// ------------------------------------------------------------------ the numbers of a period, per clinic
// money: collections attributed to who did the treatment (Încasări → „Cine a făcut tratamentul”); days worked: the days
// she clocked in (Condică), or, when she never clocks in, the days she has collections (said so)
// appts (optional): also her consultations and how many ended with a package (the same 7-day rule), for the monthly 1:1
// someone who left (_lib/left.js): out from the month she left; a period before it still shows her, when she worked in it
// The 1.500 rule (the same as the pay, _lib/manager-pay.js conditionOf): more than 1.500 lei a day worked, exactly
// (collected / days, not the rounded lei a day). Someone still in her official training (trainedOfficial false) is shown,
// marked „în formare”, and is out of the bonus condition.
function cosmeticians(emps, sales, attendance, city, from, to, appts) {
  return emps.filter((e) => e && e.role === 'cosmetician' && clinicOf(e.location) === city && !L.outOfMonth(e, from)).map((e) => {
    const mine = sales.filter((s) => s.source === 'incasare' && s.performedBy === e.id && s.date >= from && s.date <= to);
    const collected = r2(mine.reduce((a, s) => a + (Number(s.amount) || 0), 0));
    const punched = new Set(attendance.filter((x) => x.employeeId === e.id && x.checkIn && x.date >= from && x.date <= to).map((x) => x.date));
    const byPay = new Set(mine.map((s) => s.date));
    // a day she has collections counts as worked even when she forgot to clock in (16.11: the 1500 lei a day drives the
    // bonus, a day left out would raise her average and pay a bonus not earned)
    const payOnly = [...byPay].filter((d) => !punched.has(d)).length;
    const days = punched.size + payOnly;
    const perDay = days ? Math.round(collected / days) : 0;
    return { id: e.id, name: e.name || '', days, punched: punched.size, payOnly, daysFrom: punched.size ? (payOnly ? 'mixt' : 'pontaj') : byPay.size ? 'incasari' : '',
      collected, perDay, ok: days > 0 && collected / days > TARGET_PER_DAY, gap: !days ? TARGET_PER_DAY : collected / days > TARGET_PER_DAY ? 0 : Math.max(1, Math.ceil(TARGET_PER_DAY - collected / days)),
      ...(e.trainedOfficial === false ? { trainee: true, label: 'în formare' } : {}),
      ...(appts ? { consults: consultsWhere(appts, sales, from, to, (a) => a.cosmeticianId === e.id) } : {}), ...(e.active === false ? { left: true } : {}) };
  }).filter((x) => !x.left || x.days > 0);
}

// consultations that came (the same rule as the show rate, cameBy: finished, paid, or she paid something that day; up to
// today) and those followed, within 7 days, by a payment with a package or an upsell for the same client (the data has no
// „consultation → package” link: this is the closest real one). One she didn't come to is not a consultation that could
// sell (16.11: the share was counted on every passed booking, the no-shows lowered it).
function consultsWhere(appts, sales, from, to, keep) {
  const today = B.roNow().date, paid = paidDays(sales);
  const list = appts.filter((a) => visit(a) && isConsult(a) && keep(a) && a.date >= from && a.date <= to && a.date <= today && cameBy(a, paid));
  const sold = sales.filter((s) => s.source === 'incasare' && (Number(s.upsell) > 0 || Number(s.packageTotal) > 0));
  const same = (a, s) => (a.clientId && s.clientId && a.clientId === s.clientId) || (!!a.clientPhone && d9(a.clientPhone).length === 9 && s.clientPhone && d9(s.clientPhone) === d9(a.clientPhone)) ||
    (!a.clientId && a.clientName && s.client && fold(a.clientName) === fold(s.client));
  const closed = list.filter((a) => sold.some((s) => same(a, s) && s.date >= a.date && s.date <= addDay(a.date, 7)));
  return { total: list.length, done: list.filter((a) => a.status === 'finalizata').length, withPackage: closed.length, pct: list.length ? Math.round((closed.length / list.length) * 100) : null };
}
const consults = (appts, sales, city, from, to) => consultsWhere(appts, sales, from, to, (a) => a.location === city);

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
  const ig = await require('./social-inbox').list().catch(() => []);
  const all = items.concat(ig);
  await require('./wa-waiting').mark(all).catch(() => {});
  const w = all.filter((x) => x.waiting);
  const out = { social: w.filter((x) => !x.location).length };
  CITIES.forEach((c) => { out[c] = w.filter((x) => x.location === c).length; });
  return out;
}

// she came: the visit is finished, or paid, or she paid something that day (a payment typed in Încasări without
// closing the visit). Her day passed without any of these: she didn't come (or nobody marked it).
function paidDays(sales) {
  const k = new Set();
  (sales || []).forEach((s) => {
    if (!s || s.source !== 'incasare' || !s.date) return;
    if (s.clientId) k.add('c|' + s.clientId + '|' + s.date);
    const p = d9(s.clientPhone); if (p.length === 9) k.add('p|' + p + '|' + s.date);
  });
  return k;
}
const cameBy = (a, paid) => a.status === 'finalizata' || !!a.paidSaleId || !!(paid && ((a.clientId && paid.has('c|' + a.clientId + '|' + a.date)) || (d9(a.clientPhone).length === 9 && paid.has('p|' + d9(a.clientPhone) + '|' + a.date))));
// a cancellation is a no-show only when it came at or after the visit's hour (or HighLevel said no-show); one made before
// is a cancellation, not a client who didn't come (16.11: 7 bookings cancelled ahead showed as „0 din 7 au venit”).
// When it was cancelled: cancelledAt, written on every change to „anulată” from 16.11 (Calendar, the WhatsApp answer,
// the site's unconfirmed bookings, HighLevel's own time). A record without it is read the most careful way:
//   - made before CANCEL_FIX in the portal: late only when its last change (updatedAt) is on the visit's own day, at or
//     after its hour (the desk marking her absent then); a change on a later day says nothing about when it was
//     cancelled (an edit, a sync), so it counts as cancelled ahead
//   - from HighLevel: only its own no-show (noShow); its updatedAt is the import's
//   - made from CANCEL_FIX on without cancelledAt: ahead
const CANCEL_FIX = Date.parse('2026-11-16T06:00:00Z'); // 08:00 in Bucharest, after this was published
const fromGhl = (a) => a.createdBy === 'highlevel' || !!a.ghlId || !!a.importedAt;
function lateCancel(a) {
  if (!a || a.status !== 'anulata') return false;
  if (a.noShow) return true;
  const s = toMin(a.time);
  const after = (t, sameDayOnly) => { if (!Number.isFinite(t)) return false; const r = B.roNow(t); return (!sameDayOnly && r.date > a.date) || (r.date === a.date && (s == null || r.min >= s)); };
  if (a.cancelledAt) return after(Date.parse(a.cancelledAt), false);
  if (fromGhl(a) || !(Date.parse(a.createdAt || '') < CANCEL_FIX)) return false;
  return after(Date.parse(a.updatedAt || ''), true);
}
// The visits of a clinic over the last days, as precise as the data allows (16.11: the calendar's target rests on it):
//   window   Bucharest days from `days` ago to yesterday (today is still going on), never before the first whole day of
//            the portal (17.10): the bookings imported from HighLevel before it were marked „finalizată” just for being
//            past (_lib/ghl.js), so they would hide the no-shows
//   due      a booking of a client on its day: not leave or a time block, not a test („Test …”), not cancelled before its
//            hour (a cancellation at or after it is a no-show, as HighLevel's no-shows are), the same client on the same
//            day, clinic and treatment once. A „reprogramată” still on a passed day without her coming is a no-show (16.11:
//            moving a booking moves its date; one left on the old day is a visit she didn't come to, as on the KPI page);
//            `moved` counts them (they stay in due)
//   came     finished, or paid, or the client paid something that day at that clinic (the same client: her card id, her
//            phone, or her name as written on the payment); the portal has no client check-in
function visitStats(appts, sales, city, today, days, clients) {
  const first = addDay(B.roNow(require('./kpi').cfg.start).date, 1);
  let from = addDay(today, -(days || 30)); if (from < first) from = first;
  const to = addDay(today, -1);
  const phoneOf = new Map((clients || []).map((c) => [c.id, d9(c.phone)]));
  const idsOf = (clientId, phone, name) => { const p = d9(phone) || phoneOf.get(clientId) || ''; return [clientId ? 'c:' + clientId : '', p.length === 9 ? 'p:' + p : '', fold(name).trim() ? 'n:' + fold(name).trim().replace(/\s+/g, ' ') : ''].filter(Boolean); };
  const paid = new Set();
  (sales || []).forEach((x) => { if (!x || x.source !== 'incasare' || x.date < from || x.date > to || x.location !== city) return; idsOf(x.clientId, x.clientPhone, x.client).forEach((k) => paid.add(k + '|' + x.date)); });
  const ex = { leave: 0, test: 0, cancelledAhead: 0, moved: 0, duplicate: 0 };
  const seen = new Map();
  (appts || []).forEach((a) => {
    if (!a || a.location !== city || !a.date || a.date < from || a.date > to) return;
    if (a.status === 'concediu' || a.block) { ex.leave++; return; }
    if (/^\s*test\b/i.test(a.clientName || '')) { ex.test++; return; }
    const ids = idsOf(a.clientId, a.clientPhone, a.clientName);
    const came = a.status === 'finalizata' || !!a.paidSaleId || ids.some((k) => paid.has(k + '|' + a.date));
    if (a.status === 'anulata' && !came && !lateCancel(a)) { ex.cancelledAhead++; return; }
    if (a.status === 'reprogramata' && !came) ex.moved++; // a no-show (counted below), listed apart
    const key = (ids[0] || 'id:' + a.id) + '|' + a.date + '|' + fold(a.treatment).trim();
    const was = seen.get(key);
    if (was) { ex.duplicate++; was.came = was.came || came; return; }
    seen.set(key, { came });
  });
  const due = seen.size, came = [...seen.values()].filter((x) => x.came).length;
  return { from, to, due, came, noShow: due - came, pct: due ? Math.round((came / due) * 100) : null, excluded: ex };
}
// show-up of a clinic: the share of the due visits that came (the last 30 days unless said)
function showRate(appts, city, today, sales, days, clients) {
  const v = visitStats(appts, sales, city, today, days || 30, clients);
  return { due: v.due, came: v.came, pct: v.pct, from: v.from, to: v.to };
}

// the calendar's target per clinic: { target (%), noShow (%), show, due, came, from: 'clinic' | 'both' | 'default' }
function fillTargets(appts, sales, cities, today, clients) {
  const per = {}; let due = 0, came = 0;
  CITIES.forEach((c) => { const v = visitStats(appts, sales, c, today, NOSHOW_DAYS, clients); per[c] = v; due += v.due; came += v.came; });
  const out = {};
  (cities || CITIES).forEach((c) => {
    const v = per[c];
    const base = v.due >= NOSHOW_MIN ? { due: v.due, came: v.came, from: 'clinic' } : due >= NOSHOW_MIN ? { due, came, from: 'both' } : null;
    const noShow = base ? Math.round(100 - (base.came / base.due) * 100) : null;
    out[c] = { target: base ? 100 + noShow : TARGET_FILL * 100, noShow, from: base ? base.from : 'default', due: base ? base.due : v.due, came: base ? base.came : v.came,
      missed: base ? base.due - base.came : v.due - v.came, since: v.from, until: v.to, excluded: v.excluded };
  });
  return out;
}

// every record with its clinic written one way („Timișoara” / „Arad”, whatever the spelling): a payment without one takes
// its visit's, else the clinic of who did the treatment; a visit without one, its cosmetician's. The owner's and the
// manager's pages count from these, so the same clinic gives the same numbers on both (16.11).
const clinicOf = (s) => (/arad/i.test(String(s || '')) ? 'Arad' : /timi/i.test(String(s || '')) ? 'Timișoara' : '');
function normalize({ leads, appts, sales, convos, emps }) {
  const home = new Map((emps || []).map((e) => [e.id, clinicOf(e && e.location)]));
  const fix = (x, c) => (x && c && x.location !== c ? Object.assign({}, x, { location: c }) : x);
  const A = (appts || []).map((a) => (a ? fix(a, clinicOf(a.location) || home.get(a.cosmeticianId) || '') : a));
  const byId = new Map(A.filter(Boolean).map((a) => [a.id, a]));
  const S = (sales || []).map((s) => { if (!s) return s; const ap = s.appointmentId && byId.get(s.appointmentId); return fix(s, clinicOf(s.location) || (ap && clinicOf(ap.location)) || home.get(s.performedBy) || ''); });
  return { leads: (leads || []).map((l) => (l ? fix(l, clinicOf(l.location)) : l)), appts: A, sales: S, convos: (convos || []).map((c) => (c ? fix(c, clinicOf(c.location)) : c)) };
}

// the calendar of the next days, day by day (booked hours vs the team's hours)
function fillDays(cfg, city, from, days, appts, targetPct) {
  const out = [];
  for (let i = 0; i < days; i++) { const d = addDay(from, i); out.push(Object.assign({ date: d }, fill(cfg, city, d, d, appts, targetPct))); }
  return out;
}

// the collections of some payments by how they were paid (a split one: its cash and its card)
function methods(sales) {
  let cash = 0, card = 0, transfer = 0, other = 0;
  sales.forEach((s) => {
    const a = Number(s.amount) || 0;
    if (s.method === 'cash') cash += a;
    else if (s.method === 'card') card += a;
    else if (s.method === 'transfer') transfer += a;
    else if (s.method === 'cash_card') { const c = Number(s.split && s.split.cash) || 0, k = Number(s.split && s.split.card) || 0; cash += c; card += k; other += Math.max(0, a - c - k); }
    else other += a;
  });
  return { cash: r2(cash), card: r2(card), transfer: r2(transfer), other: r2(other) };
}

module.exports = { CANCEL_FIX, orphaned, visitStats, fillTargets, consultsWhere, normalize, clinicOf, paidDays, cameBy, lateCancel, CITIES, TARGET_PER_DAY, TARGET_FILL, SELF, visit, isConsult, apptMin, capMin, fill, fillDays, cosmeticians, consults, firstOutByPhone, leadSpeed, waitingNow, showRate, methods, addDay, roDay, d9, fold, r2, toMin };
