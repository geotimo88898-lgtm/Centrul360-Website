// Programul echipei (the owner, 9.11: „unde trec programul fetelor”): when each cosmetician works, and where.
// data/team-schedule.json:
//   { weekly: { <employeeId>: { location: 'Timișoara' | 'Arad', days: { '1'..'7' (Monday..Sunday): { on, from, to } } } },
//     dates:  { 'YYYY-MM-DD': { <employeeId>: { on, from, to, location } } },
//     breaks: { 'YYYY-MM-DD': { <employeeId>: { from } | { off: true }, plus by, byName, at } } }  (the break moved or left out
//             for that one day, see „The break” below)
//     extra:  { 'YYYY-MM-DD': { <employeeId>: [{ id, from, to, location, note, by, byName, at }] } }  (overtime, „Ore
//             suplimentare”, apart from her hours: see „Overtime” below)
// A date entry replaces that employee's weekly day (a day off, other hours, the other city). An approved leave (an
// appointment with status 'concediu', or a block for her with no hour) means she is off that day, whatever the schedule.
// Read by the Calendar (who works, the booking form) and by the site's free hours (api/_lib/booking.js): once a city
// has a weekly schedule, the clients it takes at once are the cosmeticians working at that hour.

const { readJSON, readJSONTagged, writeJSONIf } = require('./store');

const KEY = 'data/team-schedule.json';
const CITIES = ['Timișoara', 'Arad'];
const DAYS = ['1', '2', '3', '4', '5', '6', '7'];

const isTime = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || '')) || String(t) === '24:00';
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null; };
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !isNaN(Date.parse(d + 'T12:00:00Z'));
// 1 = Monday … 7 = Sunday
const isoDow = (date) => { const d = new Date(date + 'T12:00:00Z').getUTCDay(); return String(d === 0 ? 7 : d); };

const empty = () => ({ weekly: {}, dates: {}, breaks: {}, extra: {} });
function norm(d) {
  const out = empty();
  if (d && typeof d === 'object') {
    if (d.weekly && typeof d.weekly === 'object') out.weekly = d.weekly;
    if (d.dates && typeof d.dates === 'object') out.dates = d.dates;
    if (d.breaks && typeof d.breaks === 'object') out.breaks = d.breaks;
    if (d.extra && typeof d.extra === 'object') out.extra = d.extra;
  }
  return out;
}
async function load() { return norm(await readJSON(KEY, null)); }

// a change that never overwrites one made meanwhile (two admins saving two people at once)
async function update(fn) {
  for (let i = 0; i < 6; i++) {
    const { data, etag } = await readJSONTagged(KEY, null);
    const doc = norm(data);
    fn(doc);
    doc.updatedAt = new Date().toISOString();
    if (await writeJSONIf(KEY, doc, etag)) return doc;
  }
  throw new Error('team schedule: busy');
}

// the active cosmeticians (data/employees.json)
async function people() {
  const list = await readJSON('data/employees.json', []);
  return (Array.isArray(list) ? list : []).filter((e) => e && e.id && e.id !== 'admin' && e.active !== false && e.role === 'cosmetician')
    .map((e) => ({ id: e.id, name: e.name || '', location: CITIES.includes(e.location) ? e.location : '' }));
}

// everyone whose hours can be set (Calendar → Program echipă, the owner and the manager, 15.11): the cosmeticians plus
// reception and the manager. Only the cosmeticians count as places for clients (people() above, the booking and the
// „La lucru” strip); the desk's hours are for the team's own planning.
async function staff() {
  const list = await readJSON('data/employees.json', []);
  return (Array.isArray(list) ? list : []).filter((e) => e && e.id && e.id !== 'admin' && e.active !== false && ['cosmetician', 'receptie', 'manager'].includes(e.role))
    .map((e) => ({ id: e.id, name: e.name || '', role: e.role, location: CITIES.includes(e.location) ? e.location : '' }));
}

// her leave that day: an approved leave (concediu) or a block for her with no hour
function onLeave(appts, employeeId, date) {
  return (appts || []).some((a) => a && a.date === date && a.cosmeticianId === employeeId && a.status !== 'anulata' &&
    (a.status === 'concediu' || a.block) && !a.time);
}

// her day: { on, from, to, location } from the date entry, else from her week; null when nothing is set for her
function dayOf(doc, employeeId, date) {
  const w = doc.weekly && doc.weekly[employeeId];
  const x = doc.dates && doc.dates[date] && doc.dates[date][employeeId];
  if (x) return { on: !!x.on, from: x.from, to: x.to, location: x.location || (w && w.location) || '', exception: true };
  if (!w || !w.days) return null;
  const d = w.days[isoDow(date)];
  if (!d) return { on: false, from: '', to: '', location: w.location || '' };
  return { on: !!d.on, from: d.from, to: d.to, location: w.location || '' };
}

