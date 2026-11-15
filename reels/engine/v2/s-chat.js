// Centrul360 reels v2: the chat with Nuki (15.11; format ix, the variant without client messages: the visitor asks,
// the brand answers, the text only from the site). Our own chat interface, in the brand's style (a white glass sheet,
// turquoise bubbles for Nuki, light grey for the visitor); it imitates no app.
// v2 (15.11, the owner: „editurile să se potrivească pe ritmul muzicii … animații mai crazy puțin … mai puțin scris”):
// everything is counted in BEATS of the track (script "b": a beat number of the reel, quarters allowed, snapped with
// R.grid), short bubbles of a few words, and the camera works like the owner's zoom reference (README, „Camera”): every
// move starts on a beat, covers most of its way in the first frames (R.cam.ease), then holds, with 3D tilts; a punch-in
// at the fake-out while the drums drop out, depth of field and a darker light in that gap; the last bubble lifts off
// the sheet, turns edge-on into the lens and the drums come back through one flash of light (R.cam.flash, the only one):
// it lands as the real photo. Then a short montage of real things on the bars (the room, the handpiece, the real page on
// a phone), each card with thickness, flying past the camera; the phone turns over into Nuki's last bubble, and the
// viewer's answer «360» is typed under it.
//   visual: { type: "chat", title, name, typing, messages: [{ who: "v" | "n", text, b, type }], moves: [{ b, d, s, f, rx, ry, rz, hit, streak }],
//             break: [b0, b1], pulse: [b…], lift, slam, cards: [{ img, label, b }], phone: { key, b }, mmoves: […],
//             end: { b0, b, nuki, reply: { type, b, text }, text, pose } }
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
.cx-world{position:absolute;left:0;top:0;width:1080px;height:1920px;perspective:1700px;perspective-origin:540px 860px}
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
.cx-b.n{left:75px;border-radius:50px 50px 50px 14px;transform-origin:0 100%;background:linear-gradient(165deg,#19b5a5,#0f998b);box-shadow:0 18px 30px -20px rgba(11,127,116,.7),0 1px 0 rgba(255,255,255,.35) inset;color:#fff}
.cx-b.v{right:75px;border-radius:50px 50px 14px 50px;transform-origin:100% 100%;background:linear-gradient(180deg,#f1f4f4,#e9eeed);box-shadow:0 14px 26px -20px rgba(18,32,31,.4),0 1px 0 rgba(255,255,255,.9) inset;color:#12201f}
.cx-t{left:38px;top:27px;font:650 60px/1.2 var(--f-body);letter-spacing:-.028em;text-wrap:balance}
.cx-d{position:absolute;left:0;top:0;width:150px;height:104px}
.cx-d i{position:absolute;top:43px;width:18px;height:18px;border-radius:50%;background:currentColor}
.cx-card{position:absolute;left:0;top:0;transform-style:preserve-3d}
.cx-card>*{position:absolute;inset:0;border-radius:inherit}
.cx-f{backface-visibility:hidden;overflow:hidden}
.cx-slab{background:#d6e2e0}
.cx-photo{background:#fff;box-shadow:0 0 0 1px rgba(11,60,55,.08)}
.cx-photo canvas{position:absolute;left:16px;top:16px;width:calc(100% - 32px);height:calc(100% - 32px);border-radius:34px}
.cx-chip{left:44px;bottom:46px;padding:16px 28px 17px 24px;border-radius:40px;background:rgba(255,255,255,.94);box-shadow:0 14px 30px -16px rgba(0,0,0,.5);font:650 36px/1 var(--f-body);letter-spacing:-.01em;color:#0b0b0d;white-space:nowrap}
.cx-chip i{display:inline-block;width:15px;height:15px;border-radius:50%;background:#14a596;margin:0 14px 4px 0;vertical-align:middle}
.cx-sheen{position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,rgba(255,255,255,0) 32%,rgba(255,255,255,.34) 48%,rgba(255,255,255,0) 62%);background-size:260% 100%}
.cx-shade{position:absolute;inset:0;pointer-events:none;background:#06302b;opacity:0}
.cx-phone{background:#0e1b1a;box-shadow:0 0 0 2px #2a3b39 inset}
.cx-scr{position:absolute;left:15px;top:15px;right:15px;bottom:15px;border-radius:62px;overflow:hidden;background:#fff}
.cx-scr img{position:absolute;left:0;width:100%;height:auto;display:block}
.cx-end{background:linear-gradient(165deg,#19b5a5,#0f998b);box-shadow:0 1px 0 rgba(255,255,255,.35) inset}
.cx-endt{left:46px;top:38px;width:668px;text-align:center;font:700 58px/1.22 var(--f-body);letter-spacing:-.03em;color:#fff;text-wrap:balance}
.cx-kw{display:inline-block;padding:0 .26em .04em;margin:0 .04em;border-radius:.3em;background:linear-gradient(90deg,#fbe3d9,#eab5a5 55%,#cf8f7d);color:#3b1c14;font-weight:800}
.cx-rep{position:absolute;border-radius:50px 50px 14px 50px;transform-origin:100% 100%;background:linear-gradient(180deg,#f1f4f4,#e9eeed);box-shadow:0 14px 26px -20px rgba(18,32,31,.4),0 1px 0 rgba(255,255,255,.9) inset;color:#12201f;overflow:hidden}
.cx-rep .cx-t{font-weight:800;letter-spacing:-.01em}
.cx-drop{position:absolute;border-radius:50%;background:radial-gradient(ellipse at center,rgba(4,60,54,.26),rgba(4,60,54,0) 70%);filter:blur(10px)}
.cx-nuki{position:absolute;transform-origin:50% 96%}
.cx-nuki img{position:absolute;left:0;top:0;width:100%;height:auto;display:block}
.cx-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 70% 58% at 50% 46%,rgba(6,48,43,0) 40%,rgba(6,48,43,.34) 100%);opacity:0}
.cx-streak{position:absolute;left:-400px;top:-200px;width:520px;height:2400px;pointer-events:none;opacity:0;
  background:linear-gradient(90deg,rgba(95,212,198,0),rgba(95,212,198,.16) 30%,rgba(255,255,255,.85) 50%,rgba(95,212,198,.16) 70%,rgba(95,212,198,0));filter:blur(14px)}
.cx-flash{position:absolute;inset:0;pointer-events:none;background:#fff;opacity:0}`;

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
    // the beat clock: a beat number of the reel → seconds, on the music's grid (quarter beats)
    const per = R.beatPer || 60 / 123.01, BT = (b) => R.grid(b * per, 4);
    const root = h('div', 'cx-root', null, el);
    const lights = [[-260, 40, 760, 'rgba(95,212,198,.2)'], [600, 1000, 820, 'rgba(20,165,150,.12)'], [140, 1560, 640, 'rgba(95,212,198,.13)']].map(([x, y, r, col]) => { const d = h('div', 'cx-light', null, root); d.style.cssText += ';left:' + x + 'px;top:' + y + 'px;width:' + r + 'px;height:' + r + 'px;background:' + col; return d; });
    const world = h('div', 'cx-world', null, root), cam = h('div', 'cx-cam', null, world);
    const vig = h('div', 'cx-vig', null, root), streak = h('div', 'cx-streak', null, root), flash = h('div', 'cx-flash', null, root);
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
    const SX = 65, SW = 950, GUT = 75, PADX = 38;   // the sheet: 88 % of the frame's width, on its axis; the bubbles' column is centred too (text 178..902)
    const HEAD = 162, PADT = 22, PADB = 36, AREA_MAX = 1102, AREA_MIN = 170, SH_CY = 860, GAP = 18, GAP2 = 30, TYW = 150, TYH = 104, MAXW = 640;
    const mkBubble = (parent, cls, text, maxw) => {
      const b = h('div', cls, null, parent);
      const dots = h('div', 'cx-d', '<i style="left:40px"></i><i style="left:66px"></i><i style="left:92px"></i>', b);
      const t = h('div', 'tx cx-t', esc(text), b); t.style.maxWidth = (maxw || MAXW) + 'px'; t.style.width = 'max-content';
      b.style.width = '2000px'; const rg = document.createRange(); rg.selectNodeContents(t); const rs = [...rg.getClientRects()]; // the widest line (the text is balanced): the bubble hugs it
      const tw = Math.ceil(Math.max(...rs.map((r) => r.right)) - Math.min(...rs.map((r) => r.left))) + 2, th = t.offsetHeight; t.style.width = tw + 'px';
      return { b, dots: [...dots.children], dotsEl: dots, t, tw, mw: tw + PADX * 2, mh: th + 56 };
    };
    const items = p.messages.map((m, i) => {
      const k = mkBubble(area, 'cx-b ' + (m.who === 'n' ? 'n' : 'v'), m.text, m.maxw);
      const tMsg = m.b === 0 ? -0.1 : BT(m.b), tType = m.type != null ? BT(m.type) : null; // the first bubble is already popping on frame 0
      return Object.assign(k, { m, i, who: m.who, tMsg, tType, ta: tType != null ? tType : tMsg });
    });
    items.forEach((it, i) => { it.gapB = i ? (items[i - 1].who !== it.who ? GAP2 : GAP) : 0; });
    const state = (it, t) => { // its size and its presence at t
      if (t < it.ta) return null;
      const m = it.tType != null ? (t < it.tMsg ? 0 : spring((t - it.tMsg) / 0.4)) : 1;
      return { w: it.tType != null ? lerp(TYW, it.mw, m) : it.mw, h: it.tType != null ? lerp(TYH, it.mh, m) : it.mh, m, e: spring((t - it.ta) / 0.38) };
    };
    const TL = BT(p.lift), TS = BT(p.slam), FLY = TS - TL, last = items[items.length - 1];
    const TB0 = BT(p.break[0]), TB1 = BT(p.break[1]);
    const HB = (p.pulse || []).map(BT); // the heartbeat while the music holds its breath (the fake-out)
    const beatAt = (t) => HB.reduce((a, tp) => a + (t >= tp ? Math.exp(-(t - tp) * 9) * Math.sin(Math.min(1, (t - tp) / 0.06) * Math.PI / 2) : 0), 0);
    // the layout at a moment: the sheet grows with the conversation (it stays centred), then the oldest bubbles leave at the top
    const lay = (t) => {
      const st = items.map((it) => state(it, t)), g = items.map((it, i) => (st[i] ? Math.min(1.05, spring((t - it.ta) / 0.36)) : 0));
      const tops = []; let y = 0; items.forEach((it, i) => { tops.push(y + it.gapB * g[i]); if (st[i]) y += (it.gapB + st[i].h) * g[i]; });
      const need = PADT + y + PADB, A = clamp(need, AREA_MIN, AREA_MAX), O = Math.max(0, need - AREA_MAX), Hs = HEAD + A;
      return { st, tops, A, O, Hs, top: SH_CY - Hs / 2 };
    };
    const centre = (i, t) => { const L = lay(t), it = items[i], s = L.st[i] || { w: it.mw, h: it.mh }; // a bubble's centre in the frame (before the camera)
      return [it.who === 'n' ? SX + GUT + s.w / 2 : SX + SW - GUT - s.w / 2, L.top + HEAD + PADT + L.tops[i] - L.O + s.h / 2]; };
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
    const cA = mkCard(18, 6); cA.front.style.cssText += ';background:linear-gradient(165deg,#19b5a5,#0f998b);box-shadow:0 1px 0 rgba(255,255,255,.35) inset;color:#fff';
    const cAt = h('div', 'tx cx-t', esc(last.m.text), cA.front); cAt.style.width = last.tw + 'px';
    const fA = photoFace(cA.back, imgs[0], p.cards[0].label, p.cards[0]);
    const cB = mkCard(18, 6); const fB = photoFace(cB.front, imgs[1], p.cards[1].label, p.cards[1]); cB.back.style.background = '#eef4f3';
    // the phone: the real page on its screen; on its back, Nuki's last bubble
    const PW = 548, PH = 1136, shots = (R.siteShots && R.siteShots.shots) || {}, shot = shots[p.phone.key], nav = R.siteShots && R.siteShots.nav;
    const cP = mkCard(26, 8); cP.front.classList.add('cx-phone'); cP.slabs.forEach((s) => { s.style.background = '#1b2a28'; });
    const scr = h('div', 'cx-scr', null, cP.front); let page = null, navH = 0;
    if (shot) { page = h('img', null, null, scr); page.src = '../site/' + shot.file; if (nav) { const n = h('img', null, null, scr); n.src = '../site/' + nav.file; n.style.top = '0'; navH = (PW - 30) * nav.h / nav.w; } }
    const pSheen = h('div', 'cx-sheen', null, cP.front);
    cP.back.classList.add('cx-end');
    const EW = 760, endT = h('div', 'tx cx-endt', esc(p.end.text).replace(/«([^»]+)»/, '<span class="cx-kw">«$1»</span>'), cP.back);
    cP.c.style.width = EW + 'px'; cP.c.style.height = '600px'; const EH = endT.offsetHeight + 80; const kw = endT.querySelector('.cx-kw');
    const nub = h('i', null, null, cP.c); nub.style.cssText = 'position:absolute;inset:auto;left:calc(50% - 16px);bottom:-13px;width:32px;height:32px;border-radius:7px;background:#0f998b;backface-visibility:hidden;transform:rotateY(180deg) translateZ(14px) rotate(45deg)';
    // the viewer's answer under it: «360», typed
    const RP = p.end.reply || null, ECY = 560;
    let rep = null, RY = ECY + EH / 2 + 34;
    if (RP) { rep = mkBubble(cam, 'cx-rep', RP.text, 300); rep.tMsg = BT(RP.b); rep.tType = RP.type != null ? BT(RP.type) : rep.tMsg; rep.b.style.top = RY + 'px'; }
    const RH = rep ? rep.mh : 0;
    // Nuki, under the conversation
    const NW = 300, NH = Math.round(NW * 748 / 694), nuki = h('div', 'cx-nuki', '<img src="' + A + 'mascota/ipostaze/' + (p.end.pose || 'telefon') + '.webp">', cam); nuki.style.cssText += ';left:' + (CX - NW / 2) + 'px;width:' + NW + 'px;height:' + NH + 'px';
    const nDrop = h('div', 'cx-drop', null, cam); cam.insertBefore(nDrop, nuki);
    const NY = RY + RH + 40; nuki.style.top = NY + 'px';
    const sig = h('div', null, null, cam), SM = 58, SWH = 27, SWW = Math.round(SWH * 5583 / 426), GX = Math.round((W - (SM + 16 + SWW)) / 2), SY = Math.round(NY + NH + 52); sig.style.cssText = 'position:absolute;left:0;top:0;width:1080px;height:1920px';
    h('i', null, null, sig).style.cssText = 'position:absolute;left:' + GX + 'px;top:' + SY + 'px;width:' + SM + 'px;height:' + SM + 'px;background:url(' + A + 'logo-mark.png) center/contain no-repeat';
    h('i', null, null, sig).style.cssText = 'position:absolute;left:' + (GX + SM + 16) + 'px;top:' + (SY + (SM - SWH) / 2) + 'px;width:' + SWW + 'px;height:' + SWH + 'px;background:#000;-webkit-mask:url(' + A + 'wordmark-com.png) center/contain no-repeat;mask:url(' + A + 'wordmark-com.png) center/contain no-repeat';
    load(A + 'logo-mark.png'); load(A + 'wordmark-com.png');

    ctx.shot.after = () => { // the photos, in black and white with their own turquoise (after they are decoded)
      [fA, fB].forEach((f) => { const c = bwTeal(f.img, f.o); f.holder.appendChild(c); });
    };

    // ---------------------------------------------------------------- the camera (README, „Camera”): moves on beats, then holds
    const C2 = BT(p.cards[1].b), C3 = BT(p.phone.b), E0 = BT(p.end.b0), E1 = BT(p.end.b), TN = BT(p.end.nuki != null ? p.end.nuki : p.end.b + 1);
    const S0 = clamp(760 / items[0].tw, 1, 2.2); // the first question fills the text column (the hook)
    const f0 = centre(0, BT(2));
    const toF = (f, t) => { if (f === 'sheet' || f == null) return [540, SH_CY]; if (Array.isArray(f)) return f;
      if (f.span) { const [a, b] = f.span, tt = Math.max(t, items[b].tMsg + 0.6), L = lay(tt), y0 = L.top + HEAD + PADT - L.O; // a run of bubbles, framed once the last one stands
        return [f.x != null ? f.x : 540, y0 + (L.tops[a] + L.tops[b] + (L.st[b] || items[b]).h) / 2 + (f.dy || 0)]; }
      const i = typeof f === 'object' ? f.i : f, c = centre(i, Math.max(t, items[i].tMsg + 0.6)); // a bubble: where it will stand, full size
      return typeof f === 'object' ? [f.x != null ? f.x : c[0], f.y != null ? f.y : c[1] + (f.dy || 0)] : c; };
    const MV = (p.moves || []).map((m) => { const t0 = BT(m.b); return Object.assign({}, m, { t0, F: toF(m.f, t0 + (m.d || 0.6)) }); });
    const chatCam = (t) => {
      let c = { s: S0, fx: f0[0], fy: f0[1], rx: 5, ry: -8, rz: -1.6 };
      c.s *= 1 + 0.03 * smooth((t + 0.3) / (BT(2) + 0.3)); // the hook drifts in a touch (micro life, not the move)
      MV.forEach((m) => { if (t < m.t0) return; const e = R.cam.ease(t, m.t0, m.d || 0.6);
        c = { s: lerp(c.s, m.s, e), fx: lerp(c.fx, m.F[0], e), fy: lerp(c.fy, m.F[1], e), rx: lerp(c.rx, m.rx || 0, e), ry: lerp(c.ry, m.ry || 0, e), rz: lerp(c.rz, m.rz || 0, e) }; });
      // small life while it holds, and a kick on every bubble
      c.ry += 0.5 * Math.sin(t * 0.8 + 0.4); c.rx += 0.35 * Math.sin(t * 0.6 + 1.2);
      let ty = 0;
      items.forEach((it) => { if (t < it.tMsg || it.tMsg < 0.05) return; const k = Math.exp(-(t - it.tMsg) * 5) * Math.sin(Math.min(1, (t - it.tMsg) / 0.07) * Math.PI / 2); c.ry += (it.who === 'n' ? 1.3 : -1.3) * k; c.s *= 1 + 0.012 * k; ty -= 6 * k; });
      c.s *= 1 + 0.014 * beatAt(t);
      return { s: c.s, tx: -(c.fx - 540) * c.s, ty: -(c.fy - SH_CY) * c.s + ty + 40 * (c.s - 1), rx: c.rx, ry: c.ry, rz: c.rz };
    };
    const MM = [{ t0: TS, d: 0.7, s: 1, rx: 0, ry: 0, rz: 0, fy: 0 }].concat((p.mmoves || []).map((m) => Object.assign({}, m, { t0: BT(m.b) })), [{ t0: E0, d: 0.9, s: 1, rx: 0, ry: 0, rz: 0, fy: 0 }]);
    const montCam = (t) => {
      let c = { s: 1.14, rx: -3, ry: 6, rz: 1.5, fy: 0 }; // under the flash: closer and turned, then it lands
      MM.forEach((m) => { if (t < m.t0) return; const e = R.cam.ease(t, m.t0, m.d || 0.6);
        c = { s: lerp(c.s, m.s, e), rx: lerp(c.rx, m.rx || 0, e), ry: lerp(c.ry, m.ry || 0, e), rz: lerp(c.rz, m.rz || 0, e), fy: lerp(c.fy, m.fy || 0, e) }; });
      c.ry += 0.45 * Math.sin(t * 0.7); c.rx += 0.3 * Math.sin(t * 0.55 + 1);
      return { s: c.s, tx: 0, ty: -c.fy * c.s, rx: c.rx, ry: c.ry, rz: c.rz };
    };
    const camAt = (t) => (t < TS ? chatCam(t) : montCam(t));
    // the light streak at the start of the big moves (2-4 frames)
    const STK = MV.filter((m) => m.streak).map((m) => m.t0).concat([C2, C3, E0]);

    // ---------------------------------------------------------------- poses of a card: { x, y, z, rx, ry, rz, s, o, blur, dim }
    const mix = (a, b, e) => { const o = {}; for (const k of ['x', 'y', 'z', 'rx', 'ry', 'rz', 's', 'o', 'blur', 'dim']) o[k] = lerp(a[k] || 0, b[k] || 0, e); return o; };
    const P0 = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, s: 1, o: 1, blur: 0, dim: 0 };
    const hero = (t, ph) => Object.assign({}, P0, { ry: -5 + 1.4 * Math.sin(t * 1.0 + ph), rx: 2 + 0.8 * Math.sin(t * 0.8 + ph * 2), rz: -1 + 0.4 * Math.sin(t * 0.7 + ph), y: 4 * Math.sin(t * 1.2 + ph), s: 1 });
    const behind = (t, side) => Object.assign({}, P0, { x: side * 128, y: -74 + 4 * Math.sin(t * 1.2), z: -270, rz: side * 6.5, ry: -6, rx: 2, s: 1, blur: 4, dim: 0.14 });
    const past = (side) => Object.assign({}, P0, { x: side * 560, y: 280, z: 1180, ry: -side * 44, rz: side * 11, rx: 22, o: 0, blur: 18 }); // it keeps facing the lens as it passes, so its face never flips
    const exit = (a, b, u) => { const P = mix(a, b, E.in(u)); P.z = lerp(a.z || 0, b.z, 1 - Math.pow(1 - u, 2.4)); P.o = 1 - smooth((u - 0.55) / 0.45); return P; }; // towards the camera first, then aside
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
    const typingDots = (dots, t0, t) => dots.forEach((d, k) => { const ph = (t - t0) * 2.05 - k * 0.17, u = ph - Math.floor(ph), up = u < 0.5 ? Math.sin(u * 2 * Math.PI) : 0; d.style.transform = 'translateY(' + (-11 * Math.max(0, up)).toFixed(2) + 'px)'; d.style.opacity = (0.42 + 0.58 * Math.max(0, up)).toFixed(3); });

    // ---------------------------------------------------------------- a frame
    ctx.tick((t) => {
      const C = camAt(t);
      cam.style.transform = 'translate3d(' + C.tx.toFixed(2) + 'px,' + C.ty.toFixed(2) + 'px,0) rotateX(' + C.rx.toFixed(3) + 'deg) rotateY(' + C.ry.toFixed(3) + 'deg) rotateZ(' + C.rz.toFixed(3) + 'deg) scale(' + C.s.toFixed(4) + ')';
      // the lights are far behind: they move less than the sheet but scale more on a push (depth)
      lights.forEach((d, i) => { d.style.transform = 'translate(' + (-C.ry * 16 + 26 * Math.sin(t * 0.3 + i * 2)).toFixed(1) + 'px,' + (C.rx * 14 + 22 * Math.cos(t * 0.26 + i)).toFixed(1) + 'px) scale(' + (1 + (C.s - 1) * 0.6).toFixed(4) + ')'; });
      gloss.style.transform = 'translateX(' + (-60 + 150 * (0.5 + 0.5 * Math.sin(t * 0.5)) + C.ry * 26).toFixed(1) + '%)';
      // the gap in the music: the light closes in (a soft deep-turquoise vignette), the flash opens it again
      const dk = smooth((t - TB0) / 0.25) * (t < TS ? 1 : 0); vig.style.opacity = dk.toFixed(3);
      const fl = R.cam.flash(t, TS); flash.style.opacity = fl.toFixed(3);
      let sk = null; STK.forEach((s0) => { if (t >= s0 - 0.02 && t < s0 + 0.15) sk = s0; });
      if (sk != null) { const q = clamp((t - sk + 0.02) / 0.16); streak.style.opacity = (Math.sin(Math.PI * q) * 0.75).toFixed(3); streak.style.transform = 'translateX(' + (-500 + q * 2100).toFixed(1) + 'px) rotate(16deg)'; } else streak.style.opacity = '0';
      // ---- the conversation
      const gone = t < TL ? 0 : clamp((t - TL) / (FLY + 0.15));
      sheet.style.display = t >= TS + 0.1 ? 'none' : '';
      if (t < TS + 0.1) {
        const L = lay(t);
        sheet.style.top = L.top.toFixed(2) + 'px'; sheet.style.height = L.Hs.toFixed(2) + 'px'; area.style.height = L.A.toFixed(2) + 'px'; sheet.style.transformOrigin = (SW / 2) + 'px ' + (L.Hs / 2).toFixed(1) + 'px';
        const gE = E.in(gone); // the sheet falls back as the bubble lifts off it
        sheet.style.transform = gone > 0 ? 'translate3d(0,' + (gE * 120).toFixed(1) + 'px,' + (-gE * 900).toFixed(1) + 'px) rotateX(' + (gE * 18).toFixed(2) + 'deg)' : '';
        const ga = smooth((t - BT(2) + 0.05) / 0.4); glass.style.opacity = ga.toFixed(3); head.style.opacity = smooth((t - BT(2)) / 0.4).toFixed(3); head.style.visibility = t < BT(2) - 0.05 ? 'hidden' : '';
        sheet.style.opacity = (1 - smooth((gone - 0.3) / 0.7)).toFixed(3); sheet.style.filter = gone > 0.02 ? 'blur(' + (gE * 14).toFixed(1) + 'px)' : '';
        // depth of field in the gap: only the fake-out and its answer stay sharp
        const dof = dk * (t < TL ? 1 : 1 - smooth((t - TL) / 0.2));
        let nTyping = 0;
        items.forEach((it, j) => {
          const s = L.st[j], b = it.b; if (!s || (it === last && t >= TL)) { b.style.visibility = 'hidden'; return; }
          const top = PADT + L.tops[j] - L.O, o = smooth((top + 40) / 80);
          b.style.visibility = o < 0.004 ? 'hidden' : ''; b.style.opacity = (o * (j < 6 ? 1 - 0.4 * dof : 1)).toFixed(3);
          b.style.width = s.w.toFixed(1) + 'px'; b.style.height = s.h.toFixed(1) + 'px';
          const rx = (1 - Math.min(1, s.e)) * 38, sc = (0.45 + 0.55 * s.e) * (it.tType != null && t < it.tMsg ? 1 + 0.07 * beatAt(t) : 1);
          b.style.transform = 'translateY(' + (top + (1 - Math.min(1, s.e)) * 36).toFixed(2) + 'px) perspective(900px) rotateX(' + rx.toFixed(2) + 'deg) scale(' + sc.toFixed(4) + ')';
          b.style.filter = j < 6 && dof > 0.02 ? 'blur(' + (dof * 5).toFixed(2) + 'px)' : '';
          const typing = it.tType != null && t < it.tMsg + 0.12, ta = it.tType != null ? 1 - smooth((t - it.tMsg) / 0.1) : 0;
          it.dotsEl.style.opacity = ta.toFixed(3); it.dotsEl.style.visibility = ta < 0.004 ? 'hidden' : '';
          if (typing) { if (it.who === 'n' && t < it.tMsg) nTyping = 1; typingDots(it.dots, it.tType, t); }
          const to = it.tType != null ? smooth((t - it.tMsg - 0.03) / 0.16) : smooth((t - it.tMsg) / 0.12);
          it.t.style.opacity = to.toFixed(3); it.t.style.visibility = to < 0.004 ? 'hidden' : ''; it.t.style.transform = 'translateY(' + ((1 - to) * 10).toFixed(1) + 'px)';
        });
        head.style.filter = dof > 0.02 ? 'blur(' + (dof * 4).toFixed(2) + 'px)' : '';
        const q = nTyping; subT.style.opacity = q; sub.style.opacity = 1 - q; subT.style.visibility = q ? '' : 'hidden'; sub.style.visibility = q ? 'hidden' : '';
        const pulse = nTyping ? 0.5 + 0.5 * Math.sin(t * 9) : 0; ring.style.opacity = (nTyping ? 0.35 + 0.5 * pulse : 0).toFixed(3); ring.style.transform = 'scale(' + (1 + 0.05 * pulse).toFixed(3) + ')';
      }
      // ---- card A: the last bubble lifts into the lens, edge-on on the beat before the drums, and lands as the photo through the light
      {
        const bxy = centre(items.length - 1, TL), bx = bxy[0], by = bxy[1];
        if (t < TL) setCard(cA, bx, by, last.mw, last.mh, 50, Object.assign({}, P0, { o: 0 }));
        else if (t < TS) {
          const u = clamp((t - TL) / FLY), e = E.in(u), eo = E.inout(u);
          const P = { x: 0, y: -40 * Math.sin(Math.PI * u), z: 420 * e, rx: -14 * Math.sin(Math.PI * u * 0.9), ry: 84 * e, rz: 7 * eo, s: 1 + 0.08 * Math.sin(Math.PI * u), o: 1, blur: 0, dim: 0 };
          setCard(cA, lerp(bx, CX, eo), lerp(by, CY, eo), lerp(last.mw, CW, E.in(clamp((u - 0.25) / 0.75))), lerp(last.mh, CH, E.in(clamp((u - 0.25) / 0.75))), lerp(50, 50, u), P);
          cAt.style.opacity = (1 - smooth((u - 0.7) / 0.3)).toFixed(3);
          const mb = 18 * e; cA.front.style.filter = mb > 0.5 ? 'blur(' + (mb * 0.3).toFixed(1) + 'px)' : '';
        } else if (t < C2) {
          const v = (t - TS) / 0.5, H1 = hero(t, 0), hk = smooth((t - TS - 0.25) / 0.6);
          const P = { x: 0, y: H1.y * hk, z: 420 * (1 - E.out5(clamp(v * 1.4))), rx: H1.rx * hk, ry: 84 + 96 * spring(v) + H1.ry * hk, rz: 7 * (1 - E.out5(clamp(v))) + H1.rz * hk, s: 1, o: 1, blur: 0, dim: 0 };
          setCard(cA, CX, CY, CW, CH, 50, P); light(fA, { ry: P.ry - 180 });
          const mb = 22 * (1 - smooth(v * 1.6)); cA.back.style.filter = mb > 0.5 ? 'blur(' + (mb * 0.3).toFixed(1) + 'px)' : ''; cA.front.style.filter = '';
        } else { const u = clamp((t - C2) / 0.42), H1 = hero(t, 0); H1.ry += 180; const Q = past(-1); Q.ry += 180; const P = exit(H1, Q, u); setCard(cA, CX, CY, CW, CH, 50, P); }
      }
      // ---- card B: it waits behind A (the stack), comes forward on its bar, flies past
      {
        const tIn = TS + 0.35;
        if (t < tIn) setCard(cB, CX, CY, CW, CH, 50, Object.assign({}, P0, { o: 0 }));
        else if (t < C2) { const e = E.out5(clamp((t - tIn) / 0.55)); const P = mix(Object.assign({}, behind(t, 1), { x: 0, y: 0, rz: 0, o: 0 }), behind(t, 1), e); P.o = smooth((t - tIn) / 0.2); setCard(cB, CX, CY, CW, CH, 50, P); light(fB, P); }
        else if (t < C3) { const u = clamp((t - C2 - 0.06) / 0.5), e = spring(u * 1.25); const P = mix(behind(t, 1), hero(t, 1.7), e); P.blur = behind(t, 1).blur * (1 - smooth(u / 0.5)); P.dim = 0.16 * (1 - smooth(u / 0.5)); P.ry += 22 * (1 - smooth(u)); setCard(cB, CX, CY, CW, CH, 50, P); light(fB, P); }
        else { const u = clamp((t - C3) / 0.42); const P = exit(hero(t, 1.7), past(1), u); setCard(cB, CX, CY, CW, CH, 50, P); }
      }
      // ---- the phone: behind B, then forward with a turn; at the end it turns over into Nuki's last bubble
      {
        const tIn = C2 + 0.16, PY = CY - 4;
        const ph = (t) => Object.assign({}, P0, { ry: 9 - 5 * smooth((t - C3) / 1.6) + 1.2 * Math.sin(t * 1.0), rx: 2.5 + 0.8 * Math.sin(t * 0.8 + 1), rz: 0.5 * Math.sin(t * 0.6), y: 5 * Math.sin(t * 1.2), s: 1 });
        if (t < tIn) setCard(cP, CX, PY, PW, PH, 78, Object.assign({}, P0, { o: 0 }));
        else if (t < C3) { const e = E.out5(clamp((t - tIn) / 0.55)); const b = Object.assign({}, behind(t, -1), { x: -236, y: -30, z: -340 }); const P = mix(Object.assign({}, b, { x: 0, y: 0, rz: 0 }), b, e); P.o = smooth((t - tIn) / 0.2); setCard(cP, CX, PY, PW, PH, 78, P); }
        else if (t < E0) { const u = clamp((t - C3 - 0.06) / 0.55), e = spring(u * 1.2); const b = Object.assign({}, behind(t, -1), { x: -236, y: -30, z: -340 }), H2 = ph(t); H2.ry += 30 * (1 - smooth(u)); const P = mix(b, H2, e); P.blur = b.blur * (1 - smooth(u / 0.5)); P.dim = 0.16 * (1 - smooth(u / 0.5)); setCard(cP, CX, PY, PW, PH, 78, P); }
        else { const D = E1 - E0, u = clamp((t - E0) / D), e = E.inout(u), e2 = E.inout(clamp((u - 0.42) / 0.58)), tl = t - E1, H2 = ph(E0);
          const wob = tl > 0 ? 8 * Math.exp(-tl * 6) * Math.sin(tl * 13) : 0, fl2 = smooth(tl / 0.6);
          const P = { x: 0, y: -40 * Math.sin(Math.PI * u) + 4 * Math.sin(t * 1.1) * fl2, z: 260 * Math.sin(Math.PI * u), rx: H2.rx * (1 - e) - 6 * Math.sin(Math.PI * u) + 0.9 * Math.sin(t * 0.9) * fl2, ry: H2.ry * (1 - e) + 180 * e + wob + 1.5 * Math.sin(t * 0.8) * fl2, rz: 3 * Math.sin(Math.PI * u), s: 1, o: 1, blur: 0, dim: 0, drop: 1 - e2 };
          setCard(cP, CX, lerp(PY, ECY, e2), lerp(PW, EW, e2), lerp(PH, EH, e2), lerp(78, 50, e2), P);
          nub.style.opacity = smooth((u - 0.9) / 0.1).toFixed(3);
          const mb = 22 * Math.sin(Math.PI * u) * (u < 1 ? 1 : 0); cP.faces.forEach((f) => { f.style.filter = mb > 0.5 ? 'blur(' + (mb * 0.3).toFixed(1) + 'px)' : ''; });
          const to = smooth((u - 0.72) / 0.28); endT.style.opacity = to.toFixed(3);
        }
        if (page) { const u = clamp((t - C3 + 0.3) / (E0 - C3 + 0.3)); page.style.top = (navH - 24 - 330 * E.inout(u)).toFixed(1) + 'px'; }
        pSheen.style.backgroundPosition = (30 + 60 * smooth((t - C3) / 1.8)) + '% 0';
        if (t < E0) { endT.style.opacity = '0'; nub.style.opacity = '0'; }
        // the answer: «360», typed under it; the keyword in Nuki's bubble answers it
        const tR = rep ? rep.tMsg : 1e9, kp = Math.sin(Math.PI * clamp((t - tR) / 0.42)); kw.style.transform = 'scale(' + (1 + 0.12 * kp).toFixed(4) + ')';
        if (rep) {
          const on = t >= rep.tType, m = t < rep.tMsg ? 0 : spring((t - rep.tMsg) / 0.4), e = spring((t - rep.tType) / 0.38);
          const w = lerp(TYW, rep.mw, m), hh = lerp(TYH, rep.mh, m);
          rep.b.style.visibility = on ? '' : 'hidden';
          rep.b.style.left = (920 - w).toFixed(1) + 'px'; rep.b.style.width = w.toFixed(1) + 'px'; rep.b.style.height = hh.toFixed(1) + 'px';
          rep.b.style.transform = 'translateY(' + ((1 - Math.min(1, e)) * 30).toFixed(1) + 'px) perspective(900px) rotateX(' + ((1 - Math.min(1, e)) * 38).toFixed(2) + 'deg) scale(' + (0.45 + 0.55 * e).toFixed(4) + ')';
          const ta = 1 - smooth((t - rep.tMsg) / 0.1); rep.dotsEl.style.opacity = ta.toFixed(3); rep.dotsEl.style.visibility = ta < 0.004 ? 'hidden' : '';
          if (t < rep.tMsg + 0.12) typingDots(rep.dots, rep.tType, t);
          const to = smooth((t - rep.tMsg - 0.03) / 0.16); rep.t.style.opacity = to.toFixed(3); rep.t.style.visibility = to < 0.004 ? 'hidden' : '';
        }
        // Nuki comes in under the conversation, on its beat
        const n = spring((t - TN) / 0.5), sq = 1 + 0.12 * Math.exp(-Math.max(0, t - TN) * 7) * Math.sin(Math.max(0, t - TN) * 16);
        nuki.style.visibility = t < TN ? 'hidden' : ''; nuki.style.opacity = smooth((t - TN) / 0.1).toFixed(3);
        nuki.style.transform = 'translateY(' + ((1 - n) * 110 + 4 * Math.sin(t * 1.4)).toFixed(2) + 'px) rotate(' + (2 * Math.sin(t * 1.1)).toFixed(2) + 'deg) scale(' + (0.9 + 0.1 * n).toFixed(4) + ',' + ((0.9 + 0.1 * n) * sq).toFixed(4) + ')';
        const sa = smooth((t - TN - 0.6) / 0.5); sig.style.opacity = sa.toFixed(3); sig.style.visibility = sa < 0.004 ? 'hidden' : ''; sig.style.transform = 'translateY(' + ((1 - E.out5(clamp((t - TN - 0.6) / 0.7))) * 12).toFixed(1) + 'px)';
        nDrop.style.left = (CX - NW / 2 + 30) + 'px'; nDrop.style.top = (NY + NH - 34) + 'px'; nDrop.style.width = (NW - 60) + 'px'; nDrop.style.height = '52px'; nDrop.style.opacity = (0.8 * smooth((t - TN) / 0.3)).toFixed(3); nDrop.style.visibility = t < TN ? 'hidden' : '';
      }
    });

    // ---------------------------------------------------------------- sound and events, to the frame (the premium set, by category)
    // mix.py keeps at most one non-tick sound per 70 ms: a move's hit sits ON the beat (pushed before the bubble's tap,
    // which is never thinned), its whoosh peaks 2-3 frames later, where the move is fastest
    const ev = (t, k) => R.event(t, k);
    // a no-voice reel: the effects sit +3 dB over the bed mix.py gives a reel without voice (the owner, 15.11: the music a
    // little quieter; here it carries the reel, but every bubble, hit and whoosh stays clearly audible)
    const sfx = (t, cat, g = 0.6, o) => ctx.sfx(t, cat, g * 1.41, o);
    const SP = 0.085;
    sfx(0.09, 'impact', 0.3, { prio: 4 });
    MV.forEach((m) => { if (m.hit) sfx(m.t0, 'hit_deep', m.hit, { prio: 4 }); sfx(m.t0 + SP, 'whoosh_cut', m.hit ? 0.35 + 0.4 * m.hit : 0.35, { prio: 3, peak: true }); ev(m.t0, 'move'); });
    const busy = (tt) => MV.some((m) => Math.abs(m.t0 + SP - tt) < 0.08) || HB.some((x) => Math.abs(x - tt) < 0.08);
    const typingSounds = (tType, tMsg, pan) => { for (let k = 1; tType + k * per / 2 < tMsg - 0.1; k++) { const tt = tType + k * per / 2; if (!busy(tt)) sfx(tt, 'tick_soft', 0.32, { pan }); } };
    items.forEach((it) => {
      if (it.tType != null) { ev(it.tType, 'type'); typingSounds(it.tType, it.tMsg, it.who === 'n' ? -0.3 : 0.3); }
      const ts = Math.max(0, it.tMsg);
      if (it.who === 'n' && !MV.some((m) => m.hit && Math.abs(m.t0 - ts) < 0.08)) sfx(ts, 'dot', 0.7, { pan: -0.22, prio: 3 }); else sfx(ts, 'tap', 0.72, { pan: it.who === 'n' ? -0.22 : 0.22 });
      ev(ts, 'pop');
    });
    // the gap in the music: a heartbeat on its beats
    HB.forEach((t) => { sfx(t, 'pulse', 0.62, { prio: 3 }); ev(t, 'breath'); });
    // the lift: the bubble peels off the sheet, rushes edge-on into the lens; the drums come back through the light
    sfx(TL, 'card_flip', 0.62); ev(TL, 'open');
    sfx(TS - 0.033, 'whoosh_through', 0.7, { prio: 4, peak: true }); ev(TS, 'cut');
    sfx(TS + 0.04, 'hit_deep', 1.0, { prio: 5 }); // one frame after the light's peak, with the drums (118.149 s in the track = 11.229 s)
    sfx(TS + 0.13, 'shimmer_soft', 0.7, { prio: 3 }); ev(TS + 0.13, 'glow');
    // the montage: a hit on each bar's beat, the card flies past (its whoosh at the fastest frames), the next one lands
    (p.mmoves || []).forEach((m) => { const t0 = BT(m.b); if (m.hit) sfx(t0, 'hit_deep', m.hit, { prio: 4 }); sfx(t0 + SP, 'whoosh_cut', 0.4, { prio: 3, peak: true }); ev(t0, 'move'); });
    [C2, C3].forEach((t) => { sfx(t, 'hit_deep', 0.6, { prio: 4 }); sfx(t, 'card_flip', 0.62); ev(t, 'flip'); sfx(t + 0.12, 'whoosh_cut', 0.62, { prio: 3, peak: true }); ev(t + 0.12, 'cut'); sfx(t + 0.36, 'tap', 0.6); ev(t + 0.36, 'slam'); });
    // the phone turns over into Nuki's last bubble
    sfx(E0, 'hit_deep', 0.5, { prio: 4 }); sfx(E0, 'card_flip', 0.62); ev(E0, 'flip');
    sfx(E0 + (E1 - E0) / 2, 'swoosh_end', 0.6, { prio: 4, peak: true }); ev(E0 + (E1 - E0) / 2, 'cut');
    sfx(E1, 'dot', 0.78, { prio: 3 }); ev(E1, 'slam');
    sfx(TN, 'tap', 0.55); ev(TN, 'pop');
    if (rep) { ev(rep.tType, 'type'); typingSounds(rep.tType, rep.tMsg, 0.3); sfx(rep.tMsg, 'tap', 0.75, { pan: 0.22 }); ev(rep.tMsg, 'pop'); sfx(rep.tMsg + 0.1, 'shimmer_soft', 0.6, { prio: 3 }); ev(rep.tMsg + 0.1, 'glow'); }
    ev(E1 + 1.4, 'hold');
    ctx.focus(cP.c);
  };
})();
