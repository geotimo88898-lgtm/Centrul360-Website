// What the WhatsApp messages cost in a month, read from Meta (the owner, 16.11: „Mesaje WhatsApp automat, ca reclamele”).
// Each city's WhatsApp Business account (api/_lib/whatsapp.js loadConfig: its wabaId and token) is asked for its
// pricing analytics (GET /{waba}?fields=currency,pricing_analytics.start().end().granularity(DAILY), every data
// point's cost summed); an account that can't give them is asked for the older conversation analytics instead. The
// cost comes in the account's currency (RON, EUR or USD), turned into lei at today's BNR rate. Both clinics are
// Centrul360's, so their sum is the line; a city's share is given too (an account shared by both is split in two).
// Kept a few hours (api/_lib/ads-cache.js), like the ads.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const lastDay = (m) => m + '-' + String(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate()).padStart(2, '0');
// the first second of a month in Bucharest (00:00 on the 1st, +2 or +3 hours), as Unix seconds: the month's messages are
// the clinic's month, not UTC's (a message at 01:00 on the 1st belongs to that month)
const FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function monthStart(y, m) { // m: 1..12 (13 = January of the next year)
  const yy = m > 12 ? y + 1 : y, mm = m > 12 ? 1 : m;
  const utc = Date.UTC(yy, mm - 1, 1);
  for (const h of [2, 3]) {
    const ms = utc - h * 3600e3, p = {};
    FMT.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
    if (+p.year === yy && +p.month === mm && +p.day === 1 && +p.hour === 0 && +p.minute === 0) return Math.floor(ms / 1000);
  }
  return Math.floor((utc - 2 * 3600e3) / 1000);
}
const monthBounds = (month) => ({ start: monthStart(+month.slice(0, 4), +month.slice(5, 7)), end: monthStart(+month.slice(0, 4), +month.slice(5, 7) + 1) });
const clean = (s) => String(s || 'eroare').replace(/\d{8,}/g, '…').slice(0, 240); // never an id in what the owner reads

async function graph(path, token, fields) {
  const WA = require('./whatsapp');
  try {
    const r = await fetch(WA.GRAPH + '/' + encodeURIComponent(path) + '?' + new URLSearchParams({ fields, access_token: token }));
    const j = await r.json().catch(() => ({}));
    if (j && j.error) return { error: clean(j.error.message) + (j.error.code ? ' (cod ' + j.error.code + ')' : '') };
    return j || {};
  } catch (e) { return { error: clean(e.message) }; }
}
// the sum of every data point's cost in an analytics answer ({ data: [{ data_points: [{ cost }] }] })
const costIn = (a) => ((a && a.data) || []).reduce((s, d) => s + ((d && d.data_points) || []).reduce((x, p) => x + (Number(p && p.cost) || 0), 0), 0);

// one account, one month: { cost, currency, source } or { error }
async function oneWaba(waba, token, start, end) {
  const range = '.start(' + start + ').end(' + end + ').granularity(DAILY)';
  const p = await graph(waba, token, 'currency,pricing_analytics' + range);
  if (!p.error) return { cost: costIn(p.pricing_analytics), currency: p.currency || '', source: 'pricing_analytics' };
  const c = await graph(waba, token, 'currency,conversation_analytics' + range + '.metric_types(["COST","CONVERSATION"])');
  if (!c.error) return { cost: costIn(c.conversation_analytics), currency: c.currency || '', source: 'conversation_analytics' };
  return { error: 'pricing_analytics: ' + p.error + '; conversation_analytics: ' + c.error };
}

// the month up to a day: { lei, byCity: { city: lei }, parts: [{ currency, cost, source }], readAt } or { error }
async function monthCost(readJSON, month, day) {
  const WA = require('./whatsapp');
  const cfg = await WA.loadConfig().catch(() => null);
  const accounts = new Map();
  (WA.CITIES || []).forEach((city) => {
    const n = cfg && cfg.numbers && cfg.numbers[city];
    if (!n || !n.wabaId || !n.token) return;
    const a = accounts.get(String(n.wabaId)) || { token: n.token, cities: [] };
    a.cities.push(city);
    accounts.set(String(n.wabaId), a);
  });
  if (!accounts.size) return { lei: 0, byCity: {}, parts: [], none: true }; // no WhatsApp account connected: nothing to pay
  const b = monthBounds(month);
  const start = b.start, end = Math.min(b.end, Math.floor(Date.now() / 1000));
  if (end <= start) return { lei: 0, byCity: {}, parts: [] };
  const current = day <= lastDay(month);
  return require('./ads-cache').cached('wa-cost-' + month, current ? 3 * 3600e3 : 24 * 3600e3, async () => {
    const { writeJSON } = require('./store');
    const eur = await require('./eur-rate').eurToday(readJSON, writeJSON).catch(() => null);
    const toLei = (cost, cur) => (/^RON$/i.test(cur) ? cost : /^EUR$/i.test(cur) && eur && eur.rate ? cost * eur.rate : /^USD$/i.test(cur) && eur && eur.usd ? cost * eur.usd : null);
    let lei = 0;
    const byCity = {}, parts = [];
    for (const [id, a] of accounts) {
      const r = await oneWaba(id, a.token, start, end);
      if (r.error) return { error: r.error };
      const l = toLei(r.cost, r.currency);
      if (l == null) return { error: 'costul vine în ' + (r.currency || 'moneda necunoscută') + ' și cursul lui lipsește acum' };
      lei += l;
      a.cities.forEach((c) => { byCity[c] = r2((byCity[c] || 0) + l / a.cities.length); });
      parts.push({ currency: r.currency, cost: r2(r.cost), source: r.source });
    }
    return { lei: r2(lei), byCity, parts };
  }, { keep: true });
}

