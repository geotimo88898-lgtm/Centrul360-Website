// /api/yt-oauth, admin only (Integrări → YouTube): the clinic's YouTube channel for Conținut (api/_lib/content-yt.js).
//   GET                         the card: the owner's Google OAuth client (its ID, whether a secret is saved), the
//                               redirect URI to register, the channel, what's missing; never a token or the secret
//   GET ?start=1                to Google's consent screen
//   GET ?cb=1&code=&state=      Google's answer: the tokens kept, back to Integrări (/?yt=connected|denied|expired|
//                               error|norefresh|nochannel|notconfigured#integrari)
//   POST { action: 'app', clientId, clientSecret }   the OAuth client (an empty secret keeps the saved one; another
//                               client drops the connection)
//   POST { action: 'disconnect' }                    the tokens revoked at Google and dropped

const { requireAdmin } = require('./_lib/auth');
const YT = require('./_lib/content-yt');

const back = (res, flag) => { res.setHeader('Cache-Control', 'no-store'); res.writeHead(302, { Location: '/?yt=' + flag + '#integrari' }); res.end(); };

module.exports = async (req, res) => {
  const session = await requireAdmin(req, res);
  if (!session) return;
  const q = req.query || {};
  try {
    if (req.method === 'GET') {
      // Google's answer (a code or an error, with the state this login started with)
      if (q.cb || q.code || q.error) {
        if (!YT.checkState(q.state, 'yt')) return back(res, 'expired');
        if (q.error || !q.code) return back(res, q.error === 'access_denied' ? 'denied' : 'error');
        const r = await YT.connect(String(q.code), session.employeeId);
        return back(res, r.ok ? 'connected' : r.error || 'error');
      }
      if (q.start) {
        let to;
        try { to = await YT.authUrl(); } catch (e) { return back(res, 'notconfigured'); }
        res.setHeader('Cache-Control', 'no-store');
        res.writeHead(302, { Location: to });
        res.end();
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(await YT.status());
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const b = req.body || {};
    res.setHeader('Cache-Control', 'no-store');
    if (b.action === 'app') await YT.saveApp(b, session.employeeId);
    else if (b.action === 'disconnect') await YT.disconnect();
    else { res.status(400).json({ error: 'invalid_action' }); return; }
    res.status(200).json(await YT.status());
  } catch (err) {
    if (err && err.status) { res.status(err.status).json({ error: err.message }); return; }
    console.error('yt-oauth:', err && err.message);
    if (req.method === 'GET' && (q.cb || q.code)) return back(res, 'error');
    res.status(500).json({ error: 'server_error' });
  }
};
