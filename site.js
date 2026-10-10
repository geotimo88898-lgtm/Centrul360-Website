// Centrul360 — site behaviour shared by every page: top bar, treatments menu, mobile sheet,
// one-time reveal on scroll, and live offer prices from Admin → Oferte (/api/offers-public).
// Deliberately small: no animation loops, no scroll handlers doing layout work.
(function () {
  'use strict';

  // ---- top bar: hairline once the page scrolls
  const bar = document.querySelector('.topbar');
  if (bar) {
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'position:absolute;top:0;height:8px;width:1px;pointer-events:none';
    document.body.prepend(sentinel);
    new IntersectionObserver(([e]) => bar.classList.toggle('is-scrolled', !e.isIntersecting)).observe(sentinel);
  }

  // ---- "Tratamente" dropdown (desktop)
  document.querySelectorAll('.nav-dd-wrap').forEach((wrap) => {
    const btn = wrap.querySelector('.nav-dd');
    const set = (on) => { wrap.classList.toggle('open', on); btn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); set(!wrap.classList.contains('open')); });
    wrap.addEventListener('mouseenter', () => set(true));
    wrap.addEventListener('mouseleave', () => set(false));
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  });

  // ---- mobile sheet
  const sheet = document.getElementById('sheet');
  if (sheet) {
    const open = (on) => { sheet.classList.toggle('open', on); sheet.setAttribute('aria-hidden', on ? 'false' : 'true'); document.documentElement.style.overflow = on ? 'hidden' : ''; };
    document.querySelectorAll('[data-sheet-open]').forEach((b) => b.addEventListener('click', () => open(true)));
    sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-sheet-close]') || e.target.closest('a')) open(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  }

  // ---- reveal once (opacity + 14px), never hides content if the observer misses
  const els = document.querySelectorAll('.rv-in');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
    els.forEach((el) => io.observe(el));
    setTimeout(() => els.forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('in'); }), 300);
  } else els.forEach((el) => el.classList.add('in'));

  // ---- live offers: cards marked [data-offer="key"] take title + prices from Admin → Oferte
  const cards = document.querySelectorAll('[data-offer]');
  if (cards.length) {
    fetch('/api/offers-public').then((r) => (r.ok ? r.json() : null)).then((d) => {
      const by = {};
      ((d && d.offers) || []).forEach((o) => { by[o.key] = o; });
      cards.forEach((c) => {
        const o = by[c.dataset.offer];
        if (!o) return;
        const set = (sel, v) => { const el = c.querySelector(sel); if (el && v != null) el.textContent = v; };
        set('[data-o-title]', o.title);
        set('[data-o-price]', o.priceNew);
        set('[data-o-old]', o.priceOld ? o.priceOld + ' lei' : '');
        set('[data-o-off]', o.discountPercent ? '−' + o.discountPercent + '%' : '');
        const wa = c.querySelector('[data-o-wa]');
        if (wa) wa.href = 'https://wa.me/40750204243?text=' + encodeURIComponent('Bună ziua! Vreau să rezerv oferta ' + o.title + ' la ' + o.priceNew + ' lei.');
      });
    }).catch(() => { /* static prices stay */ });
  }
})();
