/* ============================================================
   Centrul360, the Black Friday shop (the owner, 24.11 night): one session of every treatment of the price list at -50%,
   paid online by card. No packages, no combined offers. Each card: a clean drawn silhouette with the treated zone lit, the
   short name („Liposonix Abdomen”, „HIFU Gușă”), what the session does, the zone, the price, one big button.
     [data-bfs]        the first screen's slider: three in sight, the middle one in front, round and round
     [data-bfo-grid]   all the offers (+ [data-bfo-needs], the tabs)
     [data-sh-clock]   the time left until the end of Black Friday (the server's moment, the same for everyone)
   „Vreau oferta” puts it in the cart, a popup asks: book it now, or add more. The checkout: the cart (how many sessions),
   what goes well with it („Merge super în combinație cu”), the other offers, the clinic, the hour, the card payment
   (c360-pay.js, kind 'shop'). Prices and the sum are the server's (/api/shop). The header gets a cart button.
   Kept on this device only: her cart and her clinic (localStorage 'c360-shop').
   ============================================================ */
(function () {
  'use strict';
  if (window.C360Shop) return;
  var KEY = 'c360-shop2';
  var ADDR = { 'Timișoara': 'Str. Bucegi 7, Timișoara', Arad: 'Str. Ioan Alexandru 16-18, Arad' };
  var MAPS = { 'Timișoara': 'https://www.google.com/maps/search/?api=1&query=Centrul360%20Strada%20Bucegi%207%20Timisoara', Arad: 'https://www.google.com/maps/search/?api=1&query=Centrul360%20Strada%20Ioan%20Alexandru%2016-18%20Arad' };
  var WD = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'];
  var WDL = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  var MO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  var NEED = { corp: 'Corp', gusa: 'Gușă', fata: 'Față', epilare: 'Epilare' };
  var I = {
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6"/><circle cx="10" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    arrow: '<svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var lei = function (n) { return Math.round(Number(n) || 0).toLocaleString('ro-RO') + ' lei'; };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var fev = function (n) { try { if (window.C360P) window.C360P.ev(n); } catch (e) { /* the funnel never breaks the shop */ } };
  var px = function (name, data) { try { if (window.fbq && window.C360_CONSENT) window.fbq('track', name, data || {}); } catch (e) { /* no pixel */ } };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- the silhouettes: a body (front) and a face (profile), drawn; the treated zone glows
  var BODY_L = 'M44,22 L44,32 C38,35 29,36 24,40 C21,43 21,50 24,55 C25,60 23,68 25,76 C27,84 32,88 32,94 C32,102 22,110 22,122 C22,138 25,154 27,170 C28,178 26,188 28,200 C29,208 31,214 31,218 L30,222 L44,222 L43,217 C42,206 44,190 44,178 C45,160 48,142 50,134';
  var ARM_L = 'M24,41 C17,45 15,60 14,74 C13,88 12,102 12,112 C12,117 17,117 17,112 C18,100 20,86 21,76 C22,69 24,63 25,58';
  var FACE = 'M34,118 C34,104 32,94 28,86 C18,78 13,62 15,44 C17,22 33,8 52,8 C70,8 80,19 82,33 C83,38 82,42 84,46 C86,50 89,53 88,56 C87,58 84,58 84,60 C85,62 85,64 83,65 C84,67 84,70 81,71 C81,76 79,80 73,82 C67,84 62,86 60,92 C58,100 60,110 62,118';
  var SPOT = {
    abdomen: [[50, 104, 13, 11]], flancuri: [[31, 102, 5, 11], [69, 102, 5, 11]], coapse: [[37, 152, 9, 16], [63, 152, 9, 16]],
    brate: [[16, 78, 4, 14], [84, 78, 4, 14]], antebrate: [[14, 100, 3, 9], [86, 100, 3, 9]], lombara: [[50, 116, 18, 6]],
    gambe: [[35, 196, 5, 13], [65, 196, 5, 13]], axile: [[26, 58, 4, 5], [74, 58, 4, 5]], piept: [[39, 70, 8, 7], [61, 70, 8, 7]],
    umeri: [[27, 44, 6, 5], [73, 44, 6, 5]], inghinal: [[50, 132, 8, 6]], fese: [[25, 124, 5, 9], [75, 124, 5, 9]],
    maini: [[14, 116, 3, 4], [86, 116, 3, 4]], laba: [[37, 220, 6, 3], [63, 220, 6, 3]], spate: [[50, 90, 20, 22]], full: [[50, 120, 34, 100]],
    gusa: [[66, 85, 10, 5]], gat: [[50, 100, 12, 10]], contur: [[60, 79, 16, 4, 18]], pometi: [[68, 52, 7, 5]], frunte: [[60, 20, 15, 7]],
    periocular: [[72, 40, 6, 4]], perioral: [[81, 63, 5, 6]], fata: [[58, 48, 26, 31]],
  };
  var FACE_SPOTS = { gusa: 1, gat: 1, contur: 1, pometi: 1, frunte: 1, periocular: 1, perioral: 1, fata: 1 };
  var ZS = { Abdomen: ['abdomen'], Flancuri: ['flancuri'], Coapse: ['coapse'], 'Brațe': ['brate'], 'Zona lombară': ['lombara'], Gambe: ['gambe'], 'Gușă': ['gusa'], 'Gât': ['gat'], 'Contur mandibular': ['contur'], 'Pomeți': ['pometi'], Frunte: ['frunte'] };
  var PS = { impachetare: ['abdomen', 'coapse'], 'rf-sculpt-gusa': ['gusa', 'contur'], 'masaj-facial': ['fata', 'gat'], periocular: ['periocular'] };
  function spotsOf(p, zone) {
    if (zone && ZS[zone]) return ZS[zone];
    if (PS[p.id]) return PS[p.id];
    if (p.need === 'fata') return ['fata'];
    if (p.need === 'epilare') {
      var n = p.name;
      var E = [[/Full Body/, ['full']], [/Axile/, ['axile']], [/Antebrațe/, ['antebrate']], [/Brațe/, ['brate', 'antebrate']], [/Mâini/, ['maini', 'laba']], [/Areole|Piept/, ['piept']], [/Umeri/, ['umeri']],
        [/Abdomen/, ['abdomen']], [/bikini|Linia albă|Inghinal|Labii/, ['inghinal']], [/Fese/, ['fese']], [/lombară/, ['lombara']], [/Spate/, ['spate']], [/Picior scurt/, ['gambe']], [/Picior lung/, ['coapse', 'gambe']],
        [/Față/, ['fata']], [/barbă/, ['contur', 'gat']]];
      for (var i = 0; i < E.length; i++) if (E[i][0].test(n)) return E[i][1];
      return [];
    }
    return [];
  }
  var defs = false;
  function sil(p, zone) {
    if (!defs) { defs = true; var d = document.createElement('div'); d.innerHTML = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><radialGradient id="shSpot"><stop offset="0" stop-color="#fbe0d4" stop-opacity=".95"/><stop offset=".55" stop-color="#e7a993" stop-opacity=".55"/><stop offset="1" stop-color="#e7a993" stop-opacity="0"/></radialGradient></defs></svg>'; document.body.appendChild(d.firstChild); }
    var sp = spotsOf(p, zone), face = sp.length ? sp.every(function (k) { return FACE_SPOTS[k]; }) : p.need === 'fata' || p.need === 'gusa';
    var glow = sp.map(function (k) { return (SPOT[k] || []).map(function (e) { return '<ellipse class="sp" cx="' + e[0] + '" cy="' + e[1] + '" rx="' + e[2] * 1.6 + '" ry="' + e[3] * 1.6 + '"' + (e[4] ? ' transform="rotate(' + e[4] + ' ' + e[0] + ' ' + e[1] + ')"' : '') + ' fill="url(#shSpot)"/>'; }).join(''); }).join('');
    var line = face
      ? '<path d="' + FACE + '"/><path d="M68,40 Q72,38 76,40"/>'
      : '<ellipse cx="50" cy="11" rx="8" ry="10"/><path d="' + BODY_L + '"/><path d="' + ARM_L + '"/><g transform="translate(100,0) scale(-1,1)"><path d="' + BODY_L + '"/><path d="' + ARM_L + '"/></g>';
    return '<svg class="bfc-sil" viewBox="' + (face ? '0 0 100 120' : '0 0 100 225') + '" aria-hidden="true"><g class="gl">' + glow + '</g><g class="ln" fill="none" stroke-linecap="round" stroke-linejoin="round">' + line + '</g></svg>';
  }

  var D = null, offset = 0;
  var S = { city: '', cart: [], zone: {}, need: 'top', step: 'cart', visit: 'first', date: '', time: '', days: null, hold: null, paid: null };
  try { var kept = JSON.parse(localStorage.getItem(KEY) || 'null'); if (kept) { if (kept.city === 'Arad' || kept.city === 'Timișoara') S.city = kept.city; if (Array.isArray(kept.cart)) S.cart = kept.cart.slice(0, 12); } } catch (e) { /* private mode */ }
  var qs = new URLSearchParams(location.search);
  if (NEED[qs.get('nevoie')]) S.need = qs.get('nevoie');
  if (/^arad$/i.test(qs.get('oras') || '')) S.city = 'Arad'; else if (/^tim/i.test(qs.get('oras') || '')) S.city = 'Timișoara';
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify({ city: S.city, cart: S.cart })); } catch (e) { /* private mode */ } };

  // ---- the data
  var byId = function (id) { return D && D.products.filter(function (p) { return p.id === id; })[0]; };
  var zoneOf = function (p) { return p.zones.length ? (S.zone[p.id] && p.zones.indexOf(S.zone[p.id]) > -1 ? S.zone[p.id] : p.zones[0]) : ''; };
  var nameOf = function (p, zone) { return p.name + (zone ? ' ' + zone : ''); };
  var keyOf = function (id, zone) { return id + '|' + (zone || ''); };
  var lineOf = function (id, zone) { return S.cart.filter(function (l) { return l.id === id && (l.zone || '') === (zone || ''); })[0]; };
  var lines = function () { return S.cart.map(function (l) { var p = byId(l.id); return p ? { p: p, zone: l.zone || '', qty: l.qty || 1, key: keyOf(l.id, l.zone) } : null; }).filter(Boolean); };
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

  // ---- the timer
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

  // ---- the offer card: short and clear
  function cardHtml(p) {
    var z = zoneOf(p), mine = S.cart.some(function (l) { return l.id === p.id; });
    return '<article class="slip has-pic bfc' + (mine ? ' in' : '') + '" data-p="' + esc(p.id) + '">' +
      '<span class="pic" aria-hidden="true"><img src="' + esc(p.photo) + '" alt="" decoding="async"></span>' +
      '<span class="pct">-' + D.terms.pct + '%</span>' +
      '<span class="k"><b>Black Friday</b> · ' + esc(NEED[p.need] || '') + '</span><h3>' + esc(nameOf(p, z)) + '</h3>' +
      '<ul class="bfc-b">' + p.b.slice(0, 2).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
      '<div class="pr"><b>' + lei(p.price) + '</b><s>' + lei(p.full) + '</s></div>' +
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
  }
  var repaintAll = function () { (D ? D.products : []).forEach(function (p) { repaint(p.id); }); };

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

  // ---- all the offers
  function grid() {
    var el = $('[data-bfo-grid]');
    if (!el || !D) return;
    var nb = $('[data-bfo-needs]');
    if (nb) nb.innerHTML = '<button type="button" data-need="top" aria-pressed="' + (S.need === 'top') + '">Cele mai cerute</button>' + Object.keys(NEED).map(function (k) { return '<button type="button" data-need="' + k + '" aria-pressed="' + (S.need === k) + '">' + NEED[k] + '</button>'; }).join('');
    var list = S.need === 'top' ? D.terms.show.map(byId).filter(Boolean) : D.products.filter(function (p) { return p.need === S.need; });
    el.innerHTML = list.map(cardHtml).join('');
  }

  // ---- the cart
  function add(id, zone, from) {
    var p = byId(id);
    if (!p) return;
    var had = lineOf(id, zone);
    if (!had) S.cart.push({ id: id, zone: zone || '', qty: 1 });
    save();
    fev('cart');
    px('AddToCart', { value: p.price, currency: 'RON', content_ids: [id], content_type: 'product', content_name: nameOf(p, zone) });
    repaint(id); headCart(true); bar(true);
    if (sheetOn) paneCart();
  }
  function setQty(key, d) {
    S.cart = S.cart.map(function (l) { if (keyOf(l.id, l.zone) === key) l.qty = Math.max(0, Math.min(10, (l.qty || 1) + d)); return l; }).filter(function (l) { return l.qty > 0; });
    save(); repaintAll(); headCart(); bar(); if (sheetOn) paneCart();
  }
  // the header's cart (next to the menu, on the right)
  function headCart(bump) {
    var bar0 = $('.top .bar');
    if (!bar0) return;
    var b = $('.sh-hcart', bar0);
    if (!b) {
      b = document.createElement('button');
      b.type = 'button'; b.className = 'sh-hcart'; b.setAttribute('data-cart', ''); b.setAttribute('aria-label', 'Coșul');
      b.innerHTML = I.cart + '<i></i>';
      var burger = $('.burger', bar0);
      bar0.insertBefore(b, burger || null);
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

  // ---- the popup after „Vreau oferta”
  var pop = null, veil = null;
  function needVeil() { if (!veil) { veil = document.createElement('div'); veil.className = 'sh-veil'; document.body.appendChild(veil); veil.addEventListener('click', function () { if (pop) closePop(); else closeSheet(); }); } return veil; }
  function openPop(id, zone, from) {
    var p = byId(id);
    if (!p) return;
    needVeil();
    pop = document.createElement('div');
    pop.className = 'sh-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); pop.setAttribute('data-id', id); pop.setAttribute('data-zone', zone || '');
    pop.innerHTML = '<div class="ok"><i>' + I.check + '</i>Adăugat în coș</div>' +
      '<div class="it"><span class="th"><img src="' + esc(p.photo) + '" alt=""></span><div><b>' + esc(nameOf(p, zone)) + '</b><small>1 ședință</small></div><div class="pr"><s>' + lei(p.full) + '</s><b>' + lei(p.price) + '</b></div></div>' +
      (p.zones.length ? '<p class="zq">Ce zonă?</p><div class="bfc-opts zs">' + p.zones.map(function (x) { return '<button type="button" data-pzone="' + esc(x) + '" aria-pressed="' + (x === zone) + '">' + esc(x) + '</button>'; }).join('') + '</div>' : '') +
      '<button type="button" class="sh-go" data-checkout>Rezervă acum' + I.arrow + '</button>' +
      '<button type="button" class="sh-more" data-shop-on>Mai adaug și altele</button>';
    document.body.appendChild(pop);
    if (from && !reduce) { var r = from.getBoundingClientRect(), q = pop.getBoundingClientRect(); pop.style.transformOrigin = (r.left + r.width / 2 - q.left) + 'px ' + (r.top + r.height / 2 - q.top) + 'px'; }
    bar();
    requestAnimationFrame(function () { requestAnimationFrame(function () { pop.classList.add('on'); veil.classList.add('on'); }); });
  }
  // the zone picked in the popup: the cart's line follows
  function popZone(zone) {
    var id = pop && pop.getAttribute('data-id'), old = pop && pop.getAttribute('data-zone');
    if (!id || zone === old) return;
    var l = lineOf(id, old), other = lineOf(id, zone);
    if (l && !other) l.zone = zone;
    else if (l && other) { other.qty = Math.min(10, (other.qty || 1) + (l.qty || 1)); S.cart = S.cart.filter(function (x) { return x !== l; }); }
    S.zone[id] = zone; save();
    var p = byId(id);
    pop.setAttribute('data-zone', zone);
    $('.it b', pop).textContent = nameOf(p, zone);
    $$('[data-pzone]', pop).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pzone') === zone)); });
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
      sheet.innerHTML = '<div class="sh-sh"><button type="button" class="sh-back" data-back hidden aria-label="Înapoi">' + I.back + '</button><h3></h3><button type="button" class="sh-x" data-close aria-label="Închide">' + I.x + '</button></div><div class="sh-body">' +
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
  }
  function pane(s) { return $('[data-pane="' + s + '"]', sheet); }
  function miniHtml(p) {
    var z = zoneOf(p), has = !!lineOf(p.id, z);
    return '<div class="sh-mini"><span class="th"><img src="' + esc(p.photo) + '" alt=""></span><div><b>' + esc(nameOf(p, z)) + '</b><small><s>' + lei(p.full) + '</s> <em>' + lei(p.price) + '</em></small></div>' +
      '<button type="button" class="sh-plus' + (has ? ' in' : '') + '" data-plus="' + esc(p.id) + '" data-pz="' + esc(z) + '">' + (has ? '✓' : '+ Adaugă') + '</button></div>';
  }
  function tileHtml(p) {
    var z = zoneOf(p), has = !!lineOf(p.id, z);
    return '<div class="sh-tile"><img src="' + esc(p.photo) + '" alt=""><span class="p">-' + D.terms.pct + '%</span><b>' + esc(nameOf(p, z)) + '</b><small><s>' + lei(p.full) + '</s> ' + lei(p.price) + '</small>' +
      '<button type="button" class="' + (has ? 'in' : '') + '" data-plus="' + esc(p.id) + '" data-pz="' + esc(z) + '">' + (has ? '✓ În coș' : '+ Adaugă') + '</button></div>';
  }
  function paneCart() {
    var el = pane('cart'), t = totals();
    if (!t.lines.length) { el.innerHTML = '<div class="sh-empty"><p>Coșul e gol.</p><button type="button" class="sh-go" data-close>Vezi ofertele</button></div>'; return; }
    var city = cityNow(), tmOnly = t.lines.some(function (x) { return x.p.cities.length === 1; });
    var mine = {}; t.lines.forEach(function (x) { mine[x.p.id] = 1; });
    var pairs = [];
    t.lines.forEach(function (x) { x.p.pairs.forEach(function (id) { var p = byId(id); if (p && !mine[p.id] && p.cities.indexOf(city) > -1 && pairs.indexOf(p) < 0) pairs.push(p); }); });
    pairs = pairs.slice(0, 3);
    var rest = D.terms.show.map(byId).concat(D.products.filter(function (p) { return p.need !== 'epilare'; })).filter(function (p, k, a) { return p && a.indexOf(p) === k && !mine[p.id] && pairs.indexOf(p) < 0 && p.cities.indexOf(city) > -1; }).slice(0, 10);
    el.innerHTML = (D.terms.bf ? '<div class="sh-clockline"><span>-' + D.terms.pct + '% se termină în</span><span class="sh-clock" data-sh-clock>' + left() + '</span></div>' : '') +
      '<ul class="sh-lines">' + t.lines.map(function (x) {
        var no = x.p.cities.indexOf(city) < 0;
        return '<li><span class="th"><img src="' + esc(x.p.photo) + '" alt=""></span><div><b>' + esc(nameOf(x.p, x.zone)) + '</b>' + (no ? '<small class="warn">Doar în ' + esc(x.p.cities[0]) + '</small>' : '') +
          '<span class="sh-qty"><button type="button" data-q="-1" data-k="' + esc(x.key) + '" aria-label="Mai puțin">−</button><b>' + x.qty + (x.qty === 1 ? ' ședință' : ' ședințe') + '</b><button type="button" data-q="1" data-k="' + esc(x.key) + '" aria-label="Încă o ședință">+</button></span></div>' +
          '<div class="pr"><s>' + lei(x.p.full * x.qty) + '</s><b>' + lei(x.p.price * x.qty) + '</b></div></li>';
      }).join('') + '</ul>' +
      (pairs.length ? '<p class="sh-lab">Merge super <em>în combinație cu</em></p>' + pairs.map(miniHtml).join('') : '') +
      (rest.length ? '<p class="sh-lab">Alte oferte <em>-' + D.terms.pct + '%</em></p><div class="sh-rail">' + rest.map(tileHtml).join('') + '</div>' : '') +
      '<p class="sh-lab">Clinica</p><div class="sh-city">' + ['Timișoara', 'Arad'].map(function (c) { return '<button type="button" data-city="' + c + '" aria-pressed="' + (c === city) + '"' + (tmOnly && c === 'Arad' ? ' disabled' : '') + '>' + c + '</button>'; }).join('') + '</div>' +
      (tmOnly ? '<p class="sh-fine" style="text-align:left">EMS, împachetarea și epilarea laser sunt doar în Timișoara.</p>' : '') +
      '<div class="sh-stack"><div><span>Preț normal</span><b>' + lei(t.full) + '</b></div><div class="sv"><span>Reducere -' + D.terms.pct + '%</span><b>-' + lei(t.saved) + '</b></div><div class="tot"><span>Plătești</span><b>' + lei(t.amount) + '</b></div></div>' +
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
    el.innerHTML = '<div class="sh-visit">' +
      '<button type="button" data-visit="first" aria-pressed="' + (S.visit === 'first') + '"><b>Încep direct</b><small>Prima ședință: ' + esc(nameOf(m.p, m.zone)) + ' · ' + m.p.minutes + ' min</small></button>' +
      '<button type="button" data-visit="consult" aria-pressed="' + (S.visit === 'consult') + '"><b>Vin întâi la consultația gratuită</b><small>30 min · îți spunem ce ți se potrivește</small></button></div>' +
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
    el.innerHTML = '<div class="sh-clockline"><span>' + esc(nice(S.date)) + ', ora ' + esc(S.time) + '</span><span>' + esc(S.city) + '</span></div><div data-pay style="margin-top:12px"><div class="sh-wait">Pregătesc plata…</div></div>';
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
            S.paid = { amount: r.amount || t.amount, confirmed: r.confirmed, date: S.date, time: S.time, city: S.city, lines: t.lines.map(function (x) { return nameOf(x.p, x.zone) + ' · ' + x.qty + (x.qty === 1 ? ' ședință' : ' ședințe'); }), visit: S.visit };
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
    el.innerHTML = '<div class="sh-done"><div class="ok">' + I.check + '</div><h2>Plătit. Ne vedem <em>' + esc(nice(p.date)) + '.</em></h2><p>' + (p.confirmed ? 'Programarea e confirmată. Îți trimitem confirmarea și pe WhatsApp.' : 'Banca mai confirmă plata câteva clipe. Îți scriem pe WhatsApp imediat ce vine.') + '</p>' +
      '<div class="sh-card"><div><b>' + esc(nice(p.date).replace(/^./, function (c) { return c.toUpperCase(); })) + ', ora ' + esc(p.time) + '</b><small>' + (p.visit === 'consult' ? 'Consultația gratuită' : 'Prima ședință') + '</small></div>' +
      '<div><b>' + lei(p.amount) + ', plătit online</b><small>' + p.lines.map(esc).join('<br>') + '</small></div>' +
      '<div><b>Centrul360 ' + esc(p.city) + '</b><small>' + esc(ADDR[p.city]) + ' · <a href="' + MAPS[p.city] + '" target="_blank" rel="noopener">Vezi pe hartă</a></small></div></div>' +
      '<button type="button" class="sh-go" data-close>Închide</button></div>';
  }

  // ---- taps
  document.addEventListener('click', function (e) {
    var t = e.target;
    var card = t.closest('.bfc[data-p]');
    if (card && card.closest('.bfs-st') && card.getAttribute('data-pos') !== '0') {
      if (SL.swiped && Date.now() - SL.swiped < 400) return;
      SL.i = $$('.bfs-st > .bfc', SL.el).indexOf(card); place(); pause(); return;
    }
    var pz = t.closest('[data-pzone]'); if (pz) { popZone(pz.getAttribute('data-pzone')); return; }
    var a = t.closest('[data-add]');
    if (a && card) { var p = byId(card.getAttribute('data-p')), z = zoneOf(p); pause(); if (S.cart.some(function (l) { return l.id === p.id; })) { openSheet('cart'); return; } add(p.id, z, a); openPop(p.id, z, a); return; }
    if (t.closest('[data-checkout]')) { closePop(function () { openSheet('cart'); }); return; }
    if (t.closest('[data-shop-on]')) { closePop(); return; }
    var plus = t.closest('[data-plus]'); if (plus) { var id = plus.getAttribute('data-plus'), pz = plus.getAttribute('data-pz') || ''; if (lineOf(id, pz)) setQty(keyOf(id, pz), -99); else add(id, pz); return; }
    var q = t.closest('[data-q]'); if (q) { setQty(q.getAttribute('data-k'), Number(q.getAttribute('data-q'))); return; }
    if (t.closest('[data-cart]')) { openSheet('cart'); return; }
    if (t.closest('[data-close]')) { closeSheet(); return; }
    if (t.closest('[data-back]')) { go(ORDER[Math.max(0, ORDER.indexOf(S.step) - 1)]); return; }
    var gg = t.closest('[data-go]'); if (gg && sheet && sheet.contains(gg)) { go(gg.getAttribute('data-go')); return; }
    var c = t.closest('[data-city]'); if (c && !c.disabled) { S.city = c.getAttribute('data-city'); save(); paneCart(); return; }
    var n = t.closest('[data-need]'); if (n) { S.need = n.getAttribute('data-need'); grid(); return; }
    var v = t.closest('[data-visit]'); if (v) { S.visit = v.getAttribute('data-visit'); $$('[data-visit]', sheet).forEach(function (b) { b.setAttribute('aria-pressed', String(b === v)); }); days(); return; }
    var dy = t.closest('[data-day]'); if (dy) { S.date = dy.getAttribute('data-day'); S.time = ''; drawDays(); return; }
    var tm = t.closest('[data-time]'); if (tm) { S.time = tm.getAttribute('data-time'); drawDays(); return; }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (pop) closePop(); else if (sheetOn) closeSheet(); } });

  function load() {
    return fetch('/api/shop', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) return;
      D = d; offset = d.terms.now - Date.now();
      S.cart = S.cart.filter(function (l) { return l && byId(l.id); });
      slider(); grid(); headCart(); bar(); tick();
      if (/[?&#]cos\b/.test(location.search + location.hash) && lines().length) openSheet('cart');
    }).catch(function () { var g = $('[data-bfo-grid]') || $('[data-bfs]'); if (g) g.innerHTML = '<div class="sh-alert">Nu am putut încărca ofertele. Reîncarcă pagina.</div>'; });
  }
  // the preview: the menu's Black Friday links go to the preview's offers page
  if (/^\/v2\//.test(location.pathname)) $$('a[href="/v2/oferte"]').forEach(function (a) { a.setAttribute('href', '/v2/oferte-bf'); });
  window.C360Shop = { add: add, open: function () { openSheet('cart'); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
  setInterval(tick, 1000);
  addEventListener('pagehide', function () { if (S.hold) release(); });
})();
