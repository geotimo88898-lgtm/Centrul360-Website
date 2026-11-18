// Manager → „Reguli” (the owner, 17.11): whether the internal regulation (Regulament intern, from 18.11) is kept, read
// only, worked out from what the portal already has, per clinic, for today or the last 7 days. Nothing is stored and
// nobody ticks anything: each line opens the place where it is fixed. For the manager (her clinics, never herself) and
// the owner (everyone). Read by api/portal-manager.js ({ action: 'rules' }) and the clock (schedulePush, Wednesday and
// Thursday morning). No names in the logs.
//   pontaj    late    an arrival more than 5 minutes after the start of her hours (Calendar → Program echipă)
//             noIn    a shift of the schedule with no arrival (today: once it has started more than 15 minutes ago); also a
//                     planned overtime her pontaj doesn't reach (extra: true)
//             noOut   a past day with an arrival and no departure
//   visits    unmarked  a visit of a past day neither „Finalizată”, „Nu a venit” nor paid
//             sheets    a consultation or a first visit she came to, with no client sheet (fișa) scanned that day
//             photos    a first session she came to, with no before photo
//             desk      bookings made or moved by a cosmetician (only reception books, from 18.11: should be none)
//   team      leave     leave requests under 2 months („Situație specială”)
//             recover   hours to make up per person (Condică's balance) and whether their recovery is planned
//             schedule  next week's hours missing for someone in Program echipă (from Wednesday)

const { readJSON, writeJSON } = require('./store');
const TB = require('./timebank');
const TS = require('./team-schedule');
const FIX = require('./attendance-fix');
const C = require('./clinic');

const LATE = 5;          // minutes of grace at arrival
const SINCE = '2026-11-18'; // the regulation in force: nothing before it is counted
const CAP_DETAILS = 160; // client files read for the sheets and photos, at most, per call
const CITIES = ['Timișoara', 'Arad'];
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null; };
const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dayOfIso = (iso) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(iso)); } catch (e) { return ''; } };
const isTest = (name) => /^\s*test\b/i.test(String(name || ''));
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const mondayOf = (d) => addDay(d, -(Number(TS.isoDow(d)) - 1));
const OPEN = ['programata', 'confirmata', 'reprogramata'];

