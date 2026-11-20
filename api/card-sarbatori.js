// /api/card-sarbatori: the Card de Sărbători (the owner, 20.11): three cards, 290 → 500 lei, 490 → 1.000 lei,
// 990 → 2.500 lei in treatments, 1 to 5 of one card in an order. Only 10 cards in all (both clinics, whatever the
// card), on sale until 24 December 2026, 23:59 (Romania). Public, so: our own pages only
// (Origin), a hidden trap field, the consent box, a few tries per address. The rules and the payment: api/_lib/card-sarbatori.js.
//   GET                → { total: 10, left, deadline, open, online, tiers }   left = 10 minus the cards of the orders not
//                        cancelled; online = the myPOS card form is set up (MYPOS_EMBED_*), so the window may offer it
//   POST { action: 'intent', tier, qty, id? }   online payment: the order made here first ('draft': our orderID, the sum
//        made here), or the same draft with another card or quantity → { id, checkout } for the myPOS card form (v2/cs-buy.js)
//   POST { tier, qty, names: [..], name, phone, city, pay, draft?, consent, terms, website, page, event_id }
//                      → { ok, reservation: { id, city, tier, qty, amount, credit, pay }, checkout?, left } | { error }
//        The price, the credit and the sum to pay are made here (tier × qty), never taken from the page. With a draft
//        (online), that order gets her details and becomes a reservation she then pays in the form; else a new one, paid in
//        the clinic. Orders in data/card-sarbatori.json (status 'rezervat', via 'site', each card its own code and name), her lead
//        in the Pipeline (source Site, interest „Card de Sărbători”, no welcome WhatsApp: reception calls her) and the
//        owner and reception hear it like any site lead (LEAD SITE TM 🌐 - Card de Sărbători).
//   POST { action: 'order', id } / { action: 'status', id }   what she ordered (her phone masked), paid or not: the payment
//        is confirmed only by myPOS's notification (api/card-notify.js), never by the page
//   POST { action: 'list' } / { action: 'set', id, status }   the team (admin, manager, reception): the orders;
//        'platit' (paid in the clinic) or 'anulat' (its cards go back to the counter).
// After payment she gets her card on WhatsApp (her name and the code); at the desk the card is tied to her name and phone.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { normalizePhone } = require('./_lib/clients');
const capi = require('./_lib/meta-capi');
const C = require('./_lib/card-sarbatori');

