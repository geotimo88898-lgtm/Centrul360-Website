// Centrul360 reels v2: the visual templates, part 2 (counters, gauges, timelines, compare, puzzle, icon grid,
// checklist, cards, balance scale, DNA, posture, bars, zoom into a detail, map pin, energy flow).
(function () {
  'use strict';
  const R = window.R2;
  const V = R.V;
  const { clamp, E, h, esc, place, fit, lerp } = R;
  const T = R.at;
  const NS = 'http://www.w3.org/2000/svg';
  const centerX = (el, w = 860) => { el.style.left = '0'; el.style.width = w + 'px'; el.style.textAlign = 'center'; return el; };
  const chipEl = (parent, text, cls, ic) => h('div', 'tx abs', '<span class="chip ' + (cls || '') + '">' + (ic ? R.icon(ic) : '') + R.rich(text) + '</span>', parent);

  // ------------------------------------------------------------------ counter: a number that counts, a ring that fills
  V.counter = (ctx, p) => {
    const st = ctx.stage();
    const ring = h('div', 'abs', '<svg width="560" height="560" viewBox="0 0 560 560"><circle cx="280" cy="280" r="250" fill="none" stroke="var(--line)" stroke-width="22"/><circle class="arc" cx="280" cy="280" r="250" fill="none" stroke="var(--acc)" stroke-width="22" stroke-linecap="round" pathLength="1" style="stroke-dasharray:1 1;stroke-dashoffset:1" transform="rotate(-90 280 280)"/></svg>', st);
    place(ring, 150, 40);
    const num = h('div', 'tx abs num', '0', st); place(num, 150, 40, 560, 560); num.style.cssText += ';display:grid;place-items:center;font-size:' + (p.size || 210) + 'px';
    const suf = p.suffix ? h('div', 'tx abs lab', esc(p.suffix), st) : null; if (suf) { place(suf, 150, 420, 560); suf.style.cssText += ';text-align:center;font-size:44px;color:var(--mute)'; }
    const lab = p.label ? centerX(h('div', 'tx abs disp', R.rich(p.label), st)) : null; if (lab) { lab.style.top = '650px'; lab.style.fontSize = '64px'; fit(lab, 820, 200, 66, 40); }
    const t0 = T(ctx, p.at, ctx.L(0, 0, 0.1)), dur = p.dur || 1.6;
    const from = p.from || 0, to = p.to;
    ctx.anim(ring, 'pop', ctx.t0 + 0.02, { sfx: 'swoosh_up', gain: 0.4 });
    ctx.anim(num, 'pop', ctx.t0 + 0.1, { sfx: null });
    if (suf) ctx.anim(suf, 'in', ctx.t0 + 0.25, { sfx: null });
    if (lab) ctx.anim(lab, 'in', T(ctx, p.labelAt, ctx.L(0, 0.55)));
    const steps = Math.abs(to - from), every = Math.max(1, Math.ceil(steps / 8));
    for (let k = 1; k <= steps; k++) if (k % every === 0 || k === steps) { const q = k / steps; const tk = t0 + dur * Math.pow(q, 0.6); ctx.sfx(tk, k === steps ? 'chime' : 'tick', k === steps ? 0.5 : 0.35); R.event(tk, 'tick'); }
    ctx.focus(num);
    ctx.tick((t) => {
      const q = clamp((t - t0) / dur); const v = Math.round(lerp(from, to, E.out(q)));
      const s = (p.prefix || '') + v; if (num.textContent !== s) num.textContent = s;
      ring.querySelector('.arc').style.strokeDashoffset = String(1 - E.out(q) * (p.fill != null ? p.fill : 1));
      num.dataset.base = q > 0 && q < 1 ? 'scale(' + (1 + 0.02 * Math.sin(t * 40)).toFixed(4) + ')' : '';
    });
  };

  // ------------------------------------------------------------------ gauge: a needle that sweeps to a value on a half dial
  V.gauge = (ctx, p) => {
    const st = ctx.stage();
    const cx = 430, cy = 520, r = 330;
    const zones = p.zones || [{ t: 'puțin', c: 'acc2' }, { t: 'normal', c: 'good' }, { t: 'mult', c: 'acc' }];
    let svg = '<svg width="860" height="700" style="overflow:visible">';
    zones.forEach((z, i) => { const a0 = Math.PI + (i / zones.length) * Math.PI + 0.02, a1 = Math.PI + ((i + 1) / zones.length) * Math.PI - 0.02;
      svg += '<path class="zn" pathLength="1" d="M' + (cx + r * Math.cos(a0)) + ' ' + (cy + r * Math.sin(a0)) + ' A ' + r + ' ' + r + ' 0 0 1 ' + (cx + r * Math.cos(a1)) + ' ' + (cy + r * Math.sin(a1)) + '" stroke="var(--' + z.c + ')" stroke-width="54" fill="none" stroke-linecap="round" style="stroke-dasharray:1 1;stroke-dashoffset:1"/>'; });
    svg += '<g class="nd"><path d="M' + (cx - 16) + ' ' + cy + ' L' + cx + ' ' + (cy - r + 70) + ' L' + (cx + 16) + ' ' + cy + ' Z" fill="var(--ink)"/><circle cx="' + cx + '" cy="' + cy + '" r="34" fill="var(--ink)"/><circle cx="' + cx + '" cy="' + cy + '" r="12" fill="var(--bg)"/></g></svg>';
    const g = h('div', 'abs', svg, st); place(g, 0, 20);
    zones.forEach((z, i) => { const a = Math.PI + ((i + 0.5) / zones.length) * Math.PI; const l = h('div', 'tx abs lab', esc(z.t), st); l.style.cssText += ';width:240px;text-align:center;font-size:32px'; place(l, cx + (r + 0) * Math.cos(a) * 0.62 - 120, 20 + cy + r * Math.sin(a) * 0.62 - 18); ctx.anim(l, 'fade', ctx.L(0, 0.2) + i * 0.1, { sfx: null }); });
    const lab = p.label ? centerX(h('div', 'tx abs disp', R.rich(p.label), st)) : null; if (lab) { lab.style.top = (cy + 90) + 'px'; fit(lab, 820, 200, 70, 40); }
    const zs = [...g.querySelectorAll('.zn')];
    zs.forEach((z, i) => ctx.anim(z, 'draw', ctx.t0 - 0.12 + i * 0.1, { dur: 0.45, sfx: i ? null : 'swoosh', event: true }));
    const nd = g.querySelector('.nd'); nd.style.transformOrigin = cx + 'px ' + cy + 'px';
    const keys = (p.keys || [[0, 0.3, p.value != null ? p.value : 0.5]]).map((k) => ({ t: ctx.L(k[0], k[1]), v: k[2] }));
    keys.forEach((k) => { ctx.sfx(k.t, 'swoosh', 0.4); ctx.sfx(k.t + 0.55, 'tick', 0.45); R.event(k.t, 'needle'); });
    if (lab) ctx.anim(lab, 'in', T(ctx, p.labelAt, ctx.L(0, 0.6)));
    ctx.focus(g);
    ctx.tick((t) => {
      let v = 0, prev = 0, tk = null; keys.forEach((k) => { if (t >= k.t) { prev = v; v = k.v; tk = k; } });
      let val = v; if (tk) { const q = clamp((t - tk.t) / 0.8); val = clamp(lerp(prev, v, E.back(q)), 0.02, 0.98); }
      nd.style.transform = 'rotate(' + (-90 + 180 * val + Math.sin(t * 7) * 0.6).toFixed(2) + 'deg)';
    });
  };

  // ------------------------------------------------------------------ timeline: nodes appear along a line, a dot travels
  V.timeline = (ctx, p) => {
    const st = ctx.stage();
    const items = p.items || [];
    const n = items.length, x0 = 110, x1 = 750, y = p.y || 420;
    const line = h('div', 'abs', null, st); place(line, x0, y - 4, x1 - x0, 8); line.style.cssText += ';border-radius:4px;background:var(--line);transform-origin:0 50%';
    const prog = h('div', 'abs', null, st); place(prog, x0, y - 4, x1 - x0, 8); prog.style.cssText += ';border-radius:4px;background:var(--acc);transform-origin:0 50%';
    ctx.anim(line, 'growX', ctx.t0 + 0.02, { sfx: 'swoosh', gain: 0.35 });
    const times = items.map((it, i) => T(ctx, it.at, ctx.L(0, 0.15 + 0.8 * i / Math.max(1, n))));
    items.forEach((it, i) => {
      const x = n > 1 ? x0 + (x1 - x0) * i / (n - 1) : (x0 + x1) / 2;
      const dot = h('div', 'abs ico', it.ic ? R.icon(it.ic) : '', st); place(dot, x - 46, y - 46, 92, 92); dot.style.cssText += ';border-radius:50%;background:var(--card);color:var(--acc);box-shadow:var(--sh);border:6px solid var(--acc)';
      const up = i % 2 === 0;
      const t1 = h('div', 'tx abs disp', R.rich(it.t), st); t1.style.cssText += ';width:300px;text-align:center;font-size:52px'; fit(t1, 290, 140, 56, 30); place(t1, x - 150, up ? y - 90 - t1.offsetHeight : y + 80);
      const s1 = it.s ? h('div', 'tx abs small', R.rich(it.s), st) : null; if (s1) { s1.style.cssText += ';width:290px;text-align:center'; place(s1, x - 145, up ? y - 84 - t1.offsetHeight - s1.offsetHeight - 10 : y + 90 + t1.offsetHeight); }
      ctx.anim(dot, 'pop', times[i], { sfx: 'pop', gain: 0.55 });
      ctx.anim(t1, up ? 'slideD' : 'slideU', times[i] + 0.08, { amt: 40, sfx: null });
      if (s1) ctx.anim(s1, 'fade', times[i] + 0.2, { sfx: null });
    });
    const runner = h('div', 'abs', null, st); runner.style.cssText += ';width:26px;height:26px;border-radius:50%;background:var(--acc);box-shadow:0 0 0 10px color-mix(in srgb,var(--acc) 25%,transparent)';
    ctx.focus(prog);
    ctx.tick((t) => {
      let f = 0; times.forEach((tt, i) => { const q = E.inout(clamp((t - tt + 0.35) / 0.35)); if (q > 0) f = Math.max(f, (n > 1 ? (i - 1 + q) / (n - 1) : q)); });
      f = clamp(f); prog.style.transform = 'scaleX(' + f.toFixed(4) + ')';
      place(runner, x0 + (x1 - x0) * f - 13, y - 13); runner.style.opacity = t > times[0] - 0.3 ? '1' : '0';
    });
  };

  // ------------------------------------------------------------------ split: two sides compared, a VS, one wins
  V.split = (ctx, p) => {
    const st = ctx.stage();
    const side = (s, i) => {
      const c = h('div', 'abs card', '<div class="ico" style="width:150px;height:150px;border-radius:44px;margin:0 auto 28px;background:var(--bg2);color:var(--' + (s.tone || (i ? 'acc' : 'acc2')) + ')">' + R.icon(s.ic || 'sparkles') + '</div>' +
        '<div class="tx disp" style="position:relative;text-align:center;font-size:62px">' + R.rich(s.t) + '</div>' + (s.s ? '<div class="tx small" style="position:relative;text-align:center;margin-top:16px;font-size:30px">' + R.rich(s.s) + '</div>' : ''), st);
      place(c, i ? 450 : 0, p.top || 120, 410, p.h || 600); c.style.padding = '56px 26px'; return c;
    };
    const A = side(p.left, 0), B = side(p.right, 1);
    [A, B].forEach((c) => c.querySelectorAll('.tx.disp').forEach((x) => fit(x, 360, 220, 62, 34)));
    const tA = T(ctx, p.leftAt, ctx.L(0, 0, 0.02)), tB = T(ctx, p.rightAt, ctx.L(0, 0.45));
    ctx.anim(A, 'slideR', tA, { amt: -300 }); ctx.anim(B, 'slideL', tB, { amt: -300 });
    if (p.vs !== false) { const vs = h('div', 'tx abs ico', '<span style="font:900 44px/1 var(--f-display)">' + esc(p.vs || 'vs') + '</span>', st); place(vs, 365, (p.top || 120) + (p.h || 600) / 2 - 65, 130, 130); vs.style.cssText += ';border-radius:50%;background:var(--ink);color:var(--bg);box-shadow:var(--sh)'; ctx.anim(vs, 'spin', tB + 0.2, { gain: 0.4 }); }
    if (p.winner) {
      const tw = T(ctx, p.winAt, ctx.L(1, 0)); const w = p.winner === 'l' ? A : B, l = p.winner === 'l' ? B : A;
      ctx.anim(l, 'dim', tw, { to: 0.35, event: true }); ctx.anim(w, 'bump', tw + 0.05, { amt: 0.06 }); ctx.sfx(tw + 0.05, 'chime', 0.45);
      const badge = h('div', 'abs ico', R.icon(p.badge || 'check'), w); badge.style.cssText += ';right:-20px;top:-20px;width:96px;height:96px;border-radius:50%;background:var(--good);color:#fff;box-shadow:var(--sh)'; ctx.anim(badge, 'pop', tw + 0.1, { sfx: 'pop' });
      ctx.focus(w);
    } else ctx.focus(A);
  };

  // ------------------------------------------------------------------ puzzle: pieces (slices of a circle) fly in and snap into a whole
  V.puzzle = (ctx, p) => {
    const st = ctx.stage();
    const pieces = p.pieces || [];
    const n = pieces.length, cx = 430, cy = p.cy || 420, r = p.r || 300, gap = 10;
    const cols = p.colors || ['acc', 'acc2', 'good', 'bad'];
    const box = h('div', 'abs', null, st); place(box, 0, 0, 860, 900);
    const ghost = h('div', 'abs', '<svg width="860" height="900" style="overflow:visible"><circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="4" stroke-dasharray="10 14"/>' + pieces.map((_, i) => { const a = -Math.PI / 2 + (i / pieces.length) * Math.PI * 2; return '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + r * Math.cos(a)) + '" y2="' + (cy + r * Math.sin(a)) + '" stroke="var(--line)" stroke-width="4" stroke-dasharray="10 14"/>'; }).join('') + '</svg>', box);
    place(ghost, 0, 0); ctx.anim(ghost, 'blurIn', ctx.t0 + 0.05, { sfx: null, event: true });
    const els = pieces.map((pc, i) => {
      const a0 = -Math.PI / 2 + (i / n) * Math.PI * 2, a1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
      const ox = Math.cos(am) * gap, oy = Math.sin(am) * gap;
      const d = 'M' + (cx + ox) + ' ' + (cy + oy) + ' L' + (cx + ox + r * Math.cos(a0)) + ' ' + (cy + oy + r * Math.sin(a0)) + ' A ' + r + ' ' + r + ' 0 0 1 ' + (cx + ox + r * Math.cos(a1)) + ' ' + (cy + oy + r * Math.sin(a1)) + ' Z';
      const g = h('div', 'abs', '<svg width="860" height="900" style="overflow:visible"><path d="' + d + '" fill="var(--' + cols[i % cols.length] + ')" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-linejoin="round"/></svg>', box); place(g, 0, 0);
      const lr = r * 0.58; const lab = h('div', 'tx abs', '<div class="ico" style="width:84px;height:84px;margin:0 auto 6px;color:var(--on-acc,#fff)">' + R.icon(pc.ic || 'sparkles') + '</div><div style="font:850 40px/1.05 var(--f-display);letter-spacing:-.02em;color:var(--on-acc,#fff);text-align:center">' + R.rich(pc.t) + '</div>', g);
      place(lab, cx + ox + lr * Math.cos(am) - 120, cy + oy + lr * Math.sin(am) - 70, 240);
      g._dir = [Math.cos(am), Math.sin(am)]; return g;
    });
    const times = pieces.map((pc, i) => T(ctx, pc.at, ctx.L(0, i / Math.max(1, n))));
    const tSnap = T(ctx, p.snapAt, Math.max(...times) + 0.7);
    els.forEach((g, i) => { g.style.transformOrigin = cx + 'px ' + cy + 'px'; ctx.anim(g, 'fade', times[i], { dur: 0.2, sfx: 'swoosh', gain: 0.45, event: true }); ctx.sfx(times[i] + 0.4, 'snap', 0.45); });
    ctx.sfx(tSnap, 'snap', 0.9); ctx.sfx(tSnap + 0.05, 'shimmer', 0.45); R.event(tSnap, 'snap');
    if (p.payoff) ctx.shot.revealAt = tSnap;
    const center = p.center ? h('div', 'tx abs ico', '<div style="font:800 50px/1 var(--f-display);letter-spacing:-.03em;text-align:center;color:var(--ink)">' + R.rich(p.center) + '</div>', box) : null;
    if (center) { place(center, cx - 105, cy - 105, 210, 210); center.style.cssText += ';border-radius:50%;background:var(--bg);border:4px solid rgba(255,255,255,.6);box-shadow:0 0 60px color-mix(in srgb,var(--acc) 60%,transparent)'; ctx.anim(center, 'pop', tSnap + 0.05, { sfx: null }); }
    const lab = p.label ? centerX(h('div', 'tx abs disp', R.rich(p.label), st)) : null; if (lab) { lab.style.top = (cy + r + 50) + 'px'; fit(lab, 820, 150, 62, 36); ctx.anim(lab, 'in', tSnap + 0.2); }
    ctx.focus(box);
    ctx.tick((t) => {
      els.forEach((g, i) => {
        const q = E.expo(clamp((t - times[i]) / 0.55));
        const far = (1 - q) * 340 + (t < tSnap ? 34 : 34 * (1 - E.back(clamp((t - tSnap) / 0.35))));
        g.dataset.base = 'translate(' + (g._dir[0] * far).toFixed(1) + 'px,' + (g._dir[1] * far).toFixed(1) + 'px) rotate(' + ((1 - q) * (i % 2 ? 40 : -40)).toFixed(1) + 'deg)';
      });
      const pulse = t > tSnap ? 1 + 0.04 * Math.sin(Math.PI * clamp((t - tSnap) / 0.4)) : 1;
      box.dataset.base = 'scale(' + pulse.toFixed(4) + ')';
    });
  };

  // ------------------------------------------------------------------ icons: a grid that appears in rhythm; one is picked, one crossed
  V.icons = (ctx, p) => {
    const st = ctx.stage();
    const items = p.items.map((x) => (typeof x === 'string' ? { ic: x } : x));
    const cols = p.cols || 3, n = items.length, rows = Math.ceil(n / cols);
    const cs = Math.min(250, 800 / cols), gap = 24;
    const gw = cols * cs + (cols - 1) * gap, gh = rows * (cs + (items.some((i) => i.t) ? 56 : 0)) + (rows - 1) * gap;
    const x0 = (860 - gw) / 2, y0 = p.top != null ? p.top : (900 - gh) / 2 - 40;
    const els = items.map((it, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const d = h('div', 'abs', '<div class="ico card" style="width:' + cs + 'px;height:' + cs + 'px;border-radius:' + cs * 0.28 + 'px;color:var(--' + (it.tone || ['acc', 'acc2', 'good', 'ink'][i % 4]) + ')">' + R.icon(it.ic) + '</div>' + (it.t ? '<div class="tx lab" style="position:relative;text-align:center;margin-top:12px;font-size:28px">' + esc(it.t) + '</div>' : ''), st);
      place(d, x0 + c * (cs + gap), y0 + r * (cs + gap + (it.t ? 56 : 0)), cs);
      return d;
    });
    const t0 = ctx.L(0, 0, 0.02), step = p.step || Math.min(0.16, (ctx.lines[0] ? ctx.lines[0].dur * 0.6 : 1.5) / n);
    els.forEach((d, i) => ctx.anim(d, 'pop', t0 + i * step, { sfx: i % 2 ? 'tick' : 'pop', gain: 0.35, event: true }));
    if (p.pick != null) { const tp = T(ctx, p.pickAt, ctx.L(1, 0)); els.forEach((d, i) => { if (i !== p.pick) ctx.anim(d, 'dim', tp, { to: 0.25 }); }); ctx.anim(els[p.pick], 'bump', tp, { amt: 0.12 }); ctx.sfx(tp, 'chime', 0.4); R.event(tp, 'pick'); ctx.focus(els[p.pick]); } else ctx.focus(els[0]);
    if (p.cross != null) { const tc = T(ctx, p.crossAt, ctx.L(1, 0)); const x = h('div', 'abs ico', R.icon('x'), els[p.cross]); x.style.cssText += ';left:' + (cs - 70) + 'px;top:-24px;width:94px;height:94px;border-radius:50%;background:var(--bad);color:#fff'; ctx.anim(x, 'pop', tc, { sfx: 'pop' }); ctx.anim(els[p.cross].firstChild, 'dim', tc, { to: 0.4 }); R.event(tc, 'cross'); }
  };

  // ------------------------------------------------------------------ checklist: rows that get a drawn check (or a cross)
  V.checklist = (ctx, p) => {
    const st = ctx.stage();
    const items = p.items, n = items.length, rh = Math.min(170, 760 / n);
    const y0 = (900 - n * rh) / 2 - 20;
    items.forEach((it, i) => {
      const row = h('div', 'abs card', null, st); place(row, 20, y0 + i * rh, 820, rh - 22); row.style.cssText += ';display:flex;align-items:center;gap:28px;padding:0 30px';
      const ok = !it.x;
      const bx = h('div', 'abs', '<svg width="90" height="90" viewBox="0 0 90 90"><rect x="4" y="4" width="82" height="82" rx="24" fill="' + (ok ? 'var(--good)' : 'var(--bad)') + '"/>' + (ok ? '<path pathLength="1" d="M24 47 L39 61 L67 30" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray:1 1"/>' : '<path pathLength="1" d="M28 28 L62 62 M62 28 L28 62" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" style="stroke-dasharray:1 1"/>') + '</svg>', row);
      bx.style.cssText = 'position:relative;flex:none;width:90px;height:90px';
      const tx = h('div', 'tx disp', R.rich(it.t), row); tx.style.cssText = 'position:relative;font-size:50px' + (it.x ? ';color:var(--mute)' : '');
      fit(tx, 640, rh - 40, 54, 30);
      const t = T(ctx, it.at, ctx.L(0, i / n));
      // the rows are there when the screen arrives (dim); each one lights up and gets its mark on the voice
      ctx.anim(row, i % 2 ? 'slideL' : 'slideR', ctx.t0 + 0.06 + i * 0.08, { amt: -200, gain: 0.3, sfx: i ? null : undefined });
      ctx.anim(tx, 'undim', t, { event: true }); ctx.anim(tx, 'bump', t, { amt: 0.06 });
      ctx.anim(bx.querySelector('path'), 'draw', t + 0.25, { dur: 0.4, sfx: ok ? 'tick' : 'pop', gain: 0.5 });
      ctx.anim(bx, 'pop', t + 0.2, { sfx: null });
      if (i === n - 1) ctx.focus(row);
    });
  };

  // ------------------------------------------------------------------ cards: 1-3 fact cards with an icon (simple, solid)
  V.cards = (ctx, p) => {
    const st = ctx.stage();
    const items = p.items, n = items.length;
    const els = items.map((it) => { const d = h('div', 'abs card', '<div class="ico" style="flex:none;width:110px;height:110px;border-radius:32px;background:var(--bg2);color:var(--acc)">' + R.icon(it.ic || 'sparkles') + '</div><div><div class="tx disp" style="position:relative;font-size:50px">' + R.rich(it.t) + '</div>' + (it.s ? '<div class="tx small" style="position:relative;margin-top:8px">' + R.rich(it.s) + '</div>' : '') + '</div>', st); place(d, 20, 0, 820); d.style.cssText += ';display:flex;align-items:center;gap:28px;padding:28px 34px'; return d; });
    const hs = els.map((e) => e.offsetHeight), sum = hs.reduce((a, b) => a + b, 0) + 28 * (n - 1);
    let y = (900 - sum) / 2 - 20; els.forEach((e, i) => { e.style.top = y + 'px'; y += hs[i] + 28; });
    els.forEach((e, i) => ctx.anim(e, i % 2 ? 'slideL' : 'slideR', T(ctx, items[i].at, ctx.L(0, i / n)), { amt: -260 }));
    ctx.focus(els[0]);
  };

  // ------------------------------------------------------------------ scale: a balance that tips
  V.scale = (ctx, p) => {
    const st = ctx.stage();
    const cx = 430, top = 170, bw = 600;
    const base = h('div', 'abs', '<svg width="860" height="900"><path d="M' + (cx - 120) + ' 800 Q ' + cx + ' 768 ' + (cx + 120) + ' 800 Z" fill="var(--ink)" opacity=".85"/><rect x="' + (cx - 5) + '" y="' + top + '" width="10" height="610" rx="5" fill="var(--ink)" opacity=".85"/><circle cx="' + cx + '" cy="' + top + '" r="18" fill="var(--acc)"/></svg>', st); place(base, 0, 0);
    const beam = h('div', 'abs', null, st); place(beam, cx - bw / 2, top - 5, bw, 10); beam.style.cssText += ';border-radius:5px;background:var(--ink);opacity:.85;transform-origin:50% 50%';
    const pan = (s, side) => { const d = h('div', 'abs', '<svg width="300" height="260" style="overflow:visible"><path d="M150 0 L20 150 M150 0 L280 150" stroke="var(--mute)" stroke-width="2"/><path d="M0 150 Q150 230 300 150 Z" fill="var(--card)" stroke="var(--ink)" stroke-width="2.5" stroke-opacity=".85"/></svg>', st); place(d, 0, 0, 300, 260);
      const it = h('div', 'tx abs ico', '<div style="text-align:center"><div class="ico" style="width:110px;height:110px;margin:0 auto;color:var(--' + (s.tone || 'acc') + ')">' + R.icon(s.ic || 'weight') + '</div><div style="font:850 38px/1 var(--f-display);margin-top:6px">' + R.rich(s.t) + '</div></div>', d); place(it, 0, -10, 300, 160); d._it = it; return d; };
    const L = pan(p.left, 0), Rr = pan(p.right, 1);
    const keys = (p.keys || [[0, 0.4, -12]]).map((k) => ({ t: ctx.L(k[0], k[1]), v: k[2] }));
    ctx.anim(base, 'in', ctx.t0 + 0.02);
    ctx.anim(L._it, 'drop', T(ctx, p.left.at, ctx.L(0, 0.15)), { amt: 300 }); ctx.anim(Rr._it, 'drop', T(ctx, p.right.at, ctx.L(0, 0.35)), { amt: 300 });
    keys.forEach((k) => { ctx.sfx(k.t, 'swoosh', 0.4); ctx.sfx(k.t + 0.5, 'snap', 0.35); R.event(k.t, 'tilt'); });
    ctx.focus(beam);
    ctx.tick((t) => {
      let v = 0, prev = 0, tk = null; keys.forEach((k) => { if (t >= k.t) { prev = v; v = k.v; tk = k; } });
      const a = tk ? lerp(prev, v, E.elastic(clamp((t - tk.t) / 1.1))) : 0;
      beam.style.transform = 'rotate(' + a.toFixed(2) + 'deg)';
      const rad = a * Math.PI / 180;
      [[L, -1], [Rr, 1]].forEach(([d, s]) => { const x = cx + s * (bw / 2 - 20) * Math.cos(rad), y = top + s * (bw / 2 - 20) * Math.sin(rad); d.style.left = (x - 150) + 'px'; d.style.top = y + 'px'; });
    });
  };

  // ------------------------------------------------------------------ dna: a turning helix (genetics)
  V.dna = (ctx, p) => {
    const st = ctx.stage();
    const g = h('div', 'abs', '<svg width="860" height="720" style="overflow:visible"><g class="rungs"></g><path class="s1" fill="none" stroke="var(--acc)" stroke-width="16" stroke-linecap="round"/><path class="s2" fill="none" stroke="var(--acc2)" stroke-width="16" stroke-linecap="round"/></svg>', st);
    place(g, 0, 40);
    const s1 = g.querySelector('.s1'), s2 = g.querySelector('.s2'), rg = g.querySelector('.rungs');
    const N = 16; rg.innerHTML = Array.from({ length: N }, () => '<line stroke-width="10" stroke-linecap="round"/>').join('');
    const lab = p.label ? centerX(h('div', 'tx abs disp', R.rich(p.label), st)) : null; if (lab) { lab.style.top = '780px'; fit(lab, 820, 120, 64, 36); ctx.anim(lab, 'in', T(ctx, p.labelAt, ctx.L(0, 0.4))); }
    const t0 = ctx.t0 + 0.02;
    ctx.sfx(t0, 'shimmer', 0.45); R.event(t0, 'dna');
    if (p.highlightAt != null) { const th = T(ctx, p.highlightAt); ctx.sfx(th, 'chime', 0.4); R.event(th, 'dna-hl'); g._th = th; }
    ctx.focus(g);
    ctx.tick((t) => {
      const grow = E.out(clamp((t - t0) / 0.9));
      const ph = t * 2.2; let d1 = '', d2 = '';
      for (let i = 0; i <= 60; i++) { const y = 30 + i * 11 * grow; const x1 = 430 + Math.sin(ph + i * 0.22) * 170, x2 = 430 + Math.sin(ph + i * 0.22 + Math.PI) * 170; d1 += (i ? ' L' : 'M') + x1.toFixed(1) + ' ' + y.toFixed(1); d2 += (i ? ' L' : 'M') + x2.toFixed(1) + ' ' + y.toFixed(1); }
      s1.setAttribute('d', d1); s2.setAttribute('d', d2);
      [...rg.children].forEach((l, k) => { const i = 2 + k * 3.6; const y = 30 + i * 11 * grow; const a = ph + i * 0.22; const x1 = 430 + Math.sin(a) * 170, x2 = 430 + Math.sin(a + Math.PI) * 170; l.setAttribute('x1', x1); l.setAttribute('x2', x2); l.setAttribute('y1', y); l.setAttribute('y2', y);
        const hl = g._th && t > g._th && k % 4 === 1; l.setAttribute('stroke', hl ? 'var(--bad)' : 'var(--line)'); l.style.opacity = (0.35 + 0.65 * Math.abs(Math.cos(a))).toFixed(3); });
    });
  };

  // ------------------------------------------------------------------ tilt: a minimal side-profile pictogram leaning over a phone (posture)
  V.tilt = (ctx, p) => {
    const st = ctx.stage();
    const g = h('div', 'abs', '<svg width="860" height="760" style="overflow:visible"><path class="arc" fill="none" stroke="var(--ink)" stroke-width="5" stroke-dasharray="4 14" stroke-linecap="round" opacity=".7"/><defs><linearGradient id="tg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--acc2)"/><stop offset="1" stop-color="var(--acc)"/></linearGradient></defs><g class="fig"><rect x="370" y="440" width="140" height="300" rx="70" fill="url(#tg)" opacity=".9"/><g class="head"><rect x="420" y="300" width="40" height="160" rx="20" fill="url(#tg)"/><circle cx="440" cy="250" r="96" fill="url(#tg)"/><circle cx="410" cy="220" r="30" fill="#fff" opacity=".25"/><circle class="chin" cx="500" cy="335" r="0" fill="var(--acc)" opacity=".55"/></g></g><g class="ph"><rect x="590" y="430" width="70" height="128" rx="16" fill="var(--card)" stroke="var(--ink)" stroke-width="7"/><rect x="603" y="446" width="44" height="80" rx="6" fill="var(--acc2)" opacity=".7"/></g></svg>', st);
    place(g, 0, 40);
    const head = g.querySelector('.head'), chin = g.querySelector('.chin'), arc = g.querySelector('.arc'), ph = g.querySelector('.ph');
    head.style.transformOrigin = '440px 430px';
    const tT = T(ctx, p.at, ctx.L(0, 0.3)), tC = p.chinAt != null ? T(ctx, p.chinAt) : null;
    ctx.anim(g, 'in', ctx.t0 + 0.02);
    ctx.anim(ph, 'pop', tT - 0.2, { sfx: 'click', gain: 0.5 });
    ctx.sfx(tT, 'swoosh_down', 0.45); R.event(tT, 'tilt');
    if (tC != null) { ctx.sfx(tC, 'pop', 0.4); R.event(tC, 'chin'); }
    const lab = p.label ? centerX(h('div', 'tx abs disp', R.rich(p.label), st)) : null; if (lab) { lab.style.top = '800px'; fit(lab, 820, 100, 60, 34); ctx.anim(lab, 'in', T(ctx, p.labelAt, ctx.L(0, 0.5))); }
    if (p.phoneUp) { const ok = h('div', 'abs ico', R.icon('check'), st); place(ok, 560, 130, 96, 96); ok.style.cssText += ';border-radius:50%;background:var(--good);color:#06121a;box-shadow:0 0 40px color-mix(in srgb,var(--good) 60%,transparent)'; const tk = T(ctx, p.okAt, ctx.L(0, 0.72)); ctx.anim(ok, 'pop', tk, { sfx: 'chime', gain: 0.5 }); }
    ctx.focus(g);
    ctx.tick((t) => {
      const a0 = p.from != null ? p.from : 0, a1 = p.to != null ? p.to : (p.angle || 32); const a = a0 + (a1 - a0) * E.inout(clamp((t - tT) / 1.0));
      if (p.phoneUp) ph.style.transform = 'translateY(' + (-190 * E.inout(clamp((t - tT) / 1.0))).toFixed(1) + 'px)';
      head.style.transform = 'rotate(' + a.toFixed(2) + 'deg)';
      const r = 300, b0 = -90, b1 = -90 + a; const p0 = [440 + r * Math.cos(b0 * Math.PI / 180), 430 + r * Math.sin(b0 * Math.PI / 180)], p1 = [440 + r * Math.cos(b1 * Math.PI / 180), 430 + r * Math.sin(b1 * Math.PI / 180)];
      arc.setAttribute('d', a > 1 ? 'M' + p0[0] + ' ' + p0[1] + ' A ' + r + ' ' + r + ' 0 0 1 ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) : '');
      chin.setAttribute('r', tC != null ? (E.back(clamp((t - tC) / 0.4)) * (34 + 4 * Math.sin(t * 5))).toFixed(1) : 0);
    });
  };

  // ------------------------------------------------------------------ bars: bars that grow or shrink, with arrows
  V.bars = (ctx, p) => {
    const st = ctx.stage();
    if (p.chips) R.chipSeq(ctx, st, p.chips, 830, 'soft');
    const items = p.items, n = items.length, bw = 220, gap = (860 - n * bw) / (n + 1), base = 700, maxH = 520;
    items.forEach((it, i) => {
      const x = gap + i * (bw + gap);
      const bar = h('div', 'abs', null, st); place(bar, x, base - maxH, bw, maxH); bar.style.cssText += ';border-radius:36px 36px 14px 14px;background:var(--' + (it.c || (i ? 'acc' : 'acc2')) + ');transform-origin:50% 100%';
      const lab = h('div', 'tx abs disp', R.rich(it.t), st); lab.style.cssText += ';width:' + (bw + 60) + 'px;text-align:center;font-size:46px'; place(lab, x - 30, base + 24); fit(lab, bw + 50, 120, 48, 28);
      const arrow = h('div', 'abs ico', R.icon(it.to > it.from ? 'arrow-up' : it.to < it.from ? 'arrow-down' : 'equal'), st); place(arrow, x + bw / 2 - 50, 0, 100, 100); arrow.style.cssText += ';border-radius:50%;background:var(--card);color:var(--' + (it.to > it.from ? 'good' : it.to < it.from ? 'bad' : 'mute') + ');box-shadow:var(--sh)';
      const t0 = ctx.t0 + 0.05 + i * 0.12, tc = T(ctx, it.at, ctx.L(0, 0.4 + i * 0.25));
      ctx.anim(lab, 'in', t0, { sfx: i ? null : 'swoosh_up', gain: 0.35 });
      ctx.anim(arrow, 'pop', tc + 0.2, { sfx: 'pop', gain: 0.4 });
      ctx.sfx(tc, it.to > it.from ? 'swoosh_up' : 'swoosh_down', 0.45); R.event(tc, 'bar');
      ctx.tick((t) => { const g0 = E.out(clamp((t - t0) / 0.5)) * it.from; const q = E.elastic(clamp((t - tc) / 1.0)); const v = t < tc ? g0 : lerp(it.from, it.to, q); bar.style.transform = 'scaleY(' + Math.max(0.02, v).toFixed(4) + ')'; arrow.style.top = (base - maxH * Math.max(0.02, v) - 120) + 'px'; });
    });
  };

  // ------------------------------------------------------------------ zoom: a surface, a lens, then we dive into the detail (cells)
  V.zoom = (ctx, p) => {
    const st = ctx.stage();
    const card = h('div', 'abs card', null, st); place(card, 30, 60, 800, 760); card.style.overflow = 'hidden';
    card.style.background = p.surface || 'radial-gradient(circle at 40% 35%,#ffe9dc,#f5c9b2 70%)';
    // pores / texture on the surface
    let dots = ''; for (let i = 0; i < 70; i++) dots += '<circle cx="' + (R.rnd(i) * 800).toFixed(0) + '" cy="' + (R.rnd(i, 2) * 760).toFixed(0) + '" r="' + (2 + R.rnd(i, 3) * 3).toFixed(1) + '" fill="rgba(160,90,70,.18)"/>';
    h('div', 'abs', '<svg width="800" height="760">' + dots + '</svg>', card).style.inset = '0';
    const inner = h('div', 'abs', null, card); inner.style.cssText += ';inset:0;background:' + (p.innerBg || 'linear-gradient(180deg,#fff3d1,#fbe1a0)');
    let cells = ''; for (let i = 0; i < 26; i++) { const r = 34 + R.rnd(i, 5) * 26; cells += '<circle class="zc" cx="' + (40 + R.rnd(i, 6) * 720).toFixed(0) + '" cy="' + (40 + R.rnd(i, 7) * 680).toFixed(0) + '" r="' + r.toFixed(1) + '" fill="#fbe39a" stroke="#e5b65a" stroke-width="4"/>'; }
    h('div', 'abs', '<svg width="800" height="760">' + cells + '</svg>', inner).style.inset = '0';
    const lens = h('div', 'abs', null, st); lens.style.cssText += ';width:260px;height:260px;border-radius:50%;border:14px solid var(--ink);box-shadow:0 30px 50px -20px rgba(0,0,0,.5)';
    const handle = h('div', 'abs', null, lens); handle.style.cssText += ';left:215px;top:215px;width:40px;height:150px;border-radius:20px;background:var(--ink);transform:rotate(-45deg);transform-origin:20px 0';
    const tL = ctx.t0 + 0.35, tD = T(ctx, p.diveAt, ctx.L(0, 0.55));
    ctx.anim(card, 'in', ctx.t0 + 0.02); ctx.anim(lens, 'pop', tL, { sfx: 'pop', gain: 0.45 });
    ctx.sfx(tD - 0.2, 'whoosh_l', 0.6); R.event(tD, 'dive');
    const lab1 = p.label ? h('div', 'tx abs', '<span class="chip soft">' + R.rich(p.label) + '</span>', st) : null; if (lab1) { centerX(lab1); lab1.style.top = '860px'; ctx.anim(lab1, 'pop', ctx.t0 + 0.4, { sfx: null }); ctx.anim(lab1, 'out', tD); }
    const lab2 = p.innerLabel ? h('div', 'tx abs', '<span class="chip acc">' + R.rich(p.innerLabel) + '</span>', st) : null; if (lab2) { centerX(lab2); lab2.style.top = '860px'; ctx.anim(lab2, 'pop', tD + 0.5, { sfx: 'pop' }); }
    ctx.focus(card);
    ctx.tick((t) => {
      const mv = E.inout(clamp((t - tL) / Math.max(0.4, tD - tL)));
      const lx = 120 + 330 * mv, ly = 180 + 160 * Math.sin(mv * Math.PI * 0.8);
      const dv = E.inout(clamp((t - tD) / 0.7));
      const r = 120 + dv * 1100;
      inner.style.clipPath = 'circle(' + r.toFixed(1) + 'px at ' + (lx + 130 - 30).toFixed(1) + 'px ' + (ly + 130 - 60).toFixed(1) + 'px)';
      inner.style.transform = 'scale(' + (1.25 - 0.25 * dv).toFixed(4) + ')'; inner.style.transformOrigin = (lx + 100) + 'px ' + (ly + 70) + 'px';
      place(lens, lx, ly); lens.style.opacity = (1 - dv).toFixed(3); lens.style.visibility = dv > 0.98 ? 'hidden' : '';
      [...inner.querySelectorAll('.zc')].forEach((c, i) => { c.setAttribute('transform', 'translate(0 ' + (Math.sin(t * 1.4 + i) * 4).toFixed(1) + ')'); });
    });
  };

  // ------------------------------------------------------------------ pin: a stylised map (no real map), a pin drops on a city
  V.pin = (ctx, p) => {
    const st = ctx.stage();
    const card = h('div', 'abs card', null, st); place(card, 30, 60, 800, 700); card.style.overflow = 'hidden'; card.style.background = 'var(--bg2)';
    let roads = ''; for (let i = 0; i < 9; i++) { const y = 40 + i * 80 + R.rnd(i) * 30; roads += '<path d="M-20 ' + y + ' C 200 ' + (y - 40 + R.rnd(i, 2) * 80) + ', 500 ' + (y + 40 - R.rnd(i, 3) * 80) + ', 820 ' + (y + R.rnd(i, 4) * 40) + '" stroke="var(--card)" stroke-width="' + (i % 3 ? 10 : 22) + '" fill="none" opacity=".9"/>'; }
    for (let i = 0; i < 6; i++) { const x = 60 + i * 140; roads += '<path d="M' + x + ' -20 L' + (x + 60 - R.rnd(i) * 120) + ' 720" stroke="var(--card)" stroke-width="' + (i % 2 ? 8 : 16) + '" opacity=".8"/>'; }
    roads += '<path d="M-20 520 C 200 470, 420 600, 820 500" stroke="color-mix(in srgb,var(--acc2) 45%,transparent)" stroke-width="40" fill="none"/>';
    h('div', 'abs', '<svg width="800" height="700">' + roads + '</svg>', card).style.inset = '0';
    const pin = h('div', 'abs', '<svg width="120" height="160" viewBox="0 0 120 160"><path d="M60 156 C 60 156 8 92 8 56 a52 52 0 1 1 104 0 C 112 92 60 156 60 156 Z" fill="var(--acc)" stroke="#fff" stroke-width="6"/><circle cx="60" cy="56" r="20" fill="#fff"/></svg>', st); place(pin, 370, 230, 120, 160); pin.style.transformOrigin = '50% 100%';
    const rings = [0, 1, 2].map(() => { const r = h('div', 'abs', null, st); r.style.cssText += ';left:430px;top:390px;width:0;height:0;border-radius:50%;border:5px solid var(--acc)'; return r; });
    const lab = h('div', 'tx abs', '<span class="chip">' + R.icon('map-pin') + esc(p.city) + '</span>', st); centerX(lab); lab.style.top = '790px';
    const sub = p.sub ? h('div', 'tx abs lab', R.rich(p.sub), st) : null; if (sub) { centerX(sub); sub.style.top = '870px'; sub.style.fontSize = '34px'; sub.style.color = 'var(--mute)'; }
    const tP = T(ctx, p.at, ctx.L(0, 0.15));
    ctx.anim(card, 'in', ctx.t0 + 0.02); ctx.anim(pin, 'drop', tP, { amt: 400, sfx: 'snap', gain: 0.7 }); ctx.anim(lab, 'pop', tP + 0.35, { gain: 0.4 }); if (sub) ctx.anim(sub, 'in', tP + 0.6, { sfx: null });
    ctx.focus(pin);
    ctx.tick((t) => { rings.forEach((r, i) => { const q = ((t - tP - 0.4) / 1.4 + i / 3) % 1; const on = t > tP + 0.4; const s = 40 + q * 300; r.style.left = (430 - s / 2) + 'px'; r.style.top = (390 - s * 0.3) + 'px'; r.style.width = s + 'px'; r.style.height = s * 0.6 + 'px'; r.style.opacity = on ? ((1 - q) * 0.8).toFixed(3) : 0; }); });
  };

  // ------------------------------------------------------------------ energy: fat cells give energy, particles flow into a battery
  V.energy = (ctx, p) => {
    const st = ctx.stage();
    const cells = []; for (let i = 0; i < 9; i++) { const c = h('div', 'abs', null, st); const r = 46 + R.rnd(i, 2) * 16; c.style.cssText += ';width:' + 2 * r + 'px;height:' + 2 * r + 'px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff8dc,#f9de8e 60%,#e7bd66);border:4px solid #e2b660'; place(c, 30 + (i % 3) * 120 + R.rnd(i) * 20 - r + 60, 230 + Math.floor(i / 3) * 130 + R.rnd(i, 3) * 20 - r + 60); c._r = r; cells.push(c); }
    const bat = h('div', 'abs', '<div style="position:absolute;left:50%;top:-30px;width:70px;height:30px;margin-left:-35px;border-radius:10px 10px 0 0;background:var(--ink)"></div><div class="fill" style="position:absolute;left:14px;right:14px;bottom:14px;height:0;border-radius:18px;background:var(--good)"></div><div class="ico" style="position:absolute;inset:0;color:var(--ink);opacity:.8">' + R.icon('zap') + '</div>', st);
    place(bat, 600, 230, 200, 380); bat.style.cssText += ';border-radius:34px;border:12px solid var(--ink);background:var(--card)';
    const fill = bat.querySelector('.fill');
    const l1 = p.from ? h('div', 'tx abs', '<span class="chip soft">' + R.rich(p.from) + '</span>', st) : null; if (l1) { place(l1, 40, 680, 440); l1.style.textAlign = 'center'; }
    const l2 = p.to ? h('div', 'tx abs', '<span class="chip acc">' + R.rich(p.to) + '</span>', st) : null; if (l2) { place(l2, 520, 680, 360); l2.style.textAlign = 'center'; }
    const cv = h('canvas', null, null, st); cv.width = 860; cv.height = 900; cv.style.cssText = 'position:absolute;left:0;top:0';
    const g = cv.getContext('2d');
    const tF = T(ctx, p.at, ctx.L(0, 0.3)), dF = p.dur || 2.2;
    cells.forEach((c, i) => ctx.anim(c, 'pop', ctx.t0 + 0.05 + i * 0.05, { sfx: i % 3 ? null : 'bubble', gain: 0.3, event: i === 0 }));
    ctx.anim(bat, 'slideL', ctx.t0 + 0.25, { amt: -200 });
    if (l1) ctx.anim(l1, 'pop', ctx.t0 + 0.5, { sfx: null }); if (l2) ctx.anim(l2, 'pop', tF + 0.6, { gain: 0.35 });
    ctx.sfx(tF, 'riser_s', 0.35); ctx.sfx(tF + dF, 'chime', 0.45); R.event(tF, 'flow'); R.event(tF + dF * 0.5, 'flow'); R.event(tF + dF, 'full');
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--good').trim();
    ctx.focus(bat);
    ctx.tick((t) => {
      const q = clamp((t - tF) / dF);
      cells.forEach((c, i) => { const k = 1 - 0.45 * E.inout(clamp((t - tF - i * 0.08) / dF)); c.dataset.base = 'scale(' + k.toFixed(4) + ')'; });
      fill.style.height = (E.out(q) * 330).toFixed(1) + 'px';
      g.clearRect(0, 0, 860, 900);
      if (t < tF || q >= 1) return;
      for (let i = 0; i < 60; i++) {
        const ph = ((t - tF) * 0.9 + R.rnd(i, 4)) % 1; const c = cells[i % cells.length];
        const x0 = parseFloat(c.style.left) + c._r, y0 = parseFloat(c.style.top) + c._r, x1 = 700, y1 = 520;
        const x = lerp(x0, x1, ph), y = lerp(y0, y1, ph) - Math.sin(ph * Math.PI) * 90;
        g.globalAlpha = Math.sin(ph * Math.PI) * 0.9; g.fillStyle = i % 2 ? acc : '#f6c94f';
        g.beginPath(); g.arc(x, y, 7, 0, 6.283); g.fill();
      }
      g.globalAlpha = 1;
    });
  };
})();
// ------------------------------------------------------------------ dissolve: a belief on a glass card turns into
// particles that spread over a whole-body pictogram (an abstract figure, never a real body): „it leaves from everywhere”
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, E, h, place, fit, lerp } = R;
  V.dissolve = (ctx, p) => {
    const st = ctx.stage();
    const card = h('div', 'tx abs glass disp', R.rich(p.text), st); place(card, 60, 30, 740); card.style.cssText += ';padding:44px 40px;text-align:center;font-size:70px';
    fit(card, 660, 300, p.size || 72, 40);
    const tD = R.at(ctx, p.dissolveAt, ctx.L(0, 0.6));
    ctx.anim(card, 'in', ctx.t0 + 0.02);
    ctx.anim(card, 'bump', ctx.L(0, 0.6), { amt: 0.05, event: true }); ctx.sfx(ctx.L(0, 0.6), 'pop', 0.35);
    if (ctx.lines[1]) { ctx.anim(card, 'shake', ctx.L(1, 0, 0.02), { event: true }); ctx.sfx(ctx.L(1, 0, 0.02), 'glitch', 0.4); }
    ctx.shot.revealAt = tD + 0.6;
    ctx.sfx(tD, 'whoosh_l', 0.75); ctx.sfx(tD + 0.65, 'shimmer', 0.6); R.event(tD, 'dissolve'); R.event(tD + 0.7, 'spread');
    const tG = tD + 2.0; ctx.sfx(tG, 'sparkle', 0.5); R.event(tG, 'glow');
    // the figure: head, torso, arms, legs (rounded shapes), sampled for the landing points
    const fig = document.createElement('canvas'); fig.width = 860; fig.height = 900; const fg = fig.getContext('2d');
    const cx = 430, top = 400;
    fg.fillStyle = '#000';
    const cap = (x1, y1, x2, y2, r) => { fg.lineWidth = r * 2; fg.lineCap = 'round'; fg.strokeStyle = '#000'; fg.beginPath(); fg.moveTo(x1, y1); fg.lineTo(x2, y2); fg.stroke(); };
    fg.beginPath(); fg.arc(cx, top + 40, 40, 0, 6.283); fg.fill();
    cap(cx, top + 110, cx, top + 270, 62); cap(cx - 70, top + 110, cx - 120, top + 270, 22); cap(cx + 70, top + 110, cx + 120, top + 270, 22);
    cap(cx - 32, top + 320, cx - 46, top + 480, 28); cap(cx + 32, top + 320, cx + 46, top + 480, 28);
    const d = fg.getImageData(0, 0, 860, 900).data, pts = [];
    for (let y = 0; y < 900; y += 8) for (let x = 0; x < 860; x += 8) if (d[(y * 860 + x) * 4 + 3] > 128) pts.push([x, y]);
    const sil = h('div', 'abs', null, st); place(sil, 0, 0, 860, 900);
    const outline = fig.toDataURL(); sil.style.cssText += ';background:url(' + outline + ');opacity:0;filter:opacity(.12)';
    const cv = h('canvas', null, null, st); cv.width = 860; cv.height = 900; cv.style.cssText = 'position:absolute;left:0;top:0';
    const g = cv.getContext('2d');
    const N = 420, acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim(), acc2 = getComputedStyle(document.documentElement).getPropertyValue('--acc2').trim();
    const P = Array.from({ length: N }, (_, i) => ({ sx: 120 + R.rnd(i) * 620, sy: 80 + R.rnd(i, 2) * 220, tg: pts[Math.floor(R.rnd(i, 3) * pts.length)], d: R.rnd(i, 4) * 0.35, c: i % 3 ? acc : acc2, w: R.rnd(i, 5) * 6.28 }));
    const lab = p.label ? h('div', 'tx abs', '<span class="chip acc">' + R.rich(p.label) + '</span>', st) : null; if (lab) { place(lab, 0, 860); lab.style.width = '860px'; lab.style.textAlign = 'center'; ctx.anim(lab, 'pop', tD + 0.9, { gain: 0.4 }); }
    ctx.focus(card);
    ctx.tick((t) => {
      const q = clamp((t - tD) / 0.35); card.style.opacity = (1 - q).toFixed(3); card.style.filter = q > 0 ? 'blur(' + (q * 10).toFixed(1) + 'px)' : '';
      sil.style.opacity = (clamp((t - tD - 0.3) / 0.6) * 1).toFixed(3); sil.style.filter = 'opacity(.16)';
      g.clearRect(0, 0, 860, 900);
      if (t < tD) return;
      for (const a of P) {
        const f = E.inout(clamp((t - tD - a.d) / 1.1));
        const x = lerp(a.sx, a.tg[0], f) + Math.sin(t * 3 + a.w) * 2 * f, y = lerp(a.sy, a.tg[1], f) - Math.sin(f * Math.PI) * 120 + Math.cos(t * 2.4 + a.w) * 2 * f;
        const gl = t > tG ? 1 + 0.6 * Math.sin(Math.PI * clamp((t - tG) / 0.6)) : 1; g.globalAlpha = 0.9; g.fillStyle = a.c; g.beginPath(); g.arc(x, y, 4.2 * gl, 0, 6.283); g.fill();
      }
      g.globalAlpha = 1;
    });
  };
})();
