// The Card de Sărbători (the owner, 20-21.11): three cards, the more she pays the more she gets (290 → 500 lei, 490 → 1.000
// lei, 990 → 2.500 lei in treatments, at list price, not on top of the discounted offers), 10 cards in all at first (the stock, set in the portal) whatever the card
// (both clinics), on sale until 24 December 2026, 23:59 (Romania), valid until 30 June 2027.
//
//   data/card-sarbatori.json  [order]
//   order = { id, created, name, phone, city, tier (490 | 990 | 9900 VIP; 290 out of sale, its orders kept), qty (1-5), amount (tier × qty, made here), credit,
//             forWho: 'eu' | 'cadou', cards: [card], recipient (the first card's name), via: 'site' | 'portal',
//             pay: 'online' | 'clinica', status: 'asteptare' (sent to the PayLink, not paid yet) | 'rezervat' (to pay in
//             the clinic) | 'platit' | 'anulat', leadId, paidAt, paidVia: 'online' | 'clinica', paidBy, paidAmount,
//             match: { src: 'mypos' | 'ipn' | 'webhook', ref, at } (how the payment was found), bonus (paid online: the gift
//             and Clubul 360), cancelledAt, cancelledBy ('ea' when she said no herself), held (when its 2 h hold started again:
//             „Încerc din nou”, „Finalizez plata”; else the hold counts from created), convertedAt (an online order she moved
//             to the clinic), trail: [{ at, ev, note }] (what happened to it, below), rec: { wa1, wa2, stop, replied } }
//   card  = { code (C360-XXXX-XXXX), recipient (the name on it; '' = hers), value (the credit), claims: [claim],
//             gift: { what, state: 'open' | 'used', usedAt } (paid online only), sent: { at, how, error }, remind: { … } }
//   claim = { id, at, date, city, by, byName, performer, performerName, items: [{ name, amount, kind: 'credit' | 'gift' }],
//             applied (what came off the credit), rest (what she paid on top), undone? }
//
// How a card is sold (the owner, 21.11): the button opens a small step (for her or a gift, her name, phone, clinic), the
// order is made here ('asteptare', its codes) and she goes to the myPOS PayLink of that card. The payment is found by
// itself when myPOS shows it to us (the transactions API of the clinic's account, read on the clock and when the team
// opens the cards; myPOS's own notification when its signature holds): the same sum, within 48 h after the order, the
// oldest order first. Always: the team confirms it with one tap in the portal (myPOS writes the owner for every paid
// link). Or she reserves it and pays in the clinic ('rezervat'): only the credit, no gift and no Club.
// Once paid: the card is active, the counter keeps it, her lead and her client file know it, the desk and the owner hear
// it, and she gets her card on WhatsApp (the picture, api/_lib/card-image.js, and a short message).
//
// Card money and Încasări (the owner, 21.11: „pune și vânzările de carduri în Încasări”): the money comes in once, the day
// the card is paid, as one payment in Încasări (data/sales.json, like a payment with no visit: nobody's day, nobody's
// commission; method card for online, the one chosen for the clinic), tied to the order (cardOrderId). Using the credit
// later is not new money: a claim never writes a payment, so nothing is counted twice. A paid order cancelled by the
// owner: a refund row in Încasări, dated that day (the month's reports stay as they were).

const crypto = require('crypto');
const { readJSON, writeJSON, readBinary, writeBinary, createOnce } = require('./store');
const N = require('./notify');

const KEY = 'data/card-sarbatori.json';
const CLUB = 'data/club360-waitlist.json';
const PROBE = 'data/card-sarbatori-probe.json';
const TOTAL = 10; // only 10 cards in all (the owner, 20.11)
const TIERS = { 290: 500, 490: 1000, 990: 2500, 9900: 30000 };
// on sale now (the owner, 22.11): the 290 card is out (its orders and cards keep working), the VIP is in. The VIP card
// („Cardul VIP Transformarea 360”): 9.900 lei → 30.000 lei, for her and all her family; 5 per clinic, its own stock, outside
// the waves (vipLeft); after its payment, the full review and her plan (reviewNotice)
const VIP = 9900;
const SALE = [490, 990, VIP];
const isVip = (t) => Number(t && typeof t === 'object' ? t.tier : t) === VIP;
const VIP_MAX = 5;
const MAXQ = 5;
const DEADLINE = '2026-12-24T21:59:59.000Z'; // 24 December 2026, 23:59:59 in Romania (UTC+2 in winter)
const VALID_UNTIL = '2027-06-30T20:59:59.000Z'; // 30 June 2027, 23:59:59 in Romania (UTC+3 in summer)
const VALID_TXT = '30.06.2027';
const HOLD_MS = 2 * 3600e3; // an order sent to the PayLink keeps its cards 2 hours on the counter
const MATCH_MS = 48 * 3600e3; // a payment is matched to an order made at most 48 h before it
const CLUB_URL = 'https://www.centrul360.com/club-360';
// the gift of the online payment (the owner, 22.11): the same in both clinics, a BioLifting session (anti-wrinkle or
// prevention), no value in lei said. Change it here and only here. Until 22.11 it was an EMS session in Timișoara and a
// Tratament Restart in Arad (GIFT_TM, GIFT_ARAD): the cards paid then keep the gift they were promised (c.gift.what, giftFor).
const GIFT = 'o ședință de BioLifting cadou';
const GIFT_SHORT = 'Ședință BioLifting cadou';
const GIFT_TM = 'o ședință de EMS cadou';
const GIFT_ARAD = 'un Tratament Restart cadou';
const giftOf = () => GIFT;
const giftShort = () => GIFT_SHORT;
// the gift of a card paid already: the one written on it (EMS / Restart before 22.11), else today's
// (a VIP card paid online has no gift: 10% off instead; giftFor is '' for it)
const giftFor = (r, c) => { const w = String((c && c.gift && c.gift.what) || ''); return !w ? '' : /EMS/.test(w) ? GIFT_TM : /Restart/.test(w) ? GIFT_ARAD : GIFT; };

const store = { readJSON, writeJSON };
const nowISO = () => new Date().toISOString();
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const lei = (n) => Math.round(Number(n) || 0).toLocaleString('ro-RO').replace(/ /g, '.');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const roDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(ms));
const firstName = (s) => String(s || '').trim().split(/\s+/)[0] || '';

// ---- an order as it reads now (the older ones: one card of 990; 'salon' is the clinic; a card's own fields)
function norm(r) {
  if (!r) return r;
  if (!r.tier) Object.assign(r, { tier: 990, qty: 1, amount: 990, credit: 2500, cards: r.cards || [{ code: r.code || '', recipient: r.recipient || '' }] });
  if (r.pay === 'salon') r.pay = 'clinica';
  r.cards = (r.cards || []).map((c) => Object.assign(c, { value: Number(c.value) || TIERS[r.tier] || 0, claims: Array.isArray(c.claims) ? c.claims : [] }));
  return r;
}
const qtyOf = (r) => Math.max(1, Number(norm(r).qty) || 1);
// a card counts once it is ordered; an order sent to the PayLink only for its first 2 hours (unless it was paid); a hold
// started again („Încerc din nou”) counts from then
const heldFrom = (r) => Date.parse(r.held || r.created);
function live(r, now) {
  if (!r || r.status === 'anulat' || r.status === 'draft') return false;
  // an order sent to the PayLink, and a lead from the ads' form waiting for her choice: 2 hours
  if (r.status === 'asteptare' || r.status === 'lead') return (now || Date.now()) - heldFrom(r) < HOLD_MS;
  return true;
}
// ---- the trail of an order (the owner, 21.11: she started the payment and never paid, and nobody knew why): one short
// line per thing that happened, read in the portal. ev: created, to_paylink, returned (back on the site, unpaid), reason
// (her answer on the site: retry, declined, nocard, confusing, clinic, no), wa1 / wa2 (the recovery messages, note: ok or
// why not), replied (on WhatsApp: pay, clinic, no, text), converted (to a clinic reservation: site, whatsapp, portal),
// expired (the 2 h hold is over), paid (auto, manual), cancelled (team, ea)
const TRAIL_MAX = 40;
function mark(r, ev, note) {
  if (!Array.isArray(r.trail)) r.trail = [];
  const x = { at: nowISO(), ev: String(ev) };
  if (note) x.note = String(note).slice(0, 140);
  r.trail.push(x);
  if (r.trail.length > TRAIL_MAX) r.trail = r.trail.slice(-TRAIL_MAX);
  return x;
}
const recOf = (r) => (r.rec = r.rec && typeof r.rec === 'object' ? r.rec : {});
// the waves (the owner, 21.11): the cards sell in waves of 10, up to 70 in all (both set by him in the portal, Carduri de
// Sărbători → Valuri). Only inside: the page says only „Au mai rămas doar N carduri”, N = what is left of the wave of now,
// counted from the real orders. A wave sold out: the next opens at once (N is the wave's size again); after the last one
// (the total) the sale closes. „Deschide acum următorul val” (the owner) ends the wave of now early: N starts over.
//   data/card-sarbatori-stock.json  { wave: 10, max: 70, skip (cards of waves ended early), by, at }
const STOCK = 'data/card-sarbatori-stock.json';
const WAVE = 10, MAX = 70;
async function settings() {
  const d = (await readJSON(STOCK, null).catch(() => null)) || {};
  const wave = Number.isInteger(d.wave) && d.wave >= 1 && d.wave <= 200 ? d.wave : WAVE;
  const max = Number.isInteger(d.max) && d.max >= 0 && d.max <= 1000 ? d.max : MAX;
  const vm = (c) => (d.vip && Number.isInteger(d.vip[c]) && d.vip[c] >= 0 && d.vip[c] <= 100 ? d.vip[c] : VIP_MAX);
  return { wave, max, skip: Number.isInteger(d.skip) && d.skip > 0 ? d.skip : 0, vip: { 'Timișoara': vm('Timișoara'), Arad: vm('Arad') } };
}
async function setStock(input, by) {
  const cur = await settings();
  const wave = input.wave == null ? cur.wave : Number(input.wave), max = input.max == null ? cur.max : Number(input.max);
  if (!Number.isInteger(wave) || wave < 1 || wave > 200 || !Number.isInteger(max) || max < 0 || max > 1000) return { error: 'bad_stock' };
  // the VIP cards of each clinic (5 / 5 at first)
  const vip = Object.assign({}, cur.vip);
  const iv = input.vip || {};
  for (const [c, v] of [['Timișoara', iv['Timișoara'] != null ? iv['Timișoara'] : input.vipTm], ['Arad', iv.Arad != null ? iv.Arad : input.vipAr]]) {
    if (v == null || v === '') continue;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 100) return { error: 'bad_stock' };
    vip[c] = n;
  }
  await writeJSON(STOCK, { wave, max, skip: cur.skip, vip, by: by || '', at: nowISO() });
  return { ok: true, wave, max, vip };
}
// the wave's size changed, the new wave starting full now (the owner, 23.11: „fiecare val să înceapă de la 4”, the same
// number as the WhatsApp picture): the skip moves so that the cards sold so far end a wave of the new size
async function setWave(size, by) {
  const W = Number(size);
  if (!Number.isInteger(W) || W < 1 || W > 200) return { error: 'bad_wave' };
  const cfg = await settings();
  const list = await readJSON(KEY, []);
  const eff = ordered(list, Date.now()) + cfg.skip;
  const skip = cfg.skip + ((W - (eff % W)) % W);
  await writeJSON(STOCK, { wave: W, max: cfg.max, skip, vip: cfg.vip, by: by || '', at: nowISO() });
  const c = counter(list, Date.now(), Object.assign({}, cfg, { wave: W, skip }));
  return { ok: true, wave: W, left: c.left };
}
// „Deschide acum următorul val”: the cards left in the wave of now are skipped, the next wave starts now
async function openNext(list, by) {
  const cfg = await settings();
  const c = counter(list, Date.now(), cfg);
  if (c.wave.soldOut) return { error: 'last_wave' };
  if (c.wave.left >= cfg.wave) return { error: 'just_opened' };
  const skip = cfg.skip + c.wave.left;
  await writeJSON(STOCK, { wave: cfg.wave, max: cfg.max, skip, vip: cfg.vip, by: by || '', at: nowISO() });
  return { ok: true, wave: c.wave.n + 1 };
}
// the waves count the regular cards; the VIP ones have their own stock, per clinic
const ordered = (list, now) => (list || []).filter((r) => !isVip(r) && live(r, now || Date.now())).reduce((n, r) => n + qtyOf(r), 0);
function vipLeft(list, now, cfg) {
  const t = now || Date.now(), out = {};
  ['Timișoara', 'Arad'].forEach((c) => {
    const max = cfg && cfg.vip && Number.isInteger(cfg.vip[c]) ? cfg.vip[c] : VIP_MAX;
    const used = (list || []).filter((r) => isVip(r) && r.city === c && live(r, t)).reduce((n, r) => n + qtyOf(r), 0);
    out[c] = { max, left: Math.max(0, max - used) };
  });
  return out;
}
// what the page may know (left, open, the deadline) and, for the portal only, the wave
function counter(list, now, cfg) {
  const t = now || Date.now();
  const W = (cfg && cfg.wave) || WAVE, max = cfg && Number.isInteger(cfg.max) ? cfg.max : MAX, skip = (cfg && cfg.skip) || 0;
  const sold = ordered(list, t), eff = sold + skip;
  // never sold out before the deadline (the owner, 23.11: „să nu rămână vreo clientă fără card”): a wave at 0 opens the
  // next one at once, and past the planned total (max) the waves go on the same way; the page only ever says the wave's N
  const soldOut = false;
  const left = W - (eff % W);
  const n = Math.floor(eff / W) + 1;
  const of = Math.max(n, n + Math.ceil(Math.max(0, max - sold - left) / W));
  const open = t < Date.parse(DEADLINE) && !soldOut && left > 0;
  return { total: W, left, deadline: DEADLINE, open, tiers: TIERS, sale: SALE, maxQty: MAXQ, validUntil: VALID_UNTIL, vip: vipLeft(list, t, cfg),
    sold, wave: { n, of, size: W, max, sold: eff % W, left, soldOut } };
}
// the public answer: nothing about the waves
const publicCount = (c) => ({ total: c.total, left: c.left, deadline: c.deadline, open: c.open, tiers: c.tiers, sale: c.sale, maxQty: c.maxQty, validUntil: c.validUntil, vip: c.vip });
const count = async (list, now) => counter(list, now, await settings());
const total = async () => (await settings()).max;
// is there a card of this kind for her: the VIP ones of her clinic, else the wave of now → { ok, left, error }
async function stockFor(list, tier, city, qty, now, cnt) {
  const t = now || Date.now();
  if (t >= Date.parse(DEADLINE)) return { ok: false, left: 0, error: 'closed' };
  const c = cnt || await count(list, t);
  if (isVip(tier)) { const v = c.vip[city] || { left: 0 }; return v.left >= (qty || 1) ? { ok: true, left: v.left } : { ok: false, left: v.left, error: v.left > 0 ? 'not_enough' : 'sold_out' }; }
  // the regular cards: always there before the deadline (more than the wave holds: the next wave takes the rest)
  return { ok: true, left: Math.max(c.left, qty || 1) };
}
// what is left for her card: the VIP ones of her clinic, else the wave's
const leftFor = (c, tier, city) => (isVip(tier) ? ((c.vip || {})[city] || { left: 0 }).left : c.left);
// two at the same second for the last cards: is this one past the stock (the later one gives way)
async function lostRace(list, entry) {
  const cfg = await settings();
  const mine = (r) => (isVip(entry) ? isVip(r) && r.city === entry.city : !isVip(r));
  const before = list.filter((r) => mine(r) && live(r));
  const upTo = before.slice(0, before.findIndex((r) => r.id === entry.id) + 1).reduce((n, r) => n + qtyOf(r), 0);
  if (isVip(entry)) return upTo > ((cfg.vip || {})[entry.city] != null ? cfg.vip[entry.city] : VIP_MAX);
  return false; // the regular cards never run out (the waves go on), so nobody gives way
}
// the notifications' title: „C. SARB 🎄 990 lei · …”, a VIP one „C. SARB 💎 VIP 9.900 lei · …” (the owner, 22.11)
const sarb = (tier, amount) => 'C. SARB ' + (isVip(tier) ? '💎 VIP ' : '🎄 ') + N.leiTxt(amount != null ? amount : tier);
const expired = (now) => (now || Date.now()) > Date.parse(VALID_UNTIL);
const usedOf = (c) => r2((c.claims || []).filter((x) => !x.undone).reduce((n, x) => n + (Number(x.applied) || 0), 0));
const leftOf = (c) => Math.max(0, r2((Number(c.value) || 0) - usedOf(c)));
// a card's state: rezervat, asteptare, activ, folosit, expirat, anulat
function stateOf(r, c, now) {
  if (r.status === 'anulat') return 'anulat';
  if (r.status === 'rezervat') return 'rezervat';
  if (r.status === 'asteptare') return 'asteptare';
  if (r.status !== 'platit') return r.status || 'rezervat';
  if (leftOf(c) <= 0 && !(c.gift && c.gift.state === 'open')) return 'folosit';
  if (expired(now)) return 'expirat';
  return leftOf(c) <= 0 ? 'folosit' : 'activ';
}

const CODES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I: easy to read out at the desk
function codeOf(list, more) {
  const used = new Set([].concat(...(list || []).map((r) => (norm(r).cards || []).map((c) => c.code))).concat(more || []));
  for (;;) {
    const b = crypto.randomBytes(8);
    const c = 'C360-' + [0, 1, 2, 3].map((i) => CODES[b[i] % 32]).join('') + '-' + [4, 5, 6, 7].map((i) => CODES[b[i] % 32]).join('');
    if (!used.has(c)) return c;
  }
}
const findCard = (list, code) => {
  const k = String(code || '').toUpperCase().replace(/\s+/g, '');
  for (const r of list) { norm(r); const c = r.cards.find((x) => x.code === k); if (c) return { r, c }; }
  return null;
};

