// Conținut: the weekly plan (the owner, 12.11: „lotul pe săptămână, aprobat duminica”). Pure and deterministic: the
// same items, settings and time give the same plan (unit-tested).
//  - A week runs Monday 00:00 to Sunday 23:59, Europe/Bucharest; it is named by its Monday ('YYYY-MM-DD'). The
//    producer hands in a week's batch, the owner approves it, the clock posts only what is approved.
//  - Each network has a weekly quota per kind (settings.quotas): a warm-up for the first weeks (from startWeek), then
//    the full one. Reels go at the network's times (the first is the main one, the second only on days with two);
//    a carousel / slideshow at the network's photo time. A network never gets more a day than it has times.
//  - The cross-shuffle (replanWeek): every reel goes once to every network its quotas allow (TikTok, YouTube,
//    Instagram, Facebook), never two networks the same day for the same item, so on any day the networks show
//    different items. Each network's quota is spread evenly over the week (shifted per network, so the lighter days
//    differ), and each item's networks are rotated two days apart where the slots allow (a Latin-square rotation:
//    the reel that is on TikTok on Monday is on YouTube on Wednesday, Instagram on Friday …). When a network takes
//    fewer than all the reels (Instagram 7 of 14), it takes the ones with the fewest networks so far, so Instagram
//    and Facebook show different reels. A carousel goes on Instagram and Facebook and, as a slideshow, on TikTok,
//    each on another day. Fewer items than the quotas: as many as there are, the rest reported as `short`.
//  - What stays where it is on a re-plan: everything the owner has seen (approved, sent back to redo, or replaced
//    after a redo: "the same slots"), whatever was posted, is being posted or tried, and anything in the past. Only
//    the items still waiting for their first look are re-shuffled.
//  - A network not enabled yet (TikTok, YouTube until their posting is built) gets its entries as 'waiting_access'.
//  - reflow(): an approved entry still 'planned' whose time passed more than 75 minutes ago (the switch was off, a
//    permission was missing) moves to the next free slot of its network within its week, or is 'missed'; one never
//    approved is 'missed' when its week ends.

const TZ = 'Europe/Bucharest';
const NETS = ['tt', 'yt', 'ig', 'fb'];
const PHOTO_NETS = ['tt', 'ig', 'fb'];
const KINDS = ['reel', 'carousel', 'slideshow'];
// how an item of a kind goes on each network (a carousel is a slideshow on TikTok: the same photos)
const AS = { reel: { tt: 'reel', yt: 'reel', ig: 'reel', fb: 'reel' }, carousel: { ig: 'carousel', fb: 'carousel', tt: 'slideshow' }, slideshow: { tt: 'slideshow' } };
// the kinds each network has a quota for
const QKINDS = { tt: ['reel', 'slideshow'], yt: ['reel'], ig: ['reel', 'carousel'], fb: ['reel', 'carousel'] };
const LEAD_MS = 30 * 60e3;
const STALE_MS = 75 * 60e3;
const DEFAULTS = {
  on: true,
  nets: { tt: false, yt: false, ig: true, fb: true },
  startWeek: '2026-11-16',
  warmWeeks: 2,
  quotas: {
    warm: { tt: { reel: 7, slideshow: 1 }, yt: { reel: 7 }, ig: { reel: 5, carousel: 1 }, fb: { reel: 5, carousel: 1 } },
    full: { tt: { reel: 14, slideshow: 1 }, yt: { reel: 10 }, ig: { reel: 7, carousel: 1 }, fb: { reel: 7, carousel: 1 } },
  },
  times: { tt: ['19:30', '12:30'], yt: ['17:00', '12:00'], ig: ['12:30'], fb: ['13:00'] },
  photoTime: { tt: '16:00', ig: '19:00', fb: '19:30' },
};

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
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s + 'T12:00:00Z'));
const dow = (day) => new Date(day + 'T12:00:00Z').getUTCDay();
// the Monday of a Bucharest day, of a moment, the week after
const mondayOf = (day) => addDays(day, -((dow(day) + 6) % 7));
const weekOf = (ms) => mondayOf(roDay(ms));
const weekEnd = (week) => atRo(addDays(week, 7), '00:00');
const weekDays = (week) => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(week, i));

