// POST /api/portal-sale, records a money entry in data/sales.json. Two independent
// flows share this one endpoint, distinguished by body.source:
//
//   source: 'comision' (default, back-compat with the original "Vânzările mele" form)
// - an employee logs HER OWN sale for commission purposes. Always created as
//     status: 'pending' - only an admin approval (api/portal-approve.js) computes
//     commission and makes it count toward the company goal / race bonus. Unchanged
//     from the first portal build.
//
//   source: 'incasare' ("Încasează client" - the shared cash-register replacement)
// - a factual record that money was received, available to any role (mainly the
//     receptionist). Written with status: 'recorded' immediately, no approval queue,
//     no commission math, and never attributed as anyone's personal commission claim.
//     It appears right away in the shared "Tabel de încasări" (api/portal-data.js
//     exposes it to every authenticated role) and is excluded from admin.pendingSales /
//     admin.allSales, which stay scoped to 'comision' entries for the approval workflow.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');
const { upsertClient } = require('./_lib/clients');
const { CATEGORIES, normalizeCategories, categoriesOf, commissionOf, profitOf } = require('./_lib/cats');
const workflows = require('./_lib/workflows');
const { cityOf, inCity } = require('./_lib/city');
const N = require('./_lib/notify');

// The three treatment categories (see _lib/cats.js); kept under this name for older importers.
const VALID_CATEGORIES = CATEGORIES;

const VALID_METHODS = ['card', 'cash', 'transfer', 'cash_card'];
const METHOD_WORD = { card: 'card', cash: 'cash', transfer: 'transfer', cash_card: 'cash + card' };

const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || '');
}

async function handleComision(req, res, session) {
  const { date, treatment, amount, note, clientId, clientName, clientPhone } =
    req.body || {};
  // one category or several (Salariu → "+ Adaugă comision" sends the list)
  const category = Array.isArray(req.body && req.body.categories) && req.body.categories.length ? req.body.categories : req.body && req.body.category;

  if (!date || !category || !String(treatment || '').trim() || amount === undefined) {
    res.status(400).json({ error: 'missing_fields' });
    return;
  }
  if (!normalizeCategories(category).length) {
    res.status(400).json({ error: 'invalid_category' });
    return;
  }
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    res.status(400).json({ error: 'invalid_amount' });
    return;
  }
  if (!isValidDate(date) || date > todayISO()) {
    res.status(400).json({ error: 'invalid_date' });
    return;
  }

  try {
    const sales = await readJSON('data/sales.json', []);

    // Client attribution is entirely optional for a commission entry, unchanged
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
    } else if (clientName) {
      linkedClientName = String(clientName).trim().slice(0, 150); // only her name: shown, no client record made
    }

    const entry = {
      id: crypto.randomUUID(),
      source: 'comision',
      employeeId: session.employeeId,
      date,
      categories: normalizeCategories(category),
      category: normalizeCategories(category)[0],
      treatment: String(treatment).slice(0, 200),
      amount: numAmount,
      note: note ? String(note).slice(0, 500) : '',
      clientId: linkedClientId,
      client: linkedClientName,
      status: 'pending',
      // added by hand (not from a payment): what she'd get, shown while it waits; approving fixes it
      origin: 'manual',
      profit: profitOf(numAmount),
      commission: commissionOf(numAmount),
      createdAt: new Date().toISOString(),
      decidedAt: null,
    };

    sales.push(entry);
    await writeJSON('data/sales.json', sales);

    // the owner hears there is one to approve (bell + phone)
    if (!N.isOwner(session)) {
      try {
        const store = { readJSON, writeJSON };
        const emp = (await readJSON('data/employees.json', [])).find((e) => e.id === session.employeeId);
        await N.notifyMany(store, await N.adminIds(store), {
          kind: 'approval', tone: 'info', go: 'aprobari', tag: 'comm-' + entry.id,
          title: 'COMISION DE APROBAT 🧾 - ' + (emp ? emp.name : 'Cosmeticiana'),
          text: entry.treatment + ' · upsell ' + N.leiTxt(numAmount) + (entry.client ? ' · ' + entry.client : ''),
        });
      } catch (e) { /* a notification never blocks the request */ }
    }

    res.status(200).json({ ok: true, entry });
  } catch (err) {
    console.error('portal-sale (comision) error:', err.message);
    res.status(500).json({ error: 'sale_failed' });
  }
}

