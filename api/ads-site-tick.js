// GET /api/ads-site-tick: every 5 minutes (cf/worker.js scheduled, minute clock), only while a site ads job of
// api/_lib/ads-once.js is not finished (26.11 ~01:00: the Black Friday site campaigns, 24 ads with 2 pictures each, were made one
// ad per hourly run, so Arad would have started the next afternoon). Nothing to make: it returns at once. Only the Worker's
// own clock (or CRON_SECRET) may start it.
const { isCron } = require('./_lib/cron-auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isCron(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    const AO = require('./_lib/ads-once');
    const sum = await AO.siteSummary();
    const pending = Object.keys(sum).filter((id) => !sum[id].done);
    if (!pending.length) { res.status(200).json({ ok: true, pending: 0 }); return; }
    const out = await AO.run();
    res.status(200).json({ ok: true, pending: pending.length, out });
  } catch (err) {
    console.error('ads-site-tick', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
};
