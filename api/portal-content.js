// POST /api/portal-content, Admin → Content (the owner, 12.11, renamed 15.11: Insights, Transit, Calendar): the batch to
// approve one by one (Transit), the plan per network (Calendar), the numbers (Insights).
//   { action: 'get' }                       the items of the weeks around now (the one before, this one, the ones
//                                           ahead, and whatever posted in the last 3 weeks), the settings, both
//                                           weeks' status, the access (permissions), the week's top, the ideas
//   { action: 'results' }                   Rezultate: the followers per network, the last 30 days, the top 10, what
//                                           works (rubrics, topics, hooks, hours), the last month (content-learn.js);
//                                           the key numbers, the rates per network, the organic funnel, „Merge tare”,
//                                           the audience, the recommended hours, what people say, the week's analysis,
//                                           the monthly goals (content-insights.js)
//   { action: 'settings', on?, nets?, modes?, times?, photoTime?, storyTimes?, quotas?, startWeek?, competitors?, goals? }   (the
//                                           plans follow; modes: { tt, yt, ig, fb: 'app' (Din aplicație) | 'auto' };
//                                           goals: { followers: { ig, fb, tt, yt }, views, leads } a month)
//   { action: 'apply_hours' }               „Folosește orele recomandate”: the recommended times saved (the plans follow)
//   { action: 'approve', id, note?, areas? }   approved (a note: „aprobat, dar data viitoare…”, kept for the producer)
//   { action: 'redo', id, note, areas?, links?, files?: [{ path, name }] }   „De refăcut”: what to change, the areas
//                                           (video, muzica, text, caption, descriere, hashtag, altceva), links and files of
//                                           reference (uploaded first with ?upload=1 to content/<id>/notes/<file>)
//   { action: 'unreview', id }              „Anulează”: the last look undone (nothing out yet, the redo not started)
//   POST ?upload=1                          a file of reference, from the phone straight to the store, in parts
//                                           (cf/blob-client-r2.js; at most 200 MB)
//   { action: 'approve_week', week }        every item of that week still waiting for a look
//   { action: 'approve_all', ids? }         „Aprobă tot (N)” in Transit: every item ready and waiting, all weeks (only
//                                           the `ids` the page showed, when it sends them) → { approved }
//   { action: 'fav', id, fav }              a favourite on or off (any item: waiting, approved, posted) → { fav }
//   { action: 'gallery' }                   Galerie: every item approved or posted (not only the weeks around now)
//   { action: 'captions', id, captions: { tt?, yt?, ig?, fb? } }   a network's text, edited
//   { action: 'post_now', id, net }         that item on that network now (approved items only)
//   { action: 'skip', id, net? }            Scoate: the entries not posted yet are skipped
//   { action: 'idea_add', text, rubric? } / { action: 'idea_del', id }   the owner's ideas for the next weeks
//   { action: 'boost', id, net, city?, offer?, daily?, dry? }   „Fă reclamă din asta”: a posted Instagram / Facebook
//                                           entry becomes a lead ad, paused (content-boost.js) → { result }
//   { action: 'boost_start', id, net }      its campaign on → { result }
//   De postat (content-app.js, the networks in 'app' mode):
//   { action: 'app_posted', id, net, link? }  „Am postat”: recorded as posted (the link's id when there is one)
//   { action: 'app_link', id, net, link }     „Adaugă linkul” on a post made from the app (its numbers follow it)
//   { action: 'app_snooze', id, net }         „Nu pot acum”: back later today → { result: { until } }
//   { action: 'app_skip', id, net, reason }   „Sari peste” → { result: { moved: at } | { skipped: true } }
// Admin only.

const { requireAdmin } = require('./_lib/auth');
const C = require('./_lib/content');
const P = require('./_lib/content-plan');

