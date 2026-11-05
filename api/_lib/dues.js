// What a client still has to pay for a package she pays in parts. Încasări: "Upsell efectuat" with the package's
// whole value above what she paid now starts one; a later payment ticked "din restul pachetului" pays it down; a
// payment corrected or deleted in Încasări corrects it too. The rest shows in the next payment of hers.
// data/client-dues.json: [{ id, clientId, client, what, total, paid, saleId (the one that started it),
//   payments: [{ saleId, amount, at }], createdAt, closedAt }]
const crypto = require('crypto');

const KEY = 'data/client-dues.json';
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const rest = (d) => Math.max(0, r2(d.total - d.paid));
const view = (d) => ({ id: d.id, what: d.what, total: d.total, paid: d.paid, rest: rest(d), createdAt: d.createdAt });
const sum = (d) => r2((d.payments || []).reduce((a, p) => a + Number(p.amount || 0), 0));

// the open ones (something left to pay) of these clients: { clientId: [due…] }
async function openFor(store, clientIds) {
  const want = new Set((clientIds || []).filter(Boolean));
  const out = {};
  (await store.readJSON(KEY, [])).forEach((d) => {
    if (!want.has(d.clientId) || rest(d) <= 0) return;
    (out[d.clientId] = out[d.clientId] || []).push(view(d));
  });
  return out;
}
async function find(store, id) { return (await store.readJSON(KEY, [])).find((d) => d.id === id) || null; }

// a package sold for `total`, of which this payment (sale) is the first part: `first` of it (5.11: only the upsell's
// advance, not the session she came for; older payments: the whole sum), `what` she bought
async function start(store, sale, total, first, what) {
  const list = await store.readJSON(KEY, []);
  const at = new Date().toISOString();
  const d = {
    id: crypto.randomUUID(), clientId: sale.clientId || '', client: sale.client || '', what: what || sale.treatment || '', location: sale.location || '',
    total: r2(total), paid: 0, saleId: sale.id, payments: [{ saleId: sale.id, amount: r2(first == null ? sale.amount : first), at }], createdAt: at, closedAt: null,
  };
  d.paid = sum(d);
  if (rest(d) <= 0) d.closedAt = at;
  list.push(d);
  await store.writeJSON(KEY, list);
  return view(d);
}

// a payment toward it: at most what is left. Returns { due, applied } or null.
async function pay(store, id, clientId, sale, amount) {
  const list = await store.readJSON(KEY, []);
  const d = list.find((x) => x.id === id && (!clientId || x.clientId === clientId));
  if (!d) return null;
  const applied = Math.min(r2(amount), rest(d));
  if (!(applied > 0)) return { due: view(d), applied: 0 };
  d.payments.push({ saleId: sale.id, amount: applied, at: new Date().toISOString() });
  d.paid = sum(d);
  if (rest(d) <= 0) d.closedAt = new Date().toISOString();
  await store.writeJSON(KEY, list);
  return { due: view(d), applied };
}

// a payment corrected in Încasări: its part follows the new amount (never above the package); deleted (amount null):
// its part goes, and the package it started goes with it when nothing else was paid on it. opts (a payment made of
// parts): { started: its advance on the package it started, total: that package's value, paid: what it paid on an older one }
async function resync(store, saleId, amount, opts) {
  const list = await store.readJSON(KEY, []);
  let changed = false;
  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i];
    const p = (d.payments || []).find((x) => x.saleId === saleId);
    if (!p) continue;
    changed = true;
    if (amount == null) {
      if (d.saleId === saleId && d.payments.length === 1) { list.splice(i, 1); continue; }
      d.payments = d.payments.filter((x) => x !== p);
    } else {
      const own = d.saleId === saleId;
      // the upsell taken off the payment: the package it started goes (when nothing else was paid on it)
      if (opts && own && opts.dropStarted && d.payments.length === 1) { list.splice(i, 1); continue; }
      if (opts && own && opts.total > 0) d.total = r2(opts.total);
      const want = opts ? (own ? opts.started : opts.paid) : amount;
      const others = r2(sum(d) - p.amount);
      p.amount = Math.max(0, Math.min(r2(want), r2(d.total - others)));
    }
    d.paid = sum(d);
    d.closedAt = rest(d) <= 0 ? d.closedAt || new Date().toISOString() : null;
  }
  if (changed) await store.writeJSON(KEY, list);
  return changed;
}

// Încasări → "Rest de plată din pachete": every package still being paid, newest first; city: one clinic or all ('').
// Older ones without their clinic take it from the payment that started them.
async function openAll(store, city) {
  const [list, sales] = await Promise.all([store.readJSON(KEY, []), store.readJSON('data/sales.json', [])]);
  const locOf = (d) => d.location || ((sales.find((x) => x.id === d.saleId) || {}).location) || '';
  return list.filter((d) => rest(d) > 0).map((d) => Object.assign(view(d), { client: d.client || '', clientId: d.clientId || '', location: locOf(d), last: ((d.payments || []).slice(-1)[0] || {}).at || d.createdAt }))
    .filter((d) => !city || !d.location || d.location === city)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

module.exports = { KEY, openFor, openAll, find, start, pay, resync, rest };
