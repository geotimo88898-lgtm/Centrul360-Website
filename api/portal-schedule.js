// POST /api/portal-schedule, Calendar → „Program echipă” (the owner, 9.11: „unde trec programul fetelor”).
//   { action: 'get', from?, to? }  any signed-in member of the team
//     → { weekly, dates (from..to), people: the active cosmeticians [{ id, name, location }], cities: { <city>: has a schedule },
//         works: { <date>: { <city>: [{ employeeId, name, from, to }] } } (who works each day, leave counted; ranges up to 62 days) }
//   { action: 'save_week', employeeId, location, days: { '1'..'7': { on, from, to } } }   admin or manager
//   { action: 'save_date', date, employeeId, entry: { on, from, to, location } | null }    admin or manager (null removes the exception)
//   { action: 'break_info', date, employeeId, time?, endTime?, skipId? }   any signed-in member: her break that day, the half
//     hours it can move to and the closest free ones (with time/endTime: as if that booking were already there)
//     → { break: { from, to, mid, on, why, moved, by, at, shiftFrom, shiftTo } | null, slots: [{ from, to, free, why }], near: ['14:00', …], clash }
//   { action: 'break_set', date, employeeId, from }    admin or manager: her break that day at „from” (:00 or :30, in her
//     shift, not over a client of hers); at the middle again: back to automatic
//   { action: 'break_off', date, employeeId }          admin or manager: no break that day
//   { action: 'break_reset', date, employeeId }        admin or manager: back to the middle of her shift
// people: the cosmeticians and, for the owner and the manager, the desk too (role on each); only the cosmeticians are places
// for clients (cities, works, the site's free hours).
// Who sees what (16.11): a cosmetician and a manager of one clinic get only their clinics (people, weekly, dates, works,
// cities); a cosmetician also her own days in the other city. break_info answers for someone of those clinics (or herself).
// save_week / save_date answer with `affected` too: her bookings on the days the change takes her off (or to the other city),
// marked offShift until each is given to someone else or moved (the Calendar lists them, the desk hears it, their client
// reminders wait: _lib/time-care.js); a day she works again clears the mark.
// Data and rules: api/_lib/team-schedule.js.

const { readJSON } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const T = require('./_lib/team-schedule');
const { canManage } = require('./_lib/roles');

const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const roToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
// who changed it (the „mutată” mark on a moved break): her name, the owner's „George”
async function whoIs(session) {
  if (!session || session.employeeId === 'admin') return 'George';
  const e = (await readJSON('data/employees.json', [])).find((x) => x && x.id === session.employeeId);
  return (e && e.name) || '';
}
const span = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);

