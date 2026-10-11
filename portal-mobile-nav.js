/* Phones: the side menu (24 entries) used to become a row of pills scrolling sideways, which was hard to
   use. On small screens it is now one clean button with the current section ("Referințe ▾") that opens
   the whole menu as a grouped dropdown. The desktop sidebar is untouched. Purely presentational: the
   menu buttons keep their own click handlers (portal-core decides what each one opens). */
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
  document.body.appendChild(backdrop);

  function label(btn) {
    // the entry's own label, without the icon or the count badge ("Pipeline", not "Pipeline3")
    var el = btn && (btn.querySelector('.c360-nav-label') || btn);
    var t = (el && el.textContent || '').replace(/\s+/g, ' ').trim();
    return t || 'Meniu';
  }
  function current() {
    return nav.querySelector('button.active:not(.hidden)') || nav.querySelector('button.active');
  }
  function refresh() {
    bar.querySelector('.c360-mnav-label').textContent = label(current());
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
