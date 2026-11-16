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
const { requireAdmin, requireRole } = require('./_lib/auth');
const { normalizeCategories, commissionOf, profitOf } = require('./_lib/cats');
const portalSale = require('./portal-sale');
const R = require('./_lib/refunds');
const M = require('./_lib/money');
const N = require('./_lib/notify');

const VALID_METHODS = ['card', 'cash', 'transfer', 'cash_card'];

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '');
}

// POST { action: 'refund_preview' | 'refund', id (the payment), scope: 'payment' | 'package', dueId?, amount, close, date,
//   reason, method }   and   { action: 'refund_undo', id (the refund row) }
async function handleRefund(req, res) {
  const session = await requireRole(req, res, ['admin', 'manager']);
  if (!session) return;
  if (session.viewer) { res.status(403).json({ error: 'forbidden' }); return; }
  const b = req.body || {};
  const fail = (code, error, extra) => res.status(code).json(Object.assign({ error }, extra || {}));
  try {
    const [sales, dues, employees] = await Promise.all([readJSON('data/sales.json', []), readJSON(require('./_lib/dues').KEY, []), readJSON('data/employees.json', [])]);
    // the manager: only a payment of her clinics (its clinic, or its cosmetician's when it has none written)
    const clinic = require('./_lib/clinic').clinicOf;
    const mine = async (s) => {
      if (session.role === 'admin') return true;
      const where = clinic(s.location) || clinic(((employees.find((e) => e.id === s.performedBy) || {}).location));
      const city = await require('./_lib/city').cityOf(session, readJSON, employees);
      return !!where && Array.isArray(city) && city.includes(where);
    };
    const store = { readJSON, writeJSON };
    const empName = (id) => ((employees.find((e) => e.id === id) || {}).name || '');

    if (b.action === 'refund_undo') {
      const row = sales.find((s) => s.id === String(b.id || '') && M.isRefund(s));
      if (!row) return fail(404, 'entry_not_found');
      if (!(await mine(row))) return fail(403, 'forbidden');
      await R.undo(store, row);
      await writeJSON('data/sales.json', sales.filter((s) => s !== row));
      res.status(200).json({ ok: true });
      return;
    }

    const sale = sales.find((s) => s.id === String(b.id || '') && s.source === 'incasare');
    if (!sale) return fail(404, 'entry_not_found');
    if (sale.kind === 'refund') return fail(400, 'is_refund');
    if (!(await mine(sale))) return fail(403, 'forbidden');
    const p = R.plan(sales, dues, b);
    if (p.error) return fail(p.code || 400, p.error, p.max != null ? { max: p.max } : null);
    const out = {
      lei: p.lei, max: p.max, whole: p.whole, scope: p.scope, close: p.close, fromPkg: p.fromPkg, fromSession: p.fromSession, pkg: p.pkg,
      restCut: p.restCut.reduce((a, x) => a + x.lei, 0),
      cuts: p.cuts.map((c) => ({ employeeId: c.employeeId, name: empName(c.employeeId), lei: c.lei, cash: c.cash, status: c.status })),
      refunded: R.refundedOf(sales, sale.id).total, amount: Number(sale.amount) || 0,
    };
    if (b.action === 'refund_preview') { res.status(200).json(Object.assign({ ok: true }, out)); return; }

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
    const date = isValidDate(b.date) ? b.date : today;
    if (date > today || date < R.FROM || date < sale.date) return fail(400, 'invalid_date');
    if (!String(b.reason || '').trim()) return fail(400, 'missing_reason');
    const row = await R.apply(store, sales, p, Object.assign({}, b, { date }), session);
    await writeJSON('data/sales.json', sales);
    // the manager's refund: the owner hears it (bell + phone)
    if (session.role === 'manager') {
      try {
        await N.notifyMany(store, await N.adminIds(store), {
          kind: 'money', tone: 'bad', go: 'incasari', tag: 'refund-' + row.id,
          title: 'RAMBURSARE' + N.cityTag(row.location) + ' - ' + N.leiTxt(p.lei),
          text: (empName(session.employeeId).split(' ')[0] || 'Rambursare') + ': ' + (row.client || 'clientă') + ' · ' + row.treatment.replace(/^Rambursare · /, '') + (row.reason ? ' · ' + row.reason : '') + (p.close ? ' · pachet închis' : ''),
        });
      } catch (e) { /* never blocks the refund */ }
    }
    res.status(200).json(Object.assign({ ok: true, refund: row }, out));
  } catch (err) {
    console.error('portal-incasari refund error:', err.message);
    res.status(500).json({ error: 'incasari_failed' });
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  // Încasări → "Rest de plată din pachete": every package still being paid in their city (a cosmetician: hers, read-only)
  if ((req.body || {}).action === 'dues') {
    const who = await requireRole(req, res, ['admin', 'receptie', 'manager', 'cosmetician']);
    if (!who) return;
    try {
      const city = await require('./_lib/city').cityOf(who, readJSON);
      if (who.role === 'cosmetician' && !city) { res.status(200).json({ ok: true, dues: [] }); return; } // no clinic on her record
      const list = await require('./_lib/dues').openAll({ readJSON, writeJSON }, city || '');
      res.status(200).json({ ok: true, dues: who.role === 'cosmetician' ? list.filter((d) => d.location === city) : list });
    } catch (err) { console.error('portal-incasari dues error:', err.message); res.status(500).json({ error: 'incasari_failed' }); }
    return;
  }

  // Rambursare (16.11): the owner and the manager (her clinics only); never cosmeticians or reception (_lib/refunds.js)
  if (['refund_preview', 'refund', 'refund_undo'].includes((req.body || {}).action)) { await handleRefund(req, res); return; }

  const session = await requireAdmin(req, res);
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
    // a refund is taken back with refund_undo, never corrected like a payment
    if (entry.kind === 'refund') { res.status(400).json({ error: 'is_refund' }); return; }
    // a payment with a refund on it: the refund first (its package parts and commission hang on it)
    const refunded = R.refundedOf(sales, entry.id).total;
    if (refunded > 0 && action === 'delete') { res.status(409).json({ error: 'has_refunds' }); return; }
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
      // a payment made of parts (since 5.11): the parts are corrected, the total is their sum
      const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
      // an older payment (one sum) can be split into parts too (the owner, 5.11: some were recorded wrong)
      const P = req.body.parts && typeof req.body.parts === 'object' ? req.body.parts : null;
      let np = null;
      if (P) {
        const ups = P.upsell === true || P.upsell === 'true';
        np = { session: r2(P.session), upsellValue: ups ? r2(P.upsellValue) : 0, upsellPaid: ups ? r2(P.upsellPaid) : 0, due: r2(entry.parts ? entry.parts.due : entry.toDue || 0) };
        if (np.session < 0 || np.upsellPaid < 0) { res.status(400).json({ error: 'invalid_amount' }); return; }
        if (ups && !(np.upsellValue > 0)) { res.status(400).json({ error: 'invalid_upsell' }); return; }
        if (np.upsellPaid > np.upsellValue) { res.status(400).json({ error: 'invalid_package' }); return; }
      }
      const amount = np ? r2(np.session + np.upsellPaid + np.due) : Math.round(Number(req.body.amount) * 100) / 100;
      if (!isValidDate(date)) { res.status(400).json({ error: 'invalid_date' }); return; }
      if (!VALID_METHODS.includes(method)) { res.status(400).json({ error: 'invalid_method' }); return; }
      if (!Number.isFinite(amount) || amount <= 0) { res.status(400).json({ error: 'invalid_amount' }); return; }
      if (refunded > 0 && amount < refunded - 0.005) { res.status(409).json({ error: 'has_refunds' }); return; }
      let split = null;
      if (method === 'cash_card') {
        const cash = Math.round(Number(req.body.cashAmount) * 100) / 100;
        const card = Math.round(Number(req.body.cardAmount) * 100) / 100;
        if (!(cash > 0) || !(card > 0) || Math.abs(cash + card - amount) > 0.01) { res.status(400).json({ error: 'invalid_split' }); return; }
        split = { cash, card };
      }
      const categories = normalizeCategories(req.body.categories && req.body.categories.length ? req.body.categories : entry.categories || entry.category);
      if (!categories.length) { res.status(400).json({ error: 'invalid_category' }); return; }

      if (!np && entry.packageTotal && amount > entry.packageTotal) { res.status(400).json({ error: 'invalid_package' }); return; } // more than the package: the rest would vanish
      // another person who did it: someone who left only for a day she still worked (_lib/left.js)
      if (performedBy && performedBy !== entry.performedBy) {
        const p = (await readJSON('data/employees.json', [])).find((e) => e.id === performedBy);
        if (p && !require('./_lib/left').worksOn(p, date)) { res.status(400).json({ error: 'performer_left' }); return; }
      }
      entry.date = date;
      entry.method = method;
      entry.split = split;
      entry.amount = amount;
      entry.categories = categories;
      entry.category = categories[0];
      if (req.body.treatment) entry.treatment = String(req.body.treatment).slice(0, 200);
      if (req.body.client) entry.client = String(req.body.client).slice(0, 150);
      entry.performedBy = performedBy ? String(performedBy).slice(0, 100) : '';
      let startDue = false;
      if (np) {
        entry.parts = { session: np.session, upsell: np.upsellPaid, due: np.due };
        entry.upsell = np.upsellValue;
        if (P.upsellWhat !== undefined) entry.upsellWhat = String(P.upsellWhat || '').trim().slice(0, 120);
        if (!np.upsellValue) delete entry.upsellWhat;
        // a cross-sell set or taken off in the correction: what she came for stays the booked treatment
        const to = P.crossTo !== undefined ? String(P.crossTo || '').trim().slice(0, 120) : entry.crossSell ? entry.crossSell.to : '';
        if (to) {
          const from = entry.crossSell ? entry.crossSell.from : entry.treatment;
          entry.crossSell = { to, from, fromAmount: entry.crossSell ? entry.crossSell.fromAmount : Number(entry.bookedAmount) || 0, amount: np.session };
          entry.treatment = to;
        } else if (entry.crossSell) { entry.treatment = entry.crossSell.from; delete entry.crossSell; }
        const owes = np.upsellValue > np.upsellPaid;
        startDue = owes && !entry.packageTotal; // now paid in parts, it wasn't before: its rest starts now
        if (owes) entry.packageTotal = np.upsellValue; else delete entry.packageTotal;
      } else if (req.body.upsell !== undefined) {
        // "Upsell efectuat" + its value can be corrected too; left out = unchanged.
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
      const D = require('./_lib/dues');
      if (np) {
        // its advance on the package it started (whose value may have changed) and its payment on an older one
        await D.resync({ readJSON, writeJSON }, entry.id, amount, { started: np.upsellPaid, total: np.upsellValue > np.upsellPaid ? np.upsellValue : np.upsellPaid, paid: np.due, dropStarted: !np.upsellValue });
        if (startDue) await D.start({ readJSON, writeJSON }, entry, np.upsellValue, np.upsellPaid, entry.upsellWhat || 'Upsell · ' + entry.treatment);
      } else await D.resync({ readJSON, writeJSON }, entry.id, amount); // its part follows the new sum (never above the package)
      res.status(200).json({ ok: true, entry });
      return;
    }

    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    console.error('portal-incasari error:', err.message);
    res.status(500).json({ error: 'incasari_failed' });
  }
};
