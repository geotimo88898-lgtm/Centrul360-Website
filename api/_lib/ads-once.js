// One-off budget changes the owners asked for, done once by the automations' clock (api/automation-tick.js) and then
// never again; the guard (api/_lib/ads-guard.js) keeps its own rules and watches these campaigns like any other.
//   24.10: Timișoara has more bookings than room (done the same day: 7 campaigns -40%); Arad has room, so its LipoSonix /
//   gușă campaigns get +30% (at most 150 lei a day).
// data/ads-once.json: { done: { <job id>: <when> }, log: [{ job, at, campaignId, campaignName, budgetId, from, to }] }

const { readJSON, writeJSON } = require('./store');
const { loadConnection } = require('./facebook');
const ads = require('./meta-ads');
const AC = require('./ads-cache');
const { notifyMany } = require('./notify');

const KEY = 'data/ads-once.json';
// the two „Rezultate · site” campaigns of 23.11 (George): the city's name over one of the two best real cases of the
// homepage (05 Liposonix șolduri, 24 HIFU gât), the same two in both cities (both treatments are done in both clinics)
const SITE_CAMPAIGNS = [
  { name: 'C360 · TM · Rezultate · site', utm: 'c360-tm-rezultate-site', city: 'Timișoara', budget: 50, ads: [
        { name: 'TM · Liposonix șolduri · caz 05', image: 'rezultate-tm-solduri.jpg',
          text: 'TIMIȘOARA! Uite cum poți obține un asemenea rezultat fără operație și fără diete stricte, chiar dacă sala nu te-a ajutat până acum.\n\n' +
            '✅ O singură ședință de Liposonix. Poza e reală, făcută la noi în clinică.\n' +
            '✅ Stai întinsă, iar ultrasunetele lucrează pe grăsimea de pe șolduri. Tu nu faci niciun efort.\n' +
            '✅ 2 zone la preț de una: 640 lei în loc de 1.280, de Black Friday.\n\n' +
            'Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.\n\nAlege-ți ziua pe site, durează câteva secunde.\n👉 centrul360.com\n\nRezultatele diferă de la o persoană la alta.',
          headlines: ['TALIE MAI DEFINITĂ, FĂRĂ OPERAȚIE 👉', 'SE VEDE DIN PRIMA ȘEDINȚĂ ⏰💨', '2 ZONE LA PREȚ DE UNA 👉'], description: '5,0 pe Google, peste 300 de recenzii' },
        { name: 'TM · HIFU gât · caz 24', image: 'rezultate-tm-gat.jpg',
          text: 'TIMIȘOARA! Uite cum poți avea un gât mai neted, fără ace și fără operație, chiar dacă până acum cremele n-au ajutat.\n\n' +
            '✅ O singură ședință de HIFU. Poza e reală, făcută la noi în clinică.\n' +
            '✅ Ultrasunete care strâng pielea. Te întorci la treburile tale în aceeași zi.\n' +
            '✅ Cu Cardul de Sărbători plătești 990 lei și primești 2.500 lei în tratamente.\n\n' +
            'Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.\n\nIntră pe site și vezi ce ți se potrivește.\n👉 centrul360.com\n\nRezultatele diferă de la o persoană la alta.',
          headlines: ['GÂT MAI NETED, FĂRĂ ACE 👉', 'REZULTAT DUPĂ O ȘEDINȚĂ ⏰💨', 'PLĂTEȘTI 990 LEI, PRIMEȘTI 2.500 👉'], description: 'Consultația e gratuită' },
  ] },
  { name: 'C360 · AR · Rezultate · site', utm: 'c360-ar-rezultate-site', city: 'Arad', budget: 50, ads: [
        { name: 'AR · Liposonix șolduri · caz 05', image: 'rezultate-ar-solduri.jpg',
          text: 'ARAD! Uite cum poți avea o talie mai definită fără operație și fără efort, chiar dacă ai încercat deja diete și sală.\n\n' +
            '✅ O singură ședință de Liposonix. Poza e reală, făcută la noi în clinică.\n' +
            '✅ Stai întinsă, iar ultrasunetele lucrează pe grăsimea de pe șolduri. Fără ace. Te întorci la treburile tale în aceeași zi.\n' +
            '✅ 2 zone la preț de una: 640 lei în loc de 1.280, de Black Friday.\n\n' +
            'Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.\n\nAlege-ți ziua pe site, durează câteva secunde.\n👉 centrul360.com\n\nRezultatele diferă de la o persoană la alta.',
          headlines: ['TALIE MAI DEFINITĂ, FĂRĂ EFORT 👉', 'REZULTAT DUPĂ O ȘEDINȚĂ ⏰💨', '640 LEI ÎN LOC DE 1.280 👉'], description: '5,0 pe Google, peste 300 de recenzii' },
        { name: 'AR · HIFU gât · caz 24', image: 'rezultate-ar-gat.jpg',
          text: 'ARAD! Uite cum poți obține un asemenea rezultat la gât, fără operație și fără ace, chiar dacă ai crezut că ridurile de acolo nu mai pleacă.\n\n' +
            '✅ O singură ședință de HIFU. Poza e reală, făcută la noi în clinică.\n' +
            '✅ Ultrasunete care strâng pielea. Te întorci la treburile tale în aceeași zi.\n' +
            '✅ Cu Cardul de Sărbători plătești 990 lei și primești 2.500 lei în tratamente.\n\n' +
            'Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.\n\nIntră pe site și vezi ce ți se potrivește.\n👉 centrul360.com\n\nRezultatele diferă de la o persoană la alta.',
          headlines: ['GÂT MAI NETED, FĂRĂ OPERAȚIE 👉', 'SE VEDE DIN PRIMA ȘEDINȚĂ ⏰💨', 'PLĂTEȘTI 990 LEI, PRIMEȘTI 2.500 👉'], description: 'Consultația e gratuită' },
  ] },
];
// the reel „Nu promitem. Îți arătăm.” of Conținut: its clean video (no music) and its cover, public links (api/content-file.js)
const REEL_ARATAM = { url: 'https://admin.centrul360.com/api/content-file?i=dd7a54f3-7464-4cd7-adb8-2e903006f48d&n=clean.mp4', thumb: 'https://admin.centrul360.com/api/content-file?i=dd7a54f3-7464-4cd7-adb8-2e903006f48d&n=cover.jpg' };
// 23.11 ~22:50, George: the Card de Sărbători straight from the ads, ONLY Timișoara: one campaign of two ads (A/B, as
// „Rezultate · site”; a third, C, 23.11 ~23:00), Purchase on the site's pixel, men and women 28-58, Timișoara 8 km, no lookalike, 100 lei a day, to
// the home page (its card block, 990 chosen on every visit). A: the picture of the 990 card's WhatsApp message (template
// v4), as it is; B: the same picture with the cards on sale fanned in place of the one card (its headline: George picks);
// C: each card on its own, with what paying online adds (the site's words). In JOBS since George's go
// (23.11 ~23:20); the first version (TM and AR, 50 lei, to the card page) made only TM, paused (card-site-v1-off)
const CARD_SITE = { id: 'card-site-tm-2026-11-23', why: 'Cardul de Sărbători direct din reclame: TM, 3 reclame, 100 lei/zi', site: {
  // 23.11 ~23:20, George: traffic (landing page views), the pixel tracked on each ad; each ad its own utm_content and
  // Meta's ad id in the link (c360_ad)
  pixelId: '2276074362800484', goal: 'views', urlTags: 'c360_ad={{ad.id}}', cta: 'SHOP_NOW', ages: [28, 58],
  campaigns: [{ name: 'C360 · TM · Card · site', utm: 'card-tm', city: 'Timișoara', radiusKm: 8, everyone: true, budget: 100,
    adsetName: 'Timișoara 8 km · femei și bărbați 28-58', ads: [
      { name: 'C360 · TM · Card 990 · WhatsApp', image: 'card-990-wa.jpg', utmContent: 'card-a',
        text: 'TIMIȘOARA! 🎁 Cum să ai 2.500 lei în tratamente 💆‍♀️ fără să plătești prețul întreg, chiar dacă nu știi încă ce tratament vrei.\n\n' +
          '✅ Plătești 990 lei și primești 2.500 lei în tratamente 💳\n' +
          '✅ Valabil până pe 30.06.2027, la orice tratament din lista de prețuri 💆‍♀️\n' +
          '✅ Plătești online, pe site, și primești o ședință de BioLifting cadou ✨ și acces în Clubul 360\n\n' +
          '🔥 Au mai rămas doar 4 carduri.\n' +
          '🗓️ Până pe 24 decembrie.\n\n' +
          '👉 Ia-ți cardul acum, pe site:\ncentrul360.com\n📍 Timișoara',
        headlines: ['PLĂTEȘTI 990 LEI, PRIMEȘTI 2.500 LEI 👉', 'AU MAI RĂMAS DOAR 4 CARDURI ⏰💨', 'BIOLIFTING CADOU LA PLATA ONLINE 👉'], description: 'Valabil până pe 30.06.2027' },
      { name: 'C360 · TM · Card 990 · mai multe carduri', image: 'card-990-evantai.jpg', utmContent: 'card-b',
        text: 'TIMIȘOARA! 🎁 Cum să faci un cadou de 2.500 lei în tratamente 💆‍♀️ fără să plătești prețul întreg, chiar dacă nu știi încă ce i-ar plăcea.\n\n' +
          '✅ Plătești 990 lei și primești 2.500 lei în tratamente, pentru tine sau cadou 🎄\n' +
          '✅ Altă sumă? Plătești 490 lei și primești 1.000 lei, sau cardul VIP: plătești 9.900 lei și primești 30.000 lei 💎\n' +
          '✅ Plătești online, pe site, și primești o ședință de BioLifting cadou ✨ la cardurile de 490 și 990 lei 💳\n\n' +
          '🔥 Au mai rămas doar 4 carduri.\n' +
          '🗓️ Până pe 24 decembrie. Valabil până pe 30.06.2027.\n\n' +
          '👉 Alege-ți cardul pe site:\ncentrul360.com\n📍 Timișoara',
        headlines: ['PLĂTEȘTI 990 LEI, PRIMEȘTI 2.500 LEI 👉', 'AU MAI RĂMAS DOAR 4 CARDURI ⏰💨', 'ALEGE CARDUL: PLĂTEȘTI 490, PRIMEȘTI 1.000 👉'], description: 'Valabil până pe 30.06.2027' },
      { name: 'C360 · TM · Card · fiecare card', image: 'card-trei-c.jpg', utmContent: 'card-c',
        text: 'TIMIȘOARA! 🎁 Cum să primești de până la 3 ori mai mult în tratamente 💆‍♀️ fără să plătești prețul întreg, chiar dacă nu știi încă ce tratament vrei.\n\n' +
          '✅ Plătești 490 lei și primești 1.000 lei 💳\n' +
          '✅ Plătești 990 lei și primești 2.500 lei, cardul cel mai cumpărat 🎄\n' +
          '✅ Cardul VIP Transformarea 360: plătești 9.900 lei și primești 30.000 lei, pentru tine și cei dragi 💎\n\n' +
          '✨ La plata online, pe site: BioLifting cadou și Clubul 360 la cardurile de 490 și 990 lei; la cardul VIP, 10% reducere (8.910 lei) și Clubul 360.\n\n' +
          '🔥 Au mai rămas doar 4 carduri.\n' +
          '🗓️ Până pe 24 decembrie. Valabil până pe 30.06.2027.\n\n' +
          '👉 Alege-ți cardul pe site:\ncentrul360.com\n📍 Timișoara',
        headlines: ['ALEGE CARDUL: PLĂTEȘTI 990, PRIMEȘTI 2.500 👉', 'AU MAI RĂMAS DOAR 4 CARDURI ⏰💨', 'CARDUL VIP: PLĂTEȘTI 9.900, PRIMEȘTI 30.000 👉'], description: 'Valabil până pe 30.06.2027' },
    ] }] } };
// 23.11 ~23:30, George: the twin of CARD_SITE on a Facebook lead form, TM only: „C360 · TM · Card · formular”, leads,
// 100 lei a day, men and women 28-58, Timișoara 8 km, no lookalike, the same 3 pictures and texts (only the line to
// the form), SIGN_UP. Its form (form-card-tm, in JOBS: a form without ads is harmless): the old „Rezervă Cardul de
// Sărbători” copied (privacy, language, settings, kind 'card' so its leads go into the card's flow) with the cards on
// sale now (490, 990, VIP 9.900; 290 is no longer sold), no clinic question (Timișoara only, the form's city), and an
// ending to the home page's card block. HELD (outside JOBS) until George says go
const CARD_FORM_TM = { id: 'form-card-tm-2026-11-23', why: 'Formularul nou al cardului, Timișoara (490, 990, VIP), finalul pe site', formSite: {
  formId: '1134301339396504', name: 'Cardul de Sărbători · Timișoara · site', location: 'Timișoara',
  questions: [{ type: 'FULL_NAME' }, { type: 'PHONE' },
    { type: 'CUSTOM', key: 'ce_card_vrei', label: 'Ce card vrei?', options: [
      { value: 'Plătești 490 lei → primești 1.000 lei', key: 'card_490' },
      { value: 'Plătești 990 lei → primești 2.500 lei (cel mai cumpărat)', key: 'card_990' },
      { value: 'Card VIP: plătești 9.900 lei → primești 30.000 lei', key: 'card_9900' }] },
    { type: 'CUSTOM', key: 'pentru_cine_este', label: 'Pentru cine este?', options: [
      { value: 'Pentru mine', key: 'pentru_mine' }, { value: 'Cadou', key: 'cadou' }] }],
  // the site's words (v2 cs-card.js, cs-buy.js): 490 and 990 online: BioLifting cadou and Clubul 360; the VIP online:
  // 10% less and Clubul 360, no BioLifting
  page: { title: '⚠️ ÎNCĂ NU AI TERMINAT!', body: 'Mai ai un pas 👇 Plătește online acum și primești în plus o ședință de BioLifting cadou ✨ și acces în Clubul 360 (la cardul VIP, în loc de BioLifting: 10% reducere). Îți trimitem și pe WhatsApp linkul tău de plată.', button_type: 'VIEW_WEBSITE', button_text: 'PLĂTEȘTE ONLINE 👉',
    website_url: 'https://www.centrul360.com/?utm_source=facebook&utm_medium=leadform&utm_campaign=card-form-tm' } } };
const CARD_FORM = { id: 'card-form-tm-2026-11-23', why: 'Cardul de Sărbători pe formular: TM, 3 reclame, 100 lei/zi', site: {
  cta: 'SIGN_UP', ages: [28, 58],
  campaigns: [{ name: 'C360 · TM · Card · formular', city: 'Timișoara', radiusKm: 8, everyone: true, budget: 100, formJob: CARD_FORM_TM.id,
    adsetName: 'Timișoara 8 km · femei și bărbați 28-58', ads: [
      { name: 'C360 · TM · Card 990 · WhatsApp · formular', image: 'card-990-wa.jpg',
        text: 'TIMIȘOARA! 🎁 Cum să ai 2.500 lei în tratamente 💆‍♀️ fără să plătești prețul întreg, chiar dacă nu știi încă ce tratament vrei.\n\n' +
          '✅ Plătești 990 lei și primești 2.500 lei în tratamente 💳\n' +
          '✅ Valabil până pe 30.06.2027, la orice tratament din lista de prețuri 💆‍♀️\n' +
          '✅ Plătești online, pe site, și primești o ședință de BioLifting cadou ✨ și acces în Clubul 360\n\n' +
          '🔥 Au mai rămas doar 4 carduri.\n' +
          '🗓️ Până pe 24 decembrie.\n\n' +
          '👉 Completează formularul și îți trimitem cardul pe WhatsApp\ncentrul360.com\n📍 Timișoara',
        headlines: ['PLĂTEȘTI 990 LEI, PRIMEȘTI 2.500 LEI 👉', 'AU MAI RĂMAS DOAR 4 CARDURI ⏰💨', 'BIOLIFTING CADOU LA PLATA ONLINE 👉'], description: 'Valabil până pe 30.06.2027' },
      { name: 'C360 · TM · Card 990 · mai multe carduri · formular', image: 'card-990-evantai.jpg',
        text: 'TIMIȘOARA! 🎁 Cum să faci un cadou de 2.500 lei în tratamente 💆‍♀️ fără să plătești prețul întreg, chiar dacă nu știi încă ce i-ar plăcea.\n\n' +
          '✅ Plătești 990 lei și primești 2.500 lei în tratamente, pentru tine sau cadou 🎄\n' +
          '✅ Altă sumă? Plătești 490 lei și primești 1.000 lei, sau cardul VIP: plătești 9.900 lei și primești 30.000 lei 💎\n' +
          '✅ Plătești online, pe site, și primești o ședință de BioLifting cadou ✨ la cardurile de 490 și 990 lei 💳\n\n' +
          '🔥 Au mai rămas doar 4 carduri.\n' +
          '🗓️ Până pe 24 decembrie. Valabil până pe 30.06.2027.\n\n' +
          '👉 Completează formularul și îți trimitem cardul pe WhatsApp\ncentrul360.com\n📍 Timișoara',
        headlines: ['PLĂTEȘTI 990 LEI, PRIMEȘTI 2.500 LEI 👉', 'AU MAI RĂMAS DOAR 4 CARDURI ⏰💨', 'ALEGE CARDUL: PLĂTEȘTI 490, PRIMEȘTI 1.000 👉'], description: 'Valabil până pe 30.06.2027' },
      { name: 'C360 · TM · Card · fiecare card · formular', image: 'card-trei-c.jpg',
        text: 'TIMIȘOARA! 🎁 Cum să primești de până la 3 ori mai mult în tratamente 💆‍♀️ fără să plătești prețul întreg, chiar dacă nu știi încă ce tratament vrei.\n\n' +
          '✅ Plătești 490 lei și primești 1.000 lei 💳\n' +
          '✅ Plătești 990 lei și primești 2.500 lei, cardul cel mai cumpărat 🎄\n' +
          '✅ Cardul VIP Transformarea 360: plătești 9.900 lei și primești 30.000 lei, pentru tine și cei dragi 💎\n\n' +
          '✨ La plata online, pe site: BioLifting cadou și Clubul 360 la cardurile de 490 și 990 lei; la cardul VIP, 10% reducere (8.910 lei) și Clubul 360.\n\n' +
          '🔥 Au mai rămas doar 4 carduri.\n' +
          '🗓️ Până pe 24 decembrie. Valabil până pe 30.06.2027.\n\n' +
          '👉 Completează formularul și îți trimitem cardul pe WhatsApp\ncentrul360.com\n📍 Timișoara',
        headlines: ['ALEGE CARDUL: PLĂTEȘTI 990, PRIMEȘTI 2.500 👉', 'AU MAI RĂMAS DOAR 4 CARDURI ⏰💨', 'CARDUL VIP: PLĂTEȘTI 9.900, PRIMEȘTI 30.000 👉'], description: 'Valabil până pe 30.06.2027' },
    ] }] } };
// 24.11, George: „da publică, 100 lei pe zi”: the clinic's used Elysion Pro laser sold to beauty salons (B2B, not a
// treatment). Its own instant form (Higher intent, 4 questions + the salon's city, a call at the end; the portal's form
// builder asks 3 questions, a clinic and a WhatsApp ending, so this one is posted to the Page as it is), registered as
// kind 'b2b' with no offer and no city (api/_lib/fb-leads.js routes it by its name to the admins' „Aparate”): no
// welcome, no message to them.  Then one campaign (leads), one ad set (all of Romania, 25-60,
// everyone, Advantage+ audience and placements, 100 lei a day), one ad (the picture, 3 titles); made paused, switched
// on once the ad is there (ads.publish)
const ELYSION_TEXT = 'PROPRIETARI DE SALOANE DIN ROMÂNIA! Vindem laserul nostru de epilare definitivă Elysion Pro, folosit doar 6 luni: 94.900 lei.\n\n' +
  '✅ Laser cu diodă 810 nm, standardul pentru epilare definitivă\n' +
  '✅ Pentru toate tipurile de piele\n' +
  '✅ Producător european: Cocoon Medical (Spania)\n' +
  '✅ Răcire integrată, ședințe confortabile pentru cliente\n' +
  '✅ Gata de lucru din prima zi\n' +
  '✅ Oferim factură\n\n' +
  '🎁 Îți aducem GARANTAT primii 20 de clienți pe el\n' +
  '➕ Aparat HIFU, în valoare de 6.000 lei, inclus\n' +
  '➕ Aparat Liposonix, în valoare de 17.000 lei, inclus\n' +
  '➕ Mesopen Beauty One, în valoare de 3.000 lei, inclus\n' +
  '🚚 Livrare personală gratuită oriunde în țară\n\n' +
  'Un singur aparat. Când se vinde, anunțul dispare.\n\n' +
  '📞 Sună acum: 0726 088 115 sau completează formularul și te sunăm azi.';