// ---- the payment links (the owner, 20.11): one myPOS PayLink per card, made by him in myPOS, kept here
// (api/lead-health.js ?cardlinks), only https links of myPOS.
const LINKS = 'data/card-sarbatori-links.json';
const okLink = (u) => { try { const x = new URL(String(u || '').trim()); return x.protocol === 'https:' && /(^|\.)mypos\.(com|eu)$/i.test(x.hostname) ? x.href : ''; } catch (e) { return ''; } };
// The VIP card paid online costs 10% less (the owner, 22.11): 9.900 → 8.910 lei, the full 30.000 credit all the same, and no
// gift (the 490 and 990 cards keep the BioLifting gift online, at their full price). The 10% sum has its own PayLink, made
// by him, kept as "9900_online"; until it is set the VIP is sold online as before (full price, full link, if any).
const DISC_TIERS = [VIP];
const discOf = (t) => Math.round(Number(t) * 0.9);
async function links() {
  const d = (await readJSON(LINKS, {}).catch(() => ({}))) || {};
  const out = {};
  Object.keys(TIERS).forEach((t) => { out[t] = okLink(d[t]) || null; });
  return out;
}
// the 10% links set: { "990": "https://…" } (only these tiers)
async function onlineLinks() {
  const d = (await readJSON(LINKS, {}).catch(() => ({}))) || {};
  const out = {};
  DISC_TIERS.forEach((t) => { const u = okLink(d[t + '_online']); if (u) out[t] = u; });
  return out;
}
// what she pays online for a card now, and where: its 10% link when there is one, else the full price and link
async function onlinePay(tier) {
  const [full, on] = await Promise.all([links(), onlineLinks()]);
  return on[tier] ? { link: on[tier], amount: discOf(tier), disc: true } : { link: full[tier] || null, amount: Number(tier), disc: false };
}
// the link of an order: the one of the sum it carries (a 10% order: its 10% link while it exists, else the full one; the
// payment of the full sum is matched to it too: candsOf)
async function linkOf(r) {
  if (await embedded()) return checkoutUrl(r);
  const [full, on] = await Promise.all([links(), onlineLinks()]);
  const l = (r.disc && on[r.tier]) || full[r.tier] || null;
  if (l && r.checkout) r.checkout.paylink = nowISO(); // a PayLink for an order of the checkout: its sum may be matched again
  return l;
}
// the site's view: per card, the link she goes to online and, for a card with its 10% link, the sum she pays
async function siteLinks() {
  const [full, on] = await Promise.all([links(), onlineLinks()]);
  const out = Object.assign({}, full), online = {};
  Object.keys(on).forEach((t) => { out[t] = on[t]; online[t] = discOf(t); });
  return { links: out, online };
}
// ---- „Plătesc online” in the page (the owner, 23.11): the site's own myPOS checkout (api/_lib/pay.js, c360-pay.js: the card
// form and Apple Pay / Google Pay in a sheet, no redirect) in place of the PayLinks. Behind a switch the owner turns on after
// he tried it (data/card-pay.json { embedded }; the preview: the card page with ?plata=test or /v2/). Off: the PayLinks, as
// they are. The prices: 490 and 990 at their full price (with the BioLifting gift and the Club), the VIP 8.910 (10% off, no
// gift), an old 290 at 290. An order paid there is paid only by myPOS's signed word (payPaid), never by matching sums.
const PAYSW = 'data/card-pay.json';
async function embedded() { const d = await readJSON(PAYSW, null).catch(() => null); return !!(d && d.embedded); }
async function setEmbedded(on, by) { await writeJSON(PAYSW, { embedded: !!on, at: nowISO(), by: by || '' }); return { ok: true, embedded: !!on }; }
const checkoutAmount = (tier, qty) => (isVip(tier) ? discOf(tier) : Number(tier)) * (qty || 1);
// the card page that opens the checkout of her order again (the recovery messages, while the checkout is on)
const checkoutUrl = (r) => 'https://www.centrul360.com/card-sarbatori?plata=' + encodeURIComponent(r.id);
// api/_lib/pay.js kind 'card': her order, waiting for the money → its sum (from here, never the browser) and what it is
async function payQuote({ ref }) {
  const id = String(ref || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const list = await readJSON(KEY, []);
  const r = byId(list, id);
  if (!r || r.pay !== 'online' || !['asteptare', 'anulat'].includes(r.status) || (r.status === 'anulat' && r.cancelledBy !== 'ea')) return r && r.status === 'platit' ? { error: 'already_paid' } : null;
  norm(r);
  // her card is still hers (a hold that is over takes one only when one is left)
  const h = await rehold(list, r);
  if (h !== 'ok') { await writeJSON(KEY, list); return { error: h === 'closed' ? 'closed' : 'sold_out' }; }
  const amount = checkoutAmount(r.tier, qtyOf(r));
  if (r.amount !== amount) { mark(r, 'amount', r.amount + ' → ' + amount); r.amount = amount; }
  if (isVip(r)) r.disc = true; else delete r.disc;
  r.checkout = Object.assign({}, r.checkout, { at: nowISO() });
  delete r.checkout.paylink;
  mark(r, 'to_checkout');
  // quiet: the open portals don't need a refresh for this mark (it kept the checkout ~3 s slower, 23.11)
  await writeJSON(KEY, list, { quiet: true });
  const title = (isVip(r) ? 'Cardul VIP Transformarea 360' : 'Cardul de Sărbători ' + lei(r.tier) + ' lei') + ' · ' + lei(r.credit) + ' lei în tratamente';
  // the reason to pay online, one line under the sum in the checkout's sheet (the owner, 23.11)
  const bonusText = isVip(r) ? '−10% și Clubul 360 la plata online' : '+ BioLifting cadou și Clubul 360 la plata online';
  return { amount, full: isVip(r) ? Number(r.tier) * qtyOf(r) : amount, title, city: r.city, name: r.name || r.hint || '', phone: r.phone, bonusText };
}
// her phone and name from the checkout's own screen (api/_lib/pay.js contact, the owner 24.11): on the order made without
// them, then what an online order gets at once (her lead, the desk's notice); once
async function payContact({ ref, name, phone }) {
  const { normalizePhone } = require('./clients');
  let p = normalizePhone(String(phone || '').slice(0, 30)) || '';
  if (/^7\d{8}$/.test(p)) p = '0' + p;
  if (!(/^07\d{8}$/.test(p) || /^[1-9]\d{10,14}$/.test(p))) return { error: 'bad_phone' };
  const nm = cleanText(name, 100);
  const list = await readJSON(KEY, []);
  const r = byId(list, String(ref || ''));
  if (!r) return { error: 'not_found' };
  const first = !r.phone;
  if (r.phone && d9(r.phone) !== d9(p)) mark(r, 'contact', 'telefon schimbat');
  r.phone = p;
  // her name, written by her on the payment screen: the card's name too (a card for her: nothing asked on WhatsApp)
  if (nm && !r.name && !(r.cards || []).some((c) => c.recipient) && r.forWho !== 'cadou') { r.name = nm; r.nameFrom = 'plata'; }
  if (nm) r.hint = r.hint || nm;
  if (first) mark(r, 'contact', 'din plată');
  await writeJSON(KEY, list);
  if (!first) return { ok: true };
  const st = { readJSON, writeJSON };
  try {
    const note = 'Card de Sărbători trimis la plata online (pe site), de confirmat plata: ' + r.tier + ' lei, credit ' + lei(r.credit) + ' lei, de plată ' + lei(r.amount) + ' lei';
    const L = await require('../portal-leads').createLead({ name: nm || NONAME, phone: p, source: 'site', location: r.city, createdBy: 'card-sarbatori', interest: 'Card de Sărbători', note, authorLabel: 'Site · Card de Sărbători', welcome: false, src: r.src });
    if (L && L.lead) {
      const l2 = await readJSON(KEY, []); const x = byId(l2, r.id); if (x && !x.leadId) { x.leadId = L.lead.id; await writeJSON(KEY, l2); }
      // Meta's Lead now (her browser's pixel sends the same event id when the contact is saved: counted once)
      const capi = require('./meta-capi'), t = r.track || {};
      if (r.leadEv) await capi.soon(() => capi.laterEvent({ name: 'Lead', eventId: r.leadEv, phone: p, leadId: L.lead.id, url: t.url || r.page, custom: { value: r.amount, currency: 'RON' } }, t));
    }
  } catch (e) { console.error('card pay contact lead:', e.message); }
  try {
    await N.notifyMany(st, await N.deskIds(st, r.city), { kind: 'money', tone: 'info', go: 'carduri', tag: 'card-wait-' + r.id,
      title: sarb(r.tier, r.amount) + ' · LA PLATĂ ONLINE' + N.cityTag(r.city), text: (nm || 'fără nume') + ' · se confirmă singur când plata vine din myPOS' });
  } catch (e) { /* the order stands */ }
  return { ok: true };
}
// myPOS's signed word that the checkout order is paid (api/_lib/pay.js, once per order, safe twice): the card as with any
// payment (issued, her WhatsApp, Încasări, the desk); another sum than her order's → „De verificat”; the sandbox → a test,
// never a card, nothing sent to her
async function payPaid({ orderId, ref, amount, currency, myposRef, method, at, sandbox, name, phone }) {
  // her phone and name, when the contact step's own call to us did not come (pay.js keeps them on its order)
  if (phone) { const l0 = await readJSON(KEY, []); const r0 = byId(l0, String(ref || '')); if (r0 && !r0.phone) await payContact({ ref, name, phone }).catch(() => null); }
  const list = await readJSON(KEY, []);
  const r = byId(list, String(ref || ''));
  if (!r) return { error: 'not_found' };
  norm(r);
  if (r.status === 'platit') return { ok: true, dup: true };
  const payRef = 'checkout-' + String(orderId || '').slice(0, 60);
  if (sandbox) {
    if (!r.testPay) {
      r.testPay = { at: nowISO(), orderId: String(orderId || '').slice(0, 60), amount: Number(amount) || 0 };
      Object.assign(r, { status: 'anulat', cancelledAt: nowISO(), cancelledBy: 'test' });
      recOf(r).stop = 'test';
      mark(r, 'test_paid', String(orderId || '').slice(0, 40));
      await writeJSON(KEY, list);
    }
    return { ok: true, test: true };
  }
  const sum = r2(amount);
  if (Math.abs(sum - Number(r.amount)) >= 0.01 || String(currency || 'RON').toUpperCase() !== 'RON') {
    const checks = await readJSON(CHECK, []).catch(() => []);
    if (!checks.some((c) => c.ref === payRef)) {
      checks.push({ id: crypto.randomUUID().slice(0, 12), ref: payRef, amount: sum, at: at || nowISO(), src: 'checkout', found: nowISO(), cands: [r.id], state: 'open', why: 'suma' });
      await writeJSON(CHECK, checks);
      mark(r, 'check', 'suma: ' + sum);
      await writeJSON(KEY, list);
    }
    return { ok: false, mismatch: true };
  }
  r.checkout = Object.assign({}, r.checkout, { orderId: String(orderId || '').slice(0, 60), paidAt: nowISO() });
  await writeJSON(KEY, list);
  const x = await confirm(r.id, 'online', { by: 'myPOS', byName: 'myPOS (plata pe site)', amount: sum, method: 'card', match: { src: 'checkout', ref: payRef, at: at || nowISO(), myposRef: String(myposRef || '').slice(0, 80), method: String(method || '').slice(0, 20) } });
  return x.error ? { error: x.error } : { ok: true, order: r.id, cards: (x.row.cards || []).map((c) => c.code) };
}
// ?cardlinks: { "990": url } the full one; { "990_online": url } or { "990": { url, amount: 891 } } the 10% one; '' clears
async function setLinks(input, by) {
  const cur = (await readJSON(LINKS, {}).catch(() => ({}))) || {};
  const next = Object.assign({}, cur);
  const put = (key, t, v) => {
    const s = String(v == null ? '' : v).trim();
    if (!s) { delete next[key]; return null; }
    const ok = okLink(s);
    if (!ok) return { error: 'bad_link', tier: key };
    next[key] = ok;
    return null;
  };
  for (const t of Object.keys(TIERS)) {
    if (!input) break;
    if (t in input) {
      const v = input[t];
      if (v && typeof v === 'object') {
        const amount = Number(v.amount);
        const disc = DISC_TIERS.includes(Number(t)) && amount === discOf(t);
        if (!disc && amount !== Number(t)) return { error: 'bad_amount', tier: t, amounts: DISC_TIERS.includes(Number(t)) ? [Number(t), discOf(t)] : [Number(t)] };
        const e = put(disc ? t + '_online' : t, t, v.url); if (e) return e;
      } else { const e = put(t, t, v); if (e) return e; }
    }
    if ((t + '_online') in input) {
      if (!DISC_TIERS.includes(Number(t))) return { error: 'no_discount', tier: t };
      const e = put(t + '_online', t, input[t + '_online']); if (e) return e;
    }
  }
  next.updatedAt = nowISO(); next.by = by || '';
  await writeJSON(LINKS, next);
  const on = await onlineLinks();
  return { ok: true, links: await links(), online: Object.fromEntries(Object.keys(on).map((t) => [t, { link: on[t], amount: discOf(t) }])) };
}

// ---- the picture of a card (made once, kept; made again when the name on it changes)
const imgPath = (code) => 'wa-out/card-' + code + '.png'; // the chat (Mesaje) shows it from there (api/portal-file.js)
async function image(r, c) {
  const name = c.recipient || r.name;
  const key = [c.code, name, c.value, isVip(r) ? 'vip' : ''].join('|');
  if (c.img === key) { const b = await readBinary(imgPath(c.code)).catch(() => null); if (b && b.length) return b; }
  const buf = await require('./card-image').png({ credit: c.value, name, code: c.code, valid: VALID_TXT, vip: isVip(r) });
  await writeBinary(imgPath(c.code), buf, 'image/png').catch((e) => console.error('card image save:', e.message));
  c.img = key;
  return buf;
}

// ---- WhatsApp: the templates (Meta reviews them once), the messages, and the way out when a template is not approved yet
// Our own fields for the card's messages (the examples Meta sees are in wa-templates.js SAMPLE)
const TPL = {
  card: { label: 'Cardul tău de Sărbători', headerType: 'IMAGE', map: ['prenume', 'credit', 'cod', 'cadou'],
    body: 'Bună, {{1}}! Cardul tău de Sărbători Centrul360 este activ: credit de {{2}} lei, cod {{3}}, valabil până pe 30.06.2027, pentru orice tratament la prețul de listă. {{4}} Pentru programare răspunde la acest mesaj. Mulțumim!' },
  sold: { label: 'Card de Sărbători folosit', map: ['prenume', 'folosit', 'cod', 'sold'],
    body: 'Bună, {{1}}! Am folosit {{2}} lei din Cardul tău de Sărbători {{3}}. Pe card mai ai {{4}} lei, valabili până pe 30.06.2027. Mulțumim!' },
  remind: { label: 'Card de Sărbători sold', map: ['prenume', 'sold', 'cod'],
    body: 'Bună, {{1}}! Mai ai {{2}} lei pe Cardul de Sărbători {{3}}, valabili până pe 30 iunie 2027, pentru orice tratament la prețul de listă. Pentru programare răspunde la acest mesaj.' },
  // reserved on the site, paid in the clinic (the owner, 21.11): right after, with the picture of her card marked „Rezervat”
  // (no code: nothing is issued before the payment; her name only if she gave one): reservedMsg
  // a lead from the ads' form („Rezervă Cardul de Sărbători”, the owner 21.11): at once, the picture of her card (no code,
  // no mark) and two buttons, online or in the clinic (reserveFromLead, leadReply)
  lead: { label: 'Card de Sărbători din reclamă', category: 'MARKETING', headerType: 'IMAGE', map: ['suma', 'credit', 'cadoul'], buttons: 'lead', sample: { code: '', name: '' },
    body: 'Bună! Ți-am pregătit Cardul de Sărbători de {{1}} lei, cu {{2}} lei în tratamente, valabil până pe 30 iunie 2027. Cum vrei să-l plătești? Online, cu cardul, primești în plus {{3}} și acces în Clubul 360. Sau îl plătești în clinică, cash sau card. Alege mai jos.' },
  // the new first messages of a lead (the owner, 23.11): her card reserved, the wave's real count, held 2 hours (HOLD_MS),
  // the online gift, the clinic choice reserved until she comes (toClinic: „rezervat”, the desk calls to book); one for the
  // 490 / 990 cards and one for the VIP, each with her first name and without (a name missing or odd: „Bună! …”); the
  // picture is her own card (leadMsg); used once Meta approves them, until then „lead”
  lead3n: { label: 'Card de Sărbători rezervat din reclamă', category: 'MARKETING', headerType: 'IMAGE', map: ['prenume', 'suma', 'credit', 'ramase'], buttons: 'lead', sample: { code: '', name: '' },
    body: 'Bună {{1}}! 🎁 Cardul tău de Sărbători este rezervat:\nPlătești {{2}} lei și primești {{3}} lei în tratamente, valabil până pe 30 iunie 2027.\n\n🔥 Au mai rămas doar {{4}} carduri, așa că ți-l țin rezervat 2 ore.\n\n✨ Dacă îl plătești acum online, primești în plus o ședință de BioLifting cadou și acces în Clubul 360.\n\n🏥 Preferi să-l plătești în clinică? Îți facem o programare și ți-l ținem rezervat până vii.\n\nAlege mai jos 👇' },
  lead3: { label: 'Card de Sărbători rezervat din reclamă fără nume', category: 'MARKETING', headerType: 'IMAGE', map: ['suma', 'credit', 'ramase'], buttons: 'lead', sample: { code: '', name: '' },
    body: 'Bună! 🎁 Cardul tău de Sărbători este rezervat:\nPlătești {{1}} lei și primești {{2}} lei în tratamente, valabil până pe 30 iunie 2027.\n\n🔥 Au mai rămas doar {{3}} carduri, așa că ți-l țin rezervat 2 ore.\n\n✨ Dacă îl plătești acum online, primești în plus o ședință de BioLifting cadou și acces în Clubul 360.\n\n🏥 Preferi să-l plătești în clinică? Îți facem o programare și ți-l ținem rezervat până vii.\n\nAlege mai jos 👇' },
  vip3n: { label: 'Card VIP rezervat din reclamă', category: 'MARKETING', headerType: 'IMAGE', map: ['prenume', 'ramase'], buttons: 'lead', sample: { code: '', name: '', vip: true, credit: 30000 },
    body: 'Bună {{1}}! 💎 Cardul tău VIP Transformarea 360 este rezervat:\nPlătești 9.900 lei și primești 30.000 lei în tratamente, pentru tine și cei dragi, valabil până pe 30 iunie 2027.\n\n🔥 Au mai rămas doar {{2}} carduri VIP, așa că ți-l țin rezervat 2 ore.\n\n✨ Dacă îl plătești acum online, ai 10% reducere: plătești 8.910 lei, plus acces în Clubul 360.\n\n🏥 Preferi să-l plătești în clinică? Îți facem o programare și ți-l ținem rezervat până vii.\n\nAlege mai jos 👇' },
  vip3: { label: 'Card VIP rezervat din reclamă fără nume', category: 'MARKETING', headerType: 'IMAGE', map: ['ramase'], buttons: 'lead', sample: { code: '', name: '', vip: true, credit: 30000 },
    body: 'Bună! 💎 Cardul tău VIP Transformarea 360 este rezervat:\nPlătești 9.900 lei și primești 30.000 lei în tratamente, pentru tine și cei dragi, valabil până pe 30 iunie 2027.\n\n🔥 Au mai rămas doar {{1}} carduri VIP, așa că ți-l țin rezervat 2 ore.\n\n✨ Dacă îl plătești acum online, ai 10% reducere: plătești 8.910 lei, plus acces în Clubul 360.\n\n🏥 Preferi să-l plătești în clinică? Îți facem o programare și ți-l ținem rezervat până vii.\n\nAlege mai jos 👇' },
  rezervat: { label: 'Card de Sărbători rezervat', headerType: 'IMAGE', map: ['suma', 'credit', 'locatie'], sample: { code: '', mark: 'Rezervat', name: '' },
    body: 'Bună! Ți-am rezervat Cardul de Sărbători de {{1}} lei, cu {{2}} lei în tratamente. Te sunăm în curând să stabilim când treci să-l plătești în clinica din {{3}}, cash sau card. Mulțumim!' },
  // the same, shorter and ending with a question, so the chat goes on (the owner, 21.11: „să se termine cu o întrebare ca să putem să-i dăm close”);
  // used once Meta approves it, until then the one above
  rezervat2: { label: 'Card de Sărbători rezervat 2', headerType: 'IMAGE', map: ['suma', 'credit', 'locatie'], sample: { code: '', mark: 'Rezervat', name: '' },
    body: 'Bună! Cardul tău de Sărbători de {{1}} lei e rezervat: primești {{2}} lei în tratamente, la clinica din {{3}}, valabil până pe 30 iunie 2027. Îl plătești când treci pe la noi, cash sau card. Când îți e mai ușor să vii, mâine sau în zilele următoare?' },
  // the payment she started and did not finish (the owner, 21.11): about an hour after, and once more a day later, with the
  // picture of her card (her name, no code: nothing is issued yet) and three buttons (recover, onWhatsApp below)
  // (no name in them: an online order is only her phone and her card, 21.11)
  rec1: { label: 'Card de Sărbători plată neterminată', category: 'MARKETING', headerType: 'IMAGE', map: ['credit'], buttons: 'rec', sample: { code: '', name: '' },
    body: 'Bună! Am văzut că ai vrut Cardul de Sărbători de {{1}} lei în tratamente, dar plata nu s-a finalizat. S-a blocat ceva? Îl poți plăti online sau îl rezervi și plătești în clinică. Alege mai jos ce preferi.' },
  // the first one, warmer and 10 minutes after her last step (the owner, 23.11: „scurt, drăguț, cu un emoji cute la final”);
  // used once Meta approves it, until then rec1
  rec1b: { label: 'Card de Sărbători plată neterminată 2', category: 'MARKETING', headerType: 'IMAGE', map: ['credit'], buttons: 'rec', sample: { code: '', name: '' },
    body: 'Hei! Am văzut că plata pentru Cardul tău de Sărbători de {{1}} lei în tratamente nu s-a terminat. Dacă ai avut vreo problemă, scrie-ne aici sau alege mai jos și te ajutăm imediat 🥰' },
  rec2: { label: 'Card de Sărbători mai sunt carduri', category: 'MARKETING', headerType: 'IMAGE', map: ['credit', 'carduri'], buttons: 'rec', sample: { code: '', name: '' },
    body: 'Bună! Încă poți lua Cardul de Sărbători de {{1}} lei în tratamente. Mai avem doar {{2}}, iar oferta se încheie pe 24 decembrie. Îl plătești online sau îl rezervi și plătești în clinică, alege mai jos.' },
  // paid online, the name comes after (the owner, 21.11): the payment received, „pe ce nume să fie cardul?” (askName)
  name: { label: 'Card de Sărbători pe ce nume', map: ['suma', 'credit'], buttons: 'name',
    body: 'Bună! Am primit plata ta de {{1}} lei pentru Cardul de Sărbători Centrul360, cu {{2}} lei în tratamente. Mulțumim! Pe ce nume să fie cardul? Alege mai jos.' },
};
// the buttons of the recovery messages (Meta: quick replies, at most 25 letters); what each does: onWhatsApp
const REC_BTN = { pay: 'Finalizez plata', clinic: 'Plătesc în clinică', no: 'Nu mai vreau' };
const NAME_BTN = { me: 'Pentru mine', gift: 'E cadou' };
const LEAD_BTN = { online: 'Plătesc online', clinic: 'Plătesc în clinică' };
// the templates the card's own messages need (the portal's „Mesaje WhatsApp: Automate”); the recovery ones apart
const CORE = ['card', 'sold', 'remind', 'rezervat'];
async function templates() {
  const WT = require('./wa-templates');
  const d = await WT.load();
  const out = {};
  Object.keys(TPL).forEach((k) => { out[k] = d.templates.find((t) => t.purpose === 'card-' + k) || null; });
  return { d, t: out };
}
// made once and sent to Meta (UTILITY), with the picture of a sample card for the one with an image; a refused one is
// sent again with the next clock. Returns what Meta says of each.
async function ensureTemplates() {
  const WT = require('./wa-templates');
  const { d, t } = await templates();
  let changed = false;
  const res = {};
  for (const k of Object.keys(TPL)) {
    let x = t[k];
    if (!x) {
      x = { id: 'card-' + k + '-' + crypto.randomUUID().slice(0, 6), purpose: 'card-' + k, label: TPL[k].label, name: '', language: 'ro', category: TPL[k].category || 'UTILITY',
        headerType: TPL[k].headerType || '', header: '', body: TPL[k].body, map: TPL[k].map, footer: 'Centrul360',
        buttons: TPL[k].buttons ? Object.values(TPL[k].buttons === 'rec' ? REC_BTN : TPL[k].buttons === 'lead' ? LEAD_BTN : NAME_BTN).map((text) => ({ type: 'QUICK_REPLY', text })) : [], meta: {}, updatedAt: nowISO() };
      if (x.headerType === 'IMAGE') {
        // the example Meta reviews: a sample card (its own when the template's card is another kind, e.g. „Rezervat”)
        const sm = TPL[k].sample;
        const buf = await require('./card-image').png(Object.assign({ credit: 2500, name: 'Andreea Popescu', code: 'C360-AB2C-DE3F', valid: VALID_TXT }, sm || {}));
        x.samplePath = sm ? 'wa-templates/card-sarbatori-' + k + '.png' : 'wa-templates/card-sarbatori-exemplu.png';
        await writeBinary(x.samplePath, buf, 'image/png');
      }
      d.templates.push(x); changed = true;
    }
    const st = WT.overall(x);
    if (st === 'DRAFT' || st === 'REJECTED' || Object.keys(x.meta || {}).length < (await WT.accounts()).list.length) {
      const s = await WT.submit(d, x.id).catch((e) => ({ error: e.message }));
      if (!s.error || s.partial) changed = true;
      res[k] = s.error ? 'eroare: ' + s.error : 'trimis la Meta';
    } else res[k] = st;
  }
  if (changed) await WT.save(d);
  return res;
}
// the message in the chat (Mesaje): the team sees what she got, with the picture
async function logChat(phone, city, name, text, media, id, extra) {
  try {
    const { normalizePhone } = require('./clients');
    const p = normalizePhone(phone) || String(phone || '');
    if (!p) return;
    const K = 'data/whatsapp-conversations.json';
    const conversations = await readJSON(K, []);
    let convo = conversations.find((c) => c.phone === p);
    if (!convo) { convo = { phone: p, clientName: name || p, location: city, lastMessageAt: nowISO(), unreadCount: 0, messages: [] }; conversations.push(convo); }
    convo.messages.push(Object.assign({ id: id || crypto.randomUUID(), direction: 'out', type: media ? 'image' : 'text', text, status: 'sent', timestamp: nowISO(), sentBy: null, sentByName: 'automat', auto: true },
      media ? { media: { kind: 'image', mime: 'image/png', filename: 'card.png', path: media } } : {}, extra || {}));
    convo.lastMessageAt = nowISO();
    await require('./wa-convos').saveConversations(conversations);
  } catch (e) { console.error('card chat log:', e.message); }
}
// one message to her: the approved template from her clinic's number, else (inside the 24 h window) a plain message;
// { sent, how: 'template' | 'direct', error }. opt: { path (the picture in the chat), only: 'template' (never the plain
// message: she did not write us, Meta would drop it), tag (fields kept on the chat message, e.g. the order it is about) }
async function say(kind, r, vars, text, png, code, opt) {
  opt = opt || {};
  const pic = png ? opt.path || imgPath(code) : '';
  const WA = require('./whatsapp'), WT = require('./wa-templates');
  const cfg = await WA.loadConfig();
  const ready = WA.readyNumbers(cfg);
  if (!ready.length) return { sent: false, error: 'WhatsApp nu e conectat' };
  const city = ready.includes(r.city) ? r.city : ready[0];
  const n = cfg.numbers[city];
  const { t } = await templates();
  const tpl = t[kind];
  const errs = [];
  if (tpl && WT.approvedFor(tpl, n.wabaId)) {
    let headerImageId;
    if (png && tpl.headerType === 'IMAGE') {
      const up = await WA.uploadMedia(city, png, 'image/png', 'card-' + code + '.png');
      if (up.error) errs.push('poza: ' + up.error); else headerImageId = up.id;
    }
    if (!(png && tpl.headerType === 'IMAGE') || headerImageId) {
      const x = await WA.sendWhatsApp({ phone: r.phone, template: (tpl.meta[n.wabaId] || {}).name || tpl.name, language: 'ro', params: tpl.map.map((k) => vars[k] || '-'), from: city, headerImageId });
      if (x.sent) { await logChat(r.phone, x.fromCity || city, r.name, text, pic, x.id, opt.tag); return { sent: true, how: 'template', city: x.fromCity || city }; }
      errs.push(x.error);
    }
  } else errs.push(tpl ? 'șablonul „' + tpl.label + '” nu e aprobat încă de Meta' : 'șablonul nu e făcut încă');
  if (opt.only === 'template') return { sent: false, error: errs.filter(Boolean).join(' · ').slice(0, 300), tpl: !(tpl && WT.approvedFor(tpl, n.wabaId)) };
  // not approved (or refused): a plain message, which Meta lets through only if she wrote us in the last 24 hours
  const y = png ? await WA.sendMedia({ phone: r.phone, from: city, buf: png, mime: 'image/png', filename: 'Cardul de Sarbatori.png', caption: text })
    : await WA.sendWhatsApp({ phone: r.phone, text, from: city });
  if (y.sent) { await logChat(r.phone, y.fromCity || city, r.name, text, pic, y.id, opt.tag); return { sent: true, how: 'direct', city: y.fromCity || city }; }
  errs.push(y.error);
  return { sent: false, error: errs.filter(Boolean).join(' · ').slice(0, 300) };
}
// the words of the card's message (the same as the template, with the gift and the Club when paid online)
// her first name for „Bună, …!”: the one on the order, else the one the portal or her WhatsApp knows (r.hint), letters only
const greetName = (r) => { const f = firstName(r.name || (r.hint !== NONAME ? r.hint : '')).replace(/[^\p{L}-]/gu, ''); return f.length >= 2 ? f.slice(0, 30) : ''; };
// the VIP one, in its messages (the template's {{4}} carries it): for her and all her family, the full review first
const VIP_WHAT = 'Cardul VIP e pentru tine și cei dragi și începe cu revizia completă și planul tău personal: te sunăm să o programăm.';
const cardWord = (r) => (isVip(r) ? 'Cardul VIP Transformarea 360' : 'Cardul de Sărbători');
function cardText(r, c) {
  const gf = giftFor(r, c);
  const extra = (isVip(r) ? VIP_WHAT + ' ' : '') + (r.bonus ? (gf ? 'Cadou: ' + gf + '. ' : '') + 'Locul tău în Clubul 360 e rezervat: ' + CLUB_URL + '?cod=' + c.code : 'Te așteptăm cu drag.');
  const g = greetName(r);
  return { vars: { prenume: g || 'dragă', credit: lei(c.value), cod: c.code, cadou: extra },
    text: 'Bună' + (g ? ', ' + g : '') + '! ' + (isVip(r) ? '💎 Cardul tău VIP Transformarea 360' : '🎁 Cardul tău de Sărbători') + ' Centrul360 este activ' + (c.recipient && c.recipient !== r.name ? ' (pe numele ' + c.recipient + ')' : '') + ':\n' +
      '• credit de ' + lei(c.value) + ' lei, pentru orice tratament la prețul de listă' + (isVip(r) ? ', pentru tine și cei dragi' : '') + '\n• cod ' + c.code + '\n• valabil până pe ' + VALID_TXT + '\n' +
      (isVip(r) ? '• începem cu revizia completă și planul tău personal: te sunăm să o programăm\n' : '') +
      (r.bonus ? (gf ? '• cadou: ' + gf + (gf === GIFT_TM ? ' (în clinica din Timișoara)' : '') + '\n' : '') + '• locul tău în Clubul 360 e rezervat: ' + CLUB_URL + '?cod=' + c.code + '\n' : '') +
      '\nPentru programare răspunde la acest mesaj. Mulțumim!' };
}
// her card, out on WhatsApp; what happened is kept on the card (the portal shows „de trimis manual” when it could not go)
async function deliver(r, c) {
  let png = null;
  try { png = await image(r, c); } catch (e) { c.sent = { at: nowISO(), how: '', error: 'poza cardului: ' + e.message }; return c.sent; }
  const m = cardText(r, c);
  const x = await say('card', r, m.vars, m.text, png, c.code).catch((e) => ({ sent: false, error: e.message }));
  c.sent = x.sent ? { at: nowISO(), how: x.how } : { at: nowISO(), how: '', error: x.error || 'netrimis' };
  return c.sent;
}

// ---- reserved on the site, to pay in the clinic (the owner, 21.11): right after, the template „rezervat” with the picture
// of her card marked „Rezervat” (no code, her name only if she gave one), from her clinic's number, once per order; only
// as the approved template (she did not write us); not approved yet: nothing goes, the order says why (r.rezMsg)
const fill = (k, vars) => TPL[k].body.replace(/\{\{(\d+)\}\}/g, (m, n) => vars[TPL[k].map[n - 1]] || '');
async function reservedMsg(id) {
  const list = await readJSON(KEY, []);
  const r = list.find((x) => x.id === id);
  if (!r || r.status !== 'rezervat' || r.rezMsg) return r ? r.rezMsg || null : null;
  norm(r);
  const vars = { suma: lei(r.amount), credit: lei(r.credit), locatie: r.city === 'Arad' ? 'Arad' : 'Timișoara' };
  let png = null, path = 'wa-out/card-rez-' + String(r.id).replace(/[^\w-]/g, '').slice(0, 36) + '.png';
  try {
    png = await require('./card-image').png({ credit: TIERS[r.tier] || r.credit, name: (r.cards[0] || {}).recipient || r.name || '', code: '', mark: 'Rezervat', valid: VALID_TXT, vip: isVip(r) });
    await writeBinary(path, png, 'image/png').catch(() => { path = ''; });
  } catch (e) { console.error('card reserved image:', e.message); }
  // the version ending with a question once approved for her number, else the first one
  const T2 = await templates().catch(() => ({ t: {} }));
  const kind = T2.t && T2.t.rezervat2 && require('./wa-templates').overall(T2.t.rezervat2) === 'APPROVED' ? 'rezervat2' : 'rezervat';
  const m = png ? await say(kind, r, vars, fill(kind, vars), png, '', { path, only: 'template', tag: { cardOrder: r.id, cardStep: 'rezervat' } }).catch((e) => ({ sent: false, error: e.message }))
    : { sent: false, error: 'poza cardului' };
  const rez = m.sent ? { at: nowISO(), how: m.how } : { at: nowISO(), skipped: m.tpl ? 'șablonul nu e aprobat încă' : String(m.error || 'netrimis').slice(0, 160) };
  const l2 = await readJSON(KEY, []);
  const x = l2.find((y) => y.id === id);
  if (x && !x.rezMsg) { x.rezMsg = rez; mark(x, 'rez_msg', rez.how ? 'ok' : 'netrimis: ' + rez.skipped); await writeJSON(KEY, l2); }
  return rez;
}

// ---- the payment in Încasări: once per order (a second call finds it); a refund row when a paid order is cancelled
const PAY_METHODS = ['card', 'cash', 'transfer'];
const saleOf = (sales, id) => (sales || []).find((x) => x && x.source === 'incasare' && x.cardOrderId === id && x.kind !== 'refund') || null;
async function recordSale(r, by) {
  const sales = await readJSON('data/sales.json', []);
  if (saleOf(sales, r.id)) return saleOf(sales, r.id);
  const amount = r2(Number(r.paidAmount) || Number(r.amount) || 0);
  if (!(amount > 0)) return null;
  const method = r.paidVia === 'online' ? 'card' : PAY_METHODS.includes(r.payMethod) ? r.payMethod : 'card';
  const entry = {
    id: crypto.randomUUID(), source: 'incasare', cardSale: true, label: isVip(r) ? 'Card VIP Transformarea 360' : 'Card de Sărbători', cardOrderId: r.id, online: r.paidVia === 'online', // online: a PayLink, never a POS terminal's
    employeeId: by || r.paidBy || 'card-sarbatori', performedBy: '', appointmentId: '', clientId: r.clientId || '', client: r.name || '',
    date: roDay(Date.parse(r.paidAt) || Date.now()), location: r.city || '', categories: [], category: '',
    treatment: (isVip(r) ? 'Card VIP Transformarea 360' : 'Card de Sărbători') + ' · plătești ' + (r.qty > 1 ? r.qty + ' × ' + lei(r.tier) : lei(Number(r.paidAmount) || Number(r.amount) || r.tier)) + ' lei' + (r.disc ? ' (10% reducere online)' : '') + ', credit ' + (r.qty > 1 ? r.qty + ' × ' : '') + lei(TIERS[r.tier]) + ' lei',
    amount, bookedAmount: 0, upsell: 0, method, split: null, status: 'recorded', commission: 0,
    note: (r.paidVia === 'online' ? 'Online (myPOS)' : 'În clinică') + ' · ' + r.cards.map((c) => c.code).filter(Boolean).join(', '),
    createdAt: nowISO(), decidedAt: null,
  };
  sales.push(entry);
  await writeJSON('data/sales.json', sales);
  return entry;
}
// a paid order cancelled (the owner): its cards go, the money goes back as a refund row in Încasări (never when a card was used)
async function voidPaid(id, session, reason) {
  const list = await readJSON(KEY, []);
  const r = list.find((x) => x.id === id);
  if (!r) return { error: 'not_found' };
  norm(r);
  if (r.status !== 'platit') return { error: 'not_paid' };
  if (r.cards.some((c) => usedOf(c) > 0 || (c.gift && c.gift.state === 'used'))) return { error: 'used' };
  const sales = await readJSON('data/sales.json', []);
  const sale = saleOf(sales, r.id);
  let refund = null;
  if (sale && !sales.some((x) => x.kind === 'refund' && x.refundOf === sale.id)) {
    refund = { id: crypto.randomUUID(), source: 'incasare', kind: 'refund', refundOf: sale.id, scope: 'payment', cardOrderId: r.id, cardSale: true, label: sale.label || 'Card de Sărbători',
      employeeId: session.employeeId || '', performedBy: '', appointmentId: '', clientId: sale.clientId || '', client: sale.client || '',
      date: roDay(Date.now()), location: sale.location || '', categories: [], category: '', treatment: 'Rambursare · ' + sale.treatment,
      amount: -Number(sale.amount), upsell: 0, method: sale.method === 'cash' || sale.method === 'transfer' ? sale.method : 'card', split: null, status: 'recorded', commission: 0,
      reason: String(reason || 'Card de Sărbători anulat').slice(0, 300), note: '', whole: true, from: [{ saleId: sale.id, key: 's', dueId: '', upsellId: '', lei: Number(sale.amount) }], dues: [], restCut: [],
      createdAt: nowISO(), decidedAt: null };
    sales.push(refund);
    await writeJSON('data/sales.json', sales);
  }
  Object.assign(r, { status: 'anulat', cancelledAt: nowISO(), cancelledBy: session.employeeId || '', voidedPaid: true, refundId: refund ? refund.id : '' });
  await writeJSON(KEY, list);
  return { ok: true, refund };
}
// the cards paid before their payments went to Încasări (21.11): each gets its payment once
async function backfillSales() {
  const list = await readJSON(KEY, []);
  const sales = await readJSON('data/sales.json', []);
  let n = 0;
  for (const r of list.filter((x) => x.status === 'platit' && !saleOf(sales, x.id))) { norm(r); if (await recordSale(r)) n++; }
  return n;
}

// ---- an order from the card block is her phone only (the owner, 21.11): the name on the card is asked once she paid (askName, on
// WhatsApp: „Pentru mine” / „E cadou”, then the name she writes: onWhatsApp), and after 6 hours with no answer the card
// goes without a name („Pentru tine” on it, its code), the desk can put one on it later (Schimbă numele, sent again)
const NONAME = 'Card de Sărbători, fără nume'; // her lead's name while we do not know hers
// a card ordered from the card block (online or reserved for the clinic) has no name: asked once paid
const needsName = (r) => ['site', 'meta-form'].includes(r.via) && !r.naming && !(r.cards || []).some((c) => c.recipient) &&
  (!r.name || (r.via === 'meta-form' && r.forWho === 'cadou'));
async function knownName(phone) {
  const k = d9(phone);
  if (k.length < 9) return '';
  const real = (n) => /\p{L}{2}/u.test(String(n || '')) && n !== NONAME; // a name, never a number or the placeholder
  const cl = (await readJSON('data/clients.json', []).catch(() => [])).find((c) => d9(c.phone) === k && real(c.name));
  if (cl) return String(cl.name).trim();
  const ld = (await readJSON('data/leads.json', []).catch(() => [])).filter((l) => d9(l.phone) === k && real(l.name)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  return ld ? String(ld.name).trim() : '';
}
// her lead made with NONAME gets her name once she says it
async function nameLead(r) {
  try {
    if (!r.name) return;
    const leads = await readJSON('data/leads.json', []);
    const l = leads.find((x) => (r.leadId && x.id === r.leadId) || (d9(x.phone) === d9(r.phone) && x.name === NONAME));
    if (l && l.name === NONAME) { l.name = r.name; await writeJSON('data/leads.json', leads); }
    const cl = await require('./clients').upsertClient({ name: r.name, phone: r.phone, location: r.city }, store);
    if (cl) r.clientId = cl.id;
  } catch (e) { console.error('card name lead:', e.message); }
}
// the cards out on WhatsApp, with the trail's line (how: the name she gave, or none)
async function sendCards(r, how) {
  for (const c of r.cards) await deliver(r, c).catch((e) => { c.sent = { at: nowISO(), how: '', error: e.message }; });
  const ok = r.cards.every((c) => c.sent && c.sent.how);
  mark(r, 'card_sent', (ok ? 'ok' : 'netrimis') + (how ? ', ' + how : ''));
  return ok;
}
// „Pe ce nume să fie cardul?” (the template, she did not write us yet); not sent: the card goes at once, with no name
async function askName(r) {
  const vars = { suma: lei(r.paidAmount || r.amount), credit: lei(r.credit) };
  const m = await say('name', r, vars, fill('name', vars), null, '', { only: 'template', tag: { cardOrder: r.id, cardStep: 'ask' } }).catch((e) => ({ sent: false, error: e.message }));
  if (m.sent) { r.naming = { at: nowISO(), state: 'asked' }; mark(r, 'ask_name', 'ok'); return true; }
  r.naming = { at: nowISO(), state: 'done', how: 'none', error: String(m.error || '').slice(0, 160) };
  mark(r, 'ask_name', 'netrimis: ' + String(m.error || '').slice(0, 100));
  await sendCards(r, 'fără nume');
  return false;
}

// ---- paid: the card is issued (once), the gift and the Club when online, her lead and file, the team, her WhatsApp
// via: 'online' | 'clinica'; o: { by (employee id), byName, match: { src, ref, at }, amount }
async function confirm(id, via, o) {
  o = o || {};
  const list = await readJSON(KEY, []);
  const r = list.find((x) => x.id === id);
  if (!r) return { error: 'not_found' };
  norm(r);
  if (r.status === 'platit') return { row: r, again: true };
  mark(r, 'paid', o.match ? 'auto' : 'manual'); recOf(r).stop = recOf(r).stop || 'paid';
  // no name yet: hers from our files (clients, then leads) when we have one; never asked on WhatsApp then
  if (needsName(r)) { const k = await knownName(r.phone).catch(() => ''); if (k) { r.name = k; r.nameFrom = 'fisa'; mark(r, 'named', 'fisa'); } }
  const nameless = needsName(r);
  if (!r.name && !r.hint) r.hint = await knownName(r.phone).catch(() => '');
  r.status = 'platit'; r.paidAt = nowISO(); r.paidVia = via === 'online' ? 'online' : 'clinica';
  r.paidBy = o.by || ''; if (o.byName) r.paidByName = o.byName;
  r.paidAmount = Number(o.amount) > 0 ? r2(o.amount) : r.amount;
  // online, what she really paid is the order's sum (a 10% order paid by the full link: the full sum)
  if (r.paidVia === 'online' && r.paidAmount !== r.amount) { mark(r, 'amount', r.amount + ' → ' + r.paidAmount); r.amount = r.paidAmount; r.disc = r.paidAmount === discOf(r.tier) && r.tier !== 290; }
  r.payMethod = r.paidVia === 'online' ? 'card' : PAY_METHODS.includes(o.method) ? o.method : 'card';
  if (o.match) r.match = o.match;
  r.bonus = r.paidVia === 'online';
  if (isVip(r) && !r.review) r.review = { state: 'todo', at: nowISO() }; // her full review and plan, booked by the desk (reviewNotice)
  delete r.bonusRestart; delete r.cancelledAt; delete r.cancelledBy;
  r.cards.forEach((c) => {
    if (!c.code) c.code = codeOf(list);
    c.value = TIERS[r.tier] || c.value;
    c.gift = r.bonus && !isVip(r) ? { what: giftShort(r.city), state: 'open' } : null; // the VIP: 10% off online, no gift
  });
  await writeJSON(KEY, list);
  // the money in Încasări, once (its own line there; the notice below is the only one)
  try { await recordSale(r, o.by && o.by !== 'myPOS' ? o.by : ''); } catch (e) { console.error('card sale:', e.message); }

  // the sale goes back to Meta (Conversions API), with what her browser told us when she ordered: Purchase, in RON
  try {
    const capi = require('./meta-capi');
    const t = r.track || {};
    await capi.soon(() => capi.laterEvent({ name: 'Purchase', eventId: 'purchase.' + r.id, phone: r.phone, leadId: r.leadId, url: t.url || r.page,
      custom: { value: r.paidAmount } }, t));
  } catch (e) { console.error('card purchase capi:', e.message); }

  // the Club's waiting list (online only), her lead and her client file
  if (r.bonus) await clubAdd({ name: r.name, phone: r.phone, city: r.city, code: r.cards[0].code, source: 'card' }).catch((e) => console.error('card club:', e.message));
  try {
    const note = (isVip(r) ? 'Card VIP Transformarea 360' : 'Card de Sărbători') + ' plătit ' + (r.paidVia === 'online' ? 'online' : 'în clinică') + ': ' + r.qty + ' × ' + r.tier + ' lei, credit ' + lei(r.credit) + ' lei · ' +
      r.cards.map((c) => c.code + (c.recipient ? ' (' + c.recipient + ')' : '')).join(', ') + (r.bonus ? (isVip(r) ? (r.disc ? ' · 10% reducere online' : '') : ' · cadou: ' + giftShort(r.city)) + ' · Clubul 360' : '');
    const L = await require('../portal-leads').createLead({ name: r.name || r.hint || NONAME, phone: r.phone, source: 'site', location: r.city, createdBy: 'card-sarbatori', interest: 'Card de Sărbători', note, authorLabel: 'Card de Sărbători', welcome: false, src: r.src });
    if (L && L.lead && !r.leadId) r.leadId = L.lead.id;
  } catch (e) { console.error('card lead:', e.message); }
  // her client file once we know her name (an online order: when she says it, nameLead)
  if (r.name || r.hint) { try { const cl = await require('./clients').upsertClient({ name: r.name || r.hint, phone: r.phone, location: r.city }, store); if (cl) r.clientId = cl.id; } catch (e) { console.error('card client:', e.message); } }

  // the desk (her clinic) and the owner
  try {
    const ids = [...new Set((await N.deskIds(store, r.city)).concat(await N.adminIds(store)))];
    const posPaid = r.paidVia === 'clinica' && r.payMethod === 'card' ? await N.claim(store, N.payRef('pos', r.paidAmount), true) : null;
    await N.notifyMany(store, ids, {
      kind: 'money', tone: 'good', go: 'carduri', tag: posPaid ? posPaid.tag : 'card-paid-' + r.id, quiet: !!posPaid, ref: r.paidVia === 'clinica' && r.payMethod === 'card' ? N.payRef('desk', r.paidAmount) : '',
      title: sarb(r.tier, r.amount) + ' · PLĂTIT' + (r.paidVia === 'online' ? ' ONLINE' : '') + N.cityTag(r.city),
      text: (r.name || r.hint || 'numele vine pe WhatsApp') + ' · ' + r.qty + ' × ' + r.tier + ' lei (credit ' + lei(r.credit) + ') · ' + r.cards.map((c) => c.code).join(', ') + (r.bonus ? (isVip(r) ? (r.disc ? ' · 10% reducere online' : '') + ' · + Clubul 360' : ' · + ' + giftShort(r.city) + ' și Clubul 360') : '') +
        (o.match ? ' · găsit automat în myPOS' : ''),
    });
  } catch (e) { console.error('card notify:', e.message); }
  // a VIP one: the desk books her full review and her plan (the card's row shows „Revizie: de programat / programată …”)
  if (isVip(r)) {
    try {
      await N.notifyMany(store, await N.deskIds(store, r.city), { kind: 'lead', tone: 'info', go: 'carduri', tag: 'card-review-' + r.id,
        title: sarb(r.tier, r.amount) + ' · REVIZIE DE PROGRAMAT' + N.cityTag(r.city),
        text: (r.name || r.hint || 'numele vine pe WhatsApp') + ' · sun-o să programați revizia completă și planul ei personal' });
    } catch (e) { console.error('card review notify:', e.message); }
  }

  // her cards on WhatsApp; paid online with no name yet: first the question of the name (askName)
  if (nameless) await askName(r).catch((e) => console.error('card ask name:', e.message));
  else await sendCards(r, '');
  // written back onto the newest list (another change may have come meanwhile)
  const l2 = await readJSON(KEY, []);
  const i = l2.findIndex((x) => x.id === r.id);
  if (i >= 0) { l2[i] = r; await writeJSON(KEY, l2); }
  return { row: r };
}

// ---- finding the payment by itself: a payment of the clinic's account that is not a POS payment, of the sum of an order
// sent to its PayLink, within 48 h after the order (the oldest order first, each payment once)
// pays = [{ ref, amount, at, src }]
// an order waiting for its money: sent to the PayLink, or one she gave up herself (a payment that comes anyway is hers)
// (an online order closed by a clinic reservation too: a payment that comes anyway is not lost)
const waits = (x) => x.status === 'asteptare' || (x.status === 'anulat' && (x.cancelledBy === 'ea' || x.cancelledBy === 'rezervare') && x.pay === 'online');
// Two orders or more of that sum waiting when a payment comes (the owner, 21.11): nothing is confirmed by itself, the
// payment waits in „De verificat” with the orders it could be (the desk looks at who paid in myPOS and taps the right one:
// pick). Once only one of them still waits (the others paid or cancelled), it is hers.
//   data/card-sarbatori-check.json  [{ id, ref, amount, at, src, found, cands: [order id], state: 'open' | 'done' | 'none',
//                                      order, doneAt, by }]
const CHECK = 'data/card-sarbatori-check.json';
// (a 10% order paid by the full link, or the other way, is hers too: both sums of her card)
const sumOk = (x, amount) => { const a = Number(amount); if (Math.abs(Number(x.amount) - a) < 0.01) return true; if (qtyOf(x) !== 1 || !DISC_TIERS.includes(Number(x.tier))) return false; return a === Number(x.tier) || a === discOf(x.tier); };
const candsOf = (list, amount, t) => list.filter((x) => waits(x) && !(x.checkout && !x.checkout.paylink) && sumOk(x, amount) && Date.parse(x.created) <= t + 5 * 60e3 && t - heldFrom(x) <= MATCH_MS)
  .sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
async function matchPayments(pays) {
  const list = await readJSON(KEY, []);
  const checks = await readJSON(CHECK, []).catch(() => []);
  const used = new Set(list.filter((r) => r.match && r.match.ref).map((r) => r.match.ref).concat(checks.map((c) => c.ref), list.filter((r) => r.checkout && r.checkout.scan).map((r) => r.checkout.scan)));
  const done = [], marks = [];
  let checksChanged = false;
  // the payments waiting in „De verificat” whose orders came down to one (or none)
  for (const c of checks.filter((x) => x.state === 'open' && x.why !== 'suma')) { // another sum than the order's: the desk decides
    const still = c.cands.filter((id) => { const x = list.find((y) => y.id === id); return x && waits(x); });
    if (still.length > 1) continue;
    checksChanged = true;
    if (!still.length) { Object.assign(c, { state: 'none', doneAt: nowISO() }); continue; }
    const x = await confirm(still[0], 'online', { by: 'myPOS', byName: 'myPOS (automat)', amount: c.amount, match: { src: c.src || 'mypos', ref: c.ref, at: c.at } });
    if (x.row) { Object.assign(c, { state: 'done', order: still[0], doneAt: nowISO(), by: 'auto' }); done.push({ id: still[0], ref: c.ref }); const y = list.find((z) => z.id === still[0]); if (y) y.status = 'platit'; }
  }
  // the checkout's payments (paid by myPOS's signed word, payPaid) show in the scans too: each one taken by its order, once
  const scanned = [];
  const viaCheckout = list.filter((x) => x.checkout && x.checkout.paidAt && x.match && x.match.src === 'checkout' && !x.checkout.scan);
  for (const p of (pays || []).slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    if (!p.ref || used.has(p.ref) || !(Number(p.amount) > 0)) continue;
    const t = Date.parse(p.at) || Date.now();
    const twin = viaCheckout.find((x) => !x.checkout.scan && Math.abs(Number(x.paidAmount) - Number(p.amount)) < 0.01 && Math.abs(Date.parse(x.checkout.paidAt) - t) < 6 * 3600e3);
    if (twin) { twin.checkout.scan = p.ref; used.add(p.ref); scanned.push([twin.id, p.ref]); continue; }
    // a payment of the shared checkout (its rows in the scan carry no order id of ours): left alone, judged again at the
    // next scan once the checkout has settled it (api/_lib/pay.js isCheckoutPayment, when that version is live)
    const PAY = require('./pay');
    if (typeof PAY.isCheckoutPayment === 'function' && await PAY.isCheckoutPayment({ ref: p.ref, amount: p.amount, at: p.at }).catch(() => false)) continue;
    const cands = candsOf(list, p.amount, t);
    const r = cands[0];
    if (!r) continue;
    used.add(p.ref);
    if (cands.length > 1) {
      checks.push({ id: crypto.randomUUID().slice(0, 12), ref: p.ref, amount: r2(p.amount), at: p.at, src: p.src || 'mypos', found: nowISO(), cands: cands.map((x) => x.id), state: 'open' });
      checksChanged = true;
      cands.forEach((x) => marks.push([x.id, cands.length]));
      continue;
    }
    r.status = 'matching'; // taken by this payment (written below by confirm)
    const x = await confirm(r.id, 'online', { by: 'myPOS', byName: 'myPOS (automat)', amount: p.amount, match: { src: p.src || 'mypos', ref: p.ref, at: p.at } });
    if (x.row) done.push({ id: r.id, ref: p.ref });
  }
  if (checksChanged) await writeJSON(CHECK, checks.slice(-200));
  if (scanned.length) { const l3 = await readJSON(KEY, []); scanned.forEach(([id, ref]) => { const x = l3.find((y) => y.id === id); if (x && x.checkout) x.checkout.scan = ref; }); await writeJSON(KEY, l3); }
  if (marks.length) {
    const l2 = await readJSON(KEY, []);
    marks.forEach(([id, n]) => { const x = l2.find((y) => y.id === id); if (x) mark(x, 'check', String(n)); });
    await writeJSON(KEY, l2);
  }
  return done;
}
// the desk's tap in „De verificat”: this payment is hers (after looking at who paid in myPOS)
async function pick(checkId, orderId, o) {
  const checks = await readJSON(CHECK, []);
  const c = checks.find((x) => x.id === checkId);
  if (!c || c.state !== 'open') return { error: 'not_open' };
  if (!c.cands.includes(orderId)) return { error: 'not_candidate' };
  const x = await confirm(orderId, 'online', Object.assign({}, o, { amount: c.amount, match: { src: c.src || 'mypos', ref: c.ref, at: c.at, picked: true } }));
  if (x.error) return x;
  const l2 = await readJSON(CHECK, []);
  const c2 = l2.find((y) => y.id === checkId);
  if (c2) { Object.assign(c2, { state: 'done', order: orderId, doneAt: nowISO(), by: (o && o.by) || '' }); await writeJSON(CHECK, l2); }
  return x;
}
// an order confirmed by hand that waits in „De verificat”: that payment is taken by it
async function openCheckOf(orderId) {
  const checks = await readJSON(CHECK, []).catch(() => []);
  return checks.filter((x) => x.state === 'open' && x.cands.includes(orderId)).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0] || null;
}
async function openChecks() { return (await readJSON(CHECK, []).catch(() => [])).filter((x) => x.state === 'open'); }
// the clinic's myPOS account: the payments that are not a POS terminal's (the PayLinks), the last days; a probe of what
// myPOS gives (counts and field names only, never a name, a card or a reference) is kept for the check
async function scanMypos(days, opts) {
  const M = require('./mypos');
  const conn = await M.loadConn(readJSON);
  if (!M.connected(conn)) return { ok: false, error: 'not_connected' };
  const now = Date.now();
  const raw = await M.listTransactions(conn, now - (days || 3) * 86400e3, now);
  const tids = new Set((conn.devices || []).map((d) => d.tid));
  const probe = { at: nowISO(), days: days || 3, read: raw.length, groups: {}, fields: [], tierSums: 0 };
  const fields = new Set();
  const pays = [];
  const sums = new Set([290, 490, 990, 580, 980, 1980, 870, 1470, 2970, 9900, 441, 891, 8910].map(String));
  for (const t of raw) {
    Object.keys(t || {}).forEach((k) => fields.add(k));
    const type = String(t.transaction_type || '').padStart(3, '0');
    const tid = String(t.terminal_id || '');
    const pos = !!tid && (!tids.size || tids.has(tid));
    const cur = String(t.transaction_currency || t.original_currency || '');
    const amt = Math.abs(Number(String(t.original_currency === 'RON' ? t.original_amount : t.transaction_amount).replace(',', '.')) || 0);
    const sign = String(t.sign || t.direction || t.debit_credit || '').toLowerCase();
    const g = type + (tid ? (pos ? ' pos' : ' alt-terminal') : ' fără-terminal') + ' ' + cur + (sign ? ' ' + sign : '');
    probe.groups[g] = (probe.groups[g] || 0) + 1;
    if (sums.has(String(Math.round(amt)))) probe.tierSums++;
    // a refund, a fee or money going out is never a card paid
    if (pos || ['011'].includes(type) || /debit|^d$|out/.test(sign) || Number(t.transaction_amount) < 0) continue;
    if (cur && cur !== 'RON' && t.original_currency !== 'RON') continue;
    const at = Date.parse(t.date);
    pays.push({ ref: 'mypos-' + String(t.payment_reference || t.id || (type + '-' + t.date + '-' + amt)), amount: r2(amt), at: Number.isFinite(at) ? new Date(at).toISOString() : nowISO(), src: 'mypos' });
  }
  probe.fields = [...fields].sort();
  probe.online = pays.length;
  if (opts && opts.events) { try { probe.events = await M.listEvents(conn); } catch (e) { probe.events = 'eroare: ' + (e.code || e.message); } }
  await writeJSON(PROBE, probe, { quiet: true }).catch(() => 0);
  return { ok: true, pays, probe };
}
// on the clock and when the team opens the cards: only while an order waits for its payment
async function autoMatch(force) {
  const list = await readJSON(KEY, []);
  const waiting = list.filter((r) => waits(r) && Date.now() - heldFrom(r) < MATCH_MS);
  if (!waiting.length && !force) return { waiting: 0 };
  const last = await readJSON('data/card-sarbatori-scan.json', {}).catch(() => ({}));
  if (!force && last.at && Date.now() - Date.parse(last.at) < 3 * 60e3) return { waiting: waiting.length, skipped: 'recent' };
  await writeJSON('data/card-sarbatori-scan.json', { at: nowISO() }, { quiet: true }).catch(() => 0);
  const s = await scanMypos(3).catch((e) => ({ ok: false, error: e.code || e.message }));
  if (!s.ok) return { waiting: waiting.length, error: s.error };
  return { waiting: waiting.length, matched: await matchPayments(s.pays), seen: s.pays.length };
}

// ---- myPOS's own notification (IPCPurchaseNotify), if the PayLink's store sends one to /api/card-notify: only with a
// signature that holds (myPOS's certificate in MYPOS_PUBLIC_CERT), the sum of an order waiting for it
function signed(pairs) {
  const cert = String(process.env.MYPOS_PUBLIC_CERT || '').replace(/\\n/g, '\n').trim();
  if (!cert) return null;
  const sig = (pairs.find((p) => p[0] === 'Signature') || [])[1] || '';
  const data = Buffer.from(pairs.filter((p) => p[0] !== 'Signature').map((p) => p[1]).join('-'), 'utf8').toString('base64');
  try { return crypto.createVerify('RSA-SHA256').update(data).verify(cert, sig, 'base64'); } catch (e) { return false; }
}
async function notified(pairs) {
  const b = Object.fromEntries(pairs);
  if (b.IPCmethod !== 'IPCPurchaseNotify') return { ignored: b.IPCmethod || 'none' };
  const ok = signed(pairs);
  if (ok !== true) return { refused: ok === null ? 'no_certificate' : 'signature' };
  if (String(b.Currency || '').toUpperCase() !== 'RON') return { refused: 'currency' };
  const m = await matchPayments([{ ref: 'ipn-' + String(b.IPC_Trnref || b.OrderID || ''), amount: Number(b.Amount), at: nowISO(), src: 'ipn' }]);
  return { paid: m.length > 0 };
}

// ---- the credit used: the treatments done (from the price list, at list price) or typed, the gift as its own line
// items: [{ name, amount, kind }]; never below 0: what is over the credit she pays on top (rest)
async function redeem(code, input, session) {
  const list = await readJSON(KEY, []);
  const f = findCard(list, code);
  if (!f) return { error: 'not_found' };
  const { r, c } = f;
  const st = stateOf(r, c);
  if (st === 'expirat') return { error: 'expired' };
  if (r.status !== 'platit') return { error: 'not_paid' };
  const items = (Array.isArray(input.items) ? input.items : []).slice(0, 12).map((x) => ({
    name: String(x.name || '').replace(/[<>]/g, '').trim().slice(0, 120), amount: Math.max(0, r2(x.amount)), kind: x.kind === 'gift' ? 'gift' : 'credit' }))
    .filter((x) => x.name && (x.kind === 'gift' || x.amount > 0));
  if (!items.length) return { error: 'no_items' };
  const gift = items.find((x) => x.kind === 'gift');
  if (gift) { if (!c.gift || c.gift.state !== 'open') return { error: 'no_gift' }; gift.amount = 0; gift.name = c.gift.what; }
  const total = r2(items.filter((x) => x.kind === 'credit').reduce((n, x) => n + x.amount, 0));
  const left = leftOf(c);
  if (total > 0 && left <= 0) return { error: 'empty' };
  const applied = Math.min(total, left);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || '')) ? input.date : roDay(Date.now());
  const emps = await readJSON('data/employees.json', []);
  const perf = emps.find((e) => e.id === String(input.performer || ''));
  const claim = { id: crypto.randomUUID().slice(0, 12), at: nowISO(), date, city: ['Timișoara', 'Arad'].includes(input.city) ? input.city : r.city,
    by: session.employeeId || '', byName: (emps.find((e) => e.id === session.employeeId) || {}).name || (session.employeeId === 'admin' ? 'Admin' : ''),
    performer: perf ? perf.id : '', performerName: perf ? perf.name : String(input.performerName || '').slice(0, 80), items, applied, rest: r2(total - applied),
    // who used it (a card for all her family, the VIP: anyone she gives it to), as the desk writes it; optional
    usedBy: String(input.usedBy || '').replace(/[<>]/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80) };
  if (!claim.usedBy) delete claim.usedBy;
  c.claims.push(claim);
  if (gift) c.gift = Object.assign({}, c.gift, { state: 'used', usedAt: claim.at });
  await writeJSON(KEY, list);
  // her new balance on WhatsApp (only when credit came off)
  let msg = null;
  if (applied > 0) {
    const vars = { prenume: firstName(r.name), folosit: lei(applied), cod: c.code, sold: lei(leftOf(c)) };
    const text = 'Bună, ' + firstName(r.name) + '! Am folosit ' + lei(applied) + ' lei din ' + (isVip(r) ? 'Cardul tău VIP ' : 'Cardul tău de Sărbători ') + c.code + '. Pe card mai ai ' + lei(leftOf(c)) + ' lei, valabili până pe ' + VALID_TXT + '. Mulțumim!';
    msg = await say('sold', r, vars, text, null, c.code).catch((e) => ({ sent: false, error: e.message }));
    claim.msg = msg.sent ? { how: msg.how } : { error: msg.error };
    const l2 = await readJSON(KEY, []);
    const f2 = findCard(l2, c.code);
    if (f2) { const k = f2.c.claims.find((x) => x.id === claim.id); if (k) k.msg = claim.msg; await writeJSON(KEY, l2); }
  }
  return { ok: true, claim, left: leftOf(c), msg };
}
// the last claim undone (the owner only): the credit and the gift come back
async function undo(code, session) {
  const list = await readJSON(KEY, []);
  const f = findCard(list, code);
  if (!f) return { error: 'not_found' };
  const last = f.c.claims.filter((x) => !x.undone).slice(-1)[0];
  if (!last) return { error: 'nothing' };
  last.undone = { at: nowISO(), by: session.employeeId || '' };
  if (last.items.some((x) => x.kind === 'gift') && f.c.gift) f.c.gift = Object.assign({}, f.c.gift, { state: 'open', usedAt: '' });
  await writeJSON(KEY, list);
  return { ok: true, left: leftOf(f.c) };
}

