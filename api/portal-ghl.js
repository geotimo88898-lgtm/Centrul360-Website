// /api/portal-ghl, admin-only: Admin → Integrări → HighLevel, moving everything from the clinic's two GHL
// sub-accounts (Timișoara, Arad) into the portal (_lib/ghl.js). Never sends a token back.
//   GET                                                   each sub-account: connected?, its calendars and users with
//                                                         their mapping; the import
//   POST { action: 'connect', acc: 'tm'|'ar', locationId, token }  checks them with GHL, reads calendars and users
//   POST { action: 'mapping', acc, calendars: { id: { city, category, skip } }, users: { id: employeeId } }
//   POST { action: 'start' }    a new import of every connected sub-account ({ resume: true }: go on;
//                               { acc: 'tm'|'ar' }: only that one)
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

// ------------------------------------------------------------------ restoring the contacts
// data/clients.json once lost the imported contacts (a failed read answered as an empty list, then
// written over; _lib/store.js now refuses both). The restore puts them back WITH THEIR OLD IDS, so
// their appointments, notes and conversations (kept under those ids) line up again:
//   1. the clients named in the appointments (id, name, phone) come back at once;
//   2. HighLevel's contacts are read again (contacts only, no notes / messages / appointments: those
//      are still here), each one with the id the import had given it (the import job's queue keeps
//      GHL id → client id) or found by phone / email, else a new one.
// data/ghl-restore.json { status, ids: { ghlId: clientId }, accs: { tm|ar: <contacts step> }, counts }
const RESTORE = 'data/ghl-restore.json';

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
  const rj = await readJSON(RESTORE, null);
  const restore = rj ? { status: rj.status, counts: rj.counts, fromAppts: rj.fromAppts || 0, idsKnown: Object.keys(rj.ids || {}).length, accs: Object.fromEntries(Object.entries(rj.accs || {}).map(([k, a]) => [k, { read: a.queue.length, total: a.total, done: a.done }])), updatedAt: rj.updatedAt, lastError: rj.lastError || '',
    history: rj.history ? { status: rj.history.status, pos: Object.values(rj.accs || {}).reduce((n, a) => n + (a.hpos || 0), 0), total: Object.values(rj.accs || {}).reduce((n, a) => n + a.queue.length, 0), notes: rj.history.notes || 0, messages: rj.history.messages || 0, contacts: rj.history.contacts || 0, lastError: rj.history.lastError || '' } : null } : null;
  return { accounts, job: pubJob(job), timesToFix: appts.filter(needsTimeFix).length, restore };
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
  const byId = new Map(clients.map((c) => [c.id, c]));
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
        let c = byGhl.get(g.id) || (aj.ids && aj.ids[g.id] && byId.get(aj.ids[g.id])) || (phone && byPhone.get(phone)) || (email && byEmail.get(email));
        if (c) {
          if (!c.name && name) c.name = name;
          if (!c.email && email) c.email = email;
          if (!c.phone && phone) c.phone = phone;
          if (tags.length) c.tags = Array.from(new Set((c.tags || []).concat(tags)));
          if (!c.source) c.source = 'highlevel';
          aj.counts.updated++;
        } else {
          const created = g.dateAdded && /^\d{4}-\d{2}-\d{2}/.test(g.dateAdded) ? g.dateAdded.slice(0, 10) : todayISO();
          // a restore gives her back the id she had (her appointments and history point to it)
          c = { id: (aj.ids && aj.ids[g.id]) || G.uid(), name: name || email || phone, phone, email, tags, source: 'highlevel', createdAt: created, lastVisit: created, importedAt: nowISO() };
          clients.push(c);
          aj.counts.created++;
        }
        c.ghlIds = Array.from(new Set(ghlIdsOf(c).concat(g.id)));
        delete c.ghlId;
        if (!c.location && conn.city) c.location = conn.city;
        byGhl.set(g.id, c); byId.set(c.id, c); if (phone) byPhone.set(phone, c); if (email) byEmail.set(email, c);
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

