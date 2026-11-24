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

// the ad tags of a source saved earlier: utm_campaign, utm_content (lower case) and Meta's ad id (c360_ad={{ad.id}})
const tagsOf = (s) => {
  const t = (s && s.tag) || {};
  const low = (v) => String(v || '').trim().toLowerCase().slice(0, 80);
  return { source: low(t.source), campaign: low(t.campaign), content: low(t.content), ad: /^\d{5,25}$/.test(String(t.ad || '')) ? String(t.ad) : '' };
};
// a Meta ad's link (utm_source facebook / instagram / meta, or its ad id): not a WhatsApp or Google link of the same name
const fromMeta = (m) => !!(m && (m.ad || (m.campaign && /facebook|^fb$|instagram|^ig$|meta/.test(m.source))));
const tagged = (m) => !!(m && (m.campaign || m.ad));
// a card order's page tags (api/card-sarbatori.js trackOf) and its page's address (the ad id is only there)
function tagsOfCard(r) {
  const x = r.track || {};
  let ad = '';
  try { ad = new URL(String(r.page || ''), 'https://www.centrul360.com').searchParams.get('c360_ad') || ''; } catch (e) { /* not an address */ }
  return tagsOf({ tag: { source: x.utm_source, campaign: x.utm_campaign, content: x.utm_content, ad } });
}

