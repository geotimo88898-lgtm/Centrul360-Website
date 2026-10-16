// The clinic's numbers, from START on (the owner's call, 16.10.2026: what came before was brought over from
// HighLevel, without clear data, so it counts as 0). One model of who came from where, used by Admin → Oferte
// (/api/offers-kpi) and the KPI page of Panou (/api/kpi).
//
// What counts:
//   a lead       that came from START on (or came back with a new form from START on)
//   a booking    made in the portal from START on (one already in the calendar, even for a later day, doesn't; nor
//                one imported from HighLevel)
//   a payment    of such a booking; without a booking, one made from START on
// Who came from where: a booking belongs to its lead (the one booked from Pipeline, else the latest lead of the same
// phone / client before it); a payment to its booking's lead, else the client's latest lead before it. A lead from
// an ad's lead form is "from the ads" (its offer, its ad); every other lead is organic, by its source. A payment of
// a client without a lead is "direct", of one whose lead came before START "de dinainte".
//
//   came (prezentată)   the booking is finished or paid
//   due                 its day has passed (or it came, or it was cancelled for a day that passed): show rate = came / due

const { bucharestDay } = require('./ads-funnel');

const cfg = { start: Date.parse('2026-10-16T19:05:00Z') }; // 16 oct 2026, 22:05 in Romania (tests move it)
const DAY = 864e5;
const SOURCES = { facebook: 'Facebook, fără reclamă (mesaje)', instagram: 'Instagram', site: 'Site', recomandare: 'Recomandare', telefon: 'Telefon', walk_in: 'Walk-in', altul: 'Altă sursă',
  direct: 'Clienți fără lead (veniți direct)', old: 'Clienți de dinainte (din HighLevel)' };
