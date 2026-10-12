// Automations ("Automatizări") — GoHighLevel-style workflows: one trigger, then a list of steps.
//
//   data/workflows.json      { settings, workflows: [{ id, name, active, trigger, steps, ... }] }
//   data/workflow-runs.json  { runs: [...], counters: { [workflowId]: { runs, sent, tasks } } }
//
// A trigger fires from the place where the thing happens (lead created, stage moved, appointment
// booked / changed …) through emit(). Every matching active workflow gets a "run" that walks its
// steps: wait, WhatsApp message, task for reception, move the lead, stop-if. Waiting runs are
// picked up by tick(), which the portal heartbeat (/api/portal-pulse, polled by every open portal)
// and the daily cron (/api/automation-tick) call — so there is no separate job server.
//
// WhatsApp: with WHATSAPP_TOKEN + WHATSAPP_PHONE_ID set (Meta WhatsApp Cloud API) messages go out
// on their own; without them — or when Meta refuses one — the message becomes a one-tap task in
// Sarcini (opens WhatsApp with the text already written), so nothing is ever silently lost.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./store');
const { sendWhatsApp, whatsappConfigured } = require('./whatsapp');

const WF_KEY = 'data/workflows.json';
const RUNS_KEY = 'data/workflow-runs.json';
const TASKS_KEY = 'data/automation-tasks.json';
const LEADS_KEY = 'data/leads.json';
const MAX_FINISHED = 400;

const TRIGGERS = {
  lead_created: { label: 'Lead nou', entity: 'lead' },
  stage_changed: { label: 'Lead mutat în etapă', entity: 'lead' },
  lead_idle: { label: 'Lead necontactat', entity: 'lead' },
  appointment_created: { label: 'Programare nouă', entity: 'appointment' },
  appointment_before: { label: 'Înainte de programare', entity: 'appointment' },
  appointment_status: { label: 'Status programare schimbat', entity: 'appointment' },
  appointment_after: { label: 'După tratament', entity: 'appointment' },
};
const STEP_TYPES = ['wait', 'whatsapp', 'task', 'move_stage', 'stop_if'];
const STOP_CONDS = ['contacted', 'booked', 'appt_inactive', 'appt_confirmed', 'future_appt'];
const STATUSES = ['programata', 'confirmata', 'anulata', 'reprogramata', 'finalizata'];
const SOURCES = ['any', 'facebook', 'instagram', 'site', 'telefon', 'recomandare', 'walk-in', 'manual'];
const LOCATIONS = ['any', 'Timișoara', 'Arad'];

const uid = () => crypto.randomUUID();
const nowISO = () => new Date().toISOString();
const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

// ---------------------------------------------------------------- time (clinic runs on RO time)
function tzOffsetMs(epoch) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bucharest', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(epoch)).reduce((o, p) => { o[p.type] = p.value; return o; }, {});
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - epoch;
}
// "2026-10-12" + "14:30" in Bucharest → epoch ms.
function apptStart(a) {
  const [y, m, d] = String(a.date || '').split('-').map(Number);
  const [hh, mm] = String(a.time || '10:00').split(':').map(Number);
  if (!y || !m || !d) return NaN;
  const guess = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  return guess - tzOffsetMs(guess);
}
const roDate = (iso) => { const [y, m, d] = String(iso || '').split('-'); return d && m ? `${d}.${m}.${y}` : ''; };
function relDay(iso) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
  const t = Date.parse(today + 'T00:00:00Z'), x = Date.parse(String(iso) + 'T00:00:00Z');
  const diff = Math.round((x - t) / 86400e3);
  if (diff === 0) return 'azi';
  if (diff === 1) return 'mâine';
  if (diff === 2) return 'poimâine';
  const wd = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', timeZone: 'UTC' }).format(new Date(x));
  return diff > 0 && diff < 7 ? wd : 'pe ' + roDate(iso);
}
const unitMs = { min: 60e3, h: 3600e3, d: 86400e3 };

