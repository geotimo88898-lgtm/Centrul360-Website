// The site's bookings paid online (c360-book.js PAY_LINKS: one fixed-amount myPOS link per offer, its price minus 10%).
// The booking is saved first with pay 'online-pending' and payAmount (api/booking.js); then she pays on myPOS. On the clock
// (api/booking-pay-tick.js, every 5 minutes, only while a booking waits) the myPOS payments that are not a POS terminal's
// (card-sarbatori.js scanMypos, read only) are paired with the bookings, the same way the Card de Sărbători does it:
//   - a payment of the same sum, at most 48 hours after the booking was made, the oldest booking first, each payment once
//   - two or more bookings waiting for the same sum (HIFU and Restart are both 171, the two cavitații 252): never a guess,
//     the payment waits in „De verificat” (the bookings show it in the Calendar) until only one of them still waits, or the
//     desk says which one it was (pick)
//   - a payment of the sum of a recent online booking that waits for nothing (cancelled meanwhile): the desk hears it
// Paired: the booking becomes „plătită online” (pay 'online-paid', paidOnline { amount, ref, at, saleId }), confirmed (she
// paid, the wait for her „Confirm” ends), a row in Încasări (source 'incasare', card, online, linked to the booking), the
// WhatsApp confirmation (the approved „Reamintiri · Confirmare · <oraș>” template) and the desk's bell.
//   data/booking-paid-refs.json  [{ id, ref, amount, at, src, found, state: 'done' | 'open' | 'none' | 'orphan', appt,
//                                   cands: [appointment id], doneAt, by }]
const crypto = require('crypto');
const store = require('./store');
const { readJSON, writeJSON } = store;

const KEY = 'data/booking-paid-refs.json';
const SCAN = 'data/booking-pay-scan.json';
const MATCH_MS = 48 * 3600e3;
const nowISO = () => new Date().toISOString();
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const lei = (n) => Math.round(Number(n) || 0).toLocaleString('ro-RO');
const roDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const madeAt = (a) => Date.parse(a.createdAt) || 0;
const waits = (a) => !!a && a.pay === 'online-pending' && Number(a.payAmount) > 0 && !a.paidOnline && !['anulata', 'concediu'].includes(a.status);
const same = (x, y) => Math.abs(Number(x) - Number(y)) < 0.01;
// a booking paid through the site's own checkout (payVia 'checkout', api/_lib/pay.js) is paid only on myPOS's signed word for
// its order, never by a matching sum: only the old link payments are paired here
const candsOf = (appts, amount, t) => appts.filter((a) => waits(a) && a.payVia !== 'checkout' && same(a.payAmount, amount) && madeAt(a) <= t + 5 * 60e3 && t - madeAt(a) <= MATCH_MS)
  .sort((a, b) => madeAt(a) - madeAt(b));
const desk = (loc) => require('./notify').deskIds({ readJSON }, loc || '');

// the payment in Încasări: once per booking (a second call finds it)
async function recordSale(a, p) {
  const sales = await readJSON('data/sales.json', []);
  const had = sales.find((s) => s && s.source === 'incasare' && s.bookingPay && s.appointmentId === a.id && s.kind !== 'refund');
  if (had) return had;
  const entry = {
    id: crypto.randomUUID(), source: 'incasare', bookingPay: true, label: a.deposit ? 'Avans online programare' : 'Plată online programare', ...(a.deposit ? { deposit: true } : {}), appointmentId: a.id, online: true, // a myPOS link, never a POS terminal's
    employeeId: 'site-booking', performedBy: '', clientId: a.clientId || '', client: a.clientName || '', clientPhone: a.clientPhone || '',
    date: roDay(Date.parse(p.at) || Date.now()), location: a.location || '', categories: a.categories || [], category: a.category || '',
    treatment: (a.treatment || 'Programare') + (a.deposit ? ' · avans online, restul de ' + a.deposit.rest + ' lei la clinică' : a.payGift ? ' · plătită online · cadou: ' + a.payGift : ' · plătită online, cu ' + (Number(a.payBonus) || 10) + '% reducere'), amount: r2(p.amount), bookedAmount: 0, upsell: 0,
    ...(a.payGift ? { gift: a.payGift } : {}),
    method: 'card', split: null, status: 'recorded', commission: 0, note: 'Online (myPOS) · programarea din ' + a.date + ' ' + (a.time || '') + (p.orderId ? ' · comanda ' + p.orderId : ''),
    ...(p.orderId ? { payOrderId: p.orderId } : {}),
    createdAt: nowISO(), decidedAt: null,
  };
  sales.push(entry);
  await writeJSON('data/sales.json', sales);
  return entry;
}