const choices = (key, list) => list.map((value, k) => ({ value, key: key + '_' + (k + 1) }));
const ELYSION = { id: 'elysion-sale-2026-11-24', why: 'Vânzare laser Elysion Pro către saloane: formular nou, 100 lei/zi', b2b: {
  interest: 'Vânzare laser Elysion Pro',
  form: {
    name: 'Elysion Pro · vânzare · saloane',
    intro: { title: 'Laser Elysion Pro · 94.900 lei', text: 'Folosit doar 6 luni. Îți aducem GARANTAT primii 20 de clienți, plus aparat HIFU, Liposonix și Mesopen incluse. Livrare personală gratuită oriunde în țară. Răspunde la 4 întrebări și te sunăm azi.' },
    questions: [
      { type: 'CUSTOM', key: 'are_salon', label: 'Ai deja un salon sau o clinică?', options: choices('are_salon', ['Da, am salon sau clinică', 'Îmi deschid unul în curând', 'Nu, cumpăr pentru mine']) },
      { type: 'CUSTOM', key: 'face_epilare', label: 'Faceți deja epilare laser?', options: choices('face_epilare', ['Da, cu alt aparat', 'Nu încă, vreau să încep']) },
      { type: 'CUSTOM', key: 'cand_cumpara', label: 'Când vrei să cumperi?', options: choices('cand_cumpara', ['Luna asta', 'În 1-3 luni', 'Doar mă informez']) },
      { type: 'CUSTOM', key: 'cum_plateste', label: 'Cum ai plăti cei 94.900 lei?', options: choices('cum_plateste', ['Integral', 'Leasing sau credit', 'Încă nu știu']) },
      { type: 'CUSTOM', key: 'oras_salon', label: 'În ce oraș e salonul?' },
      { type: 'FULL_NAME' }, { type: 'PHONE' },
    ],
    ending: { title: 'Mulțumim! 🤍', body: 'Te sunăm azi să-ți spunem toate detaliile despre aparat și cum îți aducem primii 20 de clienți. Vrei să vorbim acum?', button_type: 'CALL_BUSINESS', button_text: 'Sună acum', business_phone_number: '+40726088115' },
  },
  campaign: { name: 'C360 · Vânzare laser Elysion Pro · formular', adsetName: 'România · 25-60 · saloane · Advantage+', adName: 'Elysion Pro · vânzare · saloane',
    budget: 100, ages: [25, 60], image: 'elysion-vanzare-4.jpg', cta: 'APPLY_NOW', text: ELYSION_TEXT,
    headlines: ['Laser Elysion Pro · 94.900 lei', '+ 20 de clienți garantați și 3 aparate cadou', 'Epilare laser pentru salonul tău, gata de lucru'],
    description: 'Folosit doar 6 luni · livrare gratuită în toată țara',
    // a hint for Advantage+ audience (Meta's own names, looked up in its targeting search; one not found is left out)
    interests: ['Beauty salon', 'Cosmetics', 'Aesthetics', 'Laser hair removal'], behaviors: ['Small business owners'] },
} };
// 25.11 ~23:30, George: „da”: the shop's Black Friday on the site, one campaign per city, 300 lei a day each, women 30-65+ on
// 8 km (as the running winners), the site's Purchase; 12 ads each (the 10 zones and the 2 general ones, the white style he
// chose), each its 4:5 and its 9:16 in the same ad, to the zone's product page (the zone and the city chosen) or to all the
// offers. No end: George decides when they stop (Friday 10:00 he is asked). Not judged on leads by the guard (no form):
// the hourly review stops an ad that spends with no sale, Meta then moves the money to the rest
const BF_SITE = [
 {
  "name": "C360 · TM · Black Friday · site",
  "utm": "c360-tm-bf-site",
  "city": "Timișoara",
  "budget": 300,
  "radiusKm": 8,
  "adsetName": "Timișoara 8 km · femei 30-65+",
  "ads": [
   {
    "name": "TM · HIFU Gușă · alb · v2",
    "image": "bf-tm-hifu-gusa.jpg",
    "story": "bf-tm-hifu-gusa-story.jpg",
    "path": "tratament-hifu?zona=gusa&oras=timisoara",
    "utmContent": "bf-hifu-gusa",
    "cta": "SHOP_NOW",
    "text": "TIMIȘOARA! 📍 Toate tratamentele la -50%, doar la plata online.\n\nHIFU Gușă: 145 lei în loc de 290 lei.\n\n✅ Strânge pielea de sub bărbie\n✅ Fără ace, fără operație\n✅ 10-15 minute, apoi te întorci la ale tale\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "HIFU GUȘĂ LA 145 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ OPERAȚIE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "TM · HIFU Gât · alb · v2",
    "image": "bf-tm-hifu-gat.jpg",
    "story": "bf-tm-hifu-gat-story.jpg",
    "path": "tratament-hifu?zona=gat&oras=timisoara",
    "utmContent": "bf-hifu-gat",
    "cta": "SHOP_NOW",
    "text": "TIMIȘOARA! 📍 Toate tratamentele la -50%, doar la plata online.\n\nHIFU Gât: 145 lei în loc de 290 lei.\n\n✅ Strânge pielea lăsată a gâtului\n✅ Fără ace, fără operație\n✅ 10-15 minute, apoi te întorci la ale tale\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "HIFU GÂT LA 145 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ OPERAȚIE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "TM · HIFU Contur · alb · v2",
    "image": "bf-tm-hifu-contur.jpg",
    "story": "bf-tm-hifu-contur-story.jpg",
    "path": "tratament-hifu?zona=contur-mandibular&oras=timisoara",
    "utmContent": "bf-hifu-contur",
    "cta": "SHOP_NOW",
    "text": "TIMIȘOARA! 📍 Toate tratamentele la -50%, doar la plata online.\n\nHIFU Contur: 145 lei în loc de 290 lei.\n\n✅ Linia maxilarului mai clară\n✅ Fără ace, fără operație\n✅ 10-15 minute, apoi te întorci la ale tale\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "HIFU CONTUR LA 145 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ OPERAȚIE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "TM · HIFU Pomeți · alb · v2",
    "image": "bf-tm-hifu-pometi.jpg",
    "story": "bf-tm-hifu-pometi-story.jpg",
    "path": "tratament-hifu?zona=pometi&oras=timisoara",
    "utmContent": "bf-hifu-pometi",
    "cta": "SHOP_NOW",
    "text": "TIMIȘOARA! 📍 Toate tratamentele la -50%, doar la plata online.\n\nHIFU Pomeți: 145 lei în loc de 290 lei.\n\n✅ Aspect de lifting pe pomeți\n✅ Fără ace, fără operație\n✅ 10-15 minute, apoi te întorci la ale tale\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "HIFU POMEȚI LA 145 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ OPERAȚIE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "TM · HIFU Frunte · alb · v2",
    "image": "bf-tm-hifu-frunte.jpg",
    "story": "bf-tm-hifu-frunte-story.jpg",
    "path": "tratament-hifu?zona=frunte&oras=timisoara",
    "utmContent": "bf-hifu-frunte",
    "cta": "SHOP_NOW",
    "text": "TIMIȘOARA! 📍 Toate tratamentele la -50%, doar la plata online.\n\nHIFU Frunte: 145 lei în loc de 290 lei.\n\n✅ Aspect de lifting pe frunte, privire mai odihnită\n✅ Fără ace, fără operație\n✅ 10-15 minute, apoi te întorci la ale tale\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "HIFU FRUNTE LA 145 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ OPERAȚIE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "TM · HIFU Full Face · alb · v2",
    "image": "bf-tm-hifu-full-face.jpg",
    "story": "bf-tm-hifu-full-face-story.jpg",
    "path": "tratament-hifu-full-face?oras=timisoara",
    "utmContent": "bf-hifu-full-face",
    "cta": "SHOP_NOW",
    "text": "TIMIȘOARA! 📍 Toate tratamentele la -50%, doar la plata online.\n\nHIFU Full Face: 510 lei în loc de 1.020 lei.\n\n✅ Strânge pielea lăsată a feței\n✅ Frunte, obraji, linia maxilarului și gât\n✅ Fără bisturiu, fără recuperare\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "HIFU FULL FACE LA 510 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ OPERAȚIE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "TM · BioLifting Full Face · alb · v2",
    "image": "bf-tm-biolifting-full-face.jpg",
    "story": "bf-tm-biolifting-full-face-story.jpg",
    "path": "tratament-biolifting-full-face?oras=timisoara",
    "utmContent": "bf-biolifting-full-face",
    "cta": "SHOP_NOW",
    "text": "TIMIȘOARA! 📍 Toate tratamentele la -50%, doar la plata online.\n\nBioLifting Full Face: 140 lei în loc de 280 lei.\n\n✅ Stimulează colagenul și elastina\n✅ Reduce ridurile fine\n✅ 30 de minute, fără ace, fără recuperare\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "BIOLIFTING FULL FACE LA 140 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ RECUPERARE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "TM · Red Sculpt Abdomen · alb · v2",
    "image": "bf-tm-red-sculpt-abdomen.jpg",
    "story": "bf-tm-red-sculpt-abdomen-story.jpg",
    "path": "tratament-radiofrecventa?zona=abdomen&oras=timisoara",
    "utmContent": "bf-red-sculpt-abdomen",
    "cta": "SHOP_NOW",
    "text": "TIMIȘOARA! 📍 Toate tratamentele la -50%, doar la plata online.\n\nRed Sculpt Abdomen: 140 lei în loc de 280 lei.\n\n✅ Piele mai fermă pe abdomen\n✅ Stimulează colagenul și fermitatea\n✅ Fără ace, fără efort\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "RED SCULPT ABDOMEN LA 140 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ EFORT ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "TM · Red Sculpt Coapse · alb · v2",
    "image": "bf-tm-red-sculpt-coapse.jpg",
    "story": "bf-tm-red-sculpt-coapse-story.jpg",
    "path": "tratament-radiofrecventa?zona=coapse&oras=timisoara",
    "utmContent": "bf-red-sculpt-coapse",
    "cta": "SHOP_NOW",
    "text": "TIMIȘOARA! 📍 Toate tratamentele la -50%, doar la plata online.\n\nRed Sculpt Coapse: 140 lei în loc de 280 lei.\n\n✅ Reduce aspectul de celulită\n✅ Stimulează colagenul și fermitatea\n✅ Fără ace, fără efort\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "RED SCULPT COAPSE LA 140 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ EFORT ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "TM · Red Sculpt Brațe · alb · v2",
    "image": "bf-tm-red-sculpt-brate.jpg",
    "story": "bf-tm-red-sculpt-brate-story.jpg",
    "path": "tratament-radiofrecventa?zona=brate&oras=timisoara",
    "utmContent": "bf-red-sculpt-brate",
    "cta": "SHOP_NOW",
    "text": "TIMIȘOARA! 📍 Toate tratamentele la -50%, doar la plata online.\n\nRed Sculpt Brațe: 140 lei în loc de 280 lei.\n\n✅ Piele mai fermă pe brațe\n✅ Stimulează colagenul și fermitatea\n✅ Fără ace, fără efort\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "RED SCULPT BRAȚE LA 140 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ EFORT ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "TM · Toate tratamentele · lista de prețuri · v2",
    "image": "bf-tm-toate-lista.jpg",
    "story": "bf-tm-toate-lista-story.jpg",
    "path": "oferte?oras=timisoara",
    "utmContent": "bf-toate-lista",
    "cta": "SHOP_NOW",
    "text": "TIMIȘOARA! 📍 Toate tratamentele, la jumătate de preț, doar la plata online.\n\n✅ Liposonix: 320 lei în loc de 640 lei\n✅ HIFU Gușă: 145 lei în loc de 290 lei\n✅ Red Sculpt, 40K Slim, BioLifting Full Face: 140 lei în loc de 280 lei\n\n⏳ Doar 2 zile, apoi prețurile revin la normal.\n👉 Alege-ți tratamentul și ora pe centrul360.com",
    "headlines": [
     "TOATE TRATAMENTELE LA -50% 👉",
     "DOAR 2 ZILE ⏰💨",
     "DE LA 80 DE LEI, FĂRĂ ACE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "TM · Toate tratamentele · față și corp · v2",
    "image": "bf-tm-toate-fata-corp.jpg",
    "story": "bf-tm-toate-fata-corp-story.jpg",
    "path": "oferte?oras=timisoara",
    "utmContent": "bf-toate-fata-corp",
    "cta": "SHOP_NOW",
    "text": "TIMIȘOARA! 📍 Toate tratamentele, față și corp, la jumătate de preț, doar la plata online.\n\n✅ Fără ace, fără operație\n✅ De la 80 de lei\n✅ Îți alegi ziua și ora imediat după plată\n\n⏳ Doar 2 zile, apoi prețurile revin la normal.\n👉 Alege-ți tratamentul pe centrul360.com",
    "headlines": [
     "JUMĂTATE DE PREȚ LA TOT 👉",
     "DOAR 2 ZILE ⏰💨",
     "FAȚĂ ȘI CORP, FĂRĂ ACE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   }
  ]
 },
 {
  "name": "C360 · AR · Black Friday · site",
  "utm": "c360-ar-bf-site",
  "city": "Arad",
  "budget": 300,
  "radiusKm": 8,
  "adsetName": "Arad 8 km · femei 30-65+",
  "ads": [
   {
    "name": "AR · HIFU Gușă · alb · v2",
    "image": "bf-ar-hifu-gusa.jpg",
    "story": "bf-ar-hifu-gusa-story.jpg",
    "path": "tratament-hifu?zona=gusa&oras=arad",
    "utmContent": "bf-hifu-gusa",
    "cta": "SHOP_NOW",
    "text": "ARAD! 📍 Toate tratamentele la -50%, doar la plata online.\n\nHIFU Gușă: 145 lei în loc de 290 lei.\n\n✅ Strânge pielea de sub bărbie\n✅ Fără ace, fără operație\n✅ 10-15 minute, apoi te întorci la ale tale\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "HIFU GUȘĂ LA 145 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ OPERAȚIE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "AR · HIFU Gât · alb · v2",
    "image": "bf-ar-hifu-gat.jpg",
    "story": "bf-ar-hifu-gat-story.jpg",
    "path": "tratament-hifu?zona=gat&oras=arad",
    "utmContent": "bf-hifu-gat",
    "cta": "SHOP_NOW",
    "text": "ARAD! 📍 Toate tratamentele la -50%, doar la plata online.\n\nHIFU Gât: 145 lei în loc de 290 lei.\n\n✅ Strânge pielea lăsată a gâtului\n✅ Fără ace, fără operație\n✅ 10-15 minute, apoi te întorci la ale tale\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "HIFU GÂT LA 145 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ OPERAȚIE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "AR · HIFU Contur · alb · v2",
    "image": "bf-ar-hifu-contur.jpg",
    "story": "bf-ar-hifu-contur-story.jpg",
    "path": "tratament-hifu?zona=contur-mandibular&oras=arad",
    "utmContent": "bf-hifu-contur",
    "cta": "SHOP_NOW",
    "text": "ARAD! 📍 Toate tratamentele la -50%, doar la plata online.\n\nHIFU Contur: 145 lei în loc de 290 lei.\n\n✅ Linia maxilarului mai clară\n✅ Fără ace, fără operație\n✅ 10-15 minute, apoi te întorci la ale tale\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "HIFU CONTUR LA 145 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ OPERAȚIE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "AR · HIFU Pomeți · alb · v2",
    "image": "bf-ar-hifu-pometi.jpg",
    "story": "bf-ar-hifu-pometi-story.jpg",
    "path": "tratament-hifu?zona=pometi&oras=arad",
    "utmContent": "bf-hifu-pometi",
    "cta": "SHOP_NOW",
    "text": "ARAD! 📍 Toate tratamentele la -50%, doar la plata online.\n\nHIFU Pomeți: 145 lei în loc de 290 lei.\n\n✅ Aspect de lifting pe pomeți\n✅ Fără ace, fără operație\n✅ 10-15 minute, apoi te întorci la ale tale\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "HIFU POMEȚI LA 145 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ OPERAȚIE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "AR · HIFU Frunte · alb · v2",
    "image": "bf-ar-hifu-frunte.jpg",
    "story": "bf-ar-hifu-frunte-story.jpg",
    "path": "tratament-hifu?zona=frunte&oras=arad",
    "utmContent": "bf-hifu-frunte",
    "cta": "SHOP_NOW",
    "text": "ARAD! 📍 Toate tratamentele la -50%, doar la plata online.\n\nHIFU Frunte: 145 lei în loc de 290 lei.\n\n✅ Aspect de lifting pe frunte, privire mai odihnită\n✅ Fără ace, fără operație\n✅ 10-15 minute, apoi te întorci la ale tale\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "HIFU FRUNTE LA 145 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ OPERAȚIE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "AR · HIFU Full Face · alb · v2",
    "image": "bf-ar-hifu-full-face.jpg",
    "story": "bf-ar-hifu-full-face-story.jpg",
    "path": "tratament-hifu-full-face?oras=arad",
    "utmContent": "bf-hifu-full-face",
    "cta": "SHOP_NOW",
    "text": "ARAD! 📍 Toate tratamentele la -50%, doar la plata online.\n\nHIFU Full Face: 510 lei în loc de 1.020 lei.\n\n✅ Strânge pielea lăsată a feței\n✅ Frunte, obraji, linia maxilarului și gât\n✅ Fără bisturiu, fără recuperare\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "HIFU FULL FACE LA 510 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ OPERAȚIE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "AR · BioLifting Full Face · alb · v2",
    "image": "bf-ar-biolifting-full-face.jpg",
    "story": "bf-ar-biolifting-full-face-story.jpg",
    "path": "tratament-biolifting-full-face?oras=arad",
    "utmContent": "bf-biolifting-full-face",
    "cta": "SHOP_NOW",
    "text": "ARAD! 📍 Toate tratamentele la -50%, doar la plata online.\n\nBioLifting Full Face: 140 lei în loc de 280 lei.\n\n✅ Stimulează colagenul și elastina\n✅ Reduce ridurile fine\n✅ 30 de minute, fără ace, fără recuperare\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "BIOLIFTING FULL FACE LA 140 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ RECUPERARE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "AR · Red Sculpt Abdomen · alb · v2",
    "image": "bf-ar-red-sculpt-abdomen.jpg",
    "story": "bf-ar-red-sculpt-abdomen-story.jpg",
    "path": "tratament-radiofrecventa?zona=abdomen&oras=arad",
    "utmContent": "bf-red-sculpt-abdomen",
    "cta": "SHOP_NOW",
    "text": "ARAD! 📍 Toate tratamentele la -50%, doar la plata online.\n\nRed Sculpt Abdomen: 140 lei în loc de 280 lei.\n\n✅ Piele mai fermă pe abdomen\n✅ Stimulează colagenul și fermitatea\n✅ Fără ace, fără efort\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "RED SCULPT ABDOMEN LA 140 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ EFORT ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "AR · Red Sculpt Coapse · alb · v2",
    "image": "bf-ar-red-sculpt-coapse.jpg",
    "story": "bf-ar-red-sculpt-coapse-story.jpg",
    "path": "tratament-radiofrecventa?zona=coapse&oras=arad",
    "utmContent": "bf-red-sculpt-coapse",
    "cta": "SHOP_NOW",
    "text": "ARAD! 📍 Toate tratamentele la -50%, doar la plata online.\n\nRed Sculpt Coapse: 140 lei în loc de 280 lei.\n\n✅ Reduce aspectul de celulită\n✅ Stimulează colagenul și fermitatea\n✅ Fără ace, fără efort\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "RED SCULPT COAPSE LA 140 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ EFORT ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "AR · Red Sculpt Brațe · alb · v2",
    "image": "bf-ar-red-sculpt-brate.jpg",
    "story": "bf-ar-red-sculpt-brate-story.jpg",
    "path": "tratament-radiofrecventa?zona=brate&oras=arad",
    "utmContent": "bf-red-sculpt-brate",
    "cta": "SHOP_NOW",
    "text": "ARAD! 📍 Toate tratamentele la -50%, doar la plata online.\n\nRed Sculpt Brațe: 140 lei în loc de 280 lei.\n\n✅ Piele mai fermă pe brațe\n✅ Stimulează colagenul și fermitatea\n✅ Fără ace, fără efort\n\n⏳ Doar 2 zile, apoi prețul revine la normal.\n👉 Rezervă-ți ora acum pe centrul360.com",
    "headlines": [
     "RED SCULPT BRAȚE LA 140 LEI 👉",
     "DOAR 2 ZILE ⏰💨",
     "FĂRĂ ACE, FĂRĂ EFORT ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "AR · Toate tratamentele · lista de prețuri · v2",
    "image": "bf-ar-toate-lista.jpg",
    "story": "bf-ar-toate-lista-story.jpg",
    "path": "oferte?oras=arad",
    "utmContent": "bf-toate-lista",
    "cta": "SHOP_NOW",
    "text": "ARAD! 📍 Toate tratamentele, la jumătate de preț, doar la plata online.\n\n✅ Liposonix: 320 lei în loc de 640 lei\n✅ HIFU Gușă: 145 lei în loc de 290 lei\n✅ Red Sculpt, 40K Slim, BioLifting Full Face: 140 lei în loc de 280 lei\n\n⏳ Doar 2 zile, apoi prețurile revin la normal.\n👉 Alege-ți tratamentul și ora pe centrul360.com",
    "headlines": [
     "TOATE TRATAMENTELE LA -50% 👉",
     "DOAR 2 ZILE ⏰💨",
     "DE LA 80 DE LEI, FĂRĂ ACE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   },
   {
    "name": "AR · Toate tratamentele · față și corp · v2",
    "image": "bf-ar-toate-fata-corp.jpg",
    "story": "bf-ar-toate-fata-corp-story.jpg",
    "path": "oferte?oras=arad",
    "utmContent": "bf-toate-fata-corp",
    "cta": "SHOP_NOW",
    "text": "ARAD! 📍 Toate tratamentele, față și corp, la jumătate de preț, doar la plata online.\n\n✅ Fără ace, fără operație\n✅ De la 80 de lei\n✅ Îți alegi ziua și ora imediat după plată\n\n⏳ Doar 2 zile, apoi prețurile revin la normal.\n👉 Alege-ți tratamentul pe centrul360.com",
    "headlines": [
     "JUMĂTATE DE PREȚ LA TOT 👉",
     "DOAR 2 ZILE ⏰💨",
     "FAȚĂ ȘI CORP, FĂRĂ ACE ✨"
    ],
    "description": "Doar online · doar 2 zile"
   }
  ]
 }
];
const JOBS = [
  // 26.11 ~01:30, George: the copy in his structure (the city, the offer, 3 bullets, the urgency, the CTA with the site; 3 titles in
  // capitals: 👉, ⏰💨 and one more): the ads are made again as „· v2” in the same ad sets; the 5 of the first copy paused
  { id: 'bf-site-v1-off-2026-11-26', act: 'act_4502494523405059', why: 'Black Friday: reclamele cu prima copie înlocuite', actions: [
    { campaignId: '120252119342120103', name: 'TM · HIFU Gușă · alb (v1)', status: 'PAUSED', why: 'copia nouă' },
    { campaignId: '120252119403650103', name: 'TM · HIFU Gât · alb (v1)', status: 'PAUSED', why: 'copia nouă' },
    { campaignId: '120252119488920103', name: 'TM · HIFU Contur · alb (v1)', status: 'PAUSED', why: 'copia nouă' },
    { campaignId: '120252119837450103', name: 'TM · HIFU Pomeți · alb (v1)', status: 'PAUSED', why: 'copia nouă' },
    { campaignId: '120252119912520103', name: 'TM · HIFU Frunte · alb (v1)', status: 'PAUSED', why: 'copia nouă' },
  ] },
  { id: 'bf-site-2026-11-25', why: 'Black Friday pe site: TM și AR, câte 12 reclame, 300 lei/zi pe oraș', site: {
    // „Cumpără acum” (25.11 ~00:00: Meta refused BOOK_NOW on a sales ad with the 4:5 and the story in one ad)
    pixelId: '2276074362800484', sharePixel: '1107600260509887', goal: 'purchase', cta: 'SHOP_NOW', ages: [30, 65], urlTags: 'c360_ad={{ad.id}}',
    campaigns: BF_SITE } },
  // 25.11 ~23:30, George: „lasă-le numai pe cele care funcționează acum: cost pe lead, leaduri constante, influență asupra
  // calendarului”; 7 days: these two bring few bookings (sezon v2: 7 leads, 1 booking; copertă 40+: 24 lei a lead)
  { id: 'old-weak-off-2026-11-25', act: 'act_4502494523405059', why: 'George: rămân doar reclamele vechi care umplu calendarul', actions: [
    { campaignId: '120252019815200103', name: 'TM HIFU G · sezon v2', status: 'PAUSED', why: '7 leaduri, 1 programare în 7 zile' },
    { campaignId: '120251796515140103', name: 'TM HIFU G · copertă 40+', status: 'PAUSED', why: '24 lei pe lead, 1 programare' },
  ] },
  // 25.11 evening, George: „da, oprește-le pe amândouă”: the card ad „fiecare card” (0 leads, in both card campaigns) and
  // TM LIPO · stai întinsă v2 (1 lead, 0 bookings in 2 days); the ads themselves, the rest of their campaigns as they are
  { id: 'weak-off-2026-11-25', act: 'act_4502494523405059', why: 'George: oprite reclamele slabe', actions: [
    { campaignId: '120252015089890103', name: 'TM LIPO · stai întinsă v2 (reclama)', status: 'PAUSED', why: 'George: 1 lead, 0 programări în 2 zile' },
  ] },
  { id: 'card-fiecare-off-2026-11-25', act: 'act_989208510351291', why: 'George: oprită reclama „fiecare card”', actions: [
    { campaignId: '120250732826060149', name: 'C360 · TM · Card · fiecare card · formular (reclama)', status: 'PAUSED', why: 'George: 0 leaduri' },
    { campaignId: '120250732739980149', name: 'C360 · TM · Card · fiecare card · site (reclama)', status: 'PAUSED', why: 'George: 0 rezultate' },
  ] },
  // 25.11 ~00:00: the Elysion Pro ad set's hint „Aesthetics” matched Meta's philosophy interest „Estetică (filosofie)”: taken
  // out, the other hints, the budget and the rest of the ad set as they are
  { id: 'elysion-hint-fix-2026-11-25', why: 'Elysion Pro: interesul greșit „Estetică (filosofie)” scos', dropInterests: {
    adsetId: '120252100284540103', campaignName: 'C360 · Vânzare laser Elysion Pro · formular', ids: ['6003110046272'] } },
  // 24.11, George: „da publică, 100 lei pe zi” (the Elysion Pro laser for sale to salons, ELYSION above)
  ELYSION,
  // 24.11 ~16:40, George: „nu mai tratament faciale, stinge-le pe alea”
  { id: 'facial-off-2026-11-24', act: 'act_4502494523405059', why: 'George: fără tratamente faciale', actions: [
    { campaignId: '120251418278340103', name: 'TM RESTART · fără ace', status: 'PAUSED', why: 'George: nu mai tratamente faciale' },
  ] },
  // 24.11 ~15:45, George: „am reconectat celălalt cont… hai să aducem leaduri multe multe, plin plin plin”, 450 lei/zi:
  // the proven campaigns of the old account „centru pls” (16.10-21.11: most women who came and became clients) on again,
  // as they were (their forms), 75 lei/day each; their twins in the connected account go off so the two don't bid
  // against each other for the same women (the card campaigns stay)
  { id: 'old-winners-on-2026-11-24', act: 'act_4502494523405059', why: 'Contul centru pls: reclamele dovedite pornite, 75 lei/zi fiecare (450 lei/zi)', actions: [
    ['120251401215320103', 'TM HIFU G · sezon'], ['120251418278340103', 'TM RESTART · fără ace'], ['120251796512940103', 'TM HIFU G · copertă 50+'],
    ['120251585544900103', 'TM VIDEO · HIFU gușă · iPad'], ['120251418156000103', 'tm vid 3 lipo 09.09 - copie'], ['120251418133050103', 'AR HIFU G · sezon'],
  ].flatMap(([campaignId, name]) => [{ campaignId, name, daily: 75, why: 'George: 450 lei/zi pe cele dovedite' }, { campaignId, name, status: 'ACTIVE', why: 'George: leaduri multe, din contul care ne cunoaște' }]) },
  { id: 'new-twins-off-2026-11-24', act: 'act_989208510351291', why: 'Contul nou: dublurile reclamelor pornite în centru pls oprite (cardurile rămân)', actions: [
    { campaignId: '120250715944510149', name: 'C360 · TM · HIFU G · sezon', status: 'PAUSED', why: 'dublura din centru pls rulează' },
    { campaignId: '120250718340060149', name: 'C360 · AR · HIFU G · sezon (2)', status: 'PAUSED', why: 'dublura din centru pls rulează' },
    { campaignId: '120250730157610149', name: 'C360 · AR · HIFU G · caz 16', status: 'PAUSED', why: 'HIFU gușă Arad rulează din centru pls' },
    { campaignId: '120250730080520149', name: 'C360 · TM · Liposonix · caz 05', status: 'PAUSED', why: 'Liposonix TM rulează din centru pls' },
  ] },
  // 23.11 ~23:30, George: the card's new form for Timișoara (its campaign CARD_FORM held above until George says go)
  CARD_FORM_TM,
  // 24.11 ~02:00, George: „da, pornește campania pe formular”
  CARD_FORM,
  // 23.11 ~23:20, George: go (traffic, 3 ads, per-ad tags)
  CARD_SITE,
  // 23.11 ~22:55, George changed the card campaigns (only TM, 100 lei, men and women, the home page) after the first
  // version had already made „C360 · TM · Card · site” (two ads, to the card page): it goes off at once; the new one comes
  // from CARD_SITE above once George says go
  { id: 'card-site-v1-off-2026-11-23', why: 'Prima versiune a campaniei cardului (TM, pagina cardului) oprită', actions: [
    { campaignId: '120250732165590149', name: 'C360 · TM · Card · site (v1)', status: 'PAUSED', why: 'George a schimbat campania: doar TM, 100 lei, prima pagină' },
  ] },
  // 23.11 ~19:50, George: no HIFU gât result on a HIFU gușă ad: the AR campaign with case 24 goes off at once, and is made
  // again with case 16 (HIFU gușă, from the approved set) under „ARAD”, the words about gușă; same audience, lookalike, 50 lei
  { id: 'ar-caz24-off-2026-11-23', why: 'HIFU gușă AR: reclama cu cazul 24 (HIFU gât) oprită', actions: [
    { campaignId: '120250730029690149', name: 'C360 · AR · HIFU G · caz 24', status: 'PAUSED', why: 'George: fără HIFU gât pe o reclamă de HIFU gușă' },
  ] },
  { id: 'ar-caz16-2026-11-23', why: 'HIFU gușă AR refăcută cu cazul 16, 50 lei/zi', site: {
    cta: 'SIGN_UP', ages: [28, 64],
    campaigns: [
      { name: 'C360 · AR · HIFU G · caz 16', city: 'Arad', radiusKm: 7, budget: 50, formId: '2726705401061098', like: '120250718340060149', lal: 'lal-clientele-2026-11-23', adsetName: 'C360 · AR · HIFU G · caz 16', ads: [
        { name: 'C360 · AR · HIFU G · caz 16', image: 'rezultate-ar-gusa-16.jpg',
          text: 'ARAD! Cum să ai o bărbie mai definită în poze, fără ace și fără operație, chiar dacă ai încercat deja de toate.\n\n' +
            '✅ Poza e reală: aceeași persoană, înainte și după HIFU gușă, la noi în clinică.\n' +
            '✅ HIFU: ultrasunete care strâng pielea de sub bărbie. Te întorci la treburile tale în aceeași zi.\n' +
            '✅ 5,0 pe Google, din peste 300 de recenzii.\n\n' +
            'HIFU gușă în Arad: 190 lei în loc de 290.\n\n' +
            '⏰ Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.\n\n' +
            '👉 Completează formularul și îți scriem noi pe WhatsApp.\ncentrul360.com\n\nRezultatele diferă de la o persoană la alta.',
          headlines: ['BĂRBIE MAI DEFINITĂ, FĂRĂ OPERAȚIE 👉', 'MAI E PUȚIN PÂNĂ PE 24 DECEMBRIE ⏰💨', 'HIFU GUȘĂ ÎN ARAD: 190 LEI 👉'], description: '5,0 pe Google, peste 300 de recenzii' },
      ] },
    ] } },
  // 23.11 ~19:00, George: „pune-le pe toate 4 live”: four lead-form campaigns of one ad each, 50 lei a day, the audience of
  // the running winners copied exactly (TM: „C360 · TM · HIFU G · sezon”, AR: „C360 · AR · HIFU G · sezon (2)”), women only,
  // with the clients' lookalike where it leaves enough people; the picture: a real case of the homepage, untouched, under
  // the city's name (brand_asset/ads/); HIFU gușă into the HIFU site forms, Liposonix TM into its simple form's site copy
  { id: 'four-cases-2026-11-23', why: 'Patru campanii noi pe formular (cazurile 16, 02, 24, 05), 50 lei/zi fiecare', site: {
    cta: 'SIGN_UP', ages: [28, 64],
    campaigns: [
      { name: 'C360 · TM · HIFU G · caz 16', city: 'Timișoara', radiusKm: 7, budget: 50, formId: '1649159630586598', like: '120250715944510149', lal: 'lal-clientele-2026-11-23', adsetName: 'C360 · TM · HIFU G · caz 16', ads: [
        { name: 'C360 · TM · HIFU G · caz 16', image: 'rezultate-tm-gusa.jpg',
          text: 'TIMIȘOARA! Cum să ai un profil mai definit, fără ace și fără operație, chiar dacă până acum cremele și exercițiile n-au ajutat.\n\n' +
            '✅ Rezultatul din poză e real, făcut la noi în clinica din Timișoara.\n' +
            '✅ HIFU: ultrasunete care strâng pielea de sub bărbie, într-o singură ședință.\n' +
            '✅ HIFU gușă la 190 lei în loc de 290.\n\n' +
            '⏰ Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.\n\n' +
            '👉 Completează formularul și îți scriem noi pe WhatsApp.\ncentrul360.com\n\nRezultatele diferă de la o persoană la alta.',
          headlines: ['PROFIL MAI DEFINIT, FĂRĂ OPERAȚIE 👉', 'DE PÂNĂ LA 3 ORI MAI MULT, PÂNĂ PE 24 DECEMBRIE ⏰💨', 'HIFU GUȘĂ: 190 LEI ÎN LOC DE 290 👉'], description: '5,0 pe Google, peste 300 de recenzii' },
      ] },
      { name: 'C360 · TM · HIFU G · caz 02', city: 'Timișoara', radiusKm: 7, budget: 50, formId: '1649159630586598', like: '120250715944510149', lal: 'lal-clientele-2026-11-23', adsetName: 'C360 · TM · HIFU G · caz 02', ads: [
        { name: 'C360 · TM · HIFU G · caz 02', image: 'rezultate-tm-gusa-02.jpg',
          text: 'TIMIȘOARA! Cum să ai bărbia și gâtul mai definite fără operație, chiar dacă ai crezut că doar bisturiul mai poate ajuta.\n\n' +
            '✅ Poza e reală: aceeași persoană, înainte și după HIFU, la noi în clinica din Timișoara.\n' +
            '✅ Fără ace și fără pauză. Te întorci la treburile tale în aceeași zi.\n' +
            '✅ 5,0 pe Google, din peste 300 de recenzii.\n\n' +
            'HIFU gușă: 190 lei în loc de 290.\n\n' +
            '⏰ Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.\n\n' +
            '👉 Lasă-ne numărul în formular și îți scriem noi pe WhatsApp.\ncentrul360.com\n\nRezultatele diferă de la o persoană la alta.',
          headlines: ['BĂRBIE MAI DEFINITĂ, FĂRĂ ACE 👉', 'DOAR PÂNĂ PE 24 DECEMBRIE ⏰💨', '190 LEI ÎN LOC DE 290 👉'], description: 'Consultația e gratuită' },
      ] },
      { name: 'C360 · AR · HIFU G · caz 24', city: 'Arad', radiusKm: 7, budget: 50, formId: '2726705401061098', like: '120250718340060149', lal: 'lal-clientele-2026-11-23', adsetName: 'C360 · AR · HIFU G · caz 24', ads: [
        { name: 'C360 · AR · HIFU G · caz 24', image: 'rezultate-ar-gat.jpg',
          text: 'ARAD! Cum să ai un gât mai neted și o bărbie mai definită, fără ace și fără operație, chiar dacă ai crezut că pielea lăsată nu se mai strânge.\n\n' +
            '✅ Poza e reală, făcută la noi în clinica din Arad.\n' +
            '✅ HIFU: ultrasunete care strâng pielea. Te întorci la treburile tale în aceeași zi.\n' +
            '✅ 5,0 pe Google, din peste 300 de recenzii.\n\n' +
            'HIFU gușă în Arad: 190 lei în loc de 290.\n\n' +
            '⏰ Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.\n\n' +
            '👉 Completează formularul și îți scriem noi pe WhatsApp.\ncentrul360.com\n\nRezultatele diferă de la o persoană la alta.',
          headlines: ['GÂT MAI NETED, FĂRĂ OPERAȚIE 👉', 'MAI E PUȚIN PÂNĂ PE 24 DECEMBRIE ⏰💨', 'HIFU GUȘĂ ÎN ARAD: 190 LEI 👉'], description: '5,0 pe Google, peste 300 de recenzii' },
      ] },
      { name: 'C360 · TM · Liposonix · caz 05', city: 'Timișoara', radiusKm: 7, budget: 50, formJob: 'form-site-lipo-tm-2026-11-23', like: '120250715944510149', lal: 'lal-clientele-2026-11-23', adsetName: 'C360 · TM · Liposonix · caz 05', ads: [
        { name: 'C360 · TM · Liposonix · caz 05', image: 'rezultate-tm-solduri.jpg',
          text: 'TIMIȘOARA! Cum să ai o talie mai definită fără operație și fără diete stricte, chiar dacă sala nu te-a ajutat până acum.\n\n' +
            '✅ Poza e reală, făcută la noi în clinica din Timișoara.\n' +
            '✅ Stai întinsă, iar ultrasunetele Liposonix lucrează pe grăsimea de pe șolduri. Tu nu faci niciun efort.\n' +
            '✅ 2 zone la preț de una: 640 lei în loc de 1.280.\n\n' +
            '⏰ Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.\n\n' +
            '👉 Completează formularul și îți scriem noi pe WhatsApp.\ncentrul360.com\n\nRezultatele diferă de la o persoană la alta.',
          headlines: ['TALIE MAI DEFINITĂ, FĂRĂ OPERAȚIE 👉', 'DE PÂNĂ LA 3 ORI MAI MULT, PÂNĂ PE 24 DECEMBRIE ⏰💨', '2 ZONE LA PREȚ DE UNA 👉'], description: '5,0 pe Google, peste 300 de recenzii' },
      ] },
    ] } },
  // 23.11 ~19:00, George („pune-le pe toate 4 live”, the lookalike „la toate”): lookalikes of „C360 · Clientele noastre”
  // (the clinic's clients and the Transformarea 360 list), Romania, 1 to 10%; each new campaign takes the smallest one that
  // still reaches enough people in its city, or none
  { id: 'lal-clientele-2026-11-23', why: 'Publicuri asemănătoare clientelor noastre (România, 1-10%)', lookalike: {
    origin: '120250716547410149', country: 'RO', ratios: [1, 2, 3, 5, 10], name: 'C360 · Asemănător RO {p}% · Clientele noastre' } },
  // 23.11, George: Liposonix TM back on a simple lead form, ending like the HIFU ones (on the site's home page): the form the
  // old Liposonix TM campaigns used (Lipo 640 · Timișoara) copied as it is, only the ending; registered with the same offer
  // and city, so its leads get the same WhatsApp
  { id: 'form-site-lipo-tm-2026-11-23', why: 'Finalul formularului Liposonix TM duce pe site', formSite: {
    formId: '1471161508313617', name: 'Lipo 640 · Timișoara · site',
    page: { title: '⚠️ ÎNCĂ NU AI TERMINAT!', body: 'Mai ai un pas 👇 Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.', button_type: 'VIEW_WEBSITE', button_text: 'VEZI MAI MULTE 👉',
      website_url: 'https://www.centrul360.com/?utm_source=facebook&utm_medium=leadform&utm_campaign=liposonix-tm' } } },
  // 23.11 ~18:00, George: the brand reel „Nu promitem. Îți arătăm.” (Conținut, the clean video: no music, only real cases
  // of the clinic, untouched) as the site's ad, in place of „Rezultate · site”: two campaigns, TM and AR, Purchase on the
  // site's pixel, women 25-64, 50 lei a day each, one video ad each to the home page (api/_lib/meta-ads.js videoUpload)
  { id: 'reel-aratam-site-2026-11-23', why: 'Reelul „Nu promitem. Îți arătăm.” spre site: TM și AR, câte o reclamă, 50 lei/zi', site: {
    pixelId: '2276074362800484', cta: 'LEARN_MORE', ages: [25, 64],
    campaigns: ['TM', 'AR'].map((k) => ({ name: 'C360 · ' + k + ' · Reel Nu promitem · site', utm: 'reel-aratam-' + k.toLowerCase(), city: k === 'TM' ? 'Timișoara' : 'Arad', budget: 50, ads: [
      { name: k + ' · Reel Nu promitem · site', video: REEL_ARATAM,
        text: (k === 'TM' ? 'TIMIȘOARA' : 'ARAD') + '! Cum să alegi un tratament fără operație și fără ace, chiar dacă ai auzit deja prea multe promisiuni.\n\n' +
          'Noi nu promitem. Îți arătăm.\n\n' +
          '✅ Fiecare caz din video e real, fotografiat la noi în clinică, înainte și după.\n' +
          '✅ 5,0 pe Google, din peste 300 de recenzii.\n' +
          '✅ Cu Cardul de Sărbători plătești 990 lei și primești 2.500 lei în tratamente.\n\n' +
          '⏰ Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.\n\n' +
          '👉 Intră pe site și vezi toate ofertele:\ncentrul360.com\n\nRezultatele diferă de la o persoană la alta.',
        headlines: ['NU PROMITEM. ÎȚI ARĂTĂM 👉', 'DE PÂNĂ LA 3 ORI MAI MULT, PÂNĂ PE 24 DECEMBRIE ⏰💨', 'PLĂTEȘTI 990 LEI, PRIMEȘTI 2.500 LEI 👉'], description: '5,0 pe Google, peste 300 de recenzii' },
    ] })) } },
  // 23.11 ~17:50, George: „stinge toate cele pe achiziție și lead filter” (the reel „Nu promitem. Îți arătăm.” takes the
  // site's place, TM and AR); the two HIFU gușă „sezon” lead-form campaigns stay on (his answer)
  { id: 'stop-site-lf-2026-11-23', why: 'George: oprite toate cele pe achiziție și lead filter', actions: [
    { campaignId: '120250723824760149', name: 'TM · Rezultate · site · Liposonix șolduri', status: 'PAUSED', why: 'George' },
    { campaignId: '120250724045060149', name: 'TM · Rezultate · site · HIFU gât', status: 'PAUSED', why: 'George' },
    { campaignId: '120250724049700149', name: 'AR · Rezultate · site · Liposonix șolduri', status: 'PAUSED', why: 'George' },
    { campaignId: '120250724053080149', name: 'AR · Rezultate · site · HIFU gât', status: 'PAUSED', why: 'George' },
    { campaignId: '120250724015450149', name: 'AR · LF · Liposonix șolduri', status: 'PAUSED', why: 'George' },
  ] },
  // 23.11 10:47: my duplicate job (removed) ran next to site-results-dupes and paused the other TM HIFU gât copy too, so TM
  // had no HIFU gât ad left; that copy goes back on (AR was paused by both, the same ad: nothing to undo there)
  { id: 'site-results-undo-2026-11-23', why: 'Rezultate · site TM: reclama HIFU gât pornită la loc', actions: [
    { campaignId: '120250724045060149', name: 'C360 · TM · Rezultate · site · HIFU gât', status: 'ACTIVE', why: 'oprită din greșeală, a doua oprire a dublurii' },
  ] },
  // 23.11: the v3 run of „Rezultate · site” left the HIFU gât ad twice in each campaign (a retried step); one of each goes
  // off so each campaign has its 2 ads (Liposonix șolduri and HIFU gât), as George asked
  { id: 'site-results-dupes-2026-11-23', why: 'Reclama HIFU gât apărea de două ori în fiecare campanie Rezultate · site', actions: [
    { campaignId: '120250723826580149', name: 'TM · HIFU gât · caz 24 (dublură)', status: 'PAUSED', why: 'dublură' },
    { campaignId: '120250724167180149', name: 'AR · HIFU gât · caz 24 (dublură)', status: 'PAUSED', why: 'dublură' },
  ] },
  // 23.11, George: Liposonix in Arad, into the lead filter. The Arad abdomen-talie lead-filter form still ended on WhatsApp,
  // so it's copied as it is (questions, packages, privacy; registered with the same kind, zone and city, so its leads get
  // the same package messages), only the ending on the home page; then one campaign of one ad (the Arad name over case 05,
  // the real Liposonix șolduri result of the homepage), 50 lei a day, women 28-64, Arad 7 km, into the copy; „C360 · AR ·
  // HIFU G · sezon” goes off once it's made, so the day's total stays the same (its twin „(2)” keeps running)
  { id: 'form-home-lf-abdomen-ar-2026-11-23', why: 'Finalul formularului lead filter abdomen-talie Arad duce pe site', formSite: {
    formId: '1652022543051105', name: 'Lead filter · Abdomen și talie · Arad · site',
    page: { title: '⚠️ ÎNCĂ NU AI TERMINAT!', body: 'Mai ai un pas 👇 Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.', button_type: 'VIEW_WEBSITE', button_text: 'VEZI MAI MULTE 👉',
      website_url: 'https://www.centrul360.com/?utm_source=facebook&utm_medium=leadform&utm_campaign=lf-lipo-ar' } } },
  { id: 'lf-lipo-ar-2026-11-23', why: 'Liposonix Arad în lead filter (50 lei/zi), HIFU gușă AR sezon oprită', site: {
    cta: 'SIGN_UP', ages: [28, 64],
    campaigns: [{ name: 'C360 · AR · LF · Liposonix', city: 'Arad', radiusKm: 7, budget: 50, formJob: 'form-home-lf-abdomen-ar-2026-11-23', ads: [
      { name: 'AR · LF · Liposonix șolduri · caz 05', image: 'rezultate-ar-solduri.jpg',
        text: 'ARAD! Cum să ai o talie mai definită fără operație, chiar dacă dietele și sala nu te-au ajutat până acum.\n\n' +
          '✅ O singură ședință de Liposonix. Poza e reală, făcută la noi în clinică.\n' +
          '✅ Fără diete stricte. Stai întinsă, iar ultrasunetele lucrează pe grăsimea de pe șolduri și talie.\n' +
          '✅ 2 zone la preț de una: 640 lei în loc de 1.280, de Black Friday.\n\n' +
          'Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.\n\n' +
          '👉 Completează formularul și vezi ce plan ți se potrivește.\ncentrul360.com\n\nRezultatele diferă de la o persoană la alta.',
        headlines: ['TALIE MAI DEFINITĂ, FĂRĂ OPERAȚIE 👉', '2 ZONE LA PREȚ DE UNA, DE BLACK FRIDAY ⏰💨', 'VEZI CE PLAN ȚI SE POTRIVEȘTE 👉'], description: '5,0 pe Google, peste 300 de recenzii' },
    ] }],
    pauseAfter: [{ campaignId: '120250718332580149', name: 'C360 · AR · HIFU G · sezon', why: 'oprită ca totalul pe zi să rămână același (Liposonix AR în lead filter)' }] } },
  // 23.11 ~01:30, George („cu pixel configurat”, the account is only Centrul360's now): the site's pixel was never shared
  // with this ad account (Meta: „Contul nu are acces la pixel”, 1815045), so the 2 campaigns made at 01:18 can't run and
  // can't be fixed (Meta: make them again from scratch). The pixel shared once (as api/_lib/pixel-share.js, the pixel's
  // business Mellon Vision); if Meta refuses, the job stops there with Meta's words (no blind retries); if it works, the
  // same 2 campaigns made again, then the 2 broken ones paused. 01:30, George: only the two best
  // cases, 05 and 24, in both cities (SITE_CAMPAIGNS)
  // 23.11 ~02:30, George: Mellon Vision is now a partner on the ad account (v2 was refused at 02:18: „the business 1107600260509887
  // must have access to both the pixel and the ad account”, 200/1784039); v3 is the same job again
  { id: 'site-results-v3-2026-11-23', why: 'Pixelul partajat cu contul și rezultatele reale refăcute (TM și AR, câte 2 reclame, 50 lei/zi)', site: {
    pixelId: '2276074362800484', sharePixel: '1107600260509887', cta: 'LEARN_MORE', ages: [25, 64], campaigns: SITE_CAMPAIGNS,
    pauseAfter: [{ campaignId: '120250718543790149', name: 'C360 · TM · Rezultate · site (fără pixel)' }, { campaignId: '120250718631180149', name: 'C360 · AR · Rezultate · site (fără pixel)' }] } },
  { id: 'site-results-v2-2026-11-23', why: 'Pixelul partajat cu contul și rezultatele reale refăcute (TM și AR, câte 2 reclame, 50 lei/zi)', site: {
    pixelId: '2276074362800484', sharePixel: '1107600260509887', cta: 'LEARN_MORE', ages: [25, 64], campaigns: SITE_CAMPAIGNS,
    pauseAfter: [{ campaignId: '120250718543790149', name: 'C360 · TM · Rezultate · site (fără pixel)' }, { campaignId: '120250718631180149', name: 'C360 · AR · Rezultate · site (fără pixel)' }] } },
  // 23.11, George: two campaigns of real results to the home page (Purchase on the site's pixel), 50 lei a day each, women
  // only, the button „Află mai multe”: Timișoara with cases 16 and 05, Arad with cases 24 and 11 (the homepage's approved
  // cases, untouched, under the city's name). The pictures: brand_asset/ads/rezultate-*.jpg. Made once (api/_lib/ads-once.js
  // `site`): the first ad makes the campaign and its ad set, the second joins that ad set; each step written down at once.
  { id: 'site-results-2026-11-23', why: 'Rezultate reale spre prima pagină: TM și AR, câte 2 reclame, 50 lei/zi', site: {
    pixelId: '2276074362800484', cta: 'LEARN_MORE', ages: [25, 64],
    campaigns: SITE_CAMPAIGNS } },
  // 23.11 ~00:20, the first copy (1713044987053623) was made with a draft ending, before George's final words; the final
  // one: copied from it as it is, only the ending in George's words; every C360 ad on the first copy or on the old WhatsApp
  // form moves to it, the template too, and the draft copy is archived once no ad sends into it
  // (v2 was refused by Meta at 00:32 and 01:18; v3: another name, Meta keeps a form's name unique on the Page)
  { id: 'form-home-hifu-tm-v3-2026-11-23', why: 'Finalul formularului HIFU gușă TM, în cuvintele lui George', formSite: {
    formId: '1713044987053623', name: 'HIFU Gușă 190 · Timișoara · site 2', moveFrom: ['1713044987053623', '1604290084129939'], archive: '1713044987053623',
    page: { title: '⚠️ ÎNCĂ NU AI TERMINAT!', body: 'Mai ai un pas 👇 Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.', button_type: 'VIEW_WEBSITE', button_text: 'VEZI MAI MULTE 👉',
      website_url: 'https://www.centrul360.com/?utm_source=facebook&utm_medium=leadform&utm_campaign=hifu-gusa-tm' } } },
  { id: 'form-template-home-v2-2026-11-23', why: 'Formularele noi se termină pe site, în cuvintele lui George', template: {
    ending: { title: '⚠️ ÎNCĂ NU AI TERMINAT!', body: 'Mai ai un pas 👇 Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.' },
    cta: { type: 'VIEW_WEBSITE', text: 'VEZI MAI MULTE 👉', url: 'https://www.centrul360.com/?utm_source=facebook&utm_medium=leadform' } } },
  // 23.11, George: „ACUM ÎN RECLAME FIECARE FINAL DE FORMULAR VREAU SĂ DUCĂ PE SITE, PE HOMEPAGE”. A published form can't
  // change: HIFU Gușă 190 · Timișoara is copied as it is (questions, answers, privacy, language, title of the questions
  // page), only its ending now sends her to the home page; the running ad moves to the copy (same texts, same picture)
  { id: 'form-home-hifu-tm-2026-11-23', why: 'Finalul formularului duce pe site: HIFU gușă TM', formSite: {
    formId: '1604290084129939', name: 'HIFU Gușă 190 · Timișoara · site', adId: '120250715948280149', campaign: 'C360 · TM · HIFU G · sezon',
    page: { title: '⚠️ ÎNCĂ NU AI TERMINAT!', body: 'Mai ai un pas 👇 Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.', button_type: 'VIEW_WEBSITE', button_text: 'VEZI MAI MULTE 👉',
      website_url: 'https://www.centrul360.com/?utm_source=facebook&utm_medium=leadform&utm_campaign=hifu-gusa-tm' } } },
  // 23.11, George: every HIFU gușă campaign sends into the site form; Arad gets its twin (the same questions and ending,
  // Arad's routing), so an Arad HIFU gușă campaign can use it
  { id: 'form-home-hifu-ar-2026-11-23', why: 'Finalul formularului duce pe site: HIFU gușă Arad', formSite: {
    formId: '1532605858616346', name: 'HIFU Gușă 190 · Arad · site', moveFrom: ['1532605858616346'],
    page: { title: '⚠️ ÎNCĂ NU AI TERMINAT!', body: 'Mai ai un pas 👇 Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.', button_type: 'VIEW_WEBSITE', button_text: 'VEZI MAI MULTE 👉',
      website_url: 'https://www.centrul360.com/?utm_source=facebook&utm_medium=leadform&utm_campaign=hifu-gusa-ar' } } },
  // 23.11, George: every new form ends the same way, on the home page (Formulare → Setări formulare)
  { id: 'form-template-home-2026-11-23', why: 'Formularele noi se termină pe site', template: {
    ending: { title: '⚠️ ÎNCĂ NU AI TERMINAT!', body: 'Mai ai un pas 👇 Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.' },
    cta: { type: 'VIEW_WEBSITE', text: 'VEZI MAI MULTE 👉', url: 'https://www.centrul360.com/?utm_source=facebook&utm_medium=leadform' } } },
  // 21.11 ~20:45, George: always „Plătești 990 lei” first, then „Primești 2.500 lei”: the A6 ads with the reversed
  // order go off (their corrected v2 is already live in the same ad sets)
  { id: 'card-a6-order-2026-11-21', why: 'Întâi ce plătești, apoi ce primești: A6 cu ordinea inversă se oprește', actions: [
    { campaignId: '120260600117080112', name: 'CARD · FORM · A6_valoare (ordinea inversă)', status: 'PAUSED', why: 'înlocuită de A6 v2' },
    { campaignId: '120260600831800112', name: 'CARD · VÂNZARE · HOME · A6_valoare (ordinea inversă)', status: 'PAUSED', why: 'înlocuită de A6 v2' },
  ] },
  // 21.11 ~19:00, George: the card ads' destination is the home page: the 4 sales ads to /card-sarbatori go off, the same
  // 4 to the home page (already live in the same ad set) take their place
  { id: 'card-home-2026-11-21', why: 'Reclamele de vânzare ale cardului duc pe prima pagină', actions: [
    { campaignId: '120260600035920112', name: 'CARD · VÂNZARE · A3 prietena (pagina cardului)', status: 'PAUSED', why: 'înlocuită de aceeași reclamă spre prima pagină' },
    { campaignId: '120260600119500112', name: 'CARD · VÂNZARE · A4 tine (pagina cardului)', status: 'PAUSED', why: 'înlocuită de aceeași reclamă spre prima pagină' },
    { campaignId: '120260600120440112', name: 'CARD · VÂNZARE · A2 mama (pagina cardului)', status: 'PAUSED', why: 'înlocuită de aceeași reclamă spre prima pagină' },
    { campaignId: '120260600120910112', name: 'CARD · VÂNZARE · A6 valoare (pagina cardului)', status: 'PAUSED', why: 'înlocuită de aceeași reclamă spre prima pagină' },
  ] },
  // 21.11 ~18:30, George: HIFU gușă TM at 50, the two 190 doors at 30 each; the card in 3 campaigns of 4 creatives,
  // 50 lei each, Timișoara and Arad together, women only (Meta picks the creative); the old card ad off
  { id: 'george-budgets-2026-11-21', why: 'Bugetele lui George: gușă 50, ușile 30, cardul 3 campanii x 50 lei', actions: [
    { campaignId: '120260595784720112', name: 'BK · TM · HIFU G · sezon (contul vechi)', daily: 50, why: 'George: 50 lei' },
    { campaignId: '120260597251670112', name: 'LF · TM · HIFU G 190 · ușa', daily: 30, why: 'George: 30 lei' },
    { campaignId: '120260597253050112', name: 'LF · AR · HIFU G 190 · ușa', daily: 30, why: 'George: 30 lei' },
    { campaignId: '120260599181780112', name: 'CARD · FORM · feed (4 creative)', daily: 50, why: 'George: 50 lei pe campanie' },
    { campaignId: '120260600033830112', name: 'CARD · VÂNZARE · feed (4 creative)', daily: 50, why: 'George: 50 lei pe campanie' },
    { campaignId: '120260600760170112', name: 'CARD · FORM · STORIES (4 creative 9:16)', daily: 50, why: 'George: 50 lei pe campanie' },
    { campaignId: '120260591688440112', name: 'CARD · CALD · 2.500 lei în tratamente ca astea', status: 'PAUSED', why: 'cardul rămâne doar în cele 3 campanii noi' },
  ] },
  // 21.11 ~18:00, George: „reclamele cu cardul sunt cu obiectiv de achiziție?”: the card page campaign was optimised for
  // page views; it's replaced by the same ad optimised for the pixel's Purchase (the card paid in myPOS goes back to Meta)
  { id: 'card-sales-2026-11-21', why: 'Reclama cardului pe site caută acum cumpărători (Purchase), nu vizite', actions: [
    { campaignId: '120260599182800112', name: 'CARD · SITE · Plătești 290 lei (vizite)', status: 'PAUSED', why: 'optimizată pe vizite, înlocuită de cea pe cumpărare' },
    { campaignId: '120260600034500112', name: 'CARD · VÂNZARE (setul)', status: 'ACTIVE', why: 'pornit cu campania' },
    { campaignId: '120260600035920112', name: 'CARD · VÂNZARE (reclama)', status: 'ACTIVE', why: 'pornit cu campania' },
    { campaignId: '120260600033830112', name: 'CARD · VÂNZARE · Plătești 290 lei. Ea primește 500 lei', status: 'ACTIVE', why: 'cardul pe site, optimizat pe cumpărare' },
  ] },
  // 21.11 ~17:20, George: „da, pornește-le”: the Card de Sărbători gets the money (two destinations side by side: the
  // reservation form and the card page); the lead filter ads without cheap leads stop; per day the total stays the same
  { id: 'card-on-2026-11-21', why: 'Cardul de Sărbători primește banii (formular și pagina cardului), totalul pe zi rămâne același', actions: [
    { campaignId: '120260591748260112', name: 'LF · TM · P2 · O singură ședință', status: 'PAUSED', why: '21 lei pe lead, banii merg la card' },
    { campaignId: '120260591767590112', name: 'LF · AR · C2 · Corp sau față?', status: 'PAUSED', why: '22 lei pe lead, banii merg la card' },
    { campaignId: '120260595786020112', name: 'BK · AR · VIDEO · HIFU abdomen · vid 8 (contul vechi)', status: 'PAUSED', why: '12 lei, niciun lead, banii merg la card' },
    { campaignId: '120260599181870112', name: 'CARD · FORM (setul)', status: 'ACTIVE', why: 'pornit cu campania' },
    { campaignId: '120260599182200112', name: 'CARD · FORM (reclama)', status: 'ACTIVE', why: 'pornit cu campania' },
    { campaignId: '120260599181780112', name: 'CARD · FORM · Tu plătești 990 lei. Ea primește 2.500 lei', daily: 40, why: 'cardul, formularul de rezervare' },
    { campaignId: '120260599181780112', name: 'CARD · FORM · Tu plătești 990 lei. Ea primește 2.500 lei', status: 'ACTIVE', why: 'cardul, formularul de rezervare' },
    { campaignId: '120260599183110112', name: 'CARD · SITE (setul)', status: 'ACTIVE', why: 'pornit cu campania' },
    { campaignId: '120260599183950112', name: 'CARD · SITE (reclama)', status: 'ACTIVE', why: 'pornit cu campania' },
    { campaignId: '120260599182800112', name: 'CARD · SITE · Plătești 290 lei. Ea primește 500 lei', daily: 40, why: 'cardul, direct pe pagina cardului' },
    { campaignId: '120260599182800112', name: 'CARD · SITE · Plătești 290 lei. Ea primește 500 lei', status: 'ACTIVE', why: 'cardul, direct pe pagina cardului' },
  ] },
  // 21.11 ~14:30: the lead filter's door for gușă: the proven HIFU gușă 190 ads of the old account, now into a lead-filter
  // form (14.900 / 4.990 / 990 / 190, no review screen). AR's door takes the budget of „Căutăm 8 doamne din Arad” (0 leads)
  { id: 'lf-door-190-2026-11-21', why: 'Ușa de 190 în lead filter: HIFU gușă, reclama dovedită, în formularul cu pachete', actions: [
    { campaignId: '120260591756890112', name: 'LF · AR · P1 · Căutăm 8 doamne din Arad', status: 'PAUSED', why: '16 lei, 0 leaduri: banii merg la ușa de 190 din Arad' },
    { campaignId: '120260597253050112', name: 'LF · AR · HIFU G 190 · ușa', daily: 40, why: 'reclama HIFU gușă câștigătoare din Arad, în lead filter' },
    { campaignId: '120260597251670112', name: 'LF · TM · HIFU G 190 · ușa', daily: 30, why: 'a doua reclamă HIFU gușă câștigătoare din Timișoara, în lead filter' },
  ] },
  // 21.11 ~14:15, George: „de ce avem buget așa de mic pe astea, așa nu o să fie leaduri”: the TM HIFU gușă backup is the
  // account's best (2 leads, 2 bookings, ~3.5 lei a lead) and gets the money; per city the total stays the same
  { id: 'bk-up-2026-11-21', why: 'Rezervele primesc banii: HIFU gușă TM programează la 3,5 lei pe lead', actions: [
    { campaignId: '120260595784720112', name: 'BK · TM · HIFU G · sezon (contul vechi)', daily: 45, why: '2 leaduri, 2 programări, 3,5 lei pe lead' },
    { campaignId: '120260591751460112', name: 'LF · TM · A2 · Talie definită. Fără efort', status: 'PAUSED', why: '21 lei pe lead, banii merg la HIFU gușă TM' },
    { campaignId: '120260591748260112', name: 'LF · TM · P2 · O singură ședință', daily: 25, why: 'lead filter TM: 14 lei pe lead, rămâne' },
    { campaignId: '120260595786020112', name: 'BK · AR · VIDEO · HIFU abdomen · vid 8 (contul vechi)', daily: 25, why: 'rezerva AR primește buget să poată aduce leaduri' },
    { campaignId: '120260591767590112', name: 'LF · AR · C2 · Corp sau față?', daily: 30, why: 'lead filter AR: 16 lei pe lead' },
  ] },
  // 21.11 ~13:00, George: „dacă mai văd leaduri la lead filter îi plătesc cu mare drag; dacă nu, ne mutăm pe alt cont”: the
  // ~170 lei left before the threshold go mostly to the lead filter (its 4 best at 40 lei), the backups kept small
  { id: 'lf-first-2026-11-21', why: 'Banii rămași până la prag merg întâi pe lead filter', actions: [
    { campaignId: '120260591751460112', name: 'LF · TM · A2 · Talie definită. Fără efort', daily: 40, why: 'lead filter: a adus un 990' },
    { campaignId: '120260591748260112', name: 'LF · TM · P2 · O singură ședință', daily: 40, why: 'lead filter: a adus un 990' },
    { campaignId: '120260591767590112', name: 'LF · AR · C2 · Corp sau față?', daily: 40, why: 'lead filter: a adus un lead' },
    { campaignId: '120260591756890112', name: 'LF · AR · P1 · Căutăm 8 doamne din Arad', daily: 40, why: 'lead filter: cele mai multe clicuri la Arad' },
    { campaignId: '120260595784720112', name: 'BK · TM · HIFU G · sezon (contul vechi)', daily: 20, why: 'rezerva: a dovedit contul (lead la 2,5 lei), restul banilor la lead filter' },
    { campaignId: '120260595786020112', name: 'BK · AR · VIDEO · HIFU abdomen · vid 8 (contul vechi)', daily: 15, why: 'rezerva, mică: banii la lead filter' },
  ] },
  // 21.11 ~12:10: 250 lei, 3 leads; ~180 lei (~55 CAD) left before George's ~131 CAD threshold. Many clicks and few forms
  // sent on the long lead-filter forms, so the money tilts to what has proven cheap leads: the two backups from the old
  // account to 50 lei a day, the lead filter on its 4 best (the 3 with a lead + Căutăm 8 doamne Arad, the most clicks)
  { id: 'focus-before-threshold-2026-11-21', why: 'Înainte de prag: mai mulți bani pe rezervele dovedite, lead filter pe cele 4 bune', actions: [
    { campaignId: '120260595784720112', name: 'BK · TM · HIFU G · sezon (contul vechi)', daily: 50, why: 'rezerva dovedită: lead ~8 lei pe contul vechi' },
    { campaignId: '120260595786020112', name: 'BK · AR · VIDEO · HIFU abdomen · vid 8 (contul vechi)', daily: 50, why: 'rezerva dovedită: lead ~16 lei pe contul vechi' },
    { campaignId: '120260591746950112', name: 'LF · TM · P1 · Căutăm 10 doamne din Timișoara', status: 'PAUSED', why: '12,7 lei, 3 clicuri, niciun lead' },
    { campaignId: '120260591760900112', name: 'LF · AR · P8 · Talie mai definită', status: 'PAUSED', why: '14 lei, 4 clicuri, niciun lead' },
  ] },
  // 21.11 ~11:00, George: 25 campaigns split the money; before the ~131 CAD threshold he wants to see many leads, so the
  // money goes on 6 angles: the 3 that brought a lead (abdomen: Talie definită TM, O singură ședință TM, Corp sau față AR)
  // and the strongest proven mechanisms (Căutăm N doamne TM and AR, the Arad waist case), 35 lei a day each; the rest off
  // (they stay ready to come back); at the card only the real-results ad (the most clicks)
  { id: 'lf-focus-6-2026-11-21', why: 'Bugetul concentrat pe 6 unghiuri, ca să vedem leaduri multe înainte de prag', actions: [
    { campaignId: '120260591746950112', name: "LF · TM · P1 · Căutăm 10 doamne din Timișoara", daily: 35, why: 'unul din cele 6 unghiuri păstrate, cu bugetul concentrat' },
    { campaignId: '120260591748260112', name: "LF · TM · P2 · O singură ședință", daily: 35, why: 'unul din cele 6 unghiuri păstrate, cu bugetul concentrat' },
    { campaignId: '120260591749750112', name: "LF · TM · P6 · Grăsimea care nu pleacă cu sala", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591750380112', name: "LF · TM · P3 · Lifting fără bisturiu", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591751460112', name: "LF · TM · A2 · Talie definită. Fără efort", daily: 35, why: 'unul din cele 6 unghiuri păstrate, cu bugetul concentrat' },
    { campaignId: '120260591752540112', name: "LF · TM · N2 · Se vede ceva după o singură ședință?", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591754420112', name: "LF · TM · C2 · Corp sau față?", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591755990112', name: "LF · TM · P4 · 40 de cazuri. Toate reale", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591756890112', name: "LF · AR · P1 · Căutăm 8 doamne din Arad", daily: 35, why: 'unul din cele 6 unghiuri păstrate, cu bugetul concentrat' },
    { campaignId: '120260591759170112', name: "LF · AR · P2 · O singură ședință", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591760900112', name: "LF · AR · P8 · Talie mai definită", daily: 35, why: 'unul din cele 6 unghiuri păstrate, cu bugetul concentrat' },
    { campaignId: '120260591763580112', name: "LF · AR · A3 · Conturul feței, redefinit", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591767590112', name: "LF · AR · C2 · Corp sau față?", daily: 35, why: 'unul din cele 6 unghiuri păstrate, cu bugetul concentrat' },
    { campaignId: '120260591771370112', name: "LF · AR · P4 · 40 de cazuri. Toate reale", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593926700112', name: "LF · TM · P9 · Ridurile din jurul ochilor, mai fine", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593929940112', name: "LF · TM · A6 · Tu stai întinsă. Aparatul lucrează", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593932270112', name: "LF · TM · P7 · Mămici din Timișoara", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593935070112', name: "LF · TM · A1 · Rochia de Revelion", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593937620112', name: "LF · TM · N1 · Ce am învățat după 40 de cazuri:", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593940630112', name: "LF · AR · P10 · Un ten mai luminos", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593942970112', name: "LF · AR · A5 · La 50 de ani, fără bisturiu", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593947280112', name: "LF · AR · N3 · 3 lucruri despre gușă pe care nu le spun", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591674640112', name: 'CARD · CALD · Alegi cât plătești (K5)', status: 'PAUSED', why: 'la card rămâne doar reclama cu cazurile reale (cele mai multe clicuri)' },
    { campaignId: '120260591684390112', name: 'CARD · CALD · Plătești 990 (K1)', status: 'PAUSED', why: 'la card rămâne doar reclama cu cazurile reale (cele mai multe clicuri)' },
  ] },
  // 21.11 ~11:00, George: „ai grijă la adspent, la 131 CAD se opresc” and he wants a winner on this account first: the test
  // keeps its breadth (22 lead-filter angles) at a pace the money lasts: 10 lei a day each (15 on the three with a lead
  // already), the cold card test off; ~260 lei (~80 CAD) a day instead of ~710
  { id: 'lf-test-budget-2026-11-21', why: 'Bugetul de test pe contul nou: mai multe unghiuri, mai puțini bani pe fiecare', actions: [
    { campaignId: '120260591746950112', name: "LF · TM · P1 · Căutăm 10 doamne din Timișoara", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591748260112', name: "LF · TM · P2 · O singură ședință", daily: 15, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591749750112', name: "LF · TM · P6 · Grăsimea care nu pleacă cu sala", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591750380112', name: "LF · TM · P3 · Lifting fără bisturiu", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591751460112', name: "LF · TM · A2 · Talie definită. Fără efort", daily: 15, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591752540112', name: "LF · TM · N2 · Se vede ceva după o singură ședință?", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591754420112', name: "LF · TM · C2 · Corp sau față?", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591755990112', name: "LF · TM · P4 · 40 de cazuri. Toate reale", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591756890112', name: "LF · AR · P1 · Căutăm 8 doamne din Arad", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591759170112', name: "LF · AR · P2 · O singură ședință", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591760900112', name: "LF · AR · P8 · Talie mai definită", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591763580112', name: "LF · AR · A3 · Conturul feței, redefinit", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591767590112', name: "LF · AR · C2 · Corp sau față?", daily: 15, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591771370112', name: "LF · AR · P4 · 40 de cazuri. Toate reale", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593926700112', name: "LF · TM · P9 · Ridurile din jurul ochilor, mai fine", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593929940112', name: "LF · TM · A6 · Tu stai întinsă. Aparatul lucrează", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593932270112', name: "LF · TM · P7 · Mămici din Timișoara", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593935070112', name: "LF · TM · A1 · Rochia de Revelion", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593937620112', name: "LF · TM · N1 · Ce am învățat după 40 de cazuri:", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593940630112', name: "LF · AR · P10 · Un ten mai luminos", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593942970112', name: "LF · AR · A5 · La 50 de ani, fără bisturiu", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593947280112', name: "LF · AR · N3 · 3 lucruri despre gușă pe care nu le spun", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591689740112', name: 'CARD · RECE · Cadoul… oglindă (K2)', status: 'PAUSED', why: 'publicul rece la card, cel mai puțin probabil; banii merg pe lead filter' },
    { campaignId: '120260591690580112', name: 'CARD · RECE · Pentru mama (K3)', status: 'PAUSED', why: 'publicul rece la card, cel mai puțin probabil; banii merg pe lead filter' },
    { campaignId: '120260591692210112', name: 'CARD · RECE · Moș Crăciun (K4)', status: 'PAUSED', why: 'publicul rece la card, cel mai puțin probabil; banii merg pe lead filter' },
  ] },
  // 20.11 19:47: TM LipoSonix isn't in the Timișoara plan (laser and HIFU gușă only), and spent 14 lei today with no lead
  { id: 'lipo-off-2026-11-20', why: 'LipoSonix nu e în planul TM', actions: [
    { campaignId: '120252015088300103', name: 'TM LIPO · stai întinsă v2', status: 'PAUSED', why: 'în afara planului TM, 14 lei azi fără lead' },
  ] },
  // 20.11 16:05, George: „stinge RF gușă la Arad și aprinde HIFU gușă la Arad”. RF off; the two Arad HIFU „sezon” back on
  // (23 and 17 bookings, 19 and 10 clients in October), next to a new ad with a real Arad HIFU case (H5 Arad)
  { id: 'arad-hifu-2026-11-20', why: 'Arad: RF gușă oprit, HIFU gușă pornit', actions: [
    { campaignId: '120251992601670103', name: 'AR RF GUSA · căutăm 8 doamne (port TM)', status: 'PAUSED', why: 'Arad trece pe HIFU gușă (George, 20.11)' },
    { campaignId: '120252030180490103', name: 'AR RF GUSA · căutăm 8 doamne contur (U1)', status: 'PAUSED', why: 'Arad trece pe HIFU gușă (George, 20.11)' },
    { campaignId: '120252030190520103', name: 'AR RF GUSA · bărbia dublă fără operație (U3)', status: 'PAUSED', why: 'Arad trece pe HIFU gușă (George, 20.11)' },
    { campaignId: '120252030191620103', name: 'AR RF GUSA · până de sărbători (U4)', status: 'PAUSED', why: 'Arad trece pe HIFU gușă (George, 20.11)' },
    { campaignId: '120251962566280103', name: 'AR RF GUSA · copertă 3', status: 'PAUSED', why: 'Arad trece pe HIFU gușă (George, 20.11)' },
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', status: 'ACTIVE', why: '23 programări, 19 cliente' },
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', daily: 100, why: 'repornită' },
    { campaignId: '120251418133050103', name: 'AR HIFU G · sezon (2)', status: 'ACTIVE', why: '17 programări, 10 cliente' },
    { campaignId: '120251418133050103', name: 'AR HIFU G · sezon (2)', daily: 80, why: 'repornită' },
  ] },
  // 20.11 15:10: the best ad of all time on HIFU (the iPad video with the real cases: 29 bookings, 12 clients) back on
  { id: 'video-back-2026-11-20', why: 'cea mai bună reclamă HIFU din istoric, cu cazuri reale', actions: [
    { campaignId: '120251585544900103', name: 'TM VIDEO · HIFU gușă · iPad', status: 'ACTIVE', why: '29 programări, 12 cliente, lead la 10 lei' },
    { campaignId: '120251585544900103', name: 'TM VIDEO · HIFU gușă · iPad', daily: 60, why: 'repornită' },
  ] },
  // 20.11 13:47, the hourly check: AR RF T3 at 9 lei a lead today (8 over 3 days), the cheapest of all: back to 110
  { id: 'h1347-2026-11-20', why: 'AR T3 lead la 8-9 lei', actions: [
    { campaignId: '120251992601670103', name: 'AR RF GUSA · căutăm 8 doamne (port TM)', daily: 110, why: 'lead la 9 lei azi, 8 lei pe 3 zile' },
  ] },
  // 20.11 13:00, George: „reclamele merg ca naiba”. Off what spent two days with no lead (laser E2 32 lei, E3 31 lei,
  // HIFU sezon v2 26 lei); the money stays on what brings leads
  // 20.11 13:20: TM HIFU „stai întinsă” at 28 lei a lead over two days (TM ~9): off; the winning „sezon” creative goes on fresh
  { id: 'noon-hifu-2026-11-20', why: 'lead la 28 lei, de 3 ori media TM', actions: [
    { campaignId: '120252019828940103', name: 'TM HIFU G · stai întinsă', status: 'PAUSED', why: '28 lei, 1 lead în 2 zile' },
  ] },
  // 20.11 13:10: TM laser E1 spent 41 lei today with no lead; its creative goes on fresh (E1 reluat) next to E4, published now
  { id: 'noon-e1-2026-11-20', why: '41 lei azi fără lead, înlocuită cu E1 reluat și E4', actions: [
    { campaignId: '120252019959160103', name: 'TM LASER · căutăm 15 doamne', status: 'PAUSED', why: '41 lei azi, 0 leaduri' },
  ] },
  { id: 'noon-stop-2026-11-20', why: 'zero leaduri în două zile', actions: [
    { campaignId: '120252019966140103', name: 'TM LASER · fără ras pentru totdeauna', status: 'PAUSED', why: '32 lei, 0 leaduri în 2 zile' },
    { campaignId: '120252019962330103', name: 'TM LASER · stai întinsă', status: 'PAUSED', why: '31 lei, 0 leaduri în 2 zile' },
    { campaignId: '120252019815200103', name: 'TM HIFU G · sezon v2', status: 'PAUSED', why: '26 lei, 0 leaduri în 2 zile' },
  ] },
  // Friday 20.11, the owner („până atunci o putem ține mai lowkey… ca să avem capital pentru consumabile”): the real push
  // starts Saturday morning, so the weekend books Monday and the week. Friday only the winners, smaller, still learning:
  // laser „căutăm 15 doamne” (7 leads for 34 lei) stays, the rest down
  { id: 'friday-lowkey-2026-11-20', why: 'vineri mai puțin, push-ul începe sâmbătă dimineață', actions: [
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', daily: 120, why: 'vineri lowkey' },
    { campaignId: '120252019962330103', name: 'TM LASER · stai întinsă', daily: 40, why: 'vineri lowkey, 0 leaduri încă' },
    { campaignId: '120252019966140103', name: 'TM LASER · fără ras pentru totdeauna', daily: 40, why: 'vineri lowkey, 0 leaduri încă' },
    { campaignId: '120252019815200103', name: 'TM HIFU G · sezon v2', daily: 30, why: 'vineri lowkey' },
    { campaignId: '120252019824130103', name: 'TM HIFU G · căutăm 10 doamne', daily: 40, why: 'vineri lowkey' },
    { campaignId: '120252019828940103', name: 'TM HIFU G · stai întinsă', daily: 30, why: 'vineri lowkey' },
    { campaignId: '120251992601670103', name: 'AR RF GUSA · căutăm 8 doamne (port TM)', daily: 80, why: 'vineri lowkey' },
  ] },
  // 19.11 22:47, the routine: AR RF „stai întinsă” (T2) at ~30 lei a lead over two days (T3 „căutăm 8 doamne” at ~7) off,
  // its money to T3 (+50%); the new TM laser „căutăm 15 doamne” (E1) brought 5 leads for 20 lei in its first hours: +50%
  { id: 'night-2026-11-19', why: 'lead scump la AR RF stai întinsă; banii pe ce aduce leaduri ieftine', actions: [
    { campaignId: '120251992596850103', name: 'AR RF GUSA · stai întinsă (port TM)', status: 'PAUSED', why: '~30 lei pe lead, de 4 ori cât T3' },
    { campaignId: '120251992601670103', name: 'AR RF GUSA · căutăm 8 doamne (port TM)', daily: 110, why: 'lead la ~7 lei, programează' },
    { campaignId: '120252019959160103', name: 'TM LASER · căutăm 15 doamne', daily: 105, why: '5 leaduri la 20 lei în primele ore' },
  ] },
  // 19.11 evening, the owner („STINGE RESTART, avem nevoie doar de overflow de HIFU gușă și epilare laser”): from next
  // week Mădălina does laser consultations non-stop (2 an hour, 16 a day) and Bianca + Raluca HIFU gușă (about 17 a day)
  // with the package pitch; every Restart ad off and the Timișoara LipoSonix too, the money goes to HIFU gușă and laser.
  // HIFU sezon (a lead at ~8 lei) to 200 lei a day now; the laser ones scale once their first day shows the lead's price
  { id: 'focus-hifu-laser-2026-11-19', why: 'doar HIFU gușă și epilare laser: Restart și LipoSonix TM oprite, cerut de voi pe 19.11', actions: [
    { campaignId: '120251418278340103', name: 'TM RESTART · fără ace', status: 'PAUSED', why: 'planul: doar HIFU gușă și laser' },
    { campaignId: '120251400568370103', name: 'TM RESTART · local', status: 'PAUSED', why: 'planul: doar HIFU gușă și laser' },
    { campaignId: '120251992594590103', name: 'AR RESTART · căutăm 8 doamne (port TM)', status: 'PAUSED', why: 'planul: fără Restart' },
    { campaignId: '120252015088300103', name: 'TM LIPO · stai întinsă v2', status: 'PAUSED', why: 'planul: doar HIFU gușă și laser' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', daily: 200, why: 'overflow HIFU gușă, lead ~8 lei' },
  ] },
  // 19.11 afternoon, the owner („avem nevoie de lead overflow, principal HIFU gușă la Timișoara, foarte tare”): the
  // clinic's best ad, HIFU sezon (ROAS 11, a lead at ~8 lei), to 150 lei a day; 3 new HIFU gușă ads published next to it
  { id: 'tm-hifu-overflow-2026-11-19', why: 'HIFU gușă Timișoara: lead overflow, cerut de voi pe 19.11', actions: [
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', daily: 150, why: 'cea mai bună reclamă (ROAS 11, lead ~8 lei), overflow cerut' },
  ] },
  // 19.11 midday (Claude, George's rule of 19.11): TM video iPad's lead went to 46 lei (18.11) and 20 lei today, off
  // (a new LipoSonix „Stai întinsă” v2 takes its place, published at 50 lei); Arad's RF „Căutăm 8 doamne” books (6 leads,
  // 2 bookings, ~7 lei a lead), to 75 lei for Friday's 77%
  { id: 'midday-2026-11-19', why: 'TM video iPad oprit (lead scump), AR RF „Căutăm 8 doamne” la 75 lei (programează)', actions: [
    { campaignId: '120251585544900103', name: 'TM VIDEO · HIFU gușă · iPad', status: 'PAUSED', why: 'lead 46 lei pe 18.11' },
    { campaignId: '120251992601670103', name: 'AR RF GUSA · căutăm 8 doamne (port TM)', daily: 75, why: '6 leaduri, 2 programări, ~7 lei/lead' },
  ] },
  // 19.11 morning (Claude, George's rule of 19.11: the calendar full at its target): Timișoara at 75-77% today and
  // tomorrow against 126%, ~15 hours missing; no paused winner left with cheap leads to recycle, so the two cheapest
  // running ones get more: HIFU sezon (a lead at ~8 lei, 3 clients this week) and Restart fără ace (~10 lei, 8 bookings)
  { id: 'tm-scale-2026-11-19', why: 'Timișoara: buget mai mare pe cele mai ieftine două reclame, calendarul e la 75-77%', actions: [
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', daily: 110, why: 'lead ~8 lei, calendarul TM la 75-77%' },
    { campaignId: '120251418278340103', name: 'TM RESTART · fără ace', daily: 75, why: 'lead ~10 lei, 8 programări în 3 zile' },
  ] },
  // 18.11 evening, the owner in his main session („da”): Timișoara's Restart local back on at 50 lei a day, for Thursday
  // and Friday's calendar (75-77% against 125%); ROAS 4,1, 5 clients, a lead at 8 lei when it last ran
  { id: 'tm-restart-local-on-2026-11-18', why: 'TM Restart local pornit la 50 lei/zi pentru calendarul de joi și vineri, cerut de voi pe 18.11', actions: [
    { campaignId: '120251400568370103', name: 'TM RESTART · local', daily: 50, why: 'calendarul TM joi-vineri la 75-77%' },
    { campaignId: '120251400568370103', name: 'TM RESTART · local', status: 'PAUSED', why: 'oprită o clipă (repornire curată)' },
    { campaignId: '120251400568370103', name: 'TM RESTART · local', status: 'ACTIVE', why: 'calendarul TM joi-vineri la 75-77%' },
  ] },
  // 18.11 evening: Meta paused every running campaign („Reclamele au fost puse în pauză din cauza unui cont compromis”,
  // issue 4134001) after the owner's Facebook security check; „O poți reactiva pentru a relua livrarea”: off and on again.
  // TM HIFU copertă 50+ stays off (24 lei without a lead today, 52 lei for one lead yesterday).
  { id: 'reactivate-compromised-2026-11-18', why: 'reclamele repornite după pauza Meta „cont compromis” din 18.11', actions: [
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', status: 'PAUSED', why: 'reactivare după „cont compromis”: oprită o clipă' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', status: 'ACTIVE', why: 'reactivată după „cont compromis”' },
    { campaignId: '120251418278340103', name: 'TM RESTART · fără ace', status: 'PAUSED', why: 'reactivare după „cont compromis”: oprită o clipă' },
    { campaignId: '120251418278340103', name: 'TM RESTART · fără ace', status: 'ACTIVE', why: 'reactivată după „cont compromis”' },
    { campaignId: '120251585544900103', name: 'TM VIDEO · HIFU gușă · iPad', status: 'PAUSED', why: 'reactivare după „cont compromis”: oprită o clipă' },
    { campaignId: '120251585544900103', name: 'TM VIDEO · HIFU gușă · iPad', status: 'ACTIVE', why: 'reactivată după „cont compromis”' },
    { campaignId: '120251992594590103', name: 'AR RESTART · căutăm 8 doamne (port TM)', status: 'PAUSED', why: 'reactivare după „cont compromis”: oprită o clipă' },
    { campaignId: '120251992594590103', name: 'AR RESTART · căutăm 8 doamne (port TM)', status: 'ACTIVE', why: 'reactivată după „cont compromis”' },
    { campaignId: '120251992596850103', name: 'AR RF GUSA · stai întinsă (port TM)', status: 'PAUSED', why: 'reactivare după „cont compromis”: oprită o clipă' },
    { campaignId: '120251992596850103', name: 'AR RF GUSA · stai întinsă (port TM)', status: 'ACTIVE', why: 'reactivată după „cont compromis”' },
    { campaignId: '120251992601670103', name: 'AR RF GUSA · căutăm 8 doamne (port TM)', status: 'PAUSED', why: 'reactivare după „cont compromis”: oprită o clipă' },
    { campaignId: '120251992601670103', name: 'AR RF GUSA · căutăm 8 doamne (port TM)', status: 'ACTIVE', why: 'reactivată după „cont compromis”' },
    { campaignId: '120251796512940103', name: 'TM HIFU G · copertă 50+', status: 'PAUSED', why: 'lead la 52 lei ieri, niciunul azi la 24 lei' },
  ] },
  // 18.11, the owner in his main session (Arad's dark covers bring leads that don't come: „reclamele sunt problema...
  // dacă astea nu merg, facem altele diferite”): three new Arad ads published from Timișoara's winners (Restart „Căutăm 8
  // doamne”, RF gușă „Stai întinsă” and „Căutăm 8 doamne”), the old dark ones off. Arad stays at 150 lei a day.
  { id: 'ar-dark-off-2026-11-18', why: 'Arad: reclamele dark înlocuite cu 3 noi după câștigătoarele din Timișoara, cerut de voi pe 18.11', actions: [
    { campaignId: '120251788054780103', name: 'AR RF GUSA · copertă 40+', status: 'PAUSED', why: 'vin puține din cele programate (6 din 16)' },
    { campaignId: '120251962578980103', name: 'AR RESTART · invitație 10 doamne', status: 'PAUSED', why: 'înlocuită de Restart „Căutăm 8 doamne” (port TM)' },
    { campaignId: '120251962566280103', name: 'AR RF GUSA · copertă 3', status: 'PAUSED', why: 'înlocuită de reclamele noi RF gușă (port TM)' },
  ] },
  // 18.11 night, the owner in his main session („e puțin ciudat că la Arad se cheltuie mai mult ca la Timișoara...
  // rezolvă totul să aibă sens”): Arad has about half Timișoara's hours, so its spend follows what books. Kept: RF copertă 3,
  // RF 40+, Restart invitație (7 bookings from 18 leads since 16.11); off: RF 50+ (1 booking from 7 leads, 28 lei a lead
  // on 17.11) and Restart local (no booking from 4 leads). Arad goes from 250 to 150 lei a day.
  { id: 'ar-trim-2026-11-18', why: 'Arad: rămân doar reclamele care aduc programări (150 lei/zi), cerut de voi pe 18.11', actions: [
    { campaignId: '120251788054230103', name: 'AR RF GUSA · copertă 50+', status: 'PAUSED', why: '1 programare din 7 leaduri de la 16.11' },
    { campaignId: '120251389243100103', name: 'AR RESTART · local', status: 'PAUSED', why: 'nicio programare din 4 leaduri de la 16.11' },
  ] },
  // 16.11 evening, the owner in his main session (Arad's calendar at 33-57% for the next 2 days: „da, ce putem face să
  // fie full la AR”): the 40+ cover back on at 50 lei a day, the cheapest leads in Arad (13 on 13.11 for 85 lei)
  { id: 'ar-rf40-on-2026-11-16', why: 'Arad RF gușă copertă 40+ pornită din nou la 50 lei/zi, pentru calendar, cerut de voi pe 16.11', actions: [
    { campaignId: '120251788054780103', name: 'AR RF GUSA · copertă 40+', daily: 50, why: 'cele mai ieftine leaduri din Arad, calendarul la 33-57%' },
    { campaignId: '120251788054780103', name: 'AR RF GUSA · copertă 40+', status: 'ACTIVE', why: 'cele mai ieftine leaduri din Arad, calendarul la 33-57%' },
  ] },
  // 16.11, the owner in his main session (few leads in Arad, only RF gușă 50+ running: „pornește restart”): Arad's
  // Restart „Căutăm 10 doamne din Arad.” back on at 50 lei a day (ROAS 3,3, 5 clients since 16.10)
  { id: 'ar-restart-on-2026-11-16', why: 'Restart Arad pornit din nou la 50 lei/zi, cerut de voi pe 16.11', actions: [
    { campaignId: '120251389243100103', name: 'AR RESTART · local', daily: 50, why: 'ROAS 3,3, 5 cliente; Arad are puține leaduri' },
    { campaignId: '120251389243100103', name: 'AR RESTART · local', status: 'ACTIVE', why: 'ROAS 3,3, 5 cliente; Arad are puține leaduri' },
  ] },
  // 15.11 night, the owner in his main session (from the full report: „pornește doar asta”): Timișoara's HIFU gușă
  // „hifu gușă” back on at 50 lei a day (ROAS 5,1, 14 clients, a lead at 8 lei on its last days)
  { id: 'tm-hifu-gusa-on-2026-11-15', why: 'TM HIFU gușă pornită din nou la 50 lei/zi, cerut de voi pe 15.11', actions: [
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', daily: 50, why: 'ROAS 5,1, 14 cliente, lead 8 lei' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', status: 'ACTIVE', why: 'ROAS 5,1, 14 cliente, lead 8 lei' },
  ] },
  // 15.11, the owner in his main session (Arad RF gușă: „okay super și asta pornește-o”): the 40+ cover off (ROAS 1,2),
  // the 50+ cover back on at 50 lei a day (ROAS 3, 6 clients since 8.11)
  { id: 'ar-rf-swap-2026-11-15', why: 'Arad RF gușă: copertă 50+ pornită, 40+ oprită, cerut de voi pe 15.11', actions: [
    { campaignId: '120251788054780103', name: 'AR RF GUSA · copertă 40+', status: 'PAUSED', why: 'ROAS 1,2' },
    { campaignId: '120251788054230103', name: 'AR RF GUSA · copertă 50+', daily: 50, why: 'ROAS 3, 6 cliente, pornită la 50 lei/zi' },
    { campaignId: '120251788054230103', name: 'AR RF GUSA · copertă 50+', status: 'ACTIVE', why: 'ROAS 3, 6 cliente, pornită la 50 lei/zi' },
  ] },
  // 10.11 afternoon, the owner („ok”): abdomen video 3 back on after the guard stopped it (no lead after 40 lei in 7 days);
  // switched back on by hand, the guard leaves it for 7 days unless a lead costs 40 lei or more
  { id: 'tm-vid3-on-2026-11-10', why: 'pornită din nou pe 10.11 după oprirea paznicului, cerut de voi', actions: [
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', status: 'ACTIVE', why: 'ROAS 4,9x de la 16.10' },
  ] },
  // 10.11, the owner in his main session (Timișoara's best return since 16.10: „aprinde 2. și 3. și 7.”, then „aprinde și 5.”):
  // four Timișoara campaigns back on, each at the budget it has
  { id: 'tm-best-roas-on-2026-11-10', why: 'pornite din nou pe 10.11, cele mai bune ROAS din Timișoara, cerut de voi', actions: [
    { campaignId: '120251505897650103', name: 'TM LIPO · fără efort', status: 'ACTIVE', why: 'ROAS 11,2x' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon (Până la sărbători)', status: 'ACTIVE', why: 'ROAS 10,1x, 12 cliente' },
    { campaignId: '120251418278340103', name: 'TM RESTART · fără ace', status: 'ACTIVE', why: 'ROAS 6,7x' },
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', status: 'ACTIVE', why: 'ROAS 4,9x, 4.090 lei încasați' },
  ] },
  // 7.11 night, the owner in his main session („doar active”: in Arad only the Restart, the two LipoSonix 30 and 33 and the
  // two RF gușă): the third LipoSonix (36) off, and the old static LipoSonix ad that still shows „with issues”
  { id: 'ar-only-five-2026-11-07', why: 'Arad: rămân active doar Restart, 2 LipoSonix și 2 RF gușă, cerut de voi pe 7.11', actions: [
    { campaignId: '120251787710030103', name: 'AR LIPO · 640 erou', status: 'PAUSED', why: 'Arad: rămân doar 2 LipoSonix (30 și 33)' },
    { campaignId: '120250873662240103', name: 'STATICS LIPO AR (reclama)', status: 'PAUSED', why: 'Arad: reclamă veche cu probleme, fără livrare' },
  ] },
  // 7.11 night, the owner in his main session (the Restart ad with the best return, at 60, then „da”): Arad's Restart
  // ad „Căutăm 10 doamne din Arad.” back on at 60 lei a day, only this campaign
  { id: 'ar-restart-on-2026-11-07', why: 'Restart Arad pornit din nou la 60 lei/zi, cerut de voi pe 7.11', actions: [
    { campaignId: '120251389243100103', name: 'AR RESTART · local', daily: 60, why: 'Arad Restart: cel mai bun randament, pornit din nou la 60 lei/zi' },
    { campaignId: '120251389243100103', name: 'AR RESTART · local', status: 'ACTIVE', why: 'Arad Restart: cel mai bun randament, pornit din nou la 60 lei/zi' },
  ] },
  // 5.11 afternoon, the owner ("stinge toate reclamele active temporar"): every running campaign off (the hiring one was
  // already off); they come back on when the owner says so, in Reclame or by a new job here
  { id: 'stop-all-2026-11-05', why: 'oprite toate temporar pe 5.11, cerut de voi', actions: [
    { campaignId: '120251585544900103', name: 'TM VIDEO · HIFU gușă · iPad', status: 'PAUSED', why: 'oprită temporar, cerut de voi' },
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', status: 'PAUSED', why: 'oprită temporar, cerut de voi' },
    { campaignId: '120251418158480103', name: 'tm vid 8 - copie', status: 'PAUSED', why: 'oprită temporar, cerut de voi' },
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', status: 'PAUSED', why: 'oprită temporar, cerut de voi' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', status: 'PAUSED', why: 'oprită temporar, cerut de voi' },
  ] },
  // 1.11 afternoon, the owner ("stinge ce nu merge, poate s-au saturat și alea bune, fă cum crezi, doar să nu se cheltuie aiurea"):
  // by the days' numbers, Arad's second gușă ad is saturated (frequency 2.2, the last three days 129 lei for 4 leads, a lead at
  // 32 lei against 12-15 before, a booking over the 30 line); abdomen video 3 shows the same fatigue (the last two days a lead at
  // 26 lei against 8-12, today 69 lei for one) but its visits pay ~690 lei each, so it is cut to 70, not stopped
  { id: 'stop-2026-11-01-b', why: 'saturate pe 1.11: oprită cea de-a doua gușă din Arad, abdomenul video 3 la 70', actions: [
    { campaignId: '120251418133050103', name: 'AR HIFU G · sezon', status: 'PAUSED', why: 'Arad gușă (a doua): saturată, 129 lei pentru 4 lead-uri în 3 zile' },
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', daily: 70, why: 'TM abdomen video 3: lead-ul a ajuns la 26 lei, 70 lei/zi până se echilibrează' },
  ] },
  // 1.11, the owner ("oprește ce nu merge, că se cheltuie aiurea"): Arad's abdomen video 8 after 4 days: 128 lei, 8 leads, 1 booking
  // from 6 (65 lei one, over the 60 line), the leads' price up to 31 lei today; the others book under their lines or have
  // a clear return, so they stay
  { id: 'stop-2026-11-01', why: 'oprită pe 1.11: 65 lei pe programare, 1 din 6 lead-uri', actions: [
    { campaignId: '120251598142680103', name: 'AR VIDEO · HIFU abdomen · vid 8', status: 'PAUSED', why: 'Arad abdomen video 8: 128 lei, o programare din 6 lead-uri' },
  ] },
  // 31.10 evening, the owner ("cele cu ROAS clar la normal, restul pe economie"): the ads with a clear return keep their normal
  // budgets (abdomen video 3 at 100, hifu gușă 50); video 8 has no visit paid yet, so it goes to the economical 40
  { id: 'plan-2026-10-31-b', why: 'cele fără ROAS încă, pe economie, cerut de voi pe 31.10', actions: [
    { campaignId: '120251418158480103', name: 'tm vid 8 - copie', daily: 40, why: 'TM abdomen video 8: nicio venire plătită încă, 40 lei/zi' },
  ] },
  // 31.10 evening, the owner (the economical variant for next week; "dai push la 100 la abdomenul care merge", "cele care merg
  // extrem de bine, lasă-le la bugetul normal"): the four Timișoara HIFU gușă / abdomen ads that book cheaply back on at the
  // budgets they already have (hifu gușă 50, gușă iPad 48, abdomen video 3 at 100, abdomen video 8 at 50); Arad stays as it is
  { id: 'plan-2026-10-31', why: 'săptămâna viitoare: reclamele din Timișoara pornite din nou, la bugetele lor, cerut de voi pe 31.10', actions: [
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', status: 'ACTIVE', why: 'TM gușă: programarea la 17 lei' },
    { campaignId: '120251585544900103', name: 'TM VIDEO · HIFU gușă · iPad', status: 'ACTIVE', why: 'TM gușă: programarea la 11 lei' },
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', daily: 100, why: 'TM abdomen: cel mai bun, 100 lei/zi' },
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', status: 'ACTIVE', why: 'TM abdomen: cel mai bun, 100 lei/zi' },
    { campaignId: '120251418158480103', name: 'tm vid 8 - copie', status: 'ACTIVE', why: 'TM abdomen: programarea la 24-30 lei' },
  ] },
  // 29.10 evening, the owner ("aprinde"): Arad's best gușă ad, found off (not by the portal), back on at its budget
  { id: 'ar-gusa80-on-2026-10-29', why: 'pornită din nou pe 29.10, cerut de voi', actions: [
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', status: 'ACTIVE', why: 'Arad gușă: cea mai bună din Arad (15 programări, 8 venite)' },
  ] },
  // 29.10 afternoon, the owner ("die nicht gut laufen, ausschalten"): the three Arad gușă ads turned back on this morning
  // by the rule (gușă under 30 lei a booking) are over it now, a lead between them today, and they share Arad's women
  // with the two that work
  { id: 'stop-2026-10-29', why: 'oprite pe 29.10: peste regula de 30 lei pe programare la gușă', actions: [
    { campaignId: '120251401198430103', name: 'AR HIFU G · fără efort', status: 'PAUSED', why: 'Arad gușă: 39 lei pe programare, niciun lead azi' },
    { campaignId: '120251401230830103', name: 'AR HIFU G · orașul', status: 'PAUSED', why: 'Arad gușă: 40 lei pe programare' },
    { campaignId: '120251418148270103', name: 'AR HIFU G · vrei bărbia mai definită', status: 'PAUSED', why: 'Arad gușă: 31 lei pe programare, niciun lead azi' },
  ] },
  // 29.10, the owner: "on: whatever books under 30 lei, under 40 if it's LipoSonix", HIFU gușă and HIFU abdomen /
  // LipoSonix only (no Restart); the paused ones that pass, at their own budgets (bookings counted since the portal keeps them)
  { id: 'rule-2026-10-29', why: 'regula voastră din 29.10: gușă sub 30 lei, abdomen sub 40 lei pe programare', actions: [
    { campaignId: '120251401198430103', name: 'AR HIFU G · fără efort', status: 'ACTIVE', why: 'Arad gușă: 2 programări la 20 lei' },
    { campaignId: '120251401230830103', name: 'AR HIFU G · orașul', status: 'ACTIVE', why: 'Arad gușă: 2 programări la 20 lei, au venit amândouă' },
    { campaignId: '120251418148270103', name: 'AR HIFU G · vrei bărbia mai definită', status: 'ACTIVE', why: 'Arad gușă: o programare la 25 lei' },
    { campaignId: '120251505897650103', name: 'TM LIPO · fără efort', status: 'ACTIVE', why: 'TM abdomen: 2 programări la ~31 lei' },
    { campaignId: '120251497737010103', name: 'AR LIPO · raritate', status: 'ACTIVE', why: 'Arad abdomen: o programare la 35 lei' },
  ] },
  // 28.10 evening, the owner ("hai să încercăm cu alea"): the side-view LipoSonix / HIFU abdomen video (vid 8, the cheapest
  // abdomen leads in September) back on in Timișoara next to vid 3, a new face for the same women
  { id: 'tm-vid8-2026-10-28', why: 'vid 8 pornit din nou, cerut de voi pe 28.10', actions: [
    { campaignId: '120251418158480103', name: 'tm vid 8 - copie', daily: 50, why: 'TM abdomen: al doilea video, cele mai ieftine lead-uri în septembrie' },
    { campaignId: '120251418158480103', name: 'tm vid 8 - copie', status: 'ACTIVE', why: 'TM abdomen: al doilea video, cele mai ieftine lead-uri în septembrie' },
  ] },
  // 28.10, the owner (plan 1 after the calendars: both clinics have room for about twice the bookings, with ~50% coming):
  // more to what brings bookings cheaply, the two best TM gușă ads back on, off what brings almost nothing
  { id: 'plan-2026-10-28', why: 'planul 1, aprobat de voi pe 28.10', actions: [
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', daily: 100, why: 'TM abdomen: programarea la ~29 lei, loc în calendar' },
    { campaignId: '120251418133050103', name: 'AR HIFU G · sezon', daily: 95, why: 'Arad gușă: programarea la ~30 lei, vin 65%' },
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', daily: 80, why: 'Arad gușă: programarea la ~30 lei, vin 65%' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', daily: 50, why: 'TM gușă pornită din nou: programarea la 21 lei' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', status: 'ACTIVE', why: 'TM gușă pornită din nou: programarea la 21 lei' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', daily: 50, why: 'TM gușă pornită din nou: programarea la 27 lei' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', status: 'ACTIVE', why: 'TM gușă pornită din nou: programarea la 27 lei' },
    { campaignId: '120251505897650103', name: 'TM LIPO · fără efort', status: 'PAUSED', why: 'leaduri scumpe, nicio venire' },
    { campaignId: '120251497423510103', name: 'AR LIPO · raritate', status: 'PAUSED', why: 'o programare din 9 leaduri; LipoSonix nu se mai face' },
  ] },
  // 27.10 night, the owner: Arad's Restart off; what runs is the LipoSonix TM that works at 75 lei a day (it had been put
  // back to 50 by hand), its two 25 lei tests, Arad's two gușă and its LipoSonix; the job ad stays on
  { id: 'plan-2026-10-27', why: 'cerut de voi pe 27.10', actions: [
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', daily: 75, why: 'TM: LipoSonix care merge, 75 lei/zi' },
    { campaignId: '120251418285690103', name: 'AR RESTART · fără ace', status: 'PAUSED', why: 'Arad: Restart oprit' },
    { campaignId: '120251389243100103', name: 'AR RESTART · local', status: 'PAUSED', why: 'Arad: Restart oprit' },
  ] },
  // 26.10 night: the other new LipoSonix ad in Timișoara too, 25 lei a day ("Fără efort. Fără diete stricte.")
  { id: 'tm-lipo-new2-2026-10-26', why: 'cerut de voi pe 26.10', actions: [
    { campaignId: '120251505980700103', name: 'TM LIPO · fără diete', status: 'ACTIVE', why: 'TM: încă o reclamă LipoSonix, 25 lei/zi' },
    { campaignId: '120251505980700103', name: 'TM LIPO · fără diete', daily: 25, why: 'TM: încă o reclamă LipoSonix, 25 lei/zi' },
  ] },
  // 26.10 night: one more LipoSonix ad in Timișoara, 25 lei a day: the "Stai întinsă" one made today (paused before it ran)
  { id: 'tm-lipo-new-2026-10-26', why: 'cerut de voi pe 26.10', actions: [
    { campaignId: '120251505897650103', name: 'TM LIPO · stai întinsă', daily: 25, why: 'TM: încă o reclamă LipoSonix, 25 lei/zi' },
    { campaignId: '120251505897650103', name: 'TM LIPO · stai întinsă', status: 'ACTIVE', why: 'TM: încă o reclamă LipoSonix, 25 lei/zi' },
  ] },
  // 26.10 evening, the owners: Timișoara one campaign only, the LipoSonix one that works (75 lei a day), the job ad off;
  // Arad proper leads: its 2 new gușă ads on, the good ones +20%, the day's cuts taken back.
  { id: 'plan-2026-10-26-b', why: 'decizia voastră din 26.10 seara', actions: [
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', daily: 75, why: 'TM: singura campanie, LipoSonix care merge' },
    { campaignId: '120251498280800103', name: 'TM ANGAJARE · Cosmeticiană', status: 'PAUSED', why: 'angajarea oprită' },
    { campaignId: '120251418158480103', name: 'tm vid 8 - copie', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251401225110103', name: 'TM HIFU G · rezultat real', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251505897650103', name: 'TM LIPO · stai întinsă', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251505980700103', name: 'TM LIPO · fără efort', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251497570950103', name: 'AR GUSA · fără efort', status: 'ACTIVE', why: 'Arad: mai multe leaduri' },
    { campaignId: '120251497422680103', name: 'AR GUSA · fără ace', status: 'ACTIVE', why: 'Arad: mai multe leaduri' },
    { campaignId: '120251418133050103', name: 'AR HIFU G · sezon', factor: 1.2, why: 'Arad: mai mult (programarea la 34 lei)' },
    { campaignId: '120251418285690103', name: 'AR RESTART · fără ace', factor: 1.2, why: 'Arad: mai mult (programarea la 31 lei)' },
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', daily: 65, why: 'Arad: bugetul de dimineață înapoi' },
    { campaignId: '120251389243100103', name: 'AR RESTART · local', daily: 60, why: 'Arad: bugetul de dimineață înapoi' },
  ] },
  // 26.10, the owner: Timișoara only LipoSonix and gușă (Restart off); what works very well gets more, so-so less.
  // Last 7 days, a booking's cost against the offer's price (15% very good, 30% bad):
  { id: 'plan-2026-10-26', why: 'decizia voastră din 26.10', actions: [
    { campaignId: '120251418278340103', name: 'TM RESTART · fără ace', status: 'PAUSED', why: 'TM: doar LipoSonix și gușă (Restart oprit)' },
    { campaignId: '120251400568370103', name: 'TM RESTART · local', status: 'PAUSED', why: 'TM: doar LipoSonix și gușă (Restart oprit)' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', factor: 1.2, why: 'merge foarte bine: programarea la 21 lei (10 din 24 de leaduri)' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', factor: 1.2, why: 'merge foarte bine: programarea la 27 lei (10 din 29), 3 au venit' },
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', factor: 1.2, why: 'LipoSonix TM: 640 lei încasați din 199 cheltuiți' },
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', factor: 0.8, why: 'merge so-so: programarea la 47 lei (5 din 20)' },
    { campaignId: '120251389243100103', name: 'AR RESTART · local', factor: 0.8, why: 'merge so-so săptămâna asta: programarea la 58 lei (4 din 20)' },
  ] },
  { id: 'ar-lipo-gusa-2026-10-24', city: /(^|[^a-z])ar([^a-z]|$)|arad/i, match: /lipo|gu[sș][aă]|b[aă]rbi|hifu/i, factor: 1.3, cap: 150,
    why: 'Arad are loc de programări: mai mult buget la LipoSonix și gușă (cerut de voi pe 24.10)' },
];

// who hears about it: the admin account named George (as the guard; api/_lib/notify.js ownerIds)
const { ownerIds } = require('./notify');
const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t));
// a job's day is in its id; one still undone 3 days later is given up (its intent is stale by then), with a word
const dayOf = (j) => (String(j.id).match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
const expired = (j) => !!dayOf(j) && Date.now() - Date.parse(dayOf(j) + 'T00:00:00+02:00') > 3 * 864e5;
const short = (s) => String(s || '').replace(/^(TM|AR) /, '').slice(0, 40);
const same = (a, b) => Math.round(Number(a) * 100) === Math.round(Number(b) * 100);

// a picture of brand_asset/ads/ (this repository, public): from GitHub's raw files, else from the site itself
async function sitePicture(file) {
  const tries = ['https://raw.githubusercontent.com/geotimo88898-lgtm/centrul360-website/main/brand_asset/ads/', 'https://www.centrul360.com/brand_asset/ads/'];
  let why = '';
  for (const base of tries) {
    try {
      const r = await fetch(base + encodeURIComponent(file));
      const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
      if (buf && buf.length > 10000 && buf[0] === 0xff && buf[1] === 0xd8) return { base64: buf.toString('base64') };
      why = 'poza ' + r.status;
    } catch (e) { why = 'poza: ' + e.message; }
  }
  return { error: why || 'poza lipsește' };
}
// the site's pixel shared with the connected ad account (the call of api/_lib/pixel-share.js), by the pixel's business;
// Meta's own words when it refuses
async function sharePixel(conn, pixel, business) {
  const tok = conn.userToken, act = conn.adAccountId;
  const words = (j) => { const e = (j && j.error) || {}; return [e.error_user_title, e.error_user_msg, e.message].filter(Boolean).join(' · ') + (e.code ? ' (cod ' + e.code + (e.error_subcode ? '/' + e.error_subcode : '') + ')' : ''); };
  const has = async () => { const r = await ads.call('GET', '/' + act + '/adspixels', tok, { fields: 'id,name', limit: '100' }); return r.ok ? (r.j.data || []).some((x) => String(x.id) === pixel) : null; };
  if (await has()) return { ok: true, already: true };
  const r = await ads.call('POST', '/' + pixel + '/shared_accounts', tok, { account_id: act.replace(/^act_/, ''), business });
  if (!r.ok || r.j.error) return { ok: false, error: words(r.j) || 'Meta n-a răspuns' };
  return { ok: true, answer: r.j, seen: await has() };
}
// what the site ads job made (ids, ads counted, the last refusal), for /api/clock-status
async function siteSummary() {
  const doc = (await readJSON(KEY, {})) || {};
  const out = {};
  for (const j of JOBS.filter((x) => x.site)) {
    const st = (doc.site || {})[j.id] || {};
    out[j.id] = { done: !!(doc.done || {})[j.id], campaigns: j.site.campaigns.map((c) => { const sc = st[c.name] || {}; return { name: c.name, campaignId: sc.campaignId || '', adsetId: sc.adsetId || '', ads: sc.ads || {}, error: sc.error || '', warning: sc.warning || '', lal: sc.lal || undefined, reach: sc.reach || undefined }; }), pixel: st.pixelAnswer || null, paused: st.paused || null };
  }
  return out;
}

// the B2B job's form (ELYSION): Meta's parameters, as fb-form-create.js builds them but with its own questions and ending;
// v: 0 as given, 1 the intro as a list of its sentences, 2 that and the ending's title without the emoji
function b2bFormParams(f, v) {
  const sentences = String(f.intro.text).split(/(?<=\.)\s+/).filter(Boolean).slice(0, 5);
  const p = {
    name: f.name, locale: 'RO_RO', questions: f.questions,
    privacy_policy: { url: 'https://www.centrul360.com/politica-de-confidentialitate', link_text: 'Politica de confidențialitate' },
    follow_up_action_url: 'https://www.centrul360.com', block_display_for_non_targeted_viewer: true,
    is_optimized_for_quality: true, // „Higher intent”: a review screen before sending
    context_card: v >= 1 ? { title: f.intro.title, style: 'LIST_STYLE', content: sentences, button_text: 'Continuă' } : { title: f.intro.title, style: 'PARAGRAPH_STYLE', content: [f.intro.text], button_text: 'Continuă' },
    thank_you_page: Object.assign({}, f.ending, { country_code: 'RO' }, v >= 2 ? { title: String(f.ending.title).replace(/[^\p{L}\p{N} .,!?]/gu, '').trim() } : {}),
  };
  return p;
}
// Meta's ids for the audience hint (its targeting search): an interest or behaviour of exactly that name, else the first
// whose name holds it; one not found is left out (written down)
async function b2bHints(conn, interests, behaviors) {
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const pick = (list, w) => list.find((x) => fold(x.name) === fold(w)) || list.find((x) => fold(x.name).includes(fold(w)));
  const out = { interests: [], behaviors: [], missing: [] };
  for (const w of interests) {
    const r = await ads.call('GET', '/search', conn.userToken, { type: 'adinterest', q: w, limit: '25', locale: 'en_US' });
    const hit = r.ok ? pick(r.j.data || [], w) : null;
    if (hit) out.interests.push({ id: String(hit.id), name: hit.name }); else out.missing.push(w + (r.ok ? '' : ' (căutarea: ' + ((r.j.error || {}).message || 'eroare') + ')'));
  }
  if (behaviors.length) {
    const r = await ads.call('GET', '/search', conn.userToken, { type: 'adTargetingCategory', class: 'behaviors', limit: '1000', locale: 'en_US' });
    const list = r.ok ? r.j.data || [] : [];
    for (const w of behaviors) {
      const hit = pick(list, w);
      if (hit) { out.behaviors.push({ id: String(hit.id), name: hit.name }); continue; }
      // not a behaviour: maybe an interest of that name
      const r2 = await ads.call('GET', '/search', conn.userToken, { type: 'adinterest', q: w, limit: '25', locale: 'en_US' });
      const hit2 = r2.ok ? pick(r2.j.data || [], w) : null;
      if (hit2) out.interests.push({ id: String(hit2.id), name: hit2.name }); else out.missing.push(w);
    }
  }
  return out;
}
// the ad set's audience: all of Romania, the ages, everyone, Advantage+ audience on (the hints as suggestions), no
// placements named (Advantage+ placements). v: 0 the ages as asked; 1 Meta's way with Advantage+ audience (the youngest
// age as a control, 25-60 as its suggestion); 2 the youngest age alone; 3 as 1 without the hints
function b2bTargeting(c, hints, v) {
  const t = { geo_locations: { countries: ['RO'], location_types: ['home', 'recent'] }, age_min: c.ages[0], targeting_automation: { advantage_audience: 1 } };
  if (v === 0) t.age_max = c.ages[1];
  if (v === 1 || v === 3) { t.age_max = 65; t.age_range = [c.ages[0], c.ages[1]]; }
  const spec = {};
  if (hints.interests.length) spec.interests = hints.interests;
  if (hints.behaviors.length) spec.behaviors = hints.behaviors;
  if (v !== 3 && Object.keys(spec).length) t.flexible_spec = [spec];
  return t;
}

async function run() {
  // a read that fails throws: nothing is applied and nothing overwritten this hour (a doc read as empty would apply
  // every job again, on an account that is already as the owners want it)
  const doc = Object.assign({ done: {}, log: [] }, (await readJSON(KEY, {})) || {});
  const todo = JOBS.filter((j) => !doc.done[j.id]);
  if (!todo.length) return { skipped: 'nothing' };
  // one run at a time: two clocks landing together (GitHub's late run and Vercel's cron) would apply a job twice
  if (doc.running && Date.now() - Date.parse(doc.running) < 5 * 60e3) return { skipped: 'running' };
  doc.running = new Date().toISOString();
  await writeJSON(KEY, doc, { quiet: true });
  const save = () => writeJSON(KEY, doc, { quiet: true });
  const out = [], problems = [];
  try {
    const conn = await loadConnection(readJSON);
    if (!conn.userToken || !conn.adAccountId) return { skipped: 'not_connected' };
    const ids = await ownerIds({ readJSON });
    // a word to the owner, each tag once a day (a refusal that lasts isn't repeated every hour)
    const tell = async (n) => {
      doc.told = doc.told || {};
      if (doc.told[n.tag] === day(Date.now())) return;
      doc.told[n.tag] = day(Date.now());
      await save();
      return notifyMany({ readJSON, writeJSON }, ids, Object.assign({ kind: 'alert', go: 'reclame', ownerPush: n.tone === 'bad' }, n)).catch((e) => console.error('ads-once tell:', e.message));
    };
    const logged = (j, a) => doc.log.some((e) => e.job === j.id && e.campaignId === a.campaignId && (e.status || 'budget') === (a.status || 'budget')); // a budget and a switch on the same campaign are two
    // a list of decided changes: a campaign switched on / off, or its budget (a number, or times a factor; 10 to 150 lei).
    // Every change is written down the moment Meta confirms it (a run cut short never repeats it); one already in
    // place is written down as such (not shown as a change); a refused one is told once, and tried again next hour
    for (const j of todo.filter((x) => x.actions)) {
      const failed = [];
      // a job on the old ad account „centru pls” (24.11, George reconnected it: the proven campaigns there): the same
      // changes, on that account's campaigns of ours (its own scope, its money in lei); any other account is refused
      // and (24.11, George switched Integrări to centru pls) the summitlane account act_989208510351291, its C360 campaigns: on/off only
      const OTHER = { act_4502494523405059: true, act_989208510351291: 'status' };
      if (j.act && !OTHER[j.act]) { console.error('ads-once: account not allowed', j.act); continue; }
      const cn = j.act ? Object.defineProperty(Object.assign({}, conn, { adAccountId: j.act, scope: require('./ads-scope').forAccount(require('./ads-scope').DEFAULT, j.act) }), 'fx', { value: 0, enumerable: false }) : conn;
      for (const a of j.actions) {
        if (logged(j, a)) continue;
        if (j.act && OTHER[j.act] === 'status' && !a.status) { console.error('ads-once: only on/off on', j.act); continue; }
        const base = { job: j.id, at: new Date().toISOString(), campaignId: a.campaignId, campaignName: a.name, why: a.why };
        if (a.status) {
          const r = await ads.act(cn, { action: 'status', id: a.campaignId, status: a.status });
          if (r.error) { failed.push(short(a.name) + ': ' + r.error); console.error('ads-once:', a.campaignId, r.error); continue; }
          await AC.switched(a.campaignId, a.status).catch(() => {});
          doc.log.push(Object.assign(base, { status: a.status }));
          out.push(a.campaignId);
        } else {
          const b = await ads.budgetOf(cn, a.campaignId);
          if (b.error) { failed.push(short(a.name) + ': ' + b.error); console.error('ads-once:', a.campaignId, b.error); continue; }
          const to = Math.max(10, Math.min(150, a.daily || Math.round(b.daily * a.factor)));
          if (same(b.daily, to)) { doc.log.push(Object.assign(base, { budgetId: b.id, from: b.daily, to, unchanged: true })); await save(); continue; }
          const r = await ads.act(cn, { action: 'budget', id: b.id, daily: to });
          if (r.error) { failed.push(short(a.name) + ': ' + r.error); console.error('ads-once:', a.campaignId, r.error); continue; }
          doc.log.push(Object.assign(base, { budgetId: b.id, from: b.daily, to }));
          out.push(a.campaignId);
        }
        await save();
      }
      if (!failed.length) {
        doc.done[j.id] = new Date().toISOString();
        await save();
        // one word when the whole list is done: what changed (a job that found everything already in place says nothing)
        const did = doc.log.filter((e) => e.job === j.id && !e.unchanged);
        if (did.length) await tell({ tone: 'good', tag: 'once-done-' + j.id, title: 'FĂCUT ✅ - ' + (j.why || 'ce ați cerut'),
          text: did.map((e) => short(e.campaignName) + ': ' + (e.status ? (e.status === 'ACTIVE' ? 'pornită' : 'oprită') : e.to + ' lei/zi')).join(' · ') });
      } else if (expired(j)) {
        doc.done[j.id] = new Date().toISOString();
        doc.log.push({ job: j.id, at: new Date().toISOString(), expired: true, why: failed.join(' · ') });
        await save();
        await tell({ tone: 'bad', tag: 'once-expired-' + j.id, title: 'NEFĂCUT ⚠️ - ' + (j.why || 'ce ați cerut'), text: 'Meta a refuzat 3 zile la rând, renunț: ' + failed.join(' · ') });
      } else {
        problems.push(...failed);
        await tell({ tone: 'bad', tag: 'once-fail-' + j.id, title: 'NU ÎNCĂ ⚠️ - ' + (j.why || 'ce ați cerut'), text: 'Meta a refuzat, mai încerc din oră în oră: ' + failed.join(' · ') });
      }
    }
    // lookalikes of a custom audience of ours (23.11, George: „la toate”): one per ratio, in one country, made once (an
    // audience of the same name already in the account is taken); the campaigns that use them pick the smallest ratio
    // with enough reach, or go without (never held for it)
    for (const j of todo.filter((x) => x.lookalike)) {
      const L = j.lookalike;
      doc.lal = doc.lal || {};
      const st = doc.lal[j.id] = doc.lal[j.id] || { ids: {} };
      const have = await ads.audienceList(conn);
      let failed = have.error ? 'publicurile: ' + have.error : '';
      for (const p of failed ? [] : L.ratios) {
        if (st.ids[p]) continue;
        const name = L.name.replace('{p}', p);
        const ex = (have.audiences || []).find((a) => a.name === name);
        if (ex) { st.ids[p] = ex.id; await save(); continue; }
        const r = await ads.lookalikeCreate(conn, { origin: L.origin, ratio: p / 100, country: L.country, name });
        if (r.error) { failed = p + '%: ' + r.error; break; }
        st.ids[p] = r.id; st.madeAt = st.madeAt || new Date().toISOString();
        doc.log.push({ job: j.id, at: new Date().toISOString(), audienceId: r.id, why: 'public asemănător ' + name });
        await save();
      }
      st.tries = (st.tries || 0) + (failed ? 1 : 0);
      if (!failed || expired(j) || st.tries >= 3) {
        if (failed) { st.error = failed; doc.log.push({ job: j.id, at: new Date().toISOString(), expired: true, why: failed }); }
        doc.done[j.id] = new Date().toISOString();
        await save();
      } else { st.error = failed; await save(); problems.push(failed); console.error('ads-once lookalike:', failed); }
    }
    // a form's ending changed (23.11): the form copied with the new ending, registered like the old one (its leads come in
    // the same way), the offer's form for that city moved to it, then the ad switched to it (same texts and picture)
    for (const j of todo.filter((x) => x.formSite)) {
      const f = j.formSite;
      doc.forms = doc.forms || {};
      const st = doc.forms[j.id] = doc.forms[j.id] || {};
      const store = { readJSON, writeJSON };
      const fail = async (why) => {
        st.error = why; st.tries = (st.tries || 0) + 1; await save();
        console.error('ads-once form:', j.id, why);
        if (expired(j) || st.tries >= 6) {
          doc.done[j.id] = new Date().toISOString(); doc.log.push({ job: j.id, at: new Date().toISOString(), expired: true, why }); await save();
          await tell({ tone: 'bad', tag: 'once-expired-' + j.id, title: 'NEFĂCUT ⚠️ - ' + j.why, text: why });
        } else { problems.push(why); await tell({ tone: 'bad', tag: 'once-fail-' + j.id, title: 'NU ÎNCĂ ⚠️ - ' + j.why, text: 'Mai încerc din oră în oră: ' + why }); }
      };
      if (!st.newId) {
        const reg = ((await readJSON('data/fb-forms.json', {})).forms || {})[f.formId] || {};
        if (reg.replacedBy && reg.replacedBy !== f.formId) st.newId = reg.replacedBy; // made on a run cut short
        else {
          const FCp = require('./fb-form-copy');
          const more = { questions: f.questions, location: f.location }; // the card form (23.11): its own questions and city
          let r = await FCp.copyOne(store, f.formId, null, Object.assign({ name: f.name, page: f.page }, more));
          // a button Meta doesn't take with the emoji: the same words without it
          if (r.error && !/are deja copie/.test(r.error)) r = await FCp.copyOne(store, f.formId, null, Object.assign({ name: f.name, page: Object.assign({}, f.page, { button_text: String(f.page.button_text).replace(/[^\p{L}\p{N} .,!?]/gu, '').trim() }) }, more));
          if (r.error) { await fail('formularul: ' + r.error); continue; }
          st.newId = r.id; st.button = r.button;
        }
        st.madeAt = new Date().toISOString();
        await save();
        doc.log.push({ job: j.id, at: new Date().toISOString(), formId: f.formId, newFormId: st.newId, why: 'formularul copiat, finalul pe site' });
        await save();
      }
      if (!st.offers) {
        // the offer's form for this city (the publish window offers it; the leads keep the procedure by the form's own offerId)
        const offers = await readJSON('data/offers.json', null);
        const moved = [];
        if (Array.isArray(offers)) offers.forEach((o) => Object.keys((o && o.forms) || {}).forEach((c) => { if (String(o.forms[c]) === f.formId) { o.forms[c] = st.newId; moved.push(o.id + '/' + c); } }));
        if (moved.length) await writeJSON('data/offers.json', offers);
        const lf = await readJSON('data/leadfilter.json', null);
        if (lf && lf.forms) {
          let ch = false;
          Object.keys(lf.forms).forEach((c) => Object.keys(lf.forms[c] || {}).forEach((k) => { if (String(lf.forms[c][k]) === f.formId) { lf.forms[c][k] = st.newId; moved.push('leadfilter/' + c + '/' + k); ch = true; } }));
          if (ch) await writeJSON('data/leadfilter.json', lf);
        }
        st.offers = moved.length ? moved : ['-'];
        await save();
      }
      if (f.adId && !st.adDone) {
        const AE = require('./ads-edit');
        const cr = await AE.creativeOf(conn, f.adId);
        if (cr.error) { await fail('reclama: ' + cr.error); continue; }
        const p = AE.partsOf({ object_story_spec: cr.spec || {}, asset_feed_spec: cr.feed || null });
        if (p.formId !== st.newId) {
          if ((st.edits || 0) >= 2) { await fail('reclama nu a trecut pe formularul nou (' + p.formId + ')'); continue; }
          const fd = cr.feed || null;
          const list = (k) => (fd && Array.isArray(fd[k]) ? fd[k].map((x) => x.text).filter(Boolean) : null);
          st.edits = (st.edits || 0) + 1; await save();
          const r = await AE.editAd(conn, { adId: f.adId, texts: list('bodies') || p.texts, headlines: list('titles') || p.headlines, descriptions: list('descriptions') || p.descriptions, cta: p.cta, formId: st.newId });
          if (r.error) { await fail('reclama: ' + r.error); continue; }
          st.creativeId = r.creativeId;
          const back = await AE.creativeOf(conn, f.adId);
          const p2 = back.error ? {} : AE.partsOf({ object_story_spec: back.spec || {}, asset_feed_spec: back.feed || null });
          if (p2.formId !== st.newId) { await fail('reclama arată încă formularul ' + (p2.formId || '?')); continue; }
        }
        st.adDone = new Date().toISOString();
        doc.log.push({ job: j.id, at: new Date().toISOString(), adId: f.adId, campaignName: f.campaign, formId: st.newId, why: 'reclama trimite în formularul nou' });
        await save();
        out.push(f.adId);
      }
      // every ad of ours (C360 …, running or paused) still sending into one of these forms moves to the new one too; a
      // running ad Meta refuses holds the job (tried again next hour), a paused one is only written down
      if (Array.isArray(f.moveFrom) && f.moveFrom.length && !st.movedAll) {
        const AE = require('./ads-edit');
        const list = await ads.adForms(conn);
        if (list.error) { await fail('reclamele: ' + list.error); continue; }
        st.moved = st.moved || {};
        let hold = '';
        for (const a of (list.rows || []).filter((x) => f.moveFrom.includes(x.formId))) {
          if (st.moved[a.adId] && st.moved[a.adId].ok) continue;
          const info = await ads.call('GET', '/' + a.adId, conn.userToken, { fields: 'campaign{name}' });
          const cname = (info.ok && info.j.campaign && info.j.campaign.name) || '';
          if (!cname || !ads.ours(conn, cname)) continue;
          const tries = (st.moved[a.adId] && st.moved[a.adId].tries) || 0;
          if (tries >= 2) { if (a.status === 'ACTIVE') hold = hold || short(cname) + ': nu a trecut pe formularul nou'; continue; }
          const cr = await AE.creativeOf(conn, a.adId);
          if (cr.error) { st.moved[a.adId] = { tries: tries + 1, error: cr.error, campaign: cname }; await save(); if (a.status === 'ACTIVE') hold = hold || short(cname) + ': ' + cr.error; continue; }
          const p = AE.partsOf({ object_story_spec: cr.spec || {}, asset_feed_spec: cr.feed || null });
          const fd = cr.feed || null;
          const words = (k) => (fd && Array.isArray(fd[k]) ? fd[k].map((x) => x.text).filter(Boolean) : null);
          st.moved[a.adId] = { tries: tries + 1, campaign: cname, from: a.formId }; await save();
          const r = await AE.editAd(conn, { adId: a.adId, texts: words('bodies') || p.texts, headlines: words('titles') || p.headlines, descriptions: words('descriptions') || p.descriptions, cta: p.cta, formId: st.newId });
          if (r.error) { st.moved[a.adId].error = r.error; await save(); if (a.status === 'ACTIVE') hold = hold || short(cname) + ': ' + r.error; continue; }
          const back = await AE.creativeOf(conn, a.adId);
          const p2 = back.error ? {} : AE.partsOf({ object_story_spec: back.spec || {}, asset_feed_spec: back.feed || null });
          st.moved[a.adId] = Object.assign(st.moved[a.adId], { ok: p2.formId === st.newId, creativeId: r.creativeId, status: a.status });
          doc.log.push({ job: j.id, at: new Date().toISOString(), adId: a.adId, campaignName: cname, formId: st.newId, from: a.formId, why: 'reclama trimite în formularul nou' });
          await save();
          out.push(a.adId);
          if (!st.moved[a.adId].ok && a.status === 'ACTIVE') hold = hold || short(cname) + ': arată încă formularul vechi';
        }
        if (hold) { await fail(hold); continue; }
        st.movedAll = new Date().toISOString();
        await save();
      }
      // a copy made before this one (with an ending that changed since): archived on the Page once no ad of the account
      // sends into it, and in the portal it points to the new one
      if (f.archive && !st.archived) {
        const list = await ads.adForms(conn);
        if (!list.error && !(list.rows || []).some((x) => x.formId === f.archive)) {
          const r = await require('./fb-form-copy').archive({ readJSON, writeJSON }, f.archive);
          if (!r.error) {
            const d2 = await readJSON('data/fb-forms.json', {});
            const old = (d2.forms || {})[f.archive] || {};
            if (old.copyOf && d2.forms[old.copyOf]) { d2.forms[old.copyOf].replacedBy = st.newId; await writeJSON('data/fb-forms.json', d2); }
            st.archived = new Date().toISOString(); await save();
          } else st.archiveError = r.error;
        } else st.archiveError = list.error || 'o reclamă încă trimite în el';
        await save();
      }
      doc.done[j.id] = new Date().toISOString();
      delete st.error;
      await save();
      await tell({ tone: 'good', tag: 'once-done-' + j.id, title: 'FĂCUT ✅ - ' + j.why, text: f.name + ' (' + st.newId + ')' + (f.adId ? ' · reclama ' + short(f.campaign) + ' trimite acum în el' : '') + (st.moved ? ' · reclame mutate: ' + Object.values(st.moved).filter((x) => x.ok).length : '') });
    }
    // ads of ours to a page of the site (23.11): the pictures from the repository, each ad made by publish() (the first one
    // makes the campaign and its ad set, the next ones join that ad set); every id written down the moment Meta gives it,
    // so a run cut short never makes a second campaign; a refusal is told once a day and tried again next hour
    for (const j of todo.filter((x) => x.site)) {
      doc.site = doc.site || {};
      const st = doc.site[j.id] = doc.site[j.id] || {};
      // the pixel shared with the connected ad account first (once: a refusal ends the job with Meta's words)
      if (j.site.sharePixel && !st.pixel) {
        const px = await sharePixel(conn, j.site.pixelId, j.site.sharePixel);
        st.pixelAnswer = px; await save();
        if (!px.ok) {
          doc.done[j.id] = new Date().toISOString();
          doc.log.push({ job: j.id, at: new Date().toISOString(), expired: true, why: 'pixelul: ' + px.error });
          await save();
          await tell({ tone: 'bad', tag: 'once-expired-' + j.id, title: 'NEFĂCUT ⚠️ - ' + j.why, text: 'Meta n-a partajat pixelul: ' + px.error });
          continue;
        }
        st.pixel = new Date().toISOString(); await save();
      }
      const d = await ads.loadDefaults(readJSON);
      let failed = '', waiting = false;
      for (const c of j.site.campaigns) {
        if (!ads.ours(conn, c.name)) { failed = c.name + ': numele nu e al nostru în contul conectat'; break; }
        const sc = st[c.name] = st[c.name] || { ads: {} };
        // a lead-form campaign (c.formJob): the form a formSite job above made, once it's there; else a page of the site
        const formId = c.formId || (c.formJob ? ((doc.forms || {})[c.formJob] || {}).newId || '' : '');
        if (c.formJob && !formId) { failed = c.name + ': formularul nu e gata încă'; break; }
        // c.path: another page of the site (the card's own page, 23.11), else the home page
        const link = formId ? '' : 'https://www.centrul360.com/' + (c.path || '') + '?utm_source=facebook&utm_medium=paid&utm_campaign=' + c.utm;
        // the audience of a running campaign (c.like), exactly (women only), for the new ad set; with the smallest lookalike
        // of c.lal whose reach Meta estimates at c.minReach at least, else without one (written down why)
        if (c.like && !sc.adsetId && !sc.targeting) {
          const w = await ads.targetingOf(conn, c.like);
          if (w.error) { failed = c.name + ': publicul: ' + w.error; break; }
          const t = w.targeting;
          t.genders = [2];
          if (!t.targeting_automation) t.targeting_automation = { advantage_audience: 0 };
          const min = c.minReach || 10000;
          const lal = c.lal ? (((doc.lal || {})[c.lal] || {}).ids || {}) : {};
          const base = await ads.reachEstimate(conn, t);
          sc.reach = { base: base.error ? { error: base.error } : base };
          let pick = '';
          for (const p of Object.keys(lal).map(Number).sort((a, b) => a - b)) {
            const e = await ads.reachEstimate(conn, Object.assign({}, t, { custom_audiences: (t.custom_audiences || []).concat([{ id: lal[p] }]) }));
            sc.reach[p + '%'] = e.error ? { error: e.error } : e;
            if (!e.error && e.ready && (e.lower + e.upper) / 2 >= min) { pick = p; break; }
          }
          if (pick) { t.custom_audiences = (t.custom_audiences || []).concat([{ id: lal[pick] }]); sc.lal = pick + '% (' + lal[pick] + ')'; }
          else sc.lal = !c.lal ? 'fără' : Object.keys(lal).length ? 'fără: sub ' + min + ' de persoane cu oricare' : 'fără: publicul asemănător nu e făcut';
          sc.targeting = t;
          doc.log.push({ job: j.id, at: new Date().toISOString(), campaignName: c.name, why: 'publicul copiat din ' + c.like + ', asemănător: ' + sc.lal });
          await save();
        }
        for (const a of c.ads) {
          if (sc.ads[a.name]) continue;
          if (sc.making && Date.now() - Date.parse(sc.making) < 10 * 60e3) { failed = c.name + ': se face deja'; break; }
          // an ad of this name already in the ad set (made by a run cut short before it was written down): taken, not made again
          if (sc.adsetId) {
            const have = await ads.call('GET', '/' + sc.adsetId + '/ads', conn.userToken, { fields: 'id,name', limit: '50' });
            const same = have.ok && (have.j.data || []).find((x) => x.name === a.name);
            if (same) { sc.ads[a.name] = same.id; await save(); continue; }
          }
          // a video (a reel of Conținut, by its public link): into the account once, shared by the job's ads, and Meta's
          // processing waited on; still processing: tried again next hour without a word (it isn't a refusal)
          let media;
          if (a.video) {
            st.videos = st.videos || {};
            const vu = await ads.videoUpload(conn, a.video.url, a.name, st.videos[a.video.url]);
            if (vu.error) { delete st.videos[a.video.url]; await save(); failed = a.name + ': ' + vu.error; break; }
            st.videos[a.video.url] = vu.videoId; await save();
            if (vu.pending) { failed = a.name + ': videoul se procesează încă la Meta'; waiting = true; break; }
            media = { videoId: vu.videoId, thumbUrl: a.video.thumb || '' };
          } else {
            const pic = await sitePicture(a.image);
            if (pic.error) { failed = a.name + ': ' + pic.error; break; }
            media = { base64: pic.base64, name: a.image };
            // its 9:16 for stories and reels, in the same ad (a.story, 25.11)
            if (a.story) { const p2 = await sitePicture(a.story); if (p2.error) { failed = a.name + ' (story): ' + p2.error; break; } media.story = p2.base64; }
          }
          // each ad its own utm_content (23.11, the card: which ad brought whom), after the campaign's tags
          // an ad to its own page (a.path, 25.11: each zone's product page, the zone and the city chosen), else the campaign's
          const own = a.path && !formId ? 'https://www.centrul360.com/' + a.path + (a.path.includes('?') ? '&' : '?') + 'utm_source=facebook&utm_medium=paid&utm_campaign=' + c.utm : link;
          const adLink = own && a.utmContent ? own + '&utm_content=' + encodeURIComponent(a.utmContent) : own;
          const v = ads.cleanSettings({
            adsetId: sc.adsetId || '', campaignName: c.name, adsetName: c.adsetName || (c.city + ' ' + (c.radiusKm || d.radiusKm) + ' km · ' + (c.everyone ? 'femei și bărbați ' : 'femei ') + j.site.ages.join('-')), adName: a.name,
            city: c.city, radiusKm: c.radiusKm || d.radiusKm, women: !c.everyone, ageMin: j.site.ages[0], ageMax: j.site.ages[1], placements: d.placements, budget: c.budget,
            link: adLink, formId, goal: formId ? '' : (j.site.goal || 'purchase'), pixelId: j.site.pixelId, urlTags: j.site.urlTags || '', primaryText: a.text, headline: a.headlines[0], headline2: a.headlines[1], headline3: a.headlines[2],
            description: a.description, cta: a.cta || j.site.cta, startNow: true, endTime: j.site.endTime || '',
          });
          if (v.error) { failed = a.name + ': ' + v.error; break; }
          if (sc.targeting && !sc.adsetId) v.s.rawTargeting = sc.targeting;
          sc.making = new Date().toISOString(); await save();
          const r = await ads.publish(conn, media, v.s);
          delete sc.making;
          if (r.error) { sc.error = r.error; await save(); failed = a.name + ': ' + r.error; break; }
          if (r.campaignId) sc.campaignId = r.campaignId;
          sc.adsetId = r.adsetId;
          sc.ads[a.name] = r.adId;
          if (r.warning) sc.warning = (sc.warning ? sc.warning + ' · ' : '') + r.warning;
          delete sc.error;
          doc.log.push({ job: j.id, at: new Date().toISOString(), campaignId: sc.campaignId, campaignName: c.name, adId: r.adId, why: 'reclama ' + a.name + ' publicată' + (r.texts ? ' (' + r.texts + ' texte)' : '') });
          await save();
          out.push(r.adId);
        }
        if (failed) break;
      }
      // the campaigns these replace go off, once every new ad is made
      if (!failed && Array.isArray(j.site.pauseAfter)) {
        st.paused = st.paused || {};
        for (const p of j.site.pauseAfter) {
          if (st.paused[p.campaignId]) continue;
          const r = await ads.act(conn, { action: 'status', id: p.campaignId, status: 'PAUSED' });
          if (r.error) { failed = p.name + ': ' + r.error; break; }
          await AC.switched(p.campaignId, 'PAUSED').catch(() => {});
          st.paused[p.campaignId] = new Date().toISOString();
          doc.log.push({ job: j.id, at: new Date().toISOString(), campaignId: p.campaignId, campaignName: p.name, status: 'PAUSED', why: p.why || 'înlocuită de campania refăcută cu pixelul' });
          await save();
        }
      }
      if (!failed) {
        doc.done[j.id] = new Date().toISOString();
        await save();
        await tell({ tone: 'good', tag: 'once-done-' + j.id, title: 'FĂCUT ✅ - ' + j.why, text: j.site.campaigns.map((c) => c.name + ': ' + Object.keys((st[c.name] || {}).ads || {}).length + ' reclame').join(' · ') });
      } else if (expired(j)) {
        doc.done[j.id] = new Date().toISOString();
        doc.log.push({ job: j.id, at: new Date().toISOString(), expired: true, why: failed });
        await save();
        await tell({ tone: 'bad', tag: 'once-expired-' + j.id, title: 'NEFĂCUT ⚠️ - ' + j.why, text: failed });
      } else {
        problems.push(failed);
        if (waiting) continue;
        await tell({ tone: 'bad', tag: 'once-fail-' + j.id, title: 'NU ÎNCĂ ⚠️ - ' + j.why, text: 'Meta a refuzat, mai încerc din oră în oră: ' + failed });
      }
    }
    // a B2B sale (24.11, ELYSION): its own form on the Page (registered as kind 'b2b'), then the campaign; every id written
    // down the moment Meta gives it, so a run cut short never makes a second form or campaign
    for (const j of todo.filter((x) => x.b2b)) {
      const B = j.b2b, c = B.campaign;
      doc.b2b = doc.b2b || {};
      const st = doc.b2b[j.id] = doc.b2b[j.id] || {};
      const store = { readJSON, writeJSON };
      const fail = async (why) => {
        st.error = why; st.tries = (st.tries || 0) + 1; await save();
        console.error('ads-once b2b:', j.id, why);
        if (expired(j) || st.tries >= 6) {
          doc.done[j.id] = new Date().toISOString(); doc.log.push({ job: j.id, at: new Date().toISOString(), expired: true, why }); await save();
          await tell({ tone: 'bad', tag: 'once-expired-' + j.id, title: 'NEFĂCUT ⚠️ - ' + j.why, text: why });
        } else { problems.push(why); await tell({ tone: 'bad', tag: 'once-fail-' + j.id, title: 'NU ÎNCĂ ⚠️ - ' + j.why, text: 'Mai încerc: ' + why }); }
      };
      if (!ads.ours(conn, c.name)) { await fail(c.name + ': numele nu e al nostru în contul conectat'); continue; }
      if (st.making && Date.now() - Date.parse(st.making) < 3 * 60e3) { problems.push(j.id + ': se face deja'); continue; }
      // 1. the form: one of the same name already on the Page (a run cut short) is taken, else it is made
      if (!st.formId) {
        const have = await ads.call('GET', '/' + conn.pageId + '/leadgen_forms', conn.pageAccessToken, { fields: 'id,name,status', limit: '200' });
        const same = have.ok ? (have.j.data || []).find((x) => x.name === B.form.name && x.status !== 'ARCHIVED') : null;
        if (same) st.formId = String(same.id);
        else {
          const tries = [];
          let r = null;
          for (const v of [0, 1, 2]) {
            r = await require('./fb-form-create').postForm(store, b2bFormParams(B.form, v));
            if (r.id) { st.formVariant = v; break; }
            tries.push(r.error);
            if (/pages_manage_ads|nu e conectat/.test(r.error || '')) break; // a permission: another shape won't help
          }
          if (!r || !r.id) { await fail('formularul: ' + tries.join(' | ')); continue; }
          st.formId = r.id;
        }
        st.formAt = new Date().toISOString(); await save();
        doc.log.push({ job: j.id, at: new Date().toISOString(), formId: st.formId, why: 'formularul ' + B.form.name + (same ? ' (găsit pe Pagină)' : ' făcut') });
        await save();
      }
      // 2. registered: its leads come in as the sale's, no offer, no welcome (api/_lib/fb-leads.js kind 'b2b')
      if (!st.registered) {
        const now = new Date().toISOString();
        const [fd, poll] = await Promise.all([readJSON('data/fb-forms.json', {}), readJSON('data/fb-poll.json', {})]);
        fd.forms = fd.forms || {};
        fd.forms[st.formId] = Object.assign({ leads: 0, createdHere: now }, fd.forms[st.formId], { name: B.form.name, kind: 'b2b', interest: B.interest, offerId: '', location: '',
          questions: B.form.questions.map((q) => ({ key: q.key || q.type.toLowerCase(), label: q.label || '', type: q.type, options: q.options || [] })) });
        poll.forms = [{ id: st.formId, name: B.form.name, status: 'ACTIVE', count: 0, created: now, lastAt: 0 }].concat((poll.forms || []).filter((x) => x.id !== st.formId));
        await Promise.all([writeJSON('data/fb-forms.json', fd), writeJSON('data/fb-poll.json', poll)]);
        st.registered = now; await save();
      }
      // 3. the audience hint's ids (once)
      if (!st.hints) {
        st.hints = await b2bHints(conn, c.interests || [], c.behaviors || []);
        await save();
      }
      // 4. the campaign, its ad set and its ad, one step at a time, each id written down the moment Meta gives it (a run the
      // clock cuts short goes on from there next time; 24.11 the first run stopped after the ad set): all made paused, the
      // ad set and the campaign switched on only once the ad exists. One of this name already in the account (made by a
      // run cut short before its id was written down) is taken, never a second one
      if (!st.started) {
        const tok = conn.userToken, act = conn.adAccountId;
        const words = (r) => { const e = (r.j && r.j.error) || {}; return [e.error_user_title, e.error_user_msg || e.message].filter(Boolean).join(': ') || 'Meta n-a răspuns'; };
        st.making = new Date().toISOString(); await save();
        if (!st.campaignId) {
          const ex = await ads.call('GET', '/' + act + '/campaigns', tok, { fields: 'id,name,effective_status', limit: '500', effective_status: JSON.stringify(ads.LIVE) });
          if (!ex.ok) { delete st.making; await fail('campaniile: ' + words(ex)); continue; }
          const twin = (ex.j.data || []).find((x) => x.name === c.name);
          if (twin) st.campaignId = String(twin.id);
          else {
            const r = await ads.call('POST', '/' + act + '/campaigns', tok, { name: c.name, objective: 'OUTCOME_LEADS', status: 'PAUSED', special_ad_categories: [], buying_type: 'AUCTION', is_adset_budget_sharing_enabled: false });
            if (!r.ok || !r.j.id) { delete st.making; await fail('campania: ' + words(r)); continue; }
            st.campaignId = String(r.j.id);
          }
          await save();
          doc.log.push({ job: j.id, at: new Date().toISOString(), campaignId: st.campaignId, campaignName: c.name, why: twin ? 'campania găsită în cont (oprită)' : 'campania făcută (oprită)' });
          await save();
        }
        if (!st.adsetId) {
          const have = await ads.call('GET', '/' + st.campaignId + '/adsets', tok, { fields: 'id,name,targeting', limit: '25' });
          const same = have.ok ? (have.j.data || []).find((x) => x.name === c.adsetName) : null;
          if (same) { st.adsetId = String(same.id); st.targeting = same.targeting; }
          else {
            const acc = await ads.call('GET', '/' + act, tok, { fields: 'default_dsa_beneficiary,default_dsa_payor' });
            const who = conn.pageName || 'Centrul360';
            const dsa = { dsa_beneficiary: (acc.ok && acc.j.default_dsa_beneficiary) || who, dsa_payor: (acc.ok && acc.j.default_dsa_payor) || who };
            const tries = [];
            for (const tv of [0, 1, 2, 3]) {
              const t = b2bTargeting(c, st.hints, tv);
              const r = await ads.call('POST', '/' + act + '/adsets', tok, Object.assign({ name: c.adsetName, campaign_id: st.campaignId, daily_budget: ads.cents(conn, c.budget), billing_event: 'IMPRESSIONS',
                bid_strategy: 'LOWEST_COST_WITHOUT_CAP', targeting: t, status: 'PAUSED', optimization_goal: 'LEAD_GENERATION', destination_type: 'ON_AD', promoted_object: { page_id: conn.pageId } }, dsa));
              if (r.ok && r.j.id) { st.adsetId = String(r.j.id); st.targetingVariant = tv; st.targeting = t; break; }
              tries.push('v' + tv + ': ' + words(r));
            }
            st.attempts = tries;
            if (!st.adsetId) { delete st.making; await fail('setul de reclame: ' + tries.join(' | ')); continue; }
          }
          await save();
        }
        if (!st.adId) {
          const have = await ads.call('GET', '/' + st.adsetId + '/ads', tok, { fields: 'id,name', limit: '25' });
          const same = have.ok ? (have.j.data || []).find((x) => x.name === c.adName) : null;
          if (same) st.adId = String(same.id);
          else {
            if (!st.creativeId) {
              if (!st.hash) {
                const pic = await sitePicture(c.image);
                if (pic.error) { delete st.making; await fail('poza: ' + pic.error); continue; }
                const img = await ads.call('POST', '/' + act + '/adimages', tok, { bytes: pic.base64, name: c.image });
                const imgs = (img.ok && img.j.images) || {};
                st.hash = (imgs[Object.keys(imgs)[0]] || {}).hash || '';
                if (!st.hash) { delete st.making; await fail('poza: ' + words(img)); continue; }
                await save();
              }
              const spec = { page_id: conn.pageId, link_data: { image_hash: st.hash, link: 'https://fb.me/', message: c.text, name: c.headlines[0], description: c.description,
                call_to_action: { type: c.cta, value: { lead_gen_form_id: st.formId } } } };
              const ig = await ads.call('GET', '/' + conn.pageId, conn.pageAccessToken, { fields: 'instagram_business_account' });
              if (ig.ok && ig.j.instagram_business_account) spec.instagram_user_id = ig.j.instagram_business_account.id;
              // the 3 titles, Meta shows each person the one that works (asset_feed_spec, as ads.publish does)
              const feed = { bodies: [{ text: c.text }], titles: c.headlines.map((text) => ({ text })), descriptions: [{ text: c.description }], optimization_type: 'DEGREES_OF_FREEDOM' };
              let r = await ads.call('POST', '/' + act + '/adcreatives', tok, { name: c.adName, object_story_spec: spec, asset_feed_spec: feed });
              st.titles = 3;
              if (!r.ok || !r.j.id) {
                st.feedRefused = words(r);
                r = await ads.call('POST', '/' + act + '/adcreatives', tok, { name: c.adName, object_story_spec: spec });
                st.titles = 1;
              }
              if (!r.ok || !r.j.id) { delete st.making; await fail('reclama (textele și poza): ' + words(r)); continue; }
              st.creativeId = String(r.j.id); await save();
            }
            const r = await ads.call('POST', '/' + act + '/ads', tok, { name: c.adName, adset_id: st.adsetId, creative: { creative_id: st.creativeId }, status: 'ACTIVE' });
            if (!r.ok || !r.j.id) { delete st.making; await fail('reclama: ' + words(r)); continue; }
            st.adId = String(r.j.id);
          }
          await save();
          doc.log.push({ job: j.id, at: new Date().toISOString(), campaignId: st.campaignId, campaignName: c.name, adId: st.adId, why: 'reclama făcută (' + (st.titles || '?') + ' titluri)' });
          await save();
        }
        // the ad is there: the ad set on, then the campaign
        for (const id of [st.adsetId, st.campaignId]) {
          const r = await ads.call('POST', '/' + id, tok, { status: 'ACTIVE' });
          if (!r.ok) { st.startError = words(r); break; }
        }
        delete st.making;
        if (st.startError) { const why = 'pornirea: ' + st.startError; delete st.startError; await fail(why); continue; }
        st.started = new Date().toISOString();
        delete st.error;
        doc.log.push({ job: j.id, at: new Date().toISOString(), campaignId: st.campaignId, campaignName: c.name, status: 'ACTIVE', why: 'campania pornită (' + c.budget + ' lei/zi)' });
        await save();
        await AC.switched(st.campaignId, 'ACTIVE').catch(() => {});
        out.push(st.adId);
      }
      doc.done[j.id] = new Date().toISOString();
      await save();
      await tell({ tone: 'good', tag: 'once-done-' + j.id, title: 'FĂCUT ✅ - ' + j.why, text: c.name + ' · formularul ' + B.form.name + (st.warning ? ' · ' + st.warning : '') });
    }
    // interests taken out of one ad set of ours (its targeting read from Meta, only those ids removed, written back)
    for (const j of todo.filter((x) => x.dropInterests)) {
      const D = j.dropInterests;
      const r = await ads.call('GET', '/' + D.adsetId, conn.userToken, { fields: 'account_id,targeting,campaign{name}' });
      const name = r.ok && r.j.campaign ? r.j.campaign.name : '';
      if (!r.ok || 'act_' + r.j.account_id !== conn.adAccountId || name !== D.campaignName || !ads.ours(conn, name)) { problems.push(j.id + ': setul nu e al nostru sau Meta n-a răspuns'); if (expired(j)) { doc.done[j.id] = new Date().toISOString(); await save(); } continue; }
      const t = r.j.targeting || {};
      let removed = 0;
      (t.flexible_spec || []).forEach((sp) => { if (Array.isArray(sp.interests)) { const n = sp.interests.length; sp.interests = sp.interests.filter((x) => !D.ids.includes(String(x.id))); removed += n - sp.interests.length; if (!sp.interests.length) delete sp.interests; } });
      if (t.flexible_spec) t.flexible_spec = t.flexible_spec.filter((sp) => Object.keys(sp).length);
      if (t.flexible_spec && !t.flexible_spec.length) delete t.flexible_spec;
      if (removed) {
        const w = await ads.call('POST', '/' + D.adsetId, conn.userToken, { targeting: t });
        if (!w.ok) { const why = ((w.j.error || {}).error_user_msg || (w.j.error || {}).message || 'Meta n-a răspuns'); problems.push(j.id + ': ' + why); console.error('ads-once drop:', why); if (expired(j)) { doc.done[j.id] = new Date().toISOString(); await save(); } continue; }
      }
      doc.done[j.id] = new Date().toISOString();
      doc.log.push({ job: j.id, at: new Date().toISOString(), adsetId: D.adsetId, campaignName: D.campaignName, removed, why: j.why });
      await save();
      if (removed) out.push(D.adsetId);
    }
    // the template every new form starts from (Formulare → Setări formulare)
    for (const j of todo.filter((x) => x.template)) {
      const T = require('./fb-form-template');
      await T.getTemplate({ readJSON, writeJSON }); // kept once, so the save starts from what runs
      const r = await T.saveTemplate({ readJSON, writeJSON }, j.template);
      if (r.error) { problems.push(r.error); console.error('ads-once template:', r.error); if (expired(j)) { doc.done[j.id] = new Date().toISOString(); await save(); } continue; }
      doc.done[j.id] = new Date().toISOString();
      doc.log.push({ job: j.id, at: new Date().toISOString(), template: { cta: r.template.cta, ending: r.template.ending }, why: j.why });
      await save();
    }
    // a rule over the campaigns that spent this week (the running ones and those paused a moment ago): its budget times a
    // factor, up to a cap
    const rules = todo.filter((x) => !x.actions && !x.formSite && !x.template && !x.site && !x.lookalike && !x.b2b && !x.dropInterests);
    if (rules.length) {
      const days = await ads.campaignDays(conn, { since: day(Date.now() - 6 * 864e5), until: day(Date.now()) });
      if (days.error) return { changed: out.length, error: days.error };
      const camps = new Map();
      days.rows.forEach((d) => { if (d.spend > 0) camps.set(d.campaignId, d.campaignName); });
      for (const j of rules) {
        const did = new Set(doc.log.filter((e) => e.job === j.id).map((e) => e.campaignId));
        let failed = 0;
        for (const [id, name] of camps) {
          if (did.has(id) || !j.city.test(name) || !j.match.test(name)) continue;
          const b = await ads.budgetOf(conn, id);
          if (b.error || !(b.daily > 0) || b.daily >= j.cap) continue;
          const to = Math.min(j.cap, Math.round(b.daily * j.factor));
          if (to <= b.daily) continue;
          const r = await ads.act(conn, { action: 'budget', id: b.id, daily: to });
          if (r.error) { failed++; console.error('ads-once:', id, r.error); continue; }
          doc.log.push({ job: j.id, at: new Date().toISOString(), campaignId: id, campaignName: name, budgetId: b.id, from: b.daily, to, why: j.why });
          await save();
          out.push(name + ' ' + b.daily + ' → ' + to);
          await tell({ tone: 'good', tag: 'once-' + j.id + '-' + id, title: 'BUGET MĂRIT 📈 - ' + String(name).slice(0, 50), text: b.daily + ' → ' + to + ' lei/zi. ' + j.why + '.' });
        }
        if (!failed || expired(j)) { doc.done[j.id] = new Date().toISOString(); await save(); } // a refused one is tried again on the next tick
      }
    }
    return { changed: out.length, failed: problems.length || undefined };
  } finally {
    doc.running = null;
    await save().catch((e) => console.error('ads-once save:', e.message));
    if (out.length) await AC.clear().catch(() => {});
  }
}

module.exports = { run, JOBS, siteSummary };
