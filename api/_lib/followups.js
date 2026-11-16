// Follow-ups for the clinic (the owner, 16.11), for the manager (her clinics) and the owner (all of them), never the
// cosmeticians. Read by api/portal-followups.js (the screens) and api/automation-tick.js (the morning notices).
//   free()       the next 7 days, per clinic and per cosmetician: the free hours (her shift in Calendar → Program echipă
//                minus what she has booked) and next to them who to call to fill them, ranked
//   packages()   clients who bought a package (or sessions for another day) and have nothing in the calendar; each one
//                „Rezolvat” with a reason, stored and reversible; a new booking takes her off by itself
//   recontact()  leads and clients who didn't answer: attempts, the last one, the next try (+2 h, the next day, +3 days,
//                then stop: „Nu răspunde”), in the Pipeline's call queue order
//   sheet()      a cosmetician's month for the monthly 1:1, with the month before and the notes saved for that month
//   morning()    once a day from 8:00 (Romania): the day's to-dos as notifications, one per kind, only when not zero
// No profit, costs, salaries or ad spend anywhere here.
// Data: data/followups.json { packages: { <key>: { reason, note, until, at, by, byName } }, contacts: { <client key>:
//   { n, last, next, stopped, answered, log: [{ at, by, out }] } }, log: [...] }, data/one-on-one.json { '<id>|<YYYY-MM>':
//   { good, improve, agree, at, by, byName } }, data/followups-morning.json { sent: { '<day>|<kind>|<who>': at } }.

const { readJSON, writeJSON, readJSONTagged, writeJSONIf } = require('./store');
const B = require('./booking');
const T = require('./team-schedule');
const C = require('./clinic');

const KEY = 'data/followups.json';
const SHEETS = 'data/one-on-one.json';
const MORNING = 'data/followups-morning.json';
const CITIES = ['Timișoara', 'Arad'];
const DAYS_AHEAD = 7;
const MIN_FREE = 30;          // a free window shorter than this is not worth a call (the free consultation is 30 min)
const BACK_DAYS = 30;         // no-shows and cancellations looked at, days back
const PKG_DAYS = 180;         // packages bought in the last ... days
const LEAD_DAYS = 60;         // leads not booked, created in the last ... days
const REASONS = { nu_mai_vrea: 'Nu mai vrea', revine_ea: 'Revine ea', amanat: 'Amânat', altul: 'Altul' };
const MORNING_HOUR = 8;

const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const toMin = B.toMin, hhmm = B.hhmm, addDay = B.addDay;
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !isNaN(Date.parse(d + 'T12:00:00Z'));
const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));
const monthEnd = (m) => { const [y, mo] = m.split('-').map(Number); return m + '-' + String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0'); };
const prevMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? (y - 1) + '-12' : y + '-' + String(mo - 1).padStart(2, '0'); };
const isTest = (name) => /^\s*test\b/i.test(String(name || ''));

// a Romanian date and hour as a moment (the offset of that day, summer or winter)
function roIso(date, time) {
  const guess = Date.parse(date + 'T' + (time || '10:00') + ':00Z');
  const r = B.roNow(guess);
  const off = (Date.parse(r.date + 'T00:00:00Z') + r.min * 60e3) - guess;
  return new Date(guess - off).toISOString();
}

// ------------------------------------------------------------------ the store (two people at once never overwrite)
const blank = () => ({ packages: {}, contacts: {}, log: [] });
async function load() { return Object.assign(blank(), (await readJSON(KEY, null)) || {}); }
async function update(fn) {
  for (let i = 0; i < 6; i++) {
    const { data, etag } = await readJSONTagged(KEY, null);
    const st = Object.assign(blank(), data || {});
    const out = fn(st);
    st.log = (st.log || []).slice(-400);
    if (await writeJSONIf(KEY, st, etag)) return out === undefined ? st : out;
  }
  throw new Error('followups busy');
}

// ------------------------------------------------------------------ who a client is (her card, her phone, her name)
function idsOf(clientId, phone, name) {
  const p = d9(phone);
  const out = [];
  if (clientId) out.push('c:' + clientId);
  if (p.length === 9) out.push('p:' + p);
  if (!out.length && fold(name)) out.push('n:' + fold(name).replace(/\s+/g, ' '));
  return out;
}
const visit = C.visit;
const consult = C.isConsult;

async function data() {
  const [emps, sales, appts, leads, clients, cfg, stages, convos] = await Promise.all([
    readJSON('data/employees.json', []), readJSON('data/sales.json', []), readJSON('data/appointments.json', []), readJSON('data/leads.json', []),
    readJSON('data/clients.json', []), B.settings({ team: true }), readJSON('data/pipeline-stages.json', null), Promise.resolve([]),
  ]);
  const n = C.normalize({ leads, appts, sales, convos, emps });
  const byId = new Map((clients || []).map((c) => [c.id, c]));
  const phoneOf = (id, p) => p || (byId.get(id) || {}).phone || '';
  const A = n.appts.filter(Boolean).map((a) => Object.assign({}, a, { clientPhone: phoneOf(a.clientId, a.clientPhone) }));
  const S = n.sales.filter(Boolean).map((s) => Object.assign({}, s, { clientPhone: phoneOf(s.clientId, s.clientPhone) }));
  return { emps, sales: S, appts: A, leads: n.leads.filter(Boolean), clients, cfg, stages: Array.isArray(stages) && stages.length ? stages : DEFAULT_STAGES, byId };
}
const DEFAULT_STAGES = [
  { id: 'lead_nou', kind: 'open' }, { id: 'contactat', kind: 'open' }, { id: 'programare_stabilita', kind: 'booked' },
  { id: 'venit_la_programare', kind: 'open' }, { id: 'client_fidel', kind: 'won' }, { id: 'pierdut', kind: 'lost' },
];
const kindOf = (stages, id) => (stages.find((s) => s.id === id) || {}).kind || 'open';

