// GET /api/offers-feed — server-to-server feed of every offer with its marketing brief, for the
// Creative machine (centrul360-creative-machine). Authenticated with the secret both projects
// already share for single sign-on (CREATIVE_SSO_SECRET), sent as "Authorization: Bearer …".
// The portal's Oferte section is the only place offers are edited; Creative only reads this.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { loadOffers, discountOf } = require('./_lib/offers');
const { findOfferImage } = require('./_lib/offer-images');

function authorized(req) {
  const secret = process.env.CREATIVE_SSO_SECRET || '';
  const header = String((req.headers && req.headers.authorization) || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secret || !token) return false;
  const a = crypto.createHash('sha256').update(token).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!authorized(req)) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }
  try {
    const offers = await loadOffers(readJSON, writeJSON);
    const out = offers
      .slice()
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
      .map((o) => {
        const img = findOfferImage(o.imageKey);
        return {
          id: o.id, key: o.key, title: o.title, description: o.description || '',
          priceNew: Number(o.priceNew) || 0, priceOld: Number(o.priceOld) || 0, discountPercent: discountOf(o),
          category: o.category, active: !!o.active, ads: !!o.ads, locations: o.locations,
          adName: o.adName || o.title, mechanic: o.mechanic, includes: o.includes, device: o.device,
          dreamOutcome: o.dreamOutcome, mechanism: o.mechanism, objections: o.objections, zones: o.zones,
          guarantee: o.guarantee, notes: o.notes, imageUrl: img ? '/' + img.path : '',
        };
      });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, updated: new Date().toISOString(), offers: out });
  } catch (err) {
    console.error('offers-feed error:', err.message);
    res.status(500).json({ error: 'offers_failed' });
  }
};
