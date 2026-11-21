// GET /api/card-tick: the Card de Sărbători's payments not finished, every 5 minutes (cf/worker.js scheduled, on the minute
// clock): the recovery WhatsApp messages that are due (api/_lib/card-sarbatori.js recover; nothing when no online order
// waits). Only the Worker's own clock (or CRON_SECRET) may start it. The hourly clock does it too when this one is idle.
const { isCron } = require('./_lib/cron-auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isCron(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    res.status(200).json(Object.assign({ ok: true }, await require('./_lib/card-sarbatori').recover()));
  } catch (err) {
    console.error('card-tick', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
};