// ---------------------------------------------------------------- recipes + defaults
const RECIPES = [
  { key: 'confirmare', name: 'Confirmare la programare', note: 'Imediat ce se face o programare, clientul primește confirmarea.',
    trigger: { type: 'appointment_created' },
    steps: [{ type: 'whatsapp', text: 'Bună, {prenume}! Programarea ta la Centrul360 {locatie} e confirmată: {zi}, {data}, ora {ora} — {tratament}.\nAdresa: {adresa}\nDacă intervine ceva, răspunde la acest mesaj și o mutăm. Te așteptăm! 💜' }] },
  { key: 'reminder24', name: 'Reminder cu o zi înainte', note: 'Cu 24 de ore înainte. Scade neprezentările.',
    trigger: { type: 'appointment_before', hours: 24 },
    steps: [{ type: 'stop_if', cond: 'appt_inactive' },
      { type: 'whatsapp', text: 'Bună, {prenume}! Îți amintim că mâine, ora {ora}, ai programare la Centrul360 {locatie} pentru {tratament}. Confirmi cu un „DA”? 🙏' }] },
  { key: 'reminder3', name: 'Reminder în ziua programării', note: 'Cu 3 ore înainte, cu adresa.',
    trigger: { type: 'appointment_before', hours: 3 },
    steps: [{ type: 'stop_if', cond: 'appt_inactive' },
      { type: 'whatsapp', text: 'Ne vedem azi la ora {ora}, {prenume}! 📍 {adresa}' }] },
  { key: 'lead_nou', name: 'Lead nou din reclamă → mesaj + sună în 5 min', note: 'Viteza contează: primul care sună câștigă clientul.',
    trigger: { type: 'lead_created', source: 'facebook', location: 'any' },
    steps: [{ type: 'whatsapp', text: 'Bună, {prenume}! Sunt de la Centrul360 — am primit cererea ta pentru {interes}. Te sunăm în câteva minute să-ți găsim o oră care ți se potrivește. 💜' },
      { type: 'task', text: 'Sună-l acum pe {nume} ({telefon}) — lead nou din reclamă: {interes}.' }] },
  { key: 'necontactat', name: 'Lead necontactat în 2 ore → alertă', note: 'Niciun lead nu rămâne nesunat.',
    trigger: { type: 'lead_idle', hours: 2 },
    steps: [{ type: 'task', text: '⚠️ {nume} ({telefon}) așteaptă de 2 ore să fie sunat — {interes}.' }] },
  { key: 'anulare', name: 'Programare anulată → propune altă oră', note: 'Recuperează programările pierdute.',
    trigger: { type: 'appointment_status', status: 'anulata' },
    steps: [{ type: 'wait', amount: 30, unit: 'min' },
      { type: 'stop_if', cond: 'future_appt' },
      { type: 'whatsapp', text: 'Bună, {prenume}! Am văzut că programarea pentru {tratament} s-a anulat. Vrei să-ți găsim altă oră săptămâna asta? Răspunde cu ziua care îți convine. 💜' }] },
  { key: 'recenzie', name: 'După tratament → recenzie Google', note: 'A doua zi după tratament.',
    trigger: { type: 'appointment_after', days: 1 },
    steps: [{ type: 'whatsapp', text: 'Mulțumim că ai venit ieri, {prenume}! 💜 Ne ajuți enorm cu o recenzie de 30 de secunde: {link_recenzie}' }] },
  { key: 'revenire', name: 'Revenire la 21 de zile', note: 'Clienta care nu și-a făcut următoarea ședință.',
    trigger: { type: 'appointment_after', days: 21 },
    steps: [{ type: 'stop_if', cond: 'future_appt' },
      { type: 'whatsapp', text: 'Bună, {prenume}! Au trecut 3 săptămâni de la {tratament}. Pentru rezultat complet e momentul ședinței următoare — îți rezervăm o oră? 💜' },
      { type: 'wait', amount: 1, unit: 'd' },
      { type: 'stop_if', cond: 'future_appt' },
      { type: 'task', text: 'Sun-o pe {nume} ({telefon}) pentru următoarea ședință de {tratament}.' }] },
];
const DEFAULT_ACTIVE = ['confirmare', 'reminder24'];

