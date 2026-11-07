// One-off, asked by the owner in chat on 7.11: „da, creează pixelul web Centrul360 Site în Business 433095392701442 și
// partajează-l cu contul de reclame”. Run once by the automations' clock (api/automation-tick.js):
//   1. a web pixel named "Centrul360 Site" in that Business (reused if one with this name is already there),
//   2. shared with the connected ad account (Integrări → Facebook), so ads can use it,
//   3. saved as the Conversions API pixel (data/meta-capi.json, nothing else of those settings changes).
// The token is the one kept for the ads; it goes only in the requests' body or query to Meta, never in the store or a log.
// data/pixel-once.json: { done, at, pixelId, name, created, shared, error, tries } (no secrets; read publicly by
// GET /api/portal-capi?public=1 so the site's pages can be given the new id).

const { readJSON, writeJSON } = require('./store');
const { loadConnection } = require('./facebook');

const KEY = 'data/pixel-once.json';
const BUSINESS = '433095392701442';
const NAME = 'Centrul360 Site';
const GRAPH = 'https://graph.facebook.com/v25.0';
const MAX_TRIES = 3;

const short = (j, status) => {
  const e = (j && j.error) || {};
  return String((e.error_user_msg || e.message || 'Meta a răspuns ' + status) + (e.code ? ' (cod ' + e.code + (e.error_subcode ? '/' + e.error_subcode : '') + ')' : '')).replace(/\s+/g, ' ').slice(0, 220);
};
async function call(method, path, token, params) {
  const p = new URLSearchParams(Object.assign({}, params || {}, { access_token: token }));
  const r = method === 'GET'
    ? await fetch(GRAPH + path + '?' + p.toString())
    : await fetch(GRAPH + path, { method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p.toString() });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !j.error, status: r.status, j };
}

async function run() {
  const st = await readJSON(KEY, {});
  if (st.done || (st.tries || 0) >= MAX_TRIES) return { skipped: true };
  const save = (x) => writeJSON(KEY, Object.assign(st, x, { at: new Date().toISOString() }));
  st.tries = (st.tries || 0) + 1;
  const conn = await loadConnection(readJSON).catch(() => null);
  const token = conn && conn.userToken, act = conn && conn.adAccountId;
  if (!token || !act) { await save({ error: 'Lipsește tokenul sau contul de reclame (Integrări → Facebook).' }); return { error: true }; }

  // 1. the pixel: the one with this name if the Business has it already, else a new one
  let pixelId = st.pixelId || '';
  if (!pixelId) {
    const owned = await call('GET', '/' + BUSINESS + '/owned_pixels', token, { fields: 'id,name', limit: '100' });
    const same = owned.ok && (owned.j.data || []).find((p) => String(p.name || '').trim().toLowerCase() === NAME.toLowerCase());
    if (same) pixelId = String(same.id);
    else {
      const made = await call('POST', '/' + BUSINESS + '/adspixels', token, { name: NAME });
      if (!made.ok || !made.j.id) { await save({ error: 'Crearea pixelului: ' + short(made.j, made.status) }); return { error: true }; }
      pixelId = String(made.j.id);
      st.created = true;
    }
    await save({ pixelId, name: NAME, error: '' });
  }

  // 2. shared with the ad account (account id without "act_")
  if (!st.shared) {
    const sh = await call('POST', '/' + pixelId + '/shared_accounts', token, { account_id: String(act).replace(/^act_/, ''), business: BUSINESS });
    if (!sh.ok) { await save({ error: 'Partajarea cu contul de reclame: ' + short(sh.j, sh.status) }); return { error: true, pixelId }; }
    st.shared = true;
  }

  // 3. the Conversions API sends to it from now on (its other settings stay as they are)
  const cfg = await readJSON('data/meta-capi.json', {});
  if (cfg.pixelId !== pixelId) await writeJSON('data/meta-capi.json', Object.assign({}, cfg, { pixelId, savedAt: new Date().toISOString(), savedBy: 'pixel-once' }));
  await save({ done: true, error: '' });
  return { done: true, pixelId };
}

async function status() {
  const st = await readJSON(KEY, {});
  return { pixelId: st.pixelId || '', name: st.name || '', created: !!st.created, shared: !!st.shared, done: !!st.done, tries: st.tries || 0, error: st.error || '', at: st.at || '' };
}

module.exports = { run, status, KEY };
