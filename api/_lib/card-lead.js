// The Card de Sărbători from a Facebook lead form (21.11): the form „Rezervă Cardul de Sărbători” asks which card
// (290 → 500, 490 → 1.000, 990 → 2.500 lei), for whom (pentru mine / cadou) and the clinic. Its leads come in through
// api/_lib/fb-leads.js (forms with kind 'card' in data/fb-forms.json), are read here, written on the lead (lead.card)
// and handed to the card's own reservation (api/_lib/card-sarbatori.js reserveFromLead, built by the card's side: it
// makes the reservation and sends the payment link on WhatsApp). Until that exists, the clinic's desk is told to call her.
//   parse(form, pairs)          { tier, credit, forWhom, city } from her answers ({ q, a })
//   afterLead(lead, x)          written on the lead, then the reservation (or the call alert)
//   formInput()                 the form, for api/_lib/fb-form-create.js clean() / postForm()

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./store');

const LEADS_KEY = 'data/leads.json';
const TIERS = { 290: 500, 490: 1000, 990: 2500 };
const Q = { card: 'Ce card vrei?', who: 'Pentru cine este?', city: 'La ce clinică?' };
const CARD_OPTS = ['290 lei → 500 lei în tratamente', '490 lei → 1.000 lei în tratamente', '990 lei → 2.500 lei (cea mai bună valoare)'];
const WHO_OPTS = ['Pentru mine', 'Cadou'];
const CITY_OPTS = ['Timișoara', 'Arad'];
const PAGE = 'https://www.centrul360.com/card-sarbatori?utm_source=facebook&utm_medium=paid&utm_campaign=card_form';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const lei = (n) => Number(n).toLocaleString('ro-RO');

function parse(form, pairs) {
  const find = (q) => (pairs || []).find((p) => fold(p.q) === fold(q)) || null;
  const out = { tier: '', credit: 0, forWhom: '', city: form && form.location ? form.location : '' };
  const c = find(Q.card);
  const m = c && /^(\d{3})/.exec(String(c.a).trim());
  if (m && TIERS[m[1]]) { out.tier = m[1]; out.credit = TIERS[m[1]]; }
  const w = find(Q.who);
  if (w) out.forWhom = /cadou/i.test(w.a) ? 'cadou' : 'pentru mine';
  const k = find(Q.city);
  if (k) out.city = /arad/i.test(k.a) ? 'Arad' : /timi/i.test(fold(k.a)) ? 'Timișoara' : out.city;
  return out;
}
const summary = (x) => [x.tier ? lei(x.tier) + ' lei → ' + lei(x.credit) + ' lei' : 'card neales', x.forWhom, x.city].filter(Boolean).join(' · ');

async function afterLead(lead, x) {
  try {
    if (!lead || !lead.id || !x) return;
    const at = new Date().toISOString();
    const leads = await readJSON(LEADS_KEY, []);
    const l = leads.find((y) => y.id === lead.id);
    if (!l) return;
    l.card = Object.assign({}, l.card, { tier: x.tier, credit: x.credit, forWhom: x.forWhom, city: x.city, at, from: 'formular' });
    (l.activities = l.activities || []).push({ id: crypto.randomUUID(), type: 'note', text: 'Cardul de Sărbători (formular): ' + summary(x), author: 'Facebook Lead Ads', at });
    await writeJSON(LEADS_KEY, leads);
    // >>> CALL SITE: the card's reservation + the WhatsApp payment link (api/_lib/card-sarbatori.js, the card session).
    //     A no-op until reserveFromLead exists there; then it takes over and the call alert below is only a fallback.
    let done = false;
    try {
      const CS = require('./card-sarbatori');
      if (typeof CS.reserveFromLead === 'function') {
        const f = (l.forms || []).slice(-1)[0] || {};
        const r = await CS.reserveFromLead({ phone: l.phone, name: l.name, city: x.city, value: String(x.tier || ''), forWhom: x.forWhom === 'cadou' ? 'cadou' : 'eu',
          source: { utm_source: 'facebook', utm_campaign: f.campaign || 'card_form', utm_content: f.ad || '', adId: f.adId || '', adsetId: f.adsetId || '', campaignId: f.campaignId || '', formId: f.id || '', leadId: f.leadgenId || '' } });
        done = !!(r && r.ok && !r.error);
        if (r && r.error) console.error('card-lead reserveFromLead:', r.error);
      }
    } catch (e) { console.error('card-lead reserve:', e.message); }
    if (done) return;
    const N = require('./notify');
    const ids = await N.deskIds({ readJSON }, x.city || l.location || '');
    await N.notifyMany({ readJSON, writeJSON }, ids, { kind: 'lead', tone: 'good', go: 'pipeline', tag: 'card-' + lead.id, ownerPush: true,
      title: 'CARD 🎁 ' + (x.tier ? lei(x.tier) + ' lei' : '') + ' · ' + (lead.name || 'lead nou'),
      text: 'Sun-o, a rezervat cardul ' + summary(x) + '. Trimite-i linkul de plată sau rezervă-l în clinică.' }).catch((e) => console.error('card-lead notify:', e.message));
  } catch (err) { console.error('card-lead.afterLead:', err.message); }
}

// the form (both clinics: the clinic is a question; the ending sends her to the card page to pay at once)
function formInput() {
  return {
    name: 'Rezervă Cardul de Sărbători',
    location: 'Timișoara', // only for fb-form-create's checks; the clinic comes from her answer
    fields: ['FULL_NAME', 'PHONE'],
    questions: [{ label: Q.card, options: CARD_OPTS }, { label: Q.who, options: WHO_OPTS }, { label: Q.city, options: CITY_OPTS }],
    headline: 'Rezervă Cardul de Sărbători',
    quality: false,
    ending: { title: 'Mulțumim! 🎁', body: 'Îți trimitem acum pe WhatsApp linkul de plată pentru cardul ales. Poți plăti și direct, pe pagina cardului.', button: 'Plătește acum' },
  };
}
const thankYou = (t) => ({ title: t.title, body: t.body, button_type: 'VIEW_WEBSITE', button_text: t.button, website_url: PAGE });

module.exports = { parse, afterLead, summary, formInput, thankYou, Q, TIERS, PAGE };
