// Facebook Lead Ads → Pipeline: how a lead from a Facebook form becomes a lead in the portal.
// Two ways in, the same path after that:
//   - the webhook (api/webhook-facebook-leads.js): Meta announces each lead the moment it's sent;
//   - reading the forms (pollLeads): about every minute the portal asks Facebook for the new leads
//     of every active form of the connected Page. It runs from the portal heartbeat
//     (/api/portal-pulse) and the daily cron, and covers a webhook Meta doesn't deliver (it needs a
//     permission Meta doesn't always grant).
// A lead seen once (data/fb-forms.json → seen) never comes in twice, whichever way it arrives.
//
// Each lead arrives with its procedure and city: the form's settings in Integrări win; otherwise
// they're read from the form / ad / campaign names and the answers. The form's questions and
// answers stay on the lead (lead.forms) and show on the contact. Creating the lead starts the
// "Lead nou" automations (the team's alert, the WhatsApp to the lead …).

const { readJSON, writeJSON } = require('./store');
const { GRAPH_BASE, loadConnection, extractLeadFields, extraAnswers, answerPairs, fetchLead, fetchFormName, detectOffer, detectCity } = require('./facebook');
const { loadOffers } = require('./offers');

const FORMS_KEY = 'data/fb-forms.json';
const LOG_KEY = 'data/fb-webhook-log.json';
const POLL_KEY = 'data/fb-poll.json';
// When neither the form's settings nor its names say the city.
const DEFAULT_LOCATION = 'Timișoara';

// what came in lately and what became of it (Integrări → Facebook)
async function logDelivery(entry) {
  try {
    const list = await readJSON(LOG_KEY, []);
    list.unshift(Object.assign({ at: new Date().toISOString() }, entry));
    await writeJSON(LOG_KEY, list.slice(0, 30));
  } catch (err) { console.error('fb-leads: log failed', err.message); }
}

// One lead (as Facebook gives it) into the Pipeline. Returns a short line for the log.
async function ingestLead(lead, leadgenId, pageAccessToken, formIdHint) {
  const doc = await readJSON(FORMS_KEY, {});
  doc.forms = doc.forms || {};
  doc.seen = doc.seen || [];
  if (doc.seen.includes(leadgenId)) return 'deja primit';
  const formId = String(lead.form_id || formIdHint || '');
  const form = doc.forms[formId] = doc.forms[formId] || { name: '', offerId: '', location: '', leads: 0 };
  if (!form.name) form.name = await fetchFormName(formId, pageAccessToken);

  const f = extractLeadFields(lead.field_data);
  // Meta's test leads carry text like "<test lead: dummy data for email>": a lead is never refused for a
  // bad email (it's just left out), and a test lead gets a name and a pretend number
  const isTest = /test lead/i.test([f.name, f.phone, f.email].join(' '));
  const name = isTest ? 'Lead de test Facebook' : f.name;
  const phone = String(f.phone).replace(/\D/g, '').length >= 6 ? f.phone : isTest ? '0700 000 000' : f.phone;
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email || '') ? f.email : '';
  const answers = extraAnswers(lead.field_data);
  const text = [form.name, lead.ad_name, lead.adset_name, lead.campaign_name].concat(answers).filter(Boolean).join(' · ');
  const offers = (await loadOffers(readJSON, writeJSON)).filter((o) => o.active !== false);
  // what the person answered ("Oraș: Arad") says the city better than the form's name
  const city = form.location || detectCity(answers.join(" · ")) || detectCity(text);
  const offer = (form.offerId && offers.find((o) => o.id === form.offerId)) || detectOffer(offers, text, city);
  const only = offer && Array.isArray(offer.locations) && offer.locations.length === 1 ? offer.locations[0] : '';
  const location = city || (only === 'arad' ? 'Arad' : only === 'timisoara' ? 'Timișoara' : DEFAULT_LOCATION);

  form.leads = (form.leads || 0) + 1;
  form.lastAt = new Date().toISOString();
  form.detected = { offerId: offer ? offer.id : '', location };
  doc.seen = doc.seen.concat(leadgenId).slice(-1000);
  await writeJSON(FORMS_KEY, doc); // before the lead, so the same lead can't be made twice

  const note = ['Formular: ' + (form.name || formId || '-'), lead.ad_name ? 'Reclamă: ' + lead.ad_name : '', lead.campaign_name ? 'Campanie: ' + lead.campaign_name : '',
    lead.platform === 'ig' ? 'Venit din Instagram' : ''].filter(Boolean).join('\n');
  // required here, not on top: portal-leads loads the automations, which load this file's neighbours
  const { createLead } = require('../portal-leads');
  const result = await createLead({
    name: name || 'Lead Facebook', phone, email, source: 'facebook', location,
    interest: offer ? offer.title : form.name, note, createdBy: 'facebook-webhook',
    form: { id: formId, name: form.name, ad: lead.ad_name || '', answers: answerPairs(lead.field_data) },
  });
  if (result.error) { console.error('fb-leads: createLead failed', leadgenId, result.error); return 'nu s-a putut salva: ' + result.error; }
  return (result.duplicate ? 'lead existent, actualizat: ' : 'lead nou: ') + (name || 'fără nume') + ' · ' + (offer ? offer.title : form.name || 'procedură necunoscută') + ' · ' + location;
}

