// POST /api/portal-contacts — "Contacte": every client and lead in one place (the clinic's own
// contact book, imported once from HighLevel), and per contact:
//   - Fișe & mențiuni: the client's paper sheet scanned with the phone camera (or any file), plus
//     short notes from the team;
//   - Poze înainte / după, organised by session (Ședința 1, 2, …): a before and an after photo per
//     session; the side-by-side images are composed in the browser (portal-contacts.js);
//   - Acord de publicare: whether the client agreed that her photos may be published.
//
// Storage: the contact itself lives in data/clients.json (same directory the calendar and the
// payments use, keyed by phone); its notes / files / sessions live in data/contacts/<id>.json and
// the files themselves as private blobs under contacts/<id>/… (served by api/portal-file.js).
//
// Leads that aren't clients yet (data/leads.json) show up too, as "lead:<id>"; the first time
// someone adds a sheet, a note or a photo to one, it becomes a client record.
//
// Actions: list · get · create · update · note_add · note_delete · file_add · file_delete ·
//          session_add · session_update · session_delete · photo_set · photo_delete · consent ·
//          import (admin: contacts exported from HighLevel)

const crypto = require('crypto');
const { readJSON, writeJSON, writeBinary, removeBinary } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const { normalizePhone, upsertClient } = require('./_lib/clients');
const { cityOf, inCity } = require('./_lib/city');

const uid = () => crypto.randomUUID();
const nowISO = () => new Date().toISOString();
const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
const MAX_BYTES = 3.5 * 1024 * 1024;

const detailPath = (cid) => 'data/contacts/' + cid + '.json';
const emptyDetail = () => ({ notes: [], files: [], sessions: [], consent: null });
async function readDetail(cid) { return Object.assign(emptyDetail(), await readJSON(detailPath(cid), {})); }

// "data:image/jpeg;base64,…" → { mime, buf }
function parseDataUrl(dataUrl) {
  const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || !MIME_EXT[m[1]]) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX_BYTES) return null;
  return { mime: m[1], buf };
}
async function storeFile(cid, dataUrl) {
  const f = parseDataUrl(dataUrl);
  if (!f) return null;
  const path = 'contacts/' + cid + '/' + uid() + '.' + MIME_EXT[f.mime];
  await writeBinary(path, f.buf, f.mime);
  return { path, mime: f.mime, size: f.buf.length };
}

// Mirrors the counters shown in the contact list (so the list never opens every detail file).
function summarize(d) {
  return {
    notesCount: d.notes.length,
    filesCount: d.files.length,
    photosCount: d.sessions.reduce((n, s) => n + (s.before ? 1 : 0) + (s.after ? 1 : 0), 0),
    sessionsCount: d.sessions.length,
    publish: d.consent ? !!d.consent.publish : null,
  };
}

