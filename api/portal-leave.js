// POST /api/portal-leave — "Cereri de concediu" (leave requests), folded into the admin's
// existing Aprobări mental model (api/portal-approve.js does the same for commission).
// One endpoint, action-routed via body.action:
//
//   create | list | decide (admin)
//
// Request shape (data/leave-requests.json):
//   { id, employeeId, type ('odihna'|'fara_plata'|'medical'|'alta'), startDate, endDate,
//     workDays, reason, status ('pending'|'approved'|'rejected'), requestedAt, decidedAt,
//     decidedBy, rejectionNote, pdfBlobPath }
//
// On approval, a one-page PDF is generated (api/_lib/pdf-leave.js) and stored privately in
// Blob at data/leave-pdfs/{id}.pdf; api/portal-leave-pdf.js streams it back to the admin or the
// requesting employee. This is a mechanism, not a legal guarantee — see the UI copy and the
// footer notice printed on the PDF itself.

const crypto = require('crypto');
const { readJSON, writeJSON, writeBinary } = require('./_lib/store');
const { requireAuth, requireAdmin } = require('./_lib/auth');
const { buildLeaveRequestPdf } = require('./_lib/pdf-leave');
const { createBlockingAppointment } = require('./portal-appointments');

const KEY = 'data/leave-requests.json';
const VALID_TYPES = ['odihna', 'fara_plata', 'medical', 'alta'];
const REASON_REQUIRED = ['medical', 'alta'];
const MAX_REASON = 500;
// Full labels (with diacritics) for the calendar block — the PDF strips diacritics itself
// (see _lib/pdf-leave.js), but the Calendar UI renders UTF-8 fine.
const LEAVE_LABELS = { odihna: 'Concediu de odihnă', fara_plata: 'Concediu fără plată', medical: 'Concediu medical', alta: 'Alt tip de concediu' };
// Same literal location list as api/portal-appointments.js / api/portal-leads.js.
const VALID_LOCATIONS = ['Timișoara', 'Arad'];

const nowISO = () => new Date().toISOString();
const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && Number.isFinite(new Date(d + 'T00:00:00').getTime());
const pad2 = (n) => String(n).padStart(2, '0');
const isoDate = (d) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());

// Marks the employee unavailable on the Calendar for every day of the approved leave, so
// reception doesn't accidentally book an appointment during it. Best-effort: an employee with
// no fixed location (e.g. the admin, who isn't scheduled on the Calendar) simply gets no block.
async function blockCalendar(request, employee) {
  if (!VALID_LOCATIONS.includes(employee.location)) return;
  const label = 'Concediu — ' + (LEAVE_LABELS[request.type] || request.type);
  const start = new Date(request.startDate + 'T00:00:00');
  const end = new Date(request.endDate + 'T00:00:00');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    await createBlockingAppointment({ date: isoDate(d), location: employee.location, cosmeticianId: request.employeeId, cosmeticianName: employee.name, label });
  }
}

// Simple calendar count of Mon-Fri between start/end inclusive — doesn't model Romanian public
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
  if (employeeId === 'admin') return { name: 'Admin', role: 'Admin', location: '' };
  const employees = await readJSON('data/employees.json', []);
  const e = employees.find((x) => x.id === employeeId);
  if (!e) return { name: employeeId, role: '', location: '' };
  return { name: e.name, role: e.role === 'receptie' ? 'Recepție' : e.role === 'cosmetician' ? 'Cosmeticiană' : e.role === 'admin' ? 'Admin' : e.role, location: e.location, cnp: e.cnp || '' };
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
    const requests = await readJSON(KEY, []);

    if (action === 'create') {
      const { type, startDate, endDate } = body;
      if (!VALID_TYPES.includes(type)) return fail(400, 'invalid_type');
      if (!isValidDate(startDate) || !isValidDate(endDate)) return fail(400, 'invalid_date');
      if (endDate < startDate) return fail(400, 'invalid_range');
      const reason = String(body.reason || '').trim().slice(0, MAX_REASON);
      if (REASON_REQUIRED.includes(type) && !reason) return fail(400, 'missing_reason');

      const request = {
        id: crypto.randomUUID(),
        employeeId: session.employeeId,
        type, startDate, endDate,
        workDays: workDaysBetween(startDate, endDate),
        reason,
        status: 'pending',
        requestedAt: nowISO(),
        decidedAt: '', decidedBy: '', rejectionNote: '', pdfBlobPath: '',
      };
      requests.push(request);
      await writeJSON(KEY, requests);
      res.status(200).json({ ok: true, request });
      return;
    }

    if (action === 'list') {
      let list = isAdmin ? requests : requests.filter((r) => r.employeeId === session.employeeId);
      // Pending first (oldest first — first to act on), then decided, most recent decision first.
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
      if (!requireAdmin(req, res)) return;
      const request = requests.find((r) => r.id === body.id);
      if (!request) return fail(404, 'request_not_found');
      if (request.status !== 'pending') return fail(400, 'already_decided');
      if (!['approved', 'rejected'].includes(body.decision)) return fail(400, 'invalid_decision');

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
        // Any leave type makes the person unavailable, not just 'odihna' — block the Calendar
        // for the whole range before responding, so reception sees it the moment it's approved.
        await blockCalendar(request, employee);
      }
      await writeJSON(KEY, requests);
      res.status(200).json({ ok: true, request });
      return;
    }

    fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-leave error:', err.message);
    res.status(500).json({ error: 'leave_failed' });
  }
};
