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

// Meta's address for the messages: any centrul360.com host is this same site; a new one goes to www
const HOOK_PATH = '/api/webhook-whatsapp';
const isOurHook = (u, origin) => u === origin + HOOK_PATH || /^https:\/\/([a-z0-9-]+\.)?centrul360\.com\/api\/webhook-whatsapp$/.test(String(u || ''));
const hookUrl = (origin) => (/centrul360\.com$/.test(String(origin).replace(/^https?:\/\//, '')) ? 'https://www.centrul360.com' : origin) + HOOK_PATH;
const HOOK_KEY = 'data/whatsapp-hook.json'; // Meta's last delivery: { at, signed, refusedAt }

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

// 1. an app's webhook for WhatsApp accounts points at this portal (Meta checks it right away); the
// leads app by default, or the WhatsApp app given (the one saved for the phone's app)
async function ensureWebhook(store, origin, given) {
  const creds = given || await appCreds(store.readJSON);
  if (!creds.appId || !creds.appSecret) return { error: 'Lipsește aplicația Meta: conectează întâi Facebook (Integrări).' };
  const appToken = creds.appId + '|' + creds.appSecret;
  const callback = hookUrl(origin);
  const cur = await call('GET', '/' + creds.appId + '/subscriptions', appToken);
  const set = cur.ok && (cur.j.data || []).some((s) => s.object === 'whatsapp_business_account' && isOurHook(s.callback_url, origin) && s.active !== false &&
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

// the apps whose secret is saved here (the leads app, the WhatsApp app): by id
async function knownApps(store) {
  const apps = {};
  const lead = await appCreds(store.readJSON);
  if (lead.appId && lead.appSecret) apps[String(lead.appId)] = { appId: String(lead.appId), appSecret: lead.appSecret, label: 'aplicația Facebook (leaduri)' };
  const c = (await store.readJSON(WA.CONFIG_KEY, null)) || {};
  const a = c.app || {};
  const appId = a.appId || process.env.WHATSAPP_APP_ID || '', appSecret = a.appSecret || process.env.WHATSAPP_APP_SECRET || '';
  if (appId && appSecret) apps[String(appId)] = { appId: String(appId), appSecret, label: 'aplicația WhatsApp' };
  return apps;
}

// Everything that has to be true for a number to send and receive, checked in order. Each line:
// { ok, label, detail, fix } (fix: Repară can do it). Stops early when the rest can't be checked.
async function checkNumber(store, origin, city) {
  const cfg = await WA.loadConfig(true);
  const n = cfg.numbers[city];
  const raw = (((await store.readJSON(WA.CONFIG_KEY, null)) || {}).numbers || {})[city];
  const out = [];
  const line = (ok, label, detail, fix) => out.push({ ok, label, detail: detail || '', fix: !!fix });
  if (!n.phoneId || !n.token) { line(false, 'Numărul nu e conectat', 'Apasă Conectează.'); return out; }
  if (!raw) line(false, 'Vine din setările vechi din Vercel', 'Nu e numărul conectat din portal (ID ' + n.phoneId + '). Conectează numărul clinicii din portal.');
  // the token and the number, in one question
  const p = await call('GET', '/' + n.phoneId, n.token, { fields: 'display_phone_number,verified_name,status,platform_type,quality_rating,name_status,code_verification_status,messaging_limit_tier' });
  if (!p.ok) {
    const expired = /expired|session|190|invalid oauth|access token/i.test(p.error);
    line(false, expired ? 'Accesul la Meta a expirat' : 'Meta nu răspunde pentru număr', 'Meta: ' + p.error + (expired ? ' (conectează din nou)' : ''));
    return out;
  }
  line(true, 'Accesul la Meta merge', '');
  // what this access may do: asked through each app we have the secret of (the one that made it answers)
  const scopes = await tokenScopes(store, n.token);
  if (scopes) {
    const can = (perm) => scopes.granular.some((g) => g.scope === perm && (!(g.target_ids || []).length || (g.target_ids || []).map(String).includes(String(n.wabaId)))) ||
      (scopes.scopes.includes(perm) && !scopes.granular.some((g) => g.scope === perm));
    const send = !!n.wabaId && can('whatsapp_business_messaging');
    const kind = scopes.type === 'SYSTEM_USER' ? 'utilizator de sistem' : scopes.type === 'USER' ? 'cont de persoană' : (scopes.type || '?').toLowerCase();
    const exp = scopes.expiresAt ? 'expiră ' + new Date(scopes.expiresAt * 1000).toLocaleDateString('ro-RO') : 'nu expiră';
    line(send, send ? 'Accesul are voie să trimită mesaje' : 'Accesul NU are voie să trimită mesaje pentru contul ăsta',
      kind + ' · ' + exp + ' · ' + (scopes.appName ? 'aplicația ' + scopes.appName + ' · ' : '') + 'permisiuni: ' + (scopes.scopes.filter((x) => /whatsapp|business_management/.test(x)).join(', ') || 'niciuna de WhatsApp') +
      (send ? '' : '. Trebuie un acces cu whatsapp_business_messaging pe contul ' + (n.wabaId || '?') + ' (Conectează din nou numărul).'));
  }
  const live = p.j.platform_type === 'CLOUD_API' || p.j.status === 'CONNECTED';
  line(live, live ? 'Numărul e pornit (' + (p.j.display_phone_number || n.phoneId) + ')' : 'Numărul nu e pornit pe WhatsApp Cloud API',
    'stare ' + (p.j.status || '?') + ' · ' + (p.j.platform_type || '?') + (p.j.quality_rating ? ' · calitate ' + p.j.quality_rating : '') + (p.j.name_status && p.j.name_status !== 'APPROVED' ? ' · nume ' + p.j.name_status : ''), !live);
  // our app(s) listen to the number's account
  const apps = await knownApps(store);
  let listening = [];
  if (n.wabaId) {
    const s = await call('GET', '/' + n.wabaId + '/subscribed_apps', n.token);
    if (s.ok) {
      listening = (s.j.data || []).map((x) => String(((x.whatsapp_business_api_data || {}).id) || x.id || ''));
      const ours = listening.filter((id) => apps[id]);
      line(ours.length > 0, ours.length ? 'Contul WhatsApp e ascultat de ' + ours.map((id) => apps[id].label).join(' și ') : 'Nicio aplicație de-a noastră nu ascultă contul WhatsApp',
        listening.length ? 'aplicații abonate: ' + listening.join(', ') : 'nicio aplicație abonată', !ours.length);
    } else line(false, 'Nu pot vedea cine ascultă contul WhatsApp', 'Meta: ' + s.error);
  } else line(false, 'Lipsește ID-ul contului WhatsApp Business', 'Conectează din nou numărul.');
  // Meta's address for the messages, on the app(s) that listen
  const target = listening.filter((id) => apps[id]);
  if (!target.length && Object.keys(apps).length) target.push(Object.keys(apps)[0]);
  for (const id of target) {
    const a = apps[id];
    const r = await call('GET', '/' + a.appId + '/subscriptions', a.appId + '|' + a.appSecret);
    const sub = r.ok && (r.j.data || []).find((x) => x.object === 'whatsapp_business_account');
    const good = sub && isOurHook(sub.callback_url, origin) && sub.active !== false && (sub.fields || []).some((f) => (f.name || f) === 'messages');
    line(!!good, good ? 'Meta trimite mesajele primite în portal (' + a.label + ')' : 'Meta nu trimite mesajele primite în portal (' + a.label + ')',
      !r.ok ? 'Meta: ' + r.error : sub ? 'adresa la Meta: ' + (sub.callback_url || '-') + ((sub.fields || []).some((f) => (f.name || f) === 'messages') ? '' : ' (fără „messages”)') : 'nicio adresă setată', !good);
  }
  // templates for writing first; the last message in
  const T = require('./wa-templates');
  const doc = await T.load();
  const ok = (doc.templates || []).filter((t) => T.approvedFor(t, n.wabaId)).length;
  line(ok > 0, ok ? ok + (ok === 1 ? ' șablon aprobat' : ' șabloane aprobate') : 'Niciun șablon aprobat', ok ? '' : 'Fără șablon aprobat nu poți scrie tu primul (Integrări → Șabloane WhatsApp).');
  // did Meta reach us at all (any number), and were we able to take it
  const hk = await store.readJSON(HOOK_KEY, null);
  if (!hk || !hk.at) line(false, 'Meta n-a trimis încă nimic la adresa portalului', 'Scrie un mesaj de pe alt telefon pe numărul clinicii și apasă din nou Verifică.');
  else if (hk.refusedAt && (!hk.okAt || hk.refusedAt > hk.okAt)) line(false, 'Meta trimite, dar portalul refuză (semnătura nu se potrivește)', 'ultima livrare refuzată: ' + new Date(hk.refusedAt).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' }) + '. App Secret-ul salvat nu e al aplicației care trimite.');
  else line(true, 'Meta trimite la portal: ultima livrare ' + new Date(hk.okAt || hk.at).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' }), hk.signed ? 'semnătură verificată' : 'semnătura nu a putut fi verificată (primită oricum)');
  const convos = await store.readJSON('data/whatsapp-conversations.json', []);
  let last = '';
  convos.filter((c) => c.location === city).forEach((c) => (c.messages || []).forEach((m) => { if (m.direction === 'in' && m.timestamp > last) last = m.timestamp; }));
  line(!!last, last ? 'Ultimul mesaj primit: ' + new Date(last).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' }) : 'Niciun mesaj primit încă pe numărul ăsta', '');
  return out;
}

// what an access may do, asked through the apps we have the secret of (null when none can tell)
async function tokenScopes(store, token) {
  const apps = await knownApps(store);
  for (const id of Object.keys(apps)) {
    const a = apps[id];
    const r = await call('GET', '/debug_token', a.appId + '|' + a.appSecret, { input_token: token });
    const d = r.ok && r.j.data;
    if (d && d.is_valid !== false && (d.scopes || d.granular_scopes)) {
      return { type: d.type || '', expiresAt: d.expires_at || 0, appName: d.application || '', scopes: d.scopes || [], granular: d.granular_scopes || [] };
    }
  }
  return null;
}

// what can be fixed from here: our app(s) listen to the account, Meta's address on every app we have
async function repairNumber(store, origin, city) {
  const cfg = await WA.loadConfig(true);
  const n = cfg.numbers[city];
  const done = [];
  if (!n.phoneId || !n.token || !n.wabaId) return { error: 'Numărul ' + city + ' nu e conectat din portal.' };
  const s = await call('POST', '/' + n.wabaId + '/subscribed_apps', n.token);
  done.push(s.ok ? 'aplicația ascultă contul' : 'abonarea: ' + s.error);
  const apps = await knownApps(store);
  for (const id of Object.keys(apps)) {
    const r = await ensureWebhook(store, origin, apps[id]);
    done.push(r.ok ? 'adresa pentru mesaje setată (' + apps[id].label + ')' : r.error + ' (' + apps[id].label + ')');
  }
  const p = await call('GET', '/' + n.phoneId, n.token, { fields: 'status,platform_type' });
  if (p.ok && p.j.platform_type !== 'CLOUD_API' && p.j.status !== 'CONNECTED' && !n.coex) {
    const raw = (((await store.readJSON(WA.CONFIG_KEY, null)) || {}).numbers || {})[city] || {};
    const reg = await setupNumber({ token: n.token, wabaId: n.wabaId, phoneId: n.phoneId, pin: raw.pin });
    done.push(reg.ok ? 'numărul pornit' : reg.error);
  }
  return { ok: true, done };
}

module.exports = { call, verifyToken, ensureWebhook, setupNumber, knownApps, checkNumber, repairNumber, HOOK_KEY, isOurHook, hookUrl };
