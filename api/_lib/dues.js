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

// a package sold for `total`, of which this payment (sale) is the first part
async function start(store, sale, total) {
  const list = await store.readJSON(KEY, []);
  const at = new Date().toISOString();
  const d = {
    id: crypto.randomUUID(), clientId: sale.clientId || '', client: sale.client || '', what: sale.treatment || '',
    total: r2(total), paid: 0, saleId: sale.id, payments: [{ saleId: sale.id, amount: r2(sale.amount), at }], createdAt: at, closedAt: null,
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
// its part goes, and the package it started goes with it when nothing else was paid on it
async function resync(store, saleId, amount) {
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
      const others = r2(sum(d) - p.amount);
      p.amount = Math.max(0, Math.min(r2(amount), r2(d.total - others)));
    }
    d.paid = sum(d);
    d.closedAt = rest(d) <= 0 ? d.closedAt || new Date().toISOString() : null;
  }
  if (changed) await store.writeJSON(KEY, list);
  return changed;
}

module.exports = { KEY, openFor, find, start, pay, resync, rest };
