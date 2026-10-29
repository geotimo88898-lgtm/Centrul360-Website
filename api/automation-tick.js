// GET /api/automation-tick, runs the automation steps that are due (reminders, waits …).
// Called by the Vercel cron in vercel.json (daily, the portal heartbeat covers the rest of the day)
// and can be pinged by any external scheduler. With CRON_SECRET set in Vercel, only requests that
// carry it (Vercel's own cron sends it automatically) are accepted.
// The GitHub clock (.github/workflows/automations-clock.yml) calls it once an hour with ?light=1: the due steps and
// the new Facebook leads, without the myPOS reading (that stays with the daily cron and the webhook). Every open
// portal's heartbeat (api/portal-pulse.js) runs the same steps too, so a clock that skips an hour costs nothing.

const { tick } = require('./_lib/workflows');
const { pollLeads } = require('./_lib/fb-leads');
const { readJSON, writeJSON } = require('./_lib/store');
const mypos = require('./_lib/mypos');

// the steps, in the order that matters when the hour is short (Vercel ends the request at 60 s: what comes after a
// slow step would be skipped every hour, silently): the clients' messages and the new leads first, then the ads'
// guard and the owners' one-off changes, then the rest; a step is started only while there is time for it, and the
// answer says which ones waited. Every step keeps its own state, so a skipped one simply runs at the next tick.
const BUDGET_MS = 50e3;
const STEPS = [
  ['leads', () => pollLeads(true)], // new Facebook leads first, so their automations run now too
  ['ran', () => tick(true)],
  // the ads that don't bring leads go off (api/_lib/ads-guard.js)
  ['ads', () => require('./_lib/ads-guard').guard()],
  // the changes the owners asked for once (api/_lib/ads-once.js)
  ['once', () => require('./_lib/ads-once').run()],
  // the creative orders asked for in chat (api/_lib/creative-once.js)
  ['creative', () => require('./_lib/creative-once').run()],
  // the job ads asked for in chat (api/_lib/hire-once.js)
  ['hire', () => require('./_lib/hire-once').run()],
  // the changes to the automations asked for in chat (api/_lib/wf-once.js)
  ['flows', () => require('./_lib/wf-once').run()],
  // reminders stopped by a flow saved again get started back (api/_lib/workflows.js repairReminders)
  ['reminders', async () => ({ repaired: await require('./_lib/workflows').repairReminders() })],
];

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== 'Bearer ' + secret) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const t0 = Date.now();
  const out = { ok: true, waited: [] };
  // Claude's read with the report key only reads: the clock's steps stay with the clock (28.10)
  const readOnly = !!(req.query && req.query.report) && require('crypto').createHash('sha256').update(String(req.query.report)).digest('hex') === 'e5677ffcb33269c8376ad2711d5b236c464b43dcd91656b11e2d22b495f9dd86';
  // with the key, &vad=<job>: the video ad the owner approved in chat (api/_lib/ads-video.js): the file and its cover
  // sent with POST (&put=video / &put=thumb), then &step=look, make or status; &vids=<since>: the account's ads with
  // what they brought, &camps=<since>: every campaign with its bookings and budget, &vfile=<video id>: one video's file.
  // Answered alone (no report).
  if (readOnly && (req.query.vad || req.query.vids || req.query.vfile || req.query.camps)) {
    const v = require('./_lib/ads-video');
    const job = String(req.query.vad || '');
    let r;
    try {
      if (req.query.camps) r = await v.campaigns(String(req.query.camps));
      else if (req.query.vids) r = await v.videos(String(req.query.vids));
      else if (/^\d{6,25}$/.test(String(req.query.vfile || ''))) r = await v.videoFile(String(req.query.vfile));
      else if (!v.JOBS[job]) r = { error: 'job necunoscut' };
      else if (req.method === 'POST') r = await v.put(job, String(req.query.put || ''), Buffer.isBuffer(req.body) ? req.body : null);
      else r = await ({ look: v.look, make: v.make, status: v.status }[String(req.query.step || 'look')] || v.look)(job);
    } catch (e) { r = { error: e.message }; }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(r);
    return;
  }
  // with the key, &ad=<campaign id>: its ads as Meta has them (texts, picture or video, the video's file), to look at
  if (readOnly && /^\d{6,25}$/.test(String(req.query.ad || ''))) out.ad = await (async () => {
    const { loadConnection } = require('./_lib/facebook');
    const conn = await loadConnection(readJSON);
    const g = (path, params) => fetch('https://graph.facebook.com/v25.0/' + path + '?' + new URLSearchParams(Object.assign({ access_token: conn.userToken }, params || {}))).then((r) => r.json());
    const list = await g(req.query.ad + '/ads', { fields: 'id,name,effective_status,creative{id,video_id,thumbnail_url,image_url,body,title,object_story_spec,asset_feed_spec}', limit: '20' });
    const ads = (list.data || []);
    for (const a of ads) {
      const c = a.creative || {};
      const vids = [c.video_id, ((c.object_story_spec || {}).video_data || {}).video_id].concat(((c.asset_feed_spec || {}).videos || []).map((v) => v.video_id)).filter(Boolean);
      a.videos = [];
      for (const v of [...new Set(vids)]) a.videos.push(await g(v, { fields: 'id,source,picture,length,title,description' }));
    }
    return list.error ? { error: list.error.message } : ads;
  })().catch((e) => ({ error: e.message }));
  // with the key, &ig=1: where Instagram's and Facebook's messages stand (the login's permissions, the webhooks), read only
  if (readOnly && req.query.ig) out.ig = await require('./_lib/social-inbox').status().catch((e) => ({ error: e.message }));
  // with the key, &bk=<campaign ids>: those campaigns' leads and the appointments made for them (read only)
  if (readOnly && req.query.bk) out.bk = await require('./_lib/ads-report').bookingsOf(String(req.query.bk)).catch((e) => ({ error: e.message }));
  // with the key, &rem=1: where the booking messages are (Meta's answers as last read, each clinic's flow), read only
  if (readOnly && req.query.rem) out.rem = await (async () => {
    const [d, cfg, doc, once] = await Promise.all([require('./_lib/wa-templates').load(), require('./_lib/whatsapp').loadConfig(), require('./_lib/workflows').loadDoc(), readJSON('data/wf-once.json', {})]);
    const st = await require('./_lib/reminders').status(d, cfg, doc);
    return { syncedAt: d.syncedAt, todo: st.todo, cities: Object.fromEntries(Object.entries(st.cities).map(([c, x]) => [c, { state: x.state, templates: (x.templates || []).map((t) => t.key + ':' + t.status) }])), done: Object.keys((once && once.done) || {}) };
  })().catch((e) => ({ error: e.message }));
  // with the key, &runs=<phone digits>: that client's appointments and what the automations did for each (to answer
  // "why did she get this"), read only
  if (readOnly && /^\d{6,12}$/.test(String(req.query.runs || ''))) out.runs = await (async () => {
    const key = String(req.query.runs).slice(-9);
    const [appts, runsDoc, doc] = await Promise.all([readJSON('data/appointments.json', []), require('./_lib/workflows').loadRuns(), require('./_lib/workflows').loadDoc()]);
    const mine = appts.filter((a) => String(a.clientPhone || '').replace(/\D/g, '').slice(-9) === key);
    const ids = new Set(mine.map((a) => a.id));
    const wfName = (id) => (doc.workflows.find((w) => w.id === id) || {}).name || id;
    return { appts: mine.map((a) => ({ id: a.id, date: a.date, time: a.time, status: a.status, loc: a.location, created: a.createdAt, updated: a.updatedAt, by: a.createdBy || '' })),
      runs: runsDoc.runs.filter((r) => r.ent && ids.has(r.ent.id)).map((r) => ({ appt: r.ent.id, wf: wfName(r.wf), status: r.status, created: r.createdAt, akey: r.akey ? 'yes' : 'no', log: (r.log || []).map((l) => l.at.slice(11, 19) + ' ' + l.text) })) };
  })().catch((e) => ({ error: e.message }));
  // with the key, &once=1 applies the ads changes the owners approved now (api/_lib/ads-once.js), nothing else
  if (readOnly && req.query.once) out.once = await require('./_lib/ads-once').run().catch((e) => ({ error: e.message }));
  for (const [name, fn] of readOnly ? [] : STEPS) {
    if (Date.now() - t0 > BUDGET_MS) { out.waited.push(name); continue; }
    out[name] = await fn().catch((e) => ({ error: e.message }));
  }
  const { leads, ran, ads, once, creative, hire, reminders } = out;
  if (!out.waited.length) delete out.waited;
  out.ms = Date.now() - t0;
  // myPOS: the POS payments of the last days (the live ones come by webhook; this catches what it missed)
  const pos = readOnly || (req.query && req.query.light) ? { ok: true, added: 'skipped' } : await mypos.sync({ readJSON, writeJSON }, {}).catch((e) => ({ ok: false, error: e.message }));
  // the ads report for Claude (api/_lib/ads-report.js): only with its key (the clock's address has no password)
  const key = String((req.query && req.query.report) || '');
  const report = key && require('crypto').createHash('sha256').update(key).digest('hex') === 'e5677ffcb33269c8376ad2711d5b236c464b43dcd91656b11e2d22b495f9dd86'
    ? await require('./_lib/ads-report').report().catch((e) => ({ error: e.message })) : undefined;
  // a client's appointments and whether each points at her sheet (Claude, with the report's key: ?report=…&who=<name>)
  const who = report && req.query.who ? await (async () => {
    const q = String(req.query.who).toLowerCase();
    const [appts, clients, emps] = await Promise.all([require('./_lib/store').readJSON('data/appointments.json', []), require('./_lib/store').readJSON('data/clients.json', []), require('./_lib/store').readJSON('data/employees.json', [])]);
    const ids = new Set(clients.map((c) => c.id));
    return { appts: appts.filter((x) => String(x.clientName || '').toLowerCase().includes(q)).slice(-8).map((x) => ({ date: x.date, time: x.time, loc: x.location, clientId: x.clientId || '', found: ids.has(x.clientId), by: x.createdBy || '', ghl: !!x.ghlId })),
      clients: clients.filter((c) => String(c.name || '').toLowerCase().includes(q)).map((c) => ({ id: c.id, name: c.name, loc: c.location || '' })),
      staff: emps.filter((e) => /m[aă]d[aă]lin/i.test(e.name || e.username || '')).map((e) => ({ name: e.name, role: e.role, location: e.location, active: e.active !== false })) };
  })().catch((e) => ({ error: e.message })) : undefined;
  // every phone number written in the WhatsApp templates and the automations' texts (Claude, with the key: &phones=1)
  const phones = report && req.query.phones ? await (async () => {
    const st = require('./_lib/store');
    const [tpl, wf] = await Promise.all([st.readJSON('data/wa-templates.json', {}), st.readJSON('data/workflows.json', {})]);
    const re = /(?:\+?40|0)[\s.]?7\d{2}[\s.]?\d{3}[\s.]?\d{3}/g;
    const norm = (x) => x.replace(/\D/g, '').replace(/^40/, '0');
    const found = [];
    ((tpl && tpl.templates) || []).forEach((t) => {
      const text = [t.header, t.body, t.footer].concat((t.buttons || []).map((b) => (b.text || '') + ' ' + (b.phone || '') + ' ' + (b.url || ''))).join(' ');
      const nums = [...new Set((text.match(re) || []).map(norm))];
      found.push({ kind: 'template', id: t.id, sig: /Raluca/.test(text) ? 'Raluca' : /Giovanna/.test(text) ? 'Giovanna' : '', label: t.label, nums, status: Object.values(t.meta || {}).map((m) => m.status).join('/'), leadOffers: t.leadOffers || [], body: String(t.body || '').slice(0, 140) });
    });
    const used = new Set();
    const walk = (steps) => (steps || []).forEach((s) => { if (s.templateId) used.add(s.templateId); walk(s.yes); walk(s.no); (s.more || []).forEach((b) => walk(b.steps)); if (s.type === 'whatsapp' && s.text) { const nums = [...new Set((s.text.match(re) || []).map(norm))]; if (nums.length) found.push({ kind: 'flow-text', nums, text: s.text.slice(0, 140) }); } });
    ((wf && wf.workflows) || []).forEach((w) => walk(w.steps));
    found.forEach((f) => { if (f.kind === 'template') f.inFlow = [...used].length && ((tpl.templates || []).find((t) => t.label === f.label) || {}).id ? used.has((tpl.templates || []).find((t) => t.label === f.label).id) : false; });
    return { found, flows: ((wf && wf.workflows) || []).map((w) => ({ name: w.name, active: !!w.active })) };
  })().catch((e) => ({ error: e.message })) : undefined;
  // the calendars of both clinics for planning the ads (with the key: &cal=1), counts only
  const cal = report && req.query.cal ? await require('./_lib/ads-report').calendar().catch((e) => ({ error: e.message })) : undefined;
  const dry = report ? await require('./_lib/ads-guard').guard({ dry: true, force: true }).catch((e) => ({ error: e.message })) : undefined;
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(Object.assign(out, { ran, leads, pos: pos && pos.ok ? pos.added : pos && pos.error, ads, once, creative, hire, reminders, report, dry, who, phones, cal }));
};
