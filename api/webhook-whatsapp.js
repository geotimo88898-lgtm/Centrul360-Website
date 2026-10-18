// /api/webhook-whatsapp - Meta calls this directly, no portal auth (same shape as
// api/webhook-facebook-leads.js, see that file's header comment for the general pattern).
//
// GET  -> Meta's webhook verification handshake: the verify token the portal made when a number was
//         connected (data/whatsapp-config.json, see _lib/wa-connect.js), or WHATSAPP_WEBHOOK_VERIFY_TOKEN.
// POST -> inbound client messages + delivery/read status updates for the WhatsApp Cloud API.
//         Body signature is verified against the RAW bytes (HMAC-SHA256) with our Meta app's secret
//         (Integrări → Facebook, the app that now also connects WhatsApp) or WHATSAPP_APP_SECRET.
//         Automatic JSON body parsing is disabled below so the raw bytes are available for the check.
//
// A number connected from the WhatsApp Business app (coexistence, see _lib/whatsapp.js) also sends:
//   message_echoes  what reception wrote from the phone's app -> an outgoing message here
//   history         the app's past chats, once after connecting -> filled in, no unread, no push
//   state_sync      the app's contacts -> the names chats are shown with (data/whatsapp-contacts.json)
//
// Always responds 200 once the payload is accepted - Meta retries aggressively on anything
// else, and one bad message/status entry must never take the whole delivery down with it.

const crypto = require('crypto');
const { readJSON, writeJSON, writeBinary } = require('./_lib/store');
const { normalizePhone, ensureContacts } = require('./_lib/clients');
const { sendPush } = require('./_lib/push');
const { appCreds } = require('./_lib/facebook');

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
  // a photo, a PDF, a voice note: its caption, else what it is (the file itself shows in Mesaje)
  const media = type && message[type];
  if (media && MEDIA_TYPES.includes(type)) return media.caption || (type === 'document' && media.filename ? media.filename : MEDIA_LABEL[type]);
  return '[tip mesaj: ' + (type || 'necunoscut') + ']';
}
const MEDIA_TYPES = ['image', 'document', 'audio', 'video', 'sticker'];
const MEDIA_LABEL = { image: 'Poză', document: 'Document', audio: 'Mesaj vocal', video: 'Video', sticker: 'Sticker' };
// her file, kept in the portal (Meta's copy expires): { path, mime, filename } on the message
async function keepMedia(message, phoneNumberId) {
  const type = message && message.type;
  const m = type && message[type];
  if (!m || !MEDIA_TYPES.includes(type) || !m.id) return null;
  const WAL = require('./_lib/whatsapp');
  const got = await WAL.fetchMedia(phoneNumberId, m.id).catch(() => null);
  const mime = (got && got.mime) || m.mime_type || '';
  const out = { kind: type === 'sticker' ? 'image' : type, mime, filename: m.filename || '' };
  const ext = WAL.mediaExt(mime);
  if (!got || got.tooBig || !got.buf || !ext) return Object.assign(out, { missing: true });
  const path = 'wa-media/' + String(message.id || crypto.randomUUID()).replace(/[^\w-]/g, '').slice(-60) + '.' + ext;
  await writeBinary(path, got.buf, mime);
  return Object.assign(out, { path });
}

