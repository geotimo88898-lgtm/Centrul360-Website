// Conținut → „Promovează” (Admin → Conținut, the owner's tap): an organic reel or carousel that went out on Instagram
// or Facebook becomes a lead ad. One campaign (leads, PAUSED), one ad set per city (Reclame's defaults: the radius, the
// women, the ages of the offer's kind, the daily budget, the placements), one ad with the offer's lead form of that city.
//  - The campaign stays PAUSED; its ad set and ad are on, so switching the campaign on is all it takes (start() below,
//    Reclame or Ads Manager). Nothing runs before that.
//  - The ad is the post itself where Meta takes it, so its likes and comments carry over: on Instagram the media
//    (source_instagram_media_id, signed by the Page's Instagram account), on Facebook the Page post (object_story_id; a
//    reel is a video, its post is read from the video). Meta refusing that: the ad is built from the item's own files
//    and text (the video sent to the ad account by its public URL, or the carousel's photos), and the answer says so.
//  - The form: the offer the item talks about (its topic, else its text: HIFU gușă, LipoSonix, RF, Restart, epilare;
//    opts.offer wins) and the city (opts.city: Timișoara, Arad or both). An offer with a form in both cities and no
//    city given: { error: 'choose_city', cities } so Admin asks.
//  - Once per item and network: item.boosts keeps it, a second tap answers with the same campaign (unless that one was
//    deleted meanwhile). item.boostLock keeps two taps at once from making two.
//  - Only Centrul360's campaigns: the name starts with ORG (never ARANCA or BRAZI, the other businesses of the shared
//    ad account) and is one Reclame keeps (ads-scope).
//
// boost(itemId, net, opts) → { ok, campaignId, adsetId, adId, name, adsManagerUrl, mode, offer, cities, daily, warning,
//   already } or { ok: false, error, message, cities? / offers? }
//   opts: { city: 'Timișoara' | 'Arad' | 'both' (tm / ar / ambele), offer: id | key | title, daily: lei (min 5),
//           cta: SIGN_UP | LEARN_MORE …, mode: 'post' | 'built' (only that way), dry: true (what would be made, nothing
//           is sent to Meta), now, waitMs, sleep (tests) }

const { readJSON } = require('./store');
const { loadConnection } = require('./facebook');
const { loadOffers, FORM_CITIES } = require('./offers');
const ads = require('./meta-ads');
const C = require('./content');
const { dedash } = require('./dedash');

const VIDEO_GRAPH = 'https://graph-video.facebook.com/v25.0'; // the same version as meta-ads.js
const NETS = { ig: 'IG', fb: 'FB' };
const NET_NAME = { ig: 'Instagram', fb: 'Facebook' };
const CITY_ID = { 'Timișoara': 'timisoara', Arad: 'arad' };
const CITY_SHORT = { 'Timișoara': 'TM', Arad: 'AR' };
const LOCK_MS = 3 * 60e3;
const WAIT_MS = 45e3;
const GONE = ['DELETED', 'ARCHIVED'];

const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = (s, n) => dedash(String(s == null ? '' : s)).replace(/\s+/g, ' ').trim().slice(0, n);
const iso = () => new Date().toISOString();
const no = (error, message, extra) => Object.assign({ ok: false, error, message }, extra || {});
const metaErr = (j, step) => { const e = (j && j.error) || {}; return (step ? step + ': ' : '') + (e.error_user_msg || e.error_user_title || e.message || 'Meta n-a răspuns'); };
const isCode = (j, code) => Number(((j && j.error) || {}).code) === code;
const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));
// 12.11, as the owner reads a date
function ddmm(ms) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit' }).formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
  return p.day + '.' + p.month;
}

