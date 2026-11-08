// Acte și autorizații: a paper that expires tells the owner in time (the owner, 8.11: „să fim perfect în regulă”).
// Once a day, from 9:00 (Romania): every item marked „În regulă” with an expiry date, at 30 days, at 7 days and on
// the day it expires, one notice each (bell and phone), grouped in one line when several come the same day.
// State: data/legal-alerts.json { day, sent: { '<scope>|<item>|<expires>|<step>': at } }.

const { readJSON, writeJSON } = require('./store');
const N = require('./notify');
const R = require('./legal-reqs');

const KEY = 'data/legal-alerts.json';
const STEPS = [[30, '30'], [7, '7'], [0, '0']];
const roDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(t || new Date());
const roHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hour12: false }).format(new Date()));
const days = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const dShort = (d) => d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4);

async function run() {
  const today = roDay();
  const st = (await readJSON(KEY, null)) || { day: '', sent: {} };
  if (st.day === today || roHour() < 9) return { skipped: true };
  const data = await readJSON('data/legal.json', null);
  const emps = await readJSON('data/employees.json', []);
  const due = [];
  Object.entries((data && data.scopes) || {}).forEach(([scope, box]) => {
    const emp = scope.startsWith('emp:') ? emps.find((e) => 'emp:' + e.id === scope) : null;
    if (scope.startsWith('emp:') && (!emp || emp.active === false)) return; // a former employee's papers don't expire on us
    const where = scope.startsWith('salon:') ? scope.slice(6) : (emp.name || 'Angajat');
    Object.entries(box.items || {}).forEach(([id, it]) => {
      if (!it || it.status !== 'ok' || !it.expires) return;
      const left = days(today, it.expires);
      const step = STEPS.find(([d]) => left <= d);
      if (!step) return;
      const k = scope + '|' + id + '|' + it.expires + '|' + step[1];
      if (st.sent[k]) return;
      const req = (scope.startsWith('salon:') ? R.SALON : R.EMPLOYEE).find((r) => r.id === id) || (box.custom || []).find((c) => c.id === id) || { title: 'Document' };
      due.push({ k, where, title: req.title, left, expires: it.expires });
    });
  });
  if (due.length) {
    const ids = await N.ownerIds({ readJSON });
    const one = due[0];
    const say = (x) => x.title + ' · ' + x.where + (x.left < 0 ? ': a expirat pe ' + dShort(x.expires) : x.left === 0 ? ': expiră azi' : ': expiră pe ' + dShort(x.expires));
    await N.notifyMany({ readJSON, writeJSON }, ids, {
      kind: 'alert', tone: due.some((x) => x.left <= 7) ? 'warn' : 'info', go: 'acte', tag: 'acte-' + today,
      title: due.length === 1 ? (one.left <= 0 ? 'ACT EXPIRAT 📄' : 'ACT CARE EXPIRĂ 📄') : due.length + ' ACTE DE REÎNNOIT 📄',
      text: due.length === 1 ? say(one) : due.slice(0, 3).map(say).join(' · '),
    });
    due.forEach((x) => { st.sent[x.k] = new Date().toISOString(); });
  }
  st.day = today;
  await writeJSON(KEY, st, { quiet: true });
  return { due: due.length };
}

module.exports = { run };
