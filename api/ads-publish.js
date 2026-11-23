// /api/ads-publish, Creative → "Publică pe Meta" (the Creative app calls it server to server with
// CREATIVE_SSO_SECRET, like /api/offers-feed; the owner's own portal session works too).
//   GET  ?action=options     can publishing work (the user token with ads_management, the ad account)
//                            + the Page, its Instagram, the active lead forms, the offers, the cities
//   POST { action: 'publish', image: { base64, name }, settings, ref, origin }   origin 'loop' (Creative → Bucla): made PAUSED
//   POST { action: 'form_create', form }   a new lead form on the Page, offered in the window at once
//   GET  ?action=form_setup                what the "Creează formular" window starts from (the template, the forms)
//   POST { action: 'form_info', id }       an existing form's screening questions (to copy them)
//   GET  ?action=results&since=YYYY-MM-DD  every ad's spend and leads (Meta) and what came after the form (portal), so
//                                          Creative makes more of what brought cheap leads and bookings
//                            campaign + ad set + ad, see _lib/meta-ads.js; kept in data/ads-published.json
// The publishing itself lives in _lib/meta-ads.js.

const crypto = require('crypto');
const ME = require('./_lib/meta-error');
const { readJSON, writeJSON } = require('./_lib/store');
const { getSession } = require('./_lib/auth');
const { loadConnection, appCreds } = require('./_lib/facebook');
const { loadOffers, offerForms } = require('./_lib/offers');
const { createForm } = require('./_lib/fb-form-create');
const { getTemplate } = require('./_lib/fb-form-template');
const { fetchFormInfo } = require('./_lib/facebook');
const ads = require('./_lib/meta-ads');

const LOG_KEY = 'data/ads-published.json';

