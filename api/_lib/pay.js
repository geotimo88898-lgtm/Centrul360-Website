// The site's online payments (the owner, 23.11: „toate prețurile din site, cu un bonus la plata cu cardul, fără redirecturi”).
// One shared checkout for everything sold on the site: a booking (an offer or a treatment of the price list, booked and paid),
// an offer or a treatment paid now and booked later, and the Card de Sărbători (its own module plugs in, below).
//
// The price is ALWAYS the server's: the offers from Admin → Oferte, the treatments from the price list (price-list.gen.json,
// made from the Prețuri page), a booking from what api/booking.js saved, a card from the card module. The browser only says
// what (kind + ref). Paid online: BONUS_PCT off (offers and treatments; the card keeps its own bonuses).
//
// An order is paid only on myPOS's own signed word: its notification (api/pay-notify.js) or its answer to „what about this
// order” (IPCGetPaymentStatus, signed too), checked with myPOS's certificate, for this order id, this sum, in lei. Never by
// matching sums. Each order is paid once (the second notification of the same payment changes nothing) and its handler runs
// once (a failed handler is tried again on the clock, so handlers must be safe to call twice).
//
//   data/pay/<orderId>.json  { id, key, kind, ref, amount, full, bonusPct, currency, title, city, name, phone, status:
//                              'open' | 'paid' | 'failed' | 'mismatch' | 'expired', createdAt, paidAt, mypos: { ref, method,
//                              src: 'notify' | 'status', at }, handled, handledAt, result, sandbox, test, src (where she came from, booking.js sourceOf) }
//   data/pay-open.json       [{ id, at }]  the orders still waiting (the clock asks myPOS about them)
//   data/pay-index.json      [{ id, at, kind }]  every order (the last 2000), for the reports (api/lead-health.js ?sources=1)
const crypto = require('crypto');
const store = require('./store');
const { readJSON, writeJSON } = store;
const IPC = require('./mypos-ipc');
const RQ = require('./mypos-requests');

// Which myPOS way pays: the online store's embedded form (mypos-ipc.js) when its keys are saved, else the Partners app's
// payment requests (mypos-requests.js) when those are; none: the online payment is off.
// work after the answer (the card's contact on its list, a trace): the Worker keeps it running (waitUntil), never awaited
function later(p) {
  const q = Promise.resolve(p).catch((e) => console.error('pay later:', e && e.message));
  try { const c = globalThis[Symbol.for('@vercel/request-context')]; const ctx = c && typeof c.get === 'function' ? c.get() : null; if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(q); } catch (e) { /* runs on its own */ }
  return q;
}
// the way in use, kept 20 s per instance (two reads of the store each time made every step a second slower, 23.11)
let PV = { at: 0, v: null };
async function provider() {
  if (PV.at && Date.now() - PV.at < 20e3) return PV.v;
  const v = await provider1();
  PV = { at: Date.now(), v };
  return v;
}
async function provider1() {
  const [c, r] = await Promise.all([IPC.load(S), RQ.active(S)]);
  if (IPC.ready(c) && !c.error) return { name: 'embedded', c, sandbox: !!c.sandbox, live: !!c.live && !c.sandbox };
  if (r && !r.error) return { name: 'requests', c: r, sandbox: !!r.demo, live: !!r.live && !r.demo };
  return null;
}
// a refusal of the Partners keys stops that way at once (myPOS locks the clinic's keys after three refused sessions)
async function rqFail(e) {
  if (e && (e.code === 'req_merchant' || e.code === 'req_partner')) { PV = { at: 0, v: null }; await RQ.note(S, { error: e.code, errorAt: nowISO() }).catch(() => {}); }
}
const TEST = 'data/pay-test.json';
const PAID = 'data/pay-paid.json'; // [{ id, amount, at, refs }]: the checkout's recent payments, for the old sum matchers to leave alone // { orderRef, at, by }: the 1 leu test the admin started

const BONUS_PCT = 10; // percent off when paid online by card, where nothing else is set (Admin → Oferte). One number.
const bonusPrice = (full, pct) => Math.floor((Number(full) || 0) * (100 - (pct == null ? BONUS_PCT : pct)) / 100); // whole lei
// The online bonus of what is sold (23.11, the owner: „la unele 10%, la altele tratamente gratis”): an offer's own (Admin →
// Oferte: payBonus 'pct' with payPct, or 'gift' with payGift), the price list's default for the treatments (data/pay-settings.json
// { treatment: { type, pct, gift } }), else BONUS_PCT. → { type: 'pct', pct, line } | { type: 'gift', gift, line }
const SETTINGS = 'data/pay-settings.json';
function bonusLine(b) { return b.type === 'gift' ? '+ ' + b.gift + ' cadou la plata online' : '-' + b.pct + '% la plata online'; }
function bonusOfRaw(type, pct, gift) {
  const b = type === 'gift' && String(gift || '').trim() ? { type: 'gift', gift: String(gift).trim().slice(0, 80) } : { type: 'pct', pct: Number(pct) > 0 && Number(pct) <= 50 ? Math.round(Number(pct)) : BONUS_PCT };
  b.line = bonusLine(b);
  return b;
}
const bonusOfOffer = (o) => bonusOfRaw(o && o.payBonus, o && o.payPct, o && o.payGift);
async function bonusOfTreatment() { const t = ((await readJSON(SETTINGS, null)) || {}).treatment || {}; return bonusOfRaw(t.type, t.pct, t.gift); }
// a service of the booking (an offer by its key, a treatment of the price list by its id) → its bonus and what she pays online
async function bonusFor(svc, offers) {
  if (!svc || svc.id === 'consult' || !(Number(svc.price) > 0)) return null;
  let b;
  if (svc.id === 'custom') b = await bonusOfTreatment();
  else { const list = offers || await require('./offers').loadOffers(readJSON, null); b = bonusOfOffer(list.find((x) => x && x.key === svc.id)); }
  return Object.assign(b, { amount: b.type === 'pct' ? bonusPrice(svc.price, b.pct) : Number(svc.price) });
}
async function saveSettings(input, by) {
  const t = input && input.treatment || {};
  const b = bonusOfRaw(t.type, t.pct, t.gift);
  const doc = { treatment: { type: b.type, pct: b.pct || 0, gift: b.gift || '' }, savedAt: nowISO(), by: by || '' };
  await writeJSON(SETTINGS, doc);
  return { ok: true, treatment: Object.assign(doc.treatment, { line: b.line }) };
}
const OPEN = 'data/pay-open.json';
const docOf = (id) => 'data/pay/' + id + '.json';
const INDEX = 'data/pay-index.json'; // [{ id, at, kind }]: every order of the site, newest last (the reports read the orders from it)
const sourceOf = (raw, cookie, ua) => require('./booking').sourceOf(raw, cookie, ua);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const nowISO = () => new Date().toISOString();
const roDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(ms));
const CITIES = ['Timișoara', 'Arad'];
const CITY_KEY = { 'Timișoara': 'timisoara', Arad: 'arad' };
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cityOf = (v) => CITIES.find((c) => fold(c) === fold(v)) || '';
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const validId = (id) => /^C360-[a-z0-9]{6,30}$/.test(String(id || ''));
// myPOS takes an order id once: the card form pays the order under its own id, Apple Pay / Google Pay under id + '-w' (their
// session reserves the id it is made with). Either way it is the same order.
const WALLET = '-w';
const baseOf = (id) => String(id || '').replace(/-w$/, '');
const S = { readJSON, writeJSON };
RQ.useStore(S); // myPOS's token and session kept in the store with their expiry (every instance)

