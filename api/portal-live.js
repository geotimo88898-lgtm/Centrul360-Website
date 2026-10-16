// /api/portal-live, admin-only: Admin → Integrări → Sincronizare instantă (Supabase Realtime, _lib/live.js).
// Never sends a key back.
//   GET                                                      configured?, from where, the last send
//   POST { action: 'connect', url, anonKey, serviceKey }     checks them with a test message, saves them
//   POST { action: 'test', id }                              one message on the channel (the page times it)
//   POST { action: 'disconnect' }

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const L = require('./_lib/live');

async function status() {
  const cfg = await L.config(true);
  if (!cfg) return { configured: false };
  return {
    configured: true, source: cfg.source, url: cfg.url, hasService: !!cfg.serviceKey, connectedAt: cfg.connectedAt || '',
    lastOk: L.state.lastOk, lastError: L.state.lastError, lastMs: L.state.lastMs,
    listen: { url: cfg.url, anonKey: cfg.anonKey, channel: cfg.channel },
  };
}

module.exports = async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  try {
    if (req.method === 'GET') { res.setHeader('Cache-Control', 'no-store'); res.status(200).json(await status()); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const b = req.body || {};

    if (b.action === 'connect') {
      const prev = await readJSON(L.CONN, {});
      const url = String(b.url || '').trim().replace(/\/+$/, '');
      const anonKey = String(b.anonKey || '').trim();
      let serviceKey = String(b.serviceKey || '').trim();
      if (!serviceKey && prev.url === url) serviceKey = prev.serviceKey || '';
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url)) { res.status(400).json({ error: 'invalid_url' }); return; }
      if (!/^[\w.\-]{30,2000}$/.test(anonKey)) { res.status(400).json({ error: 'invalid_anon' }); return; }
      if (serviceKey && !/^[\w.\-]{30,2000}$/.test(serviceKey)) { res.status(400).json({ error: 'invalid_service' }); return; }
      const cfg = { url, anonKey, serviceKey, channel: prev.url === url && prev.channel ? prev.channel : L.newChannel() };
      if (!(await L.send(cfg, 'ping', { at: Date.now() }))) { res.status(400).json({ error: 'live_failed', message: L.state.lastError }); return; }
      await writeJSON(L.CONN, Object.assign(cfg, { connectedAt: new Date().toISOString(), by: session.employeeId }));
      L.forget();
      res.status(200).json(await status());
      return;
    }
    if (b.action === 'test') {
      const cfg = await L.config(true);
      if (!cfg) { res.status(400).json({ error: 'not_configured' }); return; }
      const ok = await L.send(cfg, 'ping', { id: String(b.id || '').slice(0, 40), at: Date.now() });
      res.status(ok ? 200 : 400).json(ok ? { ok: true, ms: L.state.lastMs } : { error: 'live_failed', message: L.state.lastError });
      return;
    }
    if (b.action === 'disconnect') {
      await writeJSON(L.CONN, {});
      L.forget();
      res.status(200).json(await status());
      return;
    }
    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    console.error('portal-live error:', err.message);
    res.status(500).json({ error: 'live_failed' });
  }
};