// ---- Clubul 360's waiting list: [{ id, at, name, phone, city, code (her card's), holder, source: 'card' | 'site' }]
async function clubAdd(o) {
  const list = await readJSON(CLUB, []);
  const k = d9(o.phone);
  let row = k.length === 9 ? list.find((x) => d9(x.phone) === k) : null;
  const cards = await readJSON(KEY, []);
  const card = o.code ? findCard(cards, o.code) : null;
  const holder = !!(card && card.r.status === 'platit') || o.source === 'card' ||
    cards.some((r) => r.status === 'platit' && d9(r.phone) === k);
  if (row) {
    if (holder && !row.holder) { row.holder = true; row.code = row.code || (card ? card.c.code : String(o.code || '')); }
    if (o.name && !row.name) row.name = o.name;
    await writeJSON(CLUB, list);
    return { row, again: true, place: list.indexOf(row) + 1 };
  }
  row = { id: crypto.randomUUID().slice(0, 12), at: nowISO(), name: String(o.name || '').slice(0, 100), phone: String(o.phone || ''), city: o.city || '', code: card ? card.c.code : '', holder, source: o.source || 'site' };
  list.push(row);
  await writeJSON(CLUB, list);
  return { row, place: list.length };
}

// ---- reminders (only to cards paid with credit left): 14 days after it is active with no booking, and 60 / 30 / 7 days
// before 30.06.2027 („Mai ai X lei pe card până pe 30 iunie”). Once each, from 09 to 20 (Romania).
async function reminders(now) {
  const t = now || Date.now();
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t)));
  if (h < 9 || h > 20 || expired(t)) return { sent: 0 };
  const list = await readJSON(KEY, []);
  const appts = await readJSON('data/appointments.json', []);
  const toEnd = (Date.parse(VALID_UNTIL) - t) / 86400e3;
  const due = [];
  for (const r of list) {
    if (norm(r).status !== 'platit') continue;
    for (const c of r.cards) {
      if (leftOf(c) <= 0) continue;
      c.remind = c.remind || {};
      let k = '';
      if (toEnd <= 7) k = 'e7'; else if (toEnd <= 30) k = 'e30'; else if (toEnd <= 60) k = 'e60';
      if (k && c.remind[k]) k = '';
      if (!k && !c.remind.d14 && t - Date.parse(r.paidAt) >= 14 * 86400e3) {
        const booked = appts.some((a) => a && d9(a.clientPhone) === d9(r.phone) && a.status !== 'anulata' && Date.parse(a.createdAt || a.date) >= Date.parse(r.paidAt));
        if (!booked) k = 'd14'; else c.remind.d14 = 'programată';
      }
      if (k) due.push({ r, c, k });
    }
  }
  let sent = 0;
  for (const x of due.slice(0, 6)) {
    const { r, c, k } = x;
    const vars = { prenume: firstName(r.name), sold: lei(leftOf(c)), cod: c.code };
    const text = k === 'd14'
      ? 'Bună, ' + firstName(r.name) + '! Pe ' + (isVip(r) ? 'Cardul tău VIP ' : 'Cardul tău de Sărbători ') + c.code + ' ai ' + lei(leftOf(c)) + ' lei pentru orice tratament la prețul de listă: remodelare corporală, tratamente faciale, epilare laser. Spune-ne ce ți-ar plăcea și îți găsim o oră. Răspunde la acest mesaj.'
      : 'Bună, ' + firstName(r.name) + '! Mai ai ' + lei(leftOf(c)) + ' lei pe ' + (isVip(r) ? 'Cardul VIP ' : 'Cardul de Sărbători ') + c.code + ' până pe 30 iunie. Răspunde la acest mesaj și îți facem programarea.';
    const m = await say('remind', r, vars, text, null, c.code).catch((e) => ({ sent: false, error: e.message }));
    c.remind[k] = m.sent ? nowISO() : 'netrimis: ' + String(m.error || '').slice(0, 120);
    if (m.sent) sent++;
  }
  if (due.length || list.some((r) => r.cards && r.cards.some((c) => c.remind && c.remind.d14 === 'programată'))) await writeJSON(KEY, list);
  return { sent, due: due.length };
}