async function answer(res, from, to, session, extra) {
  const [doc, cosm, all] = await Promise.all([T.load(), T.people(), T.staff()]);
  const ids = new Set(cosm.map((p) => p.id));
  // who is shown with their hours: the cosmeticians; the owner and the manager also see (and set) the desk's
  let people = canManage(session) ? all : cosm.map((p) => Object.assign({ role: 'cosmetician' }, p));
  // the clinics this account sees: a manager the ones she runs, a cosmetician hers (null: all)
  const scope = await require('./_lib/city').cityOf(session, readJSON);
  const mine = scope == null ? null : [].concat(scope);
  const me = session && session.role === 'cosmetician' ? session.employeeId : '';
  if (session && session.role === 'manager') people = people.filter((p) => p.id !== session.employeeId && mine.includes(p.location));
  else if (mine) people = people.filter((p) => p.id === me || mine.includes(p.location));
  const shown = new Set(people.map((p) => p.id));
  const dates = {};
  Object.keys(doc.dates).filter((d) => d >= from && d <= to).sort().forEach((d) => {
    const row = {};
    Object.keys(doc.dates[d] || {}).filter((id) => shown.has(id)).forEach((id) => { row[id] = doc.dates[d][id]; });
    if (Object.keys(row).length) dates[d] = row;
  });
  const weekly = {};
  Object.keys(doc.weekly).filter((id) => shown.has(id)).forEach((id) => { weekly[id] = doc.weekly[id]; });
  const cities = {};
  T.CITIES.filter((c) => !mine || mine.includes(c)).forEach((c) => { cities[c] = T.hasSchedule(doc, c, ids); });
  const works = {};
  // for the owner and the manager (Pe săptămâni, 17.11): who is on leave each day of the range ({ <date>: [ids] }) and the
  // clinics' opening hours ({ <city>: { '1'..'7': { on, from, to } } }, the site's settings), for the hints
  const boss = canManage(session) && span(from, to) <= 62;
  const extraOut = {};
  const inRange = span(from, to) <= 62 ? [].concat((await readJSON('data/appointments.json', [])) || []).filter((a) => a && a.date >= from && a.date <= to) : [];
  if (boss) {
    const leave = {};
    inRange.forEach((a) => { if (shown.has(a.cosmeticianId) && T.onLeave([a], a.cosmeticianId, a.date)) { leave[a.date] = leave[a.date] || []; if (!leave[a.date].includes(a.cosmeticianId)) leave[a.date].push(a.cosmeticianId); } });
    const bk = await require('./_lib/booking').settings().catch(() => null);
    const open = {};
    T.CITIES.filter((c) => !mine || mine.includes(c)).forEach((c) => {
      const days = (bk && bk.cities && bk.cities[c] && bk.cities[c].days) || {};
      open[c] = {};
      T.DAYS.forEach((k) => { const d = days[Number(k) % 7] || {}; open[c][k] = { on: !!d.on, from: d.from || '09:00', to: d.to || '20:00' }; });
    });
    Object.assign(extraOut, { leave, open });
  }
  if (span(from, to) <= 62 && (cities['Timișoara'] || cities.Arad || Object.keys(dates).length)) {
    const name = (id) => (cosm.find((p) => p.id === id) || {}).name || '';
    for (let d = from; d <= to; d = addDay(d, 1)) {
      const day = {};
      // her clinics only; a cosmetician also sees herself on a day she works in the other city
      T.CITIES.forEach((c) => { const w = T.whoWorks(doc, d, c, { appts: inRange, ids }).filter((x) => !mine || mine.includes(c) || x.employeeId === me); if (!mine || mine.includes(c) || w.length) day[c] = w.map((x) => Object.assign({ name: name(x.employeeId) }, x)); });
      works[d] = day;
    }
  }
  res.status(200).json(Object.assign({ ok: true, weekly, dates, people, cities, works, from, to }, extraOut, extra || {}));
}

// her bookings on the days a change takes her off (or to the other city): marked offShift, the desk told; a day she works
// again (there) loses the mark. Only the days that changed: a booking already on a day off before stays as it was.
const TC = require('./_lib/time-care');
async function afterChange(before, after, employeeId, days, session) {
  const { readJSONTagged, writeJSONIf, writeJSON } = require('./_lib/store');
  const works = (doc, a) => { const w = T.workingAt(doc, employeeId, a.date, null, {}); return !!w && (!w.location || w.location === a.location); };
  const set = new Set(days);
  for (let round = 0; round < 5; round++) {
    const { data, etag } = await readJSONTagged('data/appointments.json', []);
    const appts = Array.isArray(data) ? data : [];
    const mine = TC.affected(appts, employeeId, [...set]);
    const off = mine.filter((a) => !works(after, a) && (works(before, a) || a.offShift));
    const back = mine.filter((a) => a.offShift && works(after, a));
    const fresh = off.filter((a) => !a.offShift);
    if (!fresh.length && !back.length) return TC.rows(off, appts, await readJSON('data/employees.json', []), after);
    const at = new Date().toISOString();
    fresh.forEach((a) => { a.offShift = at; });
    back.forEach((a) => { delete a.offShift; });
    if (!(await writeJSONIf('data/appointments.json', appts, etag))) continue;
    const emps = await readJSON('data/employees.json', []);
    const emp = emps.find((e) => e.id === employeeId);
    if (fresh.length) await TC.tellDesk({ readJSON, writeJSON }, emps, fresh, employeeId, 'Program schimbat ' + String((emp && emp.name) || '').split(' ')[0], session && session.employeeId);
    return TC.rows(off, appts, emps, after);
  }
  return [];
}

