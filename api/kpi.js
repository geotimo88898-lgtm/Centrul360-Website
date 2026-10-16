// GET /api/kpi?period=today|yesterday|7d|30d|month|max|custom[&since=YYYY-MM-DD&until=YYYY-MM-DD][&part=messages]
// Panou → KPI (admin only): every number of the clinic in one place, live. From 16.10.2026, 22:05 on (see _lib/kpi.js).
//
//   funnel     leads → contacted (and how fast) → booked → came → paid → upsell
//   bookings   the bookings made in the period: confirmed, cancelled, came / due (show rate), upcoming
//   visits     the visits of the period's days: came / due, upsells at the visit
//   money      the payments, ticket, upsells, from the ads vs organic
//   pace       today / yesterday / this month side by side
//   offers     each offer (and organic source) with its spend; ads: every ad, Meta's numbers + what its leads became,
//              flagged when doing very well / very badly
//   messages   each WhatsApp template sent: delivered, read, answered, booked after; the team's answer time
//   team, cities, trend (day by day), alerts (what stands out, facts only)
// part=messages: only the messages (Automatizări → Mesaje).

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
    const period = K.PERIODS.includes(q.period) ? q.period : '7d';
    const r = K.rangeOf(period, q);
    const [offers, leads, appointments, sales, clients, conversations, tdoc, employees, admin, conn] = await Promise.all([
      loadOffers(readJSON), readJSON('data/leads.json', []), readJSON('data/appointments.json', []), readJSON('data/sales.json', []),
      readJSON('data/clients.json', []), readJSON('data/whatsapp-conversations.json', []), readJSON('data/wa-templates.json', {}),
      readJSON('data/employees.json', []), readJSON('data/admin-profile.json', {}), loadConnection(readJSON),
    ]);
    const templates = (tdoc && tdoc.templates) || [];
    const M = K.model({ offers, leads, appointments, sales, clients, conversations });
    res.setHeader('Cache-Control', 'no-store');
    if (q.part === 'messages') { res.status(200).json({ period, range: r, start: new Date(K.cfg.start).toISOString(), messages: K.messagesOf(M, r, templates) }); return; }
    const names = new Map(employees.map((e) => [e.id, String(e.name || '').trim()]));
    names.set('admin', String(admin.name || '').trim() || 'Admin');
    const ads = await K.adsFor(conn, r);
    const rep = K.report(M, r, { offers, ads: ads.rows ? ads : null, templates, names });
    rep.period = period;
    rep.adsState = ads.none ? 'none' : ads.error ? 'error' : 'ok';
    rep.adsError = ads.error || '';
    res.status(200).json(rep);
  } catch (err) {
    console.error('kpi error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
