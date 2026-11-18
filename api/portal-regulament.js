// POST /api/portal-regulament, „Regulament intern” (the owner, 17.11: the clinic's internal regulation, in force from
// 18.11). The text lives as a PDF the owner or the manager uploads (never in the repo); every version is kept with its
// date. Each person of the team confirms once per version that she read it („Am citit regulamentul”, the legal
// acknowledgement); the owner and the manager see who confirmed which version and when, and who has not yet.
//   { action: 'get' }                     → { current, versions, me: { must, at }, people? (the owner, the manager) }
//   { action: 'upload', name, dataUrl }   the owner, the manager: a new version (PDF, at most 20 MB)
//   { action: 'ack' }                     her confirmation of the current version (once; again only for a new one)
// Data: data/regulament.json { versions: [{ id, n, name, path, size, at, by }], acks: { <versionId>: { <employeeId>: at } } };
// the PDFs as private blobs regulament/<uuid>.pdf, served to anyone signed in by api/portal-file.js.

const crypto = require('crypto');
const { readJSON, writeJSON, writeBinary } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const R = require('./_lib/roles');

const KEY = 'data/regulament.json';
const MAX_BYTES = 20 * 1024 * 1024;
// who confirms: the team (the owners' own logins never)
const SIGNS = ['receptie', 'cosmetician', 'manager'];
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const nowISO = () => new Date().toISOString();
const fileUrl = (v) => '/api/portal-file?p=' + encodeURIComponent(v.path);

async function load() {
  const d = await readJSON(KEY, null);
  return { versions: Array.isArray(d && d.versions) ? d.versions : [], acks: (d && d.acks && typeof d.acks === 'object') ? d.acks : {} };
}
const current = (doc) => doc.versions[doc.versions.length - 1] || null;
// has she confirmed the version in force (none uploaded: nothing to confirm)
function pending(doc, employeeId, role) {
  const cur = current(doc);
  if (!cur || !SIGNS.includes(role)) return false;
  return !((doc.acks[cur.id] || {})[employeeId]);
}

// a new version (the owner from the portal, or Claude for the owner through api/lead-health ?regulament): the PDF stored
// privately, the version listed, the team told once
async function upload(session, b) {
  const m = /^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/.exec(String((b && b.dataUrl) || ''));
  if (!m) return { error: 'invalid_file', message: 'Se poate încărca doar un PDF.' };
  const buf = Buffer.from(m[1], 'base64');
  if (!buf.length || buf.length > MAX_BYTES) return { error: 'file_too_big', message: 'Fișierul trece de 20 MB.' };
  if (buf.slice(0, 5).toString('latin1') !== '%PDF-') return { error: 'invalid_file', message: 'Se poate încărca doar un PDF.' };
  const path = 'regulament/' + crypto.randomUUID() + '.pdf';
  await writeBinary(path, buf, 'application/pdf');
  const by = await require('./_lib/activity').whoName(session.employeeId);
  const fresh = await load();
  const n = fresh.versions.reduce((x, v) => Math.max(x, v.n || 0), 0) + 1;
  fresh.versions.push({ id: crypto.randomUUID(), n, name: clip(b.name, 120) || 'Regulament intern', path, size: buf.length, at: nowISO(), by, byId: session.employeeId });
  await writeJSON(KEY, fresh);
  // the team hears it once (the bell and the phone): a new text to read and confirm
  try {
    const N = require('./_lib/notify');
    const ids = (await readJSON('data/employees.json', [])).filter((e) => e && e.active !== false && SIGNS.includes(e.role) && e.id !== session.employeeId).map((e) => e.id);
    if (ids.length) await N.notifyMany({ readJSON, writeJSON }, ids, { kind: 'info', tone: 'info', go: 'regulament', tag: 'regulament-' + n,
      title: n === 1 ? 'REGULAMENT INTERN 📄' : 'REGULAMENT INTERN, VERSIUNE NOUĂ 📄', text: 'Citește-l în portal și confirmă la final.' });
  } catch (err) { console.error('regulament notify:', err.message); }
  return { ok: true, n, size: buf.length };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = await requireAuth(req, res);
  if (!session) return;
  const b = req.body || {};
  const fail = (code, error, message) => res.status(code).json(message ? { error, message } : { error });
  try {
    const doc = await load();
    const boss = R.canManage(session);
    const answer = async () => {
      const cur = current(doc);
      const view = (v) => ({ id: v.id, n: v.n, name: v.name, at: v.at, size: v.size, url: fileUrl(v), confirmed: Object.keys(doc.acks[v.id] || {}).length });
      const mine = cur ? (doc.acks[cur.id] || {})[session.employeeId] || '' : '';
      const out = { ok: true, current: cur ? view(cur) : null, versions: boss ? doc.versions.slice().reverse().map(view) : [],
        me: { must: !!cur && SIGNS.includes(session.role) && !mine, at: mine } };
      if (boss) {
        // the people who confirm: the owner sees everyone; the manager her clinics' people and herself
        let emps = (await readJSON('data/employees.json', [])).filter((e) => e && e.id && e.id !== 'admin' && e.active !== false && SIGNS.includes(e.role));
        const team = await R.teamOf(session, null, emps);
        if (team) emps = emps.filter((e) => e.id === session.employeeId || team.has(e.id));
        out.people = emps.map((e) => {
          // the newest version she confirmed (an older one: she still has to read the new text)
          const last = doc.versions.slice().reverse().find((v) => (doc.acks[v.id] || {})[e.id]);
          return { id: e.id, name: e.name || '', role: e.role, location: e.location || '', at: cur ? (doc.acks[cur.id] || {})[e.id] || '' : '',
            last: last ? { n: last.n, at: doc.acks[last.id][e.id] } : null };
        }).sort((x, y) => (x.at ? 1 : 0) - (y.at ? 1 : 0) || x.location.localeCompare(y.location) || x.name.localeCompare(y.name));
      }
      res.status(200).json(out);
    };
    if (b.action === 'get' || !b.action) return answer();

    if (b.action === 'ack') {
      const cur = current(doc);
      if (!cur) return fail(400, 'no_version');
      if (!SIGNS.includes(session.role)) return fail(400, 'not_needed');
      // two taps at once, or two devices: the first one stays
      const fresh = await load();
      const v = fresh.versions.find((x) => x.id === cur.id);
      if (!v) return fail(409, 'version_changed');
      fresh.acks[v.id] = fresh.acks[v.id] || {};
      if (!fresh.acks[v.id][session.employeeId]) { fresh.acks[v.id][session.employeeId] = nowISO(); await writeJSON(KEY, fresh); }
      Object.assign(doc, fresh);
      return answer();
    }

    if (b.action === 'upload') {
      if (!boss) return fail(403, 'forbidden');
      const r = await upload(session, b);
      if (r.error) return fail(400, r.error, r.message);
      Object.assign(doc, await load());
      return answer();
    }
    return fail(400, 'invalid_action');
  } catch (err) {
    console.error('portal-regulament:', err.message);
    return fail(500, 'server_error');
  }
};
module.exports.pending = pending;
module.exports.load = load;
module.exports.KEY = KEY;
module.exports.upload = upload;
