// Cuvântul din clip → mesaj privat → lead (the owner, 12.11). Our organic reels end with „Scrie «GUȘĂ» în comentarii și
// îți trimitem…”. A comment with the item's word (data/content/items.json `keyword`, any case, with or without
// diacritics, as a whole word: „gusa”, „GUȘĂ!”, „vreau gusa”) gets, in place of the usual public answer
// (api/_lib/social-comments.js, which calls this):
//  - a private reply: Meta's one message to the person who commented (once per comment, within 7 days), written by
//    Claude: first the free value the reel promised (3-5 short lines, from its topic and text and the clinic's facts),
//    then one soft question that opens the talk; no price unless the reel is about the price or she asks it;
//  - the message in Mesaje (data/social-conversations.json, the shapes of api/_lib/social-inbox.js), where her answer
//    threads; marked `auto` (an automatic message is not a person's answer: api/_lib/wa-waiting.js);
//  - when she answers it: a lead in the Pipeline (Lead nou), once (onReply, from the messages' webhook).
// One message per person per word per 30 days. Meta refusing (a permission, the 7 days): the error is kept, she is asked
// publicly to write to us (social-comments.js), the owner hears once a day.
//   match(c, post)              the item and the word a comment asks for, or null (then the usual answer)
//   deliver(c, hit, token)      the private message: { sent } | { already } | { refused } | { error } (try again later)
//   onReply(channel, senderId)  her message in Mesaje → the lead, once per message we sent her (with the item it came
//                               from, lead.organic, for Conținut → Rezultate's funnel)
//   summary()                   for the health check: the last 7 days, without names
// data/content/dm.json: { sent: [{ id, channel, from: <her id on the comment>, to: <her id in Messenger / Instagram
//   Direct>, name, keyword, kw, itemId, kind, topic, commentId, postId, state: sending|sent|refused, at, messageId, text,
//   error, leadId, leadAt, leadError }], told: <the day the owner heard of a refusal>, lastError }

const crypto = require('crypto');
const { readJSON, writeJSON, readJSONTagged, writeJSONIf } = require('./store');
const ads = require('./meta-ads');

const KEY = 'data/content/dm.json';
const ITEMS_KEY = 'data/content/items.json'; // api/_lib/content.js KEY
const INBOX_KEY = 'data/social-conversations.json'; // api/_lib/social-inbox.js KEY
const EVERY_MS = 30 * 864e5;
const KEEP_MS = 120 * 864e5;
const KEEP = 3000;
const HOLD_MS = 5 * 60e3; // a message on its way holds the place (two comments of hers at once)
const LEAD_HOLD_MS = 2 * 60e3; // a lead being made (two messages of hers at once)
const MAX_BYTES = 950; // Instagram takes at most 1000 bytes in a message
const CHANNELS = { fb: 'Facebook', ig: 'Instagram' };

// ---------------------------------------------------------------- the link (the owner, 21.11: every organic touch can end
// in a sale, measured). The AI-written message stays without links (its own rules); one line built here, never by the
// model, is added after it: the page that answers the word, tagged with where she came from (utm_source = the network,
// utm_medium = dm, utm_campaign = the word), so the card order or the lead made on that page counts it.
const SITE = 'https://www.centrul360.com';
const NET_SRC = { ig: 'instagram', fb: 'facebook' };
// a word or a topic → which page; the first rule that matches wins (the card before everything: it is the season's offer)
const ROUTES = [
  { re: / (card|carduri|cardul|cadou|cadoul|sarbatori|craciun) /, to: 'card' },
  { re: / (consult|consultatie|consultatia|consultatii|programare|programez|programeaza) /, to: 'consult' },
  { re: / (gusa|guse|barbie|barbia|contur|gat) /, to: 'gusa', din: 'gusa', page: '/gusa-barbie-dubla' },
  { re: / (abdomen|burta|burtica|talie|talia|grasime|grasimea|liposonix|lipo|cavitatie|ems) /, to: 'abdomen', din: 'abdomen', page: '/grasime-localizata' },
  { re: / (celulita|celulitei|coapse|fese) /, to: 'celulita', din: 'celulita', page: '/celulita' },
  { re: / (riduri|ridurile|fata|ten|lifting|restart|facial|pleoape|ochi) /, to: 'fata', din: 'fata', page: '/riduri-linii-fine' },
  { re: / (laser|epilare|epilarea|par|picioare|axile) /, to: 'laser', din: 'laser', page: '/epilare-laser' },
];
const LINE = { card: 'Cardul de Sărbători îl găsiți aici: ', consult: 'Vă alegeți ziua și ora aici: ', zone: 'Variantele și prețurile, aici: ', home: 'Totul despre noi, aici: ' };
// /start (the link in bio, with the reel's topic on top) once it is live; until then the topic's own page
let startLive = { at: 0, ok: false };
async function hasStart() {
  if (Date.now() - startLive.at < 3600e3) return startLive.ok;
  let ok = false;
  try { const r = await fetch(SITE + '/start', { method: 'HEAD', redirect: 'manual' }); ok = r.status === 200; } catch (e) { ok = startLive.ok; }
  startLive = { at: Date.now(), ok };
  return ok;
}
function routeOf(keyword, topic) {
  const w = words(keyword), t = words(topic);
  return ROUTES.find((r) => r.re.test(w)) || ROUTES.find((r) => r.re.test(t)) || null;
}
// → { url, line } for this word, on this network
async function linkFor(channel, keyword, topic) {
  const r = routeOf(keyword, topic);
  const tag = (camp) => 'utm_source=' + (NET_SRC[channel] || 'instagram') + '&utm_medium=dm&utm_campaign=' + encodeURIComponent(camp || 'organic');
  const camp = kwOf(keyword).replace(/ /g, '-').slice(0, 30) || (r && r.to) || 'organic';
  let url, line;
  if (!r) { url = SITE + '/?' + tag(camp); line = LINE.home; }
  else if (r.to === 'card') { url = SITE + '/card-sarbatori?' + tag('card'); line = LINE.card; }
  else if (r.to === 'consult') { url = SITE + '/programare?' + tag(camp); line = LINE.consult; }
  else if (await hasStart()) { url = SITE + '/start?din=' + r.din + '&' + tag(camp); line = LINE.zone; }
  else { url = SITE + r.page + '?' + tag(camp); line = LINE.zone; }
  return { url, line: line + url, to: r ? r.to : 'home' };
}
const KIND_WORD = { reel: 'reel', carousel: 'carusel', slideshow: 'slideshow', story: 'story' };
const g = (method, path, token, params) => ads.call(method, path, token, params);
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const metaErr = (j) => { const e = (j && j.error) || {}; return String(e.error_user_msg || e.message || 'Meta n-a răspuns').slice(0, 300); };
const roDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(t ? new Date(t) : new Date());

