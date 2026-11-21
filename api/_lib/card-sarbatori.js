// The Card de Sărbători (the owner, 20-21.11): three cards, the more she pays the more she gets (290 → 500 lei, 490 → 1.000
// lei, 990 → 2.500 lei in treatments, at list price, not on top of the discounted offers), 10 cards in all at first (the stock, set in the portal) whatever the card
// (both clinics), on sale until 24 December 2026, 23:59 (Romania), valid until 30 June 2027.
//
//   data/card-sarbatori.json  [order]
//   order = { id, created, name, phone, city, tier (290 | 490 | 990), qty (1-5), amount (tier × qty, made here), credit,
//             forWho: 'eu' | 'cadou', cards: [card], recipient (the first card's name), via: 'site' | 'portal',
//             pay: 'online' | 'clinica', status: 'asteptare' (sent to the PayLink, not paid yet) | 'rezervat' (to pay in
//             the clinic) | 'platit' | 'anulat', leadId, paidAt, paidVia: 'online' | 'clinica', paidBy, paidAmount,
//             match: { src: 'mypos' | 'ipn' | 'webhook', ref, at } (how the payment was found), bonus (paid online: the gift
//             and Clubul 360), cancelledAt, cancelledBy }
//   card  = { code (C360-XXXX-XXXX), recipient (the name on it; '' = hers), value (the credit), claims: [claim],
//             gift: { what, state: 'open' | 'used', usedAt } (paid online only), sent: { at, how, error }, remind: { … } }
//   claim = { id, at, date, city, by, byName, performer, performerName, items: [{ name, amount, kind: 'credit' | 'gift' }],
//             applied (what came off the credit), rest (what she paid on top), undone? }
//
// How a card is sold (the owner, 21.11): the button opens a small step (for her or a gift, her name, phone, clinic), the
// order is made here ('asteptare', its codes) and she goes to the myPOS PayLink of that card. The payment is found by
// itself when myPOS shows it to us (the transactions API of the clinic's account, read on the clock and when the team
// opens the cards; myPOS's own notification when its signature holds): the same sum, within 48 h after the order, the
// oldest order first. Always: the team confirms it with one tap in the portal (myPOS writes the owner for every paid
// link). Or she reserves it and pays in the clinic ('rezervat'): only the credit, no gift and no Club.
// Once paid: the card is active, the counter keeps it, her lead and her client file know it, the desk and the owner hear
// it, and she gets her card on WhatsApp (the picture, api/_lib/card-image.js, and a short message).
//
// Card money and Încasări (the owner, 21.11: „pune și vânzările de carduri în Încasări”): the money comes in once, the day
// the card is paid, as one payment in Încasări (data/sales.json, like a payment with no visit: nobody's day, nobody's
// commission; method card for online, the one chosen for the clinic), tied to the order (cardOrderId). Using the credit
// later is not new money: a claim never writes a payment, so nothing is counted twice. A paid order cancelled by the
// owner: a refund row in Încasări, dated that day (the month's reports stay as they were).

const crypto = require('crypto');
const { readJSON, writeJSON, readBinary, writeBinary } = require('./store');
const N = require('./notify');

const KEY = 'data/card-sarbatori.json';
const CLUB = 'data/club360-waitlist.json';
const PROBE = 'data/card-sarbatori-probe.json';
const TOTAL = 10; // only 10 cards in all (the owner, 20.11)
const TIERS = { 290: 500, 490: 1000, 990: 2500 };
const MAXQ = 5;
const DEADLINE = '2026-12-24T21:59:59.000Z'; // 24 December 2026, 23:59:59 in Romania (UTC+2 in winter)
const VALID_UNTIL = '2027-06-30T20:59:59.000Z'; // 30 June 2027, 23:59:59 in Romania (UTC+3 in summer)
const VALID_TXT = '30.06.2027';
const HOLD_MS = 2 * 3600e3; // an order sent to the PayLink keeps its cards 2 hours on the counter
const MATCH_MS = 48 * 3600e3; // a payment is matched to an order made at most 48 h before it
const CLUB_URL = 'https://www.centrul360.com/club-360';
// the gift of the online payment (the owner, 21.11): an EMS session, done only in Timișoara. For a buyer from Arad the gift
// is this one line (change it here and only here):
const GIFT_TM = 'o ședință de EMS cadou';
const GIFT_ARAD = 'un Tratament Restart cadou';
const giftOf = (city) => (city === 'Arad' ? GIFT_ARAD : GIFT_TM);
const giftShort = (city) => (city === 'Arad' ? 'Tratament Restart cadou' : 'Ședință EMS cadou (Timișoara)');

const store = { readJSON, writeJSON };
const nowISO = () => new Date().toISOString();
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const lei = (n) => Math.round(Number(n) || 0).toLocaleString('ro-RO').replace(/ /g, '.');
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const roDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(ms));
const firstName = (s) => String(s || '').trim().split(/\s+/)[0] || '';

