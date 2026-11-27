// The win-back of the site's unfinished payments (George, 27.11): who gets the one message, her saved checkout with the facial
// massage „Gratuit”, the tap that opens her order again, the gift on her payment. In memory, no network, the clock by hand.
//   node qa/pay-winback.cjs      Exits 1 on a failure.
const path = require('path'), Module = require('module');
const LIB = path.join(__dirname, '..', 'api', '_lib');
const fake = (name, exports) => { const p = require.resolve(path.join(LIB, name)); require.cache[p] = new Module(p); Object.assign(require.cache[p], { filename: p, loaded: true, exports }); };
const quiet = (o) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : async () => ({})) });
process.env.PORTAL_SECRET = process.env.PORTAL_SECRET || 'test-secret';

const mem = new Map();
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
fake('store.js', {
  async readJSON(p, d) { return mem.has(p) ? clone(mem.get(p)) : d; },
  async writeJSON(p, d) { if (d === null) mem.delete(p); else mem.set(p, clone(d)); return { ok: true }; },
  async readJSONTagged(p, d) { return { data: mem.has(p) ? clone(mem.get(p)) : d, etag: '' }; },
  async writeJSONIf(p, d) { mem.set(p, clone(d)); return { ok: true }; },
  async readRev() { return ''; }, async writeBinary() {}, async readBinary() { return null; }, async removeBinary() {},
  async createOnce(p, v) { if (mem.has(p)) return false; mem.set(p, v); return true; }, async writeLog() {}, merge3: (a, b) => b,
});
globalThis.fetch = async () => { throw new Error('no network in this test'); };
const wa = [];
fake('whatsapp.js', { loadConfig: async () => ({ numbers: { 'Timișoara': { wabaId: 'w1' }, Arad: { wabaId: 'w1' } } }), readyNumbers: () => ['Timișoara', 'Arad'], sendWhatsApp: async (o) => { wa.push(o); return { sent: true, id: 'wa' + wa.length }; }, sendMedia: async () => ({ sent: true }), uploadMedia: async () => ({ id: 'm' }) });
fake('push.js', quiet({}));
fake('meta-capi.js', quiet({ soon: async () => {}, laterEvent: async () => {} }));
fake('mypos.js', quiet({ loadConn: async () => ({ clientId: 'c1', devices: [] }), connected: () => true, listTransactions: async () => [], listEvents: async () => [] }));
// myPOS's payment requests: STATUS by code; create makes a new one
const STATUS = {}; let made = 0;
fake('mypos-requests.js', quiet({ active: async () => ({ live: true }), findByOrder: async () => [],
  status: async (c, code) => STATUS[code] || { status: 'Seen' },
  create: async (c, x) => { made++; const code = 'NEW' + made; STATUS[code] = { status: 'Seen', amount: x.amount, currency: 'RON', bookingText: x.orderId }; return { code, url: 'https://mypos.com/pr/' + code }; } }));
fake('mypos-ipc.js', quiet({ load: async () => ({}), ready: () => false, paymentStatus: async () => null }));
const rings = [];
fake('notify.js', quiet({ adminIds: async () => ['owner'], deskIds: async () => ['desk'], notifyMany: async (s, ids, n) => { rings.push(Object.assign({ to: ids.join(',') }, n)); return { ok: true }; } }));

const RealDate = Date;
let NOW = RealDate.parse('2026-11-27T10:30:00Z'); // 12:30 in Romania
class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
globalThis.Date = FakeDate;
const setNow = (iso) => { NOW = RealDate.parse(iso); };

let ok = 0; const fails = [];
const check = (name, cond, more) => { if (cond) { ok++; console.log('ok   ' + name); } else { fails.push(name); console.log('FAIL ' + name + (more ? ' → ' + JSON.stringify(more).slice(0, 600) : '')); } };

