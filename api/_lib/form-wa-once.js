// Once (the owner in his main session, 7.11: „fă asta posibil”, the two RF gușă ads for Arad): new Arad lead forms had no
// WhatsApp number for their ending button (Formulare → Setări formulare, Arad empty), so they could not be made. Arad's
// clinic number, the one on the site, goes in; only if that field is still empty, nothing else changes.
// Run by the automations' clock and the portal's pulse; the result is kept in data/form-wa-once.json.

const store = require('./store');
const T = require('./fb-form-template');

const KEY = 'data/form-wa-once.json';
const ARAD = '+40750277394'; // Arad's clinic, as on www.centrul360.com

async function run() {
  const st = await store.readJSON(KEY, {});
  if (st.done) return { skipped: true };
  const t = await T.getTemplate(store); // reads it from the running forms first if it was never kept
  const before = ((t.cities || {}).Arad || {}).whatsapp || '';
  let after = before;
  if (!before) {
    const r = await T.saveTemplate(store, { cities: { Arad: { whatsapp: ARAD } } });
    if (r.error) { await store.writeJSON(KEY, { done: false, at: new Date().toISOString(), error: r.error }); return { error: r.error }; }
    after = ((r.template.cities || {}).Arad || {}).whatsapp || '';
  }
  await store.writeJSON(KEY, { done: !!after, at: new Date().toISOString(), before: before || null, after: after || null });
  return { done: !!after };
}

module.exports = { run, KEY };
