// Hours of the team: the 8-hour day, overtime, hours to make up.
//
// Monday to Friday everyone works 8 hours (arrival to departure, break included). When a day ends
// (clock-out, or the owner corrects it), the difference from 8 hours becomes an "ajustare" that
// waits in the owner's Aprobări, but only from 15 minutes up. Saturday and Sunday every minute is
// overtime. The owner approves (optionally with a corrected number of minutes) or rejects.
//
// Approved time moves two balances, in the order things were decided:
//   - de recuperat (debt): hours she owes. Grows with an approved leave "cu recuperare" and with
//     missing time her overtime can't cover; shrinks with approved overtime.
//   - ore suplimentare (bank): overtime left after covering the debt. Paid with the salary at
//     40 lei / hour (the owner marks them paid), or used as hours off through a request
//     ("Ore libere"), which needs no making up.
// Missing time is taken from the bank first, what the bank can't cover goes to the debt.
//
// Stored: data/time-adjust.json (the day differences), data/time-payouts.json (overtime paid with
// the salary); leave requests stay in data/leave-requests.json. Balances are always recomputed.

const BASE_MINUTES = 480;
const TOLERANCE = 15;
const OVERTIME_LEI_PER_HOUR = 40;
const ADJ = 'data/time-adjust.json';
const PAYOUTS = 'data/time-payouts.json';

