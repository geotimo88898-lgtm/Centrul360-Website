// Centrul360 reels v2: the editorial collage (v2-ems-intinsa, 15.11; formats x and x-b). One sheet of white paper, a
// camera that floats over it (a slow push, a little roll and tilt: nothing ever stands still) and travels from poster to
// poster with a directional motion blur; black and white photographic cut-outs (scripts/<id>/objects, one style, made
// once by objects.py) float above the paper with their own shadows, so they shift against it when the camera tilts;
// serif display type (Fraunces, the site's serif) mixed with the site's sans; turquoise accents; rose gold only on the
// marker circle around „20.000”.
// Objects act on the type: the magnifier enlarges the headword of a dictionary card and the camera pushes through its
// lens into the card (the big move); a marker circle is drawn around the number; a word flips in place.
// Like the dive, the reel is one world built by the first shot; the engine's shots ("cj-*") are its clock and their
// "transitions" are the names of the camera's moves (glide, lens, tilt, crane, drop, drift, slide-sheet, pull-wide).
// Every claim is the site's wording (tonifiere-musculara.html). The objects are symbols, never proof.
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, lerp, E, h, esc } = R;
  const TYPES = ['cj-recline', 'cj-dumbbell', 'cj-define', 'cj-pulse', 'cj-stopwatch', 'cj-count', 'cj-relax', 'cj-course', 'cj-send'];
  ['glide', 'lens', 'tilt', 'crane', 'drop', 'drift', 'slide-sheet', 'pull-wide'].forEach((n) => { R.TR[n] = { dur: 0.5, in() {}, out() {} }; });
  const SANS = "'Inter Variable',system-ui,sans-serif", SERIF = "'Fraunces Variable',Georgia,serif", MONO = "'JetBrains Mono Variable',monospace";
  const INK = '#12201f', TEAL = '#14a596', DEEP = '#0b7f74', MUTE = '#5e6d6b';
  const sm = (p) => { p = clamp(p); return p * p * (3 - 2 * p); };
  const io = (p) => E.inout(clamp(p)), ex = (p) => E.expo(clamp(p)), o3 = (p) => E.out(clamp(p));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const back = (p, c = 1.4) => { p = clamp(p); const c3 = c + 1; return 1 + c3 * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  const rnd = (i, k = 1) => R.rnd(i + 0.41, k);
  function profile(pc, nIn, nOut) { const N = 400, tb = [0]; let s = 0; for (let i = 1; i <= N; i++) { const p = (i - 0.5) / N; s += p < pc ? Math.pow(p / pc, nIn) : Math.pow((1 - p) / (1 - pc), nOut); tb.push(s); } return (p) => { p = clamp(p) * N; const i = Math.min(N - 1, Math.floor(p)); return (tb[i] + (tb[i + 1] - tb[i]) * (p - i)) / s; }; }
  const ASPECT = { statue: 1120 / 657, dumbbell: 864 / 519, stopwatch: 612 / 807, magnifier: 735 / 638, plane: 849 / 477 };
  const LIGHT = [0.3, 0.42];   // the light is upper left: a shadow falls right and down, further the higher the object floats

  let W = null;
  function build() {
    if (W) return W;
    W = {};
    const S0 = R.script, shots = TYPES.map((tp) => R.shots.find((s) => s.vis.type === tp)), L = shots.map((s) => s.lines[0]), S = shots.map((s) => s.t0), total = R.total;
    const OBJ = R.ROOT + '/reels/scripts/' + S0.id + '/objects/';
    // the words' times, measured on the voice (script "words", wordtimes.py); else the engine's estimate
    const WT = L.map((ln, i) => { const m = S0.words && S0.words['L' + i]; return m && ln.voiced ? m.map(([w, t]) => ({ w, t: ln.t0 + t })) : ln.words.map((x) => ({ w: x.w, t: x.t })); });
    const nrm = (x) => x.toLowerCase().replace(/[^a-zăâîșț0-9-]/g, '');
    const wt = (i, re, dflt) => { const w = WT[i].find((x) => re.test(nrm(x.w))); return w ? w.t : (dflt != null ? L[i].t0 + dflt : L[i].t0); };

    // ---------------------------------------------------------------- the DOM
    const world = document.getElementById('world');
    const root = h('div', 'shot cj-world'); world.insertBefore(root, world.firstChild);
    root.style.cssText = 'display:block;opacity:1;z-index:-1;overflow:hidden;background:#fbfbf9';
    h('style', null, '#sweep,#flash{display:none!important}' +
      '.cj-world .tx,.cj-world .cjb{position:absolute;left:0;width:1080px;text-align:center;white-space:nowrap;color:' + INK + ';font:600 60px/1.1 ' + SANS + ';letter-spacing:-.02em}' +
      '.cj-world .ln{display:block;width:max-content;margin:0 auto}' +
      '.cj-world .w{display:inline-block;overflow:hidden;vertical-align:bottom;padding:.12em .1em .24em;margin:-.12em -.1em -.24em}.cj-world .wi{display:inline-block;will-change:auto}' +
      '.cj-world .k{font-family:' + SERIF + ';font-style:italic;font-weight:470;letter-spacing:-.02em;color:' + DEEP + '}' +
      '.cj-world .kick{font:650 30px/1 ' + SANS + ';letter-spacing:.3em;text-transform:uppercase;color:' + MUTE + '}' +
      '.cj-world .ser{font-family:' + SERIF + ';font-weight:580;letter-spacing:-.025em}' +
      '.cj-world img{position:absolute;display:block}.cj-world .p{position:absolute;width:1080px;height:1920px}', root);
    root.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute"><defs><filter id="cj-blur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="0 0"/></filter></defs></svg>');
    const fblur = root.querySelector('#cj-blur feGaussianBlur');
    const mk = (par, css, cls, html) => { const d = h('div', cls || null, html != null ? html : null, par); if (css) d.style.cssText = css; return d; };
    const mbO = mk(root, 'position:absolute;left:-660px;top:-240px;width:2400px;height:2400px;transform-origin:1200px 1200px');
    const mbF = mk(mbO, 'position:absolute;inset:0');
    const mbI = mk(mbF, 'position:absolute;inset:0;transform-origin:1200px 1200px');
    const stage = mk(mbI, 'position:absolute;left:660px;top:240px;width:1080px;height:1920px');
    const cam = mk(stage, 'position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0');
    const PER = 2100; let C = { x: 0, y: 0, z: 1, r: 0, tx: 0, ty: 0 };   // the camera now (the objects read it): how far above the paper an object floats decides how much it shifts
    // the paper: fine grain, the grid of the brand as faint technical lines, registration crosses
    const tile = (() => { const c = document.createElement('canvas'); c.width = c.height = 320; const x = c.getContext('2d'), im = x.createImageData(320, 320); let s = 4321987;
      for (let i = 0; i < im.data.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; const v = 120 + ((s >> 9) & 127); im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 20; } x.putImageData(im, 0, 0); return c.toDataURL(); })();
    const paper = mk(cam, 'position:absolute;left:-2600px;top:-2600px;width:11400px;height:10600px;background-color:#fbfbf9;background-image:url(' + tile + '),linear-gradient(rgba(20,165,150,.085) 2px,transparent 0),linear-gradient(90deg,rgba(20,165,150,.085) 2px,transparent 0);background-size:320px 320px,108px 108px,108px 108px;background-position:0 0,-1px -1px,-1px -1px');
    const between = (a, b, k) => { const x = (a.cx + b.cx) / 2, y = (a.cy + b.cy) / 2; mk(cam, 'position:absolute;left:' + (x - 60) + 'px;top:' + (y - 60) + 'px;width:120px;height:120px;border-radius:50%;' + (k % 2 ? 'background:' + TEAL + ';opacity:.9' : 'border:5px solid ' + TEAL + ';box-sizing:border-box')); };
    const posters = [];
    const P = (i, cx, cy) => { const d = mk(cam, 'left:' + (cx - 540) + 'px;top:' + (cy - 960) + 'px', 'p'); const o = { el: d, cx, cy, i, ticks: [] }; posters[i] = o; return o; };
    // light over everything: daylight from the upper left, a faint shade lower right, grain
    mk(root, 'position:absolute;inset:0;pointer-events:none;z-index:8;mix-blend-mode:multiply;background:radial-gradient(ellipse 1500px 1700px at 100% 104%,rgba(18,60,56,.13),rgba(18,60,56,0) 62%),radial-gradient(ellipse 900px 700px at -6% -4%,rgba(18,60,56,.045),rgba(18,60,56,0) 70%)');

    // ---------------------------------------------------------------- helpers: cut-out objects with their shadows, kinetic words
    function obj(par, name, x, y, w, o = {}) {
      const hh = w / ASPECT[name], css = 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + hh + 'px;transform-origin:' + (o.ox != null ? o.ox : 50) + '% ' + (o.oy != null ? o.oy : 50) + '%';
      const sh = h('img', null, null, par.el); sh.src = OBJ + name + '.png'; sh.style.cssText = css;
      const im = h('img', null, null, par.el); im.src = OBJ + name + '.png'; im.style.cssText = css;
      const O = { im, sh, x, y, w, h: hh, so: o.so != null ? o.so : 0.3, wx: par.cx - 540 + x + w / 2, wy: par.cy - 960 + y + hh / 2 };
      O.par = (dx, dy, Z) => { const k = Z / PER; return [(O.wx + dx - C.x) * k + C.ty * Z * 0.016, (O.wy + dy - C.y) * k - C.tx * Z * 0.016, 1 + k * 0.9]; };
      O.set = (dx, dy, rot, sc, op, Z) => { Z = Z == null ? 120 : Z; sc = sc == null ? 1 : sc; const pr = O.par(dx, dy, Z), tr = ' rotate(' + (rot || 0).toFixed(3) + 'deg) scale(';
        im.style.transform = 'translate(' + (dx + pr[0]).toFixed(2) + 'px,' + (dy + pr[1]).toFixed(2) + 'px)' + tr + (sc * pr[2]).toFixed(4) + ')'; im.style.opacity = (op == null ? 1 : op).toFixed(3);
        sh.style.transform = 'translate(' + (dx + LIGHT[0] * Z).toFixed(2) + 'px,' + (dy + LIGHT[1] * Z).toFixed(2) + 'px)' + tr + sc.toFixed(4) + ')'; sh.style.opacity = ((op == null ? 1 : op) * O.so * (1 - Math.min(0.5, Z / 900))).toFixed(3);
        sh.style.filter = 'brightness(0) blur(' + (7 + Z * 0.13).toFixed(1) + 'px)'; O.last = [dx + pr[0], dy + pr[1], sc * pr[2]]; };
      return O;
    }
    // "text|sync" tokens; *key* in the italic serif; every word rises from behind its own baseline exactly when it is said
    const kin = [];
    function words(par, Li, lines, css, o = {}) {
      const el = h('div', (o.noTx ? 'cjb' : 'tx') + (o.cls ? ' ' + o.cls : ''), null, par); el.style.cssText = css; if (o.q) el.dataset.q = '1';
      const K = { el, ws: [], o }; let last = -1; const LW = WT[Li];
      lines.forEach((ln) => { const row = h('div', 'ln', null, el); const m = /^(\d+)(s?):/.exec(ln); if (m) { row.style.fontSize = m[1] + 'px'; row.style.lineHeight = '1.07'; if (m[2]) row.classList.add('ser'); ln = ln.slice(m[0].length); }
        ln.split(/(\*[^*]+\*)/).forEach((part) => { if (!part) return; const key = /^\*/.test(part);
          part.replace(/\*/g, '').split(/\s+/).filter(Boolean).forEach((tok) => { const [txt, sync] = tok.split('|'); const want = nrm(sync || txt);
            let k = LW.findIndex((x, i) => i > last && (sync ? nrm(x.w).startsWith(want) : nrm(x.w) === want)); if (k < 0) k = last; else last = k;
            const s = h('span', 'w' + (key ? ' k' : ''), '<span class="wi">' + esc(txt.replace(/_/g, ' ')) + '</span>', row); row.appendChild(document.createTextNode(' '));
            const tw = (o.at != null ? o.at + K.ws.length * (o.stagger || 0.09) : (k >= 0 ? LW[k].t : L[Li].t0)) - 0.08, cap = (Li < 8 ? S[Li + 1] - TA : 1e9) - (key ? 1.0 : 0.85);
            K.ws.push({ s, wi: s.firstChild, key, t: Math.min(tw, cap + K.ws.length * 0.05) }); }); }); });
      [...el.querySelectorAll('.ln')].forEach((x) => { let fs = parseFloat(x.style.fontSize) || parseFloat(el.style.fontSize) || 60; while (fs > 30 && x.offsetWidth > (o.max || 756)) { fs -= 2; x.style.fontSize = fs + 'px'; } });
      K.t0 = K.ws[0].t; kin.push(K); return K;
    }
    const txt = (par, html, css, cls) => { const d = h('div', 'tx' + (cls ? ' ' + cls : ''), html, par); d.style.cssText = css; return d; };
    const cue = (t, cat, gain, o) => R.cue(t, cat, gain, o), ev = (t, kind) => R.event(t, kind || 'step');
    const svg = (par, w, hh, inner, css) => { const d = mk(par, 'position:absolute;' + (css || '')); d.innerHTML = '<svg width="' + w + '" height="' + hh + '" viewBox="0 0 ' + w + ' ' + hh + '" style="display:block;overflow:visible">' + inner + '</svg>'; return d; };
    const crop = (par) => svg(par, 1080, 1920, [[150, 268], [930, 268], [150, 1500], [930, 1500]].map(([x, y]) => '<path d="M' + (x - 16) + ' ' + y + 'h32M' + x + ' ' + (y - 16) + 'v32" stroke="' + INK + '" stroke-opacity=".22" stroke-width="2" fill="none"/>').join(''), 'left:0;top:0');

    // ================================================================ the posters
    const T = {}, TA = 0.24, TB = 0.6;   // a travel starts TA before its cut and lands TB after it
    // ---- P0: „Există un antrenament la care stai întinsă.” The reclining marble figure, a turquoise sun behind her
    const p0 = P(0, 0, 0); crop(p0.el);
    const disc = mk(p0.el, 'position:absolute;left:452px;top:516px;width:510px;height:510px;border-radius:50%;background:radial-gradient(circle at 34% 28%,#3cc9ba,#14a596 58%,#0f9486);box-shadow:26px 34px 60px -18px rgba(11,127,116,.38)');
    const statue0 = obj(p0, 'statue', 70, 598, 940, { z: 150, so: 0.34 });
    words(p0.el, 0, ['există un'], 'top:296px', { cls: 'kick' });
    const w0 = words(p0.el, 0, ['antrenament'], 'top:336px;font-size:150px;line-height:1.1', { cls: 'ser', q: 1 });
    words(p0.el, 0, ['60:la care stai', '184:*întinsă.*'], 'top:1194px', { q: 1 });
    void w0;
    T.in0 = wt(0, /^întinsă/, 1.7);
    cue(0.5, 'tap', 0.5); ev(0.5, 'drop'); cue(T.in0, 'tick_soft', 0.5); ev(T.in0, 'reveal'); ev(1.2, 'step');
    p0.ticks.push((t) => { const a = ex(seg(t, -0.3, 0.75)), fl = Math.sin(t * 0.9) * 5;
      statue0.set((1 - a) * 300, fl, (1 - a) * 2.5 + Math.sin(t * 0.6) * 0.25, 1, clamp((t + 0.3) * 4), 150 + Math.sin(t * 0.7) * 16);
      const d = back(seg(t, -0.3, 0.7), 1.1); disc.style.transform = 'translate(' + (Math.sin(t * 0.5) * 6 + (p0.cx - C.x) * 0.02 + C.ty * 0.7).toFixed(2) + 'px,' + ((1 - d) * 120 - C.tx * 0.7).toFixed(2) + 'px) scale(' + (0.7 + 0.3 * d).toFixed(4) + ')'; disc.style.opacity = clamp((t + 0.3) * 3).toFixed(3); });

    // ---- P1: „…mușchiul lucrează mai mult decât ar putea la sală.” The dumbbell
    const p1 = P(1, 1420, 300); crop(p1.el);
    const ring1 = svg(p1.el, 760, 760, '<circle cx="380" cy="380" r="372" fill="none" stroke="' + TEAL + '" stroke-width="3" stroke-dasharray="3 15" stroke-linecap="round"/>', 'left:160px;top:598px;transform-origin:380px 380px');
    const mm = words(p1.el, 1, ['60:mușchiul lucrează', '214:*mai mult*'], 'top:300px');
    const und = svg(p1.el, 640, 40, '<path d="M8 22C120 6 260 30 380 16S560 8 632 20" fill="none" stroke="' + TEAL + '" stroke-width="10" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>', 'left:220px;top:590px');
    const dumb1 = obj(p1, 'dumbbell', 130, 716, 820, { z: 170, so: 0.36 });
    words(p1.el, 1, ['56:decât ar putea', '112s:la sală'], 'top:1288px');
    T.mult = wt(1, /^mai$/, 1.4); T.sala = wt(1, /^sală/, 2.5);
    cue(T.mult, 'tick_soft', 0.5); ev(T.mult, 'reveal'); cue(S[1] + 0.42, 'tap', 0.6); ev(S[1] + 0.42, 'drop'); cue(T.sala, 'tick_soft', 0.4); ev(T.sala, 'step');
    p1.ticks.push((t) => { const lt = t - S[1], d = seg(lt, -0.1, 0.42), fall = 1 - d * d, bnc = lt > 0.42 ? Math.exp(-7 * (lt - 0.42)) * Math.cos(18 * (lt - 0.42)) : 0;
      dumb1.set(0, -fall * 60 + Math.sin(t * 0.8) * 4, -9 + fall * -6 + bnc * 1.6 + Math.sin(t * 0.5) * 0.4, 1 + 0.02 * bnc, clamp((lt + 0.2) * 5), 170 + fall * 260 - bnc * 30 + Math.sin(t * 0.7) * 12);
      ring1.style.transform = 'rotate(' + (t * 5).toFixed(2) + 'deg) scale(' + (0.9 + 0.1 * ex(seg(lt, 0, 0.9))).toFixed(4) + ')'; ring1.style.opacity = sm(seg(lt, 0, 0.5)).toFixed(3);
      und.querySelector('path').style.strokeDashoffset = (1 - io(seg(t, T.mult + 0.2, T.mult + 0.75))).toFixed(4); });
    void mm;

    // ---- P2: „Se numește EMS, adică electrostimulare magnetică.” A dictionary card; the magnifier enlarges the headword, the camera goes through its lens
    const p2 = P(2, 1420, 2420);
    const CARD = { x: 340, y: 664, k: 1 / 2.7, tilt: -3 };            // the card is the definition poster, printed at 1 / 2.7
    const cardHtml = '<div class="hw" style="position:absolute;left:0;width:1080px;top:356px;text-align:center;font:620 250px/1 ' + SERIF + ';letter-spacing:-.02em;color:' + INK + '">EMS</div>' +
      '<div style="position:absolute;left:0;width:1080px;top:642px;text-align:center;font:500 40px/1 ' + MONO + ';letter-spacing:.04em;color:' + MUTE + '">[ e-em-es ]</div>' +
      '<div style="position:absolute;left:190px;width:700px;top:748px;height:2px;background:' + INK + ';opacity:.16"></div>' +
      '<div class="df" style="position:absolute;left:0;width:1080px;top:800px;text-align:center;font:italic 470 104px/1.12 ' + SERIF + ';letter-spacing:-.02em;color:' + DEEP + '"><span class="m1" style="position:relative;z-index:0">electrostimulare</span><br><span class="m2" style="position:relative;z-index:0">magnetică</span></div>' +
      '<div style="position:absolute;left:180px;width:720px;top:1100px;text-align:center;white-space:normal;font:500 38px/1.42 ' + SANS + ';letter-spacing:-.005em;color:#2f3f3d">trimite impulsuri care fac mușchiul să se contracte mult mai intens și mai des decât la antrenamentul clasic</div>';
    const cardBox = mk(p2.el, 'position:absolute;left:' + (CARD.x - 28) + 'px;top:' + (CARD.y - 30) + 'px;width:456px;height:771px;border-radius:10px;background:linear-gradient(170deg,#ffffff,#f6f8f7);transform-origin:228px 386px;' +
      'box-shadow:0 0 0 1px rgba(18,32,31,.06),3px 4px 0 #eef1f0,6px 8px 0 #e4e8e7,26px 44px 70px -24px rgba(18,32,31,.32),10px 16px 22px -12px rgba(18,32,31,.2)');
    const cardIn = mk(cardBox, 'position:absolute;left:28px;top:30px;width:1080px;height:1920px;transform-origin:0 0;transform:scale(' + CARD.k + ')', 'tx cj-card', cardHtml);
    cardIn.style.whiteSpace = 'normal';
    const hl = ['m1', 'm2'].map((c) => { const sp = cardIn.querySelector('.' + c), m = h('i', null, null, sp); m.style.cssText = 'position:absolute;left:-10px;right:-10px;bottom:10px;height:44px;border-radius:8px;background:' + TEAL + ';opacity:.26;z-index:-1;transform-origin:0 50%;transform:scaleX(0)'; return m; });
    const kick2 = words(p2.el, 2, ['se numește'], 'top:452px;font-size:60px');
    kick2.out = wt(2, /^adică/, 1.15) - 0.3;
    // the magnifier: the photograph's handle, a crisp ring over its rim, clear glass with a highlight, and inside it the card, larger
    const LR = 150, MW = 540, MK = MW / 735, lensC = [CARD.x + 540 * CARD.k, CARD.y + 486 * CARD.k];   // the lens rests over „EMS”
    const mg = mk(p2.el, 'position:absolute;left:' + lensC[0] + 'px;top:' + lensC[1] + 'px;width:0;height:0');
    const mgSh = mk(mg, 'position:absolute;left:' + (-LR - 8) + 'px;top:' + (-LR - 8) + 'px;width:' + (2 * LR + 16) + 'px;height:' + (2 * LR + 16) + 'px;border-radius:50%;box-shadow:54px 70px 50px -14px rgba(18,32,31,.3)');
    const mgHandleSh = h('img', null, null, mg); mgHandleSh.src = OBJ + 'magnifier.png'; mgHandleSh.style.cssText = 'left:' + (-233.8 * MK + 40) + 'px;top:' + (-233 * MK + 54) + 'px;width:' + MW + 'px;filter:brightness(0) blur(18px);opacity:.24;clip-path:polygon(60% 55%,100% 55%,100% 100%,55% 100%)';
    const lens = mk(mg, 'position:absolute;left:' + -LR + 'px;top:' + -LR + 'px;width:' + 2 * LR + 'px;height:' + 2 * LR + 'px;border-radius:50%;overflow:hidden;background:#fbfbf9');
    const lensIn = mk(lens, 'position:absolute;left:' + LR + 'px;top:' + LR + 'px;width:0;height:0;transform-origin:0 0');
    const clone = cardBox.cloneNode(true); clone.querySelectorAll('.tx').forEach((e) => e.classList.remove('tx')); clone.style.left = (CARD.x - 28 - lensC[0]) + 'px'; clone.style.top = (CARD.y - 30 - lensC[1]) + 'px'; lensIn.appendChild(clone);
    mk(lens, 'position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 30% 24%,rgba(255,255,255,.75) 0,rgba(255,255,255,.18) 22%,rgba(255,255,255,0) 44%),radial-gradient(circle at 50% 50%,rgba(20,165,150,0) 62%,rgba(20,165,150,.1) 88%,rgba(18,32,31,.22) 100%)');
    const mgImg = h('img', null, null, mg); mgImg.src = OBJ + 'magnifier.png'; mgImg.style.cssText = 'left:' + (-233.8 * MK) + 'px;top:' + (-233 * MK) + 'px;width:' + MW + 'px';
    const rim = mk(mg, 'position:absolute;left:' + (-LR - 13) + 'px;top:' + (-LR - 13) + 'px;width:' + (2 * LR + 26) + 'px;height:' + (2 * LR + 26) + 'px;border-radius:50%;' +
      'background:conic-gradient(from 210deg,#2a2d2d,#5d6362 12%,#8e9695 18%,#3a3e3e 30%,#1c1f1f 52%,#4a4f4e 70%,#262929 86%,#2a2d2d);-webkit-mask:radial-gradient(circle,transparent ' + (LR - 0.5) + 'px,#000 ' + (LR + 0.5) + 'px);mask:radial-gradient(circle,transparent ' + (LR - 0.5) + 'px,#000 ' + (LR + 0.5) + 'px)');
    T.ems = wt(2, /^ems/, 0.8); T.push = wt(2, /^adică/, 1.15) - 0.12; T.pushEnd = T.push + 0.74; T.el = Math.max(wt(2, /^electro/, 1.6) + 0.1, T.pushEnd + 0.03); T.mag = wt(2, /^magnetică/, 2.7);
    cue(T.ems - 0.12, 'tap', 0.55); ev(T.ems - 0.12, 'drop'); cue(T.push + 0.33, 'whoosh_l', 0.8, { peak: true, prio: 3 }); ev(T.push + 0.33, 'reveal'); cue(T.push + 0.05, 'riser_soft', 0.4);
    cue(T.el, 'tick_soft', 0.5); ev(T.el, 'step'); cue(T.mag, 'tick_soft', 0.5); ev(T.mag, 'step'); ev(S[2] + 0.5, 'step');
    const pushK = (t) => io(seg(t, T.push, T.pushEnd));
    p2.ticks.push((t) => { const lt = t - S[2], arr = ex(seg(t, T.ems - 0.62, T.ems - 0.1)), pk = pushK(t), gone = pk >= 1, hov = 1 - arr;
      cardBox.style.transform = clone.style.transform = 'translate(0,' + ((1 - ex(seg(lt, -0.2, 0.6))) * 60).toFixed(2) + 'px) rotate(' + CARD.tilt + 'deg)';
      // the magnifier glides in from the lower right (out of focus, higher), settles over the headword; on the push it comes at the camera and its lens fills the frame
      const kk = (1 + 3.5 * pk * pk) * (1 + hov * 0.35), M = lerp(1.5, 1, pk), hx = hov * 520 + Math.sin(t * 0.9) * 5 * (1 - pk), hy = hov * 620 + Math.cos(t * 0.7) * 5 * (1 - pk), rot = hov * 16 - 3 * (1 - pk);
      mg.style.display = gone || arr <= 0 ? 'none' : 'block';
      mg.style.transform = 'translate(' + hx.toFixed(2) + 'px,' + hy.toFixed(2) + 'px) rotate(' + rot.toFixed(3) + 'deg) scale(' + kk.toFixed(5) + ')';
      mg.style.filter = hov > 0.02 ? 'blur(' + (hov * 9).toFixed(2) + 'px)' : '';
      lensIn.style.transform = 'rotate(' + (-rot).toFixed(3) + 'deg) scale(' + (M / kk).toFixed(6) + ') translate(' + (-hx).toFixed(2) + 'px,' + (-hy).toFixed(2) + 'px)';
      mgImg.style.opacity = (1 - sm(seg(pk, 0.25, 0.7))).toFixed(3); mgHandleSh.style.opacity = (0.24 * (1 - sm(seg(pk, 0.1, 0.5)))).toFixed(3); mgSh.style.opacity = (1 - sm(seg(pk, 0.1, 0.5))).toFixed(3);
      hl[0].style.transform = 'scaleX(' + io(seg(t, T.el, T.el + 0.55)).toFixed(4) + ')'; hl[1].style.transform = 'scaleX(' + io(seg(t, T.mag, T.mag + 0.45)).toFixed(4) + ')'; });

    // ---- P3: „Aparatul trimite impulsuri care fac mușchiul să se contracte singur, mult mai intens și mai des…” A paper tape; the pen draws the pulses
    const p3 = P(3, 2960, 2600); const ST = { x0: 40, y: 690, w: 2700, h: 430, base: 250 };
    const hold3 = mk(p3.el, 'position:absolute;left:0;top:0;width:1080px;height:1920px');           // stays with the camera while the tape runs by
    words(hold3, 3, ['aparatul trimite'], 'top:300px', { cls: 'kick' });
    words(hold3, 3, ['*impulsuri*'], 'top:362px;font-size:178px;line-height:1.05');
    const tape = mk(p3.el, 'position:absolute;left:' + ST.x0 + 'px;top:' + ST.y + 'px;width:' + ST.w + 'px;height:' + ST.h + 'px;border-radius:6px;transform-origin:500px 215px;background-color:#fff;' +
      'background-image:linear-gradient(rgba(20,165,150,.16) 1.5px,transparent 0),linear-gradient(90deg,rgba(20,165,150,.16) 1.5px,transparent 0),linear-gradient(rgba(20,165,150,.3) 2px,transparent 0),linear-gradient(90deg,rgba(20,165,150,.3) 2px,transparent 0);background-size:27px 27px,27px 27px,135px 135px,135px 135px;background-position:0 -8px,0 0,0 -8px,0 0;' +
      'box-shadow:0 0 0 1px rgba(18,32,31,.07),2px 4px 0 #eceff0,22px 40px 64px -22px rgba(18,32,31,.34),8px 14px 20px -10px rgba(18,32,31,.18)');
    const ZA = 760, ZB = 1560;                                   // the tape's three parts: as usual | far more intense | and far more often
    const spikes = []; for (let x = 150; x < ST.w - 60;) { spikes.push({ x, a: x < ZA ? 50 : 152 }); x += x < ZB ? 150 : 66; }
    const refSp = []; for (let x = 190; x < ST.w - 60; x += 206) refSp.push(x);
    const pathOf = (sp, amp) => { let d = 'M0 0'; sp.forEach((s) => { const x = s.x != null ? s.x : s, a = amp || s.a; d += 'L' + (x - 14) + ' 0L' + x + ' ' + (-a) + 'L' + (x + 12) + ' ' + (a * 0.3).toFixed(1) + 'L' + (x + 26) + ' 0'; }); return d + 'L' + ST.w + ' 0'; };
    svg(tape, ST.w, ST.h, '<g transform="translate(0,' + (ST.base + 96) + ')"><path d="' + pathOf(refSp, 34) + '" fill="none" stroke="#a9b4b2" stroke-width="3.5" stroke-linejoin="round"/></g>', 'left:0;top:0');
    const emsClip = mk(tape, 'position:absolute;left:0;top:0;height:' + ST.h + 'px;overflow:hidden;width:0');
    svg(emsClip, ST.w, ST.h, '<g transform="translate(0,' + ST.base + ')"><path d="' + pathOf(spikes) + '" fill="none" stroke="' + TEAL + '" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/></g>', 'left:0;top:0');
    const pen = mk(tape, 'position:absolute;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:radial-gradient(circle at 36% 30%,#7fe3d7,' + TEAL + ' 60%,' + DEEP + ');box-shadow:0 0 0 7px rgba(20,165,150,.16),4px 8px 12px -4px rgba(11,127,116,.5)');
    const refLab = txt(tape, 'un antrenament obișnuit', 'left:' + (ST.w - 1010) + 'px;width:560px;top:' + (ST.base + 122) + 'px;font:560 32px/1 ' + SANS + ';color:#7b8886;letter-spacing:0;text-align:left');
    const yEms = (x) => { for (const s of spikes) { if (x < s.x - 14) break; if (x <= s.x) return -s.a * (x - (s.x - 14)) / 14; if (x <= s.x + 12) return -s.a + (s.a * 1.3) * (x - s.x) / 12; if (x <= s.x + 26) return s.a * 0.3 * (1 - (x - s.x - 12) / 14); } return 0; };
    T.imp = wt(3, /^impulsuri/, 0.85); T.sing = wt(3, /^să$/, 2.0) - 0.05; T.int = wt(3, /^mult$/, 3.1); T.des = wt(3, /^și$/, 4.05); T.obi = wt(3, /^decât/, 4.6); T.e3 = L[3].t0 + (L[3].speech || L[3].dur);
    const front = (t) => (t < T.int ? ZA * seg(t, T.imp - 0.1, T.int) : t < T.des ? lerp(ZA, ZB, seg(t, T.int, T.des)) : lerp(ZB, ST.w - 250, seg(t, T.des, T.e3 + 0.3)));
    const dx3 = (t) => clamp(0.82 * (front(t) - 420), -40, 1900);
    const ph3 = [words(hold3, 3, ['se contractă', '*singur*'], 'top:1206px;font-size:62px;line-height:1.02', {}), words(hold3, 3, ['mult mai', '*intens*'], 'top:1206px;font-size:62px;line-height:1.02', {}), words(hold3, 3, ['și mai', '*des*'], 'top:1206px;font-size:62px;line-height:1.02', {})];
    ph3.forEach((K) => { K.el.querySelectorAll('.k').forEach((e) => { e.style.fontSize = '2.6em'; }); });
    ph3[0].out = T.int - 0.12; ph3[1].out = T.des - 0.1; ph3[2].out = null;
    spikes.forEach((s, i) => { let a = T.imp - 0.1, b = T.e3 + 0.3; for (let k = 0; k < 26; k++) { const m = (a + b) / 2; if (front(m) < s.x) a = m; else b = m; } s.t = a; if (s.x < ZB) { cue(a, 'tick_soft', s.x < ZA ? 0.4 : 0.62); ev(a, 'step'); } else if (i % 2 === 0) cue(a, 'key', 0.3); });
    cue(T.int, 'tap', 0.5); ev(T.int, 'reveal'); cue(T.des, 'tap', 0.45); ev(T.des, 'reveal'); ev(T.obi, 'step'); cue(T.obi + 0.2, 'tick_soft', 0.4); ev(T.sing, 'step'); ev(T.e3 - 0.6, 'step');
    p3.ticks.push((t) => { const f = front(t), d = dx3(t), inn = ex(seg(t, S[3] - 0.2, S[3] + 0.7));
      hold3.style.transform = 'translate(' + (d + C.ty * 0.8).toFixed(2) + 'px,' + (-C.tx * 0.8).toFixed(2) + 'px)';
      tape.style.transform = 'translate(0,' + ((1 - inn) * 90).toFixed(2) + 'px) rotate(-2.2deg)';
      emsClip.style.width = Math.max(0, f).toFixed(1) + 'px'; pen.style.transform = 'translate(' + f.toFixed(1) + 'px,' + (ST.base + yEms(f)).toFixed(1) + 'px)'; pen.style.opacity = sm(seg(t, T.imp - 0.3, T.imp - 0.05)).toFixed(3);
      refLab.style.opacity = sm(seg(t, T.obi + 0.15, T.obi + 0.6)).toFixed(3); });

    // ---- P4: „Cât face într-o singură ședință e greu de crezut.” The stopwatch
    const p4 = P(4, 4700, 480); crop(p4.el);
    words(p4.el, 4, ['60:într-o singură', '190:*ședință*'], 'top:296px');
    const SW = 716, SK = SW / 612, swx = 182, swy = 590, piv = [swx + 306 * SK, swy + 499 * SK];
    const watch = obj(p4, 'stopwatch', swx, swy, SW, { z: 130, so: 0.34 });
    const face = mk(p4.el, 'position:absolute;left:' + piv[0] + 'px;top:' + piv[1] + 'px;width:0;height:0');
    const arcR = 205 * SK; const sweep = svg(face, 10, 10, '<path class="a" d="" fill="' + TEAL + '" fill-opacity=".2"/><g class="hd"><path d="M-5 26L-2.5 ' + (-arcR - 26) + 'h5L5 26z" fill="' + TEAL + '"/><circle r="15" fill="' + TEAL + '"/><circle r="5.5" fill="#fff"/></g>', 'left:0;top:0');
    const arcP = sweep.querySelector('.a'), hd = sweep.querySelector('.hd');
    T.sed4 = wt(4, /^ședință/, 1.05); T.e4 = L[4].t0 + (L[4].speech || L[4].dur);
    const tick4 = []; for (let k = 0, tt = S[4] + 0.5; tt < S[5] - 0.25; tt += 0.2, k++) { tick4.push(tt); cue(tt, 'tick_soft', k % 5 === 0 ? 0.55 : 0.36); if (k % 3 === 0) ev(tt, 'step'); }
    cue(S[4] + 0.38, 'tap', 0.55); ev(S[4] + 0.38, 'drop'); cue(T.sed4, 'tick_soft', 0.4);
    p4.ticks.push((t) => { const lt = t - S[4], inn = ex(seg(lt, -0.15, 0.6)), n = tick4.filter((x) => x <= t).length, lastT = n ? tick4[n - 1] : -9, ang = (n + (n ? back(seg(t, lastT, lastT + 0.09), 2.2) - 1 : 0)) * 6;
      const Z = 130 + (1 - inn) * 200 + Math.sin(t * 0.8) * 10; watch.set(0, (1 - inn) * -40 + Math.sin(t * 0.9) * 3, (1 - inn) * 5 + Math.sin(t * 0.55) * 0.3, 1, clamp((lt + 0.2) * 5), Z);
      { const q = watch.last, ox = watch.x + watch.w / 2 - piv[0], oy = watch.y + watch.h / 2 - piv[1], rr = ((1 - inn) * 5 + Math.sin(t * 0.55) * 0.3) * Math.PI / 180, cs = Math.cos(rr), sn = Math.sin(rr), kx = -ox * q[2], ky = -oy * q[2];
        face.style.transform = 'translate(' + (q[0] + ox + kx * cs - ky * sn).toFixed(2) + 'px,' + (q[1] + oy + kx * sn + ky * cs).toFixed(2) + 'px) rotate(' + (rr * 180 / Math.PI).toFixed(3) + 'deg) scale(' + q[2].toFixed(4) + ')'; } face.style.opacity = clamp((lt - 0.15) * 5).toFixed(3);
      hd.setAttribute('transform', 'rotate(' + ang.toFixed(2) + ')'); const a = Math.max(0.01, ang) * Math.PI / 180, big = ang > 180 ? 1 : 0;
      arcP.setAttribute('d', 'M0 0L0 ' + (-arcR) + 'A' + arcR + ' ' + arcR + ' 0 ' + big + ' 1 ' + (Math.sin(a) * arcR).toFixed(2) + ' ' + (-Math.cos(a) * arcR).toFixed(2) + 'z'); });

    // ---- P5: „Până la douăzeci de mii de contracții, pe care nu le-ai putea face voluntar, oricât ai trage la sală.” The number, the marker circle
    const p5 = P(5, 6100, 1500); crop(p5.el);
    words(p5.el, 5, ['până la'], 'top:300px', { cls: 'kick' });
    const numBox = txt(p5.el, '', 'top:420px;font:600 222px/1 ' + SERIF + ';letter-spacing:0;color:' + INK, 'cj-num');
    const SL = [0.58, 0.58, 0.27, 0.58, 0.58, 0.58];               // six slots: 2 0 . 0 0 0 (fixed, so the number never jumps while it runs)
    numBox.innerHTML = '<span style="display:inline-block;white-space:nowrap">' + SL.map((w, i) => '<span class="d" style="display:inline-block;width:' + w + 'em;text-align:center">' + (i === 2 ? '.' : '0') + '</span>').join('') + '</span>';
    const digs = [...numBox.querySelectorAll('.d')];
    const circ = svg(p5.el, 900, 420, '<defs><linearGradient id="cj-rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eab5a5"/><stop offset="1" stop-color="#cf8f7d"/></linearGradient></defs>' +
      '<path d="M96 236C70 120 250 34 470 38C690 42 846 108 838 214C830 322 640 392 430 386C240 380 84 330 104 204C116 128 230 70 380 52" fill="none" stroke="url(#cj-rg)" stroke-width="11" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>', 'left:118px;top:338px;transform-origin:450px 210px;transform:scale(.94,.92)');
    words(p5.el, 5, ['*de contracții*'], 'top:716px;font-size:110px;line-height:1.05');
    const ses5 = txt(p5.el, 'într-o ședință', 'top:872px;font:560 40px/1 ' + SANS + ';color:' + MUTE + ';letter-spacing:0');
    const dumb5 = obj(p5, 'dumbbell', 300, 990, 480, { z: 110, so: 0.32 });
    const typed = txt(p5.el, '', 'top:1340px;font:560 40px/1.5 ' + MONO + ';letter-spacing:.01em;color:' + INK, 'cj-typed');
    const TY1 = 'imposibil de obținut ', TY2 = 'VOLUNTAR';
    T.c0 = L[5].t0 + 0.12; T.land = S0.countAt != null ? S0.countAt : wt(5, /^mii/, 0.95) + 0.12; T.circ = Math.max(T.land + 0.12, wt(5, /^contracții/, 1.2) + 0.05); T.vol = wt(5, /^voluntar/, 3.2); T.pe = wt(5, /^pe$/, 1.9); T.ori = wt(5, /^oricât/, 3.6);
    shots[5].revealAt = T.land;
    for (let tt = T.c0, k = 0; tt < T.land - 0.05; tt += 0.07, k++) cue(tt, 'key', 0.22 + 0.2 * (k % 2)); ev(T.c0 + 0.3, 'step'); ev(T.land - 0.4, 'step');
    cue(T.land, 'tap', 0.7); ev(T.land, 'reveal'); cue(T.circ + 0.1, 'riser_soft', 0.35); ev(T.circ + 0.3, 'step'); cue(T.circ + 0.6, 'tick_soft', 0.5);
    cue(T.pe + 0.35, 'tap', 0.5); ev(T.pe + 0.35, 'drop'); for (let i = 0; i < 14; i++) cue(T.vol - 0.75 + i * 0.07, 'key', 0.3); ev(T.vol - 0.7, 'type'); ev(T.vol, 'step'); cue(T.vol + 0.25, 'tap', 0.45); ev(T.ori + 0.2, 'step');
    p5.ticks.push((t) => { const q = seg(t, T.c0, T.land), n = t >= T.land ? 20000 : Math.floor(20000 * (1 - Math.pow(1 - q, 2.3)) / 7) * 7, str = String(n);
      const pad = [str.length > 4 ? str[str.length - 5] : '', str.length > 3 ? str[str.length - 4] : '', str.length > 3 ? '.' : '', str.length > 2 ? str[str.length - 3] : '', str.length > 1 ? str[str.length - 2] : '', str[str.length - 1]];
      digs.forEach((d, i) => { if (d.textContent !== (pad[i] || ' ')) d.textContent = pad[i] || ' '; });
      const pop = t >= T.land ? 1 + 0.07 * Math.exp(-7 * (t - T.land)) * Math.cos(15 * (t - T.land)) : 1, inn = ex(seg(t, T.c0 - 0.2, T.c0 + 0.3));
      numBox.style.transform = 'translate(0,' + ((1 - inn) * 40).toFixed(2) + 'px) scale(' + pop.toFixed(4) + ')'; numBox.style.opacity = inn.toFixed(3); numBox.style.filter = inn < 1 || (t < T.land + 0.5) ? 'blur(' + ((1 - inn) * 8).toFixed(2) + 'px)' : '';
      circ.querySelector('path').style.strokeDashoffset = (1 - io(seg(t, T.circ, T.circ + 0.62))).toFixed(4);
      ses5.style.opacity = sm(seg(t, T.circ + 0.45, T.circ + 0.85)).toFixed(3); ses5.style.filter = t < T.circ + 0.9 ? 'blur(0px)' : '';
      const din = ex(seg(t, T.pe - 0.05, T.pe + 0.7)), bn = t > T.pe + 0.35 ? Math.exp(-7 * (t - T.pe - 0.35)) * Math.cos(17 * (t - T.pe - 0.35)) : 0;
      dumb5.set((1 - din) * 760, Math.sin(t * 0.8) * 3, 10 + (1 - din) * 50 + bn * 1.5 + Math.sin(t * 0.5) * 0.5, 1, clamp((t - T.pe + 0.05) * 4), 110 + (1 - din) * 160 + Math.sin(t * 0.7) * 8);
      const nT = clamp(Math.floor((t - (T.vol - 0.75)) / 0.035), 0, TY1.length + TY2.length), a = TY1.slice(0, Math.min(nT, TY1.length)), b = TY2.slice(0, Math.max(0, nT - TY1.length)), pq = sm(seg(t, T.vol + 0.2, T.vol + 0.5));
      const html = nT ? esc(a) + (b ? '<span style="display:inline-block;padding:2px 16px 3px;margin-left:2px;border-radius:9px;color:rgb(' + [lerp(18, 255, pq), lerp(32, 255, pq), lerp(31, 255, pq)].map(Math.round).join(',') + ');background:rgba(20,165,150,' + pq.toFixed(3) + ')">' + esc(b) + '</span>' : '') + (nT < TY1.length + TY2.length ? '<span style="display:inline-block;width:3px;height:36px;background:' + TEAL + ';vertical-align:-6px;margin-left:3px"></span>' : '') : '';
      if (typed._h !== html) { typed._h = html; typed.innerHTML = html; } typed.style.filter = t < T.vol + 0.6 ? 'blur(0px)' : ''; });

    // ---- P6: „Contracțiile sunt intense, dar nu dor, iar tu stai relaxată tot timpul.” A word flips in place; she rests
    const p6 = P(6, 6100, 3640); crop(p6.el);
    const blk6 = h('div', 'tx', null, p6.el); blk6.style.cssText = 'top:0;height:0';
    words(blk6, 6, ['contracțiile sunt'], 'top:300px;font-size:58px', { noTx: 1 });
    const flip = mk(blk6, 'position:absolute;left:0;top:352px;width:1080px;height:230px;perspective:1100px');
    const fA = mk(flip, 'position:absolute;left:0;width:1080px;top:0;text-align:center;font:600 184px/1.15 ' + SERIF + ';letter-spacing:-.025em;transform-origin:50% 55%;backface-visibility:hidden', null, 'intense');
    const fB = mk(flip, 'position:absolute;left:0;width:1080px;top:14px;text-align:center;font:italic 470 154px/1.2 ' + SERIF + ';letter-spacing:-.02em;color:' + DEEP + ';transform-origin:50% 55%;backface-visibility:hidden', null, 'dar nu dor');
    const pulse6 = svg(p6.el, 1500, 200, '<path d="" fill="none" stroke="' + TEAL + '" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>', 'left:-210px;top:880px');
    const statue6 = obj(p6, 'statue', 62, 664, 956, { z: 140, so: 0.34 });
    words(p6.el, 6, ['58:iar tu stai', '160:*relaxată*'], 'top:1264px');
    T.inte = wt(6, /^intense/, 1.0); T.dar = wt(6, /^dar$/, 1.45); T.rel = wt(6, /^relaxată/, 2.7);
    cue(T.inte, 'tick_soft', 0.5); ev(T.inte, 'reveal'); cue(T.dar + 0.16, 'tap', 0.6); ev(T.dar + 0.16, 'flip'); cue(T.rel, 'tick_soft', 0.5); ev(T.rel, 'step'); cue(S[6] + 0.45, 'tap', 0.45); ev(S[6] + 0.45, 'drop'); ev(T.rel + 0.9, 'step');
    p6.ticks.push((t) => { const lt = t - S[6], a = ex(seg(lt, -0.2, 0.75)), f = io(seg(t, T.dar - 0.02, T.dar + 0.42)), ain = ex(seg(t, T.inte - 0.1, T.inte + 0.4));
      fA.style.transform = 'translateY(' + ((1 - ain) * 60).toFixed(2) + 'px) rotateX(' + (f * 180).toFixed(2) + 'deg)'; fA.style.opacity = f < 0.5 ? ain.toFixed(3) : '0'; fB.style.transform = 'rotateX(' + ((f - 1) * 180).toFixed(2) + 'deg)'; fB.style.opacity = f >= 0.5 ? '1' : '0';
      blk6.style.filter = (ain < 1 && t > T.inte - 0.1) || (f > 0 && f < 1) ? 'blur(0px)' : '';
      statue6.set((1 - a) * -260, Math.sin(t * 0.85) * 4, (1 - a) * -2 + Math.sin(t * 0.55) * 0.22, 1, clamp((lt + 0.2) * 4), 140 + Math.sin(t * 0.7) * 14);
      let d = 'M0 100'; for (let x = 0; x <= 1500; x += 6) { const u = (x - ((t * 420) % 300)), k = ((u % 300) + 300) % 300, y = k < 16 ? -62 * (k / 16) : k < 30 ? -62 + 82 * ((k - 16) / 14) : k < 46 ? 20 * (1 - (k - 30) / 16) : 0; d += 'L' + x + ' ' + (100 + y).toFixed(1); }
      pulse6.querySelector('path').setAttribute('d', d); pulse6.style.opacity = (0.75 * sm(seg(lt, 0.2, 0.9))).toFixed(3); });

    // ---- P7: „De obicei e o cură de 6-8 ședințe, iar un tonus mai bun se simte după primele.” A card with eight marks
    const p7 = P(7, 4680, 3900); crop(p7.el);
    words(p7.el, 7, ['de obicei, o cură de'], 'top:306px', { cls: 'kick' });
    words(p7.el, 7, ['*6-8|șase* ședințe'], 'top:352px;font-size:132px;line-height:1.1', { cls: 'ser' });
    const hold7 = mk(p7.el, 'position:absolute;left:0;top:0;width:1080px;height:1920px;perspective:1700px;perspective-origin:540px 875px');
    const card7 = mk(hold7, 'position:absolute;left:150px;top:640px;width:780px;height:470px;border-radius:14px;background:linear-gradient(165deg,#ffffff,#f5f8f7);transform-origin:390px 235px;' +
      'box-shadow:0 0 0 1px rgba(18,32,31,.06),0 5px 0 #edf0ef,0 10px 0 #e2e7e6,0 15px 0 #d9dfde,30px 60px 80px -30px rgba(18,32,31,.36),10px 22px 26px -14px rgba(18,32,31,.2)');
    const marks = []; for (let i = 0; i < 8; i++) { const cxm = 120 + (i % 4) * 180, cym = 140 + Math.floor(i / 4) * 190;
      const m = svg(card7, 140, 140, '<circle cx="70" cy="70" r="60" fill="none" stroke="' + INK + '" stroke-opacity=".2" stroke-width="3"' + (i >= 6 ? ' stroke-dasharray="7 9"' : '') + '/><circle class="f" cx="70" cy="70" r="60" fill="' + TEAL + '"/><path class="c" d="M44 72l18 18 34-40" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>' +
        '<text x="70" y="88" text-anchor="middle" font-family="Fraunces Variable,serif" font-weight="560" font-size="50" fill="' + INK + '" fill-opacity=".34" class="n">' + (i + 1) + '</text>', 'left:' + (cxm - 70) + 'px;top:' + (cym - 70) + 'px;transform-origin:70px 70px');
      marks.push({ el: m, f: m.querySelector('.f'), c: m.querySelector('.c'), n: m.querySelector('.n') }); }
    const w7b = words(p7.el, 7, ['66:un *tonus* mai *bun*', '50:se simte după primele'], 'top:1192px');
    p7.el.querySelectorAll('.tx .k').forEach((e) => { if (/tonus|bun/.test(e.textContent)) e.style.fontSize = '1.75em'; });
    void w7b;
    T.sase = wt(7, /^șase/, 0.95); T.opt = wt(7, /^opt/, 1.45); T.ton = wt(7, /^tonus/, 2.3); T.prim = wt(7, /^primele/, 3.85);
    const markAt = (i) => (i < 6 ? T.sase - 0.12 + i * ((T.opt - T.sase + 0.1) / 6) : T.opt + 0.1 + (i - 6) * 0.14);
    marks.forEach((m, i) => { cue(markAt(i), 'tick_soft', i < 6 ? 0.5 : 0.4); ev(markAt(i), 'step'); });
    cue(S[7] + 0.42, 'tap', 0.55); ev(S[7] + 0.42, 'drop'); cue(T.prim, 'tap', 0.55); ev(T.prim, 'reveal'); cue(T.prim + 0.15, 'tap', 0.4); cue(T.prim + 0.3, 'tap', 0.35); ev(T.ton, 'step');
    p7.ticks.push((t) => { const lt = t - S[7], inn = ex(seg(lt, -0.2, 0.7)), bn = lt > 0.42 ? Math.exp(-6 * (lt - 0.42)) * Math.cos(15 * (lt - 0.42)) : 0;
      card7.style.transform = 'translate3d(0,' + ((1 - inn) * 150).toFixed(2) + 'px,' + (70 + (1 - inn) * 200).toFixed(1) + 'px) rotateX(' + (16 * (1 - inn) + 7 + bn * 2 + Math.sin(t * 0.7) * 1.2).toFixed(2) + 'deg) rotateY(' + (Math.sin(t * 0.5) * 2.2).toFixed(2) + 'deg) rotate(' + (-2.2 + (1 - inn) * -5).toFixed(2) + 'deg)'; card7.style.opacity = clamp((lt + 0.2) * 4).toFixed(3);
      marks.forEach((m, i) => { const q = back(seg(t, markAt(i), markAt(i) + 0.3), 2), first = i < 3 ? sm(seg(t, T.prim + i * 0.15, T.prim + i * 0.15 + 0.3)) : 0, op = i < 6 ? 0.2 + 0.8 * first : 0.1;
        m.f.setAttribute('fill-opacity', (clamp(q) * op).toFixed(3)); m.f.setAttribute('r', (60 * (0.6 + 0.4 * q) * (1 + 0.1 * Math.sin(Math.PI * first))).toFixed(2)); m.c.style.strokeDashoffset = (1 - io(first)).toFixed(3); m.n.setAttribute('fill-opacity', (0.34 * (1 - first) + (i < 6 ? 0.3 * clamp(q) * (1 - first) : 0)).toFixed(3)); }); });

    // ---- P8: „EMS se face doar în clinica din Timișoara. Trimite-i clipul prietenei cu care tot amâni sala.” The pin, the paper plane
    const p8 = P(8, 3260, 4100); crop(p8.el);
    words(p8.el, 8, ['EMS · doar în clinica din'], 'top:436px', { cls: 'kick' });
    const tm = words(p8.el, 8, ['Timișoara'], 'top:486px;font-size:150px;line-height:1.1', { cls: 'ser' });
    const pin = svg(p8.el, 90, 120, '<path d="M45 4C22 4 6 21 6 43c0 28 39 71 39 71s39-43 39-71C84 21 68 4 45 4z" fill="' + TEAL + '"/><path d="M45 4C22 4 6 21 6 43c0 10 5 22 12 34C16 50 24 14 58 7 54 5 50 4 45 4z" fill="#fff" fill-opacity=".2"/><circle cx="45" cy="43" r="15" fill="#fff"/>', 'left:495px;top:292px;transform-origin:45px 116px');
    const pinSh = mk(p8.el, 'position:absolute;left:500px;top:400px;width:80px;height:20px;border-radius:50%;background:radial-gradient(ellipse,rgba(18,32,31,.3),rgba(18,32,31,0) 70%)');
    const PL = { a: [-460, 1500], c1: [60, 1560], c2: [330, 1150], b: [560, 912] };
    const bez = (u) => { const m = 1 - u, f = (i) => m * m * m * PL.a[i] + 3 * m * m * u * PL.c1[i] + 3 * m * u * u * PL.c2[i] + u * u * u * PL.b[i]; return [f(0), f(1)]; };
    const trail = svg(p8.el, 1080, 1920, '<path d="M' + PL.a + 'C' + PL.c1 + ' ' + PL.c2 + ' ' + PL.b + '" fill="none" stroke="' + TEAL + '" stroke-width="5" stroke-linecap="round" stroke-dasharray="4 20"/>', 'left:0;top:0');
    const trailClip = trail.querySelector('svg'); trail.style.overflow = 'hidden';
    const plane = obj(p8, 'plane', 560 - 300, 912 - 168, 600, { z: 200, so: 0.3 });
    const sub8 = words(p8.el, 8, ['58:trimite-i clipul', '168:*prietenei*', '42:cu care tot amâni sala'], 'top:1150px');
    { const r3 = sub8.el.querySelectorAll('.ln')[2]; r3.style.color = MUTE; r3.style.fontWeight = '540'; r3.style.marginTop = '14px'; }
    void tm;
    T.tim = wt(8, /^timișoara/, 1.8); T.trim = wt(8, /^trimite/, 2.6); T.pri = wt(8, /^prietenei/, 3.3); T.fly0 = T.trim - 0.25; T.fly1 = T.pri + 0.42;
    shots[8].resolveAt = T.fly1;
    cue(T.tim + 0.2, 'tap', 0.6); ev(T.tim + 0.2, 'drop'); cue((T.fly0 + T.fly1) / 2 - 0.05, 'whoosh_l', 0.7, { peak: true, prio: 3 }); ev((T.fly0 + T.fly1) / 2 - 0.05, 'reveal'); ev(T.pri, 'step'); ev(total - 2.3, 'hold'); ev(S[8] + 0.5, 'step');
    p8.ticks.push((t) => { const pq = seg(t, T.tim - 0.1, T.tim + 0.2), fall = 1 - pq * pq, bn = t > T.tim + 0.2 ? Math.exp(-7 * (t - T.tim - 0.2)) * Math.cos(19 * (t - T.tim - 0.2)) : 0;
      pin.style.transform = 'translate(0,' + (-fall * 150 + Math.sin(t * 1.1) * 2).toFixed(2) + 'px) scale(' + (1 + 0.08 * bn).toFixed(4) + ',' + (1 - 0.1 * bn).toFixed(4) + ')'; pin.style.opacity = clamp((t - T.tim + 0.1) * 8).toFixed(3); pinSh.style.opacity = (clamp((t - T.tim + 0.1) * 8) * (1 - fall * 0.7)).toFixed(3); pinSh.style.transform = 'scale(' + (1 + fall * 0.8).toFixed(3) + ')';
      const u = o3(seg(t, T.fly0, T.fly1)), pos = bez(u), nx = bez(Math.min(1, u + 0.01)), pv = bez(Math.max(0, u - 0.01)), ang = Math.atan2(nx[1] - pv[1], nx[0] - pv[0]) * 180 / Math.PI + 27, hov = u >= 1 ? 1 : 0;
      plane.set(pos[0] - 560 + hov * Math.sin(t * 0.9) * 6, pos[1] - 912 + hov * Math.cos(t * 1.1) * 7, ang + hov * Math.sin(t * 0.7) * 1.2, 0.6 + 0.4 * u, clamp((t - T.fly0) * 6), 200 + (1 - u) * 260 + hov * Math.sin(t * 0.8) * 16);
      trailClip.style.clipPath = 'inset(0 ' + (1080 - Math.max(0, pos[0] - 60)).toFixed(1) + 'px 0 0)'; trail.style.opacity = (0.9 * clamp((t - T.fly0) * 4)).toFixed(3); });

    [[p0, p1], [p1, p2], [p4, p5], [p5, p6], [p6, p7], [p7, p8]].forEach(([a, b], k) => between(a, b, k));
    // ================================================================ the camera: a pose per poster, a travel on every cut, a push through the lens
    const cardC = [p2.cx - 540 + CARD.x + 200, p2.cy - 960 + CARD.y + 355.5];        // the card's centre on the sheet
    const lensW = [p2.cx - 540 + lensC[0], p2.cy - 960 + lensC[1]];
    const drift = (t, i) => ({ x: Math.sin(t * 0.31 + i * 1.7) * 12, y: Math.cos(t * 0.27 + i) * 10, r: Math.sin(t * 0.23 + i * 2.1) * 0.45, tx: Math.sin(t * 0.37 + i) * 1.5, ty: Math.cos(t * 0.29 + i * 1.3) * 2.1 });
    const pose = [
      (t) => ({ x: p0.cx, y: p0.cy, z: 1.0 + 0.04 * sm(seg(t, -0.3, S[1])), r: 0.5 }),
      (t) => ({ x: p1.cx, y: p1.cy, z: 1.0 + 0.04 * sm(seg(t, S[1], S[2])), r: -0.9 }),
      (t) => { const pk = pushK(t), a = { x: lerp(p2.cx, lensW[0], 0.35), y: p2.cy - 40, z: 1.22 + 0.05 * sm(seg(t, S[2], T.push)), r: 1.2 }, c = { x: cardC[0], y: cardC[1], z: 2.7 * (1 + 0.025 * sm(seg(t, T.pushEnd, S[3]))), r: -CARD.tilt };
        return { x: lerp(a.x, c.x, pk), y: lerp(a.y, c.y, pk), z: Math.exp(lerp(Math.log(a.z), Math.log(c.z), pk)), r: lerp(a.r, c.r, pk), still: pk };
      },
      (t) => ({ x: p3.cx + dx3(t), y: p3.cy, z: 1.0 + 0.03 * sm(seg(t, S[3], S[4])), r: -0.4 }),
      (t) => ({ x: p4.cx, y: p4.cy + 30 * sm(seg(t, S[4], S[5])), z: 1.0 + 0.07 * sm(seg(t, S[4], S[5])), r: 0.8 }),
      (t) => ({ x: p5.cx, y: p5.cy + 20, z: 1.0 + 0.035 * sm(seg(t, S[5], S[6])), r: 0 }),
      (t) => ({ x: p6.cx, y: p6.cy, z: 1.0 + 0.04 * sm(seg(t, S[6], S[7])), r: -0.7 }),
      (t) => ({ x: p7.cx, y: p7.cy, z: 1.0 + 0.04 * sm(seg(t, S[7], S[8])), r: 0.6 }),
      (t) => ({ x: p8.cx, y: p8.cy, z: 1.0 + 0.035 * sm(seg(t, S[8], total)), r: 0 }),
    ];
    const trav = profile(0.3, 1.7, 2.6);
    function camAt(t) {
      let i = 0; for (let k = 1; k < 9; k++) if (t >= S[k] - TA) i = k;
      const b = pose[i](t), d = drift(t, i), dk = 1 - 0.8 * (b.still || 0);
      let c = { x: b.x + d.x * dk / b.z, y: b.y + d.y * dk / b.z, z: b.z, r: b.r + d.r * dk, tx: d.tx * dk, ty: d.ty * dk };
      if (i > 0 && t < S[i] + TB) { const a = pose[i - 1](t), da = drift(t, i - 1), e = trav(seg(t, S[i] - TA, S[i] + TB)), arc = Math.sin(Math.PI * e);
        c = { x: lerp(a.x + da.x / a.z, c.x, e), y: lerp(a.y + da.y / a.z, c.y, e), z: Math.exp(lerp(Math.log(a.z), Math.log(c.z), e)) * (1 - 0.1 * arc), r: lerp(a.r + da.r, c.r, e) + arc * (i % 2 ? 1.6 : -1.6), tx: lerp(da.tx, c.tx, e) + arc * 2.5, ty: lerp(da.ty, c.ty, e) }; }
      return c;
    }
    cue(0.02, 'tap', 0.3);

    // ================================================================ one frame
    let lastT = null;
    W.draw = (t) => {
      if (t === lastT) return; lastT = t;
      const c = camAt(t), a = camAt(t - 1 / 120), b = camAt(t + 1 / 120);
      C = c; cam.style.transform = 'translate(540px,960px) rotate(' + c.r.toFixed(3) + 'deg) scale(' + c.z.toFixed(5) + ') translate(' + (-c.x).toFixed(2) + 'px,' + (-c.y).toFixed(2) + 'px)';
      // motion blur along the camera's way (and a little, all round, when it only zooms)
      const vx = (b.x - a.x) * 60 * c.z, vy = (b.y - a.y) * 60 * c.z, sp = Math.hypot(vx, vy), zs = Math.abs(Math.log(b.z / a.z)) * 60, len = sp / 60 * 0.85;
      if (len > 13 || zs > 0.55) { const th = Math.atan2(vy, vx) * 180 / Math.PI; mbO.style.transform = 'rotate(' + th.toFixed(2) + 'deg)'; mbI.style.transform = 'rotate(' + (-th).toFixed(2) + 'deg)'; fblur.setAttribute('stdDeviation', (len > 13 ? Math.min(70, (len - 8) / 2.5) : 0).toFixed(1) + ' ' + Math.min(14, zs * 3.2).toFixed(1)); mbF.style.filter = 'url(#cj-blur)'; }
      else { mbO.style.transform = mbI.style.transform = ''; let trv = false; for (let k = 1; k < 9; k++) if (t > S[k] - TA && t < S[k] + TB) trv = true; mbF.style.filter = trv || (t > T.push && t < T.pushEnd) ? 'blur(0px)' : ''; }
      // only the posters near the camera exist
      posters.forEach((p) => { const far = Math.abs(p.cx - c.x) * c.z > 1640 + (p.i === 3 ? 2600 : 0) || Math.abs(p.cy - c.y) * c.z > 2000, on = !far && t >= (p.i ? S[p.i] - TA - 0.05 : -1) && t <= (p.i < 8 ? S[p.i + 1] + TB + 0.05 : 1e9); p.el.style.display = on ? 'block' : 'none'; if (on) p.ticks.forEach((f) => f(t)); });
      // the words
      for (const K of kin) { let moving = false;
        for (const w of K.ws) { const p = seg(t, w.t, w.t + (w.key ? 0.62 : 0.46)), e = ex(p); if (p < 1) moving = true; w.wi.style.transform = 'translateY(' + ((1 - e) * 118).toFixed(2) + '%)' + (w.key ? ' rotate(' + ((1 - e) * 4).toFixed(2) + 'deg)' : ''); }
        const out = K.out != null ? seg(t, K.out, K.out + 0.25) : 0; if (out > 0 && out < 1) moving = true;
        K.el.style.opacity = (1 - out).toFixed(3); K.el.style.visibility = out >= 1 || t < K.t0 - 0.02 ? 'hidden' : ''; K.el.style.filter = moving ? 'blur(0px)' : ''; }
    };
    return W;
  }
  TYPES.forEach((tp) => { V[tp] = (ctx) => { const w = build(); ctx.tick(w.draw); }; });
})();