const CITIES = ['Timișoara', 'Arad'];
const AUTO_AUTHORS = ['', 'Facebook Lead Ads', 'WhatsApp automat', 'Formular site', 'Automatizare'];

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const r2 = (n) => Math.round(n * 100) / 100;
const ro = (n) => Number(n || 0).toLocaleString('ro-RO', { maximumFractionDigits: 2 });
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const digits9 = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; };
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s + 'T12:00:00Z'));
const median = (list) => { if (!list.length) return null; const s = list.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const cityOf = (s) => (/arad/i.test(String(s || '')) ? 'Arad' : /timi/i.test(String(s || '')) ? 'Timișoara' : '');
const addDay = (day, n) => bucharestDay(Date.parse(day + 'T12:00:00Z') + n * DAY);

// the days of a period (Romania), never before START's day nor after today
const PERIODS = ['today', 'yesterday', '7d', '30d', 'month', 'max', 'custom'];
function rangeOf(period, q, now) {
  const today = bucharestDay(now || Date.now()), first = bucharestDay(cfg.start);
  let r = { since: first, until: today };
  if (period === 'today') r = { since: today, until: today };
  if (period === 'yesterday') r = { since: addDay(today, -1), until: addDay(today, -1) };
  if (period === '7d') r = { since: addDay(today, -6), until: today };
  if (period === '30d') r = { since: addDay(today, -29), until: today };
  if (period === 'month') r = { since: today.slice(0, 8) + '01', until: today };
  if (period === 'custom' && q && isDay(q.since) && isDay(q.until)) { const s = [q.since, q.until].sort(); r = { since: s[0], until: s[1] }; }
  if (r.since < first) r.since = first;
  if (r.until > today) r.until = today;
  if (r.since > r.until) r.since = r.until;
  return r;
}

// the offer of an interest: its title / key / ad name exactly, else the one offer whose name it names
// ("Liposonix" → "Liposonix · 2 zone"); two offers that would fit: none (no guessing)
function offerMatcher(offers) {
  return (interest) => {
    const t = fold(interest);
    if (!t) return null;
    const exact = offers.find((o) => fold(o.title) === t || o.key === interest || (o.adName && fold(o.adName) === t));
    if (exact) return exact;
    const head = (o) => fold(String(o.title).split('·')[0]);
    const fits = offers.filter((o) => head(o).length > 3 && (t.includes(head(o)) || head(o).includes(t)));
    return fits.length === 1 ? fits[0] : null;
  };
}

// who came from where: leads, bookings and payments, linked
function model({ offers = [], leads = [], appointments = [], sales = [], clients = [], conversations = [], now }) {
  const START = cfg.start, NOW = now || Date.now(), today = bucharestDay(NOW);
  const offerOf = offerMatcher(offers);
  const phoneOfClient = new Map(clients.map((c) => [c.id, digits9(c.phone)]));
  // a human's first message to a number on WhatsApp (reception, from the portal or the phone's app)
  const humanOut = new Map();
  conversations.forEach((c) => {
    const p = digits9(c.phone);
    if (!p) return;
    const times = (c.messages || []).filter((m) => m.direction === 'out' && !m.auto && (m.sentBy || m.sentByName === 'din aplicație')).map((m) => Date.parse(m.timestamp)).filter(Number.isFinite).sort((a, b) => a - b);
    if (times.length) humanOut.set(p, times);
  });

  const L = leads.map((l) => {
    const created = Date.parse(l.createdAt) || 0;
    // a lead from before START that came back with a new form from START on counts from then
    const back = created < START ? (l.activities || []).filter((a) => a.type === 'returned').map((a) => Date.parse(a.at)).filter((t) => t >= START).sort((a, b) => a - b)[0] : 0;
    const at = back || created;
    const forms = Array.isArray(l.forms) ? l.forms : [];
    const fromAds = l.createdBy === 'facebook-webhook' || forms.length > 0;
    const form = forms.slice().sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0))[0] || null;
    const o = offerOf(l.interest);
    const src = SOURCES[l.source] && l.source !== 'direct' && l.source !== 'old' ? l.source : 'altul';
    const phone = digits9(l.phone);
    // the first time someone of the team reached her: a call / message logged, a booking, a stage moved, a WhatsApp
    let first = 0, by = '';
    (l.activities || []).forEach((a) => {
      const t = Date.parse(a.at);
      if (!['contact', 'booking', 'stage'].includes(a.type) || AUTO_AUTHORS.includes(a.author || '') || !(t >= at)) return;
      if (!first || t < first) { first = t; by = a.author; }
    });
    const wa = (humanOut.get(phone) || []).find((t) => t >= at);
    if (wa && (!first || wa < first)) { first = wa; by = by || 'WhatsApp'; }
    return { id: l.id, at, day: bucharestDay(at), fresh: at >= START, name: l.name || '', city: cityOf(l.location), phone, clientId: l.clientId || '', apptId: l.appointmentId || '',
      fromAds, offer: o, key: fromAds ? (o ? o.key : '_ads') : 'org:' + src, source: src,
      adId: form && form.adId ? String(form.adId) : '', campaignId: form && form.campaignId ? String(form.campaignId) : '', adName: form ? form.ad || '' : '',
      firstContact: first, contactBy: by, appts: [], pays: [] };
  }).filter((x) => x.at);
  const leadById = new Map(L.map((x) => [x.id, x]));
  const byPhone = new Map(), byClient = new Map(), byAppt = new Map();
  const push = (map, k, x) => { if (!k) return; const list = map.get(k) || []; list.push(x); map.set(k, list); };
  L.forEach((x) => { push(byPhone, x.phone, x); push(byClient, x.clientId, x); if (x.apptId) byAppt.set(x.apptId, x); });
  [byPhone, byClient].forEach((m) => m.forEach((list) => list.sort((a, b) => a.at - b.at)));
  // the latest lead of a phone / client that came before t
  const latestLead = (phone, clientId, t) => {
    const list = [].concat(byPhone.get(phone) || [], byClient.get(clientId) || []).filter((x) => x.at <= t);
    return list.sort((a, b) => a.at - b.at).pop() || null;
  };

  const A = appointments.filter((a) => a && a.status !== 'concediu' && a.date).map((a) => {
    const made = Date.parse(a.createdAt) || 0;
    const imported = a.createdBy === 'highlevel' || !!a.importedAt || !!a.ghlId;
    const phone = digits9(a.clientPhone) || phoneOfClient.get(a.clientId) || '';
    const came = a.status === 'finalizata' || !!a.paidSaleId;
    const cancelled = a.status === 'anulata' && !came;
    const lead = byAppt.get(a.id) || (a.leadId && leadById.get(a.leadId)) || latestLead(phone, a.clientId, made + 5 * 60e3);
    return { id: a.id, made, madeDay: bucharestDay(made || NOW), date: a.date, time: a.time || '', status: a.status, city: cityOf(a.location), treatment: a.treatment || '',
      fresh: made >= START && !imported, came, cancelled, due: came || a.date < today || (cancelled && a.date <= today), upcoming: !came && !cancelled && a.date >= today,
      confirmed: came || a.status === 'confirmata', createdBy: a.createdBy || '', cosmeticianId: a.cosmeticianId || '', clientId: a.clientId || '', phone, paidSaleId: a.paidSaleId || '',
      package: !!a.package, lead, pays: [] };
  });
  const apptById = new Map(A.map((a) => [a.id, a])), apptByPaid = new Map(A.filter((a) => a.paidSaleId).map((a) => [a.paidSaleId, a]));
  A.forEach((a) => { if (a.fresh && a.lead && a.made >= a.lead.at - 5 * 60e3) a.lead.appts.push(a); });

  const P = sales.filter((s) => s && s.source === 'incasare').map((s) => {
    const t = Date.parse(s.createdAt || s.date) || 0;
    const appt = (s.appointmentId && apptById.get(s.appointmentId)) || apptByPaid.get(s.id) || null;
    const counts = appt ? appt.fresh : t >= START;
    const lead = (appt && appt.lead) || latestLead(phoneOfClient.get(s.clientId) || '', s.clientId, t + DAY);
    const key = lead && lead.fresh ? lead.key : lead ? 'org:old' : 'org:direct';
    const p = { id: s.id, t, day: bucharestDay(t), amount: Number(s.amount) || 0, upsell: Number(s.upsell) || 0, appt, lead, key, counts,
      city: cityOf(s.location || (appt && appt.city)), by: s.performedBy || (appt && appt.cosmeticianId) || '', clientId: s.clientId || '' };
    if (appt) appt.pays.push(p);
    if (counts && lead && lead.fresh && t >= lead.at - DAY) lead.pays.push(p);
    return p;
  });
  return { L, A, P, today, now: NOW, start: START, conversations };
}

