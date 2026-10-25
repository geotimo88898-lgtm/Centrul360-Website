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
  // 26.10 night: one more LipoSonix ad in Timișoara, 25 lei a day: the "Stai întinsă" one made today (paused before it ran)
  { id: 'tm-lipo-new-2026-10-26', why: 'cerut de voi pe 26.10', actions: [
    { campaignId: '120251505897650103', name: 'TM LIPO · stai întinsă', daily: 25, why: 'TM: încă o reclamă LipoSonix, 25 lei/zi' },
    { campaignId: '120251505897650103', name: 'TM LIPO · stai întinsă', status: 'ACTIVE', why: 'TM: încă o reclamă LipoSonix, 25 lei/zi' },
  ] },
  // 26.10 evening, the owners: Timișoara one campaign only, the LipoSonix one that works (75 lei a day), the job ad off;
  // Arad proper leads: its 2 new gușă ads on, the good ones +20%, the day's cuts taken back.
  { id: 'plan-2026-10-26-b', why: 'decizia voastră din 26.10 seara', actions: [
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', daily: 75, why: 'TM: singura campanie, LipoSonix care merge' },
    { campaignId: '120251498280800103', name: 'TM ANGAJARE · Cosmeticiană', status: 'PAUSED', why: 'angajarea oprită' },
    { campaignId: '120251418158480103', name: 'tm vid 8 - copie', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251401225110103', name: 'TM HIFU G · rezultat real', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251505897650103', name: 'TM LIPO · stai întinsă', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251505980700103', name: 'TM LIPO · fără efort', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251497570950103', name: 'AR GUSA · fără efort', status: 'ACTIVE', why: 'Arad: mai multe leaduri' },
    { campaignId: '120251497422680103', name: 'AR GUSA · fără ace', status: 'ACTIVE', why: 'Arad: mai multe leaduri' },
    { campaignId: '120251418133050103', name: 'AR HIFU G · sezon', factor: 1.2, why: 'Arad: mai mult (programarea la 34 lei)' },
    { campaignId: '120251418285690103', name: 'AR RESTART · fără ace', factor: 1.2, why: 'Arad: mai mult (programarea la 31 lei)' },
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', daily: 65, why: 'Arad: bugetul de dimineață înapoi' },
    { campaignId: '120251389243100103', name: 'AR RESTART · local', daily: 60, why: 'Arad: bugetul de dimineață înapoi' },
  ] },
  // 26.10, the owner: Timișoara only LipoSonix and gușă (Restart off); what works very well gets more, so-so less.
  // Last 7 days, a booking's cost against the offer's price (15% very good, 30% bad):
  { id: 'plan-2026-10-26', why: 'decizia voastră din 26.10', actions: [
    { campaignId: '120251418278340103', name: 'TM RESTART · fără ace', status: 'PAUSED', why: 'TM: doar LipoSonix și gușă (Restart oprit)' },
    { campaignId: '120251400568370103', name: 'TM RESTART · local', status: 'PAUSED', why: 'TM: doar LipoSonix și gușă (Restart oprit)' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', factor: 1.2, why: 'merge foarte bine: programarea la 21 lei (10 din 24 de leaduri)' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', factor: 1.2, why: 'merge foarte bine: programarea la 27 lei (10 din 29), 3 au venit' },
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', factor: 1.2, why: 'LipoSonix TM: 640 lei încasați din 199 cheltuiți' },
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', factor: 0.8, why: 'merge so-so: programarea la 47 lei (5 din 20)' },
    { campaignId: '120251389243100103', name: 'AR RESTART · local', factor: 0.8, why: 'merge so-so săptămâna asta: programarea la 58 lei (4 din 20)' },
  ] },
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
  // a list of decided changes: a campaign switched off, or its budget times a factor (at least 10 lei, at most 150)
  for (const j of todo.filter((x) => x.actions)) {
    let failed = 0;
    for (const a of j.actions) {
      if (doc.log.some((e) => e.job === j.id && e.campaignId === a.campaignId && (e.status || 'budget') === (a.status || 'budget'))) continue; // a budget and a switch on the same campaign are two
      let r, rec;
      if (a.status) { r = await ads.act(conn, { action: 'status', id: a.campaignId, status: a.status }); rec = { status: a.status }; if (!r.error) await AC.switched(a.campaignId, a.status).catch(() => {}); }
      else {
        const b = await ads.budgetOf(conn, a.campaignId);
        if (b.error) { failed++; console.error('ads-once:', a.campaignId, b.error); continue; }
        const to = Math.max(10, Math.min(150, a.daily || Math.round(b.daily * a.factor)));
        r = await ads.act(conn, { action: 'budget', id: b.id, daily: to }); rec = { budgetId: b.id, from: b.daily, to };
      }
      if (r.error) { failed++; console.error('ads-once:', a.campaignId, r.error); continue; }
      doc.log.push(Object.assign({ job: j.id, at: new Date().toISOString(), campaignId: a.campaignId, campaignName: a.name, why: a.why }, rec));
      out.push(a.campaignId);
    }
    if (!failed) doc.done[j.id] = new Date().toISOString();
  }
  for (const j of todo.filter((x) => !x.actions)) {
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
