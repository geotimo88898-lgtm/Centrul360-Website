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
// A number connected from the WhatsApp Business app (coexistence, see _lib/whatsapp.js) also sends:
//   message_echoes  what reception wrote from the phone's app -> an outgoing message here
//   history         the app's past chats, once after connecting -> filled in, no unread, no push
//   state_sync      the app's contacts -> the names chats are shown with (data/whatsapp-contacts.json)
//
// Always responds 200 once the payload is accepted - Meta retries aggressively on anything
// else, and one bad message/status entry must never take the whole delivery down with it.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { normalizePhone } = require('./_lib/clients');
const { sendPush } = require('./_lib/push');

module.exports.config = { api: { bodyParser: false } };

const KEY = 'data/whatsapp-conversations.json';
const CONTACTS_KEY = 'data/whatsapp-contacts.json';
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
// (the numbers connected in Integrări → WhatsApp, see _lib/whatsapp.js; the Vercel variables still count)
const locationForPhoneNumberId = (phoneNumberId) => require('./_lib/whatsapp').cityForPhoneId(phoneNumberId);

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

// who hears a client's message on the phone: the owner, and reception of the clinic she wrote to
// (both receptions while the number isn't tied to a city)
async function pushMessages(fresh) {
  if (!fresh.length) return;
  const employees = (await readJSON('data/employees.json', [])).filter((e) => e.active !== false);
  for (const m of fresh) {
    const ids = ['admin'].concat(employees.filter((e) => e.role === 'admin' || (e.role === 'receptie' && (!m.location || !e.location || e.location === m.location))).map((e) => e.id));
    const text = m.text.length > 140 ? m.text.slice(0, 139) + '…' : m.text;
    await sendPush({ readJSON, writeJSON }, ids, { title: m.name + (m.location ? ' · ' + m.location : ''), body: (m.count > 1 ? '(' + m.count + ' mesaje) ' : '') + text, url: '/portal#mesaje', tag: 'msg-' + m.phone });
  }
}

// her name as the portal knows it: the client base first, then her newest lead (same phone)
async function knownName(phone) {
  const key = String(phone || '').replace(/\D/g, '').slice(-9);
  if (key.length < 9) return '';
  const clients = await readJSON('data/clients.json', []);
  const client = clients.find((c) => String(c.phone || '').replace(/\D/g, '').slice(-9) === key && c.name);
  if (client) return String(client.name).trim();
  const leads = await readJSON('data/leads.json', []);
  const lead = leads.filter((l) => String(l.phone || '').replace(/\D/g, '').slice(-9) === key && l.name)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (lead) return String(lead.name).trim();
  // the name it has in the clinic phone's contacts (WhatsApp Business app)
  const contacts = await readJSON(CONTACTS_KEY, {});
  const c = Object.keys(contacts || {}).find((p) => p.slice(-9) === key);
  return c ? String(contacts[c]).trim() : '';
}

