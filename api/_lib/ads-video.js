// A video ad made from a file Claude edited, and a look at the account's video ads (Claude, with the report key).
//   28.10, the owner: the winning Timișoara LipoSonix / HIFU abdomen video, with "Arad" on its label, goes to Arad at
//   60 lei a day ("ala e green light"). Everything is copied from the Timișoara ad (its ad set's audience and settings,
//   the lead form, the texts); only the city changes: Arad around its centre, "ARAD!" at the start of the text.
// Claude sends the file and its cover (POST, &put=video / &put=thumb), reads what will be made (&step=look), then makes
// it once (&step=make): paused first, switched on at the end, and whatever was made is deleted again if Meta refuses a
// step (like api/_lib/meta-ads.js publish()). data/ads-video.json: { [job]: { videoId, hash, campaignId, adsetId, adId } }

const { readJSON, writeJSON } = require('./store');
const { loadConnection } = require('./facebook');
const ads = require('./meta-ads');
const { funnel } = require('./ads-funnel');

const KEY = 'data/ads-video.json';
const VIDEO_GRAPH = 'https://graph-video.facebook.com/v25.0';
const JOBS = {
  'arad-vid3-2026-10-28': {
    fromAd: '120251418156010103', city: 'Arad', daily: 60,
    campaignName: 'AR VIDEO · HIFU abdomen · Arad', adsetName: 'Arad · femei', adName: 'video Arad',
    text: (t) => String(t || '').replace(/^\s*TIMIȘOARA!/, 'ARAD!'),
  },
};

const G = (method, path, conn, params) => ads.call(method, path, conn.userToken, params);
const why = (j) => (j && j.error && (j.error.error_user_msg || j.error.message)) || 'Meta n-a răspuns';

