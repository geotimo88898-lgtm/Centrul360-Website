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
  'radiofrecventa-o-zona-mica-faciala-1-sedinta': { id: 'biolifting', name: 'BioLifting', zones: ZF, need: 'gusa', ph: 'concern-chin-3.webp', b: ['Stimulează colagenul', 'Piele mai fermă'] },
  'hifu-full-face-1-sedinta': { id: 'hifu-full-face', name: 'HIFU Full Face', need: 'fata', ph: 'concern-face-1.webp', b: ['Strânge pielea lăsată a feței', 'Lifting fără operație'] },
  'radiofrecventa-full-face-1-sedinta': { id: 'biolifting-full-face', name: 'BioLifting Full Face', need: 'fata', ph: 'concern-riduri.webp', b: ['Reduce ridurile fine', 'Piele mai fermă'] },
  'faciale-tratament-restart-1-sedinta': { id: 'restart', name: 'Tratament Restart', need: 'fata', ph: 'restart-ba-premium.webp', b: ['Ten luminos imediat', 'Fără timp de recuperare'] },
  'faciale-masaj-facial-clasic-1-sedinta': { id: 'masaj-facial', name: 'Masaj facial clasic', need: 'fata', ph: 'offer-facial.webp', b: ['Scalp, față, gușă, gât, decolteu', 'Relaxare profundă'] },
  'faciale-tratament-de-hidratare-profunda-1-sedinta': { id: 'hidratare', name: 'Hidratare profundă', need: 'fata', ph: 'concern-stralucire.webp', b: ['Hidratează în profunzime', 'Întărește bariera pielii'] },
  'faciale-tratament-intensiv-antirid-1-sedinta': { id: 'antirid', name: 'Tratament antirid', need: 'fata', ph: 'faciale-closeup.webp', b: ['Diminuează ridurile', 'Regenerează pielea'] },
  'faciale-redness-relief-protocol-1-sedinta': { id: 'redness', name: 'Redness Relief', need: 'fata', ph: 'concern-pete.webp', b: ['Calmează roșeața', 'Pentru pielea sensibilă'] },
  'faciale-sebum-off-protocol-1-sedinta': { id: 'sebum-off', name: 'Sebum Off', need: 'fata', ph: 'concern-ten-problematic.webp', b: ['Curăță porii', 'Reduce imperfecțiunile'] },
};
// „Merge bine cu” (the owner: „procedurile se completează între ele”): what goes with each one, best first
const PAIRS = {
  liposonix: ['ems', 'radiofrecventa', 'cavitatie'], cavitatie: ['ems', 'radiofrecventa', 'liposonix'], ems: ['liposonix', 'cavitatie', 'impachetare'],
  radiofrecventa: ['liposonix', 'impachetare', 'hifu-corp'], 'hifu-corp': ['radiofrecventa', 'ems', 'liposonix'], impachetare: ['radiofrecventa', 'cavitatie'],
  hifu: ['biolifting', 'masaj-facial'], biolifting: ['hifu', 'masaj-facial'],
  'hifu-full-face': ['biolifting-full-face', 'restart'], 'biolifting-full-face': ['hifu-full-face', 'restart'],
  restart: ['masaj-facial', 'biolifting-full-face', 'hidratare'], 'masaj-facial': ['restart', 'hidratare'], hidratare: ['masaj-facial', 'restart'],
  antirid: ['biolifting-full-face', 'hifu-full-face'], redness: ['hidratare', 'masaj-facial'], 'sebum-off': ['restart', 'hidratare'],
};
const EPIL_PAIRS = ['epilare-axile', 'epilare-inghinal-total', 'epilare-picior-lung', 'epilare-linie-bikini'];
// the problem packages (the owner, 25.11: „pachete pe probleme, pentru toate procedurile, ca să avem upsell power”): the treatments
// that solve one problem together. Every part at its price list price (the price list's package where there is one), the sum
// at the same -50%: no price of their own. for: the treatments in the cart that offer it. A proposal until the owner's „da”.
// the problem packages (the owner, 25.11: „pachete pe probleme, pentru toate bugetele, până la 4.000+ lei; numele vinde rezultatul și
// timpul, la epilare TEST și COMPLET cu rezultat garantat”). tier: 1 the first step, 2 the solution (the one recommended), 3 the
// complete one (for who wants more: „să nu-i oferim 500 de lei unei cliente care poate 5.000, dar nici să le împingem pe toate”).
// only: the zones it is made for. „for” (the treatments it is offered with) comes from its parts.
const BUNDLES = [
  // gușă și contur
  { id: 'pachet-gusa-start', tier: 1, name: 'Primul contur în 30 de zile', need: 'gusa', b: 'Prima dată la noi: vezi efectul pe zona ta', parts: [['hifu', 1], ['biolifting', 1]] },
  { id: 'pachet-gusa', tier: 2, name: 'Contur definit în 28 de zile', need: 'gusa', b: 'HIFU strânge, BioLifting fermizează, o dată pe săptămână', parts: [['hifu', 1], ['biolifting-x4', 1]] },
  { id: 'pachet-gusa-pro', tier: 3, name: 'Profil nou în 90 de zile', need: 'gusa', b: 'Gușă pronunțată: două HIFU, 4 BioLifting și un masaj', parts: [['hifu', 2], ['biolifting-x4', 1], ['masaj-facial', 1]] },
  // față
  { id: 'pachet-ten-start', tier: 1, name: 'Ten luminos din prima zi', need: 'fata', b: 'Ten tern, obosit: Restart și masaj, rezultat pe loc', parts: [['restart', 1], ['masaj-facial', 1]] },
  { id: 'pachet-relaxare', tier: 2, name: 'Ten odihnit în 4 săptămâni', need: 'fata', b: 'Un masaj pe săptămână și o hidratare profundă', parts: [['masaj-facial', 4], ['hidratare', 1]] },
  { id: 'pachet-rosu-start', tier: 1, name: 'Piele calmă în 21 de zile', need: 'fata', b: 'Piele sensibilă, roșeață', parts: [['redness-x2', 1], ['hidratare', 1]] },
  { id: 'pachet-curat-start', tier: 1, name: 'Pori curați în 21 de zile', need: 'fata', b: 'Pori dilatați, sebum, ten încărcat', parts: [['sebum-off-x2', 1], ['restart', 1]] },
  { id: 'pachet-ten', tier: 2, name: 'Ten luminos în 28 de zile', need: 'fata', b: 'Strălucire care ține, nu doar o zi', parts: [['restart-x2', 1], ['hidratare-x2', 1]] },
  { id: 'pachet-antiage-start', tier: 1, name: 'Piele mai fermă în 28 de zile', need: 'fata', b: 'Primele riduri, piele obosită', parts: [['antirid-x2', 1], ['hidratare-x2', 1]] },
  { id: 'pachet-acnee', tier: 2, name: 'Ten curat în 6 săptămâni', need: 'fata', b: 'Sebum sub control, ten hidratat', parts: [['sebum-off-x4', 1], ['hidratare-x2', 1]] },
  { id: 'pachet-rosu', tier: 2, name: 'Roșeață calmată în 6 săptămâni', need: 'fata', b: 'Roșeață, cuperoză: protocolul complet', parts: [['redness-x4', 1], ['hidratare-x2', 1]] },
  { id: 'pachet-glow', tier: 3, name: 'Ten de revistă în 8 săptămâni', need: 'fata', b: 'Ten luminos și hidratat, o ședință la 2 săptămâni', parts: [['restart-x2', 1], ['hidratare-x4', 1], ['masaj-facial', 2]] },
  { id: 'pachet-lifting', tier: 2, name: 'Față liftată în 8 săptămâni', need: 'fata', b: 'Piele lăsată pe față: HIFU Full Face și 4 BioLifting', parts: [['hifu-full-face', 1], ['biolifting-full-face-x4', 1]] },
  { id: 'pachet-riduri', tier: 2, name: 'Riduri estompate în 8 săptămâni', need: 'fata', b: 'Riduri vizibile: antirid și fermitate', parts: [['antirid-x4', 1], ['biolifting-full-face-x4', 1]] },
  { id: 'pachet-lifting-an', tier: 3, name: 'Față tânără 12 luni', need: 'fata', b: 'Tot anul: 2 HIFU Full Face (la 6 luni), fermitate, strălucire', parts: [['hifu-full-face-x2', 1], ['biolifting-full-face-x4', 1], ['restart-x2', 1]] },
  // complete: more than one problem solved at once (the owner, 25.11: „la HIFU gușă putem recomanda și BioLifting Full Face, pachete
  // mai complete care rezolvă mai multe probleme”)
  { id: 'pachet-gusa-fata', tier: 3, name: 'Gușă și față liftată în 90 de zile', need: 'gusa', b: 'Bărbia dublă și toată fața: HIFU pe zonă, HIFU Full Face, 4 BioLifting Full Face', parts: [['hifu', 1], ['hifu-full-face', 1], ['biolifting-full-face-x4', 1]] },
  { id: 'pachet-gusa-360', tier: 3, name: 'Față și gât 360 în 6 luni', need: 'gusa', b: 'Contur, lifting, fermitate și strălucire: tot ce ține de față și gât', parts: [['hifu', 2], ['hifu-full-face', 1], ['biolifting-full-face-x4', 1], ['restart-x2', 1]] },
  { id: 'pachet-ten-lifting', tier: 3, name: 'Ten luminos și liftat în 8 săptămâni', need: 'fata', b: 'Strălucire și lifting: HIFU Full Face, 2 Restart, 2 hidratări', parts: [['hifu-full-face', 1], ['restart-x2', 1], ['hidratare-x2', 1]] },
  { id: 'pachet-riduri-pro', tier: 3, name: 'Riduri și lifting în 12 săptămâni', need: 'fata', b: 'Riduri estompate și față liftată: antirid, HIFU Full Face, BioLifting', parts: [['antirid-x4', 1], ['hifu-full-face', 1], ['biolifting-full-face-x4', 1]] },
  { id: 'pachet-ten-perfect', tier: 3, name: 'Ten perfect în 12 săptămâni', need: 'fata', b: 'Pori curați, roșeață calmată, ten luminos și hidratat', parts: [['sebum-off-x4', 1], ['redness-x2', 1], ['restart-x2', 1], ['hidratare-x4', 1]] },
  { id: 'pachet-picioare-vara', tier: 3, name: 'Picioare de vară în 90 de zile', need: 'corp', b: 'Grăsime, celulită și retenție pe aceeași zonă', parts: [['liposonix-x2', 1], ['radiofrecventa-x6', 1], ['cavitatie', 6], ['impachetare-x6', 1]] },
  { id: 'pachet-corp-ferm', tier: 3, name: 'Corp ferm 360 în 90 de zile', need: 'corp', b: 'Piele strânsă, mușchi tonifiați, fermitate', parts: [['hifu-corp-x2', 1], ['radiofrecventa-x6', 1], ['ems-x8', 1]] },
  { id: 'pachet-fata-360', tier: 3, name: 'Transformare 360 · Față în 6 luni', need: 'fata', b: 'Lifting, fermitate, strălucire și hidratare', parts: [['hifu-full-face-x2', 1], ['biolifting-full-face-x4', 1], ['restart-x2', 1], ['hidratare-x4', 1]] },
  // corp
  { id: 'pachet-corp-start', tier: 1, name: 'Zonă mai suplă · Start în 30 de zile', need: 'corp', b: 'Prima ședință de Liposonix și fermitate, pe zona ta', parts: [['liposonix', 1], ['radiofrecventa', 1]] },
  { id: 'pachet-detox-start', tier: 1, name: 'Corp mai ușor în 6 săptămâni', need: 'corp', b: 'Retenție de apă, umflături', parts: [['impachetare-x6', 1], ['radiofrecventa', 1]] },
  { id: 'pachet-fermitate-start', tier: 1, name: 'Piele strânsă în 30 de zile', need: 'corp', b: 'Piele lăsată după slăbit', parts: [['hifu-corp', 1], ['radiofrecventa', 2]] },
  { id: 'pachet-tonus-start', tier: 1, name: 'Mușchi tonifiați în 21 de zile', need: 'corp', b: '6 EMS, de două ori pe săptămână, și o împachetare', parts: [['ems-x6', 1], ['impachetare', 1]] },
  { id: 'pachet-brate', tier: 2, name: 'Brațe ferme în 8 săptămâni', need: 'corp', b: 'Brațe cu grăsime și piele lăsată', parts: [['liposonix-x2', 1], ['hifu-corp', 1]], only: ['Brațe'] },
  { id: 'pachet-celulita-start', tier: 1, name: 'Piele mai netedă în 28 de zile', need: 'corp', b: 'Coajă de portocală, la început', parts: [['radiofrecventa-x4', 1], ['cavitatie', 3]] },
  { id: 'pachet-detox', tier: 2, name: 'Picioare ușoare în 6 săptămâni', need: 'corp', b: 'Celulită apoasă, picioare grele', parts: [['impachetare-x6', 1], ['cavitatie', 4]] },
  { id: 'pachet-grasime', tier: 2, name: 'Zonă mai suplă în 8 săptămâni', need: 'corp', b: 'Grăsimea care nu pleacă cu dieta: Liposonix și fermitate', parts: [['liposonix-x2', 1], ['radiofrecventa-x4', 1]] },
  { id: 'pachet-tonifiere', tier: 2, name: 'Abdomen tonifiat în 8 săptămâni', need: 'corp', b: 'Mai puțină grăsime, mușchi definit', parts: [['liposonix-x2', 1], ['ems-x6', 1]] },
  { id: 'pachet-fermitate', tier: 2, name: 'Piele strânsă în 90 de zile', need: 'corp', b: 'Piele lăsată: protocolul complet', parts: [['hifu-corp-x2', 1], ['radiofrecventa-x4', 1]] },
  { id: 'pachet-corp-definit', tier: 2, name: 'Corp definit în 6 săptămâni', need: 'corp', b: 'Corp ferm, fără sală', parts: [['ems-x8', 1], ['radiofrecventa-x4', 1]] },
  { id: 'pachet-mami', tier: 3, name: 'Mami · burtică nouă în 90 de zile', need: 'corp', b: 'Burtica de după sarcină: grăsime, piele lăsată, mușchi', parts: [['liposonix-x2', 1], ['hifu-corp', 1], ['ems-x6', 1]], only: ['Abdomen'] },
  { id: 'pachet-celulita', tier: 2, name: 'Piele netedă în 6 săptămâni', need: 'corp', b: 'Celulită vizibilă: protocolul complet', parts: [['radiofrecventa-x6', 1], ['cavitatie', 6]] },
  { id: 'pachet-body-reset', tier: 3, name: 'Body Reset în 90 de zile', need: 'corp', b: 'Grăsime, tonus și fermitate pe aceeași zonă', parts: [['liposonix-x2', 1], ['ems-x8', 1], ['radiofrecventa-x6', 1]] },
  { id: 'pachet-complet-360', tier: 3, name: 'Transformare 360 în 90 de zile', need: 'corp', b: 'O zonă a corpului și toată fața', parts: [['liposonix-x2', 1], ['radiofrecventa-x6', 1], ['hifu-full-face', 1], ['biolifting-full-face-x4', 1], ['restart-x2', 1]] },
  { id: 'pachet-corp-360', tier: 3, name: 'Transformare 360 · Full Body în 90 de zile', need: 'corp', b: 'Tot corpul: Liposonix Full Body de două ori, tonus și fermitate', parts: [['liposonix-toate', 2], ['ems-x8', 1], ['radiofrecventa-x6', 1]] },
  // epilare (no time: TEST and COMPLET, with the written guarantee)
  { id: 'pachet-epil-test', tier: 1, name: 'Epilare TEST · Axile și bikini', need: 'epilare', b: 'O ședință pe fiecare zonă: vezi cum e', parts: [['epilare-axile', 1], ['epilare-linie-bikini', 1]] },
  { id: 'pachet-epil-test-fb', tier: 1, name: 'Epilare TEST · Full Body și față', need: 'epilare', b: 'O ședință pe tot corpul și pe față', parts: [['epilare-full-body', 1], ['epilare-fata-complet', 1]] },
  { id: 'pachet-epil-start', tier: 2, name: 'Epilare COMPLET · Axile și bikini · rezultat garantat', need: 'epilare', b: 'Seria completă de 6, cu garanția scrisă', parts: [['epilare-axile', 6], ['epilare-linie-bikini', 6]] },
  { id: 'pachet-epil-bikini', tier: 2, name: 'Epilare COMPLET · Bikini total și axile · rezultat garantat', need: 'epilare', b: 'Inghinal total și axile, 6 ședințe, cu garanția scrisă', parts: [['epilare-inghinal-total', 6], ['epilare-axile', 6]] },
  { id: 'pachet-epil-vara', tier: 3, name: 'Epilare COMPLET · Picioare, bikini, axile · rezultat garantat', need: 'epilare', b: 'Picior lung, inghinal total, axile, 6 ședințe, cu garanția scrisă', parts: [['epilare-picior-lung', 6], ['epilare-inghinal-total', 6], ['epilare-axile', 6]] },
  { id: 'pachet-epil-total', tier: 3, name: 'Epilare COMPLET · Full Body și față · rezultat garantat', need: 'epilare', b: 'Tot corpul și fața, 6 ședințe, cu garanția scrisă', parts: [['epilare-full-body-x6', 1], ['epilare-fata-complet', 6]] },
];
const IMPULSE = { 'Timișoara': 'epilare-axile', Arad: 'masaj-facial' };
// the first screen's slider (the owner, 24.11): these, in this order
// (RF Sculpt is no longer offered, the owner 25.11: BioLifting in its place)
const ALLZ = new Set(['liposonix', 'cavitatie', 'radiofrecventa', 'hifu-corp', 'ems']), ALLZ_NAME = 'Full Body'; // (the owner, 25.11: „în loc de toate zonele scrie Full Body / Full Face, e mai powerful”)
const SHOW = ['liposonix', 'hifu', 'restart', 'biolifting', 'epilare-full-body', 'hifu-full-face', 'ems'];
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
      // (the owner, 25.11: „la epilare scrie aparat certificat medical”)
      b: ['Aparat certificat medical', /Full Body/.test(z) ? 'Tot corpul, fără față' : 'Distruge foliculul firului de păr'],
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
  const list = [];
  // „Toate zonele” (the owner, 25.11: „la Liposonix să avem și opțiunea toate zonele, lucruri mai costisitoare, mai simplu de ales”): a body
  // treatment with zones is also sold for all its zones at once, as its own product <id>-toate (one session on every zone, the sum of
  // the zones' prices); its first visit is booked at most 90 minutes, the desk plans the rest
  for (const p of out.values()) {
    list.push(p);
    if (!ALLZ.has(p.id) || p.zones.length < 2) continue;
    const n = p.zones.length;
    list.push(Object.assign({}, p, { id: p.id + '-toate', base: p.id, name: p.name + ' ' + ALLZ_NAME, zones: [], allOf: p.zones.slice(), b: ['Toate cele ' + n + ' zone, o ședință', p.b[0]],
      minutes: Math.min(p.minutes * n, 90), full: p.full * n, price: p.price * n }));
  }
  // the price list's packages (the owner, 25.11: „-50% și la pachete”; in the cart „în ce pachet se regăsește ședința”, instead of
  // „merge super cu”): N sessions of a treatment, at the package's list price minus the same discount, as its own product
  // <id>-x<N> (pack: N, base: the session's product, the same zones). Not in the shop's grid (api/shop.js gives them apart):
  // the cart offers them under the session they contain. Her first session is booked like a session's (the package's row
  // carries a session's minutes). Not the RF Sculpt (no longer offered) nor the 2-zone EMS (not sold one by one)
  for (const t of lst()) {
    if (!t || !(t.sessions > 1) || /^(rfsculpt-|ems-2-zone)/.test(t.id) || (city && !t.cities.includes(city))) continue;
    const m = t.id === 'epilare-full-body-pachet-6-sedinte' ? out.get('epilare-full-body') : P[t.id.replace(/-\d+-sedinte$/, '-1-sedinta')] && out.get(P[t.id.replace(/-\d+-sedinte$/, '-1-sedinta')].id);
    if (!m) continue;
    const n = t.sessions, price = priceOf(t.price, at);
    list.push(Object.assign({}, m, { id: m.id + '-x' + n, base: m.id, pack: n, name: m.name + ' · ' + n + ' ședințe', ref: t.id, cities: t.cities.slice(),
      minutes: t.minutes || m.minutes, full: t.price, price, b: [n + ' ședințe, ' + Math.round(price / n) + ' lei ședința', m.b[0]] }));
  }
  // the problem packages, from the products above (a part missing in this city: no package)
  const byId = new Map(list.map((p) => [p.id, p]));
  for (const B of BUNDLES) {
    const parts = B.parts.map(([id, n]) => ({ p: byId.get(id), n }));
    if (parts.some((x) => !x.p)) continue;
    const zoned = parts.filter((x) => x.p.zones.length), zones = (zoned.length ? zoned[0].p.zones.filter((z) => zoned.every((x) => x.p.zones.includes(z))) : []).filter((z) => !B.only || B.only.includes(z));
    if (zoned.length && !zones.length) continue;
    const forIds = [...new Set(parts.map((x) => (x.p.base || x.p.id).replace(/-toate$/, '')))];
    const cities = parts.reduce((c, x) => c.filter((y) => x.p.cities.includes(y)), parts[0].p.cities.slice());
    if (!cities.length) continue;
    const first = parts[0].p, ses = parts.reduce((s, x) => s + x.n * (x.p.pack || 1), 0);
    const word = (x) => { const k = x.n * (x.p.pack || 1); return (x.p.base ? (out.get(x.p.base) || x.p).name : x.p.name) + ', ' + (k === 1 ? '1 ședință' : k + ' ședințe'); };
    list.push({ id: B.id, name: B.name, need: B.need, bundle: true, tier: B.tier || 2, home: first.base || first.id, for: forIds, zones, cities, ref: first.ref, minutes: first.minutes, ses,
      inc: parts.map(word).join(' + '), parts: parts.map((x) => ({ id: x.p.id, n: x.n })), full: parts.reduce((s, x) => s + x.p.full * x.n, 0), price: parts.reduce((s, x) => s + x.p.price * x.n, 0),
      b: [B.b, ses + ' ședințe în total'], photo: first.photo, pairs: [] });
  }
  const ids = new Set(list.map((p) => p.id));
  list.forEach((p) => { if (p.bundle) return; p.pairs = p.pack ? [] : (p.need === 'epilare' ? EPIL_PAIRS : PAIRS[p.base || p.id] || []).filter((id) => id !== p.id && id !== p.base && ids.has(id)).slice(0, 3); });
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
    lines.push({ id: p.id, ref: p.ref, zone, qty: it.qty, name: p.bundle ? p.name + (zone ? ', ' + zone : '') : p.pack && zone ? p.name.replace(' · ', ' ' + zone + ' · ') : p.name + (zone ? ' ' + zone : ''), minutes: p.minutes, unit: p.full, unitPrice: p.price, full: p.full * it.qty, price: p.price * it.qty });
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
  // the Card de Sărbători in the same cart (the owner, 25.11), h.cart.card = { tier, qty: 1 }: its order made by the card's
  // module (card-sarbatori.js shopOrder, its id kept on the hold), its own price on top (no -50%, not counted for the gifts'
  // steps); paid → api/_lib/pay.js shop.paid gives the card its share
  let card = null;
  if (h.cart.card && Number(h.cart.card.tier)) {
    const C = require('./card-sarbatori');
    const x = await C.shopOrder({ tier: h.cart.card.tier, city: h.city, holdId: h.id, page: h.page, src: h.src, id: h.cart.cardOrder });
    if (!x || x.error) return { error: x && x.error === 'closed' ? 'closed' : x && x.error === 'already_paid' ? 'already_paid' : 'sold_out' };
    if (x.id !== h.cart.cardOrder) await H.patch(h.id, (y) => { y.cart = Object.assign({}, y.cart, { cardOrder: x.id }); });
    card = x;
  }
  return {
    amount: q.amount + (card ? card.amount : 0), full: q.full + (card ? card.full : 0), title: ('Comandă online: ' + summary(q) + (card ? ' + ' + card.title : '')).slice(0, 120), city: h.city,
    name: (h.contact || {}).name || '', phone: (h.contact || {}).phone || '', src: h.src, cookie: h.cookie, app: h.app,
    bonus: gifts ? { type: 'gift', gift: gifts, line: q.bf ? '-' + q.pct + '% Black Friday + cadouri' : '-' + q.pct + '% la plata online' } : { type: 'pct', pct: q.pct, line: q.bf ? '-' + q.pct + '% Black Friday' : '-' + q.pct + '% la plata online' },
    bonusText: q.bf ? '-' + q.pct + '% Black Friday, plătit online' : '-' + q.pct + '% la plata online',
  };
}

module.exports = { BF, bfOn, TIERS_DEFAULT, tiers, NEEDS, catalog, terms, quote, clean, summary, giftsOf, payQuote, productOf, priceOf };
// the card and the treatments in one payment work on the server (payQuote above, api/_lib/pay.js shop.paid): the cart may mix them
module.exports.CARD_MIX = true;