// ---------------------------------------------------------------- the word
// „GUȘĂ”, „Gușa”, „GUŞĂ” (cedilla), „gusa” are the same word: no case, no diacritics, only letters and digits
const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = (s) => ' ' + fold(s).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
const kwOf = (k) => words(k).trim();
function hasKeyword(text, keyword) {
  const k = kwOf(keyword);
  return k.length >= 2 && words(text).includes(' ' + k + ' ');
}
// she asks for it: a short comment („gusa”, „vreau gusa 🙏”), the word first or last, or a word that asks („vreau”,
// „trimite”, „și eu”); a longer comment with the word somewhere inside („am scăpat de gușă la voi, recomand!”) gets the
// usual answer (a praise keeps its pin)
const ASKS = /(^| )(vreau|vrem|as vrea|doresc|trimite|trimiteti|trimiti|trimiteti mi|astept|info|informatii|detalii|te rog|va rog|pls|please|si eu|si mie)( |$)/;
// anger or a complaint with the word in it goes the usual way (hidden or deleted, the team told)
const ANGRY = /(^| )(teapa|tepari|escroc\w*|hoti|hotie|furt|mizerie|bani aruncati|banii aruncati|nu functioneaza|nu merge|minciun\w*|penibil\w*|jeg\w*|proast\w*|ridicol\w*|rusine)( |$)/;
function asksFor(text, keyword) {
  if (!hasKeyword(text, keyword)) return false;
  const w = words(text).trim(), k = kwOf(keyword);
  if (ANGRY.test(w)) return false;
  const n = w ? w.split(' ').length : 0;
  return n <= 6 || w.startsWith(k + ' ') || w.endsWith(' ' + k) || ASKS.test(w);
}
// the word a post asks for in its own text, when it is not one of our items: „Scrie «GUȘĂ» în comentarii”
const CTA = [
  /(?:scrie|scrieți|scrieti|comenteaz[aă]|comentați|comentati|las[aă])(?:-ne)?\s+(?:doar\s+)?(?:cuv[aâ]ntul\s+)?[«"„“'‘]\s*([^»"”'’\n]{2,30}?)\s*[»"”'’]/iu,
  /scrie(?:-ne)?\s+(?:cuv[aâ]ntul\s+)?([\p{L}\p{N}]{2,30})\s+(?:[iî]n|la)\s+comentari/iu,
];
function keywordIn(text) {
  for (const re of CTA) { const m = re.exec(String(text || '')); if (m && kwOf(m[1])) return clip(m[1], 30); }
  return '';
}

