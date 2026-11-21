// Story-urile (the owner, 21.11): „să avem tot timpul story-uri active”. On the minute clock (api/content-story-tick.js,
// cf/worker.js "* * * * *"):
//  1. what is due among the stories goes out (Instagram, Facebook, in 'auto' mode), oldest first; a sequence (the frame
//     that fills in, content-plan.js) in one go: each one right after the one before it, never before it; one that fails
//     or is still processing stops the ones after it on that network until it is out (the next minutes).
//  2. the guard, every 5 minutes: a network whose newest story is 18 hours old or more (a story lives 24) and has no
//     approved story planned before that one ends, gets one of the evergreen stories now (approved, the one shown
//     longest ago on that network first). Fewer than 4 evergreen stories approved: the admins hear it once a day.
// coverage() is what /api/content-intake?action=status shows: per network the newest story, its hours left live, the
// next one planned and the evergreen reserve.

const C = require('./content');
const P = require('./content-plan');
const POST = require('./content-post');

const DAY_MS = 24 * 3600e3;
const GUARD_AT_MS = 18 * 3600e3; // from this age of the newest story, the next one must come before it ends
const MARGIN_MS = 30 * 60e3;
const POOL_MIN = 4;
const PENDING_MS = 2 * 3600e3;
const isStory = (it) => it && it.kind === 'story' && !it.removed && !it.dropped;
const postedAt = (e) => Date.parse(e.postedAt || e.at) || 0;
const iso = (ms) => new Date(ms).toISOString();

// every posted story on a network (the reposts of the evergreen ones too): [{ it, at }]
function shown(list, net) {
  const out = [];
  // what went out stays out (an item taken out of its week after it posted still has a live story)
  list.filter((it) => it && it.kind === 'story' && !it.removed).forEach((it) => {
    (it.plan || []).concat(it.reposts || []).forEach((e) => { if (e.net === net && e.state === 'posted') out.push({ it, at: postedAt(e) }); });
  });
  return out.sort((a, b) => b.at - a.at);
}
// the evergreen reserve: approved, ready, and not a sale that has ended (a Card de Sărbători story after 24.12)
// an evergreen sequence (21.11: every story tells one story over a few taps) counts once, by its first; it goes only whole
const members = (list, it) => (P.seqOf(it) ? list.filter((x) => isStory(x) && P.seqOf(x) && P.seqOf(x).id === P.seqOf(it).id).sort((a, b) => P.seqOf(a).i - P.seqOf(b).i) : [it]);
const okItem = (it) => it.state === 'ready' && P.review(it) === 'approved';
const pool = (list) => list.filter((it) => isStory(it) && it.evergreen && !P.follower(it) && okItem(it) && !(it.promo && !C.promoOn(it))
  && members(list, it).every(okItem) && (!P.seqOf(it) || members(list, it).length >= (Number(P.seqOf(it).n) || 1)));
// the next approved story planned on a network from `now` (a sequence's first: its followers come with it)
function nextOf(list, net, now) {
  let best = 0;
  list.filter((it) => isStory(it) && it.state === 'ready' && P.review(it) === 'approved').forEach((it) => (it.plan || []).forEach((e) => {
    if (e.net !== net || e.follow || !(e.state === 'planned' || e.state === 'posting')) return;
    const t = Date.parse(e.at);
    if (t >= now - 5 * 60e3 && (!best || t < best)) best = t;
  }));
  return best;
}
const onNet = (st, net) => st.modes[net] === 'auto' && !!st.nets[net];