// where and when she works that day ({ from, to, location }), or null (off, on leave, nothing set). With a time: only
// when that minute is inside her hours.
// opts.until (Map id → last working day, the ones who left, „A plecat”): she works up to that day, never after it,
// whatever opts.ids (the active ones) says, so a past day keeps her shifts and a day after it has none
function workingAt(doc, employeeId, date, time, opts) {
  const o = opts || {};
  if (o.until && o.until.has(employeeId)) { if (!(date <= o.until.get(employeeId))) return null; }
  else if (o.ids && !has(o.ids, employeeId)) return null;
  const d = dayOf(doc, employeeId, date);
  if (!d || !d.on || toMin(d.from) == null || toMin(d.to) == null || toMin(d.to) <= toMin(d.from)) return null;
  if (onLeave(o.appts, employeeId, date)) return null;
  if (time != null && time !== '') { const t = toMin(time); if (t == null || t < toMin(d.from) || t >= toMin(d.to)) return null; }
  return { from: d.from, to: d.to, location: d.location };
}
const has = (ids, id) => (ids instanceof Set ? ids.has(id) : Array.isArray(ids) ? ids.includes(id) : true);

// who works in a city that day: [{ employeeId, from, to }] by start. opts: { appts (for leave), ids (the active ones),
// until (the ones who left, up to their last day) }
function whoWorks(doc, date, location, opts) {
  const o = opts || {};
  const ids = new Set(Object.keys(doc.weekly || {}).concat(Object.keys((doc.dates && doc.dates[date]) || {})));
  const out = [];
  ids.forEach((id) => {
    const w = workingAt(doc, id, date, null, o);
    if (w && (!location || w.location === location)) out.push({ employeeId: id, from: w.from, to: w.to });
  });
  return out.sort((a, b) => a.from.localeCompare(b.from) || a.employeeId.localeCompare(b.employeeId));
}

// a city has a schedule once at least one (active) cosmetician there has a weekly day on
function hasSchedule(doc, location, ids) {
  return Object.keys(doc.weekly || {}).some((id) => {
    const w = doc.weekly[id];
    return w && w.location === location && (!ids || has(ids, id)) && Object.values(w.days || {}).some((d) => d && d.on);
  });
}

// ------------------------------------------------------------------ the break (the owner, 16.11)
// „o pauză de 30 de minute la mijlocul programului de lucru la toate cosmeticienele”: every day she works, from 16.11.
// Never stored as an appointment: it is worked out from her shift that day (the date entry, else her week), so it follows
// every change of the schedule by itself.
//   when:  the half hour at the middle of her shift, rounded down to the clock's half hour (09-20 and 10-19 → 14:30-15:00,
//          09-17 → 13:00-13:30); a shift under 5 hours has none
//   moved: doc.breaks[date][id] = { from } (that day only; „Mută pauza”); a moved break that no longer fits her shift (the
//          shift changed later) goes back to the middle. { off: true }: no break that day („Fără pauză azi”).
//   each her own: the middle of HER shift, never a break of the whole clinic; two with the same shift take it at the same
//          time (the owner, 16.11: „se face per mijlocul turei la fiecare cosmeticiană, nu e o pauză generală a salonului”)
//   clients win: a client of hers (or a block for her) over the break that day, and there is none that day; the same when
//          the clinic's clients at that half hour need her (more clients than the cosmeticians not on a break)
// Read by the site's free hours (_lib/booking.js: she is not a place during it), the Calendar (the yellow block), the
// calendar's fill (_lib/clinic.js: her minutes for clients are 30 fewer) and the free hours for calls (_lib/followups.js).
// Never by the pontaj, the hours worked or the pay.
const BREAK_MIN = 30;                // how long
const BREAK_SHIFT_MIN = 5 * 60;      // the shortest shift with a break
const BREAK_SINCE = '2026-11-16';    // the first day with a break
const hm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const aEnd = (a) => { const s = toMin(a.time), e = toMin(a.endTime); return s == null ? null : e != null && e > s ? e : s + 60; };
const live = (a) => a && a.status !== 'anulata';
const isVisit = (a) => live(a) && a.status !== 'concediu' && !a.block && toMin(a.time) != null;

