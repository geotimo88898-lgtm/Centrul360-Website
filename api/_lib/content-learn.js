// Conținut: what works, so the machine learns by itself (the owner, 12.11: „mașina completă, să nu mai revenim”).
//  - learn(): from the numbers content-stats.js reads, every posted entry gets a score (views + 5×saves + 5×shares +
//    3×comments) divided by its network's median score (1 = a usual post on that network, 2 = twice as good), so
//    TikTok's millions and Facebook's hundreds compare. An item scores the mean of its networks. Only entries posted
//    3 days ago or more teach (the first days are still growing). Grouped per rubric, per topic family (the
//    producer's `topicTag`, else the treatment and the zone named in the topic), per hook style (`hookType`), per
//    weekday and slot time per network; the groups are ranked on a mean pulled towards 1 (two posts of weight 1
//    each), so one lucky post doesn't make a rubric.
//  - The producer reads it in the intake status (`learn`, compact), with the `season` (reels/calendar.json entries
//    whose window covers next week) and the `recycle` list (posted 60+ days ago, in the top 20%: a NEW variant, never
//    the same file again, at most 2 a week).
//  - growth: once a day the followers per network (Instagram and Facebook from the Graph API; TikTok and YouTube from
//    content-post.js followers()), data/content/growth.json [{ day, ig, fb, tt, yt }].
//  - The monthly report on the 1st from 9:00 (the owner's bell and phone, ≤ 160 characters): the posts, the views, the
//    followers gained per network, the best item.
//  - results(): Admin → Conținut → Rezultate.

const { readJSON, writeJSON } = require('./store');
const P = require('./content-plan');

