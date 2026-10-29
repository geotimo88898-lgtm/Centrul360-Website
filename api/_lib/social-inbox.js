// Instagram Direct and Facebook Messenger in Mesaje (29.10, the owner: "să-mi apară și mesajele de pe Insta acolo",
// "și din FB, nu doar din Insta"). The clinic's Instagram account is linked to its Facebook Page, so both come through
// the same Meta app as the leads (Messenger Platform, the Page's token: pages_messaging for Messenger,
// instagram_manage_messages for Instagram; no App Review for the business's own Page and account). Meta announces each
// message on the leads' webhook (object "instagram", or "page" with messaging); an answer goes back from the portal
// inside her 24 hours, like on WhatsApp (after that, only from the Instagram app / Meta Business Suite).
//   ingest(payload)        a webhook delivery: her messages, ours sent from the apps (echoes), "seen"
//   send(key, text, by)    an answer from the portal
//   view(key) / list()     for Mesaje (a conversation's key: "ig:<her id>" / "fb:<her id>", where WhatsApp has the phone)
//   setup(origin)          the app listens to both (its webhooks), the Page has the app with its messages
//   status() / brief()     where it stands (the login's permissions, the Page's account, the webhooks)
// data/social-conversations.json: [{ channel: ig|fb, id: <her id>, name, username, lastMessageAt, unreadCount,
//   messages: [{ id, direction: in|out, type: text|other, text, media?, timestamp, status, sentBy?, fromApp? }] }]

const { readJSON, writeJSON, readJSONTagged, writeJSONIf, writeBinary } = require('./store');
const { loadConnection, appCreds } = require('./facebook');
const ads = require('./meta-ads');

const KEY = 'data/social-conversations.json';
const CHANNELS = { ig: 'Instagram', fb: 'Facebook' };
const NEEDS = ['instagram_basic', 'instagram_manage_messages', 'pages_manage_metadata', 'pages_messaging'];
const PAGE_FIELDS = ['leadgen', 'messages', 'message_echoes', 'message_reads'];
const WINDOW_MS = 24 * 60 * 60 * 1000;
const WORDS = { image: 'Poză', video: 'Video', audio: 'Mesaj vocal', file: 'Fișier', share: 'Postare trimisă', story_mention: 'Te-a menționat într-un story', ig_reel: 'Reel trimis', reel: 'Reel trimis', fallback: 'Link trimis', location: 'Locație trimisă' };
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'jpg', 'video/mp4': 'mp4', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/ogg': 'ogg' };
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
  throw new Error('social inbox: conversations busy');
}
const lastInboundAt = (c) => (c.messages || []).filter((m) => m.direction === 'in').reduce((a, m) => (m.timestamp > a ? m.timestamp : a), '');
const within24h = (c) => { const t = lastInboundAt(c); return !!t && Date.now() - Date.parse(t) < WINDOW_MS; };
const windowEnds = (c) => (within24h(c) ? new Date(Date.parse(lastInboundAt(c)) + WINDOW_MS).toISOString() : '');
const find = (all, channel, id) => all.find((x) => x.channel === channel && x.id === id);

// her photo or video, kept by the portal (Meta's own links stop working after a while)
async function keepMedia(url, mid) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const mime = String(r.headers.get('content-type') || '').split(';')[0].toLowerCase();
    const ext = EXT[mime];
    const buf = Buffer.from(await r.arrayBuffer());
    if (!ext || buf.length > 25e6) return null;
    const path = 'wa-media/so-' + String(mid).replace(/[^\w-]/g, '').slice(-60) + '.' + ext;
    await writeBinary(path, buf, mime);
    return { mime, path };
  } catch (e) { return null; }
}

