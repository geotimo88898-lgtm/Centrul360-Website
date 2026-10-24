// Orders the owners asked for in chat, made and published by the portal itself (Claude, in the cloud, has no Creative
// session): the automations' clock (api/automation-tick.js) runs it. One order per job id, never twice.
//   1. the order goes to Creative (as its own "Comandă creative"), signed in with CREATIVE_SSO_SECRET like the portal's menu
//   2. each clock tick reports how far it got and a link to see every finished creative (api/creative-preview.js)
//   3. only the creatives listed in PUBLISH (after they were looked at) go to Meta, through Creative's own "Publică pe
//      Meta", with Reclame's defaults (Setări implicite) and the offer's form for the city
// data/creative-once.json: { jobs: { <id>: { requestId, at, published: { <creativeId>: <when> } } } }

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./store');
const ads = require('./meta-ads');
const { loadOffers } = require('./offers');

const KEY = 'data/creative-once.json';
const BASE = 'https://centrul360-creative-machine-centrul360.vercel.app/creative';
const JOBS = [
  // 24.10: Arad has room for bookings, Timișoara is full: 2 LipoSonix and 2 gușă ads for Arad
  { id: 'ar-lipo-gusa-2026-10-24', city: 'Arad', cityId: 'arad', offers: [/lipo/i, /gu[sș]/i], count: 4,
    note: 'Exact 2 creative LipoSonix și 2 creative HIFU gușă, toate 4 pentru Arad. Fiecare alt tip de reclamă, să se vadă clar ce vindem (corp, siluetă, bărbie, clinica sau aparatul).' },
];
// the creatives seen and good to go (ids), per job
const PUBLISH = { 'ar-lipo-gusa-2026-10-24': ['cmvmsbvqw96apgn', 'cmvmsbutthwge0u', 'cmvmsbv5e47rt32', 'cmvmsbvkiwxyqoo'] };
// the ones that weren't good enough: redone once with this instruction (Creative's own "Refă"), then looked at again
const REWORK = {
  cmvmsbvkiwxyqoo: { mode: 'edit', instruction: 'Șterge tot scrisul de pe agenda de jos (titlul „Reception Appointment book”, „Weekly agenda” și orice altceva scris pe ea): rămân doar căsuțele, unele bifate. Șterge și scrisul de pe aparat („LipeSonix”): aparatul rămâne alb, fără text. Titlul din caseta albă, prețurile și restul rămân exact cum sunt.' },
};

// Creative names an offer by its key (a few old ones by their old name, web/src/lib/data.ts LEGACY_IDS)
const LEGACY = { 'liposonix-2zone': 'liposonix', 'cavitatie-ems': 'cavitatie-ems-tm', 'cavitatie-1plus1': 'cavitatie-1plus1-arad' };
const creativeId = (o) => LEGACY[o.key] || o.key;
const sign = (secret, s) => crypto.createHmac('sha256', secret).update(s).digest('hex');
function previewLink(secret, path) {
  return 'https://admin.centrul360.com/api/creative-preview?p=' + encodeURIComponent(path) + '&k=' + sign(secret, 'preview:' + path).slice(0, 32);
}

// a Creative session, as the portal's menu opens it
async function session(secret) {
  const payload = Buffer.from((Date.now() + 120e3) + '.claude', 'utf8').toString('base64url');
  const r = await fetch(BASE + '/api/sso?t=' + encodeURIComponent(payload + '.' + sign(secret, payload)), { redirect: 'manual' });
  const set = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || '']).join(';');
  const m = /c360_session=([^;]+)/.exec(set);
  if (!m) throw new Error('Creative SSO: ' + r.status);
  return 'c360_session=' + m[1];
}
async function api(cookie, path, init) {
  const r = await fetch(BASE + path, Object.assign({}, init, { headers: Object.assign({ cookie, 'content-type': 'application/json' }, (init && init.headers) || {}) }));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(path + ': ' + (j.error || r.status));
  return j;
}

function settingsFor(c, offer, job, d) {
  const k = c.copy || {};
  const body = !/facial|ten|riduri|pete/i.test((offer && offer.category) || '');
  const [ageMin, ageMax] = (d.ages && (body ? d.ages.body : d.ages.facial)) || [28, 64];
  const heads = (k.headlines && k.headlines.length ? k.headlines : [k.headline || k.offer_label || '']).filter(Boolean);
  const proc = /lipo/i.test(offer.title) ? 'LIPO' : /gu[sș]/i.test(offer.title) ? 'GUSA' : String(offer.adName || offer.title).toUpperCase();
  return {
    adsetId: '', campaignName: 'AR ' + proc + ' · ' + String(c.angle || c.format || '').slice(0, 40), adsetName: job.city + ' ' + d.radiusKm + ' km · femei ' + ageMin + '-' + ageMax,
    adName: String(k.hook || proc).slice(0, 80), city: job.city, radiusKm: d.radiusKm, women: d.women !== false, ageMin, ageMax,
    placements: d.placements, budget: d.budget, formId: (offer.forms || {})[job.city] || '',
    primaryText: (k.primary_texts && k.primary_texts[0]) || k.primary_text || '', primaryText2: (k.primary_texts && k.primary_texts[1]) || '',
    headline: heads[0] || '', headline2: heads[1] || '', headline3: heads[2] || '', description: k.description || 'Centrul360 ' + job.city,
    cta: d.cta, startNow: d.startNow !== false,
  };
}

