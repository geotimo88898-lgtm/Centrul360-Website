// GET /api/creative-preview?p=<image path>&k=<signature>: one Creative image, for a link the portal itself made
// (api/_lib/creative-once.js) so the creatives of an order asked for in chat can be looked at before they go to Meta.
// No session: the signature (CREATIVE_SSO_SECRET) is the permission, for that one image only.

const { session, sign, BASE } = require('./_lib/creative-once');

module.exports = async (req, res) => {
  const secret = process.env.CREATIVE_SSO_SECRET;
  const p = String((req.query && req.query.p) || '');
  const k = String((req.query && req.query.k) || '');
  if (!secret || !/^images\/[\w./-]+$/.test(p) || p.includes('..') || k !== sign(secret, 'preview:' + p).slice(0, 32)) { res.status(404).end(); return; }
  try {
    const r = await fetch(BASE + '/api/img/' + p + '?w=1080', { headers: { cookie: await session(secret) } });
    if (!r.ok) { res.status(404).end(); return; }
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.status(200).send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(502).end(); }
};
