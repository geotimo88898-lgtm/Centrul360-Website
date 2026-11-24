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

async function go(late) {
  const st = await loadState();
  if (!st.list.length) return { error: 'no_list' };
  st.armed = true; st.note = '';
  // the owner asked for it now, past 21:00 (23.11: „trimite 250 azi”): the evening hour is let through for 40 minutes
  st.lateUntil = late ? new Date(Date.now() + 40 * 60e3).toISOString() : '';
  await saveState(st);
  return { ok: true, list: st.list.length };
}
// a batch sent with the wrong message (the owner, 23.11: the old one with 290 and EMS): the same people get the right one
// (pre); what they got first is kept in cardblast/sent-prev.json. Only people whose first message went out.
async function resend(batch, pre) {
  const st = await loadState();
  if (st.armed && !st.doneAt) return { error: 'still_sending' };
  const sent = (await readJSON(SENT, null)) || {};
  const prev = (await readJSON(P + 'sent-prev.json', null)) || {};
  let n = 0; const by = {};
  st.list.forEach((p) => {
    if ((p.batch || 1) !== Number(batch) || !sent[p.k] || sent[p.k].e) return;
    prev[p.k] = (prev[p.k] || []).concat(sent[p.k]);
    delete sent[p.k];
    p.pre = String(pre || '');
    n++; by[p.city] = (by[p.city] || 0) + 1;
  });
  await writeJSON(P + 'sent-prev.json', prev, { quiet: true });
  await writeJSON(SENT, sent, { quiet: true });
  st.doneAt = '';
  await saveState(st);
  return { ok: true, again: n, byCity: by, pre: pre || 'card_sarbatori' };
}
// the resend taken back before anything went (the owner, 23.11): her first message is hers again, the batch's message as it was
async function unresend(batch) {
  const st = await loadState();
  if (st.armed && !st.doneAt) return { error: 'still_sending' };
  const sent = (await readJSON(SENT, null)) || {};
  const prev = (await readJSON(P + 'sent-prev.json', null)) || {};
  let n = 0;
  st.list.forEach((p) => {
    if ((p.batch || 1) !== Number(batch) || sent[p.k] || !(prev[p.k] || []).length) return;
    sent[p.k] = prev[p.k].pop(); if (!prev[p.k].length) delete prev[p.k];
    delete p.pre; n++;
  });
  await writeJSON(SENT, sent, { quiet: true });
  await writeJSON(P + 'sent-prev.json', prev, { quiet: true });
  if (!st.list.some((p) => !sent[p.k])) st.doneAt = new Date().toISOString();
  await saveState(st);
  return { ok: true, back: n };
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
  const roH = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hour12: false }).format(new Date()));
  if ((roH < 9 || roH >= 21) && !(st.lateUntil && Date.now() < Date.parse(st.lateUntil))) return { idle: true, quiet: true };
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
  // the message the list gets (st.pre) and the wave's templates as Meta has them (no names)
  const d = await WT.load().catch(() => ({ templates: [] }));
  const tpls = (d.templates || []).filter((t) => /^card_sarbatori/.test(String(t.fastcash || ''))).map((t) => ({ key: t.fastcash, label: t.label, state: WT.overall(t), body: String(t.body || '').slice(0, 2000), buttons: (t.buttons || []).map((b) => b.text + (b.url ? ' → ' + b.url : '')), image: WT.imageOf(t) }));
  const batches = {}; st.list.forEach((p) => { const b = p.batch || 1; batches[b] = batches[b] || { n: 0, sent: 0 }; batches[b].n++; if (sent[p.k]) batches[b].sent++; });
  return { ok: true, armed: st.armed, pickedAt: st.pickedAt, doneAt: st.doneAt, note: st.note, excluded: ex.size, byCity: by, failReasons: reasons, pre: st.pre || 'card_sarbatori', batches, tpls };
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
  const seen = new Set(), pool = [], why = {};
  const no = (k, w) => { if (inTrans.has(k)) why[w] = (why[w] || 0) + 1; };
  // only the leads who never came (opt.only === 'leads'): their phones still marked seen, so no client slips in as a lead
  clients.forEach((c) => {
    const ph = normalizePhone(c && c.phone); const k = d9(ph);
    if (opt && opt.only === 'leads') { if (ph && k.length === 9) seen.add(k); return; }
    if (opt && opt.only === 'trans' && !inTrans.has(k)) return;
    // a client file with no finished visit is a lead of the list (as fc-campaign.js counts her): the leads below take her
    if (opt && opt.only === 'trans' && !vis.get(c && c.id)) return;
    if (!ph || k.length !== 9 || seen.has(k) || /^\s*test\b/i.test(String(c.name || ''))) return no(k, 'c-seen');
    seen.add(k);
    if (!withTrans && inTrans.has(k)) return no(k, 'c-trans'); if (already.has(k)) return no(k, 'c-already'); if (bought.has(k)) return no(k, 'c-bought'); if (staff.has(k)) return no(k, 'c-staff'); if (recentPay.has(c.id)) return no(k, 'c-recentpay');
    const v = vis.get(c.id);
    // a file with no visit (an old lead kept as a client file, the owner 23.11: „mai avem contacte?”), when asked: her city from the file
    if (!v && opt && opt.cold) {
      const city = C.clinicOf(c.location); if (!CITIES.includes(city)) return no(k, 'c-cold-city');
      const to = WA.toE164(c.phone); if (!to) return no(k, 'c-to');
      const age = (now - Date.parse(c.createdAt || c.created || 0)) / 864e5;
      pool.push({ k, to, city, fn: FC.firstName(c.name), seg: 'cold', score: Math.round(age < 30 ? 30 : age < 90 ? 20 : age < 365 ? 10 : 0), visits: 0, paid: 0, batch: (opt && opt.batch) || 2, at: c.createdAt || '' });
      return;
    }
    if (!v || !CITIES.includes(v.city)) return no(k, 'c-novisit'); // only clients who came at least once, to one of our clinics
    const to = WA.toE164(c.phone); if (!to) return no(k, 'c-to');
    const paid = money.get(c.id) || 0;
    const score = Math.min(paid, 20000) / 200 + v.n * 8 + (v.last >= d365 && v.last < d30 ? 15 : v.last >= d30 ? 5 : 0);
    pool.push({ k, to, city: v.city, fn: FC.firstName(c.name), seg: inTrans.has(k) ? 'client-tr' : 'client2', score: Math.round(score), visits: v.n, paid: Math.round(paid), batch: (opt && opt.batch) || 2 });
  });
  // the leads who never came (the owner, 21.11: „avem 10k contacte”), when asked: their city from the form
  if (opt && opt.leads) {
    const leads = await readJSON('data/leads.json', []);
    leads.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).forEach((l) => {
      const ph = normalizePhone(l && l.phone); const k = d9(ph);
      if (!ph || k.length !== 9 || seen.has(k) || /^\s*test\b/i.test(String(l.name || ''))) return no(k, 'l-seen');
      seen.add(k);
      if (opt && opt.only === 'trans' && !inTrans.has(k)) return;
      if (!withTrans && inTrans.has(k)) return no(k, 'l-trans'); if (already.has(k)) return no(k, 'l-already'); if (bought.has(k)) return no(k, 'l-bought'); if (staff.has(k)) return no(k, 'l-staff');
      const city = C.clinicOf(l.location); if (!CITIES.includes(city)) return no(k, 'l-city');
      const to = WA.toE164(l.phone); if (!to) return no(k, 'l-to');
      const age = (now - Date.parse(l.createdAt || 0)) / 864e5;
      pool.push({ k, to, city, fn: FC.firstName(l.name), seg: 'lead', score: Math.round(age < 30 ? 30 : age < 90 ? 20 : age < 365 ? 10 : 0), visits: 0, paid: 0, batch: (opt && opt.batch) || 2 });
    });
  }
  if (opt && opt.dry) return { dry: true, pool: pool.length, trans: inTrans.size, why, segs: pool.reduce((o, p) => Object.assign(o, { [p.city + ' · ' + p.seg + ' · ' + p.score]: (o[p.city + ' · ' + p.seg + ' · ' + p.score] || 0) + 1 }), {}), byCity: CITIES.reduce((o, c) => Object.assign(o, { [c]: pool.filter((p) => p.city === c).length }), {}) };
  const tot = pool.length || 1;
  const share = {}; share['Timișoara'] = Math.round(want * pool.filter((p) => p.city === 'Timișoara').length / tot); share.Arad = want - share['Timișoara'];
  const list = [];
  // a test between messages (opt.pres): handed out in turn down each clinic's ranking, so both get people as good
  const pres = String((opt && opt.pres) || '').split(',').map((x) => x.trim()).filter(Boolean);
  CITIES.forEach((c) => { pool.filter((p) => p.city === c).sort((a, b) => b.score - a.score || String(b.at || '').localeCompare(String(a.at || ''))).slice(0, share[c]).forEach((p, i) => { if (pres.length) p.pre = pres[i % pres.length]; list.push(p); }); });
  st.list = st.list.concat(list); st.armed = false; st.doneAt = ''; st.pickedAt = nowISO();
  await saveState(st);
  // the ones from the Transformarea list: out of it (while it isn't frozen), so nobody gets both
  const fromTr = list.filter((p) => inTrans.has(p.k)).map((p) => p.k);
  if (fromTr.length) { const ex = await excluded(); fromTr.forEach((k) => ex.add(k)); await writeJSON(EXCLUDE, [...ex], { quiet: true }); }
  const by = (f) => CITIES.reduce((o, c) => Object.assign(o, { [c]: list.filter((p) => p.city === c).length }), {});
  const paidOf = list.map((p) => p.paid).sort((a, b) => a - b);
  return { ok: true, picked: list.length, byCity: by(), pool: pool.length, paidMedian: paidOf.length ? paidOf[Math.floor(paidOf.length / 2)] : 0, visits: { min: Math.min(...list.map((p) => p.visits)), max: Math.max(...list.map((p) => p.visits)) } };
}
// why the Transformarea list's people left (?fcleft) are not picked: counts only (the owner, 23.11)
async function whyLeft() {
  const st = await loadState();
  const FC = require('./fc-campaign');
  const [trans, orders, emps, sentMap] = await Promise.all([FC.buildAudience(), readJSON('data/card-sarbatori.json', []), readJSON('data/employees.json', []), readJSON(SENT, null)]);
  const sent = sentMap || {};
  const off = await require('./optout').set();
  const inList = new Set(st.list.map((p) => p.k));
  const bought = new Set(orders.map((o) => d9(o && o.phone)).filter((k) => k.length === 9));
  const staff = new Set(emps.map((e) => d9(e && e.phone)).filter((x) => x.length === 9));
  const c = { total: trans.length, sentCard: 0, inListNotSent: 0, optout: 0, ordered: 0, staff: 0, free: 0 };
  trans.forEach((p) => { if (sent[p.k]) c.sentCard++; else if (inList.has(p.k)) c.inListNotSent++; else if (off.has(p.k)) c.optout++; else if (bought.has(p.k)) c.ordered++; else if (staff.has(p.k)) c.staff++; else c.free++; });
  return c;
}
// everyone in our files not reached by the card yet (the owner, 23.11: „mai avem contacte?”): counts only, by city and kind
async function allLeft() {
  const st = await loadState();
  const { normalizePhone } = require('./clients');
  const C = require('./clinic');
  const [clients, leads, appts, orders, emps, sentMap] = await Promise.all([readJSON('data/clients.json', []), readJSON('data/leads.json', []), readJSON('data/appointments.json', []), readJSON('data/card-sarbatori.json', []), readJSON('data/employees.json', []), readJSON(SENT, null)]);
  const sent = sentMap || {};
  const off = await require('./optout').set();
  const inList = new Set(st.list.map((p) => p.k));
  const bought = new Set(orders.map((o) => d9(o && o.phone)).filter((k) => k.length === 9));
  const staff = new Set(emps.map((e) => d9(e && e.phone)).filter((x) => x.length === 9));
  const vis = new Map();
  appts.forEach((a) => { if (a && a.clientId && a.status === 'finalizata') { const v = vis.get(a.clientId) || { n: 0, city: '' }; v.n++; v.city = C.clinicOf(a.location) || v.city; vis.set(a.clientId, v); } });
  const seen = new Map(); // k -> { kind, city }
  const leadCity = new Map(); leads.forEach((l) => { const k = d9(normalizePhone(l && l.phone)); if (k.length === 9 && !leadCity.has(k)) leadCity.set(k, C.clinicOf(l.location)); });
  clients.forEach((c) => { const ph = normalizePhone(c && c.phone); const k = d9(ph); if (!ph || k.length !== 9 || seen.has(k) || /^\s*test\b/i.test(String(c.name || ''))) return; const v = vis.get(c.id); seen.set(k, { kind: v ? 'client' : 'fisa-fara-vizita', city: (v && v.city) || leadCity.get(k) || C.clinicOf(c.location) || '' }); });
  leads.forEach((l) => { const ph = normalizePhone(l && l.phone); const k = d9(ph); if (!ph || k.length !== 9 || seen.has(k) || /^\s*test\b/i.test(String(l.name || ''))) return; seen.set(k, { kind: 'lead', city: C.clinicOf(l.location) || '' }); });
  const out = { total: seen.size, reached: 0, optout: 0, ordered: 0, staff: 0, left: {} };
  seen.forEach((x, k) => {
    if (sent[k] || inList.has(k)) return out.reached++;
    if (off.has(k)) return out.optout++;
    if (bought.has(k)) return out.ordered++;
    if (staff.has(k)) return out.staff++;
    const key = (CITIES.includes(x.city) ? x.city : 'fără oraș') + ' · ' + x.kind; out.left[key] = (out.left[key] || 0) + 1;
  });
  return out;
}
// a new message of the wave, made from the BioLifting one (its picture, buttons, footer) with a new text and picture, one
// per clinic, sent to Meta for approval (the owner, 23.11: the offer in the first line, before „Citește mai mult”)
async function makeTemplate(o) {
  const key = String(o.key || '').replace(/[^\w]/g, '');
  if (!/^card_sarbatori_\w+$/.test(key)) return { error: 'bad_key' };
  const img = o.image ? Buffer.from(String(o.image), 'base64') : null;
  if (!img || img.length < 1000) return { error: 'no_image' };
  const d = await WT.load();
  const out = {};
  for (const c of CITIES.filter((x) => !o.city || x === o.city)) {
    const tag = TAG[c];
    const fk = key + '_' + tag;
    const from = d.templates.find((t) => t.fastcash === 'card_sarbatori_bl_' + tag);
    if (!from) { out[c] = 'lipsește șablonul de bază'; continue; }
    const path = 'fastcash/' + fk + '.jpg';
    await require('./store').writeBinary(path, img, 'image/jpeg');
    let t = d.templates.find((x) => x.fastcash === fk);
    if (!t) {
      const buttons = (from.buttons || []).map((b) => Object.assign({}, b, b.url ? { url: String(b.url).replace(/utm_content=[^&#]*/, 'utm_content=' + String(o.utm || key.replace('card_sarbatori_', '990'))) } : {}, b.url && o.urlText ? { text: String(o.urlText).slice(0, 25) } : {}));
      const cl = WT.clean({ label: String(o.label || 'Cardul de Sărbători') + ' · ' + c, category: 'MARKETING', headerType: 'IMAGE', body: String(o.body || ''), footer: from.footer || '', buttons, only: [c] });
      if (cl.error) return { error: cl.error };
      t = Object.assign(cl.t, { fastcash: fk, samplePath: path, headerImagePath: path, only: [c] });
      d.templates.push(t);
    } else { t.samplePath = path; t.headerImagePath = path; }
    const r = await WT.submit(d, t.id).catch((e) => ({ error: e.message }));
    out[c] = r.error ? 'eroare: ' + r.error : 'trimis la Meta';
  }
  await WT.save(d);
  return { ok: true, out };
}
// the Black Friday wave (the owner, 24.11): everyone in our files who has NOT had a Cardul de Sărbători message, without
// the ones who said no (the no-offers list and the stop words in their chats), the job candidates, the other cities and the
// ones with a card order; counts only, per clinic and per reason, plus the other cities' words (to judge the surroundings)
const NEAR = { 'Timișoara': /timi|giroc|chisoda|dumbravita|ghiroda|mosnita|sanmihai|săcălaz|sacalaz|dudestii|remetea mare|utvin|becicherec|sag\b|şag|șag|parta|recas|recaș|buzias|buziaș|lugoj|jimbolia|deta|sannicolau|sânnicolau|ciacova|carpinis|cărpiniș|orţişoara|ortisoara|giarmata|pischia|bucovat|ghizela|maşloc|masloc|ianova|cenei|uivar|cheveres/i,
  Arad: /arad|vladimirescu|zimandu|frumuseni|fântânele|fantanele|sânleani|sanleani|livada|horia|zădăreni|zadareni|şiria|siria|pecica|lipova|ineu|curtici|sântana|santana|nadlac|nădlac|chisineu|chișineu|pâncota|pancota|sebiș|sebis|ghioroc|cuvin|minis|miniș|covasint|macea|semlac|iratosu|zabrani|zăbrani/i };
const nearOf = (loc) => { const t = String(loc || ''); return NEAR['Timișoara'].test(t) ? 'Timișoara' : NEAR.Arad.test(t) ? 'Arad' : ''; };
async function bfAudience(opt) {
  const st = await loadState();
  const { normalizePhone } = require('./clients');
  const OPT = require('./optout');
  const [clients, leads, appts, orders, emps, cands, convos, sentMap, prev] = await Promise.all([readJSON('data/clients.json', []), readJSON('data/leads.json', []), readJSON('data/appointments.json', []), readJSON('data/card-sarbatori.json', []),
    readJSON('data/employees.json', []), readJSON('data/candidates.json', []), readJSON('data/whatsapp-conversations.json', []), readJSON(SENT, null), readJSON(P + 'sent-prev.json', null)]);
  const sent = Object.assign({}, prev || {}, sentMap || {});
  const off = await OPT.set();
  // who wrote a stop word in her chat (not on the list yet)
  const fold2 = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const REFUSE = /\b(stop|dezabon\w*|spam|blochez|blocat|nu sunt interesat\w*|nu ma intereseaza|nu mai vreau|nu mai doresc|nu mai trimite\w*|lasati-?ma|lasa-?ma in pace|cine sunteti|de unde aveti numarul|nu v-?am dat|sterge\w*-?ma|nu ma mai \w+)\b/;
  const stopWords = new Set(); let chats = 0; const chatted = new Set();
  (convos || []).forEach((c) => { const k = d9(c.phone); if ((c.messages || []).some((m) => m && m.direction === 'in')) { chatted.add(k); chats++; } if ((c.messages || []).some((m) => m && m.direction === 'in' && (OPT.isStop(m.text) || REFUSE.test(fold2(m.text))))) stopWords.add(k); });
  const reached = new Set(st.list.map((p) => p.k).concat(Object.keys(sent)));
  const carded = new Set(orders.map((o) => d9(o && o.phone)).filter((k) => k.length === 9));
  const staff = new Set(emps.map((e) => d9(e && e.phone)).filter((x) => x.length === 9));
  const cand = new Set((Array.isArray(cands) ? cands : (cands.list || [])).map((c) => d9(c && c.phone)).filter((x) => x.length === 9));
  const hireLead = (l) => /angaj|cv\b|job|candidat|recrut|hiring/i.test(String((l && (l.interest || '')) + ' ' + (l && l.source || '') + ' ' + (l && (l.form || l.formName) || '')));
  leads.forEach((l) => { if (hireLead(l)) { const k = d9(l.phone); if (k.length === 9) cand.add(k); } });
  const C = require('./clinic');
  const visCity = new Map(); appts.forEach((a) => { if (a && a.clientId && a.status === 'finalizata') visCity.set(a.clientId, C.clinicOf(a.location) || visCity.get(a.clientId) || ''); });
  const seen = new Map();
  const put = (ph, name, loc, kind, clientId, extra) => { const p = normalizePhone(ph); const k = d9(p); if (!p || k.length !== 9 || seen.has(k) || /^\s*test\b/i.test(String(name || ''))) return; seen.set(k, { k, to: WA.toE164(ph), fn: require('./fc-campaign').firstName(name), loc: String(loc || ''), city: (clientId && visCity.get(clientId)) || nearOf(loc), kind, src: String(extra && extra.source || '').slice(0, 30), yr: String(extra && (extra.createdAt || extra.created) || '').slice(0, 4), at: String(extra && (extra.createdAt || extra.created) || '') }); };
  clients.forEach((c) => put(c && c.phone, c && c.name, c && c.location, visCity.has(c && c.id) ? 'client' : 'fisa', c && c.id, c));
  leads.slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).forEach((l) => put(l && l.phone, l && l.name, l && l.location, 'lead', null, l));
  const out = { total: seen.size, excluded: { reached: 0, optout: 0, stopWords: 0, candidates: 0, card: 0, staff: 0, noWhatsApp: 0, notRoMobile: 0, otherCity: 0 }, fisa: { source: {}, year: {}, chatted: 0, loc: {} }, byCity: {}, otherWords: {}, list: [] };
  seen.forEach((x) => {
    const ex = reached.has(x.k) ? 'reached' : off.has(x.k) ? 'optout' : stopWords.has(x.k) ? 'stopWords' : cand.has(x.k) ? 'candidates' : carded.has(x.k) ? 'card' : staff.has(x.k) ? 'staff' : !x.to ? 'noWhatsApp' : !/^\+?407\d{8}$/.test(String(x.to).replace(/\s/g, '')) ? 'notRoMobile' : !x.city ? 'otherCity' : '';
    if (ex) { out.excluded[ex]++; if (ex === 'otherCity') { const w = x.loc.trim().toLowerCase().slice(0, 30) || '(gol)'; out.otherWords[w] = (out.otherWords[w] || 0) + 1; } return; }
    const b = out.byCity[x.city] = out.byCity[x.city] || { n: 0, client: 0, fisa: 0, lead: 0 }; b.n++; b[x.kind]++;
    if (x.kind === 'fisa') { const f = out.fisa; f.source[x.src || '-'] = (f.source[x.src || '-'] || 0) + 1; f.year[x.yr || '-'] = (f.year[x.yr || '-'] || 0) + 1; if (chatted.has(x.k)) f.chatted++; const w = x.loc.trim().toLowerCase().slice(0, 24) || '(gol)'; f.loc[w] = (f.loc[w] || 0) + 1; }
    if (opt && opt.list) out.list.push(x);
  });
  out.eligible = Object.values(out.byCity).reduce((n, b) => n + b.n, 0);
  out.otherWords = Object.fromEntries(Object.entries(out.otherWords).sort((a, b) => b[1] - a[1]).slice(0, 30));
  out.fisa.loc = Object.fromEntries(Object.entries(out.fisa.loc).sort((a, b) => b[1] - a[1]).slice(0, 15));
  out.chats = chats; out.stopFound = stopWords.size;
  if (!(opt && opt.list)) delete out.list;
  return out;
}
// the Black Friday batches (the owner, 24.11: „fă-ți o listă de 1500 … în batchuri de 300”): picked from bfAudience, so every
// exclusion holds (reached in any wave, opt-outs, stop words in her chat, job candidates, card orders, staff, no WhatsApp,
// not a Romanian mobile, other cities); clients first, then leads, then the old files, newest first in each
async function pickBf(n, opt) {
  const want = Math.max(1, Math.min(1000, Number(n) || 300));
  const st = await loadState();
  if (st.armed && !st.doneAt) return { error: 'still_sending' };
  const a = await bfAudience({ list: true });
  const RANK = { client: 0, lead: 1, fisa: 2 };
  const pool = a.list.filter((x) => CITIES.includes(x.city) && x.to).sort((x, y) => RANK[x.kind] - RANK[y.kind] || String(y.at || '').localeCompare(String(x.at || '')));
  const list = pool.slice(0, want).map((x) => ({ k: x.k, to: x.to, city: x.city, fn: x.fn, seg: 'bf-' + x.kind, score: 0, visits: 0, paid: 0, batch: (opt && opt.batch) || 2, at: x.at || '' }));
  const by = (l, f) => l.reduce((o, p) => Object.assign(o, { [f(p)]: (o[f(p)] || 0) + 1 }), {});
  const info = { eligible: a.eligible, excluded: a.excluded, stopFound: a.stopFound, picked: list.length, byCity: by(list, (p) => p.city), byKind: by(list, (p) => p.seg) };
  if (opt && opt.dry) return Object.assign({ dry: true }, info);
  st.list = st.list.concat(list); st.armed = false; st.doneAt = ''; st.pickedAt = nowISO();
  await saveState(st);
  // the ones from the Transformarea list: out of it, so nobody gets both
  const FC = require('./fc-campaign');
  const inTrans = new Set((await FC.buildAudience()).map((p) => p.k));
  const fromTr = list.filter((p) => inTrans.has(p.k)).map((p) => p.k);
  if (fromTr.length) { const ex = await excluded(); fromTr.forEach((k) => ex.add(k)); await writeJSON(EXCLUDE, [...ex], { quiet: true }); }
  return Object.assign({ ok: true }, info);
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

// which message the next sends use (the owner, 21.11): 'bl' / 'bl490' the messages with the BioLifting gift for paying online
// (22.11), 'v4', 'bf' (Black Friday, 24.11). Only these (the audit, 24.11): the first one, '290' and '490' still name the
// 290 card or the EMS gift, so they can no longer be chosen; any other value is refused, never the first one by default
const USE_TPL = { bl: 'card_sarbatori_bl', bl490: 'card_sarbatori_bl_490', v4: 'card_sarbatori_v4', bf: 'card_sarbatori_bf4' };
async function useTemplate(v) {
  if (!Object.prototype.hasOwnProperty.call(USE_TPL, String(v || ''))) return { error: 'bad_template', allowed: Object.keys(USE_TPL) };
  const st = await loadState();
  st.pre = USE_TPL[v];
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
    // „Rezerv în clinică” in the message: a request in Carduri, reception told (the owner, 22.11)
    if (kind === 'tap' && /rezerv/i.test(String(text || ''))) {
      const p = m.st.list.find((x) => x.k === k) || {};
      await require('./card-sarbatori').requestFromTap({ phone: '0' + k, city: p.city, tier: tierOfPre((m.byK.get(k) || {}).t || p.pre), wave: p.batch || 1 }).catch((e) => console.error('cardblast tap request', e.message));
    }
    return kind;
  } catch (err) { console.error('cardblast noteAnswer', err.message); return null; }
}

const tierOfPre = (pre) => (/_290$/.test(String(pre || '')) ? 290 : /_490$/.test(String(pre || '')) ? 490 : 990);
// the taps on „Rezerv în clinică” made before the requests existed: once, into Carduri, no WhatsApp, no alerts (counts back)
async function backfillTaps() {
  const v = await require('./card-kpi').view({ fresh: true });
  const sent = (await readJSON(SENT, null)) || {};
  const out = { taps: 0, made: 0, existed: 0, errors: 0, fromChats: 0 };
  const CS = require('./card-sarbatori');
  const one = async (k, city, tier, wave) => {
    const r = await CS.requestFromTap({ phone: '0' + k, city, tier, wave }, { quiet: true }).catch((e) => ({ error: e.message }));
    if (r && r.exists) out.existed++; else if (r && r.ok) out.made++; else out.errors++;
  };
  const done = new Set();
  for (const p of v.people || []) {
    if (!(p.answers || []).some((a) => a.kind === 'tap' && /rezerv/i.test(String(a.text || '')))) continue;
    out.taps++; done.add(p.k);
    await one(p.k, p.city, tierOfPre((sent[p.k] || {}).t), p.batch);
  }
  // the taps from before her answers were counted (21.11, before 16:40 UTC) and the ones written as words („am încercat
  // să rezerv…”): read from the chats of the people who got the message; the sum she names wins over the message's
  const st = await loadState();
  const byK = new Map(st.list.map((p) => [p.k, p]));
  const convos = await readJSON('data/whatsapp-conversations.json', []);
  for (const c of convos) {
    const k = d9(c && c.phone);
    if (!byK.has(k) || done.has(k) || !sent[k] || !sent[k].w) continue;
    const ins = (c.messages || []).filter((m) => m && m.direction === 'in' && String(m.timestamp || '') >= String(sent[k].at || ''));
    const said = ins.map((m) => String(m.text || '')).join(' ');
    if (!/rezerv/i.test(said)) continue;
    const named = (said.match(/\b(290|490|990)\b/) || [])[1];
    out.fromChats++; done.add(k);
    const p = byK.get(k);
    await one(k, p.city, named ? Number(named) : tierOfPre(sent[k].t || p.pre), p.batch || 1);
  }
  return out;
}

module.exports = { pickBf, bfAudience, nearOf, makeTemplate, allLeft, unresend, resend, whyLeft, backfillTaps, useTemplate, pick, pickMore, unpick, go, stop, tick, status, excluded, EXCLUDE, onInbound, backfillChats, onStatus, noteAnswer, kindOf, tokenOf, STATE, SENT, P };
