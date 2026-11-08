// A booking from the site is valid once the client confirms it on WhatsApp (the owner, 5.11). What happens when she
// doesn't, per booking (data/site-confirm.json: { <appointment id>: { plan, at, remindAt, remindedAt, cancelAt, why,
// done } }):
//   remind  4 hours after the booking (in the daytime, 9:00 to 20:00) a last message: "dacă nu o confirmați acum, se
//           anulează", with the Confirm button; 3 hours after it, still not confirmed: cancelled, the desk hears it
//   call    the booking is too close for that (e.g. today), the confirmation didn't reach her on WhatsApp (no WhatsApp,
//           a refused message), or a message isn't approved by Meta yet: Giovanna (reception) calls and confirms it
//           by phone: a task in Sarcini ("Sună și confirmă") + the bell and the phone, for the admins and the desk
// Her „Confirm” (_lib/reminders.js reply) or the desk's Confirmată ends it. Run by the automations' clock (tick), started
// by api/booking.js (start), switched to "call" by api/webhook-whatsapp.js when a message to her fails (undelivered).

const crypto = require('crypto');
const store = require('./store');
const { readJSON, writeJSON } = store;
const WF = require('./workflows');
const WT = require('./wa-templates');
const WA = require('./whatsapp');
const { notifyMany, cityTag } = require('./notify');

const KEY = 'data/site-confirm.json';
const H = 3600e3;
const REMIND_AFTER = 4 * H, CANCEL_AFTER = 3 * H, MARGIN = 3 * H; // the cancel comes at least 3 hours before her hour
const nowISO = () => new Date().toISOString();
const WHY = {
  soon: 'programare din scurt, nu e timp de reamintire',
  nowa: 'mesajul de pe WhatsApp nu a ajuns la ea',
  tpl: 'mesajul de confirmare de pe WhatsApp nu e încă aprobat de Meta',
  last: 'reamintirea de pe WhatsApp nu a putut pleca',
};

// Bucharest's date and minute of the day
function ro(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return { date: g('year') + '-' + g('month') + '-' + g('day'), min: Number(g('hour')) * 60 + Number(g('minute')) };
}
const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
// a message to a client goes in the daytime: before 9:00 at 9:00, after 20:00 the next day at 9:00
function daytime(ms) {
  const r = ro(ms);
  if (r.min < 9 * 60) return WF.apptStart({ date: r.date, time: '09:00' });
  if (r.min >= 20 * 60) return WF.apptStart({ date: addDay(r.date, 1), time: '09:00' });
  return ms;
}
const ddmm = (a) => String(a.date || '').slice(8, 10) + '.' + String(a.date || '').slice(5, 7) + (a.time ? ', ' + a.time : '');

async function people(loc) {
  const emps = (await readJSON('data/employees.json', [])).filter((e) => e.active !== false);
  return [...new Set(['admin'].concat(emps.filter((e) => e.role === 'admin' || (e.role === 'receptie' && (!loc || !e.location || e.location === loc))).map((e) => e.id)))];
}

// Giovanna calls her: one task in Sarcini (closes itself once the booking is confirmed, cancelled or past) and the bell
async function callTask(a, why) {
  const tasks = await readJSON('data/automation-tasks.json', []);
  if (!tasks.some((t) => t.confirmAppt && t.relatedAppointmentId === a.id && t.status === 'pending')) {
    tasks.push({ id: crypto.randomUUID(), status: 'pending', createdAt: nowISO(), doneAt: null, doneBy: null, assigneeRole: 'receptie', type: 'sarcina',
      title: 'Sună și confirmă programarea', text: 'Programare de pe site: ' + (WHY[why] || why) + '.', phone: a.clientPhone || '', clientName: a.clientName || '',
      relatedAppointmentId: a.id, location: a.location || '', confirmAppt: true });
    await writeJSON('data/automation-tasks.json', tasks);
  }
  await notifyMany({ readJSON, writeJSON }, await people(a.location), { kind: 'booking', tone: 'info', go: 'programari', tag: 'site-call-' + a.id, ownerPush: false,
    title: 'SUNĂ ȘI CONFIRMĂ 📞' + cityTag(a.location), text: (a.clientName || '') + ' · ' + ddmm(a) + ' · ' + (WHY[why] || why) }).catch((e) => console.error('site-confirm call:', e.message));
}

async function save(id, patch) {
  const doc = (await readJSON(KEY, null)) || {};
  doc[id] = Object.assign(doc[id] || {}, patch);
  // a month of history is enough
  const old = Date.now() - 30 * 864e5;
  Object.keys(doc).forEach((k) => { if (doc[k].done && Date.parse(doc[k].at || 0) < old) delete doc[k]; });
  await writeJSON(KEY, doc, { quiet: true });
  return doc[id];
}

// A booking just made on the site (api/booking.js, after its confirmation went or didn't): its plan
async function start(a, why) {
  const now = Date.now(), at = WF.apptStart(a);
  const remindAt = daytime(now + REMIND_AFTER), cancelAt = remindAt + CANCEL_AFTER;
  const soon = cancelAt > at - MARGIN;
  const plan = why || soon ? 'call' : 'remind';
  const x = await save(a.id, { plan, at: nowISO(), remindAt: new Date(remindAt).toISOString(), cancelAt: new Date(cancelAt).toISOString(), why: why || (soon ? 'soon' : '') });
  if (plan === 'call') await callTask(a, x.why);
  return x;
}

