// /api/portal-ghl, admin-only: Admin → Integrări → HighLevel, moving everything from GHL into the portal
// (_lib/ghl.js). Never sends the token back.
//   GET                                         connected?, its calendars and users with their mapping, the import
//   POST { action: 'connect', locationId, token }  checks them with GHL, reads the calendars and the users
//   POST { action: 'mapping', calendars: { id: { city, category, skip } }, users: { id: employeeId } }
//   POST { action: 'start' }    a new import (or { resume: true }: go on from where it stopped)
//   POST { action: 'step' }     one step of it (under a minute); the Integrări page calls it until it's done
//   POST { action: 'pause' }
//   POST { action: 'disconnect' }  removes the token (what was imported stays)

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const G = require('./_lib/ghl');

const CITIES = ['Timișoara', 'Arad'];
const CATS = ['corporale', 'faciale', 'epilare-laser'];
const BUDGET = 40e3;
const detailPath = (cid) => 'data/contacts/' + cid + '.json';
const emptyDetail = () => ({ notes: [], files: [], sessions: [], consent: null, published: [] });
const nowISO = () => new Date().toISOString();
const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const newJob = () => ({ status: 'idle', phase: 'contacts', cursor: null, queue: [], pos: 0, total: 0,
  counts: { contacts: 0, created: 0, updated: 0, skipped: 0, notes: 0, messages: 0, appointments: 0, apptsUpdated: 0 }, startedAt: '', updatedAt: '', finishedAt: '', lastError: '' });
const pubJob = (j) => (j ? { status: j.status, phase: j.phase, total: j.total, read: j.queue ? j.queue.length : 0, pos: j.pos || 0, counts: j.counts, startedAt: j.startedAt, updatedAt: j.updatedAt, finishedAt: j.finishedAt, lastError: j.lastError } : null);

async function status() {
  const conn = await readJSON(G.CONN, {});
  const job = await readJSON(G.JOB, null);
  if (!conn.token) return { connected: false, locationId: conn.locationId || '', job: pubJob(job) };
  const m = conn.mapping || { calendars: {}, users: {} };
  return {
    connected: true, locationId: conn.locationId, connectedAt: conn.connectedAt || '',
    calendars: (conn.calendars || []).map((c) => Object.assign({}, c, m.calendars[c.id] || G.guessCalendar(c.name))),
    users: (conn.users || []).map((u) => Object.assign({}, u, { employeeId: m.users[u.id] || '' })),
    job: pubJob(job),
  };
}

