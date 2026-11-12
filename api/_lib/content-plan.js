// Conținut: when each item goes on each network (the owner, 12.11: „infrastructura să funcționeze la infinit”).
// Pure and deterministic: the same items, settings and time give the same plan (unit-tested).
//  - Each day has the settings' slots (Europe/Bucharest); a network gets at most one item per slot and at most
//    slots.length a day.
//  - A new item goes first to the enabled network that is most behind (its earliest free slot from now + 30 min),
//    then to each other enabled network, each at least gapDays (calendar days) after the previous one and never on a
//    Bucharest day the item already has on another network: the same item is never on two networks the same day.
//  - A network not enabled yet (TikTok, YouTube until their access comes) gets its entries too, as 'waiting_access',
//    after the enabled ones: the rotation is ready the day it is turned on. Stories: Instagram and Facebook only.
//  - reflow(): an entry still 'planned' whose time passed more than 75 minutes ago (the switch was off, the clock
//    missed it, a permission was missing) moves to the next free slot instead of going out late in a burst; a network
//    turned on/off moves its entries between 'planned' and 'waiting_access'.

const TZ = 'Europe/Bucharest';
const NETS = ['ig', 'fb', 'tt', 'yt'];
const STORY_NETS = ['ig', 'fb'];
const LEAD_MS = 30 * 60e3;
const STALE_MS = 75 * 60e3;
const DEFAULTS = { on: true, slots: ['10:00', '14:00', '19:00'], nets: { fb: true, ig: true, tt: false, yt: false }, gapDays: 2 };

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
const roDay = (ms) => dayFmt.format(new Date(ms));
// how far Bucharest is ahead of UTC at that moment
function offsetAt(ms) {
  const p = {}; partsFmt.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = Number(x.value); });
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
// a Bucharest day and hh:mm as a UTC time (ms)
function atRo(day, hhmm) {
  const [y, m, d] = day.split('-').map(Number), [h, mi] = String(hhmm).split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return t;
}
const addDays = (day, n) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10); };
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const iso = (ms) => new Date(ms).toISOString();

const okSlot = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s));
function settingsOf(s) {
  s = s || {};
  const slots = [...new Set((Array.isArray(s.slots) ? s.slots : DEFAULTS.slots).filter(okSlot))].sort();
  const nets = {};
  NETS.forEach((n) => { nets[n] = s.nets && typeof s.nets[n] === 'boolean' ? s.nets[n] : DEFAULTS.nets[n]; });
  const gap = Number(s.gapDays);
  return { on: s.on !== false, slots: slots.length ? slots : DEFAULTS.slots.slice(), nets, gapDays: Number.isFinite(gap) ? Math.max(1, Math.min(14, Math.round(gap))) : DEFAULTS.gapDays };
}
const netsFor = (kind) => (kind === 'story' ? STORY_NETS : NETS);
// an entry that holds its slot (a skipped one gives it back)
const holds = (e) => e && e.at && e.state !== 'skipped';

// who has which slot: "<net>|<time>" and how many a network has each day
function board(items, skip) {
  const slot = new Set(), perDay = new Map();
  (items || []).forEach((it) => (it.plan || []).forEach((e) => {
    if (!holds(e) || e === skip) return;
    const t = Date.parse(e.at);
    slot.add(e.net + '|' + t);
    const k = e.net + '|' + roDay(t);
    perDay.set(k, (perDay.get(k) || 0) + 1);
  }));
  return {
    take(net, t) { slot.add(net + '|' + t); const k = net + '|' + roDay(t); perDay.set(k, (perDay.get(k) || 0) + 1); },
    // the earliest free slot of a network at or after `from`, never on one of `avoid` (days), at or after day `minDay`
    free(net, from, st, avoid, minDay) {
      let day = roDay(from);
      if (minDay && minDay > day) day = minDay;
      for (let i = 0; i < 800; i++, day = addDays(day, 1)) {
        if (avoid && avoid.has(day)) continue;
        if ((perDay.get(net + '|' + day) || 0) >= st.slots.length) continue;
        for (const s of st.slots) {
          const t = atRo(day, s);
          if (t >= from && !slot.has(net + '|' + t)) return t;
        }
      }
      return null;
    },
  };
}
// how many entries a network still has ahead (the tie-break for "most behind")
const ahead = (items, net, now) => (items || []).reduce((n, it) => n + (it.plan || []).filter((e) => e.net === net && holds(e) && Date.parse(e.at) >= now).length, 0);

