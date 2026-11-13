// Centrul360 reels v2: the look. Backgrounds (per theme), the brand chip, the captions (word by word, styled per
// theme) and the transitions between shots (≥10). All pure functions of the time.
(function () {
  'use strict';
  const R = window.R2;
  const { clamp, E, h, esc } = R;

  // ------------------------------------------------------------------ backgrounds
  // a theme's bg: { kind, blobs: [colors], grain: 0..1, grid: {size, color, bold}, shapes: n, rings: n, vignette: 0..1 }
  const BG = R.BG = { parts: {} };
  let noiseURL = null;
  function noise(size, alpha) { // a tile of film grain, drawn once (deterministic)
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); const im = g.createImageData(size, size);
    let s = 1234567;
    for (let i = 0; i < im.data.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; const v = (s >> 8) & 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = alpha; }
    g.putImageData(im, 0, 0); return c.toDataURL();
  }
  BG.build = (TH) => {
    const bg = document.getElementById('bg');
    const B = TH.bg || {};
    bg.style.background = B.base || 'var(--bg)';
    BG.B = B;
    BG.parts.blobs = (B.blobs || []).map((col, i) => {
      const d = h('i', null, null, bg); const r = 900 + (i % 3) * 220;
      d.style.cssText = 'width:' + r + 'px;height:' + r + 'px;border-radius:50%;background:radial-gradient(circle,' + col + ' 0%,transparent 68%);filter:blur(' + (B.soft || 20) + 'px)';
      d._r = r; d._i = i; return d;
    });
    if (B.grid) { const g = h('i', 'grid', null, bg); g.style.cssText = 'inset:-200px;background-image:linear-gradient(' + B.grid.color + ' ' + (B.grid.w || 2) + 'px,transparent 0),linear-gradient(90deg,' + B.grid.color + ' ' + (B.grid.w || 2) + 'px,transparent 0);background-size:' + B.grid.size + 'px ' + B.grid.size + 'px'; BG.parts.grid = g;
      if (B.grid.bold) { const g2 = h('i', 'grid2', null, bg); g2.style.cssText = 'inset:-200px;background-image:linear-gradient(' + B.grid.bold + ' 3px,transparent 0),linear-gradient(90deg,' + B.grid.bold + ' 3px,transparent 0);background-size:' + B.grid.size * 4 + 'px ' + B.grid.size * 4 + 'px'; BG.parts.grid2 = g2; } }
    if (B.dots) { const g = h('i', 'dots', null, bg); g.style.cssText = 'inset:-100px;background-image:radial-gradient(' + B.dots + ' 2.6px,transparent 2.8px);background-size:46px 46px'; BG.parts.dots = g; }
    BG.parts.shapes = [];
    for (let i = 0; i < (B.shapes || 0); i++) { // soft 3D clay balls / pills
      const d = h('i', null, null, bg); const sz = 180 + R.rnd(i, 3) * 260; const col = (B.shapeColors || B.blobs || ['#fff'])[i % (B.shapeColors || B.blobs || ['#fff']).length];
      d.style.cssText = 'width:' + sz + 'px;height:' + (i % 2 ? sz * 0.62 : sz) + 'px;border-radius:' + (i % 2 ? sz * 0.31 + 'px' : '50%') + ';background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.85),' + col + ' 42%,' + col + ' 70%,rgba(0,0,0,.12));box-shadow:0 40px 60px -30px rgba(0,0,0,.25);opacity:' + (B.shapeAlpha || 0.55);
      d._x = [80, 760, 860, -60, 620][i % 5] + R.rnd(i) * 60; d._y = [1700, 160, 1320, 520, 1880][i % 5]; d._sz = sz; BG.parts.shapes.push(d);
    }
    BG.parts.rings = [];
    for (let i = 0; i < (B.rings || 0); i++) { const d = h('i', null, null, bg); const r = 700 + i * 380; d.style.cssText = 'left:' + (540 - r / 2) + 'px;top:' + (820 - r / 2) + 'px;width:' + r + 'px;height:' + r + 'px;border-radius:50%;border:2px solid ' + (B.ringColor || 'rgba(255,255,255,.12)') + ';box-shadow:0 0 30px ' + (B.ringGlow || 'transparent'); BG.parts.rings.push(d); }
    if (B.paper) { const p = h('i', 'paper', null, bg); p.style.cssText = 'inset:0;background:repeating-linear-gradient(93deg,rgba(120,90,50,.035) 0 2px,transparent 2px 9px),repeating-linear-gradient(-2deg,rgba(120,90,50,.03) 0 1px,transparent 1px 13px)'; }
    if (B.grain) { noiseURL = noiseURL || noise(256, 255); const g = h('i', 'grain', null, bg); g.style.cssText = 'inset:-256px;background-image:url(' + noiseURL + ');opacity:' + B.grain + ';mix-blend-mode:' + (TH.dark ? 'screen' : 'multiply'); BG.parts.grain = g; }
    if (B.vignette) { const v = h('i', 'vig', null, bg); v.style.cssText = 'inset:0;background:radial-gradient(ellipse at 50% 42%,transparent 55%,rgba(0,0,0,' + B.vignette + ') 100%)'; }
  };
  BG.draw = (t) => {
    const pan = R.bgPan || 0; document.getElementById('bg').style.transform = pan ? 'translateX(' + (pan * 0.35).toFixed(1) + 'px)' : ''; R.bgPan = 0;
    const P = R.endType === 'loop' && R.total ? R.total : 0; // a loop: every movement comes back to where it started
    const ph = (w) => (P ? (2 * Math.PI * t / P) * Math.max(1, Math.round(w * P / (2 * Math.PI))) : t * w);
    const pos = [[-380, -320], [520, 1060], [380, -380], [-420, 1180], [140, 520]];
    BG.parts.blobs.forEach((d) => { const i = d._i, [x, y] = pos[i % pos.length]; d.style.transform = 'translate(' + (x + Math.sin(ph(0.31 + i * 0.07) + i) * 90).toFixed(1) + 'px,' + (y + Math.cos(ph(0.27 + i * 0.05) + i * 2) * 80).toFixed(1) + 'px)'; });
    if (BG.parts.grid) BG.parts.grid.style.transform = 'translate(' + ((Math.sin(ph(0.15)) * 30)).toFixed(1) + 'px,' + (((P ? 0 : t * 14) % (BG.B.grid.size)) + Math.cos(ph(0.15)) * 30).toFixed(1) + 'px)';
    if (BG.parts.grid2) BG.parts.grid2.style.transform = BG.parts.grid.style.transform;
    if (BG.parts.dots) BG.parts.dots.style.transform = 'translate(' + (Math.sin(ph(0.2)) * 23).toFixed(1) + 'px,' + (Math.cos(ph(0.2)) * 23).toFixed(1) + 'px)';
    BG.parts.shapes.forEach((d, i) => { d.style.transform = 'translate(' + (d._x + Math.sin(ph(0.4 + i * 0.1) + i) * 26).toFixed(1) + 'px,' + (d._y - d._sz / 2 + Math.cos(ph(0.5 + i * 0.08) + i) * 34).toFixed(1) + 'px) rotate(' + (Math.sin(ph(0.3) + i) * 8).toFixed(2) + 'deg)'; });
    BG.parts.rings.forEach((d, i) => { d.style.transform = 'scale(' + (1 + 0.05 * Math.sin(ph(0.6) + i)).toFixed(4) + ')'; d.style.opacity = (0.5 + 0.5 * Math.sin(ph(0.9) + i * 1.3)).toFixed(3); });
    if (BG.parts.grain) { const f = Math.floor(t * 8); BG.parts.grain.style.transform = 'translate(' + Math.floor(R.rnd(f, 1) * 256) + 'px,' + Math.floor(R.rnd(f, 2) * 256) + 'px)'; }
  };

  // ------------------------------------------------------------------ the brand chip
  R.brand = (S, TH) => {
    const b = document.getElementById('brand');
    b.innerHTML = '<svg viewBox="132.5 132.5 545 545"><g fill="none" stroke="currentColor" stroke-width="40"><circle cx="405" cy="405" r="262"/><ellipse cx="405" cy="405" rx="104" ry="207"/><ellipse cx="405" cy="405" rx="207" ry="113"/></g></svg><span>Centrul360</span>' + (S.tag ? '<span class="tg">' + esc(S.tag) + '</span>' : '');
    // no logo on screen (the owner, 13.11): Nuki and the sound/transition signature are the brand; the logo appears
    // only where it is natural (the site browser of the "site" end). A script may still ask for it: "brand": true
    if (!S.brand) b.style.display = 'none';
  };

  // ------------------------------------------------------------------ captions
  const chunks = [];
  let capEl;
  R.buildCaptions = (lines, TH) => {
    capEl = document.getElementById('cap');
    lines.forEach((L) => {
      const vis = L.shot && L.shot.vis;
      const kinetic = vis && (/^type-/.test(vis.type) || (vis.type === 'qmark' && vis.q !== false)) && !vis.text && L.step === 0;
      if (L.b.captions === false || (kinetic && L.b.captions !== true) || (L.role === 'end' && L.b.captions === undefined && R.END[R.endType].noCaptions)) return;
      let cur = [];
      const flush = () => { if (cur.length) chunks.push({ L, words: cur.slice(), t0: cur[0].t }); cur = []; };
      L.words.forEach((w, i) => {
        const len = cur.reduce((a, x) => a + x.w.length + 1, 0) + w.w.length;
        if (cur.length >= 3 || (cur.length && len > 19)) flush();
        cur.push(w);
        if (/[.?!:]$/.test(w.w) && i < L.words.length - 1) flush();
      });
      flush();
    });
    chunks.forEach((c, i) => {
      const nx = chunks[i + 1];
      c.t1 = nx && nx.L === c.L ? nx.t0 : c.L.t1 + 0.25;
      if (nx && nx.t0 < c.t1) c.t1 = nx.t0;
      c.html = c.words.map((x, j) => '<span class="cw' + (x.e ? ' e' : '') + '" data-j="' + j + '">' + esc(x.w.replace(/\*/g, '')) + '</span>').join(' ');
      const place = c.L.b.capAt || (c.L.shot && c.L.shot.vis.capAt) || TH.capAt || 'band';
      c.top = typeof place === 'number' ? place : R.CAPY[place] || R.CAPY.band;
      capEl.innerHTML = c.html; capEl.style.top = c.top + 'px';
      let f = TH.capSize || 92; capEl.style.fontSize = f + 'px';
      while (f > 52 && (capEl.offsetHeight > 250 || [...capEl.querySelectorAll('.cw')].some((w) => w.offsetLeft + w.offsetWidth * 1.08 > 860 || w.offsetLeft - w.offsetWidth * 0.04 < 0))) { f -= 2; capEl.style.fontSize = f + 'px'; }
      c.fs = f;
    });
    capEl.innerHTML = '';
    R.captionChunks = chunks;
  };
  let capKey = null;
  R.captionAt = (t) => {
    const c = chunks.find((x) => t >= x.t0 - 0.05 && t < x.t1);
    if (!c) { capEl.style.opacity = 0; capKey = null; return; }
    if (capKey !== c) { capKey = c; capEl.innerHTML = c.html; capEl.style.fontSize = c.fs + 'px'; capEl.style.top = c.top + 'px'; }
    capEl.style.opacity = 1;
    const mode = document.body.dataset.cap;
    const ws = capEl.querySelectorAll('.cw');
    let on = -1; c.words.forEach((x, j) => { if (t >= x.t - 0.04) on = j; });
    ws.forEach((w, j) => {
      const x = c.words[j];
      const p = clamp((t - x.t + 0.06) / 0.16);
      w.classList.toggle('on', j === on);
      const shown = j <= on || j === 0;
      if (mode === 'mono') { const n = shown ? Math.max(1, Math.round(clamp((t - x.t + 0.06) / 0.18) * x.w.length)) : 0; const txt = x.w.replace(/\*/g, ''); w.textContent = j === 0 && on < 0 ? txt.slice(0, 1) : txt.slice(0, j <= on ? Math.min(txt.length, n || txt.length) : 0) || ' '; w.style.opacity = shown ? 1 : 0; }
      else w.style.opacity = shown ? 1 : (mode === 'box' || mode === 'sticker' ? 0 : 0.26);
      let k = 1, ry = 0, rot = 0;
      if (j === on) k = 1.1 - 0.1 * E.out(p);
      if (x.e && shown) { const q = clamp((t - x.t) / 0.4); k *= 1 + 0.16 * Math.sin(Math.PI * q); }
      if (mode === 'sticker') rot = ((j % 3) - 1) * 2.5;
      if ((mode === 'box' || mode === 'sticker') && shown) { const q = E.back(clamp((t - x.t + 0.06) / 0.22)); k *= 0.5 + 0.5 * q; }
      w.style.transform = 'translateY(' + ry + 'px) rotate(' + rot + 'deg) scale(' + k.toFixed(3) + ')';
      w.style.setProperty('--hl', (j < on || (j === on && (x.e || mode === 'under'))) ? E.expo(clamp((t - x.t) / 0.3)).toFixed(3) : x.e && j <= on ? '1' : '0');
    });
    const pin = clamp((t - c.t0 + 0.05) / 0.14);
    capEl.style.transform = 'translateY(' + ((1 - E.out(pin)) * 24).toFixed(1) + 'px)';
  };

  // ------------------------------------------------------------------ transitions (between shot A → B)
  // in(T, p, B, A, fx) shapes the incoming shot, out(T, p, A, B, fx) the outgoing one; p 0..1 over the transition.
  // sfx(t, d) places the sound. Overlays live in #fx (class trfx, hidden unless drawn this frame).
  const ov = (name, css) => { let e = document.getElementById('tr-' + name); if (!e) { e = h('div', 'trfx', null, document.getElementById('fx')); e.id = 'tr-' + name; if (css) e.style.cssText = css; } e.style.display = 'block'; return e; };
  // the key element of a shot, measured once at boot (before any animation moved it)
  const focusRect = (shot) => (shot && shot.focusRect) || { x: 490, y: 700, w: 420, h: 420 };
  // premium easings: expo in-out, and a cubic out with a slight overshoot (lands, settles)
  const EIO = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2);
  const OS = (p) => { const c1 = 1.15, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  const blurX = (v) => (v > 0.12 ? 'url(#mbx)' : '');
  R.bgPan = 0;
  const TR = R.TR = {
    whip: { dur: 0.36, sfx: (t) => R.cue(t - 0.12, 'whoosh_s', 0.9),
      in: (T, p) => { const e = OS(clamp((p - 0.45) / 0.55)); T.x = (1 - e) * 1100; T.o = p > 0.45 ? 1 : 0; T.filter = p < 0.85 ? 'url(#mbx)' : ''; },
      out: (T, p) => { const e = E.in(clamp(p / 0.5)); T.x = -e * 1100; T.o = p < 0.5 ? 1 : 0; T.filter = p > 0.15 ? 'url(#mbx)' : ''; } },
    'zoom-through': { dur: 0.5, sfx: (t) => { R.cue(t - 0.2, 'whoosh_l', 0.8); },
      in: (T, p) => { const e = E.out5(clamp((p - 0.35) / 0.65)); T.s = 0.72 + 0.28 * e; T.o = clamp((p - 0.35) / 0.3); T.blur = (1 - e) * 14; },
      out: (T, p) => { const e = E.in(clamp(p / 0.6)); T.s = 1 + 2.2 * e; T.o = 1 - clamp((p - 0.25) / 0.4); T.blur = e * 16; } },
    'mask-wipe': { dur: 0.5, sfx: (t) => R.cue(t - 0.15, 'swoosh', 0.8),
      in: (T, p, B, A, fx) => { const e = E.inout(p); const x = -400 + e * 2000; T.clip = 'polygon(0 0,' + x + 'px 0,' + (x - 420) + 'px 1920px,0 1920px)';
        const band = ov('band', 'top:-200px;height:2400px;width:70px;background:var(--acc);'); band.style.left = (x - 210 - 35) + 'px'; band.style.transform = 'rotate(12.4deg)'; band.style.opacity = (Math.sin(Math.PI * p)).toFixed(3); },
      out: () => {} },
    'shape-morph': { dur: 0.6, sfx: (t) => { R.cue(t - 0.28, 'swoosh_up', 0.8); R.cue(t + 0.02, 'pop', 0.5); },
      in: (T, p) => { T.o = p >= 0.5 ? 1 : 0; if (p >= 0.5) { const e = E.out5((p - 0.5) / 0.5); T.s = 1.06 - 0.06 * e; } },
      out: (T, p, A, B, fx) => { T.o = p < 0.5 ? 1 : 0; const pl = ov('plate', 'background:var(--acc);'); const c = focusRect(A);
        if (p < 0.5) { const e = E.inout(p / 0.5); const r = 40 + e * 3000; pl.style.left = (c.x - r / 2) + 'px'; pl.style.top = (c.y - r / 2) + 'px'; pl.style.width = pl.style.height = r + 'px'; pl.style.borderRadius = (50 - 30 * e) + '%'; pl.style.transform = 'rotate(' + (e * 40) + 'deg)'; }
        else { const e = E.inout((p - 0.5) / 0.5); pl.style.left = '-200px'; pl.style.top = (-200 - e * 2400) + 'px'; pl.style.width = '1480px'; pl.style.height = '2320px'; pl.style.borderRadius = '0 0 50% 50% / 0 0 ' + (e * 260) + 'px ' + (e * 260) + 'px'; pl.style.transform = ''; } } },
    'glitch-lite': { dur: 0.3, sfx: (t) => R.cue(t - 0.1, 'glitch', 0.75),
      in: (T, p) => { T.o = p >= 0.5 ? 1 : 0; if (p >= 0.5 && p < 0.9) { const k = Math.floor(p * 30); T.x = (R.rnd(k, 4) - 0.5) * 40; T.filter = 'drop-shadow(10px 0 rgba(255,0,90,.55)) drop-shadow(-10px 0 rgba(0,220,255,.55))'; } bars(p); },
      out: (T, p) => { T.o = p < 0.5 ? 1 : 0; if (p > 0.1 && p < 0.5) { const k = Math.floor(p * 30); T.x = (R.rnd(k, 5) - 0.5) * 50; T.filter = 'drop-shadow(10px 0 rgba(255,0,90,.55)) drop-shadow(-10px 0 rgba(0,220,255,.55))'; } } },
    'slide-stack': { dur: 0.55, sfx: (t) => { R.cue(t - 0.22, 'swoosh_up', 0.8); R.cue(t + 0.12, 'snap', 0.35); },
      in: (T, p) => { const e = E.expo(p); T.y = (1 - e) * 1920; T.clip = 'inset(0 round ' + ((1 - e) * 80).toFixed(1) + 'px)'; T.filter = 'drop-shadow(0 -30px 60px rgba(0,0,0,' + (0.35 * (1 - e)).toFixed(3) + '))'; },
      out: (T, p) => { const e = E.out(p); T.s = 1 - 0.1 * e; T.bright = 1 - 0.35 * e; T.y = -60 * e; } },
    iris: { dur: 0.55, sfx: (t) => R.cue(t - 0.2, 'whoosh_s', 0.75),
      in: (T, p, B) => { const e = E.inout(p); const c = focusRect(B); T.clip = 'circle(' + (e * 1500).toFixed(1) + 'px at ' + c.x.toFixed(0) + 'px ' + c.y.toFixed(0) + 'px)'; T.s = 1.08 - 0.08 * e; },
      out: (T, p) => { T.s = 1 - 0.06 * E.out(p); T.bright = 1 - 0.25 * p; } },
    'page-flip': { dur: 0.6, sfx: (t) => R.cue(t - 0.25, 'paper', 0.9),
      in: (T, p) => { const e = E.out(p); T.s = 0.95 + 0.05 * e; T.bright = 0.7 + 0.3 * e; },
      out: (T, p) => { const e = E.inout(p); T.origin = '0px 960px'; T.ry = -105 * e; T.bright = 1 - 0.45 * e; T.o = p < 0.92 ? 1 : 0; } },
    'blur-push': { dur: 0.45, sfx: (t) => R.cue(t - 0.15, 'whoosh_s', 0.65),
      in: (T, p) => { const e = E.expo(p); T.y = (1 - e) * 340; T.blur = (1 - e) * 22; T.o = clamp(p * 2.2); },
      out: (T, p) => { const e = E.in(p); T.y = -e * 340; T.blur = e * 22; T.o = 1 - clamp(p * 1.6); } },
    'match-cut': { dur: 0.5, sfx: (t) => { R.cue(t - 0.1, 'snap', 0.8); R.cue(t - 0.24, 'swoosh', 0.4); },
      in: (T, p, B) => { T.o = p >= 0.5 ? 1 : 0; if (p >= 0.5) { const pl = ov('match', 'background:var(--acc);'); const c = focusRect(B); const e = E.inout((p - 0.5) / 0.5);
        const w = 1080 + (c.w - 1080) * e, hh = 1920 + (c.h - 1920) * e; pl.style.left = (540 + (c.x - 540) * e - w / 2) + 'px'; pl.style.top = (960 + (c.y - 960) * e - hh / 2) + 'px'; pl.style.width = w + 'px'; pl.style.height = hh + 'px'; pl.style.borderRadius = (e * 60) + 'px'; pl.style.opacity = (1 - e).toFixed(3); } },
      out: (T, p, A) => { T.o = p < 0.5 ? 1 : 0; if (p < 0.5) { const pl = ov('match', 'background:var(--acc);'); const c = focusRect(A); const e = E.inout(p / 0.5);
        const w = c.w + (1080 - c.w) * e, hh = c.h + (1920 - c.h) * e; pl.style.left = (c.x + (540 - c.x) * e - w / 2) + 'px'; pl.style.top = (c.y + (960 - c.y) * e - hh / 2) + 'px'; pl.style.width = w + 'px'; pl.style.height = hh + 'px'; pl.style.borderRadius = ((1 - e) * 60) + 'px'; pl.style.opacity = '1'; } } },
    'spin-zoom': { dur: 0.5, sfx: (t) => R.cue(t - 0.2, 'whoosh_l', 0.75),
      in: (T, p) => { const e = E.out5(clamp((p - 0.4) / 0.6)); T.o = clamp((p - 0.4) / 0.25); T.s = 0.6 + 0.4 * e; T.filter = ''; T.blur = (1 - e) * 10; },
      out: (T, p) => { const e = E.in(clamp(p / 0.6)); T.s = 1 + 0.8 * e; T.o = 1 - clamp((p - 0.3) / 0.3); T.blur = e * 12; T.origin = '540px 700px'; T.ry = 0; T.filter = 'hue-rotate(' + (e * 30).toFixed(1) + 'deg)'; } },
    // push: both screens slide together, motion blur at speed, the new one lands with a slight overshoot
    push: { dur: 0.5, sfx: (t) => R.cue(t - 0.2, 'whoosh_s', 0.85),
      in: (T, p) => { const e = OS(clamp((p - 0.08) / 0.92)); T.x = (1 - e) * 1100; const v = Math.abs(Math.sin(Math.PI * clamp(p * 1.1))); T.filter = blurX(v * (p < 0.8 ? 1 : 0)); },
      out: (T, p) => { const e = EIO(clamp(p / 0.92)); T.x = -e * 1100; T.filter = blurX(p > 0.1 && p < 0.85 ? 1 : 0); T.bright = 1 - 0.25 * e; } },
    'push-up': { dur: 0.5, sfx: (t) => R.cue(t - 0.2, 'swoosh_up', 0.9),
      in: (T, p) => { const e = OS(clamp((p - 0.08) / 0.92)); T.y = (1 - e) * 1920; T.blur = p < 0.75 ? 6 * Math.sin(Math.PI * p) : 0; },
      out: (T, p) => { const e = EIO(clamp(p / 0.92)); T.y = -e * 1920; T.blur = 6 * Math.sin(Math.PI * p); T.bright = 1 - 0.3 * e; } },
    // fly-through: the camera flies into the key element of the old screen, the new one comes out of the depth
    'fly-through': { dur: 0.58, sfx: (t) => { R.cue(t - 0.3, 'whoosh_l', 0.85); },
      in: (T, p) => { const q = clamp((p - 0.38) / 0.62); const e = OS(q); T.s = 0.45 + 0.55 * e; T.o = clamp(q * 3); T.blur = (1 - E.out(q)) * 16; },
      out: (T, p, A) => { const c = focusRect(A); const q = clamp(p / 0.62); const e = Math.pow(q, 3); T.origin = c.x.toFixed(0) + 'px ' + c.y.toFixed(0) + 'px'; T.s = 1 + 5 * e; T.o = 1 - clamp((q - 0.55) / 0.45); T.blur = e * 22; } },
    // zoom-element: the old key element grows to fill the screen, the new screen opens from inside it
    'zoom-element': { dur: 0.6, sfx: (t) => { R.cue(t - 0.28, 'swoosh_up', 0.8); R.cue(t + 0.02, 'whoosh_s', 0.5); },
      in: (T, p, B, A) => { const c = focusRect(A); const q = clamp((p - 0.42) / 0.58); const e = EIO(q); T.o = p > 0.42 ? 1 : 0; T.clip = 'circle(' + (Math.min(c.w, c.h) * 0.45 + e * 1700).toFixed(1) + 'px at ' + c.x.toFixed(0) + 'px ' + c.y.toFixed(0) + 'px)'; T.s = 1.12 - 0.12 * E.out(q); },
      out: (T, p, A) => { const c = focusRect(A); const k = Math.min(1.8, Math.max(1080 / Math.max(80, c.w), 1920 / Math.max(80, c.h)) * 0.9); const e = EIO(clamp(p / 0.55)); T.origin = c.x.toFixed(0) + 'px ' + c.y.toFixed(0) + 'px'; T.s = 1 + (k - 1) * e; T.blur = e * 12; T.o = 1 - clamp((p - 0.15) / 0.3); } },
    // pan: one long canvas; the camera pans to the next screen, the background moves slower (parallax)
    pan: { dur: 0.6, sfx: (t) => R.cue(t - 0.26, 'whoosh_s', 0.85),
      in: (T, p) => { const e = OS(EIO(p) * 0.985 + 0.015 * p); T.x = (1 - e) * 1080; T.filter = blurX(p > 0.12 && p < 0.8 ? 1 : 0); R.bgPan = -(1 - e) * 0 - EIO(p) * 300; },
      out: (T, p) => { const e = EIO(p); T.x = -e * 1080; T.filter = blurX(p > 0.12 && p < 0.8 ? 1 : 0); } },
    // morph-key: the old key element becomes a shape that travels and lands as the new key element
    'morph-key': { dur: 0.56, sfx: (t) => { R.cue(t - 0.24, 'swoosh', 0.8); R.cue(t + 0.24, 'snap', 0.5); },
      in: (T, p) => { T.o = clamp((p - 0.62) / 0.3); T.s = 0.96 + 0.04 * E.out(clamp((p - 0.62) / 0.38)); },
      out: (T, p, A, B) => { T.o = 1 - clamp((p - 0.05) / 0.3); T.s = 1 - 0.05 * E.out(p);
        const a = focusRect(A), b = focusRect(B), e = OS(EIO(p) * 0.97 + 0.03 * p);
        const pl = ov('morph', 'background:linear-gradient(135deg,var(--acc),var(--acc2));box-shadow:0 0 90px color-mix(in srgb,var(--acc) 55%,transparent),inset 0 2px 0 rgba(255,255,255,.35);backdrop-filter:blur(6px)');
        const w = a.w + (b.w - a.w) * e, hh = a.h + (b.h - a.h) * e, x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e;
        pl.style.left = (x - w / 2).toFixed(1) + 'px'; pl.style.top = (y - hh / 2).toFixed(1) + 'px'; pl.style.width = w.toFixed(1) + 'px'; pl.style.height = hh.toFixed(1) + 'px';
        pl.style.borderRadius = (Math.min(w, hh) * (0.5 - 0.38 * Math.sin(Math.PI * p))).toFixed(1) + 'px'; pl.style.opacity = (Math.sin(Math.PI * clamp(p * 1.05)) * 0.78).toFixed(3); } },
    cut: { dur: 0.04, sfx: (t) => R.cue(t, 'click', 0.4), in: (T, p) => { T.o = p >= 0.5 ? 1 : 0; }, out: (T, p) => { T.o = p < 0.5 ? 1 : 0; } },
  };
  function bars(p) { // thin scan bars of the glitch (never a full-frame flash)
    const g = ov('gbars', 'inset:0;');
    if (p < 0.2 || p > 0.8) { g.style.display = 'none'; return; }
    const k = Math.floor(p * 30);
    g.innerHTML = [0, 1, 2, 3].map((i) => '<i style="position:absolute;left:0;right:0;top:' + Math.floor(R.rnd(k, i + 7) * 1800) + 'px;height:' + (6 + Math.floor(R.rnd(k, i + 11) * 26)) + 'px;background:' + (i % 2 ? 'rgba(0,220,255,.35)' : 'rgba(255,0,90,.3)') + ';transform:translateX(' + ((R.rnd(k, i) - 0.5) * 120).toFixed(0) + 'px)"></i>').join('');
  }
})();
