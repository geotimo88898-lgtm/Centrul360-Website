// Meta ads from the portal: publishing a creative (Creative → "Publică pe Meta") and the small Ads
// Manager in Admin → Reclame (campaigns, ad sets, ads: on / off, budget, results).
//
// Publishing builds what the owner builds by hand in Ads Manager: one campaign (leads), one ad set (a
// radius around Timișoara or Arad, women only, an age range, Facebook + Instagram feed / stories /
// reels, a daily budget), one ad (the image, the texts, the Facebook lead form). Or just the ad, in
// an ad set she already has. Everything is created paused and switched on only at the end, so a
// step Meta refuses never leaves a half-made ad running; whatever was made is deleted again.
//
// It uses the user token kept at connect (Integrări → Facebook, with ads_management) and the
// connected Page; the ad account is the one chosen there. Defaults for the publish window live in
// data/ads-defaults.json (Admin → Reclame → Setări implicite).

const ADS_GRAPH = 'https://graph.facebook.com/v25.0';
const SCOPE = require('./ads-scope');
// the ad account's money in lei (api/_lib/ads-fx.js; conn.fx set by loadConnection, 1 on RON): what Meta gives (spend,
// budgets in the account's currency) is turned into lei on the way in, a budget in lei into the account's cents on the way out
// a copy of the connection without fx (it isn't enumerable): the known account's cautious rate, never 1 for CAD
const FX = (conn) => { if (conn && conn.fx > 0) return conn.fx; const F = require('./ads-fx'); return (conn && F.FALLBACK[F.KNOWN[conn.adAccountId]]) || 1; };
const inLei = (conn, v) => Math.round((Number(v) || 0) * FX(conn) * 100) / 100;
const budLei = (conn, v) => (Number(v) > 0 ? inLei(conn, Number(v) / 100) : 0); // Meta's daily_budget (cents) → lei
const cents = (conn, lei) => String(Math.max(1, Math.round((Number(lei) || 0) / FX(conn) * 100))); // lei → the account's cents
// only this business's campaigns of the shared ad account (conn.scope, set by loadConnection; the default otherwise)
const scopeOf = (conn) => (conn && conn.scope) || SCOPE.forAccount(SCOPE.DEFAULT, conn && conn.adAccountId);
const ours = (conn, name) => SCOPE.keep(scopeOf(conn), name);
const DEFAULTS_KEY = 'data/ads-defaults.json';

// city centres; the radius is set per ad set (the owner uses about 6-7 km)
const CITIES = {
  'Timișoara': { lat: 45.7537, lng: 21.2257 },
  'Arad': { lat: 46.1866, lng: 21.3123 },
};
const PLACEMENTS = {
  fb_feed: ['facebook', 'feed'], fb_story: ['facebook', 'story'], fb_reels: ['facebook', 'facebook_reels'],
  ig_feed: ['instagram', 'stream'], ig_story: ['instagram', 'story'], ig_reels: ['instagram', 'reels'],
};
const CTAS = ['LEARN_MORE', 'SIGN_UP', 'BOOK_NOW', 'GET_OFFER', 'APPLY_NOW', 'GET_QUOTE', 'SHOP_NOW', 'BUY_NOW', 'ORDER_NOW'];
const PERIODS = { today: 'today', yesterday: 'yesterday', '7d': 'last_7d', '30d': 'last_30d', max: 'maximum' };
// a lead from an instant form, as Meta counts it in the results (first one found)
// everything that is not deleted or archived (the edges' own effective_status filter)
const LIVE = ['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES'];
// what Meta counts for every row (the rest is worked out from these on the page)
const RESULTS = 'spend,actions,action_values,impressions,reach,clicks,inline_link_clicks';
const LEAD_ACTIONS = ['onsite_conversion.lead_grouped', 'lead', 'leadgen_grouped', 'onsite_conversion.lead'];

const DEFAULTS = {
  budget: 50, radiusKm: 7, women: true,
  ages: { body: [28, 64], facial: [20, 60] },
  placements: Object.keys(PLACEMENTS), cta: 'SIGN_UP', startNow: true,
  // {oras_scurt} TM / AR, {proc} LIPO / CAV 1+1 / RESTART…, {unghi} the ad in 2-3 words,
  // {oferta} {oras} {km} {varsta} {hook} {data}; filled in by Creative's publish window
  names: { campaign: '{oras_scurt} {proc} · {unghi}', adset: '{oras} {km} km · femei {varsta}', ad: '{hook}' },
};
// the first pattern (with the date) gives way to the new one
const OLD_CAMPAIGN = '{oferta} · {oras} · {data}';

// A Meta error as one sentence the owner can act on.
function metaError(j, step) {
  const e = (j && j.error) || {};
  const msg = e.error_user_msg || e.error_user_title || e.message || 'eroare necunoscută';
  return (step ? step + ': ' : '') + msg;
}

async function call(method, path, token, params) {
  const url = /^https:/.test(path) ? path : ADS_GRAPH + path;
  const opts = { method };
  if (method === 'GET' || method === 'DELETE') {
    const q = new URLSearchParams(Object.assign({ access_token: token }, params || {}));
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + q, opts);
    return { ok: r.ok, j: await r.json().catch(() => ({})) };
  }
  const body = new URLSearchParams({ access_token: token });
  Object.entries(params || {}).forEach(([k, v]) => body.set(k, typeof v === 'string' ? v : JSON.stringify(v)));
  opts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  opts.body = body;
  const r = await fetch(url, opts);
  return { ok: r.ok, j: await r.json().catch(() => ({})) };
}
// every page of a list (Meta pages at `limit`)
async function all(path, token, params, max) {
  const out = [];
  let r = await call('GET', path, token, params);
  for (let i = 0; i < (max || 5); i++) {
    if (!r.ok) return { error: metaError(r.j) };
    out.push(...(r.j.data || []));
    const next = r.j.paging && r.j.paging.next;
    if (!next) break;
    r = await call('GET', next, token, {});
  }
  return { data: out };
}

// ---------------------------------------------------------------- the token
// How long the token kept for ads still works (0 = never, a System User token) and what it may do.
async function tokenInfo(token, creds) {
  if (!token || !creds || !creds.appId || !creds.appSecret) return null;
  const r = await call('GET', '/debug_token', creds.appId + '|' + creds.appSecret, { input_token: token });
  const d = (r.ok && r.j.data) || {};
  if (!r.ok) return null;
  return { valid: !!d.is_valid, expiresAt: d.expires_at ? d.expires_at * 1000 : 0, scopes: d.scopes || [], type: d.type || '' };
}

// ---------------------------------------------------------------- defaults
function cleanDefaults(x) {
  const d = JSON.parse(JSON.stringify(DEFAULTS));
  const i = x || {};
  if (Number(i.budget) >= 5) d.budget = Math.round(Number(i.budget) * 100) / 100;
  if (Number(i.radiusKm) >= 1) d.radiusKm = Math.min(80, Math.round(Number(i.radiusKm)));
  if (typeof i.women === 'boolean') d.women = i.women;
  const age = (v, def) => (Array.isArray(v) && v.length === 2 ? [Math.min(65, Math.max(18, Math.round(+v[0] || def[0]))), Math.min(65, Math.max(18, Math.round(+v[1] || def[1])))].sort((a, b) => a - b) : def);
  if (i.ages) { d.ages.body = age(i.ages.body, d.ages.body); d.ages.facial = age(i.ages.facial, d.ages.facial); }
  if (Array.isArray(i.placements)) { const p = i.placements.filter((k) => PLACEMENTS[k]); if (p.length) d.placements = p; }
  if (CTAS.includes(i.cta)) d.cta = i.cta;
  if (typeof i.startNow === 'boolean') d.startNow = i.startNow;
  if (i.names) ['campaign', 'adset', 'ad'].forEach((k) => { const v = String(i.names[k] || '').trim().slice(0, 120); if (v && !(k === 'campaign' && v === OLD_CAMPAIGN)) d.names[k] = v; });
  return d;
}
const loadDefaults = async (readJSON) => cleanDefaults(await readJSON(DEFAULTS_KEY, {}));

// ---------------------------------------------------------------- account
// What the publish window needs to know about the account (and whether publishing can work at all).
async function accountInfo(conn) {
  if (!conn.userToken) return { ready: false, reason: 'no_user_token' };
  if (!conn.adAccountId) return { ready: false, reason: 'no_ad_account' };
  const acc = await call('GET', '/' + conn.adAccountId, conn.userToken, { fields: 'name,currency,account_status' });
  if (!acc.ok) {
    const code = acc.j && acc.j.error && acc.j.error.code;
    return { ready: false, reason: code === 190 ? 'token_expired' : 'ad_account_error', message: metaError(acc.j, 'Contul de reclame') };
  }
  const ig = await call('GET', '/' + conn.pageId, conn.pageAccessToken, { fields: 'instagram_business_account{id,username}' });
  const igAcc = ig.ok && ig.j.instagram_business_account ? { id: ig.j.instagram_business_account.id, username: ig.j.instagram_business_account.username || '' } : null;
  const active = acc.j.account_status === 1 || acc.j.account_status === undefined;
  return {
    ready: active, reason: active ? '' : 'ad_account_inactive',
    adAccount: { id: conn.adAccountId, name: acc.j.name || conn.adAccountName || conn.adAccountId, currency: acc.j.currency || 'RON' },
    page: { id: conn.pageId, name: conn.pageName },
    instagram: igAcc,
  };
}

