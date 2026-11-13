// What a client sends besides words, read for Nuki and for the team (the owner, 13.11: „vreau să poată Nuki să asculte
// și vocale și să citească și poze și tot ce mai poate să trimită clientele”).
//   - A voice note is written out by Gemini (Claude doesn't take audio), word for word, in the language she speaks, with
//     no summary, once: when it arrives (api/webhook-whatsapp.js, api/_lib/social-inbox.js, after the answer to Meta) or,
//     when still missing, when Nuki needs it or someone taps „Transcrie” in Mesaje. Saved on the message:
//     transcript, transcriptAt (a failure: transcriptFails, transcriptErr).
//   - A short video gets one line from Gemini, what is shown and what is said in it: seen, seenAt (seenFails, seenErr).
//   - forNuki(key): the conversation as the store has it (never the browser's copy), the transcripts as the messages'
//     text and her newest photos, PDFs and text files as Claude content blocks (api/portal-nuki.js).
// Gemini: Vertex AI (VERTEX_API_KEY, the GCP credit) first, then the Gemini API (GEMINI_API_KEY). A failure, a missing
// file or one too big leaves the label as before („Mesaj vocal”, „Poză”), and nothing else changes.
// Privacy: nothing here is ever logged, no transcript, no message text, no file name; only lengths, times and codes.

const { readJSON, readBinary } = require('./store');

const WA_KEY = 'data/whatsapp-conversations.json';
const MODEL = 'gemini-3.5-flash';
const SPARE = 'gemini-3.5-flash-lite'; // when the first model isn't there (404)
const MAX_AV = 10e6; // a voice note or a video sent inline to Gemini (its request limit, and the Worker's memory: ~3x this in flight)
const MAX_TRIES = 3; // failed automatic tries before they stop (the „Transcrie” button still tries)
const COOL_MS = 10 * 60e3; // after a failure, the automatic tries of that message wait this long (in this instance)
const IMG_MAX = 3.7e6; // Claude: 5 MB an image (base64), 8000 px a side
const PDF_MAX = 8e6, PDF_PAGES = 30, TEXT_CHARS = 30000, FILES_MAX = 16e6;
const LABELS = ['Poză', 'Document', 'Mesaj vocal', 'Video', 'Sticker', 'Fișier', 'Atașament'];
const nowISO = () => new Date().toISOString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (e) => String((e && (e.code || e.name)) || 'error').slice(0, 40);

const HEAR = 'Transcrie exact, cuvânt cu cuvânt, ce spune persoana în acest mesaj vocal, în limba în care vorbește (de obicei română, cu diacritice). ' +
  'Fără rezumat, fără comentarii, fără ghilimele, fără marcaje de timp, fără numele vorbitorului. Punctuație firească; numerele și orele le poți scrie cu cifre. ' +
  'Un cuvânt care nu se înțelege: [neclar]. Dacă nu se aude nicio vorbire, scrie doar: [fără vorbire]';
const SEE = 'Spune într-un singur rând, în română, ce se vede în acest video și ce se spune în el (cuvintele importante, cum se aud). ' +
  'Începe direct cu ce se vede (nu cu „În video” sau „Videoclipul”), fără ghilimele la început, cel mult două propoziții scurte.';