// ---- an order as it reads now (the older ones: one card of 990; 'salon' is the clinic; a card's own fields)
function norm(r) {
  if (!r) return r;
  if (!r.tier) Object.assign(r, { tier: 990, qty: 1, amount: 990, credit: 2500, cards: r.cards || [{ code: r.code || '', recipient: r.recipient || '' }] });
  if (r.pay === 'salon') r.pay = 'clinica';
  r.cards = (r.cards || []).map((c) => Object.assign(c, { value: Number(c.value) || TIERS[r.tier] || 0, claims: Array.isArray(c.claims) ? c.claims : [] }));
  return r;
}
const qtyOf = (r) => Math.max(1, Number(norm(r).qty) || 1);
// a card counts once it is ordered; an order sent to the PayLink only for its first 2 hours (unless it was paid)
function live(r, now) {
  if (!r || r.status === 'anulat' || r.status === 'draft') return false;
  if (r.status === 'asteptare') return (now || Date.now()) - Date.parse(r.created) < HOLD_MS;
  return true;
}
// the waves (the owner, 21.11): the cards sell in waves of 10, up to 70 in all (both set by him in the portal, Carduri de
// Sărbători → Valuri). Only inside: the page says only „Au mai rămas doar N carduri”, N = what is left of the wave of now,
// counted from the real orders. A wave sold out: the next opens at once (N is the wave's size again); after the last one
// (the total) the sale closes. „Deschide acum următorul val” (the owner) ends the wave of now early: N starts over.
//   data/card-sarbatori-stock.json  { wave: 10, max: 70, skip (cards of waves ended early), by, at }
const STOCK = 'data/card-sarbatori-stock.json';
const WAVE = 10, MAX = 70;
async function settings() {
  const d = (await readJSON(STOCK, null).catch(() => null)) || {};
  const wave = Number.isInteger(d.wave) && d.wave >= 1 && d.wave <= 200 ? d.wave : WAVE;
  const max = Number.isInteger(d.max) && d.max >= 0 && d.max <= 1000 ? d.max : MAX;
  return { wave, max, skip: Number.isInteger(d.skip) && d.skip > 0 ? d.skip : 0 };
}
async function setStock(input, by) {
  const cur = await settings();
  const wave = input.wave == null ? cur.wave : Number(input.wave), max = input.max == null ? cur.max : Number(input.max);
  if (!Number.isInteger(wave) || wave < 1 || wave > 200 || !Number.isInteger(max) || max < 0 || max > 1000) return { error: 'bad_stock' };
  await writeJSON(STOCK, { wave, max, skip: cur.skip, by: by || '', at: nowISO() });
  return { ok: true, wave, max };
}
// „Deschide acum următorul val”: the cards left in the wave of now are skipped, the next wave starts now
async function openNext(list, by) {
  const cfg = await settings();
  const c = counter(list, Date.now(), cfg);
  if (c.wave.soldOut || c.wave.n >= c.wave.of) return { error: 'last_wave' };
  if (c.wave.left >= cfg.wave) return { error: 'just_opened' };
  const skip = cfg.skip + c.wave.left;
  await writeJSON(STOCK, { wave: cfg.wave, max: cfg.max, skip, by: by || '', at: nowISO() });
  return { ok: true, wave: c.wave.n + 1 };
}
const ordered = (list, now) => (list || []).filter((r) => live(r, now || Date.now())).reduce((n, r) => n + qtyOf(r), 0);
// what the page may know (left, open, the deadline) and, for the portal only, the wave
function counter(list, now, cfg) {
  const t = now || Date.now();
  const W = (cfg && cfg.wave) || WAVE, max = cfg && Number.isInteger(cfg.max) ? cfg.max : MAX, skip = (cfg && cfg.skip) || 0;
  const sold = ordered(list, t), eff = sold + skip;
  const soldOut = sold >= max;
  const left = soldOut ? 0 : Math.max(0, Math.min(W - (eff % W), max - sold));
  const n = Math.floor(eff / W) + 1;
  const of = n + Math.ceil(Math.max(0, max - sold - left) / W);
  const open = t < Date.parse(DEADLINE) && !soldOut && left > 0;
  return { total: W, left, deadline: DEADLINE, open, tiers: TIERS, maxQty: MAXQ, validUntil: VALID_UNTIL,
    sold, wave: { n, of, size: W, max, sold: eff % W, left, soldOut } };
}
// the public answer: nothing about the waves
const publicCount = (c) => ({ total: c.total, left: c.left, deadline: c.deadline, open: c.open, tiers: c.tiers, maxQty: c.maxQty, validUntil: c.validUntil });
const count = async (list, now) => counter(list, now, await settings());
const total = async () => (await settings()).max;
const expired = (now) => (now || Date.now()) > Date.parse(VALID_UNTIL);
const usedOf = (c) => r2((c.claims || []).filter((x) => !x.undone).reduce((n, x) => n + (Number(x.applied) || 0), 0));
const leftOf = (c) => Math.max(0, r2((Number(c.value) || 0) - usedOf(c)));
// a card's state: rezervat, asteptare, activ, folosit, expirat, anulat
function stateOf(r, c, now) {
  if (r.status === 'anulat') return 'anulat';
  if (r.status === 'rezervat') return 'rezervat';
  if (r.status === 'asteptare') return 'asteptare';
  if (r.status !== 'platit') return r.status || 'rezervat';
  if (leftOf(c) <= 0 && !(c.gift && c.gift.state === 'open')) return 'folosit';
  if (expired(now)) return 'expirat';
  return leftOf(c) <= 0 ? 'folosit' : 'activ';
}

const CODES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I: easy to read out at the desk
function codeOf(list, more) {
  const used = new Set([].concat(...(list || []).map((r) => (norm(r).cards || []).map((c) => c.code))).concat(more || []));
  for (;;) {
    const b = crypto.randomBytes(8);
    const c = 'C360-' + [0, 1, 2, 3].map((i) => CODES[b[i] % 32]).join('') + '-' + [4, 5, 6, 7].map((i) => CODES[b[i] % 32]).join('');
    if (!used.has(c)) return c;
  }
}
const findCard = (list, code) => {
  const k = String(code || '').toUpperCase().replace(/\s+/g, '');
  for (const r of list) { norm(r); const c = r.cards.find((x) => x.code === k); if (c) return { r, c }; }
  return null;
};

// ---- the payment links (the owner, 20.11): one myPOS PayLink per card, made by him in myPOS, kept here
// (api/lead-health.js ?cardlinks), only https links of myPOS.
const LINKS = 'data/card-sarbatori-links.json';
const okLink = (u) => { try { const x = new URL(String(u || '').trim()); return x.protocol === 'https:' && /(^|\.)mypos\.(com|eu)$/i.test(x.hostname) ? x.href : ''; } catch (e) { return ''; } };
async function links() {
  const d = (await readJSON(LINKS, {}).catch(() => ({}))) || {};
  const out = {};
  Object.keys(TIERS).forEach((t) => { out[t] = okLink(d[t]) || null; });
  return out;
}
async function setLinks(input, by) {
  const cur = (await readJSON(LINKS, {}).catch(() => ({}))) || {};
  const next = Object.assign({}, cur);
  for (const t of Object.keys(TIERS)) {
    if (!input || !(t in input)) continue;
    const v = String(input[t] == null ? '' : input[t]).trim();
    if (!v) { delete next[t]; continue; }
    const ok = okLink(v);
    if (!ok) return { error: 'bad_link', tier: t };
    next[t] = ok;
  }
  next.updatedAt = nowISO(); next.by = by || '';
  await writeJSON(LINKS, next);
  return { ok: true, links: await links() };
}

