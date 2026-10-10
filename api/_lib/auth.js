// Password hashing + signed session cookie for the employee portal.
// No external auth library — Node's built-in `crypto` covers both needs:
//   - scrypt for password hashing (slow-by-design, salted, no bcrypt dependency needed)
//   - HMAC-SHA256 for a tamper-proof session cookie (no server-side session store needed,
//     which matters here since there's no database — only Blob JSON documents)

const crypto = require('crypto');

const SESSION_COOKIE = 'c360_portal_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // ~12h

// ---- Password hashing -------------------------------------------------------------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
  // timingSafeEqual needs equal-length buffers; mismatched lengths just mean "wrong".
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---- Session cookie ----------------------------------------------------------------
// Cookie value = "<base64url(payload)>.<hex hmac-sha256 of that base64url string>"
// payload (before encoding) = "employeeId.role.expiryTimestamp[.viewerId]"
// viewerId is set only while the owner previews an employee's account ("Intră în cont"):
// the session then IS that employee's (same screens, same data) but read-only, and it
// remembers who to switch back to.

function sign(base64Payload) {
  const secret = process.env.PORTAL_SECRET || '';
  return crypto.createHmac('sha256', secret).update(base64Payload).digest('hex');
}

function base64urlEncode(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

function base64urlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function createSessionCookieValue(employeeId, role, viewer) {
  const expiry = Date.now() + SESSION_TTL_MS;
  const payload = `${employeeId}.${role}.${expiry}${viewer ? '.' + viewer : ''}`;
  const encoded = base64urlEncode(payload);
  const sig = sign(encoded);
  return `${encoded}.${sig}`;
}

// One sign-in for admin.centrul360.com and staff.centrul360.com: on the live domain the cookie
// is scoped to .centrul360.com so moving between the two keeps the session.
function cookieDomain(res) {
  const req = res && res.req;
  const host = String((req && req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '').split(':')[0].toLowerCase();
  return /(^|\.)centrul360\.com$/.test(host) ? '.centrul360.com' : '';
}

function buildSetCookieHeader(value, { clear = false, domain = '' } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${clear ? '' : value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ];
  if (domain) parts.push(`Domain=${domain}`);
  parts.push(clear ? 'Max-Age=0' : `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
  return parts.join('; ');
}

function setSessionCookie(res, employeeId, role, viewer) {
  const value = createSessionCookieValue(employeeId, role, viewer);
  const domain = cookieDomain(res);
  // An older host-only cookie would shadow the shared one — clear it in the same response.
  res.setHeader('Set-Cookie', domain
    ? [buildSetCookieHeader('', { clear: true }), buildSetCookieHeader(value, { domain })]
    : buildSetCookieHeader(value));
}

function clearSessionCookie(res) {
  const domain = cookieDomain(res);
  res.setHeader('Set-Cookie', domain
    ? [buildSetCookieHeader('', { clear: true }), buildSetCookieHeader('', { clear: true, domain })]
    : buildSetCookieHeader('', { clear: true }));
}

function parseCookies(req) {
  const header = req.headers && req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

// Parses + verifies the session cookie. Returns { employeeId, role } or null.
function getSession(req) {
  try {
    const cookies = parseCookies(req);
    const raw = cookies[SESSION_COOKIE];
    if (!raw) return null;

    const dotIdx = raw.lastIndexOf('.');
    if (dotIdx === -1) return null;
    const encoded = raw.slice(0, dotIdx);
    const sig = raw.slice(dotIdx + 1);

    const expectedSig = sign(encoded);
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expectedSig, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const payload = base64urlDecode(encoded);
    const [employeeId, role, expiryStr, viewer] = payload.split('.');
    const expiry = Number(expiryStr);
    if (!employeeId || !role || !expiry || Date.now() > expiry) return null;

    return { employeeId, role, viewer: viewer || null };
  } catch (err) {
    return null;
  }
}

// Returns the session, or writes a 401 JSON response and returns null.
function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'not_authenticated' });
    return null;
  }
  // Previewing an employee's account is look-only: nothing gets saved in their name.
  // (Some screens read through POST { action: 'list' } — those stay allowed.)
  const readOnly = req.method === 'GET' || (req.method === 'POST' && req.body && ['list', 'search'].includes(req.body.action));
  if (session.viewer && !readOnly) {
    res.status(403).json({ error: 'preview_only' });
    return null;
  }
  return session;
}

// Returns the session if it's an admin, or writes a 401/403 JSON response and returns null.
function requireAdmin(req, res) {
  const session = getSession(req);
  if (!session) {
    res.status(401).json({ error: 'not_authenticated' });
    return null;
  }
  if (session.role !== 'admin') {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return session;
}

// Returns the session if its role is one of `roles`, or writes a 401/403 JSON response and
// returns null. Front desk work (calendar edits, payments, pipeline) is admin + receptie;
// cosmeticians get read-only access to the calendar.
function requireRole(req, res, roles) {
  const session = requireAuth(req, res);
  if (!session) return null;
  if (!roles.includes(session.role)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return session;
}

module.exports = {
  requireRole,
  hashPassword,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
  getSession,
  requireAuth,
  requireAdmin,
};
