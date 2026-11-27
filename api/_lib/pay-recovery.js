// The checkout's one recovery message (George, 23.11): she gave her name and phone at „Plătesc online” (an offer, a treatment
// of the price list or a held hour) and 10 minutes later it is still not paid → ONE short, kind WhatsApp from her clinic's
// number. She never wrote us, so only an approved template can go (made here, sent to Meta for approval; until Meta
// approves it the messages wait and nothing is sent). The cards have their own (api/_lib/card-sarbatori.js).
// Never: a paid / cancelled / test order, the test number 07 0000 0000, an order that had its message, a phone that got
// one in the last 24 hours, between 21:00 and 9:00 (Romania): those wait for 9:00. Older than a day: not sent.
//   data/pay-recovery.json { sent: [{ p9, at, id }], counts: { sent, skipped, failed } }   (p9: the phone's last 9 digits)
const { readJSON, writeJSON } = require('./store');

const LOG = 'data/pay-recovery.json';
const KINDS = ['offer', 'treatment', 'hold'];
const AFTER = 10 * 60e3, MAX_AGE = 24 * 3600e3, PER_PHONE = 24 * 3600e3;
const TPL = { purpose: 'pay-recovery', label: 'Plata online neterminata', category: 'UTILITY', footer: 'Centrul360',
  body: 'Hei {prenume}! Am văzut că plata pentru {serviciu} nu s-a terminat. Dacă ai avut vreo problemă, scrie-ne aici și te ajutăm imediat 🥰' };
const nowISO = () => new Date().toISOString();
const p9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const roHour = (ms) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hour12: false }).format(new Date(ms))) % 24;
const quiet = (ms) => { const h = roHour(ms); return h >= 21 || h < 9; };
const first = (name) => { const f = String(name || '').trim().split(/\s+/)[0].replace(/[^\p{L}-]/gu, ''); return f.length >= 2 ? f.slice(0, 30) : 'dragă'; };
const what = (o) => String(o.title || 'programarea ta').replace(/\s+/g, ' ').slice(0, 60);

// the template: made once, sent to Meta for approval (both numbers' accounts); its state
let tplMemo = { at: 0, v: null };
async function template(force) {
  if (!force && tplMemo.at && Date.now() - tplMemo.at < 10 * 60e3) return tplMemo.v;
  const WT = require('./wa-templates');
  const d = await WT.load();
  let t = d.templates.find((x) => x.purpose === TPL.purpose);
  let changed = false;
  if (!t) {
    const c = WT.clean({ label: TPL.label, category: TPL.category, body: TPL.body, footer: TPL.footer, buttons: [] });
    if (c.error) return { state: 'eroare: ' + c.error };
    t = Object.assign(c.t, { id: 'pay-recovery-' + require('crypto').randomUUID().slice(0, 6), purpose: TPL.purpose });
    d.templates.push(t); changed = true;
  }
  let st = WT.overall(t);
  // Meta's answer read back now and then while it waits
  if (st === 'PENDING' && (!d.syncedAt || Date.now() - Date.parse(d.syncedAt) > 15 * 60e3)) { await WT.sync(d).catch(() => null); changed = true; t = d.templates.find((x) => x.purpose === TPL.purpose); st = WT.overall(t); }
  let sentNow = '';
  if (st === 'DRAFT' || st === 'REJECTED' || Object.keys(t.meta || {}).length < (await WT.accounts()).list.length) {
    const s = await WT.submit(d, t.id).catch((e) => ({ error: e.message }));
    if (!s.error || s.partial) changed = true;
    sentNow = s.error ? 'eroare: ' + s.error : 'trimis la Meta';
    st = WT.overall(t);
  }
  if (changed) await WT.save(d);
  const v = { state: st, sentNow, name: t.name, accounts: Object.values(t.meta || {}).map((m) => ({ status: m.status, reason: m.reason || undefined })), t };
  tplMemo = { at: Date.now(), v };
  return v;
}