// "Încasare" = an appointment gets paid. The desk picks WHICH appointment, HOW it was paid (card /
// cash / transfer / cash + card) and WHO did the treatment. When that person sold something extra
// ("Upsell efectuat" ticked: the amount paid is the upsell), she earns a commission on it: value - 60% costs, then
// 10% of the profit (_lib/cats.js). It goes to the owner's Aprobări first and counts only once
// approved; until then she sees it as "în așteptare".
async function handleIncasare(req, res, session) {
  const { appointmentId, method, performedBy } = req.body || {};
  if (!appointmentId) { res.status(400).json({ error: 'missing_appointment' }); return; }
  if (!VALID_METHODS.includes(method)) { res.status(400).json({ error: 'invalid_method' }); return; }
  const amount = Math.round(Number(req.body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) { res.status(400).json({ error: 'invalid_amount' }); return; }
  let split = null;
  if (method === 'cash_card') {
    const cash = Math.round(Number(req.body.cashAmount) * 100) / 100;
    const card = Math.round(Number(req.body.cardAmount) * 100) / 100;
    if (!(cash > 0) || !(card > 0) || Math.abs(cash + card - amount) > 0.01) { res.status(400).json({ error: 'invalid_split' }); return; }
    split = { cash, card };
  }

  try {
    const [appointments, sales, employees] = await Promise.all([
      readJSON('data/appointments.json', []),
      readJSON('data/sales.json', []),
      readJSON('data/employees.json', []),
    ]);
    const appt = appointments.find((x) => x.id === appointmentId);
    if (!appt) { res.status(404).json({ error: 'appointment_not_found' }); return; }
    if (!inCity(await cityOf(session, readJSON, employees), appt.location)) { res.status(403).json({ error: 'forbidden' }); return; }
    if (appt.paidSaleId && sales.some((x) => x.id === appt.paidSaleId)) { res.status(409).json({ error: 'already_paid' }); return; }
    const performer = performedBy ? employees.find((e) => e.id === performedBy) : null;
    if (!performer) { res.status(400).json({ error: 'missing_performer' }); return; }

    const today = todayISO();
    const date = appt.date && appt.date <= today ? appt.date : today;
    const categories = categoriesOf(appt);
    const booked = Number(appt.amount) || 0;
    // "Upsell efectuat": ticked by the desk; the upsell is the amount paid (or a given part of it).
    const upsellDone = req.body.upsell === true || req.body.upsell === 'true' || req.body.upsell === 1;
    const upsell = upsellDone ? (Number(req.body.upsellAmount) > 0 ? Math.round(Number(req.body.upsellAmount) * 100) / 100 : amount) : 0;
    if (upsellDone && !(upsell > 0 && upsell <= amount)) { res.status(400).json({ error: 'invalid_upsell' }); return; }
    // a package paid in parts: its whole value (above what she pays now) is kept, the rest shows at her next payments (_lib/dues.js)
    const packageTotal = upsellDone ? Math.round((Number(req.body.packageTotal) || 0) * 100) / 100 : 0;
    if (packageTotal && packageTotal < amount) { res.status(400).json({ error: 'invalid_package' }); return; }
    const D = require('./_lib/dues');
    const store = { readJSON, writeJSON };
    // this payment pays down what she still owes for a package (at most what is left)
    const dueId = String(req.body.dueId || '');
    const owed = dueId ? await D.find(store, dueId) : null;
    if (dueId && (!owed || (appt.clientId && owed.clientId !== appt.clientId))) { res.status(400).json({ error: 'invalid_due' }); return; }

    const entry = {
      id: crypto.randomUUID(),
      source: 'incasare',
      employeeId: session.employeeId, // who recorded it
      performedBy: performer.id,
      appointmentId: appt.id,
      clientId: appt.clientId || '',
      client: appt.clientName || '',
      date,
      location: appt.location || performer.location || '',
      categories,
      category: categories[0] || '',
      treatment: String(appt.treatment || '').slice(0, 200),
      amount,
      bookedAmount: booked,
      upsell,
      ...(packageTotal > amount ? { packageTotal } : {}),
      ...(owed ? { dueId: owed.id, toDue: Math.min(amount, D.rest(owed)) } : {}),
      method,
      split,
      status: 'recorded',
      commission: 0,
      note: '',
      createdAt: new Date().toISOString(),
      decidedAt: null,
    };
    sales.push(entry);

    let upsellEntry = null;
    if (upsell > 0 && performer.role === 'cosmetician') {
      upsellEntry = upsellFor(entry, performer.id);
      sales.push(upsellEntry);
    }
    await writeJSON('data/sales.json', sales);
    let due = null;
    if (entry.packageTotal) due = await D.start(store, entry, entry.packageTotal);
    if (owed) { const p = await D.pay(store, owed.id, appt.clientId, entry, amount); due = p && p.due; }

    // Paid = done: the appointment is closed in the Calendar (and the "after treatment"
    // automations, like the review request, can start).
    const before = appt.status;
    Object.assign(appt, { status: 'finalizata', paidSaleId: entry.id, paidAt: entry.createdAt, updatedAt: entry.createdAt });
    await writeJSON('data/appointments.json', appointments);
    if (before !== 'finalizata') { try { await workflows.emit('appointment_status', { appointment: appt, status: 'finalizata' }); } catch (e) { /* never blocks a payment */ } }
    // every payment the desk records rings for the owner; the card part may have rung already from the POS
    // (api/mypos-webhook.js): this line, with the client and the upsell, takes that one's place (_lib/notify.js claim)
    if (!N.isOwner(session)) {
      try {
        const store = { readJSON, writeJSON };
        const cardIn = method === 'card' ? amount : method === 'cash_card' && split ? split.card : 0;
        const pos = cardIn > 0 ? await N.claim(store, N.payRef('pos', cardIn), true) : null;
        await N.notifyMany(store, await N.adminIds(store), {
          kind: 'money', tone: 'good', go: 'incasari', tag: pos ? pos.tag : 'pay-' + entry.id, quiet: !!pos,
          ref: cardIn > 0 ? N.payRef('desk', cardIn) : '',
          title: 'ÎNCASARE' + N.cityTag(entry.location) + ' ' + (upsell > 0 ? '💵💵' : '💵') + ' - ' + N.leiTxt(amount) + ' ' + METHOD_WORD[method], // an upsell: two banknotes
          text: (upsell > 0 ? 'Upsell' + (upsell < amount ? ' ' + N.leiTxt(upsell) : '') : 'Fără upsell') + (entry.client ? ' · ' + entry.client : ''),
        });
      } catch (e) { /* never blocks a payment */ }
    }

    res.status(200).json({ ok: true, entry, upsell: upsellEntry, due });
  } catch (err) {
    console.error('portal-sale (incasare) error:', err.message);
    res.status(500).json({ error: 'sale_failed' });
  }
}

// The commission request for the upsell of a payment, for whoever made it: waits in the owner's
// Aprobări (the amount shown is upsell - 60% costs, 10% of the profit; approving fixes it). A
// correction of the payment (api/portal-incasari.js) keeps a still-waiting request in step.
function upsellFor(entry, employeeId) {
  const amount = entry.upsell;
  const profit = profitOf(amount), commission = commissionOf(amount);
  return {
    id: crypto.randomUUID(),
    source: 'comision',
    origin: 'upsell',
    incasareId: entry.id,
    employeeId,
    date: entry.date,
    categories: entry.categories,
    category: entry.category,
    treatment: 'Upsell · ' + entry.treatment,
    amount,
    paidAmount: entry.amount,
    profit,
    note: 'Upsell ' + amount + ' lei, minus 60% cheltuieli = ' + profit + ' lei profit, 10% = ' + commission + ' lei',
    clientId: entry.clientId,
    client: entry.client,
    status: 'pending',
    commission, // what she'll get; fixed when the owner approves
    automatic: false,
    createdAt: new Date().toISOString(),
    decidedAt: null,
    decisionNote: '',
  };
}

// Salariu: she takes back a commission she added by hand, while it still waits for the owner
async function handleComisionCancel(req, res, session) {
  const id = String((req.body && req.body.id) || '');
  try {
    const sales = await readJSON('data/sales.json', []);
    const s = sales.find((x) => x.id === id && x.source === 'comision');
    if (!s) { res.status(404).json({ error: 'sale_not_found' }); return; }
    if (s.employeeId !== session.employeeId || s.origin !== 'manual') { res.status(403).json({ error: 'forbidden' }); return; }
    if (s.status !== 'pending') { res.status(409).json({ error: 'already_decided' }); return; }
    await writeJSON('data/sales.json', sales.filter((x) => x !== s));
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('portal-sale (comision cancel) error:', err.message);
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
    // Whoever is at the desk takes the payment (in Arad that can be the cosmetician herself).
    await handleIncasare(req, res, session);
  } else if (source === 'comision_cancel') {
    await handleComisionCancel(req, res, session);
  } else {
    await handleComision(req, res, session);
  }
};

// Exported so other endpoints (api/portal-appointments.js) share this exact list
// instead of maintaining a second copy that could drift out of sync.
handler.VALID_CATEGORIES = VALID_CATEGORIES;
handler.upsellFor = upsellFor;

module.exports = handler;
