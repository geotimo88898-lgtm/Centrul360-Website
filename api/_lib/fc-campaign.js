// „Transformarea 360” (the owner, 20-21.11): the Fast Cash WhatsApp campaign, sent and followed from here.
//
// Who: the clinic's own people (clients with a finished visit in the last 6 months, the leads of the last 90 days who
// never came; the same list as api/lead-health ?fcaudience), one phone once, from the number of her clinic. The list is
// frozen at the first send (fc360/audience.json), so the numbers stay put all week.
// What: one approved template a step (api/_lib/fastcash.js made them; t.fastcash = 'fc360_<step>_<tm|ar>'), with its
// picture, at the step's hour (STEPS, Romanian time). Nothing leaves before the campaign is switched on in Admin →
// „Campanie TRANSFORMARE” (fc360/state.json armed), and a pause stops it at once.
// How: the Worker's minute clock (cf/worker.js → api/fastcash-tick.js) sends a small batch each run, so a run stays
// far under the Worker's limits and Meta's pace; a step is sent once to a phone (fc360/sent/<step>.json, written only
// by the sender, which holds a lease while it runs).
// Followed: Meta's statuses come to api/webhook-whatsapp.js; a campaign message isn't in the chats (1.650 a day would
// bury reception's inbox), so each status is a tiny mark fc360/ev/<status>/<message id> (never two writers on one
// file in a burst of thousands); her answer goes on her person (fc360/people.json) and the message she answered is put
// in her chat in Mesaje, so reception sees what she said yes to. aggregate() joins it all into fc360/agg.json
// (counts only) every few minutes; Admin → Campanie TRANSFORMARE and ?fastcash=kpi read it.
// Spots: 10 per clinic; a spot is hers when she has paid at the clinic (status 'paid' here, set in the section).

const crypto = require('crypto');
const { readJSON, writeJSON, readBinary, writeBinary, createOnce, removeBinary } = require('./store');
const WA = require('./whatsapp');
const WT = require('./wa-templates');

const P = 'fc360/';
const STATE = P + 'state.json', AUD = P + 'audience.json', PEOPLE = P + 'people.json', AGG = P + 'agg.json', LOCK = P + 'lock.txt', TICK = P + 'tick.txt';
const sentKey = (k) => P + 'sent/' + k + '.json';
const NAME = 'Transformarea 360';
const SEATS = 10, FULL = 9900, MONTHLY = 1500, BONUS_FIRST = 3;
const CLOSE_AT = '2026-11-28T21:59:59Z'; // Saturday 28.11, 23:59 in Romania
const CITIES = ['Timișoara', 'Arad'];
const TAG = { 'Timișoara': 'tm', Arad: 'ar' };
// the week, in UTC (Romania is UTC+2 in November): 20:00 worked best for the owner's past WhatsApp campaigns; Monday stays
// at 10:00 (the teaser promises it), Saturday's last day goes in the morning and its last-hours reminder at 20:00
const STEPS = [
  { k: '1', label: 'Teaser', at: '2026-11-22T18:00:00Z' },
  { k: '2', label: 'Oferta', at: '2026-11-23T08:00:00Z' },
  { k: '3', label: 'Bonus: 12 faciale', at: '2026-11-24T18:00:00Z' },
  { k: '4', label: 'Dovada', at: '2026-11-26T18:00:00Z' },
  { k: '5', label: 'Bonus: o prietenă', at: '2026-11-27T18:00:00Z' },
  { k: '6', label: 'Ultima zi', at: '2026-11-28T08:00:00Z' },
  { k: '6b', label: 'Ultimele ore', at: '2026-11-28T18:00:00Z', only: 'readNoReply' },
  { k: '7', label: 'S-a închis', at: '2026-11-29T18:00:00Z', optional: true },
];
const WINDOW_H = 3;       // a step leaves within 3 h of its hour (a later start would read wrong: „mâine”, „azi”)
const BATCH = 110;        // per clinic, per minute run
const PARALLEL = 6;
const SAVE_EVERY = 20;
const AGG_EVERY_MS = 4 * 60e3;
const LEASE_MS = 4 * 60e3;

const nowISO = () => new Date().toISOString();
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const safeId = (id) => String(id || '').replace(/[^\w.-]/g, '_').slice(0, 160);
const tplKey = (k, city) => 'fc360_' + k + '_' + TAG[city];

// ---------------------------------------------------------------- state
const blankState = () => ({ armed: false, paused: false, frozenAt: '', testPhone: '', steps: {}, media: {}, log: [] });
async function loadState() { return Object.assign(blankState(), (await readJSON(STATE, null)) || {}); }
const saveState = (st) => writeJSON(STATE, st, { quiet: true });
function note(st, text) { st.log = (st.log || []).concat({ at: nowISO(), text: String(text).slice(0, 300) }).slice(-60); }