// every booking, checkout order, lead and card order of the site made in the window (inWin(iso)), each with where she
// came from (`from`) and the ad's tags (`m`); the same walk for the report by source and the numbers per ad
async function collect(inWin) {
  const P = require('./pay');
  const [appts, leads, holds, cards, index, open, paidList] = await Promise.all([
    readJSON('data/appointments.json', []), readJSON('data/leads.json', []), readJSON('data/booking-holds.json', []),
    readJSON('data/card-sarbatori.json', []), readJSON(P.INDEX, []), readJSON('data/pay-open.json', []), readJSON('data/pay-paid.json', []),
  ]);
  const apptById = new Map(appts.filter((a) => a && a.id).map((a) => [a.id, a]));
  const holdById = new Map(holds.filter((h) => h && h.id).map((h) => [h.id, h]));
  const items = [];

  // bookings
  appts.forEach((a) => {
    if (!a || a.createdBy !== 'site' || a.block || !inWin(a.createdAt)) return;
    const s = B.sourceAgain(a.src);
    items.push({ kind: 'booking', from: s ? s.from : '', m: tagsOf(s), lei: a.amount, phone: a.clientPhone, at: a.createdAt, id: a.id });
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
  const cardSrc = new Map(); // card order id → the source of its checkout order (the paid one first)
  orders.sort((a, b) => (a.status === 'paid') - (b.status === 'paid'));
  orders.forEach((o) => {
    let s = B.sourceAgain(o.src);
    const saved = !!(s && s.from);
    if (!saved && o.kind === 'hold') { const h = holdById.get(o.ref); s = h ? B.sourceOf(h.src, h.cookie, h.app) : null; if (!(s && s.from) && h && h.bookingId) s = B.sourceAgain((apptById.get(h.bookingId) || {}).src); }
    if (!(s && s.from) && o.kind === 'booking') s = B.sourceAgain((apptById.get(o.ref) || {}).src);
    if (o.kind === 'card' && s && s.from) cardSrc.set(o.ref, s);
    // a card's checkout order: the card's ad (its lead form's, inherited: src.ad = { adId, campaignId, ... }) names it exactly
    const m = tagsOf(s), inh = o.src && o.src.ad && typeof o.src.ad === 'object' ? o.src.ad : null;
    if (inh && /^\d{5,25}$/.test(String(inh.adId || ''))) { m.ad = String(inh.adId); m.source = m.source || 'facebook'; }
    items.push({ kind: 'pay', saved, from: s ? s.from : '', m, paid: o.status === 'paid', payKind: o.kind, lei: o.amount, phone: o.phone, at: o.createdAt, id: o.id, ref: o.ref, paidAt: o.paidAt });
  });

  // leads of the site's forms
  leads.forEach((l) => {
    if (!l || l.createdBy !== 'site-form' || !inWin(l.createdAt)) return;
    const s = B.sourceAgain(l.src);
    items.push({ kind: 'lead', saved: !!(s && s.from), from: s ? s.from : '', m: tagsOf(s), lf: !!l.lf, siteSource: l.siteSource, lei: l.lf ? Number(l.lf.tier) || 0 : 0, phone: l.phone, at: l.createdAt, id: l.id });
  });

  // the Card de Sărbători orders of the site
  cards.forEach((r) => {
    if (!r || r.via !== 'site' || r.test || !inWin(r.created)) return;
    if (r.status === 'anulat' || r.status === 'draft') return;
    const own = r.src ? B.sourceAgain(r.src) : null;
    const s = (own && own.from ? own : null) || cardSrc.get(r.id) || (r.ids || []).map((x) => cardSrc.get(x)).find(Boolean) || null;
    // the ad's tags: the order's own source, else its checkout order's, else the page's address
    const m = [own, s].map(tagsOf).find(tagged) || tagsOfCard(r);
    const paid = r.status === 'platit';
    items.push({ kind: 'card', how: s ? 'checkout' : 'page', from: s ? s.from : fromTrack(r.track), m, paid, status: r.status, pay: r.pay,
      lei: paid ? Number(r.paidAmount) || Number(r.amount) : r.amount, phone: r.phone, at: r.created, id: r.id });
  });
  return items;
}

async function report(days) {
  const d = Math.max(1, Math.min(366, Math.round(Number(days) || 30)));
  const since = Date.now() - d * 86400e3;
  const items = await collect((iso) => (Date.parse(iso) || 0) >= since);
  const booking = {}, bookingSaved = { yes: 0, no: 0 };
  const payPaid = {}, payOpen = {}, payKinds = {}, paySaved = { yes: 0, no: 0 };
  const lead = {}, leadSaved = { yes: 0, no: 0 };
  let leadFilter = 0;
  const cardPaid = {}, cardOpen = {}, cardHow = { checkout: 0, page: 0 };
  items.forEach((x) => {
    if (x.kind === 'booking') { bookingSaved[x.from ? 'yes' : 'no']++; add(booking, x.from || NONE, x.lei); }
    if (x.kind === 'pay') {
      paySaved[x.saved ? 'yes' : 'no']++;
      add(x.paid ? payPaid : payOpen, x.from || NONE, x.lei);
      const k = payKinds[x.payKind] || (payKinds[x.payKind] = { paid: 0, unpaid: 0 });
      k[x.paid ? 'paid' : 'unpaid']++;
    }
    if (x.kind === 'lead') {
      leadSaved[x.saved ? 'yes' : 'no']++;
      if (x.lf) leadFilter++;
      add(lead, x.from || (x.siteSource ? 'sursa: ' + String(x.siteSource).slice(0, 40) : NONE), x.lei);
    }
    if (x.kind === 'card') { cardHow[x.how]++; add(x.paid ? cardPaid : cardOpen, x.from, x.lei); }
  });
  return {
    ok: true, days: d, since: new Date(since).toISOString(),
    booking: Object.assign(out(booking), { saved: bookingSaved }),
    pay: { paid: out(payPaid), unpaid: out(payOpen), kinds: payKinds, saved: paySaved },
    lead: Object.assign(out(lead), { leadFilter, saved: leadSaved }),
    card: { paid: out(cardPaid), unpaid: out(cardOpen), sourceFrom: cardHow },
  };
}

// What the website ads brought, per ad (Admin → Reclame, 23.11): the site's records of the days { since, until } (the
// Bucharest days, both in; null: every day) that carry an ad's tags, grouped by Meta's ad id (c360_ad) or, without it, by
// utm_campaign + utm_content. Counts and sums in lei only.
//   cardPaid / cardPaidLei   cards paid online         cardRes / cardResLei   cards to pay at the clinic (reserved, or paid there)
//   cardOpen                 cards started online, not paid
//   book                     bookings of any treatment  pay / payLei           the checkout's paid orders, the cards' apart
//   lead                     the site's forms
const SITE_ZERO = () => ({ cardPaid: 0, cardPaidLei: 0, cardRes: 0, cardResLei: 0, cardOpen: 0, book: 0, pay: 0, payLei: 0, lead: 0 });
function count(box, x) {
  const lei = Number(x.lei) || 0;
  if (x.kind === 'card') {
    if (x.paid && x.pay !== 'clinica') { box.cardPaid++; box.cardPaidLei = r2(box.cardPaidLei + lei); }
    else if (x.status === 'rezervat' || (x.paid && x.pay === 'clinica')) { box.cardRes++; box.cardResLei = r2(box.cardResLei + lei); }
    else box.cardOpen++;
  } else if (x.kind === 'booking') box.book++;
  else if (x.kind === 'pay') { if (x.paid && x.payKind !== 'card') { box.pay++; box.payLei = r2(box.payLei + lei); } }
  else if (x.kind === 'lead') box.lead++;
}
const MEMO = { at: 0, p: null };
async function byAd(days) {
  const { bucharestDay } = require('./ads-funnel');
  const inWin = (iso) => {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return false;
    if (!days) return true;
    const d = bucharestDay(t);
    return d >= days.since && d <= days.until;
  };
  // every day read once: the period's records counted, all of them kept as touches
  // (the same reading for 90 seconds in this worker: Reclame asks for several periods one after another)
  if (!MEMO.at || Date.now() - MEMO.at > 90e3) MEMO.p = collect((iso) => Number.isFinite(Date.parse(iso))), MEMO.at = Date.now();
  let every;
  try { every = await MEMO.p; } catch (e) { MEMO.at = 0; throw e; }
  // the checkout's paid orders, every one (Încasat: the ones not yet in Încasări; never in an answer)
  const orders = every.filter((x) => x.kind === 'pay' && x.paid).map((x) => ({ id: x.id, ref: x.ref || '', kind: x.payKind, lei: Number(x.lei) || 0, phone: x.phone || '', t: Date.parse(x.at) }));
  const all = every.filter((x) => fromMeta(x.m));
  // which record came from which ad, who and when (only for api/ads-manager.js withOutcomes, never in an answer)
  const touches = all.map((x) => ({ phone: x.phone || '', t: Date.parse(x.at), ad: x.m.ad, campaign: x.m.campaign, content: x.m.content, kind: x.kind, id: x.id || '', ref: x.payKind === 'card' ? x.ref || '' : '' }));
  const items = all.filter((x) => inWin(x.at));
  const ads = {}, pairs = {};
  items.forEach((x) => {
    const k = x.m.ad ? x.m.ad : '';
    const box = k ? (ads[k] = ads[k] || Object.assign(SITE_ZERO(), { campaign: x.m.campaign, content: x.m.content }))
      : (pairs[x.m.campaign + '|' + x.m.content] = pairs[x.m.campaign + '|' + x.m.content] || Object.assign(SITE_ZERO(), { campaign: x.m.campaign, content: x.m.content }));
    count(box, x);
  });
  return { ok: true, days: days || null, ads, pairs: Object.values(pairs), touches, orders };
}

module.exports = { report, byAd, SITE_ZERO };