// whether the account delivers at all (1 = active; 2 disabled, 3 unsettled, 7 in review, 9 grace period, 100 / 101 closing)
async function accountStatus(conn) {
  const r = await call('GET', '/' + conn.adAccountId, conn.userToken, { fields: 'account_status' });
  if (!r.ok) return { error: metaError(r.j, 'Contul de reclame') };
  return { status: r.j.account_status === undefined ? 1 : Number(r.j.account_status) };
}

// The ad sets an ad can join (not deleted), newest first, with their campaign.
async function listAdsets(conn) {
  const r = await all('/' + conn.adAccountId + '/adsets', conn.userToken, {
    fields: 'id,name,effective_status,daily_budget,created_time,campaign{id,name,objective}', limit: '100',
    effective_status: JSON.stringify(['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'PREAPPROVED']),
  }, 2);
  if (r.error) return [];
  return r.data.filter((a) => (!a.campaign || !a.campaign.objective || /LEAD/.test(a.campaign.objective)) && (!a.campaign || ours(conn, a.campaign.name)))
    .sort((a, b) => (a.created_time < b.created_time ? 1 : -1)).slice(0, 60)
    .map((a) => ({ id: a.id, name: a.name, status: a.effective_status, campaign: (a.campaign && a.campaign.name) || '', budget: budLei(conn, a.daily_budget) }));
}

// ---------------------------------------------------------------- publishing
// The settings as the owner chose them, checked; returns { s } or { error }.
function cleanSettings(x) {
  const s = {};
  const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  s.adsetId = /^\d{5,25}$/.test(String(x.adsetId || '')) ? String(x.adsetId) : '';
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
  // a second text and title, tested by Meta in the same ad (Creative writes 2 of each)
  s.primaryText2 = str(x.primaryText2, 2000);
  s.headline2 = str(x.headline2, 255);
  s.headline3 = str(x.headline3, 255);
  s.description = str(x.description, 255);
  s.cta = CTAS.includes(x.cta) ? x.cta : 'LEARN_MORE';
  s.startNow = x.startNow !== false;
  // the creative machine's loop (Creative → Bucla): everything is made PAUSED and nothing is switched on, the owner starts it
  s.paused = x.paused === true;
  if (s.paused) s.startNow = false;
  s.employment = x.employment === true; // a job ad (api/_lib/hire-once.js)
  // retargeting (20.11): custom audiences the ad set reaches (made with audienceCreate), and the ones it leaves out
  s.audiences = (Array.isArray(x.audiences) ? x.audiences : []).map(String).filter((id) => /^\d{5,25}$/.test(id)).slice(0, 10);
  s.excludeAudiences = (Array.isArray(x.excludeAudiences) ? x.excludeAudiences : []).map(String).filter((id) => /^\d{5,25}$/.test(id)).slice(0, 10);
  // „Conversion leads” (20.11): the ad set looks for leads who become clients (Meta reads the CRM steps the portal sends,
  // _lib/meta-capi.js), not the cheapest leads
  s.quality = x.quality === true;
  // an ad to a page of the site instead of a lead form (21.11: the Card de Sărbători, bought online): the page's address
  // (centrul360.com only), and what the ad set looks for: the pixel's Purchase (OUTCOME_SALES) or the page's views
  // (OUTCOME_TRAFFIC, until the pixel has sales to learn from); the UTM tags name the campaign and the ad on every visit
  s.link = /^https:\/\/(www\.)?centrul360\.com\/[\w\-\/.?=&%]*$/.test(String(x.link || '')) ? String(x.link).slice(0, 500) : '';
  s.goal = x.goal === 'purchase' ? 'purchase' : 'views';
  s.pixelId = /^\d{10,20}$/.test(String(x.pixelId || '')) ? String(x.pixelId) : '';
  // several cities in one ad set (the card: Timișoara and Arad together)
  s.cities = (Array.isArray(x.cities) ? x.cities : []).filter((c) => CITIES[c]);
  if (s.cities.length && !s.city) s.city = s.cities[0];
  if (!s.adName) return { error: 'missing_names' };
  if (!s.formId && !s.link) return { error: 'missing_form' };
  if (s.link && s.goal === 'purchase' && !s.pixelId) return { error: 'missing_pixel' };
  if (!s.primaryText) return { error: 'missing_text' };
  if (s.adsetId) return { s }; // the audience, budget and placements are the ad set's own
  if (!s.campaignName || !s.adsetName) return { error: 'missing_names' };
  if (!s.city) return { error: 'missing_city' };
  if (!s.placements.length) return { error: 'missing_placements' };
  if (!(s.budget >= 5)) return { error: 'budget_too_low' };
  return { s };
}

function targeting(s) {
  const fb = s.placements.filter((p) => PLACEMENTS[p][0] === 'facebook').map((p) => PLACEMENTS[p][1]);
  const ig = s.placements.filter((p) => PLACEMENTS[p][0] === 'instagram').map((p) => PLACEMENTS[p][1]);
  const t = {
    geo_locations: { custom_locations: (s.cities && s.cities.length ? s.cities : [s.city]).map((k) => ({ latitude: CITIES[k].lat, longitude: CITIES[k].lng, radius: s.radiusKm, distance_unit: 'kilometer' })), location_types: ['home', 'recent'] },
    age_min: s.ageMin, age_max: s.ageMax,
    publisher_platforms: [fb.length ? 'facebook' : '', ig.length ? 'instagram' : ''].filter(Boolean),
    device_platforms: ['mobile', 'desktop'],
    // exactly the audience she set (no Advantage+ widening)
    targeting_automation: { advantage_audience: 0 },
  };
  if (s.women && !s.employment) t.genders = [2];
  // a job ad: Meta's rules for employment (everyone 18-65, at least 15 miles / 25 km around, no detailed targeting)
  if (s.employment) { t.age_min = 18; t.age_max = 65; t.geo_locations.custom_locations.forEach((g) => { g.radius = Math.max(25, s.radiusKm); }); delete t.targeting_automation; }
  if (s.audiences && s.audiences.length) t.custom_audiences = s.audiences.map((id) => ({ id }));
  if (s.excludeAudiences && s.excludeAudiences.length) t.excluded_custom_audiences = s.excludeAudiences.map((id) => ({ id }));
  if (fb.length) t.facebook_positions = fb;
  if (ig.length) t.instagram_positions = ig;
  return t;
}

// Retargeting audiences (20.11), made once and reused: who opened a lead form of the Page and didn't send it, who engaged
// with the Page or the Instagram profile. kind: 'form_open' | 'page_engaged' | 'ig_engaged'; days: how far back.
async function audienceCreate(conn, kind, days, igId) {
  const tok = conn.userToken, act = conn.adAccountId, sec = Math.min(365, Math.max(1, Number(days) || 30)) * 86400;
  const page = { id: conn.pageId, type: 'page' };
  const rules = {
    form_open: { name: 'Retargeting · formular deschis, netrimis · ' + days + 'z', rule: { inclusions: { operator: 'or', rules: [{ event_sources: [{ id: conn.pageId, type: 'lead' }], retention_seconds: sec, filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: 'opened_form' }] } }] },
      exclusions: { operator: 'or', rules: [{ event_sources: [{ id: conn.pageId, type: 'lead' }], retention_seconds: sec, filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: 'submitted_form' }] } }] } } },
    page_engaged: { name: 'Retargeting · a interacționat cu pagina · ' + days + 'z', rule: { inclusions: { operator: 'or', rules: [{ event_sources: [page], retention_seconds: sec, filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: 'page_engaged' }] } }] } } },
    ig_engaged: { name: 'Retargeting · a interacționat pe Instagram · ' + days + 'z', rule: { inclusions: { operator: 'or', rules: [{ event_sources: [{ id: igId, type: 'ig_business' }], retention_seconds: sec, filter: { operator: 'and', filters: [{ field: 'event', operator: 'eq', value: 'ig_business_profile_all' }] } }] } } },
  };
  // the site's visitors through its pixel (21.11): all pages, or only the Card de Sărbători's
  const pixel = await require('./meta-capi').loadConfig().then((c) => c.pixelId).catch(() => '') || require('./meta-capi').DEFAULT_PIXEL;
  const visit = (label, part) => ({ name: 'Retargeting · ' + label + ' · ' + days + 'z', rule: { inclusions: { operator: 'or', rules: [{ event_sources: [{ id: pixel, type: 'pixel' }], retention_seconds: sec,
    filter: { operator: 'and', filters: [{ field: 'url', operator: 'i_contains', value: part }] } }] } } });
  rules.site_visitors = visit('vizitatori site', 'centrul360.com');
  rules.card_visitors = visit('vizitatori Cardul de Sărbători', 'card-sarbatori');
  const r = rules[kind];
  if (!r || (kind === 'ig_engaged' && !igId)) return { error: 'invalid_kind' };
  const x = await call('POST', '/' + act + '/customaudiences', tok, { name: r.name, rule: JSON.stringify(r.rule), prefill: 'true' });
  if (!x.ok) return { error: metaError(x.j, 'Publicul') };
  return { id: x.j.id, name: r.name };
}
// the account's audiences (id, name, size), to pick from
async function audienceList(conn) {
  const x = await call('GET', '/' + conn.adAccountId + '/customaudiences', conn.userToken, { fields: 'id,name,approximate_count_lower_bound,approximate_count_upper_bound,subtype,time_created,operation_status,delivery_status', limit: '100' });
  if (!x.ok) return { error: metaError(x.j, 'Publicurile') };
  return { audiences: (x.j.data || []).map((a) => ({ id: a.id, name: a.name, subtype: a.subtype, min: a.approximate_count_lower_bound, max: a.approximate_count_upper_bound, created: a.time_created,
    state: a.operation_status ? a.operation_status.description || a.operation_status.code : '', delivery: a.delivery_status ? a.delivery_status.description || a.delivery_status.code : '' })) };
}
// a lookalike (23.11, George: „la toate”): people like a custom audience of ours, in one country, the top ratio (0.01 = 1%)
async function lookalikeCreate(conn, o) {
  const x = await call('POST', '/' + conn.adAccountId + '/customaudiences', conn.userToken, { name: String(o.name).slice(0, 200), subtype: 'LOOKALIKE', origin_audience_id: String(o.origin),
    lookalike_spec: JSON.stringify({ ratio: o.ratio, country: o.country || 'RO' }) });
  if (!x.ok || x.j.error) return { error: metaError(x.j, 'Publicul asemănător') };
  return { id: x.j.id };
}
// what Meta estimates an audience reaches (monthly people, lower and upper), for a lead ad set
async function reachEstimate(conn, t) {
  const x = await call('GET', '/' + conn.adAccountId + '/delivery_estimate', conn.userToken, { targeting_spec: JSON.stringify(t), optimization_goal: 'LEAD_GENERATION', promoted_object: JSON.stringify({ page_id: conn.pageId }) });
  if (!x.ok || x.j.error) return { error: metaError(x.j, 'Estimarea') };
  const e = (x.j.data || [])[0] || {};
  return { lower: Number(e.estimate_mau_lower_bound) || 0, upper: Number(e.estimate_mau_upper_bound) || 0, ready: e.estimate_ready !== false };
}
// a running campaign's audience, as Meta keeps it (its first live ad set), to give a new ad set exactly the same
async function targetingOf(conn, campaignId) {
  const SAME_T = KEEP_T.concat(['custom_audiences', 'excluded_custom_audiences', 'flexible_spec', 'exclusions']);
  const r = await call('GET', '/' + campaignId, conn.userToken, { fields: 'name,account_id,adsets.limit(10){effective_status,targeting}' });
  if (!r.ok) return { error: metaError(r.j, 'Campania de copiat') };
  if ('act_' + r.j.account_id !== conn.adAccountId || !ours(conn, r.j.name)) return { error: 'campania de copiat nu e a noastră' };
  const sets = (r.j.adsets && r.j.adsets.data) || [];
  const s = sets.find((x) => x.effective_status === 'ACTIVE') || sets[0];
  if (!s || !s.targeting) return { error: 'campania de copiat n-are public' };
  const t = {}; SAME_T.forEach((k) => { if (s.targeting[k] !== undefined) t[k] = JSON.parse(JSON.stringify(s.targeting[k])); });
  return { targeting: t, full: s.targeting };
}