// she came: finished, paid, or paid something that day (the same rule as everywhere, api/_lib/clinic.js)
function paidSet(sales) {
  const k = new Set();
  sales.forEach((s) => { if (s.source === 'incasare' && s.date) idsOf(s.clientId, s.clientPhone, s.client).forEach((x) => k.add(x + '|' + s.date)); });
  return k;
}
const came = (a, paid) => a.status === 'finalizata' || !!a.paidSaleId || idsOf(a.clientId, a.clientPhone, a.clientName).some((x) => paid.has(x + '|' + a.date));
// the clients with something booked from today on (any clinic)
function bookedAhead(appts, today) {
  const k = new Set();
  appts.forEach((a) => { if (visit(a) && a.date >= today && a.status !== 'reprogramata') idsOf(a.clientId, a.clientPhone, a.clientName).forEach((x) => k.add(x)); });
  return k;
}
const hit = (set, ids) => ids.some((x) => set.has(x));

// ------------------------------------------------------------------ the rule for trying again
// after the n-th call she didn't answer: +2 h, then the next day at 10, then 3 days later at 10, then stop
function nextTry(n, fromMs) {
  if (n >= 4) return '';
  const now = B.roNow(fromMs);
  let date = now.date, time;
  if (n <= 1) {
    const m = now.min + 120;
    if (m <= 19 * 60) time = hhmm(Math.max(m, 9 * 60)); else { date = addDay(date, 1); time = '10:00'; }
  } else { date = addDay(date, n === 2 ? 1 : 3); time = '10:00'; }
  if (new Date(date + 'T12:00:00Z').getUTCDay() === 0) date = addDay(date, 1); // Sunday: Monday
  return roIso(date, time);
}
// the calls in a row she didn't answer (the newest first, until one she answered)
function leadMisses(l) {
  const acts = (l.activities || []).filter((a) => a && a.type === 'contact').sort((a, b) => String(a.at).localeCompare(String(b.at)));
  let n = 0, last = '';
  for (let i = acts.length - 1; i >= 0; i--) { if (acts[i].outcome !== 'nu_raspunde') break; n++; if (!last) last = acts[i].at; }
  return { n, last };
}

// ------------------------------------------------------------------ the packages started without a next booking
function packageItems(D, clinics, today, st) {
  const since = addDay(today, -PKG_DAYS);
  const ahead = bookedAhead(D.appts, today);
  const paid = paidSet(D.sales);
  const empName = new Map(D.emps.map((e) => [e.id, e.name || '']));
  // the newest package of each client
  const last = new Map();
  D.sales.filter((s) => s.source === 'incasare' && s.date >= since && s.date <= today && (Number(s.packageTotal) > 0 || Number(s.upsell) > 0) &&
    !/zon[aă] (in|în) plus/i.test(s.upsellWhat || '') && clinics.includes(s.location) && !isTest(s.client))
    .forEach((s) => { const k = idsOf(s.clientId, s.clientPhone, s.client)[0]; if (!k) return; const was = last.get(k); if (!was || s.date > was.date || (s.date === was.date && String(s.createdAt) > String(was.createdAt))) last.set(k, s); });
  const dues = D.dues || [];
  // each client's visits, by who she is (her card, her phone, her name)
  const byKey = new Map();
  D.appts.forEach((a) => { if (visit(a)) idsOf(a.clientId, a.clientPhone, a.clientName).forEach((k) => { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(a); }); });
  const out = [];
  last.forEach((s, ck) => {
    const ids = idsOf(s.clientId, s.clientPhone, s.client);
    if (hit(ahead, ids)) return; // booked: off the list by itself
    const what = clip(s.upsellWhat || '', 120);
    const m = /(\d{1,2})\s*(x\b|sedin|sesiun)/.exec(fold(what));
    const total = m ? Number(m[1]) : null;
    const mine = [...new Set([].concat(...ids.map((k) => byKey.get(k) || [])))];
    const after = mine.filter((a) => a.date > s.date && a.date < today && came(a, paid));
    const done = after.filter((a) => a.package).length || after.length;
    if (total != null && total - done <= 0) return; // all her sessions done
    const lastVisit = mine.filter((a) => a.date <= today && came(a, paid)).map((a) => a.date).sort().pop() || s.date;
    const owe = dues.filter((d) => d && d.clientId && d.clientId === s.clientId && Number(d.total) - Number(d.paid) > 0.009).reduce((n, d) => n + Number(d.total) - Number(d.paid), 0);
    const key = 'pk:' + ck + '|' + s.id;
    const r = st.packages[key];
    const resolved = r && !(r.reason === 'amanat' && r.until && r.until <= today) ? r : null;
    const client = s.clientId && D.byId.get(s.clientId);
    out.push({ key, ck, kind: 'pachet', name: (client && client.name) || s.client || 'Clientă', phone: s.clientPhone || '', clientId: s.clientId || '', location: s.location,
      what: what || 'Pachet sau ședințe cumpărate în plus', treatment: s.treatment || '', boughtOn: s.date, soldBy: empName.get(s.performedBy) || '', cosmeticianId: s.performedBy || '',
      total, done, left: total != null ? total - done : null, lastVisit, owe: Math.round(owe * 100) / 100,
      ...(resolved ? { resolved: { reason: resolved.reason, label: REASONS[resolved.reason] || '', note: resolved.note || '', until: resolved.until || '', at: resolved.at, byName: resolved.byName || '' } } : {}),
      ...(r && r.reason === 'amanat' && !resolved ? { snoozedUntil: r.until } : {}) });
  });
  return out.sort((a, b) => String(a.lastVisit).localeCompare(String(b.lastVisit)));
}

