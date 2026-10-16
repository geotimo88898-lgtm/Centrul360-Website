// POST /api/portal-academy, Traininguri progress and media.
//
// Everyone (for herself):
//   { action: 'read', ref }                 "Am citit" on a chapter ("m:<manual>/<chapter>") or a treatment sheet ("s:<id>")
//   { action: 'quiz', ref, answers:[i] }    a chapter's test: graded here, the right answers come back with the score
//   { action: 'case', id, choice }          a practice case: right or not, and the solution
//   { action: 'task', id, done }            a task of her first-week path done (the owner confirms it) or undone
// Owner:
//   { action: 'confirm', emp, id, ok }      a task confirmed, or sent back to be done again
//   { action: 'path', emp, role, start }    the first-week path started (role receptie|cosmetician) or stopped (role '')
//   { action: 'media_image', dataUrl }      a photo for a chapter, sheet or case → { path }
//   POST ?upload=1 (Vercel Blob client)     a video, uploaded from the browser straight to the store (big files)

const crypto = require('crypto');
const { readJSON, writeJSON, writeBinary } = require('./_lib/store');
const { requireAuth, requireAdmin } = require('./_lib/auth');
const { defaultConfig } = require('./_lib/defaults');
const { mergeAcademy, findRef } = require('./_lib/academy');
const P = require('./_lib/academy-progress');
const { notify, notifyMany } = require('./_lib/notify');

const VIDEO = /^academy\/[\w-]{6,80}\.(mp4|mov|webm|m4v)$/;
const MAX_VIDEO = 500 * 1024 * 1024;

async function uploadVideo(req, res) {
  const session = requireAdmin(req, res);
  if (!session) return;
  try {
    const { handleUpload } = require('@vercel/blob/client');
    const out = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!VIDEO.test(pathname)) throw new Error('invalid_path');
        return { allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'], maximumSizeInBytes: MAX_VIDEO, addRandomSuffix: false, allowOverwrite: true };
      },
    });
    res.status(200).json(out);
  } catch (err) {
    console.error('academy upload:', err.message);
    res.status(400).json({ error: 'upload_failed' });
  }
}

const now = () => new Date().toISOString();
const admins = (employees) => ['admin'].concat(employees.filter((e) => e.role === 'admin' && e.active !== false).map((e) => e.id));

