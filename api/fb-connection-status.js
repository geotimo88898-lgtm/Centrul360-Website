// /api/fb-connection-status, admin-only (Integrări → Facebook). Never exposes a token or the secret.
//   GET   the Meta app in use (App ID, whether a secret is saved, the webhook details to paste in
//         Meta), whether a Facebook Page is connected (and which ad account), or the Pages waiting
//         to be picked after Facebook's login (several Pages on one account)
//   POST { action: 'app', appId, appSecret, configId }   the Meta app to use (saved in the portal,
//         wins over FB_APP_ID / FB_APP_SECRET in Vercel); an empty secret keeps the saved one
//   POST { action: 'poll_now' }      read the forms for new leads right now (instead of waiting the minute)
//   POST { action: 'test_read' }     can the portal read the Page's forms and leads? (Facebook's own answer)
//   POST { action: 'resubscribe' }   subscribe the connected Page to this app's leads again
//   POST { action: 'choose', pageId, adAccountId }   connect that Page (from the login just made,
//         or another Page of the same login) and remember the ad account
//   POST { action: 'ads_token', token }  a token only for the ads (System User or a user token with
//         ads_management), checked with Meta and made long-lived; the Page connection stays
//   POST { action: 'ad_account', adAccountId }       change the ad account (picked from the list, or
//         typed by hand: act_123… / 123…), used later to publish ads from Creative

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { pollLeads } = require('./_lib/fb-leads');
const { APP_KEY, GRAPH_BASE, appCreds, loadConnection, loadPending, connectPage, siteOrigin } = require('./_lib/facebook');
const { tokenInfo } = require('./_lib/meta-ads');

// Is the connected Page subscribed to this app's leadgen webhook? (Meta lists the apps it notifies)
async function subscription(conn, appId) {
  try {
    const r = await fetch(GRAPH_BASE + '/' + encodeURIComponent(conn.pageId) + '/subscribed_apps?' + new URLSearchParams({ access_token: conn.pageAccessToken }));
    const j = await r.json().catch(() => ({}));
    // Reading the list needs pages_manage_metadata on the token; without it, the subscription made
    // when connecting (Facebook said yes then) is what we know.
    if (!r.ok) return conn.subscribedAt ? { ok: true, since: conn.subscribedAt } : { ok: false, error: (j.error && j.error.message) || 'Facebook n-a răspuns' };
    const apps = j.data || [];
    const mine = apps.find((a) => String(a.id) === String(appId));
    return { ok: !!(mine && (mine.subscribed_fields || []).includes('leadgen')), apps: apps.map((a) => a.name || a.id) };
  } catch (e) { return { ok: false, error: 'rețea' }; }
}
async function subscribe(conn) {
  const r = await fetch(GRAPH_BASE + '/' + encodeURIComponent(conn.pageId) + '/subscribed_apps', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ subscribed_fields: 'leadgen', access_token: conn.pageAccessToken }),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok && j.success ? { ok: true } : { ok: false, error: (j.error && j.error.message) || 'refuzat' };
}

const pub = (list) => (list || []).map((x) => ({ id: x.id, name: x.name, business: x.business || '' }));

async function status(req) {
  const creds = await appCreds(readJSON);
  const origin = siteOrigin(req);
  const app = {
    appId: creds.appId, hasSecret: !!creds.appSecret, configId: creds.configId, fromPortal: creds.fromPortal,
    redirectUri: origin + '/api/fb-oauth-callback', webhookUrl: origin + '/api/webhook-facebook-leads', verifyToken: creds.verifyToken,
  };
  if (!creds.appId || !creds.appSecret) return { connected: false, notConfigured: true, app };
  const [conn, pending, log, poll] = await Promise.all([loadConnection(readJSON), loadPending({ readJSON }), readJSON('data/fb-webhook-log.json', []), readJSON('data/fb-poll.json', {})]);
  const out = {
    connected: !!conn.pageId, app, deliveries: (log || []).slice(0, 12),
    // the reading of the forms (_lib/fb-leads.js): when it last looked and whether Facebook answered
    poll: poll && poll.at ? { at: poll.at, ok: poll.ok !== false, error: poll.error || '', forms: (poll.forms || []).filter((f) => !f.status || f.status === 'ACTIVE').length, lastFailure: poll.lastFailure || null } : null,
  };
  if (conn.pageId) out.subscription = await subscription(conn, creds.appId);
  // the token kept for the ads (Reclame, "Publică pe Meta"): whether it works, until when, if it may publish
  if (conn.pageId) {
    const t = conn.userToken ? await tokenInfo(conn.userToken, creds) : null;
    out.ads = conn.userToken
      ? { set: true, at: conn.userTokenAt || '', valid: t ? t.valid : null, expiresAt: t ? t.expiresAt : null, publish: t ? (t.scopes || []).includes('ads_management') : null }
      : { set: false };
  }
  // the clinic's Instagram messages in Mesaje (api/_lib/ig-inbox.js)
  if (conn.pageId) out.instagram = await require('./_lib/ig-inbox').brief().catch((e) => ({ ready: false, error: e.message }));
  if (conn.pageId) Object.assign(out, {
    pageName: conn.pageName, connectedAt: conn.connectedAt, pageId: conn.pageId,
    pages: pub(conn.pages), adAccounts: pub(conn.adAccounts), adAccountId: conn.adAccountId || '', adAccountName: conn.adAccountName || '',
  });
  if (pending) out.pending = { pages: pub(pending.pages), adAccounts: pub(pending.adAccounts) };
  return out;
}