// ---------------------------------------------------------------- the numbers of a period
const inR = (r) => (day) => day >= r.since && day <= r.until;

function funnelOf(leads) {
  const f = { leads: leads.length, ads: 0, organic: 0, contacted: 0, booked: 0, came: 0, waiting: 0, paid: 0, upsold: 0, revenue: 0, speed: [] };
  leads.forEach((l) => {
    if (l.fromAds) f.ads++; else f.organic++;
    if (l.firstContact) { f.contacted++; f.speed.push((l.firstContact - l.at) / 60e3); }
    if (l.appts.length || l.pays.length) f.booked++; // one who paid was obviously booked and came
    if (l.appts.some((a) => a.came) || l.pays.length) f.came++;
    else if (l.appts.some((a) => a.upcoming)) f.waiting++; // booked, her day hasn't come yet
    if (l.pays.length) f.paid++;
    if (l.pays.some((p) => p.upsell > 0)) f.upsold++;
    f.revenue += l.pays.reduce((n, p) => n + p.amount, 0);
  });
  const sp = f.speed;
  return { leads: f.leads, ads: f.ads, organic: f.organic, contacted: f.contacted, booked: f.booked, came: f.came, waiting: f.waiting, paid: f.paid, upsold: f.upsold, revenue: r2(f.revenue),
    rates: { contacted: pct(f.contacted, f.leads), booked: pct(f.booked, f.leads), came: pct(f.came, f.booked - f.waiting), paid: pct(f.paid, f.leads), upsold: pct(f.upsold, f.paid) },
    speed: { median: sp.length ? Math.round(median(sp)) : null, in5: pct(sp.filter((m) => m <= 5).length, sp.length), in60: pct(sp.filter((m) => m <= 60).length, sp.length) },
    perLead: f.leads ? r2(f.revenue / f.leads) : null };
}
function bookingsOf(list) {
  const b = { made: list.length, confirmed: 0, cancelled: 0, due: 0, came: 0, upcoming: 0, fromLeads: 0, ahead: [], toBook: [] };
  list.forEach((a) => {
    if (a.confirmed) b.confirmed++;
    if (a.cancelled) b.cancelled++;
    if (a.due) b.due++;
    if (a.came) b.came++;
    if (a.upcoming) b.upcoming++;
    if (a.lead && a.lead.fresh) { b.fromLeads++; b.toBook.push((a.made - a.lead.at) / 36e5); }
    b.ahead.push(Math.max(0, (Date.parse(a.date + 'T12:00:00Z') - Date.parse(a.madeDay + 'T12:00:00Z')) / DAY));
  });
  return { made: b.made, confirmed: b.confirmed, cancelled: b.cancelled, due: b.due, came: b.came, missed: b.due - b.came, upcoming: b.upcoming, fromLeads: b.fromLeads,
    rates: { came: pct(b.came, b.due), confirmed: pct(b.confirmed, b.made), cancelled: pct(b.cancelled, b.made) },
    daysAhead: b.ahead.length ? r2(b.ahead.reduce((x, y) => x + y, 0) / b.ahead.length) : null, hoursToBook: b.toBook.length ? Math.round(median(b.toBook)) : null };
}
// the visits of the days of a period (by the booking's day): how many came, the upsells at the visit
function visitsOf(list) {
  const due = list.filter((a) => a.due), came = due.filter((a) => a.came);
  const ups = came.filter((a) => a.pays.some((p) => p.upsell > 0));
  return { scheduled: list.length, due: due.length, came: came.length, missed: due.length - came.length, rate: pct(came.length, due.length),
    upsold: ups.length, upsellRate: pct(ups.length, came.length), upsellValue: r2(ups.reduce((n, a) => n + a.pays.reduce((m, p) => m + p.upsell, 0), 0)) };
}
function moneyOf(list) {
  const rev = list.reduce((n, p) => n + p.amount, 0), ups = list.filter((p) => p.upsell > 0);
  const ads = list.filter((p) => !p.key.startsWith('org:')).reduce((n, p) => n + p.amount, 0);
  return { revenue: r2(rev), payments: list.length, ticket: list.length ? r2(rev / list.length) : null, upsell: r2(ups.reduce((n, p) => n + p.upsell, 0)), upsells: ups.length,
    upsellAvg: ups.length ? r2(ups.reduce((n, p) => n + p.upsell, 0) / ups.length) : null, ads: r2(ads), organic: r2(rev - ads), clients: new Set(list.map((p) => p.clientId || p.id)).size };
}

