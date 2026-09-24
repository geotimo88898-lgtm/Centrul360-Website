// Vercel serverless function — builds a myPOS IPC (Instant Payment Checkout) "IPCPurchase"
// request for the 49 RON booking deposit and returns the fields the client must POST
// (as a hidden auto-submitting form) to myPOS's hosted checkout page. The client's card
// details never touch this server or the Centrul360 domain — they're entered on myPOS's
// own page, loaded inside an iframe by avans-programare.html.
//
// Required environment variables (set in Vercel → Project Settings → Environment Variables,
// never committed to the repo, never pasted into chat):
//   MYPOS_STORE_ID       — myPOS "SID" / Store ID
//   MYPOS_WALLET_NUMBER  — myPOS wallet / client number ("walletnumber" field)
//   MYPOS_PRIVATE_KEY    — the private key myPOS issued for signing requests (PEM format)
//   MYPOS_KEY_INDEX      — key index myPOS assigned to that key pair
//
// Field names, field order and the signature algorithm below are taken from myPOS's own
// official Node.js SDK source (`@mypos-ltd/mypos` on npm, github.com/developermypos/mypos-js),
// specifically resources/checkout/purchase.js and resources/abstract/checkout-api-request.js,
// not reimplemented from guesswork. We don't pull in the SDK itself (its dependency on the
// old `request` package and a bundled node-rsa are unnecessary — Node's built-in `crypto`
// reproduces the same PKCS#1-SHA256 signature), but the request shape matches it exactly.

const crypto = require('crypto');

const MYPOS_HOST = process.env.MYPOS_SANDBOX === '1'
  ? 'https://www.mypos.com/vmp/checkout-test'
  : 'https://www.mypos.com/vmp/checkout';

// Signs the fields the same way myPOS's official SDK does: join all values with "-",
// base64-encode that string, then RSA-SHA256-sign the base64 string's bytes (PKCS#1 v1.5
// padding, which is Node crypto's default for createSign('RSA-SHA256')), base64-encode
// the signature. Signature is always the last field added to the request.
function signFields(fields, privateKey) {
  const joined = Object.values(fields).join('-');
  const base64Payload = Buffer.from(joined, 'utf8').toString('base64');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(base64Payload, 'utf8');
  signer.end();
  return signer.sign(privateKey, 'base64');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { amount, currency, orderId } = req.body || {};

  if (amount !== 49 || currency !== 'RON' || !orderId) {
    // Deposit amount is fixed on purpose — this endpoint only ever charges the 49 RON
    // booking deposit, so a tampered client request can't ask for a different amount.
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  const storeId = process.env.MYPOS_STORE_ID;
  const walletNumber = process.env.MYPOS_WALLET_NUMBER;
  // Vercel's env var editor stores the value as a single line, so a PEM key pasted in
  // often ends up with literal "\n" characters instead of real line breaks — normalize
  // that back to real newlines or Node's crypto module can't parse the key.
  const privateKey = process.env.MYPOS_PRIVATE_KEY
    ? process.env.MYPOS_PRIVATE_KEY.replace(/\\n/g, '\n')
    : process.env.MYPOS_PRIVATE_KEY;
  const keyIndex = process.env.MYPOS_KEY_INDEX;

  if (!storeId || !walletNumber || !privateKey || !keyIndex) {
    console.error('mypos-checkout: missing MYPOS_* environment variables');
    res.status(500).json({ error: 'payment_not_configured' });
    return;
  }

  const site = `https://${req.headers.host}`;

  // Field order matches myPOS's IPCPurchase request exactly (see purchase.js in the SDK).
  // We skip the optional customer/cart/note fields — PaymentParametersRequired: 3 tells
  // myPOS not to require customer details for this flow.
  const fields = {
    IPCmethod: 'IPCPurchase',
    IPCVersion: '1.4',
    IPCLanguage: 'RO',
    SID: storeId,
    walletnumber: walletNumber,
    Amount: amount.toFixed(2),
    Currency: currency,
    OrderID: orderId,
    URL_OK: `${site}/avans-multumesc.html`,
    URL_Cancel: `${site}/avans-programare.html`,
    URL_Notify: `${site}/api/mypos-notify`,
    CardTokenRequest: 0,
    KeyIndex: keyIndex,
    PaymentParametersRequired: 3,
    PaymentMethod: 1,
  };

  try {
    fields.Signature = signFields(fields, privateKey);

    // myPOS's hosted checkout is a POST-only endpoint — the signature covers the exact
    // field set above, so the client must submit these fields as a form (not a GET
    // redirect). avans-programare.html builds a hidden form from this payload and
    // auto-submits it into an iframe.
    res.status(200).json({ formAction: MYPOS_HOST, fields });
  } catch (err) {
    console.error('mypos-checkout error:', err.message);
    res.status(500).json({ error: 'payment_init_failed' });
  }
};
