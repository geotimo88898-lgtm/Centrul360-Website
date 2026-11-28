// Centrul360, the admin's numbers for Claude (the owner, 28.11: „tu ai făcut tot, doar fă rost și verifică tot”). Read only,
// totals only: each ad's spend, leads, bookings, clients and money (Reclame → Clasament), the site's orders by sum and state;
// never a name, a phone or a message. Sealed for one reader: encrypted to the public key below, whose private half lives only
// in Claude's working session, never in this public repository. Anyone may ask; only that key opens the answer. A new key
// there means a new public key here.
//   GET /api/claude-report?what=ads&period=today|yesterday|7d|30d|max   (Reclame → Clasament)
//   GET /api/claude-report?what=pay&days=1..60                          (Site → Comenzi și plăți, without who)
// → { v: 1, at, k, iv, data } in base64: the answer as AES-256-GCM, its key wrapped with RSA-OAEP (SHA-256). The same question
// is answered from the last answer for 10 minutes (kept), so asking often costs Meta and the store nothing.
const store = require('./_lib/store');

const PUB = 'MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAk+PGPPtsSaHboy9znRA5Z796dF9sAz+WQs+lR2atayez48P+vxQlJmmYCRFt1LYlq2dEkLsER8apG61+jpz9dpWQaNxzEltsIeUv4vkyvgCkOxWj/uvqUzf3QoJd76e50HppLbajoUakcMXFum5PsSc2rZZAgcKzw7AsaerwyfNmpXUB5rVy6LLr/DSMGRfuQ9Phy7iV6Eg8ueqe2FGJNy9K12CbBocEU7CXIaOUJs/s3rlHrRoOTXnY0TUzFxhH86gqOfnpB/VVUi6WF6UR044xcxky8Upo+/95R8EesPkCFMb3tDyoEt/PSoUQB4jEusDlVl99YhYxHhYY40H5ZGpDivKX1CNXQk8pVCcpKrqDZ+fN0coyuZ+J2HE8T0MRYpiuSxYtD233aLfTFZ6yqwUAow6eP/nkoi9fXJrxmtW29yk87TB4lDc0vbA2cQBaGUNF8OKmDf+rVmoWWRWY4UX+PJqi7c6TKV1tasbT99QICQ/a0Th16GxM6zr2fQjrAgMBAAE=';
const KEEP = 10 * 60e3;
const subtle = () => (globalThis.crypto && globalThis.crypto.subtle) || require('crypto').webcrypto.subtle;
const b64 = (buf) => Buffer.from(buf).toString('base64');

async function seal(obj) {
  const S = subtle();
  const pub = await S.importKey('spki', Buffer.from(PUB, 'base64'), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
  const key = await S.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = (globalThis.crypto || require('crypto').webcrypto).getRandomValues(new Uint8Array(12));
  const data = await S.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  const k = await S.encrypt({ name: 'RSA-OAEP' }, pub, await S.exportKey('raw', key));
  return { v: 1, at: new Date().toISOString(), k: b64(k), iv: b64(iv), data: b64(data) };
}

async function ads(period) {
  const AM = require('./ads-manager');
  const { conn, problem } = await AM.connection();
  if (problem) return { ok: false, reason: problem };
  const r = await require('./_lib/ads-top').top(conn, period);
  // the ads' own words and pictures stay (they are the ads); nothing of a person is in these rows
  return r;
}

async function pay(days) {
  const r = await require('./_lib/pay-orders').list({ days });
  const rows = (r.rows || []).map(({ name, phone, msg, lead, ...x }) => Object.assign(x, { messaged: !!msg }));
  return { days: r.days, at: r.at, totals: r.totals, rows };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.status(405).json({ error: 'method' }); return; }
  const q = req.query || {};
  const what = ['ads', 'pay'].includes(q.what) ? q.what : '';
  if (!what) { res.status(400).json({ error: 'what' }); return; }
  const period = ['today', 'yesterday', '7d', '30d', 'max'].includes(q.period) ? q.period : '7d';
  const days = Math.max(1, Math.min(60, Number(q.days) || 14));
  const name = 'data/claude-report/' + what + '-' + (what === 'ads' ? period : days) + '.json';
  try {
    const kept = await store.readJSON(name, null).catch(() => null);
    if (kept && kept.at && Date.now() - Date.parse(kept.at) < KEEP && kept.data) { res.status(200).json(kept); return; }
    const answer = what === 'ads' ? await ads(period) : await pay(days);
    const sealed = await seal({ what, period: what === 'ads' ? period : undefined, days: what === 'pay' ? days : undefined, answer });
    await store.writeJSON(name, sealed, { quiet: true }).catch(() => {});
    res.status(200).json(sealed);
  } catch (e) {
    console.error('claude-report:', e.message);
    res.status(500).json({ error: 'failed' });
  }
};
