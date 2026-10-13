// Connecting a clinic WhatsApp number in one go, after the Facebook login (Integrări → WhatsApp →
// "Conectează"): the portal does what HighLevel does behind its button.
//   1. Meta knows where to send the clients' messages: our app's webhook for WhatsApp accounts,
//      set through the API (no step in the Meta dashboard), checked with a verify token kept here.
//   2. Our app listens to the number's WhatsApp Business account (subscribed_apps).
//   3. The number answers on the Cloud API: registered once (with a 6-digit PIN kept here) when it
//      isn't yet; a number already live (e.g. still used by HighLevel) is left exactly as it is.
// Every step says what went wrong in plain words, nothing half-done is saved as "connected".

const crypto = require('crypto');
const WA = require('./whatsapp');
const { appCreds } = require('./facebook');

async function call(method, path, token, params) {
  const p = new URLSearchParams(Object.assign({ access_token: token }, params || {}));
  const r = method === 'GET'
    ? await fetch(WA.GRAPH + path + '?' + p)
    : await fetch(WA.GRAPH + path, { method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p.toString() });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !(j && j.error), j, error: !r.ok || (j && j.error) ? (((j && j.error) || {}).message || 'eroare ' + r.status) : '' };
}

// the verify token Meta sends back when it checks our webhook (made once, kept with the numbers)
async function verifyToken(store) {
  const c = (await store.readJSON(WA.CONFIG_KEY, null)) || {};
  if (c.verifyToken) return c.verifyToken;
  c.verifyToken = crypto.randomBytes(18).toString('hex');
  await store.writeJSON(WA.CONFIG_KEY, c);
  WA.invalidate();
  return c.verifyToken;
}

// 1. our app's webhook for WhatsApp accounts points at this portal (Meta checks it right away)
async function ensureWebhook(store, origin) {
  const creds = await appCreds(store.readJSON);
  if (!creds.appId || !creds.appSecret) return { error: 'Lipsește aplicația Meta: conectează întâi Facebook (Integrări).' };
  const appToken = creds.appId + '|' + creds.appSecret;
  const callback = origin + '/api/webhook-whatsapp';
  const cur = await call('GET', '/' + creds.appId + '/subscriptions', appToken);
  const set = cur.ok && (cur.j.data || []).some((s) => s.object === 'whatsapp_business_account' && s.callback_url === callback && s.active !== false &&
    (s.fields || []).some((f) => (f.name || f) === 'messages'));
  if (set) return { ok: true };
  const r = await call('POST', '/' + creds.appId + '/subscriptions', appToken, {
    object: 'whatsapp_business_account', callback_url: callback, verify_token: await verifyToken(store),
    fields: 'messages,message_template_status_update', include_values: 'true',
  });
  return r.ok ? { ok: true } : { error: 'Meta nu a acceptat adresa pentru mesajele primite: ' + r.error };
}

// 2 + 3. our app listens to the number's account; the number is live on the Cloud API
async function setupNumber({ token, wabaId, phoneId, pin }) {
  const s = await call('POST', '/' + wabaId + '/subscribed_apps', token);
  if (!s.ok) return { error: 'Meta nu ne-a lăsat să ascultăm contul WhatsApp: ' + s.error };
  const p = await call('GET', '/' + phoneId, token, { fields: 'display_phone_number,verified_name,status,platform_type,code_verification_status' });
  if (!p.ok) return { error: 'Meta: ' + p.error };
  const live = p.j.platform_type === 'CLOUD_API' || p.j.status === 'CONNECTED';
  let usedPin = '';
  if (!live) {
    usedPin = /^\d{6}$/.test(String(pin || '')) ? String(pin) : String(crypto.randomInt(100000, 1000000));
    const r = await call('POST', '/' + phoneId + '/register', token, { messaging_product: 'whatsapp', pin: usedPin });
    if (!r.ok) {
      // the number already has a two-step PIN (set in WhatsApp Manager or by another app): we need it
      if (/pin|two.?step/i.test(r.error)) return { needsPin: true, error: 'Numărul are deja un PIN de verificare în doi pași. Scrie-l ca să-l pornim.' };
      return { error: 'Meta nu a pornit numărul: ' + r.error };
    }
  }
  return { ok: true, display: p.j.display_phone_number || '', name: p.j.verified_name || '', pin: usedPin };
}

module.exports = { call, verifyToken, ensureWebhook, setupNumber };
