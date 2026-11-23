// myPOS Payment Requests through the Partners app („Centrul360 checkout”, partners.mypos.com, API Gateway): the site's online
// payment until the online store (Embedded Checkout, mypos-ipc.js) is approved. One payment request per order, with the
// exact sum set by the server and the order id in its booking text; the payment page is myPOS's own (opened in a new tab:
// myPOS's page doesn't work inside a frame); paid is read from myPOS by the request's code (status „Paid”), never by a sum.
//
// The keys (developers.mypos.com → Identity API): the integration's Partner ID (mps-p-…), Application / Integration ID
// (mps-app-…), Client ID (client_…) and Client Secret (secret_…), and the clinic's approval of it: Merchant Client ID (cli_…)
// and Merchant Secret (sec_…). A Bearer token (1 h) from the first pair, a session (1 h) from the second. Three refused
// sessions in a row lock the merchant at myPOS: after a refusal nothing is tried again until the keys are saved anew.
//   data/mypos-requests.json  { partnerId, appId, clientId, clientSecret, merchantId, merchantSecret, demo, live, savedAt, by,
//                               checkedAt, error, testPassedAt }
const KEY = 'data/mypos-requests.json';
const BASE = { live: 'https://api-gateway.mypos.com', demo: 'https://demo-api-gateway.mypos.com' };
const FIELDS = { partnerId: /^mps-p-[\w-]{2,120}$/, appId: /^mps-app-[\w-]{2,120}$/, clientId: /^client_[\w-]{6,200}$/, clientSecret: /^\S{6,400}$/, merchantId: /^cli_[\w-]{6,200}$/, merchantSecret: /^\S{6,400}$/ };
const SECRET = { clientSecret: 'clientId', merchantSecret: 'merchantId' };
const clean = (v) => String(v == null ? '' : v).replace(/[\s​-‍⁠﻿]/g, '');
const ready = (c) => !!c && Object.keys(FIELDS).every((k) => c[k]);
const base = (c) => (c && c.demo ? BASE.demo : BASE.live);
const msgOf = (j) => String((j && (j.message || j.error_description || j.error || j.title || (j.errors && JSON.stringify(j.errors)))) || '').slice(0, 200);
class ReqError extends Error { constructor(code, status, message) { super(message || code); this.code = code; this.status = status || 0; } }

async function load(store) { return (await store.readJSON(KEY, null)) || {}; }
// the keys in use: only the checkout integration's own. The „Sold în timp real” keys can't make payments (23.11, a read-only
// probe: their integration has account / terminal / transaction scopes; the eCommerce calls answer 401)
async function active(store) {
  const own = await load(store);
  return ready(own) ? Object.assign({ source: 'checkout' }, own) : null;
}

