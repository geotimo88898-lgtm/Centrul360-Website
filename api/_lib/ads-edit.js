// Reclame → a running campaign: what its ads say and show (Previzualizare), and changing them
// (Editează): the texts, headlines, descriptions, button and form of an ad, the audience and budget of
// its ad set. Meta never changes an ad's texts in place: a new "creative" is made from the old one
// with the new words and the ad switches to it (Meta checks it again; the results stay with the ad).

const ADS_GRAPH = 'https://graph.facebook.com/v25.0';

async function call(method, path, token, params) {
  const url = ADS_GRAPH + path;
  if (method === 'GET' || method === 'DELETE') {
    const q = new URLSearchParams(Object.assign({ access_token: token }, params || {}));
    const r = await fetch(url + '?' + q, { method });
    return { ok: r.ok, j: await r.json().catch(() => ({})) };
  }
  const body = new URLSearchParams({ access_token: token });
  Object.entries(params || {}).forEach(([k, v]) => body.set(k, typeof v === 'string' ? v : JSON.stringify(v)));
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  return { ok: r.ok, j: await r.json().catch(() => ({})) };
}
const err = (j, step) => (step ? step + ': ' : '') + (((j && j.error) || {}).error_user_msg || ((j && j.error) || {}).message || 'eroare necunoscută');
const uniq = (a) => a.map((x) => String(x || '').trim()).filter((x, i, arr) => x && arr.indexOf(x) === i);

const CREATIVE_FIELDS = 'id,name,object_story_spec,asset_feed_spec,image_url,thumbnail_url,body,title,call_to_action_type,instagram_user_id';

// one ad's words and pictures, from its creative (a plain one, or one with several texts / images)
function partsOf(cr) {
  const s = cr.object_story_spec || {}, ld = s.link_data || {}, vd = s.video_data || {}, af = cr.asset_feed_spec || null;
  const out = {
    texts: uniq([].concat(af && af.bodies ? af.bodies.map((b) => b.text) : [], ld.message, vd.message, cr.body)),
    headlines: uniq([].concat(af && af.titles ? af.titles.map((b) => b.text) : [], ld.name, vd.title, cr.title)),
    descriptions: uniq([].concat(af && af.descriptions ? af.descriptions.map((b) => b.text) : [], ld.description, vd.link_description)),
    cta: (ld.call_to_action && ld.call_to_action.type) || (vd.call_to_action && vd.call_to_action.type) || (af && af.call_to_action_types && af.call_to_action_types[0]) || cr.call_to_action_type || '',
    formId: String(((ld.call_to_action || vd.call_to_action || {}).value || {}).lead_gen_form_id || ''),
    hashes: uniq([].concat(af && af.images ? af.images.map((i) => i.hash) : [], ld.image_hash)),
    imageUrl: cr.image_url || ld.picture || vd.image_url || '',
    video: !!(vd.video_id || (af && af.videos && af.videos.length)),
    editable: !!(s.link_data || af),
    multi: !!af,
  };
  if (af && af.call_to_action_types && !out.formId && s.link_data) out.formId = String(((s.link_data.call_to_action || {}).value || {}).lead_gen_form_id || '');
  return out;
}

// every running ad of the account with its words, button, form, place and Meta's review, in ONE call (a check of all
// the ads without one call per campaign, which Meta answers with "too many calls")
async function activeAds(conn) {
  const r = await call('GET', '/' + conn.adAccountId + '/ads', conn.userToken, {
    fields: 'id,name,effective_status,ad_review_feedback,issues_info,campaign{id,name,effective_status},adset{id,name,targeting},creative{' + CREATIVE_FIELDS + '}',
    effective_status: JSON.stringify(['ACTIVE', 'PENDING_REVIEW', 'IN_PROCESS', 'WITH_ISSUES', 'DISAPPROVED', 'PENDING_BILLING_INFO']),
    limit: '150',
  });
  if (!r.ok) return { error: err(r.j, 'Reclamele') };
  const ads = (r.j.data || []).map((a) => {
    const p = partsOf(a.creative || {});
    const geo = ((a.adset || {}).targeting || {}).geo_locations || {};
    delete p.hashes;
    return Object.assign({
      id: a.id, name: a.name, status: a.effective_status, review: a.ad_review_feedback || null, issues: a.issues_info || null, campaignStatus: (a.campaign || {}).effective_status || '',
      campaignId: (a.campaign || {}).id, campaign: (a.campaign || {}).name, adsetId: (a.adset || {}).id, adset: (a.adset || {}).name,
      places: [].concat((geo.custom_locations || []).map((l) => (l.address_string || l.name || (l.latitude + ',' + l.longitude)) + ' ' + (l.radius || '') + (l.distance_unit || '')), (geo.cities || []).map((c) => c.name)),
      creativeId: (a.creative || {}).id,
    }, p);
  });
  return { ok: true, ads };
}

