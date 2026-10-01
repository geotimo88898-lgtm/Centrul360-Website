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
    const result = await get(pathname, { access: 'private' });
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
  return data;
}

module.exports = { readJSON, writeJSON };
