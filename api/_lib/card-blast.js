// „Cardul de Sărbători” to the warmest 250 (the owner, 21.11): out of the „Transformarea 360” list (api/_lib/fc-campaign.js
// buildAudience: clients with a visit in the last 6 months, leads of the last 90 days), the warmest N get the card's
// approved WhatsApp template (Integrări: „Cardul de Sărbători · <oraș>”, t.fastcash = 'card_sarbatori_<tm|ar>') from
// their clinic's number, and they are taken out of the Transformarea list (cardblast/exclude.json, read by buildAudience
// before the list freezes), so nobody gets both.
// Warmest: clients first, by finished visits in the last 6 months, then how recent the last one is, a booking still
// ahead counts too; the N split between the clinics as their clients are. Nobody who already ordered a card.
//   pick(n): the list made and saved (counts back, never a name or phone); go(): sending on; tick(): the minute clock
//   sends a small batch (api/fastcash-tick.js); status(): counts.
// Followed (Admin → Campanii → Cardul de Sărbători, api/_lib/card-kpi.js): the messages aren't in the chats, so Meta's
// statuses of them come here from api/webhook-whatsapp.js as one tiny mark each, cardblast/ev/<status>/<message id>
// (createOnce: never two writers on one file in a burst), and what a person of the list writes back (a button, a text)
// as cardblast/in/<message id>. The first mark notes when the following began (cardblast/ev-since.txt).

const { readJSON, writeJSON, readBinary, createOnce } = require('./store');
const WA = require('./whatsapp');
const WT = require('./wa-templates');

const P = 'cardblast/';
const STATE = P + 'state.json', SENT = P + 'sent.json', EXCLUDE = P + 'exclude.json';
const TAG = { 'Timișoara': 'tm', Arad: 'ar' };
const CITIES = ['Timișoara', 'Arad'];
const BATCH = 60, PARALLEL = 6;
const nowISO = () => new Date().toISOString();
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const OURS = new Set([131042, 132000, 132001, 132005, 132007, 132012, 132015, 132016, 190, 10, 200, 100, 80007, 130429, 131048, 131000, 131016, 368, 131031]);
// her personal link's token (the owner, 21.11): short, opaque, the same for her every time, never her phone; a template
// whose link button ends in a variable (…?utm_campaign=card-sarbatori&c={{1}}) gets it, so the site ties her visit, her
// taps and her order to her (site-pulse.js, api/_lib/site-funnel.js, Admin → Campanii). The current template has a fixed
// link: nothing changes until one with a variable is approved.
const tokenOf = (k) => require('crypto').createHmac('sha256', String(process.env.PORTAL_SECRET || 'c360') + '|cs-link').update(String(k)).digest('base64url').slice(0, 10);
const linkVar = (t) => { const i = (t.buttons || []).findIndex((b) => b.type === 'URL' && /\{\{1\}\}/.test(b.url || '')); return i < 0 ? null : i; };
const codeOf = (err) => { const m = /cod (\d+)/.exec(String(err || '')); return m ? Number(m[1]) : 0; };

async function loadState() { return Object.assign({ armed: false, list: [], pickedAt: '', doneAt: '', media: {}, note: '' }, (await readJSON(STATE, null)) || {}); }
const saveState = (st) => writeJSON(STATE, st, { quiet: true });

// the phones out of „Transformarea 360” (fc-campaign buildAudience reads it)
async function excluded() { const x = await readJSON(EXCLUDE, []); return new Set(Array.isArray(x) ? x : []); }

