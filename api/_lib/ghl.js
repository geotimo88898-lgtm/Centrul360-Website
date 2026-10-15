// HighLevel (GHL, LeadConnector) → the portal: everything the clinic had there, moved once (and again, for what
// came in since: nothing is copied twice). The clinic has two GHL sub-accounts, Timișoara and Arad; for each, the
// owner makes a Private Integration (Settings → Private Integrations, read-only scopes) and pastes its token and
// Location ID in Admin → Integrări → HighLevel. A person in both is one contact here.
//
//   contacts       → Contacte (data/clients.json), matched by GHL id, then phone, then email
//   notes          → the contact's Mențiuni (data/contacts/<id>.json), with their date and author
//   conversations  → the contact's Istoric: WhatsApp, SMS, email, Facebook, Instagram … (detail.history)
//   appointments   → the Calendar (data/appointments.json), on the city / category / cosmetician of the mapping;
//                    written as they are: no automation runs for them (no confirmation, no reminder)
//
// The import runs in steps (each under a minute), driven by the open Integrări page; it can stop and go on
// from where it was. data/ghl-connection.json { accounts: { tm|ar: { locationId, token, calendars, users, mapping } } }
// (the tokens never leave the server) · data/ghl-import.json { status, accs: { tm|ar: { phase, cursor, queue, pos } }, counts }.
// API: services.leadconnectorhq.com (developers' docs: github.com/GoHighLevel/highlevel-api-docs).

const crypto = require('crypto');
const { normalizePhone } = require('./clients');

const BASE = 'https://services.leadconnectorhq.com';
const CONN = 'data/ghl-connection.json';
const JOB = 'data/ghl-import.json';
const V_CONTACTS = '2021-07-28', V_CAL = '2021-04-15', V_CONV = '2021-04-15';

class GhlError extends Error { constructor(code, status, message) { super(message || code); this.code = code; this.status = status || 0; } }

// at most ~8 calls a second (GHL allows 100 per 10 s), waiting when it says so (429)
let last = 0;
const SPACING = Number(process.env.GHL_SPACING_MS || 125); // ms between calls (a test sets 0)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(conn, path, version, opts) {
  opts = opts || {};
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = last + SPACING - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const r = await fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + conn.token, Version: version, Accept: 'application/json' }, opts.body ? { 'Content-Type': 'application/json' } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (r.status === 429 || r.status >= 500) { await sleep(Math.min(8000, (Number(r.headers.get('retry-after')) || 2) * 1000 * (attempt + 1))); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new GhlError(r.status === 401 ? 'ghl_auth' : r.status === 403 ? 'ghl_scope' : r.status === 404 ? 'ghl_not_found' : 'ghl_failed', r.status, String(j.message || j.error || '').slice(0, 200));
    return j;
  }
  throw new GhlError('ghl_busy', 429, 'HighLevel e ocupat');
}
const q = (o) => '?' + new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

// ------------------------------------------------------------------ what GHL has
async function listCalendars(conn) {
  const j = await call(conn, '/calendars/' + q({ locationId: conn.locationId }), V_CAL);
  return (j.calendars || []).map((c) => ({ id: c.id, name: String(c.name || '').slice(0, 120), active: c.isActive !== false }));
}
async function listUsers(conn) {
  const j = await call(conn, '/users/' + q({ locationId: conn.locationId }), V_CONTACTS);
  return (j.users || []).map((u) => ({ id: u.id, name: String(u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '').slice(0, 120) }));
}
async function contactsPage(conn, cursor) {
  const j = await call(conn, '/contacts/' + q({ locationId: conn.locationId, limit: 100, startAfterId: cursor && cursor.startAfterId, startAfter: cursor && cursor.startAfter }), V_CONTACTS);
  const list = j.contacts || [];
  const meta = j.meta || {};
  const next = list.length === 100 && (meta.startAfterId || list[list.length - 1].id)
    ? { startAfterId: meta.startAfterId || list[list.length - 1].id, startAfter: meta.startAfter || (list[list.length - 1].dateAdded ? Date.parse(list[list.length - 1].dateAdded) : undefined) } : null;
  return { list, next, total: meta.total || j.total || j.count || 0 };
}
const notesOf = (conn, id) => call(conn, '/contacts/' + encodeURIComponent(id) + '/notes', V_CONTACTS).then((j) => j.notes || []);
const apptsOf = (conn, id) => call(conn, '/contacts/' + encodeURIComponent(id) + '/appointments', V_CONTACTS).then((j) => j.events || []);
async function conversationsOf(conn, id) {
  const j = await call(conn, '/conversations/search' + q({ locationId: conn.locationId, contactId: id, limit: 50 }), V_CONV);
  return j.conversations || [];
}
// a conversation's messages, newest first, at most `max`
async function messagesOf(conn, convId, max) {
  const out = [];
  let lastId = '';
  for (let page = 0; page < 20 && out.length < max; page++) {
    const j = await call(conn, '/conversations/' + encodeURIComponent(convId) + '/messages' + q({ limit: 100, lastMessageId: lastId }), V_CONV);
    const box = j.messages && !Array.isArray(j.messages) ? j.messages : j; // { messages: { lastMessageId, nextPage, messages: [] } }
    const list = Array.isArray(box.messages) ? box.messages : [];
    list.forEach((m) => out.push(m));
    if (!box.nextPage || !box.lastMessageId || !list.length) break;
    lastId = box.lastMessageId;
  }
  return out.slice(0, max);
}