// A lead announced by the webhook: read it from Facebook, then the same path.
async function processLeadgenEvent(value, pageAccessToken) {
  const leadgenId = value && value.leadgen_id && String(value.leadgen_id);
  if (!leadgenId) return 'fără leadgen_id';
  const doc = await readJSON(FORMS_KEY, {});
  if ((doc.seen || []).includes(leadgenId)) return 'deja primit';
  const got = await fetchLead(leadgenId, pageAccessToken);
  if (got.error) { console.error('fb-leads: fetch lead failed', leadgenId, got.error); return 'Facebook n-a dat datele leadului: ' + got.error; }
  return ingestLead(got.lead, leadgenId, pageAccessToken, value.form_id);
}

// ---------------------------------------------------------------- reading the forms
const LEAD_FIELDS = 'id,created_time,field_data,form_id,ad_name,adset_name,campaign_name,platform';
async function graph(pathname, params, token) {
  const r = await fetch(GRAPH_BASE + pathname + '?' + new URLSearchParams(Object.assign({ access_token: token }, params)));
  const j = await r.json().catch(() => ({}));
  return r.ok ? { data: j.data || [] } : { error: (j.error && j.error.message) || 'eroare ' + r.status };
}

let lastLocal = 0;
// All the Page's forms with how many leads each has (Facebook counts them): one or a few calls,
// however many forms there are.
async function listForms(pageId, token) {
  const out = [];
  let next = GRAPH_BASE + '/' + encodeURIComponent(pageId) + '/leadgen_forms?' + new URLSearchParams({ fields: 'id,name,status,leads_count,created_time', limit: '100', access_token: token });
  for (let page = 0; next && page < 10; page++) {
    const r = await fetch(next);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: (j.error && j.error.message) || 'eroare ' + r.status };
    (j.data || []).forEach((f) => out.push({ id: f.id, name: f.name, status: f.status, count: Number(f.leads_count) || 0, created: f.created_time || '' }));
    next = j.paging && j.paging.next;
  }
  return { forms: out };
}

// Every minute: the list of forms with their lead counts; only a form whose count went up is asked
// for its new leads (since the last look, with two minutes of overlap; the seen list drops repeats).
// At most once a minute across all servers (data/fb-poll.json).
async function pollLeads(force) {
  if (!force && Date.now() - lastLocal < 60e3) return null;
  lastLocal = Date.now();
  try {
    const conn = await loadConnection(readJSON);
    if (!conn.pageId) return null;
    const st = await readJSON(POLL_KEY, {});
    if (!force && st.at && Date.now() - Date.parse(st.at) < 55e3) return null; // another server just looked
    const nowS = Math.floor(Date.now() / 1000);
    const since = st.cursor || nowS - 2 * 3600;
    st.at = new Date().toISOString();
    await writeJSON(POLL_KEY, st); // claim the turn

    const list = await listForms(conn.pageId, conn.pageAccessToken);
    if (list.error) { st.ok = false; st.error = list.error; await writeJSON(POLL_KEY, st); return 0; }
    const before = st.counts; // { formId: leads } from the last look (none the first time)
    const counts = {};
    list.forms.forEach((f) => { counts[f.id] = f.count; });
    const changed = before ? list.forms.filter((f) => f.count > (before[f.id] || 0)) : [];

    let newest = since, count = 0, lastError = '';
    for (const form of changed) {
      const r = await graph('/' + encodeURIComponent(form.id) + '/leads', {
        fields: LEAD_FIELDS, limit: '50',
        filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: since }]),
      }, conn.pageAccessToken);
      if (r.error) { lastError = form.name + ': ' + r.error; counts[form.id] = (before && before[form.id]) || 0; continue; } // try again next time
      for (const lead of r.data.slice().reverse()) { // oldest first
        const t = Math.floor(Date.parse(lead.created_time) / 1000);
        if (t > newest) newest = t;
        const text = await ingestLead(lead, String(lead.id), conn.pageAccessToken, form.id);
        if (text === 'deja primit') continue;
        count++;
        await logDelivery({ kind: 'poll', ok: /^lead /.test(text), text });
      }
    }
    const fresh = await readJSON(POLL_KEY, {});
    Object.assign(fresh, {
      at: st.at, counts, cursor: Math.max(since, newest - 120), ok: !lastError, error: lastError,
      forms: list.forms.map((f) => ({ id: f.id, name: f.name, status: f.status, count: f.count, created: f.created })),
      formsAt: new Date().toISOString(),
    });
    await writeJSON(POLL_KEY, fresh);
    return count;
  } catch (err) {
    console.error('fb-leads: poll failed', err.message);
    return 0;
  }
}

module.exports = { FORMS_KEY, LOG_KEY, POLL_KEY, logDelivery, ingestLead, processLeadgenEvent, pollLeads };
