// The site's shop (the owner, 24.11: „site-ul devine strict un magazin online”). She puts the treatments she wants in a cart,
// books the free consultation or her first session, pays by card on the site; the booking is confirmed only when it is paid.
//
// Everything is decided here, never by the page:
//   the catalog  the price list (price-list.gen.json, made from Prețuri), grouped by treatment, each with its packages
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
//   data/booking-holds.json  the hold carries the cart: cart { items: [price list id], visit: 'consult' | 'first', at }
const { readJSON } = require('./store');

const BF = {
  start: '2026-11-24T08:00:00.000Z', // Tuesday 24.11, 10:00 in Romania (the same start as the card's)
  end: '2026-11-27T21:59:59.000Z', // Friday 27.11, 23:59:59 in Romania (the owner, 24.11)
  pct: 50,
};
const bfOn = (t) => { const x = t || Date.now(); return x >= Date.parse(BF.start) && x <= Date.parse(BF.end); };

// the steps (the owner, 24.11: 550, 990, 4990). value: what the gift is worth at the price list, for the page's value stack
const TIERS_DEFAULT = [
  { at: 550, id: 'gift200', title: 'Card cadou de 200 lei', sub: 'pentru o prietenă, la primul ei tratament', value: 200 },
  { at: 990, id: 'rf-face', title: 'O ședință de Radiofrecvență Full Face', sub: 'cadou pentru tine', value: 280 },
  { at: 4990, id: 'gift1000', title: 'Card cadou de 1.000 lei în tratamente', sub: 'pentru tine sau de dăruit', value: 1000 },
];
async function tiers() {
  const d = await readJSON('data/shop-bonus.json', null).catch(() => null);
  const l = d && Array.isArray(d.tiers) ? d.tiers.filter((x) => x && Number(x.at) > 0 && x.title) : null;
  return (l && l.length ? l : TIERS_DEFAULT).map((x) => ({ at: Number(x.at), id: String(x.id || x.at), title: String(x.title), sub: String(x.sub || ''), value: Number(x.value) || 0 })).sort((a, b) => a.at - b.at);
}

