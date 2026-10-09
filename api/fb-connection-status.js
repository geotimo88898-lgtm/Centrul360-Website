// GET /api/fb-connection-status — admin-only (Setări → Integrări). Tells the UI whether
// a Facebook Page is connected, without ever exposing the stored Page Access Token.

const { readJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { isConfigured, loadConnection } = require('./_lib/facebook');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'no-store');

  if (!isConfigured()) {
    res.status(200).json({ connected: false, notConfigured: true });
    return;
  }

  try {
    const conn = await loadConnection(readJSON);
    if (!conn.pageId) {
      res.status(200).json({ connected: false });
      return;
    }
    res.status(200).json({ connected: true, pageName: conn.pageName, connectedAt: conn.connectedAt });
  } catch (err) {
    console.error('fb-connection-status error:', err.message);
    res.status(500).json({ error: 'status_failed' });
  }
};