async function pick(n) {
  const want = Math.max(1, Math.min(600, Number(n) || 250));
  const st = await loadState();
  if (st.armed) return { error: 'already_sending' };
  const FC = require('./fc-campaign');
  const fcState = (await readJSON('fc360/state.json', null)) || {};
  if (fcState.frozenAt) return { error: 'transformarea_frozen' }; // its list is fixed: taking people out now changes nothing
  // the whole list, before any exclusion
  const all = await FC.buildAudience({ all: true });
  const [appts, clients, orders] = await Promise.all([readJSON('data/appointments.json', []), readJSON('data/clients.json', []), readJSON('data/card-sarbatori.json', [])]);
  const today = new Date().toISOString().slice(0, 10), d180 = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10);
  const byPhone = new Map();
  clients.forEach((c) => { const k = d9(c && c.phone); if (k.length === 9 && !byPhone.has(k)) byPhone.set(k, c.id); });
  const stat = new Map();
  appts.forEach((a) => {
    if (!a || !a.clientId) return;
    const s = stat.get(a.clientId) || { visits: 0, last: '', ahead: false };
    if (a.status === 'finalizata' && a.date >= d180) { s.visits++; if (a.date > s.last) s.last = a.date; }
    if (a.date >= today && !/anulat|neprezent/.test(String(a.status || ''))) s.ahead = true;
    stat.set(a.clientId, s);
  });
  const bought = new Set(orders.map((o) => d9(o && o.phone)).filter((k) => k.length === 9));
  const days = (d) => (d ? Math.max(0, (Date.parse(today) - Date.parse(d)) / 864e5) : 999);
  const scored = all.filter((p) => !bought.has(p.k)).map((p) => {
    const s = stat.get(byPhone.get(p.k)) || { visits: 0, last: '', ahead: false };
    const rec = days(s.last);
    const score = (p.seg === 'client' ? 100 : 0) + s.visits * 10 + (rec <= 30 ? 6 : rec <= 60 ? 4 : rec <= 90 ? 2 : 0) + (s.ahead ? 5 : 0);
    return { k: p.k, to: p.to, city: p.city, fn: p.fn, seg: p.seg, score, visits: s.visits };
  });
  const clientsBy = {}; CITIES.forEach((c) => { clientsBy[c] = scored.filter((p) => p.city === c && p.seg === 'client').length; });
  const tot = CITIES.reduce((a, c) => a + clientsBy[c], 0) || 1;
  const share = {}; share['Timișoara'] = Math.round(want * clientsBy['Timișoara'] / tot); share.Arad = want - share['Timișoara'];
  const list = [];
  CITIES.forEach((c) => {
    scored.filter((p) => p.city === c).sort((a, b) => b.score - a.score || b.visits - a.visits).slice(0, share[c]).forEach((p) => list.push(p));
  });
  st.list = list; st.pickedAt = nowISO(); st.armed = false; st.doneAt = '';
  await saveState(st);
  await writeJSON(EXCLUDE, list.map((p) => p.k), { quiet: true });
  return { ok: true, picked: list.length, byCity: CITIES.reduce((o, c) => Object.assign(o, { [c]: list.filter((p) => p.city === c).length }), {}),
    clients: list.filter((p) => p.seg === 'client').length, leads: list.filter((p) => p.seg === 'lead').length,
    visits: { min: Math.min(...list.map((p) => p.visits)), max: Math.max(...list.map((p) => p.visits)) }, transformareaAfter: all.length - list.length, audienceBefore: all.length };
}

async function go() {
  const st = await loadState();
  if (!st.list.length) return { error: 'no_list' };
  st.armed = true; st.note = '';
  await saveState(st);
  return { ok: true, list: st.list.length };
}
async function stop() { const st = await loadState(); st.armed = false; await saveState(st); return { ok: true }; }

function tplFor(tpls, cfg, city, pre) {
  const n = cfg.numbers[city];
  if (!n || !n.phoneId || !n.token) return null;
  return tpls.filter((t) => t.fastcash === (pre || 'card_sarbatori') + '_' + TAG[city] && WT.approvedFor(t, n.wabaId))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
}

