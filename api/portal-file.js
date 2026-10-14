// GET /api/portal-file?p=contacts/<id>/<file> - serves a contact's private file (scanned sheet,
// before/after photo) to a signed-in team member only. The blobs are private; nothing is ever
// reachable without a portal session.

const { readBinary } = require('./_lib/store');
const VIDEO_TYPES = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v' };

// A training video (Traininguri) can be hundreds of MB: the browser gets a link signed for an hour,
// straight to the private store (it streams and seeks there). If signing isn't available, the video is
// sent from here in pieces (Range), a few MB at a time.
async function academyVideo(req, res, p, ext) {
  try {
    const { issueSignedToken, presignUrl } = require('@vercel/blob');
    const validUntil = Date.now() + 3600e3;
    const token = await issueSignedToken({ pathname: p, operations: ['get', 'head'], validUntil });
    const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname: p, access: 'private', validUntil });
    res.setHeader('Cache-Control', 'private, no-store');
    res.statusCode = 302; res.setHeader('Location', presignedUrl); res.end();
    return;
  } catch (err) { console.error('academy video sign:', err.message); }
  const { get } = require('@vercel/blob');
  const CHUNK = 3 * 1024 * 1024;
  const m = /bytes=(\d+)-(\d*)/.exec(String(req.headers.range || ''));
  const from = m ? Number(m[1]) : 0;
  const head = await get(p, { access: 'private', headers: { range: 'bytes=' + from + '-' + (from + CHUNK - 1) } }).catch(() => null);
  if (!head || !head.stream) { res.status(404).json({ error: 'not_found' }); return; }
  const chunks = [];
  for await (const c of head.stream) chunks.push(Buffer.from(c));
  const buf = Buffer.concat(chunks);
  const total = Number(((head.headers && head.headers.get && head.headers.get('content-range')) || '').split('/')[1]) || (head.blob && head.blob.size) || buf.length;
  res.setHeader('Content-Type', VIDEO_TYPES[ext]);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('Content-Range', 'bytes ' + from + '-' + (from + buf.length - 1) + '/' + total);
  res.status(206).send(buf);
}
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
  const av = /^academy\/[\w-]{6,80}\.(mp4|mov|webm|m4v)$/.exec(p);
  if (av) return academyVideo(req, res, p, av[1]);
  const m = /^academy\/[\w-]{6,80}\.(jpg|png|webp)$/.exec(p) || /^contacts\/[\w-]+\/[\w-]+\.(jpg|png|webp|pdf)$/.exec(p) || /^wa-media\/[\w-]+\.(jpg|png|webp|pdf|mp4|3gp|ogg|mp3|m4a|aac|amr|doc|docx|xls|xlsx|txt)$/.exec(p);
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
