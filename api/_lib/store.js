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

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
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
      const result = await get(pathname, { access: 'private', useCache: false });
      if (!result) return fallback;
      const text = await streamToString(result.stream);
      if (!text) return fallback;
      return JSON.parse(text);
    } catch (err) {
      if (isNotFound(err)) return fallback;
      lastErr = err;
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
      const result = await get(pathname, { access: 'private', useCache: false });
      if (!result) return { data: fallback, etag: '' };
      const text = await streamToString(result.stream);
      return { data: text ? JSON.parse(text) : fallback, etag: (result.blob && result.blob.etag) || '' };
    } catch (err) {
      if (isNotFound(err)) return { data: fallback, etag: '' };
      lastErr = err;
      console.error(`store.readJSONTagged(${pathname}) error (attempt ${attempt + 1}):`, err.message);
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  const e = new Error('store_read_failed: ' + pathname + ': ' + (lastErr && lastErr.message));
  e.code = 'store_read_failed';
  throw e;
}

// Writes a JSON document to Blob storage, overwriting whatever is at that pathname.
// opts.quiet: a write the open portals don't need to refresh for (the activity log)
// The big lists the whole portal leans on: a write that would cut one to less than half (and it is
// big) is refused, whatever bug or failed read led to it. Deleting that much by hand never happens.
const GUARDED = new Set(['data/clients.json', 'data/appointments.json', 'data/leads.json', 'data/sales.json']);
async function writeJSON(pathname, data, opts) {
  const body = JSON.stringify(data, null, 2);
  if (GUARDED.has(pathname) && !(opts && opts.allowShrink)) {
    let before = 0;
    try { const h = await head(pathname); before = (h && h.size) || 0; } catch (err) { before = 0; }
    if (before > 200 * 1024 && Buffer.byteLength(body) < before * 0.5) {
      console.error(`store.writeJSON(${pathname}) refused: ${Buffer.byteLength(body)} bytes over ${before}`);
      const e = new Error('store_write_refused: ' + pathname);
      e.code = 'store_write_refused';
      throw e;
    }
  }
  await put(pathname, body, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
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
    const result = await get(pathname, { access: 'private', useCache: false });
    if (!result) return null;
    const chunks = [];
    for await (const chunk of result.stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
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

module.exports = { readJSON, writeJSON, readJSONTagged, writeJSONIf, readRev, writeBinary, readBinary, removeBinary };
