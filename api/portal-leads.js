// POST /api/portal-leads — lead/client pipeline (portal.html's "Pipeline" tab). One
// endpoint, action-routed via body.action: 'list' | 'create' | 'update_details' |
// 'move_stage' | 'add_note' | 'delete' — same style as portal-employees.js /
// portal-appointments.js.
//
// Working tool for reception/cosmeticians, not an admin-only report: any authenticated
// role can list/create/update/move/add a note. Admin-only: delete (deliberately the one
// destructive action, same split as portal-offers.js).
//
// Lead shape (data/leads.json):
//   {
//     id, name, phone, source, location, stage,
//     notes: [{ id, text, author, createdAt }],
//     clientId,                 // '' until converted into the client directory
//     createdAt, updatedAt, createdBy,
//   }
//
// Stages are a fixed, ordered pipeline (STAGE_ORDER) plus a terminal 'pierdut' (lost)
// reachable from any non-terminal stage. Moving a lead INTO 'client_fidel' auto-upserts
// it into the shared client directory (api/_lib/clients.js), exactly like every other
// client-creating flow in the portal, and stores the resulting id as lead.clientId.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAuth, requireAdmin } = require('./_lib/auth');
const { upsertClient } = require('./_lib/clients');

// Ordered — the UI renders one kanban column per stage, in this order. 'pierdut' is
// intentionally not in this list (it's a side-exit reachable from any stage, not a
// step in the forward progression) but is a valid move_stage target — see ALL_STAGES.
const STAGE_ORDER = ['lead_nou', 'contactat', 'programare_stabilita', 'venit_la_programare', 'client_fidel'];
const ALL_STAGES = STAGE_ORDER.concat(['pierdut']);

const VALID_SOURCES = ['facebook', 'instagram', 'site', 'recomandare', 'altul'];

// Matches the location strings used everywhere else in the portal (see
// api/portal-appointments.js' VALID_LOCATIONS for why this is a literal list rather
// than derived from employees.json).
const VALID_LOCATIONS = ['Timișoara', 'Arad'];

// A lead sitting in a non-terminal stage this long without a note/stage-move (i.e.
// updatedAt hasn't moved) gets flagged in the UI as needing follow-up. Computed on
// every list read — no background job, per the "no cron infra" constraint.
const INACTIVE_DAYS_THRESHOLD = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isNonTerminalStage(stage) {
  return STAGE_ORDER.includes(stage) && stage !== 'client_fidel';
}

function withComputedFields(lead) {
  const updatedAt = new Date(lead.updatedAt || lead.createdAt).getTime();
  const daysInStage = Number.isFinite(updatedAt) ? Math.floor((Date.now() - updatedAt) / MS_PER_DAY) : 0;
  const isInactive = isNonTerminalStage(lead.stage) && daysInStage >= INACTIVE_DAYS_THRESHOLD;
  return { ...lead, daysInStage, isInactive };
}

