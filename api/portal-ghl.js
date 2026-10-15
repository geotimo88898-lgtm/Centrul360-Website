// /api/portal-ghl, admin-only: Admin → Integrări → HighLevel, moving everything from the clinic's two GHL
// sub-accounts (Timișoara, Arad) into the portal (_lib/ghl.js). Never sends a token back.
//   GET                                                   each sub-account: connected?, its calendars and users with
//                                                         their mapping; the import
//   POST { action: 'connect', acc: 'tm'|'ar', locationId, token }  checks them with GHL, reads calendars and users
//   POST { action: 'mapping', acc, calendars: { id: { city, category, skip } }, users: { id: employeeId } }
//   POST { action: 'start' }    a new import of every connected sub-account ({ resume: true }: go on)
//   POST { action: 'step' }     one step of it (under a minute); the Integrări page calls it until it's done
//   POST { action: 'pause' }
//   POST { action: 'disconnect', acc }  removes that token (what was imported stays)
//   POST { action: 'fix_times' }  the appointments imported before TIME_FIX 2–3 hours late, put back at their hour
//                                 (no new import: untouched ones are moved here, ones changed since in the portal
//                                 are checked with HighLevel one by one and left alone when someone moved them)

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const G = require('./_lib/ghl');

const ACCS = { tm: 'Timișoara', ar: 'Arad' };
const CITIES = ['Timișoara', 'Arad'];
const CATS = ['corporale', 'faciale', 'epilare-laser'];
const BUDGET = 40e3;
const detailPath = (cid) => 'data/contacts/' + cid + '.json';
const emptyDetail = () => ({ notes: [], files: [], sessions: [], consent: null, published: [] });
const nowISO = () => new Date().toISOString();
const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const zero = () => ({ contacts: 0, created: 0, updated: 0, skipped: 0, notes: 0, messages: 0, appointments: 0, apptsUpdated: 0 });
const newAccJob = () => ({ phase: 'contacts', cursor: null, queue: [], pos: 0, total: 0, counts: zero(), done: false });
// imports before this read GHL's zoneless times as UTC (see G.local); the fix was live a few minutes after
const TIME_FIX = Date.parse('2026-10-15T15:35:00Z');
const needsTimeFix = (a) => a.ghlId && !a.tzFixed && a.date && a.time && Date.parse(a.importedAt || a.createdAt || 0) < TIME_FIX;
const pad2 = (n) => String(n).padStart(2, '0');
// the clinic's clock → the one the old import showed for it (GHL's "09:00" read as 09:00 UTC → 12:00 here)
const lateOf = (date, time) => G.local(Date.parse(date + 'T' + time + ':00Z'));
// and back: what the old import showed → the clinic's real hour (the UTC clock of that Bucharest moment)
function realOf(date, time) {
  const d = new Date(G.msOf(date + ' ' + time + ':00'));
  return { date: d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()), time: pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()) };
}
function moveBack(a) {
  const r = realOf(a.date, a.time);
  const end = a.endTime ? realOf(a.date, a.endTime) : null;
  a.date = r.date; a.time = r.time;
  a.endTime = end && end.date === r.date && end.time > r.time ? end.time : '';
}

const ghlIdsOf = (c) => (Array.isArray(c.ghlIds) ? c.ghlIds : []).concat(c.ghlId ? [c.ghlId] : []);

async function loadConns() {
  const raw = await readJSON(G.CONN, {});
  if (raw.accounts) return raw.accounts;
  return raw.token || raw.locationId ? { tm: raw } : {}; // an older single connection was Timișoara's
}
const saveConns = (accounts, quiet) => writeJSON(G.CONN, { accounts }, quiet ? { quiet: true } : undefined);

