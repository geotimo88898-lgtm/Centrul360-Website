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
// Reception has no commission and the cosmeticians no bonus. The manager: her own upsells' commission (from 20.11, the
// same rules as the cosmeticians'), never the plan bonus or the team prize.

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
// the upsell commission: the cosmeticians, and the manager for the upsells she sells herself (George, 20.11: chosen at the
// payment, „Cine a vândut upsell-ul?”), from MANAGER_FROM, under exactly the same rules (_lib/commission.js); not the
// cosmeticians' plan bonus (planBonus) nor the team prize (hasTeamPrize)
const MANAGER_FROM = '2026-11-20';
const hasCommission = (emp) => !!emp && (emp.role === 'cosmetician' || emp.role === 'manager');
const isCosmetician = (emp) => !!emp && emp.role === 'cosmetician';
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
  // the manager: only the upsells sold from MANAGER_FROM count (nothing of hers before it changes)
  const own = emp && emp.role === 'manager' ? (sales || []).filter((s) => !(s && s.employeeId === emp.id && CM.isUpsellReq(s) && String(s.date || '') < MANAGER_FROM)) : sales;
  if (hasCommission(emp) && month >= CM.NEW_FROM && (emp.role !== 'manager' || month >= MANAGER_FROM.slice(0, 7))) {
    const c = CM.monthOfPerson(own, dues, emp.id, month, isCurrent, cctx || CM.context(sales, dues, [emp]));
    commission = c.commission; waiting = c.waiting; upsells = c.upsells; lines = c.lines; toCome = c.toCome;
  } else if (isCosmetician(emp) && month < CM.NEW_FROM) {
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

// Premiul echipei (George, 20.11): from the week of 23.11, every week (Monday to Sunday) in which the team sells 15
// packages brings 150 lei to each cosmetician and receptionist who clocked in at least one day of it; 25 packages bring
// 300 lei. A package: an upsell of 1.500 lei or more (its value), counted the week 1.500 lei of it had come in (George, 20.11:
// 1.500 from 3.000 counts, 300 from 3.000 doesn't yet), once, and not given back under that; both clinics together. Counted in packages, never in lei (the team never sees the clinic's money). A week
// counts in the month of its Sunday, once it is over; the week in progress shows how far it is (Salariu), outside the total.
const TEAM = { from: '2026-11-23', min: 1500, tiers: [{ min: 25, lei: 300 }, { min: 15, lei: 150 }] };
const hasTeamPrize = (emp) => !!emp && (emp.role === 'cosmetician' || emp.role === 'receptie');
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
function teamPackages(sales, C, from, to) {
  let n = 0;
  (sales || []).forEach((u) => {
    if (!CM.isUpsellReq(u) || u.status === 'rejected' || !(Number(u.amount) >= TEAM.min)) return;
    // the day 1.500 lei of it had come in (an advance of 300 doesn't count it yet), and not given back under that
    const in1500 = CM.linesOf(u, C).find((l) => (l.kind === 'pay' || l.kind === 'whole') && l.paidSoFar >= TEAM.min);
    if (!in1500 || !(in1500.date >= from && in1500.date <= to)) return;
    const sum = CM.summaryOf(u, C);
    if (sum && sum.paid - sum.refunded >= TEAM.min) n += 1;
  });
  return n;
}
function teamPrize(emp, month, sales, dues, attendance, today, cctx) {
  if (!hasTeamPrize(emp) || month < TEAM.from.slice(0, 7)) return null;
  const C = cctx || CM.context(sales, dues);
  const weeks = [];
  for (let from = TEAM.from; ; from = addDays(from, 7)) {
    const to = addDays(from, 6);
    if (to.slice(0, 7) < month) continue;
    if (to.slice(0, 7) > month || from > today) break;
    const packages = teamPackages(sales, C, from, to);
    const tier = TEAM.tiers.find((t) => packages >= t.min) || null;
    const worked = (attendance || []).some((a) => a.employeeId === emp.id && a.checkIn && a.date >= from && a.date <= to);
    const done = to < today;
    weeks.push({ from, to, packages, done, worked, lei: done && worked && tier ? tier.lei : 0, tier: tier ? tier.lei : 0 });
  }
  return { tiers: TEAM.tiers, min: TEAM.min, weeks, lei: weeks.reduce((a, w) => a + w.lei, 0) };
}

// Programul recomandat prezentat (George, 20.11): +5 lei for every paper „Program recomandat și ofertă” she presented and
// photographed into the client's sheet (Contacte → Fișe → „Program recomandat”, api/portal-contacts.js puts it on her
// booking of that day), from 23.11, on a visit that took place (finalizată); one a client a day. In the month of the visit.
const PLAN = { from: '2026-11-23', lei: 5 };
function planBonus(emp, month, appointments) {
  if (!isCosmetician(emp) || month < PLAN.from.slice(0, 7)) return null;
  const seen = new Set(), days = [];
  (appointments || []).forEach((a) => {
    if (!a || a.cosmeticianId !== emp.id || a.status !== 'finalizata' || !a.program || a.program.byId !== emp.id) return;
    const d = String(a.date || '');
    if (d < PLAN.from || d.slice(0, 7) !== month) return;
    const k = d + '|' + (a.clientId || a.clientPhone || a.id);
    if (seen.has(k)) return;
    seen.add(k); days.push({ date: d, client: a.clientName || '' });
  });
  days.sort((a, b) => (a.date < b.date ? 1 : -1));
  return { lei: days.length * PLAN.lei, rate: PLAN.lei, count: days.length, plans: days };
}

// commission already paid in cash, out of the month's „de plătit” (the owner, 24.11): the package bonus (payments of
// 1.500 lei and more, with its extras) is paid at the end of each day, for everyone; and days the owner paid by hand
// (one person's lines of that day). Still a cost of the business: only what is left to pay at the month's end drops it.
const PAID_DAYS = [{ emp: '73493e68-701c-49ec-96ca-d985cdd753f4', date: '2026-11-23' }];
function paidOfLine(emp, l) {
  if (!l || !(l.lei > 0) || l.status !== 'approved') return '';
  if (PAID_DAYS.some((x) => x.emp === emp.id && x.date === l.date)) return 'day';
  if (l.pack) return 'daily';
  return '';
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
  let paidDaily = 0, paidDay = 0;
  (lines || []).forEach((l) => { const w = paidOfLine(emp, l); if (w) l.paidCash = w; if (w === 'daily') paidDaily += l.lei; else if (w === 'day') paidDay += l.lei; });
  const booking = hasBookingBonus(emp, month) ? bookingBonus(emp.id, month, attendance, appointments, bonusUntil(emp)) : null;
  const bonus = booking ? booking.lei : 0;
  const fin = hasManagerBonus(emp, month) && finals ? finals[emp.id + '|' + month] : null;
  const managerBonus = fin && Number.isFinite(Number(fin.lei)) ? Number(fin.lei) : 0;
  const team = teamPrize(emp, month, sales, dues, attendance, bucharestDate(new Date().toISOString()), cctx);
  const teamLei = team ? team.lei : 0;
  const plan = planBonus(emp, month, appointments);
  const planLei = plan ? plan.lei : 0;
  return {
    month, base, overtimeLei: r2(paidLei + dueLei), overtimeMinutes: paidMin + dueMin, overtimePaidLei: r2(paidLei), overtimeDueLei: r2(dueLei),
    commission: r2(commission), commissionWaiting: r2(waiting), upsells, bonus, booking, manual: r2(manual),
    ...(lines ? { commissionLines: lines, toCome: toCome || [] } : {}),
    ...(lines && month >= CM.PACK.from.slice(0, 7) && (!CM.PACK.until || month <= CM.PACK.until.slice(0, 7)) ? { pack: { from: CM.PACK.from, until: CM.PACK.until, tiers: CM.PACK.tiers, min: CM.packMinOf(emp) } } : {}),
    total: r2(base + paidLei + dueLei + commission + bonus + manual + managerBonus + teamLei + planLei),
    commissionPaidDaily: r2(paidDaily), commissionPaidDay: r2(paidDay),
    toPay: r2(base + paidLei + dueLei + commission + bonus + manual + managerBonus + teamLei + planLei - paidDaily - paidDay), ...(team ? { team } : {}), ...(plan ? { plan } : {}), hasCommission: hasCommission(emp), hasBonus: hasBookingBonus(emp, month),
    ...(hasManagerBonus(emp, month) ? { hasManagerBonus: true, managerBonus: r2(managerBonus), managerFinal: !!fin } : {}),
  };
}

module.exports = { PAID_DAYS, paidOfLine, MANAGER_FROM, isCosmetician, TEAM, teamPrize, PLAN, planBonus, BOOKING_TIERS, bonusUntil, bookingBonus, monthPay, commissionMonth, salaryHistoryOf, salaryOn, salaryOfMonth, withSalary, hasBookingBonus, hasCommission, hasManagerBonus, bucharestDate };
