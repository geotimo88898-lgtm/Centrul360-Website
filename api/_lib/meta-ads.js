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
const CTAS = ['LEARN_MORE', 'SIGN_UP', 'BOOK_NOW', 'GET_OFFER', 'APPLY_NOW', 'GET_QUOTE'];
const PERIODS = { today: 'today', yesterday: 'yesterday', '7d': 'last_7d', '30d': 'last_30d', max: 'maximum' };
// a lead from an instant form, as Meta counts it in the results (first one found)
// everything that is not deleted or archived (the edges' own effective_status filter)
const LIVE = ['ACTIVE', 'PAUSED', 'PENDING_REVIEW', 'DISAPPROVED', 'PREAPPROVED', 'PENDING_BILLING_INFO', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES'];
// what Meta counts for every row (the rest is worked out from these on the page)
const RESULTS = 'spend,actions,impressions,reach,clicks,inline_link_clicks';
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

// The ad sets an ad can join (not deleted), newest first, with their campaign.
async function listAdsets(conn) {
  const r = await all('/' + conn.adAccountId + '/adsets', conn.userToken, {
    fields: 'id,name,effective_status,daily_budget,created_time,campaign{id,name,objective}', limit: '100',
    effective_status: JSON.stringify(['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'PREAPPROVED']),
  }, 2);
  if (r.error) return [];
  return r.data.filter((a) => !a.campaign || !a.campaign.objective || /LEAD/.test(a.campaign.objective))
    .sort((a, b) => (a.created_time < b.created_time ? 1 : -1)).slice(0, 60)
    .map((a) => ({ id: a.id, name: a.name, status: a.effective_status, campaign: (a.campaign && a.campaign.name) || '', budget: a.daily_budget ? Number(a.daily_budget) / 100 : 0 }));
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
  if (!s.adName) return { error: 'missing_names' };
  if (!s.formId) return { error: 'missing_form' };
  if (!s.primaryText) return { error: 'missing_text' };
  if (s.adsetId) return { s }; // the audience, budget and placements are the ad set's own
  if (!s.campaignName || !s.adsetName) return { error: 'missing_names' };
  if (!s.city) return { error: 'missing_city' };
  if (!s.placements.length) return { error: 'missing_placements' };
  if (!(s.budget >= 5)) return { error: 'budget_too_low' };
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
  const undo = async () => { for (const id of made.slice().reverse()) await call('DELETE', '/' + id, tok).catch(() => {}); };
  try {
    const img = await call('POST', '/' + act + '/adimages', tok, { bytes: image.base64, name: image.name || 'creative.jpg' });
    if (!img.ok) return { error: metaError(img.j, 'Imaginea') };
    const imgs = img.j.images || {};
    const hash = (imgs[Object.keys(imgs)[0]] || {}).hash;
    if (!hash) return { error: 'Imaginea: Meta n-a întors codul imaginii' };

    let campaignId = '', adsetId = s.adsetId;
    if (!adsetId) {
      const camp = await call('POST', '/' + act + '/campaigns', tok, {
        name: s.campaignName, objective: 'OUTCOME_LEADS', status: 'PAUSED', special_ad_categories: [], buying_type: 'AUCTION',
        is_adset_budget_sharing_enabled: false,
      });
      if (!camp.ok) return { error: metaError(camp.j, 'Campania') };
      campaignId = camp.j.id;
      made.push(campaignId);
      const adset = await call('POST', '/' + act + '/adsets', tok, {
        name: s.adsetName, campaign_id: campaignId, daily_budget: String(Math.round(s.budget * 100)), billing_event: 'IMPRESSIONS',
        optimization_goal: 'LEAD_GENERATION', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', destination_type: 'ON_AD',
        promoted_object: { page_id: conn.pageId }, targeting: targeting(s), status: 'PAUSED',
      });
      if (!adset.ok) { await undo(); return { error: metaError(adset.j, 'Setul de reclame') }; }
      adsetId = adset.j.id;
    } else {
      const a = await call('GET', '/' + adsetId, tok, { fields: 'campaign_id,account_id' });
      if (!a.ok) return { error: metaError(a.j, 'Setul de reclame ales') };
      if (a.j.account_id && 'act_' + a.j.account_id !== act) return { error: 'Setul de reclame ales nu e în contul de reclame conectat.' };
      campaignId = a.j.campaign_id || '';
    }

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
    // two texts / up to three titles: Meta shows each person the mix that works best (more text options in the same ad)
    const bodies = [s.primaryText, s.primaryText2].filter(Boolean);
    const titles = [s.headline, s.headline2, s.headline3].filter(Boolean);
    const multi = bodies.length > 1 || titles.length > 1;
    const feed = multi ? { bodies: bodies.map((text) => ({ text })), titles: titles.map((text) => ({ text })), descriptions: s.description ? [{ text: s.description }] : undefined, optimization_type: 'DEGREES_OF_FREEDOM' } : null;
    let creative = await call('POST', '/' + act + '/adcreatives', tok, Object.assign({ name: s.adName, object_story_spec: spec }, feed ? { asset_feed_spec: feed } : {}));
    let textNote = '';
    // Meta refusing the second text: the ad goes with the first one, and says so
    if (!creative.ok && feed) {
      const why = metaError(creative.j, '');
      creative = await call('POST', '/' + act + '/adcreatives', tok, { name: s.adName, object_story_spec: spec });
      if (creative.ok) textNote = 'Meta n-a primit al doilea text / titlu (' + why + '), reclama are doar primul.';
    }
    if (!creative.ok) { await undo(); return { error: metaError(creative.j, 'Reclama (textele și imaginea)') }; }
    made.push(creative.j.id);

    // in a new campaign the ad goes on with it; in an existing ad set it follows the choice
    const ad = await call('POST', '/' + act + '/ads', tok, { name: s.adName, adset_id: adsetId, creative: { creative_id: creative.j.id }, status: s.adsetId && !s.startNow ? 'PAUSED' : 'ACTIVE' });
    if (!ad.ok) { await undo(); return { error: metaError(ad.j, 'Reclama') }; }

    // a new campaign: the ad set goes on now, the campaign too unless she starts it herself later,
    // so switching the campaign on (Reclame or Ads Manager) is all it takes then
    if (!s.adsetId) {
      const a = await call('POST', '/' + adsetId, tok, { status: 'ACTIVE' });
      const c = s.startNow ? await call('POST', '/' + campaignId, tok, { status: 'ACTIVE' }) : { ok: true };
      if (!a.ok || !c.ok) return { ok: true, campaignId, adsetId, adId: ad.j.id, started: false, warning: [metaError(!a.ok ? a.j : c.j, 'Pornirea'), textNote].filter(Boolean).join(' ') };
    }
    return Object.assign({ ok: true, campaignId, adsetId, adId: ad.j.id, started: s.startNow, texts: textNote ? 1 : Math.max(bodies.length, titles.length) }, textNote ? { warning: textNote } : {});
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
  for (const part of chunks(more, 50)) {
    const r = await call('GET', '/', tok, { ids: part.join(','), fields: CAMP_FIELDS + ',account_id' });
    if (!r.ok) return { error: metaError(r.j) };
    Object.values(r.j || {}).forEach((c) => { if (c && c.id && 'act_' + c.account_id === act && c.effective_status !== 'DELETED' && c.effective_status !== 'ARCHIVED') out.push(c); });
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
  const ids = camps.data.map((c) => c.id);
  const [sets, ads, iS, iA, acc] = await Promise.all([
    childrenOf(conn, 'adsets', 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,targeting,created_time', ids, '200'),
    childrenOf(conn, 'ads', 'id,name,adset_id,campaign_id,status,effective_status,created_time,ad_review_feedback,creative{thumbnail_url,image_url,body,title}', ids, '200'),
    all('/' + act + '/insights', tok, Object.assign({ level: 'adset', fields: 'adset_id,' + RESULTS, limit: '500' }, when), 3),
    all('/' + act + '/insights', tok, Object.assign({ level: 'ad', fields: 'ad_id,' + RESULTS, limit: '500' }, when), 3),
    call('GET', '/' + act, tok, { fields: 'name,currency,account_status,amount_spent' }),
  ]);
  // the ad sets or the ads refused (often Meta's "too many calls"): no half picture (campaigns without their ads) that
  // could be kept as if whole; the last whole one is shown instead (ads-cache.js)
  if (sets.error || ads.error) return { error: sets.error || ads.error };
  const res = (rows, key) => new Map((rows.data || []).map((r) => [r[key], {
    spend: Number(r.spend) || 0, leads: leadsOf(r), impressions: Number(r.impressions) || 0, reach: Number(r.reach) || 0,
    clicks: Number(r.clicks) || 0, linkClicks: Number(r.inline_link_clicks) || 0,
  }]));
  const rC = res(iC, 'campaign_id'), rS = res(iS, 'adset_id'), rA = res(iA, 'ad_id');
  const zero = { spend: 0, leads: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0 };
  const results = (r) => ({ spend: r.spend, leads: r.leads, impressions: r.impressions, reach: r.reach, clicks: r.clicks, linkClicks: r.linkClicks });
  const money = (v) => (v ? Number(v) / 100 : 0);
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
      daily: money(s.daily_budget), lifetime: money(s.lifetime_budget), audience: audience(s.targeting),
      campaignId: s.campaign_id, ads: (adsBySet.get(s.id) || []).sort((a, b) => (a.created < b.created ? 1 : -1)) }, results(r)));
    setsByCamp.set(s.campaign_id, list);
  });
  const campaigns = (camps.data || []).map((c) => {
    const r = rC.get(c.id) || zero;
    const adsets = (setsByCamp.get(c.id) || []).sort((a, b) => (a.created < b.created ? 1 : -1));
    return { id: c.id, name: c.name, status: c.status, effective: c.effective_status, objective: c.objective, created: c.created_time,
      daily: money(c.daily_budget) || setsBudget(adsets), cbo: !!c.daily_budget,
      lifetime: money(c.lifetime_budget), adsets, ...results(r) };
  }).sort((a, b) => (a.status === 'ACTIVE') === (b.status === 'ACTIVE') ? (a.created < b.created ? 1 : -1) : a.status === 'ACTIVE' ? -1 : 1);
  const totals = campaigns.reduce((t, c) => ({ spend: t.spend + c.spend, leads: t.leads + c.leads }), { spend: 0, leads: 0 });
  return {
    ok: true, period: range ? 'custom' : period, range: range || null, account: { id: act, name: (acc.ok && acc.j.name) || conn.adAccountName || act, currency: (acc.ok && acc.j.currency) || 'RON', status: acc.ok ? acc.j.account_status : null },
    totals, campaigns, partial: [iS, iA].some((x) => x.error) ? 'Rezultatele n-au venit toate de la Meta.' : '',
  };
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
  let r;
  if (a.action === 'status') {
    if (!['ACTIVE', 'PAUSED'].includes(a.status)) return { error: 'Status invalid' };
    r = await call('POST', '/' + id, tok, { status: a.status });
  } else if (a.action === 'budget') {
    const lei = Math.round((Number(a.daily) || 0) * 100) / 100;
    if (!(lei >= 5)) return { error: 'Bugetul minim e 5 lei pe zi.' };
    r = await call('POST', '/' + id, tok, { daily_budget: String(Math.round(lei * 100)) });
  } else if (a.action === 'rename') {
    const name = String(a.name || '').trim().slice(0, 200);
    if (!name) return { error: 'Numele lipsește.' };
    r = await call('POST', '/' + id, tok, { name });
  } else if (a.action === 'delete') {
    r = await call('DELETE', '/' + id, tok);
  } else return { error: 'Acțiune necunoscută' };
  return r.ok ? { ok: true } : { error: metaError(r.j) };
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
  return { rows: r.data.map((x) => ({ adId: String(x.ad_id || ''), adName: x.ad_name || '', campaignId: String(x.campaign_id || ''), campaignName: x.campaign_name || '', spend: Number(x.spend) || 0 })) };
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
    all(act + '/insights', tok, Object.assign({ level: 'account', fields: 'spend', time_increment: '1', limit: '120' }, when), 2),
  ]);
  if (ins.error) return { error: ins.error };
  const meta = new Map((ads.data || []).map((a) => [String(a.id), a]));
  return {
    rows: ins.data.map((x) => {
      const a = meta.get(String(x.ad_id)) || {};
      return { adId: String(x.ad_id || ''), adName: x.ad_name || '', adsetId: String(x.adset_id || ''), adsetName: x.adset_name || '', campaignId: String(x.campaign_id || ''), campaignName: x.campaign_name || '',
        spend: Number(x.spend) || 0, impressions: Number(x.impressions) || 0, reach: Number(x.reach) || 0, linkClicks: Number(x.inline_link_clicks) || 0, metaLeads: leadsOf(x),
        status: a.effective_status || 'ARCHIVED', thumb: (a.creative && (a.creative.thumbnail_url || a.creative.image_url)) || '' };
    }),
    daily: (daily.data || []).map((d) => ({ day: d.date_start, spend: Number(d.spend) || 0 })),
  };
}

