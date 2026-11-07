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
  // read only, once: who owns the shared ad account and the site's pixel (api/_lib/pixel-diag.js); the pixel of the
  // owner's own Business (api/_lib/pixel-once.js) waits for what this finds
  ['pixeldiag', () => require('./_lib/pixel-diag').run()],
  // once: the site's pixel shared with the ad account (the owner, 7.11; api/_lib/pixel-share.js)
  ['pixelshare', () => require('./_lib/pixel-share').run()],
  // the creative orders asked for in chat (api/_lib/creative-once.js)
  ['creative', () => require('./_lib/creative-once').run()],
  // the job ads asked for in chat (api/_lib/hire-once.js)
  ['hire', () => require('./_lib/hire-once').run()],
  // the changes to the automations asked for in chat (api/_lib/wf-once.js)
  ['flows', () => require('./_lib/wf-once').run()],
  // the bookings from the site not confirmed yet: the last message after 4 hours, the cancel, Giovanna's calls
  ['siteconfirm', () => require('./_lib/site-confirm').tick()],
  // reminders stopped by a flow saved again get started back (api/_lib/workflows.js repairReminders)
  ['reminders', async () => ({ repaired: await require('./_lib/workflows').repairReminders() })],
  // the CRM steps of the Facebook leads that no change sent yet (Conversions API, api/_lib/meta-capi.js)
  ['capi', () => require('./_lib/meta-capi').sweep()],
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
  // with the key, &days=<YYYY-MM-DD>: each clinic's appointments per day from then on (to see which days it works), alone
  if (readOnly && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.days || ''))) {
    const appts = await readJSON('data/appointments.json', []);
    const out = {};
    appts.filter((a) => a.date >= req.query.days && a.status !== 'concediu').forEach((a) => {
      const c = out[a.location || '?'] = out[a.location || '?'] || {};
      const d = c[a.date] = c[a.date] || { all: 0, cancelled: 0 };
      d.all++; if (a.status === 'anulata') d.cancelled++;
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(out);
    return;
  }
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
  // with the key, &find=<phone digits>: where that number is kept (clients, leads, candidates, WhatsApp chats, appointments): kinds and dates only
  if (readOnly && /^\d{6,15}$/.test(String(req.query.find || ''))) out.find = await (async () => {
    const k = String(req.query.find).slice(-9), d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
    const [clients, leads, cands, convos, wcont, appts, contactsDoc] = await Promise.all(['data/clients.json', 'data/leads.json', 'data/candidates.json', 'data/whatsapp-conversations.json', 'data/whatsapp-contacts.json', 'data/appointments.json', 'data/contacts.json'].map((f) => readJSON(f, [])));
    const list = (x) => (Array.isArray(x) ? x : Object.values(x || {}));
    const pick = (arr, f) => list(arr).filter((x) => d9(f(x)) === k);
    return {
      clients: pick(clients, (x) => x.phone).map((x) => { const { normalizePhone } = require('./_lib/clients'), { inCity } = require('./_lib/city'), q = normalizePhone('+40 ' + k.slice(0, 3) + ' ' + k.slice(3, 6) + ' ' + k.slice(6));
        return { source: x.source || '', created: x.createdAt || '', loc: x.location || '', hasName: !!x.name, format: String(x.phone || '').replace(/\d/g, '9'), normalized: normalizePhone(x.phone).replace(/\d/g, '9'),
          searchFinds: { admin: normalizePhone(x.phone).includes(q), receptieTimisoara: normalizePhone(x.phone).includes(q) && inCity('Timișoara', x.location || ''), receptieArad: normalizePhone(x.phone).includes(q) && inCity('Arad', x.location || '') } }; }),
      leads: pick(leads, (x) => x.phone).map((x) => ({ created: x.createdAt || '', stage: x.stage || '', loc: x.location || '', hasName: !!x.name })),
      candidates: pick(cands, (x) => x.phone).map((x) => ({ at: x.at || '', job: x.job || '', welcomed: x.welcomed || '' })),
      chats: pick(convos, (x) => x.phone).map((x) => ({ phoneStored: x.phone, location: x.location || '', last: x.lastMessageAt || '', messages: (x.messages || []).length, in: (x.messages || []).filter((m) => m.direction === 'in').length })),
      waContacts: pick(wcont, (x) => x.phone || x.id).length,
      counts: (() => { const l = list(clients), leadsNoClient = list(leads).length; const by = (c) => l.filter((x) => (x.location || '') === c).length; return { clients: l.length, timisoara: by('Timișoara'), arad: by('Arad'), noCity: by(''), leads: leadsNoClient }; })(),
      appointments: pick(appts, (x) => x.clientPhone).map((x) => ({ date: x.date, status: x.status || '' })),
    };
  })().catch((e) => ({ error: e.message }));
  // with the key, &stages=<days>: the leads of the last days by city and stage, and how many are still untouched (counts only)
  if (readOnly && /^\d{1,3}$/.test(String(req.query.stages || ''))) out.stages = await (async () => {
    const leads = await readJSON('data/leads.json', []);
    const since = Date.now() - Number(req.query.stages) * 864e5;
    const r = {};
    (leads || []).filter((l) => Date.parse(l.createdAt) >= since && Array.isArray(l.forms) && l.forms.length).forEach((l) => {
      const c = r[l.location || '?'] = r[l.location || '?'] || { total: 0, stages: {}, byDay: {} };
      c.total++; c.stages[l.stage || '?'] = (c.stages[l.stage || '?'] || 0) + 1;
      const d = String(l.createdAt).slice(0, 10); c.byDay[d] = (c.byDay[d] || 0) + 1;
    });
    return r;
  })().catch((e) => ({ error: e.message }));
  // with the key, &blog=<days>: the budget changes of the last days (the guard's and the once-jobs'), to see who changed what
  if (readOnly && /^\d{1,3}$/.test(String(req.query.blog || ''))) out.blog = await (async () => {
    const since = Date.now() - Number(req.query.blog) * 864e5;
    const [g, o] = await Promise.all([readJSON('data/ads-guard.json', {}), readJSON('data/ads-once.json', {})]);
    const row = (src) => (e) => ({ src, at: e.at, type: e.type || (e.status ? 'status ' + e.status : 'budget'), name: e.campaignName || e.name || '', from: e.from, to: e.to, job: e.job, why: String(e.why || '').slice(0, 90) });
    return [].concat(((g && g.log) || []).filter((e) => Date.parse(e.at) > since && e.type && e.type !== 'stop').map(row('guard')), ((o && o.log) || []).filter((e) => Date.parse(e.at) > since && (e.to != null || e.status)).map(row('once')))
      .sort((a, b) => (a.at < b.at ? -1 : 1));
  })().catch((e) => ({ error: e.message }));
  // with the key, &trend=<days>: the running campaigns' spend and leads per day and their frequency (read only)
  if (readOnly && req.query.trend) out.trend = await require('./_lib/ads-report').trend(req.query.trend).catch((e) => ({ error: e.message }));
  // with the key, &hire=1 makes the job ads the owners approved now (api/_lib/hire-once.js), nothing sent to anyone
  if (readOnly && req.query.hire) out.hire = await require('./_lib/hire-once').publishJobs().catch((e) => ({ error: e.message }));
  // with the key, &hiretpl=1: the interview template for candidates (made and sent to Meta once, then its status), nothing sent to anyone
  if (readOnly && req.query.hiretpl) out.hiretpl = await require('./_lib/hire-once').interviewTemplate().catch((e) => ({ error: e.message }));
  // with the key, &cruns=<client id>: that client's appointments and what the automations did for each (like &runs, by client), read only
  if (readOnly && /^[\w-]{8,60}$/.test(String(req.query.cruns || ''))) out.cruns = await (async () => {
    const [appts, runsDoc, doc, convos] = await Promise.all([readJSON('data/appointments.json', []), require('./_lib/workflows').loadRuns(), require('./_lib/workflows').loadDoc(), readJSON('data/whatsapp-conversations.json', [])]);
    const mine = appts.filter((a) => a.clientId === String(req.query.cruns));
    const ids = new Set(mine.map((a) => a.id));
    const wfName = (id) => (doc.workflows.find((w) => w.id === id) || {}).name || id;
    const phone = String((mine[0] || {}).clientPhone || '').replace(/\D/g, '').slice(-9);
    const chats = convos.filter((c) => String(c.phone || '').replace(/\D/g, '').slice(-9) === phone && phone.length === 9);
    const chat = chats[0];
    return { appts: mine.map((a) => ({ id: a.id, date: a.date, time: a.time, status: a.status, loc: a.location, created: a.createdAt, updated: a.updatedAt, phone: a.clientPhone ? 'yes' : 'NO', treatment: a.treatment || '' })),
      runs: runsDoc.runs.filter((r) => r.ent && ids.has(r.ent.id)).map((r) => ({ appt: r.ent.id, wf: wfName(r.wf), status: r.status, created: r.createdAt, akey: r.akey ? 'yes' : 'no', log: (r.log || []).map((l) => l.at.slice(5, 16) + ' ' + l.text) })),
      chatCount: chats.length, chatKeys: chats.map((c) => String(c.phone).replace(/\d/g, '9') + ' / ' + (c.messages || []).length + ' msgs'),
      autoSent: [].concat(...chats.map((c) => (c.messages || []).filter((m) => m.auto || m.sentBy === null).filter((m) => String(m.timestamp) >= '2026-10-31').map((m) => ({ key: String(c.phone).replace(/\d/g, '9'), at: String(m.timestamp).slice(5, 16), status: m.status, err: m.error || '', text: String(m.text || '').slice(0, 60) })))),
      chat: chat ? { location: chat.location, messages: (chat.messages || []).slice(-8).map((m) => ({ at: String(m.timestamp).slice(5, 16), dir: m.direction, type: m.type, status: m.status, by: m.sentBy ? 'staff' : m.auto ? 'auto' : '', text: String(m.text || '').slice(0, 90), tpl: m.templateId ? 'tpl' : '' })) } : null };
  })().catch((e) => ({ error: e.message }));
  // with the key, &dayrem=<YYYY-MM-DD>: for that day's appointments, whether the "day before" reminder was sent by the engine and is in the chat (counts)
  if (readOnly && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dayrem || ''))) out.dayrem = await (async () => {
    const [appts, runsDoc, convos] = await Promise.all([readJSON('data/appointments.json', []), require('./_lib/workflows').loadRuns(), readJSON('data/whatsapp-conversations.json', [])]);
    const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
    const byPhone = new Map(); convos.forEach((c) => byPhone.set(d9(c.phone), c));
    return appts.filter((a) => a.date === req.query.dayrem && a.status !== 'anulata' && a.status !== 'concediu').map((a) => {
      const runs = runsDoc.runs.filter((r) => r.ent && r.ent.id === a.id);
      const sentLine = [].concat(...runs.map((r) => (r.log || []).filter((l) => /Ziua dinainte|24h|înainte/.test(l.text) && /^WhatsApp/.test(l.text)).map((l) => l.at)));
      const c = byPhone.get(d9(a.clientPhone));
      const inChat = c ? (c.messages || []).filter((m) => m.auto && /reamintesc/i.test(m.text || '') && String(m.timestamp).slice(0, 10) >= '2026-10-31').map((m) => String(m.timestamp).slice(5, 16)) : null;
      return { time: a.time, loc: String(a.location || '').slice(0, 3), status: a.status, treatment: String(a.treatment || '').slice(0, 14), engineSaysSent: sentLine.map((x) => String(x).slice(5, 16)), inChat, hasChat: !!c, hasPhone: !!a.clientPhone, runStatus: runs.map((r) => r.status) };
    }).sort((a, b) => a.time.localeCompare(b.time));
  })().catch((e) => ({ error: e.message }));
  // with the key, &dayruns=<YYYY-MM-DD>: that day's appointments and their runs' logs (no names, no phones), read only
  if (readOnly && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.dayruns || ''))) out.dayruns = await (async () => {
    const [appts, runsDoc, doc] = await Promise.all([readJSON('data/appointments.json', []), require('./_lib/workflows').loadRuns(), require('./_lib/workflows').loadDoc()]);
    const wfName = (id) => (doc.workflows.find((w) => w.id === id) || {}).name || id;
    return appts.filter((a) => a.date === req.query.dayruns && a.status !== 'anulata' && a.status !== 'concediu').map((a) => ({ time: a.time, loc: String(a.location || '').slice(0, 3), status: a.status,
      runs: runsDoc.runs.filter((r) => r.ent && r.ent.id === a.id).map((r) => ({ wf: wfName(r.wf), status: r.status, due: r.dueAt, log: (r.log || []).slice(-6).map((l) => String(l.at).slice(5, 16) + ' ' + String(l.text).replace(/\+?\d[\d\s]{7,}/g, '#').slice(0, 120)) })) }))
      .sort((a, b) => a.time.localeCompare(b.time));
  })().catch((e) => ({ error: e.message }));
  // with the key, &storetime=1: how big the main documents are and how long reading each takes (speed check), read only
  if (readOnly && req.query.storetime) out.storetime = await (async () => {
    const { head } = require('@vercel/blob');
    const st = require('./_lib/store');
    const docs = ['data/sales.json', 'data/appointments.json', 'data/leads.json', 'data/clients.json', 'data/whatsapp-conversations.json', 'data/workflow-runs.json', 'data/employees.json', 'data/config.json', 'data/notifications.json', 'data/automation-tasks.json', 'data/client-dues.json', 'data/offers.json', 'data/academy-progress.json', 'data/_rev.json'];
    const rows = [];
    for (const d of docs) {
      let size = 0; try { const h = await head(d); size = h.size; } catch (e) { size = -1; }
      const t0 = Date.now(); try { await st.readJSON(d, null); } catch (e) { /* timed anyway */ }
      const t1 = Date.now(); try { await st.readJSON(d, null); } catch (e) { /* again: the instance's copy */ }
      rows.push({ doc: d.replace(/^data\//, ''), kb: Math.round(size / 1024), firstMs: t1 - t0, againMs: Date.now() - t1 });
    }
    return rows;
  })().catch((e) => ({ error: e.message }));
  // with the key, &writetime=1: a save of a copy of the appointments (data/_speedtest.json, never the real one) timed:
  // the plain write, and one whose version moved meanwhile (the merge path), speed check
  if (readOnly && req.query.writetime) out.writetime = await (async () => {
    const st = require('./_lib/store');
    const T = 'data/_speedtest.json';
    const src = await st.readJSON('data/appointments.json', []);
    const copy = JSON.parse(JSON.stringify(src));
    const r = { kb: Math.round(JSON.stringify(copy, null, 2).length / 1024), kbCompact: Math.round(JSON.stringify(copy).length / 1024) };
    let t = Date.now();
    if (req.query.writetime === '3') {
      // the copy is already there from the earlier checks: read it, change it, save it through the store, at most 12 s
      const a = await st.readJSON(T, []); r.readMs = Date.now() - t;
      a.push({ id: 'speed-' + Date.now(), date: '2000-01-01' });
      t = Date.now();
      const done = await Promise.race([st.writeJSON(T, a, { quiet: true }).then(() => 'saved', (e) => 'error ' + e.message), new Promise((ok) => setTimeout(() => ok('still going after 12 s'), 12e3))]);
      r.result = done; r.changeWriteMs = Date.now() - t; r.log = st.writeLog.filter((x) => x.pathname === T).slice(-1);
      return r;
    }
    if (req.query.writetime === 'tags') {
      const B = require('@vercel/blob');
      const out2 = {};
      for (const d of ['data/_speedtest.json', 'data/appointments.json', 'data/clients.json', 'data/sales.json', 'data/employees.json']) {
        const h = await B.head(d); const g = await B.get(d, { access: 'private', useCache: false });
        if (g && g.stream) { try { g.stream.cancel(); } catch (e) { /* closed */ } }
        out2[d] = { size: h.size, head: h.etag, get: g && g.blob && g.blob.etag };
      }
      return out2;
    }
    if (req.query.writetime === 'raw') { await require('@vercel/blob').put(T, JSON.stringify(copy), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' }); r.rawPutMs = Date.now() - t; return r; }
    await st.writeJSON(T, copy, { quiet: true }); r.firstWriteMs = Date.now() - t;
    if (req.query.writetime === '1') return r;
    t = Date.now(); const a = await st.readJSON(T, []); r.readMs = Date.now() - t;
    a.push({ id: 'speed-a', date: '2000-01-01' });
    if (req.query.writetime === '2') {
      // straight onto the version read, with the store's ETag, no retries: does a big document take the check?
      const { put } = require('@vercel/blob');
      const tag = (await require('@vercel/blob').head(T)).etag;
      t = Date.now();
      try { await put(T, JSON.stringify(a, null, 2), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', ifMatch: tag }); r.bigIfMatch = 'ok ' + (Date.now() - t) + 'ms'; }
      catch (e) { r.bigIfMatch = 'FAIL ' + (Date.now() - t) + 'ms ' + String(e.message || '').slice(0, 140); }
      return r;
    }
    if (req.query.writetime === '3') {
      t = Date.now();
      await Promise.race([st.writeJSON(T, a, { quiet: true }), new Promise((ok) => setTimeout(ok, 12e3))]);
      r.changeWriteMs = Date.now() - t; r.log = st.writeLog.filter((x) => x.pathname === T).slice(-2);
      return r;
    }
    t = Date.now(); await st.writeJSON(T, a, { quiet: true }); r.changeWriteMs = Date.now() - t;
    // two readers, the second saves after the first: the merge
    const x = await st.readJSON(T, []); const y = JSON.parse(JSON.stringify(x));
    x.push({ id: 'speed-b', date: '2000-01-02' }); await st.writeJSON(T, x, { quiet: true });
    y.push({ id: 'speed-c', date: '2000-01-03' });
    // the merge's own pieces, timed apart (the store does: read theirs, merge3, write)
    t = Date.now(); const theirs = await st.readJSON(T, []); r.readTheirsMs = Date.now() - t;
    t = Date.now(); const mm = st.merge3(JSON.parse(JSON.stringify(x)), y, theirs); r.merge3BigMs = Date.now() - t; r.mergedLen = mm.length;
    if (req.query.writetime === '4') return r;
    t = Date.now(); await st.writeJSON(T, y, { quiet: true }); r.mergeWriteMs = Date.now() - t;
    t = Date.now(); const m = st.merge3(src, a, x); r.merge3Ms = Date.now() - t; r.items = src.length; r.mergedItems = m.length;
    return r;
  })().catch((e) => ({ error: e.message }));
  // with the key, &etagtest=1: does a save onto the version just read go through (the ETag check), on a test document
  if (readOnly && req.query.etagtest) out.etagtest = await (async () => {
    const { put, get } = require('@vercel/blob');
    const T = 'data/_etagtest.json';
    const p1 = await put(T, JSON.stringify({ n: 1 }), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
    const g = await get(T, { access: 'private', useCache: false });
    const r = { putEtag: p1.etag, getEtag: g && g.blob && g.blob.etag };
    for (const [name, tag] of [['withGetEtag', r.getEtag], ['withPutEtag', r.putEtag]]) {
      const t = Date.now();
      try { const x = await put(T, JSON.stringify({ n: 2, name }), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', ifMatch: tag }); r[name] = 'ok ' + (Date.now() - t) + 'ms'; r.lastEtag = x.etag; }
      catch (e) { r[name] = 'FAIL ' + (Date.now() - t) + 'ms ' + (e.name || '') + ' ' + String(e.message || '').slice(0, 120); }
    }
    // the store's own write, timed, onto a fresh read
    const st = require('./_lib/store');
    const d = await st.readJSON(T, {}); d.n = 3;
    const t = Date.now(); await st.writeJSON(T, d, { quiet: true }); r.storeWriteMs = Date.now() - t;
    return r;
  })().catch((e) => ({ error: e.message }));
  // with the key, &lostmsgs=1: the automatic messages the engine says it sent, and how many are in the chats, by day (counts only)
  if (readOnly && req.query.lostmsgs) out.lostmsgs = await (async () => {
    const [runsDoc, convos, appts] = await Promise.all([require('./_lib/workflows').loadRuns(), readJSON('data/whatsapp-conversations.json', []), readJSON('data/appointments.json', [])]);
    const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
    const apptById = new Map(appts.map((a) => [a.id, a]));
    const chatByPhone = new Map(); convos.forEach((c) => chatByPhone.set(d9(c.phone), c));
    const days = {};
    runsDoc.runs.forEach((r) => {
      const a = r.ent && apptById.get(r.ent.id); const chat = a && chatByPhone.get(d9(a.clientPhone));
      (r.log || []).filter((l) => /^WhatsApp de pe/.test(l.text) && !/Candidat/.test(l.text)).forEach((l) => {
        const day = l.at.slice(0, 10); const kind = /Locația/.test(l.text) ? 'loc' : /Ziua dinainte|24h/.test(l.text) ? 'day' : /2h/.test(l.text) ? '2h' : /Confirmare/.test(l.text) ? 'conf' : 'other';
        const x = days[day] = days[day] || {}; const k = x[kind] = x[kind] || { said: 0, inChat: 0 };
        k.said++;
        // in the chat: an automatic message for this appointment within 3 minutes of the log line
        const t = Date.parse(l.at);
        if (chat && (chat.messages || []).some((m) => m.auto && m.appt === r.ent.id && Math.abs(Date.parse(m.timestamp) - t) < 3 * 60e3)) k.inChat++;
      });
    });
    return days;
  })().catch((e) => ({ error: e.message }));
  // with the key, &dups=<days>: appointments that got the same automatic message more than once (chat and engine), counts and times only
  if (readOnly && /^\d{1,2}$/.test(String(req.query.dups || ''))) out.dups = await (async () => {
    const since = new Date(Date.now() - Number(req.query.dups) * 864e5).toISOString();
    const [runsDoc, convos, doc] = await Promise.all([require('./_lib/workflows').loadRuns(), readJSON('data/whatsapp-conversations.json', []), require('./_lib/workflows').loadDoc()]);
    const wf = (id) => (doc.workflows.find((w) => w.id === id) || {}).name || id;
    const engine = {};
    runsDoc.runs.forEach((r) => (r.log || []).filter((l) => l.at >= since && /^WhatsApp de pe/.test(l.text)).forEach((l) => { const k = (r.ent && r.ent.id) + '|' + l.text; (engine[k] = engine[k] || []).push(wf(r.wf) + ' ' + l.at.slice(5, 16)); }));
    const dupEngine = Object.entries(engine).filter(([, v]) => v.length > 1).map(([k, v]) => ({ msg: k.split('|')[1], times: v }));
    const chat = [];
    convos.forEach((c) => { const by = {}; (c.messages || []).filter((m) => m.auto && m.timestamp >= since).forEach((m) => { const k = (m.appt || '') + '|' + m.templateId; (by[k] = by[k] || []).push(String(m.timestamp).slice(5, 16)); });
      Object.entries(by).filter(([, v]) => v.length > 1).forEach(([k, v]) => chat.push({ appt: !!k.split('|')[0], times: v })); });
    const flows = (doc.workflows || []).map((w) => ({ name: w.name, active: !!w.active, trigger: w.trigger && (w.trigger.type || w.trigger) }));
    // appointments with more than one running run
    const per = {}; runsDoc.runs.filter((r) => r.ent && r.status === 'waiting').forEach((r) => { per[r.ent.id] = (per[r.ent.id] || 0) + 1; });
    return { dupEngineLines: dupEngine.length, dupEngine: dupEngine.slice(0, 6), dupChat: chat.length, dupChatSample: chat.slice(0, 8), flows, apptsWithManyWaitingRuns: Object.values(per).filter((n) => n > 1).length };
  })().catch((e) => ({ error: e.message }));
  // with the key, &marktest=1: the "sent once" mark works on the store (made once, refused the second time), then removed
  if (readOnly && req.query.marktest) out.marktest = await (async () => {
    const st = require('./_lib/store'); const p = 'locks/test/' + Date.now() + '.txt';
    const a = await st.createOnce(p, 'x'); const b = await st.createOnce(p, 'y'); await st.removeBinary(p);
    return { first: a, second: b };
  })().catch((e) => ({ error: e.message }));
  // with the key, &storetest=1: two saves at once on a test document (data/_store-test.json) both stay
  if (readOnly && req.query.storetest) out.storetest = await (async () => {
    const st = require('./_lib/store');
    await st.writeJSON('data/_store-test.json', [{ id: 'base', v: 0 }], { quiet: true });
    const one = async (id) => { const l = await st.readJSON('data/_store-test.json', []); await new Promise((r) => setTimeout(r, 300)); l.push({ id, v: 1 }); await st.writeJSON('data/_store-test.json', l, { quiet: true }); };
    const a = await st.readJSON('data/_store-test.json', []);
    await Promise.all([one('a'), one('b'), one('c')]);
    a.find((x) => x.id === 'base').v = 9; await st.writeJSON('data/_store-test.json', a, { quiet: true }); // a stale copy, written last
    const fin = await st.readJSON('data/_store-test.json', []);
    return fin.map((x) => x.id + ':' + x.v);
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
  // the clock's last run (when, how long, what waited, light or full): read publicly at /api/clock-status, nothing secret
  if (!readOnly) await writeJSON('data/clock-last.json', { at: new Date().toISOString(), ms: out.ms, light: !!(req.query && req.query.light), waited: out.waited || [], by: /vercel-cron/.test(String(req.headers['user-agent'] || '')) ? 'cron' : 'other' }).catch(() => 0);
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
