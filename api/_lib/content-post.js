// Conținut: the clock posts what is due (api/automation-tick.js, every hour at :17), through the Page's connection
// (Integrări → Facebook: the Page's token, its Instagram account). Also „Postează acum” from Admin → Conținut.
// Only what the owner approved, and only while the switch is on (the owner, 12.11: the week is approved on Sunday);
// each network gets its own text (captions, the caption when one is missing).
//  - Instagram: a container (REELS / CAROUSEL / STORIES) made from the file's public URL (api/content-file.js), then
//    its status until FINISHED (a reel takes a minute or more: the container is kept in the entry and the next run
//    picks it up), then media_publish and the permalink.
//  - Facebook: a reel through the Page's video_reels (start, the file's URL to rupload, finish PUBLISHED); a carousel
//    as unpublished photos attached to one post; a story through video_stories / photo_stories.
//  - A Meta error: its message is kept, tried again on the next runs, after 3 tries 'error' and the admins hear once.
//  - A missing permission (pages_manage_posts, instagram_content_publish) or a lost connection: the entry stays
//    'planned' (no try is spent), Admin → Conținut says what is missing, the owner hears once.

const { readJSON, writeJSON } = require('./store');
const { loadConnection, appCreds } = require('./facebook');
const ads = require('./meta-ads');
const C = require('./content');
const P = require('./content-plan');

const GRAPH_VER = 'v25.0'; // the same as api/_lib/meta-ads.js
const RUPLOAD = 'https://rupload.facebook.com/video-upload/' + GRAPH_VER + '/';
const NEEDS = { ig: ['instagram_content_publish'], fb: ['pages_manage_posts'] };
const STATS_NEEDS = ['instagram_manage_insights', 'read_insights'];
const MAX_TRIES = 3;
const STUCK_MS = 3 * 3600e3;
const LOCK_MS = 3 * 60e3;
const NAMES = { ig: 'Instagram', fb: 'Facebook', tt: 'TikTok', yt: 'YouTube' };
const g = (method, path, token, params) => ads.call(method, path, token, params);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const metaMsg = (j) => { const e = (j && j.error) || {}; return String(e.error_user_msg || e.message || 'Meta n-a răspuns').slice(0, 300); };
// a permission or the login itself: nothing to try again until the owner reconnects
const isAccess = (j) => { const e = (j && j.error) || {}; const c = Number(e.code); return c === 10 || c === 190 || (c >= 200 && c < 300) || /permission|not authorized|access token/i.test(String(e.message || '')); };
// a file's public URL, with its version (a file made again is a new URL: no cache serves the old one)
const url = (it, f) => C.fileUrl(it.id, f.name, f.v);
class Stop extends Error { constructor(msg, access) { super(msg); this.access = !!access; } }
const must = (r, what) => { if (!r.ok || (r.j && r.j.error)) throw new Stop(what + ': ' + metaMsg(r.j), isAccess(r.j)); return r.j || {}; };

// the connection, the Instagram account and what the token may do (memoised a few minutes per instance)
let memo = { at: 0, v: null };
async function access(fresh) {
  if (!fresh && memo.v && Date.now() - memo.at < 5 * 60e3) return memo.v;
  const [conn, creds] = await Promise.all([loadConnection(readJSON), appCreds(readJSON)]);
  if (!conn.pageId) { memo = { at: Date.now(), v: { connected: false, missing: NEEDS.fb.concat(NEEDS.ig, STATS_NEEDS) } }; return memo.v; }
  const tok = conn.pageAccessToken;
  const ig = await g('GET', '/' + conn.pageId, tok, { fields: 'instagram_business_account{id,username}' }).catch(() => ({ ok: false, j: {} }));
  const acct = ig.ok && ig.j && ig.j.instagram_business_account ? ig.j.instagram_business_account : null;
  let scopes = null;
  if (creds.appId && creds.appSecret) {
    const d = await g('GET', '/debug_token', creds.appId + '|' + creds.appSecret, { input_token: tok }).catch(() => ({ ok: false }));
    if (d.ok && d.j && d.j.data && Array.isArray(d.j.data.scopes)) scopes = d.j.data.scopes;
  }
  const all = NEEDS.fb.concat(NEEDS.ig, STATS_NEEDS);
  const v = { connected: true, pageId: conn.pageId, token: tok, igId: acct ? String(acct.id) : '', igUser: acct ? acct.username || '' : '', scopes,
    missing: scopes ? all.filter((s) => !scopes.includes(s)) : [] };
  memo = { at: Date.now(), v };
  return v;
}
// why a network can't post now ('' when it can)
function blocked(a, net) {
  if (net === 'tt' || net === 'yt') return 'Postarea pe ' + NAMES[net] + ' nu e legată încă';
  if (!a.connected) return 'Facebook nu e conectat (Integrări)';
  if (net === 'ig' && !a.igId) return 'Pagina nu are un cont de Instagram legat';
  const miss = a.scopes ? NEEDS[net].filter((s) => !a.scopes.includes(s)) : [];
  return miss.length ? 'Lipsește permisiunea ' + miss.join(', ') : '';
}

