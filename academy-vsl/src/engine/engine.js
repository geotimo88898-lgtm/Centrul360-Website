// Centrul360 Academia: the film engine. A film is films/<id>/script.json (scenes of beats: one spoken line each)
// plus films/<id>/timing.json (each line's voice length, written by voice.py). Every frame is a pure function of
// the time: window.seek(t) draws the frame at t, so render.cjs can step through it frame by frame. Every animation
// can carry a sound effect; window.film.cues lists them for mix.py.
(function () {
  'use strict';
  const W = 1920, H = 1080;
  const GAP = 0.26, LEAD = 0.55, TAIL = 0.5, XF = 0.55; // pause after a line, before the first line, after the last, crossfade
  const qs = new URLSearchParams(location.search);
  const FILM = qs.get('film');
  const ROOT = '../../..'; // the website root (academy-vsl/src/engine → /)
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const E = {
    out: (p) => 1 - Math.pow(1 - p, 3),
    out5: (p) => 1 - Math.pow(1 - p, 5),
    inout: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    back: (p) => { const c1 = 1.55, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
    lin: (p) => p,
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // *word* → the accent (Fraunces italic, teal)
  const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const plain = (s) => String(s || '').replace(/\*/g, '');
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // ---------------------------------------------------------------- icons (lucide-static, loaded once)
  const ICONS = {};
  async function loadIcons(names) {
    await Promise.all([...names].map(async (n) => {
      try { const r = await fetch('node_modules/lucide-static/icons/' + n + '.svg'); if (r.ok) ICONS[n] = (await r.text()).replace(/<!--[\s\S]*?-->/g, ''); } catch (e) { /* missing icon */ }
    }));
  }
  const icon = (n) => ICONS[n] || ICONS['sparkles'] || '';
  const BUILTIN_ICONS = ['check', 'x', 'hand', 'settings', 'clock', 'sparkles', 'heart', 'triangle-alert', 'info', 'message-circle', 'lightbulb', 'circle-help', 'ban', 'user-round', 'hand-heart', 'star', 'chevron-right', 'arrow-right', 'calendar-days', 'repeat', 'timer'];

  // ---------------------------------------------------------------- state
  let S, TIM = {}, total = 0;
  const scenes = []; // {sc, el, t0, t1, end, beats:[{t0,t1,...}], ticks:[], side}
  const acts = []; // {el, fx, t0, dur, ...}
  const cues = []; // {t, sfx, gain}
  const breaks = []; // times of big moves (a pattern break)
  const logoKeys = []; // {t, x, y, s, ry, o}
  const states = new Map();
  const st = (el) => { let s = states.get(el); if (!s) { s = { o: 1, x: 0, y: 0, s: 1, sy: null, blur: 0, clip: null, rot: 0 }; states.set(el, s); } return s; };

  function beatKey(si, bi) { return si + '.' + bi; }
  function estimate(text) { return Math.max(1.2, plain(text).length / 14.5); }

  // ---------------------------------------------------------------- timeline
  function timeline() {
    let t = 0;
    S.scenes.forEach((sc, si) => {
      const s = { sc, si, t0: t, beats: [], ticks: [], acts: [] };
      t += sc.lead != null ? sc.lead : LEAD;
      (sc.beats || []).forEach((b, bi) => {
        const k = beatKey(si, bi);
        const tm = TIM[k];
        const dur = tm && tm.text === (b.tts || b.say) ? tm.dur : estimate(b.tts || b.say);
        const bt = { b, key: k, t0: t, t1: t + dur, dur };
        s.beats.push(bt);
        t += dur + GAP + (b.hold || 0);
      });
      if (!s.beats.length) t += sc.dur || 2;
      t += sc.tail != null ? sc.tail : (sc.type === 'outro' ? 3.9 : TAIL);
      s.t1 = t;
      scenes.push(s);
    });
    total = t + 0.6;
    scenes.forEach((s, i) => { s.end = i < scenes.length - 1 ? scenes[i + 1].t0 + XF : total; });
  }

  // a time in a scene: n = beat index (2.5 = halfway through beat 2), -1 = the scene's start, plus dt seconds
  function at(s, n, dt = 0) {
    if (n == null) n = -1;
    if (n < 0) return s.t0 + 0.2 + dt;
    const i = Math.floor(n), f = n - i;
    if (i >= s.beats.length) return s.t1 - 0.4 + dt;
    const b = s.beats[i];
    return b.t0 + f * b.dur + dt;
  }

  function ctxFor(s) {
    return {
      s,
      at: (n, dt) => at(s, n, dt),
      act(el, fx, n, o = {}) {
        if (!el) return;
        const t0 = o.t != null ? o.t : at(s, n, o.dt || 0);
        const a = Object.assign({ el, fx, t0, dur: o.dur || DUR[fx] || 0.6 }, o);
        a.t0 = t0;
        acts.push(a); s.acts.push(a);
        const sfx = o.sfx === undefined ? SFX[fx] : o.sfx;
        if (sfx) cues.push({ t: t0 + (o.sfxDt || 0), sfx, gain: o.gain != null ? o.gain : 1 });
        return a;
      },
      cue: (t, sfx, gain = 1) => cues.push({ t, sfx, gain }),
      tick: (fn) => s.ticks.push(fn),
      logo: (keys) => { logoKeys.push(...keys); keys.forEach((k) => breaks.push(k.t)); },
      brk: (t) => breaks.push(t),
    };
  }
  const DUR = { rise: 0.7, pop: 0.6, fade: 0.5, wipe: 0.9, draw: 0.55, out: 0.45, slideL: 0.7, slideR: 0.7, count: 1.4, hl: 0.45, ink: 0.7, down: 0.6, grow: 0.8 };
  const SFX = { rise: 'soft', pop: 'pop', wipe: 'swish', draw: 'check', count: 'count', hl: 'ding', ink: 'pen', slideL: 'swish', slideR: 'swish', grow: 'rise' };

  const FX = {
    fade: (s, p) => { s.o *= E.out(p); },
    rise: (s, p) => { const e = E.out5(p); s.o *= clamp(p * 1.8); s.y += (1 - e) * 48; s.blur += (1 - e) * 10; },
    down: (s, p) => { const e = E.out5(p); s.o *= clamp(p * 1.8); s.y -= (1 - e) * 48; s.blur += (1 - e) * 8; },
    pop: (s, p) => { s.o *= clamp(p * 2.5); s.s *= 0.5 + 0.5 * E.back(p); },
    slideL: (s, p) => { const e = E.out5(p); s.o *= clamp(p * 2); s.x -= (1 - e) * 140; s.blur += (1 - e) * 8; },
    slideR: (s, p) => { const e = E.out5(p); s.o *= clamp(p * 2); s.x += (1 - e) * 140; s.blur += (1 - e) * 8; },
    wipe: (s, p) => { s.clip = Math.min(s.clip == null ? 100 : s.clip, (1 - E.inout(p)) * 100); },
    ink: (s, p) => { s.clip = Math.min(s.clip == null ? 100 : s.clip, (1 - E.lin(p)) * 100); },
    out: (s, p) => { const e = E.out(p); s.o *= 1 - e; s.y -= e * 24; s.blur += e * 6; },
    hl: (s, p) => { s.o *= E.out(p); s.s *= 1.08 - 0.08 * E.out(p); },
    grow: (s, p) => { s.sy = (s.sy || 1) * E.out5(p); s.o *= clamp(p * 4); },
    dim: (s, p, a) => { s.o *= 1 - (1 - (a.to != null ? a.to : 0.35)) * E.out(p); },
  };
  // effects that write the element directly
  const DIRECT = {
    draw: (a, p) => { a.el.style.strokeDashoffset = String(1 - E.inout(p)); a.el.style.opacity = p > 0 ? 1 : 0; },
    count: (a, p) => { const v = a.from + (a.to - a.from) * E.out(p); a.el.textContent = a.fmt ? a.fmt(v) : String(Math.round(v)); },
    cls: (a, p) => { a.el.classList.toggle(a.name, p > 0); },
  };

  function apply(t) {
    for (const s of states.values()) { s.o = 1; s.x = 0; s.y = 0; s.s = 1; s.sy = null; s.blur = 0; s.clip = null; s.rot = 0; }
    for (const a of acts) {
      const p = clamp((t - a.t0) / a.dur);
      if (DIRECT[a.fx]) { DIRECT[a.fx](a, p, t); continue; }
      FX[a.fx](st(a.el), p, a);
    }
    for (const [el, s] of states) {
      const base = el.dataset.base || '';
      const tr = (s.x || s.y ? 'translate(' + s.x.toFixed(2) + 'px,' + s.y.toFixed(2) + 'px) ' : '') + (s.s !== 1 ? 'scale(' + s.s.toFixed(4) + ') ' : '') + (s.sy != null ? 'scaleY(' + s.sy.toFixed(4) + ') ' : '') + (s.rot ? 'rotate(' + s.rot.toFixed(3) + 'deg)' : '');
      el.style.transform = (base + ' ' + tr).trim();
      el.style.opacity = s.o.toFixed(3);
      el.style.filter = s.blur > 0.05 ? 'blur(' + s.blur.toFixed(2) + 'px)' : '';
      el.style.clipPath = s.clip != null && s.clip > 0.01 ? 'inset(-20% ' + s.clip.toFixed(2) + '% -20% -2%)' : '';
      el.style.visibility = s.o < 0.002 ? 'hidden' : '';
    }
  }

  // ---------------------------------------------------------------- shared pieces
  function head(c, ctx, sc, n = -1) {
    if (!sc.head && !sc.kicker) return 0;
    const box = h('div', 'box', (sc.kicker ? '<div class="kicker">' + esc(sc.kicker) + '</div>' : '') + (sc.head ? '<div class="h3" style="margin-top:14px">' + rich(sc.head) + '</div>' : ''));
    box.style.left = '0'; box.style.top = '0'; box.style.right = '0';
    c.appendChild(box);
    ctx.act(box, 'rise', n, { dt: 0.05, sfx: 'soft' });
    return sc.head ? (sc.kicker ? 150 : 100) : 60;
  }
  function contentBox(el, side) {
    const c = h('div', 'content ' + (side === 'l' ? 'with-nuki-l' : side === 'r' ? 'with-nuki-r' : 'full'));
    el.appendChild(c);
    return c;
  }
  const tickSvg = () => '<svg class="tick" viewBox="0 0 58 58"><circle cx="29" cy="29" r="26"/><path pathLength="1" style="stroke-dasharray:1 1;stroke-dashoffset:1" d="M17 30 l8 8 l16 -18"/></svg>';
  function words(text, cls) { // a title split into words, so they can rise one after another
    const parts = []; String(text).split(/(\*[^*]+\*)/).forEach((seg) => {
      if (!seg) return;
      const acc = /^\*.*\*$/.test(seg);
      seg.replace(/\*/g, '').split(/(\s+)/).forEach((w) => { if (w.trim()) parts.push('<span class="w' + (acc ? ' acc' : '') + '">' + esc(w) + '</span>'); else if (w) parts.push(' '); });
    });
    return '<div class="' + cls + '">' + parts.join('') + '</div>';
  }
  function riseWords(el, ctx, n, step = 0.07, dt = 0) { el.querySelectorAll('.w').forEach((w, i) => ctx.act(w, 'rise', n, { dt: dt + i * step, sfx: i ? null : 'swish' })); }

  // ---------------------------------------------------------------- scene types
  const T = {};

  T.intro = (el, ctx, sc) => {
    const s = ctx.s;
    const c = contentBox(el, 'r');
    const box = h('div', 'box', '<div class="kicker">' + esc(sc.kicker || 'Academia Centrul360') + '</div>' + words(sc.title, 'h1') + (sc.sub ? '<p class="lede" style="margin-top:34px;max-width:1000px">' + rich(sc.sub) + '</p>' : ''));
    box.style.left = '40px'; box.style.top = '260px'; box.style.right = '0';
    c.appendChild(box);
    const k = box.querySelector('.kicker'), t1 = box.querySelector('.h1'), p = box.querySelector('.lede');
    t1.style.marginTop = '26px';
    const tl = s.t0 + 2.3; // the logo first, alone
    ctx.act(k, 'rise', null, { t: tl, sfx: 'soft' });
    t1.querySelectorAll('.w').forEach((w, i) => ctx.act(w, 'rise', null, { t: tl + 0.15 + i * 0.08, sfx: i ? null : 'swish' }));
    if (p) ctx.act(p, 'rise', null, { t: tl + 0.6 });
    ctx.logo([{ t: s.t0, x: 960, y: 520, s: 120, ry: -3.2, o: 0 }, { t: s.t0 + 0.35, x: 960, y: 520, s: 300, ry: -1.6, o: 1 }, { t: s.t0 + 1.9, x: 960, y: 520, s: 380, ry: 0, o: 1 },
      { t: tl + 0.5, x: 230, y: 250, s: 170, ry: 0.35, o: 1 }, { t: s.t1 - 0.3, x: 230, y: 250, s: 170, ry: 0.15, o: 1 }, { t: s.t1 + 0.2, x: 100, y: 200, s: 60, ry: 1.6, o: 0 }]);
    ctx.cue(s.t0 + 0.2, 'rise', 1); ctx.cue(s.t0 + 1.7, 'shimmer', 0.9);
  };

  T.outro = (el, ctx, sc) => {
    const s = ctx.s;
    const c = contentBox(el, 'l');
    const box = h('div', 'box', '<div class="kicker">' + esc(sc.kicker || 'Gata') + '</div>' + words(sc.title || 'Bravo!', 'h1') +
      '<div class="rail" style="margin-top:44px">' + (sc.items || []).map((x, i) => '<div class="rs card"><span class="ic">' + icon('check') + '</span>' + esc(x.t || x) + '</div>').join('') + '</div>');
    box.style.left = '60px'; box.style.top = '170px'; box.style.right = '0';
    c.appendChild(box);
    ctx.act(box.querySelector('.kicker'), 'rise', 0, { dt: 0 });
    riseWords(box.querySelector('.h1'), ctx, 0, 0.08, 0.1);
    box.querySelectorAll('.rs').forEach((r, i) => ctx.act(r, 'pop', (sc.items[i] && sc.items[i].at != null) ? sc.items[i].at : 0.4 + i * 0.12, { gain: 0.8 }));
    ctx.brk(at(s, 1)); ctx.brk(at(s, 2));
    const tEnd = s.beats.length ? s.beats[s.beats.length - 1].t1 + 0.3 : s.t1 - 2;
    ctx.act(box, 'out', null, { t: tEnd, sfx: 'swish' });
    const nm = h('div', 'box', '<div class="h2" style="font-size:60px">Centrul360 <span style="font-weight:500;color:var(--mute)">Academia</span></div>');
    nm.style.left = '0'; nm.style.right = '0'; nm.style.top = '560px'; nm.style.textAlign = 'center';
    c.appendChild(nm);
    ctx.act(nm, 'rise', null, { t: tEnd + 0.7, sfx: null });
    ctx.logo([{ t: tEnd + 0.1, x: 1260, y: 420, s: 60, ry: -3, o: 0 }, { t: tEnd + 0.8, x: 1260, y: 420, s: 280, ry: -0.4, o: 1 }, { t: tEnd + 3.5, x: 1260, y: 420, s: 300, ry: 0.2, o: 1 }]);
    ctx.cue(tEnd + 0.4, 'shimmer', 1);
  };

  T.stepcard = (el, ctx, sc) => {
    const c = contentBox(el, sc.nuki || 'l');
    const box = h('div', 'box stepcard', '<div class="kicker">' + esc(sc.kicker || 'Pasul') + '</div>' +
      '<div class="stepnum">' + sc.n + '<small> / ' + sc.of + '</small></div>' + words(sc.title, 'h2') +
      (sc.when ? '<div class="chip">' + icon('clock') + esc(sc.when) + '</div>' : ''));
    box.style.left = '40px'; box.style.top = '70px'; box.style.width = '760px';
    c.appendChild(box);
    const ic = h('div', 'ic', icon(sc.ic)); ic.style.cssText = 'position:absolute;right:40px;top:120px;width:300px;height:300px;box-shadow:0 0 0 30px #d9f3ef, 0 50px 80px -30px rgba(13,127,115,.6)';
    c.appendChild(ic);
    ctx.act(box.querySelector('.kicker'), 'rise', -1, { dt: 0.1 });
    ctx.act(box.querySelector('.stepnum'), 'pop', -1, { dt: 0.2, sfx: 'pop' });
    riseWords(box.querySelector('.h2'), ctx, -1, 0.06, 0.35);
    ctx.act(box.querySelector('.chip'), 'rise', 0, { dt: 0.3 });
    ctx.act(ic, 'pop', -1, { dt: 0.45, sfx: 'pop2' });
    ctx.tick((t) => { ic.dataset.base = 'rotate(' + (Math.sin(t * 1.3) * 4).toFixed(2) + 'deg)'; });
  };

  T.title = (el, ctx, sc) => { // a chapter card: icon, kicker, big title, optional line
    const c = contentBox(el, sc.nuki || 'l');
    const box = h('div', 'box', '<div class="ic" style="width:150px;height:150px;box-shadow:0 0 0 22px #d9f3ef">' + icon(sc.ic || 'sparkles') + '</div>' +
      '<div class="kicker" style="margin-top:56px">' + esc(sc.kicker || '') + '</div>' + words(sc.title, 'h2') + (sc.sub ? '<p class="lede" style="margin-top:24px;max-width:1050px">' + rich(sc.sub) + '</p>' : ''));
    box.style.left = '40px'; box.style.top = '80px'; box.style.right = '20px';
    c.appendChild(box);
    box.querySelector('.h2').style.marginTop = '18px';
    ctx.act(box.querySelector('.ic'), 'pop', -1, { dt: 0.05, sfx: 'pop2' });
    ctx.act(box.querySelector('.kicker'), 'rise', -1, { dt: 0.2 });
    riseWords(box.querySelector('.h2'), ctx, -1, 0.06, 0.3);
    if (box.querySelector('.lede')) ctx.act(box.querySelector('.lede'), 'rise', sc.subAt != null ? sc.subAt : 0, { dt: 0.2 });
  };

  T.list = (el, ctx, sc) => {
    const c = contentBox(el, sc.nuki || 'l');
    const top = head(c, ctx, sc);
    const list = h('div', 'box list');
    list.style.left = '0'; list.style.right = '0'; list.dataset.vc = top + 30;
    const big = (sc.items || []).length <= 3;
    sc.items.forEach((it, i) => {
      const li = h('div', 'li card', '<span class="ic' + (it.soft ? ' soft' : '') + '">' + icon(it.ic || 'check') + '</span><b>' + rich(it.t) + '</b>' + (it.noTick ? '' : tickSvg()));
      if (big) { li.style.padding = '26px 34px 26px 26px'; li.querySelector('b').style.fontSize = '42px'; }
      list.appendChild(li);
      const n = it.at != null ? it.at : i;
      ctx.act(li, 'rise', n, { dt: it.dt || 0, sfx: 'pop' , gain: 0.75 });
      const path = li.querySelector('.tick path');
      if (path) ctx.act(path, 'draw', it.done != null ? it.done : n, { dt: it.done != null ? 0.1 : 0.9 + (it.dt || 0), dur: 0.5, sfx: 'check', gain: 0.8 });
    });
    c.appendChild(list);
    if (sc.items.length >= 5) { const six = sc.items.length >= 6; list.style.gap = six ? '10px' : '12px'; list.querySelectorAll('.li').forEach((li) => { li.style.padding = six ? '10px 24px 10px 14px' : '13px 26px 13px 16px'; li.querySelector('b').style.fontSize = six ? '32px' : '34px'; const ic = li.querySelector('.ic'); ic.style.width = ic.style.height = '64px'; }); }
  };

  T.note = (el, ctx, sc) => {
    const c = contentBox(el, sc.nuki || 'l');
    const v = sc.variant || 'why';
    const ic = sc.ic || (v === 'never' ? 'ban' : v === 'tip' ? 'lightbulb' : v === 'say' ? 'message-circle' : 'heart');
    const lab = sc.label || (v === 'never' ? 'Niciodată' : v === 'tip' ? 'Un sfat' : v === 'say' ? 'Cum o spui' : 'De ce contează');
    const wrapb = h('div', 'box'); wrapb.style.left = '0'; wrapb.style.right = '0'; wrapb.dataset.vc = 0;
    const box = h('div', 'card note ' + (v === 'never' ? 'never' : ''), '<span class="ic">' + icon(ic) + '</span><div><div class="t">' + esc(lab) + '</div><p>' + rich(sc.text) + '</p></div>');
    wrapb.appendChild(box);
    c.appendChild(wrapb);
    ctx.act(box, 'rise', sc.at != null ? sc.at : -1, { dt: 0.05, sfx: v === 'never' ? 'alert' : 'swish' });
    ctx.act(box.querySelector('.ic'), 'pop', sc.at != null ? sc.at : -1, { dt: 0.3, sfx: 'pop2' });
    if (sc.extra) {
      const ex = h('div', 'chip', icon(sc.extra.ic || 'info') + '<span>' + esc(sc.extra.t) + '</span>');
      ex.style.marginTop = '30px'; ex.style.fontSize = '32px'; ex.style.padding = '18px 28px'; ex.style.borderRadius = '26px'; ex.style.lineHeight = '1.3';
      wrapb.appendChild(ex);
      ctx.act(ex, 'rise', sc.extra.at != null ? sc.extra.at : 1);
    }
  };

  T.map = (el, ctx, sc) => {
    const s = ctx.s;
    const c = contentBox(el, sc.nuki || 'off');
    const top = head(c, ctx, sc);
    const box = h('div', 'box map'); box.style.left = '20px'; box.style.right = '20px'; box.style.top = (top + 40) + 'px'; box.style.bottom = '10px';
    c.appendChild(box);
    const pts = sc.pts;
    const bw = ((sc.nuki || 'off') === 'off' ? 1660 : 1150), bh = 640 - top * 0.6;
    const P = pts.map(([x, y]) => [(9 + x * 0.89) / 100 * bw, y / 100 * bh]);
    let d = 'M' + P[0][0] + ' ' + P[0][1];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
      d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6) + ' ' + (p2[0] - (p3[0] - p1[0]) / 6) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6) + ' ' + p2[0] + ' ' + p2[1];
    }
    box.innerHTML = '<svg width="' + bw + '" height="' + bh + '"><path class="road-bg" d="' + d + '"/><path class="road" pathLength="1" d="' + d + '"/></svg>';
    const road = box.querySelector('.road');
    // the length of the road up to each stop
    const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path'); tmp.setAttribute('d', d); box.querySelector('svg').appendChild(tmp);
    const L = tmp.getTotalLength();
    const stopLen = P.map(([x, y]) => { let best = 0, bd = 1e9; for (let l = 0; l <= L; l += 4) { const q = tmp.getPointAtLength(l); const dd = (q.x - x) ** 2 + (q.y - y) ** 2; if (dd < bd) { bd = dd; best = l; } } return best / L; });
    tmp.remove();
    const cur = sc.cur, from = sc.from != null ? sc.from : Math.max(0, cur - 1);
    const stops = P.map(([x, y], i) => {
      const e = h('div', 'stop' + (i < cur ? ' done' : '') + (i === cur ? ' cur' : ''), i < cur ? icon('check') : String(i + 1));
      e.style.left = x + 'px'; e.style.top = y + 'px'; if (i < cur) e.querySelector('svg').style.cssText = 'width:34px;height:34px';
      box.appendChild(e);
      return e;
    });
    (sc.stages || []).forEach((g) => { const e = h('div', 'stage-l', esc(g.t)); e.style.left = g.x / 100 * bw + 'px'; e.style.top = g.y / 100 * bh + 'px'; box.appendChild(e); ctx.act(e, 'fade', -1, { dt: 0.2, sfx: null }); });
    const lab = h('div', 'box', '<div class="kicker">Pasul ' + (cur + 1) + ' din ' + P.length + '</div><div class="h2" style="margin-top:14px;font-size:66px">' + rich(sc.title || sc.steps[cur]) + '</div>' + (sc.when ? '<div class="chip" style="margin-top:22px">' + icon('clock') + esc(sc.when) + '</div>' : ''));
    lab.style.left = '19%'; lab.style.width = '62%'; lab.style.top = (bh * 0.4) + 'px'; lab.style.textAlign = 'center';
    lab.querySelector('.kicker').style.justifyContent = 'center';
    box.appendChild(lab);
    const dot = h('div', 'burst'); dot.style.cssText = 'width:34px;height:34px;margin:-17px 0 0 -17px;box-shadow:0 0 0 10px rgba(20,165,150,.25)';
    box.appendChild(dot);
    const tm = s.t0 + 0.5, tmEnd = tm + 1.3;
    stops.forEach((e, i) => ctx.act(e, 'pop', null, { t: s.t0 + 0.05 + i * 0.035, sfx: null, dur: 0.45 }));
    ctx.cue(tm, 'whoosh', 0.9);
    ctx.act(stops[cur], 'hl', null, { t: tmEnd, sfx: 'ding', dur: 0.5 });
    ctx.act(lab, 'rise', null, { t: tm + 0.3, sfx: 'swish' });
    const svg = box.querySelector('svg');
    ctx.tick((t) => {
      const p = E.inout(clamp((t - tm) / (tmEnd - tm)));
      const l = stopLen[from] + (stopLen[cur] - stopLen[from]) * p;
      road.style.strokeDashoffset = String(1 - l);
      const q = svg.querySelector('.road-bg').getPointAtLength(l * L);
      dot.style.left = q.x + 'px'; dot.style.top = q.y + 'px';
      dot.style.opacity = t > tmEnd + 0.4 ? 0 : 1;
      stops[cur].dataset.base = t > tmEnd ? 'scale(' + (1 + 0.05 * Math.sin((t - tmEnd) * 4)).toFixed(3) + ')' : '';
    });
  };

  T.shot = (el, ctx, sc) => {
    const s = ctx.s;
    const side = sc.nuki || 'off';
    const c = contentBox(el, side);
    const ph = h('div', 'phone', '<div class="scr"><div class="cam" style="position:absolute;left:0;top:0;width:100%;transform-origin:0 0"><img src="' + ROOT + '/' + sc.img + '"></div></div>');
    ph.style.left = side === 'off' ? '170px' : '30px'; ph.style.top = '-20px';
    c.appendChild(ph);
    const cam = ph.querySelector('.cam'), img = ph.querySelector('img');
    const sw = 438; // screen width
    const ih = sw * (sc.ratio || 950 / 585);
    cam.style.height = ih + 'px';
    (sc.hide || []).forEach((r) => { // hides the sample client's name
      const d = h('div', 'hide', r[4] ? '<span class="ic soft" style="width:' + (r[3] * ih * 0.7) + 'px;height:' + (r[3] * ih * 0.7) + 'px;font-size:18px">' + icon('user-round') + '</span>' + '<span style="font-size:' + Math.round(r[3] * ih * 0.36) + 'px">' + esc(r[4]) + '</span>' : '');
      d.style.cssText += ';left:' + r[0] * sw + 'px;top:' + r[1] * ih + 'px;width:' + r[2] * sw + 'px;height:' + r[3] * ih + 'px;';
      cam.appendChild(d);
    });
    const rings = (sc.rings || []).map((r) => {
      const d = h('div', 'ring');
      d.style.left = (r.box[0] * sw - 8) + 'px'; d.style.top = (r.box[1] * ih - 8) + 'px'; d.style.width = (r.box[2] * sw + 16) + 'px'; d.style.height = (r.box[3] * ih + 16) + 'px';
      cam.appendChild(d);
      ctx.act(d, 'hl', r.at, { dt: r.dt || 0, sfx: 'ding' });
      if (r.off != null) ctx.act(d, 'out', r.off, { sfx: null });
      ctx.tick((t) => { const t0 = at(s, r.at, r.dt || 0); if (t > t0 + 0.45) d.dataset.base = 'scale(' + (1 + 0.025 * Math.sin((t - t0) * 5)).toFixed(4) + ')'; });
      return d;
    });
    ctx.act(ph, 'rise', -1, { dt: 0.05, sfx: 'swish' });
    // camera: zooms toward a box of the screen ([x, y, w, h] in fractions), then back
    const Z = (sc.zoom || []).map((z) => ({ t: at(s, z.at, z.dt || 0), box: z.box, k: z.k || 1.7 }));
    Z.forEach((z) => { ctx.cue(z.t, z.box ? 'zoom' : 'swish', 0.7); breaks.push(z.t); });
    const sh = 732; // screen height
    ctx.tick((t) => {
      let cur = { k: 1, x: 0, y: 0 }, prev = cur, tz = -1;
      const target = (z) => { if (!z.box) return { k: 1, x: 0, y: 0 }; const cx = (z.box[0] + z.box[2] / 2) * sw, cy = (z.box[1] + z.box[3] / 2) * ih; const k = z.k; return { k, x: clamp(sw / 2 - cx * k, sw - sw * k, 0), y: clamp(sh / 2 - cy * k, sh - ih * k, 0) }; };
      for (const z of Z) { if (t >= z.t) { prev = cur; cur = target(z); tz = z.t; } }
      if (tz < 0) { cur = { k: 1, x: 0, y: Math.min(0, sc.scroll ? -sc.scroll * ih : 0) }; prev = cur; }
      const p = E.inout(clamp((t - tz) / 0.9));
      const k = prev.k + (cur.k - prev.k) * p, x = prev.x + (cur.x - prev.x) * p, y = prev.y + (cur.y - prev.y) * p;
      cam.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) scale(' + k.toFixed(4) + ')';
    });
    img.style.width = sw + 'px';
    // the path, as breadcrumbs
    const right = h('div', 'box crumbs'); right.style.left = side === 'off' ? '760px' : '560px'; right.style.right = side === 'off' ? '120px' : '0'; right.dataset.vc = 0;
    if (sc.head) { const hd = h('div', '', (sc.kicker ? '<div class="kicker">' + esc(sc.kicker) + '</div>' : '') + '<div class="h3" style="margin:12px 0 18px">' + rich(sc.head) + '</div>'); right.appendChild(hd); ctx.act(hd, 'rise', -1, { dt: 0.2 }); }
    (sc.crumbs || []).forEach((cb, i) => {
      const d = h('div', 'crumb card', '<span class="ic' + (cb.last ? '' : ' soft') + '">' + (cb.ic ? icon(cb.ic) : String(i + 1)) + '</span><span>' + rich(cb.t) + '</span>');
      right.appendChild(d);
      ctx.act(d, 'slideR', cb.at != null ? cb.at : i, { dt: cb.dt || 0, sfx: 'pop', gain: 0.8 });
    });
    c.appendChild(right);
  };

  T.sheet = (el, ctx, sc) => {
    const s = ctx.s;
    const side = sc.nuki || 'off';
    const c = contentBox(el, side === 'rs' ? 'off' : side);
    const land = !!sc.land;
    const ww = 1030, wh = 740;
    const wrap = h('div', 'sheetwrap'); wrap.style.cssText += ';left:10px;top:-20px;width:' + ww + 'px;height:' + wh + 'px';
    const pw = land ? 1684 : 1190, phh = land ? 1190 : 1684; // the page image's own size
    const cam = h('div', 'sheetcam', '<img src="' + ROOT + '/' + sc.img + '" width="' + pw + '" height="' + phh + '">');
    wrap.appendChild(cam);
    c.appendChild(wrap);
    // pen on the page
    (sc.fills || []).forEach((f) => {
      const d = h('div', 'ink' + (f[3] ? ' ' + f[3] : ''), esc(f[2]));
      d.style.left = f[0] / 100 * pw + 'px'; d.style.top = f[1] / 100 * phh + 'px';
      if (f[3] === 'is-box') d.dataset.base = 'translate(-40%,-60%)';
      if (f[3] === 'is-sig') d.dataset.base = 'rotate(-4deg)';
      cam.appendChild(d);
      ctx.act(d, 'ink', f[4] != null ? f[4] : 0, { dt: f[5] || 0, dur: 0.5, sfx: 'pen', gain: 0.35 });
    });
    const F = (sc.focus || []).map((f, k) => {
      const hl = h('div', 'hl'); const bx = f.x != null ? f.x : 7.6, bw2 = f.w != null ? f.w : 84.8;
      hl.style.left = bx / 100 * pw + 'px'; hl.style.top = f.box[0] / 100 * phh + 'px'; hl.style.width = bw2 / 100 * pw + 'px'; hl.style.height = f.box[1] / 100 * phh + 'px';
      cam.appendChild(hl);
      const t0 = at(s, f.at, f.dt || 0);
      ctx.act(hl, 'hl', null, { t: t0 + 0.6, sfx: null });
      const nx = sc.focus[k + 1];
      if (nx) ctx.act(hl, 'out', null, { t: at(s, nx.at, nx.dt || 0), sfx: null });
      ctx.cue(t0, 'zoom', 0.6); breaks.push(t0);
      return { t: t0, x: bx, w: bw2, top: f.box[0], hh: f.box[1], k: f.k };
    });
    const fit0 = ww / pw; // the whole width of the page
    const page = { k: Math.min(ww / pw, wh / phh), x: 0, y: 0 };
    page.x = (ww - pw * page.k) / 2; page.y = (wh - phh * page.k) / 2;
    const target = (f) => {
      const bw = f.w / 100 * pw, bh = f.hh / 100 * phh;
      let k = Math.min((ww - 50) / bw, (wh - 70) / bh, f.k || 9);
      k = Math.max(k, page.k);
      const cx = (f.x + f.w / 2) / 100 * pw, cy = (f.top + f.hh / 2) / 100 * phh;
      return { k, x: clamp(ww / 2 - cx * k, ww - pw * k, 0), y: clamp(wh / 2 - cy * k, wh - phh * k, 0) };
    };
    ctx.act(wrap, 'rise', -1, { dt: 0.05, sfx: 'paper' });
    const endT = sc.backAt != null ? at(s, sc.backAt) : null;
    if (endT) ctx.cue(endT, 'swish', 0.6);
    ctx.tick((t) => {
      let cur = page, prev = page, tz = -1;
      for (const f of F) if (t >= f.t) { prev = cur; cur = target(f); tz = f.t; }
      if (endT && t >= endT) { prev = cur; cur = page; tz = endT; }
      const p = E.inout(clamp((t - tz) / 1.0));
      const k = prev.k + (cur.k - prev.k) * p, x = prev.x + (cur.x - prev.x) * p, y = prev.y + (cur.y - prev.y) * p;
      cam.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) scale(' + k.toFixed(5) + ')';
    });
    // the side card: what this part is for
    const right = h('div', 'box'); right.style.left = (ww + 50) + 'px'; right.style.right = '0'; right.style.top = '-20px'; right.style.height = (side === 'rs' ? 400 : wh) + 'px';
    c.appendChild(right);
    if (sc.head) { const hd = h('div', '', (sc.kicker ? '<div class="kicker">' + esc(sc.kicker) + '</div>' : '') + '<div class="h3" style="margin-top:12px;font-size:46px">' + rich(sc.head) + '</div>'); right.appendChild(hd); ctx.act(hd, 'rise', -1, { dt: 0.2 }); }
    (sc.focus || []).forEach((f, k) => {
      if (!f.t) return;
      const card = h('div', 'card sidecard', '<span class="ic" style="width:70px;height:70px;font-size:34px;font-weight:800">' + (f.n != null ? f.n : k + 1) + '</span><h4>' + rich(f.t) + '</h4>' + (f.d ? '<p>' + rich(f.d) + '</p>' : ''));
      card.style.cssText += ';position:absolute;left:0;right:0;top:' + (sc.head ? 150 : 20) + 'px';
      right.appendChild(card);
      ctx.act(card, 'slideR', f.at, { dt: (f.dt || 0) + 0.35, sfx: 'pop', gain: 0.7 });
      const nx = sc.focus[k + 1];
      if (nx) ctx.act(card, 'out', nx.at, { dt: (nx.dt || 0), sfx: null });
      else if (sc.backAt != null) ctx.act(card, 'out', sc.backAt, { sfx: null });
    });
  };

  T.chat = (el, ctx, sc) => {
    const c = contentBox(el, sc.nuki || 'l');
    const top = head(c, ctx, sc);
    const box = h('div', 'box chat'); box.style.left = '0'; box.style.right = '0'; box.dataset.vc = top + 30;
    c.appendChild(box);
    sc.lines.forEach((ln, i) => {
      const b = h('div', 'bub ' + (ln.who === 'her' ? 'her' : 'me'), '<small>' + esc(ln.who === 'her' ? (sc.herName || 'Clienta') : (sc.meName || 'Tu')) + '</small>' + rich(ln.t));
      if (ln.small) b.style.fontSize = '32px';
      box.appendChild(b);
      ctx.act(b, ln.who === 'her' ? 'slideL' : 'slideR', ln.at != null ? ln.at : i, { dt: ln.dt || 0, sfx: ln.who === 'her' ? 'bubble2' : 'bubble' });
      if (ln.out != null) ctx.act(b, 'dim', ln.out, { sfx: null, to: 0.4 });
    });
  };

  T.rail = (el, ctx, sc) => { // the steps of a treatment, numbered, the current one lit
    const c = contentBox(el, sc.nuki || 'l');
    const top = head(c, ctx, sc);
    const box = h('div', 'box'); box.style.left = '0'; box.style.right = '0'; box.dataset.vc = top + 30;
    box.style.display = 'grid'; box.style.gridTemplateColumns = sc.items.length > 5 ? '1fr 1fr' : '1fr'; box.style.gap = '16px 20px';
    c.appendChild(box);
    sc.items.forEach((it, i) => {
      const d = h('div', 'rs card', '<span class="ic soft">' + (i + 1) + '</span><span>' + rich(it.t) + '</span>');
      if (sc.items.length > 5) d.style.fontSize = '30px';
      box.appendChild(d);
      const n = it.at != null ? it.at : i;
      ctx.act(d, 'rise', n, { dt: it.dt || 0, sfx: 'pop', gain: 0.75 });
      const ic = d.querySelector('.ic');
      ctx.act(ic, 'cls', n, { dt: (it.dt || 0) + 0.25, name: 'lit', sfx: null, dur: 0.01 });
    });
  };

  T.sessions = (el, ctx, sc) => {
    const c = contentBox(el, sc.nuki || 'l');
    const top = head(c, ctx, sc);
    const n = sc.dots == null ? 4 : sc.dots;
    const row = h('div', 'box dots'); row.style.left = '0'; row.style.top = (top + 120) + 'px';
    if (!n) row.style.display = 'none';
    c.appendChild(row);
    for (let i = 0; i < n; i++) {
      const last = sc.more && i === n - 1;
      const d = h('div', 'dot', last ? '…' : String(i + 1));
      if (last) { d.style.background = '#fff'; d.style.color = 'var(--teal)'; d.style.border = '4px solid var(--teal)'; }
      row.appendChild(d);
      ctx.act(d, 'pop', sc.dotsAt != null ? sc.dotsAt : 0, { dt: i * 0.18, sfx: 'pop', gain: 0.6 });
      if (i < n - 1) {
        const g = h('div', 'gap', '<span>' + esc((sc.gaps && (sc.gaps[i] || sc.gaps[sc.gaps.length - 1])) || '') + '</span><i></i>');
        row.appendChild(g);
        ctx.act(g, 'wipe', sc.dotsAt != null ? sc.dotsAt : 0, { dt: i * 0.18 + 0.1, sfx: null, dur: 0.5 });
      }
    }
    const facts = h('div', 'box'); facts.style.left = '0'; facts.style.right = '0'; facts.style.top = (top + 300) + 'px'; if (!n) facts.dataset.vc = top + 30;
    facts.style.display = 'flex'; facts.style.gap = '22px'; facts.style.flexWrap = 'wrap';
    (sc.facts || []).forEach((f, i) => {
      const d = h('div', 'card cardi', '<span class="ic">' + icon(f.ic || 'calendar-days') + '</span><span>' + esc(f.k) + '</span><b>' + rich(f.v) + '</b>');
      d.style.minWidth = '360px'; d.style.flex = '1';
      facts.appendChild(d);
      ctx.act(d, 'rise', f.at != null ? f.at : i + 1, { dt: f.dt || 0 });
    });
    c.appendChild(facts);
  };

  T.cards = (el, ctx, sc) => {
    const c = contentBox(el, sc.nuki || 'l');
    const top = head(c, ctx, sc);
    const box = h('div', 'box cards' + (sc.items.length <= 3 ? ' few' : ' row')); box.style.left = '0'; box.style.right = '0'; box.dataset.vc = top + 30;
    box.style.gridTemplateColumns = 'repeat(' + (sc.cols || Math.min(3, sc.items.length)) + ', 1fr)';
    c.appendChild(box);
    sc.items.forEach((it, i) => {
      const d = h('div', 'card cardi', '<span class="ic' + (it.soft ? ' soft' : '') + '">' + icon(it.ic || 'sparkles') + '</span><div><b>' + rich(it.t) + '</b>' + (it.s ? '<span>' + rich(it.s) + '</span>' : '') + '</div>');
      box.appendChild(d);
      ctx.act(d, 'pop', it.at != null ? it.at : i, { dt: it.dt || 0, gain: 0.85 });
      if (it.pick != null) { ctx.act(d, 'cls', it.pick, { name: 'picked', sfx: 'ding', dur: 0.01 }); }
      if (it.dim != null) ctx.act(d, 'dim', it.dim, { sfx: null });
    });
  };

  T.big = (el, ctx, sc) => {
    const c = contentBox(el, sc.nuki || 'l');
    const top = head(c, ctx, sc);
    const box = h('div', 'box', '<div class="big"><span class="num">' + esc(sc.from != null ? sc.from : sc.value) + '</span>' + (sc.suffix ? '<span style="font-size:.5em;letter-spacing:-.03em">' + esc(sc.suffix) + '</span>' : '') + '</div>' +
      (sc.label ? '<div class="h3" style="margin-top:30px;max-width:1100px">' + rich(sc.label) + '</div>' : '') + (sc.sub ? '<p class="lede" style="margin-top:20px;max-width:1100px">' + rich(sc.sub) + '</p>' : ''));
    box.style.left = '20px'; box.style.right = '0'; box.dataset.vc = top + 20;
    c.appendChild(box);
    const n = sc.at != null ? sc.at : -1;
    ctx.act(box.querySelector('.big'), 'pop', n, { dt: 0.1, sfx: 'pop2' });
    if (sc.from != null) ctx.act(box.querySelector('.num'), 'count', n, { dt: 0.2, from: sc.from, to: sc.value, sfx: 'count' });
    if (box.querySelector('.h3')) ctx.act(box.querySelector('.h3'), 'rise', n, { dt: 0.5 });
    if (box.querySelector('.lede')) ctx.act(box.querySelector('.lede'), 'rise', sc.subAt != null ? sc.subAt : 1);
  };

  T.contra = (el, ctx, sc) => {
    const c = contentBox(el, sc.nuki || 'l');
    const top = head(c, ctx, sc);
    const box = h('div', 'box cgrid'); box.style.left = '0'; box.style.right = '0'; box.dataset.vc = top + 26;
    const two = sc.items.length > 6;
    if (two) { box.style.display = 'grid'; box.style.gridTemplateColumns = '1fr 1fr'; box.style.gap = '12px 14px'; }
    c.appendChild(box);
    sc.items.forEach((t, i) => {
      const d = h('div', 'cchip', '<span class="ic dark">' + icon('x') + '</span><span>' + esc(t) + '</span>');
      if (two) { d.style.fontSize = '24px'; d.style.padding = '10px 16px 10px 10px'; d.style.lineHeight = '1.22'; d.querySelector('.ic').style.cssText = 'width:36px;height:36px'; }
      box.appendChild(d);
      ctx.act(d, 'pop', sc.at || 0, { dt: i * (sc.step || 0.16), sfx: i % 2 ? null : 'pop', gain: 0.5, dur: 0.45 });
    });
    if (sc.rule) {
      ctx.act(box, 'dim', sc.rule.at, { sfx: null, to: 0.12 });
      const r = h('div', 'box card note never', '<span class="ic" style="width:110px;height:110px">' + icon('hand') + '</span><div><div class="t">Regula</div><p style="font-size:46px">' + rich(sc.rule.t) + '</p></div>');
      r.style.left = '0'; r.style.right = '0'; r.dataset.vc = top + 26; r.style.padding = '44px 50px';
      c.appendChild(r);
      ctx.act(r, 'rise', sc.rule.at, { sfx: 'alert' });
    }
  };

  T.yn = (el, ctx, sc) => {
    const c = contentBox(el, sc.nuki || 'l');
    const top = head(c, ctx, sc);
    const box = h('div', 'box yn'); box.style.left = '0'; box.style.right = '0'; box.dataset.vc = top + 30;
    c.appendChild(box);
    sc.cols.forEach((col, i) => {
      const d = h('div', 'card ynb', '<h5><span class="ic ' + (col.dark ? 'dark' : '') + '" style="width:64px;height:64px">' + icon(col.ic || (i ? 'x' : 'check')) + '</span>' + rich(col.t) + '</h5>' + (col.items || []).map((x) => '<p>' + rich(x) + '</p>').join(''));
      if (col.dark) { d.style.background = '#10201e'; d.style.color = '#fff'; d.querySelectorAll('p').forEach((p) => { p.style.color = '#cfe3df'; }); }
      box.appendChild(d);
      ctx.act(d, i ? 'slideR' : 'slideL', col.at != null ? col.at : i, { dt: col.dt || 0 });
    });
  };

  T.compare = (el, ctx, sc) => { // two pictures, side by side (before / after)
    const c = contentBox(el, sc.nuki || 'l');
    const top = head(c, ctx, sc);
    const box = h('div', 'box'); box.style.left = '0'; box.style.right = '0'; box.style.top = (top + 30) + 'px'; box.style.display = 'flex'; box.style.gap = '30px';
    c.appendChild(box);
    sc.items.forEach((it, i) => {
      const d = h('div', 'card', '<div style="height:' + (sc.ih || 460) + 'px;border-radius:26px 26px 0 0;overflow:hidden;background:#eef5f4 url(' + ROOT + '/' + it.img + ') center/cover"></div><div style="padding:22px 28px;font-size:32px;font-weight:750">' + rich(it.t) + '</div>');
      d.style.flex = '1'; d.style.overflow = 'hidden';
      box.appendChild(d);
      ctx.act(d, i ? 'slideR' : 'slideL', it.at != null ? it.at : i, { dt: it.dt || 0, sfx: 'shutter' });
    });
  };

  // ---------------------------------------------------------------- nuki
  let nukiEl, poseImgs = {}, nukiSegs = [];
  function nukiBuild() {
    nukiEl = document.getElementById('nuki');
    const poses = new Set(['prezinta']);
    S.scenes.forEach((sc) => { if (sc.pose) poses.add(sc.pose); (sc.beats || []).forEach((b) => b.pose && poses.add(b.pose)); });
    poses.forEach((p) => { const im = h('img'); im.src = ROOT + '/brand_asset/mascota/ipostaze/' + p + '.webp'; im.style.opacity = 0; nukiEl.appendChild(im); poseImgs[p] = im; });
    // a segment per line: the pose and the side
    scenes.forEach((s) => {
      const side = s.sc.nuki || DEFAULT_SIDE[s.sc.type] || 'l';
      if (side === 'off') { nukiSegs.push({ t: s.t0, side: 'off', pose: null }); return; }
      let pose = s.sc.pose || 'prezinta';
      nukiSegs.push({ t: s.t0 + (s.sc.nukiIn || 0), side, pose: s.beats[0] ? (s.beats[0].b.pose || pose) : pose });
      s.beats.forEach((bt, i) => { if (i === 0) return; pose = bt.b.pose || pose; nukiSegs.push({ t: bt.t0 - 0.15, side, pose: bt.b.pose || (s.beats[i - 1].b.pose) || s.sc.pose || 'prezinta' }); });
    });
    // fix poses carried: a beat without pose keeps the last pose in the scene
    for (let i = 1; i < nukiSegs.length; i++) if (!nukiSegs[i].pose && nukiSegs[i].side !== 'off') nukiSegs[i].pose = nukiSegs[i - 1].pose || 'prezinta';
    nukiSegs = nukiSegs.filter((g, i) => i === 0 || g.side !== nukiSegs[i - 1].side || g.pose !== nukiSegs[i - 1].pose);
    nukiSegs.forEach((g, i) => { const p = nukiSegs[i - 1]; if (!p) return; if (g.side !== p.side) cues.push({ t: g.t, sfx: g.side === 'off' ? null : 'swish', gain: 0.4 }); else if (g.pose !== p.pose) cues.push({ t: g.t, sfx: 'blip', gain: 0.55 }); });
  }
  const DEFAULT_SIDE = { intro: 'r', outro: 'l', shot: 'off', sheet: 'off', map: 'off' };
  const SIDE_X = { l: 330, r: 1590, c: 960, rs: 1745 };
  const SIDE_K = { rs: 0.47 };
  function nukiAt(t) {
    let k = -1;
    for (let i = 0; i < nukiSegs.length; i++) if (nukiSegs[i].t <= t) k = i; else break;
    Object.values(poseImgs).forEach((im) => { im.style.opacity = 0; im.style.transform = ''; });
    if (k < 0) { nukiEl.style.opacity = 0; return 0; }
    const g = nukiSegs[k], p = nukiSegs[k - 1];
    const dt = t - g.t;
    let side = g.side, o = 1, dy = 0;
    if (p && p.side !== g.side && dt < 0.7) { // leaves one side, comes in on the other
      if (dt < 0.32 && p.side !== 'off') { side = p.side; const e = E.out(dt / 0.32); o = 1 - e; dy = e * 80; }
      else if (g.side !== 'off') { const e = E.out5(clamp((dt - 0.32) / 0.38)); o = e; dy = (1 - e) * 90; }
      else { o = 0; }
    }
    if (side === 'off') { nukiEl.style.opacity = 0; return 0; }
    const fl = Math.sin(t * 1.6) * 12, rot = Math.sin(t * 0.95) * 1.4;
    const x = SIDE_X[side] - 310, y = 1080 - 700 - 170;
    nukiEl.style.opacity = o.toFixed(3);
    nukiEl.style.transform = 'translate(' + x + 'px,' + (y + dy + fl).toFixed(2) + 'px) rotate(' + rot.toFixed(3) + 'deg) scale(' + (SIDE_K[side] || 1) + ')';
    const sh = nukiEl.querySelector('.shadow'); sh.style.transform = 'translateY(' + (-fl).toFixed(1) + 'px) scale(' + (1 - fl / 120).toFixed(3) + ')'; sh.style.opacity = (0.9 - fl / 60).toFixed(2);
    const cur = poseImgs[g.pose] || poseImgs.prezinta;
    const pp = p && p.side === g.side && p.pose !== g.pose ? poseImgs[p.pose] : null;
    const q = clamp(dt / 0.24);
    const flip = '';
    if (pp && q < 1) { pp.style.opacity = (1 - q).toFixed(3); pp.style.transform = flip + 'scale(' + (1 - 0.04 * q).toFixed(4) + ')'; }
    const sq = pp ? 0.94 + 0.06 * E.back(q) : 1;
    const talking = speaking(t) ? 1 + 0.006 * Math.sin(t * 11) : 1;
    cur.style.opacity = (pp ? q : 1).toFixed(3);
    cur.style.transform = flip + 'scale(' + (sq).toFixed(4) + ',' + (sq * talking).toFixed(4) + ')';
    return o > 0.5 ? 1 : 0;
  }
  function speaking(t) { for (const s of scenes) { if (t < s.t0 || t > s.t1) continue; for (const b of s.beats) if (t >= b.t0 && t <= b.t1) return true; } return false; }

  // ---------------------------------------------------------------- jerry: Nuki's little mouse friend, now and then
  // A scene with `jerry: { pose, at, x, say }` brings him in (small, at the bottom), with a short bubble.
  let jerryEl, jerryImgs = {}, jerrySegs = [];
  function jerryBuild() {
    jerryEl = document.getElementById('jerry');
    scenes.forEach((s) => {
      const j = s.sc.jerry; if (!j) return;
      const side = s.sc.nuki || DEFAULT_SIDE[s.sc.type] || 'l';
      const x = j.x != null ? j.x : side === 'l' ? 548 : side === 'r' ? 1372 : 1750;
      const t0 = at(s, j.at != null ? j.at : 0, j.dt || 0.4);
      const t1 = j.until != null ? at(s, j.until) : s.end - XF;
      const pose = j.pose || 'zambeste';
      if (!jerryImgs[pose]) { const im = h('img'); im.src = ROOT + '/brand_asset/mascota/soricel/ipostaze/' + pose + '.webp'; im.style.opacity = 0; jerryEl.appendChild(im); jerryImgs[pose] = im; }
      jerrySegs.push({ t0, t1, x, pose, say: j.say || '', flip: !!j.flip });
      cues.push({ t: t0, sfx: 'pop2', gain: 0.7 });
      if (j.say) cues.push({ t: t0 + 0.45, sfx: 'bubble', gain: 0.5 });
      breaks.push(t0);
    });
  }
  function jerryAt(t) {
    const g = jerrySegs.find((x) => t >= x.t0 - 0.01 && t < x.t1 + 0.4);
    Object.values(jerryImgs).forEach((im) => { im.style.opacity = 0; });
    if (!g) { jerryEl.style.opacity = 0; return; }
    const pin = clamp((t - g.t0) / 0.55), pout = clamp((t - g.t1) / 0.35);
    const k = (0.2 + 0.8 * E.back(pin)) * (1 - 0.8 * E.out(pout));
    const hop = Math.abs(Math.sin(t * 3.1)) * 7;
    jerryEl.style.opacity = (Math.min(1, pin * 3) * (1 - pout)).toFixed(3);
    jerryEl.style.transform = 'translate(' + (g.x - 110) + 'px,' + (910 - 250 - hop).toFixed(1) + 'px) scale(' + k.toFixed(4) + ')';
    const im = jerryImgs[g.pose]; im.style.opacity = 1; im.style.transform = g.flip ? 'scaleX(-1)' : '';
    const b = jerryEl.querySelector('.jb');
    if (g.say) { if (b.textContent !== g.say) b.textContent = g.say; const q = clamp((t - g.t0 - 0.45) / 0.35); b.style.opacity = (E.out(q) * (1 - pout)).toFixed(3); b.style.transform = 'translate(-80%,0) scale(' + (0.6 + 0.4 * E.back(q)).toFixed(3) + ')'; }
    else b.style.opacity = 0;
  }

  // ---------------------------------------------------------------- 3d logo
  let gl = null;
  async function glBuild() {
    if (!logoKeys.length) return;
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
    const canvas = document.getElementById('gl');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(W, H, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const cam = new THREE.OrthographicCamera(0, W, 0, -H, -2000, 2000);
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(-300, 500, 800); scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const gltf = await new GLTFLoader().loadAsync(ROOT + '/brand_asset/3dsvg.glb');
    const obj = gltf.scene;
    const box = new THREE.Box3().setFromObject(obj), size = new THREE.Vector3(), ctr = new THREE.Vector3();
    box.getSize(size); box.getCenter(ctr);
    obj.position.sub(ctr);
    const pivot = new THREE.Group(); pivot.add(obj); scene.add(pivot);
    const norm = 1 / Math.max(size.x, size.y);
    obj.traverse((m) => { if (m.isMesh) { m.material = new THREE.MeshStandardMaterial({ color: 0x17ae9f, metalness: 0.15, roughness: 0.28, side: THREE.DoubleSide, envMapIntensity: 1.1 }); } });
    gl = { renderer, scene, cam, pivot, norm, canvas };
  }
  function glAt(t) {
    if (!gl) return;
    const K = logoKeys;
    let a = null, b = null;
    for (let i = 0; i < K.length; i++) { if (K[i].t <= t) a = K[i]; if (K[i].t > t) { b = K[i]; break; } }
    let v;
    if (!a) v = Object.assign({}, K[0], { o: 0 }); else if (!b || b.t - a.t > 30 && t - a.t > 30) v = a; else {
      const p = E.inout(clamp((t - a.t) / (b.t - a.t)));
      v = {}; ['x', 'y', 's', 'ry', 'o'].forEach((k) => { v[k] = a[k] + (b[k] - a[k]) * p; });
    }
    if (a && b && a.o === 0 && b.o === 0) v.o = 0;
    gl.canvas.style.opacity = clamp(v.o).toFixed(3);
    if (v.o < 0.01) { if (gl.shown) { gl.renderer.clear(); gl.canvas.style.display = 'none'; gl.shown = false; } return; }
    if (!gl.shown) { gl.canvas.style.display = ''; gl.shown = true; }
    gl.pivot.position.set(v.x, -v.y, 0);
    const sc = v.s * gl.norm; gl.pivot.scale.set(sc, sc, sc);
    gl.pivot.rotation.set(Math.sin(t * 0.8) * 0.1, Math.PI / 2 + v.ry + Math.sin(t * 0.6) * 0.16, 0);
    gl.renderer.render(gl.scene, gl.cam);
  }

  // ---------------------------------------------------------------- build & seek
  function collectIcons() {
    const n = new Set(BUILTIN_ICONS);
    const walk = (o) => { if (!o || typeof o !== 'object') return; for (const k in o) { if ((k === 'ic' || k === 'icon') && typeof o[k] === 'string') n.add(o[k]); else walk(o[k]); } };
    walk(S);
    return n;
  }
  let capEl, capSpan, progI, chapEl, chapTxt;
  async function boot() {
    S = await (await fetch('../films/' + FILM + '/script.json', { cache: 'no-store' })).json();
    try { const r = await fetch('../films/' + FILM + '/timing.json', { cache: 'no-store' }); if (r.ok) TIM = await r.json(); } catch (e) { /* no voice yet: estimated */ }
    await loadIcons(collectIcons());
    document.fonts && await document.fonts.ready;
    timeline();
    const stage = document.getElementById('scenes');
    scenes.forEach((s) => {
      const el = h('div', 'scene'); el.dataset.type = s.sc.type;
      stage.appendChild(el); s.el = el;
      const ctx = ctxFor(s);
      (T[s.sc.type] || T.title)(el, ctx, s.sc, s);
      if (s.t1 - s.t0 > 17 && s.beats.length >= 2) {
        const mid = s.beats[Math.floor(s.beats.length / 2)].t0 - 0.1;
        s.punch = mid; breaks.push(mid); cues.push({ t: mid, sfx: 'zoom', gain: 0.5 });
      }
      el.style.display = 'block';
      el.querySelectorAll('[data-vc]').forEach((b) => { const a = +b.dataset.vc, hh = b.offsetHeight, room = 750 - a; b.style.top = (a + Math.max(0, (room - hh) * 0.46)) + 'px'; });
      el.style.display = 'none';
      if (s.si > 0) cues.push({ t: s.t0, sfx: 'whoosh', gain: 0.45 });
    });
    nukiBuild();
    jerryBuild();
    capEl = document.getElementById('cap'); capSpan = capEl.querySelector('span');
    progI = document.querySelector('#prog i'); chapEl = document.querySelector('#chap b');
    document.getElementById('ftitle').textContent = S.short || S.title.replace(/\*/g, '');
    await glBuild();
    // every picture decoded before the first frame
    await Promise.all([...document.images].map((im) => (im.decode ? im.decode().catch(() => {}) : null)));
    cues.sort((a, b) => a.t - b.t);
    window.film = {
      id: S.id, total, fps: 30,
      cues: cues.filter((c) => c.sfx && c.t >= 0 && c.t < total),
      beats: scenes.flatMap((s) => s.beats.map((b) => ({ key: b.key, t0: b.t0, dur: b.dur, text: b.b.tts || b.b.say }))),
      scenes: scenes.map((s) => ({ t0: s.t0, t1: s.t1, type: s.sc.type, side: s.sc.nuki || DEFAULT_SIDE[s.sc.type] || 'l' })),
      breaks: breaks.slice().sort((a, b) => a - b),
      jerry: jerrySegs.map((g) => ({ t0: g.t0, t1: g.t1, say: g.say })),
    };
    seek(0);
    window.ready = true;
  }

  function seek(t) {
    progI.style.width = (clamp(t / total) * 100).toFixed(3) + '%';
    // scenes: the one on screen, the one coming in
    let chap = '';
    scenes.forEach((s, i) => {
      const vis = t >= s.t0 - 0.02 && t < s.end;
      s.el.style.display = vis ? 'block' : 'none';
      if (!vis) return;
      if (t >= s.t0) chap = s.sc.chap || chap;
      let o = 1, x = 0, b = 0;
      const pin = clamp((t - s.t0) / XF);
      if (i > 0 && pin < 1) { const e = E.out5(pin); o = e; x = (1 - e) * 70; b = (1 - e) * 10; }
      const nx = scenes[i + 1];
      if (nx && t > nx.t0) { const e = E.out(clamp((t - nx.t0) / XF)); o *= 1 - e; x -= e * 70; b += e * 8; }
      let k = 1;
      if (s.punch) { const q = E.inout(clamp((t - s.punch) / 0.7)); k = 1 + 0.035 * q; }
      s.el.style.opacity = o.toFixed(3); s.el.style.transform = 'translateX(' + x.toFixed(2) + 'px)' + (k !== 1 ? ' scale(' + k.toFixed(4) + ')' : ''); s.el.style.filter = b > 0.05 ? 'blur(' + b.toFixed(2) + 'px)' : '';
      s.ticks.forEach((fn) => fn(t));
    });
    apply(t);
    // chapter label
    const cs = scenes.filter((s) => s.t0 <= t).map((s) => s.sc.chap).filter(Boolean);
    const ch = cs.length ? cs[cs.length - 1] : (S.chap || '');
    if (ch !== chapTxt) { chapTxt = ch; chapEl.textContent = ch; }
    document.getElementById('chap').style.opacity = ch ? 1 : 0;
    // caption: the line being said
    let cap = null, co = 0;
    for (const s of scenes) for (const bt of s.beats) {
      if (t >= bt.t0 - 0.12 && t <= bt.t1 + 0.18) { cap = bt; co = Math.min(clamp((t - bt.t0 + 0.12) / 0.16), clamp((bt.t1 + 0.18 - t) / 0.16)); }
    }
    if (cap) { const txt = plain(cap.b.cap || cap.b.say); if (capSpan.textContent !== txt) capSpan.textContent = txt; capEl.style.opacity = co.toFixed(3); } else capEl.style.opacity = 0;
    const nk = nukiAt(t);
    jerryAt(t);
    glAt(t);
    return nk;
  }

  window.seek = seek;
  window.addEventListener('load', () => { boot().catch((e) => { window.bootError = String(e && e.stack || e); console.error(e); }); });
})();