// Previzualizare / Editează: the campaign's ad sets (audience, budget) and ads (texts, images)
async function details(conn, campaignId) {
  const tok = conn.userToken;
  if (!/^\d{5,25}$/.test(String(campaignId || ''))) return { error: 'ID invalid' };
  const own = await call('GET', '/' + campaignId, tok, { fields: 'account_id,name,daily_budget' });
  if (!own.ok) return { error: err(own.j) };
  if ('act_' + own.j.account_id !== conn.adAccountId) return { error: 'Nu e în contul de reclame conectat.' };
  const [sets, ads] = await Promise.all([
    call('GET', '/' + campaignId + '/adsets', tok, { fields: 'id,name,status,daily_budget,targeting', limit: '25' }),
    call('GET', '/' + campaignId + '/ads', tok, { fields: 'id,name,status,adset_id,creative{' + CREATIVE_FIELDS + '}', limit: '50' }),
  ]);
  if (!sets.ok) return { error: err(sets.j, 'Seturile') };
  if (!ads.ok) return { error: err(ads.j, 'Reclamele') };
  const list = (ads.j.data || []).map((a) => Object.assign({ id: a.id, name: a.name, status: a.status, adsetId: a.adset_id, creativeId: a.creative && a.creative.id }, partsOf(a.creative || {})));
  // the pictures at full size (by their hashes in the ad account)
  const hashes = uniq([].concat(...list.map((a) => a.hashes)));
  const urls = new Map();
  if (hashes.length) {
    const im = await call('GET', '/' + conn.adAccountId + '/adimages', tok, { hashes: JSON.stringify(hashes), fields: 'hash,url,permalink_url,width,height' });
    (im.ok ? im.j.data || [] : []).forEach((x) => urls.set(x.hash, x.permalink_url || x.url));
  }
  list.forEach((a) => { a.images = a.hashes.map((h) => urls.get(h)).filter(Boolean); if (!a.images.length && a.imageUrl) a.images = [a.imageUrl]; delete a.hashes; delete a.imageUrl; });
  const adsets = (sets.j.data || []).map((s) => {
    const t = s.targeting || {}, loc = ((t.geo_locations || {}).custom_locations || [])[0] || null;
    const fb = t.facebook_positions || [], ig = t.instagram_positions || [];
    const plats = t.publisher_platforms || [];
    const pl = [];
    if (plats.includes('facebook')) { if (!fb.length || fb.includes('feed')) pl.push('fb_feed'); if (!fb.length || fb.includes('story')) pl.push('fb_story'); if (!fb.length || fb.includes('facebook_reels')) pl.push('fb_reels'); }
    if (plats.includes('instagram')) { if (!ig.length || ig.includes('stream')) pl.push('ig_feed'); if (!ig.length || ig.includes('story')) pl.push('ig_story'); if (!ig.length || ig.includes('reels')) pl.push('ig_reels'); }
    return {
      id: s.id, name: s.name, status: s.status, budget: s.daily_budget ? Number(s.daily_budget) / 100 : 0,
      ageMin: t.age_min || 18, ageMax: t.age_max || 65, women: Array.isArray(t.genders) && t.genders.length === 1 && t.genders[0] === 2,
      radiusKm: loc ? (loc.distance_unit === 'mile' ? Math.round(loc.radius * 1.609) : Number(loc.radius)) : 0, hasPin: !!loc,
      placements: plats.length ? pl : [], automatic: !plats.length,
    };
  });
  return { ok: true, campaign: { id: campaignId, name: own.j.name, cbo: !!own.j.daily_budget, budget: own.j.daily_budget ? Number(own.j.daily_budget) / 100 : 0 }, adsets, ads: list };
}

