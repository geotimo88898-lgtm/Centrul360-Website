// Automations ("Automatizări") - GoHighLevel-style workflows: one trigger, then a list of steps.
//
//   data/workflows.json      { settings, folders: [{ id, name }], workflows: [{ id, name, active, folder, trigger, steps, ... }] }
//   data/workflows-archive.json  the flows taken off the list when the folders came (kept, nothing lost)
//   data/workflow-runs.json  { runs: [...], counters: { [workflowId]: { runs, sent, tasks } } }
//
// A trigger fires from the place where the thing happens (lead created, stage moved, appointment
// booked / changed …) through emit(). Every matching active workflow gets a "run" that walks its
// steps: wait, WhatsApp message, alert for the team, task for reception, move the lead, if / else
// (two branches), stop-if. Waiting runs are
// picked up by tick(), which the portal heartbeat (/api/portal-pulse, polled by every open portal)
// and the daily cron (/api/automation-tick) call, so there is no separate job server.
//
// WhatsApp: a step sends one approved template (Integrări → Șabloane WhatsApp) from the number
// chosen on the step, Timișoara, Arad or the client's city (Integrări → WhatsApp, _lib/whatsapp.js).
// A template not yet approved for that number, or WhatsApp not connected: logged, nothing sent.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./store');
const WA = require('./whatsapp');
const { sendWhatsApp } = WA;
const WT = require('./wa-templates');
const { dedash } = require('./dedash');
const { notifyMany } = require('./notify');

const WF_KEY = 'data/workflows.json';
const RUNS_KEY = 'data/workflow-runs.json';
const ARCHIVE_KEY = 'data/workflows-archive.json';
// the owner's folders to start with: leads from the ads, and the appointment reminders
const DEFAULT_FOLDERS = [{ id: 'intake', name: 'Intake' }, { id: 'reminders', name: 'Reminders' }];
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
const STEP_TYPES = ['wait', 'whatsapp', 'notify', 'task', 'move_stage', 'if', 'stop_if'];
const STOP_CONDS = ['contacted', 'booked', 'appt_inactive', 'appt_confirmed', 'future_appt', 'package', 'appt_done', 'appt_cancelled'];
// conditions that compare with a value the owner picks (an "if" or a "stop if" can use them too)
const VALUE_CONDS = ['interest', 'location', 'source', 'category'];
const LEAD_CONDS = ['contacted', 'booked', 'source'];
const APPT_CONDS = ['appt_inactive', 'appt_confirmed', 'package', 'appt_done', 'appt_cancelled', 'category'];
// the treatment categories of an appointment (_lib/cats.js), for "categoria procedurii este"
const CATS = { corporale: 'corporale', faciale: 'faciale', 'epilare-laser': 'epilare laser' };
// "Așteaptă": a period, or until a moment tied to the appointment (N before its start, N after its end)
const WAIT_MODES = ['for', 'before', 'after'];
const MAX_BRANCHES = 6;
const NOTIFY_TO = /^(role:(admin|receptie|cosmetician)|emp:[\w-]{1,60})$/;
const MAX_STEPS = 40;
// Automations don't put tasks in reception's Sarcini (the owner's choice): a WhatsApp that can't go
// out is logged on the run, and a "task" step is skipped.
const FALLBACK_TASKS = false;
const MAX_DEPTH = 3;
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
    steps: [{ type: 'whatsapp', text: 'Bună, {prenume}! Programarea ta la Centrul360 {locatie} e confirmată: {zi}, {data}, ora {ora} - {tratament}.\nAdresa: {adresa}\nDacă intervine ceva, răspunde la acest mesaj și o mutăm. Te așteptăm! 💜' }] },
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
    steps: [{ type: 'whatsapp', text: 'Bună, {prenume}! Sunt de la Centrul360, am primit cererea ta pentru {interes}. Te sunăm în câteva minute să-ți găsim o oră care ți se potrivește. 💜' },
      { type: 'task', text: 'Sună-l acum pe {nume} ({telefon}), lead nou din reclamă: {interes}.' }] },
  { key: 'necontactat', name: 'Lead necontactat în 2 ore → alertă', note: 'Niciun lead nu rămâne nesunat.',
    trigger: { type: 'lead_idle', hours: 2 },
    steps: [{ type: 'task', text: '⚠️ {nume} ({telefon}) așteaptă de 2 ore să fie sunat, {interes}.' }] },
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
      { type: 'whatsapp', text: 'Bună, {prenume}! Au trecut 3 săptămâni de la {tratament}. Pentru rezultat complet e momentul ședinței următoare, îți rezervăm o oră? 💜' },
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
// The team's alert for every new lead: asked for when the Facebook leads were connected, so it is
// added (switched on) once; if the owner deletes it later, it stays deleted.
const LEAD_ALERT = {
  key: 'alerta_lead', name: 'Lead nou: anunță echipa', note: 'Adminul și recepția primesc pe loc numele, procedura și orașul, în portal și pe telefon.',
  trigger: { type: 'lead_created', source: 'any', location: 'any', interest: 'any', returning: true },
  steps: [{ type: 'notify', to: ['role:admin', 'role:receptie'], title: 'LEAD NOU 🔥 - {procedura}', text: '{nume}, {locatie}', whatsapp: false }],
};
RECIPES.unshift(LEAD_ALERT);