// A client's message rings on the phones (the owner, 18.10): "Mesaj de la NUME", the message itself under it.
// Who hears it: the owner, and reception of the clinic she wrote to (both receptions while the number isn't tied to a city).
async function pushMessages(fresh) {
  if (!fresh.length) return;
  const employees = (await readJSON('data/employees.json', [])).filter((e) => e.active !== false);
  for (const m of fresh) {
    const ids = ['admin'].concat(employees.filter((e) => e.role === 'admin' || (e.role === 'receptie' && (!m.location || !e.location || e.location === m.location))).map((e) => e.id));
    const text = m.text.length > 160 ? m.text.slice(0, 159) + '…' : m.text;
    await sendPush({ readJSON, writeJSON }, ids, { title: 'Mesaj de la ' + m.name, body: text, url: '/#mesaje', tag: 'msg-' + m.phone });
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

async function handleInboundMessage(conversations, message, phoneNumberId, contacts) {
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
  // a number the portal doesn't know becomes a contact (Contacte), with her WhatsApp name if she has one
  try {
    const wa = (contacts || []).find((c) => c && String(c.wa_id) === String(from)) || (contacts || [])[0];
    const waName = wa && wa.profile && wa.profile.name ? String(wa.profile.name).trim() : '';
    if (await ensureContacts([{ phone, name: waName, location: convo.location || '' }], { readJSON, writeJSON })) {
      if (waName && (!convo.clientName || convo.clientName === phone)) convo.clientName = waName;
    }
  } catch (err) { console.error('webhook-whatsapp: contact', err.message); }

  const type = message.type === 'text' ? 'text' : 'other';
  const ts = message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : nowISO();
  const media = await keepMedia(message, phoneNumberId).catch((err) => { console.error('webhook-whatsapp: media', err.message); return null; });
  convo.messages.push({
    id: message.id || crypto.randomUUID(),
    direction: 'in',
    type,
    ...(media ? { media } : {}),
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

// A state never goes back (Meta can send "delivered" after "read"); a failure keeps Meta's reason, in
// words the front desk understands, and is collected for the UNDELIVERED alert.
const RANK = { sent: 1, delivered: 2, read: 3 };
const WHY = {
  131026: 'numărul nu are WhatsApp sau nu poate primi mesaje', 131049: 'Meta nu l-a livrat (limita de mesaje de marketing pentru clientă)',
  131050: 'clienta a oprit mesajele de marketing', 131047: 'au trecut 24h de la ultimul ei mesaj, trebuie un șablon',
  130472: 'Meta nu l-a livrat (un test al Meta pe numărul ei)', 131042: 'problemă cu plata în contul WhatsApp',
  131056: 'prea multe mesaje către același număr, mai încearcă peste puțin', 131051: 'tip de mesaj nesuportat', 131053: 'fișierul nu a putut fi trimis',
};
function handleStatusUpdate(conversations, status, failed) {
  const id = status && status.id;
  if (!id) return;
  const st = String((status && status.status) || '');
  const at = status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString();
  for (const convo of conversations) {
    const msg = convo.messages.find((m) => m.id === id);
    if (!msg) continue;
    if (msg.status === 'failed') return;
    if (st === 'failed') {
      const e = (status.errors || [])[0] || {};
      msg.status = 'failed'; msg.failedAt = at; msg.errorCode = e.code || '';
      msg.error = WHY[e.code] || (e.error_data && e.error_data.details) || e.title || e.message || 'Meta nu l-a livrat';
      if (failed) failed.push({ convo, msg });
      return;
    }
    if ((RANK[st] || 0) > (RANK[msg.status] || 0)) msg.status = st;
    if (st === 'delivered' && !msg.deliveredAt) msg.deliveredAt = at;
    if (st === 'read') { if (!msg.readAt) msg.readAt = at; if (!msg.deliveredAt) msg.deliveredAt = at; }
    return;
  }
  // No matching outbound message found (e.g. sent before this feature existed), nothing to update.
}

// a message that didn't reach her: the admin and her city's front desk hear it at once (bell + phone)
async function alertUndelivered(list) {
  if (!list.length) return;
  const { notifyMany } = require('./_lib/notify');
  const employees = (await readJSON('data/employees.json', [])).filter((e) => e.active !== false);
  for (const { convo, msg } of list) {
    const ids = ['admin'].concat(employees.filter((e) => e.role === 'admin' || (e.role === 'receptie' && (!convo.location || !e.location || e.location === convo.location))).map((e) => e.id));
    const who = convo.clientName || ('+' + convo.phone);
    const said = String(msg.text || '').replace(/\s+/g, ' ').slice(0, 60);
    await notifyMany({ readJSON, writeJSON }, ids, { kind: 'alert', tone: 'bad', title: 'MESAJ NELIVRAT ❌ - ' + who, text: msg.error + (said ? ' · „' + said + '”' : ''), go: 'mesaje', tag: 'undelivered-' + msg.id });
  }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query || {};
    const saved = ((await readJSON('data/whatsapp-config.json', null)) || {}).verifyToken;
    const expected = [saved, process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN].filter(Boolean);
    if (!expected.length || mode !== 'subscribe' || !expected.includes(token)) {
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

  // Who may have signed it: the WhatsApp app (saved in Integrări or WHATSAPP_APP_SECRET in Vercel) or
  // our Meta app (Integrări → Facebook), which connects numbers through the Facebook login. Once a
  // WhatsApp app is saved, a delivery none of them signed is refused; before that, one they can't
  // check is still taken (a number wired through another app keeps its messages coming in).
  const waSecrets = await require('./_lib/whatsapp').webhookSecrets().catch(() => [process.env.WHATSAPP_APP_SECRET].filter(Boolean));
  const creds = await appCreds(readJSON).catch(() => ({}));
  const secrets = waSecrets.concat(creds && creds.appSecret ? [creds.appSecret] : []);
  const signed = secrets.some((sec) => isValidSignature(rawBody, req.headers['x-hub-signature-256'], sec));
  // Meta's last delivery, for Integrări → WhatsApp → Verifică (does anything reach us, was it taken)
  const noteDelivery = async (taken) => {
    try {
      const k = 'data/whatsapp-hook.json', h = (await readJSON(k, null)) || {}, now = nowISO();
      Object.assign(h, { at: now, signed }, taken ? { okAt: now } : { refusedAt: now });
      await writeJSON(k, h);
    } catch (e) { /* only a note */ }
  };
  if (!signed) {
    if (waSecrets.length) {
      await noteDelivery(false);
      res.status(403).json({ error: 'invalid_signature' });
      return;
    }
    console.warn('webhook-whatsapp: signature not checked (no saved secret matches the sending app)');
  }

  await noteDelivery(true);

  // Process fully BEFORE responding - Vercel can freeze/tear down the function the instant
  // the response is sent, so any `await` after res.json() here is not guaranteed to run
  // (this is exactly why messages were accepted but never actually saved). Per-entry
  // try/catch below still means one bad entry never blocks the rest or the final response.
  try {
    const payload = JSON.parse(rawBody.toString('utf8'));
    const conversations = await readJSON(KEY, []);
    let changed = false;
    const fresh = new Map(); // the newest message per client, for the phones
    const failed = []; // messages Meta couldn't deliver, for the UNDELIVERED alert

    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        const phoneNumberId = value.metadata && value.metadata.phone_number_id;

        for (const message of value.messages || []) {
          try {
            const m = await handleInboundMessage(conversations, message, phoneNumberId, value.contacts);
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
            handleStatusUpdate(conversations, status, failed);
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
    try { await alertUndelivered(failed); } catch (err) { console.error('webhook-whatsapp: undelivered alert failed', err.message); }
  } catch (err) {
    console.error('webhook-whatsapp: error handling payload', err.message);
  }

  res.status(200).json({ ok: true });
};
