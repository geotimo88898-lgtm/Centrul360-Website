// The site's shop (the owner, 24.11: „site-ul devine strict un magazin online”). She puts the treatments she wants in a cart,
// books the free consultation or her first session, pays by card on the site; the booking is confirmed only when it is paid.
//
// Everything is decided here, never by the page:
//   the catalog  the price list (price-list.gen.json, made from Prețuri): one session of each treatment
//   the price    Black Friday (BF): 50% off the price list, paid online by card, until Friday 27.11.2026 23:59:59 (Romania);
//                the same end for every visitor (the timer on the page counts down to it). After it: the list price minus
//                the site's usual online bonus (pay.js BONUS_PCT). Nothing else adds up on top (the owner, 24.11).
//                The Card de Sărbători keeps its own offer and is not sold in this cart.
//   the bonuses  TIERS: what she pays (after the discount) reaches a step → the gifts of that step (each step adds to the ones
//                under it). data/shop-bonus.json can replace them (the owner's numbers), else the defaults below.
//   the booking  the free consultation (30 min) or her first session (the main treatment's minutes), an hour held while she
//                pays (booking-holds.js, 15 min); paid on myPOS's signed word (pay.js kind 'shop', the same way as 'hold'):
//                the booking is made, confirmed and paid (booking-pay.js markPaid: Încasări, the desk, the Purchase to Meta).
//
//   data/booking-holds.json  the hold carries the cart: cart { items: [{ id, qty, zone }], visit: 'consult' | 'first', at }
const { readJSON } = require('./store');

const BF = {
  start: '2026-11-24T08:00:00.000Z', // Tuesday 24.11, 10:00 in Romania (the same start as the card's)
  end: '2026-11-27T21:59:59.000Z', // Friday 27.11, 23:59:59 in Romania (the owner, 24.11)
  pct: 50,
};
const bfOn = (t) => { const x = t || Date.now(); return x >= Date.parse(BF.start) && x <= Date.parse(BF.end); };

// the steps (the owner, 24.11: 550, 990, 4990). value: what the gift is worth at the price list, for the page's value stack
// none for now (the owner, 24.11 evening: „pentru moment ștergem bonusurile de volum”); data/shop-bonus.json can bring them back,
// e.g. { tiers: [{ at: 550, title: 'Card cadou de 200 lei', sub: 'pentru o prietenă', value: 200 }] }
const TIERS_DEFAULT = [];
async function tiers() {
  const d = await readJSON('data/shop-bonus.json', null).catch(() => null);
  const l = d && Array.isArray(d.tiers) ? d.tiers.filter((x) => x && Number(x.at) > 0 && x.title) : null;
  return (l && l.length ? l : TIERS_DEFAULT).map((x) => ({ at: Number(x.at), id: String(x.id || x.at), title: String(x.title), sub: String(x.sub || ''), value: Number(x.value) || 0 })).sort((a, b) => a.at - b.at);
}

