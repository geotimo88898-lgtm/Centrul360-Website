// /api/content-intake: where the producer (a Claude session that renders with reels/engine) hands in a week's batch;
// server to server with "Authorization: Bearer <CREATIVE_SSO_SECRET>" (as api/lead-health.js), or an admin's
// session. The guide with the exact calls: reels/PRODUCER.md. The owner approves each item in Admin → Content → Transit.
//   GET ?action=status          next week's batch (need, have, missing, the owner's review), this week's, the items to
//                               redo with the owner's change request (note, areas, links, files of reference with their
//                               url, fetched with the same key: api/content-file.js &att=), his notes on approved items
//                               (notes: lessons for the next ones), the topics already made, what works (learn), the owner's
//                               ideas not made yet (ideas), next week's moments (season), the winners to make again
//                               as a new variant (recycle)
//   POST {action:'create', item:{kind: reel|carousel|slideshow, rubric, topic, keyword, caption,
//         captions:{tt,yt,ig,fb}, week:'YYYY-MM-DD' (its Monday; none: next week), hook, hookType, topicTag,
//         ideaId (marks the owner's idea made), variantOf (the winner it makes again)}}  → { id, week }
//   PUT|POST ?action=file&id=<id>&name=<file>&mime=<type>[&role=clean]  (the raw bytes, ≤ 60 MB) → { file }
//                               role=clean: a reel's second MP4, the same video with voice and sound effects only (no
//                               music): the one that goes out (the owner posts it from the phone and puts a licensed
//                               sound on, content-app.js; the API posts it for a network in 'auto' mode); 9:16, the
//                               same length as the one with the music (±1 s); one per reel (another clean one under a
//                               new name takes its place). Without role: the preview with the owner's music, only for
//                               his look when he approves (never posted while the clean one is there).
//   POST {action:'ready', id}   checks the files (reel: one MP4 9:16 ≤ 90 s with the music + at most one clean MP4 + a
//                               JPG cover; carousel / slideshow: 2-10 JPG 4:5 or 1:1) and the texts (content.js qa:
//                               the limits, the words refused, the diacritics), plans it in its week → { plan, week,
//                               info, warnings? }  (422 + problems); a reel without its clean MP4 gets a warning
//   POST {action:'replace', id, captions?, caption?, hook?, hookType?, clear?}   an item the owner sent back: open
//                               again for its new files (same names replace them; clear: drop them all first), then 'ready'
//   POST {action:'settings', on}   the global switch

const { getSession } = require('./_lib/auth');
const C = require('./_lib/content');

// the producer's key (content.js fromProducer)
const fromCreative = (req) => C.fromProducer(req);
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
    // the stories: per network the newest, its hours left live, the next one planned, the evergreen reserve (content-story.js)
    if (req.method === 'GET' && action === 'status') {
      const [s, list, st] = await Promise.all([C.status(), C.items(), C.settings()]);
      res.status(200).json(Object.assign(s, { stories: require('./_lib/content-story').coverage(list, st, Date.now()) }));
      return;
    }
    // what is waiting for a look (Claude reviews it, the owner 21.11): each ready item with its texts and its files' links
    if (req.method === 'GET' && action === 'items') {
      const want = String(q.review || 'pending');
      const list = (await C.items()).filter((it) => !it.removed && !it.dropped && it.state === 'ready' && (want === 'all' || (it.review || 'pending') === want));
      res.status(200).json({ ok: true, items: list.map((it) => ({ id: it.id, kind: it.kind, week: it.week, rubric: it.rubric, topic: it.topic, hook: it.hook, review: it.review || 'pending',
        seq: it.seq || undefined, evergreen: it.evergreen || undefined, promo: it.promo || undefined, plan: (it.plan || []).map((e) => ({ net: e.net, at: e.at, state: e.state })),
        captions: it.captions || {}, caption: it.caption || '', files: (it.files || []).map((f) => ({ name: f.name, role: f.role || '', mime: f.mime, dur: f.dur, w: f.w, h: f.h, url: C.fileUrl(it.id, f.name, f.v) })) })) });
      return;
    }
    // what went out (or failed) on each network, by day: ?action=posts&day=YYYY-MM-DD
    if (req.method === 'GET' && action === 'posts') {
      const day = String(q.day || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const out = [];
      (await C.items()).forEach((it) => (it.plan || []).forEach((e) => {
        const t = String(e.postedAt || e.at || e.todoAt || '');
        if (t.slice(0, 10) === day) out.push({ net: e.net, at: e.at || '', postedAt: e.postedAt || '', state: e.state || '', manual: !!e.manual, error: String(e.error || '').slice(0, 160), kind: it.kind, topic: it.topic, review: it.review || '' });
      }));
      out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
      res.status(200).json({ ok: true, day, posts: out });
      return;
    }
    if (action === 'file' && (req.method === 'PUT' || req.method === 'POST')) {
      const len = Number((req.headers && req.headers['content-length']) || 0);
      if (len > C.MAX_BYTES) { res.status(413).json({ error: 'too_large' }); return; }
      const mime = String(q.mime || (req.headers && req.headers['content-type']) || '');
      const f = await C.addFile(String(q.id || ''), String(q.name || ''), mime, await bytes(req), { w: q.w, h: q.h, dur: q.dur, role: q.role });
      res.status(200).json({ ok: true, file: f });
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    if (action === 'create') { const it = await C.create(body.item); res.status(200).json({ ok: true, id: it.id, week: it.week }); return; }
    if (action === 'replace') { res.status(200).json(Object.assign({ ok: true }, await C.replace(String(body.id || ''), body))); return; }
    // the settings: { action:'settings', on, quotas?, times?, photoTime?, modes?, nets? } (the owner, 21.11: „încredere maximă,
    // organice hardcore”: Claude sets the volume and the posting itself; saveSettings merges and checks every part)
    if (action === 'settings' && req.method === 'POST') {
      const patch = { on: body.on !== false };
      ['quotas', 'times', 'photoTime', 'storyTimes', 'modes', 'nets'].forEach((k) => { if (body[k] && typeof body[k] === 'object') patch[k] = body[k]; });
      res.status(200).json(Object.assign({ ok: true }, await C.saveSettings(patch)));
      return;
    }
    // the look, by Claude (the owner, 21.11: he leaves the approval to Claude): { action:'approve', ids } approves those
    // still waiting; { action:'redo', id, note } sends one back to the producer
    // { action:'move', id, week }: an item nothing posted yet goes to another week (its review stays)
    if (action === 'move') { res.status(200).json(Object.assign({ ok: true }, await C.move(String(body.id || ''), body.week))); return; }
    if (action === 'approve') { res.status(200).json({ ok: true, approved: await C.approveAll(Array.isArray(body.ids) ? body.ids : []) }); return; }
    if (action === 'redo') { res.status(200).json({ ok: true, item: await C.setReview(String(body.id || ''), 'redo', String(body.note || '').slice(0, 1000), {}) }); return; }
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
