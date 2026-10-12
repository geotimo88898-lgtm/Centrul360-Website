// POST /api/portal-attendance — "Condică" (attendance log), one entry per employee per day.
// One endpoint, action-routed via body.action, same style as portal-employees.js / portal-leads.js:
//
//   clock_in | clock_out | list | update (admin) | balance
//
// Entry shape (data/attendance.json):
//   { id, employeeId, date ('YYYY-MM-DD'), checkIn ('HH:MM'|null), checkOut ('HH:MM'|null),
//     location, note, createdAt, updatedAt }
//
// clock_in / clock_out always act on TODAY as computed from the server clock — never from a
// client-sent date, so someone can't clock in for a different day by editing the request.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAuth, requireAdmin } = require('./_lib/auth');

const KEY = 'data/attendance.json';
// Same literal location list as api/portal-leads.js / api/portal-appointments.js.
const VALID_LOCATIONS = ['Timișoara', 'Arad'];

const pad = (n) => String(n).padStart(2, '0');
function serverToday() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function serverTime() {
  const d = new Date();
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}
const nowISO = () => new Date().toISOString();
const isValidTime = (t) => t === null || /^\d{2}:\d{2}$/.test(t || '');
const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

async function employeeLocation(employeeId) {
  if (employeeId === 'admin') return '';
  const employees = await readJSON('data/employees.json', []);
  const e = employees.find((x) => x.id === employeeId);
  return (e && e.location) || '';
}