// no-shows and cancellations of the last 30 days that were not booked again
function missedItems(D, clinics, today) {
  const from = addDay(today, -BACK_DAYS);
  const paid = paidSet(D.sales), ahead = bookedAhead(D.appts, today);
  const byClient = new Map();
  D.appts.forEach((a) => {
    if (!a || !clinics.includes(a.location) || a.status === 'concediu' || a.block || isTest(a.clientName)) return;
    const cancelled = a.status === 'anulata';
    const cancelAt = cancelled ? B.roNow(Date.parse(a.cancelledAt || a.updatedAt || '') || Date.parse(a.date + 'T12:00:00Z')).date : '';
    // a passed booking she didn't come to, „reprogramată” left on the old day included (the same rule as api/_lib/clinic.js)
    const noShow = !cancelled && a.date < today && a.date >= from && !came(a, paid);
    const cancel = cancelled && a.date >= from && cancelAt >= from && !came(a, paid);
    if (!noShow && !cancel) return;
    const ids = idsOf(a.clientId, a.clientPhone, a.clientName);
    if (!ids.length || hit(ahead, ids)) return;
    // came or was booked again after it
    const set = new Set(ids);
    if (D.appts.some((x) => x !== a && visit(x) && x.date > a.date && hit(set, idsOf(x.clientId, x.clientPhone, x.clientName)) && (x.date >= today || came(x, paid)))) return;
    const k = ids[0], was = byClient.get(k);
    if (!was || a.date > was.a.date) byClient.set(k, { a, why: noShow || C.lateCancel(a) ? 'noshow' : 'anulata' });
  });
  return [...byClient.entries()].map(([ck, x]) => ({ key: 'ms:' + ck, ck, kind: x.why, name: x.a.clientName || 'Clientă', phone: x.a.clientPhone || '', clientId: x.a.clientId || '',
    location: x.a.location, date: x.a.date, treatment: x.a.treatment || '', cosmeticianId: x.a.cosmeticianId || '' }));
}

// leads still to book: in a working column (not booked, won or lost), nothing booked, from the last 60 days
function leadItems(D, clinics, today) {
  const since = Date.now() - LEAD_DAYS * 864e5;
  const ahead = bookedAhead(D.appts, today);
  const first = (D.stages.find((s) => s.kind === 'open' || s.kind === 'booked') || {}).id;
  return D.leads.filter((l) => l && clinics.includes(l.location) && kindOf(D.stages, l.stage) === 'open' && !l.appointmentId && !l.noAnswerAt && Date.parse(l.createdAt) >= since &&
    !hit(ahead, idsOf(l.clientId, l.phone, '')) && !isTest(l.name))
    .filter((l) => leadMisses(l).n < 4)
    .map((l) => {
      const m = leadMisses(l);
      const never = !l.lastContactAt && !l.contactCount && (l.stage === first || l.stage === 'undelivered');
      return { key: 'ld:' + l.id, ck: 'ld:' + l.id, kind: 'lead', leadId: l.id, name: l.name || 'Lead', phone: l.phone || '', location: l.location, interest: l.interest || '',
        createdAt: l.createdAt, never, misses: m.n, lastTry: m.last || l.lastContactAt || '', next: l.followUpAt || '' };
    });
}

// a client's attempts (not a lead: those live on the lead itself)
function contactOf(st, ck) {
  const c = st.contacts[ck];
  if (!c || c.answered) return null;
  return { misses: c.n || 0, lastTry: c.last || '', next: c.next || '', stopped: !!c.stopped };
}

// the call list for a clinic, best first: the packages (she paid already), no-shows of the last two weeks, fresh leads
// never called, the cancellations, the other leads; who is due to be called again comes before who is not yet
function callList(D, clinics, today, st) {
  const now = Date.now();
  const pk = packageItems(D, clinics, today, st).filter((x) => !x.resolved);
  const ms = missedItems(D, clinics, today);
  const ld = leadItems(D, clinics, today);
  const seen = new Set();
  const rows = [];
  const add = (x, score) => {
    const p = d9(x.phone);
    const dupe = p.length === 9 ? 'p:' + p : x.ck;
    if (seen.has(dupe)) return;
    seen.add(dupe);
    const c = x.kind === 'lead' ? { misses: x.misses, lastTry: x.lastTry, next: x.next, stopped: false } : contactOf(st, x.ck) || { misses: 0, lastTry: '', next: '', stopped: false };
    if (c.stopped) return; // „Nu răspunde”: stays in De resunat
    const later = c.next && Date.parse(c.next) > now;
    rows.push(Object.assign({}, x, c, { score: score - (later ? 1000 : 0) }));
  };
  const age = (d) => Math.max(0, Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(String(d).slice(0, 10) + 'T12:00:00Z')) / 864e5));
  pk.forEach((x) => add(x, 500 - Math.min(age(x.lastVisit), 120)));
  ms.filter((x) => x.kind === 'noshow' && age(x.date) <= 14).forEach((x) => add(x, 400 - age(x.date)));
  ld.filter((x) => x.never).forEach((x) => add(x, 350 - age(x.createdAt)));
  ms.filter((x) => !(x.kind === 'noshow' && age(x.date) <= 14)).forEach((x) => add(x, 250 - age(x.date)));
  ld.filter((x) => !x.never).forEach((x) => add(x, 150 - age(x.createdAt)));
  return rows.sort((a, b) => b.score - a.score).slice(0, 60);
}