// the automatic start of the break of a shift (minutes), or null (a shift under 5 hours, hours not set)
function midBreak(from, to) {
  const f = toMin(from), t = toMin(to);
  if (f == null || t == null || t - f < BREAK_SHIFT_MIN) return null;
  let s = Math.floor((f + t) / 2 / 30) * 30;
  if (s < f) s = Math.ceil(f / 30) * 30;
  return s + BREAK_MIN <= t ? s : null;
}
// what of hers sits on a time that day: her clients and the blocks for her ([start, end, what]); skipId: an appointment left out
function hersOn(appts, employeeId, date, skipId) {
  return (appts || []).filter((a) => a && a.date === date && a.cosmeticianId === employeeId && live(a) && toMin(a.time) != null && a.id !== skipId &&
    (isVisit(a) || a.block)).map((a) => [toMin(a.time), aEnd(a), a.block ? 'block' : 'client']);
}
const over = (list, s, e) => list.find((x) => x[0] < e && x[1] > s) || null;

// her break that day before the clients are looked at: { from, to (minutes), mid, shift: [from, to], moved?, fell?, off? }
// or null (not working, a short shift, a day before the breaks)
function plannedBreak(doc, employeeId, date, opts) {
  if (!(date >= BREAK_SINCE)) return null;
  const w = workingAt(doc, employeeId, date, null, opts);
  if (!w) return null;
  const f = toMin(w.from), t = toMin(w.to), mid = midBreak(w.from, w.to);
  if (mid == null) return null;
  const x = doc.breaks && doc.breaks[date] && doc.breaks[date][employeeId];
  const base = { mid, shift: [f, t], location: w.location };
  if (x && x.off) return Object.assign(base, { from: mid, to: mid + BREAK_MIN, off: true, by: x.byName || '', at: x.at || '' });
  const s = x ? toMin(x.from) : null;
  if (s != null) { // put there by hand (at the middle too: then it stays there, a colleague's doesn't push it)
    if (s >= f && s + BREAK_MIN <= t) return Object.assign(base, { from: s, to: s + BREAK_MIN, moved: s !== mid, pinned: true, by: x.byName || '', at: x.at || '' });
    return Object.assign(base, { from: mid, to: mid + BREAK_MIN, fell: true }); // her shift changed after the move
  }
  return Object.assign(base, { from: mid, to: mid + BREAK_MIN });
}