async function tick(opts) {
  const t0 = Date.now(), budget = (opts && opts.budgetMs) || 15e3;
  const st = await loadState();
  if (!st.armed || st.doneAt) return { idle: true };
  const [tpls, cfg] = [(await WT.load()).templates, await WA.loadConfig(true)];
  const sent = (await readJSON(SENT, null)) || {};
  let halt = '', count = 0, failed = 0;
  // the message for each person: her own (p.pre, a test between two offers) or the list's (st.pre); its picture is
  // uploaded once per message and clinic (a picture kept under the clinic alone went out with the next message, 21.11)
  const media = {}, tpl = {};
  const keyOf = (pre, c) => (pre || 'card_sarbatori') + '|' + c;
  const pres = [...new Set(st.list.filter((p) => !sent[p.k]).map((p) => p.pre || st.pre || ''))];
  for (const pre of pres) for (const c of CITIES) {
    const k = keyOf(pre, c);
    tpl[k] = tplFor(tpls, cfg, c, pre);
    if (!tpl[k]) continue;
    const path = WT.imageOf(tpl[k]);
    if (!path) continue;
    const mk = tpl[k].id + '|' + c, m = (st.media || {})[mk];
    if (m && m.id && Date.now() - Date.parse(m.at) < 20 * 864e5) { media[k] = m.id; continue; }
    const buf = await readBinary(path);
    const up = buf ? await WA.uploadMedia(c, buf, 'image/jpeg', 'card-sarbatori.jpg') : { error: 'poza lipsește' };
    if (up.error) { tpl[k] = null; st.note = c + ': ' + up.error; continue; }
    media[k] = up.id; st.media = Object.assign({}, st.media, { [mk]: { id: up.id, at: nowISO() } });
  }
  const tk = (p) => keyOf(p.pre || st.pre || '', p.city);
  const off = await require('./optout').set();
  st.list.filter((p) => !sent[p.k] && off.has(p.k)).forEach((p) => { sent[p.k] = { e: 'nu mai vrea oferte', code: 'optout', at: nowISO(), c: p.city }; });
  const queue = st.list.filter((p) => !sent[p.k] && tpl[tk(p)]).slice(0, BATCH);
  const one = async (p) => {
    if (halt || Date.now() - t0 > budget) return;
    const t = tpl[tk(p)], n = cfg.numbers[p.city], pre = p.pre || st.pre || '';
    const v = { prenume: p.fn || 'dragă' };
    const bi = linkVar(t);
    const r = await WA.sendWhatsApp({ phone: p.to, template: (t.meta[n.wabaId] || {}).name || t.name, language: t.language || 'ro', params: (t.map || []).map((key) => v[key] || '-'), from: p.city, headerImageId: media[tk(p)] || undefined,
      buttonUrl: bi == null ? undefined : { index: bi, text: tokenOf(p.k) } });
    if (r.sent) { sent[p.k] = Object.assign({ w: r.id || '', at: nowISO(), c: p.city }, pre ? { t: pre } : {}); count++; return; }
    const code = codeOf(r.error);
    if (r.error === 'not_configured' || OURS.has(code) || r.error === 'rețea') { halt = p.city + ': ' + r.error; return; }
    if (code === 131056) return;
    sent[p.k] = { e: String(r.error || '').slice(0, 160), code, at: nowISO(), c: p.city }; failed++;
  };
  for (let i = 0; i < queue.length && !halt && Date.now() - t0 < budget; i += PARALLEL) await Promise.all(queue.slice(i, i + PARALLEL).map(one));
  await writeJSON(SENT, sent, { quiet: true });
  const st2 = Object.assign(await loadState(), { media: st.media });
  if (halt) { st2.armed = false; st2.note = 'oprit: ' + halt; }
  else if (st.note) st2.note = st.note;
  const rest = st2.list.filter((p) => !sent[p.k]).length;
  if (!rest) st2.doneAt = nowISO();
  await saveState(st2);
  return { sent: count, failed, rest, halt };
}

async function status() {
  const st = await loadState();
  const sent = (await readJSON(SENT, null)) || {};
  const ex = await excluded();
  const by = {};
  CITIES.forEach((c) => {
    const l = st.list.filter((p) => p.city === c);
    by[c] = { list: l.length, sent: l.filter((p) => sent[p.k] && !sent[p.k].e).length, failed: l.filter((p) => sent[p.k] && sent[p.k].e).length };
  });
  const reasons = {};
  Object.values(sent).filter((x) => x.e).forEach((x) => { const k = x.code || x.e.slice(0, 40); reasons[k] = (reasons[k] || 0) + 1; });
  return { ok: true, armed: st.armed, pickedAt: st.pickedAt, doneAt: st.doneAt, note: st.note, excluded: ex.size, byCity: by, failReasons: reasons };
}

