// Black Friday of the Card de Sărbători (the owner, 24.11; api/_lib/card-terms.js): checked on an in-memory store, no network,
// the clock set by hand. Exits 1 on a failure.   node qa/card-bf.cjs   (OUT=folder: the pictures are written there too)
const path = require('path'), fs = require('fs'), Module = require('module');
const LIB = path.join(__dirname, '..', 'api', '_lib');

// ---- the store, in memory (every module that asks for ./store gets this one)
const mem = new Map(), bin = new Map();
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const store = {
  async readJSON(p, d) { return mem.has(p) ? clone(mem.get(p)) : d; },
  async writeJSON(p, d) { mem.set(p, clone(d)); return { ok: true }; },
  async readJSONTagged(p, d) { return { data: mem.has(p) ? clone(mem.get(p)) : d, etag: '' }; },
  async writeJSONIf(p, d) { mem.set(p, clone(d)); return { ok: true }; },
  async readRev() { return ''; },
  async writeBinary(p, b) { bin.set(p, b); },
  async readBinary(p) { return bin.get(p) || null; },
  async removeBinary(p) { bin.delete(p); },
  async createOnce(p, v) { if (mem.has(p)) return false; mem.set(p, v); return true; },
  async writeLog() {},
  merge3: (a, b) => b,
};
const storePath = require.resolve(path.join(LIB, 'store.js'));
require.cache[storePath] = new Module(storePath); Object.assign(require.cache[storePath], { filename: storePath, loaded: true, exports: store });
// no network
globalThis.fetch = async () => { throw new Error('no network in this test'); };
// WhatsApp, kept here: every message she would get (text, template) is in `wa`
const wa = [];
const waPath = require.resolve(path.join(LIB, 'whatsapp.js'));
const waOk = async (o) => { wa.push(o); return { sent: true, id: 'wa-' + wa.length, fromCity: o.from }; };
require.cache[waPath] = new Module(waPath); Object.assign(require.cache[waPath], { filename: waPath, loaded: true, exports: {
  loadConfig: async () => ({ numbers: { 'Timișoara': { wabaId: 'w1' }, Arad: { wabaId: 'w1' } } }), readyNumbers: () => ['Timișoara', 'Arad'],
  sendWhatsApp: waOk, sendMedia: waOk, uploadMedia: async () => ({ id: 'm1' }) } });
// myPOS: connected, no payments in its list (the recovery's checks read it)
const myPath = require.resolve(path.join(LIB, 'mypos.js'));
require.cache[myPath] = new Module(myPath); Object.assign(require.cache[myPath], { filename: myPath, loaded: true, exports: {
  loadConn: async () => ({ devices: [] }), connected: () => true, listTransactions: async () => [], listEvents: async () => [] } });
// web push: nothing leaves (the bell's phones)
const pushPath = require.resolve(path.join(LIB, 'push.js'));
require.cache[pushPath] = new Module(pushPath); Object.assign(require.cache[pushPath], { filename: pushPath, loaded: true, exports: new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : async () => ({})) }) });

// ---- the clock, set by hand
const RealDate = Date;
let NOW = RealDate.parse('2026-11-25T10:00:00Z');
class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
globalThis.Date = FakeDate;
const setNow = (iso) => { NOW = RealDate.parse(iso); };

let ok = 0; const fails = [];
const check = (name, cond, more) => { if (cond) { ok++; console.log('ok   ' + name); } else { fails.push(name); console.log('FAIL ' + name + (more ? ' → ' + JSON.stringify(more) : '')); } };

const S = require(path.join(LIB, 'shop.js'));
const P = require(path.join(LIB, 'pay.js'));
const H = require(path.join(LIB, 'booking-holds.js'));