// ---------------------------------------------------------------- Gemini
let lastGood = ''; // the way that answered last goes first next time
function engines() {
  const list = [];
  if (process.env.VERTEX_API_KEY) list.push({ name: 'vertex', key: process.env.VERTEX_API_KEY, url: (m) => 'https://aiplatform.googleapis.com/v1/publishers/google/models/' + m + ':generateContent' });
  if (process.env.GEMINI_API_KEY) list.push({ name: 'gemini', key: process.env.GEMINI_API_KEY, url: (m) => 'https://generativelanguage.googleapis.com/v1beta/models/' + m + ':generateContent' });
  return list.sort((a, b) => (b.name === lastGood) - (a.name === lastGood));
}
// one answer from Gemini within ms: { text, engine, model } or { error } (a code, never what was said)
async function gemini(parts, gen, ms) {
  const until = Date.now() + ms;
  const list = engines();
  if (!list.length) return { error: 'no_key' };
  let why = '';
  for (const e of list) {
    for (const model of [MODEL, SPARE]) {
      const left = until - Date.now();
      if (left < 1500) return { error: why || 'timeout' };
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), left);
      try {
        const r = await fetch(e.url(model), {
          method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': e.key },
          body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: gen }),
        });
        const j = await r.json().catch(() => null);
        const d = Array.isArray(j) ? j[0] : j;
        if (!r.ok) {
          why = e.name + ' ' + r.status + (d && d.error && d.error.status ? ' ' + d.error.status : '');
          if (r.status === 404) continue; // the spare model, same way
          break; // the other way (credit, key, limit, a server error)
        }
        const c = ((d && d.candidates) || [])[0] || {};
        const text = ((c.content && c.content.parts) || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
        if (!text) return { error: e.name + ' empty' + (c.finishReason ? ' ' + c.finishReason : '') };
        lastGood = e.name;
        return { text, engine: e.name, model };
      } catch (err) {
        if (err && err.name === 'AbortError') return { error: e.name + ' timeout' };
        why = e.name + ' network';
        break;
      } finally { clearTimeout(t); }
    }
  }
  return { error: why || 'failed' };
}
// her words as one tidy paragraph: no long dashes (the owner's rule), no quotes around it, not endless
function tidy(s, max) {
  let t = String(s || '').replace(/^\s*["„“”']+|["„“”']+\s*$/g, '').replace(/\s+[—–]\s+/g, ', ').replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim();
  if (t.length > max) t = t.slice(0, max - 1).trim() + '…';
  return t;
}
function avMime(mime, kind) {
  const m = String(mime || '').split(';')[0].trim().toLowerCase();
  if (m === 'audio/mpeg') return 'audio/mp3';
  if (m === 'audio/x-m4a' || m === 'audio/m4a') return 'audio/mp4';
  if (/^(audio|video)\/[\w.+-]+$/.test(m)) return m;
  return kind === 'video' ? 'video/mp4' : 'audio/ogg';
}
// a voice note, word for word: { text, ms, engine, model } or { error }
async function transcribe(buf, mime, ms) {
  const t0 = Date.now();
  const r = await gemini([{ inline_data: { mime_type: avMime(mime, 'audio'), data: buf.toString('base64') } }, { text: HEAR }],
    { temperature: 0, maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: 'minimal' } }, ms);
  return r.error ? r : Object.assign(r, { text: tidy(r.text, 6000), ms: Date.now() - t0 });
}
// a short video in one line: what is shown and what is said
async function describe(buf, mime, ms) {
  const t0 = Date.now();
  const r = await gemini([{ inline_data: { mime_type: avMime(mime, 'video'), data: buf.toString('base64') } }, { text: SEE }],
    { temperature: 0.2, maxOutputTokens: 400, thinkingConfig: { thinkingLevel: 'minimal' }, mediaResolution: 'MEDIA_RESOLUTION_LOW' }, ms);
  return r.error ? r : Object.assign(r, { text: tidy(r.text, 400), ms: Date.now() - t0 });
}

// ---------------------------------------------------------------- her files
// Meta's own links (Instagram and Messenger files the portal didn't keep): only those are ever fetched
const META_HOST = /(^|\.)(fbsbx\.com|fbcdn\.net|cdninstagram\.com|facebook\.com|instagram\.com)$/i;
// the bytes of a message's file: kept in the store (path), or still at Meta (href); null when gone or bigger than max
async function fileOf(md, max, ms) {
  if (!md) return null;
  if (md.path) {
    const buf = await readBinary(md.path);
    return buf && buf.length <= max ? { buf, mime: md.mime || '' } : buf ? { tooBig: true } : null;
  }
  let u;
  try { u = new URL(String(md.href || '')); } catch (e) { return null; }
  if (u.protocol !== 'https:' || !META_HOST.test(u.hostname)) return null;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms || 15e3);
  try {
    const r = await fetch(u.toString(), { signal: ac.signal });
    if (!r.ok) return null;
    if (Number(r.headers.get('content-length')) > max) return { tooBig: true };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > max) return { tooBig: true };
    return { buf, mime: String(r.headers.get('content-type') || md.mime || '').split(';')[0].toLowerCase() };
  } catch (e) { return null; } finally { clearTimeout(t); }
}

