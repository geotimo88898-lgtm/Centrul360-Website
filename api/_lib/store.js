// Shared Vercel Blob read/write helper for the employee portal's JSON "documents".
// Every portal API route goes through here instead of calling @vercel/blob directly,
// so the overwrite/retry semantics only need to be right in one place.
//
// Requires BLOB_READ_WRITE_TOKEN in the environment, this is injected automatically
// by Vercel once a Blob store is created and linked to the project (Project Settings
// → Storage → connect a Blob store). No manual token copying needed.
//
// @vercel/blob API used here (verified live against Vercel's current docs on 2026-10-01,
// see vercel.com/docs/vercel-blob/using-blob-sdk and vercel.com/docs/storage/vercel-blob):
//   - put(pathname, body, { access: 'private', addRandomSuffix: false, allowOverwrite: true })
//     writes/overwrites a blob at a FIXED pathname (no random suffix, so repeated writes
//     to e.g. "data/sales.json" always land at the same address).
//   - get(pathname, { access: 'private' }) reads a blob's content back as a stream;
//     resolves to null if the blob doesn't exist yet (used for first-run bootstrapping).

const { put, get, del, head } = require('@vercel/blob');

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
async function streamToString(stream) {
  return (await streamToBuffer(stream)).toString('utf8');
}

// ---- Read cache ----------------------------------------------------------------------
// Every read still asks the store for the latest version (useCache:false), but tells it which version this instance
// already holds (If-None-Match): an unchanged document comes back as "not modified", without its content. The portal
// reads its big lists tens of thousands of times a day and changes them a few hundred times, and every full read
// from the store is billed as transfer: this keeps the answer exactly as fresh and drops most of that bill.
const CACHE_LIMIT = 64 * 1024 * 1024, ITEM_LIMIT = 8 * 1024 * 1024;
const cache = new Map();
let cachedBytes = 0;
function forget(pathname) {
  const c = cache.get(pathname);
  if (c) { cache.delete(pathname); cachedBytes -= c.buf.length; }
}
function keep(pathname, etag, buf) {
  forget(pathname);
  if (!etag || buf.length > ITEM_LIMIT) return;
  cache.set(pathname, { etag, buf });
  cachedBytes += buf.length;
  for (const [k, v] of cache) { // the least recently read go first
    if (cachedBytes <= CACHE_LIMIT) break;
    cache.delete(k); cachedBytes -= v.buf.length;
  }
}
// The latest content as { buf, etag }, or null when the document doesn't exist. Throws like get().
// A body shorter than the store said (a cut-off read, it happens) is never kept, so the retry reads it whole;
// strict (files): kept only when the store gave the size and it matches.
async function fetchLatest(pathname, strict) {
  const c = cache.get(pathname);
  let result = await get(pathname, c ? { access: 'private', useCache: false, ifNoneMatch: c.etag } : { access: 'private', useCache: false });
  if (result && result.statusCode === 304) {
    const now = cache.get(pathname);
    if (now) { cache.delete(pathname); cache.set(pathname, now); return { buf: now.buf, etag: now.etag }; }
    result = await get(pathname, { access: 'private', useCache: false });
  }
  if (!result) { forget(pathname); return null; }
  const buf = await streamToBuffer(result.stream);
  const etag = (result.blob && result.blob.etag) || '';
  const size = (result.blob && result.blob.size) || 0;
  if (size ? size === buf.length : !strict) keep(pathname, etag, buf);
  else forget(pathname);
  return { buf, etag };
}

// Reads a JSON document from Blob storage. Returns `fallback` only when the blob doesn't exist yet
// (first run). Any other failure (a timeout, a storage error, a half-read big file) is retried, then
// THROWN: answering `fallback` there once made a caller save a near-empty list over data/clients.json
// (9 000 contacts lost). A request that can't read its data must fail, never write over it.
const isNotFound = (err) => err && (err.name === 'BlobNotFoundError' || /not.?found/i.test(err.message || ''));
async function readJSON(pathname, fallback) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // useCache:false, the portal always reads right after writing (every save reloads
      // the whole payload to show the result), so a cached stale read would look exactly
      // like "my change didn't save" even though it did.
      const result = await fetchLatest(pathname);
      if (!result) return fallback;
      const text = result.buf.toString('utf8');
      if (!text) return fallback;
      const data = JSON.parse(text);
      remember(pathname, data, text, result.etag);
      return data;
    } catch (err) {
      if (isNotFound(err)) return fallback;
      lastErr = err;
      forget(pathname);
      console.error(`store.readJSON(${pathname}) error (attempt ${attempt + 1}):`, err.message);
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  const e = new Error('store_read_failed: ' + pathname + ': ' + (lastErr && lastErr.message));
  e.code = 'store_read_failed';
  throw e;
}

