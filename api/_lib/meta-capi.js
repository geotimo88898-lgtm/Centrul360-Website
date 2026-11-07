// Meta Conversions API (CAPI): what the server tells Meta, next to the browser pixel.
//   - The site: Lead (the gift form, /api/site-lead) and Schedule (the online booking, /api/booking). The browser makes
//     the event_id, gives it to its pixel event ({ eventID }) and sends it with the form, so Meta counts each one once.
//     Without an id from the browser nothing is sent from here (the pixel's event alone, never counted twice).
//   - The CRM (the quality loop): a lead from a Facebook lead form keeps its Facebook lead id on the lead
//     (lead.forms[].leadgenId). Each step she really reaches goes back to Meta once, as its "Conversion Leads"
//     optimisation expects (action_source system_generated, user_data.lead_id, custom_data.event_source "crm"):
//       Lead_nou   she came in from the form
//       Contactat  the desk reached her (a call or message she answered, or a "contacted" stage)
//       Programat  an appointment was made for her (or the booked stage)
//       Venit      she came: the appointment done or paid (or a stage after the booked one)
//       Client     she paid (Încasări), with what she paid in RON (or the won stage)
//     Which Pipeline stage is which step is set in Admin → Integrări → Conversions API (data/meta-capi.json); a stage
//     left out sends nothing. A higher step also counts the ones under it (a client came, was booked, was contacted).
//     Each step goes once per Facebook lead (a mark per event, locks/capi/…), however often the stage is set again.
//
// When anything goes out (modeOf): only once a web pixel's id is set (there is no default: the owner makes the pixel in
// his own Business and puts its id in Integrări), and then only with a Test Events code set (only to Test Events), or
// with "Trimite live" on and no test code. Until then nothing leaves. The token is the one kept for the ads (Integrări → Facebook,
// conn.userToken), read the way _lib/meta-ads.js reads it; it is never logged and never sent to the browser.
// Personal data goes hashed (SHA-256): the phone as digits with the country code (40…), the email trimmed and in
// lower case, the CRM lead id as external_id. No treatment names are sent from here.
// A failure never breaks the caller: every export catches, logs one short line without personal data, and moves on.

const crypto = require('crypto');
const { readJSON, writeJSON, createOnce, removeBinary } = require('./store');

const GRAPH = 'https://graph.facebook.com/v25.0'; // the version the ads use (_lib/meta-ads.js)
const DEFAULT_PIXEL = ''; // none: the web pixel's id is set in Integrări (nothing is sent while it's empty)
const CFG_KEY = 'data/meta-capi.json';
const STATUS_KEY = 'data/meta-capi-status.json';
const SENT_KEY = 'data/meta-capi-sent.json';
const SITE = 'https://centrul360.com';
const DAY = 864e5;
const MAX_AGE = 7 * DAY - 3600e3; // Meta refuses a whole batch with an event older than 7 days
const LEAD_WINDOW = 90 * DAY; // the CRM steps of the Facebook leads of the last 90 days
const KEEP_SENT = 120 * DAY;
const TIMEOUT = 6000;
const CHUNK = 200;
const LEAD_SOURCE = 'Centrul360 CRM';