// ------------------------------------------------------------------ the contacts: into Contacte
async function stepContacts(conn, job, until) {
  const clients = await readJSON('data/clients.json', []);
  const byGhl = new Map(clients.filter((c) => c.ghlId).map((c) => [c.ghlId, c]));
  const byPhone = new Map(clients.filter((c) => c.phone).map((c) => [G.normalizePhone(c.phone), c]));
  const byEmail = new Map(clients.filter((c) => c.email).map((c) => [String(c.email).toLowerCase(), c]));
  const queued = new Set(job.queue.map((x) => x[0]));
  let changed = false;
  try {
  while (Date.now() < until) {
    const page = await G.contactsPage(conn, job.cursor);
    if (page.total) job.total = page.total;
    for (const g of page.list) {
      if (queued.has(g.id)) continue;
      const phone = G.normalizePhone(g.phone);
      const email = String(g.email || '').trim().toLowerCase().slice(0, 150);
      const name = G.fullName(g).slice(0, 150);
      if (!phone && !email) { job.counts.skipped++; continue; }
      const tags = (g.tags || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
      let c = byGhl.get(g.id) || (phone && byPhone.get(phone)) || (email && byEmail.get(email));
      if (c) {
        if (!c.name && name) c.name = name;
        if (!c.email && email) c.email = email;
        if (!c.phone && phone) c.phone = phone;
        if (tags.length) c.tags = Array.from(new Set((c.tags || []).concat(tags)));
        if (!c.source) c.source = 'highlevel';
        c.ghlId = g.id;
        job.counts.updated++;
      } else {
        const created = g.dateAdded && /^\d{4}-\d{2}-\d{2}/.test(g.dateAdded) ? g.dateAdded.slice(0, 10) : todayISO();
        c = { id: G.uid(), name: name || email || phone, phone, email, tags, source: 'highlevel', createdAt: created, lastVisit: created, importedAt: nowISO(), ghlId: g.id };
        clients.push(c);
        job.counts.created++;
      }
      byGhl.set(g.id, c); if (phone) byPhone.set(phone, c); if (email) byEmail.set(email, c);
      job.queue.push([g.id, c.id]);
      queued.add(g.id);
      job.counts.contacts++;
      changed = true;
    }
    job.cursor = page.next;
    if (!page.next) { job.phase = 'details'; break; }
  }
  } finally {
    // what was read stays, even when GHL stops answering halfway
    if (changed) await writeJSON('data/clients.json', clients);
  }
}

// ------------------------------------------------------------------ each contact: notes, conversations, appointments
async function stepDetails(conn, job, until) {
  const [clients, appointments, employees] = await Promise.all([readJSON('data/clients.json', []), readJSON('data/appointments.json', []), readJSON('data/employees.json', [])]);
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const apptByGhl = new Map(appointments.filter((a) => a.ghlId).map((a) => [a.ghlId, a]));
  const users = new Map((conn.users || []).map((u) => [u.id, u.name]));
  const cals = new Map((conn.calendars || []).map((c) => [c.id, c]));
  const map = conn.mapping || { calendars: {}, users: {} };
  const empById = new Map(employees.map((e) => [e.id, e]));
  let clientsChanged = false, apptsChanged = false;
  try {
  while (job.pos < job.queue.length && Date.now() < until) {
    const [gid, cid] = job.queue[job.pos];
    const client = clientById.get(cid);
    if (!client) { job.pos++; continue; }
    const [notes, events, convs] = await Promise.all([
      G.notesOf(conn, gid).catch((e) => { if (e.code === 'ghl_auth') throw e; return []; }),
      G.apptsOf(conn, gid).catch((e) => { if (e.code === 'ghl_auth') throw e; return []; }),
      G.conversationsOf(conn, gid).catch((e) => { if (e.code === 'ghl_auth') throw e; return []; }),
    ]);
    const msgs = [];
    for (const cv of convs) {
      const list = await G.messagesOf(conn, cv.id, 400).catch((e) => { if (e.code === 'ghl_auth') throw e; return []; });
      list.forEach((m) => msgs.push(m));
    }

    // the notes → Mențiuni, the messages → Istoric (each once)
    const detail = Object.assign(emptyDetail(), await readJSON(detailPath(cid), {}));
    const haveNotes = new Set(detail.notes.map((n) => n.id));
    let dChanged = false;
    for (const n of notes) {
      const id = 'ghl:' + n.id;
      const body = G.text(n.body, 4000);
      if (haveNotes.has(id) || !body) continue;
      detail.notes.push({ id, text: (n.title ? G.text(n.title, 200) + '\n' : '') + body, author: users.get(n.userId) || 'HighLevel', authorId: '', at: n.dateAdded || nowISO(), from: 'highlevel' });
      job.counts.notes++; dChanged = true;
    }
    detail.notes.sort((a, b) => (a.at < b.at ? 1 : -1));
    const history = Array.isArray(detail.history) ? detail.history : [];
    const haveMsgs = new Set(history.map((h) => h.id));
    for (const m of msgs) {
      const id = 'ghl:' + m.id;
      if (haveMsgs.has(id) || G.isActivity(m)) continue;
      const body = G.text(m.body, 2000);
      const att = (m.attachments || []).length;
      if (!body && !att) continue;
      history.push({ id, at: m.dateAdded || '', ch: G.channelOf(m), dir: m.direction === 'outbound' ? 'out' : 'in', text: body, att, by: m.userId ? users.get(m.userId) || '' : '', auto: m.source === 'workflow' || m.source === 'campaign' || m.source === 'bulk_actions' });
      haveMsgs.add(id); job.counts.messages++; dChanged = true;
    }
    if (dChanged) {
      detail.history = history.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 2000);
      await writeJSON(detailPath(cid), detail, { quiet: true });
      if (client.notesCount !== detail.notes.length) { client.notesCount = detail.notes.length; clientsChanged = true; }
    }

    // the appointments → the Calendar, as they are (no automation)
    for (const e of events) {
      const mapped = map.calendars[e.calendarId] || G.guessCalendar((cals.get(e.calendarId) || {}).name);
      if (mapped.skip) continue;
      const startMs = typeof e.startTime === 'number' ? e.startTime : Date.parse(e.startTime);
      const s = G.local(e.startTime), en = e.endTime ? G.local(e.endTime) : null;
      if (!s) continue;
      const st = G.statusOf(e, startMs);
      const emp = empById.get(map.users[e.assignedUserId] || '');
      const fields = {
        date: s.date, time: s.time, endTime: en && en.date === s.date && en.time > s.time ? en.time : '',
        status: st.status, noShow: !!st.noShow, location: CITIES.includes(mapped.city) ? mapped.city : 'Timișoara',
        cosmeticianId: emp ? emp.id : '', cosmeticianName: emp ? emp.name : '',
      };
      const cur = apptByGhl.get(e.id);
      if (cur) {
        const diff = Object.keys(fields).some((k) => cur[k] !== fields[k]);
        if (diff) { Object.assign(cur, fields, { updatedAt: nowISO() }); job.counts.apptsUpdated++; apptsChanged = true; }
        continue;
      }
      const cat = CATS.includes(mapped.category) ? mapped.category : 'corporale';
      const calName = (cals.get(e.calendarId) || {}).name || '';
      const title = String(e.title || '').trim();
      const a = Object.assign({
        id: G.uid(), ghlId: e.id, clientId: client.id, clientName: client.name, clientPhone: client.phone || '',
        treatment: (calName || title || 'Programare HighLevel').slice(0, 200), categories: [cat], category: cat, amount: 0, package: false,
        note: G.text(e.notes || e.description, 500), createdBy: 'highlevel', createdAt: e.dateAdded || nowISO(), updatedAt: nowISO(), importedAt: nowISO(),
      }, fields);
      appointments.push(a); apptByGhl.set(e.id, a);
      job.counts.appointments++; apptsChanged = true;
      if (s.date > (client.lastVisit || '') && st.status === 'finalizata') { client.lastVisit = s.date; clientsChanged = true; }
    }
    job.pos++;
  }
  } finally {
    if (apptsChanged) await writeJSON('data/appointments.json', appointments);
    if (clientsChanged) await writeJSON('data/clients.json', clients);
  }
  if (job.pos >= job.queue.length) { job.phase = 'done'; job.status = 'done'; job.finishedAt = nowISO(); }
}

