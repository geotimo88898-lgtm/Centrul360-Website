// Notifications for the team (the bell, top right): one short line each time the owner decides
// something about them (a leave, an overtime day, a commission, overtime paid). Bonus reminders
// ("ai atins bonusul", "mai ai puțin") are worked out live in api/portal-data.js, not stored here.
//
// data/notifications.json: [{ id, employeeId, at, kind, tone ('good'|'bad'|'info'), title, text, go }]
// (go = the portal section it opens). Kept to the newest 60 per person.

const crypto = require('crypto');
const { dedash } = require('./dedash');

const KEY = 'data/notifications.json';
const KEEP = 60;

async function notify(store, employeeId, n) {
  // the owner's own login ('admin') gets only the alerts meant for it (new leads), not decisions
  if (!employeeId || (employeeId === 'admin' && n.kind !== 'lead' && n.kind !== 'alert')) return;
  try {
    const list = await store.readJSON(KEY, []);
    list.push({
      id: crypto.randomUUID(), employeeId, at: new Date().toISOString(), kind: n.kind || 'info', tone: n.tone || 'info',
      title: dedash(String(n.title || '')).slice(0, 80), text: dedash(String(n.text || '')).slice(0, 160), go: n.go || '',
    });
    // newest KEEP per person
    const mine = list.filter((x) => x.employeeId === employeeId);
    const drop = new Set(mine.slice(0, Math.max(0, mine.length - KEEP)).map((x) => x.id));
    await store.writeJSON(KEY, list.filter((x) => !drop.has(x.id)));
  } catch (err) { console.error('notify error:', err.message); } // never blocks the decision itself
}

// The same alert for several people with one read and one write (a new lead → admin + reception).
async function notifyMany(store, employeeIds, n) {
  const ids = employeeIds.filter((id) => id && (id !== 'admin' || n.kind === 'lead' || n.kind === 'alert'));
  if (!ids.length) return;
  try {
    const list = await store.readJSON(KEY, []);
    const at = new Date().toISOString();
    ids.forEach((employeeId) => list.push({
      id: crypto.randomUUID(), employeeId, at, kind: n.kind || 'info', tone: n.tone || 'info',
      title: dedash(String(n.title || '')).slice(0, 80), text: dedash(String(n.text || '')).slice(0, 160), go: n.go || '',
    }));
    const drop = new Set();
    ids.forEach((employeeId) => {
      const mine = list.filter((x) => x.employeeId === employeeId);
      mine.slice(0, Math.max(0, mine.length - KEEP)).forEach((x) => drop.add(x.id));
    });
    await store.writeJSON(KEY, list.filter((x) => !drop.has(x.id)));
  } catch (err) { console.error('notifyMany error:', err.message); }
}

const mine = async (store, employeeId) => (await store.readJSON(KEY, [])).filter((x) => x.employeeId === employeeId).slice(-40).reverse();

module.exports = { notify, notifyMany, mine, KEY };