// The whole publish. image = { base64, name } (a picture) or { videoId, thumbUrl } (a video). Returns ids or { error }.
// who the ad is for and who pays for it (Meta asks every ad set shown in the EU, the DSA): the connected account's own
// defaults; an account without them (the CAD account Centrul360 uses since 21.11, another business's) takes the old
// Centrul360 account's, else the Page's name. Read once per run.
let DSA = null;
async function dsaOf(conn) {
  if (DSA) return DSA;
  const read = async (act) => { const r = await call('GET', '/' + act, conn.userToken, { fields: 'default_dsa_beneficiary,default_dsa_payor' }); return r.ok ? r.j : {}; };
  const a = await read(conn.adAccountId);
  const b = a.default_dsa_beneficiary && a.default_dsa_payor ? a : await read('act_4502494523405059');
  const name = conn.pageName || 'Centrul360';
  DSA = { dsa_beneficiary: a.default_dsa_beneficiary || b.default_dsa_beneficiary || name, dsa_payor: a.default_dsa_payor || b.default_dsa_payor || name };
  return DSA;
}

async function publish(conn, image, s) {
  const tok = conn.userToken;
  const act = conn.adAccountId;
  const made = [];
  const undo = async () => { for (const id of made.slice().reverse()) await call('DELETE', '/' + id, tok).catch(() => {}); };
  try {
    // a video already in the account (image = { videoId, thumbUrl }, made by videoUpload) or a picture uploaded now
    let hash = '';
    if (!image.videoId) {
      const img = await call('POST', '/' + act + '/adimages', tok, { bytes: image.base64, name: image.name || 'creative.jpg' });
      if (!img.ok) return { error: metaError(img.j, 'Imaginea') };
      const imgs = img.j.images || {};
      hash = (imgs[Object.keys(imgs)[0]] || {}).hash;
      if (!hash) return { error: 'Imaginea: Meta n-a întors codul imaginii' };
    }

    let campaignId = '', adsetId = s.adsetId;
    if (!adsetId) {
      // a job ad names its country too (sent empty, Meta refuses every campaign)
      const camp = await call('POST', '/' + act + '/campaigns', tok, Object.assign({
        name: s.campaignName, objective: s.link ? (s.goal === 'purchase' ? 'OUTCOME_SALES' : 'OUTCOME_TRAFFIC') : 'OUTCOME_LEADS', status: 'PAUSED', special_ad_categories: s.employment ? ['EMPLOYMENT'] : [], buying_type: 'AUCTION',
        is_adset_budget_sharing_enabled: false,
      }, s.employment ? { special_ad_category_country: ['RO'] } : {}));
      if (!camp.ok) return { error: metaError(camp.j, 'Campania') };
      campaignId = camp.j.id;
      made.push(campaignId);
      const adset = await call('POST', '/' + act + '/adsets', tok, {
        name: s.adsetName, campaign_id: campaignId, daily_budget: cents(conn, s.budget), billing_event: 'IMPRESSIONS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP', targeting: s.rawTargeting || targeting(s), status: 'PAUSED', ...(await dsaOf(conn)),
        ...(s.link
          ? (s.goal === 'purchase'
            ? { optimization_goal: 'OFFSITE_CONVERSIONS', destination_type: 'WEBSITE', promoted_object: { pixel_id: s.pixelId, custom_event_type: 'PURCHASE' } }
            : { optimization_goal: 'LANDING_PAGE_VIEWS', destination_type: 'WEBSITE' })
          : { optimization_goal: s.quality ? 'QUALITY_LEAD' : 'LEAD_GENERATION', destination_type: 'ON_AD', promoted_object: { page_id: conn.pageId } }),
      });
      if (!adset.ok) { await undo(); return { error: metaError(adset.j, 'Setul de reclame') }; }
      adsetId = adset.j.id;
    } else {
      const a = await call('GET', '/' + adsetId, tok, { fields: 'campaign_id,account_id' });
      if (!a.ok) return { error: metaError(a.j, 'Setul de reclame ales') };
      if (a.j.account_id && 'act_' + a.j.account_id !== act) return { error: 'Setul de reclame ales nu e în contul de reclame conectat.' };
      campaignId = a.j.campaign_id || '';
    }

    const button = s.link ? { type: s.cta, value: { link: s.link } } : { type: s.cta, value: { lead_gen_form_id: s.formId } };
    const spec = image.videoId
      ? { page_id: conn.pageId, video_data: Object.assign({ video_id: image.videoId, message: s.primaryText, title: s.headline || undefined, link_description: s.description || undefined, call_to_action: button }, image.thumbUrl ? { image_url: image.thumbUrl } : {}) }
      : { page_id: conn.pageId, link_data: { image_hash: hash, link: s.link || 'https://fb.me/', message: s.primaryText, name: s.headline || undefined, description: s.description || undefined, call_to_action: button } };
    // the Instagram account linked to the Page signs the ad on Instagram (without one, Meta uses the Page)
    const ig = await call('GET', '/' + conn.pageId, conn.pageAccessToken, { fields: 'instagram_business_account' });
    if (ig.ok && ig.j.instagram_business_account) spec.instagram_user_id = ig.j.instagram_business_account.id;
    // two texts / up to three titles: Meta shows each person the mix that works best (more text options in the same ad)
    const bodies = [s.primaryText, s.primaryText2].filter(Boolean);
    const titles = [s.headline, s.headline2, s.headline3].filter(Boolean);
    const multi = bodies.length > 1 || titles.length > 1;
    const feed = multi ? { bodies: bodies.map((text) => ({ text })), titles: titles.map((text) => ({ text })), descriptions: s.description ? [{ text: s.description }] : undefined, optimization_type: 'DEGREES_OF_FREEDOM' } : null;
    // a link that names its own UTM tags (23.11: utm_source=facebook on the site ads) keeps them, without Meta's second set
    const tags = s.link && !/[?&]utm_source=/.test(s.link) ? { url_tags: 'utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}' } : {};
    let creative = await call('POST', '/' + act + '/adcreatives', tok, Object.assign({ name: s.adName, object_story_spec: spec }, tags, feed ? { asset_feed_spec: feed } : {}));
    let textNote = '';
    // Meta refusing the second text: the ad goes with the first one, and says so
    if (!creative.ok && feed) {
      const why = metaError(creative.j, '');
      creative = await call('POST', '/' + act + '/adcreatives', tok, Object.assign({ name: s.adName, object_story_spec: spec }, tags));
      if (creative.ok) textNote = 'Meta n-a primit al doilea text / titlu (' + why + '), reclama are doar primul.';
    }
    if (!creative.ok) { await undo(); return { error: metaError(creative.j, 'Reclama (textele și imaginea)') }; }
    made.push(creative.j.id);

    // in a new campaign the ad goes on with it; in an existing ad set it follows the choice
    const ad = await call('POST', '/' + act + '/ads', tok, { name: s.adName, adset_id: adsetId, creative: { creative_id: creative.j.id }, status: s.paused || (s.adsetId && !s.startNow) ? 'PAUSED' : 'ACTIVE' });
    if (!ad.ok) { await undo(); return { error: metaError(ad.j, 'Reclama') }; }

    // a new campaign: the ad set goes on now, the campaign too unless she starts it herself later,
    // so switching the campaign on (Reclame or Ads Manager) is all it takes then
    if (!s.adsetId && !s.paused) {
      const a = await call('POST', '/' + adsetId, tok, { status: 'ACTIVE' });
      const c = s.startNow ? await call('POST', '/' + campaignId, tok, { status: 'ACTIVE' }) : { ok: true };
      if (!a.ok || !c.ok) return { ok: true, campaignId, adsetId, adId: ad.j.id, started: false, warning: [metaError(!a.ok ? a.j : c.j, 'Pornirea'), textNote].filter(Boolean).join(' ') };
    }
    return Object.assign({ ok: true, campaignId, adsetId, adId: ad.j.id, started: s.startNow, paused: !!s.paused, texts: textNote ? 1 : Math.max(bodies.length, titles.length) }, textNote ? { warning: textNote } : {});
  } catch (err) {
    await undo();
    return { error: 'Rețea: ' + err.message };
  }
}