const BACK_MS = 21 * 864e5;
// a post made from the app, as the page shows it: which post it is (or that it isn't known, and why)
const matchOf = (m) => (m ? { state: m.state || '', how: m.how || '', note: m.note || '', at: m.at || '' } : null);
function view(it, url, ins) {
  const q = C.qa(it);
  const x = (ins && ins[it.id]) || null;
  const A = require('./_lib/content-app');
  return { id: it.id, kind: it.kind, rubric: it.rubric, topic: it.topic, keyword: it.keyword, caption: it.caption, captions: it.captions || {}, week: it.week || '',
    review: it.review || 'pending', redoNote: it.redoNote || '', replacedAt: it.replacedAt || '', reviewedAt: it.reviewedAt || '', state: it.state,
    redo: it.redo ? C.notesView(it.id, it.redo) : null, notes: (it.notes || []).slice(-6).map((n) => C.notesView(it.id, n)), canUndo: !!it.undo && (it.review || 'pending') !== 'pending', removed: !!it.removed, dropped: !!it.dropped,
    files: (it.files || []).map((f) => ({ name: f.name, mime: f.mime, w: f.w, h: f.h, dur: f.dur, size: f.size, v: f.v || '', role: f.role || '' })), cover: it.cover, createdAt: it.createdAt,
    plan: (it.plan || []).map((e) => Object.assign({ net: e.net, kind: e.kind || P.kindOn(it, e.net), at: e.at, state: e.state, url: e.url || '', error: e.error || '', hold: e.hold || '', tries: e.tries || 0, postedAt: e.postedAt || '',
      note: e.note || '', privacy: e.privacy || '', comment: e.comment ? { text: e.comment.text || '', error: e.comment.error || '', at: e.comment.at || '' } : null },
      // Din aplicație: the card's texts while it waits, the post's match once posted, the skipped slots
      e.state === 'todo' ? { todoAt: e.todoAt || '', snoozeUntil: e.snoozeUntil || '', copy: A.copyOf(it, e.net) } : {},
      e.manual ? { manual: true, markedAt: e.markedAt || '', match: matchOf(e.match) } : {},
      e.skips && e.skips.length ? { skips: e.skips.map((k) => ({ at: k.at || '', reason: k.reason || '', skippedAt: k.skippedAt || '' })) } : {},
      e.skipNote ? { skipNote: e.skipNote } : {})),
    fav: !!it.fav, favAt: it.favAt || '',
    stats: it.stats || {}, hook: it.hook || '', hookType: it.hookType || '', ideaId: it.ideaId || '', variantOf: it.variantOf || '', firstComment: it.firstComment || '',
    qa: { problems: q.problems, warnings: C.fileWarnings(it).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).concat(q.warnings) },
    boosts: (it.boosts || []).filter((b) => b && b.campaignId).map((b) => ({ net: b.net, at: b.at || '', campaignId: b.campaignId, name: b.name || '', mode: b.mode || '', daily: b.daily || 0,
      offer: b.offer ? { id: b.offer.id, title: b.offer.title } : null, cities: (b.cities || []).map((c) => (c && c.city) || c).filter((c) => typeof c === 'string'),
      gone: !!b.gone, startedAt: b.startedAt || '', url: url(b.campaignId) })),
    // the insights: the snapshots per network, „Merge tare”, × the network's usual post, the rates
    snaps: it.snaps || {}, hot: it.hot || null, ins: x ? { x: x.x || {}, rates: x.rates || {} } : null };
}
// the Ads Manager link of a boost's campaign (the ad account read only when there is one)
async function adsLink(list) {
  if (!list.some((it) => (it.boosts || []).length)) return () => '';
  try {
    const conn = await require('./_lib/facebook').loadConnection(require('./_lib/store').readJSON);
    const ads = require('./_lib/meta-ads');
    return (id) => (conn.adAccountId && id ? ads.adsManagerUrl(conn.adAccountId, id) : '');
  } catch (e) { return () => ''; }
}
async function payload() {
  const POST = require('./_lib/content-post');
  const [list, st, status, access, ideas] = await Promise.all([C.items(), C.settings(), C.status(), POST.access().catch(() => ({ connected: false, missing: [] })), C.ideas()]);
  const now = Date.now(), from = P.addDays(P.weekOf(now), -7);
  const keep = list.filter((it) => !it.removed && ((it.week && it.week >= from) || (it.plan || []).some((e) => Date.parse(e.postedAt || e.at || 0) > now - BACK_MS)));
  const url = await adsLink(keep);
  const I = require('./_lib/content-insights');
  const ins = I.itemInsights(list, now);
  // the ideas: the new ones, then the last ones made
  const fresh = ideas.filter((d) => d.state !== 'used'), used = ideas.filter((d) => d.state === 'used').sort((a, b) => String(b.usedAt || '').localeCompare(String(a.usedAt || ''))).slice(0, 6);
  // YouTube and TikTok have their own connections (Integrări): connected, lost, what they miss
  const net = (x, name) => (x ? { connected: !!x.connected, configured: !!x.configured, [name]: x[name] || '', missing: x.missing || [], lost: x.lost || '' } : { connected: false, configured: false, [name]: '', missing: [], lost: '' });
  return { settings: st, status, access: { connected: !!access.connected, igUser: access.igUser || '', missing: access.missing || [], yt: net(access.yt, 'channel'), tt: net(access.tt, 'name') },
    items: keep.slice(-400).map((it) => view(it, url, ins)), season: require('./_lib/content-learn').season(P.addDays(P.weekOf(now), 7)), goals: await I.goals().catch(() => ({ followers: {} })), top: require('./_lib/content-stats').top(list, now - 7 * 864e5, 3), today: P.roDay(now),
    ideas: fresh.concat(used).map((d) => ({ id: d.id, text: d.text, rubric: d.rubric || '', state: d.state, at: d.at, itemId: d.itemId || '' })), rubrics: C.RUBRICS };
}
const isNet = (n) => P.NETS.includes(n);
// content-boost.js, when it is there
function booster() { try { const B = require('./_lib/content-boost'); return B && typeof B.boost === 'function' ? B : null; } catch (e) { return null; } }

