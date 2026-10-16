// myPOS (the card terminals in the clinics): the card payments made on the POS, to set them next to the
// payments recorded in the portal (Încasări). The owner generates the REST API credentials in her myPOS
// account (Integrări → REST API) and pastes them in Admin → Integrări → myPOS; they never leave the server.
//
// Two ways in, both from myPOS's REST API (developers.mypos.com, "More APIs"):
//   - live: a webhook myPOS calls on every POS payment (pos.payment.completed / .cancelled), signed with
//     a secret the portal makes when it connects (api/mypos-webhook.js)
//   - the history: the Transactions API (completed transactions, with the terminal's TID), read when
//     connecting (the last 60 days), when Încasări is opened (every 10 minutes at most) and each morning
//
//   data/mypos-connection.json  { clientId, clientSecret, webhook: { id, secret, url, events }, devices:
//                                 [{ tid, serial, model, city }], connectedAt, by, health: { … } }
//   data/mypos-payments.json    { list: [payment], syncedAt, coverFrom }
//   payment = { id, ref, tid, amount (lei, minus for a refund), currency, at (ISO), day (Bucharest date),
//               type, pan, src: 'api' | 'webhook' | 'both', cancelled }

const crypto = require('crypto');

const CONN = 'data/mypos-connection.json';
const PAY = 'data/mypos-payments.json';
const AUTH = 'https://auth-api.mypos.com/oauth/token';
const TRX = 'https://transactions-api.mypos.com/v1.1';
const DEV = 'https://devices-api.mypos.com/v1.1';
const HOOK = 'https://webhook-api.mypos.com/v1';
const EVENTS = ['pos.payment.completed', 'pos.payment.cancelled'];
// the transaction types that are money taken on a POS (and given back): Payment, NFC Payment, Payment on
// POS; Refund. A Fee, a transfer or a purchase made WITH the clinic's own myPOS card is not a client paying.
const PAY_TYPES = ['013', '022', '501'];
const REFUND_TYPES = ['011'];
const KEEP_DAYS = 400;

const dayOf = (ts) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(ts));
const num = (v) => Math.round(Number(String(v == null ? '' : v).replace(',', '.')) * 100) / 100;
const uuid = () => crypto.randomUUID();

class MyposError extends Error {
  constructor(code, status, message) { super(message || code); this.code = code; this.status = status || 0; }
}