const GROWTH_KEY = 'data/content/growth.json';
const STATE_KEY = 'data/content/learn-state.json';
const NETS = P.NETS;
const NET_S = { tt: 'TT', yt: 'YT', ig: 'IG', fb: 'FB' };
const MATURE_MS = 3 * 864e5;
const RECYCLE_AGE_MS = 60 * 864e5;
const RECYCLE_PER_WEEK = 2;
const PRIOR = 2;
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const DOW = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);
const raw = (s) => (s ? (s.views || 0) + 5 * (s.saves || 0) + 5 * (s.shares || 0) + 3 * (s.comments || 0) : 0);
const r2 = (x) => Math.round(x * 100) / 100;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const shrunk = (a) => (a.reduce((s, x) => s + x, 0) + PRIOR) / (a.length + PRIOR);
function median(a) {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const slotOf = (ms) => hmFmt.format(new Date(ms));

// ---------------------------------------------------------------- the topic family
// the treatment and the zone a topic names (folded words → the name the owner reads)
const TREAT = [[/\bhifu\b/, 'HIFU'], [/\bliposonix\b/, 'Liposonix'], [/\b(rf|radiofrecvent\w*)\b/, 'RF'], [/\bepil\w*/, 'epilare laser'], [/\blaser\w*/, 'laser'],
  [/\bems\b|\btonifier\w*/, 'EMS'], [/\bcavitati\w*/, 'cavitație'], [/\bpresoterapi\w*/, 'presoterapie'], [/\bmezoterapi\w*/, 'mezoterapie'], [/\bdermapen|microneedling/, 'microneedling'],
  [/\bpeeling\w*/, 'peeling'], [/\bdrenaj\w*|\bdetox\b/, 'drenaj'], [/\bcriolipoliz\w*/, 'criolipoliză']];
const ZONE = [[/\bgus[ai]\w*|\bbarbi\w*/, 'gușă'], [/\bfat[ai]\b|\bfetei\b|\bovalul\b|\bconturul fetei\b/, 'față'], [/\bten(ul|ului)?\b/, 'ten'], [/\bridur\w*/, 'riduri'], [/\bpete\b|\bpigment\w*/, 'pete'],
  [/\babdomen\w*|\bburt\w*|\btali[ae]\b|\bcolac\w*/, 'abdomen'], [/\bcoaps\w*/, 'coapse'], [/\bbrat(e|ele|ul|ului)?\b/, 'brațe'], [/\bfes(e|ele|ier\w*)\b/, 'fese'], [/\bcelulit\w*/, 'celulită'],
  [/\bspate\b/, 'spate'], [/\baxil\w*/, 'axile'], [/\bpicio\w*/, 'picioare'], [/\binghinal\w*/, 'inghinal'], [/\bpleoap\w*/, 'pleoape'], [/\bgat\b|\bgatul\w*/, 'gât'],
  [/\bdecolteu\w*/, 'decolteu'], [/\bvergetur\w*/, 'vergeturi'], [/\bmustat\w*/, 'mustață']];
const STOP = new Set('pe de la in si sau cu din ce cum cat cate care un o a al ale ai e este sunt nu mai dupa fara pentru despre vs sa se te ne mi ma il le lui ei lor tot toate doar chiar asa acum azi nimeni spune unde duce experimentul adevar adevarul top caz cazul nuki intrebarea zilei greseli greseala fapt de ce se intampla 1 2 3 4 5'.split(' '));
const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
function familyOf(it) {
  if (it.topicTag) { const k = slug(it.topicTag); if (k) return { key: 't:' + k, label: String(it.topicTag).replace(/[-_]+/g, ' ').trim() }; }
  const f = fold(it.topic);
  const t = (TREAT.find(([re]) => re.test(f)) || [])[1], z = (ZONE.find(([re]) => re.test(f)) || [])[1];
  if (t || z) { const label = [t, z].filter(Boolean).join(' '); return { key: 'f:' + slug(label), label }; }
  const words = String(it.topic || '').split(/[^\p{L}\p{N}]+/u).filter((w) => w && !STOP.has(fold(w)) && !/^\d+$/.test(w)).slice(0, 2);
  if (!words.length) return null;
  const label = words.join(' ').toLowerCase();
  return { key: 'w:' + slug(label), label };
}

// ---------------------------------------------------------------- the scores
// every posted entry with numbers: { it, e, net, raw, at, idx, mature }
function rowsOf(list, now) {
  const rows = [];
  (list || []).forEach((it) => {
    if (!it || it.removed) return;
    (it.plan || []).forEach((e) => {
      if (e.state !== 'posted') return;
      const s = (it.stats || {})[e.net];
      const at = Date.parse(e.postedAt || e.at);
      if (!s || !at) return;
      rows.push({ it, e, net: e.net, s, raw: raw(s), at, slotAt: Date.parse(e.at) || at, mature: now - at >= MATURE_MS });
    });
  });
  const med = {};
  NETS.forEach((n) => {
    const m = rows.filter((r) => r.net === n && r.mature).map((r) => r.raw);
    const all = m.length ? m : rows.filter((r) => r.net === n).map((r) => r.raw);
    med[n] = all.length ? Math.max(1, median(all)) : 0;
  });
  rows.forEach((r) => { r.idx = med[r.net] ? r.raw / med[r.net] : 0; });
  return { rows, med };
}
// per item: the mean of its networks, the first posting, its numbers added up
function itemsOf(rows) {
  const by = new Map();
  rows.forEach((r) => {
    let x = by.get(r.it.id);
    if (!x) { x = { it: r.it, idx: [], first: r.at, nets: [], t: { views: 0, saves: 0, shares: 0, comments: 0, likes: 0 }, links: [] }; by.set(r.it.id, x); }
    x.idx.push(r.idx); x.first = Math.min(x.first, r.at); x.nets.push(r.net);
    ['views', 'saves', 'shares', 'comments', 'likes'].forEach((k) => { x.t[k] += r.s[k] || 0; });
    if (r.e.url) x.links.push({ net: r.net, url: r.e.url });
  });
  const out = [...by.values()];
  out.forEach((x) => { x.score = mean(x.idx); });
  return out;
}
const brief = (x) => ({ id: x.it.id, kind: x.it.kind, topic: x.it.topic || '', topicTag: x.it.topicTag || '', rubric: x.it.rubric || '', hook: x.it.hook || '', hookType: x.it.hookType || '',
  keyword: x.it.keyword || '', score: r2(x.score), nets: [...new Set(x.nets)] });
function group(items, keyOf) {
  const g = new Map();
  items.forEach((x) => {
    const k = keyOf(x);
    if (!k) return;
    const key = typeof k === 'string' ? k : k.key, label = typeof k === 'string' ? k : k.label;
    if (!g.has(key)) g.set(key, { label, s: [] });
    g.get(key).s.push(x.score);
  });
  return [...g.values()].map((v) => ({ label: v.label, score: r2(shrunk(v.s)), avg: r2(mean(v.s)), n: v.s.length })).sort((a, b) => b.score - a.score || b.n - a.n);
}

// Everything learned from the items' numbers (Admin → Conținut → Rezultate shows it whole; the producer reads compact())
function learn(list, nowMs) {
  const now = nowMs || Date.now();
  const { rows, med } = rowsOf(list, now);
  const mature = rows.filter((r) => r.mature);
  const all = itemsOf(rows);
  // an item teaches with its networks posted 3 days ago or more
  const items = itemsOf(mature).sort((a, b) => b.score - a.score);
  const nets = {};
  NETS.forEach((n) => {
    const m = mature.filter((r) => r.net === n);
    if (m.length) nets[n] = { n: m.length, median: Math.round(med[n]), views: Math.round(mean(m.map((r) => r.s.views || 0))) };
  });
  const rubrics = group(items, (x) => x.it.rubric || '').map((g) => ({ rubric: g.label, score: g.score, avg: g.avg, n: g.n }));
  const topics = group(items, (x) => familyOf(x.it)).map((g) => ({ topic: g.label, score: g.score, avg: g.avg, n: g.n }));
  const hooks = group(items, (x) => x.it.hookType || '').map((g) => ({ hookType: g.label, score: g.score, avg: g.avg, n: g.n }));
  // per network: the slot times and the weekdays (entries: the same item does differently on each network)
  const heat = {}, hours = {};
  NETS.forEach((n) => {
    const m = mature.filter((r) => r.net === n);
    if (!m.length) return;
    const cells = {}, slots = {};
    m.forEach((r) => {
      const hm = slotOf(r.slotAt), d = P.dow(P.roDay(r.slotAt));
      (cells[d + '|' + hm] = cells[d + '|' + hm] || []).push(r.idx);
      (slots[hm] = slots[hm] || []).push(r.idx);
    });
    const c = {};
    Object.keys(cells).forEach((k) => { c[k] = { score: r2(mean(cells[k])), n: cells[k].length }; });
    heat[n] = { slots: Object.keys(slots).sort(), cells: c };
    hours[n] = Object.keys(slots).map((hm) => ({ at: hm, score: r2(shrunk(slots[hm])), n: slots[hm].length })).sort((a, b) => b.score - a.score);
  });
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => { const v = mature.filter((r) => P.dow(P.roDay(r.slotAt)) === d).map((r) => r.idx); return { dow: d, day: DOW[d], score: v.length ? r2(shrunk(v)) : 0, n: v.length }; });
  const winners = items.filter((x) => x.score > 1).slice(0, 10).map(brief);
  const losers = items.slice().reverse().filter((x) => x.score < 1).slice(0, 10).map(brief);
  // more like these: the best winner of each topic family (five different topics to go on with)
  const fam = new Set();
  const more = items.filter((x) => x.score > 1 && ((f) => { const key = f ? f.key : x.it.id; if (fam.has(key)) return false; fam.add(key); return true; })(familyOf(x.it))).slice(0, 5).map(brief);
  return { n: items.length, posts: mature.length, nets, rubrics, topics, hooks, days, hours, heat, winners, losers,
    more_like: more, all, items };
}

