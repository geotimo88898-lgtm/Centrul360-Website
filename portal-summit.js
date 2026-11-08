// Centrul360 portal, aspectul nou, stratul „Summit” (doar sub html.ui-nou): intrarea cinematică și tăieturile între ecrane.
// Intrarea rulează la FIECARE deschidere, la toate rolurile (regula lui George pentru toate adminele), ca la adminul Summitlane: logoul
// se desenează din linie și se umple, o dungă de lumină în accent îl taie, numele iese din blur, un rând scurt sub el; la final logoul
// zboară în prisma ecranului și negrul se ridică lin, abia când ecranul e gata. „Sari peste” sau o atingere: un fade lin.
(function () {
  'use strict';
  var html = document.documentElement;
  if (!html.classList.contains('ui-nou')) return;
  var calm = function () { return html.classList.contains('c360-reduce') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };

  // ------------------------------------------------------------------ the intro (every opening, every role), as the Summitlane admin's
  // the mark draws from a line and fills, a stroke of light in the accent cuts it, „Centrul360” comes out of a blur, a short line under
  // it; it holds, then (once the screen is ready, at most 6 s from the start) the mark flies into the prism at the screen's title and the
  // black lifts. „Sari peste”, a tap or Esc: one gentle fade.
  function intro() {
    var D = document;
    var word = 'Centrul360'.split('').map(function (c, i) { return '<span style="--i:' + i + '">' + c + '</span>'; }).join('');
    var mark = function (cls, w) { return '<circle class="' + cls + '" pathLength="1" cx="405" cy="405" r="262"' + w + '/><ellipse class="' + cls + ' e1" pathLength="1" cx="405" cy="405" rx="104" ry="207"' + w + '/><ellipse class="' + cls + ' e2" pathLength="1" cx="405" cy="405" rx="207" ry="113"' + w + '/>'; };
    var ov = D.createElement('div');
    ov.className = 'sx-intro'; ov.setAttribute('aria-hidden', 'true');
    ov.innerHTML = '<div class="ibg"></div><div class="iA"><div class="sweep"></div>' +
      '<svg class="imark" viewBox="130 130 550 550"><defs><linearGradient id="sxig" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" style="stop-color:var(--accent,#2fd6c3)"/></linearGradient></defs>' +
      mark('fl', ' vector-effect="non-scaling-stroke"') + mark('ol', ' vector-effect="non-scaling-stroke"') +
      '<path class="cut" pathLength="1" d="M190 640 L640 190" vector-effect="non-scaling-stroke"/></svg>' +
      '<div class="iword">' + word + '</div></div>' +
      '<button type="button" class="skip">Sari peste</button>';
    D.body.appendChild(ov);
    html.classList.remove('sx-boot');
    if (calm()) { setTimeout(function () { ov.remove(); }, 250); return; }
    var done = false, t0 = Date.now(), EASE = 'cubic-bezier(.45,0,.2,1)';
    var q = function (s) { return ov.querySelector(s); };
    function fade(el, ms, delay, to) { return el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: to || 'none' }], { duration: ms, delay: delay || 0, easing: EASE, fill: 'forwards' }); }
    // ready: the portal's data is here and the open screen has drawn (no skeleton left)
    function ready() { var p = D.querySelector('main > .panel.active'); return !!(window.K && window.K.data) && !!p && !p.querySelector('.k-skel, .sk'); }
    function target() {
      var el = D.querySelector('main > .panel.active .sx-p-logo') || D.querySelector('main > .panel.active .sx-pr .body');
      if (!el) return null; var r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.height };
    }
    function auto() { if (done) return; var ok = false; try { ok = ready(); } catch (e) {} if (ok || Date.now() - t0 > 6000) end(false); else setTimeout(auto, 100); }
    function end(quick) {
      if (done) return; done = true;
      removeEventListener('keydown', esc);
      ov.style.pointerEvents = 'none'; // the page under it answers at once
      if (!ov.animate) { ov.remove(); return; }
      var L = [];
      if (quick) L.push(fade(ov, 480));
      else {
        // the name leaves first, the mark flies into the prism and fades as it lands, the black lifts under it
        Array.prototype.forEach.call(ov.querySelectorAll('.iword'), function (e) { L.push(fade(e, 520, 0, 'translateY(-8px)')); });
        L.push(fade(q('.skip'), 300));
        var tg = null; try { tg = target(); } catch (e) {}
        var m = q('.imark');
        if (tg) {
          var r = m.getBoundingClientRect(), k = tg.size / r.height;
          L.push(m.animate([{ transform: 'none', opacity: 1 }, { opacity: 1, offset: 0.7 }, { transform: 'translate(' + (tg.x - (r.left + r.width / 2)) + 'px,' + (tg.y - (r.top + r.height / 2)) + 'px) scale(' + k + ')', opacity: 0 }],
            { duration: 1050, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'forwards' }));
        } else L.push(fade(m, 700, 120, 'scale(1.06)'));
        L.push(fade(q('.ibg'), 900, 260));
      }
      var gone = false, drop = function () { if (gone) return; gone = true; ov.remove(); };
      Promise.all(L.map(function (x) { return x.finished; })).then(drop, drop);
      setTimeout(drop, quick ? 1200 : 2200); // a safety net if a browser never reports the end
    }
    function esc(e) { if (e.key === 'Escape') end(true); }
    q('.skip').addEventListener('click', function (e) { e.stopPropagation(); end(true); });
    ov.addEventListener('click', function () { end(true); });
    addEventListener('keydown', esc);
    setTimeout(auto, 3200); // the name is written by 2.7 s, then the mark and the name hold half a second
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
