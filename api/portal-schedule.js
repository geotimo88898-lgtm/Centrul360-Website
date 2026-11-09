// POST /api/portal-schedule, Calendar → „Program echipă” (the owner, 9.11: „unde trec programul fetelor”).
//   { action: 'get', from?, to? }  any signed-in member of the team
//     → { weekly, dates (from..to), people: the active cosmeticians [{ id, name, location }], cities: { <city>: has a schedule },
//         works: { <date>: { <city>: [{ employeeId, name, from, to }] } } (who works each day, leave counted; ranges up to 62 days) }
//   { action: 'save_week', employeeId, location, days: { '1'..'7': { on, from, to } } }   admin
//   { action: 'save_date', date, employeeId, entry: { on, from, to, location } | null }    admin (null removes the exception)
// Data and rules: api/_lib/team-schedule.js.

const { readJSON } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const T = require('./_lib/team-schedule');

const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const roToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const span = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);

async function answer(res, from, to) {
  const [doc, people] = await Promise.all([T.load(), T.people()]);
  const ids = new Set(people.map((p) => p.id));
  const dates = {};
  Object.keys(doc.dates).filter((d) => d >= from && d <= to).sort().forEach((d) => {
    const row = {};
    Object.keys(doc.dates[d] || {}).filter((id) => ids.has(id)).forEach((id) => { row[id] = doc.dates[d][id]; });
    if (Object.keys(row).length) dates[d] = row;
  });
  const weekly = {};
  Object.keys(doc.weekly).filter((id) => ids.has(id)).forEach((id) => { weekly[id] = doc.weekly[id]; });
  const cities = {};
  T.CITIES.forEach((c) => { cities[c] = T.hasSchedule(doc, c, ids); });
  const works = {};
  if (span(from, to) <= 62 && (cities['Timișoara'] || cities.Arad || Object.keys(dates).length)) {
    const appts = await readJSON('data/appointments.json', []);
    const inRange = (Array.isArray(appts) ? appts : []).filter((a) => a && a.date >= from && a.date <= to);
    const name = (id) => (people.find((p) => p.id === id) || {}).name || '';
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
      return answer(res, from, to);
    }
    if (b.action !== 'save_week' && b.action !== 'save_date') return fail(400, 'invalid_action');
    if (session.role !== 'admin') return fail(403, 'forbidden');

    const people = await T.people();
    const emp = people.find((p) => p.id === String(b.employeeId || ''));
    if (!emp) return fail(400, 'invalid_cosmetician');

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
    return answer(res, from, to);
  } catch (err) {
    console.error('portal-schedule error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