// ---- the message she got, in her chat (Mesaje): when she answers (the webhook calls onInbound) and, once, for the chats
// that already exist (backfill): the team sees what she is answering. Put in by time, never twice.
function msgFor(rec, p, tpl) {
  const v = { prenume: (p && p.fn) || 'dragă' };
  const text = String(tpl.body || '').replace(/\{\{(\d+)\}\}/g, (m, i) => { const key = (tpl.map || [])[i - 1]; return key && v[key] != null ? String(v[key]) : m; });
  const img = WT.imageOf(tpl);
  return Object.assign({ id: rec.w, direction: 'out', type: 'template', templateId: tpl.id, text, status: 'delivered', timestamp: rec.at, sentBy: null, sentByName: 'Cardul de Sărbători', auto: true },
    img ? { media: { kind: 'image', mime: 'image/jpeg', filename: 'card-sarbatori.jpg', path: img } } : {});
}
function putIn(convo, msg) {
  const msgs = convo.messages = convo.messages || [];
  if (msgs.some((x) => x.id === msg.id)) return false;
  let i = msgs.length;
  while (i > 0 && String(msgs[i - 1].timestamp) > msg.timestamp) i--;
  msgs.splice(i, 0, msg);
  return true;
}
let cache = { at: 0, sent: null, list: null, tpls: null };
async function fresh() {
  if (Date.now() - cache.at < 60e3 && cache.sent) return cache;
  const [st, sent, tpls] = [await loadState(), (await readJSON(SENT, null)) || {}, (await WT.load()).templates];
  cache = { at: Date.now(), sent, list: new Map(st.list.map((p) => [p.k, p])), tpls };
  return cache;
}
const tplOfSent = (tpls, city, pre) => tpls.filter((t) => t.fastcash === (pre || 'card_sarbatori') + '_' + TAG[city]).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0] || null;
async function onInbound(conversations, message) {
  const k = d9(message && message.from);
  if (k.length !== 9) return false;
  const c = await fresh();
  const rec = c.sent[k];
  if (!rec || !rec.w || rec.e) return false;
  const { normalizePhone } = require('./clients');
  const convo = conversations.find((x) => x.phone === (normalizePhone(message.from) || message.from));
  const tpl = tplOfSent(c.tpls, rec.c, rec.t);
  if (!convo || !tpl) return false;
  return putIn(convo, msgFor(rec, c.list.get(k), tpl));
}
async function backfillChats() {
  cache.at = 0;
  const c = await fresh();
  const { normalizePhone } = require('./clients');
  const KC = 'data/whatsapp-conversations.json';
  const conversations = await readJSON(KC, []);
  let added = 0;
  for (const [k, rec] of Object.entries(c.sent)) {
    if (!rec.w || rec.e) continue;
    const p = c.list.get(k);
    const convo = conversations.find((x) => d9(x.phone) === k);
    const tpl = tplOfSent(c.tpls, rec.c, rec.t);
    if (!convo || !tpl) continue;
    if (putIn(convo, msgFor(rec, p, tpl))) added++;
  }
  if (added) await require('./wa-convos').saveConversations(conversations);
  return { ok: true, added };
}

