// /api/portal-wa, WhatsApp for the admin: the two numbers (Integrări → WhatsApp) and the templates
// (Integrări → Șabloane WhatsApp). Tokens are kept on the server and never sent back.
//   GET                                         the numbers, the templates (read again from Meta every few minutes)
//   POST { action: 'discover', city, token? }   the numbers this token can use (to pick Timișoara's / Arad's)
//   POST { action: 'connect', city, token?, wabaId, phoneId, pin? }   also sets Meta up (webhook,
//                                                our app on the account, the number live on the Cloud API)
//   POST { action: 'check' }                    per number, what works and what doesn't (Verifică)
//   POST { action: 'repair', city }              what can be fixed from here (Repară)
//   POST { action: 'test_send', city, phone }    Meta's hello_world (or an approved template) to a phone
//   POST { action: 'login_config', configId }   the "Facebook Login for Business" configuration with the
//                                                WhatsApp permissions ("Conectează cu Facebook", once)
//   POST { action: 'disconnect', city }
//   POST { action: 'app_save', appId, appSecret?, configId }   the WhatsApp app, for connecting from the phone's app
//   POST { action: 'coex', city, code, wabaId, phoneId? }      a number connected from the WhatsApp Business app
//                                                              (Embedded Signup): its token, webhooks, chats and contacts
//   POST { action: 'tpl_save', template }        a new one or changes (a sent one: only its name / variables)
//   POST { action: 'tpl_submit', id }            to Meta for approval
//   POST { action: 'tpl_delete', id }
//   POST { action: 'tpl_sync' }                  read Meta's answers now

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const WA = require('./_lib/whatsapp');
const T = require('./_lib/wa-templates');
const { appCreds, siteOrigin } = require('./_lib/facebook');
const WC = require('./_lib/wa-connect');

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const okId = (v) => /^\d{5,25}$/.test(String(v || ''));

async function graph(token, path, params) {
  const r = await fetch(WA.GRAPH + path + '?' + new URLSearchParams(Object.assign(token ? { access_token: token } : {}, params || {})));
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j, error: !r.ok ? (((j && j.error) || {}).message || 'eroare ' + r.status) : '' };
}

async function graphPost(token, path, body) {
  const r = await fetch(WA.GRAPH + path, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j, error: !r.ok ? (((j && j.error) || {}).message || 'eroare ' + r.status) : '' };
}

async function payload(forceSync) {
  const cfg = await WA.loadConfig(true);
  const d = await T.load();
  if (WA.readyNumbers(cfg).length && (forceSync || !d.syncedAt || Date.now() - Date.parse(d.syncedAt) > 3 * 60e3)) {
    await T.sync(d).catch((e) => { d.syncError = e.message; });
    await T.save(d);
  }
  const wfDoc = await readJSON('data/workflows.json', {});
  const used = {};
  (wfDoc.workflows || []).forEach((w) => (function walk(list) { (list || []).forEach((s) => { if (s.templateId && !(used[s.templateId] || []).includes(w.name)) (used[s.templateId] = used[s.templateId] || []).push(w.name); if (s.type === 'if') { walk(s.yes); walk(s.no); } }); })(w.steps));
  const numbers = {};
  WA.CITIES.forEach((c) => {
    const n = cfg.numbers[c];
    numbers[c] = { connected: !!(n.phoneId && n.token), phoneId: n.phoneId, display: n.display, name: n.name, wabaId: n.wabaId, ownToken: n.ownToken, connectedAt: n.connectedAt, coex: n.coex };
  });
  // what the browser needs to open Meta's window (the App ID and configuration are public, the secret isn't)
  const app = { appId: cfg.app.appId, configId: cfg.app.configId, secretSaved: !!cfg.app.appSecret };
  // the Facebook login for WhatsApp: the app, its configuration, how the token came
  const raw = (await readJSON(WA.CONFIG_KEY, null)) || {};
  const creds = await appCreds(readJSON);
  const login = { appReady: !!(creds.appId && creds.appSecret), configId: raw.loginConfigId || '', via: raw.tokenVia || (cfg.token ? 'paste' : ''), at: raw.tokenAt || '' };
  return {
    ok: true, numbers, app, login, tokenSaved: !!cfg.token, ready: WA.readyNumbers(cfg).length > 0,
    templates: d.templates.map((t) => Object.assign(T.view(t, cfg), { usedIn: used[t.id] || [] })).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    vars: T.VARS, sample: T.SAMPLE, syncedAt: d.syncedAt, syncError: d.syncError,
  };
}

