// „Despre ea”: what reception needs to know before calling someone on the Cardul de Sărbători lists (the owner, 24.11:
// „detalii despre fiecare lead ca să știe recepția cât de cât despre ce să vorbească la telefon”), from her phone: is she a
// client (visits, the treatments she did, the last one, what she paid, a package rest, her next booking, the no-shows),
// her forms (when, for what, from which ad, the team's notes on the lead), what she wrote us on WhatsApp lately, which
// card message she got and her other card orders. Read only, for the desk (api/card-sarbatori.js action 'who').
const { readJSON } = require('./store');

const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const day = (t) => String(t || '').slice(0, 10);
const NOSHOW = /neprezent|no_?show/i;
const r0 = (n) => Math.round(Number(n) || 0);

async function who(phone) {
  const k = d9(phone);
  if (k.length !== 9) return { error: 'bad_phone' };
  const P = 'cardblast/';
  const [clients, appts, leads, sales, dues, convos, orders, st, sent] = await Promise.all([
    readJSON('data/clients.json', []), readJSON('data/appointments.json', []), readJSON('data/leads.json', []), readJSON('data/sales.json', []),
    readJSON('data/client-dues.json', []), readJSON('data/whatsapp-conversations.json', []), readJSON('data/card-sarbatori.json', []),
    readJSON(P + 'state.json', null).catch(() => null), readJSON(P + 'sent.json', null).catch(() => null)]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
  const mine = (clients || []).filter((c) => c && d9(c.phone) === k);
  const ids = new Set(mine.map((c) => c.id));
  const hers = (a) => a && !a.block && ((a.clientId && ids.has(a.clientId)) || d9(a.clientPhone) === k);
  const ap = (appts || []).filter(hers);
  const done = ap.filter((a) => a.status === 'finalizata').sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const next = ap.filter((a) => a.date >= today && !['anulata', 'finalizata', 'concediu'].includes(a.status) && !NOSHOW.test(a.status || ''))
    .sort((a, b) => String(a.date + a.time).localeCompare(String(b.date + b.time)))[0] || null;
  const noShows = ap.filter((a) => NOSHOW.test(a.status || '')).length;
  const treat = [];
  done.forEach((a) => { const t = String(a.treatment || '').trim(); if (t && !treat.includes(t)) treat.push(t); });
  const pays = (sales || []).filter((s) => s && s.source === 'incasare' && s.kind !== 'refund' && s.clientId && ids.has(s.clientId) && Number(s.amount) > 0);
  const spent = pays.reduce((n, s) => n + Number(s.amount), 0);
  const rest = (dues || []).filter((d) => d && d.clientId && ids.has(d.clientId) && Number(d.total) - Number(d.paid) > 0 && !d.closedAt)
    .map((d) => ({ what: String(d.what || d.treatment || 'Pachet').slice(0, 60), rest: r0(Number(d.total) - Number(d.paid)), total: r0(d.total) }));
  const lf = (leads || []).filter((l) => l && d9(l.phone) === k).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const forms = lf.slice(0, 4).map((l) => {
    const acts = (l.activities || l.notes || []).filter((x) => x && (x.text || '').trim() && x.type !== 'created')
      .sort((a, b) => String(b.at || b.createdAt || '').localeCompare(String(a.at || a.createdAt || ''))).slice(0, 3)
      .map((x) => ({ at: x.at || x.createdAt || '', text: String(x.text).slice(0, 160), by: x.author || '' }));
    return { at: l.createdAt || '', what: String(l.interest || '').slice(0, 80), src: l.source || '', ad: String((l.form && l.form.ad) || '').slice(0, 80),
      city: l.location || '', lost: l.lostReason || '', notes: acts };
  });
  const cv = (convos || []).filter((c) => c && d9(c.phone) === k);
  const said = [];
  cv.forEach((c) => (c.messages || []).forEach((m) => { if (m && m.direction === 'in' && String(m.text || '').trim()) said.push({ at: m.timestamp || '', text: String(m.text).slice(0, 200) }); }));
  said.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const inList = st && Array.isArray(st.list) ? st.list.find((p) => p && p.k === k) : null;
  const got = sent && sent[k] && !sent[k].e ? sent[k] : null;
  const cards = (orders || []).filter((o) => o && d9(o.phone) === k).sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')))
    .map((o) => ({ at: o.created || '', tier: o.tier, status: o.status, pay: o.pay || '' }));
  const first = [mine.map((c) => c.createdAt || c.created || ''), lf.map((l) => l.createdAt || '')].flat().filter(Boolean).sort()[0] || '';
  return {
    ok: true,
    kind: done.length ? 'client' : lf.length ? 'lead' : mine.length ? 'fisa' : 'nou',
    since: day(first),
    source: (mine.find((c) => c.source) || {}).source || (lf[lf.length - 1] || {}).source || '',
    visits: done.length,
    last: done[0] ? { date: done[0].date, treatment: done[0].treatment || '', city: done[0].location || '' } : null,
    treatments: treat.slice(0, 6),
    spent: r0(spent),
    rest,
    next: next ? { date: next.date, time: next.time || '', treatment: next.treatment || '', status: next.status || '' } : null,
    noShows,
    forms,
    said: said.slice(0, 3),
    cardMsg: got ? { at: got.at || '', batch: inList ? inList.batch || '' : '' } : null,
    cards,
  };
}

module.exports = { who };

// who reception has already talked to (the owner, 24.11: „să scoatem toate doamnele cu care am vorbit deja, adică le-am
// sunat deja”), by phone: marked by hand on the row („Am vorbit cu ea”), a call logged on her lead since the campaign
// started (answered: not „nu răspunde”), or a note on her request or on Interesate that says so. Map k → { at, by, how }.
const CALLED_KEY = 'data/card-called.json';
const FROM = '2026-11-20';
const fold = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SPOKE = /\b(sunat\w*|vorbit|am vorbit|a zis|zice|spune ca|revine|reven\w*|nu (mai )?vrea|nu e interesat\w*|nu este interesat\w*|nu doreste|programat\w*|vine (la|pe|in|maine|luni|marti|miercuri|joi|vineri|sambata)|se gandeste|trimis link\w*)\b/;
const NOT_SPOKE = /\b(nu (a )?raspun\w*|nu raspunde|nu rasp|inchis|ocupat|nu se poate apela|nu a putut fi contactat\w*)\b/;
const spokeNote = (t) => { const f = fold(t); return !!f && SPOKE.test(f) && !NOT_SPOKE.test(f); };
async function calledMap() {
  const [marks, leads, orders, intd] = await Promise.all([readJSON(CALLED_KEY, {}), readJSON('data/leads.json', []), readJSON('data/card-sarbatori.json', []), readJSON('data/card-interested.json', null).catch(() => null)]);
  const out = new Map();
  const put = (k, v) => { if (k.length !== 9) return; const p = out.get(k); if (!p || String(v.at) > String(p.at)) out.set(k, v); };
  Object.entries(marks || {}).forEach(([k, v]) => { if (v && !v.off) put(k, { at: v.at || '', by: v.by || '', how: 'mark' }); });
  (leads || []).forEach((l) => {
    const k = d9(l && l.phone);
    (l && l.activities || []).forEach((a) => {
      if (!a || a.type !== 'contact' || String(a.at || '') < FROM) return;
      if (a.outcome === 'nu_raspunde') return;
      put(k, { at: a.at, by: a.author || '', how: a.channel === 'whatsapp' ? 'whatsapp' : 'call', outcome: a.outcome || '' });
    });
  });
  (orders || []).forEach((r) => { if (r && spokeNote(r.note)) put(d9(r.phone), { at: r.noteAt || r.updatedAt || r.created || '', by: r.noteBy || '', how: 'note' }); });
  Object.entries((intd && intd.people) || {}).forEach(([key, v]) => { const n = v && v.note; if (n && spokeNote(n.text)) put(d9(key), { at: n.at || '', by: n.byName || '', how: 'note' }); });
  // a mark taken back by hand wins over the rest
  Object.entries(marks || {}).forEach(([k, v]) => { if (v && v.off) out.delete(k); });
  return out;
}
async function markCalled(phone, on, byName) {
  const k = d9(phone);
  if (k.length !== 9) return { error: 'bad_phone' };
  const { writeJSON } = require('./store');
  const m = await readJSON(CALLED_KEY, {});
  m[k] = on ? { at: new Date().toISOString(), by: byName || '' } : { off: true, at: new Date().toISOString(), by: byName || '' };
  await writeJSON(CALLED_KEY, m);
  return { ok: true, called: !!on };
}
module.exports.calledMap = calledMap;
module.exports.markCalled = markCalled;
module.exports.spokeNote = spokeNote;
