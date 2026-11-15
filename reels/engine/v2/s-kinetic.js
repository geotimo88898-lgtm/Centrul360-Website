// Centrul360 reels v2: the weight of the letters (v2-kinetic-grasime, 15.11; format xi, faceless clean kinetic type).
// One idea carries the whole reel: the font's weight is the fat. „peste tot” loses weight letter by letter while she
// says „poți slăbi”; on the bass coming back „rămân” slams in at 900 and a slimming wave runs over it without moving a
// single stroke; GRĂSIME sits between PIELE and MUȘCHI, an ultrasound focus lands inside it, the camera goes through the
// light into the word and its letters thin out from the focus; the thin letters stay thin („nu mai revin”) and only
// gain a little weight on „se pot mări”. White, ink, turquoise; rose gold only on the focus point.
// Every key word enters exactly when it is said (the script's "words", measured on the voice by wordtimes.py), huge and
// out of focus, then settles; the camera moves start on the cut (a beat), cover most of the way in the first frames,
// glide to a stop and hold while the words are read. Every visual event has its sound, on its frame.
// Like s-colaj, the reel is one world built by the first shot; the engine's shots ("kn-*") are its clock and their
// transitions ("kn-a" … "kn-i") are the names of the camera's moves. Every claim is the site's wording
// (grasime-localizata.html).
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, lerp, E, h, esc } = R;
  const TYPES = ['kn-weight', 'kn-zones', 'kn-resist', 'kn-fault', 'kn-aim', 'kn-layers', 'kn-thin', 'kn-stay', 'kn-weeks', 'kn-send'];
  ['kn-a', 'kn-b', 'kn-c', 'kn-d', 'kn-e', 'kn-f', 'kn-g', 'kn-h', 'kn-i'].forEach((n) => { R.TR[n] = { dur: 0.5, in() {}, out() {} }; });
  const SANS = "'Inter Variable',system-ui,sans-serif", SERIF = "'Fraunces Variable',Georgia,serif", MONO = "'JetBrains Mono Variable',monospace";
  const INK = '#12201f', TEAL = '#14a596', DEEP = '#0b7f74', MUTE = '#5e6d6b';
  const ROSE = 'radial-gradient(circle at 35% 30%,#fbe3d9,#eab5a5 45%,#cf8f7d 80%)';
  const sm = (p) => { p = clamp(p); return p * p * (3 - 2 * p); };
  const io = (p) => E.inout(clamp(p)), ex = (p) => E.expo(clamp(p)), o3 = (p) => E.out(clamp(p));
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const back = (p, c = 1.4) => { p = clamp(p); const c3 = c + 1; return 1 + c3 * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  // the camera moves into each station: crane (vertical), through (push through the old picture), whip (horizontal),
  // pull (pull back), flash (zoom through light into the focus point)
  const MOVE = [null, 'carry', 'through', 'whip', 'pull', 'crane', 'flash', 'whip', 'through', 'crane'];
  const MD = 0.62;

  let W = null;
  function build() {
    if (W) return W;
    W = {};
    const S0 = R.script, N = TYPES.length, shots = TYPES.map((tp) => R.shots.find((s) => s.vis.type === tp)), L = shots.map((s) => s.lines[0]), S = shots.map((s) => s.t0), total = R.total;
    const WT = L.map((ln, i) => { const m = S0.words && S0.words['L' + i]; return m && ln.voiced ? m.map(([w, t]) => ({ w, t: ln.t0 + t })) : ln.words.map((x) => ({ w: x.w, t: x.t })); });
    const nrm = (x) => x.toLowerCase().replace(/[^a-zăâîșț0-9-]/g, '');
    const wt = (i, re, dflt) => { const w = WT[i].find((x) => re.test(nrm(x.w))); return w ? w.t : (dflt != null ? L[i].t0 + dflt : L[i].t0); };
    const lineEnd = (i) => L[i].t0 + (L[i].speech || L[i].dur);
    const cue = (t, cat, gain, o) => R.cue(t, cat, gain, o), ev = (t, kind) => R.event(t, kind || 'step');

    // ---------------------------------------------------------------- the DOM
    const world = document.getElementById('world');
    const root = h('div', 'shot kn-world'); world.insertBefore(root, world.firstChild);
    root.style.cssText = 'display:block;opacity:1;z-index:-1;overflow:hidden;background:#fbfcfc';
    h('style', null, '#sweep,#flash{display:none!important}' +
      '.kn-world .tx{position:absolute;left:0;width:1080px;text-align:center;white-space:nowrap;color:' + INK + ';font:600 62px/1.1 ' + SANS + ';letter-spacing:-.025em}' +
      '.kn-world .w{display:inline-block;vertical-align:bottom}.kn-world .wr{overflow:hidden;padding:.1em .08em .22em;margin:-.1em -.08em -.22em}.kn-world .wi{display:inline-block}' +
      '.kn-world .k{font-family:' + SERIF + ';font-style:italic;font-weight:440;letter-spacing:-.02em;color:' + DEEP + '}' +
      '.kn-world .lt{display:inline-block}.kn-world .st{position:absolute;left:0;top:0;width:1080px;height:1920px;transform-origin:540px 960px}', root);
    const mk = (par, css, cls, html) => { const d = h('div', cls || null, html != null ? html : null, par); if (css) d.style.cssText = css; return d; };
    // directional blur for the crane and the whip (an SVG filter per station; set only while the station moves)
    const defs = []; root.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute"><defs>' + TYPES.map((_, i) => '<filter id="kn-mb' + i + '" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="0 0"/></filter>').join('') + '</defs></svg>');
    TYPES.forEach((_, i) => { defs[i] = root.querySelector('#kn-mb' + i + ' feGaussianBlur'); });
    // the paper: white, the brand's grid (faint, still), soft turquoise rings out of focus in the corners
    mk(root, 'position:absolute;inset:0;background-image:linear-gradient(rgba(20,165,150,.05) 1px,transparent 0),linear-gradient(90deg,rgba(20,165,150,.05) 1px,transparent 0);background-size:54px 54px;background-position:-1px -1px');
    const rings = [[-230, 160, 520, 0.55], [800, 1500, 640, 0.45], [860, -220, 380, 0.35]].map(([x, y, d, o], k) => { const r = mk(root, 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + d + 'px;height:' + d + 'px;border-radius:50%;border:' + (22 + k * 6) + 'px solid rgba(95,212,198,' + (0.14 * o).toFixed(3) + ');filter:blur(' + (34 + k * 6) + 'px)'); return { r, x, y, k }; });
    const cam = mk(root, 'position:absolute;inset:0;transform-origin:540px 960px');
    const ST = TYPES.map((_, i) => { const o = mk(cam, null, 'st'); const inner = mk(o, null, 'st'); return { o, el: inner, i, ticks: [] }; });
    const flashEl = mk(root, 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:9');

    // ---------------------------------------------------------------- words: each one exactly when it is said
    // block(par, top, text, o): "*key*" words are the keywords (the italic serif, entering huge from blur); "word|sync"
    // syncs a written word to a spoken one; o: size, weight, color, mode ('rise' | 'blur'), letters (per-letter spans for
    // the weight), li (the line), at (fixed start), out (fade-out time), q (the hook text)
    const kin = [], cur = {};
    function block(par, top, text, o = {}) {
      const el = h('div', 'tx' + (o.cls ? ' ' + o.cls : ''), null, par);
      el.style.cssText = 'top:' + top + 'px;font-size:' + (o.size || 62) + 'px;font-weight:' + (o.weight || 600) + ';color:' + (o.color || INK) + (o.css ? ';' + o.css : '');
      if (o.q) el.dataset.q = '1';
      const K = { el, ws: [], o }; const li = o.li, LW = WT[li]; let last = cur[li] != null ? cur[li] : -1;
      text.split(/(\*[^*]+\*)/).forEach((part) => { if (!part) return; const key = /^\*/.test(part);
        part.replace(/\*/g, '').split(/\s+/).filter(Boolean).forEach((tok) => { const [tx, sync] = tok.split('|'); const want = nrm(sync || tx);
          let k = LW.findIndex((x, i) => i > last && (sync ? nrm(x.w).startsWith(want) : nrm(x.w) === want)); if (k < 0) k = last; else last = k;
          const mode = o.mode || (key ? 'blur' : 'rise');
          const s = h('span', 'w' + (mode === 'rise' ? ' wr' : '') + (key && !o.plainKey ? ' k' : ''), null, el);
          const wi = h('span', 'wi', null, s);
          const shown = tx.replace(/_/g, ' ');
          let lts = null;
          if (o.letters) { lts = [...shown].map((c) => { const l = h('span', 'lt', esc(c), wi); return l; }); } else wi.innerHTML = esc(shown);
          el.appendChild(document.createTextNode(' '));
          const tw = (o.at != null ? o.at + K.ws.length * (o.stagger || 0.08) : (k >= 0 ? LW[k].t : L[li].t0)) - (mode === 'blur' ? 0.04 : 0.06);
          K.ws.push({ s, wi, key, mode, t: tw, lts }); }); });
      cur[li] = last;
      if (o.kem) el.querySelectorAll('.k').forEach((e) => { e.style.fontSize = o.kem + 'em'; });
      const wid = () => { const rg = document.createRange(); rg.selectNodeContents(el); return rg.getBoundingClientRect().width; };
      let fs = parseFloat(el.style.fontSize); while (fs > 30 && wid() > (o.max || 800)) { fs -= 2; el.style.fontSize = fs + 'px'; }
      K.t0 = K.ws[0].t; K.out = o.out; kin.push(K);
      K.ws.forEach((w) => { if (!o.silent) cue(w.t + 0.04, w.mode === 'blur' ? 'tick_soft' : 'tick_soft', w.mode === 'blur' ? 0.5 : 0.28); ev(w.t + 0.04, w.mode === 'blur' ? 'reveal' : 'step'); });
      return K;
    }
    const label = (par, top, html, css) => { const d = h('div', 'tx', html, par); d.style.cssText = 'top:' + top + 'px;' + (css || ''); return d; };
    const svg = (par, w, hh, inner, css) => { const d = mk(par, 'position:absolute;' + (css || '')); d.innerHTML = '<svg width="' + w + '" height="' + hh + '" viewBox="0 0 ' + w + ' ' + hh + '" style="display:block;overflow:visible">' + inner + '</svg>'; return d; };
    const weightOf = (lts, f) => lts.forEach((l, k) => { const v = f(k, lts.length); if (l._w !== v) { l._w = v; l.style.fontWeight = v.toFixed(0); } });
    const T = {};

    // ================================================================ 0: „Poți slăbi peste tot, iar zonele astea rămân.”
    const s0 = ST[0];
    const b0 = block(s0.el, 452, 'poți slăbi', { li: 0, size: 66, weight: 520 });
    const pt = block(s0.el, 560, 'peste', { li: 0, size: 250, weight: 900, letters: true, mode: 'rise', css: 'letter-spacing:-.045em;line-height:1', at: -0.3 });
    const pt2 = block(s0.el, 800, 'tot', { li: 0, size: 250, weight: 900, letters: true, mode: 'rise', css: 'letter-spacing:-.045em;line-height:1', at: -0.18 });
    T.slab = wt(0, /^slăbi/, 0.35); T.tot = wt(0, /^tot/, 1.0); T.iar = wt(0, /^iar/, 1.3); T.ram = wt(0, /^rămân/, 1.9);
    // the drop: the bass comes back on a beat (the script puts the piece so that it lands on „rămân”)
    T.drop = S0.dropAt != null ? S0.dropAt : R.cam.beat(T.ram);
    const b0b = block(s0.el, 1110, 'iar zonele astea', { li: 0, size: 66, weight: 520, q: 1 });
    const ram = block(s0.el, 760, '*rămân*', { li: 0, size: 290, weight: 900, letters: true, plainKey: true, css: 'letter-spacing:-.05em;line-height:1', q: 1, at: T.drop, silent: true });
    b0.out = T.drop - 0.14; pt.out = pt2.out = T.drop - 0.12; b0b.out = S[1] - 0.06;
    const band0 = mk(s0.el, 'position:absolute;left:0;top:740px;width:220px;height:360px;background:linear-gradient(90deg,rgba(95,212,198,0),rgba(95,212,198,.42),rgba(95,212,198,0));mix-blend-mode:multiply;filter:blur(6px);opacity:0');
    T.wave0 = T.slab + 0.05; T.wave1 = T.tot + 0.42;
    cue(0, 'impact', 0.32, { prio: 4 }); cue(0.02, 'tick_soft', 0.4); ev(0.05, 'step');
    cue(T.wave0, 'suck_in', 0.45); ev(T.wave0 + 0.2, 'step'); ev(T.wave0 + 0.6, 'step');
    cue(T.drop, 'hit_deep', 0.95, { prio: 5 }); cue(T.drop, 'whoosh_cut', 0.55, { peak: true, prio: 4 }); ev(T.drop, 'reveal');
    T.res = T.drop + 0.16; cue(T.res, 'shimmer_soft', 0.4); cue(T.res + 0.32, 'pulse', 0.55); ev(T.res, 'step'); ev(T.res + 0.32, 'step');
    s0.ticks.push((t) => {
      // „peste tot” thins letter by letter from „slăbi” to „tot” (the weight is the fat)
      const all = pt.ws[0].lts.concat(pt2.ws[0].lts), n = all.length;
      weightOf(all, (k) => lerp(900, 130, io(seg(t, lerp(T.wave0, T.wave1 - 0.35, k / (n - 1)), lerp(T.wave0, T.wave1 - 0.35, k / (n - 1)) + 0.42))));
      const breathe = 1 + 0.012 * Math.sin(t * 2.2);
      [pt, pt2].forEach((K) => { K.el.style.transform = 'scale(' + (breathe * (t < T.drop ? 1 : 1)).toFixed(4) + ')'; });
      // after the drop: the line above „rămân”, then a slimming wave that does not move a single stroke
      const wv = seg(t, T.res, T.res + 0.55); band0.style.opacity = (Math.sin(Math.PI * wv) * 0.95).toFixed(3); band0.style.transform = 'translateX(' + lerp(120, 760, io(wv)).toFixed(1) + 'px)';
      const push = t > T.res + 0.25 ? Math.exp(-6 * (t - T.res - 0.25)) * Math.sin(16 * (t - T.res - 0.25)) : 0;
      weightOf(ram.ws[0].lts, (k, m) => { const cx = lerp(120, 760, io(wv)) + 110, lx = 540 + (k - (m - 1) / 2) * 150, near = Math.exp(-Math.pow((lx - cx) / 120, 2)) * Math.sin(Math.PI * wv); return 900 - 120 * near; });
      // „iar zonele astea” rises above „rămân” on the drop; on the next line „rămân” goes up and becomes the heading of the zones
      const up = ex(seg(t, T.drop - 0.06, T.drop + 0.3)); b0b.el.style.transform = 'translateY(' + (-500 * up).toFixed(2) + 'px)';
      const hd = R.cam.ease(t, S[1], 0.62); ram.el.style.transformOrigin = '540px 145px';
      ram.el.style.transform = 'translate(' + (push * 9).toFixed(2) + 'px,' + (-585 * hd).toFixed(2) + 'px) scale(' + (1 - 0.54 * hd).toFixed(4) + ')';
    });

    // ================================================================ 1: „Vorbesc de abdomenul de jos, de colăcei, de interiorul coapselor.”
    const s1 = ST[1];
    block(s1.el, 470, 'vorbesc de', { li: 1, size: 64, weight: 520 });
    const pills1 = [['abdomenul de jos', /^abdomenul/, 'fill'], ['colăceii', /^colăcei/, 'line'], ['interiorul coapselor', /^interiorul/, 'deep']].map(([txt, re, kind], k) => {
      const at = wt(1, re, 0.6 + k * 0.9) - 0.04;
      const p = mk(s1.el, 'position:absolute;left:0;width:1080px;top:' + (640 + k * 168) + 'px;text-align:center');
      const pill = h('div', 'tx', esc(txt), p);
      pill.style.cssText = 'position:relative;display:inline-block;left:auto;width:auto;padding:22px 52px 26px;border-radius:999px;font:700 64px/1 ' + SANS + ';letter-spacing:-.025em;' +
        (kind === 'fill' ? 'background:' + TEAL + ';color:#fff;box-shadow:0 18px 40px -18px rgba(11,127,116,.55)' : kind === 'deep' ? 'background:' + DEEP + ';color:#fff;box-shadow:0 18px 40px -18px rgba(11,127,116,.6)' : 'background:#fff;color:' + DEEP + ';box-shadow:inset 0 0 0 4px ' + TEAL + ',0 14px 30px -18px rgba(18,32,31,.3)');
      cue(at, 'tap', 0.55); ev(at, 'drop');
      return { p, pill, at };
    });
    s1.ticks.push((t) => { pills1.forEach((q, k) => { const a = seg(t, q.at, q.at + 0.42), e = back(a, 1.25); q.pill.style.opacity = clamp(a * 3).toFixed(3); q.pill.style.transform = 'translateY(' + ((1 - ex(a)) * 60).toFixed(2) + 'px) scale(' + (0.86 + 0.14 * e).toFixed(4) + ')'; q.pill.style.filter = a < 1 ? 'blur(' + ((1 - ex(a)) * 8).toFixed(2) + 'px)' : ''; q.pill.style.visibility = t < q.at - 0.02 ? 'hidden' : ''; void k; }); });

    // ================================================================ 2: „Acolo grăsimea e rezistentă la dietă și sport, din motive genetice și hormonale.”
    const s2 = ST[2];
    block(s2.el, 330, 'acolo grăsimea e', { li: 2, size: 64, weight: 520 });
    const res2 = block(s2.el, 418, '*rezistentă*', { li: 2, size: 190 });
    block(s2.el, 660, 'la dietă și sport', { li: 2, size: 64, weight: 520 });
    T.mot = wt(2, /^motive/, 2.2); T.gen = wt(2, /^genetice/, 2.6); T.hor = wt(2, /^hormonale/, 3.2);
    const hub = [540, 820], nodes2 = [[300, 1040, 'dna', 'genetice', T.gen], [780, 1040, 'activity', 'hormonale', T.hor]];
    const lines2 = svg(s2.el, 1080, 1920, nodes2.map(([x, y]) => '<path d="M' + hub[0] + ' ' + hub[1] + 'C' + hub[0] + ' ' + (hub[1] + 110) + ' ' + x + ' ' + (y - 170) + ' ' + x + ' ' + (y - 96) + '" fill="none" stroke="' + TEAL + '" stroke-width="5" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>').join('') +
      '<circle cx="' + hub[0] + '" cy="' + hub[1] + '" r="13" fill="' + TEAL + '"/>', 'left:0;top:0');
    const hubDot = lines2.querySelector('circle');
    const nd2 = nodes2.map(([x, y, ic, lab, at]) => {
      const n = mk(s2.el, 'position:absolute;left:' + (x - 88) + 'px;top:' + (y - 88) + 'px;width:176px;height:176px;border-radius:50%;background:' + TEAL + ';color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 22px 44px -20px rgba(11,127,116,.6),inset 0 2px 0 rgba(255,255,255,.25)', null, R.icon(ic));
      const sv = n.querySelector('svg'); if (sv) { sv.setAttribute('width', '86'); sv.setAttribute('height', '86'); sv.style.strokeWidth = '1.8'; }
      const lb = label(s2.el, y + 112, esc(lab), 'left:' + (x - 260) + 'px;width:520px;font:700 60px/1.1 ' + SANS + ';letter-spacing:-.025em;color:' + INK);
      cue(at - 0.05, 'tap', 0.6); ev(at - 0.05, 'drop');
      return { n, lb, at: at - 0.05 };
    });
    cue(T.mot - 0.1, 'tick_soft', 0.35); ev(T.mot - 0.1, 'step');
    s2.ticks.push((t) => {
      const lp = lines2.querySelectorAll('path'); lp.forEach((p, k) => { p.style.strokeDashoffset = (1 - io(seg(t, T.mot - 0.1 + k * 0.12, nd2[k].at + 0.05))).toFixed(4); });
      hubDot.setAttribute('r', (13 * ex(seg(t, T.mot - 0.2, T.mot + 0.1))).toFixed(2));
      nd2.forEach((q) => { const a = seg(t, q.at, q.at + 0.4), e = back(a, 1.6); q.n.style.opacity = clamp(a * 3).toFixed(3); q.n.style.transform = 'scale(' + (0.5 + 0.5 * e).toFixed(4) + ')'; q.n.style.visibility = t < q.at - 0.02 ? 'hidden' : '';
        const b = seg(t, q.at + 0.08, q.at + 0.5); q.lb.style.opacity = ex(b).toFixed(3); q.lb.style.transform = 'translateY(' + ((1 - ex(b)) * 30).toFixed(2) + 'px)'; q.lb.style.visibility = t < q.at ? 'hidden' : ''; });
      void res2;
    });

    // ================================================================ 3: „Așa că nu e vina ta că zona nu cedează.”
    const s3 = ST[3];
    block(s3.el, 520, 'așa că nu e', { li: 3, size: 70, weight: 520 });
    const vina = block(s3.el, 610, '*vina* *ta*', { li: 3, size: 240 });
    block(s3.el, 920, 'că zona nu cedează', { li: 3, size: 66, weight: 520, color: MUTE });
    const glow3 = mk(s3.el, 'position:absolute;left:190px;top:560px;width:700px;height:420px;border-radius:50%;background:radial-gradient(ellipse,rgba(95,212,198,.32),rgba(95,212,198,0) 68%);opacity:0');
    s3.el.insertBefore(glow3, s3.el.firstChild);
    s3.ticks.push((t) => { const a = seg(t, vina.t0, vina.t0 + 0.9); glow3.style.opacity = (0.9 * sm(a)).toFixed(3); glow3.style.transform = 'scale(' + (0.8 + 0.2 * o3(a) + 0.02 * Math.sin(t * 1.3)).toFixed(4) + ')'; });

    // ================================================================ 4: „Doar că grăsimea asta are un punct slab.”
    const s4 = ST[4];
    block(s4.el, 470, 'doar că', { li: 4, size: 66, weight: 520 });
    const gr4 = block(s4.el, 590, 'grăsimea', { li: 4, size: 210, weight: 900, letters: true, css: 'letter-spacing:-.045em;line-height:1' });
    block(s4.el, 1000, 'are un punct *slab*', { li: 4, size: 70, weight: 520, kem: 1.9 });
    T.gr4 = wt(4, /^grăsimea/, 0.3); T.punct = wt(4, /^punct/, 1.2); T.slab4 = wt(4, /^slab/, 1.5);
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => svg(s4.el, 70, 70, '<path d="M' + (sx < 0 ? 4 : 66) + ' 66V' + (sy < 0 ? 4 : 66) + '" fill="none"/><path d="M' + (sx < 0 ? 4 : 66) + ' ' + (sy < 0 ? 4 : 66) + 'H' + (sx < 0 ? 66 : 4) + 'M' + (sx < 0 ? 4 : 66) + ' ' + (sy < 0 ? 4 : 66) + 'V' + (sy < 0 ? 66 : 4) + '" fill="none" stroke="' + TEAL + '" stroke-width="7" stroke-linecap="round"/>', 'left:0;top:0'));
    const dot4 = mk(s4.el, 'position:absolute;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:' + ROSE + ';box-shadow:0 0 0 0 rgba(234,181,165,.5),0 10px 22px -6px rgba(207,143,125,.7)');
    T.corner = T.gr4 + 0.2;
    [0, 1, 2, 3].forEach((k) => { cue(T.corner + 0.45 + k * 0.06, 'tick_soft', 0.45); }); ev(T.corner + 0.5, 'step'); cue(T.slab4 - 0.05, 'dot', 0.7, { prio: 3 }); ev(T.slab4 - 0.05, 'reveal'); ev(T.slab4 + 0.7, 'step');
    s4.ticks.push((t) => {
      const r = gr4.el.getBoundingClientRect ? null : null; void r;
      const box = { x0: 150, x1: 930, y0: 600, y1: 860 };
      const c = ex(seg(t, T.corner, T.corner + 0.7)), far = 1 - c, pulse = 1 + 0.02 * Math.sin(t * 7) * c;
      [[box.x0, box.y0, -1, -1], [box.x1, box.y0, 1, -1], [box.x0, box.y1, -1, 1], [box.x1, box.y1, 1, 1]].forEach(([x, y, sx, sy], k) => {
        const el = corners[k]; el.style.transform = 'translate(' + (x - 35 + sx * (far * 220 + 6 * (pulse - 1) * 50) - (sx < 0 ? -31 : 31)).toFixed(2) + 'px,' + (y - 35 + sy * (far * 260) - (sy < 0 ? -31 : 31)).toFixed(2) + 'px)'; el.style.opacity = clamp(c * 2).toFixed(3); });
      // the weak point: a rose gold dot on the „s” of the word
      const d = seg(t, T.slab4 - 0.05, T.slab4 + 0.35), e = back(d, 2.4), ring = (t - T.slab4) % 0.9;
      dot4.style.left = '475px'; dot4.style.top = '722px'; dot4.style.opacity = clamp(d * 4).toFixed(3); dot4.style.transform = 'scale(' + (e * (1 + 0.06 * Math.sin(t * 6))).toFixed(4) + ')';
      dot4.style.boxShadow = '0 0 0 ' + (t > T.slab4 ? (ring * 46).toFixed(1) : 0) + 'px rgba(234,181,165,' + (t > T.slab4 ? (0.45 * (1 - ring / 0.9)).toFixed(3) : 0) + '),0 10px 22px -6px rgba(207,143,125,.7)';
      dot4.style.visibility = t < T.slab4 - 0.06 ? 'hidden' : '';
      weightOf(gr4.ws[0].lts, () => 900);
    });

    // ================================================================ 5: „Cu Liposonix, ultrasunetele trec prin piele fără s-o afecteze și țintesc doar grăsimea.”
    const s5 = ST[5];
    block(s5.el, 300, 'cu *Liposonix*', { li: 5, size: 66, weight: 520, kem: 1.55, plainKey: true, css: '' });
    s5.el.querySelectorAll('.tx')[0].querySelectorAll('.w')[1].style.cssText += ';color:' + DEEP + ';font-weight:800';
    const layerLine = (y) => mk(s5.el, 'position:absolute;left:170px;width:740px;top:' + y + 'px;height:3px;border-radius:2px;background:rgba(18,32,31,.12)');
    const piele = label(s5.el, 520, '<span class="lt">PIELE</span>', 'font:250 104px/1 ' + SANS + ';letter-spacing:.16em;color:#41504e;padding-left:.16em');
    const ln5a = layerLine(668);
    const gras = label(s5.el, 706, [...'GRĂSIME'].map((c) => '<span class="lt">' + c + '</span>').join(''), 'font:900 176px/1 ' + SANS + ';letter-spacing:-.03em;color:' + INK);
    const ln5b = layerLine(928);
    const muschi = label(s5.el, 966, 'MUȘCHI', 'font:500 104px/1 ' + SANS + ';letter-spacing:.12em;color:#8a9795;padding-left:.12em');
    const sub5 = block(s5.el, 1200, 'trec prin piele, fără s-o afecteze', { li: 5, size: 52, weight: 560, color: MUTE });
    const FOC = [540, 794];
    const cone = svg(s5.el, 1080, 1920, '<defs><linearGradient id="kn-cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + TEAL + '" stop-opacity=".0"/><stop offset=".35" stop-color="' + TEAL + '" stop-opacity=".55"/><stop offset="1" stop-color="' + TEAL + '" stop-opacity=".9"/></linearGradient></defs>' +
      [-3, -2, -1, 0, 1, 2, 3].map((k) => '<path class="ray" d="M' + (540 + k * 74) + ' 420L' + FOC[0] + ' ' + FOC[1] + '" stroke="url(#kn-cg)" stroke-width="' + (k ? 3 : 4) + '" fill="none" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>').join('') +
      [0, 1, 2].map(() => '<path class="wf" d="" fill="none" stroke="' + TEAL + '" stroke-width="4" stroke-linecap="round"/>').join(''), 'left:0;top:0');
    const rays = [...cone.querySelectorAll('.ray')], wfs = [...cone.querySelectorAll('.wf')];
    const focus5 = mk(s5.el, 'position:absolute;left:' + (FOC[0] - 26) + 'px;top:' + (FOC[1] - 26) + 'px;width:52px;height:52px;border-radius:50%;background:' + ROSE + ';box-shadow:0 0 0 10px rgba(251,227,217,.55),0 0 46px 14px rgba(234,181,165,.55)');
    const shim5 = mk(s5.el, 'position:absolute;left:0;top:500px;width:240px;height:150px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.95),rgba(255,255,255,0));opacity:0');
    T.ultra = wt(5, /^ultrasunetele/, 0.7); T.prin = wt(5, /^piele/, 1.6); T.afect = wt(5, /^afecteze/, 2.3); T.tint = wt(5, /^țintesc/, 2.9); T.gras5 = wt(5, /^grăsimea/, 3.5);
    T.land = T.tint + 0.08;
    shots[5].revealAt = T.land;
    [[piele, 0.0], [ln5a, 0.08], [gras, 0.14], [ln5b, 0.22], [muschi, 0.28]].forEach(([el, d], k) => { el._at = S[5] + 0.1 + d; cue(el._at, k % 2 ? 'tick_soft' : 'tap', k % 2 ? 0.3 : 0.45); ev(el._at, 'drop'); });
    cue(T.ultra - 0.05, 'riser_soft', 0.4); ev(T.ultra, 'step'); cue(T.prin, 'shimmer_soft', 0.35); ev(T.prin, 'step'); ev(T.afect, 'step');
    cue(T.land, 'dot', 0.8, { prio: 4 });
    s5.ticks.push((t) => {
      [piele, ln5a, gras, ln5b, muschi].forEach((el) => { const a = seg(t, el._at, el._at + 0.5); el.style.opacity = ex(a).toFixed(3); el.style.transform = 'translateY(' + ((1 - ex(a)) * 50).toFixed(2) + 'px)'; el.style.filter = a < 1 ? 'blur(' + ((1 - ex(a)) * 10).toFixed(2) + 'px)' : ''; });
      const r = io(seg(t, T.ultra, T.land)); rays.forEach((p, k) => { p.style.strokeDashoffset = (1 - io(seg(t, T.ultra + Math.abs(k - 3) * 0.05, T.land))).toFixed(4); });
      // three wavefronts travel down the cone, through the skin (which stays as it is) into the fat
      wfs.forEach((p, k) => { const ph = ((t - T.ultra) * 0.9 + k / 3) % 1, on = t > T.ultra && t < S[6], y = lerp(430, FOC[1], ph), wdt = lerp(250, 14, (y - 420) / (FOC[1] - 420));
        p.setAttribute('d', on ? 'M' + (540 - wdt) + ' ' + (y - 16) + 'Q540 ' + (y + 16) + ' ' + (540 + wdt) + ' ' + (y - 16) : ''); p.style.opacity = on ? (Math.sin(Math.PI * ph) * 0.8 * r).toFixed(3) : '0'; });
      const sh = seg(t, T.prin - 0.05, T.prin + 0.6); shim5.style.opacity = (Math.sin(Math.PI * sh) * 0.85).toFixed(3); shim5.style.transform = 'translateX(' + lerp(120, 760, io(sh)).toFixed(1) + 'px)';
      const f = seg(t, T.land - 0.12, T.land + 0.25); focus5.style.opacity = clamp(f * 3).toFixed(3); focus5.style.transform = 'scale(' + (back(f, 2.2) * (1 + 0.08 * Math.sin(t * 7))).toFixed(4) + ')';
      // the letters around the focus warm up (turquoise), nothing else changes
      const heat = sm(seg(t, T.land, T.land + 0.8));
      gras.querySelectorAll('.lt').forEach((l, k) => { const near = Math.exp(-Math.pow((k - 3) / 1.4, 2)) * heat; l.style.color = 'rgb(' + [lerp(18, 11, near), lerp(32, 127, near), lerp(31, 116, near)].map(Math.round).join(',') + ')'; });
      void sub5;
    });

    // ================================================================ 6: „Celulele de grăsime din zona tratată sunt distruse, iar corpul le elimină în săptămânile următoare.”
    const s6 = ST[6];
    block(s6.el, 380, 'celulele din zona tratată', { li: 6, size: 60, weight: 520 });
    const gr6 = label(s6.el, 520, [...'grăsime'].map((c) => '<span class="lt">' + c + '</span>').join(''), 'font:900 236px/1 ' + SANS + ';letter-spacing:-.045em;color:' + INK);
    const lts6 = [...gr6.querySelectorAll('.lt')];
    block(s6.el, 800, 'sunt *distruse*', { li: 6, size: 70, weight: 520, kem: 2.3 });
    block(s6.el, 1140, 'corpul le elimină', { li: 6, size: 64, weight: 560 });
    block(s6.el, 1232, 'în săptămânile următoare', { li: 6, size: 52, weight: 520, color: MUTE });
    T.dis = wt(6, /^distruse/, 1.6); T.elim = wt(6, /^elimină/, 2.4);
    const parts6 = []; for (let k = 0; k < 26; k++) { const p = mk(s6.el, 'position:absolute;width:12px;height:12px;border-radius:50%;background:' + (k % 3 ? TEAL : '#5fd4c6') + ';opacity:0'); parts6.push({ p, x: 230 + R.rnd(k, 3) * 620, y: 560 + R.rnd(k, 5) * 200, d: 0.6 + R.rnd(k, 7) * 0.9, s: 0.5 + R.rnd(k, 9) }); }
    cue(T.dis, 'shimmer_soft', 0.45); ev(T.dis + 0.3, 'step'); for (let k = 0; k < 7; k++) cue(T.dis + 0.06 + Math.abs(k - 3) * 0.07, 'tick_soft', 0.22);
    cue(T.elim, 'sand_flow', 0.3); ev(T.elim, 'step'); ev(T.elim + 0.9, 'step');
    s6.ticks.push((t) => {
      weightOf(lts6, (k) => lerp(900, 100, io(seg(t, T.dis + Math.abs(k - 3) * 0.07, T.dis + Math.abs(k - 3) * 0.07 + 0.5))));
      gr6.style.opacity = ex(seg(t, S[6] - 0.02, S[6] + 0.3)).toFixed(3);
      parts6.forEach((q) => { const a = seg(t, T.elim + q.d * 0.4, T.elim + q.d * 0.4 + 1.4); q.p.style.opacity = (Math.sin(Math.PI * a) * 0.8).toFixed(3); q.p.style.transform = 'translate(' + (q.x + Math.sin(a * 3 + q.x) * 14).toFixed(1) + 'px,' + (q.y - 230 * o3(a)).toFixed(1) + 'px) scale(' + (q.s * (1 - 0.6 * a)).toFixed(3) + ')'; });
    });

    // ================================================================ 7: „Cele distruse nu mai revin. Doar cele rămase se pot mări, dacă iei în greutate.”
    const s7 = ST[7];
    const gr7 = label(s7.el, 440, [...'grăsime'].map((c) => '<span class="lt">' + c + '</span>').join(''), 'font:100 236px/1 ' + SANS + ';letter-spacing:-.045em;color:' + INK);
    const lts7 = [...gr7.querySelectorAll('.lt')];
    const ghost7 = label(s7.el, 440, 'grăsime', 'font:900 236px/1 ' + SANS + ';letter-spacing:-.045em;color:' + TEAL + ';opacity:0');
    ghost7.classList.remove('tx'); ghost7.style.position = 'absolute'; ghost7.style.left = '0'; ghost7.style.width = '1080px'; ghost7.style.textAlign = 'center';
    block(s7.el, 730, 'nu mai *revin*', { li: 7, size: 76, weight: 560, kem: 2.2 });
    block(s7.el, 1060, 'cele rămase se pot mări', { li: 7, size: 62, weight: 560 });
    block(s7.el, 1150, 'dacă iei în greutate', { li: 7, size: 54, weight: 520, color: MUTE });
    T.rev = wt(7, /^revin/, 1.1); T.mari = wt(7, /^mări/, 2.6);
    cue(T.rev - 0.3, 'suck_in', 0.3); ev(T.rev - 0.3, 'step'); cue(T.mari, 'pulse', 0.5); ev(T.mari, 'step');
    s7.ticks.push((t) => {
      // the old, heavy word tries to come back behind the thin one and does not make it
      const g = seg(t, T.rev - 0.55, T.rev + 0.35); ghost7.style.opacity = (Math.sin(Math.PI * g) * 0.16).toFixed(3); ghost7.style.transform = 'scale(' + (1.12 - 0.1 * g).toFixed(4) + ')'; ghost7.style.filter = 'blur(' + (6 + 10 * (1 - Math.sin(Math.PI * g))).toFixed(1) + 'px)';
      weightOf(lts7, (k) => lerp(100, 330, io(seg(t, T.mari + k * 0.03, T.mari + 0.55 + k * 0.03))));
    });

    // ================================================================ 8: „Iar diferența se vede, în general, la 6-8 săptămâni.”
    const s8 = ST[8];
    block(s8.el, 380, 'diferența se vede', { li: 8, size: 66, weight: 560 });
    block(s8.el, 470, 'în general', { li: 8, size: 50, weight: 520, color: MUTE });
    T.sase = wt(8, /^șase/, 1.3); T.opt = wt(8, /^opt/, 1.8); T.sapt = wt(8, /^săptămâni/, 2.1);
    const num8 = label(s8.el, 580, '6-8', 'font:900 300px/1 ' + SANS + ';letter-spacing:-.05em;color:' + INK + ';opacity:0');
    block(s8.el, 890, '*săptămâni*', { li: 8, size: 140 });
    const TL = { x0: 190, x1: 890, y: 1180 }, tl = mk(s8.el, 'position:absolute;left:0;top:0;width:1080px;height:1920px');
    const base8 = mk(tl, 'position:absolute;left:' + TL.x0 + 'px;top:' + TL.y + 'px;width:' + (TL.x1 - TL.x0) + 'px;height:4px;border-radius:2px;background:rgba(18,32,31,.16);transform-origin:0 50%');
    const seg8 = mk(tl, 'position:absolute;top:' + (TL.y - 7) + 'px;height:18px;border-radius:9px;background:' + TEAL + ';transform-origin:0 50%');
    const xs = (k) => lerp(TL.x0 + 20, TL.x1 - 20, (k - 1) / 7);
    seg8.style.left = xs(6) + 'px'; seg8.style.width = (xs(8) - xs(6)) + 'px';
    const ticks8 = []; for (let k = 1; k <= 8; k++) { const tk = mk(tl, 'position:absolute;left:' + (xs(k) - 2) + 'px;top:' + (TL.y - 22) + 'px;width:4px;height:48px;border-radius:2px;background:rgba(18,32,31,.3)'); const lb = mk(tl, 'position:absolute;left:' + (xs(k) - 40) + 'px;top:' + (TL.y + 42) + 'px;width:80px;text-align:center;font:600 40px/1 ' + MONO + ';color:' + MUTE, null, String(k)); const at = S[8] + 0.25 + k * 0.07; ticks8.push({ tk, lb, at, k }); cue(at, 'tick_soft', 0.22); }
    ev(S[8] + 0.5, 'step'); cue(T.sase - 0.05, 'tap', 0.55); ev(T.sase - 0.05, 'reveal'); cue(T.opt, 'tick_soft', 0.45); ev(T.opt, 'step');
    s8.ticks.push((t) => {
      base8.style.transform = 'scaleX(' + io(seg(t, S[8] + 0.1, S[8] + 0.9)).toFixed(4) + ')';
      ticks8.forEach((q) => { const a = seg(t, q.at, q.at + 0.3); q.tk.style.opacity = q.lb.style.opacity = ex(a).toFixed(3); q.tk.style.transform = 'scaleY(' + ex(a).toFixed(3) + ')'; const hi = q.k >= 6 && t > T.opt ? 1 : 0; q.lb.style.color = hi ? DEEP : MUTE; q.lb.style.fontWeight = hi ? '800' : '600'; });
      seg8.style.transform = 'scaleX(' + io(seg(t, T.sase - 0.05, T.opt + 0.2)).toFixed(4) + ')'; seg8.style.opacity = t > T.sase - 0.06 ? '1' : '0';
      const n = seg(t, T.sase - 0.08, T.sase + 0.45); num8.style.opacity = ex(n).toFixed(3); num8.style.transform = 'scale(' + (2.0 - 1.0 * ex(n)).toFixed(4) + ')'; num8.style.filter = n < 1 ? 'blur(' + ((1 - ex(n)) * 22).toFixed(2) + 'px)' : '';
    });

    // ================================================================ 9: „Trimite-l prietenei care crede că e doar lipsă de voință.”
    const s9 = ST[9];
    block(s9.el, 400, 'trimite-l prietenei', { li: 9, size: 70, weight: 600 });
    block(s9.el, 490, 'care crede că e doar', { li: 9, size: 60, weight: 520, color: MUTE });
    block(s9.el, 640, 'lipsă de', { li: 9, size: 96, weight: 600 });
    const voi = block(s9.el, 760, '*voință*', { li: 9, size: 250, weight: 900, letters: true, plainKey: true, css: 'letter-spacing:-.045em;line-height:1' });
    T.voi = wt(9, /^voință/, 2.6); T.strike = Math.max(T.voi + 0.5, lineEnd(9) + 0.05);
    const strike = svg(s9.el, 820, 120, '<path d="M14 78C220 58 520 48 806 30" fill="none" stroke="' + TEAL + '" stroke-width="16" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>', 'left:130px;top:812px');
    const ans9 = label(s9.el, 1120, 'motive <span style="font:italic 440 1.25em ' + SERIF + ';color:' + DEEP + '">genetice</span> și <span style="font:italic 440 1.25em ' + SERIF + ';color:' + DEEP + '">hormonale</span>', 'font:600 58px/1.2 ' + SANS + ';letter-spacing:-.02em;color:' + INK + ';opacity:0');
    shots[9].resolveAt = T.strike + 0.15;
    cue(T.strike, 'whoosh_cut', 0.35, { peak: true }); ev(T.strike, 'reveal'); cue(T.strike + 0.55, 'tick_soft', 0.45); ev(T.strike + 0.55, 'step');
    s9.ticks.push((t) => {
      strike.querySelector('path').style.strokeDashoffset = (1 - io(seg(t, T.strike, T.strike + 0.32))).toFixed(4);
      weightOf(voi.ws[0].lts, (k) => lerp(900, 230, io(seg(t, T.strike + 0.15 + k * 0.035, T.strike + 0.6 + k * 0.035))));
      const a = seg(t, T.strike + 0.5, T.strike + 1.0); ans9.style.opacity = ex(a).toFixed(3); ans9.style.transform = 'translateY(' + ((1 - ex(a)) * 34).toFixed(2) + 'px)'; ans9.style.filter = a < 1 ? 'blur(' + ((1 - ex(a)) * 8).toFixed(2) + 'px)' : '';
    });

    // ================================================================ the camera: a move into each station, on its cut
    const mv = (t, i) => R.cam.ease(t, S[i], MD);
    const spd = (t, i) => (mv(t + 1 / 120, i) - mv(t - 1 / 120, i)) * 60;   // the share of the move made in one frame
    function place(i, t) {
      const st = ST[i];
      let tr = '', op = 1, bl = 0, dir = null;
      const nx = i + 1 < N ? i + 1 : -1;
      if (i > 0 && t < S[i] + MD) {   // coming in
        const p = mv(t, i), v = spd(t, i), m = MOVE[i];
        if (m === 'crane') { tr = 'translateY(' + ((1 - p) * 1500).toFixed(2) + 'px)'; dir = [0, v * 1500 * 0.35]; }
        else if (m === 'whip') { tr = 'translateX(' + ((1 - p) * 1150).toFixed(2) + 'px)'; dir = [v * 1150 * 0.35, 0]; }
        else if (m === 'through') { tr = 'scale(' + (0.5 + 0.5 * p).toFixed(4) + ')'; op = clamp(p * 2.2); bl = (1 - p) * 14; }
        else if (m === 'pull') { tr = 'scale(' + (1.7 - 0.7 * p).toFixed(4) + ')'; op = clamp(p * 2.4); bl = (1 - p) * 18; }
        else if (m === 'flash') { tr = 'scale(' + (1.18 - 0.18 * p).toFixed(4) + ')'; }
        if (t < S[i] && m !== 'flash') op = 0;
        if (m === 'flash' && t < S[i]) op = 0;
      }
      let lv = nx; if (lv > 0 && MOVE[lv] === 'carry') lv = lv + 1 < N ? lv + 1 : -1;   // a carried station leaves with the one after it
      if (lv > 0 && t >= S[lv] - (MOVE[lv] === 'flash' ? 0.32 : 0)) {   // leaving
        const m = MOVE[lv], nx2 = lv;
        if (m === 'flash') { const z = io(seg(t, S[nx2] - 0.32, S[nx2])); tr += ' translate(' + ((540 - FOC[0]) * z).toFixed(1) + 'px,' + ((960 - FOC[1]) * z).toFixed(1) + 'px) scale(' + (1 + 6 * z * z).toFixed(4) + ')'; st.o.style.transformOrigin = FOC[0] + 'px ' + FOC[1] + 'px'; bl = z * 6; op = t >= S[nx2] ? 0 : 1; }
        else { const p = mv(t, nx2), v = spd(t, nx2);
          if (m === 'crane') { tr += ' translateY(' + (-p * 1500).toFixed(2) + 'px)'; dir = [0, v * 1500 * 0.35]; }
          else if (m === 'whip') { tr += ' translateX(' + (-p * 1150).toFixed(2) + 'px)'; dir = [v * 1150 * 0.35, 0]; }
          else if (m === 'through') { tr += ' scale(' + (1 + 2.6 * p * p).toFixed(4) + ')'; op *= 1 - clamp(p * 1.6); bl = p * 22; }
          else if (m === 'pull') { tr += ' scale(' + (1 - 0.45 * p).toFixed(4) + ')'; op *= 1 - clamp(p * 1.8); bl = p * 8; }
          if (p >= 1) op = 0; }
      } else st.o.style.transformOrigin = '540px 960px';
      st.o.style.transform = tr; st.o.style.opacity = op.toFixed(3);
      if (dir && Math.hypot(dir[0], dir[1]) > 1.5) { defs[i].setAttribute('stdDeviation', Math.min(70, Math.abs(dir[0])).toFixed(1) + ' ' + Math.min(70, Math.abs(dir[1])).toFixed(1)); st.o.style.filter = 'url(#kn-mb' + i + ')'; }
      else st.o.style.filter = bl > 0.3 ? 'blur(' + bl.toFixed(2) + 'px)' : '';
      return op > 0.002;
    }
    // the flash through the light into the focus (the reel's one zoom through light; its sound is the loudest of the reel)
    cue(S[6] - 0.32, 'whoosh_through', 0.85, { peak: true, prio: 4 }); cue(S[6], 'hit_deep', 0.7, { prio: 4 }); cue(S[6] + 0.02, 'shimmer_soft', 0.45); ev(S[6], 'reveal');
    for (let i = 1; i < N; i++) if (MOVE[i] !== 'flash' && MOVE[i] !== 'carry') { cue(S[i] + 0.42, 'tap', 0.25); }

    // ================================================================ one frame
    let lastT = null;
    W.draw = (t) => {
      if (t === lastT) return; lastT = t;
      // the punch-in on the drop: a quick push, a short tremor, a clean stop
      const pd = t - T.drop, punch = pd > 0 ? Math.exp(-5.5 * pd) : 0, trem = pd > 0 && pd < 0.35 ? Math.sin(pd * 95) * 7 * (1 - pd / 0.35) : 0;
      cam.style.transform = 'translate(' + trem.toFixed(2) + 'px,' + (60 + trem * -0.5).toFixed(2) + 'px) scale(' + (1 + 0.075 * punch).toFixed(4) + ')';
      flashEl.style.opacity = (R.cam.flash(t, S[6]) * 0.96).toFixed(3);
      rings.forEach((q) => { q.r.style.transform = 'translate(' + (Math.sin(t * 0.21 + q.k * 2) * 26).toFixed(1) + 'px,' + (Math.cos(t * 0.17 + q.k) * 22).toFixed(1) + 'px)'; });
      for (let i = 0; i < N; i++) {
        const st = ST[i], from = i ? S[i] - (MOVE[i] === 'flash' ? 0.02 : 0.01) : -1, to = i < N - 1 ? (MOVE[i + 1] === 'carry' && i + 2 < N ? S[i + 2] : S[i + 1]) + MD + 0.02 : 1e9;
        const on = t >= from && t <= to && place(i, t);
        st.o.style.display = on ? 'block' : 'none';
        if (on) st.ticks.forEach((f) => f(t));
      }
      for (const K of kin) {
        let moving = false;
        for (const w of K.ws) {
          const dur = w.mode === 'blur' ? 0.6 : 0.46, p = seg(t, w.t, w.t + dur), e = ex(p); if (p < 1) moving = true;
          if (w.mode === 'blur') { const k = 2.5 - 1.5 * e; w.wi.style.transform = 'scale(' + k.toFixed(4) + ')'; w.wi.style.opacity = clamp(p * 3).toFixed(3); w.wi.style.filter = p < 1 ? 'blur(' + ((1 - e) * 26).toFixed(2) + 'px)' : ''; }
          else { w.wi.style.transform = 'translateY(' + ((1 - e) * 118).toFixed(2) + '%)'; }
          w.s.style.visibility = t < w.t - 0.01 ? 'hidden' : '';
        }
        const out = K.out != null ? seg(t, K.out, K.out + 0.22) : 0; if (out > 0 && out < 1) moving = true;
        K.el.style.opacity = (1 - out).toFixed(3); K.el.style.visibility = out >= 1 || t < K.t0 - 0.02 ? 'hidden' : '';
        K.el.style.filter = moving ? 'blur(0px)' : '';
      }
    };
    return W;
  }
  TYPES.forEach((tp) => { V[tp] = (ctx) => { const w = build(); ctx.tick(w.draw); }; });
})();