// The plan of a new item: [{ net, at, state }], in time order. `items`: all the others (their plans hold their slots).
// opts.igSkip: a reason Instagram can't take this item (a PNG in a carousel), its entry is 'skipped' with it.
function planItem(item, items, settings, now, opts) {
  const st = settingsOf(settings);
  const b = board(items);
  const nets = netsFor(item.kind);
  const on = nets.filter((n) => st.nets[n]), off = nets.filter((n) => !st.nets[n]);
  const order = (n) => NETS.indexOf(n);
  const out = [], days = new Set();
  const place = (net, t, state) => { b.take(net, t); days.add(roDay(t)); out.push({ net, at: iso(t), state }); };
  const from = now + LEAD_MS;
  let prev = null;
  // the first: the network that is most behind
  const pick = (cands, minDay, state) => {
    const scored = cands.map((n) => ({ n, t: b.free(n, from, st, days, minDay) })).filter((x) => x.t != null);
    scored.sort((x, y) => x.t - y.t || ahead(items, x.n, now) - ahead(items, y.n, now) || order(x.n) - order(y.n));
    return scored[0] || null;
  };
  const chain = (list, state) => {
    const left = list.slice();
    while (left.length) {
      const minDay = prev == null ? null : addDays(roDay(prev), st.gapDays);
      const p = pick(left, minDay, state);
      if (!p) break;
      place(p.n, p.t, state);
      prev = p.t;
      left.splice(left.indexOf(p.n), 1);
    }
  };
  chain(on, 'planned');
  chain(off, 'waiting_access');
  if (opts && opts.igSkip) out.forEach((e) => { if (e.net === 'ig') { e.state = 'skipped'; e.error = opts.igSkip; } });
  return out.sort((x, y) => Date.parse(x.at) - Date.parse(y.at) || order(x.net) - order(y.net));
}

// Keeps the plans right as time passes and settings change; changes `items` in place, returns how many entries moved.
function reflow(items, settings, now) {
  const st = settingsOf(settings);
  let n = 0;
  (items || []).forEach((it) => (it.plan || []).forEach((e) => {
    if (e.state === 'waiting_access' && st.nets[e.net]) { e.state = 'planned'; n++; }
    else if (e.state === 'planned' && !st.nets[e.net]) { e.state = 'waiting_access'; n++; }
  }));
  if (!st.on) return n;
  // the stale ones, oldest first, each to the next free slot of its network, not on a day its item has elsewhere
  const stale = [];
  (items || []).forEach((it) => (it.plan || []).forEach((e) => {
    if (e.state === 'planned' && !(e.tries > 0) && Date.parse(e.at) < now - STALE_MS) stale.push({ it, e });
  }));
  stale.sort((x, y) => Date.parse(x.e.at) - Date.parse(y.e.at));
  for (const { it, e } of stale) {
    const b = board(items, e);
    const avoid = new Set((it.plan || []).filter((x) => x !== e && holds(x)).map((x) => roDay(Date.parse(x.at))));
    const t = b.free(e.net, now + LEAD_MS, st, avoid);
    if (t == null) continue;
    e.at = iso(t); e.moved = (e.moved || 0) + 1; n++;
  }
  return n;
}

// Which entries the poster takes now: planned, on an enabled network, due (at most 75 minutes late, or a retry), and
// the ones already started (an Instagram container still processing). Oldest first.
function due(items, settings, now) {
  const st = settingsOf(settings);
  const out = [];
  (items || []).forEach((it) => (it.plan || []).forEach((e) => {
    if (!st.nets[e.net]) return;
    const t = Date.parse(e.at);
    if (e.state === 'posting') out.push({ it, e });
    else if (e.state === 'planned' && t <= now && (t >= now - STALE_MS || e.tries > 0) && !(e.retryAt && Date.parse(e.retryAt) > now)) out.push({ it, e });
  }));
  return out.sort((x, y) => Date.parse(x.e.at) - Date.parse(y.e.at));
}

// The queue as the producer and the page see it: counts per state, how many days each enabled network still has,
// and the next free slots.
function summary(items, settings, now) {
  const st = settingsOf(settings);
  const counts = { planned: 0, posting: 0, posted: 0, error: 0, waiting_access: 0, skipped: 0 };
  const last = {}, queued = new Set();
  (items || []).forEach((it) => (it.plan || []).forEach((e) => {
    counts[e.state] = (counts[e.state] || 0) + 1;
    if ((e.state === 'planned' || e.state === 'posting') && st.nets[e.net]) {
      queued.add(it.id);
      if (!last[e.net] || e.at > last[e.net]) last[e.net] = e.at;
    }
  }));
  const on = NETS.filter((n) => st.nets[n]);
  const today = roDay(now);
  const daysOf = (n) => (last[n] ? Math.max(0, dayDiff(today, roDay(Date.parse(last[n])))) : 0);
  const daysAhead = on.length ? Math.min.apply(null, on.map(daysOf)) : 0;
  const until = on.length && on.every((n) => last[n]) ? on.map((n) => roDay(Date.parse(last[n]))).sort()[0] : '';
  const b = board(items);
  const next = {};
  on.forEach((n) => { const t = b.free(n, now + LEAD_MS, st); next[n] = t == null ? '' : iso(t); });
  // the producer's rule (reels/PRODUCER.md): at least 6 days ahead, 3 a night, more when short, none past 14 days
  const want = daysAhead >= 14 ? 0 : daysAhead >= 6 ? 3 : Math.min(12, 3 + Math.ceil((6 - daysAhead) * st.slots.length / 2));
  return { counts, queued: queued.size, perNet: Object.fromEntries(on.map((n) => [n, { days: daysOf(n), last: last[n] || '' }])), daysAhead, until, nextFree: next, want };
}

module.exports = { NETS, STORY_NETS, DEFAULTS, LEAD_MS, STALE_MS, settingsOf, netsFor, planItem, reflow, due, summary, roDay, atRo, addDays, dayDiff };
