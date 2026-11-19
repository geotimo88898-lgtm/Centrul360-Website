// "Salariu": what each person takes home in a month.
//   salary set by the owner (Echipa, net, in hand), dated (the owner, 16.11: a raise never rewrites the months before it):
//   salaryHistory [{ from: 'YYYY-MM-DD', lei }], each from its day on. The month a salary changes in is paid by calendar
//   days (10 days at the old one, 20 at the new one in a 30-day month). An older record (netSalary, netSalaryFrom
//   'YYYY-MM') reads as one entry from the first of that month (salaryHistoryOf), so the months already paid stay as they were.
// + overtime: paid with that month's salary ("Plătite cu salariul"), and for the current month what
//   is still due (_lib/timebank.js, 40 lei / hour)
// + commission (cosmeticians): approved upsell commission (_lib/cats.js). Up to October 2026: the whole value's commission,
//   dated the upsell's month. From November 2026 (_lib/commission.js): 4% of each payment received for the upsell, in that
//   payment's month, minus 4% of what was refunded, in the refund's month; `commissionLines` and `toCome` say which.
// + bonus (reception): the booking bonus, on the average number of appointments she books per day,
//   over the days she clocked in: 24+ = 500 lei, 27+ = 700 lei, 30+ = 1.500 lei.
// + added by hand (Echipa → Ajustări, anyone): commission lines the owner wrote herself, plus or minus, dated
//   that month (data/sales.json, source 'manual'). Overtime added by hand is already in the overtime balance.
// + the manager's bonus (_lib/manager-pay.js): 5% of her clinics' profit in a month every trained cosmetician made more
//   than 1.500 lei a day worked. Only the final number counts here, the one the owner confirms at month close
//   (data/manager-bonus.json, passed in as finals); until then Salariu shows it as an estimate, outside the total.
// Reception has no commission and the cosmeticians no bonus.

const CM = require('./commission');

const BOOKING_TIERS = [{ min: 30, lei: 1500 }, { min: 27, lei: 700 }, { min: 24, lei: 500 }];
// The manager (the owner, 15.11): the reception bonus stops the day she became manager (roleSince, set in Echipa when the
// role changes). The month of the switch keeps what she made as reception until then, frozen (the owner pays those
// days); nothing accrues after it, and the months after have no bonus. With a month: does that month have one.
const bonusUntil = (emp) => (emp && emp.role === 'manager' && emp.prevRole === 'receptie' && /^\d{4}-\d{2}-\d{2}$/.test(String(emp.roleSince || '')) ? emp.roleSince : '');
const hasBookingBonus = (emp, month) => {
  if (!emp) return false;
  if (emp.role === 'receptie') return true;
  const until = bonusUntil(emp);
  return !!(until && month && month <= until.slice(0, 7));
};
const hasCommission = (emp) => !!emp && emp.role === 'cosmetician';
// the months she is a manager in (from the month she became one; an old record without the day: every month)
const hasManagerBonus = (emp, month) => !!emp && emp.role === 'manager' && (!/^\d{4}-\d{2}-\d{2}$/.test(String(emp.roleSince || '')) || month >= emp.roleSince.slice(0, 7));

const bucharestDate = (iso) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(d) : '';
};

// Average appointments she booked per day, over the days of the month she clocked in.
// until (the manager's switch day): only the days before it count, and the result says it is frozen
function bookingBonus(employeeId, month, attendance, appointments, until) {
  const perDay = {};
  (attendance || []).forEach((e) => { if (e.employeeId === employeeId && e.checkIn && String(e.date).slice(0, 7) === month && (!until || e.date < until)) perDay[e.date] = 0; });
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
  return { days: days.length, total, avg, lei: tier ? tier.lei : 0, next: until ? null : next, tiers: BOOKING_TIERS, perDay: days.map((d) => ({ date: d, count: perDay[d] })), ...(until ? { frozen: until } : {}) };
}

// ------------------------------------------------------------------ the salary, by date
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const daysIn = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
// her salaries with the day each started, oldest first. Older records: the one salary from the first of netSalaryFrom
// (a record without it: from always, '')
function salaryHistoryOf(emp) {
  if (!emp) return [];
  if (Array.isArray(emp.salaryHistory) && emp.salaryHistory.length) {
    return emp.salaryHistory.filter((h) => h && (h.from === '' || isDay(h.from)) && Number.isFinite(Number(h.lei)))
      .map((h) => ({ from: h.from, lei: Math.max(0, Math.round(Number(h.lei))) }))
      .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  }
  const lei = Math.max(0, Math.round(Number(emp.netSalary) || 0));
  if (!lei) return [];
  return [{ from: /^\d{4}-\d{2}$/.test(String(emp.netSalaryFrom || '')) ? emp.netSalaryFrom + '-01' : '', lei }];
}
// the salary in force on a day (0 before the first one)
function salaryOn(emp, day) {
  let lei = 0;
  salaryHistoryOf(emp).forEach((h) => { if (!h.from || h.from <= day) lei = h.lei; });
  return lei;
}
// a month's salary: whole when one salary holds all month, by calendar days when it changes (or starts) in it
function salaryOfMonth(emp, month) {
  const n = daysIn(month), first = month + '-01';
  const hist = salaryHistoryOf(emp);
  const inside = hist.filter((h) => h.from > first && h.from.slice(0, 7) === month);
  if (!inside.length) return salaryOn(emp, first);
  let sum = 0, from = 1, lei = salaryOn(emp, first);
  inside.forEach((h) => { const d = Number(h.from.slice(8, 10)); sum += lei * (d - from) / n; from = d; lei = h.lei; });
  sum += lei * (n - from + 1) / n;
  return Math.round(sum);
}
// adds a salary from a day: the entries from that day on are replaced (one change a day), returns the new history
function withSalary(emp, from, lei) {
  const hist = salaryHistoryOf(emp).filter((h) => !(h.from && h.from >= from));
  const prev = hist.length ? hist[hist.length - 1].lei : null;
  if (prev !== Math.round(lei)) hist.push({ from, lei: Math.max(0, Math.round(lei)) });
  return hist;
}

