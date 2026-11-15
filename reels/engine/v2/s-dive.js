// Centrul360 reels v2: "the dive" (v2-crema-straturi, 15.11). One continuous camera journey, no cuts: a cream jar
// touches the skin's surface (the glow stays in the top layer), the camera dives down through the depth (one long
// vertical move: parallax layers, real motion blur by sub-frame accumulation, depth of field), led by a small rose gold
// light-dot, to a vast net of fibres drawn in perspective: sparse and slack, then points of energy arrive, the net
// pulls taut and new fibres weave in; a glass ring counts the weeks (8-12); the camera rises back into daylight for
// the comment pill that types "360".
// The whole reel is one world, built once by the first shot (R.shots gives every line's time); the engine's shots are
// only its clock: each line is a shot ("dv-*") whose "transition" is the name of a camera move the world itself makes
// (dive, settle, pull-back, descend, rise, rack-focus, orbit, ascend), its fastest moment on the cut (where the engine
// puts the whoosh). The world is a ".shot" too, so check2.cjs measures its text against the safe zone.
// Only what the site says is labelled (riduri-linii-fine.html): „la suprafață”, „straturile profunde”, „colagen”,
// „elastină”, „colagen nou”, „8-12 săptămâni”. No layer names, no depths.
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, lerp, E, h, esc } = R;
  const TYPES = ['dv-surface', 'dv-plunge', 'dv-fibres', 'dv-path', 'dv-energy', 'dv-lift', 'dv-dial', 'dv-weeks', 'dv-comment'];
  ['dive', 'settle', 'pull-back', 'descend', 'rise', 'rack-focus', 'orbit', 'ascend'].forEach((n) => { R.TR[n] = { dur: 0.5, in() {}, out() {} }; });

  const CW = 1080, CH = 1920, PAD = 260;
  const YD = 5400;            // the deep: the net's anchor (world y); the surface is world y 0
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
    T.s1 = S[1]; T.sink = wt(L[1], /^mai$/i, L[1].t0 + 1.5) - 0.12; T.s2 = S[2]; T.arrive = T.s2 + 0.86;
    T.weak = wt(L[2], /^tot$/i, L[2].t0 + 1.6); T.scade = wt(L[2], /^fermitatea$/i, L[2].t0 + 3.6);
    T.s3 = S[3]; T.path = wt(L[3], /^cale$/i, L[3].t0 + 0.9) - 0.35; T.acolo = wt(L[3], /^chiar$/i, L[3].t0 + 1.7);
    T.s4 = S[4]; T.energy = wt(L[4], /^duc$/i, L[4].t0 + 1.7); T.exact = wt(L[4], /^exact$/i, L[4].t0 + 3.1);
    T.hit = wt(L[4], /^pornesc$/i, L[4].t0 + 4.8) + 0.12; T.nou = wt(L[4], /^colagen$/i, L[4].t0 + 5.9);
    T.s5 = S[5]; T.s6 = S[6]; T.s7 = S[7];
    T.w0 = T.s7 + 0.35; T.w8 = wt(L[7], /^opt$/i, L[7].t0 + 3.9) + 0.22; T.w12 = wt(L[7], /^douăsprezece$/i, L[7].t0 + 4.6) + 0.3; T.sed = wt(L[7], /^ședință/i, L[7].t0 + 5.6) - 0.28;
    T.s8 = S[8]; T.up = T.s8 + 0.5; T.type = wt(L[8], /^trei$/i, L[8].t0 + 3.0); T.send = wt(L[8], /^comentarii/i, L[8].t0 + 4.2) + 0.18;
    W.T = T;
    shots[4].revealAt = T.hit;             // the payoff: the energy arrives (the engine's riser and impact land here)
    shots[8].resolveAt = T.send;           // the resolving moment: the comment is sent

    // ---------------------------------------------------------------- the camera (world y at the frame's centre, zoom, a slow sway)
    const diveE = profile((T.s2 - T.sink) / (T.arrive - T.sink), 2.6, 1.9);
    const upE = profile(0.42, 2.4, 2.2);
    const Y0 = -140, Y1 = 330, YSKY = -640;
    function camY(t) {
      if (t < T.sink) return Y0 + (Y1 - Y0) * io(seg(t, T.s1 - 0.32, T.s1 + 0.36)) - 16 * sm(seg(t, 0, T.s1)) * (1 - io(seg(t, T.s1 - 0.32, T.s1 + 0.36)));
      if (t < T.arrive + 1.2) { const q = seg(t, T.arrive, T.arrive + 1.2); return Y1 + (YD - Y1) * diveE(seg(t, T.sink, T.arrive)) + (t > T.arrive ? 34 * Math.exp(-4.2 * q * 1.2) * Math.sin(7.5 * q * 1.2) : 0); }
      let y = YD;
      y += -300 * io(seg(t, T.s3 - 0.34, T.s3 + 0.4)) + 440 * io(seg(t, T.s4 - 0.3, T.s4 + 0.42)) - 140 * io(seg(t, T.hit + 0.2, T.hit + 2.2));
      y += -70 * (back(seg(t, T.s5 - 0.2, T.s5 + 0.5), 2.2));
      y += 70 * io(seg(t, T.s6 - 0.3, T.s6 + 0.4));
      if (t > T.s8 - 0.4) y += (YSKY - YD) * upE(seg(t, T.s8 - 0.4, T.s8 + 0.55));
      return y;
    }
    function camZ(t) {
      let z = 1 + 0.035 * sm(seg(t, 0, T.s1)) - 0.035 * io(seg(t, T.s1 - 0.3, T.s1 + 0.4));
      z += 0.1 * Math.sin(Math.PI * seg(t, T.s2 - 0.7, T.arrive + 0.1));                      // a push through the fastest part of the dive
      z += 0.05 * sm(seg(t, T.arrive, T.s3)) - 0.21 * io(seg(t, T.s3 - 0.34, T.s3 + 0.4));     // settle, then the pull-back
      z += 0.4 * io(seg(t, T.s4 - 0.3, T.exact + 0.2)) - 0.26 * io(seg(t, T.hit + 0.15, T.hit + 2.3)); // in with the energy, out on the new net
      z += 0.06 * back(seg(t, T.s5 - 0.2, T.s5 + 0.55), 2.4) - 0.1 * io(seg(t, T.s6 - 0.3, T.s6 + 0.5));
      z += 0.04 * sm(seg(t, T.s6, T.s8));
      z -= 0.08 * io(seg(t, T.s8 - 0.4, T.up)); z += 0.03 * sm(seg(t, T.up, total));
      return z;
    }
    const camX = (t) => 14 * Math.sin(t * 0.37 + 1) + 8 * Math.sin(t * 0.83);
    const deepK = (y) => clamp((y - 900) / 1800);   // 0 near the surface, 1 in the deep (for the light)

    // ---------------------------------------------------------------- the DOM: one root (a ".shot": the checks see its text), canvases, type
    const world = document.getElementById('world');
    const root = h('div', 'shot dv-world'); world.insertBefore(root, world.firstChild);
    root.style.cssText = 'display:block;opacity:1;z-index:-1;overflow:hidden;background:#fff';
    h('style', null, '#sweep,#flash{display:none!important}.dv-world .tx{left:0;width:1080px;text-align:center;white-space:nowrap;color:#12201f;font:640 80px/1.08 ' + SANS + ';letter-spacing:-.035em}' +
      '.dv-world .tx .w{display:inline-block;margin:0;transform-origin:50% 62%;will-change:auto}.dv-world .tx .k{font:italic 470 1.5em/0.9 ' + SERIF + ';letter-spacing:-.02em;margin:0 .06em}' +
      '.dv-world .tx.dk{color:rgba(255,255,255,.9)}.dv-world .tx.dk .k{color:#fff}.dv-world .tx.lt .k{color:#0b7f74}.dv-world .ln{display:block;width:max-content;margin:0 auto}', root);
    root.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute"><defs><filter id="dv-blur" x="-5%" y="-60%" width="110%" height="220%"><feGaussianBlur stdDeviation="0 0"/></filter></defs></svg>');
    const fblur = root.querySelector('#dv-blur feGaussianBlur');
    const cv = mk(CW, CH); cv.style.cssText = 'position:absolute;left:0;top:0'; root.appendChild(cv);
    const g = cv.getContext('2d');
    const LAY = { far: mk(CW, CH + 2 * PAD), mid: mk(CW, CH + 2 * PAD), near: mk(CW, CH + 2 * PAD) }, acc = mk(CW, CH), netc = mk(CW, CH + 2 * PAD);
    const jar = new Image(); jar.src = R.ROOT + '/reels/scripts/' + R.script.id + '/objects/jar.png'; root.appendChild(Object.assign(jar, { style: 'display:none' }));
    const JW = 430, JH = JW * 398 / 488;
    // film grain: a small tile, moved every other frame (it also dithers the long gradients)
    const grain = h('div', null, null, root); { const c = mk(256, 256), x = c.getContext('2d'), im = x.createImageData(256, 256); let s = 987654321;
      for (let i = 0; i < im.data.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; const v = (s >> 9) & 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } x.putImageData(im, 0, 0);
      grain.style.cssText = 'position:absolute;inset:-256px;background:url(' + c.toDataURL() + ');opacity:.05;mix-blend-mode:overlay;pointer-events:none;z-index:6'; }

    // ---------------------------------------------------------------- particles (three depths), the sheets on the way down
    const parts = [];
    for (let i = 0; i < 250; i++) { const k = i < 130 ? 0 : i < 206 ? 1 : 2; const yy = 240 + Math.pow(rnd(i, 2), 0.85) * (YD + 600);
      parts.push({ k, x: -160 + rnd(i, 1) * 1400, y: yy, r: k === 0 ? 1.6 + rnd(i, 3) * 2.6 : k === 1 ? 1.4 + rnd(i, 3) * 2.4 : 22 + rnd(i, 3) * 44, a: k === 0 ? 0.16 + rnd(i, 4) * 0.26 : k === 1 ? 0.3 + rnd(i, 4) * 0.4 : 0.05 + rnd(i, 4) * 0.08, ph: rnd(i, 5) * 6.28 }); }
    const PAR = [0.5, 1, 1.9];
    // the layers on the way down („straturile”): thin, translucent, gently waved sheets the camera passes through
    const SHEETS = [1150, 1760, 2380, 3000, 3620].map((y, i) => ({ y, ph: rnd(i, 81) * 6.28, a: 0.5 + rnd(i, 82) * 0.3, k: 0.0036 + rnd(i, 83) * 0.002 }));

    // ---------------------------------------------------------------- the net (perspective: u across, v into the depth)
    const NET = { yH: -386, k: 946, per: 1.9, wide: 1150 };
    const proj = (u, v, hgt, A) => { const d = 1 / (1 + v * NET.per); return [A.x + u * NET.wide * d * A.z, A.y + (NET.yH + NET.k * d - hgt * d) * A.z, d]; };
    const threads = [];
    // two diagonal families cross into diamonds (a hammock, not a grid): u = c ± KD·(v − V0); c on a regular step
    const KD = 1.6, V0 = 0.4;
    const add = (fam, c0, gen, i) => { const c = c0 + (gen < 2 && [0, 1, -1].includes(c0) ? 0 : (rnd(i, 17) - 0.5) * (gen === 2 ? 0.12 : 0.2)); threads.push({ fam, c, gen, ph: rnd(i, 11 + gen) * 6.28, tw: 0.4 * (0.85 + rnd(i, 13) * 0.3), rad: 10 + rnd(i, 15) * 8, w: gen === 0 ? 1 : gen === 1 ? 0.9 : 0.66,
      weak: gen === 0 && ![0, 1, -1].includes(c0) && rnd(i, fam === 'A' ? 21 : 23) > 0.5, wd: rnd(i, 31), bow: (rnd(i, 33) - 0.5) * 0.1 }); };
    let ti = 0;
    for (let c = -4.5; c <= 4.5001; c += 0.5) { add('A', c, 0, ti++); add('B', c, 0, ti++); }
    for (let c = -4.25; c <= 4.2501; c += 0.5) { add('A', c, 1, ti++); add('B', c, 1, ti++); }
    for (let c = -4.375; c <= 4.3751; c += 0.25) { add('A', c, 2, ti++); add('B', c, 2, ti++); }
    // the five points where the energy arrives: crossings of the old weave (the centre one is where the guide dot rests)
    const NODES = [[0, 0.4], [-0.5, 0.0875], [0.5, 0.0875], [-0.5, 0.7125], [0.5, 0.7125]];
    const dist = (u, v) => { let m = 9; for (const n of NODES) { const dd = Math.hypot(u - n[0], (v - n[1]) * 2.1); if (dd < m) m = dd; } return m; };
    const bump = (u, v) => Math.exp(-(u * u) / 1.5) * Math.pow(Math.sin(Math.PI * clamp((v + 0.35) / 1.9)), 1.2);
    const wave = (t) => (t - T.hit) * 2.3;                                // how far the tightening has travelled (net units)
    const tension = (u, v, t) => spring((wave(t) - dist(u, v)) / 2.1, 4.4, 5.6);
    const sagAmp = (t) => 170 + 150 * sm(seg(t, T.weak, T.scade + 0.9)) + 26 * Math.exp(-3 * Math.max(0, t - T.arrive)) * Math.cos(9 * (t - T.arrive)) * (t > T.arrive ? 1 : 0);
    const lift = (t) => 52 * back(seg(t, T.s5 - 0.1, T.s5 + 0.6), 2.6) * (1 - 0.0 * t);
    function height(u, v, t, th) {
      const tau = t > T.hit ? tension(u, v, t) : 0, tc = Math.min(1, tau);
      let hgt = -sagAmp(t) * bump(u, v) * (1 - tau) + (96 * tc + lift(t)) * bump(u * 0.62, v * 0.75);          // slack: a hammock; taut: a low, lifted dome
      hgt += 7 * tc * Math.sin(t * 1.25 + u * 1.9 + v * 3.1);                                                 // it breathes
      if (th) hgt += 20 * Math.sin((u + v * 2) * 3.1 + th.ph + t * 0.7) * (1 - 0.82 * tc) * (0.4 + 0.6 * bump(u * 0.5, v));
      if (t > T.s5 - 0.1) hgt += 12 * Math.exp(-2.4 * (t - T.s5 + 0.1)) * Math.sin(10 * (t - T.s5) - dist(u, v) * 4.5);   // the snap's ripple
      return hgt;
    }
    const gen2 = (th, t) => clamp((t - T.s6 - 0.3 - th.wd * (T.w12 - T.s6 - 0.6)) / 0.9);   // the third weave: all through the weeks
    // a thread's points on screen: [x, y, d, alpha]
    function threadPts(th, t, A) {
      const out = [], n = 84, dir = th.fam === 'A' ? 1 : -1;
      for (let i = 0; i <= n; i++) {
        const v = -0.3 + 2.15 * Math.pow(i / n, 1.3); let u = th.c + dir * KD * (v - V0);
        const tau = t > T.hit ? Math.min(1, tension(u, v, t)) : 0;
        u += (0.05 * Math.sin(v * 6 + th.ph + t * 0.5) + th.bow * Math.sin(v * 2.2 + th.ph)) * (1 - 0.7 * tau);   // slack: every fibre wanders a little
        const p = proj(u, v, height(u, v, t, th), A);
        let a = 1;
        if (th.gen === 1) a = sm((wave(t) - dist(u, v) - 0.1) / 0.5);
        else if (th.gen === 2) { const q = gen2(th, t); a = sm((q * 3.6 - Math.hypot(u, (v - V0) * 2)) / 0.7); }
        else if (th.weak) a = 1 - 0.9 * sm(seg(t, T.weak + th.wd * 1.3, T.weak + th.wd * 1.3 + 0.9)) * (1 - tau);
        a *= sm((1.78 - v) / 0.6) * sm((4.3 - Math.abs(u)) / 0.8);                           // the far end and the sides melt into the haze
        p.push(a, tau); out.push(p);
      }
      return out;
    }

    // ---------------------------------------------------------------- type: phrases of key words, exactly when they are said
    // "text|sync": the word shown | the spoken word it comes in on; *key* words in the italic serif
    const phrases = [];
    function phrase(Li, lines, o) {
      const el = h('div', 'tx ' + (o.dk ? 'dk' : 'lt'), null, root); el.style.cssText = 'position:absolute;top:' + o.y + 'px;font-size:' + (o.size || 80) + 'px;z-index:5';
      if (o.q) el.dataset.q = '1';
      const P = { el, ws: [], out: o.out, o, Li }; let last = -1; const LW = L[Li].wv;
      const nrm = (x) => x.toLowerCase().replace(/[^a-zăâîșț0-9-]/g, '');
      lines.forEach((ln) => { const row = h('span', 'ln', null, el);
        ln.split(/(\*[^*]+\*)/).forEach((part) => { if (!part) return; const key = /^\*/.test(part);
          part.replace(/\*/g, '').split(/\s+/).filter(Boolean).forEach((tok) => { const [txt, sync] = tok.split('|');
            const want = nrm(sync || txt); let k = LW.findIndex((x, i) => i > last && (sync ? nrm(x.w).startsWith(want) : nrm(x.w) === want)); if (k < 0) k = last; else last = k;
            const s = h('span', 'w' + (key ? ' k' : ''), esc(txt), row); row.appendChild(document.createTextNode(' '));
            P.ws.push({ s, key, t: Math.min((k >= 0 ? LW[k].t : L[Li].t0) - 0.07 + (o.dt || 0), o.cap != null ? o.cap + P.ws.length * 0.05 : 1e9) }); }); }); });
      let fs = o.size || 80; const lns = [...el.querySelectorAll('.ln')]; while (fs > 44 && lns.some((x) => x.offsetWidth > 756)) { fs -= 2; el.style.fontSize = fs + 'px'; }
      P.t0 = P.ws[0].t; phrases.push(P); return P;
    }
    const TOP = 372;
    phrase(0, ['Crema ta de față', 'lucrează doar', 'la *suprafață*'], { y: 0, worldY: -140 + 286 - 960, fadeY: 120, out: T.s1 + 0.5, q: 1, size: 90, cap: T.s1 - 1.25 });
    phrase(1, ['Fermitatea pielii', 'se hotărăște', '*mai|mai jos|jos*'], { y: 0, dk: 1, out: T.s2 - 0.05, worldY: 330 + 30, fadeY: 250, size: 84 });
    phrase(1, ['în *straturile*', '*profunde*'], { y: TOP - 30, dk: 1, out: wt(L[2], /^pielea$/i) - 0.1, size: 84 });
    phrase(2, ['tot mai puțin', '*colagen* și *elastină*'], { y: TOP - 20, dk: 1, out: T.scade - 0.25, size: 84 });
    const pScade = phrase(2, ['fermitatea *scade*'], { y: TOP + 30, dk: 1, out: T.s3 - 0.3, size: 86 });
    phrase(3, ['există totuși', 'o *cale*'], { y: TOP - 40, dk: 1, out: T.acolo - 0.2, size: 86 });
    phrase(3, ['chiar *acolo*'], { y: TOP + 20, dk: 1, out: T.s4 - 0.3, size: 90 });
    phrase(4, ['*HIFU*', 'și *radiofrecvența*'], { y: TOP - 70, dk: 1, out: T.energy - 0.15, size: 80 });
    phrase(4, ['energie *controlată*'], { y: TOP + 20, dk: 1, out: T.exact - 0.15, size: 84 });
    phrase(4, ['exact în *straturile*', '*profunde*'], { y: TOP - 30, dk: 1, out: T.hit - 0.3, size: 80 });
    phrase(4, ['*colagen|colagen nou|nou*'], { y: TOP + 10, dk: 1, out: T.s5 - 0.3, size: 100 });
    phrase(5, ['un efect de *fermitate*', 'se simte *imediat*'], { y: TOP - 30, dk: 1, out: T.s6 - 0.3, size: 72 });
    phrase(6, ['rezultatul adevărat', 'vine mai *târziu*'], { y: TOP - 50, dk: 1, out: T.s7 - 0.3, size: 80 });
    phrase(7, ['are nevoie de *timp*'], { y: 300, dk: 1, out: wt(L[7], /^efectul$/i) - 0.2, size: 64 });
    phrase(7, ['efectul *maxim*'], { y: 300, dk: 1, out: T.s8 - 0.45, size: 64 });
    phrase(8, ['ce i se potrivește', '*pielii tale*'], { y: 372, out: wt(L[8], /^scrie$/i) - 0.2, size: 88 });
    phrase(8, ['scrie *360|trei*', 'în comentarii'], { y: 352, size: 98 });
    // the ring's own text: the weeks counted, then „8-12 săptămâni” (the site: „maxim la 8-12 săptămâni de la ședință”)
    const rtx = h('div', 'tx dk', '<div class="n"></div><div class="u"><span class="k" style="font-size:1em">săptămâni</span></div><div class="s">de la ședință</div>', root); rtx.style.cssText = 'position:absolute;top:0;height:0;z-index:5;color:#fff';
    const num = rtx.querySelector('.n'), unit = rtx.querySelector('.u'), sub = rtx.querySelector('.s');
    num.style.cssText = 'position:absolute;left:540px;width:max-content;top:742px;font:760 204px/1 ' + SANS + ';letter-spacing:-.06em;font-variant-numeric:tabular-nums';
    unit.style.cssText = 'position:absolute;left:540px;width:max-content;top:946px;font-size:70px'; sub.style.cssText = 'position:absolute;left:540px;width:max-content;top:1046px;font:560 36px/1 ' + SANS + ';letter-spacing:.01em;color:rgba(255,255,255,.84)';
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
    cue(T.sink, 'dot', 0.5); ev(T.sink, 'step'); cue(T.s2 - 1.5, 'riser_soft', 0.5); cue(T.s2, 'whoosh_through', 0.9, { peak: true, prio: 4.5 }); cue(T.s2 + 0.12, 'subdrop', 0.7, { prio: 4 });   // the dive: a deep fly-through whoosh, its peak on the fastest frame, and a falling sub
    cue(T.arrive - 0.06, 'tap', 0.5); ev(T.arrive - 0.06, 'stop'); cue(T.arrive + 0.1, 'shimmer_soft', 0.4);
    cue(T.weak, 'tick_soft', 0.4); ev(T.weak, 'step'); ev(T.scade, 'step'); cue(T.scade, 'tick_soft', 0.45);
    cue(T.path, 'riser_soft', 0.4); ev(T.path + 0.2, 'step'); cue(T.acolo + 0.06, 'dot', 0.55); ev(T.acolo + 0.06, 'reveal');
    NODES.forEach((n, i) => { const tt = T.exact - 0.08 + i * 0.11; cue(tt, i ? 'tick_soft' : 'tap', i ? 0.5 : 0.5); ev(tt, 'step'); });
    SHEETS.forEach((Sh, i) => { let a = T.sink, b = T.arrive; for (let k = 0; k < 30; k++) { const m = (a + b) / 2; if (camY(m) < Sh.y) a = m; else b = m; } Sh.t = a; cue(a, 'tick_soft', 0.3 + 0.05 * i); ev(a, 'step'); });
    ev(T.energy, 'step'); cue(T.energy, 'riser_soft', 0.35);
    cue(T.hit + 0.5, 'sparkle', 0.35); ev(T.nou, 'step'); ev(T.hit + 1.2, 'step');
    cue(T.s5 + 0.14, 'shimmer_soft', 0.5); ev(T.s5 + 0.3, 'step');
    ev(T.s6 + 0.25, 'reveal'); cue(T.s6 + 0.25, 'tap', 0.45);
    const weekAt = (k) => (k <= 8 ? T.w0 + (T.w8 - T.w0) * Math.pow(k / 8, 0.82) : T.w8 + (T.w12 - T.w8) * (k - 8) / 4);
    for (let k = 1; k <= 12; k++) { cue(weekAt(k), 'tick_soft', k === 8 || k === 12 ? 0.7 : 0.42); ev(weekAt(k), 'step'); }
    cue(T.w12 + 0.12, 'shimmer_soft', 0.5); ev(T.w12 + 0.04, 'reveal'); cue(T.w12 + 0.04, 'tap', 0.5); ev(T.sed, 'step');
    cue(T.s8 - 0.9, 'riser_soft', 0.5); cue(T.s8, 'whoosh_through', 0.85, { peak: true, prio: 4.5 }); cue(T.up + 0.22, 'tap', 0.5); ev(T.up + 0.22, 'drop');
    for (let i = 0; i < 3; i++) cue(T.type + i * 0.13, 'key', 0.55); ev(T.type, 'type'); ev(T.type + 0.26, 'type');
    cue(T.send, 'tap', 0.6); ev(T.send, 'pop'); cue(T.send + 0.14, 'shimmer_soft', 0.4);
    for (const P of phrases) P.ws.forEach((w) => { if (w.key && P.Li !== 8) cue(w.t + 0.07, 'tick_soft', 0.34); });
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
      if (dk > 0) { // in the deep: a soft light from above, a vignette below and at the sides
        const rg = g.createRadialGradient(540, 120, 0, 540, 120, 1500); rg.addColorStop(0, 'rgba(60,205,188,' + (0.42 * dk) + ')'); rg.addColorStop(0.55, 'rgba(40,190,172,' + (0.12 * dk) + ')'); rg.addColorStop(1, 'rgba(20,165,150,0)'); g.fillStyle = rg; g.fillRect(0, 0, CW, CH);
        const vg = g.createRadialGradient(540, 860, 520, 540, 860, 1500); vg.addColorStop(0, 'rgba(5,74,67,0)'); vg.addColorStop(1, 'rgba(5,74,67,' + (0.46 * dk) + ')'); g.fillStyle = vg; g.fillRect(0, 0, CW, CH); }
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
      for (const S of SHEETS) { const ys = sy0(S.y, cy, z); if (ys < -260 || ys > CH + 2 * PAD + 260) continue;
        const f = (wx) => ys + (34 * Math.sin(wx * S.k + S.ph + t * 0.25) + 14 * Math.sin(wx * S.k * 2.3 + S.ph * 2)) * z, X = (wx) => 540 + (wx - 540 - cx) * z;
        const gr = x.createLinearGradient(0, ys - 40 * z, 0, ys + 300 * z); gr.addColorStop(0, 'rgba(255,255,255,' + 0.1 * S.a + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.beginPath(); x.moveTo(X(-160), f(-160)); for (let wx = -160; wx <= 1240; wx += 40) x.lineTo(X(wx), f(wx)); x.lineTo(X(1240), ys + 320 * z); x.lineTo(X(-160), ys + 320 * z); x.closePath(); x.fillStyle = gr; x.fill();
        x.strokeStyle = 'rgba(255,255,255,' + 0.5 * S.a + ')'; x.lineWidth = 2.2 * z; x.beginPath(); for (let wx = -160; wx <= 1240; wx += 40) x[wx === -160 ? 'moveTo' : 'lineTo'](X(wx), f(wx)); x.stroke(); }
    }
    const BANDS = [[1.5, 14], [1.3, 10], [1.14, 7], [1.0, 4.6], [0.89, 2.9], [0.8, 1.7], [0.72, 0.8], [0.5, 0], [0.43, 0.7], [0.37, 1.4], [0.32, 2.1], [0, 3]];   // [d from, blur px]: depth of field, the focus a third of the way in
    const bandOf = (d) => { const b = BANDS.findIndex((B) => d >= B[0]); return b < 0 ? BANDS.length - 1 : b; };
    function drawNet(x, cy, z, cx, t) {
      const ay = sy0(YD, cy, z); if (ay < -1500 || ay > CH + 2 * PAD + 900) return null;
      const A = { x: 540 - cx * z, y: ay, z };
      const rack = sm(seg(t, T.s6 - 0.25, T.s6 + 0.45)) * (1 - sm(seg(t, T.s8 - 0.4, T.s8))), dimK = 1 - 0.6 * rack;
      const energ = t > T.hit ? 0.2 + 0.8 * Math.exp(-0.6 * (t - T.hit)) : 0;
      const runs = BANDS.map(() => []), sweepAt = 500 + ((t * 310) % 2600);
      // every fibre is a loose bundle of three fine strands that twist around each other (slack: frayed and wavy; taut: one tight cord)
      for (const th of threads) { if (th.gen === 1 && t < T.hit) continue; if (th.gen === 2 && gen2(th, t) <= 0) continue;
        const pts = threadPts(th, t, A), n = pts.length, weakK = th.weak && th.gen === 0 ? sm(seg(t, T.weak + th.wd * 1.2, T.weak + th.wd * 1.2 + 0.9)) : 0;
        for (let j = 0; j < 3; j++) { let cur = null, key = '', prev = null;
          for (let i = 0; i < n; i++) { const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)]; let tx = q[0] - o[0], ty = q[1] - o[1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
            const tau = p[4], rho = ((th.rad * (1 + 0.7 * weakK)) * (1 - tau) + 5.2 * tau) * p[2] * z * th.w, ang = th.ph + i * th.tw + j * 2.0944 + t * 0.4 * (1 - tau), c = Math.cos(ang);
            const pt = [p[0] - ty * rho * c, p[1] + tx * rho * c], b = bandOf(p[2]), aL = Math.round(p[3] * 10) / 10, k = b + '|' + aL;
            if (k !== key) { cur = { th, d: p[2], a: aL, tau, pts: prev ? [prev, pt] : [pt] }; runs[b].push(cur); key = k; } else { cur.pts.push(pt); cur.d = cur.d * 0.9 + p[2] * 0.1; cur.tau = cur.tau * 0.8 + tau * 0.2; }
            prev = pt; } } }
      const nx = netc.getContext('2d'); nx.clearRect(0, 0, CW, CH + 2 * PAD);
      const sc = W.scratch || (W.scratch = mk(CW, CH + 2 * PAD)), sx = sc.getContext('2d'); sx.lineCap = 'butt'; sx.lineJoin = 'round';
      BANDS.forEach((B, bi) => { if (!runs[bi].length) return; sx.clearRect(0, 0, CW, CH + 2 * PAD);
        for (const r of runs[bi]) { const P = r.pts; if (P.length < 2 || r.a <= 0.02) continue; let lo = 1e9, hi = -1e9; for (const q of P) { if (q[1] < lo) lo = q[1]; if (q[1] > hi) hi = q[1]; } if (hi < -40 || lo > CH + 2 * PAD + 40) continue;
          const th = r.th, d = r.d, tau = Math.min(1, r.tau), mx = (P[0][0] + P[P.length - 1][0]) / 2, my = (lo + hi) / 2 - PAD, sheen = Math.exp(-Math.pow((mx * 0.6 + my - sweepAt) / 190, 2));
          const light = (1 - 0.3 * clamp((my - 900) / 900)) * (0.86 + 0.5 * sheen * tau);
          sx.lineWidth = Math.max(1.1, th.w * (1.1 + d * 4.1) * z * (0.8 - 0.26 * tau) * (1 + 0.25 * (th.gen ? energ : 0)));
          const al = r.a * clamp(0.34 + d * 0.9, 0, 1) * (0.62 + 0.38 * tau) * dimK * light;
          sx.strokeStyle = tau < 0.5 ? 'rgba(206,244,238,' + al + ')' : 'rgba(255,255,255,' + al + ')';
          sx.beginPath(); sx.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length - 1; i++) sx.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2); sx.lineTo(P[P.length - 1][0], P[P.length - 1][1]); sx.stroke(); }
        const bl = (B[1] + rack * 11) * z; nx.save(); if (bl > 0.3) nx.filter = 'blur(' + bl.toFixed(1) + 'px)'; nx.drawImage(sc, 0, 0); nx.restore(); });
      { const hy = A.y + (NET.yH + NET.k * 0.24) * z, hz = x.createLinearGradient(0, hy - 150 * z, 0, hy + 230 * z); hz.addColorStop(0, 'rgba(120,226,212,0)'); hz.addColorStop(0.42, 'rgba(140,232,219,' + 0.3 * dimK + ')'); hz.addColorStop(1, 'rgba(120,226,212,0)'); x.fillStyle = hz; x.fillRect(0, hy - 150 * z, CW, 380 * z); }
      x.drawImage(netc, 0, 0);
      x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha = (0.34 + 0.5 * energ) * dimK; x.filter = 'blur(' + (15 * z).toFixed(1) + 'px)'; x.drawImage(netc, 0, 0); x.restore();   // the fibres' own soft light
      return A;
    }
    function drawEnergy(x, A, t) {
      if (!A) return;
      const z = A.z;
      // the way down: a fine line of light from above to the point (drawn on „o cale”), then four more for the other points
      const lp = io(seg(t, T.path, T.path + 0.85)), gone = 1 - sm(seg(t, T.hit + 0.1, T.hit + 0.9));
      if (lp > 0 && gone > 0) { const n = NODES[0], H = 3400, hNode = height(n[0], n[1], t), a = proj(n[0], n[1], hNode + H, A), b = proj(n[0], n[1], hNode + H * (1 - lp), A), yT = PAD + 650, yF = PAD + 860;
        if (b[1] > yT) { const gr = x.createLinearGradient(0, yT, 0, Math.max(yF, b[1])); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(Math.min(1, (yF - yT) / (Math.max(yF, b[1]) - yT)), 'rgba(255,255,255,' + 0.6 * gone + ')'); gr.addColorStop(1, 'rgba(255,255,255,' + 0.85 * gone + ')');
          x.strokeStyle = gr; x.lineWidth = Math.max(2, 2.6 * z * a[2]); x.beginPath(); x.moveTo(a[0], yT); x.lineTo(b[0], b[1]); x.stroke(); } }
      // the points of energy: they come down the lines, slow and exact, and land one after another
      NODES.forEach((n, i) => { const tl = T.exact - 0.08 + i * 0.11, t0 = T.energy - 0.1 + i * 0.09; if (t < t0) return;
        const q = seg(t, t0, tl), fallH = 3200 * Math.pow(1 - q, 2.4), hNode = height(n[0], n[1], t), p = proj(n[0], n[1], hNode + fallH, A);
        const out = sm(seg(t, T.hit + 0.5, T.hit + 1.8)); if (i === 0 && q >= 1) return;        // the centre one becomes the guide dot again
        drawDot(x, p[0], p[1], (i === 0 ? 1 : 0.86) * z * (0.75 + p[2] * 0.5) * (1 - out * 0.9), (1 - out) * sm((p[1] - PAD - 560) / 160), q < 1 ? Math.min(190, fallH * 0.13) * z : 0); });
      // the hit: a bloom of light at every point, then rings open on the net's plane
      if (t > T.hit && t < T.hit + 1.3) { const q = (t - T.hit) / 1.3; x.save(); x.globalCompositeOperation = 'lighter'; NODES.forEach((n) => { const p = proj(n[0], n[1], height(n[0], n[1], t), A), r = (70 + 520 * o3(q)) * z * (0.5 + p[2] * 0.7), al = 0.3 * Math.pow(1 - q, 1.6);
        const rg = x.createRadialGradient(p[0], p[1], 0, p[0], p[1], r); rg.addColorStop(0, 'rgba(210,255,247,' + al + ')'); rg.addColorStop(0.35, 'rgba(170,250,238,' + al * 0.5 + ')'); rg.addColorStop(1, 'rgba(140,240,225,0)'); x.fillStyle = rg; x.beginPath(); x.arc(p[0], p[1], r, 0, 6.2832); x.fill(); }); x.restore(); }
      if (t > T.hit) NODES.forEach((n, i) => { for (let k = 0; k < 1; k++) { const r = (t - T.hit) * 1.5; if (r <= 0 || r > 2.2) continue; const al = (1 - r / 2.2) * 0.42;
        x.strokeStyle = 'rgba(255,255,255,' + al + ')'; x.lineWidth = 2.6 * z; x.beginPath();
        for (let a = 0; a <= 48; a++) { const an = a / 48 * 6.2832, u = n[0] + Math.cos(an) * r, v = n[1] + Math.sin(an) * r / 2.3; if (v < -0.3) { continue; } const p = proj(u, v, height(u, v, t), A); x[a === 0 ? 'moveTo' : 'lineTo'](p[0], p[1]); } x.stroke(); } });
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
    let lastT = null;
    W.draw = (t) => {
      if (t === lastT) return; lastT = t;
      const cy = camY(t), z = camZ(t), cx = camX(t);
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
      let A = null;
      lay('mid', 1, (x) => { drawSheets(x, cy, z, cx, t); dots(x, 1, cy, z, cx, t, spK); drawSurface(x, cy, z, cx, t); A = drawNet(x, cy, z, cx, t); if (A) drawEnergy(x, A, t); });
      lay('near', PAR[2], (x) => dots(x, 2, cy, z, cx, t, spK));
      const pin = seg(t, T.up - 0.25, T.up + 0.45), pe = back(pin, 1.2), fl2 = Math.sin(t * 1.15) * 5; W.pillY = 820 + (1 - pe) * 520 + fl2;
      // the ring (it belongs to the deep: it stays behind when the camera rises)
      const yUp = (YD - cy) * z, ring = drawRing(t, t > T.s8 - 0.4 ? yUp : 0);
      // the guide dot: on the surface under the jar, ahead of the camera in the dive, on the net's centre, on the ring, in the send button
      let dp = null, ds = 1, da = 1, tail = 0;
      const lead = 0.075, ysurf = 960 + (2 - cy) * z;
      if (t < T.sink) { dp = [540 - cx * z, ysurf + 30 * z]; da = sm(seg(t, T.land + 0.2, T.land + 0.6)); ds = 0.9 + 0.12 * Math.sin(t * 3.1); }
      else if (t < T.arrive + 0.5) { // it falls ahead of the camera (the camera's own path, a little earlier), then lands on the net's centre
        const q = seg(t, T.sink, T.arrive), ld = lead * (1 - sm(seg(t, T.arrive - 0.35, T.arrive + 0.2)));
        const An = { x: 540 - cx * z, y: 960 + (YD - cy) * z, z }, node = proj(0, NODES[0][1], height(0, NODES[0][1], Math.max(t, T.arrive)), An);
        const off0 = 32 - camY(T.sink + lead), off1 = (node[1] - An.y) / z;
        const yRide = 960 + (camY(t + ld) + lerp(off0, off1, sm(q)) - cy) * z, mixq = sm(seg(t, T.arrive - 0.3, T.arrive + 0.3));
        dp = [lerp(540 - cx * z, node[0], mixq), lerp(yRide, node[1], mixq)]; tail = Math.min(150, Math.abs(vel) * 0.03) * z * (1 - mixq); ds = 1 + 0.25 * Math.sin(Math.PI * q); }
      else if (t < T.s6 + 0.2 && A) { const An = { x: A.x, y: A.y - PAD, z: A.z }, node = proj(0, NODES[0][1], height(0, NODES[0][1], t), An); dp = [node[0], node[1]];
        ds = (0.72 + node[2] * 0.5) * z * (1 + 0.5 * Math.exp(-5 * Math.max(0, t - T.exact + 0.08)) * (t > T.exact - 0.08 ? 1 : 0)) + 0.06 * Math.sin(t * 2.6);
        if (ring) { const q = io(seg(t, T.s6 - 0.2, T.s6 + 0.6)); dp = [lerp(node[0], ring.x, q), lerp(node[1], ring.y, q)]; ds = lerp(ds, 1.15, q); }
        // the viewfinder corners that lock on „chiar acolo”
        const vf = sm(seg(t, T.acolo, T.acolo + 0.3)) * (1 - sm(seg(t, T.hit - 0.1, T.hit + 0.35)));
        if (vf > 0.01) { const sz = (78 + 60 * (1 - ex(seg(t, T.acolo, T.acolo + 0.45))) + 90 * sm(seg(t, T.hit - 0.1, T.hit + 0.35))) * z, c = 26 * z; g.save(); g.strokeStyle = 'rgba(255,255,255,' + 0.95 * vf + ')'; g.lineWidth = 4; g.lineCap = 'round';
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
        for (const w of P.ws) { const p = seg(t, w.t, w.t + (w.key ? 0.52 : 0.36)), e = ex(p); if (p < 1) moving = true;
          w.s.style.opacity = (w.key ? clamp(p * 2.6) : clamp(p * 2.2)).toFixed(3);
          w.s.style.transform = w.key ? 'scale(' + (1 + (1 - e) * 1.25).toFixed(4) + ')' : 'translateY(' + ((1 - e) * 30).toFixed(2) + 'px)';
          w.s.style.filter = p < 1 ? 'blur(' + ((1 - e) * (w.key ? 26 : 10)).toFixed(2) + 'px)' : ''; }
        let y = 0, op = 1 - outP, fl = outP > 0 ? 'blur(' + (outP * 14).toFixed(2) + 'px)' : (moving ? 'blur(0px)' : '');
        if (P.o.worldY != null) { y = 960 + (P.o.worldY - cy) * z; const edge = sm((y - P.o.fadeY) / 120); op *= edge; if (sp > 260) { fblur.setAttribute('stdDeviation', '0 ' + Math.min(60, sp / 60 * 0.45).toFixed(1)); fl = 'url(#dv-blur)'; } else if (edge < 1) fl = fl || 'blur(0px)'; }
        else y = -outP * 26 + Math.sin(t * 0.9 + P.t0) * 2.5;
        if (P === pScade) y += 14 * sm(seg(t, T.scade + 0.3, T.scade + 1.4));                // the word itself sinks a little
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
