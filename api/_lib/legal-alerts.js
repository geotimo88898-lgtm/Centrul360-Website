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
      due.push({ k, where, title: req.title, left, expires: it.expires, scope, id, emp });
    });
  });
  if (due.length) {
    const say = (x) => x.title + ' · ' + x.where + (x.left < 0 ? ': a expirat pe ' + dShort(x.expires) : x.left === 0 ? ': expiră azi' : ': expiră pe ' + dShort(x.expires));
    const tell = (ids, list) => N.notifyMany({ readJSON, writeJSON }, ids, {
      kind: 'alert', tone: list.some((x) => x.left <= 7) ? 'warn' : 'info', go: 'acte', tag: 'acte-' + today,
      title: list.length === 1 ? (list[0].left <= 0 ? 'ACT EXPIRAT 📄' : 'ACT CARE EXPIRĂ 📄') : list.length + ' ACTE DE REÎNNOIT 📄',
      text: list.length === 1 ? say(list[0]) : list.slice(0, 3).map(say).join(' · '),
    });
    const owners = await N.ownerIds({ readJSON });
    await tell(owners, due);
    // the manager (15.11, „reînnoirea actelor și autorizațiilor”): her clinics' papers and her people's, never a
    // colleague's contract / REGES / additional acts (they say the pay: the owner's)
    const Ro = require('./roles');
    for (const m of emps.filter((e) => e && e.active !== false && e.role === 'manager' && !owners.includes(e.id))) {
      const clinics = Ro.managesOf(m);
      const mine = due.filter((x) => (x.scope.startsWith('salon:') ? clinics.includes(x.scope.slice(6))
        : x.emp && (x.emp.id === m.id || (x.emp.role !== 'admin' && clinics.includes(x.emp.location) && !['cim', 'reges', 'acte-ad'].includes(x.id)))));
      if (mine.length) await tell([m.id], mine).catch((e) => console.error('legal alerts manager:', e.message));
    }
    due.forEach((x) => { st.sent[x.k] = new Date().toISOString(); });
  }
  st.day = today;
  await writeJSON(KEY, st, { quiet: true });
  return { due: due.length };
}

module.exports = { run };
