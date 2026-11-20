// Once (the owner, 20.11): the manager's 19.11 had two pontaj rows (09:01-17:01 and a second 09:01 with no departure),
// which gave her too many hours. The open duplicate goes (only when the same person has a complete row that day with the
// same arrival), with any time difference that hung on it. Found by role, never by name. Run by the automations' clock;
// the result (times only) is in data/att-dup-once.json, shown by api/lead-health?attfix=1.

const { readJSON, writeJSON } = require('./store');

const KEY = 'data/att-dup-once.json';
const DATE = '2026-11-19';

async function run() {
  const st = (await readJSON(KEY, {})) || {};
  if (st.done) return { skipped: true };
  const out = { done: true, at: new Date().toISOString(), date: DATE };
  const emps = await readJSON('data/employees.json', []);
  const mgrs = emps.filter((e) => e && e.role === 'manager' && e.active !== false);
  if (mgrs.length !== 1) { out.result = 'managers_' + mgrs.length; await writeJSON(KEY, out); return out; }
  const id = mgrs[0].id;
  const list = await readJSON('data/attendance.json', []);
  const rows = list.filter((e) => e && e.employeeId === id && e.date === DATE);
  const full = rows.find((e) => e.checkIn && e.checkOut);
  const dups = full ? rows.filter((e) => e !== full && !e.checkOut && e.checkIn === full.checkIn) : [];
  out.rows = rows.map((e) => (e.checkIn || '-') + '-' + (e.checkOut || '-'));
  if (dups.length) {
    const ids = new Set(dups.map((e) => e.id));
    await writeJSON('data/attendance.json', list.filter((e) => !(e && ids.has(e.id))));
    const adjs = await readJSON('data/time-adjust.json', []);
    const left = adjs.filter((a) => !(a && ids.has(a.attendanceId)));
    if (left.length !== adjs.length) await writeJSON('data/time-adjust.json', left);
    out.adjustRemoved = adjs.length - left.length;
  }
  out.removed = dups.length;
  out.result = dups.length ? 'fixed' : 'nothing';
  await writeJSON(KEY, out);
  return out;
}

module.exports = { run, KEY };