// ---------------------------------------------------------------- the offer
// What the item talks about → the offer it sells. The first rule the topic (with its keyword) matches, else the text
// of the post. RF before HIFU: „RF Sculpt pe gușă” is RF's.
const RULES = [
  { id: 'rf', name: 'RF', text: /\brf\b|radiofrecv/, offer: (s) => /\brf\b|radiofrecv/.test(s) && !/hifu/.test(s) },
  { id: 'hifu-gusa', name: 'HIFU gușă', text: /hifu|gusa|barbi|smas|\bgat(ul)?\b/, offer: (s) => /hifu/.test(s) && /gusa/.test(s) && !/\brf\b/.test(s) },
  { id: 'liposonix', name: 'LipoSonix', text: /lipo|grasim|burt|abdomen|talie|centimetr/, offer: (s) => /lipo/.test(s) },
  { id: 'restart', name: 'Restart', text: /restart|facial|\bten(ul)?\b|spf|exfoli/, offer: (s) => /restart/.test(s) },
  { id: 'epilare', name: 'epilare', text: /epilar|laser|folicul|\bfir(e|ele)?\b|\bras\b|ceara/, offer: (s) => /epilar/.test(s) },
];
const offerText = (o) => fold([o.key, o.title, o.adName, o.short].filter(Boolean).join(' '));
const formCities = (o) => FORM_CITIES.filter((c) => /^\d{5,25}$/.test(String((o.forms || {})[c] || '')));
const usable = (o) => o.active !== false;
// the best of several offers that fit: with forms, in ads, the clinic's order
const rank = (a, b) => (formCities(b).length - formCities(a).length) || ((b.ads !== false) - (a.ads !== false)) || ((Number(a.order) || 99) - (Number(b.order) || 99));
function ruleFor(it, net) {
  for (const t of [[it.topic, it.keyword].join(' '), C.captionFor(it, net)]) {
    const s = fold(t);
    const r = s && RULES.find((x) => x.text.test(s));
    if (r) return r;
  }
  return null;
}
const choices = (offers) => offers.filter((o) => usable(o) && o.ads !== false && formCities(o).length).map((o) => ({ id: o.id, title: o.title, cities: formCities(o) }));
function offerFor(it, net, offers, wanted) {
  if (wanted) {
    const w = fold(wanted);
    const o = offers.find((x) => usable(x) && (x.id === wanted || x.key === wanted || fold(x.title) === w));
    return o ? { offer: o, rule: null } : no('choose_offer', 'Oferta aleasă nu mai e activă în Oferte. Alege alta.', { offers: choices(offers) });
  }
  const rule = ruleFor(it, net);
  if (!rule) return no('choose_offer', 'Nu știu ce ofertă vinde materialul ăsta. Alege oferta.', { offers: choices(offers) });
  const o = offers.filter((x) => usable(x) && rule.offer(offerText(x))).sort(rank)[0];
  return o ? { offer: o, rule } : no('choose_offer', 'Materialul e despre ' + rule.name + ', dar nu e nicio ofertă activă pentru asta în Oferte. Alege oferta.', { offers: choices(offers), topic: rule.name });
}

// ---------------------------------------------------------------- the city
function cityName(x) {
  const s = fold(x);
  if (!s) return '';
  if (['both', 'ambele', 'all', 'toate'].includes(s)) return 'both';
  if (['timisoara', 'tm', 'tms'].includes(s)) return 'Timișoara';
  if (['arad', 'ar'].includes(s)) return 'Arad';
  return '?';
}
// the cities the offer is sold in AND has a form in (Oferte: forms per city; EMS and epilare only Timișoara …)
function citiesFor(offer, wanted) {
  const sold = (offer.locations || []).length ? FORM_CITIES.filter((c) => offer.locations.includes(CITY_ID[c])) : FORM_CITIES;
  const ok = formCities(offer).filter((c) => sold.includes(c));
  const pick = cityName(wanted);
  if (pick === '?') return no('invalid_city', 'Orașul e Timișoara sau Arad.');
  if (!ok.length) return no('no_form', 'Oferta „' + offer.title + '” n-are formular în Oferte' + (sold.length === 1 ? ' pentru ' + sold[0] : '') + '. Pune-l în Admin → Oferte.');
  if (pick === 'both') return { cities: ok };
  if (pick) {
    if (!sold.includes(pick)) return no('offer_not_in_city', '„' + offer.title + '” nu se face în ' + pick + '.', { cities: ok });
    if (!ok.includes(pick)) return no('no_form', 'Oferta „' + offer.title + '” n-are formular pentru ' + pick + ' în Oferte.', { cities: ok });
    return { cities: [pick] };
  }
  if (ok.length === 1) return { cities: ok };
  return no('choose_city', 'Alege orașul (sau ambele).', { cities: ok, both: true, offer: { id: offer.id, title: offer.title } });
}

