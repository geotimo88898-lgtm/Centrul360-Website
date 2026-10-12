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

// Commission on an upsell: 60% of the upsell value covers the average costs of the procedure;
// whoever made the upsell earns 10% of what is left (the profit). 3.000 lei upsell → 1.200 lei
// profit → 120 lei commission (4% of the upsell). Paid once the owner approves it (Aprobări).
const UPSELL_RATE = 10;   // % of the profit
const COST_SHARE = 60;    // % of the upsell that goes on costs
const commissionOf = (upsell) => Math.round((Number(upsell) || 0) * (100 - COST_SHARE) / 100 * UPSELL_RATE) / 100;
const profitOf = (upsell) => Math.round((Number(upsell) || 0) * (100 - COST_SHARE)) / 100;

module.exports = { CATEGORIES, LEGACY, normalizeCategories, categoriesOf, UPSELL_RATE, COST_SHARE, commissionOf, profitOf };