// ---- the picture of a card (made once, kept; made again when the name on it changes)
const imgPath = (code) => 'wa-out/card-' + code + '.png'; // the chat (Mesaje) shows it from there (api/portal-file.js)
async function image(r, c) {
  const name = c.recipient || r.name;
  const key = [c.code, name, c.value].join('|');
  if (c.img === key) { const b = await readBinary(imgPath(c.code)).catch(() => null); if (b && b.length) return b; }
  const buf = await require('./card-image').png({ credit: c.value, name, code: c.code, valid: VALID_TXT });
  await writeBinary(imgPath(c.code), buf, 'image/png').catch((e) => console.error('card image save:', e.message));
  c.img = key;
  return buf;
}

// ---- WhatsApp: the templates (Meta reviews them once), the messages, and the way out when a template is not approved yet
// Our own fields for the card's messages (the examples Meta sees are in wa-templates.js SAMPLE)
const TPL = {
  card: { label: 'Cardul tău de Sărbători', headerType: 'IMAGE', map: ['prenume', 'credit', 'cod', 'cadou'],
    body: 'Bună, {{1}}! Cardul tău de Sărbători Centrul360 este activ: credit de {{2}} lei, cod {{3}}, valabil până pe 30.06.2027, pentru orice tratament la prețul de listă. {{4}} Pentru programare răspunde la acest mesaj. Mulțumim!' },
  sold: { label: 'Card de Sărbători folosit', map: ['prenume', 'folosit', 'cod', 'sold'],
    body: 'Bună, {{1}}! Am folosit {{2}} lei din Cardul tău de Sărbători {{3}}. Pe card mai ai {{4}} lei, valabili până pe 30.06.2027. Mulțumim!' },
  remind: { label: 'Card de Sărbători sold', map: ['prenume', 'sold', 'cod'],
    body: 'Bună, {{1}}! Mai ai {{2}} lei pe Cardul de Sărbători {{3}}, valabili până pe 30 iunie 2027, pentru orice tratament la prețul de listă. Pentru programare răspunde la acest mesaj.' },
};
async function templates() {
  const WT = require('./wa-templates');
  const d = await WT.load();
  const out = {};
  Object.keys(TPL).forEach((k) => { out[k] = d.templates.find((t) => t.purpose === 'card-' + k) || null; });
  return { d, t: out };
}
// made once and sent to Meta (UTILITY), with the picture of a sample card for the one with an image; a refused one is
// sent again with the next clock. Returns what Meta says of each.
async function ensureTemplates() {
  const WT = require('./wa-templates');
  const { d, t } = await templates();
  let changed = false;
  const res = {};
  for (const k of Object.keys(TPL)) {
    let x = t[k];
    if (!x) {
      x = { id: 'card-' + k + '-' + crypto.randomUUID().slice(0, 6), purpose: 'card-' + k, label: TPL[k].label, name: '', language: 'ro', category: 'UTILITY',
        headerType: TPL[k].headerType || '', header: '', body: TPL[k].body, map: TPL[k].map, footer: 'Centrul360', buttons: [], meta: {}, updatedAt: nowISO() };
      if (x.headerType === 'IMAGE') {
        const buf = await require('./card-image').png({ credit: 2500, name: 'Andreea Popescu', code: 'C360-AB2C-DE3F', valid: VALID_TXT });
        x.samplePath = 'wa-templates/card-sarbatori-exemplu.png';
        await writeBinary(x.samplePath, buf, 'image/png');
      }
      d.templates.push(x); changed = true;
    }
    const st = WT.overall(x);
    if (st === 'DRAFT' || st === 'REJECTED' || Object.keys(x.meta || {}).length < (await WT.accounts()).list.length) {
      const s = await WT.submit(d, x.id).catch((e) => ({ error: e.message }));
      if (!s.error || s.partial) changed = true;
      res[k] = s.error ? 'eroare: ' + s.error : 'trimis la Meta';
    } else res[k] = st;
  }
  if (changed) await WT.save(d);
  return res;
}
// the message in the chat (Mesaje): the team sees what she got, with the picture
async function logChat(phone, city, name, text, media, id) {
  try {
    const { normalizePhone } = require('./clients');
    const p = normalizePhone(phone) || String(phone || '');
    if (!p) return;
    const K = 'data/whatsapp-conversations.json';
    const conversations = await readJSON(K, []);
    let convo = conversations.find((c) => c.phone === p);
    if (!convo) { convo = { phone: p, clientName: name || p, location: city, lastMessageAt: nowISO(), unreadCount: 0, messages: [] }; conversations.push(convo); }
    convo.messages.push(Object.assign({ id: id || crypto.randomUUID(), direction: 'out', type: media ? 'image' : 'text', text, status: 'sent', timestamp: nowISO(), sentBy: null, sentByName: 'automat', auto: true },
      media ? { media: { kind: 'image', mime: 'image/png', filename: 'card.png', path: media } } : {}));
    convo.lastMessageAt = nowISO();
    await require('./wa-convos').saveConversations(conversations);
  } catch (e) { console.error('card chat log:', e.message); }
}
// one message to her: the approved template from her clinic's number, else (inside the 24 h window) a plain message;
// { sent, how: 'template' | 'direct', error }
async function say(kind, r, vars, text, png, code) {
  const WA = require('./whatsapp'), WT = require('./wa-templates');
  const cfg = await WA.loadConfig();
  const ready = WA.readyNumbers(cfg);
  if (!ready.length) return { sent: false, error: 'WhatsApp nu e conectat' };
  const city = ready.includes(r.city) ? r.city : ready[0];
  const n = cfg.numbers[city];
  const { t } = await templates();
  const tpl = t[kind];
  const errs = [];
  if (tpl && WT.approvedFor(tpl, n.wabaId)) {
    let headerImageId;
    if (png && tpl.headerType === 'IMAGE') {
      const up = await WA.uploadMedia(city, png, 'image/png', 'card-' + code + '.png');
      if (up.error) errs.push('poza: ' + up.error); else headerImageId = up.id;
    }
    if (!(png && tpl.headerType === 'IMAGE') || headerImageId) {
      const x = await WA.sendWhatsApp({ phone: r.phone, template: (tpl.meta[n.wabaId] || {}).name || tpl.name, language: 'ro', params: tpl.map.map((k) => vars[k] || '-'), from: city, headerImageId });
      if (x.sent) { await logChat(r.phone, x.fromCity || city, r.name, text, png ? imgPath(code) : '', x.id); return { sent: true, how: 'template', city: x.fromCity || city }; }
      errs.push(x.error);
    }
  } else errs.push(tpl ? 'șablonul „' + tpl.label + '” nu e aprobat încă de Meta' : 'șablonul nu e făcut încă');
  // not approved (or refused): a plain message, which Meta lets through only if she wrote us in the last 24 hours
  const y = png ? await WA.sendMedia({ phone: r.phone, from: city, buf: png, mime: 'image/png', filename: 'Cardul de Sarbatori.png', caption: text })
    : await WA.sendWhatsApp({ phone: r.phone, text, from: city });
  if (y.sent) { await logChat(r.phone, y.fromCity || city, r.name, text, png ? imgPath(code) : '', y.id); return { sent: true, how: 'direct', city: y.fromCity || city }; }
  errs.push(y.error);
  return { sent: false, error: errs.filter(Boolean).join(' · ').slice(0, 300) };
}
// the words of the card's message (the same as the template, with the gift and the Club when paid online)
// her first name for „Bună, …!”, letters only; an online order has none (only her phone): a neutral greeting
const greetName = (r) => { const f = firstName(r.name).replace(/[^\p{L}-]/gu, ''); return f.length >= 2 ? f.slice(0, 30) : ''; };
const NONAME = 'Card de Sărbători, fără nume'; // her lead's name while we do not know hers
function cardText(r, c) {
  const extra = r.bonus ? 'Cadou: ' + giftOf(r.city) + '. Locul tău în Clubul 360 e rezervat: ' + CLUB_URL + '?cod=' + c.code : 'Te așteptăm cu drag.';
  const g = greetName(r);
  return { vars: { prenume: g || 'dragă', credit: lei(c.value), cod: c.code, cadou: extra },
    text: 'Bună' + (g ? ', ' + g : '') + '! 🎁 Cardul tău de Sărbători Centrul360 este activ' + (c.recipient && c.recipient !== r.name ? ' (pe numele ' + c.recipient + ')' : '') + ':\n' +
      '• credit de ' + lei(c.value) + ' lei, pentru orice tratament la prețul de listă\n• cod ' + c.code + '\n• valabil până pe ' + VALID_TXT + '\n' +
      (r.bonus ? '• cadou: ' + giftOf(r.city) + (r.city === 'Arad' ? '' : ' (în clinica din Timișoara)') + '\n• locul tău în Clubul 360 e rezervat: ' + CLUB_URL + '?cod=' + c.code + '\n' : '') +
      '\nPentru programare răspunde la acest mesaj. Mulțumim!' };
}
// her card, out on WhatsApp; what happened is kept on the card (the portal shows „de trimis manual” when it could not go)
async function deliver(r, c) {
  let png = null;
  try { png = await image(r, c); } catch (e) { c.sent = { at: nowISO(), how: '', error: 'poza cardului: ' + e.message }; return c.sent; }
  const m = cardText(r, c);
  const x = await say('card', r, m.vars, m.text, png, c.code).catch((e) => ({ sent: false, error: e.message }));
  c.sent = x.sent ? { at: nowISO(), how: x.how } : { at: nowISO(), how: '', error: x.error || 'netrimis' };
  return c.sent;
}

