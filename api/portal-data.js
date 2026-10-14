// GET /api/portal-data, the single role-aware payload that drives the whole portal.html
// SPA shell. Requires a valid session; a logged-out/expired visitor gets 401 and the
// client redirects to /portal-login.

const { readJSON } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const { defaultConfig } = require('./_lib/defaults');
const { categoriesOf, normalizeCategories, UPSELL_RATE, COST_SHARE } = require('./_lib/cats');
const { cityOf, inCity } = require('./_lib/city');
const { photoUrl } = require('./portal-account');
const { mine: myNotifications } = require('./_lib/notify');
const TB = require('./_lib/timebank');
const PAY = require('./_lib/payroll');
const { bookingNotes } = require('./_lib/bonus');
const { deviceCounts } = require('./_lib/push');
// Profile photo (Contul meu) of an employee row, as a URL the portal can show.
const photoOf = (e) => (e && e.photo ? photoUrl(Object.assign({ id: e.id }, e.photo)) : '');
const { mergeAcademy, forStaff } = require('./_lib/academy');
const { loadOffers, discountOf } = require('./_lib/offers');

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
    case 'comision_aprobat_luna':
      return sales
        .filter(
          (s) =>
            s.source !== 'incasare' &&
            s.employeeId === employeeId &&
            s.status === 'approved' &&
            monthKey(s.date) === month
        )
        .reduce((sum, s) => sum + Number(s.commission || 0), 0);
    case 'incasari_atribuite_luna':
      return sales
        .filter((s) => s.source === 'incasare' && s.performedBy === employeeId && monthKey(s.date) === month)
        .reduce((sum, s) => sum + Number(s.amount || 0), 0);
    case 'programari_finalizate_luna':
      return appointments.filter((a) => a.cosmeticianId === employeeId && a.status === 'finalizata' && monthKey(a.date) === month).length;
    case 'vanzari_aprobate_luna':
      return sales.filter((s) => s.source !== 'incasare' && s.employeeId === employeeId && s.status === 'approved' && monthKey(s.date) === month).length;
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

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;

  try {
    const [employeesRaw, sales, appointments, configRaw, leads, offersAll, academyProgress] = await Promise.all([
      readJSON('data/employees.json', []),
      readJSON('data/sales.json', []),
      readJSON('data/appointments.json', []),
      readJSON('data/config.json', null),
      readJSON('data/leads.json', []),
      loadOffers(readJSON, null),
      readJSON('data/academy-progress.json', {}),
    ]);

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
        res.status(401).json({ error: 'not_authenticated' });
        return;
      }
    }

    const isAdmin = session.role === 'admin';
    // A cosmetician works in one city: she sees only its payments and appointments (the clinic's
    // overall goal still counts both cities).
    const city = await cityOf(session, readJSON, employeesRaw);
    const activeEmployees = employeesRaw.filter((e) => e.active !== false);

    // Commission sales only (source !== 'incasare'; legacy entries from before this
    // field existed have no `source` at all and are treated as 'comision' as well).
    const comisionSales = sales.filter((s) => s.source !== 'incasare');
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
      if (s.performedBy && monthKey(s.date) === raceMonth && categoriesOf(s).includes(raceCategory)) {
        raceCounts[s.performedBy] = (raceCounts[s.performedBy] || 0) + 1;
      }
    });
    const leaderboard = activeEmployees
      .filter((e) => e.role !== 'receptie' || raceCounts[e.id])
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
    const incasari = incasareSales
      .map((s) => {
        const recorder = employeesRaw.find((e) => e.id === s.employeeId);
        const performer = employeesRaw.find((e) => e.id === s.performedBy);
        return {
          ...s,
          categories: categoriesOf(s),
          location: s.location || (performer && performer.location) || (recorder && recorder.location) || '',
          employeeName: recorder ? recorder.name : s.employeeId,
          performedByName: performer ? performer.name : (s.performedBy || '-'),
        };
      })
      .filter((s) => inCity(city, s.location))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    // Calendar, today's appointments (time order) for the Panou "azi" glance, plus
    // aggregate counts and the logged-in employee's own counts (by assigned
    // cosmetician) for the Panou widget. The full Calendar (day/week views, all dates)
    // is fetched directly from api/portal-appointments.js by portal.html, not here.
    const todaysAppointments = appointments
      .filter((a) => a.date === today && inCity(city, a.location))
      .slice()
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
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
      current: computeGoalCurrent(g, me.id, sales, appointments, today, month, { leads, name: me.name }),
    }));

    // ---- Salariu: what each person takes home (salary + overtime + commission or booking bonus)
    const [attendanceAll, tbAll] = await Promise.all([readJSON('data/attendance.json', []), TB.loadAll(readJSON)]);
    const monthsBack = (n) => { const out = []; let y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)); for (let i = 0; i < n; i++) { out.push(y + '-' + String(m).padStart(2, '0')); m -= 1; if (!m) { m = 12; y -= 1; } } return out; };
    const payOf = (emp, m) => PAY.monthPay({ emp, month: m, isCurrent: m === month, sales, payouts: tbAll.payouts, bank: m === month ? TB.ledger(emp.id, tbAll) : null, attendance: attendanceAll, appointments });
    const salary = isAdmin ? null : { months: monthsBack(6).map((m) => payOf(me, m)), rule: { rate: UPSELL_RATE, cost: COST_SHARE, tiers: PAY.BOOKING_TIERS } };

    // Bell reminders for the booking bonus (reception): the step reached, and the next one when
    // it's close (within 3 a day), the tone following the days left in the month. One short line.
    const bonusNotes = salary ? bookingNotes(salary.months[0].booking, month, today) : [];

    // Mesaje: unread client messages (reception: those of her city and the ones not tied to a city)
    const waConvos = await readJSON('data/whatsapp-conversations.json', []);
    const myCity = !isAdmin && me.role === 'receptie' ? me.location : '';
    const waUnread = waConvos.filter((c) => c.unreadCount && (!myCity || !c.location || c.location === myCity)).length;
    const payload = {
      // the owner gets the alerts meant for it (new leads); the team also its bonus reminders
      waUnread,
      notifications: isAdmin ? await myNotifications({ readJSON }, me.id) : bonusNotes.concat(await myNotifications({ readJSON }, me.id)),
      salary,
      me: { id: me.id, name: me.name, location: me.location, role: me.role, username: me.username || '', photo: photoOf(me), prefs: me.prefs || {} },
      city, // set = this account is limited to one city (cosmeticians)
      companyGoal: {
        target: config.companyGoal.target,
        reward: config.companyGoal.reward,
        month,
        current: companyApprovedTotal,
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
      activeEmployees: activeEmployees.map((e) => ({ id: e.id, name: e.name, location: e.location, role: e.role, photo: photoOf(e) })),
      appointmentsToday: {
        list: todaysAppointments,
        countsToday,
        myCountsToday,
      },
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
      // Set while the owner previews this employee's account (read-only, banner + "Înapoi la Admin").
      impersonating: !!session.viewer,
    };

    if (isAdmin) {
      const devices = await deviceCounts({ readJSON });
      payload.admin = {
        // Echipa > Salarii: this month's pay of every active person
        payroll: activeEmployees.filter((e) => e.id !== 'admin' && e.role !== 'admin').map((e) => Object.assign({ id: e.id, name: e.name, role: e.role, location: e.location, photo: photoOf(e), netSalary: Number(e.netSalary) || 0 }, payOf(e, month))),
        // waiting in Aprobări besides the commissions: days over / under 8 hours, leave requests
        pendingTime: (await readJSON('data/time-adjust.json', [])).filter((a) => a.status === 'pending').length,
        pendingLeave: (await readJSON('data/leave-requests.json', [])).filter((r) => r.status === 'pending').length,
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
          username: e.username,
          photo: photoOf(e),
          netSalary: Number(e.netSalary) || 0,
          phone: e.phone || '',
          email: e.email || '',
          active: e.active !== false,
          // Optional, feeds the Condică leave-balance / hours-owed numbers, edited in the
          // Profil tab below (api/portal-employees.js' update_details). Unset = the defaults.
          annualLeaveDays: e.annualLeaveDays,
          contractedHoursPerDay: e.contractedHoursPerDay,
          goals: (e.goals || []).map((g) => Object.assign({}, g, { current: computeGoalCurrent(g, e.id, sales, appointments, today, month, { leads, name: e.name }) })),
        })),
        config,
      };
    }

    res.status(200).json(payload);
  } catch (err) {
    console.error('portal-data error:', err.message);
    res.status(500).json({ error: 'data_failed' });
  }
};
