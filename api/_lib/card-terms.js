// The Card de Sărbători's terms, in one place (the owner, 20-24.11): what each card costs and gives, what paying online adds,
// and Black Friday. api/_lib/card-sarbatori.js, card-creative.js and card-lead.js read them from here; change them here only.
//
//   CARD_TERMS  the cards: 490 → 1.000 lei, 990 → 2.500 lei, the VIP 9.900 → 30.000 lei (290 → 500 out of sale, its orders
//               kept); paying online: a BioLifting session and Clubul 360 with the 490 and 990 cards, 10% off (8.910 lei)
//               and Clubul 360 with the VIP.
//   BF          Black Friday (the owner, 24.11): from 24.11.2026 10:00 to Sunday 29.11.2026 23:59:59 (Romania), the 990 card
//               paid ONLINE by card gives 3.000 lei in place of 2.500; reserved and paid in the clinic it stays 2.500 lei.
//               The online bonus (BioLifting and Clubul 360) stays on top. 490 and the VIP do not change.
//   The switch  data/card-bf.json { on, at, by, log: [{ on, at, by }] }, off until the owner says (api/lead-health.js ?cardbf=1).
//               Its log says whether it was on at a given moment, so a card promised while it was on keeps its 3.000 lei.
//
// Which order gets the 3.000 lei: a 990 card paid online whose online payment was started inside the window while the
// switch was on (the order made then, or sent to the payment then: the trail's created / to_paylink / to_checkout) and
// paid within its 2 h hold from that moment, or by the end of the window, whichever is later.

const { readJSON, writeJSON } = require('./store');

const CARD_TERMS = {
  tiers: { 290: 500, 490: 1000, 990: 2500, 9900: 30000 }, // what she pays → the credit in treatments, at list price
  sale: [490, 990, 9900], // on sale now (290 out since 22.11)
  vip: 9900, // „Cardul VIP Transformarea 360”
  onlineBonus: { gift: 'o ședință de BioLifting cadou', giftShort: 'Ședință BioLifting cadou', club: true, tiers: [290, 490, 990] },
  vipOnlineDiscount: 0.1, // the VIP paid online: 10% less (9.900 → 8.910 lei), no gift
};
const discOf = (t) => Math.round(Number(t) * (1 - CARD_TERMS.vipOnlineDiscount));

const BF = {
  start: '2026-11-24T08:00:00.000Z', // Tuesday 24.11, 10:00 in Romania
  end: '2026-11-29T21:59:59.000Z', // Sunday 29.11, 23:59:59 in Romania
  tier: 990,
  creditOnline: 3000,
  creditClinic: 2500,
  untilTxt: 'până duminică 29.11', // the picture's small line
  untilLong: 'până duminică 29 noiembrie',
  clinicLine: 'Dacă rezervi și plătești în clinică, rămâne 2.500 lei.', // the exact sentence, everywhere (the owner, 24.11)
};
const BF_KEY = 'data/card-bf.json';
const HOLD_MS = 2 * 3600e3;
const inWindow = (t) => Number.isFinite(t) && t >= Date.parse(BF.start) && t <= Date.parse(BF.end);

// ---- the switch
async function bfSwitch() {
  const d = await readJSON(BF_KEY, null).catch(() => null);
  return d && typeof d === 'object' ? d : { on: false };
}
async function setBf(on, by) {
  const d = await bfSwitch();
  const at = new Date().toISOString();
  const log = (Array.isArray(d.log) ? d.log : []).concat([{ on: !!on, at, by: by || '' }]).slice(-50);
  await writeJSON(BF_KEY, { on: !!on, at, by: by || '', log });
  return Object.assign({ ok: true }, info(Date.now(), { on: !!on, log }));
}
// was the switch on at t (its log; a document written by hand with no log: its own on)
function onAt(sw, t) {
  const log = (sw && Array.isArray(sw.log) ? sw.log : []).filter((x) => Number.isFinite(Date.parse(x.at))).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (!log.length) return !!(sw && sw.on);
  let st = false;
  for (const x of log) { if (Date.parse(x.at) <= t) st = !!x.on; else break; }
  return st;
}
// on now: the switch on and inside the window
const bfLive = (now, sw) => { const t = now || Date.now(); return inWindow(t) && onAt(sw, t); };
async function bfActive(now) { return bfLive(now, await bfSwitch()); }
// what the site and the portal may know
const info = (now, sw) => ({ on: bfLive(now, sw), start: BF.start, until: BF.end, tier: BF.tier, creditOnline: BF.creditOnline, creditClinic: BF.creditClinic });
async function bfInfo(now) { return info(now || Date.now(), await bfSwitch()); }

