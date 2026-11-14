// Answers to the comments on the clinic's posts and ads (the owner, 10.11: „fă ca Nuki să răspundă la comentariile
// postărilor; să nu-și spună numele sau că e AI; fiecare mesaj să se termine cu o întrebare pozitivă, să le placă de
// noi, și cu un emoji ❤️🥰💞”). A comment on the Facebook Page's posts (the ads' comments come the same way, on the
// Page's feed) or on the Instagram account's posts and ads comes on the leads' webhook (Page field „feed”, Instagram
// field „comments”); Claude writes a short answer as the clinic and it goes out at once, as the Page / the account.
// Only comments written straight on a post (not replies inside a thread) and never our own. Complaints, medical
// questions about her own case, anything legal and spam get no public answer: the owner and the admins are told.
// A comment with the word one of our reels asks for („Scrie «GUȘĂ» în comentarii”, api/_lib/content-dm.js) gets a
// private message with what the reel promised and a short public line („Ți-am scris în privat…”); state 'dm'.
//   ingest(payload)   a webhook delivery → the comments that are new (stored as 'new')
//   later(fn)         the work after the webhook's answer (the platform keeps the request alive for it)
//   answer(ids)       write and send the answers (at most 30 an hour); run() is the clock's retry
//   settings / setOn / list / retry / skip           for Integrări → Facebook → Comentarii (api/portal-comments.js)
// data/social-comments.json: [{ id, channel: 'fb'|'ig', postId, parentId, from: { id, name }, text, at,
//   state: 'new'|'replied'|'dm'|'skipped'|'error', reply, why, repliedAt, replyId?, link?, tries?, lockAt?,
//   dm?: { keyword, item, state: sent|already|refused, error? } }] (the newest 500)

const { readJSON, writeJSON, readJSONTagged, writeJSONIf } = require('./store');
const { loadConnection } = require('./facebook');
const ads = require('./meta-ads');

const KEY = 'data/social-comments.json';
const SET_KEY = 'data/social-comments-settings.json';
const KEEP = 500;
const PER_HOUR = 30;
const RETRY_FOR = 24 * 3600e3;
const LOCK_MS = 5 * 60e3;
const MAX_TRIES = 3;
const EMOJIS = ['❤️', '🥰', '💞'];
const CHANNELS = { fb: 'Facebook', ig: 'Instagram' };
const g = (method, path, token, params) => ads.call(method, path, token, params);
const DM = () => require('./content-dm');
const metaErr = (j) => ((j && j.error) || {}).error_user_msg || ((j && j.error) || {}).message || 'Meta n-a răspuns';
const iso = (t) => { const n = Number(t); const d = n ? new Date(n < 1e11 ? n * 1000 : n) : t ? new Date(t) : new Date(); return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString(); };
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

async function settings() { const s = (await readJSON(SET_KEY, null)) || {}; return { on: s.on !== false }; }
async function setOn(on, by) { await writeJSON(SET_KEY, { on: !!on, at: new Date().toISOString(), by: clip(by, 60) }); return { on: !!on }; }

// a change that never overwrites one made meanwhile (two deliveries at once, the clock and a webhook)
async function update(fn) {
  for (let i = 0; i < 6; i++) {
    const { data, etag } = await readJSONTagged(KEY, []);
    const list = Array.isArray(data) ? data : [];
    const out = await fn(list);
    if (out === false) return list;
    if (list.length > KEEP) list.splice(0, list.length - KEEP);
    if (await writeJSONIf(KEY, list, etag)) return list;
  }
  throw new Error('social comments: busy');
}
const patch = (id, fields) => update((all) => { const c = all.find((x) => x.id === id); if (!c) return false; Object.assign(c, fields); return true; });

