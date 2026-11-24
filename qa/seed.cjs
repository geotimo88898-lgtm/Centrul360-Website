// Fake data for the local harness (qa/server.cjs): six employees, two weeks of bookings, payments, leads, approvals,
// and long values on purpose (long hyphenated names, 123.456 lei) so qa/overflow.cjs sees the worst cases. All names are made up.
//   node qa/seed.cjs            writes qa/.data (DATA=... to write elsewhere; TODAY=2026-11-16 is the harness's day)
const fs = require('fs'), path = require('path');
const DATA = process.env.DATA || path.join(__dirname, '.data');
fs.rmSync(DATA, { recursive: true, force: true }); fs.mkdirSync(DATA, { recursive: true });
process.env.PORTAL_SECRET = process.env.PORTAL_SECRET || 'dev-secret-only-local';

// 1. employees, attendance, bookings, payments, leads, approvals
(() => {

const w = (p, d) => fs.writeFileSync(path.join(DATA, p.replace(/\//g, '__')), JSON.stringify(d));
const { hashPassword } = require('../api/_lib/auth.js');
const pw = hashPassword('test123');
const emp = (id, name, role, location, username) => ({ id, name, role, location, username, passwordHash: pw.hash, passwordSalt: pw.salt, active: true, netSalary: 3000 });
const emps = [emp('e-adm', 'Admin Test', 'admin', 'Timișoara', 'admintest'), emp('e-mgr', 'Ioana Proba', 'manager', 'Timișoara', 'mgr'), emp('e-rec', 'Ana Proba', 'receptie', 'Arad', 'rec'),
  emp('e-c1', 'Maria Proba', 'cosmetician', 'Timișoara', 'c1'), emp('e-c2', 'Elena Proba', 'cosmetician', 'Timișoara', 'c2'), emp('e-c3', 'Dana Proba', 'cosmetician', 'Arad', 'c3')];
w('data/employees.json', emps);
const days = []; for (let d = 2; d <= 13; d++) { const dt = new Date(Date.UTC(2026, 10, d)); if (dt.getUTCDay() % 6) days.push(dt.toISOString().slice(0, 10)); }
const ahead = []; for (let d = 16; d <= 20; d++) ahead.push('2026-11-' + d);
let n = 0; const id = (p) => p + '-' + (++n);
const att = [], sales = [], appts = [], leads = [];
const cos = [['e-c1', 'Timișoara', 1700], ['e-c2', 'Timișoara', 1200], ['e-c3', 'Arad', 1550]];
days.forEach((d, i) => {
  ['e-c1', 'e-c2', 'e-c3', 'e-mgr', 'e-rec'].forEach((e) => { if (e === 'e-c2' && i % 5 === 4) return; att.push({ id: id('a'), employeeId: e, date: d, checkIn: '09:0' + (i % 6), checkOut: e === 'e-c1' && i === days.length - 1 ? '18:40' : '17:0' + (i % 4), location: '', note: '' }); });
  cos.forEach(([c, loc, avg], k) => {
    if (c === 'e-c2' && i % 5 === 4) return;
    for (let h = 0; h < 5; h++) {
      const aid = id('ap'), consult = h === 0 && i % 2 === 0;
      const st = h === 4 && i % 3 === 0 ? 'anulata' : 'finalizata';
      appts.push({ id: aid, date: d, time: String(9 + h * 2).padStart(2, '0') + ':00', endTime: String(10 + h * 2).padStart(2, '0') + ':00', location: loc, cosmeticianId: c, clientName: 'Clienta ' + n, clientId: 'cl-' + k + '-' + h, treatment: consult ? 'Consultație gratuită' : 'Lipo 640', status: st, amount: 0, createdAt: d + 'T07:00:00Z' });
      if (st === 'finalizata' && !consult) {
        const amt = Math.round(avg / 4 + (h - 2) * 20);
        const m = ['cash', 'card', 'card', 'cash_card'][h % 4];
        sales.push({ id: id('s'), source: 'incasare', employeeId: 'e-mgr', performedBy: c, appointmentId: aid, clientId: 'cl-' + k + '-' + (h - 1 < 0 ? 0 : 0), client: 'Clienta', date: d, location: loc, categories: ['corporale'], amount: amt, upsell: h === 1 && i % 2 === 0 ? 900 : 0, method: m, split: m === 'cash_card' ? { cash: Math.round(amt / 2), card: amt - Math.round(amt / 2) } : null, status: 'recorded', createdAt: d + 'T12:00:00Z' });
      }
    }
  });
  // leads
  ['Timișoara', 'Arad'].forEach((loc, k) => {
    const created = d + 'T' + String(8 + k * 3 + (i % 3)).padStart(2, '0') + ':1' + k + ':00Z';
    const mins = [2, 4, 12, 3, 40][i % 5];
    leads.push({ id: id('l'), name: 'Lead ' + n, phone: '07' + String(10000000 + n * 7919).slice(0, 8), source: 'facebook', createdBy: 'facebook-webhook', location: loc, stage: 'contactat', createdAt: created,
      activities: [{ id: id('ac'), type: 'created', at: created, author: '' }, { id: id('ac'), type: 'contact', at: new Date(Date.parse(created) + mins * 60e3).toISOString(), author: 'Ioana Proba' }] });
  });
});
ahead.forEach((d, i) => cos.forEach(([c, loc], k) => { for (let h = 0; h < 3 + (k === 0 ? 2 : 0); h++) appts.push({ id: id('ap'), date: d, time: String(9 + h * 2).padStart(2, '0') + ':00', endTime: String(10 + h * 2).padStart(2, '0') + ':00', location: loc, cosmeticianId: c, clientName: 'Viitoare ' + n, treatment: h === 0 ? 'Consultație gratuită' : 'Lipo 640', status: 'programata', createdAt: '2026-11-12T08:00:00Z' }); }));
w('data/attendance.json', att); w('data/sales.json', sales); w('data/appointments.json', appts); w('data/leads.json', leads);
const wk = (on) => Object.fromEntries(['1', '2', '3', '4', '5', '6', '7'].map((k) => [k, { on: on && Number(k) <= 5, from: '09:00', to: '17:00' }]));
w('data/team-schedule.json', { weekly: { 'e-c1': { location: 'Timișoara', days: wk(true) }, 'e-c2': { location: 'Timișoara', days: wk(true) }, 'e-c3': { location: 'Arad', days: wk(true) } }, dates: {} });
w('data/time-adjust.json', [
  { id: 'adj1', employeeId: 'e-c1', attendanceId: 'x', date: '2026-11-13', minutes: 95, worked: 575, expected: 480, checkIn: '09:05', checkOut: '18:40', location: 'Timișoara', status: 'pending', createdAt: '2026-11-13T17:00:00Z' },
  { id: 'adj2', employeeId: 'e-mgr', attendanceId: 'y', date: '2026-11-12', minutes: -35, worked: 445, expected: 480, checkIn: '09:00', checkOut: '16:25', location: 'Timișoara', status: 'pending', createdAt: '2026-11-12T17:00:00Z' }]);
w('data/leave-requests.json', [
  { id: 'lv1', employeeId: 'e-c3', type: 'odihna', startDate: '2026-11-23', endDate: '2026-11-25', workDays: 3, reason: 'Vacanță', status: 'pending', requestedAt: '2026-11-14T09:00:00Z', decidedAt: '', decidedBy: '', rejectionNote: '', pdfBlobPath: '' },
  { id: 'lv2', employeeId: 'e-mgr', type: 'odihna', startDate: '2026-12-01', endDate: '2026-12-02', workDays: 2, reason: '', status: 'pending', requestedAt: '2026-11-14T09:00:00Z', decidedAt: '', decidedBy: '', rejectionNote: '', pdfBlobPath: '' }]);
const now = Date.now();
w('data/whatsapp-conversations.json', [
  { phone: '40711111111', clientName: 'Clientă A', location: 'Timișoara', unreadCount: 1, lastMessageAt: new Date(now - 3 * 3600e3).toISOString(), messages: [{ id: 'm1', direction: 'in', text: 'Bună, cât costă epilarea?', timestamp: new Date(now - 3 * 3600e3).toISOString() }] },
  { phone: '40722222222', clientName: 'Clientă B', location: 'Arad', unreadCount: 0, lastMessageAt: new Date(now - 2 * 3600e3).toISOString(), messages: [{ id: 'm2', direction: 'in', text: 'Mai aveți loc mâine?', timestamp: new Date(now - 5 * 3600e3).toISOString() }, { id: 'm3', direction: 'out', text: 'Da, la 10.', timestamp: new Date(now - 2 * 3600e3).toISOString() }] }]);
w('data/mypos-connection.json', { clientId: 'dev-client-id', clientSecret: 'dev-client-secret', devices: [{ tid: 'T1', serial: 's', model: 'Go 2', city: 'Timișoara' }, { tid: 'T2', serial: 's2', model: 'Go 2', city: 'Arad' }] });
const pays = []; days.concat(['2026-11-14']).forEach((d) => { for (let k = 0; k < 4; k++) pays.push({ id: id('p'), ref: '', tid: k % 2 ? 'T2' : 'T1', amount: 200 + k * 55, currency: 'RON', at: d + 'T1' + k + ':15:00.000Z', day: d, type: '001', pan: '42' + k + '1', src: 'api', cancelled: k === 3 && d === '2026-11-13' }); });
w('data/mypos-payments.json', { list: pays, syncedAt: new Date(now + 3600e3).toISOString(), coverFrom: '2026-09-01T00:00:00Z' });
console.log('seeded', emps.length, att.length, sales.length, appts.length, leads.length);

})();

// 2. leads linked to bookings and payments, today's day, ads, the manager's notes, dues
(() => {
const f = (p) => path.join(DATA, p.replace(/\//g, '__'));
const r = (p, d) => { try { return JSON.parse(fs.readFileSync(f(p), 'utf8')); } catch (e) { return d; } };
const w = (p, d) => fs.writeFileSync(f(p), JSON.stringify(d));
const leads = r('data/leads.json', []), appts = r('data/appointments.json', []), sales = r('data/sales.json', []);
let n = 9000; const id = (p) => p + '-' + (++n);
const ADS = { 'Timișoara': [['ad-t1', 'camp-t', 'TM Lipo 640 · 2 zone'], ['ad-t2', 'camp-t', 'TM Lipo 640 · 50+']], 'Arad': [['ad-a1', 'camp-a', 'AR Cavitație 1+1'], ['ad-a2', 'camp-a2', 'AR RF gușă']] };
const TODAY = process.env.TODAY || '2026-11-16';
const YDAY = new Date(Date.parse(TODAY + 'T12:00:00Z') - 864e5).toISOString().slice(0, 10);
const at = (d, h, m) => new Date(Date.parse(d + 'T00:00:00+02:00') + (h * 60 + (m || 0)) * 60e3).toISOString();
let k = 0;
leads.forEach((l) => {
  const ad = ADS[l.location][k++ % 2];
  l.forms = [{ adId: ad[0], campaignId: ad[1], ad: ad[2], at: l.createdAt }];
  l.interest = 'Lipo 640';
  const day = l.createdAt.slice(0, 10), next = new Date(Date.parse(day + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
  if (k % 5 === 0) return; // not booked
  const cid = 'cl-l-' + l.id, aid = id('ap');
  const came = k % 4 !== 0;
  appts.push({ id: aid, date: next, time: '15:00', endTime: '15:30', location: l.location, cosmeticianId: l.location === 'Arad' ? 'e-c3' : (k % 2 ? 'e-c1' : 'e-c2'), clientName: 'Clienta L' + k, clientId: cid, clientPhone: l.phone,
    treatment: 'Consultație gratuită', status: next >= TODAY ? 'confirmata' : came ? 'finalizata' : 'anulata', amount: 0, leadId: l.id, createdAt: new Date(Date.parse(l.createdAt) + 20 * 60e3).toISOString(), createdBy: 'e-mgr' });
  l.appointmentId = aid; l.clientId = cid;
  if (came && next < TODAY && k % 3 !== 0) {
    const amt = 900 + (k % 4) * 300, m = ['cash', 'card', 'transfer', 'cash_card'][k % 4];
    sales.push({ id: id('s'), source: 'incasare', employeeId: 'e-mgr', performedBy: l.location === 'Arad' ? 'e-c3' : 'e-c1', appointmentId: aid, clientId: cid, client: 'Clienta L' + k, date: next, location: l.location, amount: amt, upsell: amt * 2, method: m,
      split: m === 'cash_card' ? { cash: amt / 2, card: amt / 2 } : null, status: 'recorded', createdAt: next + 'T14:00:00Z', treatment: 'Lipo 640' });
  }
});
// today: a busy Sunday at both clinics
const hours = [9, 10, 11, 12, 13, 14, 16, 17];
['Timișoara', 'Arad'].forEach((loc, li) => hours.forEach((h, i) => {
  const st = i < 3 ? 'finalizata' : i === 3 ? 'programata' : i === 4 ? 'anulata' : i % 2 ? 'confirmata' : 'programata';
  const aid = id('ap');
  appts.push({ id: aid, date: TODAY, time: String(h).padStart(2, '0') + ':00', endTime: String(h).padStart(2, '0') + ':45', location: loc, cosmeticianId: loc === 'Arad' ? 'e-c3' : i % 2 ? 'e-c1' : 'e-c2', clientName: 'Azi ' + i,
    clientId: 'cl-t-' + li + i, treatment: i % 3 ? 'Lipo 640' : 'Consultație gratuită', status: st, amount: 0, createdAt: '2026-11-12T08:00:00Z' });
  if (st === 'finalizata' && i % 3) sales.push({ id: id('s'), source: 'incasare', employeeId: 'e-mgr', performedBy: loc === 'Arad' ? 'e-c3' : 'e-c1', appointmentId: aid, clientId: 'cl-t-' + li + i, client: 'Azi', date: TODAY, location: loc,
    amount: 450 + i * 100, upsell: i === 1 ? 2400 : 0, method: i === 1 ? 'card' : 'cash', status: 'recorded', createdAt: at(TODAY, h, 50), treatment: 'Lipo 640' });
}));
// today's leads came in the past (never after the harness's clock: a lead „in 2 hours” counts nowhere), in the first
// column of the Pipeline (lead_nou, as the real ones), with a mobile number written as the desk writes it (07…)
['Timișoara', 'Arad', 'Timișoara'].forEach((loc, i) => {
  const c = new Date(Math.min(Date.parse(at(TODAY, 9 + i * 2, 5)), Date.now() - (3 - i) * 25 * 60e3)).toISOString(), ad = ADS[loc][i % 2];
  leads.push({ id: id('l'), name: 'Lead azi ' + i, phone: '07' + String(45000000 + i * 3719).padStart(8, '0'), source: 'facebook', createdBy: 'facebook-webhook', location: loc, stage: 'lead_nou', createdAt: c, interest: 'Lipo 640',
    forms: [{ adId: ad[0], campaignId: ad[1], ad: ad[2], at: c }],
    activities: [{ id: id('ac'), type: 'created', at: c, author: '' }].concat(i < 2 ? [{ id: id('ac'), type: 'contact', at: new Date(Date.parse(c) + (i ? 14 : 3) * 60e3).toISOString(), author: 'Ioana Proba' }] : []) });
});
// yesterday (Saturday): a few payments and leads, so „Azi” has something to compare with
['Timișoara', 'Arad'].forEach((loc, li) => [10, 12, 15].forEach((h, i) => sales.push({ id: id('s'), source: 'incasare', employeeId: 'e-mgr', performedBy: loc === 'Arad' ? 'e-c3' : 'e-c2', clientId: 'cl-y' + li + i, client: 'Ieri', date: YDAY, location: loc,
  amount: 380 + i * 90, upsell: 0, method: 'card', status: 'recorded', createdAt: at(YDAY, h, 20), treatment: 'Lipo 640' })));
// the spellings and gaps of real data: payments without a clinic (their visit has one), without diacritics, a lead in lower
// case, cancellations made ahead of today and one after its hour (a no-show)
sales.forEach((x, i) => { if (i % 7 === 0) x.location = ''; else if (i % 11 === 0 && x.location === 'Timișoara') x.location = 'Timisoara'; });
leads.forEach((x, i) => { if (i % 6 === 0 && x.location === 'Timișoara') x.location = 'timisoara'; });
['Timișoara', 'Arad'].forEach((loc) => [8, 18].forEach((h, i) => appts.push({ id: id('ap'), date: TODAY, time: String(h).padStart(2, '0') + ':00', endTime: String(h).padStart(2, '0') + ':30', location: loc, cosmeticianId: loc === 'Arad' ? 'e-c3' : 'e-c1',
  clientName: 'Anulată', clientId: 'cl-x' + loc + i, treatment: 'Lipo 640', status: 'anulata', createdAt: '2026-11-10T08:00:00Z', updatedAt: i ? at(YDAY, 15) : at(TODAY, 9) })));
// filler for timing
const S = Number(process.env.SCALE || 0);
const clients = r('data/clients.json', []);
for (let i = 0; i < S; i++) {
  const d = new Date(Date.parse('2026-10-17T10:00:00Z') + (i % 29) * 864e5).toISOString();
  leads.push({ id: id('l'), name: 'F' + i, phone: '07' + String(20000000 + i), source: i % 3 ? 'facebook' : 'site', createdBy: i % 3 ? 'facebook-webhook' : 'site-form', location: i % 2 ? 'Arad' : 'Timișoara', createdAt: d, activities: [{ type: 'created', at: d, author: '' }, { type: 'contact', at: new Date(Date.parse(d) + 600e3).toISOString(), author: 'Ana Proba' }] });
  clients.push({ id: 'cf-' + i, name: 'C' + i, phone: '07' + String(30000000 + i) });
  if (i % 2) appts.push({ id: id('ap'), date: d.slice(0, 10), time: '10:00', location: i % 4 === 1 ? 'Arad' : 'Timișoara', clientId: 'cf-' + i, treatment: 'Lipo', status: 'finalizata', createdAt: d });
  if (i % 3 === 0) sales.push({ id: id('s'), source: 'incasare', clientId: 'cf-' + i, date: d.slice(0, 10), location: i % 2 ? 'Arad' : 'Timișoara', amount: 300, upsell: 0, method: 'cash', createdAt: d, performedBy: 'e-c1' });
}
for (let i = 0; i < S * 3; i++) clients.push({ id: 'cx-' + i, name: 'X' + i, phone: '07' + String(40000000 + i) });
w('data/clients.json', clients);
w('data/leads.json', leads); w('data/appointments.json', appts); w('data/sales.json', sales);
w('data/fb-connection.json', { pageId: 'p1', pageAccessToken: 'dev-page', userToken: 'dev-user', adAccountId: 'act_dev' });
const now = Date.now();
w('data/manager-feedback.json', [{ id: 'fb1', at: new Date(now - 5 * 3600e3).toISOString(), by: 'e-mgr', byName: 'Ioana Proba', city: 'Arad', level: 'putin_putine', details: 'Calendarul de joi și vineri e gol după prânz.', context: {} }]);
w('data/day-closes.json', [
  { id: 'c0', at: '2026-11-13T17:30:00Z', by: 'e-mgr', byName: 'Ioana Proba', city: 'Timișoara', date: '2026-11-13', cashCounted: 800, cashDiff: 0, cardDiff: 0, cashFate: 'ridicare', deposited: 0 },
  { id: 'c1', at: '2026-11-14T17:30:00Z', by: 'e-mgr', byName: 'Ioana Proba', city: 'Timișoara', date: '2026-11-14', cashCounted: 760, cashDiff: -40, cardDiff: 0, cashFate: 'depus', deposited: 760 },
  { id: 'c2', at: '2026-11-13T17:40:00Z', by: 'e-mgr', byName: 'Ioana Proba', city: 'Arad', date: '2026-11-13', cashCounted: 500, cashDiff: 0, cardDiff: 0, cashFate: 'ridicare', deposited: 0 }]);
w('data/manager-reports.json', [{ id: 'r1', at: new Date(now - 2 * 3600e3).toISOString(), by: 'e-mgr', byName: 'Ioana Proba', week: '2026-11-09', to: '2026-11-15', numbers: {}, notes: 'Săptămână bună.', problems: 'Recepția Arad a lipsit o zi.' }]);
w('data/client-dues.json', [
  { id: 'd1', clientId: 'cl-l-x', client: 'Clienta', what: 'Pachet Lipo', location: 'Timișoara', total: 3600, paid: 1200, payments: [], createdAt: '2026-11-05T10:00:00Z', closedAt: null },
  { id: 'd2', clientId: 'cl-l-y', client: 'Clienta', what: 'Pachet RF', location: 'Arad', total: 2400, paid: 800, payments: [], createdAt: '2026-11-08T10:00:00Z', closedAt: null },
  { id: 'd3', clientId: 'cl-l-z', client: 'Clienta', what: 'Pachet', location: 'Timișoara', total: 1800, paid: 1800, payments: [], createdAt: '2026-11-02T10:00:00Z', closedAt: '2026-11-09T10:00:00Z' }]);
try { fs.unlinkSync(f('data/ads-cache/kpi-daily.json')); } catch (e) {}
console.log('seed2', leads.length, appts.length, sales.length, clients.length);

})();

// 3. the long values
(() => {
const f = (p) => path.join(DATA, p.replace(/\//g, '__'));
const r = (p, d) => { try { return JSON.parse(fs.readFileSync(f(p), 'utf8')); } catch (e) { return d; } };
const w = (p, d) => fs.writeFileSync(f(p), JSON.stringify(d));
const names = { 'e-adm': 'Admin Test', 'e-mgr': 'Ioana-Alexandra Constantinescu-Popovici', 'e-rec': 'Ana-Maria Teodorescu-Dumitrescu', 'e-c1': 'Maria-Magdalena Ionescu-Brătianu', 'e-c2': 'Elena Proba', 'e-c3': 'Dana-Cristina Vlădescu-Marinescu', 'e-mgr2': 'Bianca Proba' };
const emps = r('data/employees.json', []);
emps.forEach((e) => { e.name = names[e.id] || e.name; e.netSalary = e.id === 'e-mgr' ? 12345 : e.id === 'e-c1' ? 123456 : 3000; if (e.role === 'manager') { e.roleSince = '2026-11-16'; e.prevRole = 'receptie'; } });
w('data/employees.json', emps);
const sales = r('data/sales.json', []);
sales.forEach((s, i) => { if (i % 7 === 0) s.amount = 123456; if (i % 5 === 0) s.client = 'Clienta Alexandrina-Gabriela Popescu-Dumitrescu'; });
w('data/sales.json', sales);
const appts = r('data/appointments.json', []);
appts.forEach((a, i) => { if (i % 4 === 0) a.clientName = 'Alexandrina-Gabriela Popescu-Dumitrescu'; if (i % 6 === 0) a.treatment = 'Lipo 640 + Cavitație + Radiofrecvență abdomen și coapse'; });
w('data/appointments.json', appts);
const leads = r('data/leads.json', []);
leads.forEach((l, i) => { if (i % 3 === 0) l.name = 'Alexandrina-Gabriela Popescu-Dumitrescu'; });
w('data/leads.json', leads);
const cl = r('data/clients.json', []);
cl.forEach((c) => { c.name = 'Clientă Alexandrina-Gabriela Popescu-Dumitrescu ' + c.name.slice(-1); });
w('data/clients.json', cl);
console.log('long values seeded', emps.length, sales.length, appts.length, leads.length);

})();

// 4. the commission on the money received and the refunds (16.11): a package paid half now and half later (approved), one
// still waiting, a refund of part of a payment and a whole-package refund, so Încasări and Salariu show their lines. The
// payments that start a package carry its value (packageTotal), as the real ones do
(() => {
const f = (p) => path.join(DATA, p.replace(/\//g, '__'));
const r = (p, d) => { try { return JSON.parse(fs.readFileSync(f(p), 'utf8')); } catch (e) { return d; } };
const w = (p, d) => fs.writeFileSync(f(p), JSON.stringify(d));
const sales = r('data/sales.json', []), dues = r('data/client-dues.json', []);
const T = '2026-11-', at = (d, h) => T + d + 'T' + String(h).padStart(2, '0') + ':00:00Z';
const pay = (id, d, amount, o) => Object.assign({ id, source: 'incasare', employeeId: 'e-mgr', performedBy: 'e-c1', clientId: 'cl-pk-' + id, client: 'Clienta Pachet', date: T + d, location: 'Timișoara', categories: ['corporale'], treatment: 'Lipo 640', amount, upsell: 0, method: 'card', status: 'recorded', commission: 0, createdAt: at(d, 10) }, o || {});
const up = (id, sale, d, amount, status, what) => ({ id, source: 'comision', origin: 'upsell', incasareId: sale, employeeId: 'e-c1', date: T + d, categories: ['corporale'], treatment: 'Upsell · ' + what, amount, status, commission: Math.round(amount * 4) / 100, client: 'Clienta Pachet', createdAt: at(d, 10), decidedAt: status === 'approved' ? at(d, 12) : null });
// 1.000 package: 500 on the 3rd, 500 on the 10th
sales.push(pay('pk1', '03', 500, { upsell: 1000, packageTotal: 1000, upsellWhat: 'Pachet 10 ședințe Lipo', parts: { session: 0, upsell: 500, due: 0 } }), up('pk1-u', 'pk1', '03', 1000, 'approved', 'Pachet 10 ședințe Lipo'));
sales.push(pay('pk1b', '10', 500, { clientId: 'cl-pk-pk1', dueId: 'pkd1', toDue: 500, parts: { session: 0, upsell: 0, due: 500 } }));
dues.push({ id: 'pkd1', clientId: 'cl-pk-pk1', client: 'Clienta Pachet', what: 'Pachet 10 ședințe Lipo', location: 'Timișoara', total: 1000, paid: 1000, saleId: 'pk1', payments: [{ saleId: 'pk1', amount: 500, at: at('03', 10) }, { saleId: 'pk1b', amount: 500, at: at('10', 10) }], createdAt: at('03', 10), closedAt: at('10', 10) });
// 2.400 package: 800 paid, the rest to come; part of it refunded (300), not closed: the value stays, 1.900 to come
sales.push(pay('pk2', '11', 800, { upsell: 2400, packageTotal: 2400, upsellWhat: 'Pachet RF abdomen', parts: { session: 0, upsell: 800, due: 0 } }), up('pk2-u', 'pk2', '11', 2400, 'approved', 'Pachet RF abdomen'));
sales.push(pay('pk2-r', '14', -300, { kind: 'refund', refundOf: 'pk2', scope: 'payment', clientId: 'cl-pk-pk2', treatment: 'Rambursare · Pachet RF abdomen', reason: 'o zonă mai puțin', from: [{ saleId: 'pk2', key: 'd:pkd2', dueId: 'pkd2', upsellId: 'pk2-u', lei: 300 }], dues: [{ dueId: 'pkd2', lei: 300, cut: 0 }], restCut: [], whole: false, method: 'cash', createdAt: at('14', 15) }));
dues.push({ id: 'pkd2', clientId: 'cl-pk-pk2', client: 'Clienta Pachet', what: 'Pachet RF abdomen', location: 'Timișoara', total: 2400, paid: 500, saleId: 'pk2', payments: [{ saleId: 'pk2', amount: 800, at: at('11', 10) }, { saleId: 'pk2-r', amount: -300, at: at('14', 15), refund: true }], createdAt: at('11', 10), closedAt: null });
// still waiting for approval: 1.500, 600 paid
sales.push(pay('pk3', '13', 600, { upsell: 1500, packageTotal: 1500, upsellWhat: 'Pachet facial', parts: { session: 0, upsell: 600, due: 0 } }), up('pk3-u', 'pk3', '13', 1500, 'pending', 'Pachet facial'));
dues.push({ id: 'pkd3', clientId: 'cl-pk-pk3', client: 'Clienta Pachet', what: 'Pachet facial', location: 'Timișoara', total: 1500, paid: 600, saleId: 'pk3', payments: [{ saleId: 'pk3', amount: 600, at: at('13', 10) }], createdAt: at('13', 10), closedAt: null });
w('data/sales.json', sales); w('data/client-dues.json', dues);
console.log('commission and refunds seeded');
})();

// 5. pontaj to fix (16.11): a day with no departure, a request from a cosmetician, so Condică → De rezolvat has rows
(() => {
const f = (p) => path.join(DATA, p.replace(/\//g, '__'));
const r = (p, d) => { try { return JSON.parse(fs.readFileSync(f(p), 'utf8')); } catch (e) { return d; } };
const w = (p, d) => fs.writeFileSync(f(p), JSON.stringify(d));
const att = r('data/attendance.json', []);
const x = att.find((a) => a.employeeId === 'e-c3' && a.date === '2026-11-13');
if (x) x.checkOut = null;
w('data/attendance.json', att);
w('data/attendance-requests.json', [{ id: 'rq1', employeeId: 'e-c1', date: '2026-11-12', checkIn: '08:45', checkOut: null, note: 'Am venit mai devreme, am uitat să pontez la timp', status: 'pending', at: '2026-11-12T17:30:00Z' }]);
console.log('pontaj to fix seeded');
})();

// 6. the „Transformarea 360” campaign (Admin → Campanie TRANSFORMARE): a frozen list, two steps sent, people who answered
// (long names, every status), so the section is drawn full
(() => {
const f = (p) => path.join(DATA, p.replace(/\//g, '__'));
const w = (p, d) => fs.writeFileSync(f(p), JSON.stringify(d));
const names = ['Maria-Magdalena Constantinescu-Ionescu', 'Ana Proba', 'Elena Lungu-Teodorescu', 'Ioana Proba', 'Cristina Popa', 'Andreea Marinescu-Vasilescu', 'Diana Proba', 'Roxana Ilie'];
const aud = [];
for (let i = 0; i < 40; i++) { const k = String(722000100 + i); aud.push({ k, to: '40' + k, phone: '0' + k, name: names[i % names.length], fn: names[i % names.length].split(/[\s-]/)[0], city: i % 3 ? 'Timișoara' : 'Arad', seg: i % 2 ? 'client' : 'lead' }); }
w('fc360/audience.json', aud);
const sent = (n) => { const m = {}; aud.slice(0, n).forEach((p, i) => { m[p.k] = i % 13 === 5 ? { e: 'numărul nu are WhatsApp', code: 131026, at: '2026-11-22T18:01:00Z', c: p.city } : { w: 'wamid.' + p.k + '.' + n, at: '2026-11-22T18:01:00Z', c: p.city }; }); return m; };
w('fc360/sent/1.json', sent(40)); w('fc360/sent/2.json', sent(32));
w('fc360/state.json', { armed: true, paused: false, frozenAt: '2026-11-22T18:00:10Z', testPhone: '', media: {}, steps: { 1: { startedAt: '2026-11-22T18:00:10Z', doneAt: '2026-11-22T18:09:00Z', sent: 37, failed: 3 }, 2: { startedAt: '2026-11-23T08:00:10Z', sent: 30, failed: 2, note: 'Timișoara: Meta a refuzat (cod 131048: limita zilnică a numărului)' }, 3: { skipped: 'a trecut ora' } },
  log: [{ at: '2026-11-22T18:00:10Z', text: 'Transformarea 360: lista s-a fixat, 40 persoane.' }, { at: '2026-11-22T18:09:00Z', text: 'Transformarea 360 · Teaser: trimis la toată lista.' }] });
const st = ['call', 'consult', 'came', 'paid', 'paid', 'no', 'call', 'paid'];
const people = {};
aud.slice(0, 16).forEach((p, i) => { people[p.k] = { k: p.k, phone: p.phone, name: p.name, city: p.city, src: 'wa', interested: i % 4 !== 3, optout: i === 15, status: i === 15 ? undefined : st[i % st.length], plan: i % 2 ? 'monthly' : 'full', paidAt: st[i % st.length] === 'paid' ? '2026-11-23T1' + (i % 10) + ':00:00Z' : undefined, consultAt: i % 8 === 1 ? '2026-11-25T17:30' : '',
  replies: [{ id: 'm' + i, at: '2026-11-23T08:1' + (i % 10) + ':00Z', step: '2', kind: i === 15 ? 'stop' : i % 4 === 3 ? 'text' : 'yes', text: i % 4 === 3 ? 'Bună ziua, se poate plăti și în rate lunare la Arad sau doar integral? Mulțumesc frumos!' : i === 15 ? 'Nu mă interesează' : 'DA' }] }; });
w('fc360/people.json', { people });
console.log('Transformarea 360 seeded');
})();

// 7. „Cardul de Sărbători” followed as a campaign (Admin → Campanii → Cardul de Sărbători): a list of 60 sent 6 hours ago,
// Meta's statuses, answers (a button, words, a stop), the site's campaign funnel, card orders of every kind
(() => {
const f = (p) => path.join(DATA, p.replace(/\//g, '__'));
const w = (p, d) => fs.writeFileSync(f(p), typeof d === 'string' ? d : JSON.stringify(d));
const now = Date.now(), t0 = now - 6 * 3600e3, iso = (ms) => new Date(ms).toISOString();
const names = ['Maria-Magdalena Constantinescu-Ionescu', 'Ana Proba', 'Elena Lungu-Teodorescu', 'Ioana Proba', 'Cristina Popa', 'Andreea Marinescu-Vasilescu'];
const list = []; for (let i = 0; i < 60; i++) { const k = String(733000100 + i); list.push(Object.assign({ k, to: '40' + k, city: i % 3 ? 'Timișoara' : 'Arad', fn: names[i % names.length].split(/[\s-]/)[0], seg: i >= 45 ? (i % 2 ? 'client2' : 'client-tr') : i >= 35 ? 'lead' : i % 5 ? 'client' : 'lead', score: 100, visits: i >= 35 && i < 45 ? 0 : 1 + (i % 4) },
  i >= 45 ? { batch: 3, paid: 1200 + i * 90, pre: 'card_sarbatori_490' } : i >= 35 ? { batch: 2, pre: 'card_sarbatori_290' } : {})); }
w('cardblast/state.json', { armed: true, list, pickedAt: iso(t0 - 900e3), doneAt: iso(t0 + 20 * 60e3), media: {}, note: '' });
const sent = {};
list.forEach((p, i) => { sent[p.k] = i % 17 === 4 ? { e: 'Meta a refuzat (cod 131026)', code: 131026, at: iso(t0 + i * 20e3), c: p.city } : Object.assign({ w: 'wamid.CS' + i, at: iso(t0 + i * 20e3 + (p.batch || 1) * 3600e3 - 3600e3), c: p.city }, p.pre ? { t: p.pre } : {}); });
// the client files and visits of some of them: the last visit, a booking ahead (the lot card, „programare” on her row)
const dday = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(now + n * 864e5));
const cls = JSON.parse(fs.readFileSync(f('data/clients.json'), 'utf8')), aps = JSON.parse(fs.readFileSync(f('data/appointments.json'), 'utf8'));
list.forEach((p, i) => {
  if (p.seg === 'lead') return;
  const id = 'cl-cs-' + i; cls.push({ id, name: names[i % names.length], phone: '0' + p.k });
  aps.push({ id: 'ap-cs-' + i, date: dday(-[12, 45, 100, 200, 400][i % 5]), time: '10:00', location: p.city, clientId: id, clientName: names[i % names.length], treatment: 'Lipo 640', status: 'finalizata', createdAt: iso(now - 500 * 864e5) });
  if (i % 4 === 1) aps.push({ id: 'ap-cs-n' + i, date: dday(1 + (i % 6)), time: String(9 + (i % 8)).padStart(2, '0') + ':30', location: p.city, clientId: id, clientName: names[i % names.length], treatment: 'Radiofrecvență facială', status: 'programata', createdAt: iso(t0 - 864e5) });
});
w('data/clients.json', cls); w('data/appointments.json', aps);
w('cardblast/sent.json', sent);
w('cardblast/ev-since.txt', iso(t0 + 40 * 60e3));
const touch = (p, ms) => { const t = new Date(ms); fs.utimesSync(f(p), t, t); };
list.forEach((p, i) => {
  if (!sent[p.k].w) return;
  const sh = Date.parse(sent[p.k].at) - t0 - i * 20e3; // the lot's own hour
  if (i % 11 !== 7) { w('cardblast/ev/delivered/wamid.CS' + i, p.k + '||'); touch('cardblast/ev/delivered/wamid.CS' + i, t0 + sh + i * 20e3 + 4e3); }
  if (i % 11 === 7 && i % 2) { w('cardblast/ev/failed/wamid.CS' + i, p.k + '|131049|'); }
  if (i % 3 !== 2 && i % 11 !== 7) { w('cardblast/ev/read/wamid.CS' + i, p.k + '||'); touch('cardblast/ev/read/wamid.CS' + i, Math.min(now - 60e3, t0 + sh + (i % 6) * 3600e3 + 600e3)); }
});
const said = [['tap', 'Rezerv în clinică'], ['text', 'Bună ziua, cardul de 490 se poate folosi și pentru epilare la Arad sau doar la Timișoara? Mulțumesc!'], ['tap', 'Rezerv în clinică'], ['stop', 'Stop'], ['tap', 'Rezerv în clinică'], ['text', 'Îl iau cadou pentru mama 🤍']];
said.forEach(([kind, text], j) => { const i = j * 5 + 1; w('cardblast/in/wamid.IN' + j, { k: list[i].k, kind, text, at: iso(t0 + (j + 1) * 1800e3), ctx: 1 }); });
// the site: today's funnel document gets the campaign's and the card page's segments
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(now));
const hh = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
const hours = (n) => { const o = {}; for (let i = 0; i < 6; i++) { const h = hh(t0 + i * 3600e3); o[h] = (o[h] || 0) + Math.max(0, Math.round(n * [0.35, 0.25, 0.15, 0.1, 0.1, 0.05][i])); } return o; };
w('data/site/funnel-' + day + '.json', { v: 1, s: {}, f: { whatsapp: { visit: 31, cta: 12, open: 11, start: 6, lead: 2, pay: 3 } }, k: {
  'c:card-sarbatori:m': { visit: 27, seen: 25, buy: 9, pay: 3, res: 5, rsent: 2, h: hours(27) }, 'c:card-sarbatori:d': { visit: 4, seen: 4, buy: 2, pay: 1, res: 0, rsent: 0, h: hours(4) },
  'p:card:m': { visit: 88, seen: 80, buy: 21, pay: 6, res: 9, rsent: 4, h: hours(88) }, 'p:card:d': { visit: 19, seen: 18, buy: 5, pay: 2, res: 1, rsent: 1, h: hours(19) } },
  // three people who came with their personal link (api/_lib/card-blast.js tokenOf)
  t: Object.fromEntries([[1, ['visit', 'seen', 'buy', 'pay']], [10, ['visit', 'seen', 'buy', 'pay']], [2, ['visit', 'seen', 'res']]].map(([i, steps]) => [
    require('crypto').createHmac('sha256', String(process.env.PORTAL_SECRET) + '|cs-link').update(list[i].k).digest('base64url').slice(0, 10),
    Object.fromEntries(steps.map((x, j) => [x, t0 + (i + 1) * 1500e3 - (steps.length - j) * 40e3]))])) });
// card orders: from the list (paid online, paid in the clinic, waiting, expired), from the link with another phone, others
const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile', pc = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
const link = 'https://www.centrul360.com/card-sarbatori?utm_source=whatsapp&utm_campaign=card-sarbatori';
let n = 0;
const o = (x) => Object.assign({ id: 'cs-seed-' + (++n), qty: 1, via: 'site', forWho: 'eu', recipient: '', name: 'Clienta Proba ' + n, cards: [{ code: '', recipient: '' }] }, x);
const credit = { 290: 500, 490: 1000, 990: 2500 };
const ord = (i, tier, pay, status, mins, extra) => o(Object.assign({ created: iso(t0 + (i + 1) * 1500e3), phone: i == null ? '07220009' + String(n).padStart(2, '0') : '0' + list[i].k, city: i == null ? 'Arad' : list[i].city, tier, amount: tier, credit: credit[tier], pay, status,
  paidVia: status === 'platit' ? (pay === 'online' ? 'online' : 'clinica') : '', paidAt: status === 'platit' ? iso(t0 + ((i || 0) + 1) * 1500e3 + mins * 60e3) : '', page: link, track: { utm_source: 'whatsapp', utm_campaign: 'card-sarbatori', ua } }, extra || {}));
w('data/card-sarbatori.json', [
  ord(1, 990, 'online', 'platit', 9, { trail: [['created', 0], ['to_paylink', 0], ['paid', 9, 'auto'], ['ask_name', 10, 'ok'], ['named', 14], ['card_sent', 14, 'ok']].map(([ev, m, note]) => Object.assign({ at: iso(t0 + 2 * 1500e3 + m * 60e3), ev }, note ? { note } : {})) }), ord(4, 490, 'online', 'platit', 23), ord(6, 990, 'clinica', 'platit', 140, { qty: 2, amount: 1980, credit: 5000 }), ord(10, 290, 'online', 'asteptare', 0, { created: iso(now - 25 * 60e3) }),
  ord(12, 990, 'online', 'asteptare', 0, { trail: [['created', 0], ['to_paylink', 0], ['returned', 3], ['reason', 4, 'declined'], ['wa1', 35, 'ok'], ['expired', 120]].map(([ev, m, note]) => Object.assign({ at: iso(t0 + 13 * 1500e3 + m * 60e3), ev }, note ? { note } : {})) }), ord(16, 490, 'clinica', 'rezervat', 0, { track: { ua: pc } }), ord(21, 290, 'clinica', 'anulat', 0),
  ord(46, 490, 'clinica', 'rezervat', 0, { created: iso(now - 3600e3), via: 'whatsapp', page: '', track: {} }), ord(48, 490, 'clinica', 'lead', 0, { created: iso(now - 2400e3), via: 'whatsapp', page: '', track: {} }), ord(50, 490, 'clinica', 'platit', 90, { created: iso(now - 7200e3), paidAt: iso(now - 1800e3), via: 'whatsapp', page: '', track: {} }),
  ord(null, 990, 'online', 'platit', 14, { track: { utm_campaign: 'card-sarbatori', ua: pc } }),
  o({ created: iso(t0 - 2 * 86400e3), phone: '0722000777', city: 'Timișoara', tier: 990, amount: 990, credit: 2500, pay: 'online', status: 'platit', paidVia: 'online', paidAt: iso(t0 - 2 * 86400e3 + 600e3), page: 'https://www.centrul360.com/card-sarbatori', track: { utm_source: 'instagram', ua } }),
  o({ created: iso(t0 + 3 * 3600e3), phone: '0722000778', city: 'Arad', tier: 490, amount: 490, credit: 1000, pay: 'online', status: 'platit', paidVia: 'online', paidAt: iso(t0 + 3 * 3600e3 + 300e3), page: 'https://www.centrul360.com/card-sarbatori', track: { ua } }),
  // „Card rezervat, de încasat” (24.11): reservations to pay in the clinic, both clinics, a VIP and a long name
  o({ id: 'cs-seed-resv-vip', created: iso(now - 5 * 3600e3), name: 'Alexandra-Ioana Constantinescu-Bărbulescu', phone: '0722000781', city: 'Timișoara', tier: 9900, amount: 9900, credit: 30000, pay: 'clinica', status: 'rezervat', page: link, track: { ua } }),
  o({ id: 'cs-seed-resv-ar', created: iso(now - 40 * 60e3), name: 'Maria Popescu', phone: '0722000782', city: 'Arad', tier: 990, amount: 990, credit: 2500, pay: 'clinica', status: 'rezervat', page: link, track: { ua }, linkAt: iso(now - 10 * 60e3) }),
  o({ id: 'cs-seed-resv-ar2', created: iso(now - 26 * 3600e3), name: 'Card de Sărbători, fără nume', phone: '0722000783', city: 'Arad', tier: 490, amount: 490, credit: 1000, pay: 'clinica', status: 'rezervat', via: 'meta-form', page: '', track: {} }),
]);
// (cs-seed-resv-ar: her link went 10 minutes ago, „Link trimis” on her buttons: portal-cardlink.js)
console.log('Cardul de Sărbători campaign seeded');
})();

// 10. Pipeline's three tabs (23.11): Card de Sărbători leads (the Facebook form, the site, the desk) and job candidates,
// so Cliente · Angajări · Carduri de Sărbători each have something
(() => {
const f = (p) => path.join(DATA, p.replace(/\//g, '__'));
const r = (p, d) => { try { return JSON.parse(fs.readFileSync(f(p), 'utf8')); } catch (e) { return d; } };
const w = (p, d) => fs.writeFileSync(f(p), JSON.stringify(d));
const leads = r('data/leads.json', []);
const now = Date.now(), iso = (m) => new Date(now - m * 60e3).toISOString();
const tiers = [['490', 1000], ['990', 2500], ['9900', 30000], ['490', 1000], ['990', 2500], ['', 0], ['490', 1000]];
tiers.forEach(([tier, credit], i) => {
  const at = iso(30 + i * 170), city = i % 2 ? 'Arad' : 'Timișoara', form = i < 4;
  leads.push({ id: 'l-card-' + i, name: 'Card Proba ' + (i + 1), phone: '07' + String(66000000 + i * 4111), source: form ? 'facebook' : i === 5 ? 'telefon' : 'site', createdBy: form ? 'facebook-webhook' : 'card-sarbatori',
    location: city, stage: i < 3 ? 'lead_nou' : i < 5 ? 'contactat' : 'programare_stabilita', createdAt: at, updatedAt: at, stageChangedAt: at, value: Number(tier) || 0,
    interest: form ? 'Cardul de Sărbători' + (tier ? ' · ' + tier + ' lei' : '') : 'Card de Sărbători',
    card: form ? { tier, credit, forWhom: i % 3 ? 'pentru mine' : 'cadou', city, at, from: 'formular' } : undefined,
    forms: form ? [{ id: '1134301339396504', name: 'Rezervă Cardul de Sărbători', ad: 'Card 990 · cadou', campaign: 'C360 Card de Sărbători', at, answers: [{ q: 'Ce card vrei?', a: tier + ' lei' }] }] : [],
    activities: [{ id: 'ac-card-' + i, type: 'created', at, author: '' }] });
});
w('data/leads.json', leads);
const cand = (i, name, status, loc, extra) => Object.assign({ id: 'cd-seed-' + i, at: iso(60 * (i + 1) * 7), name, phone: '07' + String(55000000 + i * 3001), status, job: 'Cosmeticiană', location: loc,
  answers: [{ q: 'Ai diplomă de cosmeticiană?', a: 'Da' }, { q: 'Câtă experiență ai?', a: ['Sub 1 an', '1-3 ani', 'Peste 3 ani'][i % 3] }, { q: 'Când poți începe?', a: 'Imediat' }] }, extra || {});
w('data/candidates.json', [cand(1, 'Candidată Proba Unu', 'nou', 'Timișoara'), cand(2, 'Candidată Proba Doi', 'nou', 'Timișoara'), cand(3, 'Candidată Proba Trei', 'cv', 'Timișoara', { cvFile: true }),
  cand(4, 'Candidată Proba Patru', 'sunat', 'Arad', { notes: [{ at: iso(300), by: 'Ioana Proba', text: 'Vine la interviu joi la 11.' }] }), cand(5, 'Candidată Proba Cinci', 'interviu', 'Timișoara'), cand(6, 'Candidată Proba Șase', 'respins', 'Arad')]);
console.log('Pipeline tabs seeded: card leads', tiers.length, '· candidates 6');
})();