// ---- the payment she started and did not finish (the owner, 21.11)
// On the site: back on the page unpaid, a small window asks what happened (v2/cs-buy.js → back, answer). On WhatsApp
// (recover): 30 to 90 minutes after the order „plata nu s-a finalizat” (rec1), and about a day later once more with the
// cards left and the 24 December deadline (rec2), both with her card's picture and three buttons. Each at most once per
// order, never from 21:00 to 09:00 in Romania (it waits for 09:00), only as an approved template (she did not write us: a
// plain message would not reach her). Nothing more goes once she paid, moved it to the clinic, said no, wrote anything,
// ordered again, the sale is over or no card is left. Her buttons (onWhatsApp): „Finalizez plata” (the PayLink of her
// card, her hold started again), „Plătesc în clinică” (a reservation, like the site's), „Nu mai vreau” (cancelled, thanks).
const REASONS = ['retry', 'declined', 'nocard', 'confusing', 'clinic', 'no'];
const REC_KEY = 'data/card-sarbatori-rec.json'; // { at } the last run, so the hourly clock knows the 5-minute one works
const roHour = (t) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t)));
const quiet = (t) => { const h = roHour(t); return h < 9 || h >= 21; };
// 09:00 (Romania) when t is at night: in quarters of an hour to the first awake one, then back minute by minute
const awake = (t) => {
  if (!quiet(t)) return t;
  let x = t;
  for (let i = 0; i < 60 && quiet(x); i++) x += 15 * 60e3;
  for (let i = 0; i < 15 && !quiet(x - 60e3); i++) x -= 60e3;
  return x;
};
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const hasReason = (r) => (r.trail || []).some((x) => x.ev === 'reason');
// „Mai avem doar 6 carduri” / „un singur card” / „20 de carduri”
const cardsLeft = (n) => (n === 1 ? 'un singur card' : (n >= 20 && (n % 100 === 0 || n % 100 >= 20) ? n + ' de carduri' : n + ' carduri'));
const ADDR = { 'Timișoara': 'Str. Bucegi 7, Timișoara', Arad: 'Str. Ioan Alexandru 16-18, Arad' };
const pubRes = (r) => ({ id: r.id, city: r.city, recipient: r.recipient, tier: r.tier, qty: r.qty, amount: r.amount, credit: r.credit, names: (r.cards || []).map((c) => c.recipient), pay: r.pay, status: r.status });
const openOnline = (r) => r.pay === 'online' && (r.status === 'asteptare' || (r.status === 'anulat' && r.cancelledBy === 'ea'));

