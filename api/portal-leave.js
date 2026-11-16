// POST /api/portal-leave, "Cereri de concediu" (leave requests), folded into the admin's
// existing Aprobări mental model (api/portal-approve.js does the same for commission).
// One endpoint, action-routed via body.action:
//
//   create | list | decide (admin, the manager for her team) | admin_create | cancel (admin, the manager for her team)
//
// An approval answers with `affected`: her bookings on those days, left without a cosmetician (_lib/time-care.js), each
// with the colleagues free then; the desk hears it and the Calendar lists them („Rămase fără cosmeticiană”, why
// „concediu”) until each is given to someone else or moved; their client reminders wait meanwhile. „Ore libere” that
// don't cover whole days ask for the hours (hours: { from, to }): a blocked time for her those hours. cancel: an
// approved leave taken back (status 'cancelled'), its rows gone from the Calendar, she and the desk told.
//
// Request shape (data/leave-requests.json):
//   { id, employeeId, type ('odihna'|'fara_plata'|'medical'|'alta'|'suplimentare'), startDate, endDate,
//     workDays, reason, status ('pending'|'approved'|'rejected'), requestedAt, decidedAt,
//     decidedBy, rejectionNote, pdfBlobPath,
//     recovery?: { minutes, plan: [{ date, minutes }] }   ('alta' "cu recuperare": hours she'll make up)
//     minutes? }                                          ('suplimentare': hours off paid from her overtime)
// Approved recovery / overtime use move her hours balances (_lib/timebank.js).
//
// On approval, a one-page PDF is generated (api/_lib/pdf-leave.js) and stored privately in
// Blob at data/leave-pdfs/{id}.pdf; api/portal-leave-pdf.js streams it back to the admin or the
// requesting employee. This is a mechanism, not a legal guarantee, see the UI copy and the
// footer notice printed on the PDF itself.

const crypto = require('crypto');
const { readJSON, writeJSON, writeBinary } = require('./_lib/store');
const { requireAuth, requireAdmin } = require('./_lib/auth');
const { buildLeaveRequestPdf } = require('./_lib/pdf-leave');
const { createBlockingAppointment } = require('./portal-appointments');
const TB = require('./_lib/timebank');
const { notify, notifyMany, adminIds } = require('./_lib/notify');
const { canManage } = require('./_lib/roles');

const KEY = 'data/leave-requests.json';
const VALID_TYPES = ['odihna', 'fara_plata', 'medical', 'alta', 'suplimentare'];
const REASON_REQUIRED = ['medical', 'alta'];
const MAX_REASON = 500;
// Full labels (with diacritics) for the calendar block, the PDF strips diacritics itself
// (see _lib/pdf-leave.js), but the Calendar UI renders UTF-8 fine.
const LEAVE_LABELS = { odihna: 'Concediu de odihnă', fara_plata: 'Concediu fără plată', medical: 'Concediu medical', alta: 'Alt tip de concediu', suplimentare: 'Ore libere din orele suplimentare' };
const fmtMin = (m) => { const a = Math.abs(Math.round(m)); const h = Math.floor(a / 60), r = a % 60; return h ? h + 'h' + (r ? ' ' + String(r).padStart(2, '0') : '') : r + ' min'; };
const hm = (m) => Math.round(Number(m) || 0);
// Same literal location list as api/portal-appointments.js / api/portal-leads.js.
const VALID_LOCATIONS = ['Timișoara', 'Arad'];

const nowISO = () => new Date().toISOString();
const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && Number.isFinite(new Date(d + 'T00:00:00').getTime());
const pad2 = (n) => String(n).padStart(2, '0');
const isoDate = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