// One webhook delivery (object "instagram", or "page" with messaging). Returns the messages that are new and hers.
async function ingest(payload) {
  const channel = payload.object === 'instagram' ? 'ig' : payload.object === 'page' ? 'fb' : '';
  if (!channel) return [];
  const conn = await loadConnection(readJSON);
  const events = [];
  (payload.entry || []).forEach((e) => {
    (e.messaging || []).forEach((m) => events.push({ account: String(e.id || ''), m }));
    // the same message as a "change" (Meta's test button in the app's webhooks sends it so)
    (e.changes || []).forEach((ch) => { if (ch.field === 'messages' && ch.value) events.push({ account: String(e.id || ''), m: ch.value }); });
  });
  if (!events.length) return [];
  // what each event is, worked out before the write (the files are fetched once)
  const items = [];
  for (const { account, m } of events) {
    // "seen": Instagram names the message, Messenger the moment up to which she read
    if (m.read) { items.push({ kind: 'read', other: String((m.sender || {}).id || ''), mid: m.read.mid || '', upTo: m.read.watermark ? new Date(Number(m.read.watermark)).toISOString() : '' }); continue; }
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
    } else if (att && att.payload && att.payload.url && type === 'file') media = { kind: 'document', href: att.payload.url, filename: 'Fișier' };
    const story = msg.reply_to && msg.reply_to.story ? 'Răspuns la story: ' : '';
    const text = story + (msg.text || (att ? WORDS[type] || 'Atașament' : msg.is_unsupported ? 'Un mesaj pe care ' + CHANNELS[channel] + ' nu-l arată aici (vezi-l în aplicație)' : ''));
    items.push({ kind: 'msg', other, echo, msg: Object.assign({ id: msg.mid, direction: echo ? 'out' : 'in', type: att ? 'other' : 'text', text, timestamp: new Date(Number(m.timestamp) || Date.now()).toISOString(),
      status: echo ? 'sent' : 'received' }, media ? { media } : {}, echo ? { fromApp: true } : {}) });
  }
  const fresh = [];
  const list = await update((all) => {
    fresh.length = 0;
    let changed = false;
    for (const it of items) {
      let c = find(all, channel, it.other);
      if (it.kind === 'read') {
        if (!c) continue;
        const at = it.upTo || (c.messages.find((x) => x.id === it.mid) || {}).timestamp;
        c.messages.forEach((x) => { if (x.direction === 'out' && at && x.timestamp <= at && x.status !== 'read') { x.status = 'read'; x.readAt = new Date().toISOString(); changed = true; } });
        continue;
      }
      if (it.kind === 'deleted') {
        if (!c) continue;
        const x = c.messages.find((y) => y.id === it.mid);
        if (x && !x.deleted) { x.deleted = true; x.text = 'Mesaj șters'; delete x.media; changed = true; }
        continue;
      }
      if (!c) { c = { channel, id: it.other, name: '', username: '', lastMessageAt: '', unreadCount: 0, messages: [] }; all.push(c); }
      // an answer sent from the portal comes back as an echo: already there
      if (c.messages.some((x) => x.id === it.msg.id)) continue;
      c.messages.push(it.msg);
      c.messages.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
      if (it.msg.timestamp > (c.lastMessageAt || '')) c.lastMessageAt = it.msg.timestamp;
      if (!it.echo) { c.unreadCount = (c.unreadCount || 0) + 1; fresh.push({ channel, id: c.id, text: it.msg.text }); }
      changed = true;
    }
    return changed;
  });
  // her name (and @ on Instagram), asked once per person
  const nameless = list.filter((c) => c.channel === channel && !c.username && !c.name && items.some((it) => it.other === c.id));
  if (nameless.length && conn.pageAccessToken) {
    const found = {};
    for (const c of nameless) {
      const r = await g('GET', '/' + c.id, conn.pageAccessToken, { fields: channel === 'ig' ? 'name,username' : 'name' });
      if (r.ok) found[c.id] = { name: r.j.name || '', username: r.j.username || '' };
    }
    if (Object.keys(found).length) await update((all) => { all.forEach((c) => { if (c.channel === channel && found[c.id]) Object.assign(c, found[c.id]); }); return true; }).catch(() => {});
    fresh.forEach((f) => { const x = found[f.id]; if (x) f.name = x.name || (x.username ? '@' + x.username : ''); });
  }
  fresh.forEach((f) => { if (!f.name) { const c = find(list, f.channel, f.id) || {}; f.name = nameOf(c); } });
  return fresh;
}

