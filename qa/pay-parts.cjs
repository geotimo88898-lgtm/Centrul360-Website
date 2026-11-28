// A sum above 990 lei paid in parts (George, 28.11: „la plata în myPOS vreau totul acum, 1000+”): checked on an in-memory
// store, a fake myPOS (its payment requests by booking text and code), no network, the clock set by hand.
//   node qa/pay-parts.cjs        Exits 1 on a failure.
const path = require('path'), Module = require('module');
const LIB = path.join(__dirname, '..', 'api', '_lib');
const fake = (name, exports) => { const p = require.resolve(path.join(LIB, name)); require.cache[p] = new Module(p); Object.assign(require.cache[p], { filename: p, loaded: true, exports }); };
const quiet = (o) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : async () => ({})) });

// ---- the store, in memory
const mem = new Map();
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
fake('store.js', {
  async readJSON(p, d) { return mem.has(p) ? clone(mem.get(p)) : d; },
  async writeJSON(p, d) { mem.set(p, clone(d)); return { ok: true }; },
  async readJSONTagged(p, d) { return { data: mem.has(p) ? clone(mem.get(p)) : d, etag: '' }; },
  async writeJSONIf(p, d) { mem.set(p, clone(d)); return { ok: true }; },
  async readRev() { return ''; }, async writeBinary() {}, async readBinary() { return null; }, async removeBinary() {},
  async createOnce(p, v) { if (mem.has(p)) return false; mem.set(p, v); return true; }, async writeLog() {}, merge3: (a, b) => b,
});
globalThis.fetch = async () => { throw new Error('no network in this test'); };
const wa = [];
fake('whatsapp.js', { loadConfig: async () => ({ numbers: {} }), readyNumbers: () => [], sendWhatsApp: async (o) => { wa.push(o); return { sent: true }; }, sendMedia: async (o) => { wa.push(o); return { sent: true }; } });
fake('push.js', quiet({}));
fake('meta-capi.js', quiet({ soon: async () => {}, laterEvent: async () => {} }));
// myPOS: each payment request made (by its booking text), its status (by its code)
const MADE = [], STATUS = {};
fake('mypos.js', quiet({ loadConn: async () => ({ clientId: 'c1', devices: [] }), connected: () => true, listTransactions: async () => [], listEvents: async () => [] }));
fake('mypos-requests.js', quiet({
  active: async () => ({ live: true }),
  create: async (c, { orderId, amount, title }) => { const code = 'RQ-' + orderId; MADE.push({ booking: orderId, amount, title, code }); STATUS[code] = { status: 'Pending', amount, currency: 'RON', bookingText: orderId }; return { code, url: 'https://mypos.com/pr/' + code }; },
  findByOrder: async (c, booking) => MADE.filter((m) => m.booking === booking).map((m) => ({ code: m.code, url: 'https://mypos.com/pr/' + m.code, status: STATUS[m.code].status, amount: m.amount })),
  status: async (c, code) => STATUS[code],
}));
fake('mypos-ipc.js', quiet({ load: async () => ({}), ready: () => false, paymentStatus: async () => null }));
const rings = [];
fake('notify.js', quiet({ adminIds: async () => ['owner'], deskIds: async () => ['desk'], notifyMany: async (s, ids, n) => { rings.push(Object.assign({ to: ids.join(',') }, n)); return { ok: true }; } }));

// ---- the clock, set by hand
const RealDate = Date;
let NOW = RealDate.parse('2026-11-28T10:00:00Z');
class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
globalThis.Date = FakeDate;
const at = (min) => new RealDate(RealDate.parse('2026-11-28T10:00:00Z') + min * 60e3).toISOString();
const setMin = (min) => { NOW = RealDate.parse(at(min)); };
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

let ok = 0; const fails = [];
const check = (name, cond, more) => { if (cond) { ok++; console.log('ok   ' + name); } else { fails.push(name); console.log('FAIL ' + name + (more ? ' → ' + JSON.stringify(more) : '')); } };

const P = require(path.join(LIB, 'pay.js'));
// an order of the shop, her name and phone given, no myPOS page yet
const order = (id, o) => {
  const x = Object.assign({ id, key: 'k-' + id, kind: 'treatment', ref: 'hifu-o-zona-mica-faciala-1-sedinta', status: 'open', provider: 'requests', city: 'Timișoara', title: 'Comandă online: Pachet', name: 'Proba', phone: '+40700000' + String(300 + mem.size), createdAt: at(0) }, o);
  mem.set('data/pay/' + id + '.json', x);
  const open = mem.get('data/pay-open.json') || []; open.push({ id, at: x.createdAt, amount: x.amount }); mem.set('data/pay-open.json', open);
  return x;
};
const get = (id) => mem.get('data/pay/' + id + '.json');
const madeFor = (booking) => MADE.filter((m) => m.booking === booking);
const ringsOf = (title) => rings.filter((r) => String(r.title).startsWith(title));
const paidList = () => mem.get('data/pay-paid.json') || [];

