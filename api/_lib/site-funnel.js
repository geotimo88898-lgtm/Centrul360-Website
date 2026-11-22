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
//
// The card's own funnel (the owner, 21.11, Admin → Campanii → Cardul de Sărbători): the same visitor, also counted under
// a segment, phone (m) or computer (d) apart: „c:<utm_campaign>:<m|d>” (her first link of the day with utm_campaign says
// it; every step after counts under it, on any page) and „p:card:<m|d>” (only what she does on /card-sarbatori). Its
// steps (CARD), each once per visitor and day: visit, seen (the card's block came into view), buy („Plătesc online”),
// pay (sent to myPOS), res („Rezerv în clinică”), rsent (the clinic form sent). Each segment's first visits by hour too.
//   row  = [source, mask, campaign, { <segment>: mask }, device]     d.k = { <segment>: { visit, seen, ..., h: { HH: n } } }
// A personal link's token (?c=, opaque, made by api/_lib/card-blast.js tokenOf; never a phone or a name): the card's steps
// of that visitor under it too, with the time of each, so Admin → Campanii can show what that one person did:
//   d.t = { <token>: { <step>: ms } }   (at most MAX_TOKENS a day)

const { readJSON, readJSONTagged, writeJSON, writeJSONIf } = require('./store');

const STEPS = ['visit', 'cta', 'open', 'start', 'lead', 'pay'];
const BIT = STEPS.reduce((o, s, i) => (o[s] = 1 << i, o), {});
const MAX_SIDS = 8000;
const MAX_TOKENS = 3000;
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

// the card's steps and what the page sends for them (site-pulse.js ev, v2/cs-buy.js)
const CARD = ['visit', 'seen', 'buy', 'pay', 'res', 'rsent'];
const CBIT = CARD.reduce((o, s, i) => (o[s] = 1 << i, o), {});
const CARD_EV = { visit: 'visit', 'cs-seen': 'seen', 'cs-buy': 'buy', pay: 'pay', 'cs-res': 'res', 'cs-sent': 'rsent' };
const cleanCamp = (c) => String(c || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
const CARD_PAGE = /^\/card-sarbatori(\.html)?\/?$/;
const roHour = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hourCycle: 'h23' }).format(d);

// one step of one visitor; a page view is the step 'visit'. meta (optional): { camp: utm_campaign, path, dev: 'm' | 'd' }.
// Never throws.
async function record(sid, source, step, now, meta) {
  try {
    const cstep = CARD_EV[step] || '';
    if (!sid || (!BIT[step] && !cstep)) return;
    const m = meta || {};
    const at = new Date(now || Date.now());
    const key = keyOf(ro(at)), hh = roHour(at);
    for (let i = 0; i < 4; i++) {
      const { data, etag } = await readJSONTagged(key, null);
      const d = data || { v: 1, s: {}, f: {} };
      let row = d.s[sid];
      if (!row) {
        if (Object.keys(d.s).length >= MAX_SIDS) return;
        row = d.s[sid] = [cleanSource(source), 0];
      }
      let changed = false;
      // the site's funnel: a step counts once a day for her, and a step without a counted visit counts the visit too
      if (BIT[step]) {
        const src = row[0];
        for (const s of step === 'visit' ? ['visit'] : ['visit', step]) {
          if (row[1] & BIT[s]) continue;
          row[1] |= BIT[s];
          const f = d.f[src] = d.f[src] || {};
          f[s] = (f[s] || 0) + 1;
          changed = true;
        }
      }
      // the card's segments (the campaign she came from, the card's page), phone or computer apart
      if (cstep) {
        const camp = cleanCamp(m.camp);
        if (camp && !row[2]) { row[2] = camp; changed = true; }
        if (!row[4] && (m.dev === 'm' || m.dev === 'd')) { row[4] = m.dev; changed = true; }
        const dev = row[4] || (m.dev === 'm' ? 'm' : 'd');
        const segs = [];
        if (row[2]) segs.push('c:' + row[2] + ':' + dev);
        if (CARD_PAGE.test(String(m.path || ''))) segs.push('p:card:' + dev);
        if (segs.length) {
          const masks = row[3] = row[3] && typeof row[3] === 'object' ? row[3] : {};
          d.k = d.k || {};
          for (const g of segs) {
            for (const s of cstep === 'visit' ? ['visit'] : ['visit', cstep]) {
              if ((masks[g] || 0) & CBIT[s]) continue;
              masks[g] = (masks[g] || 0) | CBIT[s];
              const k = d.k[g] = d.k[g] || { h: {} };
              k[s] = (k[s] || 0) + 1;
              if (s === 'visit') k.h[hh] = (k.h[hh] || 0) + 1;
              changed = true;
            }
          }
        }
      }
      // her personal link: the card's steps with their time, under the token
      if (cstep && m.tok && /^[A-Za-z0-9_-]{6,24}$/.test(m.tok)) {
        d.t = d.t || {};
        if (d.t[m.tok] || Object.keys(d.t).length < MAX_TOKENS) {
          const x = d.t[m.tok] = d.t[m.tok] || {};
          for (const s of cstep === 'visit' ? ['visit'] : ['visit', cstep]) if (!x[s]) { x[s] = at.getTime(); changed = true; }
        }
      }
      if (!changed) return;
      const ok = etag ? await writeJSONIf(key, d, etag, { quiet: true }) : (await writeJSON(key, d, { quiet: true }), true);
      if (ok) return;
    }
  } catch (e) { console.error('site-funnel:', e.message); }
}

