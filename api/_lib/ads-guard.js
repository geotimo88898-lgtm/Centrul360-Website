// Reclame's guard: the owner (20.10) gave it the ads account to run, "astfel încât să cheltuim bani pe reclame care
// chiar ne fac bani": the losing ads go off, the winners get more budget, and the owner (only George, in the app) is
// told each time what was done and why. Every 30 minutes (the automations' clock, api/automation-tick.js).
//
// Three layers, each judged only once its numbers are ripe (the owner: "la început urmărim CPL, dar pe măsură ce
// trece timpul începem să urmărim și celelalte"):
//   1. LEADS, from the first day: what a lead costs (last 7 days).
//   2. BOOKINGS, on the leads at least 2 days old (the desk had time to call them): what a booking costs.
//   3. MONEY, on the leads at least 4 weeks old (their appointments had time to happen): what came in for each leu.
// A booking's and the money's bar follow the offer's price (a Lipo booking at 640 lei may cost more than a 190 lei
// facial's): a booking up to 30% of the price means the first visits alone bring about 2 lei for each leu spent.
// Counted from the portal's start (16.10.2026): no leads before it, so no days before it either.
//
// STOP an ad when any layer says so:
//   1. it spent at least 40 lei and, even with one more lead right now, a lead would still cost over 20 lei
//      (40 lei and no lead → off · 70 lei and 2 leads, 35 each → off · 25 lei and 1 lead → stays, the next makes 12.50)
//   2. 8+ leads and, even with one more booking now, a booking would cost over 30% of the price (at least 60 lei)
//      (50 leads at 7 lei and 1 booking → off) · or 12+ leads and not one booking
//   3. 5+ bookings and 100+ lei spent, and less came in than was spent (10 bookings and nothing in after a month → off)
//   When it is its campaign's last running ad, the campaign goes off instead (one switch brings it back in Reclame).
// MORE BUDGET for a campaign (+20%, Meta's safe step that doesn't throw it back into learning; at most 150 lei a day;
// once in 48 hours; in the morning, on yesterday's whole day), when every layer it has reached is good:
//   1. a lead at 12 lei or less over 7 days (4+ leads) and at 13 or less over the last 3 days (2+ leads);
//   2. bookings: while young, 15%+ of its leads booked (when 5 or more came); once 5+ leads are 2 days old, a booking at
//      15% of the price or less (190 lei → 28.50) with 2+ bookings;
//   3. money: once 5+ bookings are 4 weeks old, 2+ lei in for each leu;
//   and it used at least 70% of its budget yesterday (raising a budget it doesn't spend changes nothing), and its women
//   saw it under 2.5 times in 7 days (a 7 km audience fills up fast; past that, more budget buys the same women again).
//   At most 2 raises a day per city: its campaigns reach the same women, and one raise at a time shows what it did.
// BACK to the old budget: 48 hours after a raise, judged on the days since it: a lead over 15 lei (or 30 lei, no lead).
//   A raise taken back isn't tried again on that campaign for 7 days.
// Leads: Meta's count or the portal's own (the forms that came in), whichever is higher.
// The owner's decisions win: an ad he switches back on is left alone; a budget he changed by hand isn't put back.
// Safety: Meta's numbers whole or nothing is done; never more than half of the running ads off at once; no lead
// anywhere while 150+ lei went out (leads not counted), 30+ leads and no booking anywhere (bookings not recorded),
// 20+ bookings and no money anywhere (payments not recorded): that layer does nothing.
//
// data/ads-guard.json: { on, lastRun, log: [{ type: 'stop'|'up'|'down', at, adId, campaignId, campaignName, … }] }

const { readJSON, writeJSON } = require('./store');
const { loadConnection } = require('./facebook');
const ads = require('./meta-ads');
const AC = require('./ads-cache');
const KPI = require('./kpi');
const { notifyMany, ownerIds } = require('./notify');
const { funnel } = require('./ads-funnel');

const KEY = 'data/ads-guard.json';
const RULE = { minSpend: 40, maxCpl: 20, days: 7 };
const BOOK = { age: 2, days: 30, killLeads: 8, kill: 0.30, killFloor: 60, junkLeads: 12, raise: 0.15, raiseBooked: 2, ripeLeads: 5, youngRate: 0.15, youngMin: 5 };
const MONEY = { age: 28, days: 90, booked: 5, spend: 100, kill: 1, raise: 2 };
const SCALE = { cpl7: 12, leads7: 4, cpl3: 13, leads3: 2, used: 0.7, step: 1.2, cap: 150, gapH: 48, backGapH: 7 * 24, perRun: 3, from: 6, to: 12, maxFreq: 2.5, perCityDay: 2 };
const BACK = { cpl: 15, noLeadSpend: 30 };
// LESS BUDGET for a so-so campaign (the owner, 26.10: "dacă merg okish scădem bugetul să facem loc pentru reclamele noi"):
// 8+ leads 2 days old and a booking between 15% and 30% of the offer's price (bad enough to stop is past that): -20%,
// at least 20 lei a day, once in 7 days, in the morning like a raise; it isn't raised again for 7 days.
const SOSO = { leads: 8, step: 0.8, floor: 20, gapH: 7 * 24 };
// a city's most a day per campaign (the owners, 26.10: Timișoara is full, one LipoSonix campaign at 75 lei a day)
const CITY_MAX = { TM: 75 };
// the city a campaign is for, from its name (AR… / TM…, Arad / Timișoara)
const cityOf = (name) => (/(^|[^a-z])ar([^a-z]|$)|arad/i.test(String(name)) ? 'AR' : /(^|[^a-z])tm([^a-z]|$)|timi/i.test(String(name)) ? 'TM' : '?' + name);
const EVERY = 30 * 60e3;
const SUSPECT_SPEND = 150;
const DAY = 86400e3;
const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t));
const hour = (t) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t)));
const r2 = (n) => Math.round(n * 100) / 100;
const lei = (n) => r2(n).toLocaleString('ro-RO') + ' lei';
const num = (n) => r2(n).toLocaleString('ro-RO');
const leadsTxt = (n) => n + (n === 1 ? ' lead' : ' leaduri');
const bookTxt = (n) => (n === 1 ? '1 programare' : n + ' programări');
const DEFAULT_STAGES = [
  { id: 'lead_nou', kind: 'open' }, { id: 'contactat', kind: 'open' }, { id: 'programare_stabilita', kind: 'booked' },
  { id: 'venit_la_programare', kind: 'open' }, { id: 'client_fidel', kind: 'won' }, { id: 'pierdut', kind: 'lost' },
];

