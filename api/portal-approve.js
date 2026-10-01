// POST /api/portal-approve — admin approves or rejects a pending sale entry.
// Approving computes the commission from config.commissionRates / retailRate at the
// moment of approval (so a later rate change doesn't retroactively change past commissions).

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { defaultConfig } = require('./_lib/defaults');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  const { saleId, decision } = req.body || {};
  if (!saleId || !['approve', 'reject'].includes(decision)) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }

  try {
    const [sales, configRaw] = await Promise.all([
      readJSON('data/sales.json', []),
      readJSON('data/config.json', null),
    ]);
    const config = configRaw || defaultConfig();

    const sale = sales.find((s) => s.id === saleId);
    if (!sale) {
      res.status(404).json({ error: 'sale_not_found' });
      return;
    }
    if (sale.status !== 'pending') {
      res.status(409).json({ error: 'already_decided' });
      return;
    }

    if (decision === 'approve') {
      const rate = sale.category === 'retail'
        ? config.retailRate
        : (config.commissionRates[sale.category] ?? 0);
      sale.commission = Math.round(sale.amount * (rate / 100) * 100) / 100;
      sale.status = 'approved';
    } else {
      sale.status = 'rejected';
      sale.commission = 0;
    }
    sale.decidedAt = new Date().toISOString();

    await writeJSON('data/sales.json', sales);

    res.status(200).json({ ok: true, sale });
  } catch (err) {
    console.error('portal-approve error:', err.message);
    res.status(500).json({ error: 'approve_failed' });
  }
};