// a file of reference for a change request, uploaded in parts (the phone's videos are big): content/<id>/notes/<file>
const UP_TYPES = [...new Set(Object.values(C.ATT_TYPES))].concat(['audio/x-m4a', 'audio/x-wav', 'audio/webm', 'audio/mp3', 'video/3gpp', 'image/jpg']);
async function upload(req, res) {
  const session = await requireAdmin(req, res);
  if (!session) return;
  try {
    const { handleUpload } = require('@vercel/blob/client');
    const out = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const m = /^content\/([0-9a-f-]{36})\/notes\/([^/]+)$/.exec(String(pathname || ''));
        if (!m || !C.isId(m[1]) || !C.isAtt(m[2])) throw new Error('invalid_path');
        return { allowedContentTypes: UP_TYPES, maximumSizeInBytes: C.ATT_MAX, addRandomSuffix: false, allowOverwrite: false };
      },
    });
    res.status(200).json(out);
  } catch (err) {
    console.error('content upload:', err.message);
    res.status(400).json({ error: err.message === 'too_large' ? 'too_large' : 'upload_failed' });
  }
}
// the sizes of the reference files a request names (only the ones really in the store count)
async function sizesOf(id, files) {
  const blob = require('@vercel/blob'), out = {};
  await Promise.all((Array.isArray(files) ? files : []).slice(0, 12).map(async (f) => {
    const n = C.attOf(f && f.path, id); if (!n) return;
    try { const h = await blob.head(C.attPath(id, n)); if (h && h.size) out[n] = h.size; } catch (e) { /* not there */ }
  }));
  return out;
}

