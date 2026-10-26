// /api/portal-whatsapp, "Mesaje" tab: the WhatsApp inbox inside the portal (both clinic numbers,
// Timișoara and Arad). Action-routed, same convention as portal-attendance.js / portal-leave.js.
//
//   list          -> every conversation (any authenticated employee), lightest payload: last message
//                    preview + unreadCount, sorted by lastMessageAt descending; plus which numbers are
//                    connected and the approved templates (for answering after 24h / writing first).
//   thread        -> { phone } full message history for one conversation; marks it read; the lead /
//                    client with that phone, if any.
//   send          -> { phone, text } a free-text answer, only inside Meta's 24h customer-service window
//                    (last INBOUND message < 24h ago), from the number she wrote to.
//   send_template -> { phone, templateId, name?, location? } an approved template, the client's details
//                    filled in (from her lead / appointment); also starts a new conversation.
//   snip_save     -> { snippet: { id?, title, text } } a quick answer the whole team shares (snippet)
//   snip_delete   -> { id }
//
// Data: data/whatsapp-conversations.json (see api/webhook-whatsapp.js for the inbound side).

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { saveConversations } = require('./_lib/wa-convos');
const { requireAuth } = require('./_lib/auth');
const WA = require('./_lib/whatsapp');
const WT = require('./_lib/wa-templates');
// a template message without its picture (saved before pictures were kept): the template's picture
const withPic = (m, pics) => (m.type === 'template' && m.templateId && !m.media && pics.get(m.templateId) ? Object.assign({}, m, { media: { kind: 'image', mime: 'image/jpeg', filename: 'poza.jpg', path: pics.get(m.templateId) } }) : m);
// a template message as the client saw it: its buttons, and the clinic's map pin (the city from the pin line, the
// template's name or the conversation)
function withTpl(m, tpls, convoCity) {
  if (m.type !== 'template' || !m.templateId) return m;
  const t = tpls.get(m.templateId);
  if (!t) return m;
  const out = Object.assign({}, m);
  const btns = (t.buttons || []).map((b) => b.text).filter(Boolean);
  if (btns.length && !out.buttons) out.buttons = btns;
  if (t.headerType === 'LOCATION' && !out.pin) {
    const said = /📍 Locația clinicii \(([^)]+)\)/.exec(m.text || '');
    const city = (said && said[1]) || (/Arad/.test(t.label || '') ? 'Arad' : /Timi/.test(t.label || '') ? 'Timișoara' : convoCity);
    const c = WA.CLINICS[city] || WA.CLINICS[convoCity];
    if (c) out.pin = { name: c.name, address: c.address, lat: c.latitude, lng: c.longitude };
  }
  return out;
}
const { normalizePhone } = require('./_lib/clients');

const { sendWhatsApp, toE164 } = WA;
const { writeBinary } = require('./_lib/store');
const KEY = 'data/whatsapp-conversations.json';
const SNIP_KEY = 'data/wa-snippets.json'; // [{ id, title, text, by, createdAt, updatedAt, updatedBy }]
const WINDOW_MS = 24 * 60 * 60 * 1000;
const nowISO = () => new Date().toISOString();
const digits9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);

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
// until when she can get a free answer (ISO), '' when the window is closed
function windowEnds(convo) {
  const last = lastInboundAt(convo);
  return last && Date.now() - new Date(last).getTime() < WINDOW_MS ? new Date(new Date(last).getTime() + WINDOW_MS).toISOString() : '';
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
    lastStatus: last ? last.status : '',
    within24h: within24h(convo),
  };
}

// which clinic numbers are connected (nothing secret), and the templates approved for at least one
async function setup() {
  const [cfg, doc] = await Promise.all([WA.loadConfig(), WT.load()]);
  const ready = WA.readyNumbers(cfg);
  const numbers = {};
  WA.CITIES.forEach((c) => { const n = cfg.numbers[c] || {}; numbers[c] = { connected: ready.includes(c), display: n.display || '' }; });
  const templates = (doc.templates || []).map((t) => WT.view(t, cfg))
    .filter((t) => Object.values(t.cities || {}).some((s) => s === 'APPROVED'))
    .map((t) => ({ id: t.id, label: t.label, text: t.text, header: t.header || '', footer: t.footer || '', category: t.category, cities: t.cities, vars: t.map || [] }));
  return { numbers, templates, ready };
}

