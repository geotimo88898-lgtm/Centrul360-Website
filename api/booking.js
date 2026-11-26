// /api/booking: the site's online booking (c360-book.js). Public, so: our own pages only (Origin), a hidden trap
// field, the consent box, a few tries per address and per phone.
//   GET  ?city=Timișoara&service=<offer key | consult | custom>&label=<custom name>
//        → { on, city, services, service, days: [{ date, slots: ['09:00', …] }] }
//   POST { city, service, label, date, time, name, phone, consent, hp, page, event_id }   (event_id: the pixel's Schedule, see _lib/meta-capi.js)
//        → { ok, appointment: { id, date, time, endTime, location, treatment } } | { error: 'taken' | 'has_booking' | … }
//   POST { hold: true, city, service, label, treatment, date, time, page, src }  „Plătesc online”: the hour held 15 minutes while
//        she pays in the slip (the booking is made when it is paid, api/_lib/pay.js kind 'hold') → { ok, hold: { id, key, until } }
//   POST { release, key }                     the held hour let go (back, closed, or paying at the clinic after all)
// A booking is an ordinary appointment of the Calendar (createdBy 'site', status programată): its lead goes to
// "Programare stabilită" (a new one is made, source Site, without the site's welcome message: she has her booking),
// the booking flows send the confirmation and the reminders, the owner and reception are told.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const B = require('./_lib/booking');
const { normalizePhone, upsertClient } = require('./_lib/clients');
const workflows = require('./_lib/workflows');
const N = require('./_lib/notify');
const capi = require('./_lib/meta-capi');
const H = require('./_lib/booking-holds');

