/* portal-motion.js: motion with a sense of place (the owner's lesson, 16.11, „Tap. Don't cut. Carry.”).
   1. The card becomes the page: a drawer, a sheet or a phone screen opened from a card grows out of that card
      (container transform) and the card's avatar / name / amount fly to their place in the new header.
   2. Back goes back: closing shrinks the page back into the same card (found again by its data-id when the list
      re-rendered), the names fly home and the card is there again.
   3. Menus start at their button: menus, popovers, dialogs and the phone's Meniu open from the button that opened
      them (scaled around its position) and close back into it.
   Plus: tabs and sub-tabs slide in the direction of the move instead of cutting.
   Nothing here changes what a screen does: it only watches the overlays the portal already has (K.drawer, K.ui
   dialogs, the palette, every .k-menu, the KPI period sheet, the phone menu, the Mesaje conversation, the lead
   sheet, the contacts overlay) and animates them with the Web Animations API on transform / opacity only, so it
   runs on the compositor, can be interrupted at any moment (a close mid-open reverses from where it is) and never
   holds the input. The trigger is the last element that was clicked (any click, keyboard included) or the one a
   caller passes (K.drawer({ from }) / C360Motion.from(el)). Off with prefers-reduced-motion or Preferințe → mișcare
   redusă (html.c360-reduce): then the portal's own short transitions stay, as before. */
