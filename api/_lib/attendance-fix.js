// Pontaj corrections (the owner, 16.11: the manager fixes the team's pontaj herself, a forgotten clock-in or clock-out).
//
//   De rezolvat  what needs a fix, worked out live from the pontaj and the team's schedule, never stored:
//                  no_out    a past day with an arrival and no departure
//                  no_in     a past day with a departure and no arrival
//                  missing   a working day of her schedule (Calendar → Program echipă) with no pontaj and no leave
//                  late      an arrival 45+ minutes after her shift starts, while the day isn't decided
//                  request   a correction she asked for herself („Cere corectarea”)
//                Only the last 14 days (late: 7), never before her first pontaj. A row the manager knows is fine
//                („Nu a lucrat”, „E corect”) is set aside in data/attendance-fix.json and doesn't come back.
//   Requests     data/attendance-requests.json: [{ id, employeeId, date, checkIn, checkOut, note, status ('pending' |
//                'approved' | 'rejected'), at, decidedAt, decidedBy, decidedByName, decisionNote, entryId }]
//   History      every change of an entry by someone else than the clock keeps who, when, why and before → after:
//                entry.history = [{ at, by, byName, kind ('create' | 'update' | 'request'), before, after, reason }]
//
// Who: the manager for her clinics' people (never her own pontaj), the owner for everyone. The owner gets no alert
// for the list: it is her job; a request of the manager herself goes to the owner.

const TB = require('./timebank');
const TS = require('./team-schedule');

const REQ = 'data/attendance-requests.json';
const DISMISS = 'data/attendance-fix.json';
const WINDOW = 14;      // days looked back
const LATE_WINDOW = 7;  // days looked back for a late arrival
const LATE_MIN = 45;    // minutes after the shift's start that look like a forgotten clock-in

const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null; };
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const dm = (d) => String(d || '').slice(8, 10) + '.' + String(d || '').slice(5, 7);
const keyOf = (employeeId, date, kind) => employeeId + '|' + date + '|' + kind;

// the entry's fields a correction can change
const snap = (e) => ({ date: e.date, checkIn: e.checkIn || null, checkOut: e.checkOut || null, location: e.location || '' });
const LABEL = { checkIn: 'sosire', checkOut: 'plecare', date: 'ziua', location: 'locația' };
// „sosire 09:00 → 09:30, plecare - → 17:00”
function changeText(before, after) {
  if (!before) return ['sosire ' + (after.checkIn || '-'), 'plecare ' + (after.checkOut || '-')].join(', ');
  return Object.keys(LABEL).filter((k) => (before[k] || '') !== (after[k] || ''))
    .map((k) => LABEL[k] + ' ' + (k === 'date' ? dm(before[k]) : before[k] || '-') + ' → ' + (k === 'date' ? dm(after[k]) : after[k] || '-')).join(', ');
}
// one line of history on the entry (kept to the last 20); nothing when nothing changed
function record(entry, before, who, kind, reason, extra) {
  const after = snap(entry);
  if (before && !changeText(before, after)) return null;
  const h = Object.assign({ at: new Date().toISOString(), by: who.id, byName: firstName(who.name), kind, before: before || null, after, reason: String(reason || '').trim().slice(0, 200) }, extra || {});
  entry.history = (Array.isArray(entry.history) ? entry.history : []).concat(h).slice(-20);
  return h;
}

// an approved leave request that covers the day (the whole day off, or hours off that day)
const leaveOn = (leaveRequests, employeeId, date) => (leaveRequests || []).some((r) => r && r.employeeId === employeeId && r.status === 'approved' && date >= r.startDate && date <= r.endDate);

// why a day needs a „sure?” before a pontaj is added: 'leave' (a leave, approved or on the calendar), 'off' (not a day of
// her schedule), 'weekend' (no schedule and a weekend), or ''
function dayCheck(ctx, employeeId, date) {
  if (leaveOn(ctx.leaveRequests, employeeId, date) || TS.onLeave(ctx.appts, employeeId, date)) return 'leave';
  const d = TS.dayOf(ctx.schedule, employeeId, date);
  if (TS.extraOf(ctx.schedule, employeeId, date).length) return ''; // her overtime that day (Ore suplimentare, 18.11)
  if (d && !d.on) return 'off';
  if (!d && TB.isWeekend(date)) return 'weekend';
  return '';
}
// her hours that day by the schedule ({ from, to, location }) or null
const shiftOf = (ctx, employeeId, date) => {
  const d = TS.dayOf(ctx.schedule, employeeId, date);
  return d && d.on && toMin(d.from) != null && toMin(d.to) > toMin(d.from) ? { from: d.from, to: d.to, location: d.location || '' } : null;
};

