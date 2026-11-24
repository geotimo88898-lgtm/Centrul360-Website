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

// ---- the clock, set by hand
const RealDate = Date;
let NOW = RealDate.parse('2026-11-25T10:00:00Z');
class FakeDate extends RealDate { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;
globalThis.Date = FakeDate;
const setNow = (iso) => { NOW = RealDate.parse(iso); };

const C = require(path.join(LIB, 'card-sarbatori.js'));
const T = require(path.join(LIB, 'card-terms.js'));
const CI = require(path.join(LIB, 'card-image.js'));
const CC = require(path.join(LIB, 'card-creative.js'));

let ok = 0; const fails = [];
const check = (name, cond, more) => { if (cond) { ok++; console.log('ok   ' + name); } else { fails.push(name); console.log('FAIL ' + name + (more ? ' → ' + JSON.stringify(more) : '')); } };
const quietly = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

let n = 0;
function order(o) {
  const id = '00000000-0000-4000-8000-' + String(++n).padStart(12, '0');
  const r = Object.assign({ id, created: new RealDate(NOW).toISOString(), name: 'Proba Test', phone: '0700000' + String(100 + n).slice(-3), city: 'Timișoara', tier: 990, qty: 1, amount: 990, credit: 2500,
    forWho: 'eu', cards: [{ code: '', recipient: '' }], recipient: '', via: 'portal', pay: 'online', status: 'asteptare' }, o);
  r.trail = [{ at: r.created, ev: 'created' }];
  return r;
}
async function put(r) { const l = await store.readJSON(C.KEY, []); l.push(r); await store.writeJSON(C.KEY, l); return r.id; }
async function get(id) { return (await store.readJSON(C.KEY, [])).find((x) => x.id === id); }
const saleOf = async (id) => (await store.readJSON('data/sales.json', [])).find((s) => s.cardOrderId === id && s.kind !== 'refund');
const switchOn = (at) => store.writeJSON(T.BF_KEY, { on: true, at, by: 'test', log: [{ on: true, at, by: 'test' }] });
const switchOff = () => store.writeJSON(T.BF_KEY, { on: false, at: '2026-11-24T07:00:00Z', by: 'test', log: [{ on: false, at: '2026-11-24T07:00:00Z', by: 'test' }] });

(async () => {
  const OUT = process.env.OUT || '';
  // ---- the terms
  check('terms: 490 → 1.000, 990 → 2.500, VIP 9.900 → 30.000 (online 8.910), on sale 490 / 990 / VIP', T.CARD_TERMS.tiers[490] === 1000 && T.CARD_TERMS.tiers[990] === 2500 && T.CARD_TERMS.tiers[9900] === 30000 && T.discOf(9900) === 8910 && C.SALE.join() === '490,990,9900' && C.TIERS === T.CARD_TERMS.tiers);
  check('window: 24.11 10:00 to 27.11 23:59:59 (Romania)', T.BF.start === '2026-11-24T08:00:00.000Z' && T.BF.end === '2026-11-27T21:59:59.000Z' && T.inWindow(RealDate.parse('2026-11-27T21:59:59Z')) && !T.inWindow(RealDate.parse('2026-11-27T22:00:00Z')) && !T.inWindow(RealDate.parse('2026-11-24T07:59:59Z')));
  check('the switch is off until the owner says (no file)', (await T.bfActive()) === false && (await T.bfSwitch()).on === false);

  // ---- switch on, inside the window
  await switchOn('2026-11-24T09:00:00Z');
  setNow('2026-11-25T10:00:00Z');
  check('bfActive inside the window with the switch on', (await T.bfActive()) === true);
  const pub = C.publicCount(await C.count(await store.readJSON(C.KEY, [])));
  check('GET answer (publicCount): bf { on, until, tier 990, creditOnline 3000, creditClinic 2500 }', pub.bf && pub.bf.on === true && pub.bf.until === T.BF.end && pub.bf.tier === 990 && pub.bf.creditOnline === 3000 && pub.bf.creditClinic === 2500, pub.bf);

  // a 990 order made in the window, paid online (the checkout's signed word) 30 minutes later
  const a = await put(order({}));
  setNow('2026-11-25T10:30:00Z');
  const pa = await quietly(() => C.confirm(a, 'online', { by: 'myPOS', byName: 'myPOS (plata pe site)', amount: 990, method: 'card', match: { src: 'checkout', ref: 'checkout-t1', at: new RealDate(NOW).toISOString() } }));
  const ra = await get(a), sa = await saleOf(a);
  check('990 made in the window, paid online: the card 3.000, the order credit 3.000, its trail „bf”', ra.status === 'platit' && ra.cards[0].value === 3000 && ra.credit === 3000 && ra.bf && ra.bf.credit === 3000 && ra.trail.some((e) => e.ev === 'bf'), { value: ra.cards[0].value, credit: ra.credit });
  check('… Încasări: the sale is 990 lei (card), its line says credit 3.000 (Black Friday)', sa && sa.amount === 990 && sa.method === 'card' && /credit 3\.000 lei \(Black Friday, plata online\)/.test(sa.treatment), sa && sa.treatment);
  const txt = C.cardText(ra, ra.cards[0]);
  check('… her card\'s message: credit de 3.000 lei', /credit de 3\.000 lei/.test(txt.text) && txt.vars.credit === '3.000', txt.vars);
  const png = await C.image(ra, ra.cards[0]);
  check('… her card\'s picture made with 3.000 (kept for the chat)', png && png.length > 1000 && bin.has('wa-out/card-' + ra.cards[0].code + '.png') && String(ra.cards[0].img || '').split('|')[2] === '3000');
  check('… the picture\'s drawing says „3.000”', /3\.000/.test(CI.svgOf({ credit: ra.cards[0].value, name: 'Proba Test', code: ra.cards[0].code })));
  if (OUT) fs.writeFileSync(path.join(OUT, 'test-card-990-bf.png'), png);
  check('… the balance and the reminders read the card\'s own value (left 3.000)', C.leftOf(ra.cards[0]) === 3000 && C.cardView(ra, ra.cards[0]).value === 3000);
  const red = await quietly(() => C.redeem(ra.cards[0].code, { items: [{ name: 'Tratament', amount: 2800 }] }, { employeeId: 'admin' }));
  check('… redeem 2.800 from it: 200 left (not 2.500 − 2.800)', red.ok && red.left === 200, red);
  check('… confirmed twice: once', (await quietly(() => C.confirm(a, 'online', { amount: 990 }))).again === true && (await store.readJSON('data/sales.json', [])).filter((s) => s.cardOrderId === a).length === 1);

  // the same, reserved and paid in the clinic
  setNow('2026-11-25T11:00:00Z');
  const b = await put(order({ pay: 'clinica', status: 'rezervat' }));
  await quietly(() => C.confirm(b, 'clinica', { by: 'e1', amount: 990, method: 'cash' }));
  const rb = await get(b);
  check('990 reserved and paid in the clinic (in the window): 2.500', rb.cards[0].value === 2500 && rb.credit === 2500 && !rb.bf && (await saleOf(b)).amount === 990, { value: rb.cards[0].value });

  // a PayLink payment matched later: the payment's own time counts
  setNow('2026-11-27T21:00:00Z');
  const c = await put(order({}));
  setNow('2026-11-30T03:00:00Z'); // the scan finds it at 05:00 RO; the payment was at 23:40 RO (inside the window)
  await quietly(() => C.confirm(c, 'online', { by: 'myPOS', amount: 990, match: { src: 'mypos', ref: 'mypos-1', at: '2026-11-27T21:40:00Z' } }));
  check('990 made Sunday 23:00 RO, PayLink paid 23:40 RO, matched by the scan at 05:00 RO: 3.000 (the payment\'s own time)', (await get(c)).cards[0].value === 3000);
  setNow('2026-11-27T21:30:00Z');
  const c2 = await put(order({}));
  setNow('2026-11-27T23:20:00Z');
  await quietly(() => C.confirm(c2, 'online', { by: 'myPOS', amount: 990, match: { src: 'checkout', ref: 'checkout-t2', at: '2026-11-27T23:20:00Z' } }));
  check('990 made Sunday 23:30 RO, paid at 01:20 RO (inside its 2 h hold, after the window): 3.000', (await get(c2)).cards[0].value === 3000);
  setNow('2026-11-27T21:30:00Z');
  const c3 = await put(order({}));
  setNow('2026-11-30T00:00:00Z');
  await quietly(() => C.confirm(c3, 'online', { by: 'myPOS', amount: 990, match: { src: 'checkout', ref: 'checkout-t3', at: '2026-11-30T00:00:00Z' } }));
  check('990 made Sunday 23:30 RO, paid 2 h 30 later (hold over, window over): 2.500', (await get(c3)).cards[0].value === 2500);

  // outside the window
  setNow('2026-11-23T12:00:00Z');
  const d = await put(order({}));
  setNow('2026-11-23T12:20:00Z');
  await quietly(() => C.confirm(d, 'online', { by: 'myPOS', amount: 990, match: { src: 'checkout', ref: 'checkout-t4', at: '2026-11-23T12:20:00Z' } }));
  check('990 made and paid online before the window: 2.500', (await get(d)).cards[0].value === 2500);
  setNow('2026-11-30T09:00:00Z');
  const d2 = await put(order({}));
  setNow('2026-11-30T09:10:00Z');
  await quietly(() => C.confirm(d2, 'online', { by: 'myPOS', amount: 990, match: { src: 'checkout', ref: 'checkout-t5', at: '2026-11-30T09:10:00Z' } }));
  check('990 made and paid online after the window: 2.500', (await get(d2)).cards[0].value === 2500);
  setNow('2026-11-30T10:00:00Z');
  check('bfActive after the window: false; GET bf.on false', (await T.bfActive()) === false && C.publicCount(await C.count([])).bf.on === false);

  // the switch off
  await switchOff();
  setNow('2026-11-26T10:00:00Z');
  const e = await put(order({}));
  setNow('2026-11-26T10:10:00Z');
  await quietly(() => C.confirm(e, 'online', { by: 'myPOS', amount: 990, match: { src: 'checkout', ref: 'checkout-t6', at: '2026-11-26T10:10:00Z' } }));
  check('switch off: 990 made and paid online in the window: 2.500', (await get(e)).cards[0].value === 2500 && (await T.bfActive()) === false);
  // switched on later: a card promised while it was on keeps it (the switch's log)
  await store.writeJSON(T.BF_KEY, { on: false, at: '2026-11-27T12:00:00Z', log: [{ on: true, at: '2026-11-24T09:00:00Z' }, { on: false, at: '2026-11-27T12:00:00Z' }] });
  setNow('2026-11-27T11:00:00Z');
  const e2 = await put(order({}));
  setNow('2026-11-27T12:30:00Z');
  await quietly(() => C.confirm(e2, 'online', { by: 'myPOS', amount: 990, match: { src: 'checkout', ref: 'checkout-t7', at: '2026-11-27T12:30:00Z' } }));
  check('made while on, the switch turned off before she paid (inside her hold): 3.000', (await get(e2)).cards[0].value === 3000);

  // 490 and the VIP unchanged
  await switchOn('2026-11-24T09:00:00Z');
  setNow('2026-11-25T12:00:00Z');
  const f = await put(order({ tier: 490, amount: 490, credit: 1000 }));
  const g = await put(order({ tier: 9900, amount: 8910, credit: 30000, disc: true }));
  const h = await put(order({ tier: 990, qty: 2, amount: 1980, credit: 5000, pay: 'clinica', status: 'rezervat', cards: [{ code: '', recipient: '' }, { code: '', recipient: 'Ana Proba' }] }));
  setNow('2026-11-25T12:10:00Z');
  await quietly(() => C.confirm(f, 'online', { by: 'myPOS', amount: 490, match: { src: 'checkout', ref: 'checkout-t8', at: '2026-11-25T12:10:00Z' } }));
  await quietly(() => C.confirm(g, 'online', { by: 'myPOS', amount: 8910, match: { src: 'checkout', ref: 'checkout-t9', at: '2026-11-25T12:10:00Z' } }));
  await quietly(() => C.confirm(h, 'clinica', { by: 'e1', amount: 1980, method: 'card' }));
  const rf = await get(f), rg = await get(g), rh = await get(h);
  check('490 paid online in the window: 1.000, sale 490', rf.cards[0].value === 1000 && rf.credit === 1000 && (await saleOf(f)).amount === 490);
  check('VIP paid online in the window: 30.000, sale 8.910 (10% online)', rg.cards[0].value === 30000 && rg.credit === 30000 && (await saleOf(g)).amount === 8910 && rg.disc === true);
  check('two 990 cards paid in the clinic in the window: 2 × 2.500', rh.cards.every((x) => x.value === 2500) && rh.credit === 5000);
  check('creditOf: 990 × 2 online in the window = 6.000; the clinic 5.000', T.creditOf({ tier: 990, qty: 2, created: '2026-11-25T12:00:00Z' }, { via: 'online', paidAt: '2026-11-25T12:30:00Z', sw: await T.bfSwitch() }) === 6000 &&
    T.creditOf({ tier: 990, qty: 2, created: '2026-11-25T12:00:00Z' }, { via: 'clinica', paidAt: '2026-11-25T12:30:00Z', sw: await T.bfSwitch() }) === 5000);

  // ---- the words
  const sw = await T.bfSwitch();
  setNow('2026-11-25T13:00:00Z');
  // a reservation made before the window, sent to the online payment now (the desk's link): her text and her card
  const k = order({ pay: 'clinica', status: 'rezervat', created: '2026-11-22T10:00:00Z', name: 'Maria Proba' });
  k.trail = [{ at: k.created, ev: 'created' }];
  const list = [k];
  await C.toOnline(list, k, { tap: true, by: 'receptie' });
  const t1 = C.payLinkText(k, 'https://example.invalid/pay');
  check('payLinkText 990 (BF): pay first, 3.000, online only until Sunday, the clinic line', /Cardul de Sărbători: plătești 990 lei și primești 3\.000 lei în tratamente, doar la plata online, până vineri 27 noiembrie\./.test(t1) && t1.includes('Dacă rezervi și plătești în clinică, rămâne 2.500 lei.') && t1.includes('BioLifting'), t1);
  check('… the order moved online carries 3.000 (and paid now: the card 3.000)', k.credit === 3000 && T.cardValueOf(k, { via: 'online', paidAt: NOW, sw }) === 3000);
  const v = order({ tier: 9900, amount: 9900, credit: 30000, pay: 'clinica', status: 'rezervat', name: 'Ioana Proba' });
  await C.toOnline([v], v, { tap: true, by: 'receptie' });
  const t2 = C.payLinkText(v, 'https://example.invalid/pay');
  check('payLinkText VIP: „Cardul VIP Transformarea 360: plătești 8.910 lei în loc de 9.900 lei (10% reducere la plata online) și primești 30.000 lei”, no 2.500 line', /Cardul VIP Transformarea 360: plătești 8\.910 lei în loc de 9\.900 lei \(10% reducere la plata online\) și primești 30\.000 lei în tratamente\./.test(t2) && !t2.includes('2.500'), t2);
  const q = order({ tier: 490, amount: 490, credit: 1000, pay: 'clinica', status: 'rezervat' });
  await C.toOnline([q], q, { tap: true, by: 'receptie' });
  const t3 = C.payLinkText(q, 'https://example.invalid/pay');
  check('payLinkText 490: plătești 490 lei și primești 1.000 lei, nothing about Black Friday', /plătești 490 lei și primești 1\.000 lei în tratamente\./.test(t3) && !/2\.500|3\.000|duminică/.test(t3), t3);
  // the switch off: the 990 text is the usual one
  await switchOff();
  const k2 = order({ pay: 'clinica', status: 'rezervat' });
  await C.toOnline([k2], k2, { tap: true, by: 'receptie' });
  const t4 = C.payLinkText(k2, 'https://example.invalid/pay');
  check('payLinkText 990, switch off: plătești 990 lei și primești 2.500 lei, no Black Friday line', /plătești 990 lei și primești 2\.500 lei în tratamente\./.test(t4) && !/3\.000|duminică|rămâne/.test(t4), t4);
  // toClinic after an online BF order: back to 2.500
  await switchOn('2026-11-24T09:00:00Z');
  const z = order({});
  await store.writeJSON(C.KEY, [z]);
  await quietly(() => C.toClinic(z.id, 'portal'));
  check('an online order moved to the clinic: credit 2.500', (await get(z.id)).credit === 2500);

  // ---- the lead message: its picture and its template
  const TP = [];
  for (const key of ['lead3n', 'lead3', 'lead3bfn2', 'lead3bf2']) TP.push({ id: 'card-' + key + '-x', purpose: 'card-' + key, label: key, body: C.TPL[key].body, map: C.TPL[key].map, meta: { w1: { status: 'APPROVED', name: 'card_' + key } } });
  await store.writeJSON('data/wa-templates.json', { templates: TP });
  const L = order({ status: 'lead', pay: 'alege', via: 'meta-form', name: 'Maria Proba' });
  await store.writeJSON(C.KEY, [L]);
  const p1 = await quietly(() => C.leadPack(L));
  check('leadPack 990 during Black Friday (approved): lead3bfn, its text 3.000 and the clinic line', p1.kind === 'lead3bfn2' && C.fill(p1.kind, p1.vars).includes('Plătești 990 lei și primești 3.000 lei în tratamente, doar la plata online, până vineri 27 noiembrie. Dacă rezervi și plătești în clinică, rămâne 2.500 lei.'), { kind: p1.kind });
  check('… its picture is the creative with 3.000 and „la plata online · până vineri 27.11”', p1.png && p1.png.length > 1000 && /Primești 3\.000 lei\./.test(CC.svgOf({ tier: 990, name: 'Maria Proba', left: 9, bf: { credit: 3000, until: T.BF.untilTxt } })) && /la plata online · până vineri 27\.11/.test(CC.svgOf({ tier: 990, left: 9, bf: { credit: 3000, until: T.BF.untilTxt } })));
  if (OUT) fs.writeFileSync(path.join(OUT, 'test-lead-990-bf.png'), p1.png);
  const L2 = order({ status: 'lead', pay: 'alege', via: 'meta-form', name: '' });
  const p2 = await quietly(() => C.leadPack(L2));
  check('… without a name: lead3bf', p2.kind === 'lead3bf2' && C.fill('lead3bf2', p2.vars).startsWith('Bună! 🎁'));
  const L3 = order({ tier: 490, amount: 490, credit: 1000, status: 'lead', pay: 'alege', via: 'meta-form', name: 'Maria Proba' });
  check('… a 490 card: lead3n as before', (await quietly(() => C.leadPack(L3))).kind === 'lead3n');
  await switchOff();
  check('… the switch off: lead3n as before', (await quietly(() => C.leadPack(L))).kind === 'lead3n');
  await switchOn('2026-11-24T09:00:00Z');
  await store.writeJSON('data/wa-templates.json', { templates: TP.filter((x) => !/bf/.test(x.purpose)) });
  check('… the Black Friday ones not approved yet: lead3n as before', (await quietly(() => C.leadPack(L))).kind === 'lead3n');
  check('the creative without Black Friday: „Primești 2.500 lei.”, no small line', /Primești 2\.500 lei\./.test(CC.svgOf({ tier: 990, left: 4 })) && !/la plata online ·/.test(CC.svgOf({ tier: 990, left: 4 })));

  // ---- the audit (24.11): the texts and the rules of the new orders
  setNow('2026-11-25T10:00:00Z');
  await switchOn('2026-11-24T09:00:00Z');
  check('factsText during Black Friday: the owner\'s paragraph', (await T.factsText()) === 'Cardul de Sărbători: plătești 990 lei și primești 3.000 lei în tratamente la plata online, până vineri 27 noiembrie (în clinică, 2.500 lei); sau 490 lei → 1.000 lei. La plata online, în plus, o ședință de BioLifting cadou și acces în Clubul 360. Card VIP Transformarea 360: 9.900 lei → 30.000 lei, 8.910 lei online. Valabil până pe 30 iunie 2027.', await T.factsText());
  setNow('2026-12-01T10:00:00Z');
  check('factsText after it: the same with 2.500', (await T.factsText()) === 'Cardul de Sărbători: plătești 990 lei și primești 2.500 lei în tratamente; sau 490 lei → 1.000 lei. La plata online, în plus, o ședință de BioLifting cadou și acces în Clubul 360. Card VIP Transformarea 360: 9.900 lei → 30.000 lei, 8.910 lei online. Valabil până pe 30 iunie 2027.');
  setNow('2026-11-25T10:00:00Z');
  await store.writeJSON(C.KEY, []); mem.delete(C.STOCK);
  const pc = C.publicCount(await C.count([]));
  check('no stock file: waves of 4 (total 4, 4 left); the public tiers only the cards on sale', C.WAVE === 4 && C.TOTAL === 4 && pc.total === 4 && pc.left === 4 && JSON.stringify(pc.tiers) === JSON.stringify({ 490: 1000, 990: 2500, 9900: 30000 }), { total: pc.total, left: pc.left, tiers: pc.tiers });
  const r290 = await quietly(() => C.request({ name: 'Proba Test', phone: '0700000901', city: 'Arad', tier: 290 }, { employeeId: 'e1' }, 'Proba'));
  const l290 = await quietly(() => C.reserveFromLead({ phone: '0700000902', city: 'Arad', value: '290' }));
  const t290 = await quietly(() => C.requestFromTap({ phone: '0700000903', city: 'Arad', tier: 290 }, { quiet: true }));
  const t990 = await quietly(() => C.requestFromTap({ phone: '0700000904', city: 'Arad' }, { quiet: true }));
  check('a new 290 order refused: request, reserveFromLead, requestFromTap (a tap with no card said: 990)', r290.error === 'bad_tier' && l290.error === 'bad_tier' && t290.error === 'bad_tier' && t990.ok && (await get(t990.id)).tier === 990, { r290, l290, t290 });
  const old290 = order({ tier: 290, amount: 290, credit: 500, pay: 'clinica', status: 'rezervat' });
  await put(old290);
  const e290 = await quietly(() => C.editOrder(old290.id, { note: 'proba' }, 'Proba'));
  const e290b = await quietly(() => C.editOrder(old290.id, { tier: 490 }, 'Proba'));
  check('an old 290 order keeps its card when edited; moved to another card only one on sale', e290.ok && e290b.ok && (await get(old290.id)).tier === 490 && (await quietly(() => C.editOrder(old290.id, { tier: 290 }, 'Proba'))).error === 'bad_tier');
  check('TPL: rec1c, rec1d, rec2b (suma, credit), rezervatvip (locatie)', JSON.stringify(C.TPL.rec1c.map) === '["suma","credit"]' && JSON.stringify(C.TPL.rec1d.map) === '["suma","credit"]' && JSON.stringify(C.TPL.rec2b.map) === '["suma","credit","carduri"]' && JSON.stringify(C.TPL.rezervatvip.map) === '["locatie"]' &&
    C.fill('rec1d', { suma: '990', credit: '3.000' }).includes('Cardul tău de Sărbători nu s-a terminat: plătești 990 lei și primești 3.000 lei în tratamente.') &&
    C.fill('rec2b', { suma: '990', credit: '3.000', carduri: '3 carduri' }).includes('Au mai rămas doar 3 carduri, iar oferta') &&
    C.fill('rezervatvip', { locatie: 'Arad' }).includes('Ți-l ținem rezervat până vii la clinica din Arad.'));
  // the clinic choice and the online link, as she gets them
  const cr990 = order({ name: 'Maria Proba', pay: 'clinica', status: 'rezervat' });
  const crTxt = C.clinicReply(cr990, (w) => w + ', Maria', await T.bfSwitch());
  check('clinic reply 990 (BF): the audit\'s words, then the online 3.000 line', crTxt === 'Gata, Maria! Ți-am rezervat Cardul de Sărbători: plătești 990 lei și primești 2.500 lei în tratamente. Îl plătești în clinică (Str. Bucegi 7, Timișoara), cash sau card, și ți-l ținem rezervat până vii. Te sună recepția să stabiliți când treci.\nLa plata online, până vineri 27 noiembrie, primești 3.000 lei în loc de 2.500.', crTxt);
  const crVip = C.clinicReply(order({ tier: 9900, amount: 8910, credit: 30000, city: 'Arad' }), (w) => w, await T.bfSwitch());
  check('clinic reply VIP: Cardul VIP Transformarea 360, 9.900 / 30.000, no Black Friday', crVip === 'Gata! Ți-am rezervat Cardul VIP Transformarea 360: plătești 9.900 lei și primești 30.000 lei în tratamente. Îl plătești în clinică (Str. Ioan Alexandru 16-18, Arad), cash sau card, și ți-l ținem rezervat până vii. Te sună recepția să stabiliți când treci.', crVip);
  await store.writeJSON('data/card-sarbatori-links.json', { 490: 'https://mypos.com/vmp/paylink/p490', 990: 'https://mypos.com/vmp/paylink/p990', 9900: 'https://mypos.com/vmp/paylink/p9900' });
  await store.writeJSON('data/wa-templates.json', { templates: [] });
  const lr = order({ status: 'lead', pay: 'alege', via: 'meta-form', name: 'Maria Proba', phone: '0700000911' });
  await store.writeJSON(C.KEY, [lr]);
  wa.length = 0;
  await quietly(() => C.onWhatsApp({ phone: lr.phone, city: 'Timișoara', button: 'Plătesc online', msgId: 'm1' }));
  const lrNow = await get(lr.id);
  const lrTxt = (wa.find((x) => x.text) || {}).text || '';
  check('lead „Plătesc online”: payLinkText (Super, Maria! … plătești 990 lei și primești 3.000 lei … the clinic line)', lrTxt === C.payLinkText(lrNow, 'https://mypos.com/vmp/paylink/p990', 'Super') && lrTxt.startsWith('Super, Maria! Cardul de Sărbători: plătești 990 lei și primești 3.000 lei în tratamente, doar la plata online, până vineri 27 noiembrie.') && lrTxt.includes('Dacă rezervi și plătești în clinică, rămâne 2.500 lei.'), lrTxt);
  // her recovery: „Finalizez plata”
  const rw = order({ name: 'Maria Proba', phone: '0700000912', via: 'site' });
  rw.rec = { wa1: { at: new RealDate(NOW).toISOString(), ok: true } };
  await store.writeJSON(C.KEY, [rw]);
  wa.length = 0;
  await quietly(() => C.onWhatsApp({ phone: rw.phone, city: 'Timișoara', button: 'Finalizez plata', msgId: 'm2' }));
  const rwTxt = (wa.find((x) => x.text) || {}).text || '';
  check('„Finalizez plata”: payLinkText (Sigur, Maria! …)', rwTxt === C.payLinkText(await get(rw.id), 'https://mypos.com/vmp/paylink/p990', 'Sigur') && rwTxt.startsWith('Sigur, Maria! Cardul de Sărbători: plătești 990 lei și primești 3.000 lei'), rwTxt);
  const lc = order({ status: 'lead', pay: 'alege', via: 'meta-form', name: 'Maria Proba', phone: '0700000913' });
  await store.writeJSON(C.KEY, [lc]);
  wa.length = 0;
  await quietly(() => C.onWhatsApp({ phone: lc.phone, city: 'Timișoara', button: 'Plătesc în clinică', msgId: 'm3' }));
  const lcTxt = (wa.find((x) => x.text) || {}).text || '';
  check('lead „Plătesc în clinică” (the „rezervat” template not approved): the clinic reply', lcTxt.startsWith('Gata, Maria! Ți-am rezervat Cardul de Sărbători: plătești 990 lei și primești 2.500 lei în tratamente.') && lcTxt.includes('ți-l ținem rezervat până vii'), lcTxt);
  // the VIP lead: never „cardul pe loc”
  const vl = order({ tier: 9900, amount: 9900, credit: 30000, status: 'lead', pay: 'alege', via: 'meta-form', name: 'Ioana Proba', phone: '0700000914' });
  await store.writeJSON(C.KEY, [vl]);
  const vp = await quietly(() => C.leadPack(vl));
  check('VIP lead, its templates not approved: „lead” with „10% reducere (plătești 8.910 lei)”', vp.kind === 'lead' && vp.vars.cadoul === '10% reducere (plătești 8.910 lei)' && !/pe loc/.test(C.fill('lead', vp.vars)), vp.vars);
  await store.writeJSON('data/wa-templates.json', { templates: ['vip3n', 'vip3', 'rezervatvip', 'rezervat2'].map((key) => ({ id: 'card-' + key + '-x', purpose: 'card-' + key, label: key, body: C.TPL[key].body, map: C.TPL[key].map, meta: { w1: { status: 'APPROVED', name: 'card_' + key } } })) });
  check('VIP lead, approved: vip3n', (await quietly(() => C.leadPack(vl))).kind === 'vip3n');
  // a VIP reservation: rezervatvip
  const vr = order({ tier: 9900, amount: 9900, credit: 30000, pay: 'clinica', status: 'rezervat', city: 'Arad', phone: '0700000915' });
  const nr = order({ pay: 'clinica', status: 'rezervat', city: 'Arad', phone: '0700000916' });
  await store.writeJSON(C.KEY, [vr, nr]);
  wa.length = 0;
  await quietly(() => C.reservedMsg(vr.id)); await quietly(() => C.reservedMsg(nr.id));
  check('the reservation message: rezervatvip for the VIP, rezervat2 for the 990', wa.length === 2 && wa[0].template === 'card_rezervatvip' && JSON.stringify(wa[0].params) === '["Arad"]' && wa[1].template === 'card_rezervat2', wa.map((x) => x.template));
  // the 14-day reminder: epilation only in Timișoara
  const rm = (city, phone) => Object.assign(order({ city, phone, pay: 'clinica', status: 'platit', paidAt: '2026-11-01T10:00:00Z', paidVia: 'clinica' }), { cards: [{ code: 'C360-TEST-' + city.slice(0, 2).toUpperCase(), recipient: '', value: 2500, claims: [] }] });
  await store.writeJSON(C.KEY, [rm('Arad', '0700000921'), rm('Timișoara', '0700000922')]);
  await store.writeJSON('data/wa-templates.json', { templates: [] });
  wa.length = 0;
  await quietly(() => C.reminders(RealDate.parse('2026-11-25T08:00:00Z')));
  const remA = (wa.find((x) => x.phone === '0700000921') || {}).text || '', remT = (wa.find((x) => x.phone === '0700000922') || {}).text || '';
  check('14-day reminder: Arad without „epilare laser”, Timișoara with it', remA && !/epilare/.test(remA) && /remodelare corporală, tratamente faciale\./.test(remA) && /epilare laser/.test(remT), { remA, remT });

  // the recovery: rec1d over rec1b, rec1c, rec1; rec2b over rec2; {{1}} the online sum, {{2}} the credit paying online now
  const recTpl = (keys) => store.writeJSON('data/wa-templates.json', { templates: keys.map((key) => ({ id: 'card-' + key + '-x', purpose: 'card-' + key, label: key, body: C.TPL[key].body, map: C.TPL[key].map, meta: { w1: { status: 'APPROVED', name: 'card_' + key } } })) });
  const recRun = async (keys, step, phone) => {
    await recTpl(keys);
    setNow('2026-11-25T09:45:00Z');
    const o = order({ via: 'site', phone });
    if (step === 'wa2') o.rec = { wa1: { at: '2026-11-24T10:00:00.000Z', ok: true } };
    await store.writeJSON(C.KEY, [o]);
    setNow('2026-11-25T10:00:00Z');
    wa.length = 0;
    await quietly(() => C.recover(NOW));
    return wa.find((x) => x.template) || {};
  };
  const ra1 = await recRun(['rec1', 'rec1b', 'rec1c', 'rec1d'], 'wa1', '0700000931');
  const ra2 = await recRun(['rec1', 'rec1b', 'rec1c'], 'wa1', '0700000932');
  const ra3 = await recRun(['rec1', 'rec1c'], 'wa1', '0700000933');
  const ra4 = await recRun(['rec1'], 'wa1', '0700000934');
  const rb1 = await recRun(['rec2', 'rec2b'], 'wa2', '0700000935');
  const rb2 = await recRun(['rec2'], 'wa2', '0700000936');
  check('recovery: rec1d, else rec1b, rec1c, rec1; rec2b, else rec2', ra1.template === 'card_rec1d' && ra2.template === 'card_rec1b' && ra3.template === 'card_rec1c' && ra4.template === 'card_rec1' && rb1.template === 'card_rec2b' && rb2.template === 'card_rec2', [ra1, ra2, ra3, ra4, rb1, rb2].map((x) => x.template));
  check('… rec1d / rec2b carry the online sum and the Black Friday credit (990, 3.000)', JSON.stringify(ra1.params) === '["990","3.000"]' && rb1.params && rb1.params[0] === '990' && rb1.params[1] === '3.000', { a: ra1.params, b: rb1.params });

  console.log('\n' + ok + '/' + (ok + fails.length) + ' ok' + (fails.length ? ', failed: ' + fails.join('; ') : ''));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