module.exports = async (req, res) => {
  if (req.query && req.query.upload) return upload(req, res);
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = await requireAdmin(req, res);
  if (!session) return;
  const b = req.body || {};
  try {
    if (b.action === 'settings') {
      const patch = {};
      if (typeof b.on === 'boolean') patch.on = b.on;
      if (b.nets && typeof b.nets === 'object') { patch.nets = {}; P.NETS.forEach((n) => { if (typeof b.nets[n] === 'boolean') patch.nets[n] = b.nets[n]; }); }
      if (b.modes && typeof b.modes === 'object') { patch.modes = {}; P.NETS.forEach((n) => { if (P.MODES.includes(b.modes[n])) patch.modes[n] = b.modes[n]; }); }
      if (b.times && typeof b.times === 'object') { patch.times = {}; P.NETS.forEach((n) => { if (Array.isArray(b.times[n])) patch.times[n] = b.times[n].map(String).slice(0, 3); }); }
      if (b.photoTime && typeof b.photoTime === 'object') { patch.photoTime = {}; P.PHOTO_NETS.forEach((n) => { if (typeof b.photoTime[n] === 'string') patch.photoTime[n] = b.photoTime[n]; }); }
      if (b.storyTimes && typeof b.storyTimes === 'object') { patch.storyTimes = {}; P.STORY_NETS.forEach((n) => { if (Array.isArray(b.storyTimes[n])) patch.storyTimes[n] = b.storyTimes[n].map(String).slice(0, 5); }); }
      if (b.quotas && typeof b.quotas === 'object') {
        patch.quotas = {};
        ['warm', 'full'].forEach((w) => { if (b.quotas[w] && typeof b.quotas[w] === 'object') { patch.quotas[w] = {}; P.NETS.forEach((n) => { if (b.quotas[w][n] && typeof b.quotas[w][n] === 'object') patch.quotas[w][n] = b.quotas[w][n]; }); } });
      }
      if (b.startWeek != null) { if (!P.isDay(b.startWeek)) { res.status(400).json({ error: 'invalid_week' }); return; } patch.startWeek = String(b.startWeek); }
      if (Array.isArray(b.competitors) || typeof b.competitors === 'string') patch.competitors = b.competitors;
      const st = await C.saveSettings(patch);
      // the plans follow at once: a network on or off, new times, new quotas (the items not looked at yet re-shuffled)
      await require('./_lib/content-insights').replanAll(st);
      // Ținte lunare
      if (b.goals && typeof b.goals === 'object') await require('./_lib/content-insights').saveGoals(b.goals, session.username || session.employeeId || '');
    } else if (b.action === 'results') {
      const list = await C.items(), now = Date.now();
      res.status(200).json(Object.assign(await require('./_lib/content-learn').results(list, now), await require('./_lib/content-insights').extra(list, now)));
      return;
    } else if (b.action === 'apply_hours') {
      const r = await require('./_lib/content-insights').applyHours();
      res.status(200).json(Object.assign(await payload(), { applied: r.applied }));
      return;
    } else if (b.action === 'idea_add') {
      await C.addIdea(b.text, b.rubric);
    } else if (b.action === 'idea_del') {
      await C.delIdea(String(b.id || ''));
    } else if (b.action === 'boost' || b.action === 'boost_start') {
      if (b.net !== 'ig' && b.net !== 'fb') { res.status(400).json({ error: 'invalid_net' }); return; }
      const id = String(b.id || '');
      const B = booster();
      if (!B || (b.action === 'boost_start' && typeof B.start !== 'function')) { res.status(200).json({ error: 'not_ready' }); return; }
      const it = C.findItem(await C.items(), id);
      if (!it || it.removed) { res.status(404).json({ error: 'not_found' }); return; }
      if (b.action === 'boost_start') {
        const r = await B.start(id, b.net);
        // the owner sees it started (content-boost keeps the boost, the start is noted here)
        if (r && r.ok) await C.update((list) => { const x = C.findItem(list, id); const y = x && (x.boosts || []).find((z) => z.net === b.net && z.campaignId && !z.gone); if (!y || y.startedAt) return false; y.startedAt = new Date().toISOString(); });
        res.status(200).json(Object.assign(await payload(), { result: r }));
        return;
      }
      if (!(it.plan || []).some((e) => e.net === b.net && e.state === 'posted')) { res.status(409).json({ error: 'not_posted' }); return; }
      const opts = { by: session.username || session.employeeId || '' };
      if (b.city) opts.city = String(b.city);
      if (b.offer) opts.offer = String(b.offer);
      if (b.daily != null && b.daily !== '') opts.daily = Number(b.daily);
      if (b.dry) opts.dry = true;
      const r = await B.boost(id, b.net, opts);
      // a plan to confirm: just the answer; a campaign made: with the page, so the drawer shows it
      res.status(200).json(b.dry && !(r && r.already) ? { result: r } : Object.assign(await payload(), { result: r }));
      return;
    } else if (b.action === 'approve' || b.action === 'redo') {
      const id = String(b.id || '');
      const extra = { areas: b.areas, links: b.links, files: b.action === 'redo' ? b.files : [] };
      if (b.action === 'redo' && Array.isArray(b.files) && b.files.length) extra.sizes = await sizesOf(id, b.files);
      await C.setReview(id, b.action === 'approve' ? 'approved' : 'redo', b.note, extra);
    } else if (b.action === 'unreview') {
      await C.unreview(String(b.id || ''));
    } else if (b.action === 'approve_week') {
      const n = await C.approveWeek(String(b.week || ''));
      res.status(200).json(Object.assign(await payload(), { approved: n }));
      return;
    } else if (b.action === 'approve_all') {
      const n = await C.approveAll(Array.isArray(b.ids) ? b.ids : null);
      res.status(200).json(Object.assign(await payload(), { approved: n }));
      return;
    } else if (b.action === 'fav') {
      const id = String(b.id || '');
      await C.setFav(id, !!b.fav);
      const it = C.findItem(await C.items(), id);
      res.status(200).json(Object.assign(await payload(), { fav: { id, fav: !!(it && it.fav), favAt: (it && it.favAt) || '' } }));
      return;
    } else if (b.action === 'gallery') {
      // the reels he approved (and whatever went out), the newest first, with their numbers
      const list = await C.items(), now = Date.now();
      const keep = list.filter((it) => !it.removed && (((it.review || 'pending') === 'approved' && !it.dropped && it.state === 'ready') || (it.plan || []).some((e) => e.state === 'posted'))).slice(-600);
      const url = await adsLink(keep), ins = require('./_lib/content-insights').itemInsights(list, now);
      res.status(200).json({ items: keep.map((it) => view(it, url, ins)), today: P.roDay(now) });
      return;
    } else if (b.action === 'captions') {
      await C.setCaptions(String(b.id || ''), b.captions);
    } else if (b.action === 'post_now') {
      if (!isNet(b.net)) { res.status(400).json({ error: 'invalid_net' }); return; }
      const r = await require('./_lib/content-post').now(String(b.id || ''), b.net);
      res.status(200).json(Object.assign(await payload(), { result: r }));
      return;
    } else if (b.action === 'app_posted' || b.action === 'app_link' || b.action === 'app_snooze' || b.action === 'app_skip') {
      // De postat: the owner's taps on a card (content-app.js)
      if (!isNet(b.net)) { res.status(400).json({ error: 'invalid_net' }); return; }
      const A = require('./_lib/content-app'), id = String(b.id || ''), by = session.username || session.employeeId || '';
      const r = b.action === 'app_posted' ? await A.posted(id, b.net, b.link, by) : b.action === 'app_link' ? await A.setLink(id, b.net, b.link)
        : b.action === 'app_snooze' ? await A.snooze(id, b.net) : await A.skipSlot(id, b.net, b.reason, by);
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
