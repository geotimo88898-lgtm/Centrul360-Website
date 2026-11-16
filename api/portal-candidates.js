// /api/portal-candidates, the candidates who applied through a job ad's form (api/_lib/fb-leads.js keeps them in
// data/candidates.json, apart from the clients): Pipeline → Angajări, the one place of the hiring (16.11).
//   GET                              the list, newest first, each with what she did on WhatsApp (replied, sent a file)
//   POST { id, status }              nou | cv | sunat | interviu | recomandat | angajat | respins
//   POST { id, note }                a note on the candidate (who wrote it and when)
// A candidate still at "nou" who sent a file or a photo on WhatsApp shows at "CV primit" by herself.
//
// The owner and the manager (15.11: „la Pipeline să aibă și astea de angajare acum și ea”). The manager sees the
// candidates of the clinics she runs (and those whose form says no city), calls them, writes to them, moves them up to
// „Recomandat” (the owner hears it) or „Respins”, and writes notes. The hire is the owner's: only an admin sets
// „Angajat” or moves someone who is already hired. No stage does anything by itself: no account, no contract, no
// salary (Echipa → „Angajat nou” stays the owner's). The pay is only what the job ad said, never stored here.

const { readJSON, writeJSON } = require('./_lib/store');
const { normalizePhone } = require('./_lib/clients');
const R = require('./_lib/roles');

const KEY = 'data/candidates.json';
const STATUSES = ['nou', 'cv', 'sunat', 'interviu', 'recomandat', 'angajat', 'respins'];
const OWNER_ONLY = ['angajat']; // the hire: the owner's decision

async function withChat(list) {
  const convos = await readJSON('data/whatsapp-conversations.json', []);
  const byPhone = new Map(convos.map((c) => [c.phone, c]));
  return list.map((c) => {
    const convo = byPhone.get(normalizePhone(c.phone) || String(c.phone));
    const inn = ((convo && convo.messages) || []).filter((m) => m.direction === 'in');
    // her CV: the last file or photo she sent (opened in the portal's preview, from the Pipeline card)
    const f = inn.filter((m) => m.media && m.media.path && /document|image/.test(m.media.kind || '')).pop();
    const cv = f ? { url: '/api/portal-file?p=' + encodeURIComponent(f.media.path) + (f.media.filename ? '&n=' + encodeURIComponent(f.media.filename) : ''), name: f.media.filename || 'CV',
      kind: /pdf/i.test(f.media.mime || '') || /\.pdf$/i.test(f.media.filename || '') ? 'pdf' : f.media.kind === 'image' || /^image\//i.test(f.media.mime || '') ? 'img' : 'other' } : null;
    return Object.assign({}, c, { replied: inn.length > 0, cvFile: !!f, cv, status: c.status || (f ? 'cv' : 'nou') });
  });
}

// what the manager gets of a candidate: who she is, what she answered, where she is in the hiring, the notes. Not the
// ad / form ids, not the welcome message's internals.
const forManager = (c) => ({ id: c.id, at: c.at, name: c.name, phone: c.phone, email: c.email || '', location: c.location || '', job: c.job || '', answers: c.answers || [],
  status: c.status, statusAt: c.statusAt || '', statusBy: c.statusBy || '', notes: c.notes || [], replied: c.replied, cvFile: c.cvFile, cv: c.cv, employeeId: c.employeeId || '' });

module.exports = async (req, res) => {
  const session = await R.requireManage(req, res); // the owner and the manager
  if (!session) return;
  res.setHeader('Cache-Control', 'no-store');
  const employees = await readJSON('data/employees.json', []);
  const me = employees.find((e) => e.id === session.employeeId);
  const mgr = R.isManager(session);
  // the manager: her clinics' candidates, and the ones whose form says no city (a job ad always says one)
  const sees = (c) => !mgr || !c.location || R.managesOf(me).includes(c.location);
  const answer = async (list) => {
    const out = await withChat(list.filter((c) => !c.test && sees(c)));
    res.status(200).json({ candidates: mgr ? out.map(forManager) : out, canHire: !mgr });
  };
  const list = await readJSON(KEY, []);
  if (req.method === 'GET') return answer(list);
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const b = req.body || {};
  const c = list.find((x) => x.id === String(b.id || ''));
  if (!c || c.test || !sees(c)) { res.status(404).json({ error: 'not_found' }); return; }
  const by = (me && me.name) || (session.employeeId === 'admin' ? 'Admin' : '');

  if (typeof b.note === 'string') {
    const text = b.note.trim().slice(0, 1000);
    if (!text) { res.status(400).json({ error: 'empty_note' }); return; }
    c.notes = (c.notes || []).concat({ at: new Date().toISOString(), by, byId: session.employeeId, text }).slice(-50);
    await writeJSON(KEY, list);
    return answer(list);
  }

  if (!STATUSES.includes(b.status)) { res.status(400).json({ error: 'invalid' }); return; }
  const was = c.status || 'nou';
  // the hire is the owner's: the manager neither sets „Angajat” nor moves someone already hired
  if (mgr && (OWNER_ONLY.includes(b.status) || OWNER_ONLY.includes(was))) { res.status(403).json({ error: 'owner_only' }); return; }
  if (was === b.status) return answer(list);
  c.status = b.status;
  c.statusAt = new Date().toISOString();
  c.statusBy = by;
  await writeJSON(KEY, list);
  // the manager recommends someone after the interview: the owner decides, so the owner hears it
  if (mgr && b.status === 'recomandat') {
    const N = require('./_lib/notify');
    const last = (c.notes || []).slice(-1)[0];
    await N.notifyMany({ readJSON, writeJSON }, await N.adminIds({ readJSON }), { kind: 'alert', tone: 'good', go: 'pipeline/angajari', tag: 'cand-rec-' + c.id,
      title: 'CANDIDAT RECOMANDAT 💼' + N.cityTag(c.location) + ' - ' + (c.name || 'fără nume'), text: [by ? 'De la ' + by : '', last ? last.text : ''].filter(Boolean).join(' · ') }).catch((e) => console.error('candidates notify:', e.message));
  }
  return answer(list);
};

