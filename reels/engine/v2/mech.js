// Centrul360 reels v2: the mechanism devices, in 3D (orthographic, drawn on a canvas, calm easing, brand colours).
// Each reel gets its own core visual for "how it works" (the owner, 14.11: „ai grijă la animațiile prea asemănătoare”):
//   beam  : an isometric stack of glass layers (piele, grăsime, mușchi) that tilts; focused energy converges to a point
//           at a depth marker; an optional warm glow in the skin layer (radiofrecvență); a closing chip
//   cells : a 3D field of fat cells under a glass skin sheet; a focused ultrasound cone narrows to a point at a depth
//           marker; the cells at the focus soften and dissolve, the others and the skin stay as they are
// The words on the layers are engraved on their front faces (decor); the spoken words stay in the captions.
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, E, h, lerp } = R;
  const T = R.at;
  const when = (ctx, a, d) => (typeof a === 'string' ? ctx.wordAt(0, a, -0.05) : a != null ? T(ctx, a) : d); // [line, frac] or a word (regex)
  const calm = (p) => E.inout(clamp(p));
  const dark = () => R.theme.palette && R.theme.palette.ink === '#ffffff';
  // yaw turns around the vertical axis, pitch tilts the top toward the viewer; returns [x, y, depth]
  const camera = (yaw, pitch, k, cx, cy) => { const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const f = (x, y, z) => { const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw; const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp; return [cx + x1 * k, cy - y2 * k, z2]; };
    f.yaw = yaw; f.pitch = pitch; f.k = k; return f; };
  const poly = (g, pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
  // one box (a layer): faces with their own fills, a hairline on the edges, a label engraved on the front face
  function box(g, P, b, st) {
    const { x0, x1, y0, y1, z0, z1 } = b;
    const top = [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)];
    const front = [P(x0, y1, z1), P(x1, y1, z1), P(x1, y0, z1), P(x0, y0, z1)];
    const sx = P.yaw < 0 ? x1 : x0;
    const side = [P(sx, y1, z1), P(sx, y1, z0), P(sx, y0, z0), P(sx, y0, z1)];
    g.save(); g.globalAlpha = st.alpha != null ? st.alpha : 1;
    const grad = (a, b2, c0, c1) => { const gr = g.createLinearGradient(a[0], a[1], b2[0], b2[1]); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; };
    g.fillStyle = grad(side[0], side[3], st.side[0], st.side[1]); poly(g, side); g.fill();
    g.fillStyle = grad(front[0], front[3], st.front[0], st.front[1]); poly(g, front); g.fill();
    g.fillStyle = grad(top[0], top[3], st.top[0], st.top[1]); poly(g, top); g.fill();
    if (st.glow > 0) { g.save(); g.shadowColor = st.glowColor || 'rgba(255,255,255,.9)'; g.shadowBlur = 26 * st.glow; g.strokeStyle = st.glowColor || '#fff'; g.globalAlpha *= st.glow; g.lineWidth = 3; poly(g, top); g.stroke(); poly(g, front); g.stroke(); g.restore(); }
    g.strokeStyle = st.edge; g.lineWidth = 1.5; g.lineJoin = 'round';
    poly(g, top); g.stroke(); poly(g, front); g.stroke(); poly(g, side); g.stroke();
    if (st.label) { // the face's own axes: along x (the front edge) and straight down
      const a = front[0], bx = front[1], dn = front[3]; const W = x1 - x0, H = y1 - y0;
      const ux = [(bx[0] - a[0]) / W, (bx[1] - a[1]) / W], uy = [(dn[0] - a[0]) / H, (dn[1] - a[1]) / H];
      g.save(); g.setTransform(ux[0], ux[1], uy[0], uy[1], a[0], a[1]);
      g.font = '800 ' + Math.min(26, H * 0.42).toFixed(0) + 'px "Inter Variable", system-ui, sans-serif'; try { g.letterSpacing = '6px'; } catch (e) { /* older canvas */ }
      g.fillStyle = st.ink; g.globalAlpha = (st.alpha != null ? st.alpha : 1) * (st.labelA != null ? st.labelA : 1); g.textBaseline = 'middle'; g.textAlign = 'center';
      g.fillText(st.label, W * (st.labelX || 0.5), H / 2 + 1); g.restore();
    }
    g.restore();
  }
  // a circle lying in a horizontal plane, projected
  const ring = (P, x, y, z, r, n = 48) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return P(x + Math.cos(a) * r, y, z + Math.sin(a) * r); });
  const chip = (ctx, st, text, ic, y) => { const d = h('div', 'tx abs', '<span class="chip acc">' + (ic ? R.icon(ic) : '') + R.rich(text) + '</span>', st); place(d, 50, y); d.style.width = '760px'; d.style.textAlign = 'center'; return d; };
  const place = R.place;
  // the applicator: a small rounded glass head with a light strip, floating above the layers
  function applicator(g, P, x, y, z, a, dk) {
    if (a <= 0) return;
    const st = { alpha: a, top: ['#ffffff', '#f3fbfa'], front: ['#ffffff', dk ? '#d9f1ee' : '#e8f5f3'], side: [dk ? '#d2ece8' : '#dcefec', dk ? '#b5ddd7' : '#c6e4df'], edge: dk ? 'rgba(255,255,255,.95)' : 'rgba(15,138,126,.45)' };
    box(g, P, { x0: x - 74, x1: x + 74, y0: y, y1: y + 58, z0: z - 52, z1: z + 52 }, st);
    const l0 = P(x - 54, y + 10, z + 52), l1 = P(x + 54, y + 10, z + 52);
    g.save(); g.globalAlpha = a; g.strokeStyle = '#5fd4c6'; g.lineWidth = 6; g.lineCap = 'round'; g.shadowColor = '#5fd4c6'; g.shadowBlur = 14; g.beginPath(); g.moveTo(l0[0], l0[1]); g.lineTo(l1[0], l1[1]); g.stroke(); g.restore();
  }
  // a hairline dimension: from a to b (screen points), ticks at both ends, drawn progressively (q 0..1)
  function dimension(g, a, b, q, col, tick = 14) {
    if (q <= 0) return;
    const lw = Math.max(2, g.lineWidth); g.save(); g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
    const m = [lerp(a[0], b[0], q), lerp(a[1], b[1], q)];
    g.beginPath(); g.moveTo(a[0] - tick / 2, a[1]); g.lineTo(a[0] + tick / 2, a[1]); g.moveTo(a[0], a[1]); g.lineTo(m[0], m[1]); g.stroke();
    if (q >= 1) { g.beginPath(); g.moveTo(b[0] - tick / 2, b[1]); g.lineTo(b[0] + tick / 2, b[1]); g.stroke(); }
    g.restore();
  }

  const rightEdge = (P, W, D) => [[W, D], [W, -D], [-W, D], [-W, -D]].reduce((a, c) => (P(c[0], 0, c[1])[0] > P(a[0], 0, a[1])[0] ? c : a));
  // ------------------------------------------------------------------ beam: the layer stack, focused energy, the depth marker
  // p: { layers: [[name, label, thickness], …] (top first), target: index of the layer the focus lands in, rf: index of
  //      a layer that warms (optional), at: { skin, fat, energy, tilt, close } as [line, frac] or regexes of the words,
  //      chips: [{t, ic, at}], cx, cy }
  V.beam = (ctx, p) => {
    const st = ctx.stage(), dk = dark();
    const cv = h('canvas', null, null, st); cv.width = 860; cv.height = 900; cv.style.cssText = 'position:absolute;left:0;top:0;width:860px;height:900px';
    const g = cv.getContext('2d');
    const at = (k, re, f) => (p.at && p.at[k] != null ? when(ctx, p.at[k]) : re ? ctx.wordAt(0, re, -0.05) : ctx.L(0, f));
    const tIn = ctx.t0 + 0.02, tSkin = at('skin', 'relax'), tFat = at('fat', 'depozit'), tEn = at('energy', 'HIFU'), tTilt = at('tilt', 'strat'), tClose = at('close', 'opera');
    const LY = p.layers || [['piele', 'PIELE', 46], ['grasime', 'GRĂSIME', 120], ['muschi', 'MUȘCHI', 84]];
    const target = p.target != null ? p.target : 1, rf = p.rf != null ? p.rf : 0;
    const W = 250, D = 168;
    const PAL = dk
      ? [{ top: ['rgba(255,255,255,.66)', 'rgba(255,255,255,.5)'], front: ['rgba(255,255,255,.5)', 'rgba(255,255,255,.34)'], side: ['rgba(255,255,255,.36)', 'rgba(255,255,255,.22)'], edge: 'rgba(255,255,255,.95)', ink: '#0b7f74' },
        { top: ['#fff3ee', '#fbe3d9'], front: ['#f6cfc1', '#eab5a5'], side: ['#e2a593', '#cf8f7d'], edge: 'rgba(255,255,255,.9)', ink: 'rgba(59,28,20,.62)' },
        { top: ['rgba(255,255,255,.3)', 'rgba(255,255,255,.2)'], front: ['rgba(255,255,255,.22)', 'rgba(255,255,255,.12)'], side: ['rgba(255,255,255,.14)', 'rgba(255,255,255,.08)'], edge: 'rgba(255,255,255,.6)', ink: 'rgba(255,255,255,.85)' }]
      : [{ top: ['rgba(255,255,255,.95)', 'rgba(238,247,246,.9)'], front: ['rgba(230,245,243,.95)', 'rgba(214,239,236,.9)'], side: ['rgba(205,233,229,.95)', 'rgba(188,226,221,.9)'], edge: 'rgba(15,138,126,.5)', ink: '#0b7f74' },
        { top: ['#fff3ee', '#fbe3d9'], front: ['#f6cfc1', '#eab5a5'], side: ['#e2a593', '#cf8f7d'], edge: 'rgba(255,255,255,.95)', ink: 'rgba(59,28,20,.62)' },
        { top: ['#eef7f6', '#e3f3f1'], front: ['#d9efec', '#cbe8e4'], side: ['#c3e3df', '#b2dbd6'], edge: 'rgba(15,138,126,.35)', ink: 'rgba(11,127,116,.7)' }];
    const total = LY.reduce((a, l) => a + l[2], 0);
    // the chips under the stack, one at a time (centred)
    const chips = (p.chips || [{ t: 'HIFU · radiofrecvență', ic: 'zap', at: null, tt: tEn }, { t: 'Fără operație', ic: 'check', tt: tClose }]).map((c) => Object.assign({}, c, { tt: when(ctx, c.at, c.tt) }));
    chips.forEach((c, i) => { const d = chip(ctx, st, c.t, c.ic, p.chipY || 770); ctx.anim(d, 'pop', c.tt, { sfx: 'pop', gain: 0.4 }); if (chips[i + 1]) ctx.anim(d, 'outUp', chips[i + 1].tt - 0.15, { dur: 0.15 }); });
    // sounds and events, on the voice
    ctx.sfx(tIn + 0.05, 'swoosh_up', 0.4); R.event(tIn, 'stack');
    LY.forEach((_, i) => R.event(tIn + 0.12 * i + 0.3, 'layer'));
    ctx.sfx(tSkin, 'pop', 0.3); R.event(tSkin, 'layer:skin');
    ctx.sfx(tFat, 'pop', 0.32); R.event(tFat, 'layer:fat');
    ctx.sfx(tEn, 'snap', 0.4); ctx.sfx(tEn + 0.3, 'riser_s', 0.35); ctx.sfx(tEn + 0.85, 'shimmer', 0.4); R.event(tEn, 'energy'); R.event(tEn + 0.85, 'focus');
    ctx.sfx(tTilt, 'whoosh_s', 0.32); R.event(tTilt, 'tilt'); ctx.sfx(tTilt + 0.55, 'tick', 0.35); R.event(tTilt + 0.55, 'depth');
    ctx.sfx(tClose + 0.1, 'chime', 0.35); R.event(tClose, 'close');
    ctx.focus(cv);
    ctx.tick((t) => {
      g.clearRect(0, 0, 860, 900);
      const lt = t - ctx.t0;
      const tl = calm((t - tTilt) / 0.9), cl = calm((t - tClose) / 0.8);
      const yaw = -0.6 + 0.012 * lt + 0.16 * tl, pitch = 0.42 + 0.16 * tl - 0.06 * cl;
      const gap = 30 * tl * (1 - cl);
      const P = camera(yaw, pitch, 1 + 0.02 * clamp(lt / 6), p.cx || 430, (p.cy || 420) + 40 * (1 - calm(lt / 0.9)) * 0);
      // the layers (bottom first), each dropping in calmly
      let y = total / 2 + gap * (LY.length - 1) / 2; const B = [];
      LY.forEach((l, i) => { const y1 = y, y0 = y - l[2]; B.push({ y0, y1 }); y = y0 - gap; });
      // the soft shadow under the stack
      g.save(); g.filter = 'blur(26px)'; g.fillStyle = dk ? 'rgba(4,40,36,.32)' : 'rgba(18,32,31,.16)'; poly(g, ring(P, 0, B[B.length - 1].y0 - 40, 0, 260, 40)); g.fill(); g.restore();
      for (let i = LY.length - 1; i >= 0; i--) {
        const d = tIn + 0.12 * (LY.length - 1 - i), q = calm((t - d) / 0.7);
        if (q <= 0) continue;
        const dy = (1 - q) * 120;
        const lit = i === 0 ? calm((t - tSkin) / 0.4) * (1 - calm((t - tFat) / 0.4)) : i === target ? calm((t - tFat) / 0.4) * (1 - calm((t - tEn - 0.4) / 0.6) * 0.6) : 0;
        const st0 = Object.assign({}, PAL[Math.min(i, 2)], { alpha: q, label: LY[i][1], labelX: i === 0 ? 0.26 : 0.5, glow: lit * 0.9 + (i === target ? 0.5 * calm((t - tTilt) / 0.5) * (1 - cl) : 0), glowColor: i === target ? '#ffffff' : (dk ? '#ffffff' : '#14a596') });
        box(g, P, { x0: -W, x1: W, y0: B[i].y0 + dy, y1: B[i].y1 + dy, z0: -D, z1: D }, st0);
        // radiofrecvență: a warm glow spreading inside the skin layer
        if (i === rf && p.rf !== false) { const w = calm((t - tEn - 0.5) / 0.9) * (1 - cl * 0.7); if (w > 0) { g.save(); g.globalAlpha = 0.55 * w; const c = P(0, (B[i].y0 + B[i].y1) / 2, 0); const gr = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], 320); gr.addColorStop(0, 'rgba(251,227,217,.95)'); gr.addColorStop(1, 'rgba(251,227,217,0)'); g.fillStyle = gr; poly(g, [P(-W, B[i].y1, -D), P(W, B[i].y1, -D), P(W, B[i].y1, D), P(W, B[i].y0, D), P(-W, B[i].y0, D), P(-W, B[i].y1, D)]); g.fill(); g.restore(); } }
      }
      // the applicator above the stack and the focused energy (drawn over the glass, fainter inside it)
      const aq = calm((t - tEn) / 0.5) * (1 - cl);
      const yTop = B[0].y1, yApp = yTop + 120 - 60 * aq;
      const F = [0, (B[target].y0 + B[target].y1) / 2, 0];
      applicator(g, P, 0, yApp, 0, aq, dk);
      const bq = calm((t - tEn - 0.35) / 0.6) * (1 - cl);
      if (bq > 0) {
        const fp = P(F[0], F[1], F[2]);
        const src = ring(P, 0, yApp, 0, 46, 12);
        g.save(); g.globalAlpha = 0.3 * bq; g.fillStyle = dk ? 'rgba(234,181,165,.9)' : 'rgba(20,165,150,.6)';
        const lm = src.reduce((a, s) => (s[0] < a[0] ? s : a)), rm = src.reduce((a, s) => (s[0] > a[0] ? s : a));
        poly(g, [lm, rm, fp]); g.fill(); g.restore();
        src.forEach((s, i) => { const e = [lerp(s[0], fp[0], bq), lerp(s[1], fp[1], bq)]; const gr = g.createLinearGradient(s[0], s[1], fp[0], fp[1]); gr.addColorStop(0, dk ? 'rgba(255,255,255,.5)' : 'rgba(20,165,150,.3)'); gr.addColorStop(0.55, dk ? 'rgba(234,181,165,.95)' : 'rgba(20,165,150,.8)'); gr.addColorStop(1, '#cf8f7d');
          g.save(); g.strokeStyle = dk ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.6)'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(e[0], e[1]); g.stroke(); g.restore();
          g.strokeStyle = gr; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(e[0], e[1]); g.stroke(); });
        // the focal point: a crisp ring, a soft glow, a calm pulse
        const fq = calm((t - tEn - 0.85) / 0.4);
        if (fq > 0) { const pu = 1 + 0.06 * Math.sin((t - tEn) * 5);
          g.save(); g.globalAlpha = fq; const gr = g.createRadialGradient(fp[0], fp[1], 0, fp[0], fp[1], 70 * pu); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.35, 'rgba(251,227,217,.6)'); gr.addColorStop(1, 'rgba(251,227,217,0)'); g.fillStyle = gr; g.beginPath(); g.arc(fp[0], fp[1], 70 * pu, 0, 6.283); g.fill();
          g.strokeStyle = '#cf8f7d'; g.lineWidth = 3; poly(g, ring(P, F[0], F[1], F[2], 34 * pu)); g.stroke(); g.restore(); }
        // the depth marker: from the skin's surface down to the focus, beside the stack's front corner
        const mq = calm((t - tTilt - 0.5) / 0.6);
        if (mq > 0) { const [ex, ez] = rightEdge(P, W, D); const c0 = P(ex, yTop, ez), c1 = P(ex, F[1], ez); const off = 44; g.save(); g.lineWidth = 3; dimension(g, [c0[0] + off, c0[1]], [c1[0] + off, c1[1]], mq, dk ? '#ffffff' : '#0f8a7e', 22); g.restore();
          if (mq >= 1) { g.save(); g.setLineDash([6, 8]); g.strokeStyle = dk ? 'rgba(255,255,255,.75)' : 'rgba(15,138,126,.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(c1[0] + off - 8, c1[1]); g.lineTo(fp[0] + 40, fp[1]); g.stroke(); g.restore();
            g.save(); g.fillStyle = '#eab5a5'; g.beginPath(); g.arc(c1[0] + off, c1[1], 7, 0, 6.283); g.fill(); g.restore(); } }
      }
    });
  };

  // ------------------------------------------------------------------ cells: a 3D field of fat cells, a focused cone, dissolving
  // p: { at: { app, cone, depth, dissolve } (or the words: "Liposonix", "doar"), chips: [{t, ic, at}], radius }
  V.cells = (ctx, p) => {
    const st = ctx.stage(), dk = dark();
    const cv = h('canvas', null, null, st); cv.width = 860; cv.height = 900; cv.style.cssText = 'position:absolute;left:0;top:0;width:860px;height:900px';
    const g = cv.getContext('2d');
    const at = (k, re, f) => (p.at && p.at[k] != null ? when(ctx, p.at[k]) : re ? ctx.wordAt(0, re, -0.05) : ctx.L(0, f));
    const tIn = ctx.t0 + 0.02, tApp = at('app', 'Liposonix'), tCone = tApp + 0.35, tDepth = at('depth', 'doar'), tDis = tDepth + 0.25;
    const W = 270, D = 170, r = 23, sp = 50;
    const cells = [];
    [[-12, 0], [28, 0.5]].forEach(([yy, off], L) => { for (let z = -D + r + 4; z <= D - r - 4; z += sp * 0.866) for (let x = -W + r + 4 + ((Math.round((z + D) / (sp * 0.866)) % 2) * sp / 2) + off * 12; x <= W - r - 4; x += sp) {
      const i = cells.length; const jx = (R.rnd(i, 2) - 0.5) * 8, jz = (R.rnd(i, 3) - 0.5) * 8; cells.push({ x: x + jx, y: yy + (R.rnd(i, 4) - 0.5) * 6, z: z + jz, r: r * (0.88 + R.rnd(i, 5) * 0.2), d: Math.hypot(x, z), L }); } });
    const yLo = -40, yHi = 56;
    const F = [0, 8, 0], RF = p.radius || 150;
    const chips = (p.chips || [{ t: 'Liposonix', ic: 'zap', tt: tApp }, { t: 'Doar stratul de grăsime', ic: 'target', tt: tDepth }]).map((c) => Object.assign({}, c, { tt: when(ctx, c.at, c.tt) }));
    chips.forEach((c, i) => { const d = chip(ctx, st, c.t, c.ic, p.chipY || 770); ctx.anim(d, 'pop', c.tt, { sfx: 'pop', gain: 0.4 }); if (chips[i + 1]) ctx.anim(d, 'outUp', chips[i + 1].tt - 0.15, { dur: 0.15 }); });
    ctx.sfx(tIn + 0.05, 'swoosh_up', 0.4); R.event(tIn, 'field'); R.event(tIn + 0.35, 'cells');
    ctx.sfx(tApp, 'snap', 0.4); R.event(tApp, 'applicator');
    ctx.sfx(tCone, 'riser_s', 0.35); R.event(tCone, 'cone'); R.event(tCone + 0.6, 'focus'); ctx.sfx(tCone + 0.6, 'shimmer', 0.35);
    ctx.sfx(tDepth + 0.1, 'tick', 0.35); R.event(tDepth, 'depth');
    ctx.sfx(tDis, 'sparkle', 0.35); R.event(tDis, 'dissolve'); R.event(tDis + 0.8, 'dissolve');
    const rose = dk ? ['#fffaf7', '#fbe3d9', '#eab5a5', 'rgba(255,255,255,.5)'] : ['#fffaf7', '#fbe3d9', '#eab5a5', 'rgba(207,143,125,.55)'];
    ctx.focus(cv);
    ctx.tick((t) => {
      g.clearRect(0, 0, 860, 900);
      const lt = t - ctx.t0;
      const P = camera(-0.42 + 0.015 * lt, 0.74, 1.18 + 0.03 * clamp(lt / 5), 430, 430);
      const fq = calm((t - tIn) / 0.5);
      // the soft shadow, the glass tray of the fat layer (back faces first)
      g.save(); g.filter = 'blur(26px)'; g.fillStyle = dk ? 'rgba(4,40,36,.3)' : 'rgba(18,32,31,.14)'; g.globalAlpha = fq; poly(g, ring(P, 0, yLo - 50, 0, 270, 40)); g.fill(); g.restore();
      g.save(); g.globalAlpha = fq; g.fillStyle = dk ? 'rgba(255,255,255,.08)' : 'rgba(20,165,150,.05)'; poly(g, [P(-W, yLo, -D), P(W, yLo, -D), P(W, yLo, D), P(-W, yLo, D)]); g.fill();
      g.strokeStyle = dk ? 'rgba(255,255,255,.4)' : 'rgba(15,138,126,.28)'; g.lineWidth = 1.5; poly(g, [P(-W, yLo, -D), P(W, yLo, -D), P(W, yLo, D), P(-W, yLo, D)]); g.stroke(); g.restore();
      // the cells, far first; those near the focus soften and dissolve
      const proj = cells.map((c, i) => { const s = P(c.x, c.y, c.z); return { c, i, s }; }).sort((a, b) => a.s[2] - b.s[2]);
      const fp = P(F[0], F[1], F[2]);
      const coneQ = calm((t - tCone) / 0.6), appQ = calm((t - tApp) / 0.5);
      const yA = yHi + 150 - 50 * appQ;
      const drawCone = () => {
        if (coneQ <= 0) return;
        const top = ring(P, 0, yA, 0, 92, 40);
        const lm = top.reduce((a, q) => (q[0] < a[0] ? q : a)), rm = top.reduce((a, q) => (q[0] > a[0] ? q : a));
        const mid = (a) => [lerp(a[0], fp[0], coneQ), lerp(a[1], fp[1], coneQ)];
        g.save(); const gr = g.createLinearGradient(0, lm[1], 0, fp[1]); gr.addColorStop(0, 'rgba(95,212,198,.16)'); gr.addColorStop(1, 'rgba(20,165,150,.6)');
        g.fillStyle = gr; poly(g, [lm, rm, mid(rm), mid(lm)]); g.fill();
        g.strokeStyle = 'rgba(15,138,126,.9)'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(lm[0], lm[1]); g.lineTo(mid(lm)[0], mid(lm)[1]); g.moveTo(rm[0], rm[1]); g.lineTo(mid(rm)[0], mid(rm)[1]); g.stroke(); g.restore();
      };
      const particles = [];
      let coneDrawn = false;
      proj.forEach(({ c, i, s }) => {
        if (!coneDrawn && s[2] > fp[2]) { drawCone(); coneDrawn = true; }
        const appear = calm((t - tIn - 0.05 - c.d / 1100 - c.L * 0.08) / 0.45);
        if (appear <= 0) return;
        const near = c.d < RF ? 1 - c.d / RF * 0.35 : 0;
        const dq = near ? calm((t - tDis - c.d / 500) / 1.5) : 0;
        const rr = c.r * appear * (1 - 0.8 * dq), a = appear * (1 - 0.92 * dq);
        if (dq > 0) for (let k = 0; k < 3; k++) { const u = clamp(dq * 1.2 - k * 0.12); if (u <= 0 || u >= 1) continue; const ang = R.rnd(i, 10 + k) * 6.283; particles.push([s[0] + Math.cos(ang) * (rr + 30 * u), s[1] - 50 * u + Math.sin(ang) * 10 * u, 1 - u, 3 + R.rnd(i, 20 + k) * 2]); }
        if (rr < 0.5) return;
        g.save(); g.globalAlpha = a;
        const gr = g.createRadialGradient(s[0] - rr * 0.35, s[1] - rr * 0.4, rr * 0.1, s[0], s[1], rr);
        gr.addColorStop(0, rose[0]); gr.addColorStop(0.55, rose[1]); gr.addColorStop(1, rose[2]);
        g.fillStyle = gr; g.beginPath(); g.arc(s[0], s[1], rr, 0, 6.283); g.fill();
        g.strokeStyle = rose[3]; g.lineWidth = 1.5; g.stroke();
        g.restore();
      });
      if (!coneDrawn) drawCone();
      // the focus: a soft glow and a crisp ring in the plane
      const fo = calm((t - tCone - 0.55) / 0.4);
      if (fo > 0) { const pu = 1 + 0.05 * Math.sin((t - tCone) * 5); g.save(); g.globalAlpha = fo; const gr = g.createRadialGradient(fp[0], fp[1], 0, fp[0], fp[1], 90 * pu); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.4, 'rgba(95,212,198,.45)'); gr.addColorStop(1, 'rgba(95,212,198,0)'); g.fillStyle = gr; g.beginPath(); g.arc(fp[0], fp[1], 90 * pu, 0, 6.283); g.fill();
        g.strokeStyle = '#14a596'; g.lineWidth = 2.5; poly(g, ring(P, F[0], F[1], F[2], 46 * pu)); g.stroke(); g.restore(); }
      particles.forEach(([x, y, a, rr]) => { g.save(); g.globalAlpha = a * 0.9; g.fillStyle = a > 0.5 ? '#eab5a5' : '#5fd4c6'; g.beginPath(); g.arc(x, y, rr, 0, 6.283); g.fill(); g.restore(); });
      // the tray's front edges and its label
      g.save(); g.globalAlpha = fq;
      box(g, P, { x0: -W, x1: W, y0: yLo, y1: yHi, z0: -D, z1: D }, { alpha: fq * 1, top: ['rgba(0,0,0,0)', 'rgba(0,0,0,0)'], front: [dk ? 'rgba(255,255,255,.1)' : 'rgba(20,165,150,.06)', dk ? 'rgba(255,255,255,.16)' : 'rgba(20,165,150,.1)'], side: [dk ? 'rgba(255,255,255,.06)' : 'rgba(20,165,150,.04)', dk ? 'rgba(255,255,255,.1)' : 'rgba(20,165,150,.07)'], edge: dk ? 'rgba(255,255,255,.55)' : 'rgba(15,138,126,.35)', ink: dk ? 'rgba(255,255,255,.9)' : 'rgba(11,127,116,.75)', label: p.fatLabel || 'GRĂSIME', labelA: 0.9 });
      g.restore();
      // the applicator, above the field
      applicator(g, P, 0, yA + 60 * (1 - appQ), 0, appQ, dk);
      // the depth marker: the fat layer's thickness, beside the front corner, with the focus level
      const mq = calm((t - tDepth) / 0.6);
      if (mq > 0) { const off = 40; const [ex, ez] = rightEdge(P, W, D); const c0 = P(ex, yHi, ez), c1 = P(ex, yLo, ez); const col = '#cf8f7d';
        g.save(); g.lineWidth = 3; dimension(g, [c0[0] + off, c0[1]], [c1[0] + off, c1[1]], mq, col, 22); g.restore();
        if (mq >= 1) { const cf = P(ex, F[1], ez); g.save(); g.fillStyle = '#14a596'; g.beginPath(); g.arc(cf[0] + off, cf[1], 7, 0, 6.283); g.fill(); g.setLineDash([6, 8]); g.strokeStyle = 'rgba(20,165,150,.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cf[0] + off - 10, cf[1]); g.lineTo(fp[0] + 48, fp[1]); g.stroke(); g.restore(); } }
    });
  };
})();
