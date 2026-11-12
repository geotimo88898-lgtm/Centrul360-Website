// Conținut on YouTube Shorts (the owner, 12.11): the clinic's channel, through the owner's own Google Cloud OAuth client
// (Integrări → YouTube: the client ID and secret, then „Conectează cu Google”). The posting run (content-post.js)
// takes a reel's YouTube entry like Instagram's: claimed, posted, resumed on the next run, tried again, held.
//  - The login (api/yt-oauth.js): Google's consent screen with youtube.upload, youtube.readonly and youtube.force-ssl
//    (the first comment), offline, so a refresh token comes back; the access token (an hour) is made again from it.
//    A refresh Google refuses (revoked, the client changed, a 7-day test token): the connection is marked lost, the
//    entries wait, Integrări says to connect again.
//  - The upload: a resumable session (snippet: the title from the YouTube text's first line with #shorts, the rest as
//    the description, Howto & Style; status: public, not made for kids), then the MP4 in pieces of 16 MB, each read
//    from its public URL (api/content-file.js, a Range request) and sent with its Content-Range. The session is kept
//    in the entry (a week at Google), so a run that runs out of time, or fails, goes on from the last byte Google has.
//  - Until Google verifies the app, YouTube keeps every upload private: the answer's status.privacyStatus says so and
//    the entry gets the note PRIVATE_NOTE (the owner hears it once, content-post.js).
//  - Numbers: videos?part=statistics; followers: the channel's subscriberCount.
// data/yt-app.json { clientId, clientSecret, savedAt, savedBy } and data/yt-connection.json { refreshToken,
// accessToken, expiresAt, scopes, channelId, channelTitle, connectedAt, connectedBy, lost }: private in the store, only
// read by the server; Integrări never gets a token or the secret.

const crypto = require('crypto');
const { readJSON, writeJSON } = require('./store');
const C = require('./content');