// her message rings on the phones like a WhatsApp one: the owner, the admins, reception (the Page is both clinics')
async function ring(fresh) {
  if (!fresh.length) return;
  const { sendPush } = require('./push');
  const employees = (await readJSON('data/employees.json', [])).filter((e) => e.active !== false);
  const ids = ['admin'].concat(employees.filter((e) => e.role === 'admin' || e.role === 'receptie').map((e) => e.id));
  for (const f of fresh) {
    const text = f.text.length > 160 ? f.text.slice(0, 159) + '…' : f.text;
    await sendPush({ readJSON, writeJSON }, ids, { title: CHANNELS[f.channel] + ' · ' + f.name, body: text, url: '/#mesaje', tag: 'msg-' + f.channel + '-' + f.id }).catch(() => {});
  }
}

// ---------------------------------------------------------------- Mesaje
const key = (c) => c.channel + ':' + c.id;
// "ig:123" / "fb:123" → { channel, id }; anything else (a phone) → null
const parse = (k) => { const m = /^(ig|fb):(\d{3,40})$/.exec(String(k || '')); return m ? { channel: m[1], id: m[2] } : null; };
const isKey = (k) => !!parse(k);
function nameOf(c) { return c.name || (c.username ? '@' + c.username : CHANNELS[c.channel] || 'Mesaj'); }
function listItems(list) {
  return (list || []).map((c) => {
    const last = (c.messages || [])[c.messages.length - 1];
    return { phone: key(c), channel: c.channel, clientName: nameOf(c), username: c.username || '', location: '', lastMessageAt: c.lastMessageAt || '', unreadCount: c.unreadCount || 0,
      lastText: last ? last.text : '', lastDirection: last ? last.direction : '', lastStatus: last ? last.status : '', within24h: within24h(c) };
  });
}
async function list() { return listItems(await readJSON(KEY, [])); }
async function unread() { return (await readJSON(KEY, [])).filter((c) => c.unreadCount).length; }
// one conversation (read now: nothing new waiting)
async function view(k, nameOfEmployee) {
  const p = parse(k);
  if (!p) return null;
  let c = find(await readJSON(KEY, []), p.channel, p.id);
  if (!c) return null;
  if (c.unreadCount) await update((all) => { const x = find(all, p.channel, p.id); if (!x || !x.unreadCount) return false; x.unreadCount = 0; c = x; return true; });
  return { ok: true, phone: key(c), channel: c.channel, clientName: nameOf(c), username: c.username || '', location: '', within24h: within24h(c), windowEnds: windowEnds(c),
    messages: (c.messages || []).map((m) => (m.sentBy ? Object.assign({}, m, { sentByName: nameOfEmployee(m.sentBy) }) : m)), lead: null, appointment: null };
}
// an answer from the portal, inside her 24 hours
async function send(k, text, by) {
  const p = parse(k);
  if (!p) return { error: 'Conversație necunoscută.', code: 400 };
  const conn = await loadConnection(readJSON);
  if (!conn.pageAccessToken) return { error: 'Facebook nu e conectat.' };
  const c = find(await readJSON(KEY, []), p.channel, p.id);
  if (!c) return { error: 'Conversația nu mai există.', code: 404 };
  const app = p.channel === 'ig' ? 'aplicația Instagram' : 'Meta Business Suite (sau Messenger)';
  if (!within24h(c)) return { error: 'Au trecut 24 de ore de la ultimul ei mesaj: răspunde-i din ' + app + '.', code: 409 };
  // Instagram takes at most 1000 bytes in a message, Messenger 2000 characters
  let t = String(text || '').trim();
  if (p.channel === 'ig') while (Buffer.byteLength(t) > 1000) t = t.slice(0, -1);
  else t = t.slice(0, 2000);
  if (!t) return { error: 'Scrie un mesaj.', code: 400 };
  const r = await g('POST', '/me/messages', conn.pageAccessToken, Object.assign({ recipient: { id: p.id }, message: { text: t } }, p.channel === 'fb' ? { messaging_type: 'RESPONSE' } : {}));
  if (!r.ok || !r.j.message_id) return { error: CHANNELS[p.channel] + ' nu a trimis mesajul: ' + err(r.j), code: 502 };
  const msg = { id: r.j.message_id, direction: 'out', type: 'text', text: t, status: 'sent', timestamp: new Date().toISOString(), sentBy: by };
  await update((all) => { const x = find(all, p.channel, p.id); if (!x || x.messages.some((m) => m.id === msg.id)) return false; x.messages.push(msg); x.lastMessageAt = msg.timestamp; return true; });
  return { ok: true, id: msg.id };
}