function defaultSettings() {
  return {
    addresses: { 'Timișoara': '', 'Arad': '' },
    reviewLink: '',
  };
}
function fromRecipe(r, active) {
  return { id: uid(), name: r.name, note: r.note || '', active: !!active, trigger: Object.assign({}, r.trigger), steps: r.steps.map((s) => Object.assign({ id: uid() }, s)), recipe: r.key, createdAt: nowISO(), updatedAt: nowISO() };
}
async function loadDoc() {
  const doc = await readJSON(WF_KEY, null);
  if (doc && Array.isArray(doc.workflows)) {
    doc.settings = Object.assign(defaultSettings(), doc.settings || {});
    return doc;
  }
  // First run: the recipes become the starting workflows — confirmation + 24h reminder on
  // (they replace the old fixed "send confirmation / reminder today" tasks), the rest ready to switch on.
  const seeded = { settings: defaultSettings(), workflows: RECIPES.map((r) => fromRecipe(r, DEFAULT_ACTIVE.includes(r.key))) };
  await writeJSON(WF_KEY, seeded); // ids must stay stable — runs point at them
  return seeded;
}
const saveDoc = (doc) => writeJSON(WF_KEY, doc);
async function loadRuns() {
  const r = await readJSON(RUNS_KEY, null);
  return r && Array.isArray(r.runs) ? Object.assign({ counters: {} }, r) : { runs: [], counters: {} };
}
function saveRuns(doc) {
  const waiting = doc.runs.filter((r) => r.status === 'waiting');
  const finished = doc.runs.filter((r) => r.status !== 'waiting').sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, MAX_FINISHED);
  doc.runs = waiting.concat(finished);
  return writeJSON(RUNS_KEY, doc);
}

// ---------------------------------------------------------------- validation (editor → API)
function validateWorkflow(input) {
  const w = input || {};
  const name = clip(w.name, 80).trim();
  if (!name) return { error: 'missing_name' };
  const t = w.trigger || {};
  if (!TRIGGERS[t.type]) return { error: 'invalid_trigger' };
  const trigger = { type: t.type };
  if (t.type === 'lead_created') { trigger.source = SOURCES.includes(t.source) ? t.source : 'any'; trigger.location = LOCATIONS.includes(t.location) ? t.location : 'any'; }
  if (t.type === 'stage_changed') { trigger.stage = clip(t.stage, 60); if (!trigger.stage) return { error: 'invalid_trigger' }; }
  if (t.type === 'lead_idle') trigger.hours = Math.min(720, Math.max(1, Math.round(Number(t.hours) || 2)));
  if (t.type === 'appointment_before') trigger.hours = Math.min(168, Math.max(1, Math.round(Number(t.hours) || 24)));
  if (t.type === 'appointment_after') trigger.days = Math.min(365, Math.max(0, Math.round(Number(t.days) || 1)));
  if (t.type === 'appointment_status') { trigger.status = STATUSES.includes(t.status) ? t.status : ''; if (!trigger.status) return { error: 'invalid_trigger' }; }
  if (t.type.startsWith('appointment')) trigger.location = LOCATIONS.includes(t.location) ? t.location : 'any';
  const steps = (Array.isArray(w.steps) ? w.steps : []).slice(0, 12).map((s) => {
    const st = { id: s.id && /^[\w-]{6,40}$/.test(s.id) ? s.id : uid(), type: s.type };
    if (s.type === 'wait') { st.amount = Math.min(999, Math.max(1, Math.round(Number(s.amount) || 1))); st.unit = unitMs[s.unit] ? s.unit : 'h'; }
    if (s.type === 'whatsapp') { st.text = clip(s.text, 1000).trim(); st.template = clip(s.template, 80).replace(/[^\w]/g, ''); }
    if (s.type === 'task') st.text = clip(s.text, 300).trim();
    if (s.type === 'move_stage') st.stage = clip(s.stage, 60);
    if (s.type === 'stop_if') st.cond = STOP_CONDS.includes(s.cond) ? s.cond : 'contacted';
    return st;
  });
  if (!steps.length) return { error: 'missing_steps' };
  if (steps.some((s) => !STEP_TYPES.includes(s.type) || ((s.type === 'whatsapp' || s.type === 'task') && !s.text) || (s.type === 'move_stage' && !s.stage))) return { error: 'invalid_step' };
  const entity = TRIGGERS[trigger.type].entity;
  if (entity === 'appointment' && steps.some((s) => s.type === 'move_stage' || s.cond === 'contacted' || s.cond === 'booked')) return { error: 'step_needs_lead' };
  if (entity === 'lead' && steps.some((s) => s.cond === 'appt_inactive' || s.cond === 'appt_confirmed')) return { error: 'step_needs_appointment' };
  return { workflow: { name, note: clip(w.note, 160), active: w.active !== false, trigger, steps } };
}

