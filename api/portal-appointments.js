// POST /api/portal-appointments — shared Calendar for the whole team (portal.html's
// "Calendar" tab). One endpoint, action-routed via body.action: 'create' | 'update' |
// 'delete' | 'list' — same style as portal-offers.js / portal-employees.js.
//
// Replaces the old same-day tally (api/portal-appointment.js, now deleted). This is a
// real shared scheduler: every appointment has a required client (reusing the shared
// client directory via upsertClient, exactly like the "Încasează client" flow in
// api/portal-sale.js), an optional assigned cosmetician, a location and a status.
// Any authenticated role can create/update/delete any appointment — it's a common
// calendar, not scoped per creator, so there is deliberately no "only the creator can
// edit" check anywhere below.
//
// Appointment shape (data/appointments.json), a breaking change from the old
// {id, employeeId, date, status, clientName?, time?, createdAt} log — this is a
// 4-person internal tool in active development, so there is no migration: old rows
// are simply ignored under the new shape:
//   {
//     id, date (YYYY-MM-DD), time (HH:MM),
//     clientId, clientName,                 // denormalized, via upsertClient()
//     treatment,                            // free text
//     category,                             // VALID_CATEGORIES, shared with portal-sale.js
//     location,                             // one of VALID_LOCATIONS
//     cosmeticianId, cosmeticianName,       // nullable — may be unassigned
//     status,                               // VALID_STATUSES
//     createdBy, createdAt, updatedAt,
//   }

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const { upsertClient } = require('./_lib/clients');
const { VALID_CATEGORIES } = require('./portal-sale');
const workflows = require('./_lib/workflows');

// Matches the location strings used everywhere else in the portal (Setări → Angajați's
// neLocation select, api/portal-employees.js employee records) — kept as a literal list
// here rather than reading employees.json, since the two clinic locations are fixed and
// an appointment must be bookable even before any employee of a given location exists.
const VALID_LOCATIONS = ['Timișoara', 'Arad'];

const VALID_STATUSES = ['programata', 'confirmata', 'anulata', 'reprogramata', 'finalizata'];

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '');
}

function cleanTime(time) {
  const t = String(time || '').trim();
  return /^\d{1,2}:\d{2}$/.test(t) ? t : '';
}

// Resolves the required client for an appointment. A client picked from the shared
// autocomplete arrives as `clientId` and is reused as-is (no write). One typed fresh
// (no clientId — the autocomplete found nothing, or the user kept typing after a
// selection) upserts into the directory keyed by phone, exactly like the "Încasează
// client" flow in portal-sale.js. Returns null if neither resolves to anything usable.
async function resolveClient({ clientId, clientName, clientPhone }) {
  if (clientId) {
    const clients = await readJSON('data/clients.json', []);
    const found = clients.find((c) => c.id === clientId);
    if (found) return found;
  }
  const cleanName = String(clientName || '').trim().slice(0, 150);
  const cleanPhone = String(clientPhone || '').trim().slice(0, 30);
  if (!cleanName || !cleanPhone) return null;
  return upsertClient({ name: cleanName, phone: cleanPhone }, { readJSON, writeJSON });
}