// ---------------------------------------------------------------- the webhook
// Page feed: { field: 'feed', value: { item: 'comment', verb: 'add', comment_id, post_id, parent_id, from: { id, name }, message, created_time } }
// Instagram: { field: 'comments', value: { id, text, from: { id, username }, media: { id }, parent_id? } }
function parse(payload, conn) {
  const out = [];
  const pageIds = new Set([conn.pageId].concat((conn.pages || []).map((p) => p.id)).filter(Boolean).map(String));
  const isIg = payload.object === 'instagram';
  if (!isIg && payload.object !== 'page') return out;
  (payload.entry || []).forEach((e) => {
    const account = String(e.id || '');
    (e.changes || []).forEach((ch) => {
      const v = ch.value || {};
      const from = v.from || {};
      if (!isIg && ch.field === 'feed') {
        if (v.item !== 'comment' || v.verb !== 'add' || !v.comment_id) return;
        // only the clinic's Page, never its own comments, only comments straight on the post
        if (conn.pageId && account !== String(conn.pageId)) return;
        if (!from.id || pageIds.has(String(from.id)) || String(from.id) === account) return;
        if (v.parent_id && String(v.parent_id) !== String(v.post_id)) return;
        out.push({ id: String(v.comment_id), channel: 'fb', postId: String(v.post_id || ''), parentId: String(v.parent_id || v.post_id || ''),
          from: { id: String(from.id), name: clip(from.name, 80) }, text: clip(v.message, 2000),
          at: iso(v.created_time || e.time) });
      }
      if (isIg && ch.field === 'comments') {
        if (!v.id || !from.id || String(from.id) === account || v.parent_id) return;
        out.push({ id: String(v.id), channel: 'ig', postId: String((v.media || {}).id || ''), parentId: String((v.media || {}).id || ''),
          from: { id: String(from.id), name: clip(from.username ? '@' + from.username : from.name, 80) }, text: clip(v.text, 2000), at: iso(v.timestamp || e.time) });
      }
    });
  });
  return out;
}
const hasComments = (payload) => (payload.entry || []).some((e) => (e.changes || []).some((ch) => ch.field === 'feed' || ch.field === 'comments'));

// stores the new ones (a delivery Meta repeats finds them there) → their ids
async function ingest(payload) {
  if (!hasComments(payload)) return [];
  const conn = await loadConnection(readJSON);
  const items = parse(payload, conn);
  if (!items.length) return [];
  const { on } = await settings();
  const fresh = [];
  await update((all) => {
    fresh.length = 0;
    let added = 0;
    items.forEach((it) => {
      if (all.some((x) => x.id === it.id)) return;
      all.push(Object.assign({}, it, on ? { state: 'new', reply: '', why: '' } : { state: 'skipped', reply: '', why: 'Răspunsul automat era oprit' }, { repliedAt: '' }));
      added++;
      if (on) fresh.push(it.id);
    });
    return added > 0;
  });
  return fresh;
}

// ---------------------------------------------------------------- after the answer
function waitUntil() {
  try {
    const c = globalThis[Symbol.for('@vercel/request-context')];
    const ctx = c && typeof c.get === 'function' ? c.get() : null;
    return ctx && typeof ctx.waitUntil === 'function' ? (p) => ctx.waitUntil(p) : null;
  } catch (e) { return null; }
}
function later(fn) {
  const p = Promise.resolve().then(fn).catch((err) => { console.error('social comments:', err && err.message); });
  const wu = waitUntil();
  if (wu) { try { wu(p); return Promise.resolve(); } catch (e) { return p; } }
  return p;
}

