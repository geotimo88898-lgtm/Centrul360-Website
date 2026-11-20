// „Fast Cash” (the owner, 20.11): a time-limited premium offer sent on WhatsApp only to the clinic's own people (clients
// with a visit in the last 6 months, leads of the last 90 days), one message a day for a week (teaser, the offer, a new
// bonus each day, the spots left, the last day), from each clinic's own number. The texts and pictures are the owner's
// campaign (written for him, kept out of this public repo): they come in through api/lead-health (POST ?fastcash=…, the
// key) and live in the store: data/fastcash.json, pictures under fastcash/<key>.jpg.
//   templates: each step becomes a WhatsApp marketing template per clinic (api/_lib/wa-templates.js), sent to Meta.
//   Nothing is sent to anyone from here: sending is a separate, later step.

const { readJSON, writeJSON, writeBinary } = require('./store');
const WT = require('./wa-templates');

const KEY = 'data/fastcash.json';
const CITY = { 'Timișoara': 'Timișoara', Arad: 'Arad' };

async function load() { return Object.assign({ campaign: '', steps: [], log: [] }, (await readJSON(KEY, null)) || {}); }

// { campaign, steps: [{ key, label, city, body, footer, buttons, dataUrl?, replaces? }] } → each one a template (upserted by its
// label), its picture stored as the template's example and as the picture sent with every message, then sent to Meta
async function templates(b) {
  const steps = Array.isArray(b && b.steps) ? b.steps : [];
  if (!steps.length) return { error: 'no_steps' };
  const d = await WT.load();
  const out = [];
  for (const s of steps) {
    const key = String(s.key || '').replace(/[^\w-]/g, '').slice(0, 60);
    if (!key || !CITY[s.city]) { out.push({ key, error: 'bad_step' }); continue; }
    let path = '';
    if (s.dataUrl) {
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(s.dataUrl));
      if (!m) { out.push({ key, error: 'bad_image' }); continue; }
      path = 'fastcash/' + key + '.jpg';
      await writeBinary(path, Buffer.from(m[1], 'base64'), 'image/jpeg');
    }
    // replaces: the label of a template this one takes the place of (already sent, so Meta can't change it): deleted
    // at Meta and here first; the new one has its own label (a deleted name stays taken at Meta for a while)
    if (s.replaces && s.replaces !== s.label) {
      const old = d.templates.find((t) => t.label === s.replaces);
      if (old) { const r = await WT.remove(d, old.id); if (r.error) { out.push({ key, error: r.error }); continue; } await WT.save(d); }
    }
    const prev = d.templates.find((t) => t.label === s.label);
    const c = WT.clean({ label: s.label, category: 'MARKETING', headerType: path ? 'IMAGE' : '', body: s.body, footer: s.footer || '', buttons: s.buttons || [], only: [s.city] }, prev);
    if (c.error) { out.push({ key, error: c.error }); continue; }
    const t = c.t;
    if (path) { t.samplePath = path; t.headerImagePath = path; }
    t.fastcash = key;
    if (prev) d.templates[d.templates.indexOf(prev)] = t; else d.templates.push(t);
    await WT.save(d);
    const r = WT.overall(t) === 'DRAFT' || WT.overall(t) === 'REJECTED' ? await WT.submit(d, t.id, [s.city]) : { ok: true, already: true };
    await WT.save(d);
    out.push({ key, label: t.label, name: t.name, status: WT.overall(t), error: r.error || '' });
  }
  const doc = await load();
  doc.campaign = String((b && b.campaign) || doc.campaign || '').slice(0, 80);
  const byKey = new Map((doc.steps || []).map((x) => [x.key, x]));
  out.filter((x) => x.label).forEach((x) => byKey.set(x.key, { key: x.key, label: x.label, name: x.name }));
  doc.steps = Array.from(byKey.values());
  await writeJSON(KEY, doc);
  return { ok: true, templates: out };
}

// Meta's answers for the campaign's templates (read back from Meta first)
async function status() {
  const d = await WT.load();
  await WT.sync(d).catch(() => null);
  await WT.save(d);
  return { ok: true, templates: d.templates.filter((t) => t.fastcash).map((t) => ({ key: t.fastcash, label: t.label, name: t.name, status: WT.overall(t), reason: Object.values(t.meta || {}).map((m) => m.reason).filter(Boolean)[0] || '' })) };
}

module.exports = { KEY, load, templates, status };
