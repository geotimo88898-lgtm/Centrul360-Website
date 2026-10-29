// Instagram Direct in Mesaje (29.10, the owner: "să-mi apară și mesajele de pe Insta acolo"). The clinic's Instagram
// account is linked to its Facebook Page, so its messages come through the same Meta app as the leads (Messenger
// Platform: the Page's token with instagram_manage_messages; no App Review for the business's own account). Meta
// announces each message on the leads' webhook (object "instagram"); an answer goes back from the portal inside her
// 24 hours, like on WhatsApp (after that, only from the Instagram app).
//   ingest(payload)        a webhook delivery: her messages, ours sent from the Instagram app (echoes), "seen"
//   send(id, text, by)     an answer from the portal
//   view(id) / markRead    one conversation, for Mesaje
//   setup(origin)          the app listens to Instagram (its webhook), the Page has the app; once, and after a login
//   status()               where it stands (the login's permissions, the Page's account, the webhooks)
// data/instagram-conversations.json: [{ id: <her Instagram id>, name, username, lastMessageAt, unreadCount,
//   messages: [{ id, direction: in|out, type: text|other, text, media?, timestamp, status, sentBy? }] }]

const { readJSON, writeJSON, readJSONTagged, writeJSONIf, writeBinary } = require('./store');
const { loadConnection, appCreds } = require('./facebook');
const ads = require('./meta-ads');

const KEY = 'data/instagram-conversations.json';
const PREFIX = 'ig:';
const NEEDS = ['instagram_basic', 'instagram_manage_messages', 'pages_manage_metadata', 'pages_messaging'];
const WINDOW_MS = 24 * 60 * 60 * 1000;
const WORDS = { image: 'Poză', video: 'Video', audio: 'Mesaj vocal', file: 'Fișier', share: 'Postare trimisă', story_mention: 'Te-a menționat într-un story', ig_reel: 'Reel trimis', reel: 'Reel trimis' };
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/ogg': 'ogg' };
const g = (method, path, token, params) => ads.call(method, path, token, params);
const err = (j) => ((j && j.error) || {}).error_user_msg || ((j && j.error) || {}).message || 'Meta n-a răspuns';

// a change to the conversations that never overwrites one made meanwhile (two messages at once)
async function update(fn) {
  for (let i = 0; i < 5; i++) {
    const { data, etag } = await readJSONTagged(KEY, []);
    const list = Array.isArray(data) ? data : [];
    const out = await fn(list);
    if (out === false) return list;
    if (await writeJSONIf(KEY, list, etag)) return list;
  }
  throw new Error('instagram: conversations busy');
}
const lastInboundAt = (c) => (c.messages || []).filter((m) => m.direction === 'in').reduce((a, m) => (m.timestamp > a ? m.timestamp : a), '');
const within24h = (c) => { const t = lastInboundAt(c); return !!t && Date.now() - Date.parse(t) < WINDOW_MS; };
const windowEnds = (c) => (within24h(c) ? new Date(Date.parse(lastInboundAt(c)) + WINDOW_MS).toISOString() : '');

// her photo or video, kept by the portal (Instagram's own links stop working after a while)
async function keepMedia(url, mid) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const mime = String(r.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const ext = EXT[mime];
    const buf = Buffer.from(await r.arrayBuffer());
    if (!ext || buf.length > 25e6) return null;
    const path = 'wa-media/ig-' + String(mid).replace(/[^\w-]/g, '').slice(-60) + '.' + ext;
    await writeBinary(path, buf, mime);
    return { mime, path };
  } catch (e) { return null; }
}