async function validateAndBuildFields(body, employees) {
  const { date, time, treatment, category, location, cosmeticianId, status } = body || {};

  if (!date || !isValidDate(date)) return { error: 'invalid_date' };
  if (!treatment || !String(treatment).trim()) return { error: 'missing_treatment' };
  if (!VALID_CATEGORIES.includes(category)) return { error: 'invalid_category' };
  if (!VALID_LOCATIONS.includes(location)) return { error: 'invalid_location' };
  if (!VALID_STATUSES.includes(status)) return { error: 'invalid_status' };

  const clientRecord = await resolveClient(body || {});
  if (!clientRecord) return { error: 'invalid_client' };

  let cosmeticianName = '';
  const cleanCosmeticianId = cosmeticianId ? String(cosmeticianId) : '';
  if (cleanCosmeticianId) {
    const cosmetician = employees.find((e) => e.id === cleanCosmeticianId);
    if (!cosmetician) return { error: 'invalid_cosmetician' };
    cosmeticianName = cosmetician.name;
  }

  return {
    fields: {
      date,
      time: cleanTime(time),
      clientId: clientRecord.id,
      clientName: clientRecord.name,
      clientPhone: clientRecord.phone || '', // denormalized so the Calendar can call / WhatsApp
      treatment: String(treatment).trim().slice(0, 200),
      category,
      location,
      cosmeticianId: cleanCosmeticianId,
      cosmeticianName,
      status,
    },
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;

  const { action } = req.body || {};

  try {
    const appointments = await readJSON('data/appointments.json', []);

    if (action === 'list') {
      const { from, to } = req.body || {};
      if (!isValidDate(from) || !isValidDate(to)) {
        res.status(400).json({ error: 'invalid_range' });
        return;
      }
      const matching = appointments
        .filter((a) => a.date >= from && a.date <= to)
        .slice()
        .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.time || '').localeCompare(b.time || '')));
      // Appointments saved before clientPhone was stored get it from the client directory.
      if (matching.some((a) => !a.clientPhone && a.clientId)) {
        const clients = await readJSON('data/clients.json', []);
        const phoneById = new Map(clients.map((c) => [c.id, c.phone || '']));
        matching.forEach((a) => { if (!a.clientPhone && a.clientId) a.clientPhone = phoneById.get(a.clientId) || ''; });
      }
      res.status(200).json({ ok: true, appointments: matching });
      return;
    }

    // Everything below changes the calendar: front desk (receptie) + admin only — a
    // cosmetician sees the calendar read-only.
    if (!['admin', 'receptie'].includes(session.role)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    if (action === 'create') {
      const employees = await readJSON('data/employees.json', []);
      const result = await validateAndBuildFields(req.body, employees);
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      const now = new Date().toISOString();
      const entry = {
        id: crypto.randomUUID(),
        ...result.fields,
        createdBy: session.employeeId,
        createdAt: now,
        updatedAt: now,
      };
      appointments.push(entry);
      await writeJSON('data/appointments.json', appointments);

      // Automations (Admin → Automatizări): confirmation, reminders … Never throws.
      await workflows.emit('appointment_created', { appointment: entry });

      res.status(200).json({ ok: true, appointment: entry });
      return;
    }

    if (action === 'update') {
      const { id } = req.body || {};
      if (!id) {
        res.status(400).json({ error: 'missing_id' });
        return;
      }
      const appointment = appointments.find((a) => a.id === id);
      if (!appointment) {
        res.status(404).json({ error: 'appointment_not_found' });
        return;
      }
      const employees = await readJSON('data/employees.json', []);
      const result = await validateAndBuildFields(req.body, employees);
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      const before = { date: appointment.date, time: appointment.time, status: appointment.status };
      Object.assign(appointment, result.fields, { updatedAt: new Date().toISOString() });
      await writeJSON('data/appointments.json', appointments);
      // Automations: a moved appointment gets its reminders recalculated; a status change can start a flow.
      if (before.date !== appointment.date || before.time !== appointment.time) await workflows.emit('appointment_rescheduled', { appointment });
      if (before.status !== appointment.status) await workflows.emit('appointment_status', { appointment, status: appointment.status });
      res.status(200).json({ ok: true, appointment });
      return;
    }

    if (action === 'delete') {
      const { id } = req.body || {};
      if (!id) {
        res.status(400).json({ error: 'missing_id' });
        return;
      }
      const idx = appointments.findIndex((a) => a.id === id);
      if (idx === -1) {
        res.status(404).json({ error: 'appointment_not_found' });
        return;
      }
      const [removed] = appointments.splice(idx, 1);
      await writeJSON('data/appointments.json', appointments);
      await workflows.emit('appointment_deleted', { appointment: removed });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    console.error('portal-appointments error:', err.message);
    res.status(500).json({ error: 'appointments_failed' });
  }
};
