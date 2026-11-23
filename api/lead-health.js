// GET /api/lead-health?days=3, the owner (portal session) or the Creative app server to server (CREATIVE_SSO_SECRET):
// how the leads and the automatic WhatsApp messages did over the last days, in counts and reasons only, never a name or a
// phone (the owner, 8.11: „verifică toate mesajele de lead nou și reamintire se trimit bine”).
//   leads: where the new ones are in the Pipeline, by source; the welcome message (sent / why not)
//   welcome: per ads offer and city, whether its new-lead template is approved by Meta for that city's number
//   reminders: the booking flows (on / off, their templates' approval per city) and what their runs did
//   delivery: per template, Meta's statuses of the messages sent (sent, delivered, read, failed and why)
//   ?wa=1: also the template messages one by one, newest first (time, template, status, why), no name or phone
//   ?voice=1: the voice notes' transcription (Gemini) works, in length and time only

const crypto = require('crypto');
const { readJSON } = require('./_lib/store');
const { getSession } = require('./_lib/auth');
const { loadOffers } = require('./_lib/offers');
const WT = require('./_lib/wa-templates');
const WA = require('./_lib/whatsapp');

function fromCreative(req) {
  const secret = process.env.CREATIVE_SSO_SECRET || '';
  const header = String((req.headers && req.headers.authorization) || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secret || !token) return false;
  const a = crypto.createHash('sha256').update(token).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}
