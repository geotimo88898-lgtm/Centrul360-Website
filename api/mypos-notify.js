// Vercel serverless function — receives myPOS's server-to-server "IPCPurchaseNotify" call
// after a payment attempt. myPOS retries this webhook until it gets back HTTP 200 with the
// exact body "OK", so this must always respond that way once the notification is received,
// whatever it contains.
//
// This does not yet verify the Signature myPOS sends on the notification (that needs myPOS's
// own public API key, which isn't among the MYPOS_* env vars set up so far — the payment
// itself is still confirmed to the customer via the URL_OK redirect to avans-multumesc.html).
// Add MYPOS_API_PUBLIC_KEY and verify here before relying on this webhook as the source of
// truth for marking a deposit paid.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('method_not_allowed');
    return;
  }

  console.log('mypos-notify: received notification', req.body);

  res.status(200).send('OK');
};
