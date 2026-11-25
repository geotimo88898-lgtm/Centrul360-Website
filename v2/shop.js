/* ============================================================
   Centrul360, the Black Friday shop (the owner, 24.11). Every treatment of the price list, one session at -50%, paid online
   by card. The look: Apple / glass / Tesla / Nike (the owner): big calm type, a lot of air, few colours, glass surfaces.
     [data-bfs]          the first screen's slider: three in sight, the middle one in front, round and round
     [data-bfo]          all the offers: sections per need, a glass filter that scrolls to them, the laser zones as a list
     [data-pp="<id>"]    a treatment's page: its buy box (sessions, price, button) and what goes well with it
     [data-tm]           the timer: days, hours, minutes, seconds in equal cells, to the end of Black Friday (server time)
   Card: the site's Black Friday card (.slip.has-pic): picture, -50%, name, two lines, sessions (1×, 3×, 6× or 1×, 2×, 3×),
   price, „Rezervă oferta”. Name and picture lead to the treatment's page. Button → in the cart → a popup: the zone (where it
   has zones), finish or add more. Checkout: the cart, „Merge super în combinație cu” (why each one helps), other offers, the
   clinic, the hour (first session or the free consultation), the card payment (c360-pay.js, kind 'shop'). The sum is the
   server's (/api/shop). Kept on this device only: her cart and her clinic (localStorage).
   ============================================================ */
