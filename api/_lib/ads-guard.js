// Reclame's guard: the owner (20.10) gave it the ads account to run, "astfel încât să cheltuim bani pe reclame care
// chiar ne fac bani": the losing ads go off, the winners get more budget, and the owner (only George, in the app) is
// told each time what was done and why. Every 30 minutes (the automations' clock, api/automation-tick.js).
//
// STOP an ad (last 7 days, today included):
//   - it spent at least 40 lei and, even with one more lead right now, a lead would still cost over 20 lei
//     (40 lei and no lead → off · 70 lei and 2 leads, 35 each → off · 25 lei and 1 lead → stays, the next makes 12.50)
//   - or its leads don't book: 12+ leads older than a day and not one booking
//   When it is its campaign's last running ad, the campaign goes off instead (one switch brings it back in Reclame).
// MORE BUDGET for a campaign (+20%, Meta's safe step that doesn't throw it back into learning; at most 150 lei a day;
// once in 48 hours; in the morning, on yesterday's whole day):
//   a lead at 12 lei or less over 7 days (4+ leads) and at 13 or less over the last 3 days (2+ leads), it used at least
//   70% of its budget yesterday (raising a budget it doesn't spend changes nothing), its leads book (15%+ of 5 or more,
//   when there are that many: cheap leads that never come aren't money), and its women saw it under 2.5 times in 7 days
//   (a 7 km audience fills up fast; past that, more budget buys the same women again, dearer).
//   At most 2 raises a day per city: its campaigns reach the same women, and one raise at a time shows what it did.
// BACK to the old budget: 48 hours after a raise, judged on the days since it: a lead over 15 lei (or 30 lei, no lead).
//   A raise taken back isn't tried again on that campaign for 7 days.
// Leads: Meta's count or the portal's own (the forms that came in), whichever is higher.
// The owner's decisions win: an ad he switches back on is left alone; a budget he changed by hand isn't put back.
// Safety: Meta's numbers whole or nothing is done; never more than half of the running ads off at once; no lead
// anywhere while 150+ lei went out means the leads aren't being counted, so nothing is done.
//
// data/ads-guard.json: { on, lastRun, log: [{ type: 'stop'|'up'|'down', at, adId, campaignId, campaignName, … }] }

const { readJSON, writeJSON } = require('./store');
const { loadConnection } = require('./facebook');
const ads = require('./meta-ads');
const AC = require('./ads-cache');
const { notifyMany } = require('./notify');
const { funnel } = require('./ads-funnel');

const KEY = 'data/ads-guard.json';
const RULE = { minSpend: 40, maxCpl: 20, days: 7, junkLeads: 12 };
const SCALE = { cpl7: 12, leads7: 4, cpl3: 13, leads3: 2, used: 0.7, step: 1.2, cap: 150, gapH: 48, backGapH: 7 * 24, perRun: 3, from: 6, to: 12, bookRate: 0.15, bookMin: 5, maxFreq: 2.5, perCityDay: 2 };
const BACK = { cpl: 15, noLeadSpend: 30 };
// the city a campaign is for, from its name (AR… / TM…, Arad / Timișoara)
const cityOf = (name) => (/(^|[^a-z])ar([^a-z]|$)|arad/i.test(String(name)) ? 'AR' : /(^|[^a-z])tm([^a-z]|$)|timi/i.test(String(name)) ? 'TM' : '?' + name);
const EVERY = 30 * 60e3;
const SUSPECT_SPEND = 150;
const DAY = 86400e3;
const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t));
const hour = (t) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t)));
const r2 = (n) => Math.round(n * 100) / 100;
const lei = (n) => r2(n).toLocaleString('ro-RO') + ' lei';
const leadsTxt = (n) => n + (n === 1 ? ' lead' : ' leaduri');
const DEFAULT_STAGES = [
  { id: 'lead_nou', kind: 'open' }, { id: 'contactat', kind: 'open' }, { id: 'programare_stabilita', kind: 'booked' },
  { id: 'venit_la_programare', kind: 'open' }, { id: 'client_fidel', kind: 'won' }, { id: 'pierdut', kind: 'lost' },
];

// spent enough, and a lead would still cost too much even if the next one came now
const losing = (spend, leads) => spend >= RULE.minSpend && spend / (leads + 1) > RULE.maxCpl;

// who hears about it: the admin account named George (the owner, 20.10: "doar mie, contului de admin numit george")
async function ownerIds() {
  const emps = await readJSON('data/employees.json', []);
  const g = (emps || []).filter((e) => e.active !== false && e.role === 'admin' && /^george$/i.test(String(e.username || e.name || '').trim()));
  return g.length ? g.map((e) => e.id) : ['admin'];
}
async function tell(n) {
  return notifyMany({ readJSON, writeJSON }, await ownerIds(), Object.assign({ kind: 'alert', go: 'reclame' }, n));
}