// ---- a further batch (the owner, 21.11): clients with the most potential who are NOT on the Transformarea list (its
// people get their own week), never one already sent the card, who bought a card, who paid in the last 7 days or bought a
// package (a payment of 1.500 lei or more) in the last 60 days. Potential: what she paid us in all, her visits, and a last
// visit 1 to 12 months ago (she knows us and has room to come back). Added to the same list (one send per phone, ever).
async function pickMore(n, opt) {
  const withTrans = !!(opt && opt.trans); // the owner, 21.11: the card first, the Transformarea list too
  const want = Math.max(1, Math.min(1000, Number(n) || 250));
  const st = await loadState();
  if (st.armed && !st.doneAt) return { error: 'still_sending' };
  const FC = require('./fc-campaign');
  const { normalizePhone } = require('./clients');
  const C = require('./clinic');
  const [trans, clients, appts, sales, orders, emps, sentMap] = await Promise.all([FC.buildAudience(), readJSON('data/clients.json', []), readJSON('data/appointments.json', []),
    readJSON('data/sales.json', []), readJSON('data/card-sarbatori.json', []), readJSON('data/employees.json', []), readJSON(SENT, null)]);
  const sent = sentMap || {};
  const off = await require('./optout').set();
  const inTrans = new Set(trans.map((p) => p.k));
  const already = new Set(st.list.map((p) => p.k).concat(Object.keys(sent)).concat([...off]));
  const bought = new Set(orders.map((o) => d9(o && o.phone)).filter((k) => k.length === 9));
  const staff = new Set(emps.map((e) => d9(e && e.phone)).filter((x) => x.length === 9));
  const now = Date.now(), iso = (d) => new Date(now - d * 864e5).toISOString().slice(0, 10);
  const d7 = iso(7), d60 = iso(60), d30 = iso(30), d365 = iso(365);
  const money = new Map(), recentPay = new Set();
  sales.forEach((x) => {
    if (!x || !x.clientId || !(Number(x.amount) > 0)) return;
    money.set(x.clientId, (money.get(x.clientId) || 0) + Number(x.amount));
    const d = String(x.date || '').slice(0, 10);
    if (d >= d7 || (d >= d60 && Number(x.amount) >= 1500)) recentPay.add(x.clientId);
  });
  const vis = new Map();
  appts.forEach((a) => {
    if (!a || !a.clientId || a.status !== 'finalizata') return;
    const v = vis.get(a.clientId) || { n: 0, last: '', city: '' };
    v.n++; if (a.date > v.last) { v.last = a.date; v.city = C.clinicOf(a.location); }
    vis.set(a.clientId, v);
  });
  const seen = new Set(), pool = [];
  clients.forEach((c) => {
    const ph = normalizePhone(c && c.phone); const k = d9(ph);
    if (!ph || k.length !== 9 || seen.has(k) || /^\s*test\b/i.test(String(c.name || ''))) return;
    seen.add(k);
    if ((!withTrans && inTrans.has(k)) || already.has(k) || bought.has(k) || staff.has(k) || recentPay.has(c.id)) return;
    const v = vis.get(c.id); if (!v || !CITIES.includes(v.city)) return; // only clients who came at least once, to one of our clinics
    const to = WA.toE164(c.phone); if (!to) return;
    const paid = money.get(c.id) || 0;
    const score = Math.min(paid, 20000) / 200 + v.n * 8 + (v.last >= d365 && v.last < d30 ? 15 : v.last >= d30 ? 5 : 0);
    pool.push({ k, to, city: v.city, fn: FC.firstName(c.name), seg: inTrans.has(k) ? 'client-tr' : 'client2', score: Math.round(score), visits: v.n, paid: Math.round(paid), batch: (opt && opt.batch) || 2 });
  });
  // the leads who never came (the owner, 21.11: „avem 10k contacte”), when asked: their city from the form
  if (opt && opt.leads) {
    const leads = await readJSON('data/leads.json', []);
    leads.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).forEach((l) => {
      const ph = normalizePhone(l && l.phone); const k = d9(ph);
      if (!ph || k.length !== 9 || seen.has(k) || /^\s*test\b/i.test(String(l.name || ''))) return;
      seen.add(k);
      if ((!withTrans && inTrans.has(k)) || already.has(k) || bought.has(k) || staff.has(k)) return;
      const city = C.clinicOf(l.location); if (!CITIES.includes(city)) return;
      const to = WA.toE164(l.phone); if (!to) return;
      const age = (now - Date.parse(l.createdAt || 0)) / 864e5;
      pool.push({ k, to, city, fn: FC.firstName(l.name), seg: 'lead', score: Math.round(age < 30 ? 30 : age < 90 ? 20 : age < 365 ? 10 : 0), visits: 0, paid: 0, batch: (opt && opt.batch) || 2 });
    });
  }
  const tot = pool.length || 1;
  const share = {}; share['Timișoara'] = Math.round(want * pool.filter((p) => p.city === 'Timișoara').length / tot); share.Arad = want - share['Timișoara'];
  const list = [];
  // a test between messages (opt.pres): handed out in turn down each clinic's ranking, so both get people as good
  const pres = String((opt && opt.pres) || '').split(',').map((x) => x.trim()).filter(Boolean);
  CITIES.forEach((c) => { pool.filter((p) => p.city === c).sort((a, b) => b.score - a.score).slice(0, share[c]).forEach((p, i) => { if (pres.length) p.pre = pres[i % pres.length]; list.push(p); }); });
  st.list = st.list.concat(list); st.armed = false; st.doneAt = ''; st.pickedAt = nowISO();
  await saveState(st);
  // the ones from the Transformarea list: out of it (while it isn't frozen), so nobody gets both
  const fromTr = list.filter((p) => inTrans.has(p.k)).map((p) => p.k);
  if (fromTr.length) { const ex = await excluded(); fromTr.forEach((k) => ex.add(k)); await writeJSON(EXCLUDE, [...ex], { quiet: true }); }
  const by = (f) => CITIES.reduce((o, c) => Object.assign(o, { [c]: list.filter((p) => p.city === c).length }), {});
  const paidOf = list.map((p) => p.paid).sort((a, b) => a - b);
  return { ok: true, picked: list.length, byCity: by(), pool: pool.length, paidMedian: paidOf.length ? paidOf[Math.floor(paidOf.length / 2)] : 0, visits: { min: Math.min(...list.map((p) => p.visits)), max: Math.max(...list.map((p) => p.visits)) } };
}
// a picked batch not sent yet, taken back (nothing went): only the ones still unsent of that batch
async function unpick(batch) {
  const st = await loadState();
  const sent = (await readJSON(SENT, null)) || {};
  const before = st.list.length;
  st.list = st.list.filter((p) => (p.batch || 1) !== Number(batch) || sent[p.k]);
  await saveState(st);
  return { ok: true, removed: before - st.list.length };
}

