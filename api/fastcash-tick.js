// GET /api/fastcash-tick: the minute clock of „Transformarea 360” (cf/worker.js scheduled, cron "* * * * *"): a step that
// is due goes out in a small batch, the rest at the next minute; in between, the campaign's numbers are brought up to
// date (api/_lib/fc-campaign.js). Only the Worker's own clock (or CRON_SECRET) may start it. Does nothing while the
// campaign is off or paused.
const { isCron } = require('./_lib/cron-auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isCron(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    const r = await require('./_lib/fc-campaign').tick({ budgetMs: 40e3 });
    res.status(200).json(Object.assign({ ok: true }, r));
  } catch (err) {
    console.error('fastcash-tick', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
};
