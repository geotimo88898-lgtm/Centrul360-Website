// GET /api/portal-integrations, what's connected, for the Integrări section (admin).
// Facebook has its own status endpoint (fb-connection-status); this covers the rest.

const { requireAdmin } = require('./_lib/auth');
const { whatsappConfigured } = require('./_lib/whatsapp');

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = requireAdmin(req, res);
  if (!session) return;
  res.status(200).json({
    ok: true,
    whatsapp: !!whatsappConfigured(),
    blob: !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
  });
};