// which message the next sends use (the owner, 21.11): '' = the first one, '290' = the one that leads with the 290 lei card
async function useTemplate(v) {
  const st = await loadState();
  st.pre = v === '290' ? 'card_sarbatori_290' : v === '490' ? 'card_sarbatori_490' : '';
  await saveState(st);
  return { ok: true, template: st.pre || 'card_sarbatori' };
}


// ---------------------------------------------------------------- Meta's statuses and her answers (from the webhook)
const safeId = (id) => String(id || '').replace(/[^\w.-]/g, '_').slice(0, 160);
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
let memo = { at: 0, st: null, ids: null, byK: null, since: false };
async function marks(force) {
  if (!force && memo.st && Date.now() - memo.at < 30e3) return memo;
  const st = await loadState();
  const sent = (await readJSON(SENT, null)) || {};
  const ids = new Set(), byK = new Map();
  Object.keys(sent).forEach((k) => { if (sent[k] && sent[k].w) { ids.add(sent[k].w); byK.set(k, sent[k]); } });
  memo = { at: Date.now(), st, ids, byK, since: memo.since };
  return memo;
}
// the campaign lives while it sends and 30 days after its first message
const alive = (m) => !!(m.st.list.length && (m.st.armed || m.byK.size) && (!m.st.doneAt || Date.now() - Date.parse(m.st.doneAt) < 30 * 864e5));
async function since() {
  if (memo.since) return;
  memo.since = true;
  await createOnce(P + 'ev-since.txt', nowISO()).catch(() => {});
}
// a status no chat knows (api/webhook-whatsapp.js): a mark when the message is one of ours; while sending, a status can
// come before its message id is written (the batch saves at its end), so then any unknown one is marked (the numbers join
// them by id)
async function onStatus(status) {
  try {
    const id = status && status.id, s = String((status && status.status) || '');
    if (!id || !['delivered', 'read', 'failed'].includes(s)) return false;
    let m = await marks();
    if (!m.ids.has(id) && Date.now() - m.at > 3e3) m = await marks(true);
    const sending = !!(m.st.armed && !m.st.doneAt);
    if (!alive(m) || (!m.ids.has(id) && !sending)) return false;
    const e = s === 'failed' ? ((status.errors || [])[0] || {}) : null;
    const ts = status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : nowISO();
    await createOnce(P + 'ev/' + s + '/' + safeId(id), d9(status.recipient_id) + '|' + (e ? (e.code || '') : '') + '|' + ts).catch(() => {});
    await since();
    return true;
  } catch (err) { console.error('cardblast onStatus', err.message); return false; }
}
// what she sent: a button of the card's message („Rezerv în clinică”), a „stop”, or words
function kindOf(message, text) {
  const t = fold(text).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const tapped = message.type === 'button' || (message.type === 'interactive' && !!(message.interactive || {}).button_reply);
  if (/^(stop|dezabonare|dezabonez|unsubscribe)\b/.test(t) || /nu ma intereseaza|nu mai (trimiteti|trimite|vreau mesaje)|sterge(ti)? ma/.test(t)) return 'stop';
  if (tapped) return 'tap';
  return 'text';
}
// called for each message she sends (api/webhook-whatsapp.js, after onInbound puts the card in her chat): counted for
// Admin → Campanii when she is a person of the list who got the card's message
async function noteAnswer(message, text) {
  try {
    if (!message || !message.id || message.type === 'reaction') return null;
    let m = await marks();
    const k = d9(message.from);
    if (!alive(m) || !m.st.list.some((p) => p.k === k)) return null;
    if (!m.byK.has(k)) { m = await marks(true); if (!m.byK.has(k)) return null; }
    const kind = kindOf(message, text);
    const rec = { k, kind, text: String(text || '').slice(0, 300), at: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : nowISO(), ctx: (message.context && message.context.id) === m.byK.get(k).w ? 1 : 0 };
    await createOnce(P + 'in/' + safeId(message.id), JSON.stringify(rec)).catch(() => {});
    if (kind === 'stop' || require('./optout').isStop(text)) await require('./optout').add(k, 'a cerut pe WhatsApp: ' + String(text || '').slice(0, 60)).catch(() => {});
    return kind;
  } catch (err) { console.error('cardblast noteAnswer', err.message); return null; }
}

module.exports = { useTemplate, pick, pickMore, unpick, go, stop, tick, status, excluded, EXCLUDE, onInbound, backfillChats, onStatus, noteAnswer, kindOf, tokenOf, STATE, SENT, P };