const APP_KEY = 'data/yt-app.json';
const CONN_KEY = 'data/yt-connection.json';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/youtube/v3';
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
const S = (x) => 'https://www.googleapis.com/auth/' + x;
const SCOPES = [S('youtube.upload'), S('youtube.readonly'), S('youtube.force-ssl')];
const NEEDS = [S('youtube.upload')];
const COMMENT_SCOPE = S('youtube.force-ssl');
const CHUNK = 16 * 1024 * 1024; // a multiple of 256 KB, as Google wants every piece but the last
const PRIVATE_NOTE = 'YouTube le pune private până la verificarea aplicației';
const redirectUri = () => C.ORIGIN() + '/api/yt-oauth?cb=1';
const short = (s) => String(s || '').replace(/^https:\/\/www\.googleapis\.com\/auth\//, '');

// an error the posting run understands: `access` waits without spending a try (the login, a permission, the
// quota), `drop` forgets the upload session (it can't go on)
const stop = (msg, access, drop) => Object.assign(new Error(String(msg).slice(0, 300)), { access: !!access, drop: !!drop });
const gMsg = (j, status) => {
  const e = (j && j.error) || {};
  const why = Array.isArray(e.errors) && e.errors[0] ? e.errors[0].reason : '';
  return String((typeof e === 'string' ? (j.error_description || e) : e.message) || why || 'Google a răspuns ' + status).slice(0, 240);
};
const gReason = (j) => { const e = (j && j.error) || {}; return (Array.isArray(e.errors) && e.errors[0] && e.errors[0].reason) || (typeof e === 'string' ? e : '') || ''; };
// what can't go better by trying again in 45 minutes: the login, a permission, the day's quota
const isAccess = (status, j) => status === 401 || ['insufficientPermissions', 'forbidden', 'youtubeSignupRequired', 'quotaExceeded', 'uploadLimitExceeded', 'dailyLimitExceeded', 'rateLimitExceeded', 'authError', 'invalid_grant'].includes(gReason(j));

// ---------------------------------------------------------------- the OAuth state (also TikTok's, api/tt-oauth.js)
// "<expiry>.<nonce>.<purpose>" signed with PORTAL_SECRET (the portal's session secret), so the callback knows the
// login started here, in the last 10 minutes, for this network
function signState(purpose) {
  const payload = Buffer.from(Date.now() + 10 * 60e3 + '.' + crypto.randomBytes(12).toString('hex') + '.' + purpose, 'utf8').toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', process.env.PORTAL_SECRET || '').update(payload).digest('hex');
}
function checkState(state, purpose) {
  const s = String(state || ''), i = s.lastIndexOf('.');
  if (i < 1 || !process.env.PORTAL_SECRET) return false;
  const payload = s.slice(0, i), sig = Buffer.from(s.slice(i + 1), 'hex');
  const want = crypto.createHmac('sha256', process.env.PORTAL_SECRET).update(payload).digest();
  if (sig.length !== want.length || !crypto.timingSafeEqual(sig, want)) return false;
  const [exp, , p] = Buffer.from(payload, 'base64url').toString('utf8').split('.');
  return Number(exp) >= Date.now() && p === purpose;
}

// ---------------------------------------------------------------- the client and the connection
async function app() { const a = (await readJSON(APP_KEY, {})) || {}; return { clientId: a.clientId || '', clientSecret: a.clientSecret || '' }; }
const connection = async () => (await readJSON(CONN_KEY, {})) || {};
const okClientId = (x) => /^[\w.-]{8,120}\.apps\.googleusercontent\.com$/.test(x);
const okSecret = (x) => /^[\w-]{10,100}$/.test(x);
// the owner's OAuth client; an empty secret keeps the saved one; another client means connecting again
async function saveApp(input, by) {
  const clientId = String((input && input.clientId) || '').trim(), clientSecret = String((input && input.clientSecret) || '').trim();
  if (!okClientId(clientId)) throw C.fail('invalid_client_id');
  if (clientSecret && !okSecret(clientSecret)) throw C.fail('invalid_client_secret');
  const prev = (await readJSON(APP_KEY, {})) || {};
  const same = prev.clientId === clientId;
  if (!clientSecret && !(same && prev.clientSecret)) throw C.fail('missing_client_secret');
  await writeJSON(APP_KEY, { clientId, clientSecret: clientSecret || prev.clientSecret, savedAt: new Date().toISOString(), savedBy: by || '' });
  if (!same) await writeJSON(CONN_KEY, {});
}
async function authUrl() {
  const a = await app();
  if (!a.clientId || !a.clientSecret) throw C.fail('yt_not_configured');
  return AUTH_URL + '?' + new URLSearchParams({ client_id: a.clientId, redirect_uri: redirectUri(), response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: signState('yt') });
}
async function tokenCall(params) {
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !!j.access_token, status: r.status, j };
}
async function get(path, tok, params) {
  const r = await fetch(API + path + '?' + new URLSearchParams(params || {}), { headers: { Authorization: 'Bearer ' + tok } });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !j.error, status: r.status, j };
}
async function channelOf(tok) {
  const r = await get('/channels', tok, { part: 'snippet,statistics', mine: 'true' });
  const ch = r.ok && Array.isArray(r.j.items) ? r.j.items[0] : null;
  return ch ? { id: ch.id, title: (ch.snippet && ch.snippet.title) || '', followers: ch.statistics && !ch.statistics.hiddenSubscriberCount ? Number(ch.statistics.subscriberCount) : null } : null;
}
// Google's answer to the consent screen: the code made into tokens, the channel read, all kept
async function connect(code, by) {
  const a = await app();
  if (!a.clientId || !a.clientSecret) return { error: 'notconfigured' };
  const t = await tokenCall({ code: String(code || ''), client_id: a.clientId, client_secret: a.clientSecret, redirect_uri: redirectUri(), grant_type: 'authorization_code' });
  if (!t.ok) { console.error('yt connect: token', t.status, gMsg(t.j, t.status)); return { error: 'error' }; }
  const prev = await connection();
  const refreshToken = t.j.refresh_token || prev.refreshToken || '';
  if (!refreshToken) return { error: 'norefresh' };
  const scopes = String(t.j.scope || '').split(/\s+/).filter(Boolean);
  const ch = await channelOf(t.j.access_token).catch(() => null);
  if (!ch) return { error: 'nochannel' };
  await writeJSON(CONN_KEY, { refreshToken, accessToken: t.j.access_token, expiresAt: Date.now() + (Number(t.j.expires_in) || 3600) * 1000, scopes,
    channelId: ch.id, channelTitle: ch.title, connectedAt: new Date().toISOString(), connectedBy: by || '', lost: '' });
  return { ok: true, channel: ch.title };
}
// a valid access token (made again from the refresh token a minute before it ends)
async function token() {
  const c = await connection();
  if (!c.refreshToken) throw stop('YouTube nu e conectat (Integrări)', true);
  if (c.lost) throw stop('YouTube s-a deconectat: ' + c.lost + ' (Integrări → YouTube → Conectează)', true);
  if (c.accessToken && Number(c.expiresAt) - 60e3 > Date.now()) return c.accessToken;
  const a = await app();
  if (!a.clientId || !a.clientSecret) throw stop('Clientul Google nu e setat (Integrări → YouTube)', true);
  const t = await tokenCall({ client_id: a.clientId, client_secret: a.clientSecret, refresh_token: c.refreshToken, grant_type: 'refresh_token' });
  if (!t.ok) {
    const why = gMsg(t.j, t.status);
    if (t.status === 400 || t.status === 401) { c.lost = why; await writeJSON(CONN_KEY, c); }
    throw stop('YouTube: ' + why, true);
  }
  c.accessToken = t.j.access_token; c.expiresAt = Date.now() + (Number(t.j.expires_in) || 3600) * 1000;
  if (t.j.scope) c.scopes = String(t.j.scope).split(/\s+/).filter(Boolean);
  await writeJSON(CONN_KEY, c);
  return c.accessToken;
}
async function disconnect() {
  const c = await connection();
  const t = c.refreshToken || c.accessToken;
  if (t) await fetch(REVOKE_URL + '?' + new URLSearchParams({ token: t }), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).catch(() => null);
  await writeJSON(CONN_KEY, {});
}
// what the posting run needs to know (no call to Google: the token is checked when it's used)
async function access() {
  const [a, c] = await Promise.all([app(), connection()]);
  const scopes = Array.isArray(c.scopes) ? c.scopes : [];
  return { configured: !!(a.clientId && a.clientSecret), connected: !!(c.refreshToken && !c.lost && a.clientId), lost: c.lost || '', channel: c.channelTitle || '',
    channelId: c.channelId || '', scopes: scopes.map(short), missing: NEEDS.filter((s) => !scopes.includes(s)).map(short), comments: scopes.includes(COMMENT_SCOPE) };
}
// Integrări → YouTube
async function status() {
  const [a, c, x] = await Promise.all([app(), connection(), access()]);
  return Object.assign(x, { clientId: a.clientId, hasSecret: !!a.clientSecret, redirectUri: redirectUri(), connectedAt: c.connectedAt || '', note: c.note || '' });
}

