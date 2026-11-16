// Once (George, 16.11: Nuki helps everyone find their way in the portal): after the publish, the clock runs the portal
// questions per role through the real chat once (api/portal-nuki.js pingGuide, the same as /api/lead-health?nuki=guide)
// and keeps the score: per role how many answers sent to the right place, and the questions that did not (the question,
// the place expected, the place given; no answer text, nothing about clients). Shown by the public clock status.
const { readJSON, writeJSON } = require('./store');

const KEY = 'data/nuki-guide-once.json';
const RUN = '2026-11-16-a'; // a new value here runs it once more after a publish

async function run() {
  const st = (await readJSON(KEY, null)) || {};
  if (st.run === RUN && st.done) return { done: true, score: st.result && st.result.score };
  if (st.run === RUN && (st.tries || 0) >= 3) return { done: false, gaveUp: true };
  if (!process.env.ANTHROPIC_API_KEY) return { skipped: 'no_key' };
  await writeJSON(KEY, { run: RUN, tries: (st.run === RUN ? st.tries || 0 : 0) + 1, startedAt: new Date().toISOString() }, { quiet: true });
  const r = await require('../portal-nuki').pingGuide({});
  const done = !!(r && r.score);
  await writeJSON(KEY, { run: RUN, done, tries: (st.run === RUN ? st.tries || 0 : 0) + 1, at: new Date().toISOString(), result: r }, { quiet: true });
  return { done, score: r && r.score };
}
async function summary() {
  const st = await readJSON(KEY, null);
  if (!st) return null;
  const r = st.result || {};
  return { run: st.run, done: !!st.done, at: st.at || st.startedAt, score: r.score, ms: r.ms, searches: r.searches, roles: r.roles };
}
module.exports = { run, summary };
