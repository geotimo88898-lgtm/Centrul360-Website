// Curated list of existing site images usable as an offer's imageKey (Setări → Oferte).
// No upload feature in this iteration — admin picks from what's already on the site.
// `key` is what's stored on the offer; `path` is the actual file under /brand_asset served
// as-is; `label` is the human-readable option text in the portal's <select>.

const OFFER_IMAGES = [
  { key: 'offer-epilare', path: 'brand_asset/offer-epilare.webp', label: 'Epilare laser — Full Body' },
  { key: 'epilare-legs-black', path: 'brand_asset/epilare-legs-black.webp', label: 'Epilare laser — inghinal + axilă' },
  { key: 'concern-gusa', path: 'brand_asset/concern-gusa.webp', label: 'HIFU + RF Sculpt — gușă (ilustrativ)' },
  { key: 'gusa-ba-premium', path: 'brand_asset/gusa-ba-premium.webp', label: 'HIFU gușă — înainte/după' },
  { key: 'ba-liposonix-premium', path: 'brand_asset/ba-liposonix-premium.webp', label: 'Liposonix abdomen — înainte/după' },
  { key: 'offer-liposonix', path: 'brand_asset/offer-liposonix.webp', label: 'Liposonix (ilustrativ)' },
  { key: 'concern-belly-1', path: 'brand_asset/concern-belly-1.webp', label: 'Abdomen — ilustrativ 1' },
  { key: 'concern-belly-2', path: 'brand_asset/concern-belly-2.webp', label: 'Abdomen — ilustrativ 2 (detox)' },
  { key: 'concern-belly-3', path: 'brand_asset/concern-belly-3.webp', label: 'Abdomen — ilustrativ 3 (program complet)' },
  { key: 'concern-cellulite-1', path: 'brand_asset/concern-cellulite-1.webp', label: 'Celulită — ilustrativ 1' },
  { key: 'concern-cellulite-2', path: 'brand_asset/concern-cellulite-2.webp', label: 'Celulită — ilustrativ 2' },
  { key: 'concern-cellulite-3', path: 'brand_asset/concern-cellulite-3.webp', label: 'Celulită — ilustrativ 3' },
  { key: 'concern-celulita', path: 'brand_asset/concern-celulita.webp', label: 'Celulită — generic' },
  { key: 'concern-detox', path: 'brand_asset/concern-detox.webp', label: 'Detox / drenaj — generic' },
  { key: 'concern-grasime', path: 'brand_asset/concern-grasime.webp', label: 'Grăsime localizată — generic' },
  { key: 'concern-tonifiere', path: 'brand_asset/concern-tonifiere.webp', label: 'Tonifiere musculară — generic' },
  { key: 'restart-ba-premium', path: 'brand_asset/restart-ba-premium.webp', label: 'Tratament facial Restart — înainte/după' },
  { key: 'ba-facial', path: 'brand_asset/ba-facial.webp', label: 'Facial — hidratare, înainte/după' },
  { key: 'offer-facial', path: 'brand_asset/offer-facial.webp', label: 'Tratament facial (ilustrativ)' },
  { key: 'concern-chin-1', path: 'brand_asset/concern-chin-1.webp', label: 'Gușă / bărbie dublă — ilustrativ 1' },
  { key: 'concern-chin-2', path: 'brand_asset/concern-chin-2.webp', label: 'Gușă / bărbie dublă — ilustrativ 2' },
  { key: 'concern-chin-3', path: 'brand_asset/concern-chin-3.webp', label: 'Gușă / bărbie dublă — ilustrativ 3 (program complet)' },
  { key: 'concern-face-2', path: 'brand_asset/concern-face-2.webp', label: 'Lifting facial — ilustrativ' },
  { key: 'concern-riduri', path: 'brand_asset/concern-riduri.webp', label: 'Riduri / linii fine — generic' },
  { key: 'concern-pete', path: 'brand_asset/concern-pete.webp', label: 'Pete și pigmentare — generic' },
  { key: 'concern-stralucire', path: 'brand_asset/concern-stralucire.webp', label: 'Luminozitate ten — generic' },
  { key: 'concern-ten-problematic', path: 'brand_asset/concern-ten-problematic.webp', label: 'Ten problematic — generic' },
];

function findOfferImage(key) {
  return OFFER_IMAGES.find((img) => img.key === key) || null;
}

module.exports = { OFFER_IMAGES, findOfferImage };
