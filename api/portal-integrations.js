// /api/portal-integrations, what's connected, for the Integrări section (admin).
// Facebook has its own status endpoint (fb-connection-status); this covers the rest.
//   GET                                          WhatsApp / storage status + the Facebook lead forms seen so far
//   POST { action: 'fb_form', id, offerId, location }   which procedure / city a form's leads are
//        (empty = read it from the form and ad names, see webhook-facebook-leads.js)

const { requireAdmin } = require('./_lib/auth');
const { readJSON, writeJSON } = require('./_lib/store');
const { whatsappConfigured } = require('./_lib/whatsapp');
const { loadOffers } = require('./_lib/offers');

const FORMS_KEY = 'data/fb-forms.json';
const LOCATIONS = ['Timișoara', 'Arad'];

async function payload() {
  const [doc, offers] = await Promise.all([readJSON(FORMS_KEY, {}), loadOffers(readJSON, writeJSON)]);
  const forms = Object.entries(doc.forms || {}).map(([id, f]) => ({
    id, name: f.name || '', offerId: f.offerId || '', location: f.location || '', leads: f.leads || 0, lastAt: f.lastAt || '',
    detected: f.detected || null,
  })).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  return {
    ok: true,
    whatsapp: !!whatsappConfigured(),
    blob: !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID),
    fbForms: forms,
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
    if (body.action === 'fb_form') {
      const doc = await readJSON(FORMS_KEY, {});
      const f = doc.forms && doc.forms[String(body.id || '')];
      if (!f) { res.status(404).json({ error: 'form_not_found' }); return; }
      const offers = await loadOffers(readJSON, writeJSON);
      f.offerId = offers.some((o) => o.id === body.offerId) ? body.offerId : '';
      f.location = LOCATIONS.includes(body.location) ? body.location : '';
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