// Marks the employee unavailable on the Calendar for every day of the approved leave, so
// reception doesn't accidentally book an appointment during it. Best-effort: an employee with
// no fixed location (e.g. the admin, who isn't scheduled on the Calendar) simply gets no block.
// hours ({ from, to }): „Ore libere” for part of a day, a blocked time for her those hours on each weekday of the range.
// Each row carries leaveId (cancel finds them by it).
async function blockCalendar(request, employee, hours) {
  if (!VALID_LOCATIONS.includes(employee.location)) return;
  const label = hours ? 'Ore libere' : 'Concediu - ' + (LEAVE_LABELS[request.type] || request.type);
  const start = new Date(request.startDate + 'T00:00:00');
  const end = new Date(request.endDate + 'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (hours && (d.getDay() === 0 || d.getDay() === 6)) continue;
    await createBlockingAppointment({ date: isoDate(d), location: employee.location, cosmeticianId: request.employeeId, cosmeticianName: employee.name, label,
      ...(hours ? { time: hours.from, endTime: hours.to, block: true } : {}), leaveId: request.id });
  }
}
const TC = require('./_lib/time-care');
const toMin = (t) => { const m = /^(\d{2}):(\d{2})$/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null; };
// the hours of a partial day off: { from, to } at :00/:15/:30/:45, to after from, or null
function cleanHours(h) {
  const f = toMin(h && h.from), t = toMin(h && h.to);
  return f != null && t != null && t > f && f % 15 === 0 && t % 15 === 0 && t <= 24 * 60 ? { from: h.from, to: h.to } : null;
}
// her bookings left without a cosmetician by the leave (the hours only, for a partial day), for the answer and the desk
async function leaveAffected(request, employee, hours, session) {
  const [appts, emps, doc] = await Promise.all([readJSON('data/appointments.json', []), readJSON('data/employees.json', []), require('./_lib/team-schedule').load()]);
  let list = TC.affected(appts, request.employeeId, TC.daysOf(request.startDate, request.endDate));
  if (hours) { const f = toMin(hours.from), t = toMin(hours.to); list = list.filter((a) => { const s = toMin(a.time); if (s == null) return true; const e = toMin(a.endTime); return s < t && (e != null && e > s ? e : s + 60) > f; }); }
  if (list.length) await TC.tellDesk({ readJSON, writeJSON }, emps, list, request.employeeId, (hours ? 'Ore libere ' : 'Concediu ') + String(employee.name || '').split(' ')[0], session && session.employeeId);
  return TC.rows(list, appts, emps, doc);
}
// someone who left („A plecat”): her requests still waiting are answered no (api/portal-employees.js set_active)
async function rejectPendingOf(employeeId, by) {
  const requests = await readJSON(KEY, []);
  const mine = requests.filter((r) => r.employeeId === employeeId && r.status === 'pending');
  if (!mine.length) return 0;
  const at = nowISO();
  mine.forEach((r) => { r.status = 'rejected'; r.decidedAt = at; r.decidedBy = by || 'admin'; r.rejectionNote = 'A plecat din echipă'; });
  await writeJSON(KEY, requests);
  return mine.length;
}

