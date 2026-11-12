// Conținut (the owner, 12.11: „infrastructura să funcționeze la infinit, content infinit”): the organic reels,
// carousels and stories a nightly Claude session renders (reels/engine) and uploads here; the admin plans them on the
// networks (api/_lib/content-plan.js), posts them by the clock (content-post.js) and reads their numbers (content-stats.js).
// Posting needs no approval (the owner's decision); Admin → Conținut has the switch.
//
// data/content/items.json: [{ id, kind: reel|carousel|story, rubric, topic, keyword, caption, files: [{ name, path,
//   mime, size, w, h, dur }], cover, state: draft|ready, createdAt, readyAt, plan: [{ net: fb|ig|tt|yt, at, state:
//   planned|posting|posted|error|waiting_access|skipped, postId, url, error, tries, container, startedAt, hold }],
//   stats: { <net>: { at, views, reach, likes, comments, shares, saves, watch } } }]
// data/content/settings.json: { on, slots: ['10:00', ...] (Europe/Bucharest), nets: { fb, ig, tt, yt }, gapDays }
// data/content/state.json: the clock's marks (the day's stats, the week's top, the permission notice)
// The files: content/<id>/<name> (private in the store), served publicly by api/content-file.js, because Instagram
// and Facebook fetch them by URL; the ids are random UUIDs.

const crypto = require('crypto');
const { readJSON, writeJSON, readJSONTagged, writeJSONIf } = require('./store');
const P = require('./content-plan');
const { dedash } = require('./dedash');

const KEY = 'data/content/items.json';
const SET_KEY = 'data/content/settings.json';
const STATE_KEY = 'data/content/state.json';
const KINDS = ['reel', 'carousel', 'story'];
const MIMES = { 'video/mp4': 'mp4', 'image/jpeg': 'jpg', 'image/png': 'png' };
const MAX_BYTES = 60 * 1024 * 1024;
const ORIGIN = () => String(process.env.CONTENT_PUBLIC_ORIGIN || 'https://admin.centrul360.com').replace(/\/+$/, '');
const fileUrl = (id, name) => ORIGIN() + '/api/content-file?i=' + encodeURIComponent(id) + '&n=' + encodeURIComponent(name);
const isId = (x) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(x || ''));
const isName = (x) => /^[\w-]{1,60}\.(mp4|jpe?g|png)$/i.test(String(x || ''));
const pathOf = (id, name) => 'content/' + id + '/' + name;

const items = async () => { const l = await readJSON(KEY, []); return Array.isArray(l) ? l : []; };
const settings = async () => P.settingsOf(await readJSON(SET_KEY, null));
async function saveSettings(patch) {
  const cur = await readJSON(SET_KEY, null);
  const next = P.settingsOf(Object.assign({}, P.settingsOf(cur), patch || {}, { nets: Object.assign({}, P.settingsOf(cur).nets, (patch && patch.nets) || {}) }));
  await writeJSON(SET_KEY, next);
  return next;
}
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
const clean = (s, n) => dedash(String(s == null ? '' : s)).replace(/\r/g, '').trim().slice(0, n);

