// POST /api/portal-offers — admin-only "Oferte" management (Setări → Oferte).
// One endpoint, action-based routing via body.action: 'list' | 'create' | 'update' |
// 'delete' | 'reorder' — same pattern as portal-employees.js. These offers drive the
// PUBLIC oferte.html and preturi.html pages through the separate, unauthenticated
// api/offers-public.js — this endpoint only ever touches data/offers.json's admin view.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { loadOffers, cleanMarketing } = require('./_lib/offers');
const { OFFER_IMAGES, findOfferImage } = require('./_lib/offer-images');

const VALID_CATEGORIES = ['epilare', 'faciale', 'remodelare'];

function validateFields({ title, description, priceNew, priceOld, category, imageKey }) {
  if (!title || typeof title !== 'string') return 'missing_title';
  if (typeof description !== 'string') return 'invalid_description';
  const pNew = Number(priceNew);
  const pOld = Number(priceOld);
  if (!Number.isFinite(pNew) || pNew < 0) return 'invalid_price_new';
  if (!Number.isFinite(pOld) || pOld < 0) return 'invalid_price_old';
  if (!VALID_CATEGORIES.includes(category)) return 'invalid_category';
  if (!findOfferImage(imageKey)) return 'invalid_image';
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  const { action } = req.body || {};

  try {
    const offers = await loadOffers(readJSON, writeJSON);

    if (action === 'list') {
      res.status(200).json({ ok: true, offers, images: OFFER_IMAGES });
      return;
    }

    if (action === 'create') {
      const { title, description, priceNew, priceOld, category, featured, imageKey, active } = req.body || {};
      const err = validateFields({ title, description, priceNew, priceOld, category, imageKey });
      if (err) {
        res.status(400).json({ error: err });
        return;
      }
      const maxOrder = offers.reduce((m, o) => Math.max(m, Number(o.order) || 0), 0);
      const offer = {
        id: crypto.randomUUID(),
        key: String(title).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || crypto.randomUUID(),
        title: String(title).slice(0, 150),
        description: String(description || '').slice(0, 2000),
        priceNew: Number(priceNew),
        priceOld: Number(priceOld),
        category,
        featured: !!featured,
        imageKey,
        active: active === undefined ? true : !!active,
        order: maxOrder + 1,
        ...cleanMarketing(req.body || {}),
      };
      offers.push(offer);
      await writeJSON('data/offers.json', offers);
      res.status(200).json({ ok: true, offer, offers });
      return;
    }

    if (action === 'update') {
      const { id, title, description, priceNew, priceOld, category, featured, imageKey, active, order } = req.body || {};
      if (!id) {
        res.status(400).json({ error: 'missing_id' });
        return;
      }
      const offer = offers.find((o) => o.id === id);
      if (!offer) {
        res.status(404).json({ error: 'offer_not_found' });
        return;
      }
      const err = validateFields({ title, description, priceNew, priceOld, category, imageKey });
      if (err) {
        res.status(400).json({ error: err });
        return;
      }
      // Full field replace (except id/key, which stay stable so preturi.html's
      // data-offer-key matches keep working across edits).
      offer.title = String(title).slice(0, 150);
      offer.description = String(description || '').slice(0, 2000);
      offer.priceNew = Number(priceNew);
      offer.priceOld = Number(priceOld);
      offer.category = category;
      offer.featured = !!featured;
      offer.imageKey = imageKey;
      offer.active = active === undefined ? offer.active : !!active;
      if (order !== undefined && Number.isFinite(Number(order))) offer.order = Number(order);
      // Marketing brief (Creative) — only when the editor sent it, so older callers keep working.
      if (req.body && req.body.marketing) Object.assign(offer, cleanMarketing(req.body.marketing));
      await writeJSON('data/offers.json', offers);
      res.status(200).json({ ok: true, offer, offers });
      return;
    }

    if (action === 'delete') {
      const { id } = req.body || {};
      if (!id) {
        res.status(400).json({ error: 'missing_id' });
        return;
      }
      const idx = offers.findIndex((o) => o.id === id);
      if (idx === -1) {
        res.status(404).json({ error: 'offer_not_found' });
        return;
      }
      offers.splice(idx, 1);
      await writeJSON('data/offers.json', offers);
      res.status(200).json({ ok: true, offers });
      return;
    }

    if (action === 'reorder') {
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || !ids.length) {
        res.status(400).json({ error: 'missing_ids' });
        return;
      }
      ids.forEach((id, idx) => {
        const offer = offers.find((o) => o.id === id);
        if (offer) offer.order = idx + 1;
      });
      await writeJSON('data/offers.json', offers);
      res.status(200).json({ ok: true, offers });
      return;
    }

    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    console.error('portal-offers error:', err.message);
    res.status(500).json({ error: 'offers_failed' });
  }
};
