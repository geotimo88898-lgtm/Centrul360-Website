// POST /api/card-notify: myPOS tells us a Card de Sărbători was paid in the card form of our checkout (the Embedded SDK,
// urlNotify; api/_lib/card-sarbatori.js). myPOS wants HTTP 200 with exactly "OK" whatever it sent; the order is marked
// paid only when the notification is a purchase, its signature holds (when MYPOS_PUBLIC_CERT is set), the order exists
// and the sum and the currency are the order's own. Only the order id and the answer go to the log.

const C = require('./_lib/card-sarbatori');

// the posted fields in the order myPOS sent them (the signature is made over that order)
function pairsOf(req) {
  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (req.rawBody && req.rawBody.length) raw = Buffer.from(req.rawBody).toString('utf8');
  if (raw && !/^\s*[{[]/.test(raw)) return [...new URLSearchParams(raw)];
  if (raw) { try { return Object.entries(JSON.parse(raw)).map(([k, v]) => [k, String(v)]); } catch (e) { return []; } }
  return req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? Object.entries(req.body).map(([k, v]) => [k, String(v)]) : [];
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('method_not_allowed'); return; }
  try {
    const pairs = pairsOf(req);
    const r = await C.notified(pairs);
    console.log('card-notify:', (pairs.find((p) => p[0] === 'OrderID') || [])[1] || '-', JSON.stringify(r));
  } catch (e) { console.error('card-notify:', e.message); } // myPOS gets its OK whatever happens here
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.status(200).send('OK');
};
