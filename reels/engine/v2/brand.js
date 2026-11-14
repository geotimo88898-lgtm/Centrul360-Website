// Centrul360 reels v2: the logo-anchor brand piece (format xii, 14.11, the owner's logo-branding reference). The real
// logo (the mark + CENTRUL360.COM, from brand_asset) stays in exactly one spot and size, centre of the upper third, while
// the world behind it changes on the music's beat: real clinic photos graded to the palette with a slow push-in, the
// site on a phone, and surfaces drawn in code (a glass card, paper in window light, a giant word, a spec sheet with
// real data only, a Swiss grid). The cuts start on the beat and speed up to the half beat; two-frame dissolves keep
// neighbouring frames close in light (no strobe); the last frame holds on the logo over clean white.
//   visual: { type: "logoanchor", scenes: [{ kind, img, word, light }], beatsA: 8, beatsB: 8, holdColor }
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, E, h, esc } = R;
  const DEEP = '#0b7f74', TEAL = '#14a596', ROSE = 'linear-gradient(90deg,#fbe3d9,#eab5a5 55%,#cf8f7d)';
  const MARK = () => R.ROOT + '/brand_asset/brand/mark.svg', WORD = () => R.ROOT + '/brand_asset/wordmark-com.png';
  const LOGO_Y = 640;
  function full(parent) { const d = h('div', null, null, parent); d.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px;overflow:hidden'; return d; }
  function grain(d, a) { const g = h('i', null, null, d); g.style.cssText = 'position:absolute;inset:0;opacity:' + a + ';background-image:repeating-radial-gradient(circle at 17% 23%,rgba(0,0,0,.05) 0 1px,transparent 1px 3px),repeating-radial-gradient(circle at 71% 64%,rgba(0,0,0,.04) 0 1px,transparent 1px 4px)'; }
  const SC = {
    photo(d, s) { // a real clinic photo, graded to the palette (monochrome turquoise), a little darker on top for the logo
      const im = h('img', null, null, d); im.src = R.ROOT + '/brand_asset/' + s.img; // an <img>: decoded before the first frame (a CSS background can paint late)
      im.style.cssText = 'position:absolute;left:-2%;top:-2%;width:104%;height:104%;object-fit:cover;object-position:' + (s.pos || 'center') + ';filter:grayscale(1) contrast(1.08) brightness(' + (s.bright || 0.74) + ')';
      const tint = h('i', null, null, d); tint.style.cssText = 'position:absolute;inset:0;background:' + DEEP + ';mix-blend-mode:color';
      const mul = h('i', null, null, d); mul.style.cssText = 'position:absolute;inset:0;background:rgba(11,127,116,.22);mix-blend-mode:multiply';
      const shade = h('i', null, null, d); shade.style.cssText = 'position:absolute;inset:0;background:radial-gradient(ellipse 620px 260px at 540px ' + LOGO_Y + 'px,rgba(4,40,36,.42),rgba(4,40,36,0) 70%)';
      d._move = im; return 'white';
    },
    glass(d, s) { // a frosted glass card held in light, the logo printed on it
      d.style.background = s.light ? 'radial-gradient(ellipse at 50% 30%,#ffffff,#dcf2ef 70%)' : 'radial-gradient(ellipse at 50% 28%,#1ab3a3,' + DEEP + ' 75%)';
      const glow = h('i', null, null, d); glow.style.cssText = 'position:absolute;left:240px;top:330px;width:600px;height:600px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.35),rgba(255,255,255,0) 65%);filter:blur(20px)';
      const c = h('div', null, null, d); c.style.cssText = 'position:absolute;left:180px;top:' + (LOGO_Y - 210) + 'px;width:720px;height:420px;border-radius:36px;background:linear-gradient(150deg,rgba(255,255,255,.34),rgba(255,255,255,.1));box-shadow:0 0 0 2px rgba(255,255,255,.55) inset,0 50px 90px -40px rgba(4,40,36,.6)';
      const sp = h('i', null, null, c); sp.style.cssText = 'position:absolute;left:24px;top:18px;width:300px;height:10px;border-radius:5px;background:linear-gradient(90deg,rgba(255,255,255,.7),rgba(255,255,255,0))';
      d._move = c; return s.light ? 'deep' : 'white';
    },
    paper(d) { // paper in window light: soft diagonal shadow bars
      d.style.background = '#f7f8f6'; grain(d, 0.9);
      const bars = h('i', null, null, d); bars.style.cssText = 'position:absolute;inset:-30%;background:repeating-linear-gradient(115deg,rgba(11,40,36,0) 0 150px,rgba(11,40,36,.16) 150px 250px);filter:blur(14px);transform:rotate(0deg)';
      d._move = bars; return 'deep';
    },
    word(d, s) { // a giant condensed word behind the logo
      const dk = s.dark; d.style.background = dk ? (s.deep ? DEEP : TEAL) : '#ffffff';
      const w = h('div', null, esc(s.word), d); w.style.cssText = 'position:absolute;left:-200px;width:1480px;top:' + (LOGO_Y - 330) + 'px;text-align:center;font:900 560px/1 "Inter Variable",sans-serif;letter-spacing:-.06em;transform:scaleX(.62);transform-origin:50% 50%;white-space:nowrap;color:' + (dk ? 'rgba(255,255,255,.14)' : '#dcf2ef');
      d._move = w; return dk ? 'white' : 'deep';
    },
    spec(d) { // a technical spec sheet, real data only (the cities, the site, the year)
      d.style.background = DEEP;
      const s = '<svg width="1080" height="1920" style="position:absolute;inset:0"><g stroke="rgba(255,255,255,.35)" stroke-width="1.5" fill="none">' +
        '<line x1="0" y1="560" x2="1080" y2="560"/><line x1="0" y1="720" x2="1080" y2="720"/><line x1="180" y1="0" x2="180" y2="1920"/><line x1="900" y1="0" x2="900" y2="1920"/>' +
        '<line x1="180" y1="0" x2="900" y2="1920"/><circle cx="210" cy="530" r="10"/><rect x="860" y="740" width="26" height="26" rx="4"/></g></svg>';
      d.innerHTML = s;
      const lab = (txt, x, y, al) => { const e = h('div', null, esc(txt), d); e.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;font:600 22px/1.4 "JetBrains Mono Variable",monospace;letter-spacing:.08em;color:rgba(255,255,255,.75);text-align:' + (al || 'left'); return e; };
      lab('TIMIȘOARA · ARAD', 200, 740); lab('CENTRUL360.COM', 200, 776); lab('2026', 820, 520); lab('CORP · FAȚĂ · PIELE', 200, 812);
      return 'white';
    },
    swiss(d) { // a Swiss grid: hairlines, small blocks of the site's own words
      d.style.background = '#ffffff';
      let g = '<svg width="1080" height="1920" style="position:absolute;inset:0"><g stroke="rgba(20,165,150,.35)" stroke-width="1.5">';
      for (let i = 1; i < 6; i++) g += '<line x1="' + (i * 180) + '" y1="0" x2="' + (i * 180) + '" y2="1920"/>';
      for (let j = 1; j < 10; j++) g += '<line x1="0" y1="' + (j * 192) + '" x2="1080" y2="' + (j * 192) + '"/>';
      d.innerHTML = g + '</g></svg>';
      const blk = (txt, x, y) => { const e = h('div', null, esc(txt), d); e.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;font:700 24px/1.3 "Inter Variable",sans-serif;letter-spacing:.02em;color:' + DEEP; };
      blk('Corp', 196, 980); blk('Față', 556, 980); blk('Epilare laser', 736, 1172); blk('Timișoara', 196, 1364); blk('Arad', 556, 1364);
      return 'deep';
    },
    phone(d) { // the real site, on a phone, under the logo
      d.style.background = 'radial-gradient(ellipse at 50% 40%,#ffffff,#eef7f6 70%)';
      const shot = R.siteShots && R.siteShots.shots && R.siteShots.shots['home-rezultate'];
      const ph = h('div', null, null, d); ph.style.cssText = 'position:absolute;left:300px;top:760px;width:480px;height:980px;border-radius:64px;background:#0d1a19;box-shadow:0 60px 100px -40px rgba(4,40,36,.55)';
      const sc = h('div', null, null, ph); sc.style.cssText = 'position:absolute;left:16px;top:16px;right:16px;bottom:16px;border-radius:50px;overflow:hidden;background:#fff';
      if (shot) { const im = h('img', null, null, sc); im.src = '../site/' + shot.file; im.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:auto'; }
      d._move = ph; return 'deep';
    },
    clean(d, s) { // the held ending: clean white, a single rose gold accent under the logo
      d.style.background = s.teal ? TEAL : '#ffffff';
      const line = h('i', null, null, d); line.style.cssText = 'position:absolute;left:390px;top:' + (LOGO_Y + 70) + 'px;width:300px;height:6px;border-radius:3px;background:' + ROSE + ';transform-origin:50% 50%';
      d._line = line; return s.teal ? 'white' : 'deep';
    },
  };
  V.logoanchor = (ctx, p) => {
    const lay = ctx.layer(0);
    const per = R.beatPer || 0.458, A = p.beatsA || 8, B = p.beatsB || 8;
    const scenes = p.scenes;
    // the cut times: from 0, one per beat, then one per half beat; then the held ending
    const T0 = 0; const times = [];
    for (let i = 0; i < A; i++) times.push(T0 + i * per);
    for (let j = 0; j < B; j++) times.push(T0 + A * per + j * per / 2);
    const tHold = T0 + A * per + B * per / 2;
    const all = scenes.slice(0, A + B).concat([Object.assign({ kind: 'clean' }, p.hold || {})]);
    const starts = times.slice(0, all.length - 1).concat([tHold]);
    const els = all.map((s, i) => { const d = full(lay); d.style.display = 'none'; const ink = (SC[s.kind] || SC.paper)(d, s); return { d, ink, t: starts[i], s }; });
    // the logo, fixed: two copies (white, deep turquoise) cross-faded with the background behind them
    const logo = (col) => { const g = h('div', null, null, lay); g.style.cssText = 'position:absolute;left:0;top:' + (LOGO_Y - 40) + 'px;width:1080px;height:80px';
      const m = h('i', null, null, g); m.style.cssText = 'position:absolute;left:228px;top:6px;width:68px;height:68px;background:' + col + ';-webkit-mask:url(' + MARK() + ') center/contain no-repeat;mask:url(' + MARK() + ') center/contain no-repeat';
      const w = h('i', null, null, g); w.style.cssText = 'position:absolute;left:316px;top:19px;width:536px;height:41px;background:' + col + ';-webkit-mask:url(' + WORD() + ') center/contain no-repeat;mask:url(' + WORD() + ') center/contain no-repeat';
      return g; };
    const LW = logo('#ffffff'), LD = logo(DEEP);
    const pre = h('img', null, null, lay); pre.src = WORD(); pre.style.display = 'none';
    const pre2 = h('img', null, null, lay); pre2.src = MARK(); pre2.style.display = 'none';
    // sounds and events, on the cuts
    starts.forEach((t, i) => { if (i === 0) return; const fast = i >= A; ctx.sfx(t, i === all.length - 1 ? 'dot' : fast ? 'tick_soft' : 'tap', i === all.length - 1 ? 0.5 : fast ? 0.5 : 0.45); R.event(t, 'panel'); });
    ctx.sfx(tHold - 1.0, 'riser_soft', 0.45); ctx.sfx(tHold + 0.05, 'shimmer', 0.25); R.event(tHold + 0.6, 'hold'); R.event(tHold + 0.3, 'line');
    ctx.focus(LD);
    const XF = 2 / 30; // a two-frame soft dissolve on every cut
    ctx.tick((t) => {
      let k = 0; els.forEach((e, i) => { if (t >= e.t) k = i; });
      const cur = els[k], prev = els[k - 1];
      const xf = k === els.length - 1 ? 0.25 : (cur.s.xf || XF); // longer where the light changes a lot (no strobe: < 10 % a frame)
      const q = prev ? clamp((t - cur.t) / xf) : 1;
      els.forEach((e, i) => { const vis = i === k || (i === k - 1 && q < 1); e.d.style.display = vis ? 'block' : 'none'; e.d.style.opacity = i === k ? q.toFixed(3) : '1'; e.d.style.zIndex = i === k ? 2 : 1;
        if (vis && e.d._move) { const u = clamp((t - e.t) / 1.2); e.d._move.style.transform = (e.s.kind === 'word' ? 'scaleX(.62) ' : '') + 'scale(' + (1 + 0.05 * u).toFixed(4) + ')'; } });
      const inkNow = (e) => (e.ink === 'white' ? 1 : 0);
      const wv = prev ? inkNow(prev) * (1 - q) + inkNow(cur) * q : inkNow(cur);
      LW.style.opacity = wv.toFixed(3); LD.style.opacity = (1 - wv).toFixed(3); LW.style.zIndex = LD.style.zIndex = 5;
      if (cur.d._line) cur.d._line.style.transform = 'scaleX(' + E.inout(clamp((t - cur.t - 0.3) / 0.6)).toFixed(3) + ')';
    });
  };
})();
