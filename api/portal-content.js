// POST /api/portal-content, Admin → Conținut (the owner, 12.11): the weekly batch to approve, the plan per network,
// the numbers.
//   { action: 'get' }                       the items of the weeks around now (the one before, this one, the ones
//                                           ahead, and whatever posted in the last 3 weeks), the settings, both
//                                           weeks' status, the access (permissions), the week's top
//   { action: 'settings', on?, nets?, times?, photoTime?, quotas?, startWeek? }   (the plans follow at once)
//   { action: 'approve', id } / { action: 'redo', id, note }   the owner's look at one item
//   { action: 'approve_week', week }        every item of that week still waiting for a look
//   { action: 'captions', id, captions: { tt?, yt?, ig?, fb? } }   a network's text, edited
//   { action: 'post_now', id, net }         that item on that network now (approved items only)
//   { action: 'skip', id, net? }            Scoate: the entries not posted yet are skipped
// Admin only.

const { requireAdmin } = require('./_lib/auth');
const C = require('./_lib/content');
const P = require('./_lib/content-plan');

const BACK_MS = 21 * 864e5;
function view(it) {
  return { id: it.id, kind: it.kind, rubric: it.rubric, topic: it.topic, keyword: it.keyword, caption: it.caption, captions: it.captions || {}, week: it.week || '',
    review: it.review || 'pending', redoNote: it.redoNote || '', replacedAt: it.replacedAt || '', state: it.state, removed: !!it.removed, dropped: !!it.dropped,
    files: (it.files || []).map((f) => ({ name: f.name, mime: f.mime, w: f.w, h: f.h, dur: f.dur, size: f.size, v: f.v || '' })), cover: it.cover, createdAt: it.createdAt,
    plan: (it.plan || []).map((e) => ({ net: e.net, kind: e.kind || P.kindOn(it, e.net), at: e.at, state: e.state, url: e.url || '', error: e.error || '', hold: e.hold || '', tries: e.tries || 0, postedAt: e.postedAt || '' })),
    stats: it.stats || {} };
}
async function payload() {
  const POST = require('./_lib/content-post');
  const [list, st, status, access] = await Promise.all([C.items(), C.settings(), C.status(), POST.access().catch(() => ({ connected: false, missing: [] }))]);
  const now = Date.now(), from = P.addDays(P.weekOf(now), -7);
  const keep = list.filter((it) => !it.removed && ((it.week && it.week >= from) || (it.plan || []).some((e) => Date.parse(e.postedAt || e.at || 0) > now - BACK_MS)));
  return { settings: st, status, access: { connected: !!access.connected, igUser: access.igUser || '', missing: access.missing || [] },
    items: keep.slice(-400).map(view), top: require('./_lib/content-stats').top(list, now - 7 * 864e5, 3), today: P.roDay(now) };
}
const isNet = (n) => P.NETS.includes(n);

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = await requireAdmin(req, res);
  if (!session) return;
  const b = req.body || {};
  try {
    if (b.action === 'settings') {
      const patch = {};
      if (typeof b.on === 'boolean') patch.on = b.on;
      if (b.nets && typeof b.nets === 'object') { patch.nets = {}; P.NETS.forEach((n) => { if (typeof b.nets[n] === 'boolean') patch.nets[n] = b.nets[n]; }); }
      if (b.times && typeof b.times === 'object') { patch.times = {}; P.NETS.forEach((n) => { if (Array.isArray(b.times[n])) patch.times[n] = b.times[n].map(String).slice(0, 3); }); }
      if (b.photoTime && typeof b.photoTime === 'object') { patch.photoTime = {}; P.PHOTO_NETS.forEach((n) => { if (typeof b.photoTime[n] === 'string') patch.photoTime[n] = b.photoTime[n]; }); }
      if (b.quotas && typeof b.quotas === 'object') {
        patch.quotas = {};
        ['warm', 'full'].forEach((w) => { if (b.quotas[w] && typeof b.quotas[w] === 'object') { patch.quotas[w] = {}; P.NETS.forEach((n) => { if (b.quotas[w][n] && typeof b.quotas[w][n] === 'object') patch.quotas[w][n] = b.quotas[w][n]; }); } });
      }
      if (b.startWeek != null) { if (!P.isDay(b.startWeek)) { res.status(400).json({ error: 'invalid_week' }); return; } patch.startWeek = String(b.startWeek); }
      const st = await C.saveSettings(patch);
      // the plans follow at once: a network on or off, new times, new quotas (the items not looked at yet re-shuffled)
      await C.items();
      const now = Date.now();
      await C.update((list) => { let n = P.reflow(list, st, now) + P.retime(list, st, now); const before = JSON.stringify(list.map((x) => x.plan)); P.replanFrom(list, st, now); n += before === JSON.stringify(list.map((x) => x.plan)) ? 0 : 1; return n ? undefined : false; });
    } else if (b.action === 'approve' || b.action === 'redo') {
      await C.setReview(String(b.id || ''), b.action === 'approve' ? 'approved' : 'redo', b.note);
    } else if (b.action === 'approve_week') {
      const n = await C.approveWeek(String(b.week || ''));
      res.status(200).json(Object.assign(await payload(), { approved: n }));
      return;
    } else if (b.action === 'captions') {
      await C.setCaptions(String(b.id || ''), b.captions);
    } else if (b.action === 'post_now') {
      if (!isNet(b.net)) { res.status(400).json({ error: 'invalid_net' }); return; }
      const r = await require('./_lib/content-post').now(String(b.id || ''), b.net);
      res.status(200).json(Object.assign(await payload(), { result: r }));
      return;
    } else if (b.action === 'skip') {
      if (b.net && !isNet(b.net)) { res.status(400).json({ error: 'invalid_net' }); return; }
      await C.skip(String(b.id || ''), b.net || '');
    } else if (b.action !== 'get') { res.status(400).json({ error: 'invalid_action' }); return; }
    res.status(200).json(await payload());
  } catch (err) {
    if (err && err.status) { res.status(err.status).json({ error: err.message }); return; }
    console.error('portal-content:', err && err.message);
    res.status(500).json({ error: 'server_error' });
  }
};
