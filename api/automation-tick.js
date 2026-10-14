// GET /api/automation-tick, runs the automation steps that are due (reminders, waits …).
// Called by the Vercel cron in vercel.json (daily, the portal heartbeat covers the rest of the day)
// and can be pinged by any external scheduler. With CRON_SECRET set in Vercel, only requests that
// carry it (Vercel's own cron sends it automatically) are accepted.

const { tick } = require('./_lib/workflows');
const { pollLeads } = require('./_lib/fb-leads');
const { readJSON, writeJSON } = require('./_lib/store');
const mypos = require('./_lib/mypos');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== 'Bearer ' + secret) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const leads = await pollLeads(true); // new Facebook leads first, so their automations run now too
  const ran = await tick(true);
  // myPOS: the POS payments of the last days (the live ones come by webhook; this catches what it missed)
  const pos = await mypos.sync({ readJSON, writeJSON }, {}).catch((e) => ({ ok: false, error: e.message }));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, ran, leads, pos: pos && pos.ok ? pos.added : pos && pos.error });
};
