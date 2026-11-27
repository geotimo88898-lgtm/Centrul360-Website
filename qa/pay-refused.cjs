// The checkout's payments that did not pass, and the money myPOS shows before its word (the owner, 27.11: „dai un deep dig
// pentru erori, ne-ar costa cei mai mulți bani”): checked on an in-memory store, no network, the clock set by hand.
//   node qa/pay-refused.cjs      Exits 1 on a failure.
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
fake('whatsapp.js', { loadConfig: async () => ({ numbers: {} }), readyNumbers: () => [], sendWhatsApp: async (o) => { wa.push(o); return { sent: true }; }, sendMedia: async (o) => { wa.push(o); return { sent: true }; }, uploadMedia: async () => ({ id: 'm' }) });
fake('push.js', quiet({}));
fake('meta-capi.js', quiet({ soon: async () => {}, laterEvent: async () => {} }));
// myPOS: the account's transactions (TXS) and each payment request's status (STATUS, by its code); asked counts the asks
let TXS = [];
const STATUS = {}, asked = {};
fake('mypos.js', quiet({ loadConn: async () => ({ clientId: 'c1', devices: [] }), connected: () => true, listTransactions: async () => TXS.slice(), listEvents: async () => [] }));
fake('mypos-requests.js', quiet({ active: async () => ({ live: true }), findByOrder: async () => [],
  status: async (c, code) => { asked[code] = (asked[code] || 0) + 1; return STATUS[code]; } }));
fake('mypos-ipc.js', quiet({ load: async () => ({}), ready: () => false, paymentStatus: async () => null }));
// the bell: every alert kept in `rings` (to whom: the desk or the owner)
const rings = [];
fake('notify.js', quiet({ adminIds: async () => ['owner'], deskIds: async () => ['desk'], notifyMany: async (s, ids, n) => { rings.push(Object.assign({ to: ids.join(',') }, n)); return { ok: true }; } }));

// ---- the clock, set by hand
const RealDate = Date;
let NOW = RealDate.parse('2026-11-27T10:00:00Z');
class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
globalThis.Date = FakeDate;
const at = (min) => new RealDate(RealDate.parse('2026-11-27T10:00:00Z') + min * 60e3).toISOString();
const setMin = (min) => { NOW = RealDate.parse(at(min)); };
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

let ok = 0; const fails = [];
const check = (name, cond, more) => { if (cond) { ok++; console.log('ok   ' + name); } else { fails.push(name); console.log('FAIL ' + name + (more ? ' → ' + JSON.stringify(more) : '')); } };

const P = require(path.join(LIB, 'pay.js'));
const order = (id, o) => {
  const x = Object.assign({ id, key: 'k-' + id, kind: 'shop', status: 'open', provider: 'requests', city: 'Timișoara', title: 'Comandă online: HIFU Gușă', name: 'Proba', phone: '+40700000' + String(100 + Object.keys(STATUS).length), createdAt: at(0) }, o);
  x.request = x.request || { code: 'RQ-' + id, url: 'https://mypos.com/pr/RQ-' + id, at: x.createdAt };
  mem.set('data/pay/' + id + '.json', x);
  const open = mem.get('data/pay-open.json') || []; open.push({ id, at: x.createdAt }); mem.set('data/pay-open.json', open);
  STATUS[x.request.code] = { status: 'Seen', amount: x.amount, currency: 'RON', bookingText: id };
  return x;
};
const get = (id) => mem.get('data/pay/' + id + '.json');
const leadOf = (phone) => (mem.get('data/leads.json') || []).filter((l) => l.phone && String(l.phone).replace(/\D/g, '').slice(-9) === String(phone).replace(/\D/g, '').slice(-9));
const ringsOf = (title) => rings.filter((r) => String(r.title).startsWith(title));
const newScan = () => mem.delete('data/pay-tx-scan.json');
const tx = (min, amount, ref) => ({ transaction_type: '035', sign: 'C', original_amount: String(amount), transaction_amount: String(amount), original_currency: 'RON', transaction_currency: 'RON', date: at(min).replace(/\.\d+Z$/, 'Z'), payment_reference: ref });