const tries = new Map(); // ip → [times] (per warm instance)
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const cityOf = (v) => B.CITIES.find((c) => B.fold(c) === B.fold(v)) || '';
const ourOrigin = (o) => !o || /^https:\/\/([\w-]+\.)?centrul360\.com$/.test(o) || /^http:\/\/localhost(:\d+)?$/.test(o);
const DAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const MONTHS = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
const nice = (d) => { const x = new Date(d + 'T12:00:00Z'); return DAYS[x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + MONTHS[x.getUTCMonth()]; };

async function pick(city, id, label, treatmentId) {
  const list = await B.services(city, { site: true }); // the site's booking: only the offers of the site
  // a treatment of the price list (Prețuri), by its id: its name, its fixed price and its length from the list, never the page's
  if (id === 'custom' && treatmentId) {
    const t = require('./_lib/pay').treatment(clip(treatmentId, 120), city);
    if (t) return { list, svc: { id: 'custom', title: t.group === 'faciale' ? t.title.replace(/^[^·]+·\s*/, '') : t.title, sub: '', price: t.price, old: t.old || 0, minutes: t.minutes, cat: t.cat === 'epilare' ? 'epilare' : t.cat, treatment: t.id } };
    return { list, svc: null };
  }
  if (id === 'custom') return { list, svc: B.custom(label, city) };
  return { list, svc: list.find((s) => s.id === id) || null };
}

// „Plătesc online”: the hour is held (booking-holds.js) and the payment opens; the booking is made when it is paid
//   POST { hold: true, city, service, label, treatment, date, time, page, src } → { ok, hold: { id, key, until } }
async function hold(req, res, cfg, b) {
  const P = require('./_lib/pay');
  const city = cityOf(b.city);
  if (!city) { res.status(400).json({ error: 'missing_city' }); return; }
  if (!(await P.status()).on) { res.status(409).json({ error: 'pay_off' }); return; }
  const { svc } = await pick(city, clip(b.service, 60), b.label, b.treatment);
  if (!svc || svc.id === 'consult' || !(svc.price > 0) || (svc.id === 'custom' && !svc.treatment)) { res.status(400).json({ error: 'not_payable' }); return; }
  const date = clip(b.date, 10), time = clip(b.time, 5);
  if (!B.isDate(date) || B.toMin(time) == null) { res.status(400).json({ error: 'bad_time' }); return; }
  const appts = await readJSON('data/appointments.json', []);
  const holds = await H.all();
  // her own earlier hold of the same hour (she went back and came again) doesn't stand in her way
  if (b.prev) { const old = holds.find((h) => h && h.id === String(b.prev) && h.key === String(b.prevKey || '')); if (old) { await H.release(old.id); old.released = 'now'; } }
  if (!B.freeOn(cfg, city, date, svc.minutes, appts.concat(H.asAppts(holds))).includes(time)) { res.status(409).json({ error: 'taken' }); return; }
  const h = await H.add({ key: crypto.randomBytes(12).toString('hex'), city, svc: { id: svc.id, title: svc.title, price: svc.price, old: svc.old || 0, minutes: svc.minutes, cat: svc.cat || '', treatment: svc.treatment || '' },
    date, time, endTime: B.hhmm(B.toMin(time) + svc.minutes), page: clip(b.page, 120), src: b.src && typeof b.src === 'object' ? b.src : null, cookie: /(^|;\s*)_fbc=fb\./.test(String((req.headers && req.headers.cookie) || '')) ? '_fbc=fb.' : '', // only whether Facebook sent her (sourceOf)
    app: B.appOf(req.headers && req.headers['user-agent']), // only the app whose browser she is in (sourceOf)
    track: capi.fromRequest(req, b.page) });
  // two at the same second: the later one gives way
  const again = await H.all();
  const mine = again.find((x) => x.id === h.id);
  if (B.overbooked(cfg, appts.concat(H.asAppts(again.filter((x) => x.id !== h.id && Date.parse(x.createdAt) <= Date.parse(h.createdAt)))), { id: 'hold-' + h.id, location: city, date, time, endTime: h.endTime })) {
    await H.release(h.id);
    res.status(409).json({ error: 'taken' });
    return;
  }
  res.status(200).json({ ok: true, hold: { id: h.id, key: h.key, until: (mine || h).until, minutes: H.HOLD_MIN } });
}

// A booking of the site, once everything about it was checked (the form's POST below, or a payment of the slip's checkout
// that held its hour: api/_lib/pay.js kind 'hold'): the client, the appointment, the Pipeline, the messages, the bell.
// o: { cfg, city, svc, date, time, name, phone, page, src, cookie, ua, track, pay, payAmount, viaCheckout, paid, appts }
// → { entry, lead } | { error: 'taken' }
async function place(o) {
  const { cfg, city, svc, date, time, name, phone, pay, payAmount, viaCheckout } = o;
  const P = require('./_lib/pay');
  const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
  const appts = o.appts || await readJSON('data/appointments.json', []);
  // the client: the one with this phone as she is (a name typed on the site never renames her), else a new one
  const clients = await readJSON('data/clients.json', []);
  const known = clients.find((c) => d9(c.phone) === d9(phone) && normalizePhone(c.phone) === phone);
  const client = known || await upsertClient({ name, phone }, { readJSON, writeJSON });

  const at = new Date().toISOString();
  // a city with one cosmetician (Arad): the booking goes straight on her (B.soleCosmetician)
  const who = B.soleCosmetician(cfg, city, date, time, appts);
  const entry = {
    id: crypto.randomUUID(), date, time, endTime: B.hhmm(B.toMin(time) + svc.minutes),
    clientId: client.id, clientName: client.name || name, clientPhone: client.phone || phone,
    treatment: svc.title, categories: [svc.cat || 'corporale'], category: svc.cat || 'corporale',
    amount: svc.price || 0, location: city, cosmeticianId: who ? who.id : '', cosmeticianName: who ? who.name : '', status: 'programata', package: !!o.multi,
    // a deposit (26.11): 49 lei paid online, the rest at the clinic, at the price of the order (Black Friday kept)
    note: clip([o.deposit ? 'AVANS ONLINE ' + o.deposit.paid + ' lei. DE ÎNCASAT LA CLINICĂ: ' + o.deposit.rest + ' lei (prețul comenzii, păstrat)' : '',
      Array.isArray(o.order) && o.order.length ? (o.deposit ? 'Comandă online cu avans: ' : 'Comandă online plătită: ') + o.order.join('; ') + (o.multi ? '. Azi e prima ședință; restul se programează de recepție' : '') : '', 'Programare online pe site', svc.id === 'consult' ? '' : svc.price ? svc.price + ' lei' : '', payAmount && !o.deposit ? 'Plată online ' + payAmount + ' lei' + (viaCheckout ? ', pe site' : ', de verificat în myPOS') : '',
      o.bonus && o.bonus.type === 'gift' ? 'Cadou la plata online: ' + o.bonus.gift : '', clip(o.page, 120)].filter(Boolean).join(' · '), 500),
    // track: her browser's ids, for the Purchase when she pays
    ...(payAmount ? { pay, payAmount, track: o.track || null, ...(viaCheckout ? { payVia: 'checkout', payBonus: o.bonus && o.bonus.type === 'gift' ? 0 : (o.bonus && o.bonus.pct) || P.BONUS_PCT, ...(o.bonus && o.bonus.type === 'gift' ? { payGift: o.bonus.gift } : {}) } : {}) } : pay === 'clinic' ? { pay } : {}),
    ...(svc.treatment ? { priceListId: svc.treatment } : {}),
    ...(o.holdId ? { holdId: o.holdId } : {}),
    // paid before it was made (the shop, 25.11): it is confirmed, so no „confirm it” message and no call to confirm it
    ...(o.paid ? { paidOnSite: true } : {}),
    ...(o.deposit && o.deposit.rest > 0 ? { deposit: { paid: o.deposit.paid, total: o.deposit.total, rest: o.deposit.rest } } : {}),
    online: true, createdBy: 'site', createdAt: at, updatedAt: at,
    src: B.sourceOf(o.src, o.cookie, o.ua), // where she came from: saved, not shown in the Calendar
  };
  appts.push(entry);
  await writeJSON('data/appointments.json', appts);

  // someone took the same hour in the same second: the later one gives way, nothing was sent yet
  const after = await readJSON('data/appointments.json', []);
  if (B.overbooked(cfg, after, entry)) {
    // a booking already paid keeps its hour (the desk moves it with her); any other gives way
    if (!o.paid) {
      const keep = after.filter((a) => a.id !== entry.id);
      await writeJSON('data/appointments.json', keep);
      return { error: 'taken' };
    }
    entry.overbooked = true;
  }

  // the Pipeline: her lead (or a new one, source Site) goes to "Programare stabilită"
  const leads = require('./portal-leads');
  let lead = await leads.bookLead(entry, { author: 'Site · programare online' });
  if (!lead) {
    const r = await leads.createLead({ name: entry.clientName, phone: entry.clientPhone, source: 'site', location: city, createdBy: 'site-booking', interest: svc.title,
      note: 'S-a programat singură pe site: ' + date + ' ' + time, authorLabel: 'Site', src: entry.src }).catch(() => null);
    if (r && r.lead) lead = await leads.bookLead(entry, { leadId: r.lead.id, author: 'Site · programare online' });
  }
  if (lead) {
    const list = await readJSON('data/appointments.json', []);
    const row = list.find((a) => a.id === entry.id);
    if (row && !row.leadId) { row.leadId = lead.id; entry.leadId = lead.id; await writeJSON('data/appointments.json', list); }
  }

  // the confirmation and the reminders (Automatizări), as for a booking made at the desk
  await workflows.emit('appointment_created', { appointment: entry });


  // the owner and reception: in the bell and on their phones
  try {
    const employees = (await readJSON('data/employees.json', [])).filter((e) => e.active !== false);
    const ids = ['admin'].concat(employees.filter((e) => e.role === 'admin' || (e.role === 'manager' && require('./_lib/roles').managesCity(e, city)) || e.role === 'receptie').map((e) => e.id)) // reception: one desk for both clinics (_lib/city.js)
      .concat(who ? [who.id] : []); // and the cosmetician it went to
    const offers = require('./_lib/offers');
    const what = svc.id === 'consult' ? 'Consultație gratuită' : svc.id === 'custom' ? svc.title : offers.shortName(await offers.loadOffers(readJSON), svc.title);
    await N.notifyMany({ readJSON, writeJSON }, [...new Set(ids)], {
      kind: 'booking', tone: 'good', go: 'programari', tag: 'appt-' + entry.id,
      // its own look (the owner, 5.11): PROGRAMARE SITE TM 📅🌐 - HIFU Gușă 190, the client's name under it
      title: 'PROGRAMARE SITE ' + ({ 'Timișoara': 'TM', Arad: 'AR' })[city] + ' 📅🌐' + (what ? ' - ' + what : ''),
      text: entry.clientName,
    });
  } catch (e) { /* a notification never blocks a booking */ }

  // valid once she confirms it (_lib/site-confirm.js): the message asking for it went → the reminder after 4 hours
  // and the cancel; it didn't (no WhatsApp, not approved, the flow off) or the booking is too close → Giovanna calls
  if (!o.paid) try {
    const R = require('./_lib/reminders');
    const [convos, tdoc] = await Promise.all([readJSON('data/whatsapp-conversations.json', []), require('./_lib/wa-templates').load()]);
    const sent = [].concat(...convos.map((c) => (c.messages || []).filter((m) => m.appt === entry.id && m.direction === 'out')));
    const label = (m) => ((tdoc.templates || []).find((t) => t.id === m.templateId) || {}).label || '';
    const asked = sent.some((m) => label(m).startsWith(R.siteLabel(city)));
    await require('./_lib/site-confirm').start(entry, asked ? '' : sent.length ? 'tpl' : 'nowa');
  } catch (e) { console.error('booking site-confirm:', e.message); }

  return { entry, lead };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!ourOrigin(String(req.headers.origin || ''))) { res.status(403).json({ error: 'forbidden' }); return; }
  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      const city = cityOf(q.city) || 'Timișoara';
      // read together; the edge keeps the answer a few seconds (a booking checks the hour again, fresh)
      const [cfg, picked, appts0, holds] = await Promise.all([B.settings({ team: true }), pick(city, clip(q.service, 60) || 'consult', q.label, q.treatment), readJSON('data/appointments.json', []), H.all()]);
      const appts = appts0.concat(H.asAppts(holds)); // an hour held while someone pays online is taken
      const { list, svc } = picked;
      const s = svc || list[0];
      // what each one gets when paid online (the offer's own bonus, the price list's default): the pay step shows it
      const P = require('./_lib/pay');
      const offers = await require('./_lib/offers').loadOffers(readJSON, null);
      for (const x of list.concat(svc && svc.id === 'custom' ? [svc] : [])) { const bb = await P.bonusFor(x, offers); if (bb) x.bonus = bb; }
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=50');
      if (!cfg.on) { res.status(200).json({ on: false, city, services: list }); return; }
      // the shop's visit can be longer than the price list's row (Full Body: every zone, up to 90 min, 25.11): the hours for
      // the length the hold will check (api/shop.js, the quote's main line)
      const mins = Math.round(Number(q.minutes));
      const dur = svc && svc.id === 'custom' && mins >= 10 && mins <= 240 ? Math.max(mins, s.minutes || 0) : s.minutes;
      res.status(200).json({ on: true, city, services: list, service: s, step: cfg.step, days: B.days(cfg, city, dur, appts) });
      return;
    }
    const cfg = await B.settings({ team: true });

    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    if (!cfg.on) { res.status(409).json({ error: 'off' }); return; }

    let b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    // a few tries per address: bookings, and apart the hours held to pay online (letting one go is never counted)
    if (!b.release) {
      const ip = (b.hold ? 'h|' : '') + (String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x');
      const now = Date.now();
      const mine = (tries.get(ip) || []).filter((t) => now - t < 30 * 60e3);
      if (mine.length >= (b.hold ? 15 : 10)) { res.status(429).json({ error: 'too_many' }); return; }
      tries.set(ip, mine.concat(now));
    }
    if (b.website || b.hp) { res.status(200).json({ ok: true }); return; } // the trap: a bot filled the hidden field
    if (b.hold) { await hold(req, res, cfg, b); return; }
    if (b.release) { const h = await H.get(clip(b.release, 40)); if (h && h.key && h.key === String(b.key || '')) await H.release(h.id); res.status(200).json({ ok: true }); return; }
    const name = clip(String(b.name || '').replace(/[<>]/g, ''), 100);
    let phone = normalizePhone(clip(b.phone, 30));
    if (/^7\d{8}$/.test(phone)) phone = '0' + phone; // typed without the 0
    const city = cityOf(b.city);
    if (name.length < 2) { res.status(400).json({ error: 'missing_name' }); return; }
    if (!/^07\d{8}$/.test(phone) && !/^[1-9]\d{10,14}$/.test(phone)) { res.status(400).json({ error: 'bad_phone' }); return; }
    if (!city) { res.status(400).json({ error: 'missing_city' }); return; }
    if (!(b.consent === true || b.consent === 'true' || b.consent === 'on')) { res.status(400).json({ error: 'missing_consent' }); return; }
    const { svc } = await pick(city, clip(b.service, 60), b.label, b.treatment);
    if (!svc) { res.status(400).json({ error: 'bad_service' }); return; }
    const date = clip(b.date, 10), time = clip(b.time, 5);
    if (!B.isDate(date) || B.toMin(time) == null) { res.status(400).json({ error: 'bad_time' }); return; }

    // how she chose to pay (the site's pay step, c360-book.js): 'online-pending' (she is sent to the myPOS link, the team
    // checks the money in myPOS) with what she pays, or 'clinic'. Old pages send nothing: nothing is saved.
    // 'online-checkout' (23.11): paid in the slip itself through the site's checkout (api/pay.js); the sum is the server's (the
    // price minus the online bonus), the booking is paid only on myPOS's signed word for its order (api/_lib/pay.js)
    const P = require('./_lib/pay');
    const viaCheckout = b.pay === 'online-checkout' && svc.price > 0 && svc.id !== 'consult';
    if (b.pay === 'online-checkout' && !viaCheckout) { res.status(400).json({ error: 'not_payable' }); return; }
    if (viaCheckout && !(await P.status()).on) { res.status(409).json({ error: 'pay_off' }); return; }
    const pay = viaCheckout ? 'online-pending' : b.pay === 'online-pending' || b.pay === 'clinic' ? b.pay : '';
    const vb = viaCheckout ? await P.bonusFor(svc) : null;
    const payAmount = viaCheckout ? vb.amount : pay === 'online-pending' && Number.isInteger(Number(b.payAmount)) && Number(b.payAmount) > 0 &&
      Number(b.payAmount) <= (svc.price > 0 ? svc.price : svc.id === 'custom' ? 20000 : 0) ? Number(b.payAmount) : 0;
    const appts = await readJSON('data/appointments.json', []);
    const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
    const today = B.roNow().date;
    // already booked: the same day, or three bookings ahead from the site (a click too many, a prank)
    const hers = appts.filter((a) => d9(a.clientPhone) === d9(phone) && a.date >= today && !['anulata', 'concediu', 'finalizata'].includes(a.status));
    const same = hers.find((a) => a.date === date);
    if (same) { res.status(409).json({ error: 'has_booking', at: { date: same.date, time: same.time, nice: nice(same.date), location: same.location } }); return; }
    if (hers.filter((a) => a.createdBy === 'site').length >= 3) { res.status(409).json({ error: 'too_many_bookings' }); return; }
    if (!B.freeOn(cfg, city, date, svc.minutes, appts.concat(H.asAppts(await H.all()))).includes(time)) { res.status(409).json({ error: 'taken' }); return; }

    const placed = await place({ cfg, city, svc, date, time, name, phone, page: b.page, src: b.src, cookie: req.headers && req.headers.cookie, ua: req.headers && req.headers['user-agent'],
      track: payAmount ? capi.fromRequest(req, b.page) : null, pay, payAmount, viaCheckout, appts, bonus: vb });
    if (placed.error) { res.status(409).json({ error: placed.error }); return; }
    const { entry, lead } = placed;
    res.status(200).json({ ok: true, appointment: { id: entry.id, date, time, endTime: entry.endTime, nice: nice(date), location: city, treatment: svc.title, ...(viaCheckout ? { payAmount } : {}) } });
    // the booking's Schedule, from the server too (Conversions API), with the event_id the page gave its pixel: counted once
    await capi.soon(() => capi.siteEvent(req, { name: 'Schedule', eventId: b.event_id, phone: entry.clientPhone, leadId: lead && lead.id, custom: { value: svc.price || 0 } }));
  } catch (err) {
    console.error('booking error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
module.exports.place = place;
module.exports.pick = pick;
