// What happens to the clients when a cosmetician's time changes (16.11): an approved leave, a day taken off in Program
// echipă, the desk moving her bookings. Read by api/portal-leave.js, api/portal-schedule.js, api/portal-appointments.js
// and the reminders (_lib/workflows.js).
//   affected()    her open bookings on some days (from today on): the ones left without a cosmetician
//   rows()        those bookings for the sheet „N programări rămân fără cosmeticiană”, each with the colleagues free then
//   freeFor()     who can take a booking: a cosmetician working that day in that city (Program echipă, else her clinic),
//                 not on leave, nothing of hers at that hour
//   tellDesk()    the desk (reception, the manager of that clinic) hears it in the bell and on the phone
//   held()        a booking whose cosmetician is gone that day (_lib/left.js orphans): its client reminders wait
//   tellHer()     a change the desk made to her booking today or tomorrow: a short line on her phone
// No names in the code paths that leave the portal; the notifications are the team's own.

const T = require('./team-schedule');
const L = require('./left');
const { managerIds } = require('./roles');

const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null; };
const endOf = (a) => { const s = toMin(a.time), e = toMin(a.endTime); return s == null ? null : e != null && e > s ? e : s + 60; };
const roToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const ddmm = (d) => String(d || '').slice(8, 10) + '.' + String(d || '').slice(5, 7);
const isVisit = (a) => a && !a.block && a.status !== 'concediu' && a.status !== 'anulata';

// her bookings still open on these days, from today on (a visit to come: not cancelled, done, a leave or a block)
function affected(appts, employeeId, dates) {
  const days = new Set(dates || []), today = roToday();
  return (appts || []).filter((a) => a && a.cosmeticianId === employeeId && days.has(a.date) && a.date >= today && L.open(a) && !a.paidSaleId)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : String(a.time || '').localeCompare(String(b.time || ''))));
}
// the days of a range, both ends included
function daysOf(from, to) { const out = []; for (let d = from; d <= to && out.length < 400; d = addDay(d, 1)) out.push(d); return out; }

// the colleagues who can take a booking: [{ id, name }], the ones with the most room first
function freeFor(a, appts, emps, doc) {
  const s = toMin(a.time), e = endOf(a);
  const cosm = (emps || []).filter((x) => x && x.id !== a.cosmeticianId && x.role === 'cosmetician' && L.worksOn(x, a.date));
  const ids = new Set(cosm.map((x) => x.id));
  const day = (appts || []).filter((x) => x && x.date === a.date && x.id !== a.id);
  const all = new Set((emps || []).filter((x) => x && x.role === 'cosmetician' && L.worksOn(x, a.date)).map((x) => x.id));
  const sched = doc && T.hasSchedule(doc, a.location, all);
  const pool = sched
    // her shift, or her overtime that day (the desk books it, 18.11), covering the whole booking
    ? cosm.filter((x) => T.deskCovers(doc, x.id, a.date, a.location, s, e, { appts: day, ids }))
    : cosm.filter((x) => x.location === a.location && !T.onLeave(day, x.id, a.date));
  const busy = (id) => day.filter((x) => x.cosmeticianId === id && x.status !== 'anulata' && (isVisit(x) || x.block)).filter((x) => {
    const xs = toMin(x.time);
    if (xs == null) return !!x.block; // a whole-day block for her
    return s != null && xs < e && endOf(x) > s;
  }).length > 0;
  const load = (id) => day.filter((x) => x.cosmeticianId === id && isVisit(x)).length;
  return pool.filter((x) => !busy(x.id)).sort((x, y) => load(x.id) - load(y.id)).map((x) => ({ id: x.id, name: x.name || '' }));
}

// the sheet's rows: what the desk needs to move each one (no phone: the Calendar has it)
function rows(list, appts, emps, doc) {
  return (list || []).map((a) => ({ id: a.id, date: a.date, time: a.time || '', endTime: a.endTime || '', location: a.location || '', clientName: a.clientName || '',
    treatment: a.treatment || '', status: a.status, cosmeticianId: a.cosmeticianId || '', free: freeFor(a, appts, emps, doc).slice(0, 3) }));
}