// the same post: Instagram gives the media id we posted; Facebook gives <page>_<post> (a reel we posted is kept by its
// video id, which is in the post's link)
function samePost(e, postId, link) {
  const a = String(e.postId || ''), b = String(postId || '');
  if (a && b && (a === b || a.split('_').pop() === b.split('_').pop())) return true;
  if (a.length >= 6 && link && String(link).includes(a)) return true;
  const bare = (u) => String(u || '').replace(/^https?:\/\/(www\.|m\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  return !!(e.url && link && bare(e.url) === bare(link));
}
const postedAt = (it) => (it.plan || []).filter((e) => e.state === 'posted').reduce((m, e) => { const t = String(e.postedAt || e.at || ''); return t > m ? t : m; }, '');
const brief = (it, net) => ({ id: it.id || '', kind: it.kind || '', topic: clip(it.topic, 160), rubric: clip(it.rubric, 60),
  caption: clip((it.captions && it.captions[net]) || it.caption, 1500) });

// The item and the word a comment asks for: the item posted on this very post first, then any item we posted with that
// word (a comment on another post, an ad), then a post's own „Scrie «X» în comentarii”. null: not a keyword comment.
async function match(c, post) {
  if (!c || !c.text) return null;
  const p = post || {};
  const raw = await readJSON(ITEMS_KEY, []);
  const items = (Array.isArray(raw) ? raw : []).filter((it) => it && it.keyword && !it.removed && asksFor(c.text, it.keyword));
  const here = items.find((it) => (it.plan || []).some((e) => (e.net === 'ig' || e.net === 'fb') && samePost(e, c.postId, p.link)));
  if (here) return { item: brief(here, c.channel), keyword: here.keyword, how: 'post' };
  const any = items.filter(postedAt).sort((x, y) => postedAt(y).localeCompare(postedAt(x)))[0];
  if (any) return { item: brief(any, c.channel), keyword: any.keyword, how: 'item' };
  const kw = keywordIn(p.text);
  if (kw && asksFor(c.text, kw)) return { item: { id: '', kind: '', topic: '', rubric: '', caption: clip(p.text, 1500) }, keyword: kw.toUpperCase(), how: 'caption' };
  return null;
}

// ---------------------------------------------------------------- the store
const blank = () => ({ sent: [], told: '', lastError: '' });
async function update(fn) {
  for (let i = 0; i < 6; i++) {
    const { data, etag } = await readJSONTagged(KEY, null);
    const d = Object.assign(blank(), data || {});
    if (!Array.isArray(d.sent)) d.sent = [];
    const out = await fn(d);
    if (out === false) return d;
    const old = Date.now() - KEEP_MS;
    d.sent = d.sent.filter((e) => Date.parse(e.at) > old);
    if (d.sent.length > KEEP) d.sent.splice(0, d.sent.length - KEEP);
    if (await writeJSONIf(KEY, d, etag)) return d;
  }
  throw new Error('content dm: busy');
}
const load = async () => { const d = Object.assign(blank(), (await readJSON(KEY, null)) || {}); if (!Array.isArray(d.sent)) d.sent = []; return d; };
const settle = (id, fields) => update((d) => { const e = d.sent.find((x) => x.id === id); if (!e) return false; Object.assign(e, fields); });
const drop = (id) => update((d) => { const n = d.sent.length; d.sent = d.sent.filter((x) => x.id !== id); return d.sent.length !== n; });

// ---------------------------------------------------------------- the message
const RULES = `Scrii mesajul privat pe care clinica Centrul360 îl trimite cuiva care a scris în comentarii cuvântul cerut de o postare a clinicii (un clip sau un carusel, pe Instagram sau Facebook). Postarea i-a promis: „Scrie cuvântul în comentarii și îți trimitem…”. Acum îi trimiți ce i s-a promis. Centrul360: două clinici de medicină estetică non-invazivă, în Timișoara și Arad (corp, față, epilare laser).

Cum scrii:
- în română, cu diacritice, cald și firesc, ca echipa clinicii, la plural („noi”, „vă trimitem”); îi vorbești cu „dumneavoastră” (vă, v-ar plăcea), frumos și respectuos, nu rigid (proprietarul, 14.11);
- primul rând: un salut scurt („Bună ziua!” sau „Bună ziua, <prenumele ei>!” dacă îl ai), cu o mulțumire scurtă;
- apoi valoarea, gratis și pe loc: 3-5 rânduri scurte, fiecare pe rândul lui, cu exact ce a promis postarea pentru cuvântul ăsta, concret și util, din tema și textul ei și din datele clinicii primite; ușor de citit pe telefon, fără introduceri;
- ultimul rând: o singură întrebare blândă care deschide conversația, despre ce își dorește ea, de exemplu „Vrei să-ți spunem ce s-ar potrivi pentru tine?”;
- fără presiune: fără „grăbește-te”, „ultimele locuri”, „doar azi”; nu ceri telefonul și nu propui programarea în mesajul ăsta;
- fără prețuri, sume sau reduceri, cu o singură excepție: ți se spune că poți da prețul (postarea e despre preț sau ea îl cere); atunci doar prețul exact din „Ofertele active”, cu orașul lui;
- fără linkuri și fără numere de telefon;
- doar din datele primite: nu inventezi rezultate, procente, termene, garanții, aparate, nume de specialiste sau promisiuni medicale; nu pui diagnostice; la ce ține de cazul ei medical spui că la consultația gratuită specialista verifică ce i se potrivește;
- nu spui niciodată că are o problemă cu corpul sau fața ei; vorbești despre ce își dorește;
- nu spui niciodată un nume pentru tine și nu spui și nu lași să se înțeleagă că ești AI, bot, asistent, program sau mesaj automat;
- fără liniuțe lungi (— sau –), fără hashtaguri, fără titluri, fără bold; cel mult un emoji în tot mesajul, unul dintre ❤️ 🥰 💞;
- tot mesajul sub 650 de caractere.

Răspunzi DOAR cu un obiect JSON, fără alt text: {"dm": "<mesajul, cu rândurile despărțite de \\n>"}`;

const FORBIDDEN = /\b(nuki|bot|chatbot|asistent(a|ul|ă)?|virtual[ăa]?|automat(ă|a|e|ic)?|inteligen[țţt][aă] artificial[aă]|robot)\b/i;
const FORBIDDEN_CASE = /\bA\.?I\b/; // „AI”, never the Romanian „ai”
const ABOUT_PRICE = /pre[tț]|cost|tarif|lei\b|ofert|reducer|promo/i;
const MONEY = /\d[\d.,]*\s*(lei|ron|eur|euro|€)(?![\p{L}])|\b(lei|ron)\b/iu;
const LINK = /https?:\/\/|www\.|\.(com|ro)\b/i;
const PHONE = /\b0\s?7\d{2}[\s.]?\d{3}[\s.]?\d{3}\b/;
const PICTO = /(❤️|🥰|💞)|[\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}]/gu;

let facts = null; // the offers and hours, read once in a while (the same as social-comments.js)
async function factsText() {
  if (facts && Date.now() - facts.at < 10 * 60e3) return facts.text;
  const N = require('../portal-nuki').lib;
  const [offers, hours] = await Promise.all([N.offersText().catch(() => ''), N.hoursText().catch(() => '')]);
  const text = 'Acum: ' + new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' }) + '.\n\nOfertele active:\n' + (offers || '-') + '\n\nClinicile:\n' + (hours || '-') + '\n\n' + N.FACTS;
  facts = { at: Date.now(), text };
  return text;
}
function readJSONish(text) {
  const m = /\{[\s\S]*\}/.exec(String(text || ''));
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}
// her first name, when the comment's name looks like one (Facebook)
function firstName(c) {
  if (!c || c.channel !== 'fb') return '';
  const w = String((c.from && c.from.name) || '').trim().split(/\s+/)[0] || '';
  return /^\p{Lu}\p{Ll}{1,19}$/u.test(w) ? w : '';
}
// one line per line, no long dashes, at most one of our emoji, no other
function tidy(raw) {
  let kept = 0;
  const t = require('./dedash').dedash(String(raw || '')).replace(/\r/g, '').replace(/^["„“\s]+|["”“\s]+$/g, '')
    .replace(PICTO, (m, ours) => (ours && kept++ < 1 ? ours : ''));
  return t.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').replace(/\s+([?.!,])/g, '$1').trim()).filter(Boolean).join('\n');
}
// what is wrong with it ('' when it can go)
function problem(t, priceOk, maxBytes) {
  if (!t) return 'mesajul e gol';
  if (FORBIDDEN.test(t) || FORBIDDEN_CASE.test(t)) return 'fără nume pentru tine și fără să spui că ești AI, bot, asistent sau mesaj automat';
  const lines = t.split('\n');
  if (!lines[lines.length - 1].includes('?')) return 'ultimul rând e o singură întrebare blândă';
  if (lines.length < 3 || lines.length > 8) return 'un salut, 3-5 rânduri scurte, o întrebare';
  if (!priceOk && MONEY.test(t)) return 'fără prețuri sau sume';
  if (LINK.test(t) || PHONE.test(t)) return 'fără linkuri și fără numere de telefon';
  if (Buffer.byteLength(t) > (maxBytes || MAX_BYTES)) return 'mai scurt, sub ' + Math.max(300, Math.round(((maxBytes || MAX_BYTES) * 650) / MAX_BYTES / 10) * 10) + ' de caractere';
  return '';
}
// the message, by Claude: { text } or { error }
// the card's own facts, for a message about the card (it is not in „Ofertele active”): from the card's terms module when
// there is one (api/_lib/card-terms.js, the card session's), else these, checked against the card audit (24.11): always
// what she pays before what she gets; the online bonus; Black Friday while it runs (24.11 – 29.11 23:59, Romania)
const BF_FROM = Date.parse('2026-11-23T22:00:00Z'), BF_TO = Date.parse('2026-11-29T21:59:59Z');
// Black Friday on: the card's terms module says so when it exists (its own switch), else 24.11 00:00 – 29.11 23:59:59 Romania
function bfOn(T, t) {
  const f = T && (T.isBlackFriday || T.blackFriday || T.bfActive || T.bfOn);
  if (typeof f === 'function') { try { const v = f(t); if (typeof v === 'boolean') return v; if (v && typeof v === 'object' && 'on' in v) return !!v.on; } catch (e) { /* the dates below */ } }
  return t >= BF_FROM && t <= BF_TO;
}
function cardFacts(now) {
  try {
    let T = null;
    try { T = require('./card-terms'); } catch (e) { T = null; }
    if (T && typeof T.factsText === 'function') { const x = T.factsText(now); if (x) return String(x); }
    const C = (() => { try { return require('./card-sarbatori'); } catch (e) { return {}; } })();
    const lei = (n) => Number(n).toLocaleString('ro-RO');
    const credit = (t, d) => (C.TIERS && Number(C.TIERS[t])) || d;
    const t = now || Date.now();
    const until = C.DEADLINE ? new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'long' }).format(new Date(C.DEADLINE)) : '24 decembrie';
    return 'Cardul de Sărbători Centrul360: plătești 490 lei și primești ' + lei(credit(490, 1000)) + ' lei în tratamente; plătești 990 lei și primești ' + lei(credit(990, 2500)) +
      ' lei în tratamente; Cardul VIP Transformarea 360: plătești 9.900 lei și primești ' + lei(credit(9900, 30000)) + ' lei în tratamente, pentru tine și cei dragi. ' +
      'Pentru orice tratament din clinică, în Timișoara și Arad, valabil până pe 30.06.2027. ' +
      'La plata online (cu cardul): la cardurile de 490 și 990 lei, în plus o ședință de BioLifting cadou și Clubul 360; la cardul VIP, 10% reducere (plătești 8.910 lei) și Clubul 360. ' +
      (bfOn(T, t) ? 'BLACK FRIDAY, până pe 29 noiembrie la 23:59: la plata online, cardul de 990 lei: plătești 990 lei și primești 3.000 lei în tratamente. Dacă rezervi și plătești în clinică, rămâne 2.500 lei. ' : '') +
      'Se cumpără până pe ' + until + ', online (plata cu cardul) sau rezervat și plătit în clinică; vine pe WhatsApp, pe numele ei sau al celei care îl primește cadou.';
  } catch (e) { return ''; }
}
// the message, by Claude: { text } or { error }. o: { via: 'comment' | 'message' (a story reply or a message with the
// word), maxBytes (room left for the link line), card (the word is about the card) }
async function write(c, hit, o) {
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'Lipsește cheia Claude' };
  const opt = o || {};
  const N = require('../portal-nuki').lib;
  const it = hit.item || {};
  const card = !!opt.card;
  const priceOk = card || ABOUT_PRICE.test([it.topic, it.rubric, hit.keyword].join(' ')) || /c[aâ]t\s+cost|pre[tț]/i.test(c.text || '');
  const system = [{ type: 'text', text: RULES, cache_control: { type: 'ephemeral' } }, { type: 'text', text: await factsText() }];
  const first = firstName(c);
  const what = it.kind === 'carousel' || it.kind === 'slideshow' ? 'caruselului' : it.kind === 'story' ? 'story-ului' : 'clipului';
  const facts = card ? cardFacts() : '';
  const q = ['Canal: ' + CHANNELS[c.channel], 'Cuvântul scris de ea: ' + hit.keyword,
    opt.via === 'message' ? 'Ea n-a scris în comentarii: a răspuns la un story al clinicii (sau ne-a scris direct) cu acest cuvânt. Îi trimiți ce i-a promis story-ul.' : '',
    it.topic ? 'Tema ' + what + ': ' + it.topic : '', it.rubric ? 'Rubrica: ' + it.rubric : '',
    it.caption ? 'Textul de sub postare:\n' + it.caption : '', first ? 'Prenumele ei: ' + first : '',
    (opt.via === 'message' ? 'Mesajul ei: ' : 'Comentariul ei: ') + clip(c.text, 500),
    facts ? 'Datele cardului (singurele prețuri pe care le poți da, exact așa): ' + facts : '',
    card ? 'Poți da prețurile cardului de mai sus; nu inventezi altele și nu spui câte carduri au rămas.' : priceOk ? 'Poți da prețul (postarea e despre preț sau ea îl cere), doar cel exact din „Ofertele active”.' : 'Fără prețuri în mesajul ăsta.',
    'Linkul îl adăugăm noi într-un rând separat, după mesajul tău: tu nu scrii niciun link și nu spui „vezi linkul de mai jos”.'].filter(Boolean).join('\n');
  let why = '';
  for (let i = 0; i < 3; i++) {
    const r = await N.ask(system, [{ role: 'user', content: q + (why ? '\n\nAtenție, încă o dată: ' + why + '.' : '') }]);
    if (r.refused) return { error: 'Claude n-a vrut să scrie mesajul' };
    const j = readJSONish(r.text);
    const t = tidy(j && typeof j.dm === 'string' ? j.dm : j ? '' : r.text);
    why = problem(t, priceOk, opt.maxBytes);
    if (!why) return { text: t };
  }
  return { error: 'Mesajul privat nu a ieșit cum trebuie (' + why + ')' };
}
// the AI's message + the link line, inside Instagram's 1000 bytes: → { text, url } or { error }
async function compose(c, hit, via) {
  const it = hit.item || {};
  const L = await linkFor(c.channel, hit.keyword, [it.topic, it.rubric].join(' '));
  const room = 990 - Buffer.byteLength('\n\n' + L.line);
  const w = await write(c, hit, { via, maxBytes: Math.min(MAX_BYTES, room), card: L.to === 'card' });
  if (w.error) return w;
  return { text: w.text + '\n\n' + L.line, url: L.url, ai: w.text };
}

