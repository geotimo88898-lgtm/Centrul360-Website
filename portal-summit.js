// Centrul360 portal, aspectul nou, stratul „Summit” (doar sub html.ui-nou): intrarea cinematică și tăieturile între ecrane.
// Intrarea rulează la FIECARE deschidere (regula lui George pentru toate adminele): logoul se formează din lumină (inelul și cele două
// elipse se rotesc în poziție ca un giroscop), Nuki apare discret în centru, apoi o tranziție lină spre Panou. Foarte curată (George).
// Scurtă (sub 2 secunde), „Sari” sau o atingere oriunde o oprește. Doar transform și opacity.
(function () {
  'use strict';
  var html = document.documentElement;
  if (!html.classList.contains('ui-nou')) return;
  var calm = function () { return html.classList.contains('c360-reduce') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };

  // ------------------------------------------------------------------ the intro
  function intro() {
    var el = document.createElement('div');
    el.className = 'sx-intro';
    el.setAttribute('role', 'presentation');
    el.innerHTML =
      '<div class="sx-i-core">' +
        '<div class="sx-i-glow"></div>' +
        '<svg viewBox="130 130 550 550" fill="none" stroke="currentColor" aria-hidden="true">' +
          '<circle class="sx-i-ring" cx="405" cy="405" r="262" stroke-width="2.2" vector-effect="non-scaling-stroke"/>' +
          '<ellipse class="sx-i-ev" cx="405" cy="405" rx="104" ry="207" stroke-width="2" vector-effect="non-scaling-stroke"/>' +
          '<ellipse class="sx-i-eh" cx="405" cy="405" rx="207" ry="113" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>' +
        '<img class="sx-i-nuki" alt="" decoding="async" src="/brand_asset/mascota/ipostaze/salut-pa.webp">' +
        '<div class="sx-i-wm"><b>CENTRUL360</b>.COM</div>' +
      '</div>' +
      '<button type="button" class="sx-i-skip" data-intro-skip>Sari</button>';
    document.body.appendChild(el);
    html.classList.remove('sx-boot');
    var done = false;
    var end = function () {
      if (done) return; done = true;
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 650);
    };
    el.addEventListener('pointerdown', end);
    el.addEventListener('keydown', end);
    setTimeout(end, calm() ? 250 : 1900);
  }

  // ------------------------------------------------------------------ the cut between screens
  var sweep = null, last = null;
  function cut(panel) {
    if (!panel || panel === last) return;
    last = panel;
    if (calm()) return;
    var kids = panel.children;
    for (var i = 0; i < kids.length && i < 8; i++) kids[i].style.setProperty('--sx-i', i);
    panel.classList.remove('sx-in'); void panel.offsetWidth; panel.classList.add('sx-in');
    clearTimeout(panel._sx); panel._sx = setTimeout(function () { panel.classList.remove('sx-in'); }, 1300);
    if (!sweep) { sweep = document.createElement('div'); sweep.className = 'sx-sweep'; document.body.appendChild(sweep); }
    var h = document.querySelector('header.topbar');
    sweep.style.top = (h ? Math.max(0, h.getBoundingClientRect().bottom) : 0) + 'px';
    sweep.classList.remove('go'); void sweep.offsetWidth; sweep.classList.add('go');
  }
  function watch() {
    var main = document.querySelector('main');
    if (!main) return;
    last = main.querySelector(':scope > .panel.active');
    new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var t = list[i].target;
        if (t.classList && t.classList.contains('panel') && t.classList.contains('active') && t.parentNode === main) { cut(t); return; }
      }
    }).observe(main, { attributes: true, attributeFilter: ['class'], subtree: false, childList: false });
    // the panels are main's children: watch each one's class
    Array.prototype.forEach.call(main.children, function (p) {
      if (!p.classList.contains('panel')) return;
      new MutationObserver(function () { if (p.classList.contains('active')) cut(p); }).observe(p, { attributes: true, attributeFilter: ['class'] });
    });
  }

  function start() { intro(); watch(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
