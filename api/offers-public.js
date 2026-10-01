// GET /api/offers-public — PUBLIC, unauthenticated (no requireAuth/requireAdmin), same
// trust level as api/mypos-notify.js: read-only data that the public pages oferte.html
// and preturi.html fetch directly to render current offers. Not part of the employee
// portal's admin surface — api/portal-offers.js is the admin-only read/write side.

const { readJSON } = require('./_lib/store');
const { defaultOffers } = require('./_lib/offer-defaults');
const { findOfferImage } = require('./_lib/offer-images');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const offers = await readJSON('data/offers.json', defaultOffers());

    const result = offers
      .filter((o) => o && o.active)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .map((o) => {
        const priceNew = Number(o.priceNew) || 0;
        const priceOld = Number(o.priceOld) || 0;
        const discountPercent = priceOld > 0 ? Math.round(100 - (priceNew / priceOld) * 100) : 0;
        const img = findOfferImage(o.imageKey);
        return {
          key: o.key,
          title: o.title,
          description: o.description || '',
          priceNew,
          priceOld,
          discountPercent,
          category: o.category,
          featured: !!o.featured,
          imageUrl: img ? '/' + img.path : '',
          order: Number(o.order) || 0,
        };
      });

    // Cacheable for a short window — this is read by every oferte.html / preturi.html
    // visit but changes only when the admin edits an offer in the portal.
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.status(200).json({ offers: result });
  } catch (err) {
    console.error('offers-public error:', err.message);
    res.status(500).json({ error: 'offers_failed' });
  }
};