// what the Timișoara ad is made of, and what the new one will be
async function plan(conn, job) {
  const j = JOBS[job];
  const src = await G('GET', '/' + j.fromAd, conn, { fields: 'account_id,name,creative{object_story_spec,asset_feed_spec},adset{name,targeting,optimization_goal,billing_event,bid_strategy,bid_amount,promoted_object,destination_type,attribution_spec,daily_budget},campaign{name,objective,special_ad_categories,buying_type,bid_strategy,daily_budget}' });
  if (!src.ok) return { error: 'Reclama din Timișoara: ' + why(src.j) };
  if ('act_' + src.j.account_id !== conn.adAccountId) return { error: 'Reclama din Timișoara nu e în contul conectat.' };
  const set = src.j.adset || {}, camp = src.j.campaign || {};
  const spec = ((src.j.creative || {}).object_story_spec) || {};
  const vd = spec.video_data;
  if (!vd || !vd.call_to_action) return { error: 'Reclama din Timișoara nu e un video cu formular.' };
  const t = JSON.parse(JSON.stringify(set.targeting || {}));
  const geo = t.geo_locations || {};
  const near = (geo.custom_locations || [])[0];
  const c = ads.CITIES[j.city];
  t.geo_locations = { custom_locations: [{ latitude: c.lat, longitude: c.lng, radius: near ? Number(near.radius) : 7, distance_unit: near ? near.distance_unit || 'kilometer' : 'kilometer' }],
    location_types: geo.location_types || ['home', 'recent'] };
  const adset = { name: j.adsetName, daily_budget: String(j.daily * 100), billing_event: set.billing_event || 'IMPRESSIONS', optimization_goal: set.optimization_goal || 'LEAD_GENERATION',
    bid_strategy: set.bid_strategy || 'LOWEST_COST_WITHOUT_CAP', destination_type: set.destination_type || 'ON_AD', promoted_object: set.promoted_object || { page_id: conn.pageId }, targeting: t, status: 'PAUSED' };
  if (set.bid_amount) adset.bid_amount = set.bid_amount;
  if (set.attribution_spec) adset.attribution_spec = set.attribution_spec;
  // the form: the portal keeps each form's city, and that wins over the campaign's name (api/_lib/fb-leads.js), so a
  // Timișoara form would bring Arad's women in as Timișoara's: the same procedure's form of the new city, the one with
  // the latest lead
  const reg = ((await readJSON('data/fb-forms.json', {})) || {}).forms || {};
  const formId = String((vd.call_to_action.value || {}).lead_gen_form_id || '');
  const f = reg[formId] || {};
  const cityOf = (x) => x.location || (x.detected && x.detected.location) || '';
  const pick = j.formId ? Object.assign({ id: j.formId }, reg[j.formId] || {}) : cityOf(f) === j.city ? Object.assign({ id: formId }, f)
    : Object.entries(reg).filter(([, x]) => cityOf(x) === j.city && x.kind !== 'hiring' && (x.offerId || (x.detected || {}).offerId) === (f.offerId || (f.detected || {}).offerId))
      .map(([id, x]) => Object.assign({ id }, x)).sort((a, b) => String(b.lastAt || '').localeCompare(String(a.lastAt || '')))[0];
  const others = Object.entries(reg).filter(([, x]) => cityOf(x) === j.city && x.kind !== 'hiring').map(([id, x]) => ({ id, name: x.name, offer: x.offerId || (x.detected || {}).offerId || '', leads: x.leads || 0, lastAt: x.lastAt || '' }));
  const cta = JSON.parse(JSON.stringify(vd.call_to_action));
  if (pick) cta.value = Object.assign({}, cta.value, { lead_gen_form_id: pick.id });
  const video_data = { title: vd.title, message: j.text(vd.message), call_to_action: cta };
  return {
    source: { ad: src.j.name, adset: set.name, campaign: camp.name, objective: camp.objective, campaignBudget: camp.daily_budget || null, sourceGeo: geo },
    campaign: { name: j.campaignName, objective: camp.objective || 'OUTCOME_LEADS', status: 'PAUSED', special_ad_categories: camp.special_ad_categories || [], buying_type: camp.buying_type || 'AUCTION', is_adset_budget_sharing_enabled: false },
    adset, spec: { page_id: spec.page_id || conn.pageId, instagram_user_id: spec.instagram_user_id, video_data },
    form: { id: formId, name: f.name || '', location: f.location || '', offerId: f.offerId || '', detected: f.detected || null },
    useForm: pick ? { id: pick.id, name: pick.name || '', location: cityOf(pick), offerId: pick.offerId || (pick.detected || {}).offerId || '', leads: pick.leads || 0, lastAt: pick.lastAt || '' } : null,
    cityForms: others,
  };
}

