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
  check('window: 24.11 10:00 to 29.11 23:59:59 (Romania)', T.BF.start === '2026-11-24T08:00:00.000Z' && T.BF.end === '2026-11-29T21:59:59.000Z' && T.inWindow(RealDate.parse('2026-11-29T21:59:59Z')) && !T.inWindow(RealDate.parse('2026-11-29T22:00:00Z')) && !T.inWindow(RealDate.parse('2026-11-24T07:59:59Z')));
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
  setNow('2026-11-29T21:00:00Z');
  const c = await put(order({}));
  setNow('2026-11-30T03:00:00Z'); // the scan finds it at 05:00 RO; the payment was at 23:40 RO (inside the window)
  await quietly(() => C.confirm(c, 'online', { by: 'myPOS', amount: 990, match: { src: 'mypos', ref: 'mypos-1', at: '2026-11-29T21:40:00Z' } }));
  check('990 made Sunday 23:00 RO, PayLink paid 23:40 RO, matched by the scan at 05:00 RO: 3.000 (the payment\'s own time)', (await get(c)).cards[0].value === 3000);
  setNow('2026-11-29T21:30:00Z');
  const c2 = await put(order({}));
  setNow('2026-11-29T23:20:00Z');
  await quietly(() => C.confirm(c2, 'online', { by: 'myPOS', amount: 990, match: { src: 'checkout', ref: 'checkout-t2', at: '2026-11-29T23:20:00Z' } }));
  check('990 made Sunday 23:30 RO, paid at 01:20 RO (inside its 2 h hold, after the window): 3.000', (await get(c2)).cards[0].value === 3000);
  setNow('2026-11-29T21:30:00Z');
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
  check('payLinkText 990 (BF): pay first, 3.000, online only until Sunday, the clinic line', /Cardul de Sărbători: plătești 990 lei și primești 3\.000 lei în tratamente, doar la plata online, până duminică 29 noiembrie\./.test(t1) && t1.includes('Dacă rezervi și plătești în clinică, rămâne 2.500 lei.') && t1.includes('BioLifting'), t1);
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
  for (const key of ['lead3n', 'lead3', 'lead3bfn', 'lead3bf']) TP.push({ id: 'card-' + key + '-x', purpose: 'card-' + key, label: key, body: C.TPL[key].body, map: C.TPL[key].map, meta: { w1: { status: 'APPROVED', name: 'card_' + key } } });
  await store.writeJSON('data/wa-templates.json', { templates: TP });
  const L = order({ status: 'lead', pay: 'alege', via: 'meta-form', name: 'Maria Proba' });
  await store.writeJSON(C.KEY, [L]);
  const p1 = await quietly(() => C.leadPack(L));
  check('leadPack 990 during Black Friday (approved): lead3bfn, its text 3.000 and the clinic line', p1.kind === 'lead3bfn' && C.fill(p1.kind, p1.vars).includes('Plătești 990 lei și primești 3.000 lei în tratamente, doar la plata online, până duminică 29 noiembrie. Dacă rezervi și plătești în clinică, rămâne 2.500 lei.'), { kind: p1.kind });
  check('… its picture is the creative with 3.000 and „la plata online · până duminică 29.11”', p1.png && p1.png.length > 1000 && /Primești 3\.000 lei\./.test(CC.svgOf({ tier: 990, name: 'Maria Proba', left: 9, bf: { credit: 3000, until: T.BF.untilTxt } })) && /la plata online · până duminică 29\.11/.test(CC.svgOf({ tier: 990, left: 9, bf: { credit: 3000, until: T.BF.untilTxt } })));
  if (OUT) fs.writeFileSync(path.join(OUT, 'test-lead-990-bf.png'), p1.png);
  const L2 = order({ status: 'lead', pay: 'alege', via: 'meta-form', name: '' });
  const p2 = await quietly(() => C.leadPack(L2));
  check('… without a name: lead3bf', p2.kind === 'lead3bf' && C.fill('lead3bf', p2.vars).startsWith('Bună! 🎁'));
  const L3 = order({ tier: 490, amount: 490, credit: 1000, status: 'lead', pay: 'alege', via: 'meta-form', name: 'Maria Proba' });
  check('… a 490 card: lead3n as before', (await quietly(() => C.leadPack(L3))).kind === 'lead3n');
  await switchOff();
  check('… the switch off: lead3n as before', (await quietly(() => C.leadPack(L))).kind === 'lead3n');
  await switchOn('2026-11-24T09:00:00Z');
  await store.writeJSON('data/wa-templates.json', { templates: TP.filter((x) => !/bf/.test(x.purpose)) });
  check('… the Black Friday ones not approved yet: lead3n as before', (await quietly(() => C.leadPack(L))).kind === 'lead3n');
  check('the creative without Black Friday: „Primești 2.500 lei.”, no small line', /Primești 2\.500 lei\./.test(CC.svgOf({ tier: 990, left: 4 })) && !/la plata online ·/.test(CC.svgOf({ tier: 990, left: 4 })));

  console.log('\n' + ok + '/' + (ok + fails.length) + ' ok' + (fails.length ? ', failed: ' + fails.join('; ') : ''));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
