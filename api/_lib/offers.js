// Offers — the ONE source of truth for every surface:
//   • public site      (api/offers-public.js → oferte.html / preturi.html)
//   • team portal      (api/portal-offers.js admin CRUD, api/portal-data.js for everyone)
//   • Creative machine (api/offers-feed.js → admin.centrul360.com/creative)
// Stored in data/offers.json. On top of the site fields every offer can carry the marketing
// brief the Creative machine needs (where it's sold, whether it's promoted in ads, the
// mechanism/outcome/objections, and a guarantee — which today exists only for laser hair removal).

const { defaultOffers } = require('./offer-defaults');

const LOCATIONS = ['timisoara', 'arad'];
const SITE_CATEGORIES = ['epilare', 'faciale', 'remodelare'];
const SCHEMA = 3;

// Marketing briefs for the offers that run in ads today (ported 1:1 from the Creative
// machine's old offers.json, which is retired — Creative now reads this feed).
const BRIEFS = {
  'liposonix-2zone': {
    ads: true, locations: ['timisoara', 'arad'], adName: 'LipoSonix · 2 zone la preț de una', mechanic: '1+1: 2 zone tratate la prețul uneia',
    dreamOutcome: 'talie/abdomen/șolduri mai definite, haine care vin mai bine', mechanism: 'ultrasunete focalizate care țintesc grăsimea localizată rezistentă la dietă și sport',
    objections: ['fără operație', 'fără timp de recuperare', 'fără ace/anestezie', 'rezultate din prima ședință'],
    zones: ['abdomen', 'flancuri/talie', 'coapse', 'brațe', 'zona lombară'], notes: 'Cea mai dovedită ofertă — toate creativele câștigătoare de până acum sunt LipoSonix.',
  },
  'facial-restart': {
    ads: true, locations: ['timisoara', 'arad'], adName: 'Tratament facial Restart',
    dreamOutcome: 'ten luminos, hidratat, odihnit; machiajul stă mai bine', mechanism: 'protocol facial de revitalizare: curățare, hidratare, luminozitate, textură',
    objections: ['fără timp de recuperare', 'rezultat vizibil imediat', 'potrivit înainte de un eveniment'],
  },
  'epilare-full-body': {
    ads: true, locations: ['timisoara'], adName: 'Epilare laser · Full Body', includes: 'toate zonele de corp, fără față (axile, inghinal total, brațe total, picioare lung)',
    device: 'Elysion Pro — laser certificat medical', dreamOutcome: 'piele fină permanent, fără ras, fără ceară, fără iritații',
    mechanism: 'laser medical cu diodă care distruge foliculul', objections: ['nedureros', 'certificat medical', 'pentru ea și el'],
    guarantee: 'Garanția banilor înapoi.', notes: 'DOAR Timișoara. Se poate face și pentru bărbați.',
  },
};
// Two active ad offers the site never listed — added once by the schema-3 migration.
const ADDED = [
  {
    id: 'seed-cavitatie-ems', key: 'cavitatie-ems', title: 'Cavitație + EMS', description: 'O ședință de cavitație + o ședință de electrostimulare musculară.\n1× Cavitație\n1× EMS (20.000 de contracții)',
    priceNew: 280, priceOld: 530, category: 'remodelare', featured: false, imageKey: 'concern-tonifiere', active: true, order: 20,
    ads: true, locations: ['timisoara'], adName: 'Cavitație + EMS', mechanic: 'o ședință de cavitație + o ședință de electrostimulare musculară (EMS)',
    dreamOutcome: 'mai puțină grăsime localizată + mușchi tonifiați', mechanism: 'cavitația lucrează pe grăsimea localizată, EMS tonifiază mușchiul',
    objections: ['fără durere', 'fără recuperare', '20.000 de contracții musculare într-o ședință'], notes: 'DOAR Timișoara. EMS NU există la Arad.',
  },
  {
    id: 'seed-cavitatie-1plus1', key: 'cavitatie-1plus1', title: 'Cavitație 1+1', description: '2 ședințe de cavitație la prețul uneia.',
    priceNew: 280, priceOld: 560, category: 'remodelare', featured: false, imageKey: 'concern-grasime', active: true, order: 21,
    ads: true, locations: ['arad'], adName: 'Cavitație 1+1', mechanic: '2 ședințe de cavitație la prețul uneia',
    dreamOutcome: 'mai puțină grăsime localizată, siluetă remodelată', mechanism: 'ultrasunete de joasă frecvență pe grăsimea localizată',
    objections: ['fără durere', 'fără recuperare'], notes: 'DOAR Arad.',
  },
];