// since: the first day counted (the regulation's first day, or a test's); now: { date, min } in Romania
async function compute({ clinics, team, period, since, now, light }) {
  const N = now || TB.bucharestNow();
  const today = N.date || N.today, nowMin = N.min != null ? N.min : toMin(N.time);
  const first = since || process.env.RULES_SINCE || SINCE; // RULES_SINCE: the QA harness, to see its made-up days
  let from = period === 'azi' ? today : addDay(today, -6);
  if (from < first) from = first;
  const ctx = await FIX.load(readJSON);
  const [sales, clients, tball] = await Promise.all([readJSON('data/sales.json', []), readJSON('data/clients.json', []), TB.loadAll(readJSON)]);
  const emps = ctx.employees || [];
  const byId = new Map(emps.map((e) => [e.id, e]));
  const cosm = new Set(emps.filter((e) => e && e.role === 'cosmetician').map((e) => e.id));
  const people = emps.filter((e) => e && e.id && e.id !== 'admin' && e.role !== 'admin' && e.active !== false && ['cosmetician', 'receptie', 'manager'].includes(e.role) && (!team || team.has(e.id)));
  const cityOfP = (e, d) => { const s = d && FIX.shiftOf(ctx, e.id, d); return C.clinicOf((s && s.location) || e.location); };
  const out = {};
  clinics.forEach((c) => { out[c] = { late: [], noIn: [], noOut: [], unmarked: [], sheets: [], photos: [], desk: [], leave: [], recover: [], schedule: null }; });
  const box = (c) => out[C.clinicOf(c)] || null;
  const name = (id) => (byId.get(id) || {}).name || '';
  const days = []; for (let d = from; d <= today; d = addDay(d, 1)) days.push(d);

  // ---------------------------------------------------------------- the pontaj against Program echipă
  people.forEach((e) => {
    days.forEach((d) => {
      const s = FIX.shiftOf(ctx, e.id, d);
      if (!s || FIX.dayCheck(ctx, e.id, d) === 'leave') return;
      const b = box(s.location || e.location); if (!b) return;
      const x = (ctx.attendance || []).find((a) => a && a.employeeId === e.id && a.date === d);
      const row = { employeeId: e.id, name: e.name || '', date: d, from: s.from, to: s.to };
      if (!x || !x.checkIn) {
        if (d < today || nowMin - toMin(s.from) > 15) b.noIn.push(row);
        return;
      }
      const late = toMin(x.checkIn) - toMin(s.from);
      if (late > LATE) b.late.push(Object.assign({ checkIn: x.checkIn, minutes: late }, row));
      if (!x.checkOut && (d < today || nowMin - toMin(s.to) > 30)) b.noOut.push(Object.assign({ checkIn: x.checkIn }, row));
    });
  });

  // her overtime (Program echipă → Ore suplimentare, 18.11): a planned overtime her pontaj doesn't reach (no arrival that
  // day, an arrival after it ended, a departure before it began) is listed with the shifts with no arrival (extra: true);
  // the late rule stays on her shift, an overtime is never „late”
  people.forEach((e) => {
    days.forEach((d) => {
      if (FIX.dayCheck(ctx, e.id, d) === 'leave') return;
      TS.extraOf(ctx.schedule, e.id, d, { appts: ctx.appts }).forEach((x) => {
        const s = toMin(x.from), en = toMin(x.to);
        if (d === today && nowMin - s <= 15) return; // not begun yet (15 minutes)
        const b = box(x.location || e.location); if (!b) return;
        const a = (ctx.attendance || []).find((y) => y && y.employeeId === e.id && y.date === d);
        const ci = a ? toMin(a.checkIn) : null, co = a ? toMin(a.checkOut) : null;
        if (ci != null && ci < en && (co == null || co > s)) return;
        b.noIn.push({ employeeId: e.id, name: e.name || '', date: d, from: x.from, to: x.to, extra: true });
      });
    });
  });

  // ---------------------------------------------------------------- the visits
  const paid = C.paidDays(sales);
  const appts = (ctx.appts || []).filter((a) => a && !a.block && a.status !== 'concediu' && !isTest(a.clientName));
  const keysOf = (a) => { const k = []; if (a.clientId) k.push('c:' + a.clientId); const p = d9(a.clientPhone); if (p.length === 9) k.push('p:' + p); return k; };
  const brief = (a) => ({ id: a.id, date: a.date, time: a.time || '', clientName: a.clientName || '', clientId: a.clientId || '', treatment: a.treatment || '', cosmeticianName: a.cosmeticianName || '', status: a.status });
  // not marked: a past day of the window (today's are still running)
  appts.filter((a) => a.date >= from && a.date < today && OPEN.includes(a.status) && !C.cameBy(a, paid)).forEach((a) => { const b = box(a.location); if (b) b.unmarked.push(brief(a)); });
  // made or moved by a cosmetician
  appts.forEach((a) => {
    const made = cosm.has(a.createdBy) && dayOfIso(a.createdAt) >= from && dayOfIso(a.createdAt) <= today;
    const moved = cosm.has(a.movedBy) && dayOfIso(a.movedAt) >= from && dayOfIso(a.movedAt) <= today;
    if (!made && !moved) return;
    const b = box(a.location); if (b) b.desk.push(Object.assign(brief(a), { by: name(made ? a.createdBy : a.movedBy), how: made ? 'creată' : 'mutată' }));
  });
  // a consultation or first visit she came to: her sheet scanned that day; a first session: a before photo
  const came = appts.filter((a) => C.visit(a) && C.cameBy(a, paid)).sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.time || '').localeCompare(String(y.time || '')));
  const seen = new Map(), seenTreat = new Map();
  const candidates = [];
  came.forEach((a) => {
    const k = keysOf(a); if (!k.length) return;
    const firstVisit = !k.some((x) => seen.has(x)), consult = C.isConsult(a);
    const firstTreat = !consult && !k.some((x) => seenTreat.has(x));
    k.forEach((x) => { seen.set(x, 1); if (!consult) seenTreat.set(x, 1); });
    if (a.date < from || a.date > today || !box(a.location)) return;
    if (consult || firstVisit || firstTreat) candidates.push({ a, sheet: consult || firstVisit, photo: firstTreat });
  });
  // her client card: by her id, else by her phone
  const byPhone = new Map(); clients.forEach((c) => { const p = d9(c && c.phone); if (p.length === 9 && !byPhone.has(p)) byPhone.set(p, c.id); });
  const details = new Map();
  for (const x of light ? [] : candidates.slice(-CAP_DETAILS)) { // light (the clock): no client files read
    const cid = x.a.clientId || byPhone.get(d9(x.a.clientPhone)) || '';
    if (cid && !details.has(cid)) details.set(cid, await readJSON('data/contacts/' + cid + '.json', null).catch(() => null));
    const det = (cid && details.get(cid)) || { files: [], sessions: [] };
    const row = Object.assign(brief(x.a), { clientId: cid });
    const b = box(x.a.location);
    if (x.sheet && !(det.files || []).some((f) => f && (f.kind || 'fisa') === 'fisa' && dayOfIso(f.at) === x.a.date)) b.sheets.push(row);
    if (x.photo && !(det.sessions || []).some((s) => s && s.before && (s.date === x.a.date || dayOfIso(s.before.at) === x.a.date))) b.photos.push(row);
  }

  // ---------------------------------------------------------------- the team
  const shown = (id) => !team || team.has(id);
  (tball.leaveRequests || []).filter((r) => r && r.short && shown(r.employeeId) && r.status !== 'cancelled' && (r.status === 'pending' || dayOfIso(r.requestedAt) >= from)).forEach((r) => {
    const e = byId.get(r.employeeId); if (!e) return;
    const b = box(e.location); if (b) b.leave.push({ id: r.id, employeeId: r.employeeId, name: e.name || '', type: r.type, startDate: r.startDate, endDate: r.endDate, reason: r.reason || '', status: r.status });
  });
  people.forEach((e) => {
    const L = TB.ledger(e.id, tball);
    if (!(L.debt > 0)) return;
    // planned: the recovery days of her approved or waiting requests still ahead
    const planned = (tball.leaveRequests || []).filter((r) => r.employeeId === e.id && ['approved', 'pending'].includes(r.status) && r.recovery)
      .reduce((m, r) => m + (r.recovery.plan || []).filter((p) => p.date >= today).reduce((n, p) => n + (Number(p.minutes) || 0), 0), 0);
    const b = box(e.location); if (b) b.recover.push({ employeeId: e.id, name: e.name || '', minutes: L.debt, planned: Math.min(planned, L.debt) });
  });
  // next week in Program echipă, from Wednesday: everyone of the clinic has her hours there (her week, or the days set)
  const dow = Number(TS.isoDow(today));
  const next = addDay(mondayOf(today), 7);
  clinics.forEach((c) => {
    const missing = people.filter((e) => C.clinicOf(e.location) === c && [0, 1, 2, 3, 4, 5, 6].some((i) => !TS.dayOf(ctx.schedule, e.id, addDay(next, i))))
      .map((e) => ({ employeeId: e.id, name: e.name || '', role: e.role }));
    out[c].schedule = { monday: next, due: dow >= 3, missing };
  });
  Object.values(out).forEach((b) => { b.late.sort((x, y) => (x.date < y.date ? 1 : -1)); b.noIn.sort((x, y) => (x.date < y.date ? 1 : -1)); b.unmarked.sort((x, y) => (x.date < y.date ? 1 : -1)); });
  return { from, to: today, period: period === 'azi' ? 'azi' : '7z', cities: out };
}