// One webhook delivery. Returns the messages that are new and hers (for the phones' ring).
async function ingest(payload) {
  const conn = await loadConnection(readJSON);
  const events = [];
  (payload.entry || []).forEach((e) => {
    (e.messaging || []).forEach((m) => events.push({ account: String(e.id || ''), m }));
    // the same message as a "change" (Meta's test button in the app's webhooks sends it so)
    (e.changes || []).forEach((ch) => { if (ch.field === 'messages' && ch.value) events.push({ account: String(e.id || ''), m: ch.value }); });
  });
  if (!events.length) return [];
  // what each message is, worked out before the write (the files are fetched once)
  const items = [];
  for (const { account, m } of events) {
    if (m.read && m.read.mid) { items.push({ kind: 'read', other: String((m.sender || {}).id || ''), mid: m.read.mid }); continue; }
    const msg = m.message;
    if (!msg || !msg.mid) continue;
    const echo = !!msg.is_echo || String((m.sender || {}).id) === account;
    const other = String(((echo ? m.recipient : m.sender) || {}).id || '');
    if (!other) continue;
    if (msg.is_deleted) { items.push({ kind: 'deleted', other, mid: msg.mid }); continue; }
    const att = (msg.attachments || [])[0];
    const type = att ? String(att.type || 'file') : '';
    let media = null;
    if (att && att.payload && att.payload.url && ['image', 'video', 'audio'].includes(type)) {
      const kept = await keepMedia(att.payload.url, msg.mid);
      media = kept ? { kind: type, mime: kept.mime, path: kept.path } : { kind: type, href: att.payload.url };
    }
    const story = msg.reply_to && msg.reply_to.story ? 'Răspuns la story: ' : '';
    const text = story + (msg.text || (att ? WORDS[type] || 'Atașament' : msg.is_unsupported ? 'Un mesaj pe care Instagram nu-l arată aici (vezi-l în aplicație)' : ''));
    items.push({ kind: 'msg', other, echo, msg: Object.assign({ id: msg.mid, direction: echo ? 'out' : 'in', type: att ? 'other' : 'text', text, timestamp: new Date(Number(m.timestamp) || Date.now()).toISOString(),
      status: echo ? 'sent' : 'received' }, media ? { media } : {}, echo ? { fromApp: true } : {}) });
  }
  const fresh = [];
  const list = await update((all) => {
    fresh.length = 0;
    let changed = false;
    for (const it of items) {
      let c = all.find((x) => x.id === it.other);
      if (it.kind === 'read') {
        if (!c) continue;
        const at = (c.messages.find((x) => x.id === it.mid) || {}).timestamp;
        c.messages.forEach((x) => { if (x.direction === 'out' && at && x.timestamp <= at && x.status !== 'read') { x.status = 'read'; x.readAt = new Date().toISOString(); changed = true; } });
        continue;
      }
      if (it.kind === 'deleted') {
        if (!c) continue;
        const x = c.messages.find((y) => y.id === it.mid);
        if (x && !x.deleted) { x.deleted = true; x.text = 'Mesaj șters'; delete x.media; changed = true; }
        continue;
      }
      if (!c) { c = { id: it.other, name: '', username: '', lastMessageAt: '', unreadCount: 0, messages: [] }; all.push(c); }
      // an answer sent from the portal comes back as an echo: already there
      if (c.messages.some((x) => x.id === it.msg.id)) continue;
      c.messages.push(it.msg);
      c.messages.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
      if (it.msg.timestamp > (c.lastMessageAt || '')) c.lastMessageAt = it.msg.timestamp;
      if (!it.echo) { c.unreadCount = (c.unreadCount || 0) + 1; fresh.push({ id: c.id, text: it.msg.text }); }
      changed = true;
    }
    return changed;
  });
  // her name and @ (asked once per person)
  const nameless = list.filter((c) => !c.username && !c.name && items.some((it) => it.other === c.id));
  if (nameless.length && conn.pageAccessToken) {
    const found = {};
    for (const c of nameless) {
      const r = await g('GET', '/' + c.id, conn.pageAccessToken, { fields: 'name,username' });
      if (r.ok) found[c.id] = { name: r.j.name || '', username: r.j.username || '' };
    }
    if (Object.keys(found).length) await update((all) => { all.forEach((c) => { if (found[c.id]) Object.assign(c, found[c.id]); }); return true; }).catch(() => {});
    fresh.forEach((f) => { const x = found[f.id]; if (x) f.name = x.name || (x.username ? '@' + x.username : ''); });
  }
  fresh.forEach((f) => { if (!f.name) { const c = list.find((x) => x.id === f.id) || {}; f.name = c.name || (c.username ? '@' + c.username : 'Instagram'); } });
  return fresh;
}