// spent enough, and a lead would still cost too much even if the next one came now
// spent enough, and a lead would still cost too much even if the next one came now; or a lead already costs 40 lei or
// more (the owner, 25.10: "o reclamă, indiferent că e nouă, cu 40 lei pe lead nu o lăsăm să cheltuie aiurea")
const losing = (spend, leads) => spend >= RULE.minSpend && (spend / (leads + 1) > RULE.maxCpl || (leads > 0 && spend / leads >= 2 * RULE.maxCpl));

// who hears about it: the admin account named George (api/_lib/notify.js ownerIds). A notification never stops the
// guard: what was done on Meta is written down before anyone is told, and a failed one is only logged
let owners = null;
async function tell(n) {
  try {
    if (!owners) owners = await ownerIds({ readJSON });
    return await notifyMany({ readJSON, writeJSON }, owners, Object.assign({ kind: 'alert', go: 'reclame' }, n));
  } catch (e) { console.error('ads-guard tell:', e.message); return 0; }
}

// the portal's own leads per ad and per campaign / day, and each ad's lead form (a form that came in carries its
// ad's and campaign's ids)
function portalLeads(leads, since, until) {
  const ad = new Map(), campDay = new Map(), formOf = new Map();
  (leads || []).forEach((l) => (Array.isArray(l.forms) ? l.forms : []).forEach((f) => {
    if (!f) return;
    if (f.adId && f.id && !formOf.has(String(f.adId))) formOf.set(String(f.adId), String(f.id));
    const t = Date.parse(f.sentAt || f.at || l.createdAt);
    if (!Number.isFinite(t)) return;
    const d = day(t);
    if (d < since || d > until) return;
    if (f.adId) ad.set(String(f.adId), (ad.get(String(f.adId)) || 0) + 1);
    if (f.campaignId) { const k = String(f.campaignId) + '|' + d; campDay.set(k, (campDay.get(k) || 0) + 1); }
  }));
  return { ad, campDay, formOf };
}

// an offer's price by its lead form (Admin → Oferte: each offer's forms per city)
async function pricesByForm() {
  const offers = await readJSON('data/offers.json', []);
  const m = new Map();
  (Array.isArray(offers) ? offers : []).forEach((o) => Object.values(o.forms || {}).forEach((id) => { if (Number(o.priceNew) > 0) m.set(String(id), Number(o.priceNew)); }));
  return m;
}

// what the leads of some days became (booked, money in), per ad and per campaign; the ads are those that spent then
async function outcomes(spendRows, range) {
  if (!range || range.since > range.until) return { ads: new Map(), campaigns: new Map() };
  const [leads, appts, sales, stages] = await Promise.all([
    readJSON('data/leads.json', []), readJSON('data/appointments.json', []), readJSON('data/sales.json', []), readJSON('data/pipeline-stages.json', null),
  ]);
  const appointments = (appts || []).filter((a) => a.createdBy !== 'highlevel' && !a.importedAt && !a.ghlId);
  const list = spendRows.map((x) => ({ id: x.adId, name: x.adName, adsetId: '', campaignId: x.campaignId, campaignName: x.campaignName }));
  const f = funnel({ leads, appointments, sales, stages: Array.isArray(stages) && stages.length ? stages : DEFAULT_STAGES, ads: list, range });
  return { ads: f.ads, campaigns: f.campaigns };
}

// a layer's numbers per ad and per campaign: the spend of those days and what their leads became
async function layer(conn, range) {
  if (range.since > range.until) return { ok: true, ads: new Map(), campaigns: new Map(), total: { spend: 0, leads: 0, booked: 0, revenue: 0 } };
  const sp = await ads.adSpend(conn, 'custom', range);
  if (sp.error) return { error: sp.error };
  const out = await outcomes(sp.rows, range);
  const per = (map, id, spend) => { const o = map.get(id) || {}; return { spend, leads: o.leads || 0, booked: o.booked || 0, showed: o.showed || 0, revenue: o.revenue || 0 }; };
  const adsM = new Map(), campSpend = new Map();
  sp.rows.forEach((x) => { adsM.set(x.adId, per(out.ads, x.adId, (adsM.get(x.adId) || { spend: 0 }).spend + x.spend)); campSpend.set(x.campaignId, (campSpend.get(x.campaignId) || 0) + x.spend); });
  const campsM = new Map([...campSpend].map(([id, spend]) => [id, per(out.campaigns, id, spend)]));
  const total = [...campsM.values()].reduce((t, c) => ({ spend: t.spend + c.spend, leads: t.leads + c.leads, booked: t.booked + c.booked, revenue: t.revenue + c.revenue }), { spend: 0, leads: 0, booked: 0, revenue: 0 });
  return { ok: true, ads: adsM, campaigns: campsM, total };
}