// The same document with its version (the blob's ETag), for a change that must not overwrite one made meanwhile
// (writeJSONIf). { data, etag }; a document that doesn't exist yet: { data: fallback, etag: '' }. Throws like readJSON.
async function readJSONTagged(pathname, fallback) {
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await fetchLatest(pathname);
      if (!result) return { data: fallback, etag: '' };
      const text = result.buf.toString('utf8');
      return { data: text ? JSON.parse(text) : fallback, etag: result.etag };
    } catch (err) {
      if (isNotFound(err)) return { data: fallback, etag: '' };
      lastErr = err;
      forget(pathname);
      console.error(`store.readJSONTagged(${pathname}) error (attempt ${attempt + 1}):`, err.message);
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  const e = new Error('store_read_failed: ' + pathname + ': ' + (lastErr && lastErr.message));
  e.code = 'store_read_failed';
  throw e;
}

// ---- Two writers at once --------------------------------------------------------------
// Most writers read a document, change it and write it back. Two that read the same version a moment apart used to write
// over each other: the later one's copy lost what the other had just saved (a lead's new stage, a booking's status, a sent
// message's line, 1-3.11). Each read now remembers what the document was (its text and version), tied to the object it
// returned and to each item of a list; a write of that object goes only onto that version, and when someone wrote in
// between, its changes are put on top of theirs (merge3) instead of over them. A write of an object never read (or
// read elsewhere) writes as before.
const baseOf = new WeakMap();
function remember(pathname, data, text, etag) {
  if (!data || typeof data !== 'object' || !etag) return;
  const b = { pathname, text, etag };
  baseOf.set(data, b);
  if (Array.isArray(data)) for (const x of data) if (x && typeof x === 'object') baseOf.set(x, b);
}
function findBase(pathname, data) {
  if (!data || typeof data !== 'object') return null;
  const b = baseOf.get(data);
  if (b && b.pathname === pathname) return b;
  // a list made from the one read (a filter, a map): its items still point at that read
  if (Array.isArray(data)) for (const x of data) { const e = x && typeof x === 'object' && baseOf.get(x); if (e && e.pathname === pathname) return e; }
  return null;
}
const isPlain = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const js = (x) => (x === undefined ? '\u0000' : JSON.stringify(x));
// the key a list's items are matched by: their id (or phone, or key) when every item has a different one, else the item itself
function listKeys(lists) {
  for (const f of ['id', 'phone', 'key']) {
    const ok = lists.every((l) => { const seen = new Set(); return l.every((x) => isPlain(x) && x[f] != null && x[f] !== '' && !seen.has(String(x[f])) && seen.add(String(x[f]))); });
    if (ok) return (l) => l.map((x) => 'k:' + String(x[f]));
  }
  return (l) => { const n = new Map(); return l.map((x) => { const j = js(x); const c = (n.get(j) || 0) + 1; n.set(j, c); return 'v:' + j + '#' + c; }); };
}
function mergeList(b, m, t) {
  const keys = listKeys([b, m, t]);
  const kb = keys(b), km = keys(m), kt = keys(t);
  const B = new Map(kb.map((k, i) => [k, b[i]])), M = new Map(km.map((k, i) => [k, m[i]]));
  const out = [], seen = new Set();
  kt.forEach((k, i) => {
    const x = t[i];
    seen.add(k);
    if (!M.has(k)) {
      if (B.has(k) && js(x) === js(B.get(k))) return; // I took it out and they didn't touch it: out
      out.push(x); return; // theirs (new, or changed by them after I took it out)
    }
    out.push(B.has(k) ? merge3(B.get(k), M.get(k), x) : M.get(k));
  });
  km.forEach((k, i) => {
    if (seen.has(k)) return;
    const x = m[i];
    if (B.has(k) && js(x) === js(B.get(k))) return; // they took it out and I didn't change it: stays out
    out.splice(Math.min(i, out.length), 0, x); // mine: new here (or changed by me after they took it out), where I put it
  });
  return out;
}
function mergeObj(b, m, t) {
  const out = {};
  for (const k of new Set(Object.keys(t).concat(Object.keys(m)))) {
    const inB = Object.prototype.hasOwnProperty.call(b, k), inM = Object.prototype.hasOwnProperty.call(m, k), inT = Object.prototype.hasOwnProperty.call(t, k);
    if (inM && inT) out[k] = merge3(inB ? b[k] : undefined, m[k], t[k]);
    else if (inM) { if (!(inB && js(m[k]) === js(b[k]))) out[k] = m[k]; } // they took it out: out, unless I changed it
    else if (inT) { if (!(inB && js(t[k]) === js(b[k]))) out[k] = t[k]; } // I took it out: out, unless they changed it
  }
  return out;
}
// base: what I read; mine: what I write; theirs: what is there now. What only one side changed is kept; a value both
// changed is mine (the last writer, as before).
function merge3(b, m, t) {
  const jm = js(m), jt = js(t);
  if (jm === jt) return m;
  if (b !== undefined) { const jb = js(b); if (jm === jb) return t; if (jt === jb) return m; }
  if (Array.isArray(m) && Array.isArray(t)) return mergeList(Array.isArray(b) ? b : [], m, t);
  if (isPlain(m) && isPlain(t)) return mergeObj(isPlain(b) ? b : {}, m, t);
  return m;
}
// the caller's object becomes what was written (it reads on from it)
function replaceInPlace(data, merged) {
  if (Array.isArray(data) && Array.isArray(merged)) { data.length = 0; merged.forEach((x) => data.push(x)); return true; }
  if (isPlain(data) && isPlain(merged)) { Object.keys(data).forEach((k) => { delete data[k]; }); Object.assign(data, merged); return true; }
  return false;
}
const isPrecondition = (err) => err && (err.name === 'BlobPreconditionFailedError' || /precondition/i.test(err.message || ''));
function shrinkCheck(pathname, body, opts) {
  if (!GUARDED.has(pathname) || (opts && opts.allowShrink)) return Promise.resolve();
  return head(pathname).then((h) => (h && h.size) || 0, () => 0).then((before) => {
    if (before > 200 * 1024 && Buffer.byteLength(body) < before * 0.5) {
      console.error(`store.writeJSON(${pathname}) refused: ${Buffer.byteLength(body)} bytes over ${before}`);
      const e = new Error('store_write_refused: ' + pathname);
      e.code = 'store_write_refused';
      throw e;
    }
  });
}

