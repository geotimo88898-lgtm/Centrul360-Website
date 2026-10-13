/* Phones: like an app. A bar at the bottom with the 4 main sections of this account (Panou, Pipeline,
   Mesaje, Calendar, or what the account has instead) and "Meniu", which opens the whole grouped menu
   as a sheet above it. The desktop sidebar is untouched. Purely presentational: every button forwards
   to the menu's own button (portal-core decides what each one opens), badges included. */
(function () {
  'use strict';
  var nav = document.getElementById('tabsNav');
  if (!nav) return;
  var MOBILE = window.matchMedia('(max-width:720px)');

  var bar = document.createElement('button');
  bar.type = 'button';
  bar.className = 'c360-mnav';
  bar.setAttribute('aria-haspopup', 'true');
  bar.setAttribute('aria-expanded', 'false');
  bar.innerHTML = '<span class="c360-mnav-icon" aria-hidden="true"><i></i><i></i><i></i></span>' +
    '<span class="c360-mnav-label">Meniu</span>' +
    '<svg class="c360-mnav-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var backdrop = document.createElement('div');
  backdrop.className = 'c360-mnav-backdrop';
  nav.parentNode.insertBefore(bar, nav);
  // same stacking layer as the menu, right below it: placed on <body> it ended up ON TOP of the
  // menu and swallowed every tap and scroll
  nav.parentNode.insertBefore(backdrop, nav);

  function label(btn) {
    // the entry's own label, without the icon or the count badge ("Pipeline", not "Pipeline3")
    var el = btn && (btn.querySelector('.c360-nav-label') || btn);
    var t = (el && el.textContent || '').replace(/\s+/g, ' ').trim();
    return t || 'Meniu';
  }
  function current() {
    return nav.querySelector('button.active:not(.hidden)') || nav.querySelector('button.active');
  }
  // ---- the bottom bar
  var MAIN = ['panou', 'pipeline', 'mesaje', 'programari', 'incasari', 'comision', 'condica', 'contacte', 'traininguri'];
  var SHORT = { programari: 'Calendar', incasari: 'Încasări', comision: 'Salariu', condica: 'Condică', traininguri: 'Training' };
  var tabbar = document.createElement('nav');
  tabbar.className = 'c360-tabbar';
  tabbar.setAttribute('aria-label', 'Secțiuni');
  document.body.appendChild(tabbar);
  var shown = '';
  function navBtn(tab) {
    var list = nav.querySelectorAll('button[data-tab="' + tab + '"]');
    for (var i = 0; i < list.length; i++) if (!list[i].classList.contains('hidden')) return list[i];
    return null;
  }
  function paintTabbar() {
    var tabs = MAIN.filter(function (t) { return !!navBtn(t); }).slice(0, 4);
    var cur = current();
    var curTab = cur && cur.dataset.tab;
    var key = tabs.join() + '|' + curTab + '|' + tabs.map(function (t) { var b = navBtn(t).querySelector('.k-nav-badge'); return b ? b.textContent : ''; }).join();
    if (key === shown) return;
    shown = key;
    tabbar.innerHTML = tabs.map(function (t) {
      var b = navBtn(t);
      var svg = b.querySelector('svg');
      var badge = b.querySelector('.k-nav-badge');
      return '<button type="button" data-go="' + t + '"' + (t === curTab ? ' class="is-on" aria-current="page"' : '') + '>' +
        '<span class="c360-tab-ic">' + (svg ? svg.outerHTML : '') + (badge && badge.textContent ? '<b>' + badge.textContent + '</b>' : '') + '</span>' +
        '<span>' + (SHORT[t] || label(b)) + '</span></button>';
    }).join('') +
      '<button type="button" data-menu' + (curTab && tabs.indexOf(curTab) < 0 ? ' class="is-on"' : '') + '><span class="c360-tab-ic"><span class="c360-mnav-icon"><i></i><i></i><i></i></span></span><span>Meniu</span></button>';
  }
  tabbar.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-menu')) return open(!document.documentElement.classList.contains('c360-mnav-open'));
    open(false);
    var target = navBtn(b.dataset.go);
    if (target) target.click();
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  function refresh() {
    bar.querySelector('.c360-mnav-label').textContent = label(current());
    paintTabbar();
  }
  function open(yes) {
    document.documentElement.classList.toggle('c360-mnav-open', yes);
    bar.setAttribute('aria-expanded', yes ? 'true' : 'false');
    if (yes) {
      var a = current();
      if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
    }
  }
  bar.addEventListener('click', function () {
    open(!document.documentElement.classList.contains('c360-mnav-open'));
  });
  backdrop.addEventListener('click', function () { open(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') open(false); });
  // picking an entry: let its own handler run, then close and show the new section
  nav.addEventListener('click', function (e) {
    if (!e.target.closest('button')) return;
    setTimeout(function () { refresh(); if (MOBILE.matches) open(false); }, 0);
  });
  // the active entry also changes from elsewhere (links, hash, search): keep the label in step
  new MutationObserver(refresh).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('hashchange', function () { setTimeout(refresh, 0); });
  MOBILE.addEventListener ? MOBILE.addEventListener('change', function () { open(false); }) : null;
  refresh();
})();