// what the producer reads (the intake status): small enough for a prompt
function compact(L) {
  const hours = {};
  Object.keys(L.hours || {}).forEach((n) => { hours[n] = L.hours[n].slice(0, 3); });
  const top = L.topics.slice(0, 10);
  return { n: L.n, rubrics: L.rubrics.slice(0, 5).map((x) => ({ rubric: x.rubric, score: x.score, n: x.n })),
    topics: top.map((x) => ({ topic: x.topic, score: x.score, n: x.n })),
    worst: L.topics.filter((x) => x.score < 1 && !top.includes(x)).slice(-5).reverse().map((x) => ({ topic: x.topic, score: x.score, n: x.n })),
    hooks: L.hooks.map((x) => ({ hookType: x.hookType, score: x.score, n: x.n })), hours, more_like: L.more_like };
}

// ---------------------------------------------------------------- season, recycling
let CAL = null;
function calendar() {
  if (CAL) return CAL;
  try { const c = require('../../reels/calendar.json'); CAL = Array.isArray(c) ? c : Array.isArray(c.entries) ? c.entries : []; } catch (e) { CAL = []; }
  return CAL;
}
// the moments whose window covers (part of) the week
function season(week, cal) {
  const end = P.addDays(week, 6);
  return (cal || calendar()).filter((x) => x && P.isDay(x.from) && P.isDay(x.to) && x.from <= end && x.to >= week)
    .map((x) => ({ id: x.id, name: x.name, from: x.from, to: x.to, angle: x.angle || '', ideas: x.ideas || [], rubrics: x.rubrics || [], note: x.note || '' }));
}
// The evergreen winners to make again as a NEW variant (new hook, same topic; never the same file): posted 60+ days
// ago, in the top 20% of what was measured, not made again already (a variant in the last 120 days); at most 2 a week,
// counting the variants already handed in for that week.
function recycle(list, nowMs, week, L) {
  const now = nowMs || Date.now();
  const lr = L || learn(list, now);
  const scores = lr.items.map((x) => x.score).sort((a, b) => a - b);
  if (scores.length < 5) return [];
  const p80 = scores[Math.floor(scores.length * 0.8)];
  const live = (list || []).filter((x) => x && !x.removed);
  const redone = new Set(live.filter((x) => x.variantOf && now - (Date.parse(x.createdAt) || 0) < 120 * 864e5).map((x) => x.variantOf));
  const room = Math.max(0, RECYCLE_PER_WEEK - live.filter((x) => x.variantOf && x.week === week).length);
  return lr.items.filter((x) => x.score >= p80 && x.score > 1 && now - x.first >= RECYCLE_AGE_MS && !redone.has(x.it.id))
    .slice(0, room).map((x) => Object.assign(brief(x), { postedAt: new Date(x.first).toISOString(), url: (x.links[0] || {}).url || '' }));
}

