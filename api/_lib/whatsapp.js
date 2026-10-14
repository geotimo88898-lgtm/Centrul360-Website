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
// A number can also be connected from the WhatsApp Business app on the clinic's phone ("coexistence",
// Embedded Signup): it keeps working in the app, its chats come over, and what reception writes from
// the phone comes back here as an echo. That needs the WhatsApp app's own ID, secret and the Facebook
// Login for Business configuration, kept in the same file as `app: { appId, appSecret, configId }`
// (or WHATSAPP_APP_ID / WHATSAPP_APP_SECRET / WHATSAPP_ES_CONFIG_ID in Vercel).
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
    // "Deconectează" keeps the city off, even while Vercel still has a number for it
    const envId = n.off ? '' : city === 'Timișoara' ? env.WHATSAPP_PHONE_ID_TIMISOARA || env.WHATSAPP_PHONE_ID : env.WHATSAPP_PHONE_ID_ARAD;
    numbers[city] = {
      phoneId: n.phoneId || envId || '', display: n.display || '', name: n.name || '',
      wabaId: n.wabaId || (n.off ? '' : env.WHATSAPP_WABA_ID) || '', token: n.token || shared, ownToken: !!n.token, connectedAt: n.connectedAt || '',
      coex: !!n.coex,
    };
  });
  const a = c.app || {};
  const app = { appId: a.appId || env.WHATSAPP_APP_ID || '', appSecret: a.appSecret || env.WHATSAPP_APP_SECRET || '', configId: a.configId || env.WHATSAPP_ES_CONFIG_ID || '' };
  cache = { numbers, token: shared, tokenSaved: !!c.token, app };
  cacheAt = Date.now();
  return cache;
}
// every secret a webhook delivery may be signed with (the app saved in Integrări, the one in Vercel)
async function webhookSecrets() {
  const c = (await readJSON(CONFIG_KEY, null)) || {};
  return [c.app && c.app.appSecret, process.env.WHATSAPP_APP_SECRET].filter(Boolean);
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
async function sendWhatsApp({ phone, text, template, params, language, from, headerImageId }) {
  const cfg = await loadConfig();
  const ready = readyNumbers(cfg);
  if (!ready.length) return { sent: false, error: 'not_configured' };
  const city = ready.includes(from) ? from : ready[0];
  const n = cfg.numbers[city];
  const to = toE164(phone);
  if (!to) return { sent: false, error: 'telefon invalid', fromCity: city };
  const body = template
    ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: template, language: { code: language || 'ro' },
        components: [].concat(headerImageId ? [{ type: 'header', parameters: [{ type: 'image', image: { id: String(headerImageId) } }] }] : [],
          params && params.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p).slice(0, 1000) })) }] : []) } }
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
      const why = code === 131047 ? 'în afara ferestrei de 24h, e nevoie de șablon' : code === 132001 ? 'șablonul nu există / nu e aprobat'
        : code === 131042 ? 'lipsește metoda de plată în Meta (WhatsApp Manager → Plăți)'
        : code === 200 || code === 10 ? 'Meta refuză trimiterea cu accesul ăsta' : 'Meta a refuzat';
      // Meta's own words always come along (its details say the real reason, e.g. what to set where)
      const e = (j && j.error) || {};
      const meta = [e.message, e.error_data && e.error_data.details, e.error_user_msg].filter(Boolean).map((x) => String(x).slice(0, 300)).join(' · ');
      console.error('sendWhatsApp', city, code, e.error_subcode, meta);
      return { sent: false, error: why + ' (cod ' + (code || r.status) + (e.error_subcode ? '/' + e.error_subcode : '') + (meta ? ': ' + meta : '') + ')', fromCity: city };
    }
    return { sent: true, id: j.messages && j.messages[0] && j.messages[0].id, fromCity: city };
  } catch (err) {
    return { sent: false, error: 'rețea', fromCity: city };
  }
}