// her WhatsApp: the clinic's approved confirmation (the same as for a booking made at the desk), once
async function confirmMsg(a) {
  const WF = require('./workflows'), WT = require('./wa-templates'), WA = require('./whatsapp');
  const wa = { tpls: (await WT.load()).templates, cfg: await WA.loadConfig() };
  const base = 'Reamintiri · Confirmare · ' + a.location;
  const n = wa.cfg && wa.cfg.numbers && wa.cfg.numbers[a.location];
  const t = n && wa.tpls.filter((x) => (x.label === base || String(x.label || '').startsWith(base + ' · v')) && WT.approvedFor(x, n.wabaId))
    .sort((x, y) => String(y.updatedAt || '').localeCompare(String(x.updatedAt || '')))[0];
  if (!t) return { skipped: 'tpl' };
  // the reminder flow already sent her the confirmation for this booking (a booking paid on the site, 25.11): not twice
  try {
    const convos = await readJSON('data/whatsapp-conversations.json', []);
    const label = (m) => ((wa.tpls.find((x) => x.id === m.templateId) || {}).label || '');
    if (convos.some((c) => (c.messages || []).some((m) => m.appt === a.id && m.direction === 'out' && label(m).startsWith(base)))) return { dup: true };
  } catch (e) { /* no record: the message goes, once */ }
  const settings = (await WF.loadDoc()).settings || {};
  const v = WF.vars({ appointment: a, lead: null, clients: [] }, settings);
  return WF.sendOnce('booking-paid|' + a.id, () => WF.sendTemplate(wa, t.id, a.location, a.clientPhone, v, { appt: a.id, akey: WF.apptKey(a) }));
}

// The booking is paid: written only over the calendar as it was read
async function markPaid(apptId, p, by) {
  for (let round = 0; round < 5; round++) {
    const { data: appts, etag } = await store.readJSONTagged('data/appointments.json', []);
    const a = appts.find((x) => x && x.id === apptId);
    if (!waits(a)) return null;
    const sale = await recordSale(a, p);
    const confirmNow = a.status === 'programata';
    Object.assign(a, { pay: 'online-paid', paidOnline: { amount: r2(p.amount), ref: p.ref, at: p.at || nowISO(), src: p.src || 'mypos', saleId: sale.id, by: by || 'auto', ...(p.orderId ? { orderId: p.orderId } : {}) }, updatedAt: nowISO() });
    delete a.payCheck;
    if (confirmNow) Object.assign(a, { status: 'confirmata', statusBy: 'Automat: plătită online' });
    if (!(await store.writeJSONIf('data/appointments.json', appts, etag))) continue;
    // she paid: the wait for her „Confirm” ends (site-confirm.js settles it on its next tick), the call to confirm it closes
    try {
      const tasks = await readJSON('data/automation-tasks.json', []);
      const open = tasks.filter((t) => t.confirmAppt && t.relatedAppointmentId === a.id && t.status === 'pending');
      if (open.length) { open.forEach((t) => { t.status = 'done'; t.doneAt = nowISO(); t.doneBy = 'Plătită online'; }); await writeJSON('data/automation-tasks.json', tasks); }
    } catch (e) { /* the task closes by itself at her hour */ }
    if (confirmNow) await require('./workflows').emit('appointment_status', { appointment: a, status: 'confirmata' }).catch(() => {});
    const msg = await confirmMsg(a).catch((e) => ({ error: e.message }));
    await require('./notify').notifyMany({ readJSON, writeJSON }, await desk(a.location), {
      kind: 'booking', tone: 'good', go: 'programari', tag: 'paid-' + a.id,
      title: (a.deposit ? 'AVANS ONLINE ' : 'PLĂTITĂ ONLINE ') + ({ 'Timișoara': 'TM', Arad: 'AR' })[a.location] + ' 💳 - ' + lei(p.amount) + ' lei',
      text: (a.clientName || '') + ' · ' + (a.treatment || '') + ' · ' + a.date + ' ' + (a.time || '') + (a.deposit ? ' · la clinică mai plătește ' + lei(a.deposit.rest) + ' lei' : '') + (a.package && a.paidOnSite ? ' · a plătit mai multe ședințe: programează-le pe celelalte' : '') + (msg && (msg.sent || msg.dup) ? '' : ' · confirmarea pe WhatsApp nu a plecat, anunț-o tu'),
    }).catch(() => {});
    // the sale goes back to Meta (Conversions API) as a Purchase in RON, with her browser's ids from the booking (like the card)
    try {
      const capi = require('./meta-capi');
      const t = a.track || {};
      await capi.soon(() => capi.laterEvent({ name: 'Purchase', eventId: 'purchase.booking.' + a.id, phone: a.clientPhone, leadId: a.leadId, url: t.url,
        custom: { value: r2(p.amount) } }, t));
    } catch (e) { console.error('booking purchase capi:', e.message); }
    return { appt: a, sale, msg };
  }
  return null;
}

