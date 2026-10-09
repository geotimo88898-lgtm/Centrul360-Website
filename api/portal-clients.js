// GET /api/portal-clients?q=<query> — live search over the shared client directory
// (data/clients.json), used for the autocomplete field in both the "Încasează client"
// and "Comision" forms in portal.html. Any authenticated role can search (same as the
// rest of the read side of the portal). No POST here — client creation only happens
// as a side effect of api/portal-sale.js (via upsertClient), so there's one single
// place where client records get written.

const { readJSON } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const { searchClients } = require('./_lib/clients');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;

  try {
    const clients = await readJSON('data/clients.json', []);
    const q = (req.query && req.query.q) || '';
    const results = searchClients(q, clients);
    res.status(200).json({ clients: results });
  } catch (err) {
    console.error('portal-clients error:', err.message);
    res.status(500).json({ error: 'clients_failed' });
  }
};
