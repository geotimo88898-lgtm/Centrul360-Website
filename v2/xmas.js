/* Christmas on the preview site (v2/xmas.css): the snow of the first screen of each page. Only under html.xmas (the shell
   sets it until 7 January 2027), never with reduced motion; few flakes on a phone. The card's own pages have theirs. */
(function () {
  'use strict';
  // the cards start at 490 lei since 22.11 (the 290 one is out of sale): the menu's pill and the home page's pill, until the
  // pages are written again (v2/src has it already)
  try {
    [].slice.call(document.querySelectorAll('.xm-pill, .pill')).forEach(function (el) {
      var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), t;
      while ((t = w.nextNode())) if (t.nodeValue.indexOf('de la 290 lei') >= 0) t.nodeValue = t.nodeValue.replace('de la 290 lei', 'de la 490 lei');
    });
  } catch (e) {}
  if (!document.documentElement.classList.contains('xmas') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var hero = document.querySelector('main > section.hero:not(.csc-xmas)');
  if (!hero) return;
  var FLAKE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10"/><path d="M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5"/></svg>';
  var DOT = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>';
  var TINTS = ['rgba(201,160,74,.6)', 'rgba(217,73,127,.45)', 'rgba(20,165,150,.4)', 'rgba(227,194,122,.65)'];
  var wide = innerWidth > 920, n = wide ? 22 : 9, html = '';
  for (var i = 0; i < n; i++) {
    var dot = i % 3 === 2, s = dot ? 4 + Math.random() * 4 : 9 + Math.random() * 9;
    html += '<i style="left:' + (wide ? 54 + Math.random() * 46 : Math.random() * 100).toFixed(1) + '%;--s:' + s.toFixed(1) + 'px;--d:' + (14 + Math.random() * 12).toFixed(1) +
      's;--w:-' + (Math.random() * 24).toFixed(1) + 's;--x:' + (Math.random() * 50 - 25).toFixed(0) + 'px;--o:' + (dot ? 0.7 : 0.85) + ';--c:' + TINTS[i % TINTS.length] + '">' + (dot ? DOT : FLAKE) + '</i>';
  }
  var box = document.createElement('div'); box.className = 'xm-snow'; box.setAttribute('aria-hidden', 'true'); box.innerHTML = html;
  hero.insertBefore(box, hero.firstChild);
  var size = function () { box.style.setProperty('--h', (box.offsetHeight + 30) + 'px'); };
  size(); addEventListener('resize', size);
})();
