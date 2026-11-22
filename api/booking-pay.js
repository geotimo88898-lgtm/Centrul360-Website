// /api/booking-pay: the desk and the site's bookings paid online (api/_lib/booking-pay.js)
//   GET or POST { action: 'list' }       the payments waiting in „De verificat” (two bookings or more of the same sum)
//   POST { action: 'pick', check, appt }  this payment is hers (the desk looked in myPOS who paid)
//   POST { action: 'scan' }               look in myPOS now (the clock does it every 5 minutes)
const P = require('./_lib/booking-pay');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = await require('./_lib/auth').requireRole(req, res, ['admin', 'manager', 'receptie']);
  if (!session) return;
  try {
    let b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (req.method === 'GET' || b.action === 'list') { res.status(200).json({ checks: (await P.openChecks()).map((c) => ({ id: c.id, amount: c.amount, at: c.at, cands: c.cands })) }); return; }
    if (b.action === 'pick') {
      const r = await P.pick(String(b.check || '').slice(0, 40), String(b.appt || '').slice(0, 80), session.employeeId || session.role);
      res.status(r.error ? 409 : 200).json(r);
      return;
    }
    if (b.action === 'scan') { res.status(200).json(await P.autoMatch(true)); return; }
    res.status(400).json({ error: 'bad_action' });
  } catch (err) {
    console.error('booking-pay', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