// ------------------------------------------------------------------ the free hours
// a person's free windows that day: her shift minus her bookings (and her blocks); bookings without a cosmetician go to
// whoever is free then. No schedule in the city: the clinic's hours times its places (Calendar → Online).
function freeDay(D, city, date, nowRo) {
  const cfg = D.cfg, c = cfg.cities[city];
  const wd = new Date(date + 'T12:00:00Z').getUTCDay();
  const d = c && c.days[wd];
  const dayAppts = D.appts.filter((a) => a.location === city && a.date === date && a.status !== 'anulata');
  const closedDay = !d || !d.on || (c.closed || []).includes(date) || dayAppts.some((a) => (a.status === 'concediu' || a.block) && !a.time && !a.cosmeticianId);
  const team = cfg.team && T.hasSchedule(cfg.team.doc, city, cfg.team.ids);
  const names = new Map(D.emps.map((e) => [e.id, e.name || '']));
  let lanes = [];
  if (!closedDay) {
    if (team) lanes = T.whoWorks(cfg.team.doc, date, city, { appts: D.appts, ids: cfg.team.ids }).map((w) => ({ id: w.employeeId, name: names.get(w.employeeId) || '', from: toMin(w.from), to: toMin(w.to) }));
    else {
      const off = new Set(dayAppts.filter((a) => (a.status === 'concediu' || a.block) && !a.time && a.cosmeticianId).map((a) => a.cosmeticianId)).size;
      const places = Math.max(0, (Number(d.at) || 0) - off);
      for (let i = 0; i < places; i++) lanes.push({ id: '', name: places > 1 ? 'Loc ' + (i + 1) : '', from: toMin(d.from), to: toMin(d.to) });
    }
  }
  lanes.forEach((l) => { l.busy = []; });
  const iv = (a) => { const s = toMin(a.time); if (s == null) return null; const e = toMin(a.endTime); return [s, e != null && e > s ? e : s + 60]; };
  const free = (l, s, e) => s >= l.from && e <= l.to && !l.busy.some((b) => b[0] < e && b[1] > s);
  // hers first, then the ones without a cosmetician (or hers when nobody's lane is hers: a shift not set that day)
  const own = dayAppts.filter((a) => (visit(a) || a.block) && iv(a));
  own.filter((a) => a.cosmeticianId && lanes.some((l) => l.id === a.cosmeticianId)).forEach((a) => lanes.find((l) => l.id === a.cosmeticianId).busy.push(iv(a)));
  own.filter((a) => visit(a) && (!a.cosmeticianId || !lanes.some((l) => l.id === a.cosmeticianId))).forEach((a) => {
    const [s, e] = iv(a);
    const l = lanes.find((x) => free(x, s, e)) || lanes.find((x) => x.from < e && x.to > s);
    if (l) l.busy.push([s, e]);
  });
  const start = date === nowRo.date ? Math.ceil((nowRo.min + 1) / 30) * 30 : -1;
  const people = lanes.map((l) => {
    const busy = l.busy.slice().sort((a, b) => a[0] - b[0]);
    const wins = [];
    let t = Math.max(l.from, start);
    busy.forEach((b) => { if (b[0] > t) wins.push([t, Math.min(b[0], l.to)]); t = Math.max(t, b[1]); });
    if (t < l.to) wins.push([t, l.to]);
    const ok = wins.filter((w) => w[1] - w[0] >= MIN_FREE);
    const shift = l.to - l.from;
    const booked = busy.reduce((n, b) => n + Math.max(0, Math.min(b[1], l.to) - Math.max(b[0], l.from)), 0);
    return { id: l.id, name: l.name, from: hhmm(l.from), to: hhmm(l.to), shiftMin: shift, bookedMin: booked,
      free: ok.map((w) => ({ from: hhmm(w[0]), to: hhmm(w[1]), min: w[1] - w[0] })), freeMin: ok.reduce((n, w) => n + w[1] - w[0], 0) };
  });
  return { date, closed: closedDay, team: !!team, people, freeMin: people.reduce((n, p) => n + p.freeMin, 0) };
}

async function free(clinics) {
  const D = await data();
  const st = await load();
  D.dues = await readJSON('data/client-dues.json', []);
  const now = B.roNow(), today = now.date;
  const out = {};
  clinics.forEach((city) => {
    const days = [];
    for (let i = 0; i < DAYS_AHEAD; i++) days.push(freeDay(D, city, addDay(today, i), now));
    out[city] = { days, freeMin: days.reduce((n, d) => n + d.freeMin, 0), team: days.some((d) => d.team) || !!(D.cfg.team && T.hasSchedule(D.cfg.team.doc, city, D.cfg.team.ids)),
      calls: callList(D, [city], today, st) };
  });
  return { ok: true, today, now: now.min, clinics, cities: out };
}

async function packages(clinics) {
  const D = await data();
  D.dues = await readJSON('data/client-dues.json', []);
  const st = await load();
  const today = B.roNow().date;
  const items = packageItems(D, clinics, today, st).map((x) => Object.assign(x, contactOf(st, x.ck) || {}));
  return { ok: true, today, clinics, items: items.filter((x) => !x.resolved), resolved: items.filter((x) => x.resolved).sort((a, b) => String(b.resolved.at).localeCompare(String(a.resolved.at))), reasons: REASONS };
}