const okSlot = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function settingsOf(s) {
  s = s || {};
  const nets = {}, quotas = { warm: {}, full: {} }, times = {}, photoTime = {};
  NETS.forEach((n) => { nets[n] = s.nets && typeof s.nets[n] === 'boolean' ? s.nets[n] : DEFAULTS.nets[n]; });
  ['warm', 'full'].forEach((w) => NETS.forEach((n) => {
    quotas[w][n] = {};
    QKINDS[n].forEach((k) => {
      const v = s.quotas && s.quotas[w] && s.quotas[w][n] ? Number(s.quotas[w][n][k]) : NaN;
      quotas[w][n][k] = Number.isFinite(v) ? clamp(Math.round(v), 0, k === 'reel' ? 28 : 7) : DEFAULTS.quotas[w][n][k];
    });
  }));
  NETS.forEach((n) => {
    const t = s.times && Array.isArray(s.times[n]) ? [...new Set(s.times[n].filter(okSlot))].slice(0, 3) : [];
    times[n] = t.length ? t : DEFAULTS.times[n].slice();
  });
  PHOTO_NETS.forEach((n) => { photoTime[n] = s.photoTime && okSlot(s.photoTime[n]) ? s.photoTime[n] : DEFAULTS.photoTime[n]; });
  const ww = Number(s.warmWeeks);
  // the competitors' names the texts never mention (content.js qa)
  const comp = Array.isArray(s.competitors) ? s.competitors : typeof s.competitors === 'string' ? s.competitors.split(/[,;\n]/) : [];
  const competitors = [...new Set(comp.map((x) => String(x || '').replace(/\s+/g, ' ').trim().slice(0, 60)).filter((x) => x.length >= 3))].slice(0, 40);
  return { on: s.on !== false, nets, startWeek: isDay(s.startWeek) ? mondayOf(s.startWeek) : DEFAULTS.startWeek,
    warmWeeks: Number.isFinite(ww) ? clamp(Math.round(ww), 0, 8) : DEFAULTS.warmWeeks, quotas, times, photoTime, competitors };
}
// week 1, 2, 3 … from startWeek (a week before it counts as 1), and its quotas
const weekNo = (week, st) => Math.max(1, Math.floor(dayDiff(st.startWeek, week) / 7) + 1);
const quotasFor = (week, st) => (weekNo(week, st) <= st.warmWeeks ? st.quotas.warm : st.quotas.full);
// what a week needs: as many reels as the network that takes most, as many carousels as the network that takes most
const needOf = (q) => ({ reel: Math.max.apply(null, NETS.map((n) => q[n].reel || 0)), carousel: Math.max(q.ig.carousel || 0, q.fb.carousel || 0, q.tt.slideshow || 0) });

const netsFor = (kind) => Object.keys(AS[kind] || {});
const kindOn = (it, net) => (AS[it.kind] || {})[net] || it.kind;
const classOf = (kind) => (kind === 'reel' ? 'reel' : 'photo');
const timesOf = (st, net, cls) => (cls === 'reel' ? st.times[net] : st.photoTime[net] ? [st.photoTime[net]] : []);
// an entry that holds its slot (a skipped or missed one gives it back)
const holds = (e) => !!(e && e.at && e.state !== 'skipped' && e.state !== 'missed');
// an entry a re-plan may drop: not started, not tried
const loose = (e) => (e.state === 'planned' || e.state === 'waiting_access') && !(e.tries > 0);
const review = (it) => it.review || 'pending';
// an item the owner hasn't looked at yet: the re-plan may move it
const movable = (it) => review(it) === 'pending' && !it.reviewedAt;
const byAge = (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id));

