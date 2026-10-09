// POST /api/portal-employees — admin-only employee management (Setări → Angajați).
// One endpoint, five actions via body.action: 'create' | 'update_details' |
// 'reset_password' | 'set_active' | 'set_goals'. Passwords are hashed server-side
// (scrypt, see _lib/auth.js) before ever touching storage.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { hashPassword } = require('./_lib/auth');

const VALID_ROLES = ['cosmetician', 'receptie', 'admin'];

// Up to 2 "obiective individuale" per employee (Setări → Angajați → edit → obiective).
// Non-manual metrics are computed live in portal-data.js from sales.json/appointments.json
// — only 'manual' goals carry a stored currentValue the admin edits by hand.
const MAX_GOALS = 4;
const VALID_GOAL_METRICS = [
  'programari_confirmate_azi',
  'programari_anulate_azi',
  'comision_aprobat_luna',
  'incasari_atribuite_luna',
  'programari_finalizate_luna',
  'vanzari_aprobate_luna',
  'incasari_inregistrate_luna',
  'leaduri_contactate_luna',
  'leaduri_programate_luna',
  'manual',
];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  const { action } = req.body || {};

  try {
    const employees = await readJSON('data/employees.json', []);

    if (action === 'create') {
      const { name, location, role, username, password } = req.body || {};
      if (!name || !location || !role || !username || !password) {
        res.status(400).json({ error: 'missing_fields' });
        return;
      }
      if (!VALID_ROLES.includes(role)) {
        res.status(400).json({ error: 'invalid_role' });
        return;
      }
      if (employees.some((e) => e.username === username)) {
        res.status(409).json({ error: 'username_taken' });
        return;
      }
      const { salt, hash } = hashPassword(password);
      const employee = {
        id: crypto.randomUUID(),
        name: String(name).slice(0, 100),
        location: String(location).slice(0, 100),
        role,
        username: String(username).slice(0, 60),
        passwordHash: hash,
        passwordSalt: salt,
        active: true,
      };
      employees.push(employee);
      await writeJSON('data/employees.json', employees);
      res.status(200).json({
        ok: true,
        employee: { id: employee.id, name: employee.name, location: employee.location, role: employee.role, username: employee.username, active: true },
      });
      return;
    }

    if (action === 'update_details') {
      // Fixes a typo'd name/location, or a role change (e.g. an employee moving
      // locations) — keeps the same id, so her login, goals and sales history stay
      // intact (unlike deactivating + re-creating, which would silently orphan them).
      const { employeeId, name, location, role } = req.body || {};
      if (!employeeId || !name || !location || !role) {
        res.status(400).json({ error: 'missing_fields' });
        return;
      }
      if (!VALID_ROLES.includes(role)) {
        res.status(400).json({ error: 'invalid_role' });
        return;
      }
      const employee = employees.find((e) => e.id === employeeId);
      if (!employee) {
        res.status(404).json({ error: 'employee_not_found' });
        return;
      }
      employee.name = String(name).slice(0, 100);
      employee.location = String(location).slice(0, 100);
      employee.role = role;
      await writeJSON('data/employees.json', employees);
      res.status(200).json({
        ok: true,
        employee: { id: employee.id, name: employee.name, location: employee.location, role: employee.role },
      });
      return;
    }

    if (action === 'reset_password') {
      const { employeeId, newPassword } = req.body || {};
      if (!employeeId || !newPassword) {
        res.status(400).json({ error: 'missing_fields' });
        return;
      }
      const employee = employees.find((e) => e.id === employeeId);
      if (!employee) {
        res.status(404).json({ error: 'employee_not_found' });
        return;
      }
      const { salt, hash } = hashPassword(newPassword);
      employee.passwordHash = hash;
      employee.passwordSalt = salt;
      await writeJSON('data/employees.json', employees);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'set_active') {
      const { employeeId, active } = req.body || {};
      if (!employeeId || typeof active !== 'boolean') {
        res.status(400).json({ error: 'missing_fields' });
        return;
      }
      const employee = employees.find((e) => e.id === employeeId);
      if (!employee) {
        res.status(404).json({ error: 'employee_not_found' });
        return;
      }
      employee.active = active;
      await writeJSON('data/employees.json', employees);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'set_goals') {
      const { employeeId, goals } = req.body || {};
      if (!employeeId || !Array.isArray(goals)) {
        res.status(400).json({ error: 'missing_fields' });
        return;
      }
      if (goals.length > MAX_GOALS) {
        res.status(400).json({ error: 'too_many_goals' });
        return;
      }
      const employee = employees.find((e) => e.id === employeeId);
      if (!employee) {
        res.status(404).json({ error: 'employee_not_found' });
        return;
      }

      const cleaned = [];
      for (const g of goals) {
        if (!g || !g.title || !VALID_GOAL_METRICS.includes(g.metric)) {
          res.status(400).json({ error: 'invalid_goal' });
          return;
        }
        const target = Number(g.target);
        if (!Number.isFinite(target) || target < 0) {
          res.status(400).json({ error: 'invalid_goal' });
          return;
        }
        // Optional bonus (lei) paid when the goal is reached — shown to the employee as "Bonusurile mele".
        const reward = Number(g.reward);
        const goal = { title: String(g.title).slice(0, 100), metric: g.metric, target, reward: Number.isFinite(reward) && reward > 0 ? Math.round(reward) : 0 };
        if (g.metric === 'manual') {
          const cur = Number(g.currentValue);
          goal.currentValue = Number.isFinite(cur) ? cur : 0;
        }
        cleaned.push(goal);
      }

      employee.goals = cleaned;
      await writeJSON('data/employees.json', employees);
      res.status(200).json({ ok: true, goals: cleaned });
      return;
    }

    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    console.error('portal-employees error:', err.message);
    res.status(500).json({ error: 'employees_failed' });
  }
};
