// Centrul360 reels v2: „40 de cazuri. Toate reale.” (15.11), a results montage cut on the bass of WE ON GO II
// („Here we go”, after the honorable part). No voice, hard cuts and energy, the opposite of the manifest's one long
// camera move:
//   1. calm, two beats: the catalog's own headline on white, over a case seen through frosted glass
//   2. BOOM on the first big bass hit: the glass clears with a punch-in, and from there one real case on every hit,
//      each with its own cut (punch-in, whip, split slide, speed ramp, zoom-out, vertical whip)
//   3. the long gap before the song's biggest hit is a speed ramp into light: the flash, and the strongest case under it
//   4. the triple hit: three cases as three strips that slam in one after the other (split screen)
//   5. the last hit: a clean white end, the real Google score, then the logo, black on white, and the two cities
// Every case is the catalog's picture, cut into its two halves (never retouched, never generated, both halves at the
// same scale and the same framing), with the catalog's own words: treatment, city, sessions.
//   visual: { type: "montaj", hits: {beat: reel second}, h1: [a, b], cases: [{img, title, meta, focus:[x,y], zoom}],
//             trio: [i, j, k] (indices into cases), google: {score, reviews}, cities: [a, b], consent }
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, E, h, esc } = R;
  const W = 1080, H = 1920, INK = '#0b0b0d', TEAL = '#14a596', DEEP = '#0b7f74', BG = '#fbfcfb';
  const smooth = (p) => { p = clamp(p); return p * p * (3 - 2 * p); };
  const out5 = (p) => 1 - Math.pow(1 - clamp(p), 5), out3 = (p) => 1 - Math.pow(1 - clamp(p), 3);
  const fr = (t) => Math.round(t * 30) / 30;
  const SEAM = 960, GAP = 8; // the split: before above, after below; both bands 956 px, the same framing

  V.montaj = (ctx, p) => {
    const el = ctx.el;
    const root = h('div', null, null, el); root.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px;overflow:hidden;background:' + BG;
    const cv = h('canvas', null, null, root); cv.width = W; cv.height = H; cv.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    const c = cv.getContext('2d');
    const ov = h('div', null, null, root); ov.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    const pre = h('div', null, null, el); pre.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    const load = (src) => { const im = h('img', null, null, pre); im.src = src; im.decoding = 'sync'; return im; };
    const CAT = R.ROOT + '/brand_asset/catalog/';
    const cases = p.cases.map((k) => Object.assign({}, k, { im: load(CAT + k.img) }));
    // ---- the hits (reel seconds, measured on the song; every one snapped to a frame)
    const HT = {}; Object.entries(p.hits).forEach(([b, t]) => { HT[b] = fr(t); });
    const T = (b) => HT[b];
    const tBoom = T('29'), seq = ['29', '30.5', '32', '35', '37', '40', '41.5', '42.5', '43', '45'].map(T), tEnd = T('46.5'), tLogo = T('48');
    // ---- the halves of a catalog picture: side by side or one above the other (the white gutter between them)
    function halves(k) {
      const im = k.im, w = im.naturalWidth, hh = im.naturalHeight;
      if (k.halves) return k.halves;
      if (w >= hh) { const m = Math.round(w / 2); return (k.halves = [[3, 3, m - 9, hh - 6], [m + 6, 3, w - m - 9, hh - 6]]); }
      const m = Math.round(hh / 2); return (k.halves = [[3, 3, w - 6, m - 9], [3, m + 6, w - 6, hh - m - 9]]);
    }
    // one half inside a rect, at scale k (screen px per source px), its focus on the rect's centre, never showing an edge
    function half(im, src, rx, ry, rw, rh, kk, f, extra) {
      const [sx, sy, sw, sh] = src; const fx = f ? f[0] : 0.5, fy = f ? f[1] : 0.5;
      let dw = sw * kk, dh = sh * kk, dx = rx + rw / 2 - fx * dw, dy = ry + rh / 2 - fy * dh;
      dx = Math.min(rx, Math.max(rx + rw - dw, dx)); dy = Math.min(ry, Math.max(ry + rh - dh, dy));
      c.save(); c.beginPath(); c.rect(rx, ry, rw, rh); c.clip();
      if (extra) extra();
      c.imageSmoothingQuality = 'high'; c.drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh); c.restore();
    }
    // the split frame of one case (V: before above, after below), in the current transform
    function vsplit(k, o = {}) {
      const hv = halves(k), [a, b] = hv, sw = Math.max(a[2], b[2]), sh = Math.max(a[3], b[3]);
      const kk = Math.max(W / sw, (SEAM - GAP / 2) / sh) * (k.zoom || 1);
      const bh = SEAM - GAP / 2;
      if (o.bx == null) { half(k.im, a, 0, 0, W, bh, kk, k.focus); half(k.im, b, 0, SEAM + GAP / 2, W, H - SEAM - GAP / 2, kk, k.focus); return; }
      c.save(); c.translate(o.bx, 0); half(k.im, a, 0, 0, W, bh, kk, k.focus); c.restore();
      c.save(); c.translate(o.ax, 0); half(k.im, b, 0, SEAM + GAP / 2, W, H - SEAM - GAP / 2, kk, k.focus); c.restore();
    }
    // a strip of the triple split: before | after side by side
    const STR = [[282, 690], [702, 1110], [1122, 1530]];
    function strip(k, y0, y1, dx) {
      const [a, b] = halves(k), sw = Math.max(a[2], b[2]), sh = Math.max(a[3], b[3]), cw = (W - GAP) / 2;
      const kk = Math.max(cw / sw, (y1 - y0) / sh) * (k.zoom || 1);
      c.save(); c.translate(dx, 0);
      half(k.im, a, 0, y0, cw, y1 - y0, kk, k.focus); half(k.im, b, cw + GAP, y0, cw, y1 - y0, kk, k.focus);
      c.restore();
    }
    // the camera of a shot: zoom about the frame's centre, an offset, a shake
    const camOn = (s, x, y) => { c.translate(W / 2 + (x || 0), H / 2 + (y || 0)); c.scale(s, s); c.translate(-W / 2, -H / 2); };
    const shake = (t, t0, amp = 20, dur = 0.16) => { const u = t - t0; if (u < 0 || u > dur) return [0, 0]; const d = Math.pow(1 - u / dur, 2); return [amp * d * Math.sin(u * 2 * Math.PI * 21), amp * 0.6 * d * Math.sin(u * 2 * Math.PI * 17 + 1.3)]; };

    // ---- the DOM text: small, crisp, centred
    const FONT = "'Inter Variable',system-ui,sans-serif";
    const txt = (css, html) => { const d = h('div', 'tx', html, ov); d.style.cssText += ';' + css; return d; };
    const vis = (e, o) => { e.style.opacity = clamp(o).toFixed(3); e.style.visibility = o < 0.004 ? 'hidden' : ''; };
    // 1. the catalog's headline: „40 de cazuri. Toate reale.” (the site's own h1, its second half in the serif italic)
    const h1a = txt('left:160px;width:760px;top:780px;text-align:center;font:800 104px/1.04 ' + FONT + ';letter-spacing:-.045em;color:' + INK + ';white-space:nowrap', esc(p.h1[0]));
    const h1b = txt('left:160px;width:760px;top:900px;text-align:center;font:italic 400 112px/1.04 \'Fraunces Variable\',Georgia,serif;letter-spacing:-.02em;color:' + DEEP + ';white-space:nowrap',
      esc(p.h1[1].replace(/\.$/, '')) + '<i class="pd" style="display:inline-block;width:.16em;height:.16em;border-radius:50%;margin-left:.04em;background:radial-gradient(circle at 36% 34%,#fdeee6,#efbfad 30%,#dc9a85 75%,#bf7a64);vertical-align:baseline"></i>');
    const pd = h1b.querySelector('.pd');
    // 2. the labels of a case: the tags in the corners and the catalog's line on the seam
    const tagCss = 'padding:12px 20px 11px;border-radius:999px;background:rgba(255,255,255,.9);box-shadow:0 10px 26px -14px rgba(4,40,36,.45);font:800 25px/1 ' + FONT + ';letter-spacing:.24em;text-indent:.24em;white-space:nowrap';
    const tagB = txt('left:72px;top:244px;' + tagCss + ';color:' + INK, 'ÎNAINTE');
    const tagA = txt('left:72px;top:1452px;' + tagCss + ';color:' + DEEP, 'DUPĂ');
    const seam = txt('left:160px;width:760px;top:' + (SEAM - 34) + 'px;height:68px;display:flex;justify-content:center;align-items:center;pointer-events:none', '');
    const pill = h('div', null, null, seam); pill.style.cssText = 'display:flex;align-items:center;gap:16px;height:68px;padding:0 30px;border-radius:999px;background:#fff;box-shadow:0 16px 40px -18px rgba(4,40,36,.55),0 0 0 1px rgba(11,60,55,.06);overflow:hidden;white-space:nowrap';
    const pillDot = h('i', null, null, pill); pillDot.style.cssText = 'display:block;width:15px;height:15px;border-radius:50%;background:' + TEAL + ';flex:none';
    const pillTx = h('div', null, null, pill); pillTx.style.cssText = 'position:relative;height:68px;overflow:hidden';
    const lab = (k) => '<b style="font-weight:750;color:' + INK + '">' + esc(k.title) + '</b><span style="color:#4c5957;font-weight:550"> · ' + esc(k.meta) + '</span>';
    const pillRows = cases.map((k) => { const d = h('div', null, lab(k), pillTx); d.style.cssText = 'position:absolute;left:0;top:0;height:68px;line-height:68px;font:34px/68px ' + FONT + ';letter-spacing:-.018em;white-space:nowrap'; return d; });
    // the triple split: two small heads over the columns, a line under each strip
    const headB = txt('left:110px;width:320px;top:236px;text-align:center;font:800 25px/1 ' + FONT + ';letter-spacing:.24em;text-indent:.24em;color:' + INK, 'ÎNAINTE');
    const headA = txt('left:560px;width:320px;top:236px;text-align:center;font:800 25px/1 ' + FONT + ';letter-spacing:.24em;text-indent:.24em;color:' + DEEP, 'DUPĂ');
    const trio = (p.trio || [6, 7, 8]).map((i) => cases[i]);
    const trioLab = trio.map((k, j) => txt('left:160px;width:760px;top:' + (STR[j][1] - 66) + 'px;display:flex;justify-content:center', '<div style="padding:11px 24px 12px;border-radius:999px;background:#fff;box-shadow:0 12px 30px -16px rgba(4,40,36,.5);font:31px/1.1 ' + FONT + ';letter-spacing:-.015em;white-space:nowrap">' + lab(k) + '</div>'));
    // 3. the end: the real Google score, then the logo (black on white) and the cities, the consent line
    const STAR = '<svg viewBox="0 0 24 24" width="50" height="50" fill="' + TEAL + '" style="margin:0 4px"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/></svg>';
    const endG = h('div', null, null, ov); endG.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    const stars = h('div', null, STAR.repeat(5), endG); stars.style.cssText = 'position:absolute;left:160px;width:760px;top:430px;text-align:center;line-height:0;height:50px';
    const score = txt('left:160px;width:760px;top:494px;text-align:center;font:800 210px/1 ' + FONT + ';letter-spacing:-.05em;color:' + INK, esc(p.google.score)); endG.appendChild(score);
    const revs = txt('left:160px;width:760px;top:716px;text-align:center;font:700 54px/1.1 ' + FONT + ';letter-spacing:-.03em;color:' + DEEP + ';white-space:nowrap', esc(p.google.reviews)); endG.appendChild(revs);
    const logo = h('div', null, null, endG); logo.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    const LM = 112, LWH = 50, LWW = Math.round(LWH * 5583 / 426), LX = Math.round((W - (LM + 26 + LWW)) / 2), LY = 930;
    const mark = h('i', null, null, logo); mark.style.cssText = 'position:absolute;left:' + LX + 'px;top:' + LY + 'px;width:' + LM + 'px;height:' + LM + 'px;background:url(' + R.ROOT + '/brand_asset/logo-mark.png) center/contain no-repeat';
    const wm = h('i', null, null, logo); wm.style.cssText = 'position:absolute;left:' + (LX + LM + 26) + 'px;top:' + (LY + (LM - LWH) / 2) + 'px;width:' + LWW + 'px;height:' + LWH + 'px;background:#000;-webkit-mask:url(' + R.ROOT + '/brand_asset/wordmark-com.png) center/contain no-repeat;mask:url(' + R.ROOT + '/brand_asset/wordmark-com.png) center/contain no-repeat';
    load(R.ROOT + '/brand_asset/logo-mark.png'); load(R.ROOT + '/brand_asset/wordmark-com.png');
    const city = txt('left:160px;width:760px;top:' + (LY + LM + 46) + 'px;text-align:center;font:500 46px/1.1 ' + FONT + ';letter-spacing:-.005em;color:' + INK + ';white-space:nowrap',
      esc(p.cities[0]) + '<i style="display:inline-block;width:19px;height:19px;border-radius:50%;margin:0 24px 7px;vertical-align:middle;background:radial-gradient(circle at 38% 34%,#fdeee6 0%,#efbfad 30%,#dc9a85 75%,#bf7a64 100%);box-shadow:0 0 14px 4px rgba(226,162,141,.45)"></i>' + esc(p.cities[1])); endG.appendChild(city);
    const line = h('i', null, null, endG); line.style.cssText = 'position:absolute;left:390px;width:300px;top:' + (LY + LM + 126) + 'px;height:4px;border-radius:2px;background:' + TEAL + ';transform-origin:50% 50%';
    const consent = txt('left:160px;width:760px;top:1386px;text-align:center;font:500 31px/1.36 ' + FONT + ';letter-spacing:-.008em;color:#55625f;text-wrap:balance', esc(p.consent)); endG.appendChild(consent);

    // ---- the cut list: what is on screen between two hits, and how it arrived
    const TRIO0 = T('41.5'), TRIO = [T('41.5'), T('42.5'), T('43')];
    // index of the case on screen at t (the V-split cases), and the shot's own start
    const SHOTS = [ // [start, case index, how it arrives]
      [tBoom, 0, 'boom'], [seq[1], 1, 'whip'], [seq[2], 2, 'split'], [seq[3], 3, 'zoomout'], [seq[4], 4, 'whipv'], [seq[5], 5, 'flash'], [seq[9], 9, 'punch'],
    ];
    const shotAt = (t) => { let s = null; for (const x of SHOTS) if (t >= x[0]) s = x; return s; };
    const nextOf = (s) => { const i = SHOTS.indexOf(s); const n = i >= 0 && i < SHOTS.length - 1 ? SHOTS[i + 1][0] : tEnd; return s[0] < TRIO0 ? Math.min(n, TRIO0) : n; };
    // the whip between the first two cases: one film strip thrown to the left (it starts 0.07 s before the hit)
    const whipG = (t) => { const tw = seq[1]; if (t < tw - 0.07) return 0; if (t < tw) return 0.3 * Math.pow((t - tw + 0.07) / 0.07, 2); return 0.3 + 0.7 * out5((t - tw) / 0.2); };
    // the frost of the opening: the first case, out of focus behind milky glass, breathing
    function opening(t) {
      c.save(); const s = 1.08 + 0.025 * Math.sin(t * 1.3) + 0.04 * (t / tBoom), u = clamp((t - (tBoom - 0.34)) / 0.34);
      camOn(s * (1 + 0.5 * Math.pow(u, 3)), 0, 0); c.filter = 'blur(' + (34 - 10 * u).toFixed(1) + 'px)'; vsplit(cases[0]); c.restore(); c.filter = 'none';
      c.fillStyle = 'rgba(251,252,251,' + (0.8 - 0.25 * Math.pow(u, 2)).toFixed(3) + ')'; c.fillRect(0, 0, W, H);
      grid(0.55 * (1 - u));
    }
    function grid(a) { if (a <= 0.01) return; c.save(); c.globalAlpha = a; c.strokeStyle = 'rgba(20,165,150,.10)'; c.lineWidth = 1; c.beginPath();
      for (let x = 0; x <= W; x += 54) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); } for (let y = 0; y <= H; y += 54) { c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); } c.stroke(); c.restore(); }

    function draw(t) {
      c.setTransform(1, 0, 0, 1, 0, 0); c.filter = 'none'; c.globalAlpha = 1;
      c.fillStyle = BG; c.fillRect(0, 0, W, H);
      let white = 0; // the light over everything (the flash)
      if (t < tBoom) opening(t);
      else if (t < TRIO0 || (t >= seq[9] && t < tEnd)) {
        const S = shotAt(t), [t0, i, how] = S, k = cases[i], t1 = nextOf(S), u = t - t0;
        let s = 1 + 0.018 * u, x = 0, y = 0, bx = null, ax = null; const [sx, sy] = shake(t, t0, how === 'boom' || how === 'flash' ? 26 : 12);
        if (how === 'boom') s *= 1 + 0.24 * (1 - out5(u / 0.3));
        if (how === 'punch') s *= 1 + 0.16 * (1 - out5(u / 0.24));
        if (how === 'whip') x = W * 1.05 * (1 - whipG(t));
        if (how === 'whipv') y = H * 0.75 * (1 - out5(u / 0.2));
        if (how === 'split') { const e1 = out5(u / 0.2), e2 = out5((u - 0.05) / 0.2); bx = -W * (1 - e1); ax = W * (1 - e2); }
        if (how === 'zoomout') s *= 1 + 0.55 * (1 - out5(u / 0.32));
        if (how === 'flash') s *= 1 + 0.12 * (1 - out5(u / 0.5));
        // the way out: a speed ramp into the next hit (the long gaps), or the whip that throws it off
        const t2 = t1, left = t2 - t;
        if (how === 'split' || how === 'whipv') { const D = t2 - t0, q = clamp((u - 0.3) / (D - 0.3)); s *= 1 + 0.03 * q + 0.62 * Math.pow(q, 7); } // slow, then everything rushes in
        if (how === 'whipv') white = 0.92 * Math.pow(clamp(1 - left / 0.3), 1.6); // into the light
        if (how === 'boom') x -= W * 1.05 * whipG(t); // thrown off to the left: the next one comes in from the right
        if (how === 'zoomout' && left < 0.07) y -= H * 0.22 * Math.pow(1 - left / 0.07, 2); // thrown up: the next one comes from below
        if (how === 'whip' && left < 0.07) s *= 1 + 0.5 * Math.pow(1 - left / 0.07, 2);
        if (how === 'flash' && left < 0.08) s *= 1 + 0.3 * Math.pow(1 - left / 0.08, 2);
        if (how === 'punch' && left < 0.06) y -= 120 * Math.pow(1 - left / 0.06, 2);
        if (how === 'flash') white = Math.max(white, 1 - smooth(u / 0.36));
        c.save(); camOn(s, x + sx, y + sy); vsplit(k, bx != null ? { bx, ax } : {}); c.restore();
        if (how === 'whip' && u < 0.2) { c.save(); camOn(1, x - W * 1.05, 0); vsplit(cases[0]); c.restore(); } // the one before, leaving on the same strip
      } else if (t < seq[9]) { // the triple split
        grid(0.7);
        trio.forEach((k, j) => { const u = t - TRIO[j]; if (u < 0) return; const e = out5(u / 0.18), dir = j % 2 ? 1 : -1; const [sx] = shake(t, TRIO[j], 10, 0.12);
          const lv = seq[9] - t; const outX = lv < 0.1 ? -dir * W * 1.1 * Math.pow(1 - lv / 0.1, 2) : 0;
          strip(k, STR[j][0], STR[j][1], dir * W * (1 - e) + sx + outX); });
      } else { // the end: white
        grid(0.6 * smooth((t - tEnd) / 0.4));
      }
      if (white > 0.002) { c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = 'rgba(255,255,255,' + clamp(white).toFixed(3) + ')'; c.fillRect(0, 0, W, H); }
      dom(t);
    }
    function dom(t) {
      // the headline
      const ha = smooth((t - T('25.5') + 0.03) / 0.36), hb = smooth((t - T('26.5') + 0.03) / 0.36), go = clamp((t - (tBoom - 0.3)) / 0.3);
      const z = 1 + 0.03 * clamp(t / tBoom) + 1.6 * Math.pow(go, 3);
      [[h1a, ha], [h1b, hb]].forEach(([e, q]) => { vis(e, q * (1 - smooth((t - tBoom + 0.12) / 0.12))); e.style.transformOrigin = '540px ' + (960 - parseFloat(e.style.top)) + 'px'; e.style.transform = 'translateY(' + ((1 - out3(q)) * 26).toFixed(1) + 'px) scale(' + (z * (1.06 - 0.06 * out3(q))).toFixed(4) + ')'; e.style.filter = q < 0.99 || go > 0.01 ? 'blur(' + ((1 - q) * 14 + go * 18).toFixed(1) + 'px)' : ''; });
      const pq = clamp((t - T('27')) / 0.12); pd.style.transform = 'scale(' + (pq < 1 ? pq * 1.4 : 1 + 0.4 * Math.exp(-(t - T('27') - 0.12) * 12)).toFixed(3) + ')';
      // the case labels (the V-split shots only)
      const S = t >= tBoom && (t < TRIO0 || (t >= seq[9] && t < tEnd)) ? shotAt(t) : null;
      const on = S ? 1 : 0, u = S ? t - S[0] : 0;
      vis(tagB, on * smooth((t - tBoom) / 0.2)); vis(tagA, on * smooth((t - tBoom - 0.05) / 0.2));
      vis(seam, on);
      if (S) { // the seam's line rolls to the new case on every cut
        const i = S[1], prev = S[0] === seq[9] ? null : SHOTS[SHOTS.indexOf(S) - 1], e = S[0] === seq[9] ? 1 : out5(u / 0.22);
        pillRows.forEach((d, j) => { const show = j === i ? 1 : prev && j === prev[1] && u < 0.22 ? 1 : 0; d.style.visibility = show ? '' : 'hidden'; d.style.position = j === i ? 'relative' : 'absolute';
          d.style.transform = j === i ? 'translateY(' + ((1 - e) * 68).toFixed(1) + 'px)' : 'translateY(' + (-e * 68).toFixed(1) + 'px)'; });
        const sc = S[2] === 'boom' ? 0.9 + 0.1 * out5(u / 0.25) : 1; pill.style.transform = 'scale(' + sc.toFixed(3) + ')';
      }
      // the triple split
      const tr = t >= TRIO0 && t < seq[9];
      vis(headB, tr ? smooth((t - TRIO0) / 0.15) : 0); vis(headA, tr ? smooth((t - TRIO0) / 0.15) : 0);
      trioLab.forEach((d, j) => { const q = tr ? smooth((t - TRIO[j] - 0.06) / 0.14) : 0; vis(d, q); d.style.transform = 'translateY(' + ((1 - out3(q)) * 14).toFixed(1) + 'px)'; });
      // the end
      const te = t - tEnd, tl = t - tLogo;
      vis(endG, t >= tEnd ? 1 : 0);
      if (t >= tEnd) {
        const sq = out5(te / 0.3); stars.style.opacity = smooth(te / 0.2).toFixed(3); stars.style.transform = 'translateY(' + ((1 - sq) * 20).toFixed(1) + 'px)';
        const s1 = clamp(te / 0.06); score.style.opacity = s1.toFixed(3); score.style.transform = 'scale(' + (1 + 0.22 * (1 - out5(te / 0.28))).toFixed(4) + ')'; score.style.filter = te < 0.12 ? 'blur(' + ((1 - te / 0.12) * 10).toFixed(1) + 'px)' : '';
        const r1 = smooth((te - 0.115) / 0.25); vis(revs, r1); revs.style.transform = 'translateY(' + ((1 - out3(r1)) * 18).toFixed(1) + 'px)';
        const lg = smooth(tl / 0.24); logo.style.opacity = lg.toFixed(3); logo.style.visibility = lg < 0.004 ? 'hidden' : ''; logo.style.filter = tl < 0.24 ? 'blur(' + ((1 - lg) * 9).toFixed(1) + 'px)' : ''; logo.style.transform = 'translateY(' + ((1 - out5(tl / 0.4)) * 30).toFixed(1) + 'px)';
        const cq = smooth((tl - 0.06) / 0.3); vis(city, cq); city.style.transform = 'translateY(' + ((1 - out3(cq)) * 14).toFixed(1) + 'px)';
        const lq = E.inout(clamp((t - T('51')) / 0.5)); line.style.transform = 'scaleX(' + lq.toFixed(4) + ')'; line.style.opacity = lq > 0.002 ? '1' : '0';
        vis(consent, smooth((tl - 0.2) / 0.45));
      }
    }
    ctx.tick((t) => draw(t));
    ctx.shot.after = () => draw(R.t || 0);

    // ---- sound and events, to the frame (the premium set, by category). The song carries the bass; the effects mark the cuts.
    const ev = (t, kind) => R.event(t, kind);
    ctx.sfx(0.02, 'impact', 0.14, { prio: 4 }); ctx.sfx(0.0, 'tick_soft', 0.55); ev(0, 'write'); ctx.sfx(T('26.5'), 'tick_soft', 0.5); ev(T('26.5'), 'write'); ctx.sfx(T('27'), 'dot', 0.6); ev(T('27'), 'motif');
    ctx.sfx(tBoom - 0.34, 'riser_soft', 0.45); ctx.sfx(tBoom - 0.02, 'suck_in', 0.6, { prio: 4, peak: true });
    ctx.sfx(tBoom, 'hit_deep', 1, { prio: 5 }); ctx.sfx(tBoom, 'whoosh_cut', 0.5, { prio: 3, peak: true }); ev(tBoom, 'cut'); ev(tBoom, 'slam'); ctx.sfx(tBoom + 0.04, 'tick_soft', 0.35);
    const cutS = { whip: ['whoosh_cut', 0.75], split: ['tap', 0.7], zoomout: ['whoosh_through', 0.6], whipv: ['whoosh_cut', 0.7], flash: ['hit_deep', 1], punch: ['whoosh_cut', 0.7] };
    SHOTS.slice(1).forEach(([t0, , how]) => { const [cat, g] = cutS[how]; ctx.sfx(t0, cat, g, { prio: 4, peak: /whoosh/.test(cat) }); if (!/whoosh/.test(cat)) ctx.sfx(t0, 'whoosh_cut', 0.4, { prio: 3, peak: true }); ev(t0, 'cut'); ev(t0, 'slam'); ctx.sfx(t0 + 0.05, 'tick_soft', 0.3); });
    ctx.sfx(seq[2] + 0.05, 'tap', 0.55); // the split: the second band lands
    ctx.sfx(seq[3] - 0.32, 'riser_soft', 0.5); ctx.sfx(seq[5] - 0.42, 'riser_soft', 0.6); ctx.sfx(seq[5] - 0.02, 'suck_in', 0.55, { prio: 4, peak: true });
    ctx.sfx(seq[5] + 0.04, 'shimmer_soft', 0.8, { prio: 4 }); ev(seq[5], 'reveal');
    TRIO.forEach((t0, j) => { ctx.sfx(t0, j ? 'tap' : 'whoosh_cut', j ? 0.85 : 0.7, { prio: 4, peak: !j }); if (!j) ctx.sfx(t0, 'tap', 0.8); ev(t0, j ? 'panel' : 'cut'); ev(t0, 'slam'); ctx.sfx(t0 + 0.07, 'tick_soft', 0.3); });
    ctx.sfx(tEnd, 'swoosh_end', 0.7, { prio: 4, peak: true }); ev(tEnd, 'cut'); ctx.sfx(tEnd + 0.01, 'tap', 0.6); ev(tEnd, 'slam'); ctx.sfx(tEnd + 0.12, 'tick_soft', 0.4);
    ctx.sfx(tLogo, 'tap', 0.55); ev(tLogo, 'slam'); ctx.sfx(tLogo + 0.06, 'shimmer_soft', 0.45); ctx.sfx(tLogo + 0.07, 'dot', 0.5); ev(tLogo + 0.2, 'glow');
    ctx.sfx(T('51'), 'tick_soft', 0.3); ev(T('51'), 'glow');
    ctx.focus(logo);
    R.montaj = { T, SHOTS, TRIO, tEnd, tLogo };
  };
})();
