// Centrul360 — site behaviour shared by every page: the glass pill nav, the treatments menu,
// the mobile sheet, the rotating word in the hero plate, one-time reveal on scroll, and live
// offer prices from Admin → Oferte (/api/offers-public). Small and passive: no animation loops.
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- nav pill gets a firmer glass once the page scrolls
  const nav = document.querySelector('.nav');
  if (nav) {
    const s = document.createElement('div');
    s.style.cssText = 'position:absolute;top:0;height:24px;width:1px;pointer-events:none';
    document.body.prepend(s);
    new IntersectionObserver(([e]) => nav.classList.toggle('sc', !e.isIntersecting)).observe(s);
  }

  // ---- "Tratamente" menu (desktop)
  document.querySelectorAll('.dd').forEach((dd) => {
    const btn = dd.querySelector('button');
    const set = (on) => { dd.classList.toggle('open', on); btn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); set(!dd.classList.contains('open')); });
    if (matchMedia('(hover:hover)').matches) { dd.addEventListener('mouseenter', () => set(true)); dd.addEventListener('mouseleave', () => set(false)); }
    document.addEventListener('click', (e) => { if (!dd.contains(e.target)) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  });

  // ---- mobile sheet
  const sheet = document.getElementById('sheet');
  if (sheet) {
    const open = (on) => { sheet.classList.toggle('open', on); sheet.setAttribute('aria-hidden', on ? 'false' : 'true'); document.documentElement.style.overflow = on ? 'hidden' : ''; };
    document.querySelectorAll('[data-sheet-open]').forEach((b) => b.addEventListener('click', () => open(true)));
    sheet.addEventListener('click', (e) => { if (e.target.closest('[data-sheet-close]') || e.target.closest('a')) open(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  }

  // ---- headline words rise one after another
  const h1 = document.querySelector('h1[data-words]');
  if (h1 && !reduce) {
    let i = 0;
    const wrap = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const s = document.createElement('span'); s.className = 'wd'; s.style.setProperty('--i', i++); s.textContent = part; frag.appendChild(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') {
          n.classList.add('wd'); n.style.setProperty('--i', i++);
        }
      });
    };
    wrap(h1);
  }

  // ---- the plate: "Tratăm <word>" — the word opens sideways, then changes
  const roll = document.querySelector('.roll');
  if (roll) {
    const words = (roll.dataset.words || '').split('|').filter(Boolean);
    const tx = roll.querySelector('.tx');
    const measure = document.createElement('span');
    measure.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
    roll.parentNode.appendChild(measure);
    const widthOf = (w) => { measure.textContent = w; return measure.getBoundingClientRect().width + 2; };
    let k = 0;
    const show = (w) => { roll.style.width = widthOf(w) + 'px'; tx.textContent = w; };
    show(words[0]);
    if (!reduce && words.length > 1) setInterval(() => {
      roll.style.width = '0px';
      setTimeout(() => { k = (k + 1) % words.length; show(words[k]); }, 820);
    }, 3200);
  }

  // ---- reveal once
  const els = document.querySelectorAll('.rv');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
  } else els.forEach((el) => el.classList.add('in'));

  // ---- live offers: [data-offer="key"] takes title + prices from Admin → Oferte
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
        if (wa) wa.href = 'https://wa.me/' + (c.dataset.wa || '40750204243') + '?text=' + encodeURIComponent('Bună ziua! Vreau să rezerv oferta ' + o.title + ' la ' + o.priceNew + ' lei.');
      });
    }).catch(() => { /* static prices stay */ });
  }
})();