const inc = (o, k, n) => { o[k] = (o[k] || 0) + (n || 1); };
const PHONE = /\+?\d[\d\s.-]{6,}\d/g; // never a phone in the answer
const CITIES = ['Timișoara', 'Arad'];
const cityOfLoc = (l) => (/arad/i.test(l) ? 'Arad' : 'Timișoara');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = getSession(req);
  if (!fromCreative(req) && !(session && session.role === 'admin')) { res.status(401).json({ error: 'unauthorized' }); return; }
  // POST ?regulament=1 { name, dataUrl }: a new version of the internal regulation, uploaded for the owner when he asks
  // (18.11); the same path as Meniu → Regulament intern → Versiune nouă (api/portal-regulament.js)
  // POST ?fastcash=templates { campaign, steps }: the owner's Fast Cash WhatsApp campaign made into templates and sent to Meta
  // (api/_lib/fastcash.js); GET ?fastcash=status: Meta's answers; GET ?fastcash=kpi: the campaign's numbers (counts only).
  if (req.query && req.query.fastcash) {
    const FC = require('./_lib/fastcash');
    // ?fastcash=pic&label=<template label>: the picture an existing template sends (to match the campaign's look to it)
    if (req.query.fastcash === 'pic') {
      const d = await WT.load(); const t = d.templates.find((x) => x.label === String(req.query.label || ''));
      const path = WT.imageOf(t); const buf = path ? await require('./_lib/store').readBinary(path) : null;
      if (!buf) { res.status(404).json({ error: 'no_picture', labels: d.templates.filter((x) => WT.imageOf(x)).map((x) => x.label) }); return; }
      res.setHeader('Content-Type', 'image/jpeg'); res.status(200).send(buf); return;
    }
    // ?fastcash=kpi: the campaign's numbers (api/_lib/fc-campaign.js), counts only, never a name or a phone
    if (req.query.fastcash === 'kpi') {
      const C = require('./_lib/fc-campaign');
      const agg = await C.kpi(req.query.fresh ? 0 : 120e3);
      const seats = {}; Object.keys(agg.seats || {}).forEach((c) => { const x = agg.seats[c]; seats[c] = { paid: x.paid, left: x.left, bonusGiven: (x.bonus || []).length }; });
      res.status(200).json(Object.assign({ ok: true, name: C.NAME, now: new Date().toISOString() }, agg, { seats })); return;
    }
    const r = req.method === 'POST' && req.query.fastcash === 'templates' ? await FC.templates(req.body || {}) : await FC.status();
    res.status(r.error ? 400 : 200).json(r);
    return;
  }
  // ?leadfilter=…: the lead filter (api/_lib/leadfilter.js), the owner's offer ladder in the Facebook forms. Counts only.
  //   GET  kpi | dryrun (the forms' payloads, nothing sent) | status (the templates' answers from Meta)
  //   POST content { packages, messages } | images { items } | templates { submit? } | forms { confirm: true, city?, zone? }
  if (req.query && req.query.leadfilter) {
    const LF = require('./_lib/leadfilter');
    const a = String(req.query.leadfilter);
    // ?leadfilter=recent: the last lead-filter leads, what each chose and from which ad (no name, no phone), for Claude
    if (a === 'recent') {
      const all = await readJSON('data/leads.json', []);
      const rows = (all || []).filter((l) => l && l.lf).sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt))).slice(0, Math.min(200, Number(req.query.n) || 50))
        .map((l) => ({ id: l.id, at: l.createdAt, city: l.location, zone: l.lf.zoneLabel || l.lf.zone, problem: l.lf.problemLabel, when: l.lf.whenLabel, tier: l.lf.tier, pack: l.lf.packName,
          ad: (((l.forms || []).slice(-1)[0]) || {}).ad || '', stage: l.stageId || '', messaged: !!(l.lfSent || (l.lf && l.lf.sentAt)), waNote: String((((l.activities || []).filter((y) => y && y.author === 'WhatsApp automat').slice(-1)[0]) || {}).text || '').replace(/\d{6,}/g, '…').slice(0, 200), test: /test/i.test(String(l.name || '')) }));
      res.status(200).json({ ok: true, n: rows.length, leads: rows });
      return;
    }
    let r;
    if (req.method === 'GET' && a === 'kpi') r = Object.assign({ ok: true }, await LF.kpi());
    else if (req.method === 'GET' && a === 'dryrun') r = await LF.dryRun();
    else if (req.method === 'POST' && a === 'resend') r = await LF.resend(String(req.query.id || ''));
    else if (req.method === 'GET' && a === 'tests') r = await LF.tests();
    else if (req.method === 'POST' && a === 'test') r = await LF.testForms();
    else if (req.method === 'GET' && a === 'status') {
      const d = await WT.load(); await WT.sync(d).catch(() => null); await WT.save(d);
      r = { ok: true, templates: d.templates.filter((t) => t.leadfilter).map((t) => ({ label: t.label, name: t.name, status: WT.overall(t), reason: Object.values(t.meta || {}).map((m) => m.reason).filter(Boolean)[0] || '' })) };
    }
    else if (req.method === 'POST' && a === 'content') r = await LF.saveContent(req.body || {});
    else if (req.method === 'POST' && a === 'images') r = await LF.saveImages(req.body || {});
    else if (req.method === 'POST' && a === 'templates') r = await LF.templates(req.body || {});
    else if (req.method === 'POST' && a === 'forms') r = req.body && req.body.confirm === true ? await LF.makeForms(req.body) : { error: 'confirm_required' };
    else r = { error: 'bad_action' };
    res.status(r.error ? 400 : 200).json(r);
    return;
  }
  // ?cardlinks=1: the Card de Sărbători's myPOS PayLinks, one per card; POST { 290, 490, 990, 9900 } sets them (9900: the VIP card); the 10% ones (paying online, 22.11): { "9900_online": url } or { "9900": { url, amount: 8910 } } (only https links of
  // mypos.com / mypos.eu; '' clears one), GET reads them (api/_lib/card-sarbatori.js)
  // ?cardembed=1: „Plătesc online” of the Card de Sărbători in the page (the site's myPOS checkout) instead of the PayLinks;
  // GET reads the switch, POST { on: true | false } sets it (api/_lib/card-sarbatori.js data/card-pay.json)
  if (req.query && req.query.cardembed) {
    const C = require('./_lib/card-sarbatori');
    let b = req.body || {}; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    const r = req.method === 'POST' ? await C.setEmbedded(b.on === true, session ? session.employeeId : 'creative') : { embedded: await C.embedded() };
    res.status(200).json(r);
    return;
  }
  if (req.query && req.query.cardlinks) {
    const C = require('./_lib/card-sarbatori');
    let b = req.body || {}; if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    const r = req.method === 'POST' ? await C.setLinks(b, session ? session.employeeId : 'creative') : { links: await C.links(), online: Object.fromEntries(Object.entries(await C.onlineLinks()).map(([t, u]) => [t, { link: u, amount: C.discOf(t) }])) };
    res.status(r.error ? 400 : 200).json(r);
    return;
  }
  if (req.method === 'POST' && req.query && req.query.regulament) {
    const r = await require('./portal-regulament').upload({ role: 'admin', employeeId: 'admin' }, req.body || {});
    res.status(r.error ? 400 : 200).json(r);
    return;
  }
  // POST ?costs=1 { month: 'YYYY-MM', lines: { credits, rentTm (€), rentAr (€), laser, accounting, salaries, claude } }:
  // the fixed costs of a month in Echipa → Costuri lunare, when the owner asks Claude to type them (16.11). Only the
  // fixed lines; the variable ones and anything already there stay as they are. The sums travel in the request, never
  // in this code.
  if (req.method === 'POST' && req.query && req.query.costs) {
    const MP = require('./_lib/manager-pay');
    const { writeJSON } = require('./_lib/store');
    const b = req.body || {};
    if (!MP.isMonth(b.month)) { res.status(400).json({ error: 'invalid_month' }); return; }
    const doc = await MP.loadCosts(readJSON);
    const old = doc.months[b.month] && typeof doc.months[b.month] === 'object' ? doc.months[b.month] : {};
    const lines = Object.assign({}, old.lines || {});
    let n = 0;
    MP.LINES.filter((l) => l.kind === 'fixed').forEach((l) => { const v = MP.amount(b.lines && b.lines[l.key]); if (v != null) { lines[l.key] = v; n++; } });
    doc.months[b.month] = Object.assign({}, old, { lines, over: old.over || {}, savedAt: new Date().toISOString(), savedBy: old.savedBy || 'admin' });
    await writeJSON(MP.COSTS_KEY, doc, { quiet: true });
    res.status(200).json({ ok: true, month: b.month, fixedSet: n });
    return;
  }
  // ?verify=1[&month=YYYY-MM]: the clinic's numbers checked twice, counts only (see verifyNumbers below)
  // ?commission=1&month=YYYY-MM: the upsell commission of a month under the old rule (the whole value, in the upsell's
  // month) and under the rule from November 2026 (4% of each payment received, minus the refunds: _lib/commission.js),
  // in total and per cosmetician id, approved and waiting; ids and sums only, never a name. Read only.
  // ?team=1: the team as Echipa has it, read only (the owner, 20.11: „ai tot sistemul la dispoziție”): who has an account,
  // the role, the clinic, active or not, the hours a day; never the pay, the phone or the papers
  // ?fcaudience=1: who a „Fast Cash” WhatsApp offer could go to (the owner, 20.11), counts only, per clinic: clients
  // with a finished visit in the last 6 months, older clients, and the leads of the last 90 days who never came;
  // with a phone, without a test name. Never a name or a number. Read only.
  // POST ?customers=sync: the clinic's own people (clients + the Transformarea 360 list) as a Meta custom audience,
  // hashed (api/_lib/meta-customers.js), to leave them out of the lead filter ads and reach them with the card
  // POST ?pixelshare=1: the site's pixel shared with the connected ad account (api/_lib/pixel-share-new.js); ids only
  if (req.method === 'POST' && req.query && req.query.pixelshare) { res.status(200).json(await require('./_lib/pixel-share-new').run()); return; }
  if (req.query && req.query.customers) {
    const MC = require('./_lib/meta-customers');
    const r = req.method === 'POST' && req.query.customers === 'sync' ? await MC.sync() : { ok: true, audience: await MC.current() };
    res.status(r.error ? 400 : 200).json(r);
    return;
  }
  // ?cardblast=status (GET): the Cardul de Sărbători to the warmest people of the Transformarea list (api/_lib/card-blast.js),
  // counts only; POST ?cardblast=pick&n=250 makes the list (and takes them out of Transformarea), =go sends, =stop stops
  // ?cardkpi=1: Admin → Campanii's „Cardul de Sărbători” view, computed here (counts only in the answer's summary) to see
  // why it fails; the error message, never the data of a person
  // ?pixelstats=1: what the site's pixel (2276074362800484) received per event, per hour, the last ?h hours (counts only),
  // straight from Meta, so the card's funnel (PageView → InitiateCheckout → Purchase) can be checked on Meta's side
  if (req.query && req.query.pixelstats) {
    const { loadConnection } = require('./_lib/facebook');
    const conn = await loadConnection(readJSON);
    const h = Math.min(168, Math.max(1, Number(req.query.h) || 24));
    const since = Math.floor(Date.now() / 1000) - h * 3600;
    const p = new URLSearchParams({ aggregation: 'event', start_time: String(since), access_token: conn.userToken || '' });
    const r = await fetch('https://graph.facebook.com/v25.0/2276074362800484/stats?' + p.toString()).then((x) => x.json()).catch((e) => ({ error: { message: e.message } }));
    if (r.error) { res.status(200).json({ ok: false, error: String(r.error.message || '').slice(0, 200) }); return; }
    const tot = {};
    (r.data || []).forEach((row) => (row.data || []).forEach((d) => { tot[d.value] = (tot[d.value] || 0) + (Number(d.count) || 0); }));
    res.status(200).json({ ok: true, hours: h, events: tot, byHour: (r.data || []).slice(0, 48).map((row) => ({ at: row.start_time, ev: Object.fromEntries((row.data || []).map((d) => [d.value, d.count])) })) });
    return;
  }
  if (req.query && req.query.cardkpi) {
    try {
      const v = await require('./_lib/card-kpi').view({ fresh: true });
      // per wave, counts only: sent, read, answered, orders by state and money (no names, no phones)
      const by = {};
      (v.people || []).forEach((p) => {
        const b = by[p.batch] = by[p.batch] || { list: 0, sent: 0, read: 0, answered: 0, orders: 0, paid: 0, reserved: 0, online: 0, lei: 0 };
        b.list++; if (p.sent) b.sent++; if (p.read) b.read++; if ((p.answers || []).length) b.answered++;
        (p.orders || []).forEach((o) => { b.orders++; if (o.status === 'platit') { b.paid++; b.lei += Number(o.amount) || 0; } else if (o.status === 'rezervat') b.reserved++; else if (o.status === 'asteptare' || o.status === 'lead') b.online++; });
      });
      res.status(200).json({ ok: true, at: v.at, byBatch: by, money: v.money && { campBy: v.money.campBy, all: v.money.all }, stock: v.stock, tracked: v.state && v.state.tracked,
        spend: v.spend, interested: v.interested, lots: (v.lots || []).map((l) => ({ b: l.b, sent: l.stats.sent, delivered: l.stats.delivered, spend: l.stats.spend })) });
    }
    catch (e) { res.status(200).json({ ok: false, error: String(e && e.message || e), stack: String(e && e.stack || '').split('\n').slice(0, 6) }); }
    return;
  }
  // ?optouts=scan: who wrote on WhatsApp since ?since (default the day before) something that reads as „no more offers”
  // (name, the phone's last 3 digits, the words); ?optouts=find&q=Magda: the people by that name who got a campaign message;
  // POST ?optouts=add&phones=07..,07.. : on the no-offers list (api/_lib/optout.js). For the owner, never logged.
  if (req.query && req.query.optouts) {
    const O = require('./_lib/optout');
    const op = String(req.query.optouts);
    if (req.method === 'POST' && op === 'forget') { res.status(200).json(await O.forget(String(req.query.phone || ''), req.query.dry === '1')); return; }
    if (req.method === 'POST' && op === 'add') { res.status(200).json(await O.add(String(req.query.phones || '').split(','), String(req.query.why || 'la cererea ei'))); return; }
    const convos = await readJSON('data/whatsapp-conversations.json', []);
    const off = await O.set();
    const mask = (p) => '…' + O.d9(p).slice(-3);
    if (op === 'find') {
      const q = String(req.query.q || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const out = convos.filter((c) => String(c.clientName || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q)).slice(0, 30)
        .map((c) => ({ name: c.clientName, phone: mask(c.phone), full: c.phone, off: off.has(O.d9(c.phone)), last: ((c.messages || []).filter((m) => m.direction === 'in').slice(-2).map((m) => String(m.text || '').slice(0, 120))) }));
      res.status(200).json({ ok: true, found: out }); return;
    }
    const since = String(req.query.since || new Date(Date.now() - 864e5).toISOString());
    const hits = [];
    convos.forEach((c) => (c.messages || []).forEach((m) => {
      if (m.direction !== 'in' || String(m.timestamp || '') < since) return;
      if (O.isStop(m.text)) hits.push({ name: c.clientName, phone: mask(c.phone), full: c.phone, at: m.timestamp, text: String(m.text || '').slice(0, 160), off: off.has(O.d9(c.phone)) });
    }));
    res.status(200).json({ ok: true, since, hits }); return;
  }
  // POST ?cardtest=remove&phone=0700000000: a test order taken out of Carduri for good (only a not-paid one, only that
  // exact phone), with its lead in the Pipeline; counts back
  if (req.query && req.query.cardtest === 'remove' && req.method === 'POST') {
    const { writeJSON } = require('./_lib/store');
    const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
    const k = d9(req.query.phone);
    if (k.length !== 9) { res.status(400).json({ error: 'bad_phone' }); return; }
    const C = require('./_lib/card-sarbatori');
    const list = await readJSON(C.KEY, []);
    const keep = list.filter((r) => !(r && d9(r.phone) === k && r.status !== 'platit'));
    if (keep.length !== list.length) await writeJSON(C.KEY, keep);
    const leads = await readJSON('data/leads.json', []);
    const lk = leads.filter((l) => !(l && d9(l.phone) === k && /card de s/i.test(String(l.interest || ''))));
    if (lk.length !== leads.length) await writeJSON('data/leads.json', lk);
    res.status(200).json({ ok: true, orders: list.length - keep.length, leads: leads.length - lk.length });
    return;
  }
  // POST ?leadoffers=fix (&dry=1): leads that signed up again for ANOTHER offer before 22.11 show the newest one; the older
  // ones go to interestHistory (the owner, 22.11). Read from their own „A trimis din nou datele … · <oferta>” lines; only
  // offers we know (Admin → Oferte titles, the lead filter, the card). Counts back.
  if (req.query && req.query.leadoffers === 'fix' && req.method === 'POST') {
    const { writeJSON } = require('./_lib/store');
    const offers = await loadOffers(readJSON).catch(() => []);
    const titles = new Set((Array.isArray(offers) ? offers : Object.values(offers || {})).map((o) => o && o.title).filter(Boolean));
    const known = (t) => titles.has(t) || /^Lead filter · /.test(t) || /^Cardul de Sărbători/.test(t);
    const leads = await readJSON('data/leads.json', []);
    let changed = 0;
    leads.forEach((l) => {
      const ret = (l.activities || []).filter((a) => a && a.type === 'returned' && / · /.test(String(a.text || ''))).sort((a, b) => String(a.at).localeCompare(String(b.at)));
      if (!ret.length) return;
      const last = ret[ret.length - 1];
      const body = String(last.text).split(' - ')[0];
      const seg = body.split(' · ').pop().replace(/ \(înainte: .*\)$/, '').trim();
      if (!known(seg) || seg === l.interest) return;
      if (l.interest) l.interestHistory = (l.interestHistory || []).concat({ interest: l.interest, value: l.value || 0, until: last.at }).slice(-10);
      l.interest = seg; l.interestAt = last.at; changed++;
    });
    if (changed && req.query.dry !== '1') await writeJSON('data/leads.json', leads);
    res.status(200).json({ ok: true, changed, dry: req.query.dry === '1', offers: titles.size });
    return;
  }
  if (req.query && req.query.cardblast) {
    const CB = require('./_lib/card-blast');
    const op = String(req.query.cardblast);
    const r = req.method === 'POST' && op === 'pick' ? await CB.pick(req.query.n) : req.method === 'POST' && op === 'go' ? await CB.go()
      : req.method === 'POST' && op === 'stop' ? await CB.stop() : req.method === 'POST' && op === 'taps' ? await CB.backfillTaps() : req.method === 'POST' && op === 'chats' ? await CB.backfillChats() : req.method === 'POST' && op === 'tpl' ? await CB.useTemplate(String(req.query.v || '')) : req.method === 'POST' && op === 'more' ? await CB.pickMore(req.query.n, { trans: req.query.trans === '1', batch: Number(req.query.batch) || 2, leads: req.query.leads === '1', only: String(req.query.only || ''), pres: String(req.query.pres || '') })
      : req.method === 'POST' && op === 'unpick' ? await CB.unpick(req.query.batch) : await CB.status();
    res.status(200).json(r); return;
  }
  if (req.query && req.query.fcaudience) {
    const [clients, appts, leads] = await Promise.all([readJSON('data/clients.json', []), readJSON('data/appointments.json', []), readJSON('data/leads.json', [])]);
    const { normalizePhone } = require('./_lib/clients');
    const C = require('./_lib/clinic');
    const test = (n) => /^\s*test\b/i.test(String(n || ''));
    const now = Date.now(), d180 = new Date(now - 180 * 864e5).toISOString().slice(0, 10), d90 = new Date(now - 90 * 864e5).toISOString();
    const last = new Map();   // client id -> { date, city } of the last finished visit
    appts.forEach((a) => { if (!a || a.status !== 'finalizata' || !a.clientId) return; const p = last.get(a.clientId); if (!p || a.date > p.date) last.set(a.clientId, { date: a.date, city: C.clinicOf(a.location) || '?' }); });
    const phones = new Set(), out = {};
    const add = (city, seg) => { out[city] = out[city] || { recent: 0, older: 0, leads90: 0 }; out[city][seg]++; };
    clients.forEach((c) => {
      const ph = normalizePhone(c && c.phone); const v = c && last.get(c.id);
      if (!ph || !v || test(c.name) || phones.has(ph)) return;
      phones.add(ph); add(v.city, v.date >= d180 ? 'recent' : 'older');
    });
    leads.forEach((l) => {
      const ph = normalizePhone(l && l.phone);
      if (!ph || test(l.name) || phones.has(ph) || !(String(l.createdAt || '') >= d90)) return;
      phones.add(ph); add(C.clinicOf(l.location) || '?', 'leads90');
    });
    res.status(200).json({ ok: true, cities: out, clientsWithPhone: clients.filter((c) => c && normalizePhone(c.phone)).length, leadsTotal: leads.length });
    return;
  }
  if (req.query && req.query.team) {
    const [emps, sched] = await Promise.all([readJSON('data/employees.json', []), require('./_lib/team-schedule').load().catch(() => null)]);
    const TS = require('./_lib/team-schedule');
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
    const next = (n) => { const t = new Date(day + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
    res.status(200).json({ ok: true, team: emps.filter((e) => e && e.id && e.id !== 'admin').map((e) => ({ id: e.id, name: e.name || '', role: e.role || '', location: e.location || '',
      active: e.active !== false, leftAt: e.leftAt || '', hoursPerDay: e.contractedHoursPerDay != null ? e.contractedHoursPerDay : null, login: !!(e.username || e.pin || e.passwordHash || e.password),
      week: sched ? [0, 1, 2, 3, 4, 5, 6].map((i) => { const d = next(i); const w = TS.workingAt(sched, e.id, d, null, {}); return w ? d.slice(5) + ' ' + w.from + '-' + w.to : null; }).filter(Boolean) : [] })) });
    return;
  }
  if (req.query && req.query.commission) {
    const CM = require('./_lib/commission');
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date()).slice(0, 7);
    const [sales, dues, emps] = await Promise.all([readJSON('data/sales.json', []), readJSON('data/client-dues.json', []), readJSON('data/employees.json', [])]);
    const C = CM.context(sales, dues, emps);
    const r2 = (n) => Math.round(n * 100) / 100;
    const people = {}, total = { old: 0, oldWaiting: 0, new: 0, newWaiting: 0, toCome: 0 };
    emps.filter((e) => e && e.role === 'cosmetician').forEach((e) => {
      let o = 0, ow = 0;
      sales.forEach((s) => {
        if (!CM.isUpsellReq(s) || s.employeeId !== e.id || String(s.date).slice(0, 7) !== month) return;
        if (s.status === 'approved') o += Number(s.commission) || 0;
        if (s.status === 'pending') ow += Number(s.commission) || 0;
      });
      const n = CM.monthOfPerson(sales, dues, e.id, month, true, C);
      const come = n.toCome.reduce((a, t) => a + t.lei, 0);
      if (!o && !ow && !n.commission && !n.waiting && !come) return;
      people[e.id] = { old: r2(o), oldWaiting: r2(ow), new: n.commission, newWaiting: n.waiting, toCome: r2(come), lines: req.query.detail === e.id ? n.lines : n.lines.length, ...(req.query.detail === e.id ? { toComeLines: n.toCome } : {}) };
      total.old += o; total.oldWaiting += ow; total.new += n.commission; total.newWaiting += n.waiting; total.toCome += come;
    });
    Object.keys(total).forEach((k) => { total[k] = r2(total[k]); });
    res.status(200).json({ month, rule: CM.NEW_FROM, total, people });
    return;
  }
  // POST ?moneyfix=1 { apply }: the money audit's cases put right in the data, counts only (apply false: what it would do):
  //   a refund that didn't close its package gives the package its value back (the rule from 16.11: „plătit 0 din 3.000”),
  //   an approved request without its payment's upsell goes, an approved one under the cash rule follows its package's
  //   value, a waiting one for someone who can't earn commission goes. Payments dated in a month before stay (counted only).
  if (req.method === 'POST' && req.query && req.query.moneyfix) {
    const { writeJSON } = require('./_lib/store');
    const D = require('./_lib/dues');
    const apply = !!(req.body && req.body.apply);
    const [sales, dues, emps] = await Promise.all([readJSON('data/sales.json', []), readJSON(D.KEY, []), readJSON('data/employees.json', [])]);
    const byId = new Map(sales.filter(Boolean).map((x) => [x.id, x]));
    const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const out = { packagesValueBack: 0, refundsUncut: 0, orphanDropped: 0, valueFollowed: 0, pendingDropped: 0 };
    sales.forEach((r) => { if (r && r.kind === 'refund' && !(r.restCut || []).length) (r.dues || []).forEach((x) => { if (Number(x.cut) > 0) { out.refundsUncut++; x.cut = 0; } }); });
    dues.forEach((d) => {
      const st = byId.get(d.saleId), value = st ? Number(st.packageTotal) || Number(st.upsell) || 0 : 0;
      if (!(value > 0) || !sales.some((r) => r && r.kind === 'refund' && (r.dues || []).some((x) => x.dueId === d.id))) return;
      const closing = sales.filter((r) => r && r.kind === 'refund').reduce((a, r) => a + (r.dues || []).filter((x) => x.dueId === d.id).reduce((b, x) => b + Number(x.cut || 0), 0), 0);
      const want = r2(Math.max(0, value - closing));
      if (Math.abs(want - Number(d.total)) < 0.005) return;
      out.packagesValueBack++; d.total = want; d.paid = r2((d.payments || []).reduce((a, q) => a + Number(q.amount || 0), 0));
      d.closedAt = D.rest(d) <= 0 ? d.closedAt || new Date().toISOString() : null;
    });
    const drop = new Set();
    sales.forEach((u) => {
      if (!u || u.source !== 'comision' || u.origin !== 'upsell' || !u.incasareId) return;
      const pay = byId.get(u.incasareId);
      if (u.status === 'approved' && String(u.date).slice(0, 7) >= '2026-11' && (!pay || !(Number(pay.upsell) > 0))) { drop.add(u.id); out.orphanDropped++; return; }
      if (u.status === 'approved' && String(u.date).slice(0, 7) >= '2026-11' && pay && Math.abs(Number(pay.upsell) - Number(u.amount)) > 0.005) { u.amount = r2(pay.upsell); out.valueFollowed++; }
      if (u.status === 'pending' && !emps.some((e) => e && e.id === u.employeeId && (e.role === 'cosmetician' || e.role === 'manager'))) { drop.add(u.id); out.pendingDropped++; }
    });
    if (apply) { await writeJSON('data/sales.json', sales.filter((x) => !(x && drop.has(x.id)))); await writeJSON(D.KEY, dues); }
    res.status(200).json(Object.assign({ applied: apply }, out));
    return;
  }
  // ?moneyaudit=1: counts only (never a name, an id or a sum) of the money audit's cases in the data (16.11):
  //   orphanApproved   approved upsell requests whose payment is gone or no longer carries an upsell (1)
  //   refundEdited     packages with a refund whose value was set back to the full package by a later correction (2)
  //   backDated        payments and refunds dated in a month before the one they were typed in (3)
  //   upsellBelowValue approved requests (cash rule) worth less than their payment's package value (5)
  //   pendingNotCosm   requests still waiting for someone who can't earn commission (9)
  //   refundsCutValue  refunds not closing their package that lowered its value (the rule before 16.11, evening)
  if (req.query && req.query.moneyaudit) {
    const [sales, dues, emps] = await Promise.all([readJSON('data/sales.json', []), readJSON('data/client-dues.json', []), readJSON('data/employees.json', [])]);
    const byId = new Map(sales.filter(Boolean).map((s) => [s.id, s]));
    const roDay = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t)) : ''; };
    const reqs = sales.filter((s) => s && s.source === 'comision' && s.origin === 'upsell' && s.incasareId);
    const cash = (u) => String(u.date).slice(0, 7) >= '2026-11';
    const cutsOf = (dueId) => sales.filter((r) => r && r.kind === 'refund').reduce((a, r) => a + (r.dues || []).filter((x) => x.dueId === dueId).reduce((b, x) => b + Number(x.cut || 0), 0), 0);
    const out = {
      orphanApproved: reqs.filter((u) => u.status === 'approved' && cash(u) && (!byId.get(u.incasareId) || !(Number(byId.get(u.incasareId).upsell) > 0))).length,
      refundEdited: dues.filter((d) => { const c = cutsOf(d.id), st = byId.get(d.saleId); return c > 0 && st && Number(st.upsell) > 0 && Math.abs(Number(d.total) - Number(st.upsell)) < 0.01; }).length,
      backDated: sales.filter((s) => s && s.source === 'incasare' && s.createdAt && String(s.date).slice(0, 7) < roDay(s.createdAt).slice(0, 7)).length,
      upsellBelowValue: reqs.filter((u) => u.status === 'approved' && cash(u) && byId.get(u.incasareId) && Number(byId.get(u.incasareId).upsell) - Number(u.amount) > 0.005).length,
      pendingNotCosm: reqs.filter((u) => u.status === 'pending' && !emps.some((e) => e && e.id === u.employeeId && (e.role === 'cosmetician' || e.role === 'manager'))).length,
      refundsCutValue: sales.filter((r) => r && r.kind === 'refund' && !(r.restCut || []).length && (r.dues || []).some((x) => Number(x.cut) > 0)).length,
    };
    res.status(200).json(out);
    return;
  }
  if (req.query && req.query.verify) {
    try { res.status(200).json(await verifyNumbers(req.query.month)); } catch (e) { res.status(500).json({ error: String(e.message || e).replace(PHONE, '…').slice(0, 200) }); }
    return;
  }
  const days = Math.max(1, Math.min(14, Number((req.query && req.query.days) || 3) || 3));
  // ?wahealth=1: what Meta itself says about each city's WhatsApp account right now (may it send, and if not, why and
  // what to do): the health of the number, of the account, of the firm and of the app, whether a payment method is
  // attached, the currency. No ids, no token, no phone in the answer (?wahealth=links adds the account's and the firm's
  // ids, for the owner's direct link to the account's payment page in Meta Business).
  // ?hours=1: the Instagram followers online per Bucharest hour (0..1, the whole week) and per weekday, read only, for
  // choosing the posting times (the owner, 15.11: „programul spot on, cu potențial de viralitate maxim”)
  // ?plan=1: the posting calendar, read only (the owner's rule, 15.11: after a big wave of approvals the whole calendar is
  // checked against our posting rules and fixed where it isn't optimal): every planned or posted entry, by time, with
  // the item's topic, review state and kind; plus the settings' times and quotas. No ids of people, nothing private.
  // ?fill=1: the calendar of the next days per clinic, read only (the owner, 16.11: the ads planned so the next 2 days
  // fill up to 100% plus the no-shows of the last 60 days): the target, the hours of the team, booked and free, day by
  // day, the same numbers as KPI → Clinică. Shares and hours only, never a name.
  if (req.query && req.query.fill) {
    const C = require('./_lib/clinic'), B = require('./_lib/booking');
    const [appts, sales, clients, emps, cfg] = await Promise.all([readJSON('data/appointments.json', []), readJSON('data/sales.json', []),
      readJSON('data/clients.json', []), readJSON('data/employees.json', []), B.settings({ team: true })]);
    const N = C.normalize({ leads: [], appts, sales, convos: [], emps });
    const today = B.roNow().date, n = Math.max(1, Math.min(14, Number(req.query.fill) || 7));
    const tg = C.fillTargets(N.appts, N.sales, C.CITIES, today, clients);
    const out = {};
    C.CITIES.forEach((city) => { out[city] = { target: tg[city], days: C.fillDays(cfg, city, today, n, N.appts, tg[city].target) }; });
    res.status(200).json({ today, cities: out });
    return;
  }
  // ?demand=90: when the clients of each clinic come, read only (the owner, 17.11: the cosmeticians' hours by the clients'
  // availability). Per weekday (1 Monday .. 7 Sunday) and start hour: came, missed, cancelled, still ahead, online (picked
  // by the client herself on the site), the booked minutes per hour; and the team's week as it is set, by index, no names.
  if (req.query && req.query.demand) {
    const C = require('./_lib/clinic'), T = require('./_lib/team-schedule'), B = require('./_lib/booking');
    const [appts, sales, emps, doc] = await Promise.all([readJSON('data/appointments.json', []), readJSON('data/sales.json', []), readJSON('data/employees.json', []), T.load()]);
    const today = B.roNow().date, n = Math.max(7, Math.min(180, Number(req.query.demand) || 90)), from = C.addDay(today, -n), to = C.addDay(today, 21), paid = C.paidDays(sales);
    const out = {};
    C.CITIES.forEach((city) => {
      const grid = {}, mins = {}, weeks = {};
      for (let d = from; d < today; d = C.addDay(d, 1)) { const w = T.isoDow(d); weeks[w] = (weeks[w] || 0) + 1; }
      appts.filter((a) => a && C.clinicOf(a.location) === city && !a.block && a.time && a.date >= from && a.date <= to && a.status !== 'concediu' && !/^\s*test\b/i.test(a.clientName || '')).forEach((a) => {
        const w = T.isoDow(a.date), s = C.toMin(a.time); if (s == null) return;
        const h = Math.floor(s / 60), k = w + '|' + h, g = grid[k] || (grid[k] = { came: 0, missed: 0, cancelled: 0, ahead: 0, online: 0 });
        const came = C.cameBy(a, paid);
        if (a.status === 'anulata') g.cancelled++; else if (a.date >= today) g.ahead++; else if (came) g.came++; else g.missed++;
        if (a.online) g.online++;
        if (a.status !== 'anulata') { let e = C.toMin(a.endTime); if (e == null || e <= s) e = s + 60; for (let m = s; m < e; m += 30) { const kk = w + '|' + Math.floor(m / 60); mins[kk] = (mins[kk] || 0) + 30; } }
      });
      const team = emps.filter((e) => e && e.role === 'cosmetician' && e.active !== false && C.clinicOf(e.location) === city).map((e, i) => {
        const wk = doc.weekly && doc.weekly[e.id];
        return { who: 'c' + (i + 1), days: wk && wk.days ? Object.keys(wk.days).sort().map((d) => d + ':' + (wk.days[d] && wk.days[d].on ? wk.days[d].from + '-' + wk.days[d].to : 'liber')).join(' ') : 'nesetat' };
      });
      out[city] = { weeks, grid, mins, team };
    });
    res.status(200).json({ today, from, to, cities: out });
    return;
  }
  // ?time=1: the Calendar's time problems as they are now (16.11), counts per clinic only, never a name or a phone. Read only.
  //   orphans    bookings to come left without a cosmetician, by why (a plecat, concediu, timp blocat, zi liberă, în alt oraș)
  //   offDay     bookings to come on a cosmetician who doesn't work that day in Program echipă (not marked by a change)
  //   unmarked   passed visits of the last 60 days neither finished, cancelled nor paid (each one a no-show today), and how
  //              many of them are package sessions
  //   movedAhead bookings „reprogramată” sitting on a day still ahead (moved; whether their old day passed without her can't
  //              be known for the ones moved before 16.11), missedOn: the moves that kept their no-show since
  // ?attfix=1: what the once fix of the manager's 19.11 pontaj found and did (times only; api/_lib/att-fix-once.js)
  // ?myposprobe=1: can the myPOS API Gateway keys make online payments (eCommerce API)? read only (api/_lib/mypos.js gwProbe)
  // ?cardpay=1: the Card de Sărbători's payments in myPOS: what the transactions API shows of the last 14 days, in counts and
  // field names only (type, POS or not, currency), the webhook events myPOS offers, the orders waiting, the WhatsApp templates
  if (req.query && req.query.cardpay) {
    const C = require('./_lib/card-sarbatori');
    // ?cardpay=templates: its WhatsApp templates made and sent to Meta now (the clock does it too, every 6 hours until approved)
    if (req.query.cardpay === 'templates') { res.status(200).json(await C.ensureTemplates().catch((e) => ({ error: e.message }))); return; }
    // ?cardpay=abandon: the orders started on the site and what became of them (the trail, the recovery WhatsApp, her
    // answers, the name asked after the payment, the payments waiting in „De verificat”): counts only, never a name or a phone
    if (req.query.cardpay === 'abandon') {
      const [list, checks, T] = await Promise.all([readJSON(C.KEY, []), readJSON(C.CHECK, []).catch(() => []), C.templates().catch(() => ({ t: {} }))]);
      res.status(200).json(Object.assign(C.abandonStats(list), {
        checks: { open: checks.filter((c) => c.state === 'open').length, pickedByDesk: checks.filter((c) => c.state === 'done' && c.by && c.by !== 'auto').length, resolvedAuto: checks.filter((c) => c.by === 'auto').length, noOrder: checks.filter((c) => c.state === 'none').length },
        templates: Object.fromEntries(Object.entries(T.t || {}).map(([k, t]) => [k, t ? WT.overall(t) : 'LIPSĂ'])) }));
      return;
    }
    const s = await C.scanMypos(Number(req.query.days) > 0 ? Math.min(60, Number(req.query.days)) : 14, { events: true }).catch((e) => ({ ok: false, error: e.code || e.message }));
    const list = await readJSON(C.KEY, []);
    const T = await C.templates().catch(() => ({ t: {} }));
    res.status(200).json({ probe: s.probe || null, error: s.error || '', online: (s.pays || []).map((p) => ({ amount: p.amount, at: p.at })), waiting: list.filter((r) => r.status === 'asteptare').map((r) => ({ amount: r.amount, created: r.created })),
      templates: Object.fromEntries(Object.entries(T.t || {}).map(([k, t]) => [k, t ? WT.overall(t) : 'LIPSĂ'])) });
    return;
  }
  if (req.query && req.query.myposprobe) { const { writeJSON } = require('./_lib/store'); res.status(200).json(await require('./_lib/mypos').gwProbe({ readJSON, writeJSON }).catch((e) => ({ error: String(e.message || e) }))); return; }
  if (req.query && req.query.attfix) {
    const [fix, dup, att, emps, adjs] = await Promise.all([readJSON(require('./_lib/att-fix-once').KEY, {}), readJSON(require('./_lib/att-dup-once').KEY, {}), readJSON('data/attendance.json', []), readJSON('data/employees.json', []), readJSON('data/time-adjust.json', [])]);
    const who = (id) => { const e = emps.find((x) => x.id === id) || {}; return { role: e.role || '', first: String(e.name || '').split(/\s+/)[0] }; };
    const days = att.filter((e) => e && e.date >= '2026-11-17').map((e) => Object.assign(who(e.employeeId), { id: e.id, date: e.date, in: e.checkIn, out: e.checkOut,
      hist: (e.history || []).slice(-3).map((h) => ({ at: h.at, by: h.byName, before: h.before && (h.before.checkIn + '-' + h.before.checkOut), after: h.after && (h.after.checkIn + '-' + h.after.checkOut) })) }));
    const adj = adjs.filter((a) => a && a.date >= '2026-11-17').map((a) => Object.assign(who(a.employeeId), { date: a.date, minutes: a.minutes, status: a.status, in: a.checkIn, out: a.checkOut }));
    res.status(200).json({ fix, dup, days, adj }); return;
  }
  if (req.query && req.query.time) {
    const C = require('./_lib/clinic'), L = require('./_lib/left'), T = require('./_lib/team-schedule'), B = require('./_lib/booking');
    const [appts, sales, emps, doc] = await Promise.all([readJSON('data/appointments.json', []), readJSON('data/sales.json', []), readJSON('data/employees.json', []), T.load()]);
    const today = B.roNow().date, from = C.addDay(today, -60), paid = C.paidDays(sales);
    const out = {};
    const orph = L.orphans(appts, emps, today, doc);
    C.CITIES.forEach((city) => {
      const here = (a) => a && C.clinicOf(a.location) === city;
      const o = {};
      orph.filter(here).forEach((a) => { o[a.orphanWhy] = (o[a.orphanWhy] || 0) + 1; });
      const ids = new Set(emps.filter((e) => e && e.role === 'cosmetician' && e.active !== false).map((e) => e.id));
      const offDay = appts.filter((a) => here(a) && L.open(a) && a.date >= today && a.cosmeticianId && ids.has(a.cosmeticianId) && !a.offShift && T.dayOf(doc, a.cosmeticianId, a.date) && !T.workingAt(doc, a.cosmeticianId, a.date, null, {})).length;
      const un = appts.filter((a) => here(a) && a.date >= from && a.date < today && ['programata', 'confirmata', 'reprogramata'].includes(a.status) && !a.block && !C.cameBy(a, paid) && !/^\s*test\b/i.test(a.clientName || ''));
      out[city] = { orphans: o, offDay, unmarked: { all: un.length, packages: un.filter((a) => a.package).length, yesterday: un.filter((a) => a.date === C.addDay(today, -1)).length },
        movedAhead: appts.filter((a) => here(a) && a.status === 'reprogramata' && a.date >= today).length, missedOn: appts.filter((a) => here(a) && Array.isArray(a.missedOn) && a.missedOn.length).length };
    });
    res.status(200).json({ today, cities: out });
    return;
  }
  if (req.query && req.query.plan) {
    const C = require('./_lib/content');
    const [list, st] = await Promise.all([C.items(), C.settings()]);
    const rows = [];
    list.filter((it) => !it.removed && !it.dropped).forEach((it) => (it.plan || []).forEach((e) => rows.push({ at: e.at, net: e.net, kind: e.kind, state: e.state, id: it.id.slice(0, 8), topic: it.topic || '', review: it.review || '', week: it.week, itemState: it.state })));
    rows.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    res.status(200).json({ times: st.times, photoTime: st.photoTime, quotas: st.quotas, startWeek: st.startWeek, warmWeeks: st.warmWeeks, on: st.on, rows });
    return;
  }
  if (req.query && req.query.hours) {
    const CI = require('./_lib/content-insights');
    const aud = await CI.audience().catch(() => null);
    const g = aud && aud.ig && aud.ig.online ? CI.onlineGrid(aud.ig.online) : null;
    res.status(200).json({ at: aud && aud.at, days: aud && aud.ig && aud.ig.online && aud.ig.online.days ? aud.ig.online.days.length : 0, grid: g });
    return;
  }
  // ?docfile=<path>: one of the owner's documents (Regulament intern, Fișa postului, „De făcut”'s print files) as a file,
  // for the owner's own copies outside the portal (same reach as the portal's owner; nothing else in the store)
  if (req.query && req.query.docfile) {
    const p = String(req.query.docfile);
    if (!/^(?:regulament|fise-post|todo)\/[\w-]+\.pdf$/.test(p)) { res.status(400).json({ error: 'invalid_path' }); return; }
    const buf = await require('./_lib/store').readBinary(p);
    if (!buf) { res.status(404).json({ error: 'not_found' }); return; }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(Buffer.from(buf));
    return;
  }
  // ?wamkt=<from Unix seconds>: the marketing messages' cost from then to now (api/_lib/wa-cost.js rangeMarketing), a check
  if (req.query && req.query.wamkt) {
    res.status(200).json(await require('./_lib/wa-cost').rangeMarketing(readJSON, Number(req.query.wamkt) || 0, Math.floor(Date.now() / 1000)).catch((e) => ({ error: e.message })));
    return;
  }
  // ?wacost=YYYY-MM (or 1: this month): what Meta says the WhatsApp messages cost, per city, read now (api/_lib/wa-cost.js)
  if (req.query && req.query.wacost) {
    const m = /^\d{4}-\d{2}$/.test(req.query.wacost) ? req.query.wacost : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date()).slice(0, 7);
    res.status(200).json({ month: m, cities: await require('./_lib/wa-cost').probe(m).catch((e) => ({ error: e.message })) });
    return;
  }
  if (req.query && req.query.wahealth) {
    const cfg = await WA.loadConfig().catch(() => ({}));
    const get = async (path, token, fields) => {
      const r = await fetch(WA.GRAPH + '/' + encodeURIComponent(path) + '?' + new URLSearchParams({ fields, access_token: token })).catch((e) => ({ ok: false, json: async () => ({ error: { message: e.message } }) }));
      const j = await r.json().catch(() => ({}));
      return j && j.error ? { error: String(j.error.message || 'eroare').replace(/\d{8,}/g, '…').slice(0, 200) } : j;
    };
    const out = {};
    for (const city of Object.keys((cfg && cfg.numbers) || {})) {
      const n = cfg.numbers[city] || {};
      if (!n.token || !n.phoneId) { out[city] = { error: 'numărul nu e conectat' }; continue; }
      const ph = await get(n.phoneId, n.token, 'health_status,status,quality_rating,messaging_limit_tier');
      let wb = n.wabaId ? await get(n.wabaId, n.token, 'name,currency,timezone_id,account_review_status,ownership_type,owner_business_info,on_behalf_of_business_info,primary_funding_id,purchase_order_number') : {};
      // some accesses may not read the payment fields: the rest still helps
      const fundingError = wb.error;
      if (wb.error && n.wabaId) wb = await get(n.wabaId, n.token, 'name,currency,timezone_id,account_review_status,ownership_type,owner_business_info,on_behalf_of_business_info');
      const hs = ph.health_status || {};
      out[city] = {
        account: wb.name || '', owner: (wb.owner_business_info || {}).name || '', links: req.query.wahealth === 'links' && n.wabaId ? { waba: String(n.wabaId), owner: String((wb.owner_business_info || {}).id || '') } : undefined, onBehalfOf: (wb.on_behalf_of_business_info || {}).name || undefined,
        ownership: wb.ownership_type, review: wb.account_review_status, currency: wb.currency || '(nesetată)', timezone: wb.timezone_id || '(nesetat)',
        paymentAttached: fundingError ? 'nu pot citi: ' + fundingError : !!wb.primary_funding_id,
        number: { status: ph.status, quality: ph.quality_rating, tier: ph.messaging_limit_tier, error: ph.error },
        canSend: hs.can_send_message || '?',
        entities: (hs.entities || []).map((e) => ({ type: e.entity_type, canSend: e.can_send_message,
          errors: (e.errors || []).map((x) => ({ code: x.error_code, what: x.error_description, fix: x.possible_solution })),
          info: e.additional_info })),
        error: wb.error,
      };
    }
    out.resend = await readJSON(require('./_lib/wa-resend-once').KEY, null).then((r) => r && { phase: r.phase, sent: r.sent, failed: r.failed, total: r.total, skipped: r.skipped, why: r.why, at: r.at }).catch(() => null);
    if (req.query.wahealth === 'todo') out.todo = await require('./_lib/wa-resend-once').todo().then((t) => ({ n: t.list.length, skipped: t.skipped, items: t.list.map((x) => ({ tpl: x.tpl.label, failedAt: x.msg.timestamp, appt: x.appt.date + ' ' + x.appt.time })) })).catch((e) => ({ error: e.message }));
    res.status(200).json(out);
    return;
  }
  // ?ig=1: where Instagram's and Facebook's messages stand (permissions, the Page's app, the webhooks; no token);
  // ?igsetup=1: the webhooks and the Page's app set for the messages (api/_lib/social-inbox.js setup), then the same
  // ?igimport=1: the Instagram and Messenger conversations from before the connection, brought into Mesaje once
  // (&ch=fb|ig, &after=<cursor> from the last answer's next, &pages=N: a few pages a call)
  if (req.query && req.query.igimport) { res.status(200).json(await require('./_lib/social-inbox').backfill({ channel: req.query.ch || '', after: req.query.after || '', maxPages: Math.min(5, Number(req.query.pages) || 1) }).catch((e) => ({ error: e.message }))); return; }
  if (req.query && (req.query.ig || req.query.igsetup)) {
    const SI = require('./_lib/social-inbox');
    const done = req.query.igsetup ? await SI.setup('https://admin.centrul360.com').catch((e) => ({ error: e.message })) : undefined;
    res.status(200).json({ setup: done, status: await SI.status({ newest: true }).catch((e) => ({ error: e.message })) });
    return;
  }
  // ?comments=1: the answers to the comments on posts and ads (api/_lib/social-comments.js): permissions, webhooks, the
  // switch and the last 10 (initials only); dm: the keyword guides sent in private, the last 7 days (api/_lib/content-dm.js)
  if (req.query && req.query.comments) {
    const SC = require('./_lib/social-comments');
    const [st, set, last, dm] = await Promise.all([require('./_lib/social-inbox').status().catch((e) => ({ error: e.message })), SC.settings(), SC.list(10),
      (async () => require('./_lib/content-dm').summary())().catch((e) => ({ error: e.message }))]);
    res.status(200).json({ on: set.on, status: st.error ? { error: st.error } : st.comments, last: last.map((c) => ({ id: c.id, channel: c.channel, from: SC.initials(c.from && c.from.name),
      text: String(c.text || '').replace(PHONE, '…'), state: c.state, reply: c.reply || '', why: c.why || '', at: c.at, repliedAt: c.repliedAt || '', tries: c.tries || 0 })), dm });
    return;
  }
  // ?content=1: Conținut (api/_lib/content.js): the settings, this week's and next week's batch (need, have, missing,
  // the owner's review), the items to redo, the entries per state, the next 5 planned, the last 5 posted with their
  // numbers, the permissions the posting needs, the insights in counts (no names)
  if (req.query && req.query.content) {
    const C = require('./_lib/content');
    const [list, status, access] = await Promise.all([C.items(), C.status(), require('./_lib/content-post').access(true).catch((e) => ({ error: e.message }))]);
    const rows = [];
    list.forEach((it) => (it.plan || []).forEach((e) => rows.push({ id: it.id, kind: it.kind, rubric: it.rubric, topic: it.topic, review: it.review || 'pending', net: e.net, at: e.at, state: e.state, url: e.url || '', error: e.error || '', hold: e.hold || '', stats: (it.stats || {})[e.net] || null, postedAt: e.postedAt || '' })));
    const next = rows.filter((r) => r.state === 'planned' || r.state === 'todo' || r.state === 'posting').sort((a, b) => a.at.localeCompare(b.at)).slice(0, 5).map((r) => ({ net: r.net, at: r.at, rubric: r.rubric, kind: r.kind, state: r.state, review: r.review, hold: r.hold || undefined }));
    const last = rows.filter((r) => r.state === 'posted').sort((a, b) => (b.postedAt || b.at).localeCompare(a.postedAt || a.at)).slice(0, 5).map((r) => ({ net: r.net, at: r.postedAt || r.at, rubric: r.rubric, kind: r.kind, url: r.url, stats: r.stats }));
    const errors = rows.filter((r) => r.state === 'error').slice(-5).map((r) => ({ net: r.net, at: r.at, rubric: r.rubric, error: r.error }));
    const wk = (w) => ({ week: w.week, n: w.n, need: w.need, have: w.have, missing: w.missing, approved: w.approved, pending: w.pending, redo: w.redo, drafts: w.drafts, short: w.short });
    // what the machine learned, the ideas waiting, next week's moments, the winners to make again, the last followers
    const L = require('./_lib/content-learn');
    const [growth, lst] = await Promise.all([L.growth(), L.readState ? L.readState() : null]);
    res.status(200).json({ settings: { on: status.on, nets: status.nets, times: status.times, photoTime: status.photoTime, startWeek: status.startWeek }, counts: status.counts,
      current: wk(status.current), nextWeek: wk(status.next), redo: status.redo.map((r) => ({ id: r.id, kind: r.kind, week: r.week, rubric: r.rubric, replacing: r.replacing })), drafts: status.drafts.length,
      access: access.error ? { error: access.error } : { connected: access.connected, instagram: !!access.igId, missing: access.missing,
        yt: access.yt ? { connected: !!access.yt.connected, configured: !!access.yt.configured, missing: access.yt.missing || [], lost: access.yt.lost || '' } : null,
        tt: access.tt ? { connected: !!access.tt.connected, configured: !!access.tt.configured, missing: access.tt.missing || [], lost: access.tt.lost || '' } : null }, next, last, errors,
      learn: { n: status.learn.n, rubrics: status.learn.rubrics, hooks: status.learn.hooks, hours: status.learn.hours }, ideas: status.ideas.length,
      season: status.season.map((x) => x.id), recycle: status.recycle.length, growth: growth.slice(-3), learnState: lst,
      // the insights in counts: snapshots, deep numbers, „Merge tare” this week, the last analysis, the voice, the audience, the month's funnel
      insights: await require('./_lib/content-insights').summary().catch((e) => ({ error: e.message })) });
    return;
  }
  // ?nuki=1: Nuki (api/portal-nuki.js) answers a sample question with the real offers and free hours
  // ?nuki=edit: the owner's edits, end to end without saving: Nuki reads a sheet and proposes a change (nothing is applied)
  // ?nuki=guide: the portal questions per role through the real chat, and whether the button is the right place (16.11;
  //   &role=<role> one role only, &texts=1 the failed answers' text too); read only, about 40 short answers
  if (req.query && req.query.nuki) {
    const N = require('./portal-nuki');
    res.status(200).json(req.query.nuki === 'edit' ? await N.pingEdit(req.query.q) : req.query.nuki === 'guide' ? await N.pingGuide({ role: req.query.role, texts: !!req.query.texts }) : await N.ping());
    return;
  }
  // ?voice=1: the newest stored voice note written out now by Gemini (api/_lib/media-read.js), nothing saved; only its
  // length in characters, the time, ok or the error, and the last 7 days' voice notes in counts. Never the text.
  if (req.query && req.query.voice) { res.status(200).json(await require('./_lib/media-read').probe().catch((e) => ({ ok: false, error: String((e && (e.code || e.name)) || 'error').slice(0, 60) }))); return; }
  // ?sitebook=1: where the site's own bookings come from (the owner, 13.11: „de unde vin toate?”). The site keeps no
  // source with a booking, so for each one: the page it was made on, what we had of her before it (a lead from an ad
  // form or the site's quiz, an earlier appointment, a WhatsApp talk, a message of ours with the site's link). No phones,
  // no names in the answer.
  if (req.query && req.query.sitebook) {
    const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
    const [appts, leads, convos, tdoc] = await Promise.all([readJSON('data/appointments.json', []), readJSON('data/leads.json', []), readJSON('data/whatsapp-conversations.json', []), WT.load()]);
    const label = (id) => ((tdoc.templates || []).find((t) => t.id === id) || {}).label || '';
    const site = appts.filter((a) => a && a.createdBy === 'site').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const ro = (iso) => new Date(iso).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const linkTpls = (tdoc.templates || []).filter((t) => /centrul360\.com/i.test([t.header, t.body, t.footer, JSON.stringify(t.buttons || [])].join(' '))).map((t) => t.label);
    const rows = site.map((a) => {
      const k = d9(a.clientPhone), at = String(a.createdAt || '');
      const hers = leads.filter((l) => d9(l.phone) === k);
      const before = hers.filter((l) => String(l.createdAt || '') < at).sort((x, y) => String(x.createdAt).localeCompare(String(y.createdAt)));
      const forms = [].concat(...hers.map((l) => (l.forms || (l.form ? [l.form] : [])))).filter((f) => f && (f.sentAt || '') < at);
      const prior = appts.filter((b) => b.id !== a.id && d9(b.clientPhone) === k && String(b.createdAt || b.date) < at && !b.block);
      const c = convos.find((x) => d9(x.phone) === k);
      const msgs = ((c && c.messages) || []).filter((m) => String(m.timestamp || '') < at);
      const links = msgs.filter((m) => m.direction === 'out' && /centrul360\.com/i.test(String(m.text || '')));
      return {
        made: ro(at), from: a.src ? a.src.from : '', src: a.src || null, city: a.location, treatment: a.treatment, status: a.status, page: (String(a.note || '').split(' · ').slice(-1)[0] || '').replace('Programare online pe site', ''),
        lead: before.length ? { source: before[0].source, since: ro(before[0].createdAt), by: before[0].createdBy || '' } : null,
        forms: forms.map((f) => ({ campaign: f.campaign || '', ad: f.ad || '', form: f.name || '', at: f.sentAt ? ro(f.sentAt) : '' })).slice(-3),
        earlierAppts: prior.length, earlierBy: [...new Set(prior.map((b) => b.createdBy === 'site' ? 'site' : b.ghlId ? 'ghl' : 'portal'))],
        waIn: msgs.filter((m) => m.direction === 'in').length, waOut: msgs.filter((m) => m.direction === 'out').length,
        linkSent: links.length ? { at: ro(links[links.length - 1].timestamp), tpl: label(links[links.length - 1].templateId) || (links[links.length - 1].auto ? 'automat' : 'scris de mână') } : null,
      };
    });
    res.status(200).json({ n: rows.length, linkTemplates: linkTpls, rows });
    return;
  }
  // ?outdocs=1: the newest documents the clinic sent from Mesaje, as stored (size, pages, whether the PDF ends properly),
  // to tell a file cut short on the way from one sent whole (13.11: „i s-a trimis doar o pagină din catalog”). No phones.
  if (req.query && req.query.outdocs) {
    const { readBinary } = require('./_lib/store');
    const convos = await readJSON('data/whatsapp-conversations.json', []);
    const docs = [];
    convos.forEach((c) => (c.messages || []).forEach((m) => { if (m && m.direction === 'out' && m.media && m.media.kind === 'document') docs.push(m); }));
    docs.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
    const out = [];
    for (const m of docs.slice(0, 6)) {
      const md = m.media;
      let buf = null;
      try { buf = md.path ? await readBinary(md.path) : null; } catch (e) { buf = null; }
      const txt = buf ? buf.toString('latin1') : '';
      out.push({ at: m.timestamp, filename: md.filename || '', how: md.path ? 'stored' : md.href ? 'href' : '-', status: m.status || '', error: m.error || undefined,
        kb: buf ? Math.round(buf.length / 1024) : null, pages: buf ? (txt.match(/\/Type\s*\/Page[^s]/g) || []).length : null,
        count: buf ? ((txt.match(/\/Count\s+(\d+)/g) || []).map((x) => +x.replace(/\D/g, '')).sort((a, b) => b - a)[0] || null) : null,
        ends: buf ? /%%EOF\s*$/.test(txt.slice(-64)) : null });
    }
    res.status(200).json({ docs: out });
    return;
  }
  // ?staff=1: who a site booking goes to in each city (api/_lib/booking.js soleCosmetician), first names only, and the
  // site bookings ahead still on no one; &fill=1 puts those on the city's only cosmetician (the owner, 13.11: Arad → Andrea)
  if (req.query && req.query.staff) {
    const B = require('./_lib/booking');
    const { writeJSON } = require('./_lib/store');
    const cfg = await B.settings({ team: true });
    const first = (p) => (p ? String(p.name || '').split(/\s+/)[0] : '');
    let appts = await readJSON('data/appointments.json', []);
    const today = B.roNow().date;
    const open = (a) => a && a.createdBy === 'site' && !a.cosmeticianId && a.date >= today && !['anulata', 'concediu', 'finalizata'].includes(a.status) && !a.block;
    let filled = 0;
    if (req.query.fill) {
      const plan = appts.filter(open).map((a) => ({ id: a.id, who: B.soleCosmetician(cfg, a.location, a.date, a.time, appts) })).filter((x) => x.who);
      if (plan.length) {
        const list = await readJSON('data/appointments.json', []);
        plan.forEach((x) => { const row = list.find((a) => a.id === x.id); if (row && open(row)) { row.cosmeticianId = x.who.id; row.cosmeticianName = x.who.name; row.updatedAt = new Date().toISOString(); filled++; } });
        if (filled) await writeJSON('data/appointments.json', list);
        appts = list;
      }
    }
    const team = cfg.team.people;
    const out = CITIES.map((city) => {
      const days = B.days(cfg, city, 30, appts).filter((d) => d.slots.length).slice(0, 5);
      return {
        city, cosmeticians: team.filter((p) => p.location === city).map(first), schedule: require('./_lib/team-schedule').hasSchedule(cfg.team.doc, city, cfg.team.ids),
        goesTo: days.map((d) => ({ date: d.date, at: d.slots[0], who: first(B.soleCosmetician(cfg, city, d.date, d.slots[0], appts)) || null })),
        unassignedAhead: appts.filter((a) => open(a) && a.location === city).length,
      };
    });
    res.status(200).json({ noLocation: team.filter((p) => !p.location).length, filled, cities: out });
    return;
  }
  // ?roas=1&period=max|30d|7d: per ad, the spend since the forms are counted and what came after (bookings, clients,
  // payments), the same numbers as Reclame (api/ads-manager.js withFunnel): ROAS = payments / spend
  if (req.query && req.query.roas) {
    const AM = require('./ads-manager'), MA = require('./_lib/meta-ads');
    const { conn, problem } = await AM.connection();
    if (problem) { res.status(200).json({ problem }); return; }
    const D = /^\d{4}-\d{2}-\d{2}$/;
    const range = D.test(String(req.query.since || '')) && D.test(String(req.query.until || '')) ? { since: req.query.since, until: req.query.until } : null;
    const period = range ? 'custom' : MA.PERIODS[req.query.period] ? req.query.period : 'max';
    const recent = await MA.recentCampaigns(conn);
    const view = await MA.overview(conn, period, range, recent.ids || []);
    if (view.error) { res.status(200).json({ error: view.error }); return; }
    await AM.withFunnel(view, period, range, conn);
    const rows = [];
    view.campaigns.forEach((c) => c.adsets.forEach((st) => st.ads.forEach((a) => rows.push({ spendP: a.spend != null ? a.spend : null, leadsP: a.leads != null ? a.leads : null, campaign: c.name, campaignId: c.id, cStatus: (c.status || '') + '/' + (c.effective || ''), cDaily: c.daily || null, adsetId: st.id, sStatus: (st.status || '') + '/' + (st.effective || ''), sDaily: st.daily || null, ad: a.name, adId: a.id, status: (a.status || '') + '/' + (a.effective || ''), spend: a.spendNew, leads: a.pLeads, booked: a.booked, showed: a.showed, clients: a.clients, revenue: a.revenue, roas: a.spendNew ? Math.round((a.revenue / a.spendNew) * 100) / 100 : null }))));
    const g = await readJSON('data/ads-guard.json', {}).catch(() => ({}));
    const guard = ((g && g.log) || []).slice(-15).map((e) => ({ at: e.at, type: e.type || '', campaign: e.campaignName || '', ad: e.adName || '', why: String(e.why || '').slice(0, 140) }));
    res.status(200).json({ since: view.since, period, spendNote: view.spendNote || '', guard, rows });
    return;
  }
  // ?sales=1&month=YYYY-MM&q=<words>: the money received (Încasări, source 'incasare') that month, matching the words in
  // the treatment, per treatment and city (no names), read only
  if (req.query && req.query.sales) {
    const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? req.query.month : new Date().toISOString().slice(0, 7);
    const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const words = fold(req.query.q).split(/[\s,]+/).filter(Boolean);
    const all = (await readJSON('data/sales.json', [])).filter((x) => x && x.source === 'incasare' && x.status !== 'rejected' && String(x.date || '').startsWith(month));
    const hit = all.filter((x) => words.every((w) => fold(x.treatment).includes(w)));
    const by = {}; hit.forEach((x) => { const k = (x.treatment || '-') + ' | ' + (x.location || '-'); by[k] = by[k] || { n: 0, lei: 0 }; by[k].n++; by[k].lei += Number(x.amount) || 0; });
    res.status(200).json({ month, words, total: hit.reduce((n, x) => n + (Number(x.amount) || 0), 0), count: hit.length, monthTotal: all.reduce((n, x) => n + (Number(x.amount) || 0), 0), by });
    return;
  }
  // ?trace=1: per lead from an ad form in these days, why Reclame counts her booked / came (no name, no phone)
  if (req.query && req.query.trace) {
    const F = require('./_lib/ads-funnel');
    const [allLeads, allAppts, allSales, stages] = await Promise.all([readJSON('data/leads.json', []), readJSON('data/appointments.json', []), readJSON('data/sales.json', []), readJSON('data/pipeline-stages.json', null)]);
    // exactly what Reclame counts (api/ads-manager.js withFunnel)
    const START = require('./_lib/kpi').cfg.start, at = (x) => Date.parse(x) || 0;
    const leads = allLeads.filter((l) => at(l.createdAt) >= START || (l.activities || []).some((a) => a.type === 'returned' && at(a.at) >= START));
    const appts = allAppts.filter((a) => at(a.createdAt) >= START && a.createdBy !== 'highlevel' && !a.importedAt && !a.ghlId);
    const fresh = new Set(appts.map((a) => a.id));
    const sales = allSales.filter((x) => (x.appointmentId ? fresh.has(x.appointmentId) : at(x.createdAt || x.date) >= START));
    const until = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10), since = new Date(Date.now() - (days - 1) * 864e5 + 3 * 3600e3).toISOString().slice(0, 10);
    const trace = [];
    F.funnel({ leads, appointments: appts, sales, stages: Array.isArray(stages) && stages.length ? stages : await require('./portal-leads').loadStages(), ads: [], period: 'custom', range: { since, until }, trace });
    res.status(200).json({ since, until, leads: trace.filter((t) => !req.query.ad || t.campaign.includes(String(req.query.ad)) || t.ad.includes(String(req.query.ad))) });
    return;
  }
  const since = Date.now() - days * 864e5;
  const recent = (t) => Date.parse(t || '') > since;
  try {
    const [leads, stagesRaw, offers, wt, cfg, wfDoc, runsDoc, convos] = await Promise.all([
      readJSON('data/leads.json', []), readJSON('data/pipeline-stages.json', null), loadOffers(readJSON), WT.load(), WA.loadConfig(),
      readJSON('data/workflows.json', {}), readJSON('data/workflow-runs.json', {}), readJSON('data/whatsapp-conversations.json', []),
    ]);
    const stages = Array.isArray(stagesRaw) && stagesRaw.length ? stagesRaw : [];
    const stageName = (id) => (stages.find((s) => s.id === id) || { name: id || '-' }).name;
    const tpls = wt.templates || [];
    const tplById = new Map(tpls.map((t) => [t.id, t]));
    const statusFor = (t, city) => { const n = (cfg.numbers || {})[city] || {}; return t && n.wabaId && t.meta && t.meta[n.wabaId] ? t.meta[n.wabaId].status : (t ? 'netrimis la Meta' : 'lipsă'); };

    // 1. the new leads: their column now, their source, the welcome message
    const fresh = (Array.isArray(leads) ? leads : []).filter((l) => recent(l.createdAt));
    const out = { days, at: new Date().toISOString(), leads: { total: fresh.length, byStage: {}, bySource: {}, byOffer: {} }, welcome: { sent: 0, notSent: {}, noMessage: 0 } };
    fresh.forEach((l) => { inc(out.leads.byStage, stageName(l.stage)); inc(out.leads.bySource, l.source || '-'); inc(out.leads.byOffer, l.interest || '-'); });
    (Array.isArray(leads) ? leads : []).forEach((l) => (l.activities || []).forEach((a) => {
      if (!recent(a.at) || a.author !== 'WhatsApp automat') return;
      const t = String(a.text || '');
      if (/^WhatsApp de bun venit trimis/.test(t)) out.welcome.sent++;
      else if (/^Mesajul de bun venit n-a plecat:/.test(t)) inc(out.welcome.notSent, t.replace(/^Mesajul de bun venit n-a plecat:\s*/, '').replace(PHONE, '…').slice(0, 160));
    }));
    out.welcome.noMessage = fresh.filter((l) => ['facebook', 'site'].includes(l.source) && !(l.activities || []).some((a) => a.author === 'WhatsApp automat')).length;

    // 2. every ads offer: its new-lead template per city, approved or not
    out.welcomeTemplates = offers.filter((o) => o.ads && o.active !== false).map((o) => {
      const cities = [...new Set((o.locations || []).map(cityOfLoc))];
      const mine = tpls.filter((t) => (t.leadOffers || []).includes(o.key));
      return { offer: o.title, key: o.key, cities: Object.fromEntries(cities.map((c) => [c, mine.length ? mine.map((t) => t.label + ': ' + statusFor(t, c)).join(' · ') : 'niciun mesaj de bun venit'])) };
    });
    const site = tpls.filter((t) => (t.leadOffers || []).includes('site'));
    out.welcomeTemplates.push({ offer: 'Lead de pe site', key: 'site', cities: Object.fromEntries(CITIES.map((c) => [c, site.length ? site.map((t) => t.label + ': ' + statusFor(t, c)).join(' · ') : 'niciun mesaj de bun venit'])) });

    // 3. the booking flows and what their runs did
    const flows = (wfDoc.workflows || []).filter((w) => w.trigger && /^appointment_/.test(w.trigger.type));
    const walk = (list, acc) => { (list || []).forEach((s) => { if (s.type === 'whatsapp' && s.templateId) acc.push(s.templateId); if (s.type === 'if') { walk(s.yes, acc); walk(s.no, acc); (s.more || []).forEach((b) => walk(b.steps, acc)); } }); return acc; };
    out.reminders = flows.map((w) => {
      const ids = [...new Set(walk(w.steps, []))];
      const runs = (runsDoc.runs || []).filter((r) => r.wf === w.id && recent(r.updatedAt || r.createdAt));
      const did = { runs: runs.length, sent: 0, notSent: {}, skipped: 0, statuses: {} };
      runs.forEach((r) => { inc(did.statuses, r.status || '-'); (r.log || []).forEach((x) => {
        if (!recent(x.at)) return;
        const t = String(x.text || '');
        if (/^WhatsApp de pe /.test(t)) did.sent++;
        else if (/mesajul n-a plecat$/.test(t)) inc(did.notSent, t.replace(/, mesajul n-a plecat$/, '').replace(PHONE, '…').slice(0, 160));
        else if (/^Sărit|e sărit/.test(t)) did.skipped++;
      }); });
      return { flow: w.name, active: !!w.active, trigger: w.trigger.type, templates: ids.map((id) => { const t = tplById.get(id); return (t ? t.label : id) + ': ' + CITIES.map((c) => c + ' ' + statusFor(t, c)).join(', '); }), last: did };
    });

    // 4. what Meta said about every template message sent
    const delivery = {};
    const timeline = [];
    (Array.isArray(convos) ? convos : []).forEach((c) => (c.messages || []).forEach((m) => {
      if (m.direction !== 'out' || m.type !== 'template' || !recent(m.timestamp)) return;
      const t = tplById.get(m.templateId);
      const k = t ? t.label : 'alt șablon';
      const d = delivery[k] = delivery[k] || { sent: 0, delivered: 0, read: 0, failed: 0, why: {} };
      d.sent++;
      // ?wa=1: the template messages one by one, newest first (time, template, status, Meta's reason), no name or phone
      if (req.query && req.query.wa) timeline.push({ at: m.timestamp, template: k, status: m.status || '-', why: m.status === 'failed' ? String(m.error || m.errorCode || '').slice(0, 120) : undefined });
      if (m.status === 'failed') { d.failed++; inc(d.why, String(m.error || m.errorCode || 'nelivrat').slice(0, 120)); }
      else if (m.status === 'read') { d.read++; d.delivered++; }
      else if (m.status === 'delivered') d.delivered++;
    }));
    out.delivery = delivery;
    if (req.query && req.query.wa) out.timeline = timeline.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60);
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
};

