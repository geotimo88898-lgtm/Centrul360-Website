// A package's next session (the owner, 17.11: „ca să le fie tuturor mai ușor”, no new button).
//   sessionOf(sales, appts)  → (a) => { n, of } | null: „Ședința X din Y” for a booking marked as a package session
//                              (booking form → „Ședință din pachet”), counted from the client's newest package bought on
//                              or before that day; Y is the number in what was bought („6 ședințe LipoSonix”, the same
//                              reading as Calendar → Pachete fără programare, api/_lib/followups.js), else nothing
//   done(appt)               a visit marked „Finalizată” (by hand, at the payment, by the cosmetician): when it belongs to a
//                              package with sessions left and the client has nothing booked ahead, reception gets one task
//                              „Programează ședința următoare: <client>” in Sarcini (and the bell), once per client
// Tasks: data/automation-tasks.json { type: 'pachet', packNext: { clientId, phone }, ... }; they close themselves once she
// has a booking ahead (api/portal-automation-tasks.js). Never throws.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./store');

const PKG_DAYS = 180;
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const roDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const isTest = (name) => /^\s*test\b/i.test(String(name || ''));
const visit = (a) => a && a.status !== 'anulata' && a.status !== 'concediu' && !a.block;
// who a client is: her card, her phone
const keysOf = (clientId, phone) => { const out = []; if (clientId) out.push('c:' + clientId); const p = d9(phone); if (p.length === 9) out.push('p:' + p); return out; };
const same = (a, b) => a.some((x) => b.includes(x));
// the number of sessions bought, from what was written at the payment („6 ședințe”, „8x”), or null
function totalOf(sale) {
  const m = /(\d{1,2})\s*(x\b|sedin|sesiun)/.exec(fold(sale && sale.upsellWhat));
  return m ? Number(m[1]) : null;
}
// a package bought: a payment with a package total or an upsell, not „o zonă în plus”
const isPackage = (s) => s && s.source === 'incasare' && s.kind !== 'refund' && (Number(s.packageTotal) > 0 || Number(s.upsell) > 0) && !/zon[aă] (in|în) plus/i.test(s.upsellWhat || '');

// the client's newest package bought on or before `date`, with its sessions: { sale, of, sessions: [appt…] (package
// visits from that day on, not cancelled, by day and hour) }
function packageAt(sales, appts, keys, date) {
  const buys = sales.filter((s) => isPackage(s) && s.date <= date && s.date >= addDay(date, -PKG_DAYS) && same(keysOf(s.clientId, s.clientPhone), keys))
    .sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.createdAt || '').localeCompare(String(y.createdAt || '')));
  const sale = buys[buys.length - 1];
  if (!sale) return null;
  const sessions = appts.filter((a) => visit(a) && a.package && a.date >= sale.date && a.id !== sale.appointmentId && same(keysOf(a.clientId, a.clientPhone), keys))
    .sort((x, y) => String(x.date).localeCompare(String(y.date)) || String(x.time || '').localeCompare(String(y.time || '')));
  return { sale, of: totalOf(sale), sessions };
}
function sessionOf(sales, appts) {
  return (a) => {
    if (!a || !a.package || !visit(a)) return null;
    const p = packageAt(sales, appts, keysOf(a.clientId, a.clientPhone), a.date);
    if (!p || !p.of) return null;
    const n = p.sessions.findIndex((x) => x.id === a.id) + 1;
    return n > 0 && n <= p.of ? { n, of: p.of } : null;
  };
}

async function done(appt) {
  try {
    if (!appt || !visit(appt) || isTest(appt.clientName)) return null;
    const [sales, appts, clients] = await Promise.all([readJSON('data/sales.json', []), readJSON('data/appointments.json', []), readJSON('data/clients.json', [])]);
    const phone = appt.clientPhone || ((clients.find((c) => c && c.id === appt.clientId) || {}).phone) || '';
    const keys = keysOf(appt.clientId, phone);
    if (!keys.length) return null;
    const p = packageAt(sales, appts, keys, appt.date);
    // the visit belongs to the package: a session marked so, or any visit after the purchase day when nothing is marked
    if (!p || (!appt.package && !(appt.date > p.sale.date))) return null;
    // the sessions done up to this one: the ones marked as package sessions, else every visit she came to after the purchase
    const came = (a) => a.date <= appt.date && (a.status === 'finalizata' || a.paidSaleId || a.id === appt.id);
    const after = appts.filter((a) => visit(a) && a.date > p.sale.date && came(a) && same(keysOf(a.clientId, a.clientPhone || phone), keys));
    const cameN = p.sessions.filter(came).length || after.length || 1;
    if (p.of != null && p.of - cameN <= 0) return null; // the last one: nothing left to book
    if (p.of == null && !appt.package) return null;     // sessions left unknown and the visit not marked as one: no guess
    // something already booked ahead (any clinic): nothing to do
    const today = roDay();
    if (appts.some((a) => a.id !== appt.id && visit(a) && a.status !== 'finalizata' && !a.paidSaleId && a.date >= today && a.date >= appt.date && same(keysOf(a.clientId, a.clientPhone || ''), keys))) return null;
    const tasks = await readJSON('data/automation-tasks.json', []);
    // once per client while one is open (and never twice for the same visit)
    if (tasks.some((t) => t && t.type === 'pachet' && (t.fromAppt === appt.id || (t.status === 'pending' && t.packNext && same(keysOf(t.packNext.clientId, t.packNext.phone), keys))))) return null;
    const name = String(appt.clientName || '').trim() || 'Clientă';
    const left = p.of != null ? p.of - cameN : null;
    const task = {
      id: crypto.randomUUID(), type: 'pachet', status: 'pending', assigneeRole: 'receptie', title: 'Programează ședința următoare: ' + name,
      text: (p.of != null ? 'Ședința ' + cameN + ' din ' + p.of + ' făcută' + (left === 1 ? ', mai are una' : ', mai are ' + left) : 'Ședință din pachet făcută') + (appt.treatment ? ' · ' + String(appt.treatment).slice(0, 80) : ''),
      clientName: name, phone: String(phone).slice(0, 30), dueDate: today, location: appt.location || '',
      packNext: { clientId: appt.clientId || '', phone: String(phone).slice(0, 30) }, fromAppt: appt.id,
      createdBy: 'system', createdAt: new Date().toISOString(), doneAt: null, doneBy: null,
    };
    tasks.push(task);
    await writeJSON('data/automation-tasks.json', tasks);
    try {
      const N = require('./notify');
      await N.notifyMany({ readJSON, writeJSON }, await N.deskIds({ readJSON }, appt.location), { kind: 'info', tone: 'info', go: 'automatizari', tag: 'pk-next-' + appt.id,
        title: 'PROGRAMEAZĂ ȘEDINȚA URMĂTOARE' + N.cityTag(appt.location), text: name + (p.of != null ? ' · ședința ' + cameN + ' din ' + p.of : '') });
    } catch (e) { /* a notification never blocks */ }
    return task;
  } catch (err) { console.error('package-next:', err.message); return null; }
}
// a task of this kind is done once she has a visit booked ahead
function closes(task, appts, today) {
  if (!task || task.type !== 'pachet' || task.status !== 'pending' || !task.packNext) return false;
  const keys = keysOf(task.packNext.clientId, task.packNext.phone);
  return appts.some((a) => visit(a) && a.status !== 'finalizata' && !a.paidSaleId && a.date >= today && a.id !== task.fromAppt && same(keysOf(a.clientId, a.clientPhone || ''), keys));
}

module.exports = { totalOf, sessionOf, done, closes, keysOf };
