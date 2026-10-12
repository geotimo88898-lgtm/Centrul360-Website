// GET /api/fb-oauth-callback - Facebook redirects the admin's browser here after the
// OAuth dialog in api/fb-oauth-start.js. Exchanges the `code` for a long-lived Page
// Access Token and stores it in data/fb-connection.json, then redirects back into the
// portal's Setări tab with a success/failure flag.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { GRAPH_BASE, siteOrigin, listAssets, afterLogin, appCreds } = require('./_lib/facebook');

function verifyState(state, secret) {
  if (!state) return false;
  const dotIdx = state.lastIndexOf('.');
  if (dotIdx === -1) return false;
  const payload = state.slice(0, dotIdx);
  const sig = state.slice(dotIdx + 1);

  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expectedSig, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  try {
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const expiry = Number(decoded.split('.')[0]);
    return Number.isFinite(expiry) && Date.now() <= expiry;
  } catch (err) {
    return false;
  }
}

function redirectToPortal(res, flag) {
  res.writeHead(302, { Location: `/portal?fb=${flag}#setari` });
  res.end();
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  const { appId, appSecret } = await appCreds(readJSON);
  if (!appId || !appSecret) {
    res.status(400).json({ error: 'fb_not_configured' });
    return;
  }

  const { code, state, error: fbError } = req.query || {};

  if (fbError) {
    redirectToPortal(res, 'error');
    return;
  }

  const portalSecret = process.env.PORTAL_SECRET || '';
  if (!verifyState(state, portalSecret)) {
    res.status(400).json({ error: 'invalid_state' });
    return;
  }

  if (!code) {
    redirectToPortal(res, 'error');
    return;
  }

  try {
    const redirectUri = `${siteOrigin(req)}/api/fb-oauth-callback`;

    // Step 1: code -> short-lived user access token.
    const shortTokenUrl = `${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    })}`;
    const shortResp = await fetch(shortTokenUrl);
    const shortData = await shortResp.json();
    if (!shortResp.ok || !shortData.access_token) {
      console.error('fb-oauth-callback: short token exchange failed', shortData);
      redirectToPortal(res, 'error');
      return;
    }

    // Step 2: short-lived -> long-lived user access token.
    const longTokenUrl = `${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortData.access_token,
    })}`;
    const longResp = await fetch(longTokenUrl);
    const longData = await longResp.json();
    if (!longResp.ok || !longData.access_token) {
      console.error('fb-oauth-callback: long token exchange failed', longData);
      redirectToPortal(res, 'error');
      return;
    }

    // Step 3: the Pages (and ad accounts) this login can reach. One Page connects now; with
    // several, the admin picks the clinic's in Integrări (redirect with fb=choose).
    const assets = await listAssets(longData.access_token);
    if (assets.error) {
      console.error('fb-oauth-callback: listing pages failed', assets.details);
      redirectToPortal(res, 'error');
      return;
    }
    const done = await afterLogin({ readJSON, writeJSON }, assets, session.employeeId, 'oauth');
    if (done.error) {
      console.error('fb-oauth-callback: connect failed', done.error, done.details);
      redirectToPortal(res, done.error === 'no_pages' ? 'nopages' : done.error === 'subscribe_failed' ? 'nosub' : 'error');
      return;
    }
    redirectToPortal(res, done.choose ? 'choose' : 'connected');
  } catch (err) {
    console.error('fb-oauth-callback error:', err.message);
    redirectToPortal(res, 'error');
  }
};
