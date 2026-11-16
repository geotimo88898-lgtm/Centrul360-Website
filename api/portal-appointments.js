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
const { upsertClient, normalizePhone } = require('./_lib/clients');
const { normalizeCategories } = require('./_lib/cats');
const workflows = require('./_lib/workflows');
const { bonusPush } = require('./_lib/bonus');
const { cityOf, inCity } = require('./_lib/city');
const N = require('./_lib/notify');
const L = require('./_lib/left'); // someone who left: no new bookings on her, her later ones listed for someone else
const capi = require('./_lib/meta-capi'); // Conversions API: a Facebook lead's CRM steps back to Meta
const T = require('./_lib/team-schedule'); // the cosmeticians' breaks (shown in the list, moved with a booking)
const TC = require('./_lib/time-care'); // her phone hears the desk's changes; who is free to take a booking
const { canManage, isFront } = require('./_lib/roles');
// a visit of a passed day still waiting to be marked (not finished, cancelled or paid; nobody paid for her that day)
const OPEN_MARK = ['programata', 'confirmata', 'reprogramata'];
// „Finalizată” by hand only when there is no money to take (a package session, a booking of 0 lei, one already paid): one
// with a sum closes itself when it is paid (Încasări), the same rule as the Calendar's status buttons
const closesByHand = (a) => !!(a.package || a.paidSaleId || !(Number(a.amount) > 0));

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
    // picked from the list, then the number corrected by hand: the typed number wins (it goes on by phone, below)
    const typed = normalizePhone(clientPhone);
    if (found && (!typed || typed === normalizePhone(found.phone))) return found;
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

// The break (_lib/team-schedule.js, the owner 16.11). The list carries the breaks of its days (her shift's middle, or where
// it was moved, and whether it holds), so the Calendar draws them with the appointments and they follow every change.
async function breaksIn(appointments, from, to, city, me) {
  const span = Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 864e5);
  if (span < 0 || span > 62 || to < T.BREAK_SINCE) return [];
  const [doc, cosm] = await Promise.all([T.load(), T.people()]);
  const ids = new Set(cosm.map((p) => p.id)), names = new Map(cosm.map((p) => [p.id, p.name]));
  const inRange = appointments.filter((a) => a && a.date >= from && a.date <= to);
  const out = [];
  for (let d = from; d <= to; d = new Date(Date.parse(d + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10)) {
    // her clinic's, and a cosmetician's own in the other clinic on a day she works there (16.11)
    T.CITIES.filter((c) => inCity(city, c) || me).forEach((c) => T.dayBreaks(doc, d, c, { appts: inRange, ids }).filter((b) => inCity(city, c) || b.employeeId === me).forEach((b) => out.push(Object.assign({ date: d, name: names.get(b.employeeId) || '' }, b))));
  }
  return out;
}
// a booking that moves her break that day, or leaves it out (the booking form: „Mută pauza la 14:00”, „Fără pauză azi”),
// checked as if the booking were already there; saved with it. { change } | { error, code } | null (nothing asked)
// Reception moves it only when this booking sits on her break as it is now (the same test as break_info's clash, 16.11);
// any other break is moved by the owner and the manager (Calendar → the break's sheet).
async function breakPlan(body, entry, appointments, session) {
  const m = body && body.breakMove;
  if (!m || typeof m !== 'object' || !(m.from || m.off) || !entry.cosmeticianId || entry.block || ['anulata', 'concediu'].includes(entry.status)) return null;
  const doc = await T.load();
  const others = appointments.filter((a) => a && a.date === entry.date && a.id !== entry.id);
  if (!canManage(session)) {
    const now = T.breakOf(doc, entry.cosmeticianId, entry.date, { appts: others });
    const s = T.toMin(entry.time), e0 = T.toMin(entry.endTime), e = s == null ? null : e0 != null && e0 > s ? e0 : s + 60;
    if (!(now && now.on && s != null && T.toMin(now.from) < e && T.toMin(now.to) > s)) return { error: 'forbidden', code: 403 };
  }
  const day = others.concat([entry]);
  if (m.off) return T.plannedBreak(doc, entry.cosmeticianId, entry.date, { appts: day }) ? { change: { off: true } } : { error: 'no_break' };
  const why = T.breakCheck(doc, entry.cosmeticianId, entry.date, String(m.from), { appts: day });
  return why ? { error: why } : { change: { from: String(m.from) } };
}
async function breakSave(plan, entry, session) {
  if (!plan || !plan.change) return;
  const who = { id: session.employeeId || 'admin', name: session.employeeId === 'admin' ? 'George' : await whoName(session) };
  await T.update((d) => T.setBreak(d, entry.cosmeticianId, entry.date, plan.change, who));
  // her phone hears it, today only: the new hour, or „Azi nu ai pauză” (16.11)
  await T.tellBreak({ readJSON, writeJSON }, entry.cosmeticianId, entry.date, plan.change.from || null);
}
// today's bookings as they are before a change, so a break the change takes without moving it is told (T.tellLost)
const roDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const daySnap = (appointments) => { const t = roDay(); return appointments.filter((a) => a && a.date === t).map((a) => Object.assign({}, a)); };