// ---------------------------------------------------------------- the answer
const RULES = `Răspunzi public, în numele clinicii Centrul360, la un comentariu lăsat de cineva la o postare sau o reclamă a clinicii (Facebook sau Instagram). Centrul360: două clinici de medicină estetică non-invazivă, în Timișoara și Arad (corp, față, epilare laser).

Cum scrii:
- în limba comentariului (de obicei română, cu diacritice); vorbești ca echipa clinicii, la plural („noi”, „vă așteptăm”), cald, firesc, ca un om, nu ca o reclamă; persoanei îi vorbești cu „dumneavoastră” (vă, v-ar plăcea), frumos și respectuos, nu rigid (proprietarul, 14.11);
- foarte scurt: 1-3 propoziții scurte;
- nu spui niciodată un nume pentru tine și nu spui și nu lași să se înțeleagă că ești AI, bot, asistent, program sau răspuns automat;
- răspunzi doar la ce a întrebat, doar din datele primite (ofertele active cu prețul și orașul lor, programul clinicilor); nu inventezi prețuri, reduceri, rezultate, termene sau promisiuni medicale;
- pentru preț exact pentru cazul ei, detalii personale sau programare: o inviți să ne scrie în privat (Messenger pe Facebook, mesaj direct pe Instagram); nu spui că i-am scris deja în privat;
- numere de telefon doar dacă sunt în datele primite, și doar dacă le cere;
- nu spui niciodată că persoana are o problemă cu corpul sau fața ei; vorbești despre ce își dorește;
- fără liniuțe lungi (— sau –), fără hashtaguri, fără ghilimele în jurul răspunsului;
- la laude, emoji sau mulțumiri: o mulțumire scurtă și caldă;
- ÎNTOTDEAUNA închei cu o singură întrebare pozitivă, care o face să se simtă bine și să ne placă (despre ce își dorește, ce i-a plăcut, ce ar vrea să încerce), urmată de exact un emoji, unul dintre ❤️ 🥰 💞 (variază-le); niciun alt emoji.

Ce faci cu comentariul (action), pe lângă răspuns (the owner, 10.11: „hate-ul îl ștergem, cele cu «n-am avut rezultat» nu au sens să rănească conversia, la cele pozitive cu rezultat dai pin”):
- "delete": hate, insulte, jigniri, trolling, înjurături, spam, linkuri, reclame ale altora (skip: true, notify: false);
- "hide": „n-am avut rezultat”, „nu funcționează”, „țeapă”, „bani aruncați”, o experiență negativă sau o plângere (skip: true, notify: true, ca echipa să o sune în privat);
- "none": tot restul.
La o laudă cu un rezultat real trăit de ea („am avut rezultate super”, „mi-a scăzut talia”, „recomand, sunt foarte mulțumită”): răspunzi cald și dai "impact" de la 1 la 10 (10 = rezultat concret, entuziast, credibil, care convinge alte doamne); altfel impact 0.

Nu răspunzi public (skip: true) la:
- plângeri, o experiență negativă, supărare sau critică (notify: true, action "hide");
- întrebări medicale despre cazul ei: contraindicații, efecte secundare, boli, sarcină, medicamente (notify: true);
- orice ține de lege, avocați, ANPC, date personale (notify: true);
- spam, linkuri, conturi false, reclame ale altora (notify: true doar dacă pare important, altfel false);
- doar un nume sau o etichetare a unei prietene, fără altceva (notify: false).

Răspunzi DOAR cu un obiect JSON, fără alt text: {"reply": "<textul public, gol dacă skip>", "skip": true|false, "notify": true|false, "action": "delete"|"hide"|"none", "impact": 0-10, "why": "<de ce nu răspunzi, scurt, în română; gol dacă răspunzi>"}`;

