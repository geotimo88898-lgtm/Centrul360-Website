// POST /api/portal-approve, admin approves or rejects a pending sale entry.
// Approving fixes the commission: upsell - 60% costs, then 10% of the profit (_lib/cats.js).

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { commissionOf } = require('./_lib/cats');
const { notify } = require('./_lib/notify');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  const { saleId, decision, reason } = req.body || {};
  if (!saleId || !['approve', 'reject'].includes(decision)) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }

  try {
    const sales = await readJSON('data/sales.json', []);

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
      // One rule for everyone: upsell - 60% costs, 10% of the profit (see _lib/cats.js).
      sale.commission = commissionOf(sale.amount);
      sale.status = 'approved';
    } else {
      sale.status = 'rejected';
      sale.commission = 0;
    }
    sale.decidedAt = new Date().toISOString();
    // Optional note shown to the employee in "Comisionul meu" (mostly: why it was rejected).
    sale.decisionNote = reason ? String(reason).trim().slice(0, 200) : '';

    await writeJSON('data/sales.json', sales);
    await notify({ readJSON, writeJSON }, sale.employeeId, sale.status === 'approved'
      ? { kind: 'commission', tone: 'good', title: 'Comision aprobat: +' + sale.commission + ' lei', text: String(sale.treatment || 'Upsell').replace(/^Upsell · /, 'Upsell, ') + (sale.client ? ', ' + sale.client : '') + '.', go: 'comision' }
      : { kind: 'commission', tone: 'bad', title: 'Comision respins', text: String(sale.treatment || 'Upsell').replace(/^Upsell · /, 'Upsell, ') + (sale.decisionNote ? '. ' + sale.decisionNote : '.'), go: 'comision' });

    res.status(200).json({ ok: true, sale });
  } catch (err) {
    console.error('portal-approve error:', err.message);
    res.status(500).json({ error: 'approve_failed' });
  }
};