async function run() {
  const secret = process.env.CREATIVE_SSO_SECRET;
  if (!secret) return { skipped: 'no_secret' };
  const doc = Object.assign({ jobs: {} }, (await readJSON(KEY, {}).catch(() => ({}))) || {});
  const open = JOBS.filter((j) => !(doc.jobs[j.id] && doc.jobs[j.id].done));
  if (!open.length) return { skipped: 'nothing' };
  const cookie = await session(secret);
  const offers = await loadOffers(readJSON);
  const out = {};
  for (const job of open) {
    const st = doc.jobs[job.id] = doc.jobs[job.id] || { published: {} };
    if (!st.requestId) {
      const ids = job.offers.map((re) => offers.find((o) => o.active !== false && o.ads !== false && re.test(o.title || o.key || ''))).filter(Boolean).map(creativeId);
      if (ids.length !== job.offers.length) { out[job.id] = { error: 'offer_missing' }; continue; }
      const r = await api(cookie, '/api/requests', { method: 'POST', body: JSON.stringify({ count: job.count, offerIds: ids, cities: [job.cityId], ratios: ['4:5'], note: job.note }) });
      st.requestId = r.id; st.at = new Date().toISOString();
      out[job.id] = { ordered: r.id };
      continue;
    }
    const [reqs, all] = await Promise.all([api(cookie, '/api/requests'), api(cookie, '/api/creatives')]);
    const req = (Array.isArray(reqs) ? reqs : []).find((x) => x.id === st.requestId) || {};
    // failed (a wrong offer name, 24.10): ordered again on this tick, at most 3 times
    if (req.status === 'failed' && (st.tries || 1) < 3) { st.tries = (st.tries || 1) + 1; st.failed = (st.failed || []).concat(st.requestId); delete st.requestId; }
    if (!st.requestId) { const ids = job.offers.map((re) => offers.find((o) => o.active !== false && o.ads !== false && re.test(o.title || o.key || ''))).filter(Boolean).map(creativeId);
      const r = await api(cookie, '/api/requests', { method: 'POST', body: JSON.stringify({ count: job.count, offerIds: ids, cities: [job.cityId], ratios: ['4:5'], note: job.note }) });
      st.requestId = r.id; out[job.id] = { ordered: r.id, offers: ids }; continue; }
    const mine = (Array.isArray(all) ? all : []).filter((c) => c.requestId === st.requestId);
    const d = await ads.loadDefaults(readJSON);
    st.reworked = st.reworked || {};
    for (const c of mine) {
      const w = REWORK[c.id];
      if (!w || st.reworked[c.id + '|' + w.instruction] || c.status !== 'approved') continue; // each instruction once
      try { await api(cookie, '/api/creatives/' + c.id + '/rework', { method: 'POST', body: JSON.stringify(w) }); st.reworked[c.id + '|' + w.instruction] = new Date().toISOString(); }
      catch (e) { st.reworked[c.id + '|' + w.instruction] = 'error: ' + e.message; }
    }
    const pub = [];
    for (const id of (PUBLISH[job.id] || []).filter((x) => !st.published[x]).slice(0, 2)) { // 2 a tick (each takes ~20 s)
      const c = mine.find((x) => x.id === id);
      if (!c || st.published[id] || c.status !== 'approved' || (c.meta && c.meta.length)) continue;
      const offer = offers.find((o) => creativeId(o) === c.offerId);
      if (!offer) { pub.push(id + ': offer_missing'); continue; }
      try {
        const r = await api(cookie, '/api/creatives/' + id + '/publish', { method: 'POST', body: JSON.stringify({ settings: settingsFor(c, offer, job, d) }) });
        st.published[id] = new Date().toISOString();
        pub.push(id + ': ' + (r.record && r.record.campaignId));
      } catch (e) { pub.push(id + ': ' + e.message); }
    }
    out[job.id] = { request: req.status, error: req.error, log: (req.log || []).slice(-4).map((l) => l.msg), published: pub, creatives: mine.map((c) => { const v = (c.versions || []).slice(-1)[0];
      return { id: c.id, offer: (offers.find((o) => creativeId(o) === c.offerId) || {}).title, status: c.status, format: c.format, preview: v ? previewLink(secret, v.path) : '',
        hook: c.copy && c.copy.hook, text: c.copy && ((c.copy.primary_texts || [])[0] || c.copy.primary_text), headline: c.copy && ((c.copy.headlines || [])[0] || c.copy.headline) }; }) };
    // done: every creative of the order went to Meta, or 3 days passed (the ones left aren't wanted)
    if ((mine.length && mine.every((c) => st.published[c.id])) || Date.now() - Date.parse(st.at || 0) > 3 * 864e5) st.done = true;
  }
  await writeJSON(KEY, doc, { quiet: true });
  return out;
}

module.exports = { run, session, sign, BASE };
