// The site's pixel 2276074362800484 („Meta CAPI CRM”, Business Mellon Vision) shared with the ad account the admin is
// connected to now (21.11: act_1136609638911845, in CAD), so the card ads can optimise on its Purchase and use its
// visitors. Same calls as pixel-share.js (which linked the old „centru pls”): the pixel's owner shares, or else the
// ad account's business. Ids and Meta's answers only are kept (data/pixel-share-new.json), never the token.

const { readJSON, writeJSON } = require('./store');
const { loadConnection } = require('./facebook');

const KEY = 'data/pixel-share-new.json';
const PIXEL = '2276074362800484';
const PIXEL_BUSINESS = '1107600260509887'; // Mellon Vision
const GRAPH = 'https://graph.facebook.com/v25.0';

async function call(method, path, token, params) {
  try {
    const p = new URLSearchParams(Object.assign({}, params || {}, { access_token: token }));
    const r = method === 'GET' ? await fetch(GRAPH + path + '?' + p.toString()) : await fetch(GRAPH + path, { method, body: p });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) { const e = (j && j.error) || {}; return { error: String((e.error_user_msg || e.message || 'HTTP ' + r.status) + (e.code ? ' (cod ' + e.code + (e.error_subcode ? '/' + e.error_subcode : '') + ')' : '')).slice(0, 300) }; }
    return j;
  } catch (e) { return { error: String(e.message || e).slice(0, 300) }; }
}

async function run() {
  const conn = await loadConnection(readJSON).catch(() => null);
  const token = conn && conn.userToken, act = conn && conn.adAccountId;
  if (!token || !act) return { error: 'not_connected' };
  const linked = async () => { const px = await call('GET', '/' + act + '/adspixels', token, { fields: 'id,name', limit: '50' }); return { ok: !px.error && (px.data || []).some((x) => String(x.id) === PIXEL), seen: px.error ? px.error : (px.data || []).map((x) => x.id + ' ' + x.name) }; };
  const before = await linked();
  const attempts = [];
  if (!before.ok) {
    const acc = await call('GET', '/' + act, token, { fields: 'business{id,name}' });
    const accBiz = acc && acc.business && acc.business.id;
    for (const business of [PIXEL_BUSINESS, accBiz].filter(Boolean)) {
      const r = await call('POST', '/' + PIXEL + '/shared_accounts', token, { account_id: act.replace(/^act_/, ''), business });
      attempts.push({ business, answer: r.error ? { error: r.error } : r });
      if (!r.error) break;
    }
  }
  const after = before.ok ? before : await linked();
  const out = { account: act, at: new Date().toISOString(), alreadyLinked: before.ok, linked: after.ok, attempts, accountPixels: after.seen };
  await writeJSON(KEY, out);
  return out;
}

module.exports = { run, KEY, PIXEL };