// the message in the chat (Mesaje): the team sees what she got
async function logChat(phone, city, name, text, id, orderId) {
  try {
    const { normalizePhone } = require('./clients');
    const p = normalizePhone(phone) || String(phone || '');
    if (!p) return;
    const K = 'data/whatsapp-conversations.json';
    const conversations = await readJSON(K, []);
    let convo = conversations.find((c) => c.phone === p);
    if (!convo) { convo = { phone: p, clientName: name || p, location: city, lastMessageAt: nowISO(), unreadCount: 0, messages: [] }; conversations.push(convo); }
    convo.messages.push({ id: id || require('crypto').randomUUID(), direction: 'out', type: 'text', text, status: 'sent', timestamp: nowISO(), sentBy: null, sentByName: 'automat', auto: true, payOrder: orderId });
    convo.lastMessageAt = nowISO();
    await require('./wa-convos').saveConversations(conversations);
  } catch (e) { console.error('pay recovery chat:', e.message); }
}

// ---- the guards (George, 23.11: only when it is CERTAIN she did not pay; never a false message)
const NOT_PAID = ['Pending', 'Seen', 'Expired'];
const WINDOW = 30 * 60e3; // from the moment it is due: unsure all that time (myPOS not answering) → never sent
// when it is due: 10 minutes after her last sign of life; in the quiet hours (21:00–9:00 Romania), at 9:00
function dueAt(last) {
  let t = last + AFTER;
  for (let i = 0; i < 60 && quiet(t); i++) t = Math.ceil((t + 1) / (15 * 60e3)) * 15 * 60e3;
  return t;
}
// any incoming payment of her sum in the last hour (online or at a clinic's terminal): possibly hers → no message
async function moneySeen(o, now, deps) {
  if (deps && deps.transactions) return deps.transactions(o, now);
  const M = require('./mypos');
  const conn = await M.loadConn(readJSON);
  if (!M.connected(conn)) throw new Error('tx_not_connected');
  const raw = await M.listTransactions(conn, now - 60 * 60e3, now);
  return raw.some((t) => {
    if (Number(t.transaction_amount) < 0 || /debit|^d$|out/.test(String(t.sign || t.direction || t.debit_credit || '').toLowerCase()) || String(t.transaction_type || '').padStart(3, '0') === '011') return false;
    const amt = Math.abs(Number(String(t.original_currency === 'RON' ? t.original_amount : t.transaction_amount).replace(',', '.')) || 0);
    return Math.abs(amt - Number(o.amount)) < 0.01;
  });
}
// her other ways of being done: a newer order of hers paid or still fresh, her held hour booked, a booking of hers made or
// confirmed after this order, money of hers in Încasări today
async function otherwiseDone(P, o, now) {
  const k = p9(o.phone), from = Date.parse(o.createdAt) || 0;
  const open = (await readJSON('data/pay-open.json', [])) || [], paid = (await readJSON('data/pay-paid.json', [])) || [];
  for (const it of open.concat(paid).filter((x) => x.id !== o.id && Date.parse(x.at) > from).slice(-30)) {
    const { data: x } = await P.readOrder(it.id);
    if (!x || p9(x.phone) !== k) continue;
    if (x.status === 'paid') return 'alta_comanda_platita';
    if (x.status === 'open' && now - P.lastActivity(x) < AFTER) return 'alta_comanda_deschisa';
  }
  if (o.kind === 'hold') {
    const h = await require('./booking-holds').get(o.ref);
    if (h && (h.bookingId || h.booked)) return 'ora_rezervata';
  }
  const appts = (await readJSON('data/appointments.json', [])) || [];
  if (appts.some((a) => a && p9(a.clientPhone) === k && !['anulata', 'concediu'].includes(a.status) && (Date.parse(a.createdAt || a.updatedAt || '') || 0) >= from - 60e3)) return 'programare_facuta';
  const sales = (await readJSON('data/sales.json', [])) || [];
  if (sales.some((x) => x && p9(x.clientPhone) === k && (Date.parse(x.createdAt) || 0) >= from - 60e3)) return 'incasare';
  return '';
}

