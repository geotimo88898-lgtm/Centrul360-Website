// /api/portal-whatsapp, "Mesaje" tab: a WhatsApp inbox inside the portal. Action-routed,
// same convention as portal-attendance.js / portal-leave.js.
//
//   list   -> every conversation (any authenticated employee), lightest payload: last
//             message preview + unreadCount, sorted by lastMessageAt descending.
//   thread -> { phone } full message history for one conversation; marks it read.
//   send   -> { phone, text } sends a free-text message via the WhatsApp Cloud API, only
//             inside Meta's 24h customer-service window (last INBOUND message < 24h ago).
//
// Data: data/whatsapp-conversations.json (see api/webhook-whatsapp.js for the inbound side).

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const { sendWhatsApp, toE164 } = require('./_lib/whatsapp');

const KEY = 'data/whatsapp-conversations.json';
const WINDOW_MS = 24 * 60 * 60 * 1000;
const nowISO = () => new Date().toISOString();

function lastInboundAt(convo) {
  const inbound = (convo.messages || []).filter((m) => m.direction === 'in');
  if (!inbound.length) return null;
  return inbound.reduce((latest, m) => (m.timestamp > latest ? m.timestamp : latest), inbound[0].timestamp);
}

function within24h(convo) {
  const last = lastInboundAt(convo);
  if (!last) return false;
  return Date.now() - new Date(last).getTime() < WINDOW_MS;
}

function lastMessage(convo) {
  const msgs = convo.messages || [];
  return msgs.length ? msgs[msgs.length - 1] : null;
}

function listItem(convo) {
  const last = lastMessage(convo);
  return {
    phone: convo.phone,
    clientName: convo.clientName || convo.phone,
    location: convo.location || '',
    lastMessageAt: convo.lastMessageAt || '',
    unreadCount: convo.unreadCount || 0,
    lastText: last ? last.text : '',
    lastDirection: last ? last.direction : '',
    within24h: within24h(convo),
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;
  const body = req.body || {};
  const { action } = body;
  const fail = (code, error) => res.status(code).json({ error });

  try {
    if (action === 'list') {
      const conversations = await readJSON(KEY, []);
      const list = conversations
        .map(listItem)
        .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : a.lastMessageAt > b.lastMessageAt ? -1 : 0));
      res.status(200).json({ ok: true, conversations: list });
      return;
    }

    if (action === 'thread') {
      const phone = String(body.phone || '').trim();
      if (!phone) return fail(400, 'invalid_phone');
      const conversations = await readJSON(KEY, []);
      const convo = conversations.find((c) => c.phone === phone);
      if (!convo) return fail(404, 'conversation_not_found');
      if (convo.unreadCount) {
        convo.unreadCount = 0;
        await writeJSON(KEY, conversations);
      }
      res.status(200).json({
        ok: true,
        phone: convo.phone,
        clientName: convo.clientName || convo.phone,
        location: convo.location || '',
        within24h: within24h(convo),
        messages: convo.messages || [],
      });
      return;
    }

    if (action === 'send') {
      const phone = String(body.phone || '').trim();
      const text = String(body.text || '').trim().slice(0, 4000);
      if (!phone) return fail(400, 'invalid_phone');
      if (!text) return fail(400, 'missing_text');
      if (!toE164(phone)) return fail(400, 'invalid_phone');

      const conversations = await readJSON(KEY, []);
      const convo = conversations.find((c) => c.phone === phone);
      if (!convo) return fail(404, 'conversation_not_found');
      if (!within24h(convo)) return fail(409, 'outside_24h_window');

      // the answer leaves from the number she wrote to (Timișoara / Arad)
      const result = await sendWhatsApp({ phone, text, from: convo.location || '' });
      if (!result.sent) return fail(502, 'send_failed');

      convo.messages.push({
        id: result.id || crypto.randomUUID(),
        direction: 'out',
        type: 'text',
        text,
        status: 'sent',
        timestamp: nowISO(),
        sentBy: session.employeeId,
      });
      convo.lastMessageAt = nowISO();
      await writeJSON(KEY, conversations);
      res.status(200).json({ ok: true, messages: convo.messages });
      return;
    }

    fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-whatsapp error:', err.message);
    res.status(500).json({ error: 'whatsapp_failed' });
  }
};