// a new item (no files yet, not planned)
async function create(input) {
  const x = input || {};
  if (!KINDS.includes(x.kind)) { const e = new Error('invalid_kind'); e.status = 400; throw e; }
  const it = { id: crypto.randomUUID(), kind: x.kind, rubric: clean(x.rubric, 60), topic: clean(x.topic, 160), keyword: clean(x.keyword, 40).toUpperCase(),
    caption: clean(x.caption, 2200), files: [], cover: '', state: 'draft', createdAt: new Date().toISOString(), plan: [], stats: {} };
  await update((list) => { list.push(it); });
  return it;
}
const findItem = (list, id) => list.find((x) => x.id === id);
function fail(code, status, extra) { const e = new Error(code); e.status = status || 400; if (extra) e.extra = extra; return e; }

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
  const f = { name, path: pathOf(id, name), mime, size: buf.length, w: got.w || Number(h.w) || 0, h: got.h || Number(h.h) || 0, dur: got.dur || Number(h.dur) || 0, read: !!(got.w || got.dur) };
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
  if (!String(it.caption || '').trim() && it.kind !== 'story') out.push('lipsește textul de sub postare (caption)');
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
  } else if (it.kind === 'carousel') {
    if (vids.length) out.push('un carusel are doar poze');
    if (imgs.length < 2 || imgs.length > 10) out.push('un carusel are 2-10 poze (are ' + imgs.length + ')');
    const rs = imgs.map(ratio);
    if (rs.some((r) => !(near(r, 4 / 5) || near(r, 1)))) out.push('pozele caruselului sunt 4:5 sau 1:1');
    if (rs.length && !rs.every((r) => Math.abs(r - rs[0]) / rs[0] <= 0.02)) out.push('pozele caruselului au același format');
  } else if (it.kind === 'story') {
    if (vids.length > 1 || (!vids.length && imgs.length !== 1)) out.push('un story are un MP4 sau o poză JPG');
    const m = vids[0] || imgs[0];
    if (m && !near(ratio(m), 9 / 16)) out.push('story-ul nu e 9:16 (' + m.w + 'x' + m.h + ')');
    if (vids[0] && (!vids[0].dur || vids[0].dur > 60)) out.push('MP4-ul are ' + (vids[0].dur || '?') + ' s (maxim 60)');
    if (!vids.length && imgs[0] && imgs[0].mime !== 'image/jpeg') out.push('poza story-ului e JPG');
  }
  return out;
}
// the files in the order they go out (carousel: by name, 01.jpg, 02.jpg …)
const natural = (a, b) => a.name.localeCompare(b.name, 'en', { numeric: true });
function media(it) {
  const files = (it.files || []).slice().sort(natural);
  const video = files.find((f) => f.mime === 'video/mp4') || null;
  const images = files.filter((f) => /^image\//.test(f.mime));
  const cover = it.kind !== 'carousel' && video ? (images.find((f) => f.mime === 'image/jpeg') || null) : null;
  return { video, images: it.kind === 'carousel' ? images : video ? [] : images.slice(0, 1), cover };
}

// the item is complete: checked, planned on the networks
async function ready(id) {
  if (!isId(id)) throw fail('invalid_id');
  const [st, now] = [await settings(), Date.now()];
  const { out } = await update((list) => {
    const it = findItem(list, id);
    if (!it) throw fail('not_found', 404);
    if (it.state !== 'draft') return { already: true, plan: it.plan };
    const bad = problems(it);
    if (bad.length) throw fail('invalid_item', 422, { problems: bad });
    const m = media(it);
    it.cover = m.cover ? m.cover.name : m.images[0] ? m.images[0].name : '';
    const igSkip = it.kind === 'carousel' && m.images.some((f) => f.mime !== 'image/jpeg') ? 'Instagram primește doar JPG' : '';
    it.plan = P.planItem(it, list.filter((x) => x !== it), st, now, { igSkip });
    it.state = 'ready'; it.readyAt = new Date(now).toISOString();
    return { plan: it.plan };
  });
  return out;
}

// the queue for the producer (api/content-intake.js GET) and the health page
async function status() {
  const [list, st] = await Promise.all([items(), settings()]);
  const s = P.summary(list, st, Date.now());
  return Object.assign({ on: st.on, slots: st.slots, nets: st.nets, gapDays: st.gapDays, drafts: list.filter((x) => x.state === 'draft').length }, s);
}

// Scoate: the entries not posted yet are skipped (a net: just that one)
async function skip(id, net) {
  const { out } = await update((list) => {
    const it = findItem(list, id);
    if (!it) throw fail('not_found', 404);
    let n = 0;
    (it.plan || []).forEach((e) => { if ((!net || e.net === net) && !['posted', 'posting', 'skipped'].includes(e.state)) { e.state = 'skipped'; e.skippedAt = new Date().toISOString(); n++; } });
    if (!net && it.state === 'draft') { it.state = 'ready'; it.plan = []; it.removed = true; n++; }
    return n;
  });
  return out;
}

const readState = async () => Object.assign({ statsDay: '', topWeek: '', holdNote: '' }, (await readJSON(STATE_KEY, null)) || {});
const writeState = (s) => writeJSON(STATE_KEY, s, { quiet: true });

module.exports = { KEY, SET_KEY, STATE_KEY, KINDS, MIMES, MAX_BYTES, ORIGIN, fileUrl, isId, isName, pathOf, items, settings, saveSettings, update, create, addFile, problems, media, ready, status, skip, readState, writeState, findItem, fail };