// the breaks of a city's day, everyone working: [{ employeeId, location, from, to ('HH:MM'), mid, shiftFrom, shiftTo, on, why,
// moved, fell, by, at }]. on: the break holds; why when it doesn't: 'off' (left out for the day), 'client' (a client of hers on
// it), 'block' (a block for her on it), 'busy' (the clinic's clients then need her). opts: { appts, ids, until } as whoWorks.
function dayBreaks(doc, date, location, opts) {
  const o = opts || {};
  if (!(date >= BREAK_SINCE)) return [];
  const appts = (o.appts || []).filter((a) => a && a.date === date);
  const out = whoWorks(doc, date, location, o).map((w) => {
    const p = plannedBreak(doc, w.employeeId, date, o);
    if (!p) return null;
    const row = { employeeId: w.employeeId, location: p.location, from: hm(p.from), to: hm(p.to), mid: hm(p.mid), shiftFrom: w.from, shiftTo: w.to,
      on: !p.off, why: p.off ? 'off' : '', moved: !!p.moved, pinned: !!p.pinned, fell: !!p.fell, by: p.by || '', at: p.at || '' };
    return row;
  }).filter(Boolean);
  // her own clients: a client of hers (or a block for her) on it, and there is no break that day
  out.filter((b) => b.on).forEach((b) => {
    const mine = hersOn(appts, b.employeeId, date);
    const hit = over(mine, toMin(b.from), toMin(b.to));
    if (hit) { b.on = false; b.why = hit[2]; }
  });
  // the clinic's clients at that half hour (anyone's, or no one's yet) fit in the cosmeticians not on a break; otherwise one
  // break gives way (the latest, then by id), until they fit. A block for the whole clinic: closed then, nothing to do.
  const here = appts.filter((a) => a.location === location && live(a) && toMin(a.time) != null);
  if (here.some((a) => a.block && !a.cosmeticianId)) return out;
  const busyAt = (p) => here.filter((a) => (isVisit(a) || (a.block && a.cosmeticianId)) && toMin(a.time) <= p && aEnd(a) > p).length;
  const shifts = whoWorks(doc, date, location, o).map((w) => [toMin(w.from), toMin(w.to)]);
  for (let guard = 0; guard < 20; guard++) {
    const onb = out.filter((b) => b.on);
    const pts = new Set();
    onb.forEach((b) => { const s = toMin(b.from), e = toMin(b.to); pts.add(s); here.forEach((a) => { const t0 = toMin(a.time); if (t0 > s && t0 < e) pts.add(t0); }); });
    const bad = [...pts].sort((a, b) => a - b).find((p) => busyAt(p) > shifts.filter((x) => x[0] <= p && x[1] > p).length - onb.filter((b) => toMin(b.from) <= p && toMin(b.to) > p).length);
    if (bad == null) break;
    const give = onb.filter((b) => toMin(b.from) <= bad && toMin(b.to) > bad).sort((a, b) => b.from.localeCompare(a.from) || b.employeeId.localeCompare(a.employeeId))[0];
    if (!give) break;
    give.on = false; give.why = 'busy';
  }
  return out;
}
// her break that day ({ … } as dayBreaks, on or not), or null when she has none (not working, short shift)
function breakOf(doc, employeeId, date, opts) {
  const w = workingAt(doc, employeeId, date, null, opts || {});
  if (!w) return null;
  return dayBreaks(doc, date, w.location, opts).find((b) => b.employeeId === employeeId) || null;
}
// the half hours a break of hers can move to that day: [{ from, to, free, why }] (why: 'client', 'block'); skipId: an
// appointment not counted (the one being booked or moved), extra: [start, end] minutes taken too (the hour being booked)
function breakSlots(doc, employeeId, date, opts) {
  const o = opts || {};
  const p = plannedBreak(doc, employeeId, date, o);
  if (!p) return [];
  const mine = hersOn(o.appts, employeeId, date, o.skipId).concat(o.extra ? [[o.extra[0], o.extra[1], 'client']] : []);
  const out = [];
  for (let s = Math.ceil(p.shift[0] / 30) * 30; s + BREAK_MIN <= p.shift[1]; s += 30) {
    const hit = over(mine, s, s + BREAK_MIN);
    out.push({ from: hm(s), to: hm(s + BREAK_MIN), free: !hit, why: hit ? hit[2] : '' });
  }
  return out;
}
// the free half hours closest to where the break was, one before and one after first (the first and the last hour of her
// shift only when nothing else is free): ['14:00', '15:00', …]
function breakNear(doc, employeeId, date, opts, at) {
  const p = plannedBreak(doc, employeeId, date, opts);
  if (!p) return [];
  const ref = at != null ? at : p.from;
  const free = breakSlots(doc, employeeId, date, opts).filter((x) => x.free && toMin(x.from) !== ref);
  const inner = (x) => toMin(x.from) >= p.shift[0] + 60 && toMin(x.to) <= p.shift[1] - 60;
  const pool = free.some(inner) ? free.filter(inner) : free;
  const before = pool.filter((x) => toMin(x.from) < ref).sort((a, b) => toMin(b.from) - toMin(a.from));
  const after = pool.filter((x) => toMin(x.from) > ref).sort((a, b) => toMin(a.from) - toMin(b.from));
  const out = [];
  for (let i = 0; out.length < pool.length && i < pool.length; i++) { if (before[i]) out.push(before[i].from); if (after[i]) out.push(after[i].from); }
  return out;
}
// can her break that day go to „from”: '' when yes, else why ('not_working', 'no_break', 'invalid_time', 'outside_shift',
// 'break_taken': a client or a block of hers there)
function breakCheck(doc, employeeId, date, from, opts) {
  const p = plannedBreak(doc, employeeId, date, opts);
  if (!workingAt(doc, employeeId, date, null, opts || {})) return 'not_working';
  if (!p) return 'no_break';
  const s = toMin(from);
  if (s == null || s % 30) return 'invalid_time'; // always at :00 or :30 (the owner, 16.11)
  if (s < p.shift[0] || s + BREAK_MIN > p.shift[1]) return 'outside_shift';
  const o = opts || {};
  if (over(hersOn(o.appts, employeeId, date, o.skipId).concat(o.extra ? [[o.extra[0], o.extra[1], 'client']] : []), s, s + BREAK_MIN)) return 'break_taken';
  return '';
}
// the change for one day, written into the doc (inside update()): { from } puts it there (by hand, kept even at the middle),
// { off } leaves it out, null gives it back to the automatic rule. who: { id, name }
function setBreak(doc, employeeId, date, change, who) {
  doc.breaks = doc.breaks || {};
  const day = doc.breaks[date] || {};
  const mark = { by: (who && who.id) || '', byName: (who && who.name) || '', at: new Date().toISOString() };
  if (change && change.off) day[employeeId] = Object.assign({ off: true }, mark);
  else if (change && change.from) day[employeeId] = Object.assign({ from: change.from }, mark);
  else delete day[employeeId];
  if (Object.keys(day).length) doc.breaks[date] = day; else delete doc.breaks[date];
  // the days long past go (the file stays small)
  const old = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  Object.keys(doc.breaks).forEach((d) => { if (d < old) delete doc.breaks[d]; });
}