// ---------------------------------------------------------------- followers
async function growth() { const g = await readJSON(GROWTH_KEY, []); return Array.isArray(g) ? g : []; }
// a network library's own count (TikTok, YouTube), when it has one
async function libFollowers(mod) {
  if (!mod || typeof mod.followers !== 'function') return null;
  const v = await Promise.resolve(mod.followers()).catch(() => null);
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v && typeof v === 'object') return num(v.followers != null ? v.followers : v.followers_count != null ? v.followers_count : v.count);
  return null;
}
const lib = { tt: () => { try { return require('./content-tt'); } catch (e) { return null; } }, yt: () => { try { return require('./content-yt'); } catch (e) { return null; } } };
// today's followers per network (what can be read), merged into growth.json
async function snapshot(nowMs) {
  const now = nowMs || Date.now(), row = { day: P.roDay(now) };
  try {
    const a = await require('./content-post').access(true);
    if (a && a.connected && a.token) {
      const ads = require('./meta-ads');
      if (a.igId) {
        const r = await ads.call('GET', '/' + a.igId, a.token, { fields: 'followers_count,media_count' }).catch(() => ({ ok: false }));
        const v = r.ok && r.j ? num(r.j.followers_count) : null; if (v != null) row.ig = v;
      }
      const f = await ads.call('GET', '/' + a.pageId, a.token, { fields: 'followers_count,fan_count' }).catch(() => ({ ok: false }));
      if (f.ok && f.j) { const v = num(f.j.followers_count) != null ? num(f.j.followers_count) : num(f.j.fan_count); if (v != null) row.fb = v; }
    }
  } catch (e) { console.error('content growth:', e.message); }
  // TikTok and YouTube: the poster's followers() ({ yt, tt }), else their libraries
  let both = null;
  try { const POST = require('./content-post'); if (typeof POST.followers === 'function') both = await POST.followers(); } catch (e) { both = null; }
  for (const n of ['tt', 'yt']) {
    const v = both && typeof both === 'object' ? num(both[n]) : await libFollowers(lib[n]()).catch(() => null);
    if (v != null) row[n] = v;
  }
  if (!NETS.some((n) => row[n] != null)) return null;
  const g = await growth();
  const i = g.findIndex((x) => x.day === row.day);
  if (i >= 0) g[i] = Object.assign({}, g[i], row); else g.push(row);
  g.sort((x, y) => x.day.localeCompare(y.day));
  await writeJSON(GROWTH_KEY, g.slice(-800), { quiet: true });
  return row;
}
// per network: today's count, the change over 7 and 30 days, the last 30 days (for the sparkline)
function followers(g, today) {
  const out = {};
  const rows = (g || []).filter((x) => x && P.isDay(x.day)).sort((a, b) => a.day.localeCompare(b.day));
  NETS.forEach((n) => {
    const have = rows.filter((x) => num(x[n]) != null);
    if (!have.length) return;
    const last = have[have.length - 1];
    // the count on a day: the last known on or before it (null before the first)
    const at = (d) => { let v = null; have.forEach((x) => { if (x.day <= d) v = x[n]; }); return v; };
    const ago = (k) => { const v = at(P.addDays(last.day, -k)); return v == null ? null : last[n] - v; };
    const series = [];
    for (let i = 29; i >= 0; i--) { const v = at(P.addDays(today || last.day, -i)); if (v != null) series.push(v); }
    out[n] = { now: last[n], day: last.day, d7: ago(7), d30: ago(30), series };
  });
  return out;
}

