// Shared helpers for the Facebook Lead Ads integration (api/fb-oauth-start.js,
// api/fb-oauth-callback.js, api/fb-connection-status.js, api/fb-disconnect.js,
// api/webhook-facebook-leads.js).
//
// data/fb-connection.json shape (written by fb-oauth-callback, read by the webhook and
// the status endpoint):
//   { pageId, pageName, pageAccessToken, pages: [{id,name,access_token}], connectedAt, connectedBy }
// An empty object ({}) means "not connected" - same "overwrite with {} to clear" pattern
// used elsewhere in this codebase for documents that don't have a natural empty list.
//
// This file contains a live secret (pageAccessToken) once connected, it's protected the
// same way employees.json's password hashes are: private Blob access, only ever read/written
// from requireAdmin-gated endpoints (or the signature-verified webhook), never sent to the
// browser.

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// The Meta app the portal logs in with and gets the leads from. Set in Integrări → Facebook
// (data/fb-app.json, private like the Page tokens, never sent to the browser except the App ID) or,
// as before, with FB_APP_ID / FB_APP_SECRET / FB_WEBHOOK_VERIFY_TOKEN in Vercel. The one saved in
// Integrări wins, and its secret is never mixed with Vercel's (they'd belong to different apps).
const APP_KEY = 'data/fb-app.json';
async function appCreds(readJSON) {
  const s = (await readJSON(APP_KEY, {})) || {};
  if (s.appId) return { appId: s.appId, appSecret: s.appSecret || '', verifyToken: s.verifyToken || '', configId: s.configId || '', fromPortal: true };
  return { appId: process.env.FB_APP_ID || '', appSecret: process.env.FB_APP_SECRET || '', verifyToken: process.env.FB_WEBHOOK_VERIFY_TOKEN || '', configId: process.env.FB_LOGIN_CONFIG_ID || '', fromPortal: false };
}
async function isConfigured(readJSON) {
  const c = await appCreds(readJSON);
  return Boolean(c.appId && c.appSecret);
}
// Webhook checks accept the app saved in Integrări and the one in Vercel, so switching apps
// never drops a lead in between.
async function webhookSecrets(readJSON) {
  const s = (await readJSON(APP_KEY, {})) || {};
  return {
    secrets: [s.appSecret, process.env.FB_APP_SECRET].filter(Boolean),
    tokens: [s.verifyToken, process.env.FB_WEBHOOK_VERIFY_TOKEN].filter(Boolean),
  };
}

async function loadConnection(readJSON) {
  const conn = await readJSON('data/fb-connection.json', {});
  return conn && conn.pageId && conn.pageAccessToken ? conn : {};
}

// Builds the absolute https origin this request was served on, same approach as
// api/mypos-checkout.js (`https://${req.headers.host}`), which is the only other place
// in this codebase that needs to build an absolute callback URL from the request.
function siteOrigin(req) {
  return `https://${req.headers.host}`;
}

// Facebook returns field_data as an array of { name, values: [v] } pairs. Form field
// names vary a lot between forms the owner builds in Meta's form editor, so this maps
// defensively across the common variants instead of assuming one exact set of names.
function extractLeadFields(fieldData) {
  const map = {};
  (fieldData || []).forEach((f) => {
    const key = String(f.name || '').toLowerCase().trim();
    const value = Array.isArray(f.values) ? f.values[0] : f.value;
    if (value !== undefined) map[key] = String(value).trim();
  });

  let name = map.full_name || map.name || '';
  if (!name) {
    const first = map.first_name || '';
    const last = map.last_name || '';
    name = `${first} ${last}`.trim();
  }

  const phone = map.phone_number || map.phone || map.telefon || '';
  const email = map.email || '';

  return { name, phone, email };
}