// ------------------------------------------------------------------ into the portal's shapes
const text = (s, n) => String(s == null ? '' : s).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, n || 4000);
const fullName = (c) => String(c.contactName || c.name || [c.firstName, c.lastName].filter(Boolean).join(' ') || '').replace(/\s+/g, ' ').trim();
const CHANNEL = { TYPE_WHATSAPP: 'whatsapp', TYPE_ACTIVITY_WHATSAPP: 'whatsapp', TYPE_SMS: 'sms', TYPE_CAMPAIGN_SMS: 'sms', TYPE_CUSTOM_SMS: 'sms', TYPE_CUSTOM_PROVIDER_SMS: 'sms', TYPE_CAMPAIGN_MANUAL_SMS: 'sms',
  TYPE_EMAIL: 'email', TYPE_CAMPAIGN_EMAIL: 'email', TYPE_CUSTOM_EMAIL: 'email', TYPE_CUSTOM_PROVIDER_EMAIL: 'email', TYPE_FACEBOOK: 'facebook', TYPE_CAMPAIGN_FACEBOOK: 'facebook', TYPE_FACEBOOK_COMMENT: 'facebook',
  TYPE_INSTAGRAM: 'instagram', TYPE_INSTAGRAM_COMMENT: 'instagram', TYPE_CALL: 'call', TYPE_CAMPAIGN_CALL: 'call', TYPE_IVR_CALL: 'call', TYPE_CUSTOM_CALL: 'call', TYPE_CAMPAIGN_MANUAL_CALL: 'call',
  TYPE_WEBCHAT: 'chat', TYPE_LIVE_CHAT: 'chat', TYPE_INTERNAL_COMMENT: 'comment', TYPE_FORM_SUBMISSION: 'form', TYPE_GMB: 'google', TYPE_TIKTOK: 'tiktok' };
const channelOf = (m) => CHANNEL[m.messageType] || (typeof m.type === 'string' ? CHANNEL[m.type] : '') || 'other';
// the activity lines GHL keeps in a conversation ("appointment booked", "opportunity moved") aren't messages
const isActivity = (m) => /^TYPE_ACTIVITY_(?!WHATSAPP)/.test(m.messageType || '') || m.messageType === 'TYPE_LIVE_CHAT_INFO_MESSAGE';

// "2026-10-15T10:30:00+03:00" (or ms) → { date, time } in Bucharest
function local(ts) {
  const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
  if (!Number.isFinite(d.getTime())) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return { date: p.year + '-' + p.month + '-' + p.day, time: (p.hour === '24' ? '00' : p.hour) + ':' + p.minute };
}
// GHL status → the portal's (no "no show" there: cancelled, marked noShow)
function statusOf(e, startMs) {
  const s = String(e.appointmentStatus || e.status || '').toLowerCase();
  if (s === 'cancelled' || s === 'canceled' || s === 'invalid') return { status: 'anulata' };
  if (s === 'noshow' || s === 'no_show') return { status: 'anulata', noShow: true };
  if (s === 'showed' || s === 'completed') return { status: 'finalizata' };
  if (startMs < Date.now() - 6 * 3600e3) return { status: 'finalizata' }; // past and never cancelled
  return { status: s === 'confirmed' ? 'confirmata' : 'programata' };
}
// a guess for each calendar: the city in its name (else the sub-account's city) and the category from the treatments in it
function guessCalendar(name, city0) {
  const n = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const city = /arad/.test(n) ? 'Arad' : /timi/.test(n) ? 'Timișoara' : city0 || 'Timișoara';
  const category = /epil|laser/.test(n) ? 'epilare-laser' : /facial|fata|hifu|antirid|microneedl|hidrat|sebum|ten\b|riduri|rf sculpt/.test(n) ? 'faciale' : 'corporale';
  return { city, category, skip: false };
}
const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
function guessUser(name, employees) {
  const n = plain(name);
  if (!n) return '';
  const first = n.split(' ')[0];
  const e = employees.find((x) => plain(x.name) === n) || employees.find((x) => plain(x.name).split(' ')[0] === first);
  return e ? e.id : '';
}

module.exports = { BASE, CONN, JOB, GhlError, call, listCalendars, listUsers, contactsPage, notesOf, apptsOf, conversationsOf, messagesOf, text, fullName, channelOf, isActivity, local, statusOf, guessCalendar, guessUser, normalizePhone, uid: () => crypto.randomUUID() };
