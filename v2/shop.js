/* ============================================================
   Centrul360, the shop (the owner, 24.11: „site-ul devine strict un magazin online”).
   She picks her clinic, puts treatments in the cart (each with its package), sees what goes well with each one, sees how
   much more brings the next gift, picks the hour (her first session or the free consultation) and pays by card in the
   page (c360-pay.js, kind 'shop'). The prices, the discount and the gifts are the server's (/api/shop); the page only shows
   them. The timer counts down to the end of Black Friday, the same moment for everyone (the server's clock).
   Motion: what she taps becomes the next screen (the card grows into the product, the bar grows into the cart), back goes
   back to where it came from.
   Markup it fills: [data-sh-city] (the clinic switch), [data-sh-needs], [data-sh-grid], [data-sh-steps], [data-sh-clock].
   Kept on this device only: her clinic and her cart (localStorage 'c360-shop').
   ============================================================ */
(function () {
  'use strict';
  if (window.C360Shop) return;
  var KEY = 'c360-shop';
  var ADDR = { 'Timișoara': 'Str. Bucegi 7, Timișoara', Arad: 'Str. Ioan Alexandru 16-18, Arad' };
  var MAPS = { 'Timișoara': 'https://www.google.com/maps/search/?api=1&query=Centrul360%20Strada%20Bucegi%207%20Timisoara', Arad: 'https://www.google.com/maps/search/?api=1&query=Centrul360%20Strada%20Ioan%20Alexandru%2016-18%20Arad' };
  var WD = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'];
  var WDL = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  var MO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  var I = {
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var lei = function (n) { return Math.round(Number(n) || 0).toLocaleString('ro-RO') + ' lei'; };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var fev = function (n) { try { if (window.C360P) window.C360P.ev(n); } catch (e) { /* the funnel never breaks the shop */ } };
  var px = function (name, data) { try { if (window.fbq && window.C360_CONSENT) window.fbq('track', name, data || {}); } catch (e) { /* no pixel */ } };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var D = null, offset = 0; // the server's catalog and terms; its clock minus ours
  var S = { city: 'Timișoara', cart: [], need: 'top', sel: {}, step: 'cart', visit: 'first', date: '', time: '', days: null, hold: null, paid: null };
  try { var kept = JSON.parse(localStorage.getItem(KEY) || 'null'); if (kept) { if (kept.city === 'Arad' || kept.city === 'Timișoara') S.city = kept.city; if (Array.isArray(kept.cart)) S.cart = kept.cart.slice(0, 12); } } catch (e) { /* private mode */ }
  var q = new URLSearchParams(location.search);
  if (/^(corp|gusa|fata|epilare)$/.test(q.get('nevoie') || '')) S.need = q.get('nevoie');
  if (/^arad$/i.test(q.get('oras') || '')) S.city = 'Arad'; else if (/^tim/i.test(q.get('oras') || '')) S.city = 'Timișoara';
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify({ city: S.city, cart: S.cart })); } catch (e) { /* private mode */ } };

  // ---- the data
  var products = function () { return D ? D.products.filter(function (p) { return p.cities.indexOf(S.city) > -1; }) : []; };
  var byId = function (id) { return D && D.products.filter(function (p) { return p.id === id; })[0]; };
  var optOf = function (oid) { var hit = null; (D ? D.products : []).some(function (p) { return p.options.some(function (o) { if (o.id === oid) { hit = { p: p, o: o }; return true; } return false; }); }); return hit; };
  var inCart = function (pid) { var hit = ''; S.cart.forEach(function (oid) { var x = optOf(oid); if (x && x.p.id === pid) hit = oid; }); return hit; };
  var selOf = function (p) { return S.sel[p.id] || inCart(p.id) || p.options[0].id; };
  function lines() { return S.cart.map(optOf).filter(function (x) { return x && x.p.cities.indexOf(S.city) > -1; }); }
  function totals() {
    var l = lines(), full = 0, amount = 0;
    l.forEach(function (x) { full += x.o.full; amount += x.o.price; });
    var tiers = (D && D.terms.tiers) || [];
    var reached = tiers.filter(function (t) { return amount >= t.at; }), next = tiers.filter(function (t) { return amount < t.at; })[0] || null;
    var gifts = reached.reduce(function (s, t) { return s + (t.value || 0); }, 0);
    return { lines: l, full: full, amount: amount, saved: full - amount, reached: reached, next: next, gifts: gifts, tiers: tiers };
  }

  // ---- the timer: to the end of Black Friday (the server's moment, the server's clock)
  function left() {
    if (!D) return '';
    var ms = Date.parse(D.terms.end) - (Date.now() + offset);
    if (ms <= 0) return '';
    var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
    var two = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d ? d + (d === 1 ? ' zi ' : ' zile ') : '') + two(h) + ':' + two(m) + ':' + two(ss);
  }
  var ended = false;
  function tick() {
    var t = left();
    $$('[data-sh-clock]').forEach(function (el) { el.textContent = t || 'încheiat'; });
    if (D && D.terms.bf && !t && !ended) { ended = true; load(); }
  }

  // ---- the catalog
  function cardHtml(p) {
    var oid = selOf(p), o = p.options.filter(function (x) { return x.id === oid; })[0] || p.options[0];
    var mine = inCart(p.id) === o.id;
    var per = o.sessions > 1 ? Math.round(o.price / o.sessions) : 0;
    return '<article class="sh-p' + (mine ? ' open' : '') + '" data-p="' + esc(p.id) + '">' +
      '<button type="button" class="sh-pimg" data-open aria-label="Vezi ' + esc(p.name) + '"><img src="/brand_asset/' + esc(p.img) + '" alt="" loading="lazy" draggable="false">' +
      (D.terms.bf ? '<span class="sh-off">-' + D.terms.pct + '%</span>' : '') + (p.top ? '<span class="sh-hot">Cea mai cerută</span>' : '') + '</button>' +
      '<div class="sh-pb"><h3><button type="button" data-open>' + esc(p.name) + '</button></h3><p>' + esc(p.d) + '</p>' +
      (p.options.length > 1 ? '<div class="sh-opts" role="group" aria-label="Pachet">' + p.options.map(function (x) { return '<button type="button" data-opt="' + esc(x.id) + '" aria-pressed="' + (x.id === o.id) + '">' + esc(x.label) + '</button>'; }).join('') + '</div>' : '') +
      '<div class="sh-row"><div class="sh-price"><s>' + lei(o.full) + '</s><b>' + lei(o.price) + '</b>' + (per ? '<em>' + lei(per) + ' / ședință</em>' : '') + '</div>' +
      '<button type="button" class="sh-add' + (mine ? ' in' : '') + '" data-add>' + (mine ? I.check + 'În coș' : I.cart + 'Adaugă') + '</button></div>' +
      pairHtml(p) + '</div></article>';
  }
  function pairHtml(p) {
    var list = p.pairs.map(byId).filter(function (x) { return x && x.cities.indexOf(S.city) > -1; }).slice(0, 2);
    if (!list.length) return '';
    return '<div class="sh-pair"><div><h4>Merge bine cu</h4>' + list.map(function (x) {
      var o = x.options[0], has = !!inCart(x.id);
      return '<div class="sh-mini"><img src="/brand_asset/' + esc(x.img) + '" alt="" loading="lazy"><div><b>' + esc(x.name) + '</b><small><s>' + lei(o.full) + '</s> ' + lei(o.price) + ' · ' + esc(o.label) + '</small></div>' +
        '<button type="button" class="sh-plus' + (has ? ' in' : '') + '" data-plus="' + esc(o.id) + '">' + (has ? '✓' : '+ Adaugă') + '</button></div>';
    }).join('') + '</div></div>';
  }
  function grid() {
    var el = $('[data-sh-grid]');
    if (!el || !D) return;
    var list = products(), needs = D.terms.needs.filter(function (n) { return list.some(function (p) { return p.need === n.id; }); });
    var nb = $('[data-sh-needs]');
    if (nb) {
      if (S.need !== 'top' && !needs.some(function (n) { return n.id === S.need; })) S.need = 'top';
      nb.innerHTML = '<button type="button" data-need="top" aria-pressed="' + (S.need === 'top') + '">Cele mai cerute</button>' + needs.map(function (n) { return '<button type="button" data-need="' + n.id + '" aria-pressed="' + (S.need === n.id) + '">' + esc(n.title) + '</button>'; }).join('');
    }
    if (S.need === 'top') {
      el.innerHTML = '<div class="sh-group"><h2>Cele mai cerute</h2><p>Alegerile clientelor noastre. Restul tratamentelor sunt pe categorii, mai sus.</p></div>' + list.filter(function (p) { return p.top; }).map(cardHtml).join('');
      return;
    }
    el.innerHTML = needs.filter(function (n) { return S.need === n.id; }).map(function (n) {
      var ps = list.filter(function (p) { return p.need === n.id; }).sort(function (a, b) { return (b.top || 0) - (a.top || 0); });
      return '<div class="sh-group"><h2>' + esc(n.title) + '</h2><p>' + esc(n.id === 'epilare' ? 'Laser certificat medical. Doar în Timișoara.' : n.sub) + '</p></div>' + ps.map(cardHtml).join('');
    }).join('');
  }
  function repaint(pid) {
    var card = $('.sh-p[data-p="' + pid + '"]');
    if (!card) return;
    var p = byId(pid), was = card.classList.contains('open');
    var tmp = document.createElement('div');
    tmp.innerHTML = cardHtml(p);
    var fresh = tmp.firstChild;
    // the card keeps its place; „Merge bine cu” opens in it (it grows), never a jump
    if (!was && fresh.classList.contains('open')) { fresh.classList.remove('open'); card.replaceWith(fresh); requestAnimationFrame(function () { requestAnimationFrame(function () { fresh.classList.add('open'); }); }); } else card.replaceWith(fresh);
  }
  function steps() {
    var el = $('[data-sh-steps]');
    if (!el || !D) return;
    el.innerHTML = D.terms.tiers.map(function (t) { return '<div class="sh-step"><small>Peste ' + lei(t.at) + '</small><b>' + esc(t.title) + '</b><span>' + esc(t.sub) + '</span></div>'; }).join('');
  }

  // ---- the cart
  function add(oid, from) {
    var x = optOf(oid);
    if (!x) return;
    var had = inCart(x.p.id);
    S.cart = S.cart.filter(function (id) { return id !== had; }).concat(oid);
    S.sel[x.p.id] = oid;
    save();
    fev('cart');
    px('AddToCart', { value: x.o.price, currency: 'RON', content_ids: [oid], content_type: 'product', content_name: x.p.name });
    fly(from);
    bar(true);
    repaintAll();
  }
  function remove(oid) { S.cart = S.cart.filter(function (id) { return id !== oid; }); save(); bar(); repaintAll(); }
  function repaintAll() { $$('.sh-p[data-p]').forEach(function (c) { repaint(c.getAttribute('data-p')); }); if (sheetOn) paneCart(); if (detail) detailFill(); }
  function fly(from) {
    var b = $('.sh-bar');
    if (!from || !b || reduce) return;
    var r = from.getBoundingClientRect(), t = b.getBoundingClientRect();
    var dot = document.createElement('i');
    dot.className = 'sh-fly';
    dot.style.left = (r.left + r.width / 2) + 'px'; dot.style.top = (r.top + r.height / 2) + 'px';
    document.body.appendChild(dot);
    requestAnimationFrame(function () { requestAnimationFrame(function () { dot.style.transform = 'translate(' + (t.left + 32 - r.left - r.width / 2) + 'px,' + (t.top + t.height / 2 - r.top - r.height / 2) + 'px) scale(.6)'; dot.style.opacity = '.2'; }); });
    setTimeout(function () { dot.remove(); }, 750);
  }

  // ---- the bar (bottom): the cart, its sum, how far to the next gift
  function bar(bump) {
    var b = $('.sh-bar');
    if (!b) {
      b = document.createElement('div');
      b.className = 'sh-bar';
      b.innerHTML = '<button type="button" class="go" data-cart><span class="ct"></span><span class="tx"><b></b><small></small></span><span class="cta">Vezi coșul</span></button><div class="meter"><i></i></div>';
      document.body.appendChild(b);
    }
    var t = totals();
    b.classList.toggle('on', t.lines.length > 0 && !sheetOn && !detail);
    $('.ct', b).textContent = t.lines.length;
    $('.tx b', b).textContent = lei(t.amount);
    $('.tx small', b).textContent = t.next ? 'Încă ' + lei(t.next.at - t.amount) + ' până la: ' + t.next.title : 'Ai toate cadourile';
    var last = t.tiers.length ? t.tiers[t.tiers.length - 1].at : 1;
    $('.meter i', b).style.transform = 'scaleX(' + Math.min(1, t.amount / last) + ')';
    if (bump) { b.classList.remove('sh-bump'); void b.offsetWidth; b.classList.add('sh-bump'); }
  }

  // ---- the sheet: grows up from the bar; its panes slide (forward right to left, back left to right)
  var sheet = null, veil = null, sheetOn = false;
  var ORDER = ['cart', 'when', 'pay', 'done'];
  function openSheet(step) {
    if (!sheet) {
      veil = document.createElement('div'); veil.className = 'sh-veil';
      sheet = document.createElement('div'); sheet.className = 'sh-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
      sheet.innerHTML = '<div class="sh-sh"><button type="button" class="sh-back" data-back hidden aria-label="Înapoi">' + I.back + '</button><h3></h3><button type="button" class="sh-x" data-close aria-label="Închide">' + I.x + '</button></div><div class="sh-body">' +
        ORDER.map(function (s) { return '<div class="sh-pane r" data-pane="' + s + '"></div>'; }).join('') + '</div>';
      document.body.appendChild(veil); document.body.appendChild(sheet);
      veil.addEventListener('click', function () { if (detail) closeDetail(); else closeSheet(); });
    }
    sheetOn = true;
    bar();
    document.body.classList.add('sh-lock');
    go(step || 'cart', true);
    requestAnimationFrame(function () { veil.classList.add('on'); sheet.classList.add('on'); });
  }
  function closeSheet() {
    if (!sheet) return;
    if (S.step === 'pay' && S.hold) release();
    sheet.classList.remove('on'); veil.classList.remove('on');
    sheetOn = false;
    document.body.classList.remove('sh-lock');
    if (S.step === 'done') { S.step = 'cart'; S.paid = null; }
    setTimeout(function () { bar(); }, 300);
  }
  var TITLES = { cart: 'Coșul tău', when: 'Alege ora', pay: 'Plata', done: 'Gata' };
  function go(step, instant) {
    var from = ORDER.indexOf(S.step), to = ORDER.indexOf(step);
    if (S.step === 'pay' && step !== 'pay' && step !== 'done' && S.hold) release();
    S.step = step;
    $('.sh-sh h3', sheet).textContent = TITLES[step];
    $('[data-back]', sheet).hidden = step === 'cart' || step === 'done';
    if (step === 'cart') paneCart();
    if (step === 'when') paneWhen();
    if (step === 'pay') panePay();
    if (step === 'done') paneDone();
    $$('.sh-pane', sheet).forEach(function (p) {
      var i = ORDER.indexOf(p.getAttribute('data-pane'));
      if (instant) p.style.transition = 'none';
      p.classList.toggle('l', i < to); p.classList.toggle('r', i > to);
      if (instant) { void p.offsetWidth; p.style.transition = ''; }
    });
    if (from !== to) { var cur = $('[data-pane="' + step + '"]', sheet); if (cur) cur.scrollTop = 0; }
  }
  function pane(s) { return $('[data-pane="' + s + '"]', sheet); }
  function giftsHtml(t) {
    return '<ul class="sh-gifts">' + t.tiers.map(function (x) {
      var ok = t.amount >= x.at;
      return '<li class="' + (ok ? 'ok' : '') + '"><i>' + (ok ? I.check : '') + '</i><span><b>' + esc(x.title) + '</b> ' + esc(x.sub) + '<small>' + (ok ? 'Inclus în comanda ta' : 'La comenzi de peste ' + lei(x.at)) + '</small></span></li>';
    }).join('') + '</ul>';
  }
  function progHtml(t) {
    var last = t.tiers.length ? t.tiers[t.tiers.length - 1].at : 1;
    var marks = t.tiers.map(function (x) { return '<u class="' + (t.amount >= x.at ? 'ok' : '') + '" style="left:' + Math.min(100, x.at / last * 100).toFixed(1) + '%"></u>'; }).join('');
    var say = t.next ? 'Mai adaugi <b>' + lei(t.next.at - t.amount) + '</b> și primești: <b>' + esc(t.next.title) + '</b> ' + esc(t.next.sub) + '.' : 'Ai deblocat <b>toate cadourile</b>.';
    return '<div class="sh-prog"><p>' + say + '</p><div class="sh-track"><i style="transform:scaleX(' + Math.min(1, t.amount / last).toFixed(3) + ')"></i>' + marks + '</div>' + giftsHtml(t) + '</div>';
  }
  function impulseHtml(t) {
    var id = D.terms.impulse && D.terms.impulse[S.city], x = id && optOf(id);
    if (!x || inCart(x.p.id) || !t.lines.length) return '';
    return '<div class="sh-imp"><div><small>Adaugă și</small><b>' + esc(x.p.name) + '</b><span class="sh-price"><s>' + lei(x.o.full) + '</s> <b style="font-size:15px">' + lei(x.o.price) + '</b></span></div><button type="button" class="sh-plus" data-plus="' + esc(x.o.id) + '">+ Adaugă</button></div>';
  }
  function paneCart() {
    var el = pane('cart'), t = totals();
    if (!t.lines.length) { el.innerHTML = '<div class="sh-empty"><p>Coșul e gol.</p><button type="button" class="sh-main" data-close>Alege tratamentele</button></div>'; return; }
    el.innerHTML = (D.terms.bf ? '<div class="sh-clockline"><span>-' + D.terms.pct + '% Black Friday se încheie în</span><span class="sh-clock" data-sh-clock>' + left() + '</span></div>' : '') +
      '<ul class="sh-lines">' + t.lines.map(function (x) {
        return '<li><img src="/brand_asset/' + esc(x.p.img) + '" alt=""><div><b>' + esc(x.p.name) + '</b><small>' + esc(x.o.label) + '</small></div><div class="pr"><s>' + lei(x.o.full) + '</s><b>' + lei(x.o.price) + '</b></div><button type="button" class="sh-rm" data-rm="' + esc(x.o.id) + '" aria-label="Scoate din coș">' + I.x + '</button></li>';
      }).join('') + '</ul>' + progHtml(t) + impulseHtml(t) +
      '<div class="sh-stack"><div><span>Valoare la prețul de listă</span><b>' + lei(t.full) + '</b></div>' +
      '<div><span>' + (D.terms.bf ? 'Reducere Black Friday -' + D.terms.pct + '%' : 'Reducere la plata online -' + D.terms.pct + '%') + '</span><b>-' + lei(t.saved) + '</b></div>' +
      (t.gifts ? '<div><span>Cadouri incluse</span><b>' + lei(t.gifts) + '</b></div>' : '') +
      '<div class="tot"><span>Plătești azi</span><b>' + lei(t.amount) + '</b></div></div>' +
      '<button type="button" class="sh-main" data-go="when">Alege ora și plătește' + I.arrow + '</button>' +
      '<p class="sh-fine">Centrul360 ' + esc(S.city) + ' · Plata doar online, cu cardul. Programarea se confirmă după plată.</p>';
  }
  // the hour: her first session (the main treatment) or the free consultation
  function mainLine() { return totals().lines.slice().sort(function (a, b) { return b.o.full - a.o.full; })[0]; }
  function paneWhen() {
    var el = pane('when'), m = mainLine();
    if (!m) { go('cart'); return; }
    fev('checkout');
    px('InitiateCheckout', { value: totals().amount, currency: 'RON', num_items: totals().lines.length });
    el.innerHTML = '<div class="sh-visit">' +
      '<button type="button" data-visit="first" aria-pressed="' + (S.visit === 'first') + '"><b>Încep direct cu prima ședință</b><small>' + esc(m.p.name) + ' · ' + m.o.minutes + ' min</small></button>' +
      '<button type="button" data-visit="consult" aria-pressed="' + (S.visit === 'consult') + '"><b>Vin întâi la consultația gratuită</b><small>30 min · îți spunem exact ce ți se potrivește și câte ședințe sunt necesare</small></button></div>' +
      '<p class="sh-lab">Ziua</p><div data-days><div class="sh-wait">Caut orele libere…</div></div><div data-slots></div>' +
      '<button type="button" class="sh-main" data-go="pay" ' + (S.time ? '' : 'disabled') + '>Continuă la plată' + I.arrow + '</button>' +
      '<p class="sh-fine">Ora e ținută pentru tine cât plătești.</p>';
    days();
  }
  var daysKey = '';
  function days() {
    var m = mainLine(), el = pane('when');
    var k = S.city + '|' + S.visit + '|' + (S.visit === 'first' ? m.o.id : '');
    if (k !== daysKey) { daysKey = k; S.days = null; S.date = ''; S.time = ''; }
    if (S.days) { drawDays(); return; }
    var url = '/api/booking?city=' + encodeURIComponent(S.city) + (S.visit === 'consult' ? '&service=consult' : '&service=custom&treatment=' + encodeURIComponent(m.o.id));
    fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (d) {
      if (k !== daysKey) return;
      S.days = (d && d.on && d.days) || [];
      drawDays();
    }, function () { var x = $('[data-days]', el); if (x) x.innerHTML = '<div class="sh-alert">Nu am putut încărca orele. Verifică internetul și încearcă din nou.</div>'; });
  }
  function drawDays() {
    var el = pane('when'), box = $('[data-days]', el);
    if (!box) return;
    var list = (S.days || []).slice(0, 21);
    var open = list.filter(function (d) { return d.slots && d.slots.length; });
    if (!open.length) { box.innerHTML = '<div class="sh-alert">Nu mai sunt ore libere online în zilele următoare. Încearcă cealaltă variantă de mai sus.</div>'; $('[data-slots]', el).innerHTML = ''; return; }
    if (!S.date || !open.some(function (d) { return d.date === S.date; })) S.date = open[0].date;
    box.innerHTML = '<div class="sh-days">' + list.map(function (d) {
      var x = new Date(d.date + 'T12:00:00');
      return '<button type="button" data-day="' + d.date + '" aria-pressed="' + (d.date === S.date) + '"' + (d.slots && d.slots.length ? '' : ' disabled') + '><small>' + WD[x.getDay()] + '</small><b>' + x.getDate() + '</b></button>';
    }).join('') + '</div>';
    var day = list.filter(function (d) { return d.date === S.date; })[0];
    if (S.time && day.slots.indexOf(S.time) < 0) S.time = '';
    $('[data-slots]', el).innerHTML = '<p class="sh-lab">Ora · ' + esc(nice(S.date)) + '</p><div class="sh-slots">' + day.slots.map(function (t) { return '<button type="button" data-time="' + t + '" aria-pressed="' + (t === S.time) + '">' + t + '</button>'; }).join('') + '</div>';
    var b = $('[data-go="pay"]', el); if (b) b.disabled = !S.time;
  }
  function nice(date) { var x = new Date(date + 'T12:00:00'); return WDL[x.getDay()] + ' ' + x.getDate() + ' ' + MO[x.getMonth()]; }

  // the payment: the hour held on the server with the cart (/api/shop hold), then the card form in the pane
  var payP = null;
  function payScript() {
    if (window.C360Pay) return Promise.resolve(window.C360Pay);
    if (!payP) payP = new Promise(function (ok, no) { var s = document.createElement('script'); s.src = '/c360-pay.js'; s.async = true; s.onload = function () { return window.C360Pay ? ok(window.C360Pay) : no(); }; s.onerror = no; document.head.appendChild(s); });
    return payP;
  }
  function release() {
    var h = S.hold; S.hold = null;
    if (h) fetch('/api/booking', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ release: h.id, key: h.key }) }).catch(function () {});
  }
  function panePay() {
    var el = pane('pay'), t = totals(), mine = {};
    S.payRun = mine;
    el.innerHTML = '<div class="sh-clockline"><span>' + esc(nice(S.date)) + ', ora ' + esc(S.time) + ' · ' + esc(S.city) + '</span></div><div data-pay style="margin-top:12px"><div class="sh-wait">Pregătesc plata…</div></div>';
    fev('pay');
    var src = null; try { src = window.C360Src ? window.C360Src() : null; } catch (e) { /* none */ }
    payScript().then(function (P) {
      return P.ready().then(function (on) {
        if (S.payRun !== mine) return;
        if (!on) { $('[data-pay]', el).innerHTML = '<div class="sh-alert">Plata online nu e pornită încă pe această pagină.</div>'; return; }
        var prev = S.hold;
        var holdP = fetch('/api/shop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'hold', city: S.city, items: t.lines.map(function (x) { return x.o.id; }), visit: S.visit, date: S.date, time: S.time, page: location.pathname, src: src, prev: prev && prev.id, prevKey: prev && prev.key }) })
          .then(function (r) { return r.json(); }, function () { return { error: 'net' }; })
          .then(function (d) {
            if (S.payRun !== mine) { if (d && d.hold) fetch('/api/booking', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ release: d.hold.id, key: d.hold.key }) }).catch(function () {}); return Promise.reject({ code: 'gone' }); }
            if (!d || !d.hold) return Promise.reject({ code: (d && d.error) || 'net' });
            S.hold = d.hold; S.quote = d.quote;
            return d.hold.id;
          });
        var me = null; try { me = JSON.parse(localStorage.getItem('c360-book-me') || 'null'); } catch (e) { /* none */ }
        P.open({
          kind: 'shop', ref: holdP, city: S.city, page: location.pathname, mount: $('[data-pay]', el),
          preview: { amount: t.amount, full: t.full, title: t.lines.map(function (x) { return x.p.name; }).join(' + '), bonusText: D.terms.bf ? '-' + D.terms.pct + '% Black Friday' : '-' + D.terms.pct + '% la plata online' },
          contact: me && me.name ? { name: me.name, phone: me.phone } : undefined,
          onContact: function (c) { try { localStorage.setItem('c360-book-me', JSON.stringify({ name: c.name, phone: c.phone })); } catch (e) { /* private mode */ } },
          onError: function (code) {
            if (S.payRun !== mine || code === 'gone') return;
            if (code === 'taken') { S.time = ''; S.days = null; daysKey = ''; go('when'); setTimeout(function () { var w = pane('when'); if (w) w.insertAdjacentHTML('afterbegin', '<div class="sh-alert">Ora aleasă tocmai a fost ocupată. Alege, te rog, altă oră.</div>'); }, 300); return; }
            $('[data-pay]', el).innerHTML = '<div class="sh-alert">Nu am putut porni plata. Verifică internetul și încearcă din nou.</div><button type="button" class="sh-main" data-go="when">Înapoi</button>';
          },
          onPaid: function (r) {
            if (S.payRun !== mine) return;
            S.paid = { amount: r.amount || t.amount, confirmed: r.confirmed, date: S.date, time: S.time, city: S.city, lines: t.lines.map(function (x) { return x.p.name + ' · ' + x.o.label; }), gifts: t.reached.map(function (x) { return x.title + ' ' + x.sub; }), visit: S.visit };
            S.hold = null; S.cart = []; save(); S.time = ''; S.days = null; daysKey = '';
            go('done'); bar(); repaintAll();
          },
        });
      });
    }, function () { if (S.payRun === mine) $('[data-pay]', el).innerHTML = '<div class="sh-alert">Nu am putut porni plata. Verifică internetul și încearcă din nou.</div>'; });
  }
  function paneDone() {
    var el = pane('done'), p = S.paid;
    if (!p) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="sh-done"><div class="ok">' + I.check + '</div><h2>Plătit. Ne vedem <em>' + esc(nice(p.date)) + '.</em></h2><p>' + (p.confirmed ? 'Programarea e confirmată. Îți trimitem confirmarea și pe WhatsApp.' : 'Banca mai confirmă plata câteva clipe. Îți scriem pe WhatsApp imediat ce vine.') + '</p>' +
      '<div class="sh-card"><div><b>' + esc(nice(p.date).replace(/^./, function (c) { return c.toUpperCase(); })) + ', ora ' + esc(p.time) + '</b><small>' + (p.visit === 'consult' ? 'Consultația gratuită' : 'Prima ședință') + '</small></div>' +
      '<div><b>' + lei(p.amount) + ', plătit online</b><small>' + p.lines.map(esc).join('<br>') + '</small></div>' +
      (p.gifts.length ? '<div><b>Cadouri</b><small>' + p.gifts.map(esc).join('<br>') + '</small></div>' : '') +
      '<div><b>Centrul360 ' + esc(p.city) + '</b><small>' + esc(ADDR[p.city]) + ' · <a href="' + MAPS[p.city] + '" target="_blank" rel="noopener">Vezi pe hartă</a></small></div></div>' +
      '<button type="button" class="sh-main" data-close>Închide</button></div>';
  }

  // ---- the product: the card grows into it, and back into the card
  var detail = null, detailFrom = null, detailPid = '';
  function rectOf(el) { var r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  function openDetail(pid, card) {
    if (detail) return;
    detailPid = pid; detailFrom = card;
    detail = document.createElement('div');
    detail.className = 'sh-detail'; detail.setAttribute('role', 'dialog'); detail.setAttribute('aria-modal', 'true');
    if (!veil) { veil = document.createElement('div'); veil.className = 'sh-veil'; document.body.appendChild(veil); veil.addEventListener('click', function () { if (detail) closeDetail(); else closeSheet(); }); }
    document.body.appendChild(detail);
    detailFill();
    document.body.classList.add('sh-lock');
    bar();
    var a = rectOf(card), b = rectOf(detail);
    if (!reduce) {
      detail.style.transform = 'translate(' + (a.x - b.x) + 'px,' + (a.y - b.y) + 'px) scale(' + (a.w / b.w) + ',' + (a.h / b.h) + ')';
      void detail.offsetWidth;
      detail.style.transition = 'transform .6s var(--e)';
    }
    requestAnimationFrame(function () { detail.style.transform = ''; detail.classList.add('on'); veil.classList.add('on'); });
  }
  function detailFill() {
    var p = byId(detailPid);
    if (!detail || !p) return;
    var oid = selOf(p), o = p.options.filter(function (x) { return x.id === oid; })[0] || p.options[0], mine = inCart(p.id) === o.id;
    var top = detail.scrollTop;
    detail.innerHTML = '<button type="button" class="sh-x" data-dclose aria-label="Închide">' + I.x + '</button>' +
      '<div class="sh-pimg"><img src="/brand_asset/' + esc(p.img) + '" alt="" draggable="false">' + (D.terms.bf ? '<span class="sh-off">-' + D.terms.pct + '%</span>' : '') + '</div>' +
      '<div class="sh-pb sh-dc" data-p="' + esc(p.id) + '"><h3>' + esc(p.name) + '</h3><p>' + esc(p.d) + '</p>' + (p.z ? '<p class="sh-z">' + esc(p.z) + '</p>' : '') +
      (p.guarantee ? '<p class="sh-note">' + esc(p.guarantee) + '</p>' : '') +
      (p.options.length > 1 ? '<p class="sh-lab" style="margin:4px 0 0">Alege pachetul</p><div class="sh-opts">' + p.options.map(function (x) { return '<button type="button" data-opt="' + esc(x.id) + '" aria-pressed="' + (x.id === o.id) + '">' + esc(x.label) + ' · ' + lei(x.price) + '</button>'; }).join('') + '</div>' : '') +
      '<p class="sh-note">' + (D.terms.bf ? '-' + D.terms.pct + '% din lista de prețuri, doar la plata online cu cardul. Se încheie în <b class="sh-clock" data-sh-clock>' + left() + '</b>.' : '-' + D.terms.pct + '% la plata online cu cardul.') + '</p>' +
      pairHtml(p).replace('class="sh-pair"', 'class="sh-pair" style="grid-template-rows:1fr"') + '</div>' +
      '<div class="sh-dfoot sh-dc" data-p="' + esc(p.id) + '"><div class="sh-price"><s>' + lei(o.full) + '</s><b>' + lei(o.price) + '</b></div><button type="button" class="sh-add' + (mine ? ' in' : '') + '" data-add>' + (mine ? I.check + 'În coș' : I.cart + 'Adaugă în coș') + '</button></div>';
    detail.scrollTop = top;
  }
  function closeDetail(then) {
    if (!detail) return;
    var d = detail, card = $('.sh-p[data-p="' + detailPid + '"]') || detailFrom;
    detail = null;
    d.classList.remove('on');
    if (!sheetOn && veil) veil.classList.remove('on');
    if (!sheetOn) document.body.classList.remove('sh-lock');
    if (card && !reduce) {
      var a = rectOf(card), b = rectOf(d);
      d.style.transform = 'translate(' + (a.x - b.x) + 'px,' + (a.y - b.y) + 'px) scale(' + (a.w / b.w) + ',' + (a.h / b.h) + ')';
      d.style.opacity = '0'; d.style.transition = 'transform .55s var(--e), opacity .55s var(--e)';
      setTimeout(function () { d.remove(); bar(); if (then) then(); }, 520);
    } else { d.remove(); bar(); if (then) then(); }
  }

  // ---- the clinic
  function city(c) {
    if (c === S.city) return;
    var drop = lines().length;
    S.city = c; save();
    var sw = $('[data-sh-city]');
    if (sw) { sw.setAttribute('data-at', c); $$('button', sw).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-c') === c)); }); }
    S.days = null; daysKey = '';
    grid(); bar();
    if (drop !== lines().length && sheetOn) paneCart();
  }

  // ---- taps
  document.addEventListener('click', function (e) {
    var t = e.target;
    var c = t.closest('[data-sh-city] button[data-c]'); if (c) { city(c.getAttribute('data-c')); return; }
    var n = t.closest('[data-need]'); if (n) { S.need = n.getAttribute('data-need'); grid(); var g = $('[data-sh-grid]'); if (g && g.getBoundingClientRect().top < 0) scrollTo({ top: g.getBoundingClientRect().top + scrollY - 110, behavior: reduce ? 'auto' : 'smooth' }); return; }
    var host = t.closest('[data-p]');
    var opt = t.closest('[data-opt]');
    if (opt && host) { var pid = host.getAttribute('data-p'); S.sel[pid] = opt.getAttribute('data-opt'); if (inCart(pid)) add(S.sel[pid], null); else { repaint(pid); if (detail) detailFill(); } return; }
    var a = t.closest('[data-add]');
    if (a && host) { var p = byId(host.getAttribute('data-p')), oid = selOf(p); if (inCart(p.id) === oid) { if (detail) closeDetail(function () { openSheet('cart'); }); else openSheet('cart'); } else add(oid, a); return; }
    var plus = t.closest('[data-plus]'); if (plus) { var x = optOf(plus.getAttribute('data-plus')); if (x && inCart(x.p.id)) remove(inCart(x.p.id)); else add(plus.getAttribute('data-plus'), plus); return; }
    var op = t.closest('[data-open]'); if (op && host) { openDetail(host.getAttribute('data-p'), host); return; }
    if (t.closest('[data-dclose]')) { closeDetail(); return; }
    if (t.closest('[data-cart]')) { openSheet('cart'); return; }
    if (t.closest('[data-close]')) { closeSheet(); return; }
    if (t.closest('[data-back]')) { go(ORDER[Math.max(0, ORDER.indexOf(S.step) - 1)]); return; }
    var gg = t.closest('[data-go]'); if (gg && sheet && sheet.contains(gg)) { go(gg.getAttribute('data-go')); return; }
    var rm = t.closest('[data-rm]'); if (rm) { remove(rm.getAttribute('data-rm')); return; }
    var v = t.closest('[data-visit]'); if (v) { S.visit = v.getAttribute('data-visit'); $$('[data-visit]', sheet).forEach(function (b) { b.setAttribute('aria-pressed', String(b === v)); }); days(); return; }
    var dy = t.closest('[data-day]'); if (dy) { S.date = dy.getAttribute('data-day'); S.time = ''; drawDays(); return; }
    var tm = t.closest('[data-time]'); if (tm) { S.time = tm.getAttribute('data-time'); drawDays(); return; }
    var sc = t.closest('[data-sh-shop]'); if (sc) { e.preventDefault(); var gr = $('#magazin'); if (gr) scrollTo({ top: gr.getBoundingClientRect().top + scrollY - 40, behavior: reduce ? 'auto' : 'smooth' }); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (detail) closeDetail(); else if (sheetOn) closeSheet(); } });

  function load() {
    return fetch('/api/shop', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) return;
      D = d; offset = d.terms.now - Date.now();
      var known = {}; d.products.forEach(function (p) { p.options.forEach(function (o) { known[o.id] = 1; }); });
      S.cart = S.cart.filter(function (id) { return known[id]; });
      var sw = $('[data-sh-city]');
      if (sw) { sw.setAttribute('data-at', S.city); $$('button', sw).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-c') === S.city)); }); }
      steps(); grid(); bar(); tick();
      if (/[?&#]cos\b/.test(location.search + location.hash) && lines().length) openSheet('cart');
    }).catch(function () { var g = $('[data-sh-grid]'); if (g) g.innerHTML = '<div class="sh-alert">Nu am putut încărca tratamentele. Reîncarcă pagina.</div>'; });
  }
  window.C360Shop = { add: add, open: function () { openSheet('cart'); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
  setInterval(tick, 1000);
  addEventListener('pagehide', function () { if (S.hold) release(); });
})();