const ALLOWED = new RegExp('(' + EMOJIS.join('|') + ')', 'gu');
const PICTO = /[\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}]/gu;
const FORBIDDEN = /\b(nuki|bot|chatbot|asistent(a|ul|ă)?|virtual[ăa]?|automat(ă|a|e|ic)?|inteligen[țţt][aă] artificial[aă]|robot)\b/i;
const FORBIDDEN_CASE = /\bA\.?I\b/; // „AI”, never the Romanian „ai”
const saysWhat = (t) => FORBIDDEN.test(t) || FORBIDDEN_CASE.test(t);
// the last thing said, kept whole: one allowed emoji at the end, no other emoji, no long dashes, at most 400 characters
function polish(raw, n) {
  const used = (String(raw || '').match(ALLOWED) || []).pop();
  let t = require('./dedash').dedash(String(raw || '')).replace(PICTO, '').replace(/[ \t]+/g, ' ').replace(/\s+([?.!,])/g, '$1').replace(/^["„“]+|["”“]+$/g, '').trim();
  const emoji = used || EMOJIS[(n || 0) % EMOJIS.length];
  const room = 400 - emoji.length - 1;
  if (t.length > room) {
    const cutAt = Math.max(t.lastIndexOf('?', room - 1), t.lastIndexOf('.', room - 1), t.lastIndexOf('!', room - 1));
    t = cutAt > room * 0.4 ? t.slice(0, cutAt + 1) : t.slice(0, room).replace(/\s+\S*$/, '');
  }
  return t ? t + ' ' + emoji : '';
}
function readJSONish(text) {
  const m = /\{[\s\S]*\}/.exec(String(text || ''));
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

// what the post or the ad says (her comment often means it: „cât costă?”) and its link
async function postInfo(c, token) {
  try {
    const r = c.channel === 'fb' ? await g('GET', '/' + c.postId, token, { fields: 'message,permalink_url' }) : await g('GET', '/' + c.postId, token, { fields: 'caption,permalink' });
    if (!r.ok) return {};
    return { text: clip(r.j.message || r.j.caption, 600), link: String(r.j.permalink_url || r.j.permalink || '') };
  } catch (e) { return {}; }
}

let facts = null; // the offers and hours, read once per run
async function factsText() {
  if (facts && Date.now() - facts.at < 10 * 60e3) return facts.text;
  const N = require('../portal-nuki').lib;
  const [offers, hours] = await Promise.all([N.offersText().catch(() => ''), N.hoursText().catch(() => '')]);
  const text = 'Acum: ' + new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' }) + '.\n\nOfertele active:\n' + (offers || '-') + '\n\nClinicile:\n' + (hours || '-') + '\n\n' + N.FACTS;
  facts = { at: Date.now(), text };
  return text;
}

async function write(c, post, n) {
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'Lipsește cheia Claude' };
  const N = require('../portal-nuki').lib;
  const system = [{ type: 'text', text: RULES, cache_control: { type: 'ephemeral' } }, { type: 'text', text: await factsText() }];
  const first = (c.from.name || '').replace(/^@/, '').split(/\s+/)[0];
  const q = 'Canal: ' + CHANNELS[c.channel] + '\n' + (post.text ? 'Postarea / reclama: ' + post.text + '\n' : '') + (first && c.channel === 'fb' ? 'Prenumele ei: ' + first + '\n' : '') + 'Comentariul: ' + (c.text || '(fără text: o poză sau un sticker)');
  for (let i = 0; i < 2; i++) {
    const r = await N.ask(system, [{ role: 'user', content: q + (i ? '\n\nAtenție: fără nume pentru tine, fără să spui că ești AI sau asistent, cu o întrebare pozitivă la final.' : '') }]);
    if (r.refused) return { skip: true, notify: true, why: 'Claude n-a vrut să răspundă' };
    const j = readJSONish(r.text);
    if (!j) continue;
    const action = ['delete', 'hide'].includes(j.action) ? j.action : 'none';
    if (j.skip) return { skip: true, action, notify: action === 'delete' ? false : j.notify !== false, why: clip(j.why, 200) || 'De văzut de echipă' };
    const reply = polish(j.reply, n);
    if (!reply || saysWhat(reply) || !reply.includes('?')) continue;
    return { reply, impact: Math.max(0, Math.min(10, Math.round(Number(j.impact) || 0))) };
  }
  return { error: 'Răspunsul nu a ieșit cum trebuie' };
}

async function send(c, text, token) {
  const r = c.channel === 'fb' ? await g('POST', '/' + c.id + '/comments', token, { message: text }) : await g('POST', '/' + c.id + '/replies', token, { message: text });
  return r.ok && r.j && r.j.id ? { id: String(r.j.id) } : { error: metaErr(r.j) };
}