// the CRM steps, in funnel order (the names Meta shows in Events Manager)
const CRM_EVENTS = [
  { key: 'Lead_nou', label: 'Lead nou' },
  { key: 'Contactat', label: 'Contactat' },
  { key: 'Programat', label: 'Programat' },
  { key: 'Venit', label: 'Venit la programare' },
  { key: 'Client', label: 'Client (a plătit)' },
];
const ORDER = CRM_EVENTS.map((e) => e.key);
const SITE_EVENTS = ['Lead', 'Schedule'];
// a contact logged with one of these: she answered (portal-leads.js VALID_OUTCOMES)
const REACHED = ['raspuns', 'interesat', 'revine', 'programat', 'refuz'];
// the Pipeline's stages when none are saved (api/portal-leads.js DEFAULT_STAGES)
const DEFAULT_STAGES = [
  { id: 'lead_nou', name: 'Lead nou', kind: 'open' }, { id: 'contactat', name: 'Contactat', kind: 'open' },
  { id: 'programare_stabilita', name: 'Programare stabilită', kind: 'booked' }, { id: 'venit_la_programare', name: 'Venit la programare', kind: 'open' },
  { id: 'client_fidel', name: 'Client fidel', kind: 'won' }, { id: 'pierdut', name: 'Pierdut', kind: 'lost' },
];
const TEST_RE = /^[A-Za-z0-9_-]{4,40}$/;
const PIXEL_RE = /^\d{10,20}$/;
const EID_RE = /^[A-Za-z0-9._:-]{8,80}$/;

const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const digits9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const short = (e) => String((e && e.message) || e || '').replace(/\s+/g, ' ').slice(0, 160);
const nowISO = () => new Date().toISOString();
const roDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t));

