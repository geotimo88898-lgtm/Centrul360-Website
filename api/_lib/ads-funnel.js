// What the ads brought after the lead form (Admin → Reclame): for every Facebook lead of the period,
// did she book, did she come, did she pay, how much, was there an upsell. Each lead counts for the ad
// that brought it (by the ad's id, or by the campaign + ad names for leads saved before the ids were
// kept), and so for its ad set and campaign.
//
//   booked   an appointment made for her (not cancelled), or the lead reached the "booked" stage
//   showed   an appointment finished or paid, or the lead went past the "booked" stage
//   client   at least one payment (Încasări) from her, or the lead is "won"
//   revenue  her payments since the lead; upsells: payments with "Upsell efectuat" (count and value)

const DAY = 864e5;

// the account's days (Romania): today, and the range of a period like Meta counts it
function bucharestDay(t) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}
function periodRange(period, range) {
  if (range) return range;
  const today = bucharestDay(Date.now());
  const back = (n) => bucharestDay(Date.parse(today + 'T12:00:00Z') - n * DAY);
  if (period === 'today') return { since: today, until: today };
  if (period === 'yesterday') return { since: back(1), until: back(1) };
  if (period === '30d') return { since: back(30), until: back(1) };
  if (period === 'max') return null;
  return { since: back(7), until: back(1) }; // 7d, like Meta's last_7d (without today)
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// leads → per ad / ad set / campaign: { leads, booked, showed, clients, revenue, upsells, upsellValue }
function funnel({ leads, appointments, sales, stages, ads, period, range }) {
  const r = periodRange(period, range);
  const stageList = Array.isArray(stages) ? stages : [];
  const bookedIdx = stageList.findIndex((s) => s.kind === 'booked');
  const idxOf = (id) => stageList.findIndex((s) => s.id === id);
  const kindOf = (id) => (stageList.find((s) => s.id === id) || {}).kind || 'open';

  const apptsByLead = new Map(), apptsByClient = new Map();
  (appointments || []).forEach((a) => {
    if (a.leadId) { const l = apptsByLead.get(a.leadId) || []; l.push(a); apptsByLead.set(a.leadId, l); }
    if (a.clientId) { const l = apptsByClient.get(a.clientId) || []; l.push(a); apptsByClient.set(a.clientId, l); }
  });
  const paysByClient = new Map();
  (sales || []).forEach((s) => {
    if (s.source !== 'incasare' || !s.clientId) return;
    const l = paysByClient.get(s.clientId) || []; l.push(s); paysByClient.set(s.clientId, l);
  });

  // the ads, to find a lead's ad by id or by names
  const adById = new Map(), adByNames = new Map(), campByName = new Map();
  (ads || []).forEach((a) => {
    adById.set(a.id, a);
    const k = norm(a.campaignName) + '|' + norm(a.name);
    if (!adByNames.has(k)) adByNames.set(k, a);
    if (!adByNames.has('|' + norm(a.name))) adByNames.set('|' + norm(a.name), a);
    if (a.campaignName && !campByName.has(norm(a.campaignName))) campByName.set(norm(a.campaignName), a.campaignId);
  });

  const out = { ads: new Map(), adsets: new Map(), campaigns: new Map(), unmatched: zero() };
  const add = (map, id, ev) => { if (!id) return; const x = map.get(id) || zero(); plus(x, ev); map.set(id, x); };

  (leads || []).forEach((l) => {
    const forms = Array.isArray(l.forms) ? l.forms : [];
    if (!forms.length && l.source !== 'facebook') return;
    // the submission of the period (the newest one), its day in Romania
    const entries = (forms.length ? forms : [{ at: l.createdAt }]).map((f) => ({ f, t: Date.parse(f.sentAt || f.at || l.createdAt) })).filter((x) => Number.isFinite(x.t));
    const inRange = entries.filter((x) => { const d = bucharestDay(x.t); return !r || (d >= r.since && d <= r.until); });
    if (!inRange.length) return;
    const pick = inRange.sort((a, b) => b.t - a.t)[0];
    const f = pick.f, since = pick.t - DAY;

    const appts = (apptsByLead.get(l.id) || []).concat(l.clientId ? (apptsByClient.get(l.clientId) || []) : [])
      .filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i)
      .filter((a) => Date.parse(a.createdAt || a.date) >= since && a.status !== 'anulata' && a.status !== 'concediu');
    const pays = (l.clientId ? (paysByClient.get(l.clientId) || []) : []).filter((s) => Date.parse(s.createdAt || s.date) >= since);
    const stIdx = idxOf(l.stage), kind = kindOf(l.stage);
    const lost = kind === 'lost';
    const ev = { leads: 1, booked: 0, showed: 0, clients: 0, revenue: 0, upsells: 0, upsellValue: 0 };
    ev.booked = appts.length || l.appointmentId || (!lost && bookedIdx >= 0 && stIdx >= bookedIdx) ? 1 : 0;
    ev.showed = appts.some((a) => a.status === 'finalizata' || a.paidSaleId) || pays.length || (!lost && bookedIdx >= 0 && stIdx > bookedIdx) ? 1 : 0;
    ev.clients = pays.length || kind === 'won' ? 1 : 0;
    ev.revenue = pays.reduce((n, s) => n + (Number(s.amount) || 0), 0);
    ev.upsells = pays.filter((s) => Number(s.upsell) > 0).length;
    ev.upsellValue = pays.reduce((n, s) => n + (Number(s.upsell) || 0), 0);
    if (ev.showed) ev.booked = 1;
    if (ev.clients) { ev.booked = 1; ev.showed = 1; }

    const ad = (f.adId && adById.get(String(f.adId))) || adByNames.get(norm(f.campaign) + '|' + norm(f.ad)) || (f.ad ? adByNames.get('|' + norm(f.ad)) : null);
    if (ad) { add(out.ads, ad.id, ev); add(out.adsets, ad.adsetId, ev); add(out.campaigns, ad.campaignId, ev); return; }
    const campId = (f.campaignId && String(f.campaignId)) || campByName.get(norm(f.campaign));
    if (campId) add(out.campaigns, campId, ev);
    else plus(out.unmatched, ev);
  });
  return out;
}
function zero() { return { leads: 0, booked: 0, showed: 0, clients: 0, revenue: 0, upsells: 0, upsellValue: 0 }; }
function plus(x, ev) { Object.keys(ev).forEach((k) => { x[k] = (x[k] || 0) + ev[k]; }); }

module.exports = { funnel, periodRange, bucharestDay, zero };
