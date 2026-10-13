// /api/portal-wa, WhatsApp for the admin: the two numbers (Integrări → WhatsApp) and the templates
// (Integrări → Șabloane WhatsApp). Tokens are kept on the server and never sent back.
//   GET                                         the numbers, the templates (read again from Meta every few minutes)
//   POST { action: 'discover', city, token? }   the numbers this token can use (to pick Timișoara's / Arad's)
//   POST { action: 'connect', city, token?, wabaId, phoneId }
//   POST { action: 'disconnect', city }
//   POST { action: 'tpl_save', template }        a new one or changes (a sent one: only its name / variables)
//   POST { action: 'tpl_submit', id }            to Meta for approval
//   POST { action: 'tpl_delete', id }
//   POST { action: 'tpl_sync' }                  read Meta's answers now

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const WA = require('./_lib/whatsapp');
const T = require('./_lib/wa-templates');
const { appCreds } = require('./_lib/facebook');

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const okId = (v) => /^\d{5,25}$/.test(String(v || ''));

async function graph(token, path, params) {
  const r = await fetch(WA.GRAPH + path + '?' + new URLSearchParams(Object.assign({ access_token: token }, params || {})));
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
    numbers[c] = { connected: !!(n.phoneId && n.token), phoneId: n.phoneId, display: n.display, name: n.name, wabaId: n.wabaId, ownToken: n.ownToken, connectedAt: n.connectedAt };
  });
  return {
    ok: true, numbers, tokenSaved: !!cfg.token, ready: WA.readyNumbers(cfg).length > 0,
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
      const c = (await readJSON(WA.CONFIG_KEY, null)) || {};
      c.numbers = c.numbers || {};
      const pasted = clip(body.token, 600).trim();
      if (pasted && !c.token) c.token = pasted;                 // the first token becomes the shared one
      c.numbers[city] = { phoneId: String(body.phoneId), wabaId: String(body.wabaId), display: r.j.display_phone_number || '', name: r.j.verified_name || '',
        token: pasted && c.token !== pasted ? pasted : '', connectedAt: new Date().toISOString() };
      await writeJSON(WA.CONFIG_KEY, c);
      WA.invalidate();
      res.status(200).json(await payload(true));
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
