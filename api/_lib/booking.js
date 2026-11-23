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
const T = require('./team-schedule');

const KEY = 'data/booking.json';
const CITIES = ['Timișoara', 'Arad'];
const CITY_KEY = { 'Timișoara': 'timisoara', Arad: 'arad' };

// From the Calendar's last weeks (4.11): Timișoara Monday to Friday 9 to about 20:30, Arad Monday to Friday 10 to 19;
// no bookings on Saturdays lately (closed), none on Sundays. One client at a time (5.11: the second cosmetician who
// came on Tuesdays and Fridays in Timișoara doesn't come any more). Changed in Calendar → Online.
const week = (from, to, at, two) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, { on: d >= 1 && d <= 5, from, to, at: (two || []).includes(d) ? 2 : at }]));
const DEFAULTS = {
  on: true,
  step: 30,      // the grid of start times, minutes
  notice: 180,   // the earliest start from now, minutes: the same day too, but 3 hours ahead at least (the owner, 5.11)
  ahead: 21,     // how many days ahead can be booked
  cities: {
    'Timișoara': { days: week('09:00', '20:00', 1), closed: [] },
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
// (one formatter, the date and hour of each hour kept: Romania's offset is whole hours, so the minute is the UTC one)
const RO_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const roOfHour = new Map();
function roNow(ms) {
  const t = ms == null ? Date.now() : typeof ms === 'number' ? ms : new Date(ms).getTime();
  const parts = (x) => { const p = RO_FMT.formatToParts(new Date(x)); const g = (k) => (p.find((y) => y.type === k) || {}).value; return { date: g('year') + '-' + g('month') + '-' + g('day'), hour: Number(g('hour')) }; };
  if (!Number.isFinite(t)) { const q = parts(ms); return { date: q.date, min: NaN }; }
  const h = Math.floor(t / 3600e3);
  let v = roOfHour.get(h);
  if (v === undefined) { if (roOfHour.size > 50000) roOfHour.clear(); v = parts(h * 3600e3); roOfHour.set(h, v); }
  return { date: v.date, min: v.hour * 60 + Math.floor((t - h * 3600e3) / 60e3) };
}

// The settings as saved, filled in from DEFAULTS and cleaned (also what the admin's form sends back)
function clean(input) {
  const s = input && typeof input === 'object' ? input : {};
  const num = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const time = (v, d) => (toMin(v) != null && toMin(v) <= 24 * 60 ? hhmm(toMin(v)) : d);
  const out = {
    on: s.on === undefined ? DEFAULTS.on : !!s.on,
    step: [15, 30, 60].includes(Number(s.step)) ? Number(s.step) : DEFAULTS.step,
    notice: num(s.notice, 180, 72 * 60, DEFAULTS.notice),
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

// With { team: true }: Programul echipei rides along (not saved, not sent back): once a city has a weekly schedule, the
// clients it takes at an hour are the cosmeticians working then (api/_lib/team-schedule.js), not the day's „at”.
async function settings(opts) {
  if (!(opts && opts.team)) return clean(await readJSON(KEY, null));
  const [raw, doc, people, emps] = await Promise.all([readJSON(KEY, null), T.load(), T.people(), readJSON('data/employees.json', [])]);
  const out = clean(raw);
  // the cities a cosmetician left („A plecat”, _lib/left.js): without a schedule there, no more clients at once than the
  // cosmeticians still there
  const gone = (Array.isArray(emps) ? emps : []).filter((e) => e && e.role === 'cosmetician' && e.active === false && e.leftAt);
  const leftIn = new Set(gone.map((e) => e.location));
  // the ones who left, up to their last day: the calendar's fill of a past day counts their hours (api/_lib/clinic.js)
  const until = new Map(gone.filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(String(e.leftAt))).map((e) => [e.id, e.leftAt]));
  Object.defineProperty(out, 'team', { value: { doc, ids: new Set(people.map((p) => p.id)), people, leftIn, until, gone: gone.filter((e) => until.has(e.id)).map((e) => ({ id: e.id, location: T.CITIES.includes(e.location) ? e.location : '', leftAt: e.leftAt })) }, enumerable: false });
  return out;
}

// The cosmetician a site booking goes straight to (the owner, 13.11: in Arad „direct pe Andrea, e singura cosmeticiană
// de acolo”, the client chooses no one): the only one working in that city at that hour (Programul echipei), or, while
// the city has no schedule, the only active cosmetician of that city not on leave that day. Only in a city with one
// cosmetician of its own (Timișoara, with three, stays as it was: reception assigns). More of them, or none: null.
// cfg from settings({ team: true }).
function soleCosmetician(cfg, city, date, time, appts) {
  const t = cfg && cfg.team;
  if (!t || !t.people || t.people.filter((p) => p.location === city).length > 1) return null;
  const m = toMin(time);
  const byId = new Map(t.people.map((p) => [p.id, p]));
  const pick = T.hasSchedule(t.doc, city, t.ids)
    ? T.whoWorks(t.doc, date, city, { appts, ids: t.ids }).filter((w) => m != null && toMin(w.from) <= m && toMin(w.to) > m).map((w) => byId.get(w.employeeId)).filter(Boolean)
    : t.people.filter((p) => p.location === city && !T.onLeave(appts, p.id, date));
  return pick.length === 1 ? pick[0] : null;
}

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

// what can be booked in a city: the free consultation, then the offers sold there; for the site's booking ({ site: true })
// only the offers of the site (an offer kept for the ads with site: false, like Full Body at its ads price since 19.11,
// is booked from the site by its name, at the clinic's price)
async function services(city, opts) {
  const ck = CITY_KEY[city];
  const site = !!(opts && opts.site);
  const offers = (await loadOffers(readJSON, null)).filter((o) => o && o.active && !(site && o.site === false) && (!Array.isArray(o.locations) || !o.locations.length || o.locations.includes(ck)))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  return [CONSULT].concat(offers.map((o) => ({ id: o.key, title: plain(o.title), sub: '', price: Number(o.priceNew) || 0, old: Number(o.priceOld) || 0, minutes: minutesOf(o), cat: catOf(o) })));
}

// a treatment named on a page that is not an offer ("Microneedling"): booked by its name, an hour
function custom(label, city) {
  const t = clip(String(label || '').replace(/[^\p{L}\p{N} .,+·&/()%-]/gu, ''), 80);
  if (city === 'Arad' && /\bems\b|epil|laser/.test(fold(t))) return null; // EMS and laser hair removal: Timișoara only
  // a full body laser takes 90 minutes, as the offer did (minutesOf); the rest an hour
  const minutes = /full\s*body/.test(fold(t)) && /epil|laser/.test(fold(t)) ? 90 : 60;
  return t.length >= 3 ? { id: 'custom', title: t, sub: '', price: 0, old: 0, minutes, cat: catOf({ title: t }) } : null;
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
  return { iv, cut: off.size, offIds: [...off], closed };
}
// How many clients fit at each minute of a day: the day's „at” minus the cosmeticians on leave, or, once the city has a
// weekly schedule, the cosmeticians working at that minute (their leave already counted) and not on their break
// (team-schedule.js dayBreaks). edges: the minutes it changes.
function capOf(cfg, city, date, d, b, appts) {
  const t = cfg.team;
  if (!t || !T.hasSchedule(t.doc, city, t.ids)) {
    const here = t && t.leftIn && t.leftIn.has(city) ? t.people.filter((p) => p.location === city).length : 0;
    // only a cosmetician's leave takes a place (16.11: reception's or the manager's day off doesn't)
    const cut = t && t.people ? b.offIds.filter((id) => t.people.some((p) => p.id === id) || (t.gone || []).some((g) => g.id === id)).length : b.cut;
    const n = (here ? Math.min(d.at, here) : d.at) - cut;
    return { team: false, at: () => n, edges: [], max: n };
  }
  const shifts = T.whoWorks(t.doc, date, city, { appts, ids: t.ids }).map((w) => [toMin(w.from), toMin(w.to)]);
  // her break (the owner, 16.11): she is not a place during it (one cosmetician on: that half hour is gone; two: one less)
  const breaks = T.dayBreaks(t.doc, date, city, { appts, ids: t.ids }).filter((b) => b.on).map((b) => [toMin(b.from), toMin(b.to)]);
  const n = (list, p) => list.filter((x) => x[0] <= p && x[1] > p).length;
  return { team: true, at: (p) => n(shifts, p) - n(breaks, p), edges: [].concat(...shifts, ...breaks), max: shifts.length, breaks };
}
// the day open for clients: the city's schedule decides when it has one, else the Online settings (on, not closed)
function openDay(cfg, city, date, d) {
  const t = cfg.team, c = cfg.cities[city];
  if (t && T.hasSchedule(t.doc, city, t.ids)) return true;
  return !!(d && d.on && !(c.closed || []).includes(date));
}
// the same for a day of a city as Nuki reads it (api/portal-nuki.js): null when the city is closed that weekday
function capacity(cfg, city, date, appts) {
  const c = cfg.cities[city], d = c && c.days[weekday(date)];
  return d ? capOf(cfg, city, date, d, busy(appts, city, date), appts) : null;
}
// a client fits between two minutes: at every moment the places taken stay under the places there are
function fits(iv, s, e, cap) {
  const pts = [s].concat(iv.filter((x) => x[0] > s && x[0] < e).map((x) => x[0]), cap.edges.filter((p) => p > s && p < e));
  return pts.every((p) => iv.reduce((n, x) => n + (x[0] <= p && x[1] > p ? x[2] : 0), 0) < cap.at(p));
}

// The start times free on a day for a treatment of so many minutes
function freeOn(cfg, city, date, minutes, appts, now) {
  const c = cfg.cities[city];
  if (!c || !isDate(date)) return [];
  const n = now || roNow();
  if (date < n.date || date > addDay(n.date, cfg.ahead - 1)) return [];
  const d = c.days[weekday(date)];
  if (!d) return [];
  // once the city has a schedule, a day is open when anyone works it (a Saturday, a day closed in Calendar → Online):
  // the Online day only clips the hours (the owner's decision, 16.11); without one, as set there
  if (!openDay(cfg, city, date, d)) return [];
  const b = busy(appts, city, date);
  const cap = capOf(cfg, city, date, d, b, appts);
  if (b.closed || cap.max < 1) return [];
  const open = toMin(d.from), close = toMin(d.to), earliest = date === n.date ? n.min + cfg.notice : -1;
  const out = [];
  for (let t = open; t + minutes <= close; t += cfg.step) {
    if (t < earliest) continue;
    if (fits(b.iv, t, t + minutes, cap)) out.push(hhmm(t));
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
  if (b.closed || !fits(b.iv, s, e, capOf(cfg, entry.location, entry.date, d, b, others))) {
    // the one that came first stays: only a later site booking that overlaps gives way
    const rivals = others.filter((a) => a.createdBy === 'site' && a.location === entry.location && a.date === entry.date && a.status !== 'anulata'
      && toMin(a.time) < e && (toMin(a.endTime) || toMin(a.time) + 60) > s);
    return !rivals.length || rivals.every((a) => String(a.createdAt) < String(entry.createdAt) || (a.createdAt === entry.createdAt && a.id < entry.id));
  }
  return false;
}

// Where a site customer came from (the owner, 13.11: „să salvăm asta să știm de unde vin”, 23.11: on every booking, payment
// and lead of the site, stored only, never shown in the admin): what the site sent (c360-book.js SRC, window.C360Src(): the
// outside page's host, the address's tags, the page she landed on, kept from page to page for the visit), whether the browser
// has Meta's click cookie (_fbc: she came from a Facebook or Instagram link in the last 90 days, set by the pixel only after
// the cookies' Accept) and the app whose browser she is in (ua: Instagram, Facebook, TikTok open links in their own browser,
// often without a referrer). from: one plain word for the reports.
const appOf = (ua) => {
  const u = String(ua || '');
  if (/^(instagram|facebook|tiktok)$/.test(u)) return u;
  return /Instagram/i.test(u) ? 'instagram' : /FBAN|FBAV|FB_IAB|FBIOS/i.test(u) ? 'facebook' : /musical_ly|TikTok|Bytedance/i.test(u) ? 'tiktok' : '';
};
function sourceOf(raw, cookie, ua) {
  const x = raw && typeof raw === 'object' ? raw : {};
  const host = String(x.ref || '').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 80);
  const t = x.tag && typeof x.tag === 'object' ? x.tag : {};
  const tag = {};
  ['source', 'medium', 'campaign', 'content'].forEach((k) => { if (t[k]) tag[k] = clip(String(t[k]).replace(/[<>]/g, ''), 80); });
  ['fbclid', 'gclid', 'gbraid', 'wbraid', 'ttclid', 'msclkid'].forEach((k) => { if (t[k]) tag[k] = 1; });
  const fbc = /(^|;\s*)_fbc=fb\./.test(String(cookie || '')) || x.fbc === true;
  const app = appOf(ua || x.app);
  const us = fold(tag.source), um = fold(tag.medium);
  const on = (re) => re.test(host);
  const AI = /chatgpt|openai|perplexity|gemini|copilot|claude/;
  const from = tag.gclid || tag.gbraid || tag.wbraid ? 'Reclamă Google'
    : /facebook|^fb$|instagram|^ig$|meta/.test(us) && /paid|cpc|ad|ppc/.test(um) ? 'Reclamă Facebook/Instagram'
    : tag.ttclid ? 'Reclamă TikTok'
    : AI.test(us) || on(/chatgpt\.com$|openai\.com$|perplexity\.ai$|gemini\.google\.com$|copilot\.microsoft\.com$|claude\.ai$/) ? 'ChatGPT / AI'
    : on(/(^|\.)instagram\.com$/) || /^(instagram|ig|insta)$/.test(us) ? 'Instagram'
    : on(/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/) || /^(facebook|fb)$/.test(us) ? 'Facebook'
    : tag.fbclid ? 'Facebook/Instagram'
    : on(/(^|\.)google\.[a-z.]+$/) || /google/.test(us) ? 'Google'
    : on(/(^|\.)tiktok\.com$/) || /tiktok/.test(us) ? 'TikTok'
    : on(/(^|\.)youtube\.com$|(^|\.)youtu\.be$/) || /youtube|^yt$/.test(us) ? 'YouTube'
    : on(/bing\.com$|yahoo\.|duckduckgo\.com$/) ? 'Alt motor de căutare'
    : on(/whatsapp|wa\.me$|(^|\.)wl\.co$/) || /whatsapp|^wa$/.test(us) ? 'WhatsApp'
    : tag.source ? clip(tag.source, 40)
    : app === 'instagram' ? 'Instagram' : app === 'facebook' ? 'Facebook' : app === 'tiktok' ? 'TikTok'
    : host ? host
    : fbc ? 'Facebook/Instagram (mai devreme)'
    : 'Direct';
  const land = clip(String(x.land || '').replace(/[^\w\/.-]/g, ''), 80);
  const at = !isNaN(Date.parse(x.at)) ? new Date(Date.parse(x.at)).toISOString() : '';
  return Object.assign({ from }, host ? { ref: host } : {}, Object.keys(tag).length ? { tag } : {}, land ? { land } : {}, at ? { at } : {}, fbc ? { fbc: true } : {}, app ? { app } : {});
}
// a source saved earlier, classified again with today's rules (the reports): it keeps everything sourceOf needs
const sourceAgain = (s) => (s && typeof s === 'object' ? sourceOf(s, '', s.app) : null);

module.exports = { KEY, CITIES, DEFAULTS, CONSULT, clean, settings, openDay, soleCosmetician, sourceOf, sourceAgain, appOf, services, custom, freeOn, days, overbooked, capacity, roNow, toMin, hhmm, addDay, isDate, minutesOf, catOf, fold };
