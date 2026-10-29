// Instagram Direct in the portal (29.10, the owner: "să-mi apară și mesajele de pe Insta acolo"). The clinic's Instagram
// account is linked to its Facebook Page, so its messages come through the same Meta app as the leads (Messenger
// Platform, Page token with instagram_manage_messages; no App Review for the business's own account).
//   status()   where it stands: the login's permissions, the app's webhooks, the Page's Instagram account (Claude's read)

const { readJSON } = require('./store');
const { loadConnection, appCreds } = require('./facebook');
const ads = require('./meta-ads');

const NEEDS = ['instagram_basic', 'instagram_manage_messages', 'pages_manage_metadata'];

async function status() {
  const [conn, creds] = await Promise.all([loadConnection(readJSON), appCreds(readJSON)]);
  if (!conn.pageId) return { error: 'not_connected' };
  const appToken = creds.appId && creds.appSecret ? creds.appId + '|' + creds.appSecret : '';
  const g = (path, token, params) => ads.call('GET', path, token, params).then((r) => (r.ok ? r.j : { error: ((r.j || {}).error || {}).message || 'eroare' }));
  const [user, page, ig, apps, subs] = await Promise.all([
    conn.userToken && appToken ? g('/debug_token', appToken, { input_token: conn.userToken }) : null,
    appToken ? g('/debug_token', appToken, { input_token: conn.pageAccessToken }) : null,
    g('/' + conn.pageId, conn.pageAccessToken, { fields: 'name,instagram_business_account{id,username,name}' }),
    g('/' + conn.pageId + '/subscribed_apps', conn.pageAccessToken),
    appToken ? g('/' + creds.appId + '/subscriptions', appToken) : null,
  ]);
  const scopes = ((user && user.data) || {}).scopes || [];
  return {
    app: { id: creds.appId, configId: !!creds.configId, fromPortal: creds.fromPortal },
    login: { scopes, missing: NEEDS.filter((s) => !scopes.includes(s)), type: ((user && user.data) || {}).type, expires: ((user && user.data) || {}).expires_at },
    pageToken: { scopes: ((page && page.data) || {}).scopes || [], expires: ((page && page.data) || {}).expires_at },
    page: { id: conn.pageId, name: ig && ig.name, instagram: ig && ig.instagram_business_account, error: ig && ig.error },
    pageApps: ((apps && apps.data) || []).map((a) => ({ id: a.id, name: a.name, fields: a.subscribed_fields })),
    appWebhooks: ((subs && subs.data) || []).map((s) => ({ object: s.object, active: s.active, callback: s.callback_url, fields: (s.fields || []).map((f) => f.name) })),
  };
}

module.exports = { status, NEEDS };
