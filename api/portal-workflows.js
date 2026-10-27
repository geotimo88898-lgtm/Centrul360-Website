// /api/portal-workflows - Admin → Automatizări (admin only).
//   GET                       workflows + settings + recipes + what the editor needs + recent runs
//   POST { action: 'save', workflow }          create (no id) or update
//   POST { action: 'toggle', id, active }
//   POST { action: 'delete', id }
//   POST { action: 'add_recipe', key }         a ready-made flow, added switched off
//   POST { action: 'settings', settings }      clinic addresses + Google review link (message variables)
//   POST { action: 'run_now' }                 run whatever is due right now
//   POST { action: 'rename', id, name }
//   POST { action: 'duplicate', id }            a copy, switched off, in the same folder
//   POST { action: 'many', ids, op, folder? }   op: on | off | move | delete (the ones ticked)
//   POST { action: 'folder', id?, name }        a new folder, or a new name
//   POST { action: 'folder_delete', id }        its flows stay, without a folder

const { requireAdmin } = require('./_lib/auth');
const { readJSON, writeJSON } = require('./_lib/store');
const { loadOffers } = require('./_lib/offers');
const W = require('./_lib/workflows');
const WA = require('./_lib/whatsapp');
const WT = require('./_lib/wa-templates');

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

async function payload() {
  const [waCfg, waDoc] = await Promise.all([WA.loadConfig(), WT.load()]);
  const [doc, runsDoc, stagesDoc, leads, appointments, offers, employees, admin] = await Promise.all([
    W.loadDoc(), W.loadRuns(), require('./portal-leads').loadStages(), readJSON('data/leads.json', []), readJSON('data/appointments.json', []),
    loadOffers(readJSON, writeJSON), readJSON('data/employees.json', []), readJSON('data/admin-profile.json', {}),
  ]);
  const leadName = new Map(leads.map((l) => [l.id, l.name]));
  const apptName = new Map(appointments.map((a) => [a.id, a.clientName + (a.date ? ' · ' + a.date.slice(8, 10) + '.' + a.date.slice(5, 7) + ' ' + (a.time || '') : '')]));
  const wfName = new Map(doc.workflows.map((w) => [w.id, w.name]));
  // the whole history (the engine keeps every waiting run and the last 400 finished), for the filters
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const recent = runsDoc.runs.slice().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).map((r) => {
    const l = r.ent.type === 'lead' ? leadById.get(r.ent.id) : null;
    const forms = l && Array.isArray(l.forms) ? l.forms : [];
    return {
      id: r.id, workflowId: r.wf, workflow: wfName.get(r.wf) || 'Automatizare ștearsă', status: r.status, dueAt: r.dueAt, createdAt: r.createdAt, updatedAt: r.updatedAt,
      who: (r.ent.type === 'lead' ? leadName.get(r.ent.id) : apptName.get(r.ent.id)) || '-', kind: r.ent.type,
      form: forms.length ? forms[forms.length - 1].name || '' : '', interest: (l && l.interest) || '', location: (l && l.location) || '',
      log: r.log.slice(-8),
    };
  });
  // per flow: running now, finished / stopped / errors, last run, runs in the last 7 / 30 days
  const waiting = {}, stats = {};
  const now = Date.now();
  runsDoc.runs.forEach((r) => {
    if (r.status === 'waiting') waiting[r.wf] = (waiting[r.wf] || 0) + 1;
    const x = stats[r.wf] = stats[r.wf] || { waiting: 0, done: 0, stopped: 0, errors: 0, runs7d: 0, runs30d: 0, last: '' };
    if (r.status === 'waiting') x.waiting++; else if (r.status === 'done') x.done++; else if (r.status === 'error') x.errors++; else x.stopped++;
    const t = Date.parse(r.createdAt || r.updatedAt);
    if (now - t < 7 * 864e5) x.runs7d++;
    if (now - t < 30 * 864e5) x.runs30d++;
    if (!x.last || r.updatedAt > x.last) x.last = r.updatedAt;
  });
  return {
    ok: true,
    workflows: doc.workflows,
    folders: doc.folders || [],
    settings: doc.settings,
    counters: runsDoc.counters,
    waiting, stats,
    recent,
    recipes: W.RECIPES.map((r) => ({ key: r.key, name: r.name, note: r.note, trigger: r.trigger, steps: r.steps })),
    meta: {
      triggers: Object.keys(W.TRIGGERS).map((k) => ({ id: k, label: W.TRIGGERS[k].label, entity: W.TRIGGERS[k].entity })),
      stages: (stagesDoc || []).map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
      statuses: W.STATUSES, sources: W.SOURCES, locations: W.LOCATIONS, stopConds: W.STOP_CONDS, valueConds: W.VALUE_CONDS, maxSteps: W.MAX_STEPS,
      // the procedures a flow can be about, and the people "Anunță echipa" can reach
      offers: offers.filter((o) => o.active !== false).map((o) => o.title),
      team: [{ id: 'admin', name: admin.name || 'Admin (tu)', role: 'admin' }].concat(employees.filter((e) => e.active !== false).map((e) => ({ id: e.id, name: e.name, role: e.role }))),
      whatsappCloud: WA.readyNumbers(waCfg).length > 0,
      // the WhatsApp step: from which number, which template (Integrări → Șabloane WhatsApp)
      waNumbers: WA.CITIES.map((c) => ({ city: c, connected: !!(waCfg.numbers[c].phoneId && waCfg.numbers[c].token), display: waCfg.numbers[c].display || '' })),
      waTemplates: waDoc.templates.map((t) => WT.view(t, waCfg)),
    },
  };
}