async function resolve(key, input, who, clinics) {
  const reason = String(input.reason || '');
  if (!REASONS[reason]) return { error: 'invalid_reason' };
  const today = B.roNow().date;
  const until = reason === 'amanat' ? String(input.until || '') : '';
  if (reason === 'amanat' && (!isDay(until) || until <= today || until > addDay(today, 365))) return { error: 'invalid_until' };
  const note = clip(input.note, 300);
  if (reason === 'altul' && !note) return { error: 'missing_note' };
  const ok = await inClinics(key, clinics);
  if (!ok) return { error: 'not_found' };
  await update((st) => {
    st.packages[key] = { reason, note, until, at: new Date().toISOString(), by: who.id, byName: who.name };
    st.log.push({ key, act: 'resolve', reason, until, note, at: new Date().toISOString(), by: who.id });
  });
  return { ok: true };
}
async function unresolve(key, who, clinics) {
  if (!(await inClinics(key, clinics))) return { error: 'not_found' };
  await update((st) => { delete st.packages[key]; st.log.push({ key, act: 'undo', at: new Date().toISOString(), by: who.id }); });
  return { ok: true };
}
// the item is one of her clinics' (a key from another clinic is never touched)
async function inClinics(key, clinics) {
  const m = /^pk:(.+)\|([^|]+)$/.exec(String(key || ''));
  if (!m) return false;
  const sales = await readJSON('data/sales.json', []);
  const s = sales.find((x) => x && x.id === m[2] && x.source === 'incasare');
  if (!s) return false;
  const loc = C.clinicOf(s.location) || '';
  if (loc) return clinics.includes(loc);
  const appts = await readJSON('data/appointments.json', []);
  const a = s.appointmentId && appts.find((x) => x.id === s.appointmentId);
  return !!(a && clinics.includes(C.clinicOf(a.location)));
}

// ------------------------------------------------------------------ re-contact
// the client behind an item's key: 'pk:<client>|<payment>', 'ms:<client>', 'ct:<client>'
function ckOf(key) {
  const k = String(key || '');
  if (k.startsWith('pk:')) return k.slice(3).replace(/\|[^|]*$/, '');
  if (k.startsWith('ms:') || k.startsWith('ct:')) return k.slice(3);
  return '';
}
async function recontact(clinics) {
  const D = await data();
  D.dues = await readJSON('data/client-dues.json', []);
  const st = await load();
  const today = B.roNow().date;
  const rows = [];
  // leads that didn't answer, still in a working column
  D.leads.filter((l) => l && clinics.includes(l.location) && ['open', 'booked'].includes(kindOf(D.stages, l.stage)) && !isTest(l.name)).forEach((l) => {
    const m = leadMisses(l);
    if (!m.n) return;
    rows.push({ key: 'ld:' + l.id, kind: 'lead', leadId: l.id, name: l.name || 'Lead', phone: l.phone || '', location: l.location, interest: l.interest || '', createdAt: l.createdAt || '',
      misses: m.n, lastTry: m.last, next: l.noAnswerAt ? '' : l.followUpAt || '', stopped: !!l.noAnswerAt || m.n >= 4 });
  });
  // clients called from these screens (packages, no-shows): who they are comes from the lists
  const known = new Map();
  packageItems(D, clinics, today, st).concat(missedItems(D, clinics, today)).forEach((x) => { if (!known.has(x.ck)) known.set(x.ck, x); });
  Object.keys(st.contacts).forEach((ck) => {
    const c = contactOf(st, ck), x = known.get(ck) || st.contacts[ck].who;
    if (!c || !c.misses || !x || !clinics.includes(x.location)) return;
    rows.push(Object.assign({ kind: 'client' }, x, { key: 'ct:' + ck, ck, treatment: x.treatment || x.what || '' }, c));
  });
  // the Pipeline's call queue order: late first (oldest first), then today's, then later ones; the stopped ones last
  const now = Date.now();
  const rank = (r) => (r.stopped ? 3 : !r.next || Date.parse(r.next) <= now ? 0 : B.roNow(Date.parse(r.next)).date === today ? 1 : 2);
  rows.sort((a, b) => rank(a) - rank(b) || String(a.next || a.lastTry).localeCompare(String(b.next || b.lastTry)));
  return { ok: true, today, clinics, items: rows };
}