// ---- the catalog: one product per treatment, its packages as options
const NEEDS = [
  { id: 'corp', title: 'Corp', sub: 'Grăsime localizată, tonifiere, celulită' },
  { id: 'gusa', title: 'Gușă și contur', sub: 'Bărbie, gât, linia mandibulei' },
  { id: 'fata', title: 'Față', sub: 'Riduri, fermitate, ten' },
  { id: 'epilare', title: 'Epilare laser', sub: 'Doar în Timișoara' },
];
// the treatment's base name (the title without its sessions) → its page words (from Prețuri, word for word), need, picture
const P = {
  'Liposonix · O zonă corporală': { need: 'corp', d: 'Ultrasunete focalizate care distrug celulele de grăsime din zonele tratate: remodelare corporală fără recuperare.', z: 'Abdomen, brațe, coapse, zona lombară: grăsime localizată rezistentă la dietă.', img: 'ba-liposonix-premium.webp', top: 1 },
  'Electrostimulare Magnetică (EMS) · O zonă': { need: 'corp', d: 'Contracții musculare intense și controlate: tonifiere, fermitate și definirea zonelor corporale.', img: 'concern-tonifiere.webp' },
  'Electrostimulare Magnetică (EMS) · 2 zone': { need: 'corp', d: 'Două grupe musculare în aceeași ședință.', img: 'concern-tonifiere.webp' },
  'Radiofrecvență · O zonă corporală': { need: 'corp', d: 'Energie termică controlată: stimulează colagenul și elastina pentru fermitate, reducerea ridurilor și a celulitei.', z: 'Abdomen, brațe, coapse: celulită, fermitate și depozite mici de grăsime.', img: 'concern-celulita.webp' },
  'HIFU · O zonă corporală': { need: 'corp', d: 'Ultrasunete focalizate de mare intensitate: lifting non-chirurgical, fermitate și redefinirea conturului.', z: 'Abdomen, brațe, coapse, gambe, zona lombară, zona sutien.', img: 'concern-belly-2.webp' },
  'Împachetare la cald · Împachetare la cald': { name: 'Împachetare la cald', need: 'corp', d: 'Tratament relaxant și detoxifiant: stimulează circulația, drenajul și absorbția ingredientelor active.', img: 'concern-detox.webp' },
  'RF Sculpt · Gușă + Contur Mandibular': { need: 'gusa', d: 'Reduce gușa și redefinește linia mandibulei.', img: 'gusa-ba-premium.webp', top: 1 },
  'HIFU · O zonă mică facială': { need: 'gusa', d: 'Ultrasunete focalizate de mare intensitate: lifting non-chirurgical, fermitate și redefinirea conturului facial.', z: 'Gușă, gât, contur mandibular, pomeți, periocular, perioral, frunte.', img: 'ba-hifu-barbie-gat.webp', top: 1 },
  'Radiofrecvență · O zonă mică facială': { need: 'gusa', d: 'Energie termică controlată: stimulează colagenul și elastina pentru fermitate.', z: 'Gușă, gât, contur mandibular, pomeți, periocular, perioral, frunte.', img: 'concern-chin-2.webp' },
  'HIFU · Full Face': { need: 'fata', d: 'Ultrasunete focalizate de mare intensitate: lifting non-chirurgical și fermitate.', z: 'Laxitate la nivelul întregii fețe, riduri și pierderea conturului facial.', img: 'ba-hifu-periocular.webp' },
  'RF Sculpt · Full Face': { need: 'fata', d: 'Tonifiere și revitalizare la nivelul întregii fețe.', img: 'concern-face-2.webp' },
  'Radiofrecvență · Full Face': { need: 'fata', d: 'Energie termică controlată: stimulează colagenul și elastina.', z: 'Laxitate la nivelul întregii fețe, riduri și pierderea elasticității.', img: 'concern-riduri.webp' },
  'Tratamente faciale · Tratament Restart': { name: 'Tratament facial Restart', need: 'fata', d: 'Revitalizează pielea, îmbunătățește textura și redă luminozitatea naturală.', img: 'restart-ba-premium.webp', top: 1 },
  'Tratamente faciale · Tratament de hidratare profundă': { name: 'Hidratare profundă', need: 'fata', d: 'Reface nivelul optim de apă al pielii și întărește bariera cutanată.', img: 'concern-stralucire.webp' },
  'Tratamente faciale · Tratament intensiv antirid': { name: 'Tratament intensiv antirid', need: 'fata', d: 'Diminuează ridurile și liniile fine, stimulând regenerarea pielii.', img: 'concern-riduri.webp' },
  'Tratamente faciale · Redness Relief Protocol': { name: 'Redness Relief Protocol', need: 'fata', d: 'Calmează roșeața și reechilibrează pielea sensibilă, reactivă sau cuperozică.', img: 'concern-face-1.webp' },
  'Tratamente faciale · Sebum Off Protocol': { name: 'Sebum Off Protocol', need: 'fata', d: 'Reglează secreția de sebum, curăță porii și reduce imperfecțiunile.', img: 'concern-ten-problematic.webp' },
  'Tratamente faciale · Microneedling Exozomi PDRN': { name: 'Microneedling Exozomi PDRN', need: 'fata', d: 'Regenerare prin microperforații: cicatrici post-acneice, textură și fermitate.', img: 'faciale-closeup.webp' },
  'Tratamente faciale · Microneedling Corector Periocular': { name: 'Microneedling Corector Periocular', need: 'fata', d: 'Țintit pe zona ochilor: cearcăne, hidratare și linii fine.', img: 'faciale-closeup.webp' },
};
const EPIL_D = 'Laser cu diodă, certificat medical. Pentru rezultat progresiv definitiv sunt necesare în general 6-8 ședințe, în funcție de tipul de păr și de piele.';
// „Merge bine cu” (the owner: „procedurile se completează între ele”): what goes with each treatment, best first
const PAIRS = {
  'liposonix-o-zona-corporala': ['ems-o-zona', 'radiofrecventa-o-zona-corporala', 'impachetare-la-cald'],
  'ems-o-zona': ['liposonix-o-zona-corporala', 'impachetare-la-cald', 'radiofrecventa-o-zona-corporala'],
  'ems-2-zone': ['liposonix-o-zona-corporala', 'impachetare-la-cald'],
  'radiofrecventa-o-zona-corporala': ['liposonix-o-zona-corporala', 'impachetare-la-cald', 'ems-o-zona'],
  'hifu-o-zona-corporala': ['radiofrecventa-o-zona-corporala', 'ems-o-zona', 'liposonix-o-zona-corporala'],
  'impachetare-la-cald': ['radiofrecventa-o-zona-corporala', 'liposonix-o-zona-corporala'],
  'rf-sculpt-gusa-contur-mandibular': ['hifu-o-zona-mica-faciala', 'tratament-restart'],
  'hifu-o-zona-mica-faciala': ['rf-sculpt-gusa-contur-mandibular', 'radiofrecventa-full-face'],
  'radiofrecventa-o-zona-mica-faciala': ['hifu-o-zona-mica-faciala', 'rf-sculpt-gusa-contur-mandibular'],
  'hifu-full-face': ['rf-sculpt-full-face', 'tratament-de-hidratare-profunda'],
  'rf-sculpt-full-face': ['hifu-full-face', 'tratament-restart'],
  'radiofrecventa-full-face': ['hifu-o-zona-mica-faciala', 'tratament-intensiv-antirid'],
  'tratament-restart': ['radiofrecventa-full-face', 'hifu-o-zona-mica-faciala'],
  'tratament-de-hidratare-profunda': ['radiofrecventa-full-face', 'microneedling-corector-periocular'],
  'tratament-intensiv-antirid': ['hifu-full-face', 'radiofrecventa-full-face'],
  'redness-relief-protocol': ['tratament-de-hidratare-profunda'],
  'sebum-off-protocol': ['microneedling-exozomi-pdrn', 'tratament-restart'],
  'microneedling-exozomi-pdrn': ['tratament-de-hidratare-profunda', 'radiofrecventa-full-face'],
  'microneedling-corector-periocular': ['hifu-o-zona-mica-faciala', 'tratament-de-hidratare-profunda'],
};
const EPIL_PAIRS = ['epilare-axile-femei', 'epilare-inghinal-total-femei', 'epilare-picior-lung-complet-femei', 'epilare-linie-bikini-femei'];
// the small add-on offered before paying (impulse): one per city, cheap, goes with anything
const IMPULSE = { 'Timișoara': 'epilare-axile-femei', Arad: 'radiofrecventa-o-zona-mica-faciala' };

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lst = () => require('./pay').priceList();
// a price list row → its treatment's base name and the package's label
function split(t) {
  const parts = t.title.split(' · ');
  const last = parts[parts.length - 1];
  const pack = /ședin/.test(last) ? parts.pop() : '';
  return { base: parts.join(' · '), pack: pack.replace(/^Pachet\s+/, '') || '1 ședință' };
}
function productOf(t) {
  const { base } = split(t);
  if (t.group === 'epilare') {
    const n = base.replace(/^Epilare laser · (Elysion Pro · )?/, '');
    return { id: fold('epilare ' + n), name: 'Epilare laser · ' + n, need: 'epilare', d: /Full Body/.test(n) ? 'Toate zonele de corp, fără față: axile, inghinal total, brațe total, picior lung. ' + EPIL_D : EPIL_D, img: /Full Body/.test(n) ? 'offer-epilare.webp' : 'epilare-legs.webp', top: /Full Body/.test(n) ? 1 : 0, guarantee: 'Garanția banilor înapoi.' };
  }
  const m = P[base];
  if (!m) return null;
  const id = fold(base.replace(/^Tratamente faciale · /, '').replace(/^Electrostimulare Magnetică \(EMS\)/, 'EMS').replace(/^Împachetare la cald · /, ''));
  return { id, name: m.name || base, need: m.need, d: m.d, z: m.z || '', img: m.img, top: m.top || 0 };
}
const priceOf = (full, at) => (bfOn(at) ? Math.round(full * (100 - BF.pct) / 100) : require('./pay').bonusPrice(full, require('./pay').BONUS_PCT));

