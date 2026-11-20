// GET /api/portal-data, the single role-aware payload that drives the whole portal.html
// SPA shell. Requires a valid session; a logged-out/expired visitor gets 401 and the
// client redirects to /portal-login.

const { readJSON } = require('./_lib/store');
const { sendVersioned } = require('./_lib/versioned');
const { requireAuth, clearSessionCookie } = require('./_lib/auth');
const { defaultConfig } = require('./_lib/defaults');
const { categoriesOf, normalizeCategories, UPSELL_RATE, COST_SHARE } = require('./_lib/cats');
const { cityOf, inCity } = require('./_lib/city');
const { clinicOf } = require('./_lib/clinic');
const { photoUrl } = require('./portal-account');
const { mine: myNotifications } = require('./_lib/notify');
const TB = require('./_lib/timebank');
const PAY = require('./_lib/payroll');
const CM = require('./_lib/commission');
const { bookingNotes } = require('./_lib/bonus');
const { deviceCounts } = require('./_lib/push');
// Profile photo (Contul meu) of an employee row, as a URL the portal can show.
const photoOf = (e) => (e && e.photo ? photoUrl(Object.assign({ id: e.id }, e.photo)) : '');
const { mergeAcademy, forStaff } = require('./_lib/academy');
const { loadOffers, discountOf } = require('./_lib/offers');
const live = require('./_lib/live');

// The full set of statuses an appointment can carry on the new shared Calendar (see
// api/portal-appointments.js). 'programata' is the default for a freshly booked slot.
const APPOINTMENT_STATUSES = ['programata', 'confirmata', 'anulata', 'reprogramata', 'finalizata'];

function monthKey(dateStr) {
  // dateStr expected as YYYY-MM-DD; returns YYYY-MM.
  return (dateStr || '').slice(0, 7);
}

// The clinic runs on Romanian time, the server (UTC) would otherwise roll over to "tomorrow"
// three hours late.
function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
}

function emptyStatusCounts() {
  const out = {};
  APPOINTMENT_STATUSES.forEach((s) => { out[s] = 0; });
  return out;
}

// Computes the live "current" value for one individual goal. Only 'manual' goals carry
// a stored value (edited by the admin); every other metric is derived here from the
// existing sales.json / appointments.json data, never separately tracked.
// "programari_*" metrics count by cosmeticianId (who the appointment is assigned to),
// not by who created/logged the row, the Calendar is shared, so creation and
// assignment are no longer the same thing they were under the old same-day log.
function computeGoalCurrent(goal, employeeId, sales, appointments, today, month, ctx) {
  const myActs = (type) => ((ctx && ctx.leads) || []).reduce((n, l) => n + (l.activities || []).filter(
    (a) => a.type === type && a.author === (ctx && ctx.name) && String(a.at || '').slice(0, 7) === month).length, 0);
  switch (goal.metric) {
    case 'programari_confirmate_azi':
      return appointments.filter(
        (a) => a.cosmeticianId === employeeId && a.date === today && a.status === 'confirmata'
      ).length;
    case 'programari_anulate_azi':
      return appointments.filter(
        (a) => a.cosmeticianId === employeeId && a.date === today && a.status === 'anulata'
      ).length;
    case 'comision_aprobat_luna': {
      // the month's commission as Salariu counts it (_lib/payroll.js commissionMonth: from November 2026, 4% of the money
      // received, minus the refunds), plus what was added by hand
      const emp = ctx && ctx.emp;
      if (!emp) return 0;
      const c = PAY.commissionMonth({ emp, month, isCurrent: true, sales, dues: ctx.dues, cctx: ctx.cctx });
      return Math.round((c.commission + c.manual) * 100) / 100;
    }
    case 'incasari_atribuite_luna':
      return sales
        .filter((s) => s.source === 'incasare' && s.performedBy === employeeId && monthKey(s.date) === month)
        .reduce((sum, s) => sum + Number(s.amount || 0), 0);
    case 'programari_finalizate_luna':
      return appointments.filter((a) => a.cosmeticianId === employeeId && a.status === 'finalizata' && monthKey(a.date) === month).length;
    case 'vanzari_aprobate_luna':
      return sales.filter((s) => s.source !== 'incasare' && s.source !== 'manual' && s.employeeId === employeeId && s.status === 'approved' && monthKey(s.date) === month).length;
    case 'incasari_inregistrate_luna':
      return sales.filter((s) => s.source === 'incasare' && s.employeeId === employeeId && monthKey(s.date) === month).reduce((sum, s) => sum + Number(s.amount || 0), 0);
    case 'leaduri_contactate_luna':
      return myActs('contact');
    case 'leaduri_programate_luna':
      return myActs('booking');
    case 'manual':
    default:
      return Number(goal.currentValue || 0);
  }
}

