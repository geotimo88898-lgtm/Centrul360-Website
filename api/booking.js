// /api/booking: the site's online booking (c360-book.js). Public, so: our own pages only (Origin), a hidden trap
// field, the consent box, a few tries per address and per phone.
//   GET  ?city=Timișoara&service=<offer key | consult | custom>&label=<custom name>
//        → { on, city, services, service, days: [{ date, slots: ['09:00', …] }] }
//   POST { city, service, label, date, time, name, phone, consent, hp, page }
//        → { ok, appointment: { date, time, endTime, location, treatment } } | { error: 'taken' | 'has_booking' | … }
// A booking is an ordinary appointment of the Calendar (createdBy 'site', status programată): its lead goes to
// "Programare stabilită" (a new one is made, source Site, without the site's welcome message: she has her booking),
// the booking flows send the confirmation and the reminders, the owner and reception are told.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const B = require('./_lib/booking');
const { normalizePhone, upsertClient } = require('./_lib/clients');
const workflows = require('./_lib/workflows');
const N = require('./_lib/notify');

const tries = new Map(); // ip → [times] (per warm instance)
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const cityOf = (v) => B.CITIES.find((c) => B.fold(c) === B.fold(v)) || '';
const ourOrigin = (o) => !o || /^https:\/\/([\w-]+\.)?centrul360\.com$/.test(o) || /^http:\/\/localhost(:\d+)?$/.test(o);
const DAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
const MONTHS = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
const nice = (d) => { const x = new Date(d + 'T12:00:00Z'); return DAYS[x.getUTCDay()] + ' ' + x.getUTCDate() + ' ' + MONTHS[x.getUTCMonth()]; };

