// Once (7.11, the RF gușă ads for Arad): the form „RF Gușă 119 · Arad” was made with the offer's key, which the form window
// did not know then (it looked only at titles), so the form is tied to no offer. Its leads get the RF offer, its welcome
// message and its notifications: the form is tied to rf-gusa-arad here, and the offer knows its Arad form.
// Run by the automations' clock and the portal's pulse; the result is kept in data/rf-form-once.json.

const { readJSON, writeJSON } = require('./store');

const KEY = 'data/rf-form-once.json';
const FORM = '1616699786127096';
const OFFER = 'rf-gusa-arad';

async function run() {
  const st = await readJSON(KEY, {});
  if (st.done) return { skipped: true };
  const doc = await readJSON('data/fb-forms.json', {});
  doc.forms = doc.forms || {};
  const f = doc.forms[FORM];
  if (!f) { await writeJSON(KEY, { done: false, at: new Date().toISOString(), why: 'form not in the list yet' }); return { wait: true }; }
  if (f.offerId !== OFFER) { f.offerId = OFFER; f.location = f.location || 'Arad'; await writeJSON('data/fb-forms.json', doc); }
  const offers = await readJSON('data/offers.json', null);
  const o = Array.isArray(offers) && offers.find((x) => x.id === OFFER);
  if (o && (o.forms || {}).Arad !== FORM) { o.forms = Object.assign({}, o.forms, { Arad: FORM }); await writeJSON('data/offers.json', offers); }
  await writeJSON(KEY, { done: true, at: new Date().toISOString(), form: FORM, offer: OFFER, offerFound: !!o });
  return { done: true };
}

module.exports = { run, KEY };
