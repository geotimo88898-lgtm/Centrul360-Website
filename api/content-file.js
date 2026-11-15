// GET /api/content-file?i=<item id>&n=<file name>: a file of Conținut (a reel, its clean video without music, a cover, a
// carousel photo), served to anyone with the link, because Instagram and Facebook fetch them by URL to post them
// (api/_lib/content-post.js). The ids are random UUIDs and the files are posts meant for the public anyway. Range
// requests for the video (a player seeks, Meta may fetch in pieces); HEAD gives the size. &dl=1 (De postat, when the
// phone can't share a file): saved as a download, named &as=<name> when it is a plain file name.
// GET ?i=<item id>&att=<file>: a file of reference the owner attached to a change request (Content → Transit, „De
// refăcut”: a photo, a video, a song), at content/<id>/notes/<file>. Private: only an admin's session or the producer's
// key (Authorization: Bearer, as api/content-intake.js) gets it.

const C = require('./_lib/content');

const TYPES = { mp4: 'video/mp4', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
const allowed = (req) => { if (C.fromProducer(req)) return true; const s = require('./_lib/auth').getSession(req); return !!(s && s.role === 'admin'); };

// "bytes=a-b", "bytes=a-", "bytes=-n" → [from, to] within size; null: no range; false: can't be served
function range(h, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(h || '').trim());
  if (!m) return null;
  if (m[1] === '' && m[2] === '') return false;
  let from, to;
  if (m[1] === '') { const n = Number(m[2]); if (!n) return false; from = Math.max(0, size - n); to = size - 1; }
  else { from = Number(m[1]); to = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (from >= size || to < from) return false;
  return [from, to];
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET, HEAD'); res.status(405).json({ error: 'method_not_allowed' }); return; }
  const q = req.query || {};
  const id = String(q.i || ''), att = q.att != null ? String(q.att) : '';
  const name = att || String(q.n || '');
  if (!C.isId(id) || !(att ? C.isAtt(att) : C.isName(name))) { res.status(400).json({ error: 'invalid_path' }); return; }
  if (att && !allowed(req)) { res.setHeader('Cache-Control', 'no-store'); res.status(401).json({ error: 'unauthorized' }); return; }
  const path = att ? C.attPath(id, att) : C.pathOf(id, name);
  const blob = require('@vercel/blob');
  let meta = null;
  try { meta = await blob.head(path); } catch (e) { meta = null; }
  if (!meta || !meta.size) { res.status(404).json({ error: 'not_found' }); return; }
  const size = meta.size;
  const ext = name.split('.').pop().toLowerCase();
  res.setHeader('Content-Type', (att ? C.ATT_TYPES[ext] : TYPES[ext]) || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (att) { res.setHeader('Cache-Control', 'private, max-age=3600'); res.setHeader('Content-Disposition', (q.dl ? 'attachment' : 'inline') + '; filename="' + att + '"'); }
  else { res.setHeader('Cache-Control', 'public, max-age=86400'); res.setHeader('Access-Control-Allow-Origin', '*'); }
  if (q.dl && !att) {
    const as = String(q.as || '');
    const file = /^[\w-]{1,80}\.(mp4|jpe?g|png)$/i.test(as) && as.split('.').pop().toLowerCase() === ext ? as : name;
    res.setHeader('Content-Disposition', 'attachment; filename="' + file + '"');
  }
  if (meta.etag) res.setHeader('ETag', meta.etag);
  const r = range(req.headers && (req.headers.range || req.headers.Range), size);
  if (r === false) { res.setHeader('Content-Range', 'bytes */' + size); res.status(416).end(); return; }
  const [from, to] = r || [0, size - 1];
  res.setHeader('Content-Length', String(to - from + 1));
  if (r) res.setHeader('Content-Range', 'bytes ' + from + '-' + to + '/' + size);
  res.statusCode = r ? 206 : 200;
  if (req.method === 'HEAD') { res.end(); return; }
  const got = await blob.get(path, r ? { access: 'private', useCache: false, headers: { range: 'bytes=' + from + '-' + to } } : { access: 'private', useCache: false }).catch(() => null);
  if (!got || !got.stream) { res.removeHeader('Content-Length'); res.removeHeader('Content-Range'); res.status(404).json({ error: 'not_found' }); return; }
  for await (const chunk of got.stream) res.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  res.end();
};
module.exports.range = range;