// an order by its id, or by the id her browser made for a second tap of the same order (api/card-sarbatori.js: same.ids)
const byId = (list, id) => list.find((x) => x.id === id) || list.find((x) => (x.ids || []).includes(id));
// her hold started again (2 h) when a card is still there for her: 'ok' | 'sold_out' | 'closed'
async function rehold(list, r, now) {
  const t = now || Date.now();
  if (t >= Date.parse(DEADLINE)) return 'closed';
  if (r.status === 'asteptare' && live(r, t)) return 'ok';
  const c = await stockFor(list.filter((x) => x !== r), r.tier, r.city, qtyOf(r), t);
  if (!c.ok) return c.error === 'closed' ? 'closed' : 'sold_out';
  if (r.status === 'anulat') { delete r.cancelledAt; delete r.cancelledBy; }
  r.status = 'asteptare'; r.held = new Date(t).toISOString();
  return 'ok';
}

// back on the site with the order of this tab, not paid: { ask } says whether to ask her (once: not after an answer)
async function back(id) {
  await autoMatch().catch(() => null); // a payment that just came in is found first (at most every 3 minutes)
  const list = await readJSON(KEY, []);
  const r = byId(list, id);
  if (!r) return { error: 'not_found' };
  norm(r);
  if (r.status === 'platit') return { ok: true, paid: true };
  if (r.status !== 'asteptare' || r.pay !== 'online') return { ok: true, gone: true };
  if ((await openChecks()).some((c) => c.cands.includes(r.id))) return { ok: true, checking: true }; // maybe hers: no question
  const t = Date.now(), last = (r.trail || []).slice(-1)[0];
  if (!(last && last.ev === 'returned' && t - Date.parse(last.at) < 10 * 60e3)) { mark(r, 'returned'); await writeJSON(KEY, list); }
  return { ok: true, ask: !hasReason(r), nophone: !r.phone, tier: r.tier, credit: r.credit, amount: r.amount, city: r.city, held: live(r, t), until: live(r, t) ? new Date(heldFrom(r) + HOLD_MS).toISOString() : '' };
}
// her answer in that window: retry → { link }; clinic → { reservation }; the others are only written down. An order of the
// checkout closed before her phone came: „clinic” takes the phone she writes in that window (else { error: 'bad_phone' })
async function answer(id, reason, phone) {
  if (!REASONS.includes(reason)) return { error: 'bad_reason' };
  const list = await readJSON(KEY, []);
  const r = byId(list, id);
  if (!r) return { error: 'not_found' };
  norm(r);
  if (r.status === 'platit') return { ok: true, paid: true };
  if (r.status === 'rezervat' && reason === 'clinic') return { ok: true, again: true, reservation: pubRes(r) };
  if (!openOnline(r)) return { error: 'not_open' };
  const last = (r.trail || []).filter((x) => x.ev === 'reason').slice(-1)[0];
  const again = !!(last && last.note === reason && Date.now() - Date.parse(last.at) < 60e3); // a second tap: written once
  if (!again) mark(r, 'reason', reason);
  // the same order, now paid in the clinic (no form: her phone is on it), the desk hears it
  if (reason === 'clinic') {
    if (!r.phone) {
      const { normalizePhone } = require('./clients');
      let p = normalizePhone(cleanText(phone, 30)) || '';
      if (/^7\d{8}$/.test(p)) p = '0' + p;
      if (!/^07\d{8}$/.test(p)) { await writeJSON(KEY, list); return { error: 'bad_phone' }; }
      r.phone = p; mark(r, 'contact', 'la rezervare');
    }
    await writeJSON(KEY, list); return toClinic(id, 'site');
  }
  if (reason === 'retry') {
    const h = await rehold(list, r);
    const link = h === 'ok' ? await linkOf(r) : null;
    if (link && !again) mark(r, 'to_paylink');
    await writeJSON(KEY, list);
    return link ? { ok: true, link } : { error: h === 'ok' ? 'no_link' : h };
  }
  if (reason === 'no' && r.status === 'asteptare') { Object.assign(r, { status: 'anulat', cancelledAt: nowISO(), cancelledBy: 'ea' }); recOf(r).stop = 'no'; mark(r, 'cancelled', 'ea'); }
  await writeJSON(KEY, list);
  return { ok: true };
}
// ---- one card, not two (the owner, 21.11): a clinic reservation made while the same phone has an open online order of the
// same card, not paid: that online order is closed (its card back on the counter, no more recovery messages), the line
// „înlocuită de rezervarea în clinică” on it. A payment that comes for it anyway is still found (waits).
const replaceable = (x, r) => x !== r && x.id !== r.id && x.status === 'asteptare' && x.pay === 'online' && d9(x.phone) === d9(r.phone) && Number(x.tier) === Number(r.tier);
function supersede(list, r) {
  let n = 0;
  (list || []).filter((x) => replaceable(x, r)).forEach((x) => {
    Object.assign(x, { status: 'anulat', cancelledAt: nowISO(), cancelledBy: 'rezervare', replacedBy: r.id });
    recOf(x).stop = 'replaced';
    mark(x, 'cancelled', 'înlocuită de rezervarea în clinică');
    n++;
  });
  if (n) mark(r, 'replaced', String(n));
  return n;
}
// once, on the clock: the orders already like that (an online order, then a clinic reservation of the same card from the
// same phone, both open); data/card-sarbatori-supersede.json { at, n } says it ran
const SUPERSEDE = 'data/card-sarbatori-supersede.json';
async function supersedeOnce() {
  const done = await readJSON(SUPERSEDE, null).catch(() => null);
  if (done && done.at) return { done: done.at };
  const list = await readJSON(KEY, []);
  let n = 0;
  list.filter((r) => r.status === 'rezervat' && r.pay === 'clinica').forEach((r) => {
    const older = list.filter((x) => replaceable(x, r) && Date.parse(x.created) < Date.parse(r.created));
    if (older.length) n += supersede(older.concat([r]), r);
  });
  if (n) await writeJSON(KEY, list);
  await writeJSON(SUPERSEDE, { at: nowISO(), n }, { quiet: true });
  return { n };
}