// hate and spam go away; a „no result” or a complaint is hidden (she and her friends still see it, the others don't)
async function moderate(c, action, token) {
  const r = action === 'delete' ? await g('DELETE', '/' + c.id, token, {})
    : c.channel === 'fb' ? await g('POST', '/' + c.id, token, { is_hidden: 'true' }) : await g('POST', '/' + c.id, token, { hide: 'true' });
  return r.ok ? {} : { error: metaErr(r.j) };
}
// the strongest real result on a post: liked by the Page (Facebook) and the owners told to pin it (Meta lets no app pin)
async function star(c, token, all) {
  if (c.channel === 'fb') await g('POST', '/' + c.id + '/likes', token, {}).catch(() => null);
  const better = all.some((x) => x.id !== c.id && x.postId === c.postId && x.starred && (x.impact || 0) >= (c.impact || 0));
  if (better) return false;
  const N = require('./notify');
  const store = { readJSON, writeJSON };
  const ids = [...new Set((await N.ownerIds(store)).concat(await N.adminIds(store)))];
  await N.notifyMany(store, ids, { kind: 'alert', tone: 'good', go: 'integrari', title: 'DE FIXAT SUS 📌',
    text: CHANNELS[c.channel] + ' · ' + (c.from.name || 'cineva') + ': „' + clip(c.text, 100) + '”' + (c.link ? ' · ' + c.link : ''), tag: 'pin-' + c.postId }).catch(() => 0);
  return true;
}

async function tell(c, why) {
  const N = require('./notify');
  const store = { readJSON, writeJSON };
  const ids = [...new Set((await N.ownerIds(store)).concat(await N.adminIds(store)))];
  await N.notifyMany(store, ids, { kind: 'alert', tone: 'bad', go: 'mesaje', title: 'COMENTARIU DE VĂZUT 💬',
    text: CHANNELS[c.channel] + ' · ' + (c.from.name || 'cineva') + ': „' + clip(c.text, 90) + '” · ' + why, tag: 'cm-' + c.id }).catch(() => 0);
}

