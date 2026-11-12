// Conținut on TikTok (the owner, 12.11): the clinic's account, through the owner's own TikTok developer app
// (Integrări → TikTok: the client key and secret, then „Conectează cu TikTok”), with the Content Posting API (Direct Post).
// The posting run (content-post.js) takes a TikTok entry like Instagram's: claimed, posted, resumed, tried again, held.
//  - The login (api/tt-oauth.js): Login Kit v2 with video.publish, video.upload, video.list (the numbers),
//    user.info.basic and user.info.stats; the access token lasts a day and is made again from the refresh token
//    (a year). A refresh TikTok refuses: the connection is marked lost, the entries wait, Integrări says so.
//  - A reel: creator_info (the privacy levels the account allows, comments / duets / stitches off when the creator
//    turned them off, the longest video), then video/init with PULL_FROM_URL (TikTok fetches the MP4 from
//    api/content-file.js: admin.centrul360.com must be a verified domain of the app), then its status until
//    PUBLISH_COMPLETE (the publish_id is kept in the entry, so the next run only asks again).
//  - A carousel or slideshow: content/init with media_type PHOTO and the photos' URLs (PULL_FROM_URL only).
//  - Privacy: the most public level creator_info allows. Until TikTok audits the app, only SELF_ONLY goes: the entry
//    gets the note PRIVATE_NOTE and the next posts go private straight away for 3 days, then public is tried again.
//  - Numbers: video/query (views, likes, comments, shares); followers: user/info follower_count.
// data/tt-app.json { clientKey, clientSecret, savedAt, savedBy } and data/tt-connection.json { openId, accessToken,
// expiresAt, refreshToken, refreshExpiresAt, scopes, displayName, avatar, connectedAt, connectedBy, lost, unauditedAt,
// note }: private in the store; Integrări never gets a token or the secret.

const { readJSON, writeJSON } = require('./store');
const C = require('./content');
const YT = require('./content-yt');

