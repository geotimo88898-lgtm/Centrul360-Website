// POST /api/portal-legal, Admin → „Acte și autorizații” (the owner, 8.11: „un loc unde să am toate autorizațiile
// salonului, Timișoara / Arad, și la echipă toate documentele legale ale fiecărui angajat; să ne organizăm maxim
// și pe partea legală”). The owner and the manager (15.11).
//
// What a salon or an employee needs is in api/_lib/legal-reqs.js (each item: who issues it, the law, the papers it
// takes, how often it is renewed). Here, per salon and per employee, what we have for each item: its status, number,
// dates, notes and the files (scans, PDFs, photos). Data: data/legal.json; the files as private blobs under
// legal/<scope>/… (served only to an admin by api/portal-file.js).
//   { action: 'get' } → { reqs, data, employees, cities }
//   { action: 'save', scope, item, patch: { status, number, issued, expires, notes } }
//   { action: 'file_add', scope, item, name, dataUrl }  ·  { action: 'file_delete', scope, item, fileId }
//   { action: 'custom_add', scope, title }  ·  { action: 'custom_delete', scope, item }
// scope: 'salon:Timișoara' | 'salon:Arad' | 'emp:<employeeId>'

const crypto = require('crypto');
const { readJSON, writeJSON, writeBinary, removeBinary } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const R = require('./_lib/legal-reqs');

const KEY = 'data/legal.json';
const CITIES = ['Timișoara', 'Arad'];
const STATUS = ['verif', 'lipsa', 'lucru', 'depus', 'ok', 'na'];
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
  'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx' };
const MAX_BYTES = 20 * 1024 * 1024;
// the papers of a colleague that say her pay (the contract, REGES, the additional acts): the owner's. The manager sees only
// whether they are in order and when they expire, never the number, the notes or the files, and can't change them
// (15.11: „ai mare grijă la ce informații îi dai acces”). Her own she sees whole.
const PAY_PAPERS = ['cim', 'reges', 'acte-ad'];
const hidesPay = (session, scope, item) => session.role === 'manager' && scope.startsWith('emp:') && scope !== 'emp:' + session.employeeId && PAY_PAPERS.includes(item);
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const nowISO = () => new Date().toISOString();

// what the owner told us at the start (8.11): Timișoara has no DSP authorization yet
const START = { scopes: { 'salon:Timișoara': { items: { dsp: { status: 'lipsa' } }, custom: [] } } };