// ---------------------------------------------------------------- normalising and hashing
// A phone as Meta wants it: digits only, with the country code (07xx xxx xxx → 407xxxxxxxx). '' when it isn't one.
function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (/^400\d{9}$/.test(d)) d = '40' + d.slice(3); // +40 0745… typed with both
  else if (/^0[1-9]\d{8}$/.test(d)) d = '40' + d.slice(1); // a Romanian number written with the 0
  else if (/^[237]\d{8}$/.test(d)) d = '40' + d; // written without the 0
  return d.length >= 10 && d.length <= 15 && d[0] !== '0' ? d : '';
}
function normEmail(e) {
  const s = String(e || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}
// user_data: what identifies the person, hashed; the browser's own details as they are (Meta's rules)
function userData(o) {
  const u = {};
  const ph = normPhone(o.phone);
  if (ph) u.ph = [sha(ph)];
  const em = normEmail(o.email);
  if (em) u.em = [sha(em)];
  if (o.externalId) u.external_id = [sha(String(o.externalId))];
  if (o.ip) u.client_ip_address = o.ip;
  if (o.ua) u.client_user_agent = o.ua;
  if (o.fbp) u.fbp = o.fbp;
  if (o.fbc) u.fbc = o.fbc;
  if (o.leadId && /^\d{5,25}$/.test(String(o.leadId))) u.lead_id = String(o.leadId); // written as a number, see dataJson()
  return u;
}
// the batch as Meta reads it; lead_id is a number there (a Facebook id is too long for a JS number, so it's put in as text)
function dataJson(events) {
  return JSON.stringify(events).replace(/"lead_id":"(\d{5,25})"/g, '"lead_id":$1');
}

// ---------------------------------------------------------------- the request (site events)
function cookies(header) {
  const out = {};
  String(header || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > 0) { const k = c.slice(0, i).trim(); if (!(k in out)) { try { out[k] = decodeURIComponent(c.slice(i + 1).trim()); } catch (e) { out[k] = c.slice(i + 1).trim(); } } }
  });
  return out;
}
// a page of the site only (centrul360.com and its subdomains)
function siteUrl(u) {
  try {
    const x = new URL(String(u || ''));
    return x.protocol === 'https:' && /(^|\.)centrul360\.com$/.test(x.hostname) ? x.href.slice(0, 1000) : '';
  } catch (e) { return ''; }
}
function fromRequest(req, pageUrl) {
  const h = (req && req.headers) || {};
  const ip = String(h['cf-connecting-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim();
  const ck = cookies(h.cookie);
  const fbp = /^fb\.[0-2]\.\d{10,14}\.\d{1,25}$/.test(ck._fbp || '') ? ck._fbp : '';
  let fbc = /^fb\.[0-2]\.\d{10,14}\.[\w.-]{8,700}$/.test(ck._fbc || '') ? ck._fbc : '';
  const url = siteUrl(pageUrl) || siteUrl(h.referer);
  // came from an ad but the pixel hasn't kept the click yet: the click id from the page's address
  if (!fbc && url) { const id = new URL(url).searchParams.get('fbclid'); if (id && /^[\w.-]{8,700}$/.test(id)) fbc = 'fb.1.' + Date.now() + '.' + id; }
  return { ip: /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : '', ua: String(h['user-agent'] || '').slice(0, 512), fbp, fbc, url };
}

// ---------------------------------------------------------------- settings
function cleanMap(m) {
  const out = {};
  if (m && typeof m === 'object') Object.keys(m).slice(0, 40).forEach((k) => { if (/^[a-z0-9_]{2,40}$/.test(k)) out[k] = ORDER.includes(m[k]) ? m[k] : ''; });
  return out;
}
function cleanConfig(x) {
  const c = x && typeof x === 'object' ? x : {};
  return {
    pixelId: PIXEL_RE.test(String(c.pixelId || '')) ? String(c.pixelId) : '',
    on: c.on !== false,
    testCode: TEST_RE.test(String(c.testCode || '')) ? String(c.testCode) : '',
    live: c.live === true,
    map: cleanMap(c.map),
    savedAt: c.savedAt || '', savedBy: c.savedBy || '', liveAt: c.liveAt || '', liveBy: c.liveBy || '',
  };
}
const loadConfig = async () => cleanConfig(await readJSON(CFG_KEY, {}));
// off: switched off · nopixel: no pixel id yet · idle: no test code and not live · test: only to Test Events · live.
// Only test and live send anything.
const SENDS = ['test', 'live'];
function modeOf(cfg) {
  if (!cfg.on) return 'off';
  if (!PIXEL_RE.test(String(cfg.pixelId || ''))) return 'nopixel';
  if (cfg.testCode) return 'test';
  return cfg.live ? 'live' : 'idle';
}

// Which Meta step a Pipeline stage is, unless the admin chose: the first working stage is Lead_nou, the booked one
// Programat, the won one Client; between booked and won Venit (Client when its name says a purchase); before booked
// only a stage whose name says she was reached is Contactat ("Day 2", "Nu răspunde", "Mesaj nelivrat" send nothing);
// the lost stage and the side stages after won send nothing.
function defaultEvent(stages, i) {
  const s = stages[i] || {};
  const name = fold(s.name) + ' ' + fold(String(s.id || '').replace(/_/g, ' '));
  const booked = stages.findIndex((x) => x.kind === 'booked');
  const won = stages.findIndex((x) => x.kind === 'won');
  const first = stages.findIndex((x) => x.kind === 'open' || x.kind === 'booked');
  if (s.kind === 'lost') return '';
  if (s.kind === 'won') return 'Client';
  if (s.kind === 'booked') return 'Programat';
  if (i === first) return 'Lead_nou';
  if (/nelivrat|undeliver|nu raspun|necontact|fara raspuns|gresit|refuz/.test(name)) return '';
  if (booked >= 0 && i > booked && (won < 0 || i < won)) return /pachet|cumpar|plat|achit|client/.test(name) ? 'Client' : 'Venit';
  if (won >= 0 && i > won) return '';
  if (/contact|raspuns|interes|calificat|discut/.test(name)) return 'Contactat';
  return '';
}
// stage id → Meta step ('' = nothing), the admin's choice first
function stageEvents(stages, map) {
  const m = new Map();
  (stages || []).forEach((s, i) => {
    const own = map && Object.prototype.hasOwnProperty.call(map, s.id) ? map[s.id] : null;
    m.set(s.id, s.kind === 'lost' ? '' : own != null ? own : defaultEvent(stages, i));
  });
  return m;
}
async function loadStages() {
  const st = await readJSON('data/pipeline-stages.json', null);
  return Array.isArray(st) && st.length ? st : DEFAULT_STAGES;
}

// ---------------------------------------------------------------- what one lead reached (pure, tested)
// The newest Facebook form of the lead with its Facebook lead id: { id, t } or null
function leadgenOf(lead) {
  const list = ((lead && lead.forms) || []).filter((f) => f && /^\d{5,25}$/.test(String(f.leadgenId || '')))
    .map((f) => ({ id: String(f.leadgenId), t: Date.parse(f.sentAt || f.at || lead.createdAt) }))
    .filter((x) => Number.isFinite(x.t)).sort((a, b) => b.t - a.t);
  return list[0] || null;
}
const apptStart = (a) => Date.parse(String(a.date || '') + 'T' + (/^\d{2}:\d{2}/.test(a.time || '') ? a.time.slice(0, 5) : '12:00') + ':00+02:00');
// The steps the lead reached since her (newest) Facebook form, each with its moment and the Client's value.
// ctx: { stages, map (stage → step), appointments, sales, hints: [{ stage, at }], now }
// Only what happened from a day before that form counts (a lead who comes back is measured from her new form).
function crmReached(lead, ctx) {
  const lg = leadgenOf(lead);
  if (!lg) return null;
  const c = ctx || {};
  const now = c.now || Date.now();
  const since = lg.t - DAY;
  const stages = c.stages || DEFAULT_STAGES;
  const map = c.map || stageEvents(stages, {});
  const at = {};
  const hit = (ev, t) => {
    if (!ORDER.includes(ev)) return;
    const x = Number.isFinite(t) ? t : now;
    if (x < since) return;
    const v = Math.min(Math.max(x, lg.t), now);
    if (!(ev in at) || v < at[ev]) at[ev] = v;
  };
  hit('Lead_nou', lg.t);
  const kind = (stages.find((s) => s.id === lead.stage) || {}).kind;
  if (kind !== 'lost') hit(map.get(lead.stage) || '', Date.parse(lead.stageChangedAt || lead.updatedAt || ''));
  (c.hints || []).forEach((h) => { if (h && h.stage) hit(map.get(h.stage) || '', h.at ? Date.parse(h.at) : now); });
  (lead.activities || []).forEach((a) => {
    if (!a) return;
    if (a.type === 'contact' && REACHED.includes(a.outcome)) hit('Contactat', Date.parse(a.at));
    if (a.type === 'booking') hit('Programat', Date.parse(a.at));
  });
  // her appointments (linked to her, on her card, her client's, her phone's), like _lib/ads-funnel.js
  const p9 = digits9(lead.phone), formDay = roDay(lg.t);
  const mine = (c.appointments || []).filter((a) => a && !a.block && a.status !== 'concediu' &&
    (a.leadId === lead.id || (lead.appointmentId && a.id === lead.appointmentId) || (lead.clientId && a.clientId === lead.clientId) || (p9.length === 9 && digits9(a.clientPhone) === p9)))
    .filter((a) => { const t = Date.parse(a.createdAt || '') || apptStart(a); return t >= since || (t >= lg.t - 14 * DAY && String(a.date) >= formDay); });
  mine.forEach((a) => {
    const made = Date.parse(a.createdAt || '') || apptStart(a);
    if (a.status !== 'anulata') hit('Programat', Math.max(made, lg.t));
    if ((a.status === 'finalizata' && !a.noShow) || a.paidSaleId) hit('Venit', Date.parse(a.paidAt || a.updatedAt || '') || apptStart(a));
  });
  // her payments since the form: Client, with what she paid
  const apptIds = new Set(mine.map((a) => a.id));
  const clientIds = new Set([lead.clientId].concat(mine.map((a) => a.clientId)).filter(Boolean));
  const pays = (c.sales || []).filter((s) => s && s.source === 'incasare' && (apptIds.has(s.appointmentId) || clientIds.has(s.clientId)) && Date.parse(s.createdAt || s.date) >= since);
  let value = 0;
  if (pays.length) {
    hit('Client', Math.min(...pays.map((s) => Date.parse(s.createdAt || s.date))));
    value = Math.round(pays.reduce((n, s) => n + (Number(s.amount) || 0), 0) * 100) / 100;
  }
  // a higher step counts the ones under it, at the latest when it happened
  for (let i = ORDER.length - 1; i > 0; i--) {
    const hi = ORDER[i], lo = ORDER[i - 1];
    if (hi in at && (!(lo in at) || at[lo] > at[hi])) at[lo] = at[hi];
  }
  if (!(value > 0) && Number(lead.value) > 0) value = Number(lead.value);
  return {
    leadgenId: lg.id, formAt: lg.t,
    events: ORDER.filter((k) => k in at).map((k) => Object.assign({ name: k, time: at[k] }, k === 'Client' && value > 0 ? { value } : {})),
  };
}
// One CRM step as Meta's event (the same event_id every time: Meta drops a repeat too)
function crmPayload(lead, leadgenId, e) {
  const custom = { lead_event_source: LEAD_SOURCE, event_source: 'crm' };
  if (e.value > 0) Object.assign(custom, { value: e.value, currency: 'RON' });
  return {
    event_name: e.name, event_time: Math.floor(e.time / 1000), event_id: 'crm.' + leadgenId + '.' + e.name, action_source: 'system_generated',
    user_data: userData({ phone: lead.phone, email: lead.email, externalId: lead.id, leadId: leadgenId }), custom_data: custom,
  };
}
// One site event, with the browser's event_id (the same as its pixel event)
function sitePayload(o, rq, now) {
  const custom = {};
  const v = o.custom ? o.custom.value : null;
  if (v !== '' && v != null && Number.isFinite(Number(v)) && Number(v) >= 0) { custom.value = Math.round(Number(v) * 100) / 100; custom.currency = 'RON'; }
  const ev = {
    event_name: o.name, event_time: Math.floor((now || Date.now()) / 1000), event_id: String(o.eventId), action_source: 'website',
    event_source_url: rq.url || SITE + '/',
    user_data: userData({ phone: o.phone, email: o.email, externalId: o.leadId, ip: rq.ip, ua: rq.ua, fbp: rq.fbp, fbc: rq.fbc }),
  };
  if (Object.keys(custom).length) ev.custom_data = custom;
  return ev;
}

// ---------------------------------------------------------------- sending
async function adsToken() {
  const { loadConnection } = require('./facebook');
  const conn = await loadConnection(readJSON);
  return (conn && conn.userToken) || '';
}
function metaError(j, status) {
  const e = (j && j.error) || {};
  return clipText((e.error_user_msg || e.message || 'Meta a răspuns ' + (status || 'cu o eroare')) + (e.code ? ' (cod ' + e.code + (e.error_subcode ? '/' + e.error_subcode : '') + ')' : ''));
}
const clipText = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 220);
// One batch to Meta. The token goes in the body, never in the address or a log.
async function post(cfg, token, events) {
  const body = new URLSearchParams();
  body.set('data', dataJson(events));
  if (cfg.testCode) body.set('test_event_code', cfg.testCode);
  body.set('access_token', token);
  let r, j;
  try {
    r = await fetch(GRAPH + '/' + cfg.pixelId + '/events', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT) : undefined,
    });
    j = await r.json().catch(() => ({}));
  } catch (err) {
    return { ok: false, error: err && (err.name === 'TimeoutError' || err.name === 'AbortError') ? 'Meta n-a răspuns la timp' : 'Rețea: Meta nu a putut fi apelat' };
  }
  if (!r.ok || (j && j.error)) return { ok: false, error: metaError(j, r.status) };
  return { ok: true, received: Number(j && j.events_received) || 0 };
}
// What was sent lately (Integrări → Conversions API), without any personal data. Never throws.
async function note(entry) {
  try {
    const st = (await readJSON(STATUS_KEY, {})) || {};
    const at = nowISO();
    st.last = [Object.assign({ at }, entry)].concat(Array.isArray(st.last) ? st.last : []).slice(0, 25);
    st.counts = st.counts || {};
    if (entry.ok) { st.lastOk = at; st.counts[entry.mode] = (Number(st.counts[entry.mode]) || 0) + (entry.n || 0); }
    else st.lastError = { at, text: entry.error || 'eroare', mode: entry.mode };
    await writeJSON(STATUS_KEY, st, { quiet: true });
  } catch (err) { console.error('meta-capi status:', short(err)); }
}
// Every batch of a call; the ids of the events that went (for the marks). Never throws.
async function deliver(cfg, mode, events, kind) {
  const names = [...new Set(events.map((e) => e.event_name))];
  if (!PIXEL_RE.test(String(cfg.pixelId || ''))) return { ok: false, sent: [] }; // no pixel: nothing leaves
  const token = await adsToken().catch(() => '');
  if (!token) {
    console.error('meta-capi: no ads token');
    await note({ kind, mode, names, n: events.length, ok: false, error: 'Lipsește tokenul pentru reclame (Integrări → Facebook).' });
    return { ok: false, sent: [] };
  }
  const sent = [];
  let error = '';
  for (let i = 0; i < events.length; i += CHUNK) {
    const part = events.slice(i, i + CHUNK);
    const r = await post(cfg, token, part);
    if (!r.ok) { error = r.error; break; }
    part.forEach((e) => sent.push(e.event_id));
  }
  if (error) console.error('meta-capi:', kind, mode, error);
  await note({ kind, mode, names, n: sent.length, ok: !error, error: error || undefined, test: mode === 'test' || undefined });
  return { ok: !error, sent };
}