module.exports = async (req, res) => {
  const session = await requireAdmin(req, res);
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

    if (body.action === 'poll_now') {
      const read = await pollLeads(true);
      res.status(200).json(Object.assign({ read: read || 0 }, await status(req)));
      return;
    }

    if (body.action === 'test_read') {
      const conn = await loadConnection(readJSON);
      if (!conn.pageId) { res.status(400).json({ error: 'not_connected' }); return; }
      const get = async (path, params) => {
        const r = await fetch(GRAPH_BASE + path + '?' + new URLSearchParams(Object.assign({ access_token: conn.pageAccessToken }, params)));
        const j = await r.json().catch(() => ({}));
        return r.ok ? { data: j.data || [] } : { error: (j.error && j.error.message) || 'eroare ' + r.status };
      };
      const forms = await get('/' + encodeURIComponent(conn.pageId) + '/leadgen_forms', { fields: 'id,name,status', limit: '25' });
      if (forms.error) { res.status(200).json({ ok: false, step: 'forms', message: forms.error }); return; }
      const active = forms.data.filter((f) => f.status === 'ACTIVE');
      const pick = active[0] || forms.data[0];
      if (!pick) { res.status(200).json({ ok: false, step: 'forms', message: 'Pagina nu are niciun formular.' }); return; }
      const leads = await get('/' + encodeURIComponent(pick.id) + '/leads', { fields: 'id,created_time', limit: '1' });
      res.status(200).json({
        ok: !leads.error, step: 'leads', form: pick.name, forms: forms.data.length,
        message: leads.error || (leads.data.length ? 'Ultimul lead din formular: ' + leads.data[0].created_time : 'Formularul nu are încă leaduri.'),
      });
      return;
    }

    if (body.action === 'resubscribe') {
      const conn = await loadConnection(readJSON);
      if (!conn.pageId) { res.status(400).json({ error: 'not_connected' }); return; }
      const r = await subscribe(conn);
      if (!r.ok) { res.status(400).json({ error: 'subscribe_failed', message: r.error }); return; }
      const stored = await readJSON('data/fb-connection.json', {});
      stored.subscribedAt = new Date().toISOString();
      await writeJSON('data/fb-connection.json', stored);
      res.status(200).json(await status(req));
      return;
    }

    if (body.action === 'choose') {
      const pending = await loadPending(store);
      const conn = await loadConnection(readJSON);
      const src = pending || (conn.pageId ? { pages: conn.pages || [], adAccounts: conn.adAccounts || [], via: conn.connectedVia, userToken: conn.userToken } : null);
      if (!src) { res.status(400).json({ error: 'login_expired' }); return; }
      const page = src.pages.find((p) => p.id === body.pageId);
      if (!page || !page.access_token) { res.status(400).json({ error: 'page_not_found' }); return; }
      const done = await connectPage(store, { page, pages: src.pages, adAccounts: src.adAccounts, adAccountId: body.adAccountId || '', by: session.employeeId, via: src.via || 'oauth', userToken: src.userToken || conn.userToken || '' });
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

    // a token only for the ads (Reclame, "Publică pe Meta"): the Page and the leads stay as they are
    if (body.action === 'ads_token') {
      const conn = await readJSON('data/fb-connection.json', {});
      if (!conn.pageId) { res.status(400).json({ error: 'not_connected' }); return; }
      const creds = await appCreds(readJSON);
      let token = String(body.token || '').trim();
      if (!/^[A-Za-z0-9_|.-]{20,600}$/.test(token)) { res.status(400).json({ error: 'token_invalid' }); return; }
      let info = await tokenInfo(token, creds);
      if (!info || !info.valid) { res.status(400).json({ error: 'token_invalid' }); return; }
      // a user token from this app becomes a ~60-day one; a System User token already never expires
      if (info.expiresAt && info.expiresAt - Date.now() < 30 * 86400e3) {
        const ex = await fetch(GRAPH_BASE + '/oauth/access_token?' + new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: creds.appId, client_secret: creds.appSecret, fb_exchange_token: token }));
        const exj = await ex.json().catch(() => ({}));
        if (ex.ok && exj.access_token) {
          const longInfo = await tokenInfo(exj.access_token, creds);
          if (longInfo && longInfo.valid) { token = exj.access_token; info = longInfo; }
        }
      }
      if (!(info.scopes || []).includes('ads_management')) { res.status(400).json({ error: 'no_ads_management' }); return; }
      // the chosen ad account must open with it; without one chosen, its ad accounts fill the list
      const get = async (path, params) => {
        const r = await fetch(GRAPH_BASE + path + '?' + new URLSearchParams(Object.assign({ access_token: token }, params)));
        const j = await r.json().catch(() => ({}));
        return { ok: r.ok, j };
      };
      if (conn.adAccountId) {
        const acc = await get('/' + conn.adAccountId, { fields: 'name' });
        if (!acc.ok) { res.status(400).json({ error: 'ad_account_unreachable', message: (acc.j.error && acc.j.error.message) || '' }); return; }
      }
      const list = await get('/me/adaccounts', { fields: 'id,name,business{name}', limit: '50' });
      if (list.ok && Array.isArray(list.j.data) && list.j.data.length) {
        const known = new Map((conn.adAccounts || []).map((a) => [a.id, a]));
        list.j.data.forEach((a) => known.set(a.id, { id: a.id, name: a.name || a.id, business: (a.business && a.business.name) || '' }));
        conn.adAccounts = Array.from(known.values());
        if (!conn.adAccountId && conn.adAccounts.length === 1) { conn.adAccountId = conn.adAccounts[0].id; conn.adAccountName = conn.adAccounts[0].name; }
      }
      conn.userToken = token;
      conn.userTokenAt = new Date().toISOString();
      conn.userTokenBy = session.employeeId;
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
