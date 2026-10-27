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

// the owner's own login ('admin') gets only the alerts meant for it (new leads, a booking, money in, the day's
// report), not decisions about the team
const OWNER_KINDS = ['lead', 'alert', 'booking', 'money', 'report', 'approval']; // approval: a commission a cosmetician added
const wants = (id, n) => id && (id !== 'admin' || OWNER_KINDS.includes(n.kind));
// the owner: her own login and anyone with the admin role
async function adminIds(store) {
  const employees = await store.readJSON('data/employees.json', []);
  return ['admin'].concat(employees.filter((e) => e.active !== false && e.role === 'admin').map((e) => e.id));
}
// who hears about the ads (the guard, the one-off changes, the job ads): the admin account named George (the owner,
// 20.10: "doar mie, contului de admin numit george"), by username or by name; none found: the shared 'admin' login,
// said once in the log
async function ownerIds(store) {
  const emps = await store.readJSON('data/employees.json', []);
  const g = (emps || []).filter((e) => e.active !== false && e.role === 'admin' && (/^george$/i.test(String(e.username || '').trim()) || /^george(\s|$)/i.test(String(e.name || '').trim())));
  if (!g.length) console.warn('notify.ownerIds: no active admin named George, the ads alerts go to the admin login');
  return g.length ? g.map((e) => e.id) : ['admin'];
}
const isOwner = (session) => !!session && (session.employeeId === 'admin' || session.role === 'admin');
// a text that must fit: cut at a word, with a mark that there was more (a number cut in two would read as another number)
const cut = (s, n) => { if (s.length <= n) return s; const t = s.slice(0, n - 1); const i = t.lastIndexOf(' '); return (i > n * 0.6 ? t.slice(0, i) : t).replace(/[\s,;:·.-]+$/, '') + '…'; };
const leiTxt = (n) => (Math.round(Number(n) * 100) / 100).toLocaleString('ro-RO') + ' lei';
// a clinic, short, for the titles (ÎNCASARE TM, like LEAD NOU TM): ' TM' / ' AR', or nothing
const cityTag = (c) => (/arad/i.test(String(c || '')) ? ' AR' : /timi/i.test(String(c || '')) ? ' TM' : '');

// One payment, one notification. A card payment is seen twice: by the POS at once (api/mypos-webhook.js) and by
// the desk when it records it (portal-sale.js, with the client and the upsell). Each line carries a ref (who saw it
// + the sum); whichever comes second finds the first within 30 minutes: the desk's line takes the POS one's place
// (removed from the bell, replaced quietly on the phone by the same tag), a POS payment the desk already recorded
// doesn't ring again (the desk's line is marked as paired, so it pairs once).
const PAIR_WITHIN = 30 * 60 * 1000;
const payRef = (who, sum) => who + ':' + Math.round(Number(sum) * 100);
async function claim(store, ref, remove) {
  try {
    const list = await store.readJSON(KEY, []);
    const since = Date.now() - PAIR_WITHIN;
    const hit = list.filter((x) => x.ref === ref && !x.paired && Date.parse(x.at) > since).pop();
    if (!hit) return null;
    const same = (x) => x.ref === ref && x.tag === hit.tag && !x.paired;
    await store.writeJSON(KEY, remove ? list.filter((x) => !same(x)) : list.map((x) => (same(x) ? Object.assign(x, { paired: true }) : x)));
    return { tag: hit.tag };
  } catch (err) { console.error('notify claim error:', err.message); return null; }
}

// The same notification for one or several people (a new lead → admin + reception), with one read and
// one write, then on their phones. Returns how many devices got it. Never throws: a notification never
// blocks the decision or the lead that caused it.
async function notifyMany(store, employeeIds, n) {
  let ids = [...new Set(employeeIds)].filter((id) => wants(id, n));
  if (!ids.length) return 0;
  const title = cut(dedash(String(n.title || '')), 80), text = cut(dedash(String(n.text || '')), 160);
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
      id: crypto.randomUUID(), employeeId, at, kind: n.kind || 'info', tone: n.tone || 'info', title, text, go: n.go || '', tag: n.tag || '', ref: n.ref || '',
    }));
    const drop = new Set();
    ids.forEach((employeeId) => {
      const mine = list.filter((x) => x.employeeId === employeeId);
      mine.slice(0, Math.max(0, mine.length - KEEP)).forEach((x) => drop.add(x.id));
    });
    await store.writeJSON(KEY, list.filter((x) => !drop.has(x.id)));
  } catch (err) { console.error('notify error:', err.message); }
  return sendPush(store, ids, { title, body: text, url: '/' + (n.go ? '#' + n.go : ''), tag: n.tag || '', quiet: !!n.quiet });
}

const notify = (store, employeeId, n) => notifyMany(store, [employeeId], n);

const mine = async (store, employeeId) => (await store.readJSON(KEY, [])).filter((x) => x.employeeId === employeeId).slice(-40).reverse();

module.exports = { notify, notifyMany, mine, KEY, adminIds, ownerIds, isOwner, leiTxt, cityTag, payRef, claim, cut };
