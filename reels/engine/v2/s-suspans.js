// Centrul360 reels v2: the suspense piece (formats vi + x, 15.11), no voice: „O ședință de HIFU. Apoi, liniște.”
// A white frame, small centred text and one object: a giant glass hourglass cropped by the frame, with turquoise sand.
//   1. two small lines in the middle of the white; the full stop of the first one is the session: one turquoise pulse
//   2. the hourglass comes out of the white in the song's own silence; single grains fall and each one lands on a beat
//      (its tick is on the frame it lands); a week counter on top; the grains come faster, then a stream; the upper
//      bulb runs empty exactly when the song goes quiet again
//   3. the silence: one last grain (rose gold, the only one) falls slowly; the frame it lands is the song's hit
//   4. the drop: the real before photo, then time itself goes over it, a curtain of falling sand that leaves the after
//      photo behind it (the motion of this reel only); then both, side by side, with the catalog's own words
//   5. the last line; its full stop is the rose gold grain, which falls and lands on the last hit
// Everything is a pure function of the time: the grains are scheduled from the frame they land on, back to the neck.
// Real things only: the photo is one catalog case (script "case"), cropped into its two halves and never retouched;
// the words on screen are the site's (riduri-linii-fine, gusa-barbie-dubla) and the catalog's.
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, E, h, esc } = R;
  const INK = '#0b0b0d', TEAL = '#14a596', ROSE = '#cf8f7d', BG = '#fbfcfb';
  const io = (p) => E.inout(clamp(p)), out = (p) => 1 - Math.pow(1 - clamp(p), 3), lerp = (a, b, p) => a + (b - a) * p;
  const hash = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7 + 17.13) * 43758.5453; return x - Math.floor(x); };
  // ---- the hourglass in its own px: the neck at (0, 0), the lower bulb down to HB, the upper one mirrored
  const HB = 900, WMAX = 700, WN = 16, TAN = 0.52, G = 4200, HAM = 232, Y0 = 232;
  const fOf = (s) => (s <= 0.62 ? Math.pow(Math.sin(Math.PI * s / 1.24), 1.35) : Math.sqrt(Math.max(0, 1 - Math.pow((s - 0.62) / 0.38, 2.4))));
  const wOf = (y) => { const s = clamp(Math.abs(y) / HB); return s <= 0.62 ? WN + (WMAX - WN) * fOf(s) : WMAX * fOf(s); };
  const floorY = (x) => HB * (0.62 + 0.38 * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(x) / WMAX), 2)), 1 / 2.4));
  const bodyPath = (c) => { c.beginPath(); for (let i = -100; i <= 100; i++) { const y = i / 100 * HB; c.lineTo(wOf(y), y); } for (let i = 100; i >= -100; i--) { const y = i / 100 * HB; c.lineTo(-wOf(y), y); } c.closePath(); };
  const PAL = ['#14a596', '#2ab5a5', '#0f8c7f', '#4cc7b8', '#12998b', '#1aa898'];

  V.suspans = (ctx, p) => {
    const lay = ctx.layer(0), bt = R.beatPer || 60 / 131.01, tH = p.hit != null ? p.hit : 329 / 30, B = (k) => tH + (k - 24) * bt, fr = (t) => Math.round(t * 30) / 30;
    const total = p.total || 18.2;
    const root = h('div', null, null, lay); root.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px;overflow:hidden;background:' + BG;
    const cv = h('canvas', null, null, root); cv.width = 1080; cv.height = 1920; cv.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    const c = cv.getContext('2d');
    const img = h('img', null, null, root); img.src = R.ROOT + '/' + (p.img || 'brand_asset/catalog/cazul-36-hifu-gusa-contur-arad.webp'); img.decoding = 'sync'; img.style.cssText = 'position:absolute;left:0;top:0;width:2px;height:2px;opacity:0';
    const SB = p.before || [6, 6, 682, 933], SA = p.after || [711, 6, 682, 933]; // the two halves of the catalog picture (source px)
    // ---- the moments (seconds), counted back from the hit; the beats are the song's
    const t1 = 0, tPulse = fr(B(3)), t2 = fr(B(5)), tGlass = fr(B(5)) + 0.48, weeks = [8, 10.5, 13, 14.5, 16, 17.5, 19, 20], tW = weeks.map((k) => fr(B(k))), tLine = fr(B(14.5)),
      tCut = B(21), tOutText = B(21.45), tRose = B(21.3), tWipe0 = fr(B(25.5)), tWipe1 = fr(B(26.5)), tSide0 = B(28.05), tSide1 = fr(B(29)), tGlint = B(31.2), tLast = fr(B(34)), tEnd0 = tLast - 0.2, tDot = fr(B(35));
    // ---- text (DOM): small, centred
    const FONT = "'Inter Variable',sans-serif";
    const txt = (top, css, html) => { const e = h('div', null, html, root); e.style.cssText = 'position:absolute;left:0;width:1080px;top:' + top + 'px;text-align:center;white-space:nowrap;color:' + INK + ';opacity:0;' + css; return e; };
    const l1 = txt(868, 'font:600 58px/1.1 ' + FONT + ';letter-spacing:-.025em', 'O ședință de HIFU<span class="pd" style="position:relative;display:inline-block;width:.17em;height:.17em;border-radius:50%;background:' + TEAL + ';margin-left:.045em"></span>');
    const ring = h('i', null, null, l1.querySelector('.pd')); ring.style.cssText = 'position:absolute;left:50%;top:50%;border-radius:50%;border:3px solid ' + TEAL + ';box-sizing:border-box;opacity:0';
    const l2 = txt(868, 'font:600 58px/1.1 ' + FONT + ';letter-spacing:-.025em', 'Apoi, liniște.');
    const wk = txt(206, 'font:600 58px/1.1 ' + FONT + ';letter-spacing:-.025em', 'Săptămâna <b style="display:inline-block;min-width:.62em;text-align:left;font-weight:800;color:' + TEAL + '"></b>'), wkN = wk.querySelector('b');
    const ln = txt(292, 'font:500 37px/1.2 ' + FONT + ';letter-spacing:-.012em;color:rgba(11,11,13,.62)', 'Sub piele se formează colagen nou.');
    const lab = txt(258, 'font:800 34px/1 ' + FONT + ';letter-spacing:.27em;text-indent:.27em', '');
    const labL = txt(414, 'left:42px;width:488px;font:800 25px/1 ' + FONT + ';letter-spacing:.27em;text-indent:.27em', 'ÎNAINTE');
    const labR = txt(414, 'left:550px;width:488px;font:800 25px/1 ' + FONT + ';letter-spacing:.27em;text-indent:.27em;color:' + TEAL, 'DUPĂ');
    const cs = p.caseNo || 'Cazul 36', cTitle = p.caseTitle || 'HIFU gușă și contur', cSub = p.caseSub || 'Arad · 1 ședință', cFine = p.caseFine || ['Fotografie publicată cu acordul clientei.', 'Rezultatele pot varia de la o persoană la alta.'];
    const cap0 = txt(1196, 'font:700 24px/1 ' + FONT + ';letter-spacing:.26em;text-indent:.26em;color:' + TEAL, esc(cs.toUpperCase()));
    const cap1 = txt(1238, 'font:800 64px/1.05 ' + FONT + ';letter-spacing:-.035em', esc(cTitle));
    const cap2 = txt(1322, 'font:600 40px/1.1 ' + FONT + ';letter-spacing:-.015em;color:rgba(11,11,13,.66)', esc(cSub));
    const cap3 = txt(1402, 'font:500 27px/1.42 ' + FONT + ';color:rgba(11,11,13,.5)', cFine.map(esc).join('<br>'));
    const lastW = h('div', null, null, root); lastW.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px;transform-origin:540px 900px;opacity:0';
    const last = h('div', null, 'Colagenul are nevoie de timp<span class="pd" style="display:inline-block;width:.19em;height:.19em;border-radius:50%;background:radial-gradient(circle at 36% 34%,#f4cbbd,' + ROSE + ' 58%,#b77665);margin-left:.05em;visibility:hidden"></span>', lastW);
    last.style.cssText = 'position:absolute;left:0;width:1080px;top:866px;text-align:center;white-space:nowrap;font:600 56px/1.1 ' + FONT + ';letter-spacing:-.025em;color:' + INK;
    const lastDot = last.querySelector('.pd');
    const ring2 = h('i', null, null, root); ring2.style.cssText = 'position:absolute;border-radius:50%;border:2.5px solid ' + ROSE + ';box-sizing:border-box;opacity:0';
    // ---- the sand: a tile of many small grains (it fills the two masses), and every grain that falls, by its landing
    const tile = document.createElement('canvas'); tile.width = tile.height = 256;
    { const q = tile.getContext('2d'); q.fillStyle = '#129689'; q.fillRect(0, 0, 256, 256);
      const cols = ['#14a596', '#0f8c7f', '#1fb3a3', '#0b7a6e', '#39c2b3', '#16a092', '#79dccf', '#0d8377'];
      for (let i = 0; i < 4800; i++) { const x = hash(i, 1) * 256, y = hash(i, 2) * 256, r = 1.5 + hash(i, 3) * 2.3; q.fillStyle = cols[Math.floor(hash(i, 4) * cols.length)]; q.globalAlpha = 0.75 + 0.25 * hash(i, 5);
        for (const dx of [-256, 0, 256]) for (const dy of [-256, 0, 256]) { if (x + dx < -4 || x + dx > 260 || y + dy < -4 || y + dy > 260) continue; q.beginPath(); q.arc(x + dx, y + dy, r, 0, 6.2832); q.fill(); } } }
    const pat = c.createPattern(tile, 'repeat');
    const GR = [];
    const singles = [8, 9.5, 10.5, 11.5, 12.25, 13, 13.5, 14, 14.5, 14.83, 15.17, 15.5, 15.75, 16, 16.25, 16.5, 16.75, 17, 17.25, 17.5];
    for (let k = 17.5 + 1 / 6; k < 18.95; k += 1 / 6) singles.push(k); singles.push(19);
    singles.forEach((k, i) => GR.push({ tl: fr(B(k)), single: true, r: 7.6 + hash(i, 1) * 2 }));
    const nSingle = GR.length;
    const rate = (t) => { const a = B(19), b1 = B(20.2), e0 = tCut - 0.05, e1 = tCut + 0.26; return t < a ? 0 : t < b1 ? 40 + 390 * (t - a) / (b1 - a) : t < e0 ? 430 : t < e1 ? 430 * Math.pow(1 - (t - e0) / (e1 - e0), 1.6) : 0; };
    { let acc = 0; for (let t = B(19); t < tCut + 0.26; t += 1 / 1800) { acc += rate(t) / 1800; if (acc >= 1) { acc -= 1; GR.push({ tl: t, r: 2.7 + hash(GR.length, 1) * 2.1 }); } } }
    const nStream = GR.length - nSingle;
    const tails = [tCut + 0.34, tCut + 0.47, tCut + 0.66].map(fr); tails.forEach((t) => GR.push({ tl: t, single: true, tail: true, r: 7.4 }));
    const fracAt = (t) => { let s = 0, st = 0; for (const g of GR) { const q = clamp((t - g.tl) / 0.16); if (q > 0) { if (g.single) s += q; else st += q; } } return Math.min(1, 0.06 * s / nSingle + 0.94 * st / nStream); };
    const hA = (t) => HAM * Math.sqrt(fracAt(t));
    const surf = (x, ha) => Math.min(floorY(x), HB - ha + (Math.sqrt(x * x + 196) - 14) * TAN + 2 * Math.sin(x * 0.07) + 1.5 * Math.sin(x * 0.19 + 1));
    const edgeOf = (ha) => { let x = 0; while (x < WMAX && HB - ha + (Math.sqrt(x * x + 196) - 14) * TAN < floorY(x) - 0.5) x += 4; return x; };
    { const colH = {}; let ns = 0; // where each grain leaves the neck, lands and comes to rest
      GR.forEach((g, i) => {
        const ha = hA(g.tl - 0.001); g.x0 = (hash(i, 6) - 0.5) * 2 * (g.single ? 3 : 7); g.vx = (hash(i, 7) - 0.5) * 2 * (g.single ? 9 : 26);
        let D = Math.sqrt(2 * (HB - ha - g.r) / G); g.xl = g.x0 + g.vx * D; g.yl = surf(g.xl, ha) - g.r * 0.8; D = Math.sqrt(2 * g.yl / G); g.D = D; g.tr = g.tl - D;
        g.tb = 0.24 + hash(i, 8) * 0.1; g.hop = g.single ? 14 + hash(i, 9) * 16 : 6 + hash(i, 9) * 12; g.col = PAL[Math.floor(hash(i, 10) * PAL.length)];
        if (g.single && !g.tail) { const c0 = Math.round((hash(i, 11) - 0.5) * 2 * (1.5 + ns * 0.5)); let cc = c0; for (const k of [c0 - 1, c0 + 1]) if ((colH[k] || 0) < (colH[cc] || 0)) cc = k; const lv = colH[cc] || 0; colH[cc] = lv + 1; g.rx = cc * 13.2 + (hash(i, 12) - 0.5) * 3; g.lv = lv; ns++; }
        else g.u = (hash(i, 13) - 0.5) * 2 * (g.tail ? 0.12 : 0.94);
      }); }
    // ---- the glass: drawn once (walls with their thickness, the light on them), then placed by the camera
    const GS = 1.3, XM = 760, YM = 1100, glass = document.createElement('canvas'); glass.width = Math.round(2 * XM * GS); glass.height = Math.round(2 * YM * GS);
    const shade = document.createElement('canvas'); shade.width = Math.round(XM * GS); shade.height = Math.round(YM * GS);
    { const q = glass.getContext('2d'); q.setTransform(GS, 0, 0, GS, XM * GS, YM * GS);
      const gr = q.createLinearGradient(-WMAX, 0, WMAX, 0); gr.addColorStop(0, 'rgba(206,220,218,.20)'); gr.addColorStop(0.45, 'rgba(240,246,245,.05)'); gr.addColorStop(1, 'rgba(160,178,175,.17)');
      bodyPath(q); q.fillStyle = gr; q.fill();
      q.save(); bodyPath(q); q.clip();
      q.filter = 'blur(26px)'; q.strokeStyle = 'rgba(36,58,55,.2)'; q.lineWidth = 96; bodyPath(q); q.stroke();           // the wall gets darker toward its edge
      q.filter = 'blur(1.2px)'; q.strokeStyle = 'rgba(255,255,255,.92)'; q.lineWidth = 15; bodyPath(q); q.stroke();        // the inner edge of the thick wall
      q.filter = 'blur(3px)'; q.strokeStyle = 'rgba(20,40,38,.16)'; q.lineWidth = 34; bodyPath(q); q.stroke();
      const band = (sgn, k, off, s0, s1, lw, a, bl) => { q.filter = 'blur(' + bl + 'px)'; q.strokeStyle = 'rgba(255,255,255,' + a + ')'; q.lineWidth = lw; q.lineCap = 'round'; q.beginPath(); for (let s = s0; s <= s1; s += 0.01) { const y = sgn * s * HB; q.lineTo(k * wOf(y) + off, y); } q.stroke(); };
      for (const sgn of [-1, 1]) { band(sgn, -0.82, 6, 0.05, 0.56, 26, 0.5, 9); band(sgn, -0.88, 4, 0.1, 0.4, 7, 0.95, 1.6); band(sgn, 0.9, -4, 0.12, 0.5, 12, 0.3, 6); band(sgn, -0.66, 0, 0.7, 0.93, 20, 0.4, 8); }
      q.restore(); q.filter = 'none';
      q.strokeStyle = 'rgba(22,36,34,.5)'; q.lineWidth = 2.4; bodyPath(q); q.stroke();
      q.strokeStyle = 'rgba(22,36,34,.32)'; q.lineWidth = 1.6; q.beginPath(); q.ellipse(0, 0, WN + 7, 5, 0, 0, 6.2832); q.stroke();                    // the collar of the neck
      q.fillStyle = 'rgba(255,255,255,.95)'; q.beginPath(); q.ellipse(-WN - 1, -6, 3.2, 7, -0.3, 0, 6.2832); q.fill();
      const s = shade.getContext('2d'); s.setTransform(GS / 2, 0, 0, GS / 2, XM * GS / 2, YM * GS / 2); s.filter = 'blur(26px)'; s.fillStyle = 'rgba(10,24,22,1)'; bodyPath(s); s.fill(); }
    const camAt = (t) => { const q = clamp((t - tGlass) / (tCut - tGlass)), g = io((t - B(21.25)) / (tH - B(21.25))), S0 = 1.0 + 0.05 * q, fy0 = 285 - 8 * q;
      return { S: lerp(S0, 1.42, g), fy: lerp(fy0, HB - hA(t) - 135, g), sy: lerp(900, 960, g) }; };
    // ---- sound: every visible grain has its tick, on the frame it lands; the silence is left alone; then the hit
    const ev = (t, k) => R.event(t, k || 'panel');
    ctx.sfx(t1, 'tick_soft', 0.6); ev(t1, 'write');
    ctx.sfx(tPulse, 'pulse', 0.7, { prio: 3 }); ev(tPulse);
    ctx.sfx(t2, 'tick_soft', 0.7); ev(t2, 'write');
    ctx.sfx(tGlass + 0.1, 'shimmer_soft', 0.4); ev(tGlass + 0.1, 'in');
    GR.forEach((g, i) => { if (g.single) ctx.sfx(g.tl, 'grain', g.tail ? 0.7 : i < 9 ? 1 : i < 20 ? 0.85 : 0.65, { pan: clamp(g.xl / 200, -0.3, 0.3) }); });
    tW.forEach((t) => ev(t)); ctx.sfx(tW[7], 'tick_soft', 0.7); // (week 8 comes inside the stream: its own tick)
    ctx.sfx(fr(B(17.5)) + 0.085, 'sand_flow', 0.9, { prio: 3 }); // (a little after the grain of that beat, so both stay)
    ctx.sfx(tH, 'hit_deep', 1, { prio: 5 }); ev(tH); ev(tH, 'reveal');
    ctx.sfx(tWipe1, 'whoosh_cut', 0.8, { prio: 4, peak: true }); ctx.sfx(tWipe1 + 0.09, 'shimmer_soft', 0.5, { prio: 2 }); ev(tWipe1);
    ctx.sfx(tSide0, 'card_flip', 0.7); ctx.sfx(tSide1, 'tap', 0.8, { prio: 3 }); ev(tSide1);
    const tCap = [tSide1 + 0.1, tSide1 + 0.24, tSide1 + 0.44]; tCap.forEach((t) => { ctx.sfx(t, 'tick_soft', 0.5); ev(t, 'word'); });
    ctx.sfx(tLast, 'whoosh_cut', 0.5, { prio: 3, peak: true }); ev(tLast);
    ctx.sfx(tDot, 'grain', 1.2); ctx.sfx(tDot + 0.09, 'shimmer_soft', 0.45, { prio: 2 }); ev(tDot);
    ctx.focus(root);
    // ---- drawing
    const grainAt = (x, y, r, col, len) => { // one grain; a falling one stretches along its fall
      if (len > r * 0.7) { c.strokeStyle = col; c.lineCap = 'round'; c.lineWidth = r * 1.86; c.beginPath(); c.moveTo(x, y - len); c.lineTo(x, y); c.stroke(); }
      else { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.32, r * 0.36, 0, 6.2832); c.fill();
    };
    const roseAt = (x, y, r) => { const g = c.createRadialGradient(x - r * 0.3, y - r * 0.34, r * 0.1, x, y, r); g.addColorStop(0, '#f4cbbd'); g.addColorStop(0.58, ROSE); g.addColorStop(1, '#b77665'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); };
    const sandFill = (path, x0, y0, x1, y1) => { // a mass of sand: the grains, the light from the top left, the glass bending the light at its walls
      c.save(); path(); c.clip(); c.fillStyle = pat; c.fillRect(x0 - 20, y0 - 20, x1 - x0 + 40, y1 - y0 + 40);
      const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(255,255,255,.24)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,44,40,.3)'); c.fillStyle = g; c.fillRect(x0 - 20, y0 - 20, x1 - x0 + 40, y1 - y0 + 40);
      c.filter = 'blur(7px)'; c.strokeStyle = 'rgba(205,255,247,.55)'; c.lineWidth = 30; bodyPath(c); c.stroke();
      c.filter = 'blur(2px)'; c.strokeStyle = 'rgba(0,60,54,.35)'; c.lineWidth = 7; bodyPath(c); c.stroke(); c.filter = 'none'; c.restore();
    };
    const hourglass = (t) => {
      const qG = io((t - tGlass) / 0.6); if (qG <= 0) return;
      const cam = camAt(t), S = cam.S, F = fracAt(t), ha = HAM * Math.sqrt(F);
      c.save(); c.globalAlpha = qG; c.setTransform(S, 0, 0, S, 540, cam.sy - cam.fy * S);
      c.globalAlpha = 0.085 * qG; c.drawImage(shade, -XM + 46, -YM + 70, 2 * XM, 2 * YM); c.globalAlpha = qG;           // its soft shadow on the white, down to the right
      const glow = (x, y, r, a) => { if (a < 0.004) return; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(60,205,188,' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(60,205,188,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r); };
      glow(80, HB + 30, 520, 0.2 * Math.sqrt(F)); glow(70, -90, 380, 0.14 * (1 - F));                                   // turquoise light thrown through the sand
      // the upper sand: it sinks as the lower one grows, with a funnel in the middle while it flows
      const yTop = Y0 * Math.pow(1 - F, 0.55);
      if (yTop > 4) { const dip = Math.min(yTop - 2, 10 + 52 * clamp(rate(t + 0.45) / 430) + (t > tW[0] - 0.7 && t < tCut ? 8 : 0)), xw = wOf(yTop), su = (x) => -yTop + dip * Math.exp(-Math.pow(x / (60 + xw * 0.3), 2)) + 1.5 * Math.sin(x * 0.11);
        const path = () => { c.beginPath(); for (let x = -xw; x <= xw; x += 6) c.lineTo(x, su(x)); c.lineTo(xw, su(xw)); for (let y = -yTop; y <= 0; y += 6) c.lineTo(wOf(y), y); c.lineTo(WN, 0); c.lineTo(-WN, 0); for (let y = 0; y >= -yTop; y -= 6) c.lineTo(-wOf(y), y); c.closePath(); };
        sandFill(path, -xw, -yTop, xw, 0);
        c.strokeStyle = 'rgba(214,255,248,.75)'; c.lineWidth = 2.6; c.beginPath(); for (let x = -xw + 8; x <= xw - 8; x += 6) c.lineTo(x, su(x) + 1); c.stroke(); }
      // the lower sand
      const xe = edgeOf(ha);
      if (ha > 7) { const path = () => { c.beginPath(); for (let x = -xe; x <= xe; x += 5) c.lineTo(x, surf(x, ha)); for (let x = xe; x >= -xe; x -= 8) c.lineTo(x, floorY(x) + 1); c.closePath(); };
        sandFill(path, -xe, HB - ha, xe, HB);
        c.strokeStyle = 'rgba(214,255,248,.7)'; c.lineWidth = 2.6; c.beginPath(); for (let x = -xe + 6; x <= xe - 6; x += 5) c.lineTo(x, surf(x, ha) + 1); c.stroke(); }
      { let n = 0, y0 = 1e9, y1 = 0; for (const g of GR) if (!g.single && t >= g.tr && t < g.tl) { const y = 0.5 * G * (t - g.tr) * (t - g.tr); n++; if (y < y0) y0 = y; if (y > y1) y1 = y; } // the stream reads as one thread: a soft core under its grains
        if (n > 14) { c.save(); c.filter = 'blur(2.2px)'; c.strokeStyle = 'rgba(20,165,150,' + Math.min(0.5, n / 380).toFixed(3) + ')'; c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, y0); c.lineTo(0, y1); c.stroke(); c.restore(); } }
      // the grains: at rest on the heap, hopping after they land, falling
      for (let i = 0; i < GR.length; i++) { const g = GR[i]; if (t < g.tr) continue;
        if (t < g.tl) { const tau = t - g.tr, vy = G * tau; grainAt(g.x0 + g.vx * tau, 0.5 * G * tau * tau, g.r, g.col, Math.min(vy * (g.single ? 1 / 260 : 1 / 200), 15)); continue; }
        let rx, ry; if (g.rx != null) { rx = g.rx; ry = Math.min(floorY(rx) - g.r - g.lv * g.r * 1.72, surf(rx, ha) - g.r * 0.35); } else { rx = g.u * xe; ry = surf(rx, ha) - g.r * 0.35; }
        const q = clamp((t - g.tl) / g.tb);
        if (q < 1) grainAt(lerp(g.xl, rx, q), lerp(g.yl, ry, q) - g.hop * 4 * q * (1 - q), g.r, g.col, 0); else grainAt(rx, ry, g.r, g.col, 0);
      }
      if (t >= tRose) { const D = tH - tRose, yl = HB - HAM - 10; roseAt(0, yl * Math.pow(clamp((t - tRose) / D), 1.75), 10); }                      // the last one, slowly
      c.drawImage(glass, -XM, -YM, 2 * XM, 2 * YM);
      c.restore();
    };
    const rr = (x, y, w, hh, r) => { c.beginPath(); c.roundRect(x, y, w, hh, r); };
    const card = (src, x, y, w, hh, r, front) => {
      c.save(); c.shadowColor = 'rgba(8,22,20,.24)'; c.shadowBlur = 70; c.shadowOffsetY = 32; c.fillStyle = '#fff'; rr(x, y, w, hh, r); c.fill(); c.restore();
      c.save(); rr(x, y, w, hh, r); c.clip(); if (front) front(); c.drawImage(img, src[0], src[1], src[2], src[3], x, y, w, hh); c.restore();
    };
    const R1 = { x: 90, y: 352, w: 900, h: 900 * SB[3] / SB[2], r: 46 }, RL = { x: 42, y: 470, w: 488, h: 488 * SB[3] / SB[2], r: 30 }, RR = { x: 550, y: 470, w: 488, h: 488 * SA[3] / SA[2], r: 30 };
    const mixR = (a, b, q) => ({ x: lerp(a.x, b.x, q), y: lerp(a.y, b.y, q), w: lerp(a.w, b.w, q), h: lerp(a.h, b.h, q), r: lerp(a.r, b.r, q) });
    const NW = 2100, WG = []; // the grains of the curtain: most ride the front as a thick band (they hide its edge), some fall behind it and fade
    const nf = (x) => 26 * Math.sin(x * 0.011 + 1.3) + 14 * Math.sin(x * 0.037 + 0.4) + 8 * Math.sin(x * 0.093);
    const frontY = (x, q) => R1.y - 130 + (R1.h + 300) * Math.pow(q, 1.3) + nf(x);
    for (let j = 0; j < NW; j++) { const ride = hash(j, 20) < 0.72, g = (hash(j, 28) + hash(j, 29) + hash(j, 30)) / 1.5 - 1; // (about a bell curve, -1..1)
      WG.push({ ride, x: R1.x + hash(j, 21) * R1.w, q0: hash(j, 22), o: g * 84 - 8, win: 0.1 + 0.1 * hash(j, 27), r: 2.6 + hash(j, 24) * 3.4, col: PAL[Math.floor(hash(j, 25) * PAL.length)], vx: (hash(j, 26) - 0.5) * 110, v: 300 + 900 * hash(j, 23) }); }
    const reveal = (t) => {
      const qe = clamp((t - tEnd0) / 0.2); if (qe >= 1) return; c.save(); c.globalAlpha = 1 - qe;
      const punch = 1 + 0.06 * (1 - out((t - tH) / 0.55)) + 0.012 * clamp((t - tH) / 5), qs = io((t - tSide0) / (tSide1 - tSide0)), qw = clamp((t - tWipe0) / (tWipe1 - tWipe0));
      const ra = mixR(R1, RR, qs);
      c.translate(540, 968); c.scale(punch, punch); c.translate(-540, -968);
      if (qs > 0) { const rb = mixR({ x: -560, y: RL.y + 40, w: RL.w, h: RL.h, r: RL.r }, RL, out((t - tSide0) / (tSide1 - tSide0))); card(SB, rb.x, rb.y, rb.w, rb.h, rb.r); }
      if (qw < 1) { // before, with the after coming down behind the front
        card(SB, R1.x, R1.y, R1.w, R1.h, R1.r);
        if (qw > 0) { c.save(); rr(R1.x, R1.y, R1.w, R1.h, R1.r); c.clip(); c.beginPath(); c.moveTo(R1.x - 2, R1.y - 2); c.lineTo(R1.x + R1.w + 2, R1.y - 2); for (let x = R1.x + R1.w + 2; x >= R1.x - 2; x -= 10) c.lineTo(x, frontY(x, qw)); c.closePath(); c.clip();
          c.drawImage(img, SA[0], SA[1], SA[2], SA[3], R1.x, R1.y, R1.w, R1.h); c.restore(); }
      } else card(SA, ra.x, ra.y, ra.w, ra.h, ra.r);
      if (t > tGlint && t < tGlint + 0.9 && qs >= 1) { const q = (t - tGlint) / 0.9; c.save(); c.beginPath(); c.roundRect(RL.x, RL.y, RL.w, RL.h, RL.r); c.roundRect(RR.x, RR.y, RR.w, RR.h, RR.r); c.clip(); const gx = -300 + 1700 * io(q), g = c.createLinearGradient(gx, 0, gx + 260, 90); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.34)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, RL.y, 1080, RL.h); c.restore(); }
      if (qw > 0 && qw < 1) { // the band of light sand on the front, then every grain
        const qa = Math.min(1, qw * 6, (1 - qw) * 6); c.save(); rr(R1.x, R1.y, R1.w, R1.h, R1.r); c.clip(); c.filter = 'blur(16px)'; c.strokeStyle = 'rgba(46,188,172,' + (0.5 * qa).toFixed(3) + ')'; c.lineWidth = 64; c.beginPath(); for (let x = R1.x - 40; x <= R1.x + R1.w + 40; x += 20) c.lineTo(x, frontY(x, qw) - 6); c.stroke(); c.restore();
        c.save(); c.beginPath(); c.roundRect(R1.x, R1.y, R1.w, 2400, R1.r); c.clip(); // the sand stays on the picture and falls off its lower edge
        const dq = 1 / ((tWipe1 - tWipe0) * 30), vf = (frontY(540, qw) - frontY(540, Math.max(0, qw - dq))) * 30; // the front's speed, px/s
        for (const g of WG) { const d = qw - g.q0;
          if (g.ride) { if (Math.abs(d) > g.win) continue; c.globalAlpha = (1 - qe) * (1 - Math.abs(d) / g.win); grainAt(g.x + g.vx * d, frontY(g.x, qw) + g.o + 150 * d, g.r, g.col, Math.min(vf / 260, 15)); }
          else { if (d < 0) continue; const tau = d * (tWipe1 - tWipe0), life = 0.34; if (tau > life) continue; c.globalAlpha = (1 - qe) * (1 - tau / life) * 0.9; const yq = frontY(g.x, g.q0); grainAt(g.x + g.vx * tau, yq - 40 + g.v * tau + 1700 * tau * tau, g.r, g.col, Math.min((g.v + 3400 * tau) / 240, 14)); } }
        c.restore();
      } else if (t >= tWipe1 && t < tWipe1 + 0.36) for (const g of WG) { if (g.ride) continue; const tau = (1 - g.q0) * (tWipe1 - tWipe0) + (t - tWipe1), life = 0.34; if (tau > life) continue; c.globalAlpha = (1 - qe) * (1 - tau / life) * 0.9; grainAt(g.x + g.vx * tau, frontY(g.x, g.q0) - 40 + g.v * tau + 1700 * tau * tau, g.r, g.col, Math.min((g.v + 3400 * tau) / 240, 14)); }
      c.restore();
    };
    let dot = null; // where the last full stop is (the rose gold grain lands on it)
    const measure = () => { const r = lastDot.getBoundingClientRect(), o = root.getBoundingClientRect(), k = 1080 / (o.width || 1080); if (!r.width) return null; return { x: (r.left + r.width / 2 - o.left) * k, y: (r.top + r.height / 2 - o.top) * k, r: r.width / 2 * k }; };
    const show = (e, a, y, sc) => { e.style.opacity = a <= 0.003 ? '0' : a.toFixed(3); e.style.display = a <= 0.003 ? 'none' : 'block'; if (y != null || sc != null) e.style.transform = 'translateY(' + (y || 0).toFixed(1) + 'px) scale(' + (sc == null ? 1 : sc).toFixed(4) + ')'; };
    ctx.tick((t) => {
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.filter = 'none'; c.clearRect(0, 0, 1080, 1920);
      { const g = c.createRadialGradient(400, 560, 100, 540, 960, 1300); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#eef1f0'); c.fillStyle = g; c.fillRect(0, 0, 1080, 1920); }
      // 1. the two lines
      const a1 = out((t - t1) / 0.4) * (1 - clamp((t - t2 + 0.1) / 0.1)); show(l1, a1, (1 - out((t - t1) / 0.5)) * 14);
      { const q = clamp((t - tPulse) / 0.95), d = 18 + 560 * out(q); ring.style.width = ring.style.height = d.toFixed(1) + 'px'; ring.style.margin = (-d / 2).toFixed(1) + 'px 0 0 ' + (-d / 2).toFixed(1) + 'px'; ring.style.borderWidth = (3.4 - 2.4 * q).toFixed(2) + 'px'; ring.style.opacity = t < tPulse || q >= 1 ? '0' : (0.85 * Math.pow(1 - q, 1.6)).toFixed(3);
        l1.querySelector('.pd').style.transform = 'scale(' + (1 + 0.9 * Math.max(0, 1 - Math.abs(t - tPulse - 0.04) / 0.14)).toFixed(3) + ')'; }
      const up = io((t - (t2 + 0.25)) / 0.45), a2 = clamp((t - t2) / 0.1) * (1 - clamp((t - tW[0] + 0.1) / 0.1)); show(l2, a2, lerp(0, 206 - 868, up), 1);
      // 2. the hourglass, the weeks
      if (t < tH) hourglass(t);
      let wn = 0; for (let i = 0; i < tW.length; i++) if (t >= tW[i]) wn = i + 1;
      const aOut = 1 - clamp((t - tOutText) / 0.3);
      if (wn) { wkN.textContent = String(wn); const q = out((t - tW[wn - 1]) / 0.22); wkN.style.transform = 'translateY(' + ((1 - q) * 20).toFixed(1) + 'px)'; wkN.style.opacity = (0.15 + 0.85 * q).toFixed(3); }
      show(wk, wn && t < tH ? aOut * clamp((t - tW[0]) / 0.1 + 0.4) : 0);
      show(ln, t < tH ? out((t - tLine) / 0.5) * aOut : 0, (1 - out((t - tLine) / 0.5)) * 10);
      // 4. the drop
      if (t >= tH) reveal(t);
      const qe = clamp((t - tEnd0) / 0.2), after = t >= tWipe1;
      if (lab._s !== after) { lab._s = after; lab.textContent = after ? 'DUPĂ' : 'ÎNAINTE'; lab.style.color = after ? TEAL : INK; }
      show(lab, t >= tH ? clamp((t - tH) / 0.12 + 0.3) * (1 - clamp((t - tSide0) / 0.16)) : 0, after ? (1 - out((t - tWipe1) / 0.3)) * -10 : 0);
      const aS = clamp((t - tSide1 + 0.14) / 0.14) * (1 - qe); show(labL, aS); show(labR, aS);
      [cap0, cap1].forEach((e) => show(e, out((t - tCap[0]) / 0.3) * (1 - qe), (1 - out((t - tCap[0]) / 0.35)) * 14));
      show(cap2, out((t - tCap[1]) / 0.3) * (1 - qe), (1 - out((t - tCap[1]) / 0.35)) * 14); show(cap3, out((t - tCap[2]) / 0.35) * (1 - qe), (1 - out((t - tCap[2]) / 0.4)) * 12);
      // 5. the last line; its full stop falls in
      const aL = out((t - tLast) / 0.32); lastW.style.opacity = aL.toFixed(3); lastW.style.display = aL > 0.003 ? 'block' : 'none';
      if (aL > 0.003) {
        lastW.style.transform = 'scale(' + (1 + 0.035 * clamp((t - tLast) / (total - tLast))).toFixed(4) + ')';
        const rest = t >= tDot + 0.34; lastDot.style.visibility = rest ? 'visible' : 'hidden';
        if (dot) { const q = clamp((t - tDot) / 0.8), d = 2 * dot.r + 190 * out(q); ring2.style.width = ring2.style.height = d.toFixed(1) + 'px'; ring2.style.left = (dot.x - d / 2).toFixed(1) + 'px'; ring2.style.top = (dot.y - d / 2).toFixed(1) + 'px'; ring2.style.opacity = t < tDot || q >= 1 ? '0' : (0.7 * Math.pow(1 - q, 1.5)).toFixed(3); }
        if (!rest) { dot = measure() || dot; if (dot) { const D = tDot - tLast - 0.02, tau = t - (tDot - D); if (tau > 0) { let y; if (t < tDot) y = lerp(-40, dot.y, Math.pow(tau / D, 2)); else { const q = t - tDot; y = dot.y - (q < 0.2 ? 15 * 4 * (q / 0.2) * (1 - q / 0.2) : 4 * 4 * ((q - 0.2) / 0.14) * (1 - (q - 0.2) / 0.14)); }
          if (t < tDot) { const vy = 2 * (dot.y + 40) * tau / (D * D); c.strokeStyle = 'rgba(207,143,125,.55)'; c.lineCap = 'round'; c.lineWidth = dot.r * 1.7; c.beginPath(); c.moveTo(dot.x, y - Math.min(vy / 90, 30)); c.lineTo(dot.x, y); c.stroke(); }
          roseAt(dot.x, y, dot.r); } } }
      }
    });
  };
})();
