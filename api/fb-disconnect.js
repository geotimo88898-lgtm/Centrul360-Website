// POST /api/fb-disconnect — admin-only (Setări → Integrări → "Deconectează"). Clears the
// stored Facebook Page connection. Overwrites with {} rather than deleting the blob
// pathname outright — same "empty object means cleared" convention loadConnection() uses.

const { writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  try {
    await writeJSON('data/fb-connection.json', {});
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('fb-disconnect error:', err.message);
    res.status(500).json({ error: 'disconnect_failed' });
  }
};
