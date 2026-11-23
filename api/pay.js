// /api/pay: the site's online payment, inside the page (c360-pay.js, myPOS's embedded form + Apple Pay / Google Pay).
// Public (our pages only), the price is always the server's (api/_lib/pay.js).
//   GET  ?status=1                                    → { on, live, sandbox, sid, walletNumber, keyIndex, bonusPct }
//   POST { action: 'create', kind, ref, city?, name?, phone?, page? }
//        kind: 'booking' (ref = the booking's id, made first by /api/booking with pay 'online-checkout'), 'offer' (ref = the
//        offer's key), 'treatment' (ref = the price list's id), 'card' (ref = the card's order, priced by the card module),
//        'test' (Integrări → myPOS → Test 1 leu)
//        → { ok, orderId, key, amount, full, bonusPct, title, sandbox, sessionToken, params } | { error }
//        'hold' (ref = the hour held by /api/booking { hold: true }: the booking is made once it is paid)
//   POST { action: 'contact', orderId, key, name, phone, consent }   the payment screen's name and phone, before paying
//   POST { action: 'link', orderId, key }   the Partners way: the order's myPOS payment request page → { url } (new tab)
//   POST { action: 'check', orderId, key }            myPOS is asked (signed answer) → { paid, status }
//   POST { action: 'clinic', orderId, key }           she pays at the clinic after all (a booking, nothing paid yet)
const P = require('./_lib/pay');
const capi = require('./_lib/meta-capi');

const ourOrigin = (o) => !o || /^https:\/\/([\w-]+\.)?centrul360\.com$/.test(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
const tries = new Map(); // ip → [times] (per warm instance)
const KINDS = ['hold', 'booking', 'offer', 'treatment', 'card', 'test'];

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!ourOrigin(String(req.headers.origin || ''))) { res.status(403).json({ error: 'forbidden' }); return; }
  try {
    if (req.method === 'GET') { res.status(200).json(await P.status()); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    let b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    const ip = String(req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || '').split(',')[0].trim() || 'x';
    const now = Date.now();
    const mine = (tries.get(ip) || []).filter((t) => now - t < 10 * 60e3);
    if (mine.length >= 40) { res.status(429).json({ error: 'too_many' }); return; }
    tries.set(ip, mine.concat(now));

    if (b.action === 'check') { res.status(200).json(await P.check(String(b.orderId || ''), String(b.key || ''))); return; }
    if (b.action === 'link') { const r = await P.link(String(b.orderId || ''), String(b.key || '')); res.status(r.error ? 400 : 200).json(r); return; }
    if (b.action === 'contact') { const r = await P.contact(String(b.orderId || ''), String(b.key || ''), b); res.status(r.error ? 400 : 200).json(r); return; }
    if (b.action === 'clinic') { const r = await P.toClinic(String(b.orderId || ''), String(b.key || '')); res.status(r.error ? 400 : 200).json(r); return; }
    if (b.action !== 'create') { res.status(400).json({ error: 'bad_action' }); return; }
    const kind = String(b.kind || '');
    if (!KINDS.includes(kind)) { res.status(400).json({ error: 'bad_kind' }); return; }
    const r = await P.createOrder({
      kind, ref: b.ref, input: { city: b.city, name: b.name, phone: b.phone, page: b.page },
      host: /^(www|admin)\.centrul360\.com$/.test(String(req.headers.host || '')) ? 'www.centrul360.com' : String(req.headers.host || 'www.centrul360.com'),
      track: kind === 'offer' || kind === 'treatment' ? capi.fromRequest(req, b.page) : null,
    });
    res.status(r.error ? (r.error === 'off' ? 409 : 400) : 200).json(r);
  } catch (err) {
    console.error('pay error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
