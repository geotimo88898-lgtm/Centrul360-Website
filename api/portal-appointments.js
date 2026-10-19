// POST /api/portal-appointments, shared Calendar for the whole team (portal.html's
// "Calendar" tab). One endpoint, action-routed via body.action: 'create' | 'update' |
// 'delete' | 'list' - same style as portal-offers.js / portal-employees.js.
//
// Replaces the old same-day tally (api/portal-appointment.js, now deleted). This is a
// real shared scheduler: every appointment has a required client (reusing the shared
// client directory via upsertClient, exactly like the "Încasează client" flow in
// api/portal-sale.js), an optional assigned cosmetician, a location and a status.
// Any authenticated role can create/update/delete any appointment, it's a common
// calendar, not scoped per creator, so there is deliberately no "only the creator can
// edit" check anywhere below.
//
// Appointment shape (data/appointments.json), a breaking change from the old
// {id, employeeId, date, status, clientName?, time?, createdAt} log, this is a
// 4-person internal tool in active development, so there is no migration: old rows
// are simply ignored under the new shape:
//   {
//     id, date (YYYY-MM-DD), time (HH:MM), endTime (HH:MM, '' = not set → shown as 1h),
//     clientId, clientName,                 // denormalized, via upsertClient()
//     treatment,                            // free text
//     category,                             // VALID_CATEGORIES, shared with portal-sale.js
//     location,                             // one of VALID_LOCATIONS
//     cosmeticianId, cosmeticianName,       // nullable, may be unassigned
//     status,                               // VALID_STATUSES
//     createdBy, createdAt, updatedAt,
//   }

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const { upsertClient } = require('./_lib/clients');
const { normalizeCategories } = require('./_lib/cats');
const workflows = require('./_lib/workflows');
const { bonusPush } = require('./_lib/bonus');
const { cityOf, inCity } = require('./_lib/city');
const N = require('./_lib/notify');

// Matches the location strings used everywhere else in the portal (Setări → Angajați's
// neLocation select, api/portal-employees.js employee records), kept as a literal list
// here rather than reading employees.json, since the two clinic locations are fixed and
// an appointment must be bookable even before any employee of a given location exists.
const VALID_LOCATIONS = ['Timișoara', 'Arad'];

// 'concediu' is a non-client calendar block (see createBlockingAppointment below), created
// automatically when an admin approves a leave request (api/portal-leave.js), so reception
// can't accidentally double-book someone who's away. It's a real appointment row with no real
// client, same as the others, just with its own status so the Calendar can style it distinctly.
const VALID_STATUSES = ['programata', 'confirmata', 'anulata', 'reprogramata', 'finalizata', 'concediu'];

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '');
}

function cleanTime(time) {
  const t = String(time || '').trim();
  return /^\d{1,2}:\d{2}$/.test(t) ? t : '';
}

// Resolves the required client for an appointment. A client picked from the shared
// autocomplete arrives as `clientId` and is reused as-is (no write). One typed fresh
// (no clientId, the autocomplete found nothing, or the user kept typing after a
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

// who did it, for the lead's history
async function whoName(session) {
  if (!session || session.employeeId === 'admin') return 'Admin';
  const e = (await readJSON('data/employees.json', [])).find((x) => x.id === session.employeeId);
  return e ? e.name : 'Calendar';
}

async function validateAndBuildFields(body, employees) {
  const { date, time, endTime, treatment, location, cosmeticianId, status } = body || {};
  // One or more of: epilare-laser, faciale, corporale (older single `category` keys still accepted).
  const categories = normalizeCategories(body && body.categories && body.categories.length ? body.categories : body && body.category);
  // What the client is booked to pay (an upsell is ticked at payment time, Încasări).
  const amount = Math.max(0, Math.round((Number(body && body.amount) || 0) * 100) / 100);

  if (!date || !isValidDate(date)) return { error: 'invalid_date' };
  if (!treatment || !String(treatment).trim()) return { error: 'missing_treatment' };
  if (!categories.length) return { error: 'invalid_category' };
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

  // The end must come after the start; anything else is dropped (the calendar then draws 1h).
  const start = cleanTime(time), end = cleanTime(endTime);
  const minutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const cleanEnd = start && end && minutes(end) > minutes(start) ? end : '';

  return {
    fields: {
      date,
      time: start,
      endTime: cleanEnd,
      clientId: clientRecord.id,
      clientName: clientRecord.name,
      clientPhone: clientRecord.phone || '', // denormalized so the Calendar can call / WhatsApp
      treatment: String(treatment).trim().slice(0, 200),
      categories,
      category: categories[0], // kept for older readers (automations, exports)
      amount,
      location,
      cosmeticianId: cleanCosmeticianId,
      cosmeticianName,
      status,
      // a session of a package already bought: the reminders go, the booking confirmation and the review request don't
      package: !!(body && body.package),
      // what the desk wants remembered about this booking ("vine cu prietena", "zona: abdomen")
      note: String((body && body.note) || '').trim().slice(0, 500),
    },
  };
}

