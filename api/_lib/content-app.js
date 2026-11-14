// Conținut, „Postare din aplicație” (the owner, 14.11: he posts the reels himself, from each app, so he can pick a
// licensed trending sound there). For the networks in 'app' mode (settings.modes, Conținut → Setări; the default for
// all four; 'auto' keeps the API poster, content-post.js):
//  - The same schedule, quotas and rotation as the API (content-plan.js). When a slot comes due (the hourly clock,
//    api/automation-tick.js → content-post.js run(), only while the switch is on; due = within the next 30 minutes,
//    so the clock at :17 brings each slot between 30 minutes early and 30 minutes late), nothing is posted: the entry
//    becomes 'todo', shows in „De postat” at the top of Admin → Conținut, and the owner gets ONE push („Reel de postat
//    pe TikTok: <titlu>”) that opens its card. The switch to 'todo' and `toldAt` are written in one conditional write
//    before the push, so two runs never tell the same slot twice.
//  - The card (portal-continut.js) shares the CLEAN MP4 (role 'clean': voice and sound effects, no music; he adds the
//    licensed sound inside the app) or the carousel's photos, copies the network's text (YouTube: the title) and the
//    first comment (the one the API would post, content-post.js firstComment()).
//  - „Am postat” (the post's link optional): recorded like an API post (state 'posted', postedAt, postId from the
//    link, manual: true), so the rotation, the history and the insights treat it as posted. „Nu pot acum”: the card
//    waits until later today (2 hours, at most 22:00; after 21:30, 9:00 the next morning), then comes back with one
//    reminder. „Sari peste” (with a reason): the slot is skipped and the entry
//    moves to its network's next free slot in its week, from tomorrow on (never a day the item is on another network);
//    none left: skipped for the week. Every skip is kept in `skips`.
//  - The numbers (match(), from content-stats.js run, every hour): a link gives the post's id (TikTok, YouTube,
//    Facebook reels; Instagram's short code is looked up among the account's latest posts; a short link is followed
//    to where it leads). Without one: the network's latest posts, the ones from 2 hours before the card came to 2
//    hours after „Am postat”, whose first line of text is the first line of ours. Exactly one that fits on both is
//    taken; two that fit („ambiguous”) or none in 48 hours („none”) and the entry is marked clearly as without numbers,
//    until a link comes („Adaugă linkul”, setLink()). Nothing is guessed.
// The entry's fields (content.js): todoAt, toldAt, snoozeUntil, snoozes, remindedAt, manual, markedAt, by, match: {
//   state: pending|matched|ambiguous|none, how: link|time+text, at, tries, note, code }, netAt, skips: [{ at, reason,
//   skippedAt, by }], skipNote.

const { readJSON, writeJSON } = require('./store');
const C = require('./content');
const P = require('./content-plan');
const { dedash } = require('./dedash');

const SNOOZE_MS = 2 * 3600e3;
const MATCH_MS = 48 * 3600e3;
const WIN_BEFORE_MS = 2 * 3600e3;
const WIN_AFTER_MS = 2 * 3600e3;
const NAMES = C.NET_NAME;
const KIND_WORD = { reel: 'Reel', carousel: 'Carusel', slideshow: 'Slideshow' };
const HINT = 'Pune sunetul din aplicație (de ex. Free · Ultra Naté), la volum mic';
const iso = (ms) => new Date(ms).toISOString();
const hm = (ms) => new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
const titleOf = (it) => String(it.topic || it.rubric || KIND_WORD[it.kind] || 'Material');
const kindOf = (it, e) => e.kind || P.kindOn(it, e.net);
// does the post take a sound in the app (a Facebook carousel is photos in the feed)
const sounded = (kind, net) => !(net === 'fb' && kind === 'carousel');
const usable = (it) => !!it && !it.removed && !it.dropped && it.state === 'ready' && P.review(it) === 'approved';
// the entry of an item on a network (one per network: the plan never puts an item twice on one)
const entryOf = (it, net) => (it.plan || []).find((e) => e.net === net && e.state === 'todo') || (it.plan || []).find((e) => e.net === net) || null;