const CITIES = ['Timișoara', 'Arad'];
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const clean = (s, n) => clip(String(s || '').replace(/[<>"]/g, '').replace(/\s+/g, ' '), n);
const cityOf = (v) => CITIES.find((c) => fold(c) === fold(v)) || '';
const ourOrigin = (o) => !o || /^https:\/\/([\w-]+\.)?centrul360\.com$/.test(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const tries = new Map(); // 'what|ip' → [times] (per warm instance)
function limited(what, ip, max) {
  const k = what + '|' + ip, now = Date.now();
  const mine = (tries.get(k) || []).filter((t) => now - t < 10 * 60e3);
  if (mine.length >= max) return true;
  tries.set(k, mine.concat(now));
  return false;
}
const publicOf = (r) => ({ id: r.id, city: r.city, recipient: r.recipient, tier: r.tier, qty: r.qty, amount: r.amount, credit: r.credit, names: (r.cards || []).map((c) => c.recipient), pay: r.pay, status: r.status });
// the checkout page's view of one reservation: her phone only by its last 3 digits
const orderOf = (r) => (C.norm(r), {
  id: r.id, name: r.name, phone: '•••• ' + String(r.phone || '').replace(/\D/g, '').slice(-3), city: r.city,
  tier: r.tier, qty: r.qty, amount: r.amount, credit: r.credit, names: (r.cards || []).map((c) => c.recipient),
  status: r.status, paid: r.status === 'platit', bonusRestart: r.bonusRestart || 0, pay: r.pay,
});
const siteOf = (req) => 'https://' + (String(req.headers['x-forwarded-host'] || req.headers.host || 'www.centrul360.com').split(',')[0].trim());
const CODES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I: easy to read out at the desk
function codeOf(list, more) {
  const used = new Set([].concat(...list.map((r) => (C.norm(r).cards || []).map((c) => c.code))).concat(more || []));
  for (;;) {
    const b = crypto.randomBytes(8);
    const c = 'C360-' + [0, 1, 2, 3].map((i) => CODES[b[i] % 32]).join('') + '-' + [4, 5, 6, 7].map((i) => CODES[b[i] % 32]).join('');
    if (!used.has(c)) return c;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!ourOrigin(String(req.headers.origin || ''))) { res.status(403).json({ error: 'forbidden' }); return; }
  try {
    if (req.method === 'GET') {
      const list = await readJSON(C.KEY, []), on = !!C.embed();
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=30');
      res.status(200).json(C.counter(list, Date.now(), on));
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    let b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';

    // ---- the team: the list, paid in the clinic, cancelled
    if (b.action === 'list' || b.action === 'set') {
      const session = await require('./_lib/auth').requireRole(req, res, ['admin', 'manager', 'receptie']);
      if (!session) return;
      if (b.action === 'list') { const list = await readJSON(C.KEY, []); res.status(200).json(Object.assign({ reservations: list.filter((r) => r.status !== 'draft').reverse() }, C.counter(list))); return; }
      const id = clip(b.id, 60);
      if (!['rezervat', 'platit', 'anulat'].includes(b.status)) { res.status(400).json({ error: 'bad_status' }); return; }
      let row;
      if (b.status === 'platit') row = await C.markPaid(id, 'clinica', session.employeeId || '');
      else {
        const list = await readJSON(C.KEY, []);
        row = list.find((r) => r.id === id);
        if (row) { row.status = b.status; row.updated = new Date().toISOString(); row.updatedBy = session.employeeId || ''; await writeJSON(C.KEY, list); }
      }
      if (!row) { res.status(404).json({ error: 'not_found' }); return; }
      res.status(200).json(Object.assign({ ok: true, reservation: row }, C.counter(await readJSON(C.KEY, []))));
      return;
    }

    // ---- the online payment: the order first (a draft), with our orderID and the sum made here
    if (b.action === 'intent') {
      if (limited('intent', ip, 40)) { res.status(429).json({ error: 'too_many' }); return; }
      if (!C.embed()) { res.status(200).json({ error: 'payment_not_configured' }); return; }
      const tier = Number(b.tier), qty = Number(b.qty);
      if (!C.TIERS[tier]) { res.status(400).json({ error: 'bad_tier' }); return; }
      if (!Number.isInteger(qty) || qty < 1 || qty > C.MAXQ) { res.status(400).json({ error: 'bad_qty' }); return; }
      if (Date.now() >= Date.parse(C.DEADLINE)) { res.status(409).json({ error: 'closed' }); return; }
      let list = await readJSON(C.KEY, []);
      const left = C.counter(list).left;
      if (left <= 0) { res.status(409).json({ error: 'sold_out' }); return; }
      if (left < qty) { res.status(409).json({ error: 'not_enough', left }); return; }
      // drafts never paid nor finished are dropped after 2 days
      list = list.filter((r) => r.status !== 'draft' || Date.now() - Date.parse(r.created) < 2 * 86400e3);
      // her draft (another card or quantity), or her reservation to pay online after a payment that did not pass (same card,
      // same quantity): a new orderID each time, myPOS takes an orderID once
      let row = list.find((r) => r.id === clip(b.id, 60) && (r.status === 'draft' || (r.status === 'rezervat' && r.pay === 'online' && r.tier === tier && r.qty === qty)));
      const orderId = C.newOrderId();
      if (row && row.status === 'draft') Object.assign(row, { tier, qty, amount: tier * qty, credit: C.TIERS[tier] * qty });
      if (row) Object.assign(row, { orderId, orderIds: (row.orderIds || []).concat(orderId).slice(-20) });
      else { row = { id: crypto.randomUUID(), created: new Date().toISOString(), status: 'draft', via: 'site', pay: 'online', tier, qty, amount: tier * qty, credit: C.TIERS[tier] * qty, orderId, orderIds: [orderId], cards: [] }; list.push(row); }
      await writeJSON(C.KEY, list);
      res.status(200).json({ ok: true, id: row.id, checkout: C.checkout(row, siteOf(req)) });
      return;
    }
    if (b.action === 'order' || b.action === 'status') {
      if (limited(b.action, ip, 120)) { res.status(429).json({ error: 'too_many' }); return; }
      const row = (await readJSON(C.KEY, [])).find((r) => r.id === clip(b.id, 60));
      if (!row || row.status === 'anulat') { res.status(404).json({ error: 'not_found' }); return; }
      res.status(200).json({ ok: true, paid: row.status === 'platit', order: orderOf(row) });
      return;
    }

    // ---- a reservation
    if (limited('reserve', ip, 8)) { res.status(429).json({ error: 'too_many' }); return; }
    if (b.website || b.hp) { res.status(200).json({ ok: true }); return; } // the trap: a bot filled the hidden field
    const name = clean(b.name, 100);
    let phone = normalizePhone(clip(b.phone, 30));
    if (/^7\d{8}$/.test(phone)) phone = '0' + phone; // typed without the 0
    const city = cityOf(b.city);
    const tier = Number(b.tier), qty = Number(b.qty);
    if (!C.TIERS[tier]) { res.status(400).json({ error: 'bad_tier' }); return; }
    if (!Number.isInteger(qty) || qty < 1 || qty > C.MAXQ) { res.status(400).json({ error: 'bad_qty' }); return; }
    const names = Array.from({ length: qty }, (_, i) => clean((Array.isArray(b.names) ? b.names : [])[i], 80));
    if (name.length < 2) { res.status(400).json({ error: 'missing_name' }); return; }
    if (!/^07\d{8}$/.test(phone) && !/^[1-9]\d{10,14}$/.test(phone)) { res.status(400).json({ error: 'bad_phone' }); return; }
    if (!city) { res.status(400).json({ error: 'missing_city' }); return; }
    if (!(b.consent === true || b.consent === 'true' || b.consent === 'on')) { res.status(400).json({ error: 'missing_consent' }); return; }
    if (!(b.terms === true || b.terms === 'true' || b.terms === 'on')) { res.status(400).json({ error: 'missing_terms' }); return; } // the card's terms, read and accepted

    const now = Date.now();
    if (now >= Date.parse(C.DEADLINE)) { res.status(409).json({ error: 'closed' }); return; }
    let list = await readJSON(C.KEY, []);
    const left0 = C.counter(list, now).left;
    // online: the draft the form was made for (same card, same quantity), else in the clinic
    const draft = b.pay === 'online' && C.embed() ? list.find((r) => r.id === clip(b.draft, 60) && r.status === 'draft' && r.tier === tier && r.qty === qty) : null;
    const pay = draft ? 'online' : 'salon';
    // the same order again within 10 minutes (a second tap, the page sent twice): the one she has
    const hers = list.filter((r) => C.live(r) && d9(r.phone) === d9(phone));
    const same = hers.find((r) => C.norm(r).tier === tier && r.qty === qty && r.status === 'rezervat' && Date.now() - Date.parse(r.created) < 10 * 60e3 &&
      r.cards.map((c) => fold(c.recipient)).join('|') === names.map(fold).join('|'));
    if (same && !draft) { res.status(200).json({ ok: true, again: true, reservation: publicOf(same), left: left0 }); return; }
    if (hers.reduce((n, r) => n + C.qtyOf(r), 0) + qty > 10) { res.status(409).json({ error: 'too_many_cards' }); return; }
    if (left0 <= 0) { res.status(409).json({ error: 'sold_out' }); return; }
    if (left0 < qty) { res.status(409).json({ error: 'not_enough', left: left0 }); return; }

    const codes = [];
    names.forEach(() => codes.push(codeOf(list, codes)));
    const cards = names.map((n, i) => ({ code: codes[i], recipient: n }));
    const details = { termsAt: new Date().toISOString(), name, phone, city, tier, qty, amount: tier * qty, credit: C.TIERS[tier] * qty, cards, recipient: names[0] || '', status: 'rezervat', via: 'site', pay, page: clip(b.page, 200) };
    let entry;
    if (draft) { entry = Object.assign(draft, details, { reservedAt: new Date().toISOString() }); }
    else { entry = Object.assign({ id: crypto.randomUUID(), created: new Date().toISOString() }, details); list.push(entry); }
    await writeJSON(C.KEY, list);
    // two at the same second for the last cards: the later one gives way
    list = await readJSON(C.KEY, []);
    const before = list.filter(C.live);
    const upTo = before.slice(0, before.findIndex((r) => r.id === entry.id) + 1).reduce((n, r) => n + C.qtyOf(r), 0);
    if (upTo > C.TOTAL) {
      await writeJSON(C.KEY, list.filter((r) => r.id !== entry.id));
      res.status(409).json({ error: 'sold_out' });
      return;
    }

    // the Pipeline: her lead (or the one she has), so reception calls her; the bell and the phones like any site lead
    let lead = null;
    try {
      const note = 'Card de Sărbători comandat pe site: ' + qty + ' × ' + tier + ' lei (credit ' + C.TIERS[tier] + ' lei fiecare), de plată ' + entry.amount + ' lei' +
        ' · plata: ' + (pay === 'online' ? 'online' : 'în clinică') + ' · ' + cards.map((c) => c.code + ' pe numele ' + (c.recipient || '(de întrebat)')).join('; ');
      const r = await require('./portal-leads').createLead({ name, phone, source: 'site', location: city, createdBy: 'site-form', interest: 'Card de Sărbători', note, authorLabel: 'Site · Card de Sărbători', welcome: false });
      lead = r && r.lead;
      if (lead) {
        const l2 = await readJSON(C.KEY, []);
        const row = l2.find((x) => x.id === entry.id);
        if (row) { row.leadId = lead.id; await writeJSON(C.KEY, l2); }
      }
    } catch (e) { console.error('card-sarbatori lead:', e.message); } // the reservation stands; the list has it

    res.status(200).json({ ok: true, reservation: publicOf(entry), checkout: draft ? C.checkout(entry, siteOf(req)) : undefined, left: C.counter(await readJSON(C.KEY, [])).left });
    await capi.soon(() => capi.siteEvent(req, { name: 'Lead', eventId: b.event_id, phone, leadId: lead && lead.id, url: b.page, custom: { value: entry.amount, currency: 'RON' } }));
  } catch (err) {
    console.error('card-sarbatori error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'failed' });
  }
};
