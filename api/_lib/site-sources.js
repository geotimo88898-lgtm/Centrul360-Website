// Where the site's customers come from (the owner, 23.11: „să nu fie afișată, doar să avem info stocată”): every booking,
// payment and lead made on the site keeps `src` (api/_lib/booking.js sourceOf: the visit's first touch, the outside page's
// host, the address's tags, the click ids, the app, the classified `from`). Here only counted, per `from`, for the reports:
// GET /api/lead-health?sources=1&days=N. Counts and sums in lei only, never a name, a phone or an order id.
//   booking   the site's bookings (the Calendar's createdBy 'site'), lei = the treatment's price
//   pay       the checkout's orders (api/_lib/pay.js), paid / unpaid, lei = the sum of the order
//   lead      the site's forms (the lead filter, the gift form; createdBy 'site-form'), lei = the lead filter's package
//   card      the Card de Sărbători orders made on the site, paid / unpaid, lei = the order's sum; their source is the one
//             of the checkout order paid for them (linked by ref), else what the card order kept of the page's address
// Older records, made before `src` was saved, are classified from what they kept (the hour held, the booking of the order,
// the card's tags) or counted as 'nesalvat'.
const { readJSON } = require('./store');
const B = require('./booking');

const NONE = 'nesalvat';
const fromOf = (s) => { const x = B.sourceAgain(s); return x ? x.from : ''; };
// a card order's page tags (api/card-sarbatori.js trackOf) read like a site source
const fromTrack = (t) => {
  const x = t || {};
  const tag = { source: x.utm_source, medium: x.utm_medium, campaign: x.utm_campaign, content: x.utm_content, fbclid: x.fbclid ? 1 : 0 };
  return B.sourceOf({ tag }, x.fbc ? '_fbc=fb.' : '', x.ua).from;
};
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function add(box, from, lei) {
  const k = String(from || NONE).slice(0, 60);
  const c = box[k] || (box[k] = { n: 0, lei: 0 });
  c.n++; c.lei = r2(c.lei + (Number(lei) || 0));
}
// { from: { n, lei } } sorted by count, plus the totals
function out(box) {
  const by = {};
  Object.keys(box).sort((a, b) => box[b].n - box[a].n || box[b].lei - box[a].lei).forEach((k) => { by[k] = box[k]; });
  const all = Object.values(box);
  return { n: all.reduce((s, c) => s + c.n, 0), lei: r2(all.reduce((s, c) => s + c.lei, 0)), by };
}

async function report(days) {
  const d = Math.max(1, Math.min(366, Math.round(Number(days) || 30)));
  const since = Date.now() - d * 86400e3;
  const inWin = (iso) => (Date.parse(iso) || 0) >= since;
  const P = require('./pay');
  const [appts, leads, holds, cards, index, open, paidList] = await Promise.all([
    readJSON('data/appointments.json', []), readJSON('data/leads.json', []), readJSON('data/booking-holds.json', []),
    readJSON('data/card-sarbatori.json', []), readJSON(P.INDEX, []), readJSON('data/pay-open.json', []), readJSON('data/pay-paid.json', []),
  ]);
  const apptById = new Map(appts.filter((a) => a && a.id).map((a) => [a.id, a]));
  const holdById = new Map(holds.filter((h) => h && h.id).map((h) => [h.id, h]));

  // bookings
  const booking = {}, bookingSaved = { yes: 0, no: 0 };
  appts.forEach((a) => {
    if (!a || a.createdBy !== 'site' || a.block || !inWin(a.createdAt)) return;
    const f = fromOf(a.src);
    bookingSaved[f ? 'yes' : 'no']++;
    add(booking, f || NONE, a.amount);
  });

  // the checkout's orders: from the index (every order since it exists) and the open and paid lists (the ones before it)
  const ids = new Map();
  [].concat(index, open, paidList).forEach((x) => { if (x && x.id && P.validId(x.id) && (!x.at || inWin(x.at)) && !ids.has(x.id)) ids.set(x.id, 1); });
  const list = [...ids.keys()].slice(-600);
  const orders = [];
  for (let i = 0; i < list.length; i += 25) {
    const part = await Promise.all(list.slice(i, i + 25).map((id) => P.readOrder(id).then((r) => r.data, () => null)));
    part.forEach((o) => { if (o && !o.test && inWin(o.createdAt)) orders.push(o); });
  }
  const payPaid = {}, payOpen = {}, payKinds = {}, paySaved = { yes: 0, no: 0 };
  const cardSrc = new Map(); // card order id → the source of its checkout order (the paid one first)
  orders.sort((a, b) => (a.status === 'paid') - (b.status === 'paid'));
  orders.forEach((o) => {
    let f = fromOf(o.src);
    paySaved[f ? 'yes' : 'no']++;
    if (!f && o.kind === 'hold') { const h = holdById.get(o.ref); f = h ? B.sourceOf(h.src, h.cookie, h.app).from : ''; if (!f && h && h.bookingId) f = fromOf((apptById.get(h.bookingId) || {}).src); }
    if (!f && o.kind === 'booking') f = fromOf((apptById.get(o.ref) || {}).src);
    if (o.kind === 'card' && f) cardSrc.set(o.ref, f);
    const paid = o.status === 'paid';
    add(paid ? payPaid : payOpen, f || NONE, o.amount);
    const k = payKinds[o.kind] || (payKinds[o.kind] = { paid: 0, unpaid: 0 });
    k[paid ? 'paid' : 'unpaid']++;
  });

  // leads of the site's forms
  const lead = {}, leadSaved = { yes: 0, no: 0 };
  let leadFilter = 0;
  leads.forEach((l) => {
    if (!l || l.createdBy !== 'site-form' || !inWin(l.createdAt)) return;
    const f = fromOf(l.src);
    leadSaved[f ? 'yes' : 'no']++;
    if (l.lf) leadFilter++;
    add(lead, f || (l.siteSource ? 'sursa: ' + String(l.siteSource).slice(0, 40) : NONE), l.lf ? Number(l.lf.tier) || 0 : 0);
  });

  // the Card de Sărbători orders of the site
  const cardPaid = {}, cardOpen = {}, cardHow = { checkout: 0, page: 0 };
  cards.forEach((r) => {
    if (!r || r.via !== 'site' || r.test || !inWin(r.created)) return;
    if (r.status === 'anulat') return;
    let f = (r.src && fromOf(r.src)) || cardSrc.get(r.id) || (r.ids || []).map((x) => cardSrc.get(x)).find(Boolean) || '';
    if (f) cardHow.checkout++; else { f = fromTrack(r.track); cardHow.page++; }
    const paid = r.status === 'platit';
    add(paid ? cardPaid : cardOpen, f, paid ? Number(r.paidAmount) || Number(r.amount) : r.amount);
  });

  return {
    ok: true, days: d, since: new Date(since).toISOString(),
    booking: Object.assign(out(booking), { saved: bookingSaved }),
    pay: { paid: out(payPaid), unpaid: out(payOpen), kinds: payKinds, saved: paySaved },
    lead: Object.assign(out(lead), { leadFilter, saved: leadSaved }),
    card: { paid: out(cardPaid), unpaid: out(cardOpen), sourceFrom: cardHow },
  };
}

module.exports = { report };