// her commission of a month, the one Salariu counts (and every other place that shows it: Echipa, the goals, Aprobări,
// the Panou, lead-health): the approved upsell commission and what is waiting, the manual lines apart
function commissionMonth({ emp, month, isCurrent, sales, dues, cctx }) {
  let commission = 0, waiting = 0, upsells = 0, lines = null, toCome = null;
  if (hasCommission(emp) && month >= CM.NEW_FROM) {
    const c = CM.monthOfPerson(sales, dues, emp.id, month, isCurrent, cctx || CM.context(sales, dues, [emp]));
    commission = c.commission; waiting = c.waiting; upsells = c.upsells; lines = c.lines; toCome = c.toCome;
  } else if (hasCommission(emp)) {
    (sales || []).forEach((s) => {
      if (s.source === 'incasare' || s.source === 'manual' || s.employeeId !== emp.id || String(s.date).slice(0, 7) !== month) return;
      if (s.status === 'approved') { commission += Number(s.commission) || 0; upsells += 1; }
      if (s.status === 'pending') waiting += Number(s.commission) || 0;
    });
  }
  let manual = 0;
  (sales || []).forEach((s) => { if (s.source === 'manual' && s.status === 'approved' && s.employeeId === emp.id && String(s.date).slice(0, 7) === month) manual += Number(s.commission) || 0; });
  return { commission: r2(commission), waiting: r2(waiting), upsells, lines, toCome, manual: r2(manual) };
}

// One month of pay for one person.
function monthPay({ emp, month, isCurrent, sales, dues, payouts, bank, attendance, appointments, finals, cctx }) {
  // the salary of the month by its dates (salaryOfMonth); none in the months before the first one
  // someone who left („A plecat”, _lib/left.js): the month of her last day keeps its salary (paid the month after), none in the months after
  const after = emp.active === false && /^\d{4}-\d{2}-\d{2}$/.test(String(emp.leftAt || '')) && month > emp.leftAt.slice(0, 7);
  const base = !after ? salaryOfMonth(emp, month) : 0;
  const paidOut = (payouts || []).filter((p) => p.employeeId === emp.id && p.month === month);
  const paidLei = paidOut.reduce((a, p) => a + (Number(p.lei) || 0), 0);
  const paidMin = paidOut.reduce((a, p) => a + (Number(p.minutes) || 0), 0);
  const dueLei = isCurrent && bank ? bank.bankLei : 0;
  const dueMin = isCurrent && bank ? bank.bank : 0;
  const cm = commissionMonth({ emp, month, isCurrent, sales, dues, cctx });
  const { commission, waiting, upsells, lines, toCome, manual } = cm;
  const booking = hasBookingBonus(emp, month) ? bookingBonus(emp.id, month, attendance, appointments, bonusUntil(emp)) : null;
  const bonus = booking ? booking.lei : 0;
  const fin = hasManagerBonus(emp, month) && finals ? finals[emp.id + '|' + month] : null;
  const managerBonus = fin && Number.isFinite(Number(fin.lei)) ? Number(fin.lei) : 0;
  return {
    month, base, overtimeLei: r2(paidLei + dueLei), overtimeMinutes: paidMin + dueMin, overtimePaidLei: r2(paidLei), overtimeDueLei: r2(dueLei),
    commission: r2(commission), commissionWaiting: r2(waiting), upsells, bonus, booking, manual: r2(manual),
    ...(lines ? { commissionLines: lines, toCome: toCome || [] } : {}),
    ...(lines && month >= CM.PACK.from.slice(0, 7) && month <= CM.PACK.until.slice(0, 7) ? { pack: { from: CM.PACK.from, until: CM.PACK.until, tiers: CM.PACK.tiers, min: CM.packMinOf(emp) } } : {}),
    total: r2(base + paidLei + dueLei + commission + bonus + manual + managerBonus), hasCommission: hasCommission(emp), hasBonus: hasBookingBonus(emp, month),
    ...(hasManagerBonus(emp, month) ? { hasManagerBonus: true, managerBonus: r2(managerBonus), managerFinal: !!fin } : {}),
  };
}

module.exports = { BOOKING_TIERS, bonusUntil, bookingBonus, monthPay, commissionMonth, salaryHistoryOf, salaryOn, salaryOfMonth, withSalary, hasBookingBonus, hasCommission, hasManagerBonus, bucharestDate };