// each offer (from the ads) and each organic source: leads, bookings, visits, payments, and its share of the spend
function rowsOf(M, r, offers, adRows) {
  const inRange = inR(r);
  const fresh = M.L.filter((x) => x.fresh && inRange(x.day));
  const rows = new Map();
  const rowOf = (key) => {
    if (!rows.has(key)) rows.set(key, { key, leads: 0, booked: 0, came: 0, clients: new Set(), revenue: 0, upsell: 0, upsells: 0, payments: 0, spend: 0 });
    return rows.get(key);
  };
  fresh.forEach((x) => { const row = rowOf(x.key); row.leads++; if (x.appts.length || x.pays.length) row.booked++; if (x.appts.some((a) => a.came) || x.pays.length) row.came++; });
  M.P.forEach((p) => {
    if (!p.counts) return;
    // a lead's payments count for the period of the lead; the others for the day they were paid
    if (p.lead && p.lead.fresh) { if (!inRange(p.lead.day) || p.t < p.lead.at - DAY) return; } else if (!inRange(p.day)) return;
    const row = rowOf(p.key);
    row.revenue += p.amount; row.payments++;
    if (p.upsell > 0) { row.upsell += p.upsell; row.upsells++; }
    row.clients.add(p.clientId || (p.lead ? p.lead.id : p.id));
  });
  const spend = { ready: !!adRows, total: 0, unassigned: 0 };
  if (adRows) {
    const perAd = new Map(), perCamp = new Map();
    const count = (map, id, key) => { if (!id) return; const m = map.get(id) || new Map(); m.set(key, (m.get(key) || 0) + 1); map.set(id, m); };
    fresh.forEach((x) => { if (!x.fromAds) return; count(perAd, x.adId, x.key); count(perCamp, x.campaignId, x.key); });
    const share = (m, amount) => { const tot = [...m.values()].reduce((a, b) => a + b, 0); m.forEach((n, key) => { rowOf(key).spend += amount * n / tot; }); };
    const byName = (name) => { const t = fold(name); return offers.find((o) => t && ((o.adName && t.includes(fold(o.adName))) || t.includes(fold(o.title)))); };
    adRows.forEach((a) => {
      if (!a.spend) return;
      spend.total += a.spend;
      if (perAd.has(a.adId)) return share(perAd.get(a.adId), a.spend);
      if (perCamp.has(a.campaignId)) return share(perCamp.get(a.campaignId), a.spend);
      const o = byName(a.adName) || byName(a.campaignName);
      if (o) rowOf(o.key).spend += a.spend; else spend.unassigned += a.spend;
    });
  }
  const title = (key) => (key === '_ads' ? 'Facebook, fără ofertă' : key.startsWith('org:') ? SOURCES[key.slice(4)] || 'Altă sursă' : ((offers.find((o) => o.key === key) || {}).title || key));
  const list = [...rows.values()].map((x) => ({ key: x.key, group: x.key.startsWith('org:') ? 'organic' : 'ads', title: title(x.key), active: !!(offers.find((o) => o.key === x.key) || {}).active,
    leads: x.leads, booked: x.booked, came: x.came, clients: x.clients.size, payments: x.payments, revenue: r2(x.revenue), upsell: r2(x.upsell), upsells: x.upsells, spend: r2(x.spend),
    bookRate: pct(x.booked, x.leads), cameRate: pct(x.came, x.booked), roas: x.spend > 0 ? r2(x.revenue / x.spend) : null, perLead: x.leads ? r2(x.revenue / x.leads) : null,
    cpl: x.spend > 0 && x.leads ? r2(x.spend / x.leads) : null, cpa: x.spend > 0 && x.clients.size ? r2(x.spend / x.clients.size) : null }))
    .filter((x) => x.leads || x.revenue || x.spend).sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
  return { rows: list, spend: { ready: spend.ready, total: r2(spend.total), unassigned: r2(spend.unassigned) } };
}

