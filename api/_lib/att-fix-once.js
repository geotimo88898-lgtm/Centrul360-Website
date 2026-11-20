// Once (the owner, 20.11): the manager's pontaj of 19.11 had too many hours. Her day is set to 8 hours from her arrival
// (the departure moved back, the change written in the day's history like any correction), the overtime it made is
// taken out (its row in Aprobări, pending or decided) and any „Ore suplimentare” planned for her that day goes too.
// The manager is found by her role (one active manager), never by name. Run by the automations' clock; what was found
// and done (times only) is kept in data/att-fix-once.json and shown by api/lead-health?attfix=1.

const { readJSON, writeJSON } = require('./store');
const TB = require('./timebank');
const FIX = require('./attendance-fix');

const KEY = 'data/att-fix-once.json';
const DATE = '2026-11-19';
const DAY = 8 * 60;
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

async function run() {
  const st = (await readJSON(KEY, {})) || {};
  if (st.done) return { skipped: true };
  const out = { done: true, at: new Date().toISOString(), date: DATE };
  const emps = await readJSON('data/employees.json', []);
  const mgrs = emps.filter((e) => e && e.role === 'manager' && e.active !== false);
  if (mgrs.length !== 1) { out.result = 'managers_' + mgrs.length; await writeJSON(KEY, out); return out; }
  const id = mgrs[0].id;
  const list = await readJSON('data/attendance.json', []);
  const entry = list.find((e) => e && e.employeeId === id && e.date === DATE);
  if (!entry) { out.result = 'no_entry'; await writeJSON(KEY, out); return out; }
  const a = toMin(entry.checkIn), b = toMin(entry.checkOut);
  out.before = { checkIn: entry.checkIn, checkOut: entry.checkOut };
  if (a != null && (b == null || b - a > DAY)) {
    const before = FIX.snap(entry);
    entry.checkOut = hhmm(a + DAY);
    entry.updatedAt = new Date().toISOString();
    FIX.record(entry, before, { id: 'admin', name: 'Admin' }, 'update', 'Corectat: 8 ore, fără ore suplimentare');
    await writeJSON('data/attendance.json', list);
  }
  out.after = { checkIn: entry.checkIn, checkOut: entry.checkOut };
  // the overtime it made: out of Aprobări and of her balance, whatever its state
  const adjs = await readJSON('data/time-adjust.json', []);
  const gone = adjs.filter((x) => x && x.attendanceId === entry.id);
  if (gone.length) await writeJSON('data/time-adjust.json', adjs.filter((x) => !(x && x.attendanceId === entry.id)));
  out.adjustRemoved = gone.map((x) => ({ minutes: x.minutes, status: x.status }));
  // „Ore suplimentare” planned for her that day
  const TS = require('./team-schedule');
  let extras = 0;
  await TS.update((doc) => { TS.extraOf(doc, id, DATE).forEach((x) => { if (TS.dropExtra(doc, id, DATE, x.id)) extras++; }); });
  out.extraRemoved = extras;
  out.adjustNow = await TB.syncAdjust(entry, { readJSON, writeJSON }).then((r) => (r ? { minutes: r.minutes } : null)).catch((e) => ({ error: String(e.message || e) }));
  out.result = 'fixed';
  await writeJSON(KEY, out);
  return out;
}

module.exports = { run, KEY };
