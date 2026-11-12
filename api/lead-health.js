// GET /api/lead-health?days=3, the owner (portal session) or the Creative app server to server (CREATIVE_SSO_SECRET):
// how the leads and the automatic WhatsApp messages did over the last days, in counts and reasons only, never a name or a
// phone (the owner, 8.11: „verifică toate mesajele de lead nou și reamintire se trimit bine”).
//   leads: where the new ones are in the Pipeline, by source; the welcome message (sent / why not)
//   welcome: per ads offer and city, whether its new-lead template is approved by Meta for that city's number
//   reminders: the booking flows (on / off, their templates' approval per city) and what their runs did
//   delivery: per template, Meta's statuses of the messages sent (sent, delivered, read, failed and why)

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
  const days = Math.max(1, Math.min(14, Number((req.query && req.query.days) || 3) || 3));
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
  // switch and the last 10 (initials only)
  if (req.query && req.query.comments) {
    const SC = require('./_lib/social-comments');
    const [st, set, last] = await Promise.all([require('./_lib/social-inbox').status().catch((e) => ({ error: e.message })), SC.settings(), SC.list(10)]);
    res.status(200).json({ on: set.on, status: st.error ? { error: st.error } : st.comments, last: last.map((c) => ({ id: c.id, channel: c.channel, from: SC.initials(c.from && c.from.name),
      text: String(c.text || '').replace(PHONE, '…'), state: c.state, reply: c.reply || '', why: c.why || '', at: c.at, repliedAt: c.repliedAt || '', tries: c.tries || 0 })) });
    return;
  }
  // ?content=1: Conținut (api/_lib/content.js): the settings, the entries per state, the next 5 planned, the last 5 posted
  // with their numbers, the permissions the posting needs (no names)
  if (req.query && req.query.content) {
    const C = require('./_lib/content');
    const [list, status, access] = await Promise.all([C.items(), C.status(), require('./_lib/content-post').access(true).catch((e) => ({ error: e.message }))]);
    const rows = [];
    list.forEach((it) => (it.plan || []).forEach((e) => rows.push({ id: it.id, kind: it.kind, rubric: it.rubric, topic: it.topic, net: e.net, at: e.at, state: e.state, url: e.url || '', error: e.error || '', hold: e.hold || '', stats: (it.stats || {})[e.net] || null, postedAt: e.postedAt || '' })));
    const next = rows.filter((r) => r.state === 'planned' || r.state === 'posting').sort((a, b) => a.at.localeCompare(b.at)).slice(0, 5).map((r) => ({ net: r.net, at: r.at, rubric: r.rubric, kind: r.kind, state: r.state, hold: r.hold || undefined }));
    const last = rows.filter((r) => r.state === 'posted').sort((a, b) => (b.postedAt || b.at).localeCompare(a.postedAt || a.at)).slice(0, 5).map((r) => ({ net: r.net, at: r.postedAt || r.at, rubric: r.rubric, kind: r.kind, url: r.url, stats: r.stats }));
    const errors = rows.filter((r) => r.state === 'error').slice(-5).map((r) => ({ net: r.net, at: r.at, rubric: r.rubric, error: r.error }));
    res.status(200).json({ settings: { on: status.on, slots: status.slots, nets: status.nets, gapDays: status.gapDays }, counts: status.counts, queued: status.queued, daysAhead: status.daysAhead, until: status.until, want: status.want, drafts: status.drafts,
      access: access.error ? { error: access.error } : { connected: access.connected, instagram: !!access.igId, missing: access.missing }, next, last, errors });
    return;
  }
  // ?nuki=1: Nuki (api/portal-nuki.js) answers a sample question with the real offers and free hours
  // ?nuki=edit: the owner's edits, end to end without saving: Nuki reads a sheet and proposes a change (nothing is applied)
  if (req.query && req.query.nuki) { res.status(200).json(req.query.nuki === 'edit' ? await require('./portal-nuki').pingEdit(req.query.q) : await require('./portal-nuki').ping()); return; }
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
    (Array.isArray(convos) ? convos : []).forEach((c) => (c.messages || []).forEach((m) => {
      if (m.direction !== 'out' || m.type !== 'template' || !recent(m.timestamp)) return;
      const t = tplById.get(m.templateId);
      const k = t ? t.label : 'alt șablon';
      const d = delivery[k] = delivery[k] || { sent: 0, delivered: 0, read: 0, failed: 0, why: {} };
      d.sent++;
      if (m.status === 'failed') { d.failed++; inc(d.why, String(m.error || m.errorCode || 'nelivrat').slice(0, 120)); }
      else if (m.status === 'read') { d.read++; d.delivered++; }
      else if (m.status === 'delivered') d.delivered++;
    }));
    out.delivery = delivery;
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 200) });
  }
};
