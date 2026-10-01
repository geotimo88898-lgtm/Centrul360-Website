// POST /api/portal-sale — an employee logs a sale from the "Vânzările mele" tab.
// Always created as status: 'pending' — only an admin approval (api/portal-approve.js)
// computes commission and makes it count toward the company goal / race bonus.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');

const VALID_CATEGORIES = [
  'epilare-laser',
  'hifu',
  'liposonix',
  'ems-tonifiere',
  'radiofrecventa',
  'microneedling',
  'tratament-facial',
  'celulita',
  'detox-drenaj',
  'retail',
  'altele',
];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;

  const { date, category, treatment, amount, note } = req.body || {};

  if (!date || !category || !treatment || amount === undefined) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }
  if (!VALID_CATEGORIES.includes(category)) {
    res.status(400).json({ error: 'invalid_category' });
    return;
  }
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    res.status(400).json({ error: 'invalid_amount' });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'invalid_date' });
    return;
  }

  try {
    const sales = await readJSON('data/sales.json', []);

    const entry = {
      id: crypto.randomUUID(),
      employeeId: session.employeeId,
      date,
      category,
      treatment: String(treatment).slice(0, 200),
      amount: numAmount,
      note: note ? String(note).slice(0, 500) : '',
      status: 'pending',
      commission: 0,
      createdAt: new Date().toISOString(),
      decidedAt: null,
    };

    sales.push(entry);
    await writeJSON('data/sales.json', sales);

    res.status(200).json({ ok: true, entry });
  } catch (err) {
    console.error('portal-sale error:', err.message);
    res.status(500).json({ error: 'sale_failed' });
  }
};
