// The Card de Sărbători (the owner, 20.11): 990 lei for a credit of 2.500 lei in treatments, 100 cards in all (both
// clinics), on sale until 24 December 2026, 23:59 (Romania). The reservations and their online payment.
//
//   data/card-sarbatori.json      [reservation]
//   reservation = { id, created, name, phone, recipient, gift, city, status: 'rezervat' | 'platit' | 'anulat', via: 'site',
//                   pay: 'salon' | 'online', code (the card's own code), leadId,
//                   payment: { code, url, status, created, expires, checked }   the myPOS payment request, when she pays online
//                   paidAt, paidVia: 'online' | 'clinica', bonusRestart }
//   data/card-sarbatori-pay.json  { ok, at, status, message }   the last check that myPOS eCommerce answers
//
// Online payment: a payment request made by the server through the myPOS eCommerce API (the API Gateway keys of
// Integrări → myPOS, api/_lib/mypos.js gwEcom), 990 lei fixed here; she pays on myPOS's own page (payment_request_url)
// and comes back to ours, which asks myPOS for the request's status; the clock asks too, for the ones that never came
// back (sweep). Paid: the card is paid, with the Restart treatment as a gift, reception and the owner hear it.
// The site offers online payment only while the last check says eCommerce answers (online()).

const { readJSON, writeJSON } = require('./store');
const N = require('./notify');

const KEY = 'data/card-sarbatori.json';
const PAYKEY = 'data/card-sarbatori-pay.json';
const TOTAL = 100, PRICE = 990;
const DEADLINE = '2026-12-24T21:59:59.000Z'; // 24 December 2026, 23:59:59 in Romania (UTC+2 in winter)
const PROBE_TTL = 15 * 60e3;
const FINAL = ['Paid', 'Expired', 'Cancelled', 'Failed'];
const store = { readJSON, writeJSON };
const live = (r) => r.status !== 'anulat';
const roDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(ms));

function counter(list, now, online) {
  const left = Math.max(0, TOTAL - (list || []).filter(live).length);
  return { total: TOTAL, left, deadline: DEADLINE, open: (now || Date.now()) < Date.parse(DEADLINE) && left > 0, online: !!online, price: PRICE };
}

// ---- does myPOS eCommerce answer? (a read: the first page of the payment requests)
async function probe() {
  const M = require('./mypos');
  let v;
  try {
    const r = await M.gwEcom(store, 'GET', '/ecommerce/v1/payment-requests?page=1&size=1');
    v = { ok: r.status >= 200 && r.status < 300, status: r.status, message: r.message || '' };
  } catch (e) { v = { ok: false, status: e.status || 0, message: e.code || 'mypos_failed' }; }
  v.at = new Date().toISOString();
  await writeJSON(PAYKEY, v, { quiet: true }).catch(() => 0);
  return v;
}
// the last answer, checked again when it is older than 15 minutes (a slow myPOS never holds the page: 4 s, then the last one)
async function online() {
  const last = await readJSON(PAYKEY, null).catch(() => null);
  if (last && last.at && Date.now() - Date.parse(last.at) < PROBE_TTL) return !!last.ok;
  const fresh = await Promise.race([probe(), new Promise((r) => setTimeout(() => r(null), 4000))]);
  return fresh ? !!fresh.ok : !!(last && last.ok);
}

