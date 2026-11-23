// myPOS Checkout (IPC 1.4), the site's online payments inside the page (no redirect): the store's keys and the signed calls.
// The keys come from the clinic's myPOS account (Online → its online store → Integrare / Keys) and are pasted by the owner in
// Admin → Integrări → myPOS → „Plata online pe site”. Kept only here, on the server; the browser gets only what the embedded
// form itself needs (Store ID, client number, key index), never the private key.
//
// Signing (as myPOS's own SDKs do): every value of the request, in order, joined with "-", base64, signed RSA-SHA256 with the
// store's private key, base64. myPOS signs its answers and its notifications the same way with its own key; they are checked
// with myPOS's public certificate of the store.
//
//   data/mypos-checkout.json  { sid, walletNumber, keyIndex, privateKey, myposCert, sandbox, live, savedAt, by, checkedAt,
//                               test: { orderId, at }, testPassedAt, lastNotify: { at, ok, why } }
const crypto = require('crypto');

const KEY = 'data/mypos-checkout.json';
const URL_LIVE = 'https://www.mypos.com/vmp/checkout';
const URL_TEST = 'https://www.mypos.com/vmp/checkout-test';
const VERSION = '1.4';

const clean = (v) => String(v == null ? '' : v).replace(/[\s​-‍⁠﻿]/g, '');
// a PEM pasted from a file or from a one-line field (literal \n, spaces instead of line breaks): rebuilt to a real PEM
function pem(text, kinds) {
  const t = String(text || '').replace(/\\n/g, '\n').trim();
  const m = t.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
  if (!m || !kinds.includes(m[1])) return '';
  const body = m[2].replace(/[^A-Za-z0-9+/=]/g, '');
  if (body.length < 100) return '';
  return '-----BEGIN ' + m[1] + '-----\n' + body.match(/.{1,64}/g).join('\n') + '\n-----END ' + m[1] + '-----\n';
}
const PRIV = ['RSA PRIVATE KEY', 'PRIVATE KEY'];
const CERT = ['CERTIFICATE', 'PUBLIC KEY', 'RSA PUBLIC KEY'];

const ready = (c) => !!(c && c.sid && c.walletNumber && c.keyIndex && c.privateKey && c.myposCert);
const endpoint = (c) => (c && c.sandbox ? URL_TEST : URL_LIVE);
async function load(store) { return (await store.readJSON(KEY, null)) || {}; }

function sign(fields, privateKey) {
  const s = crypto.createSign('RSA-SHA256');
  s.update(Buffer.from(Object.values(fields).map((v) => (v == null ? '' : String(v))).join('-'), 'utf8').toString('base64'));
  return s.sign(privateKey, 'base64');
}
// pairs: [[name, value], …] in the order they came; the Signature is left out of what is checked
function verifyPairs(pairs, cert) {
  const sig = (pairs.find(([k]) => k === 'Signature') || [])[1];
  if (!sig || !cert) return false;
  const text = pairs.filter(([k]) => k !== 'Signature').map(([, v]) => (v == null ? '' : String(v))).join('-');
  try {
    const v = crypto.createVerify('RSA-SHA256');
    v.update(Buffer.from(text, 'utf8').toString('base64'));
    return v.verify(cert, String(sig).replace(/ /g, '+'), 'base64');
  } catch (e) { return false; }
}
// a notification's raw body (application/x-www-form-urlencoded): its pairs in order, then checked
const pairsOfForm = (raw) => [...new URLSearchParams(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || ''))];

