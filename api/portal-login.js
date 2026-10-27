// POST /api/portal-login, employee portal authentication.
//
// Two paths:
//  1. Normal path: username/password checked against data/employees.json (Blob),
//     password verified with scrypt (see _lib/auth.js).
//  2. Bootstrap path: ONLY when data/employees.json doesn't exist yet (first run, before
//     the owner has created any real employee accounts), credentials are also checked
//     against process.env.ADMIN_USERNAME / process.env.ADMIN_PASSWORD (plain compare, 
//     acceptable here only because the owner sets both directly in Vercel's env var UI,
//     never through this app, and this path disappears the moment employees.json exists).
//     This lets the owner log in on day one and create real accounts from Setări.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { hashPassword, verifyPassword, setSessionCookie, getSession, renew, OWNER_ALIASES } = require('./_lib/auth');

const TRIES_KEY = 'data/login-attempts.json';
const MAX_TRIES = 5, TRY_WINDOW = 15 * 60e3;

module.exports = async (req, res) => {
  res.req = res.req || req; // cookie scope follows the host (see _lib/auth.js cookieDomain)
  // GET: is this browser still signed in? The login page asks, and a signed-in person goes straight
  // into the portal (the phone app used to open on the form every time, which looked like a logout).
  if (req.method === 'GET') {
    const session = getSession(req);
    if (session && !session.viewer) renew(res, session);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ signedIn: !!session });
    return;
  }
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
    // currently holds, the owner must never be lockable out of their own portal just
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
    // the exact spelling first, then any capitals when only one account has that name
    const typed = String(username).trim().toLowerCase();
    // five wrong passwords in 15 minutes: that name waits (the portal's address and the first-name logins are no secret)
    const tries = (await readJSON(TRIES_KEY, {}).catch(() => ({}))) || {};
    const tr = tries[typed];
    if (tr && tr.n >= MAX_TRIES && Date.now() - Date.parse(tr.at) < TRY_WINDOW) { res.status(429).json({ error: 'too_many_attempts' }); return; }
    const wrong = async () => {
      const cur = tr && Date.now() - Date.parse(tr.at) < TRY_WINDOW ? tr.n : 0;
      tries[typed] = { n: cur + 1, at: new Date().toISOString() };
      Object.keys(tries).forEach((k) => { if (Date.now() - Date.parse(tries[k].at) > TRY_WINDOW) delete tries[k]; });
      await writeJSON(TRIES_KEY, tries, { quiet: true }).catch(() => {});
    };
    const right = async () => { if (tr) { delete tries[typed]; await writeJSON(TRIES_KEY, tries, { quiet: true }).catch(() => {}); } };
    const sameName = employees.filter((e) => String(e.username || '').toLowerCase() === typed && e.active !== false);
    const employee = employees.find((e) => e.username === username && e.active !== false) || (sameName.length === 1 ? sameName[0] : null);

    if (employee && verifyPassword(password, employee.passwordSalt, employee.passwordHash)) {
      await right();
      setSessionCookie(res, employee.id, employee.role);
      res.status(200).json({ ok: true, role: employee.role, name: employee.name });
      return;
    }

    // George: a second admin account of his own (own name, photo, password), same powers as the owner.
    // Made the first time he signs in with the owner's password; after that it's an account like any other.
    if (!employee && OWNER_ALIASES.includes(typed) && adminPass && password === adminPass && !employees.some((e) => String(e.username || '').toLowerCase() === typed)) {
      const { salt, hash } = hashPassword(password);
      const george = { id: crypto.randomUUID(), name: typed.charAt(0).toUpperCase() + typed.slice(1), location: '-', role: 'admin',
        username: typed.charAt(0).toUpperCase() + typed.slice(1), passwordHash: hash, passwordSalt: salt, active: true, createdAt: new Date().toISOString() };
      employees.push(george);
      await writeJSON('data/employees.json', employees);
      setSessionCookie(res, george.id, 'admin');
      res.status(200).json({ ok: true, role: 'admin', name: george.name });
      return;
    }

    if (isBootstrapAdmin) {
      await right();
      setSessionCookie(res, 'admin', 'admin');
      res.status(200).json({ ok: true, role: 'admin', name: 'Admin' });
      return;
    }

    // the right password of an account switched off in Echipa: said as it is, not as a wrong password
    const off = employees.find((e) => String(e.username || '').toLowerCase() === typed && e.active === false);
    if (off && verifyPassword(password, off.passwordSalt, off.passwordHash)) { res.status(403).json({ error: 'account_inactive' }); return; }
    await wrong();
    res.status(401).json({ error: 'invalid_credentials' });
  } catch (err) {
    console.error('portal-login error:', err.message);
    res.status(500).json({ error: 'login_failed' });
  }
};