// ---------------------------------------------------------------- the ad set's audience (as meta-ads.js targeting())
const PLACE = ads.PLACEMENTS;
function targeting(city, d, ages, placements) {
  const c = ads.CITIES[city];
  const fb = placements.filter((p) => PLACE[p][0] === 'facebook').map((p) => PLACE[p][1]);
  const ig = placements.filter((p) => PLACE[p][0] === 'instagram').map((p) => PLACE[p][1]);
  const t = {
    geo_locations: { custom_locations: [{ latitude: c.lat, longitude: c.lng, radius: d.radiusKm, distance_unit: 'kilometer' }], location_types: ['home', 'recent'] },
    age_min: ages[0], age_max: ages[1],
    publisher_platforms: [fb.length ? 'facebook' : '', ig.length ? 'instagram' : ''].filter(Boolean),
    device_platforms: ['mobile', 'desktop'],
    targeting_automation: { advantage_audience: 0 },
  };
  if (d.women) t.genders = [2];
  if (fb.length) t.facebook_positions = fb;
  if (ig.length) t.instagram_positions = ig;
  return t;
}
// the post itself runs where it was posted (its likes are there); a built ad, everywhere the defaults say
function placementsFor(mode, net, d) {
  if (mode === 'built') return d.placements;
  const own = net === 'ig' ? 'instagram' : 'facebook';
  const mine = d.placements.filter((p) => PLACE[p][0] === own);
  return mine.length ? mine : Object.keys(PLACE).filter((p) => PLACE[p][0] === own);
}

// ---------------------------------------------------------------- what was made
const liveBoost = (it, net) => (it.boosts || []).find((b) => b.net === net && b.campaignId && !b.gone);
async function stillThere(conn, id) {
  const r = await ads.call('GET', '/' + id, conn.userToken, { fields: 'effective_status' }).catch(() => ({ ok: true, j: {} }));
  if (!r.ok) return !(isCode(r.j, 100) || isCode(r.j, 803)); // deleted for good; any other refusal: kept as it is
  return !GONE.includes(String(r.j.effective_status || ''));
}
const answer = (conn, b, extra) => Object.assign({ ok: true, campaignId: b.campaignId, adsetId: b.adsetId || '', adId: b.adId || '', name: b.name || '',
  adsManagerUrl: ads.adsManagerUrl(conn.adAccountId, b.campaignId), mode: b.mode || '', offer: b.offer || null, cities: b.cities || [], daily: b.daily || 0 }, extra || {});

