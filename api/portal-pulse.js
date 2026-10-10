// GET /api/portal-pulse — the live-sync heartbeat. Returns the current data revision (bumped on
// every save, see _lib/store.js); the portal polls it and refreshes only when it moves.

const { readRev } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!requireAuth(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  const r = await readRev();
  res.status(200).json({ rev: r.rev, changed: r.changed });
};
