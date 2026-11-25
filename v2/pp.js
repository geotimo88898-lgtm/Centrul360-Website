/* ============================================================
   Centrul360, a treatment's page in the Black Friday shop (v2/tratamente.py writes it, v2/pp.css draws it).
     #tp-data            the page's facts: the product (the server's id), its zones, the sessions, the list price
     [data-tp-buy]       the buy box: the zone, the sessions (1×, 3×, 6× or 1×, 2×, 3×), the price at -50%, „Rezervă oferta”
     [data-tp-zone]      a zone, in the buy box, on the body or face map, in the chips: one choice everywhere
     [data-tp-add]       puts the chosen session in the cart (window.C360Shop of v2/shop.js), from the button it was pressed on
     [data-tp-anim]      the explainer: three steps that play when it is in sight, a tap jumps to a step
     [data-tp-bar]       the phone's buy bar: from the first screen, away only while the buy box or the last call is in sight;
                         it carries the cart (its count opens it), so the shop's own cart bar stays away on the phone
     [data-tp-hp]        the price line under the name (-50%, the price, the list price), the same price as the buy box
     [data-tp-tm]        the time left to the end of Black Friday (the server's clock)
   The price is the server's (/api/shop); the page shows the list price at -50% until it answers. Reduced motion: no loops,
   the explainer shows its last step and changes only when tapped.
   ============================================================ */