// ---------------------------------------------------------------- triggers
function matches(wf, event, p) {
  const t = wf.trigger;
  if (!wf.active) return false;
  if (t.location && t.location !== 'any') {
    const loc = (p.lead && p.lead.location) || (p.appointment && p.appointment.location) || '';
    if (loc !== t.location) return false;
  }
  if (event === 'lead_created') return (t.type === 'lead_created' && (t.source === 'any' || t.source === p.lead.source)) || t.type === 'lead_idle';
  if (event === 'stage_changed') return t.type === 'stage_changed' && t.stage === p.stage;
  if (event === 'appointment_created') return t.type === 'appointment_created' || t.type === 'appointment_before';
  if (event === 'appointment_rescheduled') return t.type === 'appointment_before';
  if (event === 'appointment_status') return (t.type === 'appointment_status' && t.status === p.status) || (t.type === 'appointment_after' && p.status === 'finalizata');
  return false;
}
function dueFor(wf, p, now) {
  const t = wf.trigger;
  if (t.type === 'lead_idle') return now + t.hours * 3600e3;
  if (t.type === 'appointment_before') {
    const at = apptStart(p.appointment) - t.hours * 3600e3;
    // Booked too late for this reminder (e.g. a same-day booking and a 24h reminder): skip it.
    return at >= now - 15 * 60e3 ? Math.max(at, now) : null;
  }
  if (t.type === 'appointment_after') return Math.max(now, (apptStart(p.appointment) || now) + t.days * 86400e3);
  return now;
}

