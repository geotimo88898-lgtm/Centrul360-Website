// GET /api/cases-public - PUBLIC, unauthenticated. The before / after cases published from
// Contacte (only with the client's written consent), for the Rezultate page. No name, no phone:
// title, area (față / corp), city, number of sessions and the images.

const { readJSON } = require('./_lib/store');

module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  try {
    const cases = await readJSON('data/cases.json', []);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5, stale-while-revalidate=30'); // browsers always ask; the CDN keeps it 5 seconds
    res.status(200).json({
      cases: cases.map((c) => ({
        id: c.id, kind: c.kind, title: c.title, category: c.category, location: c.location || '', sessions: c.sessions || 1, publishedAt: c.publishedAt,
        images: (c.images || []).map((im, i) => ({ url: '/api/case-image?c=' + encodeURIComponent(c.id) + '&i=' + i, label: im.label || '' })),
      })),
    });
  } catch (err) {
    console.error('cases-public error:', err.message);
    res.status(500).json({ error: 'cases_failed' });
  }
};
