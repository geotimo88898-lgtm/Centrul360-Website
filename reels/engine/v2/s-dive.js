// Centrul360 reels v2: "the dive" (v2-crema-straturi, 15.11; the middle rebuilt on the second pass). One continuous
// camera journey, no cuts: a cream jar touches the skin's surface (the glow stays in the top layer); the camera dives
// for two seconds (the surface membrane, then sheets of glass that pass one by one, then the deep; real motion blur by
// sub-frame accumulation; one whoosh that falls in pitch), led by a small rose gold light-dot, into a volume of fibres
// with the camera inside it: wavy bundles at many angles and depths, depth of field, no ground and no horizon.
// Slack first (sagging, frayed, thinning, gaps opening, the space dimmer); the camera orbits, then flies along one
// fibre to the first point of energy; the points arrive with rose gold glints and pulses of light, the fibres pull
// straight into loose families, new ones draw themselves in behind a travelling light and the whole space brightens;
// one fast ripple tightens everything („se simte imediat”). A glass ring counts the weeks (8-12); the camera rises back
// into daylight for the comment pill that types "360".
// The whole reel is one world, built once by the first shot (R.shots gives every line's time); the engine's shots are
// only its clock: each line is a shot ("dv-*") whose "transition" is the name of a camera move the world itself makes
// (dive, settle, pull-back, fly-along, ripple, rack-focus, orbit, ascend), its fastest moment on the cut (where the
// engine puts the whoosh). The world is a ".shot" too, so check2.cjs measures its text against the safe zone.
// Only what the site says is labelled (riduri-linii-fine.html): „la suprafață”, „straturile profunde”, „colagen”,
// „elastină”, „colagen nou”, „8-12 săptămâni”. No layer names, no depths.
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, lerp, E, h, esc } = R;
  const TYPES = ['dv-surface', 'dv-plunge', 'dv-fibres', 'dv-path', 'dv-energy', 'dv-lift', 'dv-dial', 'dv-weeks', 'dv-comment'];
  ['dive', 'settle', 'pull-back', 'fly-along', 'ripple', 'descend', 'rise', 'rack-focus', 'orbit', 'ascend'].forEach((n) => { R.TR[n] = { dur: 0.5, in() {}, out() {} }; });

  const CW = 1080, CH = 1920, PAD = 260;
  const YD = 7400;            // the deep: where the volume of fibres is (world y); the surface is world y 0
  const BAND = 104;           // the top layer's thickness
  const SANS = "'Inter Variable',system-ui,sans-serif", SERIF = "'Fraunces Variable',Georgia,serif";
  const ROSE = ['#ffffff', '#fbe3d9', '#eab5a5', '#cf8f7d'];
  const sm = (p) => { p = clamp(p); return p * p * (3 - 2 * p); };
  const io = (p) => E.inout(clamp(p)), ex = (p) => E.expo(clamp(p)), o3 = (p) => E.out(clamp(p));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const back = (p, c = 1.4) => { p = clamp(p); const c3 = c + 1; return 1 + c3 * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  const spring = (x, k = 5.5, w = 7) => (x <= 0 ? 0 : 1 - Math.exp(-k * x) * Math.cos(w * x));
  const rnd = (i, k = 1) => R.rnd(i + 0.37, k);
  const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const mixc = (a, b, p) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * p));
  const rgb = (c, a = 1) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  // the depth's colour, by world y (white daylight, the pale top layer, the site's turquoise, #0b7f74 for depth)
  const STOPS = [[-2600, '#ffffff'], [-700, '#fbfefd'], [-60, '#f1f9f8'], [0, '#eaf6f4'], [BAND, '#45c7b8'], [BAND + 110, '#22b3a4'], [BAND + 260, '#17a899'], [520, '#14a596'],
    [1700, '#13a092'], [3200, '#119a8c'], [YD - 500, '#109687'], [YD + 700, '#0e8d80'], [YD + 2000, '#0b7f74']].map(([y, c]) => [y, hex(c)]);
  const colAt = (y) => { if (y <= STOPS[0][0]) return STOPS[0][1]; for (let i = 1; i < STOPS.length; i++) if (y <= STOPS[i][0]) return mixc(STOPS[i - 1][1], STOPS[i][1], (y - STOPS[i - 1][0]) / (STOPS[i][0] - STOPS[i - 1][0])); return STOPS[STOPS.length - 1][1]; };
  // an ease built from a velocity profile: slow start, the fastest moment at pc, then a quick, soft stop
  function profile(pc, nIn, nOut) { const N = 600, tb = [0]; let s = 0; for (let i = 1; i <= N; i++) { const p = (i - 0.5) / N; s += p < pc ? Math.pow(p / pc, nIn) : Math.pow((1 - p) / (1 - pc), nOut); tb.push(s); } return (p) => { p = clamp(p) * N; const i = Math.min(N - 1, Math.floor(p)); return (tb[i] + (tb[i + 1] - tb[i]) * (p - i)) / s; }; }
  const wt = (L, re, dflt) => { const w = (L.wv || L.words).find((x) => re.test(x.w.replace(/[.,;:]/g, ''))); return w ? w.t : (dflt != null ? dflt : L.t0); };
  const mk = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };

  let W = null;
  function build() {
    if (W) return W;
    W = {};
    const shots = TYPES.map((tp) => R.shots.find((s) => s.vis.type === tp)), L = shots.map((s) => s.lines[0]);
    const S = shots.map((s) => s.t0), total = R.total;
    // the words' times, measured on the voice (script "words", wordtimes.py: the spoken text, numbers as words); else the engine's estimate
    L.forEach((ln, i) => { const m = R.script.words && R.script.words['L' + i]; ln.wv = m && ln.voiced ? m.map(([w, t]) => ({ w, t: ln.t0 + t })) : ln.words.map((x) => ({ w: x.w, t: x.t })); });
    // ---------------------------------------------------------------- the clock: every moment from the voice
    const T = { land: 0.42 };
    T.s1 = S[1]; T.sink = wt(L[1], /^mai$/i, L[1].t0 + 1.75) - 0.1; T.s2 = S[2]; T.arrive = T.s2 + 1.0;
    T.weak = wt(L[2], /^tot$/i, L[2].t0 + 1.2); T.scade = wt(L[2], /^fermitatea$/i, L[2].t0 + 3.0);
    T.s3 = S[3]; T.path = wt(L[3], /^cale$/i, L[3].t0 + 0.9) - 0.35; T.acolo = wt(L[3], /^chiar$/i, L[3].t0 + 1.7);
    T.s4 = S[4]; T.energy = wt(L[4], /^duc$/i, L[4].t0 + 1.2); T.exact = wt(L[4], /^exact$/i, L[4].t0 + 2.3);
    T.hit = wt(L[4], /^pornesc$/i, L[4].t0 + 3.9) + 0.12; T.nou = wt(L[4], /^colagen$/i, L[4].t0 + 5.0);
    T.s5 = S[5]; T.imed = wt(L[5], /^imediat/i, L[5].t0 + 1.5); T.s6 = S[6]; T.s7 = S[7];
    T.w0 = T.s7 + 0.35; T.w8 = wt(L[7], /^opt$/i, L[7].t0 + 3.9) + 0.22; T.w12 = wt(L[7], /^douăsprezece$/i, L[7].t0 + 4.6) + 0.3; T.sed = wt(L[7], /^ședință/i, L[7].t0 + 5.6) - 0.28;
    T.s8 = S[8]; T.up = T.s8 + 0.5; T.type = wt(L[8], /^trei$/i, L[8].t0 + 3.0); T.send = wt(L[8], /^comentarii/i, L[8].t0 + 4.2) + 0.18;
    W.T = T;
    shots[4].revealAt = T.hit;             // the payoff: the energy starts the new collagen (the engine's riser and impact land here)
    shots[8].resolveAt = T.send;           // the resolving moment: the comment is sent

    // ---------------------------------------------------------------- the camera on the way down and up (world y at the frame's centre, zoom, a slow sway)
    // the dive is the hero: half a second to gather speed, about two seconds of real descent (its fastest frame on the cut), a soft landing
    const prof = (fn) => { const N = 800, tb = [0]; let s = 0; for (let i = 1; i <= N; i++) { s += fn((i - 0.5) / N); tb.push(s); } return (p) => { p = clamp(p) * N; const i = Math.min(N - 1, Math.floor(p)); return (tb[i] + (tb[i + 1] - tb[i]) * (p - i)) / s; }; };
    const PC = (T.s2 - T.sink) / (T.arrive - T.sink);
    const diveE = prof((p) => (p < 0.2 ? Math.pow(p / 0.2, 2) : p > 0.82 ? Math.pow((1 - p) / 0.18, 1.7) : 1) * (1 + 0.14 * Math.exp(-Math.pow((p - PC) / 0.16, 2))));
    const upE = profile(0.42, 2.4, 2.2);
    const Y0 = -140, Y1 = 330, YSKY = -640;
    function camY(t) {
      if (t < T.sink) return Y0 + (Y1 - Y0) * io(seg(t, T.s1 - 0.32, T.s1 + 0.36)) - 16 * sm(seg(t, 0, T.s1)) * (1 - io(seg(t, T.s1 - 0.32, T.s1 + 0.36)));
      if (t < T.arrive + 1.2) { const q = t - T.arrive; return Y1 + (YD - Y1) * diveE(seg(t, T.sink, T.arrive)) + (q > 0 ? 30 * Math.exp(-4.2 * q) * Math.sin(7.5 * q) : 0); }
      let y = YD;
      if (t > T.s8 - 0.4) y += (YSKY - YD) * upE(seg(t, T.s8 - 0.4, T.s8 + 0.55));
      return y;
    }
    function camZ(t) {
      let z = 1 + 0.035 * sm(seg(t, 0, T.s1)) - 0.035 * io(seg(t, T.s1 - 0.3, T.s1 + 0.4));
      z += 0.1 * Math.sin(Math.PI * seg(t, T.s2 - 0.9, T.arrive + 0.1));                       // a push through the fastest part of the dive
      z += 0.04 * sm(seg(t, T.arrive, T.s3)) - 0.08 * io(seg(t, T.s3 - 0.34, T.s3 + 0.5));      // the particles follow the camera inside the volume: settle, pull back,
      z += 0.26 * flyE(seg(t, T.s4 - 0.34, T.exact + 0.3)) - 0.24 * io(seg(t, T.hit - 0.1, T.hit + 1.6)); // in along the fibre, out on the new weave
      z += 0.05 * back(seg(t, T.s5 - 0.2, T.s5 + 0.55), 2.4) - 0.07 * io(seg(t, T.s6 - 0.3, T.s6 + 0.5));
      z += 0.04 * sm(seg(t, T.s6, T.s8));
      z -= 0.08 * io(seg(t, T.s8 - 0.4, T.up)); z += 0.03 * sm(seg(t, T.up, total));
      return z;
    }
    const camX = (t) => 14 * Math.sin(t * 0.37 + 1) + 8 * Math.sin(t * 0.83);
    const deepK = (y) => clamp((y - 900) / 1800);   // 0 near the surface, 1 in the deep (for the light)
    // the light's story in the deep: dimmer as the collagen thins (line 3), brighter for good once the new collagen starts (line 5); the fibres go soft behind the ring
    const moodDim = (t) => sm(seg(t, T.weak - 0.2, T.scade + 0.7)) * (1 - sm(seg(t, T.hit - 0.1, T.hit + 0.9)));
    const moodLit = (t) => sm(seg(t, T.hit, T.hit + 1.4));
    const rackK = (t) => sm(seg(t, T.s6 - 0.25, T.s6 + 0.45)) * (1 - sm(seg(t, T.s8 - 0.4, T.s8)));

    // ---------------------------------------------------------------- the DOM: one root (a ".shot": the checks see its text), canvases, type
    const world = document.getElementById('world');
    const root = h('div', 'shot dv-world'); world.insertBefore(root, world.firstChild);
    root.style.cssText = 'display:block;opacity:1;z-index:-1;overflow:hidden;background:#fff';
    h('style', null, '#sweep,#flash{display:none!important}.dv-world .tx{left:0;width:1080px;text-align:center;white-space:nowrap;color:#12201f;font:640 80px/1.08 ' + SANS + ';letter-spacing:-.035em}' +
      '.dv-world .tx .w{display:inline-block;margin:0;transform-origin:50% 62%;will-change:auto}.dv-world .tx .k{font:italic 470 1.5em/0.9 ' + SERIF + ';letter-spacing:-.02em;margin:0 .06em}' +
      '.dv-world .tx.dk{color:rgba(255,255,255,.9)}.dv-world .tx.dk .k{color:#fff}.dv-world .tx.lt .k{color:#0b7f74}.dv-world .ln{display:block;width:max-content;margin:0 auto;transform-origin:50% 56%}.dv-world .ln.kl{line-height:1.02}.dv-world .ln.kl .k{font-size:1em;margin:0}', root);
    root.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute"><defs><filter id="dv-blur" x="-5%" y="-60%" width="110%" height="220%"><feGaussianBlur stdDeviation="0 0"/></filter></defs></svg>');
    const fblur = root.querySelector('#dv-blur feGaussianBlur');
    const cv = mk(CW, CH); cv.style.cssText = 'position:absolute;left:0;top:0'; root.appendChild(cv);
    const g = cv.getContext('2d');
    const LAY = { far: mk(CW, CH + 2 * PAD), glass: mk(CW, CH + 2 * PAD), mid: mk(CW, CH + 2 * PAD), near: mk(CW, CH + 2 * PAD) }, acc = mk(CW, CH), netc = mk(CW, CH + 2 * PAD);
    const jar = new Image(); jar.src = R.ROOT + '/reels/scripts/' + R.script.id + '/objects/jar.png'; root.appendChild(Object.assign(jar, { style: 'display:none' }));
    const JW = 430, JH = JW * 398 / 488;
    // film grain: a small tile, moved every other frame (it also dithers the long gradients)
    const grain = h('div', null, null, root); { const c = mk(256, 256), x = c.getContext('2d'), im = x.createImageData(256, 256); let s = 987654321;
      for (let i = 0; i < im.data.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; const v = (s >> 9) & 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } x.putImageData(im, 0, 0);
      grain.style.cssText = 'position:absolute;inset:-256px;background:url(' + c.toDataURL() + ');opacity:.05;mix-blend-mode:overlay;pointer-events:none;z-index:6'; }

    // ---------------------------------------------------------------- particles (three depths)
    const parts = [];
    for (let i = 0; i < 330; i++) { const k = i < 172 ? 0 : i < 272 ? 1 : 2; const yy = 240 + Math.pow(rnd(i, 2), 0.85) * (YD + 600);
      parts.push({ k, x: -160 + rnd(i, 1) * 1400, y: yy, r: k === 0 ? 1.6 + rnd(i, 3) * 2.6 : k === 1 ? 1.4 + rnd(i, 3) * 2.4 : 22 + rnd(i, 3) * 44, a: k === 0 ? 0.16 + rnd(i, 4) * 0.26 : k === 1 ? 0.3 + rnd(i, 4) * 0.4 : 0.05 + rnd(i, 4) * 0.08, ph: rnd(i, 5) * 6.28 }); }
    const PAR = [0.5, 1, 1.9];
    // the layers on the way down („straturile”): sheets of glass the camera falls through, one after another (each seen from above, edge-on, then from below)
    const SHEETS = [1700, 2450, 3190, 3930, 4680, 5420].map((y, i) => ({ y: y + (rnd(i, 80) - 0.5) * 140, ph: rnd(i, 81) * 6.28, a: 0.78 + rnd(i, 82) * 0.22, tilt: (rnd(i, 84) - 0.5) * 0.07, sx: 540 + (rnd(i, 85) - 0.5) * 500 }));

    // ---------------------------------------------------------------- the fibres: a volume with the camera inside it (x right, y down, z into the depth)
    const v3 = { add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
      mix: (a, b, p) => [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
      cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; } };
    const FOC = 1150;
    const FAMS = [0.66, -0.52, 0.2], FP = [0, 1, 0, 1, 2];      // taut, the weave leans three loose ways; every fibre keeps its own angle, depth and distance (never a grid)
    const NPOS = [[-45, 195, 300], [-410, -20, 640], [420, 250, 780], [-300, 500, 40], [370, -60, -60]];   // where the energy arrives (the first one is on the fibre the camera follows)
    const fibres = [];
    // a fibre has two shapes: slack (its own angle, lower, sagging, wavy, its strands apart) and taut (a nearly straight cord in one of the three families)
    function mkF(i, gen, o) { o = o || {};
      const r = (k) => rnd(i * 7 + gen * 1000, 100 + k), el = !!o.el, fam = o.fam != null ? o.fam : Math.floor(r(1) * 3) % 3;
      const ang1 = FAMS[fam] + (r(2) - 0.5) * 0.3, len = 2400 + r(3) * 900, dz = (r(4) - 0.5) * 800, s0 = o.s0 != null ? o.s0 : 0.5;
      const C1 = o.c || [(r(5) - 0.5) * 1750, -340 + r(6) * 1260, -640 + Math.pow(r(7), 0.9) * 2250], d1 = [Math.cos(ang1) * len, Math.sin(ang1) * len, dz];
      const ang0 = ang1 + (r(8) - 0.5) * 1.0, C0 = [C1[0] + (r(9) - 0.5) * 240, C1[1] + 70 + r(10) * 200, C1[2] + (r(11) - 0.5) * 260], d0 = [Math.cos(ang0) * len, Math.sin(ang0) * len, dz + (r(12) - 0.5) * 320];
      const F = { i, gen, el, P0t: v3.sub(C1, v3.mul(d1, s0)), P1t: v3.add(C1, v3.mul(d1, 1 - s0)), P0s: v3.sub(C0, v3.mul(d0, s0)), P1s: v3.add(C0, v3.mul(d0, 1 - s0)),
        sag: el ? 50 + r(13) * 80 : 110 + r(13) * 190, a1: el ? 15 + r(14) * 12 : 30 + r(14) * 50, f1: el ? 9 + r(15) * 6 : 2.1 + r(15) * 2.5, p1: r(16) * 6.28, a2: 24 + r(17) * 46, f2: 1.5 + r(18) * 2.2, p2: r(19) * 6.28,
        rad: el ? 2.6 : 9 + r(20) * 10, w: (el ? 1.7 + r(21) * 0.9 : (3.6 + r(21) * 2.6) * (r(29) > 0.74 ? 1.7 : 1)) * (gen === 2 ? 0.82 : 1), ph: r(22) * 6.28, tw: 0.3 + r(23) * 0.22, weak: !!o.weak, wd: r(24), gap: o.gap ? 0.32 + r(25) * 0.36 : null, s0, t0: o.t0, dur: o.dur || 1.1,
        res: el ? 0.45 : 0.16 + r(26) * 0.14, bow: (r(28) - 0.5) * (el ? 60 : 190), nx: -Math.sin(ang1), ny: Math.cos(ang1) };
      fibres.push(F); return F; }
    // the fibre the camera will follow: it runs into the depth, the first point of energy lands in its middle
    const HERO = mkF(900, 0); Object.assign(HERO, { P0t: [-382, 420, -1500], P1t: [292, -30, 2100], P0s: [-412, 475, -1500], P1s: [262, 45, 2100], sag: 150, a1: 26, f1: 2.4, a2: 20, rad: 10, w: 6.6, bow: 0, res: 0.2, nx: 0.9, ny: 0.43 });
    [[[520, -280, -700], [-260, 400, 1500]], [[-660, 620, -520], [250, 210, 1500]]].forEach((e, k) => { const F = mkF(910 + k, 0); Object.assign(F, { P0t: e[0], P1t: e[1], P0s: [e[0][0] + 40, e[0][1] + 70, e[0][2]], P1s: [e[1][0] - 60, e[1][1] + 90, e[1][2]], bow: 40, nx: 0.9, ny: -0.43 }); });
    const ANCH = [HERO].concat([1, 2, 3, 4].map((k) => mkF(920 + k, 0, { c: NPOS[k], fam: k % 3 })));      // a fibre through each of the other four points
    for (let i = 0; i < 20; i++) mkF(i, 0, { fam: FP[(i * 3) % 5], weak: i % 5 === 0 || i % 5 === 1 || i % 5 === 3, gap: i % 5 === 4 });   // the old weave: three in five will thin away, one in five tears
    for (let i = 0; i < 6; i++) mkF(40 + i, 0, { el: true, fam: i % 3, weak: i % 2 === 1 });                     // elastin: fine, coiled
    for (let i = 0; i < 24; i++) { const n = NPOS[i % 5], r = (q) => rnd(i, 300 + q);                           // the new collagen: each fibre starts near a point of energy and draws itself both ways
      mkF(100 + i, 1, { fam: FP[i % 5], s0: 0.3 + r(1) * 0.4, c: [n[0] + (r(2) - 0.5) * 900, n[1] + (r(3) - 0.5) * 640, n[2] + (r(4) - 0.5) * 900], t0: T.hit + 0.06 + r(5) * 0.85, dur: 0.95 + r(6) * 0.5, el: i % 6 === 5 }); }
    for (let i = 0; i < 22; i++) { const r = (q) => rnd(i, 400 + q);                                             // and more of it, all through the weeks
      mkF(200 + i, 2, { fam: FP[(i + 2) % 5], s0: 0.25 + r(1) * 0.5, t0: T.s6 + 0.15 + r(2) * (T.w12 - T.s6 - 1.3), dur: 1.3 + r(3) * 0.6, el: i % 7 === 6 }); }
    const wave = (t) => (t - T.hit) * 1500;                                             // how far the tightening has travelled from the points (px a second)
    const front = (t) => lerp(-1600, 2300, seg(t, T.s5 - 0.2, T.s5 + 0.36));            // line 6: one fast ripple crosses the whole volume, its middle on the cut
    const sagK = (t) => 0.5 + 0.5 * sm(seg(t, T.weak, T.scade + 0.9)) + (t > T.arrive ? 0.16 * Math.exp(-2.6 * (t - T.arrive)) * Math.cos(8 * (t - T.arrive)) : 0);
    const weakK = (F, t) => sm(seg(t, T.weak + F.wd * 1.3, T.weak + F.wd * 1.3 + 1.0));
    const gapW = (F, t) => 0.085 * sm(seg(t, T.weak + 0.3 + F.wd * 1.2, T.weak + 1.5 + F.wd * 1.2));
    function tens(x, y, z, t) { if (t <= T.hit) return 0; let m = 1e9; for (let k = 0; k < 5; k++) { const n = NPOS[k], d = Math.hypot(x - n[0], y - n[1], z - n[2]); if (d < m) m = d; }
      const q = (wave(t) - m) / 1400; if (q <= 0) return 0; return Math.min(1.08, spring(q, 4.2, 5.0)) * (0.8 + 0.2 * sm((front(t) - (x * 0.92 + z * 0.3)) / 320)); }
    // a point of a fibre: [x, y, z, how taut (0..1.1), the ripple on it (0..1)]
    function fpos(F, s, t) {
      const tx = lerp(F.P0t[0], F.P1t[0], s), ty = lerp(F.P0t[1], F.P1t[1], s), tz = lerp(F.P0t[2], F.P1t[2], s);
      const tau = F.gen === 0 ? tens(tx, ty, tz, t) : 0.72 + 0.28 * sm(seg(t, F.t0 + 0.3, F.t0 + 1.7));
      const w1 = Math.sin(s * F.f1 * 6.2832 + F.p1 + t * 0.55) * F.a1, w2 = Math.sin(s * F.f2 * 6.2832 + F.p2 + t * 0.4) * F.a2;
      const k = sagK(t) * (F.weak ? 1 + 0.5 * weakK(F, t) : 1);
      let sx = lerp(F.P0s[0], F.P1s[0], s) + F.nx * w1, sy = lerp(F.P0s[1], F.P1s[1], s) + F.ny * w1 + F.sag * k * 4 * s * (1 - s), sz = lerp(F.P0s[2], F.P1s[2], s) + w2;
      const bw = F.bow * 4 * s * (1 - s);                                              // taut is not a ruler: a long, gentle curve and a breath of its wave stay
      let x = sx + (tx + F.nx * (w1 * F.res + bw) - sx) * tau, y = sy + (ty + F.ny * (w1 * F.res + bw) - sy) * tau; const z = sz + (tz + w2 * F.res - sz) * tau;
      let bump = 0; if (t > T.s5 - 0.25 && t < T.s5 + 0.6) { const rp = (x * 0.92 + z * 0.3 - front(t)) / 210; bump = Math.exp(-rp * rp); y -= 46 * bump * (F.el ? 0.6 : 1); }
      return [x, y, z, tau, bump];
    }
    // the points of energy: when each comes down and lands, how strongly it pulses
    const landT = (i) => T.exact - 0.08 + i * 0.11, dropT = (i) => T.energy - 0.1 + i * 0.09, PULSE = 0.66;
    const pulse = (i, t) => { const a = t - landT(i); if (a < 0) return 0; return (0.5 + 0.5 * Math.exp(-3.2 * (a % PULSE))) * (1 - sm(seg(t, T.hit + 0.5, T.hit + 1.7))) * Math.min(1, a * 8); };
    // the camera inside the volume: a slow orbit that never stops; a flight along one fibre to the first point; a pull-back over the new weave
    const flyE = profile(0.3, 1.6, 1.8);
    function cam3(t) {
      const sway = 0.012 * Math.sin(t * 0.6);
      // A: an orbit that also travels in through the weave (fibres pass close by, out of focus)
      const azA = -0.42 + 0.56 * seg(t, T.arrive - 0.9, T.s3 + 0.2) + sway, dA = 1500 - 420 * sm(seg(t, T.arrive - 0.6, T.s3)), elA = 0.03 + 0.02 * Math.sin(t * 0.4), tA = [0, 70, 320];
      const pA = [tA[0] - Math.sin(azA) * Math.cos(elA) * dA, tA[1] - Math.sin(elA) * dA, tA[2] - Math.cos(azA) * Math.cos(elA) * dA];
      // B: on „există totuși o cale” the camera pulls back and up to the near end of one fibre: the way to the point lies ahead; on line 5 it flies along it
      const fly = flyE(seg(t, T.s4 - 0.34, T.exact + 0.3)), sB = 0.06 + 0.02 * seg(t, T.s3, T.s4) + 0.28 * fly + 0.012 * sm(seg(t, T.exact + 0.3, T.hit));
      const hB = fpos(HERO, sB, t), n0 = fpos(HERO, 0.5, t), pB = [hB[0] + 30, hB[1] - lerp(150, 66, fly) + 4 * Math.sin(t * 1.3), hB[2]], tB = [n0[0], n0[1] - lerp(30, 58, fly), n0[2]];
      // C: back and wider: the whole volume, taut and bright; the orbit goes on
      const azC = 0.3 + 0.2 * seg(t, T.hit, T.s8) + sway, dC = 1620 - 110 * sm(seg(t, T.hit + 1.2, T.s6)) - 80 * back(seg(t, T.s5 - 0.2, T.s5 + 0.5), 2.2) * (1 - 0.6 * sm(seg(t, T.s5 + 0.5, T.s6))), elC = 0.075, tC = [0, 96, 400];
      const pC = [tC[0] - Math.sin(azC) * Math.cos(elC) * dC, tC[1] - Math.sin(elC) * dC, tC[2] - Math.cos(azC) * Math.cos(elC) * dC];
      const qAB = io(seg(t, T.s3 - 0.36, T.s3 + 0.58)), qBC = io(seg(t, T.hit - 0.12, T.hit + 1.7));
      const p = v3.mix(v3.mix(pA, pB, qAB), pC, qBC), tg = v3.mix(v3.mix(tA, tB, qAB), tC, qBC);
      const f = v3.norm(v3.sub(tg, p)); let r = v3.norm(v3.cross([0, 1, 0], f)), d = v3.cross(f, r);
      const bank = seg(t, T.s4 - 0.34, T.s4 + 0.6), roll = 0.05 * Math.sin(Math.PI * qAB) + 0.06 * Math.sin(Math.PI * bank) - 0.05 * Math.sin(Math.PI * qBC); if (roll) { const c = Math.cos(roll), sn = Math.sin(roll), r2 = v3.add(v3.mul(r, c), v3.mul(d, sn)); d = v3.add(v3.mul(d, c), v3.mul(r, -sn)); r = r2; }
      return { p, f, r, d, zf: v3.dot(v3.sub(v3.mix(n0, tC, qBC), p), f), ap: lerp(lerp(19, 27, qAB), 17, qBC) };
    }

    // ---------------------------------------------------------------- type: a phrase is a centred block; its lines come in whole, each on its first spoken word
    // "NN:" a line's size; *key* words in the italic serif (a line that is only key words takes its size as given, else they are 1.5 em);
    // "text|sync" names the spoken word; "@0.2" at the end moves a line's entrance (seconds)
    const phrases = [];
    function phrase(Li, lines, o) {
      const el = h('div', 'tx ' + (o.dk ? 'dk' : 'lt'), null, root); el.style.cssText = 'position:absolute;top:' + o.y + 'px;z-index:5';
      if (o.q) el.dataset.q = '1';
      const P = { el, ls: [], out: o.out, o, Li }; let last = -1; const LW = L[Li].wv;
      const nrm = (x) => x.toLowerCase().replace(/[^a-zăâîșț0-9-]/g, '');
      lines.forEach((ln, li) => { let size = o.size || 66, dt = 0; const m = /^(\d+):/.exec(ln); if (m) { size = +m[1]; ln = ln.slice(m[0].length); } const md = /@(-?[\d.]+)$/.exec(ln); if (md) { dt = +md[1]; ln = ln.slice(0, md.index); }
        const row = h('span', 'ln' + (/^\*[^*]+\*$/.test(ln.trim()) ? ' kl' : ''), null, el); row.style.fontSize = size + 'px'; let first = null, key = false;
        ln.split(/(\*[^*]+\*)/).forEach((part) => { if (!part.trim()) return; const isK = /^\*/.test(part); if (isK) key = true;
          const ws = part.replace(/\*/g, '').split(/\s+/).filter(Boolean).map((tok) => { const [txt, sync] = tok.split('|'), want = nrm(sync || txt); const k = LW.findIndex((x, i) => i > last && (sync ? nrm(x.w).startsWith(want) : nrm(x.w) === want)); if (k >= 0) { last = k; if (first == null) first = LW[k].t; } return esc(txt); });
          h('span', isK ? 'k w' : 'w', ws.join(' '), row); row.appendChild(document.createTextNode(' ')); });
        let fs = size; while (fs > (key ? 80 : 58) && row.offsetWidth > 756) { fs -= 2; row.style.fontSize = fs + 'px'; }
        let t0 = (first != null ? first : (P.ls.length ? P.ls[P.ls.length - 1].t + 0.35 : L[Li].t0)) - 0.09 + dt; if (o.cap != null) t0 = Math.min(t0, o.cap + li * 0.12);
        P.ls.push({ row, key, t: t0 }); });
      P.t0 = P.ls[0].t; phrases.push(P); return P;
    }
    const TOP = 318;
    phrase(0, ['Crema ta de față', 'lucrează doar', 'la *suprafață*'], { y: 0, worldY: -140 + 286 - 960, fadeY: 120, out: T.s1 + 0.5, q: 1, size: 90, cap: T.s1 - 1.25 });
    phrase(1, ['Fermitatea pielii', 'se hotărăște', '126:*mai jos*@-0.16'], { y: 0, dk: 1, out: T.s2 - 0.05, worldY: 330 + 30, fadeY: 250, size: 84 });
    phrase(1, ['84:în *straturile*', '126:*profunde*'], { y: TOP + 24, dk: 1, out: wt(L[2], /^pielea$/i) - 0.1 });
    phrase(2, ['66:tot mai puțin', '128:*colagen*', '128:*și elastină*'], { y: TOP - 20, dk: 1, out: T.scade - 0.42 });
    const pScade = phrase(2, ['66:fermitatea', '176:*scade*@-0.3'], { y: TOP + 16, dk: 1, out: T.s3 - 0.3 });
    phrase(3, ['66:există totuși o *cale*', '66:de a ajunge', '150:*chiar acolo*@-0.25'], { y: TOP - 24, dk: 1, out: T.s4 - 0.3 });
    phrase(4, ['156:*HIFU*', '66:și *radiofrecvența*'], { y: TOP + 6, dk: 1, out: wt(L[4], /^energie$/i) - 0.39 });
    phrase(4, ['66:energie', '144:*controlată*@-0.12'], { y: TOP + 24, dk: 1, out: T.exact - 0.02 });
    phrase(4, ['66:exact în@0.32', '126:*straturile*', '126:*profunde*'], { y: TOP - 30, dk: 1, out: wt(L[4], /^producția$/i) - 0.37 });
    phrase(4, ['66:producția de', '150:*colagen nou*@-0.2'], { y: TOP + 24, dk: 1, out: T.s5 - 0.3 });
    phrase(5, ['66:un efect de fermitate', '66:se simte', '176:*imediat*@-0.3'], { y: TOP - 30, dk: 1, out: T.s6 - 0.3 });
    phrase(6, ['66:rezultatul adevărat', '66:vine@-0.1', '160:*mai|mai târziu*@-0.3'], { y: TOP - 30, dk: 1, out: T.s7 - 0.25 });
    phrase(7, ['64:are|colagenul nevoie de', '132:*timp*@-0.35'], { y: 262, dk: 1, out: wt(L[7], /^efectul$/i) - 0.36 });
    phrase(7, ['64:efectul', '132:*maxim*'], { y: 262, dk: 1, out: T.s8 - 0.45 });
    phrase(8, ['ce i se potrivește', '132:*pielii tale*'], { y: 372, out: wt(L[8], /^scrie$/i) - 0.2, size: 88 });
    phrase(8, ['scrie *360|trei*', 'în comentarii'], { y: 352, size: 98 });
    // the ring's own text: the weeks counted, then „8-12 săptămâni” (the site: „maxim la 8-12 săptămâni de la ședință”)
    const rtx = h('div', 'tx dk', '<div class="n"></div><div class="u"><span class="k" style="font-size:1em">săptămâni</span></div><div class="s">de la ședință</div>', root); rtx.style.cssText = 'position:absolute;top:0;height:0;z-index:5;color:#fff';
    const num = rtx.querySelector('.n'), unit = rtx.querySelector('.u'), sub = rtx.querySelector('.s');
    num.style.cssText = 'position:absolute;left:540px;width:max-content;top:742px;font:760 204px/1 ' + SANS + ';letter-spacing:-.06em;font-variant-numeric:tabular-nums';
    unit.style.cssText = 'position:absolute;left:540px;width:max-content;top:946px;font-size:70px'; sub.style.cssText = 'position:absolute;left:540px;width:max-content;top:1044px;font:560 42px/1 ' + SANS + ';letter-spacing:.01em;color:rgba(255,255,255,.84)';
    // the comment pill (a glass card with thickness): the avatar, the typed word, the send button the dot becomes
    const pill = h('div', null, '<i class="av"></i><span class="tx pt"></span><i class="sd"></i>', root);
    pill.style.cssText = 'position:absolute;left:160px;top:820px;width:760px;height:156px;border-radius:78px;z-index:5;background:linear-gradient(180deg,#ffffff,#f4fbfa);' +
      'box-shadow:0 2px 0 #fff inset,0 -4px 0 rgba(11,127,116,.08) inset,0 0 0 1.5px rgba(11,127,116,.07),0 11px 0 #cfe9e5,0 80px 110px -40px rgba(11,127,116,.5),0 24px 40px -20px rgba(11,127,116,.32);transform-origin:50% 60%';
    const av = pill.querySelector('.av'); av.style.cssText = 'position:absolute;left:24px;top:24px;width:108px;height:108px;border-radius:50%;background:radial-gradient(circle at 34% 28%,#5fd4c6,#14a596 58%,#0b7f74)';
    av.innerHTML = '<svg viewBox="0 0 96 96" width="108" height="108"><circle cx="48" cy="38" r="15" fill="#fff"/><path d="M20 82c3-17 15-25 28-25s25 8 28 25" fill="#fff"/></svg>';
    const ptxt = pill.querySelector('.pt'); ptxt.style.cssText = 'position:absolute;left:162px;top:42px;width:auto;text-align:left;font:680 68px/72px ' + SANS + ';letter-spacing:-.02em;color:#12201f';
    const sd = pill.querySelector('.sd'); sd.style.cssText = 'position:absolute;right:24px;top:24px;width:108px;height:108px;border-radius:50%;background:#ffffff;box-shadow:0 0 0 3px #dcf2ef inset,0 10px 22px -10px rgba(11,127,116,.5)';
    sd.innerHTML = '<svg viewBox="0 0 96 96" width="108" height="108"><path class="ck" d="M33 49l11 11 20-23" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>';
    const ck = sd.querySelector('.ck'); const sdot = h('i', null, null, sd); sdot.style.cssText = 'position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:radial-gradient(circle at 36% 30%,#fff,#fbe3d9 35%,#eab5a5 70%,#cf8f7d);box-shadow:0 0 22px 8px rgba(234,181,165,.45)';


    // ---------------------------------------------------------------- sounds and events (the engine adds the whoosh on every cut)
    const cue = (t, cat, gain, o) => R.cue(t, cat, gain, o), ev = (t, kind) => R.event(t, kind || 'step');
    cue(T.land, 'tap', 0.7); ev(T.land, 'drop'); cue(T.land + 0.5, 'shimmer_soft', 0.45); ev(T.land + 0.5, 'glow');
    cue(T.sink, 'dot', 0.5); ev(T.sink, 'step');
    // the dive: one whoosh that falls in pitch all the way down, its loudest moment on the fastest frame (the cut). "whoosh_fall" is this reel's own
    // sound (scripts/v2-crema-straturi/whoosh_fall.py writes it next to the premium set); where its files are missing the mix keeps the whoosh_through
    cue(T.s2, 'whoosh_fall', 1.0, { peak: true, prio: 5 }); cue(T.s2, 'whoosh_through', 0.9, { peak: true, prio: 4.5 });
    SHEETS.forEach((Sh, i) => { let a = T.sink, b = T.arrive; for (let k = 0; k < 30; k++) { const m = (a + b) / 2; if (camY(m) < Sh.y) a = m; else b = m; } Sh.t = a; cue(a, 'tick_soft', 0.34 + 0.04 * i); ev(a, 'step'); });
    cue(T.arrive - 0.06, 'tap', 0.5); ev(T.arrive - 0.06, 'stop'); cue(T.arrive + 0.1, 'shimmer_soft', 0.4);
    cue(T.weak, 'tick_soft', 0.4); ev(T.weak, 'step'); ev(T.weak + 0.9, 'step'); ev(T.scade, 'step'); cue(T.scade, 'tick_soft', 0.45);
    cue(T.path, 'riser_soft', 0.4); ev(T.path + 0.2, 'step'); cue(T.acolo + 0.06, 'dot', 0.55); ev(T.acolo + 0.06, 'reveal');
    ev(T.energy, 'step'); cue(T.energy, 'riser_soft', 0.35);
    for (let i = 0; i < 5; i++) { cue(landT(i), i ? 'tick_soft' : 'tap', 0.5); ev(landT(i), 'step'); }
    for (let k = 1; landT(0) + k * PULSE < T.hit - 0.25; k++) { cue(landT(0) + k * PULSE, 'pulse', 0.26 + 0.05 * k); ev(landT(0) + k * PULSE, 'glow'); }   // the points pulse until the new collagen starts
    cue(T.hit + 0.5, 'sparkle', 0.35); ev(T.nou, 'step'); ev(T.hit + 1.2, 'step');
    cue(T.s5 + 0.14, 'shimmer_soft', 0.5); ev(T.s5 + 0.3, 'step'); ev(T.imed, 'step');
    ev(T.s6 + 0.25, 'reveal'); cue(T.s6 + 0.25, 'tap', 0.45);
    const weekAt = (k) => (k <= 8 ? T.w0 + (T.w8 - T.w0) * Math.pow(k / 8, 0.82) : T.w8 + (T.w12 - T.w8) * (k - 8) / 4);
    for (let k = 1; k <= 12; k++) { cue(weekAt(k), 'tick_soft', k === 8 || k === 12 ? 0.7 : 0.42); ev(weekAt(k), 'step'); }
    cue(T.w12 + 0.12, 'shimmer_soft', 0.5); ev(T.w12 + 0.04, 'reveal'); cue(T.w12 + 0.04, 'tap', 0.5); ev(T.sed, 'step');
    cue(T.s8 - 0.9, 'riser_soft', 0.5); cue(T.s8, 'whoosh_through', 0.85, { peak: true, prio: 4.5 }); cue(T.up + 0.22, 'tap', 0.5); ev(T.up + 0.22, 'drop');
    for (let i = 0; i < 3; i++) cue(T.type + i * 0.13, 'key', 0.55); ev(T.type, 'type'); ev(T.type + 0.26, 'type');
    cue(T.send, 'tap', 0.6); ev(T.send, 'pop'); cue(T.send + 0.14, 'shimmer_soft', 0.4);
    for (const P of phrases) P.ls.forEach((l) => { if (l.key && P.Li !== 8) cue(l.t + 0.09, 'tick_soft', 0.34); });
    ev(total - 2.3, 'hold');

    // ---------------------------------------------------------------- drawing
    function drawBg(cy, z, t) {
      const y0 = cy - 960 / z, y1 = cy + 960 / z, gr = g.createLinearGradient(0, 0, 0, CH);
      for (let i = 0; i <= 24; i++) gr.addColorStop(i / 24, rgb(colAt(y0 + (y1 - y0) * i / 24)));
      g.fillStyle = gr; g.fillRect(0, 0, CW, CH);
      const dk = deepK(cy);
      if (cy < 600) { const ysf = 960 + (0 - cy) * z, rg = g.createRadialGradient(540, ysf + 60, 0, 540, ysf + 60, 1100); rg.addColorStop(0, 'rgba(95,212,198,.3)'); rg.addColorStop(0.5, 'rgba(95,212,198,.09)'); rg.addColorStop(1, 'rgba(95,212,198,0)'); g.save(); g.beginPath(); g.rect(0, 0, CW, Math.max(0, ysf)); g.clip(); g.fillStyle = rg; g.fillRect(0, 0, CW, CH); g.restore(); }
      if (dk < 1) { // daylight from the upper left, over the sky
        const sy = 960 + (-900 - cy) * z * 0.6; const rg = g.createRadialGradient(250, sy, 0, 250, sy, 1300); rg.addColorStop(0, 'rgba(255,255,255,' + (0.9 * (1 - dk)) + ')'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, CW, CH); }
      if (dk > 0) { // in the deep: a soft light from above and a vignette; the space dims while the collagen thins, and is brighter for good once the new collagen starts
        const dim = moodDim(t), lit = moodLit(t) * (1 - 0.4 * rackK(t)), far = deepK(cy - 2600);
        const rg = g.createRadialGradient(540, 120, 0, 540, 120, 1500), la = (0.42 - 0.3 * dim - 0.16 * lit) * dk; rg.addColorStop(0, 'rgba(60,205,188,' + la + ')'); rg.addColorStop(0.55, 'rgba(40,190,172,' + la * 0.29 + ')'); rg.addColorStop(1, 'rgba(20,165,150,0)'); g.fillStyle = rg; g.fillRect(0, 0, CW, CH);
        if (dim > 0.004) { g.fillStyle = 'rgba(4,62,57,' + (0.52 * dim * dk) + ')'; g.fillRect(0, 0, CW, CH); }
        if (lit > 0.004) { g.save(); g.globalCompositeOperation = 'lighter'; const k = lit * far;
          const lg = g.createRadialGradient(540, 1220, 0, 540, 1220, 1500); lg.addColorStop(0, 'rgba(' + Math.round(26 * k) + ',' + Math.round(58 * k) + ',' + Math.round(53 * k) + ',1)'); lg.addColorStop(0.55, 'rgba(' + Math.round(16 * k) + ',' + Math.round(38 * k) + ',' + Math.round(35 * k) + ',1)'); lg.addColorStop(1, 'rgba(' + Math.round(6 * k) + ',' + Math.round(16 * k) + ',' + Math.round(15 * k) + ',1)'); g.fillStyle = lg; g.fillRect(0, 0, CW, CH);
          // three soft shafts of light through the weave
          g.filter = 'blur(46px)';
          for (let i = 0; i < 3; i++) { const x0 = 150 + i * 330 + 70 * Math.sin(t * 0.21 + i * 2.1), w0 = 90 + 40 * i, lean = 250 + 40 * Math.sin(t * 0.17 + i), sh = g.createLinearGradient(0, 520, 0, 1920); sh.addColorStop(0, 'rgba(190,255,246,0)'); sh.addColorStop(0.35, 'rgba(190,255,246,' + 0.09 * k + ')'); sh.addColorStop(1, 'rgba(190,255,246,0)');
            g.fillStyle = sh; g.beginPath(); g.moveTo(x0 - w0, 420); g.lineTo(x0 + w0, 420); g.lineTo(x0 + lean + w0 * 3.4, 1960); g.lineTo(x0 + lean - w0 * 3.4, 1960); g.closePath(); g.fill(); }
          g.restore(); }
        const vg = g.createRadialGradient(540, 860, 520, 540, 860, 1500); vg.addColorStop(0, 'rgba(5,74,67,0)'); vg.addColorStop(1, 'rgba(5,74,67,' + ((0.46 + 0.3 * dim - 0.24 * lit) * dk) + ')'); g.fillStyle = vg; g.fillRect(0, 0, CW, CH); }
    }
    function dots(x, k, cy, z, cx, t, spK) {
      const p = PAR[k], boost = 1 + (k === 2 ? 2.4 : 1.4) * (spK || 0);
      for (const q of parts) { if (q.k !== k) continue;
        const sy = 960 + PAD + (q.y - cy) * p * z + Math.sin(t * 0.5 + q.ph) * 14 * p, sx = 540 + (q.x - 540 - cx * p + Math.cos(t * 0.33 + q.ph) * 18) * (k === 2 ? 1.25 : 1);
        if (sy < -90 || sy > CH + 2 * PAD + 90) continue;
        const fade = sm((q.y - 150) / 500) * (1 - 0.55 * sm((q.y - (YD - 900)) / 700)) * boost;       // none at the surface, fewer around the net
        const r = q.r * (k === 2 ? z : 1);
        if (k === 2) { const rg = x.createRadialGradient(sx, sy, 0, sx, sy, r); rg.addColorStop(0, 'rgba(255,255,255,' + q.a * fade + ')'); rg.addColorStop(0.6, 'rgba(255,255,255,' + q.a * 0.55 * fade + ')'); rg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = rg; }
        else x.fillStyle = 'rgba(255,255,255,' + q.a * fade + ')';
        x.beginPath(); x.arc(sx, sy, r, 0, 6.2832); x.fill(); }
    }
    const sy0 = (Yw, cy, z) => 960 + PAD + (Yw - cy) * z;      // world y → the mid layer's canvas y
    const arc = (wx) => 30 * Math.pow((wx - 540) / 620, 2);        // the surface is a very gentle arc (skin, not a water line)
    function drawSurface(x, cy, z, cx, t) {
      const ys = sy0(0, cy, z); if (ys < -900 || ys > CH + 2 * PAD + 500) return;
      const X = (wx) => 540 + (wx - 540 - cx) * z;
      // the surface line: a soft dimple under the jar when it lands, a ripple that runs outwards
      const land = t - T.land, dim = (wx) => { const d = Math.abs(wx - 540); return (land > 0 ? 8 * Math.exp(-3.2 * land) * Math.cos(d * 0.021 - land * 13) * Math.exp(-d / 380) : 0) + 4 * Math.exp(-(d * d) / 46000) * sm(land * 4); };
      const top = (wx) => ys + (arc(wx) + dim(wx)) * z, bot = (wx) => ys + (arc(wx) + BAND) * z;
      const path = (f, a, b2) => { for (let wx = a; b2 > a ? wx <= b2 : wx >= b2; wx += b2 > a ? 24 : -24) x.lineTo(X(wx), f(wx)); };
      // the top layer: a pale, glassy band; below it the depth begins
      x.beginPath(); x.moveTo(X(-140), top(-140)); path(top, -140, 1220); path(bot, 1220, -140); x.closePath();
      const bg = x.createLinearGradient(0, ys, 0, ys + (BAND + 30) * z); bg.addColorStop(0, 'rgba(203,240,234,1)'); bg.addColorStop(0.5, 'rgba(160,227,218,1)'); bg.addColorStop(1, 'rgba(118,214,203,1)'); x.fillStyle = bg; x.fill();
      // the cream's light: it runs sideways through this layer and stops at its lower edge
      const gl = sm(seg(t, T.land + 0.12, T.land + 0.7)), run = o3(seg(t, T.land + 0.15, T.land + 1.9)), hw = (60 + 600 * run), breathe = 0.88 + 0.12 * Math.sin(t * 2.3);
      if (gl > 0) { x.save(); x.beginPath(); x.moveTo(X(-140), top(-140) - 2); path(top, -140, 1220); path(bot, 1220, -140); x.closePath(); x.clip();
        const gx = X(540), gy = ys + 34 * z, rg = x.createRadialGradient(gx, gy, 0, gx, gy, hw * z); rg.addColorStop(0, 'rgba(255,255,255,' + 1 * gl * breathe + ')'); rg.addColorStop(0.45, 'rgba(255,255,255,' + 0.8 * gl * breathe + ')'); rg.addColorStop(0.8, 'rgba(255,255,255,' + 0.3 * gl + ')'); rg.addColorStop(1, 'rgba(255,255,255,0)');
        x.save(); x.translate(0, gy); x.scale(1, 0.5); x.translate(0, -gy); x.fillStyle = rg; x.fillRect(0, gy - 500 * z, CW, 1000 * z); x.restore();
        // the two fronts of light, and motes carried along
        [-1, 1].forEach((dir) => { const fx = X(540 + dir * hw * 0.82), fr = 90 * z, fg = x.createRadialGradient(fx, gy, 0, fx, gy, fr); fg.addColorStop(0, 'rgba(255,255,255,' + 0.9 * gl * (1 - run * 0.7) + ')'); fg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = fg; x.fillRect(fx - fr, gy - fr, 2 * fr, 2 * fr); });
        for (let i = 0; i < 22; i++) { const dir = i % 2 ? 1 : -1, life = (t - T.land - 0.3 - rnd(i, 62) * 1.4) * (0.42 + rnd(i, 66) * 0.3); if (life < 0) continue; const lp = life % 1, wx = 540 + dir * (30 + lp * hw * 0.92), py = ys + (arc(wx) + 16 + rnd(i, 63) * (BAND - 30) + Math.sin(life * 9 + i) * 5) * z;
          x.fillStyle = 'rgba(255,255,255,' + 0.95 * Math.sin(Math.PI * lp) * gl + ')'; x.beginPath(); x.arc(X(wx), py, (1.5 + rnd(i, 64) * 2.2) * z, 0, 6.2832); x.fill(); }
        x.restore(); }
      // the layer's lower edge (where the light stops) and its upper edge (a highlight)
      x.strokeStyle = 'rgba(255,255,255,' + (0.35 + 0.5 * gl) + ')'; x.lineWidth = 2.5 * z; x.beginPath(); x.moveTo(X(-140), bot(-140)); path(bot, -140, 1220); x.stroke();
      x.strokeStyle = 'rgba(11,127,116,.28)'; x.lineWidth = 1.5 * z; x.beginPath(); x.moveTo(X(-140), bot(-140) + 2.5 * z); path((wx) => bot(wx) + 2.5 * z, -140, 1220); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,1)'; x.lineWidth = 3.5 * z; x.beginPath(); x.moveTo(X(-140), top(-140)); path(top, -140, 1220); x.stroke();
      // the jar: it comes down, lands with a small squash, then only breathes; a soft shadow to the right (the light is upper left) and a reflection in the glassy layer
      if (!jar.complete || !jar.naturalWidth || t > T.arrive) return;
      const fp = seg(t, -0.22, T.land), fall = 1 - fp * fp, sq = land > 0 ? 0.045 * Math.exp(-8 * land) * Math.cos(land * 21) : 0, bob = Math.sin(t * 1.1) * 1.4;
      const jw = JW * z, jh = JH * z * (1 - sq), jx = X(540) - jw / 2, jy = top(540) - jh + 15 * z - fall * 230 * z + bob * z;
      [[34, 340, 0.4, 0.1], [12, 250, 0.5, 0.045]].forEach(([dx, rr, al, ky]) => { const cxs = X(540 + dx), cys = ys + 5 * z, sh = x.createRadialGradient(cxs, cys, 0, cxs, cys, rr * z * (1 + fall)); sh.addColorStop(0, 'rgba(8,84,76,' + al * (1 - fall * 0.8) + ')'); sh.addColorStop(1, 'rgba(8,84,76,0)');
        x.save(); x.translate(0, cys); x.scale(1, ky); x.translate(0, -cys); x.fillStyle = sh; x.fillRect(cxs - 700 * z, cys - 700 * z, 1400 * z, 1400 * z); x.restore(); });
      x.save(); x.beginPath(); x.moveTo(X(-140), top(-140) + 2); path((wx) => top(wx) + 2, -140, 1220); path(bot, 1220, -140); x.closePath(); x.clip(); x.globalAlpha = 0.26 * (1 - fall); x.translate(0, 2 * (top(540) + 4 * z)); x.scale(1, -1); x.drawImage(jar, jx, top(540) - jh + 15 * z, jw, jh); x.restore();
      x.save(); x.translate(X(540), jy + jh); x.rotate((fall * -5 + Math.sin(t * 0.9) * 0.22) * Math.PI / 180); x.drawImage(jar, -jw / 2, -jh, jw, jh);
      if (gl > 0) { const up = x.createLinearGradient(0, -70 * z, 0, 0); up.addColorStop(0, 'rgba(255,255,255,0)'); up.addColorStop(1, 'rgba(255,255,255,' + 0.5 * gl * breathe + ')'); x.globalCompositeOperation = 'source-atop'; x.fillStyle = up; x.fillRect(-jw / 2, -70 * z, jw, 70 * z); }
      x.restore();
    }
    function drawSheets(x, cy, z, cx, t) {
      const c0 = 960 + PAD, pF = 0.7, pN = 1.42, HW = 660;
      for (const S of SHEETS) { const dy = (S.y - cy) * z; if (Math.abs(dy) > 2700) continue;
        const yF0 = c0 + dy * pF, yN0 = c0 + dy * pN; if (Math.max(yF0, yN0) < -140 || Math.min(yF0, yN0) > CH + 2 * PAD + 140) continue;
        const below = dy > 0, mx = 540 - cx * z + (S.sx - 540) * 0.12, e = (u, p) => (14 * Math.sin(u * 2.3 + S.ph + t * 0.3) + u * HW * S.tilt) * p * z;
        const F = (u) => [mx + u * HW * pF * z, yF0 + e(u, pF)], Nn = (u) => [mx + u * HW * pN * z, yN0 + e(u, pN)], thick = 15 * z * pN * (below ? 1 : -1);
        const edge = (f, back, first, off) => { for (let i = 0; i <= 16; i++) { const u = (back ? 16 - i : i) / 8 - 1, q = f(u); x[first && i === 0 ? 'moveTo' : 'lineTo'](q[0], q[1] + (off || 0)); } };
        // the face: seen from above while the plate is below the camera (lit), from below once it has passed (in its own shade)
        x.beginPath(); edge(F, false, true); edge(Nn, true); x.closePath();
        const gr = x.createLinearGradient(0, yF0, 0, yN0);
        if (below) { gr.addColorStop(0, 'rgba(255,255,255,' + 0.05 * S.a + ')'); gr.addColorStop(1, 'rgba(255,255,255,' + 0.3 * S.a + ')'); } else { gr.addColorStop(0, 'rgba(3,80,72,' + 0.06 * S.a + ')'); gr.addColorStop(1, 'rgba(3,80,72,' + 0.36 * S.a + ')'); }
        x.fillStyle = gr; x.fill();
        // the near edge has thickness and a bright rim; the far edge and the two sides are fine lines (they converge: the plate lies in depth)
        x.beginPath(); edge(Nn, false, true); edge(Nn, true, false, thick); x.closePath(); x.fillStyle = 'rgba(214,250,245,' + 0.46 * S.a + ')'; x.fill();
        x.strokeStyle = 'rgba(3,80,72,' + 0.22 * S.a + ')'; x.lineWidth = 2 * z; x.beginPath(); edge(Nn, false, true, thick + 2.5 * z * (below ? 1 : -1)); x.stroke();
        x.strokeStyle = 'rgba(255,255,255,' + 0.95 * S.a + ')'; x.lineWidth = 3.4 * z; x.beginPath(); edge(Nn, false, true); x.stroke();
        x.strokeStyle = 'rgba(255,255,255,' + 0.5 * S.a + ')'; x.lineWidth = 1.8 * z; x.beginPath(); edge(F, false, true); x.stroke();
        [-1, 1].forEach((u) => { const a = F(u), b2 = Nn(u); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b2[0], b2[1]); x.stroke(); }); }
    }
    // the view into the volume at t: the camera, where the five points are now, and the projection onto the mid layer's canvas ([x, y, depth, scale])
    function view(t, cy, zz, cx) { const C = cam3(t), oy = sy0(YD, cy, zz), ox = 540 - cx * zz * 0.4; C.zz = zz; C.oy = oy; C.now = ANCH.map((F) => fpos(F, 0.5, t));
      C.pr = (P) => { const x = P[0] - C.p[0], y = P[1] - C.p[1], z = P[2] - C.p[2], zc = x * C.f[0] + y * C.f[1] + z * C.f[2]; if (zc < 150) return null; const k = FOC / zc * zz; return [ox + (x * C.r[0] + y * C.r[1] + z * C.r[2]) * k, oy + (x * C.d[0] + y * C.d[1] + z * C.d[2]) * k, zc, k]; };
      return C; }
    // depth of field: how far out of focus a point is decides its layer (far and soft first, the sharp ones, then the near and soft ones on top)
    const LV = [0.7, 1.7, 3.2, 5.2, 8, 12, 18], BL = [24, 15, 10, 6.5, 4.2, 2.4, 1.1, 0, 1.1, 2.4, 4.2, 6.5, 10, 15, 24];
    const COL = [[196, 236, 230], [222, 246, 241], [240, 253, 250]], WARM = [255, 210, 194];
    function drawVolume(x, C, t) {
      const zz = C.zz, rack = rackK(t), dimK = 1 - 0.55 * rack, dim = moodDim(t), lit = moodLit(t), energ = t > T.hit ? Math.exp(-0.6 * (t - T.hit)) : 0, NOW = C.now;
      const lpath = 0.42 * io(seg(t, T.path + 0.5, T.path + 1.2)) * (1 - sm(seg(t, T.hit + 0.1, T.hit + 0.9)));
      const warmOn = t > T.path + 0.4 && t < T.hit + 1.8, PU = [0, 1, 2, 3, 4].map((k) => (k ? pulse(k, t) : Math.max(pulse(0, t), lpath)));
      const runs = BL.map(() => []), tips = [];
      // every fibre is a loose bundle of three fine strands that wind around each other (slack: apart, frayed, wavy; taut: one tight cord)
      for (const F of fibres) {
        let reach = 2, growing = false;
        if (F.gen > 0) { const gq = (t - F.t0) / F.dur; if (gq <= 0) continue; reach = o3(gq) * Math.max(F.s0, 1 - F.s0) * 1.04; growing = gq < 1; }
        const wk = F.weak ? weakK(F, t) : 0, n = F.el ? 80 : 64, P = [];
        for (let i = 0; i <= n; i++) { const s = i / n, q = fpos(F, s, t), pr = C.pr(q); if (!pr) { P.push(null); continue; }
          const tau = Math.min(1, q[3]);
          let a = (F.gen > 0 ? sm((reach - Math.abs(s - F.s0)) / 0.04) : 1) * sm(s / 0.13) * sm((1 - s) / 0.13);
          if (wk) a *= 1 - 0.93 * wk * (1 - tau);
          if (F.gap != null) { const gw = gapW(F, t) * (1 - tau); if (gw > 0.002) a *= sm((Math.abs(s - F.gap) - gw) / 0.05); }
          a *= clamp(1.2 - (pr[2] - 400) / 2700, 0.1, 1) * sm((pr[2] - 150) / 280) * (0.84 + 0.16 * tau) * (1 - 0.2 * dim * (1 - tau)) * clamp(1.3 - 0.2 * pr[3], 0.5, 1);
          let warm = 0; if (warmOn) { for (let k = 0; k < 5; k++) if (PU[k] > 0) warm += PU[k] * Math.exp(-Math.hypot(q[0] - NOW[k][0], q[1] - NOW[k][1], q[2] - NOW[k][2]) / 250); if (warm > 1) warm = 1; }
          P.push([pr[0], pr[1], pr[2], pr[3], a, tau, q[4], warm]); }
        for (let j = 0; j < 3; j++) { let cur = null, key = '', prev = null;
          for (let i = 0; i <= n; i++) { const p = P[i]; if (!p) { cur = null; key = ''; prev = null; continue; }
            const qn = P[Math.min(n, i + 1)] || p, qo = P[Math.max(0, i - 1)] || p; let tx = qn[0] - qo[0], ty = qn[1] - qo[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
            const tau = p[5], k = p[3], s = i / n;
            const rho = (F.rad * (1 + 0.8 * wk) * (1 - tau) * (1 + 0.6 * Math.sin(s * 9 + F.ph + j * 2.1)) + (F.el ? 1.2 : 1.05 * F.w) * tau) * k;
            const c = Math.cos(F.ph + i * F.tw + j * 2.0944 + t * 0.4 * (1 - tau)), pt = [p[0] - ty * rho * c, p[1] + tx * rho * c];
            const bl = C.ap * Math.abs(p[2] - C.zf) / p[2] * zz; let lv = 0; while (lv < 7 && bl > LV[lv]) lv++; const b = p[2] > C.zf ? 7 - lv : 7 + lv;
            const aq = Math.round(Math.min(1, p[4] * (1 + 0.45 * p[6])) * 20) / 20, wq = Math.round(p[7] * 6), tq = tau < 0.33 ? 0 : tau < 0.75 ? 1 : 2, kk = b + '|' + aq + '|' + wq + '|' + tq;
            if (kk !== key) { cur = { F, k, a: aq, wq, tq, bump: p[6], pts: prev ? [prev, pt] : [pt] }; runs[b].push(cur); key = kk; } else { cur.pts.push(pt); cur.k = cur.k * 0.85 + k * 0.15; if (p[6] > cur.bump) cur.bump = p[6]; }
            prev = pt; } }
        if (growing) [F.s0 - reach, F.s0 + reach].forEach((s) => { if (s <= 0.01 || s >= 0.99) return; const pr = C.pr(fpos(F, s, t)); if (pr && pr[2] > 200) tips.push(pr); });
      }
      const nx = netc.getContext('2d'); nx.clearRect(0, 0, CW, CH + 2 * PAD);
      const sc = W.scratch || (W.scratch = mk(CW, CH + 2 * PAD)), sx = sc.getContext('2d'); sx.lineCap = 'butt'; sx.lineJoin = 'round';
      BL.forEach((blur, bi) => { if (!runs[bi].length) return; sx.clearRect(0, 0, CW, CH + 2 * PAD); let any = false;
        for (const r of runs[bi]) { const Q = r.pts; if (Q.length < 2 || r.a <= 0.02) continue; let lo = 1e9, hi = -1e9, xl = 1e9, xh = -1e9; for (const q of Q) { if (q[1] < lo) lo = q[1]; if (q[1] > hi) hi = q[1]; if (q[0] < xl) xl = q[0]; if (q[0] > xh) xh = q[0]; }
          if (hi < -60 || lo > CH + 2 * PAD + 60 || xh < -60 || xl > CW + 60) continue;
          sx.lineWidth = Math.min(13, Math.max(1, r.F.w * r.k * (0.74 - 0.09 * r.tq) * (1 + 0.45 * r.bump)));
          sx.strokeStyle = rgb(mixc(COL[r.tq], WARM, 0.8 * r.wq / 6), Math.min(1, r.a * dimK * (0.78 + 0.07 * r.tq) * (1 + 0.5 * r.wq / 6) * (r.F === HERO ? 1.2 : 1)));
          sx.beginPath(); sx.moveTo(Q[0][0], Q[0][1]); for (let i = 1; i < Q.length - 1; i++) sx.quadraticCurveTo(Q[i][0], Q[i][1], (Q[i][0] + Q[i + 1][0]) / 2, (Q[i][1] + Q[i + 1][1]) / 2); sx.lineTo(Q[Q.length - 1][0], Q[Q.length - 1][1]); sx.stroke(); any = true; }
        if (!any) return; const bl = (blur + rack * 10) * zz; nx.save(); if (bl > 0.3) nx.filter = 'blur(' + bl.toFixed(1) + 'px)'; nx.drawImage(sc, 0, 0); nx.restore(); });
      // a light travels at the tip of every fibre that is drawing itself in
      if (tips.length) { nx.save(); nx.globalCompositeOperation = 'lighter'; for (const p of tips) { const rr = Math.max(9, 30 * p[3]) * (1 + rack), al = clamp(1.25 - (p[2] - 400) / 2600, 0.15, 1) * dimK, rg = nx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr); rg.addColorStop(0, 'rgba(255,255,255,' + al + ')'); rg.addColorStop(0.3, 'rgba(214,255,248,' + 0.5 * al + ')'); rg.addColorStop(1, 'rgba(160,245,232,0)'); nx.fillStyle = rg; nx.beginPath(); nx.arc(p[0], p[1], rr, 0, 6.2832); nx.fill(); } nx.restore(); }
      // a calm pocket behind the type (the fibres there stay far and soft)
      nx.save(); nx.globalCompositeOperation = 'destination-out'; nx.translate(540, PAD + 420); nx.scale(1, 0.8); { const mg = nx.createRadialGradient(0, 0, 40, 0, 0, 700); mg.addColorStop(0, 'rgba(0,0,0,.97)'); mg.addColorStop(0.5, 'rgba(0,0,0,.93)'); mg.addColorStop(0.64, 'rgba(0,0,0,.64)'); mg.addColorStop(0.78, 'rgba(0,0,0,.3)'); mg.addColorStop(0.9, 'rgba(0,0,0,.1)'); mg.addColorStop(1, 'rgba(0,0,0,0)'); nx.fillStyle = mg; nx.fillRect(-700, -700, 1400, 1400); } nx.restore();
      x.drawImage(netc, 0, 0);
      x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha = Math.min(1, (0.16 + 0.2 * lit + 0.1 * energ) * dimK); x.filter = 'blur(' + (15 * zz).toFixed(1) + 'px)'; x.drawImage(netc, 0, 0); x.restore();   // the fibres' own soft light
    }
    // a small star of light (rose gold): the glint when a point of energy lands and on each of its pulses
    function glint(x, px, py, s, a) {
      if (a <= 0.01 || s < 3) return; x.save(); x.globalCompositeOperation = 'lighter'; x.translate(px, py);
      [[0, 1], [Math.PI / 2, 1], [Math.PI / 4, 0.4], [-Math.PI / 4, 0.4]].forEach(([rot, kk]) => { x.save(); x.rotate(rot); const len = s * kk, gr = x.createLinearGradient(-len, 0, len, 0); gr.addColorStop(0, 'rgba(234,181,165,0)'); gr.addColorStop(0.5, 'rgba(255,238,230,' + a + ')'); gr.addColorStop(1, 'rgba(234,181,165,0)');
        x.fillStyle = gr; x.beginPath(); x.moveTo(-len, 0); x.quadraticCurveTo(0, -s * 0.055, len, 0); x.quadraticCurveTo(0, s * 0.055, -len, 0); x.fill(); x.restore(); });
      x.restore();
    }
    function drawEnergy(x, C, t) {
      const NOW = C.now, top = PAD + 650, soft = PAD + 870, gone = 1 - sm(seg(t, T.hit + 0.1, T.hit + 0.9));
      // a fine line of light from far above down to a point (the first one is drawn on „o cale”)
      const vline = (n, h0, h1, al, wid) => { const a = C.pr([n[0], n[1] - h0, n[2]]), b = C.pr([n[0], n[1] - h1, n[2]]); if (!a || !b || b[1] < top || al <= 0.01) return;
        const end = Math.max(soft, b[1]), gr = x.createLinearGradient(0, top, 0, end); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(Math.min(1, (soft - top) / (end - top)), 'rgba(255,255,255,' + 0.6 * al + ')'); gr.addColorStop(1, 'rgba(255,255,255,' + 0.9 * al + ')');
        x.strokeStyle = gr; x.lineWidth = Math.max(1.6, wid * b[3]); x.lineCap = 'round'; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); };
      const lp = io(seg(t, T.path, T.path + 0.85)); if (lp > 0 && gone > 0) { vline(NOW[0], 3200, 3200 * (1 - lp), gone, 3);
        const p0 = C.pr(NOW[0]), ar = io(seg(t, T.path + 0.5, T.path + 1.2)) * gone; if (p0 && ar > 0.01) { const rr = 330 * Math.max(0.7, p0[3]); x.save(); x.globalCompositeOperation = 'lighter'; const rg = x.createRadialGradient(p0[0], p0[1], 0, p0[0], p0[1], rr); rg.addColorStop(0, 'rgba(255,236,226,' + 0.2 * ar + ')'); rg.addColorStop(0.45, 'rgba(200,244,236,' + 0.07 * ar + ')'); rg.addColorStop(1, 'rgba(160,240,228,0)'); x.fillStyle = rg; x.beginPath(); x.arc(p0[0], p0[1], rr, 0, 6.2832); x.fill(); x.restore(); } }   // a pool of light where the way arrives
      // the points of energy come down their lines, slow and exact, and land one after another; each lands with a glint, then pulses: a bloom that lights the fibres around it
      for (let i = 0; i < 5; i++) { const t0 = dropT(i), tl = landT(i); if (t < t0) continue;
        const n = NOW[i], q = seg(t, t0, tl), fallH = 3000 * Math.pow(1 - q, 2.4), p = C.pr([n[0], n[1] - fallH, n[2]]); if (!p) continue;
        const out = sm(seg(t, T.hit + 0.5, T.hit + 1.8)), k = p[3];
        if (i > 0 && q < 1) vline(n, 3200, fallH, 0.45 * sm(seg(t, t0, t0 + 0.3)), 2);
        if (q >= 1 && out < 1) { const age = (t - tl) % PULSE, first = t - tl < PULSE, pu = pulse(i, t), rr = (130 + 190 * (1 - Math.exp(-3.4 * age))) * k;
          x.save(); x.globalCompositeOperation = 'lighter'; const rg = x.createRadialGradient(p[0], p[1], 0, p[0], p[1], rr); rg.addColorStop(0, 'rgba(255,224,210,' + 0.42 * pu + ')'); rg.addColorStop(0.4, 'rgba(244,196,180,' + 0.16 * pu + ')'); rg.addColorStop(1, 'rgba(234,181,165,0)'); x.fillStyle = rg; x.beginPath(); x.arc(p[0], p[1], rr, 0, 6.2832); x.fill(); x.restore();
          glint(x, p[0], p[1], (first ? 170 : 74) * k * Math.exp(-age * (first ? 6 : 8)), (first ? 1 : 0.75) * (1 - out)); }
        if (i === 0 && q >= 1) continue;                                                        // the first one is the guide dot (drawn last, on top)
        drawDot(x, p[0], p[1], (0.5 + 0.55 * k) * (1 - out * 0.9), (1 - out) * sm((p[1] - PAD - 560) / 160), q < 1 ? Math.min(190, fallH * 0.13) * k : 0); }
      // the new collagen starts: a bloom of light at every point, and the tightening leaves each as a sphere (on screen, a ring that opens)
      if (t > T.hit && t < T.hit + 1.4) { const q = (t - T.hit) / 1.4; x.save(); x.globalCompositeOperation = 'lighter';
        NOW.forEach((n) => { const p = C.pr(n); if (!p) return; const r = (90 + 560 * o3(q)) * p[3], al = 0.24 * Math.pow(1 - q, 1.6), rg = x.createRadialGradient(p[0], p[1], 0, p[0], p[1], r); rg.addColorStop(0, 'rgba(214,255,248,' + al + ')'); rg.addColorStop(0.35, 'rgba(170,250,238,' + al * 0.5 + ')'); rg.addColorStop(1, 'rgba(140,240,225,0)'); x.fillStyle = rg; x.beginPath(); x.arc(p[0], p[1], r, 0, 6.2832); x.fill(); });
        x.restore();
        NOW.forEach((n) => { const p = C.pr(n); if (!p) return; const r = wave(t) * p[3]; if (r < 6 || r > 1700) return; x.strokeStyle = 'rgba(255,255,255,' + 0.3 * Math.pow(1 - q, 1.4) + ')'; x.lineWidth = 2.4; x.beginPath(); x.arc(p[0], p[1], r, 0, 6.2832); x.stroke(); }); }
    }
    // the rose gold light-dot (a soft bloom, a bright core; a tail when it falls)
    function drawDot(x, px, py, s, a, tail) {
      if (a <= 0.01 || s <= 0.01) return;
      x.save(); x.globalAlpha = a;
      if (tail > 2) { const gr = x.createLinearGradient(0, py - tail, 0, py); gr.addColorStop(0, 'rgba(234,181,165,0)'); gr.addColorStop(1, 'rgba(251,227,217,.85)'); x.strokeStyle = gr; x.lineWidth = 9 * s; x.lineCap = 'round'; x.beginPath(); x.moveTo(px, py - tail); x.lineTo(px, py); x.stroke(); }
      const bl = x.createRadialGradient(px, py, 0, px, py, 58 * s); bl.addColorStop(0, 'rgba(251,227,217,.62)'); bl.addColorStop(0.35, 'rgba(234,181,165,.26)'); bl.addColorStop(1, 'rgba(234,181,165,0)'); x.fillStyle = bl; x.beginPath(); x.arc(px, py, 58 * s, 0, 6.2832); x.fill();
      const co = x.createRadialGradient(px - 3 * s, py - 4 * s, 0, px, py, 13 * s); co.addColorStop(0, ROSE[0]); co.addColorStop(0.35, ROSE[1]); co.addColorStop(0.72, ROSE[2]); co.addColorStop(1, ROSE[3]); x.fillStyle = co; x.beginPath(); x.arc(px, py, 13 * s, 0, 6.2832); x.fill();
      x.restore();
    }
    // the ring of weeks: a glass ring with thickness; huge and cropped by the frame first, then whole
    function ringGeo(t) { const q = io(seg(t, T.s7 - 0.34, T.s7 + 0.46)), inn = ex(seg(t, T.s6 - 0.05, T.s6 + 0.75));
      return { r: lerp(900, 338, q), cx: 540, cy: lerp(1720, 900, q) + (1 - inn) * 700, rot: (1 - inn) * -0.5 + (1 - q) * Math.sin(t * 0.4) * 0.02, q, inn }; }
    function drawRing(t, yShift) {
      if (t < T.s6 - 0.1 || yShift > CH + 800) return null;
      const G = ringGeo(t); const r = G.r, cx = G.cx, cy = G.cy + yShift + Math.sin(t * 0.8) * 4, wR = lerp(40, 26, G.q);
      const ang = (k) => -Math.PI / 2 + G.rot + k / 12 * 6.2832;
      const wk = t < T.w0 ? 0 : t < T.w8 ? 8 * Math.pow(seg(t, T.w0, T.w8), 1 / 0.82) : 8 + 4 * io(seg(t, T.w8 + 0.05, T.w12));
      g.save(); g.lineCap = 'round';
      g.shadowColor = 'rgba(4,58,52,.42)'; g.shadowBlur = 46; g.shadowOffsetY = 22; g.strokeStyle = 'rgba(255,255,255,.2)'; g.lineWidth = wR; g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.stroke();
      g.shadowColor = 'transparent';
      const gl = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r); gl.addColorStop(0, 'rgba(255,255,255,.5)'); gl.addColorStop(0.5, 'rgba(255,255,255,.12)'); gl.addColorStop(1, 'rgba(255,255,255,.3)');
      g.strokeStyle = gl; g.lineWidth = wR; g.beginPath(); g.arc(cx, cy, r, 0, 6.2832); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r + wR / 2 - 1, 0, 6.2832); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.arc(cx, cy, r - wR / 2 + 1, 0, 6.2832); g.stroke();
      for (let k = 0; k < 12; k++) { const a = ang(k), big = k % 4 === 0, r0 = r - wR / 2 - (big ? 34 : 22) * (0.6 + 0.4 * (r / 338)), r1 = r - wR / 2 - 10; const on = wk >= k && k > 0 || (k === 0 && wk >= 12);
        g.strokeStyle = 'rgba(255,255,255,' + (on ? 0.95 : 0.45) + ')'; g.lineWidth = big ? 4 : 2.5; g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke(); }
      if (wk > 0.01) { // the weeks gone by: a fine bright line; from 8 to 12 the whole ring lights up (the maximum)
        g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, r, ang(0), ang(Math.min(wk, 8))); g.stroke();
        if (wk > 8) { g.shadowColor = 'rgba(255,255,255,.75)'; g.shadowBlur = 30; g.strokeStyle = '#ffffff'; g.lineWidth = wR - 6; g.beginPath(); g.arc(cx, cy, r, ang(8), ang(wk)); g.stroke(); g.shadowColor = 'transparent'; } }
      g.restore();
      const a = ang(wk); return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, wk, G, cx, cy };
    }

    // ---------------------------------------------------------------- one frame
    // where the first point is on screen once the camera has landed (the dot aims for it on the way down)
    const ARR = (() => { const C = view(T.arrive + 0.3, YD, 1, 0), p = C.pr(C.now[0]); return [p[0], p[1] - PAD]; })();
    let lastT = null;
    W.draw = (t) => {
      if (t === lastT) return; lastT = t;
      const cy = camY(t), z = camZ(t), sway = camX(t), zV = 1 + 0.1 * Math.sin(Math.PI * seg(t, T.s2 - 0.9, T.arrive + 0.1));
      const C = view(t, cy, zV, sway), cx = sway + C.f[0] * 900 * deepK(cy - 2600);   // the particles pan with the camera inside the volume
      const vel = (camY(t + 1 / 120) - camY(t - 1 / 120)) * 60;                 // world px a second
      const blurLen = Math.abs(vel) * z / 60 * 0.9;                             // a 162° shutter
      const N = clamp(Math.ceil(blurLen / 2.4), 1, 80), spK = clamp(Math.abs(vel) / 3600);   // enough sub-frames for a smooth streak (a fine line never breaks into copies)
      drawBg(cy, z, t);
      // each layer is drawn once (taller than the frame) and, when the camera is fast, laid down N times along its way
      const lay = (name, p, fn) => { const c = LAY[name], x = c.getContext('2d'); x.clearRect(0, 0, CW, CH + 2 * PAD); fn(x);
        if (N === 1) { g.drawImage(c, 0, -PAD); return; }
        const ax = acc.getContext('2d'); ax.clearRect(0, 0, CW, CH); ax.globalCompositeOperation = 'lighter'; ax.globalAlpha = 1 / N;
        for (let k = 0; k < N; k++) { const dt = ((k + 0.5) / N - 0.5) * 0.9 / 30, dy = -(camY(t + dt) - cy) * p * z; if (Math.abs(dy) < PAD) ax.drawImage(c, 0, -PAD + dy); }
        ax.globalAlpha = 1; ax.globalCompositeOperation = 'source-over'; g.drawImage(acc, 0, 0); };
      lay('far', PAR[0], (x) => dots(x, 0, cy, z, cx, t, spK));
      const inVol = t > T.s2 - 0.6 && C.oy > -2100 && C.oy < CH + 2 * PAD + 2300;
      if (cy > 500 && cy < YD - 300) lay('glass', 0.3, (x) => drawSheets(x, cy, z, sway, t));
      lay('mid', 1, (x) => { dots(x, 1, cy, z, cx, t, spK); drawSurface(x, cy, z, sway, t); if (inVol) { drawVolume(x, C, t); drawEnergy(x, C, t); } });
      lay('near', PAR[2], (x) => dots(x, 2, cy, z, cx, t, spK));
      // passing through a sheet of glass: the frame catches its light for an instant
      { let fl = 0; for (const Sh of SHEETS) fl += Math.exp(-Math.pow((Sh.y - cy) / 95, 2)); if (fl > 0.01) { g.fillStyle = 'rgba(255,255,255,' + Math.min(0.2, 0.17 * fl).toFixed(3) + ')'; g.fillRect(0, 0, CW, CH); } }
      // the ripple's light (line 6) crosses the frame with it
      if (inVol && t > T.s5 - 0.25 && t < T.s5 + 0.5) { const fp = C.pr([(front(t) - 90) / 0.92, 100, 300]); if (fp) { const xx = fp[0], wv = 320, al = 0.13 * Math.sin(Math.PI * seg(t, T.s5 - 0.25, T.s5 + 0.5));
        g.save(); g.globalCompositeOperation = 'lighter'; const gr = g.createLinearGradient(xx - wv, 0, xx + wv, 0); gr.addColorStop(0, 'rgba(200,255,248,0)'); gr.addColorStop(0.5, 'rgba(200,255,248,' + al.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(200,255,248,0)'); g.fillStyle = gr; g.fillRect(xx - wv, 0, 2 * wv, CH); g.restore(); } }
      // a little shade behind the type in the deep, so the white letters stay clear when the space brightens
      { const dkk = deepK(cy - 2600) * (1 - sm(seg(t, T.s8 - 0.5, T.s8))); if (dkk > 0.01) { const a = (0.16 + 0.34 * moodLit(t)) * dkk; g.save(); g.translate(540, 470); g.scale(1, 0.56); const rg = g.createRadialGradient(0, 0, 40, 0, 0, 660); rg.addColorStop(0, 'rgba(4,92,84,' + a.toFixed(3) + ')'); rg.addColorStop(0.6, 'rgba(4,92,84,' + (a * 0.6).toFixed(3) + ')'); rg.addColorStop(1, 'rgba(4,92,84,0)'); g.fillStyle = rg; g.fillRect(-700, -700, 1400, 1400); g.restore(); } }
      const pin = seg(t, T.up - 0.25, T.up + 0.45), pe = back(pin, 1.2), fl2 = Math.sin(t * 1.15) * 5; W.pillY = 820 + (1 - pe) * 520 + fl2;
      // the ring (it belongs to the deep: it stays behind when the camera rises)
      const yUp = (YD - cy) * z, ring = drawRing(t, t > T.s8 - 0.4 ? yUp : 0);
      // the guide dot: on the surface under the jar, ahead of the camera in the dive, on its fibre in the volume (the first point of energy), on the ring, in the send button
      let dp = null, ds = 1, da = 1, tail = 0;
      const lead = 0.075, ysurf = 960 + (2 - cy) * z, ns = C.pr(C.now[0]), nd = ns ? [ns[0], ns[1] - PAD, ns[3]] : [540, 1100, 1];
      if (t < T.sink) { dp = [540 - sway * z, ysurf + 30 * z]; da = sm(seg(t, T.land + 0.2, T.land + 0.6)); ds = 0.9 + 0.12 * Math.sin(t * 3.1); }
      else if (t < T.arrive + 0.5) { // it falls ahead of the camera (the camera's own path, a little earlier), then lands on its fibre
        const q = seg(t, T.sink, T.arrive), ld = lead * (1 - sm(seg(t, T.arrive - 0.35, T.arrive + 0.2)));
        const yRide = 960 + (camY(t + ld) - cy) * z + lerp(32 - camY(T.sink + lead), ARR[1] - 960, sm(q)), mixq = sm(seg(t, T.arrive - 0.3, T.arrive + 0.3));
        dp = [lerp(lerp(540 - sway * z, ARR[0], sm(q)), nd[0], mixq), lerp(yRide, nd[1], mixq)]; tail = Math.min(150, Math.abs(vel) * 0.03) * z * (1 - mixq); ds = lerp(1 + 0.25 * Math.sin(Math.PI * q), 0.55 + 0.5 * nd[2], mixq); }
      else if (t < T.s6 + 0.2) { dp = [nd[0], nd[1]];
        ds = (0.55 + 0.5 * nd[2]) * (1 + 0.5 * Math.exp(-5 * Math.max(0, t - landT(0))) * (t > landT(0) ? 1 : 0)) + 0.06 * Math.sin(t * 2.6);
        if (ring) { const q = io(seg(t, T.s6 - 0.2, T.s6 + 0.6)); dp = [lerp(nd[0], ring.x, q), lerp(nd[1], ring.y, q)]; ds = lerp(ds, 1.15, q); }
        // the viewfinder corners that lock on „chiar acolo”
        const vf = sm(seg(t, T.acolo, T.acolo + 0.3)) * (1 - sm(seg(t, T.hit - 0.1, T.hit + 0.35)));
        if (vf > 0.01) { const sz = (78 + 60 * (1 - ex(seg(t, T.acolo, T.acolo + 0.45))) + 90 * sm(seg(t, T.hit - 0.1, T.hit + 0.35))) * (0.45 + 0.6 * nd[2]), c = 26 * (0.6 + 0.4 * nd[2]); g.save(); g.strokeStyle = 'rgba(255,255,255,' + 0.95 * vf + ')'; g.lineWidth = 4; g.lineCap = 'round';
          [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => { const px = dp[0] + sx * sz, py = dp[1] + sy * sz; g.beginPath(); g.moveTo(px - sx * c, py); g.lineTo(px, py); g.lineTo(px, py - sy * c); g.stroke(); }); g.restore(); } }
      else if (ring && t < T.s8 - 0.2) { dp = [ring.x, ring.y]; ds = 1.15 + 0.3 * Math.exp(-6 * Math.max(0, t - T.w12)) * (t > T.w12 ? 1 : 0); }
      else { // it leaves the ring, rises with the camera and settles into the send button
        const bx = 160 + 760 - 24 - 54, by = W.pillY + 78, q = io(seg(t, T.s8 - 0.2, T.up + 0.35)); const from = ring ? [ring.x, ring.y] : [540, 600];
        dp = [lerp(from[0], bx, q), lerp(Math.min(from[1], 1500), by, q) - Math.sin(Math.PI * q) * 260]; ds = lerp(1.15, 1.9, q) * (1 + 0.25 * Math.sin(Math.PI * seg(t, T.send, T.send + 0.3))); da = 1 - sm(seg(q, 0.9, 1)); }
      if (dp) drawDot(g, dp[0], dp[1], ds, da, tail);

      // ------------------------------------------------------------ the type
      const sp = Math.abs(vel) * z;
      for (const P of phrases) {
        const el = P.el, inP = t >= P.t0 - 0.05, outP = P.out != null ? seg(t, P.out, P.out + 0.3) : 0;
        if (!inP || outP >= 1) { el.style.display = 'none'; continue; }
        el.style.display = 'block'; let moving = outP > 0;
        for (const l of P.ls) { const p = seg(t, l.t, l.t + (l.key ? 0.5 : 0.36)), e = ex(p); if (p < 1) moving = true;
          l.row.style.opacity = clamp(p * 2.4).toFixed(3);
          l.row.style.transform = l.key ? 'scale(' + (1 + (1 - e) * 0.2).toFixed(4) + ')' : 'translateY(' + ((1 - e) * 22).toFixed(2) + 'px)';
          l.row.style.filter = p < 1 ? 'blur(' + ((1 - e) * (l.key ? 18 : 8)).toFixed(2) + 'px)' : ''; }
        let y = 0, op = 1 - outP, fl = outP > 0 ? 'blur(' + (outP * 14).toFixed(2) + 'px)' : (moving ? 'blur(0px)' : '');
        if (P.o.worldY != null) { y = 960 + (P.o.worldY - cy) * z; const edge = sm((y - P.o.fadeY) / 120); op *= edge; if (sp > 260) { fblur.setAttribute('stdDeviation', '0 ' + Math.min(60, sp / 60 * 0.45).toFixed(1)); fl = 'url(#dv-blur)'; } else if (edge < 1) fl = fl || 'blur(0px)'; }
        else y = -outP * 26 + Math.sin(t * 0.9 + P.t0) * 2.5;
        if (P === pScade) y += 16 * sm(seg(t, T.scade + 0.3, T.scade + 1.2));                // the word itself sinks a little
        if (t > T.s8 - 0.4 && P.Li < 8) y += yUp;                                            // left behind when the camera rises
        el.style.transform = 'translateY(' + y.toFixed(2) + 'px)'; el.style.opacity = op.toFixed(3); el.style.filter = fl;
      }
      // the ring's number
      const showN = ring && t >= T.w0 - 0.1 && t < T.s8 + 0.4, rise = t > T.s8 - 0.4 ? yUp : 0;
      rtx.style.display = showN ? 'block' : 'none'; rtx.style.filter = showN && (t < T.w0 + 0.7 || rise !== 0 || (t > T.sed - 0.1 && t < T.sed + 0.45)) ? 'blur(0px)' : '';
      if (showN) { const wkI = Math.max(1, Math.min(12, Math.floor(ring.wk + 0.0001))), done = t >= T.w12, inq = ex(seg(t, T.w0 - 0.1, T.w0 + 0.4)), mv = inq < 1 || rise !== 0;
        const txt = done ? '8-12' : String(ring.wk < 8 ? wkI : Math.min(wkI, 11)); if (num.textContent !== txt) num.textContent = txt;
        const pop = done ? 1 + 0.1 * Math.exp(-7 * (t - T.w12)) * Math.cos(16 * (t - T.w12)) : 1 + 0.035 * Math.exp(-14 * (ring.wk - Math.floor(ring.wk)));
        num.style.transform = 'translateX(-50%) translateY(' + (rise + (1 - inq) * 30).toFixed(2) + 'px) scale(' + pop.toFixed(4) + ')'; num.style.opacity = inq.toFixed(3); num.style.filter = mv ? 'blur(' + ((1 - inq) * 10).toFixed(2) + 'px)' : '';
        const uq = ex(seg(t, T.w0 + 0.1, T.w0 + 0.6)); unit.style.transform = 'translateX(-50%) translateY(' + (rise + (1 - uq) * 22).toFixed(2) + 'px)'; unit.style.opacity = uq.toFixed(3); unit.style.filter = uq < 1 || rise ? 'blur(' + ((1 - uq) * 8).toFixed(2) + 'px)' : '';
        const sq = ex(seg(t, T.sed - 0.05, T.sed + 0.4)); sub.style.transform = 'translateX(-50%) translateY(' + (rise + (1 - sq) * 16).toFixed(2) + 'px)'; sub.style.opacity = sq.toFixed(3); sub.style.filter = sq < 1 || rise ? 'blur(' + ((1 - sq) * 6).toFixed(2) + 'px)' : ''; }
      // the comment pill: it floats in the daylight; the word is typed on the voice; the dot is the send button
      pill.style.display = t > T.up - 0.3 ? 'block' : 'none';
      if (t > T.up - 0.3) { const press = Math.exp(-9 * Math.max(0, t - T.send)) * (t > T.send ? 1 : 0);
        pill.style.transform = 'translateY(' + ((1 - pe) * 520 + fl2).toFixed(2) + 'px) perspective(1600px) rotateX(' + (6 * (1 - pe) + 2.2 + Math.sin(t * 0.8) * 0.8).toFixed(2) + 'deg) rotateY(' + (Math.sin(t * 0.6) * 1.2).toFixed(2) + 'deg) scale(' + (1 - 0.025 * press).toFixed(4) + ')';
        pill.style.opacity = clamp(pin * 3).toFixed(3); pill.style.filter = pin < 1 ? 'blur(' + ((1 - pin) * 8).toFixed(2) + 'px)' : '';
        const n = clamp(Math.floor((t - T.type) / 0.13) + 1, 0, 3), typed = t < T.type ? '' : '360'.slice(0, n), caret = t < T.send && (t < T.type || n < 3 || Math.floor(t * 2.4) % 2 === 0);
        const html = (typed ? esc(typed) : '<span style="color:#9bb0ad;font-weight:540;font-size:40px;letter-spacing:-.01em">Adaugă un comentariu…</span>') + (caret && typed ? '<i style="display:inline-block;width:5px;height:62px;margin-left:6px;border-radius:2px;background:#14a596;vertical-align:-9px"></i>' : '');
        if (ptxt._h !== html) { ptxt._h = html; ptxt.innerHTML = html; }
        const sq = sm(seg(t, T.send, T.send + 0.25)); sd.style.background = 'rgb(' + mixc([255, 255, 255], [20, 165, 150], sq).join(',') + ')'; sd.style.transform = 'scale(' + (1 + 0.12 * press).toFixed(4) + ')';
        ck.style.strokeDashoffset = (1 - io(seg(t, T.send + 0.05, T.send + 0.4))).toFixed(3);
        const dq = io(seg(t, T.s8 - 0.2, T.up + 0.35)); sdot.style.opacity = (sm(seg(dq, 0.9, 1)) * (1 - sq)).toFixed(3); sdot.style.transform = 'scale(' + (1 + 0.12 * Math.sin(t * 3) + 0.5 * press).toFixed(3) + ')'; }
      grain.style.transform = 'translate(' + Math.floor(rnd(Math.floor(t * 15), 91) * 256) + 'px,' + Math.floor(rnd(Math.floor(t * 15), 92) * 256) + 'px)';
      cv.style.transform = 'translateZ(0)'; cv.style.opacity = (0.999 + 0.001 * Math.sin(t * 40)).toFixed(4);
    };
    return W;
  }
  TYPES.forEach((tp) => { V[tp] = (ctx) => { const w = build(); ctx.tick(w.draw); }; });
})();
