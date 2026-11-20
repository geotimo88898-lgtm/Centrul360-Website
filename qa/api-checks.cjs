// The server's rules, checked on the harness (qa/server.cjs) with its own copy of the data and its own port, so it can run
// beside overflow.cjs. Each check is one rule of the clinic's numbers or of who sees what (16.11). Exits 1 on a failure.
//   node qa/api-checks.cjs            (DATA=... PORT=... to choose; a fresh copy of qa/seed.cjs in a temp folder by default)
const path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
const OWN = !process.env.DATA; // a temp copy made here is removed at the end; a DATA given is kept
const DATA = process.env.DATA || fs.mkdtempSync(path.join(os.tmpdir(), 'c360-checks-'));
const PORT = process.env.PORT || '8797';
process.env.DATA = DATA; process.env.PORT = PORT;
process.env.PORTAL_SECRET = process.env.PORTAL_SECRET || 'dev-secret-only-local';
cp.execFileSync(process.execPath, [path.join(__dirname, 'seed.cjs')], { env: Object.assign({}, process.env, { DATA }), stdio: 'ignore' });
const f = (p) => path.join(DATA, p.replace(/\//g, '__'));
const rd = (p, d) => { try { return JSON.parse(fs.readFileSync(f(p), 'utf8')); } catch (e) { return d; } };
const wr = (p, d) => fs.writeFileSync(f(p), JSON.stringify(d));
const ro = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(ms));
const TODAY = ro(Date.now()), MONTH = TODAY.slice(0, 7);
const day = (n) => ro(Date.parse(TODAY + 'T12:00:00Z') + n * 864e5);
const at = (d, hm) => new Date(Date.parse(d + 'T' + hm + ':00+02:00')).toISOString();

// ------------------------------------------------------------------ the fixtures (made-up people and numbers)
const emps = rd('data/employees.json', []);
const base = emps[0];
emps.push(Object.assign({}, base, { id: 'e-c4', name: 'Irina Proba', role: 'cosmetician', location: 'Timisoara', username: 'c4', trainedOfficial: false }));
emps.push(Object.assign({}, base, { id: 'e-c5', name: 'Sonia Proba', role: 'cosmetician', location: 'Arad', username: 'c5', active: false, leftAt: day(-3) }));
wr('data/employees.json', emps);
const ts = rd('data/team-schedule.json', { weekly: {}, dates: {} });
ts.weekly['e-c5'] = { location: 'Arad', days: Object.fromEntries(['1', '2', '3', '4', '5', '6', '7'].map((k) => [k, { on: true, from: '09:00', to: '17:00' }])) };
wr('data/team-schedule.json', ts);
const appts = rd('data/appointments.json', []);
// a booking left on Sonia after her last day (two hours), one on her last day
appts.push({ id: 'fx-orphan', date: day(2), time: '10:00', endTime: '12:00', location: 'Arad', cosmeticianId: 'e-c5', clientName: 'Orfană', clientId: 'cl-orf', treatment: 'Lipo 640', status: 'programata', createdAt: at(day(-10), '10:00') });
appts.push({ id: 'fx-reprog', date: day(-2), time: '11:00', endTime: '12:00', location: 'Timișoara', cosmeticianId: 'e-c1', clientName: 'Mutată', clientId: 'cl-rp', clientPhone: '0755777888', treatment: 'Lipo 640', categories: ['corporale'], status: 'reprogramata', createdAt: at(day(-9), '10:00') });
appts.push({ id: 'fx-future', date: day(3), time: '14:00', endTime: '15:00', location: 'Timișoara', cosmeticianId: 'e-c1', clientName: 'Reamintită', clientId: 'cl-fu', clientPhone: '0755123456', treatment: 'Lipo 640', categories: ['corporale'], status: 'programata', createdAt: at(day(-1), '10:00') });
appts.push({ id: 'fx-site', date: day(1), time: '15:00', endTime: '16:00', location: 'Arad', cosmeticianId: 'e-c3', clientName: 'De pe site', clientId: 'cl-st', clientPhone: '0755654321', treatment: 'Lipo 640', status: 'programata', online: true, createdAt: at(day(-1), '10:00') });
wr('data/appointments.json', appts);
// candidates of a job ad: one who writes now (Arad, unread, no answer), one with an old automatic contact
wr('data/candidates.json', [{ id: 'cd1', at: at(day(-1), '09:00'), name: 'Candidată Unu', phone: '0733 333 333', status: 'nou', job: 'Cosmeticiană', location: 'Arad' },
  { id: 'cd2', at: at(day(-5), '09:00'), name: 'Candidată Doi', phone: '0744444444', status: 'sunat', job: 'Recepție', location: 'Arad' }]);
const convos = rd('data/whatsapp-conversations.json', []);
convos.push({ phone: '40733333333', clientName: 'Candidată Unu', location: 'Arad', unreadCount: 1, lastMessageAt: new Date(Date.now() - 50 * 60e3).toISOString(), messages: [{ id: 'mc1', direction: 'in', text: 'Bună ziua, am trimis CV-ul, când pot veni la interviu?', timestamp: new Date(Date.now() - 50 * 60e3).toISOString() }] });
wr('data/whatsapp-conversations.json', convos);
const clients = rd('data/clients.json', []);
clients.push({ id: 'cl-cand2', name: 'Candidată Doi', phone: '0744444444', source: 'whatsapp', location: 'Arad', createdAt: day(-5), lastVisit: day(-5) });
wr('data/clients.json', clients);

// ------------------------------------------------------------------ the harness, in this process (its mocks too)
require('./server.cjs');
const auth = require('../api/_lib/auth.js');
const cookieFor = (id, role) => { let h; auth.setSessionCookie({ setHeader: (k, v) => { h = v; }, req: { headers: { host: 'localhost' } } }, id, role, null); return String(h).split(';')[0]; };
const ROLE = { admin: 'e-adm', manager: 'e-mgr', receptie: 'e-rec' };
async function api(role, route, body, query) {
  const url = 'http://127.0.0.1:' + PORT + '/api/' + route + (query ? '?' + query : '');
  const r = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieFor(ROLE[role], role) }, body: JSON.stringify(body) } : { headers: { cookie: cookieFor(ROLE[role], role) } });
  const j = await r.json().catch(() => ({}));
  return Object.assign(j, { _status: r.status });
}
const results = [];
const check = (item, name, ok, info) => { results.push({ item, name, ok: !!ok }); console.log((ok ? 'ok  ' : 'FAIL') + ' ' + item + ' ' + name + (ok || info == null ? '' : ' → ' + JSON.stringify(info).slice(0, 300))); };

