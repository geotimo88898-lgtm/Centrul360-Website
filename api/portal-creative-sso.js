// GET /api/portal-creative-sso — admin-only. Returns a short-lived signed link that opens the
// creative machine (served at /creative via the rewrite in vercel.json) already signed in,
// so the owner logs in once, here.
//
// Token = "<base64url(expiryMs.employeeId)>.<hex hmac-sha256>" signed with CREATIVE_SSO_SECRET,
// the same secret configured on the creative machine, which verifies it in its /api/sso route.

const crypto = require('crypto');
const { requireAdmin } = require('./_lib/auth');

const TOKEN_TTL_MS = 2 * 60 * 1000;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const session = requireAdmin(req, res);
  if (!session) return;

  const secret = process.env.CREATIVE_SSO_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Lipsește CREATIVE_SSO_SECRET în setările Vercel ale portalului.' });
    return;
  }
  // Same origin by default: vercel.json proxies /creative/* to the creative machine, so it lives inside the portal.
  const base = (process.env.CREATIVE_URL || '/creative').replace(/\/$/, '');
  const payload = Buffer.from(`${Date.now() + TOKEN_TTL_MS}.${session.employeeId}`, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ url: `${base}/api/sso?t=${encodeURIComponent(`${payload}.${sig}`)}` });
};