const P = require(path.join(LIB, 'pay.js'));
const W = require(path.join(LIB, 'pay-winback.js'));
const H = require(path.join(LIB, 'booking-holds.js'));
const order = (id, o) => {
  const x = Object.assign({ id, key: 'k-' + id, kind: 'treatment', status: 'open', provider: 'requests', city: 'Timișoara', title: 'Tratament online: HIFU Gușă', name: 'Proba Test', amount: 145, full: 290, createdAt: '2026-11-26T10:00:00.000Z' }, o);
  if (x.request !== null && !x.request) x.request = { code: 'RQ-' + id, url: 'https://mypos.com/pr/RQ-' + id, at: x.createdAt };
  if (x.request === null) delete x.request;
  if (x.request) STATUS[x.request.code] = STATUS[x.request.code] || { status: 'Seen', amount: x.amount, currency: 'RON', bookingText: id };
  mem.set('data/pay/' + id + '.json', x);
  mem.set('data/pay-index.json', (mem.get('data/pay-index.json') || []).concat({ id, at: x.createdAt, kind: x.kind }));
  if (x.status === 'open') mem.set('data/pay-open.json', (mem.get('data/pay-open.json') || []).concat({ id, at: x.createdAt }));
  return x;
};
const get = (id) => mem.get('data/pay/' + id + '.json');
const ringsOf = (t) => rings.filter((r) => String(r.title).startsWith(t));