// Writes a JSON document to Blob storage, overwriting whatever is at that pathname.
// opts.quiet: a write the open portals don't need to refresh for (the activity log)
// The big lists the whole portal leans on: a write that would cut one to less than half (and it is
// big) is refused, whatever bug or failed read led to it. Deleting that much by hand never happens.
const GUARDED = new Set(['data/clients.json', 'data/appointments.json', 'data/leads.json', 'data/sales.json']);
async function writeJSON(pathname, data, opts) {
  let body = JSON.stringify(data, null, 2);
  let base = pathname === REV_PATH ? null : findBase(pathname, data);
  let mine = data;
  // the version this request read: written only onto it; someone wrote since: my changes on top of theirs, again
  // (many tries: under a burst every writer gets its turn; a blind write after them is the old behaviour, kept as a last resort)
  for (let attempt = 0; base && attempt < 25; attempt++) {
    await shrinkCheck(pathname, body, opts);
    try {
      const res = await put(pathname, body, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', ifMatch: base.etag });
      if (mine !== data) replaceInPlace(data, mine);
      remember(pathname, data, body, res && res.etag);
      if (!(opts && opts.quiet)) await bumpRev(pathname);
      return data;
    } catch (err) {
      if (!isPrecondition(err)) throw err;
      let latest = null;
      try { forget(pathname); latest = await fetchLatest(pathname); } catch (e) { latest = null; }
      if (!latest) break; // can't read theirs: written as before
      const text = latest.buf.toString('utf8');
      let theirs;
      try { theirs = text ? JSON.parse(text) : null; } catch (e) { break; }
      if (text === body) { if (mine !== data) replaceInPlace(data, mine); remember(pathname, data, text, latest.etag); return data; } // a lost answer: it was mine
      mine = theirs == null ? mine : merge3(JSON.parse(base.text), mine, theirs);
      body = JSON.stringify(mine, null, 2);
      base = { pathname, text, etag: latest.etag };
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 40 * Math.min(attempt + 1, 8)));
    }
  }
  await shrinkCheck(pathname, body, opts);
  const res = await put(pathname, body, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
  if (mine !== data) replaceInPlace(data, mine);
  if (pathname !== REV_PATH) remember(pathname, data, body, res && res.etag);
  if (pathname !== REV_PATH && !(opts && opts.quiet)) await bumpRev(pathname);
  return data;
}

