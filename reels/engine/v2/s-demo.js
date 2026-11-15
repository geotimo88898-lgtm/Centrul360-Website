// Centrul360 reels v2: the showpiece (15.11, the owner on the demo clip: „mult mult mai clean și foarte profesional, cu
// un zoom in poate insane, cu lumină foarte nice și movement constant, și chenare 3D etc. care dau în animații crazy”).
// One continuous 3D scene with a moving camera (CSS 3D, a pure function of the time):
//   1. a centred line, big, word by word out of blur; the last word huge, in turquoise italic serif
//   2. the zoom: the camera flies through the bowl of a letter of that word into the space behind it (depth of field,
//      motion blur from its own speed), with a deep whoosh that peaks on the frame it passes the page
//   3. four thick cards (paper, a real photo in black and white, turquoise glass, black) wait fanned in depth, backs
//      toward us; on every second beat one flips to the front and the one before it flies past the camera
//   4. the title lands from the depth, a real photo card settles over its corner, three small lines; held, never still
// Nothing is ever static: the camera always pushes or drifts, the cards float, the light on the wall moves. The light
// comes from the top left: every card is shaded by its own angle and throws a soft shadow on the wall behind.
// Real things only: the photos are the clinic's, the four steps are the site's own („Cum decurge”, grasime-localizata).
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, E, h, esc } = R;
  const INK = '#0b0b0d', TEAL = '#14a596', P = 1500, CX = 540, CY = 900, ZW = -3420;
  const io = (p) => E.inout(clamp(p)), out = (p) => 1 - Math.pow(1 - clamp(p), 3), inn = (p) => Math.pow(clamp(p), 2.4);
  const lerp = (a, b, p) => a + (b - a) * p;
  const kf = (t, K) => { if (t <= K[0][0]) return K[0][1]; for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const p = (t - K[i - 1][0]) / (K[i][0] - K[i - 1][0]); return lerp(K[i - 1][1], K[i][1], (K[i][2] || io)(p)); } return K[K.length - 1][1]; };
  const mix = (A, B, p) => { const o = {}; Object.keys(A).forEach((k) => { o[k] = lerp(A[k], B[k] != null ? B[k] : A[k], p); }); return o; };
  const COND = () => "'" + ((R.BR && R.BR.FF) || 'Inter Variable') + "','Inter Variable',sans-serif"; // single quotes: it goes inside style="…"

  V.showpiece = (ctx, p) => {
    const lay = ctx.layer(0), b = R.beatPer || 0.4878, T = (x) => x * b;
    const root = h('div', null, null, lay); root.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px;overflow:hidden;background:#f4f5f4;perspective:' + P + 'px;perspective-origin:' + CX + 'px ' + CY + 'px';
    const world = h('div', null, null, root); world.style.cssText = 'position:absolute;left:' + CX + 'px;top:' + CY + 'px;width:0;height:0;transform-style:preserve-3d';
    const obj = (w, hh, css, html) => { const e = h('div', null, html || '', world); e.style.cssText = 'position:absolute;left:' + (-w / 2) + 'px;top:' + (-hh / 2) + 'px;width:' + w + 'px;height:' + hh + 'px;' + (css || ''); e._w = w; e._h = hh; return e; };
    // ---- the wall far behind: paper in window light (soft bars that drift), where the shadows fall
    const wall = obj(5600, 9000, 'background:#f6f7f6;overflow:hidden');
    const bars = h('i', null, null, wall); bars.style.cssText = 'position:absolute;left:-20%;top:-10%;width:140%;height:120%;background:repeating-linear-gradient(118deg,rgba(0,0,0,0) 0,rgba(0,0,0,0) 420px,rgba(0,0,0,.075) 620px,rgba(0,0,0,.075) 860px,rgba(0,0,0,0) 1060px,rgba(0,0,0,0) 1280px)';
    const sun = h('i', null, null, wall); sun.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse 2600px 2600px at 30% 30%,rgba(255,255,255,.95),rgba(255,255,255,0) 70%)';
    const shadow = (col) => obj(10, 10, 'background:' + (col || 'rgb(8,20,18)') + ';border-radius:60px;opacity:0;display:none');
    // ---- 1. the line
    const page = obj(1000, 1000, 'text-align:center');
    page.innerHTML = '<div class="l1" style="position:absolute;left:0;right:0;top:110px;font:800 104px/1.08 \'Inter Variable\',sans-serif;letter-spacing:-.04em;color:' + INK + '"><span>Fiecare</span> <span>rezultat</span><br><span>începe</span> <span>cu</span> <span>un</span></div>' +
      '<div class="l2" style="position:absolute;left:0;right:0;top:330px;font:italic 560 470px/1 \'Fraunces Variable\',Georgia,serif;letter-spacing:-.03em;color:' + TEAL + '"><span class="pw">p<span class="bowl">a</span>s.</span></div>';
    const words = [...page.querySelectorAll('.l1 span')], big = page.querySelector('.pw'), bowl = page.querySelector('.bowl');
    const wT = [T(0), T(0) + 0.14, T(1), T(1) + 0.12, T(1) + 0.24], tBig = T(2);
    // ---- 3. the cards
    const CW = 700, CH = 940;
    const steps = [
      { n: '01', lab: 'PRIMA VIZITĂ', t: 'Analiza<br>și planul', mat: 'paper' },
      { n: '02', lab: 'ȘEDINȚA 1', t: 'Primul<br>tratament', mat: 'photo', img: 'g-tm-aparate.webp' },
      { n: '03', lab: 'SĂPTĂMÂNILE 2-8', t: 'Corpul<br>lucrează', mat: 'glass' },
      { n: '04', lab: 'LA 6-8 SĂPTĂMÂNI', t: 'Diferența<br>se vede', mat: 'black' }];
    const MAT = {
      paper: { bg: 'linear-gradient(118deg,rgba(0,0,0,0) 34%,rgba(0,0,0,.045) 46%,rgba(0,0,0,.045) 58%,rgba(0,0,0,0) 70%),linear-gradient(155deg,#ffffff,#e6eae8)', num: TEAL, lab: 'rgba(11,11,13,.5)', ink: INK, edge: '#cfd5d3' },
      photo: { bg: '#fff', num: '#ffffff', lab: 'rgba(11,11,13,.5)', ink: INK, edge: '#cfd5d3' },
      glass: { bg: 'linear-gradient(150deg,rgba(168,238,229,.96),rgba(60,196,180,.95) 48%,rgba(20,165,150,.96))', num: '#ffffff', lab: 'rgba(255,255,255,.85)', ink: '#ffffff', edge: '#0f8a7e' },
      black: { bg: 'linear-gradient(155deg,#232327,#0b0b0d)', num: TEAL, lab: 'rgba(255,255,255,.55)', ink: '#ffffff', edge: '#35353a' } };
    const mkCard = (w, hh, m, front, back) => {
      const c = obj(w, hh, 'transform-style:preserve-3d');
      for (let i = 5; i >= 1; i--) { const e = h('i', null, null, c); e.style.cssText = 'position:absolute;inset:0;border-radius:38px;background:' + m.edge + ';transform:translateZ(' + (-i * 3) + 'px);filter:blur(var(--b,0px))'; }
      const bk = h('div', null, back || '', c); bk.style.cssText = 'position:absolute;inset:0;border-radius:38px;overflow:hidden;backface-visibility:hidden;transform:translateZ(-16px) rotateY(180deg);background:linear-gradient(155deg,#ffffff,#eef1f0);filter:blur(var(--b,0px))';
      const f = h('div', null, front, c); f.style.cssText = 'position:absolute;inset:0;border-radius:38px;overflow:hidden;backface-visibility:hidden;background:' + m.bg + ';box-shadow:0 0 0 1.5px rgba(255,255,255,.6) inset;filter:blur(var(--b,0px))';
      const sh = h('i', null, null, f); sh.style.cssText = 'position:absolute;inset:0;pointer-events:none'; c._shade = sh;
      const beam = h('i', null, null, f); beam.style.cssText = 'position:absolute;top:-20%;left:0;width:240px;height:140%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.5),rgba(255,255,255,0));opacity:' + (m === MAT.glass ? 1 : m === MAT.black ? 0.35 : 0.0); c._beam = beam;
      c._sh = shadow(m === MAT.glass ? 'rgb(6,92,82)' : null); return c;
    };
    const cards = steps.map((s) => {
      const m = MAT[s.mat];
      const front = (s.mat === 'photo' ? '<img src="' + R.ROOT + '/brand_asset/' + s.img + '" style="position:absolute;left:0;top:0;width:100%;height:68%;object-fit:cover;object-position:50% 40%;filter:grayscale(1) contrast(1.2) brightness(1.08)"><div style="position:absolute;left:0;right:0;bottom:0;height:32%;background:#fff"></div>' : '') +
        '<div style="position:absolute;left:50px;top:40px;font:800 250px/0.84 ' + COND() + ';font-stretch:75%;letter-spacing:-.02em;color:' + m.num + (s.mat === 'photo' ? ';text-shadow:0 6px 30px rgba(0,0,0,.35)' : '') + '">' + s.n + '</div>' +
        '<div style="position:absolute;left:50px;right:50px;bottom:50px"><div style="font:700 24px/1 \'Inter Variable\',sans-serif;letter-spacing:.2em;color:' + m.lab + '">' + esc(s.lab) + '</div><div style="margin-top:18px;font:800 74px/1.02 \'Inter Variable\',sans-serif;letter-spacing:-.035em;color:' + m.ink + '">' + s.t + '</div></div>';
      const back = '<div style="position:absolute;right:34px;top:50%;margin-top:-80px;font:800 160px/1 ' + COND() + ';font-stretch:75%;letter-spacing:-.02em;color:' + TEAL + '">' + s.n + '</div><div style="position:absolute;right:38px;top:50%;margin-top:96px;width:112px;height:5px;border-radius:3px;background:' + INK + '"></div>';
      return mkCard(CW, CH, m, front, back);
    });
    const N = cards.length;
    const Hs = (i) => T(5 + 2 * i), He = (i) => T(7 + 2 * i);
    const HZ = -2450, HERO = { x: 0, y: -10, z: HZ, ry: 0, rz: 0, rx: 3 };
    const slot = (k) => (k <= 0 ? HERO : { x: 176 + 66 * (k - 1), y: -96 - 66 * (k - 1), z: HZ - 250 - 170 * (k - 1), ry: 180 - 25 - 4 * (k - 1), rz: 5 + 2.5 * (k - 1), rx: 3 });
    const slotAt = (k) => { const a = Math.floor(k), f = k - a; return mix(slot(a), slot(a + 1), f); };
    // ---- 4. the title, the photo card, the three lines
    const tT = T(13.05), tC = T(13.55), tL = [T(14.45), T(14.7), T(14.95)];
    const title = obj(980, 200, 'text-align:center;font:900 152px/1 \'Inter Variable\',sans-serif;letter-spacing:-.055em;color:' + INK + ';white-space:nowrap', 'Pas cu pas');
    const pc = mkCard(540, 620, MAT.photo, '<img src="' + R.ROOT + '/brand_asset/' + (p.photo || 'loc-timisoara-receptie.webp') + '" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 50%;filter:grayscale(1) contrast(1.2) brightness(1.08)"><div style="position:absolute;left:32px;bottom:28px;font:700 21px/1 \'Inter Variable\',sans-serif;letter-spacing:.22em;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.55)">' + esc(p.photoLabel || 'TIMIȘOARA') + '</div>', '');
    const lines = ['TIMIȘOARA', 'ARAD', 'CENTRUL360.COM'].map((tx, i) => obj(700, 40, 'text-align:center;font:700 25px/40px \'Inter Variable\',sans-serif;letter-spacing:.24em;color:' + (i === 2 ? TEAL : 'rgba(11,11,13,.62)'), esc(tx)));
    const rule = obj(120, 4, 'background:' + TEAL + ';border-radius:2px;transform-origin:50% 50%');
    // ---- the light over everything (top left), and the breath of white as the camera passes the page
    const light = h('i', null, null, root); light.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 1000px 1200px at 14% 6%,rgba(255,255,255,.5),rgba(255,255,255,0) 68%),linear-gradient(140deg,rgba(0,0,0,0) 55%,rgba(0,0,0,.07))';
    const veil = h('i', null, null, root); veil.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:#fff;opacity:0';
    [...root.querySelectorAll('img')].forEach((im) => { im.decoding = 'sync'; });
    // ---- the camera
    const t0f = T(3.45), t1f = T(4.95);
    let target = { x: 0, y: 190 }; // the bowl of the "a" (set once the page is laid out), in the page's own px from its centre
    const camAt = (t) => {
      const z = kf(t, [[0, 1640], [t0f, 1480, (q) => q], [t1f, -1100, io], [T(13), -1185, (q) => q], [T(19.5), -1262, (q) => q]]);
      const pf = clamp((t - t0f) / (t1f - t0f));
      const aim = Math.sin(Math.PI * clamp(pf * 1.25)) ; // toward the bowl, then back to the axis
      return { x: target.x * aim + (t > t1f ? 26 * Math.sin((t - t1f) * 0.7) : 0), y: target.y * aim + (t > t1f ? 14 * Math.sin((t - t1f) * 0.9 + 1) : 6 * Math.sin(t * 0.9)), z,
        rz: 7 * Math.sin(Math.PI * pf) * (pf < 1 ? 1 : 0), ry: t > t1f ? 2.4 * Math.sin((t - t1f) * 0.8) : 1.2 * Math.sin(t * 0.7), rx: t > t1f ? 1.1 * Math.sin((t - t1f) * 0.6 + 0.7) : 0 };
    };
    let tPass = t0f; for (let t = t0f; t < t1f; t += 1 / 240) if (camAt(t).z <= 0) { tPass = t; break; }
    // ---- sound, each on the frame of its move
    const ev = (t, k) => R.event(t, k || 'panel');
    wT.forEach((t, i) => { ctx.sfx(t, 'tick_soft', 0.6); ev(t, i ? 'word' : 'write'); });
    ctx.sfx(tBig, 'tap', 0.8); ctx.sfx(tBig + 0.02, 'shimmer_soft', 0.5); ev(tBig);
    ev(T(3.45), 'push');
    ctx.sfx(tPass - 0.08, 'riser_soft', 0.6, { prio: 4, peak: true }); // the rise ends where the camera goes through
    ctx.sfx(tPass, 'whoosh_through', 1.0, { prio: 5, peak: true }); ev(tPass);
    for (let i = 0; i < N; i++) {
      ctx.sfx(Hs(i) - T(0.66), 'card_flip', 0.8); ctx.sfx(Hs(i), 'tap', 0.85, { prio: 3 }); ctx.sfx(Hs(i) + 0.03, 'dot', 0.45); ev(Hs(i));
      ctx.sfx(He(i) - T(0.165), 'whoosh_cut', 0.7, { prio: 3, peak: true }); ev(He(i) - T(0.165), 'pass'); // the frame the card goes past the lens
    }
    ctx.sfx(tT + T(0.62), 'tap', 0.9, { prio: 3 }); ctx.sfx(tT + T(0.62), 'pulse', 0.7); ev(tT + T(0.62));
    ctx.sfx(tC, 'card_flip', 0.8); ctx.sfx(tC + T(0.85), 'tap', 0.6); ev(tC + T(0.85));
    tL.forEach((t) => { ctx.sfx(t, 'tick_soft', 0.6); ev(t, 'word'); });
    ctx.sfx(tL[2] + 0.1, 'shimmer_soft', 0.45); ev(tL[2] + 0.9, 'hold');
    ctx.focus(root);
    let measured = false;
    const measure = () => { // where the bowl of the "a" is on the page (layout px, whatever the camera does), once the font is there
      const l2 = page.querySelector('.l2'); if (!bowl.offsetWidth) return;
      const fx = p.bowlX != null ? p.bowlX : 0.44, fy = p.bowlY != null ? p.bowlY : 0.65;
      let x = bowl.offsetWidth * fx, y = bowl.offsetHeight * fy;
      for (let e = bowl; e && e !== page; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; } // up the offset parents to the page
      target = { x: x - 500, y: y - 500 - 40 }; measured = true;
    };
    // ---- one frame
    const setObj = (e, o, cam, vz, fd, extra) => {
      const d = cam.z - o.z, a = o.a == null ? 1 : o.a;
      if (d < 70 || a <= 0.003) { e.style.display = 'none'; if (e._sh) e._sh.style.display = 'none'; return; }
      e.style.display = 'block'; e.style.opacity = e.style.transformStyle === 'preserve-3d' ? '' : a.toFixed(3); // (opacity would flatten a 3D card)
      e.style.transform = 'translate3d(' + o.x.toFixed(2) + 'px,' + o.y.toFixed(2) + 'px,' + o.z.toFixed(2) + 'px) rotateZ(' + (o.rz || 0).toFixed(2) + 'deg) rotateY(' + (o.ry || 0).toFixed(2) + 'deg) rotateX(' + (o.rx || 0).toFixed(2) + 'deg) scale(' + (o.s || 1).toFixed(4) + ')';
      const dof = Math.max(0, Math.abs(d - fd) / fd - 0.13) * (d < fd ? 26 : 13), mb = Math.min(26, 1700 * Math.abs(vz) / (d * d)) + (o.mb || 0);
      const bl = Math.min(60, dof + mb + (extra || 0));
      if (e.style.transformStyle === 'preserve-3d') e.style.setProperty('--b', bl < 0.4 ? '0px' : bl.toFixed(1) + 'px'); else e.style.filter = bl < 0.4 ? '' : 'blur(' + bl.toFixed(1) + 'px)';
      if (e._shade) { const ry = ((o.ry || 0) % 360 + 540) % 360 - 180, s = Math.sin(ry * Math.PI / 180); e._shade.style.background = s > 0 ? 'rgba(0,0,0,' + (0.2 * s).toFixed(3) + ')' : 'rgba(255,255,255,' + (-0.16 * s).toFixed(3) + ')'; }
      if (e._sh) { // its shadow: soft, a little behind the card and down to the right, where the light sends it (it turns with the card)
        const S = e._sh, sa = o.sa == null ? 1 : o.sa;
        if (sa <= 0.01 || d < 420) S.style.display = 'none';
        else {
          S.style.display = 'block'; S.style.width = e._w + 'px'; S.style.height = e._h + 'px'; S.style.left = (-e._w / 2) + 'px'; S.style.top = (-e._h / 2) + 'px';
          S.style.transform = 'translate3d(' + (o.x + 64).toFixed(1) + 'px,' + (o.y + 112).toFixed(1) + 'px,' + (o.z - 150).toFixed(1) + 'px) rotateZ(' + (o.rz || 0).toFixed(1) + 'deg) rotateY(' + (o.ry || 0).toFixed(1) + 'deg) rotateX(' + (o.rx || 0).toFixed(1) + 'deg)';
          S.style.filter = 'blur(' + (58 + bl).toFixed(0) + 'px)'; S.style.opacity = (0.3 * a * sa).toFixed(3);
        }
      }
    };
    const mark = p.debug ? h('i', null, null, page) : null; if (mark) mark.style.cssText = 'position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:red;z-index:9';
    ctx.tick((t) => {
      if (!measured) measure();
      if (mark) { mark.style.left = (target.x + 500) + 'px'; mark.style.top = (target.y + 500 + 40) + 'px'; }
      const cam = camAt(t), vz = (camAt(t + 1 / 120).z - camAt(t - 1 / 120).z) * 60;
      world.style.transform = 'rotateZ(' + (-cam.rz).toFixed(3) + 'deg) rotateX(' + (-cam.rx).toFixed(3) + 'deg) rotateY(' + (-cam.ry).toFixed(3) + 'deg) translate3d(' + (-cam.x).toFixed(2) + 'px,' + (-cam.y).toFixed(2) + 'px,' + (P - cam.z).toFixed(2) + 'px)';
      const fd = t < tPass ? Math.max(260, cam.z) : lerp(Math.max(260, -cam.z), 1500, io((t - tPass) / 0.25)) ; // focus: the page, then the cards
      setObj(wall, { x: 0, y: 300, z: ZW }, cam, 0, cam.z - ZW);
      bars.style.transform = 'translate(' + (38 * t).toFixed(1) + 'px,' + (20 * t).toFixed(1) + 'px)';
      // the line
      words.forEach((w, i) => { const q = out((t - wT[i]) / 0.38); w.style.display = 'inline-block'; w.style.opacity = q.toFixed(3); w.style.transform = 'scale(' + (1.5 - 0.5 * q).toFixed(3) + ')'; w.style.filter = q < 1 ? 'blur(' + ((1 - q) * 16).toFixed(1) + 'px)' : ''; });
      const qb = out((t - tBig) / 0.5); big.style.display = 'inline-block'; big.style.opacity = qb.toFixed(3); big.style.transform = 'scale(' + (2.3 - 1.3 * qb).toFixed(3) + ')'; big.style.filter = qb < 1 ? 'blur(' + ((1 - qb) * 34).toFixed(1) + 'px)' : '';
      setObj(page, { x: 0, y: -40, z: 0 }, cam, vz, Math.max(260, cam.z));
      veil.style.opacity = (0.55 * Math.max(0, 1 - Math.abs(t - tPass) / 0.16)).toFixed(3);
      // the cards
      const adv = []; for (let m = 0; m < N; m++) adv.push(io((t - (Hs(m) - T(0.68))) / T(0.68))); // each flip moves the whole fan one place forward
      cards.forEach((c, i) => {
        let k = i + 1; for (let m = 0; m <= i; m++) k -= adv[m];
        let o = Object.assign({}, slotAt(Math.max(0, k)));
        const tl0 = T(3.0 + 0.13 * i), ql = out((t - tl0) / T(1.1)); // they rise into the fan behind the page, just before the camera goes through
        if (ql < 1) o = mix({ x: o.x + 300, y: o.y + 2300, z: o.z - 120, ry: o.ry + 80, rz: o.rz + 16, rx: 20 }, o, ql);
        o.a = t >= tl0 ? 1 : 0;
        if (Math.max(0, k) < 0.02 && t >= Hs(i) - 0.01) { o.y += 9 * Math.sin((t - Hs(i)) * 2.3); o.ry += 5.5 * Math.sin((t - Hs(i)) * 1.7 + 0.4); o.rx += 2 * Math.sin((t - Hs(i)) * 1.3); }
        else if (k >= 0.02) { o.y += 6 * Math.sin(t * 1.4 + i); o.ry += 2 * Math.sin(t * 1.1 + i * 2); }
        const te = He(i) - T(0.86), qe = clamp((t - te) / T(0.76));
        if (qe >= 1) o.a = 0;
        if (qe > 0) { // a quick step to the left (the fan stays in view on the right), then past the lens, big and soft
          const up = i % 2 ? -1 : 1, qx = out(qe * 2), qz = inn(qe);
          o.x = o.x - 300 * qx - 250 * qz; o.y = lerp(o.y, up * 230, qz); o.z = lerp(o.z, cam.z + 240, qz); o.ry = lerp(o.ry, 62, qx) + 16 * qz; o.rz = lerp(o.rz, -up * 13, qz); o.sa = 1 - clamp(qe * 2.4);
        }
        if (c._beam) c._beam.style.transform = 'translateX(' + (-260 + 900 * ((t * 0.45 + i * 0.3) % 1)).toFixed(1) + 'px) skewX(-18deg)';
        setObj(c, o, cam, vz, fd);
      });
      // the title, the photo card, the lines
      const qt = out((t - tT) / T(0.62)); setObj(title, { x: 0, y: -452 - 8 * Math.sin(t * 0.8), z: lerp(ZW + 60, -2600, qt), a: clamp((t - tT) / 0.14) }, cam, vz, fd, (1 - qt) * 10);
      const qc = out((t - tC) / T(0.85));
      const oc = mix({ x: 900, y: 900, z: -1900, ry: -160, rz: 26, rx: 14 }, { x: 0, y: 20, z: -2470, ry: -9, rz: -3, rx: 3 }, qc);
      oc.y += 7 * Math.sin(t * 1.5); oc.ry += 4.5 * Math.sin(t * 1.1); oc.rx += 1.6 * Math.sin(t * 0.9 + 1); oc.a = t >= tC ? 1 : 0; setObj(pc, oc, cam, vz, fd);
      lines.forEach((l, i) => { const q = out((t - tL[i]) / 0.4); setObj(l, { x: 0, y: 512 + i * 46 + (1 - q) * 26, z: -2600, a: q }, cam, 0, fd); });
      const qr = io((t - tL[0] + 0.1) / 0.5); setObj(rule, { x: 0, y: 470, z: -2600, a: clamp(qr * 3) }, cam, 0, fd); rule.style.transform += ' scaleX(' + qr.toFixed(3) + ')';
    });
  };
})();