// ---------------------------------------------------------------- the upload
const bytes = (s) => Buffer.byteLength(s, 'utf8');
function cutBytes(s, n) { while (bytes(s) > n) s = s.slice(0, -1); return s; }
const tidy = (s) => String(s || '').replace(/[<>]/g, '').replace(/\r/g, '');
// the title: the YouTube text's first line (or the topic) with #shorts, at most 100; the rest is the description
function textsOf(it) {
  const cap = tidy(C.captionFor(it, 'yt')).trim();
  const lines = cap.split('\n');
  const k = lines.findIndex((l) => l.trim());
  let first = (k >= 0 ? lines[k] : tidy(it.topic || it.rubric || 'Centrul360')).replace(/#shorts\b/ig, '').replace(/\s+/g, ' ').trim();
  if (first.length > 92) first = first.slice(0, 92).replace(/\s+\S*$/, '').replace(/[\s,.;:!?-]+$/, '') || first.slice(0, 92);
  const title = (first ? first + ' ' : '') + '#shorts';
  let desc = k >= 0 ? lines.slice(k + 1).join('\n').trim() : '';
  const general = tidy(it.caption).trim();
  if (!desc && general && general !== cap) desc = general;
  const tags = [...new Set((cap + ' ' + desc).match(/#[\p{L}\p{N}_]+/gu) || [])].map((t) => t.slice(1)).filter((t) => t.toLowerCase() !== 'shorts').slice(0, 12);
  return { title, description: cutBytes(desc, 4900), tags };
}
const metaOf = (it) => {
  const t = textsOf(it);
  return { snippet: { title: t.title, description: t.description, tags: t.tags, categoryId: '26', defaultLanguage: 'ro', defaultAudioLanguage: 'ro' },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false, embeddable: true, license: 'youtube' } };
};
// Google's 308 says what it has: "bytes=0-N" → go on from N+1 (none: from the start)
const nextFrom = (range) => { const m = /bytes=0-(\d+)/.exec(String(range || '')); return m ? Number(m[1]) + 1 : 0; };
const doneOf = (j) => {
  const id = String((j && j.id) || '');
  if (!id) throw stop('YouTube n-a dat un id pentru video', false, true);
  const privacy = (j.status && j.status.privacyStatus) || '';
  return { done: { postId: id, url: 'https://www.youtube.com/shorts/' + id, privacy, note: privacy && privacy !== 'public' ? PRIVATE_NOTE : '' } };
};
async function fail(r, what) {
  const j = await r.json().catch(() => ({}));
  throw stop(what + ': ' + gMsg(j, r.status), isAccess(r.status, j), [400, 404, 410].includes(r.status));
}

// One reel: { done: { postId, url, privacy, note } } or { wait: { upload } } (out of time, the next run goes on).
// opts.deadline (ms), opts.keep(patch): saves the upload session in the entry at once.
async function post(it, e, opts) {
  opts = opts || {};
  const deadline = opts.deadline || Date.now() + 40e3;
  const f = C.media(it).video;
  if (!f) throw stop('Reel-ul n-are MP4');
  const src = C.fileUrl(it.id, f.name, f.v);
  const tok = await token();
  const auth = { Authorization: 'Bearer ' + tok };
  let size = Number(f.size) || 0;
  if (!size) {
    const h = await fetch(src, { method: 'HEAD' });
    size = Number(h.headers.get('content-length')) || 0;
    if (!h.ok || !size) throw stop('Fișierul nu s-a putut citi (' + h.status + ')');
  }
  let up = e.upload && e.upload.uri && e.upload.v === f.v && e.upload.size === size ? e.upload : null;
  let from = 0;
  if (up) {
    // where the session is: Google answers with what it has, or the video when it already has all of it
    const q = await fetch(up.uri, { method: 'PUT', headers: Object.assign({ 'Content-Range': 'bytes */' + size }, auth), body: '', redirect: 'manual' });
    if (q.status === 200 || q.status === 201) return doneOf(await q.json().catch(() => ({})));
    if (q.status === 308) from = nextFrom(q.headers.get('range'));
    else if (q.status === 404 || q.status === 410) up = null;
    else await fail(q, 'Urcarea pe YouTube');
  }
  if (!up) {
    const r = await fetch(UPLOAD_URL, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(size), 'X-Upload-Content-Type': 'video/mp4' }, auth),
      body: JSON.stringify(metaOf(it)) });
    if (!r.ok) await fail(r, 'Pornirea urcării pe YouTube');
    const uri = r.headers.get('location');
    if (!uri) throw stop('YouTube n-a dat adresa de urcare');
    up = { uri, v: f.v, size, at: new Date().toISOString() };
    if (opts.keep) await opts.keep({ upload: up });
  }
  const step = module.exports.CHUNK || CHUNK;
  while (from < size) {
    if (Date.now() > deadline) return { wait: { upload: up } };
    const to = Math.min(size, from + step) - 1;
    const part = await fetch(src, { headers: { Range: 'bytes=' + from + '-' + to } });
    if (!(part.status === 206 || (part.status === 200 && from === 0 && to === size - 1))) throw stop('Fișierul nu s-a putut citi (' + part.status + ')');
    const buf = Buffer.from(await part.arrayBuffer());
    if (buf.length !== to - from + 1) throw stop('Fișierul s-a citit doar pe jumătate (' + buf.length + ' din ' + (to - from + 1) + ')');
    const r = await fetch(up.uri, { method: 'PUT', headers: Object.assign({ 'Content-Type': 'video/mp4', 'Content-Range': 'bytes ' + from + '-' + to + '/' + size }, auth), body: buf, redirect: 'manual' });
    if (r.status === 200 || r.status === 201) return doneOf(await r.json().catch(() => ({})));
    if (r.status !== 308) await fail(r, 'Urcarea pe YouTube');
    const next = nextFrom(r.headers.get('range'));
    if (next <= from) throw stop('YouTube n-a primit bucata ' + from + '-' + to);
    from = next;
  }
  // every byte is there but no answer with the video: ask the session once more
  const q = await fetch(up.uri, { method: 'PUT', headers: Object.assign({ 'Content-Range': 'bytes */' + size }, auth), body: '', redirect: 'manual' });
  if (q.status === 200 || q.status === 201) return doneOf(await q.json().catch(() => ({})));
  return { wait: { upload: up } };
}

