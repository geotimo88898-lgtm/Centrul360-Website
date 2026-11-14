// Conținut: the numbers of what was posted and the week's top for the owner (Monday from 9:00): „TOP CONȚINUT
// SĂPTĂMÂNA ASTA 🔥”, the 3 best by views + saves×5 + shares×5, to put as ads.
// Meta renames and drops insight metrics often: a metric it refuses is left out and the rest are asked again (and not
// asked again for a week, data/content/state.json `refused`); what can't be read stays as it was (never a zero over a
// real number).
// The insights (the owner, 12.11: „insights-urile să fie insane”):
//  - per post, per network: views, reach, likes, comments, shares, saves, interactions, the average watch time
//    (`watch`, s), the total watch time (`viewTime`, s), the followers it brought (`follows`), the profile visits
//    (`profileVisits`) and taps on the profile (`profileActivity`), YouTube's average % watched (`avgPct`), Facebook's
//    3-second views (`v3s`), the retention curve (`ret`: 21 points, the share of viewers at 0%, 5% … 100% of the
//    video; Facebook and YouTube), the video's length (`dur`, from the file); rates() makes the rates of it: hook,
//    hold, % watched, engagement, saves / shares / follows per 1000 views;
//  - snapshots (it.snaps[net]: [{ g, h, v, i, f }]: the hours since posting, views, interactions, follows) near 1, 2,
//    3, 4, 6, 9, 12, 18, 24 hours, 3, 7 and 30 days: the hourly run reads the posts of the last day and the ones
//    reaching 3, 7 or 30 days, the daily run (from 6:00) everything of the last 31 days;
//  - „MERGE TARE 🔥”: a post whose views in its first 24 hours are at least 3 times what that network's posts had at
//    the same age (the median of their snapshots, at least 3 to compare with) is marked (it.hot) and the owners hear it
//    once, with „Fă reclamă din asta” in Admin → Conținut.
//  - the posts the owner made from the app (content-app.js, „Postare din aplicație”): each run first finds the post
//    of the ones that don't know it yet (the link's id, else the network's latest posts by time and first line of
//    text, never a guess), then reads them with the rest; one never found stays without numbers, marked as such.

const { readJSON, writeJSON } = require('./store');
const ads = require('./meta-ads');
const C = require('./content');
const P = require('./content-plan');
const POST = require('./content-post');

const DAYS = 31;
const IG_REEL = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time', 'ig_reels_video_view_total_time', 'follows', 'profile_visits'];
const IG_PHOTO = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'follows', 'profile_visits'];
const IG_STORY = ['views', 'reach', 'shares', 'total_interactions'];
const FB_REEL = ['blue_reels_play_count', 'post_impressions_unique', 'post_video_avg_time_watched', 'post_video_view_time', 'post_video_views', 'post_video_retention_graph',
  'post_video_followers', 'post_video_likes_by_reaction_type', 'post_video_social_actions'];
// kept for the tests and other readers
const IG_METRICS = IG_REEL;
const g = (path, token, params) => ads.call('GET', path, token, params).catch(() => ({ ok: false, j: {} }));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);
const sumObj = (v) => (v && typeof v === 'object' ? Object.values(v).reduce((a, x) => a + (num(x) || 0), 0) : num(v));
const valueOf = (m) => { const v = m && (m.total_value ? m.total_value.value : m.values && m.values.length ? m.values[m.values.length - 1].value : undefined); return v; };
const r1 = (x) => Math.round(x * 10) / 10;

// the metrics Meta refused, per kind of read, not asked again for a week (shared by the runs through the state)
let REFUSED = {};
const refusedOf = (key) => (key && REFUSED[key]) || [];
function refuse(key, list) { if (!key || !list.length) return; REFUSED[key] = [...new Set(refusedOf(key).concat(list))]; REFUSED._dirty = true; }

