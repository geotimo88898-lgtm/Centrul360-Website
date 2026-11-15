// Once (the owner, 15.11: „vezi cine n-a primit și trimite iar”): Timișoara's WhatsApp account refused the automatic
// messages from 14.11 evening to 15.11 morning (Meta 131042, a problem with the account's payment); he settled the
// payment. Each message tied to an appointment that is still right goes again, the same template from the same number:
//   - it failed with 131042, from Timișoara, between 14.11 16:00 and 15.11 12:00 UTC
//   - its appointment is still there, not cancelled or done, not moved (same day, hour, clinic and phone), and still
//     more than an hour ahead
//   - nothing of the same template reached her for that appointment since (sent, delivered or read)
//   - one per appointment and template
// A probe first: the first one goes alone; a later run reads its state (the webhook writes it on the message): failed
// again with 131042 → stop, the admins hear the payment still doesn't work; delivered or read (or still „sent” 10
// minutes on, no failure) → the rest go. Run by the automations' clock and the portal's pulse (at most every 10 min).
// data/wa-resend-once.json: { phase: 'probe' | 'rest' | 'done' | 'stopped', probe: { id, at }, sent, skipped: { why: n }, at }

const { readJSON, writeJSON } = require('./store');
const WF = require('./workflows');
const WT = require('./wa-templates');
const WA = require('./whatsapp');

const KEY = 'data/wa-resend-once.json';
const CONVOS = 'data/whatsapp-conversations.json';
const FROM = '2026-11-14T16:00:00Z', TO = '2026-11-15T12:00:00Z';
const CITY = 'Timișoara';
const nowISO = () => new Date().toISOString();
const paid = (m) => String(m.errorCode) === '131042' || /plata/i.test(String(m.error || ''));
const reached = (m) => ['sent', 'delivered', 'read'].includes(m.status);

// what should go again, oldest first: [{ convo phone, msg, appt, tpl }], plus why the rest stays
async function todo() {
  const [convos, appts, leads, clients, tdoc, cfg, doc] = await Promise.all([readJSON(CONVOS, []), readJSON('data/appointments.json', []),
    readJSON('data/leads.json', []), readJSON('data/clients.json', []), WT.load(), WA.loadConfig(), WF.loadDoc()]);
  const tpls = tdoc.templates || [];
  const out = [], skipped = {}, seen = new Set();
  const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; };
  for (const c of Array.isArray(convos) ? convos : []) {
    for (const m of c.messages || []) {
      if (m.direction !== 'out' || m.type !== 'template' || m.status !== 'failed' || !paid(m)) continue;
      const ts = String(m.timestamp || '');
      if (ts < FROM || ts > TO) continue;
      const tpl = tpls.find((t) => t.id === m.templateId);
      if (!tpl || !String(tpl.label || '').includes(CITY)) { skip('alt număr sau șablon șters'); continue; }
      if (!m.appt) { skip('fără programare'); continue; }
      const a = appts.find((x) => x && x.id === m.appt);
      if (!a || a.status === 'anulata' || a.status === 'finalizata' || a.block) { skip('programarea nu mai e activă'); continue; }
      if (m.akey && WF.apptKey(a) !== m.akey) { skip('programarea s-a mutat'); continue; }
      if (!(WF.apptStart(a) > Date.now() + 3600e3)) { skip('programarea e prea aproape sau a trecut'); continue; }
      const k = a.id + '|' + tpl.id;
      if (seen.has(k)) { skip('dublură'); continue; }
      seen.add(k);
      if ((c.messages || []).some((x) => x !== m && x.direction === 'out' && x.templateId === tpl.id && x.appt === a.id && String(x.timestamp || '') > ts && reached(x))) { skip('a primit-o între timp'); continue; }
      out.push({ phone: c.phone, msg: m, appt: a, tpl });
    }
  }
  out.sort((x, y) => String(x.msg.timestamp).localeCompare(String(y.msg.timestamp)));
  return { list: out, skipped, ctxBase: { leads, appointments: appts, clients }, settings: Object.assign({}, doc.settings, { _wa: { tpls, cfg } }) };
}

