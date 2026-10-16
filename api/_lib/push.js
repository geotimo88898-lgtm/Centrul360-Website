// Phone / desktop notifications (Web Push), for alerts that can't wait until someone opens the
// portal: a new lead must be called in minutes. Each person turns them on per device from the
// bell (Notificări → "Primește pe acest dispozitiv"); the browser asks for permission and gives a
// subscription, kept in data/push-subs.json. portal-sw.js shows what arrives.
//
// The VAPID key pair (the portal's identity towards the browsers' push services) is made the
// first time it's needed and kept in data/vapid.json, private like the other secrets, so there is
// nothing to set up in Vercel. On iPhone, Web Push works once the portal is added to the Home
// Screen (iOS 16.4+).

const webpush = require('web-push');

const SUBS_KEY = 'data/push-subs.json';
const VAPID_KEY = 'data/vapid.json';
const SUBJECT = 'https://admin.centrul360.com';

async function vapid(store) {
  let v = await store.readJSON(VAPID_KEY, null);
  if (!v || !v.publicKey || !v.privateKey) {
    v = Object.assign(webpush.generateVAPIDKeys(), { createdAt: new Date().toISOString() });
    await store.writeJSON(VAPID_KEY, v);
  }
  return v;
}
const publicKey = async (store) => (await vapid(store)).publicKey;

function cleanSub(s) {
  const ok = s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
  return ok ? { endpoint: s.endpoint.slice(0, 1000), keys: { p256dh: s.keys.p256dh.slice(0, 200), auth: s.keys.auth.slice(0, 100) } } : null;
}

async function subscribe(store, employeeId, sub, device) {
  const s = cleanSub(sub);
  if (!s) return false;
  const list = (await store.readJSON(SUBS_KEY, [])).filter((x) => x.endpoint !== s.endpoint);
  list.push(Object.assign(s, { employeeId, device: String(device || '').slice(0, 80), at: new Date().toISOString() }));
  await store.writeJSON(SUBS_KEY, list.slice(-300));
  return true;
}
async function unsubscribe(store, endpoint, employeeId) {
  const list = await store.readJSON(SUBS_KEY, []);
  const next = list.filter((x) => !(x.endpoint === endpoint && x.employeeId === employeeId));
  if (next.length !== list.length) await store.writeJSON(SUBS_KEY, next);
}
const devicesOf = async (store, employeeId) => (await store.readJSON(SUBS_KEY, [])).filter((x) => x.employeeId === employeeId).length;
// { employeeId: number of devices with notifications on }, for Echipa
async function deviceCounts(store) {
  const out = {};
  (await store.readJSON(SUBS_KEY, [])).forEach((x) => { out[x.employeeId] = (out[x.employeeId] || 0) + 1; });
  return out;
}

// { title, body, url } to every device of these people. Never throws; dead subscriptions
// (the person turned notifications off or reinstalled) are dropped.
async function sendPush(store, employeeIds, msg) {
  try {
    const ids = new Set(employeeIds);
    const list = await store.readJSON(SUBS_KEY, []);
    const mine = list.filter((x) => ids.has(x.employeeId));
    if (!mine.length) return 0;
    const v = await vapid(store);
    const payload = JSON.stringify({ title: String(msg.title || 'Centrul360').slice(0, 80), body: String(msg.body || '').slice(0, 200), url: msg.url || '/portal', tag: msg.tag || '', quiet: !!msg.quiet });
    const dead = new Set();
    let sent = 0;
    await Promise.all(mine.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload, {
          TTL: 3600, urgency: 'high', vapidDetails: { subject: SUBJECT, publicKey: v.publicKey, privateKey: v.privateKey },
        });
        sent++;
      } catch (err) {
        if (err && (err.statusCode === 404 || err.statusCode === 410)) dead.add(s.endpoint);
        else console.error('push error:', err && (err.statusCode || err.message));
      }
    }));
    if (dead.size) await store.writeJSON(SUBS_KEY, list.filter((x) => !dead.has(x.endpoint)));
    return sent;
  } catch (err) {
    console.error('sendPush error:', err.message);
    return 0;
  }
}

module.exports = { publicKey, subscribe, unsubscribe, devicesOf, deviceCounts, sendPush };
