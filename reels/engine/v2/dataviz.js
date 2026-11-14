// Centrul360 reels v2: data-viz scenes in a clean UI style (14.11, after a reference the owner liked): a hairline
// header, glossy extruded bars that grow and re-rank over a day/week scrubber, a huge ghost numeral behind, portrait
// cards with a rank badge and a status tag. Calm, precise easing (no overshoot), few elements, everything on the grid.
// Never invented clinical numbers: values are either real (topics.json, the site) or the scene says "Ilustrativ".
//   race     : ranked bars over a scrubber (rows[].values per step), the leader (or p.lead) in rose gold, a flag at its end
//   scrubber : a timeline track, a moving playhead, labelled ticks, a ghost numeral, an optional rose range bracket
//   cardrow  : 2-4 portrait cards with a rank badge and a status tag that changes on the voice
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, E, h, esc, place, lerp } = R;
  const T = R.at;
  const calm = (p) => E.inout(p); // cubic in-out: no overshoot
  const DEPTH = 14;
  const KIND = {
    teal: { fr: 'linear-gradient(180deg,#46c7b9 0%,#14a596 46%,#0f8a7e 100%)', tp: 'linear-gradient(90deg,#9fe5dc,#c9f1ec)', sd: 'linear-gradient(180deg,#0b7f74,#09695f)', ink: '#ffffff' },
    white: { fr: 'linear-gradient(180deg,#ffffff 0%,#f4fbfa 52%,#dcf2ef 100%)', tp: 'linear-gradient(90deg,#ffffff,#eef7f6)', sd: 'linear-gradient(180deg,#c6e6e1,#a7d5ce)', ink: '#0f8a7e' },
    rose: { fr: 'linear-gradient(180deg,#fbe3d9 0%,#eab5a5 56%,#cf8f7d 100%)', tp: 'linear-gradient(90deg,#fdf1eb,#f7d9cd)', sd: 'linear-gradient(180deg,#c78877,#ad6f5f)', ink: '#3b1c14' },
  };
  const baseKind = () => (R.theme.palette && R.theme.palette.ink === '#ffffff' ? 'white' : 'teal');

  // a glossy extruded bar: front face, a bevelled top face, a side face, a specular strip, a soft shadow, a light sweep
  function bar3d(parent, x, y, maxW, H, title, sub) {
    const b = h('div', 'b3', null, parent); place(b, x, y, maxW + DEPTH, H);
    const trk = h('i', 'trk', null, b); trk.style.width = maxW + 'px';
    const sh = h('i', 'sh', null, b);
    const layers = {};
    ['teal', 'white', 'rose'].forEach((k) => {
      const g = h('div', 'abs', null, b); g.style.cssText += ';left:0;top:0;width:100%;height:100%';
      const tp = h('i', 'tp', null, g), sd = h('i', 'sd', null, g), fr = h('i', 'fr', null, g);
      [tp, sd, fr].forEach((e) => { e.style.position = 'absolute'; e.style.display = 'block'; });
      fr.style.overflow = 'hidden'; fr.style.background = KIND[k].fr; tp.style.background = KIND[k].tp; sd.style.background = KIND[k].sd;
      const spec = h('i', 'spec', null, fr), sw = h('i', 'sw', null, fr); spec.style.position = sw.style.position = 'absolute';
      layers[k] = { g, tp, sd, fr, spec, sw };
    });
    const lab = h('div', 'lab tx', '<b>' + R.rich(title) + '</b>' + (sub ? '<small>' + R.rich(sub) + '</small>' : ''), b);
    return {
      el: b, lab,
      set(w, mix, t) { // mix: { teal|white: a, rose: b } opacities
        w = Math.max(0, w);
        sh.style.width = (w * 0.94) + 'px'; sh.style.opacity = clamp(w / 60).toFixed(3);
        Object.entries(layers).forEach(([k, L]) => {
          const o = mix[k] || 0; L.g.style.opacity = o.toFixed(3); L.g.style.visibility = o < 0.01 || w < 1 ? 'hidden' : '';
          if (o < 0.01 || w < 1) return;
          L.fr.style.cssText = 'position:absolute;display:block;left:0;top:0;height:' + H + 'px;width:' + w + 'px;border-radius:7px;overflow:hidden;background:' + KIND[k].fr;
          L.tp.style.cssText = 'position:absolute;display:block;left:0;top:' + (-DEPTH) + 'px;width:' + (w + DEPTH) + 'px;height:' + DEPTH + 'px;background:' + KIND[k].tp + ';clip-path:polygon(' + DEPTH + 'px 0,' + (w + DEPTH) + 'px 0,' + w + 'px ' + DEPTH + 'px,0 ' + DEPTH + 'px)';
          L.sd.style.cssText = 'position:absolute;display:block;left:' + w + 'px;top:' + (-DEPTH) + 'px;width:' + DEPTH + 'px;height:' + (H + DEPTH) + 'px;background:' + KIND[k].sd + ';clip-path:polygon(0 ' + DEPTH + 'px,' + DEPTH + 'px 0,' + DEPTH + 'px ' + H + 'px,0 ' + (H + DEPTH) + 'px)';
          L.spec.style.cssText = 'position:absolute;display:block;left:6px;top:7%;height:26%;width:' + Math.max(0, w - 12) + 'px;border-radius:6px;background:linear-gradient(180deg,rgba(255,255,255,.7),rgba(255,255,255,0))';
          const sp = ((t * 0.32) % 1.4) / 1.4; // a slow light sweep along the bar
          L.sw.style.cssText = 'position:absolute;display:block;top:0;height:100%;width:90px;left:' + (sp * (w + 180) - 120).toFixed(1) + 'px;background:linear-gradient(100deg,transparent,rgba(255,255,255,.5),transparent)';
        });
        // the title: on the bar when the bar is long enough, else on the track, in the theme's ink
        const lw = lab.offsetWidth + 44, on = clamp((w - lw) / 40 + 1);
        const k = (mix.rose || 0) > 0.5 ? 'rose' : baseKind();
        // inside the bar when it fits, else right after its end, on the track, in the theme's ink (never half on, half off)
        lab.style.color = on > 0.5 ? KIND[k].ink : 'var(--ink)'; lab.style.left = (on > 0.5 ? 22 : w + DEPTH + 18).toFixed(1) + 'px';
      },
    };
  }
  R.bar3d = bar3d;

  // the scrubber: a track, a fill, a rose gold ball, the ticks, a note left and a counter right
  function scrub(parent, y, ticks, o = {}) {
    const s = h('div', 'dv-scrub', null, parent); place(s, 50, y);
    h('i', 'tr', null, s); const fill = h('i', 'fill', null, s);
    const n = ticks.length, x0 = 30, x1 = 730, X = (i) => x0 + (x1 - x0) * (n > 1 ? i / (n - 1) : 0);
    const rng = o.range ? h('i', 'rng', null, s) : null;
    if (rng) { place(rng, X(o.range[0]) - 34, -30, X(o.range[1]) - X(o.range[0]) + 68, 66); rng.style.top = '-30px'; }
    const tks = ticks.map((t, i) => { const d = h('div', 'tk tx', esc(t), s); d.style.left = X(i) + 'px'; return d; });
    const ball = h('i', 'ball', null, s);
    const note = o.note ? h('div', 'ft tx', esc(o.note), s) : null; if (note) note.style.left = '20px';
    const cnt = o.count ? h('div', 'ft tx', '', s) : null; if (cnt) { cnt.style.right = '20px'; cnt.style.textAlign = 'right'; }
    return {
      el: s, rng, X,
      set(u) { // u: position in ticks (float)
        const x = x0 + (x1 - x0) * (n > 1 ? clamp(u / (n - 1)) : 0);
        ball.style.left = x + 'px'; fill.style.width = (x - 20) + 'px';
        const k = Math.round(clamp(u, 0, n - 1));
        tks.forEach((d, i) => d.classList.toggle('on', i === k));
        if (cnt) { const v = o.count.replace('{n}', String(k + 1)).replace('{N}', String(n)); if (cnt.textContent !== v) cnt.textContent = v; }
      },
    };
  }
  R.dvScrub = scrub;

  // the position along the steps: each step eases in and out (a calm „tick” from one day to the next)
  const stepper = (t, tA, tB, K) => { const raw = clamp((t - tA) / Math.max(0.1, tB - tA)) * (K - 1); const k = Math.min(K - 2, Math.floor(raw)); if (K < 2) return 0; const f = raw - k; return k + calm(clamp(f)); };
  const pad = (v) => (String(v).length < 2 ? '0' + v : String(v));

  // ------------------------------------------------------------------ race
  V.race = (ctx, p) => {
    const st = ctx.stage();
    const rows = p.rows, n = rows.length, K = p.steps.length;
    const top = p.top != null ? p.top : 24;
    const rowH = n >= 5 ? 116 : n === 4 ? 140 : 172, y0 = top + 104;
    const cardH = rowH - 16, cardW = Math.round(cardH * 0.74), barX = cardW + 44, barH = Math.round(rowH * 0.56), maxW = 760 - barX - 80;
    // the ghost numeral, behind everything
    const ghost = h('div', 'dv-ghost', '', st); place(ghost, 0, y0 + n * rowH - 360); ghost.style.width = '860px'; ghost.style.textAlign = 'center';
    // the header and its hairline
    const hd = h('div', 'dv-h tx', '<span>' + esc(p.header || '') + '</span><b></b>', st); place(hd, 50, top);
    const rule = h('i', 'dv-rule', null, st); place(rule, 50, top + 58);
    const hdR = hd.querySelector('b');
    ctx.anim(hd, 'in', ctx.t0 + 0.04, { amt: 24, sfx: null }); ctx.anim(rule, 'growX', ctx.t0 + 0.08, { sfx: 'swoosh', gain: 0.25 });
    const els = rows.map((r, i) => {
      const g = h('div', 'abs', null, st); place(g, 50, y0 + i * rowH, 760, rowH);
      const badge = h('div', 'dv-badge', String(i + 1), g); place(badge, 2, -6);
      const card = h('div', 'dv-card', '<div class="ico">' + R.icon(r.ic || 'sparkles') + '</div>', g); place(card, 14, 8, cardW, cardH);
      const tags = (r.tags || [r.tag || '']).map((tg) => { if (!tg) return null; const d = h('div', 'dv-tag', '<i></i>' + esc(tg.t || tg), card); if (tg.rose) d.classList.add('rose'); if (tg.done) d.classList.add('done'); return d; });
      const bar = bar3d(g, barX, (rowH - barH) / 2 + 4, maxW, barH, r.t, r.s);
      ctx.anim(g, 'in', ctx.t0 + 0.12 + i * 0.08, { amt: 30, sfx: i ? null : 'swoosh_up', gain: 0.3 });
      return { g, badge, card, tags, bar, r };
    });
    // the flag at the leader's bar end (rose gold)
    const flag = h('div', 'dv-flag', '<svg width="80" height="115" viewBox="0 0 64 92"><defs><linearGradient id="rg' + ctx.shot.i + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbe3d9"/><stop offset=".55" stop-color="#eab5a5"/><stop offset="1" stop-color="#cf8f7d"/></linearGradient></defs>' +
      '<rect x="4" y="6" width="4" height="84" rx="2" fill="' + (baseKind() === 'white' ? '#ffffff' : '#12201f') + '" opacity=".75"/><path d="M8 8 H52 L44 22 L52 36 H8 Z" fill="url(#rg' + ctx.shot.i + ')"/><text x="28" y="28" text-anchor="middle" font-family="Inter Variable" font-weight="800" font-size="16" fill="#3b1c14">1</text></svg>', st);
    // the scrubber
    const sy = y0 + n * rowH + 64;
    const sc = p.scrubber === false ? null : scrub(st, sy, p.steps, { note: p.note, count: p.count });
    if (sc) ctx.anim(sc.el, 'in', ctx.t0 + 0.2, { amt: 20, sfx: null });
    const tA = T(ctx, p.from, ctx.L(0, 0.08)), tB = T(ctx, p.to, ctx.L(0, 0.92));
    for (let k = 1; k < K; k++) { const tk = tA + (tB - tA) * (k / (K - 1)); ctx.sfx(tk - 0.04, 'tick', 0.32); R.event(tk, 'step'); }
    const rankAt = (k) => { const ix = rows.map((_, i) => i).sort((a, b) => (rows[b].values[k] - rows[a].values[k]) || (a - b)); const pos = []; ix.forEach((r, j) => { pos[r] = j; }); return pos; };
    const ranks = Array.from({ length: K }, (_, k) => rankAt(k));
    const leadAt = (k) => (p.lead != null ? p.lead : ranks[k].indexOf(0));
    for (let k = 1; k < K; k++) if (leadAt(k) !== leadAt(k - 1)) { const tk = tA + (tB - tA) * (k / (K - 1)); ctx.sfx(tk - 0.1, 'swoosh', 0.4); R.event(tk, 'rerank'); }
    ctx.sfx(tB + 0.05, 'snap', 0.55); R.event(tB + 0.05, 'settle');
    if (p.payoff) ctx.shot.revealAt = tB + 0.05;
    ctx.focus(els[0].g);
    ctx.tick((t) => {
      const u = t < tA ? 0 : stepper(t, tA, tB, K), k = Math.min(K - 2, Math.floor(u)), f = K < 2 ? 0 : u - k;
      const grow = calm(clamp((t - ctx.t0 - 0.2) / 0.8)); // the bars come out of the track at the start
      const lead = (f < 0.5 ? leadAt(k) : leadAt(Math.min(K - 1, k + 1)));
      els.forEach((e, i) => {
        const v = K < 2 ? e.r.values[0] : lerp(e.r.values[k], e.r.values[k + 1], f);
        const y = y0 + lerp(ranks[k][i], ranks[Math.min(K - 1, k + 1)][i], calm(f)) * rowH;
        e.g.style.top = y.toFixed(2) + 'px';
        const w = v * maxW * grow;
        const roseNow = (leadAt(k) === i ? 1 - calm(f) : 0) + (leadAt(Math.min(K - 1, k + 1)) === i ? calm(f) : 0);
        const rose = p.lead != null ? (i === p.lead ? 1 : 0) : roseNow;
        e.bar.set(w, { [baseKind()]: 1 - rose, rose }, t);
        e.badge.textContent = String(Math.round(lerp(ranks[k][i], ranks[Math.min(K - 1, k + 1)][i], f)) + 1);
        e.badge.classList.toggle('lead', i === lead);
        const ts = e.tags; if (ts.length > 1) { const ki = Math.round(u); ts.forEach((d, j) => { if (d) d.style.opacity = j === Math.min(ts.length - 1, ki) ? '1' : '0'; }); }
        if (i === lead) { const fx = parseFloat(e.g.style.left) + barX + w + DEPTH - 6, fy = y + (rowH - barH) / 2 - 44; flag.style.left = fx.toFixed(1) + 'px'; flag.style.top = fy.toFixed(1) + 'px'; flag.style.opacity = clamp((t - ctx.t0 - 0.6) / 0.3).toFixed(3); }
      });
      const gi = K < 2 ? 0 : Math.round(u);
      const gl = p.ghost ? p.ghost[Math.min(p.ghost.length - 1, gi)] : pad(gi + 1);
      if (ghost.textContent !== gl) ghost.textContent = gl;
      ghost.style.opacity = calm(clamp((t - ctx.t0) / 0.6)).toFixed(3);
      const rt = (p.right || '').replace('{n}', gl).replace('{N}', String(K));
      if (hdR.textContent !== rt) hdR.textContent = rt;
      if (sc) sc.set(u);
    });
  };

  // ------------------------------------------------------------------ scrubber
  V.scrubber = (ctx, p) => {
    const st = ctx.stage();
    const ticks = p.ticks, n = ticks.length;
    const ghost = h('div', 'dv-ghost', '', st); place(ghost, 0, 120); ghost.style.width = '860px'; ghost.style.textAlign = 'center';
    const hd = p.header ? h('div', 'dv-h tx', '<span>' + esc(p.header) + '</span><b></b>', st) : null; if (hd) place(hd, 50, 24);
    const rule = hd ? h('i', 'dv-rule', null, st) : null; if (rule) place(rule, 50, 82);
    const ttl = p.title ? h('div', 'tx abs disp', R.rich(p.title), st) : null;
    if (ttl) { place(ttl, 50, 140, 760); ttl.style.textAlign = 'center'; ttl.style.fontSize = (p.size || 88) + 'px'; R.fit(ttl, 760, 230, p.size || 88, 40); }
    const sc = scrub(st, p.y || 640, ticks, { range: p.range, note: p.note, count: p.count });
    const tA = T(ctx, p.from, ctx.L(0, 0.1)), tB = T(ctx, p.at, ctx.L(0, 0.7)), tR = p.range ? T(ctx, p.rangeAt, ctx.L(0, 0.75)) : null;
    if (hd) { ctx.anim(hd, 'in', ctx.t0 + 0.04, { amt: 24, sfx: null }); ctx.anim(rule, 'growX', ctx.t0 + 0.08, { sfx: 'swoosh', gain: 0.25 }); }
    if (ttl) ctx.anim(ttl, 'in', ctx.t0 + 0.1, { sfx: null });
    ctx.anim(sc.el, 'in', ctx.t0 + 0.16, { amt: 20, sfx: 'swoosh_up', gain: 0.3 });
    const to = p.to != null ? p.to : n - 1;
    for (let k = 1; k <= Math.floor(to); k++) { const tk = tA + (tB - tA) * (k / to); ctx.sfx(tk - 0.04, 'tick', 0.3); R.event(tk, 'step'); }
    if (sc.rng) { sc.rng.style.opacity = '0'; ctx.sfx(tR, 'chime', 0.4); R.event(tR, 'range'); }
    ctx.focus(sc.el);
    ctx.tick((t) => {
      const u = t < tA ? 0 : stepper(t, tA, tB, Math.floor(to) + 1);
      sc.set(Math.min(u, to));
      const gl = p.ghostEnd && tR != null && t >= tR ? p.ghostEnd : pad(Math.round(Math.min(u, to)) + 1);
      if (ghost.textContent !== gl) ghost.textContent = gl;
      ghost.style.opacity = calm(clamp((t - ctx.t0) / 0.6)).toFixed(3);
      if (hd) { const rt = (p.right || '').replace('{n}', String(Math.round(Math.min(u, to)) + 1)).replace('{N}', String(n)); const b = hd.querySelector('b'); if (b.textContent !== rt) b.textContent = rt; }
      if (sc.rng) { const q = calm(clamp((t - tR) / 0.45)); sc.rng.style.opacity = q.toFixed(3); sc.rng.style.transform = 'scaleX(' + (0.92 + 0.08 * q).toFixed(3) + ')'; }
    });
  };

  // ------------------------------------------------------------------ cardrow
  V.cardrow = (ctx, p) => {
    const st = ctx.stage();
    const cards = p.cards, n = cards.length, gap = 24, cw = Math.floor((760 - gap * (n - 1)) / n), ch = Math.round(cw * 1.42);
    const hd = p.header ? h('div', 'dv-h tx', '<span>' + esc(p.header) + '</span><b>' + esc(p.right || '') + '</b>', st) : null; if (hd) place(hd, 50, 24);
    const rule = hd ? h('i', 'dv-rule', null, st) : null; if (rule) place(rule, 50, 82);
    const y = p.y != null ? p.y : 150;
    if (hd) { ctx.anim(hd, 'in', ctx.t0 + 0.04, { amt: 24, sfx: null }); ctx.anim(rule, 'growX', ctx.t0 + 0.08, { sfx: 'swoosh', gain: 0.25 }); }
    cards.forEach((c, i) => {
      const x = 50 + i * (cw + gap);
      const card = h('div', 'dv-card', '<div class="ico">' + R.icon(c.ic || 'sparkles') + '</div>', st); place(card, x, y, cw, ch);
      const badge = h('div', 'dv-badge' + (c.lead ? ' lead' : ''), String(c.rank || i + 1), st); place(badge, x - 10, y - 14);
      const ttl = h('div', 'tx abs', '<div style="font:800 34px/1.08 var(--f-display);letter-spacing:-.03em;color:var(--ink);text-align:center">' + R.rich(c.t) + '</div>' + (c.s ? '<div style="margin-top:6px;font:600 22px/1.2 var(--f-body);color:var(--mute);text-align:center">' + R.rich(c.s) + '</div>' : ''), st);
      place(ttl, x + 4, y + ch + 22, cw - 8);
      const t0 = ctx.t0 + 0.1 + i * 0.1;
      [card, badge, ttl].forEach((e, j) => ctx.anim(e, 'in', t0 + j * 0.04, { amt: 40, sfx: j || i ? null : 'swoosh_up', gain: 0.3 }));
      const tg = c.tag ? h('div', 'dv-tag', '<i></i>' + esc(c.tag.t || c.tag), card) : null;
      if (tg) { if (c.tag.rose) tg.classList.add('rose'); if (c.tag.done) tg.classList.add('done'); const tt = T(ctx, c.tag.at, t0 + 0.3); ctx.anim(tg, 'in', tt, { amt: 16, sfx: c.tag.rose ? 'pop' : 'tick', gain: 0.4, event: true }); }
      if (c.lead) { card.style.boxShadow = '0 0 0 2px var(--rose2), 0 18px 30px -18px rgba(18,32,31,.45)'; }
      if (i === 0) ctx.focus(card);
    });
  };
})();