// every ad of the period: what Meta counted and what its leads became; the ones doing very well / very badly
function adsOf(M, r, ads) {
  if (!ads) return null;
  const inRange = inR(r);
  const fresh = M.L.filter((x) => x.fresh && x.fromAds && inRange(x.day));
  const byAd = new Map();
  fresh.forEach((x) => { if (!x.adId) return; const list = byAd.get(x.adId) || []; list.push(x); byAd.set(x.adId, list); });
  const rows = ads.rows.map((a) => {
    const f = funnelOf(byAd.get(a.adId) || []);
    const leads = f.leads || 0, base = leads || a.metaLeads;
    return { id: a.adId, name: a.adName, campaign: a.campaignName, adset: a.adsetName || '', status: a.status, thumb: a.thumb, city: cityOf(a.campaignName + ' ' + (a.adsetName || '')),
      spend: r2(a.spend), impressions: a.impressions, reach: a.reach, clicks: a.linkClicks, metaLeads: a.metaLeads, leads, booked: f.booked, came: f.came, clients: f.paid, revenue: f.revenue, upsold: f.upsold,
      ctr: a.impressions ? r2((a.linkClicks / a.impressions) * 100) : null, cpm: a.impressions ? r2((a.spend / a.impressions) * 1000) : null, freq: a.reach ? r2(a.impressions / a.reach) : null,
      cpl: base ? r2(a.spend / base) : null, perBooked: f.booked ? r2(a.spend / f.booked) : null, perCame: f.came ? r2(a.spend / f.came) : null, cpa: f.paid ? r2(a.spend / f.paid) : null,
      roas: a.spend > 0 && f.revenue ? r2(f.revenue / a.spend) : null, bookRate: pct(f.booked, leads) };
  }).filter((a) => a.spend > 0 || a.leads).sort((a, b) => b.spend - a.spend);
  const t = rows.reduce((s, a) => ({ spend: s.spend + a.spend, impressions: s.impressions + a.impressions, reach: s.reach + a.reach, clicks: s.clicks + a.clicks, metaLeads: s.metaLeads + a.metaLeads }), { spend: 0, impressions: 0, reach: 0, clicks: 0, metaLeads: 0 });
  const f = funnelOf(fresh);
  const base = f.leads || t.metaLeads;
  const avgCpl = base ? t.spend / base : null;
  const avgRoas = t.spend > 0 ? f.revenue / t.spend : null, avgBook = f.leads ? (f.booked / f.leads) * 100 : null;
  // very good / very bad, facts only (the owner decides)
  rows.forEach((a) => {
    const good = [], bad = [], soft = [];
    const lead = a.leads || a.metaLeads;
    if (avgCpl && lead >= 3 && a.cpl <= avgCpl * 0.7) good.push(lead + ' leaduri, ' + ro(a.cpl) + ' lei unul (de obicei ' + ro(avgCpl) + ')');
    if (a.roas && a.roas >= 3 && a.clients >= 2 && (!avgRoas || a.roas >= avgRoas * 1.3)) good.push('aduce ' + ro(a.roas) + ' lei la 1 leu dat (de obicei ' + ro(avgRoas) + ')');
    if (a.leads >= 4 && a.bookRate >= 50 && (!avgBook || a.bookRate >= avgBook * 1.3)) good.push(ro(a.bookRate) + '% se programează (de obicei ' + Math.round(avgBook || 0) + '%)');
    if (!lead && a.spend >= Math.max(50, (avgCpl || 0) * 2)) bad.push(ro(a.spend) + ' lei dați, niciun lead');
    if (avgCpl && lead >= 3 && a.cpl >= avgCpl * 1.6) bad.push(ro(a.cpl) + ' lei un lead (de obicei ' + ro(avgCpl) + ')');
    if (a.leads >= 6 && !a.booked) bad.push(a.leads + ' leaduri, nicio programare');
    if (a.impressions >= 3000 && a.ctr != null && a.ctr < 0.6) soft.push('puțini dau click (' + ro(a.ctr) + '%)');
    if (a.freq && a.freq >= 3.5) soft.push('aceleași femei au văzut-o de ' + ro(a.freq) + ' ori');
    a.flag = bad.length ? 'bad' : good.length ? 'top' : soft.length ? 'watch' : '';
    a.why = bad.length ? bad.concat(soft) : good.length ? good.concat(soft) : soft;
  });
  return { rows, daily: ads.daily || [], totals: { spend: r2(t.spend), impressions: t.impressions, reach: t.reach, clicks: t.clicks, metaLeads: t.metaLeads, leads: f.leads, booked: f.booked, came: f.came, clients: f.paid,
    revenue: f.revenue, ctr: t.impressions ? r2((t.clicks / t.impressions) * 100) : null, cpm: t.impressions ? r2((t.spend / t.impressions) * 1000) : null, freq: t.reach ? r2(t.impressions / t.reach) : null,
    cpl: avgCpl != null ? r2(avgCpl) : null, perBooked: f.booked ? r2(t.spend / f.booked) : null, perCame: f.came ? r2(t.spend / f.came) : null, cpa: f.paid ? r2(t.spend / f.paid) : null,
    roas: t.spend > 0 && f.revenue ? r2(f.revenue / t.spend) : null } };
}