// her phone hears when today's break moves (the owner, 16.11: „Pauza ta de azi s-a mutat la 15:00.”), only for today and
// only a real move; never blocks the change
// from: the new hour; null: no break today any more („Fără pauză azi”, a booking that leaves it out or takes it)
async function tellBreak(store, employeeId, date, from) {
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
    if (date !== today || from === '' || from === undefined) return;
    const emp = (await store.readJSON('data/employees.json', [])).find((e) => e && e.id === employeeId);
    if (!emp || emp.role !== 'cosmetician') return;
    await require('./notify').notifyMany(store, [employeeId], { kind: 'break', tone: 'info', go: 'programari', tag: 'break-' + date + '-' + (from || 'off'),
      title: 'Pauza de azi', text: from ? 'Pauza ta de azi s-a mutat la ' + from + '.' : 'Azi nu ai pauză.' });
  } catch (e) { /* a notification never blocks the change */ }
}
// a change of today's bookings (before → after) that takes a cosmetician's break without moving it (her client on it, the
// clinic too busy at that half hour): she hears „Azi nu ai pauză” (16.11). Today only; never blocks the change.
async function tellLost(store, before, after) {
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
    const day = (l) => (l || []).filter((a) => a && a.date === today);
    const [doc, cosm] = await Promise.all([load(), people()]);
    const ids = new Set(cosm.map((p) => p.id));
    for (const c of CITIES) {
      const now = dayBreaks(doc, today, c, { appts: day(after), ids });
      const lost = dayBreaks(doc, today, c, { appts: day(before), ids }).filter((b) => b.on && now.some((x) => x.employeeId === b.employeeId && !x.on));
      for (const b of lost) await tellBreak(store, b.employeeId, today, null);
    }
  } catch (e) { /* a notification never blocks the change */ }
}

// ------------------------------------------------------------------ cleaning what the admin sends
function cleanDay(x) {
  const d = x && typeof x === 'object' ? x : {};
  const on = !!d.on;
  const from = isTime(d.from) ? d.from : '';
  const to = isTime(d.to) ? d.to : '';
  if (on && (!from || !to)) return { error: 'invalid_time' };
  if (on && toMin(to) <= toMin(from)) return { error: 'invalid_range' };
  return { on, from: from || '09:00', to: to && (!from || toMin(to) > toMin(from)) ? to : '17:00' };
}
function cleanWeek(days) {
  const out = {};
  for (const k of DAYS) {
    const d = cleanDay(days && days[k]);
    if (d.error) return { error: d.error };
    out[k] = d;
  }
  return { days: out };
}

