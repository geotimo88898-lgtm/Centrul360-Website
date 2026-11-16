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
    check(10, 'the manager\'s costs open Cheltuieli', notes.length && notes.every((n) => n.go === 'cheltuieli' && /Le găsești la Cheltuieli\./.test(n.text)), notes[0]);
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
    check(10, 'Plăți alerts open Cheltuieli', /go: 'cheltuieli', tag: 'plati-azi-'/.test(fs.readFileSync(path.join(__dirname, '../api/_lib/expenses.js'), 'utf8')));
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
