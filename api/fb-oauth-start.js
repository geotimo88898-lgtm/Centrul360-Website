// GET /api/fb-oauth-start — admin-only, one-time setup action (Setări → Integrări →
// "Conectează Facebook"). Redirects the admin's browser into Facebook's OAuth dialog so
// they can grant this app access to the clinic's Facebook Page (for Lead Ads retrieval).
//
// Requires FB_APP_ID (Vercel env var, set by the owner once she creates her own Meta
// Developer App with the "Facebook Login for Business" product). Until then this just
// responds 400 — no crash, no redirect to a broken URL.

const crypto = require('crypto');
const { requireAdmin } = require('./_lib/auth');
const { siteOrigin, GRAPH_VERSION } = require('./_lib/facebook');

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes is plenty for an admin to complete the dialog

// Signs "<expiry>.<nonce>" with PORTAL_SECRET (the same secret that signs the portal's
// session cookie — see _lib/auth.js) so fb-oauth-callback can verify the `state` it gets
// back from Facebook wasn't forged, without needing any server-side storage for it.
function signState(secret) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = Buffer.from(`${Date.now() + STATE_TTL_MS}.${nonce}`, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  const appId = process.env.FB_APP_ID;
  if (!appId) {
    res.status(400).json({ error: 'fb_not_configured' });
    return;
  }

  const secret = process.env.PORTAL_SECRET || '';
  const state = signState(secret);
  const redirectUri = `${siteOrigin(req)}/api/fb-oauth-callback`;

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: 'pages_show_list,leads_retrieval,pages_manage_metadata,pages_read_engagement',
    state,
    response_type: 'code',
  });

  res.setHeader('Cache-Control', 'no-store');
  res.writeHead(302, { Location: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}` });
  res.end();
};