// n: how many bookings wait for that payment (shown in the Calendar); 0 takes the mark off
async function markCheck(ids, n) {
  for (let round = 0; round < 5; round++) {
    const { data: appts, etag } = await store.readJSONTagged('data/appointments.json', []);
    let any = false;
    appts.forEach((a) => { if (a && ids.includes(a.id) && waits(a) && (a.payCheck || 0) !== n) { if (n) a.payCheck = n; else delete a.payCheck; any = true; } });
    if (!any || (await store.writeJSONIf('data/appointments.json', appts, etag))) return;
  }
}

// the bookings of the checks just closed that no open check holds any more
function stillOpen(refs, appts, ids) {
  const held = new Set(refs.filter((x) => x.state === 'open').flatMap((x) => x.cands));
  return (ids || appts.filter((a) => a && a.payCheck).map((a) => a.id)).filter((id) => !held.has(id));
}
// pays: [{ ref, amount, at, src }] (scanMypos). Returns what was paired: [{ appt, ref }]
async function matchPays(pays) {
  const refs = await readJSON(KEY, []).catch(() => []);
  const appts = await readJSON('data/appointments.json', []);
  const used = new Set(refs.map((x) => x.ref));
  const done = [];
  let changed = false;
  // the payments in „De verificat” whose bookings came down to one (or none)
  for (const c of refs.filter((x) => x.state === 'open')) {
    const still = c.cands.filter((id) => waits(appts.find((y) => y && y.id === id)));
    if (still.length > 1) continue;
    changed = true;
    if (!still.length) { Object.assign(c, { state: 'none', doneAt: nowISO() }); continue; }
    const x = await markPaid(still[0], c, 'auto');
    if (x) { Object.assign(c, { state: 'done', appt: still[0], doneAt: nowISO(), by: 'auto' }); done.push({ appt: still[0], ref: c.ref }); }
  }
  if (changed) await markCheck(stillOpen(refs, appts), 0);
  const fresh = await readJSON('data/appointments.json', []);
  for (const p of (pays || []).slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    if (!p.ref || used.has(p.ref) || !(Number(p.amount) > 0)) continue;
    const t = Date.parse(p.at) || Date.now();
    // the same sum as a booking paid through the site's checkout (still waiting for myPOS's word, or just paid): that
    // payment is surely the checkout's own, left alone (asked about again on the next scan, when the checkout has settled)
    if (fresh.some((a) => a && a.payVia === 'checkout' && same(a.payAmount, p.amount) && (a.paidOnline ? Math.abs(t - (Date.parse(a.paidOnline.at) || 0)) < 30 * 60e3 : waits(a) && t - madeAt(a) <= MATCH_MS && madeAt(a) <= t + 5 * 60e3))) continue;
    // and any payment of the checkout itself (its reference, or the sum of one of its orders still waiting or just paid)
    if (await require('./pay').isCheckoutPayment(p).catch(() => false)) continue;
    const cands = candsOf(fresh, p.amount, t);
    if (!cands.length) {
      // the sum of a recent online booking that waits for nothing (cancelled before she paid): the desk looks at it
      const near = fresh.find((a) => a && a.payVia !== 'checkout' && (a.pay === 'online-pending' || a.pay === 'online-paid') && same(a.payAmount, p.amount) && Math.abs(t - madeAt(a)) <= 7 * 864e5);
      if (near && !refs.some((x) => x.ref === p.ref)) {
        used.add(p.ref); changed = true;
        refs.push({ id: crypto.randomUUID().slice(0, 12), ref: p.ref, amount: r2(p.amount), at: p.at, src: p.src || 'mypos', found: nowISO(), cands: [], state: 'orphan' });
        await require('./notify').notifyMany({ readJSON, writeJSON }, await desk(near.location), { kind: 'booking', tone: 'info', go: 'programari', tag: 'paid-orphan-' + p.ref,
          title: 'PLATĂ ONLINE FĂRĂ PROGRAMARE 💳 - ' + lei(p.amount) + ' lei', text: 'Nicio programare nu mai așteaptă suma asta (anulată?). Vezi în myPOS cine a plătit și sun-o.' }).catch(() => {});
      }
      continue;
    }
    used.add(p.ref); changed = true;
    if (cands.length > 1) {
      refs.push({ id: crypto.randomUUID().slice(0, 12), ref: p.ref, amount: r2(p.amount), at: p.at, src: p.src || 'mypos', found: nowISO(), cands: cands.map((x) => x.id), state: 'open' });
      await markCheck(cands.map((x) => x.id), cands.length);
      await require('./notify').notifyMany({ readJSON, writeJSON }, await desk(cands[0].location), { kind: 'booking', tone: 'info', go: 'programari', tag: 'paid-check-' + p.ref,
        title: 'PLATĂ ONLINE DE VERIFICAT 💳 - ' + lei(p.amount) + ' lei', text: cands.length + ' programări așteaptă aceeași sumă: ' + cands.map((x) => (x.clientName || '') + ' ' + x.date + ' ' + (x.time || '')).join(', ') + '. Vezi în myPOS cine a plătit.' }).catch(() => {});
      continue;
    }
    const x = await markPaid(cands[0].id, p, 'auto');
    refs.push({ id: crypto.randomUUID().slice(0, 12), ref: p.ref, amount: r2(p.amount), at: p.at, src: p.src || 'mypos', found: nowISO(), cands: [cands[0].id], state: x ? 'done' : 'none', appt: x ? cands[0].id : '', doneAt: nowISO(), by: 'auto' });
    if (x) { done.push({ appt: cands[0].id, ref: p.ref }); const y = fresh.find((z) => z.id === cands[0].id); if (y) y.pay = 'online-paid'; }
  }
  if (changed) await writeJSON(KEY, refs.slice(-500));
  return done;
}

