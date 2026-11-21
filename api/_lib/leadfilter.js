// The lead filter (the owner, 21.11): every Centrul360 ad goes to the same offer ladder, asked in the Facebook form.
// One form per clinic and zone (abdomen, coapse, brațe, gușă, față, păr nedorit: Timișoara only), each asking
//   1. what bothers her (only that zone's problems), 2. when she wants the result, 3. which package (only that zone's
//   four: 14.900 / 4.990 / 990 / 390, the highest first),
// plus name and phone (filled in by Facebook), with the review step (higher intent).
// Why one form per zone and not one form with conditional questions: Meta's conditional questions need a group made
// from a CSV in Ads Manager (the API only takes the group's id, it can't make one), and they can't be tested without
// making a real form. The ad says the zone already (an abdomen ad is shown to the ones who care about the belly), so a
// form per zone asks exactly the same chain, through the API, with nothing to upload by hand. A general form (the
// zone asked first, then when and which package) is there for the ads that don't name a zone.
//
// The offer (packages: names, prices, what's in them; the messages; the pictures) is the owner's and lives in the
// store, not in this public repo: data/leadfilter.json { packages, messages, forms: { <city>: { <zone>: formId } },
// updatedAt }, pictures under leadfilter/<zone>_<tier>_<tm|ar>.jpg. It comes in through api/lead-health
// (POST ?leadfilter=content | images | templates | forms, with the key).
//
// A lead from one of these forms (api/_lib/fb-leads.js → afterLead): her zone, problem, timing and package go on the
// lead (lead.lf, a note in its history, the interest „Lead filter · <zona>”); 4.990 and 14.900 ring reception „SUNĂ
// ACUM”; at once the WhatsApp template of her zone × package × clinic (its picture in the header) leaves from her
// clinic's number; 24 hours and 3 days later a follow-up, only if she hasn't written back and isn't booked.

const { readJSON, writeJSON, writeBinary } = require('./store');
const WT = require('./wa-templates');
const WA = require('./whatsapp');

const KEY = 'data/leadfilter.json';
const LEADS_KEY = 'data/leads.json';
const CONVOS_KEY = 'data/whatsapp-conversations.json';
const CITIES = ['Timișoara', 'Arad'];
const TAG = { 'Timișoara': 'tm', Arad: 'ar' };
const CTAG = { 'Timișoara': 'TM', Arad: 'AR' };
const TIERS = ['14900', '4990', '990', '390'];
const HOT = ['14900', '4990'];
const FOLLOW = [{ k: 'f1', after: 24 * 3600e3, msg: ['follow1', 'fu_24h'] }, { k: 'f2', after: 72 * 3600e3, msg: ['follow2', 'fu_3z'] }];
const Q = { problem: 'Ce te deranjează cel mai mult?', when: 'Când vrei să vezi rezultatul?', pack: 'Ce variantă ți se potrivește?', zone: 'Ce zonă vrei să schimbi cel mai mult?' };
const DAY_FROM = 9, DAY_TO = 20; // follow-ups leave between 9 and 20, Romania time

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const nowISO = () => new Date().toISOString();
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const lei = (p) => String(p).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

async function load() { return Object.assign({ packages: null, messages: {}, forms: {}, templates: {}, updatedAt: '' }, (await readJSON(KEY, null)) || {}); }
const save = (d) => writeJSON(KEY, Object.assign(d, { updatedAt: nowISO() }));