// ---- the catalog (the owner, 24.11 night): one session of each treatment of the price list, at -50%; no packages, no
// combined offers (they come back as „transformă în pachet” only with the packages he gives). Short names („HIFU Gușă”,
// „Liposonix Abdomen”: the zone she picks completes the name), and what the session does, in plain words.
const NEEDS = [
  { id: 'corp', title: 'Corp' },
  { id: 'gusa', title: 'Gușă' },
  { id: 'fata', title: 'Față' },
  { id: 'epilare', title: 'Epilare' },
];
const ZB = ['Abdomen', 'Flancuri', 'Coapse', 'Brațe', 'Zona lombară'];
const ZF = ['Gușă', 'Gât', 'Contur mandibular', 'Pomeți', 'Frunte'];
// the price list row's id (its 1 session) → the product
const P = {
  'liposonix-o-zona-corporala-1-sedinta': { id: 'liposonix', name: 'Liposonix', zones: ZB, need: 'corp', ph: 'concern-grasime.webp', b: ['Distruge celulele de grăsime', 'Fără ace, fără recuperare'] },
  'cavitatie-o-zona-corporala-1-sedinta': { id: 'cavitatie', name: 'Cavitație', zones: ['Abdomen', 'Coapse', 'Brațe'], need: 'corp', ph: 'oferte/cavitatie.webp', b: ['Reduce grăsimea localizată', 'Fără durere, fără recuperare'] },
  'ems-o-zona-1-sedinta': { id: 'ems', name: 'EMS', zones: ['Abdomen', 'Coapse', 'Brațe'], need: 'corp', ph: 'concern-tonifiere.webp', b: ['20.000 de contracții într-o ședință', 'Tonifiază mușchii, fără efort'] },
  'radiofrecventa-o-zona-corporala-1-sedinta': { id: 'radiofrecventa', name: 'Radiofrecvență', zones: ['Abdomen', 'Coapse', 'Brațe'], need: 'corp', ph: 'concern-cellulite-2.webp', b: ['Reduce aspectul de celulită', 'Strânge pielea'] },
  'hifu-o-zona-corporala-1-sedinta': { id: 'hifu-corp', name: 'HIFU', zones: ['Abdomen', 'Brațe', 'Coapse', 'Gambe', 'Zona lombară'], need: 'corp', ph: 'concern-belly-2.webp', b: ['Strânge pielea lăsată', 'Lifting fără operație'] },
  'impachetare-impachetare-la-cald-1-sedinta': { id: 'impachetare', name: 'Împachetare la cald', need: 'corp', ph: 'concern-detox.webp', b: ['Detoxifiere și drenaj', 'Piele mai netedă'] },
  'hifu-o-zona-mica-faciala-1-sedinta': { id: 'hifu', name: 'HIFU', zones: ZF, need: 'gusa', ph: 'concern-gusa.webp', b: ['Strânge pielea de sub bărbie', 'Fără ace, fără pauză'] },
  'rfsculpt-gusa-plus-contur-mandibular-1-sedinta': { id: 'rf-sculpt-gusa', name: 'RF Sculpt Gușă', need: 'gusa', ph: 'concern-chin-1.webp', b: ['Reduce gușa', 'Conturează linia mandibulei'] },
  'radiofrecventa-o-zona-mica-faciala-1-sedinta': { id: 'biolifting', name: 'BioLifting', zones: ZF, need: 'gusa', ph: 'concern-chin-3.webp', b: ['Stimulează colagenul', 'Piele mai fermă'] },
  'hifu-full-face-1-sedinta': { id: 'hifu-full-face', name: 'HIFU Full Face', need: 'fata', ph: 'concern-face-1.webp', b: ['Strânge pielea lăsată a feței', 'Lifting fără operație'] },
  'radiofrecventa-full-face-1-sedinta': { id: 'biolifting-full-face', name: 'BioLifting Full Face', need: 'fata', ph: 'concern-riduri.webp', b: ['Reduce ridurile fine', 'Piele mai fermă'] },
  'rfsculpt-full-face-1-sedinta': { id: 'rf-sculpt-full-face', name: 'RF Sculpt Full Face', need: 'fata', ph: 'concern-face-2.webp', b: ['Tonifiază toată fața', 'Revitalizează pielea'] },
  'faciale-tratament-restart-1-sedinta': { id: 'restart', name: 'Tratament Restart', need: 'fata', ph: 'restart-ba-premium.webp', b: ['Ten luminos imediat', 'Fără timp de recuperare'] },
  'faciale-masaj-facial-clasic-1-sedinta': { id: 'masaj-facial', name: 'Masaj facial clasic', need: 'fata', ph: 'offer-facial.webp', b: ['Scalp, față, gușă, gât, decolteu', 'Relaxare profundă'] },
  'faciale-tratament-de-hidratare-profunda-1-sedinta': { id: 'hidratare', name: 'Hidratare profundă', need: 'fata', ph: 'concern-stralucire.webp', b: ['Hidratează în profunzime', 'Întărește bariera pielii'] },
  'faciale-tratament-intensiv-antirid-1-sedinta': { id: 'antirid', name: 'Tratament antirid', need: 'fata', ph: 'faciale-closeup.webp', b: ['Diminuează ridurile', 'Regenerează pielea'] },
  'faciale-redness-relief-protocol-1-sedinta': { id: 'redness', name: 'Redness Relief', need: 'fata', ph: 'concern-pete.webp', b: ['Calmează roșeața', 'Pentru pielea sensibilă'] },
  'faciale-sebum-off-protocol-1-sedinta': { id: 'sebum-off', name: 'Sebum Off', need: 'fata', ph: 'concern-ten-problematic.webp', b: ['Curăță porii', 'Reduce imperfecțiunile'] },
  'faciale-microneedling-exozomi-pdrn-1-sedinta': { id: 'microneedling', name: 'Microneedling Exozomi', need: 'fata', ph: 'oferte/facial.webp', b: ['Estompează cicatricile de acnee', 'Textură mai fină'] },
  'faciale-microneedling-corector-periocular-1-sedinta': { id: 'periocular', name: 'Microneedling Periocular', need: 'fata', ph: 'ba-hifu-periocular.webp', b: ['Atenuează cearcănele', 'Linii fine în jurul ochilor'] },
};
// „Merge bine cu” (the owner: „procedurile se completează între ele”): what goes with each one, best first
const PAIRS = {
  liposonix: ['ems', 'radiofrecventa', 'cavitatie'], cavitatie: ['ems', 'radiofrecventa', 'liposonix'], ems: ['liposonix', 'cavitatie', 'impachetare'],
  radiofrecventa: ['liposonix', 'impachetare', 'hifu-corp'], 'hifu-corp': ['radiofrecventa', 'ems', 'liposonix'], impachetare: ['radiofrecventa', 'cavitatie'],
  hifu: ['rf-sculpt-gusa', 'biolifting', 'masaj-facial'], 'rf-sculpt-gusa': ['hifu', 'biolifting'], biolifting: ['hifu', 'rf-sculpt-gusa'],
  'hifu-full-face': ['biolifting-full-face', 'restart'], 'biolifting-full-face': ['hifu-full-face', 'restart'], 'rf-sculpt-full-face': ['hifu-full-face', 'restart'],
  restart: ['masaj-facial', 'biolifting-full-face', 'hidratare'], 'masaj-facial': ['restart', 'hidratare'], hidratare: ['masaj-facial', 'restart'],
  antirid: ['biolifting-full-face', 'hifu-full-face'], redness: ['hidratare', 'masaj-facial'], 'sebum-off': ['microneedling', 'restart'],
  microneedling: ['hidratare', 'restart'], periocular: ['hidratare', 'biolifting-full-face'],
};
const EPIL_PAIRS = ['epilare-axile', 'epilare-inghinal-total', 'epilare-picior-lung', 'epilare-linie-bikini'];
const IMPULSE = { 'Timișoara': 'epilare-axile', Arad: 'masaj-facial' };
// the first screen's slider (the owner, 24.11): these, in this order
const SHOW = ['liposonix', 'hifu', 'restart', 'rf-sculpt-gusa', 'epilare-full-body', 'hifu-full-face', 'ems'];
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lst = () => require('./pay').priceList();
// the picture of the live Black Friday cards (v2/kit.js PIC): a cut-out of the treated area
const picOf = (m) => (m.need === 'gusa' ? 'hifu-gusa' : m.need === 'fata' ? 'facial' : /^(cavitatie|ems)$/.test(m.id) ? 'cavitatie' : 'liposonix');
// a price list row (one session) → its product, or null (packages, the 2-zone EMS: not sold one by one here)
function productOf(t) {
  if (!t || t.sessions !== 1) return null;
  if (t.group === 'epilare') {
    const parts = t.title.split(' · '); // Epilare laser · [Elysion Pro ·] Zona · femei|bărbați · 1 ședință
    const men = parts.includes('bărbați');
    const zone = parts.filter((x) => !/^(Epilare laser|Elysion Pro|femei|bărbați|1 ședință)$/.test(x))[0] || '';
    const z = zone.replace(/ \(.*\)/, '');
    return { id: fold('epilare ' + z + (men ? ' barbati' : '')), name: 'Epilare ' + z + (men ? ' bărbați' : ''), need: 'epilare', zones: [],
      b: [/Full Body/.test(z) ? 'Tot corpul, fără față' : 'Distruge foliculul firului de păr', 'Nedureros, certificat medical'],
      photo: '/brand_asset/oferte/epilare.webp?v=3',
      guarantee: 'Garanția banilor înapoi.' };
  }
  const m = P[t.id];
  return m ? { id: m.id, name: m.name, need: m.need, zones: m.zones || [], b: m.b, photo: '/brand_asset/oferte/' + picOf(m) + '.webp?v=3' } : null;
}
const priceOf = (full, at) => (bfOn(at) ? Math.round(full * (100 - BF.pct) / 100) : require('./pay').bonusPrice(full, require('./pay').BONUS_PCT));

