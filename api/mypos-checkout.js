// Vercel serverless function — creates a MyPOS IPC (Instant Payment Checkout) session
// for the 49 RON booking deposit and returns a hosted-checkout URL to embed in an iframe
// on avans-programare.html. The client's card details never touch this server or the
// Centrul360 domain's own code — they're entered inside MyPOS's own secured iframe.
//
// Required environment variables (set in Vercel → Project Settings → Environment Variables,
// never committed to the repo, never pasted into chat):
//   MYPOS_STORE_ID       — MyPOS "SID" / Store ID
//   MYPOS_WALLET_NUMBER  — MyPOS wallet number (if applicable to your account type)
//   MYPOS_PRIVATE_KEY    — the private key MyPOS issued for signing requests (PEM format)
//   MYPOS_KEY_INDEX      — key index MyPOS assigned to that key pair
//
// STATUS: the request-signing block below is a placeholder — MyPOS's exact field names,
// field order and signature algorithm need to be filled in from their official IPC
// integration guide (developers.mypos.com) before this goes live. Nothing here fabricates
// those details; everything MyPOS-specific is marked TODO and the function fails loudly
// (500, no silent fallback) until it's filled in, so a bad deploy can't quietly eat a
// real payment.

const crypto = require('crypto');

const MYPOS_ENDPOINT = process.env.MYPOS_SANDBOX === '1'
  ? 'https://sandbox-mypos.eu/vmp/checkout-api/purchase' // TODO: confirm exact sandbox endpoint against MyPOS docs
  : 'https://mypos.eu/vmp/checkout-api/purchase';          // TODO: confirm exact production endpoint against MyPOS docs

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
  const privateKey = process.env.MYPOS_PRIVATE_KEY;
  const keyIndex = process.env.MYPOS_KEY_INDEX;

  if (!storeId || !privateKey || !keyIndex) {
    console.error('mypos-checkout: missing MYPOS_* environment variables');
    res.status(500).json({ error: 'payment_not_configured' });
    return;
  }

  const site = `https://${req.headers.host}`;

  // TODO — replace with MyPOS's real IPC "Purchase" request fields, in the exact order
  // and naming their docs specify (commonly: IPCmethod, IPCVersion, IPCLanguage, SID,
  // walletnumber, Amount, Currency, OrderID, URL_OK, URL_Cancel, URL_Notify,
  // PaymentParametersRequired, CartItems[...], Signature — verify every name and the
  // signature's exact concatenation/order before enabling this in production).
  const fields = {
    SID: storeId,
    walletnumber: walletNumber,
    Amount: amount.toFixed(2),
    Currency: currency,
    OrderID: orderId,
    URL_OK: `${site}/avans-multumesc.html`,
    URL_Cancel: `${site}/avans-programare.html`,
    URL_Notify: `${site}/api/mypos-notify`, // TODO: implement this webhook once the field contract is confirmed
    KeyIndex: keyIndex,
  };

  // TODO — replace with MyPOS's documented signature algorithm once confirmed.
  // Placeholder shape only: sign the pipe-joined field values with the merchant's
  // RSA private key (SHA-256), base64-encode. Do not trust this concatenation order
  // until it matches the official docs exactly.
  function signFields(f) {
    const payload = Object.values(f).join('-');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(payload);
    signer.end();
    return signer.sign(privateKey, 'base64');
  }

  try {
    fields.Signature = signFields(fields);

    // TODO: confirm whether MyPOS IPC expects a redirect (302 to a hosted checkout URL
    // built from these fields) or a server-to-server call that returns a checkout URL/token
    // in JSON. Until confirmed, this throws instead of guessing.
    throw new Error('MyPOS IPC field names and signature not yet verified against official docs');

    // Once verified, this should end with something like:
    // res.status(200).json({ redirectUrl: builtMyPosCheckoutUrl });
  } catch (err) {
    console.error('mypos-checkout error:', err.message);
    res.status(500).json({ error: 'payment_init_failed' });
  }
};