// a signed call (JSON answer, checked with myPOS's certificate). Throws { code } when myPOS refuses or the answer isn't theirs.
class IpcError extends Error { constructor(code, msg, status) { super(msg || code); this.code = code; this.status = status; } }
async function call(c, method, fields) {
  const f = Object.assign({ IPCmethod: method, IPCVersion: VERSION, IPCLanguage: 'RO' }, fields, { OutputFormat: 'JSON' });
  f.Signature = sign(f, c.privateKey);
  let r, text;
  try {
    r = await fetch(endpoint(c), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(f) });
    text = await r.text();
  } catch (e) { throw new IpcError('mypos_down', e.message); }
  let j;
  try { j = JSON.parse(text); } catch (e) { throw new IpcError('mypos_bad_answer', text.slice(0, 160), r.status); }
  // the answer's fields in the order myPOS sent them (JSON.parse keeps it)
  const pairs = Object.keys(j).filter((k) => typeof j[k] !== 'object' || j[k] === null).map((k) => [k, j[k] == null ? '' : j[k]]);
  const signed = verifyPairs(pairs, c.myposCert);
  // Status 0 is success in the documentation; the test environment answers IPCGetPaymentStatus with 1 and „Success”
  if (String(j.Status) !== '0' && !/^success$/i.test(String(j.StatusMsg || ''))) throw Object.assign(new IpcError('mypos_refused', String(j.StatusMsg || 'Status ' + j.Status).slice(0, 200), Number(j.Status)), { signed });
  if (!signed) throw new IpcError('mypos_unsigned', 'răspunsul nu are semnătura myPOS (certificatul public nu se potrivește)');
  return j;
}
const amt = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);

// the session Apple Pay / Google Pay need (signed: the sum is fixed by the server). Not a charge.
async function sessionCreate(c, { orderId, amount, title }) {
  const j = await call(c, 'IPCPaymentSessionCreate', {
    OrderID: orderId, Amount: amt(amount), Currency: 'RON', SID: c.sid, WalletNumber: c.walletNumber, KeyIndex: c.keyIndex,
    CartItems: '1', Article_1: String(title || 'Centrul360').slice(0, 120), Quantity_1: '1', Price_1: amt(amount), Amount_1: amt(amount), Currency_1: 'RON',
  });
  return { token: String(j.SessionToken || ''), expires: String(j.ExpDate || '') };
}
// what myPOS knows of an order: { status: 1 paid | 2 pending | 3 failed | 4 reversed, amount, currency, ref, method, at }; null: none
async function paymentStatus(c, orderId) {
  let j;
  try {
    j = await call(c, 'IPCGetPaymentStatus', { SID: c.sid, KeyIndex: c.keyIndex, walletnumber: c.walletNumber, OrderID: orderId });
  } catch (e) {
    if (e.code === 'mypos_refused' && e.signed !== false && /not\s*found|no\s*(such\s*)?(payment|order|transaction)|invalid\s*order/i.test(e.message)) return null;
    throw e;
  }
  // the test environment makes up a payment for any order id (another sum, in EUR): only an answer about this very order,
  // with its sum in lei, is believed (api/_lib/pay.js)
  return { orderId: String(j.OrderID || ''), status: Number(j.PaymentStatus) || 0, amount: Number(j.Amount) || 0, currency: String(j.Currency || ''), ref: String(j.IPC_Trnref || j.PaymentReference || ''), method: String(j.PaymentMethod || ''), at: String(j.DateTime || ''), signed: true };
}

// what the browser may know: the embedded form needs the Store ID, the client number and the key index (they are not secret)
function publicOf(c) {
  if (!ready(c)) return { on: false };
  return { on: !c.error, live: !!c.live && !c.sandbox, sandbox: !!c.sandbox, sid: c.sid, walletNumber: c.walletNumber, keyIndex: Number(c.keyIndex) || 1 };
}
// what the admin sees (never the private key; the certificate only by its dates)
function adminOf(c) {
  if (!ready(c)) return { saved: false };
  let certTill = '';
  try { certTill = new crypto.X509Certificate(c.myposCert).validTo; } catch (e) { /* a bare public key */ }
  return { saved: true, sid: c.sid, walletNumber: c.walletNumber, keyIndex: Number(c.keyIndex) || 1, sandbox: !!c.sandbox, live: !!c.live, savedAt: c.savedAt || '', certTill,
    checkedAt: c.checkedAt || '', error: c.error || '', test: c.test || null, testPassedAt: c.testPassedAt || '', lastNotify: c.lastNotify || null };
}

