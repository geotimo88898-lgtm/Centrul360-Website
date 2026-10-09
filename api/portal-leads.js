// POST /api/portal-leads — lead pipeline (portal.html's "Pipeline" tab, UI in
// portal-pipeline.js). One endpoint, action-routed via body.action, same style as
// portal-employees.js / portal-appointments.js:
//
//   list | create | update_details | move_stage | add_note | log_contact |
//   set_followup | link_appointment | delete (admin) | stages_save (admin)
//
// Working tool for reception/cosmeticians: any authenticated role can work leads.
// Admin-only: delete a lead and edit the stages (the two destructive/structural actions).
//
// Stages are editable (data/pipeline-stages.json):
//   { id, name, color, kind }   — ordered by array position
//   kind: 'open'   a normal working stage
//         'booked' an open stage the "Programează" flow moves a lead into
//         'won'    exactly one — moving a lead INTO it upserts the shared client directory
//         'lost'   exactly one — side exit, hidden on the board unless asked for
// The seed reuses the ids of the old fixed pipeline, so existing leads (lead.stage) and the
// Facebook webhook keep working without a migration.
//
// Lead shape (data/leads.json):
//   {
//     id, name, phone, email, source, location, interest, value,
//     stage, position,                      // stage id + order inside the column
//     followUpAt, nextAction,               // ISO datetime ('' = none) + free text
//     lastContactAt, contactCount,
//     lostReason, appointmentId, appointmentAt, clientId,
//     activities: [{ id, type, text, outcome, channel, author, at }],
//     stageChangedAt, createdAt, updatedAt, createdBy,
//   }
// Older leads stored `notes: [{id,text,author,createdAt}]` — normalizeLead() folds them into
// `activities` on read, and the folded form is what gets written back.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAuth, requireAdmin } = require('./_lib/auth');
const { upsertClient } = require('./_lib/clients');

const LEADS_KEY = 'data/leads.json';
const STAGES_KEY = 'data/pipeline-stages.json';

const DEFAULT_STAGES = [
  { id: 'lead_nou', name: 'Lead nou', color: '#4f8fd6', kind: 'open' },
  { id: 'contactat', name: 'Contactat', color: '#c9a227', kind: 'open' },
  { id: 'programare_stabilita', name: 'Programare stabilită', color: '#8b6fd0', kind: 'booked' },
  { id: 'venit_la_programare', name: 'Venit la programare', color: '#d97757', kind: 'open' },
  { id: 'client_fidel', name: 'Client fidel', color: '#2f9d62', kind: 'won' },
  { id: 'pierdut', name: 'Pierdut', color: '#8a8580', kind: 'lost' },
];
// Kept for anything still importing the old constants.
const STAGE_ORDER = DEFAULT_STAGES.filter((s) => s.kind !== 'lost').map((s) => s.id);
const ALL_STAGES = DEFAULT_STAGES.map((s) => s.id);

const VALID_KINDS = ['open', 'booked', 'won', 'lost'];
const VALID_SOURCES = ['facebook', 'instagram', 'site', 'recomandare', 'telefon', 'walk_in', 'altul'];
const SOURCE_LABELS = { facebook: 'Facebook', instagram: 'Instagram', site: 'Site', recomandare: 'Recomandare', telefon: 'Telefon', walk_in: 'Walk-in', altul: 'Altă sursă' };
// Matches the location strings used everywhere else in the portal (see
// api/portal-appointments.js' VALID_LOCATIONS for why this is a literal list).
const VALID_LOCATIONS = ['Timișoara', 'Arad'];
const VALID_CHANNELS = ['call', 'whatsapp', 'sms', 'in_person'];
const VALID_OUTCOMES = ['raspuns', 'nu_raspunde', 'revine', 'interesat', 'programat', 'refuz', 'numar_gresit'];
const MAX_ACTIVITIES = 200;