// ------------------------------------------------------------------ the price list (treatments)
let PL = null;
function priceList() { if (!PL) PL = (require('./price-list.gen.json').items || []); return PL; }
const treatment = (id, city) => { const t = priceList().find((x) => x.id === id); return t && (!city || t.cities.includes(city)) ? t : null; };

// ------------------------------------------------------------------ the kinds
// quote({ ref, input, req }) → { amount, full, title, city, name, phone, bonusPct } | { error }
// paid(order) → anything (kept on the order as result); called once per paid order, again only if it threw
const KINDS = {
  booking: {
    async quote({ ref }) {
      const a = (await readJSON('data/appointments.json', [])).find((x) => x && x.id === ref);
      if (!a || a.createdBy !== 'site') return { error: 'not_found' };
      if (a.pay === 'online-paid' || a.paidOnline) return { error: 'already_paid' };
      if (a.pay !== 'online-pending' || a.payVia !== 'checkout' || !(Number(a.payAmount) > 0)) return { error: 'not_payable' };
      if (['anulata', 'concediu', 'finalizata'].includes(a.status)) return { error: 'cancelled' };
      return { amount: Number(a.payAmount), full: Number(a.amount) || 0, bonusPct: Number(a.payBonus) || 0, title: a.treatment || 'Programare', city: a.location || '', name: a.clientName || '', phone: a.clientPhone || '' };
    },
    async paid(o) {
      const BP = require('./booking-pay');
      const x = await BP.markPaid(o.ref, { amount: o.amount, ref: o.mypos.ref || o.id, at: o.mypos.at || o.paidAt, src: 'mypos-checkout', orderId: o.id }, 'myPOS');
      if (x) return { appt: o.ref, sale: x.sale && x.sale.id, msg: x.msg && (x.msg.sent || x.msg.dup) ? 'sent' : 'no' };
      // the booking didn't wait any more (cancelled meanwhile, or paid by another order): the money is in, the desk sees it
      const sale = await recordSale(o, 'Plată online, programarea nu mai aștepta plata');
      await ring(o, 'PLATĂ ONLINE DE VERIFICAT 💳', 'Programarea nu mai aștepta plata (anulată sau plătită deja). Vezi în myPOS și sun-o.');
      return { appt: o.ref, sale: sale.id, orphan: true };
    },
  },
  // the slip's online payment (23.11): the hour is held (booking-holds.js), she gives her name and phone on the payment
  // screen; paid → the booking is made from the hold, then paid like any booking (Încasări, WhatsApp, Purchase)
  hold: {
    async quote({ ref }) {
      const H = require('./booking-holds');
      const h = await H.get(ref);
      if (!h) return { error: 'not_found' };
      if (h.bookingId) return { error: 'already_paid' };
      if (!H.live(h)) return { error: 'expired' };
      const full = Number(h.svc && h.svc.price) || 0;
      if (!(full > 0)) return { error: 'not_payable' };
      const b = await bonusFor(h.svc);
      return { amount: b.amount, full, bonus: b, title: h.svc.title, city: h.city, name: (h.contact || {}).name || '', phone: (h.contact || {}).phone || '', src: h.src, cookie: h.cookie, app: h.app };
    },
    async paid(o) {
      const H = require('./booking-holds');
      const h = await H.get(o.ref);
      const c = (h && h.contact) || { name: o.name, phone: o.phone };
      if (!h || !c.phone) {
        const sale = await recordSale(o, 'fără programare');
        await ring(o, 'PLATĂ ONLINE DE VERIFICAT 💳', 'Plătit pe site, dar fără ' + (h ? 'telefon' : 'ora ținută') + '. Vezi în myPOS cine a plătit (comanda ' + o.id + ') și sun-o.');
        return { sale: sale.id, orphan: true };
      }
      let apptId = h.bookingId || ((await readJSON('data/appointments.json', [])).find((a) => a && a.holdId === h.id) || {}).id;
      if (!apptId) {
        const B = require('./booking');
        const r = await require('../booking').place({ cfg: await B.settings({ team: true }), city: h.city, svc: h.svc, date: h.date, time: h.time, name: c.name || 'Clientă site', phone: c.phone,
          page: h.page, src: h.src, cookie: h.cookie, ua: h.app, track: h.track, pay: 'online-pending', payAmount: o.amount, viaCheckout: true, paid: true, holdId: h.id, bonus: o.bonus });
        if (!r || !r.entry) throw new Error('hold_booking_failed');
        apptId = r.entry.id;
        if (r.entry.overbooked) await ring(o, 'PLĂTITĂ ONLINE, ORA S-A OCUPAT ⚠️', (c.name || '') + ' a plătit ' + h.date + ' ' + h.time + ', dar ora s-a ocupat între timp. Sun-o să mutați ora.');
      }
      await H.patch(h.id, (x) => { if (x.bookingId === apptId) return false; x.bookingId = apptId; });
      const BP = require('./booking-pay');
      const x = await BP.markPaid(apptId, { amount: o.amount, ref: o.mypos.ref || o.id, at: o.mypos.at || o.paidAt, src: 'mypos-checkout', orderId: o.id }, 'myPOS');
      return { appt: apptId, sale: x && x.sale && x.sale.id, msg: x && x.msg && (x.msg.sent || x.msg.dup) ? 'sent' : 'no' };
    },
  },
  offer: {
    async quote({ ref, input }) {
      const city = cityOf(input.city);
      if (!city) return { error: 'missing_city' };
      const offers = await require('./offers').loadOffers(readJSON, null);
      const o = offers.find((x) => x && x.key === ref && x.active && x.site !== false);
      if (!o || !(Number(o.priceNew) > 0)) return { error: 'not_found' };
      if (Array.isArray(o.locations) && o.locations.length && !o.locations.includes(CITY_KEY[city])) return { error: 'not_in_city' };
      const full = Number(o.priceNew), b = bonusOfOffer(o);
      return { amount: b.type === 'pct' ? bonusPrice(full, b.pct) : full, full, bonus: b, title: String(o.title || '').replace(/\s+/g, ' ').slice(0, 120), city };
    },
    async paid(o) { return prepaid(o); },
  },
  treatment: {
    async quote({ ref, input }) {
      const city = cityOf(input.city);
      if (!city) return { error: 'missing_city' };
      const t = treatment(ref, city);
      if (!t) return { error: treatment(ref) ? 'not_in_city' : 'not_found' };
      const b = await bonusOfTreatment();
      return { amount: b.type === 'pct' ? bonusPrice(t.price, b.pct) : t.price, full: t.price, bonus: b, title: t.title, city };
    },
    async paid(o) { return prepaid(o); },
  },
  // the Card de Sărbători: its module (api/_lib/card-sarbatori.js, owned by the card's work) exports
  //   payQuote({ ref, input }) → { amount, title, city?, name?, phone? } | null     its own price and bonuses
  //   payPaid({ orderId, ref, amount, currency, myposRef, method, at, sandbox })     once per order, safe to call twice
  card: {
    async quote({ ref, input }) {
      const C = cardModule();
      if (!C || typeof C.payQuote !== 'function') return { error: 'card_not_ready' };
      const q = await C.payQuote({ ref, input: input || {} });
      if (!q || !(Number(q.amount) > 0)) return { error: (q && q.error) || 'not_found' };
      return { amount: r2(q.amount), full: r2(q.full || q.amount), bonusPct: 0, title: clip(q.title || 'Card de Sărbători', 120), city: cityOf(q.city), name: clip(q.name, 100), phone: clip(q.phone, 30), bonusText: clip(q.bonusText, 80) };
    },
    async paid(o) {
      const C = cardModule();
      if (!C || typeof C.payPaid !== 'function') throw new Error('card_hook_missing');
      return (await C.payPaid({ orderId: o.id, ref: o.ref, amount: o.amount, currency: o.currency, myposRef: o.mypos.ref, method: o.mypos.method, at: o.mypos.at || o.paidAt, sandbox: !!o.sandbox, name: o.name || '', phone: o.phone || '' })) || { ok: true };
    },
  },
  // Integrări → myPOS → „Test 1 leu”: the first real payment before the site may use it
  test: {
    async quote({ ref }) {
      const t = (await readJSON(TEST, null)) || {};
      if (!t.orderRef || t.orderRef !== ref) return { error: 'not_found' };
      return { amount: 1, full: 1, bonusPct: 0, title: 'Test plată online Centrul360', city: '' };
    },
    async paid(o) {
      await (o.provider === 'requests' ? RQ : IPC).note(S, { testPassedAt: nowISO(), testOrder: o.id });
      await ring(o, 'TEST PLATĂ ONLINE REUȘIT 💳', 'Plata de 1 leu a trecut. Poți porni plata online pe site din Integrări → myPOS.', true);
      return { ok: true };
    },
  },
};
let CARD;
function cardModule() {
  if (CARD !== undefined) return CARD;
  try { CARD = require('./card-sarbatori'); } catch (e) { CARD = null; }
  return CARD;
}
// another module may add a kind the same way ({ quote, paid })
function registerKind(name, def) { if (/^[a-z]{3,20}$/.test(name) && def && def.quote && def.paid) KINDS[name] = def; }