const DEFAULT_ANNUAL_LEAVE_DAYS = 21; // Romania's statutory minimum is 20 — 21 is just a sane default, admin edits per employee.
const DEFAULT_CONTRACTED_HOURS = 8;
const minutesOf = (hhmm) => { const m = /^(\d{2}):(\d{2})$/.exec(hhmm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hoursOf = (checkIn, checkOut) => { const a = minutesOf(checkIn), b = minutesOf(checkOut); return a != null && b != null && b > a ? (b - a) / 60 : null; };

// Live numbers for the Condică tab — never stored, always derived from attendance.json +
// leave-requests.json + the employee's own optional fields (annualLeaveDays / contractedHoursPerDay,
// api/portal-employees.js' update_details — default 21 days / 8h/day when unset).
async function computeBalance(employeeId, entries) {
  const employees = await readJSON('data/employees.json', []);
  const emp = employeeId === 'admin' ? {} : employees.find((e) => e.id === employeeId) || {};
  const annualLeaveDays = Number.isFinite(Number(emp.annualLeaveDays)) ? Number(emp.annualLeaveDays) : DEFAULT_ANNUAL_LEAVE_DAYS;
  const contractedHoursPerDay = Number.isFinite(Number(emp.contractedHoursPerDay)) && emp.contractedHoursPerDay > 0 ? Number(emp.contractedHoursPerDay) : DEFAULT_CONTRACTED_HOURS;

  const year = String(new Date().getFullYear());
  const leaveRequests = await readJSON('data/leave-requests.json', []);
  const daysUsed = leaveRequests
    .filter((r) => r.employeeId === employeeId && r.type === 'odihna' && r.status === 'approved' && String(r.startDate || '').slice(0, 4) === year)
    .reduce((a, r) => a + Number(r.workDays || 0), 0);

  // Only complete days (both checkIn and checkOut) count — an open/incomplete day is skipped
  // rather than treated as a full shortfall.
  let hoursDelta = 0;
  entries
    .filter((e) => e.employeeId === employeeId && String(e.date).slice(0, 4) === year)
    .forEach((e) => { const h = hoursOf(e.checkIn, e.checkOut); if (h != null) hoursDelta += h - contractedHoursPerDay; });

  return {
    annualLeaveDays, daysUsed, daysLeft: Math.round((annualLeaveDays - daysUsed) * 100) / 100,
    contractedHoursPerDay, hoursDelta: Math.round(hoursDelta * 100) / 100, hoursPeriod: 'anul curent',
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;
  const isAdmin = session.role === 'admin';
  const body = req.body || {};
  const { action } = body;
  const fail = (code, error) => res.status(code).json({ error });

  try {
    const entries = await readJSON(KEY, []);

    if (action === 'clock_in' || action === 'clock_out') {
      const date = serverToday();
      let entry = entries.find((e) => e.employeeId === session.employeeId && e.date === date);
      const field = action === 'clock_in' ? 'checkIn' : 'checkOut';
      if (entry) {
        if (!entry[field]) { entry[field] = serverTime(); entry.updatedAt = nowISO(); }
        // else: already set — no-op, idempotent.
      } else {
        entry = {
          id: crypto.randomUUID(), employeeId: session.employeeId, date,
          checkIn: null, checkOut: null, location: await employeeLocation(session.employeeId), note: '',
          createdAt: nowISO(), updatedAt: nowISO(),
        };
        entry[field] = serverTime();
        entries.push(entry);
      }
      await writeJSON(KEY, entries);
      res.status(200).json({ ok: true, entry });
      return;
    }

    if (action === 'list') {
      let list = entries;
      if (!isAdmin) {
        list = list.filter((e) => e.employeeId === session.employeeId);
      } else if (body.employeeId) {
        list = list.filter((e) => e.employeeId === body.employeeId);
      }
      if (body.year && body.month) {
        const ym = String(body.year) + '-' + pad(Number(body.month));
        list = list.filter((e) => e.date.slice(0, 7) === ym);
      }
      list = list.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      res.status(200).json({ ok: true, entries: list });
      return;
    }

    if (action === 'balance') {
      const targetId = isAdmin && body.employeeId ? String(body.employeeId) : session.employeeId;
      if (!isAdmin && targetId !== session.employeeId) return fail(403, 'forbidden');
      const balance = await computeBalance(targetId, entries);
      res.status(200).json({ ok: true, employeeId: targetId, ...balance });
      return;
    }

    if (action === 'balance_all') {
      // Admin overview: every employee's balance in one call, plus today's clock status, so
      // the Condică tab can show a team-wide table without a round trip per employee.
      if (!requireAdmin(req, res)) return;
      const employees = await readJSON('data/employees.json', []);
      const today = serverToday();
      const list = [];
      for (const emp of employees.filter((e) => e.id !== 'admin' && e.active !== false)) {
        const balance = await computeBalance(emp.id, entries);
        const todayEntry = entries.find((e) => e.employeeId === emp.id && e.date === today) || null;
        list.push({ employeeId: emp.id, name: emp.name, location: emp.location, role: emp.role, ...balance, todayCheckIn: todayEntry ? todayEntry.checkIn : null, todayCheckOut: todayEntry ? todayEntry.checkOut : null });
      }
      res.status(200).json({ ok: true, employees: list });
      return;
    }

    if (action === 'update') {
      if (!requireAdmin(req, res)) return;
      const entry = entries.find((e) => e.id === body.id);
      if (!entry) return fail(404, 'entry_not_found');
      if (body.checkIn !== undefined) {
        if (!isValidTime(body.checkIn)) return fail(400, 'invalid_time');
        entry.checkIn = body.checkIn || null;
      }
      if (body.checkOut !== undefined) {
        if (!isValidTime(body.checkOut)) return fail(400, 'invalid_time');
        entry.checkOut = body.checkOut || null;
      }
      if (body.note !== undefined) entry.note = String(body.note || '').slice(0, 300);
      if (body.location !== undefined && VALID_LOCATIONS.includes(body.location)) entry.location = body.location;
      if (body.date !== undefined && isValidDate(body.date)) entry.date = body.date;
      entry.updatedAt = nowISO();
      await writeJSON(KEY, entries);
      res.status(200).json({ ok: true, entry });
      return;
    }

    fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-attendance error:', err.message);
    res.status(500).json({ error: 'attendance_failed' });
  }
};
