// Once (the owner, 19.11: on the site Full Body laser no longer has a discount): the Admin offer `epilare-full-body`
// leaves the site (site: false, api/offers-public.js filters it), so the offer boxes, the carousels and Prețuri drop it
// and the site shows only its fixed prices (one session, the 6 session package; v2/src/epilare-laser.html, preturi.html).
// Nothing else changes on the offer: the same title, prices and description still feed the Meta ads, the WhatsApp
// welcome message, the Calculator de ofertă, Nuki and the Creative machine. The site's booking takes Full Body by its
// name (api/_lib/booking.js services with { site: true }, custom).
// Run by the automations' clock and the portal's pulse; the result is kept in data/fb-site-off-once.json.

const { readJSON, writeJSON } = require('./store');
const { loadOffers } = require('./offers');

const KEY = 'data/fb-site-off-once.json';
const OFFER = 'epilare-full-body';

async function run() {
  const st = await readJSON(KEY, {});
  if (st.done) return { skipped: true };
  await loadOffers(readJSON, writeJSON); // the file at the current schema first, as every writer of Oferte reads it
  const raw = await readJSON('data/offers.json', null);
  if (!Array.isArray(raw)) { await writeJSON(KEY, { done: false, at: new Date().toISOString(), error: 'no_offers' }); return { error: 'no_offers' }; }
  const o = raw.find((x) => x && x.key === OFFER);
  let out;
  if (!o) out = 'missing';
  else if (o.site === false) out = 'already';
  else { o.site = false; await writeJSON('data/offers.json', raw); out = 'off'; }
  await writeJSON(KEY, { done: true, at: new Date().toISOString(), offer: OFFER, result: out });
  return { done: true, result: out };
}

module.exports = { run, KEY, OFFER };
