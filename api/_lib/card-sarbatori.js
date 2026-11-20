// The Card de Sărbători (the owner, 20.11): three cards, the more she pays the more she gets (290 → 500 lei, 490 → 1.000
// lei, 990 → 2.500 lei in treatments), 10 cards in all whatever the card (both clinics), on sale until 24 December 2026,
// 23:59 (Romania). The orders and their online payment.
//
//   data/card-sarbatori.json  [order]
//   order = { id, created, name, phone, city, tier (290 | 490 | 990), qty (1-5), amount (tier × qty, made here), credit,
//             cards: [{ code, recipient }]  each card its own code and the name on it ('' = to say at the desk),
//             recipient (the first card's name, for the lists), status: 'draft' | 'rezervat' | 'platit' | 'anulat',
//             via: 'site', pay: 'salon' | 'online', leadId, orderId (the one myPOS gets), orderIds (every one it got),
//             paidAt, paidVia: 'online' | 'clinica', paidVerified, bonusRestart (how many Restart treatments) }
//
// Online payment, our own checkout (the owner, 20.11: „doar banii să intre în myPOS, ca la Stripe”): the card form of the
// myPOS Embedded SDK in our window (v2/cs-buy.js). The order is made here first ('draft', with our orderID and the sum
// made here), then made a reservation with her details, then she pays in the form; myPOS tells us at /api/card-notify
// (the truth: the sum, the currency and the order must match; the signature is checked with MYPOS_PUBLIC_CERT when it
// in the pack). The store's settings come from myPOS's Configuration Pack of the store „API plată myPOS”, a secret of
// the Worker (MYPOS_CONFIG_PACK: base64 of JSON { sid, cn (wallet), pk (private key), pc (myPOS's certificate), idx (key
// index) }, as myPOS's SDKs read it): the browser gets only sid, the wallet and the key index (public), never pk;
// notifications are checked with pc. MYPOS_EMBED_SANDBOX = '1': myPOS's test store with its public test values instead.
// No pack (or one that does not read): the site offers only the reservation with payment in the clinic.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./store');
const N = require('./notify');

const KEY = 'data/card-sarbatori.json';
const TOTAL = 10, PRICE = 990; // only 10 cards in all (the owner, 20.11)
// the cards: what she pays → the credit she gets (the owner, 20.11); the Restart treatment only with the 990 card paid online
const TIERS = { 290: 500, 490: 1000, 990: 2500 };
const MAXQ = 5;
const DEADLINE = '2026-12-24T21:59:59.000Z'; // 24 December 2026, 23:59:59 in Romania (UTC+2 in winter)
const store = { readJSON, writeJSON };
// an order of before the three cards (one card of 990) reads as such
const norm = (r) => (r && !r.tier ? Object.assign(r, { tier: 990, qty: 1, amount: 990, credit: 2500, cards: r.cards || [{ code: r.code || '', recipient: r.recipient || '' }] }) : r);
const qtyOf = (r) => Math.max(1, Number(norm(r).qty) || 1);
// a card counts once it is ordered (a draft is only a sum on the way to the form; a cancelled one gives its cards back)
const live = (r) => r.status !== 'anulat' && r.status !== 'draft';

function counter(list, now, online) {
  const left = Math.max(0, TOTAL - (list || []).filter(live).reduce((n, r) => n + qtyOf(r), 0));
  return { total: TOTAL, left, deadline: DEADLINE, open: (now || Date.now()) < Date.parse(DEADLINE) && left > 0, online: !!online, price: PRICE, tiers: TIERS, maxQty: MAXQ };
}

