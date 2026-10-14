// GET /api/portal-activity?days=7 - Admin → Activitate: every change the team made in the portal in the
// last days (newest first), in words, with who, where and what changed (see _lib/activity.js).

const { requireAdmin } = require('./_lib/auth');
const A = require('./_lib/activity');

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = requireAdmin(req, res);
  if (!session) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const lines = await A.lines((req.query && req.query.days) || 1);
    res.status(200).json({ ok: true, lines });
  } catch (err) {
    console.error('portal-activity error:', err.message);
    res.status(500).json({ error: 'activity_failed' });
  }
};