// the portal's own leads per ad and per campaign / day (a form that came in carries its ad's and campaign's ids)
function portalLeads(leads, since, until) {
  const ad = new Map(), campDay = new Map();
  (leads || []).forEach((l) => (Array.isArray(l.forms) ? l.forms : []).forEach((f) => {
    if (!f) return;
    const t = Date.parse(f.sentAt || f.at || l.createdAt);
    if (!Number.isFinite(t)) return;
    const d = day(t);
    if (d < since || d > until) return;
    if (f.adId) ad.set(String(f.adId), (ad.get(String(f.adId)) || 0) + 1);
    if (f.campaignId) { const k = String(f.campaignId) + '|' + d; campDay.set(k, (campDay.get(k) || 0) + 1); }
  }));
  return { ad, campDay };
}

// what the leads became (booked or not), per ad and per campaign, for the leads that had a day to be called
async function bookings(rows, since, until) {
  if (since > until) return { ads: new Map(), campaigns: new Map() };
  const [leads, appts, sales, stages] = await Promise.all([
    readJSON('data/leads.json', []), readJSON('data/appointments.json', []), readJSON('data/sales.json', []), readJSON('data/pipeline-stages.json', null),
  ]);
  const appointments = (appts || []).filter((a) => a.createdBy !== 'highlevel' && !a.importedAt && !a.ghlId);
  const list = rows.map((x) => ({ id: x.adId, name: x.adName, adsetId: '', campaignId: x.campaignId, campaignName: x.campaignName }));
  const f = funnel({ leads, appointments, sales, stages: Array.isArray(stages) && stages.length ? stages : DEFAULT_STAGES, ads: list, range: { since, until } });
  return { ads: f.ads, campaigns: f.campaigns };
}

