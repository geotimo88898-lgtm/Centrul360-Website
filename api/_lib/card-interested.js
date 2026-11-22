// „Interesate” in Portal → Carduri (the owner, 22.11): the people who answered a card campaign message on WhatsApp with
// words (thanks, an emoji, a question, „mă gândesc”) and have no card order; not a stop (optout.js) and not the tap on
// „Rezerv în clinică” (that one is a request already, card-blast.js noteAnswer). Computed from the campaign's answers
// (card-kpi.js view: cardblast/in) and, for the answers before those were counted, from her chat after the send; one row
// per person, the newest first. The desk adds others by hand („Adaugă interesată”), writes a short note, or hides one
// („Nu e interesată”, kept with who and when). „Fă cerere” makes her request: she then has an order and leaves this list.
//   data/card-interested.json  { people: { <9 digits>: { manual?: { name, phone, city, tier, at, by, byName },
//                                                       note?: { text, at, byName }, hidden?: { at, by, byName } } } }

const { readJSON, writeJSON } = require('./store');
const KEY = 'data/card-interested.json';
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const nowISO = () => new Date().toISOString();
const clean = (v, n) => String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/[<>\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const CITIES = ['Timișoara', 'Arad'];
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const tierOfPre = (pre) => (/_290$/.test(String(pre || '')) ? 290 : /_490$/.test(String(pre || '')) ? 490 : 990);

async function load() { const d = await readJSON(KEY, null).catch(() => null); return d && typeof d === 'object' && d.people ? d : { people: {} }; }

// her words count when they are not a stop and not the reservation (a tap, or words that ask for it)
const counts = (a, optout) => a && a.kind !== 'stop' && a.kind !== 'tap' && !optout(a.text) && !/rezerv/i.test(String(a.text || ''));

async function list(opts) {
  const o = opts || {};
  const C = require('./card-sarbatori');
  const OPT = require('./optout');
  const [d, orders, st, sent, convos, clients, leads, appts, stops] = await Promise.all([
    load(), readJSON(C.KEY, []).catch(() => []), readJSON('cardblast/state.json', null).catch(() => null), readJSON('cardblast/sent.json', null).catch(() => null),
    readJSON('data/whatsapp-conversations.json', []).catch(() => []), readJSON('data/clients.json', []).catch(() => []), readJSON('data/leads.json', []).catch(() => []),
    readJSON('data/appointments.json', []).catch(() => []), OPT.set().catch(() => new Set()),
  ]);
  const people = (st && Array.isArray(st.list)) ? st.list : [];
  const S = sent || {};
  const byK = new Map(people.map((p) => [p.k, p]));
  // the answers counted for Admin → Campanii (card-kpi), when it can be read; else her chat only
  let answers = new Map();
  if (!o.noKpi) {
    try {
      const v = await require('./card-kpi').view();
      (v.people || []).forEach((p) => { if (p.answers && p.answers.length) answers.set(p.k, p.answers); });
    } catch (e) { console.error('card interested kpi:', e.message); }
  }
  // her chat, the words after the send (the answers before 21.11 16:40 were not counted as marks)
  const waName = new Map(); // her WhatsApp name, when our files have none
  (Array.isArray(convos) ? convos : []).forEach((c) => {
    const k = d9(c && c.phone);
    if (k.length === 9 && c && c.name && !/^\+?\d[\d\s]+$/.test(c.name)) waName.set(k, String(c.name).slice(0, 80));
    if (!byK.has(k) || !S[k] || !S[k].w) return;
    const ins = (c.messages || []).filter((m) => m && m.direction === 'in' && String(m.timestamp || '') >= String(S[k].at || '') && String(m.text || '').trim());
    if (!ins.length) return;
    const have = answers.get(k) || [];
    const seen = new Set(have.map((a) => String(a.text || '').trim() + '|' + String(a.at || '').slice(0, 16)));
    const more = ins.filter((m) => !seen.has(String(m.text).trim() + '|' + String(m.timestamp).slice(0, 16)))
      .map((m) => ({ at: m.timestamp, kind: /^(stop|dezabon)/i.test(fold(m.text).trim()) ? 'stop' : 'text', text: String(m.text).slice(0, 300) }));
    if (more.length) answers.set(k, have.concat(more));
  });
  // an order open or paid takes her out of here (a cancelled one does not: she may still be interested)
  const ordered = new Set(orders.filter((r) => r.status !== 'anulat').map((r) => d9(r.phone)));
  const nameOf = new Map();
  clients.forEach((c) => { const k = d9(c && c.phone); if (k.length === 9 && c.name && !nameOf.has(k)) nameOf.set(k, { name: c.name, city: c.location || '', id: c.id }); });
  leads.forEach((l) => { const k = d9(l && l.phone); if (k.length === 9 && l.name && l.name !== C.NONAME && !nameOf.has(k)) nameOf.set(k, { name: l.name, city: l.location || '' }); });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
  const clinicOf = (l) => { try { return require('./clinic').clinicOf(l) || l || ''; } catch (e) { return l || ''; } };
  const ahead = (k) => {
    const id = (nameOf.get(k) || {}).id;
    const a = appts.filter((x) => x && !x.block && x.date >= today && !['anulata', 'finalizata', 'concediu'].includes(x.status) && ((id && x.clientId === id) || d9(x.clientPhone) === k))
      .sort((x, y) => (x.date + (x.time || '')).localeCompare(y.date + (y.time || '')))[0];
    return a ? { date: a.date, time: a.time || '', city: clinicOf(a.location) } : null;
  };
  const optout = (t) => OPT.isStop(t);
  const out = [];
  const add = (k, row) => {
    const e = d.people[k] || {};
    if (ordered.has(k)) return; // she has an order: „De confirmat” or a card
    if (e.hidden && !o.all) return;
    const who = nameOf.get(k) || {};
    // what the desk wrote by hand (Editează, or a request moved here) wins over our files and the campaign's list
    const m = e.manual || {};
    const x = Object.assign({ k, phone: '0' + k, name: who.name || waName.get(k) || '', note: e.note || null, hidden: e.hidden || null, appt: ahead(k) }, row);
    x.city = CITIES.includes(m.city) ? m.city : CITIES.includes(row.city) ? row.city : CITIES.includes(who.city) ? who.city : '';
    if (m.name) x.name = m.name;
    if (m.tier) x.tier = Number(m.tier);
    if (m.from) x.from = m.from;
    out.push(x);
  };
  people.forEach((p) => {
    const k = p.k;
    if (stops.has(k)) return;
    const ans = (answers.get(k) || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
    if (ans.some((a) => a.kind === 'stop' || optout(a.text))) return;
    const said = ans.filter((a) => counts(a, optout));
    if (!said.length) return;
    const last = said[said.length - 1];
    const s = S[k] || {};
    add(k, { auto: true, city: p.city, lot: { n: Number(p.batch) || 1, tier: tierOfPre(s.t || p.pre) }, tier: tierOfPre(s.t || p.pre), said: { text: String(last.text || '').slice(0, 160), at: last.at || '' }, n: said.length, at: last.at || '' });
  });
  // the ones added by hand
  const auto = new Set(out.map((x) => x.k));
  Object.keys(d.people).forEach((k) => {
    const m = d.people[k].manual;
    if (!m || auto.has(k) || stops.has(k)) return;
    add(k, { manual: true, city: m.city, tier: Number(m.tier) || 990, lot: null, said: null, at: m.at, by: m.byName || '' });
  });
  out.forEach((x) => { if (x.manual && !x.name) x.name = (nameOf.get(x.k) || {}).name || ''; });
  out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  const sum = (l) => l.reduce((n, x) => n + (Number(x.tier) || 0), 0);
  const shown = out.filter((x) => !x.hidden);
  return { people: out, potential: { total: sum(shown), 'Timișoara': sum(shown.filter((x) => x.city === 'Timișoara')), Arad: sum(shown.filter((x) => x.city === 'Arad')), n: shown.length } };
}

async function change(phone, f) {
  const k = d9(phone);
  if (k.length !== 9) return { error: 'bad_phone' };
  const d = await load();
  const e = d.people[k] = d.people[k] || {};
  const x = f(e, k);
  if (x && x.error) return x;
  if (!Object.keys(e).length) delete d.people[k];
  await writeJSON(KEY, d);
  return { ok: true, k };
}
// „Notă: sunată, revine luni” (empty: removed)
const note = (phone, text, byName) => change(phone, (e) => { const t = clean(text, 200); if (t) e.note = { text: t, at: nowISO(), byName: byName || '' }; else delete e.note; });
// „Nu e interesată” (and back)
const hide = (phone, on, session, byName) => change(phone, (e) => { if (on === false) delete e.hidden; else e.hidden = { at: nowISO(), by: (session && session.employeeId) || '', byName: byName || '' }; });
// „Adaugă interesată” by hand, and „Editează” on any row (her phone changed: the row goes to the new number)
async function addManual(i, session, byName) {
  const { normalizePhone } = require('./clients');
  let phone = normalizePhone(clean(i.phone, 30)) || '';
  if (/^7\d{8}$/.test(phone)) phone = '0' + phone;
  if (!(/^07\d{8}$/.test(phone) || /^[1-9]\d{10,14}$/.test(phone))) return { error: 'bad_phone' };
  const name = clean(i.name, 100);
  if (name.length < 2) return { error: 'missing_name' };
  const city = CITIES.find((c) => fold(c) === fold(i.city)) || '';
  if (!city) return { error: 'missing_city' };
  const tier = [490, 990, 9900, 290].includes(Number(i.tier)) ? Number(i.tier) : 990;
  const was = d9(i.was);
  const r = await change(phone, (e) => {
    e.manual = Object.assign({}, e.manual, { name, phone, city, tier, at: (e.manual && e.manual.at) || nowISO(), by: (session && session.employeeId) || '', byName: byName || '' }, i.from ? { from: clean(i.from, 80) } : {});
    delete e.hidden;
    if (i.note != null) { const t = clean(i.note, 200); if (t) e.note = { text: t, at: nowISO(), byName: byName || '' }; else delete e.note; }
  });
  // edited to another number: the old one leaves the list (kept, hidden, with why)
  if (r.ok && was.length === 9 && was !== r.k) await change(was, (e) => { delete e.manual; e.hidden = { at: nowISO(), by: (session && session.employeeId) || '', byName: byName || '', why: 'mutată pe ' + phone }; });
  return r;
}
// „Mută la Interesate”: an open request closed without deleting her (its card held no more), the trail says so, and she is
// here with her card, her clinic and her note
async function fromOrder(id, session, byName) {
  const C = require('./card-sarbatori');
  const list = await readJSON(C.KEY, []);
  const r = list.find((x) => x.id === id);
  if (!r) return { error: 'not_found' };
  if (!['rezervat', 'lead', 'asteptare'].includes(r.status)) return { error: 'not_open' };
  Object.assign(r, { status: 'anulat', cancelledAt: nowISO(), cancelledBy: 'interesate' });
  C.mark(r, 'moved', byName ? 'de ' + byName : '');
  if (C.recOf) C.recOf(r).stop = C.recOf(r).stop || 'moved';
  await writeJSON(C.KEY, list);
  const x = await addManual({ name: r.name || r.hint || 'Fără nume', phone: r.phone, city: r.city, tier: r.tier, note: r.note || undefined, from: 'cerere' }, session, byName);
  return x.error ? x : { ok: true, k: x.k, order: { name: r.name || '', tier: r.tier } };
}

module.exports = { KEY, list, note, hide, addManual, fromOrder };