// ---------------------------------------------------------------- the offer
function zonesOf(pk, city) { return ((pk && pk.zones) || []).filter((z) => !z.cities || !z.cities.length || z.cities.some((c) => fold(c) === fold(city) || fold(c) === fold(TAG[city]) || fold(c) === fold(CTAG[city]))); }
// a zone can have its own four (21.11, gușă: the proven 190 lei first HIFU session in place of the 390 first step):
// zones[].tiers, else the ladder's own, else 14.900 / 4.990 / 990 / 390
function tiersOf(pk, zone) {
  const z = zone && ((pk && pk.zones) || []).find((x) => x.key === zone);
  if (z && Array.isArray(z.tiers) && z.tiers.length) return z.tiers.map(String);
  return (pk && Array.isArray(pk.tiers) && pk.tiers.length ? pk.tiers : TIERS).map(String);
}
// every package a zone's answers may name: its four now, the ones its older forms still show, the ladder's own
function knownTiers(pk, zone) {
  const all = tiersOf(pk, zone).concat(Object.keys(((pk && pk.packages) || {})[zone] || {}), tiersOf(pk));
  return all.map(String).filter((t, i) => all.map(String).indexOf(t) === i);
}
function packOf(pk, zone, tier) { return (((pk && pk.packages) || {})[zone] || {})[String(tier)] || null; }
// what the form shows for a package: its own form label, else „990 lei · Mini pachet”
function packLabel(p, tier) { return clip((p && p.formLabel) || (lei((p && p.price) || tier) + ' lei · ' + ((p && p.name) || '')), 80); }
// the message of a zone × tier × clinic: messages[zone][tier][TM|AR] or messages['zone_tier_tm'], a text or { body, footer, buttons }
function msgFor(d, zone, tier, city) {
  const m = d.messages || {};
  const nested = ((m[zone] || {})[tier] || {});
  const x = nested[CTAG[city]] || nested[TAG[city]] || nested[city] || m[zone + '_' + tier + '_' + TAG[city]] || m[zone + '_' + tier + '_' + CTAG[city]] || null;
  if (!x) return null;
  return typeof x === 'string' ? { body: x } : x;
}
function followFor(d, keys, city) {
  const m = [].concat(keys).map((k) => (d.messages || {})[k]).find(Boolean);
  if (!m) return null;
  const x = typeof m === 'string' ? m : m[CTAG[city]] || m[TAG[city]] || m[city] || m.body || null;
  return x ? (typeof x === 'string' ? { body: x } : x) : null;
}
// Versions (21.11): an approved WhatsApp template can't be edited, so a new text (v2: „Doar N locuri la acest preț”
// instead of the December lot) is a new template with its own label („… · v2”) and its own pictures (leadfilter/v2/…),
// so the old approved ones keep the picture they were approved with. A lead gets the newest version Meta approved;
// until then the older one keeps going, never a lead without a message.
const VER = 2;
const tplLabel = (zone, tier, city, v) => 'LF · ' + zone + ' · ' + tier + ' · ' + CTAG[city] + (v > 1 ? ' · v' + v : '');
const followLabel = (k, city) => 'LF · urmare ' + k + ' · ' + CTAG[city];
const picPath = (zone, tier, city, v) => 'leadfilter/' + (v > 1 ? 'v' + v + '/' : '') + zone + '_' + tier + '_' + TAG[city] + '.jpg';