// ---------------------------------------------------------------- Instagram
async function igContainer(a, it, m) {
  const ig = '/' + a.igId + '/media', tok = a.token;
  if (it.kind === 'reel') {
    const p = { media_type: 'REELS', video_url: url(it, m.video), caption: C.captionFor(it, 'ig'), share_to_feed: 'true' };
    if (m.cover) p.cover_url = url(it, m.cover);
    return must(await g('POST', ig, tok, p), 'Containerul reel').id;
  }
  if (it.kind === 'carousel') {
    const kids = [];
    for (const f of m.images) kids.push(must(await g('POST', ig, tok, { image_url: url(it, f), is_carousel_item: 'true' }), 'Poza ' + f.name).id);
    return must(await g('POST', ig, tok, { media_type: 'CAROUSEL', children: kids.join(','), caption: C.captionFor(it, 'ig') }), 'Containerul carusel').id;
  }
  const p = { media_type: 'STORIES' };
  if (m.video) p.video_url = url(it, m.video); else p.image_url = url(it, m.images[0]);
  return must(await g('POST', ig, tok, p), 'Containerul story').id;
}
// the container until FINISHED (within `waitMs`), then published: { done } / { wait: container }
async function igPost(a, it, e, waitMs) {
  const m = C.media(it);
  const container = e.container || (await igContainer(a, it, m));
  const until = Date.now() + Math.max(0, waitMs);
  for (;;) {
    const s = must(await g('GET', '/' + container, a.token, { fields: 'status_code,status' }), 'Starea containerului');
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Stop('Instagram n-a procesat fișierul: ' + String(s.status || s.status_code).slice(0, 200));
    if (Date.now() + 5000 > until) return { wait: container };
    await sleep(5000);
  }
  const pub = must(await g('POST', '/' + a.igId + '/media_publish', a.token, { creation_id: container }), 'Publicarea');
  const link = await g('GET', '/' + pub.id, a.token, { fields: 'permalink' }).catch(() => ({ ok: false }));
  return { done: { postId: String(pub.id), url: (link.ok && link.j && link.j.permalink) || '' } };
}

