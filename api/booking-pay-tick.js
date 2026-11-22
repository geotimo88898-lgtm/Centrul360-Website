// GET /api/booking-pay-tick: the site's bookings paid online, paired with their myPOS payments every 5 minutes (cf/worker.js
// scheduled, on the minute clock; api/_lib/booking-pay.js autoMatch: nothing while no booking waits for its payment).
// Only the Worker's own clock (or CRON_SECRET) may start it.
const { isCron } = require('./_lib/cron-auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isCron(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    res.status(200).json(Object.assign({ ok: true }, await require('./_lib/booking-pay').autoMatch()));
  } catch (err) {
    console.error('booking-pay-tick', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
};