// ------------------------------------------------------------------ what a paid offer / treatment leaves behind
async function recordSale(o, note) {
  const sales = await readJSON('data/sales.json', []);
  const had = sales.find((s) => s && s.payOrderId === o.id);
  if (had) return had;
  const entry = {
    id: crypto.randomUUID(), source: 'incasare', onlinePay: true, payOrderId: o.id, label: 'Plată online pe site', online: true,
    employeeId: 'site-pay', performedBy: '', clientId: '', client: o.name || '', clientPhone: o.phone || '',
    date: roDay(Date.parse(o.paidAt) || Date.now()), location: o.city || '', categories: [], category: '',
    treatment: o.title + (o.bonus && o.bonus.type === 'gift' ? ' · plătit online · cadou: ' + o.bonus.gift : o.bonusPct ? ' · plătit online, cu ' + o.bonusPct + '% reducere' : ' · plătit online'), amount: r2(o.amount), bookedAmount: 0, upsell: 0,
    ...(o.bonus && o.bonus.type === 'gift' ? { gift: o.bonus.gift } : {}),
    method: 'card', split: null, status: 'recorded', commission: 0, note: 'Online (myPOS) · comanda ' + o.id + (note ? ' · ' + note : ''),
    createdAt: nowISO(), decidedAt: null,
  };
  sales.push(entry);
  await writeJSON('data/sales.json', sales);
  return entry;
}
async function ring(o, title, text, ownerOnly) {
  try {
    const N = require('./notify');
    const ids = ownerOnly ? await N.adminIds(S) : await N.deskIds(S, o.city || '');
    await N.notifyMany(S, ids, { kind: 'money', tone: 'good', go: 'incasari', tag: 'pay-' + o.id, title: title + ' - ' + Math.round(o.amount) + ' lei', text: clip(text, 300) });
  } catch (e) { console.error('pay ring:', e.message); }
}
// an offer or a treatment paid before it is booked: Încasări, the desk calls her to pick the hour, Meta hears the Purchase
async function prepaid(o) {
  const sale = await recordSale(o, o.phone ? '' : 'fără telefon');
  await ring(o, 'PLĂTIT ONLINE ' + ({ 'Timișoara': 'TM', Arad: 'AR' }[o.city] || '') + ' 💳', (o.name || '') + ' · ' + o.title + ' · sun-o să-și aleagă ora');
  try {
    const capi = require('./meta-capi');
    await capi.soon(() => capi.laterEvent({ name: 'Purchase', eventId: 'purchase.pay.' + o.id, phone: o.phone, url: (o.track || {}).url, custom: { value: r2(o.amount) } }, o.track || {}));
  } catch (e) { console.error('pay capi:', e.message); }
  return { sale: sale.id };
}

// ------------------------------------------------------------------ orders
async function readOrder(id) { return validId(id) ? store.readJSONTagged(docOf(id), null) : { data: null, etag: '' }; }
async function listEdit(path, fn, max) {
  for (let round = 0; round < 5; round++) {
    const { data, etag } = await store.readJSONTagged(path, []);
    const list = fn(Array.isArray(data) ? data : []);
    if (!list) return;
    if (await store.writeJSONIf(path, list.slice(-(max || 400)), etag, { quiet: true })) return;
  }
}
const openList = (fn) => listEdit(OPEN, fn);
const RETRY = 'data/pay-retry.json';
// change an order only over the version read; fn returns false to leave it
// (pre: the order as just read, { data, etag }: its first round needs no read; the order's file is ours alone, no live sync)
async function update(id, fn, pre) {
  for (let round = 0; round < 6; round++) {
    const { data, etag } = round === 0 && pre && pre.data && pre.etag ? { data: JSON.parse(JSON.stringify(pre.data)), etag: pre.etag } : await readOrder(id);
    if (!data) return null;
    if (fn(data) === false) return data;
    if (await store.writeJSONIf(docOf(id), data, etag, { quiet: true })) return data;
  }
  throw new Error('pay_order_busy');
}