// ---- the payment request for one reservation
const intl = (p) => { const d = String(p || '').replace(/\D/g, ''); return /^07\d{8}$/.test(d) ? '+4' + d : d ? '+' + d : ''; };
async function request(row) {
  const M = require('./mypos');
  const body = {
    amount: PRICE, currency: 'RON', client_name: String(row.name || '').slice(0, 100),
    reason: 'Cardul de Sărbători Centrul360', booking_text: 'Card de Sărbători ' + row.code,
    expiry_date: roDay(Date.now() + 2 * 86400e3), payment_request_lang: 'ro', notify_gsm: intl(row.phone),
  };
  const r = await M.gwEcom(store, 'POST', '/ecommerce/v1/payment-requests', body);
  const j = r.json || {};
  const code = String(j.code || (j.data && j.data.code) || '');
  const url = String(j.payment_request_url || (j.data && j.data.payment_request_url) || '');
  if (r.status >= 300 || !code || !/^https:\/\//.test(url)) { const e = new Error('mypos_request'); e.status = r.status; e.said = r.message; throw e; }
  return { code, url, status: 'Pending', created: new Date().toISOString(), expires: body.expiry_date, checked: '' };
}
// the request's status at myPOS: None, Pending, Seen, Failed, Paid, Expired, Cancelled
async function statusOf(code) {
  const M = require('./mypos');
  const r = await M.gwEcom(store, 'GET', '/ecommerce/v1/payment-requests/' + encodeURIComponent(code));
  if (r.status >= 300) { const e = new Error('mypos_status'); e.status = r.status; throw e; }
  const j = r.json || {};
  const s = String(j.status || j.payment_request_status || (j.data && j.data.status) || '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
}

// ---- paid: the card, the bonus, the team (once)
async function markPaid(id, via, by) {
  const list = await readJSON(KEY, []);
  const row = list.find((r) => r.id === id);
  if (!row || row.status === 'platit') return row || null;
  if (row.status === 'anulat' && via !== 'online') return row;
  row.status = 'platit'; row.paidAt = new Date().toISOString(); row.paidVia = via; row.bonusRestart = via === 'online';
  if (by) row.updatedBy = by;
  await writeJSON(KEY, list);
  try {
    const ids = [...new Set((await N.deskIds(store, row.city)).concat(await N.adminIds(store)))];
    await N.notifyMany(store, ids, {
      kind: 'money', tone: 'good', go: 'pipeline', tag: 'card-paid-' + row.id,
      title: 'CARD DE SĂRBĂTORI PLĂTIT' + N.cityTag(row.city) + (via === 'online' ? ' ONLINE 💳' : ' 🎁') + ' - ' + N.leiTxt(PRICE),
      text: row.recipient + (row.gift ? ' (cadou de la ' + row.name + ')' : '') + ' · cod ' + row.code + (via === 'online' ? ' · + Tratament Restart cadou · de trimis cardul pe WhatsApp' : ''),
    });
  } catch (e) { console.error('card-sarbatori notify:', e.message); }
  return row;
}

// one reservation: ask myPOS (at most every 10 s), note the answer; Paid → markPaid
async function check(id) {
  let list = await readJSON(KEY, []);
  let row = list.find((r) => r.id === id);
  if (!row || !row.payment || !row.payment.code) return row || null;
  if (row.status === 'platit' || FINAL.includes(row.payment.status)) return row;
  if (row.payment.checked && Date.now() - Date.parse(row.payment.checked) < 10e3) return row;
  const s = await statusOf(row.payment.code);
  list = await readJSON(KEY, []);
  row = list.find((r) => r.id === id);
  if (!row || !row.payment) return row || null;
  row.payment.checked = new Date().toISOString();
  if (s) row.payment.status = s;
  await writeJSON(KEY, list, { quiet: true });
  if (s === 'Paid') return markPaid(id, 'online');
  return row;
}

// the clock: the requests of the last 4 days that are not final yet (she paid and never came back to our page)
async function sweep() {
  const list = await readJSON(KEY, []);
  const open = list.filter((r) => r.payment && r.payment.code && r.status !== 'platit' && !FINAL.includes(r.payment.status) &&
    Date.now() - Date.parse(r.payment.created) < 4 * 86400e3);
  const out = { checked: 0, paid: 0, errors: 0 };
  for (const r of open.slice(0, 20)) {
    try { const x = await check(r.id); out.checked++; if (x && x.status === 'platit') out.paid++; } catch (e) { out.errors++; }
  }
  // the check that eCommerce answers, kept fresh for the page
  const last = await readJSON(PAYKEY, null).catch(() => null);
  if (!last || !last.at || Date.now() - Date.parse(last.at) > PROBE_TTL) out.online = (await probe()).ok;
  return out;
}

module.exports = { KEY, PAYKEY, TOTAL, PRICE, DEADLINE, FINAL, live, counter, probe, online, request, statusOf, markPaid, check, sweep };