// ---------------------------------------------------------------- the forms
// The form input for api/_lib/fb-form-create.js createForm (its own checks: 3 screening questions, the clinic's
// WhatsApp at the end) for one clinic and zone; zone 'general' asks the zone instead of the problem.
function formInput(pk, city, zone, opts) {
  const o = opts || {};
  const tiers = tiersOf(pk, zone === 'general' ? '' : zone);
  const when = ((pk && pk.timeline) || []).map((t) => clip(t.label, 80)).filter(Boolean);
  const z = zone === 'general' ? null : zonesOf(pk, city).find((x) => x.key === zone);
  if (zone !== 'general' && !z) return { error: 'zona ' + zone + ' nu e la ' + city };
  const first = z
    ? { label: Q.problem, options: (z.problems || []).map((p) => clip(p.label, 80)).slice(0, 10) }
    : { label: Q.zone, options: zonesOf(pk, city).map((x) => clip(x.label, 80)).slice(0, 10) };
  // the general form's packages: the tiers' names as the 'general' zone has them, else the first zone's
  const pz = z ? z.key : ((pk.packages || {}).general ? 'general' : (zonesOf(pk, city)[0] || {}).key);
  const pack = { label: Q.pack, options: tiers.map((t) => packLabel(packOf(pk, pz, t), t)) };
  return {
    name: o.name || ('Lead filter · ' + (z ? z.label : 'general') + ' · ' + city),
    location: city,
    fields: ['FULL_NAME', 'PHONE'],
    questions: [first, { label: Q.when, options: when }, pack],
    headline: clip(z ? (z.headline || z.label) : 'Alege ce vrei să schimbi', 60),
    intro: z && z.intro ? z.intro : null,
    // a door form (o.volume): no review screen, more of them finish it
    quality: !o.volume,
    ending: { title: 'Mulțumim! 🤍', body: 'Am primit alegerea ta. Te sunăm în cel mai scurt timp ca să-ți găsim o oră pentru consultație, iar pe WhatsApp îți trimitem acum tot ce primești.', button: 'Scrie-ne pe WhatsApp' },
  };
}
// what would be sent to Meta, for each clinic and zone, without sending (the owner approves the offer first)
async function dryRun() {
  const d = await load();
  if (!d.packages) return { error: 'no_packages' };
  const T = require('./fb-form-template');
  const C = require('./fb-form-create');
  const template = await T.getTemplate({ readJSON, writeJSON });
  const out = [];
  for (const city of CITIES) {
    for (const zone of zonesOf(d.packages, city).map((z) => z.key).concat('general')) {
      const input = formInput(d.packages, city, zone);
      if (input.error) { out.push({ city, zone, error: input.error }); continue; }
      const c = C.clean(input, template);
      out.push(c.error ? { city, zone, error: c.error } : { city, zone, params: c.params });
    }
  }
  // which WhatsApp template each zone × package × clinic would send now (the newest approved version, else the old one)
  const tpls = (await WT.load()).templates;
  const sends = [];
  for (const city of CITIES) for (const z of zonesOf(d.packages, city)) for (const tier of tiersOf(d.packages, z.key)) {
    const t = pickTpl(tpls, z.key, tier, city);
    const nv = tplFor(tpls, tplLabel(z.key, tier, city, VER));
    sends.push({ city, zone: z.key, tier, sends: t ? t.label : '', status: t ? WT.overall(t) : 'lipsește', newest: nv ? WT.overall(nv) : 'lipsește' });
  }
  return { ok: true, forms: out, sends };
}
// makes the forms on the Page (only when asked, after the owner's yes): each registered as a lead-filter form
async function makeForms(only) {
  const d = await load();
  if (!d.packages) return { error: 'no_packages' };
  const C = require('./fb-form-create');
  const store = { readJSON, writeJSON };
  const made = [];
  for (const city of CITIES) {
    if (only && only.city && only.city !== city) continue;
    for (const zone of zonesOf(d.packages, city).map((z) => z.key).concat('general')) {
      if (only && only.zone && only.zone !== zone) continue;
      // a second form of the same zone (only.key, e.g. the 190 lei door): its own key in forms, its own name
      const fk = (only && only.key) || zone;
      if ((d.forms[city] || {})[fk]) { made.push({ city, zone, key: fk, id: d.forms[city][fk], already: true }); continue; }
      const input = formInput(d.packages, city, zone, only && only.key ? { name: clip(String(only.name || ('Lead filter · ' + fk + ' · ' + city)).replace(/\{city\}/g, city), 100), volume: !!only.volume } : null);
      if (input.error) { made.push({ city, zone, error: input.error }); continue; }
      const r = await C.createForm(store, input);
      if (r.error) { made.push({ city, zone, error: r.error }); continue; }
      const doc = await readJSON('data/fb-forms.json', {});
      doc.forms = doc.forms || {};
      doc.forms[r.form.id] = Object.assign(doc.forms[r.form.id] || {}, { kind: 'leadfilter', zone, location: city }, fk !== zone ? { variant: fk } : {});
      await writeJSON('data/fb-forms.json', doc);
      d.forms[city] = Object.assign({}, d.forms[city], { [fk]: r.form.id });
      await save(d);
      made.push({ city, zone, key: fk, id: r.form.id });
    }
  }
  return { ok: true, forms: made };
}

// ---------------------------------------------------------------- her answers
// { zone, zoneLabel, problem, problemLabel, when, whenLabel, tier, packName } from the form's answers ({ q, a })
function parse(pk, form, pairs) {
  const city = form.location || '';
  const zones = zonesOf(pk, city).length ? zonesOf(pk, city) : (pk.zones || []);
  const find = (q) => (pairs || []).find((p) => fold(p.q) === fold(q));
  const out = { zone: form.zone && form.zone !== 'general' ? form.zone : '', problem: '', problemLabel: '', when: '', whenLabel: '', tier: '', packName: '' };
  if (!out.zone) {
    const a = find(Q.zone);
    const z = a && zones.find((x) => fold(x.label) === fold(a.a));
    if (z) out.zone = z.key;
  }
  const z = zones.find((x) => x.key === out.zone);
  out.zoneLabel = z ? z.label : '';
  const pa = find(Q.problem);
  if (pa) { const p = z && (z.problems || []).find((x) => fold(x.label) === fold(pa.a)); out.problem = p ? p.key : ''; out.problemLabel = p ? p.label : clip(pa.a, 80); }
  const wa = find(Q.when);
  if (wa) { const t = (pk.timeline || []).find((x) => fold(x.label) === fold(wa.a)); out.when = t ? t.key : ''; out.whenLabel = t ? t.label : clip(wa.a, 60); }
  const ka = find(Q.pack);
  if (ka) {
    const pz = out.zone || 'general';
    const known = knownTiers(pk, pz);
    const tier = known.find((t) => fold(packLabel(packOf(pk, pz, t), t)) === fold(ka.a) || fold(packLabel(packOf(pk, out.zone, t), t)) === fold(ka.a))
      // a label changed since the form was made: the price at the start of the answer says the tier
      || known.find((t) => new RegExp('^\\D*' + lei(t).replace('.', '\\.?') + '(\\D|$)').test(ka.a))
      || known.find((t) => new RegExp('(^|\\D)' + lei(t).replace('.', '\\.?') + '(\\D|$)').test(ka.a));
    out.tier = tier || '';
    const p = tier && (packOf(pk, out.zone, tier) || packOf(pk, 'general', tier));
    out.packName = p ? clip(p.name, 60) : clip(ka.a, 60);
  }
  return out;
}
const summary = (x) => [x.zoneLabel, x.problemLabel && x.problemLabel.toLowerCase(), x.tier && (lei(x.tier) + ' ' + (x.packName || '')).trim(), x.whenLabel && x.whenLabel.toLowerCase()].filter(Boolean).join(' · ');

