// GET /api/portal-data — the single role-aware payload that drives the whole portal.html
// SPA shell. Requires a valid session; a logged-out/expired visitor gets 401 and the
// client redirects to /portal-login.

const { readJSON } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const { defaultConfig, currentMonth } = require('./_lib/defaults');

// Daily mandatory task checklists per role. Plain static content — no need for these to
// live in Blob since they don't change often; checkbox state itself is kept client-side
// (sessionStorage), per the spec (no server-side persistence needed for this).
const DAILY_TASKS = {
  cosmetician: [
    'Verifică programările zilei și pregătește cabina/aparatele necesare.',
    'Dezinfectează suprafețele și aparatele după fiecare client.',
    'Completează fișa de client pentru fiecare tratament efectuat.',
    'Loghează fiecare vânzare proprie în tab-ul „Comision" până la finalul zilei.',
    'Recomandă cel puțin un upsell relevant per client (vezi tab „Resurse").',
  ],
  receptie: [
    'Confirmă telefonic sau prin mesaj programările pentru ziua următoare.',
    'Actualizează statusul fiecărei programări (confirmată/anulată/reprogramată) în tab-ul „Calendar".',
    'Încasează fiecare client plătitor în tab-ul „Încasează client" — înlocuiește fișa de hârtie.',
    'Răspunde la solicitările de programare în maxim 15 minute.',
    'Predă la final de zi situația încasărilor către management (vezi „Tabel de încasări").',
  ],
  admin: [
    'Verifică vânzările în așteptare și aprobă/respinge-le în tab-ul „Aprobări".',
    'Urmărește progresul obiectivului de companie pentru luna curentă.',
    'Verifică dacă regulile de comision și bonusurile sunt actuale.',
  ],
};

// The full set of statuses an appointment can carry on the new shared Calendar (see
// api/portal-appointments.js). 'programata' is the default for a freshly booked slot.
const APPOINTMENT_STATUSES = ['programata', 'confirmata', 'anulata', 'reprogramata', 'finalizata'];

