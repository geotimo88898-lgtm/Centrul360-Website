// Conținut (the owner, 12.11: „infrastructura să funcționeze la infinit, content infinit”): the organic reels and
// carousels a Claude session renders (reels/engine) and hands in here a week at a time (reels/PRODUCER.md); the admin
// cross-shuffles each week on the networks (api/_lib/content-plan.js), the owner approves the week on Sunday in
// Admin → Conținut (or sends an item back to be redone), and the clock posts only what is approved
// (content-post.js) and reads its numbers (content-stats.js).
//
// data/content/items.json: [{ id, kind: reel|carousel|slideshow, rubric, topic, keyword, caption, captions: { tt, yt,
//   ig, fb } (a text per network, `caption` when one is missing), week: 'YYYY-MM-DD' (its Monday), review: pending|
//   approved|redo, redoNote, reviewedAt, redoAt, replacedAt, files: [{ name, path, mime, size, w, h, dur, v }], cover,
//   state: draft|ready, createdAt, readyAt, plan: [{ net: tt|yt|ig|fb, kind: reel|carousel|slideshow, slot: 0|1|'p',
//   at, state: planned|posting|posted|error|waiting_access|skipped|missed, postId, url, error, tries, container,
//   startedAt, hold }], stats: { <net>: { at, views, reach, likes, comments, shares, saves, watch } } }]
// data/content/settings.json: { on, nets, startWeek, warmWeeks, quotas: { warm, full }, times, photoTime }
// data/content/state.json: the clock's marks (the day's stats, the week's top, the permission notice, the notices
//   about the weekly batch)
// The files: content/<id>/<name> (private in the store), served publicly by api/content-file.js, because Instagram
// and Facebook fetch them by URL; the ids are random UUIDs, `v` makes a replaced file a new URL.

const crypto = require('crypto');
const { readJSON, writeJSON, readJSONTagged, writeJSONIf } = require('./store');
const P = require('./content-plan');
const { dedash } = require('./dedash');

const KEY = 'data/content/items.json';
const SET_KEY = 'data/content/settings.json';
const STATE_KEY = 'data/content/state.json';
const KINDS = P.KINDS;
const MIMES = { 'video/mp4': 'mp4', 'image/jpeg': 'jpg', 'image/png': 'png' };
const MAX_BYTES = 60 * 1024 * 1024;
const CAP_MAX = { tt: 2200, yt: 100, ig: 2200, fb: 5000 };
const NET_NAME = { tt: 'TikTok', yt: 'YouTube', ig: 'Instagram', fb: 'Facebook' };
const ORIGIN = () => String(process.env.CONTENT_PUBLIC_ORIGIN || 'https://admin.centrul360.com').replace(/\/+$/, '');
const fileUrl = (id, name, v) => ORIGIN() + '/api/content-file?i=' + encodeURIComponent(id) + '&n=' + encodeURIComponent(name) + (v ? '&v=' + encodeURIComponent(v) : '');
const isId = (x) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(x || ''));
const isName = (x) => /^[\w-]{1,60}\.(mp4|jpe?g|png)$/i.test(String(x || ''));
const pathOf = (id, name) => 'content/' + id + '/' + name;
const clean = (s, n) => dedash(String(s == null ? '' : s)).replace(/\r/g, '').trim().slice(0, n);
function fail(code, status, extra) { const e = new Error(code); e.status = status || 400; if (extra) e.extra = extra; return e; }
const findItem = (list, id) => list.find((x) => x.id === id);

// a change to the items that never overwrites one made meanwhile (the clock posting while the producer uploads)
async function update(fn) {
  for (let i = 0; i < 8; i++) {
    const { data, etag } = await readJSONTagged(KEY, []);
    const list = Array.isArray(data) ? data : [];
    const out = await fn(list);
    if (out === false) return { list, out };
    if (await writeJSONIf(KEY, list, etag)) return { list, out };
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
  }
  throw new Error('content: items busy');
}

// The weekly model came on 12.11: an item from before it (no week) belongs to the week after the one it was made in,
// waits for the owner's look, and its entries not started yet are planned again in the new model.
const unweeked = (it) => !it.week;
function migrate(list, st, now) {
  const weeks = new Set();
  list.forEach((it) => {
    if (!unweeked(it)) return;
    it.week = P.addDays(P.mondayOf(P.roDay(Date.parse(it.createdAt) || now)), 7);
    if (!it.review) it.review = 'pending';
    if (!it.captions) it.captions = {};
    it.plan = (it.plan || []).filter((e) => !((e.state === 'planned' || e.state === 'waiting_access') && !(e.tries > 0)));
    if (it.state === 'ready' && !it.removed) weeks.add(it.week);
  });
  [...weeks].sort().forEach((w) => P.replanWeek(list, w, st, now));
  return weeks.size;
}

