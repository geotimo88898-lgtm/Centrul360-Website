// Treatment categories, the clinic works with three: laser hair removal, face and body.
// An appointment or a payment can have several (a client may do laser AND a facial).
// Older rows used finer categories (hifu, liposonix, …); they map onto the three here, so old
// data keeps showing and counting correctly without a migration.

const CATEGORIES = ['epilare-laser', 'faciale', 'corporale'];

const LEGACY = {
  hifu: 'faciale', microneedling: 'faciale', 'tratament-facial': 'faciale',
  liposonix: 'corporale', 'ems-tonifiere': 'corporale', radiofrecventa: 'corporale',
  celulita: 'corporale', 'detox-drenaj': 'corporale', retail: 'corporale', altele: 'corporale',
};

// Accepts one key or a list (old or new keys) → clean list of the three, no duplicates.
function normalizeCategories(input) {
  const list = Array.isArray(input) ? input : input ? [input] : [];
  const out = [];
  list.forEach((c) => {
    const k = CATEGORIES.includes(c) ? c : LEGACY[c];
    if (k && !out.includes(k)) out.push(k);
  });
  return out;
}

// Categories of a stored row (new rows carry `categories`, old ones a single `category`).
const categoriesOf = (row) => normalizeCategories((row && row.categories && row.categories.length) ? row.categories : row && row.category);

// Every upsell (paid more than the booked amount) earns the person who did the treatment 10%.
const UPSELL_RATE = 10;

module.exports = { CATEGORIES, LEGACY, normalizeCategories, categoriesOf, UPSELL_RATE };
