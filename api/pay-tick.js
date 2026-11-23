// GET /api/pay-tick: every minute (cf/worker.js scheduled, minute clock): the site's checkout orders of the last 2 hours
// whose myPOS page was made are asked at myPOS (api/_lib/pay.js sweep fresh), so a payment is marked within a minute
// (myPOS's payment request page has no return link and no notification). Nothing to ask: nothing is called.
// Only the Worker's own clock (or CRON_SECRET) may start it.
const { isCron } = require('./_lib/cron-auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isCron(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    res.status(200).json(Object.assign({ ok: true }, await require('./_lib/pay').sweep({ fresh: true })));
  } catch (err) {
    console.error('pay-tick', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
};
