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
//   startedAt, hold }], stats: { <net>: { at, views, reach, likes, comments, shares, saves, watch } },
//   hook (the first words said), hookType (intrebare, cifra, mit, pov, socant, poveste …), topicTag (the topic family,
//   hifu-gusa), ideaId (the owner's idea it makes, data/content/ideas.json), variantOf (the evergreen winner it makes
//   again with a new hook), firstComment (the account's first comment under the post, content-post.js), boosts
//   (content-boost.js) }]
// data/content/settings.json: { on, nets, startWeek, warmWeeks, quotas: { warm, full }, times, photoTime, competitors }
// data/content/state.json: the clock's marks (the day's stats, the week's top, the permission notice, the notices
//   about the weekly batch, the safety net: Saturday evening a week still incomplete, Monday 11:00 nothing going out)
// data/content/ideas.json: the owner's ideas for the next weeks [{ id, text, rubric, state: new|used, at, usedAt,
//   itemId, source? ('comentarii': a question people ask again and again, content-insights.js) }]; the producer makes
//   the owner's first, then the ones from the comments (reels/PRODUCER.md)
// The insights (content-insights.js): the status gives the producer the latest week's analysis (`analysis`), the
//   first thing read after the items to redo.
// The texts are checked before they go (qa): each network's limits, the words Meta and the owner refuse, the long
//   dashes, the diacritics. A problem stops 'ready' (and the posting, content-post.js); a warning shows on the board.
// The files: content/<id>/<name> (private in the store), served publicly by api/content-file.js, because Instagram
// and Facebook fetch them by URL; the ids are random UUIDs, `v` makes a replaced file a new URL.

const crypto = require('crypto');
const { readJSON, writeJSON, readJSONTagged, writeJSONIf } = require('./store');
const P = require('./content-plan');
const { dedash } = require('./dedash');

const KEY = 'data/content/items.json';
const SET_KEY = 'data/content/settings.json';
const STATE_KEY = 'data/content/state.json';
const IDEAS_KEY = 'data/content/ideas.json';
const KINDS = P.KINDS;
const RUBRICS = ['Cazuri', 'Mit sau adevăr?', 'Ce se întâmplă de fapt', 'Întrebarea zilei', 'Nuki', 'Top 3'];
const HOOK_TYPES = ['intrebare', 'cifra', 'mit', 'pov', 'socant', 'poveste'];
// what the producer may send per text (each network's own limit is checked by qa, so a text too long is refused, not cut)
const IN_MAX = 6000;
const MIMES = { 'video/mp4': 'mp4', 'image/jpeg': 'jpg', 'image/png': 'png' };
const MAX_BYTES = 60 * 1024 * 1024;
const CAP_MAX = { tt: 2200, yt: 100, ig: 2200, fb: 5000 };
const NET_NAME = { tt: 'TikTok', yt: 'YouTube', ig: 'Instagram', fb: 'Facebook' };
const ORIGIN = () => String(process.env.CONTENT_PUBLIC_ORIGIN || 'https://admin.centrul360.com').replace(/\/+$/, '');
const fileUrl = (id, name, v) => ORIGIN() + '/api/content-file?i=' + encodeURIComponent(id) + '&n=' + encodeURIComponent(name) + (v ? '&v=' + encodeURIComponent(v) : '');
const isId = (x) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(x || ''));
const isName = (x) => /^[\w-]{1,60}\.(mp4|jpe?g|png)$/i.test(String(x || ''));
const pathOf = (id, name) => 'content/' + id + '/' + name;
// no long dashes, ș and ț with the comma (never the cedilla)
const clean = (s, n) => dedash(String(s == null ? '' : s)).replace(/\r/g, '').replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț').trim().slice(0, n);
const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const slug = (s, n) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, n || 40);
function fail(code, status, extra) { const e = new Error(code); e.status = status || 400; if (extra) e.extra = extra; return e; }
const findItem = (list, id) => list.find((x) => x.id === id);

