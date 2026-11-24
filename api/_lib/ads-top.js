// Admin → Reclame → Clasament (George, 24.11: „all time ... care a fost cea mai bună reclamă cu cel mai mare roas, să fie
// configurabil pe time frame-uri și să le pot sorta după obiectiv”): every ad of ours that spent in the period, in the
// three ad accounts Centrul360's ads ran in, each with Meta's numbers (spend, leads) and what came after (bookings,
// visits, clients, cards, money in Încasări: api/_lib/ad-outcomes.js, the same as the tiles of Reclame).
//   the connected account (its own scope and rate), and the other two read only, like api/ads-publish.js old_results:
//   centru pls (RON, ours = not ARANCA / BRAZI), summitlane and the stopped one (CAD, ours = „C360 …”)
// Money in lei: CAD at the rate of api/_lib/ads-fx.js (the connected account's, else the BNR's of the day).
// Every after-form action counts once, for one ad: the outcomes run once over the ads of all three accounts together.
// Read only: nothing here changes anything in Meta. Counts and sums only, never a name or a phone of a client.
const ads = require('./meta-ads');
const SCOPE = require('./ads-scope');
const FXL = require('./ads-fx');
const AC = require('./ads-cache');
const KPI = require('./kpi');
const { readJSON } = require('./store');
const { periodRange, bucharestDay } = require('./ads-funnel');

const ACCOUNTS = ['act_4502494523405059', 'act_989208510351291', 'act_1136609638911845'];
const EVERY = ads.LIVE.concat(['ARCHIVED', 'DELETED']);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const chunks = (list, n) => { const out = []; for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; };
const why = (j) => { const e = (j && j.error) || {}; return e.error_user_msg || e.message || 'Meta a refuzat citirea.'; };

async function pages(path, tok, params, max) {
  const out = [];
  let r = await ads.call('GET', path, tok, params);
  for (let i = 0; i < max; i++) {
    if (!r.ok) return { error: why(r.j) };
    out.push(...(r.j.data || []));
    const next = r.j.paging && r.j.paging.next;
    if (!next) return { data: out };
    r = await ads.call('GET', next, tok, {});
  }
  return { data: out, truncated: true };
}
// the ads / ad sets of these campaigns, archived and deleted ones too (else only the live ones)
async function byCampaign(c, edge, fields, ids) {
  const one = async (part) => {
    const q = (st) => ({ fields, limit: '200', effective_status: JSON.stringify(st), filtering: JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: part }]) });
    let r = await pages('/' + c.adAccountId + '/' + edge, c.userToken, q(EVERY), 10);
    if (r.error) r = await pages('/' + c.adAccountId + '/' + edge, c.userToken, q(ads.LIVE), 10);
    return r;
  };
  const got = await Promise.all(chunks(ids, 50).map(one));
  const bad = got.find((r) => r.error);
  return bad || { data: got.flatMap((r) => r.data) };
}

// the city of an ad: TM / AR in its names (the ad set's first), else where its ad set reaches
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const word = (re) => new RegExp('(^|[^a-z0-9])(' + re + ')([^a-z0-9]|$)');
const IS = { TM: word('tm|timisoara|timis'), AR: word('ar|arad') };
function cityOfName(s) {
  const n = norm(s), tm = IS.TM.test(n), ar = IS.AR.test(n);
  return tm && !ar ? 'TM' : ar && !tm ? 'AR' : '';
}
function cityOfTargeting(t) {
  const g = (t && t.geo_locations) || {};
  const near = (lat, lng) => Object.keys(ads.CITIES).find((k) => Math.abs(ads.CITIES[k].lat - lat) < 0.08 && Math.abs(ads.CITIES[k].lng - lng) < 0.1) || '';
  const names = (g.custom_locations || []).map((x) => near(+x.latitude, +x.longitude)).concat((g.cities || []).map((x) => x.name || ''));
  const found = new Set(names.map(cityOfName).filter(Boolean));
  return found.size === 1 ? [...found][0] : found.size > 1 ? 'TM+AR' : '';
}