// A video into the connected account from a public link (23.11: a reel of Conținut, api/content-file.js), then Meta's
// processing waited on for a while: { videoId } once it's ready, { pending, videoId } while Meta still works on it (the
// same call with that videoId goes on from there), { error } with Meta's words.
async function videoUpload(conn, url, name, videoId) {
  const tok = conn.userToken;
  let vid = String(videoId || '');
  if (!vid) {
    const up = await call('POST', '/' + conn.adAccountId + '/advideos', tok, { file_url: url, name: String(name || 'video').slice(0, 100) });
    if (!up.ok || !up.j.id) return { error: metaError(up.j, 'Videoul') };
    vid = String(up.j.id);
  }
  for (let i = 0; i < 10; i++) {
    const st = await call('GET', '/' + vid, tok, { fields: 'status' });
    const vs = st.ok && st.j.status && st.j.status.video_status;
    if (vs === 'ready') return { videoId: vid };
    if (vs === 'error') return { error: 'Meta n-a putut procesa videoul', videoId: vid };
    await new Promise((res) => setTimeout(res, 4000));
  }
  return { pending: true, videoId: vid };
}

// ---------------------------------------------------------------- the move to another ad account (21.11)
// A campaign of the old ad account remade in the connected one: the same ad (texts, title, button, lead form, picture
// or video), the same audience (place, age, women; custom audiences stay behind, they belong to the old account), one
// ad set and one ad, its new name and its daily budget in the connected account's money. Only a campaign of ours in the
// old account (OLD_OWN), and only a name the connected account counts as ours. dry: only what it would make.
// A video is copied by Meta from its link and processed for a while: the call answers { pending, videoId } and the
// same call with that videoId goes on from there.
// 22.11: the CAD account act_1136609638911845 stopped (unpaid threshold); its C360 campaigns move to act_989208510351291
const OLD_OWN = { act_4502494523405059: true, act_1136609638911845: 'C360' };
const KEEP_T = ['geo_locations', 'excluded_geo_locations', 'age_min', 'age_max', 'genders', 'publisher_platforms', 'facebook_positions', 'instagram_positions', 'device_platforms', 'locales', 'targeting_automation'];
async function port(conn, oldId, o) {
  const tok = conn.userToken, act = conn.adAccountId;
  if (!/^\d{5,25}$/.test(String(oldId || ''))) return { error: 'ID invalid' };
  const name = String((o && o.name) || '').trim().slice(0, 200);
  const budget = Math.round((Number(o && o.budget) || 0) * 100) / 100;
  if (!name || !ours(conn, name)) return { error: 'numele nu e al nostru în contul conectat' };
  if (!(budget >= 5)) return { error: 'budget_too_low' };
  const r = await call('GET', '/' + oldId, tok, { fields: 'name,account_id,adsets.limit(5){targeting,daily_budget,effective_status},ads.limit(5){effective_status,creative{object_story_spec,asset_feed_spec}}' });
  if (!r.ok) return { error: metaError(r.j, 'Campania veche') };
  const oldAct = 'act_' + r.j.account_id;
  if (!OLD_OWN[oldAct]) return { error: 'campania nu e din contul vechi al Centrul360' };
  if (oldAct === act) return { error: 'campania e deja în contul conectat' };
  if (!SCOPE.keep(SCOPE.DEFAULT, r.j.name)) return { error: 'campania e a altei afaceri' };
  if (typeof OLD_OWN[oldAct] === 'string' && !String(r.j.name || '').startsWith(OLD_OWN[oldAct])) return { error: 'campania nu e a Centrul360 (fără prefixul ' + OLD_OWN[oldAct] + ')' };
  const sets = (r.j.adsets && r.j.adsets.data) || [], adsL = (r.j.ads && r.j.ads.data) || [];
  const ad = adsL.find((a) => a.effective_status !== 'DELETED' && a.effective_status !== 'ARCHIVED') || adsL[0];
  if (!ad || !ad.creative) return { error: 'campania veche n-are reclamă' };
  const oss = ad.creative.object_story_spec || {}, feed = ad.creative.asset_feed_spec || null;
  const t0 = (sets[0] && sets[0].targeting) || {};
  const t = {}; KEEP_T.forEach((k) => { if (t0[k] !== undefined) t[k] = t0[k]; });
  if (o && o.women) t.genders = [2]; // Centrul360's ads: women only
  const ld = oss.link_data || null, vd = oss.video_data || null;
  // the texts of an ad that mixes several (Meta's asset feed) live there, not in the story: the first ones stand in
  const fb0 = (k) => (feed && feed[k] && feed[k][0] && feed[k][0].text) || '';
  const cta = (ld && ld.call_to_action) || (vd && vd.call_to_action) || (feed && feed.call_to_action_types && { type: feed.call_to_action_types[0] }) || {};
  // a form given here wins over the old one (21.11: a proven ad sent into a lead-filter form)
  const formId = String((o && o.formId) || (cta.value && cta.value.lead_gen_form_id) || '');
  const plan = { oldName: r.j.name, kind: vd ? 'video' : 'image', formId, targeting: t, cta: cta.type || '', text: ((ld && ld.message) || (vd && vd.message) || fb0('bodies')).slice(0, 120), feed: !!feed };
  if (!formId) return Object.assign({ error: 'formularul vechi nu se vede' }, { plan });
  if (o && o.dry) return { ok: true, dry: true, plan, dsa: await dsaOf(conn), creative: ad.creative };

  // the picture or the video, into the connected account
  let mediaSpec = {};
  if (vd) {
    let vid = String((o && o.videoId) || '');
    if (!vid) {
      const src = await call('GET', '/' + vd.video_id, tok, { fields: 'source' });
      if (!src.ok || !src.j.source) return { error: metaError(src.j, 'Videoul vechi') };
      const up = await call('POST', '/' + act + '/advideos', tok, { file_url: src.j.source, name: name });
      if (!up.ok) return { error: metaError(up.j, 'Videoul') };
      vid = up.j.id;
    }
    let ready = false;
    for (let i = 0; i < 8 && !ready; i++) {
      const st = await call('GET', '/' + vid, tok, { fields: 'status' });
      const vs = st.ok && st.j.status && st.j.status.video_status;
      if (vs === 'ready') ready = true; else if (vs === 'error') return { error: 'Meta n-a putut procesa videoul' };
      else await new Promise((res) => setTimeout(res, 4000));
    }
    if (!ready) return { ok: false, pending: true, videoId: vid };
    let thumb = vd.image_url || '';
    if (!thumb) { const th = await call('GET', '/' + vid + '/thumbnails', tok, {}); thumb = th.ok && th.j.data && th.j.data[0] ? th.j.data[0].uri : ''; }
    mediaSpec = { video_data: Object.assign({ video_id: vid, message: vd.message || fb0('bodies'), title: vd.title || fb0('titles') || undefined, link_description: vd.link_description || fb0('descriptions') || undefined,
      call_to_action: { type: cta.type || 'LEARN_MORE', value: { lead_gen_form_id: formId } } }, thumb ? { image_url: thumb } : {}) };
  } else {
    const hash = (ld && ld.image_hash) || (feed && feed.images && feed.images[0] && feed.images[0].hash) || '';
    let url = (ld && (ld.picture || ld.image_url)) || '';
    if (hash && !url) {
      const im = await call('GET', '/' + oldAct + '/adimages', tok, { hashes: JSON.stringify([hash]), fields: 'hash,url,permalink_url' });
      const x = im.ok && im.j.data && im.j.data[0];
      url = x ? (x.url || x.permalink_url || '') : '';
    }
    if (!url) return { error: 'imaginea veche nu se vede' };
    const bin = await fetch(url);
    if (!bin.ok) return { error: 'imaginea veche nu se descarcă (' + bin.status + ')' };
    const b64 = Buffer.from(await bin.arrayBuffer()).toString('base64');
    const img = await call('POST', '/' + act + '/adimages', tok, { bytes: b64, name: name.slice(0, 60) + '.jpg' });
    if (!img.ok) return { error: metaError(img.j, 'Imaginea') };
    const imgs = img.j.images || {}; const h = (imgs[Object.keys(imgs)[0]] || {}).hash;
    if (!h) return { error: 'Imaginea: Meta n-a întors codul imaginii' };
    mediaSpec = { link_data: { image_hash: h, link: 'https://fb.me/', message: (ld && ld.message) || fb0('bodies'), name: (ld && ld.name) || fb0('titles') || undefined, description: (ld && ld.description) || fb0('descriptions') || undefined,
      call_to_action: { type: cta.type || 'LEARN_MORE', value: { lead_gen_form_id: formId } } } };
  }

  const made = [];
  const undo = async () => { for (const id of made.slice().reverse()) await call('DELETE', '/' + id, tok).catch(() => {}); };
  try {
    const camp = await call('POST', '/' + act + '/campaigns', tok, { name, objective: 'OUTCOME_LEADS', status: 'PAUSED', special_ad_categories: [], buying_type: 'AUCTION', is_adset_budget_sharing_enabled: false });
    if (!camp.ok) return { error: metaError(camp.j, 'Campania') };
    made.push(camp.j.id);
    const adset = await call('POST', '/' + act + '/adsets', tok, { name, campaign_id: camp.j.id, daily_budget: cents(conn, budget), billing_event: 'IMPRESSIONS',
      optimization_goal: 'LEAD_GENERATION', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', destination_type: 'ON_AD', promoted_object: { page_id: conn.pageId }, targeting: t, status: 'PAUSED', ...(await dsaOf(conn)) });
    if (!adset.ok) { await undo(); return { error: metaError(adset.j, 'Setul de reclame') }; }
    const spec = Object.assign({ page_id: conn.pageId }, mediaSpec);
    const ig = await call('GET', '/' + conn.pageId, conn.pageAccessToken, { fields: 'instagram_business_account' });
    if (ig.ok && ig.j.instagram_business_account) spec.instagram_user_id = ig.j.instagram_business_account.id;
    // the old ad's extra texts / titles (Meta mixing them), when it had them
    const multi = feed && ((feed.bodies || []).length > 1 || (feed.titles || []).length > 1);
    const af = multi ? { bodies: (feed.bodies || []).map((x) => ({ text: x.text })), titles: (feed.titles || []).map((x) => ({ text: x.text })), descriptions: feed.descriptions ? feed.descriptions.map((x) => ({ text: x.text })) : undefined, optimization_type: 'DEGREES_OF_FREEDOM' } : null;
    let creative = await call('POST', '/' + act + '/adcreatives', tok, Object.assign({ name, object_story_spec: spec }, af ? { asset_feed_spec: af } : {}));
    if (!creative.ok && af) creative = await call('POST', '/' + act + '/adcreatives', tok, { name, object_story_spec: spec });
    if (!creative.ok) { await undo(); return { error: metaError(creative.j, 'Reclama (textele și imaginea)') }; }
    made.push(creative.j.id);
    const adM = await call('POST', '/' + act + '/ads', tok, { name, adset_id: adset.j.id, creative: { creative_id: creative.j.id }, status: 'ACTIVE' });
    if (!adM.ok) { await undo(); return { error: metaError(adM.j, 'Reclama') }; }
    const on = (o && o.paused) ? { ok: true } : await call('POST', '/' + adset.j.id, tok, { status: 'ACTIVE' });
    const onC = (o && o.paused) ? { ok: true } : await call('POST', '/' + camp.j.id, tok, { status: 'ACTIVE' });
    return { ok: true, campaignId: camp.j.id, adsetId: adset.j.id, adId: adM.j.id, started: !(o && o.paused) && on.ok && onC.ok, plan };
  } catch (err) {
    await undo();
    return { error: 'Rețea: ' + err.message };
  }
}

// ---------------------------------------------------------------- Admin → Reclame
const leadsOf = (row) => {
  const acts = (row && row.actions) || [];
  for (const t of LEAD_ACTIONS) { const a = acts.find((x) => x.action_type === t); if (a) return Number(a.value) || 0; }
  return 0;
};
// a campaign that sends to the website (centrul360.com): its steps there, as Meta counts them (the first type found; the
// omni_ ones add the app and the conversions API to the pixel, the same number Ads Manager shows in its own columns)
const SITE_ACTIONS = {
  visits: ['landing_page_view', 'omni_landing_page_view'],
  carts: ['omni_add_to_cart', 'add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'],
  checkouts: ['omni_initiated_checkout', 'initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'],
  purchases: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'],
  // the pixel's Schedule (a booking on the site) and Lead (a form of the site), 23.11
  schedules: ['schedule_total', 'schedule_website', 'offsite_conversion.fb_pixel_schedule'],
  pixelLeads: ['offsite_conversion.fb_pixel_lead', 'lead'],
};
const firstOf = (list, types) => {
  for (const t of types) { const a = (list || []).find((x) => x.action_type === t); if (a) return Number(a.value) || 0; }
  return 0;
};
const siteOf = (conn, row) => ({
  visits: firstOf(row.actions, SITE_ACTIONS.visits), carts: firstOf(row.actions, SITE_ACTIONS.carts),
  checkouts: firstOf(row.actions, SITE_ACTIONS.checkouts), purchases: firstOf(row.actions, SITE_ACTIONS.purchases),
  schedules: firstOf(row.actions, SITE_ACTIONS.schedules), pixelLeads: firstOf(row.actions, SITE_ACTIONS.pixelLeads),
  purchaseValue: inLei(conn, firstOf(row.action_values, SITE_ACTIONS.purchases)),
});
// the objectives whose ads send to a website, when the ad sets don't say where they send
const SITE_OBJECTIVES = ['OUTCOME_SALES', 'OUTCOME_TRAFFIC', 'LINK_CLICKS', 'CONVERSIONS', 'PRODUCT_CATALOG_SALES'];
function nearCity(lat, lng) {
  const k = Object.keys(CITIES).find((c) => Math.abs(CITIES[c].lat - lat) < 0.08 && Math.abs(CITIES[c].lng - lng) < 0.1);
  return k || '';
}
// who an ad set reaches, in a few words
function audience(t) {
  if (!t) return '';
  const g = t.geo_locations || {};
  const where = (g.custom_locations || []).map((c) => (nearCity(+c.latitude, +c.longitude) || 'pin') + ' ' + c.radius + ' ' + (c.distance_unit === 'mile' ? 'mile' : 'km'))
    .concat((g.cities || []).map((c) => c.name + (c.radius ? ' +' + c.radius + ' ' + (c.distance_unit === 'mile' ? 'mile' : 'km') : '')))
    .concat((g.regions || []).map((r) => r.name)).concat((g.countries || []).map((c) => c));
  const who = Array.isArray(t.genders) && t.genders.length === 1 ? (t.genders[0] === 2 ? 'femei' : 'bărbați') : 'toți';
  return [where.join(', '), who + ' ' + (t.age_min || 18) + '-' + (t.age_max || 65)].filter(Boolean).join(' · ');
}

// a campaign without its own budget: what its ad sets spend a day (the ones on, else all of them)
const setsBudget = (sets) => {
  const on = sets.filter((a) => a.status === 'ACTIVE');
  return (on.length ? on : sets).reduce((n, a) => n + a.daily, 0);
};

// Campaigns with their ad sets and ads, and the results of the period, for the Reclame page.
// range = { since, until } (YYYY-MM-DD, the account's days) wins over the period
// the campaigns Reclame shows: the running ones, and the paused ones that spent in the period or the last 30 days.
// The account keeps hundreds of old paused campaigns: reading them all cut Meta's list (the new ones fell out) and used
// up the account's allowance of calls. (Running = not paused by the owner: on, in review, with issues.)
const RUNNING = ['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES'];
const CAMP_FIELDS = 'id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time';
const chunks = (list, n) => { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };
async function campaignsOf(conn, spentIds) {
  const tok = conn.userToken, act = conn.adAccountId;
  const on = await all('/' + act + '/campaigns', tok, { fields: CAMP_FIELDS, limit: '100', effective_status: JSON.stringify(RUNNING) }, 3);
  if (on.error) return on;
  const have = new Set(on.data.map((c) => c.id));
  const more = [...new Set(spentIds)].filter((id) => id && !have.has(id));
  const out = on.data.slice();
  // (Meta no longer takes ?ids=: the account's own list, filtered by those ids)
  for (const part of chunks(more, 100)) {
    const r = await all('/' + act + '/campaigns', tok, { fields: CAMP_FIELDS, limit: '100', effective_status: JSON.stringify(LIVE), filtering: JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: part }]) }, 2);
    if (r.error) return r;
    out.push(...r.data.filter((c) => !have.has(c.id)));
  }
  return { data: out };
}
// the ad sets / ads of those campaigns only, every status but deleted / archived
async function childrenOf(conn, edge, fields, ids, limit) {
  const out = [];
  for (const part of chunks(ids, 100)) {
    const r = await all('/' + conn.adAccountId + '/' + edge, conn.userToken, { fields, limit, effective_status: JSON.stringify(LIVE), filtering: JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: part }]) }, 5);
    if (r.error) return r;
    out.push(...r.data);
  }
  return { data: out };
}

