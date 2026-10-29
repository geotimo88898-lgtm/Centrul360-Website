// GET /api/fb-oauth-start, admin-only, one-time setup action (Setări → Integrări →
// "Conectează Facebook"). Redirects the admin's browser into Facebook's OAuth dialog so
// they can grant this app access to the clinic's Facebook Page (for Lead Ads retrieval).
//
// Uses the Meta app saved in Integrări → Facebook (or FB_APP_ID in Vercel). Until there is one
// this just responds 400, no crash, no redirect to a broken URL. With a "Facebook Login for
// Business" configuration ID saved, the dialog asks for that configuration instead of scopes.
// ?for=wa: the WhatsApp login (Integrări → WhatsApp → "Conectează"), with the WhatsApp permissions
// (its own configuration, saved with the numbers); the callback keeps the token for the numbers.

const crypto = require('crypto');
const { requireAdmin } = require('./_lib/auth');
const { readJSON } = require('./_lib/store');
const { siteOrigin, GRAPH_VERSION, appCreds } = require('./_lib/facebook');
const WA = require('./_lib/whatsapp');

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes is plenty for an admin to complete the dialog

// Signs "<expiry>.<nonce>" with PORTAL_SECRET (the same secret that signs the portal's
// session cookie, see _lib/auth.js) so fb-oauth-callback can verify the `state` it gets
// back from Facebook wasn't forged, without needing any server-side storage for it.
function signState(secret, purpose) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = Buffer.from(`${Date.now() + STATE_TTL_MS}.${nonce}${purpose ? '.' + purpose : ''}`, 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = await requireAdmin(req, res);
  if (!session) return;

  const creds = await appCreds(readJSON);
  const appId = creds.appId;
  if (!appId) {
    res.status(400).json({ error: 'fb_not_configured' });
    return;
  }

  const forWa = (req.query || {}).for === 'wa';
  const secret = process.env.PORTAL_SECRET || '';
  const state = signState(secret, forWa ? 'wa' : '');
  const redirectUri = `${siteOrigin(req)}/api/fb-oauth-callback`;

  const params = new URLSearchParams({ client_id: appId, redirect_uri: redirectUri, state, response_type: 'code' });
  if (forWa) {
    const wa = (await readJSON(WA.CONFIG_KEY, null)) || {};
    if (wa.loginConfigId) { params.set('config_id', wa.loginConfigId); params.set('override_default_response_type', 'true'); }
    else params.set('scope', 'whatsapp_business_management,whatsapp_business_messaging,business_management');
  } else if (creds.configId && (req.query || {}).scopes !== '1') { params.set('config_id', creds.configId); params.set('override_default_response_type', 'true'); }
  // and the clinic's Instagram messages (Mesaje): instagram_basic, instagram_manage_messages, pages_messaging.
  // ?scopes=1 (Integrări → Instagram "Conectează"): these permissions asked by name, past the saved configuration
  // (which may not have them), with the WhatsApp ones the configuration gave
  else params.set('scope', 'pages_show_list,leads_retrieval,pages_manage_metadata,pages_read_engagement,pages_manage_ads,ads_management,ads_read,business_management,instagram_basic,instagram_manage_messages,pages_messaging'
    + (creds.configId ? ',whatsapp_business_management,whatsapp_business_messaging' : ''));

  res.setHeader('Cache-Control', 'no-store');
  res.writeHead(302, { Location: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}` });
  res.end();
};