// the card's segments from a day on (Admin → Campanii): { days, segs: { <segment>: { visit, seen, ... } },
// hours: { <segment>: { 'YYYY-MM-DD HH': visits } } }, at most 31 days
async function segments(fromIso) {
  const now = Date.now();
  const from = Math.max(Date.parse(fromIso) || now, now - 30 * 864e5);
  const list = [];
  for (let t = from; ro(new Date(t)) <= ro(new Date(now)) && list.length < 32; t += 864e5) { const day = ro(new Date(t)); if (!list.includes(day)) list.push(day); }
  if (!list.includes(ro(new Date(now)))) list.push(ro(new Date(now)));
  const docs = await Promise.all(list.map((day) => readJSON(keyOf(day), null).catch(() => null)));
  const segs = {}, hours = {}, tokens = {};
  docs.forEach((doc, i) => {
    Object.entries((doc && doc.t) || {}).forEach(([tok, x]) => { const o = tokens[tok] = tokens[tok] || {}; Object.keys(x).forEach((s) => { if (!o[s] || x[s] < o[s]) o[s] = x[s]; }); });
    const k = (doc && doc.k) || {};
    Object.keys(k).forEach((g) => {
      const o = segs[g] = segs[g] || {};
      CARD.forEach((s) => { if (k[g][s]) o[s] = (o[s] || 0) + k[g][s]; });
      const h = hours[g] = hours[g] || {};
      Object.keys(k[g].h || {}).forEach((hh) => { h[list[i] + ' ' + hh] = (h[list[i] + ' ' + hh] || 0) + k[g].h[hh]; });
    });
  });
  return { days: list, steps: CARD, segs, hours, tokens };
}

// GET ?view=funnel&days=N: per day and in all, per source, the steps; plus the card orders (sent to pay / reserved / paid)
// and the site's lead-filter leads, per source
// (days: N, the last N days ending today; or the list of days itself, YYYY-MM-DD, at most 93: api/site-pulse.js rangeOf)
async function view(days) {
  let list = [];
  if (Array.isArray(days)) list = days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d))).slice(-93);
  if (!list.length) {
    const n = Math.max(1, Math.min(60, Number(days) || 14));
    const now = Date.now();
    for (let i = n - 1; i >= 0; i--) list.push(ro(new Date(now - i * 864e5)));
  }
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

module.exports = { STEPS, CARD, record, view, segments, cleanSource, cleanCamp, sourceOfTrack };
