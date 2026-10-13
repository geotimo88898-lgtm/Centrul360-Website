// /api/portal-integrations, what's connected, for Integrări and Formulare (admin).
// Facebook has its own status endpoint (fb-connection-status); this covers the rest.
//   GET                                          WhatsApp / storage status + every Facebook lead form of the
//                                                Page (from the minute's look, _lib/fb-leads.js) with what the
//                                                portal knows about it: leads, procedure, city, questions
//   POST { action: 'fb_form', id, offerId, location }   which procedure / city a form's leads are
//        (empty = read it from the form and ad names, see _lib/fb-leads.js)
//   POST { action: 'fb_form_info', id }          the form's questions, asked from Facebook now

const { requireAdmin } = require('./_lib/auth');
const { readJSON, writeJSON } = require('./_lib/store');
const { whatsappConfigured } = require('./_lib/whatsapp');
const { loadOffers } = require('./_lib/offers');
const { loadConnection, fetchFormInfo } = require('./_lib/facebook');

const FORMS_KEY = 'data/fb-forms.json';
const LOCATIONS = ['Timișoara', 'Arad'];

async function payload() {
  const [doc, offers, poll, leads] = await Promise.all([
    readJSON(FORMS_KEY, {}), loadOffers(readJSON, writeJSON), readJSON('data/fb-poll.json', {}), readJSON('data/leads.json', []),
  ]);
  const reg = doc.forms || {};
  // leads in the Pipeline per form (from the form saved on each lead)
  const inPortal = {};
  (leads || []).forEach((l) => (l.forms || []).forEach((f) => { if (f.id) inPortal[f.id] = (inPortal[f.id] || 0) + 1; }));
  const fb = new Map((poll.forms || []).map((f) => [f.id, f]));
  const ids = new Set([...fb.keys(), ...Object.keys(reg)]);
  const forms = [...ids].map((id) => {
    const f = fb.get(id) || {}, r = reg[id] || {};
    return {
      id, name: f.name || r.name || '', status: f.status || '', fbLeads: f.count || 0, created: f.created || '',
      lastAt: f.lastAt ? new Date(f.lastAt * 1000).toISOString() : r.lastAt || '',
      leads: inPortal[id] || 0, offerId: r.offerId || '', location: r.location || '', detected: r.detected || null,
      questions: Array.isArray(r.questions) ? r.questions.map((q) => ({ label: q.label || q.key, type: q.type || '', options: (q.options || []).map((o) => o.value) })) : null,
    };
  }).sort((a, b) => (b.lastAt || b.created || '').localeCompare(a.lastAt || a.created || ''));
  return {
    ok: true,
    whatsapp: !!whatsappConfigured(),
    blob: !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
    fbForms: forms,
    formsAt: poll.formsAt || '',
    offers: offers.filter((o) => o.active !== false).map((o) => ({ id: o.id, title: o.title, locations: o.locations || [] })),
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
    const id = String(body.id || '');
    if (!/^\d{5,25}$/.test(id)) { res.status(400).json({ error: 'form_not_found' }); return; }

    if (body.action === 'fb_form') {
      const doc = await readJSON(FORMS_KEY, {});
      doc.forms = doc.forms || {};
      const f = doc.forms[id] = doc.forms[id] || { name: '', offerId: '', location: '', leads: 0 };
      const offers = await loadOffers(readJSON, writeJSON);
      f.offerId = offers.some((o) => o.id === body.offerId) ? body.offerId : '';
      f.location = LOCATIONS.includes(body.location) ? body.location : '';
      await writeJSON(FORMS_KEY, doc);
      res.status(200).json(await payload());
      return;
    }
    if (body.action === 'fb_form_info') {
      const conn = await loadConnection(readJSON);
      if (!conn.pageAccessToken) { res.status(400).json({ error: 'not_connected' }); return; }
      const info = await fetchFormInfo(id, conn.pageAccessToken);
      const doc = await readJSON(FORMS_KEY, {});
      doc.forms = doc.forms || {};
      const f = doc.forms[id] = doc.forms[id] || { name: '', offerId: '', location: '', leads: 0 };
      if (info.name) f.name = info.name;
      f.questions = info.questions;
      await writeJSON(FORMS_KEY, doc);
      res.status(200).json(await payload());
      return;
    }
    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    console.error('portal-integrations error:', err.message);
    res.status(500).json({ error: 'integrations_failed' });
  }
};