// ------------------------------------------------------------------ the calls
const tokens = new Map(); // scope → { token, until } (per warm function instance)
async function token(conn, scope) {
  const key = conn.clientId + '|' + (scope || '');
  const t = tokens.get(key);
  if (t && t.until > Date.now() + 30e3) return t.token;
  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  if (scope) body.set('scope', scope);
  const r = await fetch(AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(conn.clientId + ':' + conn.clientSecret).toString('base64') },
    body,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new MyposError(r.status === 400 || r.status === 401 ? 'mypos_auth' : 'mypos_down', r.status, j.error_description || j.error || '');
  tokens.set(key, { token: j.access_token, until: Date.now() + (Number(j.expires_in) || 3000) * 1000 });
  return j.access_token;
}
async function call(conn, method, url, opts) {
  opts = opts || {};
  const tok = await token(conn, opts.scope);
  const headers = { Authorization: 'Bearer ' + tok, Accept: 'application/json' };
  if (!opts.scope) Object.assign(headers, { 'API-Key': conn.clientId, 'X-Request-ID': uuid(), 'Content-Type': 'application/json' });
  let body;
  if (opts.form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(opts.form); }
  const r = await fetch(url, { method, headers, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.message || j.error_description || j.error || (j.errors && JSON.stringify(j.errors)) || '';
    throw new MyposError(r.status === 401 || r.status === 403 ? 'mypos_denied' : r.status === 429 ? 'mypos_busy' : 'mypos_failed', r.status, String(msg).slice(0, 200));
  }
  return j;
}

// the clinic's terminals (TID, serial, model)
async function listDevices(conn) {
  const out = [];
  for (let page = 1; page <= 5; page++) {
    const j = await call(conn, 'GET', DEV + '/devices?' + new URLSearchParams({ page: String(page), size: '100' }));
    (j.devices || []).forEach((d) => out.push({ tid: String(d.terminal_id || ''), serial: String(d.serial_number || ''), model: String(d.model || '') }));
    const p = j.pagination || {};
    if (!p.total || page * 100 >= p.total) break;
  }
  return out.filter((d) => d.tid);
}

// completed transactions between two moments, in 7-day windows (the API's own default span), oldest first
async function listTransactions(conn, fromMs, toMs) {
  const out = [];
  for (let a = fromMs; a < toMs; a += 7 * 86400e3) {
    const b = Math.min(toMs, a + 7 * 86400e3);
    for (let page = 1; page <= 30; page++) {
      const q = new URLSearchParams({ page: String(page), size: '100', order: '0', from_date: new Date(a).toISOString().replace(/\.\d+Z$/, 'Z'), to_date: new Date(b).toISOString().replace(/\.\d+Z$/, 'Z') });
      const j = await call(conn, 'GET', TRX + '/transactions?' + q);
      const list = j.transactions || [];
      list.forEach((t) => out.push(t));
      const p = j.pagination || {};
      if (!list.length || !p.total || page * 100 >= p.total) break;
    }
  }
  return out;
}

// a transaction from the API → a payment (null when it isn't a client paying on a POS)
function fromApi(t, tids) {
  const type = String(t.transaction_type || '').padStart(3, '0');
  const tid = String(t.terminal_id || '');
  if (!tid) return null;
  if (tids && tids.size && !tids.has(tid)) return null; // only the clinic's own terminals
  const refund = REFUND_TYPES.includes(type);
  if (!refund && !PAY_TYPES.includes(type)) return null;
  const at = Date.parse(t.date);
  if (!Number.isFinite(at)) return null;
  // the sum the client paid, in lei: the original one (the account itself may be in another currency)
  const inLei = t.transaction_currency === 'RON' && t.original_currency !== 'RON';
  const amt = Math.abs(num(inLei ? t.transaction_amount : t.original_amount != null && t.original_amount !== '' ? t.original_amount : t.transaction_amount));
  return {
    id: String(t.payment_reference || t.id), ref: String(t.payment_reference || ''), tid, amount: refund ? -amt : amt,
    currency: String((inLei ? t.transaction_currency : t.original_currency) || t.transaction_currency || 'RON'), at: new Date(at).toISOString(), day: dayOf(at),
    type, pan: t.pan ? String(t.pan).slice(-4) : '', src: 'api', cancelled: false,
  };
}
// a webhook notification → a payment
function fromHook(event, p) {
  const ts = Number(p.timestamp) > 1e12 ? Number(p.timestamp) : Number(p.timestamp) * 1000;
  const at = Number.isFinite(ts) && ts > 0 ? ts : Date.now();
  const tid = String(p.tid || '');
  const amount = Math.abs(num(p.amount));
  return {
    id: 'wh-' + tid + '-' + Math.round(at / 1000) + '-' + Math.round(amount * 100), ref: '', tid, amount,
    currency: String(p.currency || 'RON'), at: new Date(at).toISOString(), day: dayOf(at), type: 'hook',
    pan: p.pan ? String(p.pan).replace(/\D/g, '').slice(-4) : '', src: 'webhook', cancelled: event === 'pos.payment.cancelled',
  };
}

// one list, no doubles: the same payment can arrive live (no reference) and later from the history
// (with its reference): same terminal, same sum, within 15 minutes → one payment
function merge(list, incoming) {
  const byId = new Map(list.map((x) => [x.id, x]));
  let added = 0;
  for (const p of incoming) {
    if (byId.has(p.id)) {
      const cur = byId.get(p.id);
      if (p.cancelled && !cur.cancelled) { cur.cancelled = true; added++; }
      continue;
    }
    const twin = list.find((x) => x.tid === p.tid && Math.abs(x.amount - p.amount) < 0.01 && x.src !== p.src && x.src !== 'both' &&
      Math.abs(Date.parse(x.at) - Date.parse(p.at)) <= 15 * 60e3);
    if (twin) {
      if (p.src === 'api') { byId.delete(twin.id); Object.assign(twin, { id: p.id, ref: p.ref, type: p.type, at: p.at, day: p.day, pan: p.pan || twin.pan }); byId.set(twin.id, twin); }
      if (p.cancelled) twin.cancelled = true;
      twin.src = 'both';
      added++;
      continue;
    }
    if (p.cancelled && p.src === 'webhook') {
      // a void for a payment we have: same terminal and sum, the latest one before it
      const paid = list.filter((x) => x.tid === p.tid && Math.abs(x.amount - p.amount) < 0.01 && !x.cancelled && Date.parse(x.at) <= Date.parse(p.at) + 60e3)
        .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
      if (paid) { paid.cancelled = true; added++; continue; }
    }
    list.push(p); byId.set(p.id, p); added++;
  }
  const keepFrom = Date.now() - KEEP_DAYS * 86400e3;
  return { list: list.filter((x) => Date.parse(x.at) >= keepFrom).sort((a, b) => (a.at < b.at ? -1 : 1)), added };
}

// ------------------------------------------------------------------ the store
async function loadConn(readJSON) { return readJSON(CONN, {}); }
const connected = (c) => !!(c && c.clientId && c.clientSecret);

// read the history from `fromMs` (or since the last read, two days back to catch late bookings) up to now
async function sync(store, opts) {
  opts = opts || {};
  const conn = await loadConn(store.readJSON);
  if (!connected(conn)) return { ok: false, error: 'not_connected' };
  const data = await store.readJSON(PAY, { list: [] });
  const now = Date.now();
  let from = opts.fromMs || (data.syncedAt ? Date.parse(data.syncedAt) - 2 * 86400e3 : now - 60 * 86400e3);
  from = Math.max(from, now - 92 * 86400e3);
  const tids = new Set((conn.devices || []).map((d) => d.tid));
  const health = Object.assign({}, conn.health);
  try {
    const raw = await listTransactions(conn, from, now);
    const got = raw.map((t) => fromApi(t, tids)).filter(Boolean);
    const m = merge(data.list || [], got);
    const coverFrom = data.coverFrom && Date.parse(data.coverFrom) < from ? data.coverFrom : new Date(from).toISOString();
    await store.writeJSON(PAY, { list: m.list, syncedAt: new Date(now).toISOString(), coverFrom }, { quiet: !m.added });
    health.history = { ok: true, at: new Date(now).toISOString(), read: raw.length, kept: got.length };
    await saveHealth(store, health);
    return { ok: true, read: raw.length, added: m.added };
  } catch (e) {
    health.history = { ok: false, at: new Date(now).toISOString(), error: e.code || 'mypos_failed', status: e.status || 0, message: e.message || '' };
    await saveHealth(store, health);
    return { ok: false, error: e.code || 'mypos_failed', status: e.status || 0 };
  }
}
async function saveHealth(store, health) {
  const conn = await loadConn(store.readJSON);
  if (!connected(conn)) return;
  conn.health = health;
  await store.writeJSON(CONN, conn, { quiet: true });
}

// the webhook myPOS calls: made (or found) and subscribed to the POS payments; returns { id, secret, url, events }
async function ensureWebhook(conn, url) {
  const list = await call(conn, 'GET', HOOK + '/webhooks', { scope: 'webhooks' });
  let hook = (list.webhooks || []).find((w) => w.payload_url === url);
  if (!hook) {
    const secret = crypto.randomBytes(16).toString('hex'); // myPOS allows up to 32 characters
    const j = await call(conn, 'POST', HOOK + '/webhooks', { scope: 'webhooks', form: { payload_url: url, secret } });
    hook = j.webhook || {};
    if (!hook.secret) hook.secret = secret;
  } else if (hook.is_active === false) {
    await call(conn, 'PUT', HOOK + '/webhooks/' + encodeURIComponent(hook.id), { scope: 'webhooks', form: { is_active: 'true' } }).catch(() => null);
  }
  const ev = await call(conn, 'GET', HOOK + '/events', { scope: 'webhooks' });
  const subs = await call(conn, 'GET', HOOK + '/subscriptions', { scope: 'webhooks' });
  const have = new Set((subs.subscriptions || []).filter((s) => s.hook && s.hook.id === hook.id).map((s) => s.event));
  const events = [];
  for (const name of EVENTS) {
    const e = (ev.events || []).find((x) => x.name === name);
    if (!e) continue;
    if (!have.has(name)) await call(conn, 'POST', HOOK + '/subscriptions', { scope: 'webhooks', form: { webhook_id: hook.id, event_id: e.id } });
    events.push(name);
  }
  return { id: hook.id, secret: hook.secret, url, events };
}
async function dropWebhook(conn) {
  if (!conn.webhook || !conn.webhook.id) return;
  await call(conn, 'DELETE', HOOK + '/webhooks/' + encodeURIComponent(conn.webhook.id), { scope: 'webhooks' }).catch(() => null);
}

// X-myPOS-Signature: "t=<unix seconds>,v1=<hex HMAC-SHA256 of the JSON body>" (the body without spaces between
// keys and values, as myPOS signs it); within 5 minutes
function validSignature(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = {};
  String(header).split(',').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); });
  const sig = parts.v1 || String(header).split(',')[1] || '';
  const t = Number(parts.t);
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
  if (Number.isFinite(t) && t > 0 && Math.abs(Date.now() / 1000 - t) > 3 * 86400) return false; // retries come for up to 3 days
  const text = raw.toString('utf8');
  const tries = [text, text.replace(/": /g, '":').replace(/, "/g, ',"')];
  try { tries.push(JSON.stringify(JSON.parse(text))); } catch (e) { /* not JSON */ }
  const want = Buffer.from(sig.toLowerCase(), 'hex');
  return tries.some((s) => {
    const got = Buffer.from(crypto.createHmac('sha256', secret).update(s).digest('hex'), 'hex');
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  });
}

// ------------------------------------------------------------------ the account's balance
// Now: myPOS's API Gateway (below), when its keys are saved, kept 1 minute. Without them: the daily MT940
// statement of the REST keys (Transactions API): :62F: the booked closing balance, :64: the available one
// ("C251016RON12345,67", D for a minus), read for today (or yesterday, when today's isn't out yet), kept 10 minutes.
const BAL = 'data/mypos-balance.json';

// The balance as it is right now comes only from myPOS's API Gateway (developers.mypos.com → Banking API →
// Get Account Details: "balance", the current available balance). Its keys come from the myPOS Partner Portal
// (partners.mypos.com): an "Account management" integration (Partner ID mps-p-…, Application ID mps-app-…,
// Partner Client ID client_…, Partner Secret secret_…) that the clinic's myPOS account approved (Merchant Client
// ID cli_…, Merchant Secret sec_…). A bearer token (1 h) from the partner keys, then a session (5 min) from the
// merchant keys. Three failed sessions in a row lock the merchant at myPOS: after one refusal nothing is tried
// again until the keys are saved anew.
//   data/mypos-gateway.json  { partnerId, appId, clientId, clientSecret, merchantId, merchantSecret, savedAt, by,
//                              error ('gw_partner' | 'gw_merchant'), errorAt, status, message }
const GW = 'https://api-gateway.mypos.com';
const GW_KEY = 'data/mypos-gateway.json';
// The IDs have their fixed beginnings; the secrets go as pasted (the owner's choice: no check on how they
// start). Keys never hold spaces, so whatever a copy-paste brings along (spaces, invisible characters) is dropped.
const GW_FIELDS = { partnerId: /^mps-p-[\w-]{2,120}$/, appId: /^mps-app-[\w-]{2,120}$/, clientId: /^client_[\w-]{6,200}$/, clientSecret: /^\S{6,400}$/, merchantId: /^cli_[\w-]{6,200}$/, merchantSecret: /^\S{6,400}$/ };
const cleanKey = (v) => String(v == null ? '' : v).replace(/[\s​-‍⁠﻿]/g, '');
const gwReady = (g) => !!g && Object.keys(GW_FIELDS).every((k) => g[k]);
const gwMsg = (j) => String(j.message || j.error_description || j.error || j.title || (j.errors && JSON.stringify(j.errors)) || '').slice(0, 200);
const gwCache = new Map(); // 't|…' token, 's|…' session → { v, until } (per warm function instance)
// The balance lives behind the Banking scopes: the token asks for them by name (accounting + banking, read only);
// a partner whose integration isn't given them gets a token without (the scopes it does have are kept, to show
// them when myPOS refuses a call).
const GW_SCOPE = 'accounting.read banking.read';
async function gwToken(g) {
  const k = 't|' + g.clientId, c = gwCache.get(k);
  if (c && c.until > Date.now() + 30e3) return c.v;
  const ask = (scope) => fetch(GW + '/api/v1/oauth/token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.assign({ client_id: g.clientId, client_secret: g.clientSecret, grant_type: 'client_credentials' }, scope ? { scope } : {})),
  });
  let r = await ask(GW_SCOPE);
  let j = await r.json().catch(() => ({}));
  if (!r.ok && r.status === 400) { r = await ask(''); j = await r.json().catch(() => ({})); } // scopes it may not ask for: the default ones
  if (!r.ok || !j.access_token) throw new MyposError(r.status >= 400 && r.status < 500 && r.status !== 429 ? 'gw_partner' : 'mypos_down', r.status, gwMsg(j));
  gwCache.set(k, { v: j.access_token, until: Date.now() + (Number(j.expires_in) || 3600) * 1000, scope: String(j.scope || '') });
  return j.access_token;
}
async function gwSession(g, tok) {
  const k = 's|' + g.merchantId, c = gwCache.get(k);
  if (c && c.until > Date.now() + 20e3) return c.v;
  const r = await fetch(GW + '/api/v1/auth/session', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
    body: JSON.stringify({ client_id: g.merchantId, client_secret: g.merchantSecret }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.session) throw new MyposError(r.status >= 400 && r.status < 500 && r.status !== 429 ? 'gw_merchant' : 'mypos_down', r.status, gwMsg(j));
  gwCache.set(k, { v: j.session, until: Date.now() + (Number(j.expires_in) || 300) * 1000 });
  return j.session;
}
async function gwGet(g, path) {
  const tok = await gwToken(g);
  const ses = await gwSession(g, tok);
  const r = await fetch(GW + path, { headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok, 'X-Session': ses, 'X-Partner-Id': g.partnerId, 'X-Application-Id': g.appId } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) { gwCache.delete('s|' + g.merchantId); gwCache.delete('t|' + g.clientId); } // ran out: the next read starts anew
    const said = gwMsg(j) || (r.headers.get('www-authenticate') || '').slice(0, 160);
    const scope = r.status === 403 ? ((gwCache.get('t|' + g.clientId) || {}).scope || '-') : '';
    throw new MyposError(r.status === 401 || r.status === 403 ? 'gw_denied' : r.status === 429 ? 'mypos_busy' : 'mypos_failed', r.status, path.split('?')[0] + (said ? ': ' + said : '') + (scope ? ' · scope: ' + scope : ''));
  }
  return j;
}
// every account (not the suspense ones) with its balance now. The list may carry the balance itself; otherwise
// each account's details are read, by number, then by IBAN. myPOS may refuse the details of one account (a
// reserve, say: 403): that one is left out and the others are read. Only when no account gives a balance is it
// an error (with myPOS's words, to know which call it refused).
const num2 = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : null);
async function gwBalances(g, store) {
  const list = await gwGet(g, '/accounting/v1/accounts?' + new URLSearchParams({ page: '1', size: '50' }));
  const items = (list.items || []).filter((a) => a && a.account_number && !a.is_suspense_account).slice(0, 8);
  const out = [];
  let refused = null;
  for (const a of items) {
    let bal = num2(a.balance != null ? a.balance : a.available_balance != null ? a.available_balance : a.current_balance);
    let d = {};
    if (bal == null) {
      for (const key of [a.account_number, a.iban].filter((x, i, l) => x && l.indexOf(x) === i)) {
        try { d = await gwGet(g, '/accounting/v1/accounts/' + encodeURIComponent(key)); bal = num2(d.balance); break; }
        catch (e) { if (e.code !== 'gw_denied' && e.status !== 404) throw e; refused = e; }
      }
    }
    out.push({ number: String(a.account_number).slice(-4), name: String(a.name || d.account_name || ''), currency: String(d.currency || a.currency || ''), reserve: !!a.is_reserve, available: bal, closing: null, date: '', live: true });
  }
  if (!out.some((x) => x.available != null)) {
    // the details closed to this integration (403): the balance worked out from what is open to it
    const comp = refused && refused.status === 403 && store ? await gwComputed(g, store, items) : null;
    if (comp) return comp;
    throw refused || new MyposError('gw_denied', 0, items.length ? 'niciun cont nu are sold' : 'niciun cont în listă');
  }
  return out;
}