// ---------------------------------------------------------------- after a lead
// what the template's variables say for her
function varsFor(lead, x) {
  const W = require('./workflows');
  return { prenume: W.firstName(lead.name) || 'dragă', problema: (x.problemLabel || x.zoneLabel || 'zona ta').replace(/\s*\(([^)]*)\)/g, ', $1').toLowerCase(), locatie: lead.location || '', nume: lead.name || '', telefon: lead.phone || '' };
}
// the template of a label: an approved one first (two runs at once may have left a second copy of a label)
function tplFor(tpls, label) { const l = tpls.filter((t) => t.label === label); return l.find((t) => WT.overall(t) === 'APPROVED') || l.find((t) => WT.overall(t) === 'PENDING') || l[0] || null; }
// the template a zone × tier × clinic sends: the newest approved version, else the oldest one there (v1 while v2 waits)
function pickTpl(tpls, zone, tier, city) {
  const all = [];
  for (let v = VER; v >= 1; v--) { const t = tplFor(tpls, tplLabel(zone, tier, city, v)); if (t) all.push(t); }
  return all.find((t) => WT.overall(t) === 'APPROVED') || all[all.length - 1] || null;
}

// the lead's lead-filter answers, its note, the call for 4.990 / 14.900, and the message: never throws
async function afterLead(lead, x, city) {
  try {
    if (!lead || !lead.id || !x) return;
    const at = nowISO();
    const leads = await readJSON(LEADS_KEY, []);
    const l = leads.find((y) => y.id === lead.id);
    if (!l) return;
    const prev = l.lf || {};
    l.lf = Object.assign({}, { zone: x.zone, zoneLabel: x.zoneLabel, problem: x.problem, problemLabel: x.problemLabel, when: x.when, whenLabel: x.whenLabel, tier: x.tier, packName: x.packName, city, at },
      // a second form from her keeps what was sent before for the same package
      prev.tier === x.tier && prev.zone === x.zone ? { sentAt: prev.sentAt, tplId: prev.tplId, f1At: prev.f1At, f2At: prev.f2At } : {});
    l.activities = l.activities || [];
    l.activities.push({ id: require('crypto').randomUUID(), type: 'note', text: 'Lead filter: ' + summary(x) + (HOT.includes(x.tier) ? ' · SUNĂ ACUM' : ''), author: l.source === 'site' ? 'Site' : 'Facebook Lead Ads', at });
    await writeJSON(LEADS_KEY, leads);
    if (HOT.includes(x.tier)) {
      const N = require('./notify');
      const ids = await N.deskIds({ readJSON }, city);
      await N.notifyMany({ readJSON, writeJSON }, ids, { kind: 'lead', tone: 'good', go: 'pipeline', tag: 'lf-' + lead.id, ownerPush: true,
        title: 'SUNĂ ACUM 🔥 ' + lei(x.tier) + ' lei · ' + (lead.name || 'lead nou'), text: summary(x) + ' · ' + (city || '') + '. A ales pachetul mare: sun-o în 5 minute.' }).catch((e) => console.error('lf notify:', e.message));
    }
    await sendFirst(l, x, city);
  } catch (err) { console.error('leadfilter.afterLead:', err.message); }
}
async function note(leadId, text, patch) {
  const leads = await readJSON(LEADS_KEY, []);
  const l = leads.find((y) => y.id === leadId);
  if (!l) return;
  if (text) (l.activities = l.activities || []).push({ id: require('crypto').randomUUID(), type: 'note', text, author: 'WhatsApp automat', at: nowISO() });
  if (patch) l.lf = Object.assign({}, l.lf, patch);
  await writeJSON(LEADS_KEY, leads);
}
async function sendFirst(lead, x, city) {
  if (!x.zone || !x.tier) return note(lead.id, 'Mesajul lead filter n-a plecat: nu se știe zona sau pachetul ales.', { tried: true });
  // Meta's test leads carry a pretend number: never a message to it
  if (/700000000$/.test(String(lead.phone || '').replace(/\D/g, '')) || /test lead/i.test(String(lead.name || ''))) return note(lead.id, 'Lead de test: mesajul lead filter nu pleacă.', { tried: true });
  const W = require('./workflows');
  const wa = { tpls: (await WT.load()).templates, cfg: await WA.loadConfig() };
  const t = pickTpl(wa.tpls, x.zone, x.tier, city);
  // the first time it can't leave (a new package's template still waiting for Meta, WhatsApp down): a note, and her
  // clinic's desk is told to call her; it's tried again for 6 hours, never with another package's template
  const once = async (text) => {
    if (lead.lf && lead.lf.tried) return note(lead.id, '', null);
    await note(lead.id, text, { tried: true });
    if (/test lead/i.test(String(lead.name || ''))) return;
    const N = require('./notify');
    const ids = await N.deskIds({ readJSON }, city).catch(() => []);
    await N.notifyMany({ readJSON, writeJSON }, ids, { kind: 'lead', tone: 'warn', go: 'pipeline', tag: 'lf-nomsg-' + lead.id,
      title: 'Sun-o: ' + (lead.name || 'lead nou') + ' · ' + lei(x.tier) + ' lei', text: summary(x) + ' · ' + (city || '') + '. Mesajul pe WhatsApp n-a plecat încă: sun-o tu.' }).catch((e) => console.error('lf notify:', e.message));
  };
  if (!t) return once('Mesajul lead filter n-a plecat: lipsește șablonul ' + tplLabel(x.zone, x.tier, city, VER) + '.');
  const r = await W.sendOnce('lf|' + lead.id + '|' + t.id, () => W.sendTemplate(wa, t.id, city, lead.phone, varsFor(lead, x)));
  if (r.dup) return;
  if (!r.sent) return once('Mesajul lead filter n-a plecat: ' + r.why);
  await note(lead.id, 'WhatsApp lead filter trimis („' + t.label + '”, de pe numărul ' + r.city + ')', { sentAt: nowISO(), tplId: t.id });
}

