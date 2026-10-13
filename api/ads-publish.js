// /api/ads-publish, Creative → "Publică pe Meta" (the Creative app calls it server to server with
// CREATIVE_SSO_SECRET, like /api/offers-feed; the owner's own portal session works too).
//   GET  ?action=options     can publishing work (the user token with ads_management, the ad account)
//                            + the Page, its Instagram, the active lead forms, the offers, the cities
//   POST { action: 'publish', image: { base64, name }, settings, ref }
//   POST { action: 'form_create', form }   a new lead form on the Page, offered in the window at once
//                            campaign + ad set + ad, see _lib/meta-ads.js; kept in data/ads-published.json
// The publishing itself lives in _lib/meta-ads.js.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { getSession } = require('./_lib/auth');
const { loadConnection, appCreds } = require('./_lib/facebook');
const { loadOffers } = require('./_lib/offers');
const { createForm } = require('./_lib/fb-form-create');
const ads = require('./_lib/meta-ads');

const LOG_KEY = 'data/ads-published.json';

function fromCreative(req) {
  const secret = process.env.CREATIVE_SSO_SECRET || '';
  const header = String((req.headers && req.headers.authorization) || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secret || !token) return false;
  const a = crypto.createHash('sha256').update(token).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

const REASONS = {
  not_connected: 'Facebook nu e conectat (Integrări → Facebook).',
  no_user_token: 'Lipsește tokenul pentru reclame. Integrări → Facebook → Reclame: lipește un token cu ads_management.',
  no_ad_account: 'Alege contul de reclame în Integrări → Facebook → Setări conexiune.',
  token_expired: 'Tokenul pentru reclame a expirat. Integrări → Facebook → Reclame: lipește unul nou.',
  ad_account_inactive: 'Contul de reclame nu e activ în Meta.',
  no_ads_permission: 'Tokenul pentru reclame n-are permisiunea ads_management. Integrări → Facebook → Reclame: lipește un token care o are.',
};
// what is missing from the window's settings, in words
const SETTINGS = {
  missing_names: 'Lipsește numele campaniei, al setului sau al reclamei.',
  missing_form: 'Alege formularul.',
  missing_text: 'Scrie textul reclamei.',
  missing_city: 'Alege orașul.',
  missing_placements: 'Alege cel puțin o plasare.',
  budget_too_low: 'Bugetul minim e 5 lei pe zi.',
};

async function options() {
  const conn = await loadConnection(readJSON);
  if (!conn.pageId) return { ok: true, ready: false, reason: 'not_connected', message: REASONS.not_connected };
  const [info, poll, reg, offers, defaults] = await Promise.all([
    ads.accountInfo(conn), readJSON('data/fb-poll.json', {}), readJSON('data/fb-forms.json', {}), loadOffers(readJSON, writeJSON), ads.loadDefaults(readJSON),
  ]);
  // ad sets an ad can join, and how long the ads connection still works
  const [adsets, token] = info.ready ? await Promise.all([ads.listAdsets(conn), ads.tokenInfo(conn.userToken, await appCreds(readJSON))]) : [[], null];
  // publishing needs ads_management on the token
  if (info.ready && token && token.valid && !(token.scopes || []).includes('ads_management')) Object.assign(info, { ready: false, reason: 'no_ads_permission', message: '' });
  const offerTitle = (id) => ((offers.find((o) => o.id === id) || {}).title || '');
  const forms = (poll.forms || []).filter((f) => !f.status || f.status === 'ACTIVE').map((f) => {
    const r = (reg.forms || {})[f.id] || {};
    const det = r.detected || {};
    return { id: f.id, name: f.name, lastAt: f.lastAt ? new Date(f.lastAt * 1000).toISOString() : '', created: f.created || '',
      offer: offerTitle(r.offerId || det.offerId), location: r.location || det.location || '' };
  }).sort((a, b) => (b.lastAt || b.created || '').localeCompare(a.lastAt || a.created || ''));
  return {
    ok: true, ready: !!info.ready, reason: info.reason || '', message: info.message || REASONS[info.reason] || '',
    adAccount: info.adAccount || null, page: info.page || { id: conn.pageId, name: conn.pageName }, instagram: info.instagram || null,
    forms,
    offers: offers.filter((o) => o.active !== false).map((o) => ({ title: o.title, key: o.key, category: o.category || '' })),
    cities: Object.keys(ads.CITIES), placements: Object.keys(ads.PLACEMENTS), ctas: ads.CTAS,
    defaults, adsets, tokenExpiresAt: token && token.expiresAt ? new Date(token.expiresAt).toISOString() : '',
  };
}

module.exports = async (req, res) => {
  const session = getSession(req);
  const allowed = fromCreative(req) || (session && session.role === 'admin');
  if (!allowed) { res.status(401).json({ error: 'not_authenticated' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') { res.status(200).json(await options()); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const body = req.body || {};
    if (body.action === 'form_create') {
      // Creative names the procedure as it knows it (the offer's title or its ad name)
      const offersAll = await loadOffers(readJSON, writeJSON);
      const fold = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      const input = Object.assign({}, body.form || {});
      if (!input.offerId && input.offer) {
        const t = fold(input.offer);
        const o = offersAll.find((x) => fold(x.title) === t || fold(x.adName) === t) || offersAll.find((x) => t && (t.includes(fold(x.title)) || fold(x.title).includes(t)));
        if (o) input.offerId = o.id;
      }
      const r = await createForm({ readJSON, writeJSON }, input);
      if (r.error) { res.status(400).json({ error: 'meta_refused', message: r.error }); return; }
      const offer = offersAll.find((o) => o.id === r.form.offerId);
      res.status(200).json({ ok: true, form: { id: r.form.id, name: r.form.name, lastAt: '', created: new Date().toISOString(), offer: offer ? offer.title : '', location: r.form.location } });
      return;
    }
    if (body.action !== 'publish') { res.status(400).json({ error: 'invalid_action' }); return; }

    const conn = await loadConnection(readJSON);
    if (!conn.pageId) { res.status(400).json({ error: 'not_connected', message: REASONS.not_connected }); return; }
    if (!conn.userToken) { res.status(400).json({ error: 'no_user_token', message: REASONS.no_user_token }); return; }
    if (!conn.adAccountId) { res.status(400).json({ error: 'no_ad_account', message: REASONS.no_ad_account }); return; }
    const image = body.image || {};
    if (!image.base64 || typeof image.base64 !== 'string' || image.base64.length > 6e6) { res.status(400).json({ error: 'invalid_image', message: 'Imaginea lipsește sau e prea mare.' }); return; }
    const v = ads.cleanSettings(body.settings || {});
    if (v.error) { res.status(400).json({ error: v.error, message: SETTINGS[v.error] || v.error }); return; }

    const r = await ads.publish(conn, { base64: image.base64, name: String(image.name || 'creative.jpg').slice(0, 80) }, v.s);
    if (r.error) { res.status(400).json({ error: 'meta_refused', message: r.error }); return; }
    const url = ads.adsManagerUrl(conn.adAccountId, r.campaignId);
    // what was published, for the record (Creative keeps its own link too)
    const log = await readJSON(LOG_KEY, []);
    log.unshift({ at: new Date().toISOString(), ref: String(body.ref || '').slice(0, 80), campaignId: r.campaignId, adsetId: r.adsetId, adId: r.adId,
      started: r.started, city: v.s.city, budget: v.s.budget, formId: v.s.formId, name: v.s.campaignName });
    await writeJSON(LOG_KEY, log.slice(0, 300));
    res.status(200).json(Object.assign({ ok: true, url }, r));
  } catch (err) {
    console.error('ads-publish error:', err.message);
    res.status(500).json({ error: 'publish_failed', message: 'Eroare la publicare: ' + err.message });
  }
};

module.exports.config = { maxDuration: 60 };
