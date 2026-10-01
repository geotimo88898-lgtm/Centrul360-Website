// POST /api/portal-appointment — logs an appointment outcome from the "Programări" tab.
// Any authenticated role can log one (mainly recepție, but a cosmetician covering
// reception — e.g. in Arad — needs it too). No calendar, just a same-day running log:
// every entry is timestamped "today" (server date) and tied to the logged-in employee.
// Feeds both the shared Programări tally and the per-employee Panou goals/metrics.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');

const VALID_STATUSES = ['confirmata', 'anulata', 'reprogramata'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;

  const { status, clientName, time } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: 'invalid_status' });
    return;
  }

  try {
    const appointments = await readJSON('data/appointments.json', []);

    const entry = {
      id: crypto.randomUUID(),
      employeeId: session.employeeId,
      date: new Date().toISOString().slice(0, 10),
      status,
      clientName: clientName ? String(clientName).slice(0, 150) : '',
      time: time ? String(time).slice(0, 10) : '',
      createdAt: new Date().toISOString(),
    };

    appointments.push(entry);
    await writeJSON('data/appointments.json', appointments);

    res.status(200).json({ ok: true, entry });
  } catch (err) {
    console.error('portal-appointment error:', err.message);
    res.status(500).json({ error: 'appointment_failed' });
  }
};
