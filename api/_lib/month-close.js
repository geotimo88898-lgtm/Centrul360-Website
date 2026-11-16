// A month's money once it is closed (the owner, 16.11): its salaries marked paid in Plăți (api/_lib/expenses.js, the
// salary rows of the month after) or the manager's final bonus set (data/manager-bonus.json). A change made after that to
// the month's money (a payment corrected or deleted, a commission approved or added, a salary dated back) is told to the
// owner: once a day per month, with what changed; the changes after the first are kept with it, never rung again.
//
// data/month-close-changes.json { 'YYYY-MM': { day, items: [{ at, what }] } }

const KEY = 'data/month-close-changes.json';
const MON = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const monthName = (m) => MON[+String(m).slice(5, 7) - 1] || m;
const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));
const nextMonth = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString().slice(0, 7);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());

// is the month closed: its salaries marked paid (even in part), or a final bonus set for it
async function isClosed(readJSON, month) {
  if (!isMonth(month)) return false;
  try {
    const finals = (await readJSON('data/manager-bonus.json', {})) || {};
    if (Object.keys(finals).some((k) => k.endsWith('|' + month) && finals[k] && Number.isFinite(Number(finals[k].lei)))) return true;
    const doc = (await readJSON('data/expense-tracker.json', null)) || {};
    const m = (doc.months || {})[nextMonth(month)] || {};
    const has = (o) => Object.keys(o || {}).some((k) => k.startsWith('sal:') && (Array.isArray(o[k]) ? o[k].length : !!o[k]));
    return has(m.parts) || has(m.paid);
  } catch (e) { return false; }
}

// a month before the current one: its money is closed for the team's pay (the warning in the page says so)
const isPast = (month) => isMonth(month) && month < today().slice(0, 7);

// a change of a month's money: told to the owner when the month is closed (once a day per month). what: a short line.
async function changed(store, month, what) {
  if (!(await isClosed(store.readJSON, month))) return false;
  const day = today();
  try {
    const doc = (await store.readJSON(KEY, {})) || {};
    const rec = doc[month] && doc[month].day === day ? doc[month] : { day, items: [] };
    const first = !rec.items.length;
    rec.items.push({ at: new Date().toISOString(), what: String(what || '').slice(0, 160) });
    rec.items = rec.items.slice(-50);
    doc[month] = rec;
    await store.writeJSON(KEY, doc, { quiet: true });
    if (!first) return true;
    const N = require('./notify');
    await N.notifyMany(store, await N.adminIds(store), {
      kind: 'alert', tone: 'warn', go: 'cheltuieli', tag: 'close-' + month + '-' + day,
      title: 'LUNA ' + monthName(month).toUpperCase() + ' S-A SCHIMBAT ⚠️',
      text: what + '. Salariile ei erau deja închise: verifică plățile și bonusul.',
    });
    return true;
  } catch (e) { console.error('month-close:', e.message); return false; }
}

module.exports = { KEY, isClosed, isPast, changed, monthName };
