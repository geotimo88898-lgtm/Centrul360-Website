// /api/portal-game, Game Mode (admins only; see _lib/game.js for what the game is made of).
//   GET                                   the whole game, live from the clinic's data
//   POST { action: 'claim', id }          a mission done: its XP (checked again here, never trusted from the screen)
//   POST { action: 'seen', level?, goals?, trophies?, season? }   the ceremonies already shown
//   POST { action: 'goals', goals: [...] }                         the garage, as the owner wrote it
//   POST { action: 'settings', costs?, expandAt?, next?, seasonTarget? }
//   POST { action: 'goal_image', dataUrl }  a photo of his own for a goal (JPEG, up to 700 KB): its path

const crypto = require('crypto');
const { readJSON, writeJSON, writeBinary } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { loadConnection } = require('./_lib/facebook');
const { loadOffers } = require('./_lib/offers');
const K = require('./_lib/kpi');
const TB = require('./_lib/timebank');
const G = require('./_lib/game');

const MAX_PHOTO = 700 * 1024;

async function compute(now) {
  const [offers, leads, appointments, sales, clients, conversations, employees, attendance, tbAll, conn, doc] = await Promise.all([
    loadOffers(readJSON), readJSON('data/leads.json', []), readJSON('data/appointments.json', []), readJSON('data/sales.json', []),
    readJSON('data/clients.json', []), readJSON('data/whatsapp-conversations.json', []), readJSON('data/employees.json', []),
    readJSON('data/attendance.json', []), TB.loadAll(readJSON), loadConnection(readJSON), readJSON(G.KEY, null),
  ]);
  const M = K.model({ offers, leads, appointments, sales, clients, conversations, now });
  // Meta's spend, day by day (shared cache with the KPI page; the game never waits more than a few seconds for it)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(now || Date.now()));
  const first = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(Math.max(K.cfg.start, (now || Date.now()) - 110 * 864e5)));
  let ads = { none: true };
  try { ads = await Promise.race([K.adsFor(conn, { since: first, until: today }), new Promise((r) => setTimeout(() => r({ error: 'timeout' }), 8000))]); } catch (e) { ads = { error: e.message }; }
  const { photoUrl } = require('./portal-account');
  const photoOf = (e) => (e && e.photo ? photoUrl(Object.assign({ id: e.id }, e.photo)) : '');
  const out = G.build({ M, employees, sales, attendance, tbAll, appointments, adsDaily: ads && ads.daily ? ads.daily : [], adsOk: !!(ads && ads.daily && !ads.error), doc, now, photoOf });
  out.state.adsState = ads.none ? 'none' : ads.error ? 'error' : 'ok';
  return out;
}

module.exports = async (req, res) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  res.setHeader('Cache-Control', 'no-store');
  if (session.viewer) { res.status(403).json({ error: 'forbidden' }); return; }
  try {
    if (req.method === 'GET') {
      const { state, doc, changed } = await compute();
      if (changed) await writeJSON(G.KEY, doc);
      res.status(200).json(state);
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const b = req.body || {};
    const fail = (code, error) => res.status(code).json({ error });

    if (b.action === 'goal_image') {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dataUrl || ''));
      const buf = m ? Buffer.from(m[1], 'base64') : null;
      if (!buf || !buf.length || buf.length > MAX_PHOTO) return fail(400, 'invalid_file');
      const path = 'game/' + crypto.randomUUID() + '.jpg';
      await writeBinary(path, buf, 'image/jpeg');
      res.status(200).json({ ok: true, img: path });
      return;
    }

    const doc = G.cleanDoc(await readJSON(G.KEY, null));
    if (b.action === 'claim') {
      const id = String(b.id || '');
      if (!/^[dw]:\d{4}-\d{2}-\d{2}:[a-z]{2,10}$/.test(id)) return fail(400, 'invalid_mission');
      if (doc.claims[id]) return fail(409, 'already_claimed');
      const { state } = await compute();
      const mis = state.missions.daily.concat(state.missions.weekly).find((x) => x.id === id);
      if (!mis) return fail(404, 'mission_gone');
      if (!mis.done) return fail(400, 'not_done');
      const fresh = G.cleanDoc(await readJSON(G.KEY, null)); // the newest copy: two phones claiming at once count once
      if (fresh.claims[id]) return fail(409, 'already_claimed');
      fresh.claims[id] = { at: new Date().toISOString(), xp: mis.xp };
      await writeJSON(G.KEY, fresh);
      res.status(200).json({ ok: true, xp: mis.xp });
      return;
    }
    if (b.action === 'seen') {
      if (Number(b.level) > 0) doc.seen.level = Math.round(Number(b.level));
      const add = (key, list) => { if (Array.isArray(list)) doc.seen[key] = [...new Set(doc.seen[key].concat(list.map(String).filter((x) => /^[\w-]{1,40}$/.test(x))))].slice(-500); };
      add('goals', b.goals); add('trophies', b.trophies);
      if (b.season) add('seasons', [String(b.season)]);
      await writeJSON(G.KEY, doc);
      res.status(200).json({ ok: true });
      return;
    }
    if (b.action === 'goals') {
      const goals = G.cleanGoals(b.goals);
      if (!goals) return fail(400, 'invalid_goals');
      doc.goals = goals;
      // a goal taken out (or rebuilt) unlocks again from scratch
      Object.keys(doc.unlocked).forEach((id) => { if (!goals.some((g) => g.id === id)) delete doc.unlocked[id]; });
      await writeJSON(G.KEY, doc);
      res.status(200).json({ ok: true, goals });
      return;
    }
    if (b.action === 'settings') {
      doc.settings = G.cleanSettings(b, doc.settings);
      if (b.seasonTarget != null) {
        const t = Math.round(Number(b.seasonTarget));
        const q = G.quarterOf(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date())).id;
        if (t >= 1000 && t <= 1e9) doc.seasons[q] = Object.assign({}, doc.seasons[q] || {}, { target: t, manual: true, defeatedAt: null });
      }
      await writeJSON(G.KEY, doc);
      res.status(200).json({ ok: true });
      return;
    }
    fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-game error:', err.message);
    res.status(500).json({ error: 'game_failed' });
  }
};
