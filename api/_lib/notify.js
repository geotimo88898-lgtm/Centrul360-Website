// Notifications for the team (the bell, top right), and the same line on their phones (Web Push,
// _lib/push.js) for everyone who turned them on: a new lead, an alert from the automations, every
// decision about them (a leave, an overtime day, a commission, overtime paid). Bonus reminders
// ("ai atins bonusul", "mai ai puțin") are worked out live (_lib/bonus.js), not stored here.
//
// data/notifications.json: [{ id, employeeId, at, kind, tone ('good'|'bad'|'info'), title, text, go, tag }]
// (go = the portal section it opens; tag = the same thing twice within minutes rings once).
// Kept to the newest 60 per person.

const crypto = require('crypto');
const { dedash } = require('./dedash');
const { sendPush } = require('./push');

const KEY = 'data/notifications.json';
const KEEP = 60;
const SAME_WITHIN = 10 * 60 * 1000;

// the owner's own login ('admin') gets only the alerts meant for it (new leads), not decisions
const wants = (id, n) => id && (id !== 'admin' || n.kind === 'lead' || n.kind === 'alert');

// The same notification for one or several people (a new lead → admin + reception), with one read and
// one write, then on their phones. Returns how many devices got it. Never throws: a notification never
// blocks the decision or the lead that caused it.
async function notifyMany(store, employeeIds, n) {
  let ids = [...new Set(employeeIds)].filter((id) => wants(id, n));
  if (!ids.length) return 0;
  const title = dedash(String(n.title || '')).slice(0, 80), text = dedash(String(n.text || '')).slice(0, 160);
  try {
    const list = await store.readJSON(KEY, []);
    const at = new Date().toISOString();
    // a lead alerted by the portal and again by an automation (same tag, minutes apart): once
    if (n.tag) {
      const since = Date.now() - SAME_WITHIN;
      ids = ids.filter((id) => !list.some((x) => x.employeeId === id && x.tag === n.tag && Date.parse(x.at) > since));
      if (!ids.length) return 0;
    }
    ids.forEach((employeeId) => list.push({
      id: crypto.randomUUID(), employeeId, at, kind: n.kind || 'info', tone: n.tone || 'info', title, text, go: n.go || '', tag: n.tag || '',
    }));
    const drop = new Set();
    ids.forEach((employeeId) => {
      const mine = list.filter((x) => x.employeeId === employeeId);
      mine.slice(0, Math.max(0, mine.length - KEEP)).forEach((x) => drop.add(x.id));
    });
    await store.writeJSON(KEY, list.filter((x) => !drop.has(x.id)));
  } catch (err) { console.error('notify error:', err.message); }
  return sendPush(store, ids, { title, body: text, url: '/portal' + (n.go ? '#' + n.go : ''), tag: n.tag || '' });
}

const notify = (store, employeeId, n) => notifyMany(store, [employeeId], n);

const mine = async (store, employeeId) => (await store.readJSON(KEY, [])).filter((x) => x.employeeId === employeeId).slice(-40).reverse();

module.exports = { notify, notifyMany, mine, KEY };
