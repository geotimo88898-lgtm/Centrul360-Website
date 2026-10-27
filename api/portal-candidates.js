// /api/portal-candidates, the candidates who applied through a job ad's form (api/_lib/fb-leads.js keeps them in
// data/candidates.json, apart from the clients): Pipeline → Angajări (and Echipa → Candidați).
//   GET                              the list, newest first, each with what she did on WhatsApp (replied, sent a file)
//   POST { id, status }              nou | cv | sunat | interviu | angajat | respins
// A candidate still at "nou" who sent a file or a photo on WhatsApp shows at "CV primit" by herself.

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { normalizePhone } = require('./_lib/clients');

const KEY = 'data/candidates.json';
const STATUSES = ['nou', 'cv', 'sunat', 'interviu', 'angajat', 'respins'];

async function withChat(list) {
  const convos = await readJSON('data/whatsapp-conversations.json', []);
  const byPhone = new Map(convos.map((c) => [c.phone, c]));
  return list.map((c) => {
    const convo = byPhone.get(normalizePhone(c.phone) || String(c.phone));
    const inn = ((convo && convo.messages) || []).filter((m) => m.direction === 'in');
    // her CV: the last file or photo she sent (opened in the portal's preview, from the Pipeline card)
    const f = inn.filter((m) => m.media && m.media.path && /document|image/.test(m.media.kind || '')).pop();
    const cv = f ? { url: '/api/portal-file?p=' + encodeURIComponent(f.media.path) + (f.media.filename ? '&n=' + encodeURIComponent(f.media.filename) : ''), name: f.media.filename || 'CV',
      kind: /pdf/i.test(f.media.mime || '') || /\.pdf$/i.test(f.media.filename || '') ? 'pdf' : f.media.kind === 'image' || /^image\//i.test(f.media.mime || '') ? 'img' : 'other' } : null;
    return Object.assign({}, c, { replied: inn.length > 0, cvFile: !!f, cv, status: c.status || (f ? 'cv' : 'nou') });
  });
}

module.exports = async (req, res) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  res.setHeader('Cache-Control', 'no-store');
  const list = await readJSON(KEY, []);
  if (req.method === 'GET') { res.status(200).json({ candidates: await withChat(list.filter((c) => !c.test)) }); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const b = req.body || {};
  const c = list.find((x) => x.id === String(b.id || ''));
  if (!c || !STATUSES.includes(b.status)) { res.status(400).json({ error: 'invalid' }); return; }
  c.status = b.status;
  c.statusAt = new Date().toISOString();
  await writeJSON(KEY, list);
  res.status(200).json({ candidates: await withChat(list.filter((x) => !x.test)) });
};