// who holds what: the times taken per network, the entries per network, class and day, the days of each item
function boardOf(items, skip) {
  const taken = new Set(), load = new Map(), days = new Map(), nets = new Map();
  const add = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
  (items || []).forEach((it) => (it.plan || []).forEach((e) => {
    if (e === skip) return;
    add(nets, it.id, e.net);
    if (!holds(e)) return;
    const t = Date.parse(e.at), d = roDay(t);
    taken.add(e.net + '|' + t);
    const k = e.net + '|' + classOf(e.kind || kindOn(it, e.net)) + '|' + d;
    load.set(k, (load.get(k) || 0) + 1);
    add(days, it.id, d);
  }));
  return {
    taken, load, days, nets,
    n: (net, cls, d) => load.get(net + '|' + cls + '|' + d) || 0,
    has: (id, d) => !!(days.get(id) && days.get(id).has(d)),
    on: (id, net) => !!(nets.get(id) && nets.get(id).has(net)),
    take(it, e) {
      const t = Date.parse(e.at), d = roDay(t);
      taken.add(e.net + '|' + t); add(nets, it.id, e.net); add(days, it.id, d);
      const k = e.net + '|' + classOf(e.kind) + '|' + d; load.set(k, (load.get(k) || 0) + 1);
    },
    // the free times of a network's class on a day, in the order of the settings (the main time first)
    free(st, net, cls, d, now) {
      const list = timesOf(st, net, cls);
      const room = list.length - (load.get(net + '|' + cls + '|' + d) || 0);
      if (room <= 0) return [];
      return list.map((hm, k) => ({ slot: cls === 'reel' ? k : 'p', t: atRo(d, hm) })).filter((x) => x.t >= now + LEAD_MS && !taken.has(net + '|' + x.t)).slice(0, room);
    },
  };
}

// q spread over 7 days as evenly as it goes (at most cap a day), shifted by `shift` days
function spread(q, cap, shift) {
  const n = Math.min(q, 7 * cap), out = [];
  for (let i = 0; i < 7; i++) { const r = (i + shift) % 7; out.push(Math.floor(((r + 1) * n) / 7) - Math.floor((r * n) / 7)); }
  return out;
}
// the days in the order an item prefers them: its rotation day first, then the nearest ones
const prefOrder = (p) => [0, 1, -1, 2, -2, 3, -3].map((o) => (((p + o) % 7) + 7) % 7);

// Items (left) to days (right, with capacities), the most wanted items first: a maximum matching, each item on the
// day it prefers when the others allow (augmenting paths move an item to its next day to make room).
function assign(cands, prefs, allowed, caps, need) {
  const at = new Map(), on = [[], [], [], [], [], [], []];
  let cap = caps[0];
  const tryIt = (it, seen) => {
    for (const d of prefs(it)) {
      if (seen.has(d) || !allowed(it, d)) continue;
      seen.add(d);
      if (on[d].length < cap[d]) { on[d].push(it); at.set(it, d); return true; }
      for (const o of on[d].slice()) {
        if (tryIt(o, seen)) { on[d].splice(on[d].indexOf(o), 1); on[d].push(it); at.set(it, d); return true; }
      }
    }
    return false;
  };
  for (const c of caps) {
    cap = c;
    for (const it of cands) { if (at.size >= need) break; if (!at.has(it)) tryIt(it, new Set()); }
  }
  return at;
}