module.exports = async (req, res) => {
  if (req.query && req.query.upload) return uploadVideo(req, res);
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = requireAuth(req, res);
  if (!session) return;
  const b = req.body || {};
  const isAdmin = session.role === 'admin';
  const fail = (code, error) => res.status(code).json({ error });
  try {
    const config = (await readJSON('data/config.json', null)) || defaultConfig();
    const ac = mergeAcademy(config.academy);
    const me = session.employeeId;

    if (b.action === 'read') {
      const f = findRef(ac, b.ref);
      if (!f || f.kind === 'case') return fail(400, 'invalid_ref');
      b.title = f.kind === 'chapter' ? f.chapter.title : f.scheme.name;
      const progress = await P.update(me, (p) => { if (!p.read[b.ref]) p.read[b.ref] = now(); });
      return res.status(200).json({ ok: true, progress });
    }

    if (b.action === 'quiz') {
      const f = findRef(ac, b.ref);
      if (!f || f.kind !== 'chapter' || !f.chapter.quiz.length) return fail(400, 'invalid_ref');
      const answers = Array.isArray(b.answers) ? b.answers : [];
      const results = f.chapter.quiz.map((q, i) => ({ ok: Number(answers[i]) === q.answer, answer: q.answer, why: q.why || '' }));
      const score = results.filter((r) => r.ok).length, total = results.length;
      b.title = f.chapter.title;
      const progress = await P.update(me, (p) => {
        const prev = p.quiz[b.ref] || {};
        p.quiz[b.ref] = { score, total, best: Math.max(Number(prev.best) || 0, score), tries: (Number(prev.tries) || 0) + 1, at: now() };
      });
      return res.status(200).json({ ok: true, score, total, results, progress });
    }

    if (b.action === 'case') {
      const c = ac.cases.find((x) => x.id === b.id);
      if (!c || (!c.verified && !isAdmin)) return fail(400, 'invalid_ref');
      const choice = Math.round(Number(b.choice));
      if (!c.options[choice]) return fail(400, 'invalid_choice');
      const right = !!c.options[choice].ok;
      b.title = c.title;
      const progress = await P.update(me, (p) => {
        const prev = p.cases[c.id] || {};
        p.cases[c.id] = { ok: right, everOk: !!prev.everOk || right, choice, tries: (Number(prev.tries) || 0) + 1, at: now() };
      });
      return res.status(200).json({ ok: true, right, case: c, progress });
    }

    if (b.action === 'task') {
      const mine = P.of(await P.all(), me);
      const role = mine.path && mine.path.role;
      const item = role && (ac.paths[role] || []).flatMap((d) => d.items).find((x) => x.id === b.id && x.kind === 'task');
      if (!item) return fail(400, 'invalid_ref');
      if (mine.tasks[item.id] && mine.tasks[item.id].confirmed) return fail(409, 'already_confirmed');
      b.title = item.text;
      const progress = await P.update(me, (p) => {
        if (b.done) p.tasks[item.id] = { done: now(), confirmed: '', by: '' };
        else delete p.tasks[item.id];
      });
      if (b.done) {
        const employees = await readJSON('data/employees.json', []);
        const who = (employees.find((e) => e.id === me) || {}).name || 'Cineva';
        await notifyMany({ readJSON, writeJSON }, admins(employees), { kind: 'alert', tone: 'info', title: 'DE CONFIRMAT ✅ - ' + who, text: item.text, go: 'traininguri', tag: 'task-' + me + '-' + item.id });
      }
      return res.status(200).json({ ok: true, progress });
    }

    if (!isAdmin) return fail(403, 'forbidden');

    if (b.action === 'confirm') {
      const employees = await readJSON('data/employees.json', []);
      const emp = employees.find((e) => e.id === b.emp);
      if (!emp) return fail(404, 'employee_not_found');
      const cur = P.of(await P.all(), emp.id);
      const role = cur.path && cur.path.role;
      const item = role && (ac.paths[role] || []).flatMap((d) => d.items).find((x) => x.id === b.id && x.kind === 'task');
      if (!item || !cur.tasks[item.id]) return fail(404, 'not_found');
      b.title = item.text + ' · ' + emp.name;
      const progress = await P.update(emp.id, (p) => {
        if (b.ok) p.tasks[item.id] = Object.assign({}, p.tasks[item.id], { confirmed: now(), by: me });
        else delete p.tasks[item.id];
      });
      await notify({ readJSON, writeJSON }, emp.id, b.ok
        ? { kind: 'info', tone: 'good', title: 'SARCINĂ ✅ - confirmată', text: item.text, go: 'traininguri' }
        : { kind: 'info', tone: 'bad', title: 'SARCINĂ 🔁 - de refăcut', text: item.text, go: 'traininguri' });
      return res.status(200).json({ ok: true, progress });
    }

    if (b.action === 'path') {
      const employees = await readJSON('data/employees.json', []);
      const emp = employees.find((e) => e.id === b.emp);
      if (!emp) return fail(404, 'employee_not_found');
      const role = ['receptie', 'cosmetician'].includes(b.role) ? b.role : '';
      const start = /^\d{4}-\d{2}-\d{2}$/.test(b.start || '') ? b.start : P.todayRo();
      b.title = emp.name;
      const progress = await P.update(emp.id, (p) => { p.path = role ? { role, start } : null; });
      return res.status(200).json({ ok: true, progress });
    }

    if (b.action === 'media_image') {
      const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dataUrl || ''));
      if (!m) return fail(400, 'invalid_image');
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 3.5 * 1024 * 1024) return fail(413, 'too_large');
      const path = 'academy/' + crypto.randomUUID().replace(/-/g, '') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
      await writeBinary(path, buf, 'image/' + m[1]);
      return res.status(200).json({ ok: true, path });
    }

    return fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-academy error:', err.message);
    return fail(500, 'save_failed');
  }
};
