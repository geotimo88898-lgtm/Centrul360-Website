// GET /api/fb-oauth-callback — Facebook redirects the admin's browser here after the
// OAuth dialog in api/fb-oauth-start.js. Exchanges the `code` for a long-lived Page
// Access Token and stores it in data/fb-connection.json, then redirects back into the
// portal's Setări tab with a success/failure flag.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { GRAPH_BASE, siteOrigin } = require('./_lib/facebook');

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

  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;
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

    // Step 3: list the Pages the admin manages — each entry already carries its own
    // (non-expiring) Page Access Token, so we don't need a separate per-page exchange.
    const accountsUrl = `${GRAPH_BASE}/me/accounts?${new URLSearchParams({
      access_token: longData.access_token,
    })}`;
    const accountsResp = await fetch(accountsUrl);
    const accountsData = await accountsResp.json();
    const pages = (accountsData && accountsData.data) || [];
    if (!accountsResp.ok || pages.length === 0) {
      console.error('fb-oauth-callback: no pages returned', accountsData);
      redirectToPortal(res, 'error');
      return;
    }

    // A single clinic very likely manages one Page — take the first, but keep the full
    // list in storage in case a Page picker gets added to the UI later.
    const primary = pages[0];

    // Subscribe the Page to THIS app's webhook for the leadgen field. Without this call,
    // Facebook never sends leadgen events to our callback URL even if Webhooks is wired
    // up correctly in the App Dashboard — the dashboard config only tells Meta where the
    // app's webhook endpoint is, each Page still has to opt in to notifying that app.
    const subscribeUrl = `${GRAPH_BASE}/${primary.id}/subscribed_apps`;
    const subscribeResp = await fetch(subscribeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        subscribed_fields: 'leadgen',
        access_token: primary.access_token,
      }),
    });
    const subscribeData = await subscribeResp.json();
    if (!subscribeResp.ok || !subscribeData.success) {
      console.error('fb-oauth-callback: page webhook subscription failed', subscribeData);
      redirectToPortal(res, 'error');
      return;
    }

    await writeJSON('data/fb-connection.json', {
      pageId: primary.id,
      pageName: primary.name,
      pageAccessToken: primary.access_token,
      pages: pages.map((p) => ({ id: p.id, name: p.name, access_token: p.access_token })),
      connectedAt: new Date().toISOString(),
      connectedBy: session.employeeId,
    });

    redirectToPortal(res, 'connected');
  } catch (err) {
    console.error('fb-oauth-callback error:', err.message);
    redirectToPortal(res, 'error');
  }
};