// ------------------------------------------------------------------ week by week (the owner, 17.11): „Pe săptămâni”
// { action: 'preview_weeks' | 'save_weeks', monday, people: { <id>: { <date of that week>: { on, from, to, location? } } },
//   repeat?: { weeks: 1..12, mode: 'same' | 'alternate' } }   admin or manager (a manager: her clinics' people, never herself)
// The days of that week are written as date entries only where they differ from her week; a day set back to it loses its
// entry. preview_weeks changes nothing and answers what save_weeks would do: { changes (days that change), weeks: [{ monday,
// days, had }], outside (her bookings the new hours leave out) }. save_weeks writes everything at once (one update()), marks
// the bookings left without her as save_date does (afterChange: offShift, the desk told) and answers as get, plus those.
async function saveWeeks(req, res, session, b) {
  const fail = (code, error) => res.status(code).json({ error });
  if (!canManage(session)) return fail(403, 'forbidden');
  const monday = String(b.monday || '');
  if (!T.isMonday(monday)) return fail(400, 'invalid_date');
  const today = roToday();
  const raw = b.people && typeof b.people === 'object' && !Array.isArray(b.people) ? b.people : null;
  if (!raw || !Object.keys(raw).length || Object.keys(raw).length > 40) return fail(400, 'missing_fields');
  let repeat = null;
  if (b.repeat) {
    const n = Number(b.repeat.weeks), mode = String(b.repeat.mode || 'same');
    if (!Number.isInteger(n) || n < 1 || n > 12 || !['same', 'alternate'].includes(mode)) return fail(400, 'invalid_repeat');
    repeat = { weeks: n, mode };
  }
  const staff = await T.staff();
  const mine = session.role === 'manager' ? [].concat(await require('./_lib/city').cityOf(session, readJSON)) : null;
  const week = new Set(T.DAYS.map((k, i) => T.addDays(monday, i)));
  const people = {};
  for (const id of Object.keys(raw)) {
    const emp = staff.find((p) => p.id === id);
    if (!emp) return fail(400, 'invalid_cosmetician');
    if (mine && (emp.id === session.employeeId || !mine.includes(emp.location))) return fail(403, 'forbidden');
    const days = raw[id] && typeof raw[id] === 'object' ? raw[id] : {};
    people[id] = {};
    for (const date of Object.keys(days)) {
      if (!week.has(date) || date < today) return fail(400, 'invalid_date');
      const x = days[date], bad = T.badDay(x);
      if (bad) return fail(400, bad);
      if (mine && x.location && !mine.includes(x.location)) return fail(403, 'forbidden');
      people[id][date] = { on: !!x.on, from: x.on ? x.from : '', to: x.on ? x.to : '', location: x.location || '' };
    }
  }
  const appts = await readJSON('data/appointments.json', []);
  if (b.action === 'preview_weeks') {
    const doc = T.norm(JSON.parse(JSON.stringify(await T.load())));
    const changes = T.applyWeek(doc, T.weekWrites(doc, monday, people, repeat, today));
    res.status(200).json({ ok: true, changes: changes.length, weeks: T.weeksOf(changes, monday), outside: T.outsideOf(appts, changes, today).length });
    return;
  }
  const before = await T.load();
  let changes = [];
  const doc = await T.update((d) => {
    changes = T.applyWeek(d, T.weekWrites(d, monday, people, repeat, today));
    Object.keys(d.dates).forEach((x) => { if (x < addDay(today, -90)) delete d.dates[x]; }); // the long past go, as save_date
  });
  // the bookings of each one the change leaves without her (only a cosmetician takes clients)
  const byId = new Map();
  changes.forEach((c) => byId.set(c.id, (byId.get(c.id) || []).concat(c.date)));
  let affected = [];
  for (const [id, days] of byId) {
    const emp = staff.find((p) => p.id === id);
    if (emp && emp.role === 'cosmetician') affected = affected.concat(await afterChange(before, doc, id, days, session).catch((e) => { console.error('schedule affected:', e.message); return []; }));
  }
  const names = [...byId.keys()].map((id) => String((staff.find((p) => p.id === id) || {}).name || '').split(' ')[0]).filter(Boolean);
  const weeks = T.weeksOf(changes, monday);
  const short = (d) => Number(d.slice(8)) + '.' + Number(d.slice(5, 7));
  const log = { subject: names.join(', ') || 'echipă', detail: [weeks.length > 1 ? weeks.length + ' săptămâni de la ' + short(monday) : 'săptămâna ' + short(monday) + '-' + short(T.addDays(monday, 6)),
    changes.length === 1 ? 'o zi' : changes.length + ' zile', repeat ? (repeat.mode === 'alternate' ? 'alternat' : 'repetat') + ' ' + repeat.weeks : ''].filter(Boolean).join(' · ') };
  const from = T.isDate(b.from) ? b.from : today;
  const to = T.isDate(b.to) && b.to >= from && span(from, b.to) <= 400 ? b.to : addDay(from, 180);
  return answer(res, from, to, session, { affected, changes: changes.length, weeks, outside: T.outsideOf(appts, changes, today).length, log });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = await requireAuth(req, res);
  if (!session) return;
  const b = req.body || {};
  const fail = (code, error) => res.status(code).json({ error });
  try {
    if (b.action === 'get') {
      const today = roToday();
      const from = T.isDate(b.from) ? b.from : today;
      let to = T.isDate(b.to) ? b.to : addDay(from, 180);
      if (to < from) return fail(400, 'invalid_range');
      if (span(from, to) > 400) to = addDay(from, 400);
      return answer(res, from, to, session);
    }
    if (b.action === 'break_info') {
      const date = String(b.date || ''), id = String(b.employeeId || '');
      if (!T.isDate(date)) return fail(400, 'invalid_date');
      const [doc, cosm, appts] = await Promise.all([T.load(), T.people(), readJSON('data/appointments.json', [])]);
      // only for someone of her clinics (where she works that day, else her clinic), or herself
      const scope = await require('./_lib/city').cityOf(session, readJSON);
      if (scope != null && id !== session.employeeId) {
        const p = cosm.find((x) => x.id === id), w = T.workingAt(doc, id, date, null, {});
        if (!p || ![].concat(scope).includes((w && w.location) || p.location)) return fail(403, 'forbidden');
      }
      const ids = new Set(cosm.map((p) => p.id));
      const s = T.toMin(b.time), e0 = T.toMin(b.endTime), e = s == null ? null : e0 != null && e0 > s ? e0 : s + 60;
      const extra = s != null ? [s, e] : null;
      const o = { appts: (Array.isArray(appts) ? appts : []).filter((a) => a && a.date === date), ids, skipId: String(b.skipId || '') };
      // as it is now (the booking not there yet; the one being moved left out)
      const now = T.breakOf(doc, id, date, Object.assign({}, o, { appts: o.appts.filter((a) => a.id !== o.skipId) }));
      const clash = !!(now && now.on && extra && T.toMin(now.from) < extra[1] && T.toMin(now.to) > extra[0]);
      const opt = Object.assign({}, o, extra ? { extra } : {});
      // today: never a half hour already gone
      const ro = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
      const gone = (t) => date < roToday() || (date === roToday() && T.toMin(t) < T.toMin(ro));
      res.status(200).json({ ok: true, break: now, clash, slots: T.breakSlots(doc, id, date, opt), near: T.breakNear(doc, id, date, opt, now ? T.toMin(now.from) : null).filter((t) => !gone(t)) });
      return;
    }
    if (b.action === 'break_set' || b.action === 'break_off' || b.action === 'break_reset') {
      if (!canManage(session)) return fail(403, 'forbidden');
      const date = String(b.date || ''), id = String(b.employeeId || '');
      if (!T.isDate(date)) return fail(400, 'invalid_date');
      const cosm = await T.people();
      const emp = cosm.find((p) => p.id === id);
      if (!emp) return fail(400, 'invalid_cosmetician');
      const [doc0, appts] = await Promise.all([T.load(), readJSON('data/appointments.json', [])]);
      const day = (Array.isArray(appts) ? appts : []).filter((a) => a && a.date === date);
      const w = T.workingAt(doc0, id, date, null, { appts: day });
      if (session.role === 'manager') {
        const mine = await require('./_lib/city').cityOf(session, readJSON);
        if (!mine.includes((w && w.location) || emp.location)) return fail(403, 'forbidden');
      }
      const from = b.action === 'break_set' ? String(b.from || '') : '';
      if (b.action !== 'break_reset') {
        const why = b.action === 'break_set' ? T.breakCheck(doc0, id, date, from, { appts: day }) : (!w ? 'not_working' : !T.plannedBreak(doc0, id, date, { appts: day }) ? 'no_break' : '');
        if (why) return fail(409, why);
      }
      const who = { id: session.employeeId || 'admin', name: (await whoIs(session)) };
      const doc = await T.update((d) => T.setBreak(d, id, date, b.action === 'break_off' ? { off: true } : b.action === 'break_set' ? { from } : null, who));
      const brk = T.breakOf(doc, id, date, { appts: day, ids: new Set(cosm.map((p) => p.id)) });
      // her phone hears it, today only: the new hour, or „Azi nu ai pauză” (16.11)
      if (b.action === 'break_off' || brk) await T.tellBreak({ readJSON, writeJSON: require('./_lib/store').writeJSON }, id, date, b.action === 'break_off' || !brk.on ? null : brk.from);
      res.status(200).json({ ok: true, break: brk });
      return;
    }
    if (b.action === 'save_weeks' || b.action === 'preview_weeks') return saveWeeks(req, res, session, b);
    if (b.action !== 'save_week' && b.action !== 'save_date') return fail(400, 'invalid_action');
    if (!canManage(session)) return fail(403, 'forbidden');

    const people = await T.staff();
    const emp = people.find((p) => p.id === String(b.employeeId || ''));
    if (!emp) return fail(400, 'invalid_cosmetician');
    if (session.role === 'manager') { // her clinics' people, in her clinics; never her own hours
      const mine = await require('./_lib/city').cityOf(session, readJSON);
      const to = String(b.location || (b.entry && b.entry.location) || '');
      if (emp.id === session.employeeId || !mine.includes(emp.location) || (to && !mine.includes(to))) return fail(403, 'forbidden');
    }

    const before = await T.load();
    let doc = null, days = [];
    if (b.action === 'save_week') {
      const location = String(b.location || '');
      if (!T.CITIES.includes(location)) return fail(400, 'invalid_location');
      const w = T.cleanWeek(b.days);
      if (w.error) return fail(400, w.error);
      doc = await T.update((d) => { d.weekly[emp.id] = { location, days: w.days, updatedAt: new Date().toISOString(), updatedBy: session.employeeId || 'admin' }; });
      days = TC.daysOf(roToday(), addDay(roToday(), 90));
    } else {
      const date = String(b.date || '');
      if (!T.isDate(date)) return fail(400, 'invalid_date');
      let entry = null;
      if (b.entry) {
        const d = T.cleanDay(b.entry);
        if (d.error) return fail(400, d.error);
        const location = b.entry.location ? String(b.entry.location) : '';
        if (location && !T.CITIES.includes(location)) return fail(400, 'invalid_location');
        entry = Object.assign(d, location ? { location } : {});
      }
      const today = roToday();
      doc = await T.update((d0) => {
        if (entry) { d0.dates[date] = d0.dates[date] || {}; d0.dates[date][emp.id] = entry; }
        else if (d0.dates[date]) { delete d0.dates[date][emp.id]; if (!Object.keys(d0.dates[date]).length) delete d0.dates[date]; }
        // the exceptions long past go (the file stays small)
        Object.keys(d0.dates).forEach((d) => { if (d < addDay(today, -90)) delete d0.dates[d]; });
      });
      days = [date];
    }
    // the bookings of hers the change leaves without a cosmetician (only a cosmetician takes clients)
    const affected = emp.role === 'cosmetician' ? await afterChange(before, doc, emp.id, days, session).catch((e) => { console.error('schedule affected:', e.message); return []; }) : [];
    const from = T.isDate(b.from) ? b.from : roToday();
    const to = T.isDate(b.to) && b.to >= from && span(from, b.to) <= 400 ? b.to : addDay(from, 180);
    return answer(res, from, to, session, { affected });
  } catch (err) {
    console.error('portal-schedule error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
