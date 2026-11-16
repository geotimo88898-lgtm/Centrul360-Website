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
// still waiting, a refund of part of a payment and a whole-package refund, so Încasări and Salariu show their lines
(() => {
const f = (p) => path.join(DATA, p.replace(/\//g, '__'));
const r = (p, d) => { try { return JSON.parse(fs.readFileSync(f(p), 'utf8')); } catch (e) { return d; } };
const w = (p, d) => fs.writeFileSync(f(p), JSON.stringify(d));
const sales = r('data/sales.json', []), dues = r('data/client-dues.json', []);
const T = '2026-11-', at = (d, h) => T + d + 'T' + String(h).padStart(2, '0') + ':00:00Z';
const pay = (id, d, amount, o) => Object.assign({ id, source: 'incasare', employeeId: 'e-mgr', performedBy: 'e-c1', clientId: 'cl-pk-' + id, client: 'Clienta Pachet', date: T + d, location: 'Timișoara', categories: ['corporale'], treatment: 'Lipo 640', amount, upsell: 0, method: 'card', status: 'recorded', commission: 0, createdAt: at(d, 10) }, o || {});
const up = (id, sale, d, amount, status, what) => ({ id, source: 'comision', origin: 'upsell', incasareId: sale, employeeId: 'e-c1', date: T + d, categories: ['corporale'], treatment: 'Upsell · ' + what, amount, status, commission: Math.round(amount * 4) / 100, client: 'Clienta Pachet', createdAt: at(d, 10), decidedAt: status === 'approved' ? at(d, 12) : null });
// 1.000 package: 500 on the 3rd, 500 on the 10th
sales.push(pay('pk1', '03', 500, { upsell: 1000, upsellWhat: 'Pachet 10 ședințe Lipo', parts: { session: 0, upsell: 500, due: 0 } }), up('pk1-u', 'pk1', '03', 1000, 'approved', 'Pachet 10 ședințe Lipo'));
sales.push(pay('pk1b', '10', 500, { clientId: 'cl-pk-pk1', dueId: 'pkd1', toDue: 500, parts: { session: 0, upsell: 0, due: 500 } }));
dues.push({ id: 'pkd1', clientId: 'cl-pk-pk1', client: 'Clienta Pachet', what: 'Pachet 10 ședințe Lipo', location: 'Timișoara', total: 1000, paid: 1000, saleId: 'pk1', payments: [{ saleId: 'pk1', amount: 500, at: at('03', 10) }, { saleId: 'pk1b', amount: 500, at: at('10', 10) }], createdAt: at('03', 10), closedAt: at('10', 10) });
// 2.400 package: 800 paid, the rest to come; part of it refunded (300)
sales.push(pay('pk2', '11', 800, { upsell: 2400, upsellWhat: 'Pachet RF abdomen', parts: { session: 0, upsell: 800, due: 0 } }), up('pk2-u', 'pk2', '11', 2400, 'approved', 'Pachet RF abdomen'));
sales.push(pay('pk2-r', '14', -300, { kind: 'refund', refundOf: 'pk2', scope: 'payment', clientId: 'cl-pk-pk2', treatment: 'Rambursare · Pachet RF abdomen', reason: 'o zonă mai puțin', from: [{ saleId: 'pk2', key: 'd:pkd2', dueId: 'pkd2', upsellId: 'pk2-u', lei: 300 }], dues: [{ dueId: 'pkd2', lei: 300, cut: 300 }], restCut: [], whole: false, method: 'cash', createdAt: at('14', 15) }));
dues.push({ id: 'pkd2', clientId: 'cl-pk-pk2', client: 'Clienta Pachet', what: 'Pachet RF abdomen', location: 'Timișoara', total: 2100, paid: 500, saleId: 'pk2', payments: [{ saleId: 'pk2', amount: 800, at: at('11', 10) }, { saleId: 'pk2-r', amount: -300, at: at('14', 15), refund: true }], createdAt: at('11', 10), closedAt: null });
// still waiting for approval: 1.500, 600 paid
sales.push(pay('pk3', '13', 600, { upsell: 1500, upsellWhat: 'Pachet facial', parts: { session: 0, upsell: 600, due: 0 } }), up('pk3-u', 'pk3', '13', 1500, 'pending', 'Pachet facial'));
dues.push({ id: 'pkd3', clientId: 'cl-pk-pk3', client: 'Clienta Pachet', what: 'Pachet facial', location: 'Timișoara', total: 1500, paid: 600, saleId: 'pk3', payments: [{ saleId: 'pk3', amount: 600, at: at('13', 10) }], createdAt: at('13', 10), closedAt: null });
w('data/sales.json', sales); w('data/client-dues.json', dues);
console.log('commission and refunds seeded');
})();