// Called from the API routes right after the change was saved. Never throws — an automation
// problem must not fail the booking or the lead that triggered it.
async function emit(event, payload) {
  try {
    const p = payload || {};
    const doc = await loadDoc();
    const runsDoc = await loadRuns();
    const ent = p.appointment ? { type: 'appointment', id: p.appointment.id } : p.lead ? { type: 'lead', id: p.lead.id } : null;
    if (!ent) return;
    const now = Date.now();
    // A moved / cancelled / deleted appointment: its pending "before" reminders are recalculated or dropped.
    if (ent.type === 'appointment' && (event === 'appointment_rescheduled' || event === 'appointment_deleted' || (event === 'appointment_status' && (p.status === 'anulata' || p.status === 'reprogramata')))) {
      runsDoc.runs.forEach((r) => {
        if (r.status !== 'waiting' || r.ent.id !== ent.id) return;
        const wf = doc.workflows.find((w) => w.id === r.wf);
        if (event === 'appointment_deleted' || (wf && wf.trigger.type === 'appointment_before')) {
          r.status = 'stopped'; r.updatedAt = nowISO(); r.log.push({ at: nowISO(), text: event === 'appointment_deleted' ? 'Programarea a fost ștearsă' : 'Programarea s-a mutat / anulat' });
        }
      });
    }
    const fresh = [];
    if (event !== 'appointment_deleted' && !(event === 'appointment_rescheduled' && ['anulata', 'finalizata'].includes(p.appointment && p.appointment.status))) {
      doc.workflows.filter((wf) => matches(wf, event, p)).forEach((wf) => {
        const due = dueFor(wf, p, now);
        if (due == null) return;
        const run = { id: uid(), wf: wf.id, ent, step: 0, dueAt: new Date(due).toISOString(), status: 'waiting', createdAt: nowISO(), updatedAt: nowISO(), log: [{ at: nowISO(), text: 'Pornit: ' + TRIGGERS[wf.trigger.type].label }] };
        runsDoc.runs.push(run);
        const c = runsDoc.counters[wf.id] = runsDoc.counters[wf.id] || { runs: 0, sent: 0, tasks: 0 };
        c.runs++;
        if (due <= now) fresh.push(run.id);
      });
    }
    if (!fresh.length) { await saveRuns(runsDoc); return; }
    await processRuns(runsDoc, doc, fresh);
  } catch (err) {
    console.error('workflows.emit error:', err.message);
  }
}