// opts: { force: run now (not waiting the 30 minutes), dry: only say what it would do, now: a time (tests) }
async function guard(opts) {
  const o = opts || {};
  const now = o.now || Date.now();
  const doc = Object.assign({ on: true, lastRun: 0, log: [] }, (await readJSON(KEY, {}).catch(() => ({}))) || {});
  if (doc.on === false) return { skipped: 'off' };
  if (!o.force && now - (doc.lastRun || 0) < EVERY) return { skipped: 'recent' };
  if (!o.dry) { doc.lastRun = now; await writeJSON(KEY, doc, { quiet: true }); } // claimed first: a slow run isn't started again
  const conn = await loadConnection(readJSON);
  if (!conn.userToken || !conn.adAccountId) return { skipped: 'not_connected' };
  const until = day(now), since = day(now - (RULE.days - 1) * DAY), yesterday = day(now - DAY), since3 = day(now - 2 * DAY);
  const res = await ads.adResults(conn, { since, until });
  if (res.error) return { error: res.error };
  const mine = portalLeads(await readJSON('data/leads.json', []), since, until);
  const rows = res.rows.map((x) => Object.assign({}, x, { leads: Math.max(x.metaLeads, mine.ad.get(x.adId) || 0) }));
  const spent = rows.reduce((n, x) => n + x.spend, 0), got = rows.reduce((n, x) => n + x.leads, 0);
  if (spent >= SUSPECT_SPEND && !got) return { skipped: 'no_leads_counted', spent };
  const book = await bookings(rows, since, yesterday);

  // ---- STOP
  const stoppedBefore = new Set((doc.log || []).filter((e) => !e.type || e.type === 'stop').map((e) => e.adId));
  const cap = Math.max(1, Math.floor(rows.length / 2));
  const reasonOf = (x) => {
    const b = book.ads.get(x.adId) || {};
    if (losing(x.spend, x.leads)) return x.leads ? 'CPL prea mare: ' + lei(x.spend / x.leads) + ' pe lead (' + leadsTxt(x.leads) + ', ' + lei(x.spend) + ' în 7 zile)' : 'Niciun lead după ' + lei(x.spend) + ' cheltuiți (7 zile)';
    if ((b.leads || 0) >= RULE.junkLeads && !b.booked) return leadsTxt(b.leads) + ' și niciunul nu s-a programat (' + lei(x.spend) + ' în 7 zile)';
    return '';
  };
  const off = rows.filter((x) => !stoppedBefore.has(x.adId) && reasonOf(x)).sort((a, b) => b.spend - a.spend).slice(0, cap);

  // ---- BUDGET (per campaign, on its days)
  const days = await ads.campaignDays(conn, { since, until });
  const camps = new Map();
  if (!days.error) days.rows.forEach((d) => {
    const c = camps.get(d.campaignId) || { id: d.campaignId, name: d.campaignName, spend7: 0, leads7: 0, spend3: 0, leads3: 0, spendY: 0, days: [] };
    const leads = Math.max(d.metaLeads, mine.campDay.get(d.campaignId + '|' + d.day) || 0);
    c.days.push({ day: d.day, spend: d.spend, leads });
    c.spend7 += d.spend; c.leads7 += leads;
    if (d.day >= since3) { c.spend3 += d.spend; c.leads3 += leads; }
    if (d.day === yesterday) c.spendY += d.spend;
    camps.set(d.campaignId, c);
  });
  const offCamps = new Set(off.map((x) => x.campaignId));
  const lastBudget = (id) => (doc.log || []).filter((e) => (e.type === 'up' || e.type === 'down') && e.campaignId === id).pop();
  const ups = [], downs = [];
  for (const c of camps.values()) {
    if (offCamps.has(c.id)) continue;
    const last = lastBudget(c.id);
    const since48 = !last || now - Date.parse(last.at) >= (last.type === 'down' ? SCALE.backGapH : SCALE.gapH) * 3600e3;
    // back: a raise that made the leads dearer, judged on the days since it
    if (last && last.type === 'up' && since48) {
      const from = day(Date.parse(last.at));
      c.after = c.days.filter((d) => d.day >= from).reduce((t, d) => ({ spend: t.spend + d.spend, leads: t.leads + d.leads }), { spend: 0, leads: 0 });
      if ((c.after.leads && c.after.spend / c.after.leads > BACK.cpl) || (!c.after.leads && c.after.spend >= BACK.noLeadSpend)) { downs.push({ c, last }); continue; }
    }
    const h = hour(now);
    if (!since48 || h < SCALE.from || h >= SCALE.to) continue;
    if (!(c.leads7 >= SCALE.leads7 && c.spend7 / c.leads7 <= SCALE.cpl7 && c.leads3 >= SCALE.leads3 && c.spend3 / c.leads3 <= SCALE.cpl3)) continue;
    const b = book.campaigns.get(c.id) || {};
    if ((b.leads || 0) >= SCALE.bookMin && (b.booked || 0) / b.leads < SCALE.bookRate) continue;
    ups.push({ c, b });
  }
  ups.sort((a, b) => a.c.spend7 / a.c.leads7 - b.c.spend7 / b.c.leads7);
  // how often their women saw them (7 days): only for the ones that would get more budget
  const skipped = [];
  if (ups.length) {
    const reach = await ads.campaignReach(conn, { since, until }, ups.map((u) => u.c.id));
    if (reach.error) ups.length = 0; // not known: no raise now
    else for (let i = ups.length - 1; i >= 0; i--) {
      const f = reach.freq.get(ups[i].c.id) || 0;
      ups[i].c.freq = f;
      if (f >= SCALE.maxFreq) { skipped.push({ campaign: ups[i].c.name, why: 'aceleași femei au văzut-o de ' + r2(f).toLocaleString('ro-RO') + ' ori în 7 zile' }); ups.splice(i, 1); }
    }
  }
  // at most 2 raises a day per city (today's earlier ones count)
  const today = day(now);
  const perCity = new Map();
  (doc.log || []).filter((e) => e.type === 'up' && day(Date.parse(e.at)) === today).forEach((e) => perCity.set(cityOf(e.campaignName), (perCity.get(cityOf(e.campaignName)) || 0) + 1));
  for (let i = 0; i < ups.length; i++) {
    const k = cityOf(ups[i].c.name), n = perCity.get(k) || 0;
    if (n >= SCALE.perCityDay) { skipped.push({ campaign: ups[i].c.name, why: 'azi s-au mărit deja ' + n + ' în același oraș' }); ups.splice(i--, 1); continue; }
    perCity.set(k, n + 1);
  }

  if (o.dry) {
    return { checked: rows.length, wouldStop: off.map((x) => ({ campaign: x.campaignName, ad: x.adName, why: reasonOf(x) })), wouldRaise: ups.slice(0, SCALE.perRun).map(({ c }) => ({ campaign: c.name, why: whyUp(c) })),
      wouldLower: downs.map(({ c }) => ({ campaign: c.name, why: whyDown(c) })), notRaised: skipped, campaigns: [...camps.values()].map((c) => ({ campaign: c.name, spend7: r2(c.spend7), leads7: c.leads7, spend3: r2(c.spend3), leads3: c.leads3, spendY: r2(c.spendY) })) };
  }

  const done = [];
  for (const x of off) {
    // its campaign's last running ad: the campaign goes off (one switch brings it back); else the ad only
    const left = await ads.runningAdsOf(conn, x.campaignId);
    const campaignOff = !left.error && !left.ids.some((id) => id !== x.adId);
    const target = campaignOff ? x.campaignId : x.adId;
    const r = await ads.act(conn, { action: 'status', id: target, status: 'PAUSED' });
    if (r.error) { console.error('ads-guard stop:', target, r.error); continue; }
    await AC.switched(target, 'PAUSED');
    const why = reasonOf(x);
    done.push({ type: 'stop', at: new Date(now).toISOString(), adId: x.adId, adName: x.adName, campaignId: x.campaignId, campaignName: x.campaignName, spend: r2(x.spend), leads: x.leads, campaignOff, why });
    await tell({ tone: 'bad', tag: 'guard-stop-' + x.adId, title: '⛔ Am oprit: ' + String(x.campaignName || x.adName || 'reclama').slice(0, 60), text: why + '.' });
  }
  for (const { c } of ups.slice(0, SCALE.perRun)) {
    const b = await ads.budgetOf(conn, c.id);
    if (b.error || !(b.daily > 0) || b.daily >= SCALE.cap) continue;
    // it must be using its budget (raising one it doesn't spend changes nothing)
    if (c.spendY < b.daily * SCALE.used) continue;
    const to = Math.min(SCALE.cap, Math.round(b.daily * SCALE.step));
    if (to <= b.daily) continue;
    const r = await ads.act(conn, { action: 'budget', id: b.id, daily: to });
    if (r.error) { console.error('ads-guard up:', c.id, r.error); continue; }
    done.push({ type: 'up', at: new Date(now).toISOString(), campaignId: c.id, campaignName: c.name, budgetId: b.id, from: b.daily, to, why: whyUp(c) });
    await tell({ tone: 'good', tag: 'guard-up-' + c.id, title: '📈 Buget mărit: ' + String(c.name).slice(0, 50) + ' ' + b.daily + ' → ' + to + ' lei/zi', text: whyUp(c) + '.' });
  }
  for (const { c, last } of downs) {
    const b = await ads.budgetOf(conn, c.id);
    // a budget changed by hand since the raise stays as the owner set it
    if (b.error || b.id !== last.budgetId || Math.round(b.daily) !== Math.round(last.to)) continue;
    const r = await ads.act(conn, { action: 'budget', id: b.id, daily: last.from });
    if (r.error) { console.error('ads-guard down:', c.id, r.error); continue; }
    done.push({ type: 'down', at: new Date(now).toISOString(), campaignId: c.id, campaignName: c.name, budgetId: b.id, from: b.daily, to: last.from, why: whyDown(c) });
    await tell({ tone: 'bad', tag: 'guard-down-' + c.id, title: '📉 Buget înapoi: ' + String(c.name).slice(0, 50) + ' ' + b.daily + ' → ' + last.from + ' lei/zi', text: whyDown(c) + '.' });
  }
  if (done.length) {
    const cur = Object.assign({ on: true, log: [] }, (await readJSON(KEY, {}).catch(() => ({}))) || {});
    cur.log = (cur.log || []).concat(done).slice(-200);
    await writeJSON(KEY, cur, { quiet: true });
    await AC.clear().catch(() => {});
  }
  return { checked: rows.length, done: done.map((e) => e.type + ': ' + (e.campaignName || e.adName)) };
}

function whyUp(c) { return 'Merge bine: ' + lei(c.spend7 / c.leads7) + ' pe lead (' + leadsTxt(c.leads7) + ' în 7 zile), își cheltuie bugetul și publicul nu e obosit'; }
function whyDown(c) { const a = c.after || { spend: 0, leads: 0 }; return a.leads ? 'După mărire leadul a urcat la ' + lei(a.spend / a.leads) + ' (' + leadsTxt(a.leads) + ', ' + lei(a.spend) + ')' : 'După mărire, ' + lei(a.spend) + ' fără niciun lead'; }

// what Reclame shows: what the guard did in the last 3 days
async function recent() {
  const doc = (await readJSON(KEY, {}).catch(() => ({}))) || {};
  const since = Date.now() - 3 * DAY;
  return { on: doc.on !== false, log: (doc.log || []).filter((e) => Date.parse(e.at) > since).map((e) => Object.assign({ type: 'stop' }, e)).reverse() };
}

module.exports = { guard, recent, losing, RULE, SCALE };
