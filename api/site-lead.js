// POST /api/site-lead: the sign-up forms of the site (the home page quiz, the treatment pages, "Consultație
// gratuită") send their lead here too, with the city the person picked. It goes into the Pipeline as source "Site":
// the owner and reception are told at once (LEAD SITE 🌐, not the ads' LEAD NOU 🔥), and the WhatsApp template meant for site leads goes from
// that city's number (_lib/workflows.js welcome, "Lead de pe site" in Automatizări → Mesaje).
// Public, so: our own pages only (Origin), a hidden trap field, the consent box, a few tries per address.
//
// The lead filter on the site (the owner, 21.11: the same chain as the Facebook forms, for the ones who come from organic):
//   GET ?lf=1                 the offer as the forms ask it (zones per clinic, their problems, when, each zone's four
//                             packages with what's in them and their full list value), from Admin's lead filter
//                             (data/leadfilter.json, api/_lib/leadfilter.js); nothing else
//   POST { lf: { zone, problem, when, tier }, nume, telefon, oras, consimtamant_whatsapp, sursa, pagina, event_id }
//                             the lead, in the same lead filter: her answers on the lead, her zone × package × clinic
//                             WhatsApp with its picture, the call for 4.990 / 14.900, the push „LEAD SITE TM · 990 lei · …”

const { createLead } = require('./portal-leads');
const capi = require('./_lib/meta-capi');

const CITIES = { timisoara: 'Timișoara', arad: 'Arad' };
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const tries = new Map(); // ip → [times] (per warm instance)

// the lead filter's offer for the site: only what the form shows (no forms ids, no messages)
async function offer() {
  const LF = require('./_lib/leadfilter');
  const d = await LF.load();
  const pk = d.packages;
  if (!pk) return { ok: false, error: 'no_packages' };
  const out = { ok: true, timeline: (pk.timeline || []).map((t) => ({ key: t.key, label: t.label })), cities: {} };
  ['Timișoara', 'Arad'].forEach((city) => {
    out.cities[city] = LF.zonesOf(pk, city).map((z) => {
      const packs = {};
      const tiers = LF.tiersOf(pk, z.key);
      tiers.forEach((t) => {
        const p = (((pk.packages || {})[z.key]) || {})[t];
        if (!p) return;
        const items = ((p.items || {})[city] || []).map((i) => ({ label: clip(i.label, 80), qty: Number(i.qty) || 0 }));
        packs[t] = { name: clip(p.name, 60), price: Number(p.price) || Number(t), value: Number((p.value || {})[city]) || 0, items,
          bonuses: (p.bonuses || []).map((x) => clip(x.label, 90)).filter(Boolean),
          guarantee: p.guarantee ? { short: clip(p.guarantee.short, 60), full: clip(p.guarantee.full, 240) } : null,
          scarcity: p.scarcity ? clip(p.scarcity.full || p.scarcity.short, 200) : '',
          popular: /cele mai multe aleg/i.test(String(p.formLabel || '')) };
      });
      return { key: z.key, label: z.label, problems: (z.problems || []).map((x) => ({ key: x.key, label: x.label })), tiers: tiers.filter((t) => packs[t]), packs };
    });
  });
  return out;
}

// her lead-filter answers checked against the offer: { x } (what leadfilter.afterLead takes) or { error }
async function answers(lf, city) {
  const LF = require('./_lib/leadfilter');
  const pk = (await LF.load()).packages;
  if (!pk) return { error: 'no_packages' };
  const z = LF.zonesOf(pk, city).find((y) => y.key === String(lf.zone || ''));
  if (!z) return { error: 'bad_zone' };
  const tier = String(lf.tier || '');
  if (!LF.tiersOf(pk, z.key).includes(tier)) return { error: 'bad_tier' };
  const p = (((pk.packages || {})[z.key]) || {})[tier];
  if (!p) return { error: 'bad_tier' };
  const pr = (z.problems || []).find((y) => y.key === String(lf.problem || ''));
  const wh = (pk.timeline || []).find((y) => y.key === String(lf.when || ''));
  return { x: { zone: z.key, zoneLabel: z.label, problem: pr ? pr.key : '', problemLabel: pr ? pr.label : '', when: wh ? wh.key : '', whenLabel: wh ? wh.label : '', tier, packName: clip(p.name, 60) } };
}

