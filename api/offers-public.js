// GET /api/offers-public - PUBLIC, unauthenticated (no requireAuth/requireAdmin), same
// trust level as api/mypos-notify.js: read-only data that the public pages oferte.html
// and preturi.html fetch directly to render current offers. Not part of the employee
// portal's admin surface, api/portal-offers.js is the admin-only read/write side.

const { readJSON } = require('./_lib/store');
const { loadOffers } = require('./_lib/offers');
const { findOfferImage } = require('./_lib/offer-images');
const { dedashDeep } = require('./_lib/dedash');

// The site writes without long dashes: "a, b" reads as "a: b", ranges as "6-8".
// Applied to what the public sees; the text stored in the admin stays as typed.
function plain(s) {
  return String(s)
    .replace(/(\d)\s*[--]\s*(\d)/g, '$1-$2')
    .replace(/\s+[--]\s+/g, ': ')
    .replace(/[--]/g, '-');
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const offers = await loadOffers(readJSON, null);

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
          title: plain(o.title),
          description: plain(o.description || ''),
          priceNew,
          priceOld,
          discountPercent,
          category: o.category,
          featured: !!o.featured,
          imageUrl: img ? '/' + img.path : '',
          order: Number(o.order) || 0,
          locations: o.locations,
        };
      });

    // Cacheable for a short window, this is read by every oferte.html / preturi.html
    // visit but changes only when the admin edits an offer in the portal.
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.status(200).json({ offers: dedashDeep(result) });
  } catch (err) {
    console.error('offers-public error:', err.message);
    res.status(500).json({ error: 'offers_failed' });
  }
};