// ---------------------------------------------------------------- the month, the last 30 days
const monthOf = (day) => day.slice(0, 7);
const prevMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'); };
const monthName = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);
// the posts of a span of Bucharest days [from, to], their numbers per network, the best item
function span(list, from, to) {
  const per = {}, tot = { posts: 0, views: 0, saves: 0, shares: 0, comments: 0, likes: 0 };
  const byItem = new Map();
  (list || []).forEach((it) => {
    if (!it || it.removed) return;
    (it.plan || []).forEach((e) => {
      if (e.state !== 'posted') return;
      const d = P.roDay(Date.parse(e.postedAt || e.at));
      if (d < from || d > to) return;
      const s = (it.stats || {})[e.net] || {};
      const p = per[e.net] = per[e.net] || { posts: 0, views: 0, saves: 0, shares: 0, comments: 0, likes: 0 };
      p.posts++; tot.posts++;
      ['views', 'saves', 'shares', 'comments', 'likes'].forEach((k) => { p[k] += s[k] || 0; tot[k] += s[k] || 0; });
      const x = byItem.get(it.id) || { it, raw: 0, views: 0, best: null };
      x.raw += raw(s); x.views += s.views || 0;
      if (!x.best || raw(s) > raw((it.stats || {})[x.best.net])) x.best = e;
      byItem.set(it.id, x);
    });
  });
  const b = [...byItem.values()].filter((x) => x.raw > 0).sort((p, q) => q.raw - p.raw)[0];
  const best = b ? { id: b.it.id, topic: b.it.topic || b.it.rubric || '', rubric: b.it.rubric || '', views: b.views, net: b.best.net, url: b.best.url || '' } : null;
  return { from, to, per, total: tot, best };
}
// the followers gained in a span: the last count in it minus the last one before it (or its first)
function gained(g, from, to) {
  const out = {};
  const rows = (g || []).slice().sort((a, b) => a.day.localeCompare(b.day));
  NETS.forEach((n) => {
    const inside = rows.filter((x) => x.day >= from && x.day <= to && num(x[n]) != null);
    if (!inside.length) return;
    const before = rows.filter((x) => x.day < from && num(x[n]) != null).pop();
    const start = before || inside[0];
    if (start === inside[inside.length - 1]) return;
    out[n] = inside[inside.length - 1][n] - start[n];
  });
  return out;
}
function month(list, g, ym) {
  const from = ym + '-01', to = P.addDays(P.addDays(from, 32).slice(0, 7) + '-01', -1);
  return Object.assign({ ym, label: monthName(ym) }, span(list, from, to), { followers: gained(g, from, to) });
}
const kNum = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (Math.round(n / 100) / 10).toLocaleString('ro-RO') + 'k' : String(n || 0));
const signed = (n) => (n > 0 ? '+' : n < 0 ? '-' : '') + kNum(Math.abs(n));
// „Octombrie: 34 postări, 52,3k vizualizări. Urmăritori: IG +120, FB +45. Cel mai bun: HIFU pe gușă (12,1k).” ≤ 160
function reportText(m) {
  const name = m.label.split(' ')[0];
  const head = name.charAt(0).toUpperCase() + name.slice(1) + ': ' + (m.total.posts === 1 ? '1 postare' : m.total.posts + (m.total.posts >= 20 ? ' de' : '') + ' postări') + ', ' + kNum(m.total.views) + ' vizualizări.';
  const f = NETS.filter((n) => m.followers[n] != null).map((n) => NET_S[n] + ' ' + signed(m.followers[n]));
  const fol = f.length ? ' Urmăritori: ' + f.join(', ') + '.' : '';
  if (!m.best) return (head + fol).slice(0, 160);
  const tail = ' (' + kNum(m.best.views) + ').';
  let t = String(m.best.topic || '').trim();
  const room = 160 - (head + fol).length - ' Cel mai bun: '.length - tail.length;
  if (room < 8) return (head + fol).slice(0, 160);
  if (t.length > room) t = t.slice(0, room - 1).replace(/\s+\S*$/, '') + '…';
  return head + fol + ' Cel mai bun: ' + t + tail;
}