const MARKETING_DEFAULTS = { ads: false, locations: ['timisoara', 'arad'], adName: '', mechanic: '', includes: '', device: '', dreamOutcome: '', mechanism: '', objections: [], zones: [], guarantee: '', notes: '' };

// Clinic rule: laser hair removal and EMS exist only in Timișoara. Offers that never had their
// locations set default to that, until the owner picks otherwise in Oferte.
function defaultLocations(o) {
  const t = String((o.title || '') + ' ' + (o.description || '')).toLowerCase();
  if (o.category === 'epilare' || /epilare|laser/.test(t) || /\bems\b|electrostimulare/.test(t)) return ['timisoara'];
  return ['timisoara', 'arad'];
}

function withMarketing(o) {
  const out = Object.assign({}, MARKETING_DEFAULTS, o);
  out.locations = (Array.isArray(o.locations) ? o.locations : []).filter((l) => LOCATIONS.includes(l));
  if (!out.locations.length) out.locations = defaultLocations(o);
  out.objections = Array.isArray(out.objections) ? out.objections : [];
  out.zones = Array.isArray(out.zones) ? out.zones : [];
  return out;
}

// Reads data/offers.json, upgrading older files in place (once) to schema 3.
async function loadOffers(readJSON, writeJSON) {
  const raw = await readJSON('data/offers.json', null);
  let offers = Array.isArray(raw) ? raw : defaultOffers();
  const meta = (await readJSON('data/offers-meta.json', null)) || { schema: 1 };
  if (meta.schema < SCHEMA) {
    offers = offers.map((o) => (BRIEFS[o.key] ? Object.assign({}, o, BRIEFS[o.key]) : o));
    ADDED.forEach((a) => { if (!offers.some((o) => o.key === a.key)) offers.push(a); });
    offers = offers.map(withMarketing);
    if (writeJSON) {
      await writeJSON('data/offers.json', offers);
      await writeJSON('data/offers-meta.json', { schema: SCHEMA, migratedAt: new Date().toISOString() });
    }
  }
  return offers.map(withMarketing);
}

// Cleans the marketing part of an admin edit (site fields are validated by portal-offers.js).
function cleanMarketing(body) {
  const list = (v, n) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((s) => String(s).trim()).filter(Boolean).slice(0, n || 12).map((s) => s.slice(0, 160));
  const str = (v, n) => String(v || '').trim().slice(0, n || 300);
  return {
    ads: !!body.ads,
    locations: list(body.locations, 2).filter((l) => LOCATIONS.includes(l)),
    adName: str(body.adName, 120), mechanic: str(body.mechanic), includes: str(body.includes), device: str(body.device, 160),
    dreamOutcome: str(body.dreamOutcome), mechanism: str(body.mechanism), objections: list(body.objections), zones: list(body.zones),
    guarantee: str(body.guarantee, 160), notes: str(body.notes, 600),
  };
}

const discountOf = (o) => (Number(o.priceOld) > 0 ? Math.round(100 - (Number(o.priceNew) / Number(o.priceOld)) * 100) : 0);

module.exports = { loadOffers, cleanMarketing, withMarketing, discountOf, LOCATIONS, SITE_CATEGORIES };
