// /api/site-art: the shop's treatment pictures and „how it works” loops (api/_lib/site-art.js). Only the admin (or Claude's
// producer key) makes them or sees them; once looked at, they are published as files in brand_asset/tratamente/ and video/.
//   GET  ?status=1               what is made, what it cost
//   GET  ?img=<id>[&n=<try>]     the picture (jpeg), the newest try by default
//   GET  ?video=<id>             the loop (mp4)
//   GET  ?vpoll=<id>             how the loop is going (keeps it when it is ready)
//   POST { make: <id>, extra }   makes one picture (up to two minutes)
//   POST { video: <id>, extra, model }  starts one loop (Veo, a few minutes; then ?vpoll)
const { requireAdmin } = require('./_lib/auth');
const A = require('./_lib/site-art');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!require('./_lib/content').fromProducer(req)) { const s = await requireAdmin(req, res); if (!s) return; }
    const q = req.query || {};
    if (req.method === 'GET' && (q.img || q.video)) {
      const b = q.img ? await A.image(String(q.img), q.n ? Number(q.n) : 0) : await A.video(String(q.video));
      if (!b) { res.status(404).json({ error: 'not_found' }); return; }
      res.setHeader('Content-Type', q.img ? 'image/jpeg' : 'video/mp4');
      res.status(200).send(Buffer.isBuffer(b) ? b : Buffer.from(b));
      return;
    }
    if (req.method === 'GET' && q.vpoll) { res.status(200).json(await A.pollVideo(String(q.vpoll))); return; }
    if (req.method === 'GET') { res.status(200).json(await A.status()); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    let b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    res.status(200).json(b.video ? await A.makeVideo(String(b.video), b.extra, String(b.model || '')) : await A.make(String(b.make || ''), b.extra));
  } catch (err) {
    console.error('site-art:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