const cache = new Map(); // 't|…' token, 's|…' session → { v, until } (per warm instance)
async function token(c) {
  const k = 't|' + base(c) + c.clientId, x = cache.get(k);
  if (x && x.until > Date.now() + 30e3) return x.v;
  let r;
  try {
    r = await fetch(base(c) + '/api/v1/oauth/token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: 'client_credentials' }) });
  } catch (e) { throw new ReqError('mypos_down', 0, e.message); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new ReqError(r.status >= 400 && r.status < 500 && r.status !== 429 ? 'req_partner' : 'mypos_down', r.status, msgOf(j));
  cache.set(k, { v: j.access_token, until: Date.now() + (Number(j.expires_in) || 3600) * 1000 });
  return j.access_token;
}
async function session(c, tok) {
  const k = 's|' + base(c) + c.merchantId, x = cache.get(k);
  if (x && x.until > Date.now() + 30e3) return x.v;
  let r;
  try {
    r = await fetch(base(c) + '/api/v1/auth/session', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
      body: JSON.stringify({ client_id: c.merchantId, client_secret: c.merchantSecret }) });
  } catch (e) { throw new ReqError('mypos_down', 0, e.message); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.session) throw new ReqError(r.status >= 400 && r.status < 500 && r.status !== 429 ? 'req_merchant' : 'mypos_down', r.status, msgOf(j));
  cache.set(k, { v: j.session, until: Date.now() + Math.min(Number(j.expires_in) || 300, 3600) * 1000 });
  return j.session;
}
async function call(c, method, path, body) {
  const tok = await token(c);
  const ses = await session(c, tok);
  let r;
  try {
    r = await fetch(base(c) + path, { method, headers: Object.assign({ Accept: 'application/json', Authorization: 'Bearer ' + tok, 'X-Session': ses, 'X-Partner-Id': c.partnerId, 'X-Application-Id': c.appId },
      body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
  } catch (e) { throw new ReqError('mypos_down', 0, e.message); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) { cache.delete('s|' + base(c) + c.merchantId); cache.delete('t|' + base(c) + c.clientId); }
    throw new ReqError(r.status === 401 || r.status === 403 ? 'req_denied' : r.status === 429 ? 'mypos_busy' : 'mypos_failed', r.status, path.split('?')[0] + ': ' + msgOf(j));
  }
  return j;
}

// a payment request for one order: its sum, in lei, the order id in the booking text; paid within 2 days at most
const day = (ms) => new Date(ms).toISOString().slice(0, 10);
async function create(c, { orderId, amount, title, clientName }) {
  const j = await call(c, 'POST', '/ecommerce/v1/payment-requests', {
    amount: Math.round(Number(amount) * 100) / 100, currency: 'RON', client_name: String(clientName || 'Clientă Centrul360').slice(0, 60),
    reason: String(title || 'Centrul360').slice(0, 100), booking_text: orderId, dba: 'Centrul360', expiry_date: day(Date.now() + 2 * 86400e3),
    payment_request_lang: 'ro', qr_generated: false,
  });
  if (!j.code || !j.payment_request_url) throw new ReqError('mypos_failed', 0, 'fără cod sau link');
  return { code: String(j.code), url: String(j.payment_request_url) };
}
// what myPOS says of a payment request: { status: 'Paid' | 'Pending' | 'Seen' | 'Failed' | 'Expired' | 'Cancelled', amount,
// currency, bookingText }
async function status(c, code) {
  const j = await call(c, 'GET', '/ecommerce/v1/payment-requests/' + encodeURIComponent(code));
  return { status: String(j.status || ''), amount: Number(j.amount) || 0, currency: String(j.currency || ''), bookingText: String(j.booking_text || ''), code: String(j.code || code) };
}

const last4 = (v) => '···' + String(v || '').slice(-4);
function adminOf(c) {
  if (!c || !ready(c)) return { saved: false };
  return { saved: true, source: c.source || 'checkout', partnerId: c.partnerId, appId: c.appId, clientId: last4(c.clientId), merchantId: last4(c.merchantId), demo: !!c.demo, live: !!c.live && !c.demo,
    savedAt: c.savedAt || '', checkedAt: c.checkedAt || '', error: c.error || '', testPassedAt: c.testPassedAt || '' };
}

// Integrări → myPOS → „Aplicația de parteneri”: the six keys checked once (token, session, a harmless read), kept only when
// all worked. Empty secrets with the same IDs: the saved ones.
async function save(store, input, by) {
  const prev = await load(store);
  const i = input || {};
  const c = { demo: i.mode ? i.mode === 'demo' : !!i.demo };
  for (const k of Object.keys(FIELDS)) {
    let v = clean(i[k]);
    if (!v && SECRET[k] && prev[k] && prev[SECRET[k]] === c[SECRET[k]]) v = prev[k];
    if (!v && !SECRET[k] && prev[k]) v = prev[k];
    if (!FIELDS[k].test(v)) return { error: 'req_format', field: k };
    c[k] = v;
  }
  if (c.merchantSecret === c.clientSecret) return { error: 'req_format', field: 'merchantSecret', same: true };
  ['t|', 's|'].forEach((p) => cache.forEach((v, k) => { if (k.startsWith(p)) cache.delete(k); }));
  try { await call(c, 'GET', '/ecommerce/v1/common/settlement-data'); } catch (e) {
    console.error('mypos requests save:', e.code, e.status, e.message);
    return { error: e.code || 'mypos_failed', status: e.status || 0, message: e.message || '' };
  }
  const now = new Date().toISOString();
  const same = prev.merchantId === c.merchantId && !prev.demo === !c.demo;
  Object.assign(c, { live: same ? !!prev.live : false, testPassedAt: same ? prev.testPassedAt || '' : '', savedAt: now, checkedAt: now, by: by || '', error: '' });
  await store.writeJSON(KEY, c);
  return { ok: true, requests: adminOf(c) };
}
// „Testează conexiunea”: token, session and a harmless read (the settlement data); a refusal of the keys stops it on the site
async function check(store) {
  const c = await active(store);
  if (!c || !ready(c)) return { error: 'not_saved' };
  if (c.error === 'req_merchant') return { error: 'req_merchant', message: 'Cheile clinicii au fost refuzate: salvează-le din nou (myPOS blochează după 3 încercări).' };
  let err = null;
  try { await call(c, 'GET', '/ecommerce/v1/common/settlement-data'); } catch (e) { err = e; }
  const hard = err && (err.code === 'req_partner' || err.code === 'req_merchant' || err.code === 'req_denied');
  await note(store, Object.assign({ checkedAt: new Date().toISOString() }, hard ? { error: err.code } : err ? {} : { error: '' }));
  return err ? { error: err.code, status: err.status, message: err.message } : { ok: true };
}
async function setLive(store, on) {
  const c = await active(store);
  if (!c || !ready(c)) return { error: 'not_saved' };
  if (on && c.demo) return { error: 'sandbox' };
  if (on && !c.testPassedAt) return { error: 'test_first' };
  await note(store, { live: !!on });
  return { ok: true };
}
async function drop(store) { await store.writeJSON(KEY, {}); }
async function note(store, patch) { const c = await load(store); Object.assign(c, patch); await store.writeJSON(KEY, c, { quiet: true }); }

module.exports = { active, KEY, FIELDS, ready, load, create, status, adminOf, save, check, setLive, drop, note, ReqError };