// the desk: reception (one for both clinics) and the managers of that clinic, never the one who did it
function deskIds(emps, loc, except) {
  const rec = (emps || []).filter((e) => e && e.active !== false && e.role === 'receptie').map((e) => e.id);
  return [...new Set(rec.concat(managerIds(emps, loc)))].filter((id) => id && id !== except);
}
async function tellDesk(store, emps, list, who, why, except) {
  if (!list || !list.length) return 0;
  try {
    const N = require('./notify');
    const locs = [...new Set(list.map((a) => a.location).filter(Boolean))];
    let sent = 0;
    for (const loc of locs) {
      const mine = list.filter((a) => a.location === loc);
      const n = mine.length;
      sent += await N.notifyMany(store, deskIds(emps, loc, except), { kind: 'alert', tone: 'warn', go: 'programari', tag: 'orphans-' + (who || '') + '-' + mine.map((a) => a.id).join('').slice(0, 40),
        title: (n === 1 ? 'O PROGRAMARE RĂMÂNE' : n + ' PROGRAMĂRI RĂMÂN') + ' FĂRĂ COSMETICIANĂ' + N.cityTag(loc),
        text: (why ? why + ' · ' : '') + mine.slice(0, 3).map((a) => ddmm(a.date) + (a.time ? ' ' + a.time : '')).join(', ') + (n > 3 ? ' …' : '') + ' · Calendar, „Dă-le altcuiva”' });
    }
    return sent;
  } catch (e) { console.error('time-care tellDesk:', e.message); return 0; }
}

// the client reminders of a booking wait while its cosmetician is gone that day (left, on leave, a whole-day block, the day
// taken off): '' when they go, else why. A booking moved or given to someone else goes on by itself (the next check).
async function held(a, appts, readJSON) {
  if (!a || !a.cosmeticianId || !L.open(a)) return '';
  const day = (appts || []).filter((x) => x && x.date === a.date);
  const marks = day.some((x) => x.cosmeticianId === a.cosmeticianId && !x.time && (x.status === 'concediu' || x.block) && x.status !== 'anulata');
  const emps = await readJSON('data/employees.json', []);
  const me = (emps || []).find((e) => e && e.id === a.cosmeticianId);
  const gone = me && me.active === false;
  if (!marks && !a.offShift && !gone) return ''; // nothing could hold it: no extra reads
  const doc = a.offShift ? await T.load() : null;
  const o = L.orphans([a].concat(day.filter((x) => x.id !== a.id)), me ? [me] : [], a.date, doc).find((x) => x.id === a.id);
  return o ? o.orphanWhy : '';
}

// a booking of hers changed by the desk, today or tomorrow: one short line on her phone (the owner, 16.11)
//   kind: 'new' | 'moved' | 'cancelled' | 'deleted' | 'given' (to her from a colleague) | 'taken' (from her to a colleague)
async function tellHer(store, employeeId, kind, a, before) {
  try {
    if (!employeeId) return;
    const today = roToday(), tomorrow = addDay(today, 1);
    const near = (d) => d === today || d === tomorrow;
    const day = (d) => (d === today ? 'azi' : d === tomorrow ? 'mâine' : ddmm(d));
    const b = before || a;
    if (!near(a.date) && !near(b.date)) return;
    const emp = (await store.readJSON('data/employees.json', [])).find((e) => e && e.id === employeeId);
    if (!emp || emp.role !== 'cosmetician' || emp.active === false) return;
    const at = (x) => (x.time ? ' de la ' + x.time : '');
    let text = '';
    if (kind === 'new' || kind === 'given') text = (kind === 'new' ? 'Programare nouă ' : 'Ai primit clienta de ') + day(a.date) + (a.time ? (kind === 'new' ? ' la ' : ' de la ') + a.time : '') + (a.treatment ? ' · ' + a.treatment : '') + '.';
    else if (kind === 'moved') {
      const sameDay = b.date === a.date;
      text = 'Clienta' + (sameDay ? '' : ' de ' + day(b.date)) + at(b) + ' s-a mutat ' + (sameDay ? '' : day(a.date) === 'azi' || day(a.date) === 'mâine' ? day(a.date) + ' ' : 'pe ' + day(a.date) + ' ') + (a.time ? 'la ' + a.time : '') + '.';
      text = text.replace(/\s+\./, '.').replace(/\s{2,}/g, ' ');
    } else if (kind === 'cancelled') text = 'Clienta de ' + day(b.date) + at(b) + ' a anulat.';
    else if (kind === 'deleted') text = 'Programarea de ' + day(b.date) + at(b) + ' s-a șters.';
    else if (kind === 'taken') text = 'Clienta de ' + day(b.date) + at(b) + ' trece la o colegă.';
    if (!text) return;
    await require('./notify').notify(store, employeeId, { kind: 'booking', tone: kind === 'new' || kind === 'given' ? 'good' : 'info', go: 'programari',
      tag: 'desk-' + kind + '-' + a.id + '-' + (a.date || '') + (a.time || ''), title: kind === 'new' || kind === 'given' ? 'Clientă nouă' : 'Programare schimbată', text });
  } catch (e) { /* a notification never blocks the change */ }
}

module.exports = { affected, daysOf, freeFor, rows, deskIds, tellDesk, held, tellHer, roToday, addDay };