module.exports = async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  try {
    if (req.method === 'GET') { res.setHeader('Cache-Control', 'no-store'); res.status(200).json(await status()); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const b = req.body || {};

    if (b.action === 'connect') {
      const prev = await readJSON(G.CONN, {});
      const locationId = String(b.locationId || '').trim();
      let token = String(b.token || '').trim();
      if (!token && prev.locationId === locationId) token = prev.token || '';
      if (!/^[A-Za-z0-9]{8,64}$/.test(locationId)) { res.status(400).json({ error: 'invalid_location' }); return; }
      if (!/^[\w.\-]{20,2000}$/.test(token)) { res.status(400).json({ error: 'invalid_token' }); return; }
      const conn = { locationId, token };
      let calendars, users;
      try { [calendars, users] = await Promise.all([G.listCalendars(conn), G.listUsers(conn)]); }
      catch (e) { res.status(400).json({ error: e.code || 'ghl_failed', status: e.status || 0, message: e.message || '' }); return; }
      const employees = (await readJSON('data/employees.json', [])).filter((e) => e.active !== false && e.role !== 'admin');
      const old = prev.mapping || { calendars: {}, users: {} };
      const mapping = { calendars: {}, users: {} };
      calendars.forEach((c) => { mapping.calendars[c.id] = old.calendars[c.id] || G.guessCalendar(c.name); });
      users.forEach((u) => { mapping.users[u.id] = old.users[u.id] != null ? old.users[u.id] : G.guessUser(u.name, employees); });
      await writeJSON(G.CONN, Object.assign(conn, { calendars, users, mapping, connectedAt: prev.locationId === locationId && prev.connectedAt ? prev.connectedAt : nowISO(), by: session.employeeId }));
      res.status(200).json(await status());
      return;
    }

    const conn = await readJSON(G.CONN, {});
    if (b.action === 'disconnect') {
      await writeJSON(G.CONN, { locationId: conn.locationId || '', calendars: conn.calendars || [], users: conn.users || [], mapping: conn.mapping || { calendars: {}, users: {} } });
      res.status(200).json(await status());
      return;
    }
    if (!conn.token) { res.status(400).json({ error: 'not_connected' }); return; }

    if (b.action === 'mapping') {
      const employees = await readJSON('data/employees.json', []);
      const m = conn.mapping || { calendars: {}, users: {} };
      Object.entries(b.calendars || {}).forEach(([id, v]) => {
        if (!(conn.calendars || []).some((c) => c.id === id)) return;
        m.calendars[id] = { city: CITIES.includes(v.city) ? v.city : 'Timișoara', category: CATS.includes(v.category) ? v.category : 'corporale', skip: !!v.skip };
      });
      Object.entries(b.users || {}).forEach(([id, v]) => {
        if (!(conn.users || []).some((u) => u.id === id)) return;
        m.users[id] = v && employees.some((e) => e.id === v) ? v : '';
      });
      conn.mapping = m;
      await writeJSON(G.CONN, conn, { quiet: true });
      res.status(200).json(await status());
      return;
    }

    if (b.action === 'start') {
      let job = await readJSON(G.JOB, null);
      if (job && job.status === 'running' && Date.now() - Date.parse(job.updatedAt || 0) < 90e3) { res.status(200).json(await status()); return; }
      if (!(b.resume && job && job.status !== 'done')) job = newJob();
      job.status = 'running'; job.lastError = '';
      job.startedAt = job.startedAt || nowISO(); job.updatedAt = nowISO();
      await writeJSON(G.JOB, job, { quiet: true });
      res.status(200).json(await status());
      return;
    }
    if (b.action === 'pause') {
      const job = await readJSON(G.JOB, null);
      if (job && job.status === 'running') { job.status = 'paused'; job.updatedAt = nowISO(); await writeJSON(G.JOB, job, { quiet: true }); }
      res.status(200).json(await status());
      return;
    }
    if (b.action === 'step') {
      const job = await readJSON(G.JOB, null);
      if (!job || job.status !== 'running') { res.status(200).json(await status()); return; }
      const until = Date.now() + BUDGET;
      try {
        if (job.phase === 'contacts') await stepContacts(conn, job, until);
        if (job.phase === 'details' && Date.now() < until) await stepDetails(conn, job, until);
      } catch (e) {
        job.lastError = e.code || 'ghl_failed';
        if (e.code === 'ghl_auth' || e.code === 'ghl_scope') job.status = 'paused';
      }
      job.updatedAt = nowISO();
      await writeJSON(G.JOB, job, { quiet: job.status === 'running' });
      res.status(200).json(await status());
      return;
    }

    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    console.error('portal-ghl error:', err.code || '', err.message);
    res.status(500).json({ error: 'ghl_failed' });
  }
};
