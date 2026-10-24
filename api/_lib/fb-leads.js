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
const { GRAPH_BASE, loadConnection, extractLeadFields, extraAnswers, answerPairs, fetchLead, fetchFormInfo, detectOffer, detectCity } = require('./facebook');
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
  // the form's name and questions, asked once and kept (the questions as written in the form)
  if (!form.name || !form.questions) {
    const info = await fetchFormInfo(formId, pageAccessToken);
    form.name = form.name || info.name;
    form.questions = info.questions;
  }

  const f = extractLeadFields(lead.field_data);
  // Meta's test leads carry text like "<test lead: dummy data for email>": a lead is never refused for a
  // bad email (it's just left out), and a test lead gets a name and a pretend number
  const isTest = /test lead/i.test([f.name, f.phone, f.email].join(' '));
  const name = isTest ? 'Lead de test Facebook' : f.name;
  // a lead is never lost for a missing number: it comes in as "fără telefon" and reception sees it
  const phone = String(f.phone).replace(/\D/g, '').length >= 6 ? f.phone : isTest ? '0700 000 000' : (f.phone || 'fără telefon');
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email || '') ? f.email : '';
  const answers = extraAnswers(lead.field_data, form.questions);
  // a job ad's form (api/_lib/hire-once.js): a candidate, kept apart from the clients, and the admins are told
  if (form.kind === 'hiring') {
    form.leads = (form.leads || 0) + 1;
    form.lastAt = new Date().toISOString();
    doc.seen = doc.seen.concat(leadgenId).slice(-1000);
    await writeJSON(FORMS_KEY, doc);
    const list = await readJSON('data/candidates.json', []);
    const pairs = answerPairs(lead.field_data, form.questions);
    list.unshift({ id: leadgenId, at: new Date().toISOString(), name: name || 'fără nume', phone, email, location: form.location || '', job: form.job || form.name,
      answers: pairs, ad: lead.ad_name || '', formId, test: isTest || undefined });
    await writeJSON('data/candidates.json', list.slice(0, 1000));
    const employees = await readJSON('data/employees.json', []);
    const ids = ['admin'].concat((employees || []).filter((e) => e.role === 'admin' && e.active !== false).map((e) => e.id));
    const { notifyMany } = require('./notify');
    await notifyMany({ readJSON, writeJSON }, [...new Set(ids)], { kind: 'alert', tone: 'info', go: 'angajati', tag: 'cand-' + leadgenId,
      title: 'CANDIDAT NOU 💼 - ' + (name || 'fără nume'), text: [phone].concat(pairs.map((x) => x.q + ': ' + x.a)).join(' · ') });
    return 'candidat nou: ' + (name || 'fără nume') + ' · ' + (form.job || form.name);
  }
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
    form: { id: formId, name: form.name, ad: lead.ad_name || '', campaign: lead.campaign_name || '', adId: lead.ad_id || '', adsetId: lead.adset_id || '', campaignId: lead.campaign_id || '', sentAt: lead.created_time && !isNaN(Date.parse(lead.created_time)) ? new Date(Date.parse(lead.created_time)).toISOString() : '', answers: answerPairs(lead.field_data, form.questions) },
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
const LEAD_FIELDS = 'id,created_time,field_data,form_id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,platform';
async function graph(pathname, params, token) {
  const r = await fetch(GRAPH_BASE + pathname + '?' + new URLSearchParams(Object.assign({ access_token: token }, params)));
  const j = await r.json().catch(() => ({}));
  return r.ok ? { data: j.data || [] } : { error: (j.error && j.error.message) || 'eroare ' + r.status };
}

let lastLocal = 0;
// All the Page's forms, each with its newest lead (id + time) in the same answer: one or a few
// calls however many forms there are. (Facebook's lead counter lags and skips test leads, so it
// isn't used.)
async function listForms(pageId, token) {
  const out = [];
  let next = GRAPH_BASE + '/' + encodeURIComponent(pageId) + '/leadgen_forms?' + new URLSearchParams({
    fields: 'id,name,status,leads_count,created_time,leads.limit(1){id,created_time}', limit: '100', access_token: token,
  });
  for (let page = 0; next && page < 10; page++) {
    const r = await fetch(next);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: (j.error && j.error.message) || 'eroare ' + r.status };
    (j.data || []).forEach((f) => {
      const last = f.leads && f.leads.data && f.leads.data[0];
      out.push({ id: f.id, name: f.name, status: f.status, count: Number(f.leads_count) || 0, created: f.created_time || '',
        lastId: last ? String(last.id) : '', lastAt: last && last.created_time ? Math.floor(Date.parse(last.created_time) / 1000) : 0 });
    });
    next = j.paging && j.paging.next;
  }
  return { forms: out };
}

// Every minute: the forms with their newest lead; only a form whose newest lead is newer than the
// last look (and not already in) is asked for its new leads, since the last look with two minutes
// of overlap (the seen list drops repeats). At most once a minute across all servers.
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
    const seen = new Set(((await readJSON(FORMS_KEY, {})).seen) || []);
    const changed = list.forms.filter((f) => f.lastId && f.lastAt > since - 120 && !seen.has(f.lastId));

    let newest = since, count = 0, lastError = '', failure = '';
    for (const form of changed) {
      const r = await graph('/' + encodeURIComponent(form.id) + '/leads', {
        fields: LEAD_FIELDS, limit: '50',
        filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: since - 120 }]),
      }, conn.pageAccessToken);
      if (r.error) { lastError = form.name + ': ' + r.error; continue; }
      for (const lead of r.data.slice().reverse()) { // oldest first
        const t = Math.floor(Date.parse(lead.created_time) / 1000);
        if (t > newest) newest = t;
        const text = await ingestLead(lead, String(lead.id), conn.pageAccessToken, form.id);
        if (text === 'deja primit') continue;
        const good = /^lead /.test(text);
        if (good) count++; else failure = text;
        await logDelivery({ kind: 'poll', ok: good, text });
      }
    }
    const fresh = await readJSON(POLL_KEY, {});
    Object.assign(fresh, {
      at: st.at, cursor: Math.max(since, newest), ok: !lastError, error: lastError,
      lastFailure: failure ? { at: new Date().toISOString(), text: failure } : fresh.lastFailure || null,
      forms: list.forms.map((f) => ({ id: f.id, name: f.name, status: f.status, count: f.count, created: f.created, lastAt: f.lastAt })),
      formsAt: new Date().toISOString(),
    });
    delete fresh.counts;
    await writeJSON(POLL_KEY, fresh);
    return count;
  } catch (err) {
    console.error('fb-leads: poll failed', err.message);
    return 0;
  }
}

module.exports = { FORMS_KEY, LOG_KEY, POLL_KEY, logDelivery, ingestLead, processLeadgenEvent, pollLeads };
