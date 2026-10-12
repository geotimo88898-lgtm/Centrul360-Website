// /api/fb-connection-status, admin-only (Integrări → Facebook). Never exposes a token.
//   GET   whether a Facebook Page is connected (and which ad account), or the Pages waiting
//         to be picked after Facebook's login (several Pages on one account)
//   POST { action: 'choose', pageId, adAccountId }   connect that Page (from the login just made,
//         or another Page of the same login) and remember the ad account
//   POST { action: 'ad_account', adAccountId }       change the ad account (picked from the list, or
//         typed by hand: act_123… / 123…), used later to publish ads from Creative

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { isConfigured, loadConnection, loadPending, connectPage } = require('./_lib/facebook');

const pub = (list) => (list || []).map((x) => ({ id: x.id, name: x.name, business: x.business || '' }));

async function status() {
  const [conn, pending] = await Promise.all([loadConnection(readJSON), loadPending({ readJSON })]);
  const out = { connected: !!conn.pageId };
  if (conn.pageId) Object.assign(out, {
    pageName: conn.pageName, connectedAt: conn.connectedAt, pageId: conn.pageId,
    pages: pub(conn.pages), adAccounts: pub(conn.adAccounts), adAccountId: conn.adAccountId || '', adAccountName: conn.adAccountName || '',
  });
  if (pending) out.pending = { pages: pub(pending.pages), adAccounts: pub(pending.adAccounts) };
  return out;
}

module.exports = async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  res.setHeader('Cache-Control', 'no-store');
  if (!isConfigured()) { res.status(200).json({ connected: false, notConfigured: true }); return; }
  try {
    if (req.method === 'GET') { res.status(200).json(await status()); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const body = req.body || {};
    const store = { readJSON, writeJSON };

    if (body.action === 'choose') {
      const pending = await loadPending(store);
      const conn = await loadConnection(readJSON);
      const src = pending || (conn.pageId ? { pages: conn.pages || [], adAccounts: conn.adAccounts || [], via: conn.connectedVia } : null);
      if (!src) { res.status(400).json({ error: 'login_expired' }); return; }
      const page = src.pages.find((p) => p.id === body.pageId);
      if (!page || !page.access_token) { res.status(400).json({ error: 'page_not_found' }); return; }
      const done = await connectPage(store, { page, pages: src.pages, adAccounts: src.adAccounts, adAccountId: body.adAccountId || '', by: session.employeeId, via: src.via || 'oauth' });
      if (done.error) { res.status(400).json({ error: done.error }); return; }
      res.status(200).json(await status());
      return;
    }

    if (body.action === 'ad_account') {
      const conn = await readJSON('data/fb-connection.json', {});
      if (!conn.pageId) { res.status(400).json({ error: 'not_connected' }); return; }
      const raw = String(body.adAccountId || '').trim();
      const known = (conn.adAccounts || []).find((a) => a.id === raw);
      const digits = raw.replace(/^act_/, '');
      if (!known && raw && !/^\d{5,20}$/.test(digits)) { res.status(400).json({ error: 'invalid_ad_account' }); return; }
      conn.adAccountId = known ? known.id : raw ? 'act_' + digits : '';
      conn.adAccountName = known ? known.name : clipName(body.adAccountName) || (raw ? 'act_' + digits : '');
      await writeJSON('data/fb-connection.json', conn);
      res.status(200).json(await status());
      return;
    }

    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    console.error('fb-connection-status error:', err.message);
    res.status(500).json({ error: 'status_failed' });
  }
};

function clipName(v) { return String(v || '').trim().slice(0, 80); }