// The week's cross-shuffle: re-plans the items of `week` that may move, around everything that stays. Changes the
// items in place; returns { short: { net: { kind: n } } } (what the quotas wanted and the items couldn't fill).
function replanWeek(items, week, settings, now) {
  const st = settingsOf(settings), q = quotasFor(week, st);
  const days = weekDays(week);
  const all = (items || []).filter((it) => !it.removed);
  const mine = all.filter((it) => it.week === week && it.state === 'ready' && !it.dropped && AS[it.kind]).sort(byAge);
  mine.filter(movable).forEach((it) => { it.plan = (it.plan || []).filter((e) => !loose(e)); });
  const b = boardOf(all);
  const rank = new Map();
  ['reel', 'photo'].forEach((cls) => mine.filter((it) => classOf(it.kind) === cls).forEach((it, i) => rank.set(it, i)));
  const entries = (it) => (it.plan || []).filter(holds).length;
  const inWeek = (n, kind) => all.reduce((s, it) => s + (it.plan || []).filter((e) => e.net === n && holds(e) && (e.kind || kindOn(it, n)) === kind && days.includes(roDay(Date.parse(e.at)))).length, 0);
  // the photo kinds first (Instagram, Facebook, then TikTok, which a slideshow of its own fills first), then the
  // reels, the network with the biggest quota first
  const tasks = [];
  ['ig', 'fb', 'tt'].forEach((n) => QKINDS[n].filter((k) => k !== 'reel').forEach((k) => tasks.push({ n, kind: k })));
  NETS.slice().sort((x, y) => (q[y].reel || 0) - (q[x].reel || 0) || NETS.indexOf(x) - NETS.indexOf(y)).forEach((n) => tasks.push({ n, kind: 'reel' }));
  for (const { n, kind } of tasks) {
    const cls = classOf(kind), j = NETS.indexOf(n);
    const need = (q[n][kind] || 0) - inWeek(n, kind);
    if (need <= 0) continue;
    const cands = mine.filter((it) => kindOn(it, n) === kind && (AS[it.kind] || {})[n] && review(it) !== 'redo' && !b.on(it.id, n))
      .sort((x, y) => entries(x) - entries(y) || (x.kind === kind ? 0 : 1) - (y.kind === kind ? 0 : 1) || rank.get(x) - rank.get(y));
    if (!cands.length) continue;
    const free = days.map((d) => b.free(st, n, cls, d, now).length);
    const ideal = spread(q[n][kind] || 0, timesOf(st, n, cls).length, 2 * j);
    const target = days.map((d, i) => Math.max(0, Math.min(free[i], ideal[i] - b.n(n, cls, d))));
    // the rotation day: reels two days apart per network; a photo on the day its network's spread gives it
    const pref = (it) => prefOrder(cls === 'reel' ? (rank.get(it) + 2 * j) % 7 : (((6 - 2 * j + rank.get(it)) % 7) + 7) % 7);
    const at = assign(cands, pref, (it, i) => free[i] > 0 && !b.has(it.id, days[i]), [target, free], need);
    // the times: per day, the main time first, the items in their order
    const perDay = [[], [], [], [], [], [], []];
    at.forEach((i, it) => perDay[i].push(it));
    perDay.forEach((list, i) => {
      const times = b.free(st, n, cls, days[i], now);
      list.sort((x, y) => rank.get(x) - rank.get(y)).forEach((it, k) => {
        const s = times[k]; if (!s) return;
        const e = { net: n, kind, slot: s.slot, at: iso(s.t), state: st.nets[n] ? 'planned' : 'waiting_access' };
        it.plan = (it.plan || []).concat(e);
        b.take(it, e);
      });
    });
  }
  mine.forEach((it) => { it.plan = (it.plan || []).slice().sort((x, y) => String(x.at).localeCompare(String(y.at)) || NETS.indexOf(x.net) - NETS.indexOf(y.net)); });
  const short = {};
  NETS.forEach((n) => QKINDS[n].forEach((k) => { const left = (q[n][k] || 0) - inWeek(n, k); if (left > 0) (short[n] = short[n] || {})[k] = left; }));
  return { short };
}

// every week from the current one that has items, re-planned (a change of quotas, times or networks)
function replanFrom(items, settings, now) {
  const from = weekOf(now);
  const weeks = [...new Set((items || []).filter((it) => it.week && it.week >= from && !it.removed && !it.dropped).map((it) => it.week))].sort();
  weeks.forEach((w) => replanWeek(items, w, settings, now));
  return weeks;
}

// a change of times: the entries not started yet keep their day and move to the new time of their slot
function retime(items, settings, now) {
  const st = settingsOf(settings);
  let n = 0;
  (items || []).forEach((it) => (it.plan || []).forEach((e) => {
    if (!loose(e) || !holds(e) || e.slot == null || Date.parse(e.at) < now + LEAD_MS) return;
    const hm = e.slot === 'p' ? st.photoTime[e.net] : st.times[e.net][e.slot];
    if (!hm) return;
    const t = atRo(roDay(Date.parse(e.at)), hm);
    if (t === Date.parse(e.at) || t < now + LEAD_MS) return;
    const b = boardOf(items, e);
    if (b.taken.has(e.net + '|' + t)) return;
    e.at = iso(t); n++;
  }));
  return n;
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
  const stale = [];
  (items || []).forEach((it) => (it.plan || []).forEach((e) => {
    if (e.state === 'planned' && !(e.tries > 0) && Date.parse(e.at) < now - STALE_MS) stale.push({ it, e });
  }));
  stale.sort((x, y) => Date.parse(x.e.at) - Date.parse(y.e.at));
  for (const { it, e } of stale) {
    const week = it.week || weekOf(Date.parse(e.at));
    if (review(it) !== 'approved' || it.removed || it.dropped || it.state !== 'ready') {
      if (now >= weekEnd(week)) { e.state = 'missed'; n++; }
      continue;
    }
    const b = boardOf(items, e), cls = classOf(e.kind || kindOn(it, e.net));
    let to = null;
    for (const d of weekDays(week)) {
      if (d < roDay(now) || b.has(it.id, d)) continue;
      const f = b.free(st, e.net, cls, d, now);
      if (f.length) { to = f[0]; break; }
    }
    if (to) { e.at = iso(to.t); e.slot = to.slot; e.moved = (e.moved || 0) + 1; }
    else e.state = 'missed';
    n++;
  }
  return n;
}