// ---------------------------------------------------------------- where it is saved
async function conversation(key) {
  const SI = require('./social-inbox');
  const k = String(key || '');
  if (SI.isKey(k)) {
    const p = SI.parse(k);
    const c = (await readJSON(SI.KEY, [])).find((x) => x && x.channel === p.channel && x.id === p.id);
    return c ? { key: k, channel: p.channel, convo: c } : null;
  }
  if (!k) return null;
  const c = (await readJSON(WA_KEY, [])).find((x) => x && x.phone === k);
  return c ? { key: k, channel: 'wa', convo: c } : null;
}
function save(key, id, fields) {
  const SI = require('./social-inbox');
  return (SI.isKey(key) ? SI.setOnMessage(key, id, fields) : require('./wa-convos').setOnMessage(key, id, fields)).catch((e) => { console.error('media-read save:', short(e)); return false; });
}

// ---------------------------------------------------------------- one voice note or video
// what a message still needs: 'hear' (a voice note), 'see' (a video) or ''
function need(m) {
  const md = m && m.direction === 'in' && m.media;
  if (!md || md.missing || (!md.path && !md.href)) return '';
  if (md.kind === 'audio' && m.transcript == null) return 'hear';
  if (md.kind === 'video' && m.seen == null) return 'see';
  return '';
}
const cool = new Map(); // message id → when its last automatic try failed
// may it be tried without anyone asking (arrival, Nuki)? not after MAX_TRIES failures, a gone or too big file, or a
// failure a moment ago
function autoOk(m) {
  const w = need(m);
  if (!w) return false;
  const f = w === 'hear' ? 'transcript' : 'seen';
  if ((m[f + 'Fails'] || 0) >= MAX_TRIES || ['too_big', 'no_file'].includes(m[f + 'Err'])) return false;
  const at = cool.get(m.id);
  return !(at && Date.now() - at < COOL_MS);
}
const inflight = new Map(); // message id → the job hearing it now (one at a time here)
// Hears (or watches) one message and saves what Gemini wrote on it: { fields, ms, engine, model } or { error, code }.
// (also when it failed before: the callers that try on their own check autoOk first). opts: { ms: Gemini's time }
function readOne(key, m, opts) {
  const o = opts || {};
  const what = need(m);
  if (!what) return Promise.resolve({ error: 'nothing' });
  if (inflight.has(m.id)) return inflight.get(m.id);
  const job = (async () => {
    const f = what === 'hear' ? 'transcript' : 'seen';
    const file = await fileOf(m.media, MAX_AV, 15e3).catch(() => null);
    const fail = async (code) => {
      cool.set(m.id, Date.now());
      if (cool.size > 500) cool.delete(cool.keys().next().value);
      await save(key, m.id, { [f + 'Fails']: (m[f + 'Fails'] || 0) + 1, [f + 'Err']: code });
      return { error: code };
    };
    if (!file) return fail('no_file');
    if (file.tooBig) return fail('too_big');
    const r = what === 'hear' ? await transcribe(file.buf, file.mime, o.ms || 25e3) : await describe(file.buf, file.mime, o.ms || 25e3);
    if (r.error === 'no_key') return { error: 'no_key' }; // not her file's fault: tried again once a key is there
    if (r.error) { console.warn('media-read ' + what + ': ' + r.error); return Object.assign(await fail('failed'), { why: r.error }); }
    const fields = { [f]: r.text, [f + 'At']: nowISO() };
    await save(key, m.id, fields);
    console.log('media-read ' + JSON.stringify({ what, ms: r.ms, chars: r.text.length, engine: r.engine, model: r.model }));
    return { fields, ms: r.ms, engine: r.engine, model: r.model };
  })().catch((e) => ({ error: 'failed', why: short(e) })).finally(() => inflight.delete(m.id));
  inflight.set(m.id, job);
  return job;
}

