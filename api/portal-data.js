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
    'Loghează fiecare vânzare în tab-ul „Vânzările mele" până la finalul zilei.',
    'Recomandă cel puțin un upsell relevant per client (vezi tab „Resurse").',
  ],
  receptie: [
    'Confirmă telefonic sau prin mesaj programările pentru ziua următoare.',
    'Verifică încasările zilei și completează fișele de printat pentru fiecare client plătitor.',
    'Răspunde la solicitările de programare în maxim 15 minute.',
    'Actualizează agenda cu eventualele anulări/reprogramări.',
    'Predă la final de zi situația încasărilor către management.',
  ],
  admin: [
    'Verifică vânzările în așteptare și aprobă/respinge-le în tab-ul „Aprobări".',
    'Urmărește progresul obiectivului de companie pentru luna curentă.',
    'Verifică dacă regulile de comision și bonusurile sunt actuale.',
  ],
};

function monthKey(dateStr) {
  // dateStr expected as YYYY-MM-DD; returns YYYY-MM.
  return (dateStr || '').slice(0, 7);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;

  try {
    const [employeesRaw, sales, configRaw] = await Promise.all([
      readJSON('data/employees.json', []),
      readJSON('data/sales.json', []),
      readJSON('data/config.json', null),
    ]);

    const config = configRaw || defaultConfig();
    const month = currentMonth();

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

    // Company goal progress: sum of approved sales this month, across both locations.
    const approvedThisMonth = sales.filter(
      (s) => s.status === 'approved' && monthKey(s.date) === config.companyGoal.month
    );
    const companyApprovedTotal = approvedThisMonth.reduce((sum, s) => sum + Number(s.amount || 0), 0);

    // Race bonus leaderboard: count of approved sales in the target category this month,
    // per employee, regardless of role/location (everyone can see where they stand).
    const raceCategory = config.raceBonus.category;
    const raceMonth = config.raceBonus.month;
    const raceCounts = {};
    sales.forEach((s) => {
      if (s.status === 'approved' && s.category === raceCategory && monthKey(s.date) === raceMonth) {
        raceCounts[s.employeeId] = (raceCounts[s.employeeId] || 0) + 1;
      }
    });
    const leaderboard = employeesRaw
      .filter((e) => e.active !== false)
      .map((e) => ({
        employeeId: e.id,
        name: e.name,
        location: e.location,
        count: raceCounts[e.id] || 0,
      }))
      .sort((a, b) => b.count - a.count);

    // My own sales (admin sees their own too, which will be empty unless they log sales).
    const mySales = sales
      .filter((s) => s.employeeId === me.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1));

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
      isAdmin,
    };

    if (isAdmin) {
      payload.admin = {
        pendingSales: sales
          .filter((s) => s.status === 'pending')
          .map((s) => {
            const emp = employeesRaw.find((e) => e.id === s.employeeId);
            return {
              ...s,
              employeeName: emp ? emp.name : s.employeeId,
              employeeLocation: emp ? emp.location : '—',
            };
          }),
        allSales: sales.map((s) => {
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