// ---------------------------------------------------------------- Meta
// a permission, the login, a window that closed, a comment already answered privately: Meta won't, now or later
const transient = (j) => { const e = (j && j.error) || {}; return !!e.is_transient || [1, 2, 4, 17, 32, 613].includes(Number(e.code)); };
const access = (j) => { const e = (j && j.error) || {}; const c = Number(e.code); return c === 10 || c === 190 || (c >= 200 && c < 300) || /permission|not authorized|access token|capability/i.test(String(e.message || '')); };
// an edge Meta no longer has here (the older Facebook private_replies): the next way is tried
const noEdge = (j) => { const e = (j && j.error) || {}; return [3, 12, 100].includes(Number(e.code)) && /unknown path|unsupported|deprecat|nonexist|does not exist|no longer/i.test(String(e.message || '')); };
// The private reply: Meta's Send API to the comment (Messenger and Instagram, the Page's token); on Facebook, when that
// edge is missing, the older /{comment}/private_replies. → { id, to } | { error, transient, access }
async function sendPrivate(c, text, token) {
  const ways = [['/me/messages', { recipient: { comment_id: c.id }, message: { text } }]];
  if (c.channel === 'fb') ways.push(['/' + c.id + '/private_replies', { message: text }]);
  let last = null;
  for (const [path, params] of ways) {
    const r = await g('POST', path, token, params);
    const j = r.j || {};
    if (r.ok && !j.error && (j.message_id || j.id)) return { id: String(j.message_id || j.id), to: String(j.recipient_id || '') };
    last = j;
    if (!noEdge(j)) break;
  }
  return { error: metaErr(last), transient: transient(last), access: access(last) };
}

