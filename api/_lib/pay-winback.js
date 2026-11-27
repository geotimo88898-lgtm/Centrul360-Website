// The site's unfinished payments, won back (George, 27.11 ~10:10): „trimite un mesaj la toți cei care n-au reușit să
// finalizeze plata până acum … scurt și la obiect … le mai dai cadou un masaj facial dacă finalizează acum”, and „să intre în
// checkoutul lor salvat, doar cu un masaj facial în plus adăugat unde scrie gratuit”.
//   ONE WhatsApp (an approved marketing template, from her clinic's number) to each client who gave her phone at the payment
//   and never paid since the checkout began (24.11): her name, what she chose, the gift, and a button to her saved checkout.
//   The button opens her order as it was (the same lines, the same price) with one more line, the facial massage, „Gratuit”,
//   and one button to pay it (/api/pay-go?w=<order>.<token>; an order the clock let go is opened again, a myPOS page that
//   expired is made again). Paid until the gift's end (Friday 27.11 23:59, Romania): the desk hears it, her booking carries it.
//   Never: a test order, the test number, a phone that paid any order since, a phone with a booking from today on, a card
//   paid another way, a phone already sent this, any order myPOS says is paid, the quiet hours (21:00 to 9:00).
//   data/pay-winback.json { sent: [{ p9, id, at, city, msgId }], failed: [{ p9, id, at, error }], gifts: [{ p9, id, at }] }
const crypto = require('crypto');
const { readJSON, writeJSON } = require('./store');