// the desk's choice in „De verificat”: this payment is hers (after looking in myPOS who paid)
async function pick(checkId, apptId, by) {
  const refs = await readJSON(KEY, []);
  const c = refs.find((x) => x.id === checkId);
  if (!c || c.state !== 'open') return { error: 'not_open' };
  if (!c.cands.includes(apptId)) return { error: 'not_candidate' };
  const x = await markPaid(apptId, c, by || 'desk');
  if (!x) return { error: 'not_waiting' };
  const l2 = await readJSON(KEY, []);
  const c2 = l2.find((y) => y.id === checkId);
  if (c2) { Object.assign(c2, { state: 'done', appt: apptId, doneAt: nowISO(), by: by || 'desk' }); await writeJSON(KEY, l2); }
  await markCheck(stillOpen(l2, await readJSON('data/appointments.json', []), c.cands), 0); // the others of that check wait for their own payment again
  return { ok: true, appt: x.appt.id, sale: x.sale.id };
}
async function openChecks() { return (await readJSON(KEY, []).catch(() => [])).filter((x) => x.state === 'open'); }

// on the clock: only while a booking waits for its payment (or a payment waits in „De verificat”), at most every 3 minutes
async function autoMatch(force) {
  const appts = await readJSON('data/appointments.json', []);
  const waiting = appts.filter((a) => waits(a) && a.payVia !== 'checkout' && Date.now() - madeAt(a) < MATCH_MS);
  const checks = await openChecks();
  if (!waiting.length && !checks.length && !force) return { waiting: 0 };
  const last = await readJSON(SCAN, {}).catch(() => ({}));
  if (!force && last.at && Date.now() - Date.parse(last.at) < 3 * 60e3) return { waiting: waiting.length, skipped: 'recent' };
  await writeJSON(SCAN, { at: nowISO() }, { quiet: true }).catch(() => 0);
  const s = await require('./card-sarbatori').scanMypos(3).catch((e) => ({ ok: false, error: e.code || e.message }));
  if (!s.ok) return { waiting: waiting.length, error: s.error };
  return { waiting: waiting.length, matched: await matchPays(s.pays), seen: s.pays.length };
}

module.exports = { KEY, waits, matchPays, markPaid, pick, openChecks, autoMatch };