// ---------------------------------------------------------------- once per lead
const markPath = (cfg, mode, id) => 'locks/capi/' + crypto.createHash('sha1').update(cfg.pixelId + '|' + mode + '|' + id).digest('hex').slice(0, 24) + '.txt';
const bookKey = (cfg, mode) => cfg.pixelId + ':' + mode;
// the events this call may send: not sent before (the list), and the mark made by this call (two at once: one sends)
async function claim(cfg, mode, ids) {
  const sent = (await readJSON(SENT_KEY, {})) || {};
  const book = sent[bookKey(cfg, mode)] || {};
  const mine = new Set(), taken = [];
  for (const id of ids) {
    if (book[id]) continue;
    let ok = false;
    try { ok = await createOnce(markPath(cfg, mode, id), id + ' ' + nowISO()); } catch (err) { console.error('meta-capi mark:', short(err)); continue; } // the store unsure: the next round tries again
    if (ok) mine.add(id); else taken.push(id);
  }
  if (taken.length) await record(cfg, mode, taken); // marked before (another server, an earlier round): kept on the list
  return mine;
}
async function record(cfg, mode, ids) {
  if (!ids.length) return;
  try {
    const sent = (await readJSON(SENT_KEY, {})) || {};
    const k = bookKey(cfg, mode), now = Date.now();
    const book = sent[k] = sent[k] || {};
    ids.forEach((id) => { if (!book[id]) book[id] = now; });
    Object.keys(sent).forEach((b) => Object.keys(sent[b] || {}).forEach((id) => { if (now - sent[b][id] > KEEP_SENT) delete sent[b][id]; }));
    await writeJSON(SENT_KEY, sent, { quiet: true });
  } catch (err) { console.error('meta-capi sent list:', short(err)); }
}
async function release(cfg, mode, ids) {
  for (const id of ids) await removeBinary(markPath(cfg, mode, id)).catch(() => {});
}

