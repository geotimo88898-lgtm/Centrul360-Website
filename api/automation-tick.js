// GET /api/automation-tick — runs the automation steps that are due (reminders, waits …).
// Called by the Vercel cron in vercel.json (daily — the portal heartbeat covers the rest of the day)
// and can be pinged by any external scheduler. With CRON_SECRET set in Vercel, only requests that
// carry it (Vercel's own cron sends it automatically) are accepted.

const { tick } = require('./_lib/workflows');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== 'Bearer ' + secret) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const ran = await tick(true);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, ran });
};
