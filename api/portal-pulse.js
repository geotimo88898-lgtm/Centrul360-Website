// GET /api/portal-pulse, the live-sync heartbeat. Returns the current data revision (bumped on
// every save, see _lib/store.js); the portal polls it and refreshes only when it moves. It also
// drives the automations (Admin → Automatizări), throttled inside tick(), and the reading of new
// Facebook leads (_lib/fb-leads.js, at most once a minute).

const { readRev } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const { tick } = require('./_lib/workflows');
const { pollLeads } = require('./_lib/fb-leads');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!requireAuth(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  // Open portals are the automations' clock: due steps (reminders, waits) run from here.
  await tick();
  // and the clock for reading new leads from the Facebook forms (at most once a minute)
  await pollLeads();
  const r = await readRev();
  res.status(200).json({ rev: r.rev, changed: r.changed });
};