(function () {
  'use strict';
  var root = document.querySelector('[data-tp]'), dataEl = document.getElementById('tp-data');
  if (!root || !dataEl) return;
  var CFG; try { CFG = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var BASE = /^\/v2\//.test(location.pathname) ? '/v2/' : '/';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var lei = function (n) { return Math.round(Number(n) || 0).toLocaleString('ro-RO') + ' lei'; };
  var EPI = CFG.epi || null;
  var END = Date.parse('2026-11-27T21:59:59.000Z'), offset = 0;
  var S = { zone: (CFG.zones && CFG.zones[0]) || '', key: 'full-body', g: 'f', n: 1, pct: CFG.pct || 50, inCart: {} };
  var CAT = null; // the server's products by id
  var ALLZ = 'Full Body'; // the twin <id>-toate (the owner, 25.11: „Full Body”, not „Toate zonele”)
  // „Full Face” on the face's zones (the owner, 25.11): HIFU Full Face, BioLifting Full Face
  var FF = 'Full Face', FULLF = { hifu: 'hifu-full-face', biolifting: 'biolifting-full-face' };

  // ---- what she picked → the product, its name and price
  function epiId(key, g) { return key === 'full-body' ? 'epilare-full-body' : 'epilare-' + key + (g === 'm' ? '-barbati' : ''); }
  function epiRow(key, g) { var id = epiId(key, g); return (EPI || []).filter(function (z) { return z.id === id; })[0]; }
  function cur() {
    if (EPI) {
      var row = epiRow(S.key, S.g) || epiRow('full-body', 'f');
      var p = CAT && CAT[row.id];
      return { id: row.id, zone: '', label: row.label, name: 'Epilare ' + row.label + (S.g === 'm' && row.id !== 'epilare-full-body' ? ' bărbați' : ''), full: p ? p.full : row.full, price: p ? p.price : Math.round(row.full * (100 - S.pct) / 100), ok: !CAT || !!p };
    }
    // „Toate zonele”: the twin product <id>-toate (one session on every zone)
    if (S.zone === ALLZ) {
      var t = CAT && CAT[CFG.id + '-toate'], tf = t ? t.full : CFG.full * Math.max(1, (CFG.zones || []).length);
      return { id: CFG.id + '-toate', zone: '', label: ALLZ, name: CFG.name + ' ' + ALLZ, full: tf, price: t ? t.price : Math.round(tf * (100 - S.pct) / 100), ok: !CAT || !!t };
    }
    if (S.zone === FF && FULLF[CFG.id]) {
      var ff = CAT && CAT[FULLF[CFG.id]];
      return { id: FULLF[CFG.id], zone: '', label: FF, name: ff ? ff.name : CFG.name + ' ' + FF, full: ff ? ff.full : CFG.full, price: ff ? ff.price : Math.round(CFG.full * (100 - S.pct) / 100), ok: !CAT || !!ff };
    }
    var q = CAT && CAT[CFG.id];
    var full = q ? q.full : CFG.full;
    return { id: CFG.id, zone: S.zone, label: S.zone, name: CFG.name + (S.zone ? ' ' + S.zone : ''), full: full, price: q ? q.price : Math.round(full * (100 - S.pct) / 100), ok: !CAT || !!q };
  }
  var keyOf = function (id, zone) { return id + '|' + (zone || ''); };

  // ---- painting: every price, name and choice on the page from the same state
  function setText(el, t) { if (!el || el.textContent === t) return; el.textContent = t; if (!reduce) { el.classList.remove('tp-flip'); void el.offsetWidth; el.classList.add('tp-flip'); } }
  // the packages that hold this treatment (the owner, 25.11: „și aici, regăsit în pachetele X”, instead of „mai bine împreună”):
  // the price list's packages and the problem packages (api/_lib/shop.js), on the zone she picked; a tap puts one in the cart.
  // A treatment in no package keeps its pairs.
  var PK = null, pkKey = '';
  function pkName(k, z) { return k.bundle ? k.name + (z ? ', ' + z : '') : z ? k.name.replace(' · ', ' ' + z + ' · ') : k.name; }
  function pkSave(k) {
    var one = function (id) { var q = CAT[id]; if (!q) return 0; var b = q.base ? CAT[q.base] : q; return b ? b.price * (q.pack || 1) : 0; };
    return k.bundle ? (k.parts || []).reduce(function (s, x) { return s + one(x.id) * x.n; }, 0) - k.price : one(k.id) - k.price;
  }
  function pkSec() {
    var sec = $('.tp-pairs-s');
    if (!sec || !PK || EPI) return;
    var z = S.zone && S.zone !== ALLZ && S.zone !== FF ? S.zone : '';
    var list = PK.filter(function (k) { return (k.base === CFG.id || (k.bundle && (k.for || []).indexOf(CFG.id) > -1)) && (!k.zones.length || !z || k.zones.indexOf(z) > -1); });
    // the same choice as the cart (v2/shop.js ladder, the owner 25.11): the solution, a more complete one, the top one, cheapest
    // first; the first step only when the solution is a big jump from one session; the price list's packages only with no problem
    // package for this treatment
    var bs = list.filter(function (k) { return k.bundle; }), one = (CAT[CFG.id] || {}).price || 0;
    var of = function (t) { return bs.filter(function (k) { return (k.tier || 2) === t; }).sort(function (a, b) { return a.price - b.price; }); };
    var sol = of(2)[0], more = sol ? of(3).filter(function (k) { return k.price > sol.price; })[0] : of(3)[0];
    var top = bs.slice().sort(function (a, b) { return b.price - a.price; })[0];
    var start = !sol || sol.price > one * 2.5 ? of(1).filter(function (k) { return k.price > one; })[0] : null;
    var pick = [sol, more, top, start].filter(function (k, i, a) { return k && a.indexOf(k) === i; });
    list = bs.length ? pick.sort(function (a, b) { return a.price - b.price; }) : list.sort(function (a, b) { return a.pack - b.pack; }).slice(0, 3);
    var key = z + '|' + list.map(function (k) { return k.id + (S.inCart[keyOf(k.id, k.zones.length ? z : '')] ? '+' : ''); }).join();
    if (!list.length || key === pkKey) return;
    pkKey = key;
    var PLUS = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
    var CHECK = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
    var esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    $('.wrap', sec).innerHTML = '<header class="tp-head"><p class="tp-eye">Se regăsește în pachetele</p><h2>Mai avantajos <em>în pachet.</em></h2><p class="tp-lead">Aceeași procedură, în pachetul care îți aduce rezultatul complet. Tot la -' + S.pct + '%.</p></header>' +
      '<div class="tp-pairs">' + list.map(function (k) {
        var kz = k.zones.length ? z || k.zones[0] : '', on = !!S.inCart[keyOf(k.id, kz)], sv = pkSave(k), home = k.home || k.base || CFG.id;
        return '<article class="tp-pair tp-pk"><span class="th" aria-hidden="true"><img src="/brand_asset/tratamente/' + esc(home) + '-300.webp?v=2" alt="" loading="lazy" decoding="async"></span>' +
          '<div class="tx"><b>' + esc(pkName(k, kz)) + '</b><p>' + esc(k.bundle ? k.inc : k.pack + ' ședințe, ' + lei(Math.round(k.price / k.pack)) + ' ședința') + '</p>' +
          '<span class="pz"><b>' + lei(k.price) + '</b> <s>' + lei(k.full) + '</s></span></div>' +
          '<button type="button" class="tp-plus' + (on ? ' in' : '') + '" data-tp-pk="' + esc(k.id) + '" data-tp-pkz="' + esc(kz) + '" aria-label="' + (on ? 'În coș' : 'Adaugă ' + esc(pkName(k, kz)) + ' în coș') + '">' + (on ? CHECK : PLUS) + '</button></article>';
      }).join('') + '</div>';
    sec.hidden = false;
  }
  // ---- the photo of the zone she picked (the owner, 25.11: „dacă apăs pe gât, tot poza cu gușă apare; ca un e-commerce pe bune”):
  // brand_asset/tratamente/hero/<page>--<zone>.webp, the treatment's own hero/<page>.webp, as listed in hero/index.json (the photos
  // arrive one by one); a zone without its photo keeps the treatment's
  var HX = null, heroImg = $('[data-tp-img]');
  var slug = function (z) { return String(z).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); };
  function heroName() {
    var z = S.zone, pg = CFG.page || CFG.id;
    if (z === FF && FULLF[pg] && HX[FULLF[pg]]) return FULLF[pg];
    if (z && z !== ALLZ && z !== FF && HX[pg + '--' + slug(z)]) return pg + '--' + slug(z);
    return HX[pg] ? pg : '';
  }
  function heroPaint() {
    if (!HX || !heroImg || EPI) return;
    var n = heroName(); if (!n) return;
    var u = '/brand_asset/tratamente/hero/' + n + '.webp?v=' + (HX._v || 1);
    if (heroImg.getAttribute('src') === u) return;
    var pre = new Image();
    pre.onload = function () {
      if (reduce) { heroImg.src = u; heroImg.style.objectPosition = '50% 45%'; return; }
      heroImg.classList.add('fade');
      setTimeout(function () { heroImg.src = u; heroImg.style.objectPosition = '50% 45%'; heroImg.classList.remove('fade'); }, 200);
    };
    pre.src = u;
  }
  if (heroImg && !EPI) fetch('/brand_asset/tratamente/hero/index.json?t=' + Math.floor(Date.now() / 600000), { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { HX = d && typeof d === 'object' ? d : null; heroPaint(); }).catch(function () { /* the treatment's picture stays */ });

  function paint() {
    var c = cur(), n = S.n;
    pkSec(); heroPaint();
    $$('[data-tp-price]').forEach(function (el) { setText(el, lei(c.price * n)); });
    $$('[data-tp-full]').forEach(function (el) { setText(el, lei(c.full * n)); });
    $$('[data-tp-save]').forEach(function (el) { setText(el, 'Economisești ' + lei((c.full - c.price) * n)); });
    $$('[data-tp-per]').forEach(function (el) { el.textContent = n > 1 ? n + ' ședințe · ' + lei(c.price) + ' / ședință' : 'o ședință'; });
    $$('[data-tp-name]').forEach(function (el) { setText(el, c.name); });
    $$('.tp-pct').forEach(function (el) { el.textContent = '-' + S.pct + '%'; });
    var zn = $('[data-tp-zn]');
    if (zn && zn.textContent !== c.label) {
      if (reduce) zn.textContent = c.label;
      else { zn.classList.add('sw'); setTimeout(function () { zn.textContent = c.label; zn.classList.remove('sw'); }, 220); }
    }
    // the zone everywhere: chips, map dots, map regions
    var picked = EPI ? S.key : S.zone;
    $$('[data-tp-zone]').forEach(function (b) {
      var on = b.getAttribute('data-tp-zone') === picked;
      if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(on)); else b.classList.toggle('on', on);
      if (EPI) { var gx = b.getAttribute('data-gx') || 'fm'; var show = gx.indexOf(S.g) > -1 && (!CAT || !!CAT[epiId(b.getAttribute('data-tp-zone'), S.g)]); if (b.tagName === 'BUTTON') b.hidden = !show; else b.style.display = show ? '' : 'none'; }
    });
    $$('.tp-map.pick [data-tp-region]').forEach(function (r) { r.classList.toggle('on', r.getAttribute('data-tp-region') === picked); });
    $$('[data-tp-g]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-tp-g') === S.g)); });
    $$('.tp-map.tp-epi').forEach(function (m) { m.classList.toggle('m', S.g === 'm'); });
    $$('[data-tp-n]').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-tp-n') === n)); });
    if (EPI) epiPairs();
    pairsPaint();
    // the buttons: in the cart already → finish
    var mine = !!S.inCart[keyOf(c.id, c.zone)];
    $$('[data-tp-add]').forEach(function (b) {
      var bar = !!b.closest('[data-tp-bar]'), sm = b.classList.contains('sm');
      b.classList.toggle('in', mine);
      var st = (mine ? 'in' : 'out') + (bar || sm ? 's' : '');
      if (b.getAttribute('data-st') !== st) { b.setAttribute('data-st', st); b.innerHTML = mine ? (bar || sm ? 'Finalizează' : '&#10003; În coș · Finalizează') + ARROW : (bar || sm ? 'Rezervă' : 'Rezervă oferta') + ARROW; }
      b.disabled = !c.ok;
    });
  }
  // the laser's other zones: the ones that add something to what she picked (Full Body already has these four), at most three
  var IN_FB = ['axile', 'inghinal-total', 'brate-total', 'picior-lung'];
  function epiPairs() {
    var shown = 0;
    $$('[data-tp-ekey]').forEach(function (el) {
      var k = el.getAttribute('data-tp-ekey'), row = epiRow(k, S.g), id = row && row.id, p = CAT && id && CAT[id];
      var ok = row && k !== S.key && !(S.key === 'full-body' && IN_FB.indexOf(k) > -1) && (!CAT || p) && shown < 3;
      el.hidden = !ok;
      if (!ok) return;
      shown++;
      var b = $('[data-tp-plus]', el), nm = $('[data-tp-en]', el);
      if (b && b.getAttribute('data-tp-plus') !== id) { b.setAttribute('data-tp-plus', id); b.classList.toggle('in', Object.keys(S.inCart).some(function (x) { return x.indexOf(id + '|') === 0; })); }
      if (nm) nm.textContent = 'Epilare ' + row.label + (S.g === 'm' ? ' bărbați' : '');
      var pp = $('[data-tp-pp]', el), pf = $('[data-tp-pf]', el);
      if (pp) pp.textContent = lei(p ? p.price : Math.round(row.full * (100 - S.pct) / 100)); if (pf) pf.textContent = lei(p ? p.full : row.full);
    });
    var sec = $('.tp-pairs-s'); if (sec) sec.hidden = !shown;
  }
  var ARROW = '<svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  // ---- the cart (v2/shop.js): its new API add({id, zone, qty}, from) opens its own popup; the older add(id, zone, qty) does not
  function shop() { return window.C360Shop && typeof window.C360Shop.add === 'function' ? window.C360Shop : null; }
  function isNew(s) { return typeof s.catalog === 'function' || typeof s.price === 'function'; }
  function addToCart(id, zone, qty, from, quiet) {
    var s = shop();
    if (!s) { location.href = BASE + (BASE === '/v2/' ? 'oferte-bf' : 'oferte'); return false; }
    try {
      if (isNew(s)) s.add({ id: id, zone: zone || '', qty: qty || 1 }, from);
      else { s.add(id, zone || '', qty || 1); if (!quiet && typeof s.open === 'function') setTimeout(function () { s.open(); }, 80); }
    } catch (e) { return false; }
    S.inCart[keyOf(id, zone)] = 1;
    return true;
  }
  function openCart() { var s = shop(); if (s && typeof s.open === 'function') s.open(); }
  // what is already in her cart (kept by shop.js on this device); read again whenever the cart changes (a line taken out in the
  // cart, a zone changed in the popup), so the buttons never say „În coș” for something that is not
  function syncCart() {
    var list = null, s = shop();
    if (s && typeof s.lines === 'function') { try { list = s.lines(); } catch (e) { list = null; } }
    if (!list) { try { var kept = JSON.parse(localStorage.getItem('c360-shop3') || 'null'); list = kept && Array.isArray(kept.cart) ? kept.cart : []; } catch (e) { list = []; } }
    S.inCart = {};
    list.forEach(function (l) { if (l && l.id) S.inCart[keyOf(l.id, l.zone)] = 1; });
    return list.length;
  }
  syncCart();
  document.addEventListener('c360:cart', function () { bagPaint(syncCart()); paint(); });
  document.addEventListener('c360:shop', function () { bagPaint(syncCart()); paint(); });
  // the bar's bag: how many lines are in the cart; a tap opens it
  function bagPaint(n) {
    var b = $('[data-tp-bag]'); if (!b) return;
    b.hidden = !n;
    var i = $('i', b); if (i) i.textContent = n || '';
    b.setAttribute('aria-label', n ? 'Coșul tău, ' + n + (n === 1 ? ' tratament' : ' tratamente') : 'Coșul tău');
  }
  bagPaint(Object.keys(S.inCart).length);
  // what goes well with it: the paired treatment on the zone she picked here when it has it (Liposonix Coapse → EMS Coapse)
  function pairZone(p) { return p && p.zones && p.zones.length ? (p.zones.indexOf(S.zone) > -1 ? S.zone : p.zones[0]) : ''; }
  function pairsPaint() {
    $$('[data-tp-pair] [data-tp-plus]').forEach(function (b) {
      var id = b.getAttribute('data-tp-plus'), p = CAT && CAT[id], z = pairZone(p), on = !!S.inCart[keyOf(id, z)];
      b.classList.toggle('in', on);
      var nm = p ? p.name + (z ? ' ' + z : '') : '';
      if (nm) b.setAttribute('aria-label', on ? nm + ', în coș' : 'Adaugă ' + nm + ' în coș');
    });
  }

  // ---- taps
  root.addEventListener('click', onTap);
  // (the bar sits inside the page's root: one listener, else a tap on its button adds and then opens the cart at once)
  var bar = $('[data-tp-bar]'); if (bar && !root.contains(bar)) bar.addEventListener('click', onTap);
  function onTap(e) {
    var t = e.target;
    var z = t.closest('[data-tp-zone]');
    if (z) { pickZone(z.getAttribute('data-tp-zone'), z); return; }
    var g = t.closest('[data-tp-g]');
    if (g) { S.g = g.getAttribute('data-tp-g'); if (!epiRow(S.key, S.g)) S.key = 'full-body'; paint(); return; }
    var nb = t.closest('[data-tp-n]');
    if (nb) { S.n = +nb.getAttribute('data-tp-n') || 1; paint(); return; }
    var a = t.closest('[data-tp-add]');
    if (a) {
      var c = cur();
      if (S.inCart[keyOf(c.id, c.zone)]) { openCart(); return; }
      if (addToCart(c.id, c.zone, S.n, a)) paint();
      return;
    }
    var pk = t.closest('[data-tp-pk]');
    if (pk) {
      if (pk.classList.contains('in')) { openCart(); return; }
      if (addToCart(pk.getAttribute('data-tp-pk'), pk.getAttribute('data-tp-pkz'), 1, pk, true)) { pkKey = ''; pkSec(); }
      return;
    }
    var pl = t.closest('[data-tp-plus]');
    if (pl) {
      var pid = pl.getAttribute('data-tp-plus'), p = CAT && CAT[pid], pz = pairZone(p);
      if (pl.classList.contains('in')) { openCart(); return; }
      if (addToCart(pid, pz, 1, pl, true)) { pl.classList.add('in'); pl.setAttribute('aria-label', 'În coș'); }
      return;
    }
    var st = t.closest('[data-tp-s]');
    if (st) { anim.jump(+st.getAttribute('data-tp-s')); return; }
    var pv = t.closest('[data-tp-play]');
    if (pv) { var fig = pv.closest('.tp-vid'), v = fig && $('video', fig); if (v) { v.controls = true; fig.classList.add('playing'); var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); } return; }
  }
  function pickZone(v, from) {
    if (EPI) { if (!epiRow(v, S.g)) return; S.key = v; } else S.zone = v;
    paint();
    // a tap on the map: the chip of that zone comes into view in the buy box's row (laser zones scroll sideways)
    var chip = $('.tp-chips [data-tp-zone="' + v.replace(/"/g, '') + '"]');
    if (chip && chip.parentNode.classList.contains('sc')) { var row = chip.parentNode; row.scrollLeft = chip.offsetLeft - row.clientWidth / 2 + chip.offsetWidth / 2; }
    if (from && from.closest && from.closest('svg') && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* none */ } }
  }

  // ---- the server's catalog and clock
  function load() {
    var get = function () { return fetch('/api/shop', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }); };
    // the answer the page's head already asked for (window.C360Pre, the same one v2/shop.js uses), else its own
    var pre = window.C360Pre && window.C360Pre.shop;
    return (pre ? pre.catch(get) : get()).then(function (d) {
      if (!d || !d.ok || !Array.isArray(d.products)) return;
      CAT = {}; d.products.forEach(function (p) { CAT[p.id] = p; });
      PK = Array.isArray(d.packs) ? d.packs : []; PK.forEach(function (p) { CAT[p.id] = CAT[p.id] || p; });
      if (d.terms) { if (d.terms.end) END = Date.parse(d.terms.end); if (d.terms.now) offset = d.terms.now - Date.now(); if (d.terms.pct) S.pct = d.terms.pct; }
      // the zones the server sells (a chip it does not know goes away)
      var q = CAT[CFG.id];
      if (!EPI && q && q.zones && q.zones.length) {
        $$('[data-tp-zone]').forEach(function (b) { var z = b.getAttribute('data-tp-zone'), ok = q.zones.indexOf(z) > -1 || (z === ALLZ && !!CAT[CFG.id + '-toate']) || (z === FF && !!(FULLF[CFG.id] && CAT[FULLF[CFG.id]])); if (b.tagName === 'BUTTON') b.hidden = !ok; else b.style.display = ok ? '' : 'none'; });
        if (q.zones.indexOf(S.zone) < 0 && !(S.zone === ALLZ && CAT[CFG.id + '-toate']) && !(S.zone === FF && FULLF[CFG.id] && CAT[FULLF[CFG.id]])) S.zone = q.zones[0];
      }
      // what goes well with it: the server's prices; a treatment it does not sell keeps only its link
      $$('[data-tp-pair]').forEach(function (el) {
        var b = $('[data-tp-plus]', el), p = b && CAT[b.getAttribute('data-tp-plus')];
        if (!p) { if (b) b.hidden = true; return; }
        var pp = $('[data-tp-pp]', el), pf = $('[data-tp-pf]', el);
        if (pp) pp.textContent = lei(p.price); if (pf) pf.textContent = lei(p.full);
      });
      paint(); tick();
    }).catch(function () { /* the page keeps the list price at -50% */ });
  }

  // ---- the time left: days, hours, minutes, seconds
  function tick() {
    var ms = Math.max(0, END - (Date.now() + offset)), s = Math.floor(ms / 1000);
    var v = [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60];
    $$('[data-tp-tm] [data-u]').forEach(function (b) { var x = v[+b.getAttribute('data-u')]; b.textContent = (x < 10 ? '0' : '') + x; });
    $$('[data-tp-tm] [data-uu]').forEach(function (el) { var k = +el.getAttribute('data-uu'), one = v[k] === 1; el.textContent = k === 0 ? (one ? 'zi' : 'zile') : k === 1 ? (one ? 'oră' : 'ore') : k === 2 ? 'min' : 'sec'; });
  }
  tick(); setInterval(tick, 1000);

  // ---- the phone's buy bar: there from the first screen (the ad's visitor sees the price and the button at once), away only
  // while the buy box or the last call is in sight (the same price and button twice, one over the other)
  var buy = $('[data-tp-buy]'), endC = $('.tp-end-c'), pick = $('.tp-pick'), barOn = null, boxOn = null, ticking = false;
  document.body.classList.add('tp-page');
  function inSight(el, h) { var r = el && el.getBoundingClientRect(); return !!(r && r.height && r.top < h - 96 && r.bottom > 96); }
  function barCheck() {
    ticking = false;
    if (!bar || !buy) return;
    var h = innerHeight, box = inSight(buy, h) || inSight(endC, h);
    var pr = pick && pick.getBoundingClientRect(), atPick = pr && pr.height && pr.top < h && pr.bottom > 0;
    var on = !box && !atPick && innerWidth < 960;
    // the shop's cart bar never sits over the buy box's own button (on a computer too)
    if (box !== boxOn) { boxOn = box; document.body.classList.toggle('tp-buy-on', box); }
    if (on !== barOn) {
      barOn = on;
      bar.classList.toggle('on', on); bar.setAttribute('aria-hidden', String(!on));
      $$('button', bar).forEach(function (b) { b.tabIndex = on ? 0 : -1; });
      document.body.classList.toggle('tp-bar-on', on); document.body.classList.toggle('pp-bar-on', on);
    }
  }

  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(barCheck); } }, { passive: true });
  addEventListener('resize', barCheck);
  // the cookie question also sits at the bottom (on the first visit, the ad's visitor): while it is open the bar waits above it
  var ck = $('.ck');
  function ckLift() {
    if (!bar || !ck) return;
    var on = document.body.classList.contains('ck-open') && !ck.hidden, v = '';
    if (on) { var cs = getComputedStyle(ck); v = Math.round((parseFloat(cs.bottom) || 10) + ck.offsetHeight + 10) + 'px'; }
    if (bar.style.bottom !== v) bar.style.bottom = v;
  }
  if (ck && window.MutationObserver) new MutationObserver(ckLift).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', ckLift);
  ckLift();

  // ---- the explainer: step 1, 2, 3 while it is in sight; a tap jumps to a step and it goes on from there
  var anim = (function () {
    var fig = $('[data-tp-anim]'), lis = fig ? $$('.tp-steps li', fig.parentNode) : [];
    var DUR = [3600, 3600, 4400], i = 0, timer = 0, seen = false, vis = false;
    function set(k, instant) {
      if (!fig) return;
      if (instant) fig.classList.add('nt');
      fig.setAttribute('data-step', String(k));
      for (var s = 1; s <= 3; s++) fig.classList.toggle('s' + s, k >= s);
      lis.forEach(function (li, j) {
        li.classList.toggle('on', j === k - 1); li.classList.toggle('done', j < k - 1);
        li.style.setProperty('--dur', DUR[j] + 'ms');
        var bar = $('.bar i', li); if (bar && j === k - 1) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
      });
      if (instant) { void fig.offsetWidth; fig.classList.remove('nt'); }
      i = k;
    }
    function next() {
      clearTimeout(timer);
      if (!vis || document.hidden) return;
      if (i < 3) { set(i + 1); timer = setTimeout(next, DUR[i - 1]); return; }
      // the loop starts over: a soft fade, back to the start, step 1
      fig.classList.add('rst');
      timer = setTimeout(function () {
        set(0, true); fig.classList.remove('rst');
        timer = setTimeout(next, 420);
      }, 480);
    }
    function start() { if (reduce) return; fig.classList.add('run'); clearTimeout(timer); timer = setTimeout(i === 0 ? next : next, i === 0 ? 350 : DUR[Math.max(0, i - 1)]); }
    function stop() { clearTimeout(timer); if (fig) fig.classList.remove('run'); }
    function jump(k) {
      if (!fig) return;
      clearTimeout(timer);
      if (k < i) { set(0, true); }
      set(k);
      if (!reduce && vis) timer = setTimeout(next, DUR[k - 1] + 2600);
    }
    if (fig) {
      if (reduce) { set(3, true); fig.parentNode.classList.add('still'); }
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
          es.forEach(function (en) { vis = en.isIntersecting; if (vis) { seen = true; start(); } else stop(); });
        }, { threshold: 0.35 }).observe(fig);
      } else if (!reduce) { vis = true; start(); }
      document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (vis) start(); });
    }
    return { jump: jump };
  })();

  // ---- the questions open and close softly
  $$('.tp-faq details, .tp-cond').forEach(function (d) {
    var sum = $('summary', d), body = $('.a', d);
    if (!sum || !body || reduce || !body.animate) return;
    sum.addEventListener('click', function (e) {
      e.preventDefault();
      if (d._busy) return;
      d._busy = true;
      if (!d.open) {
        d.open = true;
        var h = body.scrollHeight;
        body.animate([{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' }).onfinish = function () { d._busy = false; };
      } else {
        var h2 = body.scrollHeight;
        body.animate([{ height: h2 + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 320, easing: 'cubic-bezier(.65,0,.35,1)' }).onfinish = function () { d.open = false; d._busy = false; };
      }
    });
  });

  // ---- the 3D loops: loaded when close, playing only while in sight (silent, in a loop); with less motion, a still with controls
  $$('video[data-tp-auto]').forEach(function (v) {
    var load = function () { if (!v.getAttribute('src') && v.getAttribute('data-src')) v.src = v.getAttribute('data-src'); };
    if (reduce) { load(); v.controls = true; return; }
    v.muted = true;
    if (!('IntersectionObserver' in window)) { load(); v.autoplay = true; return; }
    new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { load(); var p = v.play(); if (p && p.catch) p.catch(function () {}); } else if (v.getAttribute('src')) v.pause(); }); }, { threshold: 0.25, rootMargin: '200px 0px' }).observe(v);
  });

  // ---- the treatment's own picture, when it exists after the page was made (v2/art.json)
  var img = $('[data-tp-img]'), stage = img && img.closest('.tp-stage');
  // (a page made with its own full photo already has it: nothing to ask)
  if (img && stage && !stage.classList.contains('own') && !stage.classList.contains('full')) {
    (window.C360Pre && window.C360Pre.art ? window.C360Pre.art : fetch('/v2/art.json', { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : null; })).then(function (a) {
      var x = a && (a[CFG.id] || a[CFG.page]);
      if (!x || !x.img || img.getAttribute('src') === x.img) return;
      var pre = new Image();
      pre.onload = function () { img.classList.add('fade'); setTimeout(function () { img.src = x.img; img.style.objectPosition = 'center bottom'; img.classList.remove('fade'); stage.classList.add('own'); }, 400); };
      pre.src = x.img;
    }).catch(function () { /* keep the cut-out */ });
  }

  // ---- Meta: the treatment's page was seen (ViewContent), once, only with her consent (like the cart's AddToCart)
  var vcDone = false;
  function vc() {
    if (vcDone || !window.fbq || !window.C360_CONSENT) return;
    vcDone = true;
    try { var c = cur(); window.fbq('track', 'ViewContent', { content_ids: [c.id], content_type: 'product', content_name: c.name, value: c.price, currency: 'RON' }); } catch (e) { /* no pixel */ }
  }
  setTimeout(vc, 1200);
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-ck="y"]')) setTimeout(vc, 300); });

  paint(); barCheck(); load();
})();