// one account's ads of the period: Meta's numbers in lei, the picture, the status, the city, where it sends
async function readAccount(c, when, whenNew, noNew) {
  const tok = c.userToken, act = c.adAccountId;
  const acc = await ads.call('GET', '/' + act, tok, { fields: 'name,currency,account_status' });
  if (!acc.ok) return { error: why(acc.j) };
  // not the connected account: its own currency's rate (Meta says which), never 1 on CAD
  if (!c.connected) Object.defineProperty(c, 'fx', { value: await FXL.rateOf(acc.j.currency || FXL.KNOWN[act] || 'RON'), enumerable: false, configurable: true });
  const filt = JSON.stringify([{ field: 'ad.effective_status', operator: 'IN', value: EVERY }]);
  const ins = (w, fields) => pages('/' + act + '/insights', tok, Object.assign({ level: 'ad', fields, limit: '500', filtering: filt }, w), 20);
  const [rows, rowsNew] = await Promise.all([
    ins(when, 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,objective,' + ads.RESULTS),
    whenNew ? ins(whenNew, 'ad_id,spend') : null,
  ]);
  if (rows.error) return { error: rows.error };
  if (rowsNew && rowsNew.error) return { error: rowsNew.error };
  const mine = rows.data.filter((x) => x.ad_id && ads.ours(c, x.campaign_name));
  const spentNew = new Map(((rowsNew && rowsNew.data) || []).map((x) => [String(x.ad_id), ads.inLei(c, x.spend)]));
  const campIds = [...new Set(mine.map((x) => String(x.campaign_id)))];
  const [adm, setm] = campIds.length ? await Promise.all([
    byCampaign(c, 'ads', 'id,status,effective_status,created_time,creative{thumbnail_url,image_url}', campIds),
    byCampaign(c, 'adsets', 'id,destination_type,targeting', campIds),
  ]) : [{ data: [] }, { data: [] }];
  const adOf = new Map(((adm && adm.data) || []).map((a) => [String(a.id), a]));
  const setOf = new Map(((setm && setm.data) || []).map((s) => [String(s.id), s]));
  const out = mine.map((x) => {
    const a = adOf.get(String(x.ad_id)) || {}, s = setOf.get(String(x.adset_id)) || {};
    const site = s.destination_type ? s.destination_type === 'WEBSITE' : ads.SITE_OBJECTIVES.includes(x.objective);
    const spend = ads.inLei(c, x.spend), st = ads.siteOf(c, x);
    return {
      adId: String(x.ad_id), ad: x.ad_name || '', adsetId: String(x.adset_id || ''), adset: x.adset_name || '', campaignId: String(x.campaign_id || ''), campaign: x.campaign_name || '',
      objective: x.objective || '', site, city: cityOfName(x.adset_name) || cityOfName(x.campaign_name) || cityOfName(x.ad_name) || cityOfTargeting(s.targeting),
      status: a.effective_status || (adm && adm.error ? '' : 'ARCHIVED'), created: a.created_time || '', thumb: (a.creative && (a.creative.thumbnail_url || a.creative.image_url)) || '',
      spend, spendNew: noNew ? 0 : whenNew ? r2(spentNew.get(String(x.ad_id)) || 0) : spend,
      leads: ads.leadsOf(x), impressions: Number(x.impressions) || 0, linkClicks: Number(x.inline_link_clicks) || 0, visits: st.visits, purchases: st.purchases,
    };
  });
  return { ok: true, act, name: acc.j.name || act, currency: acc.j.currency || '', rate: ads.FX(c), accountStatus: acc.j.account_status,
    rows: out, partial: !!(rows.truncated || (adm && adm.error) || (setm && setm.error)) };
}

// the connection of each account: the connected one as it is, the others a copy with their own scope (read only)
async function connections(conn) {
  const saved = await SCOPE.load(readJSON);
  return [...new Set([conn.adAccountId].concat(ACCOUNTS))].filter(Boolean).map((act) => {
    if (act === conn.adAccountId) { const c = Object.create(conn); Object.defineProperty(c, 'connected', { value: true }); return c; }
    const c = Object.assign({}, conn, { adAccountId: act });
    Object.defineProperty(c, 'scope', { value: SCOPE.forAccount(saved, act), enumerable: false, configurable: true });
    Object.defineProperty(c, 'fx', { value: 0, enumerable: false, configurable: true, writable: true });
    return c;
  });
}

const ms = (n) => new Promise((r) => setTimeout(() => r({ error: 'Meta răspunde greu acum.' }), n));
// GET: { ok, period, range, since, accounts: [{ act, name, currency, rate, ok, error, rows }], rows: [...] }
async function top(conn, period, range) {
  const AM = require('../ads-manager');
  const today = bucharestDay(Date.now()), first = bucharestDay(KPI.cfg.start);
  const r0 = periodRange(period, range);
  const tr = (r) => ({ time_range: JSON.stringify({ since: r.since, until: r.until }) });
  const when = range ? tr(range) : { date_preset: ads.PERIODS[period] || 'maximum' };
  // the spend of the days the portal's data counts (from 16.10.2026): the costs after the form and the ROAS use it
  const until = r0 ? r0.until : today;
  const noNew = until < first;
  const whenNew = !noNew && (!r0 || r0.since < first) ? tr({ since: first, until }) : null;
  const key = range ? range.since + '_' + range.until : period;
  const ttl = (r0 ? r0.until < today : false) ? 30 * 60e3 : period === 'max' ? 30 * 60e3 : 10 * 60e3;
  const conns = await connections(conn);
  const got = await Promise.all(conns.map((c) => Promise.race([
    AC.cached('top-' + c.adAccountId + '-' + key + '-' + today, ttl, () => readAccount(c, when, whenNew, noNew), { keep: true }).catch((e) => ({ error: e.message })),
    ms(24e3),
  ])));
  // one view of the three accounts, for the outcomes (each action once, for one ad)
  const view = { campaigns: [] };
  const per = conns.map((c, i) => {
    const g = got[i] || {}, camps = new Map();
    (g.rows || []).forEach((x) => {
      let k = camps.get(x.campaignId);
      if (!k) { k = { id: x.campaignId, name: x.campaign, objective: x.objective, site: false, status: '', adsets: [], sets: new Map() }; camps.set(x.campaignId, k); }
      let s = k.sets.get(x.adsetId);
      if (!s) { s = { id: x.adsetId, name: x.adset, status: '', ads: [] }; k.sets.set(x.adsetId, s); k.adsets.push(s); }
      k.site = k.site || x.site;
      s.ads.push(Object.assign({ id: x.adId, name: x.ad, act: c.adAccountId }, x));
    });
    const list = [...camps.values()];
    list.forEach((k) => { delete k.sets; });
    view.campaigns.push(...list);
    return { c, g, list };
  });
  // the website ads: the site's own records (their tags), per account (each its own links), each record once
  const seen = new Set(), touches = [];
  const sites = await Promise.all(per.map((p) => (p.list.some((k) => k.site) ? AM.withSite({ campaigns: p.list }, period, range, p.c).catch(() => []) : [])));
  sites.flat().forEach((t) => { const k = [t.kind, t.id, t.t, t.adId, t.campaignId].join('|'); if (!seen.has(k)) { seen.add(k); touches.push(t); } });
  await AM.withOutcomes(view, period, range, touches).catch((e) => { console.error('ads top outcomes:', e.message); });
  const n = (v) => Number(v) || 0;
  const div = (a, b) => (b > 0 ? r2(a / b) : null);
  const rows = [];
  view.campaigns.forEach((k) => k.adsets.forEach((s) => s.ads.forEach((a) => {
    const leads = (k.site ? 0 : n(a.leads)) + n(a.sLead);
    rows.push({
      adId: a.id, ad: a.ad, campaignId: k.id, campaign: k.name, adset: a.adset, act: a.act, objective: a.objective, site: !!k.site, city: a.city,
      status: a.status, on: a.status === 'ACTIVE', created: a.created, thumb: a.thumb,
      spend: r2(a.spend), spendNew: r2(a.spendNew), leads, booked: n(a.oBooked), showed: n(a.oShowed), clients: n(a.oClients),
      cashed: r2(a.oCashed), cardsPaid: n(a.oCardPaid), cardsPaidLei: r2(a.oCardPaidLei), cardsReserved: n(a.oCardRes),
      cpl: div(n(a.spend), leads), cpb: div(n(a.spendNew), n(a.oBooked)), cps: div(n(a.spendNew), n(a.oShowed)), cpc: div(n(a.spendNew), n(a.oClients)), roas: div(n(a.oCashed), n(a.spendNew)),
    });
  })));
  const accounts = per.map(({ c, g }) => ({ act: c.adAccountId, connected: !!c.connected, name: g.name || c.adAccountId, currency: g.currency || '', rate: g.rate || null,
    ok: !g.error, error: g.error || '', partial: !!g.partial, readAt: g.readAt || null, stale: g.stale || null }));
  return { ok: true, ready: true, period: range ? 'custom' : period, range: range || null, since: first, reachesBack: !!whenNew || noNew, accounts, rows };
}

module.exports = { top, cityOfName, cityOfTargeting, ACCOUNTS };