// ---- „Adaugă cerere” in the portal (the owner, 21.11): a request taken by the desk, like a clinic reservation from the site
// (status rezervat, paid in the clinic, via 'portal', who added it on its trail); no card, no code, nothing paid, its cards
// held like a reservation; „Confirmă plata” issues them later. input: { name, phone, city, tier, qty, forWho, names, note,
// send (the „rezervat” WhatsApp, default on) } → { ok, reservation, msg } | { error, order? } (exists: her open order)
async function request(input, session, byName) {
  const i = input || {};
  const { normalizePhone } = require('./clients');
  const name = cleanText(i.name, 100);
  let phone = normalizePhone(cleanText(i.phone, 30)) || '';
  if (/^7\d{8}$/.test(phone)) phone = '0' + phone;
  const city = ['Timișoara', 'Arad'].find((c) => fold(c) === fold(i.city)) || '';
  const tier = Number(i.tier), qty = Number(i.qty) || 1;
  if (name.length < 2) return { error: 'missing_name' };
  if (!(/^07\d{8}$/.test(phone) || /^[1-9]\d{10,14}$/.test(phone))) return { error: 'bad_phone' };
  if (!city) return { error: 'missing_city' };
  if (!TIERS[tier]) return { error: 'bad_tier' };
  if (!Number.isInteger(qty) || qty < 1 || qty > MAXQ) return { error: 'bad_qty' };
  const now = Date.now();
  if (now >= Date.parse(DEADLINE)) return { error: 'closed' };
  const gift = i.forWho === 'cadou';
  const names = Array.from({ length: qty }, (_, k) => (gift ? cleanText((Array.isArray(i.names) ? i.names : [])[k], 80) : ''));
  const list = await readJSON(KEY, []);
  // her open order: shown, not a second one (an online one of the same card, not paid, is replaced instead)
  const k9 = d9(phone);
  const open = list.filter((r) => d9(r.phone) === k9 && (r.status === 'rezervat' || r.status === 'lead' || (r.status === 'asteptare' && live(r, now) && Number(r.tier) !== tier)))
    .sort((a, b) => Date.parse(b.created) - Date.parse(a.created))[0];
  if (open) return { error: 'exists', order: { id: open.id, created: open.created, status: open.status, pay: open.pay, tier: open.tier, qty: qtyOf(open), amount: open.amount, city: open.city, name: open.name || '' } };
  const entry = { id: crypto.randomUUID(), created: nowISO(), name, phone, city, tier, qty, amount: tier * qty, credit: TIERS[tier] * qty, forWho: gift ? 'cadou' : 'eu',
    cards: names.map((n) => ({ code: '', recipient: n })), recipient: names[0] || '', status: 'rezervat', via: 'portal', pay: 'clinica', addedBy: (session && session.employeeId) || '', nameFrom: 'receptie',
    note: cleanText(i.note, 300) };
  mark(entry, 'created', 'portal' + (byName ? ': ' + byName : ''));
  const replaced = supersede(list, entry);
  const c0 = await stockFor(list, tier, city, qty, now);
  if (!c0.ok) return { error: c0.error, left: c0.left };
  list.push(entry);
  await writeJSON(KEY, list);
  try {
    const note = 'Card de Sărbători rezervat din portal' + (byName ? ' (' + byName + ')' : '') + ', plata în clinică: ' + qty + ' × ' + tier + ' lei (credit ' + TIERS[tier] + ' lei fiecare), de plată ' + (tier * qty) + ' lei' +
      (names.some(Boolean) ? ' · pe numele: ' + names.map((n) => n || '(al ei)').join(', ') : '') + (entry.note ? ' · ' + entry.note : '');
    const L = await require('../portal-leads').createLead({ name, phone, source: 'telefon', location: city, createdBy: 'card-sarbatori', interest: 'Card de Sărbători', note, authorLabel: 'Portal · Card de Sărbători', welcome: false });
    if (L && L.lead) { const l2 = await readJSON(KEY, []); const x = l2.find((y) => y.id === entry.id); if (x) { x.leadId = L.lead.id; await writeJSON(KEY, l2); } }
  } catch (e) { console.error('card request lead:', e.message); }
  const msg = i.send === false ? null : await reservedMsg(entry.id).catch((e) => ({ skipped: e.message }));
  return { ok: true, reservation: pubRes(entry), replaced, msg };
}

// „Editează” in the portal (the owner, 21.11): an open order (reserved, waiting for its online payment, a lead) changed by the
// desk: name, phone, clinic, the card and how many (only while unpaid; the cards left checked again), for her or a gift, the
// names on the cards, the note; a trail line „modificată de …”. A paid card keeps only its rename.
async function editOrder(id, input, byName) {
  const i = input || {};
  const list = await readJSON(KEY, []);
  const r = list.find((x) => x.id === id);
  if (!r) return { error: 'not_found' };
  norm(r);
  if (!['rezervat', 'asteptare', 'lead'].includes(r.status)) return { error: 'not_open' };
  const { normalizePhone } = require('./clients');
  const name = cleanText(i.name == null ? r.name : i.name, 100);
  let phone = normalizePhone(cleanText(i.phone == null ? r.phone : i.phone, 30)) || '';
  if (/^7\d{8}$/.test(phone)) phone = '0' + phone;
  const city = ['Timișoara', 'Arad'].find((c) => fold(c) === fold(i.city == null ? r.city : i.city)) || '';
  const tier = Number(i.tier == null ? r.tier : i.tier), qty = Number(i.qty == null ? r.qty : i.qty);
  if (name && name.length < 2) return { error: 'missing_name' };
  if (!(/^07\d{8}$/.test(phone) || /^[1-9]\d{10,14}$/.test(phone))) return { error: 'bad_phone' };
  if (!city) return { error: 'missing_city' };
  if (!TIERS[tier]) return { error: 'bad_tier' };
  if (!Number.isInteger(qty) || qty < 1 || qty > MAXQ || (r.pay !== 'clinica' && qty !== 1)) return { error: 'bad_qty' }; // a PayLink is one card
  // more cards: only when they are left (its own cards counted as hers)
  // (a VIP one: of her clinic; to or from a VIP one, the other stock)
  if (qty > qtyOf(r) || isVip(tier) !== isVip(r) || (isVip(tier) && city !== r.city)) {
    const c = await stockFor(list.filter((x) => x !== r), tier, city, qty);
    if (!c.ok) return { error: c.error === 'closed' ? 'sold_out' : c.error, left: c.left };
  }
  const gift = i.forWho == null ? r.forWho === 'cadou' : i.forWho === 'cadou';
  const given = Array.isArray(i.names) ? i.names : r.cards.map((c) => c.recipient);
  const names = Array.from({ length: qty }, (_, k) => (gift ? cleanText(given[k], 80) : ''));
  if (name !== r.name) r.nameFrom = 'receptie';
  Object.assign(r, { name, phone, city, tier, qty, amount: tier * qty, credit: TIERS[tier] * qty, forWho: gift ? 'cadou' : 'eu', recipient: names[0] || '',
    cards: names.map((n) => ({ code: '', recipient: n })), note: i.note == null ? r.note || '' : cleanText(i.note, 300) });
  mark(r, 'edited', byName ? 'de ' + byName : '');
  await writeJSON(KEY, list);
  return { ok: true, reservation: pubRes(r) };
}

// an online order she moves to the clinic (how: site, whatsapp, portal): reserved like the site's „Rezerv și plătesc în
// clinică” (only the credit, no gift), her lead and its alert, and the desk hears it
async function toClinic(id, how) {
  const list = await readJSON(KEY, []);
  const r = list.find((x) => x.id === id);
  if (!r) return { error: 'not_found' };
  norm(r);
  if (r.status === 'platit') return { ok: true, paid: true };
  if (r.status === 'rezervat') return { ok: true, again: true, reservation: pubRes(r) };
  if (!openOnline(r) && r.status !== 'lead') return { error: 'not_open' };
  const h = await rehold(list, r); // a hold that is over takes a card only when one is left
  if (h !== 'ok') { await writeJSON(KEY, list); return { error: h }; }
  Object.assign(r, { status: 'rezervat', pay: 'clinica', convertedAt: nowISO() });
  supersede(list, r);
  recOf(r).stop = recOf(r).stop || 'converted';
  mark(r, 'converted', how);
  await writeJSON(KEY, list);
  const st = { readJSON, writeJSON };
  try {
    const note = 'Card de Sărbători rezervat, plata în clinică (' + (how === 'lead' ? 'din reclamă, formularul Meta; a ales clinica pe WhatsApp' : 'a început plata online, apoi a ales clinica' + (how === 'whatsapp' ? ', din WhatsApp' : how === 'site' ? ', pe site' : '')) + '): ' +
      r.qty + ' × ' + r.tier + ' lei (credit ' + TIERS[r.tier] + ' lei fiecare), de plată ' + r.amount + ' lei' + (r.cards.some((c) => c.recipient) ? ' · pe numele: ' + r.cards.map((c) => c.recipient || '(al ei)').join(', ') : '');
    await require('../portal-leads').createLead({ name: r.name || r.hint || NONAME, phone: r.phone, source: r.via === 'meta-form' ? 'facebook' : 'site', location: r.city, createdBy: 'card-sarbatori', interest: 'Card de Sărbători', note, authorLabel: r.via === 'meta-form' ? 'Reclamă · Card de Sărbători' : 'Site · Card de Sărbători', welcome: false, src: r.src });
  } catch (e) { console.error('card clinic lead:', e.message); }
  try {
    await N.notifyMany(st, await N.deskIds(st, r.city), { kind: 'money', tone: 'info', go: 'carduri', tag: 'card-clinic-' + r.id,
      title: sarb(r.tier, r.amount) + ' · REZERVAT' + N.cityTag(r.city), text: (r.name || 'fără nume') + ' · plătește în clinică · ' + (how === 'lead' ? 'din reclamă, a ales clinica pe WhatsApp' : 'a trecut de la plata online' + (how === 'whatsapp' ? ' (din WhatsApp)' : '')) + '. Sun-o să stabiliți când vine.' });
  } catch (e) { console.error('card clinic notify:', e.message); }
  return { ok: true, reservation: pubRes(r) };
}

// what this run found, written onto the newest list (a change made meanwhile, e.g. her answer on the site, stays)
function mergeInto(x, r) {
  x.rec = Object.assign({}, x.rec || {}, r.rec || {});
  const seen = new Set((x.trail || []).map((e) => e.at + e.ev + (e.note || '')));
  x.trail = (x.trail || []).concat((r.trail || []).filter((e) => !seen.has(e.at + e.ev + (e.note || '')))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-TRAIL_MAX);
}
// her last step on the order: made, sent to the checkout or the PayLink, her phone given, back on the page
const STEP_EVS = ['created', 'to_checkout', 'to_paylink', 'contact', 'back', 'returned', 'choice', 'reason', 'edited'];
function lastStep(r) {
  let t = Math.max(heldFrom(r) || 0, Date.parse(r.created) || 0, Date.parse(r.checkout && r.checkout.at) || 0);
  (r.trail || []).forEach((e) => { if (STEP_EVS.includes(e.ev)) t = Math.max(t, Date.parse(e.at) || 0); });
  return t;
}
// the checks before a recovery message (the owner, 23.11: „doar când e 100% sigur că nu a plătit”): her order read again
// (still waiting, nothing stopped it, no other card of hers paid or newer), the checkout's own orders of this card asked at
// myPOS now (paid, or no clear answer: nothing goes), myPOS's payments of the last hours (one of her sum not yet matched to
// an order: nothing goes, the matching or „De verificat” takes it first), and a mark made once, so two runs at the same
// time send it once. { ok } or { ok: false, why, stop? }
async function recoverSafe(r, step, scan) {
  const list = await readJSON(KEY, []);
  const x = byId(list, r.id);
  if (!x || x.status !== 'asteptare') return { ok: false, why: 'comanda nu mai așteaptă', stop: 'changed' };
  const rc = recOf(x);
  if (rc.stop || rc[step]) return { ok: false, why: 'oprit sau trimis deja' };
  const k = d9(x.phone);
  const mine = list.filter((y) => y.id !== x.id && k.length === 9 && d9(y.phone) === k);
  if (mine.some((y) => y.status === 'platit' && Date.now() - Date.parse(y.paidAt || y.created) < 7 * 86400e3)) return { ok: false, why: 'alt card al ei plătit', stop: 'paid_other' };
  if (mine.some((y) => Date.parse(y.created) > Date.parse(x.created))) return { ok: false, why: 'comandă mai nouă', stop: 'newer' };
  // the checkout's orders of this card: asked at myPOS now
  const PAY = require('./pay');
  const open = await readJSON('data/pay-open.json', []);
  for (const e of open.filter((o) => Date.parse(o.at) >= Date.parse(x.created) - 60e3)) {
    const o = (await PAY.readOrder(e.id).catch(() => ({ data: null }))).data;
    if (!o || o.kind !== 'card' || String(o.ref || '') !== x.id) continue;
    // her last sign of life on the checkout (the tap, the payment page): 10 minutes from that too
    if (typeof PAY.lastActivity === 'function' && Date.now() - PAY.lastActivity(o) < 10 * 60e3) return { ok: false, why: 'încă activă pe plată' };
    const c = await PAY.check(o.id, o.key).catch((er) => ({ error: er.message }));
    if (c.paid) return { ok: false, why: 'plătit prin checkout', stop: 'paid' };
    if (c.error || c.status !== 'open' && c.status !== 'failed') return { ok: false, why: 'myPOS fără răspuns clar: ' + (c.error || c.status) };
  }
  // myPOS's payments of the last 3 hours: one of her sum, not matched to any order yet
  if (!scan.done) { scan.done = true; const s = await scanMypos(1).catch((er) => ({ ok: false, error: er.message })); scan.pays = s.ok ? s.pays : null; }
  if (!scan.pays) return { ok: false, why: 'tranzacțiile myPOS nu s-au putut citi' };
  const used = new Set(list.filter((y) => y.match && y.match.ref).map((y) => y.match.ref).concat(list.filter((y) => y.checkout && y.checkout.scan).map((y) => y.checkout.scan)));
  const since = Math.min(heldFrom(x) || Date.parse(x.created), Date.parse(x.created)) - 5 * 60e3;
  if (scan.pays.some((p) => !used.has(p.ref) && Date.parse(p.at) >= since && sumOk(x, p.amount))) return { ok: false, why: 'o plată cu suma ei încă nepotrivită' };
  // once only
  if (!(await createOnce('data/card-rec-lock/' + x.id.replace(/[^\w-]/g, '') + '-' + step + '.txt', new Date().toISOString()))) return { ok: false, why: 'trimis deja (lock)' };
  return { ok: true };
}
async function recover(now) {
  const t = now || Date.now();
  const stamp = await readJSON(REC_KEY, {}).catch(() => ({}));
  if (!now && (!stamp.at || t - Date.parse(stamp.at) > 10 * 60e3)) await writeJSON(REC_KEY, { at: new Date(t).toISOString() }, { quiet: true }).catch(() => 0);
  const list = await readJSON(KEY, []);
  const pend = list.filter((r) => r.pay === 'online' && ['site', 'meta-form'].includes(r.via) && r.status === 'asteptare' && t - Date.parse(r.created) < 4 * 86400e3);
  const unnamed = list.filter((r) => r.status === 'platit' && r.naming && r.naming.state !== 'done');
  const leads = list.filter((r) => r.status === 'lead' && !r.leadCall && t - Date.parse(r.created) < 4 * 86400e3);
  if (!pend.length && !unnamed.length && !leads.length) return { open: 0 };
  // a lead from the ads' form with no answer in 2 hours (a night waits for 09:00): reception calls her
  let calls = 0;
  for (const r of leads) {
    if (t < awake(Date.parse(r.created) + 2 * 3600e3) || quiet(t)) continue;
    await leadCall(r.id, 'n-a ales în 2 ore');
    calls++;
  }
  if (calls) { const fresh = await readJSON(KEY, []); list.length = 0; fresh.forEach((x) => list.push(x)); }
  // paid, the name asked, no name after 6 hours (a night waits for 09:00): the card goes without one
  let named = 0;
  for (const r of unnamed.slice(0, 4)) {
    if (t < awake(Date.parse(r.naming.at) + 6 * 3600e3) || quiet(t)) continue;
    norm(r);
    Object.assign(r.naming, { state: 'done', how: 'timeout', doneAt: nowISO() });
    mark(r, 'named', 'none');
    await sendCards(r, 'fără nume');
    const l2 = await readJSON(KEY, []);
    const i = l2.findIndex((x) => x.id === r.id);
    if (i >= 0) { l2[i] = r; await writeJSON(KEY, l2); }
    named++;
  }
  if (named) { const fresh = await readJSON(KEY, []); list.length = 0; fresh.forEach((x) => list.push(x)); }
  if (!pend.length) return { open: 0, named, calls };
  const checking = new Set((await openChecks()).flatMap((c) => c.cands)); // maybe paid: never „plata nu s-a finalizat”
  const changed = new Set(), due = [];
  // the hold is over: its line once
  pend.forEach((r) => { if (!live(r, t) && !(r.trail || []).some((e) => e.ev === 'expired' && Date.parse(e.at) >= heldFrom(r))) { mark(r, 'expired'); changed.add(r); } });
  const open = pend.filter((r) => !(r.rec && r.rec.stop) && !checking.has(r.id));
  let cnt = null, convos = null;
  const stop = (r, why) => { recOf(r).stop = why; changed.add(r); };
  for (const r of open) {
    norm(r);
    const rc = recOf(r);
    if (t >= Date.parse(DEADLINE)) { stop(r, 'deadline'); continue; }
    if (list.some((x) => x.id !== r.id && x.status !== 'draft' && d9(x.phone) === d9(r.phone) && Date.parse(x.created) > Date.parse(r.created))) { stop(r, 'newer'); continue; }
    // the step due now: rec1 10 minutes after her last step (the order, the checkout, her phone; until an hour later, or an
    // hour after 09:00 when that fell at night),
    if (!r.phone) continue; // an order of the checkout closed before her phone came: nobody to write to
    // rec2 about 24 h after rec1
    let step = '', from = 0, end = 0;
    if (!rc.wa1) { step = 'wa1'; from = awake(lastStep(r) + 10 * 60e3); end = from + 60 * 60e3; }
    else if (rc.wa1.ok && !rc.wa2) { step = 'wa2'; from = awake(Date.parse(rc.wa1.at) + 24 * 3600e3 - 10 * 60e3); end = from + 3 * 3600e3; }
    if (!step) { stop(r, 'done'); continue; }
    if (t < from || quiet(t)) continue;
    if (t > end) { rc[step] = { at: new Date(t).toISOString(), ok: false, error: rc[step + 'Wait'] || 'nu a plecat la timp' }; mark(r, step, 'netrimis: ' + rc[step].error); changed.add(r); if (step === 'wa1') stop(r, 'missed'); continue; }
    if (!cnt) cnt = await count(list, t);
    if (!live(r, t) && leftFor(cnt, r.tier, r.city) < qtyOf(r)) { stop(r, 'stock'); continue; }
    if (step === 'wa2' && leftFor(cnt, r.tier, r.city) < 1) { stop(r, 'stock'); continue; }
    // she wrote us on WhatsApp since the order: the desk talks to her, nothing automatic
    if (!convos) convos = await readJSON('data/whatsapp-conversations.json', []).catch(() => []);
    const c = convos.find((x) => d9(x.phone) === d9(r.phone));
    if (c && (c.messages || []).some((m) => m.direction === 'in' && Date.parse(m.timestamp) > heldFrom(r))) { rc.replied = rc.replied || { at: nowISO(), what: 'text' }; mark(r, 'replied', 'text'); stop(r, 'replied'); continue; }
    due.push({ r, step });
  }
  let sent = 0, failed = 0, waiting = 0, held = 0;
  const T2 = due.length ? await templates().catch(() => ({ t: {} })) : { t: {} };
  const warm = T2.t && T2.t.rec1b && require('./wa-templates').overall(T2.t.rec1b) === 'APPROVED';
  const scan = { done: false, pays: null };
  for (const { r, step } of due.slice(0, 6)) {
    const rc = recOf(r);
    // only when it is sure she has not paid (the owner, 23.11): any doubt waits for the next run
    const g = await recoverSafe(r, step, scan).catch((e) => ({ ok: false, why: 'eroare: ' + e.message }));
    if (!g.ok) { if (g.stop) stop(r, g.stop); held++; rc[step + 'Held'] = String(g.why || '').slice(0, 120); changed.add(r); continue; }
    const k = step === 'wa1' ? (warm ? 'rec1b' : 'rec1') : 'rec2';
    const vars = { credit: lei(r.credit), carduri: cardsLeft(leftFor(cnt, r.tier, r.city)) };
    let png = null, path = 'wa-out/card-rec-' + String(r.id).replace(/[^\w-]/g, '').slice(0, 36) + '.png';
    try {
      png = await require('./card-image').png({ credit: TIERS[r.tier] || r.credit, name: (r.cards[0] || {}).recipient || r.name, code: '', valid: VALID_TXT, vip: isVip(r) });
      await writeBinary(path, png, 'image/png').catch(() => { path = ''; });
    } catch (e) { console.error('card rec image:', e.message); }
    const m = await say(k, r, vars, fill(k, vars), png, '', { path, only: 'template', tag: { cardOrder: r.id, cardStep: step } }).catch((e) => ({ sent: false, error: e.message }));
    // the template not approved yet: tried again on the next run, inside the step's time
    if (!m.sent && m.tpl) { rc[step + 'Wait'] = String(m.error || '').slice(0, 160); changed.add(r); waiting++; continue; }
    rc[step] = m.sent ? { at: nowISO(), ok: true, how: m.how } : { at: nowISO(), ok: false, error: String(m.error || 'netrimis').slice(0, 160) };
    delete rc[step + 'Wait'];
    mark(r, step, m.sent ? 'ok' : 'netrimis: ' + rc[step].error);
    changed.add(r);
    if (m.sent) sent++; else failed++;
  }
  if (changed.size) {
    const l2 = await readJSON(KEY, []);
    for (const r of changed) { const x = l2.find((y) => y.id === r.id); if (x) mergeInto(x, r); }
    await writeJSON(KEY, l2);
  }
  return { open: open.length, due: due.length, sent, failed, waiting, held, named, calls };
}
// on the hourly clock too, only when the 5-minute one did not run lately (the Worker's minute clock is off)
async function recoverIfIdle() {
  const s = await readJSON(REC_KEY, {}).catch(() => ({}));
  if (s.at && Date.now() - Date.parse(s.at) < 20 * 60e3) return { skipped: 'minute clock' };
  return recover();
}

