// The people who asked us not to send them offers any more (the owner, 21.11: „șterge-o … să nu-i mai trimitem promoții,
// și vezi cine a mai zis”). One list for every campaign (the card's waves, „Transformarea 360”, the ones to come): by the
// last 9 digits of the phone. Her client file, visits and chat stay; only the offers stop. data/optout.json [{ k, at, why }]
const { readJSON, writeJSON } = require('./store');

const KEY = 'data/optout.json';
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function all() { const x = await readJSON(KEY, []); return Array.isArray(x) ? x : []; }
async function set() { return new Set((await all()).map((x) => x.k)); }
async function add(phones, why) {
  const list = await all();
  const have = new Set(list.map((x) => x.k));
  let n = 0;
  (Array.isArray(phones) ? phones : [phones]).map(d9).filter((k) => k.length === 9).forEach((k) => {
    if (have.has(k)) return; have.add(k); n++;
    list.push({ k, at: new Date().toISOString(), why: String(why || '').slice(0, 120) });
  });
  if (n) await writeJSON(KEY, list);
  return { ok: true, added: n, total: list.length };
}
// what reads as „don't send me this any more”, in Romanian, with or without diacritics
function isStop(text) {
  const t = fold(text).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(stop|dezabonare|dezabonez|unsubscribe)\b/.test(t) ||
    /sterger|baza de date|hartuire|spam\b|nu (imi |mi |ne )?mai (trimiteti|trimite|scrieti|sunati)|nu ma mai suna|nu (ma|mai) intereseaza|nu mai (trimiteti|trimite|vreau|doresc)|nu (vreau|doresc) (sa (mai )?primesc|mesaje|oferte|promotii)|sterge(ti)? ma|scoate(ti)? ma|nu ma mai (contactati|deranjati)|lasati ma|stop (mesaje|promotii)/.test(t);
}
// „forget her” (she asked to be deleted, the owner said yes): her leads, her chat and her client file go; a client file with
// visits or payments keeps them for the accounts, with her name and phone taken out. Her phone stays only on the no-offers
// list (9 digits), so no campaign writes her again. { leads, convos, clients, kept } counts only.
async function forget(phone, dry) {
  const k = d9(phone);
  if (k.length !== 9) return { error: 'bad_phone' };
  const { readJSONTagged, writeJSONIf } = require('./store');
  const out = { leads: 0, convos: 0, clients: 0, kept: 0 };
  const [leads, clients, appts, sales] = await Promise.all([readJSON('data/leads.json', []), readJSON('data/clients.json', []), readJSON('data/appointments.json', []), readJSON('data/sales.json', [])]);
  const myLeads = leads.filter((l) => l && d9(l.phone) === k);
  const myClients = clients.filter((c) => c && d9(c.phone) === k);
  out.leads = myLeads.length;
  const used = new Set(appts.map((a) => a && a.clientId).concat(sales.map((x) => x && x.clientId)).filter(Boolean));
  myClients.forEach((c) => { if (used.has(c.id)) out.kept++; else out.clients++; });
  const cv = await readJSON('data/whatsapp-conversations.json', []);
  out.convos = cv.filter((c) => c && d9(c.phone) === k).length;
  if (dry) return Object.assign({ ok: true, dry: true }, out);
  if (myLeads.length) await writeJSON('data/leads.json', leads.filter((l) => !(l && d9(l.phone) === k)));
  if (myClients.length) await writeJSON('data/clients.json', clients.filter((c) => !(c && d9(c.phone) === k && !used.has(c.id))).map((c) => (c && d9(c.phone) === k ? Object.assign({}, c, { name: 'Șters la cerere', phone: '', email: '' }) : c)));
  for (let i = 0; i < 8; i++) { // the chats: only onto the version just read (the webhook writes there all the time)
    const { data, etag } = await readJSONTagged('data/whatsapp-conversations.json', []);
    const next = (Array.isArray(data) ? data : []).filter((c) => !(c && d9(c.phone) === k));
    if (await writeJSONIf('data/whatsapp-conversations.json', next, etag)) break;
  }
  await add(k, 'a cerut ștergerea');
  return Object.assign({ ok: true }, out);
}
module.exports = { KEY, all, set, add, isStop, d9, forget };
