// /api/fb-connection-status, admin-only (Integrări → Facebook). Never exposes a token or the secret.
//   GET   the Meta app in use (App ID, whether a secret is saved, the webhook details to paste in
//         Meta), whether a Facebook Page is connected (and which ad account), or the Pages waiting
//         to be picked after Facebook's login (several Pages on one account)
//   POST { action: 'app', appId, appSecret, configId }   the Meta app to use (saved in the portal,
//         wins over FB_APP_ID / FB_APP_SECRET in Vercel); an empty secret keeps the saved one
//   POST { action: 'choose', pageId, adAccountId }   connect that Page (from the login just made,
//         or another Page of the same login) and remember the ad account
//   POST { action: 'ad_account', adAccountId }       change the ad account (picked from the list, or
//         typed by hand: act_123… / 123…), used later to publish ads from Creative

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { APP_KEY, appCreds, loadConnection, loadPending, connectPage, siteOrigin } = require('./_lib/facebook');

const pub = (list) => (list || []).map((x) => ({ id: x.id, name: x.name, business: x.business || '' }));

async function status(req) {
  const creds = await appCreds(readJSON);
  const origin = siteOrigin(req);
  const app = {
    appId: creds.appId, hasSecret: !!creds.appSecret, configId: creds.configId, fromPortal: creds.fromPortal,
    redirectUri: origin + '/api/fb-oauth-callback', webhookUrl: origin + '/api/webhook-facebook-leads', verifyToken: creds.verifyToken,
  };
  if (!creds.appId || !creds.appSecret) return { connected: false, notConfigured: true, app };
  const [conn, pending] = await Promise.all([loadConnection(readJSON), loadPending({ readJSON })]);
  const out = { connected: !!conn.pageId, app };
  if (conn.pageId) Object.assign(out, {
    pageName: conn.pageName, connectedAt: conn.connectedAt, pageId: conn.pageId,
    pages: pub(conn.pages), adAccounts: pub(conn.adAccounts), adAccountId: conn.adAccountId || '', adAccountName: conn.adAccountName || '',
  });
  if (pending) out.pending = { pages: pub(pending.pages), adAccounts: pub(pending.adAccounts) };
  return out;
}

module.exports = async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') { res.status(200).json(await status(req)); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const body = req.body || {};
    const store = { readJSON, writeJSON };

    if (body.action === 'app') {
      const appId = String(body.appId || '').trim();
      const appSecret = String(body.appSecret || '').trim();
      const configId = String(body.configId || '').trim();
      if (!/^\d{6,25}$/.test(appId)) { res.status(400).json({ error: 'invalid_app_id' }); return; }
      if (appSecret && !/^[a-f0-9]{20,64}$/i.test(appSecret)) { res.status(400).json({ error: 'invalid_app_secret' }); return; }
      if (configId && !/^\d{6,25}$/.test(configId)) { res.status(400).json({ error: 'invalid_config_id' }); return; }
      const prev = (await readJSON(APP_KEY, {})) || {};
      const sameApp = prev.appId === appId;
      if (!appSecret && !sameApp) { res.status(400).json({ error: 'missing_app_secret' }); return; }
      await writeJSON(APP_KEY, {
        appId, appSecret: appSecret || prev.appSecret, configId,
        verifyToken: prev.verifyToken || crypto.randomBytes(16).toString('hex'),
        savedAt: new Date().toISOString(), savedBy: session.employeeId,
      });
      // a Page token belongs to the app that issued it: another app means connecting again
      if (!sameApp) { await writeJSON('data/fb-connection.json', {}); await writeJSON('data/fb-pending.json', {}); }
      res.status(200).json(await status(req));
      return;
    }

    if (body.action === 'choose') {
      const pending = await loadPending(store);
      const conn = await loadConnection(readJSON);
      const src = pending || (conn.pageId ? { pages: conn.pages || [], adAccounts: conn.adAccounts || [], via: conn.connectedVia } : null);
      if (!src) { res.status(400).json({ error: 'login_expired' }); return; }
      const page = src.pages.find((p) => p.id === body.pageId);
      if (!page || !page.access_token) { res.status(400).json({ error: 'page_not_found' }); return; }
      const done = await connectPage(store, { page, pages: src.pages, adAccounts: src.adAccounts, adAccountId: body.adAccountId || '', by: session.employeeId, via: src.via || 'oauth' });
      if (done.error) { res.status(400).json({ error: done.error }); return; }
      res.status(200).json(await status(req));
      return;
    }

    if (body.action === 'ad_account') {
      const conn = await readJSON('data/fb-connection.json', {});
      if (!conn.pageId) { res.status(400).json({ error: 'not_connected' }); return; }
      const raw = String(body.adAccountId || '').trim();
      const known = (conn.adAccounts || []).find((a) => a.id === raw);
      const digits = raw.replace(/^act_/, '');
      if (!known && raw && !/^\d{5,20}$/.test(digits)) { res.status(400).json({ error: 'invalid_ad_account' }); return; }
      conn.adAccountId = known ? known.id : raw ? 'act_' + digits : '';
      conn.adAccountName = known ? known.name : String(body.adAccountName || '').trim().slice(0, 80) || (raw ? 'act_' + digits : '');
      await writeJSON('data/fb-connection.json', conn);
      res.status(200).json(await status(req));
      return;
    }

    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    console.error('fb-connection-status error:', err.message);
    res.status(500).json({ error: 'status_failed' });
  }
};
