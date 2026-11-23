// GET /api/booking-pay-tick: the site's bookings paid online (and the checkout's open orders, api/_lib/pay.js sweep), paired with their myPOS payments every 5 minutes (cf/worker.js
// scheduled, on the minute clock; api/_lib/booking-pay.js autoMatch: nothing while no booking waits for its payment).
// Only the Worker's own clock (or CRON_SECRET) may start it.
const { isCron } = require('./_lib/cron-auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isCron(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    // and the site's checkout: the orders still open are asked about at myPOS (a lost notification still ends paid)
    const sweep = await require('./_lib/pay').sweep().catch((e) => ({ error: e.message }));
    res.status(200).json(Object.assign({ ok: true }, await require('./_lib/booking-pay').autoMatch(), { checkout: sweep }));
  } catch (err) {
    console.error('booking-pay-tick', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
};