// the WhatsApp templates sent in the period (lead welcome, reminders…): delivered, read, answered, booked after;
// and how fast the team answers a client who writes
function messagesOf(M, r, templates) {
  const inRange = inR(r);
  const tpl = new Map((templates || []).map((t) => [t.id, t]));
  const madeByPhone = new Map();
  M.A.forEach((a) => { if (!a.fresh || !a.phone) return; const list = madeByPhone.get(a.phone) || []; list.push(a.made); madeByPhone.set(a.phone, list); });
  const rows = new Map(), waits = [];
  let unanswered = 0, inbound = 0;
  M.conversations.forEach((c) => {
    const msgs = (c.messages || []).map((m) => Object.assign({ t: Date.parse(m.timestamp) }, m)).filter((m) => Number.isFinite(m.t) && m.t >= M.start).sort((a, b) => a.t - b.t);
    const phone = digits9(c.phone);
    msgs.forEach((m, i) => {
      const day = bucharestDay(m.t);
      if (m.direction === 'out' && m.templateId && inRange(day)) {
        const t = tpl.get(m.templateId) || {};
        const key = m.templateId;
        if (!rows.has(key)) rows.set(key, { id: key, label: t.label || 'Șablon șters', group: (t.leadOffers || []).length ? 'lead' : /^reamintir/i.test(t.label || '') ? 'reminder' : 'other', auto: 0, sent: 0, failed: 0, delivered: 0, read: 0, replied: 0, booked: 0, waits: [] });
        const row = rows.get(key);
        row.sent++;
        if (m.auto) row.auto++;
        if (m.status === 'failed') { row.failed++; return; }
        if (m.deliveredAt || m.status === 'delivered' || m.status === 'read') row.delivered++;
        if (m.readAt || m.status === 'read') row.read++;
        const reply = msgs.slice(i + 1).find((x) => x.direction === 'in' && x.t - m.t <= 3 * DAY);
        if (reply) { row.replied++; row.waits.push((reply.t - m.t) / 60e3); }
        if ((madeByPhone.get(phone) || []).some((t) => t > m.t && t - m.t <= 7 * DAY)) row.booked++;
      }
      // a client writes (the first message after ours): how long until someone of the team answers
      if (m.direction === 'in' && inRange(day) && (i === 0 || msgs[i - 1].direction !== 'in')) {
        inbound++;
        const ans = msgs.slice(i + 1).find((x) => x.direction === 'out' && !x.auto && (x.sentBy || x.sentByName === 'din aplicație'));
        if (ans) waits.push((ans.t - m.t) / 60e3);
        else if (M.now - m.t > 30 * 60e3) unanswered++;
      }
    });
  });
  const list = [...rows.values()].map((x) => ({ id: x.id, label: x.label, group: x.group, sent: x.sent, auto: x.auto, failed: x.failed, delivered: x.delivered, read: x.read, replied: x.replied, booked: x.booked,
    deliveredRate: pct(x.delivered, x.sent - x.failed), readRate: pct(x.read, x.sent - x.failed), replyRate: pct(x.replied, x.sent - x.failed), bookRate: pct(x.booked, x.sent - x.failed),
    replyMin: x.waits.length ? Math.round(median(x.waits)) : null })).sort((a, b) => b.sent - a.sent);
  return { rows: list, team: { inbound, answered: waits.length, unanswered, median: waits.length ? Math.round(median(waits)) : null, in15: pct(waits.filter((w) => w <= 15).length, waits.length) } };
}

