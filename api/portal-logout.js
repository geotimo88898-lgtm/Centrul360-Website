// POST /api/portal-logout — clears the session cookie.

const { clearSessionCookie } = require('./_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
};
