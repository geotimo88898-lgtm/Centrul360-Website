// Online booking on the site (the owner, 4.11: "fă să se poată programa clientele singure pe site, iar noi să facem
// doar reamintirile și confirmările"). The free hours come from the portal's own Calendar (data/appointments.json):
// the clinic's hours per weekday, how many clients it takes at once, minus what is booked, blocked or on leave.
// A booking made here is an ordinary appointment of the Calendar (createdBy 'site'), so the booking flows
// (Automatizări → Reamintiri) send its confirmation and reminders like for any other.
//
// data/booking.json (Setări → Programări online, admin): { on, step, notice, ahead, cities: { <city>: { days: {
//   <0-6, 0 = Sunday>: { on, from, to, at } }, closed: [YYYY-MM-DD] } } }. What is not saved there comes from DEFAULTS.

const { readJSON } = require('./store');
const { loadOffers } = require('./offers');

const KEY = 'data/booking.json';
const CITIES = ['Timișoara', 'Arad'];
const CITY_KEY = { 'Timișoara': 'timisoara', Arad: 'arad' };

// From the Calendar's last weeks (4.11): Timișoara Monday to Friday 9 to about 20:30, two clients at once most of the
// day; Arad Monday to Friday 10 to 19, one at a time; no bookings on Saturdays lately (closed), none on Sundays.
const week = (from, to, at) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { on: d >= 1 && d <= 5, from, to, at }]));
const DEFAULTS = {
  on: true,
  step: 30,      // the grid of start times, minutes
  notice: 120,   // the earliest start from now, minutes
  ahead: 21,     // how many days ahead can be booked
  cities: {
    'Timișoara': { days: week('09:00', '20:00', 2), closed: [] },
    Arad: { days: week('10:00', '19:00', 1), closed: [] },
  },
};

const CONSULT = { id: 'consult', title: 'Consultație gratuită', sub: 'Evaluare, plan personalizat și prețul exact. Fără obligații.', price: 0, old: 0, minutes: 30, cat: '' };

const clip = (s, n) => String(s == null ? '' : s).trim().slice(0, n);
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const toMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? +m[1] * 60 + +m[2] : null; };
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
const addDay = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const weekday = (d) => new Date(d + 'T12:00:00Z').getUTCDay();

// Bucharest's date and minute of the day, now
function roNow(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms == null ? Date.now() : ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return { date: g('year') + '-' + g('month') + '-' + g('day'), min: Number(g('hour')) * 60 + Number(g('minute')) };
}

// The settings as saved, filled in from DEFAULTS and cleaned (also what the admin's form sends back)
function clean(input) {
  const s = input && typeof input === 'object' ? input : {};
  const num = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const time = (v, d) => (toMin(v) != null && toMin(v) <= 24 * 60 ? hhmm(toMin(v)) : d);
  const out = {
    on: s.on === undefined ? DEFAULTS.on : !!s.on,
    step: [15, 30, 60].includes(Number(s.step)) ? Number(s.step) : DEFAULTS.step,
    notice: num(s.notice, 0, 72 * 60, DEFAULTS.notice),
    ahead: num(s.ahead, 1, 90, DEFAULTS.ahead),
    cities: {},
  };
  CITIES.forEach((c) => {
    const def = DEFAULTS.cities[c], got = (s.cities && s.cities[c]) || {};
    const days = {};
    [0, 1, 2, 3, 4, 5, 6].forEach((d) => {
      const x = (got.days && got.days[d]) || {}, dd = def.days[d];
      const from = time(x.from, dd.from), to = time(x.to, dd.to);
      days[d] = { on: x.on === undefined ? dd.on : !!x.on, from, to: toMin(to) > toMin(from) ? to : dd.to, at: num(x.at, 0, 10, dd.at) };
    });
    const closed = (Array.isArray(got.closed) ? got.closed : def.closed).filter(isDate).sort().slice(-200);
    out.cities[c] = { days, closed: [...new Set(closed)] };
  });
  return out;
}

async function settings() { return clean(await readJSON(KEY, null)); }

// how long a treatment takes in the Calendar (the clinic's own medians, 4.11): HIFU on the chin 30 min, a full body
// laser 90, the rest an hour
function minutesOf(o) {
  const t = fold((o.title || '') + ' ' + (o.key || ''));
  if (/hifu/.test(t) && /gus|barbie|gat/.test(t)) return 30;
  if (o.category === 'epilare' || /epilare|laser/.test(t)) return /full/.test(t) ? 90 : 60;
  return 60;
}
// the Calendar's three categories from an offer's (site) category, or from a treatment's name
function catOf(o) {
  if (o.category === 'epilare') return 'epilare-laser';
  if (o.category === 'faciale') return 'faciale';
  if (o.category === 'remodelare') return 'corporale';
  const t = fold(o.title);
  return /epil|laser/.test(t) ? 'epilare-laser' : /facial|ten|rid|gus|barbie|pete|acnee|hifu|microneedling|sebum|redness|lifting/.test(t) ? 'faciale' : 'corporale';
}
const plain = (s) => String(s || '').replace(/\s+[–—-]\s+/g, ': ').replace(/[–—]/g, '-');