// the catalog of a city (or both), at this moment's prices: one session each
function catalog(city, at) {
  const out = new Map();
  for (const t of lst()) {
    if (city && !t.cities.includes(city)) continue;
    const p = productOf(t);
    if (!p || out.has(p.id)) continue;
    out.set(p.id, Object.assign(p, { ref: t.id, cities: t.cities.slice(), minutes: t.minutes, full: t.price, price: priceOf(t.price, at) }));
  }
  const list = [...out.values()];
  list.forEach((p) => { p.pairs = (p.need === 'epilare' ? EPIL_PAIRS : PAIRS[p.id] || []).filter((id) => id !== p.id && out.has(id)).slice(0, 3); });
  return list;
}

async function terms(at) {
  const now = at || Date.now();
  return { now, bf: bfOn(now), end: BF.end, start: BF.start, pct: bfOn(now) ? BF.pct : require('./pay').BONUS_PCT, tiers: await tiers(), needs: NEEDS, impulse: IMPULSE, show: SHOW };
}

// the cart, priced here. items: [{ id: product id, qty: 1-10, zone }] → { lines, full, amount, saved, main }
function clean(items) {
  const seen = new Map();
  (Array.isArray(items) ? items : []).slice(0, 20).forEach((x) => {
    const o = typeof x === 'string' ? { id: x } : x || {};
    const id = String(o.id || '').slice(0, 80), zone = String(o.zone || '').slice(0, 40), qty = Math.max(1, Math.min(10, Math.floor(Number(o.qty) || 1)));
    if (id) seen.set(id + '|' + zone, { id, zone, qty });
  });
  return [...seen.values()].slice(0, 12);
}
async function quote(city, items, at) {
  const now = at || Date.now();
  const all = new Map(catalog('', now).map((p) => [p.id, p]));
  const lines = [];
  for (const it of clean(items)) {
    const p = all.get(it.id);
    if (!p) return { error: 'not_found', id: it.id };
    if (!p.cities.includes(city)) return { error: 'not_in_city', id: it.id };
    const zone = p.zones.length ? (p.zones.includes(it.zone) ? it.zone : p.zones[0]) : '';
    lines.push({ id: p.id, ref: p.ref, zone, qty: it.qty, name: p.name + (zone ? ' ' + zone : ''), minutes: p.minutes, unit: p.full, unitPrice: p.price, full: p.full * it.qty, price: p.price * it.qty });
  }
  if (!lines.length) return { error: 'empty' };
  const full = lines.reduce((s, l) => s + l.full, 0), amount = lines.reduce((s, l) => s + l.price, 0);
  const tl = await tiers();
  const reached = tl.filter((x) => amount >= x.at), next = tl.find((x) => amount < x.at) || null;
  // the visit she books: the main treatment (the dearest session) is her first session
  const main = lines.slice().sort((a, b) => b.unit - a.unit)[0];
  return { city, lines, full, amount, saved: full - amount, bf: bfOn(now), pct: bfOn(now) ? BF.pct : require('./pay').BONUS_PCT, end: BF.end, reached, next: next ? Object.assign({ missing: next.at - amount }, next) : null, main: { id: main.ref, name: main.name, minutes: main.minutes } };
}
const summary = (q) => q.lines.map((l) => l.name + (l.qty > 1 ? ' × ' + l.qty : '')).join(' + ');
const giftsOf = (q) => q.reached.map((x) => x.title + (x.sub ? ' ' + x.sub : '')).join('; ');

