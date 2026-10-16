// POST /api/portal-employees, admin-only employee management (Setări → Angajați).
// One endpoint, actions via body.action: 'create' | 'update_details' |
// 'reset_password' | 'set_active' | 'set_goals' | 'manual_list' | 'manual_add' | 'manual_delete' (Ajustări). Passwords are hashed server-side
// (scrypt, see _lib/auth.js) before ever touching storage.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { hashPassword } = require('./_lib/auth');
const TB = require('./_lib/timebank');
const { notify } = require('./_lib/notify');

// Echipa → Ajustări: what the automatic count missed or got wrong, set right by the owner. A commission is
// an approved line in data/sales.json (source 'manual', lei, plus or minus) counted in that month's pay; overtime
// is an approved difference in data/time-adjust.json (manual: true, minutes, plus or minus) that moves the
// overtime balance exactly like an approved day (it pays the hours to make up first). The person is told.
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const hm = (m) => { const a = Math.abs(m), h = Math.floor(a / 60), r = a % 60; return (m < 0 ? '-' : '+') + (h ? h + 'h' + (r ? ' ' + String(r).padStart(2, '0') : '') : r + ' min'); };
const leiTxt = (v) => (v > 0 ? '+' : '') + (Math.round(v * 100) / 100).toLocaleString('ro-RO') + ' lei';
async function manualList() {
  const [sales, adjs] = await Promise.all([readJSON('data/sales.json', []), readJSON(TB.ADJ, [])]);
  return sales.filter((s) => s.source === 'manual').map((s) => ({ id: s.id, kind: 'commission', employeeId: s.employeeId, date: s.date, value: Number(s.commission) || 0, note: s.note || '', by: s.addedBy || '', createdAt: s.createdAt }))
    .concat(adjs.filter((a) => a.manual).map((a) => ({ id: a.id, kind: 'overtime', employeeId: a.employeeId, date: a.date, value: Number(a.approvedMinutes) || 0, note: a.note || '', by: a.by || '', createdAt: a.createdAt })))
    .sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))).slice(0, 300);
}

const VALID_ROLES = ['cosmetician', 'receptie', 'admin'];

