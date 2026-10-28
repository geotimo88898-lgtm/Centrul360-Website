// Changes to the automations the owners asked for in chat, made once by the portal itself (the automations' clock runs
// it, api/automation-tick.js), on their own flows (Admin → Automatizări), so nothing has to be rebuilt by hand.
//   28.10: at a booking the client gets only the "Ne vedem pe {data}, la ora {ora}" message with the clinic's location
//   (the owner: "doar pe ăla, atât"): the other messages sent the moment a booking is made (the confirmation with the
//   before / after picture) come out of the booking flows. The reminders after a wait stay as they are. Done only if a
//   booking flow does send the location message, so a booking is never left with no message at all.
// data/wf-once.json: { done: { <job id>: { at, removed: [{ flow, template }], kept: [...], skipped? } } }

const { readJSON, writeJSON } = require('./store');
const WF = require('./workflows');
const WT = require('./wa-templates');
const { notifyMany, adminIds } = require('./notify');

const KEY = 'data/wf-once.json';
const nowISO = () => new Date().toISOString();

// the "Ne vedem pe …" template: the clinic's location as its header, or those words in its text
const isLocation = (t) => !!t && (t.headerType === 'LOCATION' || /ne vedem/i.test(String(t.body || '')));
// the steps a booking flow runs the moment the booking is made: the ones before its first wait
function atBooking(wf) {
  const out = [];
  for (const s of wf.steps || []) { if (s.type === 'wait') break; out.push(s); }
  return out;
}

async function onlyLocationAtBooking() {
  const doc = await WF.loadDoc();
  const tpls = (await WT.load()).templates;
  const tplOf = (s) => tpls.find((t) => t.id === s.templateId);
  const booking = doc.workflows.filter((wf) => wf.active && wf.trigger && wf.trigger.type === 'appointment_created');
  const kept = [], removed = [];
  booking.forEach((wf) => atBooking(wf).forEach((s) => { if (s.type === 'whatsapp' && isLocation(tplOf(s))) kept.push({ flow: wf.name, template: tplOf(s).label }); }));
  if (!kept.length) return { skipped: 'no booking flow sends the location message', flows: booking.map((wf) => wf.name) };
  booking.forEach((wf) => {
    const now = new Set(atBooking(wf).filter((s) => s.type === 'whatsapp' && !isLocation(tplOf(s))));
    if (!now.size) return;
    now.forEach((s) => removed.push({ flow: wf.name, template: (tplOf(s) || {}).label || s.templateId }));
    wf.steps = wf.steps.filter((s) => !now.has(s));
    wf.updatedAt = nowISO();
  });
  if (removed.length) await WF.saveDoc(doc);
  return { removed, kept };
}

const JOBS = [{ id: 'booking-only-location-2026-10-28', run: onlyLocationAtBooking, tell: (r) => (r.removed && r.removed.length
  ? { title: 'Automatizări: la programare pleacă doar „Ne vedem pe…”', text: 'Am scos ' + r.removed.map((x) => '„' + x.template + '”').join(', ') + ' din ' + [...new Set(r.removed.map((x) => '„' + x.flow + '”'))].join(', ') + '. Remindere rămân la fel.' }
  : null) }];

async function run() {
  const state = (await readJSON(KEY, null)) || { done: {} };
  state.done = state.done || {};
  const out = {};
  for (const job of JOBS) {
    if (state.done[job.id]) continue;
    try {
      const r = await job.run();
      state.done[job.id] = Object.assign({ at: nowISO() }, r);
      await writeJSON(KEY, state, { quiet: true });
      out[job.id] = r;
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