async function handleInboundMessage(conversations, message, phoneNumberId) {
  const from = message && message.from;
  if (!from) return;
  const phone = normalizePhone(from) || from;
  // Meta sends a message again when our answer was slow: it counts once
  const dup = message.id && conversations.some((c) => (c.messages || []).some((m) => m.id === message.id));
  if (dup) return;
  const convo = findOrCreateConversation(conversations, phone);

  // Her name from the client base or her lead (only read: writing on WhatsApp doesn't make her a
  // client), the number itself while the portal doesn't know her.
  try {
    if (!convo.clientName || convo.clientName === phone) convo.clientName = (await knownName(phone)) || phone;
  } catch (err) {
    console.error('webhook-whatsapp: client resolution failed', err.message);
    if (!convo.clientName) convo.clientName = phone;
  }

  if (!convo.location) {
    const loc = await locationForPhoneNumberId(phoneNumberId);
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
  return { phone: convo.phone, name: convo.clientName || convo.phone, location: convo.location || '', text: textFor(message), count: convo.unreadCount };
}

// a message in its place by time (the app's history arrives after newer messages)
function insertMessage(convo, msg) {
  const msgs = convo.messages;
  let i = msgs.length;
  while (i > 0 && String(msgs[i - 1].timestamp) > msg.timestamp) i--;
  msgs.splice(i, 0, msg);
  if (!convo.lastMessageAt || msg.timestamp > convo.lastMessageAt) convo.lastMessageAt = msg.timestamp;
}
const seen = (conversations, id) => !!id && conversations.some((c) => (c.messages || []).some((m) => m.id === id));
const tsOf = (t) => (t ? new Date(Number(t) * 1000).toISOString() : nowISO());

// one chat of the clinic's phone app (an echo or a history message), never counted as unread
async function addFromApp(conversations, clientWaId, message, direction, phoneNumberId, status, answered) {
  if (!clientWaId || !message || seen(conversations, message.id)) return false;
  const phone = normalizePhone(clientWaId) || clientWaId;
  const convo = findOrCreateConversation(conversations, phone);
  if (!convo.clientName || convo.clientName === phone) {
    try { convo.clientName = (await knownName(phone)) || phone; } catch (err) { if (!convo.clientName) convo.clientName = phone; }
  }
  if (!convo.location) { const loc = await locationForPhoneNumberId(phoneNumberId); if (loc) convo.location = loc; }
  if (!convo.messages.length) convo.lastMessageAt = ''; // a chat that starts with its history
  insertMessage(convo, {
    id: message.id || crypto.randomUUID(), direction, type: message.type === 'text' ? 'text' : 'other', text: textFor(message),
    status: direction === 'in' ? 'received' : status || 'sent', timestamp: tsOf(message.timestamp), sentBy: null,
    sentByName: direction === 'out' ? 'din aplicație' : undefined,
  });
  if (answered) convo.unreadCount = 0; // reception answered from the phone: the chat is read
  return true;
}

// the app's contacts: their names, for chats the portal doesn't know by a lead or client
async function handleStateSync(conversations, items) {
  const contacts = await readJSON(CONTACTS_KEY, {});
  let changedContacts = false, changedConvos = false;
  for (const it of items) {
    const c = it && it.type === 'contact' && it.contact;
    if (!c || !c.phone_number) continue;
    const phone = normalizePhone(c.phone_number) || String(c.phone_number).replace(/\D/g, '');
    if (it.action === 'remove') { if (contacts[phone]) { delete contacts[phone]; changedContacts = true; } continue; }
    const name = String(c.full_name || c.first_name || '').trim();
    if (!name) continue;
    contacts[phone] = name; changedContacts = true;
    const key = String(phone).replace(/\D/g, '').slice(-9);
    conversations.filter((x) => String(x.phone).replace(/\D/g, '').slice(-9) === key && (!x.clientName || x.clientName === x.phone))
      .forEach((x) => { x.clientName = name; changedConvos = true; });
  }
  if (changedContacts) await writeJSON(CONTACTS_KEY, contacts);
  return changedConvos;
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

  // the WhatsApp app's secret, saved in Integrări or set in Vercel (either one may have signed it)
  const secrets = await require('./_lib/whatsapp').webhookSecrets().catch(() => [process.env.WHATSAPP_APP_SECRET].filter(Boolean));
  const signatureHeader = req.headers['x-hub-signature-256'];
  if (secrets.length) {
    if (!secrets.some((sec) => isValidSignature(rawBody, signatureHeader, sec))) {
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
    const fresh = new Map(); // the newest message per client, for the phones

    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        const phoneNumberId = value.metadata && value.metadata.phone_number_id;

        for (const message of value.messages || []) {
          try {
            const m = await handleInboundMessage(conversations, message, phoneNumberId);
            if (m) fresh.set(m.phone, m);
            changed = true;
          } catch (err) {
            console.error('webhook-whatsapp: error processing message', err.message);
          }
        }

        // what reception wrote from the WhatsApp Business app on the phone
        for (const echo of value.message_echoes || []) {
          try { if (await addFromApp(conversations, echo.to, echo, 'out', phoneNumberId, '', true)) changed = true; } catch (err) {
            console.error('webhook-whatsapp: error processing echo', err.message);
          }
        }
        // the app's past chats, in chunks
        for (const h of value.history || []) {
          for (const thread of h.threads || []) {
            for (const msg of thread.messages || []) {
              try {
                const dir = String(msg.from || '') === String(thread.id) ? 'in' : 'out';
                const st = msg.history_context && msg.history_context.status ? String(msg.history_context.status).toLowerCase() : '';
                if (await addFromApp(conversations, thread.id, msg, dir, phoneNumberId, st)) changed = true;
              } catch (err) {
                console.error('webhook-whatsapp: error processing history', err.message);
              }
            }
          }
        }
        if ((value.state_sync || []).length) {
          try { if (await handleStateSync(conversations, value.state_sync)) changed = true; } catch (err) {
            console.error('webhook-whatsapp: error processing contacts', err.message);
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
    // before answering Meta: once the response is sent the function may be stopped
    try { await pushMessages([...fresh.values()]); } catch (err) { console.error('webhook-whatsapp: push failed', err.message); }
  } catch (err) {
    console.error('webhook-whatsapp: error handling payload', err.message);
  }

  res.status(200).json({ ok: true });
};