module.exports = async (req, res) => {
  const session = await requireAdmin(req, res);
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
      if (!(doc.folders || []).some((f) => f.id === v.workflow.folder)) v.workflow.folder = '';
      if (id && !existing) { res.status(404).json({ error: 'workflow_not_found' }); return; }
      if (existing) Object.assign(existing, v.workflow, { updatedAt: new Date().toISOString() });
      else {
        if (doc.workflows.length >= 40) { res.status(400).json({ error: 'too_many_workflows' }); return; }
        doc.workflows.push(Object.assign({ id: require('crypto').randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, v.workflow));
      }
      await W.saveDoc(doc);
      // a reminder flow saved while on (e.g. "Creează reamintirile"): the bookings already in the calendar get it too
      const saved = existing || doc.workflows[doc.workflows.length - 1];
      if (saved && saved.active) await W.enrollUpcoming(saved);
    } else if (body.action === 'toggle') {
      const wf = doc.workflows.find((w) => w.id === body.id);
      if (!wf) { res.status(404).json({ error: 'workflow_not_found' }); return; }
      const was = !!wf.active;
      wf.active = !!body.active; wf.updatedAt = new Date().toISOString();
      await W.saveDoc(doc);
      // a reminder flow switched on: the bookings already in the calendar get it too
      if (!was && wf.active) await W.enrollUpcoming(wf);
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
    } else if (body.action === 'rename') {
      const wf = doc.workflows.find((w) => w.id === body.id);
      const name = clip(body.name, 80).trim();
      if (!wf) { res.status(404).json({ error: 'workflow_not_found' }); return; }
      if (!name) { res.status(400).json({ error: 'missing_name' }); return; }
      wf.name = name; wf.updatedAt = new Date().toISOString();
      await W.saveDoc(doc);
    } else if (body.action === 'duplicate') {
      const wf = doc.workflows.find((w) => w.id === body.id);
      if (!wf) { res.status(404).json({ error: 'workflow_not_found' }); return; }
      if (doc.workflows.length >= 40) { res.status(400).json({ error: 'too_many_workflows' }); return; }
      const copy = JSON.parse(JSON.stringify(wf));
      Object.assign(copy, { id: require('crypto').randomUUID(), name: clip(wf.name + ' (copie)', 80), active: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      doc.workflows.push(copy);
      await W.saveDoc(doc);
    } else if (body.action === 'many') {
      const ids = new Set(Array.isArray(body.ids) ? body.ids.map(String) : []);
      const at = new Date().toISOString();
      if (body.op === 'delete') doc.workflows = doc.workflows.filter((w) => !ids.has(w.id));
      else {
        const folder = (doc.folders || []).some((f) => f.id === body.folder) ? body.folder : '';
        doc.workflows.forEach((w) => {
          if (!ids.has(w.id)) return;
          if (body.op === 'on') w.active = true;
          if (body.op === 'off') w.active = false;
          if (body.op === 'move') w.folder = folder;
          w.updatedAt = at;
        });
      }
      await W.saveDoc(doc);
    } else if (body.action === 'folder') {
      const name = clip(body.name, 40).trim();
      if (!name) { res.status(400).json({ error: 'missing_name' }); return; }
      doc.folders = doc.folders || [];
      const f = body.id ? doc.folders.find((x) => x.id === body.id) : null;
      if (f) f.name = name;
      else {
        if (doc.folders.length >= 20) { res.status(400).json({ error: 'too_many_folders' }); return; }
        doc.folders.push({ id: require('crypto').randomUUID().slice(0, 8), name });
      }
      await W.saveDoc(doc);
    } else if (body.action === 'folder_delete') {
      doc.folders = (doc.folders || []).filter((f) => f.id !== body.id);
      doc.workflows.forEach((w) => { if (w.folder === body.id) w.folder = ''; });
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