// ---- the payment in Încasări: once per order (a second call finds it); a refund row when a paid order is cancelled
const PAY_METHODS = ['card', 'cash', 'transfer'];
const saleOf = (sales, id) => (sales || []).find((x) => x && x.source === 'incasare' && x.cardOrderId === id && x.kind !== 'refund') || null;
async function recordSale(r, by) {
  const sales = await readJSON('data/sales.json', []);
  if (saleOf(sales, r.id)) return saleOf(sales, r.id);
  const amount = r2(Number(r.paidAmount) || Number(r.amount) || 0);
  if (!(amount > 0)) return null;
  const method = r.paidVia === 'online' ? 'card' : PAY_METHODS.includes(r.payMethod) ? r.payMethod : 'card';
  const entry = {
    id: crypto.randomUUID(), source: 'incasare', cardSale: true, label: 'Card de Sărbători', cardOrderId: r.id, online: r.paidVia === 'online', // online: a PayLink, never a POS terminal's
    employeeId: by || r.paidBy || 'card-sarbatori', performedBy: '', appointmentId: '', clientId: r.clientId || '', client: r.name || '',
    date: roDay(Date.parse(r.paidAt) || Date.now()), location: r.city || '', categories: [], category: '',
    treatment: 'Card de Sărbători · plătești ' + (r.qty > 1 ? r.qty + ' × ' : '') + lei(r.tier) + ' lei, credit ' + (r.qty > 1 ? r.qty + ' × ' : '') + lei(TIERS[r.tier]) + ' lei',
    amount, bookedAmount: 0, upsell: 0, method, split: null, status: 'recorded', commission: 0,
    note: (r.paidVia === 'online' ? 'Online (myPOS)' : 'În clinică') + ' · ' + r.cards.map((c) => c.code).filter(Boolean).join(', '),
    createdAt: nowISO(), decidedAt: null,
  };
  sales.push(entry);
  await writeJSON('data/sales.json', sales);
  return entry;
}
// a paid order cancelled (the owner): its cards go, the money goes back as a refund row in Încasări (never when a card was used)
async function voidPaid(id, session, reason) {
  const list = await readJSON(KEY, []);
  const r = list.find((x) => x.id === id);
  if (!r) return { error: 'not_found' };
  norm(r);
  if (r.status !== 'platit') return { error: 'not_paid' };
  if (r.cards.some((c) => usedOf(c) > 0 || (c.gift && c.gift.state === 'used'))) return { error: 'used' };
  const sales = await readJSON('data/sales.json', []);
  const sale = saleOf(sales, r.id);
  let refund = null;
  if (sale && !sales.some((x) => x.kind === 'refund' && x.refundOf === sale.id)) {
    refund = { id: crypto.randomUUID(), source: 'incasare', kind: 'refund', refundOf: sale.id, scope: 'payment', cardOrderId: r.id, cardSale: true, label: 'Card de Sărbători',
      employeeId: session.employeeId || '', performedBy: '', appointmentId: '', clientId: sale.clientId || '', client: sale.client || '',
      date: roDay(Date.now()), location: sale.location || '', categories: [], category: '', treatment: 'Rambursare · ' + sale.treatment,
      amount: -Number(sale.amount), upsell: 0, method: sale.method === 'cash' || sale.method === 'transfer' ? sale.method : 'card', split: null, status: 'recorded', commission: 0,
      reason: String(reason || 'Card de Sărbători anulat').slice(0, 300), note: '', whole: true, from: [{ saleId: sale.id, key: 's', dueId: '', upsellId: '', lei: Number(sale.amount) }], dues: [], restCut: [],
      createdAt: nowISO(), decidedAt: null };
    sales.push(refund);
    await writeJSON('data/sales.json', sales);
  }
  Object.assign(r, { status: 'anulat', cancelledAt: nowISO(), cancelledBy: session.employeeId || '', voidedPaid: true, refundId: refund ? refund.id : '' });
  await writeJSON(KEY, list);
  return { ok: true, refund };
}
// the cards paid before their payments went to Încasări (21.11): each gets its payment once
async function backfillSales() {
  const list = await readJSON(KEY, []);
  const sales = await readJSON('data/sales.json', []);
  let n = 0;
  for (const r of list.filter((x) => x.status === 'platit' && !saleOf(sales, x.id))) { norm(r); if (await recordSale(r)) n++; }
  return n;
}