// ---------------------------------------------------------------- the reel's word („Scrie «GUȘĂ» în comentarii”)
// The public line after the private message (api/_lib/content-dm.js): we wrote to her, she had it already, or Meta
// wouldn't let us and she writes to us. Varied, warm, a positive question and one of our emoji at the end; on Instagram
// where to find it (a message from an account she doesn't follow waits in „Solicitări”).
const LINES = {
  // with „dumneavoastră” (the owner, 14.11: Nuki speaks to clients nicely, „cu dumneavoastră”)
  sent: ['V-am trimis în privat tot ce am promis{, N}! Ce v-ar plăcea să aflați mai întâi? 🥰', 'V-am scris în privat cu drag{, N}! Ce v-a atras cel mai mult în clip? 💞',
    'V-am lăsat mesajul în privat{, N}! Ce rezultat v-ați dori cel mai mult? ❤️', 'V-am trimis în privat ce am promis în clip! Ce v-a făcut curioasă? 💞',
    'Vă rugăm să verificați mesajele, v-am scris acolo{, N}! Ce v-ar plăcea să încercați prima dată? 🥰', 'V-am scris în privat cu drag! Ce v-a atras atenția în clip? ❤️'],
  already: ['V-am scris deja în privat, vă așteptăm acolo! Ce v-ar plăcea să mai aflați? 💞', 'Mesajul nostru vă așteaptă în privat{, N}! Ce v-ați dori să încercați prima dată? 🥰',
    'Găsiți mesajul nostru în privat! Ce altceva v-ar ajuta să aflați? ❤️'],
  ask: ['Scrieți-ne în privat și vă trimitem tot ce am promis în clip! Ce v-a plăcut cel mai mult? 💞', 'Trimiteți-ne un mesaj în privat și vă scriem cu drag tot ce am promis! Ce v-ați dori să aflați prima dată? 🥰',
    'Scrieți-ne în privat{, N,} și vă trimitem detaliile! Ce rezultat v-ați dori cel mai mult? ❤️'],
};
const IG_WHERE = 'Dacă nu-l vedeți, e la Solicitări.';
function publicLine(kind, c, itemKind) {
  const list = LINES[kind] || LINES.sent;
  const h = [...String(c.id)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const w = String((c.from && c.from.name) || '').trim().split(/\s+/)[0] || '';
  const first = c.channel === 'fb' && /^\p{Lu}\p{Ll}{1,19}$/u.test(w) ? w : '';
  let t = list[h % list.length].replace('{, N,}', first ? ', ' + first + ',' : '').replace('{, N}', first ? ', ' + first : '');
  // Instagram: where her message is, right after the first sentence
  if (c.channel === 'ig' && kind !== 'ask') t = t.replace(/^([^!?.]*[!.])\s/, '$1 ' + IG_WHERE + ' ');
  // a carousel is a post, not a clip
  return itemKind === 'carousel' || itemKind === 'slideshow' ? t.replace(/\bclip\b/g, 'postare') : t;
}
const dayOf = (t) => { const d = new Date(t); return Number.isFinite(d.getTime()) ? d.toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit' }) : ''; };

// the private message, then the public line; the comment is 'dm' (a failed private message or public line: 'error', the
// clock tries again, and a message that went is never sent twice)
async function keyword(c, hit, post, token, all, done) {
  const link = post.link || c.link || '';
  const d = await DM().deliver(c, hit, token);
  const tries = (c.tries || 0) + 1;
  if (d.error && !d.refused) { await done({ state: 'error', why: 'Mesajul privat (' + hit.keyword + '): ' + clip(d.error, 180), tries, link }); return 'error'; }
  const kind = d.sent ? 'sent' : d.already ? 'already' : 'ask';
  const dm = Object.assign({ keyword: hit.keyword, item: (hit.item && hit.item.id) || '', state: d.sent ? 'sent' : d.already ? 'already' : 'refused' }, d.refused ? { error: clip(d.error, 200) } : {});
  const why = d.sent ? 'Mesaj privat trimis (' + hit.keyword + ')'
    : d.already ? 'Avea deja mesajul privat (' + hit.keyword + (dayOf(d.at) ? ', ' + dayOf(d.at) : '') + ')'
    : 'Mesajul privat n-a plecat (' + clip(d.error, 120) + '): i-am cerut public să ne scrie';
  const n = all.filter((x) => x.state === 'replied' || x.state === 'dm').length;
  const reply = polish(publicLine(kind, c, hit.item && hit.item.kind), n);
  const s = await send(c, reply, token);
  if (s.error) { await done({ state: 'error', reply, dm, why: why + ' · răspunsul public: ' + clip(s.error, 160), tries, link }); return 'error'; }
  await done({ state: 'dm', reply, dm, why, replyId: s.id, repliedAt: new Date().toISOString(), link });
  return 'dm';
}

// the work on one comment, held so a second run (the clock, a repeated delivery) doesn't answer it twice
async function claim(id, manual) {
  let got = null;
  await update((all) => {
    const c = all.find((x) => x.id === id);
    if (!c || (!manual && !['new', 'error'].includes(c.state))) return false;
    if (c.lockAt && Date.now() - Date.parse(c.lockAt) < LOCK_MS) return false;
    if (!manual && Date.now() - Date.parse(c.at) > RETRY_FOR) return false;
    if (!manual && c.state === 'error' && (c.tries || 0) >= MAX_TRIES) return false;
    c.lockAt = new Date().toISOString();
    got = JSON.parse(JSON.stringify(c));
    return true;
  });
  return got;
}
const lastHour = (all) => all.filter((x) => (x.state === 'replied' || x.state === 'dm') && x.repliedAt && Date.now() - Date.parse(x.repliedAt) < 3600e3).length;

async function one(id, opts) {
  const o = opts || {};
  const all = await readJSON(KEY, []);
  if (lastHour(all) >= PER_HOUR) return 'limit';
  const c = await claim(id, o.manual);
  if (!c) return 'busy';
  const done = (fields) => patch(id, Object.assign({ lockAt: '' }, fields));
  try {
    const conn = await loadConnection(readJSON);
    if (!conn.pageAccessToken) { await done({ state: 'error', why: 'Facebook nu e conectat', tries: (c.tries || 0) + 1 }); return 'error'; }
    // only a tag of a friend (Instagram „@nume”): nothing to answer, nobody to tell
    if (/^(\s*@[\w.]+)+\s*$/.test(c.text)) { await done({ state: 'skipped', why: 'Doar o etichetare' }); return 'skipped'; }
    const post = await postInfo(c, conn.pageAccessToken);
    // the word a reel asks for: a private message and a short public line, in place of the usual answer
    const hit = await DM().match(c, post).catch((e) => { console.error('content dm match:', e && e.message); return null; });
    if (hit) return keyword(c, hit, post, conn.pageAccessToken, all, done);
    const w = await write(c, post, all.filter((x) => x.state === 'replied' || x.state === 'dm').length);
    if (w.error) { await done({ state: 'error', why: w.error, tries: (c.tries || 0) + 1, link: post.link || c.link || '' }); return 'error'; }
    if (w.skip) {
      let why = w.why;
      if (w.action === 'delete' || w.action === 'hide') {
        const m = await moderate(c, w.action, conn.pageAccessToken);
        why = (m.error ? (w.action === 'delete' ? 'N-am putut șterge: ' : 'N-am putut ascunde: ') + clip(m.error, 120) : (w.action === 'delete' ? 'Șters' : 'Ascuns')) + ' · ' + w.why;
      }
      await done({ state: 'skipped', action: w.action || 'none', why, link: post.link || c.link || '' });
      if (w.notify) await tell(Object.assign({}, c), why);
      return 'skipped';
    }
    const s = await send(c, w.reply, conn.pageAccessToken);
    if (s.error) { await done({ state: 'error', reply: w.reply, why: CHANNELS[c.channel] + ': ' + clip(s.error, 200), tries: (c.tries || 0) + 1, link: post.link || c.link || '' }); return 'error'; }
    const link = post.link || c.link || '';
    const starred = w.impact >= 8 ? await star(Object.assign({}, c, { impact: w.impact, link }), conn.pageAccessToken, all).catch(() => false) : false;
    await done({ state: 'replied', reply: w.reply, why: '', replyId: s.id, repliedAt: new Date().toISOString(), link, impact: w.impact || 0, starred });
    return 'replied';
  } catch (e) {
    await done({ state: 'error', why: clip(e && e.message, 200) || 'eroare', tries: (c.tries || 0) + 1 }).catch(() => {});
    return 'error';
  }
}

async function answer(ids, opts) {
  const out = {};
  for (const id of ids || []) { const r = await one(id, opts); out[r] = (out[r] || 0) + 1; if (r === 'limit') break; }
  return out;
}
// the clock (api/automation-tick.js): the ones still waiting or that failed, younger than a day
async function run() {
  if (!(await settings()).on) return { off: true };
  const all = await readJSON(KEY, []);
  const ids = all.filter((c) => ['new', 'error'].includes(c.state) && Date.now() - Date.parse(c.at) < RETRY_FOR && (c.state === 'new' || (c.tries || 0) < MAX_TRIES)
    && !(c.lockAt && Date.now() - Date.parse(c.lockAt) < LOCK_MS)).map((c) => c.id);
  return ids.length ? answer(ids) : { waiting: 0 };
}

// ---------------------------------------------------------------- Integrări
async function list(n) { return (await readJSON(KEY, [])).slice(-(n || 50)).reverse(); }
async function retry(id) {
  const c = (await readJSON(KEY, [])).find((x) => x.id === id);
  if (!c) return { error: 'not_found' };
  if (c.state === 'replied' || c.state === 'dm') return { error: 'already_replied' };
  await patch(id, { state: 'new', why: '', lockAt: '', tries: 0 });
  return { result: await one(id, { manual: true }) };
}
async function skip(id, by) {
  let ok = false;
  await update((all) => { const c = all.find((x) => x.id === id); if (!c || c.state === 'replied' || c.state === 'dm') return false; c.state = 'skipped'; c.why = 'Oprit de ' + (clip(by, 40) || 'echipă'); c.lockAt = ''; ok = true; return true; });
  return ok ? { ok: true } : { error: 'not_found' };
}
// for the health check: no names, only initials
const initials = (s) => String(s || '').replace(/^@/, '').split(/[\s._]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase() + '.').join('');

module.exports = { KEY, SET_KEY, EMOJIS, PER_HOUR, settings, setOn, parse, ingest, later, answer, run, list, retry, skip, polish, initials, hasComments, publicLine };
