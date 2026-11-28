// /api/portal-orders, Admin → Site → Comenzi și plăți (api/_lib/pay-orders.js): every order of the site's checkout, paid or
// not, with where it came from and what happened to it; the win-back message for one order, by hand. Admin only: everyone
// else gets 403 (the names and phones of the clients stay here).
//   GET  ?days=30                      the orders of those days (1 to 120), newest first, and their totals
//   GET  ?id=C360-…                    one order, all of it
//   POST { action: 'winback', id }     the win-back message to her phone for this order (api/_lib/pay-winback.js sendOne)
//   POST { action: 'check', id }       myPOS asked now; a payment it confirms is marked paid
const { requireRole } = require('./_lib/auth');
const O = require('./_lib/pay-orders');
const W = require('./_lib/pay-winback');
const P = require('./_lib/pay');

const SAY = {
  not_found: 'Comanda nu mai există.', already_paid: 'Comanda e deja plătită.', no_phone: 'Comanda nu are un telefon bun.',
  quiet_hours: 'Între 21:00 și 9:00 nu trimitem mesaje. Încearcă după 9:00.', sent_today: 'Telefonul ei a primit deja mesajul azi.',
  paid_other: 'A plătit între timp altă comandă.', partial: 'A plătit deja o parte online: sun-o pentru rest.', checking: 'Banii par intrați în myPOS pentru comanda ei: verifică întâi în myPOS.', mypos: 'myPOS nu a răspuns. Încearcă din nou.', send_failed: 'WhatsApp nu a trimis mesajul.',
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = await requireRole(req, res, ['admin']);
  if (!session) return;
  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      if (q.id) {
        if (!P.validId(String(q.id))) return res.status(400).json({ error: 'invalid_id' });
        const d = await O.detail(String(q.id));
        return res.status(d.error ? 404 : 200).json(d);
      }
      return res.status(200).json(await O.list({ days: q.days }));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const b = req.body || {};
    const id = String(b.id || '');
    if (!P.validId(id)) return res.status(400).json({ error: 'invalid_id' });
    if (b.action === 'winback') {
      const r = await W.sendOne(id, { by: 'admin:' + String(session.employeeId || '').slice(0, 30) });
      if (r.error) return res.status(r.error === 'not_found' ? 404 : 409).json({ error: r.error, message: SAY[r.error] || (/^template_/.test(r.error) ? 'Șablonul mesajului nu e aprobat acum (' + r.error.slice(9) + ').' : 'Nu s-a putut trimite.'), detail: r.detail });
      return res.status(200).json(r);
    }
    if (b.action === 'check') {
      const r = await O.check(id);
      if (r.error) return res.status(r.error === 'not_found' ? 404 : 502).json({ error: r.error, message: SAY[r.error] || 'myPOS nu a răspuns.', detail: r.detail });
      return res.status(200).json(r);
    }
    return res.status(400).json({ error: 'unknown_action' });
  } catch (e) {
    console.error('portal-orders:', e && e.message);
    return res.status(500).json({ error: 'server_error' });
  }
};