// the orders due now (dry: what would happen, nothing sent or written). P: api/_lib/pay.js. deps (tests): { now, send,
// template, transactions }
async function run(P, opts) {
  opts = opts || {};
  const deps = opts.deps || {}, dry = !!opts.dry, now = deps.now || Date.now();
  const open = (await readJSON('data/pay-open.json', [])) || [];
  const log = (await readJSON(LOG, {})) || {};
  log.sent = (log.sent || []).filter((x) => now - Date.parse(x.at) < 7 * 864e5);
  log.counts = log.counts || { sent: 0, skipped: 0, failed: 0 };
  const out = { due: 0, sent: 0, skipped: 0, waiting: 0, dry, items: [] };
  const cands = open.filter((it) => now - Date.parse(it.at) >= AFTER && now - Date.parse(it.at) < MAX_AGE).slice(-40);
  let tpl = null, dirty = false;
  const item = (o, x) => out.items.push(Object.assign({ id: o.id, kind: o.kind }, x));
  for (const it of cands) {
    let { data: o } = await P.readOrder(it.id);
    if (!o || o.status !== 'open' || !KINDS.includes(o.kind) || o.test || o.recovery || !o.phone || o.provider !== 'requests' || o.probable) continue;
    const due = dueAt(P.lastActivity(o));
    if (now < due) continue;
    const skip = async (why) => { out.skipped++; item(o, { skip: why }); if (!dry) { await P.markRecovery(o.id, { skipped: why, at: nowISO() }, true); log.counts.skipped++; dirty = true; } };
    if (now > due + WINDOW) { await skip('prea_tarziu'); continue; }
    if (p9(o.phone) === '700000000') { await skip('numar_test'); continue; }
    if (log.sent.some((x) => x.p9 === p9(o.phone) && now - Date.parse(x.at) < PER_PHONE)) { await skip('24h'); continue; }
    if (quiet(now)) { out.waiting++; item(o, { wait: 'ora_9' }); continue; }
    out.due++;
    if (!tpl) tpl = deps.template ? await deps.template() : await template().catch((e) => ({ state: 'eroare: ' + e.message }));
    if (tpl.state !== 'APPROVED') { out.waiting++; item(o, { wait: 'sablon_' + String(tpl.state).toLowerCase() }); continue; }
    // ---- right before the message: everything asked again; any doubt → not now (the next minute asks again)
    // (1) myPOS, word for word: only Pending / Seen / Expired is a sure „not paid”
    let rq;
    try { rq = await P.requestWords(o); } catch (e) { out.waiting++; item(o, { wait: 'mypos_eroare' }); continue; }
    if (rq.words.some((w) => !NOT_PAID.includes(w))) {
      if (rq.words.includes('Paid') && !dry) await P.check(o.id, o.key).catch(() => null); // marked paid now
      out.waiting++; item(o, { wait: 'mypos_' + rq.words.join('_').toLowerCase() }); continue;
    }
    // (2) the money: any payment of her sum in the last hour, online or at a terminal
    let seen;
    try { seen = await moneySeen(o, now, deps); } catch (e) { out.waiting++; item(o, { wait: 'tranzactii_eroare' }); continue; }
    if (seen) { out.waiting++; item(o, { wait: 'suma_vazuta' }); continue; }
    // (3) the order and her other ways, read again
    o = (await P.readOrder(o.id)).data;
    if (!o || o.status !== 'open' || o.test || o.recovery) { item({ id: it.id, kind: '' }, { wait: 'schimbata' }); continue; }
    const done = await otherwiseDone(P, o, now);
    if (done) { await skip(done); continue; }
    if (dry) { item(o, { would: 'send', city: o.city }); continue; }
    // (4) the lock: the order marked „sending” before the message, one phone once a day (two clocks: one sends)
    // (a token of this run in the mark: two runs writing the same moment never both take it)
    const token = require('crypto').randomUUID();
    if (!(await P.markRecovery(o.id, { state: 'sending', at: nowISO(), by: token }, true))) { item(o, { wait: 'blocat' }); continue; }
    const back = (await P.readOrder(o.id)).data;
    if (!back || !back.recovery || back.recovery.by !== token) { item(o, { wait: 'blocat' }); continue; }
    let phoneLock = true;
    try { phoneLock = await require('./store').createOnce('locks/pay-recovery/' + p9(o.phone) + '-' + Math.floor(now / PER_PHONE) + '.txt', o.id); } catch (e) { phoneLock = false; }
    if (!phoneLock) { await P.markRecovery(o.id, { state: 'skipped', skipped: '24h', at: nowISO() }); out.skipped++; item(o, { skip: '24h' }); continue; }
    const vars = { prenume: first(o.name), serviciu: what(o) };
    const x = await (deps.send ? deps.send(o, vars) : sendNow(o, vars, tpl));
    await P.markRecovery(o.id, { state: x.sent ? 'sent' : 'failed', at: nowISO(), city: x.city || o.city, error: x.sent ? undefined : String(x.error || '').slice(0, 160), msgId: x.id || undefined });
    if (x.sent) { out.sent++; log.counts.sent++; log.sent.push({ p9: p9(o.phone), at: nowISO(), id: o.id }); } else log.counts.failed++;
    dirty = true;
    item(o, { sent: !!x.sent, error: x.sent ? undefined : String(x.error || '').slice(0, 80) });
  }
  if (dirty && !dry) {
    // (the log read again: another clock may have written it meanwhile)
    const now2 = (await readJSON(LOG, {})) || {};
    const ids = new Set((now2.sent || []).map((x) => x.id));
    now2.sent = (now2.sent || []).concat(log.sent.filter((x) => !ids.has(x.id))).filter((x) => now - Date.parse(x.at) < 7 * 864e5);
    now2.counts = { sent: (now2.sent || []).length, skipped: Math.max((now2.counts || {}).skipped || 0, log.counts.skipped), failed: Math.max((now2.counts || {}).failed || 0, log.counts.failed) };
    await writeJSON(LOG, now2, { quiet: true });
  }
  return out;
}
// the message itself: the approved template, from her clinic's number
async function sendNow(o, vars, tpl) {
  const WA = require('./whatsapp'), WT = require('./wa-templates');
  const cfg = await WA.loadConfig(), ready = WA.readyNumbers(cfg);
  const city = ready.includes(o.city) ? o.city : ready[0];
  const n = city && cfg.numbers[city];
  if (!n || !WT.approvedFor(tpl.t, n.wabaId)) return { sent: false, error: 'șablonul nu e aprobat pentru ' + (city || 'niciun număr'), city };
  const x = await WA.sendWhatsApp({ phone: o.phone, template: (tpl.t.meta[n.wabaId] || {}).name || tpl.t.name, language: 'ro', params: tpl.t.map.map((k) => vars[k] || '-'), from: city });
  if (x.sent) await logChat(o.phone, x.fromCity || city, o.name, 'Hei ' + vars.prenume + '! Am văzut că plata pentru ' + vars.serviciu + ' nu s-a terminat. Dacă ai avut vreo problemă, scrie-ne aici și te ajutăm imediat 🥰', x.id, o.id);
  return { sent: !!x.sent, error: x.error, id: x.id, city: x.fromCity || city };
}
// counts only (?payopen): what went, what was skipped, what failed, the template's state
async function counts() {
  const log = (await readJSON(LOG, {})) || {};
  const day = (log.sent || []).filter((x) => Date.now() - Date.parse(x.at) < 864e5).length;
  return Object.assign({ last24h: day }, log.counts || { sent: 0, skipped: 0, failed: 0 });
}

// switched on by hand once the template is approved (POST lead-health ?payopen=recoveryon); off by default
const ON = 'data/pay-recovery-on.json';
async function on() { const d = (await readJSON(ON, {}).catch(() => ({}))) || {}; return d.on === true; }
async function setOn(v) { await writeJSON(ON, { on: !!v, at: nowISO() }, { quiet: true }); return on(); }

module.exports = { run, template, counts, TPL, quiet, dueAt, on, setOn };
