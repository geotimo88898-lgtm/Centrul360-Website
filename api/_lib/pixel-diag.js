// Read only, once (7.11, the owner via his control session): who owns the shared ad account and its pixel, which pixels
// the token can see, and whether the owner's Business 433095392701442 can get a web pixel. Nothing is created or changed.
// Run by the automations' clock (api/automation-tick.js); the answers (ids and names only, never the token) are kept in
// data/pixel-diag.json and shown by GET /api/portal-capi?public=1.

const { readJSON, writeJSON } = require('./store');
const { loadConnection } = require('./facebook');

const KEY = 'data/pixel-diag.json';
const BUSINESS = '433095392701442';
const SITE_PIXEL = '2276074362800484';
const GRAPH = 'https://graph.facebook.com/v25.0';

async function get(path, token, fields) {
  try {
    const p = new URLSearchParams(Object.assign(fields ? { fields } : {}, { limit: '50', access_token: token }));
    const r = await fetch(GRAPH + path + '?' + p.toString());
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = j.error || {}; return { error: String((e.message || 'HTTP ' + r.status) + (e.code ? ' (cod ' + e.code + ')' : '')).slice(0, 200) }; }
    return j;
  } catch (e) { return { error: String(e.message || e).slice(0, 200) }; }
}

async function run() {
  const st = await readJSON(KEY, {});
  if (st.done) return { skipped: true };
  const conn = await loadConnection(readJSON).catch(() => null);
  const token = conn && conn.userToken, act = conn && conn.adAccountId;
  if (!token || !act) { await writeJSON(KEY, { done: true, at: new Date().toISOString(), error: 'Lipsește tokenul sau contul de reclame.' }); return { error: true }; }
  const px = 'id,name,owner_business{id,name},creation_time,last_fired_time,is_unavailable';
  const out = {
    tokenUser: await get('/me', token, 'id'),
    myBusinesses: await get('/me/businesses', token, 'id,name'),
    adAccount: await get('/' + act, token, 'id,account_id,name,business{id,name},owner'),
    adAccountPixels: await get('/' + act + '/adspixels', token, px),
    sitePixel: await get('/' + SITE_PIXEL, token, px),
    sitePixelSharedAccounts: await get('/' + SITE_PIXEL + '/shared_accounts', token, 'id,name,account_id'),
    business: await get('/' + BUSINESS, token, 'id,name,verification_status'),
    businessOwnedPixels: await get('/' + BUSINESS + '/owned_pixels', token, 'id,name'),
    businessClientPixels: await get('/' + BUSINESS + '/client_pixels', token, 'id,name'),
    businessAdAccounts: await get('/' + BUSINESS + '/owned_ad_accounts', token, 'id,name'),
    businessClientAdAccounts: await get('/' + BUSINESS + '/client_ad_accounts', token, 'id,name'),
  };
  await writeJSON(KEY, { done: true, at: new Date().toISOString(), out });
  return { done: true };
}

const status = async () => readJSON(KEY, {});

module.exports = { run, status, KEY };