// the catalog of a city (or both), at this moment's prices
function catalog(city, at) {
  const out = new Map();
  for (const t of lst()) {
    if (city && !t.cities.includes(city)) continue;
    const p = productOf(t);
    if (!p) continue;
    if (!out.has(p.id)) out.set(p.id, Object.assign(p, { cities: [], options: [] }));
    const x = out.get(p.id);
    t.cities.forEach((c) => { if (!x.cities.includes(c)) x.cities.push(c); });
    x.options.push({ id: t.id, label: split(t).pack, sessions: t.sessions, minutes: t.minutes, full: t.price, price: priceOf(t.price, at) });
  }
  const list = [...out.values()];
  list.forEach((p) => {
    p.options.sort((a, b) => a.sessions - b.sessions);
    p.from = Math.min(...p.options.map((o) => o.price));
    const pairs = p.need === 'epilare' ? EPIL_PAIRS : PAIRS[p.id] || [];
    p.pairs = pairs.filter((id) => id !== p.id && out.has(id)).slice(0, 3);
  });
  return list;
}

async function terms(at) {
  const now = at || Date.now();
  return { now, bf: bfOn(now), end: BF.end, start: BF.start, pct: bfOn(now) ? BF.pct : require('./pay').BONUS_PCT, tiers: await tiers(), needs: NEEDS, impulse: IMPULSE };
}

