// Reclame's guard (the owner, 20.10: "ardele pe cele care nu merg deloc… să nu cheltuie bani aiurea"): the ads that
// don't bring leads are switched off by themselves, so the money goes only to the ones that work.
//
// Every 30 minutes (the automations' clock, api/automation-tick.js), over the last 7 days (today included): an ad that
// spent at least 40 lei goes off when, even with one more lead right now, a lead would still cost over 20 lei.
//   40 lei and no lead → off · 70 lei and 2 leads (35 each) → off · 25 lei and 1 lead → stays (the next lead: 12.50)
// Leads: Meta's count or the portal's own (the forms that came in), whichever is higher. When the ad was its
// campaign's last running one, the campaign goes off too (Reclame then shows only what runs).
// An ad the owner switches back on after the guard stopped it is left alone: the owner's decision wins.
// Safety: Meta's numbers whole or nothing is done; never more than half of the running ads at once; no lead anywhere
// while 150+ lei went out means the leads aren't being counted, so nothing is done.
//
// data/ads-guard.json: { on, lastRun, log: [{ at, adId, adName, campaignId, campaignName, spend, leads, campaignOff }] }

const { readJSON, writeJSON } = require('./store');
const { loadConnection } = require('./facebook');
const ads = require('./meta-ads');
const AC = require('./ads-cache');
const { notifyMany, adminIds } = require('./notify');

const KEY = 'data/ads-guard.json';
const RULE = { minSpend: 40, maxCpl: 20, days: 7 };
const EVERY = 30 * 60e3;
const SUSPECT_SPEND = 150;
const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t));
const lei = (n) => (Math.round(n * 100) / 100).toLocaleString('ro-RO') + ' lei';

// spent enough, and a lead would still cost too much even if the next one came now
const losing = (spend, leads) => spend >= RULE.minSpend && spend / (leads + 1) > RULE.maxCpl;
const why = (x) => lei(x.spend) + ' în ' + RULE.days + ' zile, ' + (x.leads ? x.leads + (x.leads === 1 ? ' lead' : ' leaduri') + ' (' + lei(x.spend / x.leads) + ' unul)' : 'niciun lead');

// the portal's own leads per ad in those days (a form that came in carries its ad's id)
function portalLeads(leads, since, until) {
  const per = new Map();
  (leads || []).forEach((l) => (Array.isArray(l.forms) ? l.forms : []).forEach((f) => {
    if (!f || !f.adId) return;
    const t = Date.parse(f.sentAt || f.at || l.createdAt);
    if (!Number.isFinite(t)) return;
    const d = day(t);
    if (d >= since && d <= until) per.set(String(f.adId), (per.get(String(f.adId)) || 0) + 1);
  }));
  return per;
}

// opts: { force: run now (not waiting the 30 minutes), dry: only say what would go off }
async function guard(opts) {
  const o = opts || {};
  const doc = Object.assign({ on: true, lastRun: 0, log: [] }, (await readJSON(KEY, {}).catch(() => ({}))) || {});
  if (doc.on === false) return { skipped: 'off' };
  if (!o.force && Date.now() - (doc.lastRun || 0) < EVERY) return { skipped: 'recent' };
  if (!o.dry) { doc.lastRun = Date.now(); await writeJSON(KEY, doc, { quiet: true }); } // claimed first: a slow run isn't started again
  const conn = await loadConnection(readJSON);
  if (!conn.userToken || !conn.adAccountId) return { skipped: 'not_connected' };
  const until = day(Date.now()), since = day(Date.now() - (RULE.days - 1) * 86400e3);
  const res = await ads.adResults(conn, { since, until });
  if (res.error) return { error: res.error };
  const mine = portalLeads(await readJSON('data/leads.json', []), since, until);
  const rows = res.rows.map((x) => Object.assign({}, x, { leads: Math.max(x.metaLeads, mine.get(x.adId) || 0) }));
  const spent = rows.reduce((n, x) => n + x.spend, 0), got = rows.reduce((n, x) => n + x.leads, 0);
  if (spent >= SUSPECT_SPEND && !got) return { skipped: 'no_leads_counted', spent };
  const stoppedBefore = new Set((doc.log || []).map((e) => e.adId));
  const cap = Math.max(1, Math.floor(rows.length / 2));
  const off = rows.filter((x) => !stoppedBefore.has(x.adId) && losing(x.spend, x.leads)).sort((a, b) => b.spend - a.spend).slice(0, cap);
  if (o.dry) return { checked: rows.length, wouldStop: off.map((x) => ({ ad: x.adName, campaign: x.campaignName, why: why(x) })), keeps: rows.filter((x) => !off.includes(x)).map((x) => ({ ad: x.adName, campaign: x.campaignName, why: why(x) })) };

  const stopped = [];
  for (const x of off) {
    const r = await ads.act(conn, { action: 'status', id: x.adId, status: 'PAUSED' });
    if (r.error) { console.error('ads-guard:', x.adId, r.error); continue; }
    await AC.switched(x.adId, 'PAUSED');
    // its campaign's last running ad: the campaign goes off too
    let campaignOff = false;
    const left = await ads.runningAdsOf(conn, x.campaignId);
    if (!left.error && !left.ids.some((id) => id !== x.adId)) {
      const c = await ads.act(conn, { action: 'status', id: x.campaignId, status: 'PAUSED' });
      if (!c.error) { campaignOff = true; await AC.switched(x.campaignId, 'PAUSED'); }
    }
    const e = { at: new Date().toISOString(), adId: x.adId, adName: x.adName, campaignId: x.campaignId, campaignName: x.campaignName, spend: Math.round(x.spend * 100) / 100, leads: x.leads, campaignOff };
    stopped.push(e);
    const ids = await adminIds({ readJSON });
    await notifyMany({ readJSON, writeJSON }, ids, { kind: 'alert', tone: 'bad', go: 'reclame', tag: 'guard-' + x.adId,
      title: 'RECLAMĂ OPRITĂ ⛔ - ' + String(x.campaignName || x.adName || 'fără nume').slice(0, 60), text: why(x) + '. Am oprit-o ca să nu mai cheltuie.' });
  }
  if (stopped.length) {
    const cur = Object.assign({ on: true, log: [] }, (await readJSON(KEY, {}).catch(() => ({}))) || {});
    cur.log = (cur.log || []).concat(stopped).slice(-100);
    await writeJSON(KEY, cur, { quiet: true });
    await AC.clear().catch(() => {});
  }
  return { checked: rows.length, stopped: stopped.map((e) => e.campaignName || e.adName) };
}

// what Reclame shows: the ads stopped in the last 3 days
async function recent() {
  const doc = (await readJSON(KEY, {}).catch(() => ({}))) || {};
  const since = Date.now() - 3 * 86400e3;
  return { on: doc.on !== false, rule: RULE, log: (doc.log || []).filter((e) => Date.parse(e.at) > since).reverse() };
}

module.exports = { guard, recent, losing, RULE };
