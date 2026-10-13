// POST /api/fb-manual-connect, admin-only fallback for connecting the Facebook Page
// when the OAuth flow (fb-oauth-start / fb-oauth-callback) can't be used because Meta's
// dashboard isn't offering a Pages/Lead Ads use case for this app (seen in practice when
// the app's attached Business Portfolio isn't verified yet). The admin instead gets a
// User Access Token with the needed permissions from Graph API Explorer
// (developers.facebook.com/tools/explorer, works for any Admin/Developer/Tester on the
// app regardless of which "use cases" are configured, since it's a sandbox tool, not the
// OAuth dialog), and pastes it here. Does the same two things fb-oauth-callback does:
// list the Pages (and ad accounts) the token reaches, connect the only Page or let the admin pick
// one in Integrări, just skipping the broken OAuth hop.

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { isConfigured, listAssets, afterLogin, appCreds, GRAPH_BASE } = require('./_lib/facebook');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  if (!(await isConfigured(readJSON))) {
    res.status(400).json({ error: 'fb_not_configured' });
    return;
  }

  const { userAccessToken } = req.body || {};
  if (!userAccessToken || typeof userAccessToken !== 'string') {
    res.status(400).json({ error: 'missing_token' });
    return;
  }

  try {
    // Graph API Explorer gives a token that lasts about an hour. Exchanged for a long-lived one (with
    // the app saved in Integrări), the Page tokens it lists never expire; otherwise the leads would
    // stop after an hour, so the answer says so (shortLived).
    let token = userAccessToken.trim();
    let shortLived = false;
    const { appId, appSecret } = await appCreds(readJSON);
    const ex = await fetch(GRAPH_BASE + '/oauth/access_token?' + new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: token }));
    const exj = await ex.json().catch(() => ({}));
    if (ex.ok && exj.access_token) token = exj.access_token;
    else { shortLived = true; console.error('fb-manual-connect: long-lived exchange failed', exj && exj.error); }
    const assets = await listAssets(token);
    if (assets.error) {
      console.error('fb-manual-connect: listing pages failed', assets.details);
      res.status(400).json({ error: 'token_invalid', details: assets.details });
      return;
    }
    const done = await afterLogin({ readJSON, writeJSON }, assets, session.employeeId, 'manual', shortLived ? '' : token);
    if (done.error) {
      res.status(400).json({ error: done.error, details: done.details });
      return;
    }
    res.status(200).json(Object.assign({ shortLived }, done));
  } catch (err) {
    console.error('fb-manual-connect error:', err.message);
    res.status(500).json({ error: 'connect_failed' });
  }
};