// one GHL appointment as the portal's: { fields (what an update may change), appt (a new one) }, null when its
// calendar isn't brought or it has no time. conn.ctx: the mapping, calendars and employees, read once.
function apptOf(e, conn, client) {
  const { map, cals, empById } = conn.ctx;
  const mapped = map.calendars[e.calendarId] || G.guessCalendar((cals.get(e.calendarId) || {}).name, conn.city);
  if (mapped.skip) return null;
  const s = G.local(e.startTime), en = e.endTime ? G.local(e.endTime) : null;
  if (!s) return null;
  const st = G.statusOf(e, G.msOf(e.startTime));
  const emp = empById.get(map.users[e.assignedUserId] || '');
  const fields = {
    date: s.date, time: s.time, endTime: en && en.date === s.date && en.time > s.time ? en.time : '',
    status: st.status, noShow: !!st.noShow, location: CITIES.includes(mapped.city) ? mapped.city : conn.city || 'Timișoara',
    cosmeticianId: emp ? emp.id : '', cosmeticianName: emp ? emp.name : '',
  };
  const cat = CATS.includes(mapped.category) ? mapped.category : 'corporale';
  const calName = (cals.get(e.calendarId) || {}).name || '';
  const t = titleOf(e, client);
  const appt = Object.assign({
    id: G.uid(), ghlId: e.id, clientId: client.id, clientName: client.name, clientPhone: client.phone || '',
    treatment: (t || calName || 'Programare HighLevel').slice(0, 200), ghlTitle: t, categories: [cat], category: cat, amount: 0, package: false,
    note: G.text(e.notes || e.description, 500), createdBy: 'highlevel', createdAt: e.dateAdded || nowISO(), updatedAt: nowISO(), importedAt: nowISO(), tzFixed: true,
  }, fields);
  return { fields, appt, title: t, calName };
}
// the title the clinic wrote on a GHL appointment ("Liposonix 2 zone"), not when it is only her name
const plainName = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function titleOf(e, client) {
  const t = String(e.title || '').trim().slice(0, 200);
  if (!t) return '';
  const p = plainName(t), n = plainName(client && client.name);
  if (n && (p === n || p === 'appointment with ' + n || p === 'programare ' + n)) return '';
  return t;
}
const ctxOf = (conn, employees) => ({
  map: conn.mapping || { calendars: {}, users: {} },
  cals: new Map((conn.calendars || []).map((c) => [c.id, c])),
  empById: new Map(employees.map((e) => [e.id, e])),
});

