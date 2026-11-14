// Centrul360 reels v2: the opening "?" and its resolution, made clean (the owner, 14.11: „mult mai clean și insane
// animation, ceva chiar profi”). Two scenes, both on the background grid (the reels' signature):
//   gridq   : the "?" is built from the grid's own squares: cells light up, then flip and extrude in a precise cascade
//             along the stroke, the dot lands last in rose gold, a light sweep passes; it can resolve into a check or a
//             heart (the same cascade, the old cells flip away as the new ones arrive)
//   strokeq : a clean vector "?" drawn by a hairline, then filled as glass, the rose gold dot settles; resolves likewise
// Calm cubic easing, no overshoot. The question (or the line) is set under the glyph, word by word, centred.
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, E, h, esc, place, lerp } = R;
  const T = R.at;
  const calm = (p) => E.inout(clamp(p));
  // the glyphs, on a 7-column lattice (x: column, y: row), in drawing order; the last cells of "q" are its dot
  const G = {
    q: { w: 7, cells: [[0, 2], [0, 1], [1, 1], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1], [6, 1], [6, 2], [5, 2], [6, 3], [5, 3], [5, 4], [4, 4], [4, 5], [3, 5], [3, 6], [4, 6]], dot: [[3, 8], [4, 8]] },
    check: { w: 7, cells: [[0, 3], [1, 3], [1, 4], [2, 4], [2, 5], [3, 5], [3, 4], [4, 4], [4, 3], [5, 3], [5, 2], [6, 2], [6, 1]], dot: [[6, 0]] },
    heart: { w: 7, cells: [[3, 6], [2, 5], [3, 5], [4, 5], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [0, 1], [1, 1], [2, 1], [4, 1], [5, 1], [6, 1], [1, 0], [2, 0], [4, 0], [5, 0]], dot: [] },
  };
  const ROWS = { q: 9, check: 6, heart: 7 };
  const dark = () => R.theme.palette && R.theme.palette.ink === '#ffffff';
  const PAL = () => (dark()
    ? { face: ['#ffffff', '#e9f7f5'], side: '#bfe7e1', edge: 'rgba(255,255,255,.9)', glow: 'rgba(255,255,255,.35)', lit: 'rgba(255,255,255,.22)' }
    : { face: ['#2bbcac', '#14a596'], side: '#0b7f74', edge: 'rgba(255,255,255,.55)', glow: 'rgba(20,165,150,.25)', lit: 'rgba(20,165,150,.12)' });
  const ROSE = { face: ['#fbe3d9', '#eab5a5'], side: '#c98a79', edge: 'rgba(255,255,255,.8)' };

  function rr(g, x, y, w, hh, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // one tile of the grid: k (0..1) its flip-in, d its extrusion (px), lift a light sweep (0..1)
  function tile(g, x, y, s, P, k, d, lift) {
    if (k <= 0.001) return;
    const pad = 6, w = s - pad * 2, cy = y + s / 2, hh = w * k;
    const ty = cy - hh / 2;
    g.save();
    g.globalAlpha = clamp(k * 1.4);
    if (d > 0.3) { g.fillStyle = P.side; rr(g, x + pad + d, ty + d, w, hh, 10); g.fill(); }
    g.shadowColor = 'rgba(8,40,36,.22)'; g.shadowBlur = 18 * k; g.shadowOffsetY = 8 * k;
    const gr = g.createLinearGradient(0, ty, 0, ty + hh); gr.addColorStop(0, P.face[0]); gr.addColorStop(1, P.face[1]);
    g.fillStyle = gr; rr(g, x + pad, ty, w, hh, 10); g.fill();
    g.shadowColor = 'transparent';
    g.strokeStyle = P.edge; g.lineWidth = 1.5; rr(g, x + pad + 0.75, ty + 0.75, w - 1.5, hh - 1.5, 9.5); g.stroke();
    if (lift > 0) { g.fillStyle = 'rgba(255,255,255,' + (0.55 * lift).toFixed(3) + ')'; rr(g, x + pad, ty, w, hh, 10); g.fill(); }
    g.restore();
  }
  // the question / the line under the glyph, centred, words in quickly and each one nudged when it is said
  function words(ctx, p, y) {
    if (p.q === false) return null;
    const st = ctx.stage();
    const txt = p.text || (ctx.lines[0] ? ctx.lines[0].capRich : '');
    const d = R.kt(txt, st, 'q'); d.style.left = '50px'; d.style.width = '760px';
    R.fit(d, 740, p.qh || 260, p.size || 104, 48);
    d.style.top = (y - 250) + 'px'; d.dataset.q = '1';
    const ws = [...d.querySelectorAll('.w')];
    const times = ctx.lines[0] && !p.text ? ctx.lines[0].words.map((w) => w.t) : ws.map((_, i) => ctx.L(0, 0, 0.1 + i * 0.1));
    ws.forEach((w, i) => { const e = w.classList.contains('e'); ctx.anim(w, 'in', ctx.L(0, 0, 0.04) + i * 0.06, { amt: 26, sfx: i === 0 ? 'swoosh_up' : null, gain: 0.3, event: i % 3 === 0 }); ctx.anim(w, 'bump', times[Math.min(i, times.length - 1)] - 0.03, { amt: e ? 0.08 : 0.04 }); });
    ctx.focus(d);
    return d;
  }

  // ------------------------------------------------------------------ gridq
  V.gridq = (ctx, p) => {
    const lay = ctx.layer(0);
    const cv = h('canvas', null, null, lay); cv.width = 1080; cv.height = 1920; cv.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    const g = cv.getContext('2d');
    const S = (R.theme.bg && R.theme.bg.grid && R.theme.bg.grid.size) || 54;
    const gr = R.BG.parts.grid ? R.BG.parts.grid.getBoundingClientRect() : { left: 0, top: 0 };
    const ox = ((gr.left % S) + S) % S, oy = ((gr.top % S) + S) % S; // the grid's own lines: x = ox + k S
    const P = PAL();
    const place2 = (name, cyAbs) => { const gl = G[name], rows = ROWS[name]; const c0 = Math.round((540 - ox) / S - gl.w / 2); const r0 = Math.round((cyAbs - oy) / S - rows / 2);
      return { gl, X: (c) => ox + (c0 + c) * S, Y: (r) => oy + (r0 + r) * S }; };
    const cy = p.cy || 640;
    const A = place2('q', cy);
    const B = p.to ? place2(p.to, cy) : null;
    const tF = T(ctx, p.formAt, ctx.L(0, 0, 0.12)), dF = p.formDur || 1.15;
    const tTo = p.to ? T(ctx, p.toAt, ctx.L(0, 0.5)) : null;
    const nA = A.gl.cells.length, step = dF / (nA + 2);
    const tDot = tF + dF - 0.05;
    // sounds and changes: a soft tick every few cells, the dot, the sweep
    for (let i = 0; i < nA; i += 4) ctx.sfx(tF + i * step, 'tick', 0.22);
    ctx.sfx(tDot + 0.18, 'snap', 0.42); ctx.sfx(tDot + 0.35, 'shimmer', 0.35);
    R.event(tF, 'form'); R.event(tF + dF * 0.5, 'form'); R.event(tDot, 'dot');
    if (tTo != null) { ctx.shot.resolveAt = tTo + 0.7; ctx.sfx(tTo, 'swoosh_up', 0.45); for (let i = 0; i < (B.gl.cells.length); i += 4) ctx.sfx(tTo + 0.15 + i * 0.045, 'tick', 0.2); R.event(tTo, 'resolve'); R.event(tTo + 0.7, 'resolve'); }
    const tSw = tDot + 0.3; // the light sweep after the dot
    // a few grid squares breathing on their own (frame 0 already moves, before the glyph)
    const shimmer = Array.from({ length: 26 }, (_, i) => ({ c: Math.floor(R.rnd(i, 3) * 20) - 2, r: Math.floor(R.rnd(i, 5) * 34) - 2, ph: R.rnd(i, 7) * 6.28, sp: 0.6 + R.rnd(i, 9) * 0.6 }));
    const text = words(ctx, p, p.qy || cy + 300);
    ctx.tick((t) => {
      g.clearRect(0, 0, 1080, 1920);
      // the breathing squares (they fade out as the glyph forms)
      const quiet = 1 - calm((t - tF) / 0.6);
      if (quiet > 0) shimmer.forEach((s2) => { const a = Math.max(0, Math.sin(t * s2.sp * 2 + s2.ph)) * 0.9 * quiet; if (a < 0.02) return; g.fillStyle = P.lit.replace(/[\d.]+\)$/, (0.6 * a).toFixed(3) + ')'); rr(g, ox + s2.c * S + 6, oy + s2.r * S + 6, S - 12, S - 12, 9); g.fill(); });
      const out = tTo != null ? calm((t - tTo) / 0.6) : 0;
      // the "?": each cell first lights its square, then flips in and extrudes
      A.gl.cells.forEach(([c, r], i) => {
        const t0 = tF + i * step, x = A.X(c), y = A.Y(r);
        const lit = clamp((t - t0 + 0.12) / 0.12) * (1 - clamp((t - t0) / 0.2));
        if (lit > 0) { g.fillStyle = P.lit; rr(g, x + 6, y + 6, S - 12, S - 12, 10); g.fill(); }
        let k = calm((t - t0) / 0.3), d = 6 * calm((t - t0 - 0.15) / 0.3);
        if (out > 0) { const ko = calm((t - tTo - i * 0.03) / 0.3); k *= 1 - ko; d *= 1 - ko; }
        const sw = t > tSw ? Math.max(0, 1 - Math.abs((c + r * 0.6) - (t - tSw) * 14) / 2.2) : 0;
        tile(g, x, y, S, P, k, d, sw * (t < tSw + 1.2 ? 1 : 0));
      });
      // the dot: lands from above, calm, in rose gold
      A.gl.dot.forEach(([c, r], j) => {
        const q = calm((t - tDot - j * 0.04) / 0.45); if (q <= 0) return;
        const x = A.X(c), y = A.Y(r) - (1 - q) * 70;
        let k = q; if (out > 0) k *= 1 - calm((t - tTo) / 0.3);
        tile(g, x, y, S, ROSE, k, 6 * q, 0);
      });
      // the resolution: the new glyph's cells arrive in the same cascade (its last cell in rose gold)
      if (B && t > tTo) B.gl.cells.concat(B.gl.dot).forEach(([c, r], i) => {
        const t0 = tTo + 0.15 + i * 0.045, k = calm((t - t0) / 0.3), d = 6 * calm((t - t0 - 0.12) / 0.3);
        const last = i >= B.gl.cells.length || (!B.gl.dot.length && i === B.gl.cells.length - 1);
        const sw = t > tTo + 1.0 ? Math.max(0, 1 - Math.abs((c + r * 0.6) - (t - tTo - 1.0) * 14) / 2.2) : 0;
        tile(g, B.X(c), B.Y(r), S, last ? ROSE : P, k, d, sw);
      });
    });
    if (text && p.textOut != null) ctx.anim(text, 'outUp', T(ctx, p.textOut));
  };

  // ------------------------------------------------------------------ strokeq
  const PATH = {
    q: 'M -120 -175 C -120 -300, 120 -300, 120 -175 C 120 -95, 0 -85, 0 5 L 0 45',
    check: 'M -150 10 L -45 115 L 160 -110',
    heart: 'M 0 140 C -230 0, -170 -180, 0 -70 C 170 -180, 230 0, 0 140 Z',
  };
  V.strokeq = (ctx, p) => {
    const lay = ctx.layer(0);
    const cx = 540, cy = p.cy || 640, dk = dark();
    const glass = dk ? 'rgba(255,255,255,.92)' : '#14a596', hair = dk ? '#ffffff' : '#0f8a7e';
    const id = 'sq' + ctx.shot.i;
    const svg = h('div', 'abs', '<svg width="1080" height="1920" style="position:absolute;left:0;top:0;overflow:visible"><defs>' +
      '<linearGradient id="' + id + 'g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + (dk ? '#ffffff' : '#2bbcac') + '"/><stop offset="1" stop-color="' + (dk ? '#dff3f0' : '#0f8a7e') + '"/></linearGradient>' +
      '<radialGradient id="' + id + 'r" cx=".35" cy=".3"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#fbe3d9"/><stop offset=".75" stop-color="#eab5a5"/><stop offset="1" stop-color="#cf8f7d"/></radialGradient>' +
      '<filter id="' + id + 's" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#082824" flood-opacity=".22"/></filter></defs>' +
      '<g transform="translate(' + cx + ' ' + cy + ')">' +
      '<path class="fill" d="' + PATH.q + '" fill="none" stroke="url(#' + id + 'g)" stroke-width="66" stroke-linecap="round" stroke-linejoin="round" pathLength="1" style="stroke-dasharray:1 1;stroke-dashoffset:1" filter="url(#' + id + 's)"/>' +
      '<path class="spec" d="' + PATH.q + '" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="10" stroke-linecap="round" pathLength="1" style="stroke-dasharray:1 1;stroke-dashoffset:1" transform="translate(-10 -10)"/>' +
      '<path class="hair" d="' + PATH.q + '" fill="none" stroke="' + hair + '" stroke-width="3" stroke-linecap="round" pathLength="1" style="stroke-dasharray:1 1;stroke-dashoffset:1"/>' +
      '<circle class="dot" cx="0" cy="150" r="40" fill="url(#' + id + 'r)" filter="url(#' + id + 's)"/>' +
      (p.to ? '<path class="to" d="' + PATH[p.to] + '" fill="none" stroke="url(#' + id + 'g)" stroke-width="66" stroke-linecap="round" stroke-linejoin="round" pathLength="1" style="stroke-dasharray:1 1;stroke-dashoffset:1" filter="url(#' + id + 's)"/>' : '') +
      '</g></svg>', lay);
    const q = (s) => svg.querySelector(s);
    const fill = q('.fill'), spec = q('.spec'), hairE = q('.hair'), dot = q('.dot'), to = q('.to');
    // the grid underneath: a few squares breathe from frame 0, and the squares the stroke passes over light up briefly
    const cv = h('canvas', null, null, lay); cv.width = 1080; cv.height = 1920; cv.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    lay.insertBefore(cv, svg);
    const g = cv.getContext('2d'), P = PAL();
    const S = (R.theme.bg && R.theme.bg.grid && R.theme.bg.grid.size) || 54;
    const gb = R.BG.parts.grid ? R.BG.parts.grid.getBoundingClientRect() : { left: 0, top: 0 };
    const ox = ((gb.left % S) + S) % S, oy = ((gb.top % S) + S) % S;
    const trail = (pathEl, t0, dur) => { const L = pathEl.getTotalLength(), seen = new Set(), out = [];
      for (let i = 0; i <= 80; i++) { const pt = pathEl.getPointAtLength(L * i / 80); const c = Math.floor((cx + pt.x - ox) / S), r = Math.floor((cy + pt.y - oy) / S); const k = c + ',' + r; if (seen.has(k)) continue; seen.add(k);
        // the time the stroke reaches this point (the dash follows the calm easing)
        let lo = 0, hi = 1; for (let j = 0; j < 18; j++) { const m = (lo + hi) / 2; if (E.inout(m) < i / 80) lo = m; else hi = m; } out.push({ c, r, ts: t0 + lo * dur }); }
      return out; };
    const shimmer = Array.from({ length: 22 }, (_, i) => ({ c: Math.floor(R.rnd(i, 3) * 20), r: Math.floor(R.rnd(i, 5) * 34), ph: R.rnd(i, 7) * 6.28, sp: 0.5 + R.rnd(i, 9) * 0.6 }));
    const tF = T(ctx, p.formAt, ctx.L(0, 0, 0.1)), dF = p.formDur || 1.0, tDot = tF + dF + 0.05;
    const tTo = p.to ? T(ctx, p.toAt, ctx.L(0, 0.5)) : null;
    ctx.sfx(tF, 'swoosh', 0.35); ctx.sfx(tDot + 0.3, 'snap', 0.4); ctx.sfx(tDot + 0.4, 'shimmer', 0.3);
    R.event(tF, 'draw'); R.event(tF + dF * 0.5, 'draw'); R.event(tDot, 'dot');
    if (tTo != null) { ctx.shot.resolveAt = tTo + 0.7; ctx.sfx(tTo, 'swoosh_up', 0.45); R.event(tTo, 'resolve'); R.event(tTo + 0.6, 'resolve'); }
    words(ctx, p, p.qy || cy + 300);
    const trA = trail(q('.hair'), tF, dF), trB = to ? trail(to, (tTo || 0) + 0.2, 0.7) : [];
    ctx.tick((t) => {
      g.clearRect(0, 0, 1080, 1920);
      const quiet = 1 - calm((t - tF) / 0.6);
      if (quiet > 0) shimmer.forEach((s2) => { const a = Math.max(0, Math.sin(t * s2.sp * 2 + s2.ph)) * quiet; if (a < 0.03) return; g.globalAlpha = 0.55 * a; g.fillStyle = P.lit; rr(g, ox + s2.c * S + 6, oy + s2.r * S + 6, S - 12, S - 12, 9); g.fill(); });
      trA.concat(trB).forEach((c) => { const a = t >= c.ts ? 1 - clamp((t - c.ts) / 0.55) : 0; if (a <= 0) return; g.globalAlpha = a; g.fillStyle = P.lit; rr(g, ox + c.c * S + 4, oy + c.r * S + 4, S - 8, S - 8, 10); g.fill(); });
      g.globalAlpha = 1;
      const hp = calm((t - tF) / dF), fp = calm((t - tF - 0.18) / dF);
      const out = tTo != null ? calm((t - tTo) / 0.45) : 0;
      hairE.style.strokeDashoffset = String(1 - hp); hairE.style.opacity = String((1 - fp * 0.85) * (1 - out));
      fill.style.strokeDashoffset = String(1 - fp); fill.style.opacity = String(1 - out);
      spec.style.strokeDashoffset = String(1 - calm((t - tF - 0.35) / dF)); spec.style.opacity = String(0.9 * (1 - out));
      const dq = calm((t - tDot) / 0.5); dot.setAttribute('cy', (150 - (1 - dq) * 80).toFixed(1)); dot.style.opacity = String(dq * (1 - out));
      if (to) to.style.strokeDashoffset = String(1 - calm((t - tTo - 0.2) / 0.7));
    });
  };
})();
