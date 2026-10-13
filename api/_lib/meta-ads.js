// Publishing a creative to Meta (Creative → "Publică pe Meta"), the way the owner builds her ads in
// Ads Manager: one campaign (leads), one ad set (a radius around Timișoara or Arad, women only, an
// age range, Facebook + Instagram feed / stories / reels, a daily budget), one ad (the image, the
// texts, the Facebook lead form). Everything is created paused and switched on only at the end, so
// a step Meta refuses never leaves a half-made ad running; whatever was made is deleted again.
//
// It uses the user token kept at connect (Integrări → Facebook, needs ads_management) and the
// connected Page; the ad account is the one chosen there.

const ADS_GRAPH = 'https://graph.facebook.com/v25.0';

// city centres; the radius is set per ad set (the owner uses about 6-7 km)
const CITIES = {
  'Timișoara': { lat: 45.7537, lng: 21.2257 },
  'Arad': { lat: 46.1866, lng: 21.3123 },
};
const PLACEMENTS = {
  fb_feed: ['facebook', 'feed'], fb_story: ['facebook', 'story'], fb_reels: ['facebook', 'facebook_reels'],
  ig_feed: ['instagram', 'stream'], ig_story: ['instagram', 'story'], ig_reels: ['instagram', 'reels'],
};
const CTAS = ['LEARN_MORE', 'SIGN_UP', 'BOOK_NOW', 'GET_OFFER', 'APPLY_NOW', 'GET_QUOTE'];

// A Meta error as one sentence the owner can act on.
function metaError(j, step) {
  const e = (j && j.error) || {};
  const msg = e.error_user_msg || e.error_user_title || e.message || 'eroare necunoscută';
  return step + ': ' + msg;
}

async function call(method, path, token, params) {
  const url = ADS_GRAPH + path;
  const opts = { method };
  if (method === 'GET' || method === 'DELETE') {
    const q = new URLSearchParams(Object.assign({ access_token: token }, params || {}));
    const r = await fetch(url + '?' + q, opts);
    return { ok: r.ok, j: await r.json().catch(() => ({})) };
  }
  const body = new URLSearchParams({ access_token: token });
  Object.entries(params || {}).forEach(([k, v]) => body.set(k, typeof v === 'string' ? v : JSON.stringify(v)));
  opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  opts.body = body;
  const r = await fetch(url, opts);
  return { ok: r.ok, j: await r.json().catch(() => ({})) };
}

// What the publish window needs to know about the account (and whether publishing can work at all).
async function accountInfo(conn) {
  if (!conn.userToken) return { ready: false, reason: 'no_user_token' };
  if (!conn.adAccountId) return { ready: false, reason: 'no_ad_account' };
  const acc = await call('GET', '/' + conn.adAccountId, conn.userToken, { fields: 'name,currency,account_status' });
  if (!acc.ok) return { ready: false, reason: 'ad_account_error', message: metaError(acc.j, 'Contul de reclame') };
  const ig = await call('GET', '/' + conn.pageId, conn.pageAccessToken, { fields: 'instagram_business_account{id,username}' });
  const igAcc = ig.ok && ig.j.instagram_business_account ? { id: ig.j.instagram_business_account.id, username: ig.j.instagram_business_account.username || '' } : null;
  return {
    ready: acc.j.account_status === 1 || acc.j.account_status === undefined,
    reason: acc.j.account_status && acc.j.account_status !== 1 ? 'ad_account_inactive' : '',
    adAccount: { id: conn.adAccountId, name: acc.j.name || conn.adAccountName || conn.adAccountId, currency: acc.j.currency || 'RON' },
    page: { id: conn.pageId, name: conn.pageName },
    instagram: igAcc,
  };
}

// The settings as the owner chose them, checked; returns { s } or { error }.
function cleanSettings(x) {
  const s = {};
  const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  s.campaignName = str(x.campaignName, 200);
  s.adsetName = str(x.adsetName, 200);
  s.adName = str(x.adName, 200);
  s.city = CITIES[x.city] ? x.city : '';
  s.radiusKm = Math.min(80, Math.max(1, Number(x.radiusKm) || 7));
  s.ageMin = Math.min(65, Math.max(18, Math.round(Number(x.ageMin) || 28)));
  s.ageMax = Math.min(65, Math.max(s.ageMin, Math.round(Number(x.ageMax) || 64)));
  s.women = x.women !== false;
  s.placements = (Array.isArray(x.placements) ? x.placements : []).filter((p) => PLACEMENTS[p]);
  s.budget = Math.round((Number(x.budget) || 0) * 100) / 100;
  s.formId = /^\d{5,25}$/.test(String(x.formId || '')) ? String(x.formId) : '';
  s.primaryText = str(x.primaryText, 2000);
  s.headline = str(x.headline, 255);
  s.description = str(x.description, 255);
  s.cta = CTAS.includes(x.cta) ? x.cta : 'LEARN_MORE';
  s.startNow = x.startNow !== false;
  if (!s.campaignName || !s.adsetName || !s.adName) return { error: 'missing_names' };
  if (!s.city) return { error: 'missing_city' };
  if (!s.placements.length) return { error: 'missing_placements' };
  if (!(s.budget >= 5)) return { error: 'budget_too_low' };
  if (!s.formId) return { error: 'missing_form' };
  if (!s.primaryText) return { error: 'missing_text' };
  return { s };
}