// a change to the items that never overwrites one made meanwhile (the clock posting while the producer uploads)
async function updateKey(key, fn) {
  for (let i = 0; i < 8; i++) {
    const { data, etag } = await readJSONTagged(key, []);
    const list = Array.isArray(data) ? data : [];
    const out = await fn(list);
    if (out === false) return { list, out };
    if (await writeJSONIf(key, list, etag)) return { list, out };
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
  }
  throw new Error('content: ' + key + ' busy');
}
const update = (fn) => updateKey(KEY, fn);

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

// the competitors' names (Setări), kept for qa() called without them (the poster)
let COMPETITORS = [];
const settings = async () => { const st = P.settingsOf(await readJSON(SET_KEY, null)); COMPETITORS = st.competitors; return st; };
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
  COMPETITORS = st.competitors;
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
// the producer's texts per network (kept whole: qa() refuses one over its network's limit instead of cutting it)
function captionsOf(x) {
  const out = {};
  if (x && typeof x === 'object') P.NETS.forEach((n) => { const c = clean(x[n], IN_MAX); if (c) out[n] = c; });
  return out;
}
// the text an item goes out with on a network
const captionFor = (it, net) => String((it.captions && it.captions[net]) || it.caption || '');
// the hook's style: a short word (intrebare, cifra, mit, pov, socant, poveste …)
const hookTypeOf = (x) => slug(x, 20);
// the first comment under the post (content-post.js writes it from the account): one line
const oneLine = (x, n) => clean(String(x == null ? '' : x).replace(/\s+/g, ' '), n);

