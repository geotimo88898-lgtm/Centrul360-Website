// Centrul360 reels v2: the logo-anchor brand piece (format xii). Second version (15.11, the owner: „alb negru cu accente
// turcoaz, logoul negru pe alb… camera shutter la schimbare de slide și swoosh-ul de la final… corelat vizualul cu auzul,
// iar la vizual mai ai mult de lucru până să fie clean”).
// The real logo (the mark + CENTRUL360.COM, brand_asset), black, never moves: centre of the upper third, on one grid
// (margins 110 px, the logo band y 540..740). Behind it the slides change on the music's beat, each one a composed still:
//   photo : a real clinic photo in true black and white (rich contrast, clean whites), full bleed, a slow push-in; the
//           logo sits on a clean white band across it; a small turquoise label (the city) in the band's corner
//   word  : white, one giant condensed turquoise word under the band, fitted to the grid
//   paper : white paper in window light (soft moving shadows)
//   glass : one turquoise glass card behind the logo, with thickness, a tilt and a travelling light
//   grid  : hairlines on the same grid, small turquoise labels with real data only
// Every slide change is a camera exposure: the new slide opens top to bottom in three frames (a focal-plane curtain), a
// mechanical shutter sounds on that frame and the frame counter in the band's corner steps. The last slide opens into
// clean white with an airy swoosh; a thin turquoise line draws under the logo; held.
//   visual: { type: "logoanchor", beatsA, beatsB, scenes: [{ kind, img, pos, city, word, bright, contrast, wipe }] }
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, E, h, esc } = R;
  const INK = '#0b0b0d', TEAL = '#14a596', TEAL2 = '#5fd4c6';
  const MX = 110, BY0 = 540, BY1 = 740, CY = 640, W = 1080, H = 1920;
  const MARK = () => R.ROOT + '/brand_asset/brand/mark.svg', WORD = () => R.ROOT + '/brand_asset/wordmark-com.png';
  // a real condensed face for the giant words (Bricolage Grotesque, width axis), loaded as soon as this file is parsed
  const FF = 'C360 Cond';
  try {
    const base = '../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-';
    [['latin', 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F'], ['latin-ext', 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+1E00-1E9F']].forEach(([n, ur]) => {
      const f = new FontFace(FF, 'url(' + base + n + '-wdth-normal.woff2)', { weight: '200 800', stretch: '75% 100%', unicodeRange: ur });
      document.fonts.add(f); f.load().catch(() => {});
    });
  } catch (e) { /* the fallback font is used */ }
  R.BR = { INK, TEAL, FF };
  const easeOut = (p) => 1 - Math.pow(1 - clamp(p), 3);
  function full(parent) { const d = h('div', null, null, parent); d.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px;overflow:hidden;background:#fff'; return d; }
  function band(d) { // the clean white band the logo sits on (a paper label on the photo: a soft shadow on both edges)
    const b = h('div', null, null, d); b.style.cssText = 'position:absolute;left:0;top:' + BY0 + 'px;width:1080px;height:' + (BY1 - BY0) + 'px;background:#fff;box-shadow:0 22px 50px -18px rgba(0,0,0,.34),0 -22px 50px -18px rgba(0,0,0,.26)';
    return b;
  }
  const SC = {
    // a real clinic photo, in true black and white
    photo(d, s) {
      const im = h('img', null, null, d); im.src = R.ROOT + '/brand_asset/' + s.img;
      im.style.cssText = 'position:absolute;left:-6%;top:-6%;width:112%;height:112%;object-fit:cover;object-position:' + (s.pos || '50% 50%') + ';filter:grayscale(1) contrast(' + (s.contrast || 1.2) + ') brightness(' + (s.bright || 1.06) + ');transform-origin:' + (s.origin || '50% 60%');
      const light = h('i', null, null, d); light.style.cssText = 'position:absolute;inset:0;background:linear-gradient(140deg,rgba(255,255,255,.16),rgba(255,255,255,0) 42%,rgba(0,0,0,.14))';
      band(d);
      const dx = s.dx != null ? s.dx : 14, dy = s.dy != null ? s.dy : -10;
      return { label: s.city || '', move: (u) => { im.style.transform = 'translate(' + (dx * u).toFixed(2) + 'px,' + (dy * u).toFixed(2) + 'px) scale(' + (1.02 + 0.09 * u).toFixed(4) + ')'; } };
    },
    // one giant condensed turquoise word under the band, fitted to the grid
    word(d, s) {
      const w = h('div', null, esc(s.word), d);
      w.style.cssText = 'position:absolute;left:' + MX + 'px;top:' + (BY1 + 70) + 'px;white-space:nowrap;font:800 400px/0.82 "' + FF + '","Inter Variable",sans-serif;font-stretch:75%;letter-spacing:-.02em;color:' + TEAL + ';transform-origin:0 0';
      const rule = h('i', null, null, d); rule.style.cssText = 'position:absolute;left:' + MX + 'px;top:' + (BY1 + 34) + 'px;width:' + (W - 2 * MX) + 'px;height:3px;background:' + INK + ';transform-origin:0 50%';
      let k0 = null;
      return { label: '', move: (u) => {
        if (k0 == null || u < 0.2) { w.style.transform = 'none'; const ww = w.getBoundingClientRect().width; if (ww > 10) k0 = (W - 2 * MX) / ww; }
        const k = (k0 || 1) * (1 + 0.035 * u); w.style.transform = 'translate(' + (-0.0175 * u * (W - 2 * MX)).toFixed(2) + 'px,' + (-10 * u).toFixed(2) + 'px) scale(' + k.toFixed(4) + ')';
        rule.style.transform = 'scaleX(' + easeOut(u / 0.3).toFixed(3) + ')';
      } };
    },
    // white paper in window light: soft shadow bars that drift
    paper(d, s) {
      d.style.background = '#fbfbfa';
      const bars = h('i', null, null, d); bars.style.cssText = 'position:absolute;left:-40%;top:-30%;width:180%;height:160%;background:repeating-linear-gradient(118deg,rgba(0,0,0,0) 0 170px,rgba(0,0,0,' + (s.soft ? 0.035 : 0.13) + ') 170px 290px);filter:blur(22px)';
      const sun = h('i', null, null, d); sun.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse 900px 700px at 22% 18%,rgba(255,255,255,.9),rgba(255,255,255,0) 70%)';
      return { label: '', move: (u) => { bars.style.transform = 'translate(' + (46 * u).toFixed(2) + 'px,' + (24 * u).toFixed(2) + 'px)'; } };
    },
    // one turquoise glass card behind the logo: thickness, a tilt, a travelling light, a real shadow
    glass(d) {
      d.style.background = 'radial-gradient(ellipse 1100px 1300px at 50% 34%,#ffffff,#eceeed 78%)';
      const scene = h('div', null, null, d); scene.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px;perspective:1700px;perspective-origin:50% ' + CY + 'px';
      const card = h('div', null, null, scene); card.style.cssText = 'position:absolute;left:' + MX + 'px;top:' + (CY - 250) + 'px;width:' + (W - 2 * MX) + 'px;height:500px;transform-style:preserve-3d';
      const sh = h('i', null, null, card); sh.style.cssText = 'position:absolute;left:6%;right:6%;top:70%;height:46%;background:rgba(6,60,54,.38);filter:blur(46px);transform:translateZ(-80px)';
      for (let i = 5; i >= 0; i--) { const l = h('i', null, null, card); l.style.cssText = 'position:absolute;inset:0;border-radius:44px;transform:translateZ(' + (-i * 4) + 'px);background:' + (i ? 'rgba(15,138,126,.55)' : 'linear-gradient(140deg,rgba(150,232,222,.92),rgba(95,212,198,.86) 45%,rgba(20,165,150,.9))') + (i ? '' : ';box-shadow:0 0 0 2px rgba(255,255,255,.75) inset,0 2px 0 rgba(255,255,255,.9) inset'); }
      const sp = h('i', null, null, card); sp.style.cssText = 'position:absolute;inset:0;border-radius:44px;overflow:hidden;transform:translateZ(1px)';
      const beam = h('i', null, null, sp); beam.style.cssText = 'position:absolute;top:-20%;left:0;width:260px;height:140%;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.55),rgba(255,255,255,0));transform:skewX(-18deg)';
      return { label: '', move: (u) => { card.style.transform = 'rotateX(' + (7 - 3 * u).toFixed(2) + 'deg) rotateY(' + (-13 + 15 * u).toFixed(2) + 'deg)'; beam.style.transform = 'translateX(' + (-300 + 1300 * u).toFixed(1) + 'px) skewX(-18deg)'; } };
    },
    // hairlines on the same grid, small turquoise labels with real data only
    grid(d) {
      const NS = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.style.cssText = 'position:absolute;inset:0'; d.appendChild(svg);
      const lines = [];
      const ln = (x1, y1, x2, y2) => { const l = document.createElementNS(NS, 'line'); l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2); l.setAttribute('stroke', 'rgba(11,11,13,.3)'); l.setAttribute('stroke-width', 1.5); l.setAttribute('pathLength', 1); l.style.strokeDasharray = '1 1'; svg.appendChild(l); lines.push(l); };
      [MX, MX + 215, MX + 430, MX + 645, W - MX].forEach((x) => ln(x, 0, x, H));
      [BY0, BY1, BY1 + 300, BY1 + 600, BY1 + 900].forEach((y) => ln(0, y, W, y));
      const ring = document.createElementNS(NS, 'circle'); ring.setAttribute('r', 13); ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', TEAL); ring.setAttribute('stroke-width', 3); svg.appendChild(ring);
      const lab = (txt, x, y) => { const e = h('div', null, esc(txt), d); e.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;font:700 28px/1 "Inter Variable",sans-serif;letter-spacing:.2em;color:' + TEAL; };
      lab('TIMIȘOARA', MX + 18, BY1 + 26); lab('ARAD', MX + 448, BY1 + 26); lab('CORP', MX + 18, BY1 + 326); lab('FAȚĂ', MX + 233, BY1 + 326); lab('PIELE', MX + 448, BY1 + 326); lab('2026', MX + 663, BY1 + 626);
      return { label: '', move: (u) => { lines.forEach((l, i) => { l.style.strokeDashoffset = String(1 - easeOut((u + 0.25 - i * 0.02) / 0.6)); }); ring.setAttribute('cx', (MX + 215 + 430 * easeOut(u / 0.8)).toFixed(1)); ring.setAttribute('cy', BY1 + 300); } };
    },
  };
  V.logoanchor = (ctx, p) => {
    const lay = ctx.layer(0);
    const per = R.beatPer || 0.458, A = p.beatsA != null ? p.beatsA : 8, B = p.beatsB != null ? p.beatsB : 8;
    const scenes = p.scenes.slice(0, A + B);
    const starts = []; for (let i = 0; i < A; i++) starts.push(i * per); for (let j = 0; j < B; j++) starts.push(A * per + j * per / 2);
    const tHold = A * per + B * per / 2;
    // the curtain takes three frames; four where the light changes a lot (white ↔ photo), so no frame jumps by 10 % (no strobe)
    const cls = (s) => (s.kind === 'photo' ? 'p' : 'l');
    const els = scenes.map((s, i) => { const d = full(lay); d.style.display = 'none'; const o = (SC[s.kind] || SC.paper)(d, s); return { d, s, t: starts[i], label: o.label, move: o.move, wipe: s.wipe || (i && cls(s) !== cls(scenes[i - 1]) ? 0.134 : 0.1) }; });
    // the ending: the band opens into clean white (the same paper light, very soft), a thin turquoise line under the logo
    const fin = h('div', null, null, lay); fin.style.cssText = 'position:absolute;left:0;top:' + BY0 + 'px;width:1080px;height:' + (BY1 - BY0) + 'px;background:#fff;overflow:hidden;display:none;z-index:40';
    const finIn = full(fin); finIn.style.top = (-BY0) + 'px'; const finO = SC.paper(finIn, { soft: true });
    const line = h('i', null, null, lay); line.style.cssText = 'position:absolute;left:' + (W / 2 - 110) + 'px;top:' + (BY1 - 14) + 'px;width:220px;height:4px;border-radius:2px;background:' + TEAL + ';transform-origin:50% 50%;z-index:60;transform:scaleX(0)';
    // the logo, black, fixed: the mark and the wordmark, 700 px across
    const logo = h('div', null, null, lay); logo.style.cssText = 'position:absolute;left:0;top:' + (CY - 44) + 'px;width:1080px;height:88px;z-index:50';
    const m = h('i', null, null, logo); m.style.cssText = 'position:absolute;left:190px;top:2px;width:84px;height:84px;background:' + INK + ';-webkit-mask:url(' + MARK() + ') center/contain no-repeat;mask:url(' + MARK() + ') center/contain no-repeat';
    const w = h('i', null, null, logo); w.style.cssText = 'position:absolute;left:298px;top:22px;width:592px;height:45px;background:' + INK + ';-webkit-mask:url(' + WORD() + ') center/contain no-repeat;mask:url(' + WORD() + ') center/contain no-repeat';
    [WORD(), MARK()].forEach((u) => { const pre = h('img', null, null, lay); pre.src = u; pre.style.display = 'none'; });
    // the frame counter (right) and the small turquoise label (left), in the band's corners
    const cnt = h('div', null, '01', lay); cnt.style.cssText = 'position:absolute;right:' + MX + 'px;top:' + (BY1 - 40) + 'px;font:600 22px/1 "JetBrains Mono Variable",monospace;letter-spacing:.08em;color:rgba(11,11,13,.55);z-index:50';
    const lab = h('div', null, '', lay); lab.style.cssText = 'position:absolute;left:' + MX + 'px;top:' + (BY1 - 40) + 'px;font:700 22px/1 "Inter Variable",sans-serif;letter-spacing:.22em;color:' + TEAL + ';z-index:50';
    // sound, on the frame of each change: a mechanical shutter per slide, the swoosh into the held ending, a tick for the line
    starts.forEach((t, i) => { ctx.sfx(t, 'shutter', i === 0 ? 0.8 : i < A ? 1.0 : 0.85, { prio: 3 }); R.event(t, 'panel'); });
    ctx.sfx(tHold, 'swoosh_end', 1.0, { prio: 4, peak: true }); R.event(tHold, 'panel'); R.event(tHold + 0.4, 'line'); R.event(tHold + 0.9, 'hold');
    ctx.sfx(tHold + 0.42, 'tick_soft', 0.7); ctx.sfx(tHold + 0.5, 'shimmer_soft', 0.5);
    ctx.focus(logo);
    ctx.tick((t) => {
      let k = 0; els.forEach((e, i) => { if (t >= e.t) k = i; });
      els.forEach((e, i) => {
        const vis = i === k || i === k - 1; e.d.style.display = vis ? 'block' : 'none'; if (!vis) return;
        e.d.style.zIndex = i === k ? 2 : 1;
        const q = i === k && k > 0 ? clamp((t - e.t) / e.wipe) : 1; // the curtain: top to bottom, three frames
        e.d.style.clipPath = q < 1 ? 'inset(0 0 ' + ((1 - q) * 100).toFixed(2) + '% 0)' : '';
        e.move(Math.max(0, t - e.t));
      });
      const cur = els[k];
      const n = String(k + 1).padStart(2, '0'); if (cnt.textContent !== n) cnt.textContent = n;
      if (lab.textContent !== cur.label) lab.textContent = cur.label;
      // the ending
      const f = easeOut((t - tHold + 0.02) / 0.42);
      fin.style.display = t >= tHold - 0.02 ? 'block' : 'none';
      const top = BY0 * (1 - f), hh = (BY1 - BY0) + (H - (BY1 - BY0)) * f;
      fin.style.top = top.toFixed(1) + 'px'; fin.style.height = hh.toFixed(1) + 'px'; finIn.style.top = (-top).toFixed(1) + 'px';
      finO.move(Math.max(0, t - tHold) * 0.5);
      const gone = 1 - clamp((t - tHold) / 0.2); cnt.style.opacity = (0.999 * gone).toFixed(3); lab.style.opacity = gone.toFixed(3);
      line.style.transform = 'scaleX(' + E.inout(clamp((t - tHold - 0.4) / 0.6)).toFixed(3) + ')';
    });
  };
})();