// the same reading without the cache, per city, for the check at /api/lead-health?wacost=1 (no ids, no token)
async function probe(month) {
  const WA = require('./whatsapp');
  const cfg = await WA.loadConfig().catch(() => null);
  const b = monthBounds(month);
  const start = b.start, end = Math.min(b.end, Math.floor(Date.now() / 1000));
  const out = {};
  for (const city of WA.CITIES || []) {
    const n = cfg && cfg.numbers && cfg.numbers[city];
    out[city] = !n || !n.wabaId || !n.token ? { error: 'fără cont de business sau token' } : await oneWaba(n.wabaId, n.token, start, end);
  }
  return out;
}


// a campaign's own spend (the owner, 23.11: „cât am cheltuit pe mesaje”): the MARKETING messages Meta charged between two
// moments (Unix seconds), every WhatsApp account summed, in lei: { lei, volume, unit, byCity, readAt } or { error }. A
// marketing message is charged when it is delivered, so lei / volume is what one delivered message cost.
async function rangeMarketing(readJSON, start, end) {
  const WA = require('./whatsapp');
  const cfg = await WA.loadConfig().catch(() => null);
  const accounts = new Map();
  (WA.CITIES || []).forEach((city) => {
    const n = cfg && cfg.numbers && cfg.numbers[city];
    if (!n || !n.wabaId || !n.token) return;
    const a = accounts.get(String(n.wabaId)) || { token: n.token, cities: [] };
    a.cities.push(city);
    accounts.set(String(n.wabaId), a);
  });
  if (!accounts.size) return { lei: 0, volume: 0, unit: 0, byCity: {}, none: true };
  end = Math.min(end, Math.floor(Date.now() / 1000));
  // Meta's DAILY points are the account's days (US Pacific, 8 h behind UTC) and a point counts only when its day starts at
  // or after `start`: the day before is taken too, else the first send's day goes missing
  start = Math.floor(start / 86400) * 86400 - 86400;
  if (end <= start) return { lei: 0, volume: 0, unit: 0, byCity: {} };
  return require('./ads-cache').cached('wa-mkt3-' + start, 3600e3, async () => {
    const { writeJSON } = require('./store');
    const eur = await require('./eur-rate').eurToday(readJSON, writeJSON).catch(() => null);
    const toLei = (cost, cur) => (/^RON$/i.test(cur) ? cost : /^EUR$/i.test(cur) && eur && eur.rate ? cost * eur.rate : /^USD$/i.test(cur) && eur && eur.usd ? cost * eur.usd : null);
    let lei = 0, volume = 0, pages = 0;
    const byCity = {}, cats = {};
    for (const [id, a] of accounts) {
      const range = '.start(' + start + ').end(' + end + ').granularity(DAILY).dimensions(["PRICING_CATEGORY"])';
      const p = await graph(id, a.token, 'currency,pricing_analytics' + range);
      if (p.error) return { error: p.error };
      let cost = 0, vol = 0;
      // Meta pages a long answer (every day times every category): every page is read, else the sum is a fraction
      let page = p.pricing_analytics, guard = 0;
      while (page && guard++ < 40) {
        pages++;
        ((page.data) || []).forEach((d) => ((d && d.data_points) || []).forEach((x) => {
          const cat = String((x && x.pricing_category) || '?').toUpperCase();
          cats[cat] = r2((cats[cat] || 0) + (Number(x && x.cost) || 0));
          if (x && x.pricing_category && cat !== 'MARKETING') return;
          cost += Number(x && x.cost) || 0; vol += Number(x && x.volume) || 0;
        }));
        const next = page.paging && page.paging.next;
        if (!next) break;
        try { const r = await fetch(next); page = await r.json(); if (page && page.error) return { error: clean(page.error.message) }; } catch (e) { return { error: clean(e.message) }; }
      }
      const l = toLei(cost, p.currency);
      if (l == null) return { error: 'costul vine în ' + (p.currency || 'moneda necunoscută') + ' și cursul lui lipsește acum' };
      lei += l; volume += vol;
      a.cities.forEach((c) => { byCity[c] = r2((byCity[c] || 0) + l / a.cities.length); });
    }
    return { lei: r2(lei), volume, unit: volume ? Math.round((lei / volume) * 1000) / 1000 : 0, byCity, pages, cats, readAt: new Date().toISOString() };
  }, { keep: true });
}

module.exports = { monthCost, costIn, probe, monthBounds, rangeMarketing };