// ------------------------------------------------------------------ the calendars, by date: what the contacts missed
// Every appointment in the brought calendars from `from` (YYYY-MM-DD, Bucharest) for `days` days: the ones the
// portal doesn't have are added (a client made from GHL's contact when she isn't here yet, even without a phone);
// the ones it has stay as they are (changes made in the portal win). Runs again any time, nothing doubles.
async function syncAppts(conns, from, days, state) {
  const until = Date.now() + BUDGET;
  const [clients, appointments, employees] = await Promise.all([readJSON('data/clients.json', []), readJSON('data/appointments.json', []), readJSON('data/employees.json', [])]);
  const apptByGhl = new Map(appointments.filter((a) => a.ghlId).map((a) => [a.ghlId, a]));
  const byGhl = new Map(); clients.forEach((c) => ghlIdsOf(c).forEach((g) => byGhl.set(g, c)));
  const byPhone = new Map(clients.filter((c) => c.phone).map((c) => [G.normalizePhone(c.phone), c]));
  const byEmail = new Map(clients.filter((c) => c.email).map((c) => [String(c.email).toLowerCase(), c]));
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const out = state || { added: 0, existing: 0, titled: 0, clients: 0, skipped: 0, done: [] };
  const startMs = G.msOf(from + ' 00:00:00'), endMs = startMs + days * 86400e3;
  let apptsChanged = false, clientsChanged = false, left = false;
  try {
    for (const k of Object.keys(ACCS)) {
      const conn = conns[k];
      if (!conn || !conn.token) continue;
      conn.city = ACCS[k];
      conn.ctx = ctxOf(conn, employees);
      for (const cal of conn.calendars || []) {
        const key = k + ':' + cal.id;
        if (out.done.includes(key)) continue;
        if ((conn.ctx.map.calendars[cal.id] || {}).skip) { out.done.push(key); continue; }
        if (Date.now() > until) { left = true; break; }
        // a month at a time (GHL answers a range per call)
        for (let t = startMs; t < endMs; t += 31 * 86400e3) {
          const events = await G.calendarEvents(conn, cal.id, t, Math.min(endMs, t + 31 * 86400e3));
          for (const e of events) {
            if (!e || !e.id || e.deleted) continue;
            const cur = apptByGhl.get(e.id);
            if (cur) {
              out.existing++;
              // the title from GHL, where the treatment is still what the import wrote (the calendar's name)
              // its title from GHL (what the Calendar shows); the treatment too, where it is still the calendar's name
              const b = !cur.ghlTitle && apptOf(e, conn, clientById.get(cur.clientId) || { name: cur.clientName });
              if (b && b.title) {
                cur.ghlTitle = b.title; out.titled++; apptsChanged = true;
                if (cur.treatment === b.calName || !cur.treatment || cur.treatment === 'Programare HighLevel') cur.treatment = b.title;
              }
              continue;
            }
            if (!e.contactId) { out.skipped++; continue; }
            let client = byGhl.get(e.contactId);
            if (!client) {
              let g = null;
              try { g = await G.contactOf(conn, e.contactId); } catch (err) { if (err.code !== 'ghl_not_found') throw err; }
              const phone = g ? G.normalizePhone(g.phone) : '';
              const email = g ? String(g.email || '').trim().toLowerCase().slice(0, 150) : '';
              const name = (g ? G.fullName(g) : '') || String(e.title || '').trim() || email || phone || 'Clientă HighLevel';
              client = (phone && byPhone.get(phone)) || (email && byEmail.get(email));
              if (!client) {
                client = { id: G.uid(), name: name.slice(0, 150), phone, email, tags: [], source: 'highlevel', createdAt: todayISO(), lastVisit: todayISO(), importedAt: nowISO(), location: conn.city };
                clients.push(client); out.clients++;
                if (phone) byPhone.set(phone, client); if (email) byEmail.set(email, client);
              }
              client.ghlIds = Array.from(new Set(ghlIdsOf(client).concat(e.contactId)));
              byGhl.set(e.contactId, client); clientsChanged = true;
            }
            const b = apptOf(e, conn, client);
            if (!b) { out.skipped++; continue; }
            appointments.push(b.appt); apptByGhl.set(e.id, b.appt);
            out.added++; apptsChanged = true;
          }
        }
        out.done.push(key);
      }
      if (left) break;
    }
  } finally {
    if (apptsChanged) await writeJSON('data/appointments.json', appointments);
    if (clientsChanged) await writeJSON('data/clients.json', clients);
  }
  return Object.assign(out, { left });
}

