// /api/portal-workflows — Admin → Automatizări (admin only).
//   GET                       workflows + settings + recipes + what the editor needs + recent runs
//   POST { action: 'save', workflow }          create (no id) or update
//   POST { action: 'toggle', id, active }
//   POST { action: 'delete', id }
//   POST { action: 'add_recipe', key }         a ready-made flow, added switched off
//   POST { action: 'settings', settings }      clinic addresses + Google review link (message variables)
//   POST { action: 'run_now' }                 run whatever is due right now

const { requireAdmin } = require('./_lib/auth');
const { readJSON } = require('./_lib/store');
const W = require('./_lib/workflows');
const { whatsappConfigured } = require('./_lib/whatsapp');

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

async function payload() {
  const [doc, runsDoc, stagesDoc, leads, appointments] = await Promise.all([
    W.loadDoc(), W.loadRuns(), require('./portal-leads').loadStages(), readJSON('data/leads.json', []), readJSON('data/appointments.json', []),
  ]);
  const leadName = new Map(leads.map((l) => [l.id, l.name]));
  const apptName = new Map(appointments.map((a) => [a.id, a.clientName + (a.date ? ' · ' + a.date.slice(8, 10) + '.' + a.date.slice(5, 7) + ' ' + (a.time || '') : '')]));
  const wfName = new Map(doc.workflows.map((w) => [w.id, w.name]));
  const recent = runsDoc.runs.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 40).map((r) => ({
    id: r.id, workflowId: r.wf, workflow: wfName.get(r.wf) || 'Automatizare ștearsă', status: r.status, dueAt: r.dueAt, updatedAt: r.updatedAt,
    who: (r.ent.type === 'lead' ? leadName.get(r.ent.id) : apptName.get(r.ent.id)) || '—', log: r.log.slice(-6),
  }));
  const waiting = {};
  runsDoc.runs.forEach((r) => { if (r.status === 'waiting') waiting[r.wf] = (waiting[r.wf] || 0) + 1; });
  return {
    ok: true,
    workflows: doc.workflows,
    settings: doc.settings,
    counters: runsDoc.counters,
    waiting,
    recent,
    recipes: W.RECIPES.map((r) => ({ key: r.key, name: r.name, note: r.note, trigger: r.trigger, steps: r.steps })),
    meta: {
      triggers: Object.keys(W.TRIGGERS).map((k) => ({ id: k, label: W.TRIGGERS[k].label, entity: W.TRIGGERS[k].entity })),
      stages: (stagesDoc || []).map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
      statuses: W.STATUSES, sources: W.SOURCES, locations: W.LOCATIONS, stopConds: W.STOP_CONDS,
      whatsappCloud: whatsappConfigured(),
    },
  };
}

module.exports = async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') { res.status(200).json(await payload()); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }

    const body = req.body || {};
    const doc = await W.loadDoc();

    if (body.action === 'save') {
      const v = W.validateWorkflow(body.workflow);
      if (v.error) { res.status(400).json({ error: v.error }); return; }
      const id = body.workflow && body.workflow.id;
      const existing = id ? doc.workflows.find((w) => w.id === id) : null;
      if (id && !existing) { res.status(404).json({ error: 'workflow_not_found' }); return; }
      if (existing) Object.assign(existing, v.workflow, { updatedAt: new Date().toISOString() });
      else {
        if (doc.workflows.length >= 40) { res.status(400).json({ error: 'too_many_workflows' }); return; }
        doc.workflows.push(Object.assign({ id: require('crypto').randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, v.workflow));
      }
      await W.saveDoc(doc);
    } else if (body.action === 'toggle') {
      const wf = doc.workflows.find((w) => w.id === body.id);
      if (!wf) { res.status(404).json({ error: 'workflow_not_found' }); return; }
      wf.active = !!body.active; wf.updatedAt = new Date().toISOString();
      await W.saveDoc(doc);
    } else if (body.action === 'delete') {
      const before = doc.workflows.length;
      doc.workflows = doc.workflows.filter((w) => w.id !== body.id);
      if (doc.workflows.length === before) { res.status(404).json({ error: 'workflow_not_found' }); return; }
      await W.saveDoc(doc);
    } else if (body.action === 'add_recipe') {
      const r = W.RECIPES.find((x) => x.key === body.key);
      if (!r) { res.status(404).json({ error: 'recipe_not_found' }); return; }
      doc.workflows.push(W.fromRecipe(r, false));
      await W.saveDoc(doc);
    } else if (body.action === 'settings') {
      const s = body.settings || {};
      doc.settings = {
        addresses: { 'Timișoara': clip(s.addresses && s.addresses['Timișoara'], 200).trim(), 'Arad': clip(s.addresses && s.addresses['Arad'], 200).trim() },
        reviewLink: /^https?:\/\//.test(String(s.reviewLink || '')) ? clip(s.reviewLink, 300) : '',
      };
      await W.saveDoc(doc);
    } else if (body.action === 'run_now') {
      await W.tick(true);
    } else {
      res.status(400).json({ error: 'invalid_action' });
      return;
    }
    res.status(200).json(await payload());
  } catch (err) {
    console.error('portal-workflows error:', err.message);
    res.status(500).json({ error: 'workflows_failed' });
  }
};
