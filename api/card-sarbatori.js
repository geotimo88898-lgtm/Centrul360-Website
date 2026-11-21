// /api/card-sarbatori: the Card de Sărbători (the owner, 20-21.11). The rules, the payment, the picture and the messages:
// api/_lib/card-sarbatori.js. Public calls only from our own pages (Origin), with a hidden trap field, the consent box and a
// few tries per address.
//   GET                → { total, left, deadline, open, tiers, links }   left: what is left of the wave of now; nothing else about the waves   links: the myPOS PayLink of each card (or null)
//   POST { pay: 'online', tier, phone, city, consent, website, page, event_id }   (the card block's own field, no form:
//        the owner, 21.11; name / recipient optional, asked on WhatsApp once she paid, _lib/card-sarbatori.js askName)
//        → { ok, id, link, amount }: the order waits for its payment ('asteptare', its cards held 2 h on the counter) and the
//        page sends her to that card's PayLink. One card per online order (a PayLink is one sum).
//   POST { pay: 'clinica', tier, qty 1-5, names: [..], name, phone, city, consent, ... }   (from the card block: tier, phone,
//        city, qty 1, no name: reception calls her; the name on the card is asked on WhatsApp once paid)
//        → { ok, reservation }: reserved, paid in the clinic; nothing is issued until the team confirms the payment.
//   POST { action: 'order', id }   what she ordered (her phone masked), paid or not
//   POST { action: 'back', id }    she is back on the site with the order of her tab, not paid: { paid } | { gone } | { ask, tier,
//        credit, amount, city, held, until } (the line „s-a întors” on the order)
//   POST { action: 'answer', id, reason: retry | declined | nocard | confusing | clinic | no }   her answer to „Plata nu s-a
//        finalizat?”: retry → { link } (her hold again), clinic → { reservation } (paid in the clinic, the desk hears it),
//        no → the order cancelled; the others only written on the order (_lib/card-sarbatori.js back, answer)
//   The team (admin, manager, reception; reception records payments):
//   POST { action: 'list' }        every card (pending first), the counter, the totals, the treatments of the price list
//   POST { action: 'confirm', id, via: 'online' | 'clinica', method: 'card' | 'cash' | 'transfer' }   paid: the card is issued
//        and sent, the payment goes in Încasări once (method card for online)
//   POST { action: 'void', id, reason }   a paid order cancelled (admin only, no card used): a refund row in Încasări
//   POST { action: 'add', tier, qty, names, name, phone, city, via }   a card already paid (seen in myPOS or in the clinic)
//   POST { action: 'cancel', id }  an order not paid: its cards go back on the counter
//   POST { action: 'redeem', code, items: [{ name, amount, kind }], date, performer, city }   the credit used
//   POST { action: 'undo', code }  the last use undone (admin only)
//   POST { action: 'resend', code }   her card on WhatsApp again;   POST { action: 'rename', code, recipient }
//   POST { action: 'stock', wave, max }   the waves: how many cards in a wave (10) and in all (70) (admin only; Activitate notes it)
//   POST { action: 'open_wave' }   the wave of now ends early, the next one starts now (admin only)
//   POST { action: 'scan' }        look in myPOS for the payments now
//   POST { action: 'pick', check, id }   „De verificat”: a payment that could be two orders' (the same sum), hers is this one
//   GET ?img=<code>                the card's picture (the team, a portal session)

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
const orderOf = (r) => (C.norm(r), {
  id: r.id, name: r.name, phone: '•••• ' + String(r.phone || '').replace(/\D/g, '').slice(-3), city: r.city,
  tier: r.tier, qty: r.qty, amount: r.amount, credit: r.credit, names: (r.cards || []).map((c) => c.recipient), status: r.status, paid: r.status === 'platit', pay: r.pay,
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// what the portal shows of an order's trail and of its recovery messages (no texts, no numbers of hers)
const trailOf = (r) => (r.trail || []).slice(-20).map((e) => ({ at: e.at, ev: e.ev, note: e.note || '' }));
const recView = (r) => { const x = r.rec || {}; return { wa1: x.wa1 ? { at: x.wa1.at, ok: !!x.wa1.ok } : null, wa2: x.wa2 ? { at: x.wa2.at, ok: !!x.wa2.ok } : null, wait: x.wa1Wait || x.wa2Wait ? 'template' : '', stop: x.stop || '' }; };
const phoneOk = (p) => /^07\d{8}$/.test(p) || /^[1-9]\d{10,14}$/.test(p);
const phoneOf = (v) => { let p = normalizePhone(clip(v, 30)); if (/^7\d{8}$/.test(p)) p = '0' + p; return p; };

// the price list for the claims: the offers in Admin → Oferte, at list price (the old price when there is one)
async function treatments() {
  const out = [];
  for (const city of CITIES) {
    const s = await require('./_lib/booking').services(city).catch(() => []);
    s.filter((x) => x.id !== 'consult').forEach((x) => { const price = Number(x.old) || Number(x.price) || 0; if (price > 0 && !out.some((o) => o.name === x.title && o.price === price)) out.push({ name: x.title, price, city }); });
  }
  return out.slice(0, 80);
}
// where she came from (the owner, 21.11: „tracking cu absolut totul”): the ad's UTM tags and click id from the page's
// address, and what her browser told Meta (fbp, fbc, ip, ua), kept on the order so the payment, confirmed later
// in myPOS, goes back to Meta as a Purchase of that very click (_lib/card-sarbatori.js confirm)
function trackOf(req, page) {
  const rq = capi.fromRequest(req, page);
  const t = { fbp: rq.fbp, fbc: rq.fbc, ip: rq.ip, ua: rq.ua, url: rq.url };
  try {
    const q = new URL(String(page || '')).searchParams;
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'].forEach((k) => { const v = q.get(k); if (v) t[k] = String(v).slice(0, 200); });
  } catch (e) { /* no address */ }
  Object.keys(t).forEach((k) => { if (!t[k]) delete t[k]; });
  return t;
}
async function lead(r, b, req, note) {
  try {
    const L = await require('./portal-leads').createLead({ name: r.name || r.hint || C.NONAME, phone: r.phone, source: 'site', location: r.city, createdBy: 'site-form', interest: 'Card de Sărbători', note, authorLabel: 'Site · Card de Sărbători', welcome: false });
    if (L && L.lead) {
      const l2 = await readJSON(C.KEY, []);
      const row = l2.find((x) => x.id === r.id);
      if (row) { row.leadId = L.lead.id; await writeJSON(C.KEY, l2); }
      await capi.soon(() => capi.siteEvent(req, { name: 'Lead', eventId: b.event_id, phone: r.phone, leadId: L.lead.id, url: b.page, custom: { value: r.amount, currency: 'RON' } }));
    }
  } catch (e) { console.error('card-sarbatori lead:', e.message); }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!ourOrigin(String(req.headers.origin || ''))) { res.status(403).json({ error: 'forbidden' }); return; }
  try {
    if (req.method === 'GET') {
      if (req.query && req.query.img) {
        const session = await require('./_lib/auth').requireRole(req, res, ['admin', 'manager', 'receptie']);
        if (!session) return;
        const list = await readJSON(C.KEY, []);
        const f = C.findCard(list, req.query.img);
        if (!f || f.r.status !== 'platit') { res.status(404).json({ error: 'not_found' }); return; }
        const had = f.c.img;
        const buf = await C.image(f.r, f.c);
        if (f.c.img !== had) await writeJSON(C.KEY, list);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', (req.query.dl ? 'attachment' : 'inline') + '; filename="Card-' + f.c.code + '.png"');
        res.status(200).send(buf);
        return;
      }
      const [list, links] = await Promise.all([readJSON(C.KEY, []), C.links()]);
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=30');
      res.status(200).json(Object.assign(C.publicCount(await C.count(list)), { links }));
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    let b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';

    // ---- the team
    const TEAM = ['void', 'stock', 'open_wave', 'list', 'confirm', 'add', 'cancel', 'redeem', 'undo', 'resend', 'rename', 'scan', 'set', 'pick'];
    if (TEAM.includes(b.action)) {
      const session = await require('./_lib/auth').requireRole(req, res, b.action === 'undo' ? ['admin'] : ['admin', 'manager', 'receptie']);
      if (!session) return;
      if (session.viewer && b.action !== 'list') { res.status(403).json({ error: 'forbidden' }); return; }
      const emps = await readJSON('data/employees.json', []);
      const me = emps.find((e) => e.id === session.employeeId) || {};
      const byName = me.name || (session.employeeId === 'admin' ? 'Admin' : '');
      if (b.action === 'list') {
        const scan = b.scan === false ? null : await C.autoMatch().catch((e) => ({ error: e.message }));
        if (b.scan !== false) await C.backfillSales().catch((e) => console.error('card sales backfill:', e.message));
        const list = await readJSON(C.KEY, []);
        const now = Date.now();
        const cards = [];
        list.filter((r) => r.status !== 'draft').forEach((r) => { C.norm(r); (r.cards.length ? r.cards : [{ code: '', recipient: r.recipient || '', value: C.TIERS[r.tier], claims: [] }]).forEach((c) => cards.push(C.cardView(r, c, now))); });
        // the orders waiting for a payment or a reservation, as one row each (their cards are not issued yet)
        // and, 3 days, the online ones she gave up herself (what happened stays readable)
        const gaveUp = (r) => r.status === 'anulat' && r.cancelledBy === 'ea' && now - Date.parse(r.cancelledAt || r.created) < 3 * 86400e3;
        const orders = list.filter((r) => r.status === 'asteptare' || r.status === 'rezervat' || gaveUp(r)).map((r) => ({ id: r.id, created: r.created, name: r.name, phone: r.phone, city: r.city, tier: r.tier, qty: r.qty, amount: r.amount, credit: r.credit,
          pay: r.pay, status: r.status, forWho: r.forWho || '', names: r.cards.map((c) => c.recipient), held: C.live(r, now), heldUntil: r.status === 'asteptare' ? new Date(C.heldFrom(r) + C.HOLD_MS).toISOString() : '',
          online: r.via === 'site' && (r.pay === 'online' || !!r.convertedAt), converted: r.convertedAt || '', byHer: gaveUp(r), trail: trailOf(r), rec: recView(r) })).reverse();
        const paid = list.filter((r) => r.status === 'platit');
        const totals = { cards: paid.reduce((n, r) => n + C.qtyOf(r), 0), money: paid.reduce((n, r) => n + (Number(r.paidAmount) || Number(r.amount) || 0), 0), online: paid.filter((r) => r.paidVia === 'online').reduce((n, r) => n + (Number(r.paidAmount) || r.amount), 0),
          credit: paid.reduce((n, r) => n + r.cards.reduce((m, c) => m + (Number(c.value) || 0), 0), 0), used: paid.reduce((n, r) => n + r.cards.reduce((m, c) => m + C.usedOf(c), 0), 0) };
        const T = await C.templates().catch(() => ({ t: {} }));
        const WT = require('./_lib/wa-templates');
        const all = Object.fromEntries(Object.entries(T.t || {}).map(([k, t]) => [k, t ? WT.overall(t) : 'LIPSĂ']));
        const tpl = Object.fromEntries(Object.entries(all).filter(([k]) => C.CORE.includes(k)));
        // the payments of one sum that could be two orders': the desk picks (its phone's last 3 digits, here only)
        const checks = (await C.openChecks()).map((c) => ({ id: c.id, amount: c.amount, at: c.at, cands: c.cands.map((id) => list.find((r) => r.id === id)).filter(Boolean).map((r) => ({
          id: r.id, created: r.created, city: r.city, tier: r.tier, name: r.name || '', last3: String(r.phone || '').replace(/\D/g, '').slice(-3), status: r.status })) }));
        const recTpl = Object.fromEntries(Object.entries(all).filter(([k]) => !C.CORE.includes(k)));
        res.status(200).json(Object.assign({ cards: cards.filter((c) => c.code).reverse(), orders, totals, templates: tpl, recTemplates: recTpl, checks, scan, treatments: await treatments(), team: emps.filter((e) => e.active !== false && ['cosmetician', 'manager'].includes(e.role)).map((e) => ({ id: e.id, name: e.name, city: e.location || '' })),
          role: session.role, links: await C.links(), gift: { 'Timișoara': C.giftShort('Timișoara'), Arad: C.giftShort('Arad') } }, await C.count(list, now)));
        return;
      }
      if (b.action === 'stock') {
        if (session.role !== 'admin') { res.status(403).json({ error: 'forbidden' }); return; }
        const x = await C.setStock({ wave: b.wave, max: b.max == null ? b.total : b.max }, session.employeeId || '');
        if (x.error) { res.status(400).json(x); return; }
        res.status(200).json(Object.assign({ ok: true }, await C.count(await readJSON(C.KEY, []))));
        return;
      }
      if (b.action === 'void') {
        if (session.role !== 'admin') { res.status(403).json({ error: 'forbidden' }); return; }
        const x = await C.voidPaid(clip(b.id, 60), session, clip(b.reason, 200));
        if (x.error) { res.status(x.error === 'not_found' ? 404 : 409).json(x); return; }
        res.status(200).json(Object.assign({ ok: true, refund: x.refund }, await C.count(await readJSON(C.KEY, []))));
        return;
      }
      if (b.action === 'open_wave') {
        if (session.role !== 'admin') { res.status(403).json({ error: 'forbidden' }); return; }
        const list = await readJSON(C.KEY, []);
        const x = await C.openNext(list, session.employeeId || '');
        if (x.error) { res.status(409).json(x); return; }
        res.status(200).json(Object.assign({ ok: true, opened: x.wave }, await C.count(list)));
        return;
      }
      if (b.action === 'scan') { res.status(200).json(await C.autoMatch(true)); return; }
      if (b.action === 'pick') {
        const x = await C.pick(clip(b.check, 40), clip(b.id, 60), { by: session.employeeId || '', byName });
        if (x.error) { res.status(409).json(x); return; }
        res.status(200).json(Object.assign({ ok: true, reservation: x.row, cards: x.row.cards.map((c) => C.cardView(x.row, c)) }, await C.count(await readJSON(C.KEY, []))));
        return;
      }
      if (b.action === 'confirm' || (b.action === 'set' && b.status === 'platit')) {
        const list = await readJSON(C.KEY, []);
        const r = list.find((x) => x.id === clip(b.id, 60));
        if (!r) { res.status(404).json({ error: 'not_found' }); return; }
        if (r.status === 'anulat' && b.action === 'set') { res.status(409).json({ error: 'cancelled' }); return; }
        const via = b.via === 'online' || (b.via !== 'clinica' && r.pay === 'online') ? 'online' : 'clinica';
        // waiting in „De verificat”: that payment is this order's
        const chk = via === 'online' ? await C.openCheckOf(r.id) : null;
        const x = chk ? await C.pick(chk.id, r.id, { by: session.employeeId || '', byName, method: b.method })
          : await C.confirm(r.id, via, { by: session.employeeId || '', byName, method: b.method });
        if (x.error) { res.status(400).json(x); return; }
        res.status(200).json(Object.assign({ ok: true, again: !!x.again, reservation: x.row, cards: x.row.cards.map((c) => C.cardView(x.row, c)) }, await C.count(await readJSON(C.KEY, []))));
        return;
      }
      if (b.action === 'cancel' || (b.action === 'set' && b.status === 'anulat')) {
        const list = await readJSON(C.KEY, []);
        const r = list.find((x) => x.id === clip(b.id, 60));
        if (!r) { res.status(404).json({ error: 'not_found' }); return; }
        if (r.status === 'platit') { res.status(409).json({ error: 'paid' }); return; }
        Object.assign(r, { status: 'anulat', cancelledAt: new Date().toISOString(), cancelledBy: session.employeeId || '' });
        C.mark(r, 'cancelled', 'team'); C.recOf(r).stop = C.recOf(r).stop || 'cancelled';
        await writeJSON(C.KEY, list);
        res.status(200).json(Object.assign({ ok: true, reservation: r }, await C.count(list)));
        return;
      }
      if (b.action === 'set' && b.status === 'rezervat') {
        const list = await readJSON(C.KEY, []);
        const r = list.find((x) => x.id === clip(b.id, 60));
        if (!r || r.status === 'platit') { res.status(409).json({ error: 'not_open' }); return; }
        if (r.pay === 'online' && r.status !== 'rezervat') { r.convertedAt = new Date().toISOString(); C.mark(r, 'converted', 'portal'); C.recOf(r).stop = C.recOf(r).stop || 'converted'; }
        Object.assign(r, { status: 'rezervat', pay: 'clinica' }); delete r.cancelledAt;
        await writeJSON(C.KEY, list);
        res.status(200).json(Object.assign({ ok: true, reservation: r }, await C.count(list)));
        return;
      }
      if (b.action === 'add') {
        const tier = Number(b.tier), qty = Number(b.qty) || 1;
        if (!C.TIERS[tier]) { res.status(400).json({ error: 'bad_tier' }); return; }
        if (!Number.isInteger(qty) || qty < 1 || qty > C.MAXQ) { res.status(400).json({ error: 'bad_qty' }); return; }
        const name = clean(b.name, 100), phone = phoneOf(b.phone), city = cityOf(b.city);
        if (name.length < 2) { res.status(400).json({ error: 'missing_name' }); return; }
        if (!phoneOk(phone)) { res.status(400).json({ error: 'bad_phone' }); return; }
        if (!city) { res.status(400).json({ error: 'missing_city' }); return; }
        const list = await readJSON(C.KEY, []);
        const names = Array.from({ length: qty }, (_, i) => clean((Array.isArray(b.names) ? b.names : [])[i], 80));
        const row = { id: crypto.randomUUID(), created: new Date().toISOString(), name, phone, city, tier, qty, amount: tier * qty, credit: C.TIERS[tier] * qty, forWho: names.some(Boolean) ? 'cadou' : 'eu',
          cards: names.map((n) => ({ code: '', recipient: n })), recipient: names[0] || '', status: 'rezervat', via: 'portal', pay: b.via === 'online' ? 'online' : 'clinica', addedBy: session.employeeId || '' };
        list.push(row);
        await writeJSON(C.KEY, list);
        const x = await C.confirm(row.id, row.pay, { by: session.employeeId || '', byName, method: b.method });
        res.status(200).json(Object.assign({ ok: true, reservation: x.row, cards: x.row.cards.map((c) => C.cardView(x.row, c)) }, await C.count(await readJSON(C.KEY, []))));
        return;
      }
      if (b.action === 'redeem') {
        const x = await C.redeem(b.code, b, session);
        res.status(x.error ? 400 : 200).json(x);
        return;
      }
      if (b.action === 'undo') { const x = await C.undo(b.code, session); res.status(x.error ? 400 : 200).json(x); return; }
      if (b.action === 'resend' || b.action === 'rename') {
        const list = await readJSON(C.KEY, []);
        const f = C.findCard(list, b.code);
        if (!f || f.r.status !== 'platit') { res.status(404).json({ error: 'not_found' }); return; }
        if (b.action === 'rename') {
          // the name on the card changed by the desk: the card goes to her again with it (the owner, 21.11); an order
          // waiting for her answer stops waiting
          f.c.recipient = clean(b.recipient, 80); if (f.r.cards[0] === f.c) f.r.recipient = f.c.recipient;
          if (f.r.naming && f.r.naming.state !== 'done') Object.assign(f.r.naming, { state: 'done', how: 'portal', doneAt: new Date().toISOString() });
          C.mark(f.r, 'renamed', byName ? 'de ' + byName : '');
          await writeJSON(C.KEY, list);
          if (b.send === false) { res.status(200).json({ ok: true, card: C.cardView(f.r, f.c) }); return; }
          const sent = await C.deliver(f.r, f.c);
          C.mark(f.r, 'card_sent', (sent.how ? 'ok' : 'netrimis') + ', nume nou');
          const l2 = await readJSON(C.KEY, []);
          const i = l2.findIndex((x) => x.id === f.r.id);
          if (i >= 0) { l2[i] = f.r; await writeJSON(C.KEY, l2); }
          res.status(200).json({ ok: !!sent.how, sent, card: C.cardView(f.r, f.c) });
          return;
        }
        const sent = await C.deliver(f.r, f.c);
        const l2 = await readJSON(C.KEY, []);
        const f2 = C.findCard(l2, b.code);
        if (f2) { f2.c.sent = sent; f2.c.img = f.c.img; await writeJSON(C.KEY, l2); }
        res.status(200).json({ ok: !!sent.how, sent, card: C.cardView(f.r, f.c) });
        return;
      }
      res.status(400).json({ error: 'bad_action' });
      return;
    }

    if (b.action === 'order' || b.action === 'status') {
      if (limited(b.action, ip, 120)) { res.status(429).json({ error: 'too_many' }); return; }
      const row = (await readJSON(C.KEY, [])).find((r) => r.id === clip(b.id, 60));
      if (!row || row.status === 'anulat') { res.status(404).json({ error: 'not_found' }); return; }
      res.status(200).json({ ok: true, paid: row.status === 'platit', order: orderOf(row) });
      return;
    }
    // back from the PayLink without paying: the question on the site, her answer (the id is the whole key: a random UUID)
    if (b.action === 'back' || b.action === 'answer') {
      if (limited(b.action, ip, b.action === 'back' ? 30 : 20)) { res.status(429).json({ error: 'too_many' }); return; }
      const id = clip(b.id, 60).toLowerCase();
      if (!UUID.test(id)) { res.status(404).json({ error: 'not_found' }); return; }
      const x = b.action === 'back' ? await C.back(id) : await C.answer(id, String(b.reason || ''));
      if (x.error) { res.status(x.error === 'not_found' ? 404 : x.error === 'bad_reason' ? 400 : 409).json(x); return; }
      res.status(200).json(Object.assign({ ok: true }, x, x.reservation ? { left: (await C.count(await readJSON(C.KEY, []))).left } : {}));
      // moved to the clinic from that window: her WhatsApp „Ți-am rezervat Cardul…”, as for a reservation from the block
      if (x.reservation && !x.again && !x.paid) { try { await C.reservedMsg(id); } catch (e) { console.error('card reserved msg:', e.message); } }
      return;
    }
    if (b.action) { res.status(401).json({ error: 'unauthorized' }); return; }

    // ---- an order from the site: online (to the PayLink) or reserved (paid in the clinic)
    if (limited('reserve', ip, 8)) { res.status(429).json({ error: 'too_many' }); return; }
    if (b.website || b.hp) { res.status(200).json({ ok: true }); return; } // the trap: a bot filled the hidden field
    const online = b.pay === 'online';
    const name = clean(b.name, 100);
    const phone = phoneOf(b.phone);
    const city = cityOf(b.city);
    const tier = Number(b.tier), qty = online ? 1 : Number(b.qty);
    if (!C.TIERS[tier]) { res.status(400).json({ error: 'bad_tier' }); return; }
    if (!Number.isInteger(qty) || qty < 1 || qty > C.MAXQ) { res.status(400).json({ error: 'bad_qty' }); return; }
    const gift = b.forWho === 'cadou' || (b.forWho == null && Array.isArray(b.names) && b.names.some((x) => clean(x, 80)));
    const names = online ? [gift ? clean(b.recipient || (b.names || [])[0], 80) : ''] : Array.from({ length: qty }, (_, i) => clean((Array.isArray(b.names) ? b.names : [])[i], 80));
    // only her phone and the clinic (the card block's field, both ways: the owner, 21.11); the name on the card comes on
    // WhatsApp after the payment
    if (!phoneOk(phone)) { res.status(400).json({ error: 'bad_phone' }); return; }
    if (!city) { res.status(400).json({ error: 'missing_city' }); return; }
    if (!(b.consent === true || b.consent === 'true' || b.consent === 'on')) { res.status(400).json({ error: 'missing_consent' }); return; }

    const now = Date.now();
    if (now >= Date.parse(C.DEADLINE)) { res.status(409).json({ error: 'closed' }); return; }
    const lk = online ? (await C.links())[tier] : null;
    if (online && !lk) { res.status(409).json({ error: 'no_link' }); return; }
    let list = await readJSON(C.KEY, []);
    const newId = crypto.randomUUID();
    const cnt0 = await C.count(list, now);
    const left0 = cnt0.left; // what is left of the wave of now (the next opens at once)
    const hers = list.filter((r) => C.live(r, now) && d9(r.phone) === d9(phone));
    // the same order again within 10 minutes (a second tap, back from the PayLink): the one she has
    const same = hers.find((r) => C.norm(r).tier === tier && r.qty === qty && r.pay === (online ? 'online' : 'clinica') && ['rezervat', 'asteptare'].includes(r.status) && now - Date.parse(r.created) < 10 * 60e3 &&
      r.cards.map((c) => fold(c.recipient)).join('|') === names.map(fold).join('|'));
    if (same) {
      if (online) { C.mark(same, 'to_paylink'); await writeJSON(C.KEY, list); }
      res.status(200).json(online ? { ok: true, again: true, id: same.id, link: lk, amount: same.amount } : { ok: true, again: true, reservation: publicOf(same), left: left0 }); return;
    }
    if (hers.reduce((n, r) => n + C.qtyOf(r), 0) + qty > 10) { res.status(409).json({ error: 'too_many_cards' }); return; }
    if (cnt0.wave.soldOut || left0 <= 0) { res.status(409).json({ error: 'sold_out' }); return; }
    if (left0 < qty) { res.status(409).json({ error: 'not_enough', left: left0 }); return; }

    // nothing is issued now: the codes come when the payment is confirmed (the owner, 21.11)
    const entry = { id: newId, created: new Date().toISOString(), name, phone, city, tier, qty, amount: tier * qty, credit: C.TIERS[tier] * qty, forWho: gift ? 'cadou' : 'eu',
      cards: names.map((n) => ({ code: '', recipient: n })), recipient: names[0] || '', status: online ? 'asteptare' : 'rezervat', via: 'site', pay: online ? 'online' : 'clinica', page: clip(b.page, 200), track: trackOf(req, b.page) };
    if (!name) entry.hint = await C.knownName(phone).catch(() => '');
    C.mark(entry, 'created');
    if (online) C.mark(entry, 'to_paylink');
    list.push(entry);
    await writeJSON(C.KEY, list);
    // two at the same second for the last cards: the later one gives way
    list = await readJSON(C.KEY, []);
    const before = list.filter((r) => C.live(r));
    const upTo = before.slice(0, before.findIndex((r) => r.id === entry.id) + 1).reduce((n, r) => n + C.qtyOf(r), 0);
    if (upTo > await C.total() || (await C.count(list.filter((r) => r.id !== entry.id))).wave.left < qty) {
      await writeJSON(C.KEY, list.filter((r) => r.id !== entry.id)); res.status(409).json({ error: 'sold_out' }); return;
    }

    const note = 'Card de Sărbători ' + (online ? 'trimis la plata online (PayLink myPOS), de confirmat plata; numele de pe card îl cerem pe WhatsApp după plată' : 'rezervat pe site, plata în clinică') + ': ' + qty + ' × ' + tier + ' lei (credit ' + C.TIERS[tier] + ' lei fiecare), de plată ' + entry.amount + ' lei' +
      (names.some(Boolean) ? ' · pe numele: ' + names.map((n) => n || '(al ei)').join(', ') : '');
    if (online) {
      res.status(200).json({ ok: true, id: entry.id, link: lk, amount: entry.amount, left: (await C.count(list)).left });
      await lead(entry, b, req, note); // after the answer: she goes to myPOS at once
      try {
        const N = require('./_lib/notify');
        await N.notifyMany({ readJSON, writeJSON }, await N.deskIds({ readJSON, writeJSON }, city), { kind: 'money', tone: 'info', go: 'carduri', tag: 'card-wait-' + entry.id,
          title: 'CARD DE SĂRBĂTORI' + N.cityTag(city) + ' - la plată online', text: (name || entry.hint || 'fără nume') + ' · ' + tier + ' lei · se confirmă singur când plata apare în myPOS; altfel „Confirmă plata” în Carduri' });
      } catch (e) { /* the order stands */ }
      return;
    }
    await lead(entry, b, req, note);
    res.status(200).json({ ok: true, reservation: publicOf(entry), left: (await C.count(await readJSON(C.KEY, []))).left });
    // after the answer: her WhatsApp „Ți-am rezervat Cardul de Sărbători…” with the card's picture (once; only the approved template)
    try { await C.reservedMsg(entry.id); } catch (e) { console.error('card reserved msg:', e.message); }
  } catch (err) {
    console.error('card-sarbatori error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'failed' });
  }
};
