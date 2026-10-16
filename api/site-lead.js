// POST /api/site-lead: the sign-up forms of the site (the home page quiz, the treatment pages, "Consultație
// gratuită") send their lead here too, with the city the person picked. It goes into the Pipeline as source "Site":
// the owner and reception are told at once (LEAD NOU 🔥), and the WhatsApp template meant for site leads goes from
// that city's number (_lib/workflows.js welcome, "Lead de pe site" in Automatizări → Mesaje).
// Public, so: our own pages only (Origin), a hidden trap field, the consent box, a few tries per address.

const { createLead } = require('./portal-leads');

const CITIES = { timisoara: 'Timișoara', arad: 'Arad' };
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const tries = new Map(); // ip → [times] (per warm instance)

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const origin = String(req.headers.origin || '');
  if (origin && !/^https:\/\/([\w-]+\.)?centrul360\.com$/.test(origin) && !/^http:\/\/localhost(:\d+)?$/.test(origin)) { res.status(403).json({ error: 'forbidden' }); return; }
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  const now = Date.now();
  const mine = (tries.get(ip) || []).filter((t) => now - t < 10 * 60e3);
  if (mine.length >= 5) { res.status(429).json({ error: 'too_many' }); return; }
  tries.set(ip, mine.concat(now));

  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  if (b.website || b.hp) { res.status(200).json({ ok: true }); return; } // the trap: a bot filled the hidden field
  const name = clip(b.nume || b.name, 100);
  const phone = clip(b.telefon || b.phone, 30);
  const city = CITIES[fold(b.oras || b.city).replace(/[^a-z]/g, '')] || '';
  if (!name || String(phone).replace(/\D/g, '').length < 9) { res.status(400).json({ error: 'missing_fields' }); return; }
  if (!city) { res.status(400).json({ error: 'missing_city' }); return; }
  if (!(b.consimtamant_whatsapp === true || b.consimtamant_whatsapp === 'true' || b.consimtamant_whatsapp === 'on')) { res.status(400).json({ error: 'missing_consent' }); return; }

  const interest = clip(b.interes_principal, 120);
  const note = ['Formular site', clip(b.sursa, 160), b.zona ? 'zona: ' + clip(b.zona, 80) : '', clip(b.pagina, 200)].filter(Boolean).join(' · ');
  try {
    const r = await createLead({ name, phone, email: clip(b.email, 120), source: 'site', location: city, createdBy: 'site-form', interest, note, authorLabel: 'Site' });
    if (r.error) { res.status(400).json({ error: r.error }); return; }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('site-lead error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