// ---------------------------------------------------------------- Facebook
async function rupload(a, videoId, url) {
  const r = await fetch(RUPLOAD + videoId, { method: 'POST', headers: { Authorization: 'OAuth ' + a.token, file_url: url } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Stop('Urcarea video: ' + metaMsg(j), isAccess(j));
}
async function fbPost(a, it) {
  const m = C.media(it), page = '/' + a.pageId, tok = a.token;
  if (it.kind === 'reel') {
    const s = must(await g('POST', page + '/video_reels', tok, { upload_phase: 'start' }), 'Pornirea reel-ului');
    const vid = String(s.video_id || '');
    if (!vid) throw new Stop('Pornirea reel-ului: Meta n-a dat un video_id');
    await rupload(a, vid, url(it, m.video));
    must(await g('POST', page + '/video_reels', tok, { upload_phase: 'finish', video_id: vid, video_state: 'PUBLISHED', description: C.captionFor(it, 'fb') }), 'Publicarea reel-ului');
    return { postId: vid, url: 'https://www.facebook.com/reel/' + vid };
  }
  if (it.kind === 'carousel') {
    const ids = [];
    for (const f of m.images) ids.push(must(await g('POST', page + '/photos', tok, { url: url(it, f), published: 'false' }), 'Poza ' + f.name).id);
    const post = must(await g('POST', page + '/feed', tok, { message: C.captionFor(it, 'fb'), attached_media: ids.map((id) => ({ media_fbid: id })) }), 'Postarea');
    const link = await g('GET', '/' + post.id, tok, { fields: 'permalink_url' }).catch(() => ({ ok: false }));
    return { postId: String(post.id), url: (link.ok && link.j && link.j.permalink_url) || '' };
  }
  if (m.video) {
    const s = must(await g('POST', page + '/video_stories', tok, { upload_phase: 'start' }), 'Pornirea story-ului');
    const vid = String(s.video_id || '');
    if (!vid) throw new Stop('Pornirea story-ului: Meta n-a dat un video_id');
    await rupload(a, vid, url(it, m.video));
    const f = must(await g('POST', page + '/video_stories', tok, { upload_phase: 'finish', video_id: vid }), 'Publicarea story-ului');
    return { postId: String(f.post_id || vid), url: '' };
  }
  const ph = must(await g('POST', page + '/photos', tok, { url: url(it, m.images[0]), published: 'false' }), 'Poza story-ului');
  const f = must(await g('POST', page + '/photo_stories', tok, { photo_id: ph.id }), 'Publicarea story-ului');
  return { postId: String(f.post_id || ph.id), url: '' };
}

// ---------------------------------------------------------------- one entry
const entryOf = (list, id, net) => { const it = C.findItem(list, id); return it ? { it, e: (it.plan || []).find((x) => x.net === net) } : {}; };
// takes the entry for this run (two runs at once never post it twice): false when another run has it
async function claim(id, net, force) {
  const { out } = await C.update((list) => {
    const { e } = entryOf(list, id, net);
    if (!e) return false;
    const now = Date.now();
    if (e.lock && now - Date.parse(e.lock) < LOCK_MS) return false;
    if (e.state !== 'planned' && e.state !== 'posting' && !(force && e.state === 'error')) return false;
    // nothing starts without the owner's approval (one already started finishes)
    const it = C.findItem(list, id);
    if (e.state !== 'posting' && (!it || it.review !== 'approved' || it.state !== 'ready')) return false;
    e.lock = new Date(now).toISOString();
    if (e.state !== 'posting') { e.state = 'posting'; e.startedAt = e.lock; }
    return true;
  });
  return out === true;
}
async function finish(id, net, fn) {
  const { out } = await C.update((list) => { const { it, e } = entryOf(list, id, net); if (!e) return false; delete e.lock; return fn(e, it) || true; });
  return out;
}

async function postOne(a, id, net, waitMs) {
  const list = await C.items();
  const { it, e } = entryOf(list, id, net);
  if (!e) return { id, net, skipped: 'gone' };
  try {
    if (e.state === 'posting' && e.startedAt && Date.now() - Date.parse(e.startedAt) > STUCK_MS) throw new Stop('Instagram n-a terminat procesarea în 3 ore');
    let done = null;
    if (net === 'ig') {
      const r = await igPost(a, it, e, waitMs);
      if (r.wait) { await finish(id, net, (x) => { x.state = 'posting'; x.container = r.wait; }); return { id, net, waiting: r.wait }; }
      done = r.done;
    } else done = await fbPost(a, it);
    await finish(id, net, (x) => { Object.assign(x, { state: 'posted', postedAt: new Date().toISOString(), postId: done.postId, url: done.url, error: '' }); delete x.container; delete x.hold; delete x.retryAt; });
    return { id, net, posted: done.postId };
  } catch (err) {
    const msg = String((err && err.message) || err).slice(0, 300);
    if (err instanceof Stop && err.access) {
      await finish(id, net, (x) => { x.state = 'planned'; x.hold = msg; delete x.container; });
      return { id, net, hold: msg };
    }
    let failed = false;
    await finish(id, net, (x) => {
      x.tries = (x.tries || 0) + 1; x.error = msg; delete x.container;
      if (x.tries >= MAX_TRIES) { x.state = 'error'; failed = !x.notified; x.notified = true; }
      else { x.state = 'planned'; x.retryAt = new Date(Date.now() + 45 * 60e3).toISOString(); }
    });
    if (failed) await tell('ct-' + id + '-' + net, 'CONȚINUT NEPUBLICAT ⚠️', NAMES[net] + ': ' + (it.topic || it.rubric || it.kind) + '. ' + msg);
    return { id, net, error: msg };
  }
}
async function tell(tag, title, text) {
  try {
    const N = require('./notify'), store = { readJSON, writeJSON };
    await N.notifyMany(store, await N.adminIds(store), { kind: 'alert', tone: 'bad', go: 'continut', tag, title, text });
  } catch (e) { console.error('content notify:', e.message); }
}
// a held network: the entry keeps its place, the owner hears once per reason
async function hold(id, net, why) {
  await C.update((list) => { const { e } = entryOf(list, id, net); if (!e || e.hold === why) return false; e.hold = why; });
}

// The clock: the plans kept right, then what is due, within the time it has. opts.budgetMs (default 30 s).
async function run(opts) {
  opts = opts || {};
  const t0 = Date.now(), budget = opts.budgetMs || 30e3;
  const st = await C.settings();
  await C.items(); // the items from before the weekly model get their week (once)
  // the plans follow the switch, the networks and the time (stale approved entries to the next free slot of their week)
  await C.update((list) => (P.reflow(list, st, Date.now()) ? undefined : false));
  // the owner hears when next week's batch is ready, on Sunday what still waits for him, and when redone items are back
  const told = await C.notices().catch((e) => { console.error('content notices:', e.message); return []; });
  if (!st.on) return Object.assign({ off: true }, told.length ? { told } : {});
  const todo = P.due(await C.items(), st, Date.now());
  if (!todo.length) return { due: 0 };
  const a = await access(true);
  const out = { due: todo.length, done: [] };
  const holds = new Set();
  for (const { it, e } of todo) {
    if (Date.now() - t0 > budget) { out.left = (out.left || 0) + 1; continue; }
    const why = blocked(a, e.net);
    if (why) { holds.add(why); await hold(it.id, e.net, why); out.done.push({ id: it.id, net: e.net, hold: why }); continue; }
    if (!(await claim(it.id, e.net))) continue;
    const r = await postOne(a, it.id, e.net, Math.min(40e3, Math.max(0, budget - (Date.now() - t0) - 5e3)));
    if (r.hold) holds.add(r.hold);
    out.done.push(r);
  }
  // the owner hears once what holds the posts (a permission, the connection)
  if (holds.size) {
    const s = await C.readState(), note = [...holds].sort().join(' · ');
    if (s.holdNote !== note) { s.holdNote = note; await C.writeState(s); await tell('ct-hold', 'CONȚINUTUL AȘTEAPTĂ ⚠️', note); }
  } else if (out.done.some((r) => r.posted)) {
    const s = await C.readState();
    if (s.holdNote) { s.holdNote = ''; await C.writeState(s); }
  }
  return out;
}

// „Postează acum” (Admin → Conținut): this item on this network, now, whatever its slot (an error starts over)
async function now(id, net) {
  const st = await C.settings();
  if (!st.on) throw C.fail('paused', 409);
  if (!st.nets[net]) throw C.fail('net_off');
  const a = await access(true);
  const why = blocked(a, net);
  if (why) return { id, net, hold: why };
  const { out } = await C.update((list) => {
    const { it, e } = entryOf(list, id, net);
    if (!it || it.state !== 'ready' || it.removed) throw C.fail('not_found', 404);
    if (it.review !== 'approved') throw C.fail('not_approved', 409);
    if (!e) {
      if (!P.netsFor(it.kind).includes(net)) throw C.fail('net_not_for_kind');
      it.plan.push({ net, kind: P.kindOn(it, net), at: new Date().toISOString(), state: 'planned' });
      return true;
    }
    if (e.state === 'posted') throw C.fail('already_posted', 409);
    if (e.state === 'posting') return true;
    Object.assign(e, { state: 'planned', at: new Date().toISOString(), tries: 0, error: '' });
    delete e.retryAt; delete e.notified; delete e.hold;
    return true;
  });
  if (!out) throw C.fail('not_found', 404);
  if (!(await claim(id, net, true))) return { id, net, busy: true };
  return postOne(a, id, net, 40e3);
}

module.exports = { run, now, access, blocked, NEEDS, STATS_NEEDS, NAMES, GRAPH_VER };
