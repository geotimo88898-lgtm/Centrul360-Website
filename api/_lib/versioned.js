// Lists the portal re-reads on a timer (the Pipeline every 20 s, the badges every 2 min, the data after every save)
// were sent whole each time, and that transfer was most of the Vercel bill (Fast Origin Transfer, Oct 2026).
// Now each list carries a short version `v`; a client that already has that version gets `{ unchanged: true }`
// back (a few bytes) instead of the whole list again.
const { createHash } = require('crypto');

function sendVersioned(res, payload, clientV) {
  const v = createHash('sha1').update(JSON.stringify(payload)).digest('base64url').slice(0, 16);
  if (clientV && clientV === v) { res.status(200).json({ ok: true, unchanged: true, v }); return; }
  res.status(200).json(Object.assign({}, payload, { v }));
}

module.exports = { sendVersioned };
