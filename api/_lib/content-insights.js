// Conținut → Rezultate, the insights (the owner, 12.11: „insights-urile să fie insane, să avem tot ce ne trebuie”).
// What content-stats.js reads per post (the metrics, the retention curves, the snapshots, „MERGE TARE 🔥”) and
// content-learn.js ranks, plus:
//  - the organic funnel (funnel()): per item and per month, the comments with the reel's word (social-comments.js,
//    content-dm.js), the private messages sent, her answers, the leads they made (content-dm.js marks them, and
//    lead.organic), then booked / came / clients / money for those leads with Reclame's own rules (ads-funnel.js
//    funnel()), and the leads that wrote to the profile (Instagram / Messenger, no form: „Profil → mesaj”) for the
//    organic total;
//  - the audience (daily from 7:00, data/content/audience.json): Instagram's followers by age, gender and city, when
//    they are online (an hour × weekday grid), the account's reach, profile views, website taps and accounts engaged
//    per day; the Facebook Page's reach and new followers per day;
//  - the recommended hours per network (recommend()): the slot times that did best for us (content-learn.js) blended
//    with the hours the followers are online (Instagram, also for Facebook); „Folosește orele recomandate” saves them
//    in the settings only when the owner taps (applyHours());
//  - what people say (weekly, Monday from 8:00, data/content/voice.json): Claude reads the comments of the last 30 days
//    on our posts and gives the themes, the repeated questions (made topic ideas, source 'comentarii', in
//    data/content/ideas.json unless one like it is there), the objections and the sentiment;
//  - the week's analysis (Monday from 9:30, after the day's numbers, data/content/analysis.json): Claude reads the
//    week (per post metrics, the rankings, the funnel, the audience, what people say) and writes „Ce a mers și de ce”,
//    „Ce n-a mers”, „Ce schimbăm săptămâna viitoare”; the owners hear it once („ANALIZA SĂPTĂMÂNII 📊”) and the
//    producer reads the changes first (content.js status → `analysis`, reels/PRODUCER.md);
//  - the monthly goals (data/content/goals.json, Setări → Ținte lunare): followers gained per network, views, organic
//    leads; progress and pace for the current month.
// No names leave here (the health page gets counts only); Claude never gets a commenter's name.

const { readJSON, writeJSON } = require('./store');
const P = require('./content-plan');
const { dedash } = require('./dedash');

const AUD_KEY = 'data/content/audience.json';
const VOICE_KEY = 'data/content/voice.json';
const ANALYSIS_KEY = 'data/content/analysis.json';
const GOALS_KEY = 'data/content/goals.json';
const STATE_KEY = 'data/content/insights-state.json';
const NETS = P.NETS;
const NET_NAME = { tt: 'TikTok', yt: 'YouTube', ig: 'Instagram', fb: 'Facebook' };
const AGES = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const C = () => require('./content');
const L = () => require('./content-learn');
const S = () => require('./content-stats');

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null);
const r1 = (x) => Math.round(x * 10) / 10;
const clip = (s, n) => dedash(String(s == null ? '' : s)).replace(/\s+/g, ' ').trim().slice(0, n);
const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const roHours = (ms) => { const [h, m] = hmFmt.format(new Date(ms)).split(':').map(Number); return h + m / 60; };
const monthOf = (day) => day.slice(0, 7);
const prevMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'); };
const monthEnd = (ym) => P.addDays(P.addDays(ym + '-01', 32).slice(0, 7) + '-01', -1);
const monthLabel = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);
const postedMs = (e) => Date.parse(e.postedAt || e.at);
const readState = async () => Object.assign({}, (await readJSON(STATE_KEY, null)) || {});
const writeState = (s) => writeJSON(STATE_KEY, s, { quiet: true });
async function tell(n) {
  try {
    const N = require('./notify'), store = { readJSON, writeJSON };
    await N.notifyMany(store, await N.ownerIds(store), Object.assign({ kind: 'report', tone: 'good', go: 'continut' }, n));
    return true;
  } catch (e) { console.error('content insights notify:', e.message); return false; }
}
function readJSONish(text) {
  const m = /\{[\s\S]*\}/.exec(String(text || ''));
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (e) { return null; }
}