// The form's own questions (everything except name / phone / email) with what the person answered
// (zone, city, best time to call…): kept on the lead and shown on the contact.
const CONTACT_KEYS = ['full_name', 'name', 'first_name', 'last_name', 'phone_number', 'phone', 'telefon', 'email'];
function answerPairs(fieldData) {
  return (fieldData || [])
    .filter((f) => !CONTACT_KEYS.includes(String(f.name || '').toLowerCase().trim()))
    .map((f) => {
      const q = String(f.name || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
      const a = (Array.isArray(f.values) ? f.values : [f.value]).filter((x) => x != null && x !== '').join(', ').replace(/_/g, ' ').trim();
      return { q: q.charAt(0).toUpperCase() + q.slice(1), a };
    })
    .filter((x) => x.q && x.a);
}
const extraAnswers = (fieldData) => answerPairs(fieldData).map((x) => x.q.replace(/\?+$/, '') + ': ' + x.a);

// One lead with what the ad told us. Ad / campaign names need the ads permission; without it
// Meta refuses the whole request, so it is asked again with the basics only.
async function fetchLead(leadgenId, token) {
  const get = async (fields) => {
    const r = await fetch(`${GRAPH_BASE}/${encodeURIComponent(leadgenId)}?${new URLSearchParams({ fields, access_token: token })}`);
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  };
  let r = await get('field_data,form_id,ad_id,ad_name,adset_name,campaign_name,created_time,platform');
  if (!r.ok) r = await get('field_data,form_id,created_time,platform');
  return r.ok ? { lead: r.data } : { error: r.data && r.data.error ? r.data.error.message || 'graph_error' : 'graph_error' };
}
async function fetchFormName(formId, token) {
  if (!formId) return '';
  try {
    const r = await fetch(`${GRAPH_BASE}/${encodeURIComponent(formId)}?${new URLSearchParams({ fields: 'name', access_token: token })}`);
    const j = await r.json().catch(() => ({}));
    return r.ok ? String(j.name || '') : '';
  } catch (e) { return ''; }
}

// Which offer (procedure) and which city a lead is about, read from the form name, the ad /
// campaign names and the answers. An offer wins by how many of its words appear; a tie is broken
// by the city (Cavitație 1+1 is Arad's, Cavitație + EMS Timișoara's).
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\+/g, 'plus');
const STOP = new Set(['tratament', 'tratamentul', 'zone', 'zona', 'pret', 'oferta', 'sedinta', 'sedinte', 'pentru', 'full', 'body', 'lei', 'una', 'doua', 'the']);
const words = (s) => norm(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));
const CITY = { 'Timișoara': /timis|\btm\b/, 'Arad': /\barad/ };
const CITY_ID = { 'Timișoara': 'timisoara', 'Arad': 'arad' };
function detectCity(text) {
  const hay = norm(text);
  return Object.keys(CITY).find((c) => CITY[c].test(hay)) || '';
}
function detectOffer(offers, text, city) {
  const hay = ' ' + norm(text).replace(/[^a-z0-9]+/g, ' ') + ' ';
  let best = null, bestScore = 0;
  for (const o of offers) {
    const toks = [...new Set(words(o.title + ' ' + String(o.key || '').replace(/-/g, ' ') + ' ' + (o.adName || '')))];
    let score = toks.filter((t) => hay.includes(' ' + t)).length;
    if (!score) continue;
    if (city && Array.isArray(o.locations) && o.locations.includes(CITY_ID[city])) score += 0.5;
    if (score > bestScore) { best = o; bestScore = score; }
  }
  return best;
}

// ---------------------------------------------------------------- connecting a Page
// After Facebook's login (or a pasted token) the admin may manage several Pages (e.g. the salon's
// and the clinic's, in the same business portfolio): they're kept for a few minutes in
// data/fb-pending.json and the admin picks the clinic's Page in Integrări. With a single Page it
// connects straight away. Ad accounts are listed too when the permissions allow it (for publishing
// ads later); without them the list is just empty.
const PENDING_KEY = 'data/fb-pending.json';
const PENDING_TTL = 60 * 60 * 1000;

async function listAssets(userToken) {
  const get = async (pathname, fields) => {
    const r = await fetch(`${GRAPH_BASE}/${pathname}?${new URLSearchParams({ fields, limit: '100', access_token: userToken })}`);
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, data: (j && j.data) || [], error: j && j.error };
  };
  const pages = await get('me/accounts', 'id,name,access_token');
  if (!pages.ok) return { error: 'token_invalid', details: pages.error };
  const ads = await get('me/adaccounts', 'name,account_id,account_status,business{name}');
  return {
    pages: pages.data.filter((p) => p.access_token).map((p) => ({ id: p.id, name: p.name, access_token: p.access_token })),
    adAccounts: ads.ok ? ads.data.map((a) => ({ id: a.id, name: a.name || a.account_id, business: (a.business && a.business.name) || '', active: a.account_status === 1 })) : [],
  };
}

// Subscribes the Page to this app's leadgen webhook (without it Meta never sends the leads, even
// with Webhooks set up in the app) and stores the connection.
async function connectPage(store, { page, pages, adAccounts, adAccountId, by, via }) {
  const r = await fetch(`${GRAPH_BASE}/${page.id}/subscribed_apps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ subscribed_fields: 'leadgen', access_token: page.access_token }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) return { error: 'subscribe_failed', details: j && j.error };
  const ad = (adAccounts || []).find((a) => a.id === adAccountId) || null;
  await store.writeJSON('data/fb-connection.json', {
    pageId: page.id, pageName: page.name, pageAccessToken: page.access_token,
    pages: (pages || [page]).map((p) => ({ id: p.id, name: p.name, access_token: p.access_token })),
    adAccounts: adAccounts || [], adAccountId: ad ? ad.id : '', adAccountName: ad ? ad.name : '',
    connectedAt: new Date().toISOString(), connectedBy: by, connectedVia: via,
  });
  await store.writeJSON(PENDING_KEY, {});
  return { ok: true, pageName: page.name };
}

// One Page → connected now; several → waiting for the admin's pick.
async function afterLogin(store, assets, by, via) {
  if (!assets.pages.length) return { error: 'no_pages' };
  const onlyAd = assets.adAccounts.length === 1 ? assets.adAccounts[0].id : '';
  if (assets.pages.length === 1) return connectPage(store, { page: assets.pages[0], pages: assets.pages, adAccounts: assets.adAccounts, adAccountId: onlyAd, by, via });
  await store.writeJSON(PENDING_KEY, { pages: assets.pages, adAccounts: assets.adAccounts, by, via, at: Date.now() });
  return { ok: true, choose: true };
}
async function loadPending(store) {
  const p = await store.readJSON(PENDING_KEY, {});
  return p && Array.isArray(p.pages) && Date.now() - (p.at || 0) < PENDING_TTL ? p : null;
}

module.exports = { GRAPH_VERSION, GRAPH_BASE, APP_KEY, appCreds, isConfigured, webhookSecrets, loadConnection, siteOrigin, extractLeadFields, extraAnswers, answerPairs, fetchLead, fetchFormName, detectOffer, detectCity, CITY_ID,
  listAssets, connectPage, afterLogin, loadPending, PENDING_KEY };