const withIds = (list) => (list || []).map((s) => Object.assign({ id: uid() }, s, s.type === 'if' ? { yes: withIds(s.yes), no: withIds(s.no) } : {},
  s.type === 'if' && s.more ? { more: s.more.map((b) => Object.assign({ id: uid() }, b, { steps: withIds(b.steps) })) } : {}));
// every step of a tree, branches included
const flat = (steps) => (steps || []).reduce((a, s) => a.concat(s, s.type === 'if' ? flat(s.yes).concat(flat(s.no), ...(s.more || []).map((b) => flat(b.steps))) : []), []);

function fromRecipe(r, active) {
  return { id: uid(), name: r.name, note: r.note || '', active: !!active, trigger: Object.assign({}, r.trigger), steps: withIds(r.steps), recipe: r.key, createdAt: nowISO(), updatedAt: nowISO() };
}
async function loadDoc() {
  const doc = await readJSON(WF_KEY, null);
  if (doc && Array.isArray(doc.workflows)) {
    doc.settings = Object.assign(defaultSettings(), doc.settings || {});
    // Folders (13.10.2026): the owner builds her own flows in Intake and Reminders. The flows there
    // were go to the archive (switched off), the list starts empty.
    if (!(doc.seeded || {}).foldersV1) {
      const archive = (await readJSON(ARCHIVE_KEY, [])) || [];
      if (doc.workflows.length) archive.push({ at: nowISO(), workflows: doc.workflows.map((w) => Object.assign({}, w, { active: false })) });
      await writeJSON(ARCHIVE_KEY, archive);
      doc.workflows = [];
      doc.folders = DEFAULT_FOLDERS.map((f) => Object.assign({}, f));
      doc.seeded = Object.assign({}, doc.seeded, { leadAlert: true, foldersV1: true });
      await writeJSON(WF_KEY, doc);
    }
    if (!Array.isArray(doc.folders)) doc.folders = [];
    if (!(doc.seeded || {}).leadAlert) {
      doc.seeded = Object.assign({}, doc.seeded, { leadAlert: true });
      if (!doc.workflows.some((w) => flat(w.steps).some((s) => s.type === 'notify'))) doc.workflows.unshift(fromRecipe(LEAD_ALERT, true));
      await writeJSON(WF_KEY, doc);
    }
    return doc;
  }
  // First run: the two folders, no flows (the owner builds them)
  const seeded = { settings: defaultSettings(), seeded: { leadAlert: true, foldersV1: true }, folders: DEFAULT_FOLDERS.map((f) => Object.assign({}, f)), workflows: [] };
  await writeJSON(WF_KEY, seeded); // ids must stay stable, runs point at them
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
function cleanCond(s, st) {
  st.cond = STOP_CONDS.concat(VALUE_CONDS).includes(s.cond) ? s.cond : 'contacted';
  if (VALUE_CONDS.includes(st.cond)) { st.value = clip(s.value, 80).trim(); if (!st.value) return false; }
  if (st.cond === 'category' && !CATS[st.value]) return false;
  return true;
}
// Steps form a tree: an "if" holds two lists of its own (yes / no), at most MAX_DEPTH deep.
function cleanSteps(list, depth, seen) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    if (!s || !STEP_TYPES.includes(s.type)) return { error: 'invalid_step' };
    if (++seen.n > MAX_STEPS) return { error: 'too_many_steps' };
    let id = s.id && /^[\w-]{6,40}$/.test(s.id) ? s.id : uid();
    if (seen.ids.has(id)) id = uid();
    seen.ids.add(id);
    const st = { id, type: s.type };
    let ok = true;
    if (s.type === 'wait') { st.amount = Math.min(999, Math.max(s.mode === 'after' || s.mode === 'before' ? 0 : 1, Math.round(Number(s.amount) || 0) || (s.mode === 'for' || !s.mode ? 1 : 0))); st.unit = unitMs[s.unit] ? s.unit : 'h'; st.mode = WAIT_MODES.includes(s.mode) ? s.mode : 'for'; }
    if (s.type === 'whatsapp') { waFields(s, st); st.text = clip(s.text, 1100).trim(); ok = !!st.templateId; }
    if (s.type === 'task') { st.text = clip(s.text, 300).trim(); ok = !!st.text; }
    if (s.type === 'move_stage') { st.stage = clip(s.stage, 60); ok = !!st.stage; }
    if (s.type === 'stop_if') ok = cleanCond(s, st);
    if (s.type === 'notify') {
      st.to = [...new Set((Array.isArray(s.to) ? s.to : []).map(String).filter((x) => NOTIFY_TO.test(x)))].slice(0, 20);
      st.title = clip(s.title, 80).trim();
      st.text = clip(s.text, 160).trim();
      st.whatsapp = !!s.whatsapp;
      if (st.whatsapp) waFields(s, st);
      ok = st.to.length > 0 && !!st.title && (!st.whatsapp || !!st.templateId);
    }
    if (s.type === 'if') {
      if (depth >= MAX_DEPTH) return { error: 'too_deep' };
      ok = cleanCond(s, st);
      const yes = cleanSteps(s.yes, depth + 1, seen);
      if (yes.error) return yes;
      const no = cleanSteps(s.no, depth + 1, seen);
      if (no.error) return no;
      st.yes = yes.steps;
      st.no = no.steps;
      st.name = clip(s.name, 40).trim();
      // more branches (a selector): each its own condition and steps, checked in order after the first
      st.more = [];
      for (const br of (Array.isArray(s.more) ? s.more : []).slice(0, MAX_BRANCHES - 1)) {
        const b = { id: br && /^[\w-]{6,40}$/.test(br.id) && !seen.ids.has(br.id) ? br.id : uid() };
        seen.ids.add(b.id);
        if (!br || !cleanCond(br, b)) return { error: 'invalid_step' };
        b.name = clip(br.name, 40).trim();
        const bs = cleanSteps(br.steps, depth + 1, seen);
        if (bs.error) return bs;
        b.steps = bs.steps;
        st.more.push(b);
      }
      if (!st.more.length) delete st.more;
    }
    if (!ok) return { error: 'invalid_step' };
    out.push(st);
  }
  return { steps: out };
}
// a WhatsApp step: which template, from which number ('auto' = the client's city)
function waFields(s, st) {
  st.templateId = clip(s.templateId, 40).replace(/[^\w-]/g, '');
  st.from = WA.CITIES.includes(s.from) ? s.from : 'auto';
}
function validateWorkflow(input) {
  const w = input || {};
  const name = clip(w.name, 80).trim();
  if (!name) return { error: 'missing_name' };
  const t = w.trigger || {};
  if (!TRIGGERS[t.type]) return { error: 'invalid_trigger' };
  const trigger = { type: t.type };
  if (t.type === 'lead_created') {
    trigger.source = SOURCES.includes(t.source) ? t.source : 'any';
    trigger.location = LOCATIONS.includes(t.location) ? t.location : 'any';
    trigger.interest = clip(t.interest, 80).trim() || 'any';
    trigger.returning = !!t.returning;
  }
  if (t.type === 'stage_changed') { trigger.stage = clip(t.stage, 60); if (!trigger.stage) return { error: 'invalid_trigger' }; }
  if (t.type === 'lead_idle') trigger.hours = Math.min(720, Math.max(1, Math.round(Number(t.hours) || 2)));
  if (t.type === 'appointment_before') trigger.hours = Math.min(168, Math.max(1, Math.round(Number(t.hours) || 24)));
  // 0 = the day of the treatment (a wait step then sets the hour), not missing
  if (t.type === 'appointment_after') trigger.days = t.days === '' || t.days == null || !Number.isFinite(Number(t.days)) ? 1 : Math.min(365, Math.max(0, Math.round(Number(t.days))));
  if (t.type === 'appointment_status') { trigger.status = STATUSES.includes(t.status) ? t.status : ''; if (!trigger.status) return { error: 'invalid_trigger' }; }
  if (t.type.startsWith('appointment')) trigger.location = LOCATIONS.includes(t.location) ? t.location : 'any';
  const c = cleanSteps(w.steps, 0, { n: 0, ids: new Set() });
  if (c.error) return c;
  const steps = c.steps;
  if (!steps.length) return { error: 'missing_steps' };
  const all = flat(steps);
  const conds = all.map((s) => s.cond).concat(...all.map((s) => (s.more || []).map((b) => b.cond))).filter(Boolean);
  const entity = TRIGGERS[trigger.type].entity;
  if (entity === 'appointment' && (all.some((s) => s.type === 'move_stage') || conds.some((c) => LEAD_CONDS.includes(c)))) return { error: 'step_needs_lead' };
  if (entity === 'lead' && (conds.some((c) => APPT_CONDS.includes(c)) || all.some((s) => s.type === 'wait' && s.mode !== 'for'))) return { error: 'step_needs_appointment' };
  return { workflow: { name, note: clip(w.note, 160), active: w.active !== false, folder: clip(w.folder, 40), trigger, steps } };
}