// Bucharest wall clock, whatever the server's timezone.
function bucharestNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: parts.year + '-' + parts.month + '-' + parts.day, time: parts.hour + ':' + parts.minute };
}
const dowOf = (date) => new Date(date + 'T12:00:00Z').getUTCDay(); // 0 = Sunday … 6 = Saturday
const isWeekend = (date) => { const d = dowOf(date); return d === 0 || d === 6; };
const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function workedMinutes(checkIn, checkOut) {
  const a = toMin(checkIn), b = toMin(checkOut);
  return a != null && b != null && b > a ? b - a : null;
}
function datesBetween(start, end) {
  const out = [];
  for (let d = new Date(start + 'T12:00:00Z'); d <= new Date(end + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}
const weekdaysBetween = (start, end) => datesBetween(start, end).filter((d) => !isWeekend(d));
const baseOf = (emp) => (emp && Number(emp.contractedHoursPerDay) > 0 ? Math.round(Number(emp.contractedHoursPerDay) * 60) : BASE_MINUTES);

// Minutes of a weekday that are already covered by an approved request (a leave "cu recuperare"
// or hours off from overtime), so that shortfall isn't counted a second time.
function plannedOffMinutes(employeeId, date, leaveRequests, base) {
  let off = 0;
  (leaveRequests || []).forEach((r) => {
    if (r.employeeId !== employeeId || r.status !== 'approved' || date < r.startDate || date > r.endDate || isWeekend(date)) return;
    const days = weekdaysBetween(r.startDate, r.endDate).length || 1;
    if (r.type === 'suplimentare') off += Math.min(base, Math.round((Number(r.minutes) || 0) / days));
    else if (r.recovery && r.recovery.minutes) off += Math.min(base, Math.round(r.recovery.minutes / days));
    else off += base; // any other approved leave: the whole day is off
  });
  return Math.min(base, off);
}

// The difference of one complete day from what was expected.
function dayDiff(entry, emp, leaveRequests) {
  const worked = workedMinutes(entry.checkIn, entry.checkOut);
  if (worked == null) return null;
  const weekend = isWeekend(entry.date);
  const base = baseOf(emp);
  const expected = weekend ? 0 : Math.max(0, base - plannedOffMinutes(entry.employeeId, entry.date, leaveRequests, base));
  return { worked, expected, diff: worked - expected, weekend };
}

// Keeps the pending adjustment of one attendance day in step with its times. A decided one is left
// alone (the owner already ruled on it). Returns the adjustment (or null when there's nothing).
async function syncAdjust(entry, store, ctx) {
  const { readJSON, writeJSON } = store;
  const [adjs, employees, leaveRequests] = await Promise.all([
    readJSON(ADJ, []), ctx && ctx.employees ? ctx.employees : readJSON('data/employees.json', []), readJSON('data/leave-requests.json', []),
  ]);
  const emp = employees.find((e) => e.id === entry.employeeId);
  const idx = adjs.findIndex((a) => a.attendanceId === entry.id);
  const existing = idx > -1 ? adjs[idx] : null;
  if (existing && existing.status !== 'pending') return existing;
  const d = entry.employeeId !== 'admin' ? dayDiff(entry, emp, leaveRequests) : null;
  const counts = d && Math.abs(d.diff) >= TOLERANCE;
  if (!counts) {
    if (existing) { adjs.splice(idx, 1); await writeJSON(ADJ, adjs); }
    return null;
  }
  const row = Object.assign(existing || { id: require('crypto').randomUUID(), attendanceId: entry.id, createdAt: new Date().toISOString() }, {
    employeeId: entry.employeeId, date: entry.date, checkIn: entry.checkIn, checkOut: entry.checkOut, location: entry.location || '',
    worked: d.worked, expected: d.expected, minutes: d.diff, weekend: d.weekend, status: 'pending', updatedAt: new Date().toISOString(),
  });
  if (!existing) adjs.push(row);
  await writeJSON(ADJ, adjs);
  return row;
}

// Both balances for one person, replaying every decision in the order it was taken.
function ledger(employeeId, { adjustments, leaveRequests, payouts }) {
  const events = [];
  (leaveRequests || []).forEach((r) => {
    if (r.employeeId !== employeeId || r.status !== 'approved') return;
    if (r.recovery && r.recovery.minutes) events.push({ at: r.decidedAt || r.requestedAt, kind: 'debt', minutes: r.recovery.minutes, ref: r.id });
    if (r.type === 'suplimentare') events.push({ at: r.decidedAt || r.requestedAt, kind: 'use', minutes: Number(r.minutes) || 0, ref: r.id });
  });
  (adjustments || []).forEach((a) => {
    if (a.employeeId === employeeId && a.status === 'approved') events.push({ at: a.decidedAt, kind: 'adjust', minutes: Number(a.approvedMinutes) || 0, ref: a.id });
  });
  (payouts || []).forEach((p) => { if (p.employeeId === employeeId) events.push({ at: p.at, kind: 'paid', minutes: p.minutes, ref: p.id }); });
  events.sort((x, y) => String(x.at).localeCompare(String(y.at)));
  let debt = 0, bank = 0, recovered = 0, paid = 0, used = 0;
  const effects = {};
  events.forEach((e) => {
    if (e.kind === 'debt') debt += e.minutes;
    else if (e.kind === 'use') { const take = Math.min(bank, e.minutes); bank -= take; used += take; }
    else if (e.kind === 'paid') { const take = Math.min(bank, e.minutes); bank -= take; paid += take; }
    else if (e.minutes > 0) { const cover = Math.min(debt, e.minutes); debt -= cover; recovered += cover; bank += e.minutes - cover; effects[e.ref] = { covered: cover, toBank: e.minutes - cover }; }
    else if (e.minutes < 0) { const miss = -e.minutes; const take = Math.min(bank, miss); bank -= take; debt += miss - take; effects[e.ref] = { fromBank: take, toDebt: miss - take }; }
  });
  return { debt, bank, recovered, paid, used, bankLei: Math.round((bank / 60) * OVERTIME_LEI_PER_HOUR * 100) / 100, effects };
}

// What approving a difference would do right now (shown in Aprobări before deciding).
function preview(bal, minutes) {
  if (minutes > 0) { const cover = Math.min(bal.debt, minutes); return { covered: cover, toBank: minutes - cover }; }
  const miss = -minutes, take = Math.min(bal.bank, miss);
  return { fromBank: take, toDebt: miss - take };
}

async function loadAll(readJSON) {
  const [adjustments, leaveRequests, payouts] = await Promise.all([readJSON(ADJ, []), readJSON('data/leave-requests.json', []), readJSON(PAYOUTS, [])]);
  return { adjustments, leaveRequests, payouts };
}

module.exports = {
  BASE_MINUTES, TOLERANCE, OVERTIME_LEI_PER_HOUR, ADJ, PAYOUTS,
  bucharestNow, isWeekend, workedMinutes, weekdaysBetween, dayDiff, syncAdjust, ledger, preview, loadAll,
};