// the message in Mesaje, in her conversation (made when it isn't there): the way social-inbox.js keeps them
async function toInbox(c, s, text, keyword) {
  const ig = c.channel === 'ig';
  const nm = clip(c.from && c.from.name, 80);
  const msg = { id: s.id, direction: 'out', type: 'text', text, timestamp: new Date().toISOString(), status: 'sent', sentBy: null, sentByName: 'automat', auto: true,
    comment: c.id ? { id: c.id, keyword, postId: c.postId || '' } : undefined, keyword: c.id ? undefined : keyword, via: c.id ? undefined : 'message' };
  for (let i = 0; i < 5; i++) {
    const { data, etag } = await readJSONTagged(INBOX_KEY, []);
    const all = Array.isArray(data) ? data : [];
    let conv = all.find((x) => x.channel === c.channel && x.id === s.to);
    if (!conv) { conv = { channel: c.channel, id: s.to, name: '', username: '', lastMessageAt: '', unreadCount: 0, messages: [] }; all.push(conv); }
    if (!Array.isArray(conv.messages)) conv.messages = [];
    if (ig && !conv.username && /^@/.test(nm)) conv.username = nm.slice(1);
    if (!ig && !conv.name && nm) conv.name = nm;
    // its echo came first (Meta tells the app of what it sent): that one is ours, automatic
    const echo = conv.messages.find((m) => m.id === msg.id);
    if (echo) Object.assign(echo, { auto: true, sentBy: null, sentByName: 'automat' }, msg.comment ? { comment: msg.comment } : { keyword, via: 'message' });
    else {
      conv.messages.push(msg);
      conv.messages.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
      if (msg.timestamp > (conv.lastMessageAt || '')) conv.lastMessageAt = msg.timestamp;
    }
    if (await writeJSONIf(INBOX_KEY, all, etag)) return true;
  }
  throw new Error('content dm: conversations busy');
}