async function load(readJSON) {
  const [attendance, employees, schedule, appts, leaveRequests, adjustments, requests, dismissed] = await Promise.all([
    readJSON('data/attendance.json', []), readJSON('data/employees.json', []), TS.load(), readJSON('data/appointments.json', []),
    readJSON('data/leave-requests.json', []), readJSON(TB.ADJ, []), readJSON(REQ, []), readJSON(DISMISS, {}),
  ]);
  return { attendance, employees, schedule, appts, leaveRequests, adjustments, requests, dismissed: (dismissed && dismissed.keys) || {} };
}

// the list. scope: { team (Set of ids, or null for everyone), today }. Rows: { key, kind, employeeId, name, role, location,
// date, entryId, checkIn, checkOut, from, to, request }
function problems(ctx, scope) {
  const today = scope.today;
  const since = addDays(today, -WINDOW), lateSince = addDays(today, -LATE_WINDOW);
  const people = (ctx.employees || []).filter((e) => e && e.id && e.id !== 'admin' && e.role !== 'admin' && (!scope.team || scope.team.has(e.id)));
  const until = new Map(people.filter((e) => e.active === false).map((e) => [e.id, /^\d{4}-\d{2}-\d{2}$/.test(e.leftAt || '') ? e.leftAt : '2026-10-31']));
  const rows = [];
  const pendingDay = new Set((ctx.requests || []).filter((r) => r.status === 'pending').map((r) => r.employeeId + '|' + r.date));
  const off = (k) => !!ctx.dismissed[k];
  people.forEach((e) => {
    const mine = (ctx.attendance || []).filter((x) => x && x.employeeId === e.id);
    const byDay = new Map(mine.map((x) => [x.date, x]));
    const first = mine.reduce((m, x) => (!m || x.date < m ? x.date : m), '');
    const base = { employeeId: e.id, name: e.name || '', role: e.role, location: e.location || '' };
    const push = (kind, date, extra) => {
      const key = keyOf(e.id, date, kind);
      if (off(key) || pendingDay.has(e.id + '|' + date)) return;
      const s = shiftOf(ctx, e.id, date);
      rows.push(Object.assign({ key, kind, date, from: s ? s.from : '', to: s ? s.to : '', location: (s && s.location) || base.location }, base, extra));
    };
    mine.filter((x) => x.date >= since && x.date <= today).forEach((x) => {
      if (until.has(e.id) && x.date > until.get(e.id)) return;
      if (x.date < today && x.checkIn && !x.checkOut) return push('no_out', x.date, { entryId: x.id, checkIn: x.checkIn, checkOut: null });
      if (x.date < today && !x.checkIn && x.checkOut) return push('no_in', x.date, { entryId: x.id, checkIn: null, checkOut: x.checkOut });
      if (x.date >= lateSince && x.checkIn) {
        const s = shiftOf(ctx, e.id, x.date), adj = (ctx.adjustments || []).find((a) => a.attendanceId === x.id);
        if (s && toMin(x.checkIn) - toMin(s.from) >= LATE_MIN && !(adj && adj.status !== 'pending')) push('late', x.date, { entryId: x.id, checkIn: x.checkIn, checkOut: x.checkOut || null });
      }
    });
    if (!first) return; // never clocked in: nothing to compare with yet
    for (let d = since > first ? since : first; d < today; d = addDays(d, 1)) {
      if (byDay.has(d)) continue;
      if (!TS.workingAt(ctx.schedule, e.id, d, null, { appts: ctx.appts, until })) continue;
      if (leaveOn(ctx.leaveRequests, e.id, d)) continue;
      push('missing', d, { entryId: null, checkIn: null, checkOut: null });
    }
  });
  // what the team asked for (not on the list of the one who decides it: her own goes to the owner)
  (ctx.requests || []).filter((r) => r.status === 'pending' && (!scope.team || scope.team.has(r.employeeId))).forEach((r) => {
    const e = (ctx.employees || []).find((x) => x.id === r.employeeId) || {};
    const s = shiftOf(ctx, r.employeeId, r.date);
    const entry = (ctx.attendance || []).find((x) => x.employeeId === r.employeeId && x.date === r.date) || null;
    rows.push({ key: 'req|' + r.id, kind: 'request', employeeId: r.employeeId, name: e.name || '', role: e.role || '', location: (entry && entry.location) || (s && s.location) || e.location || '',
      date: r.date, entryId: entry ? entry.id : null, checkIn: entry ? entry.checkIn : null, checkOut: entry ? entry.checkOut : null, from: s ? s.from : '', to: s ? s.to : '', request: r });
  });
  const order = { request: 0, no_out: 1, no_in: 1, missing: 2, late: 3 };
  return rows.sort((a, b) => order[a.kind] - order[b.kind] || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || a.name.localeCompare(b.name));
}

module.exports = { REQ, DISMISS, WINDOW, LATE_MIN, snap, changeText, record, dayCheck, shiftOf, leaveOn, load, problems, firstName, keyOf, dm };
