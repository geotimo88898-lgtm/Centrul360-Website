// POST /api/portal-attendance, "Condică" (attendance log), one entry per employee per day.
// One endpoint, action-routed via body.action, same style as portal-employees.js / portal-leads.js:
//
//   clock_in | clock_out | list | update (admin) | balance | balance_all (admin)
//   timebank (her hours: to make up, overtime, waiting) | adjust_list / adjust_decide (admin, the
//   days over / under 8 hours in Aprobări) | payout (admin: overtime paid with the salary)
//
// Every completed day is checked against the 8-hour day (see _lib/timebank.js).
//
// Entry shape (data/attendance.json):
//   { id, employeeId, date ('YYYY-MM-DD'), checkIn ('HH:MM'|null), checkOut ('HH:MM'|null),
//     location, note, createdAt, updatedAt }
//
// clock_in / clock_out always act on TODAY as computed from the server clock, never from a
// client-sent date, so someone can't clock in for a different day by editing the request.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAuth, requireAdmin } = require('./_lib/auth');
const TB = require('./_lib/timebank');
const { notify } = require('./_lib/notify');

const KEY = 'data/attendance.json';
// Same literal location list as api/portal-leads.js / api/portal-appointments.js.
const VALID_LOCATIONS = ['Timișoara', 'Arad'];

const pad = (n) => String(n).padStart(2, '0');
// Romanian wall clock (the servers run on UTC).
const serverToday = () => TB.bucharestNow().date;
const serverTime = () => TB.bucharestNow().time;
// "1h 05" / "45 min"
const fmtMin = (m) => { const a = Math.abs(Math.round(m)); const h = Math.floor(a / 60), r = a % 60; return h ? h + 'h' + (r ? ' ' + pad(r) : '') : r + ' min'; };
const nowISO = () => new Date().toISOString();
const isValidTime = (t) => t === null || /^\d{2}:\d{2}$/.test(t || '');
const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');

async function employeeLocation(employeeId) {
  if (employeeId === 'admin') return '';
  const employees = await readJSON('data/employees.json', []);
  const e = employees.find((x) => x.id === employeeId);
  return (e && e.location) || '';
}