async function overview(conn, period, range, recentIds) {
  const tok = conn.userToken, act = conn.adAccountId;
  const when = range ? { time_range: JSON.stringify({ since: range.since, until: range.until }) } : { date_preset: PERIODS[period] || 'last_7d' };
  const iC = await all('/' + act + '/insights', tok, Object.assign({ level: 'campaign', fields: 'campaign_id,' + RESULTS, limit: '500' }, when), 3);
  // Meta saying "too many calls" to the first reading: nothing more is asked now
  if (iC.error) return { error: iC.error };
  const camps = await campaignsOf(conn, (iC.data || []).map((r) => r.campaign_id).concat(recentIds || []));
  if (camps.error) return { error: camps.error };
  camps.data = camps.data.filter((c) => ours(conn, c.name));
  const ids = camps.data.map((c) => c.id);
  const [sets, ads, iS, iA, acc] = await Promise.all([
    childrenOf(conn, 'adsets', 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,targeting,destination_type,created_time', ids, '200'),
    childrenOf(conn, 'ads', 'id,name,adset_id,campaign_id,status,effective_status,created_time,ad_review_feedback,creative{thumbnail_url,image_url,body,title}', ids, '200'),
    all('/' + act + '/insights', tok, Object.assign({ level: 'adset', fields: 'adset_id,' + RESULTS, limit: '500' }, when), 3),
    all('/' + act + '/insights', tok, Object.assign({ level: 'ad', fields: 'ad_id,' + RESULTS, limit: '500' }, when), 3),
    call('GET', '/' + act, tok, { fields: 'name,currency,account_status,amount_spent' }),
  ]);
  // the ad sets or the ads refused (often Meta's "too many calls"): no half picture (campaigns without their ads) that
  // could be kept as if whole; the last whole one is shown instead (ads-cache.js)
  // (the same for the ad sets' or the ads' numbers: zeros under real campaign numbers would read as real)
  if (sets.error || ads.error || iS.error || iA.error) return { error: sets.error || ads.error || iS.error || iA.error };
  const res = (rows, key) => new Map((rows.data || []).map((r) => [r[key], {
    spend: inLei(conn, r.spend), leads: leadsOf(r), impressions: Number(r.impressions) || 0, reach: Number(r.reach) || 0,
    clicks: Number(r.clicks) || 0, linkClicks: Number(r.inline_link_clicks) || 0, ...siteOf(conn, r),
  }]));
  const rC = res(iC, 'campaign_id'), rS = res(iS, 'adset_id'), rA = res(iA, 'ad_id');
  const zero = { spend: 0, leads: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, visits: 0, carts: 0, checkouts: 0, purchases: 0, purchaseValue: 0, schedules: 0, pixelLeads: 0 };
  const results = (r) => ({ spend: r.spend, leads: r.leads, impressions: r.impressions, reach: r.reach, clicks: r.clicks, linkClicks: r.linkClicks,
    visits: r.visits, carts: r.carts, checkouts: r.checkouts, purchases: r.purchases, purchaseValue: r.purchaseValue, schedules: r.schedules, pixelLeads: r.pixelLeads });
  const money = (v) => budLei(conn, v);
  const adsBySet = new Map();
  (ads.data || []).forEach((a) => {
    const r = rA.get(a.id) || zero;
    const review = a.ad_review_feedback && a.ad_review_feedback.global ? Object.values(a.ad_review_feedback.global).join(' ') : '';
    const list = adsBySet.get(a.adset_id) || [];
    list.push(Object.assign({ id: a.id, name: a.name, status: a.status, effective: a.effective_status, created: a.created_time,
      thumb: (a.creative && (a.creative.thumbnail_url || a.creative.image_url)) || '', text: (a.creative && (a.creative.title || a.creative.body)) || '',
      review, adsetId: a.adset_id, campaignId: a.campaign_id }, results(r)));
    adsBySet.set(a.adset_id, list);
  });
  const setsByCamp = new Map();
  (sets.data || []).forEach((s) => {
    const r = rS.get(s.id) || zero;
    const list = setsByCamp.get(s.campaign_id) || [];
    list.push(Object.assign({ id: s.id, name: s.name, status: s.status, effective: s.effective_status, created: s.created_time,
      daily: money(s.daily_budget), lifetime: money(s.lifetime_budget), audience: audience(s.targeting), dest: s.destination_type || '',
      campaignId: s.campaign_id, ads: (adsBySet.get(s.id) || []).sort((a, b) => (a.created < b.created ? 1 : -1)) }, results(r)));
    setsByCamp.set(s.campaign_id, list);
  });
  const campaigns = (camps.data || []).map((c) => {
    const r = rC.get(c.id) || zero;
    const adsets = (setsByCamp.get(c.id) || []).sort((a, b) => (a.created < b.created ? 1 : -1));
    // sends to the website (not to a lead form): the page shows its website numbers (clicks, visits, purchases)
    const dests = adsets.map((s) => s.dest).filter(Boolean);
    const site = dests.length ? dests.includes('WEBSITE') : SITE_OBJECTIVES.includes(c.objective);
    return { id: c.id, name: c.name, status: c.status, effective: c.effective_status, objective: c.objective, site, created: c.created_time,
      daily: money(c.daily_budget) || setsBudget(adsets), cbo: !!c.daily_budget,
      lifetime: money(c.lifetime_budget), adsets, ...results(r) };
  }).sort((a, b) => (a.status === 'ACTIVE') === (b.status === 'ACTIVE') ? (a.created < b.created ? 1 : -1) : a.status === 'ACTIVE' ? -1 : 1);
  const totals = campaigns.reduce((t, c) => ({ spend: t.spend + c.spend, leads: t.leads + c.leads }), { spend: 0, leads: 0 });
  return {
    ok: true, period: range ? 'custom' : period, range: range || null, account: { id: act, name: (acc.ok && acc.j.name) || conn.adAccountName || act, currency: (acc.ok && acc.j.currency) || 'RON', status: acc.ok ? acc.j.account_status : null },
    totals, campaigns, partial: [iC, iS, iA, sets, ads].some((x) => x.truncated) ? 'Lista e lungă: Meta n-a dat tot, unele cifre pot lipsi.' : '',
  };
}

// the website ads' tags (Admin → Reclame, 23.11): the utm_campaign and utm_content of each ad's link, to find the site's
// records of it (api/_lib/site-sources.js byAd). { adId: { campaign, content } } for the ads of these campaigns.
function tagsOfLink(u) {
  try {
    const q = new URL(String(u || '')).searchParams;
    const low = (v) => String(v || '').trim().toLowerCase().slice(0, 80);
    return { campaign: low(q.get('utm_campaign')), content: low(q.get('utm_content')) };
  } catch (e) { return { campaign: '', content: '' }; }
}
async function adLinks(conn, campaignIds) {
  const ids = (campaignIds || []).filter((id) => /^\d+$/.test(String(id)));
  if (!ids.length) return { links: {} };
  const r = await childrenOf(conn, 'ads', 'id,creative{object_story_spec,asset_feed_spec,url_tags}', ids, '100');
  if (r.error) return { error: r.error };
  const links = {};
  (r.data || []).forEach((a) => {
    const c = a.creative || {}, o = c.object_story_spec || {}, f = c.asset_feed_spec || {};
    const ld = o.link_data || {}, vd = o.video_data || {};
    const cta = (x) => (x && x.call_to_action && x.call_to_action.value && x.call_to_action.value.link) || '';
    const u = ld.link || cta(ld) || cta(vd) || ((f.link_urls || [])[0] || {}).website_url || '';
    const t = tagsOfLink(u);
    // the tags Meta adds to the link (url_tags) count too, when the link has none
    const extra = tagsOfLink('https://x/?' + String(c.url_tags || ''));
    links[a.id] = { campaign: t.campaign || extra.campaign, content: t.content || extra.content };
  });
  return { links };
}

// On / off, budget, name, delete: for a campaign, an ad set or an ad of this account.
async function act(conn, a) {
  const tok = conn.userToken;
  const id = String(a.id || '');
  if (!/^\d{5,25}$/.test(id)) return { error: 'ID invalid' };
  // the object must belong to the connected ad account
  const own = await call('GET', '/' + id, tok, { fields: 'account_id' });
  if (!own.ok) return { error: metaError(own.j) };
  if ('act_' + own.j.account_id !== conn.adAccountId) return { error: 'Nu e în contul de reclame conectat.' };
  if (!(await isOurs(conn, id))) return { error: 'Campania nu e a Centrul360 (e a altei afaceri din același cont de reclame).' };
  let r;
  if (a.action === 'status') {
    if (!['ACTIVE', 'PAUSED'].includes(a.status)) return { error: 'Status invalid' };
    r = await call('POST', '/' + id, tok, { status: a.status });
  } else if (a.action === 'budget') {
    const lei = Math.round((Number(a.daily) || 0) * 100) / 100;
    if (!(lei >= 5)) return { error: 'Bugetul minim e 5 lei pe zi.' };
    r = await call('POST', '/' + id, tok, { daily_budget: cents(conn, lei) });
  } else if (a.action === 'rename') {
    const name = String(a.name || '').trim().slice(0, 200);
    if (!name) return { error: 'Numele lipsește.' };
    r = await call('POST', '/' + id, tok, { name });
  } else if (a.action === 'delete') {
    r = await call('DELETE', '/' + id, tok);
  } else return { error: 'Acțiune necunoscută' };
  return r.ok ? { ok: true } : { error: metaError(r.j) };
}

// the campaign an object (campaign, ad set or ad) belongs to is ours (a campaign has no `campaign` field: its own name)
async function isOurs(conn, id) {
  let r = await call('GET', '/' + id, conn.userToken, { fields: 'name,campaign{name}' });
  if (!r.ok) r = await call('GET', '/' + id, conn.userToken, { fields: 'name' });
  if (!r.ok) return true; // read again by act() itself; the account check above already passed
  return ours(conn, r.j.campaign ? r.j.campaign.name : r.j.name);
}

const adsManagerUrl = (actId, campaignId) => 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=' + String(actId).replace(/^act_/, '') + (campaignId ? '&selected_campaign_ids=' + campaignId : '');

// What every ad spent in a period, deleted and archived ones too (Admin → Oferte: the spend of each offer):
// [{ adId, adName, campaignId, campaignName, spend }]
async function adSpend(conn, period, range) {
  const when = range ? { time_range: JSON.stringify({ since: range.since, until: range.until }) } : { date_preset: PERIODS[period] || 'maximum' };
  const every = LIVE.concat(['ARCHIVED', 'DELETED']);
  const r = await all('/' + conn.adAccountId + '/insights', conn.userToken, Object.assign({ level: 'ad', fields: 'ad_id,ad_name,campaign_id,campaign_name,spend', limit: '500',
    filtering: JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: every }]) }, when), 20);
  if (r.error) return { error: r.error };
  return { rows: r.data.filter((x) => ours(conn, x.campaign_name)).map((x) => ({ adId: String(x.ad_id || ''), adName: x.ad_name || '', campaignId: String(x.campaign_id || ''), campaignName: x.campaign_name || '', spend: inLei(conn, x.spend) })) };
}

