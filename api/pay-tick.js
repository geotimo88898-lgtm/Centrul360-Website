// GET /api/pay-tick: every minute (cf/worker.js scheduled, minute clock): the site's checkout orders active in the last 15
// minutes whose myPOS page was made are asked at myPOS (api/_lib/pay.js sweep fresh), so a payment is marked within a
// minute (myPOS's payment request page has no return link and no notification); then the one recovery message of an order
// not paid 10 minutes after her last sign of life (api/_lib/pay-recovery.js), once switched on (POST lead-health
// ?payopen=recoveryon) and its template approved by Meta. Only the Worker's own clock (or CRON_SECRET) may start it.
const { isCron } = require('./_lib/cron-auth');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isCron(req)) { res.status(401).json({ error: 'unauthorized' }); return; }
  try {
    const P = require('./_lib/pay'), R = require('./_lib/pay-recovery');
    const out = Object.assign({ ok: true }, await P.sweep({ fresh: true }));
    // its last round that asked myPOS something (lead-health ?payopen=1 shows it): proof the minute clock works
    if (out.asked || out.paid) await require('./_lib/store').writeJSON('data/pay-tick.json', { at: new Date().toISOString(), asked: out.asked, paid: out.paid }, { quiet: true }).catch(() => null);
    if (await R.on()) out.recovery = await R.run(P).catch((e) => ({ error: e.message }));
    else out.template = await R.template().then((t) => t.state, (e) => 'eroare: ' + e.message);
    res.status(200).json(out);
  } catch (err) {
    console.error('pay-tick', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
};