function targeting(s) {
  const c = CITIES[s.city];
  const fb = s.placements.filter((p) => PLACEMENTS[p][0] === 'facebook').map((p) => PLACEMENTS[p][1]);
  const ig = s.placements.filter((p) => PLACEMENTS[p][0] === 'instagram').map((p) => PLACEMENTS[p][1]);
  const t = {
    geo_locations: { custom_locations: [{ latitude: c.lat, longitude: c.lng, radius: s.radiusKm, distance_unit: 'kilometer' }], location_types: ['home', 'recent'] },
    age_min: s.ageMin, age_max: s.ageMax,
    publisher_platforms: [fb.length ? 'facebook' : '', ig.length ? 'instagram' : ''].filter(Boolean),
    device_platforms: ['mobile', 'desktop'],
    // exactly the audience she set (no Advantage+ widening)
    targeting_automation: { advantage_audience: 0 },
  };
  if (s.women) t.genders = [2];
  if (fb.length) t.facebook_positions = fb;
  if (ig.length) t.instagram_positions = ig;
  return t;
}

// The whole publish. image = { base64, name }. Returns ids or { error }.
async function publish(conn, image, s) {
  const tok = conn.userToken;
  const act = conn.adAccountId;
  const made = [];
  const undo = async () => { for (const id of made.reverse()) await call('DELETE', '/' + id, tok).catch(() => {}); };
  try {
    const acc = await call('GET', '/' + act, tok, { fields: 'currency' });
    // budgets go to Meta in the currency's cents (50 lei → 5000)
    const minor = Math.round(s.budget * 100);

    const img = await call('POST', '/' + act + '/adimages', tok, { bytes: image.base64, name: image.name || 'creative.jpg' });
    if (!img.ok) return { error: metaError(img.j, 'Imaginea') };
    const imgs = img.j.images || {};
    const hash = (imgs[Object.keys(imgs)[0]] || {}).hash;
    if (!hash) return { error: 'Imaginea: Meta n-a întors codul imaginii' };

    const camp = await call('POST', '/' + act + '/campaigns', tok, {
      name: s.campaignName, objective: 'OUTCOME_LEADS', status: 'PAUSED', special_ad_categories: [], buying_type: 'AUCTION',
      is_adset_budget_sharing_enabled: false,
    });
    if (!camp.ok) return { error: metaError(camp.j, 'Campania') };
    made.push(camp.j.id);

    const adset = await call('POST', '/' + act + '/adsets', tok, {
      name: s.adsetName, campaign_id: camp.j.id, daily_budget: String(minor), billing_event: 'IMPRESSIONS',
      optimization_goal: 'LEAD_GENERATION', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', destination_type: 'ON_AD',
      promoted_object: { page_id: conn.pageId }, targeting: targeting(s), status: 'PAUSED',
    });
    if (!adset.ok) { await undo(); return { error: metaError(adset.j, 'Setul de reclame') }; }

    const spec = {
      page_id: conn.pageId,
      link_data: {
        image_hash: hash, link: 'https://fb.me/', message: s.primaryText,
        name: s.headline || undefined, description: s.description || undefined,
        call_to_action: { type: s.cta, value: { lead_gen_form_id: s.formId } },
      },
    };
    // the Instagram account linked to the Page signs the ad on Instagram (without one, Meta uses the Page)
    const ig = await call('GET', '/' + conn.pageId, conn.pageAccessToken, { fields: 'instagram_business_account' });
    if (ig.ok && ig.j.instagram_business_account) spec.instagram_user_id = ig.j.instagram_business_account.id;
    const creative = await call('POST', '/' + act + '/adcreatives', tok, { name: s.adName, object_story_spec: spec });
    if (!creative.ok) { await undo(); return { error: metaError(creative.j, 'Reclama (textele și imaginea)') }; }
    made.push(creative.j.id);

    const ad = await call('POST', '/' + act + '/ads', tok, { name: s.adName, adset_id: adset.j.id, creative: { creative_id: creative.j.id }, status: 'ACTIVE' });
    if (!ad.ok) { await undo(); return { error: metaError(ad.j, 'Reclama') }; }

    if (s.startNow) {
      const a = await call('POST', '/' + adset.j.id, tok, { status: 'ACTIVE' });
      const c = await call('POST', '/' + camp.j.id, tok, { status: 'ACTIVE' });
      if (!a.ok || !c.ok) return { ok: true, campaignId: camp.j.id, adsetId: adset.j.id, adId: ad.j.id, started: false, warning: metaError(!a.ok ? a.j : c.j, 'Pornirea') };
    }
    return { ok: true, campaignId: camp.j.id, adsetId: adset.j.id, adId: ad.j.id, started: s.startNow, currency: (acc.j && acc.j.currency) || '' };
  } catch (err) {
    await undo();
    return { error: 'Rețea: ' + err.message };
  }
}

const adsManagerUrl = (actId, campaignId) => 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=' + String(actId).replace(/^act_/, '') + (campaignId ? '&selected_campaign_ids=' + campaignId : '');

module.exports = { CITIES, PLACEMENTS, CTAS, accountInfo, cleanSettings, publish, adsManagerUrl };