// the number of things to look at (the schedule counts only from Wednesday)
function count(b) {
  return b.late.length + b.noIn.length + b.noOut.length + b.unmarked.length + b.sheets.length + b.photos.length + b.desk.length +
    b.leave.filter((x) => x.status === 'pending').length + (b.schedule && b.schedule.due && b.schedule.missing.length ? 1 : 0);
}

// the clock (hourly, api/automation-tick.js): Wednesday and Thursday from 9:00 to 12:59, once a day per clinic, the
// managers of a clinic whose next week is not in Program echipă hear it (the owner when the clinic has no manager)
const PUSH = 'data/rules-push.json';
async function schedulePush(opts) {
  const N = (opts && opts.now) || TB.bucharestNow();
  const today = N.date, dow = Number(TS.isoDow(today)), hour = Math.floor((N.min != null ? N.min : toMin(N.time)) / 60);
  if (!(dow === 3 || dow === 4) || hour < 9 || hour > 12) return { skipped: 'not_now' };
  const sent = await readJSON(PUSH, {});
  const todo = CITIES.filter((c) => !sent[today + '|' + c]);
  if (!todo.length) return { skipped: 'done' };
  const r = await compute({ clinics: todo, team: null, period: 'azi', now: N, light: true });
  const Nt = require('./notify');
  let told = 0;
  for (const c of todo) {
    const s0 = r.cities[c].schedule;
    // the manager's own hours are set by the owner: she is told only about her team
    const s = s0 && Object.assign({}, s0, { missing: s0.missing.filter((x) => x.role !== 'manager') });
    sent[today + '|' + c] = new Date().toISOString();
    if (!s || !s.missing.length) continue;
    const ids = await Nt.deskIds({ readJSON }, c, { reception: false });
    await Nt.notifyMany({ readJSON, writeJSON }, ids, { kind: 'alert', tone: 'info', go: 'programari/echipa', tag: 'program-' + s.monday + '-' + c,
      title: 'PROGRAMUL SĂPTĂMÂNII VIITOARE' + Nt.cityTag(c), text: (s.missing.length === 1 ? 'O persoană nu are' : s.missing.length + ' persoane nu au') + ' încă orele în Program echipă. Se publică până joi.' });
    told++;
  }
  Object.keys(sent).forEach((k) => { if (k.slice(0, 10) < addDay(today, -14)) delete sent[k]; });
  await writeJSON(PUSH, sent);
  return { told };
}

module.exports = { compute, count, schedulePush, LATE, SINCE };