// the WhatsApp Business accounts a token can manage (Meta tells, for our app's tokens)
async function wabasOf(token) {
  const creds = await appCreds(readJSON);
  if (!creds || !creds.appId || !creds.appSecret) return [];
  const r = await graph(creds.appId + '|' + creds.appSecret, '/debug_token', { input_token: token });
  const g = (r.ok && r.j.data && r.j.data.granular_scopes) || [];
  const ids = new Set();
  g.filter((x) => /^whatsapp_business_(management|messaging)$/.test(x.scope)).forEach((x) => (x.target_ids || []).forEach((id) => ids.add(String(id))));
  return Array.from(ids);
}

module.exports = async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') { res.status(200).json(await payload(false)); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const body = req.body || {};
    const a = body.action;
    const city = WA.CITIES.includes(body.city) ? body.city : '';

    if (a === 'discover' || a === 'connect') {
      if (!city) { res.status(400).json({ error: 'invalid_city' }); return; }
      const cfg = await WA.loadConfig(true);
      const token = clip(body.token, 600).trim() || cfg.numbers[city].token || cfg.token;
      if (!token) { res.status(400).json({ error: 'missing_token', message: 'Lipește tokenul de WhatsApp.' }); return; }
      if (a === 'discover') {
        const wabas = new Set(await wabasOf(token));
        if (okId(body.wabaId)) wabas.add(String(body.wabaId));
        if (!wabas.size) { res.status(200).json({ ok: true, found: [], message: 'Nu am găsit singur contul WhatsApp Business. Scrie ID-ul lui (WhatsApp Manager → Setări cont).' }); return; }
        const found = [];
        for (const w of wabas) {
          const r = await graph(token, '/' + w + '/phone_numbers', { fields: 'id,display_phone_number,verified_name,quality_rating', limit: '50' });
          if (!r.ok) { res.status(400).json({ error: 'meta_refused', message: 'Meta: ' + r.error }); return; }
          (r.j.data || []).forEach((p) => found.push({ wabaId: w, phoneId: String(p.id), display: p.display_phone_number || '', name: p.verified_name || '', quality: p.quality_rating || '' }));
        }
        res.status(200).json({ ok: true, found });
        return;
      }
      // connect: the number must answer with this token
      if (!okId(body.phoneId) || !okId(body.wabaId)) { res.status(400).json({ error: 'invalid_ids', message: 'Alege numărul din listă.' }); return; }
      const r = await graph(token, '/' + body.phoneId, { fields: 'display_phone_number,verified_name' });
      if (!r.ok) { res.status(400).json({ error: 'meta_refused', message: 'Meta: ' + r.error }); return; }
      // what HighLevel does behind its button: Meta sends us the clients' messages, our app listens to
      // the account, the number is live (nothing is called connected before all of it worked)
      const hook = await WC.ensureWebhook({ readJSON, writeJSON }, siteOrigin(req));
      if (hook.error) { res.status(400).json({ error: 'webhook_failed', message: hook.error }); return; }
      const setup = await WC.setupNumber({ token, wabaId: String(body.wabaId), phoneId: String(body.phoneId), pin: clip(body.pin, 6) });
      if (setup.needsPin) { res.status(409).json({ error: 'needs_pin', message: setup.error }); return; }
      if (setup.error) { res.status(400).json({ error: 'setup_failed', message: setup.error }); return; }
      const c = (await readJSON(WA.CONFIG_KEY, null)) || {};
      c.numbers = c.numbers || {};
      const pasted = clip(body.token, 600).trim();
      if (pasted && !c.token) { c.token = pasted; c.tokenVia = 'paste'; c.tokenAt = new Date().toISOString(); } // the first token becomes the shared one
      const prevPin = (c.numbers[city] && c.numbers[city].pin) || '';
      c.numbers[city] = { phoneId: String(body.phoneId), wabaId: String(body.wabaId), display: r.j.display_phone_number || setup.display, name: r.j.verified_name || setup.name,
        token: pasted && c.token !== pasted ? pasted : '', pin: setup.pin || prevPin, connectedAt: new Date().toISOString() };
      await writeJSON(WA.CONFIG_KEY, c);
      WA.invalidate();
      res.status(200).json(await payload(true));
      return;
    }
    if (a === 'check') {
      const out = {};
      for (const c of WA.CITIES) out[c] = await WC.checkNumber({ readJSON, writeJSON }, siteOrigin(req), c).catch((e) => [{ ok: false, label: 'Verificarea a căzut', detail: e.message }]);
      res.status(200).json({ ok: true, checks: out });
      return;
    }
    if (a === 'repair') {
      if (!city) { res.status(400).json({ error: 'invalid_city' }); return; }
      const r = await WC.repairNumber({ readJSON, writeJSON }, siteOrigin(req), city);
      if (r.error) { res.status(400).json({ error: 'repair_failed', message: r.error }); return; }
      res.status(200).json({ ok: true, done: r.done });
      return;
    }
    if (a === 'test_send') {
      if (!city) { res.status(400).json({ error: 'invalid_city' }); return; }
      const phone = clip(body.phone, 30);
      if (!WA.toE164(phone)) { res.status(400).json({ error: 'invalid_phone', message: 'Scrie un număr de telefon.' }); return; }
      // an approved template of ours without variables first, else Meta's own hello_world
      const doc = await T.load();
      const cfg = await WA.loadConfig(true);
      const n = cfg.numbers[city];
      const mine = (doc.templates || []).find((t) => T.approvedFor(t, n.wabaId) && !(t.map || []).length);
      const r = await WA.sendWhatsApp({ phone, from: city, template: mine ? ((mine.meta || {})[n.wabaId] || {}).name || mine.name : 'hello_world', language: mine ? mine.language || 'ro' : 'en_US' });
      if (!r.sent) { res.status(400).json({ error: 'send_failed', message: 'Nu a plecat: ' + r.error }); return; }
      res.status(200).json({ ok: true, from: r.fromCity, template: mine ? mine.label : 'hello_world' });
      return;
    }
    if (a === 'login_config') {
      const id = String(body.configId || '').trim();
      if (!/^\d{6,25}$/.test(id)) { res.status(400).json({ error: 'invalid_config', message: 'ID-ul configurației are doar cifre.' }); return; }
      const c = (await readJSON(WA.CONFIG_KEY, null)) || {};
      c.loginConfigId = id;
      await writeJSON(WA.CONFIG_KEY, c);
      WA.invalidate();
      res.status(200).json(await payload(false));
      return;
    }
    if (a === 'disconnect') {
      const c = (await readJSON(WA.CONFIG_KEY, null)) || {};
      if (c.numbers) delete c.numbers[city];
      if (c.token && !WA.CITIES.some((x) => c.numbers && c.numbers[x])) delete c.token;
      await writeJSON(WA.CONFIG_KEY, c);
      WA.invalidate();
      res.status(200).json(await payload(false));
      return;
    }

    if (a === 'app_save') {
      if (!okId(body.appId) || !okId(body.configId)) { res.status(400).json({ error: 'invalid_ids', message: 'App ID și Configuration ID sunt numere.' }); return; }
      const c = (await readJSON(WA.CONFIG_KEY, null)) || {};
      const prev = c.app || {};
      const secret = clip(body.appSecret, 200).trim();
      if (secret && !/^[a-f0-9]{32}$/i.test(secret)) { res.status(400).json({ error: 'invalid_secret', message: 'App Secret are 32 de caractere (Setări aplicație → De bază).' }); return; }
      c.app = { appId: String(body.appId), configId: String(body.configId), appSecret: secret || (prev.appId === String(body.appId) ? prev.appSecret || '' : '') };
      await writeJSON(WA.CONFIG_KEY, c);
      WA.invalidate();
      res.status(200).json(await payload(false));
      return;
    }

    // From the WhatsApp Business app (coexistence): Meta's window gave the browser a code and the
    // account; the code becomes this number's own token. The number stays registered in the app, so it
    // is NOT registered again here (that would take it off the phone).
    if (a === 'coex') {
      if (!city) { res.status(400).json({ error: 'invalid_city' }); return; }
      const cfg = await WA.loadConfig(true);
      const { appId, appSecret } = cfg.app;
      if (!appId || !appSecret) { res.status(400).json({ error: 'app_missing', message: 'Lipsesc App ID / App Secret ale aplicației WhatsApp.' }); return; }
      const code = clip(body.code, 2000).trim();
      if (!code || !okId(body.wabaId)) { res.status(400).json({ error: 'invalid', message: 'Meta nu a trimis contul. Încearcă din nou.' }); return; }
      const t = await graph('', '/oauth/access_token', { client_id: appId, client_secret: appSecret, code });
      const token = t.ok && t.j.access_token;
      if (!token) { res.status(400).json({ error: 'meta_refused', message: 'Meta: ' + (t.error || 'fără token') }); return; }
      const wabaId = String(body.wabaId);
      const list = await graph(token, '/' + wabaId + '/phone_numbers', { fields: 'id,display_phone_number,verified_name', limit: '50' });
      if (!list.ok) { res.status(400).json({ error: 'meta_refused', message: 'Meta: ' + list.error }); return; }
      const nums = list.j.data || [];
      const num = nums.find((p) => String(p.id) === String(body.phoneId || '')) || (nums.length === 1 ? nums[0] : null);
      if (!num) { res.status(400).json({ error: 'no_number', message: nums.length ? 'Contul are mai multe numere; reia conectarea.' : 'Contul nu are niciun număr.' }); return; }
      // the messages of this account come to our webhook
      const sub = await graphPost(token, '/' + wabaId + '/subscribed_apps');
      const c = (await readJSON(WA.CONFIG_KEY, null)) || {};
      c.numbers = c.numbers || {};
      c.numbers[city] = { phoneId: String(num.id), wabaId, display: num.display_phone_number || '', name: num.verified_name || '', token, coex: true, connectedAt: new Date().toISOString() };
      await writeJSON(WA.CONFIG_KEY, c);
      WA.invalidate();
      // the app's contacts, then its chats (Meta allows it once, within 24 h of connecting); they arrive on the webhook
      const warn = [];
      if (!sub.ok) warn.push('abonarea la mesaje: ' + sub.error);
      const contacts = await graphPost(token, '/' + num.id + '/smb_app_data', { messaging_product: 'whatsapp', sync_type: 'smb_app_state_sync' });
      if (!contacts.ok) warn.push('contactele: ' + contacts.error);
      const history = await graphPost(token, '/' + num.id + '/smb_app_data', { messaging_product: 'whatsapp', sync_type: 'history' });
      if (!history.ok) warn.push('istoricul: ' + history.error);
      res.status(200).json(Object.assign(await payload(true), { warning: warn.join('; ') }));
      return;
    }

    const d = await T.load();
    if (a === 'tpl_save') {
      const prev = body.template && body.template.id ? d.templates.find((t) => t.id === body.template.id) : null;
      if (body.template && body.template.id && !prev) { res.status(404).json({ error: 'not_found' }); return; }
      if (!prev && d.templates.length >= 150) { res.status(400).json({ error: 'too_many', message: 'Cel mult 150 de șabloane.' }); return; }
      const v = T.clean(body.template, prev);
      if (v.error) { res.status(400).json({ error: 'invalid', message: v.error }); return; }
      if (prev) Object.assign(prev, v.t); else d.templates.push(v.t);
      let submitted = null;
      if (body.submit) submitted = await T.submit(d, v.t.id);
      await T.save(d);
      const out = await payload(false);
      res.status(200).json(Object.assign(out, { savedId: v.t.id, submitError: submitted && submitted.error ? submitted.error : '' }));
      return;
    }
    if (a === 'tpl_submit') {
      const r = await T.submit(d, String(body.id || ''));
      await T.save(d);
      if (r.error && !r.partial) { res.status(400).json({ error: 'submit_failed', message: r.error }); return; }
      res.status(200).json(Object.assign(await payload(false), { submitError: r.error || '' }));
      return;
    }
    if (a === 'tpl_delete') {
      const r = await T.remove(d, String(body.id || ''));
      if (r.error) { res.status(400).json({ error: 'delete_failed', message: r.error }); return; }
      await T.save(d);
      res.status(200).json(await payload(false));
      return;
    }
    if (a === 'tpl_sync') { res.status(200).json(await payload(true)); return; }
    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    console.error('portal-wa error:', err.message);
    res.status(500).json({ error: 'wa_failed', message: err.message });
  }
};

module.exports.config = { maxDuration: 60 };