function fromCreative(req) {
  const secret = process.env.CREATIVE_SSO_SECRET || '';
  const header = String((req.headers && req.headers.authorization) || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secret || !token) return false;
  const a = crypto.createHash('sha256').update(token).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

const REASONS = {
  not_connected: 'Facebook nu e conectat (Integrări → Facebook).',
  no_user_token: 'Lipsește tokenul pentru reclame. Integrări → Facebook → Reclame: lipește un token cu ads_management.',
  no_ad_account: 'Alege contul de reclame în Integrări → Facebook → Setări conexiune.',
  token_expired: 'Tokenul pentru reclame a expirat. Integrări → Facebook → Reclame: lipește unul nou.',
  ad_account_inactive: 'Contul de reclame nu e activ în Meta.',
  no_ads_permission: 'Tokenul pentru reclame n-are permisiunea ads_management. Integrări → Facebook → Reclame: lipește un token care o are.',
};
// what is missing from the window's settings, in words
const SETTINGS = {
  missing_names: 'Lipsește numele campaniei, al setului sau al reclamei.',
  missing_form: 'Alege formularul.',
  missing_text: 'Scrie textul reclamei.',
  missing_city: 'Alege orașul.',
  missing_placements: 'Alege cel puțin o plasare.',
  budget_too_low: 'Bugetul minim e 5 lei pe zi.',
};

async function options() {
  const conn = await loadConnection(readJSON);
  if (!conn.pageId) return { ok: true, ready: false, reason: 'not_connected', message: REASONS.not_connected };
  const [info, poll, reg, offers, defaults] = await Promise.all([
    ads.accountInfo(conn), readJSON('data/fb-poll.json', {}), readJSON('data/fb-forms.json', {}), loadOffers(readJSON, writeJSON), ads.loadDefaults(readJSON),
  ]);
  // ad sets an ad can join, and how long the ads connection still works
  const [adsets, token] = info.ready ? await Promise.all([ads.listAdsets(conn), ads.tokenInfo(conn.userToken, await appCreds(readJSON))]) : [[], null];
  // publishing needs ads_management on the token
  if (info.ready && token && token.valid && !(token.scopes || []).includes('ads_management')) Object.assign(info, { ready: false, reason: 'no_ads_permission', message: '' });
  const offerTitle = (id) => ((offers.find((o) => o.id === id) || {}).title || '');
  // one form per offer and city (Oferte): only those, with their offer and city; none set yet: every active form
  const cur = new Map(offerForms(offers).map((x) => [x.formId, x]));
  const forms = (poll.forms || []).filter((f) => !f.status || f.status === 'ACTIVE').filter((f) => !cur.size || cur.has(f.id)).map((f) => {
    const r = (reg.forms || {})[f.id] || {};
    const det = r.detected || {};
    const c = cur.get(f.id);
    return { id: f.id, name: f.name, lastAt: f.lastAt ? new Date(f.lastAt * 1000).toISOString() : '', created: f.created || '',
      offer: c ? c.offerTitle : offerTitle(r.offerId || det.offerId), location: c ? c.city : r.location || det.location || '' };
  }).sort((a, b) => (b.lastAt || b.created || '').localeCompare(a.lastAt || a.created || ''));
  return {
    ok: true, ready: !!info.ready, reason: info.reason || '', message: info.message || REASONS[info.reason] || '',
    adAccount: info.adAccount || null, page: info.page || { id: conn.pageId, name: conn.pageName }, instagram: info.instagram || null,
    forms,
    offers: offers.filter((o) => o.active !== false).map((o) => ({ title: o.title, key: o.key, category: o.category || '' })),
    cities: Object.keys(ads.CITIES), placements: Object.keys(ads.PLACEMENTS), ctas: ads.CTAS,
    defaults, adsets, tokenExpiresAt: token && token.expiresAt ? new Date(token.expiresAt).toISOString() : '',
  };
}

// every ad from `since` (default: 30 days back) to today: Meta's spend / leads, the portal's leads / bookings / visits /
// clients (counted from 16.10.2026, 22:05, like Reclame) and the spend of those days
async function results(sinceQ) {
  const AM = require('./ads-manager');
  const { conn, problem } = await AM.connection();
  if (problem) return { ok: false, reason: problem, ads: [] };
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const back = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const since = /^\d{4}-\d{2}-\d{2}$/.test(String(sinceQ || '')) && sinceQ <= today ? String(sinceQ) : back;
  const range = { since, until: today };
  // the same answer for half an hour (Meta limits how often the account is read)
  const AC = require('./_lib/ads-cache');
  const view = await AC.cached('results-' + since + '_' + today, 30 * 60e3, () => ads.overview(conn, 'custom', range));
  if (view.error) { ME.log('ads results', view.error); return { ok: false, reason: 'meta_error', message: ME.ui(view.error), ads: [] }; }
  await AM.withFunnel(view, 'custom', range, conn).catch((e) => { console.error('results funnel:', e.message); });
  const out = [];
  (view.campaigns || []).forEach((c) => (c.adsets || []).forEach((s) => (s.ads || []).forEach((a) => out.push({
    adId: a.id, name: a.name, campaign: c.name, status: a.effective || a.status, created: a.created, text: String(a.text || '').slice(0, 300),
    spend: a.spend, leads: a.leads, clicks: a.linkClicks, impressions: a.impressions,
    spendNew: a.spendNew || 0, pLeads: a.pLeads || 0, contacted: a.contacted || 0, lost: a.lost || 0, booked: a.booked || 0, showed: a.showed || 0, clients: a.clients || 0, revenue: a.revenue || 0,
  }))));
  return { ok: true, since, until: today, ads: out };
}

// every ad's days from `since` (default: 60 days back): spend, Meta's leads, link clicks, day by day, with the campaign
// (read only, for the owner's questions: when an ad last ran, what a lead cost on its last days)
async function daily(sinceQ) {
  const AM = require('./ads-manager');
  const { conn, problem } = await AM.connection();
  if (problem) return { ok: false, reason: problem, rows: [] };
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const back = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const since = /^\d{4}-\d{2}-\d{2}$/.test(String(sinceQ || '')) && sinceQ <= today ? String(sinceQ) : back;
  const AC = require('./_lib/ads-cache');
  const r = await AC.cached('daily-' + since + '_' + today, 30 * 60e3, () => ads.adDays(conn, { since, until: today }));
  if (r.error) { ME.log('ads daily', r.error); return { ok: false, reason: 'meta_error', message: ME.ui(r.error), rows: [] }; }
  return { ok: true, since, until: today, rows: r.rows };
}

module.exports = async (req, res) => {
  const session = getSession(req);
  const allowed = fromCreative(req) || (session && session.role === 'admin');
  if (!allowed) { res.status(401).json({ error: 'not_authenticated' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  try {
    // the Facebook Page's own links (21.11, the card's sales from organic): GET ?action=page_links reads the website and
    // the Page's button; POST { action: 'page_links', website, cta: { type, url } } sets them (only centrul360.com links)
    if (req.query && req.query.action === 'page_links' || (req.body && req.body.action === 'page_links')) {
      const { loadConnection } = require('./_lib/facebook');
      const conn = await loadConnection(readJSON);
      if (!conn.pageId || !conn.pageAccessToken) { res.status(200).json({ ok: false, reason: 'not_connected' }); return; }
      const ours = (u) => { try { const x = new URL(String(u || '')); return x.protocol === 'https:' && /(^|\.)centrul360\.com$/.test(x.hostname) ? x.href : ''; } catch (e) { return ''; } };
      const out = { ok: true };
      if (req.method === 'POST') {
        const b = req.body || {};
        if (b.website) {
          const w = ours(b.website);
          if (!w) { res.status(400).json({ error: 'bad_link' }); return; }
          const r = await ads.call('POST', '/' + conn.pageId, conn.pageAccessToken, { website: w });
          out.website = r.ok && !(r.j && r.j.error) ? { ok: true } : { error: (r.j && r.j.error && (r.j.error.error_user_msg || r.j.error.message)) || 'meta_error', code: r.j && r.j.error && r.j.error.code };
        }
        if (b.cta && b.cta.url) {
          const u = ours(b.cta.url);
          if (!u) { res.status(400).json({ error: 'bad_link' }); return; }
          const type = /^[A-Z_]{3,30}$/.test(String(b.cta.type || '')) ? b.cta.type : 'SHOP_NOW';
          const r = await ads.call('POST', '/' + conn.pageId + '/call_to_actions', conn.pageAccessToken, { type, web_url: u });
          out.cta = r.ok && !(r.j && r.j.error) ? { ok: true, id: r.j && r.j.id } : { error: (r.j && r.j.error && (r.j.error.error_user_msg || r.j.error.message)) || 'meta_error', code: r.j && r.j.error && r.j.error.code };
        }
      }
      const pg = await ads.call('GET', '/' + conn.pageId, conn.pageAccessToken, { fields: 'name,website,link' });
      out.page = pg.ok ? { name: pg.j.name, website: pg.j.website || '' } : { error: (pg.j && pg.j.error && pg.j.error.message) || 'meta_error' };
      const ct = await ads.call('GET', '/' + conn.pageId + '/call_to_actions', conn.pageAccessToken, { fields: 'id,type,web_url,status' });
      out.ctas = ct.ok ? (ct.j.data || []) : { error: (ct.j && ct.j.error && ct.j.error.message) || 'meta_error', code: ct.j && ct.j.error && ct.j.error.code };
      res.status(200).json(out);
      return;
    }
    if (req.method === 'GET' && req.query && req.query.action === 'form_setup') {
      const [template, poll, reg, offersAll] = await Promise.all([getTemplate({ readJSON, writeJSON }), readJSON('data/fb-poll.json', {}), readJSON('data/fb-forms.json', {}), loadOffers(readJSON, writeJSON)]);
      const cur = new Map(offerForms(offersAll).map((x) => [x.formId, x]));
      const forms = (poll.forms || []).filter((f) => !f.status || f.status === 'ACTIVE').filter((f) => !cur.size || cur.has(f.id)).map((f) => { const r = (reg.forms || {})[f.id] || {}; const c = cur.get(f.id); return { id: f.id, name: f.name, location: c ? c.city : r.location || (r.detected && r.detected.location) || '' }; });
      res.status(200).json({ ok: true, template, forms, offers: offersAll.filter((o) => o.active !== false).map((o) => ({ id: o.id, title: o.title })) });
      return;
    }
    if (req.method === 'GET' && req.query && req.query.action === 'results') { res.status(200).json(await results(req.query.since)); return; }
    // retargeting audiences (20.11): GET ?action=audiences lists them, POST { action: 'audience_create', kind, days } makes one
    if (req.query && req.query.action === 'audiences' || (req.body && (req.body.action === 'audience_create'))) {
      const AM = require('./ads-manager');
      const { conn, problem } = await AM.connection();
      if (problem) { res.status(200).json({ ok: false, reason: problem }); return; }
      if (req.method === 'POST') {
        const opt = await options().catch(() => ({}));
        const igId = (opt && opt.instagram && opt.instagram.id) || '';
        const r = await ads.audienceCreate(conn, String(req.body.kind || ''), Number(req.body.days) || 30, igId);
        res.status(r.error ? 400 : 200).json(r.error ? { ok: false, error: r.error } : Object.assign({ ok: true }, r));
        return;
      }
      const r = await ads.audienceList(conn);
      res.status(200).json(r.error ? { ok: false, error: r.error } : Object.assign({ ok: true }, r));
      return;
    }
    // Claude asks George something about the ads (the owner, 19.11: „îmi trimiți o notificare prin aplicație, prin contul
    // George, ADS ACTION NEEDED și un mesaj”): his bell and his phone, opening Reclame
    if (req.method === 'POST' && req.body && req.body.action === 'notify') {
      const N = require('./_lib/notify'), { readJSON, writeJSON } = require('./_lib/store');
      const ids = ['admin'].concat(await N.ownerIds({ readJSON })); // his own account and the shared admin login, wherever his phone is signed in
      const text = String(req.body.text || '').trim();
      if (!text) { res.status(400).json({ error: 'text' }); return; }
      const n = await N.notifyMany({ readJSON, writeJSON }, ids, { kind: 'alert', tone: 'warn', title: 'ADS ACTION NEEDED', text, go: 'reclame', ownerPush: true, tag: 'ads-claude-' + Date.now() });
      res.status(200).json({ ok: true, sent: n });
      return;
    }
    // read only: why an ad doesn't deliver (Meta's issues_info, review), and the ad account's state (status, why disabled)
    if (req.method === 'GET' && req.query && req.query.action === 'diag') {
      const AM = require('./ads-manager');
      const { conn, problem } = await AM.connection();
      if (problem) { res.status(200).json({ ok: false, reason: problem }); return; }
      const acc = await ads.call('GET', '/' + conn.adAccountId, conn.userToken, { fields: 'account_status,disable_reason,spend_cap,amount_spent,funding_source_details' });
      const id = /^\d+$/.test(String(req.query.id || '')) ? String(req.query.id) : '';
      const camp = id ? await ads.delivery(conn, id) : null;
      const fs = acc.ok && acc.j.funding_source_details ? { type: acc.j.funding_source_details.type, display: String(acc.j.funding_source_details.display_string || '').replace(/\d{4,}/g, '…') } : null;
      res.status(200).json({ ok: true, account: acc.ok ? { status: acc.j.account_status, disableReason: acc.j.disable_reason, spendCap: acc.j.spend_cap, spent: acc.j.amount_spent, funding: fs } : { error: acc.j }, campaign: camp });
      return;
    }
    if (req.method === 'GET' && req.query && req.query.action === 'daily') { res.status(200).json(await daily(req.query.since)); return; }
    // read only (23.11): an old ad account's ads of ours (the accounts the port reads from), with Meta's spend / leads and
    // what came after the form (portal), to pick the proven ones worth porting; never a change there
    if (req.method === 'GET' && req.query && req.query.action === 'old_results') {
      const OLD = ['act_4502494523405059', 'act_1136609638911845'];
      const act = OLD.includes(String(req.query.act || '')) ? String(req.query.act) : '';
      if (!act) { res.status(400).json({ error: 'act' }); return; }
      const AM = require('./ads-manager');
      const { conn, problem } = await AM.connection();
      if (problem) { res.status(200).json({ ok: false, reason: problem }); return; }
      const SCOPE = require('./_lib/ads-scope');
      // the old account's own money: its known currency's rate (RON: 1), never the connected account's
      const old = Object.assign({}, conn, { adAccountId: act, scope: SCOPE.forAccount(SCOPE.DEFAULT, act) });
      Object.defineProperty(old, 'fx', { value: 0, enumerable: false });
      const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
      const since = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.since || '')) && req.query.since <= today ? String(req.query.since) : '2026-10-16';
      const range = { since, until: today };
      const AC = require('./_lib/ads-cache');
      const view = await AC.cached('old-' + act + '-' + since + '_' + today, 30 * 60e3, () => ads.overview(old, 'custom', range));
      if (view.error) { res.status(200).json({ ok: false, reason: 'meta_error', message: ME.ui(view.error) }); return; }
      await AM.withFunnel(view, 'custom', range, old).catch((e) => { console.error('old_results funnel:', e.message); });
      let re = null;
      try { re = req.query.match ? new RegExp(String(req.query.match).slice(0, 80), 'i') : null; } catch (e) { re = null; }
      const out = [];
      (view.campaigns || []).filter((c) => !re || re.test(c.name)).forEach((c) => (c.adsets || []).forEach((s) => (s.ads || []).forEach((a) => out.push({
        campaignId: c.id, campaign: c.name, adsetId: s.id, audience: s.audience, adId: a.id, name: a.name, status: a.effective || a.status, created: a.created,
        thumb: a.thumb, text: String(a.text || '').slice(0, 200), spend: a.spend, leads: a.leads, spendNew: a.spendNew || 0, pLeads: a.pLeads || 0,
        booked: a.booked || 0, showed: a.showed || 0, clients: a.clients || 0, revenue: a.revenue || 0,
      }))));
      res.status(200).json({ ok: true, act, since, until: today, currency: view.account && view.account.currency, ads: out });
      return;
    }
    // read only, a dry run (23.11): what a new lead on this form would become, the way api/_lib/fb-leads.js and
    // workflows.welcome read it (the form's procedure and city → the lead's interest → the offer's new-lead WhatsApp
    // templates, from the city's number): the template, Meta's approval, its text with a sample name, its picture.
    // Nothing is sent and nothing is written.
    if (req.method === 'GET' && req.query && req.query.action === 'lead_preview') {
      const id = /^\d{5,25}$/.test(String(req.query.id || '')) ? String(req.query.id) : '';
      if (!id) { res.status(400).json({ error: 'id' }); return; }
      const fold = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      const doc = await readJSON('data/fb-forms.json', {});
      const form = (doc.forms || {})[id];
      if (!form) { res.status(200).json({ ok: false, reason: 'not_registered' }); return; }
      const offers = (await loadOffers(readJSON, writeJSON)).filter((o) => o.active !== false);
      const offer = form.kind ? null : (form.offerId && offers.find((o) => o.id === form.offerId)) || null;
      const location = form.location || '';
      const interest = form.kind === 'leadfilter' ? 'Lead filter' : form.kind === 'card' ? 'Cardul de Sărbători' : offer ? offer.title : form.name;
      const out = { ok: true, form: { id, name: form.name, kind: form.kind || '', offerId: form.offerId || '', location, copyOf: form.copyOf || '', replacedBy: form.replacedBy || '', archived: form.archived || '' },
        lead: { interest, location, offerFound: !!offer, welcome: form.kind ? 'nu (are mesajul lui)' : 'da' }, templates: [] };
      if (!form.kind && offer) {
        const o2 = offers.find((o) => fold(o.title) === fold(interest) || o.key === interest);
        const cities = [...new Set(((o2 && o2.locations) || []).map((l) => (/arad/i.test(l) ? 'Arad' : 'Timișoara')))];
        out.lead.offerKey = o2 ? o2.key : '';
        out.lead.cityOk = !(cities.length === 1 && location && location !== cities[0]);
        const WT = require('./_lib/wa-templates'), WA = require('./_lib/whatsapp');
        const [tpls, cfg] = [(await WT.load()).templates, await WA.loadConfig()];
        const n = (cfg.numbers || {})[location] || {};
        const sample = { prenume: 'Ana', nume: 'Ana Exemplu', interes: interest, procedura: interest, tratament: interest, locatie: location, serviciu: interest };
        out.templates = tpls.filter((t) => o2 && (t.leadOffers || []).includes(o2.key)).map((t) => ({
          label: t.label, metaName: ((t.meta || {})[n.wabaId] || {}).name || t.name, status: ((t.meta || {})[n.wabaId] || {}).status || 'netrimis la Meta', from: location,
          number: n.display ? String(n.display).replace(/\d(?=\d{3})/g, '•') : '', header: t.headerType || '', picture: WT.imageOf(t),
          text: String(t.body || '').replace(/\{\{(\d+)\}\}/g, (m, k) => { const v = (t.map || [])[k - 1]; return v ? (sample[v] || '{' + v + '}') : m; }),
          footer: t.footer || '', buttons: (t.buttons || []).map((b) => b.text || b.type || '') }));
      }
      res.status(200).json(out);
      return;
    }
    // read only (23.11): one lead form in full as Meta keeps it (intro, questions, privacy, ending) and how the portal
    // has it registered (procedure, city, kind), so a copy can be made the same; never a token
    if (req.method === 'GET' && req.query && req.query.action === 'form_full') {
      const id = /^\d{5,25}$/.test(String(req.query.id || '')) ? String(req.query.id) : '';
      if (!id) { res.status(400).json({ error: 'id' }); return; }
      const conn = await loadConnection(readJSON);
      if (!conn.pageAccessToken) { res.status(200).json({ ok: false, reason: 'not_connected' }); return; }
      const j = await require('./_lib/fb-form-template').readForm(id, conn.pageAccessToken);
      if (!j) { res.status(200).json({ ok: false, reason: 'not_read' }); return; }
      const [doc, poll, lf, offersRaw] = await Promise.all([readJSON('data/fb-forms.json', {}), readJSON('data/fb-poll.json', {}), readJSON('data/leadfilter.json', {}), readJSON('data/offers.json', [])]);
      const reg = Object.assign({}, (doc.forms || {})[id] || null);
      const tp = j.thank_you_page || null;
      const lfKeys = [];
      Object.entries((lf && lf.forms) || {}).forEach(([city, m]) => Object.entries(m || {}).forEach(([k, v]) => { if (String(v) === id) lfKeys.push(city + '/' + k); }));
      const offerKeys = [];
      (Array.isArray(offersRaw) ? offersRaw : []).forEach((o) => Object.entries((o && o.forms) || {}).forEach(([city, v]) => { if (String(v) === id) offerKeys.push(o.id + '/' + city); }));
      res.status(200).json({ ok: true, id, name: j.name, status: j.status, locale: j.locale, privacy: j.privacy_policy_url || '', followUp: j.follow_up_action_url || '',
        headline: j.question_page_custom_headline || '', quality: !!j.is_optimized_for_quality, intro: j.context_card || null,
        questions: (j.questions || []).map((q) => ({ key: q.key, type: q.type, label: q.label || '', options: (q.options || []).map((o) => ({ value: o.value, key: o.key })) })),
        ending: tp ? { title: tp.title || '', body: tp.body || '', button_type: tp.button_type || '', button_text: tp.button_text || '', website_url: tp.website_url || '', whatsapp: tp.business_phone_number ? 'da' : '' } : null,
        registered: Object.keys(reg).length ? { name: reg.name, kind: reg.kind || '', zone: reg.zone || '', variant: reg.variant || '', offerId: reg.offerId || '', location: reg.location || '', detected: reg.detected || null, copyOf: reg.copyOf || '', replacedBy: reg.replacedBy || '', leads: reg.leads || 0, keys: Object.keys(reg) } : null,
        poll: (poll.forms || []).find((f) => String(f.id) === id) || null, leadfilter: lfKeys, offers: offerKeys });
      return;
    }
    // read only (23.11): which form an ad's creative sends to, and its words (to check a form switch)
    if (req.method === 'GET' && req.query && req.query.action === 'ad_form') {
      const AM = require('./ads-manager');
      const { conn, problem } = await AM.connection();
      if (problem) { res.status(200).json({ ok: false, reason: problem }); return; }
      const id = /^\d{5,25}$/.test(String(req.query.id || '')) ? String(req.query.id) : '';
      if (!id) { res.status(400).json({ error: 'id' }); return; }
      const r = await ads.call('GET', '/' + id, conn.userToken, { fields: 'account_id,name,effective_status,campaign{name},creative{id,name,object_story_spec,asset_feed_spec}' });
      // the connected account's ads, or (23.11, to check what a port would carry) an ad of ours in an old account
      const SCOPE = require('./_lib/ads-scope');
      const adAct = r.ok ? 'act_' + r.j.account_id : '';
      const oldOurs = ['act_4502494523405059', 'act_1136609638911845'].includes(adAct) && SCOPE.keep(SCOPE.forAccount(SCOPE.DEFAULT, adAct), (r.j.campaign || {}).name);
      if (!r.ok || (adAct !== conn.adAccountId && !oldOurs)) { res.status(200).json({ ok: false, reason: 'not_ours' }); return; }
      const p = require('./_lib/ads-edit').partsOf(r.j.creative || {});
      // what the ad shows, in full: its pictures (from their codes) and its video (link and cover)
      const media = { images: [], video: null };
      if (req.query.media) {
        if (p.hashes.length) {
          const im = await ads.call('GET', '/' + adAct + '/adimages', conn.userToken, { hashes: JSON.stringify(p.hashes), fields: 'hash,url,width,height' });
          media.images = im.ok ? (im.j.data || []).map((x) => ({ hash: x.hash, url: x.url, width: x.width, height: x.height })) : [];
        }
        const s = (r.j.creative || {}).object_story_spec || {}, vid = (s.video_data || {}).video_id || '';
        if (vid) { const v = await ads.call('GET', '/' + vid, conn.userToken, { fields: 'source,picture,length' }); media.video = v.ok ? { id: vid, source: v.j.source || '', picture: v.j.picture || '', length: v.j.length || 0 } : { id: vid }; }
      }
      delete p.hashes;
      res.status(200).json({ ok: true, id, account: adAct === conn.adAccountId ? 'connected' : 'old', name: r.j.name, status: r.j.effective_status, campaign: (r.j.campaign || {}).name, creativeId: (r.j.creative || {}).id, creativeName: (r.j.creative || {}).name, parts: p, media });
      return;
    }
    if (req.method === 'GET') { res.status(200).json(await options()); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const body = req.body || {};
    if (body.action === 'form_info') {
      const conn = await loadConnection(readJSON);
      if (!conn.pageAccessToken) { res.status(400).json({ error: 'not_connected', message: REASONS.not_connected }); return; }
      const info = await fetchFormInfo(String(body.id || '').replace(/\D/g, ''), conn.pageAccessToken);
      res.status(200).json({ ok: true, name: info.name, questions: info.questions.filter((q) => q.type === 'CUSTOM' && q.options.length).map((q) => ({ label: q.label, options: q.options.map((o) => o.value) })) });
      return;
    }
    if (body.action === 'form_create') {
      // Creative names the procedure as it knows it (the offer's title or its ad name)
      const offersAll = await loadOffers(readJSON, writeJSON);
      const fold = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      const input = Object.assign({}, body.form || {});
      if (!input.offerId && input.offer) {
        const t = fold(input.offer);
        const o = offersAll.find((x) => x.id === input.offer || x.key === input.offer) // its id or key
          || offersAll.find((x) => fold(x.title) === t || fold(x.adName) === t) || offersAll.find((x) => t && (t.includes(fold(x.title)) || fold(x.title).includes(t)));
        if (o) input.offerId = o.id;
      }
      const r = await createForm({ readJSON, writeJSON }, input);
      if (r.error) { ME.log('ads-publish', r.error); res.status(400).json({ error: 'meta_refused', message: ME.action(r.error) }); return; }
      const offer = offersAll.find((o) => o.id === r.form.offerId);
      res.status(200).json({ ok: true, form: { id: r.form.id, name: r.form.name, lastAt: '', created: new Date().toISOString(), offer: offer ? offer.title : '', location: r.form.location } });
      return;
    }
    // the Card de Sărbători lead form (21.11, api/_lib/card-lead.js): one form for both clinics (the clinic is a question),
    // no review screen, the ending sends her to the card page; registered as kind 'card' so fb-leads.js routes its leads.
    // Made once: a second call returns the one already made.
    if (body.action === 'card_form_create') {
      const store = { readJSON, writeJSON };
      const doc = await readJSON('data/fb-forms.json', {});
      const have = Object.keys(doc.forms || {}).find((id) => (doc.forms[id] || {}).kind === 'card' && !(doc.forms[id] || {}).archived);
      if (have && body.again !== true) { res.status(200).json({ ok: true, already: true, form: { id: have, name: doc.forms[have].name } }); return; }
      const CL = require('./_lib/card-lead'), FC = require('./_lib/fb-form-create'), FT = require('./_lib/fb-form-template');
      const input = CL.formInput();
      const c = FC.clean(input, await FT.getTemplate(store));
      if (c.error) { res.status(400).json({ error: 'invalid_form', message: c.error }); return; }
      c.params.thank_you_page = CL.thankYou(input.ending);
      const r = await FC.postForm(store, c.params);
      if (r.error) { ME.log('ads-publish', r.error); res.status(400).json({ error: 'meta_refused', message: ME.action(r.error) }); return; }
      const now = new Date().toISOString();
      const d2 = await readJSON('data/fb-forms.json', {});
      d2.forms = d2.forms || {};
      d2.forms[r.id] = { name: c.params.name, kind: 'card', location: '', leads: 0, createdHere: now,
        questions: c.params.questions.map((q) => ({ key: q.key || q.type.toLowerCase(), label: q.label || '', type: q.type, options: q.options || [] })) };
      await writeJSON('data/fb-forms.json', d2);
      const poll = await readJSON('data/fb-poll.json', {});
      poll.forms = [{ id: r.id, name: c.params.name, status: 'ACTIVE', count: 0, created: now, lastAt: 0 }].concat((poll.forms || []).filter((f) => f.id !== r.id));
      await writeJSON('data/fb-poll.json', poll);
      res.status(200).json({ ok: true, form: { id: r.id, name: c.params.name } });
      return;
    }
    // the move to another ad account (21.11): a campaign of the old account remade in the connected one (meta-ads port)
    if (body.action === 'port') {
      const conn = await loadConnection(readJSON);
      if (!conn.userToken || !conn.adAccountId) { res.status(400).json({ error: 'not_connected', message: REASONS.not_connected }); return; }
      const r = await ads.port(conn, String(body.campaignId || ''), { name: body.name, budget: body.budget, dry: body.dry === true, paused: body.paused === true, videoId: body.videoId, formId: body.formId, women: body.women === true });
      if (r.ok && !r.dry) await require('./_lib/ads-cache').clear().catch(() => {});
      res.status(r.error ? 400 : 200).json(r.error ? Object.assign({}, r, { error: ME.clean(r.error) }) : r);
      return;
    }
    if (body.action !== 'publish') { res.status(400).json({ error: 'invalid_action' }); return; }
    await require('./_lib/ads-cache').clear().catch(() => {});

    const conn = await loadConnection(readJSON);
    if (!conn.pageId) { res.status(400).json({ error: 'not_connected', message: REASONS.not_connected }); return; }
    if (!conn.userToken) { res.status(400).json({ error: 'no_user_token', message: REASONS.no_user_token }); return; }
    if (!conn.adAccountId) { res.status(400).json({ error: 'no_ad_account', message: REASONS.no_ad_account }); return; }
    const image = body.image || {};
    if (!image.base64 || typeof image.base64 !== 'string' || image.base64.length > 6e6) { res.status(400).json({ error: 'invalid_image', message: 'Imaginea lipsește sau e prea mare.' }); return; }
    // the loop (Creative → Bucla, after the owner's tap): always a new campaign, everything PAUSED, whatever the request says
    const loop = fromCreative(req) && body.origin === 'loop';
    const v = ads.cleanSettings(Object.assign({}, body.settings || {}, loop ? { paused: true, startNow: false, adsetId: '' } : {}));
    if (v.error) { res.status(400).json({ error: v.error, message: SETTINGS[v.error] || v.error }); return; }

    const r = await ads.publish(conn, { base64: image.base64, name: String(image.name || 'creative.jpg').slice(0, 80) }, v.s);
    if (r.error) { ME.log('ads-publish', r.error); res.status(400).json({ error: 'meta_refused', message: ME.action(r.error), detail: ME.clean(r.error) }); return; }
    const url = ads.adsManagerUrl(conn.adAccountId, r.campaignId);
    // what was published, for the record (Creative keeps its own link too)
    const log = await readJSON(LOG_KEY, []);
    log.unshift({ at: new Date().toISOString(), ref: String(body.ref || '').slice(0, 80), campaignId: r.campaignId, adsetId: r.adsetId, adId: r.adId,
      started: r.started, origin: loop ? 'loop' : '', city: v.s.city, budget: v.s.budget, formId: v.s.formId, name: v.s.campaignName });
    await writeJSON(LOG_KEY, log.slice(0, 300));
    res.status(200).json(Object.assign({ ok: true, url }, r));
  } catch (err) {
    ME.log('ads-publish error', err && err.message);
    res.status(500).json({ error: 'publish_failed', message: 'Reclama nu s-a publicat: ' + ME.ui(err && err.message) });
  }
};

module.exports.config = { maxDuration: 60 };
