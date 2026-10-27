// /api/ads-manager, Admin → Reclame: a small Ads Manager over the connected ad account (admin only).
//   GET  ?period=today|yesterday|7d|30d|max   (or ?since=YYYY-MM-DD&until=YYYY-MM-DD) the campaigns with their ad sets and ads, the period's
//                                             spend / leads, the connection (token expiry), the defaults
//   POST { action: 'status', id, status }     ACTIVE / PAUSED, for a campaign, an ad set or an ad
//   POST { action: 'budget', id, daily }      daily budget in lei (an ad set, or a campaign with its own budget)
//   POST { action: 'rename', id, name }
//   POST { action: 'delete', id }
//   POST { action: 'details', campaignId }        its ad sets (audience, budget) and ads (texts, images)
//   POST { action: 'edit_ad', adId, texts, headlines, descriptions, cta, formId }
//   POST { action: 'edit_adset', adsetId, budget, ageMin, ageMax, women, radiusKm, placements }
//   GET  ?media=<link>                       an ad's picture, to save it
//   POST { action: 'defaults', defaults }     what the "Publică pe Meta" window starts with
// The Meta side lives in _lib/meta-ads.js.

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { loadConnection, appCreds } = require('./_lib/facebook');
const ads = require('./_lib/meta-ads');
const { funnel, periodRange, bucharestDay } = require('./_lib/ads-funnel');
const KPI = require('./_lib/kpi');
const edit = require('./_lib/ads-edit');
const AC = require('./_lib/ads-cache');
const guard = require('./_lib/ads-guard');