// ---------------------------------------------------------------- the follow-ups
// she wrote on WhatsApp after a moment (her own message, any text)
function wroteSince(convos, phone, since) {
  const { normalizePhone } = require('./clients');
  const p = normalizePhone(phone) || String(phone || '');
  const c = (convos || []).find((x) => x.phone === p);
  return !!(c && (c.messages || []).some((m) => m.direction === 'in' && String(m.timestamp || '') > since));
}
function roHour(ms) { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hour12: false }).format(new Date(ms))); }
// hourly (api/automation-tick.js): the 24 h and 3 days follow-ups, between 9 and 20, to whoever hasn't written back and
// isn't booked (a stage from „Programare stabilită” on, or an appointment); at most 40 a run
async function followups(now) {
  const t = now || Date.now();
  const h = roHour(t);
  if (h < DAY_FROM || h >= DAY_TO) return { skipped: 'night' };
  const all = (await readJSON(LEADS_KEY, [])).filter((l) => l.lf);
  // a first message that couldn't leave (its template not approved yet, WhatsApp down): tried again for 6 hours
  for (const l of all.filter((x) => !x.lf.sentAt && x.lf.zone && x.lf.tier && t - Date.parse(x.lf.at) < 6 * 3600e3).slice(0, 20)) await sendFirst(l, l.lf, l.lf.city || l.location).catch(() => null);
  const leads = all.filter((l) => l.lf.sentAt);
  if (!leads.length) return { sent: 0 };
  const d = await load();
  const W = require('./workflows');
  const stages = await require('../portal-leads').loadStages();
  const idx = (id) => stages.findIndex((s) => s.id === id);
  const booked = stages.find((s) => s.kind === 'booked');
  const isBooked = (l) => !!l.appointmentId || ['won', 'lost'].includes((stages.find((s) => s.id === l.stage) || {}).kind) || (booked && idx(l.stage) >= idx(booked.id));
  const convos = await readJSON(CONVOS_KEY, []);
  const wa = { tpls: (await WT.load()).templates, cfg: await WA.loadConfig() };
  let sent = 0;
  for (const l of leads) {
    if (sent >= 40) break;
    for (const f of FOLLOW) {
      if (l.lf[f.k + 'At'] || t - Date.parse(l.lf.sentAt) < f.after || t - Date.parse(l.lf.sentAt) > f.after + 48 * 3600e3) continue;
      if (isBooked(l) || wroteSince(convos, l.phone, l.lf.sentAt)) { await note(l.id, '', { [f.k + 'At']: 'nu' }); break; }
      const city = l.lf.city || l.location;
      const tpl = tplFor(wa.tpls, followLabel(f.k, city));
      if (!tpl || !followFor(d, f.msg, city)) break;
      const r = await W.sendOnce('lf|' + l.id + '|' + tpl.id, () => W.sendTemplate(wa, tpl.id, city, l.phone, varsFor(l, l.lf)));
      if (!r.dup) { await note(l.id, r.sent ? 'WhatsApp lead filter, urmarea ' + (f.k === 'f1' ? '24 de ore' : '3 zile') + ' trimisă' : 'Urmarea lead filter n-a plecat: ' + r.why, r.sent ? { [f.k + 'At']: nowISO() } : null); if (r.sent) sent++; }
      break;
    }
  }
  return { sent };
}