// what the portal knows about this phone: her lead, her next (or last) appointment
async function whoIs(phone) {
  const key = digits9(phone);
  if (key.length < 9) return {};
  const [leads, appts] = await Promise.all([readJSON('data/leads.json', []), readJSON('data/appointments.json', [])]);
  const lead = leads.filter((l) => digits9(l.phone) === key).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
  const mine = appts.filter((a) => digits9(a.clientPhone) === key && a.status !== 'anulata' && a.status !== 'concediu');
  const today = new Date().toISOString().slice(0, 10);
  const next = mine.filter((a) => a.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
  const last = mine.filter((a) => a.date < today).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
  return { lead, appointment: next || last || null };
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
  const fail = (code, error, message) => res.status(code).json(message ? { error, message } : { error });

  try {
    if (action === 'list') {
      const conversations = await readJSON(KEY, []);
      // the chats from before every writer became a contact: theirs now (once; nothing is written when all are known)
      await require('./_lib/clients').ensureContacts(conversations.filter((c) => (c.messages || []).some((m) => m.direction === 'in'))
        .map((c) => ({ phone: c.phone, name: c.clientName && c.clientName !== c.phone ? c.clientName : '', location: c.location || '' })), { readJSON, writeJSON }).catch(() => 0);
      const leads = await readJSON('data/leads.json', []);
      const names = new Map();
      leads.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).forEach((l) => { if (l.name && digits9(l.phone).length === 9) names.set(digits9(l.phone), String(l.name).trim()); });
      (await readJSON('data/clients.json', [])).forEach((c) => { if (c.name && digits9(c.phone).length === 9) names.set(digits9(c.phone), String(c.name).trim()); });
      const list = conversations
        .map((c) => (c.clientName && c.clientName !== c.phone ? c : Object.assign({}, c, { clientName: names.get(digits9(c.phone)) || c.phone })))
        .map(listItem)
        .sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : a.lastMessageAt > b.lastMessageAt ? -1 : 0));
      const s = await setup();
      res.status(200).json({ ok: true, conversations: list, numbers: s.numbers, templates: s.templates, snippets: await readJSON(SNIP_KEY, []) });
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
        await saveConversations(conversations);
      }
      const who = await whoIs(phone);
      if ((!convo.clientName || convo.clientName === convo.phone) && who.lead && who.lead.name) convo.clientName = who.lead.name;
      const employees = await readJSON('data/employees.json', []);
      const nameOf = (id) => (id === 'admin' ? 'Admin' : ((employees.find((e) => e.id === id) || {}).name || ''));
      // template messages saved before their picture was kept: the template's picture of now
      const tplList = (await WT.load()).templates || [];
      const tplPics = new Map(tplList.map((t) => [t.id, WT.imageOf(t)]).filter(([, p]) => p));
      const tplById = new Map(tplList.map((t) => [t.id, t]));
      res.status(200).json({
        ok: true,
        phone: convo.phone,
        clientName: convo.clientName || convo.phone,
        location: convo.location || '',
        within24h: within24h(convo),
        windowEnds: windowEnds(convo),
        messages: (convo.messages || []).map((m) => withTpl(withPic(m.sentBy ? Object.assign({}, m, { sentByName: nameOf(m.sentBy) }) : m, tplPics), tplById, convo.location || '')),
        lead: who.lead ? { id: who.lead.id, name: who.lead.name, interest: who.lead.interest || '' } : null,
        appointment: who.appointment ? { id: who.appointment.id, date: who.appointment.date, time: who.appointment.time, treatment: who.appointment.treatment || '' } : null,
      });
      return;
    }

    // snippets: the team's quick answers (anyone in Mesaje uses, adds and edits them)
    if (action === 'snip_save' || action === 'snip_delete') {
      const list = await readJSON(SNIP_KEY, []);
      if (action === 'snip_delete') {
        const next = list.filter((x) => x.id !== String(body.id || ''));
        await writeJSON(SNIP_KEY, next);
        res.status(200).json({ ok: true, snippets: next });
        return;
      }
      const s = body.snippet || {};
      const title = String(s.title || '').trim().slice(0, 60), text = String(s.text || '').trim().slice(0, 2000);
      if (!title || !text) return fail(400, 'invalid', 'Scrie un nume și textul.');
      let row = s.id ? list.find((x) => x.id === String(s.id)) : null;
      if (s.id && !row) return fail(404, 'not_found', 'Snippetul nu mai există.');
      if (!row) {
        if (list.length >= 200) return fail(400, 'too_many', 'Cel mult 200 de snippeturi.');
        row = { id: crypto.randomUUID().slice(0, 10), by: session.employeeId, createdAt: nowISO() };
        list.push(row);
      }
      Object.assign(row, { title, text, updatedAt: nowISO(), updatedBy: session.employeeId });
      await writeJSON(SNIP_KEY, list);
      res.status(200).json({ ok: true, snippets: list, savedId: row.id });
      return;
    }

    // a photo or a file to her (inside the 24h window, like a free answer), with an optional caption
    if (action === 'send_media') {
      const phone = String(body.phone || '').trim();
      const m = /^data:([\w.+/-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ''));
      if (!phone || !toE164(phone)) return fail(400, 'invalid_phone');
      if (!m) return fail(400, 'invalid_file', 'Fișierul nu a putut fi citit.');
      const mime = m[1].toLowerCase();
      const ext = WA.mediaExt(mime);
      if (!ext) return fail(400, 'invalid_file', 'Tipul ăsta de fișier nu se poate trimite pe WhatsApp (poze, PDF, Word, Excel, video, audio).');
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 3e6) return fail(400, 'too_big', 'Fișierul e prea mare (cel mult 3 MB).');
      const caption = String(body.caption || '').trim().slice(0, 1024);
      const filename = String(body.filename || '').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 120) || 'fisier.' + ext;
      const conversations = await readJSON(KEY, []);
      const convo = conversations.find((c) => c.phone === phone);
      if (!convo) return fail(404, 'conversation_not_found');
      if (!within24h(convo)) return fail(409, 'outside_24h_window', 'Au trecut 24 de ore de la ultimul ei mesaj: trimite un șablon.');
      const result = await WA.sendMedia({ phone, from: convo.location || '', buf, mime, filename, caption });
      if (!result.sent) return fail(502, 'send_failed', 'WhatsApp nu a trimis fișierul' + (result.error ? ': ' + result.error : '.'));
      const id = result.id || crypto.randomUUID();
      const path = 'wa-media/' + String(id).replace(/[^\w-]/g, '').slice(-60) + '.' + ext;
      await writeBinary(path, buf, mime);
      convo.messages.push({ id, direction: 'out', type: 'other', media: { kind: result.kind, mime, filename, path }, text: caption || (result.kind === 'image' ? 'Poză' : filename),
        status: 'sent', timestamp: nowISO(), sentBy: session.employeeId });
      convo.lastMessageAt = nowISO();
      await saveConversations(conversations);
      res.status(200).json({ ok: true, id });
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
      if (!within24h(convo)) return fail(409, 'outside_24h_window', 'Au trecut 24 de ore de la ultimul ei mesaj: trimite un șablon.');

      // the answer leaves from the number she wrote to (Timișoara / Arad)
      const result = await sendWhatsApp({ phone, text, from: convo.location || '' });
      if (!result.sent) return fail(502, 'send_failed', 'WhatsApp nu a trimis mesajul' + (result.error ? ': ' + result.error : '.'));

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
      await saveConversations(conversations);
      res.status(200).json({ ok: true, messages: convo.messages });
      return;
    }

    // an approved template: after 24h, or to write first (a new conversation)
    // "Trimite rezultatele" (Contacte → her before / after): the picture to her WhatsApp. Inside her 24h
    // window as a photo with the text; otherwise only with an approved results template (picture header).
    if (action === 'send_results') {
      const raw = String(body.phone || '').trim();
      const phone = normalizePhone(raw) || raw;
      if (!toE164(phone)) return fail(400, 'invalid_phone', 'Clienta nu are un număr de telefon corect.');
      const img = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl || ''));
      if (!img) return fail(400, 'invalid_file', 'Imaginea nu a putut fi citită.');
      const buf = Buffer.from(img[1], 'base64');
      if (buf.length > 3e6) return fail(400, 'too_big', 'Imaginea e prea mare.');
      const s = await setup();
      if (!s.ready.length) return fail(409, 'not_connected', 'WhatsApp nu e conectat încă (Integrări → WhatsApp).');
      const conversations = await readJSON(KEY, []);
      let convo = conversations.find((c) => c.phone === phone);
      const city = (s.ready.includes(body.location) ? body.location : '') || (convo && s.ready.includes(convo.location) ? convo.location : '') || s.ready[0];
      const cfg = await WA.loadConfig();
      const n = cfg.numbers[city];
      const doc = await WT.load();
      const all = (doc.templates || []).filter((t) => t.purpose === 'results');
      const tpl = all.find((t) => WT.approvedFor(t, n.wabaId)) || null;
      const name = String(body.name || (convo && convo.clientName !== convo.phone && convo.clientName) || '').trim().slice(0, 120);
      const treat = String(body.treatment || '').trim().slice(0, 150);
      const v = { prenume: require('./_lib/workflows').firstName(name), nume: name, tratament: treat || 'tratament', procedura: treat || 'tratament', interes: treat || 'tratament', locatie: city, telefon: phone };
      const fill = (t) => WT.friendly(t).replace(/\{(\w+)\}/g, (m, k) => v[k] || '');
      let r, text, type, templateId;
      if (convo && within24h(convo)) {
        text = all[0] ? fill(all[0]) : 'Rezultatele tale' + (treat ? ' după ' + treat : '') + ' 💛';
        r = await WA.sendMedia({ phone, from: city, buf, mime: 'image/jpeg', filename: 'rezultate.jpg', caption: text });
        type = 'other';
      } else {
        if (!tpl) return fail(409, 'not_approved', all.length
          ? 'Șablonul de rezultate „' + all[0].label + '” nu e aprobat încă pentru ' + city + '. Până atunci rezultatele pleacă doar dacă ți-a scris în ultimele 24h.'
          : 'Nu există încă un șablon pentru rezultate: în Integrări → Șabloane WhatsApp, cu antet Imagine și bifa „Trimite rezultatele”.');
        const up = await WA.uploadMedia(city, buf, 'image/jpeg', 'rezultate.jpg');
        if (up.error) return fail(502, 'send_failed', 'Imaginea nu a ajuns la Meta: ' + up.error);
        r = await sendWhatsApp({ phone, template: (tpl.meta[n.wabaId] || {}).name || tpl.name, language: tpl.language || 'ro', params: (tpl.map || []).map((k) => v[k] || '-'), from: city, headerImageId: up.id });
        text = fill(tpl); type = 'template'; templateId = tpl.id;
      }
      if (!r.sent) return fail(502, 'send_failed', 'WhatsApp nu a trimis rezultatele' + (r.error ? ': ' + r.error : '.'));
      if (!convo) { convo = { phone, clientName: name || phone, location: city, lastMessageAt: nowISO(), unreadCount: 0, messages: [] }; conversations.push(convo); }
      if (!convo.location) convo.location = city;
      const id = r.id || crypto.randomUUID();
      const path = 'wa-media/' + String(id).replace(/[^\w-]/g, '').slice(-60) + '.jpg';
      await writeBinary(path, buf, 'image/jpeg');
      convo.messages.push(Object.assign({ id, direction: 'out', type, media: { kind: 'image', mime: 'image/jpeg', filename: 'rezultate.jpg', path }, text, status: 'sent', timestamp: nowISO(), sentBy: session.employeeId }, templateId ? { templateId } : {}));
      convo.lastMessageAt = nowISO();
      await saveConversations(conversations);
      res.status(200).json({ ok: true, how: type === 'template' ? 'template' : 'photo', city });
      return;
    }

    if (action === 'send_template') {
      const raw = String(body.phone || '').trim();
      const phone = normalizePhone(raw) || raw;
      if (!toE164(phone)) return fail(400, 'invalid_phone', 'Numărul de telefon nu pare corect.');
      const s = await setup();
      if (!s.ready.length) return fail(409, 'not_connected', 'WhatsApp nu e conectat încă (Integrări → WhatsApp).');
      const conversations = await readJSON(KEY, []);
      let convo = conversations.find((c) => c.phone === phone);
      const who = await whoIs(phone);
      const city = (convo && convo.location) || (WA.CITIES.includes(body.location) ? body.location : '') ||
        (who.appointment && who.appointment.location) || (who.lead && who.lead.location) || s.ready[0];
      if (!s.ready.includes(city)) return fail(409, 'not_connected', 'Numărul de WhatsApp pentru ' + city + ' nu e conectat încă.');
      const doc = await WT.load();
      const tpl = (doc.templates || []).find((t) => t.id === body.templateId);
      if (!tpl) return fail(404, 'template_not_found', 'Șablonul nu mai există.');
      const cfg = await WA.loadConfig();
      const n = cfg.numbers[city];
      if (!WT.approvedFor(tpl, n.wabaId)) return fail(409, 'not_approved', 'Șablonul „' + tpl.label + '” nu e aprobat pentru numărul ' + city + '.');
      // her details, as the automations fill them
      const W = require('./_lib/workflows');
      const settings = (await W.loadDoc()).settings || {};
      const name = String(body.name || (convo && convo.clientName !== convo.phone && convo.clientName) || (who.lead && who.lead.name) || (who.appointment && who.appointment.clientName) || '').trim().slice(0, 120);
      const ctx = { lead: who.lead, appointment: who.appointment && Object.assign({ clientName: name }, who.appointment), clients: [] };
      if (!ctx.lead && !ctx.appointment) ctx.lead = { name, phone, location: city };
      const v = W.vars(ctx, settings);
      if (name) { v.prenume = name.split(/\s+/)[0]; v.nume = name; }
      v.locatie = v.locatie || city; v.adresa = (settings.addresses || {})[v.locatie] || v.adresa || v.locatie;
      const r = await sendWhatsApp({ phone, template: (tpl.meta[n.wabaId] || {}).name || tpl.name, language: tpl.language || 'ro', params: (tpl.map || []).map((k) => v[k] || '-'), from: city, headerImagePath: WT.imageOf(tpl), headerLocation: tpl.headerType === 'LOCATION' });
      if (!r.sent) return fail(502, 'send_failed', 'WhatsApp nu a trimis șablonul' + (r.error ? ': ' + r.error : '.'));
      if (!convo) {
        convo = { phone, clientName: name || phone, location: city, lastMessageAt: nowISO(), unreadCount: 0, messages: [] };
        conversations.push(convo);
      }
      if (!convo.location) convo.location = city;
      if (name && (!convo.clientName || convo.clientName === convo.phone)) convo.clientName = name;
      const text = WT.friendly(tpl).replace(/\{(\w+)\}/g, (m, k) => v[k] || '-');
      const img = WT.imageOf(tpl);
      convo.messages.push(Object.assign({ id: r.id || crypto.randomUUID(), direction: 'out', type: 'template', templateId: tpl.id, text: [tpl.header, text, tpl.footer].filter(Boolean).join('\n'), status: 'sent', timestamp: nowISO(), sentBy: session.employeeId },
        img ? { media: { kind: 'image', mime: 'image/jpeg', filename: 'poza.jpg', path: img } } : {}));
      convo.lastMessageAt = nowISO();
      await saveConversations(conversations);
      res.status(200).json({ ok: true, phone: convo.phone, messages: convo.messages });
      return;
    }

    fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-whatsapp error:', err.message);
    res.status(500).json({ error: 'whatsapp_failed' });
  }
};
