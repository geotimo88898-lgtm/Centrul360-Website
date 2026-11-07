// Centrul360 portal, aspectul nou: limbajul adminului Summitlane pe tot portalul (doar sub html.ui-nou), în culoarea accentului ales.
// Camera: grila fixă pe tot adminul, două lumini care se mișcă lent și praf în lumină (doar pe calculator); firul de lumină cu
// impulsul care coboară prin pagină; progresul derulării ca o bandă în bara de sus; prisma de sticlă (logoul Centrul360) lângă
// titlul fiecărui ecran; explozia „+N lei” la o încasare nouă. Pe telefon (varianta lite): nimic pe cadru, doar transform și opacity.
// Citește doar DOM-ul portalului; nu schimbă date și nici comportament.
(function () {
  'use strict';
  var D = document, H = D.documentElement;
  if (!H.classList.contains('ui-nou')) return;
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FINE = window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches;
  var LITE = RM || !FINE || innerWidth < 900;
  H.classList.add(LITE ? 'sx-lite' : 'sx-fine');
  var calm = function () { return RM || H.classList.contains('c360-reduce'); };
  var $ = function (s, r) { return (r || D).querySelector(s); };

  // ------------------------------------------------------------------ the room: grid, two drifting lights in the accent, dust
  function room() {
    if ($('.sx-amb')) return;
    var a = D.createElement('div'); a.className = 'sx-amb'; a.setAttribute('aria-hidden', 'true');
    var h = '<div class="g"></div><div class="o o1"></div><div class="o o2"></div>';
    if (!LITE) for (var i = 0; i < 22; i++) {
      h += '<i class="d" style="left:' + (Math.random() * 100).toFixed(1) + '%;top:' + (20 + Math.random() * 80).toFixed(1) + '%;--t:' + (10 + Math.random() * 14).toFixed(1) + 's;--dl:-' + (Math.random() * 20).toFixed(1) +
        's;--x:' + (Math.random() * 80 - 40).toFixed(0) + 'px;--a:' + (0.15 + Math.random() * 0.45).toFixed(2) + '"></i>';
    }
    a.innerHTML = h; D.body.insertBefore(a, D.body.firstChild);
    var t = D.createElement('div'); t.className = 'sx-thread'; t.setAttribute('aria-hidden', 'true'); D.body.appendChild(t);
    var p = D.createElement('div'); p.className = 'sx-prog'; p.setAttribute('aria-hidden', 'true'); D.body.appendChild(p);
    var pend = false;
    addEventListener('scroll', function () {
      if (pend) return; pend = true;
      requestAnimationFrame(function () { pend = false; var m = H.scrollHeight - innerHeight; p.style.transform = 'scaleX(' + (m > 0 ? Math.min(1, scrollY / m) : 0).toFixed(4) + ')'; });
    }, { passive: true });
    edges(); addEventListener('resize', edges, { passive: true });
    setTimeout(edges, 800);
  }
  // where the side menu ends and the top bar ends (the thread runs along the menu's edge, the progress under the bar)
  function edges() {
    var nav = $('nav.tabs'), top = $('header.topbar');
    var side = nav && innerWidth > 1023 ? Math.max(0, nav.getBoundingClientRect().right) : 0;
    var tb = top ? Math.max(0, top.getBoundingClientRect().bottom) : 0;
    H.style.setProperty('--sx-side', side.toFixed(0) + 'px');
    H.style.setProperty('--sx-top', tb.toFixed(0) + 'px');
  }

  // ------------------------------------------------------------------ the prism at the head of every screen: the Centrul360 mark in glass,
  // a beam of white light comes in, a fan of the accent's tones goes out; on a computer it leans toward the cursor
  var uid = 0;
  function prismEl() {
    var id = 'sxpg' + (++uid);
    var el = D.createElement('span'); el.className = 'sx-pr'; el.setAttribute('aria-hidden', 'true');
    var fan = '';
    for (var i = 0; i < 7; i++) fan += '<i style="--i:' + i + '"></i>';
    el.innerHTML = '<i class="bm"></i><span class="fan">' + fan + '</span><i class="glow"></i><span class="body"><span class="spin">' +
      '<svg viewBox="130 130 550 550" fill="none"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".5" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity=".7"/></linearGradient></defs>' +
      '<circle cx="405" cy="405" r="262" fill="rgba(255,255,255,.05)" stroke="url(#' + id + ')" stroke-width="16"/>' +
      '<ellipse cx="405" cy="405" rx="104" ry="207" stroke="url(#' + id + ')" stroke-width="14"/><ellipse cx="405" cy="405" rx="207" ry="113" stroke="url(#' + id + ')" stroke-width="14"/>' +
      '<circle class="sheen" cx="405" cy="405" r="262" stroke="var(--accent,#2fd6c3)" stroke-width="16" opacity=".15"/></svg></span></span>';
    return el;
  }
  function prisms() {
    Array.prototype.forEach.call(D.querySelectorAll('.panel .k-head h2:not([data-sxpr]), .panel .pl-head h2:not([data-sxpr])'), function (h2) {
      h2.setAttribute('data-sxpr', '1');
      var pr = prismEl(); h2.appendChild(pr);
      requestAnimationFrame(function () { requestAnimationFrame(function () { pr.classList.add('on'); }); });
    });
  }
  if (!LITE) {
    var mx = 0.5, my = 0.5, raf = 0;
    addEventListener('pointermove', function (e) {
      mx = e.clientX / innerWidth; my = e.clientY / innerHeight;
      if (!raf) raf = requestAnimationFrame(function () {
        raf = 0;
        var p = $('main > .panel.active .sx-pr .body'); if (!p) return;
        p.style.setProperty('--rx', ((mx - 0.5) * 40).toFixed(1) + 'deg'); p.style.setProperty('--ry', ((0.5 - my) * 26).toFixed(1) + 'deg');
      });
    }, { passive: true });
  }

  // ------------------------------------------------------------------ money: the burst when a payment arrives (called by portal-summit-stage.js)
  function cash(text, from) {
    if (calm()) return;
    var b = D.createElement('div'); b.className = 'sx-cash'; b.setAttribute('aria-hidden', 'true');
    var sparks = '', n = LITE ? 10 : 26;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + Math.random() * 0.3, r = 90 + Math.random() * 140;
      sparks += '<i style="--k:' + (i % 3) + ';--x:' + (Math.cos(a) * r).toFixed(0) + 'px;--y:' + (Math.sin(a) * r * 0.7).toFixed(0) + 'px;animation-delay:' + (Math.random() * 0.12).toFixed(2) + 's"></i>';
    }
    b.innerHTML = '<b>+' + String(text).replace(/[<>&]/g, '') + '</b>' + (from ? '<small>' + String(from).replace(/[<>&]/g, '') + '</small>' : '') + sparks;
    var ring = D.createElement('div'); ring.className = 'sx-ring';
    D.body.appendChild(ring); D.body.appendChild(b);
    setTimeout(function () { b.remove(); ring.remove(); }, 2400);
  }
  window.C360Fx = { cash: cash, lite: LITE };

  function start() {
    room();
    prisms();
    new MutationObserver(function () { clearTimeout(start._t); start._t = setTimeout(prisms, 60); }).observe(D.querySelector('main') || D.body, { childList: true, subtree: true });
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();
})();
