// Shared client-directory helpers, backed by data/clients.json in Blob (same
// readJSON/writeJSON "document" convention as every other data/*.json file in the
// portal — see api/_lib/store.js).
//
// A client record: { id, name, phone, createdAt, lastVisit }
//   - id: crypto.randomUUID()
//   - phone: normalized via normalizePhone() so the same number always maps to the
//     same record, even if typed with spaces/dashes/+40/0040.
//   - createdAt / lastVisit: YYYY-MM-DD date strings (lastVisit is bumped on every
//     upsert, including ones that only update the name).

const crypto = require('crypto');

const MAX_RESULTS = 15;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Normalizes a Romanian phone number to the local "07xxxxxxxx" 10-digit form where
// possible, so the same phone always normalizes to the same key regardless of how
// it was typed (spaces, dashes, parens, +40/0040 prefix). Intentionally simple —
// not a full phone-validation library, just enough for a stable dedupe key.
function normalizePhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/[\s\-()]/g, '');

  if (digits.startsWith('+40')) {
    digits = '0' + digits.slice(3);
  } else if (digits.startsWith('0040')) {
    digits = '0' + digits.slice(4);
  } else if (digits.startsWith('40') && digits.length === 11) {
    // "40722123456" (country code, no + or leading zeros) -> "0722123456"
    digits = '0' + digits.slice(2);
  }

  // Keep only digits from here on (strips any stray non-digit characters left over).
  digits = digits.replace(/\D/g, '');

  return digits;
}

// Finds an existing client by normalized phone. Returns undefined if not found or
// if the normalized phone is empty (never matches on an empty key).
function findByPhone(clients, normalizedPhone) {
  if (!normalizedPhone) return undefined;
  return clients.find((c) => c.phone === normalizedPhone);
}

// Creates or updates a client keyed by normalized phone. Last write wins on `name`
// (names get corrected/retyped slightly over time). A phone that fails to normalize
// to anything plausible still allows creating the client — store what was given
// rather than blocking the cash-register flow over a bad digit.
async function upsertClient({ name, phone }, { readJSON, writeJSON }) {
  const clients = await readJSON('data/clients.json', []);
  const normalizedPhone = normalizePhone(phone);
  const today = todayISO();
  const cleanName = String(name || '').trim().slice(0, 150);

  const existing = findByPhone(clients, normalizedPhone);
  if (existing) {
    existing.name = cleanName || existing.name;
    existing.lastVisit = today;
    await writeJSON('data/clients.json', clients);
    return existing;
  }

  const client = {
    id: crypto.randomUUID(),
    name: cleanName,
    phone: normalizedPhone || String(phone || '').trim().slice(0, 30),
    createdAt: today,
    lastVisit: today,
  };
  clients.push(client);
  await writeJSON('data/clients.json', clients);
  return client;
}

// Case-insensitive substring match against name OR phone, most-recently-seen first,
// capped at MAX_RESULTS. An empty query returns the most recent clients overall, so
// the UI can show "recent clients" before the user types anything.
function searchClients(query, allClients) {
  const q = String(query || '').trim().toLowerCase();
  const sorted = allClients
    .slice()
    .sort((a, b) => (a.lastVisit < b.lastVisit ? 1 : a.lastVisit > b.lastVisit ? -1 : 0));

  if (!q) return sorted.slice(0, MAX_RESULTS);

  return sorted
    .filter((c) => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q))
    .slice(0, MAX_RESULTS);
}

module.exports = { normalizePhone, upsertClient, searchClients };