// ---------------------------------------------------------------- the organic funnel
const ZERO = () => ({ kw: 0, dms: 0, replies: 0, leads: 0, booked: 0, showed: 0, clients: 0, revenue: 0 });
const MONEY = ['leads', 'booked', 'showed', 'clients', 'revenue'];
// everything the funnel needs, read once
async function sources() {
  const [comments, dm, leads, appointments, sales, stagesRaw] = await Promise.all([readJSON('data/social-comments.json', []), readJSON('data/content/dm.json', null),
    readJSON('data/leads.json', []), readJSON('data/appointments.json', []), readJSON('data/sales.json', []), readJSON('data/pipeline-stages.json', null)]);
  let stages = Array.isArray(stagesRaw) && stagesRaw.length ? stagesRaw : null;
  if (!stages) { try { stages = await require('../portal-leads').loadStages(); } catch (e) { stages = []; } }
  return { comments: Array.isArray(comments) ? comments : [], sent: dm && Array.isArray(dm.sent) ? dm.sent : [], leads: Array.isArray(leads) ? leads : [],
    appointments: Array.isArray(appointments) ? appointments : [], sales: Array.isArray(sales) ? sales : [], stages: Array.isArray(stages) ? stages : [] };
}
// The organic funnel from the sources: { items: { <id>: counts }, month, prev, week, span(from, to) }
function funnelOf(src, nowMs) {
  const now = nowMs || Date.now(), today = P.roDay(now);
  const F = require('./ads-funnel');
  // the comments with a reel's word (one per comment), the messages sent, her answers
  const kw = new Map();
  src.comments.forEach((c) => { if (c && c.state === 'dm' && c.dm && c.dm.item) kw.set(String(c.id), { item: c.dm.item, at: c.at }); });
  src.sent.forEach((e) => { if (e && e.itemId && e.commentId && !kw.has(String(e.commentId))) kw.set(String(e.commentId), { item: e.itemId, at: e.at }); });
  const dms = src.sent.filter((e) => e && e.state === 'sent' && e.itemId).map((e) => ({ item: e.itemId, at: e.at }));
  const replies = src.sent.filter((e) => e && e.state === 'sent' && e.itemId && (e.leadId || e.leadError)).map((e) => ({ item: e.itemId, at: e.leadAt || e.at }));
  // the leads the messages made: by content-dm.js's record, by the lead's own mark
  const leadItem = new Map(), leadAt = new Map();
  src.sent.forEach((e) => { if (e && e.leadId && e.itemId) { if (!leadItem.has(e.leadId)) leadItem.set(e.leadId, e.itemId); if (e.leadAt) leadAt.set(e.leadId, e.leadAt); } });
  src.leads.forEach((l) => { if (l && l.organic && l.organic.itemId && !leadItem.has(l.id)) leadItem.set(l.id, l.organic.itemId); });
  const mine = src.leads.filter((l) => l && (leadItem.has(l.id) || l.createdBy === 'content-dm'));
  const mineIds = new Set(mine.map((l) => l.id));
  // „Profil → mesaj”: Instagram / Messenger leads that came with no ad form and no reel's word
  const profil = src.leads.filter((l) => l && !mineIds.has(l.id) && ['instagram', 'facebook'].includes(l.source) && !(Array.isArray(l.forms) && l.forms.length));
  const whenOf = (l) => leadAt.get(l.id) || (l.organic && l.organic.at) || l.createdAt;
  // Reclame's rules, each lead as one form sent when she became a lead, under its key
  const syn = (l, key, at) => Object.assign({}, l, { forms: [{ sentAt: at, campaignId: key }] });
  const run = (ls, range) => F.funnel({ leads: ls, appointments: src.appointments, sales: src.sales, stages: src.stages, ads: [], period: range ? 'custom' : 'max', range: range || null }).campaigns;
  const pick = (ev) => { const o = {}; MONEY.forEach((k) => { o[k] = (ev && ev[k]) || 0; }); return o; };

  const items = {};
  const at = (id) => (items[id] = items[id] || ZERO());
  kw.forEach((x) => { at(x.item).kw++; });
  dms.forEach((x) => { at(x.item).dms++; });
  replies.forEach((x) => { at(x.item).replies++; });
  const per = run(mine.filter((l) => leadItem.has(l.id)).map((l) => syn(l, 'i:' + leadItem.get(l.id), whenOf(l))));
  per.forEach((ev, key) => { Object.assign(at(key.slice(2)), pick(ev)); });

  const inDays = (t, from, to) => { const ms = Date.parse(t); if (!ms) return false; const d = P.roDay(ms); return d >= from && d <= to; };
  function span(from, to) {
    const o = ZERO();
    kw.forEach((x) => { if (inDays(x.at, from, to)) o.kw++; });
    dms.forEach((x) => { if (inDays(x.at, from, to)) o.dms++; });
    replies.forEach((x) => { if (inDays(x.at, from, to)) o.replies++; });
    const range = { since: from, until: to };
    Object.assign(o, pick(run(mine.map((l) => syn(l, 'c', whenOf(l))), range).get('c')));
    const p = pick(run(profil.map((l) => syn(l, 'p', l.createdAt)), range).get('p'));
    const total = {}; MONEY.forEach((k) => { total[k] = o[k] + p[k]; });
    return Object.assign(o, { from, to, profil: p, total });
  }
  const ym = monthOf(today), pm = prevMonth(ym);
  return { items, span, month: Object.assign({ ym, label: monthLabel(ym) }, span(ym + '-01', today)), prev: Object.assign({ ym: pm, label: monthLabel(pm) }, span(pm + '-01', monthEnd(pm))),
    week: span(P.addDays(today, -6), today) };
}
async function funnel(list, nowMs) { return funnelOf(await sources(), nowMs); }

