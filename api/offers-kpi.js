// GET /api/offers-kpi?period=max|today|yesterday|7d|30d|month|custom[&since=YYYY-MM-DD&until=YYYY-MM-DD], Admin → Oferte:
// what each offer brought through the door (admin only).
//
// From 16.10.2026, 22:05 on (the owner's call; see _lib/kpi.js for what counts and who came from where). Two parts. From
// the ads: a lead from an ad's lead form counts for its offer, or "fără ofertă". Organic: every other lead by its source;
// the clients who paid without a lead ("direct") and those whose lead came before ("de dinainte"), by the day they paid.
// A lead's payments count for the period of the lead. Ad spend (Meta, every ad, the deleted ones too) goes to an offer by
// the leads each ad brought (split by their offers), else by its campaign's leads, else by the name.

const { readJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { loadConnection } = require('./_lib/facebook');
const { loadOffers } = require('./_lib/offers');
const K = require('./_lib/kpi');

module.exports = async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  try {
    const q = req.query || {};
    const period = K.PERIODS.includes(q.period) ? q.period : 'max';
    const r = K.rangeOf(period, q);
    const [offers, leads, appointments, sales, clients, conn] = await Promise.all([
      loadOffers(readJSON), readJSON('data/leads.json', []), readJSON('data/appointments.json', []), readJSON('data/sales.json', []),
      readJSON('data/clients.json', []), loadConnection(readJSON),
    ]);
    const M = K.model({ offers, leads, appointments, sales, clients });
    const ads = await K.adsFor(conn, r);
    const { rows, spend } = K.rowsOf(M, r, offers, ads.rows || null);
    const sum = (k, g) => Math.round(rows.filter((x) => !g || x.group === g).reduce((a, x) => a + (x[k] || 0), 0) * 100) / 100;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ period, range: r, start: new Date(K.cfg.start).toISOString(), rows,
      totals: { revenue: sum('revenue'), upsell: sum('upsell'), leads: sum('leads'), clients: sum('clients'), spend: sum('spend'), ads: sum('revenue', 'ads'), organic: sum('revenue', 'organic') },
      spend: { ready: spend.ready, error: ads.error || '', total: spend.total, unassigned: spend.unassigned } });
  } catch (err) {
    console.error('offers-kpi error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
