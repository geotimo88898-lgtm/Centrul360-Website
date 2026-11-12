// Centrul360 reels v2: the visual templates, part 1 (type, the "?" of particles, skin cross-section, shape morph,
// shatter, real photo reveal, Nuki, AI panel, stamp). A template is (ctx, p): it draws one shot and registers its
// animations with ctx.anim(el, fx, t) (each entrance makes its own sound and counts as a visual change).
// Times: ctx.L(i, f) = line i of the shot at fraction f; ctx.word(i, k) = word k of line i; ctx.t0 = shot start.
// Text elements carry the class "tx" (check.cjs keeps them inside the safe zone and apart).
(function () {
  'use strict';
  const R = window.R2;
  const V = R.V = R.V || {};
  const { clamp, E, h, esc, place, fit, lerp } = R;
  const S = () => R.STAGE;
  const T = (ctx, at, dflt) => (Array.isArray(at) ? ctx.L(at[0], at[1] || 0, at[2] || 0) : at != null ? ctx.L(at, 0) : dflt);
  R.at = T;
  const COL = (c) => (c && c[0] !== '#' && !c.startsWith('rgb') && !c.startsWith('var') ? 'var(--' + c + ')' : c);

  // ------------------------------------------------------------------ kinetic typography
  // words of a text → spans (*emphasis* in the serif accent), each word a .w
  R.kt = (text, parent, cls) => {
    const d = h('div', 'tx disp kt' + (cls ? ' ' + cls : ''), null, parent);
    const tk = [];
    String(text).split(/(\*[^*]+\*)/).forEach((seg) => { if (!seg) return; const e = /^\*.*\*$/.test(seg); seg.replace(/\*/g, '').split(/\s+/).forEach((w, k) => { if (!w) return; if (/^[?!.,:;…]+$/.test(w) && tk.length && k === 0) tk[tk.length - 1].p = (tk[tk.length - 1].p || '') + w; else tk.push({ w, e }); }); });
    d.innerHTML = tk.map((x) => '<span class="w' + (x.e ? ' e' : '') + '">' + esc(x.w) + (x.p ? '<span class="pu">' + esc(x.p) + '</span>' : '') + '</span>').join(' ');
    d._tk = tk;
    return d;
  };
  // the times of the words: synced to the voice when the text is the spoken line, else a stagger
  function wordTimes(ctx, p, n) {
    if (!p.text && ctx.lines[0]) return ctx.lines[0].words.map((w) => w.t);
    const t0 = T(ctx, p.at, ctx.L(0, 0, 0.02));
    return Array.from({ length: n }, (_, i) => t0 + i * (p.stagger || 0.11));
  }
  function typeShot(style) {
    return (ctx, p) => {
      const st = ctx.stage();
      let top = 0;
      if (p.kicker) { const k = h('div', 'tx abs', '<span class="chip acc">' + (p.kickerIcon ? R.icon(p.kickerIcon) : '') + esc(p.kicker) + '</span>', st); place(k, 0, 0); k.style.width = '860px'; k.style.textAlign = 'center'; ctx.anim(k, 'pop', ctx.t0 + 0.02); top = 100; }
      const txt = p.text || (ctx.lines[0] ? ctx.lines[0].capRich : '');
      const d = R.kt(txt, st, style);
      d.style.left = '0'; d.style.width = '860px';
      const maxH = (p.h || (p.sub ? 560 : 680)) - top;
      fit(d, 840, maxH, p.size || 150, 54);
      const y = p.y != null ? p.y - 250 : top + Math.max(0, (900 - top - d.offsetHeight - (p.sub ? 120 : 0)) / 2) - (p.lift || 40);
      d.style.top = y + 'px';
      const ws = [...d.querySelectorAll('.w')];
      const times = wordTimes(ctx, p, ws.length);
      ws.forEach((w, i) => {
        const t = times[Math.min(i, times.length - 1)] - 0.04;
        const emph = w.classList.contains('e');
        if (style === 'pop') ctx.anim(w, emph ? 'slam' : 'pop', t, { gain: emph ? 0.5 : 0.25, sfx: i % 2 && !emph ? null : undefined, event: true });
        else if (style === 'mask') ctx.anim(w, 'mask', t, { dur: 0.5, sfx: i % 3 ? null : 'swoosh_up', gain: 0.3, event: true });
        else if (style === 'flip') ctx.anim(w, 'flip', t, { sfx: i % 3 ? null : 'paper', gain: 0.35, event: true });
        else if (style === 'cascade') {
          const txtw = w.textContent; w.innerHTML = [...txtw].map((c) => '<span class="ch">' + esc(c) + '</span>').join('');
          [...w.querySelectorAll('.ch')].forEach((c, j) => ctx.anim(c, 'drop', t + j * 0.022, { dur: 0.55, amt: 90, sfx: j === 0 && i % 2 === 0 ? 'tick' : null, gain: 0.25 }));
          R.event(t, 'word');
        } else { // highlight
          ctx.anim(w, 'in', t, { amt: 30, sfx: null, event: true });
          if (emph) { w.style.position = 'relative'; const hl = h('i', 'hl', null, w); ctx.anim(hl, 'growX', t + 0.12, { sfx: 'paper', gain: 0.45 }); }
        }
        if (emph && style !== 'highlight') ctx.anim(w, 'bump', t + 0.42, { amt: 0.06 });
        if (emph && p.strike) { const sk = h('i', 'abs', null, w); sk.style.cssText += ';left:-4%;right:-4%;top:52%;height:.11em;border-radius:.06em;background:var(--bad);transform-origin:0 50%'; ctx.anim(sk, 'growX', t + (p.strikeDt || 0.45), { sfx: 'paper', gain: 0.6 }); ctx.anim(w, 'dim', t + (p.strikeDt || 0.45) + 0.1, { to: 0.55 }); }
      });
      if (p.sub) { const sb = h('div', 'tx abs lab', R.rich(p.sub), st); sb.style.cssText += ';left:0;width:860px;text-align:center;font-size:40px;color:var(--mute)'; sb.style.top = (y + d.offsetHeight + 40) + 'px'; ctx.anim(sb, 'in', T(ctx, p.subAt, ctx.L(0, 0.8))); }
      ctx.focus(d);
      // later lines of the same shot: the text steps back, a new line of text comes (p.then: [text per step])
      (p.then || []).forEach((tx2, k) => {
        const t2 = ctx.L(k + 1, 0, -0.05);
        ctx.anim(d, 'outUp', t2 - 0.12, { dur: 0.3 });
        const d2 = R.kt(tx2, st, style); d2.style.left = '0'; d2.style.width = '860px'; fit(d2, 840, maxH, p.size || 150, 54);
        d2.style.top = (top + Math.max(0, (900 - top - d2.offsetHeight) / 2) - (p.lift || 40)) + 'px';
        const L2 = ctx.lines[k + 1];
        [...d2.querySelectorAll('.w')].forEach((w, i) => { const t = L2 && L2.words[i] ? L2.words[i].t : t2 + i * 0.1; ctx.anim(w, w.classList.contains('e') ? 'slam' : 'pop', t - 0.04, { gain: 0.3, sfx: i % 2 ? null : undefined, event: true }); });
      });
    };
  }
  ['pop', 'mask', 'cascade', 'highlight', 'flip'].forEach((s) => { V['type-' + s] = typeShot(s); });


  // a row of chips that follow the voice, one at a time: list = [{at:[line,frac], t, icon, cls}]
  R.chipSeq = (ctx, parent, list, y, cls) => {
    const L = (list || []).map((c) => Object.assign({}, c, { tt: T(ctx, c.at, ctx.t0 + 0.3) })).sort((a, b) => a.tt - b.tt);
    L.forEach((c, i) => { const d = h('div', 'tx abs', '<span class="chip ' + (c.cls || cls || 'acc') + '">' + (c.icon ? R.icon(c.icon) : '') + R.rich(c.t) + '</span>', parent); place(d, 0, y); d.style.width = '860px'; d.style.textAlign = 'center';
      ctx.anim(d, 'pop', c.tt, { sfx: 'pop', gain: 0.4 }); if (L[i + 1]) ctx.anim(d, 'outUp', L[i + 1].tt - 0.15, { dur: 0.15 }); });
    return L;
  };

  // ------------------------------------------------------------------ big: a number or a short phrase, slammed
  V.big = (ctx, p) => {
    const st = ctx.stage();
    const d = p.value != null ? h('div', 'tx abs num', esc(p.value) + (p.suffix ? '<small style="font-size:.36em;margin-left:.18em;color:var(--ink);letter-spacing:-.03em">' + esc(p.suffix) + '</small>' : ''), st) : R.kt(p.text, st);
    d.style.left = '0'; d.style.width = '860px'; d.style.textAlign = 'center';
    fit(d, 820, p.label ? 420 : 600, p.value != null ? 300 : 140, 60);
    const lab = p.label ? h('div', 'tx abs lab', R.rich(p.label), st) : null;
    if (lab) { lab.style.cssText += ';left:0;width:860px;text-align:center;font-size:44px'; }
    const tot = d.offsetHeight + (lab ? lab.offsetHeight + 40 : 0);
    d.style.top = ((900 - tot) / 2 - 30) + 'px'; if (lab) lab.style.top = ((900 - tot) / 2 - 30 + d.offsetHeight + 40) + 'px';
    const t = T(ctx, p.at, ctx.L(0, 0, 0.02));
    if (p.value != null) ctx.anim(d, 'slam', t, { sfx: 'impact', gain: 0.5 }); else [...d.querySelectorAll('.w')].forEach((w, i) => ctx.anim(w, 'slam', t + i * 0.1, { gain: 0.35, sfx: i % 2 ? null : undefined }));
    if (lab) ctx.anim(lab, 'in', T(ctx, p.labelAt, ctx.L(0, 0.5)));
    ctx.focus(d);
  };

  // ------------------------------------------------------------------ qmark: particles swirling, a "?" forms, the question
  // frame 0 is already in motion (the particles orbit for any time, also before 0: the loop end shows that state)
  V.qmark = (ctx, p) => {
    const lay = ctx.layer(0.5);
    const cv = h('canvas', null, null, lay); cv.width = 1080; cv.height = 1920; cv.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    const g = cv.getContext('2d');
    const N = p.n || 620, cx = 540, cy = p.cy || 560;
    // the target: points inside a big "?" in the display font
    const off = document.createElement('canvas'); off.width = 1080; off.height = 1000; const og = off.getContext('2d');
    og.fillStyle = '#000'; og.textAlign = 'center'; og.textBaseline = 'middle'; og.font = (R.theme.font && R.theme.font.qweight || 800) + ' 640px ' + getComputedStyle(document.documentElement).getPropertyValue('--f-display');
    og.fillText(p.glyph || '?', 540, 500);
    const data = og.getImageData(0, 0, 1080, 1000).data; const pts = [];
    for (let y = 0; y < 1000; y += 9) for (let x = 0; x < 1080; x += 9) if (data[(y * 1080 + x) * 4 + 3] > 128) pts.push([x, y - 500 + cy]);
    const cols = (p.colors || ['acc', 'acc2', 'ink']).map((c) => getComputedStyle(document.documentElement).getPropertyValue('--' + c).trim() || c);
    const P = Array.from({ length: N }, (_, i) => {
      const tg = pts[Math.floor(R.rnd(i, 9) * pts.length)] || [cx, cy];
      return { a: R.rnd(i) * Math.PI * 2, w: (0.35 + R.rnd(i, 2) * 0.9) * (R.rnd(i, 7) > 0.5 ? 1 : -1), r: 140 + R.rnd(i, 3) * 520, sz: 3 + R.rnd(i, 4) * 6, c: cols[i % cols.length], tg, d: R.rnd(i, 5) * 0.5, wob: R.rnd(i, 6) * 6.28 };
    });
    const tF = T(ctx, p.formAt, ctx.L(0, 0, 0.15)), dF = p.formDur || 1.25;
    const tB = p.burstAt != null ? T(ctx, p.burstAt) : null;
    if (tF > ctx.t0 - 1) { ctx.sfx(tF + 0.2, 'shimmer', 0.55); ctx.sfx(tF + dF + 0.1, 'snap', 0.5); R.event(tF, 'form'); R.event(tF + dF, 'form'); }
    if (tB != null) { ctx.sfx(tB, 'whoosh_l', 0.7); R.event(tB, 'burst'); }
    const dark = R.theme.dark;
    ctx.tick((t) => {
      g.clearRect(0, 0, 1080, 1920);
      g.globalCompositeOperation = dark ? 'lighter' : 'source-over';
      for (let i = 0; i < N; i++) {
        const q = P[i];
        const ang = q.a + q.w * t * 0.9;
        const rr = q.r + Math.sin(t * 1.3 + q.wob) * 26;
        let x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr * 0.78;
        const f = E.inout(clamp((t - tF - q.d * 0.6) / dF));
        let tx = q.tg[0] + Math.sin(t * 3 + q.wob) * 2.5, ty = q.tg[1] + Math.cos(t * 2.6 + q.wob) * 2.5;
        if (tB != null && t > tB) { const b = E.out(clamp((t - tB) / 0.9)); const dx = q.tg[0] - cx, dy = q.tg[1] - cy, l = Math.hypot(dx, dy) + 1; tx += dx / l * b * (900 + q.r); ty += dy / l * b * (900 + q.r); }
        x = lerp(x, tx, f); y = lerp(y, ty, f);
        const al = tB != null && t > tB ? 1 - clamp((t - tB) / 0.9) : 0.35 + 0.65 * Math.max(f, 0.5 + 0.5 * Math.sin(t * 2 + q.wob));
        g.globalAlpha = clamp(al);
        g.fillStyle = q.c;
        g.beginPath(); g.arc(x, y, q.sz * (0.7 + 0.3 * f), 0, 6.283); g.fill();
      }
      g.globalAlpha = 1;
    });
    // the question, word by word, under the "?"
    if (p.q !== false) {
      const st = ctx.stage();
      const txt = p.text || (ctx.lines[0] ? ctx.lines[0].capRich : '');
      const d = R.kt(txt, st, 'q'); d.style.left = '0'; d.style.width = '860px';
      fit(d, 840, p.qh || 280, p.size || 116, 50);
      d.style.top = (p.qy != null ? p.qy - 250 : 640) + 'px';
      d.dataset.q = '1';
      const ws = [...d.querySelectorAll('.w')];
      const times = wordTimes(ctx, p, ws.length);
      const fast = p.fast !== false;
      ws.forEach((w, i) => { const e = w.classList.contains('e'); const ts = times[Math.min(i, times.length - 1)] - 0.04;
        if (fast) { ctx.anim(w, 'in', ctx.L(0, 0, 0.02) + i * 0.065, { amt: 40, sfx: i === 0 ? 'swoosh_up' : null, gain: 0.35, event: i % 3 === 0 }); ctx.anim(w, 'bump', ts, { amt: e ? 0.16 : 0.07 }); if (e) ctx.sfx(ts, 'pop', 0.45); }
        else ctx.anim(w, e ? 'slam' : 'pop', ts, { gain: e ? 0.5 : 0.25, sfx: e || i === 0 ? undefined : null, event: true }); });
      if (tB != null) ctx.anim(d, 'outUp', tB - 0.1);
      ctx.focus(d);
    }
  };

  // ------------------------------------------------------------------ skin: the layers of the skin, in section
  // p.seq: [{at:[line,frac], do:'focus'|'energy'|'shrink'|'sag'|'collagen'|'cream'|'calm', layer, label}] ; p.mode hifu|liposonix
  V.skin = (ctx, p) => {
    const st = ctx.stage();
    const bw = 860, bh = p.h || 700, top = p.top != null ? p.top : 40;
    const box = h('div', 'abs card', null, st); place(box, 0, top, bw, bh); box.style.overflow = 'hidden';
    const air = p.mode ? 110 : 64;
    const Ls = [['piele', 'PIELE', 130, '#f4cdbb'], ['grasime', 'GRĂSIME', 220, '#fbe6ad'], ['smas', 'SMAS', 56, '#e7ab95'], ['muschi', 'MUȘCHI', bh - air - 406, '#e29b97']];
    let y = air; const band = {};
    let svg = '<svg width="' + bw + '" height="' + bh + '" style="position:absolute;inset:0;overflow:visible"><defs>' +
      '<radialGradient id="cell' + ctx.shot.i + '" cx="35%" cy="30%"><stop offset="0" stop-color="#fff8dc"/><stop offset=".6" stop-color="#f9de8e"/><stop offset="1" stop-color="#eac06a"/></radialGradient>' +
      '<linearGradient id="air' + ctx.shot.i + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--bg2)" stop-opacity=".0"/><stop offset="1" stop-color="var(--acc2)" stop-opacity=".18"/></linearGradient>' +
      '<linearGradient id="sh' + ctx.shot.i + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".25" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".08"/></linearGradient>' +
      '<linearGradient id="beam' + ctx.shot.i + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--acc)" stop-opacity=".0"/><stop offset="1" stop-color="var(--acc)" stop-opacity=".55"/></linearGradient></defs><g class="tis">';
    svg += '<rect x="0" y="0" width="' + bw + '" height="' + air + '" fill="url(#air' + ctx.shot.i + ')"/>';
    Ls.forEach(([k, n, hh, col]) => { band[k] = [y, hh]; svg += '<rect class="b-' + k + '" x="0" y="' + y + '" width="' + bw + '" height="' + hh + '" fill="' + col + '"/><rect x="0" y="' + y + '" width="' + bw + '" height="' + hh + '" fill="url(#sh' + ctx.shot.i + ')"/>'; y += hh; });
    svg += '<path class="surf" d="" fill="#f8ddd0"/>';
    for (let i = 0; i < 7; i++) { const yy = band.muschi[0] + 18 + i * 16; svg += '<path d="M0 ' + yy + ' C ' + bw * 0.3 + ' ' + (yy - 7) + ', ' + bw * 0.6 + ' ' + (yy + 7) + ', ' + bw + ' ' + yy + '" stroke="#cf7f7a" stroke-width="3" fill="none" opacity=".55"/>'; }
    const cells = [];
    for (let i = 0; i < 20; i++) { const r = 20 + R.rnd(i) * 12, x = 30 + R.rnd(i, 2) * (bw - 60), yy = band.grasime[0] + 30 + R.rnd(i, 3) * (220 - 60); cells.push({ x, y: yy, r }); svg += '<circle class="cell" cx="' + x.toFixed(1) + '" cy="' + yy.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="url(#cell' + ctx.shot.i + ')" stroke="#e2b660" stroke-width="2.5"/>'; }
    for (let i = 0; i < 6; i++) { svg += '<path class="fib" pathLength="1" d="" stroke="var(--good)" stroke-width="5" stroke-linecap="round" fill="none" style="stroke-dasharray:1 1"/>'; }
    svg += '<g class="beams" opacity="0"></g><g class="focal"></g><g class="drops"></g>';
    svg += '<rect class="hl" x="3" y="0" width="' + (bw - 6) + '" height="10" rx="16" fill="none" stroke="var(--acc)" stroke-width="7" opacity="0"/>';
    svg += '</g></svg>';
    box.innerHTML = svg;
    const q = (s) => box.querySelector(s), qa = (s) => [...box.querySelectorAll(s)];
    const labs = {};
    Ls.forEach(([k, n]) => { const l = h('div', 'tx abs', n, box); l.style.cssText += ';left:24px;font:850 24px/1 var(--f-body);letter-spacing:.16em;color:rgba(0,0,0,.45)'; l.style.top = (band[k][0] + band[k][1] / 2 - 12) + 'px'; labs[k] = l; });
    // the applicator (hifu / liposonix): a rounded head above the skin
    let ap = null;
    if (p.mode) { ap = h('div', 'abs', '<div style="position:absolute;left:50%;top:-40px;width:60px;height:46px;margin-left:-30px;border-radius:18px 18px 0 0;background:var(--card);border:4px solid var(--ink);border-bottom:0"></div>' + '<div style="position:absolute;inset:14px 30px auto;height:6px;border-radius:3px;background:var(--acc)"></div>', box);
      ap.style.cssText += ';left:' + (bw / 2 - 130) + 'px;top:22px;width:260px;height:80px;border-radius:26px 26px 14px 14px;background:var(--card);border:4px solid var(--ink);box-shadow:0 16px 30px -14px rgba(0,0,0,.45)'; }
    ctx.anim(box, 'mask', ctx.t0 + 0.02, { sfx: 'swoosh_up', gain: 0.45 });
    if (ap) ctx.anim(ap, 'drop', ctx.t0 + 0.3, { amt: 140 });
    ctx.focus(box);
    // labels (one chip each, above the drawing)
    const seq = (p.seq || []).map((s) => Object.assign({}, s, { t: T(ctx, s.at, ctx.t0) })).sort((a, b) => a.t - b.t);
    const chipSeq = [p.label ? { t: ctx.t0 + 0.2, label: p.label } : null].concat(seq).filter((s) => s && s.label);
    chipSeq.forEach((s, i) => { const c = h('div', 'tx abs', '<span class="chip acc">' + esc(s.label) + '</span>', st); place(c, 0, top + bh + 26); c.style.width = '860px'; c.style.textAlign = 'center';
      ctx.anim(c, 'pop', s.t, { sfx: 'pop', gain: 0.4 }); if (chipSeq[i + 1]) ctx.anim(c, 'outUp', chipSeq[i + 1].t - 0.16, { dur: 0.16 }); });
    const get = (kind) => seq.filter((s) => s.do === kind);
    const tEnergy = get('energy')[0], tShrink = get('shrink')[0], tSag = get('sag')[0], tCol = get('collagen')[0], tCream = get('cream')[0], tCalm = get('calm')[0];
    seq.forEach((s) => { R.event(s.t, 'skin:' + s.do);
      if (s.do === 'energy') { ctx.sfx(s.t, 'riser_s', 0.4); ctx.sfx(s.t + 0.55, 'pop', 0.4); }
      if (s.do === 'shrink') ctx.sfx(s.t + 0.2, 'swoosh_down', 0.45);
      if (s.do === 'sag') ctx.sfx(s.t, 'swoosh_down', 0.5);
      if (s.do === 'collagen') ctx.sfx(s.t + 0.2, 'shimmer', 0.5);
      if (s.do === 'cream') { ctx.sfx(s.t + 0.25, 'bubble', 0.5); ctx.sfx(s.t + 0.5, 'bubble', 0.4); }
      if (s.do === 'focus') ctx.sfx(s.t, 'snap', 0.4);
      if (s.do === 'pulse') ctx.sfx(s.t, 'bubble', 0.45); });
    const focal = q('.focal'), beams = q('.beams'), drops = q('.drops'), surf = q('.surf'), hl = q('.hl'), fibs = qa('.fib'), cellEls = qa('.cell');
    const target = p.mode === 'liposonix' ? 'grasime' : 'smas';
    const fy = band[target][0] + band[target][1] / 2;
    const fpts = Array.from({ length: 7 }, (_, i) => bw / 2 - 240 + i * 80);
    fpts.forEach((x) => { const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', fy); c.setAttribute('r', 0); c.setAttribute('fill', '#ff7a45'); focal.appendChild(c); });
    beams.innerHTML = fpts.map((x) => '<path d="M' + (bw / 2 - 90 + (x - bw / 2) * 0.25) + ' 100 L' + (x - 16) + ' ' + fy + ' L' + (x + 16) + ' ' + fy + ' L' + (bw / 2 + 90 + (x - bw / 2) * 0.25) + ' 100 Z" fill="url(#beam' + ctx.shot.i + ')"/>').join('');
    const dropEls = Array.from({ length: 5 }, (_, i) => { const e = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse'); e.setAttribute('fill', '#ffffff'); e.setAttribute('stroke', '#cfe9f3'); e.setAttribute('stroke-width', '4'); drops.appendChild(e); return e; });
    const focusSeq = get('focus');
    ctx.tick((t) => {
      // the surface: flat, or relaxed (sag) — a gentle wave that droops
      const sg = tSag ? E.inout(clamp((t - tSag.t) / 1.2)) : 0;
      const top0 = air; let d = 'M0 ' + top0;
      for (let x = 0; x <= bw; x += 20) d += ' L' + x + ' ' + (top0 + sg * (18 + 14 * Math.sin(x / 70 + 1)) + sg * 30 * Math.sin(Math.PI * x / bw)).toFixed(1);
      d += ' L' + bw + ' ' + (top0 - 2) + ' Z';
      surf.setAttribute('d', d);
      // collagen fibres in the dermis: tight (collagen) or loose (sag)
      const cg = tCol ? E.inout(clamp((t - tCol.t) / 1.1)) : 0;
      fibs.forEach((f, i) => { const yy = band.piele[0] + 32 + i * 15 + sg * 20; const amp = 6 + sg * 22 - cg * 4; f.setAttribute('d', 'M60 ' + yy + ' C ' + bw * 0.3 + ' ' + (yy - amp) + ', ' + bw * 0.6 + ' ' + (yy + amp) + ', ' + (bw - 40) + ' ' + yy);
        f.style.strokeDashoffset = String(tCol ? 1 - E.inout(clamp((t - tCol.t - i * 0.08) / 0.8)) : 0); f.style.opacity = tCol ? 1 : (0.35 - sg * 0.2); });
      // energy: beams and focal points
      const en = tEnergy ? clamp((t - tEnergy.t) / 0.5) : 0;
      beams.setAttribute('opacity', (en * (0.75 + 0.25 * Math.sin(t * 9))).toFixed(3));
      [...focal.children].forEach((c, i) => { const k = tEnergy ? E.back(clamp((t - tEnergy.t - 0.45 - i * 0.06) / 0.35)) : 0; c.setAttribute('r', (k * (13 + 3 * Math.sin(t * 8 + i))).toFixed(2)); c.style.filter = 'drop-shadow(0 0 ' + (8 + 6 * Math.sin(t * 6 + i)).toFixed(1) + 'px #ff7a45)'; });
      // shrink: the fat cells get smaller (liposonix: treated cells, removed in the following weeks)
      const pu = get('pulse').reduce((a, s) => a + (t >= s.t && t < s.t + 0.5 ? Math.sin(Math.PI * (t - s.t) / 0.5) : 0), 0);
      const sh = tShrink ? E.inout(clamp((t - tShrink.t) / 1.6)) : 0;
      cellEls.forEach((c, i) => { const cl = cells[i]; const near = Math.abs(cl.x - bw / 2) < 300 ? 1 : 0.25; c.setAttribute('r', (cl.r * (1 - 0.55 * sh * near) * (1 + 0.16 * pu)).toFixed(2)); c.style.opacity = (1 - 0.5 * sh * near).toFixed(3); });
      // cream: drops land on the surface and stay there (they do not reach the deep layer)
      dropEls.forEach((e, i) => { if (!tCream) { e.setAttribute('rx', 0); return; } const q2 = clamp((t - tCream.t - i * 0.12) / 0.6); const x = bw / 2 - 200 + i * 100; const yy = q2 < 1 ? -40 + E.in(q2) * (air - 6 + 40) : air - 6; const spread = q2 < 1 ? 1 : 1 + 0.8 * E.out(clamp((t - tCream.t - i * 0.12 - 0.6) / 0.5)); e.setAttribute('cx', x); e.setAttribute('cy', yy); e.setAttribute('rx', (16 * spread).toFixed(1)); e.setAttribute('ry', (q2 < 1 ? 20 : 12 / spread).toFixed(1)); });
      // focus: the outline on one layer
      let fo = null; focusSeq.forEach((s) => { if (t >= s.t) fo = s; });
      if (fo && band[fo.layer]) { const [yy, hh] = band[fo.layer]; const k = E.out(clamp((t - fo.t) / 0.35)); hl.setAttribute('y', yy + 4); hl.setAttribute('height', hh - 8); hl.setAttribute('opacity', (k * (0.75 + 0.25 * Math.sin(t * 5))).toFixed(3)); Object.entries(labs).forEach(([k2, l]) => { l.style.color = k2 === fo.layer ? 'var(--acc)' : 'rgba(0,0,0,.35)'; }); }
      else hl.setAttribute('opacity', 0);
      if (tCalm && t > tCalm.t) { const c = clamp((t - tCalm.t) / 0.5); beams.setAttribute('opacity', ((1 - c) * en).toFixed(3)); }
    });
  };

  // ------------------------------------------------------------------ morph: one shape becomes another (star-convex shapes, sampled)
  const SH = R.SHAPES = {
    circle: () => 1,
    fat: (a) => 1 + 0.06 * Math.sin(5 * a + 0.6) + 0.04 * Math.sin(9 * a + 2),
    blob: (a) => 1 + 0.1 * Math.sin(3 * a) + 0.05 * Math.sin(7 * a + 1),
    muscle: (a) => { const rx = 1.45, ry = 0.5; return 1 / Math.sqrt(Math.pow(Math.cos(a) / rx, 4) + Math.pow(Math.sin(a) / ry, 4)) ** 0.5 * 0.92; },
    drop: (a) => { const s = Math.sin(a); return 0.85 + 0.35 * Math.max(0, -s) ** 3 - 0.06 * s; },
    heart: (a) => { const t = a - Math.PI / 2; return 0.62 * (1.6 - 1.1 * Math.abs(Math.sin(t) ** 0.8) * (Math.cos(t) < 0 ? 1.2 : 0.8)) * (1 + 0.35 * Math.sin(t)); },
    star: (a) => 0.72 + 0.28 * Math.cos(5 * a),
    square: (a) => 0.92 / Math.pow(Math.pow(Math.abs(Math.cos(a)), 6) + Math.pow(Math.abs(Math.sin(a)), 6), 1 / 6),
    battery: (a) => { const rx = 0.62, ry = 1.15; return 1 / Math.pow(Math.pow(Math.abs(Math.cos(a)) / rx, 8) + Math.pow(Math.abs(Math.sin(a)) / ry, 8), 1 / 8); },
  };
  R.shapePath = (name, cx, cy, r, n = 140, rot = 0) => { const f = SH[name] || SH.circle; const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a + rot) * r * f(a), cy + Math.sin(a + rot) * r * f(a)]); } return pts; };
  const toD = (pts) => 'M' + pts.map((q) => q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' L') + ' Z';
  // p.stages: [{shape, color, label}], p.keys: [[line, frac, stage(float)], ...]
  V.morph = (ctx, p) => {
    const st = ctx.stage();
    const cx = 430, cy = p.cy || 380, r = p.r || 250;
    const svg = h('div', 'abs', '<svg width="860" height="900" style="overflow:visible"><defs><filter id="mg' + ctx.shot.i + '" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="22"/></filter></defs><path class="glow" filter="url(#mg' + ctx.shot.i + ')" opacity=".45"/><path class="body"/><g class="stri"></g><path class="shine" fill="rgba(255,255,255,.35)"/></svg>', st);
    place(svg, 0, 0);
    const body = svg.querySelector('.body'), glow = svg.querySelector('.glow'), shine = svg.querySelector('.shine'), stri = svg.querySelector('.stri');
    const stages = p.stages.map((s) => ({ pts: R.shapePath(s.shape, cx, cy, r * (s.scale || 1)), col: s.color, lab: s.label, stripes: s.stripes }));
    const keys = (p.keys || [[0, 0, 0]]).map((k) => ({ t: ctx.L(k[0], k[1]), v: k[2] })).sort((a, b) => a.t - b.t);
    keys.forEach((k, i) => { if (i && k.v !== keys[i - 1].v) { ctx.sfx(keys[i - 1].t + 0.05, Math.abs(k.v - keys[i - 1].v) > 0.5 ? 'swoosh_up' : 'swoosh', 0.45); R.event(keys[i - 1].t, 'morph'); } });
    const labs = stages.map((s, i) => { if (!s.lab) return null; const l = h('div', 'tx abs', '<span class="chip ' + (i ? 'acc' : '') + '">' + esc(s.lab) + '</span>', st); place(l, 0, cy + r + 70); l.style.width = '860px'; l.style.textAlign = 'center'; return l; });
    const rgb = (c) => { const m = String(c).match(/^#([0-9a-f]{6})$/i); if (!m) return [255, 200, 120]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
    const v0 = (t) => { if (t <= keys[0].t) return keys[0].v; for (let i = 1; i < keys.length; i++) if (t < keys[i].t) { const a = keys[i - 1], b = keys[i]; return lerp(a.v, b.v, E.inout(clamp((t - a.t) / Math.min(b.t - a.t, p.morphDur || 1.4)))); } return keys[keys.length - 1].v; };
    ctx.anim(svg, 'pop', ctx.t0 + 0.02, { sfx: 'bubble', gain: 0.5 });
    ctx.focus(svg);
    ctx.tick((t) => {
      const v = clamp(v0(t), 0, stages.length - 1); const i = Math.min(stages.length - 2, Math.floor(v)), f = stages.length > 1 ? v - i : 0;
      const A = stages[i], B = stages[Math.min(stages.length - 1, i + 1)];
      const wob = 1 + 0.015 * Math.sin(t * 3);
      const pts = A.pts.map((q, k) => [cx + (lerp(q[0], B.pts[k][0], f) - cx) * wob, cy + (lerp(q[1], B.pts[k][1], f) - cy) * (2 - wob)]);
      const d = toD(pts); body.setAttribute('d', d); glow.setAttribute('d', d);
      const ca = rgb(A.col), cb = rgb(B.col); const c = 'rgb(' + ca.map((x, k) => Math.round(lerp(x, cb[k], f))).join(',') + ')';
      body.setAttribute('fill', c); glow.setAttribute('fill', c);
      shine.setAttribute('d', toD(pts.map((q) => [cx - r * 0.25 + (q[0] - cx) * 0.35, cy - r * 0.3 + (q[1] - cy) * 0.22])));
      // stripes (muscle fibres) fade in with the stage that has them
      const so = (A.stripes ? 1 - f : 0) + (B.stripes ? f : 0);
      if (!stri.childNodes.length) stri.innerHTML = Array.from({ length: 7 }, (_, k) => '<path stroke="rgba(255,255,255,.55)" stroke-width="6" stroke-linecap="round" fill="none"/>').join('');
      [...stri.children].forEach((s2, k) => { const yy = cy - 90 + k * 30; s2.setAttribute('d', 'M' + (cx - 260 * so) + ' ' + yy + ' Q ' + cx + ' ' + (yy + 8 * Math.sin(t * 2 + k)) + ' ' + (cx + 260 * so) + ' ' + yy); s2.style.opacity = (so * 0.9).toFixed(3); });
      labs.forEach((l, k) => { if (!l) return; const near = 1 - clamp(Math.abs(v - k) * 2.2); l.style.opacity = near.toFixed(3); l.style.transform = 'translateY(' + ((1 - near) * 20).toFixed(1) + 'px)'; l.style.visibility = near < 0.01 ? 'hidden' : ''; });
    });
    if (p.question) { const qm = h('div', 'tx abs disp', '?', st); qm.style.cssText += ';left:' + (cx + r * 0.75) + 'px;top:' + (cy - r - 40) + 'px;font-size:220px;color:var(--acc);font-weight:900'; ctx.anim(qm, 'spin', T(ctx, p.question, ctx.L(0, 0.6)), { sfx: 'pop' }); if (p.questionOut) ctx.anim(qm, 'out', T(ctx, p.questionOut)); }
  };

  // ------------------------------------------------------------------ shatter: a glass card with a claim cracks and breaks; the truth is behind
  V.shatter = (ctx, p) => {
    const st = ctx.stage();
    const behind = p.behind ? R.kt(p.behind, st) : null;
    if (behind) { behind.style.left = '0'; behind.style.width = '860px'; fit(behind, 820, 420, p.behindSize || 130, 60); behind.style.top = (450 - behind.offsetHeight / 2) + 'px'; }
    const cw = 780, chh = p.cardH || 560, x0 = 40, y0 = 450 - chh / 2;
    const tCrack = T(ctx, p.crackAt, ctx.L(0, 0.3)), tBreak = T(ctx, p.breakAt, ctx.L(0, 0.7));
    const shards = [];
    // shards: a fan of polygons around the impact point
    const ix = cw * 0.58, iy = chh * 0.42, n = 11, ang = [];
    for (let i = 0; i < n; i++) ang.push((i / n) * Math.PI * 2 + R.rnd(i, 3) * 0.35);
    const edge = (a) => { const dx = Math.cos(a), dy = Math.sin(a); const tx = dx > 0 ? (cw - ix) / dx : -ix / dx; const ty = dy > 0 ? (chh - iy) / dy : -iy / dy; const k = Math.min(Math.abs(tx), Math.abs(ty)); return [ix + dx * k, iy + dy * k]; };
    const probe = h('div', 'disp', R.rich(p.text), st); probe.style.cssText += ';position:absolute;left:0;top:0;width:' + (cw - 120) + 'px;text-align:center;visibility:hidden';
    const fsz = fit(probe, cw - 120, chh - 170, p.size || 96, 40); probe.remove();
    const html = '<div class="disp" style="position:absolute;inset:0;display:grid;place-items:center;padding:90px 60px 60px;text-align:center;font-size:' + fsz + 'px">' + R.rich(p.text) + '</div>' + (p.tag ? '<span class="chip" style="position:absolute;left:36px;top:32px">' + esc(p.tag) + '</span>' : '');
    for (let i = 0; i < n; i++) {
      const a = ang[i], b = ang[(i + 1) % n] + (i === n - 1 ? Math.PI * 2 : 0);
      const pts = [[ix, iy], edge(a)];
      // add the card corners between the two edges
      [[cw, chh], [0, chh], [0, 0], [cw, 0]].forEach((c) => { let ca = Math.atan2(c[1] - iy, c[0] - ix); while (ca < a) ca += Math.PI * 2; if (ca < b) pts.push(c); });
      pts.sort((u, v) => { const au = (Math.atan2(u[1] - iy, u[0] - ix) - a + Math.PI * 4) % (Math.PI * 2), av = (Math.atan2(v[1] - iy, v[0] - ix) - a + Math.PI * 4) % (Math.PI * 2); return au - av; });
      pts.push(edge(b % (Math.PI * 2)));
      const s = h('div', 'abs glass shard', html, st); place(s, x0, y0, cw, chh);
      s.style.clipPath = 'polygon(' + pts.map((q) => q[0].toFixed(1) + 'px ' + q[1].toFixed(1) + 'px').join(',') + ')';
      s.style.background = 'var(--card)'; s.style.borderRadius = '40px';
      const mid = (a + b) / 2; s._dir = [Math.cos(mid), Math.sin(mid)]; s._r = (R.rnd(i, 8) - 0.5) * 70; s._v = 700 + R.rnd(i, 9) * 600;
      shards.push(s);
    }
    const crack = h('div', 'abs', '<svg width="' + cw + '" height="' + chh + '" style="overflow:visible">' + ang.map((a, i) => { const e = edge(a); const mx = ix + (e[0] - ix) * 0.5 + (R.rnd(i, 2) - 0.5) * 40, my = iy + (e[1] - iy) * 0.5 + (R.rnd(i, 4) - 0.5) * 40; return '<path pathLength="1" d="M' + ix + ' ' + iy + ' L' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' L' + e[0].toFixed(1) + ' ' + e[1].toFixed(1) + '" stroke="var(--ink)" stroke-width="4" fill="none" stroke-linecap="round" style="stroke-dasharray:1 1;stroke-dashoffset:1"/>'; }).join('') + '</svg>', st);
    place(crack, x0, y0);
    const cracks = [...crack.querySelectorAll('path')];
    const card0 = shards[0];
    shards.forEach((s) => ctx.anim(s, 'in', ctx.t0 + 0.02, { sfx: null, quiet: true }));
    ctx.sfx(ctx.t0 + 0.02, 'swoosh_up', 0.4); R.event(ctx.t0 + 0.02, 'in');
    ctx.sfx(tCrack, 'glitch', 0.45); ctx.sfx(tCrack + 0.02, 'snap', 0.7); R.event(tCrack, 'crack');
    ctx.sfx(tBreak, 'shatter', 1); ctx.sfx(tBreak, 'impact', 0.6); R.event(tBreak, 'break');
    if (behind) { [...behind.querySelectorAll('.w')].forEach((w, i) => ctx.anim(w, 'blurIn', tBreak + 0.15 + i * 0.07, { sfx: i ? null : 'shimmer', gain: 0.4 })); }
    if (p.after) R.chipSeq(ctx, st, p.after, 700, 'soft');
    ctx.focus(card0);
    ctx.tick((t) => {
      cracks.forEach((c, i) => { c.style.strokeDashoffset = String(1 - E.out(clamp((t - tCrack - i * 0.025) / 0.35))); });
      crack.style.opacity = t > tBreak ? '0' : '1';
      const shake = t > tCrack && t < tCrack + 0.3 ? Math.sin((t - tCrack) * 70) * 10 * (1 - (t - tCrack) / 0.3) : 0;
      shards.forEach((s) => { const q = Math.max(0, t - tBreak); s.dataset.base = q > 0 ? 'translate(' + (s._dir[0] * s._v * q).toFixed(1) + 'px,' + (s._dir[1] * s._v * q + 1400 * q * q).toFixed(1) + 'px) rotate(' + (s._r * q * 6).toFixed(1) + 'deg)' : 'translateX(' + shake.toFixed(1) + 'px)'; });
    });
  };

  // ------------------------------------------------------------------ photo: a real catalog photo (before | after, published with consent)
  // shown exactly as it is; p.mode: 'tease' (the after half under a cover) | 'reveal' (the cover leaves at p.revealAt) | 'full'
  V.photo = (ctx, p) => {
    const st = ctx.stage();
    const fr = h('div', 'abs', null, st); fr.style.cssText += ';border-radius:34px;overflow:hidden;background:#fff;box-shadow:0 50px 90px -40px rgba(0,0,0,.6);border:8px solid #fff';
    const im = h('img', null, null, fr); im.src = R.ROOT + '/' + p.img; im.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
    const note = p.note !== false ? h('div', 'tx abs note', esc(p.note || 'Publicat cu acordul clientei. Rezultatele diferă de la o persoană la alta.'), st) : null;
    const lab = p.label ? h('div', 'tx abs', '<span class="chip acc">' + R.icon('camera') + esc(p.label) + '</span>', st) : null;
    const cover = p.mode === 'tease' || p.mode === 'reveal' ? h('div', 'abs', '<div style="position:absolute;inset:0;display:grid;place-items:center"><div style="text-align:center"><div class="disp" style="font-size:190px;color:var(--acc);line-height:.9">?</div>' + (p.coverText ? '<div class="lab" style="font-size:36px;margin-top:10px">' + esc(p.coverText) + '</div>' : '') + '</div></div>', fr) : null;
    if (cover) cover.style.cssText += ';background:repeating-linear-gradient(135deg,var(--card) 0 26px,var(--bg2) 26px 52px)';
    const revealT = p.mode === 'reveal' ? T(ctx, p.revealAt, ctx.L(0, 0.4)) : null;
    if (revealT != null) ctx.shot.revealAt = revealT;
    if (cover && p.mode === 'tease') { const qm = cover.querySelector('.disp'); ctx.anim(qm, 'bump', T(ctx, p.qAt, ctx.L(0, 0.6)), { amt: 0.25, event: true }); ctx.sfx(T(ctx, p.qAt, ctx.L(0, 0.6)), 'pop', 0.4); }
    ctx.shot.after = () => {
      const iw = im.naturalWidth || 1286, ih = im.naturalHeight || 1400;
      // the photo, then its label and the consent note under it (the stage reaches down to the captions here)
      const maxW = p.w || 800, maxH = 930 - (note ? 76 : 0) - (lab ? 80 : 0) - 16;
      const k = Math.min(maxW / iw, maxH / ih), w = iw * k, hh = ih * k;
      const y0 = Math.max(0, (maxH - hh) / 2) + 6;
      place(fr, (860 - w - 16) / 2, y0, w + 16, hh + 16);
      if (lab) { place(lab, 0, y0 + hh + 34); lab.style.width = '860px'; lab.style.textAlign = 'center'; }
      if (p.chips) { if (lab) ctx.anim(lab, 'outUp', T(ctx, p.chips[0].at) - 0.15, { dur: 0.15 }); R.chipSeq(ctx, st, p.chips, y0 + hh + 34); }
      if (note) { place(note, 40, y0 + hh + 34 + (lab ? 80 : 0)); note.style.width = '780px'; }
      if (cover) { const seam = p.seam || 0.5; if (p.split === 'h') place(cover, w * seam, 0, w * (1 - seam), hh); else place(cover, 0, hh * seam, w, hh * (1 - seam)); }
      fr._hh = hh; fr._w = w;
    };
    ctx.anim(fr, p.enter || 'in', ctx.t0 + 0.02, { sfx: 'shutter', gain: 0.7 });
    if (lab) ctx.anim(lab, 'pop', ctx.t0 + 0.3, { gain: 0.35 });
    if (note) ctx.anim(note, 'fade', ctx.t0 + 0.4, { sfx: null });
    if (cover) ctx.anim(cover, 'fade', ctx.t0, { sfx: null, dur: 0.01, quiet: true });
    ctx.focus(fr);
    if (revealT != null) R.event(revealT, 'reveal');
    const mask = p.mask || 'diagonal';
    ctx.tick((t, lt) => {
      im.style.transform = 'scale(' + (1 + 0.025 * clamp(lt / 6)).toFixed(4) + ')';
      if (!cover) return;
      if (revealT == null || t < revealT) { cover.style.clipPath = ''; cover.style.opacity = '1'; return; }
      const q = E.inout(clamp((t - revealT) / 0.7));
      if (mask === 'circle') cover.style.clipPath = 'circle(' + ((1 - q) * 120).toFixed(1) + '% at 50% 50%)';
      else if (mask === 'wipe') cover.style.clipPath = 'inset(0 0 0 ' + (q * 100).toFixed(1) + '%)';
      else { const x = q * 220 - 60; cover.style.clipPath = 'polygon(' + x + '% 0,120% 0,120% 100%,' + (x - 60) + '% 100%)'; }
    });
  };

  // ------------------------------------------------------------------ Nuki (the mascot): poses per line, squash and stretch, a bubble
  R.nukiImg = (pose) => R.ROOT + '/brand_asset/mascota/ipostaze/' + (pose || 'prezinta') + '.webp';
  V.nuki = (ctx, p) => {
    const st = ctx.stage();
    const k = p.k || 0.78, nw = 690 * k, nh = 747 * k;
    const x = p.x != null ? p.x : (860 - nw) / 2, y = p.y != null ? p.y : 900 - nh - 10;
    const rig = h('div', 'abs', null, st); place(rig, x, y, nw, nh); rig.style.transformOrigin = '50% 96%';
    const poses = (p.poses || [p.pose || 'prezinta']).map((ps) => { const im = h('img', null, null, rig); im.src = R.nukiImg(ps); im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;transform-origin:50% 96%'; return { ps, im }; });
    const times = poses.map((_, i) => (i === 0 ? ctx.t0 : p.poseAt && p.poseAt[i] ? T(ctx, p.poseAt[i]) : ctx.L(i, 0, -0.08)));
    poses.forEach((_, i) => { if (i) { ctx.sfx(times[i], 'pop', 0.35); R.event(times[i], 'pose'); } });
    const ent = p.enter || 'pop';
    ctx.anim(rig, ent === 'left' ? 'slideR' : ent === 'right' ? 'slideL' : 'pop', ctx.t0 + 0.05, { amt: -500, gain: 0.5 });
    const bubbles = (p.bubbles || []).map((b, i) => { if (!b) return null; const d = h('div', 'tx abs', '<div class="card" style="padding:24px 34px;font:850 46px/1.08 var(--f-display);letter-spacing:-.03em;text-align:center">' + R.rich(b) + '</div>', st); place(d, 40, Math.max(0, y - 190)); d.style.width = '780px'; ctx.anim(d, 'pop', ctx.L(i, 0.1), { sfx: 'bubble', gain: 0.5 }); if (p.bubbles[i + 1] || i < (p.bubbles.length - 1)) ctx.anim(d, 'out', ctx.L(i + 1, 0, -0.1)); return d; });
    ctx.focus(rig);
    ctx.tick((t) => {
      let cur = 0; times.forEach((tt, i) => { if (t >= tt) cur = i; });
      poses.forEach((q, i) => { q.im.style.opacity = i === cur ? '1' : '0'; });
      const q = clamp((t - times[cur]) / 0.24); const sq = cur ? 0.88 + 0.12 * E.back(q) : 1;
      poses[cur].im.style.transform = 'scale(' + (2 - sq).toFixed(4) + ',' + sq.toFixed(4) + ')';
      rig.dataset.base = 'translateY(' + (Math.sin(t * 2.2) * 8).toFixed(2) + 'px) rotate(' + (Math.sin(t * 1.7) * 1.6).toFixed(2) + 'deg)';
    });
    return bubbles;
  };
  // a small Nuki reacting in a corner of any shot: line.b.nuki = {pose, at:'br'|'bl', k}
  R.nukiCorner = (ctx, spec, t) => {
    const k = spec.k || 0.34, nw = 690 * k, nh = 747 * k;
    const x = spec.at === 'bl' ? 60 : 900 - nw, y = 1170 - nh;
    const d = h('div', 'abs', '<img src="' + R.nukiImg(spec.pose) + '" style="width:100%;height:100%;object-fit:contain">', ctx.el); place(d, x, y, nw, nh); d.style.transformOrigin = '50% 100%';
    ctx.anim(d, 'pop', t, { sfx: 'bubble', gain: 0.4 });
    ctx.tick((tt) => { d.dataset.base = 'rotate(' + (Math.sin(tt * 2) * 3).toFixed(2) + 'deg)'; });
  };

  // ------------------------------------------------------------------ panel: an AI illustration (imagen.py), with a ken-burns / parallax / mask
  // missing image → a clean code-drawn panel (gradient, soft shapes, a big icon), never a broken frame
  V.panel = (ctx, p) => {
    const full = p.fit === 'full';
    const holder = full ? ctx.layer(0.6) : ctx.stage();
    const card = h('div', 'abs', null, holder);
    if (full) place(card, -40, -40, 1160, 2000); else { place(card, 30, p.top || 60, 800, p.h || 760); card.style.borderRadius = '48px'; card.style.boxShadow = 'var(--sh)'; }
    card.style.overflow = 'hidden';
    const src = ctx.img(p.name);
    let inner;
    if (src) { inner = h('img', null, null, card); inner.src = src; inner.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover'; }
    else {
      inner = h('div', 'abs', null, card); inner.style.cssText = 'position:absolute;inset:0;background:radial-gradient(circle at 30% 25%,var(--bg2),transparent 60%),radial-gradient(circle at 75% 80%,var(--bg3, var(--acc)) 0%,transparent 55%),linear-gradient(160deg,var(--card),var(--bg))';
      const ic = h('div', 'abs ico', R.icon(p.icon || 'sparkles'), inner); ic.style.cssText += ';left:50%;top:50%;width:360px;height:360px;margin:-180px 0 0 -180px;border-radius:50%;background:var(--card);color:var(--acc);box-shadow:var(--sh)';
      for (let i = 0; i < 3; i++) { const b = h('i', 'abs', null, inner); const sz = 120 + i * 70; b.style.cssText += ';width:' + sz + 'px;height:' + sz + 'px;border-radius:50%;left:' + [60, 560, 120][i] + 'px;top:' + [80, 140, 520][i] + 'px;background:radial-gradient(circle at 30% 30%,#fff,var(--acc2) 60%);opacity:.35'; b.dataset.depth = '1'; }
    }
    const kb = p.kb || 'in';
    const mask = p.mask || 'up';
    ctx.anim(card, mask === 'circle' ? 'blurIn' : mask === 'wipe' ? 'wipe' : 'mask', ctx.t0 + 0.02, { sfx: mask === 'wipe' ? 'paper' : 'swoosh_up', gain: 0.5 });
    if (mask === 'circle') { ctx.tick((t) => { const q = E.expo(clamp((t - ctx.t0) / 0.7)); card.style.clipPath = 'circle(' + (q * 75).toFixed(1) + '% at 50% 50%)'; }); }
    if (p.label) { const l = h('div', 'tx abs', '<span class="chip ' + (p.chip || (R.theme.dark ? 'acc' : 'soft')) + '">' + (p.labelIcon ? R.icon(p.labelIcon) : '') + esc(p.label) + '</span>', ctx.stage()); place(l, 0, full ? 40 : (p.top || 60) + (p.h || 760) - 40); l.style.width = '860px'; l.style.textAlign = 'center'; ctx.anim(l, 'pop', T(ctx, p.labelAt, ctx.L(0, 0.3)), { gain: 0.4 }); }
    ctx.focus(card);
    ctx.tick((t, lt) => {
      const d = Math.max(1, ctx.t1 - ctx.t0), q = E.sine(clamp(lt / d));
      const s = kb === 'out' ? 1.14 - 0.1 * q : 1.04 + 0.1 * q;
      const x = kb === 'pan' ? -30 + 60 * q : 0;
      inner.style.transform = 'translateX(' + x.toFixed(1) + 'px) scale(' + s.toFixed(4) + ')';
    });
  };


  // an AI environment behind any visual (vis.bg = {name, prompt}): full bleed, deep in the parallax, faded into the theme
  R.bgPanel = (ctx, bg) => {
    const src = ctx.img(bg.name); if (!src) return;
    const lay = ctx.layer(-0.6);
    const cx = bg.cx || 490, cy = bg.cy || 690, w = bg.w || 1300, hh = w * 1.37;
    const im = h('img', null, null, lay); im.src = src;
    im.style.cssText = 'position:absolute;left:' + (cx - w / 2) + 'px;top:' + (cy - hh / 2) + 'px;width:' + w + 'px;height:' + hh + 'px;object-fit:cover;opacity:' + (bg.opacity || 0.85) +
      ';-webkit-mask-image:radial-gradient(ellipse 50% 50% at 50% 50%,#000 55%,transparent 100%);mask-image:radial-gradient(ellipse 50% 50% at 50% 50%,#000 55%,transparent 100%)';
    ctx.anim(im, 'blurIn', ctx.t0, { sfx: null, quiet: true });
    ctx.tick((t, lt) => { const d = Math.max(1, ctx.t1 - ctx.t0); im.style.transform = 'scale(' + (1.02 + 0.06 * E.sine(clamp(lt / d))).toFixed(4) + ')'; });
  };

  // ------------------------------------------------------------------ stamp: MIT / ADEVĂR / PE JUMĂTATE
  V.stamp = (ctx, p) => {
    const st = ctx.stage();
    const col = p.tone === 'good' ? 'var(--good)' : p.tone === 'half' ? '#f2a100' : 'var(--bad)';
    const box = h('div', 'tx abs', '<span style="display:inline-block;padding:14px 60px 24px;border:18px solid currentColor;border-radius:52px;font:950 250px/1 var(--f-display);letter-spacing:-.05em;color:' + col + '">' + esc(p.word) + '</span>', st);
    box.style.left = '0'; box.style.width = '860px'; box.style.textAlign = 'center';
    fit(box.firstChild, 840, 400, 250, 120); box.firstChild.style.fontSize = box.firstChild.style.fontSize;
    const sp = box.firstChild; sp.dataset.base = 'rotate(' + (p.rot != null ? p.rot : -7) + 'deg)';
    const sub = p.sub ? h('div', 'tx abs disp', R.rich(p.sub), st) : null;
    if (sub) { sub.style.cssText += ';left:0;width:860px;text-align:center;font-size:62px'; }
    const tot = box.offsetHeight + (sub ? sub.offsetHeight + 50 : 0);
    box.style.top = ((900 - tot) / 2 - 20) + 'px'; if (sub) sub.style.top = ((900 - tot) / 2 - 20 + box.offsetHeight + 50) + 'px';
    const t = T(ctx, p.at, ctx.L(0, 0, 0.02));
    ctx.anim(sp, 'slam', t, { sfx: 'impact', gain: 0.9, dur: 0.3 });
    ctx.sfx(t + 0.02, p.tone === 'good' ? 'chime' : 'boom', 0.55);
    ctx.anim(st, 'shake', t + 0.12, { quiet: true });
    if (sub) ctx.anim(sub, 'in', T(ctx, p.subAt, ctx.L(0, 0.5)));
    ctx.focus(sp);
  };
})();