// insights with the metrics Meta accepts: a refused one (named in the error) goes and the rest are asked again;
// unnamed refusals: one by one
async function insights(path, token, metrics, extra, key) {
  let left = metrics.filter((m) => !refusedOf(key).includes(m));
  if (!left.length) return [];
  for (let i = 0; i < 4 && left.length; i++) {
    const r = await g(path, token, Object.assign({ metric: left.join(',') }, extra || {}));
    if (r.ok && r.j && Array.isArray(r.j.data)) return r.j.data;
    const msg = String(((r.j && r.j.error) || {}).message || '');
    const bad = left.filter((m) => new RegExp('\\b' + m + '\\b').test(msg));
    const allowed = /must be one of the following values:\s*([\w, ]+)/i.exec(msg);
    if (allowed) { const ok = allowed[1].split(/[,\s]+/).filter(Boolean); const keep = left.filter((m) => ok.includes(m)); if (keep.length && keep.length < left.length) { refuse(key, left.filter((m) => !ok.includes(m))); left = keep; continue; } }
    if (bad.length && bad.length < left.length) { refuse(key, bad); left = left.filter((m) => !bad.includes(m)); continue; }
    break;
  }
  const out = [];
  for (const m of left) {
    const r = await g(path, token, Object.assign({ metric: m }, extra || {}));
    if (r.ok && r.j && Array.isArray(r.j.data)) out.push(...r.j.data);
    else if (r.j && r.j.error && Number(r.j.error.code) === 100) refuse(key, [m]);
  }
  return out;
}

// a retention curve (Facebook's post_video_retention_graph { "0": 1, "1": 0.93 … }, YouTube's audienceWatchRatio
// rows [[0.01, 1.02] …]) as 21 points: the share of viewers at 0%, 5% … 100% of the video (null: too little)
function curve(v) {
  let pts = [];
  if (Array.isArray(v)) pts = v.filter((x) => Array.isArray(x) && num(x[0]) != null && num(x[1]) != null).map((x) => [num(x[0]), num(x[1])]);
  else if (v && typeof v === 'object') {
    const keys = Object.keys(v).filter((k) => /^\d+(\.\d+)?$/.test(k) && num(v[k]) != null).map(Number).sort((a, b) => a - b);
    const max = keys.length ? keys[keys.length - 1] : 0;
    if (max > 0) pts = keys.map((k) => [k / max, num(v[String(k)]) != null ? num(v[String(k)]) : num(v[k])]);
  }
  if (pts.length < 3) return null;
  pts.sort((a, b) => a[0] - b[0]);
  if (pts[pts.length - 1][0] > 1.5) { const m = pts[pts.length - 1][0]; pts = pts.map(([x, y]) => [x / m, y]); }
  // percentages (93) or shares (0.93)
  if (pts.some(([, y]) => y > 3)) pts = pts.map(([x, y]) => [x, y / 100]);
  if (pts[0][0] > 0) pts.unshift([0, pts[0][1]]);
  const at = (x) => {
    for (let i = 1; i < pts.length; i++) if (pts[i][0] >= x) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
    return pts[pts.length - 1][1];
  };
  return Array.from({ length: 21 }, (_, i) => Math.round(Math.max(0, at(i / 20)) * 1000) / 1000);
}
// the value of a curve at a share of the video (0..1)
function curveAt(ret, x) {
  if (!Array.isArray(ret) || ret.length < 2) return null;
  const p = Math.max(0, Math.min(1, x)) * (ret.length - 1), i = Math.floor(p), f = p - i;
  return i >= ret.length - 1 ? ret[ret.length - 1] : ret[i] + (ret[i + 1] - ret[i]) * f;
}