// ---------------------------------------------------------------- running
async function context(ent) {
  const [leads, appointments, clients] = await Promise.all([
    readJSON(LEADS_KEY, []), readJSON('data/appointments.json', []), readJSON('data/clients.json', []),
  ]);
  const ctx = { leads, appointments, clients };
  if (ent.type === 'lead') ctx.lead = leads.find((l) => l.id === ent.id) || null;
  if (ent.type === 'appointment') {
    ctx.appointment = appointments.find((a) => a.id === ent.id) || null;
    if (ctx.appointment && ctx.appointment.leadId) ctx.lead = leads.find((l) => l.id === ctx.appointment.leadId) || null;
  }
  return ctx;
}
const digits = (s) => String(s || '').replace(/\D/g, '');
function personOf(ctx) {
  const a = ctx.appointment, l = ctx.lead;
  const client = a && a.clientId ? ctx.clients.find((c) => c.id === a.clientId) : null;
  const name = (a && a.clientName) || (l && l.name) || (client && client.name) || '';
  const phone = (a && a.clientPhone) || (client && client.phone) || (l && l.phone) || '';
  return { name, phone };
}
function vars(ctx, settings) {
  const a = ctx.appointment || {}, l = ctx.lead || {};
  const person = personOf(ctx);
  const loc = a.location || l.location || '';
  return {
    prenume: person.name.trim().split(/\s+/)[0] || '', nume: person.name, telefon: person.phone,
    data: roDate(a.date), ora: a.time || '', zi: a.date ? relDay(a.date) : '', tratament: a.treatment || l.interest || 'tratament',
    locatie: loc, adresa: (settings.addresses || {})[loc] || loc, interes: l.interest || a.treatment || 'tratamentele noastre',
    link_recenzie: settings.reviewLink || '',
  };
}
const render = (text, v) => String(text || '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)).replace(/[ \t]+\n/g, '\n').trim();
const varsInOrder = (text, v) => (String(text || '').match(/\{(\w+)\}/g) || []).map((m) => v[m.slice(1, -1)] || '-');

async function addTask(task) {
  const tasks = await readJSON(TASKS_KEY, []);
  tasks.push(Object.assign({ id: uid(), status: 'pending', createdAt: nowISO(), doneAt: null, doneBy: null, assigneeRole: 'receptie' }, task));
  await writeJSON(TASKS_KEY, tasks);
}
function stopHit(cond, ctx) {
  const a = ctx.appointment, l = ctx.lead;
  const person = personOf(ctx);
  if (cond === 'contacted') return !!(l && (l.lastContactAt || l.contactCount));
  if (cond === 'booked') return !!(l && ctx.appointments.some((x) => x.leadId === l.id && x.status !== 'anulata'));
  if (cond === 'appt_inactive') return !a || a.status === 'anulata' || a.status === 'finalizata';
  if (cond === 'appt_confirmed') return !!(a && a.status === 'confirmata');
  if (cond === 'future_appt') {
    const key = digits(person.phone).slice(-9);
    const now = Date.now();
    return ctx.appointments.some((x) => x !== a && x.status !== 'anulata' && apptStart(x) > now && ((a && a.clientId && x.clientId === a.clientId) || (key.length >= 6 && digits(x.clientPhone).slice(-9) === key)));
  }
  return false;
}
async function moveLead(lead, stage, wfName) {
  const leads = await readJSON(LEADS_KEY, []);
  const l = leads.find((x) => x.id === lead.id);
  if (!l || l.stage === stage) return false;
  const from = l.stage;
  const stored = await readJSON('data/pipeline-stages.json', null);
  const list = Array.isArray(stored) ? stored : (stored && stored.stages) || [];
  const nameOf = (id) => (list.find((s) => s.id === id) || { name: id }).name;
  l.stage = stage; l.stageChangedAt = nowISO(); l.updatedAt = nowISO();
  (l.activities = l.activities || []).push({ id: uid(), type: 'stage', text: nameOf(from) + ' → ' + nameOf(stage) + ' (automatizare: ' + wfName + ')', author: 'Automatizare', at: nowISO() });
  await writeJSON(LEADS_KEY, leads);
  return true;
}

async function runOne(run, wf, settings, counters) {
  const ctx = await context(run.ent);
  const log = (text) => run.log.push({ at: nowISO(), text });
  if (!ctx.lead && !ctx.appointment) { run.status = 'stopped'; log('Leadul / programarea nu mai există'); return; }
  // "Lead necontactat": only fires if nobody has reached the lead in the meantime.
  if (run.step === 0 && wf.trigger.type === 'lead_idle' && stopHit('contacted', ctx)) { run.status = 'done'; log('Leadul a fost contactat între timp'); return; }
  const v = vars(ctx, settings);
  const person = personOf(ctx);
  const c = counters[wf.id] = counters[wf.id] || { runs: 0, sent: 0, tasks: 0 };
  while (run.step < wf.steps.length) {
    const s = wf.steps[run.step];
    run.step++;
    if (s.type === 'wait') {
      run.dueAt = new Date(Date.now() + s.amount * unitMs[s.unit]).toISOString();
      log('Așteaptă ' + s.amount + ' ' + ({ min: 'min', h: 'h', d: 'zile' }[s.unit]));
      return;
    }
    if (s.type === 'stop_if') {
      if (stopHit(s.cond, ctx)) { run.status = 'done'; log('Oprit: ' + s.cond); return; }
      continue;
    }
    if (s.type === 'whatsapp') {
      const text = render(s.text, v);
      let sent = null;
      if (person.phone && whatsappConfigured()) {
        sent = await sendWhatsApp({ phone: person.phone, text, template: s.template, params: varsInOrder(s.text, v) });
      }
      if (sent && sent.sent) { c.sent++; log('WhatsApp trimis automat'); continue; }
      await addTask({ type: 'whatsapp', title: wf.name, text: text, message: text, phone: person.phone, clientName: person.name,
        relatedAppointmentId: ctx.appointment ? ctx.appointment.id : '', relatedLeadId: ctx.lead ? ctx.lead.id : '',
        location: (ctx.appointment && ctx.appointment.location) || (ctx.lead && ctx.lead.location) || '', workflowId: wf.id,
        // confirmations / reminders lose their point once the appointment is cancelled or over
        autoClose: wf.trigger.type === 'appointment_created' || wf.trigger.type === 'appointment_before' });
      c.tasks++;
      log(person.phone ? (sent && sent.error ? 'Meta a refuzat (' + sent.error + ') → sarcină WhatsApp într-un tap' : 'Sarcină WhatsApp într-un tap') : 'Fără telefon → sarcină');
      continue;
    }
    if (s.type === 'task') {
      await addTask({ type: 'sarcina', title: wf.name, text: render(s.text, v), phone: person.phone, clientName: person.name,
        relatedAppointmentId: ctx.appointment ? ctx.appointment.id : '', relatedLeadId: ctx.lead ? ctx.lead.id : '',
        location: (ctx.appointment && ctx.appointment.location) || (ctx.lead && ctx.lead.location) || '', workflowId: wf.id });
      c.tasks++;
      log('Sarcină creată');
      continue;
    }
    if (s.type === 'move_stage' && ctx.lead) {
      if (await moveLead(ctx.lead, s.stage, wf.name)) log('Lead mutat în ' + s.stage);
      continue;
    }
  }
  run.status = 'done';
  log('Terminat');
}

// Walks the given runs (or every due one). Each run is claimed before it executes, so two
// overlapping ticks don't send the same message twice.
async function processRuns(runsDoc, doc, onlyIds) {
  const now = Date.now();
  const due = runsDoc.runs.filter((r) => r.status === 'waiting' && (onlyIds ? onlyIds.includes(r.id) : Date.parse(r.dueAt) <= now)).slice(0, 25);
  if (!due.length) { if (onlyIds) await saveRuns(runsDoc); return 0; }
  const lease = new Date(now + 2 * 60e3).toISOString();
  due.forEach((r) => { r.dueAt = lease; }); // claim
  await saveRuns(runsDoc);
  for (const run of due) {
    const wf = doc.workflows.find((w) => w.id === run.wf);
    if (!wf || !wf.active) { run.status = 'stopped'; run.log.push({ at: nowISO(), text: wf ? 'Automatizarea a fost oprită' : 'Automatizarea a fost ștearsă' }); run.updatedAt = nowISO(); continue; }
    try { await runOne(run, wf, doc.settings, runsDoc.counters); }
    catch (err) { run.status = 'error'; run.log.push({ at: nowISO(), text: 'Eroare: ' + clip(err.message, 120) }); }
    run.updatedAt = nowISO();
  }
  // Re-read so runs created meanwhile (another request) aren't overwritten, then merge ours in.
  const latest = await loadRuns();
  const mine = new Map(due.map((r) => [r.id, r]));
  latest.runs = latest.runs.map((r) => mine.get(r.id) || r);
  due.forEach((r) => { if (!latest.runs.some((x) => x.id === r.id)) latest.runs.push(r); });
  latest.counters = Object.assign({}, latest.counters, runsDoc.counters);
  await saveRuns(latest);
  return due.length;
}

let lastTick = 0;
// Runs whatever is due. Cheap when nothing is: at most one read every 20 s per server instance.
async function tick(force) {
  if (!force && Date.now() - lastTick < 20e3) return 0;
  lastTick = Date.now();
  try {
    const runsDoc = await loadRuns();
    const now = Date.now();
    if (!runsDoc.runs.some((r) => r.status === 'waiting' && Date.parse(r.dueAt) <= now)) return 0;
    return await processRuns(runsDoc, await loadDoc());
  } catch (err) {
    console.error('workflows.tick error:', err.message);
    return 0;
  }
}

module.exports = { TRIGGERS, STEP_TYPES, STOP_CONDS, STATUSES, SOURCES, LOCATIONS, RECIPES, loadDoc, saveDoc, loadRuns, validateWorkflow, fromRecipe, emit, tick, render, vars };
