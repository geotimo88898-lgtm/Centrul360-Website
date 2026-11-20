// POST /api/portal-attendance, "Condică" (attendance log), one entry per employee per day.
// One endpoint, action-routed via body.action, same style as portal-employees.js / portal-leads.js:
//
//   clock_in | clock_out | list | update / create (admin, the manager: her people) | balance | balance_all (admin)
//   fix_list (De rezolvat) | fix_request (anyone, her own past day) | fix_decide | fix_dismiss (see _lib/attendance-fix.js)
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
const { notify, notifyMany, leiTxt } = require('./_lib/notify');
const { canManage, managerIds } = require('./_lib/roles');
const FIX = require('./_lib/attendance-fix');
const { adminIds } = require('./_lib/notify');
// the manager (15.11) sees everyone's pontaj on both clinics, corrects a mistaken entry and decides the days over / under
// 8 hours, never her own and never the money side (overtime in lei, the payout, the hours set by hand stay the owner's)
const noLei = (o) => { const x = Object.assign({}, o); delete x.bankLei; delete x.rate; delete x.payouts; return x; };

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
const addDaysIso = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
// a day's times that can't be: the departure before the arrival, a day in the future, today's times after now
function timesWrong(x) {
  if (x.date && x.date > serverToday()) return 'future_date';
  const a = minutesOf(x.checkIn), b = minutesOf(x.checkOut);
  if (a != null && b != null && b <= a) return 'checkout_before_checkin';
  if (x.date === serverToday()) { const now = minutesOf(serverTime()); if ((a != null && a > now + 5) || (b != null && b > now + 5)) return 'future_time'; }
  return '';
}

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

  const session = await requireAuth(req, res);
  if (!session) return;
  const isAdmin = session.role === 'admin';
  const isMgr = session.role === 'manager';
  const sees = canManage(session); // reads anyone's pontaj (the manager: her clinics' people)
  const team = await require('./_lib/roles').teamOf(session, readJSON);
  const inTeam = (id) => !team || team.has(id);
  const body = req.body || {};
  const { action } = body;
  const fail = (code, error) => res.status(code).json({ error });
  let entries = [];
  const nameOf = async (id) => { const e = (await readJSON('data/employees.json', [])).find((x) => x.id === id); return (e && e.name) || ''; };
  // who is changing it: her name (the owner's from his profile), for the „corectat de …” line
  const whoIs = async () => ({ id: session.employeeId, name: await require('./_lib/activity').whoName(session.employeeId) });
  // the Activitate line (_lib/activity.js reads `log` from the answer): whose pontaj, which day, what changed and why
  const logOf = async (entry, before, reason) => ({ subject: await nameOf(entry.employeeId), detail: FIX.dm(entry.date) + ' · ' + FIX.changeText(before, FIX.snap(entry)) + (reason ? ' · ' + String(reason).trim().slice(0, 80) : '') });
  // a day with no pontaj: added for someone (the owner, the manager for her people, or an approved request)
  async function addDay(targetId, b, o) {
    const no = (code, error, extra) => ({ code, error, extra });
    if (isMgr && targetId === session.employeeId) return no(403, 'own_request');
    if (!inTeam(targetId)) return no(403, 'forbidden');
    const employees = await readJSON('data/employees.json', []);
    const emp = employees.find((e) => e.id === targetId);
    if (!emp || emp.id === 'admin' || emp.role === 'admin') return no(404, 'employee_not_found');
    const date = String(b.date || '');
    if (!isValidDate(date)) return no(400, 'invalid_date');
    if (date > serverToday()) return no(400, 'future_date');
    if (emp.active === false && emp.leftAt && date > emp.leftAt) return no(400, 'after_left');
    const checkIn = b.checkIn || null, checkOut = b.checkOut || null;
    if (!checkIn || !checkOut || !isValidTime(checkIn) || !isValidTime(checkOut)) return no(400, 'missing_times');
    const bad = timesWrong({ date, checkIn, checkOut });
    if (bad) return no(400, bad);
    const reason = String(o.reason || '').trim();
    if (!reason) return no(400, 'missing_reason');
    const ctx = await FIX.load(readJSON);
    const why = FIX.dayCheck(ctx, targetId, date);
    if (why && !o.confirm) return no(409, 'needs_confirm', { why });
    const shift = FIX.shiftOf(ctx, targetId, date);
    const location = VALID_LOCATIONS.includes(b.location) ? b.location : (shift && VALID_LOCATIONS.includes(shift.location) ? shift.location : (VALID_LOCATIONS.includes(emp.location) ? emp.location : ''));
    // read again right before writing: a day added twice at the same time stays one
    const list = await readJSON(KEY, []);
    if (list.some((e) => e.employeeId === targetId && e.date === date)) return no(409, 'duplicate_day');
    const entry = { id: crypto.randomUUID(), employeeId: targetId, date, checkIn, checkOut, location, note: String(b.note || '').slice(0, 300), createdAt: nowISO(), updatedAt: nowISO(), addedBy: session.employeeId };
    FIX.record(entry, null, await whoIs(), o.kind || 'create', reason, o.requestId ? { requestId: o.requestId } : null);
    list.push(entry);
    await writeJSON(KEY, list);
    entries = list;
    const adjust = await TB.syncAdjust(entry, { readJSON, writeJSON });
    return { entry, adjust };
  }

  try {
    entries = await readJSON(KEY, []);

    if (action === 'clock_in' || action === 'clock_out') {
      const date = serverToday();
      // two people tapping at the same second: the file is read again right before it is written
      const location = await employeeLocation(session.employeeId);
      entries = await readJSON(KEY, entries);
      let entry = entries.find((e) => e.employeeId === session.employeeId && e.date === date);
      const field = action === 'clock_in' ? 'checkIn' : 'checkOut';
      if (entry) {
        if (!entry[field]) { entry[field] = serverTime(); entry.updatedAt = nowISO(); }
        // else: already set, no-op, idempotent.
      } else {
        entry = {
          id: crypto.randomUUID(), employeeId: session.employeeId, date,
          checkIn: null, checkOut: null, location, note: '',
          createdAt: nowISO(), updatedAt: nowISO(),
        };
        entry[field] = serverTime();
        entries.push(entry);
      }
      await writeJSON(KEY, entries);
      // two taps at the same instant could each add a row for the day (20.11: a second, open row gave hours twice):
      // the rows of her day become one, the first one, with the earliest arrival and the latest departure
      const again = await readJSON(KEY, entries);
      const mine = again.filter((e) => e && e.employeeId === session.employeeId && e.date === date);
      if (mine.length > 1) {
        mine.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
        const keep = mine[0], drop = new Set(mine.slice(1).map((e) => e.id));
        mine.slice(1).forEach((x) => {
          if (x.checkIn && (!keep.checkIn || x.checkIn < keep.checkIn)) keep.checkIn = x.checkIn;
          if (x.checkOut && (!keep.checkOut || x.checkOut > keep.checkOut)) keep.checkOut = x.checkOut;
        });
        keep.updatedAt = nowISO();
        await writeJSON(KEY, again.filter((e) => !(e && drop.has(e.id))));
        const adjs = await readJSON('data/time-adjust.json', []);
        const left = adjs.filter((a) => !(a && drop.has(a.attendanceId) && a.status === 'pending'));
        if (left.length !== adjs.length) await writeJSON('data/time-adjust.json', left);
        entry = keep;
      }
      // a finished day over / under 8 hours (or any weekend time) goes to the owner's Aprobări
      const adjust = await TB.syncAdjust(entry, { readJSON, writeJSON });
      res.status(200).json({ ok: true, entry, adjust });
      return;
    }

    // ---------------------------------------------------------------- her hours
    if (action === 'timebank') {
      const targetId = sees && body.employeeId ? String(body.employeeId) : session.employeeId;
      if (targetId !== session.employeeId && !inTeam(targetId)) return fail(403, 'forbidden');
      const all = await TB.loadAll(readJSON);
      const bal = TB.ledger(targetId, all);
      const adjs = all.adjustments.filter((a) => a.employeeId === targetId).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60)
        .map((a) => Object.assign({}, a, { effect: bal.effects[a.id] || null }));
      const plans = all.leaveRequests.filter((r) => r.employeeId === targetId && r.recovery && r.status !== 'rejected')
        .map((r) => ({ id: r.id, status: r.status, startDate: r.startDate, endDate: r.endDate, minutes: r.recovery.minutes, plan: r.recovery.plan || [] }));
      const pendingMinutes = adjs.filter((a) => a.status === 'pending').reduce((x, a) => x + a.minutes, 0);
      delete bal.effects;
      if (isMgr && targetId !== session.employeeId) {
        res.status(200).json(noLei({ ok: true, employeeId: targetId, ...bal, pendingMinutes, pendingCount: adjs.filter((a) => a.status === 'pending').length, adjustments: adjs, plans, tolerance: TB.TOLERANCE }));
        return;
      }
      res.status(200).json({ ok: true, employeeId: targetId, ...bal, pendingMinutes, pendingCount: adjs.filter((a) => a.status === 'pending').length, adjustments: adjs, plans,
        rate: TB.OVERTIME_LEI_PER_HOUR, tolerance: TB.TOLERANCE, payouts: all.payouts.filter((x) => x.employeeId === targetId).slice(-12).reverse() });
      return;
    }

    // ---------------------------------------------------------------- Aprobări: days over / under
    if (action === 'adjust_list') {
      if (!sees) return fail(403, 'forbidden');
      const all = await TB.loadAll(readJSON);
      const employees = await readJSON('data/employees.json', []);
      const pending = all.adjustments.filter((a) => a.status === 'pending' && (inTeam(a.employeeId) || a.employeeId === session.employeeId)).sort((a, b) => (a.date < b.date ? -1 : 1));
      const balances = {};
      pending.forEach((a) => { if (!balances[a.employeeId]) { const b = TB.ledger(a.employeeId, all); delete b.effects; balances[a.employeeId] = b; } });
      const nameOf = (id) => { const e = employees.find((x) => x.id === id); return e ? e.name : id; };
      if (isMgr) {
        Object.keys(balances).forEach((id) => { balances[id] = noLei(balances[id]); });
        res.status(200).json({ ok: true, adjustments: pending.map((a) => Object.assign({ employeeName: nameOf(a.employeeId), mine: a.employeeId === session.employeeId }, a)), balances });
        return;
      }
      res.status(200).json({ ok: true, adjustments: pending.map((a) => Object.assign({ employeeName: nameOf(a.employeeId) }, a)), balances, rate: TB.OVERTIME_LEI_PER_HOUR });
      return;
    }
    if (action === 'adjust_decide') {
      if (!sees) return fail(403, 'forbidden');
      const adjs = await readJSON(TB.ADJ, []);
      const a = adjs.find((x) => x.id === body.id);
      if (!a) return fail(404, 'not_found');
      if (isMgr && a.employeeId === session.employeeId) return fail(403, 'own_request'); // her own days: the owner
      if (!inTeam(a.employeeId)) return fail(403, 'forbidden');
      if (a.status !== 'pending') return fail(409, 'already_decided');
      if (!['approve', 'reject'].includes(body.decision)) return fail(400, 'invalid_decision');
      a.decidedAt = new Date().toISOString();
      a.decidedBy = session.employeeId;
      a.decisionNote = String(body.note || '').trim().slice(0, 200);
      const day = String(a.date).slice(8, 10) + '.' + String(a.date).slice(5, 7);
      if (body.decision === 'reject') {
        a.status = 'rejected'; a.approvedMinutes = 0;
        await writeJSON(TB.ADJ, adjs);
        await notify({ readJSON, writeJSON }, a.employeeId, { kind: 'time', tone: 'bad', title: 'PONTAJ ❌ - ' + day + ' respins', text: (a.minutes > 0 ? 'Cele ' + fmtMin(a.minutes) + ' în plus nu se numără.' : 'Lipsa de ' + fmtMin(a.minutes) + ' n-au fost aprobate.') + (a.decisionNote ? ' ' + a.decisionNote : ''), go: 'condica' });
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
      res.status(200).json({ ok: true, adjustment: a, effect: isMgr ? null : ef });
      return;
    }
    // overtime paid with the salary: the whole bank, at 40 lei / hour
    if (action === 'payout') {
      if (!(await requireAdmin(req, res))) return;
      const targetId = String(body.employeeId || '');
      const all = await TB.loadAll(readJSON);
      const bal = TB.ledger(targetId, all);
      if (!(bal.bank > 0)) return fail(400, 'nothing_to_pay');
      // booked to the month on the owner's screen (October's overtime paid on 3.11 belongs to October's salary)
      const month = /^\d{4}-\d{2}$/.test(String(body.month || '')) && String(body.month) <= serverToday().slice(0, 7) ? String(body.month) : serverToday().slice(0, 7);
      const p = { id: crypto.randomUUID(), employeeId: targetId, minutes: bal.bank, lei: bal.bankLei, at: new Date().toISOString(), month, by: session.employeeId };
      all.payouts.push(p);
      await writeJSON(TB.PAYOUTS, all.payouts);
      await notify({ readJSON, writeJSON }, targetId, { kind: 'paid', tone: 'good', title: 'ORE PLĂTITE 💵 - ' + fmtMin(p.minutes) + ' = ' + leiTxt(p.lei), text: 'Le primești cu salariul.', go: 'condica' });
      res.status(200).json({ ok: true, payout: p });
      return;
    }

    // the hours to make up, set by hand by the owner (from now on her debt is this number)
    if (action === 'set_debt') {
      if (!(await requireAdmin(req, res))) return;
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
      if (m !== before) await notify({ readJSON, writeJSON }, targetId, { kind: 'time', tone: 'info', title: 'RECUPERARE 🕐 - ' + (m ? 'mai ai ' + fmtMin(m) : 'nimic de recuperat'), text: c.note || 'Corectat.', go: 'condica' });
      const bal = TB.ledger(targetId, all);
      delete bal.effects;
      res.status(200).json({ ok: true, correction: c, ...bal });
      return;
    }

    if (action === 'list') {
      let list = entries;
      if (!sees) {
        list = list.filter((e) => e.employeeId === session.employeeId);
      } else if (body.employeeId) {
        if (body.employeeId !== session.employeeId && !inTeam(body.employeeId)) return fail(403, 'forbidden');
        list = list.filter((e) => e.employeeId === body.employeeId);
      } else if (team) list = list.filter((e) => inTeam(e.employeeId) || e.employeeId === session.employeeId);
      if (body.year && body.month) {
        const ym = String(body.year) + '-' + pad(Number(body.month));
        list = list.filter((e) => e.date.slice(0, 7) === ym);
      }
      list = list.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
      // her own correction requests (the last 60 days), for the „trimisă” / „respinsă” mark on her days
      const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
      const requests = (await readJSON(FIX.REQ, [])).filter((r) => r.employeeId === session.employeeId && r.date >= since);
      res.status(200).json({ ok: true, entries: list, requests });
      return;
    }

    if (action === 'balance') {
      const targetId = sees && body.employeeId ? String(body.employeeId) : session.employeeId;
      if ((!sees || !inTeam(targetId)) && targetId !== session.employeeId) return fail(403, 'forbidden');
      const balance = await computeBalance(targetId, entries);
      res.status(200).json({ ok: true, employeeId: targetId, ...balance });
      return;
    }

    if (action === 'balance_all') {
      // Admin overview: every employee's balance in one call, plus today's clock status, so
      // the Condică tab can show a team-wide table without a round trip per employee. The manager: the same, without lei.
      if (!sees) return fail(403, 'forbidden');
      const employees = await readJSON('data/employees.json', []);
      const today = serverToday();
      const tbAll = await TB.loadAll(readJSON);
      const list = [];
      for (const emp of employees.filter((e) => e.id !== 'admin' && e.role !== 'admin' && e.active !== false && (inTeam(e.id) || e.id === session.employeeId))) {
        const balance = await computeBalance(emp.id, entries);
        const todayEntry = entries.find((e) => e.employeeId === emp.id && e.date === today) || null;
        const tb = TB.ledger(emp.id, tbAll);
        list.push({ employeeId: emp.id, name: emp.name, location: emp.location, role: emp.role, ...(emp.role === 'manager' ? { manages: require('./_lib/roles').managesOf(emp) } : {}), ...balance, todayCheckIn: todayEntry ? todayEntry.checkIn : null, todayCheckOut: todayEntry ? todayEntry.checkOut : null,
          debt: tb.debt, bank: tb.bank, ...(isMgr ? {} : { bankLei: tb.bankLei }), pending: tbAll.adjustments.filter((a) => a.employeeId === emp.id && a.status === 'pending').length });
      }
      res.status(200).json({ ok: true, employees: list });
      return;
    }

    if (action === 'update') {
      if (!sees) return fail(403, 'forbidden');
      const entry = entries.find((e) => e.id === body.id);
      if (!entry) return fail(404, 'entry_not_found');
      if (isMgr && entry.employeeId === session.employeeId) return fail(403, 'own_request'); // her own day: the owner corrects it
      if (!inTeam(entry.employeeId)) return fail(403, 'forbidden');
      const before = FIX.snap(entry);
      const next = Object.assign({}, before);
      if (body.checkIn !== undefined) { if (!isValidTime(body.checkIn)) return fail(400, 'invalid_time'); next.checkIn = body.checkIn || null; }
      if (body.checkOut !== undefined) { if (!isValidTime(body.checkOut)) return fail(400, 'invalid_time'); next.checkOut = body.checkOut || null; }
      if (body.location !== undefined && VALID_LOCATIONS.includes(body.location)) next.location = body.location;
      if (body.date !== undefined && isValidDate(body.date)) next.date = body.date;
      const bad = timesWrong(next);
      if (bad) return fail(400, bad);
      if (next.date !== entry.date && entries.some((e) => e.id !== entry.id && e.employeeId === entry.employeeId && e.date === next.date)) return fail(409, 'duplicate_day');
      Object.assign(entry, next);
      if (body.note !== undefined) entry.note = String(body.note || '').slice(0, 300);
      entry.updatedAt = nowISO();
      const h = FIX.record(entry, before, await whoIs(), 'update', body.reason || '');
      await writeJSON(KEY, entries);
      const adjust = await TB.syncAdjust(entry, { readJSON, writeJSON });
      res.status(200).json({ ok: true, entry, adjust, log: await logOf(entry, h ? h.before : before, body.reason) });
      return;
    }

    // ---------------------------------------------------------------- a day with no pontaj at all, added by hand
    if (action === 'create') {
      if (!sees) return fail(403, 'forbidden');
      const targetId = String(body.employeeId || '');
      const r = await addDay(targetId, body, { reason: body.reason, confirm: !!body.confirm, kind: 'create' });
      if (r.error) return res.status(r.code).json(Object.assign({ error: r.error }, r.extra || {}));
      res.status(200).json({ ok: true, entry: r.entry, adjust: r.adjust, log: await logOf(r.entry, null, body.reason) });
      return;
    }

    // ---------------------------------------------------------------- De rezolvat (the owner, the manager)
    if (action === 'fix_list') {
      if (!sees) return fail(403, 'forbidden');
      const ctx = await FIX.load(readJSON);
      const rows = FIX.problems(ctx, { team, today: serverToday() });
      // the owner: the manager's own requests first (only the owner decides them)
      if (isAdmin) rows.sort((a, b) => (b.role === 'manager' && b.kind === 'request' ? 1 : 0) - (a.role === 'manager' && a.kind === 'request' ? 1 : 0));
      res.status(200).json({ ok: true, rows, today: serverToday(), window: FIX.WINDOW, lateMin: FIX.LATE_MIN });
      return;
    }
    if (action === 'fix_dismiss') {
      if (!sees) return fail(403, 'forbidden');
      const m = /^([^|]+)\|(\d{4}-\d{2}-\d{2})\|(missing|late|no_out|no_in)$/.exec(String(body.key || ''));
      if (!m) return fail(400, 'invalid_key');
      if (isMgr && m[1] === session.employeeId) return fail(403, 'own_request');
      if (!inTeam(m[1])) return fail(403, 'forbidden');
      const doc = await readJSON(FIX.DISMISS, {});
      doc.keys = doc.keys && typeof doc.keys === 'object' ? doc.keys : {};
      doc.keys[body.key] = { by: session.employeeId, at: nowISO(), note: String(body.note || '').trim().slice(0, 200) };
      await writeJSON(FIX.DISMISS, doc);
      res.status(200).json({ ok: true, log: { subject: await nameOf(m[1]), detail: FIX.dm(m[2]) + (m[3] === 'missing' ? ' · nu a lucrat' : ' · e corect') } });
      return;
    }

    // ---------------------------------------------------------------- „Cere corectarea” (her own past day)
    if (action === 'fix_request') {
      if (session.employeeId === 'admin' || isAdmin) return fail(403, 'forbidden');
      const date = String(body.date || '');
      if (!isValidDate(date)) return fail(400, 'invalid_date');
      if (date > serverToday()) return fail(400, 'future_date');
      if (date < addDaysIso(serverToday(), -31)) return fail(400, 'too_old');
      const checkIn = body.checkIn || null, checkOut = body.checkOut || null;
      if (!isValidTime(checkIn) || !isValidTime(checkOut)) return fail(400, 'invalid_time');
      if (!checkIn && !checkOut) return fail(400, 'missing_times');
      const entry = entries.find((e) => e.employeeId === session.employeeId && e.date === date) || null;
      const merged = { date, checkIn: checkIn || (entry && entry.checkIn) || null, checkOut: checkOut || (entry && entry.checkOut) || null };
      if (!entry && (!merged.checkIn || !merged.checkOut)) return fail(400, 'missing_times');
      const bad = timesWrong(merged);
      if (bad) return fail(400, bad);
      const reqs = await readJSON(FIX.REQ, []);
      // one open request a day: a new one replaces it
      let r = reqs.find((x) => x.employeeId === session.employeeId && x.date === date && x.status === 'pending');
      const fresh = !r;
      if (!r) { r = { id: crypto.randomUUID(), employeeId: session.employeeId, date, status: 'pending' }; reqs.push(r); }
      Object.assign(r, { checkIn, checkOut, note: String(body.note || '').trim().slice(0, 200), at: nowISO() });
      await writeJSON(FIX.REQ, reqs);
      const employees = await readJSON('data/employees.json', []);
      const me = employees.find((e) => e.id === session.employeeId) || {};
      // who decides: the manager of her clinic; the manager's own (or no manager there): the owner
      const mgrs = isMgr ? [] : managerIds(employees, me.location).filter((id) => id !== session.employeeId);
      const to = mgrs.length ? mgrs : await adminIds({ readJSON });
      const text = (me.name ? FIX.firstName(me.name) + ', ' : '') + FIX.dm(date) + ': ' + [checkIn ? 'sosire ' + checkIn : '', checkOut ? 'plecare ' + checkOut : ''].filter(Boolean).join(', ') + (r.note ? '. „' + r.note + '”' : '') + '. Se aprobă din Condică.';
      await notifyMany({ readJSON, writeJSON }, to, { kind: mgrs.length ? 'time' : 'approval', tone: 'info', title: 'CORECTARE PONTAJ 🕐 - ' + FIX.dm(date), text, go: mgrs.length ? 'condica' : 'angajati/condica', tag: 'fixreq-' + r.id });
      res.status(200).json({ ok: true, request: r, replaced: !fresh, log: { subject: '', detail: FIX.dm(date) + ' · ' + [checkIn ? 'sosire ' + checkIn : '', checkOut ? 'plecare ' + checkOut : ''].filter(Boolean).join(', ') + (r.note ? ' · ' + r.note : '') } });
      return;
    }
    if (action === 'fix_decide') {
      if (!sees) return fail(403, 'forbidden');
      const reqs = await readJSON(FIX.REQ, []);
      const r = reqs.find((x) => x.id === body.id);
      if (!r) return fail(404, 'not_found');
      if (isMgr && r.employeeId === session.employeeId) return fail(403, 'own_request');
      if (!inTeam(r.employeeId)) return fail(403, 'forbidden');
      if (r.status !== 'pending') return fail(409, 'already_decided');
      if (!['approve', 'reject'].includes(body.decision)) return fail(400, 'invalid_decision');
      const who = await whoIs();
      const note = String(body.note || '').trim().slice(0, 200);
      const day = FIX.dm(r.date);
      if (body.decision === 'reject') {
        Object.assign(r, { status: 'rejected', decidedAt: nowISO(), decidedBy: session.employeeId, decidedByName: FIX.firstName(who.name), decisionNote: note });
        await writeJSON(FIX.REQ, reqs);
        await notify({ readJSON, writeJSON }, r.employeeId, { kind: 'time', tone: 'bad', title: 'PONTAJ ❌ - corectarea din ' + day + ' respinsă', text: note || 'Pontajul rămâne cum era.', go: 'condica' });
        res.status(200).json({ ok: true, request: r, log: { subject: await nameOf(r.employeeId), detail: day + ' · respinsă' + (note ? ': ' + note : '') } });
        return;
      }
      // the times asked for, or the ones she set in the sheet before approving
      const times = { checkIn: body.checkIn !== undefined ? body.checkIn || null : r.checkIn, checkOut: body.checkOut !== undefined ? body.checkOut || null : r.checkOut };
      if (!isValidTime(times.checkIn) || !isValidTime(times.checkOut)) return fail(400, 'invalid_time');
      const reason = 'Cerută de ' + FIX.firstName(await nameOf(r.employeeId)) + (r.note ? ': ' + r.note : '') + (note ? ' · ' + note : '');
      let entry = entries.find((e) => e.employeeId === r.employeeId && e.date === r.date);
      let adjust = null, before = null;
      if (entry) {
        before = FIX.snap(entry);
        const next = Object.assign({}, before, { checkIn: times.checkIn || before.checkIn, checkOut: times.checkOut || before.checkOut });
        if (body.location !== undefined && VALID_LOCATIONS.includes(body.location)) next.location = body.location;
        const bad = timesWrong(next);
        if (bad) return fail(400, bad);
        Object.assign(entry, next, { updatedAt: nowISO() });
        FIX.record(entry, before, who, 'request', reason, { requestId: r.id });
        await writeJSON(KEY, entries);
        adjust = await TB.syncAdjust(entry, { readJSON, writeJSON });
      } else {
        const out = await addDay(r.employeeId, { date: r.date, checkIn: times.checkIn, checkOut: times.checkOut, location: body.location }, { reason, confirm: true, kind: 'request', requestId: r.id });
        if (out.error) return res.status(out.code).json({ error: out.error });
        entry = out.entry; adjust = out.adjust;
      }
      const fresh = await readJSON(FIX.REQ, reqs);
      const rr = fresh.find((x) => x.id === r.id) || r;
      Object.assign(rr, { status: 'approved', decidedAt: nowISO(), decidedBy: session.employeeId, decidedByName: FIX.firstName(who.name), decisionNote: note, entryId: entry.id, applied: FIX.snap(entry) });
      await writeJSON(FIX.REQ, fresh);
      await notify({ readJSON, writeJSON }, r.employeeId, { kind: 'time', tone: 'good', title: 'PONTAJ ✅ - ' + day + ' corectat', text: 'Sosire ' + (entry.checkIn || '-') + ', plecare ' + (entry.checkOut || '-') + '.' + (note ? ' ' + note : ''), go: 'condica' });
      res.status(200).json({ ok: true, request: rr, entry, adjust, log: await logOf(entry, before, reason) });
      return;
    }

    fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-attendance error:', err.message);
    res.status(500).json({ error: 'attendance_failed' });
  }
};