// ------------------------------------------------------------------ week by week (the owner, 17.11: „să poți edita programul
// efectiv pe săptămâni exacte”). The Timișoara team rotates (one week 9-17, the next 12-20), so the manager sets each real
// week. A week is still stored as date entries, so everything that reads dayOf() follows it; only the days that differ from
// her week (the template) get one, and a day set back to the template loses its entry (no clutter).
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const isMonday = (d) => isDate(d) && isoDow(d) === '1';
// her template's day ({ on, from, to, location }), or null when she has no week
function tplDay(doc, id, date) {
  const w = doc.weekly && doc.weekly[id];
  if (!w || !w.days) return null;
  const d = w.days[isoDow(date)] || {};
  return { on: !!d.on, from: d.from || '', to: d.to || '', location: w.location || '' };
}
// what really applies that day (leave not counted): { on, from, to, location }
function realDay(doc, id, date) {
  const d = dayOf(doc, id, date);
  const w = doc.weekly && doc.weekly[id];
  return d ? { on: !!d.on, from: d.from || '', to: d.to || '', location: d.location || '' } : { on: false, from: '', to: '', location: (w && w.location) || '' };
}
// two days the same for the clinic: both off, or the same hours in the same city
const sameDay = (a, b) => (!a.on && !b.on) || (!!a.on && !!b.on && a.from === b.from && a.to === b.to && (a.location || '') === (b.location || ''));
// a day as sent: on at :00 / :30, from before to; a city when given. '' when good, else the error code
function badDay(x) {
  if (!x || typeof x !== 'object') return 'invalid_day';
  if (x.location != null && x.location !== '' && !CITIES.includes(x.location)) return 'invalid_location';
  if (!x.on) return '';
  if (!isTime(x.from) || !isTime(x.to) || toMin(x.from) % 30 || toMin(x.to) % 30) return 'invalid_time';
  if (toMin(x.to) <= toMin(x.from)) return 'invalid_range';
  return '';
}
// her day at a date, in the doc (inside update()): a date entry only when it differs from her week
function setDay(doc, id, date, x) {
  const tpl = tplDay(doc, id, date);
  const had = doc.dates[date] && doc.dates[date][id];
  const location = (x.location && CITIES.includes(x.location) ? x.location : '') || (had && had.location) || (tpl && tpl.location) || '';
  const want = { on: !!x.on, from: x.on ? x.from : '', to: x.on ? x.to : '', location };
  if (tpl ? sameDay(want, tpl) : !want.on) {
    if (had) { delete doc.dates[date][id]; if (!Object.keys(doc.dates[date]).length) delete doc.dates[date]; }
    return;
  }
  const entry = want.on ? { on: true, from: want.from, to: want.to } : { on: false, from: (had && had.from) || '09:00', to: (had && had.to) || '17:00' };
  if (location && (!tpl || location !== tpl.location)) entry.location = location;
  doc.dates[date] = doc.dates[date] || {};
  doc.dates[date][id] = entry;
}
// what a save of the week sets: [{ id, date, day }]. people: { <id>: { <date>: { on, from, to, location? } } } for the week of
// `monday` (the days left out stay as they are). repeat { weeks: 1..12, mode: 'same' | 'alternate' }: the next weeks get this
// week (its days left out: as they really are), or, alternating, the next week and this one in turn (the next one as it is
// saved: week +1 is B, +2 is A, +3 is B…). Never a day before `today`.
function weekWrites(doc, monday, people, repeat, today) {
  const out = [];
  Object.keys(people).forEach((id) => Object.keys(people[id]).forEach((date) => out.push({ id, date, day: people[id][date] })));
  if (repeat && repeat.weeks) {
    Object.keys(people).forEach((id) => {
      const A = DAYS.map((k, i) => { const d = addDays(monday, i); return people[id][d] || realDay(doc, id, d); });
      const B = DAYS.map((k, i) => realDay(doc, id, addDays(monday, 7 + i)));
      for (let w = 1; w <= repeat.weeks; w++) {
        const src = repeat.mode === 'alternate' && w % 2 ? B : A;
        src.forEach((day, i) => { const date = addDays(monday, 7 * w + i); if (!today || date >= today) out.push({ id, date, day }); });
      }
    });
  }
  return out;
}
// the writes applied to the doc: [{ id, date, before, after, had }] for the days that really change (had: a date entry was there)
function applyWeek(doc, writes) {
  const out = [];
  writes.forEach((w) => {
    const before = realDay(doc, w.id, w.date), had = !!(doc.dates[w.date] && doc.dates[w.date][w.id]);
    setDay(doc, w.id, w.date, w.day);
    const after = realDay(doc, w.id, w.date);
    if (!sameDay(before, after)) out.push({ id: w.id, date: w.date, before, after, had });
  });
  return out;
}
// the changes per week, for the confirmation: [{ monday, days, had (days that had their own hours already) }]
function weeksOf(changes, monday) {
  const by = new Map();
  changes.forEach((c) => {
    const k = Math.floor((Date.parse(c.date + 'T12:00:00Z') - Date.parse(monday + 'T12:00:00Z')) / (7 * 864e5));
    const m = addDays(monday, 7 * k);
    const x = by.get(m) || { monday: m, days: 0, had: 0 };
    x.days++; if (c.had) x.had++;
    by.set(m, x);
  });
  return [...by.values()].sort((a, b) => a.monday.localeCompare(b.monday));
}
// her open bookings on the changed days that the new hours leave out (another city, a day off, outside her hours) and that
// were inside before: they stay in the Calendar, marked as today (offShift, the orphan list)
function outsideOf(appts, changes, today) {
  const inside = (d, a) => { if (!d.on) return false; if (d.location && a.location && d.location !== a.location) return false;
    const s = toMin(a.time); if (s == null) return true; return s >= toMin(d.from) && aEnd(a) <= toMin(d.to); };
  const key = new Map(changes.map((c) => [c.id + '|' + c.date, c]));
  return (appts || []).filter((a) => { const c = a && key.get(a.cosmeticianId + '|' + a.date);
    return c && a.date >= (today || '') && isVisit(a) && !a.paidSaleId && a.status !== 'finalizata' && !inside(c.after, a) && inside(c.before, a); });
}