(async () => {
  // ---- A: the payment did not pass (2.120 lei, 26.11): her page says so at once; 3 minutes on, unpaid: the desk hears it once
  // and her lead is in the Pipeline's Site tab at once (not after 20 minutes)
  const A = order('C360-testrefusea', { amount: 2120, title: 'Comandă online: Pachet Liposonix', phone: '+40700000201' });
  STATUS[A.request.code].status = 'Failed';
  setMin(1);
  const c1 = await P.check(A.id, A.key); await settle();
  check('A: her page hears „did not pass” at once (refused), still open (she can try again on the same page)', c1.refused === true && c1.status === 'open' && !c1.paid, c1);
  check('A: the first sign is only noted (no alert, no lead yet)', !!get(A.id).refusedAt && !ringsOf('PLATA NU A TRECUT').length && !leadOf(A.phone).length);
  setMin(2); await P.sweep({ fresh: true });
  check('A: 2 minutes in, still nothing told (a new try often passes)', !ringsOf('PLATA NU A TRECUT').length && !leadOf(A.phone).length);
  setMin(4.5); await P.sweep({ fresh: true });
  const ra = ringsOf('PLATA NU A TRECUT'), la = leadOf(A.phone);
  check('A: 3 minutes on, unpaid: one alert to the desk, with the sum, what to say and where she is', ra.length === 1 && ra[0].to === 'desk' && /2120 lei/.test(ra[0].title) && ra[0].tone === 'bad' && ra[0].go === 'pipeline' && /alt card/.test(ra[0].text) && /Pipeline, la Site/.test(ra[0].text), ra);
  check('A: her lead at once, „Plata nu a trecut”, the sum, what to offer, no message to her', la.length === 1 && la[0].source === 'site' && /^Plata nu a trecut: Pachet Liposonix/.test(la[0].interest) && la[0].value === 2120 && !wa.length, la[0]);
  check('A: the order knows its lead and that it was told', get(A.id).leadId === (la[0] && la[0].id) && !!get(A.id).refusedTold);
  setMin(6); await P.sweep({ fresh: true }); await P.sweep(); await P.check(A.id, A.key); await settle();
  setMin(30); await P.sweep();
  check('A: told once only (more rounds, her page asking again, the 20-minute leads)', ringsOf('PLATA NU A TRECUT').length === 1 && leadOf(A.phone).length === 1);

  // ---- A2: it did not pass, she reopened the page (myPOS says „Seen” again) and left: still told
  const A2 = order('C360-testrefusea2', { amount: 990, kind: 'card', title: 'Card de Sărbători 990', phone: '+40700000202', createdAt: at(30) });
  STATUS[A2.request.code].status = 'Failed';
  setMin(31); await P.sweep({ fresh: true });
  STATUS[A2.request.code].status = 'Seen';
  setMin(35); await P.sweep({ fresh: true });
  const ra2 = ringsOf('PLATA NU A TRECUT').filter((r) => /990 lei/.test(r.title));
  check('A2: refused, then her page reopened: told all the same, a card order too (its lead says it did not pass)', ra2.length === 1 && leadOf(A2.phone).length === 1 && /^Plata nu a trecut/.test(leadOf(A2.phone)[0].interest), { ra2, l: leadOf(A2.phone) });

  // ---- A3: it did not pass, the second try passed within 3 minutes: nobody is told it did not pass
  const A3 = order('C360-testrefusea3', { amount: 63, kind: 'treatment', ref: 'epilare-areole-mamare-f', title: 'Tratament online: Epilare areole', phone: '+40700000203', createdAt: at(40) });
  STATUS[A3.request.code].status = 'Failed';
  setMin(41); await P.sweep({ fresh: true });
  STATUS[A3.request.code].status = 'Paid';
  setMin(42); await P.sweep({ fresh: true }); await settle();
  setMin(46); await P.sweep({ fresh: true }); await P.sweep(); await settle();
  check('A3: the second try passed: paid, no „did not pass” alert, no lead', get(A3.id).status === 'paid' && !ringsOf('PLATA NU A TRECUT').some((r) => /63 lei/.test(r.title)) && !leadOf(A3.phone).length, { st: get(A3.id).status, r: rings.map((r) => r.title) });

  // ---- B: the money in the account (an online payment of its sum, 3 minutes after her page), myPOS's word about the order not
  // yet (27.11: 07:07 paid, „Seen” until 07:36): her page says it is being confirmed, no „unpaid” lead, asked every minute
  const B = order('C360-testprobb', { amount: 510, phone: '+40700000204', createdAt: at(100) });
  TXS = [tx(103, 510, 'REFB1')];
  setMin(104); newScan(); const sb = await P.sweep({ fresh: true });
  check('B: the payment of its sum after her page: the order is „probable”, with the payment', get(B.id).probable && get(B.id).probable.ref === 'REFB1' && sb.probable && sb.probable.marked === 1, { p: get(B.id).probable, sb });
  const cb = await P.check(B.id, B.key);
  check('B: her page says it is being confirmed (not paid, not failed)', cb.confirming === true && !cb.paid && cb.status === 'open', cb);
  setMin(125); const n0 = asked[B.request.code]; await P.sweep({ fresh: true }); await P.sweep();
  check('B: 25 minutes on: no „Comandă neplătită” lead for her', !leadOf(B.phone).length, leadOf(B.phone));
  check('B: still asked every minute after 15 quiet minutes (until myPOS says so)', asked[B.request.code] > n0);
  setMin(150); newScan(); await P.sweep({ fresh: true });
  check('B: a later scan does not mark it again nor another order', get(B.id).probable.ref === 'REFB1' && !ringsOf('PLATĂ ÎN MYPOS NECONFIRMATĂ').length);
  setMin(200); await P.sweep();
  const rb = ringsOf('PLATĂ ÎN MYPOS NECONFIRMATĂ');
  check('B: 90 minutes without myPOS\'s word: the owner hears it once, with the sum and the hour', rb.length === 1 && rb[0].to === 'owner' && /510 lei/.test(rb[0].title) && /13:43/.test(rb[0].text), rb);
  setMin(206); await P.sweep(); await P.sweep();
  const lb = leadOf(B.phone);
  const nb = lb[0] ? (lb[0].activities || []).map((x) => x.text).join(' ') : '';
  check('B: then her lead, „Plată de verificat”, saying to look in myPOS first; told once', ringsOf('PLATĂ ÎN MYPOS NECONFIRMATĂ').length === 1 && lb.length === 1 && /^Plată de verificat: HIFU Gușă/.test(lb[0].interest) && /Uită-te în myPOS cine a plătit/.test(nb) && /13:43/.test(nb), lb[0]);
  STATUS[B.request.code].status = 'Paid';
  setMin(207); await P.sweep(); await settle();
  check('B: myPOS\'s word comes: paid', get(B.id).status === 'paid');

  // ---- C: a payment of the sum of a paid order (its word came first): not another order's
  const C = order('C360-testprobc', { amount: 290, phone: '+40700000205', createdAt: at(300) });
  mem.set('data/pay-paid.json', (mem.get('data/pay-paid.json') || []).concat({ id: 'C360-paidelse', amount: 290, at: at(302), refs: [] }));
  TXS = [tx(301, 290, 'REFC1')];
  setMin(303); newScan(); await P.sweep({ fresh: true });
  check('C: a payment a paid order of that sum explains: the open one is not marked', !get(C.id).probable);

  // ---- D: two open orders of the same sum: neither is marked (whose it is, only myPOS says)
  const D1 = order('C360-testprobd1', { amount: 145, phone: '+40700000206', createdAt: at(400) });
  const D2 = order('C360-testprobd2', { amount: 145, phone: '+40700000207', createdAt: at(401) });
  TXS = [tx(403, 145, 'REFD1')];
  setMin(404); newScan(); await P.sweep({ fresh: true });
  check('D: two open orders of that sum: neither is marked', !get(D1.id).probable && !get(D2.id).probable);

  // ---- E: a payment the card's PayLinks took already: not the checkout's
  const E = order('C360-testprobe', { amount: 980, phone: '+40700000208', createdAt: at(500) });
  mem.set('data/card-sarbatori.json', [{ id: 'cardx', status: 'platit', match: { src: 'mypos', ref: 'REFE1', at: at(502) } }]);
  TXS = [tx(502, 980, 'REFE1')];
  setMin(503); newScan(); await P.sweep({ fresh: true });
  check('E: a payment the card\'s matcher took: the open order of that sum is not marked', !get(E.id).probable);

  // ---- F: a payment of the sum more than an hour after her last sign of life: not taken for hers
  const F = order('C360-testprobf', { amount: 1470, phone: '+40700000209', createdAt: at(600) });
  TXS = [tx(675, 1470, 'REFF1')];
  setMin(676); newScan(); await P.sweep({ fresh: true });
  check('F: a payment 75 minutes after her last sign: not marked', !get(F.id).probable);

  // ---- G: the scan is not run more than every 2 minutes
  const G = order('C360-testprobg', { amount: 333, phone: '+40700000210', createdAt: at(700) });
  TXS = [tx(702, 333, 'REFG1')];
  setMin(702.5); newScan(); await P.sweep({ fresh: true });
  const g1 = get(G.id).probable;
  check('G: marked by the first scan', g1 && g1.ref === 'REFG1');
  // ---- H: a try that did not pass hours ago (found by the first rounds after this version goes live): not told now
  const Hh = order('C360-testrefuseh', { amount: 777, phone: '+40700000211', createdAt: at(800) });
  STATUS[Hh.request.code].status = 'Failed';
  setMin(800 + 5 * 60); await P.sweep(); setMin(800 + 5 * 60 + 6); await P.sweep();
  check('H: a try of 5 hours ago that did not pass: nobody is called now', !get(Hh.id).refusedAt && !ringsOf('PLATA NU A TRECUT').some((r) => /777 lei/.test(r.title)));
  console.log('\n' + ok + ' ok, ' + fails.length + ' failed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
