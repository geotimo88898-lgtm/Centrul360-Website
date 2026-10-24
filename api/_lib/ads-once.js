// One-off budget changes the owners asked for, done once by the automations' clock (api/automation-tick.js) and then
// never again; the guard (api/_lib/ads-guard.js) keeps its own rules and watches these campaigns like any other.
//   24.10: Timișoara has more bookings than room (done the same day: 7 campaigns -40%); Arad has room, so its LipoSonix /
//   gușă campaigns get +30% (at most 150 lei a day).
// data/ads-once.json: { done: { <job id>: <when> }, log: [{ job, at, campaignId, campaignName, budgetId, from, to }] }

const { readJSON, writeJSON } = require('./store');
const { loadConnection } = require('./facebook');
const ads = require('./meta-ads');
const AC = require('./ads-cache');
const { notifyMany } = require('./notify');

const KEY = 'data/ads-once.json';
const JOBS = [
  { id: 'ar-lipo-gusa-2026-10-24', city: /(^|[^a-z])ar([^a-z]|$)|arad/i, match: /lipo|gu[sș][aă]|b[aă]rbi|hifu/i, factor: 1.3, cap: 150,
    why: 'Arad are loc de programări: mai mult buget la LipoSonix și gușă (cerut de voi pe 24.10)' },
];

// who hears about it: the admin account named George (as the guard)
async function ownerIds() {
  const emps = await readJSON('data/employees.json', []);
  const g = (emps || []).filter((e) => e.active !== false && e.role === 'admin' && /^george$/i.test(String(e.username || e.name || '').trim()));
  return g.length ? g.map((e) => e.id) : ['admin'];
}

async function run() {
  const doc = Object.assign({ done: {}, log: [] }, (await readJSON(KEY, {}).catch(() => ({}))) || {});
  const todo = JOBS.filter((j) => !doc.done[j.id]);
  if (!todo.length) return { skipped: 'nothing' };
  const conn = await loadConnection(readJSON);
  if (!conn.userToken || !conn.adAccountId) return { skipped: 'not_connected' };
  const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t));
  // the campaigns that spent this week (the running ones and those paused a moment ago)
  const days = await ads.campaignDays(conn, { since: day(Date.now() - 6 * 864e5), until: day(Date.now()) });
  if (days.error) return { error: days.error };
  const camps = new Map();
  days.rows.forEach((d) => { if (d.spend > 0) camps.set(d.campaignId, d.campaignName); });
  const ids = await ownerIds();
  const out = [];
  for (const j of todo) {
    const did = new Set(doc.log.filter((e) => e.job === j.id).map((e) => e.campaignId));
    let failed = 0;
    for (const [id, name] of camps) {
      if (did.has(id) || !j.city.test(name) || !j.match.test(name)) continue;
      const b = await ads.budgetOf(conn, id);
      if (b.error || !(b.daily > 0) || b.daily >= j.cap) continue;
      const to = Math.min(j.cap, Math.round(b.daily * j.factor));
      if (to <= b.daily) continue;
      const r = await ads.act(conn, { action: 'budget', id: b.id, daily: to });
      if (r.error) { failed++; console.error('ads-once:', id, r.error); continue; }
      doc.log.push({ job: j.id, at: new Date().toISOString(), campaignId: id, campaignName: name, budgetId: b.id, from: b.daily, to });
      out.push(name + ' ' + b.daily + ' → ' + to);
      await notifyMany({ readJSON, writeJSON }, ids, { kind: 'alert', go: 'reclame', tone: 'good', tag: 'once-' + j.id + '-' + id,
        title: '📈 Buget mărit: ' + String(name).slice(0, 50) + ' ' + b.daily + ' → ' + to + ' lei/zi', text: j.why + '.' });
    }
    if (!failed) doc.done[j.id] = new Date().toISOString(); // a refused one is tried again on the next tick
  }
  await writeJSON(KEY, doc, { quiet: true });
  if (out.length) await AC.clear().catch(() => {});
  return { changed: out.length };
}

module.exports = { run };