// ---------------------------------------------------------------- triggers
// "LipoSonix" finds "Liposonix · 2 zone" (no diacritics, no case)
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function matches(wf, event, p) {
  const t = wf.trigger;
  if (!wf.active) return false;
  if (t.location && t.location !== 'any') {
    const loc = (p.lead && p.lead.location) || (p.appointment && p.appointment.location) || '';
    if (loc !== t.location) return false;
  }
  if (event === 'lead_created') {
    // p.returning: someone already in the Pipeline sent the form again
    if (t.type === 'lead_idle') return !p.returning;
    if (t.type !== 'lead_created') return false;
    if (p.returning && !t.returning) return false;
    if (t.source && t.source !== 'any' && t.source !== p.lead.source) return false;
    return !t.interest || t.interest === 'any' || fold(p.lead.interest).includes(fold(t.interest));
  }
  if (event === 'stage_changed') return t.type === 'stage_changed' && t.stage === p.stage;
  if (event === 'appointment_created') return t.type === 'appointment_created' || t.type === 'appointment_before';
  // a moved appointment is booked again: its booking flows start over (confirmation with the new date, location,
  // reminders), its "before" reminders are made again for the new hour
  if (event === 'appointment_rescheduled') return t.type === 'appointment_before' || (t.type === 'appointment_created' && !!p.restart);
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

// Called from the API routes right after the change was saved. Never throws, an automation
// problem must not fail the booking or the lead that triggered it.
async function emit(event, payload) {
  try {
    const p = payload || {};
    const doc = await loadDoc();
    const runsDoc = await loadRuns();
    const ent = p.appointment ? { type: 'appointment', id: p.appointment.id } : p.lead ? { type: 'lead', id: p.lead.id } : null;
    if (!ent) return;
    const now = Date.now();
    const fresh0 = [];
    // a move to a date still ahead books it again (confirmation, location, reminders from the start); one into the past
    // (a correction after the visit) only moves the waits, so the review request after it still goes
    if (event === 'appointment_rescheduled') p.restart = apptStart(p.appointment) > now;
    // A moved / cancelled / deleted appointment: its pending "before" reminders are recalculated or dropped.
    if (ent.type === 'appointment' && (event === 'appointment_rescheduled' || event === 'appointment_deleted' || (event === 'appointment_status' && (p.status === 'anulata' || p.status === 'reprogramata')))) {
      runsDoc.runs.forEach((r) => {
        if (r.status !== 'waiting' || r.ent.id !== ent.id) return;
        const wf = doc.workflows.find((w) => w.id === r.wf);
        const waitStep = wf && r.waitId ? flat(wf.steps).find((s) => s.id === r.waitId && s.type === 'wait' && s.mode !== 'for') : null;
        if (event === 'appointment_rescheduled' && waitStep && wf.trigger.type !== 'appointment_before' && !(p.restart && wf.trigger.type === 'appointment_created')) {
          const target = waitTarget(waitStep, p.appointment);
          if (!Number.isFinite(target)) return;
          const late = waitStep.mode === 'before' && target < now - 15 * 60e3;
          r.dueAt = new Date(Math.max(target, now)).toISOString();
          if (late) r.skipNext = true; else delete r.skipNext;
          r.updatedAt = nowISO();
          r.log.push({ at: nowISO(), text: 'Programarea s-a mutat: ' + (late ? 'ora (' + waitText(waitStep) + ') a trecut, mesajul următor e sărit' : 'așteaptă până la ' + roStamp(target)) });
          if (r.dueAt <= new Date(now).toISOString()) fresh0.push(r.id);
          return;
        }
        if (event === 'appointment_deleted' || (wf && (wf.trigger.type === 'appointment_before' || (wf.trigger.type === 'appointment_created' && (event !== 'appointment_rescheduled' || p.restart))))) {
          r.status = 'stopped'; r.updatedAt = nowISO(); r.log.push({ at: nowISO(), text: event === 'appointment_deleted' ? 'Programarea a fost ștearsă' : event === 'appointment_rescheduled' ? 'Programarea s-a mutat: mesajele pornesc din nou pentru noua dată' : 'Programarea s-a mutat / anulat' });
        }
      });
    }
    const fresh = fresh0;
    if (event !== 'appointment_deleted' && !(event === 'appointment_rescheduled' && ['anulata', 'finalizata'].includes(p.appointment && p.appointment.status))) {
      doc.workflows.filter((wf) => matches(wf, event, p)).forEach((wf) => {
        const due = dueFor(wf, p, now);
        if (due == null) return;
        const run = { id: uid(), wf: wf.id, ent, at: '^', dueAt: new Date(due).toISOString(), status: 'waiting', createdAt: nowISO(), updatedAt: nowISO(), log: [{ at: nowISO(), text: 'Pornit: ' + TRIGGERS[wf.trigger.type].label }] };
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
// the first name as a client reads it: "evelin" / "EVELIN" (as typed in a form) → "Evelin"; one written with care stays
function firstName(name) {
  const w = String(name || '').trim().split(/\s+/)[0] || '';
  return w === w.toLowerCase() || w === w.toUpperCase() ? w.toLowerCase().replace(/(^|[-'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : w;
}
function vars(ctx, settings) {
  const a = ctx.appointment || {}, l = ctx.lead || {};
  const person = personOf(ctx);
  const loc = a.location || l.location || '';
  return {
    prenume: firstName(person.name), nume: person.name, telefon: person.phone,
    data: roDate(a.date), ora: a.time || '', zi: a.date ? relDay(a.date) : '', tratament: a.treatment || l.interest || 'tratament',
    locatie: loc, adresa: (settings.addresses || {})[loc] || loc, interes: l.interest || a.treatment || 'tratamentele noastre',
    procedura: l.interest || a.treatment || 'tratament',
    link_recenzie: settings.reviewLink || '',
  };
}
// (no long dashes in what clients receive, even in a message saved before that rule)
const render = (text, v) => dedash(String(text || '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)).replace(/[ \t]+\n/g, '\n').trim());
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
  if (cond === 'package') return !!(a && a.package);
  if (cond === 'appt_done') return !!(a && a.status === 'finalizata');
  if (cond === 'appt_cancelled') return !a || a.status === 'anulata';
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

// "Așteaptă până la ...": the moment, from the appointment (start - N for before, end + N for after)
function waitTarget(s, a) {
  if (!a) return NaN;
  const start = apptStart(a);
  if (!Number.isFinite(start)) return NaN;
  const amt = (Number(s.amount) || 0) * unitMs[s.unit || 'h'];
  if (s.mode === 'before') return start - amt;
  const [sh, sm] = String(a.time || '10:00').split(':').map(Number), [eh, em] = String(a.endTime || '').split(':').map(Number);
  const len = Number.isFinite(eh) && eh * 60 + (em || 0) > sh * 60 + (sm || 0) ? (eh * 60 + (em || 0) - sh * 60 - (sm || 0)) * 60e3 : 3600e3;
  return start + len + amt;
}
const waitText = (s) => (s.amount || 0) + ' ' + ({ min: 'min', h: 'h', d: 'zile' }[s.unit || 'h']) + (s.mode === 'before' ? ' înainte de programare' : ' după programare');
const roStamp = (ms) => new Date(ms).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Steps form a tree (an "if" holds its own yes / no lists). They run through a map of
// id → what comes next, so a waiting run keeps only the id of the step it continues with
// ('^' = from the start, '$' = nothing left) and editing the workflow doesn't derail runs in flight.
function compile(steps) {
  const ops = new Map();
  const walk = (list, next) => {
    let entry = next;
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (s.type === 'if') ops.set(s.id, { s, yes: walk(s.yes || [], entry), more: (s.more || []).map((b) => ({ b, at: walk(b.steps || [], entry) })), no: walk(s.no || [], entry) });
      else ops.set(s.id, { s, next: entry });
      entry = s.id;
    }
    return entry;
  };
  return { start: walk(steps || [], '$'), ops };
}

const COND_TEXT = {
  contacted: 'leadul a fost contactat', booked: 'leadul are programare', appt_inactive: 'programarea e anulată / finalizată',
  appt_confirmed: 'programarea e confirmată', future_appt: 'are deja o programare viitoare',
  package: 'e ședință din pachet', appt_done: 'tratamentul e finalizat', appt_cancelled: 'programarea e anulată',
};
const condText = (s) => ({ interest: 'procedura e ' + String(s.value).split('|').join(' sau '), location: 'orașul e ' + s.value, source: 'sursa e ' + s.value, category: 'categoria e ' + (CATS[s.value] || s.value) })[s.cond] || COND_TEXT[s.cond] || s.cond;
function condHit(s, ctx) {
  const a = ctx.appointment, l = ctx.lead;
  if (s.cond === 'interest') return String(s.value).split('|').map(fold).filter(Boolean).some((w) => [l && l.interest, a && a.treatment].some((x) => x && fold(x).includes(w)));
  if (s.cond === 'location') return ((a && a.location) || (l && l.location) || '') === s.value;
  if (s.cond === 'source') return !!(l && l.source === s.value);
  if (s.cond === 'category') return !!(a && (Array.isArray(a.categories) && a.categories.length ? a.categories : [a.category]).includes(s.value));
  return stopHit(s.cond, ctx);
}

// One template to one phone, from a number: { sent, why, city }. wa = { tpls, cfg } (read once per tick).
// A message sent to a client by the automations also goes in her WhatsApp chat (Mesaje), marked "automat": the team
// sees what she got, and Panou → KPI counts who read it and who answered. Never throws.
async function logSent(tpl, phone, city, id, v) {
  try {
    const { normalizePhone } = require('./clients');
    const p = normalizePhone(phone) || String(phone || '');
    if (!p) return;
    const KEY = 'data/whatsapp-conversations.json';
    const conversations = await readJSON(KEY, []);
    let convo = conversations.find((c) => c.phone === p);
    if (!convo) { convo = { phone: p, clientName: v.nume || p, location: city, lastMessageAt: nowISO(), unreadCount: 0, messages: [] }; conversations.push(convo); }
    if (!convo.location) convo.location = city;
    if (convo.messages.some((m) => m.id === id)) return;
    const text = WT.friendly(tpl).replace(/\{(\w+)\}/g, (m, k) => v[k] || '-');
    // the picture of the header goes in the chat too (the client got it); the map pin as a line
    const img = WT.imageOf(tpl);
    const pin = tpl.headerType === 'LOCATION' ? '📍 Locația clinicii' + (city ? ' (' + city + ')' : '') : '';
    convo.messages.push(Object.assign({ id: id || uid(), direction: 'out', type: 'template', templateId: tpl.id, text: [pin, tpl.header, text, tpl.footer].filter(Boolean).join('\n'),
      status: 'sent', timestamp: nowISO(), sentBy: null, sentByName: 'automat', auto: true }, img ? { media: { kind: 'image', mime: 'image/jpeg', filename: 'poza.jpg', path: img } } : {}));
    convo.lastMessageAt = nowISO();
    await writeJSON(KEY, conversations);
  } catch (err) { console.error('workflows.logSent error:', err.message); }
}

async function sendTemplate(wa, templateId, from, phone, v, opts) {
  const tpl = (wa.tpls || []).find((t) => t.id === templateId);
  if (!tpl) return { why: 'șablonul WhatsApp nu mai există' };
  if (!phone) return { why: 'fără telefon' };
  const ready = wa.cfg ? WA.readyNumbers(wa.cfg) : [];
  if (!ready.length) return { why: 'WhatsApp nu e conectat' };
  const city = ready.includes(from) ? from : ready[0];
  const n = wa.cfg.numbers[city];
  if (!WT.approvedFor(tpl, n.wabaId)) return { why: 'șablonul „' + tpl.label + '” nu e aprobat de Meta pentru numărul ' + city, city, pending: /PENDING|IN_REVIEW/i.test(String((tpl.meta[n.wabaId] || {}).status || '')) };
  const r = await sendWhatsApp({ phone, template: (tpl.meta[n.wabaId] || {}).name || tpl.name, language: tpl.language || 'ro', params: (tpl.map || []).map((k) => v[k] || '-'), from: city, headerImagePath: WT.imageOf(tpl), headerLocation: tpl.headerType === 'LOCATION' });
  if (r.sent && !(opts && opts.nolog)) await logSent(tpl, phone, r.fromCity || city, r.id, v);
  return r.sent ? { sent: true, city: r.fromCity || city, label: tpl.label } : { why: 'Meta a refuzat (' + r.error + ')', city };
}
const cityOf = (ctx) => (ctx.appointment && ctx.appointment.location) || (ctx.lead && ctx.lead.location) || '';

// A new lead from the ads gets the welcome message of its offer at once, no flow: every WhatsApp template that names
// the offer in "Se trimite singur la lead nou" (Șabloane / Automatizări → Mesaje). From the lead's city number; an
// offer of one city only for the leads of that city. A lead from a form of the site gets the templates marked
// "Lead de pe site" (key 'site'), from the city it picked. What happened is written on the lead (Pipeline → its history):
// sent, or why not (a template not approved by Meta yet is skipped). Never throws.
async function welcome(lead) {
  try {
    if (!lead || !lead.phone || !['facebook', 'site'].includes(lead.source)) return;
    let key, cities = ['Timișoara', 'Arad'];
    if (lead.source === 'site') key = 'site';
    else {
      if (!lead.interest) return;
      const offers = await require('./offers').loadOffers(readJSON);
      const offer = offers.find((o) => fold(o.title) === fold(lead.interest) || o.key === lead.interest);
      if (!offer) return;
      key = offer.key;
      cities = [...new Set((offer.locations || []).map((l) => (/arad/i.test(l) ? 'Arad' : 'Timișoara')))];
      if (cities.length === 1 && lead.location && lead.location !== cities[0]) return;
    }
    const wa = { tpls: (await WT.load()).templates, cfg: await WA.loadConfig() };
    const tpls = wa.tpls.filter((t) => (t.leadOffers || []).includes(key));
    if (!tpls.length) return;
    const settings = (await loadDoc()).settings || {};
    const v = vars({ lead }, settings);
    const notes = [];
    let refused = '';
    for (const t of tpls) {
      const r = await sendTemplate(wa, t.id, lead.location || cities[0], lead.phone, v);
      notes.push(r.sent ? 'WhatsApp de bun venit trimis („' + t.label + '”, de pe numărul ' + r.city + ')' : 'Mesajul de bun venit n-a plecat: ' + r.why);
      if (!r.sent && /^Meta a refuzat/.test(r.why || '')) refused = r.why;
    }
    const leads = await readJSON(LEADS_KEY, []);
    const l = leads.find((x) => x.id === lead.id);
    if (!l) return;
    notes.forEach((text) => (l.activities = l.activities || []).push({ id: uid(), type: 'note', text, author: 'WhatsApp automat', at: nowISO() }));
    await writeJSON(LEADS_KEY, leads);
    if (refused) await require('../portal-leads').markUndelivered(lead.phone, refused);
  } catch (err) {
    console.error('workflows.welcome error:', err.message);
  }
}

// "Anunță echipa": the bell in the portal and the phone (Web Push) of everyone picked, plus, if
// asked, a WhatsApp template to their own number.
async function notifyTeam(s, v, ctx, wa) {
  const employees = (await readJSON('data/employees.json', [])).filter((e) => e.active !== false);
  const ids = new Set();
  for (const to of s.to || []) {
    if (to === 'role:admin') { ids.add('admin'); employees.filter((e) => e.role === 'admin').forEach((e) => ids.add(e.id)); }
    else if (to.startsWith('role:')) employees.filter((e) => e.role === to.slice(5)).forEach((e) => ids.add(e.id));
    else if (to.startsWith('emp:')) { const id = to.slice(4); if (id === 'admin' || employees.some((e) => e.id === id)) ids.add(id); }
  }
  if (!ids.size) return { people: 0, pushed: 0, wa: 0 };
  const store = { readJSON, writeJSON };
  const title = render(s.title, v), text = render(s.text, v);
  const go = ctx.appointment ? 'programari' : 'pipeline';
  // bell + phone; the portal's own new-lead alert has the same tag, so the lead rings once
  const pushed = await notifyMany(store, [...ids], { kind: ctx.appointment ? 'alert' : 'lead', tone: 'info', title, text, go, tag: ctx.lead ? 'lead-' + ctx.lead.id : ctx.appointment ? 'appt-' + ctx.appointment.id : '' });
  let waSent = 0;
  if (s.whatsapp && s.templateId) {
    const admin = ids.has('admin') ? await readJSON('data/admin-profile.json', {}) : {};
    for (const id of ids) {
      const phone = id === 'admin' ? admin.phone : (employees.find((e) => e.id === id) || {}).phone;
      if (!phone) continue;
      const r = await sendTemplate(wa || {}, s.templateId, s.from === 'auto' ? cityOf(ctx) : s.from, phone, v, { nolog: true }); // to the team, not a client
      if (r.sent) waSent++;
    }
  }
  return { people: ids.size, pushed, wa: waSent };
}

async function runOne(run, wf, settings, counters) {
  const ctx = await context(run.ent);
  const log = (text) => run.log.push({ at: nowISO(), text });
  if (!ctx.lead && !ctx.appointment) { run.status = 'stopped'; log('Leadul / programarea nu mai există'); return; }
  // runs saved before branches existed kept an index into the list of steps
  if (run.at === undefined) run.at = !run.step ? '^' : ((wf.steps[run.step] || {}).id || '$');
  // the clock came late (no portal open and the scheduler delayed): a message meant for a moment before the appointment
  // still goes while it is still right: a "mâine" one (12h or more before) while it is still the day before, a
  // "peste ~2 ore" one while there is still half an hour to go; otherwise it is skipped
  const late = run.dueWas ? Date.now() - Date.parse(run.dueWas) : 0;
  delete run.dueWas;
  if (run.waitId && late > 45 * 60e3) {
    const w = flat(wf.steps).find((x) => x.id === run.waitId);
    if (w && w.type === 'wait' && w.mode === 'before') {
      const start = apptStart(ctx.appointment);
      const hours = (Number(w.amount) || 0) * (unitMs[w.unit] || unitMs.h) / 3600e3;
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
      const still = Number.isFinite(start) && (hours >= 12 ? today < String((ctx.appointment || {}).date || '') : Date.now() < start - 30 * 60e3);
      if (still) log('Vine cu ' + Math.round(late / 60e3) + ' min întârziere, dar mesajul e încă potrivit');
      else { run.skipNext = true; log('Ora (' + waitText(w) + ') a trecut de ' + Math.round(late / 60e3) + ' min, mesajul următor e sărit'); }
    }
  }
  // "Lead necontactat": only fires if nobody has reached the lead in the meantime.
  if (run.at === '^' && wf.trigger.type === 'lead_idle' && stopHit('contacted', ctx)) { run.status = 'done'; log('Leadul a fost contactat între timp'); return; }
  const prog = compile(wf.steps);
  const v = vars(ctx, settings);
  const person = personOf(ctx);
  const c = counters[wf.id] = counters[wf.id] || { runs: 0, sent: 0, tasks: 0 };
  let id = run.at === '^' ? prog.start : run.at;
  for (let guard = 0; id !== '$'; guard++) {
    if (guard > 100) { run.status = 'error'; log('Prea mulți pași la rând'); return; }
    const op = prog.ops.get(id);
    if (!op) { run.status = 'stopped'; log('Pasul următor a fost șters din automatizare'); return; }
    const s = op.s;
    if (s.type === 'if') {
      if (op.more.length) {
        const pick = condHit(s, ctx) ? { at: op.yes, name: s.name || condText(s) } : (op.more.find((x) => condHit(x.b, ctx)) || null);
        const name = pick ? (pick.b ? pick.b.name || condText(pick.b) : pick.name) : 'Altfel';
        log('Ramura: ' + name);
        id = pick ? pick.at : op.no;
        continue;
      }
      const hit = condHit(s, ctx);
      log((hit ? 'Da: ' : 'Nu: ') + condText(s));
      id = hit ? op.yes : op.no;
      continue;
    }
    id = op.next;
    run.at = id;
    if (s.type === 'wait') {
      run.skipNext = false;
      if (s.mode === 'before' || s.mode === 'after') {
        const target = waitTarget(s, ctx.appointment);
        if (!Number.isFinite(target)) { run.status = 'stopped'; log('Programarea nu mai există'); return; }
        if (target <= Date.now()) {
          // booked too late for this moment (a same-day booking and a 24h reminder): the message after it is skipped
          if (s.mode === 'before' && target < Date.now() - 15 * 60e3) { run.skipNext = true; log('Ora (' + waitText(s) + ') a trecut deja, mesajul următor e sărit'); }
          continue;
        }
        run.dueAt = new Date(target).toISOString();
        run.waitId = s.id;
        log('Așteaptă până la ' + waitText(s) + ' (' + roStamp(target) + ')');
        return;
      }
      run.waitId = '';
      run.dueAt = new Date(Date.now() + s.amount * unitMs[s.unit]).toISOString();
      log('Așteaptă ' + s.amount + ' ' + ({ min: 'min', h: 'h', d: 'zile' }[s.unit]));
      return;
    }
    if (run.skipNext && (s.type === 'whatsapp' || s.type === 'notify')) { run.skipNext = false; log('Sărit: ' + (s.type === 'whatsapp' ? 'mesajul' : 'anunțul') + ' venea după o oră care trecuse'); continue; }
    if (s.type === 'stop_if') {
      if (condHit(s, ctx)) { run.status = 'done'; log('Oprit: ' + condText(s)); return; }
      continue;
    }
    if (s.type === 'notify') {
      const r = await notifyTeam(s, v, ctx, settings._wa);
      log(r.people ? 'Echipa anunțată: ' + r.people + (r.people === 1 ? ' persoană' : ' persoane') + (r.pushed ? ', ' + r.pushed + ' pe telefon' : '') + (r.wa ? ', ' + r.wa + ' pe WhatsApp' : '') : 'Nimeni de anunțat (rol fără oameni activi)');
      continue;
    }
    if (s.type === 'whatsapp') {
      const r = await sendTemplate(settings._wa || {}, s.templateId, s.from === 'auto' || !s.from ? cityOf(ctx) : s.from, person.phone, v);
      if (r.sent) { delete run.retryUntil; c.sent++; log('WhatsApp de pe ' + r.city + ': „' + r.label + '”'); continue; }
      // Meta is still reviewing the template (just made): the same message again in 10 minutes, for at most 45
      if (r.pending && (!run.retryUntil || Date.now() < Date.parse(run.retryUntil))) {
        run.retryUntil = run.retryUntil || new Date(Date.now() + 45 * 60e3).toISOString();
        run.at = s.id;
        run.dueAt = new Date(Date.now() + 10 * 60e3).toISOString();
        log('Mesajul e încă la Meta pentru aprobare, încerc din nou peste 10 minute');
        return;
      }
      delete run.retryUntil;
      log((r.why || 'nu a plecat') + ', mesajul n-a plecat');
      continue;
    }
    if (s.type === 'task' && !FALLBACK_TASKS) { log('Sarcină sărită (sarcinile le pune doar recepția)'); continue; }
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
  run.at = '$';
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
  due.forEach((r) => { r.dueWas = r.dueAt; r.dueAt = lease; }); // claim (when it was due: a late "before" message is skipped)
  await saveRuns(runsDoc);
  const wa = { tpls: (await WT.load()).templates, cfg: await WA.loadConfig() };
  const settings = Object.assign({}, doc.settings, { _wa: wa });
  for (const run of due) {
    const wf = doc.workflows.find((w) => w.id === run.wf);
    if (!wf || !wf.active) { run.status = 'stopped'; run.log.push({ at: nowISO(), text: wf ? 'Automatizarea a fost oprită' : 'Automatizarea a fost ștearsă' }); run.updatedAt = nowISO(); continue; }
    try { await runOne(run, wf, settings, runsDoc.counters); }
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

// A reminder flow ("appointment booked") switched on or saved while on: the bookings already in the calendar (its city,
// from today on, not cancelled / finished) get it too, from its first wait on (24h before, 2h before, the review),
// without the confirmation (they booked before). A booking that already has a run of this flow is left alone.
// Returns how many.
async function enrollUpcoming(wf) {
  try {
    if (!wf || !wf.active || !wf.trigger || wf.trigger.type !== 'appointment_created') return 0;
    const first = (wf.steps || []).find((s) => s.type === 'wait');
    if (!first) return 0;
    const [appointments, runsDoc] = await Promise.all([readJSON('data/appointments.json', []), loadRuns()]);
    const now = Date.now();
    const has = new Set(runsDoc.runs.filter((r) => r.wf === wf.id).map((r) => r.ent && r.ent.id));
    const loc = wf.trigger.location && wf.trigger.location !== 'any' ? wf.trigger.location : '';
    const list = appointments.filter((a) => a && a.id && !has.has(a.id) && a.time && !['anulata', 'finalizata', 'concediu'].includes(a.status) &&
      (!loc || a.location === loc) && apptStart(a) > now);
    list.forEach((a) => {
      runsDoc.runs.push({ id: uid(), wf: wf.id, ent: { type: 'appointment', id: a.id }, at: first.id, dueAt: new Date(now).toISOString(), status: 'waiting', createdAt: nowISO(), updatedAt: nowISO(),
        log: [{ at: nowISO(), text: 'Pornit: programare deja în calendar când s-a pornit automatizarea (fără confirmare)' }] });
      const c = runsDoc.counters[wf.id] = runsDoc.counters[wf.id] || { runs: 0, sent: 0, tasks: 0 };
      c.runs++;
    });
    if (!list.length) return 0;
    await processRuns(runsDoc, await loadDoc(), runsDoc.runs.slice(-list.length).map((r) => r.id));
    return list.length;
  } catch (err) {
    console.error('workflows.enrollUpcoming error:', err.message);
    return 0;
  }
}

module.exports = {
  firstName, enrollUpcoming, CATS, WAIT_MODES, TRIGGERS, STEP_TYPES, STOP_CONDS, VALUE_CONDS, STATUSES, SOURCES, LOCATIONS, RECIPES, MAX_STEPS, loadDoc, saveDoc, loadRuns, validateWorkflow, fromRecipe, emit, tick, render, vars, compile, flat, welcome };
