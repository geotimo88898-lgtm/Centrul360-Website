// /api/content-intake: where the producer (a Claude session that renders with reels/engine) hands in a week's batch;
// server to server with "Authorization: Bearer <CREATIVE_SSO_SECRET>" (as api/lead-health.js), or an admin's
// session. The guide with the exact calls: reels/PRODUCER.md. The owner approves the week in Admin → Conținut.
//   GET ?action=status          next week's batch (need, have, missing, the owner's review), this week's, the items to
//                               redo with the owner's note, the topics already made, what works (learn), the owner's
//                               ideas not made yet (ideas), next week's moments (season), the winners to make again
//                               as a new variant (recycle)
//   POST {action:'create', item:{kind: reel|carousel|slideshow, rubric, topic, keyword, caption,
//         captions:{tt,yt,ig,fb}, week:'YYYY-MM-DD' (its Monday; none: next week), hook, hookType, topicTag,
//         ideaId (marks the owner's idea made), variantOf (the winner it makes again)}}  → { id, week }
//   PUT|POST ?action=file&id=<id>&name=<file>&mime=<type>  (the raw bytes, ≤ 60 MB) → { file }
//   POST {action:'ready', id}   checks the files (reel: one MP4 9:16 ≤ 90 s + a JPG cover; carousel / slideshow: 2-10
//                               JPG 4:5 or 1:1) and the texts (content.js qa: the limits, the words refused, the
//                               diacritics), plans it in its week → { plan, week, info, warnings? }  (422 + problems)
//   POST {action:'replace', id, captions?, caption?, hook?, hookType?, clear?}   an item the owner sent back: open
//                               again for its new files (same names replace them; clear: drop them all first), then 'ready'
//   POST {action:'settings', on}   the global switch

const crypto = require('crypto');
const { getSession } = require('./_lib/auth');
const C = require('./_lib/content');

function fromCreative(req) {
  const secret = process.env.CREATIVE_SSO_SECRET || '';
  const header = String((req.headers && req.headers.authorization) || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secret || !token) return false;
  const a = crypto.createHash('sha256').update(token).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}
// the raw bytes of an upload: as the Worker's adapter gives them (a Buffer), or read from the request
async function bytes(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (Buffer.isBuffer(req.rawBody) && req.rawBody.length) return req.rawBody;
  if (req.body instanceof Uint8Array) return Buffer.from(req.body);
  const parts = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > C.MAX_BYTES) throw C.fail('too_large', 413); parts.push(Buffer.from(c)); }
  return Buffer.concat(parts);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = getSession(req);
  if (!fromCreative(req) && !(session && session.role === 'admin')) { res.status(401).json({ error: 'unauthorized' }); return; }
  const q = req.query || {};
  const body = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : {};
  const action = String(q.action || body.action || (req.method === 'GET' ? 'status' : ''));
  try {
    if (req.method === 'GET' && action === 'status') { res.status(200).json(await C.status()); return; }
    if (action === 'file' && (req.method === 'PUT' || req.method === 'POST')) {
      const len = Number((req.headers && req.headers['content-length']) || 0);
      if (len > C.MAX_BYTES) { res.status(413).json({ error: 'too_large' }); return; }
      const mime = String(q.mime || (req.headers && req.headers['content-type']) || '');
      const f = await C.addFile(String(q.id || ''), String(q.name || ''), mime, await bytes(req), { w: q.w, h: q.h, dur: q.dur });
      res.status(200).json({ ok: true, file: f });
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    if (action === 'create') { const it = await C.create(body.item); res.status(200).json({ ok: true, id: it.id, week: it.week }); return; }
    if (action === 'replace') { res.status(200).json(Object.assign({ ok: true }, await C.replace(String(body.id || ''), body))); return; }
    // the global switch: { action:'settings', on }
    if (action === 'settings' && req.method === 'POST') { res.status(200).json(Object.assign({ ok: true }, await C.saveSettings({ on: body.on !== false }))); return; }
    if (action === 'ready') {
      const r = await C.ready(String(body.id || ''));
      // the owner hears at once when next week's batch is complete
      await C.notices().catch((e) => console.error('content notices:', e.message));
      res.status(200).json(Object.assign({ ok: true }, r));
      return;
    }
    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    if (err && err.status) { res.status(err.status).json(Object.assign({ error: err.message }, err.extra || {})); return; }
    console.error('content-intake:', err && err.message);
    res.status(500).json({ error: 'server_error' });
  }
};