// Which entries the poster takes now: on an enabled network, of an approved item, planned and due (at most 75
// minutes late, or a retry), and the ones already started (an Instagram container still processing). Oldest first.
function due(items, settings, now) {
  const st = settingsOf(settings);
  const out = [];
  (items || []).forEach((it) => {
    if (it.removed || it.state !== 'ready') return;
    const ok = review(it) === 'approved';
    (it.plan || []).forEach((e) => {
      if (!st.nets[e.net]) return;
      const t = Date.parse(e.at);
      if (e.state === 'posting') out.push({ it, e });
      else if (ok && e.state === 'planned' && t <= now && (t >= now - STALE_MS || e.tries > 0) && !(e.retryAt && Date.parse(e.retryAt) > now)) out.push({ it, e });
    });
  });
  return out.sort((x, y) => Date.parse(x.e.at) - Date.parse(y.e.at));
}

// A week as the producer and the page see it: what it needs, what was handed in, what is missing, the owner's
// review, and per network its quota and what is planned.
function weekInfo(items, settings, week) {
  const st = settingsOf(settings), q = quotasFor(week, st), n = weekNo(week, st);
  const need = needOf(q);
  const its = (items || []).filter((it) => !it.removed && !it.dropped && it.week === week);
  const ready = its.filter((it) => it.state === 'ready');
  const have = { reel: ready.filter((it) => it.kind === 'reel').length, carousel: ready.filter((it) => it.kind === 'carousel' || it.kind === 'slideshow').length };
  const missing = { reel: Math.max(0, need.reel - have.reel), carousel: Math.max(0, need.carousel - have.carousel) };
  const days = new Set(weekDays(week));
  const slots = {};
  NETS.forEach((net) => { slots[net] = {}; QKINDS[net].forEach((k) => { slots[net][k] = { quota: q[net][k] || 0, planned: 0 }; }); });
  (items || []).forEach((it) => (it.plan || []).forEach((e) => {
    if (!holds(e) || !days.has(roDay(Date.parse(e.at)))) return;
    const s = slots[e.net] && slots[e.net][e.kind || kindOn(it, e.net)];
    if (s) s.planned++;
  }));
  const short = {};
  NETS.forEach((net) => QKINDS[net].forEach((k) => { const left = slots[net][k].quota - slots[net][k].planned; if (left > 0) (short[net] = short[net] || {})[k] = left; }));
  return { week, n, warm: n <= st.warmWeeks, need, have, missing, complete: need.reel + need.carousel > 0 && !missing.reel && !missing.carousel,
    drafts: its.filter((it) => it.state === 'draft' && review(it) !== 'redo').length,
    approved: ready.filter((it) => review(it) === 'approved').length, pending: ready.filter((it) => review(it) === 'pending').length,
    redo: its.filter((it) => review(it) === 'redo').length, slots, short };
}

// the entries per state (the health page)
function counts(items) {
  const c = { planned: 0, posting: 0, posted: 0, error: 0, waiting_access: 0, skipped: 0, missed: 0 };
  (items || []).forEach((it) => (it.plan || []).forEach((e) => { c[e.state] = (c[e.state] || 0) + 1; }));
  return c;
}

module.exports = { NETS, PHOTO_NETS, KINDS, AS, QKINDS, DEFAULTS, LEAD_MS, STALE_MS, settingsOf, netsFor, kindOn, classOf, holds, movable, review,
  weekNo, quotasFor, needOf, weekOf, mondayOf, weekEnd, weekDays, replanWeek, replanFrom, retime, reflow, due, weekInfo, counts, roDay, atRo, addDays, dayDiff, isDay, dow, spread };
