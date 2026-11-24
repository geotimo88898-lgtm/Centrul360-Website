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
