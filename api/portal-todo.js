// POST /api/portal-todo, „De făcut” (the owner, 23.11): his own page, the team never sees it. Mobile first.
//   „Ziua de mâine”  the day's steps top to bottom (time or „toată ziua”, title, note, who, links, files, a Content post),
//                    each checked when done
//   „De făcut”       his tasks: add, edit, check, delete, reorder; each with a date, a note, who, files
//   „La print shop”  every document to print: name, what it is, size, copies (editable), open, download, and one combined
//                    PDF; the files live in the private store (todo/<uuid>.pdf, served by api/portal-file.js to the owner
//                    only), the client sheets from the site (/fise/…), the internal rules and the job description in their
//                    current version (api/portal-regulament.js)
// Who: an admin's session, or the producer's key (Authorization: Bearer <CREATIVE_SSO_SECRET>, as api/content-intake.js)
// for the seed and the uploads. The names of people live only in the stored data, never here.
//   { action: 'get' }                                    → { day, tasks, files, combined }
//   { action: 'step', id, done }                         a step done / not done
//   { action: 'task', task: { id?, title, date, note, who, files } }   add or change a task
//   { action: 'task_done', id, done } · { action: 'task_del', id } · { action: 'task_order', ids }
//   { action: 'copies', id, copies }                     how many to print
//   { action: 'upload', key, name, what, size, group, copies, dataUrl }   a PDF into the store (same key: replaced)
//   { action: 'seed', day, tasks, files, force }         the day, the tasks and the site / document files (once; force: again)
// Data: data/owner-todo.json { day: { date, title, steps: [{ id, time, title, note, who, links, files, content, done, doneAt }] },
//   tasks: [{ id, title, date, note, who, files, done, doneAt, at }], files: [{ id, key, name, what, size, group, copies, src:
//   'store' | 'site' | 'doc', path, url, doc, bytes, combined }] }

const crypto = require('crypto');
const { readJSON, writeJSON, writeBinary } = require('./_lib/store');
const { getSession } = require('./_lib/auth');

const KEY = 'data/owner-todo.json';
const MAX_BYTES = 20 * 1024 * 1024;
const GROUPS = ['flyere', 'carti', 'fise', 'acte', 'tot', 'alte'];
const clip = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, n);
const nowISO = () => new Date().toISOString();
const uid = () => crypto.randomUUID().slice(0, 12);
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

