// Centrul360 portal — interaction layer (pairs with portal-theme.css).
// Pure progressive enhancement: if this file fails to load, the portal still works as before.
(function () {
  'use strict';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- brand: official logo (swaps to the white one in dark mode) ----
  function mountBrand() {
    const brand = document.querySelector('header.topbar .brand');
    if (!brand || brand.dataset.c360) return;
    brand.dataset.c360 = '1';
    brand.innerHTML =
      '<picture>' +
      '<source srcset="/brand_asset/portal/logo-white.png" media="(prefers-color-scheme: dark)">' +
      '<img class="brand-logo" src="/brand_asset/portal/logo-black.png" alt="Centrul360">' +
      '</picture><span class="brand-sep"></span><span class="brand-sub">Admin</span>';
  }

  // ---- sidebar: a highlight that glides to the active item ----
  let nav, indicator;
  function placeIndicator(instant) {
    if (!nav || !indicator) return;
    const active = nav.querySelector('button[data-tab].active');
    if (!active || active.offsetParent === null || window.innerWidth <= 720) {
      indicator.style.opacity = '0';
      return;
    }
    if (instant || reduceMotion) indicator.style.transition = 'none';
    indicator.style.transform = 'translateY(' + active.offsetTop + 'px)';
    indicator.style.height = active.offsetHeight + 'px';
    indicator.style.opacity = '1';
    if (instant || reduceMotion) requestAnimationFrame(() => { indicator.style.transition = ''; });
  }
  function mountIndicator() {
    nav = document.getElementById('tabsNav');
    if (!nav || nav.querySelector('.c360-indicator')) return;
    indicator = document.createElement('span');
    indicator.className = 'c360-indicator';
    nav.prepend(indicator);
    nav.classList.add('has-indicator');
    // Tabs can change from code (activateTab) too, so watch the classes instead of only clicks.
    new MutationObserver(() => {
      placeIndicator(false);
      updateTitle();
      revealActiveChip();
    }).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', () => placeIndicator(true));
    placeIndicator(true);
  }

  // ---- mobile: keep the active chip in view ----
  function revealActiveChip() {
    if (window.innerWidth > 720 || !nav) return;
    const active = nav.querySelector('button[data-tab].active');
    if (active) active.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  }

  // ---- browser tab title follows the section ----
  function updateTitle() {
    const active = nav && nav.querySelector('button[data-tab].active');
    const label = active ? active.textContent.trim() : '';
    document.title = (label ? label + ' · ' : '') + 'Centrul360 Admin';
  }

  // ---- app entrance once the session check finishes ----
  function watchAppReveal() {
    const app = document.getElementById('app');
    if (!app) return;
    const reveal = () => {
      if (!app.classList.contains('hidden')) {
        app.classList.add('c360-enter');
        placeIndicator(true);
        updateTitle();
        return true;
      }
      return false;
    };
    if (reveal()) return;
    const mo = new MutationObserver(() => { if (reveal()) mo.disconnect(); });
    mo.observe(app, { attributes: true, attributeFilter: ['class'] });
  }

  // ---- buttons inside forms show a spinner while their submit is in flight ----
  function wireBusyButtons() {
    document.addEventListener('submit', (e) => {
      const btn = e.target.querySelector('button[type=submit].pill, button.pill:not([type])');
      if (!btn) return;
      btn.classList.add('is-busy');
      setTimeout(() => btn.classList.remove('is-busy'), 1500);
    }, true);
  }

  function init() {
    mountBrand();
    mountIndicator();
    watchAppReveal();
    wireBusyButtons();
    updateTitle();
    // Fonts change item heights slightly once loaded.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeIndicator(true));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