// ---------------------------------------------------------------- the clock: what came due becomes De postat
// Changes `list` in place: the 'app' entries due now become 'todo'; a card put off comes back. → [{ id, net, kind,
// title, at, again, until }] (the ones to tell, once each)
function step(list, settings, now) {
  const st = P.settingsOf(settings);
  const out = [];
  P.appDue(list, st, now).forEach(({ it, e }) => {
    e.state = 'todo'; e.todoAt = iso(now); e.toldAt = iso(now);
    delete e.snoozeUntil; delete e.hold;
    out.push({ id: it.id, net: e.net, kind: kindOf(it, e), title: titleOf(it), at: e.at, again: false });
  });
  (list || []).forEach((it) => (it.plan || []).forEach((e) => {
    if (e.state !== 'todo' || !e.snoozeUntil || !usable(it)) return;
    const t = Date.parse(e.snoozeUntil);
    if (!(t <= now + P.APP_LEAD_MS)) return;
    const until = e.snoozeUntil;
    delete e.snoozeUntil; e.remindedAt = iso(now);
    out.push({ id: it.id, net: e.net, kind: kindOf(it, e), title: titleOf(it), at: e.at, again: true, until });
  }));
  return out;
}
// one push per slot (and one when a card put off comes back), opening its card
async function tell(x) {
  try {
    const N = require('./notify'), store = { readJSON, writeJSON };
    const title = (KIND_WORD[x.kind] || 'Material') + ' de postat pe ' + NAMES[x.net] + ': ' + x.title;
    const how = sounded(x.kind, x.net) ? 'Distribuie-l din Conținut și pune sunetul din aplicație.' : 'Distribuie pozele din Conținut.';
    const text = (x.again ? 'Revine, cum ai cerut. ' : 'Ora ' + hm(Date.parse(x.at)) + '. ') + how;
    const tag = 'ct-app-' + x.id + '-' + x.net + '-' + Date.parse(x.at) + (x.again ? '-r' + Date.parse(x.until) : '');
    return await N.notifyMany(store, await N.ownerIds(store), { kind: 'post', tone: 'info', go: 'continut/de-postat~' + x.id + '~' + x.net, tag, title, text });
  } catch (e) { console.error('content app notify:', e.message); return 0; }
}
// content-post.js run(), while the switch is on: what came due, written first, then told
async function run(settings, nowMs) {
  const now = nowMs || Date.now();
  const st = P.settingsOf(settings || (await C.settings()));
  if (!st.on) return { off: true };
  if (!P.NETS.some((n) => P.isApp(st, n))) return { todo: 0 };
  const { out } = await C.update((list) => { const r = step(list, st, now); return r.length ? r : false; });
  const told = Array.isArray(out) ? out : [];
  for (const x of told) await tell(x);
  return { todo: told.filter((x) => !x.again).length, back: told.filter((x) => x.again).length };
}

// ---------------------------------------------------------------- the card's texts
// what „Copiază textul” and „Copiază primul comentariu” give: the network's text with its hashtags (YouTube: the
// title, with #shorts, as the API would set it) and the comment the API would post first
function copyOf(it, net) {
  let text = '';
  if (net === 'yt') text = require('./content-yt').textsOf(it).title;
  else text = C.captionFor(it, net).trim();
  let comment = '';
  try { comment = require('./content-post').firstComment(it); } catch (e) { comment = String(it.firstComment || ''); }
  return { text, comment, hint: sounded(P.kindOn(it, net), net) ? HINT : '' };
}