// a new item (no files yet, not planned); an idea of the owner's it makes is marked used
async function create(input) {
  const x = input || {};
  if (!KINDS.includes(x.kind)) throw fail('invalid_kind');
  const now = Date.now();
  const it = { id: crypto.randomUUID(), kind: x.kind, rubric: clean(x.rubric, 60), topic: clean(x.topic, 160), keyword: clean(x.keyword, 40).toUpperCase(),
    caption: clean(x.caption, IN_MAX), captions: captionsOf(x.captions), week: weekFor(x.week, now), review: 'pending', redoNote: '',
    files: [], cover: '', state: 'draft', createdAt: new Date(now).toISOString(), plan: [], stats: {} };
  if (x.hook) it.hook = clean(x.hook, 200);
  if (x.hookType) it.hookType = hookTypeOf(x.hookType);
  if (x.topicTag) it.topicTag = slug(x.topicTag);
  if (x.firstComment) it.firstComment = oneLine(x.firstComment, 280);
  if (x.variantOf) {
    if (!isId(x.variantOf) || !findItem(await items(), x.variantOf)) throw fail('invalid_variant');
    it.variantOf = x.variantOf;
  }
  if (x.ideaId) {
    const idea = (await ideas()).find((d) => d.id === String(x.ideaId));
    if (!idea) throw fail('invalid_idea');
    it.ideaId = idea.id;
  }
  await update((list) => { list.push(it); });
  if (it.ideaId) await useIdea(it.ideaId, it.id).catch((e) => console.error('content idea:', e.message));
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

// ---------------------------------------------------------------- the texts' check before they go (qa)
// On the folded text (no diacritics, lower case). A problem: Meta refuses it, it promises, it sells, or the owner's
// rules forbid it (reels/README.md): the item is not 'ready' and the poster holds it. A warning: shown on the board.
const RISKS = [
  [/\bgarant/, '„garantat”: rezultatele nu se garantează'],
  [/\b(slab\w*|pierz\w*|pierd\w*|scap\w*( de)?|da\w* jos|topes\w*|minus)\s+(de\s+|pana la\s+|cel putin\s+)?\d+([.,]\d+)?\s*(kg|kilo\w*|cm|centimetr\w*|marimi|numere)\b|(^|\s)-\s?\d+([.,]\d+)?\s?(kg|cm)\b|\b\d+([.,]\d+)?\s?(kg|kilograme|cm|centimetri)\s+(mai putin|in minus|jos|pierdut\w*|topit\w*)/, 'kilograme sau centimetri promiși („slăbești X kg”)'],
  [/\bvindec/, '„vindecă”: nu e tratament pentru boli'],
  [/\b(fara|zero|0)\s+(nici\s?un\s+)?risc/, '„fără riscuri”: riscurile nu se neagă'],
  [/\b100\s?%|\bsuta la suta\b/, '„100%”: fără promisiuni absolute'],
  [/\b(recomandat|aprobat|validat|avizat|testat|verificat)\w*\s+de\s+(medic|doct|dermatolog|specialist)|\b(testat|dovedit|demonstrat)\w*\s+clinic|\bclinic\s+(testat|dovedit|demonstrat)|\b(medicul|doctorul|dermatologul|medicii|doctorii)\s+(nostru|nostri|noastre)\b|\bdr\.\s?[a-z]/, 'pretinde medici sau dovezi clinice'],
  [/\bai\s+(o\s+|un\s+)?(burt\w*|gus[ai]\w*|barbie dubla|celulit\w*|riduri|pete|vergetur\w*|grasime\w*|kilograme|colac\w*)\b|\b(esti|sunteti)\s+(gras[ae]?|plinut\w*|urat\w*|batran\w*)\b|\bte deranjeaza\s+(burt\w*|gus\w*|celulit\w*|riduril\w*|petele|kilogramele|colac\w*)|\burasti ce vezi\b/, 'vorbește despre defectul celui care citește („Ai gușă?”)'],
  [/\d[\d.,]*\s*(lei|ron|euro|eur)\b|€/, 'are un preț'],
  [/\b(pret|pretul|preturi\w*|ofert\w*|promoti\w*|discount\w*|reduceri\w*)\b|\breducere\s+(de\s+)?\d|\d+\s?%\s+reducere|\b(consultati\w*|evaluar\w*|sedint\w*)\s+gratuit\w*/, 'vorbește despre preț, ofertă sau reducere'],
  [/\bprogrameaza(-|\s)?te\b|\bprogramar\w*|\bfa(-|\s)?ti\s+(o\s+)?programare|\bsuna(-|\s)?ne\b|\bwhatsapp\b/, 'cheamă la programare („programează-te”)'],
  [/https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(ro|com|net|eu)\b|\blink\w*\b/, 'are un link'],
];
// [the words, the warning, the problem that says it already]
const SOFT = [
  [/\bslab\w*/, '„slăbit”: mai sigur „conturare”, „grăsime localizată”', 1],
  [/\b(definitiv\w*|permanent\w*|pentru totdeauna)\b/, '„definitiv”: rezultatele diferă de la o persoană la alta'],
  [/\b(miracol\w*|minun(e|i|ea|ile)|magic\w*|instant\w*)\b/, 'promisiune prea mare („miracol”, „instant”)'],
  [/\b(medic\w*|doctor\w*|dermatolog\w*)\b/, '„medic”: fără pretenții medicale', 5],
];
const RO_WORDS = new Set(['si', 'sa', 'in', 'este', 'pentru', 'care', 'nu', 'cu', 'pe', 'mai', 'sau', 'dupa', 'fara', 'ce', 'cum', 'iti', 'te', 'ne', 'din', 'la', 'de']);
const hashtags = (t) => (String(t).match(/#[\p{L}\p{N}_]+/gu) || []).length;
// a long Romanian text with no ă, â, î, ș, ț at all (the hashtags and links left out)
function noDiacritics(t) {
  const s = String(t).replace(/#[\p{L}\p{N}_]+/gu, ' ').replace(/@[\w.]+/g, ' ').replace(/https?:\/\/\S+/g, ' ');
  if ((s.match(/\p{L}/gu) || []).length < 80 || /[ăâîșțşţ]/i.test(s)) return false;
  return fold(s).split(/[^a-z]+/).filter((w) => RO_WORDS.has(w)).length >= 3;
}
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// one network's text: { problems, warnings } (Romanian, without the network's name)
function qaText(text, net, it, competitors) {
  const t = String(text || ''), f = fold(t), problems = [], warnings = [];
  if (!t.trim()) return { problems, warnings };
  if (net === 'yt') {
    // YouTube (content-yt.js): the first line is the title, with #shorts; the rest the description
    const lines = t.split('\n'), k = lines.findIndex((l) => l.trim());
    const first = (k >= 0 ? lines[k] : '').replace(/#shorts\b/ig, '').replace(/\s+/g, ' ').trim();
    const title = first + ' #shorts', desc = k >= 0 ? lines.slice(k + 1).join('\n').trim() : '';
    if (title.length > 100) problems.push('titlul are ' + title.length + ' de caractere cu #shorts (maxim 100)');
    if (desc.length > 5000) problems.push('descrierea are ' + desc.length + ' de caractere (maxim 5000)');
    if (/[<>]/.test(t)) warnings.push('YouTube scoate semnele < și >');
  } else {
    const max = { tt: 2200, ig: 2200, fb: 5000 }[net] || 2200;
    if (t.length > max) problems.push('are ' + t.length + ' de caractere (maxim ' + max + ')');
  }
  const h = hashtags(t);
  if (net === 'ig' && h > 30) problems.push('are ' + h + ' de hashtag-uri (maxim 30)');
  if (net === 'tt' && h > 6) warnings.push(h + ' hashtag-uri (pe TikTok 3-5)');
  if (net === 'fb' && h > 3) warnings.push(h + ' hashtag-uri (pe Facebook 1-2)');
  if (net === 'tt' && t.length > 400) warnings.push('text lung pentru TikTok (o frază, două)');
  if (/[—–]/.test(t)) problems.push('are liniuțe lungi');
  if (noDiacritics(t)) problems.push('e scris fără diacritice (ă, â, î, ș, ț)');
  const hit = RISKS.map(([re, msg]) => { const y = re.test(f); if (y) problems.push(msg); return y; });
  (competitors || []).forEach((c) => { const n = fold(c).trim(); if (n.length >= 3 && new RegExp('(^|[^a-z0-9])' + escRe(n) + '($|[^a-z0-9])').test(f)) problems.push('numește un concurent („' + c + '”)'); });
  SOFT.forEach(([re, msg, said]) => { if (re.test(f) && !(said != null && hit[said])) warnings.push(msg); });
  if (it && net === 'tt' && it.rubric === 'Cazuri' && !/rezultatele difera/.test(f)) warnings.push('caz înainte/după fără „Rezultatele diferă de la o persoană la alta”');
  return { problems, warnings };
}
// The check of an item's texts, on one network or (none given) on every network it goes to:
// { ok, problems: ['Instagram: are „100%”' …], warnings: […] }. content-post.js calls it before posting.
function qa(it, net, opts) {
  const o = opts || {};
  const competitors = o.competitors || COMPETITORS;
  const nets = net ? [net] : P.netsFor((it && it.kind) || 'reel');
  const problems = [], warnings = [];
  nets.forEach((n) => {
    const r = qaText(captionFor(it || {}, n), n, it, competitors);
    r.problems.forEach((x) => problems.push(NET_NAME[n] + ': ' + x));
    r.warnings.forEach((x) => warnings.push(NET_NAME[n] + ': ' + x));
  });
  if (!net && it) {
    // the same text on three networks or more: each network gets its own (reels/PRODUCER.md)
    const texts = nets.map((n) => captionFor(it, n).trim()).filter(Boolean);
    const same = texts.length - new Set(texts).size;
    if (texts.length >= 3 && same >= 2) warnings.push('același text pe ' + (same + 1) + ' rețele');
  }
  return { ok: !problems.length, problems, warnings };
}

// the item is complete: checked and planned in its week (a redone item: back to the owner, in the same slots)
async function ready(id) {
  if (!isId(id)) throw fail('invalid_id');
  await items();
  const [st, now] = [await settings(), Date.now()];
  let warnings = [];
  const { out } = await update((list) => {
    const it = findItem(list, id);
    if (!it) throw fail('not_found', 404);
    if (it.state !== 'draft') return { already: true, plan: it.plan, week: it.week };
    const q = qa(it, null, { competitors: st.competitors });
    const bad = problems(it).concat(q.problems);
    if (bad.length) throw fail('invalid_item', 422, { problems: bad, warnings: q.warnings });
    warnings = q.warnings;
    const m = media(it);
    it.cover = m.cover ? m.cover.name : m.images[0] ? m.images[0].name : '';
    it.state = 'ready'; it.readyAt = new Date(now).toISOString();
    if (it.review === 'redo') { it.review = 'pending'; it.replacedAt = it.readyAt; delete it.replacedTold; }
    P.replanWeek(list, it.week, st, now);
    return { plan: it.plan, week: it.week };
  });
  return Object.assign(out, { info: P.weekInfo(await items(), st, out.week) }, warnings.length ? { warnings } : {});
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
    if (x.hook) it.hook = clean(x.hook, 200);
    if (x.hookType) it.hookType = hookTypeOf(x.hookType);
    if (x.topicTag) it.topicTag = slug(x.topicTag);
    if (x.firstComment) it.firstComment = oneLine(x.firstComment, 280);
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
  // what works (learn), the owner's ideas not made yet, the moments of next week, the evergreen winners to make again
  const L = require('./content-learn'), lr = L.learn(list, now);
  const fresh = (await ideas()).filter((d) => d.state !== 'used').map((d) => Object.assign({ id: d.id, text: d.text, rubric: d.rubric || '', at: d.at }, d.source ? { source: d.source } : {}));
  // the week's analysis: its changes are what the producer follows first (after the items to redo)
  const analysis = await require('./content-insights').forProducer().catch(() => null);
  return { on: st.on, nets: st.nets, times: st.times, photoTime: st.photoTime, startWeek: st.startWeek, today: P.roDay(now),
    next: P.weekInfo(list, st, next), current: P.weekInfo(list, st, cur), redo, counts: P.counts(list),
    drafts: list.filter((x) => x.state === 'draft' && !x.removed).map((x) => ({ id: x.id, kind: x.kind, topic: x.topic || '', week: x.week, files: (x.files || []).map((f) => f.name) })), made,
    analysis, ideas: fresh, season: L.season(next), recycle: L.recycle(list, now, next, lr), learn: L.compact(lr) };
}

// ---------------------------------------------------------------- the owner's ideas (Admin → Conținut)
async function ideas() { const l = await readJSON(IDEAS_KEY, []); return Array.isArray(l) ? l : []; }
async function addIdea(text, rubric, source) {
  const t = clean(text, 400);
  if (t.length < 3) throw fail('idea_too_short');
  const d = { id: crypto.randomUUID(), text: t, rubric: RUBRICS.includes(rubric) ? rubric : '', state: 'new', at: new Date().toISOString() };
  if (source === 'comentarii') d.source = source;
  await updateKey(IDEAS_KEY, (l) => { l.unshift(d); l.splice(300); });
  return d;
}
async function delIdea(id) {
  const { out } = await updateKey(IDEAS_KEY, (l) => { const i = l.findIndex((d) => d.id === id); if (i < 0) return false; l.splice(i, 1); return true; });
  if (!out) throw fail('not_found', 404);
  return true;
}
// made by an item (the producer's create with ideaId), or back to new (that draft was dropped)
async function useIdea(id, itemId) {
  await updateKey(IDEAS_KEY, (l) => { const d = l.find((x) => x.id === id); if (!d) return false; Object.assign(d, { state: 'used', usedAt: new Date().toISOString(), itemId }); });
}
async function unuseIdea(itemId) {
  await updateKey(IDEAS_KEY, (l) => { const d = l.find((x) => x.itemId === itemId && x.state === 'used'); if (!d) return false; d.state = 'new'; delete d.usedAt; delete d.itemId; });
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
  // the owner's idea it was making waits for another item
  const it = !net && findItem(await items(), id);
  if (it && it.ideaId && !(it.plan || []).some((e) => e.state === 'posted')) await unuseIdea(id).catch(() => {});
  return out;
}

const readState = async () => Object.assign({ statsDay: '', topWeek: '', holdNote: '', readyWeek: '', remindWeek: '', missWeek: '', monWeek: '' }, (await readJSON(STATE_KEY, null)) || {});
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
  const tell = async (tag, title, text, tone) => {
    try {
      const N = require('./notify'), store = { readJSON, writeJSON };
      // the batch's notices open Conținut → Program (the board to approve)
      await N.notifyMany(store, await N.ownerIds(store), { kind: 'alert', tone: tone || 'info', go: 'continut/program', tag, title, text });
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
  // the safety net: Saturday from 20:00 (or Sunday, if the clock missed it) next week still incomplete, once a week
  const d = P.dow(P.roDay(now)), miss = info.missing.reel + info.missing.carousel;
  if (st.on && ((d === 6 && roHour(now) >= 20) || d === 0) && s.missWeek !== next && miss > 0) {
    s.missWeek = next; save = true;
    const what = [info.missing.reel ? plural(info.missing.reel, 'reel', 'reels') : '', info.missing.carousel ? plural(info.missing.carousel, 'carusel', 'carusele') : ''].filter(Boolean).join(' și ');
    await tell('ct-miss-' + next, 'SĂPTĂMÂNA NU E GATA ⚠️', (miss === 1 ? 'Lipsește 1 material' : 'Lipsesc ' + plural(miss, 'material', 'materiale')) + ' pentru săptămâna care vine (' + what + ').', 'bad');
  }
  // Monday from 11:00: an approved week with nothing going out today (a hold, the switch, a permission), once a week
  const cur = P.weekOf(now);
  if (d === 1 && roHour(now) >= 11 && s.monWeek !== cur) {
    s.monWeek = cur; save = true;
    const why = await mondayHold(list, st, now).catch((e) => { console.error('content monday:', e.message); return ''; });
    if (why) await tell('ct-monday-' + cur, 'AZI NU SE POSTEAZĂ NIMIC ⚠️', why, 'bad');
  }
  if (save) await writeState(s);
  return out;
}
// why nothing of today's (Monday's) entries will go out ('' when something does or nothing was planned)
async function mondayHold(list, st, now) {
  const today = P.roDay(now), week = P.weekOf(now);
  const live = list.filter((it) => !it.removed && !it.dropped && it.state === 'ready');
  if (!live.some((it) => it.week === week && P.review(it) === 'approved')) return '';
  const todays = [];
  live.forEach((it) => (it.plan || []).forEach((e) => { if (P.holds(e) && st.nets[e.net] && P.roDay(Date.parse(e.at)) === today) todays.push({ it, e }); }));
  if (!todays.length) return '';
  if (todays.some(({ e }) => e.state === 'posted' || e.state === 'posting')) return '';
  if (!st.on) return 'Postarea automată e oprită: azi nu pleacă nimic din săptămâna aprobată.';
  const why = new Set();
  let can = 0, POST = null;
  try { POST = require('./content-post'); } catch (e) { POST = null; }
  const a = POST && typeof POST.access === 'function' ? await POST.access(true).catch(() => null) : null;
  todays.forEach(({ it, e }) => {
    if (P.review(it) !== 'approved') { why.add('nimic aprobat pentru azi'); return; }
    const block = (a && POST && typeof POST.blocked === 'function' ? POST.blocked(a, e.net) : '') || (e.state === 'planned' ? e.hold || '' : '');
    const bad = qa(it, e.net, { competitors: st.competitors }).problems[0];
    if (block) why.add(block); else if (bad) why.add(bad); else if (e.state === 'planned') can++;
  });
  return can ? '' : [...why].join(' · ') || 'Nimic de postat azi.';
}

module.exports = { KEY, SET_KEY, STATE_KEY, IDEAS_KEY, KINDS, MIMES, MAX_BYTES, CAP_MAX, IN_MAX, RUBRICS, HOOK_TYPES, NET_NAME, ORIGIN, fileUrl, isId, isName, pathOf, items, settings,
  saveSettings, update, updateKey, migrate, create, addFile, problems, media, qa, qaText, ready, replace, setReview, approveWeek, setCaptions, captionFor, status, skip, readState,
  writeState, notices, mondayHold, ideas, addIdea, delIdea, useIdea, unuseIdea, findItem, fail, weekFor, plural, range, fold };