function pubJob(j) {
  if (!j) return null;
  const counts = zero();
  const accs = {};
  Object.entries(j.accs || {}).forEach(([k, a]) => {
    Object.keys(counts).forEach((x) => { counts[x] += (a.counts && a.counts[x]) || 0; });
    accs[k] = { phase: a.phase, total: a.total, read: a.queue.length, pos: a.pos, done: a.done, counts: a.counts };
  });
  return { status: j.status, current: j.current || '', accs, counts, startedAt: j.startedAt, updatedAt: j.updatedAt, finishedAt: j.finishedAt, lastError: j.lastError };
}
async function status() {
  const conns = await loadConns();
  const job = await readJSON(G.JOB, null);
  const accounts = {};
  Object.keys(ACCS).forEach((k) => {
    const c = conns[k] || {};
    if (!c.token) { accounts[k] = { connected: false, locationId: c.locationId || '' }; return; }
    const m = c.mapping || { calendars: {}, users: {} };
    accounts[k] = {
      connected: true, locationId: c.locationId, connectedAt: c.connectedAt || '',
      calendars: (c.calendars || []).map((x) => Object.assign({}, x, m.calendars[x.id] || G.guessCalendar(x.name, ACCS[k]))),
      users: (c.users || []).map((u) => Object.assign({}, u, { employeeId: m.users[u.id] || '' })),
    };
  });
  const appts = await readJSON('data/appointments.json', []);
  return { accounts, job: pubJob(job), timesToFix: appts.filter(needsTimeFix).length };
}

// one appointment as HighLevel has it now (null: none of the sub-accounts knows it)
async function ghlEvent(conns, a) {
  const live = Object.keys(ACCS).filter((k) => conns[k] && conns[k].token);
  const order = live.filter((k) => ACCS[k] === a.location).concat(live.filter((k) => ACCS[k] !== a.location)); // its city's first
  for (const k of order) {
    try {
      const j = await G.call(conns[k], '/calendars/events/appointments/' + encodeURIComponent(a.ghlId), '2021-04-15');
      const e = j.appointment || j.event || j;
      if (e && e.startTime) return e;
    } catch (err) {
      if (err.code !== 'ghl_not_found') throw err;
    }
  }
  return null;
}
async function fixTimes(conns) {
  const until = Date.now() + BUDGET;
  const appts = await readJSON('data/appointments.json', []);
  const out = { fixed: 0, checked: 0, kept: 0, unknown: 0, left: 0, total: 0, done: 0, newer: 0, noTime: 0 };
  // what the clinic's appointments from HighLevel are, so a 0 says why
  appts.forEach((a) => {
    if (!a.ghlId) return;
    out.total++;
    if (a.tzFixed) out.done++;
    else if (!a.date || !a.time) out.noTime++;
    else if (!(Date.parse(a.importedAt || a.createdAt || 0) < TIME_FIX)) out.newer++;
  });
  let changed = false;
  for (const a of appts) {
    if (!needsTimeFix(a)) continue;
    const touched = Date.parse(a.updatedAt || 0) - Date.parse(a.importedAt || a.createdAt || 0) > 120e3;
    if (!touched) { moveBack(a); a.tzFixed = true; out.fixed++; changed = true; continue; }
    // changed in the portal since: HighLevel says the real hour; moved by hand → as it is
    if (Date.now() > until) { out.left++; continue; }
    let e = null;
    try { e = await ghlEvent(conns, a); } catch (err) { out.left++; continue; }
    out.checked++;
    if (!e) { a.tzFixed = true; out.unknown++; changed = true; continue; }
    const real = G.local(e.startTime);
    const late = lateOf(real.date, real.time);
    if (a.date === late.date && a.time === late.time) {
      const en = e.endTime ? G.local(e.endTime) : null;
      a.date = real.date; a.time = real.time;
      a.endTime = en && en.date === real.date && en.time > real.time ? en.time : '';
      out.fixed++;
    } else out.kept++;
    a.tzFixed = true; changed = true;
  }
  if (changed) await writeJSON('data/appointments.json', appts);
  return out;
}