// who did what: bookings made (and how many came), first calls to new leads, visits with upsells
function teamOf(M, r, names) {
  const inRange = inR(r);
  const nameOf = (id) => names.get(id) || (id === 'admin' ? 'Admin' : '');
  const book = new Map(), care = new Map(), call = new Map();
  const get = (map, k, z) => { if (!map.has(k)) map.set(k, Object.assign({ name: k }, z)); return map.get(k); };
  M.A.filter((a) => a.fresh && inRange(a.madeDay)).forEach((a) => {
    const n = nameOf(a.createdBy); if (!n) return;
    const x = get(book, n, { made: 0, due: 0, came: 0, revenue: 0 });
    x.made++; if (a.due) x.due++; if (a.came) x.came++;
    x.revenue += a.pays.filter((p) => p.counts).reduce((s, p) => s + p.amount, 0);
  });
  M.A.filter((a) => a.fresh && a.came && inRange(a.date)).forEach((a) => {
    const n = nameOf(a.cosmeticianId || (a.pays[0] && a.pays[0].by)); if (!n) return;
    const x = get(care, n, { came: 0, upsold: 0, upsell: 0, revenue: 0 });
    x.came++;
    const up = a.pays.reduce((s, p) => s + p.upsell, 0);
    if (up > 0) { x.upsold++; x.upsell += up; }
    x.revenue += a.pays.reduce((s, p) => s + p.amount, 0);
  });
  M.L.filter((l) => l.fresh && l.firstContact && inRange(l.day)).forEach((l) => {
    const x = get(call, l.contactBy || 'Altcineva', { contacted: 0, mins: [] });
    x.contacted++; x.mins.push((l.firstContact - l.at) / 60e3);
  });
  return {
    booking: [...book.values()].map((x) => Object.assign(x, { revenue: r2(x.revenue), rate: pct(x.came, x.due) })).sort((a, b) => b.made - a.made),
    care: [...care.values()].map((x) => Object.assign(x, { upsell: r2(x.upsell), revenue: r2(x.revenue), rate: pct(x.upsold, x.came) })).sort((a, b) => b.came - a.came),
    contact: [...call.values()].map((x) => ({ name: x.name, contacted: x.contacted, median: Math.round(median(x.mins)), in5: pct(x.mins.filter((m) => m <= 5).length, x.mins.length) })).sort((a, b) => b.contacted - a.contacted),
  };
}

// where they come from: the ads (all together) and each organic source; the leads of the period and the money paid in it
// (the same money as the period's total, unlike the offers, whose money follows their leads)
function sourcesOf(M, r) {
  const inRange = inR(r), map = new Map();
  const get = (k) => { const key = k.startsWith('org:') ? k : 'ads'; if (!map.has(key)) map.set(key, { key, title: key === 'ads' ? 'Din reclame' : SOURCES[key.slice(4)] || 'Altă sursă', leads: 0, revenue: 0 }); return map.get(key); };
  M.L.filter((l) => l.fresh && inRange(l.day)).forEach((l) => { get(l.key).leads++; });
  M.P.filter((p) => p.counts && inRange(p.day)).forEach((p) => { get(p.key).revenue += p.amount; });
  return [...map.values()].map((x) => Object.assign(x, { revenue: r2(x.revenue) })).sort((a, b) => (a.key === 'ads' ? -1 : b.key === 'ads' ? 1 : b.revenue - a.revenue || b.leads - a.leads));
}

function citiesOf(M, r) {
  const inRange = inR(r);
  return CITIES.map((city) => {
    const leads = M.L.filter((l) => l.fresh && inRange(l.day) && l.city === city);
    const made = M.A.filter((a) => a.fresh && inRange(a.madeDay) && a.city === city);
    const visits = M.A.filter((a) => a.fresh && inRange(a.date) && a.date <= M.today && a.city === city);
    const pays = M.P.filter((p) => p.counts && inRange(p.day) && p.city === city);
    return { city, leads: leads.length, booked: leads.filter((l) => l.appts.length).length, made: made.length, visits: visitsOf(visits), money: moneyOf(pays) };
  });
}

function trendOf(M, r, daily) {
  const days = [];
  for (let d = r.since; d <= r.until && days.length < 120; d = addDay(d, 1)) days.push(d);
  const spend = new Map((daily || []).map((x) => [x.day, x.spend]));
  return days.map((day) => ({ day,
    leads: M.L.filter((l) => l.fresh && l.day === day).length,
    made: M.A.filter((a) => a.fresh && a.madeDay === day).length,
    came: M.A.filter((a) => a.fresh && a.came && a.date === day).length,
    revenue: r2(M.P.filter((p) => p.counts && p.day === day).reduce((n, p) => n + p.amount, 0)),
    spend: r2(spend.get(day) || 0) }));
}

// today / yesterday / this month side by side (whatever the period picked)
function paceOf(M) {
  const first = bucharestDay(M.start);
  const win = (since, until) => {
    const r = { since: since < first ? first : since, until };
    if (r.since > r.until) return null;
    const inRange = inR(r);
    return { leads: M.L.filter((l) => l.fresh && inRange(l.day)).length, bookings: bookingsOf(M.A.filter((a) => a.fresh && inRange(a.madeDay))),
      visits: visitsOf(M.A.filter((a) => a.fresh && inRange(a.date) && a.date <= M.today)), revenue: r2(M.P.filter((p) => p.counts && inRange(p.day)).reduce((n, p) => n + p.amount, 0)) };
  };
  const y = addDay(M.today, -1);
  return { today: win(M.today, M.today), yesterday: win(y, y), month: win(M.today.slice(0, 8) + '01', M.today) };
}