// Simple calendar count of Mon-Fri between start/end inclusive, doesn't model Romanian public
// holidays (there's no holiday calendar in this codebase), so this is an approximation the
// owner should sanity-check for periods spanning a legal holiday.
function workDaysBetween(startDate, endDate) {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

async function employeeInfo(employeeId) {
  if (employeeId === 'admin') return { name: await require('./_lib/activity').whoName('admin'), role: 'Administrator', location: '' };
  const employees = await readJSON('data/employees.json', []);
  const e = employees.find((x) => x.id === employeeId);
  if (!e) return { name: employeeId, role: '', location: '' };
  const ROLE = { receptie: 'Recepție', cosmetician: 'Cosmeticiană', manager: 'Manager', admin: 'Administrator' };
  return { name: e.name, role: ROLE[e.role] || (e.role ? e.role[0].toUpperCase() + e.role.slice(1) : ''), location: e.location, cnp: e.cnp || '' };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireAuth(req, res);
  if (!session) return;
  const isAdmin = session.role === 'admin';
  // the manager (15.11) plans and decides the team's leave, never her own (that one is the owner's)
  const isMgr = session.role === 'manager';
  const sees = canManage(session);
  const team = await require('./_lib/roles').teamOf(session, readJSON); // the manager: her clinics' people
  const inTeam = (id) => !team || team.has(id);
  const body = req.body || {};
  const { action } = body;
  const fail = (code, error) => res.status(code).json({ error });

  try {
    const requests = await readJSON(KEY, []);

    if (action === 'create') {
      const { type, startDate, endDate } = body;
      if (!VALID_TYPES.includes(type)) return fail(400, 'invalid_type');
      if (!isValidDate(startDate) || !isValidDate(endDate)) return fail(400, 'invalid_date');
      if (endDate < startDate) return fail(400, 'invalid_range');
      const reason = String(body.reason || '').trim().slice(0, MAX_REASON);
      if (REASON_REQUIRED.includes(type) && !reason) return fail(400, 'missing_reason');
      if (requests.some((r) => r.employeeId === session.employeeId && r.status !== 'rejected' && r.status !== 'cancelled' && r.startDate <= endDate && r.endDate >= startDate)) return fail(409, 'overlapping_request');
      if (type !== 'suplimentare' && !workDaysBetween(startDate, endDate)) return fail(400, 'no_work_days');

      // "Altul" + "cu recuperare": how many hours she misses and when she'll make them up
      let recovery = null;
      if (type === 'alta' && body.recovery) {
        const total = hm(body.recovery.minutes);
        const plan = (Array.isArray(body.recovery.plan) ? body.recovery.plan : []).slice(0, 30)
          .map((x) => ({ date: String(x.date || ''), minutes: hm(x.minutes) })).filter((x) => isValidDate(x.date) && x.minutes > 0);
        if (!(total > 0) || total > 31 * 24 * 60) return fail(400, 'invalid_recovery');
        if (!plan.length || plan.reduce((a, x) => a + x.minutes, 0) !== total) return fail(400, 'recovery_plan_mismatch');
        recovery = { minutes: total, plan: plan.sort((a, b) => (a.date < b.date ? -1 : 1)) };
      }
      // "Ore libere": hours off paid from her overtime (no making up)
      let minutes = 0;
      if (type === 'suplimentare') {
        minutes = hm(body.minutes);
        if (!(minutes > 0)) return fail(400, 'invalid_minutes');
        const bal = TB.ledger(session.employeeId, await TB.loadAll(readJSON));
        const waiting = requests.filter((r) => r.employeeId === session.employeeId && r.type === 'suplimentare' && r.status === 'pending').reduce((a, r) => a + (Number(r.minutes) || 0), 0);
        if (minutes + waiting > bal.bank) return fail(400, 'not_enough_overtime');
      }
      const request = {
        id: crypto.randomUUID(),
        employeeId: session.employeeId,
        type, startDate, endDate,
        workDays: workDaysBetween(startDate, endDate),
        reason,
        ...(recovery ? { recovery } : {}),
        ...(type === 'suplimentare' ? { minutes } : {}),
        status: 'pending',
        requestedAt: nowISO(),
        decidedAt: '', decidedBy: '', rejectionNote: '', pdfBlobPath: '',
      };
      requests.push(request);
      await writeJSON(KEY, requests);
      // the manager of her clinic decides it (15.11): she hears it at once (her own requests stay with the owner)
      try {
        const emps = await readJSON('data/employees.json', []);
        const who = emps.find((e) => e.id === session.employeeId);
        const R = require('./_lib/roles');
        const mgrs = who && who.role !== 'admin' ? emps.filter((e) => e && e.active !== false && e.role === 'manager' && e.id !== who.id && R.managesOf(e).includes(who.location)).map((e) => e.id) : [];
        const d = (x) => x.slice(8, 10) + '.' + x.slice(5, 7);
        if (mgrs.length) await notifyMany({ readJSON, writeJSON }, mgrs, { kind: 'leave', tone: 'info', go: 'manager/echipa', tag: 'leave-' + request.id,
          title: 'CERERE DE CONCEDIU 🗓 - ' + (who.name || ''), text: (LEAVE_LABELS[type] || 'Concediu') + ' · ' + (startDate === endDate ? d(startDate) : d(startDate) + '-' + d(endDate)) });
      } catch (err) { console.error('leave notify:', err.message); }
      res.status(200).json({ ok: true, request });
      return;
    }

    if (action === 'list') {
      let list = sees ? requests.filter((r) => inTeam(r.employeeId) || r.employeeId === session.employeeId) : requests.filter((r) => r.employeeId === session.employeeId);
      // Pending first (oldest first, first to act on), then decided, most recent decision first.
      list = list.slice().sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (b.status === 'pending' && a.status !== 'pending') return 1;
        if (a.status === 'pending') return a.requestedAt < b.requestedAt ? -1 : 1;
        return (b.decidedAt || '') < (a.decidedAt || '') ? -1 : 1;
      });
      res.status(200).json({ ok: true, requests: list });
      return;
    }

    if (action === 'decide') {
      if (!sees) return fail(403, 'forbidden');
      const request = requests.find((r) => r.id === body.id);
      if (!request) return fail(404, 'request_not_found');
      if (isMgr && request.employeeId === session.employeeId) return fail(403, 'own_request');
      if (!inTeam(request.employeeId)) return fail(403, 'forbidden');
      if (request.status !== 'pending') return fail(400, 'already_decided');
      if (!['approved', 'rejected'].includes(body.decision)) return fail(400, 'invalid_decision');

      // someone who left: nothing of hers is approved any more (her requests waiting were answered at „A plecat”)
      const who = (await readJSON('data/employees.json', [])).find((e) => e && e.id === request.employeeId);
      if (body.decision === 'approved' && who && who.active === false) return fail(409, 'employee_left');
      if (body.decision === 'approved' && request.type === 'suplimentare') {
        const bal = TB.ledger(request.employeeId, await TB.loadAll(readJSON));
        if ((Number(request.minutes) || 0) > bal.bank) return fail(400, 'not_enough_overtime');
      }
      // a few hours off from overtime aren't a whole day away: a cosmetician's hours are asked (a blocked time for her)
      const partial = request.type === 'suplimentare' && (Number(request.minutes) || 0) < TB.weekdaysBetween(request.startDate, request.endDate).length * TB.BASE_MINUTES;
      const hours = partial ? cleanHours(body.hours) : null;
      if (body.decision === 'approved' && partial && !hours && who && who.role === 'cosmetician' && VALID_LOCATIONS.includes(who.location)) return fail(400, body.hours ? 'invalid_hours' : 'missing_hours');
      let affected = [];
      request.decidedAt = nowISO();
      request.decidedBy = session.employeeId;
      if (body.decision === 'rejected') {
        request.status = 'rejected';
        request.rejectionNote = String(body.rejectionNote || '').trim().slice(0, 300);
      } else {
        const employee = await employeeInfo(request.employeeId);
        const pdfBuffer = await buildLeaveRequestPdf(employee, request);
        const pdfBlobPath = 'data/leave-pdfs/' + request.id + '.pdf';
        await writeBinary(pdfBlobPath, pdfBuffer, 'application/pdf');
        request.status = 'approved';
        request.pdfBlobPath = pdfBlobPath;
        // Any leave type makes the person unavailable, not just 'odihna' - block the Calendar
        // for the whole range before responding, so reception sees it the moment it's approved.
        // (A few hours off from overtime: those hours, when they were given.)
        if (hours) request.hours = hours;
        if (!partial || hours) await blockCalendar(request, employee, hours);
        if (!partial || hours) affected = await leaveAffected(request, employee, hours, session).catch((e) => { console.error('leave affected:', e.message); return []; });
      }
      await writeJSON(KEY, requests);
      // tell her, one short line
      const when = request.startDate === request.endDate ? request.startDate.slice(8, 10) + '.' + request.startDate.slice(5, 7) : request.startDate.slice(8, 10) + '.' + request.startDate.slice(5, 7) + '-' + request.endDate.slice(8, 10) + '.' + request.endDate.slice(5, 7);
      const isOff = request.type === 'suplimentare';
      const what = (isOff ? 'ORE LIBERE' : String(LEAVE_LABELS[request.type] || 'Concediu').toLocaleUpperCase('ro-RO'));
      const ok = isOff ? fmtMin(request.minutes) + ' aprobate' : 'aprobat', no = isOff ? fmtMin(request.minutes) + ' respinse' : 'respins';
      await notify({ readJSON, writeJSON }, request.employeeId, request.status === 'approved'
        ? { kind: 'leave', tone: 'good', title: what + ' ✅ - ' + ok, text: when + (request.recovery ? ' · ai de recuperat ' + fmtMin(request.recovery.minutes) : ''), go: 'condica' }
        : { kind: 'leave', tone: 'bad', title: what + ' ❌ - ' + no, text: when + (request.rejectionNote ? ' · ' + request.rejectionNote : ''), go: 'condica' });
      res.status(200).json({ ok: true, request, affected });
      return;
    }

    // an approved leave taken back: its rows leave the Calendar (the days are free again), she and the desk hear it
    if (action === 'cancel') {
      if (!sees) return fail(403, 'forbidden');
      // by its id, or from one of its rows in the Calendar (appointmentId: the leave's own, else the one covering that day)
      let rid = body.id;
      if (!rid && body.appointmentId) {
        const row = (await readJSON('data/appointments.json', [])).find((a) => a && a.id === body.appointmentId && a.createdBy === 'leave-approval');
        const hit = row && (row.leaveId ? requests.find((r) => r.id === row.leaveId) : requests.find((r) => r.status === 'approved' && r.employeeId === row.cosmeticianId && r.startDate <= row.date && r.endDate >= row.date && r.type !== 'suplimentare'));
        rid = hit && hit.id;
      }
      const request = requests.find((r) => r.id === rid);
      if (!request) return fail(404, 'request_not_found');
      if (isMgr && request.employeeId === session.employeeId) return fail(403, 'own_request');
      if (!inTeam(request.employeeId)) return fail(403, 'forbidden');
      if (request.status !== 'approved') return fail(400, 'not_approved');
      const appts = await readJSON('data/appointments.json', []);
      const mine = (a) => a && a.createdBy === 'leave-approval' && a.cosmeticianId === request.employeeId && a.status === 'concediu' &&
        (a.leaveId ? a.leaveId === request.id : !a.block && a.date >= request.startDate && a.date <= request.endDate);
      const gone = appts.filter(mine);
      if (gone.length) await writeJSON('data/appointments.json', appts.filter((a) => !mine(a)));
      request.status = 'cancelled';
      request.cancelledAt = nowISO();
      request.cancelledBy = session.employeeId;
      await writeJSON(KEY, requests);
      const when = request.startDate === request.endDate ? request.startDate.slice(8, 10) + '.' + request.startDate.slice(5, 7) : request.startDate.slice(8, 10) + '.' + request.startDate.slice(5, 7) + '-' + request.endDate.slice(8, 10) + '.' + request.endDate.slice(5, 7);
      const what = request.type === 'suplimentare' ? 'ORE LIBERE' : String(LEAVE_LABELS[request.type] || 'Concediu').toLocaleUpperCase('ro-RO');
      await notify({ readJSON, writeJSON }, request.employeeId, { kind: 'leave', tone: 'info', title: what + ' ANULAT', text: when + ' · zilele sunt din nou de lucru', go: 'condica', tag: 'leave-cancel-' + request.id });
      try {
        const emps = await readJSON('data/employees.json', []);
        const emp = emps.find((e) => e.id === request.employeeId);
        const loc = emp && emp.location;
        if (gone.length && loc) await notifyMany({ readJSON, writeJSON }, TC.deskIds(emps, loc, session.employeeId), { kind: 'alert', tone: 'info', go: 'programari', tag: 'leave-cancel-desk-' + request.id,
          title: 'CONCEDIU ANULAT' + require('./_lib/notify').cityTag(loc), text: String((emp && emp.name) || '').split(' ')[0] + ' · ' + when + ' · zilele sunt din nou libere în Calendar' });
      } catch (e) { console.error('leave cancel notify:', e.message); }
      res.status(200).json({ ok: true, request, removed: gone.length });
      return;
    }

    if (action === 'admin_create') {
      // Admin manually logs a leave that already happened/was agreed off-portal (e.g. the
      // employee didn't submit it herself), created and approved in one step: no 'pending'
      // state, same PDF-generation + Calendar-block side effects as a normal approval.
      if (!sees) return fail(403, 'forbidden');
      const { employeeId, type, startDate, endDate } = body;
      if (isMgr && (employeeId === session.employeeId || employeeId === 'admin')) return fail(403, 'own_request');
      if (!inTeam(employeeId)) return fail(403, 'forbidden');
      if (!employeeId || typeof employeeId !== 'string') return fail(400, 'missing_employee');
      if (!VALID_TYPES.includes(type)) return fail(400, 'invalid_type');
      if (!isValidDate(startDate) || !isValidDate(endDate)) return fail(400, 'invalid_date');
      if (endDate < startDate) return fail(400, 'invalid_range');
      const reason = String(body.reason || '').trim().slice(0, MAX_REASON);
      if (REASON_REQUIRED.includes(type) && !reason) return fail(400, 'missing_reason');

      const employees = await readJSON('data/employees.json', []);
      if (employeeId !== 'admin' && !employees.some((e) => e.id === employeeId)) return fail(404, 'employee_not_found');
      if (requests.some((r) => r.employeeId === employeeId && r.status !== 'rejected' && r.status !== 'cancelled' && r.startDate <= endDate && r.endDate >= startDate)) return fail(409, 'overlapping_request');
      if ((employees.find((e) => e.id === employeeId) || {}).active === false) return fail(409, 'employee_left');
      if (type !== 'suplimentare' && !workDaysBetween(startDate, endDate)) return fail(400, 'no_work_days');

      const request = {
        id: crypto.randomUUID(),
        employeeId,
        type, startDate, endDate,
        workDays: workDaysBetween(startDate, endDate),
        reason,
        status: 'approved',
        requestedAt: nowISO(),
        decidedAt: nowISO(),
        decidedBy: session.employeeId,
        rejectionNote: '',
        pdfBlobPath: '',
      };

      const employee = await employeeInfo(employeeId);
      const pdfBuffer = await buildLeaveRequestPdf(employee, request);
      const pdfBlobPath = 'data/leave-pdfs/' + request.id + '.pdf';
      await writeBinary(pdfBlobPath, pdfBuffer, 'application/pdf');
      request.pdfBlobPath = pdfBlobPath;
      await blockCalendar(request, employee);

      requests.push(request);
      await writeJSON(KEY, requests);
      const affected = await leaveAffected(request, employee, null, session).catch((e) => { console.error('leave affected:', e.message); return []; });
      res.status(200).json({ ok: true, request, affected });
      return;
    }

    fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-leave error:', err.message);
    res.status(500).json({ error: 'leave_failed' });
  }
};
module.exports.employeeInfo = employeeInfo; // qa/api-checks.cjs
module.exports.rejectPendingOf = rejectPendingOf; // api/portal-employees.js („A plecat”)