// a new order: the real price from its kind; the params the embedded form and the wallets need
async function createOrder({ kind, ref, input, host, track }) {
  const K = KINDS[kind];
  if (!K) return { error: 'bad_kind' };
  ref = clip(ref, 120);
  if (!ref) return { error: 'missing_ref' };
  const [pv, q] = await Promise.all([provider(), K.quote({ ref, input: input || {} })]);
  if (!pv) return { error: 'off' };
  const c = pv.c;
  if (!q || q.error) return { error: (q && q.error) || 'not_found' };
  const amount = r2(q.amount);
  if (!(amount >= 1) || amount > 50000) return { error: 'bad_amount' };
  const name = clip(q.name || (input && input.name), 100).replace(/[<>]/g, ''), phone = clip(q.phone || (input && input.phone), 30);
  const id = 'C360-' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  const o = {
    id, key: crypto.randomBytes(16).toString('hex'), kind, ref, amount, full: r2(q.full || amount), bonusPct: q.bonus && q.bonus.type === 'pct' ? q.bonus.pct : q.bonusPct || 0,
    bonus: q.bonus ? { type: q.bonus.type, pct: q.bonus.pct || 0, gift: q.bonus.gift || '', line: q.bonus.line } : null, currency: 'RON',
    bonusText: clip(q.bonusText || (q.bonus && q.bonus.line) || '', 80),
    title: clip(q.title, 120), city: q.city || '', name, phone, status: 'open',
    ...(input && input.notice && name && phone ? { consent: true, notice: { kind: clip(input.notice, 40), text: 'Îți trimitem confirmarea pe WhatsApp.', at: nowISO() } } : {}), createdAt: nowISO(), paidAt: '', mypos: {}, handled: false,
    sandbox: pv.sandbox, test: kind === 'test', track: track || null, provider: pv.name,
    // where she came from (the page's first touch of the visit, c360-pay.js): saved for the reports, never shown
    ...(kind === 'test' ? {} : { src: sourceOf(input && input.src && typeof input.src === 'object' ? input.src : q.src, (input && input.cookie) || q.cookie, (input && input.ua) || q.app) }),
  };
  await Promise.all([
    writeJSON(docOf(id), o, { quiet: true }),
    openList((l) => l.concat(Object.assign({ id, at: o.createdAt, amount }, kind === 'card' ? { ref } : {}))),
    kind === 'test' ? null : listEdit(INDEX, (l) => l.concat({ id, at: o.createdAt, kind }), 2000),
    kind === 'booking' ? noteBooking(ref, id) : null,
    kind === 'hold' ? require('./booking-holds').patch(ref, (h) => { h.orderIds = (h.orderIds || []).concat(id).slice(-10); }) : null,
  ]);
  // the Partners way: the payment request is made once her name is known (action 'link'); its page opens in a new tab
  if (pv.name === 'requests') return { ok: true, provider: 'requests', orderId: id, key: o.key, amount, full: o.full, bonusPct: o.bonusPct, bonus: o.bonus, bonusText: o.bonusText, title: o.title, sandbox: pv.sandbox };
  // the wallets' session (Apple Pay / Google Pay): signed, the sum fixed here. Without it the card form still works.
  let session = { token: '', expires: '' };
  try { session = await IPC.sessionCreate(c, { orderId: id + WALLET, amount, title: o.title }); } catch (e) { console.error('pay session:', e.code, e.message); }
  return {
    ok: true, provider: 'embedded', orderId: id, key: o.key, amount, full: o.full, bonusPct: o.bonusPct, bonus: o.bonus, bonusText: o.bonusText, title: o.title, sandbox: !!c.sandbox,
    sessionToken: session.token,
    params: { sid: c.sid, ipcLanguage: 'ro', walletNumber: c.walletNumber, amount, currency: 'RON', orderID: id, urlNotify: process.env.PAY_NOTIFY_URL || 'https://' + (host || 'www.centrul360.com') + '/api/pay-notify',
      keyIndex: Number(c.keyIndex) || 1, cartItems: [{ article: o.title, quantity: 1, price: amount, currency: 'RON' }] },
  };
}
// the booking remembers its orders (the Calendar can show them; a second paid order is a double payment)
async function noteBooking(apptId, orderId) {
  for (let round = 0; round < 4; round++) {
    const { data: appts, etag } = await store.readJSONTagged('data/appointments.json', []);
    const a = appts.find((x) => x && x.id === apptId);
    if (!a) return;
    a.payOrders = (a.payOrders || []).concat(orderId).slice(-10);
    if (await store.writeJSONIf('data/appointments.json', appts, etag)) return;
  }
}