// Editează → the ad: new words on a copy of its creative, then the ad uses the copy
async function editAd(conn, a) {
  const tok = conn.userToken;
  if (!/^\d{5,25}$/.test(String(a.adId || ''))) return { error: 'ID invalid' };
  const ad = await call('GET', '/' + a.adId, tok, { fields: 'account_id,name,creative{' + CREATIVE_FIELDS + '}' });
  if (!ad.ok) return { error: err(ad.j) };
  if ('act_' + ad.j.account_id !== conn.adAccountId) return { error: 'Nu e în contul de reclame conectat.' };
  const cr = ad.j.creative || {};
  const clean = (list, n, max) => uniq(Array.isArray(list) ? list : []).slice(0, n).map((x) => x.slice(0, max));
  const texts = clean(a.texts, 5, 2000), heads = clean(a.headlines, 5, 255), descs = clean(a.descriptions, 5, 255);
  if (!texts.length) return { error: 'Scrie textul reclamei.' };
  const CTAS = ['LEARN_MORE', 'SIGN_UP', 'BOOK_NOW', 'GET_OFFER', 'APPLY_NOW', 'GET_QUOTE'];
  const cta = CTAS.includes(a.cta) ? a.cta : '';
  const formId = /^\d{5,25}$/.test(String(a.formId || '')) ? String(a.formId) : '';
  const spec = JSON.parse(JSON.stringify(cr.object_story_spec || {}));
  // the Instagram account signs the ad (the older field name moves to the new one)
  if (spec.instagram_actor_id && !spec.instagram_user_id) spec.instagram_user_id = spec.instagram_actor_id;
  if (cr.instagram_user_id && !spec.instagram_user_id) spec.instagram_user_id = cr.instagram_user_id;
  delete spec.instagram_actor_id;
  let feed = cr.asset_feed_spec ? JSON.parse(JSON.stringify(cr.asset_feed_spec)) : null;
  let single = false;
  if (feed) {
    // several texts / headlines: the lists change, the rest of the creative stays
    feed.bodies = texts.map((text) => ({ text }));
    if (heads.length) feed.titles = heads.map((text) => ({ text })); else delete feed.titles;
    if (descs.length) feed.descriptions = descs.map((text) => ({ text })); else delete feed.descriptions;
    if (cta) feed.call_to_action_types = [cta];
    if (spec.link_data && spec.link_data.call_to_action) {
      if (cta) spec.link_data.call_to_action.type = cta;
      if (formId) spec.link_data.call_to_action.value = Object.assign({}, spec.link_data.call_to_action.value, { lead_gen_form_id: formId });
    }
    // a video ad with several texts keeps its button and form in video_data
    if (spec.video_data && spec.video_data.call_to_action) {
      if (cta) spec.video_data.call_to_action.type = cta;
      if (formId) spec.video_data.call_to_action.value = Object.assign({}, spec.video_data.call_to_action.value, { lead_gen_form_id: formId });
    }
  } else if (spec.link_data) {
    const ld = spec.link_data;
    ld.message = texts[0];
    if (heads[0]) ld.name = heads[0]; else delete ld.name;
    if (descs[0]) ld.description = descs[0]; else delete ld.description;
    ld.call_to_action = ld.call_to_action || { type: 'LEARN_MORE', value: {} };
    if (cta) ld.call_to_action.type = cta;
    if (formId) ld.call_to_action.value = Object.assign({}, ld.call_to_action.value, { lead_gen_form_id: formId });
    delete ld.picture; // the image is the hash
    // an ad with one text gets its second text / more titles the way a new one is published (Meta tests the mix)
    if (texts.length > 1 || heads.length > 1) {
      feed = { bodies: texts.map((text) => ({ text })), titles: (heads.length ? heads : [ld.name || '']).filter(Boolean).map((text) => ({ text })), optimization_type: 'DEGREES_OF_FREEDOM' };
      if (descs.length) feed.descriptions = descs.map((text) => ({ text }));
      if (!feed.titles.length) delete feed.titles;
      single = true;
    }
  } else if (spec.video_data) {
    const vd = spec.video_data;
    vd.message = texts[0];
    if (heads[0]) vd.title = heads[0];
    if (descs[0]) vd.link_description = descs[0];
    if (vd.call_to_action) { if (cta) vd.call_to_action.type = cta; if (formId) vd.call_to_action.value = Object.assign({}, vd.call_to_action.value, { lead_gen_form_id: formId }); }
  } else return { error: 'Reclama asta nu se poate edita de aici. Deschide-o în Ads Manager.' };

  const params = { name: (cr.name || ad.j.name || 'Reclamă') + ' · editată', object_story_spec: spec };
  if (feed) params.asset_feed_spec = feed;
  let made = await call('POST', '/' + conn.adAccountId + '/adcreatives', tok, params);
  let note = '';
  // Meta refusing the extra texts on an ad that had one: it keeps the first text and title, and says so
  if (!made.ok && single) {
    note = 'Meta n-a primit al doilea text / titlu (' + err(made.j) + '), reclama are doar primul.';
    delete params.asset_feed_spec;
    made = await call('POST', '/' + conn.adAccountId + '/adcreatives', tok, params);
  }
  if (!made.ok) return { error: err(made.j, 'Reclama nouă') };
  const sw = await call('POST', '/' + a.adId, tok, { creative: { creative_id: made.j.id } });
  if (!sw.ok) { await call('DELETE', '/' + made.j.id, tok); return { error: err(sw.j, 'Schimbarea reclamei') }; }
  return Object.assign({ ok: true, creativeId: made.j.id }, note ? { note } : {});
}