// one tap: she didn't answer (or she did). Leads: written on the lead like the Pipeline's own „Nu răspunde”, the next
// try as its follow-up; clients: kept here.
async function attempt(input, who, clinics) {
  const out = input.outcome === 'raspuns' ? 'raspuns' : input.outcome === 'reset' ? 'reset' : 'nu_raspunde';
  const key = String(input.key || '');
  if (key.startsWith('ld:')) {
    const id = key.slice(3);
    for (let i = 0; i < 6; i++) {
      const { data: leads, etag } = await readJSONTagged('data/leads.json', []);
      const l = (leads || []).find((x) => x && x.id === id);
      if (!l) return { error: 'not_found' };
      if (!clinics.includes(C.clinicOf(l.location))) return { error: 'forbidden' };
      if (!Array.isArray(l.activities)) l.activities = [];
      const at = new Date().toISOString();
      let n = 0, next = '';
      if (out === 'reset') { delete l.noAnswerAt; l.followUpAt = nextTry(1, Date.now()) ; l.nextAction = 'Sună din nou'; l.activities.push({ id: require('crypto').randomUUID(), type: 'followup', text: 'Mai încercăm', author: who.name, at }); }
      else {
        n = out === 'nu_raspunde' ? leadMisses(l).n + 1 : 0;
        next = out === 'nu_raspunde' ? nextTry(n, Date.now()) : '';
        l.lastContactAt = at; l.contactCount = (l.contactCount || 0) + 1;
        l.activities.push({ id: require('crypto').randomUUID(), type: 'contact', channel: 'call', outcome: out, text: out === 'nu_raspunde' ? 'Încercarea ' + n + (next ? '' : ', oprit: nu răspunde') : '', author: who.name, at });
        if (out === 'nu_raspunde') { l.followUpAt = next; l.nextAction = next ? 'Sună din nou' : 'Nu răspunde'; if (!next) l.noAnswerAt = at; }
        else { delete l.noAnswerAt; }
      }
      if (l.activities.length > 200) l.activities.splice(1, l.activities.length - 200);
      l.updatedAt = at;
      if (await writeJSONIf('data/leads.json', leads, etag)) return { ok: true, misses: n, next: l.followUpAt || '', stopped: !!l.noAnswerAt };
    }
    throw new Error('leads busy');
  }
  // a client: who she is, from the lists of her clinics
  const ck = ckOf(key);
  if (!ck) return { error: 'not_found' };
  const D = await data();
  D.dues = await readJSON('data/client-dues.json', []);
  const st0 = await load();
  const today = B.roNow().date;
  const x = packageItems(D, clinics, today, st0).concat(missedItems(D, clinics, today)).find((y) => y.ck === ck) || (st0.contacts[ck] && st0.contacts[ck].who);
  if (!x || !clinics.includes(x.location)) return { error: 'not_found' };
  return update((st) => {
    const c = st.contacts[ck] && !st.contacts[ck].answered ? st.contacts[ck] : { n: 0, log: [] };
    const at = new Date().toISOString();
    if (out === 'reset') { c.stopped = false; c.n = Math.min(c.n || 0, 1); c.next = nextTry(1, Date.now()); }
    else if (out === 'raspuns') { c.answered = at; c.n = 0; c.next = ''; c.stopped = false; }
    else { c.n = (c.n || 0) + 1; c.last = at; c.next = nextTry(c.n, Date.now()); c.stopped = !c.next; }
    c.log = (c.log || []).concat([{ at, by: who.id, out }]).slice(-20);
    c.who = { name: x.name, phone: x.phone, location: x.location, clientId: x.clientId || '', kind: x.kind, treatment: x.treatment || x.what || '' };
    st.contacts[ck] = c;
    // the answered ones older than 60 days go (the file stays small)
    Object.keys(st.contacts).forEach((k) => { const y = st.contacts[k]; if (y.answered && Date.now() - Date.parse(y.answered) > 60 * 864e5) delete st.contacts[k]; });
    return { ok: true, misses: c.n, next: c.next || '', stopped: !!c.stopped };
  });
}

// the two numbers of Panou → Azi → De făcut (portal-kpi.js, through portal-followups.js): packages without a next booking,
// and who is due to be called again now
async function counts(clinics) {
  const [pk, rc] = await Promise.all([packages(clinics), recontact(clinics)]);
  const now = Date.now();
  const due = rc.items.filter((x) => !x.stopped && (!x.next || Date.parse(x.next) <= now));
  const per = {};
  clinics.forEach((c) => { per[c] = { packagesUnbooked: pk.items.filter((x) => x.location === c).length, callAgain: due.filter((x) => x.location === c).length }; });
  return { ok: true, packagesUnbooked: pk.items.length, callAgain: due.length, cities: per };
}

