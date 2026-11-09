// Programul echipei (the owner, 9.11: „unde trec programul fetelor”): when each cosmetician works, and where.
// data/team-schedule.json:
//   { weekly: { <employeeId>: { location: 'Timișoara' | 'Arad', days: { '1'..'7' (Monday..Sunday): { on, from, to } } } },
//     dates:  { 'YYYY-MM-DD': { <employeeId>: { on, from, to, location } } } }
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

const empty = () => ({ weekly: {}, dates: {} });
function norm(d) {
  const out = empty();
  if (d && typeof d === 'object') {
    if (d.weekly && typeof d.weekly === 'object') out.weekly = d.weekly;
    if (d.dates && typeof d.dates === 'object') out.dates = d.dates;
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
function workingAt(doc, employeeId, date, time, opts) {
  const o = opts || {};
  if (o.ids && !has(o.ids, employeeId)) return null;
  const d = dayOf(doc, employeeId, date);
  if (!d || !d.on || toMin(d.from) == null || toMin(d.to) == null || toMin(d.to) <= toMin(d.from)) return null;
  if (onLeave(o.appts, employeeId, date)) return null;
  if (time != null && time !== '') { const t = toMin(time); if (t == null || t < toMin(d.from) || t >= toMin(d.to)) return null; }
  return { from: d.from, to: d.to, location: d.location };
}
const has = (ids, id) => (ids instanceof Set ? ids.has(id) : Array.isArray(ids) ? ids.includes(id) : true);

// who works in a city that day: [{ employeeId, from, to }] by start. opts: { appts (for leave), ids (the active ones) }
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

module.exports = { KEY, CITIES, DAYS, load, update, people, norm, dayOf, workingAt, whoWorks, hasSchedule, onLeave, cleanDay, cleanWeek, isDate, isTime, isoDow, toMin };