(async () => {
  // ---- the split itself: equal parts of whole lei, none above 990, the bani on the last, the sum kept
  const sum = (a) => Math.round(a.reduce((t, x) => t + x.amount, 0) * 100) / 100;
  const s2120 = P.splitParts(2120), s3200 = P.splitParts(3200), s1215 = P.splitParts(1215), s991 = P.splitParts(991), s1215h = P.splitParts(1215.5);
  check('split: 2.120 lei in 3 parts 707 + 707 + 706', JSON.stringify(s2120.map((x) => x.amount)) === '[707,707,706]', s2120);
  check('split: 3.200 lei in 4 parts of 800', JSON.stringify(s3200.map((x) => x.amount)) === '[800,800,800,800]', s3200);
  check('split: 1.215 lei in 608 + 607, 991 in 496 + 495, 1.215,50 in 608 + 607,50', JSON.stringify(s1215.map((x) => x.amount)) === '[608,607]' && JSON.stringify(s991.map((x) => x.amount)) === '[496,495]' && JSON.stringify(s1215h.map((x) => x.amount)) === '[608,607.5]');
  check('split: every part at most 990 lei and the parts add up to the sum', [s2120, s3200, s1215, s991, s1215h].every((s) => s.every((x) => x.amount <= 990)) && sum(s2120) === 2120 && sum(s3200) === 3200 && sum(s1215h) === 1215.5);
  check('split: 990 lei and less is one payment (no parts)', P.partsOf({ provider: 'requests', amount: 990 }) === null && P.partsOf({ provider: 'embedded', amount: 2120 }) === null);

  // ---- A: 2.120 lei paid in 3 parts, one after another: each its own myPOS page, the order paid with the last, for its whole sum
  const A = order('C360-testpartsaa', { amount: 2120 });
  setMin(1);
  const l1 = await P.link(A.id, A.key);
  check('A: her first page is part 1 of 3, 707 lei, its own booking text', l1.ok && l1.part && l1.part.n === 1 && l1.part.count === 3 && l1.part.amount === 707 && madeFor(A.id + '-t1').length === 1 && madeFor(A.id + '-t1')[0].amount === 707, { l1, MADE });
  check('A: the request says which part it is', /^Plata 1 din 3 · /.test(madeFor(A.id + '-t1')[0].title));
  check('A: the order keeps its parts and the request of part 1', Array.isArray(get(A.id).parts) && get(A.id).parts.length === 3 && get(A.id).request.part === 1);
  const l1b = await P.link(A.id, A.key);
  check('A: asked again, the same page (never a second request)', l1b.url === l1.url && MADE.length === 1);
  const c0 = await P.check(A.id, A.key);
  check('A: not paid yet: open, the part to pay said', !c0.paid && c0.status === 'open' && c0.part && c0.part.n === 1 && c0.part.paid === 0, c0);
  STATUS['RQ-' + A.id + '-t1'].status = 'Paid';
  setMin(3);
  const c1 = await P.check(A.id, A.key); await settle();
  check('A: part 1 paid: not the order yet; her page hears part 2 of 3, 707 lei, 1.413 left', !c1.paid && c1.partPaid && c1.part.paid === 1 && c1.part.n === 2 && c1.part.amount === 707 && c1.part.left === 1413, c1);
  check('A: the order is still open, part 1 marked paid, its request let go for the next one', get(A.id).status === 'open' && !!get(A.id).parts[0].paidAt && !get(A.id).request && get(A.id).partsPaid === 1);
  check('A: part 1\'s money is on the paid list (no other matcher takes it)', paidList().some((x) => x.id === A.id + '-t1' && x.amount === 707 && x.refs.includes('RQ-' + A.id + '-t1')));
  const c1b = await P.check(A.id, A.key); await P.sweep({ fresh: true }); await P.sweep();
  check('A: asked again and the clock\'s rounds: part 1 counted once', get(A.id).partsPaid === 1 && paidList().filter((x) => x.id === A.id + '-t1').length === 1 && !c1b.paid);
  const l2 = await P.link(A.id, A.key);
  check('A: the next page is part 2, a new request', l2.ok && l2.part.n === 2 && madeFor(A.id + '-t2').length === 1 && l2.url !== l1.url);
  STATUS['RQ-' + A.id + '-t2'].status = 'Paid';
  setMin(5); const sw = await P.sweep({ fresh: true }); await settle();
  check('A: part 2 paid seen by the clock (she is away): counted, the order still open', sw.parts === 1 && get(A.id).partsPaid === 2 && get(A.id).status === 'open', sw);
  const l3 = await P.link(A.id, A.key);
  check('A: part 3 is the rest, 706 lei', l3.ok && l3.part.n === 3 && l3.part.amount === 706 && madeFor(A.id + '-t3')[0].amount === 706);
  STATUS['RQ-' + A.id + '-t3'].status = 'Paid';
  setMin(7); const c3 = await P.check(A.id, A.key); await settle();
  check('A: the last part pays the order: paid, for its whole 2.120 lei', c3.paid === true && get(A.id).status === 'paid' && get(A.id).partsPaid === 3, { c3, st: get(A.id).status });
  check('A: the order\'s money on the paid list once, the whole sum', paidList().filter((x) => x.id === A.id).length === 1 && paidList().find((x) => x.id === A.id).amount === 2120);
  check('A: the last part on the paid list under its own sum (the matchers see the 706 lei)', paidList().filter((x) => x.id === A.id + '-t3').length === 1 && paidList().find((x) => x.id === A.id + '-t3').amount === 706);
  check('A: no alarm (no other sum, no double)', !rings.some((r) => /ALTĂ SUMĂ|DUBLĂ/.test(r.title)), rings.map((r) => r.title));
  const l4 = await P.link(A.id, A.key);
  check('A: paid: no new page', l4.error === 'already_paid' && !madeFor(A.id + '-t4').length);

  // ---- B: 990 lei: one payment as before (its booking text is the order id)
  const B = order('C360-testpartsbb', { amount: 990 });
  const lb = await P.link(B.id, B.key);
  check('B: 990 lei is one page, the order id as its booking text, no parts', lb.ok && !lb.part && madeFor(B.id).length === 1 && madeFor(B.id)[0].amount === 990 && !get(B.id).parts);

  // ---- C: 3.200 lei, part 1 paid, then she stops: never lost. Her lead says what came in; 2 hours on, the desk hears it once
  const C = order('C360-testpartscc', { amount: 3200, kind: 'shop', ref: '', phone: '+40700000391', createdAt: at(10) });
  setMin(11); await P.link(C.id, C.key);
  STATUS['RQ-' + C.id + '-t1'].status = 'Paid';
  setMin(12); await P.check(C.id, C.key); await settle();
  check('C: part 1 of 4 paid (800 lei)', get(C.id).partsPaid === 1 && get(C.id).status === 'open');
  const toClinic = await P.toClinic(C.id, C.key);
  check('C: „pay at the clinic” is refused once a part is paid online', !!toClinic.error, toClinic);
  setMin(140); await P.sweep(); await settle();
  const rc = ringsOf('PLATĂ ONLINE PE JUMĂTATE');
  check('C: 2 hours without the next page: the desk and the owner hear it once, with what came in and what is left', rc.length === 1 && /800 lei din 3200/.test(rc[0].text) && /2400 lei/.test(rc[0].text), rc);
  check('C: the order ends „partial” (expired, the money kept on it)', get(C.id).status === 'expired' && get(C.id).failWhy === 'partial' && !!get(C.id).parts[0].paidAt);
  setMin(150); await P.sweep(); await settle();
  check('C: told once only', ringsOf('PLATĂ ONLINE PE JUMĂTATE').length === 1);

  // ---- D: a part that did not pass: her page hears it with the parts; 3 minutes on the desk hears what came in already
  const D = order('C360-testpartsdd', { amount: 2120, phone: '+40700000392', createdAt: at(200) });
  setMin(201); await P.link(D.id, D.key);
  STATUS['RQ-' + D.id + '-t1'].status = 'Paid';
  setMin(202); await P.check(D.id, D.key); await settle();
  await P.link(D.id, D.key);
  STATUS['RQ-' + D.id + '-t2'].status = 'Failed';
  setMin(203); const cd = await P.check(D.id, D.key); await settle();
  check('D: part 2 did not pass: her page hears it, with part 2 of 3 still to pay', cd.refused === true && cd.part && cd.part.n === 2 && cd.part.paid === 1, cd);
  setMin(207); await P.sweep({ fresh: true }); await settle();
  const rd = ringsOf('PLATA NU A TRECUT');
  check('D: the desk hears it, with the 707 lei already paid and what is left', rd.length === 1 && /707 lei din 2120/.test(rd[0].text) && /1413 lei/.test(rd[0].text), rd.map((r) => r.text));

  console.log('\n' + ok + ' ok, ' + fails.length + ' failed');
  if (fails.length) { console.log(fails.map((f) => '  - ' + f).join('\n')); process.exit(1); }
})().catch((e) => { console.error(e); process.exit(1); });