// the work kept alive after the answer (Cloudflare / Vercel waitUntil); without it, it is just not awaited
function keepAlive(p) {
  try {
    const c = globalThis[Symbol.for('@vercel/request-context')];
    const ctx = c && typeof c.get === 'function' ? c.get() : null;
    if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p);
  } catch (e) { /* only kept alive */ }
  return p;
}
// New voice notes and videos, just arrived: heard after the answer to Meta (never delaying it), each saved on its message.
// list: [{ key (the phone, or "ig:<id>" / "fb:<id>"), msg }]
function later(list) {
  const jobs = (list || []).filter((x) => x && x.key && x.msg && autoOk(x.msg));
  if (!jobs.length) return Promise.resolve();
  return keepAlive(Promise.all(jobs.map((x) => readOne(x.key, x.msg, { ms: 25e3 }).catch(() => null))).then(() => undefined));
}
// „Transcrie” in Mesaje: one message, now, also when it failed before → { transcript, transcriptAt } | { seen, seenAt } | { error, message }
async function now(key, id) {
  const found = await conversation(key);
  const m = found && (found.convo.messages || []).find((x) => x && x.id === id);
  if (!m) return { error: 'conversation_not_found', code: 404 };
  if (m.transcript != null || m.seen != null) return m.transcript != null ? { transcript: m.transcript, transcriptAt: m.transcriptAt || '' } : { seen: m.seen, seenAt: m.seenAt || '' };
  if (!need(m)) return { error: 'not_audio', code: 400, message: 'Aici nu e un mesaj vocal de transcris.' };
  const r = await readOne(found.key, m, { ms: 40e3 });
  if (r.fields) return r.fields;
  return { error: 'transcribe_failed', code: r.error === 'no_file' ? 410 : r.error === 'too_big' ? 413 : 502,
    message: r.error === 'no_file' ? 'Fișierul nu mai e disponibil.' : r.error === 'too_big' ? 'Mesajul e prea lung pentru transcriere.' : 'Transcrierea nu a mers acum. Încearcă din nou.' };
}

