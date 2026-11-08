// Vercel serverless function, receives myPOS's server-to-server "IPCPurchaseNotify" call
// after a payment attempt. myPOS retries this webhook until it gets back HTTP 200 with the
// exact body "OK", so this must always respond that way once the notification is received,
// whatever it contains.
//
// This does not yet verify the Signature myPOS sends on the notification (that needs myPOS's
// own public API key, which isn't among the MYPOS_* env vars set up so far, the payment
// itself is still confirmed to the customer via the URL_OK redirect to avans-multumesc.html).
// Add MYPOS_API_PUBLIC_KEY and verify here before relying on this webhook as the source of
// truth for marking a deposit paid.

// A deposit paid on the site rings the owner (the owner, 8.11: „avans plătit”, bell and phone). Until myPOS's public key
// is here the line says it is to be checked in myPOS (the notification isn't verified yet); each order rings once.
const { readJSON, writeJSON } = require('./_lib/store');
const N = require('./_lib/notify');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('method_not_allowed');
    return;
  }

  const b = req.body && typeof req.body === 'object' ? req.body : {};
  console.log('mypos-notify:', b.IPCmethod || '-', b.OrderID || '-');
  if (b.IPCmethod === 'IPCPurchaseNotify' && Number(b.Amount) > 0) {
    try {
      const store = { readJSON, writeJSON };
      const order = String(b.OrderID || '').slice(0, 60);
      await N.notifyMany(store, await N.adminIds(store), {
        kind: 'money', tone: 'good', go: 'incasari', tag: 'avans-' + order,
        title: 'AVANS ONLINE 💳 - ' + N.leiTxt(Number(b.Amount)), text: 'plătit pe site' + (order ? ', comanda ' + order : '') + ' · de verificat în myPOS',
      });
    } catch (e) { console.error('mypos-notify ring:', e.message); } // myPOS must get its OK whatever happens
  }

  res.status(200).send('OK');
};
