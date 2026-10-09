// /api/portal-automation-tasks — the internal "sarcină" queue standing in for GHL's
// WhatsApp automations (portal.html's "Automatizări" tab). See api/_lib/automation.js
// for how tasks get created, and api/_lib/whatsapp.js for the (currently no-op) send.
//
// GET  -> list (default: only status:'pending'; pass ?all=1 for everything). Also the
//         one place that materializes 'reminder_azi' tasks for today's scheduled/
//         confirmed appointments — there's no cron infra in this project, so "today's
//         reminders exist" is computed right here, on read, the same way portal-data.js
//         computes "today's appointments".
// POST -> action:'complete' — any authenticated employee can mark a task done (they
//         sent the WhatsApp by hand and are checking it off), not just admin.
//
// Visibility: admin sees every location's tasks; everyone else only sees tasks tagged
// with their own location (or assigneeRole:'any', which isn't location-specific).

const { readJSON, writeJSON } = require('./_lib/store');
const { requireRole } = require('./_lib/auth');
const { ensureTodayReminders } = require('./_lib/automation');

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = async (req, res) => {
  // Front-desk queue: reception + admin (cosmeticians have no tasks here).
  const session = requireRole(req, res, ['admin', 'receptie']);
  if (!session) return;

  try {
    if (req.method === 'GET') {
      const [appointments, employeesRaw] = await Promise.all([
        readJSON('data/appointments.json', []),
        readJSON('data/employees.json', []),
      ]);

      const today = todayISO();
      const appointmentsToday = appointments.filter((a) => a.date === today);
      await ensureTodayReminders(appointmentsToday);

      const allTasks = await readJSON('data/automation-tasks.json', []);
      const showAll = req.query && (req.query.all === '1' || req.query.all === 'true');
      let visible = showAll ? allTasks : allTasks.filter((t) => t.status === 'pending');

      const isAdmin = session.role === 'admin';
      if (!isAdmin) {
        const me = employeesRaw.find((e) => e.id === session.employeeId);
        const myLocation = me ? me.location : '';
        visible = visible.filter((t) => t.assigneeRole === 'any' || !t.location || t.location === myLocation);
      }

      visible = visible.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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