// her message rings on the phones like a WhatsApp one: the owner, the admins, reception (the account is both clinics')
async function ring(fresh) {
  if (!fresh.length) return;
  const { sendPush } = require('./push');
  const employees = (await readJSON('data/employees.json', [])).filter((e) => e.active !== false);
  const ids = ['admin'].concat(employees.filter((e) => e.role === 'admin' || e.role === 'receptie').map((e) => e.id));
  for (const f of fresh) {
    const text = f.text.length > 160 ? f.text.slice(0, 159) + '…' : f.text;
    await sendPush({ readJSON, writeJSON }, ids, { title: 'Instagram · ' + f.name, body: text, url: '/#mesaje', tag: 'msg-ig-' + f.id }).catch(() => {});
  }
}

// ---------------------------------------------------------------- Mesaje
const key = (c) => PREFIX + c.id;
const idOf = (k) => (String(k || '').startsWith(PREFIX) ? String(k).slice(PREFIX.length) : '');
const nameOf = (c) => c.name || (c.username ? '@' + c.username : 'Instagram');
function listItems(list) {
  return (list || []).map((c) => {
    const last = (c.messages || [])[c.messages.length - 1];
    return { phone: key(c), channel: 'ig', clientName: nameOf(c), username: c.username || '', location: '', lastMessageAt: c.lastMessageAt || '', unreadCount: c.unreadCount || 0,
      lastText: last ? last.text : '', lastDirection: last ? last.direction : '', lastStatus: last ? last.status : '', within24h: within24h(c) };
  });
}
async function list() { return listItems(await readJSON(KEY, [])); }
async function unread() { return (await readJSON(KEY, [])).filter((c) => c.unreadCount).length; }
// one conversation (read now: nothing new waiting)
async function view(k, nameOfEmployee) {
  const id = idOf(k);
  let c = (await readJSON(KEY, [])).find((x) => x.id === id);
  if (!c) return null;
  if (c.unreadCount) await update((all) => { const x = all.find((y) => y.id === id); if (!x || !x.unreadCount) return false; x.unreadCount = 0; c = x; return true; });
  return { ok: true, phone: key(c), channel: 'ig', clientName: nameOf(c), username: c.username || '', location: '', within24h: within24h(c), windowEnds: windowEnds(c),
    messages: (c.messages || []).map((m) => (m.sentBy ? Object.assign({}, m, { sentByName: nameOfEmployee(m.sentBy) }) : m)), lead: null, appointment: null };
}
// an answer from the portal, inside her 24 hours
async function send(k, text, by) {
  const id = idOf(k);
  const conn = await loadConnection(readJSON);
  if (!conn.pageAccessToken) return { error: 'Facebook nu e conectat.' };
  const c = (await readJSON(KEY, [])).find((x) => x.id === id);
  if (!c) return { error: 'Conversația nu mai există.', code: 404 };
  if (!within24h(c)) return { error: 'Au trecut 24 de ore de la ultimul ei mesaj: răspunde-i din aplicația Instagram.', code: 409 };
  // Instagram takes at most 1000 bytes in a message
  let t = String(text || '').trim();
  while (Buffer.byteLength(t) > 1000) t = t.slice(0, -1);
  if (!t) return { error: 'Scrie un mesaj.', code: 400 };
  const r = await g('POST', '/me/messages', conn.pageAccessToken, { recipient: { id }, message: { text: t } });
  if (!r.ok || !r.j.message_id) return { error: 'Instagram nu a trimis mesajul: ' + err(r.j), code: 502 };
  const msg = { id: r.j.message_id, direction: 'out', type: 'text', text: t, status: 'sent', timestamp: new Date().toISOString(), sentBy: by };
  await update((all) => { const x = all.find((y) => y.id === id); if (!x || x.messages.some((m) => m.id === msg.id)) return false; x.messages.push(msg); x.lastMessageAt = msg.timestamp; return true; });
  return { ok: true, id: msg.id };
}