const APP_KEY = 'data/tt-app.json';
const CONN_KEY = 'data/tt-connection.json';
const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const API = 'https://open.tiktokapis.com/v2';
const SCOPES = ['user.info.basic', 'user.info.stats', 'video.publish', 'video.upload', 'video.list'];
const NEEDS = ['video.publish'];
const PRIVACY = ['PUBLIC_TO_EVERYONE', 'FOLLOWER_OF_CREATOR', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'];
const PRIVATE_NOTE = 'TikTok le pune private până la auditul aplicației';
const UNAUDITED_MS = 3 * 864e5;
const redirectUri = () => C.ORIGIN() + '/api/tt-oauth?cb=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const stop = (msg, access, drop) => Object.assign(new Error(String(msg).slice(0, 300)), { access: !!access, drop: !!drop });
// what trying again in 45 minutes won't fix: the login, a permission, the domain, the app's audit, the day's cap
const ACCESS = ['access_token_invalid', 'scope_not_authorized', 'scope_permission_missed', 'unaudited_client_can_only_post_to_private_accounts', 'url_ownership_unverified',
  'spam_risk_too_many_posts', 'spam_risk_user_banned_from_posting', 'reached_active_user_cap', 'spam_risk_too_many_pending_share', 'spam_risk'];
const WHY = {
  url_ownership_unverified: 'TikTok: domeniul admin.centrul360.com nu e verificat în aplicația de TikTok (URL properties)',
  unaudited_client_can_only_post_to_private_accounts: 'TikTok: până la auditul aplicației se poate posta doar pe un cont privat',
  spam_risk_too_many_posts: 'TikTok: s-a atins limita de postări pe zi',
  reached_active_user_cap: 'TikTok: aplicația a atins limita de utilizatori pe zi',
  scope_not_authorized: 'TikTok: lipsește permisiunea video.publish (Integrări → TikTok → Conectează)',
  access_token_invalid: 'TikTok: logarea a expirat (Integrări → TikTok → Conectează)',
};

// ---------------------------------------------------------------- the app and the connection
async function app() { const a = (await readJSON(APP_KEY, {})) || {}; return { clientKey: a.clientKey || '', clientSecret: a.clientSecret || '' }; }
const connection = async () => (await readJSON(CONN_KEY, {})) || {};
const okKey = (x) => /^[\w-]{8,64}$/.test(x);
async function saveApp(input, by) {
  const clientKey = String((input && input.clientKey) || '').trim(), clientSecret = String((input && input.clientSecret) || '').trim();
  if (!okKey(clientKey)) throw C.fail('invalid_client_key');
  if (clientSecret && !okKey(clientSecret)) throw C.fail('invalid_client_secret');
  const prev = (await readJSON(APP_KEY, {})) || {};
  const same = prev.clientKey === clientKey;
  if (!clientSecret && !(same && prev.clientSecret)) throw C.fail('missing_client_secret');
  await writeJSON(APP_KEY, { clientKey, clientSecret: clientSecret || prev.clientSecret, savedAt: new Date().toISOString(), savedBy: by || '' });
  if (!same) await writeJSON(CONN_KEY, {});
}
async function authUrl() {
  const a = await app();
  if (!a.clientKey || !a.clientSecret) throw C.fail('tt_not_configured');
  return AUTH_URL + '?' + new URLSearchParams({ client_key: a.clientKey, response_type: 'code', scope: SCOPES.join(','), redirect_uri: redirectUri(), state: YT.signState('tt') });
}
const ttMsg = (j, status) => String((j && (j.error_description || (j.error && j.error.message) || (typeof j.error === 'string' ? j.error : ''))) || 'TikTok a răspuns ' + status).slice(0, 240);
async function tokenCall(params) {
  const r = await fetch(API + '/oauth/token/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' }, body: new URLSearchParams(params).toString() });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !!j.access_token, status: r.status, j };
}
// one call of the API: { ok, code, msg, data, text }
async function api(path, tok, body, query) {
  const r = await fetch(API + path + (query ? '?' + new URLSearchParams(query) : ''), body === undefined
    ? { headers: { Authorization: 'Bearer ' + tok } }
    : { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body) });
  const text = await r.text().catch(() => '');
  let j = {}; try { j = JSON.parse(text); } catch (e) { j = {}; }
  const err = j.error || {};
  const code = String(err.code || (r.ok ? 'ok' : 'http_' + r.status));
  return { ok: r.ok && code === 'ok', status: r.status, code, msg: String(err.message || '').slice(0, 240), data: j.data || {}, text };
}
const userOf = async (tok) => {
  const r = await api('/user/info/', tok, undefined, { fields: 'open_id,display_name,avatar_url,follower_count' });
  return r.ok && r.data.user ? r.data.user : null;
};
async function connect(code, by) {
  const a = await app();
  if (!a.clientKey || !a.clientSecret) return { error: 'notconfigured' };
  const t = await tokenCall({ client_key: a.clientKey, client_secret: a.clientSecret, code: String(code || ''), grant_type: 'authorization_code', redirect_uri: redirectUri() });
  if (!t.ok) { console.error('tt connect: token', t.status, ttMsg(t.j, t.status)); return { error: 'error' }; }
  const u = await userOf(t.j.access_token).catch(() => null);
  const now = Date.now();
  await writeJSON(CONN_KEY, { openId: t.j.open_id || (u && u.open_id) || '', accessToken: t.j.access_token, expiresAt: now + (Number(t.j.expires_in) || 86400) * 1000,
    refreshToken: t.j.refresh_token || '', refreshExpiresAt: now + (Number(t.j.refresh_expires_in) || 365 * 86400) * 1000,
    scopes: String(t.j.scope || '').split(/[,\s]+/).filter(Boolean), displayName: (u && u.display_name) || '', avatar: (u && u.avatar_url) || '',
    connectedAt: new Date(now).toISOString(), connectedBy: by || '', lost: '' });
  return { ok: true, name: (u && u.display_name) || '' };
}
async function token() {
  const c = await connection();
  if (!c.accessToken) throw stop('TikTok nu e conectat (Integrări)', true);
  if (c.lost) throw stop('TikTok s-a deconectat: ' + c.lost + ' (Integrări → TikTok → Conectează)', true);
  if (Number(c.expiresAt) - 5 * 60e3 > Date.now()) return c.accessToken;
  const a = await app();
  if (!a.clientKey || !a.clientSecret) throw stop('Aplicația TikTok nu e setată (Integrări → TikTok)', true);
  const t = c.refreshToken ? await tokenCall({ client_key: a.clientKey, client_secret: a.clientSecret, grant_type: 'refresh_token', refresh_token: c.refreshToken }) : { ok: false, status: 400, j: { error_description: 'fără refresh token' } };
  if (!t.ok) {
    const why = ttMsg(t.j, t.status);
    if (t.status < 500) { c.lost = why; await writeJSON(CONN_KEY, c); }
    throw stop('TikTok: ' + why, true);
  }
  const now = Date.now();
  Object.assign(c, { accessToken: t.j.access_token, expiresAt: now + (Number(t.j.expires_in) || 86400) * 1000 });
  if (t.j.refresh_token) { c.refreshToken = t.j.refresh_token; c.refreshExpiresAt = now + (Number(t.j.refresh_expires_in) || 365 * 86400) * 1000; }
  if (t.j.scope) c.scopes = String(t.j.scope).split(/[,\s]+/).filter(Boolean);
  await writeJSON(CONN_KEY, c);
  return c.accessToken;
}
async function disconnect() {
  const [a, c] = await Promise.all([app(), connection()]);
  if (c.accessToken && a.clientKey && a.clientSecret) {
    await fetch(API + '/oauth/revoke/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: a.clientKey, client_secret: a.clientSecret, token: c.accessToken }).toString() }).catch(() => null);
  }
  await writeJSON(CONN_KEY, {});
}
async function access() {
  const [a, c] = await Promise.all([app(), connection()]);
  const scopes = Array.isArray(c.scopes) ? c.scopes : [];
  return { configured: !!(a.clientKey && a.clientSecret), connected: !!(c.accessToken && !c.lost && a.clientKey), lost: c.lost || '', name: c.displayName || '',
    scopes, missing: c.accessToken ? NEEDS.filter((s) => !scopes.includes(s)) : NEEDS.slice(), stats: scopes.includes('video.list') };
}
async function status() {
  const [a, c, x] = await Promise.all([app(), connection(), access()]);
  return Object.assign(x, { clientKey: a.clientKey, hasSecret: !!a.clientSecret, redirectUri: redirectUri(), domain: new URL(C.ORIGIN()).host, connectedAt: c.connectedAt || '', note: c.note || '' });
}
async function patchConn(fn) { const c = await connection(); if (!c.accessToken) return; if (fn(c) !== false) await writeJSON(CONN_KEY, c); }
const setNote = (note) => patchConn((c) => { if ((c.note || '') === (note || '')) return false; c.note = note || ''; });

// ---------------------------------------------------------------- posting
const isPhoto = (it) => it.kind === 'carousel' || it.kind === 'slideshow';
const tidy = (s) => String(s || '').replace(/\r/g, '').trim();
// a photo post: the first line as the title (at most 90), the rest as the description; a longer first line: a
// shortened title and the whole text below
function photoTexts(it) {
  const cap = tidy(C.captionFor(it, 'tt'));
  const lines = cap.split('\n'), k = lines.findIndex((l) => l.trim());
  const first = k >= 0 ? lines[k].trim() : tidy(it.topic);
  if (first.length <= 90) return { title: first, description: (k >= 0 ? lines.slice(k + 1).join('\n').trim() : '').slice(0, 4000) };
  return { title: first.slice(0, 89).replace(/\s+\S*$/, '') + '…', description: cap.slice(0, 4000) };
}
const bestPrivacy = (opts, c) => {
  const list = Array.isArray(opts) && opts.length ? opts : ['SELF_ONLY'];
  if (c.unauditedAt && Date.now() - Date.parse(c.unauditedAt) < UNAUDITED_MS && list.includes('SELF_ONLY')) return 'SELF_ONLY';
  return PRIVACY.find((p) => list.includes(p)) || list[0];
};
// TikTok's ids are bigger than a JS number: read them from the text, not the parsed JSON
const idsIn = (text, field) => { const m = new RegExp('"' + field + '"\\s*:\\s*\\[([^\\]]*)\\]').exec(String(text || '')); return m ? m[1].split(',').map((x) => x.replace(/[\s"]/g, '')).filter(Boolean) : []; };
const failOf = (r, what) => stop(WHY[r.code] || ('TikTok, ' + what + ': ' + (r.msg || r.code)), ACCESS.includes(r.code) || r.status === 401, false);

async function init(tok, it, privacy, info) {
  if (isPhoto(it)) {
    const m = C.media(it);
    const t = photoTexts(it);
    return api('/post/publish/content/init/', tok, {
      post_info: { title: t.title, description: t.description, privacy_level: privacy, disable_comment: !!info.comment_disabled, auto_add_music: true, brand_content_toggle: false, brand_organic_toggle: false },
      source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: m.images.map((f) => C.fileUrl(it.id, f.name, f.v)) },
      post_mode: 'DIRECT_POST', media_type: 'PHOTO' });
  }
  const f = C.media(it).video;
  return api('/post/publish/video/init/', tok, {
    post_info: { title: tidy(C.captionFor(it, 'tt')).slice(0, 2200), privacy_level: privacy, disable_duet: !!info.duet_disabled, disable_comment: !!info.comment_disabled,
      disable_stitch: !!info.stitch_disabled, video_cover_timestamp_ms: 1000, brand_content_toggle: false, brand_organic_toggle: false },
    source_info: { source: 'PULL_FROM_URL', video_url: C.fileUrl(it.id, f.name, f.v) } });
}

// One entry: { done: { postId, url, privacy, note } } or { wait: { publishId, privacy } }.
// opts.deadline (ms), opts.keep(patch): saves the publish_id in the entry at once (never posted twice).
async function post(it, e, opts) {
  opts = opts || {};
  const deadline = opts.deadline || Date.now() + 40e3;
  const tok = await token();
  let pid = e.publishId || '', privacy = e.privacy || '';
  if (!pid) {
    if (!isPhoto(it) && !C.media(it).video) throw stop('Reel-ul n-are MP4');
    if (isPhoto(it) && C.media(it).images.length < 2) throw stop('Slideshow-ul n-are poze');
    const ci = await api('/post/publish/creator_info/query/', tok, {});
    if (!ci.ok) throw failOf(ci, 'contul');
    const info = ci.data || {};
    const f = C.media(it).video;
    if (f && info.max_video_post_duration_sec && f.dur > Number(info.max_video_post_duration_sec)) throw stop('Reel-ul are ' + Math.round(f.dur) + ' s, TikTok primește acum maxim ' + info.max_video_post_duration_sec + ' s');
    const c = await connection();
    privacy = bestPrivacy(info.privacy_level_options, c);
    let r = await init(tok, it, privacy, info);
    // an app TikTok hasn't audited yet posts only privately: once more as SELF_ONLY, remembered for the next posts
    if (!r.ok && r.code === 'unaudited_client_can_only_post_to_private_accounts' && privacy !== 'SELF_ONLY') {
      await patchConn((x) => { x.unauditedAt = new Date().toISOString(); });
      privacy = 'SELF_ONLY';
      r = await init(tok, it, privacy, info);
    }
    if (!r.ok) throw failOf(r, 'pornirea postării');
    pid = String(r.data.publish_id || '');
    if (!pid) throw stop('TikTok n-a dat un publish_id');
    if (opts.keep) await opts.keep({ publishId: pid, privacy });
  }
  for (;;) {
    const s = await api('/post/publish/status/fetch/', tok, { publish_id: pid });
    if (!s.ok) {
      if (s.code === 'invalid_publish_id') throw stop('TikTok nu mai știe postarea (' + pid + ')', false, true);
      throw failOf(s, 'starea postării');
    }
    const st = String(s.data.status || '');
    if (st === 'PUBLISH_COMPLETE') {
      const pub = idsIn(s.text, 'publicaly_available_post_id').concat(idsIn(s.text, 'publicly_available_post_id'))[0] || '';
      let url = '';
      if (pub) {
        const q = await api('/video/query/', tok, { filters: { video_ids: [pub] } }, { fields: 'id,share_url' }).catch(() => null);
        const v = q && q.ok && Array.isArray(q.data.videos) ? q.data.videos[0] : null;
        url = (v && v.share_url) || '';
      }
      return { done: { postId: pub || pid, publishId: pid, url, privacy, note: privacy === 'SELF_ONLY' ? PRIVATE_NOTE : '' } };
    }
    if (st === 'FAILED') throw stop('TikTok n-a publicat: ' + String(s.data.fail_reason || 'fără motiv').slice(0, 200), false, true);
    if (Date.now() + 5000 > deadline) return { wait: { publishId: pid, privacy } };
    await sleep(5000);
  }
}

// a video's numbers ({} for a private post, which has no public id, or when TikTok doesn't answer)
async function stats(videoId) {
  if (!/^\d{6,25}$/.test(String(videoId || ''))) return {};
  const tok = await token();
  const r = await api('/video/query/', tok, { filters: { video_ids: [String(videoId)] } }, { fields: 'id,view_count,like_count,comment_count,share_count' });
  const v = r.ok && Array.isArray(r.data.videos) ? r.data.videos[0] : null;
  if (!v) return {};
  const out = {};
  [['views', 'view_count'], ['likes', 'like_count'], ['comments', 'comment_count'], ['shares', 'share_count']].forEach(([k, t]) => { if (Number.isFinite(Number(v[t])) && v[t] != null) out[k] = Number(v[t]); });
  return out;
}
async function followers() {
  const c = await connection();
  if (!c.accessToken || c.lost) return null;
  const u = await userOf(await token()).catch(() => null);
  return u && u.follower_count != null && Number.isFinite(Number(u.follower_count)) ? Number(u.follower_count) : null;
}

module.exports = { APP_KEY, CONN_KEY, SCOPES, NEEDS, PRIVATE_NOTE, redirectUri, app, saveApp, authUrl, connect, token, disconnect, access, status, setNote,
  photoTexts, bestPrivacy, idsIn, post, stats, followers };