// A lead in a working stage with no activity for this long is flagged in the UI.
// Computed on every read — no background job, per the "no cron infra" constraint.
const INACTIVE_DAYS_THRESHOLD = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- helpers
const nowISO = () => new Date().toISOString();
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const normPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  return d.startsWith('40') ? d.slice(2) : d.replace(/^0+/, '');
};
function isoOrEmpty(v) {
  if (!v) return '';
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

async function loadStages() {
  const stored = await readJSON(STAGES_KEY, null);
  return Array.isArray(stored) && stored.length ? stored : DEFAULT_STAGES.slice();
}
const firstOpenStage = (stages) => stages.find((s) => s.kind === 'open' || s.kind === 'booked') || stages[0];
const stageKind = (stages, id) => (stages.find((s) => s.id === id) || {}).kind || 'open';

async function authorName(session) {
  if (!session) return 'Sistem';
  if (session.employeeId === 'admin') return 'Admin';
  const employees = await readJSON('data/employees.json', []);
  const e = employees.find((x) => x.id === session.employeeId);
  return e ? e.name : String(session.employeeId);
}

function normalizeLead(lead) {
  if (!Array.isArray(lead.activities)) {
    lead.activities = (lead.notes || []).map((n) => ({
      id: n.id || crypto.randomUUID(), type: 'note', text: n.text, author: n.author || '', at: n.createdAt || lead.createdAt,
    }));
    lead.activities.unshift({ id: crypto.randomUUID(), type: 'created', text: '', author: '', at: lead.createdAt });
  }
  delete lead.notes;
  if (lead.position == null) lead.position = -new Date(lead.createdAt || 0).getTime() / 1000; // newest on top
  for (const k of ['email', 'interest', 'nextAction', 'followUpAt', 'lastContactAt', 'lostReason', 'appointmentId', 'appointmentAt', 'clientId']) {
    if (lead[k] == null) lead[k] = '';
  }
  if (lead.value == null) lead.value = 0;
  if (lead.contactCount == null) lead.contactCount = 0;
  if (!lead.stageChangedAt) lead.stageChangedAt = lead.updatedAt || lead.createdAt;
  return lead;
}

function addActivity(lead, entry) {
  const at = nowISO();
  lead.activities.push({ id: crypto.randomUUID(), at, ...entry });
  if (lead.activities.length > MAX_ACTIVITIES) lead.activities.splice(1, lead.activities.length - MAX_ACTIVITIES);
  lead.updatedAt = at;
}

function withComputedFields(lead, stages) {
  const now = Date.now();
  const kind = stageKind(stages, lead.stage);
  const working = kind === 'open' || kind === 'booked';
  const stageAt = new Date(lead.stageChangedAt || lead.updatedAt || lead.createdAt).getTime();
  const lastAt = new Date(lead.updatedAt || lead.createdAt).getTime();
  const daysInStage = Number.isFinite(stageAt) ? Math.floor((now - stageAt) / MS_PER_DAY) : 0;
  const idleDays = Number.isFinite(lastAt) ? Math.floor((now - lastAt) / MS_PER_DAY) : 0;
  let followUpState = '';
  if (working && lead.followUpAt) {
    const f = new Date(lead.followUpAt);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    followUpState = f.getTime() < now ? 'overdue' : f.getTime() <= end.getTime() ? 'today' : 'upcoming';
  }
  return {
    ...lead,
    kind,
    daysInStage,
    idleDays,
    isInactive: working && idleDays >= INACTIVE_DAYS_THRESHOLD,
    // Only the entry stage counts: a lead someone already moved forward was obviously reached
    // (older leads predate contact logging, so they have no lastContactAt).
    neverContacted: working && !lead.lastContactAt && !lead.contactCount && lead.stage === firstOpenStage(stages).id,
    followUpState,
  };
}

function validateFields(body, { partial }) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  if (!partial || has('name')) { out.name = clip(body.name, 150); if (!out.name) return { error: 'missing_name' }; }
  if (!partial || has('phone')) { out.phone = clip(body.phone, 30); if (!out.phone) return { error: 'missing_phone' }; }
  if (!partial || has('source')) { if (!VALID_SOURCES.includes(body.source)) return { error: 'invalid_source' }; out.source = body.source; }
  if (!partial || has('location')) { if (!VALID_LOCATIONS.includes(body.location)) return { error: 'invalid_location' }; out.location = body.location; }
  if (has('email')) {
    out.email = clip(body.email, 150);
    if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) return { error: 'invalid_email' };
  }
  if (has('interest')) out.interest = clip(body.interest, 120);
  if (has('value')) {
    const v = Number(body.value || 0);
    if (!Number.isFinite(v) || v < 0 || v > 1e7) return { error: 'invalid_value' };
    out.value = Math.round(v);
  }
  return { fields: out };
}

