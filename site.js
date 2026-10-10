// Centrul360 — site behaviour shared by every page. Small and passive: observers instead of
// scroll loops, transform/opacity only.
//   nav pill · treatments menu · mobile sheet · rising headline · "Tratăm [...]" plate ·
//   reveal once · manifest that lights up · current step · rotating review · offer tabs ·
//   sticky call to action · live prices from Admin → Oferte (/api/offers-public)
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  // ---- nav pill gets a firmer glass once the page scrolls
  const nav = $('.nav');
  if (nav) {
    const s = document.createElement('div');
    s.style.cssText = 'position:absolute;top:0;height:24px;width:1px;pointer-events:none';
    document.body.prepend(s);
    new IntersectionObserver(([e]) => nav.classList.toggle('sc', !e.isIntersecting)).observe(s);
  }

  // ---- "Tratamente" menu (desktop)
  $$('.dd').forEach((dd) => {
    const btn = $('button', dd);
    const set = (on) => { dd.classList.toggle('open', on); btn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); set(!dd.classList.contains('open')); });
    if (matchMedia('(hover:hover)').matches) { dd.addEventListener('mouseenter', () => set(true)); dd.addEventListener('mouseleave', () => set(false)); }
    document.addEventListener('click', (e) => { if (!dd.contains(e.target)) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  });

  // ---- mobile sheet
  const sheet = $('#sheet');
  if (sheet) {
    const open = (on) => { sheet.classList.toggle('open', on); sheet.setAttribute('aria-hidden', on ? 'false' : 'true'); document.documentElement.style.overflow = on ? 'hidden' : ''; };
    $$('[data-sheet-open]').forEach((b) => b.addEventListener('click', () => open(true)));
    sheet.addEventListener('click', (e) => { if (e.target.closest('[data-sheet-close]') || e.target.closest('a')) open(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') open(false); });
  }

  // ---- headline words rise one after another
  const h1 = $('h1[data-words]');
  if (h1 && !reduce) {
    let i = 0;
    [...h1.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const s = document.createElement('span'); s.className = 'wd'; s.style.setProperty('--i', i++); s.textContent = part; frag.appendChild(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== 'BR') { n.classList.add('wd'); n.style.setProperty('--i', i++); }
    });
  }

  // ---- the plate: "Tratăm <word>" — the word opens sideways, then changes
  const roll = $('.roll');
  if (roll) {
    const words = (roll.dataset.words || '').split('|').filter(Boolean);
    const tx = $('.tx', roll);
    const measure = document.createElement('span');
    measure.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;left:-9999px';
    roll.appendChild(measure);
    const widthOf = (w) => { measure.textContent = w; return measure.getBoundingClientRect().width + 4; };
    let k = 0;
    const show = (w) => { tx.textContent = w; roll.style.width = widthOf(w) + 'px'; };
    show(words[0]);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => show(words[k]));
    if (!reduce && words.length > 1) setInterval(() => {
      roll.style.width = '0px';
      setTimeout(() => { k = (k + 1) % words.length; show(words[k]); }, 820);
    }, 3400);
  }

  // ---- reveal once
  const els = $$('.rv');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach((el) => io.observe(el));
  } else els.forEach((el) => el.classList.add('in'));

  // ---- scroll-linked bits, computed once per frame and only while visible
  const manifest = $('.manifest');
  const steps = $$('.step');
  let ticking = false;
  const frame = () => {
    ticking = false;
    const vh = innerHeight;
    if (manifest) {
      const r = manifest.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.55 + r.height * 0.5)));
      manifest.style.setProperty('--hp', p.toFixed(3));
    }
    if (steps.length) {
      let best = null, bestD = Infinity;
      steps.forEach((s) => { const r = s.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - vh * 0.5); if (d < bestD) { bestD = d; best = s; } });
      steps.forEach((s) => s.classList.toggle('on', s === best));
    }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  if (manifest || steps.length) { addEventListener('scroll', onScroll, { passive: true }); addEventListener('resize', onScroll); frame(); }

  // ---- reviews: one quote at a time
  const qs = $('.qs');
  if (qs) {
    const figs = $$('figure', qs);
    const dots = $('.dots');
    let cur = 0, timer;
    const go = (i) => {
      cur = (i + figs.length) % figs.length;
      figs.forEach((f, j) => f.classList.toggle('on', j === cur));
      if (dots) $$('button', dots).forEach((b, j) => b.classList.toggle('on', j === cur));
    };
    if (dots) dots.innerHTML = figs.map((_, j) => '<button type="button" aria-label="Recenzia ' + (j + 1) + '"></button>').join('');
    if (dots) dots.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; go($$('button', dots).indexOf(b)); clearInterval(timer); });
    go(0);
    if (!reduce && figs.length > 1) timer = setInterval(() => go(cur + 1), 6500);
  }

  // ---- offer tabs
  const tabs = $('.tabs');
  if (tabs) {
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-t]');
      if (!b) return;
      $$('button', tabs).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
      $$('.offer').forEach((o) => o.classList.toggle('on', o.dataset.t === b.dataset.t));
    });
  }

  // ---- sticky call to action: after the hero button scrolls away, hidden while the form is on screen
  const dock = $('#dock');
  if (dock) {
    const trigger = $('[data-dock-after]');
    const form = $('#programare');
    let past = false, formOn = false;
    const sync = () => dock.classList.toggle('show', past && !formOn);
    if (trigger) new IntersectionObserver(([e]) => { past = !e.isIntersecting && e.boundingClientRect.top < 0; sync(); }).observe(trigger);
    if (form) new IntersectionObserver(([e]) => { formOn = e.isIntersecting; sync(); }, { threshold: 0.12 }).observe(form);
  }

  // ---- live offers: [data-offer="key"] takes title + prices from Admin → Oferte
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