// ---------------------------------------------------------------- the audience
// a day and hh:00 in a time zone, as a UTC time (ms)
function atZone(day, hour, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const off = (ms) => { const p = {}; f.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = Number(x.value); }); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000; };
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, 0);
  let t = guess - off(guess);
  t = guess - off(t);
  return t;
}
const dayIn = (ms, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const resultsOf = (j) => {
  const m = j && Array.isArray(j.data) ? j.data[0] : null;
  const b = m && m.total_value && Array.isArray(m.total_value.breakdowns) ? m.total_value.breakdowns[0] : null;
  return b && Array.isArray(b.results) ? { keys: b.dimension_keys || [], results: b.results } : null;
};
function parseAgeGender(r) {
  const ai = Math.max(0, r.keys.indexOf('age')), gi = r.keys.indexOf('gender') >= 0 ? r.keys.indexOf('gender') : 1;
  const ages = {}, gender = { F: 0, M: 0, U: 0 };
  r.results.forEach((x) => {
    const dv = x.dimension_values || [], n = num(x.value) || 0;
    const age = String(dv[ai] || ''), gd = /^f/i.test(dv[gi]) ? 'F' : /^m/i.test(dv[gi]) ? 'M' : 'U';
    if (!age) return;
    const a = ages[age] = ages[age] || { F: 0, M: 0, U: 0 };
    a[gd] += n; gender[gd] += n;
  });
  return { ages, gender };
}
function parseCities(r) {
  const by = {};
  r.results.forEach((x) => { const name = String((x.dimension_values || [])[0] || '').split(',')[0].trim(); if (name) by[name] = (by[name] || 0) + (num(x.value) || 0); });
  return Object.keys(by).map((name) => ({ name, n: by[name] })).sort((a, b) => b.n - a.n).slice(0, 15);
}
// online_followers: per day an object of 24 hours; Meta gives the hours in Pacific time (the day ends at its
// end_time, midnight there): each hour goes to its Bucharest weekday and hour, each day once
function mergeOnline(prev, j) {
  const o = { cells: Object.assign({}, (prev && prev.cells) || {}), days: ((prev && prev.days) || []).slice() };
  const m = j && Array.isArray(j.data) ? j.data.find((x) => x && x.name === 'online_followers') || j.data[0] : null;
  (m && Array.isArray(m.values) ? m.values : []).forEach((v) => {
    if (!v || !v.value || typeof v.value !== 'object' || !Object.keys(v.value).length) return;
    const end = Date.parse(v.end_time || '');
    if (!end) return;
    const day = dayIn(end - 3600e3, 'America/Los_Angeles');
    if (o.days.includes(day)) return;
    o.days.push(day);
    Object.keys(v.value).forEach((hk) => {
      const n = num(v.value[hk]), h = Number(hk);
      if (n == null || !(h >= 0 && h <= 23)) return;
      const t = atZone(day, h, 'America/Los_Angeles');
      const k = P.dow(P.roDay(t)) + '|' + Math.floor(roHours(t));
      const c = o.cells[k] = o.cells[k] || { s: 0, n: 0 };
      c.s += n; c.n++;
    });
  });
  o.days = o.days.sort().slice(-60);
  return o;
}
async function audience() { return (await readJSON(AUD_KEY, null)) || null; }
// once a day: what Instagram and the Page say about the followers and yesterday
async function audienceRun(nowMs) {
  const now = nowMs || Date.now();
  const a = await require('./content-post').access(true).catch(() => null);
  if (!a || !a.connected || !a.token) return { error: 'not_connected' };
  const ads = require('./meta-ads'), ST = S();
  const g = (path, params) => ads.call('GET', path, a.token, params).catch(() => ({ ok: false, j: {} }));
  const cur = (await audience()) || {};
  const out = Object.assign({ ig: {}, fb: {}, days: [] }, cur);
  out.ig = Object.assign({}, cur.ig || {}); out.fb = Object.assign({}, cur.fb || {});
  const today = P.roDay(now), y = P.addDays(today, -1);
  const since = Math.floor(P.atRo(y, '00:00') / 1000), until = Math.floor(P.atRo(today, '00:00') / 1000);
  const row = { day: y };
  const read = [];
  const valueOf = (m) => (m && m.total_value && num(m.total_value.value) != null ? num(m.total_value.value) : m && Array.isArray(m.values) && m.values.length ? num(m.values[m.values.length - 1].value) : null);
  if (a.igId) {
    const demo = async (breakdown) => {
      const p = { metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', breakdown };
      let r = await g('/' + a.igId + '/insights', p);
      if (!r.ok && /timeframe/i.test(String(((r.j || {}).error || {}).message || ''))) r = await g('/' + a.igId + '/insights', Object.assign({ timeframe: 'this_month' }, p));
      return r.ok ? resultsOf(r.j) : null;
    };
    const ag = await demo('age,gender');
    if (ag && ag.results.length) { Object.assign(out.ig, parseAgeGender(ag)); read.push('demografie'); }
    const ct = await demo('city');
    if (ct && ct.results.length) { out.ig.cities = parseCities(ct); read.push('orașe'); }
    // the first time a week back, then yesterday
    const from = out.ig.online && out.ig.online.days && out.ig.online.days.length ? since : since - 6 * 86400;
    const onl = await g('/' + a.igId + '/insights', { metric: 'online_followers', period: 'lifetime', since: from, until });
    if (onl.ok) { out.ig.online = mergeOnline(out.ig.online, onl.j); read.push('online'); }
    const d = await ST.insights('/' + a.igId + '/insights', a.token, ['reach', 'profile_views', 'website_clicks', 'accounts_engaged'], { period: 'day', metric_type: 'total_value', since, until }, 'ig_acct');
    const by = {}; d.forEach((m) => { by[m.name] = valueOf(m); });
    const ig = {};
    [['reach', 'reach'], ['profileViews', 'profile_views'], ['websiteClicks', 'website_clicks'], ['engaged', 'accounts_engaged']].forEach(([k, m]) => { if (by[m] != null) ig[k] = by[m]; });
    if (Object.keys(ig).length) { row.ig = ig; read.push('ziua IG'); }
    out.ig.at = new Date(now).toISOString();
  }
  if (a.pageId) {
    const d = await ST.insights('/' + a.pageId + '/insights', a.token, ['page_impressions_unique', 'page_daily_follows_unique', 'page_follows'], { period: 'day', since, until }, 'fb_page');
    const by = {}; d.forEach((m) => { by[m.name] = valueOf(m); });
    const fb = {};
    [['reach', 'page_impressions_unique'], ['follows', 'page_daily_follows_unique'], ['followers', 'page_follows']].forEach(([k, m]) => { if (by[m] != null) fb[k] = by[m]; });
    if (Object.keys(fb).length) { row.fb = fb; read.push('ziua FB'); }
    out.fb.at = new Date(now).toISOString();
  }
  if (row.ig || row.fb) {
    const days = (out.days || []).filter((x) => x && x.day !== row.day).concat(row).sort((p, q) => p.day.localeCompare(q.day));
    out.days = days.slice(-120);
  }
  out.at = new Date(now).toISOString(); out.day = today;
  await writeJSON(AUD_KEY, out, { quiet: true });
  return { read };
}
// for Rezultate: the shares, the top cities, the online grid (0..1), the last 30 days added up
function audienceView(aud, nowMs) {
  if (!aud) return null;
  const today = P.roDay(nowMs || Date.now()), from = P.addDays(today, -30);
  const ig = aud.ig || {}, out = { at: aud.at || '' };
  const ages = ig.ages || {}, keys = Object.keys(ages).sort((a, b) => (AGES.indexOf(a) + 1 || 99) - (AGES.indexOf(b) + 1 || 99));
  const total = keys.reduce((s, k) => s + ages[k].F + ages[k].M + ages[k].U, 0);
  if (total > 0) {
    out.ages = keys.map((k) => { const a = ages[k], n = a.F + a.M + a.U; return { k, F: a.F, M: a.M, U: a.U, n, p: r1((n / total) * 100) }; });
    const gsum = ig.gender ? ig.gender.F + ig.gender.M + ig.gender.U : 0;
    if (gsum > 0) out.gender = { F: r1((ig.gender.F / gsum) * 100), M: r1((ig.gender.M / gsum) * 100), U: r1((ig.gender.U / gsum) * 100) };
    out.followers = total;
  }
  if (Array.isArray(ig.cities) && ig.cities.length) {
    const ct = ig.cities.reduce((s, c) => s + c.n, 0) || 1;
    out.cities = ig.cities.slice(0, 8).map((c) => ({ name: c.name, n: c.n, p: r1((c.n / ct) * 100) }));
  }
  const on = onlineGrid(ig.online);
  if (on) out.online = on;
  const days = (aud.days || []).filter((x) => x && x.day >= from);
  const sum = (net, k) => { const v = days.map((x) => x[net] && num(x[net][k])).filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) : null; };
  const d30 = { ig: {}, fb: {} };
  ['reach', 'profileViews', 'websiteClicks', 'engaged'].forEach((k) => { const v = sum('ig', k); if (v != null) d30.ig[k] = v; });
  ['reach', 'follows'].forEach((k) => { const v = sum('fb', k); if (v != null) d30.fb[k] = v; });
  if (Object.keys(d30.ig).length || Object.keys(d30.fb).length) out.d30 = d30;
  return Object.keys(out).length > 1 ? out : null;
}
// the online followers per Bucharest weekday (0 Sunday) and hour, 0..1; and per hour over the week
function onlineGrid(o) {
  const cells = (o && o.cells) || {};
  if (!Object.keys(cells).length) return null;
  const grid = [0, 1, 2, 3, 4, 5, 6].map((d) => Array.from({ length: 24 }, (_, h) => { const c = cells[d + '|' + h]; return c && c.n ? c.s / c.n : null; }));
  const max = Math.max(1, ...grid.flat().filter((x) => x != null));
  const hours = Array.from({ length: 24 }, (_, h) => { const v = grid.map((r) => r[h]).filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; });
  const hmax = Math.max(1, ...hours.filter((x) => x != null));
  const best = hours.map((v, h) => ({ h, v })).filter((x) => x.v != null).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => String(x.h).padStart(2, '0') + ':00');
  return { grid: grid.map((r) => r.map((v) => (v == null ? null : Math.round((v / max) * 100) / 100))), hours: hours.map((v) => (v == null ? null : Math.round((v / hmax) * 100) / 100)), best, days: (o.days || []).length };
}

