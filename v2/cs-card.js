/* Cardul de Sărbători: the card's life on its page and on the home page.
   - the name on the card changes softly (Pentru tine, Pentru mama, ...) until a page chooses one (CSC.name)
   - on a computer the card leans towards the pointer
   - the cards left: 100 minus the real reservations not cancelled (/api/card-sarbatori); nothing is shown without it
   - the time left until 24 December 2026, 23:59 (Romania), every second */
(function () {
  'use strict';
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DEADLINE = Date.parse('2026-12-24T21:59:59Z');
  var NAMES = ['Pentru tine', 'Pentru mama', 'Pentru sora ta', 'Pentru prietena ta'];
  var CSC = window.CSC = { state: null, subs: [], fixed: false };

  // ---- the name on the card
  function setName(el, text) {
    if (el.textContent === text) return;
    if (reduce) { el.textContent = text; return; }
    el.classList.add('out');
    setTimeout(function () {
      el.textContent = text; el.classList.remove('out'); el.classList.add('pre');
      void el.offsetWidth; el.classList.remove('pre');
    }, 380);
  }
  CSC.name = function (text) { CSC.fixed = true; $$('[data-csc-name]').forEach(function (el) { setName(el, text); }); };
  var ni = 0;
  if ($$('[data-csc-name]').length) setInterval(function () {
    if (CSC.fixed || document.hidden) return;
    ni = (ni + 1) % NAMES.length;
    $$('[data-csc-name]').forEach(function (el) { setName(el, NAMES[ni]); });
  }, 3200);

  // ---- leans towards the pointer (a mouse only)
  if (!reduce && matchMedia('(hover: hover) and (pointer: fine)').matches) $$('.csc-stage').forEach(function (st) {
    var t = st.querySelector('.csc-tilt'); if (!t) return;
    st.addEventListener('pointermove', function (e) {
      var r = st.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      t.style.setProperty('--ry', (x * 14).toFixed(2) + 'deg'); t.style.setProperty('--rx', (-y * 12).toFixed(2) + 'deg');
    });
    st.addEventListener('pointerleave', function () { t.style.setProperty('--ry', '0deg'); t.style.setProperty('--rx', '0deg'); });
  });

  // ---- the cards left
  CSC.on = function (fn) { CSC.subs.push(fn); if (CSC.state) fn(CSC.state); };
  CSC.set = function (s) {
    CSC.state = s;
    $$('[data-cs-left]').forEach(function (el) { el.textContent = String(s.left); });
    $$('[data-cs-bar]').forEach(function (el) { el.style.setProperty('--k', (s.left / s.total).toFixed(3)); });
    $$('[data-cs-live]').forEach(function (el) { el.hidden = false; });
    CSC.subs.forEach(function (fn) { try { fn(s); } catch (e) {} });
  };
  fetch('/api/card-sarbatori').then(function (r) { if (!r.ok) throw new Error('card'); return r.json(); }).then(function (d) {
    if (d && typeof d.left === 'number') CSC.set(d);
  }).catch(function () {});

  // ---- the time left
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  function clock() {
    var ms = Math.max(0, DEADLINE - Date.now()), s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    $$('[data-cs-time]').forEach(function (el) { el.textContent = ms ? d + 'z ' + two(h) + 'h ' + two(m) + 'm ' + two(x) + 's' : 'încheiată'; });
    $$('[data-cs-cd]').forEach(function (el) {
      var put = function (k, v) { var b = el.querySelector('[data-' + k + ']'); if (b && b.textContent !== v) b.textContent = v; };
      put('d', String(d)); put('h', two(h)); put('m', two(m)); put('s', two(x));
    });
    CSC.ended = !ms;
  }
  clock(); setInterval(clock, 1000);
})();
