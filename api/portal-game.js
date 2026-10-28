// /api/portal-game, Game Mode (admins only; see _lib/game.js for what the game is made of).
//   GET                                   the whole game, live from the clinic's data
//   POST { action: 'claim', id }          a mission done: its XP (checked again here, never trusted from the screen)
//   POST { action: 'seen', level?, stage?, intro?, goals?, badges?, season? }   the ceremonies already shown
//   GET ?img=<car>[-depth]                a garage render (public: a picture of a car)
//   GET ?render=1                         makes the next missing garage render (public, once per version, capped: _lib/game-renders.js)
// Nothing else: the rules are declared in _lib/game.js and nobody edits them (the owner plays, he doesn't set it up).

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { loadConnection } = require('./_lib/facebook');
const { loadOffers } = require('./_lib/offers');
const K = require('./_lib/kpi');
const TB = require('./_lib/timebank');
const G = require('./_lib/game');
const R = require('./_lib/game-renders');


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
  // Meta read for real: no error, and the day by day spend came back (an empty list next to ads that spent is a failed read)
  const adsOk = !!(ads && Array.isArray(ads.daily) && !ads.error && !ads.dailyError && !(ads.daily.length === 0 && (ads.rows || []).some((r) => r.spend > 0)));
  const out = G.build({ M, employees, sales, attendance, tbAll, appointments, adsDaily: adsOk ? ads.daily : [], adsOk, adsFrom: first, doc, now, photoOf });
  out.state.adsState = ads.none ? 'none' : adsOk ? 'ok' : 'error';
  return out;
}

module.exports = async (req, res) => {
  const q = req.query || {};
  if (req.method === 'GET' && q.img) {
    const buf = await R.image(String(q.img)).catch(() => null);
    if (!buf) { res.status(404).end(); return; }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200).send(buf);
    return;
  }
  if (req.method === 'GET' && q.render) {
    res.setHeader('Cache-Control', 'no-store');
    try { res.status(200).json(await R.step('https://' + req.headers.host)); } catch (e) { res.status(500).json({ error: e.message }); }
    return;
  }
  const session = await requireAdmin(req, res);
  if (!session) return;
  res.setHeader('Cache-Control', 'no-store');
  if (session.viewer) { res.status(403).json({ error: 'forbidden' }); return; }
  try {
    // the game's document is written quietly (no other screen reads it) and merged with the newest copy first
    const save = async (doc) => writeJSON(G.KEY, G.mergeDoc(await readJSON(G.KEY, null), doc), { quiet: true });
    if (req.method === 'GET') {
      const { state, doc, changed } = await compute();
      if (changed) await save(doc).catch((e) => console.error('game save:', e.message)); // a failed save never hides the game
      res.status(200).json(state);
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const b = req.body || {};
    const fail = (code, error) => res.status(code).json({ error });

    const doc = G.cleanDoc(await readJSON(G.KEY, null));
    if (b.action === 'claim') {
      const id = String(b.id || '');
      if (!/^[dw]:\d{4}-\d{2}-\d{2}:[a-z]{2,10}$/.test(id)) return fail(400, 'invalid_mission');
      if (doc.claims[id]) return fail(409, 'already_claimed');
      const { state } = await compute();
      const mis = state.missions.daily.concat(state.missions.weekly).find((x) => x.id === id);
      if (!mis) return fail(410, 'mission_gone');
      if (!mis.done) return fail(400, 'not_done');
      const fresh = G.cleanDoc(await readJSON(G.KEY, null)); // the newest copy: two phones claiming at once count once
      if (fresh.claims[id]) return fail(409, 'already_claimed');
      fresh.claims[id] = { at: new Date().toISOString(), xp: mis.xp };
      await save(fresh);
      res.status(200).json({ ok: true, xp: mis.xp });
      return;
    }
    if (b.action === 'seen') {
      // only forward, and only what exists: the ceremonies are never replayed or hidden by an old or a wrong value
      if (Number(b.level) > 0) doc.seen.level = Math.max(doc.seen.level || 0, Math.min(100, Math.trunc(Number(b.level))));
      if (Number.isInteger(b.stage) && b.stage >= 0 && b.stage <= 9) doc.seen.stage = Math.max(doc.seen.stage, b.stage);
      if (b.intro === true) doc.seen.intro = true;
      const known = { goals: new Set(G.GOALS.map((g) => g.id)), badges: new Set(G.BADGES.map((x) => x.id)) };
      const add = (key, list, ok) => { if (Array.isArray(list)) doc.seen[key] = [...new Set(doc.seen[key].concat(list.filter((x) => typeof x === 'string' && ok(x))))].slice(-1000); };
      add('goals', b.goals, (x) => known.goals.has(x)); add('badges', b.badges, (x) => known.badges.has(x));
      if (b.season) add('seasons', [b.season], (x) => /^\d{4}-Q[1-4]$/.test(x));
      await save(doc);
      res.status(200).json({ ok: true });
      return;
    }
    fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-game error:', err.message);
    res.status(500).json({ error: 'game_failed' });
  }
};