(async () => {
  await new Promise((r) => setTimeout(r, 300));
  const C = require('../api/_lib/clinic'), K = require('../api/_lib/kpi'), MP = require('../api/_lib/manager-pay'), T = require('../api/_lib/team-schedule'), TB = require('../api/_lib/timebank');
  const legacyAt = '2026-11-10T08:00:00Z', newAt = new Date(C.CANCEL_FIX + 3600e3).toISOString();

  // 1. no-shows: when it was cancelled
  {
    const a = { status: 'anulata', date: '2026-11-12', time: '10:00', createdAt: legacyAt };
    check(1, 'cancelledAt before the hour: ahead', !C.lateCancel(Object.assign({}, a, { cancelledAt: at('2026-11-12', '09:00') })));
    check(1, 'cancelledAt at the hour: no-show', C.lateCancel(Object.assign({}, a, { cancelledAt: at('2026-11-12', '10:00') })));
    check(1, 'cancelledAt the next day: no-show', C.lateCancel(Object.assign({}, a, { cancelledAt: at('2026-11-13', '09:00') })));
    check(1, 'legacy, changed on its day after the hour: no-show', C.lateCancel(Object.assign({}, a, { updatedAt: at('2026-11-12', '11:00') })));
    check(1, 'legacy, changed a day later: ahead', !C.lateCancel(Object.assign({}, a, { updatedAt: at('2026-11-13', '11:00') })));
    check(1, 'legacy from HighLevel: only its no-show', !C.lateCancel(Object.assign({}, a, { ghlId: 'g1', importedAt: legacyAt, updatedAt: at('2026-11-12', '11:00') })) && C.lateCancel(Object.assign({}, a, { ghlId: 'g1', noShow: true })));
    check(1, 'new record without cancelledAt: ahead', !C.lateCancel(Object.assign({}, a, { createdAt: newAt, updatedAt: at('2026-11-12', '11:00') })));
    const full = (id, status) => Object.assign({}, rd('data/appointments.json', []).find((x) => x.id === id), { action: 'update', status });
    const up = await api('admin', 'portal-appointments', full('fx-future', 'anulata'));
    const row = (rd('data/appointments.json', []).find((x) => x.id === 'fx-future') || {});
    check(1, 'Calendar: cancelling writes cancelledAt', up.ok && row.cancelledAt && Math.abs(Date.parse(row.cancelledAt) - Date.now()) < 60e3, { up, row });
    await api('admin', 'portal-appointments', full('fx-future', 'programata'));
    const back = (rd('data/appointments.json', []).find((x) => x.id === 'fx-future') || {});
    check(1, 'Calendar: put back, cancelledAt gone', back.status === 'programata' && !back.cancelledAt, back);
    const R = require('../api/_lib/reminders'), WF = require('../api/_lib/workflows');
    const cur = rd('data/appointments.json', []).find((x) => x.id === 'fx-future');
    await R.reply({ phone: '40755123456', text: R.NO, appt: cur.id, akey: WF.apptKey(cur), name: 'Reamintită' }).catch((e) => console.log('reply', e.message));
    const rr = rd('data/appointments.json', []).find((x) => x.id === 'fx-future');
    check(1, 'WhatsApp „Nu ajung”: cancelledAt', rr.status === 'anulata' && !!rr.cancelledAt, rr);
    await require('../api/_lib/site-confirm').cancel('fx-site').catch((e) => console.log('site', e.message));
    const sc = rd('data/appointments.json', []).find((x) => x.id === 'fx-site');
    check(1, 'site, unconfirmed: cancelledAt', sc.status === 'anulata' && !!sc.cancelledAt, sc);
    const G = require('../api/portal-ghl');
    const conn = { city: 'Timișoara', ctx: { map: { calendars: {}, users: {} }, cals: new Map([['cal1', { name: 'Timișoara corporale' }]]), empById: new Map() } };
    const g = G.apptOf({ id: 'ge1', calendarId: 'cal1', startTime: '2026-11-12T10:00:00+02:00', appointmentStatus: 'cancelled', dateUpdated: '2026-11-11T09:00:00.000Z' }, conn, { id: 'c1', name: 'X' });
    check(1, 'HighLevel: its cancellation time', g && g.appt.cancelledAt === '2026-11-11T09:00:00.000Z' && !C.lateCancel(g.appt), g && g.appt);
  }

  // 2. consultations with an upsell: of the ones that came
  {
    const A = [{ id: 'k1', date: day(-3), time: '10:00', status: 'finalizata', treatment: 'Consultație gratuită', location: 'Arad', clientId: 'q1' },
      { id: 'k2', date: day(-3), time: '11:00', status: 'confirmata', treatment: 'Consultație gratuită', location: 'Arad', clientId: 'q2' },
      { id: 'k3', date: day(-2), time: '11:00', status: 'programata', treatment: 'Consultație gratuită', location: 'Arad', clientId: 'q3' }];
    const S = [{ source: 'incasare', date: day(-3), clientId: 'q1', amount: 900, upsell: 2000, location: 'Arad' }, { source: 'incasare', date: day(-2), clientId: 'q3', amount: 100, location: 'Arad' }];
    const c = C.consults(A, S, 'Arad', day(-10), TODAY);
    check(2, 'only the consultations that came (finished, or paid that day)', c.total === 2 && c.withPackage === 1 && c.pct === 50, c);
  }

  // 3. the 1.500 rule
  {
    const E = [{ id: 'x1', role: 'cosmetician', location: 'Timisoara' }, { id: 'x2', role: 'cosmetician', location: 'Timișoara' }, { id: 'x3', role: 'cosmetician', location: 'Timișoara', trainedOfficial: false }];
    const S = [{ source: 'incasare', performedBy: 'x1', date: day(-2), amount: 1500.4 }, { source: 'incasare', performedBy: 'x2', date: day(-2), amount: 1500 }, { source: 'incasare', performedBy: 'x3', date: day(-2), amount: 900 }];
    const t = C.cosmeticians(E, S, [], 'Timișoara', day(-5), TODAY);
    const by = Object.fromEntries(t.map((x) => [x.id, x]));
    check(3, 'clinic by clinicOf („Timisoara”)', !!by.x1, t.map((x) => x.id));
    check(3, '1.500,4 a day: over (perDay shows 1.500)', by.x1 && by.x1.ok && by.x1.perDay === 1500, by.x1);
    check(3, 'exactly 1.500: not over, as the pay', by.x2 && !by.x2.ok, by.x2);
    const cond = MP.conditionOf(E, S, [], ['Timișoara'], MONTH, TODAY);
    check(3, 'the same as manager-pay conditionOf', cond.people.find((p) => p.id === 'x1').ok === by.x1.ok && cond.people.find((p) => p.id === 'x2').ok === by.x2.ok, cond.people);
    check(3, 'în formare: marked, out of the condition', by.x3 && by.x3.trainee && by.x3.label === 'în formare' && cond.training.some((x) => x.id === 'x3'), by.x3);
    const st = await api('admin', 'portal-manager', { action: 'stats' });
    const tm = st.cities && st.cities['Timișoara'];
    check(3, 'Manager page: Irina („în formare”) out of the bonus count', tm && tm.team.some((x) => x.id === 'e-c4' && x.trainee) && tm.bonus.counted === tm.team.filter((x) => x.days > 0 && !x.trainee).length, tm && tm.bonus);
  }

  // 4. „reprogramată” left on a passed day: a no-show everywhere
  {
    const A = [{ id: 'r1', date: day(-2), time: '10:00', status: 'reprogramata', treatment: 'Lipo', location: 'Arad', clientId: 'rr1', createdAt: legacyAt }];
    const v = C.visitStats(A, [], 'Arad', TODAY, 30, []);
    check(4, 'visitStats: due and not came', v.due === 1 && v.came === 0 && v.noShow === 1, v);
    const M = K.model({ appointments: A, sales: [], now: Date.now() });
    check(4, 'KPI model: due, not came', M.A[0].due && !M.A[0].came, M.A[0]);
    const s1 = await api('admin', 'portal-followups', { action: 'sheet', employeeId: 'e-c1', month: day(-2).slice(0, 7) });
    const full = (id, status) => Object.assign({}, rd('data/appointments.json', []).find((x) => x.id === id), { action: 'update', status });
    const u2 = await api('admin', 'portal-appointments', full('fx-reprog', 'programata'));
    const s2 = await api('admin', 'portal-followups', { action: 'sheet', employeeId: 'e-c1', month: day(-2).slice(0, 7) });
    check(4, '1:1 sheet: the same no-shows as „programată”', u2.ok && s1.now && s2.now && s1.now.noShows === s2.now.noShows && s1.now.visits === s2.now.visits, [u2, s1.now, s2.now]);
    await api('admin', 'portal-appointments', full('fx-reprog', 'reprogramata'));
  }

  // 5. who left: her hours up to her last day, her bookings after it not the team's
  {
    const B = require('../api/_lib/booking');
    const cfg = await B.settings({ team: true });
    const doc = cfg.team.doc;
    const before = T.whoWorks(doc, day(-5), 'Arad', { ids: cfg.team.ids, until: cfg.team.until }).some((w) => w.employeeId === 'e-c5');
    const after = T.whoWorks(doc, day(-1), 'Arad', { ids: cfg.team.ids, until: cfg.team.until }).some((w) => w.employeeId === 'e-c5');
    check(5, 'schedule: works up to leftAt, not after', before && !after, { before, after });
    const all = rd('data/appointments.json', []);
    const fl = C.fill(cfg, 'Arad', day(2), day(2), C.normalize({ appts: all, emps }).appts, 150);
    check(5, 'fill: her booking after leftAt is „rămasă fără cosmeticiană”, not booked', fl.orphanHours === 2, fl);
    const capPast = C.capMin(cfg, 'Arad', day(-5), all), capAfter = C.capMin(cfg, 'Arad', day(-1), all);
    const without = Object.assign({}, cfg); Object.defineProperty(without, 'team', { value: Object.assign({}, cfg.team, { until: new Map() }), enumerable: false });
    const capGone = C.capMin(without, 'Arad', day(-5), all);
    check(5, 'capacity of a day before leftAt keeps her shift (8 h)', capPast > 0 && capPast - capGone === 480, { capPast, capGone, capAfter });
  }

  // 6. the costs the manager sends: decided once, a new one replaces the accepted one
  {
    const recs = () => { const e = rd('data/expense-tracker.json', { months: {} }); const m = (e.months || {})[MONTH] || {}; return { c: ((m.rec || {}).consumables || []).map((x) => x.lei), o: ((m.rec || {}).other || []).map((x) => x.lei) }; };
    const p1 = await api('manager', 'portal-salariu', { action: 'propose', month: MONTH, consumables: 100, other: 50, note: 'prima' });
    const d1 = await api('admin', 'portal-salariu', { action: 'proposal_decide', month: MONTH, decision: 'accept' });
    const d2 = await api('admin', 'portal-salariu', { action: 'proposal_decide', month: MONTH, decision: 'accept' });
    const r1 = recs();
    check(6, 'accepted once, the second tap adds nothing', p1.ok && d1.ok && d2.ok && d2.already && r1.c.join() === '100' && r1.o.join() === '50', { p1, d1, d2, r1 });
    const [x, y] = await Promise.all([api('admin', 'portal-salariu', { action: 'proposal_decide', month: MONTH, decision: 'accept' }), api('admin', 'portal-salariu', { action: 'proposal_decide', month: MONTH, decision: 'decline' })]);
    check(6, 'a decided one stays decided', x.already && y.already && recs().c.join() === '100', { x, y });
    await api('manager', 'portal-salariu', { action: 'propose', month: MONTH, consumables: 200, note: 'a doua' });
    const r2 = recs();
    check(6, 'sent again: waits, the accepted records stay meanwhile', r2.c.join() === '100' && r2.o.join() === '50', r2);
    await Promise.all([api('admin', 'portal-salariu', { action: 'proposal_decide', month: MONTH, decision: 'accept' }), api('admin', 'portal-salariu', { action: 'proposal_decide', month: MONTH, decision: 'accept' })]);
    const r3 = recs();
    check(6, 'accepted: replaces the earlier one (no double count), double tap at once', r3.c.join() === '200' && r3.o.length === 0, r3);
    const notes = rd('data/notifications.json', []).filter((n) => n.tag === 'mgr-costs-' + MONTH);
    check(10, 'the manager\'s costs open Cheltuieli', notes.length && notes.every((n) => n.go === 'cheltuieli/propunere@' + MONTH && /Le găsești la Cheltuieli\./.test(n.text)), notes[0]);
  }

  // 7. unanswered messages: never the candidates
  {
    const k = await api('admin', 'kpi', null, 'period=7d');
    const fresh = rd('data/whatsapp-conversations.json', []).filter((c) => c.phone !== '40733333333');
    const M = K.model({ conversations: fresh, now: Date.now() });
    const expect = K.messagesOf(M, k.range, []).team.unanswered;
    check(7, 'KPI unanswered without the candidate', k.messages && k.messages.team.unanswered === expect, { got: k.messages && k.messages.team, expect });
    check(7, 'KPI alert agrees', !(k.alerts || []).some((a) => a.kind === 'wa') || (k.alerts || []).find((a) => a.kind === 'wa').name === String(expect), (k.alerts || []).find((a) => a.kind === 'wa'));
  }

  // 8. candidates: no contact made from their chat, hidden from reception, not in her unread count
  {
    await api('receptie', 'portal-whatsapp', { action: 'list' });
    const made = rd('data/clients.json', []).filter((c) => /3333333$/.test(String(c.phone).replace(/\D/g, '')));
    check(8, 'Mesaje list: no contact for a candidate', made.length === 0, made);
    const rc = await api('receptie', 'portal-contacts', { action: 'list', q: 'Candidată', limit: 100 });
    const ac = await api('admin', 'portal-contacts', { action: 'list', q: 'Candidată', limit: 100 });
    check(8, 'Contacte: hidden from reception, seen by George', rc.ok && !rc.contacts.some((c) => c.id === 'cl-cand2') && ac.contacts.some((c) => c.id === 'cl-cand2'), { rc: rc.total, ac: ac.total });
    const rg = await api('receptie', 'portal-contacts', { action: 'get', id: 'cl-cand2' });
    check(8, 'Contacte: her sheet closed to reception', rg._status === 404, rg);
    const pd = await api('receptie', 'portal-data', null, ''), pa = await api('admin', 'portal-data', null, '');
    // reception is one desk for both clinics (16.11, as Mesaje lists them): the owner's count without the candidate's chat
    check(8, 'waUnread (reception, both clinics): not the candidate\'s chat', pd.waUnread === pa.waUnread - 1, { rec: pd.waUnread, admin: pa.waUnread });
  }

  // 9. Activitate: reads are not changes; the new sections have their names
  {
    await api('admin', 'portal-followups', { action: 'counts' });
    await api('admin', 'portal-followups', { action: 'free' });
    await api('admin', 'portal-appointments', { action: 'orphans' });
    await api('admin', 'portal-employees', { action: 'manual_list' });
    await api('admin', 'portal-incasari', { action: 'dues' });
    await api('admin', 'portal-content', { action: 'gallery' });
    const lines = (await api('admin', 'portal-activity', null, 'days=1')).lines || [];
    const bad = lines.filter((l) => ['counts', 'free', 'orphans', 'manual_list', 'dues', 'gallery', 'packages', 'recontact', 'people', 'sheet', 'results'].includes(l.action));
    check(9, 'no line for a read', bad.length === 0, bad.map((l) => l.path + ':' + l.action));
    const sal = lines.filter((l) => l.path === 'portal-salariu');
    check(9, 'Costuri: a named area and verb', sal.length && sal.every((l) => l.area === 'Cheltuieli și bonus' && /costuri/.test(l.verb)), sal.slice(0, 2));
  }

  // 11. the euro rate: 4 decimals; the month's sheet adds up exactly
  {
    check(11, 'rate kept with 4 decimals', MP.eurRateOf('4,97716') === 4.9772 && MP.cleanEntry({ eurRate: 4.9771 }).eurRate === 4.9771);
    await api('admin', 'portal-salariu', { action: 'costs_save', month: MONTH, eurRate: '4.9771', lines: { credits: 1234.56, rentTm: 1000.5, rentAr: 700.25, laser: 999.99, accounting: 500, salaries: 20000.49, claude: 100 }, over: {} });
    const cv = await api('admin', 'portal-salariu', null, 'view=costs&month=' + MONTH);
    const rows = (cv.costs && cv.costs.rows) || [];
    const sum = rows.reduce((a, r) => a + (Number(r.lei) || 0), 0);
    check(11, 'lines in whole lei; collections - costs = profit', rows.length && rows.every((r) => r.lei == null || Number.isInteger(r.lei)) && sum === cv.costs.total && Number.isInteger(cv.collections) && cv.collections - cv.costs.total === cv.profit, { total: cv.costs && cv.costs.total, sum, collections: cv.collections, profit: cv.profit, rate: cv.entry && cv.entry.eurRate });
  }

  // 12. the morning: packages without a booking and who to call again, for the manager
  {
    const F = require('../api/_lib/followups'), R = require('../api/_lib/roles');
    const mgr = emps.find((e) => e.id === 'e-mgr');
    const team = await R.teamOf({ role: 'manager', employeeId: 'e-mgr' }, require('../api/_lib/store').readJSON, rd('data/employees.json', []));
    const clinics = R.managesOf(mgr);
    const cnt = await F.counts(clinics);
    const items = await F.morningItems(clinics, { team });
    const pk = items.find((x) => x.kind === 'pachete'), rc = items.find((x) => x.kind === 'resunat');
    check(12, 'packages without a booking, when there are any', cnt.packagesUnbooked ? pk && pk.count === cnt.packagesUnbooked && pk.go === 'programari/pachete' : !pk, { cnt, pk });
    check(12, 'to call again now, when there are any', cnt.callAgain ? rc && rc.count === cnt.callAgain : !rc, { cnt, rc });
    const own = await F.morningItems(['Timișoara', 'Arad'], {});
    check(12, 'not for the owner (as asked: the manager)', !own.some((x) => x.kind === 'pachete' || x.kind === 'resunat'));
  }

  // 13. the weekly report: „came” as on the KPI page
  {
    const dr = await api('manager', 'portal-manager', { action: 'report_draft', week: day(-7) });
    const n = dr.numbers && dr.numbers['Timișoara'];
    const all = C.normalize({ appts: rd('data/appointments.json', []), sales: rd('data/sales.json', []), emps: rd('data/employees.json', []) });
    const paid = C.paidDays(all.sales);
    const vis = all.appts.filter((a) => C.visit(a) && a.location === 'Timișoara' && a.date >= dr.week && a.date <= dr.to);
    check(13, 'shows = cameBy', n && n.shows === vis.filter((a) => C.cameBy(a, paid)).length, { shows: n && n.shows, expect: vis.filter((a) => C.cameBy(a, paid)).length });
  }

  // 14. WhatsApp's month in Bucharest
  {
    const W = require('../api/_lib/wa-cost');
    const b = W.monthBounds('2026-11'), c = W.monthBounds('2026-04');
    check(14, 'November from 31.10 22:00 UTC to 30.11 22:00 UTC; April from 31.03 21:00 UTC', b.start === Date.parse('2026-10-31T22:00:00Z') / 1000 && b.end === Date.parse('2026-11-30T22:00:00Z') / 1000 && c.start === Date.parse('2026-03-31T21:00:00Z') / 1000);
  }

  // 15. who did what: names, natural roles
  {
    const sv = await api('manager', 'portal-legal', { action: 'save', scope: 'salon:Timișoara', item: 'onrc', patch: { notes: 'verificat' } });
    const it = sv.data && sv.data.scopes['salon:Timișoara'].items.onrc;
    const mgr = rd('data/employees.json', []).find((e) => e.id === 'e-mgr');
    check(15, 'Acte: the person\'s own name', it && it.updatedBy === mgr.name, it);
    const info = await require('../api/portal-leave').employeeInfo('e-mgr');
    check(15, 'Concediu: „Manager”', info.role === 'Manager', info);
  }

  // 16-17. texts the team reads: no stiff titles
  {
    const nuki = fs.readFileSync(path.join(__dirname, '../api/portal-nuki.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '../api/_lib/nuki-edit.js'), 'utf8');
    check(16, 'Nuki: no „proprietar…” as a person', !/asistentul personal al proprietarului|pentru proprietar|fața proprietarului|Propune proprietarului|\(proprietarul, 14\.11\)/.test(nuki) && !/decide George|spui că decide/.test(nuki));
    const ax = JSON.stringify(require('../api/_lib/academy-extra.js'));
    check(17, 'Traininguri: no „managerul”', !/[Mm]anagerul/.test(ax));
    { const AL = require('../api/_lib/expenses').alertLink;
      check(10, 'Plăți alerts open Cheltuieli (the row, or the filter of its month)', /go: alertLink\(due, 'open'\), tag: 'plati-azi-'/.test(fs.readFileSync(path.join(__dirname, '../api/_lib/expenses.js'), 'utf8')) &&
        AL([{ key: 'claude', month: '2026-11' }], 'open') === 'cheltuieli/claude@2026-11' && AL([{ key: 'a', month: '2026-10' }, { key: 'b', month: '2026-11' }], 'late') === 'cheltuieli/late' && AL([{ key: 'a', month: '2026-11' }, { key: 'b', month: '2026-11' }], 'open') === 'cheltuieli/open@2026-11'); }
  }

  // 18. Meta's errors: never raw on a page
  {
    const ME = require('../api/_lib/meta-error');
    const raw = 'Error validating access token: Session has expired. https://graph.facebook.com/v21.0/act_4502494523405059/insights?access_token=EAAB1234567890abcdefghijklmnop';
    const u = ME.ui(raw), c = ME.clean(raw);
    check(18, 'ui: short Romanian, no link, no token', /Conexiunea cu Meta/.test(u) && !/http|access_token|EAA|graph/i.test(u), u);
    check(18, 'log: no token, no ids', !/EAAB|4502494523405059/.test(c) && !/https?:/.test(c), c);
    const k = await api('admin', 'kpi', null, 'period=7d');
    check(18, 'KPI „Reclamele”: adsError clean', !/http|offline|graph|token/i.test(k.adsError || '') && (k.adsState !== 'error' || !!k.adsError), { state: k.adsState, err: k.adsError });
    const am = await api('admin', 'ads-manager', null, 'period=7d');
    check(18, 'Reclame: message clean', !/http|offline|graph|access_token/i.test(String(am.message || '') + String(am.staleWhy || '')), { reason: am.reason, message: am.message });
  }

  // 19. the seed: real stage, 07… numbers, today's leads already in
  {
    const L = rd('data/leads.json', []).filter((l) => /^Lead azi/.test(l.name || ''));
    check(19, 'today\'s leads: lead_nou, 07…, in the past', L.length && L.every((l) => l.stage === 'lead_nou' && /^07\d{8}$/.test(l.phone) && Date.parse(l.createdAt) <= Date.now()), L.map((l) => [l.stage, l.phone, l.createdAt]));
  }

  // 20. Plăți (the owner, 16.11): paid in parts, a month's sum, his own rows, who left has no salary row, owner only
  {
    const EX = require('../api/_lib/expenses');
    const store = require('../api/_lib/store');
    const NEXT = EX.nextMonth(MONTH);
    const get = (m) => api('admin', 'portal-plati', null, 'month=' + (m || MONTH));
    const post = (b) => api('admin', 'portal-plati', Object.assign({ month: MONTH }, b));
    const rowOf = (d, k) => (d.rows || []).find((r) => r.key === k);
    const sums = (d) => { const s = d.summary, rows = d.rows; const paid = rows.reduce((a, r) => a + r.paidLei, 0), rest = rows.filter((r) => !r.done).reduce((a, r) => a + (r.rest || 0), 0); return { ok: Math.abs(s.paid - paid) < 0.01 && Math.abs(s.toPay - rest) < 0.01 && Math.abs(s.planned - (s.paid + s.toPay)) < 0.01, s, paid, rest }; };
    // who sees it: George only
    const gm = await api('manager', 'portal-plati', null, 'month=' + MONTH), gr = await api('receptie', 'portal-plati', null, 'month=' + MONTH);
    const pm = await api('manager', 'portal-plati', { action: 'own_add', month: MONTH, label: 'x', lei: 1 }), pp = await api('manager', 'portal-plati', { action: 'pay', month: MONTH, key: 'claude' });
    const pr = await api('receptie', 'portal-plati', { action: 'amount', month: MONTH, key: 'claude', lei: 5 }), pc = await api('manager', 'portal-plati', { action: 'own_copy', month: NEXT });
    check(20, 'manager and reception: 403 on every read and action', [gm, gr, pm, pp, pr, pc].every((x) => x._status === 403), [gm, gr, pm, pp, pr, pc].map((x) => x._status));
    // who left: no salary row from the month she left (her pay of the month before included); she would have one
    const d0 = await get();
    const ctx = await MP.loadCtx(store.readJSON);
    ctx.employees = ctx.employees.map((e) => (e.id === 'e-c5' ? Object.assign({}, e, { active: true, leftAt: '' }) : e));
    const would = EX.tracker(ctx, MONTH).rows.some((r) => r.key === 'sal:e-c5');
    check(20, 'who left (A plecat): no salary row this month', d0._status === 200 && would && !rowOf(d0, 'sal:e-c5') && d0.rows.some((r) => r.group === 'sal'), { would, keys: (d0.rows || []).map((r) => r.key) });
    const ctx2 = await MP.loadCtx(store.readJSON);
    ctx2.employees = ctx2.employees.map((e) => (e.id === 'e-c5' ? Object.assign({}, e, { leftAt: EX.nextMonth(MONTH) + '-03' }) : e));
    check(20, 'who left next month: still this month, not from that month on', EX.tracker(ctx2, MONTH).rows.some((r) => r.key === 'sal:e-c5') && !EX.tracker(ctx2, NEXT).rows.some((r) => r.key === 'sal:e-c5'));
    const where0 = d0.where && d0.where.total;
    // his own row, paid in parts
    const a = await post({ action: 'own_add', label: 'Utilități proba', lei: 1000, day: 20, note: 'factura' });
    const k = a.key;
    const p1 = await post({ action: 'pay', key: k, lei: 300 }), p2 = await post({ action: 'pay', key: k, lei: '200', date: day(-1), note: 'a doua' });
    let d = await get(), r = rowOf(d, k);
    check(20, 'own row: 300 + 200 of 1000 is partial, 500 left', a.ok && p1.ok && p2.ok && r && r.partial && !r.done && r.paidLei === 500 && r.rest === 500 && r.parts.length === 2 && r.parts[0].date === day(-1), r);
    check(20, 'totals: paid + left = planned (parts count as paid)', sums(d).ok, sums(d));
    const [t1, t2] = await Promise.all([post({ action: 'pay', key: k }), post({ action: 'pay', key: k })]);
    d = await get(); r = rowOf(d, k);
    check(20, 'the tick pays what is left once (double tap)', t1.ok && t2.ok && r.done && r.paidLei === 1000 && r.rest === 0 && r.parts.length === 3 && r.state === 'paid', { t1, t2, r });
    const del = await post({ action: 'part_del', key: k, id: r.parts[0].id });
    d = await get(); r = rowOf(d, k);
    check(20, 'a part removed: partial again', del.ok && r.partial && r.rest === 200 && r.paidLei === 800, r);
    const bad = await post({ action: 'pay', key: k, lei: -5 }), bad2 = await post({ action: 'own_add', label: '', lei: 5 }), bad3 = await post({ action: 'own_add', label: 'x', day: 40 });
    check(20, 'bad sums and days refused', bad._status === 400 && bad2._status === 400 && bad3._status === 400, [bad, bad2, bad3].map((x) => x.error));
    // this month's sum of a row
    const target = d.rows.find((x) => x.group === 'sal' && x.lei > 0);
    const am = await post({ action: 'amount', key: target.key, lei: target.lei + 111 });
    d = await get(); r = rowOf(d, target.key);
    check(20, 'a sum for this month only: new sum, the usual one kept', am.ok && r.lei === Math.round((target.lei + 111) * 100) / 100 && r.orig === target.lei && r.changed, r);
    await post({ action: 'pay', key: target.key, lei: 100 });
    d = await get(); r = rowOf(d, target.key);
    check(20, 'a part on the changed sum: left = new sum - part', r.rest === Math.round((target.lei + 11) * 100) / 100, r);
    await post({ action: 'amount', key: target.key, lei: '' });
    d = await get(); r = rowOf(d, target.key);
    check(20, 'the usual sum again', r.lei === target.lei && !r.changed, r);
    // monthly rows
    const mr = await post({ action: 'own_add', label: 'Chirie extra proba', lei: 500, day: 3, repeat: true });
    const dn = await get(NEXT);
    check(20, 'monthly row: this month and the next', rowOf(await get(), mr.key) && rowOf(dn, mr.key) && rowOf(dn, mr.key).own.repeat, dn.rows && dn.rows.map((x) => x.key));
    const sk = await api('admin', 'portal-plati', { action: 'own_del', month: NEXT, key: mr.key, scope: 'month' });
    check(20, 'monthly row left out of one month only', sk.ok && !rowOf(await get(NEXT), mr.key) && rowOf(await get(), mr.key));
    const one = await post({ action: 'own_add', label: 'Furnizor proba', lei: 250 });
    const nd = rowOf(await get(), one.key);
    check(20, 'a row without a day: fără dată', nd && nd.due === null && (nd.state === 'nodate' || nd.state === 'late'), nd);
    const cp = await api('admin', 'portal-plati', { action: 'own_copy', month: NEXT }), cp2 = await api('admin', 'portal-plati', { action: 'own_copy', month: NEXT });
    const dn2 = await get(NEXT);
    check(20, 'Copiază din luna trecută: once, by name', cp.ok && cp.copied === 2 && cp2.copied === 0 && dn2.rows.filter((x) => x.label === 'Furnizor proba').length === 1 && dn2.copyable === 0, { cp, cp2, copyable: dn2.copyable });
    const ed = await post({ action: 'own_edit', key: mr.key, label: 'Chirie extra proba', lei: 500, day: 3, repeat: false });
    check(20, 'monthly turned off: stays this month, gone after', ed.ok && rowOf(await get(), mr.key) && !rowOf(await get(NEXT), mr.key));
    // a category with a payment day
    const rd1 = await post({ action: 'rec_day', line: 'utilities', day: 10 });
    await post({ action: 'rec_add', line: 'utilities', lei: 250, date: MONTH + '-02', note: 'curent' });
    d = await get(); r = rowOf(d, 'rec:utilities');
    check(20, 'Utilități with a day: a payment row with its sum', rd1.ok && r && r.lei === 250 && r.due === MONTH + '-10' && (d.rec.find((x) => x.key === 'utilities') || {}).day === 10, r);
    await post({ action: 'rec_day', line: 'utilities', day: 0 });
    check(20, 'and off again', !rowOf(await get(), 'rec:utilities'));
    check(20, 'Taxe la stat on the 25th by default', (rowOf(await get(), 'taxes') || {}).due === MONTH + '-25');
    // a tick from before the parts: one full part, written as a part on the next change
    const before = rd('data/expense-tracker.json', { months: {} });
    const sal = d.rows.find((x) => x.group === 'sal' && x.key !== target.key && x.lei > 0);
    before.months[MONTH].paid = Object.assign({}, before.months[MONTH].paid, { [sal.key]: { at: new Date().toISOString(), by: 'e-adm', byName: 'Admin', lei: sal.lei, note: '' } });
    wr('data/expense-tracker.json', before);
    d = await get(); r = rowOf(d, sal.key);
    const lg = r && r.done && r.parts.length === 1 && r.parts[0].lei === sal.lei;
    await post({ action: 'note', key: k, note: 'x' });
    const after = rd('data/expense-tracker.json', { months: {} }).months[MONTH];
    check(20, 'old tick: one full part, migrated on the next change', lg && after.parts[sal.key] && after.parts[sal.key].length === 1 && !(after.paid || {})[sal.key], { r, after: after.parts[sal.key], paid: after.paid });
    d = await get();
    check(20, 'totals still add up', sums(d).ok, sums(d));
    // the profit's costs are not the rows of Plăți
    check(20, 'Unde se duc banii: only the record added changes it (payments and own rows do not)', d.where && Math.abs(d.where.total - (where0 + 250)) < 0.01, { before: where0, after: d.where && d.where.total });
    // automatic: a direct debit settles on its day, Meta's card rows are paid as spent, the taxes on the salaries estimated
    const dd = await post({ action: 'own_add', label: 'Debit proba', lei: 300, day: 1 });
    const ap = await post({ action: 'autopay', key: dd.key, on: true });
    d = await get(); r = rowOf(d, dd.key);
    check(20, 'Se plătește automat: paid on its day, a part „automat”, no tick', ap.ok && r.autoPay && r.done && r.parts.length === 1 && r.parts[0].auto && r.parts[0].date === MONTH + '-01', r);
    const apSal = await post({ action: 'autopay', key: target.key, on: true });
    check(20, 'never on a salary', apSal._status === 400, apSal);
    const t0 = EX.tracker(Object.assign(await MP.loadCtx(store.readJSON)), MONTH);
    check(20, 'automatic rows: no morning reminder, not „Următoarea”', !(d.next && d.next.key === dd.key) && /r\.paid \|\| r\.autoPay/.test(fs.readFileSync(path.join(__dirname, '../api/_lib/expenses.js'), 'utf8')) && t0.rows.find((x) => x.key === dd.key).done);
    await post({ action: 'autopay', key: dd.key, on: false });
    check(20, 'turned off: to pay again', !rowOf(await get(), dd.key).done);
    const mc = rd('data/month-costs.json', { months: {} }); mc.months = mc.months || {};
    const PM = EX.prevMonth(MONTH);
    mc.months[MONTH] = Object.assign({}, mc.months[MONTH], { over: Object.assign({}, (mc.months[MONTH] || {}).over, { ads: 900 }) });
    mc.months[PM] = Object.assign({}, mc.months[PM], { lines: Object.assign({}, (mc.months[PM] || {}).lines, { salaries: 999999 }) });
    wr('data/month-costs.json', mc);
    d = await get(); r = rowOf(d, 'auto:ads');
    check(20, 'Reclame Meta: a row paid automatically with the card', r && r.lei === 900 && r.done && r.autoPay && r.group === 'card' && r.src === 'Meta', r);
    // the taxes on the salaries, calculated (ro-salary-tax.js, made-up sums)
    const RT = require('../api/_lib/ro-salary-tax');
    const g5 = RT.fromGross(5000, '2026-10'), gmin = RT.fromGross(4325, '2026-10'), gh = RT.fromGross(4050, '2026-03');
    check(20, 'salary taxes: 5.000 gross → CAS 1.250, CASS 500, deduction 562, tax 269, CAM 113, net 2.981', g5.cas === 1250 && g5.cass === 500 && g5.deduction === 562 && g5.tax === 269 && g5.cam === 113 && g5.net === 2981, g5);
    check(20, 'minimum wage (July 2026): 200 lei not taxed, net 2.699; (January) 300 lei, net 2.574', gmin.untaxed === 200 && gmin.net === 2699 && gmin.cam === 93 && gh.untaxed === 300 && gh.net === 2574, { gmin, gh });
    check(20, 'gross from net: back to the same gross (5.000, the minimum wage)', RT.grossFromNet(2981, '2026-10') === 5000 && RT.grossFromNet(2699, '2026-10') === 4325 && RT.grossFromNet(2574, '2026-03') === 4050);
    const big = RT.fromGross(9000, '2026-10');
    check(20, 'above minimum wage + 2.000: no personal deduction', big.deduction === 0 && big.tax === Math.round((9000 - 2250 - 900) * 0.1), big);
    d = await get();
    const ts = rowOf(d, 'taxsal'), tv = rowOf(d, 'taxes');
    const sumP = ts && ts.calc ? ts.calc.people.reduce((a2, x) => a2 + x.total, 0) : -1;
    check(20, 'Taxe la stat (salarii): per person, the total on the row, who left not in it', ts && !ts.typed && ts.lei === sumP && ts.calc.people.every((x) => x.cas + x.cass + x.tax + x.cam === x.total) && !ts.calc.people.some((x) => x.id === 'e-c5') && ts.due === MONTH + '-25', ts && ts.calc);
    check(20, 'Taxe la stat (TVA): only what is typed, apart', tv && tv.lei === (d.rec.find((x) => x.key === 'taxes').entries.filter((e) => e.kind !== 'salarii').reduce((a2, e) => a2 + e.lei, 0) || null), tv);
    await post({ action: 'rec_add', line: 'taxes', lei: 1500, kind: 'salarii' });
    const ts2 = rowOf(await get(), 'taxsal');
    check(20, 'the accountant\'s sum typed („Din salarii”): it replaces the calculation', ts2 && ts2.typed && ts2.lei === 1500 && ts2.calc, ts2);
    check(20, 'totals still add up with the automatic rows', sums(await get()).ok);
    d = await get();
    const nx = d.next;
    const open = d.rows.filter((x) => !x.done && x.due && x.due >= TODAY);
    check(20, 'Următoarea: the first one still to pay from today', !open.length || (nx && nx.due === open[0].due && nx.key === open[0].key), { nx, first: open[0] && open[0].key });
  }

  // 21. the break (the owner, 16.11): 30 minutes at the middle of each cosmetician's shift, from her schedule, never stored as
  // an appointment; clients win; the site skips it; it can be moved for a day (alone, or with a booking), always at :00/:30
  {
    let D2 = day(10); while ([0, 6].includes(new Date(D2 + 'T12:00:00Z').getUTCDay())) D2 = day(Math.round((Date.parse(D2 + 'T12:00:00Z') - Date.parse(TODAY + 'T12:00:00Z')) / 864e5) + 1);
    const mid = (f, t) => { const m = T.midBreak(f, t); return m == null ? null : T.hm(m); };
    check(21, 'the middle: 09-20 → 14:30, 10-19 → 14:30, 09-17 → 13:00, 09:15-17:45 → 13:30, under 5h none', mid('09:00', '20:00') === '14:30' && mid('10:00', '19:00') === '14:30' && mid('09:00', '17:00') === '13:00' && mid('09:15', '17:45') === '13:30' && mid('09:00', '13:59') === null && mid('09:00', '14:00') === '11:30');
    // her shifts that day (date entries), no client of the seed on it
    const ts2 = rd('data/team-schedule.json', {});
    ts2.dates = ts2.dates || {};
    ts2.dates[D2] = { 'e-c1': { on: true, from: '09:00', to: '20:00' }, 'e-c2': { on: true, from: '09:00', to: '20:00' }, 'e-c3': { on: true, from: '10:00', to: '19:00' } };
    wr('data/team-schedule.json', ts2);
    const weekly0 = JSON.stringify(ts2.weekly);
    wr('data/appointments.json', rd('data/appointments.json', []).filter((a) => a.date !== D2));
    const brkOn = async (id) => ((await api('admin', 'portal-appointments', { action: 'list', from: D2, to: D2 })).breaks || []).find((b) => b.employeeId === id) || null;
    const slots = async (city) => (((await api('admin', 'booking', null, 'city=' + encodeURIComponent(city) + '&service=consult')).days || []).find((x) => x.date === D2) || {}).slots || [];
    let b1 = await brkOn('e-c1'), b2 = await brkOn('e-c2'), b3 = await brkOn('e-c3');
    check(21, 'list: the breaks of the day (Arad 14:30; Timișoara: each at the middle of her own shift, the colleague with the same shift at 14:30 too)', b3 && b3.on && b3.from === '14:30' && b1 && b1.on && b1.from === '14:30' && b2 && b2.on && b2.from === '14:30', { b1, b2, b3 });
    check(21, 'never stored as an appointment', !rd('data/appointments.json', []).some((a) => a.date === D2));
    let ar = await slots('Arad'), tm = await slots('Timișoara');
    check(21, 'site, Arad (one at work): 14:30 not offered, 14:00 and 15:00 are', !ar.includes('14:30') && ar.includes('14:00') && ar.includes('15:00'), ar);
    check(21, 'site, Timișoara (two at work, the same shift, both on their break at 14:30): 14:30 not offered, 14:00 and 15:00 are', !tm.includes('14:30') && tm.includes('14:00') && tm.includes('15:00'), tm);
    // a client of the other one at 14:30: her break gives way that day, the colleague's stays; that half hour is full on the site
    const mk = (o) => Object.assign({ id: 'fx-b' + Math.random().toString(36).slice(2, 8), date: D2, location: 'Timișoara', clientName: 'Pauza Proba', clientId: 'cl-br', treatment: 'Lipo 640', status: 'programata', createdAt: at(day(-1), '10:00') }, o);
    wr('data/appointments.json', rd('data/appointments.json', []).concat([mk({ id: 'fx-b-c2', time: '14:30', endTime: '15:00', cosmeticianId: 'e-c2' })]));
    tm = await slots('Timișoara');
    check(21, 'site, Timișoara: a client of the other one at 14:30 → 14:30 full (capacity minus the break)', !tm.includes('14:30'), tm);
    b2 = await brkOn('e-c2');
    check(21, 'and her own break gives way to her client (why: client), never moved onto another hour by itself', b2 && !b2.on && b2.why === 'client' && b2.from === '14:30', b2);
    // the desk books a client over a break: no break that day
    const bk = await api('receptie', 'portal-appointments', { action: 'create', date: D2, time: '14:00', endTime: '15:00', location: 'Timișoara', cosmeticianId: 'e-c1', clientName: 'Peste Pauza', clientPhone: '0755000111', treatment: 'Lipo 640', categories: ['corporale'], amount: 0, status: 'programata' });
    b1 = await brkOn('e-c1');
    check(21, 'a client booked over her break: no break that day (why: client)', bk.ok && b1 && !b1.on && b1.why === 'client', { bk: bk.error, b1 });
    // booking + move together, from the form's chip
    const info = await api('receptie', 'portal-schedule', { action: 'break_info', date: D2, employeeId: 'e-c3', time: '14:30', endTime: '15:00' });
    check(21, 'break_info: the hour picked is on her break, the nearest free half hours offered (one before, one after)', info.clash && info.near && info.near[0] === '14:00' && info.near[1] === '15:00', info);
    const both = await api('receptie', 'portal-appointments', { action: 'create', date: D2, time: '14:30', endTime: '15:00', location: 'Arad', cosmeticianId: 'e-c3', clientName: 'Mutat Pauza', clientPhone: '0755000222', treatment: 'Lipo 640', categories: ['corporale'], amount: 0, status: 'programata', breakMove: { from: '15:00' } });
    b3 = await brkOn('e-c3');
    check(21, 'booking + „Mută pauza la 15:00” saved together', both.ok && b3 && b3.on && b3.from === '15:00' && b3.moved && rd('data/appointments.json', []).some((a) => a.id === both.appointment.id), { both: both.error, b3 });
    // (on her break at 15:00, as reception may: TIME 4)
    const bad = await api('receptie', 'portal-appointments', { action: 'create', date: D2, time: '15:00', endTime: '15:30', location: 'Arad', cosmeticianId: 'e-c3', clientName: 'Rea Pauza', clientPhone: '0755000333', treatment: 'Lipo 640', categories: ['corporale'], amount: 0, status: 'programata', breakMove: { from: '14:30' } });
    check(21, 'booking + a move onto her other client: refused, nothing saved', bad._status === 409 && bad.error === 'break_taken' && !rd('data/appointments.json', []).some((a) => a.clientName === 'Rea Pauza'), bad);
    // moving the break itself (the owner and the manager)
    const rec = await api('receptie', 'portal-schedule', { action: 'break_set', date: D2, employeeId: 'e-c3', from: '16:00' });
    check(21, 'reception cannot move a break from its sheet', rec._status === 403, rec);
    const odd = await api('manager', 'portal-schedule', { action: 'break_set', date: D2, employeeId: 'e-c3', from: '16:15' });
    const out = await api('manager', 'portal-schedule', { action: 'break_set', date: D2, employeeId: 'e-c3', from: '09:30' });
    const taken = await api('manager', 'portal-schedule', { action: 'break_set', date: D2, employeeId: 'e-c3', from: '14:30' });
    check(21, 'refused: not at :00/:30, outside her shift, over her client', odd.error === 'invalid_time' && out.error === 'outside_shift' && taken.error === 'break_taken', { odd: odd.error, out: out.error, taken: taken.error });
    const mv = await api('manager', 'portal-schedule', { action: 'break_set', date: D2, employeeId: 'e-c3', name: 'Dana Proba', from: '16:30' });
    b3 = await brkOn('e-c3');
    check(21, 'the manager moves it: 16:30, marked moved with who', mv.ok && b3.from === '16:30' && b3.moved && /^Ioana/.test(b3.by) && b3.at, b3);
    check(21, 'the weekly rule never changes', JSON.stringify(rd('data/team-schedule.json', {}).weekly) === weekly0);
    ar = await slots('Arad');
    check(21, 'the site follows the moved break: 16:30 gone, 14:00 back', !ar.includes('16:30') && ar.includes('14:00'), ar);
    const slotList = await api('admin', 'portal-schedule', { action: 'break_info', date: D2, employeeId: 'e-c3' });
    check(21, 'her half hours: only :00/:30, inside her shift, her client\'s taken', (slotList.slots || []).every((x) => /:(00|30)$/.test(x.from)) && slotList.slots[0].from === '10:00' && slotList.slots[slotList.slots.length - 1].to === '19:00' && slotList.slots.find((x) => x.from === '14:30').free === false, slotList.slots);
    // her shift changes later that day: a moved break that no longer fits goes back to the middle
    const ts3 = rd('data/team-schedule.json', {}); ts3.dates[D2]['e-c3'] = { on: true, from: '10:00', to: '16:00' }; wr('data/team-schedule.json', ts3);
    b3 = await brkOn('e-c3');
    check(21, 'shift shortened to 10-16: the 16:30 break falls back to the middle (13:00)', b3 && b3.on && b3.from === '13:00' && b3.fell, b3);
    // an odd shift: only :00/:30 starts fully inside it
    await api('admin', 'portal-schedule', { action: 'break_reset', date: D2, employeeId: 'e-c3', name: 'Dana Proba' });
    Object.assign(ts3, rd('data/team-schedule.json', {}));
    ts3.dates[D2]['e-c3'] = { on: true, from: '09:15', to: '17:45' }; wr('data/team-schedule.json', ts3);
    const oddInfo = await api('admin', 'portal-schedule', { action: 'break_info', date: D2, employeeId: 'e-c3' });
    b3 = await brkOn('e-c3');
    const odd2 = await api('admin', 'portal-schedule', { action: 'break_set', date: D2, employeeId: 'e-c3', from: '09:15' });
    check(21, 'shift 09:15-17:45: break 13:30, half hours 09:30 … 17:00, 09:15 refused', b3.from === '13:30' && oddInfo.slots[0].from === '09:30' && oddInfo.slots[oddInfo.slots.length - 1].from === '17:00' && oddInfo.slots.every((x) => /:(00|30)$/.test(x.from)) && odd2.error === 'invalid_time', { b3, first: oddInfo.slots && oddInfo.slots[0], odd2: odd2.error });
    ts3.dates[D2]['e-c3'] = { on: true, from: '10:00', to: '19:00' }; wr('data/team-schedule.json', ts3);
    // off and back
    await api('admin', 'portal-schedule', { action: 'break_off', date: D2, employeeId: 'e-c3', name: 'Dana Proba' });
    b3 = await brkOn('e-c3');
    ar = await slots('Arad');
    check(21, '„Fără pauză azi”: no break, its half hour on the site again', b3 && !b3.on && b3.why === 'off' && ar.includes('14:00'), { b3, ar });
    await api('admin', 'portal-schedule', { action: 'break_reset', date: D2, employeeId: 'e-c3', name: 'Dana Proba' });
    b3 = await brkOn('e-c3');
    check(21, '„Înapoi la mijloc”: 14:30 again (her client there now: no break, why client)', b3 && b3.from === '14:30' && !b3.on && b3.why === 'client', b3);
    // the calendar's fill: her minutes for clients are 30 fewer on a day with a break (another weekday, no clients)
    let D3 = day(11); while ([0, 6].includes(new Date(D3 + 'T12:00:00Z').getUTCDay()) || D3 === D2) D3 = new Date(Date.parse(D3 + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
    const ts4 = rd('data/team-schedule.json', {}); ts4.dates[D3] = { 'e-c1': { on: true, from: '09:00', to: '20:00' }, 'e-c2': { on: true, from: '09:00', to: '20:00' } }; wr('data/team-schedule.json', ts4);
    wr('data/appointments.json', rd('data/appointments.json', []).filter((a) => !(a.date === D3 && a.location === 'Timișoara')));
    const cfgB = await require('../api/_lib/booking').settings({ team: true });
    const fl = C.fill(cfgB, 'Timișoara', D3, D3, rd('data/appointments.json', []));
    check(21, 'fill: the team\'s hours minus the breaks (2 × 11h − 2 × 0.5h = 21h)', fl.capHours === 21, fl);
    // activity: the move is a line
    const actFile = rd('data/activity/' + TODAY + '.json', []);
    check(21, 'Activitate: „a mutat pauza pentru” with the hour', actFile.some((x) => /a mutat pauza/.test(x.verb) && /16:30/.test(x.detail || '')), actFile.slice(-6).map((x) => x.verb + ' ' + x.detail));
    // today: her phone hears the move
    const tsT = rd('data/team-schedule.json', {}); tsT.dates[TODAY] = Object.assign({}, tsT.dates[TODAY], { 'e-c3': { on: true, from: '06:00', to: '24:00' } }); wr('data/team-schedule.json', tsT);
    const near = await api('admin', 'portal-schedule', { action: 'break_info', date: TODAY, employeeId: 'e-c3' });
    const pick = (near.near || [])[0];
    const mvT = pick ? await api('admin', 'portal-schedule', { action: 'break_set', date: TODAY, employeeId: 'e-c3', name: 'Dana Proba', from: pick }) : {};
    const notes = rd('data/notifications.json', []);
    check(21, 'moved today: she is told „Pauza ta de azi s-a mutat la …” (no free half hour left today: skipped)', !pick || mvT.ok && notes.some((x) => x.employeeId === 'e-c3' && x.text === 'Pauza ta de azi s-a mutat la ' + pick + '.'), { pick, mvT: mvT.error, n: notes.filter((x) => x.employeeId === 'e-c3').slice(-2) });
  }

  // 22. the commission on the money received and the refunds (the owner, 16.11): 4% of each payment for an upsell, in its
  // month; a refund is a minus row in its month, takes 4% of the money back, closes or lowers the package; undo restores it
  {
    const PAY = require('../api/_lib/payroll'), CMS = require('../api/_lib/commission'), RF = require('../api/_lib/refunds');
    ROLE.cosmetician = 'e-c1';
    const emp1 = () => rd('data/employees.json', []).find((e) => e.id === 'e-c1');
    const pay1 = (m) => PAY.monthPay({ emp: emp1(), month: m, isCurrent: m === MONTH, sales: rd('data/sales.json', []), dues: rd('data/client-dues.json', []), payouts: [], bank: null, attendance: [], appointments: [] });
    const mkAppt = (id, client) => { wr('data/appointments.json', rd('data/appointments.json', []).concat([{ id, date: TODAY, time: '10:00', endTime: '11:00', location: 'Timișoara', cosmeticianId: 'e-c1', clientName: client, clientId: 'cl-' + id, treatment: 'Lipo 640', categories: ['corporale'], amount: 300, status: 'confirmata', createdAt: at(day(-3), '10:00') }])); };
    const payPkg = async (id, value, paid) => { mkAppt(id, 'Pachet ' + id); return api('receptie', 'portal-sale', { source: 'incasare', appointmentId: id, method: 'cash', performedBy: 'e-c1', parts: { session: 0, upsell: true, upsellValue: value, upsellPaid: paid, upsellWhat: 'Pachet proba ' + id } }); };
    const linesFor = (m, uid) => (pay1(m).commissionLines || []).filter((l) => l.upsellId === uid);
    const sumL = (ls) => Math.round(ls.reduce((a, l) => a + l.lei, 0) * 100) / 100;
    const dueOf = (id) => rd('data/client-dues.json', []).find((d) => d.id === id);
    const coll = () => MP.collectionsOf(rd('data/sales.json', []), rd('data/appointments.json', []), rd('data/employees.json', []), ['Timișoara', 'Arad'], MONTH, TODAY);
    // 20.11: a package sold at the consultation with nothing paid now is saved at 0 lei (the whole value owed); 0 lei
    // without an upsell is still refused
    {
      const z = await payPkg('zero-1', 2000, 0);
      check('Z', 'a package sold with 0 lei now is saved, the whole value owed', z.ok && z.entry && z.entry.amount === 0 && z.due && Math.abs(z.due.rest - 2000) < 0.01, z);
      mkAppt('zero-2', 'Zero fara upsell');
      const z2 = await api('receptie', 'portal-sale', { source: 'incasare', appointmentId: 'zero-2', method: 'cash', performedBy: 'e-c1', parts: { session: 0, upsell: false } });
      check('Z', '… but 0 lei without an upsell is refused (invalid_amount)', z2._status === 400 && z2.error === 'invalid_amount', z2);
      const z3 = await api('receptie', 'portal-sale', { source: 'incasare', appointmentId: 'zero-2', method: 'cash_card', performedBy: 'e-c1', parts: { session: 0, upsell: true, upsellValue: 900, upsellPaid: 0, upsellWhat: 'Pachet zero' } });
      check('Z', '… with cash + card picked and 0 lei now it still saves', z3.ok && z3.entry && z3.entry.amount === 0 && !z3.entry.split, z3);
    }

    // MU (20.11): the manager sells an upsell herself (on the phone): the desk picks her at „Cine a vândut upsell-ul?”; the
    // commission is hers under the cosmeticians' rules, approved only by the owner; no plan bonus, no team prize
    {
      const empM = () => rd('data/employees.json', []).find((e) => e.id === 'e-mgr');
      const payM = (m) => PAY.monthPay({ emp: empM(), month: m, isCurrent: m === MONTH, sales: rd('data/sales.json', []), dues: rd('data/client-dues.json', []), payouts: [], bank: null, attendance: rd('data/attendance.json', []), appointments: rd('data/appointments.json', []) });
      const reqOf = (r) => rd('data/sales.json', []).find((x) => x.source === 'comision' && x.incasareId === (r.entry && r.entry.id));
      const sell = (id, by, value, paid) => { mkAppt(id, 'Telefon ' + id); return api('receptie', 'portal-sale', { source: 'incasare', appointmentId: id, method: 'cash', performedBy: 'e-c1', upsellBy: by, parts: { session: 0, upsell: true, upsellValue: value, upsellPaid: paid, upsellWhat: 'Pachet vândut la telefon' } }); };
      const before = payM(MONTH);
      check('MU', 'the manager: no commission before she sells one (hasCommission, nothing counted)', before.hasCommission && !before.commission && !before.commissionWaiting, { c: before.commission, w: before.commissionWaiting });
      // validation of the seller
      const bad1 = await sell('mu-bad1', 'e-rec', 1000, 500);
      const bad2 = await sell('mu-bad2', 'e-c5', 1000, 500);
      const bad3 = await sell('mu-bad3', 'nimeni', 1000, 500);
      check('MU', 'upsellBy: reception refused (invalid_seller), who left refused (seller_left), unknown refused', bad1._status === 400 && bad1.error === 'invalid_seller' && bad2._status === 400 && bad2.error === 'seller_left' && bad3._status === 400 && bad3.error === 'invalid_seller', [bad1.error, bad2.error, bad3.error]);
      // the seller is the manager; the treatment stays the cosmetician's
      const m1 = await sell('mu-1', 'e-mgr', 1000, 500);
      const u1m = reqOf(m1);
      check('MU', 'sold by the manager: the commission request is hers, the payment stays the cosmetician\'s', m1.ok && m1.entry.performedBy === 'e-c1' && m1.entry.upsellBy === 'e-mgr' && u1m && u1m.employeeId === 'e-mgr' && u1m.status === 'pending' && m1.upsell && m1.upsell.employeeId === 'e-mgr', { err: m1.error, u: u1m && u1m.employeeId });
      // no seller given: as before, the one who did the treatment; the seller = the performer: no upsellBy kept
      const m0 = await sell('mu-0', '', 800, 800);
      const m0b = await sell('mu-0b', 'e-c1', 800, 800);
      check('MU', 'no seller (or the performer herself): the cosmetician, as before', m0.ok && reqOf(m0).employeeId === 'e-c1' && !m0.entry.upsellBy && m0b.ok && reqOf(m0b).employeeId === 'e-c1' && !m0b.entry.upsellBy, [m0.error, m0b.error]);
      // another cosmetician of the clinic can be the seller too
      const m2 = await sell('mu-2', 'e-c2', 600, 600);
      check('MU', 'another cosmetician as the seller: hers', m2.ok && reqOf(m2).employeeId === 'e-c2', m2.error);
      // 0 lei now (sold on the phone, nothing paid yet) still works with the manager as the seller
      const mz = await sell('mu-z', 'e-mgr', 2000, 0);
      check('MU', 'the 0-lei upsell with the manager as the seller: saved, whole value owed, request hers', mz.ok && mz.entry.amount === 0 && mz.due && Math.abs(mz.due.rest - 2000) < 0.01 && reqOf(mz).employeeId === 'e-mgr', mz.error);
      // waiting: her Salariu shows it as waiting
      const w = payM(MONTH);
      check('MU', 'her Salariu: the line waiting (20 lei), nothing counted yet', (w.commissionLines || []).some((l) => l.upsellId === u1m.id && l.status === 'pending' && l.lei === 20) && w.commissionWaiting >= 20 && !w.commission, { lines: w.commissionLines, w: w.commissionWaiting });
      // the approval: never by herself; the owner can; nobody decides her own
      const own = await api('manager', 'portal-approve', { saleId: u1m.id, decision: 'approve' });
      const sx = rd('data/sales.json', []); const fake = Object.assign({}, u1m, { id: 'mu-own', employeeId: 'e-adm' }); sx.push(fake); wr('data/sales.json', sx);
      const own2 = await api('admin', 'portal-approve', { saleId: 'mu-own', decision: 'approve' });
      wr('data/sales.json', rd('data/sales.json', []).filter((x) => x.id !== 'mu-own'));
      check('MU', 'her own upsell: she can\'t approve it (403); nobody approves her own (own_request)', own._status === 403 && rd('data/sales.json', []).find((x) => x.id === u1m.id).status === 'pending' && own2._status === 403 && own2.error === 'own_request', [own._status, own2._status, own2.error]);
      const ok1 = await api('admin', 'portal-approve', { saleId: u1m.id, decision: 'approve' });
      const nM = rd('data/notifications.json', []).filter((n) => n.employeeId === 'e-mgr' && n.kind === 'commission' && /COMISION ✅ - \+20 lei/.test(n.title || ''));
      check('MU', 'the owner approves it: she hears „COMISION ✅ - +20 lei”', ok1.ok && nM.length === 1, { ok: ok1.error, n: nM.length });
      const a = payM(MONTH);
      check('MU', 'her Salariu: 20 lei commission, in the total, 20 more to come; no plan bonus, no team prize', a.commission === 20 && (a.toCome || []).some((t) => t.upsellId === u1m.id && t.lei === 20) && !a.plan && !a.team && Math.abs(a.total - before.total - 20) < 0.01, { c: a.commission, total: a.total, before: before.total, plan: a.plan, team: a.team });
      const cosPay = PAY.monthPay({ emp: emp1(), month: MONTH, isCurrent: true, sales: rd('data/sales.json', []), dues: rd('data/client-dues.json', []), payouts: [], bank: null, attendance: [], appointments: [] });
      check('MU', 'the cosmetician who did the treatment: no line for the manager\'s upsell', !(cosPay.commissionLines || []).some((l) => l.upsellId === u1m.id), cosPay.commissionLines && cosPay.commissionLines.length);
      // the rest paid later („Încasează restul”): 4% of it comes to her, she hears it
      const due1 = rd('data/client-dues.json', []).find((d) => d.saleId === m1.entry.id);
      const rest = await api('receptie', 'portal-sale', { source: 'incasare', dueId: due1 && due1.id, amount: 500, method: 'transfer' });
      const r = payM(MONTH);
      const nR = rd('data/notifications.json', []).filter((n) => n.employeeId === 'e-mgr' && /Din restul pachetului/.test(n.text || ''));
      check('MU', 'the rest paid: +20 lei more for her (40), she hears it', rest.ok && r.commission === 40 && nR.length === 1, { err: rest.error, c: r.commission, n: nR.length });
      // the costs of her bonus: her commission is in „Comisioane și bonusuri” like the cosmeticians'; the 1.500 lei a day
      // condition stays the cosmeticians' (her upsell's payment stays the cosmetician's)
      const ctxM = await MP.loadCtx(require('../api/_lib/store').readJSON);
      const autos = await MP.payrollAutos(ctxM, ['Timișoara', 'Arad'], MONTH, true);
      const autos0 = await MP.payrollAutos(Object.assign({}, ctxM, { sales: ctxM.sales.filter((x) => !(x.source === 'comision' && x.employeeId === 'e-mgr')) }), ['Timișoara', 'Arad'], MONTH, true);
      const cond = MP.conditionOf(ctxM.employees, ctxM.sales, ctxM.attendance, ['Timișoara', 'Arad'], MONTH, TODAY);
      check('MU', 'manager-pay: her commission counted in the month\'s costs (+40); the condition is still only the cosmeticians\'', Math.abs(autos.commissions - autos0.commissions - 40) < 0.01 && !cond.people.some((p) => p.id === 'e-mgr') && cond.people.some((p) => p.id === 'e-c1'), { a: autos.commissions, a0: autos0.commissions });
      // an older request on her name (before 20.11) never counts; a month before: nothing
      const so = rd('data/sales.json', []); so.push(Object.assign({}, u1m, { id: 'mu-old', date: '2026-11-19', origin: 'manual', incasareId: undefined, amount: 1000, commission: 40, status: 'approved' })); wr('data/sales.json', so);
      const o = payM(MONTH), oct = payM('2026-10');
      wr('data/sales.json', rd('data/sales.json', []).filter((x) => x.id !== 'mu-old'));
      check('MU', 'before 20.11 nothing of hers counts (an older request, October)', o.commission === 40 && !(o.commissionLines || []).some((l) => l.upsellId === 'mu-old') && !oct.commission, { c: o.commission, oct: oct.commission });
      // the owner corrects the payment (another cosmetician did it): the seller stays the manager
      const m2e = rd('data/sales.json', []).find((x) => x.id === mz.entry.id);
      const up = await api('admin', 'portal-incasari', { action: 'update', id: m2e.id, date: m2e.date, method: 'cash', performedBy: 'e-c2', amount: 0, categories: m2e.categories,
        parts: { session: 0, upsell: true, upsellValue: 2000, upsellPaid: 100, upsellWhat: 'Pachet vândut la telefon' } });
      const zq = reqOf(mz);
      check('MU', 'a correction keeps her as the seller (the waiting request stays hers)', up.ok && zq && zq.employeeId === 'e-mgr' && rd('data/sales.json', []).find((x) => x.id === m2e.id).upsellBy === 'e-mgr', { err: up.error, who: zq && zq.employeeId });
      const up2 = await api('admin', 'portal-incasari', { action: 'update', id: m2e.id, date: m2e.date, method: 'cash', performedBy: 'e-c2', amount: 100, categories: m2e.categories, upsellBy: '',
        parts: { session: 0, upsell: true, upsellValue: 2000, upsellPaid: 100, upsellWhat: 'Pachet vândut la telefon' } });
      check('MU', '… and the owner can give it back to the one who did the treatment (upsellBy empty)', up2.ok && reqOf(mz).employeeId === 'e-c2' && !rd('data/sales.json', []).find((x) => x.id === m2e.id).upsellBy, up2.error);
      // the form: the choice is there, only when „Upsell” is ticked (inside its box), with the managers of the clinic
      const pm = fs.readFileSync(path.join(__dirname, '..', 'portal-money.js'), 'utf8');
      check('MU', 'Încasare: „Cine a vândut upsell-ul?” inside the upsell, sends upsellBy', /data-ups-box>[\s\S]*Cine a vândut upsell-ul\?[\s\S]*'<\/div><\/div>' \+\s*\/\/ a payment on what she still owes/.test(pm) && /upsellBy: by/.test(pm) && /e\.role === 'manager'/.test(pm));
    }

    // October, as paid: an older upsell (whole value, 1.000 → 40 lei) with a rest still owed
    const salesO = rd('data/sales.json', []);
    salesO.push({ id: 'oct-pay', source: 'incasare', employeeId: 'e-mgr', performedBy: 'e-c1', clientId: 'cl-oct', client: 'Octombrie', date: '2026-10-20', location: 'Timișoara', categories: ['corporale'], treatment: 'Pachet', amount: 500, upsell: 1000, parts: { session: 0, upsell: 500, due: 0 }, packageTotal: 1000, method: 'cash', status: 'recorded', createdAt: '2026-10-20T10:00:00Z' });
    salesO.push({ id: 'oct-up', source: 'comision', origin: 'upsell', incasareId: 'oct-pay', employeeId: 'e-c1', date: '2026-10-20', categories: ['corporale'], treatment: 'Upsell · Pachet', amount: 1000, status: 'approved', commission: 40, client: 'Octombrie', createdAt: '2026-10-20T10:00:00Z' });
    wr('data/sales.json', salesO);
    wr('data/client-dues.json', rd('data/client-dues.json', []).concat([{ id: 'oct-due', clientId: 'cl-oct', client: 'Octombrie', what: 'Pachet', location: 'Timișoara', total: 1000, paid: 500, saleId: 'oct-pay', payments: [{ saleId: 'oct-pay', amount: 500, at: '2026-10-20T10:00:00Z' }], createdAt: '2026-10-20T10:00:00Z', closedAt: null }]));
    const oct0 = pay1('2026-10');
    check(22, 'October: the old rule exactly (the whole value, 40 lei), no lines', oct0.commission === 40 && !oct0.commissionLines, oct0);

    // 1.000 package, 500 paid: 20 lei now (once approved), 20 more to come
    const p1 = await payPkg('rf-a1', 1000, 500);
    const u1 = p1.upsell && p1.upsell.id;
    check(22, 'the package: a due of 500 and one approval request', p1.ok && u1 && p1.due && p1.due.rest === 500, { err: p1.error, due: p1.due });
    let l1 = linesFor(MONTH, u1);
    check(22, 'before approval: 20 lei waiting, nothing counted', l1.length === 1 && l1[0].lei === 20 && pay1(MONTH).commissionWaiting >= 20 && l1[0].status === 'pending', l1);
    await api('admin', 'portal-approve', { saleId: u1, decision: 'approve' });
    const nApprove = rd('data/notifications.json', []).filter((n) => n.employeeId === 'e-c1' && /COMISION ✅ - \+20 lei · încă 20 lei/.test(n.title || ''));
    l1 = linesFor(MONTH, u1);
    check(22, '1.000 sale with 500 paid: 20 lei commission now (4% of 500), „500 din 1.000”', l1.length === 1 && l1[0].lei === 20 && l1[0].cash === 500 && l1[0].paidSoFar === 500 && l1[0].total === 1000 && l1[0].status === 'approved', l1);
    const come = (pay1(MONTH).toCome || []).find((t) => t.upsellId === u1);
    check(22, 'still to come: 500 lei → 20 lei; the bell says so at approval', come && come.rest === 500 && come.lei === 20 && nApprove.length === 1, { come, n: nApprove.length });
    // the rest, paid later: another 20, in its own month (here moved to December), without a new approval
    mkAppt('rf-a2', 'Pachet rf-a1');
    const ap = rd('data/appointments.json', []); ap.find((a) => a.id === 'rf-a2').clientId = 'cl-rf-a1'; wr('data/appointments.json', ap);
    const p2 = await api('receptie', 'portal-sale', { source: 'incasare', appointmentId: 'rf-a2', method: 'card', performedBy: 'e-c1', dueId: p1.due.id, parts: { session: 0, upsell: false, duePaid: 500 } });
    check(22, 'a later 500: 20 more, no new request', p2.ok && !p2.upsell && sumL(linesFor(MONTH, u1)) === 40 && rd('data/sales.json', []).filter((s) => s.source === 'comision' && s.incasareId === p2.entry.id).length === 0, { err: p2.error, l: linesFor(MONTH, u1) });
    const sDec = rd('data/sales.json', []); sDec.find((s) => s.id === p2.entry.id).date = '2026-12-03'; wr('data/sales.json', sDec);
    check(22, '… counted in its own month: 20 in November, 20 in December', sumL(linesFor(MONTH, u1)) === 20 && sumL(linesFor('2026-12', u1)) === 20, { nov: linesFor(MONTH, u1), dec: linesFor('2026-12', u1) });
    const sBack = rd('data/sales.json', []); sBack.find((s) => s.id === p2.entry.id).date = TODAY; wr('data/sales.json', sBack);

    // a whole-package refund: 4% off, the due closed, the money out of the month's collections
    const q1 = await payPkg('rf-b1', 1000, 500);
    const u2 = q1.upsell.id;
    await api('admin', 'portal-approve', { saleId: u2, decision: 'approve' });
    const c0 = coll(), comm0 = pay1(MONTH).commission, nSales0 = rd('data/sales.json', []).length, due0 = JSON.stringify(dueOf(q1.due.id));
    const kpiNet = async () => (await api('admin', 'kpi', null, 'period=month')).money;
    const costs0 = await api('admin', 'portal-salariu', null, 'view=costs&month=' + MONTH);
    const pv = await api('admin', 'portal-incasari', { action: 'refund_preview', id: q1.entry.id, scope: 'package', close: true });
    check(22, 'preview: the whole package (500), 20 lei off her commission, the rest of 500 cancelled; nothing written', pv.ok && pv.lei === 500 && pv.max === 500 && pv.cuts.length === 1 && pv.cuts[0].lei === 20 && pv.restCut === 500 && rd('data/sales.json', []).length === nSales0, pv);
    const w = await api('admin', 'portal-incasari', { action: 'refund', id: q1.entry.id, scope: 'package', close: true, reason: 'nu mai poate veni', date: TODAY, method: 'cash' });
    const row = w.refund || {};
    const dW = dueOf(q1.due.id);
    check(22, 'whole refund: a row of -500 in its day, the payment stays', w.ok && row.amount === -500 && row.kind === 'refund' && row.date === TODAY && rd('data/sales.json', []).some((s) => s.id === q1.entry.id && s.amount === 500), { err: w.error, row });
    check(22, 'whole refund: the due closed (no rest), paid 0', dW && RF && Math.max(0, dW.total - dW.paid) === 0 && dW.paid === 0 && !!dW.closedAt, dW);
    check(22, 'whole refund: her commission -20 in the refund\'s month (the package nets 0)', sumL(linesFor(MONTH, u2)) === 0 && Math.abs(pay1(MONTH).commission - (comm0 - 20)) < 0.01 && !(pay1(MONTH).toCome || []).some((t) => t.upsellId === u2), { lines: linesFor(MONTH, u2), was: comm0, now: pay1(MONTH).commission });
    check(22, 'revenue: the month\'s net collections 500 lower', Math.abs(coll() - (c0 - 500)) < 0.01, { before: c0, after: coll() });
    const costs1 = await api('admin', 'portal-salariu', null, 'view=costs&month=' + MONTH);
    check(22, 'Cheltuieli: Încasări 500 lower, Profit 480 lower (the 20 lei commission cut is a cost less)', costs1.collections === costs0.collections - 500 && costs1.profit === costs0.profit - 480, { c0: [costs0.collections, costs0.profit], c1: [costs1.collections, costs1.profit] });
    const k1 = await kpiNet(), mg1 = await api('admin', 'portal-salariu', null, 'view=manager&month=' + MONTH + '&employeeId=e-mgr');
    check(22, 'the same net for the month on KPI, Cheltuieli and the manager\'s pay', Math.round(k1.revenue) === costs1.collections && MP.lei0(coll()) === costs1.collections && (mg1.collections == null || mg1.collections === MP.lei0(MP.collectionsOf(rd('data/sales.json', []), rd('data/appointments.json', []), rd('data/employees.json', []), require('../api/_lib/roles').managesOf(rd('data/employees.json', []).find((e) => e.id === 'e-mgr')), MONTH, TODAY))), { kpi: k1.revenue, costs: costs1.collections, mgr: mg1.collections });
    const k0Pays = rd('data/sales.json', []).filter((s) => s.source === 'incasare' && s.kind !== 'refund' && s.date >= MONTH + '-01' && s.date <= TODAY).length;
    const backs = rd('data/sales.json', []).filter((s) => s.kind === 'refund' && s.date >= MONTH + '-01' && s.date <= TODAY), backLei = -backs.reduce((a2, s) => a2 + s.amount, 0);
    check(22, 'KPI: the refunds line (sum, count, share of what came in); a refund is not a payment', k1.refunds && k1.refunds.lei === backLei && backLei >= 500 && k1.refunds.count === backs.length && k1.refunds.pct === Math.round((backLei / k1.gross) * 1000) / 10 && k1.payments === k0Pays && Math.abs(k1.gross - k1.refunds.lei - k1.revenue) < 0.01, { r: k1.refunds, pays: [k1.payments, k0Pays] });
    const tm = C.cosmeticians(rd('data/employees.json', []), rd('data/sales.json', []), [], 'Timișoara', MONTH + '-01', TODAY).find((x) => x.id === 'e-c1');
    const tmMine = rd('data/sales.json', []).filter((s) => s.source === 'incasare' && s.performedBy === 'e-c1' && s.date >= MONTH + '-01' && s.date <= TODAY);
    check(22, 'the 1.500 rule: her collected minus her refunds, a refund is not a day worked', tm && Math.abs(tm.collected - tmMine.reduce((a, s) => a + s.amount, 0)) < 0.01 && tm.days === new Set(tmMine.filter((s) => s.kind !== 'refund').map((s) => s.date)).size, tm);
    const act = rd('data/activity/' + TODAY + '.json', []);
    check(22, 'Activitate: „a făcut o rambursare la”', act.some((x) => /a făcut o rambursare/.test(x.verb)), act.slice(-3).map((x) => x.verb));

    // undo: everything back
    const un = await api('admin', 'portal-incasari', { action: 'refund_undo', id: row.id });
    check(22, 'undo: the row gone, the due as it was, the commission and the collections back', un.ok && rd('data/sales.json', []).length === nSales0 && JSON.stringify(dueOf(q1.due.id)) === due0 && Math.abs(pay1(MONTH).commission - comm0) < 0.01 && Math.abs(coll() - c0) < 0.01,
      { un: un.error, due: dueOf(q1.due.id), comm: pay1(MONTH).commission, coll: coll() });

    // a partial refund of one payment: 200 of the first 500 → 8 lei off, the package's paid and value 200 lower, its rest the same
    const dA = dueOf(p1.due.id), restA = dA.total - dA.paid;
    const pr = await api('admin', 'portal-incasari', { action: 'refund', id: p1.entry.id, scope: 'payment', amount: 200, reason: 'o ședință mai puțin', date: TODAY });
    const dA2 = dueOf(p1.due.id);
    check(22, 'partial refund (not closed): -200, 8 lei off, paid 200 lower, the value kept, so 200 more to collect', pr.ok && pr.refund.amount === -200 && sumL(linesFor(MONTH, u1)) === 32 && dA2.paid === dA.paid - 200 && dA2.total === dA.total && dA2.total - dA2.paid === restA + 200 && !pr.whole, { err: pr.error, d: [dA, dA2], l: linesFor(MONTH, u1) });
    const marked = (await api('admin', 'portal-data', null)).incasari.find((s) => s.id === p1.entry.id);
    check(22, 'the payment marked: refunded 200 (partial)', marked && marked.refunded === 200, marked && marked.refunded);
    const over = await api('admin', 'portal-incasari', { action: 'refund', id: p1.entry.id, scope: 'payment', amount: 301, reason: 'x', date: TODAY });
    check(22, 'more than was paid (and not refunded yet): refused', over._status === 400 && over.error === 'over_paid' && over.max === 300, over);
    const delPaid = await api('admin', 'portal-incasari', { action: 'delete', id: p1.entry.id });
    check(22, 'a refunded payment cannot be deleted before its refund', delPaid._status === 409 && delPaid.error === 'has_refunds', delPaid);
    const octDate = await api('admin', 'portal-incasari', { action: 'refund', id: 'oct-pay', amount: 100, reason: 'x', date: '2026-10-31' });
    check(22, 'a refund dated in October: refused (October is closed)', octDate._status === 400 && octDate.error === 'invalid_date', octDate);

    // not approved yet: the waiting one is simply smaller
    const q3 = await payPkg('rf-c1', 600, 600);
    const w0 = pay1(MONTH).commissionWaiting;
    const pw = await api('admin', 'portal-incasari', { action: 'refund', id: q3.entry.id, amount: 100, reason: 'o zonă mai puțin', date: TODAY });
    check(22, 'a refund before approval: the waiting commission 4 lei smaller, nothing counted', pw.ok && Math.abs(pay1(MONTH).commissionWaiting - (w0 - 4)) < 0.01 && sumL(linesFor(MONTH, q3.upsell.id)) === 20 && linesFor(MONTH, q3.upsell.id).every((l) => l.status === 'pending'), { err: pw.error, w0, w1: pay1(MONTH).commissionWaiting });
    await api('admin', 'portal-incasari', { action: 'refund_undo', id: pw.refund && pw.refund.id });

    // who may: reception and cosmeticians never; the manager only on her clinics (and George hears it)
    const rr = await api('receptie', 'portal-incasari', { action: 'refund', id: p1.entry.id, amount: 10, reason: 'x', date: TODAY });
    const rc = await api('cosmetician', 'portal-incasari', { action: 'refund_preview', id: p1.entry.id });
    check(22, 'reception and cosmeticians: 403', rr._status === 403 && rc._status === 403, { rr: rr._status, rc: rc._status });
    const E = rd('data/employees.json', []); E.find((e) => e.id === 'e-mgr').manages = ['Arad']; wr('data/employees.json', E);
    const mo = await api('manager', 'portal-incasari', { action: 'refund', id: p1.entry.id, amount: 10, reason: 'x', date: TODAY });
    check(22, 'the manager outside her clinic: 403', mo._status === 403, mo);
    E.find((e) => e.id === 'e-mgr').manages = ['Timișoara', 'Arad']; wr('data/employees.json', E);
    const mi = await api('manager', 'portal-incasari', { action: 'refund', id: p1.entry.id, amount: 10, reason: 'greșeală la casă', date: TODAY });
    const toAdmin = rd('data/notifications.json', []).filter((n) => n.employeeId === 'e-adm' && /^RAMBURSARE/.test(n.title || ''));
    check(22, 'the manager in her clinic: done, and the admin is told', mi.ok && toAdmin.length >= 1, { mi: mi.error, n: toAdmin.length });
    await api('manager', 'portal-incasari', { action: 'refund_undo', id: mi.refund && mi.refund.id });
    await api('admin', 'portal-incasari', { action: 'refund_undo', id: pr.refund && pr.refund.id });

    // an October upsell refunded in November: 4% of the money, and of the rest it closes (its commission was on the whole)
    const ro1 = await api('admin', 'portal-incasari', { action: 'refund', id: 'oct-pay', scope: 'package', close: true, reason: 'renunță', date: TODAY });
    const octL = linesFor(MONTH, 'oct-up');
    check(22, 'an October upsell refunded now: -20 (500 back) and -20 (the 500 rest closed), in November; October unchanged', ro1.ok && sumL(octL) === -40 && octL.length === 2 && pay1('2026-10').commission === 40, { err: ro1.error, octL });
    await api('admin', 'portal-incasari', { action: 'refund_undo', id: ro1.refund && ro1.refund.id });
    check(22, 'October untouched after all of it', JSON.stringify(pay1('2026-10')) === JSON.stringify(oct0), pay1('2026-10'));
    const cmp = await api('admin', 'lead-health', null, 'commission=1&month=' + MONTH);
    check(22, 'lead-health ?commission=1: old and new rule per cosmetician id, the new one the same as Salariu, no names', cmp.total && cmp.people['e-c1'] && cmp.people['e-c1'].new === pay1(MONTH).commission && !/Proba/.test(JSON.stringify(cmp)), cmp);
    check(22, 'the cash rule only from November', !CMS.cashRule({ origin: 'upsell', incasareId: 'x', date: '2026-10-31' }) && CMS.cashRule({ origin: 'upsell', incasareId: 'x', date: '2026-11-01' }));
  }

  // nk. Nuki and the portal's map (16.11): its buttons only to places of her role, the conversations her account can't open
  // stay closed to Nuki too, „Programăm?” in her clinic only and without the money for a cosmetician
  {
    const NK = require('../api/portal-nuki.js').lib;
    const a1 = NK.placeActions('Apasă pe pauză.\n[[du:programari.pauza]]\n[[du:aprobari]]\n[[du:nimic.aici]]', 'cosmetician');
    check('nk', 'marker: only her role\'s places, the lines out of the text', a1.text === 'Apasă pe pauză.' && a1.actions.length === 1 && a1.actions[0].id === 'programari.pauza' && a1.actions[0].label, a1);
    const a2 = NK.placeActions('X [[du:aprobari]] [[du:incasari]] [[du:incasari]] [[du:programari]] [[du:contacte]]', 'admin');
    check('nk', 'marker: at most 2, no repeats', a2.actions.map((x) => x.id).join() === 'aprobari,incasari' && !/\[\[/.test(a2.text), a2);
    const a3 = NK.placeActions('Nu e în contul tău.\n[[du:incasari]]', 'receptie');
    check('nk', 'marker: a place she has stays (reception, Încasări)', a3.actions.length === 1, a3);
    const cand = { phone: '40733333333', name: 'Candidată Unu', messages: [{ dir: 'in', text: 'cv' }] };
    const S = (role, id) => ({ role, employeeId: id });
    const r1 = await NK.withMedia(cand, 'chat', S('receptie', 'e-rec'));
    const r2 = await NK.withMedia(cand, 'chat', S('cosmetician', 'e-c3'));
    const r3 = await NK.withMedia(cand, 'chat', S('manager', 'e-mgr'));
    check('nk', 'withMedia: a candidate\'s chat closed to reception and a cosmetician, open to the manager', r1.forbidden && r2.forbidden && !r3.forbidden, { r1: !!r1.forbidden, r2: !!r2.forbidden, r3: !!r3.forbidden });
    const E = rd('data/employees.json', []); E.find((e) => e.id === 'e-mgr').manages = ['Timișoara']; wr('data/employees.json', E);
    const r4 = await NK.withMedia(cand, 'reply', S('manager', 'e-mgr'));
    E.find((e) => e.id === 'e-mgr').manages = ['Timișoara', 'Arad']; wr('data/employees.json', E);
    check('nk', 'withMedia: the manager, a chat of another clinic: closed', r4.forbidden, r4);
    const rs = await api('receptie', 'portal-nuki', { action: 'reply', thread: cand });
    const rm = await api('manager', 'portal-nuki', { action: 'reply', thread: cand });
    check('nk', 'reply on a candidate\'s chat: 403 for reception, not for the manager', rs._status === 403 && rm._status !== 403, { rs: rs._status, rm: rm._status });
    check('nk', 'slot city: a cosmetician in her clinic only', NK.slotCity('Arad', 'Timișoara', 'Timișoara') === 'Arad' && NK.slotCity(['Timișoara'], 'Arad', 'Arad') === 'Timișoara' && NK.slotCity(null, 'Arad', '') === 'Arad');
    const d = { free: false, who: [{ id: 'x', name: 'Clientă', phone: '0700000000', treatment: 'Lipo', time: '10:00', session: 2, amount: 900, paid: true, cosmetician: 'C' }] };
    const dc = NK.slotFor(S('cosmetician', 'e-c1'), d), dr = NK.slotFor(S('receptie', 'e-rec'), d);
    check('nk', 'slot for a cosmetician: no phone, amount or paid; reception sees them', !('phone' in dc.who[0]) && !('amount' in dc.who[0]) && !('paid' in dc.who[0]) && dc.who[0].name && dr.who[0].phone && dr.who[0].amount === 900, { dc: dc.who[0], dr: dr.who[0] });
    const g = await NK.guideText(S('cosmetician', 'e-c1'));
    check('nk', 'her map: her role and clinic, no name', /Vorbești cu: Cosmeticiană, clinica Timișoara\./.test(g) && !/Maria|Proba/.test(g) && /programari\.pauza/.test(g) && !/aprobari/.test(g), g.slice(0, 120));
  }

  // map. the portal's map against the portal (qa/nuki-map.cjs)
  {
    const r = cp.spawnSync(process.execPath, [path.join(__dirname, 'nuki-map.cjs')], { encoding: 'utf8' });
    const lines = String(r.stdout || '').split('\n').filter((l) => /^(ok|FAIL) /.test(l));
    lines.forEach((l) => check('map', l.replace(/^(ok|FAIL)\s+/, ''), /^ok/.test(l)));
    check('map', 'qa/nuki-map.cjs ran', r.status === 0 && lines.length >= 8, (r.stderr || '').slice(0, 300));
  }

  // 23. pontaj corrections (the owner, 16.11): the manager adds a missing day and corrects her people's pontaj (never her own,
  // only her clinics), the team asks for a correction, every change keeps its history, the timebank and the 1.500 rule follow
  {
    const as = async (id, role, body) => {
      const r = await fetch('http://127.0.0.1:' + PORT + '/api/portal-attendance', { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieFor(id, role) }, body: JSON.stringify(body) });
      return Object.assign(await r.json().catch(() => ({})), { _status: r.status });
    };
    const D13 = '2026-11-13', D12 = '2026-11-12', D11 = '2026-11-11';
    // a late arrival (10:00 for a 09:00 shift) on Dana's 12th
    const att0 = rd('data/attendance.json', []);
    const late = att0.find((a) => a.employeeId === 'e-c3' && a.date === D12); if (late) late.checkIn = '10:00';
    wr('data/attendance.json', att0);
    const fl0 = await as('e-mgr', 'manager', { action: 'fix_list' });
    const has = (l, k, emp, d) => (l.rows || []).some((r) => r.kind === k && r.employeeId === emp && r.date === d);
    check(23, 'De rezolvat: no departure, a working day with no pontaj, a late arrival, a request', fl0.ok && has(fl0, 'no_out', 'e-c3', D13) && has(fl0, 'missing', 'e-c2', D13) && has(fl0, 'late', 'e-c3', D12) && has(fl0, 'request', 'e-c1', D12),
      (fl0.rows || []).map((r) => r.kind + ' ' + r.employeeId + ' ' + r.date));
    const mrow = (fl0.rows || []).find((r) => r.kind === 'missing' && r.employeeId === 'e-c2' && r.date === D13) || {};
    check(23, 'De rezolvat: the missing day comes with her scheduled hours', mrow.from === '09:00' && mrow.to === '17:00', mrow);
    check(23, 'De rezolvat: never the manager herself, never a weekend off', !(fl0.rows || []).some((r) => r.employeeId === 'e-mgr') && !(fl0.rows || []).some((r) => r.kind === 'missing' && [0, 6].includes(new Date(r.date + 'T12:00:00Z').getUTCDay())));
    check(23, 'De rezolvat: closed to reception and cosmeticians', (await as('e-rec', 'receptie', { action: 'fix_list' }))._status === 403 && (await as('e-c1', 'cosmetician', { action: 'fix_list' }))._status === 403);

    // days worked (the 1.500 rule, the manager's bonus) before and after
    const daysOf = () => {
      const E = rd('data/employees.json', []), S = rd('data/sales.json', []), A = rd('data/attendance.json', []);
      const c = C.cosmeticians(E, S, A, 'Timișoara', MONTH + '-01', TODAY).find((x) => x.id === 'e-c2');
      const m = MP.conditionOf(E, S, A, ['Timișoara', 'Arad'], MONTH, TODAY).people.find((x) => x.id === 'e-c2');
      return { clinic: c && c.days, pay: m && m.days };
    };
    const st0 = await api('admin', 'portal-manager', { action: 'stats' });
    const statDays = (st) => ((st.cities && st.cities['Timișoara'] && st.cities['Timișoara'].team) || []).find((x) => x.id === 'e-c2') || {};
    const before = daysOf(), sd0 = statDays(st0).days;

    const cr = await as('e-mgr', 'manager', { action: 'create', employeeId: 'e-c2', date: D13, checkIn: '09:00', checkOut: '17:30', reason: 'a uitat să ponteze' });
    const ent = cr.entry || {};
    check(23, 'create: a day with no pontaj, by the manager', cr.ok && ent.checkIn === '09:00' && ent.checkOut === '17:30' && ent.location === 'Timișoara', cr);
    check(23, 'create: history (who, when, why, after)', ent.history && ent.history.length === 1 && ent.history[0].by === 'e-mgr' && ent.history[0].kind === 'create' && ent.history[0].reason === 'a uitat să ponteze' && ent.history[0].after.checkOut === '17:30' && !!ent.history[0].at && !!ent.history[0].byName, ent.history);
    const adjC = rd('data/time-adjust.json', []).find((a) => a.attendanceId === ent.id);
    check(23, 'create: the timebank synced (+30 min waiting)', adjC && adjC.status === 'pending' && adjC.minutes === 30, adjC);
    const after = daysOf(), sd1 = statDays(await api('admin', 'portal-manager', { action: 'stats' })).days;
    check(23, 'create: one more day worked in the 1.500 rule and the manager\'s bonus condition, the same in both', after.clinic === before.clinic + 1 && after.pay === before.pay + 1 && after.clinic === after.pay && sd1 === sd0 + 1, { before, after, sd0, sd1 });
    const dup = await as('e-mgr', 'manager', { action: 'create', employeeId: 'e-c2', date: D13, checkIn: '09:00', checkOut: '17:00', reason: 'x' });
    check(23, 'create: a second pontaj for the same day refused', dup._status === 409 && dup.error === 'duplicate_day', dup);
    const fut = await as('e-mgr', 'manager', { action: 'create', employeeId: 'e-c2', date: day(1), checkIn: '09:00', checkOut: '17:00', reason: 'x' });
    check(23, 'create: a day in the future refused', fut._status === 400 && fut.error === 'future_date', fut);
    const own = await as('e-mgr', 'manager', { action: 'create', employeeId: 'e-mgr', date: '2026-11-06', checkIn: '09:00', checkOut: '17:00', reason: 'x' });
    const ownUp = await as('e-mgr', 'manager', { action: 'update', id: (rd('data/attendance.json', []).find((a) => a.employeeId === 'e-mgr') || {}).id, checkIn: '08:00', reason: 'x' });
    check(23, 'the manager\'s own pontaj: refused (create and update)', own._status === 403 && own.error === 'own_request' && ownUp._status === 403, [own, ownUp]);
    const noReason = await as('e-mgr', 'manager', { action: 'create', employeeId: 'e-c2', date: '2026-11-06', checkIn: '09:00', checkOut: '17:00' });
    check(23, 'create: the reason is required', noReason._status === 400 && noReason.error === 'missing_reason', noReason);
    const sat = await as('e-mgr', 'manager', { action: 'create', employeeId: 'e-c2', date: '2026-11-14', checkIn: '10:00', checkOut: '14:00', reason: 'a venit sâmbătă' });
    check(23, 'create: a day off in her schedule asks first, then goes in with the confirmation', sat._status === 409 && sat.error === 'needs_confirm' && sat.why === 'off' &&
      (await as('e-mgr', 'manager', { action: 'create', employeeId: 'e-c2', date: '2026-11-14', checkIn: '10:00', checkOut: '14:00', reason: 'a venit sâmbătă', confirm: true })).ok, sat);
    // a leave on her calendar asks too
    const L0 = rd('data/leave-requests.json', []); L0.push({ id: 'lv-fx', employeeId: 'e-c3', type: 'odihna', startDate: '2026-11-10', endDate: '2026-11-10', workDays: 1, status: 'approved', requestedAt: at('2026-11-01', '10:00') }); wr('data/leave-requests.json', L0);
    const A0 = rd('data/attendance.json', []); wr('data/attendance.json', A0.filter((a) => !(a.employeeId === 'e-c3' && a.date === '2026-11-10')));
    const onLeave = await as('e-mgr', 'manager', { action: 'create', employeeId: 'e-c3', date: '2026-11-10', checkIn: '09:00', checkOut: '17:00', reason: 'x' });
    check(23, 'create: a day of approved leave asks first', onLeave._status === 409 && onLeave.why === 'leave' && !has(await as('e-mgr', 'manager', { action: 'fix_list' }), 'missing', 'e-c3', '2026-11-10'), onLeave);
    const E0 = rd('data/employees.json', []); E0.find((e) => e.id === 'e-mgr').manages = ['Arad']; wr('data/employees.json', E0);
    const other = await as('e-mgr', 'manager', { action: 'create', employeeId: 'e-c1', date: '2026-11-06', checkIn: '09:00', checkOut: '17:00', reason: 'x' });
    const otherReq = await as('e-mgr', 'manager', { action: 'fix_decide', id: 'rq1', decision: 'approve' });
    E0.find((e) => e.id === 'e-mgr').manages = ['Timișoara', 'Arad']; wr('data/employees.json', E0);
    check(23, 'another clinic\'s people: refused (create, decide)', other._status === 403 && otherReq._status === 403, [other, otherReq]);

    // update keeps before → after; the Activitate line says it
    const no13 = rd('data/attendance.json', []).find((a) => a.employeeId === 'e-c3' && a.date === D13);
    const up = await as('e-mgr', 'manager', { action: 'update', id: no13.id, checkOut: '17:15', reason: 'a uitat plecarea' });
    const h = (up.entry && up.entry.history || []).slice(-1)[0] || {};
    check(23, 'update: history before → after, who and why', up.ok && h.kind === 'update' && h.before && h.before.checkOut === null && h.after.checkOut === '17:15' && h.by === 'e-mgr' && h.reason === 'a uitat plecarea', h);
    const acts = rd('data/activity/' + TODAY + '.json', []).filter((l) => l.path === 'portal-attendance');
    check(23, 'Activitate: whose pontaj, the day, before → after', acts.some((l) => l.action === 'update' && /Dana/.test(l.subject) && /13\.11/.test(l.detail) && /plecare - → 17:15/.test(l.detail)) && acts.some((l) => l.action === 'create' && /Elena/.test(l.subject)),
      acts.map((l) => l.action + ': ' + l.subject + ' | ' + l.detail));

    // a request → approved (applied, history, she is told); another → refused (nothing applied, she is told)
    const N = () => rd('data/notifications.json', []);
    const n0 = N().length;
    const rq = await as('e-c2', 'cosmetician', { action: 'fix_request', date: D12, checkIn: '08:30', note: 'am uitat să pontez' });
    const toMgr = N().slice(n0).filter((n) => /CORECTARE PONTAJ/.test(n.title));
    check(23, 'request: sent, to the manager only (not the owner)', rq.ok && toMgr.some((n) => n.employeeId === 'e-mgr') && !toMgr.some((n) => n.employeeId === 'e-adm' || n.employeeId === 'admin'), toMgr.map((n) => n.employeeId));
    check(23, 'request: in De rezolvat', has(await as('e-mgr', 'manager', { action: 'fix_list' }), 'request', 'e-c2', D12));
    check(23, 'request: a day in the future refused', (await as('e-c2', 'cosmetician', { action: 'fix_request', date: day(1), checkIn: '09:00' })).error === 'future_date');
    const ap = await as('e-mgr', 'manager', { action: 'fix_decide', id: rq.request.id, decision: 'approve' });
    const e12 = rd('data/attendance.json', []).find((a) => a.employeeId === 'e-c2' && a.date === D12) || {};
    const lastH = (e12.history || []).slice(-1)[0] || {};
    check(23, 'approve: the times applied, the history kept, the request closed', ap.ok && e12.checkIn === '08:30' && lastH.kind === 'request' && lastH.by === 'e-mgr' && /Cerută de/.test(lastH.reason) &&
      rd('data/attendance-requests.json', []).find((r) => r.id === rq.request.id).status === 'approved', { e12, ap });
    const adj12 = rd('data/time-adjust.json', []).find((a) => a.attendanceId === e12.id);
    check(23, 'approve: the timebank synced', adj12 && adj12.status === 'pending' && adj12.checkIn === '08:30' && adj12.minutes === TB.workedMinutes('08:30', e12.checkOut) - 480, adj12);
    check(23, 'approve: she is told', N().some((n) => n.employeeId === 'e-c2' && /PONTAJ ✅ - 12\.11 corectat/.test(n.title)));
    const rq2 = await as('e-c3', 'cosmetician', { action: 'fix_request', date: D11, checkOut: '18:00', note: 'am plecat mai târziu' });
    const e11 = JSON.stringify(rd('data/attendance.json', []).find((a) => a.employeeId === 'e-c3' && a.date === D11));
    const rj = await as('e-mgr', 'manager', { action: 'fix_decide', id: rq2.request.id, decision: 'reject', note: 'ai plecat la 17' });
    check(23, 'refuse: nothing applied, the note kept, she is told', rj.ok && e11 === JSON.stringify(rd('data/attendance.json', []).find((a) => a.employeeId === 'e-c3' && a.date === D11)) &&
      rj.request.status === 'rejected' && rj.request.decisionNote === 'ai plecat la 17' && N().some((n) => n.employeeId === 'e-c3' && n.tone === 'bad' && /respinsă/.test(n.title) && /17/.test(n.text)), rj);
    check(23, 'decided once', (await as('e-mgr', 'manager', { action: 'fix_decide', id: rq2.request.id, decision: 'approve' }))._status === 409);

    // the manager's own request: to the owner, decided by the owner
    const n1 = N().length;
    const mq = await as('e-mgr', 'manager', { action: 'fix_request', date: D12, checkOut: '17:30', note: 'am rămas la închidere' });
    const toOwner = N().slice(n1);
    check(23, 'the manager\'s own request: to the owner, not to herself', mq.ok && toOwner.some((n) => n.employeeId === 'e-adm') && !toOwner.some((n) => n.employeeId === 'e-mgr'), toOwner.map((n) => n.employeeId));
    const selfDecide = await as('e-mgr', 'manager', { action: 'fix_decide', id: mq.request.id, decision: 'approve' });
    const adminList = await api('admin', 'portal-attendance', { action: 'fix_list' });
    const ownerOk = await api('admin', 'portal-attendance', { action: 'fix_decide', id: mq.request.id, decision: 'approve' });
    check(23, 'her own: not by her, on the owner\'s list, approved by the owner', selfDecide._status === 403 && has(adminList, 'request', 'e-mgr', D12) && ownerOk.ok &&
      (rd('data/attendance.json', []).find((a) => a.employeeId === 'e-mgr' && a.date === D12) || {}).checkOut === '17:30', { selfDecide, ownerOk });

    // the owner gets no alerts for the list: no badge count, nothing in his bell from the team's requests
    const pdM = await api('manager', 'portal-data'), pdA = await api('admin', 'portal-data');
    const ownerBell = N().filter((n) => (n.employeeId === 'e-adm' || n.employeeId === 'admin') && /PONTAJ/.test(n.title));
    check(23, 'the owner: no De rezolvat count, only the manager\'s own request in his bell', pdM.manager && pdM.manager.toFix > 0 && !pdA.manager && ownerBell.length === toOwner.filter((n) => /PONTAJ/.test(n.title)).length, { mgr: pdM.manager, owner: !!pdA.manager, bell: ownerBell.length });
    const fl1 = await as('e-mgr', 'manager', { action: 'fix_list' });
    check(23, 'De rezolvat after the fixes: the added day, the departure and the requests are gone', !has(fl1, 'missing', 'e-c2', D13) && !has(fl1, 'no_out', 'e-c3', D13) && !has(fl1, 'request', 'e-c2', D12) && !has(fl1, 'request', 'e-c3', D11), (fl1.rows || []).map((r) => r.kind + ' ' + r.employeeId + ' ' + r.date));
    const ds = await as('e-mgr', 'manager', { action: 'fix_dismiss', key: 'e-c3|' + D12 + '|late' });
    check(23, '„E corect”: the late arrival leaves the list', ds.ok && !has(await as('e-mgr', 'manager', { action: 'fix_list' }), 'late', 'e-c3', D12));
    check(23, 'pdM.toFix counts the list', (await api('manager', 'portal-data')).manager.toFix === ((await as('e-mgr', 'manager', { action: 'fix_list' })).rows || []).length);
  }

  // 24. the hours expected of a day come from Program echipă from 16.11 (a 10-19 shift is no overtime, a short day is no
  // shortfall, a scheduled Saturday is a working day); no schedule, or before 16.11: the old 8 hours Monday to Friday
  {
    const sch = { weekly: { s1: { location: 'Timișoara', days: { 1: { on: true, from: '10:00', to: '19:00' }, 2: { on: true, from: '09:00', to: '13:00' }, 6: { on: true, from: '09:00', to: '15:00' } } } }, dates: {}, breaks: {} };
    const dd = (id, date, a, b) => TB.dayDiff({ employeeId: id, date, checkIn: a, checkOut: b }, {}, [], sch);
    const mon = dd('s1', '2026-11-16', '10:00', '19:00'), tue = dd('s1', '2026-11-17', '09:00', '13:00'), satD = dd('s1', '2026-11-21', '09:00', '15:00');
    check(24, 'a 10-19 shift worked: no difference', mon.expected === 540 && mon.diff === 0, mon);
    check(24, 'a short day (09-13) worked: no shortfall', tue.expected === 240 && tue.diff === 0, tue);
    check(24, 'a scheduled Saturday: a working day, not all overtime', satD.expected === 360 && satD.diff === 0 && !satD.weekend, satD);
    const wed = dd('s1', '2026-11-18', '09:00', '12:00');
    check(24, 'a day off in her schedule: all of it extra', wed.expected === 0 && wed.diff === 180, wed);
    const none = dd('s2', '2026-11-16', '09:00', '17:00'), noneSat = dd('s2', '2026-11-21', '09:00', '12:00');
    check(24, 'no schedule: 8 hours Monday to Friday, Saturday all extra', none.expected === 480 && none.diff === 0 && noneSat.expected === 0 && noneSat.weekend, { none, noneSat });
    const old = dd('s1', '2026-11-09', '10:00', '19:00');
    check(24, 'before 16.11: the old rule (+60)', old.expected === 480 && old.diff === 60, old);
    // through syncAdjust (the clock-out, a correction): the 10-19 day makes nothing pending
    const mem = { 'data/time-adjust.json': [], 'data/employees.json': [{ id: 's1', role: 'cosmetician' }], 'data/leave-requests.json': [] };
    const store = { readJSON: async (k, d) => (k in mem ? JSON.parse(JSON.stringify(mem[k])) : d), writeJSON: async (k, v) => { mem[k] = v; } };
    const a1 = await TB.syncAdjust({ id: 'z1', employeeId: 's1', date: '2026-11-16', checkIn: '10:00', checkOut: '19:00' }, store, { schedule: sch });
    const a2 = await TB.syncAdjust({ id: 'z2', employeeId: 's1', date: '2026-11-17', checkIn: '09:00', checkOut: '12:00' }, store, { schedule: sch });
    check(24, 'syncAdjust: the 10-19 day pends nothing; an hour short of a short day pends -60', a1 === null && a2 && a2.minutes === -60 && mem['data/time-adjust.json'].length === 1, { a1, a2 });
  }

  // 23. the money audit (16.11): every place that pays, shows or closes a month's commission and salary agrees
  {
    const PAY = require('../api/_lib/payroll'), CMS = require('../api/_lib/commission'), MC = require('../api/_lib/month-close');
    ROLE.cosmetician = 'e-c1';
    const empOf = (id) => rd('data/employees.json', []).find((e) => e.id === id);
    const pay = (id, m) => PAY.monthPay({ emp: empOf(id), month: m, isCurrent: m === MONTH, sales: rd('data/sales.json', []), dues: rd('data/client-dues.json', []), payouts: [], bank: null, attendance: [], appointments: [] });
    const linesU = (id, m, uid) => (pay(id, m).commissionLines || []).filter((l) => l.upsellId === uid);
    const sumL = (ls) => Math.round(ls.reduce((a, l) => a + l.lei, 0) * 100) / 100;
    const dueBy = (saleId) => rd('data/client-dues.json', []).filter((d) => d.saleId === saleId);
    const salesNow = () => rd('data/sales.json', []);
    let nA = 0;
    const appt = (who, date, extra) => { const id = 'au-' + (++nA); wr('data/appointments.json', rd('data/appointments.json', []).concat([Object.assign({ id, date: date || TODAY, time: '10:00', endTime: '11:00', location: 'Timișoara', cosmeticianId: who, clientName: 'Audit ' + id, clientId: 'cl-' + id, treatment: 'Lipo 640', categories: ['corporale'], amount: 300, status: 'confirmata', createdAt: at(day(-3), '10:00') }, extra || {})])); return id; };
    const sell = async (who, value, paid, o) => { const id = appt(who, o && o.date); return Object.assign(await api('receptie', 'portal-sale', { source: 'incasare', appointmentId: id, method: 'cash', performedBy: who, parts: { session: (o && o.session) || 0, upsell: true, upsellValue: value, upsellPaid: paid, upsellWhat: 'Pachet audit ' + id } }), { apptId: id }); };
    const upd = (p, parts, extra) => api('admin', 'portal-incasari', Object.assign({ action: 'update', id: p.entry.id, date: p.entry.date, method: 'cash', performedBy: p.entry.performedBy, categories: ['corporale'], parts }, extra || {}));

    // 1. a payment deleted (or its upsell taken off) after approval: the approved request goes, no commission is left
    const d1 = await sell('e-c1', 2000, 500);
    await api('admin', 'portal-approve', { saleId: d1.upsell.id, decision: 'approve' });
    const c0 = pay('e-c1', MONTH).commission;
    const del = await api('admin', 'portal-incasari', { action: 'delete', id: d1.entry.id });
    check(23, '1 delete after approval: the approved request goes, her commission 20 lei lower (never the whole value)', del.ok && !salesNow().some((s) => s.id === d1.upsell.id) && Math.abs(pay('e-c1', MONTH).commission - (c0 - 20)) < 0.01 && !dueBy(d1.entry.id).length, { del: del.error, was: c0, now: pay('e-c1', MONTH).commission });
    const d2 = await sell('e-c1', 1200, 600);
    await api('admin', 'portal-approve', { saleId: d2.upsell.id, decision: 'approve' });
    const un = await upd(d2, { session: 0, upsell: false, upsellValue: 0, upsellPaid: 0 }, { amount: 300, parts: { session: 300, upsell: false } });
    check(23, '1 the upsell unticked after approval: the request goes too', un.ok && !salesNow().some((s) => s.id === d2.upsell.id) && !linesU('e-c1', MONTH, d2.upsell.id).length, { un: un.error });
    const ghost = { id: 'gh', source: 'comision', origin: 'upsell', incasareId: 'gone', employeeId: 'e-c1', date: TODAY, amount: 3000, status: 'approved', commission: 120 };
    check(23, '1 linesOf: a cash-rule request whose payment is gone brings nothing (no whole-value fallback)', CMS.linesOf(ghost, CMS.context([ghost], [])).length === 0);
    const d3 = await sell('e-c1', 1000, 400);
    const ap3 = rd('data/appointments.json', []); const id3 = appt('e-c1'); ap3.push(Object.assign(rd('data/appointments.json', []).find((a) => a.id === id3), { clientId: 'cl-' + d3.apptId }));
    wr('data/appointments.json', ap3.filter((a, i, l) => l.findIndex((x) => x.id === a.id) === i).map((a) => (a.id === id3 ? Object.assign(a, { clientId: 'cl-' + d3.apptId }) : a)));
    const rest3 = await api('receptie', 'portal-sale', { source: 'incasare', appointmentId: id3, method: 'card', performedBy: 'e-c1', dueId: d3.due.id, parts: { session: 0, upsell: false, duePaid: 300 } });
    const del3 = await api('admin', 'portal-incasari', { action: 'delete', id: d3.entry.id });
    check(23, '1 a payment that started a package others paid into: not deleted (409), the package and its payments stay', rest3.ok && del3._status === 409 && del3.error === 'has_package_payments' && dueBy(d3.entry.id).length === 1, { rest3: rest3.error, del3 });

    // 2. a refund, then a correction of the payment: the package keeps the refund's cut and its closure; sums locked
    const r1 = await sell('e-c2', 2000, 500, { session: 300 });
    await api('manager', 'portal-incasari', { action: 'refund', id: r1.entry.id, scope: 'payment', amount: 200, reason: 'audit', method: 'card' });
    const dA = JSON.stringify(dueBy(r1.entry.id).map((d) => [d.total, d.paid, !!d.closedAt]));
    const mA = await upd(r1, { session: 300, upsell: true, upsellValue: 2000, upsellPaid: 500 }, { method: 'card', note: 'corectat' });
    check(23, '2 after a refund, a method edit: the package keeps the refund cut (total, paid, rest)', mA.ok && JSON.stringify(dueBy(r1.entry.id).map((d) => [d.total, d.paid, !!d.closedAt])) === dA && salesNow().find((s) => s.id === r1.entry.id).note === 'corectat', { mA: mA.error, was: dA, now: dueBy(r1.entry.id) });
    const r2 = await sell('e-c2', 2000, 500, { session: 300 });
    await api('admin', 'portal-incasari', { action: 'refund', id: r2.entry.id, scope: 'package', amount: 100, close: true, reason: 'închis', method: 'card' });
    const mB = await upd(r2, { session: 300, upsell: true, upsellValue: 2000, upsellPaid: 500 }, { method: 'card' });
    const dB = dueBy(r2.entry.id)[0];
    check(23, '2 a package a refund closed stays closed after a method edit (no rest comes back)', mB.ok && dB && Math.max(0, dB.total - dB.paid) === 0 && !!dB.closedAt, { mB: mB.error, dB });
    const mC = await upd(r2, { session: 350, upsell: true, upsellValue: 2000, upsellPaid: 500 });
    const mD = await upd(r2, { session: 300, upsell: true, upsellValue: 2400, upsellPaid: 500 });
    check(23, '2 the sums of a refunded payment cannot change (409 has_refunds)', mC._status === 409 && mC.error === 'has_refunds' && mD._status === 409, { mC, mD });

    // 2b. an advance given back without closing: the package keeps its value („plătit 0 din 3.000, rest 3.000”); paid later in
    // full, the commission is 4% of the 3.000 that stayed in (the money given back no longer fills the cap)
    const k1 = await sell('e-c1', 3000, 1000);
    await api('admin', 'portal-approve', { saleId: k1.upsell.id, decision: 'approve' });
    const kr = await api('admin', 'portal-incasari', { action: 'refund', id: k1.entry.id, scope: 'payment', amount: 1000, reason: 'audit', method: 'cash' });
    const kd = dueBy(k1.entry.id)[0];
    check(23, '8 an advance of 1.000 refunded, not closed: plătit 0 din 3.000, rest 3.000', kr.ok && kd.total === 3000 && kd.paid === 0 && !kd.closedAt, { kr: kr.error, kd });
    const idk = appt('e-c1'); const apk = rd('data/appointments.json', []); apk.find((a) => a.id === idk).clientId = 'cl-' + k1.apptId; wr('data/appointments.json', apk);
    const kp = await api('receptie', 'portal-sale', { source: 'incasare', appointmentId: idk, method: 'card', performedBy: 'e-c1', dueId: kd.id, parts: { session: 0, upsell: false, duePaid: 3000 } });
    check(23, '8 then paid 3.000: her commission on it is 120 (4% of what stayed in), the package closed', kp.ok && sumL(linesU('e-c1', MONTH, k1.upsell.id)) === 120 && !!dueBy(k1.entry.id)[0].closedAt, { kp: kp.error, l: linesU('e-c1', MONTH, k1.upsell.id) });
    const kc = await sell('e-c1', 1000, 1000);
    const kcl = await api('admin', 'portal-incasari', { action: 'refund', id: kc.entry.id, scope: 'payment', amount: 1000, close: true, reason: 'nu mai vine', method: 'cash' });
    check(23, '8 a package paid in full, all of it given back and closed: nothing left to collect', kcl.ok && !dueBy(kc.entry.id).some((d) => d.total - d.paid > 0.005), dueBy(kc.entry.id));

    // 3. back-dated money: a visit of a month before is paid today (the visit's day kept); refunds only this month
    const prevM = new Date(Date.UTC(+MONTH.slice(0, 4), +MONTH.slice(5, 7) - 2, 15)).toISOString().slice(0, 10);
    const b1 = await sell('e-c2', 1000, 500, { date: prevM });
    check(23, '3 a visit from last month paid now: dated today, the visit day kept, the upsell dated today', b1.ok && b1.entry.date === TODAY && b1.entry.visitDate === prevM && b1.upsell.date === TODAY, { err: b1.error, e: b1.entry && [b1.entry.date, b1.entry.visitDate] });
    const rOld = await api('admin', 'portal-incasari', { action: 'refund', id: b1.entry.id, amount: 10, reason: 'x', date: prevM });
    check(23, '3 a refund dated last month: refused', rOld._status === 400 && rOld.error === 'invalid_date', rOld);
    const sO = salesNow(); sO.push({ id: 'old-pay', source: 'incasare', employeeId: 'e-mgr', performedBy: 'e-c2', clientId: 'cl-old', client: 'Veche', date: prevM, location: 'Timișoara', categories: ['corporale'], treatment: 'Lipo 640', amount: 400, upsell: 0, method: 'cash', status: 'recorded', createdAt: prevM + 'T10:00:00Z' }); wr('data/sales.json', sO);
    const eOld = await api('admin', 'portal-incasari', { action: 'update', id: 'old-pay', date: prevM, method: 'cash', performedBy: 'e-c2', amount: 450, categories: ['corporale'] });
    await new Promise((r) => setTimeout(r, 150));
    const actOld = rd('data/activity/' + TODAY + '.json', []).filter((x) => x.path === 'portal-incasari' && x.action === 'update');
    check(23, '3 a payment of last month corrected: the answer names the closed month, Activitate notes it', eOld.ok && eOld.closedMonth && actOld.some((x) => /închisă/.test(x.detail || '')), { e: eOld.closedMonth, act: actOld.slice(-1) });

    // 4. the salary by date: a raise never rewrites the months before; the month it starts is paid by days
    const Em = rd('data/employees.json', []); const mg = Em.find((e) => e.id === 'e-mgr'); Object.assign(mg, { netSalary: 3000, netSalaryFrom: '2026-09' }); delete mg.salaryHistory; wr('data/employees.json', Em);
    check(23, '4 migration: an old record reads as one salary from its first month', JSON.stringify(PAY.salaryHistoryOf(empOf('e-mgr'))) === JSON.stringify([{ from: '2026-09-01', lei: 3000 }]) && pay('e-mgr', '2026-10').base === 3000 && pay('e-mgr', '2026-08').base === 0);
    const raise = await api('admin', 'portal-employees', { action: 'update_details', employeeId: 'e-mgr', name: mg.name, location: mg.location, role: 'manager', netSalary: 4500, netSalaryFromDate: MONTH + '-16' });
    const dim = new Date(Date.UTC(+MONTH.slice(0, 4), +MONTH.slice(5, 7), 0)).getUTCDate();
    const want = Math.round(3000 * 15 / dim + 4500 * (dim - 15) / dim);
    check(23, '4 a raise from the 16th: October stays 3.000, this month by days, the history kept', raise.ok && pay('e-mgr', '2026-10').base === 3000 && pay('e-mgr', MONTH).base === want && (empOf('e-mgr').salaryHistory || []).length === 2, { raise: raise.error, oct: pay('e-mgr', '2026-10').base, now: pay('e-mgr', MONTH).base, want });
    const MPc = require('../api/_lib/manager-pay'), EXc = require('../api/_lib/expenses');
    const nextM = new Date(Date.UTC(+MONTH.slice(0, 4), +MONTH.slice(5, 7), 1)).toISOString().slice(0, 7);
    const trk = EXc.tracker(await MPc.loadCtx(require('../api/_lib/store').readJSON), nextM);
    const salRow = trk.rows.find((r) => r.key === 'sal:e-mgr'), taxP = trk.rows.find((r) => r.key === 'taxsal');
    const taxMe = taxP && taxP.calc && taxP.calc.people.find((x) => x.id === 'e-mgr');
    check(23, '4 Plăți and the salary taxes use the month\'s salary by days', salRow && salRow.base === want && taxMe && taxMe.gross > 0 && require('../api/_lib/ro-salary-tax').personMonth({ baseNet: want, extraNet: Math.max(0, salRow.lei - want), month: MONTH, grossStored: undefined }).state === taxMe.total, { row: salRow && salRow.base, want, tax: taxMe });
    const pd = await api('admin', 'portal-data');
    const pe = pd.admin.employees.find((e) => e.id === 'e-mgr');
    check(23, '4 Echipa gets the salary in force today and the history', pe && pe.netSalary === (TODAY >= MONTH + '-16' ? 4500 : 3000) && pe.salaryHistory.length === 2, pe && [pe.netSalary, pe.salaryHistory]);

    // 5. the package's value raised after approval: the commission follows (4% of what comes in, up to the new value)
    const v1 = await sell('e-c1', 1000, 500);
    await api('admin', 'portal-approve', { saleId: v1.upsell.id, decision: 'approve' });
    const vu = await upd(v1, { session: 0, upsell: true, upsellValue: 2000, upsellPaid: 500, upsellWhat: 'Pachet mărit' });
    const tc = (pay('e-c1', MONTH).toCome || []).find((t) => t.upsellId === v1.upsell.id);
    check(23, '5 raised to 2.000 after approval: the request follows (2.000), still to come 1.500 → 60 lei', vu.ok && salesNow().find((s) => s.id === v1.upsell.id).amount === 2000 && tc && tc.rest === 1500 && tc.lei === 60, { vu: vu.error, tc });
    const id5 = appt('e-c1'); const ap5 = rd('data/appointments.json', []); ap5.find((a) => a.id === id5).clientId = 'cl-' + v1.apptId; wr('data/appointments.json', ap5);
    const n0 = rd('data/notifications.json', []).length;
    const p5 = await api('receptie', 'portal-sale', { source: 'incasare', appointmentId: id5, method: 'card', performedBy: 'e-c1', dueId: v1.due.id, parts: { session: 0, upsell: false, duePaid: 1500 } });
    const bell5 = rd('data/notifications.json', []).slice(n0).filter((n) => n.employeeId === 'e-c1' && /COMISION ✅/.test(n.title));
    check(23, '5 the rest paid: 60 lei more (80 in all = 4% of 2.000), the bell says the same 60', p5.ok && sumL(linesU('e-c1', MONTH, v1.upsell.id)) === 80 && bell5.length === 1 && /\+60 lei/.test(bell5[0].title), { err: p5.error, l: linesU('e-c1', MONTH, v1.upsell.id), bell: bell5.map((n) => n.title) });

    // 6. every place reads the same commission as Salariu
    const E6 = rd('data/employees.json', []); E6.find((e) => e.id === 'e-c1').goals = [{ title: 'Comision', metric: 'comision_aprobat_luna', target: 500, reward: 100 }]; wr('data/employees.json', E6);
    const pc = await api('cosmetician', 'portal-data');
    const pa = await api('admin', 'portal-data');
    const row = pa.admin.payroll.find((x) => x.id === 'e-c1'), mine = pc.salary.months[0];
    const goal = pc.myGoals.find((g) => g.metric === 'comision_aprobat_luna');
    const tags = pa.admin.allSales.filter((s) => s.employeeId === 'e-c1' && s.status === 'approved' && s.cash).reduce((a, s) => a + s.cash.lei, 0);
    check(23, '6 Salariu, Echipa (Salarii, Vânzări), the Panou goal: one commission', row.commission === mine.commission && Math.abs(goal.current - (mine.commission + mine.manual)) < 0.01, { row: row.commission, mine: mine.commission, goal: goal && goal.current });
    check(23, '6 the tags of Aprobări (what each upsell brought) are its lines, never the whole value', pa.admin.allSales.filter((s) => s.employeeId === 'e-c1' && s.status === 'approved' && s.cash && s.cash.rule === 'cash').every((s) => Math.abs(s.cash.lei - CMS.linesOf(s, CMS.context(salesNow(), rd('data/client-dues.json', []), rd('data/employees.json', []))).reduce((a, l) => a + l.lei, 0)) < 0.01) && tags > 0);
    const t6 = await sell('e-c1', 2000, 500);
    check(23, '6 the payment answers with the commission as it comes: 20 now, 60 at the rest (the toast)', t6.commission && t6.commission.now === 20 && t6.commission.later === 60, t6.commission);

    // 7. the manager's final bonus: Cheltuieli shows it apart (a memo), Salarii counts it
    const fins = rd('data/manager-bonus.json', {}); fins['e-mgr|' + MONTH] = { lei: 777, at: new Date().toISOString(), by: 'e-adm' }; wr('data/manager-bonus.json', fins);
    const cv = await api('admin', 'portal-salariu', null, 'view=costs&month=' + MONTH);
    const pr7 = (await api('admin', 'portal-data')).admin.payroll.find((x) => x.id === 'e-mgr');
    check(23, '7 the final bonus: in the manager\'s pay (Salarii), in Cheltuieli as its own memo (bonusFinal), not in the costs', cv.bonusFinal === 777 && pr7.managerBonus === 777 && !cv.costs.rows.some((r) => r.lei === 777), { cv: cv.bonusFinal, pr: pr7 && pr7.managerBonus });
    delete fins['e-mgr|' + MONTH]; wr('data/manager-bonus.json', fins);

    // 8. KPI „rest de încasat”: a package without its clinic takes the one of the payment that started it
    const k8a = await api('admin', 'kpi', null, 'period=month');
    const dd = rd('data/client-dues.json', []); const nl = dd.find((d) => d.saleId === t6.entry.id); delete nl.location; wr('data/client-dues.json', dd);
    const k8 = await api('admin', 'kpi', null, 'period=month');
    const list8 = await api('admin', 'portal-incasari', { action: 'dues' });
    const tmRest = list8.dues.filter((d) => !d.location || d.location === 'Timișoara').reduce((a, d) => a + d.rest, 0);
    check(23, '8 KPI rest de încasat: a package without a stored clinic still counts, the same as Rest de plată', k8.clinic['Timișoara'].dues.rest === k8a.clinic['Timișoara'].dues.rest && Math.abs(k8.clinic['Timișoara'].dues.rest - tmRest) < 0.01, { before: k8a.clinic['Timișoara'].dues, after: k8.clinic['Timișoara'].dues, list: tmRest });

    // 9. a waiting upsell moved to someone who can't earn commission: the request goes
    const w9 = await sell('e-c1', 900, 900);
    const u9 = await api('admin', 'portal-incasari', { action: 'update', id: w9.entry.id, date: w9.entry.date, method: 'cash', performedBy: 'e-rec', categories: ['corporale'], parts: { session: 0, upsell: true, upsellValue: 900, upsellPaid: 900 } });
    check(23, '9 a waiting upsell moved to reception: no request (the same rule as at payment)', u9.ok && !salesNow().some((s) => s.source === 'comision' && s.incasareId === w9.entry.id), { u9: u9.error });

    // 10. one package per payment: a correction never starts a second one
    const s10 = salesNow(); const pk = s10.find((s) => s.id === t6.entry.id); delete pk.packageTotal; wr('data/sales.json', s10);
    await upd(t6, { session: 0, upsell: true, upsellValue: 2000, upsellPaid: 500 }, { method: 'card' });
    check(23, '10 a correction of a payment without packageTotal: still one package', dueBy(t6.entry.id).length === 1, dueBy(t6.entry.id).length);

    // a refund that cuts her commission: she hears it, short, without who made it
    await api('admin', 'portal-approve', { saleId: t6.upsell.id, decision: 'approve' });
    const nr = rd('data/notifications.json', []).length;
    const rf = await api('manager', 'portal-incasari', { action: 'refund', id: t6.entry.id, amount: 100, reason: 'audit', method: 'card' });
    const cut = rd('data/notifications.json', []).slice(nr).filter((n) => n.employeeId === 'e-c1');
    check(23, 'refund: „Comision -4 lei: rambursare pachet …” to her, no name of who did it', rf.ok && cut.length === 1 && /^Comision -4 lei: rambursare pachet Pachet audit/.test(cut[0].title) && !/Ioana|Proba|Constantinescu/.test(cut[0].title + cut[0].text), cut);
    await api('manager', 'portal-incasari', { action: 'refund_undo', id: rf.refund && rf.refund.id });

    // leaving: nothing after her last day, what she earned before stays
    const L1 = await sell('e-c1', 2000, 500);
    await api('admin', 'portal-approve', { saleId: L1.upsell.id, decision: 'approve' });
    const EL = rd('data/employees.json', []); const c1 = EL.find((e) => e.id === 'e-c1'); Object.assign(c1, { active: false, leftAt: TODAY }); wr('data/employees.json', EL);
    const sl = salesNow(); sl.push({ id: 'after-left', source: 'incasare', employeeId: 'e-mgr', performedBy: 'e-c2', clientId: 'cl-' + L1.apptId, client: 'x', date: day(1), location: 'Timișoara', categories: ['corporale'], treatment: 'Lipo 640', amount: 500, upsell: 0, parts: { session: 0, upsell: 0, due: 500 }, dueId: L1.due.id, toDue: 500, method: 'card', status: 'recorded', createdAt: new Date().toISOString() });
    sl.push({ id: 'after-left-r', source: 'incasare', kind: 'refund', refundOf: L1.entry.id, employeeId: 'e-adm', performedBy: 'e-c1', date: day(1), amount: -100, from: [{ saleId: L1.entry.id, key: 'd:' + L1.due.id, dueId: L1.due.id, upsellId: L1.upsell.id, lei: 100 }], dues: [], restCut: [], location: 'Timișoara', method: 'card', status: 'recorded', createdAt: new Date().toISOString() });
    wr('data/sales.json', sl);
    const dl = rd('data/client-dues.json', []); const dL = dl.find((d) => d.id === L1.due.id); dL.payments.push({ saleId: 'after-left', amount: 500, at: new Date().toISOString() }); dL.paid += 500; wr('data/client-dues.json', dl);
    const lL = CMS.linesOf(salesNow().find((s) => s.id === L1.upsell.id), CMS.context(salesNow(), rd('data/client-dues.json', []), rd('data/employees.json', [])));
    check(23, 'leaving: her 20 lei up to her last day stay, the payment and the refund after it bring her nothing', lL.length === 1 && lL[0].lei === 20 && lL[0].date === TODAY, lL);
    const cAll = await api('admin', 'portal-salariu', null, 'view=costs&month=' + MONTH);
    const rowL = (await api('admin', 'portal-data')).admin.payroll.find((x) => x.id === 'e-c1');
    check(23, 'leaving: Salarii shows her month with what she earned, nothing to come', rowL && rowL.commission === pay('e-c1', MONTH).commission && !(rowL.toCome || []).length && cAll.ok, rowL && [rowL.commission, rowL.toCome]);
    Object.assign(c1, { active: true }); delete c1.leftAt; wr('data/employees.json', EL);

    // the game's profit: the real month costs (Cheltuieli), no business figure in the code
    const G = require('../api/_lib/game');
    const src = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', 'game.js'), 'utf8');
    check(23, 'game: no costs written in the code (rents, accounting, leasing)', G.COSTS === undefined && !/rent:\s*\{|leasing:\s*\d|accounting:\s*\d/.test(src));
    const costs = { months: { [MONTH]: { savedAt: new Date().toISOString(), eurRate: 5, lines: { credits: 1000, rentTm: 100, rentAr: 50, laser: 0, accounting: 300, salaries: null, claude: 0 }, over: {} } } };
    const M0 = require('../api/_lib/kpi').model({ offers: [], leads: [], appointments: [], sales: [], clients: [], conversations: [], now: Date.now() });
    const g1 = G.build({ M: M0, employees: rd('data/employees.json', []), sales: [], dues: [], attendance: [], appointments: [], costs, exp: null, eurRate: 5 });
    const fx = g1.state.engine.fixed, shareNow = g1.state.months.slice(-1)[0].share;
    check(23, 'game: the month\'s fixed costs are Cheltuieli\'s lines (rents at the euro, credits, accounting)', Math.abs(fx - (1000 + 500 + 250 + 300) * shareNow) < 1 && g1.state.engine.costsKnown === true, { fx, shareNow });

    // a closed month changed: the admin hears it once a day, with what changed
    const ex = rd('data/expense-tracker.json', null) || { v: 1, months: {} }; ex.months = ex.months || {};
    ex.months[MONTH] = Object.assign({}, ex.months[MONTH], { parts: Object.assign({}, (ex.months[MONTH] || {}).parts, { 'sal:e-c2': [{ id: 'x1', date: TODAY, lei: 100 }] }) });
    wr('data/expense-tracker.json', ex);
    const prevMonth = prevM.slice(0, 7);
    check(23, 'month close: last month is closed once its salaries are marked paid', await MC.isClosed(require('../api/_lib/store').readJSON, prevMonth));
    const nc = rd('data/notifications.json', []).length;
    await api('admin', 'portal-incasari', { action: 'update', id: 'old-pay', date: prevM, method: 'cash', performedBy: 'e-c2', amount: 470, categories: ['corporale'] });
    await api('admin', 'portal-incasari', { action: 'update', id: 'old-pay', date: prevM, method: 'cash', performedBy: 'e-c2', amount: 480, categories: ['corporale'] });
    const closeN = rd('data/notifications.json', []).filter((n) => /S-A SCHIMBAT/.test(n.title || '') && String(n.tag || '').startsWith('close-' + prevMonth));
    const closeDoc = rd(MC.KEY, {})[prevMonth];
    check(23, 'month close: several changes, one notice per admin (what changed), all of them kept', nc >= 0 && closeN.length >= 1 && new Set(closeN.map((n) => n.employeeId)).size === closeN.length && /Încasare corectată/.test(closeN[0].text) && closeDoc && closeDoc.items.length >= 2, { n: closeN.map((n) => [n.employeeId, n.title]), doc: closeDoc });
  }

  // 25. roles, access, notifications (the owner, 16.11): a cosmetician never sees a colleague's split; the owner hears only
  // what he decides himself (a clinic with no manager), everything else reaches the manager and reception; reception is one
  // desk for both clinics; the deep links; her break taken away is told; no titles or names saying whom to go to
  {
    ROLE.cosmetician = 'e-c1';
    const store = require('../api/_lib/store'), N = require('../api/_lib/notify'), NK = () => rd('data/notifications.json', []);
    const cd = await api('cosmetician', 'portal-data', null, '');
    const others = (cd.incasari || []).filter((s) => s.performedBy !== 'e-c1'), hers = (cd.incasari || []).filter((s) => s.performedBy === 'e-c1');
    check(25, 'Încasări (cosmetician): her rows whole, a colleague\'s without who or the parts', hers.length && hers.every((s) => s.performedByName && s.performedByName !== '-') && others.length &&
      others.every((s) => !s.performedBy && s.performedByName === '-' && !s.parts && !/Proba/.test(JSON.stringify(s))), { hers: hers.length, others: others.slice(0, 1) });
    const ad = await api('admin', 'portal-data', null, '');
    check(25, 'dead fields: no month total for the team, no admin in the race', cd.companyGoal && cd.companyGoal.current === undefined && typeof ad.companyGoal.current === 'number' &&
      !(cd.raceBonus.leaderboard || []).some((x) => x.employeeId === 'e-adm' || x.employeeId === 'admin'), { cg: cd.companyGoal, lb: cd.raceBonus.leaderboard });
    const du = await api('cosmetician', 'portal-incasari', { action: 'dues', id: '-' });
    const ref = await api('cosmetician', 'portal-incasari', { action: 'refund_preview', id: 'x' });
    check(25, 'Rest de plată (cosmetician): read, her clinic only; still no refunds', du._status === 200 && Array.isArray(du.dues) && du.dues.every((d) => d.location === 'Timișoara') && ref._status === 403, { st: du._status, n: (du.dues || []).length, ref: ref._status });

    // who hears the clinic's day: reception (both clinics) and the clinic's manager; the owner only where there is none
    const both = await N.deskIds(store, 'Arad');
    const E = rd('data/employees.json', []); E.find((e) => e.id === 'e-mgr').manages = ['Timișoara']; wr('data/employees.json', E);
    const bare = await N.deskIds(store, 'Arad'), tm = await N.deskIds(store, 'Timișoara');
    delete E.find((e) => e.id === 'e-mgr').manages; wr('data/employees.json', E);
    check(25, 'deskIds: reception and the manager, the owner only for a clinic with no manager', both.includes('e-rec') && both.includes('e-mgr') && !both.includes('admin') && !both.includes('e-adm') &&
      bare.includes('admin') && bare.includes('e-rec') && !bare.includes('e-mgr') && tm.includes('e-rec') && !tm.includes('admin'), { both, bare, tm });
    const sc = NK().filter((n) => n.tag === 'site-cancel-fx-site').map((n) => n.employeeId);
    check(25, 'a site booking cancelled (Arad): reception and the manager, not the owner', sc.includes('e-rec') && sc.includes('e-mgr') && !sc.includes('admin') && !sc.includes('e-adm'), sc);
    const src = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    check(25, 'pushes per message, undelivered, waiting, site, reminders: through deskIds, never [\'admin\'] first',
      ['api/webhook-whatsapp.js', 'api/_lib/social-inbox.js', 'api/_lib/site-confirm.js', 'api/_lib/reminders.js', 'api/_lib/wa-waiting.js'].every((f) => /deskIds\(/.test(src(f))) &&
      !/\['admin'\]\.concat/.test(src('api/webhook-whatsapp.js') + src('api/_lib/social-inbox.js') + src('api/_lib/site-confirm.js') + src('api/_lib/reminders.js')) && !/adminIds/.test(src('api/_lib/wa-waiting.js')));
    // the morning: with a manager on both clinics the owner gets only his own decisions (the manager's own requests)
    const team0 = await require('../api/_lib/roles').teamOf({ role: 'manager', employeeId: 'e-mgr' }, store.readJSON, rd('data/employees.json', []));
    const ownPt = rd('data/time-adjust.json', []).filter((a) => a.status === 'pending' && !team0.has(a.employeeId)).length;
    const ownLv = rd('data/leave-requests.json', []).filter((a) => a.status === 'pending' && !team0.has(a.employeeId)).length;
    await require('../api/_lib/followups').morning({ force: true });
    const fu = NK().filter((n) => /^fu-/.test(n.tag || ''));
    const own = fu.filter((n) => n.employeeId === 'admin' || n.employeeId === 'e-adm'), mg = fu.filter((n) => n.employeeId === 'e-mgr');
    check(25, 'the morning: the owner only what he decides (the manager\'s pontaj), the manager the rest', own.every((n) => /^fu-cereri-/.test(n.tag)) && own.some((n) => /^fu-cereri-/.test(n.tag)) && new RegExp('^' + ownPt + ' pontaj' + (ownLv ? ', ' + ownLv + ' concedi' : '')).test((own[0] || {}).text || '') && mg.length > 0,
      { own: own.map((n) => n.tag + ' ' + n.text), ownPt, ownLv, mg: mg.map((n) => n.tag) });
    // deep links
    const fb = await api('manager', 'portal-manager', { action: 'feedback', city: 'Timișoara', level: 'potrivit', quality: 'ok', reasons: [], details: '' });
    const fbn = NK().filter((n) => /^mgr-fb-/.test(n.tag || '') && n.employeeId === 'admin');
    check(25, 'deep links: the manager\'s notices open her page there, a candidate opens Angajări', fb.ok && fbn.length && fbn.every((n) => n.go === 'manager/rapoarte') &&
      /go: 'manager\/casa', tag: 'mgr-close-'/.test(src('api/portal-manager.js')) && /go: 'manager\/rapoarte', tag: 'mgr-rep-'/.test(src('api/portal-manager.js')) &&
      /go: 'pipeline\/angajari'/.test(src('api/_lib/fb-leads.js')) && !/go: 'angajati'/.test(src('api/_lib/fb-leads.js')) && !/data-pane="costuri"/.test(src('portal-admin.js')), fbn.map((n) => n.go));
    check(25, 'the bell: approval, info, leave, break grouped, the important ones pop', /approval: 'shield'/.test(src('portal-notif.js')) && /const isAsk = /.test(src('portal-notif.js')) && /n\.kind === 'break'/.test(src('portal-notif.js')) && /items\(\)\.filter\(pops\)/.test(src('portal-notif.js')));

    // her break: „Fără pauză azi” and a booking that takes it are told, today only, with the move's tag
    const T = require('../api/_lib/team-schedule');
    const todays = () => rd('data/appointments.json', []).filter((a) => a.date === TODAY);
    // her break put on a free half hour first (that move is told too), then a client booked right there, without moving it
    const free = T.breakSlots(await T.load(), 'e-c1', TODAY, { appts: todays() }).filter((x) => x.free);
    const at1 = free.length ? free[Math.floor(free.length / 2)] : null;
    if (at1) {
      const set = await api('manager', 'portal-schedule', { action: 'break_set', date: TODAY, employeeId: 'e-c1', from: at1.from });
      const mv = NK().filter((n) => n.employeeId === 'e-c1' && n.tag === 'break-' + TODAY + '-' + at1.from);
      await api('receptie', 'portal-appointments', { action: 'create', date: TODAY, time: at1.from, endTime: at1.to, location: 'Timișoara', cosmeticianId: 'e-c1', clientName: 'Peste Pauza Azi', clientPhone: '0755000999', treatment: 'Lipo 640', categories: ['corporale'], amount: 0, status: 'programata' });
      const t1 = NK().filter((n) => n.employeeId === 'e-c1' && n.tag === 'break-' + TODAY + '-off');
      check(25, 'a booking on her break today, not moving it: „Azi nu ai pauză” (the move before it told too)', set.ok && mv.length === 1 && t1.length === 1 && t1[0].text === 'Azi nu ai pauză.' && t1[0].kind === 'break', { set: set.error, mv: mv.length, t1 });
    } else check(25, 'a booking on her break today (no free half hour today: skipped)', true);
    const off = await api('manager', 'portal-schedule', { action: 'break_off', date: TODAY, employeeId: 'e-c3' });
    const t2 = NK().filter((n) => n.employeeId === 'e-c3' && n.tag === 'break-' + TODAY + '-off');
    check(25, '„Fără pauză azi”: she hears it', off.ok ? t2.length === 1 : off.error === 'no_break' || off.error === 'not_working', { off, t2 });
    await api('manager', 'portal-schedule', { action: 'break_reset', date: TODAY, employeeId: 'e-c3' });
    await api('manager', 'portal-schedule', { action: 'break_reset', date: TODAY, employeeId: 'e-c1' });

    // texts the team reads: no title and no name saying whom to go to (CLAUDE.md, 16.11)
    const lit = (f) => src(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\/\/ .*$/, '')).join('\n');
    const team = ['portal-manager.js', 'portal-money.js', 'portal-pipeline.js', 'portal-legal.js', 'portal-kit.js', 'portal-calendar.js', 'api/portal-legal.js', 'api/portal-employees.js', 'api/portal-sale.js', 'portal-regulament.js', 'api/portal-regulament.js', 'api/_lib/rules.js', 'api/_lib/package-next.js'];
    const hits = team.filter((f) => /['"][^'"\n]*(George|[Aa]dminul|de admin\b|[Mm]anagerul)[^'"\n]*['"]/.test(lit(f)));
    check(25, 'no „George”, „adminul”, „de admin” in the team\'s texts', hits.length === 0, hits);
    check(25, 'Cheltuieli, not „Costuri lunare”', !/Costuri lunare/.test(lit('api/portal-plati.js') + lit('api/_lib/activity.js')));
  }

  // TIME (16.11): leave and days off leave bookings to be given away, the cosmetician marks her visits, a move keeps its
  // no-show, the desk's breaks and leave rows, the other city, the blocked time, the open day, the half hour, who sees what
  {
    ROLE.cosmetician = 'e-c1';
    const C = require('../api/_lib/clinic'), TC = require('../api/_lib/time-care'), Bk = require('../api/_lib/booking'), store = require('../api/_lib/store');
    const wd = (n) => { let d = day(n); while ([0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay())) d = C.addDay(d, 1); return d; };
    const A = () => rd('data/appointments.json', []);
    const row = (id) => A().find((a) => a.id === id) || null;
    const book = (o) => api('receptie', 'portal-appointments', Object.assign({ action: 'create', treatment: 'Lipo 640', categories: ['corporale'], amount: 0, status: 'programata', force: true, clientPhone: '07' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0') }, o));
    const notes = (id, re) => rd('data/notifications.json', []).filter((n) => n.employeeId === id && re.test((n.title || '') + ' ' + (n.text || '')));

    // 1. an approved leave: her bookings those days come back in the answer, in the Calendar's orphans („concediu”), the
    // desk hears it, their reminders wait; „Mută la …” gives one to a free colleague
    const D1 = wd(30);
    wr('data/appointments.json', A().filter((a) => a.date !== D1));
    const b1 = await book({ date: D1, time: '10:00', endTime: '11:00', location: 'Arad', cosmeticianId: 'e-c3', clientName: 'Concediu Proba' });
    const L1 = rd('data/leave-requests.json', []); L1.push({ id: 'lvT1', employeeId: 'e-c3', type: 'odihna', startDate: D1, endDate: D1, workDays: 1, reason: '', status: 'pending', requestedAt: at(TODAY, '08:00'), decidedAt: '', decidedBy: '', rejectionNote: '', pdfBlobPath: '' }); wr('data/leave-requests.json', L1);
    const ap1 = await api('manager', 'portal-leave', { action: 'decide', id: 'lvT1', decision: 'approved' });
    check('T1', 'leave approved: her booking that day in the answer („rămân fără cosmeticiană”)', ap1.ok && (ap1.affected || []).some((x) => x.id === b1.appointment.id), { err: ap1.error, aff: ap1.affected });
    let orph = await api('receptie', 'portal-appointments', { action: 'orphans' });
    check('T1', 'Calendar: listed as left without a cosmetician, why „concediu”', (orph.appointments || []).some((x) => x.id === b1.appointment.id && x.orphanWhy === 'concediu'), (orph.appointments || []).map((x) => x.orphanWhy));
    check('T1', 'the desk hears it (bell and phone)', notes('e-rec', /FĂRĂ COSMETICIANĂ/).length >= 1, rd('data/notifications.json', []).filter((n) => n.employeeId === 'e-rec').slice(-2));
    check('T1', 'her client reminders wait', (await TC.held(row(b1.appointment.id), A(), store.readJSON)) === 'concediu');
    await api('admin', 'portal-schedule', { action: 'save_date', date: D1, employeeId: 'e-c1', entry: { on: true, from: '09:00', to: '17:00', location: 'Arad' } });
    orph = await api('receptie', 'portal-appointments', { action: 'orphans' });
    const o1 = (orph.appointments || []).find((x) => x.id === b1.appointment.id);
    check('T1', '„Mută la …”: the colleague working there that day, free then', o1 && (o1.free || []).some((p) => p.id === 'e-c1'), o1 && o1.free);
    const rs = await api('receptie', 'portal-appointments', { action: 'reassign', id: b1.appointment.id, cosmeticianId: 'e-c1' });
    orph = await api('receptie', 'portal-appointments', { action: 'orphans' });
    check('T1', 'given to her: off the list, the reminders go again', rs.ok && row(b1.appointment.id).cosmeticianId === 'e-c1' && !(orph.appointments || []).some((x) => x.id === b1.appointment.id) && (await TC.held(row(b1.appointment.id), A(), store.readJSON)) === '', rs.error);
    // a day taken off in Program echipă: the same, why „zi liberă”; she works it again: the mark goes
    const D1b = wd(31);
    wr('data/appointments.json', A().filter((a) => a.date !== D1b));
    const b1b = await book({ date: D1b, time: '12:00', endTime: '13:00', location: 'Timișoara', cosmeticianId: 'e-c2', clientName: 'Zi Libera Proba' });
    const sv = await api('admin', 'portal-schedule', { action: 'save_date', date: D1b, employeeId: 'e-c2', entry: { on: false } });
    orph = await api('receptie', 'portal-appointments', { action: 'orphans' });
    check('T1', 'a day taken off: her booking in the answer and in the orphans („zi liberă”)', (sv.affected || []).some((x) => x.id === b1b.appointment.id) && (orph.appointments || []).some((x) => x.id === b1b.appointment.id && x.orphanWhy === 'zi liberă'), { aff: sv.affected, err: sv.error });
    await api('admin', 'portal-schedule', { action: 'save_date', date: D1b, employeeId: 'e-c2', entry: null });
    orph = await api('receptie', 'portal-appointments', { action: 'orphans' });
    check('T1', 'she works it again: the mark goes', !row(b1b.appointment.id).offShift && !(orph.appointments || []).some((x) => x.id === b1b.appointment.id));

    // 2. she marks HER visit: „Finalizată” (a package session) or „Nu a venit”; only hers, only from its day on
    const Y = day(-1);
    const pk = await book({ date: Y, time: '15:00', endTime: '16:00', location: 'Timișoara', cosmeticianId: 'e-c1', clientName: 'Pachet Ieri', package: true, status: 'confirmata' });
    const paid = await book({ date: Y, time: '16:00', endTime: '17:00', location: 'Timișoara', cosmeticianId: 'e-c1', clientName: 'Cu Plata Ieri', amount: 300 });
    const fut = await book({ date: wd(4), time: '16:00', endTime: '17:00', location: 'Timișoara', cosmeticianId: 'e-c1', clientName: 'Viitoare Marcare' });
    const um = await api('cosmetician', 'portal-appointments', { action: 'unmarked' });
    check('T2', 'Panou: yesterday\'s unmarked visits of hers', (um.appointments || []).some((x) => x.id === pk.appointment.id && x.byHand) && (um.appointments || []).some((x) => x.id === paid.appointment.id && !x.byHand) && (um.appointments || []).every((x) => x.cosmeticianId === 'e-c1'), um.appointments);
    const umd = await api('receptie', 'portal-appointments', { action: 'unmarked' });
    check('T2', 'the desk sees them too', (umd.appointments || []).some((x) => x.id === pk.appointment.id));
    const vs0 = C.visitStats(A(), rd('data/sales.json', []), 'Timișoara', TODAY, 30, []);
    const m1 = await api('cosmetician', 'portal-appointments', { action: 'mark', id: pk.appointment.id, mark: 'came' });
    const vs1 = C.visitStats(A(), rd('data/sales.json', []), 'Timișoara', TODAY, 30, []);
    check('T2', 'her package session „Finalizată”: came, one no-show less', m1.ok && row(pk.appointment.id).status === 'finalizata' && vs1.came === vs0.came + 1 && vs1.due === vs0.due, { err: m1.error, vs0: [vs0.due, vs0.came], vs1: [vs1.due, vs1.came] });
    const m2 = await api('cosmetician', 'portal-appointments', { action: 'mark', id: paid.appointment.id, mark: 'came' });
    check('T2', 'one with a sum: closes with its payment (409 needs_payment)', m2._status === 409 && m2.error === 'needs_payment', m2);
    const m3 = await api('cosmetician', 'portal-appointments', { action: 'mark', id: paid.appointment.id, mark: 'noshow' });
    check('T2', '„Nu a venit”: a no-show (cancelled at its hour)', m3.ok && row(paid.appointment.id).status === 'anulata' && row(paid.appointment.id).noShow && C.lateCancel(row(paid.appointment.id)), m3.error);
    const m4 = await api('cosmetician', 'portal-appointments', { action: 'mark', id: fut.appointment.id, mark: 'noshow' });
    ROLE.cosmetician = 'e-c2';
    const m5 = await api('cosmetician', 'portal-appointments', { action: 'mark', id: fut.appointment.id, mark: 'noshow' });
    const m6 = await api('cosmetician', 'portal-appointments', Object.assign({}, row(fut.appointment.id), { action: 'update', status: 'finalizata', categories: ['corporale'] }));
    ROLE.cosmetician = 'e-c1';
    check('T2', 'not before its day; never someone else\'s; no other change by a cosmetician', m4._status === 400 && m4.error === 'not_yet' && m5._status === 403 && m6._status === 403, { m4: m4.error, m5: m5._status, m6: m6._status });

    // 3. a passed booking moved to another day: its no-show stays (missedOn), in the show rate and the call list's rule
    const P3 = day(-4);
    const mv = await book({ date: P3, time: '10:00', endTime: '11:00', location: 'Arad', cosmeticianId: 'e-c3', clientName: 'Mutata Proba' });
    const vA = C.visitStats(A(), rd('data/sales.json', []), 'Arad', TODAY, 30, []);
    const up3 = await api('receptie', 'portal-appointments', Object.assign({}, row(mv.appointment.id), { action: 'update', date: wd(6), status: 'reprogramata', categories: ['corporale'] }));
    const vB = C.visitStats(A(), rd('data/sales.json', []), 'Arad', TODAY, 30, []);
    check('T3', 'moved off a passed day: missedOn, still a no-show (due and came unchanged)', up3.ok && (row(mv.appointment.id).missedOn || []).includes(P3) && vB.due === vA.due && vB.came === vA.came, { err: up3.error, a: [vA.due, vA.came], b: [vB.due, vB.came], m: row(mv.appointment.id).missedOn });
    const lh3 = await api('admin', 'lead-health', null, 'verify=1');
    check('T3', 'the second reading counts it the same', lh3.cities && lh3.cities.Arad && lh3.cities.Arad.visits60.agree, lh3.cities && lh3.cities.Arad && lh3.cities.Arad.visits60);

    // 4. reception moves a break only when the booking sits on it
    const D4 = wd(32);
    wr('data/appointments.json', A().filter((a) => a.date !== D4));
    const r4a = await book({ date: D4, time: '10:00', endTime: '11:00', location: 'Arad', cosmeticianId: 'e-c3', clientName: 'Pauza Departe', breakMove: { from: '15:00' } });
    const r4b = await book({ date: D4, time: '11:00', endTime: '12:00', location: 'Arad', cosmeticianId: 'e-c3', clientName: 'Pauza Off', breakMove: { off: true } });
    check('T4', 'a booking away from her break: reception can\'t move or remove it (403), nothing saved', r4a._status === 403 && r4b._status === 403 && !A().some((a) => a.date === D4), { a: r4a._status, b: r4b._status });
    const r4c = await book({ date: D4, time: '13:00', endTime: '13:30', location: 'Arad', cosmeticianId: 'e-c3', clientName: 'Pauza Peste', breakMove: { from: '14:00' } });
    const r4d = await api('manager', 'portal-appointments', { action: 'create', date: D4, time: '10:00', endTime: '11:00', location: 'Arad', cosmeticianId: 'e-c3', clientName: 'Pauza Manager', clientPhone: '0755999111', treatment: 'Lipo 640', categories: ['corporale'], amount: 0, status: 'programata', breakMove: { from: '15:00' } });
    check('T4', 'on her break: moved with the booking; the manager moves any', r4c.ok && r4d.ok, { c: r4c.error, d: r4d.error });

    // 5. the rows of an approved leave: never deleted by reception; cancelled with the leave (admin, the manager for her team)
    const lr = A().find((a) => a.createdBy === 'leave-approval' && a.leaveId === 'lvT1');
    const del5 = await api('receptie', 'portal-appointments', { action: 'delete', id: lr && lr.id });
    check('T5', 'reception can\'t delete a leave\'s row', del5._status === 403 && del5.error === 'leave_row' && !!row(lr && lr.id), del5);
    const c5 = await api('manager', 'portal-leave', { action: 'cancel', appointmentId: lr && lr.id });
    check('T5', '„Anulează concediul”: rows gone, request cancelled, she is told', c5.ok && !A().some((a) => a.leaveId === 'lvT1') && rd('data/leave-requests.json', []).find((r) => r.id === 'lvT1').status === 'cancelled' && notes('e-c3', /ANULAT/).length >= 1, c5);
    const c5b = await api('receptie', 'portal-leave', { action: 'cancel', id: 'lvT1' });
    check('T5', 'reception can\'t cancel a leave', c5b._status === 403, c5b);

    // 6. she works in the other city for a day: her bookings and break there are hers to see; the pickers have her
    const D6 = wd(33);
    wr('data/appointments.json', A().filter((a) => a.date !== D6));
    await api('admin', 'portal-schedule', { action: 'save_date', date: D6, employeeId: 'e-c1', entry: { on: true, from: '09:00', to: '17:00', location: 'Arad' } });
    const b6 = await book({ date: D6, time: '10:00', endTime: '11:00', location: 'Arad', cosmeticianId: 'e-c1', clientName: 'Alt Oras Proba' });
    const l6 = await api('cosmetician', 'portal-appointments', { action: 'list', from: D6, to: D6 });
    check('T6', 'her booking and her break in the other city, nobody else\'s there', (l6.appointments || []).some((a) => a.id === b6.appointment.id) && (l6.breaks || []).some((b) => b.employeeId === 'e-c1' && b.location === 'Arad') &&
      !(l6.appointments || []).some((a) => a.location === 'Arad' && a.cosmeticianId !== 'e-c1') && !(l6.breaks || []).some((b) => b.location === 'Arad' && b.employeeId !== 'e-c1'), { a: (l6.appointments || []).map((a) => a.location + a.cosmeticianId), b: l6.breaks });
    const s6 = await api('admin', 'portal-schedule', { action: 'get', from: D6, to: D6 });
    check('T6', 'who works there that day (the pickers): her in Arad', ((s6.works[D6] || {}).Arad || []).some((w) => w.employeeId === 'e-c1'));

    // 7. the blocked time: the fill and the free hours take it off as the site does
    const D7 = [34, 36, 37].map(wd).find((d) => d !== D6); // (wd(33) and wd(34) are the same Monday when day 33 is a Sunday)
    wr('data/appointments.json', A().filter((a) => a.date !== D7));
    const cfg7 = await Bk.settings({ team: true });
    const cap0 = C.capMin(cfg7, 'Arad', D7, A());
    await api('receptie', 'portal-appointments', { action: 'block', date: D7, location: 'Arad', cosmeticianId: 'e-c3', time: '09:00', endTime: '11:00', label: 'Curs' });
    const cap1 = C.capMin(cfg7, 'Arad', D7, A());
    await api('receptie', 'portal-appointments', { action: 'block', date: D7, location: 'Arad', time: '15:00', endTime: '16:00', label: 'Instruire' });
    const cap2 = C.capMin(cfg7, 'Arad', D7, A());
    const at7 = T.whoWorks(cfg7.team.doc, D7, 'Arad', { appts: A(), ids: cfg7.team.ids, until: cfg7.team.until }).length;
    check('T7', 'fill: her block takes her 2 h, the clinic\'s block 1 h from each one at work', cap0 - cap1 === 120 && cap1 - cap2 === 60 * at7 && at7 > 0, { cap0, cap1, cap2, at7 });
    const fr7 = await api('admin', 'portal-followups', { action: 'free' });
    const p7 = (((fr7.cities || {}).Arad || {}).days || []).find((d) => d.date === D7);
    check('T7', 'follow-ups: no free hour inside the blocks', !p7 || (p7.people || []).every((p) => p.free.every((w) => w.to <= '09:00' || w.from >= '11:00') && p.free.every((w) => w.to <= '15:00' || w.from >= '16:00')), p7);

    // 8. a „reprogramată” moved ahead is booked: the package list doesn't ask to call her
    const sales8 = rd('data/sales.json', []); sales8.push({ id: 's-pk-T8', source: 'incasare', employeeId: 'e-rec', performedBy: 'e-c3', clientId: '', clientPhone: '0711000855', client: 'Pachet Mutat', date: day(-3), location: 'Arad', categories: ['corporale'], amount: 1000, packageTotal: 3000, upsell: 2000, upsellWhat: '6 ședințe Lipo', method: 'card', status: 'recorded', createdAt: at(day(-3), '10:00') }); wr('data/sales.json', sales8);
    const pk8 = await book({ date: wd(5), time: '12:00', endTime: '13:00', location: 'Arad', cosmeticianId: 'e-c3', clientName: 'Pachet Mutat', clientPhone: '0711000855' });
    await api('receptie', 'portal-appointments', Object.assign({}, row(pk8.appointment.id), { action: 'update', date: wd(7), status: 'reprogramata', categories: ['corporale'] }));
    const pl8 = await api('manager', 'portal-followups', { action: 'packages' });
    check('T8', '„reprogramată” ahead: booked, not on the package list', !(pl8.items || []).some((x) => (x.phone || '').endsWith('711000855')), (pl8.items || []).filter((x) => (x.phone || '').endsWith('711000855')));

    // 9. a Saturday with a shift: open on the site, in the fill and the free hours (Online only clips the site's hours)
    let D9 = day(12); while (new Date(D9 + 'T12:00:00Z').getUTCDay() !== 6) D9 = C.addDay(D9, 1);
    await api('admin', 'portal-schedule', { action: 'save_date', date: D9, employeeId: 'e-c3', entry: { on: true, from: '10:00', to: '14:00' } });
    const cfg9 = await Bk.settings({ team: true });
    const site9 = (((await api('admin', 'booking', null, 'city=Arad&service=consult')).days || []).find((x) => x.date === D9) || {}).slots || [];
    const fr9 = await api('admin', 'portal-followups', { action: 'free' });
    check('T9', 'Saturday with a shift: site slots, capacity', site9.includes('10:00') && C.capMin(cfg9, 'Arad', D9, A()) === 240, { site9, cap: C.capMin(cfg9, 'Arad', D9, A()) });
    check('T9', '… and not „closed” in the free hours', !(((fr9.cities || {}).Arad || {}).days || []).some((d) => d.date === D9 && d.closed));

    // 10. who left: her leave can't be approved; „A plecat” answers her pending requests no
    const L10 = rd('data/leave-requests.json', []); L10.push({ id: 'lvT10', employeeId: 'e-c5', type: 'odihna', startDate: wd(20), endDate: wd(20), workDays: 1, reason: '', status: 'pending', requestedAt: at(TODAY, '08:00'), decidedAt: '', decidedBy: '', rejectionNote: '', pdfBlobPath: '' });
    L10.push({ id: 'lvT10b', employeeId: 'e-c2', type: 'odihna', startDate: wd(21), endDate: wd(21), workDays: 1, reason: '', status: 'pending', requestedAt: at(TODAY, '08:00'), decidedAt: '', decidedBy: '', rejectionNote: '', pdfBlobPath: '' }); wr('data/leave-requests.json', L10);
    const a10 = await api('admin', 'portal-leave', { action: 'decide', id: 'lvT10', decision: 'approved' });
    check('T10', 'a departed one\'s leave: not approved (409 employee_left)', a10._status === 409 && a10.error === 'employee_left', a10);
    await api('admin', 'portal-employees', { action: 'set_active', employeeId: 'e-c2', active: false, leftAt: TODAY });
    const r10 = rd('data/leave-requests.json', []).find((r) => r.id === 'lvT10b');
    await api('admin', 'portal-employees', { action: 'set_active', employeeId: 'e-c2', active: true });
    check('T10', '„A plecat”: her pending requests answered no', r10 && r10.status === 'rejected', r10);

    // 11. „Ore libere” for part of a day: the hours asked, a blocked time for her
    const D11 = wd(35);
    const adj = rd('data/time-adjust.json', []); adj.push({ id: 'adjT11', employeeId: 'e-c1', date: day(-6), minutes: 240, approvedMinutes: 240, status: 'approved', decidedAt: at(day(-6), '18:00'), createdAt: at(day(-6), '18:00') }); wr('data/time-adjust.json', adj);
    const L11 = rd('data/leave-requests.json', []); L11.push({ id: 'lvT11', employeeId: 'e-c1', type: 'suplimentare', startDate: D11, endDate: D11, workDays: 1, minutes: 120, reason: '', status: 'pending', requestedAt: at(TODAY, '08:00'), decidedAt: '', decidedBy: '', rejectionNote: '', pdfBlobPath: '' }); wr('data/leave-requests.json', L11);
    const h0 = await api('admin', 'portal-leave', { action: 'decide', id: 'lvT11', decision: 'approved' });
    const h1 = await api('admin', 'portal-leave', { action: 'decide', id: 'lvT11', decision: 'approved', hours: { from: '15:00', to: '17:00' } });
    const blk = A().find((a) => a.leaveId === 'lvT11');
    check('T11', 'without the hours: asked (missing_hours); with them: her time blocked 15:00-17:00', h0.error === 'missing_hours' && h1.ok && blk && blk.block && blk.time === '15:00' && blk.endTime === '17:00' && blk.cosmeticianId === 'e-c1', { h0: h0.error, h1: h1.error, blk });

    // 13. one rule for „to confirm”: booked or moved, not confirmed
    check('T13', 'toConfirm: programată and reprogramată, not confirmată', C.toConfirm({ status: 'programata', clientName: 'X' }) && C.toConfirm({ status: 'reprogramata', clientName: 'X' }) && !C.toConfirm({ status: 'confirmata', clientName: 'X' }) && !C.toConfirm({ status: 'programata', block: true }));

    // 14. today from the current half hour: the fill and the free hours start at the same minute
    const now14 = Bk.roNow(), hh = C.halfHourNow(now14), cfg14 = await Bk.settings({ team: true });
    const fl14 = C.fill(cfg14, 'Timișoara', TODAY, TODAY, A());
    const fr14 = await api('admin', 'portal-followups', { action: 'free' });
    const t14 = (((fr14.cities || {})['Timișoara'] || {}).days || []).find((d) => d.date === TODAY);
    check('T14', 'today: capacity from the current half hour, the free hours from it too', Math.abs(fl14.capHours * 60 - C.capMin(cfg14, 'Timișoara', TODAY, A(), hh)) <= 6 && (!t14 || t14.people.every((p) => p.free.every((w) => w.from >= Bk.hhmm(hh)))), { fl: fl14.capHours, cap: C.capMin(cfg14, 'Timișoara', TODAY, A(), hh), hh });

    // 15. who sees what: a one-clinic manager and a cosmetician get their clinics only
    const E15 = rd('data/employees.json', []); E15.find((e) => e.id === 'e-mgr').manages = ['Timișoara']; wr('data/employees.json', E15);
    const g15 = await api('manager', 'portal-schedule', { action: 'get', from: TODAY, to: day(3) });
    const bi15 = await api('manager', 'portal-schedule', { action: 'break_info', date: wd(2), employeeId: 'e-c3' });
    E15.find((e) => e.id === 'e-mgr').manages = ['Timișoara', 'Arad']; wr('data/employees.json', E15);
    const g15c = await api('cosmetician', 'portal-schedule', { action: 'get', from: TODAY, to: day(3) });
    const bi15c = await api('cosmetician', 'portal-schedule', { action: 'break_info', date: wd(2), employeeId: 'e-c3' });
    const noArad = (g) => !Object.keys(g.cities || {}).includes('Arad') && !(g.people || []).some((p) => p.location === 'Arad' && p.id !== 'e-c1') && Object.values(g.works || {}).every((d) => !(d.Arad || []).some((w) => w.employeeId !== 'e-c1'));
    check('T15', 'schedule get: Timișoara only (manager of TM, a TM cosmetician); break_info for Arad: 403', noArad(g15) && noArad(g15c) && bi15._status === 403 && bi15c._status === 403, { m: [Object.keys(g15.cities || {}), bi15._status], c: [Object.keys(g15c.cities || {}), bi15c._status] });

    // 16. without a schedule, only a cosmetician's leave takes a place (reception's day off doesn't)
    const D16 = wd(16); // inside the site's 21 days
    const ts16 = rd('data/team-schedule.json', {}); const keep16 = ts16.weekly['e-c3']; delete ts16.weekly['e-c3']; delete ts16.weekly['e-c5']; wr('data/team-schedule.json', ts16);
    const cfg16 = await Bk.settings({ team: true });
    wr('data/appointments.json', A().filter((a) => a.date !== D16));
    const c16a = C.capMin(cfg16, 'Arad', D16, A());
    wr('data/appointments.json', A().concat([{ id: 'fx-rec-off', date: D16, time: '', endTime: '', location: 'Arad', cosmeticianId: 'e-rec', clientName: 'Concediu', treatment: 'Concediu', status: 'concediu', createdBy: 'leave-approval', createdAt: at(TODAY, '08:00') }]));
    const c16b = C.capMin(cfg16, 'Arad', D16, A());
    const s16 = (Bk.freeOn(cfg16, 'Arad', D16, 30, A()) || []).length;
    wr('data/appointments.json', A().filter((a) => a.id !== 'fx-rec-off'));
    const s16a = (Bk.freeOn(cfg16, 'Arad', D16, 30, A()) || []).length;
    ts16.weekly['e-c3'] = keep16; wr('data/team-schedule.json', ts16);
    check('T16', 'reception\'s day off: the clinic\'s places as they were (fill and site)', c16a > 0 && c16a === c16b && s16 === s16a && s16 > 0, { c16a, c16b, s16, s16a });

    // the desk's change today or tomorrow: a short line on her phone; a site booking moved by the desk stops waiting for her „Confirm”
    const TM1 = C.addDay(TODAY, 1);
    const d1 = await book({ date: TM1, time: '18:00', endTime: '18:30', location: 'Timișoara', cosmeticianId: 'e-c1', clientName: 'Push Proba' });
    check('push', 'a booking for tomorrow: „Programare nouă mâine la 18:00”', notes('e-c1', /Programare nouă mâine la 18:00/).length >= 1);
    await api('receptie', 'portal-appointments', Object.assign({}, row(d1.appointment.id), { action: 'update', time: '19:00', endTime: '19:30', categories: ['corporale'] }));
    check('push', 'moved: „Clienta de la 18:00 s-a mutat la 19:00”', notes('e-c1', /Clienta de la 18:00 s-a mutat la 19:00/).length >= 1, rd('data/notifications.json', []).filter((n) => n.employeeId === 'e-c1').slice(-2));
    const sid = 'fx-site-T';
    wr('data/appointments.json', A().concat([{ id: sid, date: wd(3), time: '15:00', endTime: '16:00', location: 'Arad', cosmeticianId: 'e-c3', clientName: 'Site Mutat', clientId: 'cl-stT', clientPhone: '0755654300', treatment: 'Lipo 640', categories: ['corporale'], status: 'programata', online: true, createdBy: 'site', createdAt: at(TODAY, '08:00') }]));
    const sc = rd('data/site-confirm.json', {}); sc[sid] = { plan: 'remind', at: at(TODAY, '08:00'), remindAt: at(TODAY, '12:00'), cancelAt: at(TODAY, '15:00') }; wr('data/site-confirm.json', sc);
    await api('receptie', 'portal-appointments', Object.assign({}, row(sid), { action: 'update', time: '16:00', endTime: '17:00' }));
    check('site', 'a site booking moved by the desk: its auto-cancel ends („moved”)', (rd('data/site-confirm.json', {})[sid] || {}).done === 'moved', rd('data/site-confirm.json', {})[sid]);
    const lht = await api('admin', 'lead-health', null, 'time=1');
    check('lh', 'lead-health ?time=1: counts per clinic, no names', lht.cities && lht.cities.Arad && typeof lht.cities.Arad.unmarked.all === 'number' && !/Proba/.test(JSON.stringify(lht)), lht);
  }

  // WEEK (17.11): Program echipă → „Pe săptămâni”: the real week of each one, written as date entries only where it differs
  // from her week; back to the week clears them; the rotation; who may; the checks
  {
    ROLE.cosmetician = 'e-c1';
    const A = () => rd('data/appointments.json', []);
    const row = (id) => A().find((a) => a.id === id) || null;
    const book = (o) => api('receptie', 'portal-appointments', Object.assign({ action: 'create', treatment: 'Lipo 640', categories: ['corporale'], amount: 0, status: 'programata', force: true, clientPhone: '07' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0') }, o));
    const tsKeep = rd('data/team-schedule.json', {});
    const S = () => rd('data/team-schedule.json', { dates: {} });
    const plus = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
    let M = day(70); while (new Date(M + 'T12:00:00Z').getUTCDay() !== 1) M = plus(M, 1);
    const wk = (d0, f, t, sat) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((i) => [plus(d0, i), i < 5 ? { on: true, from: f, to: t } : i === 5 && sat ? { on: true, from: '10:00', to: '14:00' } : { on: false }]));
    const entry = (d, id) => ((S().dates || {})[d] || {})[id];
    // 1. only the days that differ
    const w1 = await api('admin', 'portal-schedule', { action: 'save_weeks', monday: M, people: { 'e-c1': Object.assign(wk(M, '09:00', '17:00'), { [M]: { on: true, from: '12:00', to: '20:00' } }), 'e-c2': wk(M, '09:00', '17:00') } });
    const only1 = [0, 1, 2, 3, 4, 5, 6].map((i) => plus(M, i)).filter((d) => entry(d, 'e-c1') || entry(d, 'e-c2'));
    check('W1', 'save week: a date entry only for the day that differs (her Monday 12-20)', w1.ok && w1.changes === 1 && only1.length === 1 && only1[0] === M && entry(M, 'e-c1').from === '12:00' && entry(M, 'e-c1').to === '20:00' && entry(M, 'e-c1').on === true, { err: w1.error, ch: w1.changes, only1, e: entry(M, 'e-c1') });
    // 2. back to the template: the entries go (one from „Excepții” too)
    await api('admin', 'portal-schedule', { action: 'save_date', date: plus(M, 2), employeeId: 'e-c1', entry: { on: false } });
    const w2 = await api('admin', 'portal-schedule', { action: 'save_weeks', monday: M, people: { 'e-c1': wk(M, '09:00', '17:00') } });
    check('W2', 'set back to her week: no entry left that week', w2.ok && w2.changes === 2 && !entry(M, 'e-c1') && !entry(plus(M, 2), 'e-c1'), { err: w2.error, ch: w2.changes, a: entry(M, 'e-c1'), b: entry(plus(M, 2), 'e-c1') });
    // 3. who may: the manager for her clinics only, never herself; reception and a cosmetician never
    const E3 = rd('data/employees.json', []); E3.find((e) => e.id === 'e-mgr').manages = ['Timișoara']; wr('data/employees.json', E3);
    const m3a = await api('manager', 'portal-schedule', { action: 'save_weeks', monday: M, people: { 'e-c3': { [M]: { on: true, from: '12:00', to: '20:00' } } } });
    const m3b = await api('manager', 'portal-schedule', { action: 'save_weeks', monday: M, people: { 'e-c1': { [M]: { on: true, from: '09:00', to: '17:00', location: 'Arad' } } } });
    const m3c = await api('manager', 'portal-schedule', { action: 'save_weeks', monday: M, people: { 'e-mgr': { [M]: { on: true, from: '09:00', to: '17:00' } } } });
    const m3d = await api('manager', 'portal-schedule', { action: 'save_weeks', monday: M, people: { 'e-c1': { [plus(M, 1)]: { on: true, from: '12:00', to: '20:00' } } } });
    E3.find((e) => e.id === 'e-mgr').manages = ['Timișoara', 'Arad']; wr('data/employees.json', E3);
    check('W3', 'manager of Timișoara: Arad\'s people 403, a day in Arad 403, herself 403; her own people ok', m3a._status === 403 && m3b._status === 403 && m3c._status === 403 && m3d.ok && entry(plus(M, 1), 'e-c1') && entry(plus(M, 1), 'e-c1').from === '12:00', { a: m3a._status, b: m3b._status, c: m3c._status, d: m3d.error });
    const r3 = await api('receptie', 'portal-schedule', { action: 'save_weeks', monday: M, people: { 'e-c1': { [M]: { on: false } } } });
    const c3 = await api('cosmetician', 'portal-schedule', { action: 'save_weeks', monday: M, people: { 'e-c1': { [M]: { on: false } } } });
    const p3 = await api('receptie', 'portal-schedule', { action: 'preview_weeks', monday: M, people: { 'e-c1': { [M]: { on: false } } } });
    check('W3', 'reception and a cosmetician: 403 (save and preview), nothing written', r3._status === 403 && c3._status === 403 && p3._status === 403 && !entry(M, 'e-c1'), { r: r3._status, c: c3._status, p: p3._status });
    // 4. the checks: half hours only, from before to, a Monday, not the past, a real city
    const bad = async (people, monday) => (await api('admin', 'portal-schedule', { action: 'save_weeks', monday: monday || M, people })).error;
    const e4 = [await bad({ 'e-c1': { [M]: { on: true, from: '09:15', to: '17:00' } } }), await bad({ 'e-c1': { [M]: { on: true, from: '17:00', to: '09:00' } } }),
      await bad({ 'e-c1': { [M]: { on: true, from: '09:00', to: '17:00' } } }, plus(M, 1)), await bad({ 'e-c1': { [plus(M, 7)]: { on: false } } }),
      await bad({ 'e-c1': { [M]: { on: true, from: '09:00', to: '17:00', location: 'Cluj' } } }), await bad({ 'e-xx': { [M]: { on: false } } })];
    let PM = TODAY; while (new Date(PM + 'T12:00:00Z').getUTCDay() !== 1) PM = plus(PM, -1);
    const past = new Date(TODAY + 'T12:00:00Z').getUTCDay() === 1 ? 'invalid_date' : await bad({ 'e-c1': { [PM]: { on: false } } }, PM);
    check('W4', 'checks: 09:15, 17-9, not a Monday, a day of another week, Cluj, someone unknown, a past day', e4.join() === 'invalid_time,invalid_range,invalid_date,invalid_date,invalid_location,invalid_cosmetician' && past === 'invalid_date', { e4, past });
    // 5. the rotation: A (12-20 and a Saturday) and B (her week), alternating; the preview writes nothing and counts the same
    wr('data/team-schedule.json', Object.assign(S(), { dates: Object.fromEntries(Object.entries(S().dates || {}).filter(([d]) => d < M)) }));
    const A5 = wk(M, '12:00', '20:00', true);
    const pv = await api('admin', 'portal-schedule', { action: 'preview_weeks', monday: M, people: { 'e-c1': A5 }, repeat: { weeks: 4, mode: 'alternate' } });
    const none = !Object.keys(S().dates || {}).some((d) => d >= M);
    const r5 = await api('admin', 'portal-schedule', { action: 'save_weeks', monday: M, people: { 'e-c1': A5 }, repeat: { weeks: 4, mode: 'alternate' } });
    const got5 = Object.keys(S().dates || {}).filter((d) => d >= M && entry(d, 'e-c1')).sort();
    const want5 = [0, 14, 28].flatMap((o) => [0, 1, 2, 3, 4, 5].map((i) => plus(M, o + i)));
    check('W5', 'preview: 18 days in 3 weeks, nothing written', pv.ok && pv.changes === 18 && pv.weeks.length === 3 && none, { err: pv.error, ch: pv.changes, w: pv.weeks, none });
    check('W5', 'alternate 4 weeks: A this week, +2, +4; B (her week) +1, +3, no entries there', r5.ok && r5.changes === 18 && got5.join() === want5.join() && entry(plus(M, 33), 'e-c1').from === '10:00', { err: r5.error, got5 });
    const s5 = await api('admin', 'portal-schedule', { action: 'save_weeks', monday: plus(M, 7), people: { 'e-c2': wk(plus(M, 7), '12:00', '20:00') }, repeat: { weeks: 2, mode: 'same' } });
    const got5b = [7, 14, 21].map((o) => !!entry(plus(M, o), 'e-c2') && entry(plus(M, o), 'e-c2').from === '12:00');
    check('W5', '„la fel” 2 weeks: the same week three times, nothing after', s5.ok && got5b.every(Boolean) && !entry(plus(M, 28), 'e-c2') && s5.weeks.length === 3, { err: s5.error, got5b, w: s5.weeks });
    // 6. a booking the new hours leave out: counted by the preview; a day off marks it as today's save_date does
    const D6w = plus(M, 3);
    const b6 = await book({ date: D6w, time: '10:00', endTime: '11:00', location: 'Timișoara', cosmeticianId: 'e-c2', clientName: 'Saptamana Proba' });
    const pv6 = await api('admin', 'portal-schedule', { action: 'preview_weeks', monday: M, people: { 'e-c2': { [D6w]: { on: true, from: '12:00', to: '20:00' } } } });
    const sv6 = await api('admin', 'portal-schedule', { action: 'save_weeks', monday: M, people: { 'e-c2': { [D6w]: { on: false } } } });
    check('W6', 'her client at 10:00: preview counts it outside 12-20; a day off leaves it to be given away', pv6.outside === 1 && sv6.ok && (sv6.affected || []).some((a) => a.id === b6.appointment.id) && !!row(b6.appointment.id).offShift, { o: pv6.outside, err: sv6.error, aff: (sv6.affected || []).length });
    const g6 = await api('manager', 'portal-schedule', { action: 'get', from: M, to: plus(M, 6) });
    check('W6', 'get for the week: clinic hours and leave for the hints', g6.open && g6.open['Timișoara'] && g6.open['Timișoara']['1'].from && g6.leave && typeof g6.leave === 'object', { open: g6.open, leave: g6.leave });
    wr('data/team-schedule.json', tsKeep);
    wr('data/appointments.json', A().filter((a) => a.id !== b6.appointment.id));
  }

  // J. the journeys carry through (16.11, the audit): the lead follows the visit, the payment and a refund; „A răspuns”
  // moves her to Contactat; a package's rest is paid with no visit; the calculator's offer is kept as data and offered at
  // the payment; her sheet has her rest, last visit and lead; the Panou knows she hasn't clocked in; a hired candidate
  // gets her account from the Pipeline; the manager's row says her clinics
  {
    ROLE.cosmetician = 'e-c1';
    const leadOf = (id) => rd('data/leads.json', []).find((l) => l.id === id);
    const nl = await api('manager', 'portal-leads', { action: 'create', name: 'Drum Complet', phone: '0766100200', source: 'telefon', location: 'Timișoara', interest: 'Lipo 640' });
    const L1 = nl.lead && nl.lead.id;
    const lc0 = await api('manager', 'portal-leads', { action: 'log_contact', leadId: L1, channel: 'call', outcome: 'nu_raspunde' });
    const lc1 = await api('manager', 'portal-leads', { action: 'log_contact', leadId: L1, channel: 'call', outcome: 'raspuns' });
    check('J', '„Nu răspunde” keeps her in Lead nou; „A răspuns” moves her to Contactat', lc0.ok && lc0.lead.stage === 'lead_nou' && lc1.ok && lc1.lead.stage === 'contactat' && lc1.moved === 'Contactat', { s0: lc0.lead && lc0.lead.stage, s1: lc1.lead && lc1.lead.stage, m: lc1.moved });
    const bk = await api('manager', 'portal-appointments', { action: 'create', leadId: L1, date: TODAY, time: '08:00', endTime: '08:30', location: 'Timișoara', cosmeticianId: 'e-c1', clientName: 'Drum Complet', clientPhone: '0766100200', treatment: 'Lipo 640', categories: ['corporale'], amount: 0, status: 'confirmata', force: true });
    const A1 = bk.appointment && bk.appointment.id;
    check('J', 'booked from her lead: Programare stabilită', bk.ok && leadOf(L1).stage === 'programare_stabilita' && leadOf(L1).appointmentId === A1, { err: bk.error, st: leadOf(L1) && leadOf(L1).stage });
    const mk = await api('cosmetician', 'portal-appointments', { action: 'mark', id: A1, mark: 'came' });
    const l1 = leadOf(L1);
    check('J', '„Finalizată”: Venit la programare, „A venit” in her history, no booking left on her card', mk.ok && l1.stage === 'venit_la_programare' && l1.activities.some((x) => x.type === 'visit' && x.apptId === A1) && !l1.appointmentId, { err: mk.error, st: l1.stage, ap: l1.appointmentId });
    // a second visit, paid: the won column, the payment in her history
    const bk2 = await api('manager', 'portal-appointments', { action: 'create', leadId: L1, date: TODAY, time: '08:30', endTime: '09:00', location: 'Timișoara', cosmeticianId: 'e-c1', clientName: 'Drum Complet', clientPhone: '0766100200', treatment: 'Lipo 640', categories: ['corporale'], amount: 300, status: 'confirmata', force: true });
    const A2 = bk2.appointment && bk2.appointment.id;
    const py = await api('manager', 'portal-sale', { source: 'incasare', appointmentId: A2, method: 'card', performedBy: 'e-c1', parts: { session: 300, upsell: true, upsellValue: 1200, upsellPaid: 200, upsellWhat: 'Pachet drum' } });
    const l2 = leadOf(L1);
    check('J', 'paid: Client fidel, „Încasare 500” in her history', py.ok && l2.stage === 'client_fidel' && l2.activities.some((x) => x.type === 'payment' && x.amount === 500 && x.saleId === py.entry.id), { err: py.error, st: l2.stage, acts: l2.activities.slice(-3) });
    const visits = l2.activities.filter((x) => x.type === 'visit').length;
    check('J', 'each visit once in her history', visits === 2, visits);
    // her sheet: the rest of the package, her last visit, her lead
    const cg = await api('manager', 'portal-contacts', { action: 'get', id: py.entry.clientId });
    check('J', 'her sheet: rest 1.000, last visit today, „Vezi leadul”, her city', cg.ok && (cg.dues || []).reduce((x, d) => x + d.rest, 0) === 1000 && cg.lastCame === TODAY && cg.leadId === L1 && cg.contact.location === 'Timișoara', { dues: cg.dues, last: cg.lastCame, lead: cg.leadId, loc: cg.contact && cg.contact.location });
    // the rest, with no visit
    const dueId = py.due && py.due.id;
    const over = await api('manager', 'portal-sale', { source: 'incasare', dueId, amount: 1500, method: 'cash' });
    const rp = await api('manager', 'portal-sale', { source: 'incasare', dueId, amount: 400, method: 'transfer' });
    const rpRow = rd('data/sales.json', []).find((x) => x.id === (rp.entry && rp.entry.id));
    check('J', 'rest with no visit: 400 paid, 600 left, nobody\'s day (no performer), more than the rest refused', over._status === 400 && over.error === 'over_rest' && rp.ok && rp.due && rp.due.rest === 600 && rpRow && rpRow.restOnly && rpRow.performedBy === '' && !rpRow.appointmentId && rpRow.toDue === 400, { over: over.error, err: rp.error, due: rp.due });
    const rp2 = await api('manager', 'portal-sale', { source: 'incasare', dueId, amount: 400, method: 'transfer' });
    check('J', '… the same sum again at once: 409 already_paid', rp2._status === 409, rp2);
    const l3 = leadOf(L1);
    check('J', '… in her lead\'s history too, still Client fidel', l3.stage === 'client_fidel' && l3.activities.some((x) => x.type === 'payment' && x.saleId === rp.entry.id), l3.activities.slice(-2));
    // a cosmetician of the other clinic can't take it
    ROLE.cosmetician = 'e-c3';
    const rpX = await api('cosmetician', 'portal-sale', { source: 'incasare', dueId, amount: 100, method: 'cash' });
    ROLE.cosmetician = 'e-c1';
    check('J', '… not from the other clinic (403)', rpX._status === 403, rpX);
    // the regulation (18.11): only the desk takes payments, never a cosmetician, even of the same clinic
    const rpC = await api('cosmetician', 'portal-sale', { source: 'incasare', dueId, amount: 100, method: 'cash' });
    check('J', '… and never by a cosmetician, even of the same clinic (403 desk_only)', rpC._status === 403 && rpC.error === 'desk_only', rpC);
    // a refund: in her lead's history
    const rf = await api('admin', 'portal-incasari', { action: 'refund', id: py.entry.id, scope: 'payment', amount: 100, close: false, method: 'cash', date: TODAY, reason: 'probă' });
    check('J', 'a refund: „Rambursare 100” in her lead\'s history', rf.ok && leadOf(L1).activities.some((x) => x.type === 'refund' && x.amount === 100), { err: rf.error, acts: leadOf(L1).activities.slice(-2) });
    // the calculator's offer: on her sheet, her record and the booking; the payment drawer gets it
    const A3 = (await api('manager', 'portal-appointments', { action: 'create', date: TODAY, time: '09:00', endTime: '09:30', location: 'Timișoara', cosmeticianId: 'e-c1', clientName: 'Drum Complet', clientPhone: '0766100200', treatment: 'Consultație', categories: ['corporale'], amount: 0, status: 'confirmata', force: true })).appointment.id;
    const offer = { city: 'tm', total: 3000, half: 1500, lines: [{ name: 'LipoSonix', zone: 'abdomen', sessions: 6, unit: 500, sub: 3000 }], pages: [{ page: 2, title: 'Pachet complet, plată integrală', off: 50, pay: 1500, parts: 0 }, { page: 3, title: 'Pachet complet, 4 tranșe', off: 30, pay: 2100, parts: 4 }] };
    const os = await api('cosmetician', 'portal-contacts', { action: 'offer_save', id: py.entry.clientId, offer, text: 'Program recomandat', appointmentId: A3 });
    const apx = rd('data/appointments.json', []).find((a) => a.id === A3), clx = rd('data/clients.json', []).find((c) => c.id === py.entry.clientId);
    check('J', 'offer saved as data: sheet, client, booking (her own)', os.ok && (os.detail.offers || [])[0] && os.detail.offers[0].pages.length === 2 && apx.offer && apx.offer.total === 3000 && clx.lastOffer && clx.lastOffer.pages[1].pay === 2100 && os.detail.notes.some((n) => n.text === 'Program recomandat'), { err: os.error });
    ROLE.cosmetician = 'e-c2';
    const osX = await api('cosmetician', 'portal-contacts', { action: 'offer_save', id: py.entry.clientId, offer, appointmentId: A3 });
    ROLE.cosmetician = 'e-c1';
    check('J', '… not on another cosmetician\'s booking (403)', osX._status === 403, osX);
    const up = await api('manager', 'portal-appointments', { action: 'unpaid' });
    check('J', 'Încasează gets her offer for that booking', up.ok && up.offers && up.offers[A3] && up.offers[A3].pages.length === 2 && /LipoSonix, abdomen/.test(up.offers[A3].what), up.offers && up.offers[A3]);
    // Panou: not clocked in yet, then clocked in
    const pdA = await api('receptie', 'portal-data', null);
    const ci = await api('receptie', 'portal-attendance', { action: 'clock_in' });
    const pdB = await api('receptie', 'portal-data', null);
    const pdO = await api('admin', 'portal-data', null);
    check('J', 'myClock: no arrival, then the arrival; the owner has none', pdA.myClock && !pdA.myClock.checkIn && ci.ok && pdB.myClock && pdB.myClock.checkIn === ci.entry.checkIn && pdO.myClock == null, { a: pdA.myClock, b: pdB.myClock });
    // a hired candidate: her account from the Pipeline, linked
    const ne = await api('admin', 'portal-employees', { action: 'create', name: 'Candidată Doi', location: 'Arad', role: 'receptie', username: 'cand2proba', password: 'parola-proba', candidateId: 'cd2' });
    const cd2 = rd('data/candidates.json', []).find((c) => c.id === 'cd2');
    const cl = await api('admin', 'portal-candidates', null);
    check('J', '„Creează contul”: the account, the candidate hired and linked', ne.ok && cd2.employeeId === ne.employee.id && cd2.status === 'angajat' && (cl.candidates || []).find((c) => c.id === 'cd2').employeeId === ne.employee.id, { err: ne.error, cd2 });
    // the manager's row: her clinics
    const ba = await api('manager', 'portal-attendance', { action: 'balance_all' });
    const mrow = (ba.employees || []).find((e) => e.employeeId === 'e-mgr');
    check('J', 'the team list: the manager with her clinics', mrow && Array.isArray(mrow.manages) && mrow.manages.join(' și ') === 'Timișoara și Arad', mrow);
    // a cancelled booking: back out of Programare stabilită (Anulat, the owner's column of 9.11)
    const nl2 = await api('manager', 'portal-leads', { action: 'create', name: 'Anulată Proba', phone: '0766100300', source: 'telefon', location: 'Timișoara', interest: 'Lipo 640' });
    const bk3 = await api('manager', 'portal-appointments', { action: 'create', leadId: nl2.lead.id, date: day(2), time: '09:30', endTime: '10:00', location: 'Timișoara', cosmeticianId: 'e-c1', clientName: 'Anulată Proba', clientPhone: '0766100300', treatment: 'Lipo 640', categories: ['corporale'], amount: 0, status: 'programata', force: true });
    const del = await api('manager', 'portal-appointments', { action: 'delete', id: bk3.appointment.id });
    const l4 = leadOf(nl2.lead.id);
    check('J', 'a deleted booking: out of Programare stabilită, the booking gone from her card', del.ok && l4.stage !== 'programare_stabilita' && !l4.appointmentId, { st: l4.stage });
  }

  // REGULAMENT INTERN (17.11, in force from 18.11): only reception books, leave 2 months ahead, the acknowledgement per
  // version, Manager → Reguli, a package's next session for reception
  {
    ROLE.cosmetician = 'e-c1';
    process.env.RULES_SINCE = day(-30); // the harness's made-up days count (production: from 18.11)
    const A = () => rd('data/appointments.json', []);
    const row = (id) => A().find((a) => a.id === id) || null;
    const NK = () => rd('data/notifications.json', []);
    const TK = () => rd('data/automation-tasks.json', []);
    const wdAhead = (n) => { let d = day(n); while ([0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay())) d = day(n += 1); return d; };
    const ap0 = A();
    ap0.push({ id: 'rg-own', date: TODAY, time: '08:00', endTime: '08:30', location: 'Timișoara', cosmeticianId: 'e-c1', cosmeticianName: 'Maria Proba', clientName: 'Proprie Proba', clientId: 'cl-rg-own', clientPhone: '0755100100', treatment: 'Lipo 640', categories: ['corporale'], amount: 0, status: 'confirmata', createdAt: at(day(-3), '10:00') });
    wr('data/appointments.json', ap0);
    const base = row('rg-own');
    const asCos = (body) => api('cosmetician', 'portal-appointments', body);
    const full = Object.assign({}, base, { clientPhone: '0755100100' });
    const tries = [
      ['create', await asCos(Object.assign({}, full, { action: 'create', id: undefined, date: day(4), time: '10:00', force: true }))],
      ['move', await asCos(Object.assign({}, full, { action: 'update', time: '09:00' }))],
      ['reschedule (reprogramată)', await asCos(Object.assign({}, full, { action: 'update', status: 'reprogramata' }))],
      ['cancel', await asCos(Object.assign({}, full, { action: 'update', status: 'anulata' }))],
      ['delete', await asCos({ action: 'delete', id: 'rg-own' })],
      ['block time', await asCos({ action: 'block', date: day(4), location: 'Timișoara', time: '10:00', endTime: '11:00', label: 'Proba' })],
      ['reassign', await asCos({ action: 'reassign', id: 'rg-own', cosmeticianId: 'e-c2' })],
      ['break move', await api('cosmetician', 'portal-schedule', { action: 'break_set', date: TODAY, employeeId: 'e-c1', from: '13:00' })],
      ['break off', await api('cosmetician', 'portal-schedule', { action: 'break_off', date: TODAY, employeeId: 'e-c1' })],
      ['lead link', await api('cosmetician', 'portal-leads', { action: 'link_appointment', leadId: (rd('data/leads.json', [])[0] || {}).id, appointmentId: 'rg-own', date: TODAY, time: '08:00', treatment: 'Lipo 640' })],
    ];
    const open = tries.filter(([, r]) => r._status !== 403).map(([n, r]) => n + ':' + r._status);
    check('RG', 'a cosmetician: 403 on every booking path (create, move, reprogramată, cancel, delete, block, reassign, break, lead)', !open.length, open);
    check('RG', '… and the booking is as it was', row('rg-own') && row('rg-own').time === '08:00' && row('rg-own').status === 'confirmata', row('rg-own'));
    const mk = await asCos({ action: 'mark', id: 'rg-own', mark: 'came' });
    check('RG', 'she still marks her own visit „Finalizată”', mk.ok && row('rg-own').status === 'finalizata', mk);
    const rc = await api('receptie', 'portal-appointments', Object.assign({}, full, { action: 'create', id: undefined, clientName: 'Recepție Proba', clientId: undefined, clientPhone: '0755100101', date: day(4), time: '12:00', status: 'programata', force: true }));
    check('RG', 'reception books as before', rc.ok && rc.appointment && rc.appointment.createdBy === 'e-rec', rc);

    // leave: 2 months ahead, sooner only as a special situation with its reason; medical and the owner's notes exempt
    ROLE.cosmetician = 'e-c2';
    const lv = (b) => api('cosmetician', 'portal-leave', Object.assign({ action: 'create' }, b));
    const l1 = await lv({ type: 'odihna', startDate: wdAhead(20), endDate: day(26) });
    const l2 = await lv({ type: 'odihna', startDate: wdAhead(20), endDate: day(26), special: true, reason: '' });
    const l3 = await lv({ type: 'odihna', startDate: wdAhead(20), endDate: day(26), special: true, reason: 'Nunta surorii, aflată acum' });
    const l4 = await lv({ type: 'odihna', startDate: wdAhead(80), endDate: day(86) });
    const l5 = await lv({ type: 'medical', startDate: wdAhead(40), endDate: day(42), reason: 'Operație programată' });
    const l6 = await api('admin', 'portal-leave', { action: 'admin_create', employeeId: 'e-c3', type: 'odihna', startDate: wdAhead(50), endDate: day(54), reason: '' });
    const ll = await api('cosmetician', 'portal-leave', { action: 'list' });
    check('RG', 'leave under 60 days: refused without „Situație specială” (too_soon)', l1._status === 400 && l1.error === 'too_soon', l1);
    check('RG', '… and without its reason (missing_special_reason)', l2._status === 400 && l2.error === 'missing_special_reason', l2);
    check('RG', '… with both: sent, marked „sub 2 luni”', l3.ok && l3.request.short === true && /Nunta/.test(l3.request.reason), l3);
    check('RG', '60+ days ahead: no flag needed, not marked', l4.ok && !l4.request.short, l4);
    check('RG', 'medical leave and a leave noted by the owner: exempt', l5.ok && !l5.request.short && l6.ok, { l5, l6 });
    check('RG', 'the form gets „Cel mai devreme” (60 days)', ll.earliest === day(60), ll.earliest);
    const ml = await api('manager', 'portal-leave', { action: 'list' });
    check('RG', 'the manager sees it marked, with the reason', (ml.requests || []).some((r) => r.id === l3.request.id && r.short && r.reason), null);
    ROLE.cosmetician = 'e-c1';

    // the regulation: upload by the owner and the manager only, one acknowledgement per version
    const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64');
    const g0 = await api('cosmetician', 'portal-regulament', { action: 'get' });
    const upC = await api('cosmetician', 'portal-regulament', { action: 'upload', name: 'Regulament', dataUrl: pdf });
    const upBad = await api('manager', 'portal-regulament', { action: 'upload', name: 'Regulament', dataUrl: 'data:application/pdf;base64,' + Buffer.from('nu e pdf').toString('base64') });
    const up1 = await api('manager', 'portal-regulament', { action: 'upload', name: 'Regulament intern', dataUrl: pdf });
    check('RG', 'nothing uploaded: nothing to confirm; a cosmetician can\'t upload; only a real PDF', g0.ok && !g0.current && !g0.me.must && upC._status === 403 && upBad._status === 400, { g0, upC: upC._status, upBad: upBad._status });
    check('RG', 'the manager uploads version 1; the team hears it', up1.ok && up1.current && up1.current.n === 1 && NK().some((n) => n.employeeId === 'e-c1' && n.tag === 'regulament-1'), up1.current);
    const pdA = await api('cosmetician', 'portal-data', null);
    const f1 = await fetch('http://127.0.0.1:' + PORT + up1.current.url, { headers: { cookie: cookieFor('e-c1', 'cosmetician') } });
    check('RG', 'she has it to confirm (menu dot) and can open the PDF', pdA.regulament && pdA.regulament.must === true && f1.status === 200, { reg: pdA.regulament, file: f1.status });
    const a1 = await api('cosmetician', 'portal-regulament', { action: 'ack' });
    const a1b = await api('cosmetician', 'portal-regulament', { action: 'ack' });
    const pdB = await api('cosmetician', 'portal-data', null);
    check('RG', '„Am citit regulamentul”: saved once, with the time', a1.ok && a1.me.at && !a1.me.must && a1b.me.at === a1.me.at && pdB.regulament.must === false, { a1: a1.me, a1b: a1b.me });
    const mg1 = await api('manager', 'portal-regulament', { action: 'get' });
    const p1 = (mg1.people || []).find((p) => p.id === 'e-c1'), p2 = (mg1.people || []).find((p) => p.id === 'e-c2');
    check('RG', 'the manager sees who confirmed and who not yet', p1 && p1.at === a1.me.at && p2 && !p2.at, { p1, p2 });
    const up2 = await api('admin', 'portal-regulament', { action: 'upload', name: 'Regulament intern', dataUrl: pdf });
    const g2 = await api('cosmetician', 'portal-regulament', { action: 'get' });
    const mg2 = await api('admin', 'portal-regulament', { action: 'get' });
    const q1 = (mg2.people || []).find((p) => p.id === 'e-c1');
    check('RG', 'a new version: she confirms again; her version 1 stays on record', up2.current.n === 2 && g2.me.must && q1 && !q1.at && q1.last && q1.last.n === 1 && (mg2.versions || []).length === 2, { g2: g2.me, q1 });
    const ad = await api('admin', 'portal-regulament', { action: 'ack' });
    check('RG', 'the owner\'s own login has nothing to confirm', ad._status === 400 && !mg2.me.must, ad);

    // Reguli: late clock-in vs Program echipă, no clock-in, no clock-out, unmarked, missing sheet / photos, made by a cosmetician
    const em = rd('data/employees.json', []);
    em.push(Object.assign({}, em.find((e) => e.id === 'e-c1'), { id: 'e-c6', name: 'Reguli Proba', username: 'c6', location: 'Timișoara' }));
    wr('data/employees.json', em);
    const ts = rd('data/team-schedule.json', { weekly: {}, dates: {} });
    ts.weekly['e-c6'] = { location: 'Timișoara', days: Object.fromEntries(['1', '2', '3', '4', '5', '6', '7'].map((k) => [k, { on: true, from: '09:00', to: '17:00' }])) };
    wr('data/team-schedule.json', ts);
    const att = rd('data/attendance.json', []);
    att.push({ id: 'rg-a1', employeeId: 'e-c6', date: day(-1), checkIn: '09:12', checkOut: null, location: 'Timișoara' });
    att.push({ id: 'rg-a3', employeeId: 'e-c6', date: day(-3), checkIn: '09:03', checkOut: '17:00', location: 'Timișoara' });
    wr('data/attendance.json', att);
    const ap = A();
    const v = (o) => Object.assign({ location: 'Timișoara', cosmeticianId: 'e-c6', cosmeticianName: 'Reguli Proba', time: '10:00', endTime: '11:00', categories: ['corporale'], amount: 0, createdAt: at(day(-10), '10:00') }, o);
    ap.push(v({ id: 'rg-nm', date: day(-2), clientName: 'Nemarcată Proba', clientId: 'cl-rg-nm', clientPhone: '0755200201', treatment: 'Lipo 640', status: 'programata' }));
    ap.push(v({ id: 'rg-fs1', date: day(-1), clientName: 'Fără fișă Proba', clientId: 'cl-rg-fs1', clientPhone: '0755200202', treatment: 'Consultație gratuită', status: 'finalizata' }));
    ap.push(v({ id: 'rg-fs2', date: day(-1), time: '12:00', endTime: '12:30', clientName: 'Cu fișă Proba', clientId: 'cl-rg-fs2', clientPhone: '0755200203', treatment: 'Consultație gratuită', status: 'finalizata' }));
    ap.push(v({ id: 'rg-ph', date: day(-1), time: '14:00', endTime: '15:00', clientName: 'Fără poze Proba', clientId: 'cl-rg-ph', clientPhone: '0755200204', treatment: 'Lipo 640', status: 'finalizata' }));
    ap.push(v({ id: 'rg-desk', date: day(2), clientName: 'Programată de cosmeticiană', clientId: 'cl-rg-dk', clientPhone: '0755200205', treatment: 'Lipo 640', status: 'programata', createdBy: 'e-c6', createdAt: new Date().toISOString() }));
    wr('data/appointments.json', ap);
    wr('data/contacts/cl-rg-fs2.json', { notes: [], files: [{ id: 'f1', kind: 'fisa', name: 'Fișă', path: 'contacts/cl-rg-fs2/x.jpg', at: at(day(-1), '12:20') }], sessions: [], consent: null, published: [] });
    const rl = await api('manager', 'portal-manager', { action: 'rules', period: '7z' });
    const tm = rl.cities && rl.cities['Timișoara'];
    const has = (list, f) => (list || []).some(f);
    check('RG', 'Reguli: a late arrival (12 min after her 09:00 in Program echipă)', tm && has(tm.late, (x) => x.employeeId === 'e-c6' && x.date === day(-1) && x.minutes === 12) && !has(tm.late, (x) => x.employeeId === 'e-c6' && x.date === day(-3)), tm && tm.late);
    check('RG', 'Reguli: a shift with no clock-in, a day with no clock-out', has(tm.noIn, (x) => x.employeeId === 'e-c6' && x.date === day(-2)) && has(tm.noOut, (x) => x.employeeId === 'e-c6' && x.date === day(-1)), { noIn: tm.noIn, noOut: tm.noOut });
    check('RG', 'Reguli: a past visit not marked', has(tm.unmarked, (x) => x.id === 'rg-nm'), tm.unmarked);
    check('RG', 'Reguli: a consultation done without the sheet scanned that day (the one with it: not listed)', has(tm.sheets, (x) => x.id === 'rg-fs1') && !has(tm.sheets, (x) => x.id === 'rg-fs2'), tm.sheets);
    check('RG', 'Reguli: a first session without before photos', has(tm.photos, (x) => x.id === 'rg-ph'), tm.photos);
    check('RG', 'Reguli: a booking made by a cosmetician', has(tm.desk, (x) => x.id === 'rg-desk' && x.how === 'creată'), tm.desk);
    check('RG', 'Reguli: the leave under 2 months is there', has(tm.leave, (x) => x.id === l3.request.id), tm.leave);
    const rlm = await api('manager', 'portal-manager', { action: 'rules', period: 'azi' });
    check('RG', 'Reguli „Azi”: yesterday\'s items not in it; the manager herself never listed', rlm.ok && !has(rlm.cities['Timișoara'].late, (x) => x.date === day(-1)) && !Object.values(rl.cities).some((c) => has(c.late, (x) => x.employeeId === 'e-mgr') || has(c.noIn, (x) => x.employeeId === 'e-mgr')), null);
    const rlc = await api('cosmetician', 'portal-manager', { action: 'rules' });
    check('RG', 'Reguli: not for a cosmetician (403)', rlc._status === 403, rlc._status);
    // next week's hours: Wednesday morning the manager hears it once
    const RU = require('../api/_lib/rules');
    let wed = TODAY; while (new Date(wed + 'T12:00:00Z').getUTCDay() !== 3) wed = C.addDay(wed, 1);
    const sp0 = await RU.schedulePush({ now: { date: C.addDay(wed, -1), time: '10:00' } });
    const sp1 = await RU.schedulePush({ now: { date: wed, time: '10:00' } });
    const sp2 = await RU.schedulePush({ now: { date: wed, time: '11:00' } });
    check('RG', 'next week missing in Program echipă: Wednesday 10:00 the manager hears it, once; not on Tuesday', sp0.skipped === 'not_now' && sp1.told >= 1 && sp2.skipped === 'done' && NK().some((n) => n.employeeId === 'e-mgr' && /^program-/.test(n.tag || '')), { sp0, sp1, sp2 });

    // a package's next session: one task for reception, not when something is booked ahead
    const sales = rd('data/sales.json', []);
    sales.push({ id: 'rg-sl1', source: 'incasare', date: day(-12), createdAt: at(day(-12), '10:00'), clientId: 'cl-rg-pk', clientPhone: '0755300301', client: 'Pachet Proba', location: 'Timișoara', amount: 300, packageTotal: 1800, upsell: 1800, upsellWhat: '6 ședințe LipoSonix', treatment: 'Lipo 640', performedBy: 'e-c1', employeeId: 'e-rec' });
    sales.push({ id: 'rg-sl2', source: 'incasare', date: day(-12), createdAt: at(day(-12), '11:00'), clientId: 'cl-rg-pk2', clientPhone: '0755300302', client: 'Pachet Doi', location: 'Timișoara', amount: 300, packageTotal: 1800, upsell: 1800, upsellWhat: '6 ședințe LipoSonix', treatment: 'Lipo 640', performedBy: 'e-c1', employeeId: 'e-rec' });
    wr('data/sales.json', sales);
    const ap2 = A();
    const pk = (o) => Object.assign({ location: 'Timișoara', cosmeticianId: 'e-c1', cosmeticianName: 'Maria Proba', time: '09:00', endTime: '10:00', treatment: 'Lipo 640', categories: ['corporale'], amount: 0, package: true, createdAt: at(day(-12), '10:00') }, o);
    ap2.push(pk({ id: 'rg-pk1', date: day(-5), clientName: 'Pachet Proba', clientId: 'cl-rg-pk', clientPhone: '0755300301', status: 'finalizata' }));
    ap2.push(pk({ id: 'rg-pk2', date: TODAY, time: '07:00', endTime: '07:30', clientName: 'Pachet Proba', clientId: 'cl-rg-pk', clientPhone: '0755300301', status: 'confirmata' }));
    ap2.push(pk({ id: 'rg-pk3', date: TODAY, time: '07:30', endTime: '08:00', clientName: 'Pachet Doi', clientId: 'cl-rg-pk2', clientPhone: '0755300302', status: 'confirmata' }));
    ap2.push(pk({ id: 'rg-pk4', date: day(6), clientName: 'Pachet Doi', clientId: 'cl-rg-pk2', clientPhone: '0755300302', status: 'programata' }));
    wr('data/appointments.json', ap2);
    const lst = await api('receptie', 'portal-appointments', { action: 'list', from: day(-6), to: TODAY });
    const lp = (lst.appointments || []).find((a) => a.id === 'rg-pk2');
    check('RG', '„Ședința 2 din 6” on the booking (from the package bought)', lp && lp.pkg && lp.pkg.n === 2 && lp.pkg.of === 6, lp && lp.pkg);
    const m2 = await api('cosmetician', 'portal-appointments', { action: 'mark', id: 'rg-pk2', mark: 'came' });
    const t1 = TK().filter((t) => t.type === 'pachet' && t.packNext && t.packNext.clientId === 'cl-rg-pk');
    check('RG', 'a package session done, nothing ahead: reception gets „Programează ședința următoare”', m2.ok && t1.length === 1 && /Pachet Proba/.test(t1[0].title) && /Ședința 2 din 6/.test(t1[0].text) && t1[0].location === 'Timișoara', t1);
    await require('../api/_lib/package-next').done(row('rg-pk2'));
    check('RG', '… created once', TK().filter((t) => t.type === 'pachet' && t.packNext && t.packNext.clientId === 'cl-rg-pk').length === 1, null);
    check('RG', '… reception hears it (bell)', NK().some((n) => n.employeeId === 'e-rec' && n.tag === 'pk-next-rg-pk2'), null);
    const m3 = await api('receptie', 'portal-appointments', { action: 'mark', id: 'rg-pk3', mark: 'came' });
    check('RG', 'no task when the client already has a booking ahead', m3.ok && !TK().some((t) => t.type === 'pachet' && t.packNext && t.packNext.clientId === 'cl-rg-pk2'), m3);
    const tl = await api('receptie', 'portal-automation-tasks', null);
    check('RG', 'the task is in Sarcini', (tl.tasks || []).some((t) => t.id === t1[0].id), null);
    await api('receptie', 'portal-appointments', { action: 'create', clientName: 'Pachet Proba', clientId: 'cl-rg-pk', clientPhone: '0755300301', date: day(7), time: '10:00', endTime: '11:00', location: 'Timișoara', cosmeticianId: 'e-c1', treatment: 'Lipo 640', categories: ['corporale'], amount: 0, package: true, status: 'programata', force: true });
    await api('receptie', 'portal-automation-tasks', null);
    check('RG', 'booked again: the task closes by itself', (TK().find((t) => t.id === t1[0].id) || {}).status === 'done', TK().find((t) => t.id === t1[0].id));
    delete process.env.RULES_SINCE;
  }

  // XT (18.11): overtime („Ore suplimentare”): who may, the checks, apart from her hours (the site never offers it, the desk
  // does), her phone hears it, the timebank never expects it, Reguli lists one not worked
  {
    ROLE.cosmetician = 'e-c3';
    const plus = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
    let D = day(4); while ([0, 6].includes(new Date(D + 'T12:00:00Z').getUTCDay())) D = plus(D, 1);
    let D2 = plus(D, 1); while ([0, 6].includes(new Date(D2 + 'T12:00:00Z').getUTCDay())) D2 = plus(D2, 1);
    const S = () => T.norm(rd('data/team-schedule.json', {}));
    const xs = (d, id) => ((S().extra[d] || {})[id] || []);
    const set = (role, o) => api(role, 'portal-schedule', Object.assign({ action: 'extra_set', employeeId: 'e-c3', date: D }, o));
    const Bk = require('../api/_lib/booking'), TC = require('../api/_lib/time-care');
    const A = () => rd('data/appointments.json', []);
    const slots = async () => (Bk.freeOn(await Bk.settings({ team: true }), 'Arad', D, 30, A()) || []).join();
    const emps0 = rd('data/employees.json', []);
    const ask = { id: 'xt-ask', date: D, time: '17:30', endTime: '18:30', location: 'Arad', cosmeticianId: 'e-nobody', status: 'programata' };
    const free0 = TC.freeFor(ask, A(), emps0, S()).map((x) => x.id);
    const site0 = await slots();
    // 1. who may: a cosmetician, reception: 403; a manager of the other clinic: 403; nothing written
    const E = rd('data/employees.json', []); E.find((e) => e.id === 'e-mgr').manages = ['Timișoara']; wr('data/employees.json', E);
    const c1 = await set('cosmetician', { from: '17:00', to: '19:00' });
    const r1 = await set('receptie', { from: '17:00', to: '19:00' });
    const m1 = await set('manager', { from: '17:00', to: '19:00' });
    E.find((e) => e.id === 'e-mgr').manages = ['Timișoara', 'Arad']; wr('data/employees.json', E);
    check('XT', 'who may: cosmetician, reception, a manager of the other clinic: 403, nothing written', c1._status === 403 && r1._status === 403 && m1._status === 403 && !xs(D, 'e-c3').length, { c: c1._status, r: r1._status, m: m1._status });
    // 2. the checks: half hours, from before to, not over her shift, not a past day, not a leave day
    const bad = async (o, date) => { const r = await set('admin', Object.assign({ date: date || D }, o)); return r.error; };
    const ap = A(); ap.push({ id: 'xt-leave', date: D2, location: 'Arad', cosmeticianId: 'e-c3', status: 'concediu', clientName: 'Concediu', createdAt: new Date().toISOString() }); wr('data/appointments.json', ap);
    const e2 = [await bad({ from: '17:15', to: '19:00' }), await bad({ from: '19:00', to: '17:00' }), await bad({ from: '16:00', to: '18:00' }), await bad({ from: '18:00', to: '20:00' }, day(-1)), await bad({ from: '17:00', to: '19:00' }, D2), await bad({ from: '17:00', to: '19:00', location: 'Cluj' })];
    wr('data/appointments.json', A().filter((a) => a.id !== 'xt-leave'));
    check('XT', 'checks: 17:15, 19-17, over her 9-17, a past day, a leave day, Cluj', e2.join() === 'invalid_time,invalid_range,over_shift,invalid_date,on_leave,invalid_location' && !xs(D, 'e-c3').length, e2);
    // 3. the manager adds one (17-19, right after her shift): stored apart, her phone hears it, get carries it
    const NK = () => rd('data/notifications.json', []);
    const n0 = NK().filter((n) => n.employeeId === 'e-c3' && /ORE SUPLIMENTARE/.test(n.title)).length;
    const a3 = await set('manager', { from: '17:00', to: '19:00', note: 'Clientă de seară' });
    const x3 = xs(D, 'e-c3');
    check('XT', 'added: doc.extra[date][id], her shift untouched', a3.ok && a3.saved && x3.length === 1 && x3[0].from === '17:00' && x3[0].to === '19:00' && x3[0].location === 'Arad' && x3[0].note === 'Clientă de seară' && !((S().dates[D] || {})['e-c3']), { err: a3.error, x3 });
    const n3 = NK().filter((n) => n.employeeId === 'e-c3' && /ORE SUPLIMENTARE/.test(n.title));
    check('XT', 'her phone: „ORE SUPLIMENTARE”, the day and the hours', n3.length === n0 + 1 && /^(luni|marți|miercuri|joi|vineri) \d+\.\d+, 17:00-19:00/.test(n3[n3.length - 1].text), n3.slice(-1));
    const g3 = await api('admin', 'portal-schedule', { action: 'get', from: D, to: D });
    check('XT', 'get: extra and plan (her day 9-17) for the Calendar', g3.extra && g3.extra[D] && g3.extra[D]['e-c3'] && g3.extra[D]['e-c3'][0].from === '17:00' && g3.plan && g3.plan[D] && g3.plan[D]['e-c3'].on && g3.plan[D]['e-c3'].to === '17:00', { x: g3.extra, p: g3.plan && g3.plan[D] });
    const over = await set('admin', { from: '18:00', to: '20:00' });
    check('XT', 'a second one over the first: over_extra', over.error === 'over_extra', over);
    // 4. the desk works it, the site doesn't
    const doc4 = S();
    check('XT', 'workingAt (her shift) no at 18:00; deskAt yes (extra); her shift and the overtime hold 16:30-17:30', !T.workingAt(doc4, 'e-c3', D, '18:00', {}) && (T.deskAt(doc4, 'e-c3', D, '18:00', {}) || {}).extra === true && T.deskCovers(doc4, 'e-c3', D, 'Arad', 16 * 60 + 30, 17 * 60 + 30, {}) && !T.deskCovers(doc4, 'e-c3', D, 'Arad', 18 * 60 + 30, 19 * 60 + 30, {}), null);
    check('XT', 'whoWorks (the site, the fill, the break) unchanged: 9-17', JSON.stringify(T.whoWorks(doc4, D, 'Arad', {}).filter((w) => w.employeeId === 'e-c3')) === JSON.stringify([{ employeeId: 'e-c3', from: '09:00', to: '17:00' }]), T.whoWorks(doc4, D, 'Arad', {}));
    const site4 = await slots();
    check('XT', 'the site\'s free hours: the same as without the overtime (never offered online)', site4 === site0 && !site4.split(',').some((t) => t >= '17:00'), { site0, site4 });
    const free4 = TC.freeFor(ask, A(), emps0, S()).map((x) => x.id);
    check('XT', 'who can take a booking at 17:30: she can now (her overtime), not before', !free0.includes('e-c3') && free4.includes('e-c3'), { free0, free4 });
    const bk = await api('receptie', 'portal-appointments', { action: 'create', clientName: 'Seară Proba', clientPhone: '0755909090', date: D, time: '17:30', endTime: '18:30', location: 'Arad', cosmeticianId: 'e-c3', treatment: 'Lipo 640', categories: ['corporale'], amount: 0, status: 'programata', force: true });
    check('XT', 'reception books her in it', bk.ok && bk.appointment && bk.appointment.time === '17:30', bk.error);
    // 5. changed (18-20): the same id, she hears it; then the timebank
    const a5 = await set('admin', { id: x3[0].id, from: '18:00', to: '20:00', note: '' });
    const x5 = xs(D, 'e-c3');
    check('XT', 'changed: the same one, 18:00-20:00, she hears it', a5.ok && x5.length === 1 && x5[0].id === x3[0].id && x5[0].from === '18:00' && NK().filter((n) => n.employeeId === 'e-c3' && /ORE SUPLIMENTARE/.test(n.title) && /18:00-20:00/.test(n.text)).length === 1, { err: a5.error, x5 });
    const emp3 = rd('data/employees.json', []).find((e) => e.id === 'e-c3');
    const dd = TB.dayDiff({ employeeId: 'e-c3', date: D, checkIn: '09:00', checkOut: '20:00' }, emp3, [], S());
    check('XT', 'timebank: expected stays her shift (8h), the 3h after it are overtime, 2h of them planned and worked', TB.shiftMinutes(S(), 'e-c3', D) === 480 && dd.expected === 480 && dd.diff === 180 && dd.extra && dd.extra.planned === 120 && dd.extra.worked === 120, dd);
    const store = require('../api/_lib/store');
    const adj = await TB.syncAdjust({ id: 'xt-att', employeeId: 'e-c3', date: D, checkIn: '09:00', checkOut: '20:00' }, store);
    check('XT', 'the day in Aprobări: +3h, with the overtime planned (18:00-20:00)', adj && adj.minutes === 180 && adj.extraPlanned === 120 && (adj.extraSpans || []).join() === '18:00-20:00', adj);
    wr(TB.ADJ, rd(TB.ADJ, []).filter((a) => a.attendanceId !== 'xt-att'));
    // 6. deleted: gone, she hears it; a cosmetician can't
    const dc = await api('cosmetician', 'portal-schedule', { action: 'extra_del', employeeId: 'e-c3', date: D, id: x3[0].id });
    const d6 = await api('admin', 'portal-schedule', { action: 'extra_del', employeeId: 'e-c3', date: D, id: x3[0].id });
    check('XT', 'deleted by the owner (a cosmetician: 403): gone, she hears it', dc._status === 403 && d6.ok && !xs(D, 'e-c3').length && !S().extra[D] && NK().some((n) => n.employeeId === 'e-c3' && /ANULATE/.test(n.title)), { dc: dc._status, d6: d6.error });
    // 7. Reguli: a planned overtime of a passed day her pontaj doesn't reach is listed (extra), never as late
    process.env.RULES_SINCE = day(-30);
    const P = day(-1);
    const ts7 = rd('data/team-schedule.json', {}); ts7.extra = Object.assign({}, ts7.extra, { [P]: { 'e-c3': [{ id: 'xt-r', from: '18:00', to: '20:00', location: 'Arad' }] } }); wr('data/team-schedule.json', ts7);
    const att7 = rd('data/attendance.json', []).filter((a) => !(a.employeeId === 'e-c3' && a.date === P));
    wr('data/attendance.json', att7.concat({ id: 'xt-a7', employeeId: 'e-c3', date: P, checkIn: '09:00', checkOut: '17:00', location: 'Arad' }));
    const r7 = await api('manager', 'portal-manager', { action: 'rules', period: '7z' });
    const ar = (r7.cities && r7.cities.Arad) || {};
    check('XT', 'Reguli: her overtime 18-20 with a departure at 17:00 is listed (extra), not as late', (ar.noIn || []).some((x) => x.employeeId === 'e-c3' && x.date === P && x.extra && x.from === '18:00') && !(ar.late || []).some((x) => x.employeeId === 'e-c3' && x.from === '18:00'), { noIn: ar.noIn, late: ar.late });
    wr('data/attendance.json', att7.concat({ id: 'xt-a7', employeeId: 'e-c3', date: P, checkIn: '09:00', checkOut: '20:00', location: 'Arad' }));
    const r7b = await api('manager', 'portal-manager', { action: 'rules', period: '7z' });
    check('XT', 'Reguli: worked to 20:00, not listed', !((r7b.cities && r7b.cities.Arad && r7b.cities.Arad.noIn) || []).some((x) => x.extra && x.date === P), r7b.cities && r7b.cities.Arad && r7b.cities.Arad.noIn);
    const ts7b = rd('data/team-schedule.json', {}); delete ts7b.extra[P]; wr('data/team-schedule.json', ts7b);
    delete process.env.RULES_SINCE;
  }

  // CS. the Card de Sărbători (20.11): the reservation, the counter, the checks of a public form, the online payment
  // through a myPOS payment request (myPOS answered by a mock here: no real call, no real payment)
  {
    const CSK = 'data/card-sarbatori.json', PAYK = 'data/card-sarbatori-pay.json';
    let ipn = 0; // each call from its own address (the per-address limit has its own check)
    const pub = async (body, origin, ip) => {
      const h = Object.assign({ 'x-forwarded-for': ip || '10.9.0.' + (++ipn) }, origin ? { origin } : {});
      const r = await fetch('http://127.0.0.1:' + PORT + '/api/card-sarbatori', body ? { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, h), body: JSON.stringify(body) } : { headers: h });
      return Object.assign(await r.json().catch(() => ({})), { _status: r.status });
    };
    // myPOS eCommerce, mocked: 'deny' = the integration has no eCommerce right yet (401), 'ok' = it answers
    const real = global.fetch;
    let gw = 'deny', prStatus = 'Pending', made = [];
    global.fetch = async (u, o) => {
      const url = String(u && u.url || u);
      if (!url.startsWith('https://api-gateway.mypos.com')) return real(u, o);
      const J = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      if (url.endsWith('/api/v1/oauth/token')) return J(200, { access_token: 'tok-test', expires_in: 3600, scope: 'default' });
      if (url.endsWith('/api/v1/auth/session')) return J(200, { session: 'ses-test', expires_in: 300 });
      if (gw === 'deny') return J(401, { message: 'Unauthorized' });
      if (/\/ecommerce\/v1\/payment-requests\?/.test(url)) return J(200, { items: [], pagination: { total: 0 } });
      if (/\/ecommerce\/v1\/payment-requests$/.test(url) && o && o.method === 'POST') { const b = JSON.parse(o.body); made.push(b); return J(200, { code: 'PRTEST' + made.length, payment_request_url: 'https://mypos.com/pr/PRTEST' + made.length }); }
      const m = url.match(/\/ecommerce\/v1\/payment-requests\/([\w-]+)$/);
      if (m) return J(200, { code: m[1], status: prStatus, amount: 990 });
      return J(404, {});
    };
    wr('data/mypos-gateway.json', { partnerId: 'mps-p-test', appId: 'mps-app-test', clientId: 'client_testtest', clientSecret: 'secret_test', merchantId: 'cli_testtest', merchantSecret: 'sec_testtest' });
    wr(CSK, []); wr(PAYK, null);
    const leads0 = rd('data/leads.json', []).length, notes0 = rd('data/notifications.json', []).length;

    const g0 = await pub();
    check('CS', 'GET: 100 cards, 100 left, open, the deadline 24.12 23:59 RO, no online payment while myPOS refuses', g0.total === 100 && g0.left === 100 && g0.open === true && g0.deadline === '2026-12-24T21:59:59.000Z' && g0.online === false, g0);
    const ok1 = await pub({ name: 'Proba Card', phone: '0755 000 111', city: 'Timișoara', consent: true, pay: 'online', page: 'https://www.centrul360.com/v2/card-sarbatori' });
    const st1 = rd(CSK, []);
    const lead1 = rd('data/leads.json', []).find((l) => String(l.phone || '').replace(/\D/g, '').endsWith('755000111'));
    check('CS', 'reserve: ok, stored (rezervat, site, a C360 code), online asked but not open → in the clinic', ok1.ok && ok1.left === 99 && st1.length === 1 && st1[0].status === 'rezervat' && st1[0].via === 'site' && st1[0].pay === 'salon' && /^C360-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(st1[0].code) && st1[0].city === 'Timișoara', { ok1, st1 });
    check('CS', 'her lead: source site, interest Card de Sărbători, the reservation tied to it', lead1 && lead1.source === 'site' && lead1.interest === 'Card de Sărbători' && st1[0].leadId === lead1.id && rd('data/leads.json', []).length === leads0 + 1, lead1 && { s: lead1.source, i: lead1.interest });
    const nn = rd('data/notifications.json', []).slice(notes0);
    check('CS', 'the owner and reception hear it like a site lead (LEAD SITE TM 🌐 - Card de Sărbători)', nn.some((n) => n.employeeId === 'admin' && /^LEAD SITE TM/.test(n.title) && /Card de Sărbători/.test(n.title)) && nn.some((n) => n.employeeId === 'e-rec'), nn.map((n) => n.employeeId + ' ' + n.title));
    const g1 = await pub();
    check('CS', 'counter: 100 minus the reservations', g1.left === 99, g1);
    const again = await pub({ name: 'Proba Card', phone: '0755000111', city: 'Timișoara', consent: true });
    check('CS', 'the same card sent twice: the one she has, not a second', again.ok && again.again && rd(CSK, []).length === 1, again);
    const gift = await pub({ name: 'Proba Card', phone: '0755000111', city: 'Arad', consent: true, gift: true, recipient: 'Mama Proba' });
    check('CS', 'a gift on the same phone: a second card, on her name', gift.ok && !gift.again && gift.reservation.recipient === 'Mama Proba' && rd(CSK, []).length === 2, gift);
    const bad = await Promise.all([
      pub({ name: 'X', phone: '0755000222', city: 'Arad', consent: true }), pub({ name: 'Proba Doi', phone: '12', city: 'Arad', consent: true }),
      pub({ name: 'Proba Doi', phone: '0755000222', city: 'Cluj', consent: true }), pub({ name: 'Proba Doi', phone: '0755000222', city: 'Arad' }),
      pub({ name: 'Proba Doi', phone: '0755000222', city: 'Arad', consent: true, gift: true, recipient: '' })]);
    check('CS', 'validation: name, phone, city, consent, the name on a gift card', bad.map((x) => x.error).join() === 'missing_name,bad_phone,missing_city,missing_consent,missing_recipient' && bad.every((x) => x._status === 400) && rd(CSK, []).length === 2, bad.map((x) => x.error));
    const hp = await pub({ name: 'Bot Proba', phone: '0755000333', city: 'Arad', consent: true, website: 'http://spam' });
    check('CS', 'the trap field: a quiet ok, nothing stored', hp.ok && !hp.reservation && rd(CSK, []).length === 2, hp);
    const evil = await pub({ name: 'Proba Trei', phone: '0755000444', city: 'Arad', consent: true }, 'https://evil.example');
    const evilGet = await pub(null, 'https://evil.example');
    const okOrigin = await pub(null, 'https://www.centrul360.com');
    check('CS', 'own origin only (another site: 403, ours: ok)', evil._status === 403 && evilGet._status === 403 && okOrigin._status === 200 && rd(CSK, []).length === 2, { evil, evilGet: evilGet._status });
    const lim = [];
    for (let i = 0; i < 9; i++) lim.push((await pub({ name: 'X', phone: '1', city: 'Arad' }, null, '10.8.8.8'))._status);
    check('CS', 'a few tries per address: the 9th in 10 minutes gets 429', lim.slice(0, 8).every((x) => x === 400) && lim[8] === 429, lim);
    const ls = await api('receptie', 'card-sarbatori', { action: 'list' });
    const anon = await pub({ action: 'list' });
    check('CS', 'the team sees the list (reception), the public does not', ls.reservations && ls.reservations.length === 2 && anon._status === 401, { n: ls.reservations && ls.reservations.length, anon: anon._status });
    const cut = await api('receptie', 'card-sarbatori', { action: 'set', id: st1[0].id, status: 'anulat' });
    check('CS', 'cancelled: back on the counter', cut.ok && cut.left === 99 && (await pub()).left === 99, cut);
    await api('receptie', 'card-sarbatori', { action: 'set', id: st1[0].id, status: 'rezervat' });
    // sold out: 100 cards in all
    const many = rd(CSK, []);
    for (let i = many.length; i < 100; i++) many.push({ id: 'fill-' + i, created: new Date().toISOString(), name: 'Umplere', phone: '07' + String(10000000 + i), recipient: 'Umplere', city: 'Arad', status: 'rezervat', via: 'test', pay: 'salon', code: 'C360-FILL-' + i });
    wr(CSK, many);
    const full = await pub({ name: 'Proba Patru', phone: '0755000555', city: 'Arad', consent: true });
    const gFull = await pub();
    check('CS', 'the 101st: sold_out, the counter 0 and closed', full._status === 409 && full.error === 'sold_out' && gFull.left === 0 && gFull.open === false, { full, gFull });
    wr(CSK, many.filter((r) => !/^fill-/.test(r.id)));

    // online payment: closed while myPOS refuses eCommerce
    const rid = st1[0].id;
    const ord0 = await pub({ action: 'order', id: rid });
    const pay0 = await pub({ action: 'pay', id: rid });
    check('CS', 'eCommerce refused (401): the order shows no online payment, pay answers payment_not_configured', ord0.order && ord0.order.online === false && /^•••• 111$/.test(ord0.order.phone) && pay0.error === 'payment_not_configured' && !made.length, { ord0, pay0 });
    // myPOS answers now (the next check, the last one older than 15 minutes)
    gw = 'ok'; wr(PAYK, null);
    const g2 = await pub();
    check('CS', 'eCommerce answers: online on', g2.online === true, g2);
    const pay1 = await pub({ action: 'pay', id: rid });
    const pr = made[0] || {};
    const row1 = rd(CSK, []).find((r) => r.id === rid);
    check('CS', 'pay: a payment request of 990 RON (fixed on the server), in Romanian, 2 days, her phone → the myPOS page', pay1.url === 'https://mypos.com/pr/PRTEST1' && pr.amount === 990 && pr.currency === 'RON' && pr.payment_request_lang === 'ro' && /^\d{4}-\d{2}-\d{2}$/.test(pr.expiry_date) && pr.notify_gsm === '+40755000111' && pr.client_name === 'Proba Card' && row1.payment && row1.payment.code === 'PRTEST1' && row1.pay === 'online', { pay1, pr });
    const pay2 = await pub({ action: 'pay', id: rid, amount: 1 });
    check('CS', 'pay again: the same request, no new one (an amount sent by the page is ignored)', pay2.url === pay1.url && made.length === 1, pay2);
    const s1 = await pub({ action: 'status', id: rid });
    check('CS', 'status Pending: not paid yet', s1.ok && !s1.paid && s1.status === 'Pending', s1);
    prStatus = 'Paid';
    const { sweep } = require('../api/_lib/card-sarbatori');
    const cs = rd(CSK, []); cs.find((r) => r.id === rid).payment.checked = ''; wr(CSK, cs); // the 10 s between two asks
    const sw = await sweep();
    const row2 = rd(CSK, []).find((r) => r.id === rid);
    const n2 = rd('data/notifications.json', []).filter((n) => n.tag === 'card-paid-' + rid);
    check('CS', 'the clock finds it Paid: the card paid online, the Restart bonus, reception and the owner told', sw.paid === 1 && row2.status === 'platit' && row2.paidVia === 'online' && row2.bonusRestart === true && row2.payment.status === 'Paid' &&
      n2.some((n) => n.employeeId === 'admin' && /CARD DE SĂRBĂTORI PLĂTIT TM ONLINE/.test(n.title)) && n2.some((n) => n.employeeId === 'e-rec'), { sw, row2: row2 && row2.status, n2: n2.map((n) => n.employeeId + ' ' + n.title) });
    const s2 = await pub({ action: 'status', id: rid });
    const pay3 = await pub({ action: 'pay', id: rid });
    check('CS', 'paid: the page says so, no new request, still counted', s2.paid && pay3.paid && made.length === 1 && (await pub()).left === 98, { s2, pay3 });
    const sw2 = await sweep();
    check('CS', 'paid once: the clock does not ring again', sw2.checked === 0 && rd('data/notifications.json', []).filter((n) => /CARD DE SĂRBĂTORI PLĂTIT/.test(n.title) && n.employeeId === 'admin').length === 1, sw2);
    const res2 = await pub({ name: 'Proba Cinci', phone: '0755000666', city: 'Arad', consent: true, pay: 'online' });
    check('CS', 'with eCommerce on, a reservation can choose online', res2.ok && res2.reservation.pay === 'online', res2);
    const paidDesk = await api('receptie', 'card-sarbatori', { action: 'set', id: res2.reservation.id, status: 'platit' });
    check('CS', 'paid in the clinic (reception): paid, no Restart bonus', paidDesk.ok && paidDesk.reservation.status === 'platit' && paidDesk.reservation.paidVia === 'clinica' && !paidDesk.reservation.bonusRestart, paidDesk.reservation);
    global.fetch = real;
    wr('data/mypos-gateway.json', {}); wr(CSK, []); wr(PAYK, null);
  }

  // the independent second reading agrees with production on the harness's data
  {
    const lh = await api('admin', 'lead-health', null, 'verify=1');
    check('lh', 'lead-health ?verify=1 agree', lh.agree === true, { agree: lh.agree, tm: lh.cities && lh.cities['Timișoara'] && [lh.cities['Timișoara'].visits60.agree, lh.cities['Timișoara'].month.consults.agree, lh.cities['Timișoara'].month.cosmeticians.agreePay], ar: lh.cities && lh.cities.Arad && [lh.cities.Arad.visits60.agree, lh.cities.Arad.month.consults.agree, lh.cities.Arad.month.cosmeticians.agreePay] });
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' ok' + (failed.length ? ', failed: ' + failed.map((r) => r.item + ' ' + r.name).join('; ') : ''));
  if (OWN && !process.env.DATA_KEEP) fs.rmSync(DATA, { recursive: true, force: true });
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
