// Changes to the automations the owners asked for in chat, made once by the portal itself (the automations' clock runs
// it, api/automation-tick.js), on their own flows (Admin → Automatizări), so nothing has to be rebuilt by hand.
//   28.10: at a booking the client gets only the "Ne vedem pe {data}, la ora {ora}" message with the clinic's location
//   (the owner: "doar pe ăla, atât"): the other messages sent the moment a booking is made (the confirmation with the
//   before / after picture) come out of the booking flows, through their if / else and short waits too. The reminders
//   tied to the appointment's hour stay as they are. Done only if a booking flow does send the location message at
//   once, so a booking is never left with no message at all. (The first try, …-28, found the location message behind
//   a short wait or a branch and changed nothing.)
//   28.10, later: the booking messages the owner wrote (confirmation, the day before at 9:00 with „Da, ajung” / „Nu
//   ajung”, 2 hours before with the parking), api/_lib/reminders.js: sent to Meta, and each clinic's flow switched once
//   Meta approved its three. A job that answers { wait: true } runs again at the next tick.
// data/wf-once.json: { done: { <job id>: { at, removed: [{ flow, template }], kept: [...], skipped? } } }

const { readJSON, writeJSON } = require('./store');
const WF = require('./workflows');
const WT = require('./wa-templates');
const { notifyMany, adminIds } = require('./notify');

const KEY = 'data/wf-once.json';
const nowISO = () => new Date().toISOString();

// the "Ne vedem pe …" template: the clinic's location as its header, or those words in its text
const isLocation = (t) => !!t && (t.headerType === 'LOCATION' || /ne vedem/i.test(String(t.body || '')));
const unitMs = { min: 60e3, h: 3600e3, d: 86400e3 };
// a wait that ends the moment of the booking: one tied to the appointment's hour, or longer than an hour
const longWait = (s) => s.type === 'wait' && (s.mode === 'before' || s.mode === 'after' || (Number(s.amount) || 0) * (unitMs[s.unit] || 60e3) > 3600e3);
const branches = (s) => [s.yes || [], s.no || []].concat((s.more || []).map((b) => b.steps || []));
// the WhatsApp steps a booking flow runs the moment the booking is made (through its if / else too, a branch joins the
// flow again after it); true when every path stopped at a long wait
function atBooking(list, out) {
  for (const s of list || []) {
    if (longWait(s)) return true;
    if (s.type === 'whatsapp') out.push(s);
    if (s.type === 'if' && branches(s).map((b) => atBooking(b, out)).every(Boolean)) return true;
  }
  return false;
}
const drop = (list, gone) => (list || []).filter((s) => !gone.has(s)).map((s) => (s.type === 'if'
  ? Object.assign(s, { yes: drop(s.yes, gone), no: drop(s.no, gone), more: (s.more || []).map((b) => Object.assign(b, { steps: drop(b.steps, gone) })) }) : s));
// what a flow looks like, without its texts (for the clock's public log): W(L) a location message, W(I) one with a
// picture, W(T) another, wait(for 1min), if[ … | … ]
function shape(list, tplOf) {
  return (list || []).map((s) => (s.type === 'whatsapp' ? 'W(' + (isLocation(tplOf(s)) ? 'L' : (tplOf(s) || {}).headerType === 'IMAGE' ? 'I' : 'T') + ')'
    : s.type === 'wait' ? 'wait(' + (s.mode || 'for') + ' ' + (s.amount || 0) + (s.unit || 'min') + ')'
    : s.type === 'if' ? 'if[' + branches(s).map((b) => shape(b, tplOf)).join('|') + ']' : s.type)).join('>');
}

async function onlyLocationAtBooking() {
  const doc = await WF.loadDoc();
  const tpls = (await WT.load()).templates;
  const tplOf = (s) => tpls.find((t) => t.id === s.templateId);
  const booking = doc.workflows.filter((wf) => wf.active && wf.trigger && wf.trigger.type === 'appointment_created');
  const shapes = booking.map((wf) => shape(wf.steps, tplOf).slice(0, 300));
  const now = booking.map((wf) => { const out = []; atBooking(wf.steps, out); return { wf, out }; });
  const kept = [], removed = [];
  now.forEach(({ wf, out }) => out.forEach((s) => { if (isLocation(tplOf(s))) kept.push({ flow: wf.name, template: tplOf(s).label }); }));
  if (!kept.length) return { skipped: 'no booking flow sends the location message', shapes };
  now.forEach(({ wf, out }) => {
    const gone = new Set(out.filter((s) => !isLocation(tplOf(s))));
    if (!gone.size) return;
    gone.forEach((s) => removed.push({ flow: wf.name, template: (tplOf(s) || {}).label || s.templateId }));
    wf.steps = drop(wf.steps, gone);
    wf.updatedAt = nowISO();
  });
  if (removed.length) await WF.saveDoc(doc);
  return { removed, kept, shapes };
}

const JOBS = [{ id: 'booking-only-location-2026-10-28b', run: onlyLocationAtBooking, tell: (r) => (r.removed && r.removed.length
  ? { title: 'Automatizări: la programare pleacă doar „Ne vedem pe…”', text: 'Am scos ' + r.removed.map((x) => '„' + x.template + '”').join(', ') + ' din ' + [...new Set(r.removed.map((x) => '„' + x.flow + '”'))].join(', ') + '. Remindere rămân la fel.' }
  : null) },
// the admins hear about each clinic from reminders.js itself (switched, or a message Meta refused)
{ id: 'booking-messages-2026-10-28', run: () => require('./reminders').apply(), tell: () => null }];

async function run() {
  const state = (await readJSON(KEY, null)) || { done: {} };
  state.done = state.done || {};
  const out = {};
  for (const job of JOBS) {
    if (state.done[job.id]) continue;
    try {
      const r = await job.run();
      out[job.id] = r;
      if (r && r.wait) continue;
      state.done[job.id] = Object.assign({ at: nowISO() }, r);
      await writeJSON(KEY, state, { quiet: true });
      const msg = job.tell(r);
      if (msg) {
        const ids = await adminIds({ readJSON });
        await notifyMany({ readJSON, writeJSON }, ids, Object.assign({ kind: 'alert', tone: 'good', go: 'fluxuri' }, msg)).catch((e) => console.error('wf-once tell:', e.message));
      }
    } catch (e) { out[job.id] = { error: e.message }; }
  }
  return out;
}

module.exports = { run, onlyLocationAtBooking, isLocation, atBooking };
