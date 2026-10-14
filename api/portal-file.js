// GET /api/portal-file?p=contacts/<id>/<file> - serves a contact's private file (scanned sheet,
// before/after photo) to a signed-in team member only. The blobs are private; nothing is ever
// reachable without a portal session.

const { readBinary } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');

const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
  // WhatsApp files (Mesaje): videos, voice notes, office documents
  mp4: 'video/mp4', '3gp': 'video/3gpp', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', amr: 'audio/amr',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', txt: 'text/plain; charset=utf-8' };

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = requireAuth(req, res);
  if (!session) return;
  const p = String((req.query && req.query.p) || '');
  const m = /^contacts\/[\w-]+\/[\w-]+\.(jpg|png|webp|pdf)$/.exec(p) || /^wa-media\/[\w-]+\.(jpg|png|webp|pdf|mp4|3gp|ogg|mp3|m4a|aac|amr|doc|docx|xls|xlsx|txt)$/.exec(p);
  if (!m) { res.status(400).json({ error: 'invalid_path' }); return; }
  const buf = await readBinary(p);
  if (!buf) { res.status(404).json({ error: 'not_found' }); return; }
  res.setHeader('Content-Type', TYPES[m[1]]);
  res.setHeader('Cache-Control', 'private, max-age=604800, immutable'); // file names are unique; a replaced photo gets a new name
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (m[1] === 'pdf') res.setHeader('Content-Disposition', 'inline');
  else if (/^(doc|docx|xls|xlsx|txt)$/.test(m[1])) res.setHeader('Content-Disposition', 'attachment; filename="' + String((req.query && req.query.n) || 'fisier.' + m[1]).replace(/[^\w.\- ]+/g, '_').slice(0, 100) + '"');
  res.status(200).send(buf);
};
