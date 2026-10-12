// /api/webhook-facebook-leads - Meta calls this directly, no portal auth. Replaces what
// GoHighLevel used to do for this clinic: a new Facebook/Instagram Lead Ads submission
// lands here and becomes a 'lead_nou' Pipeline entry.
//
// GET  -> Meta's one-time webhook verification handshake.
// POST -> the actual 'leadgen' event. Body signature must be verified against the RAW
//         bytes (HMAC-SHA256 with FB_APP_SECRET), so automatic JSON body parsing is
//         disabled below (config.api.bodyParser:false) and the body is parsed by hand
//         only after the signature check passes.
//
// Always responds 200 once the payload is accepted - Meta retries a webhook aggressively on
// anything else, and one bad leadgen_id must not take the whole delivery down with it (see the
// per-entry try/catch below). The answer goes out after the work: on Vercel a function is frozen
// as soon as it has answered, so work left for later would never run.
//
// Each lead arrives with its procedure and city: the form's settings in Integrări (data/fb-forms.json,
// set by the owner) win; otherwise they're read from the form / ad / campaign names and the answers.
// The form's questions and answers stay on the lead (lead.forms) and show on the contact. Creating the lead starts the "Lead nou" automations
// (the team's alert, the WhatsApp to the lead …).

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { loadConnection, extractLeadFields, extraAnswers, answerPairs, fetchLead, fetchFormName, detectOffer, detectCity } = require('./_lib/facebook');
const { loadOffers } = require('./_lib/offers');
const { createLead } = require('./portal-leads');

const FORMS_KEY = 'data/fb-forms.json';

// When neither the form's settings nor its names say the city.
const DEFAULT_LOCATION = 'Timișoara';

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function isValidSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const [algo, hash] = String(header).split('=');
  if (algo !== 'sha256' || !hash) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function processLeadgenEvent(value, pageAccessToken) {
  const leadgenId = value && value.leadgen_id && String(value.leadgen_id);
  if (!leadgenId) return;
  const doc = await readJSON(FORMS_KEY, {});
  doc.forms = doc.forms || {};
  doc.seen = doc.seen || [];
  if (doc.seen.includes(leadgenId)) return; // Meta sent the same lead again

  const got = await fetchLead(leadgenId, pageAccessToken);
  if (got.error) { console.error('webhook-facebook-leads: fetch lead failed', leadgenId, got.error); return; }
  const lead = got.lead;
  const formId = String(lead.form_id || value.form_id || '');
  const form = doc.forms[formId] = doc.forms[formId] || { name: '', offerId: '', location: '', leads: 0 };
  if (!form.name) form.name = await fetchFormName(formId, pageAccessToken);

  const { name, phone, email } = extractLeadFields(lead.field_data);
  const answers = extraAnswers(lead.field_data);
  const text = [form.name, lead.ad_name, lead.adset_name, lead.campaign_name].concat(answers).filter(Boolean).join(' · ');
  const offers = (await loadOffers(readJSON, writeJSON)).filter((o) => o.active !== false);
  const city = form.location || detectCity(text);
  const offer = (form.offerId && offers.find((o) => o.id === form.offerId)) || detectOffer(offers, text, city);
  const only = offer && Array.isArray(offer.locations) && offer.locations.length === 1 ? offer.locations[0] : '';
  const location = city || (only === 'arad' ? 'Arad' : only === 'timisoara' ? 'Timișoara' : DEFAULT_LOCATION);

  form.leads = (form.leads || 0) + 1;
  form.lastAt = new Date().toISOString();
  form.detected = { offerId: offer ? offer.id : '', location };
  doc.seen = doc.seen.concat(leadgenId).slice(-300);
  await writeJSON(FORMS_KEY, doc); // before the lead, so a retry from Meta can't make it twice

  const note = ['Formular: ' + (form.name || formId || '-'), lead.ad_name ? 'Reclamă: ' + lead.ad_name : '', lead.campaign_name ? 'Campanie: ' + lead.campaign_name : '',
    lead.platform === 'ig' ? 'Venit din Instagram' : ''].filter(Boolean).join('\n');
  const result = await createLead({
    name: name || 'Lead Facebook', phone, email, source: 'facebook', location,
    interest: offer ? offer.title : form.name, note, createdBy: 'facebook-webhook',
    form: { id: formId, name: form.name, ad: lead.ad_name || '', answers: answerPairs(lead.field_data) },
  });
  if (result.error) console.error('webhook-facebook-leads: createLead failed', leadgenId, result.error);
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query || {};
    const expected = process.env.FB_WEBHOOK_VERIFY_TOKEN;
    if (!expected || mode !== 'subscribe' || token !== expected) {
      res.status(403).send('forbidden');
      return;
    }
    res.status(200).send(String(challenge || ''));
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (err) {
    res.status(400).json({ error: 'bad_body' });
    return;
  }

  const appSecret = process.env.FB_APP_SECRET;
  const signatureHeader = req.headers['x-hub-signature-256'];
  if (!isValidSignature(rawBody, signatureHeader, appSecret)) {
    res.status(403).json({ error: 'invalid_signature' });
    return;
  }

  // Always 200 once we're past signature verification, everything below is "best
  // effort, log and move on" so a flaky Graph API call never turns into a Meta retry
  // storm or a half-processed batch.
  try {
    const payload = JSON.parse(rawBody.toString('utf8'));
    const conn = await loadConnection(readJSON);
    if (!conn.pageAccessToken) {
      console.error('webhook-facebook-leads: received leadgen event but no Facebook Page is connected');
      return;
    }

    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'leadgen') continue;
        try {
          await processLeadgenEvent(change.value, conn.pageAccessToken);
        } catch (err) {
          console.error('webhook-facebook-leads: error processing entry', err.message);
        }
      }
    }
  } catch (err) {
    console.error('webhook-facebook-leads: error handling payload', err.message);
  }
  res.status(200).json({ ok: true });
};

module.exports.config = { api: { bodyParser: false } };
module.exports.FORMS_KEY = FORMS_KEY;