// ------------------------------------------------------------------ the contacts: into Contacte
async function stepContacts(conn, aj, until) {
  const clients = await readJSON('data/clients.json', []);
  const byGhl = new Map();
  clients.forEach((c) => ghlIdsOf(c).forEach((g) => byGhl.set(g, c)));
  const byPhone = new Map(clients.filter((c) => c.phone).map((c) => [G.normalizePhone(c.phone), c]));
  const byEmail = new Map(clients.filter((c) => c.email).map((c) => [String(c.email).toLowerCase(), c]));
  const queued = new Set(aj.queue.map((x) => x[0]));
  let changed = false;
  try {
    while (Date.now() < until) {
      const page = await G.contactsPage(conn, aj.cursor);
      if (page.total) aj.total = page.total;
      for (const g of page.list) {
        if (queued.has(g.id)) continue;
        const phone = G.normalizePhone(g.phone);
        const email = String(g.email || '').trim().toLowerCase().slice(0, 150);
        const name = G.fullName(g).slice(0, 150);
        if (!phone && !email) { aj.counts.skipped++; continue; }
        const tags = (g.tags || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 20);
        let c = byGhl.get(g.id) || (phone && byPhone.get(phone)) || (email && byEmail.get(email));
        if (c) {
          if (!c.name && name) c.name = name;
          if (!c.email && email) c.email = email;
          if (!c.phone && phone) c.phone = phone;
          if (tags.length) c.tags = Array.from(new Set((c.tags || []).concat(tags)));
          if (!c.source) c.source = 'highlevel';
          aj.counts.updated++;
        } else {
          const created = g.dateAdded && /^\d{4}-\d{2}-\d{2}/.test(g.dateAdded) ? g.dateAdded.slice(0, 10) : todayISO();
          c = { id: G.uid(), name: name || email || phone, phone, email, tags, source: 'highlevel', createdAt: created, lastVisit: created, importedAt: nowISO() };
          clients.push(c);
          aj.counts.created++;
        }
        c.ghlIds = Array.from(new Set(ghlIdsOf(c).concat(g.id)));
        delete c.ghlId;
        if (!c.location && conn.city) c.location = conn.city;
        byGhl.set(g.id, c); if (phone) byPhone.set(phone, c); if (email) byEmail.set(email, c);
        aj.queue.push([g.id, c.id]);
        queued.add(g.id);
        aj.counts.contacts++;
        changed = true;
      }
      aj.cursor = page.next;
      if (!page.next) { aj.phase = 'details'; break; }
    }
  } finally {
    // what was read stays, even when GHL stops answering halfway
    if (changed) await writeJSON('data/clients.json', clients);
  }
}

