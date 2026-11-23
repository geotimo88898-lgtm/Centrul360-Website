// The hour held while she pays online in the slip (the owner, 23.11: no name / phone step before paying online; the payment
// screen asks for them). Tapping „Plătesc online” holds the hour for HOLD_MIN minutes: the site shows it taken to everyone
// else, and nothing is booked yet. Paid (myPOS's signed word, api/_lib/pay.js kind 'hold'): the booking is made from the hold
// with the name and phone she gave on the payment screen. Not paid: the hold runs out and the hour is free again.
//   data/booking-holds.json  [{ id, city, svc: { id, title, price, old, minutes, cat, treatment }, date, time, endTime, until,
//                                page, src, cookie, track, contact: { name, phone, consent, at }, orderIds, bookingId, released }]
const crypto = require('crypto');
const store = require('./store');

const KEY = 'data/booking-holds.json';
const HOLD_MIN = 15;
const nowISO = () => new Date().toISOString();
// a hold keeps the hour while it runs; one paid (booking made) or given up doesn't
const live = (h, at) => !!h && !h.released && !h.bookingId && Date.parse(h.until) > (at || Date.now());
const asAppts = (list) => (list || []).filter((h) => live(h)).map((h) => ({ id: 'hold-' + h.id, location: h.city, date: h.date, time: h.time, endTime: h.endTime, status: 'hold' }));

async function edit(fn) {
  for (let round = 0; round < 6; round++) {
    const { data, etag } = await store.readJSONTagged(KEY, []);
    const list = Array.isArray(data) ? data : [];
    const out = fn(list);
    if (out === false) return list;
    // the old ones go (a day after they ran out)
    const keep = list.filter((h) => Date.parse(h.until) > Date.now() - 86400e3 || (h.orderIds || []).length && !h.bookingId && !h.released && Date.parse(h.until) > Date.now() - 3 * 86400e3);
    if (await store.writeJSONIf(KEY, keep.slice(-300), etag, { quiet: true })) return keep;
  }
  throw new Error('holds_busy');
}
async function all() { return store.readJSON(KEY, []); }
async function get(id) { return (await all()).find((h) => h && h.id === id) || null; }
async function add(h) {
  const hold = Object.assign({ id: crypto.randomBytes(9).toString('hex'), until: new Date(Date.now() + HOLD_MIN * 60e3).toISOString(), createdAt: nowISO(), orderIds: [] }, h);
  await edit((list) => { list.push(hold); });
  return hold;
}
async function patch(id, fn) {
  let hit = null;
  await edit((list) => { const h = list.find((x) => x && x.id === id); if (!h) return false; if (fn(h) === false) return false; hit = h; });
  return hit;
}
const release = (id) => patch(id, (h) => { if (h.bookingId || h.released) return false; h.released = nowISO(); });

module.exports = { KEY, HOLD_MIN, live, asAppts, all, get, add, patch, release };