// her break today ({ from, to, on, moved }) or null: no shift, a short one
// her pontaj today (Panou: „Pontează sosirea” while she hasn't, 16.11): arrived / left, and whether she works today
// (her schedule says so, or no schedule is set; never on a day of leave)
async function myClockToday(id, today, attendance, appointments) {
  const T = require('./_lib/team-schedule');
  const row = (attendance || []).find((x) => x && x.employeeId === id && x.date === today) || {};
  const day = T.dayOf(await T.load(), id, today);
  const works = !T.onLeave(appointments, id, today) && (!day || !!day.on);
  return { checkIn: row.checkIn || '', checkOut: row.checkOut || '', works, from: (day && day.on && day.from) || '' };
}

async function myBreakToday(id, today, appointments) {
  const T = require('./_lib/team-schedule');
  const [doc, cosm] = await Promise.all([T.load(), T.people()]);
  const b = T.breakOf(doc, id, today, { appts: appointments.filter((a) => a && a.date === today), ids: new Set(cosm.map((p) => p.id)) });
  return b ? { from: b.from, to: b.to, on: b.on, why: b.why, moved: b.moved } : null;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireAuth(req, res);
  if (!session) return;

  try {
    const [employeesRaw, sales, appointments, configRaw, leads, offersAll, academyProgress, duesAll] = await Promise.all([
      readJSON('data/employees.json', []),
      readJSON('data/sales.json', []),
      readJSON('data/appointments.json', []),
      readJSON('data/config.json', null),
      readJSON('data/leads.json', []),
      loadOffers(readJSON, null),
      readJSON('data/academy-progress.json', {}),
      readJSON('data/client-dues.json', []),
    ]);
    // the commission on the money received (_lib/commission.js), read once for every person and month below
    const cctx = CM.context(sales, duesAll, employeesRaw);

    const config = configRaw || defaultConfig();
    const today = todayISO();
    const month = today.slice(0, 7);

    // Resolve "me" - either a real employee row, or the synthetic bootstrap admin.
    let me;
    if (session.employeeId === 'admin' && session.role === 'admin') {
      // the bootstrap owner keeps name / photo / preferences in data/admin-profile.json (Contul meu)
      me = employeesRaw.find((e) => e.id === 'admin') || Object.assign({ id: 'admin', name: 'Admin', location: '-', role: 'admin' },
        await readJSON('data/admin-profile.json', {}), { id: 'admin', role: 'admin' });
    } else {
      me = employeesRaw.find((e) => e.id === session.employeeId);
      if (!me || me.active === false) {
        clearSessionCookie(res); // or the login page would send her back here, for ever
        res.status(401).json({ error: 'account_inactive' });
        return;
      }
    }

    const isAdmin = session.role === 'admin';
    // A cosmetician works in one city: she sees only its payments and appointments (the clinic's
    // overall goal still counts both cities).
    const city = await cityOf(session, readJSON, employeesRaw); // a cosmetician: her city; a manager: the list of her clinics
    const manages = Array.isArray(city) ? city : null;
    const activeEmployees = employeesRaw.filter((e) => e.active !== false);

    // Commission sales only (source !== 'incasare'; legacy entries from before this
    // field existed have no `source` at all and are treated as 'comision' as well).
    // each upsell with what it has brought so far (from November 2026: 4% of each payment received; _lib/commission.js)
    const comisionSales = sales.filter((s) => s.source !== 'incasare').map((s) => (CM.isUpsellReq(s) ? Object.assign({}, s, { cash: CM.summaryOf(s, cctx) }) : s));
    const incasareSales = sales.filter((s) => s.source === 'incasare');

    // Company goal progress: everything the clinic took in this month (Încasări, both locations).
    const companyApprovedTotal = incasareSales
      .filter((s) => monthKey(s.date) === month)
      .reduce((sum, s) => sum + Number(s.amount || 0), 0);

    // Race bonus leaderboard: count of approved sales in the target category this month,
    // per employee, regardless of role/location (everyone can see where they stand).
    const raceCategory = normalizeCategories(config.raceBonus.category)[0] || 'faciale';
    // Targets carry over month to month; progress is always the current month's.
    const raceMonth = month;
    // Counted from Încasări: every paid treatment in the category, credited to whoever did it.
    const raceCounts = {};
    incasareSales.forEach((s) => {
      if (s.performedBy && s.kind !== 'refund' && monthKey(s.date) === raceMonth && categoriesOf(s).includes(raceCategory)) {
        raceCounts[s.performedBy] = (raceCounts[s.performedBy] || 0) + 1;
      }
    });
    const leaderboard = activeEmployees
      .filter((e) => e.id !== 'admin' && e.role !== 'admin' && ((e.role !== 'receptie' && e.role !== 'manager') || raceCounts[e.id]))
      .map((e) => ({
        employeeId: e.id,
        name: e.name,
        location: e.location,
        count: raceCounts[e.id] || 0,
      }))
      .sort((a, b) => b.count - a.count);

    // My own commission log ("Comision" tab), never includes "încasare" bookkeeping
    // entries, even ones I personally recorded at the register.
    const mySales = comisionSales
      .filter((s) => s.employeeId === me.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    // Shared "Tabel de încasări" - visible to every authenticated role, read-only for
    // non-admins. Only `source: 'incasare'` entries, so commission claims never show here.
    // what was refunded of each payment (_lib/refunds.js): Încasări marks it „rambursat parțial / integral”
    const refundedBy = new Map();
    incasareSales.forEach((r) => { if (r.kind === 'refund') (r.from || []).forEach((p) => refundedBy.set(p.saleId, Math.round(((refundedBy.get(p.saleId) || 0) + Number(p.lei || 0)) * 100) / 100)); });
    const incasari = incasareSales
      .map((s) => {
        const recorder = employeesRaw.find((e) => e.id === s.employeeId);
        const performer = employeesRaw.find((e) => e.id === s.performedBy);
        return {
          ...s,
          categories: categoriesOf(s),
          // its clinic written one way (Timișoara / Arad, whatever the spelling: api/_lib/clinic.js), so the manager's clinics keep it
          location: clinicOf(s.location) || clinicOf(performer && performer.location) || s.location || (recorder && recorder.location) || '',
          ...(refundedBy.get(s.id) ? { refunded: refundedBy.get(s.id) } : {}),
          employeeName: recorder ? recorder.name : s.employeeId,
          performedByName: performer ? performer.name : (s.performedBy || '-'),
        };
      })
      .filter((s) => inCity(city, s.location))
      // a cosmetician (16.11): her own rows whole, the city's only as totals: never who did a colleague's treatment or its
      // parts, from which a colleague's commission could be worked out
      .map((s) => (me.role !== 'cosmetician' || s.performedBy === me.id ? s : Object.assign({}, s, {
        performedBy: '', performedByName: '-', parts: undefined, upsellWhat: undefined,
        employeeId: s.employeeId === me.id ? s.employeeId : '', employeeName: s.employeeId === me.id ? s.employeeName : '-',
      })))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    // Calendar, today's appointments (time order) for the Panou "azi" glance, plus
    // aggregate counts and the logged-in employee's own counts (by assigned
    // cosmetician) for the Panou widget. The full Calendar (day/week views, all dates)
    // is fetched directly from api/portal-appointments.js by portal.html, not here.
    let todaysAppointments = appointments
      .filter((a) => a.date === today && a.status !== 'concediu' && (inCity(city, clinicOf(a.location) || a.location) || (me.role === 'cosmetician' && a.cosmeticianId === me.id))) // leave and blocked time aren't visits; a cosmetician's own in the other clinic too (16.11)
      .slice()
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    // a package session: „Ședința 3 din 6” on her list (api/_lib/package-next.js)
    if (todaysAppointments.some((a) => a.package)) {
      try { const pkgOf = require('./_lib/package-next').sessionOf(sales, appointments); todaysAppointments.forEach((a, i) => { const p = a.package && pkgOf(a); if (p) todaysAppointments[i] = Object.assign({}, a, { pkg: p }); }); }
      catch (err) { console.error('portal-data pkg:', err.message); }
    }
    const countsToday = emptyStatusCounts();
    const myCountsToday = emptyStatusCounts();
    todaysAppointments.forEach((a) => {
      if (APPOINTMENT_STATUSES.includes(a.status)) {
        countsToday[a.status] += 1;
        if (a.cosmeticianId === me.id) myCountsToday[a.status] += 1;
      }
    });

    // Individual goals (Panou), up to 2 per employee, set by the admin in Setări →
    // Angajați. Computed live here except for 'manual' goals.
    const myGoals = (me.goals || []).map((g) => ({
      title: g.title,
      metric: g.metric,
      target: g.target,
      reward: Number(g.reward) || 0,
      current: computeGoalCurrent(g, me.id, sales, appointments, today, month, { leads, name: me.name, emp: me, dues: duesAll, cctx }),
    }));

    // ---- everything else this answer reads, in one go: they were read one after another (up to eight waits on the store
    // in a row, on every load and every refresh of the portal, 13.11: „aplicația se încarcă foarte greu”)
    const front = isAdmin || me.role === 'receptie' || me.role === 'manager';
    const [attendanceAll, tbAll, waConvos, igUnread, myNotes, liveCfg, devices, mgrFinals] = await Promise.all([
      readJSON('data/attendance.json', []), TB.loadAll(readJSON), readJSON('data/whatsapp-conversations.json', []),
      // the clinic's Instagram (both clinics'), for whoever answers Mesaje
      front ? require('./_lib/social-inbox').unread().catch(() => 0) : 0,
      myNotifications({ readJSON }, me.id), live.publicConfig(), isAdmin ? deviceCounts({ readJSON }) : null,
      // the managers' bonuses the owner confirmed at month close (_lib/manager-pay.js), counted in their pay
      isAdmin || me.role === 'manager' ? readJSON('data/manager-bonus.json', {}) : {},
    ]);

    // ---- Salariu: what each person takes home (salary + overtime + commission or booking bonus)
    const monthsBack = (n) => { const out = []; let y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)); for (let i = 0; i < n; i++) { out.push(y + '-' + String(m).padStart(2, '0')); m -= 1; if (!m) { m = 12; y -= 1; } } return out; };
    const payOf = (emp, m) => PAY.monthPay({ emp, month: m, isCurrent: m === month, sales, dues: duesAll, cctx, payouts: tbAll.payouts, bank: m === month ? TB.ledger(emp.id, tbAll) : null, attendance: attendanceAll, appointments, finals: mgrFinals || {} });
    const salary = isAdmin ? null : { months: monthsBack(6).map((m) => payOf(me, m)), rule: { rate: UPSELL_RATE, cost: COST_SHARE, tiers: PAY.BOOKING_TIERS },
      // a cosmetician's own row of the 1.500 lei a day (net of the refunds, this month up to today): hers only
      ...(me.role === 'cosmetician' ? { dayTarget: require('./_lib/manager-pay').myDayTarget(me, sales, attendanceAll, month, today) } : {}) };

    // Bell reminders for the booking bonus (reception): the step reached, and the next one when
    // it's close (within 3 a day), the tone following the days left in the month. One short line.
    const bonusNotes = salary && !(salary.months[0].booking || {}).frozen ? bookingNotes(salary.months[0].booking, month, today) : []; // frozen: the manager's, no reminders

    // Mesaje: unread client messages, as Mesaje lists them (reception: one desk for both clinics, as _lib/city.js; the
    // manager: her clinics), and Instagram's
    const myCity = manages || '';
    // the hiring chats (job ads' candidates) are George's and the manager's: not in anyone else's count (as in Mesaje)
    const hire = isAdmin || me.role === 'manager' ? null : new Set((await readJSON('data/candidates.json', [])).filter((x) => x && !x.test).map((x) => String(x.phone || '').replace(/\D/g, '').slice(-9)).filter((x) => x.length === 9));
    const waUnread = waConvos.filter((c) => c.unreadCount && inCity(myCity, c.location) && !(hire && hire.has(String(c.phone || '').replace(/\D/g, '').slice(-9)))).length + igUnread;
    const payload = {
      // the owner gets the alerts meant for it (new leads); the team also its bonus reminders
      waUnread,
      notifications: isAdmin ? myNotes : bonusNotes.concat(myNotes),
      salary,
      me: { id: me.id, name: me.name, location: me.location, role: me.role, username: me.username || '', photo: photoOf(me), prefs: me.prefs || {} },
      city: manages ? null : city, // set = this account is limited to one city (cosmeticians)
      manages, // the manager: the clinics she runs (her views and lists stay inside them)
      companyGoal: {
        target: config.companyGoal.target,
        reward: config.companyGoal.reward,
        month,
        // what the clinics took in this month: the owner's number only
        ...(isAdmin ? { current: companyApprovedTotal } : {}),
      },
      raceBonus: {
        category: raceCategory,
        target: config.raceBonus.target,
        reward: config.raceBonus.reward,
        month: raceMonth,
        leaderboard,
      },
      // One commission rule: upsell - 60% costs, 10% of the profit (K.commissionOf in the portal).
      upsellRate: UPSELL_RATE,
      costShare: COST_SHARE,
      mySales,
      incasari,
      // the people who left (name and last day): the Calendar still names them on their appointments, to give to someone else
      leftEmployees: isAdmin || me.role === 'receptie' || me.role === 'manager' ? employeesRaw.filter((e) => e && e.active === false && e.id !== 'admin' && (!manages || inCity(manages, e.location)))
        .map((e) => ({ id: e.id, name: e.name, location: e.location, role: e.role, leftAt: e.leftAt || '' })) : [],
      activeEmployees: activeEmployees.filter((e) => !manages || e.role === 'admin' || e.id === me.id || inCity(manages, e.location)).map((e) => ({ id: e.id, name: e.name, location: e.location, role: e.role, photo: photoOf(e) })),
      appointmentsToday: {
        list: todaysAppointments,
        countsToday,
        myCountsToday,
        // a cosmetician's own break today (Panou: „Pauza ta: 14:30-15:00”), from her shift (_lib/team-schedule.js)
        myBreak: me.role === 'cosmetician' ? await myBreakToday(me.id, today, appointments).catch(() => null) : null,
      },
      myClock: isAdmin || session.viewer ? null : await myClockToday(me.id, today, attendanceAll, appointments).catch(() => null),
      myGoals,
      // Traininguri: every manual for everyone (the goal: everyone sells). The team sees the sheets and cases the
      // owner checked, without the answers; the owner sees everything and everyone's progress.
      academy: isAdmin ? mergeAcademy(config.academy) : forStaff(mergeAcademy(config.academy), academyProgress[me.id]),
      academyProgress: isAdmin ? academyProgress : { [me.id]: academyProgress[me.id] || null },
      // Active offers from the shared source, same list the public site and Creative use.
      offers: offersAll.filter((o) => o.active).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0)).map((o) => ({
        id: o.id, key: o.key, title: o.title, description: o.description || '', priceNew: Number(o.priceNew) || 0, priceOld: Number(o.priceOld) || 0,
        discountPercent: discountOf(o), category: o.category, locations: o.locations, ads: !!o.ads, guarantee: o.guarantee || '', featured: !!o.featured,
      })),
      isAdmin,
      // the manager (both clinics): reception's screens plus the team and her Manager page (api/_lib/roles.js)
      isManager: me.role === 'manager',
      // instant sync: where this portal listens for "the data changed" (Supabase Realtime), when it is set up
      live: liveCfg,
      // Set while the owner previews this employee's account (read-only, banner + "Înapoi la Admin").
      impersonating: !!session.viewer,
    };

    if (isAdmin) {
      payload.admin = {
        // Echipa > Salarii: this month's pay of every active person
        payroll: employeesRaw.filter((e) => e.id !== 'admin' && e.role !== 'admin').map((e) => Object.assign({ id: e.id, name: e.name, role: e.role, location: e.location, photo: photoOf(e), netSalary: PAY.salaryOn(e, today), active: e.active !== false }, payOf(e, month)))
          .filter((r) => r.active || Number(r.total) > 0), // someone who left this month is still paid for it
        // waiting in Aprobări besides the commissions: days over / under 8 hours, leave requests
        // (the same two documents the time bank read above)
        pendingTime: (tbAll.adjustments || []).filter((a) => a.status === 'pending').length,
        pendingLeave: (tbAll.leaveRequests || []).filter((r) => r.status === 'pending').length,
        pendingSales: comisionSales
          .filter((s) => s.status === 'pending')
          .map((s) => {
            const emp = employeesRaw.find((e) => e.id === s.employeeId);
            return {
              ...s,
              employeeName: emp ? emp.name : s.employeeId,
              employeeLocation: emp ? emp.location : '-',
            };
          }),
        allSales: comisionSales.map((s) => {
          const emp = employeesRaw.find((e) => e.id === s.employeeId);
          return {
            ...s,
            employeeName: emp ? emp.name : s.employeeId,
            employeeLocation: emp ? emp.location : '-',
          };
        }),
        employees: employeesRaw.map((e) => ({
          id: e.id,
          pushDevices: devices[e.id] || 0,
          name: e.name,
          location: e.location,
          role: e.role,
          manages: e.role === 'manager' ? require('./_lib/roles').managesOf(e) : undefined,
          roleSince: e.roleSince || '',
          prevRole: e.prevRole || '',
          // the manager's probation (_lib/manager-pay.js): the salary after it, the day the salary last changed
          netSalaryAfter: Number(e.netSalaryAfter) || 0,
          netSalaryChangedAt: e.netSalaryChangedAt || '',
          // a cosmetician counts in the manager's bonus condition once she finished the official training (unset: yes)
          trainedOfficial: e.role === 'cosmetician' ? e.trainedOfficial !== false : undefined,
          username: e.username,
          photo: photoOf(e),
          // the salary in force today, and every salary with its day (Echipa: „de la ce dată”, a raise never rewrites the months before)
          netSalary: PAY.salaryOn(e, today),
          salaryHistory: PAY.salaryHistoryOf(e),
          payDay: Number(e.payDay) || 15, // the day her salary is paid (the owner's Plăți)
          phone: e.phone || '',
          email: e.email || '',
          active: e.active !== false,
          leftAt: e.active === false ? e.leftAt || '' : '', // her last working day („A plecat”); '' while she is with us (or turned off before 16.11)
          // Optional, feeds the Condică leave-balance / hours-owed numbers, edited in the
          // Profil tab below (api/portal-employees.js' update_details). Unset = the defaults.
          annualLeaveDays: e.annualLeaveDays,
          contractedHoursPerDay: e.contractedHoursPerDay,
          goals: (e.goals || []).map((g) => Object.assign({}, g, { current: computeGoalCurrent(g, e.id, sales, appointments, today, month, { leads, name: e.name, emp: e, dues: duesAll, cctx }) })),
        })),
        config,
      };
    }

    // Regulament intern (api/portal-regulament.js): the version in force not confirmed yet by her (a dot on its menu entry)
    try { const RG = require('./portal-regulament'); payload.regulament = { must: RG.pending(await RG.load(), me.id, me.role) }; payload.fisapost = { must: RG.pending(await RG.load(RG.DOCS.fisa), me.id, me.role, RG.DOCS.fisa) }; }
    catch (err) { console.error('portal-data regulament:', err.message); }

    // the manager: what waits for her decision (the team's days over / under 8 hours, the leave requests; never her own)
    if (me.role === 'manager') {
      const team = new Set(employeesRaw.filter((e) => e.id !== me.id && e.role !== 'admin' && inCity(manages, e.location)).map((e) => e.id));
      payload.manager = {
        pendingTime: (tbAll.adjustments || []).filter((a) => a.status === 'pending' && team.has(a.employeeId)).length,
        pendingLeave: (tbAll.leaveRequests || []).filter((r) => r.status === 'pending' && team.has(r.employeeId)).length,
        toFix: 0,
      };
      // Condică → De rezolvat (_lib/attendance-fix.js): the team's pontaj to fix, a small count on her Condică and Panou
      try {
        const FIX = require('./_lib/attendance-fix');
        const [schedule, requests, dismissed] = await Promise.all([require('./_lib/team-schedule').load(), readJSON(FIX.REQ, []), readJSON(FIX.DISMISS, {})]);
        payload.manager.toFix = FIX.problems({ attendance: attendanceAll, employees: employeesRaw, schedule, appts: appointments, leaveRequests: tbAll.leaveRequests,
          adjustments: tbAll.adjustments, requests, dismissed: (dismissed && dismissed.keys) || {} }, { team, today }).length;
      } catch (err) { console.error('portal-data toFix:', err.message); }
    }

    sendVersioned(res, payload, req.query && req.query.v);
  } catch (err) {
    console.error('portal-data error:', err.message);
    res.status(500).json({ error: 'data_failed' });
  }
};