// ---------------------------------------------------------------- the content and the templates
// { packages, messages } from the owner's campaign (the producer's files): checked a little, kept
async function saveContent(b) {
  const d = await load();
  if (b && b.packages) {
    const pk = b.packages;
    if (!Array.isArray(pk.zones) || !pk.zones.length || !pk.packages) return { error: 'packages: zones și packages lipsesc' };
    d.packages = pk;
  }
  if (b && b.messages && typeof b.messages === 'object') d.messages = b.messages;
  await save(d);
  return { ok: true, zones: (d.packages && d.packages.zones || []).map((z) => z.key), messages: Object.keys(d.messages || {}).length };
}
// pictures: [{ key: '<zone>_<tier>_<tm|ar>', dataUrl: data:image/jpeg;base64,… }], { version } for a new version's pictures
async function saveImages(b) {
  const out = [];
  const v = Number(b && b.version) || 1;
  for (const it of (Array.isArray(b && b.items) ? b.items : [])) {
    const key = String(it.key || '').toLowerCase();
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(it.dataUrl || ''));
    if (!/^[a-z0-9-]+_\d{3,5}_(tm|ar)$/.test(key) || !m) { out.push({ key, error: 'bad' }); continue; }
    await writeBinary('leadfilter/' + (v > 1 ? 'v' + v + '/' : '') + key + '.jpg', Buffer.from(m[1], 'base64'), 'image/jpeg');
    out.push({ key, ok: true });
  }
  return { ok: true, images: out };
}
// the WhatsApp templates (MARKETING, the picture in the header): one per zone × tier × clinic, plus the two follow-ups
// per clinic. Kept here as drafts; sent to Meta only with { submit: true } (and only drafts / refused ones)
async function templates(b) {
  const d = await load();
  if (!d.packages) return { error: 'no_packages' };
  const { readBinary } = require('./store');
  // { version }: which version's templates (the newest by default); the follow-ups only with v1 or { follow: true }
  const v = Math.min(VER, Math.max(1, Number(b && b.version) || VER));
  const w = await WT.load();
  // one template per label: a copy left by two runs at the same time goes (the one Meta took stays)
  const rank = (t) => ({ APPROVED: 0, PENDING: 1, REJECTED: 2 }[WT.overall(t)] ?? 3);
  const keep = new Map();
  w.templates.filter((t) => t.leadfilter).forEach((t) => { const k = keep.get(t.label); if (!k || rank(t) < rank(k)) keep.set(t.label, t); });
  const drop = w.templates.filter((t) => t.leadfilter && keep.get(t.label) !== t);
  // a copy that points to the same template at Meta as the one kept goes only from here (deleting it would delete both)
  const metaIds = (t) => Object.values(t.meta || {}).map((m) => m && m.id).filter(Boolean);
  for (const t of drop) {
    const kept = metaIds(keep.get(t.label));
    if (metaIds(t).length && !metaIds(t).some((id) => kept.includes(id))) await WT.remove(w, t.id).catch(() => null); else w.templates = w.templates.filter((x) => x !== t);
  }
  if (drop.length) await WT.save(w);
  const out = [];
  const upsert = async (label, city, m, pic) => {
    const prev = w.templates.find((t) => t.label === label);
    // Meta refuses a message that ends with a variable („… la clinica din {locatie}.”): the signature goes after it
    const body = /\{\w+\}[\s.!?…]*$/.test(String(m.body || '').trim()) ? String(m.body).trim() + '\n\nEchipa Centrul360' : m.body;
    const c = WT.clean({ label, category: 'MARKETING', headerType: pic ? 'IMAGE' : '', body, footer: m.footer || 'Centrul360', only: [city],
      buttons: (m.buttons || ['Vreau o programare', 'Am o întrebare']).map((x) => (typeof x === 'string' ? { type: 'QUICK_REPLY', text: x } : x)) }, prev);
    if (c.error) { out.push({ label, error: c.error }); return; }
    const t = c.t;
    if (pic) { t.samplePath = pic; t.headerImagePath = pic; }
    t.leadfilter = label;
    if (prev) w.templates[w.templates.indexOf(prev)] = t; else w.templates.push(t);
    await WT.save(w);
    let r = { ok: true };
    if (b && b.submit && ['DRAFT', 'REJECTED'].includes(WT.overall(t))) { r = await WT.submit(w, t.id, [city]); await WT.save(w); }
    out.push({ label, name: t.name, status: WT.overall(t), error: r.error || '' });
  };
  for (const city of CITIES) {
    for (const z of zonesOf(d.packages, city)) {
      for (const tier of tiersOf(d.packages, z.key)) {
        // { only: { zone, tier } }: just that package's templates (a new one, the approved ones untouched)
        if (b && b.only && ((b.only.zone && b.only.zone !== z.key) || (b.only.tier && String(b.only.tier) !== tier))) continue;
        const m = msgFor(d, z.key, tier, city);
        if (!m) { out.push({ label: tplLabel(z.key, tier, city, v), error: 'fără mesaj' }); continue; }
        const pic = picPath(z.key, tier, city, v);
        const has = await readBinary(pic).catch(() => null);
        await upsert(tplLabel(z.key, tier, city, v), city, m, has ? pic : '');
      }
    }
    // the general form's leads get the message of the zone they picked (same templates); the follow-ups
    if (!(b && b.only) && (v === 1 || (b && b.follow))) for (const f of FOLLOW) { const m = followFor(d, f.msg, city); if (m) await upsert(followLabel(f.k, city), city, m, ''); }
  }
  return { ok: true, templates: out };
}

