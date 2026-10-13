// WhatsApp sending through Meta's WhatsApp Cloud API, the one place that talks to Meta for messages.
//
// Two numbers, one per clinic: Timișoara and Arad. Each is connected in Integrări → WhatsApp
// ("Conectează numărul Timișoara / Arad") and kept in data/whatsapp-config.json:
//   { token, numbers: { 'Timișoara': { phoneId, display, name, wabaId, token?, connectedAt }, 'Arad': {…} } }
// The token (a System User token with whatsapp_business_messaging + whatsapp_business_management)
// is shared unless a number brought its own (a number in another WhatsApp Business account).
// Vercel variables still work as a fallback: WHATSAPP_TOKEN, WHATSAPP_WABA_ID,
// WHATSAPP_PHONE_ID_TIMISOARA / WHATSAPP_PHONE_ID_ARAD (and the old single WHATSAPP_PHONE_ID).
//
// Meta's rule: the clinic writes first only with an approved template (Integrări → Șabloane
// WhatsApp); free text only as a reply within 24 h of the client's last message (Mesaje).

const { readJSON } = require('./store');

const GRAPH = 'https://graph.facebook.com/v21.0';
const CONFIG_KEY = 'data/whatsapp-config.json';
const CITIES = ['Timișoara', 'Arad'];

let cache = null, cacheAt = 0;
function invalidate() { cache = null; }
// the two numbers as they are now (stored settings, then the Vercel variables)
async function loadConfig(force) {
  if (!force && cache && Date.now() - cacheAt < 20000) return cache;
  const c = (await readJSON(CONFIG_KEY, null)) || {};
  const env = process.env;
  const shared = c.token || env.WHATSAPP_TOKEN || '';
  const numbers = {};
  CITIES.forEach((city) => {
    const n = (c.numbers || {})[city] || {};
    const envId = city === 'Timișoara' ? env.WHATSAPP_PHONE_ID_TIMISOARA || env.WHATSAPP_PHONE_ID : env.WHATSAPP_PHONE_ID_ARAD;
    numbers[city] = {
      phoneId: n.phoneId || envId || '', display: n.display || '', name: n.name || '',
      wabaId: n.wabaId || env.WHATSAPP_WABA_ID || '', token: n.token || shared, ownToken: !!n.token, connectedAt: n.connectedAt || '',
    };
  });
  cache = { numbers, token: shared, tokenSaved: !!c.token };
  cacheAt = Date.now();
  return cache;
}
// the numbers that can send now
const readyNumbers = (cfg) => CITIES.filter((c) => cfg.numbers[c].phoneId && cfg.numbers[c].token);
async function whatsappReady() { return readyNumbers(await loadConfig()).length > 0; }
// kept for older callers: true when Vercel's variables alone make it work
function whatsappConfigured() { return !!(process.env.WHATSAPP_TOKEN && (process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_ID_TIMISOARA || process.env.WHATSAPP_PHONE_ID_ARAD)); }
// which clinic owns the number a message came in on (Meta's metadata.phone_number_id)
async function cityForPhoneId(phoneId) {
  if (!phoneId) return '';
  const cfg = await loadConfig();
  return CITIES.find((c) => cfg.numbers[c].phoneId === String(phoneId)) || '';
}

// Romanian numbers as Meta wants them: country code, digits only (0722 123 456 → 40722123456).
function toE164(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = '40' + d.slice(1);
  if (d.length === 9 && d.startsWith('7')) d = '40' + d;
  return d.length >= 10 ? d : '';
}

// from: 'Timișoara' | 'Arad' (the number it leaves from); when that one isn't connected, the other
// connected number sends it and the answer says so (fromCity).
async function sendWhatsApp({ phone, text, template, params, language, from }) {
  const cfg = await loadConfig();
  const ready = readyNumbers(cfg);
  if (!ready.length) return { sent: false, error: 'not_configured' };
  const city = ready.includes(from) ? from : ready[0];
  const n = cfg.numbers[city];
  const to = toE164(phone);
  if (!to) return { sent: false, error: 'telefon invalid', fromCity: city };
  const body = template
    ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: template, language: { code: language || 'ro' },
        components: params && params.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p).slice(0, 1000) })) }] : [] } }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: String(text || '').slice(0, 4000) } };
  try {
    const r = await fetch(`${GRAPH}/${encodeURIComponent(n.phoneId)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${n.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const code = j && j.error && j.error.code;
      // 131047 = outside the 24 h window (needs a template); 132001 = template missing / not approved.
      const why = code === 131047 ? 'în afara ferestrei de 24h, e nevoie de șablon' : code === 132001 ? 'șablonul nu există / nu e aprobat' : 'cod ' + (code || r.status);
      return { sent: false, error: why, fromCity: city };
    }
    return { sent: true, id: j.messages && j.messages[0] && j.messages[0].id, fromCity: city };
  } catch (err) {
    return { sent: false, error: 'rețea', fromCity: city };
  }
}

module.exports = { CITIES, CONFIG_KEY, GRAPH, loadConfig, invalidate, readyNumbers, whatsappReady, whatsappConfigured, cityForPhoneId, sendWhatsApp, toE164 };