// her answer on WhatsApp to a recovery message (api/webhook-whatsapp.js): m = { order (the message she answers), phone,
// city (the number she wrote to), button (the button's words), text, msgId }. Returns { quiet } (true: the desk is told
// another way, or nothing is needed) or null when it is not about a card order.
async function onWhatsApp(m) {
  const list = await readJSON(KEY, []);
  const k9 = d9(m.phone);
  let r = m.order ? list.find((x) => x.id === m.order) : null;
  if (!r && k9.length === 9) r = list.filter((x) => d9(x.phone) === k9 && (x.status === 'lead' || (x.rec && x.rec.wa1 && x.rec.wa1.ok) || (x.naming && x.naming.state !== 'done'))).sort((a, b) => Date.parse(b.created) - Date.parse(a.created))[0] || null;
  if (!r) return null;
  norm(r);
  // a lead from the ads' form: her choice, online or in the clinic (leadReply)
  if (r.status === 'lead') return leadReply(list, r, m);
  // paid, the name of the card asked: her answer is the name (named)
  if (r.status === 'platit' && r.naming && r.naming.state !== 'done') return named(r, m);
  if (r.status === 'platit' && !(r.rec && r.rec.wa1)) return null;
  const rc = recOf(r);
  const kind = Object.keys(REC_BTN).find((k) => fold(REC_BTN[k]) === fold(m.button || m.text)) || 'text';
  if (kind === 'text' && rc.replied) return null; // she talks to the desk now: Mesaje as always
  if (m.msgId && rc.replied && rc.replied.msg === m.msgId) return { quiet: true }; // Meta sent it twice
  rc.stop = rc.stop || 'replied';
  rc.replied = { at: nowISO(), what: kind, msg: String(m.msgId || '').slice(0, 80) };
  mark(r, 'replied', kind);
  if (!r.hint && m.waName && m.waName !== NONAME) r.hint = String(m.waName).slice(0, 80);
  const g = greetName(r), hi = (w) => w + (g ? ', ' + g : '');
  let reply = '', quietDesk = false;
  if (kind === 'text') { await writeJSON(KEY, list); return { quiet: false }; }
  if (r.status === 'platit') { reply = hi('Bună') + '! Plata ta e deja confirmată, iar cardul l-ai primit aici pe WhatsApp. Mulțumim!'; quietDesk = true; }
  else if (kind === 'pay' && openOnline(r)) {
    const h = await rehold(list, r);
    const link = h === 'ok' ? await linkOf(r) : null;
    if (link) {
      mark(r, 'to_paylink', 'whatsapp');
      reply = hi('Sigur') + '! Aici plătești Cardul de Sărbători de ' + lei(r.credit) + ' lei în tratamente (' + lei(r.amount) + ' lei), pe pagina securizată myPOS: ' + link + '\nCardul îți vine aici pe WhatsApp imediat ce se confirmă plata.';
      quietDesk = true;
    } else if (h !== 'ok') reply = hi('Ne pare rău') + ', ' + (h === 'closed' ? 'oferta Cardului de Sărbători s-a încheiat.' : 'în acest moment nu mai avem carduri disponibile.') + ' Mulțumim!';
  } else if (kind === 'no') {
    if (r.status === 'asteptare') { Object.assign(r, { status: 'anulat', cancelledAt: nowISO(), cancelledBy: 'ea' }); mark(r, 'cancelled', 'ea'); }
    reply = hi('Am înțeles') + '. Mulțumim că ne-ai spus! Dacă te răzgândești, ne scrii aici oricând.';
    quietDesk = true;
  }
  await writeJSON(KEY, list);
  if (kind === 'clinic' && r.status !== 'platit') {
    const x = await toClinic(r.id, 'whatsapp');
    if (x.ok && !x.paid) { reply = hi('Gata') + '! Ți-am rezervat Cardul de Sărbători de ' + lei(r.credit) + ' lei în tratamente. Îl plătești în clinică (' + (ADDR[r.city] || ADDR['Timișoara']) + '), cash sau card. Te sună recepția să stabiliți când treci.'; quietDesk = true; }
    else if (x.error === 'sold_out' || x.error === 'closed') reply = hi('Ne pare rău') + ', ' + (x.error === 'closed' ? 'oferta Cardului de Sărbători s-a încheiat.' : 'în acest moment nu mai avem carduri disponibile.') + ' Mulțumim!';
  }
  // the answer, inside the 24 hours she opened by writing; in her chat like every card message
  let ok = false;
  if (reply) {
    try {
      const WA = require('./whatsapp');
      const y = await WA.sendWhatsApp({ phone: r.phone, text: reply, from: m.city || r.city });
      ok = !!y.sent;
      if (y.sent) await logChat(r.phone, y.fromCity || r.city, r.name, reply, '', y.id, { cardOrder: r.id, cardStep: 'reply' });
      else console.error('card rec reply: not sent');
    } catch (e) { console.error('card rec reply:', e.message); }
  }
  return { quiet: quietDesk && ok, kind, replied: ok };
}