const KEY = 'data/pay-winback.json';
const SINCE = '2026-11-24T00:00:00Z';
const GIFT_UNTIL = '2026-11-27T21:59:59Z'; // the gift: paid today, Friday 27.11, 23:59 in Romania
const GIFT = { id: 'masaj-facial', name: 'Masaj facial clasic', full: 160 };
// left out by George's word: their phone gets nothing (27.11 ~10:40: „exclude-o pe aia de 2120 lei, e acum la salon și achită acolo”)
const EXCLUDE_ORDERS = ['C360-mwxxsl1943dc13f2'];
const SITE = 'https://www.centrul360.com';
const TPL = {
  purpose: 'pay-winback', label: 'Plata site neterminata, masaj facial cadou', category: 'MARKETING', footer: 'Centrul360',
  body: 'Bună, {prenume}! Plata pentru {serviciu} de pe centrul360.com nu s-a finalizat. Dacă o finalizezi azi, îți dăm cadou și un masaj facial, iar prețul rămâne cel din coș. Dacă a fost o problemă cu cardul, răspunde-ne aici și te ajutăm.',
  button: { type: 'URL', text: 'Finalizează plata', url: SITE + '/api/pay-go?w={{1}}', example: SITE + '/api/pay-go?w=C360-mwyo047577dbb70c.AbCdEfGh12345678' },
};
const nowISO = () => new Date().toISOString();
const p9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
const lei = (n) => Math.round(Number(n) || 0).toLocaleString('ro-RO') + ' lei';
const dayRO = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const roHour = (ms) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hour12: false }).format(new Date(ms))) % 24;
const quiet = (ms) => { const h = roHour(ms); return h >= 21 || h < 9; };
const first = (name) => { const f = String(name || '').trim().split(/\s+/)[0].replace(/[^\p{L}-]/gu, ''); return f.length >= 2 ? f.slice(0, 30) : 'dragă'; };
const what = (o) => String(o.title || 'comanda ta').replace(/^(Comandă online|Avans)\s*[·:]\s*/i, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'comanda ta';
const giftOn = (t) => (t || Date.now()) <= Date.parse(GIFT_UNTIL);

// the link's secret: the order id signed with the portal's secret (never the order's own key, which pays it from the page)
function token(id) {
  const k = String(process.env.PORTAL_SECRET || '');
  if (!k) throw new Error('no_secret');
  return crypto.createHmac('sha256', k + '|pay-winback').update(String(id)).digest('base64url').slice(0, 16);
}
const wOf = (id) => String(id) + '.' + token(id);
function fromW(w) {
  const m = /^(C360-[a-z0-9]{6,30})\.([\w-]{16})$/.exec(String(w || ''));
  if (!m) return null;
  let t = '';
  try { t = token(m[1]); } catch (e) { return null; }
  const a = Buffer.from(t), b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? m[1] : null;
}

async function load() { return Object.assign({ sent: [], failed: [], gifts: [] }, (await readJSON(KEY, null)) || {}); }

// ---- who: one per phone, her newest unpaid order (her last wish), only when nothing says she is done
async function recipients(now) {
  const P = require('./pay');
  now = now || Date.now();
  const idx = ((await readJSON(P.INDEX, [])) || []).filter((x) => x && Date.parse(x.at) >= Date.parse(SINCE));
  const orders = [];
  for (const it of idx) { const { data: o } = await P.readOrder(it.id); if (o && !o.test && o.kind !== 'test') orders.push(o); }
  const byPhone = new Map();
  for (const o of orders) {
    const k = p9(o.phone);
    if (!k || k.length < 9 || k === '700000000') continue;
    if (!byPhone.has(k)) byPhone.set(k, []);
    byPhone.get(k).push(o);
  }
  const appts = (await readJSON('data/appointments.json', [])) || [];
  const cards = (await readJSON('data/card-sarbatori.json', [])) || [];
  const sales = (await readJSON('data/sales.json', [])) || [];
  const excluded = new Set(orders.filter((o) => EXCLUDE_ORDERS.includes(o.id)).map((o) => p9(o.phone)));
  const today = dayRO(now);
  const out = [], skipped = [];
  for (const [k, list] of byPhone) {
    const unpaid = list.filter((o) => ['open', 'expired', 'failed'].includes(o.status) && o.failWhy !== 'double' && Number(o.amount) >= 1)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (!unpaid.length) continue;
    const o = unpaid[0];
    const skip = (why) => skipped.push({ kind: o.kind, amount: o.amount, why });
    if (excluded.has(k)) { skip('exclusa_de_george'); continue; }
    if (list.some((x) => x.status === 'paid')) { skip('a_platit_alta_comanda'); continue; }
    // at the clinic today (paying there, or booked): money of hers in Încasări today
    if ((Array.isArray(sales) ? sales : []).some((x) => x && p9(x.clientPhone) === k && dayRO(Date.parse(x.createdAt) || 0) === today)) { skip('incasare_azi'); continue; }
    if (appts.some((a) => a && p9(a.clientPhone) === k && String(a.date || '') >= today && !['anulata', 'concediu'].includes(a.status))) { skip('are_programare'); continue; }
    if ((Array.isArray(cards) ? cards : []).some((r) => r && p9(r.phone) === k && r.status === 'platit')) { skip('card_platit'); continue; }
    out.push({ p9: k, order: o, tries: unpaid.length });
  }
  return { list: out, skipped };
}

// ---- the template: made once, sent to Meta (both clinics' accounts), its state read back while it waits
let memo = { at: 0, v: null };
async function template(force) {
  if (!force && memo.at && Date.now() - memo.at < 60e3) return memo.v;
  const WT = require('./wa-templates');
  const d = await WT.load();
  let t = d.templates.find((x) => x.purpose === TPL.purpose);
  let changed = false;
  if (!t) {
    const c = WT.clean({ label: TPL.label, category: TPL.category, body: TPL.body, footer: TPL.footer, buttons: [TPL.button] });
    if (c.error) return { state: 'eroare: ' + c.error };
    t = Object.assign(c.t, { id: 'pay-winback-' + crypto.randomUUID().slice(0, 6), purpose: TPL.purpose });
    // the link button's example (Meta reviews the button with it; the editor's own clean() keeps no examples)
    t.buttons = t.buttons.map((b) => (b.type === 'URL' ? Object.assign({}, b, { example: TPL.button.example }) : b));
    d.templates.push(t); changed = true;
  }
  let st = WT.overall(t);
  if (st === 'PENDING' && (force || !d.syncedAt || Date.now() - Date.parse(d.syncedAt) > 60e3)) { await WT.sync(d).catch(() => null); changed = true; t = d.templates.find((x) => x.purpose === TPL.purpose); st = WT.overall(t); }
  let sentNow = '';
  if (st === 'DRAFT' || st === 'REJECTED' || Object.keys(t.meta || {}).length < (await WT.accounts()).list.length) {
    const s = await WT.submit(d, t.id).catch((e) => ({ error: e.message }));
    if (!s.error || s.partial) changed = true;
    sentNow = s.error ? 'eroare: ' + s.error : 'trimis la Meta';
    st = WT.overall(t);
  }
  if (changed) await WT.save(d);
  const v = { state: st, sentNow, name: t.name, accounts: Object.values(t.meta || {}).map((m) => ({ status: m.status, reason: m.reason || undefined })), t };
  memo = { at: Date.now(), v };
  return v;
}

// the message in the chat (Mesaje): the team sees what she got
async function logChat(phone, city, name, text, id, orderId) {
  try {
    const { normalizePhone } = require('./clients');
    const p = normalizePhone(phone) || String(phone || '');
    if (!p) return;
    const conversations = await readJSON('data/whatsapp-conversations.json', []);
    let convo = conversations.find((c) => c.phone === p);
    if (!convo) { convo = { phone: p, clientName: name || p, location: city, lastMessageAt: nowISO(), unreadCount: 0, messages: [] }; conversations.push(convo); }
    convo.messages.push({ id: id || crypto.randomUUID(), direction: 'out', type: 'text', text, status: 'sent', timestamp: nowISO(), sentBy: null, sentByName: 'automat', auto: true, payOrder: orderId });
    convo.lastMessageAt = nowISO();
    await require('./wa-convos').saveConversations(conversations);
  } catch (e) { console.error('pay winback chat:', e.message); }
}
const textOf = (vars) => TPL.body.replace('{prenume}', vars.prenume).replace('{serviciu}', vars.serviciu);

// ---- the sending: dry (default) says who would get it (counts and kinds, never a name or a phone); go: sends
// deps (tests): { now, send, template, words }
async function send(opts) {
  opts = opts || {};
  const deps = opts.deps || {}, now = deps.now || Date.now(), go = opts.go === true;
  const P = require('./pay');
  const { list, skipped } = await recipients(now);
  const doc = await load();
  const out = { go, recipients: list.length, sent: 0, failed: 0, skipped: skipped.slice(), items: [] };
  if (go && quiet(now)) return Object.assign(out, { error: 'quiet_hours' });
  const tpl = deps.template ? await deps.template() : await template().catch((e) => ({ state: 'eroare: ' + e.message }));
  out.template = tpl.state;
  if (go && tpl.state !== 'APPROVED') return Object.assign(out, { error: 'template_' + String(tpl.state).toLowerCase() });
  for (const r of list) {
    let o = r.order;
    const item = { kind: o.kind, amount: o.amount, status: o.status, city: o.city, tries: r.tries, who: crypto.createHash('sha256').update('c360|' + r.p9).digest('hex').slice(0, 8) };
    if (doc.sent.some((x) => x.p9 === r.p9)) { out.skipped.push({ kind: o.kind, amount: o.amount, why: 'deja_trimis' }); continue; }
    // myPOS asked again right before: any word but „not paid” → not now (a payment it confirms is marked paid)
    if (o.request && o.request.code) {
      let words = [];
      try { words = deps.words ? await deps.words(o) : (await P.requestWords(o)).words; } catch (e) { out.items.push(Object.assign(item, { wait: 'mypos_eroare' })); continue; }
      if (words.includes('Paid')) { if (go) await P.check(o.id, o.key).catch(() => null); out.skipped.push({ kind: o.kind, amount: o.amount, why: 'platit_in_mypos' }); continue; }
    }
    if (!go) { out.items.push(Object.assign(item, { would: 'send' })); continue; }
    // one message per phone, ever (two runs at once: one sends)
    let lock = true;
    try { lock = await require('./store').createOnce('locks/pay-winback/' + r.p9 + '.txt', o.id); } catch (e) { lock = false; }
    if (!lock) { out.skipped.push({ kind: o.kind, amount: o.amount, why: 'blocat' }); continue; }
    const vars = { prenume: first(o.name), serviciu: what(o) };
    const x = deps.send ? await deps.send(o, vars, wOf(o.id)) : await sendNow(o, vars, tpl);
    const d2 = await load();
    if (x.sent) { out.sent++; d2.sent.push({ p9: r.p9, id: o.id, at: nowISO(), city: x.city || o.city, msgId: x.id || '' }); }
    else { out.failed++; d2.failed.push({ p9: r.p9, id: o.id, at: nowISO(), error: clip(x.error, 200) }); await require('./store').writeJSON('locks/pay-winback/' + r.p9 + '.txt', null).catch(() => {}); }
    await writeJSON(KEY, d2, { quiet: true });
    out.items.push(Object.assign(item, x.sent ? { sent: true } : { error: clip(x.error, 120) }));
  }
  return out;
}
async function sendNow(o, vars, tpl) {
  const WA = require('./whatsapp'), WT = require('./wa-templates');
  const cfg = await WA.loadConfig(), ready = WA.readyNumbers(cfg);
  const city = ready.includes(o.city) ? o.city : ready[0];
  const n = city && cfg.numbers[city];
  if (!n || !WT.approvedFor(tpl.t, n.wabaId)) return { sent: false, error: 'șablonul nu e aprobat pentru ' + (city || 'niciun număr'), city };
  const x = await WA.sendWhatsApp({ phone: o.phone, template: (tpl.t.meta[n.wabaId] || {}).name || tpl.t.name, language: 'ro', params: tpl.t.map.map((k) => vars[k] || '-'), from: city, buttonUrl: { index: 0, text: wOf(o.id) } });
  if (x.sent) await logChat(o.phone, x.fromCity || city, o.name, textOf(vars) + '\n[Buton: Finalizează plata]', x.id, o.id);
  return { sent: !!x.sent, error: x.error, id: x.id, city: x.fromCity || city };
}

// ---- her saved checkout: the lines as she chose them (the shop's own quote at the moment she ordered), the gift, the sum
async function checkoutOf(o) {
  const lines = [];
  let hour = '';
  if ((o.kind === 'shop' || o.kind === 'hold') && o.ref) {
    const h = await require('./booking-holds').get(o.ref).catch(() => null);
    const items = h && h.cart && Array.isArray(h.cart.items) ? h.cart.items : null;
    if (items && items.length) {
      const q = await require('./shop').quote(o.city, items, Date.parse(o.createdAt) || Date.now()).catch(() => null);
      if (q && !q.error && Math.abs(Number(q.amount) - Number(o.amount)) < 0.01) q.lines.forEach((l) => lines.push({ name: l.name + (l.zone && !String(l.name).includes(l.zone) ? ' · ' + l.zone : ''), full: l.full, price: l.price }));
    }
    if (h && h.date && h.time && Date.parse(h.date + 'T' + h.time + ':00+02:00') > Date.now() + 2 * 3600e3) hour = h.date.split('-').reverse().join('.') + ', ora ' + h.time;
  }
  if (!lines.length) lines.push({ name: what(o), full: Number(o.full) > Number(o.amount) ? o.full : 0, price: o.amount });
  let giftFull = GIFT.full;
  try { const g = require('./shop').catalog(o.city || 'Timișoara').find((p) => p.id === GIFT.id); if (g && g.full) giftFull = g.full; } catch (e) { /* the list's price above */ }
  const full = lines.reduce((s, l) => s + (Number(l.full) || Number(l.price) || 0), 0) + giftFull;
  return { lines, gift: { name: GIFT.name, full: giftFull }, amount: Number(o.amount), saved: Math.max(0, full - Number(o.amount)), city: o.city || '', hour, kind: o.kind, giftOn: giftOn() };
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WA_NUM = { 'Timișoara': '40750452002', Arad: '40750277394' };
function pageHtml(c, w, name) {
  const row = (l) => '<li><span class="n">' + esc(l.name) + '</span><span class="p">' + (l.full && Number(l.full) > Number(l.price) ? '<s>' + lei(l.full) + '</s>' : '') + '<b>' + lei(l.price) + '</b></span></li>';
  const gift = c.giftOn ? '<li class="g"><span class="n"><i>🎁</i> ' + esc(c.gift.name) + '<small>cadoul tău</small></span><span class="p"><s>' + lei(c.gift.full) + '</s><b>Gratuit</b></span></li>' : '';
  const wa = WA_NUM[c.city] || WA_NUM['Timișoara'];
  return '<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex">' +
    '<title>Comanda ta | Centrul360</title><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"><style>' +
    ':root{--ink:#0b0b0d;--tx2:#4d545e;--tx3:#8a9099;--ln:#e6e3dc;--bg:#f6f4ef;--card:#fff;--teal:#0f9083;--teal2:#0b7a6f;--gold:#b8892f}' +
    '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}' +
    'main{max-width:460px;margin:0 auto;padding:28px 16px 40px}.logo{font:800 13px/1 Inter,sans-serif;letter-spacing:.22em;color:var(--ink);text-align:center;margin:0 0 26px}' +
    'h1{font-size:26px;line-height:1.15;letter-spacing:-.03em;font-weight:800;margin:0 0 8px}.lead{margin:0 0 20px;color:var(--tx2);font-size:15.5px}' +
    '.card{background:var(--card);border:1px solid var(--ln);border-radius:20px;padding:6px 18px 16px;box-shadow:0 10px 30px rgba(20,20,20,.05)}' +
    'ul{list-style:none;margin:0;padding:0}li{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--ln)}' +
    '.n{font-weight:600;font-size:15.5px;line-height:1.35}.n small{display:block;font-weight:500;font-size:13px;color:var(--gold);margin-top:2px}.n i{font-style:normal}' +
    '.p{text-align:right;white-space:nowrap;font-size:15.5px}.p s{display:block;color:var(--tx3);font-size:13px}.p b{font-weight:700}li.g{background:linear-gradient(90deg,rgba(184,137,47,.08),rgba(184,137,47,0));margin:0 -18px;padding:14px 18px}li.g .p b{color:var(--gold)}' +
    '.tot{display:flex;justify-content:space-between;align-items:baseline;padding:16px 0 4px}.tot span{font-weight:600}.tot b{font-size:26px;letter-spacing:-.02em}.sv{color:var(--teal2);font-size:14px;font-weight:600;text-align:right}' +
    '.meta{margin:14px 0 0;padding:12px 14px;border-radius:14px;background:#f3f1ec;color:var(--tx2);font-size:14px}' +
    'a.b{display:block;margin:22px 0 10px;padding:18px;border-radius:16px;background:var(--teal);color:#fff;text-align:center;text-decoration:none;font-weight:700;font-size:17px;box-shadow:0 12px 26px rgba(15,144,131,.28)}a.b:active{transform:scale(.99)}' +
    '.tr{display:flex;flex-direction:column;gap:6px;margin:6px 0 0;padding:0;color:var(--tx2);font-size:13.5px}.tr li{border:0;padding:0;display:block}.tr li:before{content:"✓ ";color:var(--teal);font-weight:700}' +
    '.help{margin:22px 0 0;text-align:center;font-size:14px;color:var(--tx2)}.help a{color:var(--teal2);font-weight:600}</style></head><body><main>' +
    '<p class="logo">CENTRUL360</p>' +
    '<h1>' + (name ? esc(first(name)) + ', comanda ta' : 'Comanda ta') + ' e salvată</h1>' +
    '<p class="lead">' + (c.giftOn ? 'Totul e cum ai lăsat-o, plus un masaj facial cadou. Plătești și e gata.' : 'Totul e cum ai lăsat-o. Plătești și e gata.') + '</p>' +
    '<div class="card"><ul>' + c.lines.map(row).join('') + gift + '</ul>' +
    '<div class="tot"><span>Total</span><b>' + lei(c.amount) + '</b></div>' + (c.saved > 0 ? '<div class="sv">Economisești ' + lei(c.saved) + '</div>' : '') + '</div>' +
    (c.city ? '<p class="meta">' + esc(c.city) + (c.hour ? ' · ' + esc(c.hour) + ' (o confirmăm după plată)' : ' · ora o alegi cu noi după plată, te sunăm') + '</p>' : '') +
    '<a class="b" href="/api/pay-go?w=' + esc(w) + '&amp;go=1">Plătesc ' + lei(c.amount) + '</a>' +
    '<ul class="tr"><li>Plată securizată prin myPOS, cu cardul</li><li>Prețul rămâne cel din coș</li>' + (c.giftOn ? '<li>Masajul facial cadou e valabil pentru plățile de azi</li>' : '') + '</ul>' +
    '<p class="help">O întrebare sau o problemă cu cardul? <a href="https://wa.me/' + wa + '">Scrie-ne pe WhatsApp</a></p>' +
    '</main></body></html>';
}

// ---- the tap on „Plătesc”: her order open again if the clock let it go, a myPOS page that works, then myPOS
async function go(id) {
  const P = require('./pay');
  let { data: o } = await P.readOrder(id);
  if (!o) return { error: 'not_found' };
  if (o.status === 'paid') return { error: 'already_paid' };
  if (o.status !== 'open') { const r = await P.reopen(o.id, 'winback'); if (!r || r.status !== 'open') return { error: 'not_open' }; o = r; }
  if (o.request && o.request.code) {
    const st = await P.requestState(o.id).catch(() => null);
    if (st && st.status === 'Paid') { await P.check(o.id, o.key).catch(() => null); return { error: 'already_paid' }; }
    if (st && ['Expired', 'Cancelled'].includes(st.status)) { const d = await P.dropRequest(o.id); if (d) o = d; }
  }
  await P.touch(o.id).catch(() => {});
  return P.link(o.id, o.key);
}

// ---- the gift, on her payment (api/_lib/pay.js markPaid): any order of a phone that got the message, paid until the gift's
// end. Once per order: the order carries it, her booking's note says it, the desk hears it.
async function onPaid(orderId) {
  const P = require('./pay');
  const { data: o } = await P.readOrder(orderId);
  if (!o || o.status !== 'paid' || o.test || o.gift) return null;
  const doc = await load();
  const k = p9(o.phone);
  if (!k || !doc.sent.some((x) => x.p9 === k)) return null;
  if (!giftOn(Date.parse(o.paidAt) || Date.now())) return null;
  const text = 'CADOU: ' + GIFT.name + ' (mesajul de pe WhatsApp, 27.11)';
  const saved = await P.setGift(o.id, { name: GIFT.name, why: 'winback-27.11', at: nowISO() });
  if (!saved) return null;
  // her booking (the held hour placed by the payment, or the booking she paid)
  let apptId = '';
  if ((o.kind === 'shop' || o.kind === 'hold') && o.ref) { const h = await require('./booking-holds').get(o.ref).catch(() => null); apptId = (h && h.bookingId) || ''; }
  else if (o.kind === 'booking') apptId = o.ref;
  if (apptId) {
    const store = require('./store');
    for (let round = 0; round < 4; round++) {
      const { data: appts, etag } = await store.readJSONTagged('data/appointments.json', []);
      const a = appts.find((x) => x && x.id === apptId);
      if (!a || String(a.note || '').includes('CADOU: ' + GIFT.name)) break;
      a.note = clip([a.note, text].filter(Boolean).join(' · '), 600);
      if (await store.writeJSONIf('data/appointments.json', appts, etag)) break;
    }
  }
  const d2 = await load(); d2.gifts.push({ p9: k, id: o.id, at: nowISO() }); await writeJSON(KEY, d2, { quiet: true });
  await P.ringDesk(o, '🎁 CADOU MASAJ FACIAL', (o.name || 'Clienta') + ' a plătit ' + what(o) + ' după mesajul de azi: îi dăm cadou un masaj facial. ' + (apptId ? 'E trecut în nota programării ei.' : 'Trece-l la programarea ei.'), { tone: 'good', go: apptId ? 'programari' : 'incasari' });
  return { gift: true, appt: !!apptId };
}

async function status() {
  const d = await load();
  const t = await template().catch((e) => ({ state: 'eroare: ' + e.message }));
  return { template: t.state, accounts: t.accounts, sent: d.sent.length, failed: d.failed.length, gifts: d.gifts.length, lastSent: (d.sent[d.sent.length - 1] || {}).at || '',
    errors: d.failed.slice(-5).map((x) => x.error), giftUntil: GIFT_UNTIL };
}

module.exports = { KEY, SINCE, GIFT_UNTIL, TPL, token, wOf, fromW, recipients, template, send, checkoutOf, pageHtml, go, onPaid, status, quiet };