// ---------------------------------------------------------------- the numbers
// per zone, package and clinic, today and the last 7 days: leads, messaged, wrote back, booked (no names, no phones)
async function kpi(now) {
  const t = now || Date.now();
  const day = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(ms));
  const today = day(t), since7 = day(t - 6 * 864e5);
  const leads = (await readJSON(LEADS_KEY, [])).filter((l) => l.lf && l.lf.at);
  const stages = await require('../portal-leads').loadStages().catch(() => []);
  const booked = stages.find((s) => s.kind === 'booked');
  const idx = (id) => stages.findIndex((s) => s.id === id);
  const isBooked = (l) => !!l.appointmentId || ['won'].includes((stages.find((s) => s.id === l.stage) || {}).kind) || (booked && idx(l.stage) >= idx(booked.id) && (stages.find((s) => s.id === l.stage) || {}).kind !== 'lost');
  const convos = await readJSON(CONVOS_KEY, []);
  const blank = () => ({ leads: 0, messaged: 0, replied: 0, booked: 0, hot: 0 });
  const add = (o, l) => { o.leads++; if (l.lf.sentAt) o.messaged++; if (l.lf.sentAt && wroteSince(convos, l.phone, l.lf.sentAt)) o.replied++; if (isBooked(l)) o.booked++; if (HOT.includes(l.lf.tier)) o.hot++; };
  const out = { at: new Date(t).toISOString(), today: blank(), week: blank(), byCity: {}, byZone: {}, byTier: {}, byZoneTier: {} };
  for (const l of leads) {
    const d = day(Date.parse(l.lf.at));
    if (d < since7) continue;
    const city = l.lf.city || l.location || '?', zone = l.lf.zone || '?', tier = l.lf.tier || '?';
    add(out.week, l);
    if (d === today) add(out.today, l);
    [[out.byCity, city], [out.byZone, zone], [out.byTier, tier], [out.byZoneTier, zone + ' · ' + tier]].forEach(([m, k]) => { m[k] = m[k] || { week: blank(), today: blank() }; add(m[k].week, l); if (d === today) add(m[k].today, l); });
  }
  const d = await load();
  out.forms = d.forms;
  out.ready = { packages: !!d.packages, messages: Object.keys(d.messages || {}).length };
  return out;
}