// ?verify=1: the numbers the owner pays and plans by, each one as production counts it and again by a second, separate
// reading written from the definitions (it calls none of the production formulas), with `agree`. Counts, shares and lei
// totals only: never a name, a phone, an id or a client's record (a cosmetician is TM1, AR2… by her clinic, highest lei a
// day first). Writes nothing of its own (the euro rate and Meta's spend may refresh their caches, as Costuri lunare does).
//   visits    the last 60 days per clinic (from 17.10 at the earliest): due / came / no-show, the calendar's target
//   month     per clinic: the cosmeticians in the bonus condition and over 1.500 lei a day worked, consultations with an
//             upsell or package within 7 days, the collections
//   checks    what could bend the numbers: HighLevel bookings marked finished in the window, „reprogramată” left on a
//             passed day, records without a clinic, etc.
async function verifyNumbers(monthQ) {
  const CL = require('./_lib/clinic'), K = require('./_lib/kpi'), MP = require('./_lib/manager-pay');
  const [appts, sales, clients, emps, attendance] = await Promise.all([readJSON('data/appointments.json', []), readJSON('data/sales.json', []),
    readJSON('data/clients.json', []), readJSON('data/employees.json', []), readJSON('data/attendance.json', [])]);
  // ---------------------------------------------------------------- the second reading (own helpers only)
  const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const ro = (ms) => { const p = {}; FMT.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; }); return { day: p.year + '-' + p.month + '-' + p.day, min: (+p.hour % 24) * 60 + +p.minute }; };
  const shift = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const clinic = (s) => { const t = plain(s); return t.includes('arad') ? 'Arad' : t.includes('timi') ? 'Timișoara' : ''; };
  const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
  const hm = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null; };
  const round2 = (n) => Math.round(n * 100) / 100;
  const nowRo = ro(Date.now()), today = nowRo.day;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthQ || '')) && monthQ <= today.slice(0, 7) ? monthQ : today.slice(0, 7);
  const mFrom = month + '-01';
  const mLast = (() => { const [y, m] = month.split('-').map(Number); return month + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0'); })();
  const mTo = mLast < today ? mLast : today;
  const home = new Map(emps.filter(Boolean).map((e) => [e.id, clinic(e.location)]));
  const phoneOfClient = new Map(clients.filter(Boolean).map((c) => [c.id, last9(c.phone)]));
  const apptById = new Map(appts.filter(Boolean).map((a) => [a.id, a]));
  const apptClinic = (a) => clinic(a.location) || home.get(a.cosmeticianId) || '';
  const saleClinic = (s) => { if (clinic(s.location)) return clinic(s.location); const a = s.appointmentId && apptById.get(s.appointmentId); return (a && apptClinic(a)) || home.get(s.performedBy) || ''; };
  const keysOf = (clientId, phone, name) => {
    const out = []; if (clientId) out.push('c:' + clientId);
    const p = last9(phone) || phoneOfClient.get(clientId) || ''; if (p.length === 9) out.push('p:' + p);
    const n = plain(name).trim().replace(/\s+/g, ' '); if (n) out.push('n:' + n);
    return out;
  };
  // every money row (a refund, 16.11: a row of its own with a minus sum, in the sums) and the payments alone (a refund is
  // never a visit, a day worked or a package)
  const pays = sales.filter((s) => s && s.source === 'incasare' && /^\d{4}-\d{2}-\d{2}$/.test(String(s.date || '')));
  const paysIn = pays.filter((s) => s.kind !== 'refund');
  const first = shift(ro(K.cfg.start).day, 1); // the portal's first whole day (17.10)
  const wFrom = shift(today, -60) < first ? first : shift(today, -60), wTo = shift(today, -1);
  const paidAt = new Set(); // clinic|key|day
  paysIn.forEach((s) => { const c = saleClinic(s); keysOf(s.clientId, s.clientPhone, s.client).forEach((k) => paidAt.add(c + '|' + k + '|' + s.date)); });
  const cameOf = (a, c) => a.status === 'finalizata' || !!a.paidSaleId || keysOf(a.clientId, a.clientPhone, a.clientName).some((k) => paidAt.has(c + '|' + k + '|' + a.date));
  // late: HighLevel's no-show, or cancelled (cancelledAt) at or after its hour; a record without cancelledAt: from the
  // portal and made before the fix (16.11, 08:00 in Bucharest), its last change on the visit's own day at or after its hour; else ahead
  const atOrAfter = (ms, a, sameDay) => { if (!Number.isFinite(ms)) return false; const r = ro(ms), s = hm(a.time); return (!sameDay && r.day > a.date) || (r.day === a.date && (s == null || r.min >= s)); };
  const late = (a) => {
    if (a.noShow) return true;
    if (a.cancelledAt) return atOrAfter(Date.parse(a.cancelledAt), a, false);
    if (a.createdBy === 'highlevel' || a.ghlId || a.importedAt) return false;
    if (!(Date.parse(a.createdAt || '') < Date.parse('2026-11-16T06:00:00Z'))) return false;
    return atOrAfter(Date.parse(a.updatedAt || ''), a, true);
  };
  const isTest = (a) => /^\s*test\b/i.test(a.clientName || '');
  // KPI's „came” (any clinic, her card id or her phone as written on the booking and the payment)
  const paidKpi = new Set();
  paysIn.forEach((s) => { if (s.clientId) paidKpi.add('c|' + s.clientId + '|' + s.date); const p = last9(s.clientPhone); if (p.length === 9) paidKpi.add('p|' + p + '|' + s.date); });
  const cameKpi = (a) => a.status === 'finalizata' || !!a.paidSaleId || (!!a.clientId && paidKpi.has('c|' + a.clientId + '|' + a.date)) || (last9(a.clientPhone).length === 9 && paidKpi.has('p|' + last9(a.clientPhone) + '|' + a.date));
  const ghl = (a) => a.createdBy === 'highlevel' || !!a.ghlId || !!a.importedAt;
  const v2 = {}, checks = {};
  CITIES.forEach((city) => {
    const seen = new Map(), ex = { leave: 0, test: 0, cancelledAhead: 0, moved: 0, duplicate: 0 };
    const ck = { ghlInWindow: 0, ghlFinishedNoPay: 0, ghlFinishedAtImport: 0, finishedNoPay: 0, movedPassedNotCame: 0, lateCancelNoShow: 0, plainNoShow: 0, cameByPaymentOnly: 0, plainNoShowBy: { packageFlag: 0, clientHadPackage: 0, noPrice: 0, other: 0, paidOnALaterDay: 0, highLevel: 0 }, lateCancelBy: { noShowFlag: 0, highLevel: 0, highLevelChangedOnlyByImport: 0, automatic: 0, portal: 0, portalChangedDayAfterOrLater: 0 } };
    appts.forEach((a) => {
      if (!a || !a.date || a.date < wFrom || a.date > wTo || apptClinic(a) !== city) return;
      if (a.status === 'concediu' || a.block) { ex.leave++; return; }
      if (isTest(a)) { ex.test++; return; }
      const came = cameOf(a, city);
      if (ghl(a)) {
        ck.ghlInWindow++;
        if (a.status === 'finalizata' && !a.paidSaleId) { ck.ghlFinishedNoPay++; const imp = Date.parse(a.importedAt || a.createdAt || ''); if (Number.isFinite(imp) && ro(imp).day > a.date) ck.ghlFinishedAtImport++; }
      } else if (a.status === 'finalizata' && !a.paidSaleId) ck.finishedNoPay++;
      if (came && a.status !== 'finalizata' && !a.paidSaleId) ck.cameByPaymentOnly++;
      if (a.status === 'anulata' && !came) {
        if (!late(a)) { ex.cancelledAhead++; return; }
        ck.lateCancelNoShow++;
        // what the „late” rests on: HighLevel's no-show, the cancellation's own time (cancelledAt, from 16.11), or the record's last change
        const lc = ck.lateCancelBy, upd = Date.parse(a.updatedAt || ''), imp = Date.parse(a.importedAt || '');
        if (a.noShow) lc.noShowFlag++;
        else if (ghl(a)) { lc.highLevel++; if (Number.isFinite(upd) && Number.isFinite(imp) && Math.abs(upd - imp) < 120e3) lc.highLevelChangedOnlyByImport++; }
        else if (a.cancelledAt) lc.cancelledAt = (lc.cancelledAt || 0) + 1;
        else if (/^Automat/.test(String(a.statusBy || ''))) lc.automatic++;
        else { lc.portal++; const start = Date.parse(a.date + 'T' + (a.time || '12:00') + ':00Z') - 2 * 3600e3; if (Number.isFinite(upd) && upd - start > 864e5) lc.portalChangedDayAfterOrLater++; }
      }
      // „reprogramată” left on a passed day without her: a no-show (stays in due), counted apart
      if (a.status === 'reprogramata' && !came) { ex.moved++; ck.movedPassedNotCame++; }
      if (!came && a.status !== 'anulata' && a.status !== 'reprogramata') {
        ck.plainNoShow++;
        // a passed booking left „programată” / „confirmată” with no payment: a no-show, or a package session nobody closed?
        const pb = ck.plainNoShowBy, ks = keysOf(a.clientId, a.clientPhone, a.clientName);
        const pkgBefore = paysIn.some((s) => (Number(s.upsell) > 0 || Number(s.packageTotal) > 0 || s.dueId) && s.date <= a.date && keysOf(s.clientId, s.clientPhone, s.client).some((k) => ks.includes(k)));
        if (a.package) pb.packageFlag++; else if (pkgBefore) pb.clientHadPackage++; else if (!(Number(a.amount) > 0)) pb.noPrice++; else pb.other++;
        if (paysIn.some((s) => s.date > a.date && keysOf(s.clientId, s.clientPhone, s.client).some((k) => ks.includes(k)))) pb.paidOnALaterDay++;
        if (ghl(a)) pb.highLevel++;
      }
      const k = (keysOf(a.clientId, a.clientPhone, a.clientName)[0] || 'id:' + a.id) + '|' + a.date + '|' + plain(a.treatment).trim();
      if (seen.has(k)) { ex.duplicate++; if (came) seen.set(k, true); return; }
      seen.set(k, came);
    });
    // a booking moved after its day had passed without her (missedOn): that day stays a no-show
    appts.forEach((a) => {
      if (!a || apptClinic(a) !== city || !Array.isArray(a.missedOn) || a.block || isTest(a)) return;
      a.missedOn.forEach((d) => {
        if (d < wFrom || d > wTo || d === a.date) return;
        const came = cameOf(Object.assign({}, a, { date: d, status: 'programata', paidSaleId: '' }), city);
        const k = (keysOf(a.clientId, a.clientPhone, a.clientName)[0] || 'id:' + a.id) + '|' + d + '|' + plain(a.treatment).trim();
        if (seen.has(k)) { ex.duplicate++; if (came) seen.set(k, true); return; }
        ex.moved++; ck.movedPassedNotCame++;
        seen.set(k, came);
      });
    });
    const due = seen.size, came = [...seen.values()].filter(Boolean).length;
    v2[city] = { due, came, excluded: ex };
    checks[city] = ck;
  });
  const both = { due: v2['Timișoara'].due + v2.Arad.due, came: v2['Timișoara'].came + v2.Arad.came };
  CITIES.forEach((city) => {
    const v = v2[city], base = v.due >= 20 ? v : both.due >= 20 ? both : null;
    v.from = v.due >= 20 ? 'clinic' : base ? 'both' : 'default';
    v.noShowPct = base ? Math.round(100 - (base.came / base.due) * 100) : null;
    v.target = base ? 100 + v.noShowPct : 150;
  });
  // the month: cosmeticians, consultations, collections
  const m2 = {};
  CITIES.forEach((city) => {
    const people = emps.filter((e) => e && e.role === 'cosmetician' && clinic(e.location) === city).filter((e) => {
      if (e.active !== false) return true;
      const leftMonth = /^\d{4}-\d{2}-\d{2}$/.test(String(e.leftAt || '')) ? e.leftAt.slice(0, 7) : '2026-11';
      return month < leftMonth;
    }).map((e) => {
      const mine = pays.filter((s) => s.performedBy === e.id && s.date >= mFrom && s.date <= mTo);
      const lei = mine.reduce((n, s) => n + (Number(s.amount) || 0), 0);
      const daySet = new Set(attendance.filter((x) => x && x.employeeId === e.id && x.checkIn && x.date >= mFrom && x.date <= mTo).map((x) => x.date));
      mine.filter((s) => s.kind !== 'refund').forEach((s) => daySet.add(s.date));
      return { e, days: daySet.size, lei, trainee: e.trainedOfficial === false };
    }).filter((p) => p.e.active !== false || p.days > 0);
    const inCond = people.filter((p) => !p.trainee && p.days > 0);
    // the consultations she came to (KPI's rule: finished, paid, or a payment that day with her card id or her phone)
    const passed = appts.filter((a) => a && a.status !== 'anulata' && a.status !== 'concediu' && !a.block && plain(a.treatment).includes('consulta') && apptClinic(a) === city &&
      a.date >= mFrom && a.date <= mTo && a.date <= today);
    const consult = passed.filter(cameKpi);
    const pkg = pays.filter((s) => Number(s.upsell) > 0 || Number(s.packageTotal) > 0);
    const match = (a, s) => (a.clientId && s.clientId && a.clientId === s.clientId) || (last9(a.clientPhone).length === 9 && s.clientPhone && last9(s.clientPhone) === last9(a.clientPhone)) ||
      (!a.clientId && a.clientName && s.client && plain(a.clientName).replace(/\s+/g, ' ').trim() === plain(s.client).replace(/\s+/g, ' ').trim());
    const withUp = consult.filter((a) => pkg.some((s) => match(a, s) && s.date >= a.date && s.date <= shift(a.date, 7)));
    const collected = pays.filter((s) => saleClinic(s) === city && s.date >= mFrom && s.date <= mTo).reduce((n, s) => n + (Number(s.amount) || 0), 0);
    m2[city] = { people, inCond, consults: consult.length, withUpsell: withUp.length, consultsNotCame: passed.filter((a) => !cameKpi(a)).length, consultsNotCameByStatus: passed.filter((a) => !cameKpi(a)).reduce((o, a) => { o[a.status || '-'] = (o[a.status || '-'] || 0) + 1; return o; }, {}), collected: round2(collected) };
  });

  // ---------------------------------------------------------------- production
  const N = CL.normalize({ leads: [], appts, sales, convos: [], emps });
  const tg = CL.fillTargets(N.appts, N.sales, CITIES, today, clients);
  const M = K.model({ leads: [], appointments: N.appts, sales: N.sales, clients, conversations: [] });
  const out = { at: new Date().toISOString(), today, window: { from: wFrom, to: wTo, days: Math.round((Date.parse(wTo) - Date.parse(wFrom)) / 864e5) + 1, asked: 60, firstDay: first }, month: { month, from: mFrom, to: mTo }, cities: {} };
  CITIES.forEach((city) => {
    const p = tg[city], v = v2[city], vs = CL.visitStats(N.appts, N.sales, city, today, 60, clients);
    // the KPI page's own show rate (bookings made in the portal from START on), over the same window, for comparison
    const kv = M.A.filter((a) => a.fresh && a.city === city && a.date >= wFrom && a.date <= wTo && a.due);
    // the cosmeticians: the Manager page (clinic.js cosmeticians) and the pay (manager-pay.js conditionOf)
    const team = CL.cosmeticians(emps, N.sales, attendance, city, mFrom, mTo, N.appts).filter((x) => x.days > 0 && !x.trainee);
    const cond = MP.conditionOf(emps, sales, attendance, [city], month, mTo);
    const condPeople = cond.people.filter((x) => x.days > 0);
    const mm = m2[city];
    const pageOk = new Set(team.filter((x) => x.ok).map((x) => x.id)), payOk = new Set(condPeople.filter((x) => x.ok).map((x) => x.id));
    const rows = mm.people.filter((x) => x.days > 0).sort((a, b) => b.lei / b.days - a.lei / a.days).map((x, i) => {
      const exact = x.lei / x.days, pg = team.find((t) => t.id === x.e.id), py = condPeople.find((t) => t.id === x.e.id);
      return { label: (city === 'Arad' ? 'AR' : 'TM') + (i + 1), days: x.days, perDay: Math.round(exact), trainee: x.trainee, over1500: exact > 1500, edge: Math.abs(exact - 1500) <= 15,
        managerPage: pg ? { days: pg.days, perDay: pg.perDay, ok: pg.ok } : null, pay: py ? { days: py.days, perDay: py.perDay, ok: py.ok } : x.trainee ? 'în formare (în afara condiției)' : null };
    });
    const cons = CL.consults(N.appts, N.sales, city, mFrom, mTo);
    const prodColl = round2(N.sales.filter((s) => s && s.source === 'incasare' && s.location === city && s.date >= mFrom && s.date <= mTo).reduce((n, s) => n + (Number(s.amount) || 0), 0));
    const payColl = MP.collectionsOf(sales, appts, emps, [city], month, mTo);
    const kpiColl = round2(M.P.filter((x) => x.counts && x.city === city && x.day >= mFrom && x.day <= mTo).reduce((n, x) => n + x.amount, 0));
    out.cities[city] = {
      visits60: {
        production: { due: vs.due, came: vs.came, noShow: vs.noShow, from: vs.from, to: vs.to, excluded: vs.excluded, target: p.target, noShowPct: p.noShow, targetFrom: p.from },
        second: { due: v.due, came: v.came, noShow: v.due - v.came, excluded: v.excluded, target: v.target, noShowPct: v.noShowPct, targetFrom: v.from },
        agree: vs.due === v.due && vs.came === v.came && p.target === v.target,
        kpiPageShowRate: { due: kv.length, came: kv.filter((a) => a.came).length, note: 'Panou → KPI „au venit”: doar programările făcute în portal (aceleași reguli: „reprogramată” trecută e neprezentare)' },
        checks: checks[city],
      },
      month: {
        cosmeticians: {
          second: { inCondition: mm.inCond.length, over1500: mm.inCond.filter((x) => x.lei / x.days > 1500).length, trainees: mm.people.filter((x) => x.trainee && x.days > 0).length, conditionMet: mm.inCond.length > 0 && mm.inCond.every((x) => x.lei / x.days > 1500) },
          managerPage: { counted: team.length, ok: pageOk.size, conditionMet: team.length > 0 && team.every((x) => x.ok) },
          pay: { counted: condPeople.length, ok: payOk.size, trainees: cond.training.length, conditionMet: cond.ok },
          agreePay: condPeople.length === mm.inCond.length && payOk.size === mm.inCond.filter((x) => x.lei / x.days > 1500).length && cond.ok === (mm.inCond.length > 0 && mm.inCond.every((x) => x.lei / x.days > 1500)),
          agreeManagerPage: team.length === mm.inCond.length && pageOk.size === mm.inCond.filter((x) => x.lei / x.days > 1500).length,
          rows,
        },
        consults: { production: { total: cons.total, withUpsell: cons.withPackage, pct: cons.pct }, second: { total: mm.consults, withUpsell: mm.withUpsell, passedNotCame: mm.consultsNotCame, notCameByStatus: mm.consultsNotCameByStatus }, agree: cons.total === mm.consults && cons.withPackage === mm.withUpsell },
        collections: { production: prodColl, pay: payColl, kpi: kpiColl, second: mm.collected, agree: Math.abs(prodColl - mm.collected) < 0.01 && Math.abs(payColl - mm.collected) < 0.01 && Math.abs(kpiColl - mm.collected) < 0.01 },
      },
    };
  });
  // both clinics together (the manager's bonus condition is judged on all the clinics she runs)
  const cAll = MP.conditionOf(emps, sales, attendance, CITIES, month, mTo);
  const inAll = CITIES.flatMap((c) => m2[c].inCond);
  out.bothClinics = { pay: { counted: cAll.people.filter((x) => x.days > 0).length, ok: cAll.people.filter((x) => x.days > 0 && x.ok).length, conditionMet: cAll.ok },
    second: { counted: inAll.length, ok: inAll.filter((x) => x.lei / x.days > 1500).length, conditionMet: inAll.length > 0 && inAll.every((x) => x.lei / x.days > 1500) } };
  out.bothClinics.agree = out.bothClinics.pay.conditionMet === out.bothClinics.second.conditionMet && out.bothClinics.pay.ok === out.bothClinics.second.ok;
  // the data itself
  const winAppts = appts.filter((a) => a && a.date >= wFrom && a.date <= wTo && !a.block && a.status !== 'concediu');
  const monthPays = pays.filter((s) => s.date >= mFrom && s.date <= mTo);
  out.data = {
    apptsWithoutClinic: winAppts.filter((a) => !apptClinic(a)).length, apptsWithoutClientId: winAppts.filter((a) => !a.clientId).length,
    paysWithoutClinic: monthPays.filter((s) => !saleClinic(s)).length, paysWithoutClientId: monthPays.filter((s) => !s.clientId).length, paysWithoutPerformer: monthPays.filter((s) => !s.performedBy || !home.has(s.performedBy)).length,
    paysPerformerNotCosmetician: monthPays.filter((s) => { const e = emps.find((x) => x && x.id === s.performedBy); return e && e.role !== 'cosmetician'; }).length,
    paysNonPositive: monthPays.filter((s) => s.kind !== 'refund' && !(Number(s.amount) > 0)).length, paysFutureDate: pays.filter((s) => s.date > today).length,
    paysDatedOtherThanTyped: monthPays.filter((s) => { const t = Date.parse(s.createdAt || ''); return Number.isFinite(t) && ro(t).day !== s.date; }).length,
    cosmeticiansLocationSpelledOtherwise: emps.filter((e) => e && e.role === 'cosmetician' && clinic(e.location) && e.location !== clinic(e.location)).length,
    cosmeticiansWithoutClinic: emps.filter((e) => e && e.role === 'cosmetician' && !clinic(e.location)).length,
    statuses: winAppts.reduce((o, a) => { o[a.status || '-'] = (o[a.status || '-'] || 0) + 1; return o; }, {}),
  };
  // the manager's 5% (no sums): is the month's cost sheet complete, and does the bonus follow from collections - costs
  try {
    const ctx = await MP.loadCtx(readJSON);
    const mgrs = ctx.employees.filter((e) => e && e.role === 'manager' && e.active !== false);
    out.managerBonus = [];
    for (const [i, e] of mgrs.entries()) {
      const r = await MP.monthOf(readJSON, ctx, e, month, { full: true });
      const clin = r.clinics;
      const coll = Math.round(clin.reduce((n, c) => n + (m2[c] ? m2[c].collected : 0), 0)); // whole lei, as the sheet
      const costSum = r.costs ? round2(r.costs.rows.reduce((n, x) => n + (Number(x.lei) || 0), 0)) : null;
      const cond = (() => { const ppl = clin.flatMap((c) => (m2[c] ? m2[c].inCond : [])); return ppl.length > 0 && ppl.every((x) => x.lei / x.days > 1500); })();
      const bonus2 = r.filled ? (cond ? Math.round(Math.max(0, coll - costSum) * 0.05) : 0) : null;
      out.managerBonus.push({ label: 'M' + (i + 1), clinics: clin.length, filled: r.filled, missingLines: r.costs ? r.costs.missing : null, conditionMet: r.condition.ok, secondConditionMet: cond,
        collectionsAgree: r.collections != null && Math.abs(r.collections - coll) < 0.01, costsAddUp: r.costs ? Math.abs(costSum - r.costs.total) < 0.01 : null,
        bonusAgree: r.filled ? (r.estimate && r.estimate.bonus) === bonus2 : null, profitPositive: r.filled ? r.profit > 0 : null, final: !!r.final });
    }
  } catch (e) { out.managerBonus = { error: String(e.message || e).replace(PHONE, '…').slice(0, 160) }; }
  // the commission: what every screen shows against Salariu (_lib/payroll.js), and a second reading from the definitions
  try { out.commission = await commissionAgree(month, today); } catch (e) { out.commission = { error: String(e.message || e).replace(PHONE, '…').slice(0, 160), agree: false }; }
  out.agree = CITIES.every((c) => out.cities[c].visits60.agree && out.cities[c].month.cosmeticians.agreePay && out.cities[c].month.consults.agree && out.cities[c].month.collections.agree) && out.bothClinics.agree && out.commission.agree === true;
  return out;
}

// The month's commission per cosmetician (C1, C2… by the sum: never a name or an id), as each screen reads it:
//   salariu     Salariu (payroll.js monthPay, the way portal-data builds it)
//   vanzari     Echipa → the person → Vânzări „Comision luna” and her card (the payroll row of Echipa → Salarii)
//   goal        the Panou goal „comision aprobat luna” (the commission plus what was added by hand)
//   tags        Aprobări's tags („Aprobată · X lei”, commission.js summaryOf) summed over all her approved upsells, against
//               Salariu summed over every month they have lines in
//   second      written again from the definitions: 4% (minus 60% costs, 10% of the profit) of each payment that came in for an
//               approved upsell from November 2026 (in the payment's month, up to the upsell's value, none after her last
//               day), the whole value's commission before, minus 4% of each refund in its month
async function commissionAgree(month, today) {
  const PAY = require('./_lib/payroll'), CM = require('./_lib/commission'), L = require('./_lib/left');
  const [sales, dues, emps] = await Promise.all([readJSON('data/sales.json', []), readJSON('data/client-dues.json', []), readJSON('data/employees.json', [])]);
  const cctx = CM.context(sales, dues, emps);
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const c4 = (lei) => Math.round((Number(lei) || 0) * 40 / 100 * 10) / 100; // minus 60% costs, 10% of the profit left
  const mOf = (d) => String(d || '').slice(0, 7);
  const byId = new Map(sales.filter(Boolean).map((s) => [s.id, s]));
  const isReq = (s) => s && s.source !== 'incasare' && s.source !== 'manual';
  const second = (e, m) => {
    const until = L.leftAt(e);
    let lei = 0;
    sales.forEach((u) => {
      if (!isReq(u) || u.employeeId !== e.id || u.status !== 'approved') return;
      const cash = u.origin === 'upsell' && u.incasareId && mOf(u.date) >= '2026-11';
      if (cash) {
        const due = dues.find((d) => d && d.saleId === u.incasareId);
        const pay = byId.get(u.incasareId);
        // what came in and what went back (a refund lowers what was received: later money can earn again, up to the value)
        const parts = due ? (due.payments || []).filter((p) => Number(p.amount) !== 0).map((p) => ({ date: (byId.get(p.saleId) || {}).date || '', at: p.at || '', lei: Number(p.amount) }))
          : pay ? [{ date: pay.date, lei: pay.parts ? Number(pay.parts.upsell) : Math.min(Number(pay.upsell) || 0, Number(pay.amount) || 0) }] : [];
        let sofar = 0;
        parts.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : String(a.at || '') < String(b.at || '') ? -1 : 1)).forEach((p) => {
          if (p.lei < 0) { sofar = Math.max(0, sofar + p.lei); return; }
          const c = Math.max(0, Math.min(p.lei, Number(u.amount) - sofar)); sofar += c; if (c > 0 && mOf(p.date) === m && !(until && p.date > until)) lei += c4(c);
        });
      } else if (mOf(u.date) === m && !(until && u.date > until)) lei += Number(u.commission) || 0;
      sales.forEach((r) => {
        if (!r || r.kind !== 'refund' || mOf(r.date) !== m || (until && r.date > until)) return;
        (r.from || []).forEach((x) => { if (x.upsellId === u.id && x.lei > 0) lei -= c4(x.lei); });
        if (!cash) (r.restCut || []).forEach((x) => { if (x.upsellId === u.id && x.lei > 0) lei -= c4(x.lei); });
      });
    });
    return r2(lei);
  };
  // every month a line can fall in: the months of all the payments, refunds and requests
  const allMonths = [...new Set(sales.filter(Boolean).map((s) => mOf(s.date)).concat([month]))].filter((m) => /^\d{4}-\d{2}$/.test(m));
  const months = () => allMonths;
  const rows = [];
  emps.filter((e) => e && e.role === 'cosmetician').forEach((e) => {
    const pay = PAY.monthPay({ emp: e, month, isCurrent: month === mOf(today), sales, dues, cctx, payouts: [], bank: null, attendance: [], appointments: [] });
    const cm = PAY.commissionMonth({ emp: e, month, isCurrent: true, sales, dues, cctx });
    const tags = r2(sales.filter((u) => CM.isUpsellReq(u) && u.employeeId === e.id && u.status === 'approved').reduce((a, u) => a + CM.summaryOf(u, cctx).lei, 0));
    const lifetime = r2(months(e).reduce((a, m) => a + PAY.commissionMonth({ emp: e, month: m, isCurrent: false, sales, dues, cctx }).commission, 0));
    const sec = second(e, month);
    if (!pay.commission && !sec && !tags && !cm.manual) return;
    rows.push({ salariu: pay.commission, vanzari: cm.commission, goal: r2(cm.commission + cm.manual), goalSalariu: r2(pay.commission + pay.manual), tags, tagsSalariu: lifetime, second: sec,
      agree: Math.abs(pay.commission - cm.commission) < 0.01 && Math.abs(r2(cm.commission + cm.manual) - r2(pay.commission + pay.manual)) < 0.01 && Math.abs(tags - lifetime) < 0.01 && Math.abs(sec - pay.commission) < 0.01 });
  });
  rows.sort((a, b) => b.salariu - a.salariu);
  const people = rows.map((r, i) => Object.assign({ label: 'C' + (i + 1) }, r));
  return { month, people, agree: people.every((r) => r.agree) };
}