// the owner hears once a day that the private messages don't go
async function tellRefused(c, error) {
  const day = roDay();
  let first = false;
  await update((d) => { d.lastError = clip(CHANNELS[c.channel] + ': ' + error, 300); if (d.told !== day) { d.told = day; first = true; } });
  if (!first) return false;
  const N = require('./notify'), store = { readJSON, writeJSON };
  await N.notifyMany(store, await N.ownerIds(store), { kind: 'alert', tone: 'bad', go: 'integrari', tag: 'dm-refused-' + day,
    title: 'MESAJELE PRIVATE NU PLEACĂ ⚠️', text: CHANNELS[c.channel] + ': ' + clip(error, 90) + '. Le cerem public să ne scrie. Vezi Integrări → Facebook.' }).catch(() => 0);
  return true;
}

// The private message for a keyword comment. { sent: true, text, to } (also when this comment's message went on an
// earlier try), { already: true, at } (she had it for this word in the last 30 days), { refused: true, error } (Meta
// won't: she is asked publicly to write), { error } (Claude or Meta failed for now: try again later).
async function deliver(c, hit, token) {
  const kw = kwOf(hit.keyword);
  const from = String((c.from && c.from.id) || '');
  const now = Date.now();
  let prior = null, mine = null;
  await update((d) => {
    prior = null; mine = null;
    const same = d.sent.find((e) => e.commentId === c.id && e.state === 'sent');
    if (same) { prior = { sent: true, earlier: true, text: same.text, to: same.to, at: same.at }; return false; }
    const had = d.sent.filter((e) => e.channel === c.channel && e.from === from && e.kw === kw)
      .find((e) => (e.state === 'sent' && now - Date.parse(e.at) < EVERY_MS) || (e.state === 'sending' && now - Date.parse(e.at) < HOLD_MS));
    if (had) { prior = { already: true, at: had.at }; return false; }
    mine = { id: crypto.randomUUID(), channel: c.channel, from, to: '', name: clip(c.from && c.from.name, 80), keyword: clip(hit.keyword, 40), kw,
      itemId: (hit.item && hit.item.id) || '', kind: (hit.item && hit.item.kind) || '', topic: clip(hit.item && hit.item.topic, 160), commentId: c.id,
      postId: c.postId || '', state: 'sending', at: new Date(now).toISOString(), messageId: '', text: '', error: '', leadId: '', leadAt: '' };
    d.sent.push(mine);
  });
  if (prior) return prior;
  let done = false;
  try {
    const w = await compose(c, hit, 'comment');
    if (w.error) return { error: w.error };
    const s = await sendPrivate(c, w.text, token);
    if (s.error && s.transient) return { error: CHANNELS[c.channel] + ': ' + s.error };
    if (s.error) {
      await settle(mine.id, { state: 'refused', error: s.error, text: w.text });
      done = true;
      await tellRefused(c, s.error).catch((e) => console.error('content dm tell:', e.message));
      return { refused: true, error: s.error, access: s.access };
    }
    await settle(mine.id, { state: 'sent', to: s.to, messageId: s.id, text: w.text, url: w.url, at: new Date().toISOString() });
    done = true;
    // without her id (the older Facebook edge) the message comes into Mesaje by its echo
    if (s.to) await toInbox(c, s, w.text, hit.keyword).catch((e) => console.error('content dm inbox:', e.message));
    return { sent: true, text: w.text, to: s.to, messageId: s.id };
  } finally {
    // not sent: the place is free again for the next try
    if (!done) await drop(mine.id).catch(() => {});
  }
}