// ---- media (photos, PDFs, voice notes) ----------------------------------------------------------
// the file types a WhatsApp chat carries, by MIME, with the extension we keep it under
const MEDIA_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'video/mp4': 'mp4', 'video/3gpp': '3gp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'text/plain': 'txt' };
const mediaExt = (mime) => MEDIA_EXT[String(mime || '').split(';')[0].trim().toLowerCase()] || '';
// what kind of WhatsApp message a file goes as
const mediaKind = (mime) => (/^image\/(jpeg|png)$/.test(mime) ? 'image' : /^video\//.test(mime) ? 'video' : /^audio\//.test(mime) ? 'audio' : 'document');

// a file up to Meta from a clinic's number (for a message or a template's header): { id } or { error }
async function uploadMedia(city, buf, mime, filename) {
  const cfg = await loadConfig();
  const n = cfg.numbers[city];
  if (!n || !n.phoneId || !n.token) return { error: 'numărul ' + city + ' nu e conectat' };
  try {
    const fd = new FormData();
    fd.append('messaging_product', 'whatsapp');
    fd.append('type', mime);
    fd.append('file', new Blob([buf], { type: mime }), filename || ('fisier.' + (mediaExt(mime) || 'bin')));
    const up = await fetch(GRAPH + '/' + encodeURIComponent(n.phoneId) + '/media', { method: 'POST', headers: { Authorization: 'Bearer ' + n.token }, body: fd });
    const uj = await up.json().catch(() => ({}));
    if (!up.ok || !uj.id) return { error: ((uj && uj.error) || {}).message || 'eroare ' + up.status };
    return { id: String(uj.id) };
  } catch (err) { return { error: 'rețea' }; }
}
// an example picture for Meta's review of a template (resumable upload → a handle), with an account's access
async function resumableHandle(token, buf, mime) {
  try {
    const app = await fetch(GRAPH + '/app?access_token=' + encodeURIComponent(token));
    const aj = await app.json().catch(() => ({}));
    if (!app.ok || !aj.id) return { error: ((aj && aj.error) || {}).message || 'nu găsesc aplicația Meta a accesului' };
    const s = await fetch(GRAPH + '/' + aj.id + '/uploads?' + new URLSearchParams({ file_name: 'exemplu.' + (mediaExt(mime) || 'jpg'), file_length: String(buf.length), file_type: mime, access_token: token }), { method: 'POST' });
    const sj = await s.json().catch(() => ({}));
    if (!s.ok || !sj.id) return { error: ((sj && sj.error) || {}).message || 'eroare ' + s.status };
    const u = await fetch(GRAPH + '/' + sj.id, { method: 'POST', headers: { Authorization: 'OAuth ' + token, file_offset: '0' }, body: buf });
    const uj = await u.json().catch(() => ({}));
    if (!u.ok || !uj.h) return { error: ((uj && uj.error) || {}).message || 'eroare ' + u.status };
    return { h: uj.h };
  } catch (err) { return { error: 'rețea' }; }
}

// a file from the portal, out to a client: up to Meta from the number it leaves from, then the message
async function sendMedia({ phone, from, buf, mime, filename, caption }) {
  const cfg = await loadConfig();
  const ready = readyNumbers(cfg);
  if (!ready.length) return { sent: false, error: 'not_configured' };
  const city = ready.includes(from) ? from : ready[0];
  const n = cfg.numbers[city];
  const to = toE164(phone);
  if (!to) return { sent: false, error: 'telefon invalid', fromCity: city };
  try {
    const fd = new FormData();
    fd.append('messaging_product', 'whatsapp');
    fd.append('type', mime);
    fd.append('file', new Blob([buf], { type: mime }), filename || ('fisier.' + (mediaExt(mime) || 'bin')));
    const up = await fetch(GRAPH + '/' + encodeURIComponent(n.phoneId) + '/media', { method: 'POST', headers: { Authorization: 'Bearer ' + n.token }, body: fd });
    const uj = await up.json().catch(() => ({}));
    if (!up.ok || !uj.id) return { sent: false, error: 'Meta nu a primit fișierul: ' + (((uj && uj.error) || {}).message || up.status), fromCity: city };
    const kind = mediaKind(mime);
    const media = { id: uj.id };
    if (caption && kind !== 'audio') media.caption = String(caption).slice(0, 1024);
    if (kind === 'document') media.filename = filename || 'document';
    const r = await fetch(GRAPH + '/' + encodeURIComponent(n.phoneId) + '/messages', {
      method: 'POST', headers: { Authorization: 'Bearer ' + n.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: kind, [kind]: media }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = (j && j.error) || {}; return { sent: false, error: 'Meta a refuzat (cod ' + (e.code || r.status) + (e.message ? ': ' + e.message : '') + ')', fromCity: city }; }
    return { sent: true, id: j.messages && j.messages[0] && j.messages[0].id, kind, fromCity: city };
  } catch (err) {
    return { sent: false, error: 'rețea', fromCity: city };
  }
}

// a client's file, in from Meta (its link lasts minutes): the bytes, with the number's own access
async function fetchMedia(phoneNumberId, mediaId) {
  const cfg = await loadConfig();
  const city = CITIES.find((c) => cfg.numbers[c].phoneId === String(phoneNumberId));
  const token = (city && cfg.numbers[city].token) || cfg.token;
  if (!token || !mediaId) return null;
  const meta = await fetch(GRAPH + '/' + encodeURIComponent(mediaId), { headers: { Authorization: 'Bearer ' + token } });
  const mj = await meta.json().catch(() => ({}));
  if (!meta.ok || !mj.url) return null;
  if (Number(mj.file_size) > 16e6) return { tooBig: true, mime: mj.mime_type || '' };
  const f = await fetch(mj.url, { headers: { Authorization: 'Bearer ' + token } });
  if (!f.ok) return null;
  return { buf: Buffer.from(await f.arrayBuffer()), mime: String(mj.mime_type || f.headers.get('content-type') || '').split(';')[0] };
}

module.exports = { uploadMedia, resumableHandle, mediaExt, mediaKind, sendMedia, fetchMedia, CITIES, CONFIG_KEY, GRAPH, loadConfig, invalidate, webhookSecrets, readyNumbers, whatsappReady, whatsappConfigured, cityForPhoneId, sendWhatsApp, toE164 };