// ---------------------------------------------------------------- the CRM loop
// The Facebook leads a change is about: by id, by the appointment (linked, on the card, same client, same phone), by
// client, by phone, or all of them (the sweep); only those with a Facebook lead id from the last 90 days.
function targetsOf(leads, o, now) {
  const ids = new Set(o.leadIds || []);
  const a = o.appointment || null;
  const a9 = a ? digits9(a.clientPhone) : '';
  const p9 = o.phone ? digits9(o.phone) : '';
  return (leads || []).filter((l) => {
    if (!l || !l.id) return false;
    const lg = leadgenOf(l);
    if (!lg || now - lg.t > LEAD_WINDOW) return false;
    if (o.all || ids.has(l.id)) return true;
    if (a && (a.leadId === l.id || (l.appointmentId && l.appointmentId === a.id) || (a.clientId && l.clientId === a.clientId) || (a9.length === 9 && digits9(l.phone) === a9))) return true;
    if (o.clientId && l.clientId === o.clientId) return true;
    return p9.length === 9 && digits9(l.phone) === p9;
  });
}
// The steps not sent yet of the leads a change is about, sent now. opts: { leadIds, appointment, clientId, phone, all,
// hint: { leadId, stage, at } (the stage the lead was just moved to, even if an automation moved her on at once) }.
// Never throws.
async function crmSync(opts) {
  try {
    const o = opts || {};
    const cfg = await loadConfig();
    const mode = modeOf(cfg);
    if (!SENDS.includes(mode)) return { skipped: mode };
    const now = Date.now();
    const leads = await readJSON('data/leads.json', []);
    const targets = targetsOf(leads, o, now);
    if (!targets.length) return { sent: 0 };
    const [stages, appointments, sales] = await Promise.all([loadStages(), readJSON('data/appointments.json', []), readJSON('data/sales.json', [])]);
    const map = stageEvents(stages, cfg.map);
    const items = [];
    for (const lead of targets) {
      const hints = o.hint && o.hint.leadId === lead.id ? [o.hint] : [];
      const r = crmReached(lead, { stages, map, appointments, sales, hints, now });
      if (!r) continue;
      r.events.forEach((e) => { if (now - e.time <= MAX_AGE) items.push(crmPayload(lead, r.leadgenId, e)); });
    }
    if (!items.length) return { sent: 0 };
    const mine = await claim(cfg, mode, items.map((e) => e.event_id));
    const go = items.filter((e) => mine.has(e.event_id));
    if (!go.length) return { sent: 0 };
    const res = await deliver(cfg, mode, go, 'crm');
    const sent = new Set(res.sent);
    await record(cfg, mode, res.sent);
    await release(cfg, mode, go.map((e) => e.event_id).filter((id) => !sent.has(id))); // not gone: the next round tries again
    return { sent: res.sent.length, mode };
  } catch (err) {
    console.error('meta-capi crm:', short(err));
    return { error: true };
  }
}
// Every Facebook lead of the last 90 days, for what no change sent (a step the hooks missed, a send that failed).
// At most every 10 minutes per server; the marks keep two servers from sending one event twice.
let lastSweep = 0;
async function sweep(force) {
  if (!force && Date.now() - lastSweep < 10 * 60e3) return { skipped: 'recent' };
  lastSweep = Date.now();
  return crmSync({ all: true });
}