// ---------------------------------------------------------------- her answer → the lead
// the city she says, else the one the item names, else Timișoara (said in the note)
function cityIn(text) {
  const t = words(text);
  const ar = / arad /.test(t), tm = / (timisoara|timis|tm) /.test(t);
  return ar && !tm ? 'Arad' : tm && !ar ? 'Timișoara' : '';
}
// Her message came into Mesaje (api/webhook-facebook-leads.js, after social-inbox ingest): if we sent her a keyword
// message, a lead in the Pipeline, Lead nou, once per message we sent. → { lead, created } | null
async function onReply(channel, senderId) {
  const ch = String(channel || ''), id = String(senderId || '');
  if (!CHANNELS[ch] || !id) return null;
  if (!(await load()).sent.some((e) => e.channel === ch && e.state === 'sent')) return null;
  const convo = ((await readJSON(INBOX_KEY, [])) || []).find((x) => x.channel === ch && x.id === id) || null;
  const ids = new Set(((convo && convo.messages) || []).map((m) => m.id));
  // ours to her: by her id from the send, or by the message in her conversation, or (Instagram) her id on the comment
  const hers = (e) => e.channel === ch && e.state === 'sent' && (e.to === id || (!e.to && e.messageId && ids.has(e.messageId)) || (!e.to && e.from === id));
  const now = Date.now();
  let todo = null;
  await update((x) => {
    todo = null;
    const open = x.sent.filter((e) => hers(e) && !e.leadId).sort((a, b) => (a.at < b.at ? 1 : -1));
    const e = open[0];
    if (!e || (e.leadAt && now - Date.parse(e.leadAt) < LEAD_HOLD_MS)) return false;
    e.leadAt = new Date(now).toISOString();
    if (!e.to) e.to = id;
    todo = JSON.parse(JSON.stringify(e));
  });
  if (!todo) return null;
  const inbound = ((convo && convo.messages) || []).filter((m) => m.direction === 'in').map((m) => m.text || '');
  const item = todo.itemId ? ((await readJSON(ITEMS_KEY, [])) || []).find((it) => it && it.id === todo.itemId) : null;
  const city = cityIn(inbound.join(' ')) || cityIn(item ? [item.topic, item.caption].join(' ') : '') || '';
  const what = KIND_WORD[todo.kind] || 'reel';
  const name = clip((convo && (convo.name || (convo.username ? '@' + convo.username : ''))) || todo.name, 150) || (ch === 'ig' ? 'Clientă Instagram' : 'Clientă Facebook');
  const note = (todo.via === 'message' ? 'A răspuns la story cu ' + todo.keyword + (todo.topic ? ' (' + todo.topic + ')' : '') : 'Din comentariu la ' + what + ': ' + (todo.topic || 'clipul cu ' + todo.keyword) + ' (cuvântul ' + todo.keyword + ')') + (city ? '' : '. Orașul nu l-a spus încă.');
  let r;
  try {
    // the conversation's key in Mesaje stands for the phone: the Pipeline's chat button opens her conversation
    r = await require('../portal-leads').createLead({ name, phone: ch + ':' + id, source: ch === 'ig' ? 'instagram' : 'facebook', location: city || 'Timișoara',
      createdBy: 'content-dm', authorLabel: (todo.via === 'message' ? 'Story ' : 'Comentariu ') + CHANNELS[ch], interest: clip(todo.topic || todo.keyword, 120), note,
      organic: todo.itemId ? { itemId: todo.itemId, keyword: todo.keyword, net: ch } : undefined });
  } catch (e) { r = { error: (e && e.message) || 'eroare' }; }
  const lead = r && r.lead;
  await update((x) => {
    const mine = x.sent.filter((e) => hers(e) && !e.leadId);
    if (lead) mine.forEach((e) => { e.leadId = lead.id; e.leadAt = new Date().toISOString(); delete e.leadError; });
    else { const e = x.sent.find((y) => y.id === todo.id); if (!e) return false; e.leadAt = ''; e.leadError = clip(r && r.error, 120); }
  }).catch((e) => console.error('content dm lead mark:', e.message));
  return lead ? { lead: lead.id, created: !r.duplicate } : null;
}

