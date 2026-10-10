// /api/portal-automation-tasks — the reception's task queue ("Sarcini"). Tasks are created by the
// automations (api/_lib/workflows.js): WhatsApp messages to send in one tap when they can't go out
// automatically, calls to make, follow-ups.
//
// GET  -> list (default: only status:'pending'; pass ?all=1 for everything). Also the
//         runs whatever automation steps are due first (workflows.tick).
// POST -> action:'complete' — any authenticated employee can mark a task done (they
//         sent the WhatsApp by hand and are checking it off), not just admin.
//
// Visibility: admin sees every location's tasks; everyone else only sees tasks tagged
// with their own location (or assigneeRole:'any', which isn't location-specific).

const { readJSON, writeJSON } = require('./_lib/store');
const { requireRole } = require('./_lib/auth');
const { tick } = require('./_lib/workflows');

function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
}

module.exports = async (req, res) => {
  // Front-desk queue: reception + admin (cosmeticians have no tasks here).
  const session = requireRole(req, res, ['admin', 'receptie']);
  if (!session) return;

  try {
    if (req.method === 'GET') {
      const [appointments, employeesRaw, leads] = await Promise.all([
        readJSON('data/appointments.json', []),
        readJSON('data/employees.json', []),
        readJSON('data/leads.json', []),
      ]);

      const today = todayISO();
      await tick(); // anything due from Automatizări lands here before the list is read

      const allTasks = await readJSON('data/automation-tasks.json', []);

      // Tasks whose appointment no longer needs a message close themselves: the appointment
      // was deleted, cancelled or already done, or its day has passed.
      const apptById = new Map(appointments.map((a) => [a.id, a]));
      let autoClosed = 0;
      const leadById = new Map(leads.map((l) => [l.id, l]));
      allTasks.forEach((t) => {
        // A lead's "call / write" task is done once someone has reached that lead.
        if (t.status === 'pending' && t.workflowId && t.relatedLeadId && !t.relatedAppointmentId) {
          const l = leadById.get(t.relatedLeadId);
          if (!l || (l.lastContactAt && l.lastContactAt > t.createdAt)) { t.status = 'done'; t.doneAt = new Date().toISOString(); t.doneBy = 'system'; autoClosed++; }
          return;
        }
        if (t.status !== 'pending' || !t.relatedAppointmentId) return;
        if (t.workflowId && !t.autoClose) return; // e.g. a review request after a finished treatment
        const a = apptById.get(t.relatedAppointmentId);
        if (!a || a.status === 'anulata' || a.status === 'finalizata' || a.date < today) {
          t.status = 'done'; t.doneAt = new Date().toISOString(); t.doneBy = 'system'; autoClosed++;
        }
      });
      if (autoClosed) await writeJSON('data/automation-tasks.json', allTasks);
      const clients = await readJSON('data/clients.json', []);
      const phoneById = new Map(clients.map((c) => [c.id, c.phone || '']));
      const showAll = req.query && (req.query.all === '1' || req.query.all === 'true');
      let visible = showAll ? allTasks : allTasks.filter((t) => t.status === 'pending');

      const isAdmin = session.role === 'admin';
      if (!isAdmin) {
        const me = employeesRaw.find((e) => e.id === session.employeeId);
        const myLocation = me ? me.location : '';
        visible = visible.filter((t) => t.assigneeRole === 'any' || !t.location || t.location === myLocation);
      }

      visible = visible.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      // Attach the appointment (with the client's phone) so the UI can send the WhatsApp in one tap.
      visible = visible.map((t) => {
        const a = t.relatedAppointmentId && apptById.get(t.relatedAppointmentId);
        if (!a) return t;
        return Object.assign({}, t, { appointment: { id: a.id, date: a.date, time: a.time, clientName: a.clientName, clientPhone: a.clientPhone || phoneById.get(a.clientId) || '',
          treatment: a.treatment, location: a.location, status: a.status, cosmeticianName: a.cosmeticianName || '' } });
      });
      res.status(200).json({ ok: true, tasks: visible });
      return;
    }

    if (req.method === 'POST') {
      const { action, id } = req.body || {};
      if (action !== 'complete') {
        res.status(400).json({ error: 'invalid_action' });
        return;
      }
      if (!id) {
        res.status(400).json({ error: 'missing_id' });
        return;
      }
      const tasks = await readJSON('data/automation-tasks.json', []);
      const task = tasks.find((t) => t.id === id);
      if (!task) {
        res.status(404).json({ error: 'task_not_found' });
        return;
      }
      task.status = 'done';
      task.doneAt = new Date().toISOString();
      task.doneBy = session.employeeId;
      await writeJSON('data/automation-tasks.json', tasks);
      res.status(200).json({ ok: true, task });
      return;
    }

    res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('portal-automation-tasks error:', err.message);
    res.status(500).json({ error: 'automation_tasks_failed' });
  }
};
