// POST /api/portal-incasari — admin-only correction/deletion of "Încasează client" (source:
// 'incasare') cash-record entries in data/sales.json. The owner explicitly wants mistakes
// (wrong amount, wrong treatment text, etc.) fixable only by her, not by whoever recorded the
// entry — this endpoint never touches source:'comision' entries, which have their own
// create/approve flow (portal-sale.js / portal-approve.js).

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const portalSale = require('./portal-sale');

const VALID_CATEGORIES = portalSale.VALID_CATEGORIES;
const VALID_METHODS = ['card', 'cash', 'transfer'];

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  const { action, id } = req.body || {};
  if (!id) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }

  try {
    const sales = await readJSON('data/sales.json', []);
    const entry = sales.find((s) => s.id === id && s.source === 'incasare');
    if (!entry) {
      res.status(404).json({ error: 'entry_not_found' });
      return;
    }

    if (action === 'delete') {
      const next = sales.filter((s) => s.id !== id);
      await writeJSON('data/sales.json', next);
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'update') {
      const { date, client, category, treatment, amount, method, performedBy } = req.body || {};
      if (!date || !client || !category || !treatment || amount === undefined || !method) {
        res.status(400).json({ error: 'missing_fields' });
        return;
      }
      if (!isValidDate(date)) {
        res.status(400).json({ error: 'invalid_date' });
        return;
      }
      if (!VALID_CATEGORIES.includes(category)) {
        res.status(400).json({ error: 'invalid_category' });
        return;
      }
      if (!VALID_METHODS.includes(method)) {
        res.status(400).json({ error: 'invalid_method' });
        return;
      }
      const numAmount = Number(amount);
      if (!Number.isFinite(numAmount) || numAmount <= 0) {
        res.status(400).json({ error: 'invalid_amount' });
        return;
      }

      entry.date = date;
      entry.client = String(client).slice(0, 150);
      entry.category = category;
      entry.treatment = String(treatment).slice(0, 200);
      entry.amount = numAmount;
      entry.method = method;
      entry.performedBy = performedBy ? String(performedBy).slice(0, 100) : '';

      await writeJSON('data/sales.json', sales);
      res.status(200).json({ ok: true, entry });
      return;
    }

    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    console.error('portal-incasari error:', err.message);
    res.status(500).json({ error: 'incasari_failed' });
  }
};
