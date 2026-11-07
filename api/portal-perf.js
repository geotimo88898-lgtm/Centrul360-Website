// /api/portal-perf, doar admin: Portal → Admin → Performanța site-ului (_lib/perf.js).
//   GET ?period=today|7d|30d      raportul (vizitele reale, erorile, serverul, greutatea, „Ce trebuie reparat”)
//   POST { action: 'probe' }      „Verifică serverul acum”: fiecare adresă importantă, cerută de pe internet
const { requireAdmin } = require('./_lib/auth');
const perf = require('./_lib/perf');

module.exports = async (req, res) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const p = perf.period(String((req.query && req.query.period) || 'today'));
      res.status(200).json(Object.assign({ period: { key: p.key, since: p.since, until: p.until } }, await perf.report(p)));
      return;
    }
    if (req.method === 'POST' && req.body && req.body.action === 'probe') {
      const r = await perf.probe('now');
      res.status(200).json({ at: r.at, r: r.r.map((x) => ({ target: x.tg, url: x.url, code: x.code, ms: x.ms, inner: !!x.inner })) });
      return;
    }
    res.status(400).json({ error: 'bad_request' });
  } catch (e) {
    console.error('portal-perf', e);
    res.status(500).json({ error: 'perf_failed', message: 'Nu am putut citi măsurătorile.' });
  }
};
