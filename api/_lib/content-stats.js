// Conținut: the numbers of what was posted (daily from the clock, from 6:00 Bucharest) and the week's top for the
// owner (Monday from 9:00): „TOP CONȚINUT SĂPTĂMÂNA ASTA 🔥”, the 3 best by views + saves×5 + shares×5, to put as ads.
// Meta renames and drops insight metrics often: a metric it refuses is left out and the rest are asked again; what
// can't be read stays as it was (never a zero over a real number).

const { readJSON, writeJSON } = require('./store');
const ads = require('./meta-ads');
const C = require('./content');
const P = require('./content-plan');
const POST = require('./content-post');

const DAYS = 30;
const IG_METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time'];
const IG_STORY = ['views', 'reach', 'shares', 'total_interactions'];
const FB_REEL = ['blue_reels_play_count', 'post_impressions_unique', 'post_video_avg_time_watched', 'post_video_likes_by_reaction_type', 'post_video_social_actions'];
const g = (path, token, params) => ads.call('GET', path, token, params).catch(() => ({ ok: false, j: {} }));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null);
const sumObj = (v) => (v && typeof v === 'object' ? Object.values(v).reduce((a, x) => a + (num(x) || 0), 0) : num(v));
const valueOf = (m) => { const v = m && (m.total_value ? m.total_value.value : m.values && m.values.length ? m.values[m.values.length - 1].value : undefined); return v; };

// insights with the metrics Meta accepts: a refused one (named in the error) goes and the rest are asked again;
// unnamed refusals: one by one
async function insights(path, token, metrics, extra) {
  let left = metrics.slice();
  for (let i = 0; i < 4 && left.length; i++) {
    const r = await g(path, token, Object.assign({ metric: left.join(',') }, extra || {}));
    if (r.ok && r.j && Array.isArray(r.j.data)) return r.j.data;
    const msg = String(((r.j && r.j.error) || {}).message || '');
    const bad = left.filter((m) => new RegExp('\\b' + m + '\\b').test(msg));
    const allowed = /must be one of the following values:\s*([\w, ]+)/i.exec(msg);
    if (allowed) { const ok = allowed[1].split(/[,\s]+/).filter(Boolean); const keep = left.filter((m) => ok.includes(m)); if (keep.length && keep.length < left.length) { left = keep; continue; } }
    if (bad.length && bad.length < left.length) { left = left.filter((m) => !bad.includes(m)); continue; }
    break;
  }
  const out = [];
  for (const m of left) {
    const r = await g(path, token, Object.assign({ metric: m }, extra || {}));
    if (r.ok && r.j && Array.isArray(r.j.data)) out.push(...r.j.data);
  }
  return out;
}