// Reused by api/portal-leave.js (action: 'decide', on approval), same "exported create helper"
// pattern as portal-leads.js's createLead(), reused by the Facebook webhook. No real client: an
// all-day marker (no `time`, so it renders as an untimed chip, naturally spanning the whole
// day) tied to the employee via cosmeticianId, so reception sees the clash immediately.
// Also the Calendar's "Blochează timp" (like HighLevel's blocked time): a block with hours (time / endTime), a reason as
// its name, for one cosmetician or (none) the whole clinic of that city; block: true tells it from a leave.
async function createBlockingAppointment({ date, location, cosmeticianId, cosmeticianName, label, time, endTime, block, createdBy }) {
  const appointments = await readJSON('data/appointments.json', []);
  const now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(), date, time: time || '', endTime: endTime || '',
    clientId: '', clientName: label, clientPhone: '',
    treatment: label, category: 'altele', location,
    cosmeticianId: cosmeticianId || '', cosmeticianName: cosmeticianName || '',
    status: 'concediu',
    ...(block ? { block: true } : {}),
    createdBy: createdBy || 'leave-approval', createdAt: now, updatedAt: now,
  };
  appointments.push(entry);
  await writeJSON('data/appointments.json', appointments);
  return entry;
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
    // A cosmetician sees only her clinic's city; reception and the owner see both.
    const city = await cityOf(session, readJSON);

    // Payment drawer (Încasări): appointments still to be paid, newest first, today and the last
    // 30 days, not cancelled, not leave blocks, not already paid.
    if (action === 'unpaid') {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
      const from = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      const list = appointments
        .filter((a) => a.date >= from && a.date <= today && !a.paidSaleId && !['anulata', 'concediu', 'finalizata'].includes(a.status) && inCity(city, a.location))
        .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : (a.time || '').localeCompare(b.time || '')));
      // what these clients still owe for a package paid in parts (shown at the payment, Încasări)
      const dues = await require('./_lib/dues').openFor({ readJSON, writeJSON }, list.map((a) => a.clientId));
      res.status(200).json({ ok: true, appointments: list, dues });
      return;
    }

    if (action === 'list') {
      const { from, to } = req.body || {};
      if (!isValidDate(from) || !isValidDate(to)) {
        res.status(400).json({ error: 'invalid_range' });
        return;
      }
      const matching = appointments
        .filter((a) => a.date >= from && a.date <= to && inCity(city, a.location))
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

    // Everything below changes the calendar: front desk (receptie) + admin only, a
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
      // the same client that day: the same booking sent twice (a double tap, a slow connection) gives back the one made;
      // another booking that day is confirmed by the desk first (two treatments are fine, a double booking isn't)
      const sameDay = appointments.filter((x) => x.clientId === entry.clientId && x.date === entry.date && !['anulata', 'concediu'].includes(x.status));
      const twin = sameDay.find((x) => x.time === entry.time && x.treatment === entry.treatment && Date.now() - Date.parse(x.createdAt || 0) < 3 * 60e3);
      if (twin) { res.status(200).json({ ok: true, appointment: twin, duplicate: true }); return; }
      if (sameDay.length && !(req.body && req.body.force)) {
        res.status(409).json({ error: 'same_day', existing: sameDay.map((x) => ({ id: x.id, time: x.time || '', endTime: x.endTime || '', treatment: x.ghlTitle || x.treatment || '' })) });
        return;
      }
      // the person's lead moves to "Programare stabilită" (a booking from the Calendar, Mesaje or the lead's card alike)
      if (entry.status !== 'concediu') {
        const lead = await require('./portal-leads').bookLead(entry, { leadId: req.body && req.body.leadId, author: await whoName(session) });
        if (lead) entry.leadId = lead.id;
      }
      appointments.push(entry);
      await writeJSON('data/appointments.json', appointments);

      // Automations (Admin → Automatizări): confirmation, reminders … Never throws.
      await workflows.emit('appointment_created', { appointment: entry });
      // reception's booking bonus may have moved: the new line goes to her phone
      await bonusPush({ readJSON, writeJSON }, session.employeeId);
      // the owner hears about every booking someone else makes (in the bell and on her phone)
      if (!N.isOwner(session)) {
        try {
          await N.notifyMany({ readJSON, writeJSON }, await N.adminIds({ readJSON }), {
            kind: 'booking', tone: 'good', go: 'programari', tag: 'appt-' + entry.id,
            title: 'PROGRAMARE 📅' + (entry.treatment ? ' - ' + require('./_lib/offers').shortName(await require('./_lib/offers').loadOffers(readJSON), entry.treatment) : ''), // "Lipo 640"
            text: entry.clientName,
          });
        } catch (e) { /* a notification never blocks a booking */ }
      }

      res.status(200).json({ ok: true, appointment: entry });
      return;
    }

    // Blochează timp: nobody gets booked over it (the Calendar warns), it counts nowhere (like a leave)
    if (action === 'block') {
      const b = req.body || {};
      if (!isValidDate(b.date)) { res.status(400).json({ error: 'invalid_date' }); return; }
      if (!VALID_LOCATIONS.includes(b.location)) { res.status(400).json({ error: 'invalid_location' }); return; }
      const start = cleanTime(b.time), end = cleanTime(b.endTime);
      const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      if (start && (!end || mins(end) <= mins(start))) { res.status(400).json({ error: 'invalid_time' }); return; }
      let cosmeticianName = '';
      const cid = b.cosmeticianId ? String(b.cosmeticianId) : '';
      if (cid) {
        const emp = (await readJSON('data/employees.json', [])).find((e) => e.id === cid);
        if (!emp) { res.status(400).json({ error: 'invalid_cosmetician' }); return; }
        cosmeticianName = emp.name;
      }
      const label = String(b.label || '').trim().slice(0, 80) || 'Timp blocat';
      // changing one already there (its hours, reason, city, for whom)
      if (b.id) {
        const row = appointments.find((x) => x.id === b.id && x.block);
        if (!row) { res.status(404).json({ error: 'appointment_not_found' }); return; }
        Object.assign(row, { date: b.date, time: start, endTime: start ? end : '', location: b.location, cosmeticianId: cid, cosmeticianName, clientName: label, treatment: label, updatedAt: new Date().toISOString() });
        await writeJSON('data/appointments.json', appointments);
        res.status(200).json({ ok: true, appointment: row });
        return;
      }
      const entry = await createBlockingAppointment({
        date: b.date, location: b.location, cosmeticianId: cid, cosmeticianName, label,
        time: start, endTime: start ? end : '', block: true, createdBy: session.employeeId,
      });
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
      const before = { date: appointment.date, time: appointment.time, status: appointment.status, location: appointment.location, clientId: appointment.clientId };
      if (!('endTime' in req.body)) result.fields.endTime = appointment.endTime || ''; // older clients don't send it
      if (!('note' in req.body)) result.fields.note = appointment.note || '';
      if (!('package' in req.body)) result.fields.package = !!appointment.package; // a drag in the Calendar doesn't send it
      Object.assign(appointment, result.fields, { updatedAt: new Date().toISOString() });
      const moved = before.date !== appointment.date || before.time !== appointment.time;
      // another client on it (the wrong one picked, a new phone): her own lead, not the one of the client before
      const otherClient = before.clientId !== appointment.clientId;
      if (otherClient) delete appointment.leadId;
      // a moved appointment: the date on its lead follows (a lead not linked yet gets linked and moves to booked)
      if ((moved || otherClient) && appointment.status !== 'concediu' && !['anulata', 'finalizata'].includes(appointment.status)) {
        const lead = await require('./portal-leads').bookLead(appointment, { leadId: appointment.leadId, author: await whoName(session) });
        if (lead) appointment.leadId = lead.id;
      }
      await writeJSON('data/appointments.json', appointments);
      // Automations: the status first (marking it "Reprogramată" stops the old reminders), then the move, which starts the
      // booking messages again for the new date (confirmation, location, reminders).
      if (before.status !== appointment.status) await workflows.emit('appointment_status', { appointment, status: appointment.status });
      // moved, to the other clinic or to another client: the booking messages start again (for a date still ahead)
      if (moved || otherClient || before.location !== appointment.location) await workflows.emit('appointment_rescheduled', { appointment });
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

module.exports.createBlockingAppointment = createBlockingAppointment;
