// /api/portal-leadfilter: Admin → „Lead filter” (the owner, 21.11): the leads of the lead-filter forms per zone, package
// and clinic, today and the last 7 days, how many got the message, wrote back and are booked (api/_lib/leadfilter.js).
// Admin only. POST { action: 'get' }.
const { requireAdmin } = require('./_lib/auth');
const LF = require('./_lib/leadfilter');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = await requireAdmin(req, res);
  if (!session) return;
  try {
    const k = await LF.kpi();
    const d = await LF.load();
    const zones = ((d.packages && d.packages.zones) || []).map((z) => ({ key: z.key, label: z.label }));
    const tiers = (d.packages && d.packages.tiers) || LF.TIERS;
    res.status(200).json(Object.assign({ ok: true, zones, tiers }, k));
  } catch (err) {
    console.error('portal-leadfilter:', err.message);
    res.status(500).json({ error: 'failed', message: 'Nu am putut citi lead filterul.' });
  }
};