function igStats(data) {
  const by = {}; (data || []).forEach((m) => { by[m.name] = valueOf(m); });
  const s = {};
  const put = (k, v) => { const n = num(v); if (n != null) s[k] = n; };
  put('views', by.views != null ? by.views : by.plays != null ? by.plays : by.impressions);
  put('reach', by.reach); put('likes', by.likes); put('comments', by.comments); put('shares', by.shares); put('saves', by.saved);
  put('interactions', by.total_interactions);
  if (num(by.ig_reels_avg_watch_time) != null) s.watch = Math.round(num(by.ig_reels_avg_watch_time) / 100) / 10; // ms → s
  return s;
}
function fbReelStats(data) {
  const by = {}; (data || []).forEach((m) => { by[m.name] = valueOf(m); });
  const s = {};
  const put = (k, v) => { const n = num(v); if (n != null) s[k] = n; };
  put('views', by.blue_reels_play_count); put('reach', by.post_impressions_unique);
  if (num(by.post_video_avg_time_watched) != null) s.watch = Math.round(num(by.post_video_avg_time_watched) / 100) / 10;
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
  const ins = await insights('/' + id + '/insights', token, ['post_impressions_unique', 'post_impressions']);
  ins.forEach((m) => { const v = num(valueOf(m)); if (v == null) return; if (m.name === 'post_impressions_unique') s.reach = v; if (m.name === 'post_impressions') s.views = v; });
  return s;
}
async function one(a, it, e) {
  // YouTube and TikTok: their own libraries, through the poster (content-post.js statsOf)
  if (e.net === 'yt' || e.net === 'tt') return typeof POST.statsOf === 'function' ? (await POST.statsOf(a, it, e)) || {} : {};
  if (e.net === 'ig') return igStats(await insights('/' + e.postId + '/insights', a.token, it.kind === 'story' ? IG_STORY : it.kind === 'reel' ? IG_METRICS : IG_METRICS.filter((m) => m !== 'ig_reels_avg_watch_time')));
  if (e.net === 'fb') return it.kind === 'reel' ? fbReelStats(await insights('/' + e.postId + '/video_insights', a.token, FB_REEL)) : fbPostStats(e.postId, a.token);
  return {};
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

// The clock: once a day the numbers, Monday the top. opts.force: now, whatever the hour (the health page).
async function run(opts) {
  opts = opts || {};
  const now = Date.now(), today = P.roDay(now), t0 = now, budget = opts.budgetMs || 20e3;
  const s = await C.readState();
  const out = {};
  if ((s.statsDay !== today && roHour(now) >= 6) || opts.force) {
    const a = await POST.access(true);
    // Facebook's connection reads Instagram and Facebook; YouTube and TikTok have their own
    const can = (net) => (net === 'yt' || net === 'tt' ? !!(a[net] && a[net].connected) : !!a.connected);
    if (!a.connected && !can('yt') && !can('tt')) out.stats = { error: 'not_connected' };
    else {
      const list = await C.items();
      const todo = [];
      list.forEach((it) => (it.plan || []).forEach((e) => { if (e.state === 'posted' && e.postId && can(e.net) && now - Date.parse(e.postedAt || e.at) < DAYS * 864e5 && !(it.kind === 'story' && now - Date.parse(e.postedAt || e.at) > 864e5)) todo.push({ it, e }); }));
      const got = [];
      let left = 0;
      for (const { it, e } of todo) {
        if (Date.now() - t0 > budget) { left++; continue; }
        const st = await one(a, it, e).catch(() => ({}));
        if (Object.keys(st).length) got.push({ id: it.id, net: e.net, st });
      }
      if (got.length) {
        await C.update((items) => {
          got.forEach((x) => { const it = C.findItem(items, x.id); if (!it) return; it.stats = it.stats || {}; it.stats[x.net] = Object.assign({}, it.stats[x.net] || {}, x.st, { at: new Date().toISOString() }); });
        });
      }
      out.stats = { read: got.length, of: todo.length, left };
      if (!left) s.statsDay = today;
    }
  }
  // Monday from 9:00, once a week: the top 3 of the last 7 days
  const week = isoWeek(today);
  if ((roDow(now) === 1 && roHour(now) >= 9 && s.topWeek !== week) || opts.forceTop) {
    const best = top(await C.items(), now - 7 * 864e5, 3);
    if (best.length) {
      const N = require('./notify'), store = { readJSON, writeJSON };
      const k = (n) => (n >= 1000 ? (Math.round(n / 100) / 10).toLocaleString('ro-RO') + 'k' : String(n));
      // the bell keeps 160 characters: the names and views here, the links in Admin → Conținut (Top săptămâna)
      const name = (x) => { const t = String(x.topic || x.rubric || x.kind); return t.length > 34 ? t.slice(0, 33).replace(/\s+\S*$/, '') + '…' : t; };
      const text = 'De pus ca reclamă: ' + best.map((x, i) => (i + 1) + '. ' + name(x) + ' (' + k(x.views) + ')').join(' · ');
      await N.notifyMany(store, await N.ownerIds(store), { kind: 'report', tone: 'good', go: 'continut', tag: 'ct-top-' + week, title: 'TOP CONȚINUT SĂPTĂMÂNA ASTA 🔥', text });
    }
    s.topWeek = week;
    out.top = best.map((x) => ({ id: x.id, score: x.score, url: x.url }));
  }
  if (out.stats || out.top) await C.writeState(s);
  return Object.keys(out).length ? out : { skipped: true };
}

module.exports = { run, top, score, igStats, fbReelStats, insights, isoWeek };