// ---------------------------------------------------------------- the creatives
async function igAccount(conn) {
  const r = await ads.call('GET', '/' + conn.pageId, conn.pageAccessToken, { fields: 'instagram_business_account' }).catch(() => ({ ok: false }));
  return r.ok && r.j && r.j.instagram_business_account ? String(r.j.instagram_business_account.id) : '';
}
// the Page post of a Facebook entry: a carousel's post id is the post; a reel's is its video's
async function storyId(conn, e) {
  const id = String(e.postId);
  if (id.includes('_')) return id;
  const r = await ads.call('GET', '/' + id, conn.pageAccessToken, { fields: 'post_id' }).catch(() => ({ ok: false }));
  const p = r.ok && r.j && r.j.post_id ? String(r.j.post_id) : '';
  return p ? (p.includes('_') ? p : conn.pageId + '_' + p) : conn.pageId + '_' + id;
}
async function postCreative(conn, net, e, igId, name, cta) {
  const p = { name, call_to_action: cta };
  if (net === 'ig') {
    if (!igId) return { why: 'Pagina nu are contul de Instagram legat' };
    Object.assign(p, { object_id: conn.pageId, instagram_user_id: igId, source_instagram_media_id: String(e.postId) });
  } else p.object_story_id = await storyId(conn, e);
  const r = await ads.call('POST', '/' + conn.adAccountId + '/adcreatives', conn.userToken, p);
  return r.ok && r.j.id ? { ok: true, id: String(r.j.id) } : { why: metaErr(r.j, 'Postarea ca reclamă') };
}
// the item's own files in the ad account, once for every city: the video (by its public URL, then until Meta has
// processed it) or the carousel's photos
async function upload(conn, it, made, o) {
  const tok = conn.userToken, act = conn.adAccountId, m = C.media(it);
  if (m.video) {
    const v = await ads.call('POST', VIDEO_GRAPH + '/' + act + '/advideos', tok, { file_url: C.fileUrl(it.id, m.video.name, m.video.v), name: clean('ORG ' + (it.topic || it.kind), 80) });
    if (!v.ok || !v.j.id) return { why: metaErr(v.j, 'Video-ul') };
    const video = String(v.j.id);
    made.push(video);
    const sleep = o.sleep || sleepReal, until = Date.now() + (o.waitMs != null ? o.waitMs : WAIT_MS);
    for (;;) {
      const s = await ads.call('GET', '/' + video, tok, { fields: 'status' }).catch(() => ({ ok: false, j: {} }));
      const st = String(((s.j && s.j.status) || {}).video_status || '');
      if (st === 'ready') break;
      if (st === 'error') return { why: 'Video-ul: Meta nu l-a putut procesa' };
      if (Date.now() >= until) break; // still processing: the creative is tried anyway, Meta says if it is too early
      await sleep(3000);
    }
    let cover = m.cover ? C.fileUrl(it.id, m.cover.name, m.cover.v) : '';
    if (!cover) {
      const t = await ads.call('GET', '/' + video + '/thumbnails', tok, {}).catch(() => ({ ok: false }));
      cover = (t.ok && t.j && (t.j.data || [])[0] && t.j.data[0].uri) || '';
    }
    return { video, cover };
  }
  if (m.images.length) {
    const store = require('./store');
    const hashes = [];
    for (const f of m.images) {
      const buf = await store.readBinary(f.path);
      if (!buf) return { why: 'Poza ' + f.name + ' lipsește din stocare' };
      const r = await ads.call('POST', '/' + act + '/adimages', tok, { bytes: buf.toString('base64'), name: f.name });
      const imgs = (r.ok && r.j.images) || {};
      const hash = (imgs[Object.keys(imgs)[0]] || {}).hash;
      if (!hash) return { why: metaErr(r.j, 'Poza ' + f.name) };
      hashes.push(hash);
    }
    return { hashes };
  }
  return { why: 'Materialul n-are fișiere' };
}
async function builtCreative(conn, it, net, igId, files, name, cta, title) {
  const message = C.captionFor(it, net);
  const spec = { page_id: conn.pageId };
  if (igId) spec.instagram_user_id = igId;
  if (files.video) spec.video_data = Object.assign({ video_id: files.video, message, title, call_to_action: cta }, files.cover ? { image_url: files.cover } : {});
  else spec.link_data = { link: 'https://fb.me/', message, call_to_action: cta, multi_share_end_card: false, multi_share_optimized: false,
    child_attachments: files.hashes.map((h) => ({ image_hash: h, link: 'https://fb.me/', name: title, call_to_action: cta })) };
  const r = await ads.call('POST', '/' + conn.adAccountId + '/adcreatives', conn.userToken, { name, object_story_spec: spec });
  return r.ok && r.j.id ? { ok: true, id: String(r.j.id) } : { why: metaErr(r.j, 'Reclama (video-ul / pozele și textul)') };
}