// ---- paid: the card is issued (once), the gift and the Club when online, her lead and file, the team, her WhatsApp
// via: 'online' | 'clinica'; o: { by (employee id), byName, match: { src, ref, at }, amount }
async function confirm(id, via, o) {
  o = o || {};
  const list = await readJSON(KEY, []);
  const r = list.find((x) => x.id === id);
  if (!r) return { error: 'not_found' };
  norm(r);
  if (r.status === 'platit') return { row: r, again: true };
  r.status = 'platit'; r.paidAt = nowISO(); r.paidVia = via === 'online' ? 'online' : 'clinica';
  r.paidBy = o.by || ''; if (o.byName) r.paidByName = o.byName;
  r.paidAmount = Number(o.amount) > 0 ? r2(o.amount) : r.amount;
  r.payMethod = r.paidVia === 'online' ? 'card' : PAY_METHODS.includes(o.method) ? o.method : 'card';
  if (o.match) r.match = o.match;
  r.bonus = r.paidVia === 'online';
  delete r.bonusRestart; delete r.cancelledAt; delete r.cancelledBy;
  r.cards.forEach((c) => {
    if (!c.code) c.code = codeOf(list);
    c.value = TIERS[r.tier] || c.value;
    c.gift = r.bonus ? { what: giftShort(r.city), state: 'open' } : null;
  });
  await writeJSON(KEY, list);
  // the money in Încasări, once (its own line there; the notice below is the only one)
  try { await recordSale(r, o.by && o.by !== 'myPOS' ? o.by : ''); } catch (e) { console.error('card sale:', e.message); }

  // the sale goes back to Meta (Conversions API), with what her browser told us when she ordered: Purchase, in RON
  try {
    const capi = require('./meta-capi');
    const t = r.track || {};
    await capi.soon(() => capi.laterEvent({ name: 'Purchase', eventId: 'purchase.' + r.id, phone: r.phone, leadId: r.leadId, url: t.url || r.page,
      custom: { value: r.paidAmount } }, t));
  } catch (e) { console.error('card purchase capi:', e.message); }

  // the Club's waiting list (online only), her lead and her client file
  if (r.bonus) await clubAdd({ name: r.name, phone: r.phone, city: r.city, code: r.cards[0].code, source: 'card' }).catch((e) => console.error('card club:', e.message));
  try {
    const note = 'Card de Sărbători plătit ' + (r.paidVia === 'online' ? 'online' : 'în clinică') + ': ' + r.qty + ' × ' + r.tier + ' lei, credit ' + lei(r.credit) + ' lei · ' +
      r.cards.map((c) => c.code + (c.recipient ? ' (' + c.recipient + ')' : '')).join(', ') + (r.bonus ? ' · cadou: ' + giftShort(r.city) + ' · Clubul 360' : '');
    const L = await require('../portal-leads').createLead({ name: r.name || NONAME, phone: r.phone, source: 'site', location: r.city, createdBy: 'card-sarbatori', interest: 'Card de Sărbători', note, authorLabel: 'Card de Sărbători', welcome: false });
    if (L && L.lead && !r.leadId) r.leadId = L.lead.id;
  } catch (e) { console.error('card lead:', e.message); }
  if (r.name) { try { const cl = await require('./clients').upsertClient({ name: r.name, phone: r.phone, location: r.city }, store); if (cl) r.clientId = cl.id; } catch (e) { console.error('card client:', e.message); } }

  // the desk (her clinic) and the owner
  try {
    const ids = [...new Set((await N.deskIds(store, r.city)).concat(await N.adminIds(store)))];
    const posPaid = r.paidVia === 'clinica' && r.payMethod === 'card' ? await N.claim(store, N.payRef('pos', r.paidAmount), true) : null;
    await N.notifyMany(store, ids, {
      kind: 'money', tone: 'good', go: 'carduri', tag: posPaid ? posPaid.tag : 'card-paid-' + r.id, quiet: !!posPaid, ref: r.paidVia === 'clinica' && r.payMethod === 'card' ? N.payRef('desk', r.paidAmount) : '',
      title: 'CARD DE SĂRBĂTORI PLĂTIT' + N.cityTag(r.city) + (r.paidVia === 'online' ? ' ONLINE 💳' : ' 🎁') + ' - ' + N.leiTxt(r.amount),
      text: r.qty + ' × ' + r.tier + ' lei (credit ' + lei(r.credit) + ') · ' + (r.name || 'fără nume') + ' · ' + r.cards.map((c) => c.code).join(', ') + (r.bonus ? ' · + ' + giftShort(r.city) + ' și Clubul 360' : '') +
        (o.match ? ' · găsit automat în myPOS' : ''),
    });
  } catch (e) { console.error('card notify:', e.message); }

  // her cards on WhatsApp
  for (const c of r.cards) await deliver(r, c).catch((e) => { c.sent = { at: nowISO(), how: '', error: e.message }; });
  // written back onto the newest list (another change may have come meanwhile)
  const l2 = await readJSON(KEY, []);
  const i = l2.findIndex((x) => x.id === r.id);
  if (i >= 0) { l2[i] = r; await writeJSON(KEY, l2); }
  return { row: r };
}

