// /api/portal-impersonate — the owner previews an employee's account exactly as they see it.
//   POST   { employeeId }  admin only: switches this browser to that employee's session, read-only
//                          (see requireAuth), remembering the admin to switch back to.
//   DELETE                 back to the admin session.

const { readJSON } = require('./_lib/store');
const { getSession, setSessionCookie } = require('./_lib/auth');

module.exports = async (req, res) => {
  res.req = res.req || req; // cookie scope follows the host (see _lib/auth.js cookieDomain)
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'not_authenticated' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'POST') {
    if (session.role !== 'admin' || session.viewer) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const id = String((req.body && req.body.employeeId) || '');
    const employees = await readJSON('data/employees.json', []);
    const emp = employees.find((e) => e.id === id && e.active !== false);
    if (!emp || emp.role === 'admin') {
      res.status(404).json({ error: 'employee_not_found' });
      return;
    }
    setSessionCookie(res, emp.id, emp.role, session.employeeId);
    res.status(200).json({ ok: true, name: emp.name, role: emp.role });
    return;
  }

  if (req.method === 'DELETE') {
    if (!session.viewer) {
      res.status(400).json({ error: 'not_impersonating' });
      return;
    }
    setSessionCookie(res, session.viewer, 'admin');
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
};
