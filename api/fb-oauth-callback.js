// GET /api/fb-oauth-callback - Facebook redirects the admin's browser here after the
// OAuth dialog in api/fb-oauth-start.js. Exchanges the `code` for a long-lived Page
// Access Token and stores it in data/fb-connection.json, then redirects back into the
// portal's Setări tab with a success/failure flag.
// The WhatsApp login (state "wa", see fb-oauth-start ?for=wa) keeps the token for the two numbers
// (data/whatsapp-config.json) and answers in its small window: it tells the portal, then closes.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { GRAPH_BASE, siteOrigin, listAssets, afterLogin, appCreds } = require('./_lib/facebook');
const WA = require('./_lib/whatsapp');

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
    const [exp, , purpose] = decoded.split('.');
    const expiry = Number(exp);
    return Number.isFinite(expiry) && Date.now() <= expiry ? (purpose || 'fb') : false;
  } catch (err) {
    return false;
  }
}

// the WhatsApp login ends in the small window it was opened in: it tells the portal and closes
// (opened as a full page, it goes back to Integrări, where the connect window opens again)
function waDone(res, ok, message) {
  const data = JSON.stringify({ type: 'c360:wa', ok, message: message || '' }).replace(/</g, '\\u003c');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send('<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Centrul360</title></head>' +
    '<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#07080b;color:#eef0f7;font:15px system-ui,sans-serif">' +
    '<p>' + (ok ? 'Gata, te întorci în portal…' : 'Nu a mers, te întorci în portal…') + '</p><script>(function(){var d=' + data + ';' +
    'try{if(window.opener&&!window.opener.closed){window.opener.postMessage(d,location.origin);window.close();return;}}catch(e){}' +
    'location.replace("/?wa="+(d.ok?"ok":"error")+"#integrari");})();</script></body></html>');
}

function redirectToPortal(res, flag) {
  res.writeHead(302, { Location: `/?fb=${flag}#setari` });
  res.end();
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const { appId, appSecret } = await appCreds(readJSON);
  if (!appId || !appSecret) {
    res.status(400).json({ error: 'fb_not_configured' });
    return;
  }

  const { code, state, error: fbError } = req.query || {};

  if (fbError) {
    // stopped in Facebook's window: the WhatsApp one closes itself, the leads one goes back
    if (verifyState(state, process.env.PORTAL_SECRET || '') === 'wa') return waDone(res, false, 'Logarea a fost oprită.');
    redirectToPortal(res, 'error');
    return;
  }

  const portalSecret = process.env.PORTAL_SECRET || '';
  const purpose = verifyState(state, portalSecret);
  if (!purpose) {
    res.status(400).json({ error: 'invalid_state' });
    return;
  }

  if (!code) {
    if (purpose === 'wa') return waDone(res, false, 'Logarea a fost oprită.');
    redirectToPortal(res, 'error');
    return;
  }

  if (purpose === 'wa') {
    try {
      const redirectUri = `${siteOrigin(req)}/api/fb-oauth-callback`;
      const r = await fetch(`${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code })}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.access_token) { console.error('fb-oauth-callback wa: token exchange failed', j); return waDone(res, false, 'Meta nu a dat accesul. Încearcă din nou.'); }
      // a person's login lasts 60 days: made long; the login configuration's own token (a business
      // token) doesn't expire and stays as it is
      let token = j.access_token;
      const lr = await fetch(`${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: token })}`);
      const lj = await lr.json().catch(() => ({}));
      if (lr.ok && lj.access_token) token = lj.access_token;
      const c = (await readJSON(WA.CONFIG_KEY, null)) || {};
      c.token = token; c.tokenVia = 'login'; c.tokenAt = new Date().toISOString();
      await writeJSON(WA.CONFIG_KEY, c);
      WA.invalidate();
      return waDone(res, true);
    } catch (err) {
      console.error('fb-oauth-callback wa error:', err.message);
      return waDone(res, false, 'Nu a mers. Încearcă din nou.');
    }
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
    const done = await afterLogin({ readJSON, writeJSON }, assets, session.employeeId, 'oauth', longData.access_token);
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
