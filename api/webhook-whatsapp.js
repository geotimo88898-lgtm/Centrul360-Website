// /api/webhook-whatsapp - Meta calls this directly, no portal auth (same shape as
// api/webhook-facebook-leads.js, see that file's header comment for the general pattern).
//
// GET  -> Meta's one-time webhook verification handshake (WHATSAPP_WEBHOOK_VERIFY_TOKEN).
// POST -> inbound client messages + delivery/read status updates for the WhatsApp Cloud API.
//         Body signature is verified against the RAW bytes (HMAC-SHA256 with
//         WHATSAPP_APP_SECRET, a DIFFERENT Meta app than the one FB_APP_SECRET belongs to,
//         since WhatsApp lives in its own "Centrul 360 WhatsApp" app, not the Facebook Login
//         app used for lead ads). Automatic JSON body parsing is disabled below so the raw
//         bytes are available for the signature check.
//
// Always responds 200 once the payload is accepted - Meta retries aggressively on anything
// else, and one bad message/status entry must never take the whole delivery down with it.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { upsertClient, normalizePhone } = require('./_lib/clients');

module.exports.config = { api: { bodyParser: false } };

const KEY = 'data/whatsapp-conversations.json';
const nowISO = () => new Date().toISOString();

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

// Which clinic location owns the WhatsApp number that received the message, from Meta's
// `metadata.phone_number_id`. Both location numbers aren't live yet (only Meta's sandbox test
// number is, as of writing) - WHATSAPP_PHONE_ID_TIMISOARA / WHATSAPP_PHONE_ID_ARAD are the
// per-location numbers to set once they're connected; a phone_number_id that matches neither
// (e.g. today's sandbox number) falls back to '' (unknown), it never hard-fails.
function locationForPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) return '';
  if (process.env.WHATSAPP_PHONE_ID_TIMISOARA && phoneNumberId === process.env.WHATSAPP_PHONE_ID_TIMISOARA) return 'Timișoara';
  if (process.env.WHATSAPP_PHONE_ID_ARAD && phoneNumberId === process.env.WHATSAPP_PHONE_ID_ARAD) return 'Arad';
  return '';
}

function findOrCreateConversation(conversations, phone) {
  let convo = conversations.find((c) => c.phone === phone);
  if (!convo) {
    convo = { phone, clientName: '', location: '', lastMessageAt: nowISO(), unreadCount: 0, messages: [] };
    conversations.push(convo);
  }
  return convo;
}

// Best-effort text for a message type we don't render specially, never throws.
function textFor(message) {
  const type = message && message.type;
  if (type === 'text') return (message.text && message.text.body) || '';
  if (type === 'button') return (message.button && message.button.text) || '[buton]';
  if (type === 'interactive') {
    const i = message.interactive || {};
    return (i.button_reply && i.button_reply.title) || (i.list_reply && i.list_reply.title) || '[răspuns interactiv]';
  }
  return '[tip mesaj: ' + (type || 'necunoscut') + ']';
}

async function handleInboundMessage(conversations, message, phoneNumberId) {
  const from = message && message.from;
  if (!from) return;
  const phone = normalizePhone(from) || from;
  const convo = findOrCreateConversation(conversations, phone);

  // Resolve a display name from the client directory (upsert so a client that messages in
  // doesn't need to exist yet), fall back to the raw phone number when nothing resolves.
  try {
    const client = await upsertClient({ name: convo.clientName, phone: from }, { readJSON, writeJSON });
    convo.clientName = (client && client.name) || convo.clientName || phone;
  } catch (err) {
    console.error('webhook-whatsapp: client resolution failed', err.message);
    if (!convo.clientName) convo.clientName = phone;
  }

  if (!convo.location) {
    const loc = locationForPhoneNumberId(phoneNumberId);
    if (loc) convo.location = loc;
  }

  const type = message.type === 'text' ? 'text' : 'other';
  const ts = message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : nowISO();
  convo.messages.push({
    id: message.id || crypto.randomUUID(),
    direction: 'in',
    type,
    text: textFor(message),
    status: 'received',
    timestamp: ts,
    sentBy: null,
  });
  convo.lastMessageAt = ts;
  convo.unreadCount = (convo.unreadCount || 0) + 1;
}

function handleStatusUpdate(conversations, status) {
  const id = status && status.id;
  if (!id) return;
  for (const convo of conversations) {
    const msg = convo.messages.find((m) => m.id === id);
    if (msg) { msg.status = status.status || msg.status; return; }
  }
  // No matching outbound message found (e.g. sent before this feature existed), nothing to update.
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query || {};
    const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
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

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const signatureHeader = req.headers['x-hub-signature-256'];
  if (appSecret) {
    if (!isValidSignature(rawBody, signatureHeader, appSecret)) {
      res.status(403).json({ error: 'invalid_signature' });
      return;
    }
  } else {
    // TEMPORARY / INSECURE FALLBACK: WHATSAPP_APP_SECRET isn't set yet on this deployment
    // (the WhatsApp app's own App Secret, separate from FB_APP_SECRET). Skip verification
    // rather than 500ing on every delivery, set the env var to close this gap.
    console.warn('webhook-whatsapp: WHATSAPP_APP_SECRET not set, skipping signature verification (insecure, temporary)');
  }

  // Process fully BEFORE responding - Vercel can freeze/tear down the function the instant
  // the response is sent, so any `await` after res.json() here is not guaranteed to run
  // (this is exactly why messages were accepted but never actually saved). Per-entry
  // try/catch below still means one bad entry never blocks the rest or the final response.
  try {
    const payload = JSON.parse(rawBody.toString('utf8'));
    const conversations = await readJSON(KEY, []);
    let changed = false;

    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        const phoneNumberId = value.metadata && value.metadata.phone_number_id;

        for (const message of value.messages || []) {
          try {
            await handleInboundMessage(conversations, message, phoneNumberId);
            changed = true;
          } catch (err) {
            console.error('webhook-whatsapp: error processing message', err.message);
          }
        }

        for (const status of value.statuses || []) {
          try {
            handleStatusUpdate(conversations, status);
            changed = true;
          } catch (err) {
            console.error('webhook-whatsapp: error processing status', err.message);
          }
        }
      }
    }

    if (changed) await writeJSON(KEY, conversations);
  } catch (err) {
    console.error('webhook-whatsapp: error handling payload', err.message);
  }

  res.status(200).json({ ok: true });
};
