// Once (the owner, 15.11: „programul să fie spot on, ca să putem posta eficient și cu potențial de viralitate maxim,
// optimizat pentru toate cele 4 rețele”): the posting times, set from our own followers' data and how each network
// pushes new videos, then every planned post moves to them (posted ones stay). Later the admin's „Folosește orele
// recomandate” keeps learning from the real results.
//   Instagram's followers online (lead-health ?hours=1, 6 days, Bucharest time): rising all afternoon, 0.94-1.0 from 18:00
//   to 22:00, the peak at 21:00; a reel does best when it goes up 30-60 minutes before the peak, so its first likes come
//   as the most people open the app. Facebook: the same people, a little earlier in the evening. TikTok and YouTube
//   Shorts push to non-followers: the evening peak, plus the lunch break for the second daily slot.
// data/content-hours-once.json: { done, at, times, photoTime }

const { readJSON, writeJSON } = require('./store');
const C = require('./content');

const KEY = 'data/content-hours-once.json';
const TIMES = { ig: ['20:00'], fb: ['19:30'], tt: ['20:30', '13:00'], yt: ['18:30', '12:30'] };
const PHOTO = { ig: '18:30', fb: '18:00', tt: '16:30' };

async function run() {
  const st = await readJSON(KEY, {});
  if (st.done) return { skipped: true };
  const next = await C.saveSettings({ times: TIMES, photoTime: PHOTO });
  await require('./content-insights').replanAll(next);
  await writeJSON(KEY, { done: true, at: new Date().toISOString(), times: next.times, photoTime: next.photoTime });
  return { done: true };
}

module.exports = { run, KEY, TIMES, PHOTO };