// ---- the credit of an order
const tierOf = (r) => Number(r && typeof r === 'object' ? r.tier : r);
const qtyOf = (r) => Math.max(1, Number(r && r.qty) || 1);
// the moments its online payment started inside the window while the switch was on
function bfMoments(r, sw) {
  const ts = [Date.parse(r.created), Date.parse(r.held)];
  (Array.isArray(r.trail) ? r.trail : []).forEach((e) => { if (e && ['created', 'to_paylink', 'to_checkout'].includes(e.ev)) ts.push(Date.parse(e.at)); });
  return ts.filter((t) => inWindow(t) && onAt(sw, t));
}
// does a 990 card paid online at paidAt get the Black Friday credit
function bfApplies(r, o) {
  o = o || {};
  if (!r || tierOf(r) !== BF.tier || o.via !== 'online') return false;
  const paid = o.paidAt == null ? Date.now() : typeof o.paidAt === 'number' ? o.paidAt : Date.parse(o.paidAt);
  if (!Number.isFinite(paid)) return false;
  const ms = bfMoments(r, o.sw);
  if (!ms.length) return false;
  const first = Math.min(...ms);
  if (paid < first - 5 * 60e3) return false; // paid before it was ever sent online in the window: not this one
  return paid <= Math.max(Math.max(...ms) + HOLD_MS, Date.parse(BF.end));
}
// one card's credit: 3.000 for a 990 card paid online under Black Friday, else its standard credit
// o: { via: 'online' | 'clinica', paidAt (ISO or ms; default now), sw (bfSwitch(); default off) }
function cardValueOf(r, o) {
  if (bfApplies(r, o)) return BF.creditOnline;
  return CARD_TERMS.tiers[tierOf(r)] || 0;
}
// the order's credit: the card's credit times how many
const creditOf = (r, o) => cardValueOf(r, o) * qtyOf(r);

// ---- the card's facts in one short paragraph, for the DM auto-replies (the audit, 24.11): what she pays first; under Black
// Friday the 990 card's 3.000 lei online. factsTextOf(now, sw) with the switch in hand, factsText(now) reads it.
const leiTxt = (n) => Math.round(Number(n) || 0).toLocaleString('ro-RO').replace(/[\s\u00a0\u202f]/g, '.').replace(/,/g, '.');
function factsTextOf(now, sw) {
  const t = CARD_TERMS.tiers, v = CARD_TERMS.vip;
  const c990 = bfLive(now, sw)
    ? 'plătești 990 lei și primești ' + leiTxt(BF.creditOnline) + ' lei în tratamente la plata online, ' + BF.untilLong + ' (în clinică, ' + leiTxt(BF.creditClinic) + ' lei)'
    : 'plătești 990 lei și primești ' + leiTxt(t[990]) + ' lei în tratamente';
  return 'Cardul de Sărbători: ' + c990 + '; sau 490 lei → ' + leiTxt(t[490]) + ' lei. La plata online, în plus, ' + CARD_TERMS.onlineBonus.gift + ' și acces în Clubul 360. ' +
    'Card VIP Transformarea 360: ' + leiTxt(v) + ' lei → ' + leiTxt(t[v]) + ' lei, ' + leiTxt(discOf(v)) + ' lei online. Valabil până pe 30 iunie 2027.';
}
async function factsText(now) { return factsTextOf(now || Date.now(), await bfSwitch()); }

module.exports = { factsText, factsTextOf, CARD_TERMS, BF, BF_KEY, discOf, inWindow, bfSwitch, setBf, onAt, bfLive, bfActive, bfInfo, bfMoments, bfApplies, cardValueOf, creditOf };
