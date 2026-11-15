// Centrul360 reels v2: the chat with Nuki (15.11; format ix, the variant without client messages: the visitor asks,
// the brand answers, the text only from the site). Our own chat interface, in the brand's style (a white glass sheet,
// turquoise bubbles for Nuki, light grey for the visitor); it imitates no app. Bubbles have weight (a spring, the older
// ones give way with a small lag), typing dots, and the camera never stands still. Then the last bubble lifts off the
// sheet, turns over in the air and is a photo card: a short montage of real things on the music's accents (the real
// room and the real handpiece, black and white with their own turquoise kept; the real page on a phone), each card
// with thickness, stacked, flying past the camera. The phone turns over into Nuki's last bubble: the invitation.
//   visual: { type: "chat", title, name, typing, messages: [{ who: "v" | "n", text, t, type }], lift, cards: [{ img, label, t }],
//             phone: { key, t }, end: { t0, t, text, pose } }
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, E, h, esc } = R;
  const W = 1080;
  const smooth = (p) => { p = clamp(p); return p * p * (3 - 2 * p); };
  const lerp = (a, b, p) => a + (b - a) * p;
  // a spring with one small overshoot: 0 → 1 (x in units of its own time)
  const spring = (x) => (x <= 0 ? 0 : 1 - Math.exp(-6.2 * x) * (Math.cos(8.6 * x) + 0.72 * Math.sin(8.6 * x)));
  const CSS = `
.cx-root{position:absolute;left:0;top:0;width:1080px;height:1920px;overflow:hidden}
.cx-light{position:absolute;border-radius:50%;filter:blur(90px)}
.cx-world{position:absolute;left:0;top:0;width:1080px;height:1920px;perspective:1900px;perspective-origin:540px 860px}
.cx-cam{position:absolute;left:0;top:0;width:1080px;height:1920px;transform-style:preserve-3d;transform-origin:540px 860px}
.cx-sheet{position:absolute;left:65px;top:228px;width:950px;height:1264px;border-radius:66px}
.cx-glass{position:absolute;inset:0;border-radius:66px;
  background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(255,255,255,.9));box-shadow:0 0 0 1.5px rgba(255,255,255,.95) inset,0 0 0 1px rgba(11,60,55,.06),0 70px 120px -60px rgba(11,127,116,.42),0 24px 50px -34px rgba(18,32,31,.28)}
.cx-gloss{position:absolute;inset:0;border-radius:66px;overflow:hidden;pointer-events:none}
.cx-gloss i{position:absolute;top:-20%;left:0;width:46%;height:140%;background:linear-gradient(100deg,rgba(255,255,255,0),rgba(236,250,248,.9) 50%,rgba(255,255,255,0));opacity:.55}
.cx-head{position:absolute;left:0;top:0;width:950px;height:156px;border-bottom:1.5px solid rgba(11,60,55,.07)}
.cx-av{position:absolute;left:52px;top:26px;width:104px;height:104px;border-radius:50%;background:#e4f4f1;overflow:hidden;box-shadow:0 0 0 3px #fff,0 0 0 6px rgba(20,165,150,.9)}
.cx-av img{position:absolute;left:-70%;top:-26%;width:250%;height:auto}
.cx-ring{position:absolute;left:41px;top:15px;width:126px;height:126px;border-radius:50%;border:3px solid rgba(20,165,150,.55)}
.cx-ttl{left:186px;top:34px;font:800 48px/1.1 var(--f-body);letter-spacing:-.03em;color:#0b0b0d;white-space:nowrap}
.cx-sub{left:187px;top:93px;font:500 32px/1.1 var(--f-body);color:#5e6d6b;white-space:nowrap}
.cx-area{position:absolute;left:0;top:162px;width:950px;height:1102px}
.cx-b{position:absolute;top:0;overflow:hidden}
.cx-b.n{left:75px;border-radius:46px 46px 46px 14px;transform-origin:0 100%;background:linear-gradient(165deg,#19b5a5,#0f998b);box-shadow:0 18px 30px -20px rgba(11,127,116,.7),0 1px 0 rgba(255,255,255,.35) inset;color:#fff}
.cx-b.v{right:75px;border-radius:46px 46px 14px 46px;transform-origin:100% 100%;background:linear-gradient(180deg,#f1f4f4,#e9eeed);box-shadow:0 14px 26px -20px rgba(18,32,31,.4),0 1px 0 rgba(255,255,255,.9) inset;color:#12201f}
.cx-t{left:34px;top:25px;font:600 48px/1.25 var(--f-body);letter-spacing:-.022em;text-wrap:balance}
.cx-d{position:absolute;left:0;top:0;width:150px;height:104px}
.cx-d i{position:absolute;top:43px;width:18px;height:18px;border-radius:50%;background:currentColor}
.cx-card{position:absolute;left:0;top:0;transform-style:preserve-3d}
.cx-card>*{position:absolute;inset:0;border-radius:inherit}
.cx-f{backface-visibility:hidden;overflow:hidden}
.cx-slab{background:#d6e2e0}
.cx-photo{background:#fff;box-shadow:0 0 0 1px rgba(11,60,55,.08)}
.cx-photo canvas{position:absolute;left:16px;top:16px;width:calc(100% - 32px);height:calc(100% - 32px);border-radius:34px}
.cx-chip{left:44px;bottom:46px;padding:15px 26px 16px 22px;border-radius:40px;background:rgba(255,255,255,.92);box-shadow:0 14px 30px -16px rgba(0,0,0,.5);font:650 31px/1 var(--f-body);letter-spacing:-.01em;color:#0b0b0d;white-space:nowrap}
.cx-chip i{display:inline-block;width:14px;height:14px;border-radius:50%;background:#14a596;margin:0 14px 3px 0;vertical-align:middle}
.cx-sheen{position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,rgba(255,255,255,0) 32%,rgba(255,255,255,.34) 48%,rgba(255,255,255,0) 62%);background-size:260% 100%}
.cx-shade{position:absolute;inset:0;pointer-events:none;background:#06302b;opacity:0}
.cx-phone{background:#0e1b1a;box-shadow:0 0 0 2px #2a3b39 inset}
.cx-scr{position:absolute;left:15px;top:15px;right:15px;bottom:15px;border-radius:62px;overflow:hidden;background:#fff}
.cx-scr img{position:absolute;left:0;width:100%;height:auto;display:block}
.cx-end{background:linear-gradient(165deg,#19b5a5,#0f998b);box-shadow:0 1px 0 rgba(255,255,255,.35) inset}
.cx-endt{left:46px;top:38px;width:668px;text-align:center;font:700 56px/1.24 var(--f-body);letter-spacing:-.03em;color:#fff;text-wrap:balance}
.cx-kw{display:inline-block;padding:0 .26em .04em;margin:0 .04em;border-radius:.3em;background:linear-gradient(90deg,#fbe3d9,#eab5a5 55%,#cf8f7d);color:#3b1c14;font-weight:800}
.cx-drop{position:absolute;border-radius:50%;background:radial-gradient(ellipse at center,rgba(4,60,54,.26),rgba(4,60,54,0) 70%);filter:blur(10px)}
.cx-nuki{position:absolute;transform-origin:50% 96%}
.cx-nuki img{position:absolute;left:0;top:0;width:100%;height:auto;display:block}`;

  // a real photo in black and white, with its own turquoise kept (the device's printed logo and badge): nothing painted in
  function bwTeal(img, o) {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const im = g.getImageData(0, 0, c.width, c.height), d = im.data, ss = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const s0 = o.s0 || 0.16, s1 = o.s1 || 0.3, con = o.contrast || 1.08; // how saturated a turquoise pixel must be to keep its colour
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), ch = mx - mn, l = (mx + mn) / 2;
      let w = 0;
      if (ch > 0.02) { const s = ch / (1 - Math.abs(2 * l - 1) + 1e-6); let hue = mx === r ? ((gg - b) / ch) % 6 : mx === gg ? (b - r) / ch + 2 : (r - gg) / ch + 4; hue *= 60; if (hue < 0) hue += 360;
        w = ss(150, 164, hue) * (1 - ss(202, 214, hue)) * ss(s0, s1, s) * ss(0.12, 0.22, l) * (1 - ss(0.86, 0.95, l)); }
      const y = clamp(((0.299 * r + 0.587 * gg + 0.114 * b) - 0.5) * con + 0.5);
      const k = 1 + (o.boost == null ? 0.25 : o.boost) * w; // the kept turquoise a touch fuller
      d[i] = 255 * clamp(y + (y + (r - y) * k - y) * w); d[i + 1] = 255 * clamp(y + (y + (gg - y) * k - y) * w); d[i + 2] = 255 * clamp(y + (y + (b - y) * k - y) * w);
    }
    g.putImageData(im, 0, 0); return c;
  }

  V.chat = (ctx, p) => {
    const el = ctx.el;
    if (!document.getElementById('cx-css')) { const st = document.createElement('style'); st.id = 'cx-css'; st.textContent = CSS; document.head.appendChild(st); }
    const root = h('div', 'cx-root', null, el);
    const lights = [[-260, 40, 760, 'rgba(95,212,198,.2)'], [600, 1000, 820, 'rgba(20,165,150,.12)'], [140, 1560, 640, 'rgba(95,212,198,.13)']].map(([x, y, r, col]) => { const d = h('div', 'cx-light', null, root); d.style.cssText += ';left:' + x + 'px;top:' + y + 'px;width:' + r + 'px;height:' + r + 'px;background:' + col; return d; });
    const world = h('div', 'cx-world', null, root), cam = h('div', 'cx-cam', null, world);
    const pre = h('div', null, null, el); pre.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    const load = (src) => { const im = h('img', null, null, pre); im.src = src; return im; };
    const A = R.ROOT + '/brand_asset/';

    // ---------------------------------------------------------------- the sheet
    const sheet = h('div', 'cx-sheet', null, cam);
    const glass = h('div', 'cx-glass', null, sheet);
    const gloss = h('i', null, null, h('div', 'cx-gloss', null, glass));
    const head = h('div', 'cx-head', null, sheet);
    const ring = h('div', 'cx-ring', null, head);
    h('div', 'cx-av', '<img src="' + A + 'mascota/ipostaze/salut-pa.webp">', head);
    h('div', 'tx cx-ttl', esc(p.title || 'Centrul360'), head);
    const sub = h('div', 'tx cx-sub', esc(p.name || 'Nuki'), head), subT = h('div', 'tx cx-sub', esc(p.typing || 'Nuki scrie…'), head);
    const area = h('div', 'cx-area', null, sheet);
    const SX = 65, SW = 950, GUT = 75, PADX = 34;   // the sheet: 88 % of the frame's width, on its axis; the bubbles' column is centred too (text 174..906)
    const HEAD = 162, PADT = 18, PADB = 34, AREA_MAX = 1102, AREA_MIN = 170, SH_CY = 860, GAP = 18, GAP2 = 30, TYW = 150, TYH = 104, MAXW = 620;
    const items = p.messages.map((m, i) => {
      const b = h('div', 'cx-b ' + (m.who === 'n' ? 'n' : 'v'), null, area);
      const dots = h('div', 'cx-d', '<i style="left:40px"></i><i style="left:66px"></i><i style="left:92px"></i>', b);
      const t = h('div', 'tx cx-t', esc(m.text), b); t.style.maxWidth = (m.maxw || MAXW) + 'px'; t.style.width = 'max-content';
      b.style.width = '2000px'; const rg = document.createRange(); rg.selectNodeContents(t); const rs = [...rg.getClientRects()]; // the widest line (the text is balanced): the bubble hugs it
      const tw = Math.ceil(Math.max(...rs.map((r) => r.right)) - Math.min(...rs.map((r) => r.left))) + 2, th = t.offsetHeight; t.style.width = tw + 'px';
      return { m, b, dots: [...dots.children], dotsEl: dots, t, i, who: m.who, tMsg: m.t, tType: m.type != null ? m.type : null, ta: m.type != null ? m.type : m.t, mw: tw + PADX * 2, mh: th + 52 };
    });
    items.forEach((it, i) => { it.gapB = i ? (items[i - 1].who !== it.who ? GAP2 : GAP) : 0; });
    const state = (it, t) => { // its size and its presence at t
      if (t < it.ta) return null;
      const m = it.tType != null ? (t < it.tMsg ? 0 : spring((t - it.tMsg) / 0.44)) : 1;
      return { w: it.tType != null ? lerp(TYW, it.mw, m) : it.mw, h: it.tType != null ? lerp(TYH, it.mh, m) : it.mh, m, e: spring((t - it.ta) / 0.42) };
    };
    const TL = p.lift, FLIP = 0.6, last = items[items.length - 1];
    const HB = p.beats || []; // the heartbeat while the dots hold (the fake-out)
    const beatAt = (t) => HB.reduce((a, tp) => a + (t >= tp ? Math.exp(-(t - tp) * 9) * Math.sin(Math.min(1, (t - tp) / 0.07) * Math.PI / 2) : 0), 0);
    // the layout at a moment: the sheet grows with the conversation (it stays centred), then the oldest bubbles leave at the top
    const lay = (t) => {
      const st = items.map((it) => state(it, t)), g = items.map((it, i) => (st[i] ? Math.min(1.05, spring((t - it.ta) / 0.4)) : 0));
      const tops = []; let y = 0; items.forEach((it, i) => { tops.push(y + it.gapB * g[i]); if (st[i]) y += (it.gapB + st[i].h) * g[i]; });
      const need = PADT + y + PADB, A = clamp(need, AREA_MIN, AREA_MAX), O = Math.max(0, need - AREA_MAX), Hs = HEAD + A;
      return { st, tops, A, O, Hs, top: SH_CY - Hs / 2 };
    };
    const L0 = lay(TL);

    // ---------------------------------------------------------------- the cards of the montage
    const mkCard = (thick, n) => { const c = h('div', 'cx-card', null, cam), slabs = [];
      for (let k = 0; k < n; k++) { const s = h('div', 'cx-slab', null, c); s.style.transform = 'translateZ(' + (-thick / 2 + thick * (k + 0.5) / n).toFixed(1) + 'px)'; slabs.push(s); }
      const back = h('div', 'cx-f', null, c); back.style.transform = 'rotateY(180deg) translateZ(' + (thick / 2) + 'px)';
      const front = h('div', 'cx-f', null, c); front.style.transform = 'translateZ(' + (thick / 2) + 'px)';
      const drop = h('div', 'cx-drop', null, cam); cam.insertBefore(drop, c);
      return { c, front, back, slabs, drop, faces: [front, back] }; };
    const photoFace = (face, img, label, o) => { face.classList.add('cx-photo'); const holder = h('div', null, null, face); holder.style.cssText = 'position:absolute;inset:0';
      const chip = h('div', 'tx cx-chip', '<i></i>' + esc(label), face); const sheen = h('div', 'cx-sheen', null, face), shade = h('div', 'cx-shade', null, face);
      return { holder, chip, sheen, shade, img, o }; };
    const CW = 800, CH = 1067, CX = 540, CY = 852;
    const imgs = p.cards.map((c) => load(A + c.img));
    // card A: the last bubble on its front, the first photo on its back
    const cA = mkCard(16, 6); cA.front.style.cssText += ';background:linear-gradient(165deg,#19b5a5,#0f998b);box-shadow:0 1px 0 rgba(255,255,255,.35) inset;color:#fff';
    const cAt = h('div', 'tx cx-t', esc(last.m.text), cA.front); cAt.style.width = (last.mw - PADX * 2) + 'px';
    const fA = photoFace(cA.back, imgs[0], p.cards[0].label, p.cards[0]);
    const cB = mkCard(16, 6); const fB = photoFace(cB.front, imgs[1], p.cards[1].label, p.cards[1]); cB.back.style.background = '#eef4f3';
    // the phone: the real page on its screen; on its back, Nuki's last bubble
    const PW = 548, PH = 1136, shots = (R.siteShots && R.siteShots.shots) || {}, shot = shots[p.phone.key], nav = R.siteShots && R.siteShots.nav;
    const cP = mkCard(26, 8); cP.front.classList.add('cx-phone'); cP.slabs.forEach((s) => { s.style.background = '#1b2a28'; });
    const scr = h('div', 'cx-scr', null, cP.front); let page = null, navH = 0;
    if (shot) { page = h('img', null, null, scr); page.src = '../site/' + shot.file; if (nav) { const n = h('img', null, null, scr); n.src = '../site/' + nav.file; n.style.top = '0'; navH = (PW - 30) * nav.h / nav.w; } }
    const pSheen = h('div', 'cx-sheen', null, cP.front);
    cP.back.classList.add('cx-end');
    const EW = 760, endT = h('div', 'tx cx-endt', esc(p.end.text).replace(/«([^»]+)»/, '<span class="cx-kw">«$1»</span>'), cP.back);
    cP.c.style.width = EW + 'px'; cP.c.style.height = '600px'; const EH = endT.offsetHeight + 80; const kw = endT.querySelector('.cx-kw');
    // Nuki, beside the last bubble
    const nub = h('i', null, null, cP.c); nub.style.cssText = 'position:absolute;inset:auto;left:calc(50% - 16px);bottom:-13px;width:32px;height:32px;border-radius:7px;background:#0f998b;backface-visibility:hidden;transform:rotateY(180deg) translateZ(12px) rotate(45deg)';
    const NW = 330, nuki = h('div', 'cx-nuki', '<img src="' + A + 'mascota/ipostaze/' + (p.end.pose || 'telefon') + '.webp">', cam); nuki.style.cssText += ';left:' + (CX - NW / 2) + 'px;width:' + NW + 'px;height:' + Math.round(NW * 748 / 694) + 'px';
    const nDrop = h('div', 'cx-drop', null, cam); cam.insertBefore(nDrop, nuki);
    const ECY = 610, NY = ECY + EH / 2 + 50; nuki.style.top = NY + 'px';
    const sig = h('div', null, null, cam), SM = 58, SWH = 27, SWW = Math.round(SWH * 5583 / 426), GX = Math.round((W - (SM + 16 + SWW)) / 2), SY = Math.round(NY + NW * 748 / 694 + 64); sig.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    h('i', null, null, sig).style.cssText = 'position:absolute;left:' + GX + 'px;top:' + SY + 'px;width:' + SM + 'px;height:' + SM + 'px;background:url(' + A + 'logo-mark.png) center/contain no-repeat';
    h('i', null, null, sig).style.cssText = 'position:absolute;left:' + (GX + SM + 16) + 'px;top:' + (SY + (SM - SWH) / 2) + 'px;width:' + SWW + 'px;height:' + SWH + 'px;background:#000;-webkit-mask:url(' + A + 'wordmark-com.png) center/contain no-repeat;mask:url(' + A + 'wordmark-com.png) center/contain no-repeat';
    load(A + 'logo-mark.png'); load(A + 'wordmark-com.png');

    ctx.shot.after = () => { // the photos, in black and white with their own turquoise (after they are decoded)
      [fA, fB].forEach((f) => { const c = bwTeal(f.img, f.o); f.holder.appendChild(c); });
    };

    // ---------------------------------------------------------------- the camera: it never stands still
    const C2 = p.cards[1].t, C3 = p.phone.t, E0 = p.end.t0, E1 = p.end.t, hold0 = p.hold ? p.hold[0] : 1e9, hold1 = p.hold ? p.hold[1] : 1e9;
    const OPEN0 = 0.95, OPEN1 = 0.75, ZOOM0 = clamp(748 / (items[0].mw - PADX * 2) - 0.972, 0.2, 0.8); // the first question fills the text column (the hook)
    const camAt = (t) => {
      const calm = 1 - smooth((t - (TL - 0.5)) / 0.45);
      let ry = 1.9 * Math.sin(t * 0.43 + 0.5) * calm, rx = 1.2 * Math.sin(t * 0.34 + 1.3) * calm, s = 0.972 + 0.028 * smooth(t / TL), tx = 0, ty = 5 * Math.sin(t * 0.5) * calm;
      items.forEach((it) => { if (t < it.tMsg) return; const k = Math.exp(-(t - it.tMsg) * 3.4) * Math.sin(Math.min(1, (t - it.tMsg) / 0.09) * Math.PI / 2) * calm; ry += (it.who === 'n' ? 1.1 : -1.1) * k; s += 0.008 * k; ty -= 5 * k; });
      // the opening: close on the first question, then back: it is a chat, with Nuki
      const k0 = 1 - smooth((t - OPEN0) / OPEN1), L1 = lay(t), fx = SX + SW - GUT - items[0].mw / 2, fy = L1.top + HEAD + PADT + items[0].mh / 2;
      s += ZOOM0 * k0; tx -= (fx - 540) * (1 + ZOOM0) * k0; ty -= (fy - 860) * (1 + ZOOM0) * k0;
      // the fake-out: while the dots hold, the camera leans in towards them; it lets go when the question lands
      const lean = smooth((t - hold0) / (hold1 - hold0)) * (t < hold1 ? 1 : Math.exp(-(t - hold1) * 7)) * calm;
      s += 0.024 * lean; rx += 1.5 * lean; ty -= 14 * lean; // a push and a tilt towards the dots; the sheet stays where it is
      // after the chat: a slow drift for the cards
      const m = smooth((t - TL) / 0.6); ry += m * 1.6 * Math.sin((t - TL) * 0.9); rx += m * 0.9 * Math.sin((t - TL) * 0.7 + 1); s += m * 0.012 * Math.sin((t - TL) * 0.6);
      return { rx, ry, s, tx, ty };
    };

    // ---------------------------------------------------------------- poses of a card: { x, y, z, rx, ry, rz, s, o, blur, dim }
    const mix = (a, b, e) => { const o = {}; for (const k of ['x', 'y', 'z', 'rx', 'ry', 'rz', 's', 'o', 'blur', 'dim']) o[k] = lerp(a[k] || 0, b[k] || 0, e); return o; };
    const P0 = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, o: 1, blur: 0, dim: 0 };
    const hero = (t, ph) => Object.assign({}, P0, { ry: -6 + 2.4 * Math.sin(t * 1.1 + ph), rx: 2 + 1.2 * Math.sin(t * 0.9 + ph * 2), rz: -1 + 0.5 * Math.sin(t * 0.7 + ph), y: 6 * Math.sin(t * 1.3 + ph), s: 1 + 0.012 * Math.sin(t * 0.8) });
    const behind = (t, side) => Object.assign({}, P0, { x: side * 128, y: -74 + 4 * Math.sin(t * 1.2), z: -270, rz: side * 6.5, ry: -6, rx: 2, s: 1, blur: 4, dim: 0.14 });
    const past = (side) => Object.assign({}, P0, { x: side * 500, y: 260, z: 1120, ry: -side * 40, rz: side * 9, rx: 20, o: 0, blur: 16 }); // it keeps facing the lens as it passes (turned towards it), so its face never flips
    const exit = (a, b, u) => { const P = mix(a, b, E.in(u)); P.z = lerp(a.z || 0, b.z, 1 - Math.pow(1 - u, 2.2)); P.o = 1 - smooth((u - 0.55) / 0.45); return P; }; // towards the camera first, then aside
    const setCard = (card, cx, cy, w, hh, rad, P) => {
      const s = card.c.style; s.width = w.toFixed(1) + 'px'; s.height = hh.toFixed(1) + 'px'; s.borderRadius = rad.toFixed(1) + 'px';
      s.transform = 'translate3d(' + (cx - w / 2 + P.x).toFixed(2) + 'px,' + (cy - hh / 2 + P.y).toFixed(2) + 'px,' + P.z.toFixed(1) + 'px) rotateX(' + P.rx.toFixed(3) + 'deg) rotateY(' + P.ry.toFixed(3) + 'deg) rotateZ(' + P.rz.toFixed(3) + 'deg) scale(' + P.s.toFixed(4) + ')';
      // the fade is on the faces, never on the card itself: an opacity below 1 would flatten it (preserve-3d is lost) and show the wrong face
      const op = clamp(P.o).toFixed(3); s.visibility = P.o < 0.004 ? 'hidden' : '';
      const bl = P.blur > 0.4 ? 'blur(' + P.blur.toFixed(1) + 'px)' : ''; card.faces.forEach((f) => { f.style.opacity = op; f.style.filter = bl + (P.dim > 0.01 ? ' brightness(' + (1 - P.dim).toFixed(3) + ')' : ''); });
      card.slabs.forEach((x) => { x.style.opacity = op; x.style.visibility = P.blur > 3 ? 'hidden' : ''; });
      // its soft shadow on the "floor" of light below it
      const d = card.drop.style, k = clamp(1 - P.z / 1400) * clamp(P.o), dw = w * 0.86 * (1 - P.z / 2600);
      d.left = (cx + P.x * 0.9 - dw / 2).toFixed(1) + 'px'; d.top = (cy + hh / 2 + 44 - P.z * 0.05).toFixed(1) + 'px'; d.width = dw.toFixed(1) + 'px'; d.height = '90px'; d.opacity = (0.6 * k * (P.drop == null ? 1 : P.drop)).toFixed(3); d.visibility = k * (P.drop == null ? 1 : P.drop) < 0.01 ? 'hidden' : '';
    };
    const light = (f, P) => { if (!f) return; const r = ((P.ry % 360) + 540) % 360 - 180, a = Math.abs(r) > 90 ? (r > 0 ? r - 180 : r + 180) : r; f.sheen.style.backgroundPosition = (50 + a * 4.2) + '% 0'; f.shade.style.opacity = (Math.min(0.32, Math.abs(a) / 150)).toFixed(3); };

    // ---------------------------------------------------------------- a frame
    ctx.tick((t) => {
      const C = camAt(t);
      cam.style.transform = 'translate3d(' + C.tx.toFixed(2) + 'px,' + C.ty.toFixed(2) + 'px,0) rotateX(' + C.rx.toFixed(3) + 'deg) rotateY(' + C.ry.toFixed(3) + 'deg) scale(' + C.s.toFixed(4) + ')';
      lights.forEach((d, i) => { d.style.transform = 'translate(' + (-C.ry * 14 + 26 * Math.sin(t * 0.3 + i * 2)).toFixed(1) + 'px,' + (C.rx * 12 + 22 * Math.cos(t * 0.26 + i)).toFixed(1) + 'px)'; });
      gloss.style.transform = 'translateX(' + (-60 + 150 * (0.5 + 0.5 * Math.sin(t * 0.5)) + C.ry * 26).toFixed(1) + '%)';
      // ---- the conversation
      const gone = smooth((t - TL - 0.04) / 0.5);
      sheet.style.display = gone >= 1 ? 'none' : '';
      if (gone < 1) {
        const L = lay(t);
        sheet.style.top = L.top.toFixed(2) + 'px'; sheet.style.height = L.Hs.toFixed(2) + 'px'; area.style.height = L.A.toFixed(2) + 'px'; sheet.style.transformOrigin = (SW / 2) + 'px ' + (L.Hs / 2).toFixed(1) + 'px';
        sheet.style.transform = gone > 0 ? 'translate3d(0,' + (gone * 90).toFixed(1) + 'px,' + (-gone * 820).toFixed(1) + 'px) rotateX(' + (gone * 14).toFixed(2) + 'deg)' : '';
        const ga = smooth((t - OPEN0 + 0.1) / 0.5); glass.style.opacity = ga.toFixed(3); head.style.opacity = smooth((t - OPEN0) / 0.5).toFixed(3); head.style.visibility = t < OPEN0 ? 'hidden' : '';
        sheet.style.opacity = (1 - smooth((gone - 0.25) / 0.75)).toFixed(3); sheet.style.filter = gone > 0.02 ? 'blur(' + (gone * 16).toFixed(1) + 'px)' : '';
        let nTyping = 0;
        items.forEach((it, j) => {
          const s = L.st[j], b = it.b; if (!s || (it === last && t >= TL)) { b.style.visibility = 'hidden'; return; }
          const top = PADT + L.tops[j] - L.O, o = smooth((top + 40) / 80);
          b.style.visibility = o < 0.004 ? 'hidden' : ''; b.style.opacity = o.toFixed(3);
          b.style.width = s.w.toFixed(1) + 'px'; b.style.height = s.h.toFixed(1) + 'px';
          b.style.transform = 'translateY(' + top.toFixed(2) + 'px) scale(' + ((0.4 + 0.6 * s.e) * (it.tType != null && t < it.tMsg ? 1 + 0.07 * beatAt(t) : 1)).toFixed(4) + ')';
          const typing = it.tType != null && t < it.tMsg + 0.12, ta = it.tType != null ? 1 - smooth((t - it.tMsg) / 0.1) : 0;
          it.dotsEl.style.opacity = ta.toFixed(3); it.dotsEl.style.visibility = ta < 0.004 ? 'hidden' : '';
          if (typing) { if (it.who === 'n' && t < it.tMsg) nTyping = 1; it.dots.forEach((d, k) => { const ph = (t - it.tType) * 1.9 - k * 0.17, u = ph - Math.floor(ph), up = u < 0.5 ? Math.sin(u * 2 * Math.PI) : 0; d.style.transform = 'translateY(' + (-11 * Math.max(0, up)).toFixed(2) + 'px)'; d.style.opacity = (0.42 + 0.58 * Math.max(0, up)).toFixed(3); }); }
          const to = it.tType != null ? smooth((t - it.tMsg - 0.04) / 0.2) : smooth((t - it.tMsg) / 0.14);
          it.t.style.opacity = to.toFixed(3); it.t.style.visibility = to < 0.004 ? 'hidden' : ''; it.t.style.transform = 'translateY(' + ((1 - to) * 8).toFixed(1) + 'px)';
        });
        const q = nTyping; subT.style.opacity = q; sub.style.opacity = 1 - q; subT.style.visibility = q ? '' : 'hidden'; sub.style.visibility = q ? 'hidden' : '';
        const pulse = nTyping ? 0.5 + 0.5 * Math.sin(t * 9) : 0; ring.style.opacity = (nTyping ? 0.35 + 0.5 * pulse : 0).toFixed(3); ring.style.transform = 'scale(' + (1 + 0.05 * pulse).toFixed(3) + ')';
      }
      // ---- card A: the last bubble lifts, turns over in the air, lands as the first photo
      {
        const bx = SX + GUT + last.mw / 2, by = L0.top + HEAD + PADT + L0.tops[items.length - 1] - L0.O + last.mh / 2;
        if (t < TL) setCard(cA, bx, by, last.mw, last.mh, 46, Object.assign({}, P0, { o: 0 }));
        else if (t < C2) {
          const u = clamp((t - TL) / FLIP), e = E.inout(u), e2 = E.inout(clamp((u - 0.1) / 0.9)), tl = t - TL - FLIP;
          const H1 = hero(t, 0), wob = tl > 0 ? 9 * Math.exp(-tl * 6) * Math.sin(tl * 13) : 0, hk = smooth(tl / 0.5);
          const P = { x: 0, y: -70 * Math.sin(Math.PI * u), z: 330 * Math.sin(Math.PI * u), rx: -9 * Math.sin(Math.PI * u) + H1.rx * hk, ry: 180 * e + wob + H1.ry * hk, rz: 5 * Math.sin(Math.PI * u) + H1.rz * hk, s: lerp(1, H1.s, hk), o: 1, blur: 0, dim: 0 };
          setCard(cA, lerp(bx, CX, e), lerp(by, CY, e) + H1.y * hk, lerp(last.mw, CW, e2), lerp(last.mh, CH, e2), lerp(46, 50, e2), P); light(fA, { ry: P.ry - 180 });
          const mb = 26 * Math.sin(Math.PI * u) * (u < 1 ? 1 : 0); cA.front.style.filter = mb > 0.5 ? 'blur(' + (mb * 0.35).toFixed(1) + 'px)' : ''; cA.back.style.filter = mb > 0.5 ? 'blur(' + (mb * 0.3).toFixed(1) + 'px)' : '';
        } else { const u = clamp((t - C2) / 0.44), H1 = hero(t, 0); H1.ry += 180; const Q = past(-1); Q.ry += 180; const P = exit(H1, Q, u); setCard(cA, CX, CY, CW, CH, 50, P); }
      }
      // ---- card B: it waits behind A (the stack), comes forward, flies past
      {
        const tIn = TL + FLIP - 0.12;
        if (t < tIn) setCard(cB, CX, CY, CW, CH, 50, Object.assign({}, P0, { o: 0 }));
        else if (t < C2) { const e = E.out5(clamp((t - tIn) / 0.55)); const P = mix(Object.assign({}, behind(t, 1), { x: 0, y: 0, rz: 0, o: 0 }), behind(t, 1), e); P.o = smooth((t - tIn) / 0.2); setCard(cB, CX, CY, CW, CH, 50, P); light(fB, P); }
        else if (t < C3) { const u = clamp((t - C2 - 0.09) / 0.5), e = spring(u * 1.25); const P = mix(behind(t, 1), hero(t, 1.7), e); P.blur = behind(t, 1).blur * (1 - smooth(u / 0.5)); P.dim = 0.16 * (1 - smooth(u / 0.5)); setCard(cB, CX, CY, CW, CH, 50, P); light(fB, P); }
        else { const u = clamp((t - C3) / 0.44); const P = exit(hero(t, 1.7), past(1), u); setCard(cB, CX, CY, CW, CH, 50, P); }
      }
      // ---- the phone: behind B, then forward with a turn; at the end it turns over into the last bubble
      {
        const tIn = C2 + 0.16, PY = CY - 4;
        const ph = (t) => Object.assign({}, P0, { ry: 9 - 5 * smooth((t - C3) / 1.6) + 1.6 * Math.sin(t * 1.0), rx: 2.5 + 1.1 * Math.sin(t * 0.8 + 1), rz: 0.6 * Math.sin(t * 0.6), y: 6 * Math.sin(t * 1.2), s: 1 + 0.02 * smooth((t - C3) / 2) });
        if (t < tIn) setCard(cP, CX, PY, PW, PH, 78, Object.assign({}, P0, { o: 0 }));
        else if (t < C3) { const e = E.out5(clamp((t - tIn) / 0.55)); const b = Object.assign({}, behind(t, -1), { x: -236, y: -30, z: -340 }); const P = mix(Object.assign({}, b, { x: 0, y: 0, rz: 0 }), b, e); P.o = smooth((t - tIn) / 0.2); setCard(cP, CX, PY, PW, PH, 78, P); }
        else if (t < E0) { const u = clamp((t - C3 - 0.09) / 0.55), e = spring(u * 1.2); const b = Object.assign({}, behind(t, -1), { x: -236, y: -30, z: -340 }), H2 = ph(t); H2.ry += 26 * (1 - smooth(u)); const P = mix(b, H2, e); P.blur = b.blur * (1 - smooth(u / 0.5)); P.dim = 0.16 * (1 - smooth(u / 0.5)); setCard(cP, CX, PY, PW, PH, 78, P); }
        else { const D = E1 - E0, u = clamp((t - E0) / D), e = E.inout(u), e2 = E.inout(clamp((u - 0.42) / 0.58)), tl = t - E1, H2 = ph(E0);
          const wob = tl > 0 ? 8 * Math.exp(-tl * 6) * Math.sin(tl * 13) : 0, fl = smooth(tl / 0.6);
          const P = { x: 0, y: -40 * Math.sin(Math.PI * u) + 5 * Math.sin(t * 1.1) * fl, z: 240 * Math.sin(Math.PI * u), rx: H2.rx * (1 - e) - 6 * Math.sin(Math.PI * u) + 1.2 * Math.sin(t * 0.9) * fl, ry: H2.ry * (1 - e) + 180 * e + wob + 2 * Math.sin(t * 0.8) * fl, rz: 3 * Math.sin(Math.PI * u), s: 1 + 0.012 * Math.sin(t * 0.7) * fl, o: 1, blur: 0, dim: 0, drop: 1 - e2 };
          setCard(cP, CX, lerp(PY, ECY, e2), lerp(PW, EW, e2), lerp(PH, EH, e2), lerp(78, 46, e2), P);
          nub.style.opacity = smooth((u - 0.9) / 0.1).toFixed(3);
          const mb = 22 * Math.sin(Math.PI * u) * (u < 1 ? 1 : 0); cP.faces.forEach((f) => { f.style.filter = mb > 0.5 ? 'blur(' + (mb * 0.3).toFixed(1) + 'px)' : ''; });
          const to = smooth((u - 0.72) / 0.28); endT.style.opacity = to.toFixed(3);
        }
        if (page) { const u = clamp((t - C3 + 0.3) / (E0 - C3 + 0.3)); page.style.top = (navH - 24 - 330 * E.inout(u)).toFixed(1) + 'px'; }
        pSheen.style.backgroundPosition = (30 + 60 * smooth((t - C3) / 1.8)) + '% 0';
        if (t < E0) { endT.style.opacity = '0'; nub.style.opacity = '0'; }
        // «360» answers the music coming back; Nuki comes in beside the bubble
        const kp = p.end.pulse != null ? Math.sin(Math.PI * clamp((t - p.end.pulse) / 0.42)) : 0; kw.style.transform = 'scale(' + (1 + 0.1 * kp).toFixed(4) + ')';
        const tn = E1 + 0.2, n = spring((t - tn) / 0.5), sq = 1 + 0.12 * Math.exp(-Math.max(0, t - tn) * 7) * Math.sin(Math.max(0, t - tn) * 16);
        nuki.style.visibility = t < tn ? 'hidden' : ''; nuki.style.opacity = smooth((t - tn) / 0.12).toFixed(3);
        nuki.style.transform = 'translateY(' + ((1 - n) * 120 + 4 * Math.sin(t * 1.4)).toFixed(2) + 'px) rotate(' + (2.2 * Math.sin(t * 1.1)).toFixed(2) + 'deg) scale(' + (0.9 + 0.1 * n).toFixed(4) + ',' + ((0.9 + 0.1 * n) * sq).toFixed(4) + ')';
        const sa = smooth((t - E1 - 0.75) / 0.5); sig.style.opacity = sa.toFixed(3); sig.style.visibility = sa < 0.004 ? 'hidden' : ''; sig.style.transform = 'translateY(' + ((1 - E.out5(clamp((t - E1 - 0.75) / 0.7))) * 12).toFixed(1) + 'px)';
        const nh = NW * 748 / 694; nDrop.style.left = (CX - NW / 2 + 30) + 'px'; nDrop.style.top = (NY + nh - 36) + 'px'; nDrop.style.width = (NW - 60) + 'px'; nDrop.style.height = '56px'; nDrop.style.opacity = (0.8 * smooth((t - tn) / 0.3)).toFixed(3); nDrop.style.visibility = t < tn ? 'hidden' : '';
      }
    });

    // ---------------------------------------------------------------- sound and events, to the frame (the premium set, by category)
    const ev = (t, k) => R.event(t, k);
    ctx.sfx(0.09, 'impact', 0.3, { prio: 4 });
    items.forEach((it) => {
      if (it.tType != null) { ev(it.tType, 'type'); for (let tt = it.tType + 0.02; tt < it.tMsg - 0.1; tt += 1 / 1.9) { if (HB.some((x) => Math.abs(x - tt) < 0.16)) continue; ctx.sfx(tt, 'tick_soft', 0.3, { pan: it.who === 'n' ? -0.3 : 0.3 }); } }
      const ts = Math.max(0, it.tMsg); // the first bubble is already popping on frame 0
      if (it.who === 'n') ctx.sfx(ts, 'dot', 0.66, { pan: -0.22, prio: 3 }); else ctx.sfx(ts, 'tap', 0.66, { pan: 0.22 });
      ev(ts, 'pop');
    });
    // the fake-out: while the dots hold, only a heartbeat
    HB.forEach((t) => { ctx.sfx(t, 'pulse', 0.6, { prio: 3 }); ev(t, 'breath'); });
    // the last bubble flicks off the sheet, turns over, lands as a photo
    ctx.sfx(TL - 0.45, 'riser_soft', 0.5); ctx.sfx(TL, 'card_flip', 0.7); ev(TL, 'open');
    ctx.sfx(TL + FLIP / 2, 'whoosh_through', 0.62, { prio: 4, peak: true }); ev(TL + FLIP / 2, 'cut');
    ctx.sfx(TL + FLIP, 'tap', 0.7); ev(TL + FLIP, 'slam');
    [C2, C3].forEach((t) => { ctx.sfx(t, 'card_flip', 0.62); ev(t, 'flip'); ctx.sfx(t + 0.14, 'whoosh_cut', 0.6, { prio: 3, peak: true }); ev(t + 0.14, 'cut'); ctx.sfx(t + 0.36, 'tap', 0.55); ev(t + 0.36, 'slam'); });
    // the phone turns over into Nuki's last bubble
    ctx.sfx(E0, 'card_flip', 0.62); ev(E0, 'flip');
    ctx.sfx(E0 + (E1 - E0) / 2, 'swoosh_end', 0.6, { prio: 4, peak: true }); ev(E0 + (E1 - E0) / 2, 'cut');
    ctx.sfx(E1, 'dot', 0.75, { prio: 3 }); ev(E1, 'slam'); ctx.sfx(E1 + 0.2, 'tap', 0.5); ev(E1 + 0.2, 'pop');
    if (p.end.pulse != null) { ctx.sfx(p.end.pulse + 0.1, 'shimmer_soft', 0.6); ev(p.end.pulse + 0.1, 'glow'); }
    ev(E1 + 1.4, 'hold');
    ctx.focus(cP.c);
  };
})();