function contactRow(c, extra) {
  return Object.assign({
    id: c.id, name: c.name || '', phone: c.phone || '', email: c.email || '', source: c.source || '',
    location: c.location || '', tags: c.tags || [], createdAt: c.createdAt || '', lastVisit: c.lastVisit || '',
    isClient: true, notesCount: c.notesCount || 0, filesCount: c.filesCount || 0, photosCount: c.photosCount || 0,
    sessionsCount: c.sessionsCount || 0, publish: c.publish == null ? null : !!c.publish,
  }, extra || {});
}
function leadRow(l) {
  return {
    id: 'lead:' + l.id, name: l.name || '', phone: l.phone || '', email: l.email || '', source: l.source || 'lead',
    location: l.location || '', tags: [], createdAt: String(l.createdAt || '').slice(0, 10), lastVisit: String(l.lastContactAt || l.createdAt || '').slice(0, 10),
    isClient: false, leadId: l.id, interest: l.interest || '', notesCount: 0, filesCount: 0, photosCount: 0, sessionsCount: 0, publish: null,
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = requireAuth(req, res);
  if (!session) return;
  const body = req.body || {};
  const { action } = body;
  const fail = (code, error) => res.status(code).json({ error });

  try {
    const employees = await readJSON('data/employees.json', []);
    const me = employees.find((e) => e.id === session.employeeId);
    const author = session.employeeId === 'admin' ? 'Admin' : (me ? me.name : '');

    // ---------------------------------------------------------------- list
    if (action === 'list') {
      const [clients, leads] = await Promise.all([readJSON('data/clients.json', []), readJSON('data/leads.json', [])]);
      const phones = new Set(clients.map((c) => normalizePhone(c.phone)).filter(Boolean));
      const city = await cityOf(session, readJSON, employees);
      const all = clients.map((c) => contactRow(c)).concat(
        leads.filter((l) => l.phone && !phones.has(normalizePhone(l.phone))).map(leadRow)).filter((c) => inCity(city, c.location));
      const q = norm(body.q).trim();
      const qDigits = String(body.q || '').replace(/\D/g, '');
      const filter = body.filter || 'all';
      let rows = all.filter((c) => {
        if (filter === 'clients' && !c.isClient) return false;
        if (filter === 'leads' && c.isClient) return false;
        if (filter === 'photos' && !c.photosCount) return false;
        if (filter === 'fise' && !c.filesCount) return false;
        if (!q) return true;
        return norm(c.name + ' ' + c.email).includes(q) || (qDigits.length >= 3 && normalizePhone(c.phone).includes(normalizePhone(body.q)));
      });
      const recent = (c) => c.lastVisit || c.createdAt || '';
      rows.sort((a, b) => (recent(a) < recent(b) ? 1 : recent(a) > recent(b) ? -1 : 0));
      const counts = { all: all.length, clients: all.filter((c) => c.isClient).length, leads: all.filter((c) => !c.isClient).length, photos: all.filter((c) => c.photosCount).length, fise: all.filter((c) => c.filesCount).length };
      const limit = Math.min(1000, Math.max(20, Number(body.limit) || 60));
      res.status(200).json({ ok: true, contacts: rows.slice(0, limit), total: rows.length, counts });
      return;
    }

    // ---------------------------------------------------------------- import (admin)
    // Rows already parsed in the browser from HighLevel's CSV export: { name, phone, email, tags,
    // source, createdAt }. Upserted by phone (same key as everywhere else); one write at the end.
    if (action === 'import') {
      if (session.role !== 'admin') return fail(403, 'forbidden');
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 2000) : [];
      const clients = await readJSON('data/clients.json', []);
      const byPhone = new Map(clients.map((c) => [normalizePhone(c.phone), c]));
      const byEmail = new Map(clients.filter((c) => c.email).map((c) => [String(c.email).toLowerCase(), c]));
      let added = 0, updated = 0, skipped = 0;
      rows.forEach((r) => {
        const name = String(r.name || '').trim().slice(0, 150);
        const phone = normalizePhone(r.phone);
        const email = String(r.email || '').trim().toLowerCase().slice(0, 150);
        if (!name && !phone && !email) { skipped++; return; }
        const tags = (Array.isArray(r.tags) ? r.tags : String(r.tags || '').split(',')).map((t) => String(t).trim()).filter(Boolean).slice(0, 12);
        const found = (phone && byPhone.get(phone)) || (email && byEmail.get(email));
        if (found) {
          if (!found.name && name) found.name = name;
          if (!found.email && email) found.email = email;
          if (tags.length) found.tags = Array.from(new Set((found.tags || []).concat(tags)));
          if (!found.source) found.source = 'highlevel';
          updated++;
          return;
        }
        if (!phone && !email) { skipped++; return; }
        const created = /^\d{4}-\d{2}-\d{2}/.test(r.createdAt || '') ? String(r.createdAt).slice(0, 10) : todayISO();
        const c = { id: uid(), name: name || email || phone, phone, email, tags, source: r.source ? String(r.source).slice(0, 60) : 'highlevel', createdAt: created, lastVisit: created, importedAt: nowISO() };
        clients.push(c);
        if (phone) byPhone.set(phone, c);
        if (email) byEmail.set(email, c);
        added++;
      });
      await writeJSON('data/clients.json', clients);
      res.status(200).json({ ok: true, added, updated, skipped });
      return;
    }

    // ---------------------------------------------------------------- create
    if (action === 'create') {
      const name = String(body.name || '').trim().slice(0, 150);
      const phone = String(body.phone || '').trim().slice(0, 30);
      if (!name || !phone) return fail(400, 'invalid_client');
      const c = await upsertClient({ name, phone }, { readJSON, writeJSON });
      if (body.email || body.location) {
        const clients = await readJSON('data/clients.json', []);
        const x = clients.find((y) => y.id === c.id);
        if (x) { if (body.email) x.email = String(body.email).trim().slice(0, 150); if (body.location) x.location = String(body.location).slice(0, 40); if (!x.source) x.source = 'manual'; await writeJSON('data/clients.json', clients); }
      }
      res.status(200).json({ ok: true, id: c.id });
      return;
    }

    // Everything below works on one contact. A lead becomes a client the first time it gets data.
    let id = String(body.id || '');
    if (!id) return fail(400, 'missing_id');
    const clients = await readJSON('data/clients.json', []);
    let client = clients.find((c) => c.id === id);
    let lead = null;
    if (!client && id.indexOf('lead:') === 0) {
      const leads = await readJSON('data/leads.json', []);
      lead = leads.find((l) => l.id === id.slice(5));
      if (!lead) return fail(404, 'contact_not_found');
    } else if (!client) return fail(404, 'contact_not_found');

    // ---------------------------------------------------------------- get
    if (action === 'get') {
      if (lead) {
        res.status(200).json({ ok: true, contact: leadRow(lead), detail: emptyDetail(), appointments: [], payments: [] });
        return;
      }
      const [detail, appointments, sales] = await Promise.all([readDetail(client.id), readJSON('data/appointments.json', []), readJSON('data/sales.json', [])]);
      const phone = normalizePhone(client.phone);
      const appts = appointments.filter((a) => a.clientId === client.id || (phone && normalizePhone(a.clientPhone) === phone))
        .sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60)
        .map((a) => ({ id: a.id, date: a.date, time: a.time, treatment: a.treatment, status: a.status, location: a.location, cosmeticianName: a.cosmeticianName || '', amount: a.amount || 0 }));
      const payments = sales.filter((s) => s.source === 'incasare' && s.clientId === client.id).sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((s) => ({ id: s.id, date: s.date, amount: s.amount, treatment: s.treatment, method: s.method }));
      res.status(200).json({ ok: true, contact: contactRow(client), detail, appointments: appts, payments });
      return;
    }

    if (lead) { // promote the lead to a client before writing anything for it
      client = await upsertClient({ name: lead.name, phone: lead.phone }, { readJSON, writeJSON });
      const fresh = await readJSON('data/clients.json', []);
      const x = fresh.find((c) => c.id === client.id);
      if (x) { if (lead.email && !x.email) x.email = lead.email; if (!x.source) x.source = lead.source || 'lead'; if (lead.location && !x.location) x.location = lead.location; await writeJSON('data/clients.json', fresh); }
      clients.splice(0, clients.length, ...fresh);
      client = clients.find((c) => c.id === client.id);
      id = client.id;
    }

    // ---------------------------------------------------------------- update (name / phone / email)
    if (action === 'update') {
      const name = String(body.name || '').trim().slice(0, 150);
      if (!name) return fail(400, 'invalid_client');
      client.name = name;
      if (body.phone !== undefined) client.phone = normalizePhone(body.phone) || String(body.phone).trim().slice(0, 30);
      if (body.email !== undefined) client.email = String(body.email || '').trim().slice(0, 150);
      if (body.location !== undefined) client.location = String(body.location || '').slice(0, 40);
      await writeJSON('data/clients.json', clients);
      res.status(200).json({ ok: true, id: client.id, contact: contactRow(client) });
      return;
    }

    const detail = await readDetail(client.id);
    const save = async () => {
      await writeJSON(detailPath(client.id), detail);
      Object.assign(client, summarize(detail));
      await writeJSON('data/clients.json', clients);
      res.status(200).json({ ok: true, id: client.id, contact: contactRow(client), detail });
    };
    const canRemove = (x) => session.role === 'admin' || (x && x.authorId === session.employeeId);

    if (action === 'note_add') {
      const text = String(body.text || '').trim().slice(0, 2000);
      if (!text) return fail(400, 'missing_text');
      detail.notes.unshift({ id: uid(), text, author, authorId: session.employeeId, at: nowISO() });
      return save();
    }
    if (action === 'note_delete') {
      const n = detail.notes.find((x) => x.id === body.noteId);
      if (!n) return fail(404, 'not_found');
      if (!canRemove(n)) return fail(403, 'forbidden');
      detail.notes = detail.notes.filter((x) => x.id !== n.id);
      return save();
    }
    if (action === 'file_add') {
      const stored = await storeFile(client.id, body.dataUrl);
      if (!stored) return fail(400, 'invalid_file');
      detail.files.unshift(Object.assign({ id: uid(), name: String(body.name || 'Fișă').slice(0, 120), kind: body.kind === 'document' ? 'document' : 'fisa', at: nowISO(), author, authorId: session.employeeId }, stored));
      return save();
    }
    if (action === 'file_delete') {
      const f = detail.files.find((x) => x.id === body.fileId);
      if (!f) return fail(404, 'not_found');
      if (!canRemove(f)) return fail(403, 'forbidden');
      detail.files = detail.files.filter((x) => x.id !== f.id);
      await removeBinary(f.path);
      return save();
    }
    if (action === 'session_add') {
      const n = detail.sessions.reduce((m, s) => Math.max(m, s.n || 0), 0) + 1;
      detail.sessions.push({ id: uid(), n, date: /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : todayISO(), treatment: String(body.treatment || '').trim().slice(0, 150), note: '', before: null, after: null, createdAt: nowISO() });
      return save();
    }
    const sess = body.sessionId ? detail.sessions.find((s) => s.id === body.sessionId) : null;
    if (action === 'session_update') {
      if (!sess) return fail(404, 'not_found');
      if (body.treatment !== undefined) sess.treatment = String(body.treatment || '').trim().slice(0, 150);
      if (/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) sess.date = body.date;
      if (body.note !== undefined) sess.note = String(body.note || '').trim().slice(0, 500);
      return save();
    }
    if (action === 'session_delete') {
      if (!sess) return fail(404, 'not_found');
      if (session.role !== 'admin' && (sess.before || sess.after)) return fail(403, 'forbidden');
      await Promise.all([sess.before, sess.after].filter(Boolean).map((p) => removeBinary(p.path)));
      detail.sessions = detail.sessions.filter((s) => s.id !== sess.id);
      return save();
    }
    if (action === 'photo_set') {
      if (!sess) return fail(404, 'not_found');
      const slot = body.slot === 'after' ? 'after' : 'before';
      const stored = await storeFile(client.id, body.dataUrl);
      if (!stored || stored.mime === 'application/pdf') return fail(400, 'invalid_file');
      if (sess[slot]) await removeBinary(sess[slot].path);
      sess[slot] = Object.assign({ at: nowISO(), author, authorId: session.employeeId }, stored);
      return save();
    }
    if (action === 'photo_delete') {
      if (!sess) return fail(404, 'not_found');
      const slot = body.slot === 'after' ? 'after' : 'before';
      if (!sess[slot]) return fail(404, 'not_found');
      if (!canRemove(sess[slot])) return fail(403, 'forbidden');
      await removeBinary(sess[slot].path);
      sess[slot] = null;
      return save();
    }
    if (action === 'consent') {
      detail.consent = { publish: !!body.publish, at: nowISO(), by: author };
      return save();
    }

    fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-contacts error:', err.message);
    res.status(500).json({ error: 'contacts_failed' });
  }
};
