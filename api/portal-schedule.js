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

async function answer(res, from, to, session) {
  const [doc, cosm, all] = await Promise.all([T.load(), T.people(), T.staff()]);
  const ids = new Set(cosm.map((p) => p.id));
  // who is shown with their hours: the cosmeticians; the owner and the manager also see (and set) the desk's
  let people = canManage(session) ? all : cosm.map((p) => Object.assign({ role: 'cosmetician' }, p));
  // the manager: the people of the clinics she runs
  if (session && session.role === 'manager') { const mine = await require('./_lib/city').cityOf(session, readJSON); people = people.filter((p) => p.id !== session.employeeId && mine.includes(p.location)); }
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
  T.CITIES.forEach((c) => { cities[c] = T.hasSchedule(doc, c, ids); });
  const works = {};
  if (span(from, to) <= 62 && (cities['Timișoara'] || cities.Arad || Object.keys(dates).length)) {
    const appts = await readJSON('data/appointments.json', []);
    const inRange = (Array.isArray(appts) ? appts : []).filter((a) => a && a.date >= from && a.date <= to);
    const name = (id) => (cosm.find((p) => p.id === id) || {}).name || '';
    for (let d = from; d <= to; d = addDay(d, 1)) {
      const day = {};
      T.CITIES.forEach((c) => { day[c] = T.whoWorks(doc, d, c, { appts: inRange, ids }).map((w) => Object.assign({ name: name(w.employeeId) }, w)); });
      works[d] = day;
    }
  }
  res.status(200).json({ ok: true, weekly, dates, people, cities, works, from, to });
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
      if (b.action !== 'break_off' && brk) await T.tellBreak({ readJSON, writeJSON: require('./_lib/store').writeJSON }, id, date, brk.from);
      res.status(200).json({ ok: true, break: brk });
      return;
    }
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

    if (b.action === 'save_week') {
      const location = String(b.location || '');
      if (!T.CITIES.includes(location)) return fail(400, 'invalid_location');
      const w = T.cleanWeek(b.days);
      if (w.error) return fail(400, w.error);
      await T.update((doc) => { doc.weekly[emp.id] = { location, days: w.days, updatedAt: new Date().toISOString(), updatedBy: session.employeeId || 'admin' }; });
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
      await T.update((doc) => {
        if (entry) { doc.dates[date] = doc.dates[date] || {}; doc.dates[date][emp.id] = entry; }
        else if (doc.dates[date]) { delete doc.dates[date][emp.id]; if (!Object.keys(doc.dates[date]).length) delete doc.dates[date]; }
        // the exceptions long past go (the file stays small)
        Object.keys(doc.dates).forEach((d) => { if (d < addDay(today, -90)) delete doc.dates[d]; });
      });
    }
    const from = T.isDate(b.from) ? b.from : roToday();
    const to = T.isDate(b.to) && b.to >= from && span(from, b.to) <= 400 ? b.to : addDay(from, 180);
    return answer(res, from, to, session);
  } catch (err) {
    console.error('portal-schedule error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