// ------------------------------------------------------------------ the monthly 1:1
function monthNumbers(D, emp, month, today) {
  const from = month + '-01', end = monthEnd(month), to = end < today ? end : today;
  if (from > today) return { month, empty: true };
  const team = C.cosmeticians(D.emps, D.sales, D.attendance, C.clinicOf(emp.location) || emp.location, from, to, D.appts);
  const me = team.find((x) => x.id === emp.id) || { days: 0, collected: 0, perDay: 0, ok: false, consults: { total: 0, withPackage: 0, pct: null } };
  // her clients' visits up to yesterday: came or not (the same rules as the calendar's target, api/_lib/clinic.js)
  const yesterday = addDay(today, -1), last = to < yesterday ? to : yesterday;
  const paid = paidSet(D.sales);
  let due = 0, cameN = 0, cancelled = 0;
  const seen = new Set();
  D.appts.filter((a) => a.cosmeticianId === emp.id && a.date >= from && a.date <= to && a.status !== 'concediu' && !a.block && !isTest(a.clientName)).forEach((a) => {
    const c = came(a, paid);
    if (a.status === 'anulata' && !c && !C.lateCancel(a)) { cancelled++; return; }
    if (a.date > last) return;
    // „reprogramată” still on a passed day without her: a no-show, as everywhere (api/_lib/clinic.js visitStats)
    const k = (idsOf(a.clientId, a.clientPhone, a.clientName)[0] || a.id) + '|' + a.date + '|' + fold(a.treatment);
    if (seen.has(k)) return;
    seen.add(k); due++; if (c) cameN++;
  });
  return { month, from, to, days: me.days, daysFrom: me.daysFrom || '', collected: me.collected, perDay: me.perDay, target: C.TARGET_PER_DAY, ok: !!me.ok,
    consults: me.consults || { total: 0, withPackage: 0, pct: null }, visits: due, came: cameN, noShows: due - cameN, cancelled };
}
async function sheet(empId, month, clinics) {
  const [emps, sales, appts, attendance, clients, notes] = await Promise.all([readJSON('data/employees.json', []), readJSON('data/sales.json', []), readJSON('data/appointments.json', []),
    readJSON('data/attendance.json', []), readJSON('data/clients.json', []), readJSON(SHEETS, {})]);
  const emp = emps.find((e) => e && e.id === empId && e.role === 'cosmetician');
  if (!emp || !clinics.includes(emp.location)) return { error: 'not_found' };
  const today = B.roNow().date;
  const m = isMonth(month) && month <= today.slice(0, 7) ? month : today.slice(0, 7);
  const n = C.normalize({ leads: [], appts, sales, convos: [], emps });
  const byId = new Map(clients.map((c) => [c.id, c]));
  const D = { emps, attendance, sales: n.sales.filter(Boolean).map((s) => Object.assign({}, s, { clientPhone: s.clientPhone || (byId.get(s.clientId) || {}).phone || '' })),
    appts: n.appts.filter(Boolean).map((a) => Object.assign({}, a, { clientPhone: a.clientPhone || (byId.get(a.clientId) || {}).phone || '' })) };
  const note = (notes && notes[emp.id + '|' + m]) || null;
  return { ok: true, employee: { id: emp.id, name: emp.name || '', location: emp.location || '', active: emp.active !== false }, month: m, today,
    now: monthNumbers(D, emp, m, today), before: monthNumbers(D, emp, prevMonth(m), today),
    notes: note ? { good: note.good || '', improve: note.improve || '', agree: note.agree || '', at: note.at, byName: note.byName || '' } : { good: '', improve: '', agree: '' } };
}
async function sheetSave(empId, month, input, who, clinics) {
  const emps = await readJSON('data/employees.json', []);
  const emp = emps.find((e) => e && e.id === empId && e.role === 'cosmetician');
  if (!emp || !clinics.includes(emp.location)) return { error: 'not_found' };
  if (!isMonth(month) || month > B.roNow().date.slice(0, 7)) return { error: 'invalid_month' };
  const row = { good: clip(input.good, 2000), improve: clip(input.improve, 2000), agree: clip(input.agree, 2000), at: new Date().toISOString(), by: who.id, byName: who.name };
  for (let i = 0; i < 6; i++) {
    const { data: doc, etag } = await readJSONTagged(SHEETS, {});
    const all = doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : {};
    all[emp.id + '|' + month] = row;
    if (await writeJSONIf(SHEETS, all, etag)) return { ok: true, notes: row };
  }
  throw new Error('sheets busy');
}
// the cosmeticians of her clinics, for the list on Manager → Echipa
async function people(clinics) {
  const emps = await readJSON('data/employees.json', []);
  return emps.filter((e) => e && e.role === 'cosmetician' && e.active !== false && clinics.includes(e.location)).map((e) => ({ id: e.id, name: e.name || '', location: e.location }));
}