async function load() {
  const d = await readJSON(KEY, null);
  return d && d.scopes ? d : JSON.parse(JSON.stringify(START));
}
function scopeOk(scope, employees) {
  const m = /^salon:(.+)$/.exec(scope);
  if (m) return CITIES.includes(m[1]);
  const e = /^emp:([\w-]+)$/.exec(scope);
  return !!(e && employees.some((x) => x.id === e[1]));
}
function itemOk(scope, item, box) {
  const list = scope.startsWith('salon:') ? R.SALON : R.EMPLOYEE;
  return list.some((r) => r.id === item) || (box.custom || []).some((c) => c.id === item);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = await require('./_lib/roles').requireManage(req, res); // the owner and the manager
  if (!session) return;
  const b = req.body || {};
  const fail = (code, error, message) => res.status(code).json(message ? { error, message } : { error });
  try {
    let employees = (await readJSON('data/employees.json', [])).filter((e) => e && e.id && e.id !== 'admin');
    // the manager: the clinics she runs and their people (and her own papers); never the owners'
    let cities = CITIES;
    if (session.role === 'manager') {
      const R = require('./_lib/roles');
      const team = await R.teamOf(session, null, employees);
      cities = CITIES.filter((c) => R.managesOf(employees.find((e) => e.id === session.employeeId)).includes(c));
      employees = employees.filter((e) => e.id === session.employeeId || team.has(e.id));
    }
    const people = employees.map((e) => ({ id: e.id, name: e.name || '', role: e.role || '', location: e.location || '', active: e.active !== false, photo: e.photo || '' }));
    const data = await load();
    // the manager: only the scopes she may see, in the answer (the saved document always keeps everyone's)
    const keep = session.role === 'manager' ? new Set(cities.map((c) => 'salon:' + c).concat(employees.map((e) => 'emp:' + e.id))) : null;
    const strip = (k, box) => (!keep || !k.startsWith('emp:') || k === 'emp:' + session.employeeId ? box
      : Object.assign({}, box, { items: Object.fromEntries(Object.entries(box.items || {}).map(([id, it]) => [id, PAY_PAPERS.includes(id) ? { status: it.status, expires: it.expires || '', hidden: true } : it])) }));
    const view = () => (keep ? Object.assign({}, data, { scopes: Object.fromEntries(Object.entries(data.scopes || {}).filter(([k]) => keep.has(k)).map(([k, box]) => [k, strip(k, box)])) }) : data);
    const answer = () => res.status(200).json({ ok: true, data: view(), reqs: { salon: R.SALON, employee: R.EMPLOYEE, groups: R.GROUPS }, employees: people, cities, ownerOnly: session.role === 'manager' ? PAY_PAPERS : [] });
    if (b.action === 'get') return answer();

    const scope = String(b.scope || '');
    if (!scopeOk(scope, employees) || (scope.startsWith('salon:') && !cities.includes(scope.slice(6)))) return fail(400, 'invalid_scope');
    const box = data.scopes[scope] = data.scopes[scope] || { items: {}, custom: [] };
    box.items = box.items || {}; box.custom = box.custom || [];
    // who did it, by her real name (the owner's from his profile), never a role (16.11)
    const author = await require('./_lib/activity').whoName(session.employeeId);
    const save = async () => { await writeJSON(KEY, data); return answer(); };

    if (b.action === 'custom_add') {
      const title = clip(b.title, 120);
      if (!title) return fail(400, 'invalid_title');
      const id = 'c-' + crypto.randomUUID().slice(0, 8);
      box.custom.push({ id, title, at: nowISO() });
      box.items[id] = { status: 'verif' };
      return save();
    }
    const item = String(b.item || '');
    if (!itemOk(scope, item, box)) return fail(400, 'invalid_item');
    if (hidesPay(session, scope, item)) return fail(403, 'owner_only', 'Contractul și actele cu salariul le ține George.');
    const it = box.items[item] = box.items[item] || {};
    it.files = it.files || [];

    if (b.action === 'save') {
      const p = b.patch || {};
      if (p.status !== undefined) { if (!STATUS.includes(p.status)) return fail(400, 'invalid_status'); it.status = p.status; }
      if (p.number !== undefined) it.number = clip(p.number, 80);
      if (p.issued !== undefined) it.issued = day(p.issued);
      if (p.expires !== undefined) it.expires = day(p.expires);
      if (p.notes !== undefined) it.notes = clip(p.notes, 2000);
      it.updatedAt = nowISO(); it.updatedBy = author;
      return save();
    }
    if (b.action === 'file_add') {
      const m = /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.dataUrl || ''));
      if (!m || !MIME_EXT[m[1]]) return fail(400, 'invalid_file', 'Se pot încărca poze, PDF, Word și Excel.');
      const buf = Buffer.from(m[2], 'base64');
      if (!buf.length || buf.length > MAX_BYTES) return fail(400, 'file_too_big', 'Fișierul trece de 20 MB.');
      const dir = scope.startsWith('salon:') ? (scope === 'salon:Arad' ? 'ar' : 'tm') : 'e-' + scope.slice(4);
      const path = 'legal/' + dir + '/' + crypto.randomUUID() + '.' + MIME_EXT[m[1]];
      await writeBinary(path, buf, m[1]);
      it.files.unshift({ id: crypto.randomUUID(), name: clip(b.name, 120) || 'Document', path, mime: m[1], size: buf.length, at: nowISO(), by: author });
      // a paper in hand: an item still "to check" moves to "in progress"
      if (!it.status || it.status === 'verif' || it.status === 'lipsa') it.status = 'lucru';
      it.updatedAt = nowISO(); it.updatedBy = author;
      return save();
    }
    if (b.action === 'file_delete') {
      const f = it.files.find((x) => x.id === b.fileId);
      if (!f) return fail(404, 'not_found');
      it.files = it.files.filter((x) => x.id !== f.id);
      await removeBinary(f.path);
      return save();
    }
    if (b.action === 'custom_delete') {
      if (!box.custom.some((c) => c.id === item)) return fail(400, 'not_custom');
      for (const f of it.files) await removeBinary(f.path);
      box.custom = box.custom.filter((c) => c.id !== item);
      delete box.items[item];
      return save();
    }
    return fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-legal:', err.message);
    return fail(500, 'server_error');
  }
};
