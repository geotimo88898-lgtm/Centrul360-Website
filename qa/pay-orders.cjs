// Admin → Site → Comenzi și plăți (api/_lib/pay-orders.js, api/_lib/pay-winback.js sendOne): the rows and their states, the
// totals, one order's details, the win-back message for one order by hand, the gift on the day of the message. In memory, no
// network, the clock by hand (the harness of qa/pay-winback.cjs).
//   node qa/pay-orders.cjs      Exits 1 on a failure.
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
const O = require(path.join(LIB, 'pay-orders.js'));
const APPROVED = async () => ({ state: 'APPROVED' });
const sent = [];
const deps = (more) => Object.assign({ template: APPROVED, words: async (o) => [STATUS[o.request.code].status], send: async (o, vars, w) => { sent.push({ id: o.id, vars, w }); return { sent: true, id: 'm' + sent.length, city: o.city }; } }, more || {});

(async () => {
  // ---- the rows: every state in words; the newest first; the test orders left out
  order('C360-poaaa1', { phone: '+40700000401', name: 'Ana Proba', status: 'paid', paidAt: '2026-11-27T09:00:00.000Z', createdAt: '2026-11-27T08:50:00.000Z', src: { tag: { source: 'facebook', medium: 'paid', campaign: 'c360 site tm' } } });
  order('C360-poaaa0', { phone: '+40700000401', name: 'Ana Proba', status: 'expired', createdAt: '2026-11-27T08:30:00.000Z' });
  order('C360-pobbb1', { phone: '+40700000402', name: 'Bia Proba', status: 'open', refusedAt: '2026-11-27T09:10:00.000Z', createdAt: '2026-11-27T09:05:00.000Z' });
  order('C360-poccc1', { phone: '+40700000403', name: 'Cora Proba', status: 'open', probable: { ref: 'tx', at: '2026-11-27T09:20:00.000Z' }, createdAt: '2026-11-27T09:15:00.000Z' });
  order('C360-poddd1', { phone: '+40700000404', name: 'Dana Proba', status: 'expired', failWhy: 'clinic', createdAt: '2026-11-27T07:00:00.000Z' });
  order('C360-poeee1', { phone: '+40700000405', name: 'Ema Proba', status: 'open', createdAt: '2026-11-27T10:20:00.000Z' });
  order('C360-pofff1', { phone: '+40700000406', name: 'Flori Proba', status: 'expired', createdAt: '2026-11-26T10:00:00.000Z', amount: 320, full: 640 });
  order('C360-poggg1', { phone: '+40700000407', test: true });
  const L = await O.list({ days: 30 });
  const st = Object.fromEntries(L.rows.map((r) => [r.id, r.state]));
  check('the states: paid, a try before her payment („a plătit altă comandă”), refused, money to match in myPOS, at the clinic, in progress, unfinished',
    st['C360-poaaa1'] === 'paid' && st['C360-poaaa0'] === 'later' && st['C360-pobbb1'] === 'refused' && st['C360-poccc1'] === 'checking' && st['C360-poddd1'] === 'clinic' && st['C360-poeee1'] === 'open' && st['C360-pofff1'] === 'unfinished', st);
  check('newest first, the test order left out', L.rows[0].id === 'C360-poeee1' && !L.rows.some((r) => r.id === 'C360-poggg1'), L.rows.map((r) => r.id));
  check('the source in words (a Facebook ad), the tries of a phone (Ana: 2)', L.rows.find((r) => r.id === 'C360-poaaa1').src === 'Reclamă Facebook/Instagram' && L.rows.find((r) => r.id === 'C360-poaaa1').tries === 2);
  check('the totals: 1 paid (145 lei), lost: the refused and the unfinished (2 orders, 465 lei, 2 people), 1 to check, 1 in progress',
    L.totals.paid === 1 && L.totals.paidLei === 145 && L.totals.lost === 2 && L.totals.lostLei === 465 && L.totals.lostPeople === 2 && L.totals.checking === 1 && L.totals.open === 1, L.totals);
  check('the message button: on the refused, the unfinished, the one in progress; never on the paid, the earlier try of a paying phone, the clinic, money to match in myPOS',
    ['C360-pobbb1', 'C360-pofff1', 'C360-poeee1'].every((id) => L.rows.find((r) => r.id === id).canMsg) && ['C360-poaaa1', 'C360-poaaa0', 'C360-poddd1', 'C360-poccc1'].every((id) => !L.rows.find((r) => r.id === id).canMsg));

  // ---- one order, all of it
  const D = await O.detail('C360-pobbb1');
  check('the details: the steps in order (began, the page made, refused), the message ready with her first name', D.steps[0].t === 'A început plata' && D.steps.some((s) => /nu a trecut/.test(s.t)) && /^Bună, Bia!/.test(D.message), D.steps);

  // ---- the message by hand: sent once a day per phone, never paid, never in the quiet hours, never a template not approved
  const r1 = await W.sendOne('C360-pofff1', { by: 'admin:x', deps: deps() });
  check('sent: her first name, what she chose, her link', r1.ok && sent.length === 1 && sent[0].vars.prenume === 'Flori' && /^C360-pofff1\./.test(sent[0].w), r1);
  const r2 = await W.sendOne('C360-pofff1', { deps: deps() });
  check('a second tap the same day: not sent again', r2.error === 'sent_today' && sent.length === 1, r2);
  const L2 = await O.list({ days: 30 });
  check('the row shows the message (when, by hand) and no button today', L2.rows.find((r) => r.id === 'C360-pofff1').msg && !L2.rows.find((r) => r.id === 'C360-pofff1').canMsg);
  check('money of her sum in myPOS (to match): never', (await W.sendOne('C360-poccc1', { deps: deps() })).error === 'checking' && sent.length === 1);
  check('a paid order: never', (await W.sendOne('C360-poaaa1', { deps: deps() })).error === 'already_paid' && sent.length === 1);
  check('an earlier try of a phone that paid since: never', (await W.sendOne('C360-poaaa0', { deps: deps() })).error === 'paid_other' && sent.length === 1);
  check('a template Meta has not approved: never', (await W.sendOne('C360-pobbb1', { deps: deps({ template: async () => ({ state: 'PENDING' }) }) })).error === 'template_pending' && sent.length === 1);
  setNow('2026-11-27T19:30:00Z');
  check('after 21:00: never (quiet hours)', (await W.sendOne('C360-pobbb1', { deps: deps({ now: Date.now() }) })).error === 'quiet_hours' && sent.length === 1);
  setNow('2026-11-27T10:30:00Z');
  STATUS['RQ-C360-pobbb1'] = { status: 'Paid', amount: 145, currency: 'RON', bookingText: 'C360-pobbb1' };
  const r3 = await W.sendOne('C360-pobbb1', { deps: deps() });
  check('myPOS says paid right before: no message, the order marked paid', r3.error === 'already_paid' && get('C360-pobbb1').status === 'paid' && sent.length === 1, r3);

  // ---- the gift goes with the message's day: a message on 28.11, paid on 28.11 → the gift; paid the day after → none
  setNow('2026-11-28T08:00:00Z'); // 10:00 in Romania
  order('C360-pohhh1', { phone: '+40700000408', name: 'Hana Proba', status: 'open', createdAt: '2026-11-27T12:00:00.000Z' });
  order('C360-poiii1', { phone: '+40700000409', name: 'Ina Proba', status: 'open', createdAt: '2026-11-27T12:00:00.000Z' });
  const rh = await W.sendOne('C360-pohhh1', { deps: deps({ now: Date.now() }) });
  const ri = await W.sendOne('C360-poiii1', { deps: deps({ now: Date.now() }) });
  check('two messages on 28.11', rh.ok && ri.ok && sent.length === 3, { rh, ri });
  const ch = await W.checkoutOf(get('C360-pohhh1'));
  check('her checkout that day shows the facial massage „Gratuit”', ch.giftOn === true, ch);
  setNow('2026-11-28T15:00:00Z');
  await P.markPaid('C360-pohhh1', { amount: 145, currency: 'RON', ref: 'tx-h', method: 'request', at: new RealDate(NOW).toISOString() }, 'status');
  check('paid the day of the message: the gift, the desk hears it, the note says the message\'s day', get('C360-pohhh1').gift && ringsOf('🎁 CADOU MASAJ FACIAL').length === 1, rings.map((r) => r.title));
  setNow('2026-11-29T08:00:00Z');
  check('her checkout the next day: no gift shown', (await W.checkoutOf(get('C360-poiii1'))).giftOn === false);
  await P.markPaid('C360-poiii1', { amount: 145, currency: 'RON', ref: 'tx-i', method: 'request', at: new RealDate(NOW).toISOString() }, 'status');
  check('paid the day after the message: no gift', !get('C360-poiii1').gift && ringsOf('🎁 CADOU MASAJ FACIAL').length === 1);

  console.log('\n' + ok + ' ok, ' + fails.length + ' failed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
