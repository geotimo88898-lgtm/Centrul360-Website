// The site's funnel, per source (the owner, 21.11: „dacă ne bubuie un video organic sau vin de pe story, să ne asigurăm
// 100% că nu site-ul e problema conversiei”). Same privacy as the visit counter (api/site-pulse.js): no cookie, nothing
// kept on her device, nothing that names her; one visitor = the counter's daily fingerprint (sid).
//
// The steps, each counted once per visitor and day, under the source she came from (her first page of the day says it):
//   visit  a page of the site
//   cta    she tapped a main action (buy the card, reserve it, the lead filter, a booking)
//   open   a buying window opened (the card's, or the lead filter's)
//   start  she started filling it (the lead filter's first answer, the card form sent)
//   lead   she left her details (the lead filter, a card reserved in the clinic)
//   pay    she went to the card's secure payment page (myPOS)
// The source: utm_source (+ utm_medium) when the link has them, else the app she reads in (Instagram, Facebook, TikTok
// in-app browsers), else the referrer's site, else direct. The page sends its own guess; the server keeps it clean.
//   data/site/funnel-<YYYY-MM-DD>.json { v: 1, s: { <sid>: [source, mask] }, f: { <source>: { visit, cta, ... } } }
// The paid cards come from the card's own orders (data/card-sarbatori.json, their track: utm, the app), per day and source.

const { readJSON, readJSONTagged, writeJSON, writeJSONIf } = require('./store');

const STEPS = ['visit', 'cta', 'open', 'start', 'lead', 'pay'];
const BIT = STEPS.reduce((o, s, i) => (o[s] = 1 << i, o), {});
const MAX_SIDS = 8000;
const ro = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const keyOf = (day) => 'data/site/funnel-' + day + '.json';

// a source as the page sent it, made safe: a-z, 0-9, „:” between the network and the medium (instagram:story)
function cleanSource(s) {
  const x = String(s || '').toLowerCase().replace(/[^a-z0-9:._-]/g, '').slice(0, 40);
  if (!x) return 'direct';
  const [net, med] = x.split(':');
  const N = { ig: 'instagram', insta: 'instagram', instagram: 'instagram', fb: 'facebook', facebook: 'facebook', meta: 'facebook', tt: 'tiktok', tiktok: 'tiktok', yt: 'youtube', youtube: 'youtube', wa: 'whatsapp', whatsapp: 'whatsapp', google: 'google' };
  const n = N[net] || net;
  return (med ? n + ':' + med.replace(/[^a-z0-9_-]/g, '').slice(0, 16) : n) || 'direct';
}
// a card order's source, from what it kept (api/card-sarbatori.js trackOf)
function sourceOfTrack(t) {
  const x = t || {};
  if (x.utm_source) return cleanSource(x.utm_source + (x.utm_medium ? ':' + x.utm_medium : ''));
  const ua = String(x.ua || '');
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
  if (/musical_ly|TikTok|Bytedance/i.test(ua)) return 'tiktok';
  if (x.fbclid) return 'facebook';
  return 'necunoscut';
}

// one step of one visitor; a page view is the step 'visit'. Never throws.
async function record(sid, source, step, now) {
  try {
    if (!sid || !BIT[step]) return;
    const key = keyOf(ro(new Date(now || Date.now())));
    for (let i = 0; i < 4; i++) {
      const { data, etag } = await readJSONTagged(key, null);
      const d = data || { v: 1, s: {}, f: {} };
      let row = d.s[sid];
      if (!row) {
        if (Object.keys(d.s).length >= MAX_SIDS) return;
        row = d.s[sid] = [cleanSource(source), 0];
      }
      const src = row[0];
      // a step counts once a day for her, and a step without a counted visit counts the visit too
      let changed = false;
      for (const s of step === 'visit' ? ['visit'] : ['visit', step]) {
        if (row[1] & BIT[s]) continue;
        row[1] |= BIT[s];
        const f = d.f[src] = d.f[src] || {};
        f[s] = (f[s] || 0) + 1;
        changed = true;
      }
      if (!changed) return;
      const ok = etag ? await writeJSONIf(key, d, etag, { quiet: true }) : (await writeJSON(key, d, { quiet: true }), true);
      if (ok) return;
    }
  } catch (e) { console.error('site-funnel:', e.message); }
}

// GET ?view=funnel&days=N: per day and in all, per source, the steps; plus the card orders (sent to pay / reserved / paid)
// and the site's lead-filter leads, per source
async function view(days) {
  const n = Math.max(1, Math.min(60, Number(days) || 14));
  const now = Date.now();
  const list = [];
  for (let i = n - 1; i >= 0; i--) list.push(ro(new Date(now - i * 864e5)));
  const [docs, orders, leads] = await Promise.all([
    Promise.all(list.map((d) => readJSON(keyOf(d), null).catch(() => null))),
    readJSON('data/card-sarbatori.json', []).catch(() => []),
    readJSON('data/leads.json', []).catch(() => []),
  ]);
  const total = {};
  const add = (o, src, k, v) => { const r = o[src] = o[src] || {}; r[k] = (r[k] || 0) + (v || 1); };
  const byDay = list.map((day, i) => {
    const f = (docs[i] && docs[i].f) || {};
    const row = { day, sources: {} };
    Object.keys(f).forEach((src) => STEPS.forEach((s) => { if (f[src][s]) { add(row.sources, src, s, f[src][s]); add(total, src, s, f[src][s]); } }));
    return row;
  });
  const inDays = (iso) => { const d = iso ? ro(new Date(iso)) : ''; return list.indexOf(d); };
  (Array.isArray(orders) ? orders : []).forEach((r) => {
    const i = inDays(r && r.created);
    if (i < 0 || !r || r.status === 'draft') return;
    const src = sourceOfTrack(r.track);
    const k = r.status === 'platit' ? 'cardsPaid' : r.status === 'rezervat' ? 'cardsReserved' : r.status === 'asteptare' ? 'cardsToPay' : r.status === 'anulat' ? 'cardsCancelled' : '';
    if (!k) return;
    add(byDay[i].sources, src, k, 1);
    add(total, src, k, 1);
    if (r.status === 'platit') { add(byDay[i].sources, src, 'cardsLei', Number(r.amount) || 0); add(total, src, 'cardsLei', Number(r.amount) || 0); }
  });
  (Array.isArray(leads) ? leads : []).forEach((l) => {
    if (!l || l.source !== 'site' || !l.lf) return;
    const i = inDays(l.createdAt);
    if (i < 0) return;
    const src = cleanSource(l.siteSource || 'site');
    add(byDay[i].sources, src, 'lfLeads', 1);
    add(total, src, 'lfLeads', 1);
  });
  return { ok: true, steps: STEPS, days: byDay, total };
}

module.exports = { STEPS, record, view, cleanSource, sourceOfTrack };
