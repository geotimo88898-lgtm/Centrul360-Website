// Once (the owner in his main session, 7.11: „da, partajează pixelul cu contul de reclame”): the site's pixel
// 2276074362800484 („Meta CAPI CRM”, Business Mellon Vision) is shared with the ad account „centru pls”
// (act_4502494523405059, Business HairRevive), so the ads can learn from the CRM stages sent by the Conversions API.
// Nothing else is created or changed. Run by the automations' clock and the portal's pulse, at most once an hour; the result
// (ids and Meta's answers only, never the token) is kept in data/pixel-share.json and shown by GET /api/portal-capi?public=1.

const { readJSON, writeJSON } = require('./store');
const { loadConnection } = require('./facebook');

const KEY = 'data/pixel-share.json';
const PIXEL = '2276074362800484';
const PIXEL_BUSINESS = '1107600260509887'; // Mellon Vision, owns the pixel
const ACCOUNT = '4502494523405059';         // centru pls
const ACCOUNT_BUSINESS = '1327138448525997'; // HairRevive, owns the ad account
const GRAPH = 'https://graph.facebook.com/v25.0';
const MAX_TRIES = 48; // once an hour at most, for two days: it links as soon as the owner gives Mellon Vision access to the ad account

const errOf = (j, r) => { const e = (j && j.error) || {}; return String((e.error_user_msg || e.message || 'HTTP ' + (r && r.status)) + (e.code ? ' (cod ' + e.code + (e.error_subcode ? '/' + e.error_subcode : '') + ')' : '')).slice(0, 300); };
async function call(method, path, token, params) {
  try {
    const p = new URLSearchParams(Object.assign({}, params || {}, { access_token: token }));
    const r = method === 'GET' ? await fetch(GRAPH + path + '?' + p.toString()) : await fetch(GRAPH + path, { method, body: p });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) return { error: errOf(j, r) };
    return j;
  } catch (e) { return { error: String(e.message || e).slice(0, 300) }; }
}

// is the pixel among the ad account's pixels now?
async function linked(token) {
  const px = await call('GET', '/act_' + ACCOUNT + '/adspixels', token, { fields: 'id,name', limit: '50' });
  return { ok: !px.error && (px.data || []).some((x) => String(x.id) === PIXEL), seen: px.error ? px.error : (px.data || []).map((x) => x.id + ' ' + x.name) };
}

async function run() {
  const st = await readJSON(KEY, {});
  if (st.done || (st.tries || 0) >= MAX_TRIES) return { skipped: true };
  if (st.at && Date.now() - Date.parse(st.at) < 55 * 60e3) return { skipped: true, wait: true };
  const conn = await loadConnection(readJSON).catch(() => null);
  const token = conn && conn.userToken;
  if (!token) { await writeJSON(KEY, Object.assign(st, { tries: (st.tries || 0) + 1, at: new Date().toISOString(), error: 'Lipsește tokenul.' })); return { error: true }; }
  const before = await linked(token);
  const attempts = [];
  if (!before.ok) {
    // the business that shares is the pixel's owner; if Meta wants the other side, the ad account's business
    for (const business of [PIXEL_BUSINESS, ACCOUNT_BUSINESS]) {
      const r = await call('POST', '/' + PIXEL + '/shared_accounts', token, { account_id: ACCOUNT, business });
      attempts.push({ business, answer: r.error ? { error: r.error } : r });
      if (!r.error) break;
    }
  }
  const after = before.ok ? before : await linked(token);
  const out = { done: after.ok, tries: (st.tries || 0) + 1, at: new Date().toISOString(), alreadyLinked: before.ok, attempts, linked: after.ok, accountPixels: after.seen };
  await writeJSON(KEY, out);
  return { done: after.ok };
}

const status = async () => readJSON(KEY, {});

module.exports = { run, status, KEY };