// the first name as she reads it („ANA-MARIA popescu” → „Ana-Maria”); nothing usable → '' (the message says „dragă”)
const NOT_NAMES = new Set(['dna', 'doamna', 'd-na', 'client', 'clienta', 'test', 'lead', 'necunoscut', 'anonim']);
function firstName(name) {
  let w = String(name || '').trim().split(/[\s,.;/]+/)[0] || '';
  w = w.replace(/[^\p{L}'-]/gu, '').replace(/^[-']+|[-']+$/g, '');
  if (w.length < 2 || w.length > 20 || NOT_NAMES.has(fold(w))) return '';
  if (w === w.toLowerCase() || w === w.toUpperCase()) w = w.toLowerCase().replace(/(^|[-'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  return w;
}

// ---------------------------------------------------------------- who (the same rule as ?fcaudience)
async function buildAudience() {
  const [clients, appts, leads, emps] = await Promise.all([readJSON('data/clients.json', []), readJSON('data/appointments.json', []), readJSON('data/leads.json', []), readJSON('data/employees.json', [])]);
  const { normalizePhone } = require('./clients');
  const C = require('./clinic');
  const test = (n) => /^\s*test\b/i.test(String(n || ''));
  const now = Date.now(), d180 = new Date(now - 180 * 864e5).toISOString().slice(0, 10), d90 = new Date(now - 90 * 864e5).toISOString();
  const staff = new Set(emps.map((e) => d9(e && e.phone)).filter((x) => x.length === 9));
  const last = new Map();
  appts.forEach((a) => { if (!a || a.status !== 'finalizata' || !a.clientId) return; const p = last.get(a.clientId); if (!p || a.date > p.date) last.set(a.clientId, { date: a.date, city: C.clinicOf(a.location) }); });
  const seen = new Set(), out = [];
  const add = (raw, name, city, seg) => {
    const to = WA.toE164(raw), k = d9(raw);
    if (!to || k.length !== 9 || !CITIES.includes(city) || staff.has(k)) return;
    out.push({ k, to, phone: normalizePhone(raw) || raw, name: String(name || '').trim().slice(0, 80), fn: firstName(name), city, seg });
  };
  clients.forEach((c) => {
    const ph = normalizePhone(c && c.phone), v = c && last.get(c.id);
    if (!ph || !v || test(c.name) || seen.has(d9(ph))) return;
    seen.add(d9(ph));
    if (v.date >= d180) add(c.phone, c.name, v.city, 'client');
  });
  leads.forEach((l) => {
    const ph = normalizePhone(l && l.phone);
    if (!ph || test(l.name) || seen.has(d9(ph)) || !(String(l.createdAt || '') >= d90)) return;
    seen.add(d9(ph));
    add(l.phone, l.name, C.clinicOf(l.location), 'lead');
  });
  return out;
}
async function audience(st) {
  if (st && st.frozenAt) return readJSON(AUD, []);
  return buildAudience();
}

// ---------------------------------------------------------------- people (her answers, the spots)
async function loadPeople() { const d = (await readJSON(PEOPLE, null)) || {}; return { people: d.people && typeof d.people === 'object' ? d.people : {} }; }
const savePeople = (d) => writeJSON(PEOPLE, d, { quiet: true });
const isPaid = (p) => p && p.status === 'paid';
function seatsOf(people) {
  const out = {};
  CITIES.forEach((c) => {
    const paid = Object.values(people).filter((p) => isPaid(p) && p.city === c).sort((a, b) => String(a.paidAt || '').localeCompare(String(b.paidAt || '')));
    out[c] = { paid: paid.length, left: Math.max(0, SEATS - paid.length), bonus: paid.slice(0, BONUS_FIRST).map((p) => p.k) };
  });
  return out;
}
function moneyOf(people) {
  let cashed = 0, contracted = 0, full = 0, monthly = 0;
  Object.values(people).filter(isPaid).forEach((p) => {
    if (p.plan === 'monthly') { monthly++; cashed += MONTHLY; contracted += MONTHLY * 12; } else { full++; cashed += FULL; contracted += FULL; }
  });
  return { cashed, contracted, full, monthly };
}

// ---------------------------------------------------------------- templates
function pickTemplate(tpls, cfg, k, city) {
  const n = cfg.numbers[city];
  if (!n || !n.phoneId || !n.token) return null;
  return tpls.filter((t) => t.fastcash === tplKey(k, city) && WT.approvedFor(t, n.wabaId))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
}
function textOf(tpl, v) {
  return String(tpl.body || '').replace(/\{\{(\d+)\}\}/g, (m, i) => { const key = (tpl.map || [])[i - 1]; return key && v[key] != null ? String(v[key]) : m; });
}
const varsFor = (p, ss) => Object.assign({ prenume: p.fn || 'dragă' }, ((ss && ss.vars) || {})[p.city] || {});
// the template's picture, up to Meta once per number (a media id lasts 30 days)
async function mediaFor(st, tpl, city) {
  const path = WT.imageOf(tpl);
  if (!path) return { id: '' };
  const key = tpl.id + '|' + city, m = (st.media || {})[key];
  if (m && m.id && Date.now() - Date.parse(m.at) < 20 * 864e5) return { id: m.id };
  const buf = await readBinary(path);
  if (!buf) return { error: 'poza șablonului lipsește' };
  const up = await WA.uploadMedia(city, buf, 'image/jpeg', 'transformarea360.jpg');
  if (up.error) return { error: 'poza: ' + up.error };
  st.media = Object.assign({}, st.media, { [key]: { id: up.id, at: nowISO() } });
  return { id: up.id };
}
// Meta's answer to a send: about her (her number, her limits: she is marked and skipped) or about us (the access, the
// template, the pace: the run stops and the rest waits for the next one)
const OURS = new Set([131042, 132000, 132001, 132005, 132007, 132012, 132015, 132016, 190, 10, 200, 100, 80007, 130429, 131048, 131000, 131016, 368, 131031]);
const codeOf = (err) => { const m = /cod (\d+)/.exec(String(err || '')); return m ? Number(m[1]) : 0; };

// ---------------------------------------------------------------- the sender (the minute clock)
async function takeLease() {
  const stamp = String(Date.now());
  if (await createOnce(LOCK, stamp).catch(() => false)) return true;
  const buf = await readBinary(LOCK);
  const t = Number(buf ? buf.toString('utf8') : 0);
  if (t && Date.now() - t < LEASE_MS) return false;
  await removeBinary(LOCK);
  return createOnce(LOCK, stamp).catch(() => false);
}
const dropLease = () => removeBinary(LOCK);

const stepState = (st, k) => (st.steps[k] = st.steps[k] || {});
function stepStatus(st, s) {
  const ss = st.steps[s.k] || {};
  if (ss.skipped) return 'sărit';
  if (ss.doneAt) return 'trimis';
  if (ss.startedAt) return 'se trimite';
  return 'programat';
}

async function tick(opts) {
  const o = opts || {};
  const t0 = Date.now(), budget = o.budgetMs || 40e3;
  let st = await loadState();
  const out = { armed: st.armed, paused: st.paused };
  await writeBinary(TICK, nowISO(), 'text/plain').catch(() => {}); // the clock's heartbeat (?fastcash=kpi shows it)
  if (!st.armed || st.paused) {
    if (st.frozenAt && Date.now() < Date.parse(CLOSE_AT) + 3 * 864e5 && Date.now() - Date.parse((await readJSON(AGG, {})).at || 0) > AGG_EVERY_MS * 3) await aggregate().catch(() => null);
    return Object.assign(out, { idle: true });
  }
  const now = Date.now();
  const due = STEPS.filter((s) => now >= Date.parse(s.at) && !(st.steps[s.k] || {}).doneAt && !(st.steps[s.k] || {}).skipped);
  if (!due.length) {
    const agg = await readJSON(AGG, {});
    if (st.frozenAt && now < Date.parse(CLOSE_AT) + 3 * 864e5 && now - Date.parse(agg.at || 0) > AGG_EVERY_MS) { await aggregate().catch((e) => console.error('fc aggregate', e.message)); out.agg = true; }
    return Object.assign(out, { idle: true });
  }
  if (!(await takeLease())) return Object.assign(out, { busy: true });
  try {
    st = await loadState(); // what changed while the lease was taken
    if (!st.armed || st.paused) return out;
    const s = due[0], ss = stepState(st, s.k);
    const until = Date.parse(ss.extendTo || '') || (Date.parse(s.at) + WINDOW_H * 3600e3);
    if (now > until) {
      if (ss.startedAt) { ss.doneAt = nowISO(); ss.cut = true; note(st, NAME + ' · ' + s.label + ': s-a oprit la ora limită, restul n-a mai plecat.'); }
      else { ss.skipped = ss.note || 'a trecut ora'; note(st, NAME + ' · ' + s.label + ': sărit (' + ss.skipped + ').'); }
      await saveState(st);
      return Object.assign(out, { step: s.k, closed: true });
    }
    const [tpls, cfg] = [(await WT.load()).templates, await WA.loadConfig(true)];
    const tplOf = {}; CITIES.forEach((c) => { tplOf[c] = pickTemplate(tpls, cfg, s.k, c); });
    const ready = CITIES.filter((c) => tplOf[c]);
    if (!ready.length) { ss.note = 'șablonul nu e aprobat încă'; await saveState(st); return Object.assign(out, { step: s.k, waiting: 'template' }); }
    // the list freezes at the first send
    if (!st.frozenAt) {
      const list = await buildAudience();
      await writeJSON(AUD, list, { quiet: true });
      st.frozenAt = nowISO();
      note(st, NAME + ': lista s-a fixat, ' + list.length + ' persoane.');
    }
    const aud = await readJSON(AUD, []);
    const { people } = await loadPeople();
    if (!ss.startedAt) {
      ss.startedAt = nowISO();
      const seats = seatsOf(people);
      ss.vars = {}; CITIES.forEach((c) => { ss.vars[c] = { ocupate: String(seats[c].paid), ramase: String(seats[c].left) }; });
      if (s.only === 'readNoReply') {
        const agg = await aggregate({ withPeople: true });
        ss.target = agg.readers.filter((k) => !(people[k] && (people[k].replies || []).length));
      }
      note(st, NAME + ' · ' + s.label + ': a început trimiterea.');
      await saveState(st);
    }
    const target = ss.target ? new Set(ss.target) : null;
    const sent = (await readJSON(sentKey(s.k), null)) || {};
    const off = new Set(Object.values(people).filter((p) => p.optout).map((p) => p.k));
    const left = {}; let stop = '';
    CITIES.forEach((c) => { left[c] = aud.filter((p) => p.city === c && !sent[p.k] && !off.has(p.k) && (!target || target.has(p.k))); });
    const media = {};
    for (const c of ready) {
      const m = await mediaFor(st, tplOf[c], c);
      if (m.error) { stop = c + ': ' + m.error; ready.splice(ready.indexOf(c), 1); } else media[c] = m.id;
    }
    let count = 0, failed = 0, since = 0;
    const flush = async () => { if (since) { await writeJSON(sentKey(s.k), sent, { quiet: true }); since = 0; } };
    const queue = [];
    ready.forEach((c) => left[c].slice(0, BATCH).forEach((p) => queue.push(p)));
    let halt = false;
    const one = async (p) => {
      if (halt || Date.now() - t0 > budget) return;
      const tpl = tplOf[p.city], n = cfg.numbers[p.city];
      const v = varsFor(p, ss);
      const r = await WA.sendWhatsApp({ phone: p.to, template: (tpl.meta[n.wabaId] || {}).name || tpl.name, language: tpl.language || 'ro', params: (tpl.map || []).map((key) => v[key] || '-'), from: p.city, headerImageId: media[p.city] || undefined });
      if (r.sent) { sent[p.k] = { w: r.id || '', at: nowISO(), c: p.city }; count++; since++; }
      else {
        const code = codeOf(r.error);
        if (r.error === 'not_configured' || OURS.has(code) || r.error === 'rețea') { halt = true; stop = p.city + ': ' + r.error; return; }
        if (code === 131056) return; // too fast to the same number: next run
        sent[p.k] = { e: String(r.error || '').slice(0, 160), code, at: nowISO(), c: p.city }; failed++; since++;
      }
      if (since >= SAVE_EVERY) await flush();
    };
    for (let i = 0; i < queue.length && !halt && Date.now() - t0 < budget; i += PARALLEL) await Promise.all(queue.slice(i, i + PARALLEL).map(one));
    await flush();
    st = Object.assign(await loadState(), { media: st.media }); // a pause pressed meanwhile stays
    const ss2 = stepState(st, s.k);
    Object.assign(ss2, { startedAt: ss.startedAt, vars: ss.vars, target: ss.target, sent: Object.values(sent).filter((x) => x.w !== undefined && !x.e).length, failed: Object.values(sent).filter((x) => x.e).length, lastRunAt: nowISO() });
    if (stop) { ss2.note = stop; note(st, NAME + ' · ' + s.label + ': oprit, ' + stop); }
    else delete ss2.note;
    const rest = CITIES.some((c) => !tplOf[c]) ? 1 : CITIES.reduce((a, c) => a + left[c].filter((p) => !sent[p.k]).length, 0);
    if (!stop && !halt && rest === 0) { ss2.doneAt = nowISO(); note(st, NAME + ' · ' + s.label + ': trimis la toată lista.'); }
    // a clinic whose template never came: the other one is done, this one closes with the window
    await saveState(st);
    if (stop) await alertOwner(NAME + ': trimiterea s-a oprit', s.label + ' · ' + stop).catch(() => {});
    return Object.assign(out, { step: s.k, sent: count, failed, stop, rest });
  } finally { await dropLease(); }
}
async function alertOwner(title, text) {
  const N = require('./notify');
  const ids = await N.adminIds({ readJSON }).catch(() => ['admin']);
  await N.notifyMany({ readJSON, writeJSON }, ids, { kind: 'alert', tone: 'bad', title, text, go: 'transformare', tag: 'fc360-stop-' + new Date().toISOString().slice(0, 13) });
}

// ---------------------------------------------------------------- Meta's statuses (from the webhook)
let memo = { at: 0, st: null, aud: null, sent: null };
async function fresh() {
  if (Date.now() - memo.at < 30e3 && memo.st) return memo;
  const st = await loadState();
  memo = { at: Date.now(), st, aud: null, sent: null };
  return memo;
}
// a status no chat knows: a mark per message and status, for aggregate() (only while the campaign lives)
async function onStatus(status) {
  const id = status && status.id, s = String((status && status.status) || '');
  if (!id || !['delivered', 'read', 'failed'].includes(s)) return false;
  const m = await fresh();
  if (!m.st.frozenAt || Date.now() > Date.parse(CLOSE_AT) + 14 * 864e5) return false;
  const e = s === 'failed' ? ((status.errors || [])[0] || {}) : null;
  await createOnce(P + 'ev/' + s + '/' + safeId(id), d9(status.recipient_id) + (e ? '|' + (e.code || '') : '')).catch(() => {});
  return true;
}

// ---------------------------------------------------------------- her answer (from the webhook)
function kindOf(message, text) {
  const t = fold(text).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const tapped = message.type === 'button' || message.type === 'interactive';
  if (tapped && /^(da|vreau detalii)$/.test(t)) return 'yes';
  if (tapped && /^nu ma intereseaza$/.test(t)) return 'stop';
  if (t === 'lista' || (tapped && /^lista$/.test(t))) return 'list';
  if (/^(stop|dezabonare|dezabonez|unsubscribe)\b/.test(t) || /nu ma intereseaza|nu mai (trimiteti|trimite|vreau mesaje)|sterge(ti)? ma/.test(t)) return 'stop';
  if (t.length <= 40 && /^(da|daa+|da da|sigur|vreau|doresc|ok da|da vreau)\b/.test(t)) return 'yes';
  return 'text';
}
async function sentMaps() {
  const m = await fresh();
  if (m.sent) return m.sent;
  const out = {};
  for (const s of STEPS) { if ((m.st.steps[s.k] || {}).startedAt) out[s.k] = (await readJSON(sentKey(s.k), null)) || {}; }
  m.sent = out;
  return out;
}
async function audMap() {
  const m = await fresh();
  if (!m.aud) m.aud = new Map((await readJSON(AUD, [])).map((p) => [p.k, p]));
  return m.aud;
}
// called for each message she sends (api/webhook-whatsapp.js, with the chats as read there): her answer on her person,
// the campaign message she answers put in her chat. Returns { kind, person } or null (not a campaign person).
async function onInbound(conversations, message, text) {
  try {
    const m = await fresh();
    if (!m.st.frozenAt || message.type === 'reaction') return null;
    const k = d9(message.from);
    const p = (await audMap()).get(k);
    if (!p) return null;
    const kind = kindOf(message, text);
    let maps = await sentMaps();
    // she answers seconds after the send: the lists this server read may be older than her message
    if (!STEPS.some((s) => maps[s.k] && maps[s.k][k])) { memo.at = 0; maps = await sentMaps(); }
    const ctx = message.context && message.context.id;
    let step = '';
    if (ctx) step = (STEPS.find((s) => maps[s.k] && maps[s.k][k] && maps[s.k][k].w === ctx) || {}).k || '';
    if (!step) { const got = STEPS.filter((s) => maps[s.k] && maps[s.k][k] && maps[s.k][k].w); step = got.length ? got[got.length - 1].k : ''; }
    // the message she answers, in her chat (Mesaje), before her answer
    if (step) {
      const { normalizePhone } = require('./clients');
      const convo = conversations.find((c) => c.phone === (normalizePhone(message.from) || message.from));
      const rec = maps[step][k];
      if (convo && rec && rec.w && !(convo.messages || []).some((x) => x.id === rec.w)) {
        const tpl = (await WT.load()).templates.find((t) => t.fastcash === tplKey(step, p.city) && Object.values(t.meta || {}).some((x) => x.status === 'APPROVED'));
        if (tpl) {
          const img = WT.imageOf(tpl);
          const msg = Object.assign({ id: rec.w, direction: 'out', type: 'template', templateId: tpl.id, text: textOf(tpl, varsFor(p, memo.st.steps[step])), status: 'read', timestamp: rec.at, sentBy: null, sentByName: NAME, auto: true },
            img ? { media: { kind: 'image', mime: 'image/jpeg', filename: 'transformarea360.jpg', path: img } } : {});
          const msgs = convo.messages; let i = msgs.length;
          while (i > 0 && String(msgs[i - 1].timestamp) > msg.timestamp) i--;
          msgs.splice(i, 0, msg);
        }
      }
    }
    // her person
    const d = await loadPeople();
    const x = d.people[k] = Object.assign({ k, phone: p.phone, name: p.name, city: p.city, seg: p.seg, src: 'wa', replies: [] }, d.people[k] || {});
    if ((x.replies || []).some((r) => r.id === message.id)) return null;
    x.replies = (x.replies || []).concat({ id: message.id || '', at: nowISO(), step, kind, text: String(text || '').slice(0, 300) }).slice(-20);
    if (kind === 'yes') x.interested = true;
    if (kind === 'stop') x.optout = true;
    if (kind === 'list') x.list = true;
    if ((kind === 'yes' || kind === 'text') && !x.status) x.status = 'call';
    x.updatedAt = nowISO();
    await savePeople(d);
    return { kind, person: x, step };
  } catch (err) { console.error('fc onInbound', err.message); return null; }
}
// reception hears a yes (or a question) as what it is: call her for the consultation
async function tellDesk(hit) {
  if (!hit || !['yes', 'text'].includes(hit.kind)) return false;
  const N = require('./notify');
  const p = hit.person;
  const ids = await N.deskIds({ readJSON }, p.city);
  const said = String((p.replies[p.replies.length - 1] || {}).text || '').replace(/\s+/g, ' ').slice(0, 80);
  await N.notifyMany({ readJSON, writeJSON }, ids, { kind: 'lead', tone: 'good', go: 'mesaje', tag: 'fc360-' + p.k,
    title: (hit.kind === 'yes' ? 'TRANSFORMAREA 360: VREA LOCUL 🔥 ' : 'TRANSFORMAREA 360: ÎNTREABĂ ') + (p.name || '+' + p.phone),
    text: (said ? '„' + said + '” · ' : '') + 'Sun-o azi și programeaz-o la consultație (' + (p.city === 'Arad' ? 'Arad' : 'Timișoara') + ').' });
  return true;
}

// ---------------------------------------------------------------- the numbers
async function listKeys(prefix) {
  const { list } = require('@vercel/blob');
  const out = []; let cursor;
  for (let i = 0; i < 60; i++) {
    const r = await list({ prefix, cursor, limit: 1000 });
    (r.blobs || []).forEach((b) => out.push(b.pathname));
    if (!r.hasMore) break;
    cursor = r.cursor;
  }
  return out;
}
async function numberLimits() {
  const cfg = await WA.loadConfig();
  const out = {};
  for (const c of CITIES) {
    const n = cfg.numbers[c];
    if (!n.phoneId || !n.token) { out[c] = { connected: false }; continue; }
    try {
      // the limit moved to the business portfolio (whatsapp_business_manager_messaging_limit); the number's old field as a fallback
      const get = (f) => fetch(WA.GRAPH + '/' + encodeURIComponent(n.phoneId) + '?fields=' + f, { headers: { Authorization: 'Bearer ' + n.token } }).then(async (r) => ({ r, j: await r.json().catch(() => ({})) }));
      let { r, j } = await get('whatsapp_business_manager_messaging_limit,messaging_limit_tier,quality_rating,throughput');
      if (!r.ok) ({ r, j } = await get('messaging_limit_tier,quality_rating,throughput'));
      out[c] = r.ok ? { connected: true, tier: j.whatsapp_business_manager_messaging_limit || j.messaging_limit_tier || '', quality: j.quality_rating || '', throughput: (j.throughput && j.throughput.level) || '' } : { connected: true, error: ((j && j.error) || {}).message || String(r.status) };
    } catch (e) { out[c] = { connected: true, error: 'rețea' }; }
  }
  return out;
}
const blankF = () => ({ audience: 0, sent: 0, delivered: 0, read: 0, replied: 0, interested: 0, consult: 0, came: 0, paid: 0, stop: 0, failed: 0 });
async function aggregate(opts) {
  const st = await loadState();
  const aud = await audience(st);
  const { people } = await loadPeople();
  const byK = new Map(aud.map((p) => [p.k, p]));
  const ids = new Map(); // message id → { step, k }
  const steps = [];
  const per = new Map(); // k → { sent, delivered, read, failed }
  const touch = (k) => { if (!per.has(k)) per.set(k, { sent: false, delivered: false, read: false }); return per.get(k); };
  for (const s of STEPS) {
    const ss = st.steps[s.k] || {};
    const row = { k: s.k, label: s.label, at: s.at, status: stepStatus(st, s), note: ss.note || ss.skipped || '', cut: !!ss.cut, cities: {} };
    CITIES.forEach((c) => { row.cities[c] = { sent: 0, delivered: 0, read: 0, failed: 0, replies: 0, interested: 0, stop: 0 }; });
    if (ss.startedAt) {
      const map = (await readJSON(sentKey(s.k), null)) || {};
      Object.keys(map).forEach((k) => {
        const x = map[k], c = (row.cities[x.c] ? x.c : (byK.get(k) || {}).city);
        if (!row.cities[c]) return;
        if (x.e) { row.cities[c].failed++; return; }
        row.cities[c].sent++; touch(k).sent = true; touch(k).city = c;
        if (x.w) ids.set(safeId(x.w), { s: s.k, k, c });
      });
    }
    steps.push(row);
  }
  const rowOf = (k) => steps.find((r) => r.k === k);
  const reasons = {};
  if (st.frozenAt) {
    const evs = {};
    for (const s of ['delivered', 'read', 'failed']) evs[s] = await listKeys(P + 'ev/' + s + '/').catch(() => []);
    const seenDel = new Set();
    evs.read.concat(evs.delivered).forEach((key) => {
      const id = key.split('/').pop(), hit = ids.get(id);
      if (!hit || seenDel.has(id)) return;
      seenDel.add(id);
      rowOf(hit.s).cities[hit.c].delivered++; touch(hit.k).delivered = true;
    });
    evs.read.forEach((key) => { const hit = ids.get(key.split('/').pop()); if (!hit) return; rowOf(hit.s).cities[hit.c].read++; touch(hit.k).read = true; });
    evs.failed.forEach((key) => { const hit = ids.get(key.split('/').pop()); if (!hit) return; rowOf(hit.s).cities[hit.c].failed++; });
    // why Meta didn't deliver (the codes only; a few reads)
    for (const key of evs.failed.slice(0, 40)) {
      const buf = await readBinary(key).catch(() => null); const code = buf ? String(buf.toString('utf8').split('|')[1] || '?') : '?';
      reasons[code] = (reasons[code] || 0) + 1;
    }
  }
  // answers, per step and per clinic
  Object.values(people).forEach((p) => {
    const c = CITIES.includes(p.city) ? p.city : '';
    if (!c) return;
    const done = new Set();
    (p.replies || []).forEach((r) => {
      const row = rowOf(r.step); if (!row) return;
      const tag = r.step + '|' + r.kind;
      if (done.has(r.step)) { if (r.kind === 'yes' && !done.has(tag)) { row.cities[c].interested++; done.add(tag); } if (r.kind === 'stop' && !done.has(tag)) { row.cities[c].stop++; done.add(tag); } return; }
      done.add(r.step); done.add(tag);
      row.cities[c].replies++;
      if (r.kind === 'yes') row.cities[c].interested++;
      if (r.kind === 'stop') row.cities[c].stop++;
    });
  });
  // the funnel, per clinic and in all
  const funnel = { total: blankF() };
  CITIES.forEach((c) => { funnel[c] = blankF(); });
  const bump = (c, key) => { if (funnel[c]) funnel[c][key]++; funnel.total[key]++; };
  aud.forEach((p) => bump(p.city, 'audience'));
  per.forEach((x, k) => { const c = x.city || (byK.get(k) || {}).city; if (x.sent) bump(c, 'sent'); if (x.delivered || x.read) bump(c, 'delivered'); if (x.read) bump(c, 'read'); });
  Object.values(people).forEach((p) => {
    const c = p.city;
    if ((p.replies || []).length) bump(c, 'replied');
    if (p.interested) bump(c, 'interested');
    if (p.optout) bump(c, 'stop');
    if (p.consultAt || ['consult', 'came', 'paid'].includes(p.status)) bump(c, 'consult');
    if (['came', 'paid'].includes(p.status)) bump(c, 'came');
    if (p.status === 'paid') bump(c, 'paid');
  });
  steps.forEach((r) => CITIES.forEach((c) => { funnel[c].failed += r.cities[c].failed; funnel.total.failed += r.cities[c].failed; }));
  const agg = {
    at: nowISO(), state: { armed: !!st.armed, paused: !!st.paused, frozenAt: st.frozenAt || '' }, closeAt: CLOSE_AT,
    steps, funnel, seats: seatsOf(people), money: moneyOf(people), failReasons: reasons,
    limits: await numberLimits().catch(() => ({})),
  };
  await writeJSON(AGG, agg, { quiet: true });
  memo.at = 0;
  if (opts && opts.withPeople) agg.readers = [...per.entries()].filter(([, x]) => x.read).map(([k]) => k);
  return agg;
}
async function kpi(maxAgeMs) {
  let agg = await readJSON(AGG, null);
  if (!(agg && Date.now() - Date.parse(agg.at) < (maxAgeMs == null ? 120e3 : maxAgeMs))) agg = await aggregate();
  const t = await readBinary(TICK).catch(() => null);
  return Object.assign({}, agg, { clockAt: t ? t.toString('utf8') : '' });
}

// ---------------------------------------------------------------- the section's actions
async function setFlags(f) {
  const st = await loadState();
  if (f.armed != null) { st.armed = !!f.armed; note(st, NAME + (st.armed ? ': pornită.' : ': oprită.')); if (st.armed) st.paused = false; }
  if (f.paused != null) { st.paused = !!f.paused; note(st, NAME + (st.paused ? ': pauză.' : ': continuă.')); }
  await saveState(st);
  memo.at = 0;
  return st;
}
// one step to one number (the owner's phone): the real template, her clinic's number; never counted
async function sendTest(b) {
  const s = STEPS.find((x) => x.k === String(b.step || '1'));
  const city = CITIES.includes(b.city) ? b.city : 'Timișoara';
  if (!s) return { error: 'Pas necunoscut.' };
  if (!WA.toE164(b.phone)) return { error: 'Numărul nu e valid.' };
  const st = await loadState();
  const [tpls, cfg] = [(await WT.load()).templates, await WA.loadConfig(true)];
  const tpl = pickTemplate(tpls, cfg, s.k, city);
  if (!tpl) return { error: 'Mesajul „' + s.label + '” nu e aprobat încă de Meta pentru ' + city + '.' };
  const m = await mediaFor(st, tpl, city);
  if (m.error) return { error: m.error };
  const seats = seatsOf((await loadPeople()).people)[city];
  const v = { prenume: firstName(b.name) || 'dragă', ocupate: String(seats.paid), ramase: String(seats.left) };
  const n = cfg.numbers[city];
  const r = await WA.sendWhatsApp({ phone: b.phone, template: (tpl.meta[n.wabaId] || {}).name || tpl.name, language: tpl.language || 'ro', params: (tpl.map || []).map((key) => v[key] || '-'), from: city, headerImageId: m.id || undefined });
  const st2 = await loadState();
  st2.testPhone = String(b.phone).slice(0, 20); st2.media = Object.assign({}, st2.media, st.media);
  note(st2, NAME + ': test „' + s.label + '” ' + city + (r.sent ? ' trimis.' : ' n-a plecat: ' + r.error));
  await saveState(st2);
  return r.sent ? { ok: true } : { error: r.error };
}
const STATUSES = ['call', 'consult', 'came', 'paid', 'no'];
async function setPerson(b) {
  const d = await loadPeople();
  const x = d.people[d9(b.k)];
  if (!x) return { error: 'Nu mai găsesc persoana.' };
  if (b.status != null) {
    if (!STATUSES.includes(b.status)) return { error: 'Stare necunoscută.' };
    if (b.status === 'paid' && x.status !== 'paid') {
      const seats = seatsOf(d.people)[x.city];
      if (seats.paid >= SEATS) return { error: 'Locurile din ' + x.city + ' sunt toate ocupate.' };
      x.paidAt = nowISO();
    }
    if (b.status !== 'paid') delete x.paidAt;
    x.status = b.status;
  }
  if (b.plan != null) x.plan = b.plan === 'monthly' ? 'monthly' : 'full';
  if (b.consultAt != null) x.consultAt = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(String(b.consultAt)) ? String(b.consultAt) : '';
  if (b.note != null) x.note = String(b.note).slice(0, 300);
  x.updatedAt = nowISO();
  await savePeople(d);
  return { ok: true };
}
async function addPerson(b) {
  const k = d9(b.phone);
  if (k.length !== 9 || !WA.toE164(b.phone)) return { error: 'Numărul nu e valid.' };
  const city = CITIES.includes(b.city) ? b.city : '';
  if (!city) return { error: 'Alege clinica.' };
  const d = await loadPeople();
  const { normalizePhone } = require('./clients');
  const x = d.people[k] = Object.assign({ k, phone: normalizePhone(b.phone) || b.phone, name: String(b.name || '').trim().slice(0, 80), city, src: 'manual', replies: [] }, d.people[k] || {});
  if (b.name) x.name = String(b.name).trim().slice(0, 80);
  x.interested = true;
  await savePeople(d);
  return setPerson({ k, status: STATUSES.includes(b.status) ? b.status : 'call', plan: b.plan, consultAt: b.consultAt || '' });
}
async function extend(b) {
  const st = await loadState();
  const s = STEPS.find((x) => x.k === String(b.step));
  if (!s) return { error: 'Pas necunoscut.' };
  const ss = stepState(st, s.k);
  delete ss.skipped; delete ss.doneAt; delete ss.cut;
  ss.extendTo = new Date(Date.now() + 2 * 3600e3).toISOString();
  note(st, NAME + ' · ' + s.label + ': se mai trimite 2 ore, la cine n-a primit.');
  await saveState(st);
  return { ok: true };
}
// what the section shows (Admin only): the numbers, the steps with their templates, the people who answered or paid
async function view() {
  const st = await loadState();
  const [agg, { people }, tpls, cfg] = [await kpi(90e3), await loadPeople(), (await WT.load()).templates, await WA.loadConfig()];
  const templates = {};
  STEPS.forEach((s) => { templates[s.k] = {}; CITIES.forEach((c) => {
    const ok = pickTemplate(tpls, cfg, s.k, c);
    const any = tpls.filter((t) => t.fastcash === tplKey(s.k, c)).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
    templates[s.k][c] = ok ? 'APPROVED' : any ? WT.overall(any) : '';
  }); });
  const seats = agg.seats;
  const list = Object.values(people).filter((p) => p.interested || (p.replies || []).some((r) => r.kind !== 'stop') || p.status === 'paid' || p.src === 'manual')
    .map((p) => Object.assign({}, p, { bonus: !!(seats[p.city] && seats[p.city].bonus.includes(p.k)), last: (p.replies || [])[(p.replies || []).length - 1] || null }))
    .sort((a, b) => String((b.last && b.last.at) || b.updatedAt || '').localeCompare(String((a.last && a.last.at) || a.updatedAt || '')));
  return { ok: true, name: NAME, steps: STEPS, state: { armed: !!st.armed, paused: !!st.paused, frozenAt: st.frozenAt || '', testPhone: st.testPhone || '', log: (st.log || []).slice(-12).reverse() },
    templates, agg, people: list, stops: Object.values(people).filter((p) => p.optout).length, lists: Object.values(people).filter((p) => p.list).length, seatsMax: SEATS, prices: { full: FULL, monthly: MONTHLY } };
}

module.exports = { NAME, STEPS, CITIES, SEATS, CLOSE_AT, tick, aggregate, kpi, view, onStatus, onInbound, tellDesk, setFlags, sendTest, setPerson, addPerson, extend, buildAudience, firstName, kindOf };