// ------------------------------------------------------------------ restoring the history
// After "Refă contactele": the notes (Mențiuni) and conversations (Istoric) from HighLevel, for every contact the
// restore read, into its current id. A contact whose history is here already (it came back with its old id) is
// skipped without asking HighLevel. Notes and messages only, each once: the appointments are not touched.
async function stepHistory(conn, aj, h, until) {
  const users = new Map((conn.users || []).map((u) => [u.id, u.name]));
  const counts = new Map(); // client id → { notesCount, filesCount, photosCount, sessionsCount } from her file
  const tally = (cid, d) => counts.set(cid, { notesCount: d.notes.length, filesCount: d.files.length, photosCount: d.sessions.reduce((n, s) => n + (s.before ? 1 : 0) + (s.after ? 1 : 0), 0), sessionsCount: d.sessions.length });
  const soft = (e) => { if (e.code === 'ghl_auth' || e.code === 'ghl_scope') throw e; return []; };
  // 4 contacts at a time (never the same contact twice in one go): GHL's pace (ghl.js) still holds for the calls
  const one = async ([gid, cid]) => {
    const detail = Object.assign(emptyDetail(), await readJSON(detailPath(cid), {}));
    const fromGhl = (x) => String(x.id || '').startsWith('ghl:');
    if (!detail.notes.some(fromGhl) && !(detail.history || []).some(fromGhl)) {
      const [notes, convs] = await Promise.all([G.notesOf(conn, gid).catch(soft), G.conversationsOf(conn, gid).catch(soft)]);
      const msgs = [];
      for (const cv of convs) (await G.messagesOf(conn, cv.id, 400).catch(soft)).forEach((m) => msgs.push(m));
      let changed = false;
      for (const n of notes) {
        const body = G.text(n.body, 4000);
        if (!body) continue;
        detail.notes.push({ id: 'ghl:' + n.id, text: (n.title ? G.text(n.title, 200) + '\n' : '') + body, author: users.get(n.userId) || 'HighLevel', authorId: '', at: n.dateAdded || nowISO(), from: 'highlevel' });
        h.notes = (h.notes || 0) + 1; changed = true;
      }
      const history = Array.isArray(detail.history) ? detail.history : [];
      const have = new Set(history.map((x) => x.id));
      for (const m of msgs) {
        const id = 'ghl:' + m.id;
        if (have.has(id) || G.isActivity(m)) continue;
        const body = G.text(m.body, 2000);
        const att = (m.attachments || []).length;
        if (!body && !att) continue;
        history.push({ id, at: m.dateAdded || '', ch: G.channelOf(m), dir: m.direction === 'outbound' ? 'out' : 'in', text: body, att, by: m.userId ? users.get(m.userId) || '' : '', auto: ['workflow', 'campaign', 'bulk_actions'].includes(m.source), city: conn.city || '' });
        have.add(id); h.messages = (h.messages || 0) + 1; changed = true;
      }
      if (changed) {
        detail.notes.sort((a, b) => (a.at < b.at ? 1 : -1));
        detail.history = history.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 2000);
        await writeJSON(detailPath(cid), detail, { quiet: true });
        h.contacts = (h.contacts || 0) + 1;
      }
    }
    tally(cid, detail);
  };
  // only her file, for the numbers (the contacts passed before the numbers were counted)
  const countOnly = async ([, cid]) => tally(cid, Object.assign(emptyDetail(), await readJSON(detailPath(cid), {})));
  if (aj.cfrom == null) { aj.cfrom = aj.hpos || 0; aj.cpos = 0; }
  while ((aj.hpos || 0) < aj.queue.length && Date.now() < until) {
    const batch = [], seen = new Set();
    for (let i = aj.hpos || 0; i < aj.queue.length && batch.length < 4 && !seen.has(aj.queue[i][1]); i++) { batch.push(aj.queue[i]); seen.add(aj.queue[i][1]); }
    await Promise.all(batch.map(one));
    aj.hpos = (aj.hpos || 0) + batch.length;
  }
  while ((aj.hpos || 0) >= aj.queue.length && aj.cpos < aj.cfrom && Date.now() < until) {
    const batch = aj.queue.slice(aj.cpos, Math.min(aj.cfrom, aj.cpos + 10));
    await Promise.all(batch.map(countOnly));
    aj.cpos += batch.length;
  }
  // the notes' number on the contacts (Contacte shows it): read fresh right before writing, nothing else changes
  if (counts.size) {
    const clients = await readJSON('data/clients.json', []);
    let any = false;
    clients.forEach((c) => {
      const n = counts.get(c.id);
      if (!n) return;
      Object.keys(n).forEach((k) => { if ((c[k] || 0) !== n[k]) { c[k] = n[k]; any = true; } });
    });
    if (any) await writeJSON('data/clients.json', clients);
  }
}