// ------------------------------------------------------------------ overtime (the owner, 18.11: „cu orele suplimentare să aibă o
// opțiune în care să adauge orele suplimentare, iar alea să aibă alt background”)
// doc.extra[date][id] = [{ id, from, to, location, note, by, byName, at }]: hours she works on top of her shift that day (after
// it, before it, or on a day off), on :00 / :30, never over her shift or another overtime of hers. Kept apart from her hours:
//   - workingAt / whoWorks / dayBreaks never see it: the site's free hours (_lib/booking.js), the calendar's fill, the break
//     and the free hours for calls stay on her shift. Only reception books her overtime (decided 18.11: not offered online).
//   - the desk does (deskAt, deskSpans): the Calendar and the booking form take a booking there without „nu lucrează”, the
//     colleagues who can take a booking (time-care.js freeFor) count it.
//   - the timebank (_lib/timebank.js) never expects it: her expected day stays her shift, so the time she works in it is a
//     positive difference (overtime, approved in Aprobări like any other), shown with the overtime planned that day.
//   - Manager → Reguli (_lib/rules.js): a planned overtime with no pontaj over it is listed; the late rule stays on her shift.
// A leave that day (concediu, a whole-day block) wins: no overtime counts then.
const EXTRA_NOTE = 140;
// her overtime that day, valid and by start ([] when none or on leave). opts: { appts (for leave) }
function extraOf(doc, employeeId, date, opts) {
  const list = doc && doc.extra && doc.extra[date] && doc.extra[date][employeeId];
  if (!Array.isArray(list) || !list.length) return [];
  if (opts && opts.appts && onLeave(opts.appts, employeeId, date)) return [];
  return list.filter((x) => x && toMin(x.from) != null && toMin(x.to) > toMin(x.from)).sort((a, b) => toMin(a.from) - toMin(b.from));
}
// where she is for the desk that day: her shift and her overtime, [{ from, to (minutes), location, extra }] by start
function deskSpans(doc, employeeId, date, opts) {
  const out = [];
  const w = workingAt(doc, employeeId, date, null, opts);
  if (w) out.push({ from: toMin(w.from), to: toMin(w.to), location: w.location || '', extra: false });
  const o = opts || {};
  const gone = o.until && o.until.has(employeeId) ? !(date <= o.until.get(employeeId)) : o.ids ? !has(o.ids, employeeId) : false;
  if (!gone) extraOf(doc, employeeId, date, o).forEach((x) => out.push({ from: toMin(x.from), to: toMin(x.to), location: x.location || (w && w.location) || '', extra: true, id: x.id, note: x.note || '' }));
  return out.sort((a, b) => a.from - b.from);
}
// she is there for the desk from s to e (minutes; e: s + 1 when left out) in that city: her shift and her overtime together
// (a shift to 17:00 and an overtime 17:00-19:00 hold a booking 16:30-17:30)
function deskCovers(doc, employeeId, date, location, s, e, opts) {
  if (s == null) return deskSpans(doc, employeeId, date, opts).some((x) => !location || !x.location || x.location === location);
  const end = e != null && e > s ? e : s + 1;
  let at = s;
  for (const x of deskSpans(doc, employeeId, date, opts).filter((y) => !location || !y.location || y.location === location)) {
    if (x.from <= at && x.to > at) at = x.to;
    if (at >= end) return true;
  }
  return false;
}
// her shift or her overtime at that minute: { from, to, location, extra } ('HH:MM'), or null
function deskAt(doc, employeeId, date, time, opts) {
  const w = workingAt(doc, employeeId, date, time, opts);
  if (w) return Object.assign({ extra: false }, w);
  const t = toMin(time);
  if (t == null) return null;
  const x = deskSpans(doc, employeeId, date, opts).find((y) => y.extra && y.from <= t && y.to > t);
  return x ? { from: hm(x.from), to: hm(x.to), location: x.location, extra: true } : null;
}
// an overtime as sent ({ from, to, location?, note? }), checked against her day: '' when it can be saved, else why
// ('invalid_time': not :00 / :30, 'invalid_range', 'invalid_location', 'over_shift': inside her hours that day,
// 'over_extra': over another overtime of hers). skipId: the one being changed.
function extraCheck(doc, employeeId, date, x, skipId) {
  if (!x || typeof x !== 'object') return 'invalid_time';
  if (x.location != null && x.location !== '' && !CITIES.includes(x.location)) return 'invalid_location';
  const s = toMin(x.from), e = toMin(x.to);
  if (!isTime(x.from) || !isTime(x.to) || s % 30 || e % 30) return 'invalid_time';
  if (e <= s) return 'invalid_range';
  const w = workingAt(doc, employeeId, date, null, {});
  if (w && toMin(w.from) < e && toMin(w.to) > s) return 'over_shift';
  if (extraOf(doc, employeeId, date).some((y) => y.id !== skipId && toMin(y.from) < e && toMin(y.to) > s)) return 'over_extra';
  return '';
}
// write one (inside update()): row { id?, from, to, location, note }; a new one gets an id. Returns the row saved.
function setExtra(doc, employeeId, date, row, who) {
  doc.extra = doc.extra || {};
  const day = doc.extra[date] || {};
  const list = Array.isArray(day[employeeId]) ? day[employeeId].slice() : [];
  const at = new Date().toISOString();
  const i = row.id ? list.findIndex((y) => y && y.id === row.id) : -1;
  const saved = Object.assign(i > -1 ? list[i] : { id: 'x' + require('crypto').randomUUID().slice(0, 8) }, {
    from: row.from, to: row.to, location: row.location || '', note: String(row.note || '').trim().slice(0, EXTRA_NOTE),
    by: (who && who.id) || '', byName: (who && who.name) || '', at,
  });
  if (i > -1) list[i] = saved; else list.push(saved);
  day[employeeId] = list.sort((a, b) => toMin(a.from) - toMin(b.from));
  doc.extra[date] = day;
  // the days long past go (the file stays small)
  const old = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  Object.keys(doc.extra).forEach((d) => { if (d < old) delete doc.extra[d]; });
  return saved;
}
// take one out (inside update()); the removed row or null
function dropExtra(doc, employeeId, date, id) {
  const day = doc.extra && doc.extra[date];
  const list = day && Array.isArray(day[employeeId]) ? day[employeeId] : [];
  const i = list.findIndex((y) => y && y.id === id);
  if (i < 0) return null;
  const [gone] = list.splice(i, 1);
  if (!list.length) delete day[employeeId];
  if (!Object.keys(day).length) delete doc.extra[date];
  return gone;
}
// her overtime minutes that day (leave counted)
const extraMinutes = (doc, employeeId, date, opts) => extraOf(doc, employeeId, date, opts).reduce((n, x) => n + toMin(x.to) - toMin(x.from), 0);
// her phone hears it (the owner, 18.11): „ORE SUPLIMENTARE - joi 20.11, 18:00-20:00”; never blocks the change.
// what: 'set' (added or changed) | 'drop' (taken out)
const RO_DOW = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
async function tellExtra(store, employeeId, date, row, what, byId) {
  try {
    if (!row || employeeId === byId) return;
    const dd = new Date(date + 'T12:00:00Z');
    const when = RO_DOW[dd.getUTCDay()] + ' ' + dd.getUTCDate() + '.' + (dd.getUTCMonth() + 1);
    await require('./notify').notifyMany(store, [employeeId], { kind: 'alert', tone: what === 'drop' ? 'info' : 'good', go: 'programari', tag: 'extra-' + date + '-' + row.id + '-' + what + '-' + row.from + row.to,
      title: what === 'drop' ? 'ORE SUPLIMENTARE ANULATE' : 'ORE SUPLIMENTARE', text: when + ', ' + row.from + '-' + row.to + (row.location ? ', ' + row.location : '') + (what !== 'drop' && row.note ? '. ' + row.note : '') });
  } catch (e) { /* a notification never blocks the change */ }
}

module.exports = { EXTRA_NOTE, extraOf, deskSpans, deskCovers, deskAt, extraCheck, setExtra, dropExtra, extraMinutes, tellExtra, tellLost, KEY, CITIES, DAYS, load, update, people, staff, norm, dayOf, workingAt, whoWorks, hasSchedule, onLeave, cleanDay, cleanWeek, isDate, isTime, isoDow, toMin,
  BREAK_MIN, BREAK_SHIFT_MIN, BREAK_SINCE, midBreak, plannedBreak, dayBreaks, breakOf, breakSlots, breakNear, breakCheck, setBreak, tellBreak, hm,
  addDays, isMonday, tplDay, realDay, sameDay, badDay, setDay, weekWrites, applyWeek, weeksOf, outsideOf };
