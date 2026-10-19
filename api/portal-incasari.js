// POST /api/portal-incasari, admin-only correction/deletion of a payment (source: 'incasare')
// in data/sales.json. Mistakes (wrong amount, wrong method, wrong person) are fixed only by the
// owner, never by whoever recorded the payment.
//
// A payment is tied to its appointment and, when "Upsell efectuat" was ticked, to a commission
// request for whoever made the upsell (upsell - 60% costs, 10% of the profit). Both follow:
//   - update: a request still waiting for approval is kept in step (value, person, date) or
//     removed when there's no upsell any more; one is created if the correction adds an upsell.
//     An already approved commission is left as it was.
//   - delete: the appointment becomes unpaid again and a still-waiting request goes with it.

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { normalizeCategories, commissionOf, profitOf } = require('./_lib/cats');
const portalSale = require('./portal-sale');

const VALID_METHODS = ['card', 'cash', 'transfer', 'cash_card'];

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
    const upsellEntry = sales.find((s) => s.source === 'comision' && s.incasareId === entry.id);

    if (action === 'delete') {
      const drop = new Set([entry.id]);
      if (upsellEntry && (upsellEntry.automatic || upsellEntry.status === 'pending')) drop.add(upsellEntry.id);
      await writeJSON('data/sales.json', sales.filter((s) => !drop.has(s.id)));
      // a package paid in parts: this payment's part goes (and the package, when it was its only one)
      await require('./_lib/dues').resync({ readJSON, writeJSON }, entry.id, null);
      if (entry.appointmentId) {
        const appointments = await readJSON('data/appointments.json', []);
        const a = appointments.find((x) => x.id === entry.appointmentId);
        if (a && a.paidSaleId === entry.id) {
          delete a.paidSaleId; delete a.paidAt;
          if (a.status === 'finalizata') a.status = 'confirmata';
          a.updatedAt = new Date().toISOString();
          await writeJSON('data/appointments.json', appointments);
        }
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'update') {
      const { date, method, performedBy } = req.body || {};
      const amount = Math.round(Number(req.body.amount) * 100) / 100;
      if (!isValidDate(date)) { res.status(400).json({ error: 'invalid_date' }); return; }
      if (!VALID_METHODS.includes(method)) { res.status(400).json({ error: 'invalid_method' }); return; }
      if (!Number.isFinite(amount) || amount <= 0) { res.status(400).json({ error: 'invalid_amount' }); return; }
      let split = null;
      if (method === 'cash_card') {
        const cash = Math.round(Number(req.body.cashAmount) * 100) / 100;
        const card = Math.round(Number(req.body.cardAmount) * 100) / 100;
        if (!(cash > 0) || !(card > 0) || Math.abs(cash + card - amount) > 0.01) { res.status(400).json({ error: 'invalid_split' }); return; }
        split = { cash, card };
      }
      const categories = normalizeCategories(req.body.categories && req.body.categories.length ? req.body.categories : entry.categories || entry.category);
      if (!categories.length) { res.status(400).json({ error: 'invalid_category' }); return; }

      entry.date = date;
      entry.method = method;
      entry.split = split;
      entry.amount = amount;
      entry.categories = categories;
      entry.category = categories[0];
      if (req.body.treatment) entry.treatment = String(req.body.treatment).slice(0, 200);
      if (req.body.client) entry.client = String(req.body.client).slice(0, 150);
      entry.performedBy = performedBy ? String(performedBy).slice(0, 100) : '';
      // "Upsell efectuat" + its value can be corrected too; left out = unchanged.
      if (req.body.upsell !== undefined) {
        const done = req.body.upsell === true || req.body.upsell === 'true';
        const value = done ? (Number(req.body.upsellAmount) > 0 ? Math.round(Number(req.body.upsellAmount) * 100) / 100 : amount) : 0;
        if (done && !(value > 0 && value <= amount)) { res.status(400).json({ error: 'invalid_upsell' }); return; }
        entry.upsell = value;
      } else if (entry.upsell > amount) entry.upsell = amount;

      // Keep the commission request in step (only while it's still waiting for approval).
      let next = sales;
      if (upsellEntry && (upsellEntry.automatic || upsellEntry.status === 'pending')) {
        if (entry.upsell > 0 && entry.performedBy) {
          Object.assign(upsellEntry, { amount: entry.upsell, paidAmount: amount, employeeId: entry.performedBy, date: entry.date, categories, category: categories[0],
            profit: profitOf(entry.upsell), commission: commissionOf(entry.upsell),
            note: 'Upsell ' + entry.upsell + ' lei, minus 60% cheltuieli = ' + profitOf(entry.upsell) + ' lei profit, 10% = ' + commissionOf(entry.upsell) + ' lei' });
        } else next = sales.filter((s) => s.id !== upsellEntry.id);
      } else if (!upsellEntry && entry.upsell > 0 && entry.performedBy) {
        const employees = await readJSON('data/employees.json', []);
        const p = employees.find((e) => e.id === entry.performedBy);
        if (p && p.role === 'cosmetician') sales.push(portalSale.upsellFor(entry, p.id));
      }

      await writeJSON('data/sales.json', next);
      await require('./_lib/dues').resync({ readJSON, writeJSON }, entry.id, amount); // its part follows the new sum (never above the package)
      res.status(200).json({ ok: true, entry });
      return;
    }

    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    console.error('portal-incasari error:', err.message);
    res.status(500).json({ error: 'incasari_failed' });
  }
};
