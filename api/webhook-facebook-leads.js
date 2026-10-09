// /api/webhook-facebook-leads — Meta calls this directly, no portal auth. Replaces what
// GoHighLevel used to do for this clinic: a new Facebook/Instagram Lead Ads submission
// lands here and becomes a 'lead_nou' Pipeline entry.
//
// GET  -> Meta's one-time webhook verification handshake.
// POST -> the actual 'leadgen' event. Body signature must be verified against the RAW
//         bytes (HMAC-SHA256 with FB_APP_SECRET), so automatic JSON body parsing is
//         disabled below (config.api.bodyParser:false) and the body is parsed by hand
//         only after the signature check passes.
//
// Always responds 200 once the payload is accepted for processing — Meta retries a
// webhook aggressively on anything else, and one bad leadgen_id must not take the whole
// delivery down with it (see the per-entry try/catch below).

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { GRAPH_BASE, loadConnection, extractLeadFields } = require('./_lib/facebook');
const { createLead } = require('./portal-leads');

module.exports.config = { api: { bodyParser: false } };

// Form-id -> location mapping isn't built out yet (no UI spec for it, and a single
// clinic location Page is the common case) — default every Facebook lead to the primary
// location. Revisit if/when the clinic runs ads for both locations through one Page and
// needs per-form routing.
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
  const leadgenId = value && value.leadgen_id;
  if (!leadgenId) return;

  const url = `${GRAPH_BASE}/${leadgenId}?${new URLSearchParams({ access_token: pageAccessToken })}`;
  const resp = await fetch(url);
  const data = await resp.json();
  if (!resp.ok) {
    console.error('webhook-facebook-leads: fetch lead failed', leadgenId, data);
    return;
  }

  const { name, phone } = extractLeadFields(data.field_data);
  const result = await createLead({
    name: name || 'Lead Facebook',
    phone,
    source: 'facebook',
    location: DEFAULT_LOCATION,
    createdBy: 'facebook-webhook',
  });
  if (result.error) {
    console.error('webhook-facebook-leads: createLead failed', leadgenId, result.error);
  }
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

  // Always 200 once we're past signature verification — everything below is "best
  // effort, log and move on" so a flaky Graph API call never turns into a Meta retry
  // storm or a half-processed batch.
  res.status(200).json({ ok: true });

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
};