// ---------------------------------------------------------------- the site
// One site event from the request that made it (the gift form, the booking). opts: { name: 'Lead' | 'Schedule',
// eventId (from the browser), phone, email, leadId, url (the page), custom: { value } }. Never throws.
async function siteEvent(req, opts) {
  try {
    const o = opts || {};
    if (!SITE_EVENTS.includes(o.name)) return { skipped: 'name' };
    if (!EID_RE.test(String(o.eventId || ''))) return { skipped: 'no_event_id' };
    const cfg = await loadConfig();
    const mode = modeOf(cfg);
    if (!SENDS.includes(mode)) return { skipped: mode };
    const ev = sitePayload(o, fromRequest(req, o.url));
    const res = await deliver(cfg, mode, [ev], 'site');
    return { sent: res.sent.length, mode };
  } catch (err) {
    console.error('meta-capi site:', short(err));
    return { error: true };
  }
}

// ---------------------------------------------------------------- after the answer
// The work runs after the answer when the platform keeps the request alive for it (Cloudflare / Vercel waitUntil);
// otherwise it is awaited. Either way it never throws.
function waitUntil() {
  try {
    const c = globalThis[Symbol.for('@vercel/request-context')];
    const ctx = c && typeof c.get === 'function' ? c.get() : null;
    return ctx && typeof ctx.waitUntil === 'function' ? (p) => ctx.waitUntil(p) : null;
  } catch (e) { return null; }
}
function soon(fn) {
  const p = Promise.resolve().then(fn).catch((err) => { console.error('meta-capi:', short(err)); });
  const wu = waitUntil();
  if (wu) { try { wu(p); return Promise.resolve(); } catch (e) { return p; } }
  return p;
}

