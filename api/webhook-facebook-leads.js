// /api/webhook-facebook-leads - Meta calls this directly, no portal auth. Replaces what
// GoHighLevel used to do for this clinic: a new Facebook/Instagram Lead Ads submission
// lands here and becomes a 'lead_nou' Pipeline entry.
//
// GET  -> Meta's one-time webhook verification handshake.
// POST -> the actual 'leadgen' event. Body signature must be verified against the RAW
//         bytes (HMAC-SHA256 with the Meta app's secret), so automatic JSON body parsing is
//         disabled below (config.api.bodyParser:false) and the body is parsed by hand
//         only after the signature check passes.
//
// Always responds 200 once the payload is accepted - Meta retries a webhook aggressively on
// anything else, and one bad leadgen_id must not take the whole delivery down with it (see the
// per-entry try/catch below). The answer goes out after the work: on Vercel a function is frozen
// as soon as it has answered, so work left for later would never run.
//
// What happens to each lead (procedure, city, answers, the automations) lives in _lib/fb-leads.js,
// shared with the reading of the forms that covers a webhook Meta doesn't deliver.

const crypto = require('crypto');
const { readJSON } = require('./_lib/store');
const { loadConnection, webhookSecrets } = require('./_lib/facebook');
const { FORMS_KEY, LOG_KEY, logDelivery, processLeadgenEvent } = require('./_lib/fb-leads');

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

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query || {};
    const { tokens } = await webhookSecrets(readJSON);
    if (!tokens.length || mode !== 'subscribe' || !tokens.includes(token)) {
      await logDelivery({ kind: 'verify', ok: false, text: 'Verificare webhook respinsă (verify token diferit)' });
      res.status(403).send('forbidden');
      return;
    }
    await logDelivery({ kind: 'verify', ok: true, text: 'Webhook verificat de Meta' });
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

  const { secrets } = await webhookSecrets(readJSON);
  const signatureHeader = req.headers['x-hub-signature-256'];
  if (!secrets.some((secret) => isValidSignature(rawBody, signatureHeader, secret))) {
    await logDelivery({ kind: 'lead', ok: false, text: 'Semnătură invalidă: App secret salvat în portal nu e al aplicației care trimite' });
    res.status(403).json({ error: 'invalid_signature' });
    return;
  }

  // Always 200 once we're past signature verification, everything below is "best
  // effort, log and move on" so a flaky Graph API call never turns into a Meta retry
  // storm or a half-processed batch.
  try {
    const payload = JSON.parse(rawBody.toString('utf8'));
    const conn = await loadConnection(readJSON);
    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'leadgen') continue;
        const pageId = String((change.value && change.value.page_id) || entry.id || '');
        // the token of the Page the lead came from (the login may reach several Pages)
        const token = ((conn.pages || []).find((p) => p.id === pageId) || {}).access_token || conn.pageAccessToken;
        if (!token) { await logDelivery({ kind: 'lead', ok: false, text: 'Lead primit, dar nicio Pagină conectată în portal' }); continue; }
        try {
          const text = await processLeadgenEvent(change.value, token);
          await logDelivery({ kind: 'lead', ok: /^lead /.test(text) || text === 'deja primit', text: text + (conn.pageId && pageId && pageId !== conn.pageId ? ' (de pe altă Pagină: ' + pageId + ')' : '') });
        } catch (err) {
          console.error('webhook-facebook-leads: error processing entry', err.message);
          await logDelivery({ kind: 'lead', ok: false, text: 'Eroare: ' + err.message });
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
module.exports.LOG_KEY = LOG_KEY;
