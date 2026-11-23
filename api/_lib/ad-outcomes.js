// What every ad brought in the end (Admin → Reclame, the owner, 23.11: „vreau să știu tot tot tot”), the same numbers for a
// lead-form ad and a website ad: bookings, visits to the clinic, Card de Sărbători orders, the money in Încasări.
//
// A touch is a woman reaching us from an ad: a form lead of a Meta lead form (its ad by id, or by the campaign and ad names),
// or a record of the site carrying a website ad's tags (a card order, a booking, a payment or a form of the site; matched to
// the ad in api/ads-manager.js). Her phone links a touch to what she did later. Every action of hers (a booking, a card
// order, a payment) counts once, for her first touch of the 30 days before it; and for the period of that touch (the
// cohort: what the period's ads brought, whenever it came, up to 30 days later).
//   booked   women who booked (any appointment, not cancelled)    showed   women who came (finished or paid)
//   cardRes  cards reserved to pay at the clinic                   cardPaid / cardPaidLei   cards paid (online or there)
//   cardOpen cards started online, not paid                        cashed / cashedOnline    lei in Încasări (all / online)
// Counts and sums only: never a name or a phone in what it returns.
const { bucharestDay } = require('./ads-funnel');

const DAY = 864e5, AFTER = 30 * DAY, BEFORE = 3600e3; // an action up to 30 days after the touch (an hour before: clocks)
const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const KEYS = ['booked', 'showed', 'cardRes', 'cardPaid', 'cardPaidLei', 'cardOpen', 'cashed', 'cashedOnline'];
const zero = () => Object.fromEntries(KEYS.map((k) => [k, 0]));

// a form's ad among the period's ads: by its id, else by the campaign and ad names (the leads saved before the ids were kept)
function matcher(ads) {
  const byId = new Map(), byNames = new Map(), campByName = new Map(), count = new Map();
  (ads || []).forEach((a) => {
    byId.set(String(a.id), a);
    const k = norm(a.campaignName) + '|' + norm(a.name);
    if (!byNames.has(k)) byNames.set(k, a);
    if (!byNames.has('|' + norm(a.name))) byNames.set('|' + norm(a.name), a);
    count.set(norm(a.name), (count.get(norm(a.name)) || 0) + 1);
    if (a.campaignName && !campByName.has(norm(a.campaignName))) campByName.set(norm(a.campaignName), a.campaignId);
  });
  return (f) => {
    const campaignId = (f.campaignId && String(f.campaignId)) || campByName.get(norm(f.campaign)) || '';
    const ad = (f.adId && byId.get(String(f.adId))) || byNames.get(norm(f.campaign) + '|' + norm(f.ad)) || (f.ad && !campaignId && count.get(norm(f.ad)) === 1 ? byNames.get('|' + norm(f.ad)) : null);
    return ad ? { adId: ad.id, campaignId: ad.campaignId } : campaignId ? { adId: '', campaignId } : null;
  };
}

// { leads, appointments, sales, cards, clients, siteTouches: [{ phone, t, adId, campaignId }], ads: [{ id, name, campaignId,
// campaignName }], range: { since, until } | null } → { ads: Map(adId → counts), campaigns: Map(campaignId → counts of the
// touches without an ad of the list) }
function outcomes({ leads, appointments, sales, cards, clients, siteTouches, ads, range }) {
  const match = matcher(ads);
  const touches = new Map(); // phone → [{ t, adId, campaignId }]
  const touch = (phone, t, where) => {
    const p = d9(phone);
    if (p.length !== 9 || !Number.isFinite(t) || !where) return;
    const l = touches.get(p) || [];
    l.push({ t, adId: where.adId || '', campaignId: where.campaignId || '' });
    touches.set(p, l);
  };
  (leads || []).forEach((l) => (Array.isArray(l.forms) ? l.forms : []).forEach((f) => touch(l.phone, Date.parse(f.sentAt || f.at || l.createdAt), match(f))));
  (siteTouches || []).forEach((x) => touch(x.phone, x.t, x));
  touches.forEach((l) => l.sort((a, b) => a.t - b.t));

  const out = { ads: new Map(), campaigns: new Map() };
  const inRange = (t) => { if (!range) return true; const d = bucharestDay(t); return d >= range.since && d <= range.until; };
  // the touch an action at time t of this phone counts for: her first one of the 30 days before it, in the period
  const firstOf = (phone, t) => {
    const l = Number.isFinite(t) && touches.get(d9(phone));
    if (!l) return null;
    const x = l.find((y) => t >= y.t - BEFORE && t - y.t <= AFTER);
    return x && inRange(x.t) ? x : null;
  };
  const people = new Map(); // touch → the women already counted as booked / showed for it
  const give = (x, ev, person) => {
    const box = x.adId ? out.ads : out.campaigns, id = x.adId || x.campaignId;
    const c = box.get(id) || zero();
    if (person) {
      const k = id + '|' + person.what, seen = people.get(k) || new Set();
      if (seen.has(person.phone)) return;
      seen.add(person.phone); people.set(k, seen);
    }
    Object.keys(ev).forEach((k) => { c[k] = r2(c[k] + ev[k]); });
    box.set(id, c);
  };

  // bookings and visits: a woman once per touch
  const apptById = new Map();
  (appointments || []).forEach((a) => {
    apptById.set(a.id, a);
    if (!a || a.block || a.status === 'anulata' || a.status === 'concediu') return;
    const x = firstOf(a.clientPhone, Date.parse(a.createdAt || a.date));
    if (!x) return;
    give(x, { booked: 1 }, { what: 'b', phone: d9(a.clientPhone) });
    if ((a.status === 'finalizata' && !a.noShow) || a.paidSaleId) give(x, { showed: 1 }, { what: 's', phone: d9(a.clientPhone) });
  });
  // the Card de Sărbători orders
  const cardById = new Map();
  (cards || []).forEach((r) => {
    if (!r) return;
    cardById.set(r.id, r);
    if (r.test || !['platit', 'rezervat', 'asteptare', 'matching'].includes(r.status)) return;
    const x = firstOf(r.phone, Date.parse(r.created));
    if (!x) return;
    give(x, r.status === 'platit' ? { cardPaid: 1, cardPaidLei: Number(r.paidAmount) || Number(r.amount) || 0 } : r.status === 'rezervat' ? { cardRes: 1 } : { cardOpen: 1 });
  });
  // the money: every row of Încasări, by her phone (its own, her booking's, her card's, her client's); a refund takes it back
  const clientPhone = new Map((clients || []).filter((c) => c && c.id).map((c) => [c.id, c.phone]));
  (sales || []).forEach((s) => {
    if (!s || s.source !== 'incasare' || !Number(s.amount)) return;
    const phone = s.clientPhone || (apptById.get(s.appointmentId) || {}).clientPhone || (cardById.get(s.cardOrderId) || {}).phone || clientPhone.get(s.clientId);
    const x = firstOf(phone, Date.parse(s.createdAt || s.date));
    if (!x) return;
    give(x, Object.assign({ cashed: Number(s.amount) }, s.online ? { cashedOnline: Number(s.amount) } : {}));
  });
  return out;
}

module.exports = { outcomes, matcher, KEYS, zero };