// ---------------------------------------------------------------- the check with Meta's test leads
// A test lead on every lead-filter form (Meta's /{form}/test_leads, the same path as a real one: webhook or the forms'
// reading), each with a different problem, timing and package; while form.quietTests holds, fb-leads reads it, decides
// it and writes the result here (no Pipeline lead, no alert, no WhatsApp). GET ?leadfilter=tests shows the results.
const TESTS_KEY = 'data/leadfilter-tests.json';
async function testResult(formId, form, x, pairs) {
  const d = await load();
  const city = form.location || '';
  const tpls = (await WT.load()).templates;
  const t = x.zone && x.tier ? pickTpl(tpls, x.zone, x.tier, city) : null;
  const label = t ? t.label : x.zone && x.tier ? tplLabel(x.zone, x.tier, city, VER) : '';
  const m = x.zone && x.tier ? msgFor(d, x.zone, x.tier, city) : null;
  const list = await readJSON(TESTS_KEY, []);
  const r = { at: nowISO(), formId, city, form: form.name, answers: pairs, parsed: summary(x), zone: x.zone, problem: x.problem, when: x.when, tier: x.tier,
    template: label, templateStatus: t ? WT.overall(t) : 'lipsește', picture: !!(t && WT.imageOf(t)), message: m ? String(m.body || '').slice(0, 160) : '',
    hot: HOT.includes(x.tier), wouldSend: !!(t && WT.overall(t) === 'APPROVED') };
  list.unshift(r);
  await writeJSON(TESTS_KEY, list.slice(0, 60));
  return 'test lead filter: ' + r.parsed + ' → ' + (r.wouldSend ? 'ar pleca ' + label : 'n-ar pleca (' + r.templateStatus + ')');
}
async function testForms() {
  const { loadConnection, GRAPH_BASE } = require('./facebook');
  const conn = await loadConnection(readJSON);
  if (!conn.pageAccessToken) return { error: 'Facebook nu e conectat' };
  const doc = await readJSON('data/fb-forms.json', {});
  const ids = Object.keys(doc.forms || {}).filter((id) => doc.forms[id].kind === 'leadfilter');
  const until = new Date(Date.now() + 20 * 60e3).toISOString();
  ids.forEach((id) => { doc.forms[id].quietTests = until; });
  await writeJSON('data/fb-forms.json', doc);
  const out = [];
  let k = 0;
  for (const id of ids) {
    const f = doc.forms[id];
    const qs = (f.questions || []).filter((q) => q.type === 'CUSTOM');
    const field_data = [{ name: 'full_name', values: ['Test lead Centrul360'] }, { name: 'phone_number', values: ['+40700000000'] }]
      .concat(qs.map((q, i) => ({ name: q.key, values: [String((q.options[(i === 2 ? k : k + i) % q.options.length] || {}).value || '')] })));
    const call = async (method, body) => {
      const r = await fetch(GRAPH_BASE + '/' + id + '/test_leads' + (method === 'GET' ? '?access_token=' + encodeURIComponent(conn.pageAccessToken) : ''), method === 'GET' ? {} :
        { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ access_token: conn.pageAccessToken }, body || {})) });
      return { ok: r.ok, j: await r.json().catch(() => ({})) };
    };
    // one test lead per form at Meta: an older one goes first
    const old = await call('GET');
    for (const l of ((old.j && old.j.data) || [])) await fetch(GRAPH_BASE + '/' + l.id + '?access_token=' + encodeURIComponent(conn.pageAccessToken), { method: 'DELETE' }).catch(() => null);
    const r = await call('POST', { field_data });
    out.push({ formId: id, city: f.location, zone: f.zone, ok: r.ok, lead: r.j.id || '', error: r.ok ? '' : ((r.j.error && (r.j.error.error_user_msg || r.j.error.message)) || 'eroare') });
    k++;
  }
  return { ok: true, until, tests: out };
}
async function tests() { return { ok: true, results: await readJSON(TESTS_KEY, []) }; }

module.exports = { testResult, testForms, tests, KEY, TIERS, HOT, Q, load, save, zonesOf, tiersOf, knownTiers, formInput, dryRun, makeForms, parse, summary, afterLead, followups, saveContent, saveImages, templates, kpi, tplLabel, msgFor };