async function put(job, kind, buf) {
  const conn = await loadConnection(readJSON);
  if (!conn.userToken || !conn.adAccountId) return { error: 'not_connected' };
  if (!Buffer.isBuffer(buf) || buf.length < 1000) return { error: 'fișierul lipsește' };
  const doc = await readJSON(KEY, {});
  const d = doc[job] = doc[job] || {};
  if (d.adId) return { error: 'reclama e deja făcută', adId: d.adId };
  if (kind === 'video') {
    const fd = new FormData();
    fd.append('access_token', conn.userToken);
    fd.append('name', JOBS[job].adName);
    fd.append('source', new Blob([buf], { type: 'video/mp4' }), 'video.mp4');
    const r = await fetch(VIDEO_GRAPH + '/' + conn.adAccountId + '/advideos', { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) return { error: 'Video: ' + why(j) };
    d.videoId = String(j.id);
  } else if (kind === 'thumb') {
    const r = await G('POST', '/' + conn.adAccountId + '/adimages', conn, { bytes: buf.toString('base64'), name: 'video-cover.jpg' });
    const imgs = (r.ok && r.j.images) || {};
    const hash = (imgs[Object.keys(imgs)[0]] || {}).hash;
    if (!hash) return { error: 'Coperta: ' + why(r.j) };
    d.hash = hash;
  } else return { error: 'put=video sau put=thumb' };
  await writeJSON(KEY, doc);
  return { ok: true, videoId: d.videoId || '', hash: d.hash || '' };
}

async function look(job) {
  const conn = await loadConnection(readJSON);
  if (!conn.userToken || !conn.adAccountId) return { error: 'not_connected' };
  const d = (await readJSON(KEY, {}))[job] || {};
  const p = await plan(conn, job);
  const video = d.videoId ? await G('GET', '/' + d.videoId, conn, { fields: 'status,length' }) : null;
  return Object.assign({ have: d, video: video && (video.ok ? video.j : { error: why(video.j) }) }, p);
}

async function make(job) {
  const conn = await loadConnection(readJSON);
  if (!conn.userToken || !conn.adAccountId) return { error: 'not_connected' };
  const doc = await readJSON(KEY, {});
  const d = doc[job] = doc[job] || {};
  if (d.adId) return { ok: true, already: true, campaignId: d.campaignId, adsetId: d.adsetId, adId: d.adId };
  if (!d.videoId || !d.hash) return { error: 'întâi video-ul și coperta' };
  if (d.making && Date.now() - Date.parse(d.making) < 10 * 60e3) return { error: 'se face deja (de acum ' + Math.round((Date.now() - Date.parse(d.making)) / 1000) + ' s)' };
  const p = await plan(conn, job);
  if (p.error) return p;
  if (!p.useForm) return { error: 'niciun formular pentru ' + JOBS[job].city, cityForms: p.cityForms };
  d.making = new Date().toISOString();
  await writeJSON(KEY, doc);
  const act = conn.adAccountId;
  const made = [];
  const undo = async () => { for (const id of made.slice().reverse()) await G('DELETE', '/' + id, conn).catch(() => {}); };
  const fail = async (step, j) => { await undo(); delete d.making; await writeJSON(KEY, doc); return { error: step + ': ' + why(j), detail: j && j.error }; };
  try {
    const camp = await G('POST', '/' + act + '/campaigns', conn, p.campaign);
    if (!camp.ok) return fail('Campania', camp.j);
    made.push(camp.j.id);
    const set = await G('POST', '/' + act + '/adsets', conn, Object.assign({ campaign_id: camp.j.id }, p.adset));
    if (!set.ok) return fail('Setul de reclame', set.j);
    made.push(set.j.id);
    const spec = Object.assign({}, p.spec, { video_data: Object.assign({}, p.spec.video_data, { video_id: d.videoId, image_hash: d.hash }) });
    if (!spec.instagram_user_id) delete spec.instagram_user_id;
    const cr = await G('POST', '/' + act + '/adcreatives', conn, { name: JOBS[job].adName, object_story_spec: spec });
    if (!cr.ok) return fail('Reclama (video și texte)', cr.j);
    made.push(cr.j.id);
    const ad = await G('POST', '/' + act + '/ads', conn, { name: JOBS[job].adName, adset_id: set.j.id, creative: { creative_id: cr.j.id }, status: 'ACTIVE' });
    if (!ad.ok) return fail('Reclama', ad.j);
    Object.assign(d, { campaignId: camp.j.id, adsetId: set.j.id, creativeId: cr.j.id, adId: ad.j.id, at: new Date().toISOString() });
    delete d.making;
    await writeJSON(KEY, doc);
    const a = await G('POST', '/' + set.j.id, conn, { status: 'ACTIVE' });
    const c = await G('POST', '/' + camp.j.id, conn, { status: 'ACTIVE' });
    return { ok: true, campaignId: camp.j.id, adsetId: set.j.id, adId: ad.j.id, started: a.ok && c.ok, warning: !a.ok ? why(a.j) : !c.ok ? why(c.j) : undefined };
  } catch (err) {
    return fail('Rețea', { error: { message: err.message } });
  }
}

// how the made ad is doing in review and delivery
async function status(job) {
  const conn = await loadConnection(readJSON);
  const d = (await readJSON(KEY, {}))[job] || {};
  if (!d.adId) return { have: d };
  const [c, a, v] = await Promise.all([
    G('GET', '/' + d.campaignId, conn, { fields: 'name,effective_status,adsets{effective_status,daily_budget,targeting{geo_locations,age_min,age_max,genders}}' }),
    G('GET', '/' + d.adId, conn, { fields: 'effective_status,issues_info,ad_review_feedback' }),
    G('GET', '/' + d.videoId, conn, { fields: 'status' }),
  ]);
  return { have: d, campaign: c.ok ? c.j : why(c.j), ad: a.ok ? a.j : why(a.j), video: v.ok ? v.j : why(v.j) };
}

// every ad since the start of the year (archived and deleted ones too): spend, Meta's leads, what the portal saw those
// leads become, and whether it is a video (its file, to watch the ones that did well). Read only.
async function videos(since) {
  const conn = await loadConnection(readJSON);
  if (!conn.userToken || !conn.adAccountId) return { error: 'not_connected' };
  const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t));
  const range = { since: /^\d{4}-\d{2}-\d{2}$/.test(String(since || '')) ? since : '2026-01-01', until: day(Date.now()) };
  const st = await ads.adStats(conn, range);
  if (st.error) return { error: st.error };
  const [leads, appts, sales, stages] = await Promise.all([readJSON('data/leads.json', []), readJSON('data/appointments.json', []), readJSON('data/sales.json', []), readJSON('data/pipeline-stages.json', null)]);
  const appointments = (appts || []).filter((a) => a.createdBy !== 'highlevel' && !a.importedAt && !a.ghlId);
  const sts = Array.isArray(stages) && stages.length ? stages : [{ id: 'lead_nou', kind: 'open' }, { id: 'contactat', kind: 'open' }, { id: 'programare_stabilita', kind: 'booked' },
    { id: 'venit_la_programare', kind: 'open' }, { id: 'client_fidel', kind: 'won' }, { id: 'pierdut', kind: 'lost' }];
  const f = funnel({ leads, appointments, sales, stages: sts, ads: st.rows.map((r) => ({ id: r.adId, name: r.adName, adsetId: r.adsetId, campaignId: r.campaignId, campaignName: r.campaignName })), range });
  const rows = st.rows.filter((r) => r.spend >= 50).sort((a, b) => b.spend - a.spend).slice(0, 60);
  // the creatives, 50 ads a call
  const info = {};
  for (let i = 0; i < rows.length; i += 50) {
    const r = await G('GET', '/', conn, { ids: rows.slice(i, i + 50).map((x) => x.adId).join(','), fields: 'created_time,creative{video_id,object_type,title,body,object_story_spec,asset_feed_spec}' });
    if (r.ok) Object.assign(info, r.j);
    else info.error = why(r.j);
  }
  const out = [];
  for (const r of rows) {
    const cr = { j: info[r.adId] || {} };
    const c = cr.j.creative || {};
    const oss = c.object_story_spec || {};
    const afs = c.asset_feed_spec || {};
    const vid = c.video_id || (oss.video_data || {}).video_id || ((afs.videos || [])[0] || {}).video_id || '';
    const text = (oss.video_data || {}).message || (oss.link_data || {}).message || c.body || ((afs.bodies || [])[0] || {}).text || '';
    const title = (oss.video_data || {}).title || (oss.link_data || {}).name || c.title || ((afs.titles || [])[0] || {}).text || '';
    const x = f.ads.get(r.adId) || {};
    out.push({ adId: r.adId, ad: r.adName, campaign: r.campaignName, campaignId: r.campaignId, status: r.status, created: String((cr.j && cr.j.created_time) || '').slice(0, 10),
      kind: vid ? 'video' : c.object_type || '', videoId: vid, spend: Math.round(r.spend), metaLeads: r.metaLeads, leads: x.leads || 0, booked: x.booked || 0, came: x.showed || 0, money: Math.round(x.revenue || 0),
      title, text: text.slice(0, 220) });
  }
  return { range, total: st.rows.length, creativesError: info.error, rows: out };
}
// a video's file, to watch it (Claude)
async function videoFile(id) {
  const conn = await loadConnection(readJSON);
  const v = await G('GET', '/' + id, conn, { fields: 'source,length,picture' });
  return v.ok ? v.j : { error: why(v.j) };
}

module.exports = { JOBS, put, look, make, status, videos, videoFile };
