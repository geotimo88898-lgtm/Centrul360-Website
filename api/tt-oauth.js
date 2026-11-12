// /api/tt-oauth, admin only (Integrări → TikTok): the clinic's TikTok account for Conținut (api/_lib/content-tt.js).
//   GET                         the card: the owner's TikTok app (its client key, whether a secret is saved), the
//                               redirect URI and the domain to verify, the account, what's missing; never a token
//   GET ?start=1                to TikTok's login (Login Kit v2)
//   GET ?cb=1&code=&state=      TikTok's answer: the tokens kept, back to Integrări (/?tt=connected|denied|expired|
//                               error|notconfigured#integrari)
//   POST { action: 'app', clientKey, clientSecret }  the app (an empty secret keeps the saved one; another app drops
//                               the connection)
//   POST { action: 'disconnect' }                    the token revoked at TikTok and dropped

const { requireAdmin } = require('./_lib/auth');
const YT = require('./_lib/content-yt');
const TT = require('./_lib/content-tt');

const back = (res, flag) => { res.setHeader('Cache-Control', 'no-store'); res.writeHead(302, { Location: '/?tt=' + flag + '#integrari' }); res.end(); };

module.exports = async (req, res) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  const q = req.query || {};
  try {
    if (req.method === 'GET') {
      // TikTok's answer (it may leave out the ?cb=1 of the redirect URI: a code or an error is enough)
      if (q.cb || q.code || q.error) {
        if (!YT.checkState(q.state, 'tt')) return back(res, 'expired');
        if (q.error || !q.code) return back(res, q.error === 'access_denied' ? 'denied' : 'error');
        const r = await TT.connect(String(q.code), session.employeeId);
        return back(res, r.ok ? 'connected' : r.error || 'error');
      }
      if (q.start) {
        let to;
        try { to = await TT.authUrl(); } catch (e) { return back(res, 'notconfigured'); }
        res.setHeader('Cache-Control', 'no-store');
        res.writeHead(302, { Location: to });
        res.end();
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(await TT.status());
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const b = req.body || {};
    res.setHeader('Cache-Control', 'no-store');
    if (b.action === 'app') await TT.saveApp(b, session.employeeId);
    else if (b.action === 'disconnect') await TT.disconnect();
    else { res.status(400).json({ error: 'invalid_action' }); return; }
    res.status(200).json(await TT.status());
  } catch (err) {
    if (err && err.status) { res.status(err.status).json({ error: err.message }); return; }
    console.error('tt-oauth:', err && err.message);
    if (req.method === 'GET' && (q.cb || q.code)) return back(res, 'error');
    res.status(500).json({ error: 'server_error' });
  }
};