async function load() {
  const d = await readJSON(KEY, null).catch(() => null);
  return Object.assign({ day: null, tasks: [], files: [] }, d && typeof d === 'object' ? d : {});
}
// a link: a section of the portal (go), a file of the print list (file: its key), a page (url, ours or https)
function cleanLink(l) {
  if (!l || typeof l !== 'object') return null;
  const label = clip(l.label, 60);
  if (!label) return null;
  if (l.go && /^[\w/-]{2,60}$/.test(l.go)) return { label, go: l.go };
  if (l.file && /^[\w-]{2,60}$/.test(l.file)) return { label, file: l.file };
  if (l.tab && ['day', 'tasks', 'print'].includes(l.tab)) return { label, tab: l.tab };
  if (l.url && /^(\/[\w/.-]*|https:\/\/[^\s"'<>]+)$/.test(l.url)) return { label, url: String(l.url).slice(0, 300) };
  return null;
}
const cleanFiles = (a) => (Array.isArray(a) ? a : []).map((x) => clip(x, 60)).filter((x) => /^[\w-]{2,60}$/.test(x)).slice(0, 20);
const cleanContent = (v) => (/^[0-9a-f-]{36}$/.test(String(v || '')) ? String(v) : '');
function cleanStep(s, i) {
  return { id: /^[\w-]{2,40}$/.test(String(s.id || '')) ? s.id : 's' + (i + 1), time: clip(s.time, 20), title: clip(s.title, 120), note: clip(s.note, 400), who: clip(s.who, 40),
    links: (Array.isArray(s.links) ? s.links : []).map(cleanLink).filter(Boolean).slice(0, 6), files: cleanFiles(s.files), content: cleanContent(s.content), done: !!s.done, doneAt: s.done ? s.doneAt || nowISO() : '' };
}
function cleanTask(t, old) {
  const x = Object.assign({}, old || {}, {
    title: clip(t.title, 160), date: isDay(t.date) ? t.date : '', note: clip(t.note, 600), who: clip(t.who, 40), files: cleanFiles(t.files),
    links: (Array.isArray(t.links) ? t.links : (old && old.links) || []).map(cleanLink).filter(Boolean).slice(0, 6), content: t.content != null ? cleanContent(t.content) : (old && old.content) || '',
  });
  if (!x.id) { x.id = uid(); x.at = nowISO(); x.done = false; }
  return x;
}
function cleanFile(f, old) {
  const src = ['store', 'site', 'doc'].includes(f.src) ? f.src : (old && old.src) || 'site';
  const x = Object.assign({}, old || {}, {
    key: /^[\w-]{2,60}$/.test(String(f.key || '')) ? f.key : (old && old.key) || uid(), name: clip(f.name, 90) || (old && old.name) || 'Document',
    what: clip(f.what, 200), size: clip(f.size, 30) || 'A4', group: GROUPS.includes(f.group) ? f.group : 'alte',
    copies: Math.max(0, Math.min(5000, Math.round(Number(f.copies) || 0))), src, combined: !!f.combined,
  });
  if (src === 'site') x.url = /^\/[\w/.-]+\.pdf$/.test(String(f.url || '')) ? f.url : (old && old.url) || '';
  if (src === 'doc') x.doc = f.doc === 'fisa' ? 'fisa' : 'regulament';
  if (!x.id) x.id = uid();
  return x;
}

// the files as the page shows them: a link to open, one to download
async function viewFiles(files) {
  const docs = {};
  for (const [k, key] of [['regulament', 'data/regulament.json'], ['fisa', 'data/fisa-postului.json']]) {
    const d = await readJSON(key, null).catch(() => null);
    const v = d && Array.isArray(d.versions) ? d.versions[d.versions.length - 1] : null;
    docs[k] = v ? { path: v.path, size: v.size, at: v.at, n: v.n } : null;
  }
  const safe = (n) => String(n || 'document').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(0, 70) + '.pdf';
  return files.map((f) => {
    let open = '', dl = '', bytes = f.bytes || 0, missing = false;
    if (f.src === 'store' && f.path) { open = '/api/portal-file?p=' + encodeURIComponent(f.path); dl = open + '&dl=1&n=' + encodeURIComponent(safe(f.name)); }
    else if (f.src === 'site' && f.url) { open = f.url; dl = f.url; }
    else if (f.src === 'doc') { const d = docs[f.doc]; if (d) { open = '/api/portal-file?p=' + encodeURIComponent(d.path); dl = open + '&dl=1&n=' + encodeURIComponent(safe(f.name)); bytes = d.size || 0; } else missing = true; }
    else missing = true;
    return { id: f.id, key: f.key, name: f.name, what: f.what, size: f.size, group: f.group, copies: f.copies, src: f.src, open, dl, bytes, missing, combined: !!f.combined, file: safe(f.name) };
  });
}
// a Content post (Conținut) by its id: the current files, so a post made again shows its new video
async function viewContent(id) {
  if (!id) return null;
  try {
    const C = require('./_lib/content');
    const it = (await C.items()).find((x) => x.id === id);
    if (!it) return { id, missing: true };
    const f = (n) => (it.files || []).find((x) => x.name === n);
    const url = (n) => { const x = f(n); return x ? C.fileUrl(it.id, n, x.v) : ''; };
    const vid = f('reel.mp4') ? 'reel.mp4' : f('clean.mp4') ? 'clean.mp4' : '';
    return { id, title: String(it.topic || it.keyword || '').slice(0, 160), kind: it.kind, video: vid ? url(vid) : '', poster: url('cover.jpg') || url(it.cover || ''),
      download: vid ? url(vid) + '&dl=1&as=' + encodeURIComponent('nuki-' + (it.keyword || 'video').toString().replace(/[^\w-]+/g, '-').slice(0, 30) + '.mp4') : '',
      captions: { ig: String((it.captions && it.captions.ig) || it.caption || ''), fb: String((it.captions && it.captions.fb) || it.caption || ''), tt: String((it.captions && it.captions.tt) || it.caption || '') } };
  } catch (e) { return { id, missing: true, error: e.message }; }
}

async function view(d) {
  const ids = new Set([].concat(d.day ? d.day.steps.map((s) => s.content) : [], d.tasks.map((t) => t.content)).filter(Boolean));
  const contents = {};
  for (const id of ids) contents[id] = await viewContent(id);
  return { ok: true, day: d.day, tasks: d.tasks, files: await viewFiles(d.files), contents };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const producer = require('./_lib/content').fromProducer(req);
  const session = getSession(req);
  if (!producer && !(session && session.role === 'admin')) { res.status(session ? 403 : 401).json({ error: session ? 'forbidden' : 'unauthorized' }); return; }
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const a = String(b.action || 'get');
  try {
    const d = await load();
    if (a === 'get') { res.status(200).json(await view(d)); return; }
    if (a === 'step') {
      const s = d.day && d.day.steps.find((x) => x.id === b.id);
      if (!s) { res.status(404).json({ error: 'not_found' }); return; }
      s.done = !!b.done; s.doneAt = s.done ? nowISO() : '';
      await writeJSON(KEY, d);
      res.status(200).json({ ok: true, step: s });
      return;
    }
    if (a === 'task') {
      const t = b.task || {};
      const old = t.id ? d.tasks.find((x) => x.id === t.id) : null;
      if (t.id && !old) { res.status(404).json({ error: 'not_found' }); return; }
      const x = cleanTask(t, old);
      if (!x.title) { res.status(400).json({ error: 'missing_title' }); return; }
      if (old) Object.assign(old, x); else d.tasks.unshift(x);
      await writeJSON(KEY, d);
      res.status(200).json({ ok: true, task: x });
      return;
    }
    if (a === 'task_done' || a === 'task_del') {
      const i = d.tasks.findIndex((x) => x.id === b.id);
      if (i < 0) { res.status(404).json({ error: 'not_found' }); return; }
      if (a === 'task_del') d.tasks.splice(i, 1); else { d.tasks[i].done = !!b.done; d.tasks[i].doneAt = b.done ? nowISO() : ''; }
      await writeJSON(KEY, d);
      res.status(200).json({ ok: true });
      return;
    }
    if (a === 'task_order') {
      const ids = (Array.isArray(b.ids) ? b.ids : []).map(String);
      const pos = new Map(ids.map((id, i) => [id, i]));
      d.tasks.sort((x, y) => (pos.has(x.id) ? pos.get(x.id) : 1e6) - (pos.has(y.id) ? pos.get(y.id) : 1e6));
      await writeJSON(KEY, d);
      res.status(200).json({ ok: true });
      return;
    }
    if (a === 'copies') {
      const f = d.files.find((x) => x.id === b.id);
      if (!f) { res.status(404).json({ error: 'not_found' }); return; }
      f.copies = Math.max(0, Math.min(5000, Math.round(Number(b.copies) || 0)));
      await writeJSON(KEY, d);
      res.status(200).json({ ok: true, copies: f.copies });
      return;
    }
    if (a === 'upload') {
      const m = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dataUrl || ''));
      if (!m) { res.status(400).json({ error: 'not_pdf' }); return; }
      const buf = Buffer.from(m[1], 'base64');
      if (!buf.length || buf.length > MAX_BYTES || buf.slice(0, 4).toString() !== '%PDF') { res.status(400).json({ error: 'bad_file' }); return; }
      const old = b.key ? d.files.find((x) => x.key === b.key) : null;
      const path = 'todo/' + crypto.randomUUID() + '.pdf';
      await writeBinary(path, buf, 'application/pdf');
      const f = cleanFile(Object.assign({}, b, { src: 'store' }), old);
      f.path = path; f.bytes = buf.length; f.at = nowISO();
      if (old) d.files[d.files.indexOf(old)] = f; else d.files.push(f);
      await writeJSON(KEY, d);
      res.status(200).json({ ok: true, file: { id: f.id, key: f.key, bytes: f.bytes } });
      return;
    }
    if (a === 'seed') {
      const force = b.force === true;
      if (b.day && (force || !d.day)) {
        const steps = (Array.isArray(b.day.steps) ? b.day.steps : []).slice(0, 40).map(cleanStep).filter((s) => s.title);
        d.day = { date: isDay(b.day.date) ? b.day.date : '', title: clip(b.day.title, 80), steps };
      }
      if (Array.isArray(b.tasks) && (force || !d.tasks.length)) d.tasks = b.tasks.slice(0, 100).map((t) => cleanTask(t, null)).filter((t) => t.title);
      if (Array.isArray(b.files)) {
        for (const f of b.files.slice(0, 60)) {
          if (f.src === 'store') continue; // a stored file comes with its upload
          const old = d.files.find((x) => x.key === f.key);
          const x = cleanFile(f, old);
          if (old) d.files[d.files.indexOf(old)] = x; else d.files.push(x);
        }
      }
      // the order of the print list: as the seed gives it
      if (Array.isArray(b.order)) { const pos = new Map(b.order.map((k, i) => [k, i])); d.files.sort((x, y) => (pos.has(x.key) ? pos.get(x.key) : 1e6) - (pos.has(y.key) ? pos.get(y.key) : 1e6)); }
      await writeJSON(KEY, d);
      res.status(200).json({ ok: true, steps: d.day ? d.day.steps.length : 0, tasks: d.tasks.length, files: d.files.length });
      return;
    }
    res.status(400).json({ error: 'unknown_action' });
  } catch (err) {
    console.error('portal-todo:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