// current: the appointment being changed (an update): her cosmetician may stay on it after she left; a new one or another
// one is put only on someone who works that day (_lib/left.js)
async function validateAndBuildFields(body, employees, current) {
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
    const kept = current && current.cosmeticianId === cleanCosmeticianId && current.date === date;
    if (!kept && !L.worksOn(cosmetician, date)) return { error: 'cosmetician_left' };
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
async function createBlockingAppointment({ date, location, cosmeticianId, cosmeticianName, label, time, endTime, block, createdBy, leaveId }) {
  const appointments = await readJSON('data/appointments.json', []);
  const now = new Date().toISOString();
  const entry = {
    id: crypto.randomUUID(), date, time: time || '', endTime: endTime || '',
    clientId: '', clientName: label, clientPhone: '',
    treatment: label, category: 'altele', location,
    cosmeticianId: cosmeticianId || '', cosmeticianName: cosmeticianName || '',
    status: 'concediu',
    ...(block ? { block: true } : {}),
    ...(leaveId ? { leaveId } : {}), // the leave request it comes from (api/portal-leave.js cancel)
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

  const session = await requireAuth(req, res);
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
      // a cosmetician: her clinic, and her own bookings in the other one (a day she works there, 16.11)
      const me = session.role === 'cosmetician' ? session.employeeId : '';
      const matching = appointments
        .filter((a) => a.date >= from && a.date <= to && (inCity(city, a.location) || (me && a.cosmeticianId === me)))
        .slice()
        .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.time || '').localeCompare(b.time || '')));
      // Appointments saved before clientPhone was stored get it from the client directory.
      if (matching.some((a) => !a.clientPhone && a.clientId)) {
        const clients = await readJSON('data/clients.json', []);
        const phoneById = new Map(clients.map((c) => [c.id, c.phone || '']));
        matching.forEach((a) => { if (!a.clientPhone && a.clientId) a.clientPhone = phoneById.get(a.clientId) || ''; });
      }
      res.status(200).json({ ok: true, appointments: matching, breaks: await breaksIn(appointments, from, to, city, me).catch(() => []) });
      return;
    }

    // the appointments of someone who left, still to come after her last day (_lib/left.js): the desk gives them to someone
    // else (Calendar → „Rămase fără cosmeticiană”); nothing is deleted
    if (action === 'orphans') {
      if (!['admin', 'receptie', 'manager'].includes(session.role)) { res.status(403).json({ error: 'forbidden' }); return; }
      const [emps, doc] = await Promise.all([readJSON('data/employees.json', []), T.load()]);
      const byId = new Map(emps.map((e) => [e.id, e]));
      // left („a plecat”), on leave („concediu”), a whole-day block, a day taken off in Program echipă (_lib/left.js)
      const list = L.orphans(appointments, emps, null, doc).filter((a) => inCity(city, a.location))
        .map((a) => Object.assign(a, { leftAt: (byId.get(a.cosmeticianId) || {}).leftAt || '', free: TC.freeFor(a, appointments, emps, doc).slice(0, 3) }));
      res.status(200).json({ ok: true, appointments: list });
      return;
    }

    // the visits of yesterday nobody marked (Panou: „N ședințe de ieri nemarcate”): hers for a cosmetician, her clinics'
    // for the desk. A package session she came to used to count as a no-show until someone tapped „Finalizată” (16.11).
    if (action === 'unmarked') {
      const day = String((req.body && req.body.date) || '') || TC.addDay(roDay(), -1);
      if (!isValidDate(day) || day >= roDay()) { res.status(400).json({ error: 'invalid_date' }); return; }
      const mine = session.role === 'cosmetician';
      if (!mine && !isFront(session)) { res.status(403).json({ error: 'forbidden' }); return; }
      const paid = require('./_lib/clinic').paidDays(await readJSON('data/sales.json', []));
      const C = require('./_lib/clinic');
      const list = appointments.filter((a) => a && a.date === day && OPEN_MARK.includes(a.status) && !a.block && !C.cameBy(a, paid) && !/^\s*test\b/i.test(a.clientName || '') &&
        (mine ? a.cosmeticianId === session.employeeId : inCity(city, a.location)))
        .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
        .map((a) => ({ id: a.id, date: a.date, time: a.time || '', endTime: a.endTime || '', clientName: a.clientName || '', treatment: a.treatment || '', location: a.location,
          cosmeticianId: a.cosmeticianId || '', cosmeticianName: a.cosmeticianName || '', status: a.status, package: !!a.package, amount: Number(a.amount) || 0, byHand: closesByHand(a) }));
      res.status(200).json({ ok: true, date: day, appointments: list });
      return;
    }

    // „Finalizată” / „Nu a venit” on a visit of a passed day or of today (16.11): a cosmetician on HER bookings only, the desk
    // on its clinics'. Only the status changes (and when, and by whom); nothing else of the booking.
    //   { action: 'mark', id, mark: 'came' | 'noshow' }
    if (action === 'mark') {
      const b = req.body || {};
      const a = appointments.find((x) => x.id === b.id);
      if (!a) { res.status(404).json({ error: 'appointment_not_found' }); return; }
      const mine = session.role === 'cosmetician';
      if (mine ? a.cosmeticianId !== session.employeeId : !isFront(session) || !inCity(city, a.location)) { res.status(403).json({ error: 'forbidden' }); return; }
      if (a.block || ['concediu'].includes(a.status)) { res.status(400).json({ error: 'not_a_visit' }); return; }
      if (!(a.date <= roDay())) { res.status(400).json({ error: 'not_yet' }); return; }
      if (!['came', 'noshow'].includes(b.mark)) { res.status(400).json({ error: 'invalid_mark' }); return; }
      if (a.paidSaleId || a.status === 'finalizata') { res.status(409).json({ error: 'already_done' }); return; }
      if (b.mark === 'came' && !closesByHand(a)) { res.status(409).json({ error: 'needs_payment' }); return; }
      const before = a.status, now = new Date().toISOString(), by = await whoName(session);
      if (b.mark === 'came') { a.status = 'finalizata'; delete a.noShow; delete a.cancelledAt; }
      else { a.status = 'anulata'; a.noShow = true; a.cancelledAt = now; }
      Object.assign(a, { updatedAt: now, statusBy: by, markedAt: now });
      await writeJSON('data/appointments.json', appointments);
      if (a.status === 'anulata') await require('./portal-leads').unbookLead(a, 'Nu a venit', by);
      if (before !== a.status) await workflows.emit('appointment_status', { appointment: a, status: a.status });
      res.status(200).json({ ok: true, appointment: a });
      if (a.status === 'finalizata') await capi.soon(() => capi.crmSync({ appointment: a }));
      return;
    }

    // Everything below changes the calendar: front desk (receptie) + admin only, a
    // cosmetician sees the calendar read-only.
    if (!['admin', 'receptie', 'manager'].includes(session.role)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    // the manager changes only the calendar of the clinics she runs
    if (session.role === 'manager') {
      const b = req.body || {};
      const tgt = b.id ? appointments.find((a) => a.id === b.id) : null;
      if ((b.location && !inCity(city, b.location)) || (tgt && !inCity(city, tgt.location))) { res.status(403).json({ error: 'forbidden' }); return; }
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
        ...(result.fields.status === 'anulata' ? { cancelledAt: now } : {}), // when it was cancelled (api/_lib/clinic.js lateCancel)
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
      // her break moved (or left out) with this booking: checked first, nothing is saved when it can't go there
      const brk = await breakPlan(req.body, entry, appointments, session);
      if (brk && brk.error) { res.status(brk.code || 409).json({ error: brk.error }); return; }
      // the person's lead moves to "Programare stabilită" (a booking from the Calendar, Mesaje or the lead's card alike)
      if (entry.status !== 'concediu') {
        const lead = await require('./portal-leads').bookLead(entry, { leadId: req.body && req.body.leadId, author: await whoName(session) });
        if (lead) entry.leadId = lead.id;
      }
      const snap = daySnap(appointments);
      appointments.push(entry);
      await writeJSON('data/appointments.json', appointments);
      await breakSave(brk, entry, session);
      if (entry.date === roDay()) await T.tellLost({ readJSON, writeJSON }, snap, appointments);
      // a booking for today or tomorrow: her phone hears it
      if (entry.cosmeticianId !== session.employeeId) await TC.tellHer({ readJSON, writeJSON }, entry.cosmeticianId, 'new', entry);

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
        if (!L.worksOn(emp, b.date)) { res.status(400).json({ error: 'cosmetician_left' }); return; }
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

    // „Mută la …” (the sheet of a leave, Calendar → „Rămase fără cosmeticiană”): the booking to a colleague free then, the
    // rest of it as it is. { action: 'reassign', id, cosmeticianId }
    if (action === 'reassign') {
      const b = req.body || {};
      const a = appointments.find((x) => x.id === b.id);
      if (!a) { res.status(404).json({ error: 'appointment_not_found' }); return; }
      if (!L.open(a)) { res.status(400).json({ error: 'not_open' }); return; }
      const [emps, doc] = await Promise.all([readJSON('data/employees.json', []), T.load()]);
      const to = emps.find((e) => e && e.id === String(b.cosmeticianId || ''));
      if (!to || to.role !== 'cosmetician') { res.status(400).json({ error: 'invalid_cosmetician' }); return; }
      if (!L.worksOn(to, a.date)) { res.status(400).json({ error: 'cosmetician_left' }); return; }
      if (!b.force && !TC.freeFor(a, appointments, emps, doc).some((x) => x.id === to.id)) { res.status(409).json({ error: 'not_free' }); return; }
      const from = a.cosmeticianId || '';
      Object.assign(a, { cosmeticianId: to.id, cosmeticianName: to.name || '', updatedAt: new Date().toISOString() });
      delete a.offShift;
      await writeJSON('data/appointments.json', appointments);
      const st = { readJSON, writeJSON };
      if (from && from !== session.employeeId) await TC.tellHer(st, from, 'taken', a);
      if (to.id !== session.employeeId) await TC.tellHer(st, to.id, 'given', a);
      res.status(200).json({ ok: true, appointment: a });
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
      const result = await validateAndBuildFields(req.body, employees, appointment);
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      const before = { id: appointment.id, date: appointment.date, time: appointment.time, status: appointment.status, location: appointment.location, clientId: appointment.clientId, clientPhone: appointment.clientPhone,
        cosmeticianId: appointment.cosmeticianId || '', paidSaleId: appointment.paidSaleId || '', clientName: appointment.clientName, treatment: appointment.treatment };
      const snap = daySnap(appointments);
      if (!('endTime' in req.body)) result.fields.endTime = appointment.endTime || ''; // older clients don't send it
      if (!('note' in req.body)) result.fields.note = appointment.note || '';
      if (!('package' in req.body)) result.fields.package = !!appointment.package; // a drag in the Calendar doesn't send it
      Object.assign(appointment, result.fields, { updatedAt: new Date().toISOString() });
      // when it was cancelled, so a cancellation ahead of its hour is never taken for a no-show (api/_lib/clinic.js lateCancel)
      if (appointment.status === 'anulata' && before.status !== 'anulata') appointment.cancelledAt = appointment.updatedAt;
      else if (appointment.status !== 'anulata') delete appointment.cancelledAt;
      const moved = before.date !== appointment.date || before.time !== appointment.time;
      // moved off a day that had passed without her (not finished, not paid, nobody paid for her that day): that day stays
      // a no-show (missedOn, _lib/clinic.js visitStats, _lib/followups.js missedItems); moving it used to erase it (16.11)
      if (before.date !== appointment.date && before.date < roDay() && !['anulata', 'finalizata', 'concediu'].includes(before.status) && !before.paidSaleId) {
        const C = require('./_lib/clinic');
        if (!C.cameBy(Object.assign({}, appointment, { date: before.date, status: before.status, paidSaleId: '' }), C.paidDays(await readJSON('data/sales.json', []))))
          appointment.missedOn = [...new Set((appointment.missedOn || []).concat([before.date]))].sort().slice(-10);
      }
      // given to someone else or moved: no longer left without a cosmetician by a day off (offShift, api/portal-schedule.js)
      if (appointment.offShift && (before.cosmeticianId !== appointment.cosmeticianId || before.date !== appointment.date)) delete appointment.offShift;
      // another client on it (the wrong one picked, a new phone): her own lead, not the one of the client before.
      // The same number under a new id (a sheet replaced by an import) is the same client: nothing starts again
      const otherClient = normalizePhone(before.clientPhone) !== normalizePhone(appointment.clientPhone);
      if (otherClient) delete appointment.leadId;
      const brk = await breakPlan(req.body, appointment, appointments, session);
      if (brk && brk.error) { res.status(brk.code || 409).json({ error: brk.error }); return; }
      // a moved appointment: the date on its lead follows (a lead not linked yet gets linked and moves to booked)
      if ((moved || otherClient) && appointment.status !== 'concediu' && !['anulata', 'finalizata'].includes(appointment.status)) {
        const lead = await require('./portal-leads').bookLead(appointment, { leadId: appointment.leadId, author: await whoName(session) });
        if (lead) appointment.leadId = lead.id;
      }
      await writeJSON('data/appointments.json', appointments);
      await breakSave(brk, appointment, session);
      if (appointment.date === roDay() || before.date === roDay()) await T.tellLost({ readJSON, writeJSON }, snap, appointments);
      // cancelled: her lead no longer shows it
      if (before.status !== appointment.status && appointment.status === 'anulata') await require('./portal-leads').unbookLead(appointment, 'Programare anulată', await whoName(session));
      // Automations: the status first (marking it "Reprogramată" stops the old reminders), then the move, which starts the
      // booking messages again for the new date (confirmation, location, reminders).
      if (before.status !== appointment.status) await workflows.emit('appointment_status', { appointment, status: appointment.status });
      // moved, to the other clinic, to another client, or cancelled by mistake and put back: the booking messages
      // start again (for a date still ahead)
      const revived = before.status === 'anulata' && !['anulata', 'finalizata', 'concediu'].includes(appointment.status);
      if (moved || otherClient || revived || before.location !== appointment.location) await workflows.emit('appointment_rescheduled', { appointment, revived });
      // a site booking moved by the desk: its wait for her „Confirm” ends (it would cancel the booking at the old hour's time)
      if (moved && (appointment.online || appointment.createdBy === 'site')) await require('./_lib/site-confirm').moved(appointment.id).catch((e) => console.error('site-confirm moved:', e.message));
      // her phone hears the desk's change, today and tomorrow only (16.11)
      const st = { readJSON, writeJSON };
      if (before.cosmeticianId !== appointment.cosmeticianId) {
        if (before.cosmeticianId !== session.employeeId) await TC.tellHer(st, before.cosmeticianId, 'taken', appointment, before);
        if (appointment.cosmeticianId !== session.employeeId) await TC.tellHer(st, appointment.cosmeticianId, 'given', appointment, before);
      } else if (appointment.cosmeticianId !== session.employeeId) {
        if (appointment.status === 'anulata' && before.status !== 'anulata') await TC.tellHer(st, appointment.cosmeticianId, 'cancelled', appointment, before);
        else if (moved && appointment.status !== 'anulata') await TC.tellHer(st, appointment.cosmeticianId, 'moved', appointment, before);
      }
      res.status(200).json({ ok: true, appointment });
      // she came (done): "Venit" for her Facebook lead (Conversions API), after the answer
      if (before.status !== appointment.status && appointment.status === 'finalizata') await capi.soon(() => capi.crmSync({ appointment }));
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
      // the rows of an approved leave go only with the leave (api/portal-leave.js cancel), by the owner or the manager
      if (appointments[idx].createdBy === 'leave-approval' && !canManage(session)) { res.status(403).json({ error: 'leave_row' }); return; }
      const [removed] = appointments.splice(idx, 1);
      await writeJSON('data/appointments.json', appointments);
      if (!removed.block && removed.status !== 'concediu' && removed.cosmeticianId !== session.employeeId) await TC.tellHer({ readJSON, writeJSON }, removed.cosmeticianId, 'deleted', removed);
      if (!removed.block && removed.status !== 'concediu') await require('./portal-leads').unbookLead(removed, 'Programare ștearsă', await whoName(session));
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