// ---------------------------------------------------------------- making it
async function make(conn, it, net, e, x, o) {
  const tok = conn.userToken, act = conn.adAccountId;
  const made = [];
  const undo = async () => { for (const id of made.slice().reverse()) await ads.call('DELETE', '/' + id, tok).catch(() => {}); };
  try {
    const igId = await igAccount(conn);
    let mode = o.mode === 'built' ? 'built' : 'post', note = '', files = null;
    const creative = async (city, first) => {
      const cta = { type: x.cta, value: { lead_gen_form_id: x.forms[city] } };
      const name = x.adName(city);
      if (mode === 'post') {
        const r = await postCreative(conn, net, e, igId, name, cta);
        if (r.ok || !first || o.mode === 'post') return r;
        note = r.why; mode = 'built'; // the post can't be the ad: built from the item's files
      }
      if (!files) { files = await upload(conn, it, made, o); if (files.why) return { why: files.why }; }
      return builtCreative(conn, it, net, igId, files, name, cta, x.title);
    };
    const first = await creative(x.cities[0], true);
    if (!first.ok) { await undo(); return { error: first.why }; }
    made.push(first.id);
    const placements = placementsFor(mode, net, x.d);

    const camp = await ads.call('POST', '/' + act + '/campaigns', tok, { name: x.name, objective: 'OUTCOME_LEADS', status: 'PAUSED', special_ad_categories: [], buying_type: 'AUCTION', is_adset_budget_sharing_enabled: false });
    if (!camp.ok || !camp.j.id) { await undo(); return { error: metaErr(camp.j, 'Campania') }; }
    const campaignId = String(camp.j.id);
    made.push(campaignId);
    const sets = [];
    for (let i = 0; i < x.cities.length; i++) {
      const city = x.cities[i];
      const cr = i ? await creative(city, false) : first;
      if (!cr.ok) { await undo(); return { error: cr.why }; }
      if (i) made.push(cr.id);
      // the campaign is the one switch: the ad set and the ad are on under it, nothing runs while it is paused
      const set = await ads.call('POST', '/' + act + '/adsets', tok, {
        name: x.adsetName(city), campaign_id: campaignId, daily_budget: String(Math.round(x.daily * 100)), billing_event: 'IMPRESSIONS',
        optimization_goal: 'LEAD_GENERATION', bid_strategy: 'LOWEST_COST_WITHOUT_CAP', destination_type: 'ON_AD',
        promoted_object: { page_id: conn.pageId }, targeting: targeting(city, x.d, x.ages, placements), status: 'ACTIVE',
      });
      if (!set.ok || !set.j.id) { await undo(); return { error: metaErr(set.j, 'Setul de reclame ' + city) }; }
      const ad = await ads.call('POST', '/' + act + '/ads', tok, { name: x.adName(city), adset_id: String(set.j.id), creative: { creative_id: cr.id }, status: 'ACTIVE' });
      if (!ad.ok || !ad.j.id) { await undo(); return { error: metaErr(ad.j, 'Reclama ' + city) }; }
      sets.push({ city, formId: x.forms[city], adsetId: String(set.j.id), adId: String(ad.j.id) });
    }
    const warning = note ? 'Meta n-a primit postarea ca reclamă (' + note + '), așa că reclama e făcută din video-ul / pozele și textul materialului: aprecierile și comentariile postării nu se adună pe ea.' : '';
    return { ok: true, campaignId, sets, mode, warning };
  } catch (err) {
    await undo();
    return { error: 'Rețea: ' + err.message };
  }
}

