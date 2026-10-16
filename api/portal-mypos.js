// /api/portal-mypos, admin-only (Integrări → myPOS, and the POS check in Încasări). Never sends the secret back.
//   GET  ?view=status                         connected?, the terminals and their city, the live link, the history
//   GET  ?view=payments&from=YYYY-MM-DD&to=…   the POS payments of those days (reads the history first when it is
//                                             older than 10 minutes, or when those days were never read)
//   GET  ?view=balance                        the myPOS account's balance: now (API Gateway keys, kept 1 min) or from
//                                             its daily statement (kept 10 min)
//   POST { action: 'connect', clientId, clientSecret }  checks them with myPOS, finds the terminals, makes the
//        webhook for the live payments, reads the last 60 days
//   POST { action: 'device', tid, city }      which clinic a terminal is in (Timișoara / Arad)
//   POST { action: 'sync' }                   read the history now
//   POST { action: 'disconnect' }             removes the webhook and the credentials (the payments read stay)
//   POST { action: 'gateway', partnerId, appId, clientId, clientSecret, merchantId, merchantSecret }  the keys for the
//        balance now (myPOS Partner Portal), saved once myPOS accepted them; { action: 'gateway_off' } removes them

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const M = require('./_lib/mypos');

const CITIES = ['Timișoara', 'Arad'];
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const store = { readJSON, writeJSON };
const origin = (req) => 'https://' + req.headers.host;

async function status() {
  const conn = await M.loadConn(readJSON);
  const gateway = await M.loadGateway(store);
  if (!M.connected(conn)) return { connected: false, gateway };
  const pay = await readJSON(M.PAY, { list: [] });
  const log = await readJSON('data/mypos-webhook-log.json', []);
  const last = (pay.list || []).filter((p) => p.amount > 0).slice(-1)[0] || null;
  const h = conn.health || {};
  return {
    connected: true,
    clientId: conn.clientId.length > 8 ? conn.clientId.slice(0, 4) + '…' + conn.clientId.slice(-4) : '••••',
    connectedAt: conn.connectedAt || '',
    devices: (conn.devices || []).map((d) => ({ tid: d.tid, serial: d.serial, model: d.model, city: d.city || '' })),
    live: conn.webhook && conn.webhook.id ? { ok: true, events: conn.webhook.events || [] } : { ok: false, error: (h.live && h.live.error) || '', status: (h.live && h.live.status) || 0, message: (h.live && h.live.message) || '' },
    history: h.history || null,
    devicesHealth: h.devices || null,
    syncedAt: pay.syncedAt || '',
    lastPayment: last ? { at: last.at, amount: last.amount, tid: last.tid } : null,
    lastHook: (log || [])[0] || null,
    gateway,
  };
}

