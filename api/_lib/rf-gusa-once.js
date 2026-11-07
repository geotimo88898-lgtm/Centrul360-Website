// Once (the owner in his main session, 7.11: the two RF gușă ads for Arad, „se trimit și mesajele de lead-in?”): the
// offer was only on the ads, not in Admin → Oferte, so its leads would get no welcome message. This adds it, as the ads
// say it (lifting of the double chin with radiofrequency, one session, 119 lei instead of 210, Arad only), kept off the
// site (site: false, the site lists only what the owner put there), and its new-lead WhatsApp message in the owner's own
// words (the same as every offer's, Automatizări → Mesaje), sent to Meta for the Arad number. Until Meta approves it,
// the leads come into the portal and the team writes first, as with any template still in review.
// Run by the automations' clock and the portal's pulse; the result is kept in data/rf-gusa-once.json.

const { readJSON, writeJSON } = require('./store');
const { loadOffers } = require('./offers');
const WT = require('./wa-templates');

const KEY = 'data/rf-gusa-once.json';
const OFFER = {
  id: 'rf-gusa-arad', key: 'rf-gusa-arad', title: 'RF Sculpt · Gușă', description: 'O ședință de lifting al gușii cu radiofrecvență.',
  priceNew: 119, priceOld: 210, category: 'faciale', featured: false, imageKey: 'gusa-ba-premium', active: true, order: 30, site: false,
  ads: true, locations: ['arad'], short: 'RF Gușă', adName: 'Lifting gușă cu radiofrecvență',
  mechanic: 'o ședință de lifting cu radiofrecvență pe gușă', dreamOutcome: 'bărbie și gât mai definite',
  mechanism: 'radiofrecvență care strânge pielea de sub bărbie', objections: ['fără ace', 'fără operație', 'fără pauză'],
  zones: ['gușă / bărbie dublă', 'bărbie și gât'], notes: 'DOAR Arad. Reclamele din 7.11: 8 locuri pe săptămână.',
};
const LABEL = 'Lead nou · ' + OFFER.title;
const TEXT = 'Bună {prenume}! 👋 Mai avem câteva locuri disponibile săptămâna aceasta la oferta Lifting gușă cu radiofrecvență la 119 LEI, în loc de 210 LEI. 🔥\n\nCa să îți verificăm disponibilitatea, unde ți-ar fi mai ușor să ajungi? ❤️';
const BUTTONS = [{ type: 'QUICK_REPLY', text: 'Timișoara' }, { type: 'QUICK_REPLY', text: 'Arad' }];

async function run() {
  const st = await readJSON(KEY, {});
  if (st.done) return { skipped: true };
  const out = { at: new Date().toISOString() };
  // the offer (once; an edit in Admin later keeps it)
  const offers = await loadOffers(readJSON, writeJSON);
  if (!offers.some((o) => o.key === OFFER.key)) {
    offers.push(Object.assign({}, OFFER));
    await writeJSON('data/offers.json', offers);
    out.offer = 'added';
  } else out.offer = 'there';
  // its new-lead message: made once, sent to Meta for Arad (again on the next tick if Meta did not take it)
  const d = await WT.load();
  let t = d.templates.find((x) => (x.leadOffers || []).includes(OFFER.key));
  if (!t) {
    const r = WT.clean({ label: LABEL, category: 'MARKETING', headerType: '', body: TEXT, footer: '', buttons: BUTTONS, leadOffers: [OFFER.key], only: ['Arad'] });
    if (r.error) { await writeJSON(KEY, Object.assign(out, { done: false, error: r.error })); return { error: r.error }; }
    t = r.t;
    d.templates.push(t);
    await WT.save(d);
  }
  const state = WT.overall(t);
  if (state === 'DRAFT' || state === 'REJECTED') {
    const s = await WT.submit(d, t.id, ['Arad']);
    await WT.save(d);
    if (s.error && !s.partial) { await writeJSON(KEY, Object.assign(out, { done: false, error: s.error, template: t.label })); return { error: s.error }; }
  }
  await writeJSON(KEY, Object.assign(out, { done: true, template: t.label, status: WT.overall(t) }));
  return { done: true, status: WT.overall(t) };
}

module.exports = { run, KEY, OFFER };
