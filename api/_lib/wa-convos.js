// The WhatsApp conversations are written by several hands at once: the portal sending a message, Meta's webhook with
// her replies and the messages' statuses (which comes a moment after a send), the automations. Each read the whole file
// and wrote its copy back, so a copy read a second before overwrote what another just saved (26.10: a message sent
// from the portal vanished, the status of it saved over it). Now each copy is merged into the newest file: messages by
// id (the furthest status wins), conversations by phone; none is ever dropped.

const { readJSON, writeJSON } = require('./store');

const KEY = 'data/whatsapp-conversations.json';
const RANK = { failed: 0, sent: 1, delivered: 2, read: 3 };
const later = (a, b) => (String(a || '') > String(b || '') ? a : b);

function mergeMsg(f, c) {
  const m = Object.assign({}, f, c);
  if ((RANK[f.status] || 0) > (RANK[c.status] || 0) && c.status !== 'failed') m.status = f.status;
  return m;
}
function mergeConvo(f, c) {
  const theirs = new Map((f.messages || []).map((m) => [m.id, m]));
  const messages = (c.messages || []).map((m) => (theirs.has(m.id) ? mergeMsg(theirs.get(m.id), m) : m));
  const mine = new Set(messages.map((m) => m.id));
  (f.messages || []).forEach((m) => { if (!mine.has(m.id)) messages.push(m); });
  messages.sort((a, b) => (String(a.timestamp || '') < String(b.timestamp || '') ? -1 : String(a.timestamp || '') > String(b.timestamp || '') ? 1 : 0));
  return Object.assign({}, f, c, { messages, lastMessageAt: later(f.lastMessageAt, c.lastMessageAt) });
}

// writes this copy merged into the newest file; returns what was written
async function saveConversations(mine) {
  const fresh = await readJSON(KEY, []);
  const byPhone = new Map(fresh.map((c) => [c.phone, c]));
  const out = mine.map((c) => { const f = byPhone.get(c.phone); byPhone.delete(c.phone); return f ? mergeConvo(f, c) : c; });
  byPhone.forEach((c) => out.push(c)); // started by someone else meanwhile
  await writeJSON(KEY, out);
  return out;
}

module.exports = { KEY, saveConversations, mergeConvo };
