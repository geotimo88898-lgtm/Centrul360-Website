// Which way the site pays with while the online store is being set up (28.11: its keys saved, its 1 leu test not yet made,
// and the site said „Plata online nu e pornită”): the live way keeps paying, the admin's test runs on the store, and once
// the store is switched on it pays. In memory, no network.   node qa/pay-provider.cjs   Exits 1 on a failure.
const path = require('path'), Module = require('module');
const LIB = path.join(__dirname, '..', 'api', '_lib');
const fake = (name, exports) => { const p = require.resolve(path.join(LIB, name)); require.cache[p] = new Module(p); Object.assign(require.cache[p], { filename: p, loaded: true, exports }); };
const quiet = (o) => new Proxy(o, { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : async () => ({})) });
const mem = new Map(), clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
fake('store.js', {
  async readJSON(p, d) { return mem.has(p) ? clone(mem.get(p)) : d; }, async writeJSON(p, d) { mem.set(p, clone(d)); return { ok: true }; },
  async readJSONTagged(p, d) { return { data: mem.has(p) ? clone(mem.get(p)) : d, etag: '' }; }, async writeJSONIf(p, d) { mem.set(p, clone(d)); return { ok: true }; },
  async readRev() { return ''; }, async writeBinary() {}, async readBinary() { return null; }, async removeBinary() {}, async createOnce(p, v) { if (mem.has(p)) return false; mem.set(p, v); return true; }, async writeLog() {}, merge3: (a, b) => b,
});
globalThis.fetch = async () => { throw new Error('no network'); };
fake('whatsapp.js', quiet({ loadConfig: async () => ({ numbers: {} }), readyNumbers: () => [] }));
fake('push.js', quiet({})); fake('notify.js', quiet({})); fake('meta-capi.js', quiet({ soon: async () => {}, laterEvent: async () => {} }));
fake('mypos.js', quiet({ loadConn: async () => null, listTransactions: async () => [] }));
let IPCC = {}, RQC = { live: true };
fake('mypos-ipc.js', quiet({ load: async () => IPCC, ready: (c) => !!(c && c.sid), sessionCreate: async () => ({ token: 'tok', expires: '' }), publicOf: (c) => ({ on: true, live: !!c.live && !c.sandbox, sandbox: !!c.sandbox }) }));
fake('mypos-requests.js', quiet({ active: async () => RQC }));
let ok = 0; const fails = [];
const check = (n, c, more) => { if (c) { ok++; console.log('ok   ' + n); } else { fails.push(n); console.log('FAIL ' + n + (more ? ' → ' + JSON.stringify(more) : '')); } };
const P = require(path.join(LIB, 'pay.js'));
const fresh = async () => { await new Promise((r) => setTimeout(r, 0)); };
const realNow = Date.now;
let shift = 0; Date.now = () => realNow() + shift; // the provider is kept 20 s: each case a minute later
(async () => {
  // the online store's keys saved, not yet on for the site; the payment requests live
  IPCC = { sid: '1529686', walletNumber: '40100000000', keyIndex: 1, privateKey: 'x', myposCert: 'y', live: false };
  shift += 60e3; let pv = await P.provider(), st = await P.status();
  check('store keys saved, not on: the site still pays with the live way (requests), the store waits as next', pv.name === 'requests' && pv.live && pv.next && pv.next.name === 'embedded', { name: pv.name, next: pv.next && pv.next.name });
  check('the page hears: on, live, requests (no „Plata online nu e pornită”)', st.on === true && st.live === true && st.provider === 'requests', st);
  // the admin's 1 leu test: made on the store
  mem.set(P.TEST, { orderRef: 'ref1', at: new Date().toISOString() });
  const t = await P.createOrder({ kind: 'test', ref: 'ref1', input: {} });
  check('the 1 leu test runs on the online store', t.ok && t.provider === 'embedded', t);
  // the store switched on: it pays
  IPCC = Object.assign({}, IPCC, { live: true });
  shift += 60e3; pv = await P.provider(); st = await P.status();
  check('store on: the site pays in the page', pv.name === 'embedded' && !pv.next && st.provider === 'embedded' && st.live === true, { name: pv.name, st });
  // no requests at all, the store saved but off: the store (preview only), as before
  RQC = null; IPCC = Object.assign({}, IPCC, { live: false });
  shift += 60e3; pv = await P.provider();
  check('only the store, not on: as before (the store, not live)', pv.name === 'embedded' && !pv.live, { name: pv.name, live: pv.live });
  // requests only: as before
  IPCC = {}; RQC = { live: true };
  shift += 60e3; pv = await P.provider();
  check('only the requests: as before', pv.name === 'requests' && pv.live && !pv.next);
  console.log('\n' + ok + ' ok, ' + fails.length + ' failed');
  if (fails.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