// ---------------------------------------------------------------- the recommended hours
const okHM = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s));
const minutes = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
// Per network: as many times as it has now, the best by our own slot scores (content-learn.js hours, pulled towards 1)
// blended with the online followers (Instagram's, for Facebook too); at least 2 hours apart, never the photo time.
// { <net>: { now, rec, why: 'ambele'|'online'|'postari', n, same } }
function recommend(lr, aud, st) {
  const on = onlineGrid(aud && aud.ig && aud.ig.online);
  const out = {};
  NETS.forEach((net) => {
    const cur = (st.times && st.times[net]) || [];
    const k = Math.max(1, cur.length);
    const own = ((lr && lr.hours && lr.hours[net]) || []).filter((x) => okHM(x.at));
    const online = (net === 'ig' || net === 'fb') && on ? on.hours : null;
    const n = own.reduce((s, x) => s + x.n, 0);
    if (!own.length && !online) return;
    const cand = new Map();
    own.forEach((x) => cand.set(x.at, x));
    if (online) for (let h = 8; h <= 21; h++) { const t = String(h).padStart(2, '0') + ':00'; if (!cand.has(t)) cand.set(t, null); }
    const onAt = (hm) => { if (!online) return null; const h = Math.floor(minutes(hm) / 60); const a = online[h], b = online[(h + 1) % 24]; const v = [a, b].filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    const scored = [...cand.keys()].map((t) => {
      const o = cand.get(t), w = o ? o.n / (o.n + 3) : 0, ownS = o ? o.score : 1, ol = onAt(t);
      const s = ol == null ? ownS : w * ownS + (1 - w) * (0.6 + 0.8 * ol);
      return { t, s, own: !!o, ol };
    }).filter((x) => x.own || x.ol != null).sort((a, b) => b.s - a.s || a.t.localeCompare(b.t));
    const photo = st.photoTime && st.photoTime[net];
    const rec = [];
    for (const x of scored) {
      if (rec.length >= k) break;
      if (x.t === photo || rec.some((y) => Math.abs(minutes(y.t) - minutes(x.t)) < 120)) continue;
      rec.push(x);
    }
    if (!rec.length) return;
    // fewer good times than the network takes: its own times fill the rest (never fewer slots than now)
    const far = (t) => t !== photo && !rec.some((y) => Math.abs(minutes(y.t) - minutes(t)) < 120);
    cur.filter(okHM).forEach((t) => { if (rec.length < k && far(t)) rec.push({ t, own: false, ol: null, keep: true }); });
    cur.filter(okHM).forEach((t) => { if (rec.length < k && !rec.some((y) => y.t === t) && t !== photo) rec.push({ t, own: false, ol: null, keep: true }); });
    const times = rec.map((x) => x.t);
    const why = rec.some((x) => x.own) && online ? 'ambele' : online ? 'online' : 'postari';
    out[net] = { now: cur.slice(), rec: times, why, n, same: times.length === cur.length && times.every((t, i) => t === cur[i]) };
  });
  return out;
}
// „Folosește orele recomandate”: the recommended times saved, the plans follow (the owner's tap only)
async function applyHours(nowMs) {
  const now = nowMs || Date.now();
  const list = await C().items(), st = await C().settings();
  const rec = recommend(L().learn(list, now), await audience(), st);
  const times = {};
  Object.keys(rec).forEach((n) => { if (!rec[n].same && rec[n].rec.length) times[n] = rec[n].rec; });
  if (!Object.keys(times).length) return { applied: {} };
  const next = await C().saveSettings({ times });
  await replanAll(next);
  return { applied: times };
}
// a change of settings: the plans follow (a network on or off, new times, new quotas)
async function replanAll(st) {
  await C().items();
  const now = Date.now();
  await C().update((list) => { let n = P.reflow(list, st, now) + P.retime(list, st, now); const before = JSON.stringify(list.map((x) => x.plan)); P.replanFrom(list, st, now); n += before === JSON.stringify(list.map((x) => x.plan)) ? 0 : 1; return n ? undefined : false; });
}

// ---------------------------------------------------------------- what people say
const VOICE_RULES = `Citești comentariile lăsate în ultimele 30 de zile la postările organice (reels și carusele) ale clinicii Centrul360, două clinici de medicină estetică non-invazivă în Timișoara și Arad (corp, față, epilare laser). Proprietarul vrea să știe ce spun oamenii, ca să facă materiale mai bune.

Scrii în română, cu diacritice, scurt și concret, fără liniuțe lungi (— sau –), fără nume de persoane.
- themes: cele mai dese 3-6 teme (ce îi interesează), fiecare cu câte comentarii o ating (n);
- questions: întrebările care se repetă (cel puțin 2 comentarii, sau una foarte importantă), fiecare cu n și cu „idea”: o idee de material scurt care răspunde la ea (un subiect de reel, 4-12 cuvinte, fără preț, ofertă sau programare, fără promisiuni);
- objections: îndoielile și obiecțiile (frică, durere, „nu ține”, preț, timp), cu n;
- sentiment: procentele de comentarii pozitive, neutre și negative (pos + neu + neg = 100);
- summary: o frază de cel mult 140 de caractere cu ce spun oamenii.
Nu inventezi nimic: doar ce e în comentarii.

Răspunzi DOAR cu un obiect JSON, fără alt text: {"themes":[{"t":"…","n":3}],"questions":[{"q":"…","n":2,"idea":"…"}],"objections":[{"o":"…","n":1}],"sentiment":{"pos":60,"neu":30,"neg":10},"summary":"…"}`;
async function voice() { return (await readJSON(VOICE_KEY, null)) || null; }
// the comments of the last 30 days on our posts (text only, never a name)
function ourComments(all, list, sinceMs) {
  const DM = require('./content-dm');
  const posted = [];
  (list || []).forEach((it) => (it.plan || []).forEach((e) => { if (e.state === 'posted' && (e.net === 'ig' || e.net === 'fb')) posted.push(e); }));
  return (all || []).filter((c) => c && Date.parse(c.at) >= sinceMs && String(c.text || '').trim() && !/^(\s*@[\w.]+)+\s*$/.test(c.text) &&
    ((c.dm && c.dm.item) || posted.some((e) => e.net === c.channel && DM.samePost(e, c.postId, c.link))));
}
const STOPW = new Set('si sau cu de la in pe din ce cum cat care un o a al ale ai e este sunt nu mai dupa fara pentru despre sa se te ne ma il le lui ei lor tot doar chiar asa acum mi iti ti va vs'.split(' '));
const words = (s) => new Set(fold(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length >= 3 && !STOPW.has(w)));
// one like it is already there: the same words for the most part
function similar(a, b) {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return false;
  let both = 0; x.forEach((w) => { if (y.has(w)) both++; });
  return both / Math.min(x.size, y.size) >= 0.75 || both / (x.size + y.size - both) >= 0.5;
}
async function voiceRun(nowMs, opts) {
  const now = nowMs || Date.now(), o = opts || {};
  const list = await C().items();
  const comments = ourComments(await readJSON('data/social-comments.json', []), list, now - 30 * 864e5).slice(-300);
  const week = P.weekOf(now);
  if (comments.length < 3) {
    await writeJSON(VOICE_KEY, { at: new Date(now).toISOString(), week, n: comments.length, few: true }, { quiet: true });
    return { few: comments.length };
  }
  if (!process.env.ANTHROPIC_API_KEY && !o.ask) return { retry: true, error: 'Lipsește cheia Claude' };
  const ask = o.ask || require('../portal-nuki').lib.ask;
  const text = comments.map((c) => '- [' + (c.channel === 'ig' ? 'IG' : 'FB') + '] ' + clip(c.text, 300)).join('\n');
  let j = null;
  for (let i = 0; i < 2 && !j; i++) {
    const r = await ask([{ type: 'text', text: VOICE_RULES, cache_control: { type: 'ephemeral' } }], [{ role: 'user', content: 'Comentariile (' + comments.length + '):\n' + text }]).catch((e) => ({ error: e.message }));
    if (!r || r.error || r.refused) continue;
    const x = readJSONish(r.text);
    if (x && (Array.isArray(x.themes) || Array.isArray(x.questions))) j = x;
  }
  if (!j) return { retry: true, error: 'Claude n-a răspuns cum trebuie' };
  const arr = (a, f) => (Array.isArray(a) ? a.map(f).filter(Boolean) : []);
  const themes = arr(j.themes, (x) => (x && clip(x.t || x.theme, 120) ? { t: clip(x.t || x.theme, 120), n: Math.max(1, Math.round(num(x.n) || 1)) } : null)).slice(0, 6);
  const questions = arr(j.questions, (x) => (x && clip(x.q, 200) ? { q: clip(x.q, 200), n: Math.max(1, Math.round(num(x.n) || 1)), idea: clip(x.idea, 140) } : null)).slice(0, 8);
  const objections = arr(j.objections, (x) => (x && clip(x.o, 160) ? { o: clip(x.o, 160), n: Math.max(1, Math.round(num(x.n) || 1)) } : null)).slice(0, 6);
  const sn = j.sentiment || {}, ps = [num(sn.pos) || 0, num(sn.neu) || 0, num(sn.neg) || 0], tot = ps.reduce((s, x) => s + x, 0);
  const sentiment = tot > 0 ? { pos: Math.round((ps[0] / tot) * 100), neu: Math.round((ps[1] / tot) * 100), neg: 0 } : null;
  if (sentiment) sentiment.neg = 100 - sentiment.pos - sentiment.neu;
  // the repeated questions become topic ideas (at most 5, none like an idea or a topic already there)
  const ideas = await C().ideas();
  const topics = list.filter((it) => !it.removed && now - (Date.parse(it.createdAt) || 0) < 90 * 864e5).map((it) => it.topic || '');
  const seen = ideas.map((d) => d.text).concat(topics);
  let added = 0;
  for (const q of questions.slice().sort((a, b) => b.n - a.n)) {
    const idea = q.idea || q.q;
    if (added >= 5 || idea.length < 6) continue;
    if (seen.some((t) => similar(t, idea))) { q.dup = true; continue; }
    await C().addIdea(idea, 'Întrebarea zilei', 'comentarii').catch((e) => console.error('content voice idea:', e.message));
    seen.push(idea); q.added = true; added++;
  }
  const v = { at: new Date(now).toISOString(), week, n: comments.length, themes, questions, objections, sentiment, summary: clip(j.summary, 160), ideas: added };
  await writeJSON(VOICE_KEY, v, { quiet: true });
  return { n: comments.length, ideas: added };
}

// ---------------------------------------------------------------- the week's analysis
const ANALYSIS_RULES = `Ești strategul de conținut organic al clinicii Centrul360 (două clinici de medicină estetică non-invazivă, Timișoara și Arad). Primești cifrele săptămânii care s-a încheiat pentru reels și caruselele de pe TikTok, YouTube Shorts, Instagram și Facebook: fiecare postare cu cifrele ei pe fiecare rețea și cu ×-ul față de o postare obișnuită a rețelei („x”: 1 = obișnuit, 2 = de două ori mai bine), rata de cârlig (hook: cât rămân după 3 secunde), hold (cât rămân la jumătate), procentul vizionat, engagement, salvări / distribuiri / urmăritori la 1000 de vizualizări, apoi clasamentele (rubrici, subiecte, tipuri de cârlig, ore), pâlnia organică (comentarii cu cuvântul, mesaje, răspunsuri, leaduri, programări, cliente), publicul și ce spun oamenii în comentarii.

Scrii analiza pentru proprietar, în română, cu diacritice, direct și concret, fără liniuțe lungi (— sau –), fără nume de persoane, fără să inventezi cifre (doar cele primite; ce lipsește nu presupui):
- summary: o frază de cel mult 140 de caractere, concluzia săptămânii;
- worked: 2-4 puncte „ce a mers și de ce”, fiecare cu cifra care o arată;
- notWorked: 1-3 puncte „ce n-a mers”, cu cifra;
- changes: 3-5 schimbări concrete pentru săptămâna viitoare, pe care producătorul de reels le poate aplica direct: cârlige (tipul și primele cuvinte), lungimi (secunde), rubrici, ore, subiecte; fiecare o propoziție la imperativ.
Puțin date (sub 5 postări): spui asta în summary și propui schimbări prudente.

Răspunzi DOAR cu un obiect JSON, fără alt text: {"summary":"…","worked":["…"],"notWorked":["…"],"changes":["…"]}`;
async function analyses() { const a = await readJSON(ANALYSIS_KEY, []); return Array.isArray(a) ? a : []; }
const range = (w) => { const e = P.addDays(w, 6); return Number(w.slice(8, 10)) + (w.slice(5, 7) === e.slice(5, 7) ? '' : '.' + w.slice(5, 7)) + '-' + Number(e.slice(8, 10)) + '.' + e.slice(5, 7); };
// what Claude reads: the week's posts with their numbers and rates, the rankings, the funnel, the audience, the voice
async function weekNumbers(list, week, nowMs) {
  const now = nowMs || Date.now();
  const ST = S(), LR = L().learn(list, now), from = week, to = P.addDays(week, 6);
  const { rows } = L().rowsOf(list, now);
  const idx = new Map(rows.map((r) => [r.it.id + '|' + r.net, r.idx]));
  const posts = [];
  (list || []).forEach((it) => {
    if (!it || it.removed) return;
    const es = (it.plan || []).filter((e) => e.state === 'posted' && (d => d >= from && d <= to)(P.roDay(postedMs(e))));
    if (!es.length) return;
    const dur = ST.durOf(it);
    posts.push({ topic: it.topic || '', rubric: it.rubric || '', kind: it.kind, hookType: it.hookType || '', hook: it.hook || '', dur: dur || undefined, keyword: it.keyword || undefined,
      nets: es.map((e) => { const s = (it.stats || {})[e.net] || {}; const r = ST.rates(s, dur); const o = { net: e.net, at: hmFmt.format(new Date(postedMs(e))), x: idx.has(it.id + '|' + e.net) ? r1(idx.get(it.id + '|' + e.net)) : undefined };
        ['views', 'reach', 'likes', 'comments', 'shares', 'saves', 'follows', 'watch'].forEach((k) => { if (num(s[k]) != null) o[k] = s[k]; });
        Object.keys(r).forEach((k) => { if (r[k] != null) o[k] = r[k]; });
        return o; }) });
  });
  const src = await sources();
  const fn = funnelOf(src, now).span(from, to);
  const aud = audienceView(await audience(), now);
  const v = await voice();
  const cp = L().compact(LR);
  return { week: range(week), posts, learn: { n: cp.n, rubrics: cp.rubrics, topics: cp.topics.slice(0, 6), worst: cp.worst, hooks: cp.hooks, hours: cp.hours },
    funnel: { kw: fn.kw, dms: fn.dms, replies: fn.replies, leads: fn.leads, booked: fn.booked, showed: fn.showed, clients: fn.clients, profilLeads: fn.profil.leads },
    audience: aud ? { gender: aud.gender, ages: (aud.ages || []).map((a) => a.k + ' ' + a.p + '%'), cities: (aud.cities || []).slice(0, 3).map((c) => c.name), online: aud.online ? aud.online.best : undefined } : undefined,
    voice: v && !v.few ? { themes: v.themes, questions: (v.questions || []).map((q) => q.q), objections: v.objections, sentiment: v.sentiment } : undefined,
    times: (await C().settings()).times };
}
const bullets = (a, n, len) => (Array.isArray(a) ? a.map((x) => clip(typeof x === 'string' ? x : x && (x.text || x.t), len)).filter((x) => x.length >= 8).slice(0, n) : []);
async function analysisRun(nowMs, opts) {
  const now = nowMs || Date.now(), o = opts || {};
  const week = o.week || P.addDays(P.weekOf(now), -7);
  const list = await C().items();
  const data = await weekNumbers(list, week, now);
  if (!data.posts.length) return { none: true, week };
  if (!process.env.ANTHROPIC_API_KEY && !o.ask) return { retry: true, error: 'Lipsește cheia Claude', week };
  const ask = o.ask || require('../portal-nuki').lib.ask;
  let out = null, why = '';
  for (let i = 0; i < 2 && !out; i++) {
    const r = await ask([{ type: 'text', text: ANALYSIS_RULES, cache_control: { type: 'ephemeral' } }],
      [{ role: 'user', content: 'Cifrele săptămânii ' + data.week + ' (JSON):\n' + JSON.stringify(data) + (why ? '\n\nAtenție: ' + why : '') }], 'medium').catch((e) => ({ error: e.message }));
    if (!r || r.error || r.refused) { why = ''; continue; }
    const j = readJSONish(r.text);
    const a = j && { summary: clip(j.summary, 160), worked: bullets(j.worked, 4, 260), notWorked: bullets(j.notWorked, 3, 260), changes: bullets(j.changes, 5, 240) };
    if (a && a.summary && a.worked.length && a.changes.length >= 3) out = a;
    else why = 'summary, 2-4 worked, 1-3 notWorked și 3-5 changes, doar JSON.';
  }
  if (!out) return { retry: true, error: 'Analiza n-a ieșit cum trebuie', week };
  const rec = Object.assign({ week, label: data.week, at: new Date(now).toISOString(), posts: data.posts.length }, out);
  const all = (await analyses()).filter((x) => x && x.week !== week);
  all.unshift(rec);
  all.sort((a, b) => String(b.week).localeCompare(String(a.week)));
  await writeJSON(ANALYSIS_KEY, all.slice(0, 26), { quiet: true });
  return { ok: true, week, rec };
}
// what the producer follows (content.js status → analysis): the latest week's changes
async function forProducer() {
  const a = (await analyses())[0];
  return a ? { week: a.week, label: a.label || '', at: a.at, summary: a.summary || '', changes: a.changes || [] } : null;
}

// ---------------------------------------------------------------- the monthly goals
async function goals() { return Object.assign({ followers: {} }, (await readJSON(GOALS_KEY, null)) || {}); }
async function saveGoals(input, by) {
  const x = input || {}, g = { followers: {} };
  const n = (v) => { const k = Math.round(Number(v)); return Number.isFinite(k) && k > 0 ? Math.min(k, 1e8) : 0; };
  NETS.forEach((net) => { const v = n(x.followers && x.followers[net]); if (v) g.followers[net] = v; });
  if (n(x.views)) g.views = n(x.views);
  if (n(x.leads)) g.leads = n(x.leads);
  g.at = new Date().toISOString(); g.by = String(by || '').slice(0, 60);
  await writeJSON(GOALS_KEY, g);
  return g;
}
// this month's progress: per goal the value, the share of it, where it should be by today, the month's projection
function progress(g, vals, nowMs) {
  const now = nowMs || Date.now(), today = P.roDay(now), ym = monthOf(today);
  const days = Number(monthEnd(ym).slice(8, 10)), d = Number(today.slice(8, 10));
  const frac = Math.min(1, (d - 1 + roHours(now) / 24) / days);
  const rows = [];
  const row = (key, label, net, target, value) => {
    if (!target) return;
    const v = value || 0, projected = frac > 0.02 ? Math.round(v / frac) : null;
    rows.push({ key, label, net: net || '', target, value: v, pct: Math.round((v / target) * 1000) / 10, expected: Math.round(target * frac),
      projected, pace: v >= target ? 'done' : projected != null && projected >= target ? 'ok' : v >= target * frac * 0.95 ? 'ok' : 'behind' });
  };
  NETS.forEach((net) => row('f_' + net, 'Urmăritori noi ' + NET_NAME[net], net, (g.followers || {})[net], (vals.followers || {})[net]));
  row('views', 'Vizualizări', '', g.views, vals.views);
  row('leads', 'Leaduri organice', '', g.leads, vals.leads);
  return { ym, label: monthLabel(ym), day: d, days, rows, set: rows.length > 0 };
}

// ---------------------------------------------------------------- Rezultate
// per item, per network: × the network's usual post (content-learn.js) and the rates
function itemInsights(list, nowMs) {
  const ST = S(), { rows } = L().rowsOf(list, nowMs || Date.now());
  const out = {};
  rows.forEach((r) => { const o = out[r.it.id] = out[r.it.id] || { x: {} }; o.x[r.net] = r2(r.idx); });
  (list || []).forEach((it) => {
    if (!it || !it.stats || !Object.keys(it.stats).length) return;
    const o = out[it.id] = out[it.id] || { x: {} }, dur = ST.durOf(it);
    o.rates = {};
    Object.keys(it.stats).forEach((n) => { o.rates[n] = ST.rates(it.stats[n], dur); });
  });
  return out;
}
const r2 = (x) => Math.round(x * 100) / 100;
// the blocks Rezultate adds to content-learn.js results()
async function extra(list, nowMs) {
  const now = nowMs || Date.now(), today = P.roDay(now), from30 = P.addDays(today, -29);
  const ST = S(), LL = L();
  const lr = LL.learn(list, now);
  const [aud, v, an, g, growth, st, src] = await Promise.all([audience(), voice(), analyses(), goals(), LL.growth(), C().settings(), sources()]);
  const fn = funnelOf(src, now);
  // the rates over the last 30 days, per network and all together (weighted by views)
  const acc = {}, all = { v: 0, i: 0, f: 0, fv: 0, pct: [], hook: [], hold: [], n: 0 };
  (list || []).forEach((it) => {
    if (!it || it.removed) return;
    const dur = ST.durOf(it);
    (it.plan || []).forEach((e) => {
      if (e.state !== 'posted' || P.roDay(postedMs(e)) < from30) return;
      const s = (it.stats || {})[e.net]; if (!s) return;
      const views = num(s.views) || num(s.reach) || 0; if (!views) return;
      const r = ST.rates(s, dur);
      const a = acc[e.net] = acc[e.net] || { v: 0, i: 0, f: 0, fv: 0, pct: [], hook: [], hold: [], n: 0 };
      [a, all].forEach((x) => {
        x.n++; x.v += views; x.i += num(s.interactions) != null ? s.interactions : (s.likes || 0) + (s.comments || 0) + (s.shares || 0) + (s.saves || 0);
        if (num(s.follows) != null) { x.f += s.follows; x.fv += views; }
        if (r.avgPct != null) x.pct.push(r.avgPct); if (r.hook != null) x.hook.push(r.hook); if (r.hold != null) x.hold.push(r.hold);
      });
    });
  });
  const sum = (a) => ({ n: a.n, er: a.v ? r1((a.i / a.v) * 100) : null, avgPct: a.pct.length ? r1(mean(a.pct)) : null, hook: a.hook.length ? r1(mean(a.hook)) : null,
    hold: a.hold.length ? r1(mean(a.hold)) : null, followK: a.fv ? r1((a.f / a.fv) * 1000) : null });
  const netRates = {}; Object.keys(acc).forEach((n) => { netRates[n] = sum(acc[n]); });
  const last30 = LL.span(list, from30, today), fol30 = LL.gained(growth, from30, today);
  const mspan = LL.span(list, monthOf(today) + '-01', today), mfol = LL.gained(growth, monthOf(today) + '-01', today);
  const tot = sum(all);
  const kpi = { views30: last30.total.views, posts30: last30.total.posts, followers30: Object.keys(fol30).length ? Object.values(fol30).reduce((s, x) => s + x, 0) : null,
    leadsMonth: fn.month.total.leads, revenueMonth: fn.month.total.revenue, clientsMonth: fn.month.total.clients, er30: tot.er, watch30: tot.avgPct, hook30: tot.hook };
  // „MERGE TARE 🔥” of the last 14 days
  const coverOf = (it) => { const c = it && it.cover && (it.files || []).find((f) => f.name === it.cover); return c ? { n: c.name, v: c.v || '' } : null; };
  const hot = (list || []).filter((it) => it && !it.removed && it.hot && now - (Date.parse(it.hot.at) || 0) < 14 * 864e5).sort((a, b) => String(b.hot.at).localeCompare(String(a.hot.at))).map((it) => ({
    id: it.id, kind: it.kind, topic: it.topic || '', rubric: it.rubric || '', cover: coverOf(it), net: it.hot.net, x: it.hot.x, h: it.hot.h, views: it.hot.views, at: it.hot.at,
    nets: (it.plan || []).filter((e) => e.state === 'posted' && (e.net === 'ig' || e.net === 'fb')).map((e) => e.net),
    boosted: (it.boosts || []).filter((b) => b && b.campaignId && !b.gone).map((b) => b.net) }));
  const items = {};
  Object.keys(fn.items).forEach((id) => { const x = fn.items[id]; if (Object.values(x).some((y) => y)) items[id] = x; });
  const strip = (m) => ({ ym: m.ym, label: m.label, kw: m.kw, dms: m.dms, replies: m.replies, leads: m.leads, booked: m.booked, showed: m.showed, clients: m.clients, revenue: m.revenue, profil: m.profil, total: m.total });
  const gl = progress(g, { followers: mfol, views: mspan.total.views, leads: fn.month.total.leads }, now);
  return { kpi, netRates, funnel: { month: strip(fn.month), prev: strip(fn.prev), items }, hot, audience: audienceView(aud, now), hoursRec: recommend(lr, aud, st),
    voice: v, analysis: an.slice(0, 12), goals: Object.assign(gl, { values: { followers: g.followers || {}, views: g.views || 0, leads: g.leads || 0 } }) };
}

// ---------------------------------------------------------------- the clock
// every hour: the audience once a day (from 7:00), what people say on Monday from 8:00, the week's analysis on
// Monday from 9:30 once the day's numbers are read (or from 12:00); a Claude call that fails is tried again on the
// next runs, 3 times a week at most. opts.now, opts.force (all three now), opts.ask (tests).
async function run(opts) {
  const o = opts || {};
  const now = o.now || Date.now(), today = P.roDay(now), h = roHours(now), dow = P.dow(today), wk = P.weekOf(now);
  const s = await readState(), out = {};
  let save = false;
  if ((s.audDay !== today && h >= 7) || o.force || o.forceAudience) {
    out.audience = await audienceRun(now).catch((e) => ({ error: e.message }));
    s.audDay = today; save = true;
  }
  if ((dow === 1 && h >= 8 && s.voiceWeek !== wk) || o.force || o.forceVoice) {
    const r = await voiceRun(now, o).catch((e) => ({ retry: true, error: e.message }));
    out.voice = r;
    if (r.retry && (s.voiceTries || 0) < 2 && !o.force) s.voiceTries = (s.voiceTries || 0) + 1;
    else { s.voiceWeek = wk; s.voiceTries = 0; }
    save = true;
  }
  const last = P.addDays(wk, -7);
  const statsDone = async () => { const cs = await C().readState(); return cs.statsDay === today || h >= 12; };
  if (((dow === 1 && h >= 9.5 && s.analysisWeek !== last && !(out.voice && !out.voice.few) && (await statsDone())) || o.force || o.forceAnalysis)) {
    const r = await analysisRun(now, o).catch((e) => ({ retry: true, error: e.message }));
    out.analysis = r.rec ? { ok: true, week: r.week } : r;
    if (r.retry && (s.analysisTries || 0) < 2 && !o.force) s.analysisTries = (s.analysisTries || 0) + 1;
    else { s.analysisWeek = last; s.analysisTries = 0; }
    save = true;
    // the owners hear it once a week
    if (r.rec && s.analysisTold !== r.week) {
      const text = (r.rec.summary || r.rec.changes[0] || '').slice(0, 160);
      if (await tell({ tag: 'ct-analysis-' + r.week, title: 'ANALIZA SĂPTĂMÂNII 📊', text })) s.analysisTold = r.week;
    }
  }
  if (save) await writeState(s);
  return Object.keys(out).length ? out : { skipped: true };
}

// ---------------------------------------------------------------- the health page (counts only)
async function summary(nowMs) {
  const now = nowMs || Date.now();
  const list = await C().items();
  const [a, v, aud, g, s] = await Promise.all([analyses(), voice(), audience(), goals(), readState()]);
  let snaps = 0, deep = 0, ret = 0, hotWeek = 0, lastHot = '';
  list.forEach((it) => {
    if (!it) return;
    if (it.snaps && Object.keys(it.snaps).length) snaps++;
    Object.values(it.stats || {}).forEach((x) => { if (x && (x.watch != null || x.follows != null || x.ret)) deep++; if (x && x.ret) ret++; });
    if (it.hot) { if (now - (Date.parse(it.hot.at) || 0) < 7 * 864e5) hotWeek++; if (String(it.hot.at) > lastHot) lastHot = it.hot.at; }
  });
  const fn = await funnel(list, now).catch(() => null);
  return { snapshots: snaps, deepStats: deep, curves: ret, hotWeek, lastHot,
    analysis: a[0] ? { week: a[0].week, at: a[0].at, changes: (a[0].changes || []).length } : null, analysisWeek: s.analysisWeek || '', analysisTries: s.analysisTries || 0,
    voice: v ? { at: v.at, comments: v.n || 0, ideas: v.ideas || 0, few: !!v.few } : null, audience: aud ? { at: aud.at || '', days: (aud.days || []).length, cities: ((aud.ig || {}).cities || []).length, online: !!((aud.ig || {}).online) } : null,
    goals: !!(Object.keys(g.followers || {}).length || g.views || g.leads),
    funnelMonth: fn ? { kw: fn.month.kw, dms: fn.month.dms, replies: fn.month.replies, leads: fn.month.leads, booked: fn.month.booked, clients: fn.month.clients, profilLeads: fn.month.profil.leads } : null };
}

module.exports = { AUD_KEY, VOICE_KEY, ANALYSIS_KEY, GOALS_KEY, STATE_KEY, funnel, funnelOf, sources, audience, audienceRun, audienceView, onlineGrid, mergeOnline, parseAgeGender, parseCities,
  atZone, recommend, applyHours, replanAll, voice, voiceRun, ourComments, similar, analyses, analysisRun, weekNumbers, forProducer, goals, saveGoals, progress, itemInsights, extra, run,
  summary, readState };
