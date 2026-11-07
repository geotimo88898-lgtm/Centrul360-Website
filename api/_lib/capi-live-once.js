// Once (the owner in his main session, 7.11: „da porneste capii live”): the Conversions API switch „Trimite live” on,
// on the site's pixel (the default 2276074362800484 unless another one was saved), the same as the switch in
// Admin → Integrări. Nothing else changes. Run by the automations' clock and the portal's pulse; the result is kept in
// data/capi-live-once.json and the mode shows in GET /api/portal-capi?public=1.

const { readJSON, writeJSON } = require('./store');
const C = require('./meta-capi');

const KEY = 'data/capi-live-once.json';

async function run() {
  const st = await readJSON(KEY, {});
  if (st.done) return { skipped: true };
  const doc = (await readJSON(C.CFG_KEY, {})) || {};
  const before = C.modeOf(C.cleanConfig(doc));
  if (!doc.live) Object.assign(doc, { live: true, liveAt: new Date().toISOString(), liveBy: 'owner (chat, 7.11)' });
  await writeJSON(C.CFG_KEY, doc);
  const cfg = C.cleanConfig(await readJSON(C.CFG_KEY, {}));
  const after = C.modeOf(cfg);
  await writeJSON(KEY, { done: true, at: new Date().toISOString(), before, after, pixelId: cfg.pixelId, testCode: !!cfg.testCode });
  return { done: true, mode: after };
}

module.exports = { run, KEY };
