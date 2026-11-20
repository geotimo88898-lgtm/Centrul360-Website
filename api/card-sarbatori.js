// /api/card-sarbatori: the Card de Sărbători (the owner, 20.11): 990 lei for a credit of 2.500 lei in treatments.
// Only 100 cards in all (both clinics), on sale until 24 December 2026, 23:59 (Romania). Public, so: our own pages only
// (Origin), a hidden trap field, the consent box, a few tries per address. The rules and the payment: api/_lib/card-sarbatori.js.
//   GET                → { total: 100, left, deadline, open, online }   left = 100 minus the reservations not cancelled;
//                        online = myPOS eCommerce answers (the last check), so the page may offer the online payment
//   POST { name, phone, gift, recipient, city, pay, consent, website, page, event_id }
//                      → { ok, reservation: { id, city, recipient, pay }, left } | { error }
//        A reservation goes in data/card-sarbatori.json (status 'rezervat', via 'site', a unique card code), her lead
//        in the Pipeline (source Site, interest „Card de Sărbători”, no welcome WhatsApp: reception calls her) and the
//        owner and reception hear it like any site lead (LEAD SITE TM 🌐 - Card de Sărbători).
//   POST { action: 'order', id }   the checkout page: what she reserved (her phone masked), paid or not, online or not
//   POST { action: 'pay', id }     a myPOS payment request for 990 lei (fixed here) → { url } to pay on myPOS's page
//   POST { action: 'status', id }  asks myPOS how the payment is → { paid, status }
//   POST { action: 'list' } / { action: 'set', id, status }   the team (admin, manager, reception): the reservations;
//        'platit' (paid in the clinic) or 'anulat' (its card goes back to the counter).
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
const publicOf = (r) => ({ id: r.id, city: r.city, recipient: r.recipient, pay: r.pay, status: r.status });
// the checkout page's view of one reservation: her phone only by its last 3 digits
const orderOf = (r, online) => ({
  id: r.id, name: r.name, phone: '•••• ' + String(r.phone || '').replace(/\D/g, '').slice(-3), recipient: r.recipient, gift: !!r.gift, city: r.city,
  status: r.status, paid: r.status === 'platit', bonusRestart: !!r.bonusRestart, amount: C.PRICE, online: !!online,
  payment: r.payment ? { status: r.payment.status, url: ['Pending', 'Seen', 'None', ''].includes(r.payment.status || '') ? r.payment.url : '' } : null,
});
const CODES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I: easy to read out at the desk
function codeOf(list) {
  for (;;) {
    const b = crypto.randomBytes(8);
    const c = 'C360-' + [0, 1, 2, 3].map((i) => CODES[b[i] % 32]).join('') + '-' + [4, 5, 6, 7].map((i) => CODES[b[i] % 32]).join('');
    if (!list.some((r) => r.code === c)) return c;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!ourOrigin(String(req.headers.origin || ''))) { res.status(403).json({ error: 'forbidden' }); return; }
  try {
    if (req.method === 'GET') {
      const [list, on] = await Promise.all([readJSON(C.KEY, []), C.online()]);
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
      if (b.action === 'list') { const list = await readJSON(C.KEY, []); res.status(200).json(Object.assign({ reservations: list.slice().reverse() }, C.counter(list))); return; }
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

    // ---- the checkout page: the order, the payment request, its status
    if (b.action === 'order' || b.action === 'pay' || b.action === 'status') {
      if (limited(b.action, ip, b.action === 'pay' ? 6 : 120)) { res.status(429).json({ error: 'too_many' }); return; }
      const id = clip(b.id, 60);
      let row = (await readJSON(C.KEY, [])).find((r) => r.id === id);
      if (!row || row.status === 'anulat') { res.status(404).json({ error: 'not_found' }); return; }
      if (b.action === 'order') { res.status(200).json({ ok: true, order: orderOf(row, row.status !== 'platit' && await C.online()) }); return; }
      if (b.action === 'status') {
        try { row = await C.check(id) || row; } catch (e) { console.error('card-sarbatori status:', e.message, e.status || ''); }
        res.status(200).json({ ok: true, paid: row.status === 'platit', status: (row.payment && row.payment.status) || '', order: orderOf(row, false) });
        return;
      }
      // pay: one request per reservation while it can still be paid; a final one (expired, cancelled, failed) gets a new one
      if (row.status === 'platit') { res.status(200).json({ ok: true, paid: true }); return; }
      if (row.payment && row.payment.url && !C.FINAL.includes(row.payment.status) && row.payment.expires >= new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date())) {
        res.status(200).json({ ok: true, url: row.payment.url });
        return;
      }
      if (!(await C.online())) { res.status(200).json({ error: 'payment_not_configured' }); return; }
      let payment;
      try { payment = await C.request(row); } catch (e) {
        console.error('card-sarbatori request:', e.message, e.status || '', e.code || '');
        res.status(502).json({ error: 'payment_failed' });
        return;
      }
      const list = await readJSON(C.KEY, []);
      const cur = list.find((r) => r.id === id);
      if (!cur) { res.status(404).json({ error: 'not_found' }); return; }
      cur.payment = payment; cur.pay = 'online';
      await writeJSON(C.KEY, list);
      res.status(200).json({ ok: true, url: payment.url });
      return;
    }

    // ---- a reservation
    if (limited('reserve', ip, 8)) { res.status(429).json({ error: 'too_many' }); return; }
    if (b.website || b.hp) { res.status(200).json({ ok: true }); return; } // the trap: a bot filled the hidden field
    const name = clean(b.name, 100);
    let phone = normalizePhone(clip(b.phone, 30));
    if (/^7\d{8}$/.test(phone)) phone = '0' + phone; // typed without the 0
    const city = cityOf(b.city);
    const gift = b.gift === true || b.gift === 'true' || b.gift === 'on';
    const recipient = gift ? clean(b.recipient, 80) : name;
    if (name.length < 2) { res.status(400).json({ error: 'missing_name' }); return; }
    if (!/^07\d{8}$/.test(phone) && !/^[1-9]\d{10,14}$/.test(phone)) { res.status(400).json({ error: 'bad_phone' }); return; }
    if (gift && recipient.length < 2) { res.status(400).json({ error: 'missing_recipient' }); return; }
    if (!city) { res.status(400).json({ error: 'missing_city' }); return; }
    if (!(b.consent === true || b.consent === 'true' || b.consent === 'on')) { res.status(400).json({ error: 'missing_consent' }); return; }

    const now = Date.now();
    if (now >= Date.parse(C.DEADLINE)) { res.status(409).json({ error: 'closed' }); return; }
    let list = await readJSON(C.KEY, []);
    const left0 = C.counter(list, now).left;
    const on = b.pay === 'online' ? await C.online() : false;
    const pay = on ? 'online' : 'salon';
    // the same card again (a second tap, the page sent twice): the one she has
    const hers = list.filter((r) => C.live(r) && d9(r.phone) === d9(phone));
    const same = hers.find((r) => fold(r.recipient) === fold(recipient));
    if (same) { res.status(200).json({ ok: true, again: true, reservation: Object.assign(publicOf(same), same.status === 'rezervat' && pay === 'online' ? { pay } : {}), left: left0 }); return; }
    if (hers.length >= 5) { res.status(409).json({ error: 'too_many_cards' }); return; }
    if (left0 <= 0) { res.status(409).json({ error: 'sold_out' }); return; }

    const entry = { id: crypto.randomUUID(), created: new Date().toISOString(), name, phone, recipient, gift, city, status: 'rezervat', via: 'site', pay, code: codeOf(list), page: clip(b.page, 200) };
    list.push(entry);
    await writeJSON(C.KEY, list);
    // two at the same second for the last card: the later one gives way
    list = await readJSON(C.KEY, []);
    if (list.filter(C.live).findIndex((r) => r.id === entry.id) >= C.TOTAL) {
      await writeJSON(C.KEY, list.filter((r) => r.id !== entry.id));
      res.status(409).json({ error: 'sold_out' });
      return;
    }

    // the Pipeline: her lead (or the one she has), so reception calls her; the bell and the phones like any site lead
    let lead = null;
    try {
      const note = 'Card de Sărbători rezervat pe site (990 lei, credit 2.500 lei)' + (gift ? ' · cadou, pe numele: ' + recipient : ' · pentru ea') +
        ' · plata: ' + (pay === 'online' ? 'online' : 'în clinică') + ' · cod ' + entry.code;
      const r = await require('./portal-leads').createLead({ name, phone, source: 'site', location: city, createdBy: 'site-form', interest: 'Card de Sărbători', note, authorLabel: 'Site · Card de Sărbători', welcome: false });
      lead = r && r.lead;
      if (lead) {
        const l2 = await readJSON(C.KEY, []);
        const row = l2.find((x) => x.id === entry.id);
        if (row) { row.leadId = lead.id; await writeJSON(C.KEY, l2); }
      }
    } catch (e) { console.error('card-sarbatori lead:', e.message); } // the reservation stands; the list has it

    res.status(200).json({ ok: true, reservation: publicOf(entry), left: C.counter(await readJSON(C.KEY, [])).left });
    await capi.soon(() => capi.siteEvent(req, { name: 'Lead', eventId: b.event_id, phone, leadId: lead && lead.id, url: b.page, custom: { value: C.PRICE, currency: 'RON' } }));
  } catch (err) {
    console.error('card-sarbatori error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'failed' });
  }
};