// ---------------------------------------------------------------- Meta's side
// The app listens to Instagram's messages (its webhook, the same address as the leads') and the Page has the app with
// its messages. Nothing to do when it already is so.
async function setup(origin) {
  const [conn, creds] = await Promise.all([loadConnection(readJSON), appCreds(readJSON)]);
  if (!conn.pageId || !creds.appId || !creds.appSecret) return { error: 'not_connected' };
  const appToken = creds.appId + '|' + creds.appSecret;
  const out = {};
  const callback = String(origin || 'https://admin.centrul360.com').replace(/\/$/, '') + '/api/webhook-facebook-leads';
  const cur = await g('GET', '/' + creds.appId + '/subscriptions', appToken);
  const ig = ((cur.ok && cur.j.data) || []).find((s) => s.object === 'instagram');
  const has = ig && ig.active && ig.callback_url === callback && ['messages', 'messaging_seen'].every((f) => (ig.fields || []).some((x) => x.name === f));
  if (!has) {
    const r = await g('POST', '/' + creds.appId + '/subscriptions', appToken, { object: 'instagram', callback_url: callback, fields: 'messages,messaging_seen', verify_token: creds.verifyToken, include_values: 'true' });
    out.webhook = r.ok ? 'set' : err(r.j);
  } else out.webhook = 'ok';
  // the Page: the leads and the messages (Meta sends Instagram's only to an app the Page has)
  const s = await g('POST', '/' + conn.pageId + '/subscribed_apps', conn.pageAccessToken, { subscribed_fields: 'leadgen,messages' });
  if (s.ok) out.page = 'leadgen,messages';
  else {
    const l = await g('POST', '/' + conn.pageId + '/subscribed_apps', conn.pageAccessToken, { subscribed_fields: 'leadgen' });
    out.page = l.ok ? 'leadgen (mesaje: ' + err(s.j) + ')' : err(l.j);
  }
  return out;
}

async function status() {
  const [conn, creds] = await Promise.all([loadConnection(readJSON), appCreds(readJSON)]);
  if (!conn.pageId) return { error: 'not_connected' };
  const appToken = creds.appId && creds.appSecret ? creds.appId + '|' + creds.appSecret : '';
  const get = (path, token, params) => g('GET', path, token, params).then((r) => (r.ok ? r.j : { error: err(r.j) }));
  const [user, page, ig, apps, subs] = await Promise.all([
    conn.userToken && appToken ? get('/debug_token', appToken, { input_token: conn.userToken }) : null,
    appToken ? get('/debug_token', appToken, { input_token: conn.pageAccessToken }) : null,
    get('/' + conn.pageId, conn.pageAccessToken, { fields: 'name,instagram_business_account{id,username,name}' }),
    get('/' + conn.pageId + '/subscribed_apps', conn.pageAccessToken),
    appToken ? get('/' + creds.appId + '/subscriptions', appToken) : null,
  ]);
  const scopes = ((page && page.data) || {}).scopes || ((user && user.data) || {}).scopes || [];
  const hook = ((subs && subs.data) || []).find((s) => s.object === 'instagram');
  return {
    app: { id: creds.appId, configId: !!creds.configId, fromPortal: creds.fromPortal },
    missing: NEEDS.filter((s) => !scopes.includes(s)), scopes,
    account: ig && ig.instagram_business_account ? { id: ig.instagram_business_account.id, username: ig.instagram_business_account.username } : null,
    pageApps: ((apps && apps.data) || []).map((a) => ({ id: a.id, name: a.name, fields: a.subscribed_fields })),
    webhook: hook ? { active: hook.active, callback: hook.callback_url, fields: (hook.fields || []).map((f) => f.name) } : null,
    appWebhooks: ((subs && subs.data) || []).map((s) => ({ object: s.object, active: s.active, callback: s.callback_url, fields: (s.fields || []).map((f) => f.name) })),
    conversations: (await readJSON(KEY, [])).length,
  };
}

// Integrări → Facebook: whether the Instagram messages come into Mesaje, and what is missing if not
async function brief() {
  const s = await status();
  if (s.error) return { ready: false, error: s.error };
  const listening = !!(s.webhook && s.webhook.active && s.webhook.fields.includes('messages'));
  return { ready: !s.missing.length && listening, missing: s.missing, account: s.account ? s.account.username || '' : '', listening, configId: s.app.configId, conversations: s.conversations };
}

module.exports = { KEY, PREFIX, NEEDS, ingest, ring, list, unread, view, send, setup, status, brief, idOf };