// Every ad of a period for Panou → KPI: what Meta counted (spend, impressions, reach, link clicks, its own leads) with the
// ad's name, campaign, status and picture (the deleted / archived ones too, without a picture), and the account's spend
// day by day.
async function adStats(conn, range) {
  const when = { time_range: JSON.stringify({ since: range.since, until: range.until }) };
  const every = JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: LIVE.concat(['ARCHIVED', 'DELETED']) }]);
  const act = '/' + conn.adAccountId, tok = conn.userToken;
  const [ins, ads, daily] = await Promise.all([
    all(act + '/insights', tok, Object.assign({ level: 'ad', fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,' + RESULTS, limit: '500', filtering: every }, when), 20),
    all(act + '/ads', tok, { fields: 'id,effective_status,creative{thumbnail_url,image_url}', limit: '200', effective_status: JSON.stringify(LIVE) }, 3),
    // day by day: the account's, or (the account shared with other businesses) the sum of our campaigns' days
    scoped(conn) ? all(act + '/insights', tok, Object.assign({ level: 'campaign', fields: 'campaign_name,spend', time_increment: '1', limit: '500', filtering: JSON.stringify([{ field: 'campaign.effective_status', operator: 'IN', value: LIVE.concat(['ARCHIVED', 'DELETED']) }]) }, when), 20)
      .then((d) => (d.error ? d : { data: Object.values(d.data.filter((x) => ours(conn, x.campaign_name)).reduce((m, x) => { const k = x.date_start; m[k] = m[k] || { date_start: k, spend: 0 }; m[k].spend += inLei(conn, x.spend); return m; }, {})).sort((a, b) => (a.date_start < b.date_start ? -1 : 1)) }))
      : all(act + '/insights', tok, Object.assign({ level: 'account', fields: 'spend', time_increment: '1', limit: '120' }, when), 2),
  ]);
  if (ins.error) return { error: ins.error };
  if (ads.error) return { error: ads.error }; // without the list, a running ad would read as stopped
  const meta = new Map((ads.data || []).map((a) => [String(a.id), a]));
  return {
    rows: ins.data.filter((x) => ours(conn, x.campaign_name)).map((x) => {
      const a = meta.get(String(x.ad_id)) || {};
      return { adId: String(x.ad_id || ''), adName: x.ad_name || '', adsetId: String(x.adset_id || ''), adsetName: x.adset_name || '', campaignId: String(x.campaign_id || ''), campaignName: x.campaign_name || '',
        spend: inLei(conn, x.spend), impressions: Number(x.impressions) || 0, reach: Number(x.reach) || 0, linkClicks: Number(x.inline_link_clicks) || 0, metaLeads: leadsOf(x),
        status: a.effective_status || 'ARCHIVED', thumb: (a.creative && (a.creative.thumbnail_url || a.creative.image_url)) || '' };
    }),
    daily: (daily.data || []).map((d) => ({ day: d.date_start, spend: inLei(conn, d.spend) })),
    dailyError: daily.error || null, // the day by day spend did not come back (the totals per ad did)
  };
}

// Every ad's days in a range (spend, impressions, link clicks, Meta's leads) and every ad's status and picture: one read
// that serves any period inside it (api/_lib/kpi.js adds the days up; reach does not add up day by day, so it is not read)
async function adStatsDaily(conn, range) {
  const when = { time_range: JSON.stringify({ since: range.since, until: range.until }) };
  const every = JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: LIVE.concat(['ARCHIVED', 'DELETED']) }]);
  const act = '/' + conn.adAccountId, tok = conn.userToken;
  const [ins, ads] = await Promise.all([
    all(act + '/insights', tok, Object.assign({ level: 'ad', fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,actions,impressions,inline_link_clicks', time_increment: '1', limit: '500', filtering: every }, when), 30),
    all(act + '/ads', tok, { fields: 'id,effective_status,creative{thumbnail_url,image_url}', limit: '200', effective_status: JSON.stringify(LIVE) }, 3),
  ]);
  if (ins.error) return { error: ins.error };
  if (ads.error) return { error: ads.error };
  const meta = {};
  (ads.data || []).forEach((a) => { meta[String(a.id)] = { status: a.effective_status || '', thumb: (a.creative && (a.creative.thumbnail_url || a.creative.image_url)) || '' }; });
  return {
    rows: ins.data.filter((x) => ours(conn, x.campaign_name)).map((x) => ({ day: x.date_start, adId: String(x.ad_id || ''), adName: x.ad_name || '', adsetId: String(x.adset_id || ''), adsetName: x.adset_name || '',
      campaignId: String(x.campaign_id || ''), campaignName: x.campaign_name || '', spend: inLei(conn, x.spend), impressions: Number(x.impressions) || 0, linkClicks: Number(x.inline_link_clicks) || 0, metaLeads: leadsOf(x) }))
      .filter((x) => x.adId && x.day),
    meta,
  };
}

// The lead form each ad sends to (the ones not deleted / archived): [{ adId, adName, status, formId }]
async function adForms(conn) {
  const r = await all('/' + conn.adAccountId + '/ads', conn.userToken, { fields: 'id,name,effective_status,creative{object_story_spec,asset_feed_spec}', limit: '200', effective_status: JSON.stringify(LIVE) }, 5);
  if (r.error) return { error: r.error };
  const find = (o) => { if (!o || typeof o !== 'object') return ''; if (o.lead_gen_form_id) return String(o.lead_gen_form_id); for (const k of Object.keys(o)) { const v = find(o[k]); if (v) return v; } return ''; };
  return { rows: r.data.map((a) => ({ adId: String(a.id), adName: a.name || '', status: a.effective_status || '', formId: find(a.creative || {}) })).filter((x) => x.formId) };
}

// the guard (api/_lib/ads-guard.js): what each running ad spent and the leads Meta counted, over some days
async function adResults(conn, range) {
  const r = await all('/' + conn.adAccountId + '/insights', conn.userToken, { level: 'ad', fields: 'ad_id,ad_name,campaign_id,campaign_name,spend,actions', limit: '500',
    time_range: JSON.stringify({ since: range.since, until: range.until }), filtering: JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: ['ACTIVE'] }]) }, 5);
  if (r.error) return { error: r.error };
  return { rows: r.data.filter((x) => ours(conn, x.campaign_name)).map((x) => ({ adId: String(x.ad_id || ''), adName: x.ad_name || '', campaignId: String(x.campaign_id || ''), campaignName: x.campaign_name || '', spend: inLei(conn, x.spend), metaLeads: leadsOf(x) })).filter((x) => x.adId) };
}
// and each running campaign's days (spend, Meta's leads), to see if it still does well and uses its budget
async function campaignDays(conn, range) {
  const r = await all('/' + conn.adAccountId + '/insights', conn.userToken, { level: 'campaign', fields: 'campaign_id,campaign_name,spend,actions', time_increment: '1', limit: '500',
    time_range: JSON.stringify({ since: range.since, until: range.until }), filtering: JSON.stringify([{ field: 'campaign.effective_status', operator: 'IN', value: ['ACTIVE'] }]) }, 5);
  if (r.error) return { error: r.error };
  return { rows: r.data.filter((x) => ours(conn, x.campaign_name)).map((x) => ({ campaignId: String(x.campaign_id || ''), campaignName: x.campaign_name || '', day: x.date_start, spend: inLei(conn, x.spend), metaLeads: leadsOf(x) })).filter((x) => x.campaignId) };
}
// every ad's days (spend, Meta's leads, link clicks), paused and deleted ones too: when each last ran and what a lead
// cost on its days (read only; Claude's /api/ads-publish?action=daily)
async function adDays(conn, range) {
  const every = LIVE.concat(['ARCHIVED', 'DELETED']);
  const r = await all('/' + conn.adAccountId + '/insights', conn.userToken, { level: 'ad', fields: 'ad_id,ad_name,campaign_id,campaign_name,spend,actions,inline_link_clicks', time_increment: '1', limit: '500',
    time_range: JSON.stringify({ since: range.since, until: range.until }), filtering: JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: every }]) }, 30);
  if (r.error) return { error: r.error };
  return { rows: r.data.filter((x) => ours(conn, x.campaign_name)).map((x) => ({ adId: String(x.ad_id || ''), adName: x.ad_name || '', campaignId: String(x.campaign_id || ''), campaignName: x.campaign_name || '', day: x.date_start, spend: inLei(conn, x.spend), metaLeads: leadsOf(x), clicks: Number(x.inline_link_clicks) || 0 })).filter((x) => x.adId && (x.spend || x.metaLeads)) };
}
// how often the same women saw some campaigns over some days (frequency doesn't add up day by day: read whole)
async function campaignReach(conn, range, ids) {
  if (!ids.length) return { freq: new Map() };
  const r = await all('/' + conn.adAccountId + '/insights', conn.userToken, { level: 'campaign', fields: 'campaign_id,reach,impressions,frequency', limit: '500',
    time_range: JSON.stringify({ since: range.since, until: range.until }), filtering: JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: ids }]) }, 3);
  if (r.error) return { error: r.error };
  return { freq: new Map(r.data.map((x) => [String(x.campaign_id), Number(x.frequency) || (Number(x.reach) ? Number(x.impressions) / Number(x.reach) : 0)])) };
}
// where a campaign's daily budget sits: on the campaign, or on its one running ad set (several ad sets: not touched)
async function budgetOf(conn, campaignId) {
  if (!/^\d{5,25}$/.test(String(campaignId || ''))) return { error: 'ID invalid' };
  const r = await call('GET', '/' + campaignId, conn.userToken, { fields: 'account_id,name,daily_budget,lifetime_budget,adsets.limit(20){id,daily_budget,lifetime_budget,effective_status}' });
  if (!r.ok) return { error: metaError(r.j) };
  if ('act_' + r.j.account_id !== conn.adAccountId) return { error: 'Nu e în contul de reclame conectat.' };
  if (r.j.name !== undefined && !ours(conn, r.j.name)) return { error: 'campania e a altei afaceri' };
  if (Number(r.j.daily_budget) > 0) return { id: String(campaignId), level: 'campaign', daily: budLei(conn, r.j.daily_budget) };
  if (Number(r.j.lifetime_budget) > 0) return { error: 'buget pe toată durata' };
  const sets = ((r.j.adsets && r.j.adsets.data) || []).filter((s) => !['DELETED', 'ARCHIVED'].includes(s.effective_status));
  const on = sets.filter((s) => RUNNING.includes(s.effective_status));
  // the running one; a paused campaign (nothing runs) with one ad set: that one, so a budget can be set before it goes on
  const pool = on.length ? on : sets;
  if (pool.length === 1 && Number(pool[0].daily_budget) > 0) return { id: String(pool[0].id), level: 'adset', daily: budLei(conn, pool[0].daily_budget), off: !on.length };
  if (pool.length === 1 && Number(pool[0].lifetime_budget) > 0) return { error: 'setul are buget pe toată durata' };
  return { error: pool.length > 1 ? 'mai multe seturi pornite' : pool.length ? 'setul n-are buget zilnic' : 'niciun set' };
}
// a campaign's ads still running (or about to: in review)
async function runningAdsOf(conn, campaignId) {
  if (!/^\d{5,25}$/.test(String(campaignId || ''))) return { error: 'ID invalid' };
  const r = await call('GET', '/' + campaignId + '/ads', conn.userToken, { fields: 'id', limit: '100', effective_status: JSON.stringify(['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'PREAPPROVED']) });
  if (!r.ok) return { error: metaError(r.j) };
  return { ids: (r.j.data || []).map((a) => String(a.id)) };
}

// the campaigns that spent in the last 30 days (paused ones among them stay in Reclame, to switch them back on)
async function recentCampaigns(conn) {
  const r = await all('/' + conn.adAccountId + '/insights', conn.userToken, { level: 'campaign', fields: 'campaign_id,campaign_name', date_preset: 'last_30d', limit: '500' }, 3);
  if (r.error) return { error: r.error };
  return { ok: true, ids: r.data.filter((x) => ours(conn, x.campaign_name)).map((x) => x.campaign_id).filter(Boolean) };
}

// why a campaign barely spends (Claude's report): its ad sets' and ads' delivery as Meta tells it
async function delivery(conn, id) {
  const r = await call('GET', '/' + id, conn.userToken, { fields: 'name,objective,effective_status,adsets{effective_status,daily_budget,optimization_goal,destination_type,learning_stage_info,start_time,promoted_object,targeting},ads{name,effective_status,issues_info,ad_review_feedback,creative{call_to_action_type,object_story_spec{link_data{link,call_to_action}},asset_feed_spec{titles,link_urls,call_to_action_types}}}' });
  return r.ok ? r.j : { error: metaError(r.j) };
}
// whether the account is shared (some campaigns are left out), so its own totals can't be used as ours
const scoped = (conn) => { const s = scopeOf(conn); return !!(s.include || (s.exclude || []).length); };
module.exports = { siteOf, adLinks, tagsOfLink, inLei, budLei, cents, FX, port, audienceCreate, audienceList, lookalikeCreate, reachEstimate, targetingOf, ours, scoped, call, delivery, accountStatus, CITIES, PLACEMENTS, CTAS, PERIODS, DEFAULTS, DEFAULTS_KEY, tokenInfo, cleanDefaults, loadDefaults, accountInfo, listAdsets, cleanSettings, publish, videoUpload, overview, recentCampaigns, adResults, campaignDays, campaignReach, budgetOf, runningAdsOf, act, adsManagerUrl, adSpend, adStats, adStatsDaily, adForms, adDays };