// myPOS's signed word that an order is paid. info: { amount, currency, ref, method, at }, src: 'notify' | 'status'.
// → { ok, dup } | { unknown } | { mismatch } | { double }
async function markPaid(orderId, info, src) {
  const first = (await readOrder(orderId)).data;
  if (!first) return { unknown: true };
  const same = Math.abs(Number(info.amount) - Number(first.amount)) < 0.005 && String(info.currency || 'RON').toUpperCase() === 'RON';
  if (!same) {
    // a sum that isn't the order's (the embedded form's sum was changed in the browser): never paid; the desk looks
    if (first.status === 'open') {
      await update(orderId, (o) => { if (o.status !== 'open') return false; Object.assign(o, { status: 'mismatch', mypos: { ref: clip(info.ref, 80), method: clip(info.method, 20), src, at: clip(info.at, 40), amount: Number(info.amount) || 0, currency: clip(info.currency, 3) } }); });
      await openList((l) => l.filter((x) => x.id !== orderId));
      await ring(first, 'PLATĂ ONLINE CU ALTĂ SUMĂ ⚠️', 'myPOS a încasat ' + info.amount + ' ' + (info.currency || '') + ' în loc de ' + first.amount + ' lei (comanda ' + orderId + '). Nu e trecută ca plătită; vezi în myPOS.', true);
    }
    return { mismatch: true };
  }
  // a booking already paid by another order: this second payment is a double (the notify answers so that myPOS reverses it)
  if (first.status === 'open' && (first.kind === 'booking' || first.kind === 'hold')) {
    let apptRef = first.ref;
    if (first.kind === 'hold') { const h = await require('./booking-holds').get(first.ref); apptRef = h && h.bookingId; }
    const a = apptRef && (await readJSON('data/appointments.json', [])).find((x) => x && x.id === apptRef);
    if (a && a.paidOnline && a.paidOnline.orderId && a.paidOnline.orderId !== orderId) {
      await update(orderId, (o) => { if (o.status !== 'open') return false; Object.assign(o, { status: 'failed', failWhy: 'double', mypos: { ref: clip(info.ref, 80), src, at: clip(info.at, 40) } }); });
      await openList((l) => l.filter((x) => x.id !== orderId));
      return { double: true };
    }
  }
  let mine = false;
  const o = await update(orderId, (x) => {
    if (x.status === 'paid') return false;
    if (!['open', 'expired', 'failed'].includes(x.status) || x.failWhy === 'double') return false;
    Object.assign(x, { status: 'paid', paidAt: nowISO(), mypos: { ref: clip(info.ref, 80), payRef: clip(info.payRef, 80), method: clip(info.method, 20), src, at: clip(info.at, 40) } });
    mine = true;
  });
  if (!o || o.status !== 'paid') return { ok: false, status: o && o.status };
  if (mine) {
    await openList((l) => l.filter((x) => x.id !== orderId));
    await listEdit(PAID, (l) => l.concat({ id: orderId, amount: o.amount, at: o.paidAt, refs: [o.mypos.ref, o.mypos.payRef, o.request && o.request.code].filter(Boolean) }).slice(-300));
  }
  if (o.handled) return { ok: true, dup: !mine };
  // the handler, once: the one who marked it paid runs it; a later call only when it failed before (handled stays false)
  const lock = mine ? await store.createOnce('data/pay/run-' + orderId + '-1', nowISO()) : false;
  if (!lock && !(await retryLock(o))) return { ok: true, dup: true };
  await runHandler(orderId);
  return { ok: true, dup: !mine };
}
async function retryLock(o) {
  if (o.handled || !o.paidAt || Date.now() - Date.parse(o.paidAt) < 90e3) return false; // the first run may still be on its way
  const n = (Number(o.tries) || 1) + 1;
  if (n > 8) return false;
  return store.createOnce('data/pay/run-' + o.id + '-' + n, nowISO());
}
async function runHandler(orderId) {
  const o = (await readOrder(orderId)).data;
  if (!o || o.status !== 'paid' || o.handled) return;
  let result, err = '';
  try { result = await KINDS[o.kind].paid(o); } catch (e) { err = String(e.message || e).slice(0, 200); console.error('pay handler', o.kind, orderId, err); }
  await update(orderId, (x) => {
    x.tries = (Number(x.tries) || 1) + (err ? 1 : 0);
    if (err) { x.handlerError = err; return; }
    Object.assign(x, { handled: true, handledAt: nowISO(), result: result && typeof result === 'object' ? result : { ok: true } });
    delete x.handlerError;
  });
  await listEdit(RETRY, (l) => (err ? (l.includes(orderId) ? null : l.concat(orderId)) : l.includes(orderId) ? l.filter((x) => x !== orderId) : null));
}

// she says the payment went through (the form's onSuccess): myPOS is asked (signed answer), never believed on her word
async function check(orderId, key) {
  const { data: o } = await readOrder(orderId);
  if (!o || !key || !safeEq(o.key, key)) return { error: 'not_found' };
  if (o.status === 'paid') return { paid: true, status: 'paid', handled: !!o.handled };
  if (o.status !== 'open') return { paid: false, status: o.status };
  // a card sent to its own PayLink: paid when the card's record says so (its payment is matched there)
  if (o.kind === 'card' && o.fallback) { const C = cardModule(); const r = C && C.KEY && C.byId ? C.byId(await readJSON(C.KEY, []), String(o.ref || '')) : null; if (r && r.status === 'platit') return { paid: true, status: 'paid', via: 'paylink' }; }
  let st = null;
  try {
    if (o.provider === 'requests') { const r = await rqActive(); if (!r) return { paid: false, status: 'open' }; st = await askRequest(r, await recoverRequest(r, o)); }
    else { const c = await IPC.load(S); if (!IPC.ready(c)) return { paid: false, status: 'open' }; st = await askBoth(c, o); }
  } catch (e) { await rqFail(e); return { paid: false, status: 'open', error: e.code || 'mypos_failed' }; }
  if (st && st.status === 1 && fits(o, st)) { const r = await markPaid(orderId, st, 'status'); return { paid: !!r.ok, status: r.ok ? 'paid' : r.double ? 'double' : 'open' }; }
  if (st && (st.status === 3 || st.status === 4) && baseOf(st.orderId) === o.id) return { paid: false, status: 'failed' };
  return { paid: false, status: 'open' };
}
// myPOS's answer about an order is about this order, for its sum, in lei (else it is not taken: a made-up answer of the test
// environment, or a sum changed in the browser, which its notification reports and reverses)
const fits = (o, st) => baseOf(st.orderId) === o.id && Math.abs(Number(st.amount) - Number(o.amount)) < 0.005 && String(st.currency).toUpperCase() === 'RON';
// the card's id first, then the wallets' one: the answer that is a payment of this order, else the card's answer
async function askBoth(c, o) {
  const a = await IPC.paymentStatus(c, o.id);
  if (a && a.status === 1 && fits(o, a)) return a;
  const w = await IPC.paymentStatus(c, o.id + WALLET).catch(() => null);
  return w && w.status === 1 && fits(o, w) ? w : a;
}
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