// ------------------------------------------------------------------ each contact: notes, conversations, appointments
async function stepDetails(conn, aj, until) {
  const [clients, appointments, employees] = await Promise.all([readJSON('data/clients.json', []), readJSON('data/appointments.json', []), readJSON('data/employees.json', [])]);
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const apptByGhl = new Map(appointments.filter((a) => a.ghlId).map((a) => [a.ghlId, a]));
  const users = new Map((conn.users || []).map((u) => [u.id, u.name]));
  conn.ctx = ctxOf(conn, employees);
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
        const b = apptOf(e, conn, client);
        if (!b) continue;
        const cur = apptByGhl.get(e.id);
        if (cur) {
          if (Object.keys(b.fields).some((k) => cur[k] !== b.fields[k])) { Object.assign(cur, b.fields, { updatedAt: nowISO() }); aj.counts.apptsUpdated++; apptsChanged = true; }
          continue;
        }
        appointments.push(b.appt); apptByGhl.set(e.id, b.appt);
        aj.counts.appointments++; apptsChanged = true;
        if (b.appt.date > (client.lastVisit || '') && b.appt.status === 'finalizata') { client.lastVisit = b.appt.date; clientsChanged = true; }
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
  const session = await requireAdmin(req, res);
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

    if (b.action === 'sync_appts') {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(b.from || '') ? b.from : todayISO();
      // from that day to half a year ahead (a date in the past brings, and titles, the ones since then too)
      const back = Math.max(0, Math.round((Date.parse(todayISO()) - Date.parse(from)) / 86400e3));
      const days = Math.max(1, Math.min(1500, back + (Number(b.days) || 180)));
      const state = b.state && Array.isArray(b.state.done) ? { added: +b.state.added || 0, existing: +b.state.existing || 0, titled: +b.state.titled || 0, clients: +b.state.clients || 0, skipped: +b.state.skipped || 0, done: b.state.done.slice(0, 50).map(String) } : null;
      try {
        const r = await syncAppts(conns, from, days, state);
        res.status(200).json(Object.assign(await status(), { sync: r }));
      } catch (e) { res.status(400).json({ error: e.code || 'ghl_failed', status: e.status || 0, message: e.message || '' }); }
      return;
    }

    if (b.action === 'restore_start') {
      const live0 = Object.keys(ACCS).filter((k) => conns[k] && conns[k].token);
      if (!live0.length) { res.status(400).json({ error: 'not_connected' }); return; }
      const prev = await readJSON(RESTORE, null);
      const job0 = await readJSON(G.JOB, null);
      // GHL id → the client id each import gave (every import job kept its queue), and the ones known already
      const ids = Object.assign({}, prev && prev.ids);
      Object.values((job0 && job0.accs) || {}).forEach((a) => (a.queue || []).forEach(([gid, cid]) => { if (gid && cid && !ids[gid]) ids[gid] = cid; }));
      // 1. the clients the appointments name, back with their ids
      const [clients, appts] = await Promise.all([readJSON('data/clients.json', []), readJSON('data/appointments.json', [])]);
      const have = new Set(clients.map((c) => c.id));
      const byPhone = new Set(clients.map((c) => G.normalizePhone(c.phone)).filter(Boolean));
      let fromAppts = 0;
      const back = new Map();
      appts.forEach((a) => {
        if (!a.clientId || have.has(a.clientId)) return;
        const cur = back.get(a.clientId) || { id: a.clientId, name: '', phone: '', email: '', tags: [], source: 'highlevel', createdAt: '', lastVisit: '', location: '', restoredAt: nowISO() };
        if (!cur.name && a.clientName) cur.name = String(a.clientName).slice(0, 150);
        if (!cur.phone && a.clientPhone) cur.phone = G.normalizePhone(a.clientPhone) || String(a.clientPhone);
        if (!cur.location && a.location) cur.location = a.location;
        if (!cur.createdAt || a.date < cur.createdAt) cur.createdAt = a.date;
        if (a.status === 'finalizata' && a.date > cur.lastVisit) cur.lastVisit = a.date;
        back.set(a.clientId, cur);
      });
      back.forEach((c) => {
        if (c.phone && byPhone.has(G.normalizePhone(c.phone))) return; // she is here already under a new id
        if (!c.lastVisit) c.lastVisit = c.createdAt;
        clients.push(c); fromAppts++;
        if (c.phone) byPhone.add(G.normalizePhone(c.phone));
      });
      if (fromAppts) await writeJSON('data/clients.json', clients);
      // 2. HighLevel's contacts again, step by step
      const rj = { status: 'running', ids, fromAppts: ((prev && prev.fromAppts) || 0) + fromAppts, accs: {}, counts: zero(), startedAt: nowISO(), updatedAt: nowISO() };
      live0.forEach((k) => { rj.accs[k] = newAccJob(); });
      await writeJSON(RESTORE, rj, { quiet: true });
      res.status(200).json(await status());
      return;
    }
    if (b.action === 'restore_step') {
      const rj = await readJSON(RESTORE, null);
      if (!rj || rj.status !== 'running') { res.status(200).json(await status()); return; }
      const until = Date.now() + BUDGET;
      try {
        for (const k of Object.keys(ACCS)) {
          const aj = rj.accs[k];
          if (!aj || aj.done) continue;
          const conn = conns[k];
          if (!conn || !conn.token) { aj.done = true; continue; }
          conn.city = ACCS[k];
          aj.ids = rj.ids;
          await stepContacts(conn, aj, until);
          delete aj.ids;
          if (aj.phase !== 'contacts') aj.done = true; // contacts only: the rest is still here
          if (!aj.done) break;
        }
        Object.values(rj.accs).forEach((a) => ['created', 'updated', 'skipped', 'contacts'].forEach((x) => { rj.counts[x] = 0; }));
        Object.values(rj.accs).forEach((a) => ['created', 'updated', 'skipped', 'contacts'].forEach((x) => { rj.counts[x] += (a.counts && a.counts[x]) || 0; }));
        if (Object.values(rj.accs).every((a) => a.done)) { rj.status = 'done'; rj.finishedAt = nowISO(); }
        rj.lastError = '';
      } catch (e) {
        rj.lastError = e.code || 'ghl_failed';
        if (e.code === 'ghl_auth' || e.code === 'ghl_scope') rj.status = 'paused';
      }
      rj.updatedAt = nowISO();
      await writeJSON(RESTORE, rj, { quiet: true });
      res.status(200).json(await status());
      return;
    }

    if (b.action === 'history_start' || b.action === 'history_step') {
      const rj = await readJSON(RESTORE, null);
      if (!rj || rj.status !== 'done') { res.status(200).json(await status()); return; }
      if (b.action === 'history_start') {
        if (!rj.history || rj.history.status !== 'running') {
          rj.history = { status: 'running', startedAt: nowISO(), notes: 0, messages: 0, contacts: 0 };
          Object.values(rj.accs || {}).forEach((a) => { a.hpos = 0; a.cfrom = null; a.cpos = 0; });
        }
      } else if (rj.history && rj.history.status === 'running' && !(rj.history.leaseUntil > Date.now())) {
        const until = Date.now() + BUDGET;
        rj.history.leaseUntil = until + 15e3;
        await writeJSON(RESTORE, rj, { quiet: true });
        try {
          for (const k of Object.keys(ACCS)) {
            const aj = rj.accs[k];
            if (!aj || ((aj.hpos || 0) >= aj.queue.length && (aj.cfrom == null || aj.cpos >= aj.cfrom))) continue;
            const conn = conns[k];
            if (!conn || !conn.token) { aj.hpos = aj.queue.length; continue; }
            conn.city = ACCS[k];
            await stepHistory(conn, aj, rj.history, until);
            if ((aj.hpos || 0) < aj.queue.length || aj.cpos < aj.cfrom) break;
          }
          if (Object.values(rj.accs || {}).every((a) => (a.hpos || 0) >= a.queue.length && (a.cfrom == null || a.cpos >= a.cfrom))) { rj.history.status = 'done'; rj.history.finishedAt = nowISO(); }
          rj.history.lastError = '';
        } catch (e) {
          rj.history.lastError = e.code || 'ghl_failed';
          if (e.code === 'ghl_auth' || e.code === 'ghl_scope') rj.history.status = 'paused';
        }
        rj.history.leaseUntil = 0;
      } else if (rj.history && rj.history.status === 'running') {
        res.status(200).json(Object.assign(await status(), { busy: true }));
        return;
      }
      rj.updatedAt = nowISO();
      await writeJSON(RESTORE, rj, { quiet: true });
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
      // { acc }: only that sub-account (Arad connected later, without Timișoara's again); a resumed one keeps its own
      const only = ACCS[b.acc] && live.includes(b.acc) ? b.acc : '';
      if (!(b.resume && job && job.status !== 'done')) job = { accs: {}, only, startedAt: nowISO(), finishedAt: '' };
      live.filter((k) => !job.only || k === job.only).forEach((k) => { if (!job.accs[k]) job.accs[k] = newAccJob(); });
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