// what stands out in the period, facts only
function alertsOf(rep) {
  const out = [];
  const f = rep.funnel, b = rep.bookings, v = rep.visits;
  (rep.ads ? rep.ads.rows : []).forEach((a) => {
    if (a.flag === 'top') out.push({ tone: 'good', kind: 'ad', title: 'Reclamă care merge foarte bine', name: a.name, text: a.why.join(' · '), id: a.id });
    if (a.flag === 'bad' && a.status === 'ACTIVE') out.push({ tone: 'bad', kind: 'ad', title: 'Reclamă care merge rău', name: a.name, text: a.why.join(' · '), id: a.id });
    if (a.flag === 'watch' && a.status === 'ACTIVE') out.push({ tone: 'warn', kind: 'ad', title: 'Reclamă de urmărit', name: a.name, text: a.why.join(' · '), id: a.id });
  });
  const notCalled = f.leads - f.contacted;
  if (notCalled > 0) out.push({ tone: 'warn', kind: 'lead', title: 'Leaduri nesunate', name: notCalled + ' din ' + f.leads, text: 'nimeni nu le-a contactat încă', go: 'pipeline' });
  if (f.speed.median != null && f.speed.median > 30 && f.contacted >= 5) out.push({ tone: 'warn', kind: 'speed', title: 'Leadurile așteaptă mult', name: 'în medie ' + f.speed.median + ' minute', text: 'până la primul contact', go: 'pipeline' });
  if (v.rate != null && v.due >= 5 && v.rate < 65) out.push({ tone: 'bad', kind: 'show', title: 'Multe cliente nu vin', name: v.rate + '% au venit', text: v.missed + ' din ' + v.due + ' n-au venit', go: 'programari' });
  if (b.rates.cancelled != null && b.made >= 5 && b.rates.cancelled >= 25) out.push({ tone: 'warn', kind: 'cancel', title: 'Multe anulări', name: b.rates.cancelled + '% anulate', text: b.cancelled + ' din ' + b.made + ' programări', go: 'programari' });
  (rep.messages ? rep.messages.rows : []).forEach((m) => {
    if (m.group === 'lead' && m.sent >= 10 && m.replyRate != null && m.replyRate < 20) out.push({ tone: 'warn', kind: 'msg', title: 'Mesaj cu puține răspunsuri', name: m.label, text: m.replyRate + '% răspund din ' + m.sent, go: 'automatizari' });
  });
  if (rep.messages && rep.messages.team.unanswered > 0) out.push({ tone: 'warn', kind: 'wa', title: 'Cliente fără răspuns pe WhatsApp', name: String(rep.messages.team.unanswered), text: 'au scris și n-au primit răspuns de peste 30 de minute', go: 'whatsapp' });
  return out;
}

function report(M, r, { offers = [], ads = null, templates = [], names = new Map() } = {}) {
  const inRange = inR(r);
  const leads = M.L.filter((l) => l.fresh && inRange(l.day));
  const rep = {
    range: r, start: new Date(M.start).toISOString(), today: M.today,
    funnel: funnelOf(leads),
    bookings: bookingsOf(M.A.filter((a) => a.fresh && inRange(a.madeDay))),
    visits: visitsOf(M.A.filter((a) => a.fresh && inRange(a.date) && a.date <= M.today)),
    money: moneyOf(M.P.filter((p) => p.counts && inRange(p.day))),
    pace: paceOf(M),
    offers: rowsOf(M, r, offers, ads ? ads.rows : null),
    ads: adsOf(M, r, ads),
    messages: messagesOf(M, r, templates),
    team: teamOf(M, r, names),
    cities: citiesOf(M, r),
    sources: sourcesOf(M, r),
    trend: trendOf(M, r, ads && ads.daily),
  };
  rep.alerts = alertsOf(rep);
  return rep;
}

// Meta's numbers of a period, kept 2 minutes (the page refreshes itself; Meta limits how often it may be asked)
const adsCache = new Map();
async function adsFor(conn, r) {
  if (!conn || !conn.userToken || !conn.adAccountId) return { none: true };
  const key = conn.adAccountId + '|' + r.since + '|' + r.until;
  const hit = adsCache.get(key);
  if (hit && Date.now() - hit.at < 120e3) return hit.v;
  const v = await require('./meta-ads').adStats(conn, r);
  if (!v.error) { adsCache.set(key, { at: Date.now(), v }); if (adsCache.size > 30) adsCache.delete(adsCache.keys().next().value); }
  return v;
}

module.exports = { adsFor, cfg, DAY, SOURCES, PERIODS, rangeOf, offerMatcher, model, rowsOf, adsOf, messagesOf, report, digits9, fold };
