// GET /api/content-post-tick: the organic reels and carousels that are due go out within 5 minutes of their time, not at
// the next hourly clock (21.11: a 19:30 slot used to leave at 20:17). Every 5 minutes from the Worker's own clock (cf/worker.js
// scheduled); each post is claimed with its own lock (api/_lib/content-post.js), so the hourly run and this one never post
// the same thing twice. Only the Worker's clock (or CRON_SECRET) may start it.
const { isCron } = require('./_lib/cron-auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isCron(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    const r = await require('./_lib/content-post').run({ budgetMs: 40e3 });
    res.status(200).json(Object.assign({ ok: true }, r));
  } catch (err) {
    console.error('content-post-tick', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
};