// A message to her didn't arrive (api/webhook-whatsapp.js): a booking from the site still waiting for her „Confirm”
// goes to Giovanna's phone instead
async function undelivered(apptId) {
  const doc = (await readJSON(KEY, null)) || {};
  const x = doc[apptId];
  if (!x || x.done || x.plan === 'call') return false;
  const a = (await readJSON('data/appointments.json', [])).find((y) => y.id === apptId);
  if (!a || a.status !== 'programata') return false;
  await save(apptId, { plan: 'call', why: 'nowa' });
  await callTask(a, 'nowa');
  return true;
}

// the last message, from the clinic's number, with the Confirm button (_lib/reminders.js lastTemplate)
async function sendLast(a) {
  const wa = { tpls: (await WT.load()).templates, cfg: await WA.loadConfig() };
  const base = 'Reamintiri · Ultima confirmare site · ' + a.location;
  const n = wa.cfg && wa.cfg.numbers && wa.cfg.numbers[a.location];
  const t = n && wa.tpls.filter((x) => (x.label === base || String(x.label || '').startsWith(base + ' · v')) && WT.approvedFor(x, n.wabaId))
    .sort((x, y) => String(y.updatedAt || '').localeCompare(String(x.updatedAt || '')))[0];
  if (!t) return { why: 'tpl' };
  const settings = (await WF.loadDoc()).settings || {};
  const v = WF.vars({ appointment: a, lead: null, clients: [] }, settings);
  return WF.sendOnce('site-last|' + a.id + '|' + WF.apptKey(a), () => WF.sendTemplate(wa, t.id, a.location, a.clientPhone, v, { appt: a.id, akey: WF.apptKey(a) }));
}

// Cancelled for want of a „Confirm” (written only over the calendar as it was read)
async function cancel(id) {
  for (let round = 0; round < 5; round++) {
    const { data: appts, etag } = await store.readJSONTagged('data/appointments.json', []);
    const a = appts.find((y) => y.id === id);
    if (!a || a.status !== 'programata') return null;
    a.status = 'anulata'; a.updatedAt = nowISO(); a.statusBy = 'Automat: neconfirmată pe WhatsApp';
    if (!(await store.writeJSONIf('data/appointments.json', appts, etag))) continue;
    await require('../portal-leads').unbookLead(a, 'Anulată: nu a confirmat programarea de pe site', 'WhatsApp automat').catch(() => {});
    await WF.emit('appointment_status', { appointment: a, status: 'anulata' }); // the reminders still waiting stop
    await notifyMany({ readJSON, writeJSON }, await people(a.location), { kind: 'booking', tone: 'bad', go: 'programari', tag: 'site-cancel-' + a.id,
      title: 'ANULATĂ, NECONFIRMATĂ ❌' + cityTag(a.location), text: (a.clientName || '') + ' · ' + ddmm(a) + ' · nu a confirmat pe WhatsApp, ora e din nou liberă' }).catch(() => {});
    return a;
  }
  return null;
}

// The clock: the last messages due, the cancels due, the bookings settled
async function tick() {
  const doc = (await readJSON(KEY, null)) || {};
  const open = Object.keys(doc).filter((k) => !doc[k].done);
  if (!open.length) return { skipped: 'nothing' };
  const appts = await readJSON('data/appointments.json', []);
  const now = Date.now();
  const out = { reminded: 0, cancelled: 0, calls: 0, settled: 0 };
  for (const id of open) {
    const x = doc[id], a = appts.find((y) => y.id === id);
    if (!a || a.status !== 'programata' || !(WF.apptStart(a) > now)) { await save(id, { done: a ? a.status : 'gone' }); out.settled++; continue; }
    if (x.plan !== 'remind') continue;
    if (!x.remindedAt && now >= Date.parse(x.remindAt)) {
      // the clock came late and the cancel would come too close to her hour: Giovanna calls instead
      if (now + CANCEL_AFTER > WF.apptStart(a) - MARGIN) { await save(id, { plan: 'call', why: 'soon' }); await callTask(a, 'soon'); out.calls++; continue; }
      const r = await sendLast(a).catch((e) => ({ why: e.message }));
      // the cancel 3 hours later, moved to the morning when that falls in the night (she may read it then), never
      // closer than 3 hours to her hour
      if (r.sent || r.dup) { await save(id, { remindedAt: nowISO(), cancelAt: new Date(Math.min(daytime(now + CANCEL_AFTER), WF.apptStart(a) - MARGIN)).toISOString() }); out.reminded++; }
      else { await save(id, { plan: 'call', why: r.why === 'tpl' ? 'tpl' : 'last' }); await callTask(a, r.why === 'tpl' ? 'tpl' : 'last'); out.calls++; }
      continue;
    }
    if (x.remindedAt && now >= Date.parse(x.cancelAt)) {
      const c = await cancel(id);
      await save(id, { done: c ? 'cancelled' : 'changed' });
      if (c) out.cancelled++;
    }
  }
  return out;
}

module.exports = { start, tick, undelivered, KEY, daytime };