// pay.js kind 'shop' (ref = the hold): the sum, from the cart the hold carries, at this moment's prices
async function payQuote({ ref }) {
  const H = require('./booking-holds');
  const h = await H.get(ref);
  if (!h || !h.cart) return { error: 'not_found' };
  if (h.bookingId) return { error: 'already_paid' };
  if (!H.live(h)) return { error: 'expired' };
  const q = await quote(h.city, h.cart.items);
  if (q.error) return { error: q.error };
  const gifts = giftsOf(q);
  return {
    amount: q.amount, full: q.full, title: ('Comandă online: ' + summary(q)).slice(0, 120), city: h.city,
    name: (h.contact || {}).name || '', phone: (h.contact || {}).phone || '', src: h.src, cookie: h.cookie, app: h.app,
    bonus: gifts ? { type: 'gift', gift: gifts, line: q.bf ? '-' + q.pct + '% Black Friday + cadouri' : '-' + q.pct + '% la plata online' } : { type: 'pct', pct: q.pct, line: q.bf ? '-' + q.pct + '% Black Friday' : '-' + q.pct + '% la plata online' },
    bonusText: q.bf ? '-' + q.pct + '% Black Friday, plătit online' : '-' + q.pct + '% la plata online',
  };
}

module.exports = { BF, bfOn, TIERS_DEFAULT, tiers, NEEDS, catalog, terms, quote, clean, summary, giftsOf, payQuote, productOf, priceOf };
