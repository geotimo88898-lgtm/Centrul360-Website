// Centrul360 reels v2: one real case, filmed with the camera (15.11, after the owner's camera reference, the lighthouse).
// No voice. One catalog case, cut into its two halves (never retouched), and four named moves, each on a beat of the
// song and each revealing something:
//   0. calm: so close to the "before" photo that it is only a soft grey landscape with one line in it (the jaw)
//   1. PULL BACK on the song's first hit: the line is a profile, the profile is a print standing in a white studio
//   2. DOLLY ZOOM in the song's silence: the print keeps its size, the world behind it grows, and a second print
//      appears behind the first one, bigger
//   3. CRANE from the face down to the detail that changed, the corners of a viewfinder close on it, the breath held
//   4. FLASH-THROUGH on the drop: through the first print, into the light, and under it the same detail, after, with
//      the true session count
//   then the camera rises to show the whole "after", the "before" comes back beside it, and both turn to their true
//   colours on the next hit: the catalog's case, side by side, with its words. Held.
// The film is black and white with turquoise light (both halves always the same treatment, the same scale); the end
// shows the picture in its true colours.
//   visual: { type: "cazcam", img, before: [sx, sy, sw, sh], after: [...], hits: {name: reel second}, title, meta, consent,
//             line, kicker, count: [number, word] }
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, E, h, esc } = R;
  const W = 1080, H = 1920, INK = '#0b0b0d', TEAL = '#14a596', DEEP = '#0b7f74';
  const smooth = (p) => { p = clamp(p); return p * p * (3 - 2 * p); };
  const out5 = (p) => 1 - Math.pow(1 - clamp(p), 5), out3 = (p) => 1 - Math.pow(1 - clamp(p), 3);
  const lerp = (a, b, p) => a + (b - a) * p, fr = (t) => Math.round(t * 30) / 30;
  const ease = (t, t0, d) => R.cam.ease(t, t0, d);

  V.cazcam = (ctx, p) => {
    const el = ctx.el;
    const root = h('div', null, null, el); root.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px;overflow:hidden;background:#f3f6f5';
    const cv = h('canvas', null, null, root); cv.width = W; cv.height = H; cv.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    const c = cv.getContext('2d');
    const ov = h('div', null, null, root); ov.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    const pre = h('div', null, null, el); pre.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    const im = h('img', null, null, pre); im.src = R.ROOT + '/brand_asset/catalog/' + p.img; im.decoding = 'sync';
    const SB = p.before, SA = p.after;               // the two halves (source px), the catalog's own labels left out
    const HT = {}; Object.entries(p.hits).forEach(([k, t]) => { HT[k] = Array.isArray(t) ? t.map(fr) : fr(t); });
    const tPull = HT.pull, tTag = HT.tag, tDolly = HT.dolly, tCrane = HT.crane, tBreath = HT.breath, tDrop = HT.drop, tRise = HT.rise, tSide = HT.side, tColour = HT.colour, tStop = HT.stop, tBack = HT.back;
    // ---- the world (px, the subject's plane at Z 0; +y down): the before print, the after print hidden behind it, the wall
    const CW = 760, CH = CW * SB[3] / SB[2], K = CW / SB[2];   // the print, 760 px wide at rest; K: world px per source px
    const ZA = 900, ZW = 2600, F0 = 1500;                    // the after print and the wall, behind
    const CA = CW * (F0 + ZA) / F0;                           // the after print's world width: exactly the before print's size at rest
    const src2w = (sx, sy) => [(sx - SB[2] / 2) * K, (sy - SB[3] / 2) * K]; // a point of a half (its own px) → the print's world px
    const MAC = src2w(p.macro[0], p.macro[1]), CHIN = src2w(p.detail[0], p.detail[1]), FACE = src2w(p.face[0], p.face[1]);
    // ---- the camera: position on the subject's plane (x, y), distance D and focal F (both F0 at rest: the print 1:1)
    const REST = { x: 0, y: 0, D: F0, F: F0 };
    const MACRO = (t) => ({ x: MAC[0] + 14 * Math.sin(t * 0.7), y: MAC[1] + 9 * Math.sin(t * 0.53 + 1), D: F0 / (2.75 + 0.18 * (t / tPull)), F: F0 });
    const DOL = { x: FACE[0] * 0.35, y: FACE[1] * 0.9, D: 2900, F: 2900 };
    const CR = { x: CHIN[0], y: CHIN[1], D: 2900 / 2.25, F: 2900 };
    const mix = (a, b, q) => ({ x: lerp(a.x, b.x, q), y: lerp(a.y, b.y, q), D: lerp(a.D, b.D, q), F: lerp(a.F, b.F, q) });
    function cam(t) {
      if (t < tPull) return MACRO(t);
      if (t < tDolly) { const q = ease(t, tPull, 0.75); const c0 = mix(MACRO(tPull), REST, q); c0.x += 6 * Math.sin((t - tPull) * 0.9) * q; return c0; }
      if (t < tCrane) { const q = ease(t, tDolly, 0.95); return mix(REST, DOL, q); }
      const q = ease(t, tCrane, 1.05); const c1 = mix(DOL, CR, q);
      if (t > tCrane + 1.05) { const k = t - tCrane - 1.05; c1.D /= 1 + 0.02 * k; }                                    // the held breath: a creep
      if (t > tBreath) { const k = clamp((t - tBreath) / (tDrop - tBreath)); c1.D /= 1 + 1.4 * Math.pow(k, 2.4); }      // the rush into the light
      return c1;
    }
    const proj = (C, X, Y, Z) => { const s = C.F / (C.D + Z); return { x: W / 2 + (X - C.x) * s, y: H / 2 + (Y - C.y) * s, s }; };
    // ---- the after part, in screen space: a print's centre and width
    const FIN = { w: 494, y: 752, gap: 22 };                  // the two prints side by side at the end
    const aCh = src2w(p.detail[0], p.detail[1]);
    function afterRect(t) {
      // under the light: the same detail, the same framing as the before print had (k 2.25), already a little closer
      const kIn = 2.25 * (1 + 0.1 * (1 - out5((t - tDrop) / 0.5)) + 0.012 * (t - tDrop));
      const A = { cx: W / 2 - aCh[0] * kIn, cy: H / 2 - aCh[1] * kIn, w: CW * kIn };
      const q = ease(t, tRise, 0.85), B = { cx: W / 2, cy: 900, w: CW * 0.92 };
      const r = { cx: lerp(A.cx, B.cx, q), cy: lerp(A.cy, B.cy, q), w: lerp(A.w, B.w, q) };
      if (t < tRise) { r.cx = A.cx; r.cy = A.cy; r.w = A.w; }
      const s = ease(t, tSide, 0.8); const Fr = { cx: W / 2 + (FIN.w + FIN.gap) / 2, cy: FIN.y, w: FIN.w };
      return { cx: lerp(r.cx, Fr.cx, s), cy: lerp(r.cy, Fr.cy, s), w: lerp(r.w, Fr.w, s) };
    }
    function beforeBack(t) { // the before print comes back from the left, beside the after one
      const s = ease(t, tSide + 0.06, 0.8);
      return { cx: lerp(-700, W / 2 - (FIN.w + FIN.gap) / 2, s), cy: lerp(FIN.y + 60, FIN.y, s), w: FIN.w, r: lerp(-7, 0, s) };
    }
    // ---- drawing
    const tmp = document.createElement('canvas'); tmp.width = 1400; tmp.height = 1800; const tg = tmp.getContext('2d');
    function print(srcR, cx, cy, w, o = {}) {
      const hh = w * srcR[3] / srcR[2], pad = Math.max(3, w * 0.026), rad = Math.max(4, w * 0.032), x = cx - w / 2, y = cy - hh / 2;
      c.save(); c.translate(cx, cy); if (o.r) c.rotate(o.r * Math.PI / 180); c.translate(-cx, -cy);
      c.globalAlpha = o.alpha == null ? 1 : o.alpha;
      // its soft shadow on the wall, then the white mat, then the photo
      c.save(); c.shadowColor = 'rgba(4,40,36,' + (0.28 * (o.shadow == null ? 1 : o.shadow)).toFixed(3) + ')'; c.shadowBlur = w * 0.09; c.shadowOffsetY = w * 0.05; c.fillStyle = '#fff';
      rr(x - pad, y - pad, w + pad * 2, hh + pad * 2, rad + pad); c.fill(); c.restore();
      c.save(); rr(x, y, w, hh, rad); c.clip();
      const g = o.gray == null ? 1 : o.gray, fl = [];
      if (g > 0.001) fl.push('grayscale(' + g.toFixed(3) + ')', 'contrast(' + (1 + 0.06 * g).toFixed(3) + ')');
      if (o.blur > 0.3) fl.push('blur(' + o.blur.toFixed(1) + 'px)');
      c.filter = fl.length ? fl.join(' ') : 'none'; c.imageSmoothingQuality = 'high';
      c.drawImage(im, srcR[0], srcR[1], srcR[2], srcR[3], x, y, w, hh); c.filter = 'none';
      if (o.sweep != null) { const sx = x - w * 0.6 + (w * 2.2) * o.sweep, gr = c.createLinearGradient(sx - w * 0.25, y, sx + w * 0.25, y + hh * 0.4);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,' + (0.22 * Math.sin(Math.PI * clamp(o.sweep))).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(x, y, w, hh); }
      c.restore(); c.restore();
      return { x, y, w, h: hh };
    }
    function rr(x, y, w, hh, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
    // the studio wall: soft white, the brand's grid, a giant pale "1" and a turquoise light
    function wall(C, t) {
      c.fillStyle = '#f3f6f5'; c.fillRect(0, 0, W, H);
      const s = C.F / (C.D + ZW), cx = W / 2 - C.x * s, cy = H / 2 - C.y * s;
      const lg = c.createRadialGradient(cx - 260 * s + 90 * Math.sin(t * 0.4), cy - 900 * s, 0, cx, cy - 300 * s, 2600 * s); lg.addColorStop(0, 'rgba(95,212,198,.30)'); lg.addColorStop(0.5, 'rgba(95,212,198,.08)'); lg.addColorStop(1, 'rgba(95,212,198,0)');
      c.fillStyle = lg; c.fillRect(0, 0, W, H);
      const cell = 150 * s; if (cell > 6) { c.save(); c.strokeStyle = 'rgba(20,165,150,.11)'; c.lineWidth = 1; c.beginPath();
        const x0 = ((cx % cell) + cell) % cell, y0 = ((cy % cell) + cell) % cell; for (let x = x0; x <= W; x += cell) { c.moveTo(Math.round(x) + 0.5, 0); c.lineTo(Math.round(x) + 0.5, H); } for (let y = y0; y <= H; y += cell) { c.moveTo(0, Math.round(y) + 0.5); c.lineTo(W, Math.round(y) + 0.5); } c.stroke();
        c.strokeStyle = 'rgba(20,165,150,.16)'; c.lineWidth = 2; c.beginPath(); const big = cell * 4, bx = ((cx % big) + big) % big, by = ((cy % big) + big) % big;
        for (let x = bx; x <= W; x += big) { c.moveTo(Math.round(x), 0); c.lineTo(Math.round(x), H); } for (let y = by; y <= H; y += big) { c.moveTo(0, Math.round(y)); c.lineTo(W, Math.round(y)); } c.stroke(); c.restore(); }
      const vg = c.createRadialGradient(540, 900, 600, 540, 900, 1400); vg.addColorStop(0, 'rgba(10,40,36,0)'); vg.addColorStop(1, 'rgba(10,40,36,.10)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
    }
    // the viewfinder's corners, closing on the detail
    function corners(cx, cy, w, hh, a) { if (a <= 0.01) return; c.save(); c.globalAlpha = a; c.strokeStyle = TEAL; c.lineWidth = 6; c.lineCap = 'round'; const L = 64;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => { const x = cx + sx * w / 2, y = cy + sy * hh / 2; c.beginPath(); c.moveTo(x, y - sy * L); c.lineTo(x, y); c.lineTo(x - sx * L, y); c.stroke(); }); c.restore(); }

    let white = 0;
    function draw(t) {
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.filter = 'none'; white = 0;
      if (t < tDrop) {
        const C = cam(t); wall(C, t);
        // the after print, hidden behind the before one until the dolly shows its edges
        const a = proj(C, 0, 0, ZA); print(SA, a.x, a.y, CA * a.s, { gray: 1, blur: 1.2 + 2.5 * smooth((t - tDolly) / 0.9), shadow: 0.7 });
        const b = proj(C, 0, 0, 0), bw = CW * b.s;
        const blur = t < tPull ? 7 * (1 - smooth(t / 2.6)) + 1.2 : 0;
        print(SB, b.x, b.y, bw, { gray: 1, blur, sweep: t > tTag && t < tTag + 1.0 ? (t - tTag) / 1.0 : null });
        // the crane lands: the corners close on the detail; a breath of shade around it
        const cq = smooth((t - tCrane - 0.62) / 0.4), dp = proj(C, CHIN[0], CHIN[1], 0);
        if (cq > 0) { const sh = 0.16 * cq; const gr = c.createRadialGradient(dp.x, dp.y, 260, dp.x, dp.y, 900); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,' + sh.toFixed(3) + ')'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
          const sz = lerp(1.5, 1, out5((t - tCrane - 0.62) / 0.45)); corners(dp.x, dp.y, 560 * sz, 520 * sz, cq * (1 - smooth((t - tDrop + 0.12) / 0.1))); }
        if (t > tDrop - 0.2) white = Math.pow(clamp((t - tDrop + 0.2) / 0.2), 1.3);                                         // into the light
      } else {
        const C = REST; wall({ x: (afterRect(t).cx - W / 2) * -0.08, y: 0, D: F0, F: F0 }, t);
        const A = afterRect(t), gq = 1 - smooth((t - tColour) / 0.3);
        if (t >= tSide) { const B = beforeBack(t); print(SB, B.cx, B.cy, B.w, { gray: gq, r: B.r, sweep: t > tBack ? (t - tBack) / 1.4 : t > tStop ? (t - tStop) / 1.4 : null }); }
        print(SA, A.cx, A.cy, A.w, { gray: gq, sweep: t > tBack + 0.08 ? (t - tBack - 0.08) / 1.4 : t > tStop + 0.08 ? (t - tStop - 0.08) / 1.4 : null });
        void C;
        white = 1 - smooth((t - tDrop) / 0.34);
      }
      if (white > 0.002) { c.setTransform(1, 0, 0, 1, 0, 0); const g = c.createRadialGradient(540, 900, 0, 540, 900, 1300); g.addColorStop(0, 'rgba(255,255,255,' + white.toFixed(3) + ')'); g.addColorStop(1, 'rgba(236,250,247,' + white.toFixed(3) + ')'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
      dom(t);
    }

    // ---- the words (DOM: crisp), few and large
    const FONT = "'Inter Variable',system-ui,sans-serif";
    const txt = (css, html) => { const d = h('div', 'tx', html, ov); d.style.cssText += ';' + css; return d; };
    const vis = (e, o) => { e.style.opacity = clamp(o).toFixed(3); e.style.visibility = o < 0.004 ? 'hidden' : ''; };
    const wsp = (s) => s.split(' ').map((w) => '<span style="display:inline-block">' + esc(w) + '</span>').join(' ');
    const l0 = txt('left:160px;width:760px;top:300px;text-align:center;font:600 84px/1.08 ' + FONT + ';letter-spacing:-.035em;color:' + INK + ';white-space:nowrap', wsp(p.line));
    const l0w = [...l0.querySelectorAll('span')];
    const tagCss = 'padding:12px 20px 11px;border-radius:999px;background:rgba(255,255,255,.92);box-shadow:0 10px 26px -14px rgba(4,40,36,.45);font:800 25px/1 ' + FONT + ';letter-spacing:.24em;text-indent:.24em;white-space:nowrap';
    const tagB = txt(tagCss + ';color:' + INK + ';left:0;top:0', 'ÎNAINTE');
    const tagA = txt(tagCss + ';color:' + DEEP + ';left:0;top:0', 'DUPĂ');
    // under the light: the kicker and the true session count
    const cnt = txt('left:160px;width:760px;top:1150px;text-align:center', '<div style="display:inline-block;padding:30px 54px 36px;border-radius:44px;background:rgba(255,255,255,.88);box-shadow:0 30px 60px -30px rgba(4,40,36,.45)">'
      + '<div style="font:800 28px/1 ' + FONT + ';letter-spacing:.26em;text-indent:.26em;color:' + TEAL + '">' + esc(p.kicker.toUpperCase()) + '</div>'
      + '<div style="margin-top:14px;font:800 150px/1 ' + FONT + ';letter-spacing:-.05em;color:' + INK + ';white-space:nowrap"><span style="background:linear-gradient(160deg,#eab5a5,#cf8f7d 55%,#b06f5e);-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.04em">' + esc(p.count[0]) + '</span> ' + esc(p.count[1]) + '</div></div>');
    // the end: the catalog's words under the two prints
    const t1 = txt('left:160px;width:760px;top:1120px;text-align:center;font:800 64px/1.05 ' + FONT + ';letter-spacing:-.035em;color:' + INK + ';white-space:nowrap', esc(p.title));
    const t2 = txt('left:160px;width:760px;top:1200px;text-align:center;font:600 46px/1.1 ' + FONT + ';letter-spacing:-.02em;color:rgba(11,11,13,.72);white-space:nowrap', esc(p.meta));
    const t3 = txt('left:160px;width:760px;top:1372px;text-align:center;font:500 31px/1.36 ' + FONT + ';letter-spacing:-.008em;color:#55625f;text-wrap:balance', esc(p.consent));
    const place = (e, x, y) => { e.style.left = x.toFixed(1) + 'px'; e.style.top = y.toFixed(1) + 'px'; };
    function dom(t) {
      // the opening line, word by word on the singer's attacks; gone with the pull back
      l0w.forEach((s, i) => { const q = smooth((t - HT.w[i]) / 0.4); s.style.opacity = q.toFixed(3); s.style.filter = q < 0.99 ? 'blur(' + ((1 - q) * 12).toFixed(1) + 'px)' : ''; s.style.transform = 'translateY(' + ((1 - out3(q)) * 18).toFixed(1) + 'px)'; });
      const lo = 1 - smooth((t - tPull + 0.05) / 0.22); vis(l0, lo); l0.style.transform = 'scale(' + (1 + 0.02 * clamp(t / tPull) - 0.2 * (1 - lo)).toFixed(4) + ')';
      // the tags ride on the prints' corners
      if (t >= tTag && t < tCrane + 0.2) { const C = cam(t), b = proj(C, -CW / 2, -CH / 2, 0); const q = smooth((t - tTag) / 0.18) * (1 - smooth((t - tCrane) / 0.2)); vis(tagB, q); place(tagB, Math.max(72, b.x + 22), Math.max(236, b.y + 22)); tagB.style.transform = 'scale(' + (0.86 + 0.14 * out5((t - tTag) / 0.25)).toFixed(3) + ')'; }
      else if (t >= tSide + 0.55) { const B = beforeBack(t), bh = B.w * SB[3] / SB[2]; vis(tagB, smooth((t - tSide - 0.55) / 0.2)); place(tagB, B.cx - B.w / 2 + 16, B.cy - bh / 2 + 16); tagB.style.transform = ''; }
      else vis(tagB, 0);
      if (t >= tRise + 0.6) { const A = afterRect(t), ah = A.w * SA[3] / SA[2]; vis(tagA, smooth((t - tRise - 0.6) / 0.2)); place(tagA, A.cx - A.w / 2 + 16, A.cy - ah / 2 + 16); tagA.style.transform = 'scale(' + (0.86 + 0.14 * out5((t - tRise - 0.6) / 0.25)).toFixed(3) + ')'; }
      else vis(tagA, 0);
      // the count, in the light; it leaves as the camera rises
      const cq = smooth((t - tDrop - 0.02) / 0.16) * (1 - smooth((t - tRise) / 0.25)); vis(cnt, cq);
      cnt.style.transform = 'translateY(' + ((1 - out5((t - tDrop) / 0.4)) * 30 + smooth((t - tRise) / 0.25) * 60).toFixed(1) + 'px) scale(' + (1.12 - 0.12 * out5((t - tDrop) / 0.45)).toFixed(4) + ')';
      cnt.style.filter = t < tDrop + 0.2 ? 'blur(' + ((1 - smooth((t - tDrop) / 0.2)) * 10).toFixed(1) + 'px)' : '';
      // the catalog's words
      [[t1, 0.42], [t2, 0.52], [t3, 0.7]].forEach(([e, d]) => { const q = smooth((t - tSide - d) / 0.3); vis(e, q); e.style.transform = 'translateY(' + ((1 - out3(q)) * 16).toFixed(1) + 'px)'; });
    }
    ctx.tick((t) => draw(t));
    ctx.shot.after = () => draw(R.t || 0);

    // ---- sound and events, to the frame. Each move: a whoosh peaking on its start and the deepest hit of the bar
    const ev = (t, kind) => R.event(t, kind);
    ctx.sfx(0, 'pulse', 0.35); ev(0, 'breath');
    HT.w.forEach((tw, i) => { ctx.sfx(fr(tw), 'tick_soft', 0.5); ev(fr(tw), i ? 'word' : 'write'); });
    ev(1.4, 'glow'); ev(2.3, 'glow');
    ctx.sfx(tPull, 'whoosh_cut', 0.7, { prio: 4, peak: true }); ctx.sfx(tPull, 'hit_deep', 0.7, { prio: 5 }); ev(tPull, 'cut'); ev(tPull, 'stop');
    ctx.sfx(tTag, 'tap', 0.6); ev(tTag, 'pop');
    ctx.sfx(tDolly - 0.05, 'riser_soft', 0.5); ctx.sfx(tDolly, 'whoosh_through', 0.55, { prio: 4, peak: true }); ctx.sfx(tDolly, 'pulse', 0.5); ev(tDolly, 'cut'); ev(tDolly + 0.5, 'reveal');
    ctx.sfx(tCrane, 'whoosh_cut', 0.6, { prio: 4, peak: true }); ctx.sfx(tCrane, 'hit_deep', 0.5, { prio: 5 }); ev(tCrane, 'cut');
    ctx.sfx(tCrane + 0.66, 'tick_soft', 0.45); ctx.sfx(tCrane + 0.74, 'tick_soft', 0.4); ev(tCrane + 0.66, 'in');
    ctx.sfx(tBreath - 0.05, 'riser_soft', 0.4); ctx.sfx(tDrop - 0.02, 'suck_in', 0.6, { prio: 4, peak: true });
    ctx.sfx(tDrop, 'hit_deep', 1, { prio: 5 }); ctx.sfx(tDrop + 0.02, 'shimmer_soft', 0.85, { prio: 4 }); ev(tDrop, 'cut'); ev(tDrop, 'reveal');
    ctx.sfx(tDrop + 0.1, 'dot', 0.6); ev(tDrop + 0.1, 'slam');
    ctx.sfx(tRise, 'whoosh_cut', 0.6, { prio: 4, peak: true }); ctx.sfx(tRise, 'hit_deep', 0.45, { prio: 5 }); ev(tRise, 'cut'); ctx.sfx(tRise + 0.6, 'tap', 0.55); ev(tRise + 0.6, 'pop');
    ctx.sfx(tSide, 'whoosh_through', 0.6, { prio: 4, peak: true }); ev(tSide, 'cut'); ctx.sfx(tSide + 0.62, 'tap', 0.6); ev(tSide + 0.62, 'slide');
    ctx.sfx(tSide + 0.42, 'tick_soft', 0.4); ev(tSide + 0.42, 'in'); ctx.sfx(tSide + 0.7, 'tick_soft', 0.35);
    ctx.sfx(tColour, 'shimmer_soft', 0.7, { prio: 4 }); ctx.sfx(tColour, 'dot', 0.55); ev(tColour, 'reveal');
    ev(tStop, 'breath'); ctx.sfx(tBack, 'shimmer_soft', 0.35); ev(tBack, 'glow');
    ctx.focus(t1);
    R.cazcam = { cam, HT, afterRect };
  };
})();