function monthKey(dateStr) {
  // dateStr expected as YYYY-MM-DD; returns YYYY-MM.
  return (dateStr || '').slice(0, 7);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
// not by who created/logged the row — the Calendar is shared, so creation and
// assignment are no longer the same thing they were under the old same-day log.
function computeGoalCurrent(goal, employeeId, sales, appointments, today, month) {
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
    const [employeesRaw, sales, appointments, configRaw] = await Promise.all([
      readJSON('data/employees.json', []),
      readJSON('data/sales.json', []),
      readJSON('data/appointments.json', []),
      readJSON('data/config.json', null),
    ]);

    const config = configRaw || defaultConfig();
    const month = currentMonth();
    const today = todayISO();

    // Resolve "me" — either a real employee row, or the synthetic bootstrap admin.
    let me;
    if (session.employeeId === 'admin' && session.role === 'admin') {
      me = employeesRaw.find((e) => e.id === 'admin') || {
        id: 'admin',
        name: 'Admin',
        location: '—',
        role: 'admin',
      };
    } else {
      me = employeesRaw.find((e) => e.id === session.employeeId);
      if (!me || me.active === false) {
        res.status(401).json({ error: 'not_authenticated' });
        return;
      }
    }

    const isAdmin = session.role === 'admin';
    const activeEmployees = employeesRaw.filter((e) => e.active !== false);

    // Commission sales only (source !== 'incasare'; legacy entries from before this
    // field existed have no `source` at all and are treated as 'comision' as well).
    const comisionSales = sales.filter((s) => s.source !== 'incasare');
    const incasareSales = sales.filter((s) => s.source === 'incasare');

    // Company goal progress: sum of approved COMMISSION sales this month, across both
    // locations. "Încasare" entries are pure bookkeeping and never count here, so the
    // same money is never counted twice toward goals/bonuses.
    const approvedThisMonth = comisionSales.filter(
      (s) => s.status === 'approved' && monthKey(s.date) === config.companyGoal.month
    );
    const companyApprovedTotal = approvedThisMonth.reduce((sum, s) => sum + Number(s.amount || 0), 0);

    // Race bonus leaderboard: count of approved sales in the target category this month,
    // per employee, regardless of role/location (everyone can see where they stand).
    const raceCategory = config.raceBonus.category;
    const raceMonth = config.raceBonus.month;
    const raceCounts = {};
    comisionSales.forEach((s) => {
      if (s.status === 'approved' && s.category === raceCategory && monthKey(s.date) === raceMonth) {
        raceCounts[s.employeeId] = (raceCounts[s.employeeId] || 0) + 1;
      }
    });
    const leaderboard = activeEmployees
      .map((e) => ({
        employeeId: e.id,
        name: e.name,
        location: e.location,
        count: raceCounts[e.id] || 0,
      }))
      .sort((a, b) => b.count - a.count);

    // My own commission log ("Comision" tab) — never includes "încasare" bookkeeping
    // entries, even ones I personally recorded at the register.
    const mySales = comisionSales
      .filter((s) => s.employeeId === me.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    // Shared "Tabel de încasări" — visible to every authenticated role, read-only for
    // non-admins. Only `source: 'incasare'` entries, so commission claims never show here.
    const incasari = incasareSales
      .map((s) => {
        const recorder = employeesRaw.find((e) => e.id === s.employeeId);
        const performer = employeesRaw.find((e) => e.id === s.performedBy);
        return {
          ...s,
          employeeName: recorder ? recorder.name : s.employeeId,
          performedByName: performer ? performer.name : (s.performedBy || '—'),
        };
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    // Calendar — today's appointments (time order) for the Panou "azi" glance, plus
    // aggregate counts and the logged-in employee's own counts (by assigned
    // cosmetician) for the Panou widget. The full Calendar (day/week views, all dates)
    // is fetched directly from api/portal-appointments.js by portal.html, not here.
    const todaysAppointments = appointments
      .filter((a) => a.date === today)
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

    // Individual goals (Panou) — up to 2 per employee, set by the admin in Setări →
    // Angajați. Computed live here except for 'manual' goals.
    const myGoals = (me.goals || []).map((g) => ({
      title: g.title,
      metric: g.metric,
      target: g.target,
      current: computeGoalCurrent(g, me.id, sales, appointments, today, month),
    }));

    const payload = {
      me: { id: me.id, name: me.name, location: me.location, role: me.role },
      tasks: DAILY_TASKS[me.role] || DAILY_TASKS.cosmetician,
      companyGoal: {
        target: config.companyGoal.target,
        reward: config.companyGoal.reward,
        month: config.companyGoal.month,
        current: companyApprovedTotal,
      },
      raceBonus: {
        category: raceCategory,
        target: config.raceBonus.target,
        reward: config.raceBonus.reward,
        month: raceMonth,
        leaderboard,
      },
      commissionRates: config.commissionRates,
      retailRate: config.retailRate,
      resources: config.resources,
      mySales,
      incasari,
      activeEmployees: activeEmployees.map((e) => ({ id: e.id, name: e.name, location: e.location })),
      appointmentsToday: {
        list: todaysAppointments,
        countsToday,
        myCountsToday,
      },
      myGoals,
      isAdmin,
    };

    if (isAdmin) {
      payload.admin = {
        pendingSales: comisionSales
          .filter((s) => s.status === 'pending')
          .map((s) => {
            const emp = employeesRaw.find((e) => e.id === s.employeeId);
            return {
              ...s,
              employeeName: emp ? emp.name : s.employeeId,
              employeeLocation: emp ? emp.location : '—',
            };
          }),
        allSales: comisionSales.map((s) => {
          const emp = employeesRaw.find((e) => e.id === s.employeeId);
          return {
            ...s,
            employeeName: emp ? emp.name : s.employeeId,
            employeeLocation: emp ? emp.location : '—',
          };
        }),
        employees: employeesRaw.map((e) => ({
          id: e.id,
          name: e.name,
          location: e.location,
          role: e.role,
          username: e.username,
          active: e.active !== false,
          goals: e.goals || [],
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