// ---------------------------------------------------------------- the post's link
const okYt = (x) => /^[\w-]{11}$/.test(String(x || ''));
const shorts = (id) => 'https://www.youtube.com/shorts/' + id;
// a link the owner pasted, read for its network: { url, postId?, code? (Instagram), post? (a Facebook post number),
// short? (a short link to follow) }; null: not a link of this network
function parseLink(net, raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch (e) { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const full = u.hostname.toLowerCase(), host = full.replace(/^(www|m|mobile|web|mbasic)\./, '');
  const path = u.pathname.replace(/\/{2,}/g, '/');
  if (net === 'tt') {
    if (!/(^|\.)tiktok\.com$/.test(host)) return null;
    const m = /\/(?:video|photo)\/(\d{6,25})/.exec(path);
    if (m) return { url: 'https://www.tiktok.com' + path.replace(/\/+$/, ''), postId: m[1] };
    return { url: u.href, short: /^(vm|vt)\.tiktok\.com$/.test(full) || /^\/t\//.test(path) };
  }
  if (net === 'yt') {
    if (host === 'youtu.be') { const id = path.slice(1).split('/')[0]; return okYt(id) ? { url: shorts(id), postId: id } : null; }
    if (!/(^|\.)youtube\.com$/.test(host)) return null;
    const m = /^\/(?:shorts|live|embed|v)\/([\w-]{11})/.exec(path);
    if (m) return { url: shorts(m[1]), postId: m[1] };
    const v = u.searchParams.get('v');
    if (okYt(v)) return { url: shorts(v), postId: v };
    const s = /\/video\/([\w-]{11})/.exec(path); // studio.youtube.com/video/<id>/edit
    if (s) return { url: shorts(s[1]), postId: s[1] };
    return { url: u.origin + path };
  }
  if (net === 'ig') {
    if (!/(^|\.)instagram\.com$/.test(host) && host !== 'instagr.am') return null;
    const m = /\/(reels?|p|tv)\/([\w-]{5,40})/.exec(path);
    if (m) return { url: 'https://www.instagram.com/' + (m[1] === 'p' ? 'p' : 'reel') + '/' + m[2] + '/', code: m[2] };
    return { url: u.origin + path };
  }
  if (net === 'fb') {
    if (!/(^|\.)(facebook\.com|fb\.com|fb\.watch)$/.test(host)) return null;
    const m = /\/reels?\/(\d{6,25})/.exec(path) || /\/videos\/(?:[\w.-]+\/)?(\d{6,25})/.exec(path);
    if (m) return { url: 'https://www.facebook.com/reel/' + m[1], postId: m[1] };
    const v = u.searchParams.get('v');
    if (/^\d{6,25}$/.test(v || '')) return { url: 'https://www.facebook.com/reel/' + v, postId: v };
    const story = u.searchParams.get('story_fbid'), pid = u.searchParams.get('id');
    if (/^\d{6,25}$/.test(story || '')) return { url: u.href, post: story, page: /^\d+$/.test(pid || '') ? pid : '' };
    const p = /\/posts\/(\d{6,25})/.exec(path);
    if (p) return { url: u.origin + path, post: p[1] };
    return { url: /^\/(share|story\.php|permalink\.php)/.test(path) ? u.href : u.origin + path, short: host === 'fb.watch' || /^\/share\//.test(path) };
  }
  return null;
}
// a short link (vm.tiktok.com, tiktok.com/t/…, facebook.com/share/…, fb.watch): where it leads, followed until the
// address says the post (its id or code) or for 6 seconds at most ('' when it never moved); Facebook's login page
// keeps it in `next`
async function expand(url, net) {
  let cur = url;
  const until = Date.now() + 6000;
  const says = (u) => { const r = net ? parseLink(net, u) : null; return !!(r && (r.postId || r.code || r.post)); };
  for (let i = 0; i < 5 && Date.now() < until; i++) {
    let r;
    try { r = await fetch(cur, { method: 'GET', redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Centrul360)' }, signal: AbortSignal.timeout(Math.max(500, until - Date.now())) }); }
    catch (e) { return i ? cur : ''; }
    const loc = r.headers.get('location');
    if (!(r.status >= 300 && r.status < 400) || !loc) return i ? cur : '';
    cur = new URL(loc, cur).href;
    try { const n = new URL(cur).searchParams.get('next'); if (n && /facebook\.com$/.test(new URL(cur).hostname)) cur = new URL(n, cur).href; } catch (e) { /* keep it */ }
    if (says(cur)) return cur;
  }
  return cur === url ? '' : cur;
}
// the entry as the link says: its address and, when the link has it, the post's id
function applyLink(e, ref, now) {
  e.url = ref ? ref.url : '';
  e.postId = ref && ref.postId ? ref.postId : '';
  e.match = e.postId ? { state: 'matched', how: 'link', at: iso(now) } : { state: 'pending', at: iso(now), tries: 0 };
  if (ref && ref.code) e.match.code = ref.code;
  if (ref && ref.post) e.match.post = ref.post + (ref.page ? '|' + ref.page : '');
  if (ref && !ref.postId && !ref.code && !ref.post) e.match.link = ref.url;
}
const linkOf = (net, link) => {
  const s = String(link == null ? '' : link).trim();
  if (!s) return null;
  const ref = parseLink(net, s);
  if (!ref) throw C.fail('invalid_link');
  return ref;
};

// ---------------------------------------------------------------- the owner's taps (Admin → Conținut, De postat)
function find(list, id, net) {
  const it = C.findItem(list, id);
  const e = it && !it.removed ? entryOf(it, net) : null;
  if (!it || !e) throw C.fail('not_found', 404);
  return { it, e };
}
const check = (id, net) => { if (!C.isId(id)) throw C.fail('invalid_id'); if (!P.NETS.includes(net)) throw C.fail('invalid_net'); };
// „Am postat”: posted now, by the owner, with the post's link when he gave one
async function posted(id, net, link, by, nowMs) {
  check(id, net);
  const ref = linkOf(net, link);
  const now = nowMs || Date.now(), at = iso(now);
  const { out } = await C.update((list) => {
    const { e } = find(list, id, net);
    if (e.state === 'posted') return { already: true, match: (e.match || {}).state || '' };
    if (e.state !== 'todo') throw C.fail('not_todo', 409);
    Object.assign(e, { state: 'posted', postedAt: at, markedAt: at, manual: true, error: '' });
    if (by) e.by = String(by).slice(0, 60);
    delete e.snoozeUntil; delete e.hold; delete e.retryAt; delete e.lock;
    applyLink(e, ref, now);
    return { posted: true, match: e.match.state };
  });
  return out;
}
// „Adaugă linkul”, on a post made from the app: the numbers follow that post (a new post: the old numbers go)
async function setLink(id, net, link, nowMs) {
  check(id, net);
  const ref = linkOf(net, link);
  if (!ref) throw C.fail('invalid_link');
  const now = nowMs || Date.now();
  const { out } = await C.update((list) => {
    const { it, e } = find(list, id, net);
    if (e.state !== 'posted' || !e.manual) throw C.fail('not_manual', 409);
    const was = e.postId || '';
    applyLink(e, ref, now);
    if (was && was !== e.postId) {
      if (it.stats) delete it.stats[net];
      if (it.snaps) delete it.snaps[net];
      delete e.netAt;
      e.postedAt = e.markedAt || e.postedAt;
    }
    return { match: e.match.state };
  });
  return out;
}
// later today: 2 hours on, at most 22:00 (Bucharest); after 21:30 the next morning at 9:00 (no reminder at night)
function snoozeTo(now) {
  const day = P.roDay(now), late = P.atRo(day, '22:00');
  if (now + SNOOZE_MS <= late) return now + SNOOZE_MS;
  if (now + 30 * 60e3 <= late) return late;
  return P.atRo(P.addDays(day, 1), '09:00');
}
// „Nu pot acum”: the card waits until later today (one reminder when it comes back)
async function snooze(id, net, nowMs) {
  check(id, net);
  const now = nowMs || Date.now();
  const { out } = await C.update((list) => {
    const { e } = find(list, id, net);
    if (e.state !== 'todo') throw C.fail('not_todo', 409);
    e.snoozeUntil = iso(snoozeTo(now)); e.snoozes = (e.snoozes || 0) + 1;
    return { until: e.snoozeUntil };
  });
  return out;
}
// „Sari peste”: this slot is skipped (with the reason); the entry goes to the network's next free slot of its week,
// from tomorrow on, or is skipped for the week
async function skipSlot(id, net, reason, by, nowMs) {
  check(id, net);
  const why = dedash(String(reason == null ? '' : reason)).replace(/\s+/g, ' ').trim().slice(0, 140);
  if (why.length < 2) throw C.fail('reason_required');
  const now = nowMs || Date.now();
  const st = await C.settings();
  const { out } = await C.update((list) => {
    const { it, e } = find(list, id, net);
    if (e.state !== 'todo') throw C.fail('not_todo', 409);
    const rec = { at: e.at, reason: why, skippedAt: iso(now) };
    if (by) rec.by = String(by).slice(0, 60);
    e.skips = (e.skips || []).concat(rec).slice(-6);
    delete e.todoAt; delete e.toldAt; delete e.snoozeUntil; delete e.remindedAt; delete e.snoozes;
    const to = P.nextSlot(list, it, e, st, now, P.addDays(P.roDay(now), 1));
    if (to) { Object.assign(e, { state: 'planned', at: iso(to.t), slot: to.slot, moved: (e.moved || 0) + 1 }); return { moved: e.at }; }
    Object.assign(e, { state: 'skipped', skippedAt: iso(now), skipNote: why });
    return { skipped: true };
  });
  return out;
}

// ---------------------------------------------------------------- the numbers: which post it was
// a first line as it compares: no diacritics, hashtags, mentions, emoji or punctuation
const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function firstLine(s) {
  const line = String(s == null ? '' : s).split('\n').map((x) => x.trim()).find(Boolean) || '';
  return fold(line.replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/@[\w.]+/g, ' ')).replace(/[^a-z0-9]+/g, ' ').trim();
}
// the same first line: equal, one the start of the other (16 letters at least), or the same words (4 at least, 80%)
function sameText(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length >= 16 && l.startsWith(s)) return true;
  const wa = new Set(a.split(' ')), wb = new Set(b.split(' '));
  if (wa.size < 4 || wb.size < 4) return false;
  const inter = [...wa].filter((w) => wb.has(w)).length;
  return inter / new Set([...wa, ...wb]).size >= 0.8;
}
const tsOf = (s) => Date.parse(String(s || '').replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
const bare = (u) => String(u || '').replace(/^https?:\/\/(www\.|m\.|web\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
const codeIn = (u) => { const m = /\/(?:reels?|p|tv)\/([\w-]{5,40})/.exec(String(u || '')); return m ? m[1] : ''; };
const abs = (u) => (/^\//.test(String(u || '')) ? 'https://www.facebook.com' + u : String(u || ''));
// a network's latest posts: [{ id, at (ms), text, url }] newest first, or null (not connected, no answer)
async function recentOf(net, kind) {
  if (net === 'yt' || net === 'tt') {
    const list = await (net === 'yt' ? require('./content-yt') : require('./content-tt')).recent(net === 'yt' ? 25 : 20);
    return list ? list.map((p) => ({ id: String(p.id), at: tsOf(p.at), text: p.text || '', url: p.url || '' })) : null;
  }
  const a = await require('./content-post').access();
  if (!a.connected || (net === 'ig' && !a.igId)) return null;
  const ads = require('./meta-ads');
  let r;
  if (net === 'ig') r = await ads.call('GET', '/' + a.igId + '/media', a.token, { fields: 'id,caption,timestamp,permalink,media_product_type', limit: '50' });
  else if (kind === 'reel') r = await ads.call('GET', '/' + a.pageId + '/video_reels', a.token, { fields: 'id,description,created_time,permalink_url', limit: '25' });
  else r = await ads.call('GET', '/' + a.pageId + '/posts', a.token, { fields: 'id,message,created_time,permalink_url', limit: '25' });
  if (!r || !r.ok || !r.j || !Array.isArray(r.j.data)) return null;
  return r.j.data.map((p) => ({ id: String(p.id), at: tsOf(p.timestamp || p.created_time), text: p.caption || p.description || p.message || '', url: abs(p.permalink || p.permalink_url) }));
}
const WAIT_NOTE = { tt: 'TikTok nu e conectat cu video.list (Integrări)', yt: 'YouTube nu e conectat (Integrări)', ig: 'Instagram nu e conectat (Integrări → Facebook)', fb: 'Facebook nu e conectat (Integrări)' };
// one entry: { matched: { postId, url, at?, how } } | { ambiguous: n } | { none: note } | { wait: note }
async function resolveOne(it, e, posts, used, now, pageOf) {
  const m = e.match || {};
  const expired = now - Date.parse(e.markedAt || e.postedAt) > MATCH_MS;
  const later = (note) => (expired ? { none: note } : { wait: note });
  const take = (p, how) => ({ matched: { postId: p.id, url: p.url || e.url || '', at: Number.isFinite(p.at) ? p.at : null, how } });
  let code = m.code || '';
  // a short link: where it leads
  if (e.url && !code && !m.post) {
    const ref = parseLink(e.net, e.url);
    if (ref && ref.short) {
      const long = await expand(e.url, e.net);
      const r2 = long ? parseLink(e.net, long) : null;
      if (r2 && r2.postId) return { matched: { postId: r2.postId, url: r2.url, at: null, how: 'link' } };
      if (r2 && r2.code) code = r2.code;
      if (r2 && r2.post) m.post = r2.post;
    }
  }
  // a Facebook post's number: the Page's id before it
  if (e.net === 'fb' && m.post) {
    const [num, page] = String(m.post).split('|');
    const pid = page || (await pageOf());
    if (pid) return { matched: { postId: pid + '_' + num, url: e.url, at: null, how: 'link' } };
  }
  const list = await posts(e.net, kindOf(it, e));
  if (!list) return later(WAIT_NOTE[e.net]);
  // Instagram's short code: that post or none (a link is never overruled by a guess)
  if (code) {
    const hit = list.find((p) => codeIn(p.url) === code);
    return hit ? take(hit, 'link') : later('Postarea din link nu e printre ultimele de pe Instagram');
  }
  // a link that doesn't say the id: by its address
  if (e.url) {
    const hit = list.find((p) => p.url && bare(p.url) === bare(e.url));
    if (hit) return take(hit, 'link');
  }
  // the time and the first line of the text
  const want = firstLine(e.net === 'yt' ? require('./content-yt').textsOf(it).title : C.captionFor(it, e.net));
  if (!want) return later('Textul postării e gol: lipește linkul');
  const from = Date.parse(e.todoAt || e.at) - WIN_BEFORE_MS, to = Date.parse(e.markedAt || e.postedAt) + WIN_AFTER_MS;
  const fit = list.filter((p) => Number.isFinite(p.at) && p.at >= from && p.at <= to && !used.has(e.net + '|' + p.id) && sameText(want, firstLine(p.text)));
  if (fit.length === 1) return take(fit[0], 'time+text');
  if (fit.length > 1) return { ambiguous: fit.length };
  return later('Nicio postare cu textul și ora asta pe ' + NAMES[e.net]);
}
// The clock (content-stats.js run, every hour, before the numbers are read): the posts made from the app that don't
// know their post yet. opts.now, opts.budgetMs (default 6 s).
async function match(opts) {
  opts = opts || {};
  const now = opts.now || Date.now(), t0 = Date.now(), budget = opts.budgetMs || 6e3;
  const list = await C.items();
  const todo = [], used = new Set();
  list.forEach((it) => (it.plan || []).forEach((e) => {
    if (e.state === 'posted' && e.postId) used.add(e.net + '|' + e.postId);
    if (it && !it.removed && e.state === 'posted' && e.manual && e.match && e.match.state === 'pending') todo.push({ it, e });
  }));
  if (!todo.length) return { pending: 0 };
  const lists = new Map();
  const posts = async (net, kind) => {
    const key = net + (net === 'fb' ? (kind === 'reel' ? '|reel' : '|post') : '');
    if (!lists.has(key)) lists.set(key, await recentOf(net, kind).catch((err) => { console.error('content app recent ' + net + ':', err.message); return null; }));
    return lists.get(key);
  };
  let page = null;
  const pageOf = async () => { if (page === null) page = await require('./content-post').access().then((a) => a.pageId || '').catch(() => ''); return page; };
  const done = [];
  for (const { it, e } of todo) {
    if (Date.now() - t0 > budget) break;
    let r;
    try { r = await resolveOne(it, e, posts, used, now, pageOf); } catch (err) { r = { wait: String(err.message || err).slice(0, 160) }; }
    if (r.matched) used.add(e.net + '|' + r.matched.postId);
    done.push({ id: it.id, net: e.net, ver: (e.match && e.match.at) || '', r });
  }
  const tally = { matched: 0, ambiguous: 0, none: 0, waiting: 0 };
  await C.update((items) => {
    let n = 0;
    Object.keys(tally).forEach((k) => { tally[k] = 0; });
    done.forEach(({ id, net, ver, r }) => {
      const it = C.findItem(items, id);
      const e = it && (it.plan || []).find((x) => x.net === net && x.state === 'posted' && x.manual);
      // only what is still waiting, as it was when it was read (a link pasted meanwhile wins)
      if (!e || !e.match || e.match.state !== 'pending' || (e.match.at || '') !== ver || e.postId) return;
      const at = iso(now);
      if (r.matched) {
        e.postId = r.matched.postId;
        if (r.matched.url) e.url = r.matched.url;
        if (r.matched.at) { e.netAt = iso(r.matched.at); e.postedAt = e.netAt; }
        e.match = { state: 'matched', how: r.matched.how, at };
        tally.matched++;
      } else if (r.ambiguous) { e.match = { state: 'ambiguous', at, n: r.ambiguous, note: r.ambiguous + ' postări se potrivesc: lipește linkul' }; tally.ambiguous++; }
      else if (r.none) { e.match = { state: 'none', at, note: r.none }; tally.none++; }
      else { e.match = Object.assign({}, e.match, { tries: (e.match.tries || 0) + 1, lastAt: at, note: r.wait || '' }); tally.waiting++; }
      n++;
    });
    return n ? undefined : false;
  });
  return Object.assign({ pending: todo.length }, tally);
}

module.exports = { SNOOZE_MS, MATCH_MS, HINT, step, run, tell, copyOf, parseLink, expand, posted, setLink, snoozeTo, snooze, skipSlot, firstLine, sameText, resolveOne, match, recentOf };