// ---------------------------------------------------------------- for Nuki
// the first bytes say what an image really is, and how big (a wrong media type makes Claude refuse the whole request)
function imageInfo(b) {
  if (!b || b.length < 30) return null;
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { type: 'image/jpeg', h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
    return { type: 'image/jpeg', w: 0, h: 0 };
  }
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return { type: 'image/png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.toString('ascii', 0, 3) === 'GIF') return { type: 'image/gif', w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const f = b.toString('ascii', 12, 16);
    if (f === 'VP8 ') return { type: 'image/webp', w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (f === 'VP8L') { const n = b.readUInt32LE(21); return { type: 'image/webp', w: (n & 0x3fff) + 1, h: ((n >>> 14) & 0x3fff) + 1 }; }
    if (f === 'VP8X') return { type: 'image/webp', w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    return { type: 'image/webp', w: 0, h: 0 };
  }
  return null;
}
// what Claude can see of a message: 'image', 'pdf', 'text' or '' (a sticker, a video, a voice note, an office file)
function attachKind(m) {
  const md = m && m.direction === 'in' && m.media;
  if (!md || md.missing || (!md.path && !md.href) || md.sticker || m.text === 'Sticker') return '';
  const mime = String(md.mime || '').toLowerCase(), name = String(md.filename || '').toLowerCase();
  if (md.kind === 'image' || (md.kind === 'document' && /^image\/(jpeg|png|webp|gif)/.test(mime))) return 'image';
  if (md.kind === 'document' && (/pdf/.test(mime) || /\.pdf$/.test(name))) return 'pdf';
  if (md.kind === 'document' && (/^text\/plain/.test(mime) || /\.txt$/.test(name))) return 'text';
  return '';
}
// one file as a Claude block, or { skip } when it can't go (gone, too big, not what it says)
async function blockOf(m, k) {
  const max = k === 'image' ? 20e6 : k === 'pdf' ? PDF_MAX : 2e6;
  const f = await fileOf(m.media, max, 8e3).catch(() => null);
  if (!f || f.tooBig) return { skip: f ? 'too_big' : 'no_file' };
  const name = String(m.media.filename || '').slice(0, 120);
  if (k === 'image') {
    const info = imageInfo(f.buf);
    if (!info) return { skip: 'type' };
    // (no shrinking here: decoding a big photo in the Worker could run out of memory and take the whole answer down)
    if (f.buf.length > IMG_MAX || info.w > 8000 || info.h > 8000) return { skip: 'too_big' };
    return { size: f.buf.length, block: { type: 'image', source: { type: 'base64', media_type: info.type, data: f.buf.toString('base64') } } };
  }
  if (k === 'pdf') {
    if (f.buf.toString('latin1', 0, 1024).indexOf('%PDF') < 0) return { skip: 'type' };
    const s = f.buf.toString('latin1');
    if (/\/Encrypt\s*(<<|\d+\s+\d+\s+R)/.test(s)) return { skip: 'locked' };
    const pages = (s.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
    if (pages > PDF_PAGES) return { skip: 'too_big' };
    return { size: f.buf.length, block: Object.assign({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.buf.toString('base64') } }, name ? { title: name } : {}) };
  }
  let text = f.buf.toString('utf8').replace(/\u0000/g, '');
  if ((text.match(/�/g) || []).length > 20) return { skip: 'type' };
  if (!text.trim()) return { skip: 'empty' };
  const cut = text.length > TEXT_CHARS;
  if (cut) text = text.slice(0, TEXT_CHARS) + '\n[… fișierul continuă, am pus doar începutul]';
  return { size: text.length, block: Object.assign({ type: 'document', source: { type: 'text', media_type: 'text/plain', data: text } }, name ? { title: name } : {}) };
}
const at = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
// a message's line for Nuki: the transcript in place of „Mesaj vocal”, the video's line, the file's number
function lineText(m, att) {
  const md = m.media, words = String(m.text || '');
  if (!md) return words;
  const caption = !LABELS.includes(words.replace(/^Răspuns la story: /, '')) && words !== md.filename ? words : '';
  if (md.kind === 'audio') return m.transcript != null ? 'Mesaj vocal: „' + m.transcript + '”' : 'Mesaj vocal (nu l-am putut asculta)';
  if (md.kind === 'video') return 'Video' + (m.seen ? ': ' + m.seen : ' (nu l-am văzut)') + (caption ? '. Ea a scris: ' + caption : '');
  if (att) return '[' + (att.k === 'image' ? 'Poza ' + att.n : 'Documentul ' + att.n + (md.filename ? ': ' + md.filename : '')) + ']' + (caption ? ' ' + caption : '');
  if (md.kind === 'image' && words !== 'Sticker' && !md.sticker) return 'Poză (nu o pot vedea)' + (caption ? ': ' + caption : '');
  return words;
}
// For Nuki: her conversation from the store with the voice notes heard and her newest files as Claude blocks.
// opts: { ms: time for the voice notes and videos heard on the spot, max: files as blocks }.
// → { lines: [{ dir, text, at }], blocks, files, heard } or null when the conversation isn't found
async function forNuki(key, opts) {
  const o = Object.assign({ ms: 10e3, max: 5 }, opts);
  const t0 = Date.now();
  const found = await conversation(key);
  if (!found) return null;
  const msgs = (found.convo.messages || []).slice(-30);
  // the voice notes and videos still unheard, the newest first, heard now within the time; one that doesn't finish goes on
  // after the answer (kept alive) and is saved for next time
  let heard = 0;
  const todo = msgs.filter(autoOk).reverse().slice(0, 4);
  if (todo.length && o.ms > 1500) {
    const all = Promise.all(todo.map((m) => readOne(found.key, m, { ms: 25e3 }).then((r) => { if (r && r.fields) { Object.assign(m, r.fields); heard++; } }).catch(() => {})));
    keepAlive(all);
    await Promise.race([all, sleep(o.ms)]);
  }
  // her newest photos, PDFs and text files (the newest first, numbered in the order she sent them)
  const pick = [];
  for (let i = msgs.length - 1; i >= 0 && pick.length < o.max; i--) { const k = attachKind(msgs[i]); if (k) pick.push({ m: msgs[i], k }); }
  pick.reverse();
  const left = Math.max(3e3, o.ms - (Date.now() - t0));
  const got = await Promise.all(pick.map((p) => Promise.race([blockOf(p.m, p.k).catch(() => ({ skip: 'failed' })), sleep(left).then(() => ({ skip: 'slow' }))])));
  const nums = new Map(), blocks = [];
  let total = 0, n = 0;
  pick.forEach((p, i) => {
    const g = got[i];
    if (!g || !g.block || total + g.size > FILES_MAX) return;
    total += g.size;
    n++;
    nums.set(p.m.id, { n, k: p.k });
    const when = at(p.m.timestamp);
    blocks.push({ type: 'text', text: (p.k === 'image' ? 'Poza ' : 'Documentul ') + n + (when ? ' (' + when + ')' : '') + ':' }, g.block);
  });
  if (blocks.length) blocks.unshift({ type: 'text', text: 'Fișierele trimise de clientă (cele mai noi), numerotate ca în conversație:' });
  const lines = msgs.map((m) => ({ dir: m.direction === 'out' ? 'out' : 'in', at: m.timestamp || '', text: lineText(m, nums.get(m.id)) }));
  return { lines, blocks, files: n, heard, ms: Date.now() - t0 };
}

// ---------------------------------------------------------------- the health check
// /api/lead-health?voice=1: the newest stored voice note written out now (nothing saved), only its length, the time and
// ok or the error; and how many of the last 7 days' voice notes have their transcript. Never the text, a phone or a name.
async function probe() {
  const SI = require('./social-inbox');
  const [wa, so] = await Promise.all([readJSON(WA_KEY, []), readJSON(SI.KEY, []).catch(() => [])]);
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const notes = [];
  (Array.isArray(wa) ? wa : []).forEach((c) => (c.messages || []).forEach((m) => { if (m && m.direction === 'in' && m.media && m.media.kind === 'audio') notes.push({ m, src: 'whatsapp' }); }));
  (Array.isArray(so) ? so : []).forEach((c) => (c.messages || []).forEach((m) => { if (m && m.direction === 'in' && m.media && m.media.kind === 'audio') notes.push({ m, src: c.channel === 'ig' ? 'instagram' : 'facebook' }); }));
  const week = notes.filter((x) => String(x.m.timestamp || '') >= since);
  const counts = { week: week.length, transcribed: week.filter((x) => x.m.transcript != null).length, failed: week.filter((x) => x.m.transcript == null && x.m.transcriptFails).length,
    noFile: week.filter((x) => x.m.media.missing || (!x.m.media.path && !x.m.media.href)).length };
  const keys = { vertex: !!process.env.VERTEX_API_KEY, gemini: !!process.env.GEMINI_API_KEY };
  const newest = notes.filter((x) => x.m.media.path || x.m.media.href).sort((a, b) => String(b.m.timestamp || '').localeCompare(String(a.m.timestamp || '')))[0];
  if (!newest) return { ok: false, error: 'no_voice_note', keys, counts };
  const t0 = Date.now();
  const file = await fileOf(newest.m.media, MAX_AV, 15e3).catch(() => null);
  if (!file || file.tooBig) return { ok: false, error: file ? 'too_big' : 'no_file', source: newest.src, keys, counts };
  const r = await transcribe(file.buf, file.mime, 40e3);
  return { ok: !r.error, error: r.error || undefined, chars: r.error ? 0 : r.text.length, ms: Date.now() - t0, geminiMs: r.ms, engine: r.engine, model: r.model,
    source: newest.src, kb: Math.round(file.buf.length / 1024), at: newest.m.timestamp || '', keys, counts };
}

module.exports = { transcribe, describe, need, autoOk, readOne, later, now, forNuki, probe, conversation, imageInfo, attachKind, lineText, LABELS };
