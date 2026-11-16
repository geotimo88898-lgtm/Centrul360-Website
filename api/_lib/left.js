// Someone who left the team (the owner, 16.11: „vreau să o pot elimina din sistem fără să afecteze KPI-urile lunii”).
// Echipa → „A plecat” turns her account off (active: false, she can't log in) and keeps her last working day, leftAt
// (YYYY-MM-DD, Bucharest). From then on:
//   out:  the targets and the bonus condition of the month she left and the months after (outOfMonth), the team
//         schedule, „La lucru”, the free hours of the booking, the pickers for new bookings and payments (worksOn),
//         the notifications, the race, Pontajul echipei
//   kept: what she did. Her payments stay in Încasări and in every total, the months before keep her in their numbers,
//         the pay of the months she worked is still due (payroll.js), her papers stay in Acte.
// Her appointments after leftAt are not deleted: the Calendar lists them for someone else (orphans).
// An account turned off before leftAt existed counts as gone before this month (November 2026): OLD.
const OLD = '2026-10-31';

const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());

// her last working day ('' while she is with us)
function leftAt(e) {
  if (!e || e.active !== false) return '';
  return isDay(e.leftAt) ? e.leftAt : OLD;
}
// out of a month's targets, bonus condition and per person lists: the month she left and every month after it
// (an account turned off before 16.11: from November 2026; the months before keep her when she worked in them)
function outOfMonth(e, month) {
  if (!e || e.active !== false) return false;
  const from = isDay(e.leftAt) ? e.leftAt.slice(0, 7) : '2026-11';
  return String(month || '').slice(0, 7) >= from;
}
// she works that day (her last day included): a booking or a payment can be put on her
function worksOn(e, date) {
  if (!e) return false;
  if (e.active !== false) return true;
  return isDay(date) && date <= leftAt(e);
}
// what is still open on an appointment (a visit to come: not cancelled, not done, not a leave or a blocked time)
const open = (a) => a && !a.block && !['anulata', 'concediu', 'finalizata'].includes(a.status);
// the appointments still to come that wait for another cosmetician, by date, each with why (orphanWhy):
//   'a plecat'    she left before its day („A plecat”)
//   'concediu'    her approved leave that day (the leave's row in the Calendar), 'timp blocat' a whole-day block for her
//   'zi liberă'   taken off that day in Program echipă after it was booked (offShift, written by api/portal-schedule.js),
//                 while she still doesn't work that day ('în alt oraș': she works in the other clinic that day) (doc: the team schedule, to check it; without it the mark counts)
// Only the cosmeticians in emps are looked at for the leave and the day off (api/portal-employees.js passes just her).
// A copy of each booking is returned (orphanWhy on it); nothing is written.
function orphans(appts, emps, day, doc) {
  const d0 = day || today();
  const gone = new Map((emps || []).filter((e) => e && e.active === false).map((e) => [e.id, e]));
  const ids = new Set((emps || []).filter(Boolean).map((e) => e.id));
  const off = new Map(); // '<id>|<date>' → 'concediu' | 'timp blocat'
  (appts || []).forEach((x) => {
    if (!x || !x.cosmeticianId || x.time || x.status === 'anulata' || !(x.status === 'concediu' || x.block) || !(x.date >= d0)) return;
    const k = x.cosmeticianId + '|' + x.date;
    if (!off.has(k) || !x.block) off.set(k, x.block ? 'timp blocat' : 'concediu');
  });
  let T = null;
  const why = (a) => {
    if (gone.has(a.cosmeticianId) && a.date > leftAt(gone.get(a.cosmeticianId))) return 'a plecat';
    if (!ids.has(a.cosmeticianId)) return '';
    const k = off.get(a.cosmeticianId + '|' + a.date);
    if (k) return k;
    if (a.offShift) {
      if (!doc) return 'zi liberă';
      T = T || require('./team-schedule');
      const w = T.workingAt(doc, a.cosmeticianId, a.date, null, {});
      if (!w) return 'zi liberă';
      if (w.location && w.location !== a.location) return 'în alt oraș';
    }
    return '';
  };
  return (appts || []).filter((a) => open(a) && a.cosmeticianId && a.date >= d0).map((a) => { const w = why(a); return w ? Object.assign({}, a, { orphanWhy: w }) : null; }).filter(Boolean)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : String(a.time || '').localeCompare(String(b.time || ''))));
}

module.exports = { OLD, isDay, today, leftAt, outOfMonth, worksOn, orphans, open };
