// /api/portal-candidates, Admin → Echipa → Candidați: the people who applied through a job ad's form
// (api/_lib/fb-leads.js keeps them in data/candidates.json, apart from the clients).
//   GET                              the list, newest first
//   POST { id, status }              nou | sunat | interviu | angajat | respins

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');

const KEY = 'data/candidates.json';
const STATUSES = ['nou', 'sunat', 'interviu', 'angajat', 'respins'];

module.exports = async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  res.setHeader('Cache-Control', 'no-store');
  const list = await readJSON(KEY, []);
  if (req.method === 'GET') { res.status(200).json({ candidates: list }); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const b = req.body || {};
  const c = list.find((x) => x.id === String(b.id || ''));
  if (!c || !STATUSES.includes(b.status)) { res.status(400).json({ error: 'invalid' }); return; }
  c.status = b.status;
  c.statusAt = new Date().toISOString();
  await writeJSON(KEY, list);
  res.status(200).json({ candidates: list });
};