(function () {
  'use strict';
  if (window.C360Shop) return;
  var KEY = 'c360-shop3';
  var BASE = /^\/v2\//.test(location.pathname) ? '/v2/' : '/';
  var ADDR = { 'Timișoara': 'Str. Bucegi 7, Timișoara', Arad: 'Str. Ioan Alexandru 16-18, Arad' };
  var MAPS = { 'Timișoara': 'https://www.google.com/maps/search/?api=1&query=Centrul360%20Strada%20Bucegi%207%20Timisoara', Arad: 'https://www.google.com/maps/search/?api=1&query=Centrul360%20Strada%20Ioan%20Alexandru%2016-18%20Arad' };
  var WD = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'];
  var WDL = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  var MO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  var NEED = { corp: 'Corp', gusa: 'Gușă', fata: 'Față', epilare: 'Epilare' };
  var NEED_T = { corp: 'Corp', gusa: 'Gușă și contur', fata: 'Față', epilare: 'Epilare laser' };
  var I = {
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    arrow: '<svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  };
  // why each pair helps (the owner: „să dea soluții complete”)
  var WHY = {
    'liposonix>ems': 'Grăsimea pleacă, mușchiul de sub ea se tonifiază', 'liposonix>radiofrecventa': 'Strânge pielea după ce scade grăsimea', 'liposonix>cavitatie': 'Lucrează și pe celelalte depozite',
    'cavitatie>ems': 'Mai puțină grăsime, mușchi mai definit', 'cavitatie>radiofrecventa': 'Pielea rămâne fermă', 'cavitatie>liposonix': 'Pentru grăsimea cea mai încăpățânată',
    'ems>liposonix': 'Scapi și de grăsimea de deasupra mușchiului', 'ems>cavitatie': 'Mai puțină grăsime, mușchi mai definit', 'ems>impachetare': 'Detox și drenaj după tonifiere',
    'radiofrecventa>liposonix': 'Și grăsimea care nu pleacă cu sportul', 'radiofrecventa>impachetare': 'Celulita, lucrată din două părți', 'radiofrecventa>hifu-corp': 'Lifting mai profund pe aceeași zonă',
    'hifu-corp>radiofrecventa': 'Fermitate și la suprafață', 'hifu-corp>ems': 'Și mușchiul tonifiat', 'hifu-corp>liposonix': 'Și grăsimea redusă',
    'impachetare>radiofrecventa': 'Fermitate după detox', 'impachetare>cavitatie': 'Și grăsimea localizată',
    'hifu>rf-sculpt-gusa': 'Gușa redusă, conturul redefinit', 'hifu>biolifting': 'Piele mai fermă pe aceeași zonă', 'hifu>masaj-facial': 'Relaxare pentru față și gât',
    'rf-sculpt-gusa>hifu': 'Strânge și pielea de sub bărbie', 'rf-sculpt-gusa>biolifting': 'Colagen și fermitate',
    'biolifting>hifu': 'Lifting mai profund', 'biolifting>rf-sculpt-gusa': 'Gușa redusă, conturul redefinit',
    'hifu-full-face>biolifting-full-face': 'Fermitate și la suprafață', 'hifu-full-face>restart': 'Ten luminos imediat',
    'biolifting-full-face>hifu-full-face': 'Lifting mai profund', 'biolifting-full-face>restart': 'Ten luminos imediat',
    'rf-sculpt-full-face>hifu-full-face': 'Lifting mai profund', 'rf-sculpt-full-face>restart': 'Ten luminos imediat',
    'restart>masaj-facial': 'Relaxare și ten odihnit', 'restart>biolifting-full-face': 'Și fermitate', 'restart>hidratare': 'Și hidratare în profunzime',
    'masaj-facial>restart': 'Ten luminos imediat', 'masaj-facial>hidratare': 'Hidratare în profunzime',
    'hidratare>masaj-facial': 'Relaxare și ten odihnit', 'hidratare>restart': 'Ten luminos imediat',
    'antirid>biolifting-full-face': 'Colagen pentru riduri', 'antirid>hifu-full-face': 'Lifting fără operație',
    'redness>hidratare': 'Bariera pielii refăcută', 'redness>masaj-facial': 'Relaxare pentru ten sensibil',
    'sebum-off>microneedling': 'Și urmele de acnee', 'sebum-off>restart': 'Ten luminos imediat',
    'microneedling>hidratare': 'Hidratare după regenerare', 'microneedling>restart': 'Ten luminos imediat',
    'periocular>hidratare': 'Hidratare în profunzime', 'periocular>biolifting-full-face': 'Fermitate pe toată fața',
  };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var lei = function (n) { return Math.round(Number(n) || 0).toLocaleString('ro-RO') + ' lei'; };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var fev = function (n) { try { if (window.C360P) window.C360P.ev(n); } catch (e) { /* the funnel never breaks the shop */ } };
  var px = function (name, data) { try { if (window.fbq && window.C360_CONSENT) window.fbq('track', name, data || {}); } catch (e) { /* no pixel */ } };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var D = null, offset = 0;
  var S = { city: '', cart: [], zone: {}, n: {}, step: 'cart', visit: 'first', date: '', time: '', days: null, hold: null, paid: null };
  try { var kept = JSON.parse(localStorage.getItem(KEY) || 'null'); if (kept) { if (kept.city === 'Arad' || kept.city === 'Timișoara') S.city = kept.city; if (Array.isArray(kept.cart)) S.cart = kept.cart.slice(0, 12); } } catch (e) { /* private mode */ }
  var qs = new URLSearchParams(location.search);
  if (/^arad$/i.test(qs.get('oras') || '')) S.city = 'Arad'; else if (/^tim/i.test(qs.get('oras') || '')) S.city = 'Timișoara';
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify({ city: S.city, cart: S.cart })); } catch (e) { /* private mode */ } };

  // ---- the data
  var byId = function (id) { return D && D.products.filter(function (p) { return p.id === id; })[0]; };
  var zoneOf = function (p) { return p.zones.length ? (S.zone[p.id] && p.zones.indexOf(S.zone[p.id]) > -1 ? S.zone[p.id] : p.zones[0]) : ''; };
  var nameOf = function (p, zone) { return p.name + (zone ? ' ' + zone : ''); };
  var keyOf = function (id, zone) { return id + '|' + (zone || ''); };
  var lineOf = function (id, zone) { return S.cart.filter(function (l) { return l.id === id && (l.zone || '') === (zone || ''); })[0]; };
  var inCart = function (id) { return S.cart.some(function (l) { return l.id === id; }); };
  var lines = function () { return S.cart.map(function (l) { var p = byId(l.id); return p ? { p: p, zone: l.zone || '', qty: l.qty || 1, key: keyOf(l.id, l.zone) } : null; }).filter(Boolean); };
  // the sessions she can pick (the owner: 1×, 3×, 6×, or 1×, 2×, 3× for HIFU and Liposonix)
  var sessOf = function (p) { return /^(hifu|hifu-full-face|hifu-corp|liposonix)$/.test(p.id) ? [1, 2, 3] : [1, 3, 6]; };
  var nOf = function (p) { var n = S.n[p.id]; return sessOf(p).indexOf(n) > -1 ? n : 1; };
  var urlOf = function (p) { return BASE + 'tratament-' + (p.need === 'epilare' ? 'epilare' : p.id); };
  var sesWord = function (n) { return n === 1 ? '1 ședință' : n + ' ședințe'; };
  function cityNow() {
    var must = '';
    lines().forEach(function (x) { if (x.p.cities.length === 1) must = x.p.cities[0]; });
    return must || S.city || 'Timișoara';
  }
  function totals() {
    var l = lines(), full = 0, amount = 0, n = 0;
    l.forEach(function (x) { full += x.p.full * x.qty; amount += x.p.price * x.qty; n += x.qty; });
    return { lines: l, full: full, amount: amount, saved: full - amount, n: n };
  }

  // ---- the timer: equal cells, each with its unit under it
  function parts() {
    if (!D) return null;
    var ms = Date.parse(D.terms.end) - (Date.now() + offset);
    if (ms <= 0) return null;
    var s = Math.floor(ms / 1000);
    return [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60];
  }
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  var UNITS = [['zi', 'zile'], ['oră', 'ore'], ['min', 'min'], ['sec', 'sec']];
  function tmHtml(light) {
    return '<div class="tm' + (light ? ' l' : '') + '" data-tm role="timer" aria-label="Timpul rămas"><span class="tm-l">Oferta se încheie în</span><span class="tm-c">' +
      UNITS.map(function (u, i) { return '<i><b data-tmv="' + i + '">00</b><small data-tmu="' + i + '">' + u[1] + '</small></i>'; }).join('') + '</span></div>';
  }
  var ended = false;
  function tick() {
    var p = parts();
    $$('[data-tm]').forEach(function (el) {
      if (!el.querySelector('[data-tmv]')) el.outerHTML = tmHtml(el.classList.contains('l'));
    });
    $$('[data-tmv]').forEach(function (b) { var i = +b.getAttribute('data-tmv'); b.textContent = p ? two(p[i]) : '00'; });
    $$('[data-tmu]').forEach(function (u) { var i = +u.getAttribute('data-tmu'); u.textContent = p && p[i] === 1 ? UNITS[i][0] : UNITS[i][1]; });
    if (D && D.terms.bf && !p && !ended) { ended = true; load(); }
  }

  // ---- the card: the site's Black Friday card
  function sesHtml(p, light) {
    var n = nOf(p);
    return '<div class="ses' + (light ? ' l' : '') + '" role="group" aria-label="Câte ședințe">' + sessOf(p).map(function (k) { return '<button type="button" data-n="' + k + '" aria-pressed="' + (k === n) + '">' + k + '×</button>'; }).join('') + '</div>';
  }
  function cardHtml(p) {
    var z = zoneOf(p), n = nOf(p), mine = inCart(p.id);
    return '<article class="slip has-pic bfc' + (mine ? ' in' : '') + '" data-p="' + esc(p.id) + '">' +
      '<a class="pic" href="' + urlOf(p) + '" tabindex="-1" aria-hidden="true"><img src="' + esc(p.photo) + '" alt="" decoding="async"></a>' +
      '<span class="pct">-' + D.terms.pct + '%</span>' +
      '<span class="k"><b>Black Friday</b> · ' + esc(NEED[p.need] || '') + '</span>' +
      '<h3><a href="' + urlOf(p) + '">' + esc(nameOf(p, z)) + '</a></h3>' +
      '<ul class="bfc-b">' + p.b.slice(0, 2).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
      sesHtml(p) +
      '<div class="pr"><b>' + lei(p.price * n) + '</b><s>' + lei(p.full * n) + '</s></div>' +
      '<span class="per">' + (n > 1 ? sesWord(n) + ' · ' + lei(p.price) + ' / ședință' : 'o ședință') + '</span>' +
      '<button type="button" class="btn book gold bfc-cta" data-add>' + (mine ? I.check + ' În coș' : 'Rezervă oferta' + I.arrow) + '</button></article>';
  }
  function repaint(pid) {
    $$('.bfc[data-p="' + pid + '"]').forEach(function (card) {
      var t = document.createElement('div');
      t.innerHTML = cardHtml(byId(pid));
      var fresh = t.firstChild, pos = card.getAttribute('data-pos');
      if (pos != null) { fresh.setAttribute('data-pos', pos); fresh.setAttribute('aria-hidden', card.getAttribute('aria-hidden')); }
      fresh.style.transition = 'none';
      card.replaceWith(fresh);
      requestAnimationFrame(function () { fresh.style.transition = ''; });
    });
    ppBuy();
  }
  var repaintAll = function () { (D ? D.products : []).forEach(function (p) { repaint(p.id); }); epiList(); };

  // ---- the slider
  var SL = { i: 0, n: 0, el: null, timer: 0, hold: 0 };
  function slider() {
    var box = $('[data-bfs]');
    if (!box || !D) return;
    var list = D.terms.show.map(byId).filter(Boolean);
    SL.el = box; SL.n = list.length;
    box.innerHTML = '<div class="bfs-st">' + list.map(cardHtml).join('') + '</div><div class="bfs-dots" aria-hidden="true">' + list.map(function () { return '<i></i>'; }).join('') + '</div>';
    place();
    var x0 = null, y0 = 0;
    box.addEventListener('pointerdown', function (e) { x0 = e.clientX; y0 = e.clientY; pause(); });
    box.addEventListener('pointerup', function (e) {
      if (x0 == null) return;
      var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { SL.i = (SL.i + (dx < 0 ? 1 : -1) + SL.n) % SL.n; place(); SL.swiped = Date.now(); }
    });
    box.addEventListener('mouseenter', pause);
    play();
  }
  function place() {
    $$('.bfs-st > .bfc', SL.el).forEach(function (c, k) {
      var d = (k - SL.i + SL.n) % SL.n;
      if (d > SL.n / 2) d -= SL.n;
      c.setAttribute('data-pos', Math.abs(d) <= 2 ? String(d) : 'far');
      c.setAttribute('aria-hidden', String(d !== 0));
    });
    $$('.bfs-dots i', SL.el).forEach(function (d, k) { d.classList.toggle('on', k === SL.i); });
  }
  function play() { clearInterval(SL.timer); if (reduce) return; SL.timer = setInterval(function () { if (document.hidden || sheetOn || pop || Date.now() < SL.hold) return; SL.i = (SL.i + 1) % SL.n; place(); }, 5200); }
  function pause() { SL.hold = Date.now() + 9000; }

  // ---- all the offers: a glass filter, one section per need, the laser zones as a clean list
  var EPI = { g: 'f' };
  function offers() {
    var el = $('[data-bfo]');
    if (!el || !D) return;
    var keys = ['corp', 'gusa', 'fata', 'epilare'];
    el.innerHTML = '<nav class="bfo-f" aria-label="Categorii"><div class="seg d">' + keys.map(function (k, i) { return '<a href="#o-' + k + '" data-jump="' + k + '"' + (i === 0 ? ' aria-current="true"' : '') + '>' + NEED[k] + '</a>'; }).join('') + '</div></nav>' +
      keys.map(function (k) {
        var list = D.products.filter(function (p) { return p.need === k; });
        if (k !== 'epilare') return '<section class="bfo-s" id="o-' + k + '"><p class="eyb">' + NEED_T[k] + '</p><div class="bfo-g">' + list.map(cardHtml).join('') + '</div></section>';
        var fb = list.filter(function (p) { return p.id === 'epilare-full-body'; })[0];
        return '<section class="bfo-s" id="o-epilare"><p class="eyb">Epilare laser · doar Timișoara</p><div class="bfo-g">' + (fb ? cardHtml(fb) : '') +
          '<div class="epi"><div class="epi-h"><b>Pe zone</b><div class="seg d sm"><button type="button" data-g="f" aria-pressed="' + (EPI.g === 'f') + '">Femei</button><button type="button" data-g="m" aria-pressed="' + (EPI.g === 'm') + '">Bărbați</button></div></div><ul data-epi></ul>' +
          '<a class="epi-more" href="' + BASE + 'tratament-epilare">Tot despre epilarea laser' + I.chev + '</a></div></div></section>';
      }).join('');
    epiList();
    spy();
  }
  function epiList() {
    var ul = $('[data-epi]');
    if (!ul || !D) return;
    var men = EPI.g === 'm';
    var list = D.products.filter(function (p) { return p.need === 'epilare' && p.id !== 'epilare-full-body' && /bărbați$/.test(p.name) === men; });
    ul.innerHTML = list.map(function (p) {
      var has = inCart(p.id);
      return '<li><a href="' + urlOf(p) + '">' + esc(p.name.replace(/^Epilare /, '').replace(/ bărbați$/, '')) + '</a><span class="pz"><s>' + lei(p.full) + '</s><b>' + lei(p.price) + '</b></span>' +
        '<button type="button" class="sh-plus' + (has ? ' in' : '') + '" data-plus="' + esc(p.id) + '" aria-label="' + (has ? 'În coș' : 'Adaugă') + '">' + (has ? I.check : '+') + '</button></li>';
    }).join('');
  }
  function spy() {
    var nav = $('.bfo-f');
    if (!nav || !window.IntersectionObserver) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) $$('[data-jump]', nav).forEach(function (a) { a.toggleAttribute('aria-current', a.getAttribute('data-jump') === e.target.id.slice(2)); }); });
    }, { rootMargin: '-40% 0px -55% 0px' });
    $$('.bfo-s').forEach(function (s) { io.observe(s); });
  }

  // ---- a treatment's page: the buy box and what goes well with it
  function ppBuy() {
    var box = $('[data-pp]');
    if (!box || !D) return;
    var p = byId(box.getAttribute('data-pp'));
    if (!p) return;
    var z = zoneOf(p), n = nOf(p), mine = inCart(p.id);
    box.innerHTML = (p.zones.length ? '<p class="pp-l">Zona</p><div class="seg d wr">' + p.zones.map(function (x) { return '<button type="button" data-ppz="' + esc(x) + '" aria-pressed="' + (x === z) + '">' + esc(x) + '</button>'; }).join('') + '</div>' : '') +
      '<p class="pp-l">Ședințe</p>' + sesHtml(p) +
      '<div class="pp-pr"><b>' + lei(p.price * n) + '</b><s>' + lei(p.full * n) + '</s><span>' + (n > 1 ? lei(p.price) + ' / ședință' : '') + '</span></div>' +
      '<p class="pp-save">Economisești ' + lei((p.full - p.price) * n) + '</p>' +
      '<button type="button" class="btn book gold pp-cta" data-ppadd>' + (mine ? I.check + ' În coș, finalizează' : 'Rezervă oferta' + I.arrow) + '</button>' +
      '<ul class="pp-trust"><li>Plată securizată cu cardul</li><li>Alegi ora după, confirmare pe WhatsApp</li><li>' + (p.cities.length === 1 ? 'Doar în ' + esc(p.cities[0]) : 'Timișoara și Arad') + '</li></ul>';
    var hi = $('[data-pp-hi]');
    if (hi && !hi.childElementCount) hi.innerHTML = p.b.slice(0, 2).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '<li>' + p.minutes + ' min / ședință</li>';
    var pr = $('[data-pp-pairs]');
    if (pr) pr.innerHTML = p.pairs.map(byId).filter(Boolean).map(function (q) { return pairHtml(p, q, true); }).join('');
    ppSticky(p, n, mine);
  }
  // the treatment page's buy bar (phone): appears when the buy box is out of sight
  var ppBar = null;
  function ppSticky(p, n, mine) {
    if (!ppBar) {
      ppBar = document.createElement('div'); ppBar.className = 'pp-bar';
      document.body.appendChild(ppBar);
      var box = $('[data-pp]');
      if (window.IntersectionObserver && box) new IntersectionObserver(function (es) { es.forEach(function (e) { ppBar.classList.toggle('on', !e.isIntersecting && e.boundingClientRect.top < 0); document.body.classList.toggle('pp-bar-on', !e.isIntersecting && e.boundingClientRect.top < 0); }); }).observe(box);
    }
    ppBar.innerHTML = '<div><b>' + esc(nameOf(p, zoneOf(p))) + '</b><span><s>' + lei(p.full * n) + '</s> ' + lei(p.price * n) + '</span></div><button type="button" class="btn book gold" data-ppadd>' + (mine ? 'Finalizează' : 'Rezervă') + I.arrow + '</button>';
  }
  function pairHtml(from, q, dark) {
    var z = zoneOf(q), has = inCart(q.id);
    return '<div class="pair' + (dark ? ' d' : '') + '" data-href="' + urlOf(q) + '"><span class="th"><img src="' + esc(q.photo) + '" alt=""></span>' +
      '<div><a href="' + urlOf(q) + '"><b>' + esc(nameOf(q, z)) + '</b></a><small>' + esc(WHY[from.id + '>' + q.id] || 'Se completează bine') + '</small><span class="pz"><s>' + lei(q.full) + '</s> <b>' + lei(q.price) + '</b></span></div>' +
      '<button type="button" class="sh-plus' + (has ? ' in' : '') + '" data-plus="' + esc(q.id) + '" data-pz="' + esc(z) + '" aria-label="' + (has ? 'În coș' : 'Adaugă') + '">' + (has ? I.check : '+') + '</button></div>';
  }

  // ---- the cart
  function add(id, zone, qty) {
    var p = byId(id);
    if (!p) return;
    var had = lineOf(id, zone);
    if (had) had.qty = Math.min(10, qty || had.qty);
    else S.cart.push({ id: id, zone: zone || '', qty: qty || 1 });
    save();
    fev('cart');
    px('AddToCart', { value: p.price * (qty || 1), currency: 'RON', content_ids: [id], content_type: 'product', content_name: nameOf(p, zone) });
    repaint(id); headCart(true); bar(true); epiList();
    if (sheetOn) paneCart();
  }
  function setQty(key, d) {
    S.cart = S.cart.map(function (l) { if (keyOf(l.id, l.zone) === key) l.qty = Math.max(0, Math.min(10, (l.qty || 1) + d)); return l; }).filter(function (l) { return l.qty > 0; });
    save(); repaintAll(); headCart(); bar(); if (sheetOn) paneCart();
  }
  function headCart(bump) {
    var bar0 = $('.top .bar');
    if (!bar0) return;
    var b = $('.sh-hcart', bar0);
    if (!b) {
      b = document.createElement('button');
      b.type = 'button'; b.className = 'sh-hcart'; b.setAttribute('data-cart', ''); b.setAttribute('aria-label', 'Coșul');
      b.innerHTML = I.cart + '<i></i>';
      bar0.insertBefore(b, $('.burger', bar0) || null);
    }
    var n = totals().n;
    $('i', b).textContent = n || '';
    b.classList.toggle('has', n > 0);
    if (bump && n) { b.classList.remove('sh-bump'); void b.offsetWidth; b.classList.add('sh-bump'); }
  }
  function bar(bump) {
    var b = $('.sh-bar');
    if (!b) {
      b = document.createElement('div');
      b.className = 'sh-bar';
      b.innerHTML = '<button type="button" data-cart><span class="ct">' + I.cart + '<span></span></span><span class="tx"></span><span class="cta">Finalizează' + I.arrow + '</span></button>';
      document.body.appendChild(b);
    }
    var t = totals();
    b.classList.toggle('on', t.lines.length > 0 && !sheetOn && !pop);
    $('.ct span', b).textContent = t.n;
    $('.tx', b).textContent = lei(t.amount);
    if (bump) { b.classList.remove('sh-bump'); void b.offsetWidth; b.classList.add('sh-bump'); }
  }

  // ---- the popup after „Rezervă oferta”: the zone, then finish or add more
  var pop = null, veil = null;
  function needVeil() { if (!veil) { veil = document.createElement('div'); veil.className = 'sh-veil'; document.body.appendChild(veil); veil.addEventListener('click', function () { if (pop) closePop(); else closeSheet(); }); } return veil; }
  function popInner(p, zone) {
    var l = lineOf(p.id, zone), n = l ? l.qty : 1;
    return '<div class="ok"><i>' + I.check + '</i>Adăugat în coș</div>' +
      '<div class="it"><span class="th"><img src="' + esc(p.photo) + '" alt=""></span><div><b>' + esc(nameOf(p, zone)) + '</b><small>' + sesWord(n) + '</small></div><div class="pz"><s>' + lei(p.full * n) + '</s><b>' + lei(p.price * n) + '</b></div></div>' +
      (p.zones.length ? '<p class="zq">Ce zonă?</p><div class="seg l wr">' + p.zones.map(function (x) { return '<button type="button" data-pzone="' + esc(x) + '" aria-pressed="' + (x === zone) + '">' + esc(x) + '</button>'; }).join('') + '</div>' : '') +
      '<button type="button" class="sh-go" data-checkout>Finalizează rezervarea' + I.arrow + '</button>' +
      '<button type="button" class="sh-more" data-shop-on>Mai adaug și altele</button>';
  }
  function openPop(id, zone, from) {
    var p = byId(id);
    if (!p) return;
    needVeil();
    pop = document.createElement('div');
    pop.className = 'sh-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); pop.setAttribute('data-id', id); pop.setAttribute('data-zone', zone || '');
    pop.innerHTML = popInner(p, zone);
    document.body.appendChild(pop);
    if (from && !reduce) { var r = from.getBoundingClientRect(), q = pop.getBoundingClientRect(); pop.style.transformOrigin = (r.left + r.width / 2 - q.left) + 'px ' + (r.top + r.height / 2 - q.top) + 'px'; }
    bar();
    requestAnimationFrame(function () { requestAnimationFrame(function () { pop.classList.add('on'); veil.classList.add('on'); }); });
  }
  function popZone(zone) {
    var id = pop && pop.getAttribute('data-id'), old = pop && pop.getAttribute('data-zone');
    if (!id || zone === old) return;
    var l = lineOf(id, old), other = lineOf(id, zone);
    if (l && !other) l.zone = zone;
    else if (l && other) { other.qty = Math.min(10, (other.qty || 1) + (l.qty || 1)); S.cart = S.cart.filter(function (x) { return x !== l; }); }
    S.zone[id] = zone; save();
    pop.setAttribute('data-zone', zone);
    pop.innerHTML = popInner(byId(id), zone);
    repaint(id);
  }
  function closePop(then) {
    if (!pop) return;
    var p = pop; pop = null;
    p.classList.remove('on');
    if (!then) veil.classList.remove('on');
    setTimeout(function () { p.remove(); bar(); if (then) then(); }, then ? 120 : 420);
  }

  // ---- the checkout
  var sheet = null, sheetOn = false;
  var ORDER = ['cart', 'when', 'pay', 'done'];
  var TITLES = { cart: 'Coșul tău', when: 'Alege ora', pay: 'Plata', done: 'Gata' };
  function openSheet(step) {
    needVeil();
    if (!sheet) {
      sheet = document.createElement('div'); sheet.className = 'sh-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
      sheet.innerHTML = '<div class="sh-sh"><button type="button" class="sh-ic" data-back hidden aria-label="Înapoi">' + I.back + '</button><h3></h3><button type="button" class="sh-ic" data-close aria-label="Închide">' + I.x + '</button></div><div class="sh-body">' +
        ORDER.map(function (s) { return '<div class="sh-pane r" data-pane="' + s + '"></div>'; }).join('') + '</div>';
      document.body.appendChild(sheet);
    }
    sheetOn = true;
    bar();
    document.body.classList.add('sh-lock');
    go(step || 'cart', true);
    requestAnimationFrame(function () { veil.classList.add('on'); sheet.classList.add('on'); });
  }
  function closeSheet() {
    if (!sheet || !sheetOn) return;
    if (S.step === 'pay' && S.hold) release();
    sheet.classList.remove('on'); veil.classList.remove('on');
    sheetOn = false;
    document.body.classList.remove('sh-lock');
    if (S.step === 'done') { S.step = 'cart'; S.paid = null; }
    setTimeout(bar, 300);
  }
  function go(step, instant) {
    var to = ORDER.indexOf(step);
    if (S.step === 'pay' && step !== 'pay' && step !== 'done' && S.hold) release();
    S.step = step;
    $('.sh-sh h3', sheet).textContent = TITLES[step];
    $('[data-back]', sheet).hidden = step === 'cart' || step === 'done';
    ({ cart: paneCart, when: paneWhen, pay: panePay, done: paneDone })[step]();
    $$('.sh-pane', sheet).forEach(function (p) {
      var i = ORDER.indexOf(p.getAttribute('data-pane'));
      if (instant) p.style.transition = 'none';
      p.classList.toggle('l', i < to); p.classList.toggle('r', i > to);
      if (instant) { void p.offsetWidth; p.style.transition = ''; }
    });
    var cur = pane(step); if (cur) cur.scrollTop = 0;
    tick();
  }
  function pane(s) { return $('[data-pane="' + s + '"]', sheet); }
  function tileHtml(p) {
    var z = zoneOf(p), has = inCart(p.id);
    return '<div class="tile" data-href="' + urlOf(p) + '"><span class="th"><img src="' + esc(p.photo) + '" alt=""></span><a href="' + urlOf(p) + '"><b>' + esc(nameOf(p, z)) + '</b></a>' +
      '<span class="pz"><s>' + lei(p.full) + '</s> <b>' + lei(p.price) + '</b></span>' +
      '<button type="button" class="sh-plus' + (has ? ' in' : '') + '" data-plus="' + esc(p.id) + '" data-pz="' + esc(z) + '" aria-label="' + (has ? 'În coș' : 'Adaugă') + '">' + (has ? I.check : '+') + '</button></div>';
  }
  function paneCart() {
    var el = pane('cart'), t = totals();
    if (!t.lines.length) { el.innerHTML = '<div class="sh-empty"><p>Coșul e gol.</p><a class="sh-go" href="' + BASE + 'oferte-bf">Vezi ofertele' + I.arrow + '</a></div>'; return; }
    var city = cityNow(), tmOnly = t.lines.some(function (x) { return x.p.cities.length === 1; });
    var mine = {}; t.lines.forEach(function (x) { mine[x.p.id] = 1; });
    var pairs = [];
    t.lines.forEach(function (x) { x.p.pairs.forEach(function (id) { var q = byId(id); if (q && !mine[q.id] && q.cities.indexOf(city) > -1 && !pairs.some(function (y) { return y.q === q; })) pairs.push({ from: x.p, q: q }); }); });
    pairs = pairs.slice(0, 3);
    var rest = D.terms.show.map(byId).filter(function (p) { return p && !mine[p.id] && !pairs.some(function (y) { return y.q === p; }) && p.cities.indexOf(city) > -1; }).slice(0, 4);
    el.innerHTML = tmHtml(true) +
      '<ul class="sh-lines">' + t.lines.map(function (x) {
        var no = x.p.cities.indexOf(city) < 0;
        return '<li><a class="th" href="' + urlOf(x.p) + '"><img src="' + esc(x.p.photo) + '" alt=""></a><div><a href="' + urlOf(x.p) + '"><b>' + esc(nameOf(x.p, x.zone)) + '</b></a>' + (no ? '<small class="warn">Doar în ' + esc(x.p.cities[0]) + '</small>' : '') +
          '<span class="qty"><button type="button" data-q="-1" data-k="' + esc(x.key) + '" aria-label="O ședință mai puțin">−</button><span>' + sesWord(x.qty) + '</span><button type="button" data-q="1" data-k="' + esc(x.key) + '" aria-label="Încă o ședință">+</button></span></div>' +
          '<div class="pz"><s>' + lei(x.p.full * x.qty) + '</s><b>' + lei(x.p.price * x.qty) + '</b></div></li>';
      }).join('') + '</ul>' +
      (pairs.length ? '<p class="sh-lab">Merge super în combinație cu</p><div class="pairs">' + pairs.map(function (y) { return pairHtml(y.from, y.q, false); }).join('') + '</div>' : '') +
      (rest.length ? '<p class="sh-lab">Alte oferte -' + D.terms.pct + '%</p><div class="tiles">' + rest.map(tileHtml).join('') + '</div><a class="sh-link" href="' + BASE + 'oferte-bf">Vezi toate ofertele' + I.chev + '</a>' : '') +
      '<p class="sh-lab">Clinica</p><div class="seg l full">' + ['Timișoara', 'Arad'].map(function (c) { return '<button type="button" data-city="' + c + '" aria-pressed="' + (c === city) + '"' + (tmOnly && c === 'Arad' ? ' disabled' : '') + '>' + c + '</button>'; }).join('') + '</div>' +
      (tmOnly ? '<p class="sh-fine">EMS, împachetarea și epilarea laser sunt doar în Timișoara.</p>' : '') +
      '<div class="sh-stack"><div><span>Preț normal</span><span>' + lei(t.full) + '</span></div><div class="sv"><span>Black Friday -' + D.terms.pct + '%</span><span>-' + lei(t.saved) + '</span></div><div class="tot"><span>Total</span><b>' + lei(t.amount) + '</b></div></div>' +
      '<button type="button" class="sh-go" data-go="when">Alege ora' + I.arrow + '</button>' +
      '<p class="sh-fine">Plata doar online, cu cardul. Programarea se confirmă după plată.</p>';
  }
  function mainLine() { return totals().lines.slice().sort(function (a, b) { return b.p.full - a.p.full; })[0]; }
  function paneWhen() {
    var el = pane('when'), m = mainLine();
    if (!m) { go('cart'); return; }
    S.city = cityNow(); save();
    fev('checkout');
    px('InitiateCheckout', { value: totals().amount, currency: 'RON', num_items: totals().n });
    el.innerHTML = '<div class="opt">' +
      '<button type="button" data-visit="first" aria-pressed="' + (S.visit === 'first') + '"><i></i><span><b>Încep direct</b><small>Prima ședință: ' + esc(nameOf(m.p, m.zone)) + ', ' + m.p.minutes + ' min</small></span></button>' +
      '<button type="button" data-visit="consult" aria-pressed="' + (S.visit === 'consult') + '"><i></i><span><b>Vin întâi la consultația gratuită</b><small>30 min, îți spunem ce ți se potrivește</small></span></button></div>' +
      '<p class="sh-lab">Ziua · Centrul360 ' + esc(S.city) + '</p><div data-days><div class="sh-wait">Caut orele libere…</div></div><div data-slots></div>' +
      '<button type="button" class="sh-go" data-go="pay" ' + (S.time ? '' : 'disabled') + '>Plătește ' + lei(totals().amount) + I.arrow + '</button>';
    days();
  }
  var daysKey = '';
  function days() {
    var m = mainLine(), el = pane('when');
    var k = S.city + '|' + S.visit + '|' + (S.visit === 'first' ? m.p.ref : '');
    if (k !== daysKey) { daysKey = k; S.days = null; S.date = ''; S.time = ''; }
    if (S.days) { drawDays(); return; }
    var url = '/api/booking?city=' + encodeURIComponent(S.city) + (S.visit === 'consult' ? '&service=consult' : '&service=custom&treatment=' + encodeURIComponent(m.p.ref));
    fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (d) {
      if (k !== daysKey) return;
      S.days = (d && d.on && d.days) || [];
      drawDays();
    }, function () { var x = $('[data-days]', el); if (x) x.innerHTML = '<div class="sh-alert">Nu am putut încărca orele. Verifică internetul și încearcă din nou.</div>'; });
  }
  function drawDays() {
    var el = pane('when'), box = $('[data-days]', el);
    if (!box) return;
    var list = (S.days || []).slice(0, 21), open = list.filter(function (d) { return d.slots && d.slots.length; });
    if (!open.length) { box.innerHTML = '<div class="sh-alert">Nu mai sunt ore libere online în zilele următoare. Încearcă cealaltă variantă de mai sus.</div>'; $('[data-slots]', el).innerHTML = ''; return; }
    if (!S.date || !open.some(function (d) { return d.date === S.date; })) S.date = open[0].date;
    box.innerHTML = '<div class="days">' + list.map(function (d) {
      var x = new Date(d.date + 'T12:00:00');
      return '<button type="button" data-day="' + d.date + '" aria-pressed="' + (d.date === S.date) + '"' + (d.slots && d.slots.length ? '' : ' disabled') + '><small>' + WD[x.getDay()] + '</small><b>' + x.getDate() + '</b></button>';
    }).join('') + '</div>';
    var day = list.filter(function (d) { return d.date === S.date; })[0];
    if (S.time && day.slots.indexOf(S.time) < 0) S.time = '';
    $('[data-slots]', el).innerHTML = '<p class="sh-lab">Ora · ' + esc(nice(S.date)) + '</p><div class="slots">' + day.slots.map(function (t) { return '<button type="button" data-time="' + t + '" aria-pressed="' + (t === S.time) + '">' + t + '</button>'; }).join('') + '</div>';
    var b = $('[data-go="pay"]', el); if (b) b.disabled = !S.time;
  }
  function nice(date) { var x = new Date(date + 'T12:00:00'); return WDL[x.getDay()] + ' ' + x.getDate() + ' ' + MO[x.getMonth()]; }

  var payP = null;
  function payScript() {
    if (window.C360Pay) return Promise.resolve(window.C360Pay);
    if (!payP) payP = new Promise(function (ok, no) { var s = document.createElement('script'); s.src = '/c360-pay.js'; s.async = true; s.onload = function () { return window.C360Pay ? ok(window.C360Pay) : no(); }; s.onerror = function () { payP = null; no(); }; document.head.appendChild(s); });
    return payP;
  }
  function release() {
    var h = S.hold; S.hold = null;
    if (h) fetch('/api/booking', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ release: h.id, key: h.key }) }).catch(function () {});
  }
  function panePay() {
    var el = pane('pay'), t = totals(), mine = {};
    S.payRun = mine;
    el.innerHTML = '<div class="when"><b>' + esc(nice(S.date).replace(/^./, function (c) { return c.toUpperCase(); })) + ', ora ' + esc(S.time) + '</b><span>Centrul360 ' + esc(S.city) + '</span></div><div data-pay><div class="sh-wait">Pregătesc plata…</div></div>';
    fev('pay');
    var src = null; try { src = window.C360Src ? window.C360Src() : null; } catch (e) { /* none */ }
    var fail = function () { if (S.payRun === mine) $('[data-pay]', el).innerHTML = '<div class="sh-alert">Nu am putut porni plata. Verifică internetul și încearcă din nou.</div><button type="button" class="sh-go" data-go="when">Înapoi</button>'; };
    payScript().then(function (P) {
      return P.ready().then(function (on) {
        if (S.payRun !== mine) return;
        if (!on) { $('[data-pay]', el).innerHTML = '<div class="sh-alert">Plata online nu e pornită încă pe această pagină.</div>'; return; }
        var holdP = fetch('/api/shop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'hold', city: S.city, items: t.lines.map(function (x) { return { id: x.p.id, zone: x.zone, qty: x.qty }; }), visit: S.visit, date: S.date, time: S.time, page: location.pathname, src: src }) })
          .then(function (r) { return r.json(); }, function () { return { error: 'net' }; })
          .then(function (d) {
            if (S.payRun !== mine) { if (d && d.hold) fetch('/api/booking', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ release: d.hold.id, key: d.hold.key }) }).catch(function () {}); return Promise.reject({ code: 'gone' }); }
            if (!d || !d.hold) return Promise.reject({ code: (d && d.error) || 'net' });
            S.hold = d.hold;
            return d.hold.id;
          });
        var me = null; try { me = JSON.parse(localStorage.getItem('c360-book-me') || 'null'); } catch (e) { /* none */ }
        P.open({
          kind: 'shop', ref: holdP, city: S.city, page: location.pathname, mount: $('[data-pay]', el),
          preview: { amount: t.amount, full: t.full, title: t.lines.map(function (x) { return nameOf(x.p, x.zone) + (x.qty > 1 ? ' × ' + x.qty : ''); }).join(' + '), bonusText: '-' + D.terms.pct + '% Black Friday' },
          contact: me && me.name ? { name: me.name, phone: me.phone } : undefined,
          onContact: function (c) { try { localStorage.setItem('c360-book-me', JSON.stringify({ name: c.name, phone: c.phone })); } catch (e) { /* private mode */ } },
          onError: function (code) {
            if (S.payRun !== mine || code === 'gone') return;
            if (code === 'taken') { S.time = ''; S.days = null; daysKey = ''; go('when'); setTimeout(function () { var w = pane('when'); if (w) w.insertAdjacentHTML('afterbegin', '<div class="sh-alert">Ora aleasă tocmai a fost ocupată. Alege, te rog, altă oră.</div>'); }, 300); return; }
            fail();
          },
          onPaid: function (r) {
            if (S.payRun !== mine) return;
            S.paid = { amount: r.amount || t.amount, confirmed: r.confirmed, date: S.date, time: S.time, city: S.city, lines: t.lines.map(function (x) { return nameOf(x.p, x.zone) + ', ' + sesWord(x.qty); }), visit: S.visit };
            S.hold = null; S.cart = []; save(); S.time = ''; S.days = null; daysKey = '';
            go('done'); bar(); headCart(); repaintAll();
          },
        });
      });
    }, fail);
  }
  function paneDone() {
    var el = pane('done'), p = S.paid;
    if (!p) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="sh-done"><div class="ok">' + I.check + '</div><h2>Plătit. Ne vedem ' + esc(nice(p.date)) + '.</h2><p>' + (p.confirmed ? 'Programarea e confirmată. Îți trimitem confirmarea și pe WhatsApp.' : 'Banca mai confirmă plata câteva clipe. Îți scriem pe WhatsApp imediat ce vine.') + '</p>' +
      '<div class="dcard"><div><b>' + esc(nice(p.date).replace(/^./, function (c) { return c.toUpperCase(); })) + ', ora ' + esc(p.time) + '</b><small>' + (p.visit === 'consult' ? 'Consultația gratuită' : 'Prima ședință') + '</small></div>' +
      '<div><b>' + lei(p.amount) + ', plătit online</b><small>' + p.lines.map(esc).join('<br>') + '</small></div>' +
      '<div><b>Centrul360 ' + esc(p.city) + '</b><small>' + esc(ADDR[p.city]) + ' · <a href="' + MAPS[p.city] + '" target="_blank" rel="noopener">Vezi pe hartă</a></small></div></div>' +
      '<button type="button" class="sh-go" data-close>Închide</button></div>';
  }

  // ---- taps
  document.addEventListener('click', function (e) {
    var t = e.target;
    var card = t.closest('.bfc[data-p]');
    // a card on the side of the slider comes to the middle first
    if (card && card.closest('.bfs-st') && card.getAttribute('data-pos') !== '0') {
      e.preventDefault();
      if (SL.swiped && Date.now() - SL.swiped < 400) return;
      SL.i = $$('.bfs-st > .bfc', SL.el).indexOf(card); place(); pause(); return;
    }
    var nb = t.closest('[data-n]');
    if (nb) { var host = nb.closest('[data-p]') || nb.closest('[data-pp]'), pid = host && (host.getAttribute('data-p') || host.getAttribute('data-pp')); if (pid) { S.n[pid] = +nb.getAttribute('data-n'); var p0 = byId(pid), l0 = lineOf(pid, zoneOf(p0)); if (l0) { l0.qty = S.n[pid]; save(); headCart(); bar(); } repaint(pid); pause(); } return; }
    var a = t.closest('[data-add]');
    if (a && card) { var p = byId(card.getAttribute('data-p')), z = zoneOf(p); pause(); if (inCart(p.id)) { openSheet('cart'); return; } add(p.id, z, nOf(p)); openPop(p.id, z, a); return; }
    if (t.closest('[data-ppadd]')) { var pp = byId($('[data-pp]').getAttribute('data-pp')); if (inCart(pp.id)) { openSheet('cart'); return; } add(pp.id, zoneOf(pp), nOf(pp)); openPop(pp.id, zoneOf(pp), t.closest('[data-ppadd]')); return; }
    var ppz = t.closest('[data-ppz]'); if (ppz) { S.zone[$('[data-pp]').getAttribute('data-pp')] = ppz.getAttribute('data-ppz'); ppBuy(); return; }
    var pz = t.closest('[data-pzone]'); if (pz) { popZone(pz.getAttribute('data-pzone')); return; }
    if (t.closest('[data-checkout]')) { closePop(function () { openSheet('cart'); }); return; }
    if (t.closest('[data-shop-on]')) { closePop(); return; }
    var plus = t.closest('[data-plus]'); if (plus) { var id = plus.getAttribute('data-plus'), z2 = plus.getAttribute('data-pz') || ''; if (lineOf(id, z2)) setQty(keyOf(id, z2), -99); else add(id, z2, 1); return; }
    var q = t.closest('[data-q]'); if (q) { setQty(q.getAttribute('data-k'), Number(q.getAttribute('data-q'))); return; }
    var g = t.closest('[data-g]'); if (g) { EPI.g = g.getAttribute('data-g'); $$('[data-g]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === g)); }); epiList(); return; }
    var j = t.closest('[data-jump]'); if (j) { e.preventDefault(); var s = $('#o-' + j.getAttribute('data-jump')); if (s) scrollTo({ top: s.getBoundingClientRect().top + scrollY - 140, behavior: reduce ? 'auto' : 'smooth' }); return; }
    if (t.closest('[data-cart]')) { openSheet('cart'); return; }
    if (t.closest('[data-close]')) { closeSheet(); return; }
    if (t.closest('[data-back]')) { go(ORDER[Math.max(0, ORDER.indexOf(S.step) - 1)]); return; }
    var gg = t.closest('[data-go]'); if (gg && sheet && sheet.contains(gg)) { go(gg.getAttribute('data-go')); return; }
    var c = t.closest('[data-city]'); if (c && !c.disabled) { S.city = c.getAttribute('data-city'); save(); paneCart(); return; }
    var v = t.closest('[data-visit]'); if (v) { S.visit = v.getAttribute('data-visit'); $$('[data-visit]', sheet).forEach(function (b) { b.setAttribute('aria-pressed', String(b === v)); }); days(); return; }
    var dy = t.closest('[data-day]'); if (dy) { S.date = dy.getAttribute('data-day'); S.time = ''; drawDays(); return; }
    var tm = t.closest('[data-time]'); if (tm) { S.time = tm.getAttribute('data-time'); drawDays(); return; }
    // a whole suggestion row opens its treatment's page
    var row = t.closest('[data-href]'); if (row && !t.closest('a,button')) { location.href = row.getAttribute('data-href'); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (pop) closePop(); else if (sheetOn) closeSheet(); } });

  function load() {
    return fetch('/api/shop', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) return;
      D = d; offset = d.terms.now - Date.now();
      S.cart = S.cart.filter(function (l) { return l && byId(l.id); });
      slider(); offers(); ppBuy(); headCart(); bar(); tick();
      if (/[?&#]cos\b/.test(location.search + location.hash) && lines().length) openSheet('cart');
    }).catch(function () { var g = $('[data-bfo]') || $('[data-bfs]'); if (g) g.innerHTML = '<div class="sh-alert">Nu am putut încărca ofertele. Reîncarcă pagina.</div>'; });
  }
  // the preview: the menu's Black Friday links go to the preview's offers page
  if (BASE === '/v2/') $$('a[href="/v2/oferte"]').forEach(function (a) { a.setAttribute('href', '/v2/oferte-bf'); });
  // no booking without paying (the owner, 24.11): the header's and the menu's booking buttons lead to the offers
  $$('.top .top-cta, .menu [data-book], .dock [data-book]').forEach(function (b) {
    var a = document.createElement('a'); a.className = b.className; a.href = BASE + 'oferte-bf'; a.innerHTML = 'Oferte -50%' + I.arrow; b.replaceWith(a);
  });
  window.C360Shop = { add: add, open: function () { openSheet('cart'); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
  setInterval(tick, 1000);
  addEventListener('pagehide', function () { if (S.hold) release(); });
})();