// Writes it only while it is still the version read with readJSONTagged: false when someone wrote it since (read it
// again and redo the change). Without a version (a new document), or a store that can't compare: a plain write.
async function writeJSONIf(pathname, data, etag, opts) {
  if (!etag) { await writeJSON(pathname, data, opts); return true; }
  const body = JSON.stringify(data, null, 2);
  if (GUARDED.has(pathname) && !(opts && opts.allowShrink)) {
    let before = 0;
    try { const h = await head(pathname); before = (h && h.size) || 0; } catch (err) { before = 0; }
    if (before > 200 * 1024 && Buffer.byteLength(body) < before * 0.5) {
      const e = new Error('store_write_refused: ' + pathname);
      e.code = 'store_write_refused';
      throw e;
    }
  }
  try {
    await put(pathname, body, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', ifMatch: etag });
  } catch (err) {
    if (err && (err.name === 'BlobPreconditionFailedError' || /precondition/i.test(err.message || ''))) {
      // the library retries a write whose answer got lost: the first try may have landed, and then it is ours
      let mine = false;
      try { const now = await get(pathname, { access: 'private', useCache: false }); mine = !!now && (await streamToString(now.stream)) === body; } catch (e) { mine = false; }
      if (!mine) return false;
    } else {
      console.error(`store.writeJSONIf(${pathname}) without the version check:`, err.message);
      await writeJSON(pathname, data, opts);
      return true;
    }
  }
  if (pathname !== REV_PATH && !(opts && opts.quiet)) await bumpRev(pathname);
  return true;
}

// ---- Live sync ----------------------------------------------------------------------
// Every write bumps a tiny revision document and announces it at once on the instant-sync channel (_lib/live.js,
// Supabase Realtime): the open portals reload right away. They also poll /api/portal-pulse as a safety net.
const REV_PATH = 'data/_rev.json';
let revMemo = { at: 0, value: null };

async function bumpRev(changed) {
  const value = { rev: Date.now() + '-' + Math.random().toString(36).slice(2, 7), changed: changed.replace(/^data\/|\.json$/g, '') };
  revMemo = { at: Date.now(), value };
  try { await writeJSON(REV_PATH, value); } catch (err) { console.error('store.bumpRev error:', err.message); }
  try { await require('./live').announce(value); } catch (err) { console.error('store.announce error:', err.message); }
}

// Current revision, memoised for a second per instance so many open tabs cost one read.
async function readRev() {
  if (revMemo.value && Date.now() - revMemo.at < 1000) return revMemo.value;
  const value = await readJSON(REV_PATH, { rev: '0', changed: '' });
  revMemo = { at: Date.now(), value };
  return value;
}

// ---- Binary documents (e.g. generated PDFs) -----------------------------------------
// Same put/get wiring as readJSON/writeJSON above, but for raw bytes instead of JSON text
// used by the leave-request PDF (api/portal-leave.js + api/portal-leave-pdf.js). Doesn't bump
// the live-sync revision: a generated PDF isn't part of the portal's shared on-screen state.
async function writeBinary(pathname, buffer, contentType) {
  await put(pathname, buffer, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: contentType || 'application/octet-stream',
  });
}

async function readBinary(pathname) {
  try {
    const result = await fetchLatest(pathname, true);
    if (!result) return null;
    return Buffer.from(result.buf); // a copy: what is kept for the next read can't be changed by a caller
  } catch (err) {
    if (err && (err.name === 'BlobNotFoundError' || /not.?found/i.test(err.message || ''))) return null;
    console.error(`store.readBinary(${pathname}) error:`, err.message);
    return null;
  }
}

// Deletes a binary blob (a replaced or removed photo / scan). Never throws: a leftover file is harmless.
async function removeBinary(pathname) {
  try { await del(pathname); } catch (err) { console.error(`store.removeBinary(${pathname}) error:`, err.message); }
}

// Makes a small document only when it isn't there yet: true when this call made it, false when it was already there (two
// requests at once: exactly one gets true). A "done once" mark: an automatic message is sent once (api/_lib/workflows.js).
async function createOnce(pathname, text) {
  try {
    await put(pathname, String(text || '1'), { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'text/plain' });
    return true;
  } catch (err) {
    if (/already exists/i.test(String((err && err.message) || ''))) return false;
    throw err;
  }
}

module.exports = { readJSON, writeJSON, readJSONTagged, writeJSONIf, readRev, writeBinary, readBinary, removeBinary, createOnce, merge3 };