function validateCoreFields({ name, phone, source, location }) {
  const cleanName = String(name || '').trim().slice(0, 150);
  const cleanPhone = String(phone || '').trim().slice(0, 30);
  if (!cleanName) return { error: 'missing_name' };
  if (!cleanPhone) return { error: 'missing_phone' };
  if (!VALID_SOURCES.includes(source)) return { error: 'invalid_source' };
  if (!VALID_LOCATIONS.includes(location)) return { error: 'invalid_location' };
  return { fields: { name: cleanName, phone: cleanPhone, source, location } };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;

  const { action } = req.body || {};

  try {
    const leads = await readJSON('data/leads.json', []);

    if (action === 'list') {
      const sorted = leads
        .slice()
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .map(withComputedFields);
      res.status(200).json({ ok: true, leads: sorted });
      return;
    }

    if (action === 'create') {
      const result = validateCoreFields(req.body || {});
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      const now = new Date().toISOString();
      const lead = {
        id: crypto.randomUUID(),
        ...result.fields,
        stage: 'lead_nou',
        notes: [],
        clientId: '',
        createdAt: now,
        updatedAt: now,
        createdBy: session.employeeId,
      };
      leads.push(lead);
      await writeJSON('data/leads.json', leads);
      res.status(200).json({ ok: true, lead: withComputedFields(lead) });
      return;
    }

    if (action === 'update_details') {
      const { leadId } = req.body || {};
      if (!leadId) {
        res.status(400).json({ error: 'missing_lead_id' });
        return;
      }
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) {
        res.status(404).json({ error: 'lead_not_found' });
        return;
      }
      const result = validateCoreFields(req.body || {});
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      Object.assign(lead, result.fields, { updatedAt: new Date().toISOString() });
      await writeJSON('data/leads.json', leads);
      res.status(200).json({ ok: true, lead: withComputedFields(lead) });
      return;
    }

    if (action === 'move_stage') {
      const { leadId, stage } = req.body || {};
      if (!leadId) {
        res.status(400).json({ error: 'missing_lead_id' });
        return;
      }
      if (!ALL_STAGES.includes(stage)) {
        res.status(400).json({ error: 'invalid_stage' });
        return;
      }
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) {
        res.status(404).json({ error: 'lead_not_found' });
        return;
      }
      lead.stage = stage;
      lead.updatedAt = new Date().toISOString();

      // Converting into "client fidel" is the one place this endpoint writes to the
      // shared client directory — same upsertClient() every other money/booking flow
      // in the portal uses, keyed by phone, so a lead and an existing client with the
      // same number collapse onto one record instead of duplicating it.
      if (stage === 'client_fidel') {
        const client = await upsertClient({ name: lead.name, phone: lead.phone }, { readJSON, writeJSON });
        lead.clientId = client.id;
      }

      await writeJSON('data/leads.json', leads);
      res.status(200).json({ ok: true, lead: withComputedFields(lead) });
      return;
    }

    if (action === 'add_note') {
      const { leadId, text } = req.body || {};
      const cleanText = String(text || '').trim().slice(0, 500);
      if (!leadId) {
        res.status(400).json({ error: 'missing_lead_id' });
        return;
      }
      if (!cleanText) {
        res.status(400).json({ error: 'missing_text' });
        return;
      }
      const lead = leads.find((l) => l.id === leadId);
      if (!lead) {
        res.status(404).json({ error: 'lead_not_found' });
        return;
      }
      // Resolve a display name for the note's author instead of storing a bare
      // employeeId — cheap to denormalize here since employees.json rarely changes.
      const employees = await readJSON('data/employees.json', []);
      const author = employees.find((e) => e.id === session.employeeId);
      const now = new Date().toISOString();
      const note = {
        id: crypto.randomUUID(),
        text: cleanText,
        author: author ? author.name : (session.employeeId === 'admin' ? 'Admin' : session.employeeId),
        createdAt: now,
      };
      lead.notes = lead.notes || [];
      lead.notes.push(note);
      lead.updatedAt = now; // a note counts as activity — resets the inactivity clock
      await writeJSON('data/leads.json', leads);
      res.status(200).json({ ok: true, lead: withComputedFields(lead) });
      return;
    }

    if (action === 'delete') {
      const adminSession = requireAdmin(req, res);
      if (!adminSession) return;
      const { leadId } = req.body || {};
      if (!leadId) {
        res.status(400).json({ error: 'missing_lead_id' });
        return;
      }
      const idx = leads.findIndex((l) => l.id === leadId);
      if (idx === -1) {
        res.status(404).json({ error: 'lead_not_found' });
        return;
      }
      leads.splice(idx, 1);
      await writeJSON('data/leads.json', leads);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    console.error('portal-leads error:', err.message);
    res.status(500).json({ error: 'leads_failed' });
  }
};

module.exports.STAGE_ORDER = STAGE_ORDER;
module.exports.ALL_STAGES = ALL_STAGES;