// the cart, priced here: items = price list ids (each once), in her city → { lines, full, amount, saved, reached, next, minutes }
async function quote(city, items, at) {
  const now = at || Date.now();
  const P2 = require('./pay');
  const ids = [...new Set((Array.isArray(items) ? items : []).map((x) => String(x || '').slice(0, 120)))].slice(0, 12);
  const lines = [];
  for (const id of ids) {
    const t = P2.treatment(id, city);
    if (!t) return { error: P2.treatment(id) ? 'not_in_city' : 'not_found', id };
    const p = productOf(t);
    if (!p) return { error: 'not_found', id };
    lines.push({ id, product: p.id, name: p.name, pack: split(t).pack, minutes: t.minutes, full: t.price, price: priceOf(t.price, now) });
  }
  if (!lines.length) return { error: 'empty' };
  const full = lines.reduce((s, l) => s + l.full, 0), amount = lines.reduce((s, l) => s + l.price, 0);
  const all = await tiers();
  const reached = all.filter((x) => amount >= x.at), next = all.find((x) => amount < x.at) || null;
  // the visit she books: the main treatment (the dearest) is her first session
  const main = lines.slice().sort((a, b) => b.full - a.full)[0];
  return { city, lines, full, amount, saved: full - amount, bf: bfOn(now), pct: bfOn(now) ? BF.pct : P2.BONUS_PCT, end: BF.end, reached, next: next ? Object.assign({ missing: next.at - amount }, next) : null, main: { id: main.id, name: main.name, minutes: main.minutes } };
}
const summary = (q) => q.lines.map((l) => l.name + ' (' + l.pack + ')').join(' + ');
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

module.exports = { BF, bfOn, TIERS_DEFAULT, tiers, NEEDS, catalog, terms, quote, summary, giftsOf, payQuote, productOf, priceOf };