// When myPOS doesn't open the account details to the integration (it gives account.read / transaction.read but
// not the balance), the balance now is worked out from what it does give: the booked closing balance of the
// latest daily statement (REST keys, MT940 :62F:, kept per day in data/mypos-balance-base.json) plus every
// movement of the account since that day ended, in and out (API Gateway transactions: sign Credit / Debit, in the
// account's currency; fees and refunds included). As soon as myPOS opens the details, the exact balance is used.
const BASE = 'data/mypos-balance-base.json';
// midnight in Bucharest (the statements' day) as a UTC moment
function midnightUtc(day) {
  const at = Date.parse(day + 'T00:00:00Z');
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hourCycle: 'h23' }).format(new Date(at)));
  return new Date(at - h * 3600e3).toISOString().replace(/\.\d+Z$/, 'Z');
}
const nextDay = (day) => new Date(Date.parse(day + 'T12:00:00Z') + 86400e3).toISOString().slice(0, 10);
async function gwComputed(g, store, items) {
  const conn = await loadConn(store.readJSON);
  if (!connected(conn)) return null;
  const bases = (await store.readJSON(BASE, {})) || {};
  let changed = false;
  const out = [];
  for (const a of items.filter((x) => !x.is_reserve).slice(0, 4)) {
    const num = String(a.account_number);
    let base = bases[num];
    // the latest statement with a closing balance, from yesterday back (kept once found for that day)
    if (!base || base.day !== dayOf(Date.now() - 86400e3)) {
      for (let back = 1; back <= 6; back++) {
        const day = dayOf(Date.now() - back * 86400e3);
        if (base && base.day === day) break;
        let s = null;
        try { s = await statement(conn, num, day); } catch (e) { s = null; }
        if (s && s.closing) { base = { day, closing: s.closing.amount, currency: s.closing.currency, at: new Date().toISOString() }; bases[num] = base; changed = true; break; }
      }
    }
    if (!base) continue;
    let sum = 0, moves = 0;
    for (let page = 1; page <= 30; page++) {
      const j = await gwGet(g, '/accounting/v1/transactions?' + new URLSearchParams({ account_number: num, from_date: midnightUtc(nextDay(base.day)), order: 'Ascending', page: String(page), size: '100' }));
      (j.items || []).forEach((t) => {
        if (t.account_number && String(t.account_number) !== num) return;
        if (t.transaction_currency && base.currency && t.transaction_currency !== base.currency) return;
        const v = Math.abs(Number(t.transaction_amount) || 0);
        sum += String(t.sign || '').toLowerCase() === 'debit' ? -v : v;
        moves++;
      });
      if (!j.has_next_page) break;
    }
    out.push({ number: num.slice(-4), name: String(a.name || ''), currency: base.currency || String(a.currency || ''), reserve: false,
      available: Math.round((base.closing + sum) * 100) / 100, closing: null, date: '', live: true, computed: { from: base.day, moves } });
  }
  if (changed) await store.writeJSON(BASE, bases, { quiet: true });
  return out.length ? out : null;
}
// the keys as the portal may show them (never a secret)
function gwPublic(g) {
  if (!gwReady(g)) return { on: false };
  const mask = (v) => (v.length > 12 ? v.slice(0, 8) + '…' + v.slice(-4) : v);
  return { on: !g.error, partnerId: g.partnerId, appId: g.appId, merchantId: mask(g.merchantId), savedAt: g.savedAt || '', error: g.error || '', errorAt: g.errorAt || '', status: g.status || 0, message: g.message || '' };
}
async function liveBalance(store, g, fresh) {
  const cached = await store.readJSON(BAL, null);
  if (!fresh && cached && cached.live && cached.at && Date.now() - Date.parse(cached.at) < 60e3) return Object.assign({ connected: true, gateway: gwPublic(g) }, cached);
  try {
    const v = { at: new Date().toISOString(), live: true, accounts: await gwBalances(g, store), error: '' };
    await store.writeJSON(BAL, v, { quiet: true });
    return Object.assign({ connected: true, gateway: gwPublic(g) }, v);
  } catch (e) {
    // refused keys: noted, and not tried again (myPOS locks after three) until they are saved anew
    if (e.code === 'gw_partner' || e.code === 'gw_merchant') {
      g = Object.assign({}, g, { error: e.code, errorAt: new Date().toISOString(), status: e.status || 0, message: e.message || '' });
      await store.writeJSON(GW_KEY, g, { quiet: true });
    }
    return Object.assign({ connected: true, gateway: gwPublic(g) }, cached || {}, { error: e.code || 'mypos_failed', status: e.status || 0 });
  }
}
// Integrări → myPOS → "Sold în timp real": checks the keys once (token, session, the accounts), saves them only when
// all three worked. Empty secrets with the same IDs: the saved ones.
async function saveGateway(store, input, by) {
  const prev = (await store.readJSON(GW_KEY, null)) || {};
  const g = {};
  for (const k of Object.keys(GW_FIELDS)) {
    let v = cleanKey((input || {})[k]);
    if (!v && (k === 'clientSecret' || k === 'merchantSecret') && prev[k] && prev[k === 'clientSecret' ? 'clientId' : 'merchantId'] === g[k === 'clientSecret' ? 'clientId' : 'merchantId']) v = prev[k];
    if (!GW_FIELDS[k].test(v)) return { error: 'gw_format', field: k };
    g[k] = v;
  }
  if (g.merchantSecret === g.clientSecret) return { error: 'gw_format', field: 'merchantSecret', same: true }; // surely refused: not worth a try
  gwCache.delete('t|' + g.clientId); gwCache.delete('s|' + g.merchantId);
  let accounts;
  try { accounts = await gwBalances(g, store); } catch (e) {
    console.error('mypos gateway save:', e.code, e.status, e.message);
    return { error: e.code || 'mypos_failed', status: e.status || 0, message: e.message || '' };
  }
  Object.assign(g, { savedAt: new Date().toISOString(), by: by || '' });
  await store.writeJSON(GW_KEY, g);
  await store.writeJSON(BAL, { at: new Date().toISOString(), live: true, accounts, error: '' }, { quiet: true });
  return { ok: true, gateway: gwPublic(g) };
}
async function dropGateway(store) {
  await store.writeJSON(GW_KEY, {});
  await store.writeJSON(BAL, {}, { quiet: true });
}
const loadGateway = async (store) => gwPublic(await store.readJSON(GW_KEY, null));
async function listAccounts(conn) {
  const j = await call(conn, 'GET', TRX + '/accounts?' + new URLSearchParams({ page: '1', size: '100' }));
  return (j.accounts || []).map((a) => ({ number: String(a.account_number || ''), name: String(a.name || ''), currency: String(a.currency || ''), iban: String(a.iban || ''), reserve: !!a.is_reserve })).filter((a) => a.number);
}
function parseMt940(txt) {
  const f = (tag) => {
    const m = String(txt).match(new RegExp(':' + tag + ':([CD])(\\d{6})([A-Z]{3})([\\d.,]+)'));
    return m ? { amount: (m[1] === 'D' ? -1 : 1) * Number(m[4].replace(/\./g, '').replace(',', '.')), currency: m[3], date: '20' + m[2].slice(0, 2) + '-' + m[2].slice(2, 4) + '-' + m[2].slice(4, 6) } : null;
  };
  return { opening: f('60F') || f('60M'), closing: f('62F') || f('62M'), available: f('64') };
}
async function statement(conn, number, date) {
  const tok = await token(conn);
  const r = await fetch(TRX + '/accounts/statement', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, 'API-Key': conn.clientId, 'X-Request-ID': uuid(), 'Content-Type': 'application/json', Accept: 'application/json, text/plain' },
    body: JSON.stringify({ document_type: 1, account_number: number, date }),
  });
  let text = await r.text();
  if (!r.ok) throw new MyposError(r.status === 401 || r.status === 403 ? 'mypos_denied' : 'mypos_failed', r.status, text.slice(0, 160));
  if (/^\s*"/.test(text)) { try { text = JSON.parse(text); } catch (e) { /* the raw file */ } }
  if (text && typeof text === 'object') text = text.statement || text.data || JSON.stringify(text);
  return parseMt940(text);
}
async function balance(store, fresh) {
  const g = await store.readJSON(GW_KEY, null);
  if (gwReady(g) && !g.error) return liveBalance(store, g, fresh);
  const conn = await loadConn(store.readJSON);
  if (!connected(conn)) return { connected: false, gateway: gwPublic(g) };
  const cached = await store.readJSON(BAL, null);
  if (!fresh && cached && cached.at && !cached.live && Date.now() - Date.parse(cached.at) < 10 * 60e3) return Object.assign({ connected: true, gateway: gwPublic(g) }, cached);
  const today = dayOf(Date.now()), yesterday = dayOf(Date.now() - 86400e3);
  try {
    const accounts = (await listAccounts(conn)).slice(0, 6);
    const out = [];
    for (const a of accounts) {
      let s = null;
      try { s = await statement(conn, a.number, today); } catch (e) { s = null; }
      if (!s || (!s.available && !s.closing)) { try { s = await statement(conn, a.number, yesterday); } catch (e) { s = null; } }
      out.push({ number: a.number.slice(-4), name: a.name, currency: (s && (s.available || s.closing || {}).currency) || a.currency, reserve: a.reserve,
        available: s && s.available ? s.available.amount : null, closing: s && s.closing ? s.closing.amount : null, date: s && (s.closing || s.available || {}).date || '' });
    }
    const v = { at: new Date().toISOString(), accounts: out, error: out.length && out.every((x) => x.available == null && x.closing == null) ? 'no_statement' : '' };
    await store.writeJSON(BAL, v, { quiet: true });
    return Object.assign({ connected: true, gateway: gwPublic(g) }, v);
  } catch (e) {
    return Object.assign({ connected: true, gateway: gwPublic(g) }, cached && !cached.live ? cached : {}, { error: e.code || 'mypos_failed', status: e.status || 0 });
  }
}

module.exports = { CONN, PAY, EVENTS, MyposError, token, listDevices, listTransactions, fromApi, fromHook, merge, sync, ensureWebhook, dropWebhook, validSignature, loadConn, connected, dayOf, balance, parseMt940, saveGateway, dropGateway, loadGateway };