// the payment screen's name and phone (and the WhatsApp consent), saved on the order (and its held hour) before she pays
const normalizePhone = (p) => require('./clients').normalizePhone(p);
async function contact(orderId, key, input) {
  const pre = await readOrder(orderId), o = pre.data;
  if (!o || !key || !safeEq(o.key, key)) return { error: 'not_found' };
  if (o.status !== 'open') return { error: 'not_open' };
  const name = clip(String(input.name || '').replace(/[<>]/g, ''), 100);
  let phone = normalizePhone(clip(input.phone, 30));
  if (/^7\d{8}$/.test(phone)) phone = '0' + phone;
  if (name.length < 2) return { error: 'missing_name' };
  if (!/^07\d{8}$/.test(phone) && !/^[1-9]\d{10,14}$/.test(phone)) return { error: 'bad_phone' };
  // the WhatsApp confirmation and reminders serve the booking or purchase itself (transactional, 23.11): she is told so on the
  // payment screen („Îți trimitem confirmarea pe WhatsApp.”); the notice she saw is kept on the order
  if (!(input.consent === true || input.consent === 'true' || input.notice)) return { error: 'missing_consent' };
  const notice = { kind: clip(input.notice || 'consent', 40), text: input.notice ? 'Îți trimitem confirmarea pe WhatsApp.' : 'acord bifat', at: nowISO() };
  // already booked that day (the same rule as the form)
  let holdPatch = null;
  if (o.kind === 'hold') {
    const H = require('./booking-holds');
    const [h, appts] = await Promise.all([H.get(o.ref), readJSON('data/appointments.json', [])]);
    if (h) {
      const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
      const same = appts.find((a) => a && d9(a.clientPhone) === d9(phone) && a.date === h.date && !['anulata', 'concediu'].includes(a.status));
      if (same) return { error: 'has_booking', at: { date: same.date, time: same.time, location: same.location } };
      holdPatch = H.patch(h.id, (x) => { x.contact = { name, phone, consent: true, notice, at: nowISO() }; });
    }
  }
  // (the same name and phone already on the order, from its making: nothing to write). A card's order hands them to the
  // card once per phone (cardContact): two calls at once (the screen and the tap's tab) never make two leads
  const card = o.kind === 'card';
  const same = o.name === name && o.phone === phone && o.consent === true && (!card || o.cardContact === phone);
  let fire = false;
  const [saved] = await Promise.all([same ? o : update(orderId, (x) => {
    fire = false;
    if (x.status !== 'open') return false;
    if (card && x.cardContact !== phone) { x.cardContact = phone; fire = true; } else if (x.name === name && x.phone === phone && x.consent === true) return false;
    Object.assign(x, { name, phone, consent: true, notice, activityAt: nowISO() });
  }, pre), holdPatch]);
  // the card's order gets them too (it was made without them: the card block asks nothing, 24.11): after the answer, off
  // the tap's way (its list, the lead, the desk's notice)
  if (fire) later((async () => { const C = cardModule(); if (C && typeof C.payContact === 'function') await C.payContact({ ref: o.ref, name, phone }); })());
  return { ok: true, _order: saved };
}
// the name and phone, then at once the order's myPOS page (one call from the payment screen: the page is ready ~1 s after)
async function contactLink(orderId, key, input) {
  const c = await contact(orderId, key, input);
  if (c.error) return c;
  const o = c._order;
  if (!o || o.provider !== 'requests' || o.status !== 'open') return { ok: true };
  const l = await link(orderId, key, { data: o });
  return l.ok ? { ok: true, url: l.url } : { ok: true, linkError: l.error, status: l.status || 0 };
}

