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
  // 28.10, the owner (plan 1 after the calendars: both clinics have room for about twice the bookings, with ~50% coming):
  // more to what brings bookings cheaply, the two best TM gușă ads back on, off what brings almost nothing
  { id: 'plan-2026-10-28', why: 'planul 1, aprobat de voi pe 28.10', actions: [
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', daily: 100, why: 'TM abdomen: programarea la ~29 lei, loc în calendar' },
    { campaignId: '120251418133050103', name: 'AR HIFU G · sezon', daily: 95, why: 'Arad gușă: programarea la ~30 lei, vin 65%' },
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', daily: 80, why: 'Arad gușă: programarea la ~30 lei, vin 65%' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', daily: 50, why: 'TM gușă pornită din nou: programarea la 21 lei' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', status: 'ACTIVE', why: 'TM gușă pornită din nou: programarea la 21 lei' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', daily: 50, why: 'TM gușă pornită din nou: programarea la 27 lei' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', status: 'ACTIVE', why: 'TM gușă pornită din nou: programarea la 27 lei' },
    { campaignId: '120251505897650103', name: 'TM LIPO · fără efort', status: 'PAUSED', why: 'leaduri scumpe, nicio venire' },
    { campaignId: '120251497423510103', name: 'AR LIPO · raritate', status: 'PAUSED', why: 'o programare din 9 leaduri; LipoSonix nu se mai face' },
  ] },
  // 27.10 night, the owner: Arad's Restart off; what runs is the LipoSonix TM that works at 75 lei a day (it had been put
  // back to 50 by hand), its two 25 lei tests, Arad's two gușă and its LipoSonix; the job ad stays on
  { id: 'plan-2026-10-27', why: 'cerut de voi pe 27.10', actions: [
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', daily: 75, why: 'TM: LipoSonix care merge, 75 lei/zi' },
    { campaignId: '120251418285690103', name: 'AR RESTART · fără ace', status: 'PAUSED', why: 'Arad: Restart oprit' },
    { campaignId: '120251389243100103', name: 'AR RESTART · local', status: 'PAUSED', why: 'Arad: Restart oprit' },
  ] },
  // 26.10 night: the other new LipoSonix ad in Timișoara too, 25 lei a day ("Fără efort. Fără diete stricte.")
  { id: 'tm-lipo-new2-2026-10-26', why: 'cerut de voi pe 26.10', actions: [
    { campaignId: '120251505980700103', name: 'TM LIPO · fără diete', status: 'ACTIVE', why: 'TM: încă o reclamă LipoSonix, 25 lei/zi' },
    { campaignId: '120251505980700103', name: 'TM LIPO · fără diete', daily: 25, why: 'TM: încă o reclamă LipoSonix, 25 lei/zi' },
  ] },
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