(async () => {
  // ---- who gets it: one per phone (her newest unpaid order), never the paid, the booked, the test, the test number, a paid card
  const hA = await H.add({ key: 'kA', city: 'Arad', svc: { id: 'custom', title: 'Prima ședință · comandă online: HIFU Gușă', price: 145, old: 290, minutes: 15, cat: 'faciale', treatment: 'hifu-o-zona-mica-faciala-1-sedinta' },
    cart: { items: [{ id: 'hifu', zone: 'Gușă' }], visit: 'first' }, date: '2026-11-30', time: '12:00', endTime: '12:15', contact: { name: 'Ana Proba', phone: '+40700000301' } });
  order('C360-wbaaold1', { phone: '+40700000301', name: 'Ana Proba', status: 'expired', amount: 2120, kind: 'shop', ref: 'nohold', createdAt: '2026-11-25T19:00:00.000Z' });
  const A = order('C360-wbaaa1', { phone: '+40700000301', name: 'Ana Proba', kind: 'shop', ref: hA.id, city: 'Arad', title: 'Comandă online: HIFU Gușă', amount: 145, full: 290, status: 'expired', createdAt: '2026-11-26T08:00:00.000Z' });
  order('C360-wbbbb1', { phone: '+40700000302', status: 'paid', paidAt: '2026-11-26T09:00:00.000Z' });
  order('C360-wbbbb2', { phone: '+40700000302', status: 'open' });
  order('C360-wbccc1', { phone: '+40700000303', test: true });
  order('C360-wbddd1', { phone: '+40700000304' });
  mem.set('data/appointments.json', [{ id: 'ap-d', clientPhone: '+40700000304', date: '2026-11-28', time: '10:00', status: 'programata' }]);
  order('C360-wbeee1', { phone: '0700000000' });
  order('C360-wbfff1', { phone: '+40700000306', kind: 'card', ref: 'card-f', title: 'Card de Sărbători 990', amount: 990, full: 990 });
  mem.set('data/card-sarbatori.json', [{ id: 'card-f', phone: '+40700000306', status: 'platit' }]);
  // George's word: an order left out (its phone gets nothing); money of hers in Încasări today (at the clinic)
  order('C360-mwxxsl1943dc13f2', { phone: '+40700000310', amount: 2120, kind: 'shop', ref: 'nohold2' });
  order('C360-wbsss1', { phone: '+40700000311' });
  mem.set('data/sales.json', [{ id: 's1', clientPhone: '+40700000311', amount: 300, createdAt: '2026-11-27T08:00:00.000Z' }]);
  const G = order('C360-wbggg1', { phone: '+40700000307', name: 'Gina Proba', amount: 990, kind: 'card', ref: 'card-g', title: 'Card de Sărbători 990', full: 990, status: 'open' });
  const { list, skipped } = await W.recipients();
  const ids = list.map((r) => r.order.id).sort();
  check('who: one per phone, her newest unpaid order (Ana: 145, not the 2.120 of the day before), the card that waits (Gina)', JSON.stringify(ids) === JSON.stringify(['C360-wbaaa1', 'C360-wbggg1']), { ids, skipped });
  check('who not: a phone that paid another order, one with a booking from today on, a paid card, the one George left out, one paying at the clinic today; the test order and the test number not even counted',
    ['a_platit_alta_comanda', 'are_programare', 'card_platit', 'exclusa_de_george', 'incasare_azi'].every((w) => skipped.some((s) => s.why === w)) && skipped.length === 5, skipped);

  // ---- the message: dry says who, nothing sent; the template not approved: nothing sent
  const dry = await W.send({ go: false, deps: { template: async () => ({ state: 'PENDING' }) } });
  check('dry run: 2 would get it, nothing sent, nothing written', dry.items.filter((x) => x.would === 'send').length === 2 && !wa.length && !mem.has(W.KEY), dry);
  const wait = await W.send({ go: true, deps: { template: async () => ({ state: 'PENDING' }) } });
  check('not approved by Meta yet: nothing sent', wait.error === 'template_pending' && !wa.length, wait);
  setNow('2026-11-27T19:30:00Z'); // 21:30 in Romania
  const late = await W.send({ go: true, deps: { template: async () => ({ state: 'APPROVED' }) } });
  check('after 21:00: nothing sent (quiet hours)', late.error === 'quiet_hours' && !wa.length, late);
  setNow('2026-11-27T10:30:00Z');
  // myPOS says one is paid right before: not sent, marked paid
  STATUS['RQ-C360-wbggg1'] = { status: 'Paid', amount: 990, currency: 'RON', bookingText: 'C360-wbggg1' };
  const sentTo = [];
  const r1 = await W.send({ go: true, deps: { template: async () => ({ state: 'APPROVED' }), words: async (o) => [STATUS[o.request.code].status], send: async (o, vars, w) => { sentTo.push({ id: o.id, vars, w }); return { sent: true, id: 'm1', city: o.city }; } } });
  check('sent: one message to Ana, with her first name, what she chose (no „Comandă online”) and her link', r1.sent === 1 && sentTo.length === 1 && sentTo[0].id === 'C360-wbaaa1' && sentTo[0].vars.prenume === 'Ana' && sentTo[0].vars.serviciu === 'HIFU Gușă' && W.fromW(sentTo[0].w) === 'C360-wbaaa1', { r1, sentTo });
  check('myPOS said Paid right before: Gina not messaged', r1.skipped.some((s) => s.why === 'platit_in_mypos'), r1.skipped);
  const r2 = await W.send({ go: true, deps: { template: async () => ({ state: 'APPROVED' }), words: async () => ['Seen'], send: async (o) => { sentTo.push({ id: o.id }); return { sent: true }; } } });
  check('a second run: Ana never twice', !sentTo.slice(1).some((x) => x.id === 'C360-wbaaa1') && r2.skipped.some((s) => s.why === 'deja_trimis'), r2);
  check('the link: a forged or changed token is refused', W.fromW('C360-wbaaa1.AAAAAAAAAAAAAAAA') === null && W.fromW('C360-wbaaa2.' + W.token('C360-wbaaa1')) === null && W.fromW('x') === null);

  // ---- her saved checkout: the same lines, the gift „Gratuit”, the same sum
  const c = await W.checkoutOf(get('C360-wbaaa1'));
  const html = W.pageHtml(c, W.wOf('C360-wbaaa1'), 'Ana Proba');
  check('the checkout: her line (HIFU Gușă 290 → 145), the facial massage 160 → Gratuit, total 145, the saving with the gift', c.lines.length === 1 && /HIFU/.test(c.lines[0].name) && c.lines[0].price === 145 && c.lines[0].full === 290 && c.gift.full === 160 && c.amount === 145 && c.saved === 305, c);
  check('the page: her name, „Gratuit”, „Plătesc 145 lei”, the hour kept (30.11, 12:00), no long dash', /Ana, comanda ta e salvată/.test(html) && />Gratuit</.test(html) && /Plătesc 145 lei/.test(html) && /30\.11\.2026, ora 12:00/.test(html) && !/[–—]/.test(html), html.slice(0, 300));

  // ---- the tap: her order opened again (the clock had let it go), a myPOS page made again when myPOS let the old one expire
  STATUS['RQ-C360-wbaaa1'] = { status: 'Expired', amount: 145, currency: 'RON', bookingText: 'C360-wbaaa1' };
  const g = await W.go('C360-wbaaa1');
  const oa = get('C360-wbaaa1');
  check('the tap: open again, on the clock\'s list, a new myPOS page (the expired one put aside), its link', g.ok && /NEW/.test(g.url) && oa.status === 'open' && (mem.get('data/pay-open.json') || []).some((x) => x.id === 'C360-wbaaa1') && oa.request.code !== 'RQ-C360-wbaaa1' && (oa.requestsOld || []).length === 1, { g, st: oa.status, rq: oa.request });
  const g2 = await W.go('C360-wbaaa1');
  check('a second tap: the same new page (never two)', g2.ok && g2.url === g.url && made === 1, { g2, made });

  // ---- paid: the booking at her hour, the gift in its note, the desk hears it; once
  const pr = await P.markPaid('C360-wbaaa1', { amount: 145, currency: 'RON', ref: 'tx1', method: 'request', at: new RealDate(NOW).toISOString() }, 'status');
  const appt = (mem.get('data/appointments.json') || []).find((a) => a.holdId === hA.id);
  check('paid: her booking at 30.11 12:00, the gift in its note', pr.ok && appt && appt.date === '2026-11-30' && /CADOU: Masaj facial clasic/.test(appt.note || ''), { pr, appt });
  check('the desk hears the gift once; the order carries it', ringsOf('🎁 CADOU MASAJ FACIAL').length === 1 && get('C360-wbaaa1').gift && get('C360-wbaaa1').gift.name === 'Masaj facial clasic', rings.map((r) => r.title));
  await W.onPaid('C360-wbaaa1');
  check('the gift is never given twice', ringsOf('🎁 CADOU MASAJ FACIAL').length === 1);

  // ---- an hour that passed before she paid: no booking in the past, the money in Încasări, the desk calls her for an hour
  const hP = await H.add({ key: 'kP', city: 'Timișoara', svc: { id: 'custom', title: 'Prima ședință · comandă online: HIFU Gușă', price: 145, old: 290, minutes: 15, cat: 'faciale', treatment: 'hifu-o-zona-mica-faciala-1-sedinta' },
    cart: { items: [{ id: 'hifu', zone: 'Gușă' }], visit: 'first' }, date: '2026-11-26', time: '12:00', endTime: '12:15', contact: { name: 'Pia Proba', phone: '+40700000308' } });
  order('C360-wbppp1', { phone: '+40700000308', name: 'Pia Proba', kind: 'shop', ref: hP.id, title: 'Comandă online: HIFU Gușă', amount: 145, status: 'open' });
  const before = (mem.get('data/appointments.json') || []).length;
  const pp = await P.markPaid('C360-wbppp1', { amount: 145, currency: 'RON', ref: 'tx2', method: 'request', at: new RealDate(NOW).toISOString() }, 'status');
  check('her hour had passed: no booking in the past, the desk told to call her for an hour, the money in Încasări', pp.ok && (mem.get('data/appointments.json') || []).length === before && ringsOf('PLĂTIT ONLINE, ORA E DE ALES').length === 1 && (mem.get('data/sales.json') || []).some((x) => Math.abs(Number(x.amount) - 145) < 0.01), rings.map((r) => r.title));
  check('not messaged: no gift', !get('C360-wbppp1').gift && ringsOf('🎁 CADOU MASAJ FACIAL').length === 1);

  // ---- after the gift's end (Friday 23:59): paid, no gift
  order('C360-wblll1', { phone: '+40700000309', kind: 'treatment', ref: 'x', status: 'open' });
  mem.set(W.KEY, Object.assign(mem.get(W.KEY), { sent: mem.get(W.KEY).sent.concat({ p9: '700000309', id: 'C360-wblll1', at: '2026-11-27T10:40:00.000Z' }) }));
  setNow('2026-11-27T22:30:00Z');
  await P.markPaid('C360-wblll1', { amount: 145, currency: 'RON', ref: 'tx3', method: 'request', at: new RealDate(NOW).toISOString() }, 'status');
  check('paid after Friday 23:59: no gift', !get('C360-wblll1').gift && ringsOf('🎁 CADOU MASAJ FACIAL').length === 1);

  console.log('\n' + ok + ' ok, ' + fails.length + ' failed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