// the name on the card, from her answers: „Pentru mine” / „E cadou” (the buttons, or the same words typed), then the name
const NOT_NAMES = new Set(['multumesc', 'multumim', 'mersi', 'ok', 'okay', 'da', 'nu', 'buna', 'salut', 'super', 'perfect', 'bine', 'pentru mine', 'cadou', 'e cadou', 'sigur']);
const cleanName = (s) => {
  const x = String(s || '').replace(/\s+/g, ' ').replace(/[.!]+$/, '').trim();
  if (NOT_NAMES.has(fold(x))) return '';
  return /^[\p{L}][\p{L}' .-]{1,59}$/u.test(x) && x.split(' ').length <= 5 ? x : '';
};
async function named(r, m) {
  const nm = r.naming;
  if (!r.hint && m.waName && m.waName !== NONAME) r.hint = String(m.waName).slice(0, 80);
  const k = Object.keys(NAME_BTN).find((x) => fold(NAME_BTN[x]) === fold(m.button || m.text)) || '';
  let reply = '';
  if (k) {
    Object.assign(nm, { for: k, state: 'typing', forAt: nowISO() });
    mark(r, 'name_for', k);
    reply = k === 'me' ? 'Cum te numești? Scrie-ne numele și prenumele, așa cum vrei să apară pe card.' : 'Ce frumos! Scrie-ne numele celei care primește cardul, așa cum vrei să apară pe el.';
  } else {
    if (!nm.for) return null; // not an answer to the question: Mesaje, as always
    const name = cleanName(m.text);
    if (!name) {
      if (nm.retried) return null;
      nm.retried = true;
      reply = 'Scrie-ne doar numele, de exemplu: Maria Popescu.';
    } else {
      if (nm.for === 'me') { r.name = name; r.cards.forEach((c) => { c.recipient = ''; }); r.recipient = ''; r.forWho = 'eu'; }
      else { r.cards[0].recipient = name; r.recipient = name; r.forWho = 'cadou'; }
      Object.assign(nm, { state: 'done', how: nm.for, doneAt: nowISO() });
      r.nameFrom = 'whatsapp';
      mark(r, 'named', nm.for);
      await sendCards(r, nm.for === 'me' ? 'pe numele ei' : 'cadou');
      if (nm.for === 'me') await nameLead(r);
    }
  }
  const l2 = await readJSON(KEY, []);
  const i = l2.findIndex((x) => x.id === r.id);
  if (i >= 0) { l2[i] = r; await writeJSON(KEY, l2); }
  if (reply) {
    try {
      const y = await require('./whatsapp').sendWhatsApp({ phone: r.phone, text: reply, from: m.city || r.city });
      if (y.sent) await logChat(r.phone, y.fromCity || r.city, r.name, reply, '', y.id, { cardOrder: r.id, cardStep: 'name' });
    } catch (e) { console.error('card name reply:', e.message); }
  }
  return { quiet: true, kind: 'name' };
}

// ---- a lead from the ads' form „Rezervă Cardul de Sărbători” (the owner, 21.11; called by api/_lib/fb-leads.js):
// reserveFromLead({ phone, name, city, value: '290' | '490' | '990' | '9900', forWhom: 'eu' | 'cadou', source: { utm_source, utm_campaign,
// utm_content, adId, adsetId, campaignId, formId, leadId } }) → { ok, id, sent } | { error }
// The same rules as an order on the site (her phone, the clinic, the card, the cards left); one open order per phone (a
// second lead gives back the one she has). The order waits for her choice ('lead', its card held 2 hours) and gets at once
// the template „lead” (her card's picture, two buttons): „Plătesc online” → the PayLink, the order is an online one (the
// recovery messages from there); „Plătesc în clinică” → reserved for the clinic, reception told, the „rezervat” message.
// No choice in 2 hours, or the template not approved yet: reception is told to call her (leadCall).
const LEAD_TRACK = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'adId', 'adsetId', 'campaignId', 'formId', 'leadId'];
const cleanText = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[<>"\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
async function reserveFromLead(o) {
  o = o || {};
  const { normalizePhone } = require('./clients');
  let phone = normalizePhone(cleanText(o.phone, 30)) || '';
  if (/^7\d{8}$/.test(phone)) phone = '0' + phone;
  if (!(/^07\d{8}$/.test(phone) || /^[1-9]\d{10,14}$/.test(phone))) return { error: 'bad_phone' };
  const city = ['Timișoara', 'Arad'].find((c) => fold(c) === fold(o.city)) || '';
  if (!city) return { error: 'missing_city' };
  const tier = Number(String(o.value == null ? '' : o.value).replace(/\D/g, ''));
  if (!TIERS[tier]) return { error: 'bad_tier' };
  const now = Date.now();
  if (now >= Date.parse(DEADLINE)) return { error: 'closed' };
  let list = await readJSON(KEY, []);
  // one open order per phone: the one she has
  const k = d9(phone);
  const mine = list.filter((r) => d9(r.phone) === k && (r.status === 'lead' || r.status === 'rezervat' || (r.status === 'asteptare' && now - heldFrom(r) < MATCH_MS)))
    .sort((a, b) => Date.parse(b.created) - Date.parse(a.created))[0];
  if (mine) return { ok: true, id: mine.id, sent: false, again: true };
  const c0 = await stockFor(list, tier, city, 1, now);
  if (!c0.ok) return { error: c0.error === 'closed' ? 'closed' : 'sold_out' };
  // her name: the form's, else ours (clients, then leads); nameFrom says which
  let name = cleanText(o.name, 100), nameFrom = name ? 'formular' : '';
  if (!name) { const kn = await knownName(phone).catch(() => ''); if (kn) { name = kn; nameFrom = 'fisa'; } }
  const src = o.source && typeof o.source === 'object' ? o.source : {};
  const track = {};
  LEAD_TRACK.forEach((x) => { if (src[x] != null && String(src[x]).trim()) track[x] = cleanText(src[x], 200); });
  const entry = { id: crypto.randomUUID(), created: nowISO(), name, phone, city, tier, qty: 1, amount: tier, credit: TIERS[tier], forWho: o.forWhom === 'cadou' ? 'cadou' : 'eu',
    cards: [{ code: '', recipient: '' }], recipient: '', status: 'lead', via: 'meta-form', pay: 'alege', track };
  if (nameFrom) entry.nameFrom = nameFrom;
  mark(entry, 'created', 'meta-form');
  list.push(entry);
  await writeJSON(KEY, list);
  // two at the same second for the last cards: the later one gives way
  list = await readJSON(KEY, []);
  if (await lostRace(list, entry)) { await writeJSON(KEY, list.filter((r) => r.id !== entry.id)); return { error: 'sold_out' }; }
  const m = await leadMsg(entry.id).catch((e) => ({ sent: false, error: e.message }));
  return { ok: true, id: entry.id, sent: !!m.sent };
}
// the template „lead”, from her clinic's number, once; not sent (not approved yet, or Meta refused): reception calls her
// her first name from the form for „Bună Maria!”: the first word, letters only, capital first; odd or missing: ''
function leadFirst(r) {
  const w = String((r && (r.name || (r.hint !== NONAME ? r.hint : ''))) || '').trim().split(/\s+/)[0] || '';
  if (!/^[\p{L}]+(?:-[\p{L}]+)?$/u.test(w) || w.replace(/-/g, '').length < 2) return '';
  return w.slice(0, 30).toLowerCase().replace(/(^|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}
async function leadMsg(id) {
  const list = await readJSON(KEY, []);
  const r = list.find((x) => x.id === id);
  if (!r || r.status !== 'lead' || r.leadMsg) return r ? r.leadMsg || {} : {};
  norm(r);
  const op = await onlinePay(r.tier).catch(() => ({ disc: false }));
  // („Online, cu cardul, primești în plus {{3}} și acces în Clubul 360”: the gift; the VIP: 10% off, or its card at once)
  const vars = { suma: lei(r.amount), credit: lei(r.credit), cadoul: !isVip(r) ? giftOf(r.city) : op.disc ? '10% reducere (' + lei(op.amount) + ' lei)' : 'cardul pe loc, aici pe WhatsApp' };
  let png = null, path = 'wa-out/card-lead-' + String(r.id).replace(/[^\w-]/g, '').slice(0, 36) + '.png';
  try {
    png = await require('./card-image').png({ credit: TIERS[r.tier] || r.credit, name: r.forWho === 'cadou' ? '' : r.name || '', code: '', valid: VALID_TXT, vip: isVip(r) });
    await writeBinary(path, png, 'image/png').catch(() => { path = ''; });
  } catch (e) { console.error('card lead image:', e.message); }
  // the new one of her card (490 / 990 or VIP, with her first name or without) once Meta approves it, with the wave's count
  // of now (the VIP: its clinic's); until then the first
  const T2 = await templates().catch(() => ({ t: {} }));
  const nm = leadFirst(r);
  const want = isVip(r) ? (nm ? 'vip3n' : 'vip3') : [490, 990].includes(Number(r.tier)) ? (nm ? 'lead3n' : 'lead3') : '';
  const kind = want && T2.t && T2.t[want] && require('./wa-templates').overall(T2.t[want]) === 'APPROVED' ? want : 'lead';
  if (kind !== 'lead') {
    const cnt = await count(list).catch(() => null);
    vars.ramase = String(Math.max(1, cnt ? (isVip(r) ? (cnt.vip[r.city] || {}).left || 1 : cnt.left) : 1));
    vars.prenume = nm;
  }
  const m = png ? await say(kind, r, vars, fill(kind, vars), png, '', { path, only: 'template', tag: { cardOrder: r.id, cardStep: 'lead' } }).catch((e) => ({ sent: false, error: e.message }))
    : { sent: false, error: 'poza cardului' };
  const res = m.sent ? { at: nowISO(), how: m.how, sent: true } : { at: nowISO(), skipped: m.tpl ? 'șablonul nu e aprobat încă' : String(m.error || 'netrimis').slice(0, 160) };
  const l2 = await readJSON(KEY, []);
  const x = l2.find((y) => y.id === id);
  if (x && !x.leadMsg) { x.leadMsg = res; mark(x, 'lead_msg', res.sent ? 'ok' : 'netrimis: ' + res.skipped); await writeJSON(KEY, l2); }
  if (!res.sent) await leadCall(id, 'WhatsApp-ul n-a plecat (' + res.skipped + ')');
  return res;
}
// reception calls her (once): the alert like a site lead's („LEAD CARD TM 🎁 - 990 lei”), her lead in the Pipeline gets the
// line, the portal shows „Sun-o”
async function leadCall(id, why) {
  const list = await readJSON(KEY, []);
  const r = list.find((x) => x.id === id);
  if (!r || r.status !== 'lead' || r.leadCall) return false;
  norm(r);
  r.leadCall = { at: nowISO(), why: String(why || '').slice(0, 160) };
  mark(r, 'lead_call', why);
  await writeJSON(KEY, list);
  const st = { readJSON, writeJSON };
  try {
    const note = 'Card de Sărbători din reclamă (formularul Meta): ' + r.tier + ' lei, credit ' + lei(r.credit) + ' lei' + (r.forWho === 'cadou' ? ', cadou' : '') + ' · ' + why + ': sun-o să aleagă plata (online sau în clinică)';
    const L = await require('../portal-leads').createLead({ name: r.name || NONAME, phone: r.phone, source: 'facebook', location: r.city, createdBy: 'card-sarbatori', interest: 'Card de Sărbători', note, authorLabel: 'Card de Sărbători', welcome: false });
    if (L && L.lead && !r.leadId) { const l2 = await readJSON(KEY, []); const x = l2.find((y) => y.id === id); if (x) { x.leadId = L.lead.id; await writeJSON(KEY, l2); } }
  } catch (e) { console.error('card lead pipeline:', e.message); }
  try {
    await N.notifyMany(st, await N.deskIds(st, r.city), { kind: 'lead', tone: 'info', go: 'carduri', tag: 'card-lead-' + r.id,
      title: sarb(r.tier) + ' · SUN-O' + N.cityTag(r.city), text: (r.name || 'fără nume') + ' · ' + why + '. Sun-o să aleagă: online sau în clinică.' });
  } catch (e) { console.error('card lead notify:', e.message); }
  return true;
}
// her button on the lead message (onWhatsApp): online → the PayLink (an online order from now); clinic → reserved
async function leadReply(list, r, m) {
  const kind = Object.keys(LEAD_BTN).find((x) => fold(LEAD_BTN[x]) === fold(m.button || m.text)) || '';
  if (!kind) return null; // a question in words: Mesaje, the desk answers (the call after 2 hours still comes)
  if (m.msgId && r.leadChoice && r.leadChoice.msg === m.msgId) return { quiet: true }; // Meta sent it twice
  if (!r.hint && m.waName && m.waName !== NONAME) r.hint = String(m.waName).slice(0, 80);
  r.leadChoice = { at: nowISO(), what: kind, msg: String(m.msgId || '').slice(0, 80) };
  mark(r, 'choice', kind);
  const g = greetName(r), hi = (w) => w + (g ? ', ' + g : '');
  let reply = '', quietDesk = false, vipCall = false;
  if (kind === 'online') {
    const h = await rehold(list, r);
    // online: 10% off when its 10% link is set (the order's sum follows)
    // the checkout in the page while it is on (its page with her order), else the PayLink
    const emb = h === 'ok' && Number(r.tier) !== 290 && await embedded();
    const op = h === 'ok' ? (emb ? { link: checkoutUrl(r), amount: checkoutAmount(r.tier, 1), disc: isVip(r) } : await onlinePay(r.tier)) : null;
    const link = op && op.link;
    if (link) {
      r.pay = 'online';
      if (Number(r.tier) !== 290 && qtyOf(r) === 1) { r.amount = op.amount; if (op.disc) r.disc = true; else delete r.disc; }
      mark(r, 'to_paylink', 'whatsapp');
      reply = hi('Super') + '! Aici plătești Cardul de Sărbători de ' + lei(r.credit) + ' lei în tratamente (' + (op.disc ? lei(r.amount) + ' lei în loc de ' + lei(r.tier) + ' lei, 10% reducere la plata online' : lei(r.amount) + ' lei') + '), pe pagina securizată myPOS: ' + link +
        '\nDupă plată primești cardul aici pe WhatsApp' + (isVip(r) ? '' : ', plus ' + giftOf(r.city) + ',') + ' și accesul în Clubul 360.';
      quietDesk = true;
    } else {
      if (r.status === 'asteptare' && r.pay !== 'online') r.status = 'lead'; // no PayLink now: she stays a lead, the desk calls her
      // the VIP one has no PayLink yet: we call her (the desk hears it now, not in 2 hours)
      if (h === 'ok' && isVip(r)) { reply = hi('Mulțumim') + '! Pentru cardul VIP te sunăm noi în curând, să stabilim plata și revizia ta completă.'; vipCall = true; }
      if (h !== 'ok') reply = hi('Ne pare rău') + ', ' + (h === 'closed' ? 'oferta Cardului de Sărbători s-a încheiat.' : 'în acest moment nu mai avem carduri disponibile.') + ' Mulțumim!';
    }
    await writeJSON(KEY, list);
  } else {
    await writeJSON(KEY, list);
    const x = await toClinic(r.id, 'lead');
    if (x.ok && !x.paid) {
      const rez = await reservedMsg(r.id).catch(() => null);
      quietDesk = true; // reception heard the reservation (toClinic)
      // the approved „rezervat” message went; else a plain one (she just wrote us: Meta lets it through)
      if (!(rez && rez.how)) reply = hi('Gata') + '! Ți-am rezervat Cardul de Sărbători de ' + lei(r.credit) + ' lei în tratamente. Îl plătești în clinică (' + (ADDR[r.city] || ADDR['Timișoara']) + '), cash sau card. Te sunăm să stabilim când treci.';
    } else if (x.error === 'sold_out' || x.error === 'closed') reply = hi('Ne pare rău') + ', ' + (x.error === 'closed' ? 'oferta Cardului de Sărbători s-a încheiat.' : 'în acest moment nu mai avem carduri disponibile.') + ' Mulțumim!';
  }
  let ok = false;
  if (reply) {
    try {
      const y = await require('./whatsapp').sendWhatsApp({ phone: r.phone, text: reply, from: m.city || r.city });
      ok = !!y.sent;
      if (y.sent) await logChat(r.phone, y.fromCity || r.city, r.name, reply, '', y.id, { cardOrder: r.id, cardStep: 'lead-reply' });
    } catch (e) { console.error('card lead reply:', e.message); }
  }
  if (vipCall) await leadCall(r.id, 'a ales online cardul VIP, fără link de plată').catch((e) => console.error('card vip call:', e.message));
  return { quiet: quietDesk && (ok || kind === 'clinic'), kind };
}

// what happened to the online payments started on the site (api/lead-health.js ?cardpay=abandon): counts only
function abandonStats(list, now) {
  const t = now || Date.now();
  const started = (list || []).filter((r) => r.via === 'site' && (r.pay === 'online' || r.convertedAt)).map(norm);
  const n = (f) => started.filter(f).length;
  const tally = (ev) => { const o = {}; started.forEach((r) => (r.trail || []).filter((e) => e.ev === ev).forEach((e) => { const k = String(e.note || '').split(':')[0] || '-'; o[k] = (o[k] || 0) + 1; })); return o; };
  const recs = (k) => ({ sent: n((r) => r.rec && r.rec[k] && r.rec[k].ok), failed: n((r) => r.rec && r.rec[k] && !r.rec[k].ok), waitingTemplate: n((r) => r.rec && r.rec[k + 'Wait'] && !r.rec[k]) });
  return {
    started: started.length,
    paid: { all: n((r) => r.status === 'platit'), online: n((r) => r.status === 'platit' && r.paidVia === 'online'), inClinic: n((r) => r.status === 'platit' && r.paidVia === 'clinica'),
      auto: n((r) => r.status === 'platit' && r.match), afterRecovery: n((r) => r.status === 'platit' && r.rec && r.rec.wa1 && r.rec.wa1.ok && Date.parse(r.paidAt) > Date.parse(r.rec.wa1.at)) },
    unpaid: { all: n((r) => r.status === 'asteptare'), held: n((r) => r.status === 'asteptare' && live(r, t)), holdOver: n((r) => r.status === 'asteptare' && !live(r, t)) },
    reserved: n((r) => r.status === 'rezervat'), converted: n((r) => r.convertedAt), convertedBy: tally('converted'),
    saidNo: n((r) => r.cancelledBy === 'ea'), cancelledByTeam: n((r) => r.status === 'anulat' && r.cancelledBy !== 'ea'),
    returned: n((r) => (r.trail || []).some((e) => e.ev === 'returned')), reasons: tally('reason'),
    wa1: recs('wa1'), wa2: recs('wa2'), replies: tally('replied'),
    stops: started.reduce((o, r) => { const s = r.rec && r.rec.stop; if (s) o[s] = (o[s] || 0) + 1; return o; }, {}),
    // the leads from the ads' form (reserveFromLead): counts only
    fromAds: (() => { const a = (list || []).filter((r) => r.via === 'meta-form'); const c = (f) => a.filter(f).length;
      return { all: a.length, waiting: c((r) => r.status === 'lead'), choseOnline: c((r) => r.leadChoice && r.leadChoice.what === 'online'), choseClinic: c((r) => r.leadChoice && r.leadChoice.what === 'clinic'),
        toCall: c((r) => !!r.leadCall), msgSent: c((r) => r.leadMsg && r.leadMsg.sent), paid: c((r) => r.status === 'platit'), reserved: c((r) => r.status === 'rezervat') }; })(),
    naming: { asked: n((r) => (r.trail || []).some((e) => e.ev === 'ask_name' && e.note === 'ok')), waiting: n((r) => r.naming && r.naming.state !== 'done'),
      forHer: n((r) => r.naming && r.naming.how === 'me'), gift: n((r) => r.naming && r.naming.how === 'gift'), noName: n((r) => r.naming && ['none', 'timeout'].includes(r.naming.how)), byDesk: n((r) => r.naming && r.naming.how === 'portal') },
  };
}

// ---- the clock (every hour): the templates sent to Meta, the payments looked for, the reminders, the probe now and then
async function tick() {
  const out = {};
  const list = await readJSON(KEY, []);
  if (list.some((r) => r.status === 'platit' || r.status === 'asteptare') || Date.now() < Date.parse(DEADLINE)) {
    const last = await readJSON('data/card-sarbatori-tpl.json', {}).catch(() => ({}));
    if (!last.at || Date.now() - Date.parse(last.at) > 6 * 3600e3 || last.pending) {
      out.templates = await ensureTemplates().catch((e) => ({ error: e.message }));
      await writeJSON('data/card-sarbatori-tpl.json', { at: nowISO(), res: out.templates, pending: Object.values(out.templates || {}).some((v) => /eroare|DRAFT/.test(String(v))) }, { quiet: true }).catch(() => 0);
    }
  }
  out.match = await autoMatch().catch((e) => ({ error: e.message }));
  out.sales = await backfillSales().catch((e) => ({ error: e.message }));
  const pr = await readJSON(PROBE, null).catch(() => null);
  if (!pr || Date.now() - Date.parse(pr.at) > 7 * 86400e3) out.probe = await scanMypos(3, { events: true }).then((s) => (s.ok ? { read: s.probe.read, online: s.probe.online } : s)).catch((e) => ({ error: e.message }));
  out.remind = await reminders().catch((e) => ({ error: e.message }));
  out.recover = await recoverIfIdle().catch((e) => ({ error: e.message }));
  out.supersede = await supersedeOnce().catch((e) => ({ error: e.message }));
  return out;
}

// ---- what the team sees: one row per card
function cardView(r, c, now) {
  const used = usedOf(c);
  return {
    order: r.id, code: c.code, recipient: c.recipient || '', buyer: r.name, phone: r.phone, city: r.city, tier: r.tier, qty: r.qty, amount: r.amount, value: c.value,
    used, left: leftOf(c), state: stateOf(r, c, now), pay: r.pay, paidVia: r.paidVia || '', payMethod: r.payMethod || '', paidAt: r.paidAt || '', created: r.created, forWho: r.forWho || '',
    gift: c.gift || null, club: !!r.bonus, sent: c.sent || null, match: r.match || null, paidByName: r.paidByName || '', nameFrom: r.nameFrom || (r.via === 'portal' ? 'receptie' : ''),
    naming: r.naming ? (r.naming.state === 'done' ? (r.naming.how === 'none' || r.naming.how === 'timeout' ? 'none' : 'done') : r.naming.for ? 'typing' : 'asked') : '',
    claims: (c.claims || []).map((x) => ({ id: x.id, at: x.at, date: x.date, city: x.city, byName: x.byName, performerName: x.performerName, items: x.items, applied: x.applied, rest: x.rest, undone: !!x.undone, msg: x.msg || null, usedBy: x.usedBy || '' })),
  };
}

// ---- „Șterge” in the portal (the owner, 22.11; admin only): an order not paid (open or cancelled) or a paid card already
// cancelled (its refund in Încasări, voidPaid) goes for good: out of the list, the counts and the stock. Her lead in the
// Pipeline stays; Încasări keeps its rows (the payment and its refund); Activitate has the line. A paid card still active:
// „Anulează” first. → { ok, order: { name, phone, tier, qty } } | { error: 'not_found' | 'paid' }
async function deleteOrder(id) {
  const list = await readJSON(KEY, []);
  const r = list.find((x) => x.id === id);
  if (!r) return { error: 'not_found' };
  if (r.status === 'platit' || r.status === 'matching') return { error: 'paid' };
  await writeJSON(KEY, list.filter((x) => x.id !== id));
  // a payment of „De verificat” waiting for it: one candidate less
  try {
    const checks = await readJSON(CHECK, []);
    if (checks.some((c) => c.state === 'open' && c.cands.includes(id))) { checks.forEach((c) => { if (c.state === 'open') c.cands = c.cands.filter((x) => x !== id); }); await writeJSON(CHECK, checks); }
  } catch (e) { /* the order is gone either way */ }
  return { ok: true, order: { name: r.name || '', phone: r.phone, tier: r.tier, qty: qtyOf(r), status: r.status } };
}
// what the desk sees next to an order (the owner, 22.11): her next appointment (when she comes to pay), and the campaign
// wave whose WhatsApp she got (card-blast: „Lot 6 · mesaj 990”)
async function orderExtras(orders) {
  const [appts, clients, st, sent] = await Promise.all([readJSON('data/appointments.json', []).catch(() => []), readJSON('data/clients.json', []).catch(() => []),
    readJSON('cardblast/state.json', null).catch(() => null), readJSON('cardblast/sent.json', null).catch(() => null)]);
  const today = roDay(Date.now());
  const clinicOf = (l) => { try { return require('./clinic').clinicOf(l) || l || ''; } catch (e) { return l || ''; } };
  const idsBy = new Map();
  clients.forEach((c) => { const k = d9(c.phone); if (k.length === 9) idsBy.set(k, (idsBy.get(k) || []).concat(c.id)); });
  const ahead = appts.filter((a) => a && !a.block && a.date >= today && !['anulata', 'finalizata', 'concediu'].includes(a.status)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const wave = new Map(((st && st.list) || []).map((p) => [p.k, p]));
  const tierOfPre = (pre) => (/_290$/.test(String(pre || '')) ? 290 : /_490$/.test(String(pre || '')) ? 490 : /_9900$/.test(String(pre || '')) ? 9900 : 990);
  const out = {};
  orders.forEach((o) => {
    const k = d9(o.phone), ids = new Set((idsBy.get(k) || []).concat(o.clientId ? [o.clientId] : []));
    const a = ahead.find((x) => (x.clientId && ids.has(x.clientId)) || (x.clientPhone && d9(x.clientPhone) === k));
    const p = wave.get(k), m = sent && sent[k];
    out[o.id] = {
      appt: a ? { date: a.date, time: a.time || '', city: clinicOf(a.location) } : null,
      lot: p && m && !m.e ? { n: Number(p.batch) || 1, tier: tierOfPre(m.t || p.pre) } : null,
    };
    // a paid VIP card: her full review, booked (her first appointment since the payment) or still to book
    if (isVip(o.tier) && o.paidAt) {
      const from = roDay(Date.parse(o.paidAt));
      const b = appts.filter((x) => x && !x.block && x.date >= from && !['anulata', 'concediu'].includes(x.status) && ((x.clientId && ids.has(x.clientId)) || (x.clientPhone && d9(x.clientPhone) === k)))
        .sort((x, y) => (x.date + (x.time || '')).localeCompare(y.date + (y.time || '')))[0];
      out[o.id].review = b ? { state: 'booked', date: b.date, time: b.time || '' } : { state: 'todo' };
    }
  });
  return out;
}

// ---- „Rezerv în clinică” tapped in a campaign's WhatsApp message (api/_lib/card-blast.js, the owner 22.11: „bagă-le și pe ele
// în cereri”): a request like the portal's, the card of the message she got, her name from our files when we have it. One per
// phone (an open order: nothing new). A full wave opens the next one rather than turning her away. opt.quiet: no alert and
// no WhatsApp (the backfill of the taps already made: reception sees them in the list).
async function requestFromTap(i, opt) {
  const o = opt || {};
  const { normalizePhone } = require('./clients');
  let phone = normalizePhone(String(i.phone || '')) || '';
  if (/^7\d{8}$/.test(phone)) phone = '0' + phone;
  const city = ['Timișoara', 'Arad'].find((c) => fold(c) === fold(i.city)) || '';
  const tier = TIERS[Number(i.tier)] ? Number(i.tier) : 990;
  if (!(/^07\d{8}$/.test(phone) || /^[1-9]\d{10,14}$/.test(phone))) return { error: 'bad_phone' };
  if (!city) return { error: 'missing_city' };
  const now = Date.now();
  if (now >= Date.parse(DEADLINE)) return { error: 'closed' };
  let list = await readJSON(KEY, []);
  const k9 = d9(phone);
  const open = list.find((r) => d9(r.phone) === k9 && (r.status === 'rezervat' || r.status === 'lead' || (r.status === 'asteptare' && live(r, now))));
  if (open) return { ok: true, exists: true, id: open.id };
  let c0 = await stockFor(list, tier, city, 1, now);
  if (!c0.ok && !isVip(tier)) { await openNext(list, 'whatsapp').catch(() => null); c0 = await stockFor(list, tier, city, 1, now); }
  const known = await knownName(phone).catch(() => '');
  const entry = { id: crypto.randomUUID(), created: nowISO(), name: known || '', phone, city, tier, qty: 1, amount: tier, credit: TIERS[tier], forWho: 'eu',
    cards: [{ code: '', recipient: '' }], recipient: '', status: 'rezervat', via: 'whatsapp', pay: 'clinica', nameFrom: known ? 'fisa' : '',
    note: 'A apăsat „Rezerv în clinică” în mesajul WhatsApp' + (i.wave ? ' (valul ' + i.wave + ')' : ''), overStock: !c0.ok || undefined };
  mark(entry, 'created', 'whatsapp: a apăsat „Rezerv în clinică”');
  list = await readJSON(KEY, []);
  if (list.some((r) => d9(r.phone) === k9 && (r.status === 'rezervat' || r.status === 'lead'))) return { ok: true, exists: true };
  supersede(list, entry);
  list.push(entry);
  await writeJSON(KEY, list);
  try {
    await require('../portal-leads').createLead({ name: known || NONAME, phone, source: 'altul', location: city, createdBy: 'card-sarbatori', interest: 'Card de Sărbători',
      note: 'Card de Sărbători rezervat din mesajul WhatsApp („Rezerv în clinică”): ' + tier + ' lei, credit ' + lei(TIERS[tier]) + ' lei. Sun-o să stabiliți când vine să-l plătească.', authorLabel: 'WhatsApp · Card de Sărbători', welcome: false });
  } catch (e) { console.error('card tap lead:', e.message); }
  if (!o.quiet) {
    try {
      const N = require('./notify'), st = { readJSON, writeJSON };
      const ids = [...new Set((await N.deskIds(st, city)).concat(await N.adminIds(st)))];
      await N.notifyMany(st, ids, { kind: 'money', tone: 'info', go: 'carduri', tag: 'card-tap-' + entry.id,
        title: sarb(tier) + ' · REZERVAT' + N.cityTag(city), text: (known || 'fără nume') + ' · a apăsat „Rezerv în clinică” în mesaj. Sun-o.' });
    } catch (e) { console.error('card tap notify:', e.message); }
    await reservedMsg(entry.id).catch((e) => console.error('card tap msg:', e.message));
  }
  return { ok: true, id: entry.id };
}

module.exports = { setWave, requestFromTap, deleteOrder, orderExtras,
  KEY, CLUB, PROBE, LINKS, STOCK, TOTAL, WAVE, MAX, total, settings, setStock, openNext, publicCount, count, ordered, TIERS, MAXQ, DEADLINE, VALID_UNTIL, VALID_TXT, HOLD_MS, MATCH_MS, CLUB_URL, GIFT, GIFT_TM, GIFT_ARAD, giftOf, giftShort, giftFor, DISC_TIERS, discOf, onlineLinks, onlinePay, linkOf, siteLinks, sumOk, embedded, setEmbedded, checkoutAmount, checkoutUrl, payQuote, payPaid, payContact, TPL,
  byId, VIP, SALE, isVip, vipLeft, stockFor, leftFor, lostRace, sarb, norm, qtyOf, live, counter, expired, usedOf, leftOf, stateOf, codeOf, findCard, links, setLinks, okLink,
  image, deliver, cardText, reservedMsg, fill, confirm, recordSale, voidPaid, backfillSales, saleOf, PAY_METHODS, matchPayments, scanMypos, autoMatch, signed, notified, redeem, undo, clubAdd, reminders, ensureTemplates, templates, tick, cardView,
  supersede, supersedeOnce, request, editOrder, reserveFromLead, leadMsg, leadCall, leadReply, LEAD_BTN, CORE, REC_BTN, NAME_BTN, NONAME, CHECK, REASONS, needsName, knownName, nameLead, sendCards, askName, cleanName, pick, openCheckOf, openChecks, greetName, mark, recOf, heldFrom, rehold, back, answer, toClinic, recover, recoverIfIdle, onWhatsApp, abandonStats, cardsLeft, quiet, awake,
};