// ---- finding the payment by itself: a payment of the clinic's account that is not a POS payment, of the sum of an order
// sent to its PayLink, within 48 h after the order (the oldest order first, each payment once)
// pays = [{ ref, amount, at, src }]
async function matchPayments(pays) {
  const list = await readJSON(KEY, []);
  const used = new Set(list.filter((r) => r.match && r.match.ref).map((r) => r.match.ref));
  const done = [];
  for (const p of (pays || []).slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    if (!p.ref || used.has(p.ref) || !(Number(p.amount) > 0)) continue;
    const t = Date.parse(p.at) || Date.now();
    const r = list.filter((x) => x.status === 'asteptare' && Math.abs(Number(x.amount) - Number(p.amount)) < 0.01 && Date.parse(x.created) <= t + 5 * 60e3 && t - Date.parse(x.created) <= MATCH_MS)
      .sort((a, b) => Date.parse(a.created) - Date.parse(b.created))[0];
    if (!r) continue;
    used.add(p.ref);
    r.status = 'matching'; // taken by this payment (written below by confirm)
    const x = await confirm(r.id, 'online', { by: 'myPOS', byName: 'myPOS (automat)', amount: p.amount, match: { src: p.src || 'mypos', ref: p.ref, at: p.at } });
    if (x.row) done.push({ id: r.id, ref: p.ref });
  }
  return done;
}
// the clinic's myPOS account: the payments that are not a POS terminal's (the PayLinks), the last days; a probe of what
// myPOS gives (counts and field names only, never a name, a card or a reference) is kept for the check
async function scanMypos(days, opts) {
  const M = require('./mypos');
  const conn = await M.loadConn(readJSON);
  if (!M.connected(conn)) return { ok: false, error: 'not_connected' };
  const now = Date.now();
  const raw = await M.listTransactions(conn, now - (days || 3) * 86400e3, now);
  const tids = new Set((conn.devices || []).map((d) => d.tid));
  const probe = { at: nowISO(), days: days || 3, read: raw.length, groups: {}, fields: [], tierSums: 0 };
  const fields = new Set();
  const pays = [];
  const sums = new Set([290, 490, 990, 580, 980, 1980, 870, 1470, 2970].map(String));
  for (const t of raw) {
    Object.keys(t || {}).forEach((k) => fields.add(k));
    const type = String(t.transaction_type || '').padStart(3, '0');
    const tid = String(t.terminal_id || '');
    const pos = !!tid && (!tids.size || tids.has(tid));
    const cur = String(t.transaction_currency || t.original_currency || '');
    const amt = Math.abs(Number(String(t.original_currency === 'RON' ? t.original_amount : t.transaction_amount).replace(',', '.')) || 0);
    const sign = String(t.sign || t.direction || t.debit_credit || '').toLowerCase();
    const g = type + (tid ? (pos ? ' pos' : ' alt-terminal') : ' fără-terminal') + ' ' + cur + (sign ? ' ' + sign : '');
    probe.groups[g] = (probe.groups[g] || 0) + 1;
    if (sums.has(String(Math.round(amt)))) probe.tierSums++;
    // a refund, a fee or money going out is never a card paid
    if (pos || ['011'].includes(type) || /debit|^d$|out/.test(sign) || Number(t.transaction_amount) < 0) continue;
    if (cur && cur !== 'RON' && t.original_currency !== 'RON') continue;
    const at = Date.parse(t.date);
    pays.push({ ref: 'mypos-' + String(t.payment_reference || t.id || (type + '-' + t.date + '-' + amt)), amount: r2(amt), at: Number.isFinite(at) ? new Date(at).toISOString() : nowISO(), src: 'mypos' });
  }
  probe.fields = [...fields].sort();
  probe.online = pays.length;
  if (opts && opts.events) { try { probe.events = await M.listEvents(conn); } catch (e) { probe.events = 'eroare: ' + (e.code || e.message); } }
  await writeJSON(PROBE, probe, { quiet: true }).catch(() => 0);
  return { ok: true, pays, probe };
}
// on the clock and when the team opens the cards: only while an order waits for its payment
async function autoMatch(force) {
  const list = await readJSON(KEY, []);
  const waiting = list.filter((r) => r.status === 'asteptare' && Date.now() - Date.parse(r.created) < MATCH_MS);
  if (!waiting.length && !force) return { waiting: 0 };
  const last = await readJSON('data/card-sarbatori-scan.json', {}).catch(() => ({}));
  if (!force && last.at && Date.now() - Date.parse(last.at) < 3 * 60e3) return { waiting: waiting.length, skipped: 'recent' };
  await writeJSON('data/card-sarbatori-scan.json', { at: nowISO() }, { quiet: true }).catch(() => 0);
  const s = await scanMypos(3).catch((e) => ({ ok: false, error: e.code || e.message }));
  if (!s.ok) return { waiting: waiting.length, error: s.error };
  return { waiting: waiting.length, matched: await matchPayments(s.pays), seen: s.pays.length };
}

