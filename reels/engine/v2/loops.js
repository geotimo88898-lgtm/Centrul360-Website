// Centrul360 reels v2: the open-loop beats and the save ending (14.11, the short-form structure: Hook → Lead → Body →
// Open loop → Body → … → CTA). An open loop is one calm statement that the next block closes; its visual holds tension
// for a second without a question mark. Each reel uses different ones (no two reels share a motion):
//   halfline : a hairline draws to the middle of its track and stops; a rose gold bead waits there, the rest is dashed
//   depth    : faint layers one under the other; a hairline descends through them and stops deep, a bead settles
//   tease    : the next idea's big word, held out of focus; it sharpens a little, never fully
//   curtain  : two frosted glass panels slide apart a little and stop; a sliver of light between them
//   bookmark : the save CTA: a ribbon bookmark outlined by a hairline, then filled when "salvează" is said, a soft label
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, E, h, esc, place } = R;
  const T = R.at;
  const calm = (p) => E.inout(clamp(p));
  const when = (ctx, a, d) => (typeof a === 'string' ? ctx.wordAt(0, a, -0.05) : a != null ? T(ctx, a) : d);
  const dark = () => R.theme.palette && R.theme.palette.ink === '#ffffff';
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (parent, w, hh) => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('width', w); s.setAttribute('height', hh); s.style.cssText = 'position:absolute;left:0;top:0;overflow:visible'; parent.appendChild(s); return s; };
  const el = (s, tag, attrs) => { const e = document.createElementNS(NS, tag); Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); s.appendChild(e); return e; };
  const roseDefs = (s, id) => { const d = el(s, 'defs'); d.innerHTML = '<radialGradient id="' + id + '" cx=".35" cy=".3"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#fbe3d9"/><stop offset=".75" stop-color="#eab5a5"/><stop offset="1" stop-color="#cf8f7d"/></radialGradient>'; };
  const ink = () => (dark() ? '#ffffff' : '#0f8a7e');
  const faint = () => (dark() ? 'rgba(255,255,255,.35)' : 'rgba(20,165,150,.3)');

  // ------------------------------------------------------------------ halfline
  V.halfline = (ctx, p) => {
    const st = ctx.stage(); const s = svgEl(st, 860, 900); const id = 'hb' + ctx.shot.i; roseDefs(s, id);
    const y = p.y || 430, x0 = 120, x1 = 740, xm = x0 + (x1 - x0) * (p.stop != null ? p.stop : 0.5);
    el(s, 'line', { x1: x0, y1: y, x2: x1, y2: y, stroke: faint(), 'stroke-width': 5, 'stroke-dasharray': '2 16', 'stroke-linecap': 'round' });
    const solid = el(s, 'line', { x1: x0, y1: y, x2: x0, y2: y, stroke: ink(), 'stroke-width': 7, 'stroke-linecap': 'round' });
    const cap = el(s, 'line', { x1: x0, y1: y - 22, x2: x0, y2: y + 22, stroke: ink(), 'stroke-width': 7, 'stroke-linecap': 'round' });
    const glow = el(s, 'circle', { cx: xm, cy: y, r: 0, fill: dark() ? 'rgba(255,255,255,.18)' : 'rgba(234,181,165,.35)' });
    const bead = el(s, 'circle', { cx: xm, cy: y, r: 0, fill: 'url(#' + id + ')' });
    const tD = ctx.t0 + 0.08, dD = p.dur || 0.95, tS = tD + dD;
    ctx.sfx(tD, 'swoosh', 0.35); ctx.sfx(tS, 'snap', 0.4); R.event(tD, 'draw'); R.event(tS, 'stop'); R.event(tS + 1.3, 'breath'); R.event(tS + 2.4, 'breath');
    ctx.focus(st);
    ctx.tick((t) => {
      const q = calm((t - tD) / dD); solid.setAttribute('x2', (x0 + (xm - x0) * q).toFixed(1));
      cap.style.opacity = String(calm((t - ctx.t0) / 0.3));
      const b = calm((t - tS) / 0.35), br = 1 + 0.08 * Math.sin(Math.max(0, t - tS) * 2.6);
      bead.setAttribute('r', (26 * b * br).toFixed(2)); glow.setAttribute('r', (72 * b * (1.4 - 0.4 * br)).toFixed(2)); glow.style.opacity = String(0.9 * b);
    });
  };

  // ------------------------------------------------------------------ depth
  V.depth = (ctx, p) => {
    const st = ctx.stage(); const s = svgEl(st, 860, 900); const id = 'db' + ctx.shot.i; roseDefs(s, id);
    const ys = p.ys || [250, 330, 440, 600], cx = 430, stopY = p.stopY || 520;
    const lines = ys.map((y, i) => el(s, 'line', { x1: 150 + i * 18, y1: y, x2: 710 - i * 18, y2: y, stroke: dark() ? '#ffffff' : '#14a596', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0 }));
    const drop = el(s, 'line', { x1: cx, y1: 150, x2: cx, y2: 150, stroke: ink(), 'stroke-width': 7, 'stroke-linecap': 'round' });
    const bead = el(s, 'circle', { cx, cy: stopY, r: 0, fill: 'url(#' + id + ')' });
    const tIn = ctx.t0 + 0.04, tD = ctx.t0 + 0.35, dD = p.dur || 1.1, tS = tD + dD;
    ctx.sfx(tIn, 'swoosh_up', 0.3); ctx.sfx(tD, 'swoosh_down', 0.4); ctx.sfx(tS, 'snap', 0.4); R.event(tIn, 'layers'); R.event(tD, 'descend'); R.event(tS, 'stop'); R.event(tS + 1.2, 'breath');
    // the time the hairline passes each layer (the same calm easing as the draw)
    const pass = ys.map((y) => { const f = (y - 150) / (stopY - 150); if (f > 1) return null; let lo = 0, hi = 1; for (let j = 0; j < 18; j++) { const m = (lo + hi) / 2; if (calm(m) < f) lo = m; else hi = m; } return tD + lo * dD; });
    ctx.focus(st);
    ctx.tick((t) => {
      lines.forEach((l, i) => { const a = calm((t - tIn - i * 0.08) / 0.4) * (0.7 - i * 0.12); const lit = pass[i] != null && t >= pass[i] ? 1 - clamp((t - pass[i]) / 0.5) : 0; l.setAttribute('opacity', (a + 0.45 * lit).toFixed(3)); l.style.filter = 'blur(' + (1.2 + i * 0.6 - lit).toFixed(2) + 'px)'; });
      drop.setAttribute('y2', (150 + (stopY - 150) * calm((t - tD) / dD)).toFixed(1));
      const b = calm((t - tS) / 0.35); bead.setAttribute('r', (25 * b * (1 + 0.07 * Math.sin(Math.max(0, t - tS) * 2.4))).toFixed(2));
    });
  };

  // ------------------------------------------------------------------ tease
  V.tease = (ctx, p) => {
    const st = ctx.stage();
    const d = h('div', 'abs num', esc(p.text || ''), st); d.style.cssText += ';left:50px;width:760px;text-align:center;top:' + (p.y || 230) + 'px;font-size:' + (p.size || 300) + 'px;line-height:1';
    const rule = h('i', 'abs', null, st); rule.style.cssText += ';left:280px;width:300px;height:3px;border-radius:2px;top:' + ((p.y || 230) + (p.size || 300) + 40) + 'px;background:' + (dark() ? 'rgba(255,255,255,.6)' : 'rgba(20,165,150,.45)') + ';transform-origin:50% 50%';
    const tIn = ctx.t0 + 0.04;
    ctx.sfx(tIn, 'whoosh_s', 0.3); ctx.sfx(tIn + 1.1, 'shimmer', 0.25); R.event(tIn, 'tease'); R.event(tIn + 1.1, 'focus'); R.event(tIn + 2.2, 'hold');
    ctx.focus(d);
    ctx.tick((t) => {
      const q = calm((t - tIn) / 1.6), a = calm((t - tIn) / 0.5);
      d.style.filter = 'blur(' + (34 - 18 * q).toFixed(2) + 'px)'; d.style.opacity = (0.55 * a).toFixed(3); d.style.transform = 'scale(' + (1.08 - 0.06 * q).toFixed(4) + ')';
      rule.style.transform = 'scaleX(' + calm((t - tIn - 0.4) / 0.9).toFixed(3) + ')';
    });
  };

  // ------------------------------------------------------------------ curtain
  V.curtain = (ctx, p) => {
    const st = ctx.stage();
    const light = h('div', 'abs', null, st); light.style.cssText += ';left:330px;width:200px;top:110px;height:640px;border-radius:40px;background:radial-gradient(ellipse at 50% 50%,rgba(251,227,217,.95),rgba(234,181,165,.45) 40%,rgba(234,181,165,0) 72%);filter:blur(10px)';
    const panel = (side) => { const d = h('div', 'abs', null, st); d.style.cssText += ';top:120px;height:620px;width:330px;border-radius:30px;background:' + (dark() ? 'linear-gradient(160deg,rgba(255,255,255,.34),rgba(255,255,255,.14))' : 'linear-gradient(160deg,#ffffff,#eef7f6)') + ';box-shadow:0 0 0 1.5px ' + (dark() ? 'rgba(255,255,255,.5)' : 'rgba(20,165,150,.28)') + ' inset,0 30px 50px -30px rgba(18,32,31,.35)'; d.style.left = (side < 0 ? 100 : 430) + 'px'; return d; };
    const L = panel(-1), Rr = panel(1);
    const tIn = ctx.t0 + 0.04, tO = ctx.t0 + 0.55, dO = 1.0, gap = p.gap || 46;
    ctx.sfx(tIn, 'swoosh_up', 0.3); ctx.sfx(tO, 'swoosh', 0.35); ctx.sfx(tO + dO, 'snap', 0.3); R.event(tIn, 'panels'); R.event(tO, 'open'); R.event(tO + dO, 'hold'); R.event(tO + dO + 1.1, 'glow');
    ctx.focus(st);
    ctx.tick((t) => {
      const a = calm((t - tIn) / 0.45), q = calm((t - tO) / dO);
      L.style.opacity = Rr.style.opacity = a.toFixed(3);
      L.style.transform = 'translateX(' + (-gap * q).toFixed(1) + 'px)'; Rr.style.transform = 'translateX(' + (gap * q).toFixed(1) + 'px)';
      light.style.opacity = (q * (0.85 + 0.15 * Math.sin(Math.max(0, t - tO) * 2.2))).toFixed(3);
    });
  };

  // ------------------------------------------------------------------ bookmark (the save CTA)
  V.bookmark = (ctx, p) => {
    const st = ctx.stage(); const s = svgEl(st, 860, 900); const id = 'bk' + ctx.shot.i;
    const d = el(s, 'defs'); d.innerHTML = '<linearGradient id="' + id + 'f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe3d9"/><stop offset=".55" stop-color="#eab5a5"/><stop offset="1" stop-color="#cf8f7d"/></linearGradient>' +
      '<clipPath id="' + id + 'c"><path d="M 335 210 Q 335 180 365 180 L 495 180 Q 525 180 525 210 L 525 560 L 430 485 L 335 560 Z"/></clipPath>' +
      '<filter id="' + id + 's" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="16" stdDeviation="16" flood-color="#082824" flood-opacity=".22"/></filter>';
    const P = 'M 335 210 Q 335 180 365 180 L 495 180 Q 525 180 525 210 L 525 560 L 430 485 L 335 560 Z';
    const back = el(s, 'path', { d: P, fill: dark() ? 'rgba(255,255,255,.12)' : 'rgba(20,165,150,.06)', filter: 'url(#' + id + 's)' });
    const fill = el(s, 'rect', { x: 330, y: 180, width: 200, height: 0, fill: 'url(#' + id + 'f)', 'clip-path': 'url(#' + id + 'c)' });
    const line = el(s, 'path', { d: P, fill: 'none', stroke: ink(), 'stroke-width': 5, 'stroke-linejoin': 'round', pathLength: 1 }); line.style.strokeDasharray = '1 1';
    const spec = el(s, 'path', { d: 'M 360 215 L 360 430', stroke: 'rgba(255,255,255,.75)', 'stroke-width': 8, 'stroke-linecap': 'round', opacity: 0 });
    const lab = h('div', 'tx abs', '<span class="chip acc">' + R.icon('check') + esc(p.label || 'Salvat') + '</span>', st); place(lab, 50, 620); lab.style.width = '760px'; lab.style.textAlign = 'center';
    const tD = ctx.t0 + 0.05, dD = p.drawDur || 1.0, tF = when(ctx, p.fillAt, ctx.L(0, 0.55)), dF = 0.75;
    ctx.sfx(tD, 'swoosh', 0.35); ctx.sfx(tF, 'swoosh_down', 0.4); ctx.sfx(tF + dF, 'chime', 0.45);
    R.event(tD, 'draw'); R.event(tD + dD * 0.6, 'draw'); R.event(tF, 'resolve'); R.event(tF + dF, 'resolve'); ctx.shot.resolveAt = tF + dF;
    ctx.anim(lab, 'pop', tF + dF + 0.05, { sfx: null });
    ctx.focus(s);
    ctx.tick((t) => {
      line.style.strokeDashoffset = String(1 - calm((t - tD) / dD));
      const f = calm((t - tF) / dF); fill.setAttribute('height', (390 * f).toFixed(1)); back.style.opacity = String(calm((t - tD) / 0.5));
      spec.setAttribute('opacity', (0.8 * calm((t - tF - dF * 0.6) / 0.4)).toFixed(3));
      const b = t - tF - dF; const k = b > 0 && b < 0.6 ? 1 + 0.04 * Math.sin(Math.PI * b / 0.6) : 1;
      s.style.transformOrigin = '430px 370px'; s.style.transform = 'scale(' + k.toFixed(4) + ')';
    });
  };
})();