module.exports = async (req, res) => {
  if (req.method === 'GET' && req.query && req.query.lf) {
    try {
      const r = await offer();
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.status(r.ok ? 200 : 503).json(r);
    } catch (err) { console.error('site-lead offer:', err.message); res.status(500).json({ error: 'failed' }); }
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const origin = String(req.headers.origin || '');
  if (origin && !/^https:\/\/([\w-]+\.)?centrul360\.com$/.test(origin) && !/^http:\/\/localhost(:\d+)?$/.test(origin)) { res.status(403).json({ error: 'forbidden' }); return; }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  const now = Date.now();
  const mine = (tries.get(ip) || []).filter((t) => now - t < 10 * 60e3);
  if (mine.length >= 5) { res.status(429).json({ error: 'too_many' }); return; }
  tries.set(ip, mine.concat(now));

  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  if (b.website || b.hp) { res.status(200).json({ ok: true }); return; } // the trap: a bot filled the hidden field
  const name = clip(b.nume || b.name, 100);
  const phone = clip(b.telefon || b.phone, 30);
  const city = CITIES[fold(b.oras || b.city).replace(/[^a-z]/g, '')] || '';
  if (!name || String(phone).replace(/\D/g, '').length < 9) { res.status(400).json({ error: 'missing_fields' }); return; }
  if (!city) { res.status(400).json({ error: 'missing_city' }); return; }
  if (!(b.consimtamant_whatsapp === true || b.consimtamant_whatsapp === 'true' || b.consimtamant_whatsapp === 'on')) { res.status(400).json({ error: 'missing_consent' }); return; }

  // the lead filter on the site: its own path (the same as a Facebook lead filter lead's, but from the site)
  if (b.lf && typeof b.lf === 'object') {
    try {
      const a = await answers(b.lf, city);
      if (a.error) { res.status(400).json({ error: a.error }); return; }
      const x = a.x;
      const LF = require('./_lib/leadfilter');
      const src = require('./_lib/site-funnel').cleanSource(b.sursa || 'site');
      const lei = (t) => Number(t).toLocaleString('ro-RO');
      const note = ['Lead filter pe site', 'sursa: ' + src, clip(b.pagina, 200)].filter(Boolean).join(' · ');
      const r = await createLead({ name, phone, source: 'site', location: city, createdBy: 'site-form', interest: 'Lead filter · ' + x.zoneLabel, note, authorLabel: 'Site · Lead filter',
        welcome: false, alertWhat: { title: [lei(x.tier) + ' lei', x.zoneLabel].join(' · '), text: LF.summary(x) } });
      if (r.error) { res.status(400).json({ error: r.error }); return; }
      if (r.lead && !r.same) {
        // where she came from, on the lead (the funnel counts the site's lead filter leads per source)
        const { readJSON, writeJSON } = require('./_lib/store');
        const all = await readJSON('data/leads.json', []);
        const row = all.find((l) => l.id === r.lead.id);
        if (row) { row.siteSource = src; await writeJSON('data/leads.json', all); }
        await LF.afterLead(r.lead, x, city);
      }
      res.status(200).json({ ok: true, hot: LF.HOT.includes(x.tier) });
      await capi.soon(() => capi.siteEvent(req, { name: 'Lead', eventId: b.event_id, phone, leadId: r.lead && r.lead.id, url: b.pagina }));
    } catch (err) {
      console.error('site-lead lf error:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'failed' });
    }
    return;
  }

  const interest = clip(b.interes_principal, 120);
  const note = ['Formular site', clip(b.sursa, 160), b.zona ? 'zona: ' + clip(b.zona, 80) : '', clip(b.pagina, 200)].filter(Boolean).join(' · ');
  try {
    const r = await createLead({ name, phone, email: clip(b.email, 120), source: 'site', location: city, createdBy: 'site-form', interest, note, authorLabel: 'Site' });
    if (r.error) { res.status(400).json({ error: r.error }); return; }
    res.status(200).json({ ok: true });
    // the thank-you page's Lead, from the server too (Conversions API), with the event_id the page gave its pixel: counted once
    await capi.soon(() => capi.siteEvent(req, { name: 'Lead', eventId: b.event_id, phone, email: clip(b.email, 120), leadId: r.lead && r.lead.id, url: b.pagina }));
  } catch (err) {
    console.error('site-lead error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
