// GET /api/content-story-tick: the minute clock of the stories (cf/worker.js scheduled, cron "* * * * *"): what is due
// goes out, a sequence in one go, and every 5 minutes the guard keeps a live story on Instagram and Facebook
// (api/_lib/content-story.js). Only the Worker's own clock (or CRON_SECRET) may start it.
const { isCron } = require('./_lib/cron-auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isCron(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    const r = await require('./_lib/content-story').tick({ budgetMs: 40e3 });
    res.status(200).json(Object.assign({ ok: true }, r));
  } catch (err) {
    console.error('content-story-tick', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
};