async function sendOne(item, base, settings) {
  const a = item.appt;
  const ctx = Object.assign({}, base, { appointment: a, lead: a.leadId ? base.leads.find((l) => l.id === a.leadId) || null : null });
  const v = WF.vars(ctx, settings);
  return WF.sendOnce('resend-1511|' + item.msg.id, () => WF.sendTemplate(settings._wa, item.tpl.id, CITY, item.phone, v, { appt: a.id, akey: WF.apptKey(a) }));
}

async function tell(title, text) {
  try {
    const store = require('./store');
    const { notifyMany, adminIds } = require('./notify');
    await notifyMany(store, await adminIds(store), { kind: 'alert', tone: /nu merge/i.test(title) ? 'bad' : 'good', go: 'mesaje', title, text, ownerPush: true });
  } catch (e) { console.error('wa-resend-once tell:', e.message); }
}

// not before START: the list is looked at first (GET /api/lead-health?wahealth=todo)
const START = '2026-11-15T12:35:00Z';

async function run() {
  const st = await readJSON(KEY, {});
  if (Date.now() < Date.parse(START)) return { wait: true };
  if (st.phase === 'done' || st.phase === 'stopped') return { skipped: true };
  // the probe: is the payment fixed?
  if (st.phase === 'probe') {
    const convos = await readJSON(CONVOS, []);
    let m = null;
    for (const c of convos || []) { m = (c.messages || []).find((x) => x.id === st.probe.id); if (m) break; }
    const age = Date.now() - Date.parse(st.probe.at);
    if (m && m.status === 'failed') {
      if (paid(m)) {
        await writeJSON(KEY, Object.assign(st, { phase: 'stopped', at: nowISO(), why: 'plata tot nu merge' }));
        await tell('WhatsApp Timișoara: plata tot nu merge', 'Am retrimis un mesaj de probă și Meta l-a refuzat din nou pentru plată. Restul nu le mai trimit până nu se rezolvă plata contului WhatsApp.');
        return { stopped: true };
      }
    } else if (!(m && (m.status === 'delivered' || m.status === 'read')) && age < 10 * 60e3) return { wait: true };
    st.phase = 'rest';
  }
  const { list, skipped, ctxBase, settings } = await todo();
  if (!st.phase) {
    if (!list.length) { await writeJSON(KEY, { phase: 'done', at: nowISO(), sent: 0, skipped }); return { done: true, sent: 0 }; }
    const r = await sendOne(list[0], ctxBase, settings);
    // the id Meta gave it is on the message logSent just wrote (the newest one of that template for that appointment)
    const convos = await readJSON(CONVOS, []);
    const c = (convos || []).find((x) => x.phone === list[0].phone);
    const mine = c && (c.messages || []).filter((x) => x.direction === 'out' && x.templateId === list[0].tpl.id && x.appt === list[0].appt.id && x.status !== 'failed').pop();
    if (!r.sent || !mine) { await writeJSON(KEY, { phase: 'stopped', at: nowISO(), why: r.why || 'proba nu a plecat', skipped }); return { stopped: true, why: r.why }; }
    await writeJSON(KEY, { phase: 'probe', probe: { id: mine.id, at: nowISO() }, sent: 1, total: list.length, skipped, at: nowISO() });
    return { probe: true, total: list.length };
  }
  // the rest (the probe left the list: it reached her)
  let sent = st.sent || 0, failed = 0;
  for (const item of list) {
    const r = await sendOne(item, ctxBase, settings).catch((e) => ({ why: e.message }));
    if (r.sent) sent++; else if (!r.dup) failed++;
  }
  await writeJSON(KEY, Object.assign(st, { phase: 'done', at: nowISO(), sent, failed, skipped }));
  await tell('WhatsApp Timișoara merge din nou', 'Am retrimis ' + sent + (sent === 1 ? ' mesaj' : ' mesaje') + ' care nu plecaseră din cauza plății (reamintiri și confirmări pentru programările care urmează).');
  return { done: true, sent, failed };
}

module.exports = { run, todo, KEY };