// the Partners way: the order's payment request (made once, kept), with the name she gave → { url }
async function link(orderId, key, pre) {
  if (!pre || !pre.data) pre = await readOrder(orderId);
  const o = pre.data;
  if (!o || !key || !safeEq(o.key, key)) return { error: 'not_found' };
  if (o.provider !== 'requests') return { error: 'bad_provider' };
  if (o.status === 'paid') return { error: 'already_paid' };
  if (o.status !== 'open') return { error: 'not_open' };
  if (o.request && o.request.code && o.request.url) return { ok: true, url: o.request.url };
  if (['hold', 'offer', 'treatment'].includes(o.kind) && !o.phone) return { error: 'missing_contact' };
  const r = await rqActive();
  if (!r || r.error) return { error: 'off' };
  // one request per order, saved before its page is given out: a request made before for this order (its answer lost, a
  // second tap) is found by the order id in its booking text and used again; a new one only when there is none
  let req = null;
  try {
    if (o.requestTried) req = (await RQ.findByOrder(r, o.id)).find((x) => !['Expired', 'Cancelled'].includes(x.status) && Math.abs(x.amount - o.amount) < 0.005) || null;
    if (!req) {
      // „tried” noted while myPOS makes it (a lost answer is then looked for by the order id, never made twice)
      const tried = update(orderId, (x) => { x.requestTried = nowISO(); }, pre.etag ? pre : null).catch((e) => console.error('pay tried:', e.message));
      try { req = await RQ.create(r, { orderId: o.id, amount: o.amount, title: o.title, clientName: o.name }); } finally { await tried; }
    }
  } catch (e) {
    console.error('pay link:', e.code, e.status, e.message);
    // what myPOS answered, kept on the order (the diagnostics read it): the code, the HTTP status, myPOS's words
    later(Promise.all([rqFail(e), update(orderId, (x) => { x.linkError = { code: e.code || 'mypos_failed', status: e.status || 0, message: String(e.message || '').slice(0, 300), at: nowISO() }; })]));
    return { error: e.code || 'mypos_failed', status: e.status || 0, message: e.message || '' };
  }
  const saved = await update(orderId, (x) => { delete x.linkError; if (x.request && x.request.code) return; x.request = { code: req.code, url: req.url, at: nowISO() }; });
  if (!saved || !saved.request || !saved.request.code || !saved.request.url) return { error: 'mypos_failed', message: 'cererea nu s-a putut salva' };
  return { ok: true, url: saved.request.url };
}
const rqActive = async () => { const pv = await provider(); return pv && pv.name === 'requests' ? pv.c : await RQ.active(S); };
// a card whose myPOS page could not be made: the card's own PayLink (made by the owner in myPOS, one per card), only when
// it asks the very sum of the order; the card's record is told (its payment is then matched by the sum, as before)
async function cardFallback(orderId, key) {
  const { data: o } = await readOrder(orderId);
  if (!o || !key || !safeEq(o.key, key) || o.kind !== 'card' || o.status !== 'open') return null;
  const C = cardModule();
  if (!C || typeof C.onlinePay !== 'function' || typeof C.byId !== 'function' || !C.KEY) return null;
  try {
    const list = await readJSON(C.KEY, []);
    const r = C.byId(list, String(o.ref || ''));
    if (!r || r.status === 'platit') return null;
    const op = await C.onlinePay(r.tier);
    if (!op || !op.link || !/^https:\/\//.test(op.link) || Math.abs(Number(op.amount) - Number(o.amount)) >= 0.01) return null;
    if (r.checkout && !r.checkout.paylink) { r.checkout.paylink = nowISO(); await writeJSON(C.KEY, list); }
    await update(o.id, (x) => { x.fallback = { at: nowISO(), kind: 'paylink' }; }).catch(() => {});
    return op.link;
  } catch (e) { console.error('pay card fallback:', e.message); return null; }
}
// what the page saw (the tap, the tab, an error code), kept on the order for the diagnostics: no names, no phones
async function trace(orderId, key, step, code) {
  const { data: o } = await readOrder(orderId);
  if (!o || !key || !safeEq(o.key, key)) return { error: 'not_found' };
  await update(orderId, (x) => { x.activityAt = nowISO(); x.trace = (x.trace || []).concat({ at: nowISO(), step: clip(step, 30).replace(/[^\w:-]/g, ''), code: clip(code, 40).replace(/[^\w:.-]/g, '') }).slice(-25); });
  return { ok: true };
}
// an open order of the Partners way without a saved code (its request made, the answer lost): found again at myPOS
async function recoverRequest(r, o) {
  if (o.request && o.request.code) return o;
  const found = (await RQ.findByOrder(r, o.id)).find((x) => Math.abs(x.amount - o.amount) < 0.005) || null;
  if (!found) return o;
  const saved = await update(o.id, (x) => { if (x.request && x.request.code) return false; x.request = { code: found.code, url: found.url, at: nowISO(), recovered: true }; });
  return saved || o;
}
// what myPOS says of the order's payment request, as the embedded way's answer (status 1 paid, 3 failed, 4 gone)
async function askRequest(r, o) {
  if (!o.request || !o.request.code) return null;
  const st = await RQ.status(r, o.request.code);
  const map = { Paid: 1, Pending: 2, Seen: 2, Failed: 2, Expired: 4, Cancelled: 4 }; // a failed try can be tried again on the same page
  return { orderId: st.bookingText === o.id ? o.id : st.bookingText, status: map[st.status] || 0, amount: st.amount, currency: st.currency, ref: o.request.code, method: 'request', at: nowISO(), raw: st.status };
}

// she gives up paying online: the booking goes back to „plătesc în clinică” at the full price (only while nothing was paid)
async function toClinic(orderId, key) {
  const { data: o } = await readOrder(orderId);
  if (!o || !safeEq(o.key, key) || !['booking', 'hold'].includes(o.kind)) return { error: 'not_found' };
  if (o.status === 'paid') return { error: 'paid' };
  if (o.kind === 'hold') {
    // nothing was booked yet: the held hour is let go (the slip books it at the clinic with her name and phone)
    await require('./booking-holds').release(o.ref);
    await update(orderId, (x) => { if (x.status !== 'open') return false; x.status = 'expired'; x.failWhy = 'clinic'; });
    await openList((l) => l.filter((x) => x.id !== orderId));
    return { ok: true };
  }
  for (let round = 0; round < 5; round++) {
    const { data: appts, etag } = await store.readJSONTagged('data/appointments.json', []);
    const a = appts.find((x) => x && x.id === o.ref);
    if (!a) return { error: 'not_found' };
    if (a.paidOnline || a.pay === 'online-paid') return { error: 'paid' };
    Object.assign(a, { pay: 'clinic', updatedAt: nowISO() });
    delete a.payAmount; delete a.payVia; delete a.payBonus;
    a.note = String(a.note || '').replace(/\s*·\s*Plată online [^·]*/g, '');
    if (await store.writeJSONIf('data/appointments.json', appts, etag)) break;
  }
  await update(orderId, (x) => { if (x.status !== 'open') return false; x.status = 'expired'; x.failWhy = 'clinic'; });
  await openList((l) => l.filter((x) => x.id !== orderId));
  return { ok: true };
}

// on the clock (every 5 minutes): the orders still open are asked about once they are 2 minutes old (a lost notification
// still ends paid), forgotten after 48 hours; a paid order whose handler failed is tried again
// fresh (every minute, api/pay-tick.js): only the orders active in the last 15 minutes whose myPOS page was made, newest first, at
// most 12 asked (myPOS has no return or notification for these pages: a payment is seen within a minute, 23.11); the full
// round (every 5 minutes) asks the older ones and finds lost codes again
async function sweep(opts) {
  const fresh = !!(opts && opts.fresh);
  const c = await IPC.load(S), r = await RQ.active(S);
  if (!IPC.ready(c) && !r) return { open: 0 };
  const list = await readJSON(OPEN, []);
  const now = Date.now();
  const out = { open: list.length, paid: 0, gone: 0, retried: 0, asked: 0 };
  const items = fresh ? list.filter((it) => { const a = now - Date.parse(it.at); return a >= 20e3 && a < 3 * 3600e3; }).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 25) : list.slice(0, 25);
  for (const it of items) {
    const age = now - Date.parse(it.at);
    if (!fresh && age < 120e3) continue;
    if (fresh && out.asked >= 12) break;
    const { data: o } = await readOrder(it.id);
    if (!o || o.status !== 'open') { if (!fresh) { await openList((l) => l.filter((x) => x.id !== it.id)); out.gone++; } continue; }
    if (fresh && o.provider === 'requests' && !(o.request && o.request.code)) continue;
    // (every minute only for the 15 minutes after her last sign of life: then the 5-minute round, George 23.11)
    if (fresh && now - lastActivity(o) > 15 * 60e3) continue;
    out.asked++;
    let st = null;
    try {
      if (o.provider === 'requests') { if (!r || r.error) continue; st = await askRequest(r, fresh ? o : await recoverRequest(r, o)); }
      else { if (!IPC.ready(c)) continue; st = await askBoth(c, o); }
    } catch (e) { await rqFail(e); continue; }
    if (st && st.status === 1 && fits(o, st)) { const r = await markPaid(o.id, st, fresh ? 'status-1min' : 'status'); if (r.ok) out.paid++; continue; }
    if (fresh) continue;
    if (age > 48 * 3600e3 || (st && baseOf(st.orderId) === o.id && (st.status === 3 || st.status === 4) && age > 30 * 60e3)) {
      await update(o.id, (x) => { if (x.status !== 'open') return false; x.status = st && st.status === 4 ? 'failed' : 'expired'; });
      await openList((l) => l.filter((x) => x.id !== it.id)); out.gone++;
    }
  }
  if (fresh) return out;
  // the paid ones whose handler failed (kept in a short list by the handler's error)
  const failed = (await readJSON(RETRY, [])).filter(Boolean);
  for (const id of failed.slice(0, 10)) {
    const { data: o } = await readOrder(id);
    if (o && o.status === 'paid' && !o.handled && (await retryLock(o))) { await runHandler(id); out.retried++; }
  }
  return out;
}

// Is this myPOS payment (seen in the account's transactions by an old matcher: the card's PayLinks, booking-pay's links) one of
// the checkout's? p: { ref ('mypos-<payment_reference>' or the bare reference), amount, at }. True when its reference is a
// checkout payment's, or when a checkout order of the same sum still waits (made up to 48 h before it) or was paid within
// 30 minutes of it: then it is left alone (asked again on the next scan, when the checkout has settled).
async function isCheckoutPayment(p) {
  const ref = String((p && p.ref) || '').replace(/^mypos-/, '');
  const amt = Number(p && p.amount), t = Date.parse(p && p.at) || Date.now();
  const same = (x) => Math.abs(Number(x) - amt) < 0.01;
  const paid = await readJSON(PAID, []).catch(() => []);
  if (ref && paid.some((x) => (x.refs || []).includes(ref))) return true;
  if (paid.some((x) => same(x.amount) && Math.abs(t - (Date.parse(x.at) || 0)) < 30 * 60e3)) return true;
  const open = await readJSON(OPEN, []).catch(() => []);
  // an open order of that sum holds the payment only while the checkout can still settle it (30 min); after that the
  // card's own matching (or „De verificat”) takes it: a PayLink payment made next to an open order is never lost (23.11)
  if (Date.now() - t > 30 * 60e3) return false;
  return open.some((x) => same(x.amount) && Date.parse(x.at) <= t + 5 * 60e3 && t - Date.parse(x.at) <= 48 * 3600e3);
}

