// "Salariu": what each person takes home in a month.
//   salary set by the owner (Echipa, net, in hand)
// + overtime: paid with that month's salary ("Plătite cu salariul"), and for the current month what
//   is still due (_lib/timebank.js, 40 lei / hour)
// + commission (cosmeticians): approved upsell commission dated that month (_lib/cats.js)
// + bonus (reception): the booking bonus, on the average number of appointments she books per day,
//   over the days she clocked in: 24+ = 500 lei, 27+ = 700 lei, 30+ = 1.500 lei.
// + added by hand (Echipa → Ajustări, anyone): commission lines the owner wrote herself, plus or minus, dated
//   that month (data/sales.json, source 'manual'). Overtime added by hand is already in the overtime balance.
// Reception has no commission and the cosmeticians no bonus.

const BOOKING_TIERS = [{ min: 30, lei: 1500 }, { min: 27, lei: 700 }, { min: 24, lei: 500 }];
const hasBookingBonus = (emp) => !!emp && emp.role === 'receptie';
const hasCommission = (emp) => !!emp && emp.role === 'cosmetician';

const bucharestDate = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(d) : '';
};

// Average appointments she booked per day, over the days of the month she clocked in.
function bookingBonus(employeeId, month, attendance, appointments) {
  const perDay = {};
  (attendance || []).forEach((e) => { if (e.employeeId === employeeId && e.checkIn && String(e.date).slice(0, 7) === month) perDay[e.date] = 0; });
  (appointments || []).forEach((a) => {
    if (a.createdBy !== employeeId || a.status === 'concediu') return;
    const d = bucharestDate(a.createdAt);
    if (d in perDay) perDay[d] += 1;
  });
  const days = Object.keys(perDay).sort();
  const total = days.reduce((x, d) => x + perDay[d], 0);
  // the bonus is judged on the exact average (23,95 a day isn't 24); the average shown is rounded to a decimal
  const exact = days.length ? total / days.length : 0;
  const avg = Math.round(exact * 10) / 10;
  const tier = BOOKING_TIERS.find((t) => exact >= t.min) || null;
  const next = BOOKING_TIERS.slice().reverse().find((t) => exact < t.min) || null;
  return { days: days.length, total, avg, lei: tier ? tier.lei : 0, next, tiers: BOOKING_TIERS, perDay: days.map((d) => ({ date: d, count: perDay[d] })) };
}

// One month of pay for one person.
function monthPay({ emp, month, isCurrent, sales, payouts, bank, attendance, appointments }) {
  // the salary counts from the month it was first set (Echipa), not in the months before
  const base = !emp.netSalaryFrom || month >= emp.netSalaryFrom ? Math.max(0, Number(emp.netSalary) || 0) : 0;
  const paidOut = (payouts || []).filter((p) => p.employeeId === emp.id && p.month === month);
  const paidLei = paidOut.reduce((a, p) => a + (Number(p.lei) || 0), 0);
  const paidMin = paidOut.reduce((a, p) => a + (Number(p.minutes) || 0), 0);
  const dueLei = isCurrent && bank ? bank.bankLei : 0;
  const dueMin = isCurrent && bank ? bank.bank : 0;
  let commission = 0, waiting = 0, upsells = 0;
  if (hasCommission(emp)) {
    (sales || []).forEach((s) => {
      if (s.source === 'incasare' || s.source === 'manual' || s.employeeId !== emp.id || String(s.date).slice(0, 7) !== month) return;
      if (s.status === 'approved') { commission += Number(s.commission) || 0; upsells += 1; }
      if (s.status === 'pending') waiting += Number(s.commission) || 0;
    });
  }
  let manual = 0;
  (sales || []).forEach((s) => { if (s.source === 'manual' && s.status === 'approved' && s.employeeId === emp.id && String(s.date).slice(0, 7) === month) manual += Number(s.commission) || 0; });
  const booking = hasBookingBonus(emp) ? bookingBonus(emp.id, month, attendance, appointments) : null;
  const bonus = booking ? booking.lei : 0;
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    month, base, overtimeLei: r2(paidLei + dueLei), overtimeMinutes: paidMin + dueMin, overtimePaidLei: r2(paidLei), overtimeDueLei: r2(dueLei),
    commission: r2(commission), commissionWaiting: r2(waiting), upsells, bonus, booking, manual: r2(manual),
    total: r2(base + paidLei + dueLei + commission + bonus + manual), hasCommission: hasCommission(emp), hasBonus: hasBookingBonus(emp),
  };
}

module.exports = { BOOKING_TIERS, bookingBonus, monthPay, hasBookingBonus, hasCommission, bucharestDate };