const PLACEMENTS = {
  fb_feed: ['facebook', 'feed'], fb_story: ['facebook', 'story'], fb_reels: ['facebook', 'facebook_reels'],
  ig_feed: ['instagram', 'stream'], ig_story: ['instagram', 'story'], ig_reels: ['instagram', 'reels'],
};
// Editează → the ad set: daily budget, age, women only, radius around the pin, placements
async function editAdset(conn, a) {
  const tok = conn.userToken;
  if (!/^\d{5,25}$/.test(String(a.adsetId || ''))) return { error: 'ID invalid' };
  const s = await call('GET', '/' + a.adsetId, tok, { fields: 'account_id,targeting,daily_budget' });
  if (!s.ok) return { error: err(s.j) };
  if ('act_' + s.j.account_id !== conn.adAccountId) return { error: 'Nu e în contul de reclame conectat.' };
  const t = JSON.parse(JSON.stringify(s.j.targeting || {}));
  const ageMin = Math.min(65, Math.max(18, Math.round(Number(a.ageMin) || t.age_min || 18)));
  const ageMax = Math.min(65, Math.max(ageMin, Math.round(Number(a.ageMax) || t.age_max || 65)));
  t.age_min = ageMin; t.age_max = ageMax;
  if (a.women === true) t.genders = [2]; else if (a.women === false) delete t.genders;
  const loc = ((t.geo_locations || {}).custom_locations || [])[0];
  if (loc && Number(a.radiusKm) >= 1) { loc.radius = Math.min(80, Math.round(Number(a.radiusKm))); loc.distance_unit = 'kilometer'; }
  if (Array.isArray(a.placements) && a.placements.length) {
    const pl = a.placements.filter((p) => PLACEMENTS[p]);
    const fb = pl.filter((p) => PLACEMENTS[p][0] === 'facebook').map((p) => PLACEMENTS[p][1]);
    const ig = pl.filter((p) => PLACEMENTS[p][0] === 'instagram').map((p) => PLACEMENTS[p][1]);
    t.publisher_platforms = [fb.length ? 'facebook' : '', ig.length ? 'instagram' : ''].filter(Boolean);
    if (fb.length) t.facebook_positions = fb; else delete t.facebook_positions;
    if (ig.length) t.instagram_positions = ig; else delete t.instagram_positions;
    delete t.messenger_positions; delete t.audience_network_positions;
  }
  const params = { targeting: t };
  const lei = Math.round((Number(a.budget) || 0) * 100) / 100;
  if (s.j.daily_budget && lei) { if (lei < 5) return { error: 'Bugetul minim e 5 lei pe zi.' }; params.daily_budget = String(Math.round(lei * 100)); }
  const r = await call('POST', '/' + a.adsetId, tok, params);
  return r.ok ? { ok: true } : { error: err(r.j, 'Setul de reclame') };
}

// a picture of an ad, fetched here so the page can save it (Meta's links are on another site)
const MEDIA_HOST = /(^|\.)(fbcdn\.net|facebook\.com|fbsbx\.com|cdninstagram\.com)$/i;
async function media(url) {
  let u;
  try { u = new URL(String(url || '')); } catch (e) { return { error: 'bad_url' }; }
  if (u.protocol !== 'https:' || !MEDIA_HOST.test(u.hostname)) return { error: 'bad_url' };
  const r = await fetch(u.toString());
  if (!r.ok) return { error: 'meta_' + r.status };
  const type = r.headers.get('content-type') || 'image/jpeg';
  if (!/^image\//.test(type)) return { error: 'not_image' };
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 4e6) return { error: 'too_big' };
  return { type, buf };
}

module.exports = { details, activeAds, editAd, editAdset, media, partsOf };