// a guard that has not managed a whole check for this long says so (the clock dead, Meta refusing, the token expired)
const DEAD_H = 3;
// an ad the guard stopped and someone switched back on is left alone this long (the owner's switch wins), unless a
// lead already costs 40 lei or more on it (the owner, 25.10: that one is never let spend)
const IMMUNE_DAYS = 7;
const ACCOUNT_WHY = { 2: 'contul e dezactivat de Meta', 3: 'plata n-a trecut (sold neachitat)', 7: 'contul e în verificare la Meta', 9: 'contul e în perioadă de grație la plată', 100: 'contul se închide', 101: 'contul e închis' };

// opts: { force: run now (not waiting the 30 minutes), dry: only say what it would do, now: a time (tests) }
// Around the check: the claim of the run, and what came of it (lastOk / lastError, shown in Reclame when the guard is
// silent for too long, and told once a day)
async function guard(opts) {
  const o = opts || {};
  const now = o.now || Date.now();
  owners = null;
  // a read that fails throws: a doc read as empty would forget every stop and every raise (an ad the owner switched
  // back on would be stopped again, a raise would be made again)
  const doc = Object.assign({ on: true, lastRun: 0, log: [] }, (await readJSON(KEY, {})) || {});
  if (doc.on === false) return { skipped: 'off' };
  if (!o.force && now - (doc.lastRun || 0) < EVERY) return { skipped: 'recent' };
  if (!o.dry) { doc.lastRun = now; await writeJSON(KEY, doc, { quiet: true }); } // claimed first: a slow run isn't started again
  const today = day(now);
  if (!o.dry && doc.lastOk && now - doc.lastOk > DEAD_H * 3600e3 && doc.deadTold !== today) {
    doc.deadTold = today;
    await writeJSON(KEY, doc, { quiet: true });
    await tell({ tone: 'bad', tag: 'guard-dead-' + today, title: 'GARDA ⚠️ - n-a mai verificat reclamele de ' + Math.round((now - doc.lastOk) / 3600e3) + ' ore',
      text: ((doc.lastError && doc.lastError.why) || 'ceasul n-a mai bătut') + '. Reclamele merg în continuare, dar nimeni nu le mai oprește sau mărește până nu-și revine.' });
  }
  const patch = async (x) => {
    const cur = (await readJSON(KEY, {}).catch(() => null));
    if (!cur) return;
    await writeJSON(KEY, Object.assign(cur, x), { quiet: true }).catch((e) => console.error('ads-guard mark:', e.message));
  };
  try {
    const r = await check(o, now, doc);
    if (!o.dry) {
      if (r && r.error) await patch({ lastError: { at: new Date(now).toISOString(), why: r.error } });
      else if (r && r.skipped === 'not_connected') await patch({ lastError: { at: new Date(now).toISOString(), why: 'Facebook nu e conectat pentru reclame' } });
      else await patch({ lastOk: now, lastError: null });
    }
    return r;
  } catch (e) {
    if (!o.dry) await patch({ lastError: { at: new Date(now).toISOString(), why: e.message } });
    throw e;
  }
}

