// Shared helpers for data/automation-tasks.json — the internal "sarcină" queue that
// stands in for real WhatsApp automation until that gets wired in (see _lib/whatsapp.js).
// Used by api/portal-appointments.js (new-appointment hook), api/portal-data.js and
// api/portal-automation-tasks.js (today's-reminder materialization on read).
//
// Task shape: { id, type, text, relatedLeadId, relatedAppointmentId, location,
//               assigneeRole ('receptie'|'any'), status ('pending'|'done'),
//               createdAt, doneAt, doneBy }

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./store');
const { sendWhatsApp } = require('./whatsapp');

// Creates one automation task, persists it, and fires the (currently no-op) WhatsApp
// stub — the single call site that will matter once real sending is wired in.
async function createAutomationTask({ type, text, relatedLeadId, relatedAppointmentId, location, assigneeRole }) {
  const tasks = await readJSON('data/automation-tasks.json', []);
  const task = {
    id: crypto.randomUUID(),
    type,
    text: String(text).slice(0, 300),
    relatedLeadId: relatedLeadId || '',
    relatedAppointmentId: relatedAppointmentId || '',
    location: location || '',
    assigneeRole: assigneeRole || 'any',
    status: 'pending',
    createdAt: new Date().toISOString(),
    doneAt: null,
    doneBy: null,
  };
  tasks.push(task);
  await writeJSON('data/automation-tasks.json', tasks);
  // STUB — no-op today; see _lib/whatsapp.js for where real sending will be wired in.
  await sendWhatsApp(task);
  return task;
}

// Materializes a 'reminder_azi' task for every appointment in `appointmentsToday`
// that's still scheduled/confirmed and doesn't already have one. There's no cron
// infra in this project, so this runs computed-on-read instead, called from whichever
// GET endpoint just loaded today's appointments. Idempotent — safe to call on every
// request, since it dedupes by relatedAppointmentId before writing anything.
async function ensureTodayReminders(appointmentsToday) {
  const relevant = (appointmentsToday || []).filter((a) => a.status === 'programata' || a.status === 'confirmata');
  if (!relevant.length) return [];

  const tasks = await readJSON('data/automation-tasks.json', []);
  const alreadyReminded = new Set(
    tasks.filter((t) => t.type === 'reminder_azi').map((t) => t.relatedAppointmentId)
  );
  const toCreate = relevant.filter((a) => !alreadyReminded.has(a.id));
  if (!toCreate.length) return [];

  const now = new Date().toISOString();
  const created = toCreate.map((a) => ({
    id: crypto.randomUUID(),
    type: 'reminder_azi',
    text: `Reminder WhatsApp: programarea lui ${a.clientName || 'clientului'} e azi la ${a.time || '—'}.`,
    relatedLeadId: '',
    relatedAppointmentId: a.id,
    location: a.location || '',
    assigneeRole: 'receptie',
    status: 'pending',
    createdAt: now,
    doneAt: null,
    doneBy: null,
  }));

  await writeJSON('data/automation-tasks.json', tasks.concat(created));
  // STUB — no-op today; see _lib/whatsapp.js.
  for (const t of created) {
    await sendWhatsApp(t);
  }
  return created;
}

module.exports = { createAutomationTask, ensureTodayReminders };