// ------------------------------------------------------------------ each contact: notes, conversations, appointments
async function stepDetails(conn, aj, until) {
  const [clients, appointments, employees] = await Promise.all([readJSON('data/clients.json', []), readJSON('data/appointments.json', []), readJSON('data/employees.json', [])]);
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const apptByGhl = new Map(appointments.filter((a) => a.ghlId).map((a) => [a.ghlId, a]));
  const users = new Map((conn.users || []).map((u) => [u.id, u.name]));
  const cals = new Map((conn.calendars || []).map((c) => [c.id, c]));
  const map = conn.mapping || { calendars: {}, users: {} };
  const empById = new Map(employees.map((e) => [e.id, e]));
  let clientsChanged = false, apptsChanged = false;
  try {
    while (aj.pos < aj.queue.length && Date.now() < until) {
      const [gid, cid] = aj.queue[aj.pos];
      const client = clientById.get(cid);
      if (!client) { aj.pos++; continue; }
      const soft = (e) => { if (e.code === 'ghl_auth') throw e; return []; };
      const [notes, events, convs] = await Promise.all([G.notesOf(conn, gid).catch(soft), G.apptsOf(conn, gid).catch(soft), G.conversationsOf(conn, gid).catch(soft)]);
      const msgs = [];
      for (const cv of convs) (await G.messagesOf(conn, cv.id, 400).catch(soft)).forEach((m) => msgs.push(m));

      // the notes → Mențiuni, the messages → Istoric (each once)
      const detail = Object.assign(emptyDetail(), await readJSON(detailPath(cid), {}));
      const haveNotes = new Set(detail.notes.map((n) => n.id));
      let dChanged = false;
      for (const n of notes) {
        const id = 'ghl:' + n.id;
        const body = G.text(n.body, 4000);
        if (haveNotes.has(id) || !body) continue;
        detail.notes.push({ id, text: (n.title ? G.text(n.title, 200) + '\n' : '') + body, author: users.get(n.userId) || 'HighLevel', authorId: '', at: n.dateAdded || nowISO(), from: 'highlevel' });
        haveNotes.add(id); aj.counts.notes++; dChanged = true;
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
        history.push({ id, at: m.dateAdded || '', ch: G.channelOf(m), dir: m.direction === 'outbound' ? 'out' : 'in', text: body, att, by: m.userId ? users.get(m.userId) || '' : '', auto: ['workflow', 'campaign', 'bulk_actions'].includes(m.source), city: conn.city || '' });
        haveMsgs.add(id); aj.counts.messages++; dChanged = true;
      }
      if (dChanged) {
        detail.history = history.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 2000);
        await writeJSON(detailPath(cid), detail, { quiet: true });
        if (client.notesCount !== detail.notes.length) { client.notesCount = detail.notes.length; clientsChanged = true; }
      }

      // the appointments → the Calendar, as they are (no automation)
      for (const e of events) {
        const mapped = map.calendars[e.calendarId] || G.guessCalendar((cals.get(e.calendarId) || {}).name, conn.city);
        if (mapped.skip) continue;
        const startMs = G.msOf(e.startTime);
        const s = G.local(e.startTime), en = e.endTime ? G.local(e.endTime) : null;
        if (!s) continue;
        const st = G.statusOf(e, startMs);
        const emp = empById.get(map.users[e.assignedUserId] || '');
        const fields = {
          date: s.date, time: s.time, endTime: en && en.date === s.date && en.time > s.time ? en.time : '',
          status: st.status, noShow: !!st.noShow, location: CITIES.includes(mapped.city) ? mapped.city : conn.city || 'Timișoara',
          cosmeticianId: emp ? emp.id : '', cosmeticianName: emp ? emp.name : '',
        };
        const cur = apptByGhl.get(e.id);
        if (cur) {
          if (Object.keys(fields).some((k) => cur[k] !== fields[k])) { Object.assign(cur, fields, { updatedAt: nowISO() }); aj.counts.apptsUpdated++; apptsChanged = true; }
          continue;
        }
        const cat = CATS.includes(mapped.category) ? mapped.category : 'corporale';
        const calName = (cals.get(e.calendarId) || {}).name || '';
        const a = Object.assign({
          id: G.uid(), ghlId: e.id, clientId: client.id, clientName: client.name, clientPhone: client.phone || '',
          treatment: (calName || String(e.title || '').trim() || 'Programare HighLevel').slice(0, 200), categories: [cat], category: cat, amount: 0, package: false,
          note: G.text(e.notes || e.description, 500), createdBy: 'highlevel', createdAt: e.dateAdded || nowISO(), updatedAt: nowISO(), importedAt: nowISO(),
        }, fields);
        appointments.push(a); apptByGhl.set(e.id, a);
        aj.counts.appointments++; apptsChanged = true;
        if (s.date > (client.lastVisit || '') && st.status === 'finalizata') { client.lastVisit = s.date; clientsChanged = true; }
      }
      aj.pos++;
    }
  } finally {
    if (apptsChanged) await writeJSON('data/appointments.json', appointments);
    if (clientsChanged) await writeJSON('data/clients.json', clients);
  }
  if (aj.pos >= aj.queue.length) { aj.phase = 'done'; aj.done = true; }
}