// after the form: booked, showed, clients, revenue, upsells, on every campaign / ad set / ad. From 16.10.2026, 22:05
// on (the owner's call: what came before was brought over from HighLevel): only the leads from then on, the bookings
// made in the portal from then on (not imported), their payments; and "spendNew", what the ads spent in the same days,
// so the cost per booking / visit / client compares like with like.
async function withFunnel(view, period, range, conn) {
  const [allLeads, allAppts, allSales, stages] = await Promise.all([
    readJSON('data/leads.json', []), readJSON('data/appointments.json', []), readJSON('data/sales.json', []), readJSON('data/pipeline-stages.json', null),
  ]);
  const START = KPI.cfg.start;
  const at = (x) => Date.parse(x) || 0;
  const leads = allLeads.filter((l) => at(l.createdAt) >= START || (l.activities || []).some((a) => a.type === 'returned' && at(a.at) >= START));
  const appointments = allAppts.filter((a) => at(a.createdAt) >= START && a.createdBy !== 'highlevel' && !a.importedAt && !a.ghlId);
  const fresh = new Set(appointments.map((a) => a.id));
  const sales = allSales.filter((s) => (s.appointmentId ? fresh.has(s.appointmentId) : at(s.createdAt || s.date) >= START));
  const flat = [];
  view.campaigns.forEach((c) => c.adsets.forEach((s) => s.ads.forEach((a) => flat.push({ id: a.id, name: a.name, adsetId: s.id, campaignId: c.id, campaignName: c.name }))));
  const f = funnel({ leads, appointments, sales, stages: Array.isArray(stages) && stages.length ? stages : DEFAULT_STAGES, ads: flat, period, range });
  const put = (x, m) => Object.assign(x, { pLeads: 0, booked: 0, showed: 0, clients: 0, revenue: 0, upsells: 0, upsellValue: 0 }, renameLeads(m.get(x.id)));
  view.campaigns.forEach((c) => { put(c, f.campaigns); c.adsets.forEach((s) => { put(s, f.adsets); s.ads.forEach((a) => put(a, f.ads)); }); });
  view.unmatched = renameLeads(f.unmatched);
  // the spend of the same days (the period, from START's day on), per ad, added up per ad set and campaign
  const today = bucharestDay(Date.now()), first = bucharestDay(START);
  const r0 = periodRange(period, range) || { since: first, until: today };
  const days = { since: r0.since < first ? first : r0.since, until: r0.until };
  const perAd = new Map(), perSet = new Map(), perCamp = new Map();
  let known = false;
  if (days.since <= days.until && conn) {
    const st = await KPI.adsFor(conn, days);
    known = !!st.rows; // Meta refused it: the costs after the form use the period's spend and the page says so
    if (!known) view.spendNote = 'Meta n-a dat acum cheltuiala de pe 16 oct încoace: costurile de după formular sunt pe cheltuiala perioadei.';
    (st.rows || []).forEach((x) => {
      perAd.set(x.adId, (perAd.get(x.adId) || 0) + x.spend);
      if (x.adsetId) perSet.set(x.adsetId, (perSet.get(x.adsetId) || 0) + x.spend);
      if (x.campaignId) perCamp.set(x.campaignId, (perCamp.get(x.campaignId) || 0) + x.spend);
    });
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  const sn = (m, id) => (known ? r2(m.get(id) || 0) : null);
  view.campaigns.forEach((c) => { c.spendNew = sn(perCamp, c.id); c.adsets.forEach((s) => { s.spendNew = sn(perSet, s.id); s.ads.forEach((a) => { a.spendNew = sn(perAd, a.id); }); }); });
  view.since = new Date(START).toISOString();
  return view;
}
// what the guard saw on each campaign (api/_lib/ads-guard.js: TOP / ATENȚIE / DE URMĂRIT on the days it really ran,
// the same as its notifications), laid on the campaign in Reclame: only on a running campaign and only a fresh one
function adNotes(view, verdicts, at) {
  const fresh = Date.parse(at || '') > Date.now() - 864e5;
  view.campaigns.forEach((c) => { const v = fresh && c.status === 'ACTIVE' && (verdicts || {})[c.id]; c.notes = v && v.flag !== 'ok' ? [{ flag: v.flag, why: v.why, ad: '' }] : []; });
}
// what was done to the campaigns (the guard's and the asked-for changes, last 3 days), only what is still so now (the owner,
// 27.10: no note that the account says otherwise): for each campaign its last switch and its last budget change, a stop
// only while the campaign (or the ad) is still off, a budget only while it is still that much; budgets not on a stopped one
function standing(log, view) {
  const camps = new Map(view.campaigns.map((c) => [c.id, c]));
  const ads = new Map(), sets = new Map();
  view.campaigns.forEach((c) => c.adsets.forEach((s) => { sets.set(s.id, s); s.ads.forEach((a) => ads.set(a.id, a)); }));
  const seen = new Set();
  return log.filter((e) => {
    const c = camps.get(e.campaignId);
    if (!c || e.unchanged || e.expired) return false;
    const switched = e.type === 'stop' || e.type === 'start';
    const k = e.campaignId + '|' + (switched ? (e.job ? 'camp' : 'ad' + e.adId) : 'budget');
    if (seen.has(k)) return false; // an older one, overtaken
    seen.add(k);
    e.campaignName = c.name; // as it is called now (a job's list names it as it was)
    if (switched) {
      // a whole campaign off (asked for, or its last ad stopped by the guard), or one ad of a campaign that goes on
      const whole = !!e.job || !!e.campaignOff;
      if (whole) return e.type === 'stop' && c.status !== 'ACTIVE';
      const a = ads.get(e.adId);
      if (!a) return false; // the ad is gone (deleted, or out of the list)
      e.adOnly = true; e.adName = a.name;
      return e.type === 'stop' && a.status !== 'ACTIVE' && c.status === 'ACTIVE';
    }
    if (c.status !== 'ACTIVE' || Number(e.from) === Number(e.to)) return false;
    const now = e.budgetId && sets.get(e.budgetId) ? sets.get(e.budgetId).daily : c.daily;
    return Math.abs((Number(now) || 0) - Number(e.to)) < 0.5;
  });
}
// what the page says on top of the list: the account not delivering, the guard silent for too long
const ACCOUNT_WHY = { 2: 'Contul de reclame e dezactivat de Meta: nimic nu rulează.', 3: 'Plata contului de reclame n-a trecut: Meta a oprit livrarea. De rezolvat în Ads Manager.', 7: 'Contul de reclame e în verificare la Meta.', 9: 'Contul de reclame e în perioadă de grație la plată.', 100: 'Contul de reclame se închide.', 101: 'Contul de reclame e închis.' };
function notices(view, g) {
  const out = [];
  const st = view.account && view.account.status;
  if (st != null && st !== 1) out.push({ tone: 'bad', text: ACCOUNT_WHY[st] || 'Meta a oprit livrarea contului de reclame (stare ' + st + ').' });
  if (g && g.on === false) out.push({ tone: 'warn', text: 'Garda reclamelor e oprită: nimic nu se oprește sau se mărește singur.' });
  else if (g && g.lastOk && Date.now() - g.lastOk > guard.DEAD_H * 3600e3) out.push({ tone: 'warn', text: 'Garda n-a mai verificat reclamele de ' + Math.round((Date.now() - g.lastOk) / 3600e3) + ' ore' + (g.lastError && g.lastError.why ? ': ' + g.lastError.why : '') + '.' });
  if (view.spendNote) out.push({ tone: 'warn', text: view.spendNote });
  return out;
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
  const today = bucharestDay(Date.now());
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
    // a picture of an ad, to save it (?media=<Meta link>)
    if (req.method === 'GET' && req.query && req.query.media) {
      const m = await edit.media(req.query.media);
      if (m.error) { res.status(400).json({ error: m.error }); return; }
      res.setHeader('Content-Type', m.type);
      res.setHeader('Content-Disposition', 'attachment; filename="reclama.' + (m.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg') + '"');
      res.status(200).send(m.buf);
      return;
    }
    if (req.method === 'GET') {
      if (problem) { res.status(200).json({ ok: true, ready: false, reason: problem, message: REASONS[problem], defaults }); return; }
      const period = ads.PERIODS[req.query && req.query.period] ? req.query.period : '7d';
      const range = dayRange(req.query || {});
      // read from Meta at most every 3 minutes for today, every 20 for past days (the same for every open portal)
      const today = bucharestDay(Date.now());
      const past = range ? range.until < today : ['yesterday', '7d', '30d'].includes(period);
      const creds = await appCreds(readJSON);
      const [view, token] = await Promise.all([
        AC.cached('ov-' + (range ? range.since + '_' + range.until : period) + '-' + today, past ? 20 * 60e3 : 3 * 60e3, async () => {
          const recent = await AC.cached('recent-campaigns', 30 * 60e3, () => ads.recentCampaigns(conn), { keep: true });
          if (recent.error) return { error: recent.error };
          const noted = await guard.recent().then((g) => g.log.map((e) => e.campaignId)).catch(() => []);
          return ads.overview(conn, period, range, (recent.ids || []).concat(noted));
        }),
        AC.cached('token', 10 * 60e3, () => ads.tokenInfo(conn.userToken, creds)),
      ]);
      if (view.error) {
        const expired = token && !token.valid;
        const noScope = token && token.valid && !(token.scopes || []).some((x) => x === 'ads_management' || x === 'ads_read');
        res.status(200).json({ ok: true, ready: false, reason: expired ? 'token_expired' : noScope ? 'no_ads_permission' : 'meta_error', defaults,
          message: expired ? 'Conexiunea pentru reclame a expirat. Integrări → Facebook → Reclame: lipește un token nou.' : noScope ? REASONS.no_ads_permission : 'Meta: ' + view.error });
        return;
      }
      // a switch made from the portal shows switched also in a reading older than it (Meta's own status lags behind)
      await AC.laySwitches(view);
      // without ads_management the page only reads (the switches would be refused)
      const readOnly = !!(token && token.valid && !(token.scopes || []).includes('ads_management'));
      await withFunnel(view, period, range, conn).catch((e) => { console.error('ads-manager funnel:', e.message); });
      const stopped = await guard.recent().catch(() => null);
      adNotes(view, stopped && stopped.verdicts, stopped && stopped.verdictsAt);
      // the one-off changes asked for (api/_lib/ads-once.js) show with the guard's, under their campaign
      const once = (await readJSON('data/ads-once.json', {}).catch(() => ({}))) || {};
      if (stopped) stopped.log = standing((once.log || []).filter((e) => e.campaignId && Date.parse(e.at) > Date.now() - 3 * 864e5)
        .map((e) => Object.assign({ type: e.status ? (e.status === 'ACTIVE' ? 'start' : 'stop') : e.to < e.from ? 'down' : 'up', trim: !e.status && e.to < e.from, why: 'cerut de voi' }, e)).concat(stopped.log).sort((a, b) => (a.at < b.at ? 1 : -1)), view);
      res.status(200).json(Object.assign({ ready: true, defaults, token, readOnly, adsManager: ads.adsManagerUrl(conn.adAccountId), guard: stopped, notices: notices(view, stopped) }, view));
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
    // Previzualizare / Editează a running campaign
    // a change from here: the next reading comes from Meta (thrown away once the change is made, below)
    const changes = !['details', 'active_ads', 'creative_of', 'guard_run'].includes(body.action);
    // the guard now, not at its next turn (dry: only what would go off)
    if (body.action === 'guard_run') {
      const at = body.dry && Number(body.at) > 0 ? Number(body.at) : undefined;
      res.status(200).json(await guard.guard({ force: true, dry: !!body.dry, now: at }));
      return;
    }
    if (body.action === 'creative_of') {
      const d = await edit.creativeOf(conn, body.adId);
      if (d.error) { res.status(400).json({ error: 'meta_refused', message: d.error }); return; }
      res.status(200).json(d);
      return;
    }
    if (body.action === 'active_ads') {
      const d = await edit.activeAds(conn);
      if (d.error) { res.status(400).json({ error: 'meta_refused', message: d.error }); return; }
      res.status(200).json(d);
      return;
    }
    if (body.action === 'details') {
      const d = await edit.details(conn, body.campaignId);
      if (d.error) { res.status(400).json({ error: 'meta_refused', message: d.error }); return; }
      res.status(200).json(d);
      return;
    }
    if (body.action === 'edit_ad' || body.action === 'edit_adset') {
      const r = body.action === 'edit_ad' ? await edit.editAd(conn, body) : await edit.editAdset(conn, body);
      if (r.error) { res.status(400).json({ error: 'meta_refused', message: r.error }); return; }
      if (changes) await AC.clear().catch(() => {});
      res.status(200).json(r);
      return;
    }
    const r = await ads.act(conn, body);
    if (r.error) { res.status(400).json({ error: 'meta_refused', message: r.error }); return; }
    if (body.action === 'status') await AC.switched(String(body.id), body.status);
    if (changes) await AC.clear().catch(() => {});
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('ads-manager error:', err.message);
    res.status(500).json({ error: 'ads_failed', message: err.message });
  }
};

module.exports.config = { maxDuration: 60 };
// for Creative's results (api/ads-publish.js ?action=results)
module.exports.withFunnel = withFunnel;
module.exports.connection = connection;
// (api/_lib tests)
module.exports.standing = standing;
module.exports.notices = notices;
