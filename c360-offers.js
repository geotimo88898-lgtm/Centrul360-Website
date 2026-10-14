/* ============================================================
   Centrul360, the offers on the site are exactly the active offers in Admin → Oferte.
   Live: every visit reads /api/offers-public.
   - [data-ok="key"] marks an offer (card, row, menu slide). Not active in the admin → hidden.
   - [data-ov="new|old|pct|save|newlei|oldlei"] inside it shows that field of the offer.
   - [data-offer-cat="epilare"] is a list rebuilt from all active admin offers of that category
     (a card already written for an offer keeps its text; a new admin offer gets a card like the first).
   - [data-offer-key] tiers on Prețuri: hidden when the offer is no longer active.
   The values written in the HTML only show for the first instant, or if the admin can't be reached.
   ============================================================ */
(function () {
  'use strict';
  const FMT = {
    new: (o) => String(Math.round(o.priceNew)),
    old: (o) => String(Math.round(o.priceOld)),
    newlei: (o) => Math.round(o.priceNew) + ' lei',
    oldlei: (o) => Math.round(o.priceOld) + ' lei',
    pct: (o) => '-' + o.discountPercent + '%',
    save: (o) => 'Economisești ' + Math.round(o.priceOld - o.priceNew) + ' lei'
  };
  const SHORT = (o) => o.title.replace(/^Epilare laser\s*·\s*/i, '');
  let byKey = null, list = [];

  function waFor(o) {
    return 'https://wa.me/40750452002?text=' + encodeURIComponent('Buna ziua! Vreau sa rezerv oferta ' + o.title.normalize('NFD').replace(/[̀-ͯ]/g, '') + ' la ' + Math.round(o.priceNew) + ' lei.');
  }
  function buildLists() {
    document.querySelectorAll('[data-offer-cat]').forEach((box) => {
      const offers = list.filter((o) => o.category === box.dataset.offerCat);
      const existing = {};
      box.querySelectorAll(':scope > [data-ok]').forEach((el) => { existing[el.dataset.ok] = el; });
      const tpl = box.querySelector(':scope > [data-ok]');
      if (!tpl) return;
      const items = offers.map((o) => {
        let el = existing[o.key];
        if (!el) {
          el = tpl.cloneNode(true);
          el.dataset.ok = o.key;
          el.classList.remove('feature');
          el.querySelectorAll('.pkg-badge').forEach((b) => b.remove());
          el.querySelectorAll('[data-of="title"]').forEach((t) => { t.textContent = SHORT(o); });
          el.querySelectorAll('[data-of="desc"]').forEach((t) => { t.textContent = (o.description || '').split('\n')[0]; });
          el.querySelectorAll('a[href*="wa.me"]').forEach((a) => { a.href = waFor(o); a.innerHTML = 'Programează <span class="arrow">→</span>'; });
        }
        el.hidden = false;
        return el;
      });
      box.replaceChildren(...items);
      const sec = box.closest('[data-offer-sec]');
      if (sec) sec.hidden = !items.length;
    });
  }
  function apply(root) {
    if (!byKey) return;
    const scope = root || document;
    scope.querySelectorAll('[data-ok]').forEach((host) => {
      if (host.parentElement && host.parentElement.hasAttribute('data-offer-cat')) return; // lists handled above
      if (!byKey[host.dataset.ok] && !/^(SPAN|S|B)$/.test(host.tagName)) host.hidden = true;
    });
    scope.querySelectorAll('[data-ov]').forEach((el) => {
      const host = el.dataset.ok ? el : el.closest('[data-ok]');
      const o = host && byKey[host.dataset.ok];
      const f = FMT[el.dataset.ov];
      if (!o || !f) return;
      const v = f(o);
      if (el.textContent !== v) el.textContent = v;
    });
    // Prețuri: an offer tier that is no longer active goes; its card stays as a normal price card,
    // or goes entirely if the offer was all it had
    scope.querySelectorAll('[data-offer-key]').forEach((tier) => {
      if (byKey[tier.dataset.offerKey]) return;
      tier.hidden = true;
      const card = tier.closest('.pitem');
      if (!card) return;
      if (![...card.querySelectorAll('.tier')].some((t) => !t.hidden)) card.hidden = true;
      else { card.classList.remove('promo'); card.querySelectorAll('.promo-flag').forEach((f) => f.remove()); }
      const cat = card.closest('.pcat');                 // a category left with nothing goes too
      if (cat && ![...cat.querySelectorAll('.pitem')].some((p) => !p.hidden)) cat.hidden = true;
    });
  }
  function done(feed) {
    window.C360Offers = feed;
    document.dispatchEvent(new CustomEvent('c360:offers', { detail: feed }));
  }
  fetch('/api/offers-public')
    .then((r) => { if (!r.ok) throw new Error('offers_failed'); return r.json(); })
    .then((data) => {
      list = (data && data.offers) || [];
      byKey = {};
      list.forEach((o) => { byKey[o.key] = o; });
      buildLists();
      apply();
      // a link to an offer (e.g. #oferta-full-body): land on it after the list is rebuilt,
      // or on the offers section if that offer is no longer active
      const id = decodeURIComponent(location.hash.slice(1));
      if (/^oferta-/.test(id)) {
        const el = document.getElementById(id);
        const target = el && !el.hidden ? el : document.getElementById('pret');
        if (target) target.scrollIntoView({ block: 'start' });
      }
      // cards rendered later (carousels, pop-ups) follow the same rules
      new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) apply(n.parentNode || n); }))).observe(document.body, { childList: true, subtree: true });
      done(byKey);
    })
    .catch(() => done(null));                         // keep what the page has written
})();
