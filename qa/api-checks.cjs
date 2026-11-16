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
  const C = require('../api/_lib/clinic'), K = require('../api/_lib/kpi'), MP = require('../api/_lib/manager-pay'), T = require('../api/_lib/team-schedule');
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
    const pd = await api('receptie', 'portal-data', null, '');
    check(8, 'waUnread (reception, Arad): not the candidate\'s chat', pd.waUnread === 0, pd.waUnread);
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
    check(9, 'Costuri: a named area and verb', sal.length && sal.every((l) => l.area === 'Costuri lunare și bonus' && /costuri/.test(l.verb)), sal.slice(0, 2));
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
    check(16, 'Nuki: no „proprietar…” as a person', !/asistentul personal al proprietarului|pentru proprietar|fața proprietarului|Propune proprietarului|\(proprietarul, 14\.11\)/.test(nuki) && /decide George/.test(nuki));
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
    const bad = await api('receptie', 'portal-appointments', { action: 'create', date: D2, time: '16:00', endTime: '17:00', location: 'Arad', cosmeticianId: 'e-c3', clientName: 'Rea Pauza', clientPhone: '0755000333', treatment: 'Lipo 640', categories: ['corporale'], amount: 0, status: 'programata', breakMove: { from: '14:30' } });
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
