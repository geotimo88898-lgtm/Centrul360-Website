// /api/pay-notify: myPOS's server-to-server word about a payment made in the site's checkout (IPCPurchaseNotify; the URL is
// given with each payment by api/_lib/pay.js). The notification is believed only when its Signature checks out with myPOS's
// public certificate saved in Integrări → myPOS; then the order is paid (once, whatever the number of notifications).
// myPOS wants the exact body „OK” with HTTP 200, else it reverses the payment. So the answer is „OK”, except for two payments
// that must be given back: a sum that is not the order's (changed in the browser) and a second payment of a booking already
// paid by another order; those get „ERROR” and myPOS reverses them.
const P = require('./_lib/pay');
const IPC = require('./_lib/mypos-ipc');
const { readJSON, writeJSON } = require('./_lib/store');

const ok = (res) => { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.status(200).send('OK'); };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).send('method_not_allowed'); return; }
  // the fields in the order myPOS sent them (the signature covers them in that order)
  let pairs = [];
  if (req.rawBody && req.rawBody.length) pairs = IPC.pairsOfForm(req.rawBody);
  else if (typeof req.body === 'string') pairs = IPC.pairsOfForm(req.body);
  else if (req.body && typeof req.body === 'object') pairs = Object.entries(req.body).map(([k, v]) => [k, String(v)]);
  const f = Object.fromEntries(pairs);
  const method = String(f.IPCmethod || '');
  const orderId = P.baseOf(String(f.OrderID || '').slice(0, 80)); // the wallets pay under id + '-w' (api/_lib/pay.js)
  try {
    const c = await IPC.load({ readJSON, writeJSON });
    const signed = IPC.ready(c) && IPC.verifyPairs(pairs, c.myposCert);
    console.log('pay-notify:', method || '-', P.validId(orderId) ? orderId : '-', signed ? 'signed' : 'NOT signed');
    if (!P.validId(orderId)) { ok(res); return; } // not one of ours (an old deposit, a test of another tool): nothing to do
    if (!signed) {
      await IPC.note({ readJSON, writeJSON }, { lastNotify: { at: new Date().toISOString(), ok: false, why: 'signature', orderId } });
      ok(res); // never believed; the clock asks myPOS itself about the order (signed answer)
      return;
    }
    if (method === 'IPCPurchaseNotify') {
      const r = await P.markPaid(orderId, { amount: f.Amount, currency: f.Currency, ref: f.IPC_Trnref || f.RequestSTAN || '', method: f.PaymentMethod || '', at: f.RequestDateTime || '' }, 'notify');
      await IPC.note({ readJSON, writeJSON }, { lastNotify: { at: new Date().toISOString(), ok: !!r.ok, why: r.ok ? '' : r.mismatch ? 'amount' : r.double ? 'double' : r.unknown ? 'unknown' : 'state', orderId } });
      if (r.mismatch || r.double) { res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.status(200).send('ERROR'); return; }
    }
    ok(res);
  } catch (e) {
    console.error('pay-notify error:', e.message);
    ok(res); // a hiccup on our side never gives a good payment back; the clock settles the order with myPOS
  }
};
