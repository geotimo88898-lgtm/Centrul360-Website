// Instant sync: every save anywhere (store.js bumps the data revision) is announced right away to every open
// portal (admin, staff, the phone app) through Supabase Realtime, a broadcast channel. Only the signal travels
// ("the data changed: appointments, rev …"), never a client's data: each portal then reads the fresh data from
// this server, signed in as usual. The 5-second check (portal-pulse) stays as the safety net.
//
// The owner makes a free Supabase project and pastes in Admin → Integrări → Sincronizare instantă: the Project
// URL, the anon (public) key and the service_role key. Or, in Vercel: SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY (these win). The channel name is random and only given to signed-in portals; the
// service_role key never leaves the server.
//   data/live-connection.json { url, anonKey, serviceKey, channel, connectedAt }

const crypto = require('crypto');

const CONN = 'data/live-connection.json';
let memo = { at: 0, value: null };
const state = { lastOk: '', lastError: '', lastMs: 0 };

const fromEnv = () => (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
  ? { url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '', channel: process.env.LIVE_CHANNEL || 'c360-live', source: 'env' }
  : null);

// the connection, read at most once a minute per instance (the store is required here, not at the top: store.js
// requires this file)
async function config(fresh) {
  const env = fromEnv();
  if (env) return env;
  if (!fresh && memo.value !== null && Date.now() - memo.at < 60e3) return memo.value;
  let v = null;
  try { const c = await require('./store').readJSON(CONN, null); v = c && c.url && c.anonKey ? Object.assign({ source: 'portal' }, c) : null; } catch (e) { v = null; }
  memo = { at: Date.now(), value: v };
  return v;
}
function forget() { memo = { at: 0, value: null }; }

// one message on the channel; never throws, never waits more than 1.5 s
async function send(cfg, event, payload) {
  const key = cfg.serviceKey || cfg.anonKey;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 1500);
  const started = Date.now();
  try {
    const r = await fetch(cfg.url.replace(/\/+$/, '') + '/realtime/v1/api/broadcast', {
      method: 'POST', signal: ctl.signal,
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: cfg.channel, event, payload, private: false }] }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 120));
    state.lastOk = new Date().toISOString(); state.lastMs = Date.now() - started; state.lastError = '';
    return true;
  } catch (e) {
    state.lastError = (e.name === 'AbortError' ? 'timeout' : e.message || 'failed').slice(0, 160);
    console.error('live.send:', state.lastError);
    return false;
  } finally { clearTimeout(t); }
}

// called by store.js after every save that the open portals should see
async function announce(rev) {
  const cfg = await config();
  if (!cfg) return false;
  return send(cfg, 'rev', { rev: rev.rev, changed: rev.changed });
}

// what a signed-in portal needs to listen (the anon key is public by design; the channel is not published anywhere)
async function publicConfig() {
  const cfg = await config();
  return cfg ? { url: cfg.url, anonKey: cfg.anonKey, channel: cfg.channel } : null;
}

const newChannel = () => 'c360-' + crypto.randomBytes(12).toString('hex');

module.exports = { CONN, config, forget, send, announce, publicConfig, newChannel, state };