// ---------------------------------------------------------------- the whole tap
async function run(id, net, o) {
  if (!NETS[net]) return no('invalid_net', 'Se poate promova doar o postare de pe Instagram sau Facebook.');
  const it = C.findItem(await C.items(), id);
  if (!it || it.removed) return no('not_found', 'Materialul nu mai există.');
  const e = (it.plan || []).find((x) => x.net === net && x.state === 'posted' && x.postId);
  if (!e) return no('not_posted', 'Materialul nu e încă postat pe ' + NET_NAME[net] + '.');

  const conn = await loadConnection(readJSON);
  if (!conn.pageId) return no('not_connected', 'Facebook nu e conectat (Integrări → Facebook).');
  if (!conn.userToken) return no('no_user_token', 'Lipsește tokenul pentru reclame. Integrări → Facebook → Reclame: lipește un token cu ads_management.');
  if (!conn.adAccountId) return no('no_ad_account', 'Alege contul de reclame în Integrări → Facebook → Setări conexiune.');

  // made already: the same campaign (one deleted meanwhile is let go, and a new one is made)
  const had = liveBoost(it, net);
  if (had) {
    if (await stillThere(conn, had.campaignId)) return answer(conn, had, { already: true });
    await C.update((l) => { const b = (C.findItem(l, id) || {}).boosts; const x = (b || []).find((y) => y.net === net && y.campaignId === had.campaignId && !y.gone); if (!x) return false; x.gone = true; x.goneAt = iso(); });
  }

  const offers = await loadOffers(readJSON);
  const pick = offerFor(it, net, offers, o.offer);
  if (pick.error) return pick;
  const offer = pick.offer;
  const where = citiesFor(offer, o.city);
  if (where.error) return where;
  const forms = {};
  where.cities.forEach((c) => { forms[c] = String(offer.forms[c]); });
  // a form Meta archived (the Page's list, read every minute) is no use
  const poll = (await readJSON('data/fb-poll.json', {}).catch(() => ({}))) || {};
  for (const c of where.cities) {
    const f = (poll.forms || []).find((y) => String(y.id) === forms[c]);
    if (f && f.status && f.status !== 'ACTIVE') return no('form_inactive', 'Formularul ofertei pentru ' + c + ' nu mai e activ în Meta. Pune altul în Admin → Oferte.');
  }

  const d = await ads.loadDefaults(readJSON);
  const daily = o.daily != null && o.daily !== '' ? Math.round(Number(o.daily) * 100) / 100 : d.budget;
  if (!(daily >= 5)) return no('budget_too_low', 'Bugetul minim e 5 lei pe zi.');
  const body = !/facial|ten|riduri|pete/i.test(offer.category || '');
  const ages = (body ? d.ages.body : d.ages.facial) || [28, 64];
  const cta = ads.CTAS.includes(o.cta) ? o.cta : ads.CTAS.includes(d.cta) ? d.cta : 'SIGN_UP';
  const topic = clean(it.topic || it.rubric || it.kind, 60) || it.kind;
  let name = 'ORG · ' + topic + ' · ' + NETS[net] + ' · ' + ddmm(o.now || Date.now());
  const inc = conn.scope && conn.scope.include;
  if (inc && !ads.ours(conn, name)) name = inc + ' ' + name; // Reclame keeps only names with that start
  if (!ads.ours(conn, name)) return no('scope', 'Numele campaniei n-ar fi al Centrul360 (Reclame → Setări implicite).');
  const both = where.cities.length > 1;
  const x = {
    d, ages, cta, daily, name, forms, cities: where.cities, title: clean(offer.adName || offer.title, 120),
    adName: (c) => clean('ORG ' + NETS[net] + ' · ' + topic + (both ? ' · ' + CITY_SHORT[c] : ''), 200),
    adsetName: (c) => c + ' ' + d.radiusKm + ' km · ' + (d.women ? 'femei ' : 'toți ') + ages[0] + '-' + ages[1],
  };
  const what = { offer: { id: offer.id, title: offer.title }, topic: pick.rule ? pick.rule.name : '', name, daily, cta, ages,
    cities: where.cities.map((c) => ({ city: c, formId: forms[c] })), postId: String(e.postId), url: e.url || '' };
  if (o.dry) return Object.assign({ ok: true, dry: true, adsManagerUrl: ads.adsManagerUrl(conn.adAccountId) }, what);

  // two taps at once: one makes it, the other hears so
  let claim = '';
  await C.update((l) => {
    const y = C.findItem(l, id);
    if (!y || y.removed) { claim = 'gone'; return false; }
    const b = liveBoost(y, net);
    if (b) { claim = b; return false; }
    const lk = (y.boostLock || {})[net];
    if (lk && Date.now() - Date.parse(lk) < LOCK_MS) { claim = 'busy'; return false; }
    y.boostLock = Object.assign({}, y.boostLock, { [net]: iso() });
    claim = 'mine';
  });
  if (claim === 'gone') return no('not_found', 'Materialul nu mai există.');
  if (claim === 'busy') return no('busy', 'Promovarea e deja în lucru. Mai încearcă într-un minut.');
  if (claim !== 'mine') return answer(conn, claim, { already: true });

  let r;
  try { r = await make(conn, it, net, e, x, o); } catch (err) { r = { error: 'Rețea: ' + err.message }; }
  const rec = r.ok ? { net, at: iso(), campaignId: r.campaignId, adsetId: r.sets[0].adsetId, adId: r.sets[0].adId, name, mode: r.mode,
    offer: what.offer, cities: r.sets, daily, postId: String(e.postId) } : null;
  await C.update((l) => {
    const y = C.findItem(l, id);
    if (!y) return false;
    if (y.boostLock) { delete y.boostLock[net]; if (!Object.keys(y.boostLock).length) delete y.boostLock; }
    if (rec) y.boosts = (y.boosts || []).concat(rec);
  });
  if (!r.ok) return no('meta_refused', r.error);
  await require('./ads-cache').clear().catch(() => {}); // Reclame reads the account again
  return answer(conn, rec, r.warning ? { warning: r.warning } : {});
}

