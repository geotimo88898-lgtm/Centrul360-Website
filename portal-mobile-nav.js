/* Phones: like an app. A bar at the bottom with the 4 main sections of this account (Panou, Pipeline,
   Mesaje, Calendar, or what the account has instead) and "Meniu", which opens the whole grouped menu
   as a full screen under the header (the bottom bar steps aside; back or X closes it). The desktop sidebar is untouched. Purely presentational: every button forwards
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
  // the full-screen menu's own title and close button (phones only)
  var head = document.createElement('div');
  head.className = 'c360-mhead';
  head.innerHTML = '<b>Meniu</b><button type="button" class="c360-mclose" aria-label="Închide meniul">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
  nav.insertBefore(head, nav.firstChild);
  // at the end of the menu, said in words: the account and the way out (on a phone the top-right circle isn't obvious)
  var foot = document.createElement('div');
  foot.className = 'c360-mfoot';
  foot.innerHTML = '<button type="button" data-mfoot="account"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Contul meu</button>' +
    '<button type="button" data-mfoot="logout"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>Deconectare</button>';
  nav.appendChild(foot);
  foot.addEventListener('click', function (e) {
    var b = e.target.closest('[data-mfoot]'); if (!b) return;
    if (b.dataset.mfoot === 'account') { if (window.K && window.K.openAccount) window.K.openAccount(); }
    else { var lb = document.getElementById('logoutBtn'); if (lb) lb.click(); }
    setTimeout(function () { if (html.classList.contains('c360-mnav-open')) close('pick'); }, 0);
  });
  var html = document.documentElement;
  var pushed = false;

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
  // the four big tabs, by what the account does: a cosmetician's day is the calendar, not the leads
  var ROLE = document.documentElement.getAttribute('data-role') || '';
  var MAIN = ROLE === 'cosmetician' ? ['panou', 'programari', 'mesaje', 'contacte', 'comision', 'condica', 'traininguri'] : ['panou', 'pipeline', 'mesaje', 'programari', 'incasari', 'comision', 'condica', 'contacte', 'traininguri'];
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
    if (b.hasAttribute('data-menu')) return html.classList.contains('c360-mnav-open') ? close() : open(true);
    close('pick');
    var target = navBtn(b.dataset.go);
    if (target) target.click();
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  function refresh() {
    bar.querySelector('.c360-mnav-label').textContent = label(current());
    paintTabbar();
  }
  function open(yes) {
    if (yes && MOBILE.matches) {
      // the menu starts right under the header, whatever its height on this phone
      var top = document.querySelector('header.topbar');
      html.style.setProperty('--c360-mtop', Math.max(0, Math.round(top ? top.getBoundingClientRect().bottom : 60)) + 'px');
      // the phone's back button closes the menu instead of leaving the app
      if (!pushed) { try { history.pushState({ mnav: 1 }, '', location.href); pushed = true; } catch (e) { /* no history */ } }
    }
    html.classList.toggle('c360-mnav-open', yes);
    bar.setAttribute('aria-expanded', yes ? 'true' : 'false');
    if (yes) {
      var a = current();
      if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
    }
  }
  // how it closes: by the phone's back ('back'), by picking a section ('pick', which takes that step in
  // history), or by X / Esc / a tap outside (the step it added goes away)
  function close(how) {
    if (pushed && !how) { pushed = false; history.back(); }
    else if (how) pushed = false;
    open(false);
  }
  window.addEventListener('popstate', function () { if (pushed) { pushed = false; open(false); } });
  bar.addEventListener('click', function () {
    html.classList.contains('c360-mnav-open') ? close() : open(true);
  });
  backdrop.addEventListener('click', function () { close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && html.classList.contains('c360-mnav-open')) close(); });
  head.querySelector('.c360-mclose').addEventListener('click', function (e) { e.stopPropagation(); close(); });
  // the header (search, account) works on top of the menu: using it closes the menu
  var topbar = document.querySelector('header.topbar');
  if (topbar) topbar.addEventListener('click', function () { if (html.classList.contains('c360-mnav-open')) close(); });
  // picking an entry: let its own handler run, then close and show the new section
  nav.addEventListener('click', function (e) {
    if (!e.target.closest('button[data-tab]')) return;
    setTimeout(function () { refresh(); if (MOBILE.matches) close('pick'); }, 0);
  });
  // the active entry also changes from elsewhere (links, hash, search): keep the label in step
  new MutationObserver(refresh).observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  // the role is set a moment after the shell loads: the tabs follow it
  new MutationObserver(function () { var r = document.documentElement.getAttribute('data-role') || ''; if (r !== ROLE) { ROLE = r; MAIN = ROLE === 'cosmetician' ? ['panou', 'programari', 'mesaje', 'contacte', 'comision', 'condica', 'traininguri'] : ['panou', 'pipeline', 'mesaje', 'programari', 'incasari', 'comision', 'condica', 'contacte', 'traininguri']; shown = ''; refresh(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-role'] });
  window.addEventListener('hashchange', function () { setTimeout(refresh, 0); });
  MOBILE.addEventListener ? MOBILE.addEventListener('change', function () { close('pick'); }) : null;
  // the phone keyboard: while a field is being typed in, the bottom bar hides (iOS leaves a fixed bar floating in
  // the middle of the screen while the keyboard is up, and for a moment after); it comes back when typing ends
  var kbd = 0;
  function keyboard(on) {
    clearTimeout(kbd);
    kbd = setTimeout(function () { html.classList.toggle('c360-kbd', !!on); }, on ? 0 : 250);
  }
  document.addEventListener('focusin', function (e) { if (e.target.matches && e.target.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable]')) keyboard(true); });
  document.addEventListener('focusout', function () { keyboard(false); });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', function () {
    var shrunk = window.innerHeight - window.visualViewport.height > 150; // the keyboard, not the address bar
    if (shrunk) keyboard(true); else if (!document.activeElement || !document.activeElement.matches('input, textarea, select, [contenteditable]')) keyboard(false);
  });
  refresh();
})();
