// /api/ads-manager, Admin → Reclame: a small Ads Manager over the connected ad account (admin only).
//   GET  ?period=today|yesterday|7d|30d|max   (or ?since=YYYY-MM-DD&until=YYYY-MM-DD) the campaigns with their ad sets and ads, the period's
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
const { funnel } = require('./_lib/ads-funnel');

// after the form: booked, showed, clients, revenue, upsells, on every campaign / ad set / ad
async function withFunnel(view, period, range) {
  const [leads, appointments, sales, stages] = await Promise.all([
    readJSON('data/leads.json', []), readJSON('data/appointments.json', []), readJSON('data/sales.json', []), readJSON('data/pipeline-stages.json', null),
  ]);
  const flat = [];
  view.campaigns.forEach((c) => c.adsets.forEach((s) => s.ads.forEach((a) => flat.push({ id: a.id, name: a.name, adsetId: s.id, campaignId: c.id, campaignName: c.name }))));
  const f = funnel({ leads, appointments, sales, stages: Array.isArray(stages) && stages.length ? stages : DEFAULT_STAGES, ads: flat, period, range });
  const put = (x, m) => Object.assign(x, { pLeads: 0, booked: 0, showed: 0, clients: 0, revenue: 0, upsells: 0, upsellValue: 0 }, renameLeads(m.get(x.id)));
  view.campaigns.forEach((c) => { put(c, f.campaigns); c.adsets.forEach((s) => { put(s, f.adsets); s.ads.forEach((a) => put(a, f.ads)); }); });
  view.unmatched = renameLeads(f.unmatched);
  return view;
}
const renameLeads = (x) => { if (!x) return {}; const o = Object.assign({}, x); o.pLeads = o.leads; delete o.leads; return o; };
// the pipeline's first stages, if none were ever saved (same as api/portal-leads.js)
const DEFAULT_STAGES = [
  { id: 'lead_nou', kind: 'open' }, { id: 'contactat', kind: 'open' }, { id: 'programare_stabilita', kind: 'booked' },
  { id: 'venit_la_programare', kind: 'open' }, { id: 'client_fidel', kind: 'won' }, { id: 'pierdut', kind: 'lost' },
];

const REASONS = {
  not_connected: 'Facebook nu e conectat. Integrări → Facebook.',
  no_user_token: 'Lipsește tokenul pentru reclame. Integrări → Facebook → Reclame: lipește un token cu ads_management.',
  no_ad_account: 'Alege contul de reclame: Integrări → Facebook → Setări conexiune.',
  no_ads_permission: 'Tokenul pentru reclame n-are permisiunea ads_management. Integrări → Facebook → Reclame: lipește un token care o are.',
};

// a custom range: two real days, in order, not in the future (Meta keeps 37 months)
function dayRange(qs) {
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s + 'T00:00:00Z'));
  if (!ok(qs.since) || !ok(qs.until)) return null;
  let [since, until] = [String(qs.since), String(qs.until)].sort();
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  if (until > today) until = today;
  if (since > until) since = until;
  return { since, until };
}

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
      const range = dayRange(req.query || {});
      const [view, token] = await Promise.all([ads.overview(conn, period, range), ads.tokenInfo(conn.userToken, await appCreds(readJSON))]);
      if (view.error) {
        const expired = token && !token.valid;
        const noScope = token && token.valid && !(token.scopes || []).some((x) => x === 'ads_management' || x === 'ads_read');
        res.status(200).json({ ok: true, ready: false, reason: expired ? 'token_expired' : noScope ? 'no_ads_permission' : 'meta_error', defaults,
          message: expired ? 'Conexiunea pentru reclame a expirat. Integrări → Facebook → Reclame: lipește un token nou.' : noScope ? REASONS.no_ads_permission : 'Meta: ' + view.error });
        return;
      }
      // without ads_management the page only reads (the switches would be refused)
      const readOnly = !!(token && token.valid && !(token.scopes || []).includes('ads_management'));
      await withFunnel(view, period, range).catch((e) => { console.error('ads-manager funnel:', e.message); });
      res.status(200).json(Object.assign({ ready: true, defaults, token, readOnly, adsManager: ads.adsManagerUrl(conn.adAccountId) }, view));
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