(function () {
  'use strict';
  const H = document.documentElement;
  if (!document.body || !Element.prototype.animate) return;
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mqReduce.matches || H.classList.contains('c360-reduce');
  const phone = () => window.matchMedia('(max-width:720px)').matches;
  // the curve of an iOS sheet: quick off the mark, a long soft landing
  const E_OPEN = 'cubic-bezier(.32,.72,0,1)', E_CLOSE = 'cubic-bezier(.32,.72,0,1)', E_POP = 'cubic-bezier(.2,.9,.25,1)', E_EXIT = 'cubic-bezier(.4,0,1,1)';
  const T_OPEN = 380, T_CLOSE = 320, T_POP = 260, T_POPX = 160, T_TAB = 300;
  const now = () => performance.now();
  const oops = (e) => { if (window.C360Motion && window.C360Motion.debug) console.warn('[motion]', e); };
  // the window's size, kept (reading innerWidth while the page is dirty makes the browser lay it out there and then)
  const VP = { w: innerWidth, h: innerHeight };
  addEventListener('resize', () => { VP.w = innerWidth; VP.h = innerHeight; }, { passive: true });
  const visible = (r) => r && r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < VP.h && r.left < VP.w;

  // ------------------------------------------------------------------ the trigger: what was tapped last
  // the attributes that name a row's record (a client, a booking, an employee, a payment...): the card is the nearest
  // element that carries one, and the same attribute finds it again after the list re-rendered
  const NOT_ID = /^data-(act|ic|nk|sxpr|q|list|go|tab|view|k-|then|arg|roles|quiet|route|routes|dup|site-after|menu|mfoot|v|close|cancel|ok|field|i|m|d|tone|tip|theme|anim|count|kq-|kp-|mx-|ov-|sx-|n-|gm-|state|open-state|sort|filter|page|step)/;
  function idAttr(el) {
    if (!el.attributes) return null;
    for (const a of el.attributes) {
      if (a.name.slice(0, 5) !== 'data-' || NOT_ID.test(a.name) || !a.value || a.value.length > 80 || a.value === 'true' || a.value === '1') continue;
      return a;
    }
    return null;
  }
  const STOP = 'main, .panel, .k-dbody, .k-drawer, .pl-drawer, nav, header, .k-menu, .c360-dialog, form, table, tbody, .mx-list, .c360-tabbar';
  function cardOf(t) {
    const vw = VP.w, vh = VP.h;
    let byClass = null;
    for (let el = t, i = 0; el && el !== document.body && i < 9; el = el.parentElement, i++) {
      if (i > 0 && el.matches(STOP)) break;
      const r = el.getBoundingClientRect();
      if (r.height > vh * 0.6 || (r.width > vw * 0.98 && r.height > 180)) break;
      if (r.width >= 64 && r.height >= 26) {
        if (idAttr(el)) return el;
        if (!byClass && el.matches('tr, li, .k-card, .card, [class*="card"], [class*="-row"]')) byClass = el;
      }
    }
    return byClass;
  }
  function sigOf(el) {
    const a = idAttr(el);
    if (!a) return el.id ? '#' + CSS.escape(el.id) : null;
    return el.tagName.toLowerCase() + '[' + a.name + '="' + CSS.escape(a.value) + '"]';
  }
  let last = null;
  function note(target) {
    if (!(target instanceof Element)) return;
    const el = target.closest('button, a, [role="button"], [role="tab"], summary, label, [tabindex]') || target;
    const card = cardOf(target);
    const r = el.getBoundingClientRect();
    const cr = card ? card.getBoundingClientRect() : r;
    if (!visible(r) && !visible(cr)) return;
    last = { el, card: card || el, rect: r, cardRect: cr, sig: sigOf(card || el), t: now() };
  }
  // capture phase: the page is still as she saw it (the handlers below may re-render the list)
  document.addEventListener('click', (e) => note(e.target), true);
  // a fresh trigger: the element still on screen, or one that left a moment ago (a menu item that closed its menu);
  // one whose page went away meanwhile (a Panou card that opened a booking in Calendar) leaves the portal's own motion
  function trigger(maxAge) {
    if (!last || now() - last.t > (maxAge || 1200)) return null;
    const x = last;
    if (x.el.isConnected) {
      const r = x.el.getBoundingClientRect();
      if (!visible(r)) return null;
      x.rect = r;
      if (x.card === x.el) x.cardRect = r; else if (x.card.isConnected) { const cr = x.card.getBoundingClientRect(); if (visible(cr)) x.cardRect = cr; }
    } else if (now() - x.t > 450) return null;
    return x;
  }
  // the card again: the same element, or the one the list drew in its place (same data-id), on screen
  function refind(o) {
    if (o.card && o.card.isConnected && visible(o.card.getBoundingClientRect()) && !o.card.closest('.cx-ghost')) return o.card;
    if (!o.sig) return null;
    for (const c of document.querySelectorAll(o.sig)) {
      if (c.closest('.cx-ghost, .k-drawer-root, .pl-drawer-root, .c360-dialog-root')) continue;
      if (visible(c.getBoundingClientRect())) return c;
    }
    return null;
  }

  // ------------------------------------------------------------------ a picture of an element, made of plain boxes
  // (the card is drawn again over everything, so it can ride with the page that grows out of it: every box, text and
  // icon at its place, with its computed look; context-free, so a table row works as well as a card)
  const BOX = ['backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius', 'boxShadow',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'];
  const TXT = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariantNumeric', 'lineHeight', 'letterSpacing', 'color', 'textAlign', 'textTransform', 'whiteSpace', 'textOverflow', 'textDecorationLine', 'textDecorationColor', 'textShadow', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'webkitLineClamp', 'webkitBoxOrient'];
  const clear = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  const hasBox = (s) => !clear(s.backgroundColor) || s.backgroundImage !== 'none' || s.boxShadow !== 'none' || (parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth) + parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth) > 0 && s.borderTopStyle + s.borderLeftStyle !== 'nonenone');
  const AV = '.k-avatar, .c360-avatar, [class*="avatar"], [class*="-face"], .mx-face';
  function place(n, r, o) { n.style.position = 'absolute'; n.style.left = (r.left - o.left) + 'px'; n.style.top = (r.top - o.top) + 'px'; n.style.width = r.width + 'px'; n.style.height = r.height + 'px'; n.style.margin = '0'; n.style.boxSizing = 'border-box'; }
  function copy(n, s, props) { for (const p of props) { const v = s[p]; if (v) n.style[p] = v; } }
  function snap(src, opts) {
    opts = opts || {};
    const R = opts.rect || src.getBoundingClientRect();
    const box = document.createElement('div');
    box.className = 'cx-ghost k-skip'; box.setAttribute('aria-hidden', 'true');
    const s0 = getComputedStyle(src);
    copy(box, s0, BOX);
    if (clear(s0.backgroundColor) && s0.backgroundImage === 'none' && opts.bg) box.style.backgroundColor = opts.bg;
    box.style.cssText += ';left:' + R.left + 'px;top:' + R.top + 'px;width:' + R.width + 'px;height:' + R.height + 'px;';
    const leaves = [];
    let n = 0;
    const leaf = (el, r, s, node, text) => { leaves.push({ src: el, node, rect: r, text: text != null ? text : norm(el.textContent), avatar: !!el.matches && el.matches(AV), size: parseFloat(s.fontSize) || 14 }); };
    const walk = (el) => {
      for (const c of el.children) {
        if (n++ > 220) return;
        const s = getComputedStyle(c);
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
        const r = c.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.bottom < R.top || r.top > R.bottom || r.right < R.left || r.left > R.right) { if (s.display === 'contents') walk(c); continue; }
        const tag = c.tagName;
        if (tag === 'svg' || tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS') {
          if (tag === 'CANVAS') continue;
          const k = tag === 'VIDEO' ? document.createElement('div') : c.cloneNode(true);
          place(k, r, R); k.style.color = s.color; k.style.opacity = s.opacity; k.style.transform = 'none'; k.style.objectFit = s.objectFit; k.style.borderRadius = s.borderRadius; k.style.fill = s.fill; k.style.stroke = s.stroke;
          if (tag === 'VIDEO') copy(k, s, BOX);
          box.appendChild(k); continue;
        }
        // an avatar travels as one piece: its circle, its initials or its photo
        if (c.matches(AV) && r.width <= 96) {
          const k = c.cloneNode(true);
          place(k, r, R); copy(k, s, BOX); copy(k, s, TXT); k.style.display = 'grid'; k.style.placeItems = 'center'; k.style.overflow = 'hidden'; k.style.transform = 'none'; k.style.animation = 'none';
          box.appendChild(k); leaf(c, r, s, k); continue;
        }
        if (hasBox(s)) { const k = document.createElement('div'); place(k, r, R); copy(k, s, BOX); if (s.opacity !== '1') k.style.opacity = s.opacity; box.appendChild(k); }
        // its own text
        const kids = c.children.length;
        let own = '';
        for (const t of c.childNodes) if (t.nodeType === 3) own += t.textContent;
        own = own.replace(/\s+/g, ' ').trim();
        if (own && !kids) {
          const k = document.createElement('div');
          place(k, r, R); copy(k, s, TXT); k.style.overflow = 'hidden'; k.style.display = s.display === 'inline' ? 'block' : s.display === '-webkit-box' ? '-webkit-box' : 'block';
          if (s.display === 'inline' || s.display === 'inline-block') k.style.padding = '0';
          if (s.display === 'flex' || s.display === 'inline-flex' || s.display === 'grid') { k.style.display = 'flex'; k.style.alignItems = s.alignItems || 'center'; k.style.justifyContent = s.justifyContent; }
          if (s.opacity !== '1') k.style.opacity = s.opacity;
          k.textContent = c.textContent.replace(/\s+/g, ' ').trim();
          box.appendChild(k); leaf(c, r, s, k);
        } else if (own) {
          // text beside other elements: each run where the browser drew it
          for (const t of c.childNodes) {
            if (t.nodeType !== 3 || !t.textContent.trim()) continue;
            const rg = document.createRange(); rg.selectNodeContents(t);
            const rs = rg.getClientRects();
            if (rs.length !== 1) continue;
            const tr = rs[0];
            const k = document.createElement('div');
            place(k, tr, R); copy(k, s, TXT); k.style.padding = '0'; k.style.whiteSpace = 'pre'; k.style.overflow = 'visible'; k.style.display = 'block'; k.style.lineHeight = tr.height + 'px';
            k.textContent = t.textContent.trim();
            box.appendChild(k); leaf(c, tr, s, k, norm(t.textContent));
          }
          walk(c);
        } else walk(c);
      }
    };
    if (src.children.length) walk(src);
    else if (norm(src.textContent)) { const k = document.createElement('div'); place(k, R, R); copy(k, s0, TXT); k.style.display = 'flex'; k.style.alignItems = 'center'; k.style.justifyContent = s0.justifyContent || 'center'; k.textContent = src.textContent.trim(); box.appendChild(k); leaf(src, R, s0, k); }
    return { box, leaves, rect: R };
  }
  const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();

  // the shared elements: the card's avatar and its name / amount, found again in the new page's header
  function sharedPairs(cardSnap, panel, F, rectOf) {
    const out = [];
    if (!cardSnap || !panel) return out;
    rectOf = rectOf || ((el) => el.getBoundingClientRect());
    const top = F.top + Math.min(F.height * 0.4, 260);
    const cands = [...panel.querySelectorAll(AV + ', h1, h2, h3, h4, b, strong, [class*="title"], [class*="name"], [class*="amount"], [class*="sum"]')].filter((el) => {
      const r = rectOf(el);
      return r.top >= F.top - 2 && r.top < top && r.width > 4 && r.height > 4 && r.width < F.width;
    }).slice(0, 40);
    const used = new Set();
    let av = false, texts = 0;
    for (const t of cands) {
      const isAv = t.matches(AV);
      if (isAv) {
        if (av) continue;
        const m = cardSnap.leaves.find((l) => l.avatar && !used.has(l) && (norm(l.src.textContent) === norm(t.textContent)));
        if (m) { used.add(m); out.push({ from: m, to: t, avatar: true }); av = true; }
        continue;
      }
      if (texts >= 2 || t.children.length > 2) continue;
      const tt = norm(t.textContent);
      if (tt.length < 2 || tt.length > 60) continue;
      const m = cardSnap.leaves.find((l) => !l.avatar && !used.has(l) && l.text === tt);
      if (m) { used.add(m); out.push({ from: m, to: t }); texts++; }
    }
    return out;
  }
  // where a shared piece flies: by its left edge and middle line for text (scaled by the font), by its centre for an avatar
  function flight(a, b, avatar) {
    if (avatar) {
      const s = b.width / Math.max(1, a.width);
      return { o: '50% 50%', t: 'translate(' + (b.left + b.width / 2 - (a.left + a.width / 2)) + 'px,' + (b.top + b.height / 2 - (a.top + a.height / 2)) + 'px) scale(' + s + ')' };
    }
    const s = b.height / Math.max(1, a.height);
    return { o: '0 50%', t: 'translate(' + (b.left - a.left) + 'px,' + (b.top + b.height / 2 - (a.top + a.height / 2)) + 'px) scale(' + s + ')' };
  }
  const layer = () => { let l = document.querySelector('.cx-layer'); if (!l) { l = document.createElement('div'); l.className = 'cx-layer k-skip'; l.setAttribute('aria-hidden', 'true'); document.body.appendChild(l); } return l; };
  // a flier: one leaf of a picture, alone over everything at its place on screen
  function flier(l) {
    const box = document.createElement('div');
    box.className = 'cx-ghost cx-fly k-skip'; box.setAttribute('aria-hidden', 'true');
    const n = l.node; n.remove();
    n.style.left = '0'; n.style.top = '0';
    box.style.cssText = 'left:' + l.rect.left + 'px;top:' + l.rect.top + 'px;width:' + l.rect.width + 'px;height:' + l.rect.height + 'px;';
    box.appendChild(n);
    return box;
  }

  // ------------------------------------------------------------------ the overlays the portal has
  const q = (r, s) => (s ? r.querySelector(s) : r);
  const SPECS = [
    { id: 'drawer', match: (t) => t.classList.contains('k-drawer-root'), on: (t) => t.classList.contains('is-open'), panel: (r) => q(r, '.k-drawer'), back: (r) => q(r, '.k-drawer-backdrop'), kind: 'carry' },
    { id: 'lead', match: (t) => t.classList.contains('pl-drawer-root'), on: (t) => t.classList.contains('is-open'), panel: (r) => q(r, '.pl-drawer'), back: (r) => q(r, '.pl-drawer-backdrop'), kind: 'carry' },
    { id: 'ov', match: (t) => t.classList.contains('ct-ov'), on: (t) => t.classList.contains('is-open'), panel: (r) => q(r, '.ct-ov-panel'), back: (r) => q(r, '.ct-ov-back'), kind: 'auto', hold: true, maxClose: 210 },
    { id: 'dialog', match: (t) => t.classList.contains('c360-dialog-root'), on: (t) => t.classList.contains('is-open'), panel: (r) => q(r, '.c360-dialog'), back: (r) => q(r, '.c360-dialog-backdrop'), kind: 'pop', maxClose: 190 },
    { id: 'palette', match: (t) => t.classList.contains('c360-palette-root'), on: (t) => t.classList.contains('is-open'), panel: (r) => q(r, '.c360-palette'), back: (r) => q(r, '.c360-dialog-backdrop'), kind: 'pop', maxClose: 170 },
    { id: 'menu', match: (t) => t.classList.contains('k-menu'), on: (t) => t.classList.contains('is-open'), panel: (r) => r, back: () => null, kind: 'pop', maxClose: 170 },
    { id: 'kq', match: (t) => t.classList.contains('kq-pop'), attr: 'hidden', on: (t) => !t.hidden, panel: (r) => r, back: () => null, kind: 'pop', ghost: 'clone' },
    { id: 'mnav', match: (t) => t === H, cls: 'c360-mnav-open', on: (t) => t.classList.contains('c360-mnav-open'), panel: () => document.getElementById('tabsNav'), back: () => document.querySelector('.c360-mnav-backdrop'), kind: 'carry', when: phone },
    { id: 'mx', match: (t) => t.classList.contains('mx') && t.classList.contains('panel'), cls: 'is-thread', on: (t) => t.classList.contains('is-thread'), panel: (r) => q(r, '.mx-thread-col'), back: () => null, kind: 'carry', when: phone, ghost: 'page', head: '.mx-thead' },
  ];
  const state = new Map(); // root -> what is running for it and where it came from

  const finish = (anims) => anims.forEach((a) => { try { a.cancel(); } catch (e) { /* gone */ } });
  function stop(st) {
    if (!st) return;
    finish(st.anims || []); st.anims = [];
    (st.ghosts || []).forEach((g) => g.remove()); st.ghosts = [];
    (st.marked || []).forEach(([e, v, pr]) => { if (v) e.style.setProperty('transition', v, pr); else e.style.removeProperty('transition'); }); st.marked = [];
    (st.obs || []).forEach((o) => o.disconnect()); st.obs = [];
    clearTimeout(st.timer); cancelAnimationFrame(st.raf || 0);
  }
  // the element's own CSS transition steps aside while the animation drives it (inline, not a class: the portal's own
  // observers of the side menu re-measure on every class change)
  const mark = (st, ...els) => els.forEach((e) => { if (e && !st.marked.some((m) => m[0] === e)) { st.marked.push([e, e.style.getPropertyValue('transition'), e.style.getPropertyPriority('transition')]); e.style.setProperty('transition', 'none', 'important'); } });
  const done = (st, total) => { clearTimeout(st.timer); st.timer = setTimeout(() => stop(st), total + 40); };
  // a picture holds its last frame until it is taken away; a real element goes back to its own style
  const anim = (st, el, kf, o) => { if (!el) return null; const a = el.animate(kf, Object.assign({ fill: el.classList.contains('cx-ghost') || el.classList.contains('cx-ghost-clone') ? 'forwards' : 'none' }, o)); st.anims.push(a); return a; };
  // position on the curve, opacity on the clock (a fade tied to the curve would be over in the first frames)
  const move = (st, el, a, b, origin, dur, easing, extra) => anim(st, el, [Object.assign({ transform: a, transformOrigin: origin }, extra), Object.assign({ transform: b, transformOrigin: origin }, extra)], { duration: dur, easing });
  const fade = (st, el, stops, dur) => anim(st, el, stops.map(([offset, opacity]) => ({ offset, opacity })), { duration: dur, easing: 'linear' });

  // ---- carry: the page grows out of the card (non-uniform scale from the card's box to the page's), a veil of the
  // page's own colour rides with it and clears once it is mostly open (so a page that re-renders while it opens
  // is never seen squeezed), a picture of the card rides on top and fades, the shared pieces fly to their place
  function veil(st, F, panel) {
    const v = document.createElement('div');
    v.className = 'cx-ghost k-skip'; v.setAttribute('aria-hidden', 'true');
    if (!st.vs) { const cs = getComputedStyle(panel); st.vs = { bg: clear(cs.backgroundColor) ? 'var(--paper)' : cs.backgroundColor, r: cs.borderRadius }; }
    v.style.cssText = 'left:' + F.left + 'px;top:' + F.top + 'px;width:' + F.width + 'px;height:' + F.height + 'px;background:' + st.vs.bg + ';border-radius:' + st.vs.r + ';';
    layer().appendChild(v); st.ghosts.push(v);
    return v;
  }
  const boxT = (A, F) => 'translate(' + (A.left - F.left) + 'px,' + (A.top - F.top) + 'px) scale(' + (A.width / F.width) + ',' + (A.height / F.height) + ')';
  function openCarry(spec, root, st, x) {
    const panel = spec.panel(root), back = spec.back(root);
    if (!panel) return;
    mark(st, root === H ? null : root, panel, back);
    const F = panel.getBoundingClientRect();
    if (!visible(F)) { stop(st); return; }
    const O = x.cardRect;
    st.F = F; st.origin = { card: x.card, sig: x.sig, rect: O, fixed: !!x.card.closest('.c360-tabbar, header, .c360-mnav, [class*="dock"]') };
    // everything measured first (an animation, once started, moves what it touches)
    let cs = null, pairs = [];
    const src = x.card.isConnected ? x.card : refind({ card: null, sig: x.sig });
    try { cs = src ? snap(src, { rect: src === x.card ? O : src.getBoundingClientRect() }) : null; } catch (e) { cs = null; oops(e); }
    if (cs) { pairs = sharedPairs(cs, panel, F); pairs.forEach((p) => { p.toRect = p.to.getBoundingClientRect(); }); }
    // a card that stays put (a button of the bottom bar, the menu bar): its way back is pictured now, while it is on
    // screen, so closing asks the page for nothing (the bottom bar is away while the menu is open)
    if (cs && st.origin.fixed) {
      try {
        const pre = snap(src, { rect: O });
        const pp = sharedPairs(pre, panel, F).map((p) => ({ src: p.to, rect: p.to.getBoundingClientRect(), into: p.from, avatar: p.avatar }));
        pp.forEach((p) => { p.fl = snapLeaf(p.src, p.rect); });
        st.pre = { cs: pre, pairs: pp.filter((p) => p.fl) };
      } catch (e) { st.pre = null; oops(e); }
    }
    veil(st, F, panel).remove(); // its colour, read once
    const from = boxT(O, F);
    anim(st, panel, [{ transform: from, transformOrigin: '0 0' }, { transform: 'none', transformOrigin: '0 0' }], { duration: T_OPEN, easing: E_OPEN });
    if (back) anim(st, back, [{ opacity: 0 }, { opacity: 1 }], { duration: T_OPEN, easing: 'ease-out' });
    if (spec.hold) anim(st, root, [{ opacity: 1 }, { opacity: 1 }], { duration: T_OPEN });
    const v = veil(st, F, panel);
    move(st, v, from, 'none', '0 0', T_OPEN, E_OPEN); fade(st, v, [[0, 1], [0.3, 1], [0.72, 0], [1, 0]], T_OPEN);
    if (cs) {
      const L = layer();
      L.appendChild(cs.box); st.ghosts.push(cs.box);
      move(st, cs.box, 'none', 'translate(' + (F.left - O.left) + 'px,' + (F.top - O.top) + 'px)', '0 0', T_OPEN, E_OPEN); fade(st, cs.box, [[0, 1], [0.3, 0], [1, 0]], T_OPEN);
      pairs.forEach((p) => {
        const fl = flier(p.from); L.appendChild(fl); st.ghosts.push(fl);
        const f = flight(p.from.rect, p.toRect, p.avatar);
        move(st, fl, 'none', f.t, f.o, T_OPEN, E_OPEN); fade(st, fl, [[0, 1], [0.8, 1], [1, 0]], T_OPEN);
        fade(st, p.to, [[0, 0], [0.8, 0], [1, 1]], T_OPEN);
      });
      // a page that fills its header a moment later (a contact's sheet loads her name): the pieces take off then,
      // from where the card's picture has got to, and land with the page
      if (!pairs.length) {
        const t0 = now();
        let queued = 0;
        const late = new MutationObserver(() => { if (!queued) queued = requestAnimationFrame(check); });
        const check = () => {
          queued = 0;
          const el = now() - t0;
          if (el > T_OPEN * 0.6 || !cs.box.isConnected) { late.disconnect(); return; }
          const m = new DOMMatrixReadOnly(getComputedStyle(panel).transform);
          const lay = (e) => { const r = e.getBoundingClientRect(); return { left: F.left + (r.left - F.left - m.e) / m.a, top: F.top + (r.top - F.top - m.f) / m.d, width: r.width / m.a, height: r.height / m.d }; };
          const ps = sharedPairs(cs, panel, F, lay);
          if (!ps.length) return;
          late.disconnect();
          const g = new DOMMatrixReadOnly(getComputedStyle(cs.box).transform), gop = parseFloat(getComputedStyle(cs.box).opacity) || 0;
          const rest = Math.max(120, T_OPEN - el), L = layer();
          ps.forEach((p) => {
            const toR = lay(p.to);
            const fl = flier(p.from); L.appendChild(fl); st.ghosts.push(fl);
            const f = flight(p.from.rect, { left: toR.left - g.e, top: toR.top - g.f, width: toR.width, height: toR.height }, p.avatar);
            const gt = 'translate(' + g.e + 'px,' + g.f + 'px)';
            move(st, fl, gt, gt + ' ' + f.t, f.o, rest, E_OPEN); fade(st, fl, [[0, Math.max(gop, 0.5)], [0.25, 1], [0.8, 1], [1, 0]], rest);
            fade(st, p.to, [[0, 0], [0.78, 0], [1, 1]], rest);
          });
        };
        late.observe(panel, { childList: true, subtree: true, characterData: true });
        st.obs.push(late, { disconnect() { cancelAnimationFrame(queued); } });
      }
    }
    done(st, T_OPEN);
    if (spec.ghost === 'page') setTimeout(() => { if (state.get(root) === st && spec.on(root)) keepHead(spec, root, st); }, T_OPEN + 60);
  }
  // a page that disappears at once when it closes (the Mesaje conversation): its header is kept as a picture
  function keepHead(spec, root, st) {
    const panel = spec.panel(root); if (!panel) return;
    const h = spec.head && panel.querySelector(spec.head);
    const F = panel.getBoundingClientRect();
    if (!visible(F)) return;
    st.F = F; st.bg = getComputedStyle(panel).backgroundColor;
    if (!h) { st.head = null; return; }
    try { st.head = snap(h); } catch (e) { st.head = null; }
  }
  function closeCarry(spec, root, st, was) {
    const o = st.origin; if (!o) return false;
    const panel = spec.panel(root), back = spec.back(root);
    const dur = Math.min(T_CLOSE, (spec.maxClose || 1000) - 10);
    const mid = was.t !== 'none';
    const pre = o.fixed && st.pre && !mid && spec.ghost !== 'page' && panel ? st.pre : null;
    st.pre = null;
    const card = pre ? o.card : refind(o);
    if (!card && !o.fixed) return false; // its card is gone (another page now): the portal's own close
    const O = card && !o.fixed ? card.getBoundingClientRect() : o.rect;
    if (!visible(O)) return false;
    let cs = pre ? pre.cs : null;
    if (!pre) try { cs = card ? snap(card, { rect: O }) : null; } catch (e) { cs = null; oops(e); }
    let target = panel, F = st.F, pairs = pre ? pre.pairs : [];
    if (pre) mark(st, root === H ? null : root, panel, back);
    else if (spec.ghost === 'page') {
      // the page itself is gone: a box of its colour with the picture of its header shrinks in its place
      if (!F || !visible(F)) return false;
      const pg = document.createElement('div');
      pg.className = 'cx-ghost k-skip'; pg.setAttribute('aria-hidden', 'true');
      pg.style.cssText = 'left:' + F.left + 'px;top:' + F.top + 'px;width:' + F.width + 'px;height:' + F.height + 'px;background:' + (st.bg || 'var(--paper)') + ';';
      if (st.head) { const hb = st.head.box; hb.style.left = (st.head.rect.left - F.left) + 'px'; hb.style.top = (st.head.rect.top - F.top) + 'px'; pg.appendChild(hb); }
      layer().appendChild(pg); st.ghosts.push(pg); target = pg;
      if (cs && st.head) pairs = matchLeaves(st.head.leaves, cs);
    } else {
      if (!panel) return false;
      mark(st, root === H ? null : root, panel, back);
      // its layout box, and where its shared pieces sit in it (mid-open it is drawn scaled: no pieces fly then)
      const keepT = panel.style.transform; panel.style.transform = 'none';
      F = panel.getBoundingClientRect();
      if (cs && !mid) pairs = sharedPairs(cs, panel, F).map((p) => ({ src: p.to, rect: p.to.getBoundingClientRect(), into: p.from, avatar: p.avatar }));
      panel.style.transform = keepT;
      if (!visible(F)) return false;
      // the pieces are pictured before anything moves
      pairs = pairs.map((p) => Object.assign(p, { fl: snapLeaf(p.src, p.rect) })).filter((p) => p.fl);
    }
    if (spec.hold) anim(st, root, [{ opacity: 1 }, { opacity: 1 }], { duration: dur });
    const to = boxT(O, F);
    if (target === panel) {
      const keep = { visibility: 'visible', pointerEvents: 'none' };
      anim(st, panel, [Object.assign({ transform: was.t, transformOrigin: '0 0' }, keep), Object.assign({ transform: to, transformOrigin: '0 0' }, keep)], { duration: dur, easing: E_CLOSE });
      if (back) anim(st, back, [{ opacity: was.back, visibility: 'visible' }, { opacity: 0, visibility: 'visible' }], { duration: dur, easing: 'ease-in' });
      const v = veil(st, F, panel);
      // the page lands as the card: in the last moment it lets the card's own look through (a button without a
      // background of its own would otherwise end as a dark square)
      move(st, v, was.t, to, '0 0', dur, E_CLOSE); fade(st, v, [[0, mid ? 1 : 0], [0.28, 1], [0.55, 1], [0.9, 0], [1, 0]], dur);
      fade(st, panel, [[0, 1], [0.55, 1], [0.9, 0], [1, 0]], dur);
    } else {
      move(st, target, 'none', to, '0 0', dur, E_CLOSE);
      fade(st, target, [[0, 1], [0.55, 1], [0.9, 0], [1, 0]], dur);
      [...target.children].forEach((c) => fade(st, c, [[0, 1], [0.3, 0], [1, 0]], dur));
    }
    // the card comes back under the shrinking page, its shared pieces flying home
    if (cs) {
      const L = layer();
      L.appendChild(cs.box); st.ghosts.push(cs.box);
      move(st, cs.box, 'translate(' + (F.left - O.left) + 'px,' + (F.top - O.top) + 'px)', 'none', '0 0', dur, E_CLOSE); fade(st, cs.box, [[0, 0], [0.5, 0], [0.9, 1], [1, 1]], dur);
      pairs.forEach((p) => {
        const fl = p.fl || flier(p);
        L.appendChild(fl); st.ghosts.push(fl);
        const f = flight(p.rect, p.into.rect, p.avatar);
        move(st, fl, 'none', f.t, f.o, dur, E_CLOSE); fade(st, fl, [[0, 1], [0.86, 1], [1, 0]], dur);
        fade(st, p.into.node, [[0, 0], [0.86, 0], [1, 1]], dur);
      });
    }
    // the list may still settle while the page comes back (a row drawn again, the bottom bar back): the landing
    // follows the card where it really is, a little more each frame
    if (card && !o.fixed) {
      const t0 = now(), movers = st.ghosts.slice();
      const step = () => {
        st.raf = 0;
        const k = Math.min(1, (now() - t0) / dur);
        const c = card.isConnected ? card : refind(o);
        if (c) {
          const r = c.getBoundingClientRect(), dx = (r.left - O.left) * k, dy = (r.top - O.top) * k;
          if (Math.abs(dx) + Math.abs(dy) > 0.5) movers.forEach((g) => { g.style.translate = dx + 'px ' + dy + 'px'; });
        }
        if (k < 1) st.raf = requestAnimationFrame(step);
      };
      st.raf = requestAnimationFrame(step);
    }
    done(st, dur);
    return true;
  }
  function matchLeaves(heads, cs) {
    const out = [], used = new Set();
    for (const h of heads) {
      if (out.length >= 3) break;
      const m = cs.leaves.find((l) => !used.has(l) && (h.avatar ? l.avatar && l.text === h.text : !l.avatar && h.text.length > 1 && l.text === h.text));
      if (m) { used.add(m); out.push(Object.assign({}, h, { into: m })); }
    }
    return out;
  }
  function snapLeaf(el, r) {
    try {
      const s = snap(el.parentElement || el, { rect: r });
      const box = document.createElement('div');
      box.className = 'cx-ghost cx-fly k-skip'; box.setAttribute('aria-hidden', 'true');
      box.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;';
      const own = s.leaves.find((l) => l.src === el);
      if (!own) return null;
      own.node.style.left = '0'; own.node.style.top = '0';
      box.appendChild(own.node);
      return box;
    } catch (e) { return null; }
  }

  // ---- pop: menus, popovers and dialogs scale out of their button (uniform scale around the button's centre, so the
  // panel starts at the button even when it opens far from it) and back into it
  function popGeom(F, T) {
    const cx = T.left + T.width / 2, cy = T.top + T.height / 2;
    const s = Math.min(0.62, Math.max(0.3, Math.max(T.width / F.width, T.height / F.height)));
    return { o: (cx - F.left) + 'px ' + (cy - F.top) + 'px', s };
  }
  function openPop(spec, root, st, x) {
    const panel = spec.panel(root), back = spec.back(root);
    if (!panel) return;
    mark(st, root, panel, back);
    const F = panel.getBoundingClientRect();
    if (!visible(F)) { stop(st); return; }
    const T = x.rect;
    st.origin = { card: x.el, sig: sigOf(x.el), rect: T, fixed: true, el: x.el };
    st.F = F;
    const g = popGeom(F, T);
    const dur = spec.id === 'dialog' || spec.id === 'ov' ? T_POP + 60 : T_POP;
    move(st, panel, 'scale(' + g.s + ')', 'none', g.o, dur, E_POP); fade(st, panel, [[0, 0], [0.35, 1], [1, 1]], dur);
    if (back) anim(st, back, [{ opacity: 0 }, { opacity: 1 }], { duration: T_POP, easing: 'ease-out' });
    if (spec.hold) anim(st, root, [{ opacity: 1 }, { opacity: 1 }], { duration: T_POP + 60 });
    done(st, T_POP + 60);
  }
  function closePop(spec, root, st, was) {
    const o = st.origin; if (!o) return false;
    let T = o.rect;
    if (o.el && o.el.isConnected) { const r = o.el.getBoundingClientRect(); if (visible(r)) T = r; else if (!visible(T)) return false; }
    let panel = spec.panel(root), back = spec.back(root);
    if (!panel) return false;
    const dur = Math.min(T_POPX, (spec.maxClose || 400) - 10);
    let from = was.t, op = was.op;
    if (spec.ghost === 'clone') {
      // hidden at once (display:none): a copy of it closes in its place, in the same spot of the page
      const k = panel.cloneNode(true);
      k.removeAttribute('hidden'); k.setAttribute('aria-hidden', 'true'); k.inert = true; k.classList.add('cx-ghost-clone', 'k-skip');
      k.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      panel.after(k); st.ghosts.push(k); panel = k; from = 'none'; op = 1;
    } else mark(st, root, panel, back);
    const F = panel.getBoundingClientRect();
    if (!visible(F)) return false;
    const g = popGeom(F, T);
    const keep = { visibility: 'visible', pointerEvents: 'none' };
    move(st, panel, from, 'scale(' + g.s + ')', g.o, dur, E_EXIT, keep); fade(st, panel, [[0, op], [1, 0]], dur);
    if (back) anim(st, back, [{ opacity: was.back }, { opacity: 0 }], { duration: dur, easing: 'linear' });
    if (spec.hold) anim(st, root, [{ opacity: 1 }, { opacity: 1 }], { duration: dur });
    done(st, dur);
    return true;
  }

  function opened(spec, root) {
    if (reduced() || (spec.when && !spec.when())) return;
    const x = trigger();
    if (!x) return;
    stop(state.get(root));
    const st = { anims: [], ghosts: [], marked: [], obs: [], timer: 0 };
    state.set(root, st);
    let kind = spec.kind;
    if (kind === 'auto') kind = x.card !== x.el && x.cardRect.width >= 120 ? 'carry' : 'pop';
    st.kind = kind;
    const t0 = now();
    try { (kind === 'carry' ? openCarry : openPop)(spec, root, st, x); } catch (e) { oops(e); stop(st); state.delete(root); }
    if (window.C360Motion && window.C360Motion.debug) console.log('[motion] open ' + spec.id + ' ' + kind + ' ' + (now() - t0).toFixed(1) + 'ms');
  }
  function closed(spec, root) {
    const st = state.get(root);
    if (!st || !st.origin) return;
    if (reduced() || (spec.when && !spec.when())) { stop(st); st.origin = null; return; }
    // where the page is right now: only while its opening still runs is that anything but its open state
    // (read before the opening stops, and without asking for styles otherwise: that would start the CSS close too)
    const panel = spec.panel(root), back = spec.back(root);
    const live = (el) => !!el && st.anims.some((a) => a.effect && a.effect.target === el && a.playState === 'running');
    const was = { t: 'none', op: 1, back: 1 };
    if (panel && live(panel)) { const cs = getComputedStyle(panel); was.t = cs.transform || 'none'; was.op = parseFloat(cs.opacity); if (isNaN(was.op)) was.op = 1; }
    if (live(back)) was.back = parseFloat(getComputedStyle(back).opacity);
    stop(st);
    let ok = false;
    const t0 = now();
    try { ok = (st.kind === 'carry' ? closeCarry : closePop)(spec, root, st, was); } catch (e) { ok = false; oops(e); }
    if (window.C360Motion && window.C360Motion.debug) console.log('[motion] close ' + spec.id + ' ' + (now() - t0).toFixed(1) + 'ms');
    if (!ok) stop(st);
    st.origin = null;
  }

  // ------------------------------------------------------------------ tabs and sub-tabs: a short slide in the direction of the move
  let pend = null; // a section change about to happen: its direction and the page that leaves
  const navIndex = (tab) => [...document.querySelectorAll('#tabsNav button[data-tab]')].filter((b) => !b.classList.contains('hidden')).findIndex((b) => b.dataset.tab === tab);
  const activePanel = () => document.querySelector('main > .panel.active');
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    const nb = e.target.closest('#tabsNav button[data-tab], .c360-tabbar button[data-go], [data-go]');
    const ap = activePanel();
    if (nb && ap) {
      const to = nb.dataset.tab || nb.dataset.go;
      const from = ap.id.replace('panel-', '');
      let dir = 0;
      const bar = nb.closest('.c360-tabbar');
      if (bar) {
        const bs = [...bar.querySelectorAll('button')];
        const i = bs.indexOf(nb), j = bs.findIndex((b) => b.classList.contains('is-on'));
        dir = i >= 0 && j >= 0 ? Math.sign(i - j) : 0;
      }
      if (!dir) { const i = navIndex(to), j = navIndex(from); dir = i >= 0 && j >= 0 ? Math.sign(i - j) : 0; }
      pend = { t: now(), dir, from: ap, rect: ap.getBoundingClientRect(), display: getComputedStyle(ap).display };
    }
    // a sub-tab: what the click draws new in this page slides in from its side
    const sb = e.target.closest('.k-seg > button, [role="tab"]');
    if (sb && ap && ap.contains(sb) && !sb.closest('form, .k-drawer-root, .pl-drawer-root')) {
      const bs = [...sb.parentElement.children].filter((b) => b.tagName === 'BUTTON' || b.getAttribute('role') === 'tab');
      const i = bs.indexOf(sb), j = bs.findIndex((b) => b.classList.contains('is-on') || b.classList.contains('active') || b.getAttribute('aria-selected') === 'true');
      if (i === j || reduced()) return;
      const dir = i >= 0 && j >= 0 ? Math.sign(i - j) : 0;
      const before = new Set(ap.querySelectorAll('*'));
      requestAnimationFrame(() => subSlide(ap, before, dir));
    }
  }, true);
  const NAMES = new Set(['n-rise', 'n-panel', 'sx-rise', 'sx-panel']);
  // the portal's own entrance (fade and rise) gives way to the slide, so nothing moves twice
  const quiet = (el) => { if (el.getAnimations) el.getAnimations().forEach((a) => { if (NAMES.has(a.animationName)) a.finish(); }); };
  // a piece with an entrance of its own (the KPI tiles, the numbers that count up) keeps it: nothing moves twice
  const ownEntrance = (el) => el.getAnimations && el.getAnimations().some((a) => a.animationName && !NAMES.has(a.animationName) && a.playState === 'running');
  function slideIn(els, dir, delay) {
    const dx = dir * 28;
    els.forEach(quiet);
    els.filter((el) => !ownEntrance(el)).slice(0, 8).forEach((el, k) => {
      el.animate([{ opacity: 0, transform: 'translate3d(' + dx + 'px,0,0)' }, { opacity: 1, transform: 'none' }], { duration: T_TAB, delay: (delay || 0) + Math.min(k, 5) * 16, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    });
  }
  const SEG = '.k-seg, [role="tablist"]';
  function subSlide(panel, before, dir) {
    if (!panel.classList.contains('active')) return;
    const roots = [];
    // the new pieces: the top of each new subtree; one that holds the tabs themselves is opened up (the tabs stay)
    const take = (el, depth) => {
      if (roots.length > 12 || depth > 4) return;
      const disp = getComputedStyle(el);
      if (el.matches(SEG) || el.closest(SEG)) { quiet(el); return; }
      if (disp.display === 'contents' || el.querySelector(SEG)) { quiet(el); [...el.children].forEach((c) => take(c, depth + 1)); return; }
      if (disp.position === 'fixed') return;
      const r = el.getBoundingClientRect();
      if (r.height < 8 || r.bottom < 0 || r.top > VP.h) return;
      roots.push(el);
    };
    for (const el of panel.querySelectorAll('*')) {
      if (before.has(el)) continue;
      const p = el.parentElement;
      if (p !== panel && !before.has(p)) continue; // only the top of each new piece
      take(el, 0);
    }
    slideIn(roots, dir || 0);
  }
  let out = null;
  function tabSwitch(nw, old) {
    if (reduced() || H.classList.contains('sx-boot') || !H.querySelector('#app:not(.hidden)')) return;
    const p = pend && now() - pend.t < 700 ? pend : null;
    pend = null;
    let dir = p ? p.dir : 0;
    if (!p) { const i = navIndex(nw.id.replace('panel-', '')), j = old ? navIndex(old.id.replace('panel-', '')) : -1; dir = i >= 0 && j >= 0 ? Math.sign(i - j) : 0; if (!last || now() - last.t > 1500) return; }
    quiet(nw);
    // the page that leaves stays a moment where it was, fading to the other side
    if (out) { out.el.classList.remove('cx-out'); out.el.style.cssText = out.css; out = null; }
    if (p && p.from === old && old && visible(p.rect)) {
      const css = old.style.cssText;
      old.classList.add('cx-out');
      // inline and important: some pages hide themselves hard once they are not the active one
      const set = (k, v) => old.style.setProperty(k, v, 'important');
      set('display', p.display === 'none' ? 'block' : p.display); set('position', 'fixed'); set('left', p.rect.left + 'px'); set('top', p.rect.top + 'px');
      set('width', p.rect.width + 'px'); set('margin', '0'); set('z-index', '4'); set('pointer-events', 'none');
      const o = { el: old, css };
      out = o;
      const a = old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translate3d(' + (-dir * 16) + 'px,0,0)' }], { duration: 120, easing: 'cubic-bezier(.3,0,.8,.6)', fill: 'forwards' });
      const end = () => { if (out === o) { old.classList.remove('cx-out'); old.style.cssText = css; out = null; } a.cancel(); };
      a.onfinish = end; setTimeout(end, 400);
    }
    slideIn([...nw.children].filter((c) => getComputedStyle(c).position !== 'fixed'), dir, p ? 60 : 0);
  }

  // ------------------------------------------------------------------ one observer for all of it
  const strip = (v) => String(v || '').split(/\s+/).filter((c) => c && c.slice(0, 3) !== 'cx-').sort().join(' ');
  let swOld = null;
  const mo = new MutationObserver((recs) => {
    let swNew = null;
    for (const r of recs) {
      const t = r.target;
      if (r.attributeName === 'class' && strip(r.oldValue) === strip(t.className && t.className.baseVal != null ? t.className.baseVal : t.className)) continue;
      if (t.parentElement && t.parentElement.tagName === 'MAIN' && t.classList.contains('panel') && r.attributeName === 'class') {
        const was = /(^|\s)active(\s|$)/.test(r.oldValue || ''), is = t.classList.contains('active');
        if (is && !was) swNew = t; else if (was && !is) swOld = t;
      }
      for (const spec of SPECS) {
        if (spec.attr ? r.attributeName !== spec.attr : r.attributeName !== 'class') continue;
        if (!spec.match(t)) continue;
        let was;
        if (spec.attr === 'hidden') was = r.oldValue === null;
        else was = new RegExp('(^|\\s)' + (spec.cls || 'is-open') + '(\\s|$)').test(r.oldValue || '');
        const is = spec.on(t);
        if (is && !was) opened(spec, t);
        else if (was && !is) closed(spec, t);
      }
    }
    if (swNew) { try { tabSwitch(swNew, swOld); } catch (e) { /* motion only */ } swOld = null; }
  });
  mo.observe(H, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'hidden'] });
  // the Mesaje conversation's header is pictured again just before she leaves it (the name may have loaded since)
  document.addEventListener('pointerdown', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('.mx-thread-col')) return;
    const root = e.target.closest('.panel.mx'); const st = root && state.get(root);
    if (st && st.origin) keepHead(SPECS.find((s) => s.id === 'mx'), root, st);
  }, true);

  window.C360Motion = {
    // a caller that knows what opened the next overlay (K.drawer({ from }), K.ui.confirm({ from }))
    from(el) { if (el instanceof Element) note(el); },
    get reduced() { return reduced(); },
  };
})();