// Up to 2 "obiective individuale" per employee (Setări → Angajați → edit → obiective).
// Non-manual metrics are computed live in portal-data.js from sales.json/appointments.json
// - only 'manual' goals carry a stored currentValue the admin edits by hand.
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
      if (employees.some((e) => e.username === username) || require('./_lib/auth').OWNER_ALIASES.includes(String(username).trim().toLowerCase())) {
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
      if (role === 'receptie' || role === 'cosmetician') {
        const P = require('./_lib/academy-progress');
        await P.update(employee.id, (p) => { p.path = { role, start: P.todayRo() }; }).catch((err) => console.error('academy path:', err.message));
      }
      res.status(200).json({
        ok: true,
        employee: { id: employee.id, name: employee.name, location: employee.location, role: employee.role, username: employee.username, active: true },
      });
      return;
    }

    if (action === 'update_details') {
      // Fixes a typo'd name/location, or a role change (e.g. an employee moving
      // locations), keeps the same id, so her login, goals and sales history stay
      // intact (unlike deactivating + re-creating, which would silently orphan them).
      const { employeeId, name, location, role, annualLeaveDays, contractedHoursPerDay, netSalary } = req.body || {};
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
      // Optional, feed the "Condică" leave-balance / hours-owed numbers (api/portal-attendance.js,
      // action 'balance'). Left unset, those default to 21 days / 8h per day. Never required.
      if (annualLeaveDays !== undefined) {
        const n = Number(annualLeaveDays);
        if (!Number.isFinite(n) || n < 0 || n > 60) { res.status(400).json({ error: 'invalid_leave_days' }); return; }
        employee.annualLeaveDays = n;
      }
      // Salariul net (în mână), lei / month: the base of "Salariu" (_lib/payroll.js)
      if (netSalary !== undefined && netSalary !== '') {
        const n = Math.round(Number(netSalary));
        if (!Number.isFinite(n) || n < 0 || n > 100000) { res.status(400).json({ error: 'invalid_salary' }); return; }
        // the month the salary starts counting from (no salary shown in the months before it)
        if (n > 0 && !employee.netSalaryFrom) employee.netSalaryFrom = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date()).slice(0, 7);
        employee.netSalary = n;
      }
      if (contractedHoursPerDay !== undefined) {
        const n = Number(contractedHoursPerDay);
        if (!Number.isFinite(n) || n <= 0 || n > 16) { res.status(400).json({ error: 'invalid_hours' }); return; }
        employee.contractedHoursPerDay = n;
      }
      await writeJSON('data/employees.json', employees);
      res.status(200).json({
        ok: true,
        employee: { id: employee.id, name: employee.name, location: employee.location, role: employee.role, annualLeaveDays: employee.annualLeaveDays, contractedHoursPerDay: employee.contractedHoursPerDay, netSalary: employee.netSalary || 0 },
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

    if (action === 'manual_list') {
      res.status(200).json({ items: await manualList() });
      return;
    }
    if (action === 'manual_add') {
      const b = req.body || {};
      const emp = employees.find((e) => e.id === b.employeeId && e.id !== 'admin');
      if (!emp) { res.status(404).json({ error: 'employee_not_found' }); return; }
      const date = isDay(b.date) ? b.date : TB.bucharestNow().date;
      const note = String(b.note || '').trim().slice(0, 200);
      const now = new Date().toISOString();
      if (b.kind === 'commission') {
        const lei = Math.round(Number(b.value) * 100) / 100;
        if (!Number.isFinite(lei) || !lei || Math.abs(lei) > 50000) { res.status(400).json({ error: 'invalid_value' }); return; }
        const sales = await readJSON('data/sales.json', []);
        sales.push({ id: crypto.randomUUID(), source: 'manual', employeeId: emp.id, date, categories: [], category: '', treatment: 'Comision adăugat manual', amount: 0, commission: lei, note, clientId: '', client: '', status: 'approved', createdAt: now, decidedAt: now, addedBy: session.employeeId });
        await writeJSON('data/sales.json', sales);
        await notify({ readJSON, writeJSON }, emp.id, { kind: 'commission', tone: lei > 0 ? 'good' : 'info', title: (lei > 0 ? 'Comision adăugat: ' : 'Comision corectat: ') + leiTxt(lei), text: note || 'Adăugat de admin.', go: 'comision' });
      } else if (b.kind === 'overtime') {
        const minutes = Math.round(Number(b.value));
        if (!Number.isFinite(minutes) || !minutes || Math.abs(minutes) > 100 * 60) { res.status(400).json({ error: 'invalid_value' }); return; }
        const adjs = await readJSON(TB.ADJ, []);
        adjs.push({ id: crypto.randomUUID(), manual: true, employeeId: emp.id, date, minutes, approvedMinutes: minutes, worked: null, expected: null, weekend: false, location: emp.location || '', note, status: 'approved', createdAt: now, decidedAt: now, updatedAt: now, by: session.employeeId });
        await writeJSON(TB.ADJ, adjs);
        await notify({ readJSON, writeJSON }, emp.id, { kind: 'time', tone: minutes > 0 ? 'good' : 'info', title: (minutes > 0 ? 'Ore suplimentare adăugate: ' : 'Ore suplimentare corectate: ') + hm(minutes), text: note || 'Adăugate de admin.', go: 'condica' });
      } else { res.status(400).json({ error: 'invalid_kind' }); return; }
      res.status(200).json({ ok: true, items: await manualList() });
      return;
    }
    if (action === 'manual_delete') {
      const { kind, id } = req.body || {};
      if (kind === 'commission') {
        const sales = await readJSON('data/sales.json', []);
        const next = sales.filter((s) => !(s.id === id && s.source === 'manual'));
        if (next.length === sales.length) { res.status(404).json({ error: 'not_found' }); return; }
        await writeJSON('data/sales.json', next);
      } else if (kind === 'overtime') {
        const adjs = await readJSON(TB.ADJ, []);
        const next = adjs.filter((a) => !(a.id === id && a.manual));
        if (next.length === adjs.length) { res.status(404).json({ error: 'not_found' }); return; }
        await writeJSON(TB.ADJ, next);
      } else { res.status(400).json({ error: 'invalid_kind' }); return; }
      res.status(200).json({ ok: true, items: await manualList() });
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
        // Optional bonus (lei) paid when the goal is reached, shown to the employee as "Bonusurile mele".
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