// what can be booked in a city: the free consultation, then the offers of the site sold there
async function services(city) {
  const ck = CITY_KEY[city];
  const offers = (await loadOffers(readJSON, null)).filter((o) => o && o.active && (!Array.isArray(o.locations) || !o.locations.length || o.locations.includes(ck)))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  return [CONSULT].concat(offers.map((o) => ({ id: o.key, title: plain(o.title), sub: '', price: Number(o.priceNew) || 0, old: Number(o.priceOld) || 0, minutes: minutesOf(o), cat: catOf(o) })));
}

// a treatment named on a page that is not an offer ("Microneedling"): booked by its name, an hour
function custom(label, city) {
  const t = clip(String(label || '').replace(/[^\p{L}\p{N} .,+·&/()%-]/gu, ''), 80);
  if (city === 'Arad' && /\bems\b|epil|laser/.test(fold(t))) return null; // EMS and laser hair removal: Timișoara only
  return t.length >= 3 ? { id: 'custom', title: t, sub: '', price: 0, old: 0, minutes: 60, cat: catOf({ title: t }) } : null;
}

// What is taken on a day at a clinic: the intervals (minutes from midnight, how many places each takes), how many
// places are gone all day (a cosmetician on leave), whether the clinic is closed (a block for the whole day)
function busy(appts, city, date, skipId) {
  const iv = [], off = new Set();
  let closed = false;
  (appts || []).forEach((a) => {
    if (!a || a.location !== city || a.date !== date || a.status === 'anulata' || (skipId && a.id === skipId)) return;
    const s = toMin(a.time), e0 = toMin(a.endTime);
    const leave = a.status === 'concediu' || a.block;
    if (s == null) { if (leave) { if (a.cosmeticianId) off.add(a.cosmeticianId); else closed = true; } return; }
    const e = e0 != null && e0 > s ? e0 : s + 60;
    iv.push([s, e, leave && !a.cosmeticianId ? Infinity : 1]);
  });
  return { iv, cut: off.size, closed };
}
// the most places taken at once between two minutes
function peak(iv, s, e) {
  const pts = [s].concat(iv.filter((x) => x[0] > s && x[0] < e).map((x) => x[0]));
  return Math.max(0, ...pts.map((p) => iv.reduce((n, x) => n + (x[0] <= p && x[1] > p ? x[2] : 0), 0)));
}

// The start times free on a day for a treatment of so many minutes
function freeOn(cfg, city, date, minutes, appts, now) {
  const c = cfg.cities[city];
  if (!c || !isDate(date)) return [];
  const n = now || roNow();
  if (date < n.date || date > addDay(n.date, cfg.ahead - 1) || c.closed.includes(date)) return [];
  const d = c.days[weekday(date)];
  if (!d || !d.on) return [];
  const b = busy(appts, city, date);
  const cap = d.at - b.cut;
  if (b.closed || cap < 1) return [];
  const open = toMin(d.from), close = toMin(d.to), earliest = date === n.date ? n.min + cfg.notice : -1;
  const out = [];
  for (let t = open; t + minutes <= close; t += cfg.step) {
    if (t < earliest) continue;
    if (peak(b.iv, t, t + minutes) < cap) out.push(hhmm(t));
  }
  return out;
}

// every bookable day ahead with its free hours: [{ date, slots }]
function days(cfg, city, minutes, appts) {
  const n = roNow();
  return Array.from({ length: cfg.ahead }, (_, i) => addDay(n.date, i)).map((date) => ({ date, slots: freeOn(cfg, city, date, minutes, appts, n) }));
}

// Two clients sent the same hour at the same moment: true when this appointment does not fit any more next to the
// others, and it is the later one (the earlier one keeps the hour)
function overbooked(cfg, appts, entry) {
  const c = cfg.cities[entry.location], d = c && c.days[weekday(entry.date)];
  if (!d) return false;
  const others = appts.filter((a) => a.id !== entry.id);
  const b = busy(others, entry.location, entry.date);
  const s = toMin(entry.time), e = toMin(entry.endTime) || s + 60;
  if (b.closed || peak(b.iv, s, e) + 1 > d.at - b.cut) {
    // the one that came first stays: only a later site booking that overlaps gives way
    const rivals = others.filter((a) => a.createdBy === 'site' && a.location === entry.location && a.date === entry.date && a.status !== 'anulata'
      && toMin(a.time) < e && (toMin(a.endTime) || toMin(a.time) + 60) > s);
    return !rivals.length || rivals.every((a) => String(a.createdAt) < String(entry.createdAt) || (a.createdAt === entry.createdAt && a.id < entry.id));
  }
  return false;
}

module.exports = { KEY, CITIES, DEFAULTS, CONSULT, clean, settings, services, custom, freeOn, days, overbooked, roNow, toMin, hhmm, addDay, isDate, minutesOf, catOf, fold };
