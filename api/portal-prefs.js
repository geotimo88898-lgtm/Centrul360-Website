// /api/portal-prefs, how each account arranged its own pages (the columns and the cards it chose
// in Reclame, Panou, Încasări, Salariu…). Every account (admin and staff) has its own, kept on the
// server so a phone and a computer show the same.
//   GET                      { prefs: { 'ads.cols': [...], 'ads.cards': [...], ... } }
//   POST { key, value }      saves one (value null = back to the page's default)

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');

const keyOf = (session) => 'data/prefs/' + String(session.employeeId || 'admin').replace(/[^\w-]/g, '_') + '.json';

module.exports = async (req, res) => {
  const session = await requireAuth(req, res);
  if (!session) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const prefs = (await readJSON(keyOf(session), {})) || {};
    if (req.method === 'GET') { res.status(200).json({ ok: true, prefs }); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const { key, value } = req.body || {};
    if (!/^[a-z][a-z0-9._-]{1,40}$/i.test(String(key || ''))) { res.status(400).json({ error: 'invalid_key' }); return; }
    if (value === null || value === undefined) delete prefs[key];
    else {
      if (JSON.stringify(value).length > 6000) { res.status(400).json({ error: 'too_big' }); return; }
      prefs[key] = value;
    }
    if (Object.keys(prefs).length > 60) { res.status(400).json({ error: 'too_many' }); return; }
    await writeJSON(keyOf(session), prefs);
    res.status(200).json({ ok: true, prefs });
  } catch (err) {
    console.error('portal-prefs error:', err.message);
    res.status(500).json({ error: 'prefs_failed' });
  }
};