function coverage(list, st, now) {
  const out = {};
  P.STORY_NETS.forEach((net) => {
    const last = shown(list, net)[0];
    const lastAt = last ? last.at : 0, next = nextOf(list, net, now);
    const left = lastAt ? Math.max(0, lastAt + DAY_MS - now) : 0;
    out[net] = { on: onNet(st, net), guard: !!st.storyGuard, lastAt: lastAt ? iso(lastAt) : '', lastTopic: last ? last.it.topic || '' : '', live: left > 0, hoursLeft: Math.round((left / 3600e3) * 10) / 10,
      nextAt: next ? iso(next) : '', gap: !!lastAt && !!next && next > lastAt + DAY_MS ? Math.round(((next - lastAt - DAY_MS) / 3600e3) * 10) / 10 : 0, pool: pool(list).length };
  });
  return out;
}
// does this network need an evergreen story now?
function needs(list, net, now) {
  // one already on its way (an evergreen put in the last 2 hours, not out yet; anything being posted)
  const busy = list.filter(isStory).some((it) => (it.plan || []).some((e) => e.net === net && (e.state === 'posting' || (e.evergreen && e.state === 'planned' && now - Date.parse(e.at) < PENDING_MS))));
  if (busy) return false;
  const last = shown(list, net)[0];
  if (!last) return true;
  if (now - last.at < GUARD_AT_MS) return false;
  const next = nextOf(list, net, now);
  return !(next && next <= last.at + DAY_MS - MARGIN_MS);
}
// the evergreen story to show: never shown on this network first, then the one shown longest ago
function pick(list, net) {
  const seen = new Map();
  shown(list, net).forEach((x) => { if (!seen.has(x.it.id)) seen.set(x.it.id, x.at); });
  return pool(list).sort((a, b) => (seen.get(a.id) || 0) - (seen.get(b.id) || 0) || String(a.id).localeCompare(String(b.id)))[0] || null;
}
// the evergreen story planned for now on the network: an older entry there goes to its reposts
async function putNow(id, net, now) {
  const { out } = await C.update((list) => {
    const it = C.findItem(list, id);
    if (!it) return false;
    const all = members(list, it);
    if (all.some((m) => (m.plan || []).some((e) => e.net === net && e.state === 'posting'))) return false;
    // the whole sequence, its frames seconds apart, in order (content-plan.js due() keeps the order)
    all.forEach((m) => {
      const i = P.seqOf(m) ? Number(P.seqOf(m).i) || 0 : 0;
      const old = (m.plan || []).filter((e) => e.net === net);
      m.reposts = (m.reposts || []).concat(old.filter((e) => e.state === 'posted')).slice(-60);
      m.plan = (m.plan || []).filter((e) => e.net !== net).concat(Object.assign({ net, kind: 'story', at: iso(now + i * 1000), state: 'planned', evergreen: true }, i > 0 ? { follow: true } : {}));
    });
    return true;
  });
  return out === true;
}

async function tick(opts) {
  const o = opts || {};
  const t0 = Date.now(), budget = o.budgetMs || 30e3, now = o.now || Date.now();
  const st = await C.settings();
  if (!st.on || !P.STORY_NETS.some((n) => onNet(st, n))) return { off: true };
  let list = await C.items();
  const due = P.due(list, st, now).filter((x) => x.it.kind === 'story');
  // the guard only when it is switched on (settings.storyGuard, off by default since 21.11)
  const guard = st.storyGuard && (new Date(now).getUTCMinutes() % 5 === 0 || o.guard);
  if (!due.length && !guard) return { due: 0 };
  const out = { due: due.length, done: [] };
  let a = null;
  const stopped = new Set();
  const chain = (it, net) => (P.seqOf(it) ? P.seqOf(it).id + '|' + net : '');
  for (const { it, e } of due) {
    const key = chain(it, e.net);
    if (key && stopped.has(key)) continue;
    if (Date.now() - t0 > budget) { out.left = (out.left || 0) + 1; if (key) stopped.add(key); continue; }
    if (!a) a = await POST.access();
    const why = POST.blocked(a, e.net);
    if (why) { await POST.hold(it.id, e.net, why); out.done.push({ id: it.id, net: e.net, hold: why }); if (key) stopped.add(key); continue; }
    if (!(await POST.claim(it.id, e.net))) { if (key) stopped.add(key); continue; }
    const r = await POST.postOne(a, it.id, e.net, Math.min(25e3, Math.max(0, budget - (Date.now() - t0) - 3e3)));
    out.done.push(r);
    if (!r.posted && key) stopped.add(key);
  }
  if (guard) {
    list = await C.items();
    for (const net of P.STORY_NETS) {
      if (!onNet(st, net) || !needs(list, net, Date.now())) continue;
      if (!a) a = await POST.access();
      if (POST.blocked(a, net)) continue;
      const ev = pick(list, net);
      if (!ev) { (out.guard = out.guard || []).push({ net, empty: true }); continue; }
      if (!(await putNow(ev.id, net, Date.now()))) continue;
      if (!(await POST.claim(ev.id, net))) continue;
      const r = await POST.postOne(a, ev.id, net, 20e3);
      (out.guard = out.guard || []).push(Object.assign({ evergreen: ev.topic || ev.id }, r));
      // the rest of an evergreen sequence goes on the next minutes, in order (due() waits for the frame before)
      list = await C.items();
    }
    // the reserve running low: the admins hear it once a day
    const n = pool(list).length;
    if (n < POOL_MIN) {
      const s = await C.readState(), day = P.roDay(Date.now());
      if (s.storyPoolTold !== day) {
        s.storyPoolTold = day; await C.writeState(s);
        await POST.tell('ct-story-pool', 'STORY-URI DE REZERVĂ PUȚINE ⚠️', 'Mai sunt ' + n + ' story-uri evergreen aprobate (minim ' + POOL_MIN + '). Fără ele, o zi fără story-uri planificate rămâne fără story activ.');
      }
    }
  }
  return out;
}

module.exports = { tick, coverage, needs, pick, DAY_MS, GUARD_AT_MS, POOL_MIN };