function igStats(data, activity) {
  const by = {}; (data || []).forEach((m) => { by[m.name] = valueOf(m); });
  const s = {};
  const put = (k, v) => { const n = num(v); if (n != null) s[k] = n; };
  put('views', by.views != null ? by.views : by.plays != null ? by.plays : by.impressions);
  put('reach', by.reach); put('likes', by.likes); put('comments', by.comments); put('shares', by.shares); put('saves', by.saved);
  put('interactions', by.total_interactions); put('follows', by.follows); put('profileVisits', by.profile_visits);
  if (num(by.ig_reels_avg_watch_time) != null) s.watch = Math.round(num(by.ig_reels_avg_watch_time) / 100) / 10; // ms → s
  if (num(by.ig_reels_video_view_total_time) != null) s.viewTime = Math.round(num(by.ig_reels_video_view_total_time) / 1000); // ms → s
  const pa = activityOf(activity);
  if (pa != null) s.profileActivity = pa;
  return s;
}
// profile_activity (breakdown action_type): its total, or the sum of its taps (bio link, call, direction, email, text)
function activityOf(data) {
  const m = (data || []).find((x) => x && x.name === 'profile_activity');
  if (!m) return null;
  const tv = m.total_value || {};
  if (num(tv.value) != null) return num(tv.value);
  const br = Array.isArray(tv.breakdowns) && tv.breakdowns[0] && Array.isArray(tv.breakdowns[0].results) ? tv.breakdowns[0].results : null;
  if (br) return br.reduce((a, r) => a + (num(r.value) || 0), 0);
  return sumObj(valueOf(m));
}
function fbReelStats(data) {
  const by = {}; (data || []).forEach((m) => { by[m.name] = valueOf(m); });
  const s = {};
  const put = (k, v) => { const n = num(v); if (n != null) s[k] = n; };
  put('views', by.blue_reels_play_count); put('reach', by.post_impressions_unique);
  if (num(by.post_video_avg_time_watched) != null) s.watch = Math.round(num(by.post_video_avg_time_watched) / 100) / 10;
  if (num(by.post_video_view_time) != null) s.viewTime = Math.round(num(by.post_video_view_time) / 1000);
  put('v3s', by.post_video_views);
  const fol = sumObj(by.post_video_followers); if (fol != null) s.follows = fol;
  const ret = curve(by.post_video_retention_graph); if (ret) s.ret = ret;
  const likes = sumObj(by.post_video_likes_by_reaction_type); if (likes != null) s.likes = likes;
  const soc = by.post_video_social_actions;
  if (soc && typeof soc === 'object') { put('comments', soc.COMMENT != null ? soc.COMMENT : soc.comment); put('shares', soc.SHARE != null ? soc.SHARE : soc.share); }
  return s;
}
async function fbPostStats(id, token) {
  const s = {};
  const r = await g('/' + id, token, { fields: 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares' });
  if (r.ok && r.j) {
    const rc = r.j.reactions && r.j.reactions.summary && num(r.j.reactions.summary.total_count); if (rc != null) s.likes = rc;
    const cc = r.j.comments && r.j.comments.summary && num(r.j.comments.summary.total_count); if (cc != null) s.comments = cc;
    const sc = r.j.shares && num(r.j.shares.count); s.shares = sc != null ? sc : 0;
  }
  const ins = await insights('/' + id + '/insights', token, ['post_impressions_unique', 'post_impressions'], null, 'fb_post');
  ins.forEach((m) => { const v = num(valueOf(m)); if (v == null) return; if (m.name === 'post_impressions_unique') s.reach = v; if (m.name === 'post_impressions') s.views = v; });
  return s;
}
const durOf = (it) => { const v = C.media(it).video; return v && v.dur ? Number(v.dur) : 0; };
async function one(a, it, e) {
  let s = {};
  // YouTube and TikTok: their own libraries, through the poster (content-post.js statsOf)
  if (e.net === 'yt' || e.net === 'tt') s = typeof POST.statsOf === 'function' ? (await POST.statsOf(a, it, e)) || {} : {};
  else if (e.net === 'ig') {
    const path = '/' + e.postId + '/insights';
    if (it.kind === 'story') s = igStats(await insights(path, a.token, IG_STORY, null, 'ig_story'));
    else {
      const key = it.kind === 'reel' ? 'ig_reel' : 'ig_photo';
      const data = await insights(path, a.token, it.kind === 'reel' ? IG_REEL : IG_PHOTO, null, key);
      // the taps on the profile come only with their breakdown
      const act = refusedOf('ig_act').includes('profile_activity') ? [] : await insights(path, a.token, ['profile_activity'], { breakdown: 'action_type', metric_type: 'total_value' }, 'ig_act');
      s = igStats(data, act);
    }
  } else if (e.net === 'fb') s = it.kind === 'reel' ? fbReelStats(await insights('/' + e.postId + '/video_insights', a.token, FB_REEL, null, 'fb_reel')) : await fbPostStats(e.postId, a.token);
  if (Object.keys(s).length && it.kind === 'reel') { const d = durOf(it) || num(s.dur); if (d) s.dur = d; }
  return s;
}

// ---------------------------------------------------------------- the rates
// From a post's numbers on a network: hook (the share still watching at 3 s: Facebook's 3-second views over plays, else
// the retention curve), hold (the share at half the video), % watched (YouTube's, else the average watch time over the
// length), engagement (likes, comments, shares and saves over views, %), saves / shares / follows per 1000 views.
// null where it can't be known.
function rates(s, dur) {
  if (!s) return {};
  const views = num(s.views) || num(s.reach) || 0, d = num(s.dur) || num(dur) || 0;
  const out = { hook: null, hold: null, avgPct: null, er: null, saveK: null, shareK: null, followK: null };
  const v3 = num(s.v3s);
  if (v3 != null && views > 0 && v3 <= views * 1.05) out.hook = r1(Math.min(100, (v3 / views) * 100));
  else if (Array.isArray(s.ret) && d > 0) { const h = curveAt(s.ret, 3 / d); if (h != null) out.hook = r1(Math.min(100, h * 100)); }
  if (Array.isArray(s.ret)) { const h = curveAt(s.ret, 0.5); if (h != null) out.hold = r1(Math.min(100, h * 100)); }
  if (num(s.avgPct) != null) out.avgPct = r1(num(s.avgPct));
  else if (num(s.watch) != null && d > 0) out.avgPct = r1(Math.min(999, (num(s.watch) / d) * 100));
  if (views > 0) {
    const inter = num(s.interactions) != null ? num(s.interactions) : (s.likes || 0) + (s.comments || 0) + (s.shares || 0) + (s.saves || 0);
    out.er = r1((inter / views) * 100);
    if (num(s.saves) != null) out.saveK = r1((s.saves / views) * 1000);
    if (num(s.shares) != null) out.shareK = r1((s.shares / views) * 1000);
    if (num(s.follows) != null) out.followK = r1((s.follows / views) * 1000);
  }
  return out;
}

// ---------------------------------------------------------------- the snapshots
const GRID = [1, 2, 3, 4, 6, 9, 12, 18, 24, 72, 168, 720];
const NEAR = Math.log(1.5);
const MARKS = [72, 168, 720];
const postedMs = (e) => Date.parse(e.postedAt || e.at);
const inter = (s) => (s.likes || 0) + (s.comments || 0) + (s.shares || 0) + (s.saves || 0);
// the points with a new one at `h` hours (near a grid age not taken yet), or null when nothing new is to be kept
function snapAdd(points, h, s) {
  const pts = Array.isArray(points) ? points.slice() : [];
  const v = num(s && s.views) != null ? num(s.views) : num(s && s.reach);
  if (!(h > 0) || v == null) return null;
  const have = new Set(pts.map((p) => p.g));
  let best = null;
  GRID.forEach((x) => { const d = Math.abs(Math.log(h / x)); if (d <= NEAR && !have.has(x) && (!best || d < best.d)) best = { g: x, d }; });
  if (!best) return null;
  const p = { g: best.g, h: r1(h), v, i: inter(s) };
  if (num(s.follows) != null) p.f = num(s.follows);
  pts.push(p);
  pts.sort((a, b) => a.h - b.h);
  return pts.slice(-GRID.length);
}
// a post's views at `h` hours from its snapshots (straight between the two around it), null when none is near
function viewsAt(points, h) {
  const pts = (points || []).filter((p) => p && p.h > 0 && num(p.v) != null).sort((a, b) => a.h - b.h);
  if (!pts.some((p) => Math.abs(Math.log(p.h / h)) <= Math.log(2))) return null;
  const all = [{ h: 0, v: 0 }].concat(pts);
  for (let i = 1; i < all.length; i++) if (all[i].h >= h) { const a = all[i - 1], b = all[i]; return a.v + ((b.v - a.v) * (h - a.h)) / ((b.h - a.h) || 1); }
  return all[all.length - 1].v;
}
function median(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
const HOT_X = 3, HOT_MIN = 100, HOT_PEERS = 3;
// the posts of their first 24 hours whose views are ≥ 3× the network's median at the same age (not marked yet):
// [{ it, net, h, views, med, x }]
function hotCheck(list, now) {
  const out = [];
  (list || []).forEach((it) => {
    if (!it || it.removed || it.hot) return;
    let best = null;
    (it.plan || []).forEach((e) => {
      if (e.state !== 'posted') return;
      const s = (it.stats || {})[e.net];
      if (!s || num(s.views) == null) return;
      const h = ((Date.parse(s.at) || now) - postedMs(e)) / 3.6e6;
      if (!(h >= 0.75 && h <= 24) || s.views < HOT_MIN) return;
      const peers = [];
      (list || []).forEach((o) => {
        if (!o || o.id === it.id || o.removed) return;
        const pts = (o.snaps || {})[e.net];
        if (!pts || !pts.length || !(o.plan || []).some((x) => x.net === e.net && x.state === 'posted')) return;
        const v = viewsAt(pts, h);
        if (v != null) peers.push(v);
      });
      if (peers.length < HOT_PEERS) return;
      const med = Math.max(1, median(peers)), x = s.views / med;
      if (x >= HOT_X && (!best || x > best.x)) best = { it, net: e.net, h: r1(h), views: s.views, med: Math.round(med), x: r1(x) };
    });
    if (best) out.push(best);
  });
  return out;
}

const score = (s) => (s ? (s.views || 0) + (s.saves || 0) * 5 + (s.shares || 0) * 5 : 0);
// the week's top: per item, its networks' numbers added up, the link of its best network
function top(list, sinceMs, n) {
  return (list || []).map((it) => {
    const posted = (it.plan || []).filter((e) => e.state === 'posted' && Date.parse(e.postedAt || e.at) >= sinceMs);
    if (!posted.length) return null;
    const total = { views: 0, saves: 0, shares: 0 };
    let best = null;
    posted.forEach((e) => { const s = (it.stats || {})[e.net]; if (!s) return; total.views += s.views || 0; total.saves += s.saves || 0; total.shares += s.shares || 0; if (!best || score(s) > score((it.stats || {})[best.net])) best = e; });
    return { id: it.id, kind: it.kind, rubric: it.rubric, topic: it.topic, score: score(total), views: total.views, saves: total.saves, shares: total.shares, net: best ? best.net : posted[0].net, url: (best || posted[0]).url || '' };
  }).filter((x) => x && x.score > 0).sort((a, b) => b.score - a.score).slice(0, n || 3);
}
const isoWeek = (day) => { const d = new Date(day + 'T12:00:00Z'); const t = new Date(d); t.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); const y = t.getUTCFullYear(); return y + '-W' + String(Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7)).padStart(2, '0'); };
const roHour = (ms) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hour12: false }).format(new Date(ms)));
const roDow = (ms) => new Date(P.roDay(ms) + 'T12:00:00Z').getUTCDay();

