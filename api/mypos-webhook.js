// POST /api/mypos-webhook, myPOS calls it on every POS payment (pos.payment.completed) and void
// (pos.payment.cancelled), for the webhook the portal made when myPOS was connected (_lib/mypos.js).
// Signed with that webhook's secret (X-myPOS-Signature); anything unsigned is refused. A 2xx tells myPOS
// it arrived (otherwise it retries for up to 3 days). The payment lands in data/mypos-payments.json and
// the open portals refresh (Încasări → the POS check).

const { readJSON, writeJSON } = require('./_lib/store');
const M = require('./_lib/mypos');
const N = require('./_lib/notify');

module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
// the last deliveries, for Integrări (never the body: only when, which event, the sum and whether it was accepted)
async function logDelivery(entry) {
  try {
    const log = await readJSON('data/mypos-webhook-log.json', []);
    await writeJSON('data/mypos-webhook-log.json', [entry].concat(Array.isArray(log) ? log : []).slice(0, 20), { quiet: true });
  } catch (e) { /* the payment matters more than the log */ }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(200).send('ok'); return; } // a check that the address answers
  let raw;
  try { raw = await readRawBody(req); } catch (e) { res.status(400).json({ error: 'bad_body' }); return; }
  const conn = await M.loadConn(readJSON);
  const at = new Date().toISOString();
  if (!M.connected(conn) || !conn.webhook || !conn.webhook.secret) { res.status(410).json({ error: 'not_connected' }); return; }
  if (!M.validSignature(raw, req.headers['x-mypos-signature'], conn.webhook.secret)) {
    await logDelivery({ at, ok: false, reason: 'semnătură greșită' });
    res.status(401).json({ error: 'bad_signature' });
    return;
  }
  let body;
  try { body = JSON.parse(raw.toString('utf8')); } catch (e) { res.status(400).json({ error: 'bad_json' }); return; }
  const event = String(req.headers['x-mypos-event'] || body.event || '');
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : body;
  if (!M.EVENTS.includes(event) || !payload.tid) {
    await logDelivery({ at, ok: true, event, reason: 'ignorat' });
    res.status(200).json({ ok: true, ignored: true });
    return;
  }
  const tids = new Set((conn.devices || []).map((d) => d.tid));
  if (tids.size && !tids.has(String(payload.tid))) {
    await logDelivery({ at, ok: true, event, reason: 'alt terminal' });
    res.status(200).json({ ok: true, ignored: true });
    return;
  }
  const p = M.fromHook(event, payload);
  const data = await readJSON(M.PAY, { list: [] });
  const m = M.merge(data.list || [], [p]);
  await writeJSON(M.PAY, Object.assign({}, data, { list: m.list }));
  await logDelivery({ at, ok: true, event, amount: p.amount, tid: p.tid });
  // a new card payment rings for the owner at once, unless the desk recorded it already (that line, with the
  // client and the upsell, was its notification: _lib/notify.js claim); a repeat delivery adds nothing, rings nothing
  if (!p.cancelled && p.amount > 0 && m.added) {
    try {
      const store = { readJSON, writeJSON };
      const dev = (conn.devices || []).find((d) => d.tid === p.tid) || {};
      const desk = await N.claim(store, N.payRef('desk', p.amount), false);
      if (!desk) {
        await N.notifyMany(store, await N.adminIds(store), {
          kind: 'money', tone: 'good', go: 'incasari', tag: 'pos-' + p.id, ref: N.payRef('pos', p.amount),
          title: 'ÎNCASARE' + N.cityTag(dev.city) + ' 💵 - ' + N.leiTxt(p.amount) + ' card',
          text: 'pe POS' + (dev.city ? ', ' + dev.city : ''),
        });
      }
    } catch (e) { /* myPOS must get its 200 */ }
  }
  res.status(200).json({ ok: true });
};