// who hears about it: the admin account named George (as the guard; api/_lib/notify.js ownerIds)
const { ownerIds } = require('./notify');
const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t));
// a job's day is in its id; one still undone 3 days later is given up (its intent is stale by then), with a word
const dayOf = (j) => (String(j.id).match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
const expired = (j) => !!dayOf(j) && Date.now() - Date.parse(dayOf(j) + 'T00:00:00+02:00') > 3 * 864e5;
const short = (s) => String(s || '').replace(/^(TM|AR) /, '').slice(0, 40);
const same = (a, b) => Math.round(Number(a) * 100) === Math.round(Number(b) * 100);

async function run() {
  // a read that fails throws: nothing is applied and nothing overwritten this hour (a doc read as empty would apply
  // every job again, on an account that is already as the owners want it)
  const doc = Object.assign({ done: {}, log: [] }, (await readJSON(KEY, {})) || {});
  const todo = JOBS.filter((j) => !doc.done[j.id]);
  if (!todo.length) return { skipped: 'nothing' };
  // one run at a time: two clocks landing together (GitHub's late run and Vercel's cron) would apply a job twice
  if (doc.running && Date.now() - Date.parse(doc.running) < 5 * 60e3) return { skipped: 'running' };
  doc.running = new Date().toISOString();
  await writeJSON(KEY, doc, { quiet: true });
  const save = () => writeJSON(KEY, doc, { quiet: true });
  const out = [], problems = [];
  try {
    const conn = await loadConnection(readJSON);
    if (!conn.userToken || !conn.adAccountId) return { skipped: 'not_connected' };
    const ids = await ownerIds({ readJSON });
    // a word to the owner, each tag once a day (a refusal that lasts isn't repeated every hour)
    const tell = async (n) => {
      doc.told = doc.told || {};
      if (doc.told[n.tag] === day(Date.now())) return;
      doc.told[n.tag] = day(Date.now());
      await save();
      return notifyMany({ readJSON, writeJSON }, ids, Object.assign({ kind: 'alert', go: 'reclame' }, n)).catch((e) => console.error('ads-once tell:', e.message));
    };
    const logged = (j, a) => doc.log.some((e) => e.job === j.id && e.campaignId === a.campaignId && (e.status || 'budget') === (a.status || 'budget')); // a budget and a switch on the same campaign are two
    // a list of decided changes: a campaign switched on / off, or its budget (a number, or times a factor; 10 to 150 lei).
    // Every change is written down the moment Meta confirms it (a run cut short never repeats it); one already in
    // place is written down as such (not shown as a change); a refused one is told once, and tried again next hour
    for (const j of todo.filter((x) => x.actions)) {
      const failed = [];
      for (const a of j.actions) {
        if (logged(j, a)) continue;
        const base = { job: j.id, at: new Date().toISOString(), campaignId: a.campaignId, campaignName: a.name, why: a.why };
        if (a.status) {
          const r = await ads.act(conn, { action: 'status', id: a.campaignId, status: a.status });
          if (r.error) { failed.push(short(a.name) + ': ' + r.error); console.error('ads-once:', a.campaignId, r.error); continue; }
          await AC.switched(a.campaignId, a.status).catch(() => {});
          doc.log.push(Object.assign(base, { status: a.status }));
          out.push(a.campaignId);
        } else {
          const b = await ads.budgetOf(conn, a.campaignId);
          if (b.error) { failed.push(short(a.name) + ': ' + b.error); console.error('ads-once:', a.campaignId, b.error); continue; }
          const to = Math.max(10, Math.min(150, a.daily || Math.round(b.daily * a.factor)));
          if (same(b.daily, to)) { doc.log.push(Object.assign(base, { budgetId: b.id, from: b.daily, to, unchanged: true })); await save(); continue; }
          const r = await ads.act(conn, { action: 'budget', id: b.id, daily: to });
          if (r.error) { failed.push(short(a.name) + ': ' + r.error); console.error('ads-once:', a.campaignId, r.error); continue; }
          doc.log.push(Object.assign(base, { budgetId: b.id, from: b.daily, to }));
          out.push(a.campaignId);
        }
        await save();
      }
      if (!failed.length) {
        doc.done[j.id] = new Date().toISOString();
        await save();
        // one word when the whole list is done: what changed (a job that found everything already in place says nothing)
        const did = doc.log.filter((e) => e.job === j.id && !e.unchanged);
        if (did.length) await tell({ tone: 'good', tag: 'once-done-' + j.id, title: 'FĂCUT ✅ - ' + (j.why || 'ce ați cerut'),
          text: did.map((e) => short(e.campaignName) + ': ' + (e.status ? (e.status === 'ACTIVE' ? 'pornită' : 'oprită') : e.to + ' lei/zi')).join(' · ') });
      } else if (expired(j)) {
        doc.done[j.id] = new Date().toISOString();
        doc.log.push({ job: j.id, at: new Date().toISOString(), expired: true, why: failed.join(' · ') });
        await save();
        await tell({ tone: 'bad', tag: 'once-expired-' + j.id, title: 'NEFĂCUT ⚠️ - ' + (j.why || 'ce ați cerut'), text: 'Meta a refuzat 3 zile la rând, renunț: ' + failed.join(' · ') });
      } else {
        problems.push(...failed);
        await tell({ tone: 'bad', tag: 'once-fail-' + j.id, title: 'NU ÎNCĂ ⚠️ - ' + (j.why || 'ce ați cerut'), text: 'Meta a refuzat, mai încerc din oră în oră: ' + failed.join(' · ') });
      }
    }
    // a rule over the campaigns that spent this week (the running ones and those paused a moment ago): its budget times a
    // factor, up to a cap
    const rules = todo.filter((x) => !x.actions);
    if (rules.length) {
      const days = await ads.campaignDays(conn, { since: day(Date.now() - 6 * 864e5), until: day(Date.now()) });
      if (days.error) return { changed: out.length, error: days.error };
      const camps = new Map();
      days.rows.forEach((d) => { if (d.spend > 0) camps.set(d.campaignId, d.campaignName); });
      for (const j of rules) {
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
          doc.log.push({ job: j.id, at: new Date().toISOString(), campaignId: id, campaignName: name, budgetId: b.id, from: b.daily, to, why: j.why });
          await save();
          out.push(name + ' ' + b.daily + ' → ' + to);
          await tell({ tone: 'good', tag: 'once-' + j.id + '-' + id, title: 'BUGET MĂRIT 📈 - ' + String(name).slice(0, 50), text: b.daily + ' → ' + to + ' lei/zi. ' + j.why + '.' });
        }
        if (!failed || expired(j)) { doc.done[j.id] = new Date().toISOString(); await save(); } // a refused one is tried again on the next tick
      }
    }
    return { changed: out.length, failed: problems.length || undefined };
  } finally {
    doc.running = null;
    await save().catch((e) => console.error('ads-once save:', e.message));
    if (out.length) await AC.clear().catch(() => {});
  }
}

module.exports = { run, JOBS };