(async () => {
  // ---- the catalog and the prices
  const tm = S.catalog('Timișoara'), ar = S.catalog('Arad');
  check('catalog: Timișoara has EMS, împachetare and epilare; Arad has none of them', tm.some((p) => p.id === 'ems-o-zona') && tm.some((p) => p.need === 'epilare') && !ar.some((p) => p.need === 'epilare' || /^ems|impachetare/.test(p.id)), ar.map((p) => p.id));
  const lipo = tm.find((p) => p.id === 'liposonix-o-zona-corporala');
  check('Liposonix 2 ședințe: 980 → 490 during Black Friday', lipo && lipo.options[0].full === 980 && lipo.options[0].price === 490, lipo && lipo.options);
  check('every product has options, a picture and words', tm.concat(ar).every((p) => p.options.length && p.img && p.d));
  check('pairs only of the same city', ar.every((p) => p.pairs.every((id) => ar.some((x) => x.id === id))));
  // ---- the cart
  let q;
  const ems = tm.find((p) => p.id === 'ems-o-zona');
  q = await S.quote('Timișoara', [lipo.options[0].id, ems.options[1].id]);
  check('cart: 980 + 1050 → 490 + 525 = 1015, saved 1015', q.amount === 1015 && q.full === 2030 && q.saved === 1015, q);
  check('cart 1015: the steps of 550 and 990 reached, 4990 next (3975 missing)', q.reached.map((x) => x.at).join() === '550,990' && q.next.at === 4990 && q.next.missing === 3975, q.reached);
  check('the main treatment is the dearest (EMS 6 ședințe, 30 min)', q.main.minutes === 30 && q.main.id === ems.options[1].id, q.main);
  check('EMS in Arad: not in the city', (await S.quote('Arad', [ems.options[1].id])).error === 'not_in_city');
  check('an empty cart', (await S.quote('Timișoara', [])).error === 'empty');
  // ---- after Black Friday: the list price minus the usual online bonus
  setNow('2026-11-27T22:00:01Z');
  q = await S.quote('Timișoara', [lipo.options[0].id]);
  check('after 27.11 23:59:59: 980 minus 10% = 882, not -50%', q.amount === 882 && !q.bf, q);
  setNow('2026-11-27T21:59:58Z');
  check('one second before the end: still -50%', (await S.quote('Timișoara', [lipo.options[0].id])).amount === 490);
  setNow('2026-11-25T10:00:00Z');
  // ---- the owner's numbers replace the steps
  await store.writeJSON('data/shop-bonus.json', { tiers: [{ at: 600, title: 'Test' }] });
  check('data/shop-bonus.json replaces the steps', (await S.tiers()).length === 1 && (await S.tiers())[0].at === 600);
  await store.writeJSON('data/shop-bonus.json', null);
  // ---- the payment's sum comes from the hold's cart, never the page
  const h = await H.add({ key: 'k', city: 'Timișoara', svc: { id: 'custom', title: 'Prima ședință · comandă online: x', price: 1015, old: 2030, minutes: 45, cat: 'corporale', treatment: lipo.options[0].id },
    cart: { items: [lipo.options[0].id, ems.options[1].id], visit: 'first' }, date: '2026-11-26', time: '10:00', endTime: '10:45' });
  const pq = await P.KINDS.shop.quote({ ref: h.id, input: { amount: 1 } });
  check('pay quote: 1015 lei, full 2030, the gifts of the steps', pq.amount === 1015 && pq.full === 2030 && pq.bonus.type === 'gift' && /200 lei/.test(pq.bonus.gift) && /Radiofrecvență/.test(pq.bonus.gift), pq);
  setNow('2026-11-25T10:20:00Z');
  check('the hold ran out (15 min): nothing to pay', (await P.KINDS.shop.quote({ ref: h.id })).error === 'expired');
  // ---- paid (myPOS's signed word, pay.js markPaid → the handler): the booking made from the hold, paid, in Încasări
  setNow('2026-11-25T10:05:00Z');
  await H.patch(h.id, (x) => { x.contact = { name: 'Proba Test', phone: '0700000123', consent: true }; });
  const o = { id: 'C360-test1', kind: 'shop', ref: h.id, amount: 1015, full: 2030, bonus: pq.bonus, title: pq.title, city: 'Timișoara', name: 'Proba Test', phone: '0700000123', mypos: { ref: 'R1', at: new RealDate(NOW).toISOString() }, paidAt: new RealDate(NOW).toISOString() };
  const r = await P.KINDS.shop.paid(o).catch((e) => ({ err: e.message, stack: e.stack }));
  const appts = await store.readJSON('data/appointments.json', []);
  const a = appts.find((x) => x.id === r.appt);
  check('paid: the booking is made, confirmed and paid online (1015 lei)', a && a.pay === 'online-paid' && a.paidOnline.amount === 1015 && a.status === 'confirmata' && a.date === '2026-11-26' && a.time === '10:00', r);
  check('the booking says what was bought and the gifts', a && /comandă online/.test(a.treatment) && /Card cadou de 200 lei/.test(a.note), a && { t: a.treatment, n: a.note });
  const sale = (await store.readJSON('data/sales.json', [])).find((x) => x.id === r.sale);
  check('a row in Încasări, 1015 lei, card, online', sale && sale.amount === 1015 && sale.method === 'card', sale);
  check('the hold knows its booking', (await H.get(h.id)).bookingId === a.id);
  const r2 = await P.KINDS.shop.paid(o);
  check('the handler twice: one booking, one sale', r2.appt === a.id && (await store.readJSON('data/appointments.json', [])).length === 1 && (await store.readJSON('data/sales.json', [])).length === 1, r2);
  console.log('\n' + ok + ' ok, ' + fails.length + ' failed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
