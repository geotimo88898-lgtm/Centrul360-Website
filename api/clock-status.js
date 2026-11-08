// /api/clock-status, public: when the automations' clock (api/automation-tick.js) last ran, how long it took, what waited.
// Only times and step names, nothing about clients; so anyone checking can see the hourly clock is alive.
const { readJSON } = require('./_lib/store');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const last = await readJSON('data/clock-last.json', null).catch(() => null);
  const age = last && last.at ? Math.round((Date.now() - Date.parse(last.at)) / 60000) : null;
  // the new texts of the Arad ads (8.11): per ad, in or not (names and counts only)
  const texts = await require('./_lib/ads-text-once').summary().catch(() => null);
  res.status(200).json({ ok: true, last, minutesAgo: age, healthy: age != null && age <= 75, texts });
};