// Shared lead-creation core, used by the 'create' action and the Facebook Lead Ads webhook
// (api/webhook-facebook-leads.js). A phone number already in the pipeline does not create a
// second card: an open lead gets a "came back" activity and jumps to the top, a lost one is
// reopened in the first stage — so re-submitted Facebook forms never split a client's history.
async function createLead({ name, phone, source, location, createdBy, email, interest, value, note, stageId, authorLabel }) {
  const result = validateFields({ name, phone, source, location, email: email || '', interest: interest || '', value: value || 0 }, { partial: false });
  if (result.error) return { error: result.error };
  const stages = await loadStages();
  const leads = (await readJSON(LEADS_KEY, [])).map(normalizeLead);
  const author = authorLabel || (createdBy === 'facebook-webhook' ? 'Facebook Lead Ads' : '');
  const top = Math.min(0, ...leads.map((l) => l.position || 0)) - 1;

  const key = normPhone(result.fields.phone);
  const existing = key.length >= 6 ? leads.find((l) => normPhone(l.phone) === key && stageKind(stages, l.stage) !== 'won') : null;
  if (existing) {
    const reopened = stageKind(stages, existing.stage) === 'lost';
    if (reopened) {
      existing.stage = firstOpenStage(stages).id;
      existing.stageChangedAt = nowISO();
      existing.lostReason = '';
    }
    if (result.fields.interest && !existing.interest) existing.interest = result.fields.interest;
    if (result.fields.email && !existing.email) existing.email = result.fields.email;
    existing.position = top;
    addActivity(existing, {
      type: 'returned', author,
      text: (reopened ? 'Leadul pierdut s-a întors' : 'A trimis din nou datele') + ' (' + (SOURCE_LABELS[source] || source) + ')' +
        (result.fields.interest ? ' · ' + result.fields.interest : '') + (note ? ' — ' + clip(note, 500) : ''),
    });
    await writeJSON(LEADS_KEY, leads);
    return { lead: withComputedFields(existing, stages), duplicate: true, reopened };
  }

  const now = nowISO();
  const stage = stageId && stages.some((s) => s.id === stageId && s.kind !== 'won' && s.kind !== 'lost') ? stageId : firstOpenStage(stages).id;
  const lead = normalizeLead({
    id: crypto.randomUUID(),
    email: '', interest: '', value: 0,
    ...result.fields,
    stage,
    position: top,
    activities: [{ id: crypto.randomUUID(), type: 'created', text: source, author, at: now }],
    createdAt: now,
    updatedAt: now,
    stageChangedAt: now,
    createdBy,
  });
  if (note) lead.activities.push({ id: crypto.randomUUID(), type: 'note', text: clip(note, 1000), author, at: now });
  leads.push(lead);
  await writeJSON(LEADS_KEY, leads);
  return { lead: withComputedFields(lead, stages) };
}

function validateStages(input) {
  if (!Array.isArray(input) || !input.length || input.length > 15) return { error: 'invalid_stages' };
  const seen = new Set();
  const stages = [];
  for (const s of input) {
    const name = clip(s && s.name, 40);
    const color = /^#[0-9a-f]{6}$/i.test(s && s.color) ? s.color.toLowerCase() : '#8a8580';
    const kind = VALID_KINDS.includes(s && s.kind) ? s.kind : 'open';
    if (!name) return { error: 'missing_stage_name' };
    let id = /^[a-z0-9_]{2,40}$/.test(s.id || '') ? s.id : 'st_' + crypto.randomBytes(4).toString('hex');
    if (seen.has(id)) return { error: 'duplicate_stage' };
    seen.add(id);
    stages.push({ id, name, color, kind });
  }
  const count = (k) => stages.filter((s) => s.kind === k).length;
  if (count('won') !== 1) return { error: 'need_one_won_stage' };
  if (count('lost') !== 1) return { error: 'need_one_lost_stage' };
  if (count('open') + count('booked') < 1) return { error: 'need_open_stage' };
  return { stages };
}