// ---------------------------------------------------------------- Integrări
// The pixel as the token sees it (its name, when it last received an event): only read, nothing changes in Meta.
async function checkPixel(cfg) {
  if (!cfg.pixelId) return { ok: false, error: 'Pune întâi ID-ul pixelului web.' };
  const token = await adsToken().catch(() => '');
  if (!token) return { ok: false, error: 'Lipsește tokenul pentru reclame (Integrări → Facebook).' };
  try {
    const r = await fetch(GRAPH + '/' + cfg.pixelId + '?' + new URLSearchParams({ fields: 'id,name,last_fired_time', access_token: token }),
      { signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(TIMEOUT) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) return { ok: false, error: metaError(j, r.status) };
    const fired = Date.parse(String(j.last_fired_time || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    return { ok: true, name: String(j.name || ''), lastFired: Number.isFinite(fired) ? new Date(fired).toISOString() : '' };
  } catch (err) { return { ok: false, error: 'Meta n-a răspuns' }; }
}
// One event to Test Events (only with a test code): shows that the token may send to this pixel.
async function testEvent(cfg, req) {
  if (!cfg.pixelId) return { ok: false, error: 'Pune întâi ID-ul pixelului web.' };
  if (!cfg.testCode) return { ok: false, error: 'Pune întâi codul de test din Events Manager.' };
  const rq = fromRequest(req, SITE + '/');
  const ev = { event_name: 'PageView', event_time: Math.floor(Date.now() / 1000), event_id: 'test.' + crypto.randomUUID(), action_source: 'website', event_source_url: SITE + '/',
    user_data: userData({ externalId: 'centrul360-capi-test', ip: rq.ip, ua: rq.ua || 'Centrul360 portal' }) };
  const res = await deliver(cfg, 'test', [ev], 'test');
  if (res.ok) return { ok: true };
  const st = (await readJSON(STATUS_KEY, {})) || {};
  return { ok: false, error: (st.lastError && st.lastError.text) || 'Meta a refuzat evenimentul.' };
}
async function loadStatus() {
  const st = (await readJSON(STATUS_KEY, {})) || {};
  return { last: Array.isArray(st.last) ? st.last.slice(0, 15) : [], lastOk: st.lastOk || '', lastError: st.lastError || null, counts: st.counts || {} };
}

module.exports = {
  DEFAULT_PIXEL, CFG_KEY, STATUS_KEY, SENT_KEY, CRM_EVENTS, SITE_EVENTS, DEFAULT_STAGES, TEST_RE, PIXEL_RE, EID_RE, GRAPH, LEAD_SOURCE,
  normPhone, normEmail, sha, userData, dataJson, cookies, fromRequest, siteUrl,
  cleanConfig, cleanMap, loadConfig, modeOf, defaultEvent, stageEvents, loadStages,
  leadgenOf, crmReached, crmPayload, sitePayload, targetsOf,
  crmSync, sweep, siteEvent, soon, checkPixel, testEvent, loadStatus,
};
