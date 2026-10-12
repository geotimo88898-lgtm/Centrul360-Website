// POST /api/portal-sale — records a money entry in data/sales.json. Two independent
// flows share this one endpoint, distinguished by body.source:
//
//   source: 'comision' (default, back-compat with the original "Vânzările mele" form)
//     — an employee logs HER OWN sale for commission purposes. Always created as
//     status: 'pending' — only an admin approval (api/portal-approve.js) computes
//     commission and makes it count toward the company goal / race bonus. Unchanged
//     from the first portal build.
//
//   source: 'incasare' ("Încasează client" — the shared cash-register replacement)
//     — a factual record that money was received, available to any role (mainly the
//     receptionist). Written with status: 'recorded' immediately, no approval queue,
//     no commission math, and never attributed as anyone's personal commission claim.
//     It appears right away in the shared "Tabel de încasări" (api/portal-data.js
//     exposes it to every authenticated role) and is excluded from admin.pendingSales /
//     admin.allSales, which stay scoped to 'comision' entries for the approval workflow.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const { upsertClient } = require('./_lib/clients');

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

const VALID_METHODS = ['card', 'cash', 'transfer'];

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '');
}

async function handleComision(req, res, session) {
  const { date, category, treatment, amount, note, clientId, clientName, clientPhone } =
    req.body || {};

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
  if (!isValidDate(date)) {
    res.status(400).json({ error: 'invalid_date' });
    return;
  }

  try {
    const sales = await readJSON('data/sales.json', []);

    // Client attribution is entirely optional for a commission entry — unchanged
    // behavior when none is given. An employee can either point at an existing
    // client (clientId, picked from the shared autocomplete) or quick-add a new
    // one inline (clientName + clientPhone), reusing the same upsertClient() the
    // cash-register flow uses, so there's still only one place clients get written.
    let linkedClientId = '';
    let linkedClientName = '';
    if (clientId) {
      const clients = await readJSON('data/clients.json', []);
      const found = clients.find((c) => c.id === clientId);
      if (found) {
        linkedClientId = found.id;
        linkedClientName = found.name;
      }
    } else if (clientName && clientPhone) {
      const client = await upsertClient(
        { name: clientName, phone: clientPhone },
        { readJSON, writeJSON }
      );
      linkedClientId = client.id;
      linkedClientName = client.name;
    }

    const entry = {
      id: crypto.randomUUID(),
      source: 'comision',
      employeeId: session.employeeId,
      date,
      category,
      treatment: String(treatment).slice(0, 200),
      amount: numAmount,
      note: note ? String(note).slice(0, 500) : '',
      clientId: linkedClientId,
      client: linkedClientName,
      status: 'pending',
      commission: 0,
      createdAt: new Date().toISOString(),
      decidedAt: null,
    };

    sales.push(entry);
    await writeJSON('data/sales.json', sales);

    res.status(200).json({ ok: true, entry });
  } catch (err) {
    console.error('portal-sale (comision) error:', err.message);
    res.status(500).json({ error: 'sale_failed' });
  }
}

async function handleIncasare(req, res, session) {
  const { clientName, clientPhone, date, category, treatment, amount, method, performedBy } =
    req.body || {};

  if (
    !clientName ||
    !clientPhone ||
    !date ||
    !category ||
    !treatment ||
    amount === undefined ||
    !method
  ) {
    res.status(400).json({ error: 'missing_fields' });
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
  if (!isValidDate(date)) {
    res.status(400).json({ error: 'invalid_date' });
    return;
  }
  const cleanClientName = String(clientName).trim().slice(0, 150);
  const cleanClientPhone = String(clientPhone).trim().slice(0, 30);
  if (!cleanClientName || !cleanClientPhone) {
    res.status(400).json({ error: 'invalid_client' });
    return;
  }

  try {
    const sales = await readJSON('data/sales.json', []);

    // One place writes client records: every "încasare" upserts the client directory
    // keyed by phone (see api/_lib/clients.js), so names typed slightly differently
    // over time still collapse onto the same client instead of creating duplicates.
    const clientRecord = await upsertClient(
      { name: cleanClientName, phone: cleanClientPhone },
      { readJSON, writeJSON }
    );

    const entry = {
      id: crypto.randomUUID(),
      source: 'incasare',
      employeeId: session.employeeId, // who recorded the cash entry (usually recepție)
      performedBy: performedBy ? String(performedBy).slice(0, 100) : '',
      clientId: clientRecord.id,
      client: clientRecord.name, // denormalized for display without a join
      date,
      category,
      treatment: String(treatment).slice(0, 200),
      amount: numAmount,
      method,
      status: 'recorded', // no approval needed — pure bookkeeping, visible immediately
      commission: 0,
      note: '',
      createdAt: new Date().toISOString(),
      decidedAt: null,
    };

    sales.push(entry);
    await writeJSON('data/sales.json', sales);

    res.status(200).json({ ok: true, entry });
  } catch (err) {
    console.error('portal-sale (incasare) error:', err.message);
    res.status(500).json({ error: 'sale_failed' });
  }
}

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;

  const { source } = req.body || {};

  if (source === 'incasare') {
    // Taking payments is front-desk work (receptie) + admin.
    if (!['admin', 'receptie'].includes(session.role)) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    await handleIncasare(req, res, session);
  } else {
    await handleComision(req, res, session);
  }
};

// Exported so other endpoints (api/portal-appointments.js) share this exact list
// instead of maintaining a second copy that could drift out of sync.
handler.VALID_CATEGORIES = VALID_CATEGORIES;

module.exports = handler;