async function boost(itemId, net, opts) {
  try {
    return await run(String(itemId || ''), String(net || ''), opts || {});
  } catch (err) {
    console.error('content-boost:', err && err.message);
    return no(err && err.status ? err.message : 'failed', 'Eroare la promovare: ' + String((err && err.message) || err).slice(0, 200));
  }
}

// „Pornește”: the boost's campaign on (its ad set and ad already are). A new paused campaign that never spent is not in
// Reclame's list yet (it shows the running ones and the ones that spent lately), so Admin → Conținut can start it here.
async function start(itemId, net) {
  try {
    const it = C.findItem(await C.items(), String(itemId || ''));
    const b = it && liveBoost(it, String(net || ''));
    if (!b) return no('not_boosted', 'Materialul nu e promovat pe ' + (NET_NAME[net] || 'rețeaua asta') + '.');
    const conn = await loadConnection(readJSON);
    if (!conn.userToken || !conn.adAccountId) return no('not_connected', 'Facebook nu e conectat pentru reclame (Integrări → Facebook).');
    const r = await ads.act(conn, { action: 'status', id: b.campaignId, status: 'ACTIVE' });
    if (r.error) return no('meta_refused', r.error);
    const AC = require('./ads-cache');
    await AC.switched(b.campaignId, 'ACTIVE').catch(() => {});
    await AC.clear().catch(() => {});
    return answer(conn, b, { started: true });
  } catch (err) {
    console.error('content-boost start:', err && err.message);
    return no('failed', 'Eroare la pornire: ' + String((err && err.message) || err).slice(0, 200));
  }
}

module.exports = { boost, start, RULES, ruleFor, offerFor, citiesFor, cityName, ddmm };