// The clock, every hour: the posts of their first day (once an hour) and the ones reaching 3, 7 or 30 days, with
// their snapshots and the „MERGE TARE 🔥” check; once a day (from 6:00) every post of the last 31 days; Monday the
// top. opts.force: the daily read now, whatever the hour (the health page); opts.now (tests).
async function run(opts) {
  opts = opts || {};
  const now = opts.now || Date.now(), today = P.roDay(now), t0 = Date.now(), budget = opts.budgetMs || 20e3;
  const s = await C.readState();
  // the metrics Meta refused: not asked again for a week
  REFUSED = s.refused && s.refused.m && now - (Date.parse(s.refused.at) || 0) < 7 * 864e5 ? Object.assign({}, s.refused.m) : {};
  const out = {};
  let save = false;
  // the posts made from the app: which post each one is (a link, or the time and the text), before the numbers
  const found = await require('./content-app').match({ now, budgetMs: Math.min(6e3, budget / 2) }).catch((e) => ({ error: e.message }));
  if (found && (found.pending || found.error)) out.match = found;
  const daily = (s.statsDay !== today && roHour(now) >= 6) || !!opts.force;
  const posted = [];
  (await C.items()).forEach((it) => (it.plan || []).forEach((e) => { if (e.state === 'posted' && e.postId && !it.removed) posted.push({ it, e }); }));
  const age = (e) => (now - postedMs(e)) / 3.6e6;
  const lastRead = (it, e) => Date.parse(((it.stats || {})[e.net] || {}).at) || 0;
  const rested = (it, e) => now - lastRead(it, e) >= 45 * 60e3;
  const young = ({ it, e }) => { const h = age(e); return h >= 0.5 && h < 25 && rested(it, e); };
  const due = ({ it, e }) => { const h = age(e), pts = (it.snaps || {})[e.net] || []; return MARKS.some((m) => h >= m && h <= m * 1.2 && !pts.some((p) => p.g === m)) && rested(it, e); };
  const recent = ({ it, e }) => { const h = age(e); return h < DAYS * 24 && !(it.kind === 'story' && h > 24); };
  const want = daily ? posted.filter(recent) : posted.filter((x) => recent(x) && (young(x) || due(x)));
  if (want.length || daily) {
    const a = await POST.access(true);
    // Facebook's connection reads Instagram and Facebook; YouTube and TikTok have their own
    const can = (net) => (net === 'yt' || net === 'tt' ? !!(a[net] && a[net].connected) : !!a.connected);
    if (!a.connected && !can('yt') && !can('tt')) { if (daily) out.stats = { error: 'not_connected' }; }
    else {
      const todo = want.filter(({ e }) => can(e.net));
      const got = [];
      let left = 0;
      for (const { it, e } of todo) {
        if (Date.now() - t0 > budget) { left++; continue; }
        const st = await one(a, it, e).catch(() => ({}));
        if (Object.keys(st).length) got.push({ id: it.id, net: e.net, st });
      }
      if (got.length) {
        const at = new Date(now).toISOString();
        await C.update((items) => {
          got.forEach((x) => {
            const it = C.findItem(items, x.id); if (!it) return;
            it.stats = it.stats || {};
            it.stats[x.net] = Object.assign({}, it.stats[x.net] || {}, x.st, { at });
            // a snapshot near 1, 2 … 24 hours, 3, 7, 30 days
            const e = (it.plan || []).find((y) => y.net === x.net && y.state === 'posted');
            const pts = e && snapAdd((it.snaps || {})[x.net], (now - postedMs(e)) / 3.6e6, it.stats[x.net]);
            if (pts) { it.snaps = Object.assign({}, it.snaps || {}); it.snaps[x.net] = pts; }
          });
        });
      }
      out[daily ? 'stats' : 'hourly'] = { read: got.length, of: todo.length, left };
      if (daily && !left) { s.statsDay = today; save = true; }
      if (got.length) out.hot = await hotAlerts(now);
      if (!out.hot || !out.hot.length) delete out.hot;
    }
  }
  // Monday from 9:00, once a week: the top 3 of the last 7 days
  const week = isoWeek(today);
  if ((roDow(now) === 1 && roHour(now) >= 9 && s.topWeek !== week) || opts.forceTop) {
    const best = top(await C.items(), now - 7 * 864e5, 3);
    if (best.length) {
      const N = require('./notify'), store = { readJSON, writeJSON };
      // the bell keeps 160 characters: the names and views here, the links in Admin → Conținut (Top săptămâna)
      const name = (x) => { const t = String(x.topic || x.rubric || x.kind); return t.length > 34 ? t.slice(0, 33).replace(/\s+\S*$/, '') + '…' : t; };
      const text = 'De pus ca reclamă: ' + best.map((x, i) => (i + 1) + '. ' + name(x) + ' (' + kNum(x.views) + ')').join(' · ');
      await N.notifyMany(store, await N.ownerIds(store), { kind: 'report', tone: 'good', go: 'continut', tag: 'ct-top-' + week, title: 'TOP CONȚINUT SĂPTĂMÂNA ASTA 🔥', text });
    }
    s.topWeek = week; save = true;
    out.top = best.map((x) => ({ id: x.id, score: x.score, url: x.url }));
  }
  if (REFUSED._dirty) { delete REFUSED._dirty; s.refused = { at: s.refused && s.refused.m && Object.keys(s.refused.m).length ? s.refused.at : new Date(now).toISOString(), m: REFUSED }; save = true; }
  if (save) await C.writeState(s);
  return Object.keys(out).length ? out : { skipped: true };
}
const kNum = (n) => (n >= 1000 ? (Math.round(n / 100) / 10).toLocaleString('ro-RO') + 'k' : String(n));
// „MERGE TARE 🔥”: the posts found by hotCheck() are marked once and the owners hear each once
async function hotAlerts(now) {
  const found = hotCheck(await C.items(), now);
  if (!found.length) return [];
  const marked = [];
  await C.update((items) => {
    marked.length = 0;
    found.forEach((x) => { const it = C.findItem(items, x.it.id); if (!it || it.hot) return; it.hot = { net: x.net, at: new Date(now).toISOString(), h: x.h, views: x.views, med: x.med, x: x.x }; marked.push(x); });
    return marked.length ? undefined : false;
  });
  const N = require('./notify'), store = { readJSON, writeJSON };
  for (const x of marked) {
    const t = String(x.it.topic || x.it.rubric || 'Material');
    const topic = t.length > 48 ? t.slice(0, 47).replace(/\s+\S*$/, '') + '…' : t;
    const hours = x.h < 1.5 ? 'prima oră' : C.plural(Math.round(x.h), 'oră', 'ore');
    const text = (C.NET_NAME[x.net] + ': ' + kNum(x.views) + ' vizualizări în ' + hours + ', de ' + x.x.toLocaleString('ro-RO') + ' ori peste obișnuit. Fă reclamă din asta, din Conținut.').slice(0, 160);
    try { await N.notifyMany(store, await N.ownerIds(store), { kind: 'alert', tone: 'good', go: 'continut', tag: 'ct-hot-' + x.it.id, title: 'MERGE TARE 🔥 ' + topic, text }); }
    catch (e) { console.error('content hot:', e.message); }
  }
  return marked.map((x) => ({ id: x.it.id, net: x.net, x: x.x }));
}

module.exports = { run, top, score, igStats, fbReelStats, fbPostStats, insights, isoWeek, curve, curveAt, rates, snapAdd, viewsAt, hotCheck, hotAlerts, durOf, GRID, MARKS,
  IG_METRICS, IG_REEL, IG_PHOTO, FB_REEL, median };
