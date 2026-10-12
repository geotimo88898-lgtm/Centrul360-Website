// GET /api/case-image?c=<caseId>&i=<n> - PUBLIC. One image of a published before / after case.
// Served only while the case is in data/cases.json: taking it down (or the client's consent back)
// makes the link stop working at once.

const { readJSON, readBinary } = require('./_lib/store');

const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  try {
    const id = String((req.query && req.query.c) || '');
    const i = Number((req.query && req.query.i) || 0);
    const cases = await readJSON('data/cases.json', []);
    const entry = cases.find((x) => x.id === id);
    const im = entry && entry.images && entry.images[i];
    const m = im && /\.(jpg|png|webp)$/.exec(im.path);
    if (!m) { res.status(404).json({ error: 'not_found' }); return; }
    const buf = await readBinary(im.path);
    if (!buf) { res.status(404).json({ error: 'not_found' }); return; }
    res.setHeader('Content-Type', TYPES[m[1]]);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300'); // a case taken down disappears within minutes
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(buf);
  } catch (err) {
    console.error('case-image error:', err.message);
    res.status(500).json({ error: 'case_image_failed' });
  }
};
