// What the reminder flows did for tomorrow's appointments (25.10: the owner saw some without their reminder): per
// appointment the city, the hour, the client's initials (the clock's log is public), the reminder runs with their last
// lines, and whether a WhatsApp went to her number in the last day and a half. Read by the automations' clock.

const { readJSON } = require('./store');
const { normalizePhone } = require('./clients');

const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t));
const initials = (n) => String(n || '?').trim().split(/\s+/).map((w) => w[0] || '').join('').toUpperCase().slice(0, 3);

async function check() {
  const repaired = await require('./workflows').repairReminders().catch((e) => 'error: ' + e.message);
  const tomorrow = day(Date.now() + 864e5);
  const [appts, runsDoc, wfDoc, convos] = await Promise.all([readJSON('data/appointments.json', []), readJSON('data/workflow-runs.json', {}),
    readJSON('data/workflows.json', {}), readJSON('data/whatsapp-conversations.json', [])]);
  const flows = new Map(((wfDoc && wfDoc.workflows) || []).map((w) => [w.id, w]));
  const since = new Date(Date.now() - 36 * 3600e3).toISOString();
  const list = (appts || []).filter((a) => a.date === tomorrow && !a.block && !['anulata', 'concediu'].includes(a.status));
  const rows = list.sort((a, b) => String(a.location + a.time).localeCompare(String(b.location + b.time))).map((a) => {
    const runs = ((runsDoc && runsDoc.runs) || []).filter((r) => r.ent && r.ent.id === a.id).map((r) => {
      const w = flows.get(r.wf) || {};
      return { flow: w.name || r.wf, active: w.active, status: r.status, dueAt: r.dueAt, last: (r.log || []).slice(-2).map((l) => String(l.text || '').slice(0, 90)) };
    });
    const c = convos.find((x) => x.phone === (normalizePhone(a.clientPhone) || a.clientPhone));
    const outs = ((c && c.messages) || []).filter((m) => m.direction === 'out' && m.timestamp > since);
    return { city: a.location, time: a.time, who: initials(a.clientName), made: String(a.createdAt || '').slice(0, 16), by: a.createdBy === 'highlevel' || a.ghlId ? 'highlevel' : 'portal',
      phone: !!a.clientPhone, runs, whatsapp: outs.map((m) => String(m.timestamp).slice(11, 16) + ' ' + (m.type || '') + (m.status ? ' ' + m.status : '') + (m.error ? ' ' + String(m.error).slice(0, 60) : '')) };
  });
  const reminderFlows = [...flows.values()].filter((w) => /^Reamintiri/.test(w.name || '')).map((w) => ({ name: w.name, active: !!w.active, trigger: w.trigger }));
  return { repaired, tomorrow, count: rows.length, flows: reminderFlows, rows };
}

module.exports = { check };