// ------------------------------------------------------------------ the morning
// What waits today, once a day from 8:00 (Romania; the clock passes at :17), for the owner (both clinics) and each
// manager (her clinics), one notification per kind, only when not zero, each opening where it is handled.
// Not here, because they already ring: the messages waiting (10:00 and 17:00, wa-waiting.js) and the papers that
// expire (at 30 days, 7 days and on the day, legal-alerts.js).
async function morningItems(clinics, opts) {
  const o = opts || {};
  const now = B.roNow(), today = now.date, tomorrow = addDay(today, 1), yesterday = addDay(today, -1);
  const [emps, sales, appts, leads, stagesRaw, adjs, leaves, closes] = await Promise.all([
    readJSON('data/employees.json', []), readJSON('data/sales.json', []), readJSON('data/appointments.json', []), readJSON('data/leads.json', []), readJSON('data/pipeline-stages.json', null),
    readJSON('data/time-adjust.json', []), readJSON('data/leave-requests.json', []), readJSON('data/day-closes.json', []),
  ]);
  const n = C.normalize({ leads, appts, sales, convos: [], emps });
  const stages = Array.isArray(stagesRaw) && stagesRaw.length ? stagesRaw : DEFAULT_STAGES;
  const first = (stages.find((s) => s.kind === 'open' || s.kind === 'booked') || {}).id;
  const per = (list) => clinics.map((c) => [c, list.filter((x) => x.location === c).length]).filter((x) => x[1]);
  const where = (pairs) => pairs.map(([c, k]) => c + ' ' + k).join(', ');
  const items = [];
  // tomorrow's bookings not confirmed yet
  const unconf = n.appts.filter((a) => a && visit(a) && a.date === tomorrow && a.status === 'programata' && clinics.includes(a.location) && !isTest(a.clientName));
  if (unconf.length) items.push({ kind: 'neconfirmate', count: unconf.length, go: 'programari/maine', tone: 'warn',
    title: unconf.length === 1 ? 'O PROGRAMARE DE CONFIRMAT 📅' : unconf.length + ' PROGRAMĂRI DE CONFIRMAT 📅', text: 'Mâine · ' + where(per(unconf)), short: unconf.length + ' de confirmat mâine' });
  // leads nobody called yet
  const fresh = n.leads.filter((l) => l && clinics.includes(l.location) && kindOf(stages, l.stage) !== 'won' && kindOf(stages, l.stage) !== 'lost' && !l.lastContactAt && !l.contactCount &&
    (l.stage === first || l.stage === 'undelivered') && !isTest(l.name));
  if (fresh.length) items.push({ kind: 'nesunate', count: fresh.length, go: 'pipeline/coada', tone: 'warn',
    title: fresh.length === 1 ? 'UN LEAD NESUNAT 📞' : fresh.length + ' LEADURI NESUNATE 📞', text: where(per(fresh)) + ' · coada de apeluri', short: fresh.length + (fresh.length === 1 ? ' lead nesunat' : ' leaduri nesunate') });
  // pontaj and leave waiting for a decision: the manager's team (never her own, the owner decides those), everything for the owner
  const team = o.team || null;
  const mine = (id) => (team ? team.has(id) : true);
  const pt = (adjs || []).filter((a) => a && a.status === 'pending' && mine(a.employeeId)).length, pl = (leaves || []).filter((r) => r && r.status === 'pending' && mine(r.employeeId)).length;
  if (pt + pl) items.push({ kind: 'cereri', count: pt + pl, go: team ? 'manager/echipa' : 'aprobari', tone: 'info',
    title: pt + pl === 1 ? 'O CERERE DE APROBAT 🗓' : (pt + pl) + ' CERERI DE APROBAT 🗓', text: [pt ? pt + ' pontaj' : '', pl ? pl + (pl === 1 ? ' concediu' : ' concedii') : ''].filter(Boolean).join(', '), short: (pt + pl) + ' de aprobat' });
  // yesterday: money came in and the day was not closed
  const worked = clinics.filter((c) => n.sales.some((s) => s && s.source === 'incasare' && s.date === yesterday && s.location === c));
  const open = worked.filter((c) => !(closes || []).some((x) => x && x.city === c && x.date === yesterday));
  if (open.length) items.push({ kind: 'inchidere', count: open.length, go: 'manager/casa', tone: 'warn',
    title: 'ZIUA DE IERI NEÎNCHISĂ 🧾', text: open.join(', ') + ': casa de pe ' + yesterday.slice(8, 10) + '.' + yesterday.slice(5, 7) + ' nu e închisă', short: 'ziua de ieri neînchisă' });
  // the manager's: the packages started without a next booking and who is due to be called again now (the two numbers of
  // Panou → Azi → De făcut, counts() above), only when not zero
  if (team && o.followups !== false) {
    const fu = await counts(clinics).catch((e) => { console.error('followups morning counts:', e.message); return null; });
    if (fu && fu.packagesUnbooked) items.push({ kind: 'pachete', count: fu.packagesUnbooked, go: 'programari/pachete', tone: 'info',
      title: fu.packagesUnbooked === 1 ? 'UN PACHET FĂRĂ PROGRAMARE 🎁' : fu.packagesUnbooked + ' PACHETE FĂRĂ PROGRAMARE 🎁', text: where(clinics.map((c) => [c, (fu.cities[c] || {}).packagesUnbooked || 0]).filter((x) => x[1])) + ' · ședința următoare nu e programată',
      short: fu.packagesUnbooked + (fu.packagesUnbooked === 1 ? ' pachet fără programare' : ' pachete fără programare') });
    if (fu && fu.callAgain) items.push({ kind: 'resunat', count: fu.callAgain, go: 'programari/resunat', tone: 'info',
      title: fu.callAgain === 1 ? 'O CLIENTĂ DE RESUNAT 📞' : fu.callAgain + ' CLIENTE DE RESUNAT 📞', text: where(clinics.map((c) => [c, (fu.cities[c] || {}).callAgain || 0]).filter((x) => x[1])) + ' · de resunat acum',
      short: fu.callAgain + ' de resunat acum' });
  }
  return items;
}
async function morning(opts) {
  const o = opts || {};
  const now = B.roNow();
  if (!o.force && Math.floor(now.min / 60) < MORNING_HOUR) return { skipped: 'early' };
  const day = now.date;
  const st = (await readJSON(MORNING, null)) || { sent: {} };
  const N = require('./notify');
  const R = require('./roles');
  const store = { readJSON, writeJSON };
  const emps = await readJSON('data/employees.json', []);
  const owners = await N.adminIds(store);
  const ownerSet = new Set(['admin'].concat(await N.ownerIds(store).catch(() => [])));
  const who = [{ ids: owners, clinics: CITIES.slice(), owner: true }].concat(emps.filter((e) => e && e.active !== false && e.role === 'manager').map((e) => ({ ids: [e.id], clinics: R.managesOf(e), team: e })));
  let sent = 0;
  const summary = [];
  for (const w of who) {
    const teamSet = w.team ? await R.teamOf({ role: 'manager', employeeId: w.team.id }, readJSON, emps) : null;
    const items = await morningItems(w.clinics, { team: teamSet });
    for (const it of items) {
      const k = day + '|' + it.kind + '|' + (w.owner ? 'owner' : w.team.id);
      if (st.sent[k]) continue;
      // the owner's phone gets one line for all of them (below); his bell, each one
      await N.notifyMany(store, w.ids, { kind: 'alert', tone: it.tone, go: it.go, tag: 'fu-' + it.kind + '-' + day + (w.owner ? '' : '-' + w.team.id), title: it.title, text: it.text, ...(w.owner ? { ownerPush: false } : {}) });
      st.sent[k] = new Date().toISOString();
      if (w.owner) summary.push(it);
      sent++;
    }
  }
  if (summary.length) {
    const ids = owners.filter((id) => ownerSet.has(id));
    const msg = { title: 'DE FĂCUT AZI ☀️', body: N.cut(summary.map((x) => x.short).join(' · '), 200), url: '/#' + summary[0].go, tag: 'fu-morning-' + day };
    await require('./push').sendPush(store, ids, msg).catch((e) => console.error('followups morning push:', e.message));
  }
  Object.keys(st.sent).forEach((k) => { if (k.slice(0, 10) < addDay(day, -3)) delete st.sent[k]; });
  if (sent) await writeJSON(MORNING, st);
  return { sent };
}

module.exports = { KEY, SHEETS, REASONS, nextTry, roIso, free, packages, counts, resolve, unresolve, recontact, attempt, sheet, sheetSave, people, morning, morningItems, leadMisses };