// ---------------------------------------------------------------- handler
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const session = requireAuth(req, res);
  if (!session) return;
  const body = req.body || {};
  const { action } = body;
  const fail = (code, error) => res.status(code).json({ error });

  try {
    if (action === 'create') {
      const result = await createLead({
        name: body.name, phone: body.phone, source: body.source, location: body.location,
        email: body.email, interest: body.interest, value: body.value, note: body.note, stageId: body.stageId,
        createdBy: session.employeeId, authorLabel: await authorName(session),
      });
      if (result.error) return fail(400, result.error);
      res.status(200).json({ ok: true, lead: result.lead, duplicate: !!result.duplicate, reopened: !!result.reopened });
      return;
    }

    if (action === 'stages_save') {
      if (!requireAdmin(req, res)) return;
      const result = validateStages(body.stages);
      if (result.error) return fail(400, result.error);
      const stages = result.stages;
      const ids = new Set(stages.map((s) => s.id));
      // Leads in a removed stage move to the stage the admin picked (or the first working one).
      const reassign = body.reassign || {};
      const fallback = firstOpenStage(stages).id;
      const leads = (await readJSON(LEADS_KEY, [])).map(normalizeLead);
      let moved = 0;
      for (const l of leads) {
        if (ids.has(l.stage)) continue;
        l.stage = ids.has(reassign[l.stage]) ? reassign[l.stage] : fallback;
        l.stageChangedAt = nowISO();
        moved++;
      }
      await writeJSON(STAGES_KEY, stages);
      if (moved) await writeJSON(LEADS_KEY, leads);
      res.status(200).json({ ok: true, stages, moved });
      return;
    }

    const stages = await loadStages();
    const leads = (await readJSON(LEADS_KEY, [])).map(normalizeLead);

    if (action === 'list') {
      const sorted = leads.slice().sort((a, b) => (a.position || 0) - (b.position || 0)).map((l) => withComputedFields(l, stages));
      res.status(200).json({
        ok: true, stages, leads: sorted,
        meta: { sources: VALID_SOURCES, locations: VALID_LOCATIONS, outcomes: VALID_OUTCOMES, channels: VALID_CHANNELS, inactiveDays: INACTIVE_DAYS_THRESHOLD },
      });
      return;
    }

    const lead = body.leadId ? leads.find((l) => l.id === body.leadId) : null;
    if (!body.leadId) return fail(400, 'missing_lead_id');
    if (!lead) return fail(404, 'lead_not_found');
    const author = await authorName(session);
    const save = async (extra) => {
      await writeJSON(LEADS_KEY, leads);
      res.status(200).json({ ok: true, lead: withComputedFields(lead, stages), ...(extra || {}) });
    };

    if (action === 'update_details') {
      const result = validateFields(body, { partial: true });
      if (result.error) return fail(400, result.error);
      const changed = Object.keys(result.fields).filter((k) => String(lead[k] ?? '') !== String(result.fields[k]));
      if (!changed.length) { res.status(200).json({ ok: true, lead: withComputedFields(lead, stages) }); return; }
      Object.assign(lead, result.fields);
      addActivity(lead, { type: 'edit', text: changed.join(', '), author });
      return save();
    }

    if (action === 'move_stage') {
      const target = stages.find((s) => s.id === body.stage);
      if (!target) return fail(400, 'invalid_stage');
      const from = lead.stage;
      if (Number.isFinite(Number(body.position))) lead.position = Number(body.position);
      if (from === target.id) { lead.updatedAt = nowISO(); return save(); }
      lead.stage = target.id;
      lead.stageChangedAt = nowISO();
      if (target.kind === 'lost') lead.lostReason = clip(body.lostReason, 120);
      else lead.lostReason = '';
      if (target.kind === 'won' || target.kind === 'lost') { lead.followUpAt = ''; lead.nextAction = ''; }
      addActivity(lead, {
        type: 'stage', author,
        text: (stages.find((s) => s.id === from) || { name: from }).name + ' → ' + target.name + (lead.lostReason ? ' · ' + lead.lostReason : ''),
      });
      // Winning is the one place this endpoint writes the shared client directory — same
      // upsertClient() every money/booking flow uses, keyed by phone, so a lead and an
      // existing client with the same number collapse onto one record.
      if (target.kind === 'won') {
        const client = await upsertClient({ name: lead.name, phone: lead.phone }, { readJSON, writeJSON });
        lead.clientId = client.id;
      }
      return save();
    }

    if (action === 'add_note') {
      const text = clip(body.text, 1000);
      if (!text) return fail(400, 'missing_text');
      addActivity(lead, { type: 'note', text, author });
      return save();
    }

    if (action === 'log_contact') {
      const channel = VALID_CHANNELS.includes(body.channel) ? body.channel : 'call';
      if (!VALID_OUTCOMES.includes(body.outcome)) return fail(400, 'invalid_outcome');
      const followUpAt = isoOrEmpty(body.followUpAt);
      if (followUpAt === null) return fail(400, 'invalid_followup');
      lead.lastContactAt = nowISO();
      lead.contactCount = (lead.contactCount || 0) + 1;
      if (body.followUpAt !== undefined) lead.followUpAt = followUpAt;
      if (body.nextAction !== undefined) lead.nextAction = clip(body.nextAction, 160);
      addActivity(lead, { type: 'contact', channel, outcome: body.outcome, text: clip(body.text, 1000), author });
      // First real conversation pulls a brand-new lead out of the first column automatically.
      const advance = body.advance !== false && lead.stage === firstOpenStage(stages).id && !['nu_raspunde', 'numar_gresit', 'refuz'].includes(body.outcome);
      const next = advance ? stages.slice(stages.indexOf(stages.find((s) => s.id === lead.stage)) + 1).find((s) => s.kind === 'open') : null;
      if (next) {
        addActivity(lead, { type: 'stage', author, text: (stages.find((s) => s.id === lead.stage) || {}).name + ' → ' + next.name });
        lead.stage = next.id;
        lead.stageChangedAt = nowISO();
      }
      return save();
    }

    if (action === 'set_followup') {
      const followUpAt = isoOrEmpty(body.followUpAt);
      if (followUpAt === null) return fail(400, 'invalid_followup');
      lead.followUpAt = followUpAt;
      if (body.nextAction !== undefined) lead.nextAction = clip(body.nextAction, 160);
      addActivity(lead, {
        type: 'followup', author,
        text: followUpAt ? (lead.nextAction ? lead.nextAction + ' · ' : '') + followUpAt : 'Follow-up șters',
      });
      return save();
    }

    // Called by the UI right after it created the appointment through /api/portal-appointments
    // (so the calendar, the WhatsApp-confirmation task and the client directory all run through
    // their normal path). Records it on the lead and moves it into the 'booked' stage.
    if (action === 'link_appointment') {
      lead.appointmentId = clip(body.appointmentId, 60);
      lead.appointmentAt = clip(body.date, 10) + (body.time ? ' ' + clip(body.time, 5) : '');
      lead.followUpAt = '';
      lead.nextAction = '';
      addActivity(lead, { type: 'booking', text: lead.appointmentAt + (body.treatment ? ' · ' + clip(body.treatment, 120) : ''), author });
      const booked = stages.find((s) => s.kind === 'booked');
      const order = (id) => stages.findIndex((s) => s.id === id);
      if (booked && stageKind(stages, lead.stage) !== 'won' && order(lead.stage) < order(booked.id)) {
        addActivity(lead, { type: 'stage', author, text: (stages.find((s) => s.id === lead.stage) || {}).name + ' → ' + booked.name });
        lead.stage = booked.id;
        lead.stageChangedAt = nowISO();
      } else if (booked && stageKind(stages, lead.stage) === 'lost') {
        lead.stage = booked.id;
        lead.stageChangedAt = nowISO();
      }
      return save();
    }

    if (action === 'delete') {
      if (!requireAdmin(req, res)) return;
      leads.splice(leads.indexOf(lead), 1);
      await writeJSON(LEADS_KEY, leads);
      res.status(200).json({ ok: true });
      return;
    }

    fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-leads error:', err.message);
    res.status(500).json({ error: 'leads_failed' });
  }
};

module.exports.STAGE_ORDER = STAGE_ORDER;
module.exports.ALL_STAGES = ALL_STAGES;
module.exports.createLead = createLead;