// ---- the store's settings: the Configuration Pack (read defensively: spaces and line breaks in the base64 are dropped)
const TEST = { sid: '000000000000010', cn: '61938166610', idx: 1 }; // myPOS's public test store (developers.mypos.com, Test Data)
function pack() {
  const raw = String(process.env.MYPOS_CONFIG_PACK || '').replace(/\s+/g, '').replace(/^"+|"+$/g, '');
  if (!raw) return { present: false };
  let j;
  try { j = JSON.parse(Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return { present: true, decoded: false }; }
  if (!j || typeof j !== 'object') return { present: true, decoded: false };
  const pem = (v) => String(v || '').replace(/\\n/g, '\n').trim();
  const v = { sid: String(j.sid || '').trim(), cn: String(j.cn || '').trim(), idx: Number(j.idx), pk: pem(j.pk), pc: pem(j.pc) };
  const ok = /^\d{3,40}$/.test(v.sid) && /^\d{3,40}$/.test(v.cn) && v.idx > 0;
  return { present: true, decoded: true, ok, fields: Object.keys(j), v };
}
// what the browser may know (no pack and no sandbox: none, no online payment)
function embed() {
  if (process.env.MYPOS_EMBED_SANDBOX === '1') return { sid: TEST.sid, walletNumber: TEST.cn, keyIndex: TEST.idx, isSandbox: true };
  const p = pack();
  if (!p.ok) return null;
  return { sid: p.v.sid, walletNumber: p.v.cn, keyIndex: p.v.idx, isSandbox: false };
}
// for the check, read only: is the pack there, does it read, which fields (never their values)
function packStatus() {
  const p = pack();
  return { present: p.present, decoded: !!p.decoded, usable: !!p.ok, fields: p.fields || [], hasPrivateKey: !!(p.v && /BEGIN/.test(p.v.pk)), hasMyposCert: !!(p.v && /BEGIN/.test(p.v.pc)),
    sandbox: process.env.MYPOS_EMBED_SANDBOX === '1', online: !!embed() };
}
const newOrderId = () => 'CS' + crypto.randomBytes(8).toString('hex').toUpperCase();
const lei = (n) => Number(n).toLocaleString('ro-RO');
// what the form gets: our orderID, the sum made here, the cart, where myPOS tells us
function checkout(row, site) {
  const e = embed();
  if (!e) return null;
  return Object.assign({}, e, {
    orderID: row.orderId, amount: row.amount, currency: 'RON', ipcLanguage: 'ro', urlNotify: site + '/api/card-notify',
    cartItems: [{ article: 'Cardul de Sărbători ' + row.tier + ' lei (credit ' + lei(TIERS[row.tier]) + ' lei)', quantity: row.qty, price: row.tier, currency: 'RON' }],
  });
}

// ---- paid: the order, the bonus, the team (once)
async function markPaid(id, via, by, verified) {
  const list = await readJSON(KEY, []);
  const row = list.find((r) => r.id === id);
  if (!row || row.status === 'platit') return row || null;
  if (row.status === 'anulat' && via !== 'online') return row;
  norm(row);
  row.status = 'platit'; row.paidAt = new Date().toISOString(); row.paidVia = via;
  if (via === 'online') row.paidVerified = !!verified;
  row.bonusRestart = via === 'online' && Number(row.tier) === 990 ? row.qty : 0; // one Restart for each 990 card paid online
  if (by) row.updatedBy = by;
  await writeJSON(KEY, list);
  try {
    const ids = [...new Set((await N.deskIds(store, row.city)).concat(await N.adminIds(store)))];
    await N.notifyMany(store, ids, {
      kind: 'money', tone: 'good', go: 'pipeline', tag: 'card-paid-' + row.id,
      title: 'CARD DE SĂRBĂTORI PLĂTIT' + N.cityTag(row.city) + (via === 'online' ? ' ONLINE 💳' : ' 🎁') + ' - ' + N.leiTxt(row.amount),
      text: row.qty + ' × ' + row.tier + ' lei (credit ' + row.credit + ') · ' + row.name + ' · ' + row.cards.map((c) => c.code).join(', ') +
        (row.bonusRestart ? ' · + Tratament Restart cadou ×' + row.bonusRestart : '') + (via === 'online' ? ' · de trimis cardurile pe WhatsApp' + (verified ? '' : ' · semnătura myPOS neverificată, de văzut în myPOS') : ''),
    });
  } catch (e) { console.error('card-sarbatori notify:', e.message); }
  return row;
}

// ---- myPOS's notification (IPCPurchaseNotify): the signature, then the order, the sum and the currency
// The signature (myPOS IPC): every posted value except Signature, in order, joined with '-', base64; RSA-SHA256, checked
// with myPOS's certificate from the Configuration Pack (pc; MYPOS_PUBLIC_CERT can stand in for it).
function signed(pairs) {
  const p = pack();
  const cert = (p.v && p.v.pc) || String(process.env.MYPOS_PUBLIC_CERT || '').replace(/\\n/g, '\n').trim();
  if (!cert) return null; // none: not checked (the test store)
  const sig = (pairs.find((p) => p[0] === 'Signature') || [])[1] || '';
  const data = Buffer.from(pairs.filter((p) => p[0] !== 'Signature').map((p) => p[1]).join('-'), 'utf8').toString('base64');
  try { return crypto.createVerify('RSA-SHA256').update(data).verify(cert, sig, 'base64'); } catch (e) { return false; }
}
async function notified(pairs) {
  const b = Object.fromEntries(pairs);
  if (b.IPCmethod !== 'IPCPurchaseNotify') return { ignored: b.IPCmethod || 'none' };
  const ok = signed(pairs);
  if (ok === false) return { refused: 'signature' };
  const list = await readJSON(KEY, []);
  const row = list.find((r) => r.orderId === b.OrderID || (r.orderIds || []).includes(b.OrderID));
  if (!row) return { refused: 'order' };
  norm(row);
  if (Math.round(Number(b.Amount) * 100) !== Math.round(row.amount * 100) || String(b.Currency || '').toUpperCase() !== 'RON') return { refused: 'amount' };
  if (row.status === 'draft') { row.status = 'rezervat'; await writeJSON(KEY, list); } // paid before her details came: kept, reception calls
  const paid = await markPaid(row.id, 'online', '', ok === true);
  return { paid: !!paid, verified: ok === true };
}

module.exports = { KEY, TOTAL, PRICE, TIERS, MAXQ, DEADLINE, live, norm, qtyOf, counter, embed, packStatus, newOrderId, checkout, markPaid, signed, notified };