const settings = async () => P.settingsOf(await readJSON(SET_KEY, null));
async function items() {
  const l = await readJSON(KEY, []);
  const list = Array.isArray(l) ? l : [];
  if (!list.some(unweeked)) return list;
  const st = await settings();
  const { list: done } = await update((x) => (x.some(unweeked) ? (migrate(x, st, Date.now()), undefined) : false));
  return done;
}
// a partial change of the settings: the networks, times, photo times and quotas merge with what is there
async function saveSettings(patch) {
  const cur = P.settingsOf(await readJSON(SET_KEY, null));
  const p = patch || {};
  const next = Object.assign({}, cur, p);
  next.nets = Object.assign({}, cur.nets, p.nets || {});
  next.times = Object.assign({}, cur.times, p.times || {});
  next.photoTime = Object.assign({}, cur.photoTime, p.photoTime || {});
  next.quotas = { warm: {}, full: {} };
  ['warm', 'full'].forEach((w) => P.NETS.forEach((n) => { next.quotas[w][n] = Object.assign({}, cur.quotas[w][n], (p.quotas && p.quotas[w] && p.quotas[w][n]) || {}); }));
  const st = P.settingsOf(next);
  await writeJSON(SET_KEY, st);
  return st;
}

// the week an item goes in: the Monday of the date given (none: next week); never a week that has ended
function weekFor(x, now) {
  const cur = P.weekOf(now);
  if (x == null || x === '') return P.addDays(cur, 7);
  if (!P.isDay(x)) throw fail('invalid_week');
  const w = P.mondayOf(String(x));
  if (w < cur) throw fail('past_week');
  return w;
}
function captionsOf(x) {
  const out = {};
  if (x && typeof x === 'object') P.NETS.forEach((n) => { const c = clean(x[n], CAP_MAX[n]); if (c) out[n] = c; });
  return out;
}
// the text an item goes out with on a network
const captionFor = (it, net) => String((it.captions && it.captions[net]) || it.caption || '');

// a new item (no files yet, not planned)
async function create(input) {
  const x = input || {};
  if (!KINDS.includes(x.kind)) throw fail('invalid_kind');
  const now = Date.now();
  const it = { id: crypto.randomUUID(), kind: x.kind, rubric: clean(x.rubric, 60), topic: clean(x.topic, 160), keyword: clean(x.keyword, 40).toUpperCase(),
    caption: clean(x.caption, 2200), captions: captionsOf(x.captions), week: weekFor(x.week, now), review: 'pending', redoNote: '',
    files: [], cover: '', state: 'draft', createdAt: new Date(now).toISOString(), plan: [], stats: {} };
  await update((list) => { list.push(it); });
  return it;
}

// one file of a draft: stored at content/<id>/<name>, its size and length read from it
async function addFile(id, name, mime, buf, hint) {
  if (!isId(id)) throw fail('invalid_id');
  if (!isName(name)) throw fail('invalid_name');
  mime = String(mime || '').split(';')[0].trim().toLowerCase();
  if (mime === 'image/jpg') mime = 'image/jpeg';
  if (!MIMES[mime]) throw fail('invalid_mime');
  const ext = name.split('.').pop().toLowerCase().replace('jpeg', 'jpg');
  if (ext !== MIMES[mime]) throw fail('name_mime_mismatch');
  if (!Buffer.isBuffer(buf) || !buf.length) throw fail('empty_body');
  if (buf.length > MAX_BYTES) throw fail('too_large', 413);
  const cur = findItem(await items(), id);
  if (!cur) throw fail('not_found', 404);
  if (cur.state !== 'draft') throw fail('already_ready', 409);
  const got = require('./content-media').probe(buf, mime) || {};
  const h = hint || {};
  const f = { name, path: pathOf(id, name), mime, size: buf.length, w: got.w || Number(h.w) || 0, h: got.h || Number(h.h) || 0, dur: got.dur || Number(h.dur) || 0, read: !!(got.w || got.dur),
    v: Date.now().toString(36) + crypto.randomBytes(2).toString('hex') };
  await require('./store').writeBinary(f.path, buf, mime);
  await update((list) => {
    const it = findItem(list, id);
    if (!it) return false;
    it.files = (it.files || []).filter((x) => x.name !== name).concat(f);
  });
  return f;
}

