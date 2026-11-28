// Centrul360, the admin's numbers for Claude (the owner, 28.11: „tu ai făcut tot, doar fă rost și verifică tot”). Read only,
// totals only: each ad's spend, leads, bookings, clients and money (Reclame → Clasament), the site's orders by sum and state;
// never a name, a phone or a message. Sealed for one reader: encrypted to the public key below, whose private half lives only
// in Claude's working session, never in this public repository. Anyone may ask; only that key opens the answer. A new key
// there means a new public key here.
//   GET /api/claude-report?what=ads&period=today|yesterday|7d|30d|max   (Reclame → Clasament)
//   GET /api/claude-report?what=pay&days=1..60                          (Site → Comenzi și plăți, without who)
//   GET /api/claude-report?what=once&job=<id>                            (a one-time ads job of api/_lib/ads-once.js: done,
//                                                                         its ids, its last steps; kept 1 minute, not 10)
//   GET /api/claude-report?what=live                                     (every running ad of ours as Meta sees it now: in
//                                                                         review, approved, refused and why; kept 1 minute)
//   GET /api/claude-report?what=paydiag&days=1..14                       (each site order's way to the payment: her device,
//                                                                         the taps, the myPOS page, myPOS's errors; no who)
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

async function once(job) {
  const d = (await store.readJSON('data/ads-once.json', {})) || {};
  return { job, done: (d.done || {})[job] || '', site: (d.site || {})[job] || null, log: (d.log || []).filter((e) => e.job === job).slice(-20), running: d.running || null };
}

// every ad of ours Meta runs or reviews now (a new one has no spend yet, so the numbers above don't show it): its state,
// Meta's review and issues, its campaign; not its words or pictures
async function live() {
  const AM = require('./ads-manager');
  const { conn, problem } = await AM.connection();
  if (problem) return { ok: false, reason: problem };
  const r = await require('./_lib/ads-edit').activeAds(conn);
  if (!r.ok) return { ok: false, reason: r.error || 'failed' };
  return { ok: true, ads: r.ads.map((a) => ({ id: a.id, name: a.name, status: a.status, review: a.review, issues: a.issues, campaignStatus: a.campaignStatus, campaignId: a.campaignId, campaign: a.campaign, adset: a.adset })) };
}

// each site order's way to the payment (George, 28.11: „websiteul 100% funcțional fără erori”, before any ad): where it
// stopped. The steps the page and the server noted (her device in one word, the taps, a page that did not get ready), the
// myPOS page and myPOS's own error, refused, paid. Never her name, phone or messages.
async function paydiag(days) {
  const P = require('./_lib/pay');
  const r = await require('./_lib/pay-orders').list({ days });
  const rows = [];
  for (let i = 0; i < r.rows.length; i += 16) {
    const part = await Promise.all(r.rows.slice(i, i + 16).map((row) => P.readOrder(row.id).then((x) => [row, x.data], () => [row, null])));
    part.forEach(([row, o]) => {
      if (!o) return;
      const le = o.linkError || null;
      rows.push({ id: o.id, at: o.createdAt, kind: o.kind, amount: o.amount, city: o.city || '', state: row.state, status: o.status, failWhy: o.failWhy || '', src: row.src, tries: row.tries,
        trace: (o.trace || []).map((t) => ({ at: t.at, step: t.step, code: t.code })),
        contactAt: (o.notice && o.notice.at) || '', request: o.request ? { at: o.request.at, part: o.request.part || 0, recovered: !!o.request.recovered } : null,
        oldRequests: (o.requestsOld || []).length, requestTried: o.requestTried || '',
        linkError: le ? { code: le.code, status: le.status, message: String(le.message || '').slice(0, 200), at: le.at } : null,
        refusedAt: o.refusedAt || '', probableAt: (o.probable && o.probable.at) || '', paidAt: o.paidAt || '', parts: row.parts || null, reopened: (o.reopened || []).length });
    });
  }
  return { days: r.days, at: r.at, rows };
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
  const what = ['ads', 'pay', 'once', 'live', 'paydiag'].includes(q.what) ? q.what : '';
  if (!what) { res.status(400).json({ error: 'what' }); return; }
  const period = ['today', 'yesterday', '7d', '30d', 'max'].includes(q.period) ? q.period : '7d';
  const days = Math.max(1, Math.min(60, Number(q.days) || 14));
  const job = String(q.job || '').replace(/[^\w-]/g, '').slice(0, 80);
  if (what === 'once' && !job) { res.status(400).json({ error: 'job' }); return; }
  const name = 'data/claude-report/' + what + (what === 'live' ? '' : '-' + (what === 'ads' ? period : what === 'once' ? job : days)) + '.json';
  try {
    const kept = await store.readJSON(name, null).catch(() => null);
    if (kept && kept.at && Date.now() - Date.parse(kept.at) < (what === 'once' || what === 'live' || what === 'paydiag' ? 60e3 : KEEP) && kept.data) { res.status(200).json(kept); return; }
    const answer = what === 'ads' ? await ads(period) : what === 'once' ? await once(job) : what === 'live' ? await live() : what === 'paydiag' ? await paydiag(Math.min(days, 14)) : await pay(days);
    const sealed = await seal({ what, period: what === 'ads' ? period : undefined, days: what === 'pay' || what === 'paydiag' ? days : undefined, job: what === 'once' ? job : undefined, answer });
    await store.writeJSON(name, sealed, { quiet: true }).catch(() => {});
    res.status(200).json(sealed);
  } catch (e) {
    console.error('claude-report:', e.message);
    res.status(500).json({ error: 'failed' });
  }
};
