// Centrul360 reels: the engine. A reel is scripts/<id>/script.json (scenes of beats: one spoken line each) plus
// scripts/<id>/timing.json (each line's voice length, from voice.py). 1080×1920, every frame a pure function of the
// time: window.seek(t) draws the frame at t, render.cjs steps through it frame by frame, window.film.cues feeds mix.py.
// Built on the ideas of the Academy engine (academy-vsl/src/engine/engine.js), redrawn for vertical, fast reels:
// the hook lands on frame 0 with a hit, captions go word by word, a cut or a visual change every 2-4 s.
(function () {
  'use strict';
  const W = 1080, H = 1920;
  const SAFE = { l: 60, r: 920, t: 220, b: 1540 }; // the apps' own UI covers the rest
  const AREA = { x: 60, y: 320, w: 860, h: 640 }; // the visual zone (#scenes)
  const PRES = { cx: 490, top: 1236, k: 0.5 }; // Nuki presenting, under the captions
  const GAP = 0.12, LEAD = 0.06, TAIL = 0.12, XF = 0.22, END_HOLD = 1.6;
  const qs = new URLSearchParams(location.search);
  const ID = qs.get('reel');
  const ROOT = '../..'; // the website root (reels/engine → /)
  if (qs.get('debug')) document.documentElement.classList.add('debug');
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const E = {
    out: (p) => 1 - Math.pow(1 - p, 3),
    out5: (p) => 1 - Math.pow(1 - p, 5),
    inout: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    back: (p) => { const c1 = 1.7, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');
  const plain = (s) => String(s || '').replace(/\*/g, '');
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const rnd = (i, k = 1) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

  // ---------------------------------------------------------------- icons (lucide-static)
  const ICONS = {};
  async function loadIcons(names) {
    await Promise.all([...names].map(async (n) => { try { const r = await fetch('node_modules/lucide-static/icons/' + n + '.svg'); if (r.ok) ICONS[n] = (await r.text()).replace(/<!--[\s\S]*?-->/g, ''); } catch (e) { /* missing */ } }));
  }
  const icon = (n) => ICONS[n] || ICONS.sparkles || '';
  const BUILTIN = ['check', 'x', 'sparkles', 'message-circle', 'send', 'user-round', 'circle-help', 'lightbulb', 'zap', 'list-ordered', 'camera', 'smile', 'heart', 'arrow-up'];
  const RUBRIC = { mit: ['MIT SAU ADEVĂR?', 'circle-help'], fapt: ['CE SE ÎNTÂMPLĂ DE FAPT', 'zap'], intrebare: ['ÎNTREBAREA ZILEI', 'message-circle'],
    caz: ['CAZ REAL', 'camera'], rezultate: ['REZULTATE REALE', 'camera'], nuki: ['NUKI', 'smile'], top3: ['TOP 3', 'list-ordered'] };

  // ---------------------------------------------------------------- state
  let S, TIM = {}, total = 0;
  const pulses = [];
  const scenes = [], acts = [], cues = [], breaks = [];
  const states = new Map();
  const st = (el) => { let s = states.get(el); if (!s) { s = { o: 1, x: 0, y: 0, s: 1, sx: null, blur: 0, clip: null }; states.set(el, s); } return s; };

  function estimate(text) { return Math.max(1.0, plain(text).length / 15.5); }
  function timeline() {
    let t = 0;
    S.scenes.forEach((sc, si) => {
      const s = { sc, si, t0: t, beats: [], ticks: [] };
      t += sc.lead != null ? sc.lead : (si === 0 ? 0.08 : LEAD);
      (sc.beats || []).forEach((b, bi) => {
        const k = si + '.' + bi, tm = TIM[k], text = b.tts || b.say;
        const dur = tm && tm.text === text ? tm.dur : estimate(text);
        s.beats.push({ b, key: k, t0: t, t1: t + dur, dur, text });
        t += dur + GAP + (b.hold || 0);
      });
      if (!s.beats.length) t += sc.dur || 2;
      t += sc.tail != null ? sc.tail : (sc.type === 'end' ? END_HOLD : TAIL);
      s.t1 = t;
      scenes.push(s);
    });
    total = t + 0.2;
    scenes.forEach((s, i) => { s.end = i < scenes.length - 1 ? scenes[i + 1].t0 + XF : total; });
  }
  function at(s, n, dt = 0) { // n = beat index (1.5 = halfway through beat 1), -1 = the scene's start
    if (n == null || n < 0) return s.t0 + 0.04 + dt;
    const i = Math.floor(n), f = n - i;
    if (i >= s.beats.length) return s.t1 - 0.3 + dt;
    return s.beats[i].t0 + f * s.beats[i].dur + dt;
  }

  const DUR = { rise: 0.45, pop: 0.42, slam: 0.32, fade: 0.3, out: 0.3, slideR: 0.45, slideL: 0.45, wipe: 0.5, grow: 0.5, stamp: 0.34 };
  const SFX = { rise: 'soft', pop: 'pop', slam: 'pop2', slideR: 'swish', slideL: 'swish', wipe: 'swish', stamp: 'hit' };
  const FX = {
    fade: (s, p) => { s.o *= E.out(p); },
    rise: (s, p) => { const e = E.out5(p); s.o *= clamp(p * 2.2); s.y += (1 - e) * 60; s.blur += (1 - e) * 8; },
    pop: (s, p) => { s.o *= clamp(p * 3); s.s *= 0.4 + 0.6 * E.back(p); },
    bump: (s, p) => { s.s *= 1 + 0.09 * Math.sin(Math.PI * p); s.y -= 10 * Math.sin(Math.PI * p); },
    slam: (s, p) => { const e = E.out5(p); s.o *= clamp(p * 4); s.s *= 1 + (1 - e) * 0.9; s.blur += (1 - e) * 6; },
    stamp: (s, p) => { const e = E.out5(p); s.o *= clamp(p * 5); s.s *= 1 + (1 - e) * 1.6; s.blur += (1 - e) * 10; },
    slideR: (s, p) => { const e = E.out5(p); s.o *= clamp(p * 2.5); s.x += (1 - e) * 160; s.blur += (1 - e) * 6; },
    slideL: (s, p) => { const e = E.out5(p); s.o *= clamp(p * 2.5); s.x -= (1 - e) * 160; s.blur += (1 - e) * 6; },
    out: (s, p) => { const e = E.out(p); s.o *= 1 - e; s.s *= 1 - 0.08 * e; },
    wipe: (s, p) => { s.clip = Math.min(s.clip == null ? 100 : s.clip, (1 - E.inout(p)) * 100); },
    grow: (s, p) => { s.sx = (s.sx == null ? 1 : s.sx) * E.out5(p); },
    dim: (s, p, a) => { s.o *= 1 - (1 - (a.to != null ? a.to : 0.35)) * E.out(p); },
  };
  const DIRECT = { cls: (a, p) => a.el.classList.toggle(a.name, p > 0) };
  function ctxFor(s) {
    return {
      s, at: (n, dt) => at(s, n, dt),
      act(el, fx, n, o = {}) {
        if (!el) return;
        const t0 = o.t != null ? o.t : at(s, n, o.dt || 0);
        const a = Object.assign({ el, fx, dur: DUR[fx] || 0.45 }, o, { t0 });
        acts.push(a);
        const sfx = o.sfx === undefined ? SFX[fx] : o.sfx;
        if (sfx) cues.push({ t: t0 + (o.sfxDt || 0), sfx, gain: o.gain != null ? o.gain : 1 });
        if (!o.noBreak) breaks.push(t0);
        return a;
      },
      cue: (t, sfx, gain = 1) => cues.push({ t, sfx, gain }),
      tick: (fn) => s.ticks.push(fn),
    };
  }
  function apply(t) {
    for (const s of states.values()) { s.o = 1; s.x = 0; s.y = 0; s.s = 1; s.sx = null; s.blur = 0; s.clip = null; }
    for (const a of acts) {
      const p = clamp((t - a.t0) / a.dur);
      if (DIRECT[a.fx]) { DIRECT[a.fx](a, p, t); continue; }
      FX[a.fx](st(a.el), p, a);
    }
    for (const [el, s] of states) {
      const base = el.dataset.base || '';
      const tr = (s.x || s.y ? 'translate(' + s.x.toFixed(2) + 'px,' + s.y.toFixed(2) + 'px) ' : '') + (s.s !== 1 ? 'scale(' + s.s.toFixed(4) + ') ' : '') + (s.sx != null ? 'scaleX(' + s.sx.toFixed(4) + ')' : '');
      el.style.transform = (base + ' ' + tr).trim();
      el.style.opacity = s.o.toFixed(3);
      el.style.filter = s.blur > 0.05 ? 'blur(' + s.blur.toFixed(2) + 'px)' : '';
      el.style.clipPath = s.clip != null && s.clip > 0.01 ? 'inset(-20% ' + s.clip.toFixed(2) + '% -20% -2%)' : '';
      el.style.visibility = s.o < 0.002 ? 'hidden' : '';
    }
  }

  // words of a title, each its own span (the *accent* in Fraunces)
  function words(text) {
    const tk = [];
    String(text).split(/(\*[^*]+\*)/).forEach((seg) => {
      if (!seg) return;
      const acc = /^\*.*\*$/.test(seg);
      seg.replace(/\*/g, '').split(/\s+/).forEach((w) => { if (!w) return; if (/^[?!.,:]+$/.test(w) && tk.length) tk[tk.length - 1].w += w; else tk.push({ w, acc }); });
    });
    return tk.map((x) => '<span class="w' + (x.acc ? ' acc' : '') + '">' + esc(x.w) + '</span>').join(' ');
  }
  // largest font size (px) that keeps el inside w×h
  function fit(el, w, hh, max, min = 30) {
    let f = max;
    el.style.fontSize = f + 'px';
    while (f > min && (el.scrollWidth > w + 1 || el.offsetHeight > hh || [...el.querySelectorAll('.w')].some((x) => x.offsetWidth > w))) { f -= 2; el.style.fontSize = f + 'px'; }
    return f;
  }
  function place(el, x, y) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
  // stack: lays boxes top to bottom inside the area, centred vertically, with gaps
  function stack(c, els, gap, top = 0, bottom = AREA.h) {
    const hs = els.map((e) => e.offsetHeight);
    const sum = hs.reduce((a, b) => a + b, 0) + gap * (els.length - 1);
    let y = top + Math.max(0, (bottom - top - sum) / 2);
    els.forEach((e, i) => { e.style.top = y + 'px'; y += hs[i] + gap; });
  }

  // ---------------------------------------------------------------- scene types (inside the 860×640 area)
  const T = {};

  // the hook: on screen from frame 0, a hit on the first word, every word slams in, the camera punches in
  T.hook = (el, ctx, sc) => {
    const s = ctx.s;
    const parts = [];
    let kick = null;
    if (sc.kicker) { kick = h('div', 'box', '<span class="kicker">' + esc(sc.kicker) + '</span>'); kick.style.left = '0'; kick.style.right = '0'; kick.style.textAlign = 'center'; el.appendChild(kick); parts.push(kick); }
    const ttl = h('div', 'box ttl', words(sc.title)); ttl.style.left = '30px'; ttl.style.width = (AREA.w - 60) + 'px'; ttl.style.textAlign = 'center';
    el.appendChild(ttl); parts.push(ttl);
    let img = null;
    if (sc.img) {
      img = h('div', 'frame'); img.style.position = 'absolute';
      el.appendChild(img); parts.push(img);
    }
    const imgH = sc.img ? 400 : 0;
    fit(ttl, AREA.w - 60, (AREA.h - (kick ? 100 : 0) - (sc.img ? imgH + 40 : 0)), sc.img ? 110 : 150, 50);
    if (img) {
      img.style.width = AREA.w + 'px'; img.style.height = imgH + 'px'; img.style.position = 'absolute'; img.style.left = '0';
      // one half of a catalog photo (l = before), as a crop on the face area
      const im = h('img'); im.src = ROOT + '/' + sc.img; img.appendChild(im);
      im.onload = null;
      img.dataset.src = sc.img;
      img.dataset.half = sc.half || 'l';
    }
    stack(el, parts, 26);
    const t0 = 0;
    if (kick) ctx.act(kick, 'slam', null, { t: s.t0 - 0.3, sfx: null, dur: 0.25 });
    const ws = [...ttl.querySelectorAll('.w')];
    // the first word is already there on frame 0 (thumbnail), the rest slam in on the voice
    // the whole title is there on frame 0 (a striking first frame and the thumbnail); each word then jumps when it is said
    const hb = s.beats[0];
    ws.forEach((w, i) => {
      ctx.act(w, 'slam', null, { t: s.t0 - 0.4, sfx: null, noBreak: true });
      const tw = hb ? hb.t0 + (hb.dur * 0.8) * (i / Math.max(1, ws.length)) : s.t0 + i * 0.15;
      ctx.act(w, 'bump', null, { t: tw, dur: 0.32, sfx: i === 0 ? null : (i % 2 ? 'pop' : 'pop2'), gain: 0.5 });
    });
    if (img) { ctx.act(img, 'fade', null, { t: s.t0 - 0.3, sfx: null }); ctx.cue(s.t0 + 0.02, 'shutter', 0.6); }
    ctx.cue(s.t0 + 0.0, 'hit', 1.0); ctx.cue(s.t0 + 0.0, 'whoosh', 0.6);
    s.punch0 = s.t0; // camera punch-in on the first frames
    s.imgEl = img;
  };

  // a stamp: MIT / ADEVĂR / PE JUMĂTATE, slammed with a hit and a shake
  T.stamp = (el, ctx, sc) => {
    const s = ctx.s;
    const col = sc.tone === 'good' ? 'var(--good)' : sc.tone === 'half' ? '#f2a100' : 'var(--bad)';
    const box = h('div', 'box', '<span class="stamp" style="color:' + col + '">' + esc(sc.word) + '</span>'); box.style.left = '0'; box.style.right = '0'; box.style.textAlign = 'center';
    el.appendChild(box);
    const parts = [box];
    let sub = null;
    if (sc.sub) { sub = h('div', 'box sub', rich(sc.sub)); sub.style.left = '0'; sub.style.right = '0'; sub.style.textAlign = 'center'; el.appendChild(sub); parts.push(sub); }
    stack(el, parts, 40);
    const sp = box.querySelector('.stamp'); sp.dataset.base = 'rotate(-7deg)';
    ctx.act(sp, 'stamp', null, { t: s.t0 + 0.05, sfx: 'hit', gain: 0.9 });
    ctx.cue(s.t0 + 0.06, sc.tone === 'good' ? 'ding' : 'alert', 0.7);
    if (sub) ctx.act(sub, 'rise', 0, { dt: 0.55 });
    s.shake = s.t0 + 0.12;
  };

  // cards: a list of 1-4 facts, each can be ✓ (ok) or ✗ (x, struck through)
  T.cards = (el, ctx, sc) => {
    const parts = [];
    if (sc.head) { const hd = h('div', 'box head', rich(sc.head)); hd.style.left = '14px'; hd.style.right = '14px'; el.appendChild(hd); parts.push(hd); ctx.act(hd, 'rise', -1, { dt: 0.02 }); }
    const n = sc.items.length;
    sc.items.forEach((it, i) => {
      const d = h('div', 'box card item' + (it.x ? ' x' : ''), '<span class="ic">' + icon(it.ic || 'sparkles') + '</span><div><b>' + rich(it.t) + '</b>' + (it.s ? '<small>' + rich(it.s) + '</small>' : '') + '</div>' +
        (it.ok ? '<span class="badge ok">' + icon('check') + '</span>' : '') + (it.x ? '<span class="badge no">' + icon('x') + '</span>' : ''));
      d.style.left = '14px'; d.style.width = (AREA.w - 48) + 'px';
      if (n >= 3) { d.style.padding = '20px 30px 20px 20px'; d.querySelector('.ic').style.cssText = 'width:92px;height:92px'; d.querySelector('b').style.fontSize = '46px'; }
      el.appendChild(d); parts.push(d);
      const nn = it.at != null ? it.at : i;
      ctx.act(d, i % 2 ? 'slideL' : 'slideR', nn, { dt: it.dt || 0, sfx: 'pop', gain: 0.8 });
      const bd = d.querySelector('.badge');
      if (bd) ctx.act(bd, 'pop', nn, { dt: (it.dt || 0) + 0.3, sfx: it.x ? 'alert' : 'check', gain: 0.55 });
      if (it.x) {
        const sk = h('i', 'strike'); d.appendChild(sk);
        d._strike = sk;
        ctx.act(sk, 'grow', nn, { dt: (it.dt || 0) + 0.35, sfx: null, dur: 0.35 });
      }
    });
    stack(el, parts, n >= 3 ? 26 : 34);
    parts.forEach((d) => { if (d._strike) { const b = d.querySelector('b'); d._strike.style.width = (b.offsetWidth + 20) + 'px'; d._strike.style.left = (b.offsetLeft - 10) + 'px'; d._strike.style.top = (b.offsetTop + b.offsetHeight / 2 - 3) + 'px'; } });
  };

  // big: a number (value + suffix) or a short phrase, slammed
  T.big = (el, ctx, sc) => {
    const parts = [];
    let main;
    if (sc.value != null) { main = h('div', 'box bignum', esc(sc.value) + (sc.suffix ? '<small>' + esc(sc.suffix) + '</small>' : '')); }
    else { main = h('div', 'box ttl', words(sc.text)); }
    main.style.left = '0'; main.style.width = AREA.w + 'px'; main.style.textAlign = 'center';
    el.appendChild(main); parts.push(main);
    if (sc.value == null) fit(main, AREA.w - 40, 460, 140, 60); else fit(main, AREA.w - 80, 330, 280, 120);
    let lab = null;
    if (sc.label) { lab = h('div', 'box sub', rich(sc.label)); lab.style.left = '0'; lab.style.right = '0'; lab.style.textAlign = 'center'; el.appendChild(lab); parts.push(lab); }
    stack(el, parts, sc.value != null ? 50 : 30);
    if (sc.value != null) ctx.act(main, 'slam', -1, { dt: 0.03, sfx: 'hit', gain: 0.6 });
    else main.querySelectorAll('.w').forEach((w, i) => ctx.act(w, 'slam', -1, { dt: 0.03 + i * 0.12, sfx: i ? 'pop' : 'pop2', gain: 0.5 }));
    if (lab) ctx.act(lab, 'rise', sc.labelAt != null ? sc.labelAt : 0, { dt: 0.4 });
  };

  // a real catalog photo (before | after, as published with the client's consent), optionally revealed from the "before" half
  T.photo = (el, ctx, sc) => {
    const s = ctx.s;
    const fr = h('div', 'frame'); const im = h('img'); im.src = ROOT + '/' + sc.img; fr.appendChild(im); el.appendChild(fr);
    const lab = h('div', 'box', '<span class="chip acc">' + icon('camera') + esc(sc.label || 'Caz real') + '</span>'); lab.style.left = '0'; lab.style.right = '0'; lab.style.textAlign = 'center'; el.appendChild(lab);
    const note = sc.note ? h('div', 'box note', esc(sc.note)) : null;
    if (note) { note.style.left = '20px'; note.style.right = '20px'; el.appendChild(note); }
    s.photo = { fr, im, lab, note, sc };
    ctx.act(fr, 'rise', -1, { dt: 0.02, sfx: 'shutter', gain: 0.8 });
    ctx.act(lab, 'pop', -1, { dt: 0.3, sfx: 'pop', gain: 0.6 });
    if (note) ctx.act(note, 'fade', -1, { dt: 0.5, sfx: null });
    if (sc.reveal != null) { const tr = at(s, sc.reveal); s.photo.tr = tr; ctx.cue(tr, 'whoosh', 0.8); ctx.cue(tr + 0.35, 'shimmer', 0.8); breaks.push(tr); }
  };

  // the mechanism, drawn top to bottom: the applicator, the skin, fat, SMAS, muscle; focused points; collagen; the lift
  T.layers = (el, ctx, sc) => {
    const s = ctx.s;
    const bw = AREA.w, bh = 540, top = 100; // the drawing, under a row for the chip
    const box = h('div', 'box'); place(box, 0, top); box.style.width = bw + 'px'; box.style.height = bh + 'px';
    el.appendChild(box);
    const air = 120;
    const L = [['PIELE', 110, '#f6dccf'], ['GRĂSIME', 150, '#fcefc8'], ['SMAS', 60, '#efc3b0'], ['MUȘCHI', bh - air - 320, '#f0c4bf']];
    let y = air;
    const bands = {};
    let svg = '<svg width="' + bw + '" height="' + bh + '" style="position:absolute;inset:0;overflow:visible"><defs><clipPath id="lc' + s.si + '"><rect x="0" y="' + air + '" width="' + bw + '" height="' + (bh - air) + '" rx="34"/></clipPath></defs><g clip-path="url(#lc' + s.si + ')" class="tissue">';
    L.forEach(([n, hh, col]) => { svg += '<rect x="0" y="' + y + '" width="' + bw + '" height="' + hh + '" fill="' + col + '"/>'; bands[n] = [y, hh]; y += hh; });
    for (let i = 0; i < 6; i++) { const yy = bands['MUȘCHI'][0] + 16 + i * 14; svg += '<path d="M0 ' + yy + ' C ' + bw * 0.3 + ' ' + (yy - 7) + ', ' + bw * 0.6 + ' ' + (yy + 7) + ', ' + bw + ' ' + yy + '" stroke="#e2aaa3" stroke-width="3" fill="none"/>'; }
    for (let i = 0; i < 18; i++) { const r = 15 + rnd(i) * 9, x = 30 + rnd(i, 2) * (bw - 60), yy = bands['GRĂSIME'][0] + 22 + rnd(i, 3) * (150 - 44); svg += '<circle cx="' + x + '" cy="' + yy + '" r="' + r + '" fill="#f7e2a3" stroke="#ebcd85" stroke-width="3"/>'; }
    // collagen fibres (drawn later)
    for (let i = 0; i < 5; i++) { const yy = bands['PIELE'][0] + 30 + i * 16; svg += '<path class="fib" pathLength="1" d="M180 ' + yy + ' C ' + bw * 0.3 + ' ' + (yy - 14) + ', ' + bw * 0.55 + ' ' + (yy + 14) + ', ' + (bw - 60) + ' ' + yy + '" stroke="var(--teal)" stroke-width="5" stroke-linecap="round" fill="none" style="stroke-dasharray:1 1;stroke-dashoffset:1;opacity:.9"/>'; }
    svg += '<rect class="smas" x="0" y="' + bands.SMAS[0] + '" width="' + bw + '" height="60" fill="none" stroke="var(--acc)" stroke-width="8" style="opacity:0"/>';
    svg += '</g></svg>';
    box.innerHTML = svg;
    Object.entries(bands).forEach(([n, [yy, hh]]) => { const lab = h('div', '', esc(n)); lab.style.cssText = 'position:absolute;left:26px;top:' + (yy + hh / 2 - 16) + 'px;font-size:26px;font-weight:850;letter-spacing:.14em;color:rgba(15,26,25,.5)'; box.appendChild(lab); });
    const cx = bw * 0.56, fy = bands.SMAS[0] + 30;
    // the applicator
    const ap = h('div'); ap.style.cssText = 'position:absolute;left:' + (cx - 120) + 'px;top:10px;width:240px;height:96px;border-radius:30px 30px 16px 16px;background:linear-gradient(180deg,#fff,#e7f4f2);border:4px solid var(--teal);box-shadow:0 20px 30px -16px rgba(13,127,115,.6)';
    ap.innerHTML = '<div style="position:absolute;left:50%;top:-46px;width:56px;height:50px;margin-left:-28px;border-radius:20px 20px 0 0;background:#fff;border:4px solid var(--teal);border-bottom:0"></div>';
    box.appendChild(ap);
    const waves = [];
    for (let i = 0; i < 4; i++) { const w = h('div'); w.style.cssText = 'position:absolute;left:' + (cx - 110) + 'px;width:220px;height:60px;border-radius:50%;border:5px solid var(--teal);border-top-color:transparent;border-left-color:transparent;border-right-color:transparent;opacity:0'; box.appendChild(w); waves.push(w); }
    const pts = [];
    for (let i = 0; i < 7; i++) { const d = h('div'); const x = cx - 210 + i * 70; d.style.cssText = 'position:absolute;left:' + (x - 14) + 'px;top:' + (fy - 14) + 'px;width:28px;height:28px;border-radius:50%;background:#ff7a45;box-shadow:0 0 0 10px rgba(255,122,69,.28)'; box.appendChild(d); pts.push(d); }
    // the chip row
    const chips = (sc.chips || []).map((c) => { const d = h('div', 'box', '<span class="chip acc">' + esc(c.t) + '</span>'); d.style.left = '0'; d.style.right = '0'; d.style.top = '0'; d.style.textAlign = 'center'; el.appendChild(d); return { d, c }; });
    chips.forEach(({ d, c }, i) => { ctx.act(d, 'pop', c.at, { dt: 0.05, sfx: 'pop', gain: 0.6 }); const nx = chips[i + 1]; if (nx) ctx.act(d, 'out', nx.c.at, { dt: -0.05, sfx: null, dur: 0.15, noBreak: true }); });
    ctx.act(box, 'rise', -1, { dt: 0.0, sfx: 'swish' });
    ctx.act(ap, 'pop', sc.apAt != null ? sc.apAt : -1, { dt: 0.25, sfx: 'pop2' });
    const tOn = at(s, sc.waveAt != null ? sc.waveAt : 0, 0.1), tHit = at(s, sc.hitAt != null ? sc.hitAt : 1), tSm = at(s, sc.smasAt != null ? sc.smasAt : 2), tLift = at(s, sc.liftAt != null ? sc.liftAt : 3);
    ctx.cue(tOn, 'riser', 0.5); breaks.push(tOn, tHit, tSm, tLift);
    pts.forEach((d, i) => ctx.act(d, 'pop', null, { t: tHit + i * 0.09, sfx: i % 2 ? null : 'pop', gain: 0.45, dur: 0.35, noBreak: true }));
    ctx.cue(tSm, 'ding', 0.7); ctx.cue(tLift, 'shimmer', 0.8);
    const smas = box.querySelector('.smas'), fibs = [...box.querySelectorAll('.fib')], tissue = box.querySelector('.tissue');
    ctx.tick((t) => {
      waves.forEach((w, i) => { const ph = ((t - tOn) * 1.1 + i / waves.length) % 1; const yy = 100 + ph * (fy - 110); w.style.top = (yy - 30) + 'px'; w.style.transform = 'scale(' + (1 - ph * 0.7).toFixed(3) + ')'; w.style.opacity = t >= tOn ? (Math.sin(ph * Math.PI) * 0.9).toFixed(3) : 0; });
      const sm = clamp((t - tSm) / 0.4); smas.style.opacity = (sm * (0.65 + 0.35 * Math.sin(t * 6))).toFixed(3);
      const lf = E.inout(clamp((t - tLift) / 1.4));
      fibs.forEach((f, i) => { f.style.strokeDashoffset = String(1 - E.inout(clamp((t - tLift - i * 0.12) / 0.9))); });
      tissue.style.transform = 'translateY(' + (-12 * lf).toFixed(2) + 'px)';
      pts.forEach((d, i) => { d.style.boxShadow = '0 0 0 ' + (10 + 6 * Math.sin(t * 6 + i)).toFixed(1) + 'px rgba(255,122,69,.25)'; d.style.marginTop = (-12 * lf).toFixed(1) + 'px'; });
    });
  };

  // where Nuki stands on a stage scene (area coordinates); the area grows down to 920 px there (captions go lower)
  function stagePl(s) {
    const AH = s.low ? 920 : AREA.h, top = s.stage ? s.stage.top : 0;
    if (s.sc.anim === 'crunch') { const k = 0.72; return { k, x: 520 - 690 * k / 2, y: AH - 747 * k - 30, AH }; }
    const k = Math.min(0.8, (AH - top - 30) / 747);
    return { k, x: AREA.w / 2 - 690 * k / 2, y: top + (AH - top - 747 * k) / 2, AH };
  }
  // stage: Nuki is the star, big in the area (sketches). anim: crunch (sit-ups, a counter), jump (confetti)
  T.stage = (el, ctx, sc) => {
    const s = ctx.s;
    let hdrH = 0;
    if (sc.title) { const tt = h('div', 'box ttl', words(sc.title)); tt.style.left = '0'; tt.style.width = AREA.w + 'px'; tt.style.textAlign = 'center'; tt.style.top = '0'; el.appendChild(tt); fit(tt, AREA.w, 120, 100, 50); hdrH = tt.offsetHeight + 20;
      tt.querySelectorAll('.w').forEach((w, i) => { ctx.act(w, 'slam', null, { t: s.t0 + (s.si === 0 ? -0.4 : 0.1 + i * 0.12), sfx: null, noBreak: true }); if (s.si === 0) ctx.act(w, 'bump', null, { t: s.t0 + 0.05 + i * 0.22, dur: 0.32, sfx: i ? 'pop' : null, gain: 0.5 }); }); }
    if (sc.bubble) { const b = h('div', 'bubble', esc(sc.bubble)); b.style.left = '40px'; b.style.right = '40px'; b.style.top = '0'; el.appendChild(b); hdrH = b.offsetHeight + 40; ctx.act(b, 'pop', 0, { dt: 0.5, sfx: 'bubble' }); }
    s.stage = { top: hdrH };
    const P = stagePl(s), ov = s.ov;
    if (sc.anim === 'crunch') {
      const mat = h('div', 'mat'); mat.style.left = (P.x + 690 * P.k / 2 - 280) + 'px'; mat.style.width = '560px'; mat.style.top = (P.AH - 40) + 'px'; el.appendChild(mat);
      const cnt = h('div', 'counter', String(sc.counter ? sc.counter.from : 0)); place(cnt, AREA.w - 210, hdrH + 40); ov.appendChild(cnt);
      ctx.act(cnt, 'pop', null, { t: s.si === 0 ? s.t0 - 0.5 : s.t0 + 0.25, sfx: s.si === 0 ? null : 'pop2' });
      const drops = [0, 1].map(() => { const d = h('div', 'drop'); ov.appendChild(d); return d; });
      const c = sc.counter || { from: 0, to: 10 };
      const tEnd = s.beats.length ? s.beats[s.beats.length - 1].t1 - 0.3 : s.t1;
      const period = (tEnd - s.t0) / (c.to - c.from);
      s.crunch = { t0: s.t0, period };
      for (let k = 1; k <= c.to - c.from; k++) { const tk = s.t0 + k * period; ctx.cue(tk, k === c.to - c.from ? 'ding' : 'blip', k === c.to - c.from ? 0.8 : 0.45); if (k % 2 === 0) breaks.push(tk); }
      ctx.tick((t) => {
        const k = Math.min(c.to - c.from, Math.max(0, Math.floor((t - s.t0) / period)));
        const v = c.from + k; if (cnt.textContent !== String(v)) cnt.textContent = String(v);
        const ph = ((t - s.t0) / period) % 1;
        cnt.dataset.base = 'scale(' + (1 + 0.12 * Math.max(0, 1 - ph * 4) * (k > 0 ? 1 : 0)).toFixed(3) + ')';
        drops.forEach((d, i) => { const q = ((t - s.t0) * 0.9 + i * 0.5) % 1; d.style.left = (P.x + 690 * P.k * (0.18 + i * 0.6)) + 'px'; d.style.top = (P.y + 40 + q * 170) + 'px'; d.style.opacity = (Math.sin(q * Math.PI) * 0.9).toFixed(3); });
      });
    }
    if (sc.anim === 'jump') {
      const cols = ['#ff6a3d', '#14a596', '#7a5cff', '#f2a100', '#e0457b'];
      const conf = []; for (let i = 0; i < 34; i++) { const d = h('div', 'confetti'); d.style.background = cols[i % cols.length]; ov.appendChild(d); conf.push(d); }
      const tc = at(s, 0, 0.35); ctx.cue(tc, 'shimmer', 0.9); ctx.cue(tc, 'pop2', 0.6); breaks.push(tc);
      s.jump = { t0: s.t0 };
      ctx.tick((t) => {
        const q = t - tc;
        conf.forEach((d, i) => {
          if (q < 0) { d.style.opacity = 0; return; }
          const a = -Math.PI / 2 + (rnd(i) - 0.5) * 2.4, v = 700 + rnd(i, 2) * 700;
          const x = AREA.w / 2 + Math.cos(a) * v * q, y = 420 + Math.sin(a) * v * q + 900 * q * q;
          d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.transform = 'rotate(' + ((rnd(i, 3) - 0.5) * 1400 * q).toFixed(1) + 'deg)';
          d.style.opacity = (x < 0 || x > AREA.w - 18 || y > P.AH - 30) ? 0 : clamp(1.6 - q * 0.6).toFixed(3);
        });
      });
    }
  };

  // body: Nuki as the body; the energy comes out of the whole body, not only the belly
  T.body = (el, ctx, sc) => {
    const s = ctx.s;
    s.stage = { top: 90 };
    const P = stagePl(s), ov = s.ov;
    const chip = h('div', 'box', '<span class="chip acc">' + esc(sc.label || 'Energie din tot corpul') + '</span>'); chip.style.left = '0'; chip.style.right = '0'; chip.style.top = '0'; chip.style.textAlign = 'center'; el.appendChild(chip);
    ctx.act(chip, 'pop', 0, { dt: 0.6, sfx: 'pop' });
    // Nuki on stage: k 0.72 → 497 × 538, centred, top 90 (see nukiPlace)
    const k = P.k, nx = P.x, ny = P.y;
    const dots = [];
    for (let i = 0; i < 30; i++) {
      const u = 0.24 + rnd(i) * 0.52, v = 0.42 + rnd(i, 5) * 0.5; // the coat
      const r = 9 + rnd(i, 7) * 8;
      const d = h('div', 'dotf'); d.style.width = d.style.height = 2 * r + 'px'; place(d, nx + u * 690 * k - r, ny + v * 747 * k - r); ov.appendChild(d); dots.push(d);
      ctx.act(d, 'pop', -1, { dt: 0.15 + i * 0.02, sfx: i % 6 ? null : 'pop', gain: 0.35, noBreak: true });
    }
    const ring = h('div', 'ring'); const rw = 230, rh = 170; place(ring, nx + 0.5 * 690 * k - rw / 2, ny + 0.72 * 747 * k - rh / 2); ring.style.width = rw + 'px'; ring.style.height = rh + 'px'; ov.appendChild(ring);
    const q = h('div', 'box', '<span class="chip">doar de aici?</span>'); place(q, nx + 0.5 * 690 * k + 40, ny + 0.72 * 747 * k + 70); ov.appendChild(q);
    ctx.act(ring, 'pop', -1, { dt: 0.3, sfx: 'pop2' }); ctx.act(q, 'pop', -1, { dt: 0.45, sfx: null });
    const tAll = at(s, 0, 0.4), tNo = at(s, 1);
    ctx.act(ring, 'out', 1, { dt: 0.1, sfx: 'alert', gain: 0.5 }); ctx.act(q, 'out', 1, { dt: 0.1, sfx: null });
    ctx.cue(tAll, 'rise', 0.5); breaks.push(tAll, tNo);
    ctx.tick((t) => {
      const p = clamp((t - tAll) / 2.2);
      dots.forEach((d, i) => {
        const w = clamp(p * 1.3 - rnd(i, 9) * 0.3);
        d.dataset.base = 'translateY(' + (-w * 40).toFixed(1) + 'px) scale(' + (1 - 0.55 * w).toFixed(3) + ')';
      });
    });
  };

  // the end: the comment CTA, typed into a comment bar
  T.end = (el, ctx, sc) => {
    const s = ctx.s;
    const l1 = h('div', 'box sub', 'Scrie în comentarii'); l1.style.left = '0'; l1.style.right = '0'; l1.style.textAlign = 'center'; l1.style.fontSize = '60px';
    const kw = h('div', 'box ttl', '<span class="kw">«' + esc(sc.keyword) + '»</span>'); kw.style.left = '0'; kw.style.width = AREA.w + 'px'; kw.style.textAlign = 'center';
    const bar = h('div', 'box cbar', '<span class="av">' + icon('user-round') + '</span><span class="txt"></span><span class="send">' + icon('send') + '</span>'); bar.style.left = '60px'; bar.style.right = '60px';
    const l2 = h('div', 'box sub', esc(sc.line || '')); l2.style.left = '0'; l2.style.right = '0'; l2.style.textAlign = 'center'; l2.style.fontSize = '46px'; l2.style.color = 'var(--mute)';
    [l1, kw, bar, l2].forEach((e) => el.appendChild(e));
    fit(kw, AREA.w, 200, 190, 90);
    stack(el, [l1, kw, bar, l2], 30);
    ctx.act(l1, 'rise', -1, { dt: 0.02 });
    ctx.act(kw, 'slam', -1, { dt: 0.2, sfx: 'hit', gain: 0.6 });
    ctx.act(bar, 'rise', -1, { dt: 0.45, sfx: 'swish' });
    ctx.act(l2, 'rise', 0, { dt: 1.2 });
    const txt = bar.querySelector('.txt'), word = sc.keyword, tt = at(s, -1, 0.9), step = 0.09;
    for (let i = 0; i < word.length; i++) ctx.cue(tt + i * step, 'blip', 0.25);
    const tSend = tt + word.length * step + 0.35;
    ctx.act(bar.querySelector('.send'), 'pop', null, { t: tSend, sfx: 'bubble' });
    ctx.tick((t) => { const n = clamp(Math.floor((t - tt) / step) + 1, 0, word.length); const v = word.slice(0, t < tt ? 0 : n); if (txt.dataset.v !== v + (t % 0.8 < 0.4)) { txt.dataset.v = v + (t % 0.8 < 0.4); txt.innerHTML = esc(v) + (t < tSend ? '<i style="opacity:' + (t % 0.8 < 0.4 ? 1 : 0) + '"></i>' : ''); } });
  };

  // ---------------------------------------------------------------- captions, word by word
  const capChunks = [];
  function buildCaptions() {
    const cap = document.getElementById('cap');
    const kw = (S.keyword || '').toLowerCase();
    scenes.forEach((s) => s.beats.forEach((bt, bi) => {
      const text = plain(bt.b.cap || bt.b.say);
      const ws = text.split(/\s+/).filter(Boolean);
      // the time of each word: its share of the line, by letters, with a breath after punctuation
      const wt = ws.map((w) => w.replace(/[«»"]/g, '').length + 1.6 + (/[,.:?!]$/.test(w) ? 3 : 0));
      const sum = wt.reduce((a, b) => a + b, 0);
      let acc = bt.t0 + 0.02;
      const times = wt.map((x) => { const t = acc; acc += (x / sum) * (bt.dur - 0.05); return t; });
      // chunks: at most 3 words / 20 letters, a new chunk after a full stop or a question
      let cur = [];
      const flush = () => { if (cur.length) capChunks.push({ beat: bt, words: cur.slice(), t0: cur[0].t }); cur = []; };
      ws.forEach((w, i) => {
        const len = cur.reduce((a, x) => a + x.w.length + 1, 0) + w.length;
        if (cur.length >= 3 || (cur.length && len > 20)) flush();
        cur.push({ w, t: times[i], kw: kw && w.toLowerCase().replace(/[«»,.!?:]/g, '') === kw });
        if (/[.?!:]$/.test(w) && i < ws.length - 1) flush();
      });
      flush();
      if (bi === 0) capChunks.forEach((c) => { if (c.beat === bt && c === capChunks.find((x) => x.beat === bt)) c.t0 = Math.max(c.t0, s.t0 + 0.09); });
    }));
    capChunks.forEach((c, i) => {
      const nx = capChunks[i + 1];
      c.t1 = nx && nx.beat === c.beat ? nx.t0 : c.beat.t1 + 0.2;
      if (nx && nx.t0 < c.t1) c.t1 = nx.t0;
      c.html = c.words.map((x, j) => '<span class="w' + (x.kw ? ' kw' : '') + '" data-j="' + j + '">' + esc(x.w) + '</span>').join(' ');
      cap.innerHTML = c.html;
      cap.style.height = 'auto'; cap.style.alignContent = 'flex-start';
      let f = 96; cap.style.fontSize = f + 'px';
      while (f > 54 && (cap.offsetHeight > 236 || [...cap.querySelectorAll('.w')].some((w) => w.offsetLeft + w.offsetWidth * 1.06 > 860 || w.offsetLeft - w.offsetWidth * 0.06 < 0))) { f -= 2; cap.style.fontSize = f + 'px'; }
      cap.style.height = ''; cap.style.alignContent = '';
      c.fs = f;
      // a sound on every new line of captions would be too much: only the first of a beat gets nothing, the rest are silent
    });
    cap.innerHTML = '';
  }
  let capKey = null;
  function captionAt(t) {
    const cap = document.getElementById('cap');
    const c = capChunks.find((x) => t >= x.t0 - 0.06 && t < x.t1);
    if (!c) { cap.style.opacity = 0; return; }
    if (capKey !== c) { capKey = c; cap.innerHTML = c.html; cap.style.fontSize = c.fs + 'px'; cap.style.top = (c.beat.low ? 1250 : 990) + 'px'; }
    cap.style.opacity = 1;
    const ws = cap.querySelectorAll('.w');
    let on = -1; c.words.forEach((x, j) => { if (t >= x.t - 0.04) on = j; });
    ws.forEach((w, j) => {
      w.classList.toggle('on', j === on);
      const p = clamp((t - c.words[j].t + 0.06) / 0.14);
      const shown = j <= on || j === 0;
      w.style.opacity = shown ? 1 : 0.28;
      w.style.transform = j === on ? 'scale(' + (1.12 - 0.08 * E.out(p)).toFixed(3) + ')' : '';
    });
    const pin = clamp((t - c.t0 + 0.06) / 0.12);
    cap.style.transform = 'translateY(' + ((1 - E.out(pin)) * 26).toFixed(1) + 'px)';
  }

  // ---------------------------------------------------------------- Nuki
  let nukiEl, rigEl, poseImgs = {};
  const DEFAULT_NUKI = { stage: 'stage', body: 'stage', photo: 'off' };
  function nukiMode(s) { return s.sc.nuki || DEFAULT_NUKI[s.sc.type] || 'pres'; }
  function nukiBuild() {
    nukiEl = document.getElementById('nuki'); rigEl = nukiEl.querySelector('.rig');
    const poses = new Set(['prezinta']);
    S.scenes.forEach((sc) => { if (sc.pose) poses.add(sc.pose); (sc.beats || []).forEach((b) => b.pose && poses.add(b.pose)); });
    poses.forEach((p) => { const im = h('img'); im.src = ROOT + '/brand_asset/mascota/ipostaze/' + p + '.webp'; im.style.opacity = 0; rigEl.appendChild(im); poseImgs[p] = im; });
    scenes.forEach((s, i) => { const p = scenes[i - 1]; if (p && nukiMode(p) !== nukiMode(s) && nukiMode(s) !== 'off') cues.push({ t: s.t0 + 0.12, sfx: 'pop2', gain: 0.35 }); });
    scenes.forEach((s) => { let last = s.sc.pose; s.beats.forEach((bt, i) => { if (i && bt.b.pose && bt.b.pose !== last) cues.push({ t: bt.t0 - 0.1, sfx: 'blip', gain: 0.4 }); if (bt.b.pose) last = bt.b.pose; }); });
  }
  function placement(s) {
    const m = nukiMode(s);
    if (m === 'pres') return { k: PRES.k, x: PRES.cx - 690 * PRES.k / 2, y: PRES.top };
    if (m === 'stage') { const P = stagePl(s); return { k: P.k, x: AREA.x + P.x, y: AREA.y + P.y }; }
    return null;
  }
  function poseAt(s, t) {
    let pose = s.sc.pose || 'prezinta', tp = s.t0;
    s.beats.forEach((bt) => { if (bt.b.pose && t >= bt.t0 - 0.1) { pose = bt.b.pose; tp = bt.t0 - 0.1; } });
    return { pose, tp };
  }
  function sceneAt(t) { let k = 0; scenes.forEach((s, i) => { if (t >= s.t0) k = i; }); return k; }
  function nukiAt(t) {
    Object.values(poseImgs).forEach((im) => { im.style.opacity = 0; });
    const k = sceneAt(t), s = scenes[k], prev = scenes[k - 1];
    let pl = placement(s), o = 1, pop = 1, useS = s;
    const dt = t - s.t0;
    const changed = prev && JSON.stringify(placement(prev)) !== JSON.stringify(pl);
    if (changed && dt < 0.3) {
      if (dt < 0.07 && placement(prev)) { useS = prev; pl = placement(prev); o = 1 - dt / 0.07; }
      else if (pl) { const q = clamp((dt - 0.07) / 0.22); o = q; pop = 0.75 + 0.25 * E.back(q); }
      else o = 0;
    }
    if (!pl || o <= 0) { nukiEl.style.opacity = 0; return 0; }
    // the hook: Nuki pops in with the hit
    if (k === 0 && dt < 0.4 && nukiMode(s) === 'pres') { const q = clamp(dt / 0.4); pop = 0.85 + 0.15 * E.back(q); }
    nukiEl.style.opacity = o.toFixed(3);
    nukiEl.style.transform = 'translate(' + pl.x.toFixed(1) + 'px,' + pl.y.toFixed(1) + 'px) scale(' + (pl.k * pop).toFixed(4) + ')';
    const { pose, tp } = poseAt(useS, t);
    const cur = poseImgs[pose] || poseImgs.prezinta;
    // pose change: a squash
    const q = clamp((t - tp) / 0.22);
    const sq = tp > useS.t0 + 0.01 ? 0.9 + 0.1 * E.back(q) : 1;
    cur.style.opacity = 1;
    cur.style.transform = 'scale(' + (2 - sq).toFixed(4) + ',' + sq.toFixed(4) + ')';
    // the rig: idle bob, or the sketch moves
    let rot = Math.sin(t * 1.9) * 2, dy = Math.sin(t * 2.4) * 10, sx = 1, sy = 1;
    if (useS.crunch) { const ph = ((t - useS.crunch.t0) / useS.crunch.period) % 1; const a = 0.5 - 0.5 * Math.cos(ph * 2 * Math.PI); rot = -30 * a; dy = 0; sy = 1 - 0.05 * a; }
    if (useS.jump) { const ph = ((t - useS.jump.t0) / 0.62) % 1; dy = -Math.sin(ph * Math.PI) * 70; const land = ph < 0.12 ? 1 - ph / 0.12 : 0; sy = 1 - 0.1 * land; sx = 1 + 0.08 * land; rot = Math.sin(t * 5) * 4; }
    if (speaking(t)) sy *= 1 + 0.008 * Math.sin(t * 13);
    rigEl.style.transform = 'translateY(' + dy.toFixed(2) + 'px) rotate(' + rot.toFixed(3) + 'deg) scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')';
    return 1;
  }
  function speaking(t) { for (const s of scenes) for (const b of s.beats) if (t >= b.t0 && t <= b.t1) return true; return false; }

  // ---------------------------------------------------------------- build & seek
  function collectIcons() {
    const n = new Set(BUILTIN);
    const walk = (o) => { if (!o || typeof o !== 'object') return; for (const k in o) { if (k === 'ic' && typeof o[k] === 'string') n.add(o[k]); else walk(o[k]); } };
    walk(S); return n;
  }
  async function boot() {
    S = await (await fetch('../scripts/' + ID + '/script.json', { cache: 'no-store' })).json();
    document.body.dataset.r = S.rubric || 'fapt';
    try { const r = await fetch('../scripts/' + ID + '/timing.json', { cache: 'no-store' }); if (r.ok) TIM = await r.json(); } catch (e) { /* no voice yet: estimated */ }
    await loadIcons(collectIcons());
    const [lab, ic] = RUBRIC[S.rubric] || RUBRIC.fapt;
    document.querySelector('#tag b').textContent = S.tag || lab;
    document.querySelector('#tag .ic').innerHTML = icon(ic);
    if (document.fonts) { // every subset the reel uses (the Romanian letters live in latin-ext, loaded only when asked for)
      const txt = JSON.stringify(S).replace(/[\x00-\x2f]/g, '') + 'șțăîâȘȚĂÎÂ«»';
      for (const f of ['900 80px "Inter Variable"', '600 80px "Inter Variable"', 'italic 700 80px "Fraunces Variable"']) await document.fonts.load(f, txt);
      await document.fonts.ready; }
    timeline();
    const root = document.getElementById('scenes');
    for (const s of scenes) {
      s.low = nukiMode(s) !== 'pres'; s.beats.forEach((bt) => { bt.low = s.low; });
      s.ov = h('div', 'scene'); document.getElementById('over').appendChild(s.ov); s.ov.style.display = 'block';
      const el = h('div', 'scene'); el.dataset.type = s.sc.type; root.appendChild(el); s.el = el;
      el.style.display = 'block';
      (T[s.sc.type] || T.big)(el, ctxFor(s), s.sc);
      el.style.display = 'none';
      if (s.si > 0) { cues.push({ t: s.t0, sfx: 'whoosh', gain: 0.5 }); breaks.push(s.t0); }
      s.beats.forEach((bt) => breaks.push(bt.t0));
    }
    buildCaptions();
    nukiBuild();
    await Promise.all([...document.images].map((im) => (im.decode ? im.decode().catch(() => {}) : null)));
    // photo frames: sizes once the images are known
    scenes.forEach((s) => {
      if (s.imgEl) { const im = s.imgEl.querySelector('img'); const fw = AREA.w - 16, fh = 400 - 16; const half = s.imgEl.dataset.half; const iw = im.naturalWidth / (half ? 2 : 1), ih = im.naturalHeight; const k = Math.max(fw / iw, fh / ih); im.style.width = im.naturalWidth * k + 'px'; im.style.height = ih * k + 'px'; im.style.left = (half === 'r' ? -iw * k : 0) + (fw - iw * k) / 2 + 'px'; im.style.top = Math.max(fh - ih * k, -ih * k * 0.3) + 'px'; }
      if (s.photo) layoutPhoto(s);
    });
    if (!cues.some((c) => c.t < 0.1 && c.sfx === 'hit')) { cues.push({ t: 0, sfx: 'hit', gain: 1 }, { t: 0, sfx: 'whoosh', gain: 0.6 }); }
    {
      const br = [...new Set(breaks.map((x) => Math.round(x * 100) / 100))].sort((a, b) => a - b).concat([total]);
      for (let i = 1; i < br.length; i++) {
        const g = br[i] - br[i - 1];
        for (let k = 1; g > 3.4 && k < Math.ceil(g / 3.2); k++) { const tp = br[i - 1] + (g * k) / Math.ceil(g / 3.2); pulses.push(tp); breaks.push(tp); cues.push({ t: tp, sfx: 'swish', gain: 0.25 }); }
      }
    }
    cues.sort((a, b) => a.t - b.t);
    window.film = {
      id: S.id, total, fps: 30, W, H, keyword: S.keyword,
      cues: cues.filter((c) => c.sfx && c.t >= 0 && c.t < total),
      beats: scenes.flatMap((s) => s.beats.map((b) => ({ key: b.key, t0: b.t0, dur: b.dur, text: b.text }))),
      scenes: scenes.map((s) => ({ t0: s.t0, t1: s.t1, type: s.sc.type, nuki: nukiMode(s) })),
      breaks: [...new Set(breaks.map((x) => Math.round(x * 100) / 100))].sort((a, b) => a - b),
    };
    seek(0);
    window.ready = true;
  }
  function layoutPhoto(s) {
    const P = s.photo, im = P.im;
    const iw = im.naturalWidth, ih = im.naturalHeight;
    const noteH = P.note ? 80 : 0, labH = 70;
    const AH = s.low ? 920 : AREA.h;
    const maxW = AREA.w, maxH = AH - labH - noteH - 30;
    const k = Math.min(maxW / iw, maxH / ih);
    P.full = { w: iw * k, h: ih * k, k };
    const top = (AH - (ih * k + labH + noteH + 30)) / 2;
    P.top = Math.max(0, top);
    P.lab.style.top = (P.top + ih * k + 20) + 'px';
    if (P.note) P.note.style.top = (P.top + ih * k + 20 + labH) + 'px';
    if (P.sc.reveal != null) { // before the reveal: the "before" half, bigger
      const k2 = Math.min(maxW / (iw / 2), maxH / ih, (P.top + P.full.h) / ih);
      P.half = { w: iw / 2 * k2, h: ih * k2, k: k2 };
    }
    s.ticks.push((t) => {
      let w, hh, kk, imx = 0;
      if (P.half) {
        const p = E.inout(clamp((t - P.tr) / 0.7));
        kk = P.half.k + (P.full.k - P.half.k) * p; hh = ih * kk; w = (iw / 2) * kk + (iw / 2) * kk * p;
      } else { kk = P.full.k; w = P.full.w; hh = P.full.h; }
      P.fr.style.width = (w + 16) + 'px'; P.fr.style.height = (hh + 16) + 'px';
      P.fr.style.left = ((AREA.w - w - 16) / 2) + 'px'; P.fr.style.top = (P.top + P.full.h - hh) + 'px';
      im.style.width = iw * kk + 'px'; im.style.height = hh + 'px'; im.style.left = imx + 'px';
      const zoom = 1 + 0.03 * clamp((t - s.t0) / 4);
      im.style.transform = 'scale(' + zoom.toFixed(4) + ')'; im.style.transformOrigin = '50% 50%';
    });
  }

  function seek(t) {
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      const vis = t >= s.t0 - 0.02 && t < s.end;
      s.el.style.display = vis ? 'block' : 'none'; s.ov.style.display = s.el.style.display;
      if (!vis) continue;
      let o = 1, y = 0, k = 1, b = 0;
      const pin = clamp((t - s.t0) / XF);
      if (i > 0 && pin < 1) { const e = E.out5(pin); o = clamp(pin * 2.5); y = (1 - e) * 70; k = 1.05 - 0.05 * e; }
      const nx = scenes[i + 1];
      if (nx && t > nx.t0) { const e = E.out(clamp((t - nx.t0) / XF)); o *= 1 - e; k *= 1 - 0.05 * e; b += e * 6; }
      // a small zoom pulse on every new line
      s.beats.forEach((bt, j) => { if (j && t >= bt.t0) { const q = clamp((t - bt.t0) / 0.3); k *= 1 + 0.018 * Math.sin(q * Math.PI); } });
      pulses.forEach((tp) => { if (t >= tp && t < tp + 0.4 && tp > s.t0 && tp < s.t1) { const q = clamp((t - tp) / 0.4); k *= 1 + 0.03 * Math.sin(q * Math.PI); } });
      let sx = 0;
      if (s.shake && t > s.shake && t < s.shake + 0.35) { const q = (t - s.shake) / 0.35; sx = Math.sin(q * 40) * 14 * (1 - q); }
      s.el.style.opacity = s.ov.style.opacity = o.toFixed(3);
      s.el.style.transform = s.ov.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + k.toFixed(4) + ')';
      s.el.style.filter = b > 0.05 ? 'blur(' + b.toFixed(2) + 'px)' : '';
      s.ticks.forEach((fn) => fn(t));
    }
    apply(t);
    // the camera: a punch-in on the hook (frame 0 is already full), a drift of the background
    const cam = document.getElementById('cam');
    const p0 = clamp(t / 0.5);
    const ck = 0.9 + 0.1 * E.out5(p0); // the hook grows into place (never past the safe zone)
    cam.style.transform = ck !== 1 ? 'scale(' + ck.toFixed(4) + ')' : '';
    const bg = document.getElementById('bg');
    bg.querySelector('.b1').style.transform = 'translate(' + (Math.sin(t * 0.5) * 60).toFixed(1) + 'px,' + (Math.cos(t * 0.4) * 50).toFixed(1) + 'px)';
    bg.querySelector('.b2').style.transform = 'translate(' + (Math.cos(t * 0.45) * 60).toFixed(1) + 'px,' + (Math.sin(t * 0.35) * 60).toFixed(1) + 'px)';
    // a white flash on the hit (soft, under 3 a second: the flash check passes)
    document.getElementById('flash').style.opacity = t < 0.03 ? '0' : (0.35 * (1 - clamp((t - 0.03) / 0.2))).toFixed(3); // frame 0 stays clean (thumbnail)
    captionAt(t);
    return nukiAt(t);
  }

  window.seek = seek;
  window.addEventListener('load', () => { boot().catch((e) => { window.bootError = String(e && e.stack || e); console.error(e); }); });
})();