const DEFAULT_ANNUAL_LEAVE_DAYS = 21; // Romania's statutory minimum is 20, 21 is just a sane default, admin edits per employee.
const DEFAULT_CONTRACTED_HOURS = 8;
const minutesOf = (hhmm) => { const m = /^(\d{2}):(\d{2})$/.exec(hhmm || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hoursOf = (checkIn, checkOut) => { const a = minutesOf(checkIn), b = minutesOf(checkOut); return a != null && b != null && b > a ? (b - a) / 60 : null; };

// Live numbers for the Condică tab, never stored, always derived from attendance.json +
// leave-requests.json + the employee's own optional fields (annualLeaveDays / contractedHoursPerDay,
// api/portal-employees.js' update_details, default 21 days / 8h/day when unset).
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

  // Only complete days (both checkIn and checkOut) count, an open/incomplete day is skipped
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
        // else: already set, no-op, idempotent.
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
      // a finished day over / under 8 hours (or any weekend time) goes to the owner's Aprobări
      const adjust = await TB.syncAdjust(entry, { readJSON, writeJSON });
      res.status(200).json({ ok: true, entry, adjust });
      return;
    }

    // ---------------------------------------------------------------- her hours
    if (action === 'timebank') {
      const targetId = isAdmin && body.employeeId ? String(body.employeeId) : session.employeeId;
      const all = await TB.loadAll(readJSON);
      const bal = TB.ledger(targetId, all);
      const adjs = all.adjustments.filter((a) => a.employeeId === targetId).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60)
        .map((a) => Object.assign({}, a, { effect: bal.effects[a.id] || null }));
      const plans = all.leaveRequests.filter((r) => r.employeeId === targetId && r.recovery && r.status !== 'rejected')
        .map((r) => ({ id: r.id, status: r.status, startDate: r.startDate, endDate: r.endDate, minutes: r.recovery.minutes, plan: r.recovery.plan || [] }));
      const pendingMinutes = adjs.filter((a) => a.status === 'pending').reduce((x, a) => x + a.minutes, 0);
      delete bal.effects;
      res.status(200).json({ ok: true, employeeId: targetId, ...bal, pendingMinutes, pendingCount: adjs.filter((a) => a.status === 'pending').length, adjustments: adjs, plans,
        rate: TB.OVERTIME_LEI_PER_HOUR, tolerance: TB.TOLERANCE, payouts: all.payouts.filter((x) => x.employeeId === targetId).slice(-12).reverse() });
      return;
    }

    // ---------------------------------------------------------------- Aprobări: days over / under
    if (action === 'adjust_list') {
      if (!requireAdmin(req, res)) return;
      const all = await TB.loadAll(readJSON);
      const employees = await readJSON('data/employees.json', []);
      const pending = all.adjustments.filter((a) => a.status === 'pending').sort((a, b) => (a.date < b.date ? -1 : 1));
      const balances = {};
      pending.forEach((a) => { if (!balances[a.employeeId]) { const b = TB.ledger(a.employeeId, all); delete b.effects; balances[a.employeeId] = b; } });
      const nameOf = (id) => { const e = employees.find((x) => x.id === id); return e ? e.name : id; };
      res.status(200).json({ ok: true, adjustments: pending.map((a) => Object.assign({ employeeName: nameOf(a.employeeId) }, a)), balances, rate: TB.OVERTIME_LEI_PER_HOUR });
      return;
    }
    if (action === 'adjust_decide') {
      if (!requireAdmin(req, res)) return;
      const adjs = await readJSON(TB.ADJ, []);
      const a = adjs.find((x) => x.id === body.id);
      if (!a) return fail(404, 'not_found');
      if (a.status !== 'pending') return fail(409, 'already_decided');
      if (!['approve', 'reject'].includes(body.decision)) return fail(400, 'invalid_decision');
      a.decidedAt = new Date().toISOString();
      a.decidedBy = session.employeeId;
      a.decisionNote = String(body.note || '').trim().slice(0, 200);
      const day = String(a.date).slice(8, 10) + '.' + String(a.date).slice(5, 7);
      if (body.decision === 'reject') {
        a.status = 'rejected'; a.approvedMinutes = 0;
        await writeJSON(TB.ADJ, adjs);
        await notify({ readJSON, writeJSON }, a.employeeId, { kind: 'time', tone: 'bad', title: 'PONTAJ ❌ - ' + day + ' respins', text: (a.minutes > 0 ? 'Cele ' + fmtMin(a.minutes) + ' în plus n-au fost aprobate.' : 'Cele ' + fmtMin(a.minutes) + ' n-au fost aprobate.') + (a.decisionNote ? ' ' + a.decisionNote : ''), go: 'condica' });
        res.status(200).json({ ok: true, adjustment: a });
        return;
      }
      // the owner can correct the minutes; the direction stays the one of the day
      let m = body.minutes != null && body.minutes !== '' ? Math.round(Number(body.minutes)) : a.minutes;
      if (!Number.isFinite(m)) return fail(400, 'invalid_minutes');
      m = Math.sign(a.minutes) * Math.min(Math.abs(m), 24 * 60);
      a.status = 'approved'; a.approvedMinutes = m;
      await writeJSON(TB.ADJ, adjs);
      const bal = TB.ledger(a.employeeId, await TB.loadAll(readJSON));
      const ef = bal.effects[a.id] || {};
      const text = m > 0
        ? '+' + fmtMin(m) + (ef.covered ? ', ' + fmtMin(ef.covered) + ' din orele de recuperat' : '') + (ef.toBank ? (ef.covered ? ', ' : ' ') + fmtMin(ef.toBank) + ' la ore suplimentare' : '') + '.'
        : fmtMin(m) + ' lipsă' + (ef.fromBank ? ', luate din orele suplimentare' : '') + (ef.toDebt ? (ef.fromBank ? ', ' : ', ') + fmtMin(ef.toDebt) + ' de recuperat' : '') + '.';
      await notify({ readJSON, writeJSON }, a.employeeId, { kind: 'time', tone: 'good', title: 'PONTAJ ✅ - ' + day + ' aprobat', text, go: 'condica' });
      res.status(200).json({ ok: true, adjustment: a, effect: ef });
      return;
    }
    // overtime paid with the salary: the whole bank, at 40 lei / hour
    if (action === 'payout') {
      if (!requireAdmin(req, res)) return;
      const targetId = String(body.employeeId || '');
      const all = await TB.loadAll(readJSON);
      const bal = TB.ledger(targetId, all);
      if (!(bal.bank > 0)) return fail(400, 'nothing_to_pay');
      const p = { id: crypto.randomUUID(), employeeId: targetId, minutes: bal.bank, lei: bal.bankLei, at: new Date().toISOString(), month: serverToday().slice(0, 7), by: session.employeeId };
      all.payouts.push(p);
      await writeJSON(TB.PAYOUTS, all.payouts);
      await notify({ readJSON, writeJSON }, targetId, { kind: 'paid', tone: 'good', title: 'ORE PLĂTITE 💵 - ' + fmtMin(p.minutes) + ' = ' + p.lei + ' lei', text: 'Le primești cu salariul.', go: 'condica' });
      res.status(200).json({ ok: true, payout: p });
      return;
    }

    // the hours to make up, set by hand by the owner (from now on her debt is this number)
    if (action === 'set_debt') {
      if (!requireAdmin(req, res)) return;
      const targetId = String(body.employeeId || '');
      const employees = await readJSON('data/employees.json', []);
      if (!employees.some((e) => e.id === targetId)) return fail(404, 'employee_not_found');
      const m = Math.round(Number(body.minutes));
      if (!Number.isFinite(m) || m < 0 || m > 1000 * 60) return fail(400, 'invalid_minutes');
      const all = await TB.loadAll(readJSON);
      const before = TB.ledger(targetId, all).debt;
      const c = { id: crypto.randomUUID(), employeeId: targetId, minutes: m, before, note: String(body.note || '').trim().slice(0, 200), at: new Date().toISOString(), by: session.employeeId };
      all.corrections.push(c);
      await writeJSON(TB.CORR, all.corrections);
      if (m !== before) await notify({ readJSON, writeJSON }, targetId, { kind: 'time', tone: 'info', title: 'RECUPERARE 🕐 - ' + (m ? 'mai ai ' + fmtMin(m) : 'nimic de recuperat'), text: c.note || 'Corectat de admin.', go: 'condica' });
      const bal = TB.ledger(targetId, all);
      delete bal.effects;
      res.status(200).json({ ok: true, correction: c, ...bal });
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
      const tbAll = await TB.loadAll(readJSON);
      const list = [];
      for (const emp of employees.filter((e) => e.id !== 'admin' && e.role !== 'admin' && e.active !== false)) {
        const balance = await computeBalance(emp.id, entries);
        const todayEntry = entries.find((e) => e.employeeId === emp.id && e.date === today) || null;
        const tb = TB.ledger(emp.id, tbAll);
        list.push({ employeeId: emp.id, name: emp.name, location: emp.location, role: emp.role, ...balance, todayCheckIn: todayEntry ? todayEntry.checkIn : null, todayCheckOut: todayEntry ? todayEntry.checkOut : null,
          debt: tb.debt, bank: tb.bank, bankLei: tb.bankLei, pending: tbAll.adjustments.filter((a) => a.employeeId === emp.id && a.status === 'pending').length });
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
      const adjust = await TB.syncAdjust(entry, { readJSON, writeJSON });
      res.status(200).json({ ok: true, entry, adjust });
      return;
    }

    fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-attendance error:', err.message);
    res.status(500).json({ error: 'attendance_failed' });
  }
};
