// The clinic's own people as a Meta custom audience (21.11): every client with a phone (any finished visit) plus the
// people of the „Transformarea 360” WhatsApp week (fc360/audience.json), so the new lead filter ads can leave them out
// (they get the 12-month offer at another price that week) and the card ads can reach them. Only SHA-256 hashes of
// the phone numbers (E.164 digits, as Meta wants) leave the store; nothing is kept here but the audience's id.
//   data/meta-customers.json { [adAccountId]: { id, name, at, sent } }

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./store');
const { loadConnection } = require('./facebook');
const ads = require('./meta-ads');
const WA = require('./whatsapp');

const KEY = 'data/meta-customers.json';
const NAME = 'C360 · Clientele noastre (cliente + lista Transformarea 360)';
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

async function phones() {
  const [clients, appts, fc] = await Promise.all([readJSON('data/clients.json', []), readJSON('data/appointments.json', []), readJSON('fc360/audience.json', null)]);
  const came = new Set((appts || []).filter((a) => a && a.status === 'finalizata' && a.clientId).map((a) => a.clientId));
  const out = new Set();
  (clients || []).forEach((c) => { if (c && came.has(c.id)) { const p = WA.toE164(c.phone); if (p) out.add(p); } });
  let list = Array.isArray(fc) ? fc : [];
  // not frozen yet (the week hasn't started): the list it would freeze
  if (!list.length) list = await require('./fc-campaign').buildAudience().then((x) => (Array.isArray(x) ? x : (x && x.list) || [])).catch(() => []);
  (Array.isArray(list) ? list : []).forEach((x) => { const p = WA.toE164(x && (x.phone || x.to)); if (p) out.add(p); });
  return Array.from(out);
}

// make (once per ad account) or refresh the audience: the whole list is sent again, Meta keeps one copy of each
async function sync() {
  const conn = await loadConnection(readJSON);
  if (!conn.userToken || !conn.adAccountId) return { error: 'not_connected' };
  const doc = (await readJSON(KEY, {})) || {};
  let rec = doc[conn.adAccountId];
  if (!rec || !rec.id) {
    const r = await ads.call('POST', '/' + conn.adAccountId + '/customaudiences', conn.userToken, { name: NAME, subtype: 'CUSTOM', customer_file_source: 'USER_PROVIDED_ONLY', description: 'Clientele Centrul360, pentru excludere și retargeting' });
    if (!r.ok) return { error: (r.j && r.j.error && (r.j.error.error_user_msg || r.j.error.message)) || 'meta_error' };
    rec = { id: String(r.j.id), name: NAME };
  }
  const hashes = (await phones()).map(sha);
  let sent = 0;
  for (let i = 0; i < hashes.length; i += 5000) {
    const chunk = hashes.slice(i, i + 5000);
    const r = await ads.call('POST', '/' + rec.id + '/users', conn.userToken, { payload: JSON.stringify({ schema: ['PHONE'], data: chunk.map((h) => [h]) }) });
    if (!r.ok) { doc[conn.adAccountId] = Object.assign(rec, { at: new Date().toISOString(), sent }); await writeJSON(KEY, doc); return { error: (r.j && r.j.error && (r.j.error.error_user_msg || r.j.error.message)) || 'meta_error', id: rec.id, sent }; }
    sent += chunk.length;
  }
  doc[conn.adAccountId] = Object.assign(rec, { at: new Date().toISOString(), sent });
  await writeJSON(KEY, doc);
  return { ok: true, id: rec.id, name: rec.name, sent };
}

async function current() {
  const conn = await loadConnection(readJSON);
  const doc = (await readJSON(KEY, {})) || {};
  return (conn.adAccountId && doc[conn.adAccountId]) || null;
}

module.exports = { sync, current, phones };