// does the item hold what its kind needs? [] when it does, else the reasons (Romanian, for the producer's log)
const ratio = (f) => (f.w && f.h ? f.w / f.h : 0);
const near = (r, want) => r && Math.abs(r - want) / want <= 0.02;
function problems(it) {
  const files = it.files || [], out = [];
  const vids = files.filter((f) => f.mime === 'video/mp4'), jpgs = files.filter((f) => f.mime === 'image/jpeg'), imgs = files.filter((f) => /^image\//.test(f.mime));
  const lacking = P.netsFor(it.kind).filter((n) => !captionFor(it, n).trim());
  if (lacking.length) out.push('lipsește textul de sub postare pentru ' + lacking.map((n) => NET_NAME[n]).join(', ') + ' (caption sau captions)');
  if (it.kind === 'reel') {
    if (vids.length !== 1) out.push('un reel are exact un MP4 (are ' + vids.length + ')');
    else {
      const v = vids[0];
      if (!near(ratio(v), 9 / 16)) out.push('MP4-ul nu e 9:16 (' + v.w + 'x' + v.h + ')');
      if (!v.dur || v.dur > 90) out.push('MP4-ul are ' + (v.dur || '?') + ' s (maxim 90)');
      if (v.dur && v.dur < 3) out.push('MP4-ul are sub 3 s');
    }
    if (jpgs.length !== 1) out.push('un reel are exact o copertă JPG (are ' + jpgs.length + ')');
    if (files.length !== vids.length + jpgs.length) out.push('un reel are doar MP4 și JPG');
  } else if (it.kind === 'carousel' || it.kind === 'slideshow') {
    const what = it.kind === 'carousel' ? 'caruselului' : 'slideshow-ului';
    if (vids.length) out.push('un ' + (it.kind === 'carousel' ? 'carusel' : 'slideshow') + ' are doar poze');
    if (imgs.length < 2 || imgs.length > 10) out.push('un ' + (it.kind === 'carousel' ? 'carusel' : 'slideshow') + ' are 2-10 poze (are ' + imgs.length + ')');
    if (imgs.some((f) => f.mime !== 'image/jpeg')) out.push('pozele ' + what + ' sunt JPG (Instagram nu primește PNG)');
    const rs = imgs.map(ratio);
    if (rs.some((r) => !(near(r, 4 / 5) || near(r, 1)))) out.push('pozele ' + what + ' sunt 4:5 sau 1:1');
    if (rs.length && !rs.every((r) => Math.abs(r - rs[0]) / rs[0] <= 0.02)) out.push('pozele ' + what + ' au același format');
  }
  return out;
}
// the files in the order they go out (carousel: by name, 01.jpg, 02.jpg …)
const natural = (a, b) => a.name.localeCompare(b.name, 'en', { numeric: true });
function media(it) {
  const files = (it.files || []).slice().sort(natural);
  const video = files.find((f) => f.mime === 'video/mp4') || null;
  const images = files.filter((f) => /^image\//.test(f.mime));
  const photos = it.kind === 'carousel' || it.kind === 'slideshow';
  const cover = !photos && video ? (images.find((f) => f.mime === 'image/jpeg') || null) : null;
  return { video, images: photos ? images : video ? [] : images.slice(0, 1), cover };
}

// the item is complete: checked and planned in its week (a redone item: back to the owner, in the same slots)
async function ready(id) {
  if (!isId(id)) throw fail('invalid_id');
  await items();
  const [st, now] = [await settings(), Date.now()];
  const { out } = await update((list) => {
    const it = findItem(list, id);
    if (!it) throw fail('not_found', 404);
    if (it.state !== 'draft') return { already: true, plan: it.plan, week: it.week };
    const bad = problems(it);
    if (bad.length) throw fail('invalid_item', 422, { problems: bad });
    const m = media(it);
    it.cover = m.cover ? m.cover.name : m.images[0] ? m.images[0].name : '';
    it.state = 'ready'; it.readyAt = new Date(now).toISOString();
    if (it.review === 'redo') { it.review = 'pending'; it.replacedAt = it.readyAt; delete it.replacedTold; }
    P.replanWeek(list, it.week, st, now);
    return { plan: it.plan, week: it.week };
  });
  return Object.assign(out, { info: P.weekInfo(await items(), st, out.week) });
}

// Refă: the producer makes an item again (its files are uploaded again with the same names, or `clear` drops them
// first; the texts may come too), then 'ready'. The item keeps its slots meanwhile and posts nothing.
async function replace(id, input) {
  if (!isId(id)) throw fail('invalid_id');
  const x = input || {};
  await items();
  const { out } = await update((list) => {
    const it = findItem(list, id);
    if (!it || it.removed) throw fail('not_found', 404);
    if (it.review !== 'redo') throw fail('not_redo', 409);
    it.state = 'draft';
    if (x.caption != null) it.caption = clean(x.caption, 2200);
    if (x.captions) it.captions = Object.assign({}, it.captions || {}, captionsOf(x.captions));
    if (x.topic) it.topic = clean(x.topic, 160);
    let dropped = [];
    if (x.clear) { dropped = (it.files || []).map((f) => f.path); it.files = []; it.cover = ''; }
    return { files: (it.files || []).map((f) => f.name), dropped };
  });
  if (out.dropped.length) {
    const store = require('./store');
    await Promise.all(out.dropped.map((p) => (store.removeBinary ? store.removeBinary(p).catch(() => null) : null)));
  }
  return { id, files: out.files };
}

// the owner's look (Admin → Conținut): approve, send back to be redone (with a short note)
async function setReview(id, decision, note) {
  if (!['approved', 'redo'].includes(decision)) throw fail('invalid_review');
  const now = new Date().toISOString();
  const { out } = await update((list) => {
    const it = findItem(list, id);
    if (!it || it.removed || it.dropped) throw fail('not_found', 404);
    if (it.state !== 'ready') throw fail('not_ready', 409);
    if (decision === 'redo') {
      if ((it.plan || []).length && (it.plan || []).every((e) => e.state === 'posted' || !P.holds(e))) throw fail('already_posted', 409);
      Object.assign(it, { review: 'redo', redoNote: clean(note, 300), redoAt: now, reviewedAt: now });
    } else Object.assign(it, { review: 'approved', reviewedAt: now, approvedAt: now });
    return true;
  });
  return out;
}
// Aprobă toată săptămâna: every item of the week still waiting for a look
async function approveWeek(week) {
  if (!P.isDay(week)) throw fail('invalid_week');
  const now = new Date().toISOString();
  const { out } = await update((list) => {
    let n = 0;
    list.forEach((it) => { if (it.week === week && !it.removed && !it.dropped && it.state === 'ready' && P.review(it) === 'pending') { Object.assign(it, { review: 'approved', reviewedAt: now, approvedAt: now }); n++; } });
    return n || false;
  });
  return out || 0;
}
// the owner's edit of a network's text
async function setCaptions(id, captions) {
  const c = {};
  if (captions && typeof captions === 'object') P.NETS.forEach((n) => { if (typeof captions[n] === 'string') c[n] = clean(captions[n], CAP_MAX[n]); });
  const { out } = await update((list) => {
    const it = findItem(list, id);
    if (!it || it.removed) throw fail('not_found', 404);
    it.captions = Object.assign({}, it.captions || {}, c);
    return it.captions;
  });
  return out;
}

// what the producer reads (api/content-intake.js GET) and the health page
async function status() {
  const [list, st] = await Promise.all([items(), settings()]);
  const now = Date.now(), cur = P.weekOf(now), next = P.addDays(cur, 7);
  // what the producer already made (so a session with no memory never repeats a topic), the newest first
  const made = list.filter((x) => !x.removed).slice(-120).reverse().map((x) => ({ topic: x.topic || '', rubric: x.rubric || '', kind: x.kind, week: x.week || '', at: x.createdAt || '' }));
  const redo = list.filter((x) => !x.removed && !x.dropped && x.review === 'redo').map((x) => ({ id: x.id, kind: x.kind, topic: x.topic || '', rubric: x.rubric || '', week: x.week, redoNote: x.redoNote || '', replacing: x.state === 'draft' }));
  return { on: st.on, nets: st.nets, times: st.times, photoTime: st.photoTime, startWeek: st.startWeek, today: P.roDay(now),
    next: P.weekInfo(list, st, next), current: P.weekInfo(list, st, cur), redo, counts: P.counts(list),
    drafts: list.filter((x) => x.state === 'draft' && !x.removed).map((x) => ({ id: x.id, kind: x.kind, topic: x.topic || '', week: x.week, files: (x.files || []).map((f) => f.name) })), made };
}

// Scoate: the entries not posted yet are skipped (a net: just that one)
async function skip(id, net) {
  const { out } = await update((list) => {
    const it = findItem(list, id);
    if (!it) throw fail('not_found', 404);
    let n = 0;
    (it.plan || []).forEach((e) => { if ((!net || e.net === net) && !['posted', 'posting', 'skipped'].includes(e.state)) { e.state = 'skipped'; e.skippedAt = new Date().toISOString(); n++; } });
    // the whole item: out of its week (a draft goes altogether); what it posted stays, with its numbers
    if (!net) { it.dropped = true; if (it.state === 'draft') { it.state = 'ready'; it.plan = []; it.removed = true; } n++; }
    return n;
  });
  return out;
}

const readState = async () => Object.assign({ statsDay: '', topWeek: '', holdNote: '', readyWeek: '', remindWeek: '' }, (await readJSON(STATE_KEY, null)) || {});
const writeState = (s) => writeJSON(STATE_KEY, s, { quiet: true });

// The owner hears about the weekly batch (the bell and his phone, Admin → Conținut):
//  - next week's batch is complete (all it needs handed in): once a week, „SĂPTĂMÂNA E GATA DE VERIFICAT 🎬”;
//  - Sunday from 12:00, items of next week still waiting for his look: once;
//  - items sent back to redo are made again: once per round, when the producer has finished (none in the works,
//    the last one 10 minutes ago).
const roHour = (ms) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hour12: false }).format(new Date(ms)));
const plural = (n, one, many) => (n === 1 ? '1 ' + one : n + ((n % 100 >= 20 || (n % 100 === 0 && n > 0)) ? ' de ' : ' ') + many);
// a week as the owner reads it: 16-22.11, 30.11-6.12
const range = (w) => { const e = P.addDays(w, 6); return Number(w.slice(8, 10)) + (w.slice(5, 7) === e.slice(5, 7) ? '' : '.' + w.slice(5, 7)) + '-' + Number(e.slice(8, 10)) + '.' + e.slice(5, 7); };
async function notices(nowMs) {
  const now = nowMs || Date.now();
  const [list, st, s] = await Promise.all([items(), settings(), readState()]);
  const next = P.addDays(P.weekOf(now), 7), info = P.weekInfo(list, st, next);
  const out = [];
  const tell = async (tag, title, text) => {
    try {
      const N = require('./notify'), store = { readJSON, writeJSON };
      await N.notifyMany(store, await N.ownerIds(store), { kind: 'alert', tone: 'info', go: 'continut', tag, title, text });
    } catch (e) { console.error('content notify:', e.message); }
    out.push(tag);
  };
  let save = false;
  if (info.complete && s.readyWeek !== next) {
    const what = [plural(info.have.reel, 'reel', 'reels'), info.have.carousel ? plural(info.have.carousel, 'carusel', 'carusele') : ''].filter(Boolean).join(' și ');
    s.readyWeek = next; save = true;
    await tell('ct-ready-' + next, 'SĂPTĂMÂNA E GATA DE VERIFICAT 🎬', what + ' pentru ' + range(next) + '.' + (info.redo ? ' ' + plural(info.redo, 'material', 'materiale') + ' de refăcut.' : ''));
  }
  if (P.dow(P.roDay(now)) === 0 && roHour(now) >= 12 && s.remindWeek !== next && info.pending > 0) {
    s.remindWeek = next; save = true;
    await tell('ct-remind-' + next, 'CONȚINUT DE APROBAT 🎬', 'Ai ' + plural(info.pending, 'material', 'materiale') + ' de aprobat pentru săptămâna care vine.');
  }
  const redone = list.filter((it) => it.replacedAt && !it.replacedTold && it.state === 'ready' && !it.removed && !it.dropped);
  const busy = list.some((it) => it.review === 'redo' && it.state === 'draft' && !it.removed);
  const last = redone.reduce((m, it) => Math.max(m, Date.parse(it.replacedAt) || 0), 0);
  if (redone.length && !busy && now - last >= 10 * 60e3) {
    const ids = new Set(redone.map((it) => it.id));
    await update((l) => { l.forEach((it) => { if (ids.has(it.id)) it.replacedTold = true; }); });
    await tell('ct-redone-' + last, 'CONȚINUT REFĂCUT 🎬', 'Am refăcut ' + plural(redone.length, 'material', 'materiale') + '.');
  }
  if (save) await writeState(s);
  return out;
}

module.exports = { KEY, SET_KEY, STATE_KEY, KINDS, MIMES, MAX_BYTES, CAP_MAX, ORIGIN, fileUrl, isId, isName, pathOf, items, settings, saveSettings, update, migrate, create, addFile, problems, media,
  ready, replace, setReview, approveWeek, setCaptions, captionFor, status, skip, readState, writeState, notices, findItem, fail, weekFor, plural, range };
