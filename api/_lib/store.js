// Shared Vercel Blob read/write helper for the employee portal's JSON "documents".
// Every portal API route goes through here instead of calling @vercel/blob directly,
// so the overwrite/retry semantics only need to be right in one place.
//
// Requires BLOB_READ_WRITE_TOKEN in the environment — this is injected automatically
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

const { put, get } = require('@vercel/blob');

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Reads a JSON document from Blob storage. Returns `fallback` if the blob doesn't exist
// yet (first run) or fails to parse (defensive — should not happen in normal operation).
async function readJSON(pathname, fallback) {
  try {
    // useCache:false — the portal always reads right after writing (every save reloads
    // the whole payload to show the result), so a cached stale read would look exactly
    // like "my change didn't save" even though it did.
    const result = await get(pathname, { access: 'private', useCache: false });
    if (!result) return fallback;
    const text = await streamToString(result.stream);
    if (!text) return fallback;
    return JSON.parse(text);
  } catch (err) {
    // BlobNotFoundError or similar — treat as "not created yet".
    if (err && (err.name === 'BlobNotFoundError' || /not.?found/i.test(err.message || ''))) {
      return fallback;
    }
    console.error(`store.readJSON(${pathname}) error:`, err.message);
    return fallback;
  }
}

// Writes a JSON document to Blob storage, overwriting whatever is at that pathname.
async function writeJSON(pathname, data) {
  const body = JSON.stringify(data, null, 2);
  await put(pathname, body, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
  if (pathname !== REV_PATH) await bumpRev(pathname);
  return data;
}

// ---- Live sync ----------------------------------------------------------------------
// Every write bumps a tiny revision document; open portals poll /api/portal-pulse and reload
// only when it changed, so a booking made at the front desk shows up everywhere within seconds.
const REV_PATH = 'data/_rev.json';
let revMemo = { at: 0, value: null };

async function bumpRev(changed) {
  const value = { rev: Date.now() + '-' + Math.random().toString(36).slice(2, 7), changed: changed.replace(/^data\/|\.json$/g, '') };
  revMemo = { at: Date.now(), value };
  try { await writeJSON(REV_PATH, value); } catch (err) { console.error('store.bumpRev error:', err.message); }
}

// Current revision, memoised for a couple of seconds per instance so many open tabs cost one read.
async function readRev() {
  if (revMemo.value && Date.now() - revMemo.at < 2500) return revMemo.value;
  const value = await readJSON(REV_PATH, { rev: '0', changed: '' });
  revMemo = { at: Date.now(), value };
  return value;
}

// ---- Binary documents (e.g. generated PDFs) -----------------------------------------
// Same put/get wiring as readJSON/writeJSON above, but for raw bytes instead of JSON text —
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

module.exports = { readJSON, writeJSON, readRev, writeBinary, readBinary };
