// POST /api/portal-booking, admin: the settings of the site's online booking (Calendar → Online).
//   { action: 'get' }            → { settings, defaults, upcoming: { <city>: count of online bookings ahead } }
//   { action: 'save', settings } → { settings } (cleaned, api/_lib/booking.js clean)

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const B = require('./_lib/booking');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = await requireAdmin(req, res);
  if (!session) return;
  const b = req.body || {};
  try {
    if (b.action === 'save') {
      const settings = B.clean(b.settings);
      await writeJSON(B.KEY, Object.assign(settings, { updatedAt: new Date().toISOString(), updatedBy: session.employeeId || 'admin' }));
      res.status(200).json({ ok: true, settings: B.clean(settings) });
      return;
    }
    const [settings, appts] = await Promise.all([B.settings(), readJSON('data/appointments.json', [])]);
    const today = B.roNow().date;
    const upcoming = {};
    B.CITIES.forEach((c) => { upcoming[c] = appts.filter((a) => a.online && a.location === c && a.date >= today && a.status !== 'anulata').length; });
    res.status(200).json({ ok: true, settings, defaults: B.clean({}), upcoming });
  } catch (err) {
    console.error('portal-booking error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
