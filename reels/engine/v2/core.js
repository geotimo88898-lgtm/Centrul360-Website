// Centrul360 reels v2: the core. A reel is scripts/<id>/script.json ("v": 2: hook, beats, payoff, end) plus
// scripts/<id>/timing.json (each spoken line's length, from voice.py). 1080×1920, every frame a pure function of the
// time: window.seek(t) draws the frame at t; render.cjs steps through it; window.film feeds mix.py (sound events) and
// check.cjs (visual events, the hook, the payoff, the binding of every line to a visual).
//
// Story: hook (0-3 s, a visual event + a question that opens a loop) → beats (a mini reveal every 3-5 s) → payoff
// (the answer, a riser before, an impact on the reveal) → end (loop | comment | site | ask).
// Every spoken line declares the visual it is illustrated by: a new shot ("visual") or a change of the current
// shot ("step"). Shots are joined by transitions; inside a shot the camera moves. Visual templates live in
// visuals.js (R2.V), the end types in ends.js (R2.END), the theme in themes.json.
(function () {
  'use strict';
  const R = window.R2 = window.R2 || {};
  const W = 1080, H = 1920, FPS = 30;
  R.W = W; R.H = H; R.FPS = FPS;
  R.SAFE = { l: 60, r: 920, t: 220, b: 1540 };
  R.STAGE = { x: 60, y: 250, w: 860, h: 900 };   // where visuals put their text
  R.CAPY = { band: 1210, mid: 1000 };              // the captions' top, by placement
  const HOOK_LEAD = 0.12, GAP = 0.14, PAYOFF_PAUSE = 0.5, TR_DUR = 0.42;
  const qs = new URLSearchParams(location.search);
  const ID = qs.get('reel');
  R.ROOT = '../../..'; // website root (reels/engine/v2 → /)
  if (qs.get('debug')) document.documentElement.classList.add('debug');

  // ------------------------------------------------------------------ helpers
  const clamp = R.clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = R.lerp = (a, b, p) => a + (b - a) * p;
  const E = R.E = {
    lin: (p) => p,
    out: (p) => 1 - Math.pow(1 - p, 3),
    out5: (p) => 1 - Math.pow(1 - p, 5),
    expo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    in: (p) => p * p * p,
    inout: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    sine: (p) => 0.5 - 0.5 * Math.cos(Math.PI * p),
    back: (p) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
    elastic: (p) => (p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -9 * p) * Math.sin((p * 10 - 0.75) * (2 * Math.PI) / 3.2) + 1),
    bounce: (p) => { const n = 7.5625, d = 2.75; if (p < 1 / d) return n * p * p; if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75; if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375; return n * (p -= 2.625 / d) * p + 0.984375; },
  };
  const esc = R.esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  R.rich = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const plain = R.plain = (s) => String(s || '').replace(/\*/g, '');
  const h = R.h = (tag, cls, html, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
  R.rnd = (i, k = 1) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
  R.place = (el, x, y, w, hh) => { el.style.left = x + 'px'; el.style.top = y + 'px'; if (w != null) el.style.width = w + 'px'; if (hh != null) el.style.height = hh + 'px'; return el; };
  // largest font size (px) that keeps el inside w×h (and no word wider than w)
  R.fit = (el, w, hh, max, min = 28) => {
    let f = max; el.style.fontSize = f + 'px';
    const inl = getComputedStyle(el).display.startsWith('inline');
    const over = () => (inl && el.offsetWidth > w) || el.scrollWidth > Math.max(el.clientWidth, w) + 1 || el.offsetHeight > hh || [...el.querySelectorAll('.w')].some((x) => x.offsetWidth > w);
    while (f > min && over()) { f -= 2; el.style.fontSize = f + 'px'; }
    return f;
  };

  // ------------------------------------------------------------------ icons (lucide-static)
  const ICONS = {};
  R.icon = (n) => ICONS[n] || ICONS.sparkles || '';
  async function loadIcons(names) {
    await Promise.all([...names].map(async (n) => { try { const r = await fetch('../node_modules/lucide-static/icons/' + n + '.svg'); if (r.ok) ICONS[n] = (await r.text()).replace(/<!--[\s\S]*?-->/g, ''); } catch (e) { /* missing */ } }));
  }
  const BUILTIN = ['check', 'x', 'sparkles', 'message-circle', 'send', 'user-round', 'circle-help', 'heart', 'lock', 'search', 'globe', 'arrow-right', 'arrow-up', 'arrow-down', 'equal', 'map-pin', 'camera', 'zap', 'battery', 'smartphone', 'weight', 'dna'];

  // ------------------------------------------------------------------ state
  let S, TH, TIM = {}, total = 0, IMGS = {};
  const lines = [], shots = [], anims = [], cues = [], events = [];
  R.lines = lines; R.shots = shots;
  const states = new Map();
  const st = (el) => { let s = states.get(el); if (!s) { s = {}; states.set(el, s); } return s; };
  function resetState(s) { s.o = 1; s.x = 0; s.y = 0; s.s = 1; s.sx = 1; s.sy = 1; s.r = 0; s.rx = 0; s.ry = 0; s.blur = 0; s.clip = null; s.hl = null; s.dash = null; }

  // ------------------------------------------------------------------ the script → lines
  function asList(x) { return x == null ? [] : Array.isArray(x) ? x : [x]; }
  R.sayText = (b) => plain(b.tts || b.say).trim(); // what the voice reads (the key of timing.json)
  function estimate(text) { return Math.max(0.9, text.length / 16.5); } // seconds, until the voice exists
  function buildLines() {
    const parts = [['hook', S.hook], ['beat', S.beats], ['payoff', S.payoff], ['resolve', S.resolve], ['outro', S.outro]];
    parts.forEach(([role, arr]) => asList(arr).forEach((b, i) => lines.push({ b, role, ri: i })));
    const endType = (S.end && S.end.type) || 'ask';
    if (S.end && S.end.say) lines.push({ b: S.end, role: 'end', ri: 0, endLine: true });
    lines.forEach((L, i) => { L.i = i; L.key = 'L' + i; L.text = R.sayText(L.b); L.cap = plain(L.b.cap || L.b.say); L.capRich = L.b.cap || L.b.say; });
    R.endType = endType;
  }
  // word times inside a line: its share by letters, a breath after punctuation (the captions and kinetic type use it)
  function wordTimes(L) {
    const ws = L.cap.split(/\s+/).filter(Boolean);
    const rich = String(L.capRich).split(/\s+/).filter(Boolean);
    const wt = ws.map((w) => w.replace(/[«»"„”]/g, '').length + 1.6 + (/[,.:?!]$/.test(w) ? 3 : 0));
    const sum = wt.reduce((a, b) => a + b, 0);
    let acc = L.t0 + 0.02;
    return ws.map((w, k) => { const t = acc; acc += (wt[k] / sum) * (L.dur - 0.05); return { w, t, e: /\*/.test(rich[k] || '') }; });
  }
  function timeline() {
    let t = HOOK_LEAD;
    let firstPayoff = true;
    lines.forEach((L) => {
      if (L.role === 'payoff' && firstPayoff) { t += PAYOFF_PAUSE; firstPayoff = false; }
      if (L.role === 'resolve' && L.ri === 0) t += 0.25;
      if (L.role === 'outro') t += 0.2;
      if (L.role === 'end') t += (R.END[R.endType].lead || 0.3);
      t += L.b.pre || 0;
      const tm = TIM[L.key];
      L.voiced = !!(tm && tm.text === L.text);
      L.dur = L.voiced ? tm.dur : estimate(L.text);
      L.t0 = t; L.t1 = t + L.dur;
      L.words = wordTimes(L);
      t = L.t1 + GAP + (L.b.pause || 0);
    });
    const lastSpoken = lines.length ? lines[lines.length - 1].t1 : 0;
    const endSpec = R.END[R.endType];
    total = Math.max(lastSpoken + 0.4, endSpec.total(lines, lastSpoken, S.end || {}));
    total = Math.round(total * FPS) / FPS;
    R.total = total;
  }

  // ------------------------------------------------------------------ animation registry
  // fx: (state, p, a) → mutates the element's state. Each entrance registers a sound event and a visual event.
  const FX = R.FX = {
    fade: (s, p) => { s.o *= E.out(p); },
    in: (s, p, a) => { const e = E.expo(p); s.o *= clamp(p * 2.4); s.y += (1 - e) * (a.amt || 70); s.blur += (1 - e) * 10; },
    pop: (s, p) => { s.o *= clamp(p * 3); s.s *= 0.35 + 0.65 * E.back(p); },
    slam: (s, p) => { const e = E.out5(p); s.o *= clamp(p * 4); s.s *= 1 + (1 - e) * 0.9; s.blur += (1 - e) * 8; },
    drop: (s, p, a) => { s.o *= clamp(p * 5); s.y -= (1 - E.bounce(p)) * (a.amt || 260); },
    slideL: (s, p, a) => { const e = E.expo(p); s.o *= clamp(p * 2.5); s.x -= (1 - e) * (a.amt || 220); s.blur += (1 - e) * 8; },
    slideR: (s, p, a) => { const e = E.expo(p); s.o *= clamp(p * 2.5); s.x += (1 - e) * (a.amt || 220); s.blur += (1 - e) * 8; },
    slideU: (s, p, a) => { const e = E.expo(p); s.o *= clamp(p * 2.5); s.y += (1 - e) * (a.amt || 160); s.blur += (1 - e) * 6; },
    slideD: (s, p, a) => { const e = E.expo(p); s.o *= clamp(p * 2.5); s.y -= (1 - e) * (a.amt || 160); s.blur += (1 - e) * 6; },
    mask: (s, p) => { const e = E.expo(p); s.clip = 'inset(' + ((1 - e) * 100).toFixed(2) + '% -20% -20% -20%)'; s.y += (1 - e) * 40; },
    wipe: (s, p) => { const e = E.inout(p); s.clip = 'inset(-20% ' + ((1 - e) * 100).toFixed(2) + '% -20% -2%)'; },
    growX: (s, p) => { s.sx *= E.expo(p); },
    growY: (s, p) => { s.sy *= E.expo(p); },
    draw: (s, p) => { s.dash = 1 - E.inout(p); },
    flip: (s, p) => { const e = E.out5(p); s.o *= clamp(p * 3); s.rx += (1 - e) * -95; },
    spin: (s, p) => { const e = E.back(p); s.o *= clamp(p * 3); s.r += (1 - E.out5(p)) * -160; s.s *= 0.3 + 0.7 * e; },
    blurIn: (s, p) => { const e = E.out(p); s.o *= e; s.blur += (1 - e) * 26; s.s *= 1.08 - 0.08 * e; },
    out: (s, p) => { const e = E.out(p); s.o *= 1 - e; s.s *= 1 - 0.1 * e; },
    outUp: (s, p) => { const e = E.in(p); s.o *= 1 - e; s.y -= e * 80; s.blur += e * 8; },
    bump: (s, p, a) => { s.s *= 1 + (a.amt || 0.1) * Math.sin(Math.PI * p); },
    shake: (s, p) => { s.x += Math.sin(p * 46) * 16 * (1 - p); },
    dim: (s, p, a) => { s.o *= 1 - (1 - (a.to != null ? a.to : 0.3)) * E.out(p); },
    hl: (s, p) => { s.hl = E.expo(p); },
    undim: (s, p, a) => { const f = a.from != null ? a.from : 0.35; s.o *= f + (1 - f) * E.out(p); }, // dim until its moment, then lit
    move: (s, p, a) => { const e = (a.ease ? E[a.ease] : E.inout)(p); s.x += (a.dx || 0) * e; s.y += (a.dy || 0) * e; s.s *= 1 + ((a.ds || 0) * e); s.r += (a.dr || 0) * e; },
  };
  const DUR = { undim: 0.3, fade: 0.35, in: 0.55, pop: 0.45, slam: 0.36, drop: 0.7, slideL: 0.55, slideR: 0.55, slideU: 0.5, slideD: 0.5, mask: 0.6, wipe: 0.55, growX: 0.55, growY: 0.55, draw: 0.8, flip: 0.55, spin: 0.6, blurIn: 0.6, out: 0.3, outUp: 0.35, bump: 0.32, shake: 0.4, dim: 0.35, hl: 0.45, move: 0.8 };
  // the sound each kind of movement makes (a category; mix.py picks the variant, the pitch and the level)
  const SFX = { in: ['swoosh_up', 0.35], pop: ['pop', 0.6], slam: ['impact', 0.45], drop: ['snap', 0.6], slideL: ['swoosh', 0.45], slideR: ['swoosh', 0.45], slideU: ['swoosh_up', 0.45], slideD: ['swoosh_down', 0.45],
    mask: ['swoosh_up', 0.4], wipe: ['paper', 0.5], growX: ['swoosh', 0.3], growY: ['swoosh_up', 0.3], flip: ['paper', 0.45], spin: ['whoosh_s', 0.45], blurIn: ['shimmer', 0.3], hl: ['paper', 0.3], shake: [null], draw: [null] };
  const PRIO = { impact: 3, boom: 3, subdrop: 3, riser: 3, riser_s: 3, whoosh_r: 2.6, whoosh_s: 2.4, whoosh_l: 2.4, glitch: 2.4, shutter: 2.4, swoosh: 1.6, swoosh_up: 1.6, swoosh_down: 1.6, snap: 1.8, pop: 1.5,
    bubble: 1.5, paper: 1.4, shimmer: 1.6, sparkle: 1.5, chime: 2, click: 1.3, key: 1, tick: 1 };
  R.cue = (t, cat, gain = 1, o = {}) => { if (cat) cues.push({ t, cat, gain, prio: o.prio != null ? o.prio : (PRIO[cat] || 1), pan: o.pan }); };
  R.event = (t, kind, line) => events.push({ t, kind, line });

  // ------------------------------------------------------------------ shots
  // ctx: what a visual template gets (its params, its lines, the theme, helpers to animate and to make sounds)
  function makeCtx(shot) {
    const ctx = {
      shot, p: shot.vis, th: TH, el: shot.el, R,
      get t0() { return shot.t0; }, get t1() { return shot.t1; },
      get lines() { return shot.lines; },
      L(i, f = 0, dt = 0) { const L = shot.lines[Math.min(i, shot.lines.length - 1)]; if (!L) return shot.t0 + dt; if (i >= shot.lines.length) return L.t1 + dt; return L.t0 + f * L.dur + dt; },
      word(i, k, dt = 0) { const L = shot.lines[i]; if (!L) return shot.t0; const w = L.words[Math.min(k, L.words.length - 1)]; return (w ? w.t : L.t0) + dt; },
      wordAt(i, re, dt = 0) { const L = shot.lines[i]; if (!L) return shot.t0; const rx = new RegExp(re, 'i'); const w = L.words.find((x) => rx.test(x.w)); return (w ? w.t : L.t0) + dt; },
      stage(cls) { const d = h('div', 'stg' + (cls ? ' ' + cls : ''), null, shot.el); return d; },
      layer(depth = 0, parent) { const d = h('div', 'lay', null, parent || shot.el); d.dataset.depth = depth; shot.layers.push(d); return d; },
      anim(el, fx, t, o = {}) {
        if (!el || !FX[fx]) return null;
        const a = Object.assign({ el, fx, dur: DUR[fx] || 0.5, shot: shot.owner || shot }, o, { t0: t });
        anims.push(a); st(el);
        const def = SFX[fx] || [];
        const cat = o.sfx === undefined ? def[0] : o.sfx;
        if (cat) R.cue(t + (o.sfxDt || 0), cat, o.gain != null ? o.gain : def[1] || 0.5);
        if (!o.quiet && !['out', 'outUp', 'dim', 'bump', 'shake', 'draw', 'fade'].includes(fx) || o.event) R.event(t, fx, o.line);
        return a;
      },
      sfx: (t, cat, gain = 0.6, o) => R.cue(t, cat, gain, o),
      ev: (t, kind) => R.event(t, kind || 'step'),
      tick(fn) { shot.ticks.push(fn); },
      focus(el) { shot.focus = el; },
      img: (name) => IMGS[name] || null,
      icon: R.icon,
    };
    return ctx;
  }
  R.makeCtx = makeCtx;
  function buildShots() {
    let cur = null;
    lines.forEach((L) => {
      if (L.role === 'end') return;
      if (L.b.visual || !cur) {
        cur = { i: shots.length, vis: L.b.visual || { type: 'type-pop' }, lines: [], t0: L.t0 - 0.08, tr: L.b.tr || L.b.visual && L.b.visual.tr, cam: (L.b.visual || {}).cam, ticks: [], layers: [], role: L.role };
        if (cur.i === 0) cur.t0 = -0.3; // the hook is already moving on frame 0 (its entrances started 0.3 s before)
        shots.push(cur);
      }
      L.shot = cur; L.step = cur.lines.length; cur.lines.push(L);
    });
    // the end: its own shot (the end type builds it)
    const endShot = { i: shots.length, vis: Object.assign({ type: '__end' }, S.end || {}), lines: lines.filter((L) => L.role === 'end'), ticks: [], layers: [], role: 'end', end: true };
    endShot.t0 = R.END[R.endType].start(lines, total, S.end || {});
    endShot.tr = (S.end || {}).tr;
    endShot.lines.forEach((L) => { L.shot = endShot; L.step = 0; });
    shots.push(endShot);
    shots.forEach((s, i) => { s.t1 = i < shots.length - 1 ? shots[i + 1].t0 : total; });
    // transitions: the script's, else the theme's set in rotation (never the same twice in a row)
    const pool = S.transitions || TH.transitions || ['blur-push'];
    let k = 0, last = null;
    shots.forEach((s, i) => {
      if (i === 0) return;
      if (!s.tr) { let tr = pool[k++ % pool.length]; if (tr === last && pool.length > 1) tr = pool[k++ % pool.length]; s.tr = tr; }
      last = s.tr; s.trDur = (R.TR[s.tr] && R.TR[s.tr].dur) || TR_DUR;
    });
    // a chosen track with a beat grid (script "beat": {bpm}): the reel starts on a downbeat, every cut snaps to the
    // nearest beat when it is within 0.16 s (the voice keeps its own timing; only the picture moves)
    // the previews use the owner's track (125 BPM) unless the script names another file with its own grid
    const BEAT = S.beat || ((S.musicFile || 'owner-free') === 'owner-free' ? { bpm: 125.01 } : null);
    if (BEAT && BEAT.bpm) { const per = 60 / BEAT.bpm; R.beatPer = per;
      shots.forEach((s, i) => { if (!i) return; const tb = Math.round(s.t0 / per) * per, th = Math.round(s.t0 / (per / 2)) * (per / 2); s.t0 = Math.abs(tb - s.t0) <= 0.16 ? tb : th; }); // a beat, else the half beat
      shots.forEach((s, i) => { s.t1 = i < shots.length - 1 ? shots[i + 1].t0 : total; }); }
    const cams = TH.cams || ['push'];
    shots.forEach((s, i) => { if (!s.cam) s.cam = cams[i % cams.length]; });
  }

  // ------------------------------------------------------------------ camera inside a shot
  R.CAM = {
    none: () => ({}),
    push: (lt, d) => ({ s: 1 + 0.06 * E.sine(clamp(lt / d)) }),
    pull: (lt, d) => ({ s: 1.07 - 0.07 * E.sine(clamp(lt / d)) }),
    drift: (lt, d) => ({ x: -16 + 32 * E.sine(clamp(lt / d)), s: 1.02 }),
    rise: (lt, d) => ({ y: 18 - 36 * E.sine(clamp(lt / d)), s: 1.02 }),
    dolly: (lt, d) => { const p = E.sine(clamp(lt / d)); return { s: 1 + 0.1 * p, depthS: -0.14 * p }; },
    parallax: (lt, d) => { const p = E.sine(clamp(lt / d)); return { s: 1.03, cx: -46 + 92 * p, cy: -10 + 20 * p }; },
  };

  // ------------------------------------------------------------------ build & seek
  function collectIcons() {
    const n = new Set(BUILTIN);
    const walk = (o) => { if (!o || typeof o !== 'object') return; for (const k in o) { if (['ic', 'icon', 'labelIcon', 'kickerIcon', 'badge'].includes(k) && typeof o[k] === 'string') n.add(o[k]); else if (k === 'items' && Array.isArray(o[k])) { o[k].forEach((x) => typeof x === 'string' ? n.add(x) : walk(x)); } else if (k === 'icons' && Array.isArray(o[k])) o[k].forEach((x) => typeof x === 'string' ? n.add(x) : x && x.ic && n.add(x.ic)); else walk(o[k]); } };
    walk(S); return n;
  }
  function applyTheme() {
    const P = TH.palette || {};
    const root = document.documentElement.style;
    Object.entries(P).forEach(([k, v]) => root.setProperty('--' + k, v));
    const F = TH.font || {};
    if (F.display) root.setProperty('--f-display', F.display);
    if (F.body) root.setProperty('--f-body', F.body);
    if (F.serif) root.setProperty('--f-serif', F.serif);
    if (F.mono) root.setProperty('--f-mono', F.mono);
    if (F.dw) root.setProperty('--dw', F.dw);
    if (F.track) root.setProperty('--track', F.track);
    if (TH.radius) root.setProperty('--radius', TH.radius + 'px');
    if (TH.shadow) root.setProperty('--sh', TH.shadow);
    document.body.dataset.cap = TH.caption || 'pill';
    document.body.dataset.theme = S.theme;
    document.body.dataset.dark = TH.dark ? '1' : '';
    document.body.dataset.sweep = TH.sweep || '';
    const LY = S.layout || {}; R.layout = { align: LY.align || 'center', anchor: LY.anchor || 'center', typeScale: LY.typeScale || 1 };
    document.body.dataset.align = R.layout.align;
    if (TH.fontDisplay) root.setProperty('--f-display', TH.fontDisplay);
  }
  async function boot() {
    S = await (await fetch('../../scripts/' + ID + '/script.json', { cache: 'no-store' })).json();
    const themes = await (await fetch('../themes.json', { cache: 'no-store' })).json();
    TH = themes.themes[S.theme] || themes.themes[Object.keys(themes.themes)[0]];
    R.theme = TH; R.script = S;
    try { const r = await fetch('../../scripts/' + ID + '/timing.json', { cache: 'no-store' }); if (r.ok) TIM = await r.json(); } catch (e) { /* no voice yet: estimated */ }
    try { const r = await fetch('../../scripts/' + ID + '/images.json', { cache: 'no-store' }); if (r.ok) { const m = await r.json(); Object.entries(m).forEach(([k, v]) => { IMGS[k] = '../img/' + v.file; }); } } catch (e) { /* no AI images: code-drawn */ }
    try { const r = await fetch('../site/manifest.json', { cache: 'no-store' }); if (r.ok) R.siteShots = await r.json(); } catch (e) { R.siteShots = null; }
    applyTheme();
    await loadIcons(collectIcons());
    if (document.fonts) {
      const txt = JSON.stringify(S).replace(/[\x00-\x2f]/g, '') + 'șțăîâȘȚĂÎÂ«»?!0123456789';
      const F = TH.font || {};
      const fams = [F.display, F.body, F.serif, F.mono, "'Inter Variable'"].filter(Boolean);
      for (const f of fams) for (const wgt of ['400', '700', '900']) { try { await document.fonts.load(wgt + ' 80px ' + f, txt); await document.fonts.load('italic ' + wgt + ' 80px ' + f, txt); } catch (e) { /* */ } }
      await document.fonts.ready;
    }
    buildLines();
    timeline();
    R.BG.build(TH, S);
    R.brand(S, TH);
    buildShots();
    const world = document.getElementById('world');
    for (const s of shots) {
      s.el = h('div', 'shot', null, world); s.el.dataset.i = s.i; s.el.style.display = 'block';
      s.ctx = makeCtx(s);
      if (s.end) R.END[R.endType].build(s.ctx, S.end || {}, shots);
      else { if (s.vis.bg) R.bgPanel(s.ctx, s.vis.bg); (R.V[s.vis.type] || R.V['type-pop'])(s.ctx, s.vis); }
      s.lines.forEach((L) => { if (L.b.nuki) { R.nukiCorner(s.ctx, L.b.nuki, L.t0 + (L.b.nuki.dt != null ? L.b.nuki.dt : 0.15)); R.nukiCount = (R.nukiCount || 0) + 1; } });
      s.el.style.display = 'none';
      // every line after the first one in a shot is a step: the template drew something for it; mark the line
      s.lines.forEach((L) => R.event(L.t0, 'line', L.i));
      if (s.i > 0) { const T = R.TR[s.tr]; if (T && T.sfx) T.sfx(s.t0, s.trDur); R.event(s.t0, 'cut'); }
    }
    R.buildCaptions(lines, TH, S);
    // the hook: a hit on frame 0 (plus whatever the hook visual added), a riser into the payoff, an impact on it
    if (!cues.some((c) => c.t <= 0.1 && (c.cat === 'impact' || c.cat === 'boom'))) R.cue(0, 'impact', 1, { prio: 4 });
    const pay = lines.find((L) => L.role === 'payoff');
    if (pay) {
      const rvs = lines.filter((L) => L.role === 'payoff' && L.shot && L.shot.revealAt != null).map((L) => L.shot.revealAt);
      R.payoffAt = rvs.length ? rvs[0] : pay.t0;
      const rv = R.payoffAt;
      R.cue(rv - 1.25, 'riser', 0.75, { prio: 4 }); R.cue(rv, 'impact', 1, { prio: 4 }); R.cue(rv, 'subdrop', 0.7, { prio: 4 }); R.cue(rv + 0.05, 'shimmer', 0.5);
      R.event(rv, 'payoff');
    }
    await Promise.all([...document.images].map((im) => (im.decode ? im.decode().catch(() => {}) : null)));
    shots.forEach((s) => s.after && s.after());
    shots.forEach((s) => { s.el.style.display = 'block'; const f = s.focus; if (f) { const r = f.getBoundingClientRect(); if (r.width > 2) s.focusRect = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; } s.el.style.display = 'none'; });
    const outro = lines.find((L) => L.role === 'outro');
    if (outro) { R.outroAt = outro.shot && outro.shot.resolveAt != null ? outro.shot.resolveAt : outro.t0 + outro.dur * 0.5; R.cue(R.outroAt, 'resolve', 0.8, { prio: 4 }); R.cue(R.outroAt, 'impact', 0.35, { prio: 3 }); R.event(R.outroAt, 'resolve'); }
    cues.sort((a, b) => a.t - b.t);
    events.sort((a, b) => a.t - b.t);
    window.film = {
      v: 2, id: S.id, total, fps: FPS, W, H, theme: S.theme, end: R.endType, keyword: S.keyword || null,
      music: S.music || TH.music, musicClip: S.musicClip || null, musicFile: S.musicFile || 'owner-free', musicStart: S.musicStart != null ? S.musicStart : 77.19, beat: S.beat || null, sfx: TH.sfx, loop: R.endType === 'loop',
      cues: cues.filter((c) => c.t >= 0 && c.t < total),
      events: events.filter((e) => e.t >= -0.01 && e.t <= total),
      beats: lines.map((L) => ({ key: L.key, t0: L.t0, dur: L.dur, text: L.text, role: L.role, voiced: L.voiced, shot: L.shot ? L.shot.i : -1, step: L.step, visual: L.b.visual ? L.b.visual.type : L.b.step ? 'step' : null })),
      shots: shots.map((s) => ({ i: s.i, t0: s.t0, t1: s.t1, type: s.vis.type, tr: s.tr || null, cam: s.cam, role: s.role, lines: s.lines.map((L) => L.i) })),
      hook: { q: (asList(S.hook)[0] || {}).q || null, t1: lines[0] ? lines[0].t1 : 0 },
      payoff: R.payoffAt != null ? R.payoffAt : null,
      images: Object.keys(IMGS).length, nuki: R.nukiCount || 0, outro: R.outroAt != null ? R.outroAt : null,
      resolve: lines.filter((L) => L.role === 'resolve').length, sections: Object.fromEntries(['hook', 'beat', 'payoff', 'resolve', 'outro', 'end'].map((r) => { const ls = lines.filter((L) => L.role === r); return [r, ls.length ? [ls[0].t0, ls[ls.length - 1].t1] : null]; })),
    };
    seek(0);
    window.ready = true;
  }

  function trState() { return { x: 0, y: 0, s: 1, rx: 0, ry: 0, o: 1, blur: 0, clip: null, filter: '', bright: 1, origin: null }; }
  function seek(t) {
    R.t = t;
    const fx = document.getElementById('fx');
    fx.querySelectorAll('.trfx').forEach((e) => { e.style.display = 'none'; });
    const visible = new Set();
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i], nx = shots[i + 1];
      const a = i === 0 ? -1 : s.t0 - s.trDur / 2;
      const z = nx ? nx.t0 + nx.trDur / 2 : total + 1;
      const vis = t >= a && t < z;
      s.el.style.display = vis ? 'block' : 'none';
      if (!vis) continue;
      visible.add(s);
      const T = trState();
      if (i > 0 && t < s.t0 + s.trDur / 2) { const p = clamp((t - a) / s.trDur); const tr = R.TR[s.tr]; if (tr) tr.in(T, p, s, shots[i - 1], fx); }
      if (nx && t >= nx.t0 - nx.trDur / 2) { const p = clamp((t - (nx.t0 - nx.trDur / 2)) / nx.trDur); const tr = R.TR[nx.tr]; if (tr) tr.out(T, p, s, nx, fx); }
      const lt = t - s.t0, d = Math.max(1, s.t1 - s.t0);
      const C = (R.CAM[s.cam] || R.CAM.none)(Math.max(0, lt), d);
      const k = T.s * (C.s || 1);
      s.el.style.transformOrigin = T.origin || '';
      s.el.style.transform = 'translate(' + (T.x + (C.x || 0)).toFixed(2) + 'px,' + (T.y + (C.y || 0)).toFixed(2) + 'px) ' + (T.ry ? 'rotateY(' + T.ry.toFixed(2) + 'deg) ' : '') + (T.rx ? 'rotateX(' + T.rx.toFixed(2) + 'deg) ' : '') + 'scale(' + k.toFixed(4) + ')';
      s.el.style.opacity = T.o.toFixed(3);
      const filt = (T.blur > 0.05 ? 'blur(' + T.blur.toFixed(2) + 'px) ' : '') + (T.bright !== 1 ? 'brightness(' + T.bright.toFixed(3) + ') ' : '') + T.filter;
      s.el.style.filter = filt.trim();
      s.el.style.clipPath = T.clip || '';
      s.el.style.zIndex = String(i);
      // depth layers: parallax and dolly
      s.layers.forEach((l) => { const dp = +l.dataset.depth || 0; if (!dp && !C.depthS) return; l.style.transform = 'translate(' + ((C.cx || 0) * dp).toFixed(2) + 'px,' + ((C.cy || 0) * dp).toFixed(2) + 'px) scale(' + (1 + (C.depthS || 0) * (dp < 0 ? -1 : dp > 0 ? 0.4 : 0)).toFixed(4) + ')'; });
      s.ticks.forEach((fn) => fn(t, lt));
    }
    R.BG.draw(t); // after the shots: a pan transition moves the background too (parallax)
    // element animations (only the visible shots)
    for (const s of states.values()) resetState(s);
    for (const a of anims) { if (!visible.has(a.shot)) continue; const p = clamp((t - a.t0) / a.dur); if (t < a.t0 && !a.pre) { if (FX[a.fx] && ['out', 'outUp', 'dim', 'bump', 'shake', 'move', 'hl'].includes(a.fx)) continue; } FX[a.fx](st(a.el), p, a); }
    for (const [el, s] of states) {
      const base = el.dataset.base || '';
      const tr = (s.x || s.y ? 'translate(' + s.x.toFixed(2) + 'px,' + s.y.toFixed(2) + 'px) ' : '') + (s.r ? 'rotate(' + s.r.toFixed(2) + 'deg) ' : '') + (s.rx ? 'perspective(1400px) rotateX(' + s.rx.toFixed(2) + 'deg) ' : '') + (s.s !== 1 ? 'scale(' + s.s.toFixed(4) + ') ' : '') + (s.sx !== 1 || s.sy !== 1 ? 'scale(' + s.sx.toFixed(4) + ',' + s.sy.toFixed(4) + ')' : '');
      el.style.transform = (base + ' ' + tr).trim();
      if (s.dash != null && s.dash > 0.97) s.o = 0;
      el.style.opacity = s.o.toFixed(3);
      el.style.filter = s.blur > 0.05 ? 'blur(' + s.blur.toFixed(2) + 'px)' : (el.dataset.filter || '');
      if (s.clip != null) { el.style.clipPath = s.clip; el._fxClip = 1; } else if (el._fxClip) { el.style.clipPath = ''; el._fxClip = 0; }
      if (s.hl != null) el.style.setProperty('--p', s.hl.toFixed(3));
      if (s.dash != null) { el.style.strokeDashoffset = s.dash.toFixed(4); if (s.dash > 0.995) s.o = 0; }
      el.style.visibility = s.o < 0.003 ? 'hidden' : '';
    }
    // the hit's soft white flash (frame 0 stays clean: the thumbnail and the loop)
    const fl = document.getElementById('flash');
    if (!fl._init) { fl._init = 1; fl.style.background = TH.dark ? 'radial-gradient(circle at 50% 38%,var(--acc) 0%,transparent 60%)' : '#fff'; }
    fl.style.opacity = t < 0.034 ? '0' : ((TH.dark ? 0.3 : 0.18) * (1 - clamp((t - 0.034) / 0.25))).toFixed(3);
    if (R.payoffAt != null && t >= R.payoffAt && t < R.payoffAt + 0.3) fl.style.opacity = Math.max(+fl.style.opacity, (TH.dark ? 0.35 : 0.2) * (1 - (t - R.payoffAt) / 0.3)).toFixed(3);
    if (TH.sweep !== false) {
      let sw = null; for (const s of shots) if (s.i > 0 && t >= s.t0 - 0.05 && t < s.t0 + 0.9) sw = s;
      const el = document.getElementById('sweep');
      if (sw) { const q = clamp((t - sw.t0 + 0.05) / 0.9); el.style.display = 'block'; el.style.transform = 'translateX(' + (-1400 + E.inout(q) * 2800).toFixed(1) + 'px) rotate(18deg)'; el.style.opacity = (Math.sin(Math.PI * q) * (TH.dark ? 0.5 : TH.sweep === 'rose' ? 0.28 : 0.22)).toFixed(3); }
      else el.style.display = 'none';
    }
    R.captionAt(t);
    return t;
  }
  R.seek = window.seek = seek;
  window.addEventListener('load', () => { boot().catch((e) => { window.bootError = String(e && e.stack || e); console.error(e); }); });
})();