async function check(o, now, doc) {
  const conn = await loadConnection(readJSON);
  if (!conn.userToken || !conn.adAccountId) return { skipped: 'not_connected' };
  const today = day(now);
  // an account that doesn't deliver (the card declined, disabled): nothing to judge; said once a day
  const acc = await ads.accountStatus(conn);
  if (acc.error) return { error: acc.error };
  if (acc.status !== 1) {
    if (!o.dry && doc.accountTold !== today) {
      doc.accountTold = today;
      await writeJSON(KEY, doc, { quiet: true });
      await tell({ tone: 'bad', tag: 'guard-account-' + today, title: 'RECLAMELE NU RULEAZĂ ⚠️ - contul de reclame', text: (ACCOUNT_WHY[acc.status] || 'Meta a oprit livrarea (stare ' + acc.status + ')') + '. De rezolvat în Ads Manager.' });
    }
    return { skipped: 'account_inactive', status: acc.status };
  }
  const until = today, since = day(now - (RULE.days - 1) * DAY), yesterday = day(now - DAY), since3 = day(now - 2 * DAY);
  const res = await ads.adResults(conn, { since, until });
  if (res.error) return { error: res.error };
  const allLeads = await readJSON('data/leads.json', []);
  const mine = portalLeads(allLeads, since, until);
  // a job ad (api/_lib/hire-once.js) brings candidates, not clients: no booking or money to judge it by
  const job = (name) => /angajare/i.test(String(name || ''));
  const rows = res.rows.filter((x) => !job(x.campaignName)).map((x) => Object.assign({}, x, { leads: Math.max(x.metaLeads, mine.ad.get(x.adId) || 0) }));
  const spent = rows.reduce((n, x) => n + x.spend, 0), got = rows.reduce((n, x) => n + x.leads, 0);
  if (spent >= SUSPECT_SPEND && !got) {
    // leads not counted anywhere (a broken form, the webhook down): nothing is stopped on numbers that can't be right; said once a day
    if (!o.dry && doc.noLeadsTold !== today) {
      doc.noLeadsTold = today;
      await writeJSON(KEY, doc, { quiet: true });
      await tell({ tone: 'bad', tag: 'guard-no-leads-' + today, title: 'GARDA ⚠️ - niciun lead numărat', text: lei(spent) + ' cheltuiți în 7 zile și niciun lead nici la Meta, nici în portal: de verificat formularele. Până atunci nu opresc nimic.' });
    }
    return { skipped: 'no_leads_counted', spent };
  }

  // the layers' days, from the portal's start on (no leads before it)
  const first = day(KPI.cfg.start); // the portal's first day (the leads from 22:05 on; the same day the page counts from)
  const clamp = (r) => ({ since: r.since < first ? first : r.since, until: r.until });
  const young = await outcomes(rows, { since: since < first ? first : since, until: yesterday }); // leads up to yesterday
  const [B, M] = await Promise.all([
    layer(conn, clamp({ since: day(now - BOOK.days * DAY), until: day(now - BOOK.age * DAY) })),
    layer(conn, clamp({ since: day(now - MONEY.days * DAY), until: day(now - MONEY.age * DAY) })),
  ]);
  // a layer whose numbers aren't being recorded says nothing; a layer Meta refused today: no raise and no trim this
  // run (whole or nothing), the stops of the first layer still go
  const bookOn = !B.error && !(B.total.leads >= 30 && !B.total.booked);
  const moneyOn = !M.error && !(M.total.booked >= 20 && !M.total.revenue);
  const layersOk = !B.error && !M.error;
  // an offer's price, by the ad's lead form or by the offer's name in the campaign's name; unknown: the bookings and
  // the money of that ad aren't judged against a price (a 640 lei LipoSonix booking isn't held to a 190 lei facial's bar)
  const prices = await pricesByForm();
  const offers = await readJSON('data/offers.json', []).catch(() => []);
  const byName = KPI.offerMatcher(Array.isArray(offers) ? offers : []);
  const nameOf = new Map(); rows.forEach((x) => nameOf.set(x.adId, x.campaignName));
  const priceOfAd = (adId) => { const p = prices.get(mine.formOf.get(String(adId)) || ''); if (p) return p; const o = byName(String(nameOf.get(adId) || '').split('·')[0].replace(/^(TM|AR)\s+/i, '')); return o && Number(o.priceNew) > 0 ? Number(o.priceNew) : null; };
  const adsOfCamp = new Map(); rows.forEach((x) => { const l = adsOfCamp.get(x.campaignId) || []; l.push(x.adId); adsOfCamp.set(x.campaignId, l); });
  const priceOfCamp = (id) => { const p = (adsOfCamp.get(id) || []).map(priceOfAd).filter(Boolean); return p.length ? Math.max(...p) : null; };

  // ---- STOP
  // an ad stopped by the guard in the last 7 days that runs again was switched back on by hand: left alone, unless a
  // lead already costs 40 lei or more on it
  const stoppedAt = new Map();
  (doc.log || []).filter((e) => (!e.type || e.type === 'stop') && e.adId && now - Date.parse(e.at) < IMMUNE_DAYS * DAY).forEach((e) => stoppedAt.set(e.adId, e.at));
  const hard = (x) => x.leads > 0 && x.spend >= 2 * RULE.minSpend && x.spend / x.leads >= 2 * RULE.maxCpl;
  const immune = (x) => stoppedAt.has(x.adId) && !hard(x);
  const cap = Math.max(1, Math.floor(rows.length / 2));
  const reasonOf = (x) => {
    if (losing(x.spend, x.leads)) return x.leads ? 'CPL prea mare: ' + lei(x.spend / x.leads) + ' pe lead (' + leadsTxt(x.leads) + ', ' + lei(x.spend) + ' în 7 zile)' : 'Niciun lead după ' + lei(x.spend) + ' cheltuiți (7 zile)';
    const b = bookOn && B.ads.get(x.adId), price = priceOfAd(x.adId);
    if (b) {
      const bar = price ? Math.max(BOOK.killFloor, BOOK.kill * price) : null;
      if (b.leads >= BOOK.junkLeads && !b.booked) return leadsTxt(b.leads) + ' și niciunul nu s-a programat (' + lei(b.spend) + ')';
      if (bar && b.leads >= BOOK.killLeads && b.spend / (b.booked + 1) > bar) return 'Programările costă prea mult: ' + (b.booked ? lei(b.spend / b.booked) + ' pe programare' : 'nicio programare') + ' (' + leadsTxt(b.leads) + ', ' + bookTxt(b.booked) + ', ' + lei(b.spend) + ')';
    }
    const m = moneyOn && M.ads.get(x.adId);
    if (m && m.booked >= MONEY.booked && m.spend >= MONEY.spend && m.revenue / m.spend < MONEY.kill) return 'Nu aduce bani: ' + bookTxt(m.booked) + ', ' + lei(m.revenue) + ' încasați din ' + lei(m.spend) + ' cheltuiți (leadurile de acum 4+ săptămâni)';
    return '';
  };
  const bad = rows.filter((x) => reasonOf(x)).sort((a, b) => b.spend - a.spend);
  const off = bad.filter((x) => !immune(x)).slice(0, cap);
  const offIds = new Set(off.map((x) => x.adId));

  // ---- BUDGET (per campaign, on its days)
  const days = await ads.campaignDays(conn, { since, until });
  const noDays = !!days.error; // Meta refused the days: no budget change and no verdict this run (the last ones are kept)
  const camps = new Map();
  if (!noDays) days.rows.filter((d) => !job(d.campaignName)).forEach((d) => {
    const c = camps.get(d.campaignId) || { id: d.campaignId, name: d.campaignName, spend7: 0, leads7: 0, spend3: 0, leads3: 0, spendY: 0, days: [] };
    const leads = Math.max(d.metaLeads, mine.campDay.get(d.campaignId + '|' + d.day) || 0);
    c.days.push({ day: d.day, spend: d.spend, leads });
    c.spend7 += d.spend; c.leads7 += leads;
    if (d.day >= since3) { c.spend3 += d.spend; c.leads3 += leads; }
    if (d.day === yesterday) c.spendY += d.spend;
    camps.set(d.campaignId, c);
  });
  const offCamps = new Set(off.map((x) => x.campaignId));
  // the budget changes asked for in chat (api/_lib/ads-once.js) count too: a campaign just changed by hand isn't changed again
  const onceLog = (((await readJSON('data/ads-once.json', {}).catch(() => ({}))) || {}).log || []).filter((e) => e.to != null)
    .map((e) => Object.assign({}, e, { type: e.to < e.from ? 'down' : 'up', byHand: true }));
  const lastBudget = (id) => (doc.log || []).concat(onceLog).filter((e) => (e.type === 'up' || e.type === 'down') && e.campaignId === id).sort((a, b) => (a.at < b.at ? -1 : 1)).pop();
  const ups = [], downs = [], skipped = [];
  const no = (c, why) => { skipped.push({ campaign: c.name, why }); };
  const h = hour(now), morning = h >= SCALE.from && h < SCALE.to;
  for (const c of camps.values()) {
    if (offCamps.has(c.id)) continue;
    const last = lastBudget(c.id);
    const since48 = !last || now - Date.parse(last.at) >= (last.type === 'down' ? SCALE.backGapH : SCALE.gapH) * 3600e3;
    // back: a raise that made the leads dearer, judged on the days since it
    if (last && last.type === 'up' && since48) {
      const from = day(Date.parse(last.at));
      c.after = c.days.filter((d) => d.day >= from).reduce((t, d) => ({ spend: t.spend + d.spend, leads: t.leads + d.leads }), { spend: 0, leads: 0 });
      if (!last.byHand && ((c.after.leads && c.after.spend / c.after.leads > BACK.cpl) || (!c.after.leads && c.after.spend >= BACK.noLeadSpend))) { downs.push({ c, last }); continue; }
    }
    if (!since48 || !morning || !layersOk) continue;
    // 1. leads
    if (!(c.leads7 >= SCALE.leads7 && c.spend7 / c.leads7 <= SCALE.cpl7 && c.leads3 >= SCALE.leads3 && c.spend3 / c.leads3 <= SCALE.cpl3)) continue;
    const price = priceOfCamp(c.id);
    // 2. bookings: ripe (5+ leads 2 days old) → what a booking costs; young → how many book so far
    const b = bookOn && B.campaigns.get(c.id);
    if (b && b.leads >= BOOK.ripeLeads) {
      c.cpb = b.booked ? b.spend / b.booked : null;
      if (b.booked < BOOK.raiseBooked || (price && c.cpb > BOOK.raise * price)) { no(c, 'leadul e ieftin, dar ' + (b.booked ? 'programarea costă ' + lei(c.cpb) : 'nu are programări') + ' (' + leadsTxt(b.leads) + ', ' + bookTxt(b.booked) + ')'); continue; }
    } else {
      const y = young.campaigns.get(c.id) || {};
      if ((y.leads || 0) >= BOOK.youngMin && (y.booked || 0) / y.leads < BOOK.youngRate) { no(c, 'leadul e ieftin, dar s-au programat doar ' + (y.booked || 0) + ' din ' + y.leads); continue; }
    }
    // 3. money, once there is some
    const m = moneyOn && M.campaigns.get(c.id);
    if (m && m.booked >= MONEY.booked && m.spend > 0) {
      c.roas = m.revenue / m.spend;
      if (c.roas < MONEY.raise) { no(c, 'aduce doar ' + num(c.roas) + ' lei la 1 leu dat (leadurile de acum 4+ săptămâni)'); continue; }
    }
    ups.push({ c });
  }
  ups.sort((a, b) => a.c.spend7 / a.c.leads7 - b.c.spend7 / b.c.leads7);
  // where its budget sits and whether it can go up at all (its cap, its use yesterday): known before a city's daily
  // slots are given out, so a campaign that can't be raised doesn't take one
  for (let i = 0; i < ups.length; i++) {
    const c = ups[i].c;
    const b = await ads.budgetOf(conn, c.id);
    const capC = Math.min(SCALE.cap, CITY_MAX[cityOf(c.name)] || SCALE.cap);
    let why = '';
    if (b.error) why = 'bugetul nu e al unui singur set (' + b.error + ')';
    else if (!(b.daily > 0)) why = 'nu are buget zilnic';
    else if (b.daily >= capC) why = 'e la plafonul ei, ' + capC + ' lei/zi';
    else if (c.spendY < b.daily * SCALE.used) why = 'ieri a cheltuit doar ' + lei(c.spendY) + ' din ' + b.daily + ' lei';
    else if (Math.min(capC, Math.round(b.daily * SCALE.step)) <= b.daily) why = 'e la plafonul ei';
    if (why) { no(c, why); ups.splice(i--, 1); continue; }
    ups[i].b = b; ups[i].to = Math.min(capC, Math.round(b.daily * SCALE.step));
  }
  // so-so: bookings neither good nor bad
  const lows = [];
  if (bookOn && layersOk && morning) for (const c of camps.values()) {
    if (offCamps.has(c.id) || ups.some((u) => u.c.id === c.id) || downs.some((d) => d.c.id === c.id)) continue;
    const last = lastBudget(c.id);
    if (last && now - Date.parse(last.at) < SOSO.gapH * 3600e3) continue;
    const b = B.campaigns.get(c.id);
    if (!b || b.leads < SOSO.leads || !b.booked) continue;
    const price = priceOfCamp(c.id), cpb = b.spend / b.booked;
    if (price && cpb > BOOK.raise * price && cpb <= Math.max(BOOK.killFloor, BOOK.kill * price)) { c.cpb = cpb; c.book = b; lows.push({ c }); }
  }
  // how often their women saw them (7 days): only for the ones that would get more budget
  if (ups.length) {
    const reach = await ads.campaignReach(conn, { since, until }, ups.map((u) => u.c.id));
    if (reach.error) ups.length = 0; // not known: no raise now
    else for (let i = ups.length - 1; i >= 0; i--) {
      const f = reach.freq.get(ups[i].c.id) || 0;
      ups[i].c.freq = f;
      if (f >= SCALE.maxFreq) { no(ups[i].c, 'aceleași femei au văzut-o de ' + num(f) + ' ori în 7 zile'); ups.splice(i, 1); }
    }
  }
  // at most 2 raises a day per city (today's earlier ones count), 3 a run
  const perCity = new Map();
  (doc.log || []).filter((e) => e.type === 'up' && day(Date.parse(e.at)) === today).forEach((e) => perCity.set(cityOf(e.campaignName), (perCity.get(cityOf(e.campaignName)) || 0) + 1));
  for (let i = 0; i < ups.length; i++) {
    const k = cityOf(ups[i].c.name), n = perCity.get(k) || 0;
    if (n >= SCALE.perCityDay || i >= SCALE.perRun) { no(ups[i].c, n >= SCALE.perCityDay ? 'azi s-au mărit deja ' + n + ' în același oraș' : 'mai mult de ' + SCALE.perRun + ' deodată nu'); ups.splice(i--, 1); continue; }
    perCity.set(k, n + 1);
  }

  // ---- VERDICT per campaign, on the days it really ran (the owner, 25.10: the notifications and Reclame's notes say what
  // the guard sees, with real numbers, not a fixed 3 days): TOP / ATENȚIE / DE URMĂRIT, what it is based on, which days.
  // ATENȚIE means what the guard itself acts on (one of its ads is a stop), nothing softer: the owner isn't asked to
  // decide what the guard leaves running
  const verdicts = {};
  const dd = (d) => d.slice(8, 10) + '.' + d.slice(5, 7);
  for (const c of camps.values()) {
    const ran = c.days.filter((d) => d.spend > 0).sort((a, b) => (a.day < b.day ? -1 : 1));
    if (!ran.length || c.spend7 < 20) continue; // too little to say anything
    const price = priceOfCamp(c.id);
    const b = bookOn && B.campaigns.get(c.id), y = young.campaigns.get(c.id) || {};
    const ripe = b && b.leads >= BOOK.ripeLeads;
    const cpl = c.leads7 ? c.spend7 / c.leads7 : null, cpb = ripe && b.booked ? b.spend / b.booked : null;
    const facts = ['în ' + (ran.length === 1 ? '1 zi' : ran.length + ' zile') + ' în care a rulat (' + (ran.length === 1 ? dd(ran[0].day) : dd(ran[0].day) + '-' + dd(ran[ran.length - 1].day)) + '): ' + lei(c.spend7) + ', ' +
      (c.leads7 ? leadsTxt(c.leads7) + ' (' + lei(cpl) + ' unul)' : 'niciun lead')];
    if (ripe) facts.push(b.booked ? bookTxt(b.booked) + ' din ' + leadsTxt(b.leads) + ' (' + lei(cpb) + ' una)' : 'nicio programare din ' + leadsTxt(b.leads));
    else if ((y.leads || 0) >= 3) facts.push((y.booked || 0) + ' din ' + y.leads + ' s-au programat');
    const m = moneyOn && M.campaigns.get(c.id);
    if (m && m.booked >= MONEY.booked && m.spend > 0) facts.push(lei(m.revenue) + ' încasați din ' + lei(m.spend) + ' (leadurile de acum 4+ săptămâni)');
    const mineBad = bad.filter((x) => x.campaignId === c.id);
    // TOP is what the guard raises (a cheap lead, and the bookings or the money, once there are any, good too)
    const good = cpl != null && cpl <= SCALE.cpl7 && c.leads7 >= SCALE.leads7 && c.leads3 >= SCALE.leads3 && c.spend3 / c.leads3 <= SCALE.cpl3 &&
      (ripe ? b.booked >= BOOK.raiseBooked && (!price || cpb <= BOOK.raise * price) : !((y.leads || 0) >= BOOK.youngMin && (y.booked || 0) / y.leads < BOOK.youngRate)) &&
      !(m && m.booked >= MONEY.booked && m.spend > 0 && m.revenue / m.spend < MONEY.raise);
    let flag = 'ok';
    if (mineBad.length) {
      const stopping = mineBad.filter((x) => offIds.has(x.adId)), waiting = mineBad.filter((x) => !offIds.has(x.adId) && !immune(x)), kept = mineBad.filter((x) => immune(x));
      // an ad the owner switched back on is theirs: watched, not an alarm
      flag = stopping.length || waiting.length ? 'bad' : 'watch';
      if (!stopping.length && waiting.length) facts.push((waiting.length === 1 ? 'reclama „' + waiting[0].adName + '” se oprește' : waiting.length + ' reclame se opresc') + ' la următoarea verificare');
      if (kept.length) facts.push((kept.length === 1 ? 'reclama „' + kept[0].adName + '” a fost repornită de voi, o las' : kept.length + ' reclame repornite de voi, le las'));
    }
    else if (good) flag = 'top';
    else if (losing(c.spend7, c.leads7) || (cpl != null && cpl > SCALE.cpl3) || (price && cpb && cpb > BOOK.raise * price) || (ripe && b.leads >= BOOK.junkLeads && !b.booked) || (!c.leads7 && c.spend7 >= 20)) flag = 'watch';
    verdicts[c.id] = { flag, name: c.name, why: facts, at: new Date(now).toISOString() };
  }

  if (o.dry) {
    const layerOf = (x) => { const b = B.ads && B.ads.get(x.adId), m = M.ads && M.ads.get(x.adId); return { campaign: x.campaignName, cpl: x.leads ? r2(x.spend / x.leads) : null, leads7: x.leads, spend7: r2(x.spend), price: priceOfAd(x.adId), immune: immune(x),
      book: b ? { leads: b.leads, booked: b.booked, spend: r2(b.spend), cpb: b.booked ? r2(b.spend / b.booked) : null } : null, money: m && m.booked ? { booked: m.booked, revenue: m.revenue, spend: r2(m.spend), roas: m.spend ? r2(m.revenue / m.spend) : null } : null }; };
    return { checked: rows.length, layers: { bookings: bookOn ? 'on' : 'off', money: moneyOn ? 'on' : 'off', bookDays: B.error ? B.error : clamp({ since: day(now - BOOK.days * DAY), until: day(now - BOOK.age * DAY) }), moneyDays: clamp({ since: day(now - MONEY.days * DAY), until: day(now - MONEY.age * DAY) }), days: noDays ? days.error : 'ok' },
      wouldStop: off.map((x) => ({ campaign: x.campaignName, ad: x.adName, why: reasonOf(x) })), wouldRaise: ups.map(({ c, b, to }) => ({ campaign: c.name, from: b.daily, to, why: whyUp(c) })),
      wouldLower: downs.map(({ c }) => ({ campaign: c.name, why: whyDown(c) })), wouldSoso: lows.map(({ c }) => ({ campaign: c.name, cpb: r2(c.cpb) })), verdicts, notRaised: skipped, ads: rows.map(layerOf) };
  }

  // ---- DO, each change written down the moment Meta confirms it (a run cut short, or a notification that fails,
  // never loses the record: the page shows it, the next run doesn't repeat it)
  const cur = Object.assign({ on: true, log: [] }, (await readJSON(KEY, {})) || {});
  const done = [];
  const record = async (e) => { done.push(e); cur.log = (cur.log || []).concat(e).slice(-200); await writeJSON(KEY, cur, { quiet: true }); };
  for (const x of off) {
    // its campaign's last running ad: the campaign goes off (one switch brings it back); else the ad only
    const left = await ads.runningAdsOf(conn, x.campaignId);
    const campaignOff = !left.error && !left.ids.some((id) => id !== x.adId);
    const target = campaignOff ? x.campaignId : x.adId;
    const r = await ads.act(conn, { action: 'status', id: target, status: 'PAUSED' });
    if (r.error) { console.error('ads-guard stop:', target, r.error); continue; }
    await AC.switched(target, 'PAUSED').catch(() => {});
    const why = reasonOf(x);
    await record({ type: 'stop', at: new Date(now).toISOString(), adId: x.adId, adName: x.adName, campaignId: x.campaignId, campaignName: x.campaignName, spend: r2(x.spend), leads: x.leads, campaignOff, why });
    if (campaignOff) await tell({ tone: 'bad', tag: 'guard-stop-' + x.adId, title: 'OPRIT ⛔ - ' + String(x.campaignName || x.adName || 'campania').slice(0, 60), text: why + '.' });
    else await tell({ tone: 'bad', tag: 'guard-stop-' + x.adId, title: 'OPRIT ⛔ - o reclamă din ' + String(x.campaignName || 'campanie').slice(0, 50), text: String(x.adName || 'reclama') + ': ' + why + '. Campania merge mai departe cu celelalte reclame.' });
  }
  for (const { c, b, to } of ups) {
    const r = await ads.act(conn, { action: 'budget', id: b.id, daily: to });
    if (r.error) { console.error('ads-guard up:', c.id, r.error); continue; }
    await record({ type: 'up', at: new Date(now).toISOString(), campaignId: c.id, campaignName: c.name, budgetId: b.id, from: b.daily, to, why: whyUp(c) });
    await tell({ tone: 'good', tag: 'guard-up-' + c.id, title: 'BUGET MĂRIT 📈 - ' + String(c.name).slice(0, 60), text: b.daily + ' → ' + to + ' lei/zi. ' + whyUp(c) + '.' });
  }
  for (const { c, last } of downs) {
    const b = await ads.budgetOf(conn, c.id);
    // a budget changed by hand since the raise stays as the owner set it
    if (b.error || b.id !== last.budgetId || Math.round(b.daily) !== Math.round(last.to)) continue;
    const r = await ads.act(conn, { action: 'budget', id: b.id, daily: last.from });
    if (r.error) { console.error('ads-guard down:', c.id, r.error); continue; }
    await record({ type: 'down', at: new Date(now).toISOString(), campaignId: c.id, campaignName: c.name, budgetId: b.id, from: b.daily, to: last.from, why: whyDown(c) });
    await tell({ tone: 'bad', tag: 'guard-down-' + c.id, title: 'BUGET ÎNAPOI 📉 - ' + String(c.name).slice(0, 60), text: b.daily + ' → ' + last.from + ' lei/zi. ' + whyDown(c) + '.' });
  }
  for (const { c } of lows) {
    const b = await ads.budgetOf(conn, c.id);
    if (b.error || !(b.daily > SOSO.floor)) continue;
    const to = Math.max(SOSO.floor, Math.round(b.daily * SOSO.step));
    if (to >= b.daily) continue;
    const r = await ads.act(conn, { action: 'budget', id: b.id, daily: to });
    if (r.error) { console.error('ads-guard soso:', c.id, r.error); continue; }
    const why = 'Merge so-so: programarea la ' + lei(c.cpb) + ' (' + bookTxt(c.book.booked) + ' din ' + leadsTxt(c.book.leads) + '), mai puțin buget pentru reclame noi';
    await record({ type: 'down', trim: 'soso', at: new Date(now).toISOString(), campaignId: c.id, campaignName: c.name, budgetId: b.id, from: b.daily, to, why });
    await tell({ tone: 'bad', tag: 'guard-soso-' + c.id, title: 'BUGET SCĂZUT ✂️ - ' + String(c.name).slice(0, 60), text: b.daily + ' → ' + to + ' lei/zi. ' + why + '.' });
  }
  // the verdicts: kept for Reclame. A campaign is told once when it becomes TOP or ATENȚIE: when the flag differs from
  // the last one told, has held for two checks in a row, and isn't the same story again (ATENȚIE ↔ De urmărit around
  // the same bar is one story); a campaign changed this run has its own message. The first ever check only keeps them.
  const before = cur.verdicts || {}, told = cur.told || {};
  const touched = new Set(done.map((e) => e.campaignId));
  for (const [id, v] of Object.entries(verdicts)) {
    const last = told[id];
    const held = before[id] && before[id].flag === v.flag;
    if (v.flag === 'ok' && held && last) { delete told[id]; continue; } // well again: a later TOP / ATENȚIE is news
    if (!cur.verdictsAt || !held || (v.flag !== 'top' && v.flag !== 'bad')) continue;
    if (touched.has(id)) { told[id] = { flag: v.flag, at: new Date(now).toISOString() }; continue; }
    if (last && (last.flag === v.flag || (last.flag === 'bad' && v.flag === 'watch') || (last.flag === 'watch' && v.flag === 'bad'))) continue;
    told[id] = { flag: v.flag, at: new Date(now).toISOString() };
    await tell({ tone: v.flag === 'top' ? 'good' : 'bad', tag: 'guard-verdict-' + id + '-' + v.flag + '-' + today,
      title: (v.flag === 'top' ? 'TOP 🚀 - ' : 'ATENȚIE ⚠️ - ') + String(v.name || 'campanie').slice(0, 60), text: v.why.join(' · ') + '.' });
  }
  if (!noDays) { cur.verdicts = verdicts; cur.verdictsAt = new Date(now).toISOString(); }
  cur.told = told;
  await writeJSON(KEY, cur, { quiet: true });
  if (done.length) await AC.clear().catch(() => {});
  return { checked: rows.length, done: done.map((e) => e.type + ': ' + (e.campaignName || e.adName)), skipped: noDays ? 'days: ' + days.error : layersOk ? undefined : 'layers' };
}