// what the last post said about its privacy, for Integrări ('' when it went public)
async function setNote(note) {
  const c = await connection();
  if (!c.refreshToken || (c.note || '') === (note || '')) return;
  c.note = note || '';
  await writeJSON(CONN_KEY, c);
}

// the first comment under a Short (needs youtube.force-ssl): its id
async function comment(videoId, text) {
  const tok = await token();
  const r = await fetch(API + '/commentThreads?part=snippet', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ snippet: { videoId: String(videoId), topLevelComment: { snippet: { textOriginal: String(text) } } } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw stop('Comentariul: ' + gMsg(j, r.status));
  return String(j.id);
}

// a Short's numbers ({} when Google doesn't answer: nothing is overwritten with zero), and its privacy as YouTube
// keeps it now (`privacy`, not a number: content-post.js takes it out)
async function stats(videoId) {
  if (!videoId) return {};
  const tok = await token();
  const r = await get('/videos', tok, { part: 'statistics,status', id: String(videoId) });
  const item = r.ok && Array.isArray(r.j.items) ? r.j.items[0] : null;
  if (!item) return {};
  const v = item.statistics || {}, out = {};
  [['views', 'viewCount'], ['likes', 'likeCount'], ['comments', 'commentCount']].forEach(([k, g]) => { if (v[g] != null && Number.isFinite(Number(v[g]))) out[k] = Number(v[g]); });
  if (item.status && item.status.privacyStatus) out.privacy = item.status.privacyStatus;
  return out;
}
// the channel's subscribers (null: not connected, hidden, or Google didn't answer)
async function followers() {
  const c = await connection();
  if (!c.refreshToken || c.lost) return null;
  const ch = await channelOf(await token()).catch(() => null);
  return ch ? ch.followers : null;
}

module.exports = { APP_KEY, CONN_KEY, SCOPES, NEEDS, PRIVATE_NOTE, CHUNK, redirectUri, signState, checkState, app, saveApp, authUrl, connect, token, disconnect, access, status,
  textsOf, metaOf, nextFrom, post, setNote, comment, stats, followers };