// The lead form each ad sends to (the ones not deleted / archived): [{ adId, adName, status, formId }]
async function adForms(conn) {
  const r = await all('/' + conn.adAccountId + '/ads', conn.userToken, { fields: 'id,name,effective_status,creative{object_story_spec,asset_feed_spec}', limit: '200', effective_status: JSON.stringify(LIVE) }, 5);
  if (r.error) return { error: r.error };
  const find = (o) => { if (!o || typeof o !== 'object') return ''; if (o.lead_gen_form_id) return String(o.lead_gen_form_id); for (const k of Object.keys(o)) { const v = find(o[k]); if (v) return v; } return ''; };
  return { rows: r.data.map((a) => ({ adId: String(a.id), adName: a.name || '', status: a.effective_status || '', formId: find(a.creative || {}) })).filter((x) => x.formId) };
}

// the campaigns that spent in the last 30 days (paused ones among them stay in Reclame, to switch them back on)
async function recentCampaigns(conn) {
  const r = await all('/' + conn.adAccountId + '/insights', conn.userToken, { level: 'campaign', fields: 'campaign_id', date_preset: 'last_30d', limit: '500' }, 3);
  if (r.error) return { error: r.error };
  return { ok: true, ids: r.data.map((x) => x.campaign_id).filter(Boolean) };
}

module.exports = { CITIES, PLACEMENTS, CTAS, PERIODS, DEFAULTS, DEFAULTS_KEY, tokenInfo, cleanDefaults, loadDefaults, accountInfo, listAdsets, cleanSettings, publish, overview, recentCampaigns, act, adsManagerUrl, adSpend, adStats, adForms };
