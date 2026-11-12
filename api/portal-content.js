// POST /api/portal-content, Admin → Conținut (the owner, 12.11): the organic posts' queue, calendar and numbers.
//   { action: 'get' }                       the items around now (3 weeks back, everything ahead), the settings,
//                                           the queue, the access (permissions), the week's top
//   { action: 'settings', on?, nets?, slots?, gapDays? }
//   { action: 'post_now', id, net }         that item on that network now (api/_lib/content-post.js now)
//   { action: 'skip', id, net? }            Scoate: the entries not posted yet are skipped
// Admin only.

const { requireAdmin } = require('./_lib/auth');
const C = require('./_lib/content');
const P = require('./_lib/content-plan');

const BACK_MS = 21 * 864e5;
function view(it) {
  return { id: it.id, kind: it.kind, rubric: it.rubric, topic: it.topic, keyword: it.keyword, caption: it.caption, state: it.state, removed: !!it.removed,
    files: (it.files || []).map((f) => ({ name: f.name, mime: f.mime, w: f.w, h: f.h, dur: f.dur, size: f.size })), cover: it.cover, createdAt: it.createdAt,
    plan: (it.plan || []).map((e) => ({ net: e.net, at: e.at, state: e.state, url: e.url || '', error: e.error || '', hold: e.hold || '', tries: e.tries || 0, postedAt: e.postedAt || '' })),
    stats: it.stats || {} };
}
async function payload() {
  const POST = require('./_lib/content-post');
  const [list, st, status, access] = await Promise.all([C.items(), C.settings(), C.status(), POST.access().catch(() => ({ connected: false, missing: [] }))]);
  const now = Date.now();
  const keep = list.filter((it) => !it.removed && (it.state === 'draft' || (it.plan || []).some((e) => Date.parse(e.at) > now - BACK_MS || Date.parse(e.postedAt || 0) > now - BACK_MS)));
  return { settings: st, status, access: { connected: !!access.connected, igUser: access.igUser || '', missing: access.missing || [] },
    items: keep.slice(-300).map(view), top: require('./_lib/content-stats').top(list, now - 7 * 864e5, 3), today: P.roDay(now) };
}

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
      if (Array.isArray(b.slots)) patch.slots = b.slots.map(String).slice(0, 8);
      if (b.gapDays != null) patch.gapDays = Number(b.gapDays);
      const st = await C.saveSettings(patch);
      // the plans follow at once (a network on: its waiting entries planned; the switch on: the stale ones moved)
      await C.update((list) => (P.reflow(list, st, Date.now()) ? undefined : false));
    } else if (b.action === 'post_now') {
      if (!P.NETS.includes(b.net)) { res.status(400).json({ error: 'invalid_net' }); return; }
      const r = await require('./_lib/content-post').now(String(b.id || ''), b.net);
      const out = await payload();
      res.status(200).json(Object.assign(out, { result: r }));
      return;
    } else if (b.action === 'skip') {
      if (b.net && !P.NETS.includes(b.net)) { res.status(400).json({ error: 'invalid_net' }); return; }
      await C.skip(String(b.id || ''), b.net || '');
    } else if (b.action !== 'get') { res.status(400).json({ error: 'invalid_action' }); return; }
    res.status(200).json(await payload());
  } catch (err) {
    if (err && err.status) { res.status(err.status).json({ error: err.message }); return; }
    console.error('portal-content:', err && err.message);
    res.status(500).json({ error: 'server_error' });
  }
};
