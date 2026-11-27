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
  // laser epilation is not sold for now (the owner, 25.11): in neither city, no package of it either
  check('catalog: no laser epilation anywhere (not sold for now), no package with it', !tm.concat(ar).some((p) => p.need === 'epilare' || /epil/.test(p.id)));
  check('catalog: Timișoara has EMS and împachetare; Arad has none of them', tm.some((p) => p.id === 'ems') && !ar.some((p) => p.need === 'epilare' || /^ems|impachetare/.test(p.id)), ar.map((p) => p.id));
  const lipo = tm.find((p) => p.id === 'liposonix');
  check('Liposonix, one session, one zone: 640 → 320 during Black Friday (the owner: 2 zones = 1.280)', lipo && lipo.full === 640 && lipo.price === 320, lipo);
  check('one session only: no packages, no combined offers (no EMS 2 zones, no „Gușă + Contur” name)', tm.every((p) => p.full > 0 && !/\+|2 zone/.test(p.name)) && !tm.some((p) => /2-zone/.test(p.ref)), tm.map((p) => p.name));
  check('short names, a zone where it has one, two short lines', tm.concat(ar).every((p) => p.name.length <= (p.bundle ? 62 : p.need === "epilare" || p.pack ? 40 : p.base ? 30 : 26) && p.b.length >= 2 && p.b.every((x) => x.length <= (p.bundle ? 90 : 36))), tm.filter((p) => p.name.length > (p.need === "epilare" ? 40 : 26) || p.b.some((x) => x.length > 36)).map((p) => p.name));
  // „Toate zonele” (the owner, 25.11): the twin of a body treatment with zones, one session on every zone, the sum of the zones
  const lt = tm.find((p) => p.id === 'liposonix-toate');
  check('Liposonix Full Body: 5 zones, 3.200 → 1.600, no zones of its own, opens the Liposonix page', lt && lt.base === 'liposonix' && lt.full === 3200 && lt.price === 1600 && !lt.zones.length && lt.minutes <= 90, lt);
  const qt = await S.quote('Timișoara', [{ id: 'liposonix-toate', qty: 2 }]);
  check('the twin in the cart: priced by the server', !qt.error && qt.amount === 3200 && qt.lines[0].name === 'Liposonix Full Body', qt);
  check('no twin for the face or for a treatment with one zone', !tm.some((p) => p.allOf && p.need !== 'corp'));
  // the price list's packages (the owner, 25.11: „-50% și la pachete”), sold from the cart under the session they contain
  const rf6 = tm.find((p) => p.id === 'radiofrecventa-x6'), lp2 = tm.find((p) => p.id === 'liposonix-x2');
  check('packages: Red Sculpt 6 ședințe = 6 × 280 = 1.680 → 840 (never more than -50%, 26.11), on its zones, its own row', rf6 && rf6.pack === 6 && rf6.base === 'radiofrecventa' && rf6.full === 1680 && rf6.price === 840 && rf6.zones.length === 3 && rf6.ref === 'radiofrecventa-o-zona-corporala-6-sedinte', rf6);
  check('packages: Liposonix 2 ședințe 1.280 → 640, never 490 (26.11); no RF Sculpt, no EMS 2 zones; EMS only in Timișoara', lp2 && lp2.price === 640 && lp2.full === 1280 && !tm.concat(ar).some((p) => /rfsculpt|ems-2-zone/.test(p.ref)) && tm.some((p) => p.id === 'ems-x6') && !ar.some((p) => p.id === 'ems-x6'));
  // never more than 50% off (the owner, 26.11: „nu vreau să fie reduceri mai mari de 50%”): every product, package and problem
  // package costs at least half of its sessions one by one at the full price
  const ALL = tm.concat(ar), base = (id) => ALL.find((x) => x.id === id);
  const listOf = (p) => (p.bundle ? p.parts.reduce((s, x) => { const q = base(x.id); return s + (q ? listOf(q) * x.n : 1e9); }, 0) : p.pack ? (base(p.base) || { full: 1e9 }).full * p.pack : p.full);
  const deep = ALL.filter((p) => p.price * 2 < listOf(p) - 1);
  check('no price anywhere is more than 50% off its sessions one by one (packages and problem packages included)', !deep.length, deep.map((p) => p.id + ' ' + p.price + '/' + listOf(p)));
  check('the full price shown is the sessions one by one, so the crossed price is real', ALL.every((p) => p.full === listOf(p)), ALL.filter((p) => p.full !== listOf(p)).map((p) => p.id + ' ' + p.full + '/' + listOf(p)));
  const after = S.catalog('Timișoara', Date.parse('2026-11-30T10:00:00Z')).concat(S.catalog('Arad', Date.parse('2026-11-30T10:00:00Z')));
  const aBy = (id) => after.find((x) => x.id === id);
  const aList = (p) => (p.bundle ? p.parts.reduce((s, x) => { const q = aBy(x.id); return s + (q ? aList(q) * x.n : 1e9); }, 0) : p.pack ? (aBy(p.base) || { full: 1e9 }).full * p.pack : p.full);
  const aDeep = after.filter((p) => p.price * 2 < aList(p) - 1);
  check('after Black Friday too, no price is more than 50% off its sessions one by one', !aDeep.length, aDeep.map((p) => p.id + ' ' + p.price + '/' + aList(p)));
  check('after Black Friday every package costs less than its sessions one by one', after.filter((p) => p.pack).every((p) => { const b = after.find((x) => x.id === p.base); return b && p.price < b.price * p.pack; }));
  // the problem packages (the owner, 25.11): their treatments at the price list (its packages), the sum at -50%
  const bg = tm.find((p) => p.id === 'pachet-gusa'), bt = ar.find((p) => p.id === 'pachet-tonifiere');
  check('problem package: Gușă și contur = HIFU 290 + BioLifting × 4 680 = 970 → 485, on the zones its name fits (gușă, contur, gât; 25.11), booked as HIFU', bg && bg.bundle && bg.full === 970 && bg.price === 485 && bg.zones.join() === 'Gușă,Gât,Contur mandibular' && bg.ref === 'hifu-o-zona-mica-faciala-1-sedinta' && bg.ses === 5, bg);
  check('problem package: none in a city without one of its treatments (EMS in Arad)', !bt && tm.some((p) => p.id === 'pachet-tonifiere'));
  const qb = await S.quote('Timișoara', [{ id: 'pachet-grasime', zone: 'Coapse' }]);
  check('a problem package in the cart: „Zonă mai suplă în 8 săptămâni, Coapse” 2.400 → 1.200', !qb.error && qb.amount === 1200 && qb.full === 2400 && qb.lines[0].name === 'Zonă mai suplă în 8 săptămâni, Coapse', qb);
  const qp = await S.quote('Arad', [{ id: 'biolifting-x4', zone: 'Gușă' }]);
  check('a package in the cart: BioLifting Gușă · 4 ședințe = 4 × 170 = 680 → 340, its first session booked on the package', !qp.error && qp.amount === 340 && qp.full === 680 && qp.lines[0].name === 'BioLifting Gușă · 4 ședințe' && qp.main.id === 'radiofrecventa-o-zona-mica-faciala-4-sedinte', qp);
  check('pairs only of the same city', ar.every((p) => p.pairs.every((id) => ar.some((x) => x.id === id))));
  let q = await S.quote('Timișoara', [{ id: 'liposonix', zone: 'Abdomen', qty: 2 }, { id: 'ems', zone: 'Coapse' }]);
  // 2 sessions of Liposonix are its 2-session package, at half of 2 sessions (640, full 1.280), never 490 (the owner, 26.11)
  check('cart: Liposonix Abdomen × 2 is its 2-session package (640) + EMS Coapse (125) = 765, full 1.530', q.amount === 765 && q.full === 1530 && q.saved === 765, q);
  check('the names carry the zone', q.lines[0].name === 'Liposonix Abdomen · 2 ședințe' && q.lines[1].name === 'EMS Coapse' && S.summary(q) === 'Liposonix Abdomen · 2 ședințe + EMS Coapse', S.summary(q));
  check('a zone that is not the product’s: its first zone', (await S.quote('Timișoara', [{ id: 'liposonix', zone: 'Nas' }])).lines[0].zone === 'Abdomen');
  check('at most 10 sessions of one', (await S.quote('Timișoara', [{ id: 'liposonix', qty: 99 }])).lines[0].qty === 10);
  check('no volume bonuses for now', q.reached.length === 0 && !q.next, q.reached);
  check('the main treatment is the dearest line (the Liposonix package, a session of 45 min)', q.main.minutes === 45 && q.main.id === 'liposonix-o-zona-corporala-2-sedinte', q.main);
  check('EMS in Arad: not in the city', (await S.quote('Arad', [{ id: 'ems' }])).error === 'not_in_city');
  check('an empty cart', (await S.quote('Timișoara', [])).error === 'empty');
  check('the massage is in the list: 160 → 80 (the owner, 25.11)', (tm.find((p) => p.id === 'masaj-facial') || {}).price === 80);
  // ---- after Black Friday: the list price minus the usual online bonus
  setNow('2026-11-29T22:00:01Z');
  q = await S.quote('Timișoara', [{ id: 'liposonix' }]);
  check('after 29.11 23:59:59 (prelungit de la 27.11): 640 minus 10% = 576, not -50%', q.amount === 576 && !q.bf, q);
  setNow('2026-11-29T21:59:58Z');
  check('one second before the end: still -50%', (await S.quote('Timișoara', [{ id: 'liposonix' }])).amount === 320);
  setNow('2026-11-25T10:00:00Z');
  await store.writeJSON('data/shop-bonus.json', { tiers: [{ at: 600, title: 'Test' }] });
  check('data/shop-bonus.json brings the steps back', (await S.tiers()).length === 1 && (await S.tiers())[0].at === 600);
  await store.writeJSON('data/shop-bonus.json', null);
  // ---- the payment's sum comes from the hold's cart, never the page
  const h = await H.add({ key: 'k', city: 'Timișoara', svc: { id: 'custom', title: 'Prima ședință · comandă online: Liposonix Abdomen · 2 ședințe + EMS Coapse', price: 765, old: 1530, minutes: 45, cat: 'corporale', treatment: lipo.ref },
    cart: { items: [{ id: 'liposonix', zone: 'Abdomen', qty: 2 }, { id: 'ems', zone: 'Coapse' }], visit: 'first' }, date: '2026-11-26', time: '10:00', endTime: '10:45' });
  const pq = await P.KINDS.shop.quote({ ref: h.id, input: { amount: 1 } });
  check('pay quote: 765 lei, full 1.530, -50% Black Friday', pq.amount === 765 && pq.full === 1530 && pq.bonus.type === 'pct' && pq.bonus.pct === 50, pq);
  setNow('2026-11-25T10:20:00Z');
  check('the hold ran out (15 min): nothing to pay', (await P.KINDS.shop.quote({ ref: h.id })).error === 'expired');
  // ---- paid (myPOS's signed word, pay.js markPaid → the handler): the booking made from the hold, paid, in Încasări
  setNow('2026-11-25T10:05:00Z');
  await H.patch(h.id, (x) => { x.contact = { name: 'Proba Test', phone: '0700000123', consent: true }; });
  const o = { id: 'C360-test1', kind: 'shop', ref: h.id, amount: 765, full: 1530, bonus: pq.bonus, title: pq.title, city: 'Timișoara', name: 'Proba Test', phone: '0700000123', mypos: { ref: 'R1', at: new RealDate(NOW).toISOString() }, paidAt: new RealDate(NOW).toISOString() };
  const r = await P.KINDS.shop.paid(o).catch((e) => ({ err: e.message, stack: e.stack }));
  const appts = await store.readJSON('data/appointments.json', []);
  const a = appts.find((x) => x.id === r.appt);
  check('paid: the booking is made, confirmed and paid online (765 lei)', a && a.pay === 'online-paid' && a.paidOnline.amount === 765 && a.status === 'confirmata' && a.date === '2026-11-26' && a.time === '10:00', r);
  check('the booking says what was bought', a && /comandă online/.test(a.treatment) && /Plată online 765 lei/.test(a.note), a && { t: a.treatment, n: a.note });
  const sale = (await store.readJSON('data/sales.json', [])).find((x) => x.id === r.sale);
  check('a row in Încasări, 765 lei, card, online', sale && sale.amount === 765 && sale.method === 'card', sale);
  check('the hold knows its booking', (await H.get(h.id)).bookingId === a.id);
  const r2 = await P.KINDS.shop.paid(o);
  check('the handler twice: one booking, one sale', r2.appt === a.id && (await store.readJSON('data/appointments.json', [])).length === 1 && (await store.readJSON('data/sales.json', [])).length === 1, r2);
  // ---- „Rezerv cu avans” (the owner, 26.11): 49 lei online, the price of the cart kept on the booking, the rest at the clinic
  // the deposit is off (the owner, 26.11 evening: „vreau înapoi cu plata integral”): no new hold takes one; a hold made with one still pays it
  check('the deposit is off: no new hold takes one (the whole sum is paid)', S.DEPOSIT_ON === false && S.depositOf(640, false) === 0 && S.depositOf(640, true) === 0);
  const hd = await H.add({ key: 'k2', city: 'Timișoara', deposit: 49, svc: { id: 'custom', title: 'Prima ședință · comandă online: Liposonix Abdomen · 2 ședințe', price: 640, old: 1280, minutes: 45, cat: 'corporale', treatment: lipo.ref },
    cart: { items: [{ id: 'liposonix', zone: 'Abdomen', qty: 2 }], visit: 'first' }, order: ['Liposonix Abdomen · 2 ședințe'], multi: true, date: '2026-11-27', time: '11:00', endTime: '11:45' });
  const dq = await P.KINDS.shop.quote({ ref: hd.id, input: { amount: 1 } });
  check('deposit quote: 49 lei now, the rest (591) said, the title says „Avans”', dq.amount === 49 && dq.full === 49 && /^Avans · /.test(dq.title) && /591 lei la clinică/.test(dq.bonusText) && dq.deposit.rest === 591, dq);
  await H.patch(hd.id, (x) => { x.contact = { name: 'Proba Avans', phone: '0700000124', consent: true }; });
  const od = { id: 'C360-test2', kind: 'shop', ref: hd.id, amount: 49, full: 49, bonus: dq.bonus, title: dq.title, city: 'Timișoara', name: 'Proba Avans', phone: '0700000124', mypos: { ref: 'R2', at: new RealDate(NOW).toISOString() }, paidAt: new RealDate(NOW).toISOString() };
  const rd = await P.KINDS.shop.paid(od).catch((e) => ({ err: e.message, stack: e.stack }));
  const ad = (await store.readJSON('data/appointments.json', [])).find((x) => x.id === rd.appt);
  check('deposit paid: the booking is confirmed, 640 lei, 49 paid online, 591 to cash at the clinic', ad && ad.status === 'confirmata' && ad.amount === 640 && ad.paidOnline.amount === 49 && ad.deposit && ad.deposit.rest === 591 && /AVANS ONLINE 49 lei\. DE ÎNCASAT LA CLINICĂ: 591 lei/.test(ad.note) && !/Plată online 49/.test(ad.note), ad && { n: ad.note, d: ad.deposit, s: ad.status, amt: ad.amount });
  const sd = (await store.readJSON('data/sales.json', [])).find((x) => x.id === rd.sale);
  check('deposit in Încasări: 49 lei, „Avans online programare”, the rest said', sd && sd.amount === 49 && sd.label === 'Avans online programare' && /restul de 591 lei la clinică/.test(sd.treatment), sd);
  // ---- the orders started and not paid → the Pipeline's Site tab (the owner, 26.11), once, after 20 minutes, no message to her
  const hu = await H.add({ key: 'k3', city: 'Arad', svc: { id: 'custom', title: 'Prima ședință · comandă online: HIFU Gușă', price: 145, old: 290, minutes: 15, cat: 'faciale', treatment: 'hifu-o-zona-mica-faciala-1-sedinta' },
    cart: { items: [{ id: 'hifu', zone: 'Gușă' }], visit: 'first' }, date: '2026-11-27', time: '12:00', endTime: '12:15' });
  const ou = { id: 'C360-testunpaid1', kind: 'shop', ref: hu.id, amount: 145, full: 290, title: 'Comandă online: HIFU Gușă', city: 'Arad', name: 'Proba Neplătit', phone: '+40700000125', status: 'open', createdAt: new RealDate(NOW).toISOString(), request: { code: 'X1', at: new RealDate(NOW).toISOString() }, src: { from: 'Reclamă Facebook/Instagram' } };
  await store.writeJSON('data/pay/' + ou.id + '.json', ou);
  await store.writeJSON('data/pay-open.json', [{ id: ou.id, at: ou.createdAt }]);
  const early = await P.checkoutLeads();
  setNow(new RealDate(NOW + 25 * 60e3).toISOString());
  const made = await P.checkoutLeads(), again = await P.checkoutLeads();
  const ul = (await store.readJSON('data/leads.json', [])).find((l) => l.phone && /700000125$/.test(l.phone));
  check('an unpaid order with her phone: a Site lead after 20 minutes, once, with what she chose, the sum and the hour', early.made === 0 && made.made === 1 && again.made === 0 && ul && ul.source === 'site' && ul.createdBy === 'site-checkout' && ul.location === 'Arad' && /Comandă neplătită: HIFU Gușă/.test(ul.interest) && (ul.activities || []).some((x) => /145 lei\. Alesese 27\.11\.2026 12:00/.test(x.text || '')), { early, made, again, ul: ul && { i: ul.interest, s: ul.source, a: (ul.activities || []).map((x) => x.text) } });
  check('the order knows its lead', (await store.readJSON('data/pay/' + ou.id + '.json', {})).leadId === (ul && ul.id));
  console.log('\n' + ok + ' ok, ' + fails.length + ' failed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
