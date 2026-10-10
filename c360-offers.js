/* ============================================================
   Centrul360 — offer prices come from Admin → Oferte, everywhere.
   Any element with data-ov="new|old|pct|save|newlei|oldlei" shows that field of the offer named
   by data-ok (on the element or on a parent). The value written in the HTML is only the fallback
   for the first instant (or if the admin can't be reached) — a price is never blanked out.
   ============================================================ */
(function () {
  'use strict';
  const FMT = {
    new: (o) => String(Math.round(o.priceNew)),
    old: (o) => String(Math.round(o.priceOld)),
    newlei: (o) => Math.round(o.priceNew) + ' lei',
    oldlei: (o) => Math.round(o.priceOld) + ' lei',
    pct: (o) => '−' + o.discountPercent + '%',
    save: (o) => 'Economisești ' + Math.round(o.priceOld - o.priceNew) + ' lei'
  };
  let byKey = null;
  function apply(root) {
    if (!byKey) return;
    (root || document).querySelectorAll('[data-ov]').forEach((el) => {
      const host = el.dataset.ok ? el : el.closest('[data-ok]');
      const o = host && byKey[host.dataset.ok];
      const f = FMT[el.dataset.ov];
      if (!o || !f || !(o.priceOld > 0 || /^new/.test(el.dataset.ov))) return;
      const v = f(o);
      if (el.textContent !== v) el.textContent = v;
    });
  }
  fetch('/api/offers-public')
    .then((r) => { if (!r.ok) throw new Error('offers_failed'); return r.json(); })
    .then((data) => {
      byKey = {};
      ((data && data.offers) || []).forEach((o) => { byKey[o.key] = o; });
      apply();
      // cards rendered later (carousels, pop-ups) get the same prices
      new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) apply(n.parentNode || n); }))).observe(document.body, { childList: true, subtree: true });
      window.C360Offers = byKey;
      document.dispatchEvent(new CustomEvent('c360:offers', { detail: byKey }));
    })
    .catch(() => { /* keep the prices written in the page */ });
})();