// ---- myPOS's own notification (IPCPurchaseNotify), if the PayLink's store sends one to /api/card-notify: only with a
// signature that holds (myPOS's certificate in MYPOS_PUBLIC_CERT), the sum of an order waiting for it
function signed(pairs) {
  const cert = String(process.env.MYPOS_PUBLIC_CERT || '').replace(/\\n/g, '\n').trim();
  if (!cert) return null;
  const sig = (pairs.find((p) => p[0] === 'Signature') || [])[1] || '';
  const data = Buffer.from(pairs.filter((p) => p[0] !== 'Signature').map((p) => p[1]).join('-'), 'utf8').toString('base64');
  try { return crypto.createVerify('RSA-SHA256').update(data).verify(cert, sig, 'base64'); } catch (e) { return false; }
}
async function notified(pairs) {
  const b = Object.fromEntries(pairs);
  if (b.IPCmethod !== 'IPCPurchaseNotify') return { ignored: b.IPCmethod || 'none' };
  const ok = signed(pairs);
  if (ok !== true) return { refused: ok === null ? 'no_certificate' : 'signature' };
  if (String(b.Currency || '').toUpperCase() !== 'RON') return { refused: 'currency' };
  const m = await matchPayments([{ ref: 'ipn-' + String(b.IPC_Trnref || b.OrderID || ''), amount: Number(b.Amount), at: nowISO(), src: 'ipn' }]);
  return { paid: m.length > 0 };
}

// ---- the credit used: the treatments done (from the price list, at list price) or typed, the gift as its own line
// items: [{ name, amount, kind }]; never below 0: what is over the credit she pays on top (rest)
async function redeem(code, input, session) {
  const list = await readJSON(KEY, []);
  const f = findCard(list, code);
  if (!f) return { error: 'not_found' };
  const { r, c } = f;
  const st = stateOf(r, c);
  if (st === 'expirat') return { error: 'expired' };
  if (r.status !== 'platit') return { error: 'not_paid' };
  const items = (Array.isArray(input.items) ? input.items : []).slice(0, 12).map((x) => ({
    name: String(x.name || '').replace(/[<>]/g, '').trim().slice(0, 120), amount: Math.max(0, r2(x.amount)), kind: x.kind === 'gift' ? 'gift' : 'credit' }))
    .filter((x) => x.name && (x.kind === 'gift' || x.amount > 0));
  if (!items.length) return { error: 'no_items' };
  const gift = items.find((x) => x.kind === 'gift');
  if (gift) { if (!c.gift || c.gift.state !== 'open') return { error: 'no_gift' }; gift.amount = 0; gift.name = c.gift.what; }
  const total = r2(items.filter((x) => x.kind === 'credit').reduce((n, x) => n + x.amount, 0));
  const left = leftOf(c);
  if (total > 0 && left <= 0) return { error: 'empty' };
  const applied = Math.min(total, left);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || '')) ? input.date : roDay(Date.now());
  const emps = await readJSON('data/employees.json', []);
  const perf = emps.find((e) => e.id === String(input.performer || ''));
  const claim = { id: crypto.randomUUID().slice(0, 12), at: nowISO(), date, city: ['Timișoara', 'Arad'].includes(input.city) ? input.city : r.city,
    by: session.employeeId || '', byName: (emps.find((e) => e.id === session.employeeId) || {}).name || (session.employeeId === 'admin' ? 'Admin' : ''),
    performer: perf ? perf.id : '', performerName: perf ? perf.name : String(input.performerName || '').slice(0, 80), items, applied, rest: r2(total - applied) };
  c.claims.push(claim);
  if (gift) c.gift = Object.assign({}, c.gift, { state: 'used', usedAt: claim.at });
  await writeJSON(KEY, list);
  // her new balance on WhatsApp (only when credit came off)
  let msg = null;
  if (applied > 0) {
    const vars = { prenume: firstName(r.name), folosit: lei(applied), cod: c.code, sold: lei(leftOf(c)) };
    const text = 'Bună, ' + firstName(r.name) + '! Am folosit ' + lei(applied) + ' lei din Cardul tău de Sărbători ' + c.code + '. Pe card mai ai ' + lei(leftOf(c)) + ' lei, valabili până pe ' + VALID_TXT + '. Mulțumim!';
    msg = await say('sold', r, vars, text, null, c.code).catch((e) => ({ sent: false, error: e.message }));
    claim.msg = msg.sent ? { how: msg.how } : { error: msg.error };
    const l2 = await readJSON(KEY, []);
    const f2 = findCard(l2, c.code);
    if (f2) { const k = f2.c.claims.find((x) => x.id === claim.id); if (k) k.msg = claim.msg; await writeJSON(KEY, l2); }
  }
  return { ok: true, claim, left: leftOf(c), msg };
}
// the last claim undone (the owner only): the credit and the gift come back
async function undo(code, session) {
  const list = await readJSON(KEY, []);
  const f = findCard(list, code);
  if (!f) return { error: 'not_found' };
  const last = f.c.claims.filter((x) => !x.undone).slice(-1)[0];
  if (!last) return { error: 'nothing' };
  last.undone = { at: nowISO(), by: session.employeeId || '' };
  if (last.items.some((x) => x.kind === 'gift') && f.c.gift) f.c.gift = Object.assign({}, f.c.gift, { state: 'open', usedAt: '' });
  await writeJSON(KEY, list);
  return { ok: true, left: leftOf(f.c) };
}

// ---- Clubul 360's waiting list: [{ id, at, name, phone, city, code (her card's), holder, source: 'card' | 'site' }]
async function clubAdd(o) {
  const list = await readJSON(CLUB, []);
  const k = d9(o.phone);
  let row = k.length === 9 ? list.find((x) => d9(x.phone) === k) : null;
  const cards = await readJSON(KEY, []);
  const card = o.code ? findCard(cards, o.code) : null;
  const holder = !!(card && card.r.status === 'platit') || o.source === 'card' ||
    cards.some((r) => r.status === 'platit' && d9(r.phone) === k);
  if (row) {
    if (holder && !row.holder) { row.holder = true; row.code = row.code || (card ? card.c.code : String(o.code || '')); }
    if (o.name && !row.name) row.name = o.name;
    await writeJSON(CLUB, list);
    return { row, again: true, place: list.indexOf(row) + 1 };
  }
  row = { id: crypto.randomUUID().slice(0, 12), at: nowISO(), name: String(o.name || '').slice(0, 100), phone: String(o.phone || ''), city: o.city || '', code: card ? card.c.code : '', holder, source: o.source || 'site' };
  list.push(row);
  await writeJSON(CLUB, list);
  return { row, place: list.length };
}