module.exports = async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  try {
    if (req.method === 'GET') { res.setHeader('Cache-Control', 'no-store'); res.status(200).json(await status()); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const b = req.body || {};
    const conns = await loadConns();
    const acc = ACCS[b.acc] ? b.acc : '';

    if (b.action === 'connect') {
      if (!acc) { res.status(400).json({ error: 'invalid_account' }); return; }
      const prev = conns[acc] || {};
      const locationId = String(b.locationId || '').trim();
      let token = String(b.token || '').trim();
      if (!token && prev.locationId === locationId) token = prev.token || '';
      if (!/^[A-Za-z0-9]{8,64}$/.test(locationId)) { res.status(400).json({ error: 'invalid_location' }); return; }
      if (!/^[\w.\-]{20,2000}$/.test(token)) { res.status(400).json({ error: 'invalid_token' }); return; }
      const other = Object.entries(conns).find(([k, c]) => k !== acc && c.locationId === locationId && c.token);
      if (other) { res.status(400).json({ error: 'same_location' }); return; }
      const conn = { locationId, token, city: ACCS[acc] };
      let calendars, users;
      try { [calendars, users] = await Promise.all([G.listCalendars(conn), G.listUsers(conn)]); }
      catch (e) { res.status(400).json({ error: e.code || 'ghl_failed', status: e.status || 0, message: e.message || '' }); return; }
      const employees = (await readJSON('data/employees.json', [])).filter((e) => e.active !== false && e.role !== 'admin');
      const old = prev.mapping || { calendars: {}, users: {} };
      const mapping = { calendars: {}, users: {} };
      calendars.forEach((c) => { mapping.calendars[c.id] = old.calendars[c.id] || G.guessCalendar(c.name, ACCS[acc]); });
      users.forEach((u) => { mapping.users[u.id] = old.users[u.id] != null ? old.users[u.id] : G.guessUser(u.name, employees.filter((e) => !e.location || e.location === ACCS[acc]).concat(employees)); });
      conns[acc] = Object.assign(conn, { calendars, users, mapping, connectedAt: prev.locationId === locationId && prev.connectedAt ? prev.connectedAt : nowISO(), by: session.employeeId });
      await saveConns(conns);
      res.status(200).json(await status());
      return;
    }

    if (b.action === 'disconnect') {
      if (!acc) { res.status(400).json({ error: 'invalid_account' }); return; }
      const c = conns[acc] || {};
      conns[acc] = { locationId: c.locationId || '', city: ACCS[acc], calendars: c.calendars || [], users: c.users || [], mapping: c.mapping || { calendars: {}, users: {} } };
      await saveConns(conns);
      res.status(200).json(await status());
      return;
    }

    if (b.action === 'mapping') {
      const conn = conns[acc];
      if (!conn || !conn.token) { res.status(400).json({ error: 'not_connected' }); return; }
      const employees = await readJSON('data/employees.json', []);
      const m = conn.mapping || { calendars: {}, users: {} };
      Object.entries(b.calendars || {}).forEach(([id, v]) => {
        if (!(conn.calendars || []).some((c) => c.id === id)) return;
        m.calendars[id] = { city: CITIES.includes(v.city) ? v.city : ACCS[acc], category: CATS.includes(v.category) ? v.category : 'corporale', skip: !!v.skip };
      });
      Object.entries(b.users || {}).forEach(([id, v]) => {
        if (!(conn.users || []).some((u) => u.id === id)) return;
        m.users[id] = v && employees.some((e) => e.id === v) ? v : '';
      });
      conn.mapping = m;
      await saveConns(conns, true);
      res.status(200).json(await status());
      return;
    }

    if (b.action === 'fix_times') {
      const r = await fixTimes(conns);
      res.status(200).json(Object.assign(await status(), { fix: r }));
      return;
    }

    const live = Object.keys(ACCS).filter((k) => conns[k] && conns[k].token);
    if (b.action === 'start') {
      if (!live.length) { res.status(400).json({ error: 'not_connected' }); return; }
      let job = await readJSON(G.JOB, null);
      if (job && !job.accs) job = null; // an older single-account job
      if (job && job.status === 'running' && Date.now() - Date.parse(job.updatedAt || 0) < 90e3) { res.status(200).json(await status()); return; }
      if (!(b.resume && job && job.status !== 'done')) job = { accs: {}, startedAt: nowISO(), finishedAt: '' };
      live.forEach((k) => { if (!job.accs[k]) job.accs[k] = newAccJob(); });
      job.status = 'running'; job.lastError = ''; job.updatedAt = nowISO();
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
      if (!job || !job.accs || job.status !== 'running') { res.status(200).json(await status()); return; }
      const until = Date.now() + BUDGET;
      try {
        // the sub-accounts one after the other: Timișoara, then Arad
        for (const k of Object.keys(ACCS)) {
          const aj = job.accs[k];
          if (!aj || aj.done) continue;
          const conn = conns[k];
          if (!conn || !conn.token) { aj.done = true; continue; }
          conn.city = ACCS[k];
          job.current = k;
          if (aj.phase === 'contacts') await stepContacts(conn, aj, until);
          if (aj.phase === 'details' && Date.now() < until) await stepDetails(conn, aj, until);
          if (!aj.done) break;
        }
        if (Object.values(job.accs).every((a) => a.done)) { job.status = 'done'; job.finishedAt = nowISO(); job.current = ''; }
      } catch (e) {
        job.lastError = (e.code || 'ghl_failed') + (job.current ? ':' + job.current : '');
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