// what the browser may know (the embedded form's public fields, whether it is on, the bonus)
async function status() {
  const pv = await provider();
  if (!pv) return { on: false, bonusPct: BONUS_PCT };
  return Object.assign(pv.name === 'embedded' ? IPC.publicOf(pv.c) : { on: true, live: pv.live, sandbox: pv.sandbox }, { provider: pv.name, bonusPct: BONUS_PCT });
}

// her last sign of life on the order (the screen's contact, a tap, the tab of the tap): the recovery message waits 10
// minutes from it (api/_lib/pay-recovery.js)
async function touch(orderId) { return update(orderId, (x) => { if (x.status !== 'open') return false; x.activityAt = nowISO(); }); }
const lastActivity = (o) => Math.max(Date.parse(o.createdAt) || 0, Date.parse(o.activityAt) || 0, Date.parse(o.notice && o.notice.at) || 0, Date.parse(o.request && o.request.at) || 0,
  ...(o.trace || []).map((t) => Date.parse(t.at) || 0));
// the recovery mark on the order; claim: only when it has none yet (two clocks at once: one gets it) → true when set
async function markRecovery(orderId, patch, claim) {
  let mine = false;
  await update(orderId, (x) => {
    mine = false;
    if (claim && (x.recovery || x.status !== 'open')) return false;
    x.recovery = Object.assign({}, claim ? {} : x.recovery || {}, patch);
    mine = true;
  });
  return mine;
}
// what myPOS says of the order's payment request, word for word ('Pending' | 'Seen' | 'Expired' | 'Paid' | …); none made:
// what myPOS has under the order's id (a request whose answer was lost); throws on any error of myPOS
async function requestWords(o) {
  const r = await rqActive();
  if (!r) throw new Error('requests_off');
  if (o.request && o.request.code) { const st = await RQ.status(r, o.request.code); return { words: [String(st.status || '')], amount: st.amount }; }
  if (!o.requestTried) return { words: [], none: true };
  const found = await RQ.findByOrder(r, o.id);
  return { words: found.map((x) => x.status), found: found.length };
}

// ---- the card's one-tap link (24.11): WhatsApp „Plătesc online” → straight to the myPOS page of her card
// cardLink(cardId) → 'https://www.centrul360.com/api/pay-go?c=<cardId>&t=<token>' (signed: no link can be made up or guessed)
const cardToken = (id) => {
  const k = String(process.env.PORTAL_SECRET || '');
  if (!k) throw new Error('no_secret');
  return crypto.createHmac('sha256', k + '|card-pay-go').update(String(id)).digest('base64url').slice(0, 22);
};
function cardLink(cardId) {
  const id = String(cardId || '').toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('bad_card_id');
  return 'https://www.centrul360.com/api/pay-go?c=' + id + '&t=' + cardToken(id);
}
const cardTokenOk = (id, t) => { try { const a = Buffer.from(cardToken(String(id || '').toLowerCase())), b = Buffer.from(String(t || '')); return a.length === b.length && crypto.timingSafeEqual(a, b); } catch (e) { return false; } };
// the tap: her card's checkout order (the open one again while her card is held, else made now: the card module holds it
// again when one is left) and its myPOS page → { url } | { error: 'already_paid' | 'sold_out' | 'closed' | 'not_found' | …, page }
async function cardGo(cardId) {
  const C = cardModule();
  if (!C || typeof C.byId !== 'function') return { error: 'card_not_ready' };
  const id = String(cardId || '').toLowerCase();
  const page = typeof C.checkoutUrl === 'function' ? C.checkoutUrl({ id }) : 'https://www.centrul360.com/card-sarbatori';
  // (two taps at once: one makes the order, the other finds it)
  for (let round = 0; round < 8; round++) {
    const r = C.byId((await readJSON(C.KEY, [])) || [], id);
    if (!r) return { error: 'not_found', page };
    if (r.status === 'platit') return { error: 'already_paid', page };
    // an order of this card paid already (its card not marked yet): never a second payment
    if (round === 0) {
      const paid = ((await readJSON(PAID, [])) || []).filter((x) => Math.abs(Number(x.amount) - Number(r.amount)) < 0.01 && Date.now() - Date.parse(x.at) < 14 * 864e5).slice(-20);
      for (const it of paid) { const { data } = await readOrder(it.id); if (data && data.kind === 'card' && data.ref === r.id && data.status === 'paid') return { error: 'already_paid', page }; }
    }
    let o = null;
    if (r.status === 'asteptare' && typeof C.live === 'function' && C.live(r)) {
      const open = (await readJSON(OPEN, [])) || [];
      const mine = open.filter((x) => x.ref === r.id || (!x.ref && Math.abs(Number(x.amount) - Number(r.amount)) < 0.01 && Date.now() - Date.parse(x.at) < 48 * 3600e3)).slice(-12).reverse();
      for (const it of mine) {
        const { data } = await readOrder(it.id);
        if (data && data.kind === 'card' && data.ref === r.id && data.status === 'open' && !data.test && Math.abs(Number(data.amount) - Number(r.amount)) < 0.01) { o = data; break; }
      }
    }
    if (!o) {
      let mineLock = true;
      // (per card, per minute and per hold: a card held again later makes its own)
      const hk = crypto.createHash('sha1').update(String(r.held || r.created || '') + '|' + r.status).digest('hex').slice(0, 8);
      try { mineLock = await store.createOnce('locks/card-go/' + r.id + '-' + Math.floor(Date.now() / 60e3) + '-' + hk + '.txt', '1'); } catch (e) { mineLock = true; }
      if (!mineLock) { await new Promise((w) => setTimeout(w, 1200)); continue; }
      const c = await createOrder({ kind: 'card', ref: r.id, input: {}, host: 'www.centrul360.com' });
      if (c.error) return { error: c.error, page };
      if (c.provider !== 'requests') return { error: 'not_requests', page };
      o = (await readOrder(c.orderId)).data;
      if (!o) return { error: 'order_lost', page };
    }
    if (o.provider !== 'requests') return { error: 'not_requests', page };
    later(touch(o.id));
    const l = await link(o.id, o.key, { data: o });
    return l.ok ? { url: l.url, orderId: o.id } : { error: l.error || 'mypos_failed', status: l.status || 0, page, orderId: o.id };
  }
  return { error: 'busy', page };
}

module.exports = { cardLink, cardTokenOk, cardGo, INDEX, touch, lastActivity, markRecovery, requestWords, later, contactLink, cardFallback, trace, recoverRequest, bonusFor, bonusOfOffer, bonusOfTreatment, saveSettings, SETTINGS, isCheckoutPayment, link, provider, TEST, contact, baseOf, BONUS_PCT, bonusPrice, KINDS, registerKind, createOrder, markPaid, check, toClinic, sweep, status, treatment, priceList, readOrder, validId, runHandler };
