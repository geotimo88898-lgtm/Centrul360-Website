// /api/ads-manager, Admin → Reclame: a small Ads Manager over the connected ad account (admin only).
//   GET  ?period=today|yesterday|7d|30d|max   the campaigns with their ad sets and ads, the period's
//                                             spend / leads, the connection (token expiry), the defaults
//   POST { action: 'status', id, status }     ACTIVE / PAUSED, for a campaign, an ad set or an ad
//   POST { action: 'budget', id, daily }      daily budget in lei (an ad set, or a campaign with its own budget)
//   POST { action: 'rename', id, name }
//   POST { action: 'delete', id }
//   POST { action: 'defaults', defaults }     what the "Publică pe Meta" window starts with
// The Meta side lives in _lib/meta-ads.js.

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { loadConnection, appCreds } = require('./_lib/facebook');
const ads = require('./_lib/meta-ads');

const REASONS = {
  not_connected: 'Facebook nu e conectat. Integrări → Facebook.',
  no_user_token: 'Conexiunea Facebook n-are încă permisiunea de reclame (ads_management). Reconectează din Integrări → Facebook.',
  no_ad_account: 'Alege contul de reclame: Integrări → Facebook → Setări conexiune.',
};

async function connection() {
  const conn = await loadConnection(readJSON);
  if (!conn.pageId) return { conn, problem: 'not_connected' };
  if (!conn.userToken) return { conn, problem: 'no_user_token' };
  if (!conn.adAccountId) return { conn, problem: 'no_ad_account' };
  return { conn };
}

module.exports = async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { conn, problem } = await connection();
    const defaults = await ads.loadDefaults(readJSON);
    if (req.method === 'GET') {
      if (problem) { res.status(200).json({ ok: true, ready: false, reason: problem, message: REASONS[problem], defaults }); return; }
      const period = ads.PERIODS[req.query && req.query.period] ? req.query.period : '7d';
      const [view, token] = await Promise.all([ads.overview(conn, period), ads.tokenInfo(conn.userToken, await appCreds(readJSON))]);
      if (view.error) {
        const expired = token && !token.valid;
        res.status(200).json({ ok: true, ready: false, reason: expired ? 'token_expired' : 'meta_error', defaults,
          message: expired ? 'Conexiunea pentru reclame a expirat. Reconectează din Integrări → Facebook.' : 'Meta: ' + view.error });
        return;
      }
      res.status(200).json(Object.assign({ ready: true, defaults, token, adsManager: ads.adsManagerUrl(conn.adAccountId) }, view));
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const body = req.body || {};
    if (body.action === 'defaults') {
      const d = ads.cleanDefaults(body.defaults);
      await writeJSON(ads.DEFAULTS_KEY, d);
      res.status(200).json({ ok: true, defaults: d });
      return;
    }
    if (problem) { res.status(400).json({ error: problem, message: REASONS[problem] }); return; }
    const r = await ads.act(conn, body);
    if (r.error) { res.status(400).json({ error: 'meta_refused', message: r.error }); return; }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('ads-manager error:', err.message);
    res.status(500).json({ error: 'ads_failed', message: err.message });
  }
};

module.exports.config = { maxDuration: 60 };