async function pick(city, id, label) {
  const list = await B.services(city);
  if (id === 'custom') return { list, svc: B.custom(label, city) };
  return { list, svc: list.find((s) => s.id === id) || null };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!ourOrigin(String(req.headers.origin || ''))) { res.status(403).json({ error: 'forbidden' }); return; }
  try {
    if (req.method === 'GET') {
      const q = req.query || {};
      const city = cityOf(q.city) || 'Timișoara';
      // read together; the edge keeps the answer a few seconds (a booking checks the hour again, fresh)
      const [cfg, picked, appts] = await Promise.all([B.settings(), pick(city, clip(q.service, 60) || 'consult', q.label), readJSON('data/appointments.json', [])]);
      const { list, svc } = picked;
      const s = svc || list[0];
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=50');
      if (!cfg.on) { res.status(200).json({ on: false, city, services: list }); return; }
      res.status(200).json({ on: true, city, services: list, service: s, step: cfg.step, days: B.days(cfg, city, s.minutes, appts) });
      return;
    }
    const cfg = await B.settings();

    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    if (!cfg.on) { res.status(409).json({ error: 'off' }); return; }

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
    const now = Date.now();
    const mine = (tries.get(ip) || []).filter((t) => now - t < 30 * 60e3);
    if (mine.length >= 10) { res.status(429).json({ error: 'too_many' }); return; }
    tries.set(ip, mine.concat(now));

    let b = req.body || {};
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (b.website || b.hp) { res.status(200).json({ ok: true }); return; } // the trap: a bot filled the hidden field
    const name = clip(String(b.name || '').replace(/[<>]/g, ''), 100);
    let phone = normalizePhone(clip(b.phone, 30));
    if (/^7\d{8}$/.test(phone)) phone = '0' + phone; // typed without the 0
    const city = cityOf(b.city);
    if (name.length < 2) { res.status(400).json({ error: 'missing_name' }); return; }
    if (!/^07\d{8}$/.test(phone) && !/^[1-9]\d{10,14}$/.test(phone)) { res.status(400).json({ error: 'bad_phone' }); return; }
    if (!city) { res.status(400).json({ error: 'missing_city' }); return; }
    if (!(b.consent === true || b.consent === 'true' || b.consent === 'on')) { res.status(400).json({ error: 'missing_consent' }); return; }
    const { svc } = await pick(city, clip(b.service, 60), b.label);
    if (!svc) { res.status(400).json({ error: 'bad_service' }); return; }
    const date = clip(b.date, 10), time = clip(b.time, 5);
    if (!B.isDate(date) || B.toMin(time) == null) { res.status(400).json({ error: 'bad_time' }); return; }

    const appts = await readJSON('data/appointments.json', []);
    const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
    const today = B.roNow().date;
    // already booked: the same day, or three bookings ahead from the site (a click too many, a prank)
    const hers = appts.filter((a) => d9(a.clientPhone) === d9(phone) && a.date >= today && !['anulata', 'concediu', 'finalizata'].includes(a.status));
    const same = hers.find((a) => a.date === date);
    if (same) { res.status(409).json({ error: 'has_booking', at: { date: same.date, time: same.time, nice: nice(same.date), location: same.location } }); return; }
    if (hers.filter((a) => a.createdBy === 'site').length >= 3) { res.status(409).json({ error: 'too_many_bookings' }); return; }
    if (!B.freeOn(cfg, city, date, svc.minutes, appts).includes(time)) { res.status(409).json({ error: 'taken' }); return; }

    // the client: the one with this phone as she is (a name typed on the site never renames her), else a new one
    const clients = await readJSON('data/clients.json', []);
    const known = clients.find((c) => d9(c.phone) === d9(phone) && normalizePhone(c.phone) === phone);
    const client = known || await upsertClient({ name, phone }, { readJSON, writeJSON });

    const at = new Date().toISOString();
    const entry = {
      id: crypto.randomUUID(), date, time, endTime: B.hhmm(B.toMin(time) + svc.minutes),
      clientId: client.id, clientName: client.name || name, clientPhone: client.phone || phone,
      treatment: svc.title, categories: [svc.cat || 'corporale'], category: svc.cat || 'corporale',
      amount: svc.price || 0, location: city, cosmeticianId: '', cosmeticianName: '', status: 'programata', package: false,
      note: clip(['Programare online pe site', svc.id === 'consult' ? '' : svc.price ? svc.price + ' lei' : '', clip(b.page, 120)].filter(Boolean).join(' · '), 500),
      online: true, createdBy: 'site', createdAt: at, updatedAt: at,
    };
    appts.push(entry);
    await writeJSON('data/appointments.json', appts);

    // someone took the same hour in the same second: the later one gives way, nothing was sent yet
    const after = await readJSON('data/appointments.json', []);
    if (B.overbooked(cfg, after, entry)) {
      const keep = after.filter((a) => a.id !== entry.id);
      await writeJSON('data/appointments.json', keep);
      res.status(409).json({ error: 'taken' });
      return;
    }

    // the Pipeline: her lead (or a new one, source Site) goes to "Programare stabilită"
    const leads = require('./portal-leads');
    let lead = await leads.bookLead(entry, { author: 'Site · programare online' });
    if (!lead) {
      const r = await leads.createLead({ name: entry.clientName, phone: entry.clientPhone, source: 'site', location: city, createdBy: 'site-booking', interest: svc.title,
        note: 'S-a programat singură pe site: ' + date + ' ' + time, authorLabel: 'Site' }).catch(() => null);
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
      const ids = ['admin'].concat(employees.filter((e) => e.role === 'admin' || (e.role === 'receptie' && (!e.location || e.location === city))).map((e) => e.id));
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
    try {
      const R = require('./_lib/reminders');
      const [convos, tdoc] = await Promise.all([readJSON('data/whatsapp-conversations.json', []), require('./_lib/wa-templates').load()]);
      const sent = [].concat(...convos.map((c) => (c.messages || []).filter((m) => m.appt === entry.id && m.direction === 'out')));
      const label = (m) => ((tdoc.templates || []).find((t) => t.id === m.templateId) || {}).label || '';
      const asked = sent.some((m) => label(m).startsWith(R.siteLabel(city)));
      await require('./_lib/site-confirm').start(entry, asked ? '' : sent.length ? 'tpl' : 'nowa');
    } catch (e) { console.error('booking site-confirm:', e.message); }

    res.status(200).json({ ok: true, appointment: { date, time, endTime: entry.endTime, nice: nice(date), location: city, treatment: svc.title } });
  } catch (err) {
    console.error('booking error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
