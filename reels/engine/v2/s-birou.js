// Centrul360 reels v2: the bright desk (v2-birou-sebum, 15.11; format x-b, without voice). One long sheet of light grey
// drafting paper with the brand's grid, fine construction lines and registration marks; daylight from the upper RIGHT
// (soft shadows fall down and to the left); real-colour objects photographed from above (scripts/<id>/objects, made by
// objects.py): a white soap bar, round reading glasses, a rose gold drafting pencil, a spirit level, a torn notepad
// sheet; tape drawn from code. Condensed turquoise capitals (Bricolage Grotesque at 75 % width), an italic serif
// (Instrument Serif) and the site's sans for the small text.
// It opens with something calm that is not an ad: one soap bubble rising off the soap, followed by a compass circle and
// a crosshair like a technical drawing; it bursts exactly on the music's first hit and the title comes out of it. Then
// every card is reached by a fast vertical push with motion blur, on a beat, and the objects work on the words: the
// pencil strikes „igienă” and draws the loop around SEBUM, the glasses' lens enlarges „sebum” in the definition, the
// soap scrubs under „spălatul agresiv”, the level's bubble (the opening bubble, again) settles in the middle on
// „echilibrul”, tape holds the note of what helps at home. Every sentence is the site's wording (ten-problematic.html).
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, lerp, E, h, esc } = R;
  const SANS = "'Inter Variable',system-ui,sans-serif", SERIF = "'Instrument Serif',Georgia,serif", COND = "'BricoCond','Bricolage Grotesque Variable',sans-serif";
  const INK = '#12201f', TEAL = '#14a596', DEEP = '#0b7f74', MUTE = '#5e6d6b';
  // the condensed width of Bricolage (its wdth axis; stage.html loads only its weight axis): a face of our own, made before the page boots
  if (/[?&]reel=v2-birou-/.test(location.search)) {
    const base = '../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-';
    const st = document.createElement('style');
    st.textContent = ['latin', 'latin-ext'].map((s) => "@font-face{font-family:'BricoCond';font-style:normal;font-display:block;font-weight:200 800;font-stretch:75% 100%;src:url(" + base + s + "-wdth-normal.woff2) format('woff2-variations');" + (s === 'latin' ? 'unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' : 'unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF') + '}').join('');
    document.head.appendChild(st);
    if (document.fonts) { document.fonts.load("800 100px 'BricoCond'", 'ACNEEA SĂPUN ȘȚĂÎÂ'); document.fonts.load("italic 400 100px 'Instrument Serif'", 'igienă echilibru ăîâșț'); }
  }
  const sm = (p) => { p = clamp(p); return p * p * (3 - 2 * p); };
  const io = (p) => E.inout(clamp(p)), ex = (p) => E.expo(clamp(p)), o3 = (p) => E.out(clamp(p));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const back = (p, c = 1.4) => { p = clamp(p); const c3 = c + 1; return 1 + c3 * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };

  let W = null;
  function build() {
    if (W) return W;
    W = {};
    const S0 = R.script, total = R.total;
    const B = 60 / ((S0.beat && S0.beat.bpm) || 122.62), TB = (n) => n * B;
    const OBJ = R.ROOT + '/reels/scripts/' + S0.id + '/objects/';
    const cue = (t, cat, gain, o) => R.cue(t, cat, gain, o), ev = (t, kind) => R.event(t, kind || 'step');
    const world = document.getElementById('world');
    const root = h('div', 'shot br-world'); world.insertBefore(root, world.firstChild);
    root.style.cssText = 'display:block;opacity:1;z-index:-1;overflow:hidden;background:#e9ecec';
    h('style', null, '#sweep,#flash{display:none!important}' +
      '.br-world .tx{position:absolute;left:0;width:1080px;text-align:center;white-space:nowrap;color:' + INK + ';font:560 62px/1.12 ' + SANS + ';letter-spacing:-.02em}' +
      '.br-world .w{display:inline-block}.br-world img{position:absolute;display:block}' +
      '.br-world .cond{font-family:' + COND + ';font-stretch:75%;font-weight:800;letter-spacing:-.01em;text-transform:none;color:' + TEAL + ';line-height:.92}' +
      '.br-world .ser{font-family:' + SERIF + ';font-style:italic;font-weight:400;letter-spacing:-.01em}', root);
    root.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute"><defs><filter id="br-mb" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="0 0"/></filter></defs></svg>');
    const fblur = root.querySelector('#br-mb feGaussianBlur');
    const mk = (par, css, cls, html) => { const d = h('div', cls || null, html != null ? html : null, par); if (css) d.style.cssText = css; return d; };
    const svg = (par, w, hh, inner, css) => { const d = mk(par, 'position:absolute;' + (css || '')); d.innerHTML = '<svg width="' + w + '" height="' + hh + '" viewBox="0 0 ' + w + ' ' + hh + '" style="display:block;overflow:visible">' + inner + '</svg>'; return d; };
    const cam = mk(root, 'position:absolute;left:0;top:0;width:1080px;height:1920px;transform-origin:540px 960px');
    const desk = mk(cam, 'position:absolute;left:0;top:0;width:0;height:0');
    const GAP = 2000, CY = (k) => 960 + k * GAP;   // card k is centred at y = CY(k) on the sheet
    // the sheet: light grey drafting paper, the brand's grid, a finer grid, grain
    const tile = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), im = x.createImageData(256, 256); let s = 99173;
      for (let i = 0; i < im.data.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; const v = 110 + ((s >> 9) & 127); im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 18; } x.putImageData(im, 0, 0); return c.toDataURL(); })();
    mk(desk, 'position:absolute;left:-1400px;top:-1400px;width:3880px;height:' + (GAP * 6 + 2800) + 'px;background-color:#eceeed;background-image:url(' + tile + '),linear-gradient(rgba(20,165,150,.10) 1.5px,transparent 0),linear-gradient(90deg,rgba(20,165,150,.10) 1.5px,transparent 0),linear-gradient(rgba(18,32,31,.035) 1px,transparent 0),linear-gradient(90deg,rgba(18,32,31,.035) 1px,transparent 0);background-size:256px 256px,108px 108px,108px 108px,27px 27px,27px 27px;background-position:0 0,-1px -1px,-1px -1px,-1px -1px,-1px -1px');
    // construction lines of a technical drawing on each card: two long fine lines, registration crosses, a dimension line
    const cards = [];
    for (let k = 0; k < 6; k++) {
      const c = mk(desk, 'position:absolute;left:0;top:' + (CY(k) - 960) + 'px;width:1080px;height:1920px');
      const ln = 'stroke="' + INK + '" stroke-opacity=".22" stroke-width="1.6" fill="none"';
      svg(c, 1080, 1920, '<path d="M-200 ' + (300 + k * 37) + 'H1280M' + (130 + k * 23) + ' -200V2120" ' + ln + ' stroke-dasharray="' + (k % 2 ? '14 10' : '2 9') + '"/>' +
        [[150, 266], [930, 266], [150, 1520], [930, 1520]].map(([x, y]) => '<path d="M' + (x - 18) + ' ' + y + 'h36M' + x + ' ' + (y - 18) + 'v36" ' + ln + '/><circle cx="' + x + '" cy="' + y + '" r="9" ' + ln + '/>').join('') +
        '<path d="M190 1590H890M190 1578v24M890 1578v24" ' + ln + '/>', 'left:0;top:0');
      cards.push({ el: c, k });
    }
    // daylight from the upper right, a soft shade lower left
    mk(root, 'position:absolute;inset:0;pointer-events:none;z-index:8;background:radial-gradient(ellipse 1300px 1100px at 105% -5%,rgba(255,255,255,.55),rgba(255,255,255,0) 60%),radial-gradient(ellipse 1400px 1500px at -10% 108%,rgba(18,50,48,.12),rgba(18,50,48,0) 62%)');
    const pop = mk(root, 'position:absolute;inset:0;pointer-events:none;z-index:9;opacity:0;background:radial-gradient(circle at 540px 700px,#ffffff 0,rgba(255,255,255,.85) 18%,rgba(255,255,255,0) 52%)');

    // ---------------------------------------------------------------- helpers
    const SHADOW = (z) => 'drop-shadow(' + (-0.18 * z).toFixed(1) + 'px ' + (0.3 * z).toFixed(1) + 'px ' + (6 + 0.22 * z).toFixed(1) + 'px rgba(24,40,38,' + (0.3 - Math.min(0.12, z / 600)).toFixed(3) + '))';
    function obj(par, name, x, y, w, ow, oh) { const im = h('img', null, null, par); im.src = OBJ + name + '.png'; const hh = w * oh / ow; im.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + hh + 'px'; return { im, x, y, w, h: hh, k: w / ow }; }
    const setObj = (o, dx, dy, rot, sc, op, z) => { o.im.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px) rotate(' + (rot || 0).toFixed(3) + 'deg) scale(' + (sc == null ? 1 : sc).toFixed(4) + ')'; o.im.style.opacity = (op == null ? 1 : op).toFixed(3); o.im.style.filter = SHADOW(z == null ? 40 : z); };
    // text: each block appears on its time; mode 'slam' (big, from blur, settles), 'rise' (from below its baseline), 'stag' (word by word)
    const blocks = [];
    function txt(par, top, html, css, at, mode, o = {}) {
      const el = h('div', 'tx' + (o.cls ? ' ' + o.cls : ''), html, par); el.style.cssText = 'top:' + top + 'px;' + (css || '');
      if (o.fit) { const rg = () => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect().width; }; let fs = parseFloat(getComputedStyle(el).fontSize); while (fs > 30 && rg() > o.fit) { fs -= 2; el.style.fontSize = fs + 'px'; } }
      const B0 = { el, at, mode: mode || 'rise', dur: o.dur || (mode === 'slam' ? 0.5 : 0.42) };
      if (B0.mode === 'stag') { const ws = el.textContent.split(/\s+/).filter(Boolean); el.innerHTML = ws.map((w) => '<span class="w">' + esc(w) + '</span>').join(' '); B0.ws = [...el.querySelectorAll('.w')]; }
      blocks.push(B0);
      if (!o.silent) { if (B0.ws) B0.ws.forEach((w, i) => cue(at + i * (o.stagger || 0.09), 'tick_soft', 0.3)); else cue(at, mode === 'slam' ? 'tap' : 'tick_soft', mode === 'slam' ? 0.6 : 0.35); }
      ev(at, mode === 'slam' ? 'reveal' : 'step');
      B0.stagger = o.stagger || 0.09;
      return B0;
    }
    const T = {};
    T.pop = S0.popAt != null ? S0.popAt : TB(5);
    const CUT = [0, TB(15), TB(23), TB(29), TB(36), TB(44)];   // the pushes to cards 1-5, on beats
    const C = cards.map((c) => c.el);

    // ================================================================ card 0: the bubble, then „Acneea nu ține de igienă. Ține de echilibru.”
    const soap0 = obj(C[0], 'soap', 330, 1150, 420, 528, 327);
    const BUB0 = [540, 1170], BUB1 = [548, 610];
    const comp = svg(C[0], 1080, 1920, '<circle class="cc" cx="0" cy="0" r="160" fill="none" stroke="' + INK + '" stroke-opacity=".32" stroke-width="1.6" stroke-dasharray="4 7"/><path class="ch" d="M-220 0H220M0 -220V220" stroke="' + INK + '" stroke-opacity=".25" stroke-width="1.4"/><path class="arc" d="M0 -104A104 104 0 0 1 104 0" fill="none" stroke="' + DEEP + '" stroke-width="3" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>', 'left:0;top:0');
    const compG = comp.querySelector('svg');
    const bub = mk(C[0], 'position:absolute;left:0;top:0;width:240px;height:240px;margin:-120px 0 0 -120px;border-radius:50%;' +
      'background:radial-gradient(circle at 34% 28%,rgba(255,255,255,.95) 0,rgba(255,255,255,.55) 9%,rgba(255,255,255,0) 22%),radial-gradient(circle at 70% 78%,rgba(255,255,255,.5) 0,rgba(255,255,255,0) 14%),radial-gradient(circle,rgba(255,255,255,0) 58%,rgba(95,212,198,.28) 72%,rgba(234,181,165,.32) 82%,rgba(255,255,255,.75) 96%,rgba(255,255,255,0) 100%);' +
      'box-shadow:inset -6px -10px 18px rgba(20,165,150,.16),inset 8px 6px 16px rgba(251,227,217,.35),-14px 26px 30px -14px rgba(24,40,38,.16)');
    const bubRim = mk(bub, 'position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,rgba(95,212,198,.35),rgba(234,181,165,.32),rgba(255,255,255,.2),rgba(95,212,198,.35));-webkit-mask:radial-gradient(circle,transparent 64%,#000 70%,#000 97%,transparent 100%);mask:radial-gradient(circle,transparent 64%,#000 70%,#000 97%,transparent 100%)');
    const drops = []; for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2 + R.rnd(k, 2) * 0.4, d = mk(C[0], 'position:absolute;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,rgba(95,212,198,.6));opacity:0'); drops.push({ d, a, r: 120 + R.rnd(k, 4) * 160 }); }
    const ring0 = mk(C[0], 'position:absolute;left:' + (BUB1[0] - 80) + 'px;top:' + (BUB1[1] - 80) + 'px;width:160px;height:160px;border-radius:50%;border:4px solid rgba(255,255,255,.95);box-shadow:0 0 0 2px rgba(95,212,198,.35);opacity:0');
    const tA = txt(C[0], 470, 'ACNEEA', 'font-size:280px', T.pop, 'slam', { cls: 'cond', silent: true, fit: 730 });
    const tB = txt(C[0], 790, 'nu ține de', 'font:520 66px/1.1 ' + SANS, T.pop + B * 0.5, 'rise');
    const tC = txt(C[0], 905, 'igienă.', 'font-size:200px;line-height:1.05', T.pop + B, 'slam', { cls: 'ser' });
    const pen0 = obj(C[0], 'pencil', 180, 0, 760, 1176, 101);
    const strike = svg(C[0], 640, 80, '<path d="M8 50C150 40 330 30 632 18" fill="none" stroke="' + DEEP + '" stroke-width="12" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>', 'left:220px;top:965px');
    const tD = txt(C[0], 1175, 'ține de <span class="ser" style="font-size:2.1em;color:' + DEEP + ';vertical-align:-.12em">echilibru.</span>', 'font:560 64px/1.1 ' + SANS, TB(11), 'rise');
    T.p0in = TB(8); T.s0 = TB(9); T.s1 = TB(10); T.p0out = TB(11.5);
    cue(0, 'tick_soft', 0.25); cue(0.12, 'shimmer_soft', 0.3); ev(0.1, 'step'); cue(0.9, 'tick_soft', 0.3); ev(0.9, 'step'); cue(1.7, 'tick_soft', 0.3); ev(1.7, 'step');
    cue(T.pop, 'hit_deep', 0.95, { prio: 5 }); cue(T.pop, 'dot', 0.6, { prio: 4 }); cue(T.pop + 0.02, 'shimmer_soft', 0.45); ev(T.pop, 'reveal');
    cue(T.p0in, 'tap', 0.4); ev(T.p0in, 'drop'); for (let k = 0; k < 8; k++) cue(T.s0 + k * 0.06, 'grain', 0.35 - k * 0.02); ev(T.s0, 'reveal'); cue(T.p0out, 'tick_soft', 0.25);
    C[0]._tick = (t) => {
      // the bubble rises off the soap, wobbling, with a compass circle and a crosshair following it like a drawing
      const r = sm(seg(t, -0.3, T.pop)), bx = lerp(BUB0[0], BUB1[0], r) + Math.sin(t * 2.1) * 16 * (1 - r * 0.6), by = lerp(BUB0[1], BUB1[1], E.out(r));
      const grow = 0.5 + 0.5 * sm(seg(t, -0.3, 1.2)), wob = 1 + 0.035 * Math.sin(t * 5.3), alive = t < T.pop;
      bub.style.display = alive ? 'block' : 'none'; bub.style.transform = 'translate(' + bx.toFixed(1) + 'px,' + by.toFixed(1) + 'px) scale(' + (grow * wob).toFixed(4) + ',' + (grow / wob).toFixed(4) + ')';
      bubRim.style.transform = 'rotate(' + (t * 60).toFixed(1) + 'deg)';
      compG.setAttribute('transform', 'translate(' + bx.toFixed(1) + ' ' + by.toFixed(1) + ')'); comp.style.opacity = alive ? (sm(seg(t, 0.4, 0.9)) * 0.95).toFixed(3) : (1 - seg(t, T.pop, T.pop + 0.2)).toFixed(3);
      const RC = 160 * grow; comp.querySelector('.cc').setAttribute('r', RC.toFixed(1)); comp.querySelector('.arc').style.strokeDashoffset = (1 - io(seg(t, 1.7, T.pop))).toFixed(3); comp.querySelector('.arc').setAttribute('d', 'M0 ' + (-RC).toFixed(1) + 'A' + RC.toFixed(1) + ' ' + RC.toFixed(1) + ' 0 0 1 ' + RC.toFixed(1) + ' 0');
      // the burst: droplets, a ring, a short light
      const q = seg(t, T.pop, T.pop + 0.55);
      drops.forEach((o) => { o.d.style.opacity = t >= T.pop ? (Math.sin(Math.PI * q) * 0.9).toFixed(3) : '0'; o.d.style.transform = 'translate(' + (BUB1[0] + Math.cos(o.a) * o.r * o3(q)).toFixed(1) + 'px,' + (BUB1[1] + Math.sin(o.a) * o.r * o3(q) + 80 * q * q).toFixed(1) + 'px) scale(' + (1 - 0.6 * q).toFixed(3) + ')'; });
      const rq = seg(t, T.pop, T.pop + 0.3); ring0.style.opacity = t >= T.pop ? (1 - rq).toFixed(3) : '0'; ring0.style.transform = 'scale(' + (1 + 1.6 * o3(rq)).toFixed(3) + ')';
      setObj(soap0, 0, Math.sin(t * 0.8) * 2 + 300 * io(seg(t, T.pop + 0.25, T.pop + 0.95)), -3 + Math.sin(t * 0.5) * 0.3 + 6 * io(seg(t, T.pop + 0.25, T.pop + 0.95)), 1, 1, 34);   // after the burst the soap slides down, out of the way of the words
      // the pencil comes in from the right, strikes „igienă”, leaves
      const pin = ex(seg(t, T.p0in, T.p0in + 0.45)), pdr = io(seg(t, T.s0, T.s1)), pout = io(seg(t, T.p0out, T.p0out + 0.5));
      const tipX = 228 + 624 * pdr, tipY = 1015 - 32 * pdr;
      setObj(pen0, tipX - 180 + (1 - pin) * 760 + pout * 700, tipY - 48 + (1 - pin) * -60 + pout * -120, -4 - pdr * 2 + (1 - pin) * -8, 1, clamp(pin * 3) * (1 - pout), 70 + (1 - pin) * 60);
      pen0.im.style.transformOrigin = '0px 50px';
      strike.querySelector('path').style.strokeDashoffset = (1 - pdr).toFixed(4);
    };

    // ================================================================ card 1: „sebum” — the definition, the glasses enlarge it, a marker circles „prea mult”
    T.c1 = CUT[1];
    const head1 = txt(C[1], 420, 'sebum', 'font-size:170px;line-height:1', T.c1 + B * 0.5, 'slam', { cls: 'ser' });
    const def1 = txt(C[1], 640, '', 'font:500 52px/1.78 ' + SANS + ';color:#2b3a38', T.c1 + B, 'rise');
    def1.el.innerHTML = 'Glandele produc<br><span style="font-size:1.3em;font-weight:620;color:' + INK + '"><span class="pm">prea mult</span> <span class="sb">sebum,</span></span><br>porii se înfundă, iar inflamația<br>și bacteriile fac restul.';
    const glasses = obj(C[1], 'glasses', 0, 0, 660, 600, 208);   // left lens: centre (159.5, 103.5), rx 100, ry 88 in the cut-out's pixels
    const GK = 660 / 600, LC = [159.5 * GK, 103.5 * GK], LRX = 98 * GK, LRY = 86 * GK;
    const lens = mk(C[1], 'position:absolute;left:0;top:0;width:' + (2 * LRX) + 'px;height:' + (2 * LRY) + 'px;border-radius:50%;overflow:hidden;background:#f2f4f3');
    const lensIn = mk(lens, 'position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0');
    const mark1 = svg(C[1], 360, 130, '<path d="M30 70C20 30 120 14 200 16C290 18 344 40 336 74C328 108 230 122 160 118C80 112 24 96 40 56C50 34 90 22 130 18" fill="none" stroke="' + DEEP + '" stroke-width="8" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>', 'left:0;top:0');
    let sbR = null, pmR = null;
    T.g0 = TB(17); T.g1 = TB(18); T.m1 = TB(20);
    cue(T.g0 + 0.35, 'tap', 0.55); ev(T.g0 + 0.35, 'drop'); cue(T.g1 + 0.1, 'shimmer_soft', 0.3); ev(T.g1 + 0.1, 'reveal'); for (let k = 0; k < 6; k++) cue(T.m1 + k * 0.08, 'grain', 0.3); ev(T.m1, 'step');
    C[1]._tick = (t) => {
      if (!sbR) {   // measure the words once the card is laid out
        const rel = (e) => ({ x: def1.el.offsetLeft + e.offsetLeft, y: def1.el.offsetTop + e.offsetTop, w: e.offsetWidth, h: e.offsetHeight });   // the layout, without the entrance's transform
        sbR = rel(def1.el.querySelector('.sb')); pmR = rel(def1.el.querySelector('.pm'));
        const clone = def1.el.cloneNode(true); clone.classList.remove('tx'); clone.style.position = 'absolute'; clone.style.width = '1080px'; clone.style.textAlign = 'center'; clone.style.whiteSpace = 'nowrap'; clone.style.filter = 'none'; clone.style.visibility = 'visible'; clone.style.opacity = '1'; clone.style.transform = 'none'; lensIn.appendChild(clone); lens._clone = clone;
      }
      // the glasses glide in from the right, the left lens settles over „sebum” and enlarges it
      const gin = ex(seg(t, T.g0, T.g0 + 0.5)), cx = sbR.x + sbR.w / 2, cy = sbR.y + sbR.h / 2 + 4;
      const gx = cx - LC[0] + (1 - gin) * 720, gy = cy - LC[1] + (1 - gin) * 160 + Math.sin(t * 0.9) * 3, rot = (1 - gin) * 9 + Math.sin(t * 0.6) * 0.3;
      setObj(glasses, gx, gy, rot, 1, clamp(gin * 3), 46 + (1 - gin) * 50); glasses.im.style.transformOrigin = LC[0] + 'px ' + LC[1] + 'px'; glasses.im.style.zIndex = '3';
      const M = 1 + 0.75 * sm(seg(t, T.g1 - 0.1, T.g1 + 0.35));
      lens.style.transform = 'translate(' + (gx + LC[0] - LRX).toFixed(2) + 'px,' + (gy + LC[1] - LRY).toFixed(2) + 'px) rotate(' + rot.toFixed(3) + 'deg)'; lens.style.opacity = clamp(gin * 3).toFixed(3); lens.style.zIndex = '2';
      lensIn.style.transform = 'translate(' + LRX + 'px,' + LRY + 'px) rotate(' + (-rot).toFixed(3) + 'deg) scale(' + M.toFixed(4) + ') translate(' + (-(gx + LC[0])).toFixed(2) + 'px,' + (-(gy + LC[1])).toFixed(2) + 'px)';
      lens._clone.style.top = def1.el.style.top; lens._clone.style.left = '0px';
      mark1.style.transform = 'translate(' + (pmR.x + pmR.w / 2 - 180).toFixed(1) + 'px,' + (pmR.y + pmR.h / 2 - 66).toFixed(1) + 'px) scale(' + (pmR.w / 270).toFixed(3) + ',1)';
      mark1.querySelector('path').style.strokeDashoffset = (1 - io(seg(t, T.m1, T.m1 + 0.5))).toFixed(4);
      void head1;
    };

    // ================================================================ card 2: „Spălatul agresiv adesea înrăutățește lucrurile.” — the soap scrubs
    T.c2 = CUT[2];
    txt(C[2], 330, 'SPĂLATUL', 'font-size:210px', T.c2 + B * 0.5, 'slam', { cls: 'cond', fit: 760 });
    txt(C[2], 600, 'AGRESIV', 'font-size:210px', T.c2 + B, 'slam', { cls: 'cond', fit: 760 });
    txt(C[2], 870, 'adesea înrăutățește', 'font:560 66px/1.1 ' + SANS, T.c2 + B * 2, 'stag', { stagger: 0.1 });
    txt(C[2], 956, '<span class="ser" style="font-size:1.9em;color:' + DEEP + '">lucrurile.</span>', 'font:560 66px/1.1 ' + SANS, T.c2 + B * 2.5, 'rise');
    const soap2 = obj(C[2], 'soap', 360, 1250, 360, 528, 327);
    const foam = []; for (let k = 0; k < 16; k++) { const d = mk(C[2], 'position:absolute;left:0;top:0;width:' + (16 + (k % 4) * 9) + 'px;height:' + (16 + (k % 4) * 9) + 'px;border-radius:50%;background:radial-gradient(circle at 34% 28%,#fff 0,rgba(255,255,255,.7) 25%,rgba(220,242,239,.5) 70%,rgba(95,212,198,.35) 100%);opacity:0'); foam.push({ d, k, x: 380 + R.rnd(k, 11) * 320, y: 1160 + R.rnd(k, 13) * 200, t: 0 }); }
    T.sc0 = T.c2 + B * 1.5; T.sc1 = TB(27);
    const swipes = []; for (let tt = T.sc0; tt < T.sc1 - 0.05; tt += B / 2) swipes.push(tt);
    swipes.forEach((tt, i) => { cue(tt, 'grain', 0.45 + 0.1 * (i % 2)); if (i % 2 === 0) ev(tt, 'step'); }); foam.forEach((f, k) => { f.t = T.sc0 + (k / foam.length) * (T.sc1 - T.sc0); });
    cue(T.sc1, 'tap', 0.55); ev(T.sc1, 'drop');
    C[2]._tick = (t) => {
      const n = swipes.filter((x) => x <= t).length, on = t >= T.sc0 && t < T.sc1, ph = on ? (t - T.sc0) / (B / 2) : 0, dir = Math.floor(ph) % 2 ? -1 : 1, fr = ph - Math.floor(ph);
      const x = on ? dir * lerp(-120, 120, E.inout(fr)) : t >= T.sc1 ? 0 : 0, settle = t >= T.sc1 ? Math.exp(-7 * (t - T.sc1)) * Math.sin(16 * (t - T.sc1)) * 8 : 0;
      setObj(soap2, x + settle, (on ? Math.abs(Math.sin(ph * Math.PI)) * -10 : 0) + Math.sin(t * 0.8) * 2, (on ? dir * 6 * Math.sin(fr * Math.PI) : 0) - 4, 1, 1, on ? 26 : 34);
      soap2.im.style.filter = SHADOW(on ? 26 : 34) + (on ? ' blur(' + (3 * Math.sin(fr * Math.PI)).toFixed(2) + 'px)' : '');
      foam.forEach((f) => { const a = seg(t, f.t, f.t + 1.2); f.d.style.opacity = (Math.sin(Math.PI * a) * 0.95).toFixed(3); f.d.style.transform = 'translate(' + (f.x + Math.sin(a * 4 + f.k) * 18).toFixed(1) + 'px,' + (f.y - 120 * o3(a)).toFixed(1) + 'px) scale(' + (0.5 + 0.5 * o3(a)).toFixed(3) + ')'; });
      void n;
    };

    // ================================================================ card 3: „Pielea se apără producând și mai mult sebum.” — the pencil draws the loop
    T.c3 = CUT[3];
    txt(C[3], 330, 'pielea se apără', 'font:560 70px/1.1 ' + SANS, T.c3 + B * 0.5, 'stag', { stagger: 0.12 });
    txt(C[3], 432, 'producând <span class="ser" style="font-size:1.4em;color:' + DEEP + '">și mai mult</span>', 'font:560 64px/1.1 ' + SANS, T.c3 + B, 'rise', { fit: 730 });
    txt(C[3], 600, 'SEBUM', 'font-size:300px', T.c3 + B * 2, 'slam', { cls: 'cond', fit: 730 });
    const loop3 = svg(C[3], 1080, 1920, '<path class="lp" d="M780 640C930 760 900 1000 700 1050C520 1095 270 1060 205 920C150 800 230 640 400 600C520 572 660 590 742 620" fill="none" stroke="' + DEEP + '" stroke-width="9" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/><path class="ah" d="M700 588L748 622L700 660" fill="none" stroke="' + DEEP + '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>', 'left:0;top:0');
    const lpPath = loop3.querySelector('.lp'), ah = loop3.querySelector('.ah'), LPL = lpPath.getTotalLength ? lpPath.getTotalLength() : 1;
    const pen3 = obj(C[3], 'pencil', 0, 0, 640, 1176, 101); pen3.im.style.transformOrigin = '0px 43px';
    T.l0 = TB(32); T.l1 = TB(34);
    for (let tt = T.l0; tt < T.l1; tt += 0.07) cue(tt, 'grain', 0.28); ev(T.l0, 'reveal'); ev(T.l0 + 0.5, 'step'); ev(T.l1, 'step'); cue(T.l1, 'tick_soft', 0.5); cue(T.l0 - 0.35, 'tap', 0.35);
    C[3]._tick = (t) => {
      const q = io(seg(t, T.l0, T.l1)); lpPath.style.strokeDashoffset = (1 - q).toFixed(4); ah.setAttribute('opacity', t >= T.l1 ? '1' : '0');
      const pin = ex(seg(t, T.l0 - 0.45, T.l0)), pout = io(seg(t, T.l1 + 0.15, T.l1 + 0.7));
      let px = 780, py = 640; if (lpPath.getPointAtLength) { const p = lpPath.getPointAtLength(LPL * q); px = p.x; py = p.y; }
      setObj(pen3, px + (1 - pin) * 400 + pout * 520, py - 43 + (1 - pin) * 240 + pout * 300, -34 + (1 - pin) * -10, 1, clamp(pin * 3) * (1 - pout), 60 + (1 - pin) * 60);
    };

    // ================================================================ card 4: „Mai mult săpun nu e răspunsul. Echilibrul este.” — the level's bubble settles
    T.c4 = CUT[4];
    txt(C[4], 320, 'MAI MULT SĂPUN', 'font-size:170px', T.c4 + B * 0.5, 'slam', { cls: 'cond', fit: 730 });
    txt(C[4], 500, 'nu e răspunsul.', 'font:560 70px/1.1 ' + SANS, T.c4 + B * 1.5, 'stag', { stagger: 0.12 });
    const lvl = obj(C[4], 'level', 120, 760, 840, 1103, 139);
    const LV = { x0: 484, x1: 632, y0: 49, y1: 88 }, lk = 840 / 1103;
    const vial = mk(C[4], 'position:absolute;left:' + (120 + LV.x0 * lk) + 'px;top:' + (760 + LV.y0 * lk) + 'px;width:' + ((LV.x1 - LV.x0) * lk) + 'px;height:' + ((LV.y1 - LV.y0) * lk) + 'px;border-radius:14px;overflow:hidden;background:linear-gradient(180deg,#bff0e9,#7fdccf 55%,#5fc9bb);box-shadow:inset 0 2px 4px rgba(255,255,255,.7),inset 0 -3px 6px rgba(11,127,116,.35)');
    const vw = (LV.x1 - LV.x0) * lk, vh = (LV.y1 - LV.y0) * lk;
    mk(vial, 'position:absolute;left:' + (vw / 2 - 24) + 'px;top:0;width:3px;height:100%;background:rgba(18,32,31,.75)'); mk(vial, 'position:absolute;left:' + (vw / 2 + 21) + 'px;top:0;width:3px;height:100%;background:rgba(18,32,31,.75)');
    const vb = mk(vial, 'position:absolute;top:' + (vh * 0.12) + 'px;width:36px;height:' + (vh * 0.62) + 'px;margin-left:-18px;border-radius:50%;background:radial-gradient(ellipse at 40% 35%,#ffffff 0,rgba(255,255,255,.9) 40%,rgba(235,250,248,.7) 80%);box-shadow:0 0 0 1.5px rgba(11,127,116,.35)');
    const ech = txt(C[4], 1010, '<span class="ser" style="font-size:2.2em;color:' + DEEP + '">Echilibrul</span> este.', 'font:560 66px/1.1 ' + SANS, TB(41), 'rise');
    T.lv0 = TB(38); T.lv1 = TB(39); T.lvl = TB(40); T.set = TB(40.75);
    cue(T.lv1, 'tap', 0.6); ev(T.lv1, 'drop'); cue(T.lvl, 'tick_soft', 0.4); ev(T.lvl, 'step'); cue(T.set, 'glass_pulse', 0.55, { prio: 3 }); ev(T.set, 'reveal');
    C[4]._tick = (t) => {
      const lin = ex(seg(t, T.lv0, T.lv1)), lev = io(seg(t, T.lvl - 0.15, T.lvl + 0.35)), tilt = lerp(-5.5, 0, lev);
      const dy = (1 - lin) * 520, rot = tilt * lin + (1 - lin) * -9;
      setObj(lvl, (1 - lin) * -60, dy, rot, 1, clamp(lin * 3), 30 + (1 - lin) * 80); lvl.im.style.transformOrigin = '420px 53px';
      vial.style.transformOrigin = (420 - LV.x0 * lk) + 'px ' + (53 - LV.y0 * lk) + 'px'; vial.style.transform = 'translate(' + ((1 - lin) * -60).toFixed(2) + 'px,' + dy.toFixed(2) + 'px) rotate(' + rot.toFixed(3) + 'deg)'; vial.style.opacity = clamp(lin * 3).toFixed(3);
      // the bubble sits at the high end while the level is tilted, then glides to the middle and settles with a small overshoot
      const bp = t < T.lvl ? 0.86 : 0.5 + 0.36 * Math.exp(-5.2 * (t - T.lvl)) * Math.cos(9 * (t - T.lvl));
      vb.style.left = (bp * vw).toFixed(2) + 'px';
      void ech;
    };

    // ================================================================ card 5: „Acasă: curățare blândă, hidratare și SPF.” — the note, taped
    T.c5 = CUT[5];
    const note = obj(C[5], 'note', 236, 360, 608, 591, 848);
    const tapes = [[250, 372, -38], [770, 372, 36]].map(([x, y, r]) => { const d = mk(C[5], 'position:absolute;left:' + (x - 80) + 'px;top:' + (y - 26) + 'px;width:160px;height:52px;background:linear-gradient(180deg,rgba(250,247,238,.82),rgba(240,236,224,.78));box-shadow:0 2px 3px rgba(24,40,38,.12);clip-path:polygon(0 8%,4% 0,9% 10%,14% 0,20% 8%,80% 6%,86% 0,91% 9%,96% 0,100% 7%,100% 92%,95% 100%,90% 91%,84% 100%,78% 93%,20% 95%,14% 100%,9% 90%,4% 100%,0 92%)'); return { d, r }; });
    const nt = mk(C[5], 'position:absolute;left:0;top:0;width:1080px;height:1920px');
    txt(nt, 520, 'Acasă:', 'left:310px;width:540px;text-align:left;font-size:120px;line-height:1;color:' + DEEP, TB(45.5), 'rise', { cls: 'ser' });
    const items = ['curățare blândă', 'hidratare', 'SPF'].map((s, k) => {
      const at = TB(46 + k * 0.5), y = 700 + k * 120;
      const B0 = txt(nt, y, esc(s), 'left:384px;width:460px;text-align:left;font:600 58px/1.1 ' + SANS + ';color:' + INK, at, 'rise');
      const ck = svg(nt, 60, 60, '<circle cx="30" cy="30" r="27" fill="' + TEAL + '"/><path d="M17 31l9 9 17-19" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>', 'left:308px;top:' + (y + 4) + 'px');
      return { B0, ck, at, s };
    });
    const pen5 = obj(C[5], 'pencil', 0, 0, 560, 1176, 101); pen5.im.style.transformOrigin = '280px 24px'; T.pen5 = TB(49);
    cue(T.pen5 + 0.4, 'tap', 0.45); ev(T.pen5 + 0.4, 'drop');
    T.n0 = T.c5 + B * 0.5;
    cue(T.n0 + 0.3, 'card_flip', 0.6); ev(T.n0 + 0.3, 'drop'); tapes.forEach((q, k) => { q.at = TB(45 + k * 0.25); cue(q.at, 'tap', 0.4); ev(q.at, 'step'); }); items.forEach((q) => { cue(q.at + 0.12, 'tick_soft', 0.45); });
    C[5]._tick = (t) => {
      { const q = ex(seg(t, T.pen5, T.pen5 + 0.45)), bn = t > T.pen5 + 0.4 ? Math.exp(-8 * (t - T.pen5 - 0.4)) * Math.sin(20 * (t - T.pen5 - 0.4)) : 0; setObj(pen5, 470 + (1 - q) * 520, 1330 + (1 - q) * 160 + bn * 3, -8 + (1 - q) * -14 + bn * 0.8, 1, clamp(q * 3), 26 + (1 - q) * 70); }
      const a = ex(seg(t, T.n0, T.n0 + 0.55));
      setObj(note, (1 - a) * 80, (1 - a) * 420, -2 + (1 - a) * 8, 1, clamp(a * 3), 22 + (1 - a) * 90); note.im.style.transformOrigin = '304px 436px';
      nt.style.transform = 'translate(' + ((1 - a) * 80).toFixed(1) + 'px,' + ((1 - a) * 420).toFixed(1) + 'px) rotate(' + (-2 + (1 - a) * 8).toFixed(3) + 'deg)'; nt.style.transformOrigin = '540px 796px';
      tapes.forEach((q) => { const b = seg(t, q.at, q.at + 0.25); q.d.style.opacity = clamp(b * 4).toFixed(3); q.d.style.transform = 'rotate(' + q.r + 'deg) scale(' + (1.25 - 0.25 * ex(b)).toFixed(3) + ')'; });
      items.forEach((q) => { const b = seg(t, q.at + 0.1, q.at + 0.45); q.ck.querySelector('path').style.strokeDashoffset = (1 - io(b)).toFixed(4); q.ck.style.opacity = clamp(b * 4).toFixed(3); q.ck.style.transform = 'scale(' + back(b, 2).toFixed(3) + ')'; });
    };

    // ================================================================ the camera: a fast vertical push to each card on its beat, then it holds
    const MD = 0.5;
    CUT.slice(1).forEach((c) => { cue(c, 'whoosh_cut', 0.6, { peak: true, prio: 4 }); R.event(c, 'cut'); cue(c + 0.36, 'pulse', 0.35); });
    function camY(t) { let y = CY(0) - 100 + 230 * (1 - sm(seg(t, -0.3, T.pop))) * (t < T.pop ? 1 : 0); for (let k = 1; k < CUT.length; k++) y += GAP * R.cam.ease(t, CUT[k], MD); return y; }
    let lastT = null;
    W.draw = (t) => {
      if (t === lastT) return; lastT = t;
      const y = camY(t), v = (camY(t + 1 / 120) - camY(t - 1 / 120)) * 60 / 30;   // px a frame
      const pd = t - T.pop, punch = pd > 0 ? 0.09 * Math.exp(-5 * pd) : 0, trem = pd > 0 && pd < 0.3 ? Math.sin(pd * 90) * 6 * (1 - pd / 0.3) : 0;
      const drift = Math.sin(t * 0.33) * 0.25;
      cam.style.transform = 'translate(' + trem.toFixed(2) + 'px,0) rotate(' + drift.toFixed(3) + 'deg) scale(' + (1 + punch + 0.008 * Math.sin(t * 0.4)).toFixed(4) + ')';
      desk.style.transform = 'translate(0,' + (960 - y).toFixed(2) + 'px)';
      if (Math.abs(v) > 3) { fblur.setAttribute('stdDeviation', '0 ' + Math.min(80, Math.abs(v) * 0.38).toFixed(1)); desk.style.filter = 'url(#br-mb) blur(0px)'; } else desk.style.filter = Math.abs(v) > 0.2 ? 'blur(0px)' : '';
      pop.style.opacity = (R.cam.flash(t, T.pop) * 0.55).toFixed(3);
      cards.forEach((c, k) => { const on = Math.abs(CY(k) - y) < 1780; c.el.style.display = on ? 'block' : 'none'; if (on && c.el._tick) c.el._tick(t); });
      for (const b of blocks) {
        const p = seg(t, b.at, b.at + b.dur), e = ex(p);
        if (b.ws) b.ws.forEach((w, i) => { const q = seg(t, b.at + i * b.stagger, b.at + i * b.stagger + 0.4), f = ex(q); w.style.opacity = clamp(q * 3).toFixed(3); w.style.transform = 'translateY(' + ((1 - f) * 40).toFixed(1) + 'px)'; });
        else if (b.mode === 'slam') { b.el.style.transform = 'scale(' + (1.45 - 0.45 * e).toFixed(4) + ')'; b.el.style.opacity = clamp(p * 3).toFixed(3); }
        else { b.el.style.transform = 'translateY(' + ((1 - e) * 46).toFixed(2) + 'px)'; b.el.style.opacity = clamp(p * 2.5).toFixed(3); }
        b.el.style.filter = p < 1 ? 'blur(' + (b.mode === 'slam' ? (1 - e) * 22 : (1 - e) * 8).toFixed(2) + 'px)' : '';
        b.el.style.visibility = t < b.at - 0.01 ? 'hidden' : '';
      }
    };
    return W;
  }
  V['br-desk'] = (ctx) => { const w = build(); ctx.tick(w.draw); };
})();
