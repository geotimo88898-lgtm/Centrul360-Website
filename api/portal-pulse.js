// GET /api/portal-pulse — the live-sync heartbeat. Returns the current data revision (bumped on
// every save, see _lib/store.js); the portal polls it and refreshes only when it moves. It also
// drives the automations (Admin → Automatizări), throttled inside tick().

const { readRev } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const { tick } = require('./_lib/workflows');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!requireAuth(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  // Open portals are the automations' clock: due steps (reminders, waits) run from here.
  await tick();
  const r = await readRev();
  res.status(200).json({ rev: r.rev, changed: r.changed });
};
