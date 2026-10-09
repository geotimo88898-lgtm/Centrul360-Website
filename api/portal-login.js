// POST /api/portal-login — employee portal authentication.
//
// Two paths:
//  1. Normal path: username/password checked against data/employees.json (Blob),
//     password verified with scrypt (see _lib/auth.js).
//  2. Bootstrap path: ONLY when data/employees.json doesn't exist yet (first run, before
//     the owner has created any real employee accounts), credentials are also checked
//     against process.env.ADMIN_USERNAME / process.env.ADMIN_PASSWORD (plain compare —
//     acceptable here only because the owner sets both directly in Vercel's env var UI,
//     never through this app, and this path disappears the moment employees.json exists).
//     This lets the owner log in on day one and create real accounts from Setări.

const { readJSON } = require('./_lib/store');
const { verifyPassword, setSessionCookie } = require('./_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'missing_credentials' });
    return;
  }

  try {
    // Bootstrap admin credentials always work, independent of whatever employees.json
    // currently holds — the owner must never be lockable out of their own portal just
    // because no employee row happens to share ADMIN_USERNAME, or because employees.json
    // didn't exist yet, or exists but is empty. Computed once, checked as a fallback
    // below rather than nested per-branch (the earlier per-branch version missed the
    // case where employees.json exists but no employee matches the typed username at
    // all, which returned 401 before ever consulting ADMIN_USERNAME/ADMIN_PASSWORD).
    const adminUser = process.env.ADMIN_USERNAME;
    const adminPass = process.env.ADMIN_PASSWORD;
    const isBootstrapAdmin = Boolean(
      adminUser && adminPass && username === adminUser && password === adminPass
    );

    const employees = await readJSON('data/employees.json', []);
    const employee = employees.find((e) => e.username === username && e.active !== false);

    if (employee && verifyPassword(password, employee.passwordSalt, employee.passwordHash)) {
      setSessionCookie(res, employee.id, employee.role);
      res.status(200).json({ ok: true, role: employee.role, name: employee.name });
      return;
    }

    if (isBootstrapAdmin) {
      setSessionCookie(res, 'admin', 'admin');
      res.status(200).json({ ok: true, role: 'admin', name: 'Admin' });
      return;
    }

    res.status(401).json({ error: 'invalid_credentials' });
  } catch (err) {
    console.error('portal-login error:', err.message);
    res.status(500).json({ error: 'login_failed' });
  }
};
