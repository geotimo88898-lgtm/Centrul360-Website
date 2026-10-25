// Who confirmed tomorrow's appointments (the owner, 25.10: "pe mâine la Arad câte au confirmat? verifică în mesaje"):
// per appointment of a city tomorrow, its status, and what she wrote on WhatsApp since the 24h reminder (the button
// "Reușesc să ajung" comes in as a message too). Read straight from the clock's address (?confirm=Arad), not its log.

const { readJSON } = require('./store');
const { normalizePhone } = require('./clients');

const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t));
const tail = (p) => String(p || '').replace(/\D/g, '').slice(-9);

async function check(city) {
  const tomorrow = day(Date.now() + 864e5);
  const [appts, convos] = await Promise.all([readJSON('data/appointments.json', []), readJSON('data/whatsapp-conversations.json', [])]);
  const since = new Date(Date.now() - 48 * 3600e3).toISOString();
  return { tomorrow, city, rows: (appts || []).filter((a) => a.date === tomorrow && a.location === city && !a.block && !['anulata', 'concediu'].includes(a.status))
    .sort((a, b) => String(a.time).localeCompare(String(b.time))).map((a) => {
      const c = convos.find((x) => tail(x.phone) === tail(a.clientPhone));
      const msgs = ((c && c.messages) || []).filter((m) => m.timestamp > since);
      return { time: a.time, name: a.clientName, status: a.status, treatment: a.treatment,
        chat: msgs.map((m) => String(m.timestamp).slice(5, 16).replace('T', ' ') + (m.direction === 'in' ? ' ← ' : ' → ') + (m.type === 'template' ? '[șablon] ' : '') + String(m.text || (m.media ? '[' + m.media.kind + ']' : '')).replace(/\s+/g, ' ').slice(0, 90)) };
    }) };
}

module.exports = { check };