// ---- reminders (only to cards paid with credit left): 14 days after it is active with no booking, and 60 / 30 / 7 days
// before 30.06.2027 („Mai ai X lei pe card până pe 30 iunie”). Once each, from 09 to 20 (Romania).
async function reminders(now) {
  const t = now || Date.now();
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hourCycle: 'h23' }).format(new Date(t)));
  if (h < 9 || h > 20 || expired(t)) return { sent: 0 };
  const list = await readJSON(KEY, []);
  const appts = await readJSON('data/appointments.json', []);
  const toEnd = (Date.parse(VALID_UNTIL) - t) / 86400e3;
  const due = [];
  for (const r of list) {
    if (norm(r).status !== 'platit') continue;
    for (const c of r.cards) {
      if (leftOf(c) <= 0) continue;
      c.remind = c.remind || {};
      let k = '';
      if (toEnd <= 7) k = 'e7'; else if (toEnd <= 30) k = 'e30'; else if (toEnd <= 60) k = 'e60';
      if (k && c.remind[k]) k = '';
      if (!k && !c.remind.d14 && t - Date.parse(r.paidAt) >= 14 * 86400e3) {
        const booked = appts.some((a) => a && d9(a.clientPhone) === d9(r.phone) && a.status !== 'anulata' && Date.parse(a.createdAt || a.date) >= Date.parse(r.paidAt));
        if (!booked) k = 'd14'; else c.remind.d14 = 'programată';
      }
      if (k) due.push({ r, c, k });
    }
  }
  let sent = 0;
  for (const x of due.slice(0, 6)) {
    const { r, c, k } = x;
    const vars = { prenume: firstName(r.name), sold: lei(leftOf(c)), cod: c.code };
    const text = k === 'd14'
      ? 'Bună, ' + firstName(r.name) + '! Pe Cardul tău de Sărbători ' + c.code + ' ai ' + lei(leftOf(c)) + ' lei pentru orice tratament la prețul de listă: remodelare corporală, tratamente faciale, epilare laser. Spune-ne ce ți-ar plăcea și îți găsim o oră. Răspunde la acest mesaj.'
      : 'Bună, ' + firstName(r.name) + '! Mai ai ' + lei(leftOf(c)) + ' lei pe Cardul de Sărbători ' + c.code + ' până pe 30 iunie. Răspunde la acest mesaj și îți facem programarea.';
    const m = await say('remind', r, vars, text, null, c.code).catch((e) => ({ sent: false, error: e.message }));
    c.remind[k] = m.sent ? nowISO() : 'netrimis: ' + String(m.error || '').slice(0, 120);
    if (m.sent) sent++;
  }
  if (due.length || list.some((r) => r.cards && r.cards.some((c) => c.remind && c.remind.d14 === 'programată'))) await writeJSON(KEY, list);
  return { sent, due: due.length };
}

// ---- the clock (every hour): the templates sent to Meta, the payments looked for, the reminders, the probe now and then
async function tick() {
  const out = {};
  const list = await readJSON(KEY, []);
  if (list.some((r) => r.status === 'platit' || r.status === 'asteptare') || Date.now() < Date.parse(DEADLINE)) {
    const last = await readJSON('data/card-sarbatori-tpl.json', {}).catch(() => ({}));
    if (!last.at || Date.now() - Date.parse(last.at) > 6 * 3600e3 || last.pending) {
      out.templates = await ensureTemplates().catch((e) => ({ error: e.message }));
      await writeJSON('data/card-sarbatori-tpl.json', { at: nowISO(), res: out.templates, pending: Object.values(out.templates || {}).some((v) => /eroare|DRAFT/.test(String(v))) }, { quiet: true }).catch(() => 0);
    }
  }
  out.match = await autoMatch().catch((e) => ({ error: e.message }));
  out.sales = await backfillSales().catch((e) => ({ error: e.message }));
  const pr = await readJSON(PROBE, null).catch(() => null);
  if (!pr || Date.now() - Date.parse(pr.at) > 7 * 86400e3) out.probe = await scanMypos(3, { events: true }).then((s) => (s.ok ? { read: s.probe.read, online: s.probe.online } : s)).catch((e) => ({ error: e.message }));
  out.remind = await reminders().catch((e) => ({ error: e.message }));
  return out;
}

// ---- what the team sees: one row per card
function cardView(r, c, now) {
  const used = usedOf(c);
  return {
    order: r.id, code: c.code, recipient: c.recipient || '', buyer: r.name, phone: r.phone, city: r.city, tier: r.tier, qty: r.qty, amount: r.amount, value: c.value,
    used, left: leftOf(c), state: stateOf(r, c, now), pay: r.pay, paidVia: r.paidVia || '', payMethod: r.payMethod || '', paidAt: r.paidAt || '', created: r.created, forWho: r.forWho || '',
    gift: c.gift || null, club: !!r.bonus, sent: c.sent || null, match: r.match || null, paidByName: r.paidByName || '',
    claims: (c.claims || []).map((x) => ({ id: x.id, at: x.at, date: x.date, city: x.city, byName: x.byName, performerName: x.performerName, items: x.items, applied: x.applied, rest: x.rest, undone: !!x.undone, msg: x.msg || null })),
  };
}

module.exports = {
  NONAME, greetName, KEY, CLUB, PROBE, LINKS, STOCK, TOTAL, WAVE, MAX, total, settings, setStock, openNext, publicCount, count, ordered, TIERS, MAXQ, DEADLINE, VALID_UNTIL, VALID_TXT, HOLD_MS, MATCH_MS, CLUB_URL, GIFT_TM, GIFT_ARAD, giftOf, giftShort, TPL,
  norm, qtyOf, live, counter, expired, usedOf, leftOf, stateOf, codeOf, findCard, links, setLinks, okLink,
  image, deliver, cardText, confirm, recordSale, voidPaid, backfillSales, saleOf, PAY_METHODS, matchPayments, scanMypos, autoMatch, signed, notified, redeem, undo, clubAdd, reminders, ensureTemplates, templates, tick, cardView,
};
