// GET /api/offers-kpi?period=max|90d|30d|7d, Admin → Oferte: what each offer brought through the door (admin only).
// Each lead counts for its offer (the interest it came with: the offer's title from its form, or the one picked by
// the team). Every payment (Încasări, upsells included) counts for the lead it came from: the lead of its
// appointment, else the client's latest lead before it; a client with no lead (walk-in, old client) counts nowhere.
// The period picks the leads (by the day they came); their payments count until today. Ad spend (Meta) goes to an
// offer by the leads each ad brought (split by their offers), else by its campaign's leads, else by the name
// (every ad of the period, the deleted ones too).

const { readJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { loadConnection } = require('./_lib/facebook');
const { loadOffers } = require('./_lib/offers');
const ads = require('./_lib/meta-ads');
const { periodRange, bucharestDay } = require('./_lib/ads-funnel');

const DAY = 864e5;
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const r2 = (n) => Math.round(n * 100) / 100;

function rangeOf(period) {
  if (period === '90d') {
    const today = bucharestDay(Date.now());
    return { since: bucharestDay(Date.parse(today + 'T12:00:00Z') - 90 * DAY), until: bucharestDay(Date.parse(today + 'T12:00:00Z') - DAY) };
  }
  return null;
}

module.exports = async (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;
  try {
    const period = ['max', '90d', '30d', '7d'].includes(req.query && req.query.period) ? req.query.period : 'max';
    const range = rangeOf(period);
    const r = period === 'max' ? null : periodRange(period, range);
    const [offers, leads, appointments, sales] = await Promise.all([
      loadOffers(readJSON), readJSON('data/leads.json', []), readJSON('data/appointments.json', []), readJSON('data/sales.json', []),
    ]);
    // the offer of an interest: its title / key / ad name exactly, else the one offer whose name it names
    // ("Liposonix" → "Liposonix · 2 zone"); two offers that would fit: none (no guessing)
    const offerOf = (interest) => {
      const t = fold(interest);
      if (!t) return null;
      const exact = offers.find((o) => fold(o.title) === t || o.key === interest || (o.adName && fold(o.adName) === t));
      if (exact) return exact;
      const head = (o) => fold(String(o.title).split('·')[0]);
      const fits = offers.filter((o) => head(o).length > 3 && (t.includes(head(o)) || head(o).includes(t)));
      return fits.length === 1 ? fits[0] : null;
    };

    // the leads, each with its offer, its day and the clients it became
    const apptById = new Map(appointments.map((a) => [a.id, a]));
    const L = leads.map((l) => {
      const at = Date.parse(l.createdAt) || 0;
      const clients = new Set([l.clientId].concat(appointments.filter((a) => a.leadId === l.id).map((a) => a.clientId)).filter(Boolean));
      const o = offerOf(l.interest);
      return { id: l.id, at, day: bucharestDay(at), clients, key: o ? o.key : '', interest: l.interest || '', forms: Array.isArray(l.forms) ? l.forms : [] };
    }).filter((x) => x.at);
    const leadById = new Map(L.map((x) => [x.id, x]));
    const byClient = new Map();
    L.forEach((x) => x.clients.forEach((c) => { const list = byClient.get(c) || []; list.push(x); byClient.set(c, list); }));
    byClient.forEach((list) => list.sort((a, b) => a.at - b.at));

    // every payment → its lead
    const rows = new Map();
    const rowOf = (key) => {
      if (!rows.has(key)) rows.set(key, { key, leads: 0, clients: new Set(), revenue: 0, upsell: 0, upsells: 0, payments: 0, spend: 0 });
      return rows.get(key);
    };
    const inPeriod = (x) => !r || (x.day >= r.since && x.day <= r.until);
    L.filter(inPeriod).forEach((x) => { rowOf(x.key || (x.interest ? '_other' : '_none')).leads++; });
    sales.forEach((s) => {
      if (s.source !== 'incasare') return;
      const t = Date.parse(s.createdAt || s.date) || 0;
      const appt = s.appointmentId ? apptById.get(s.appointmentId) : null;
      let lead = appt && appt.leadId ? leadById.get(appt.leadId) : null;
      if (!lead && s.clientId) lead = (byClient.get(s.clientId) || []).filter((x) => x.at <= t + DAY).pop() || null;
      if (!lead || !inPeriod(lead)) return;
      const row = rowOf(lead.key || (lead.interest ? '_other' : '_none'));
      row.revenue += Number(s.amount) || 0;
      row.payments++;
      if (Number(s.upsell) > 0) { row.upsell += Number(s.upsell); row.upsells++; }
      row.clients.add(s.clientId || lead.id);
    });

    // the ad spend of the period, by the offers of the leads each ad brought
    let spend = { ready: false, error: '', unassigned: 0, total: 0 };
    const conn = await loadConnection(readJSON);
    if (conn && conn.userToken && conn.adAccountId) {
      const view = await ads.adSpend(conn, period === '90d' ? 'max' : period, range);
      if (view.error) spend.error = view.error;
      else {
        spend.ready = true;
        const perAd = new Map(), perCamp = new Map();
        const count = (map, id, key) => { if (!id) return; const m = map.get(id) || new Map(); m.set(key, (m.get(key) || 0) + 1); map.set(id, m); };
        L.filter(inPeriod).forEach((x) => {
          if (!x.key) return;
          const f = x.forms.slice().sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0))[0];
          if (!f) return;
          count(perAd, f.adId && String(f.adId), x.key);
          count(perCamp, f.campaignId && String(f.campaignId), x.key);
        });
        const share = (m, amount) => { const tot = [...m.values()].reduce((a, b) => a + b, 0); m.forEach((n, key) => { rowOf(key).spend += amount * n / tot; }); };
        const byName = (name) => { const t = fold(name); return offers.find((o) => t && ((o.adName && t.includes(fold(o.adName))) || t.includes(fold(o.title)))); };
        view.rows.forEach((a) => {
          const amount = a.spend;
          if (!amount) return;
          spend.total += amount;
          if (perAd.has(a.adId)) return share(perAd.get(a.adId), amount);
          if (perCamp.has(a.campaignId)) return share(perCamp.get(a.campaignId), amount);
          const o = byName(a.adName) || byName(a.campaignName);
          if (o) rowOf(o.key).spend += amount; else spend.unassigned += amount;
        });
      }
    }

    const title = (key) => (key === '_other' ? 'Alte interese (site, recomandări)' : key === '_none' ? 'Fără procedură' : ((offers.find((o) => o.key === key) || {}).title || key));
    const list = [...rows.values()].map((x) => {
      const clients = x.clients.size;
      return { key: x.key, title: title(x.key), active: !x.key.startsWith('_') && !!(offers.find((o) => o.key === x.key) || {}).active,
        leads: x.leads, clients, payments: x.payments, revenue: r2(x.revenue), upsell: r2(x.upsell), upsells: x.upsells, spend: r2(x.spend),
        roas: x.spend > 0 ? r2(x.revenue / x.spend) : null, perLead: x.leads ? r2(x.revenue / x.leads) : null, cpl: x.spend > 0 && x.leads ? r2(x.spend / x.leads) : null };
    }).filter((x) => x.leads || x.revenue || x.spend).sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
    const sum = (k) => r2(list.reduce((a, x) => a + (x[k] || 0), 0));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ period, range: r, rows: list, totals: { revenue: sum('revenue'), upsell: sum('upsell'), leads: sum('leads'), clients: sum('clients'), spend: sum('spend') },
      spend: { ready: spend.ready, error: spend.error, total: r2(spend.total), unassigned: r2(spend.unassigned) } });
  } catch (err) {
    console.error('offers-kpi error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
