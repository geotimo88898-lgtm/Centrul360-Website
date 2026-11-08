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
