// The booking bonus reminders of reception (Salariu: 24+ / 27+ / 30+ programări pe zi în medie):
// the step reached, and the next one when it's close (within 3 a day), the tone following the days
// left in the month. Shown live in the bell (api/portal-data.js) and sent once to the phone when a
// receptionist books an appointment and a new line appears (data/push-sent.json remembers what went).

const PAY = require('./payroll');
const { sendPush } = require('./push');

const SENT = 'data/push-sent.json';

function bookingNotes(bk, month, today) {
  const notes = [];
  if (!bk || !bk.days) return notes;
  const dim = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const daysLeft = dim - Number(today.slice(8, 10)) + 1;
  const avg = bk.avg.toLocaleString('ro-RO');
  if (bk.lei) notes.push({ id: 'book:' + month + ':' + bk.lei, kind: 'bonus', tone: 'good', live: true, go: 'comision', title: '🏆 Bonus ' + bk.lei.toLocaleString('ro-RO') + ' lei', text: 'Media ta: ' + avg + ' programări pe zi.' });
  if (bk.next && bk.next.min - bk.avg <= 3) {
    const need = (Math.ceil((bk.next.min - bk.avg) * 10) / 10).toLocaleString('ro-RO');
    const stage = daysLeft > 10 ? 'a' : daysLeft > 3 ? 'b' : 'c';
    const text = stage === 'a' ? 'Încă ' + need + ' programări pe zi în medie și urci la ' + bk.next.lei + ' lei. 🎯'
      : stage === 'b' ? 'Încă ' + need + ' pe zi în ' + daysLeft + ' zile pentru ' + bk.next.lei + ' lei. 💪'
        : (daysLeft === 1 ? 'Ultima zi! ' : 'Doar ' + daysLeft + ' zile! ') + 'Încă ' + need + ' pe zi pentru ' + bk.next.lei + ' lei. ⏳';
    notes.push({ id: 'book:' + month + ':next' + bk.next.min + ':' + stage, kind: 'bonus', tone: stage === 'c' ? 'warn' : 'info', live: true, go: 'comision', title: 'Bonus ' + bk.next.lei + ' lei', text });
  }
  return notes;
}

// After a receptionist booked: the bonus lines she hasn't had on her phone yet. Never throws.
async function bonusPush(store, employeeId) {
  try {
    const emp = (await store.readJSON('data/employees.json', [])).find((e) => e.id === employeeId);
    if (!PAY.hasBookingBonus(emp)) return 0;
    const today = PAY.bucharestDate(new Date().toISOString()), month = today.slice(0, 7);
    const [attendance, appointments] = await Promise.all([store.readJSON('data/attendance.json', []), store.readJSON('data/appointments.json', [])]);
    const notes = bookingNotes(PAY.bookingBonus(emp.id, month, attendance, appointments), month, today);
    if (!notes.length) return 0;
    const sent = await store.readJSON(SENT, {});
    const had = new Set(sent[emp.id] || []);
    const fresh = notes.filter((n) => !had.has(n.id));
    if (!fresh.length) return 0;
    sent[emp.id] = [...had, ...fresh.map((n) => n.id)].slice(-60);
    await store.writeJSON(SENT, sent);
    let n = 0;
    for (const x of fresh) n += await sendPush(store, [emp.id], { title: x.title, body: x.text, url: '/portal#' + x.go, tag: 'bonus' });
    return n;
  } catch (err) {
    console.error('bonusPush:', err.message);
    return 0;
  }
}

module.exports = { bookingNotes, bonusPush };