// Integrări → myPOS → „Plata online pe site”: the keys checked once with myPOS (a payment session of 1 leu: not a charge, it proves
// the Store ID, the client number, the key and its index, and that the certificate is myPOS's), kept only when all is right.
// An empty private key / certificate with the same Store ID keeps the saved one.
async function save(store, input, by) {
  const prev = await load(store);
  const i = input || {};
  const c = { sid: clean(i.sid), walletNumber: clean(i.walletNumber), keyIndex: clean(i.keyIndex) || '1', sandbox: !!i.sandbox };
  if (!/^\d{6,20}$/.test(c.sid)) return { error: 'ipc_format', field: 'sid' };
  if (!/^\d{6,20}$/.test(c.walletNumber)) return { error: 'ipc_format', field: 'walletNumber' };
  if (!/^\d{1,4}$/.test(c.keyIndex)) return { error: 'ipc_format', field: 'keyIndex' };
  const same = prev.sid === c.sid && prev.walletNumber === c.walletNumber;
  c.privateKey = String(i.privateKey || '').trim() ? pem(i.privateKey, PRIV) : same ? prev.privateKey : '';
  c.myposCert = String(i.myposCert || '').trim() ? pem(i.myposCert, CERT) : same ? prev.myposCert : '';
  if (!c.privateKey) return { error: 'ipc_format', field: 'privateKey' };
  if (!c.myposCert) return { error: 'ipc_format', field: 'myposCert' };
  try { crypto.createPrivateKey(c.privateKey); } catch (e) { return { error: 'ipc_format', field: 'privateKey' }; }
  let pub;
  try { pub = crypto.createPublicKey(c.myposCert); } catch (e) { return { error: 'ipc_format', field: 'myposCert' }; }
  // the store's own public key pasted instead of myPOS's certificate: myPOS's answers would never check out
  if (crypto.createPublicKey(c.privateKey).export({ type: 'spki', format: 'der' }).equals(pub.export({ type: 'spki', format: 'der' }))) return { error: 'ipc_own_cert' };
  try {
    await sessionCreate(c, { orderId: 'check-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex'), amount: 1, title: 'Verificare chei' });
  } catch (e) {
    console.error('mypos checkout save:', e.code, e.message);
    return { error: e.code || 'mypos_failed', message: e.message || '' };
  }
  const now = new Date().toISOString();
  // new keys start switched off on the site until the 1 leu test passes again (the owner's rule: off until a real test)
  const keep = same && prev.testPassedAt && !c.sandbox === !prev.sandbox;
  Object.assign(c, { live: keep ? !!prev.live : false, savedAt: now, by: by || '', checkedAt: now, error: '', testPassedAt: keep ? prev.testPassedAt : '', test: keep ? prev.test || null : null, lastNotify: prev.lastNotify || null });
  await store.writeJSON(KEY, c);
  return { ok: true, checkout: adminOf(c) };
}
async function setLive(store, on) {
  const c = await load(store);
  if (!ready(c)) return { error: 'not_saved' };
  if (on && c.sandbox) return { error: 'sandbox' };
  if (on && !c.testPassedAt) return { error: 'test_first' };
  c.live = !!on;
  await store.writeJSON(KEY, c);
  return { ok: true, checkout: adminOf(c) };
}
async function drop(store) { await store.writeJSON(KEY, {}); }
async function note(store, patch) {
  const c = await load(store);
  if (!ready(c)) return;
  Object.assign(c, patch);
  await store.writeJSON(KEY, c, { quiet: true });
}

module.exports = { KEY, ready, load, sign, verifyPairs, pairsOfForm, call, sessionCreate, paymentStatus, publicOf, adminOf, save, setLive, drop, note, endpoint, pem, IpcError, amt };
