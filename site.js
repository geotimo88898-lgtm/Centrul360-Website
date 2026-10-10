// Centrul360 — site behaviour, shared by every page. Small and passive (observers only).
//   header turns solid on scroll · mobile menu drawer · fade-in once · sticky call to action
//   on phones once the hero form is out of view · live offer prices from Admin → Oferte
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  // header: transparent over the top of the page, solid once it scrolls
  const top = $('.top');
  if (top) {
    const s = document.createElement('div');
    s.style.cssText = 'position:absolute;top:0;height:16px;width:1px;pointer-events:none';
    document.body.prepend(s);
    new IntersectionObserver(([e]) => top.classList.toggle('solid', !e.isIntersecting)).observe(s);
  }

  // mobile menu
  const drawer = $('#drawer');
  if (drawer) {
    const open = (on) => { drawer.classList.toggle('open', on); drawer.setAttribute('aria-hidden', on ? 'false' : 'true'); document.documentElement.style.overflow = on ? 'hidden' : ''; };
    $$('[data-menu]').forEach((b) => b.addEventListener('click', () => open(true)));
    drawer.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target.closest('a') || e.target.classList.contains('drawer-bg')) open(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  }

  // fade in once
  const els = $$('.fade');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => io.observe(el));
  } else els.forEach((el) => el.classList.add('in'));

  // sticky call to action: only after the hero form has scrolled away, never over the form
  const sticky = $('#sticky');
  const form = $('#formular');
  if (sticky && form) {
    let below = false;
    new IntersectionObserver(([e]) => { below = !e.isIntersecting && e.boundingClientRect.top < 0; sticky.classList.toggle('show', below); sticky.setAttribute('aria-hidden', below ? 'false' : 'true'); }).observe(form);
  }

  // live offers: [data-offer="key"] takes title + prices from Admin → Oferte
  const cards = $$('[data-offer]');
  if (cards.length) {
    fetch('/api/offers-public').then((r) => (r.ok ? r.json() : null)).then((d) => {
      const by = {};
      ((d && d.offers) || []).forEach((o) => { by[o.key] = o; });
      cards.forEach((c) => {
        const o = by[c.dataset.offer];
        if (!o) return;
        const set = (sel, v) => { const el = $(sel, c); if (el && v != null) el.textContent = v; };
        set('[data-o-title]', o.title);
        set('[data-o-price]', o.priceNew);
        set('[data-o-old]', o.priceOld ? o.priceOld + ' lei' : '');
        set('[data-o-off]', o.discountPercent ? '−' + o.discountPercent + '%' : '');
        const wa = $('[data-o-wa]', c);
        if (wa) wa.href = 'https://wa.me/' + (c.dataset.wa || '40750204243') + '?text=' + encodeURIComponent('Bună ziua! Vreau să rezerv oferta ' + o.title + ' la ' + o.priceNew + ' lei.');
      });
    }).catch(() => { /* static prices stay */ });
  }
})();