// ---------------------------------------------------------------- Meta's side
// The app listens to Instagram's messages and to the Page's (with its leads), on the leads' webhook address, and the
// Page has the app with its messages. Nothing is changed when it already is so; the leads' subscription is kept.
async function setup(origin) {
  const [conn, creds] = await Promise.all([loadConnection(readJSON), appCreds(readJSON)]);
  if (!conn.pageId || !creds.appId || !creds.appSecret) return { error: 'not_connected' };
  const appToken = creds.appId + '|' + creds.appSecret;
  const out = {};
  const cur = await g('GET', '/' + creds.appId + '/subscriptions', appToken);
  const subs = (cur.ok && cur.j.data) || [];
  const page = subs.find((s) => s.object === 'page');
  // the address the leads come to now (where Meta was told), else this one
  const callback = (page && page.callback_url) || String(origin || 'https://admin.centrul360.com').replace(/\/$/, '') + '/api/webhook-facebook-leads';
  const want = { instagram: ['messages', 'messaging_seen'], page: PAGE_FIELDS };
  for (const object of Object.keys(want)) {
    const s = subs.find((x) => x.object === object);
    const fields = [...new Set(((s && s.fields) || []).map((f) => f.name).concat(want[object]))];
    const has = s && s.active && s.callback_url === callback && want[object].every((f) => (s.fields || []).some((x) => x.name === f));
    if (has) { out[object] = 'ok'; continue; }
    const r = await g('POST', '/' + creds.appId + '/subscriptions', appToken, { object, callback_url: callback, fields: fields.join(','), verify_token: creds.verifyToken, include_values: 'true' });
    out[object] = r.ok ? 'set' : err(r.j);
  }
  // the Page: the leads and the messages (Meta sends Instagram's only to an app the Page has)
  const s = await g('POST', '/' + conn.pageId + '/subscribed_apps', conn.pageAccessToken, { subscribed_fields: PAGE_FIELDS.join(',') });
  if (s.ok) out.pageApp = PAGE_FIELDS.join(',');
  else {
    const l = await g('POST', '/' + conn.pageId + '/subscribed_apps', conn.pageAccessToken, { subscribed_fields: 'leadgen' });
    out.pageApp = l.ok ? 'leadgen (mesaje: ' + err(s.j) + ')' : err(l.j);
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
  const hook = (object) => { const h = ((subs && subs.data) || []).find((s) => s.object === object); return h ? { active: h.active, callback: h.callback_url, fields: (h.fields || []).map((f) => f.name) } : null; };
  const pageApp = ((apps && apps.data) || []).find((a) => String(a.id) === String(creds.appId));
  return {
    app: { id: creds.appId, configId: !!creds.configId, fromPortal: creds.fromPortal },
    missing: NEEDS.filter((s) => !scopes.includes(s)), scopes,
    account: ig && ig.instagram_business_account ? { id: ig.instagram_business_account.id, username: ig.instagram_business_account.username } : null,
    pageApp: pageApp ? pageApp.subscribed_fields || [] : null,
    webhooks: { instagram: hook('instagram'), page: hook('page') },
    conversations: (await readJSON(KEY, [])).reduce((o, c) => { o[c.channel] = (o[c.channel] || 0) + 1; return o; }, {}),
  };
}
// Integrări → Facebook: whether Instagram's and Facebook's messages come into Mesaje, and what is missing if not
async function brief() {
  const s = await status();
  if (s.error) return { ready: false, error: s.error };
  const ig = !!(s.webhooks.instagram && s.webhooks.instagram.active && s.webhooks.instagram.fields.includes('messages'));
  const fb = !!(s.webhooks.page && s.webhooks.page.active && s.webhooks.page.fields.includes('messages') && (s.pageApp || []).includes('messages'));
  return { ready: !s.missing.length && ig && fb, missing: s.missing, account: s.account ? s.account.username || '' : '', instagram: ig, facebook: fb, configId: s.app.configId, conversations: s.conversations };
}

module.exports = { KEY, CHANNELS, NEEDS, ingest, ring, list, unread, view, send, setup, status, brief, parse, isKey };