// ---------------------------------------------------------------- a story reply or a message with the word
// The stories end with „Răspunde cu CARD / GUȘĂ / CONSULT” (the owner, 21.11). Her answer comes in as a message (Instagram
// Direct or Messenger: api/_lib/social-inbox.js, „Răspuns la story: …”), inside the 24 hours Meta gives to answer. When it
// is the word (a short message: the same test as a comment's), she gets the same kind of message as from a comment (the
// value, one gentle question, the link line), once per person and word in 30 days; her next message makes the lead
// (onReply). Not when someone of the team wrote to her in the last 2 hours (they are talking already).
const STORY_WORDS = ['CARD', 'GUȘĂ', 'CONSULT'];
const STORY_TOPIC = { card: 'Cardul de Sărbători', gusa: 'HIFU pe gușă, o singură ședință', consult: 'Consultația gratuită' };
const TEAM_QUIET_MS = 2 * 3600e3;
async function onMessage(f, token) {
  const ch = String((f && f.channel) || ''), id = String((f && f.id) || '');
  if (!CHANNELS[ch] || !id) return null;
  const text = String(f.text || '').replace(/^Răspuns la story:\s*/i, '').trim();
  if (!text || text.length > 120) return null;
  const raw = await readJSON(ITEMS_KEY, []);
  const items = (Array.isArray(raw) ? raw : []).filter((it) => it && it.keyword && !it.removed);
  const words0 = STORY_WORDS.concat(items.map((it) => it.keyword)).filter((k, i, a) => a.findIndex((x) => kwOf(x) === kwOf(k)) === i);
  const keyword = words0.find((k) => asksFor(text, k));
  if (!keyword) return null;
  const kw = kwOf(keyword);
  // the team is talking with her: no automatic message in the middle
  const convo = ((await readJSON(INBOX_KEY, [])) || []).find((x) => x.channel === ch && x.id === id) || null;
  const now = Date.now();
  if (((convo && convo.messages) || []).some((m) => m.direction === 'out' && !m.auto && now - Date.parse(m.timestamp) < TEAM_QUIET_MS)) return { skipped: 'team' };
  // the item that asked for the word: a story posted lately first, then any posted item with it
  const withKw = items.filter((it) => kwOf(it.keyword) === kw).sort((x, y) => postedAt(y).localeCompare(postedAt(x)));
  const src = withKw.find((it) => it.kind === 'story' && postedAt(it)) || withKw.find(postedAt) || null;
  const route = routeOf(keyword, '');
  const item = src ? brief(src, ch) : { id: '', kind: 'story', topic: STORY_TOPIC[route ? route.to : ''] || '', rubric: '', caption: '' };
  let prior = null, mine = null;
  await update((d) => {
    prior = null; mine = null;
    const had = d.sent.filter((e) => e.channel === ch && (e.from === id || e.to === id) && e.kw === kw)
      .find((e) => (e.state === 'sent' && now - Date.parse(e.at) < EVERY_MS) || (e.state === 'sending' && now - Date.parse(e.at) < HOLD_MS));
    if (had) { prior = { already: true, at: had.at }; return false; }
    mine = { id: crypto.randomUUID(), via: 'message', channel: ch, from: id, to: id, name: clip(f.name, 80), keyword: clip(keyword, 40), kw, itemId: item.id || '', kind: item.kind || 'story',
      topic: clip(item.topic, 160), commentId: '', postId: '', state: 'sending', at: new Date(now).toISOString(), messageId: '', text: '', error: '', leadId: '', leadAt: '' };
    d.sent.push(mine);
  });
  if (prior) return prior;
  let done = false;
  try {
    const c = { id: '', channel: ch, text, from: { id, name: f.name || '' } };
    const w = await compose(c, { item, keyword }, 'message');
    if (w.error) return { error: w.error };
    let tok = token;
    if (!tok) tok = (await require('./facebook').loadConnection(readJSON)).pageAccessToken;
    if (!tok) return { error: 'Facebook nu e conectat' };
    const r = await g('POST', '/me/messages', tok, Object.assign({ recipient: { id }, message: { text: w.text } }, ch === 'fb' ? { messaging_type: 'RESPONSE' } : {}));
    const j = r.j || {};
    if (!r.ok || j.error || !j.message_id) {
      const e = metaErr(j);
      if (transient(j)) return { error: CHANNELS[ch] + ': ' + e };
      await settle(mine.id, { state: 'refused', error: e, text: w.text });
      done = true;
      await tellRefused(c, e).catch(() => {});
      return { refused: true, error: e, access: access(j) };
    }
    await settle(mine.id, { state: 'sent', messageId: String(j.message_id), text: w.text, url: w.url, at: new Date().toISOString() });
    done = true;
    await toInbox(c, { id: String(j.message_id), to: id }, w.text, keyword).catch((e) => console.error('content dm inbox:', e.message));
    return { sent: true, text: w.text, messageId: String(j.message_id) };
  } finally {
    if (!done) await drop(mine.id).catch(() => {});
  }
}

// ---------------------------------------------------------------- health
async function summary() {
  const d = await load();
  const since = Date.now() - 7 * 864e5;
  const week = d.sent.filter((e) => Date.parse(e.at) > since);
  const count = (f) => week.filter(f).length;
  return { sent7d: count((e) => e.state === 'sent'), fromStories7d: count((e) => e.state === 'sent' && e.via === 'message'), refused7d: count((e) => e.state === 'refused'), leads7d: count((e) => e.leadId),
    words: [...new Set(week.map((e) => e.keyword))].slice(0, 20), told: d.told || '', lastError: d.lastError || '' };
}

module.exports = { KEY, EVERY_MS, fold, hasKeyword, asksFor, keywordIn, samePost, match, write, compose, linkFor, routeOf, cardFacts, sendPrivate, deliver, onReply, onMessage, summary, cityIn, problem, tidy };