module.exports = async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  try {
    if (req.method === 'GET') {
      const view = String(req.query.view || 'status');
      if (view === 'balance') {
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json(await M.balance(store, req.query.fresh === '1'));
        return;
      }
      if (view === 'payments') {
        const from = String(req.query.from || ''), to = String(req.query.to || '');
        if (!isDay(from) || !isDay(to)) { res.status(400).json({ error: 'invalid_range' }); return; }
        const conn = await M.loadConn(readJSON);
        if (!M.connected(conn)) { res.status(200).json({ connected: false, payments: [] }); return; }
        let pay = await readJSON(M.PAY, { list: [] });
        const fromMs = Date.parse(from + 'T00:00:00+03:00') - 86400e3;
        const stale = !pay.syncedAt || Date.now() - Date.parse(pay.syncedAt) > 10 * 60e3;
        const older = !pay.coverFrom || fromMs < Date.parse(pay.coverFrom);
        let sync = null;
        if (stale || older) {
          sync = await M.sync(store, older ? { fromMs } : {});
          pay = await readJSON(M.PAY, { list: [] });
        }
        const devices = {};
        (conn.devices || []).forEach((d) => { devices[d.tid] = { city: d.city || '', model: d.model || '' }; });
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).json({
          connected: true, devices, syncedAt: pay.syncedAt || '', coverFrom: pay.coverFrom || '', sync,
          payments: (pay.list || []).filter((p) => p.day >= from && p.day <= to),
        });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(await status());
      return;
    }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const b = req.body || {};

    if (b.action === 'connect') {
      const prev = await M.loadConn(readJSON);
      const clientId = String(b.clientId || '').trim();
      let clientSecret = String(b.clientSecret || '').trim();
      if (!clientSecret && prev.clientId === clientId) clientSecret = prev.clientSecret || ''; // same ID, empty secret: the saved one
      if (!/^[\w.\-]{6,200}$/.test(clientId)) { res.status(400).json({ error: 'invalid_client_id' }); return; }
      if (!/^[\w.\-~+/=]{8,300}$/.test(clientSecret)) { res.status(400).json({ error: 'invalid_client_secret' }); return; }
      const conn = { clientId, clientSecret };
      try { await M.token(conn); } catch (e) { res.status(400).json({ error: e.code === 'mypos_auth' ? 'mypos_auth' : 'mypos_down' }); return; }
      const health = {};
      // the terminals (the city chosen before stays with its terminal)
      const cityOf = new Map((prev.devices || []).map((d) => [d.tid, d.city]));
      try {
        conn.devices = (await M.listDevices(conn)).map((d) => Object.assign(d, { city: cityOf.get(d.tid) || '' }));
        health.devices = { ok: true, at: new Date().toISOString() };
      } catch (e) {
        conn.devices = prev.devices || [];
        health.devices = { ok: false, error: e.code, status: e.status, message: e.message };
      }
      // the live payments: a webhook to this portal
      try {
        if (prev.webhook && prev.clientId && prev.clientId !== clientId) await M.dropWebhook(prev);
        conn.webhook = await M.ensureWebhook(conn, origin(req) + '/api/mypos-webhook');
        health.live = { ok: true, at: new Date().toISOString() };
      } catch (e) {
        conn.webhook = null;
        health.live = { ok: false, error: e.code, status: e.status, message: e.message };
      }
      conn.connectedAt = prev.clientId === clientId && prev.connectedAt ? prev.connectedAt : new Date().toISOString();
      conn.by = session.employeeId;
      conn.health = health;
      await writeJSON(M.CONN, conn);
      await M.sync(store, { fromMs: Date.now() - 60 * 86400e3 });
      res.status(200).json(await status());
      return;
    }

    if (b.action === 'device') {
      const conn = await M.loadConn(readJSON);
      if (!M.connected(conn)) { res.status(400).json({ error: 'not_connected' }); return; }
      const d = (conn.devices || []).find((x) => x.tid === String(b.tid || ''));
      if (!d) { res.status(404).json({ error: 'device_not_found' }); return; }
      const city = String(b.city || '');
      if (city && !CITIES.includes(city)) { res.status(400).json({ error: 'invalid_city' }); return; }
      d.city = city;
      await writeJSON(M.CONN, conn);
      res.status(200).json(await status());
      return;
    }

    if (b.action === 'sync') {
      const r = await M.sync(store, {});
      if (!r.ok) { res.status(400).json({ error: r.error || 'mypos_failed' }); return; }
      res.status(200).json(Object.assign(await status(), { added: r.added }));
      return;
    }

    if (b.action === 'gateway') {
      const r = await M.saveGateway(store, b, session.employeeId);
      if (r.error) { res.status(400).json(r); return; }
      res.status(200).json(await status());
      return;
    }
    if (b.action === 'gateway_off') {
      await M.dropGateway(store);
      res.status(200).json(await status());
      return;
    }

    if (b.action === 'disconnect') {
      const conn = await M.loadConn(readJSON);
      if (M.connected(conn)) await M.dropWebhook(conn);
      await writeJSON(M.CONN, { devices: conn.devices || [] }); // the cities stay for a reconnect
      res.status(200).json({ connected: false });
      return;
    }

    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    console.error('portal-mypos error:', err.code || '', err.status || '', err.message);
    res.status(500).json({ error: 'mypos_failed' });
  }
};