// ---------------------------------------------------------------- the clock
const readState = async () => Object.assign({ growthDay: '', monthReport: '' }, (await readJSON(STATE_KEY, null)) || {});
const roHour = (ms) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hour12: false }).format(new Date(ms)));
// once a day (from 5:00) the followers; the 1st from 9:00 the month's report. opts.force: both now.
async function run(opts) {
  opts = opts || {};
  const now = opts.now || Date.now(), today = P.roDay(now), out = {};
  const s = await readState();
  let save = false;
  if ((s.growthDay !== today && roHour(now) >= 5) || opts.force) {
    const row = await snapshot(now).catch((e) => { console.error('content growth:', e.message); return null; });
    out.growth = row || { none: true };
    s.growthDay = today; save = true;
  }
  const ym = prevMonth(monthOf(today));
  if ((today.slice(8, 10) === '01' && roHour(now) >= 9 && s.monthReport !== ym) || opts.forceMonth) {
    const C = require('./content');
    const m = month(await C.items(), await growth(), ym);
    if (m.total.posts > 0) {
      try {
        const N = require('./notify'), store = { readJSON, writeJSON };
        await N.notifyMany(store, await N.ownerIds(store), { kind: 'report', tone: 'good', go: 'continut', tag: 'ct-month-' + ym, title: 'RAPORTUL LUNII: conținut', text: reportText(m) });
      } catch (e) { console.error('content month:', e.message); }
    }
    out.month = { ym, posts: m.total.posts };
    s.monthReport = ym; save = true;
  }
  if (save) await writeJSON(STATE_KEY, s, { quiet: true });
  return Object.keys(out).length ? out : { skipped: true };
}

// ---------------------------------------------------------------- Admin → Conținut → Rezultate
const coverOf = (it) => { const c = it && it.cover && (it.files || []).find((f) => f.name === it.cover); return c ? { n: c.name, v: c.v || '' } : null; };
async function results(list, nowMs) {
  const now = nowMs || Date.now(), today = P.roDay(now);
  const g = await growth();
  const L = learn(list, now);
  const from30 = P.addDays(today, -29);
  const last30 = span(list, from30, today);
  // the top 10 of the last 30 days, on the same scale (a fresh post has the numbers it has so far)
  const top = L.all.filter((x) => P.roDay(x.first) >= from30).sort((a, b) => b.score - a.score).slice(0, 10).map((x) =>
    Object.assign(brief(x), { fresh: now - x.first < MATURE_MS, cover: coverOf(x.it), views: x.t.views, saves: x.t.saves, shares: x.t.shares, comments: x.t.comments, links: x.links }));
  const byId = new Map((list || []).map((it) => [it.id, it]));
  const withCover = (b) => Object.assign({}, b, { cover: coverOf(byId.get(b.id)) });
  const ym = prevMonth(monthOf(today));
  return { today, followers: followers(g, today), last30: Object.assign(last30, { followers: gained(g, from30, today) }), top,
    month: month(list, g, ym), monthNow: Object.assign({ ym: monthOf(today), label: monthName(monthOf(today)) }, span(list, monthOf(today) + '-01', today)),
    learn: { n: L.n, posts: L.posts, nets: L.nets, rubrics: L.rubrics, topics: L.topics.slice(0, 15), hooks: L.hooks, days: L.days, hours: L.hours, heat: L.heat,
      winners: L.winners.map(withCover), losers: L.losers.slice(0, 5).map(withCover), more_like: L.more_like.map(withCover) } };
}

module.exports = { learn, compact, season, recycle, calendar, familyOf, raw, rowsOf, snapshot, followers, growth, month, span, gained, reportText, run, results, readState,
  GROWTH_KEY, STATE_KEY, MATURE_MS };
