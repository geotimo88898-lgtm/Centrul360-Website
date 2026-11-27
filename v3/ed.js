/* ============================================================
   Centrul360 v3, the editorial site: what the pages need besides the shop (v3/shop.js) and a treatment's buy box (v3/pp.js).
     [data-fit]      each line (a span) is set edge to edge: its font size fills the width it has (data-fvh: at most that share of
                     the screen's height), measured once the fonts are in, again on a resize
     .mh             the monumental first screen: the one living moment (the words settle, the picture rises into its light,
                     then the picture and the words move apart with the scroll, a little)
     .hd             the header: clear over the first screen, solid under it
     .mn             the menu, grown from the button that opened it
     [data-cart]     the bag: its count (the shop keeps the cart on this device), and the shop's sheet, loaded when needed
     [data-dk]       the dock of a page without its own: the online price of the moment (the server's terms)
     .vd             a video: plays on its button
   ============================================================ */
(function () {
  'use strict';
  var B = /^\/v3(\/|$)/.test(location.pathname) ? '/v3/' : '/';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---- the words edge to edge
  function fit() {
    $$('[data-fit]').forEach(function (h) {
      var cs = getComputedStyle(h), w = h.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var vh = parseFloat(h.getAttribute('data-fvh') || '0'), max = parseFloat(h.getAttribute('data-fmax') || '0');
      $$(':scope > span', h).forEach(function (s) {
        s.style.setProperty('--fs', '100px');
        var sw = s.getBoundingClientRect().width;
        if (!sw) return;
        var f = 100 * w / sw;
        if (vh) f = Math.min(f, innerHeight * vh);
        if (max) f = Math.min(f, max);
        s.style.setProperty('--fs', (Math.floor(f * 10) / 10) + 'px');
      });
      h.classList.add('fitted');
    });
  }
  var fitT = 0;
  addEventListener('resize', function () { clearTimeout(fitT); fitT = setTimeout(fit, 120); });
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

  // ---- the monumental first screen
  var mh = $('.mh');
  if (mh) {
    var start = function () {
      if (reduce) { mh.classList.remove('pre'); mh.classList.add('live'); return; }
      requestAnimationFrame(function () { mh.classList.add('go'); mh.classList.remove('pre'); setTimeout(function () { mh.classList.add('live'); }, 1900); });
    };
    var img = $('.mh-cut', mh);
    var ready = function () { (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () { fit(); start(); }); };
    if (!img || (img.complete && img.naturalWidth)) ready(); else { img.addEventListener('load', ready, { once: true }); img.addEventListener('error', ready, { once: true }); setTimeout(ready, 1600); }
    if (!reduce) {
      var busy = false;
      var paint = function () { busy = false; var h = mh.offsetHeight || 1, p = Math.max(0, Math.min(1, scrollY / h)); mh.style.setProperty('--p', p.toFixed(4)); };
      addEventListener('scroll', function () { if (!busy) { busy = true; requestAnimationFrame(paint); } }, { passive: true });
    }
  }

  // ---- the header
  var hd = $('.hd');
  if (hd) {
    var first = $('.mh, .ph, [data-first]');
    var solid = function () { var lim = first ? Math.max(10, first.offsetHeight - hd.offsetHeight - 10) : 10; hd.classList.toggle('solid', scrollY > lim); };
    addEventListener('scroll', solid, { passive: true }); addEventListener('resize', solid); solid();
  }

  // ---- the menu
  var mn = $('#mn');
  var openMenu = function (btn) {
    if (!mn) return;
    var r = btn.getBoundingClientRect();
    mn.style.setProperty('--ox', (r.left + r.width / 2) + 'px'); mn.style.setProperty('--oy', (r.top + r.height / 2) + 'px');
    mn.classList.add('open'); mn.setAttribute('aria-hidden', 'false'); document.documentElement.style.overflow = 'hidden';
    $$('[data-menu]').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
    var x = $('.mn-x', mn); if (x) setTimeout(function () { x.focus({ preventScroll: true }); }, 50);
  };
  var closeMenu = function () {
    if (!mn || !mn.classList.contains('open')) return;
    mn.classList.remove('open'); mn.setAttribute('aria-hidden', 'true'); document.documentElement.style.overflow = '';
    $$('[data-menu]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  };
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t.closest) return;
    var m = t.closest('[data-menu]'); if (m) { e.preventDefault(); openMenu(m); return; }
    if (t.closest('[data-menu-close]')) closeMenu();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });

  // ---- the bag: its count; the shop's sheet, loaded when a page does not have it
  var count = function () { try { var k = JSON.parse(localStorage.getItem('c360-shop3') || 'null'); return k && Array.isArray(k.cart) ? k.cart.length : 0; } catch (e) { return 0; } };
  var paintBag = function () { var n = count(); $$('.hd-bag i').forEach(function (i) { i.textContent = n ? String(n) : ''; }); };
  paintBag();
  addEventListener('storage', paintBag);
  addEventListener('c360:cart', paintBag);
  var shopP = null;
  var loadShop = function () {
    if (window.C360Shop) return Promise.resolve(window.C360Shop);
    if (shopP) return shopP;
    shopP = new Promise(function (ok, no) {
      if (!$('link[href="' + B + 'shop.css"]')) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = B + 'shop.css'; document.head.appendChild(l); }
      var s = document.createElement('script'); s.src = B + 'shop.js';
      s.onload = function () { if (window.C360Shop) ok(window.C360Shop); else no(new Error('shop')); };
      s.onerror = function () { shopP = null; no(new Error('shop')); };
      document.head.appendChild(s);
    });
    return shopP;
  };
  document.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('.hd-bag');
    if (!c || window.C360Shop) return;
    e.preventDefault(); e.stopPropagation();
    c.setAttribute('aria-busy', 'true');
    loadShop().then(function (S) { c.removeAttribute('aria-busy'); S.open(c); }, function () { c.removeAttribute('aria-busy'); });
  }, true);
  // the Card de Sărbători (its page, v2/cs-buy.js): the card into the cart and the cart open, like every other product
  window.C360AddCard = function (tier, city, from) {
    if (city && typeof city === 'object') { from = city.from; city = city.city; }
    return loadShop().then(function (S) { return S.addCard(tier, city, from); });
  };

  // ---- the dock of a page without its own: the online price of the moment, from the server's terms
  var dk = $('[data-dk]');
  if (dk) {
    var dt = $('[data-dk-t]', dk), ds = $('[data-dk-s]', dk);
    var day = function (t) {
      var d = new Date(t), now = new Date();
      var f = function (x) { return new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(x); };
      if (f(d) === f(now)) return 'azi, la 23:59';
      if (f(d) === f(new Date(now.getTime() + 864e5))) return 'mâine, la 23:59';
      return new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    };
    var terms = function (j) {
      var t = j && j.terms; if (!t) return;
      if (t.bf) { dt.textContent = 'Black Friday: -' + t.pct + '%'; ds.textContent = 'Online, până ' + day(t.end); }
      else if (t.pct) { dt.textContent = '-' + t.pct + '% la plata online'; ds.textContent = 'Plătești online, alegi ora după'; }
    };
    (window.C360Pre && window.C360Pre.shop ? window.C360Pre.shop : fetch('/api/shop', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); })).then(terms, function () {});
    // out of the way over the footer and while the menu is open
    var ft = $('.ft');
    if (ft && 'IntersectionObserver' in window) new IntersectionObserver(function (es) { dk.classList.toggle('off', es[0].isIntersecting); }, { rootMargin: '0px 0px -40% 0px' }).observe(ft);
  }

  // ---- the online price of the moment, as words on a page ([data-terms]: the offers' first screen), from the server's terms
  var tw = $('[data-terms]');
  if (tw) {
    var tl = $('[data-terms-l]');
    (window.C360Pre && window.C360Pre.shop ? window.C360Pre.shop : fetch('/api/shop', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); })).then(function (j) {
      var t = j && j.terms; if (!t || !t.pct) return;
      var d = new Date(t.end), f = function (x) { return new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(x); };
      if (t.bf) { if (tl) tl.textContent = 'Black Friday'; tw.textContent = '-' + t.pct + '% la plata online, ' + (f(d) === f(new Date()) ? 'până azi la 23:59' : 'până ' + new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', weekday: 'long', day: 'numeric', month: 'long' }).format(d)); }
      else { if (tl) tl.textContent = 'La plata online'; tw.textContent = '-' + t.pct + '% la toate tratamentele'; }
    }, function () {});
  }

  // ---- a video plays on its button
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.vd button');
    if (!b) return;
    var box = b.closest('.vd'), v = $('video', box);
    if (!v) return;
    box.classList.add('on'); v.setAttribute('controls', ''); v.play().catch(function () {});
  });
})();
