// /api/site-art: the shop's treatment pictures (api/_lib/site-art.js). Only the admin (or Claude's producer key) makes them or
// sees them; once looked at, they are published as files in brand_asset/tratamente/.
//   GET  ?status=1           what is made, what it cost
//   GET  ?img=<id>           the picture (jpeg)
//   POST { make: <id>, extra }   makes one (up to a minute)
const { requireAdmin } = require('./_lib/auth');
const A = require('./_lib/site-art');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!require('./_lib/content').fromProducer(req)) { const s = await requireAdmin(req, res); if (!s) return; }
    const q = req.query || {};
    if (req.method === 'GET' && q.img) {
      const b = await A.image(String(q.img));
      if (!b) { res.status(404).json({ error: 'not_found' }); return; }
      res.setHeader('Content-Type', 'image/jpeg');
      res.status(200).send(Buffer.isBuffer(b) ? b : Buffer.from(b));
      return;
    }
    if (req.method === 'GET') { res.status(200).json(await A.status()); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    let b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    res.status(200).json(await A.make(String(b.make || ''), b.extra));
  } catch (err) {
    console.error('site-art:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