function whyUp(c) {
  return 'Merge bine: ' + lei(c.spend7 / c.leads7) + ' pe lead (' + leadsTxt(c.leads7) + ' în 7 zile)' + (c.cpb ? ', ' + lei(c.cpb) + ' pe programare' : '') + (c.roas != null ? ', ' + num(c.roas) + ' lei la 1 leu dat' : '') +
    '; își cheltuie bugetul și publicul nu e obosit';
}
function whyDown(c) { const a = c.after || { spend: 0, leads: 0 }; return a.leads ? 'După mărire leadul a urcat la ' + lei(a.spend / a.leads) + ' (' + leadsTxt(a.leads) + ', ' + lei(a.spend) + ')' : 'După mărire, ' + lei(a.spend) + ' fără niciun lead'; }

// what Reclame shows: what the guard did in the last 3 days, what it sees now, and whether it is alive
async function recent() {
  const doc = (await readJSON(KEY, {})) || {};
  const since = Date.now() - 3 * DAY;
  return { on: doc.on !== false, lastOk: doc.lastOk || 0, lastError: doc.lastError || null, verdicts: doc.verdicts || {}, verdictsAt: doc.verdictsAt || '',
    log: (doc.log || []).filter((e) => Date.parse(e.at) > since).map((e) => Object.assign({ type: 'stop' }, e)).reverse() };
}

module.exports = { guard, recent, losing, RULE, BOOK, MONEY, SCALE, DEAD_H };
