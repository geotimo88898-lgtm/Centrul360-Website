/* Centrul360 v2: the live parts and the motion of every page.
   Live: [data-offers] = the active offers of Admin → Oferte (/api/offers-public); [data-slot] = the next real free
   hour of a clinic (/api/booking, the portal's Calendar); #lead = the gift form (HighLevel + /api/site-lead).
   Motion (all clean, transform + opacity, one easing): .rv reveals, [data-words] headline, [data-count] numbers,
   [data-scrub] the sentence that fills in, [data-tl] the protocol line, .proc the explainer, .cases the results,
   .nuki taps, .q questions, the CTA sparkle, the header and the phone dock.
   Booking buttons are plain [data-book] buttons: /c360-book.js opens the booking on top of the page. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var CAT = { epilare: 'Epilare laser', faciale: 'Față', remodelare: 'Corp' };
  var CITY = { timisoara: 'Timișoara', arad: 'Arad' };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var lei = function (n) { return Math.round(n).toLocaleString('ro-RO') + ' lei'; };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var ARROW = '<svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  // ---------- live: offers from Admin
  function slip(o) {
    var cities = (o.locations || []).map(function (c) { return CITY[c] || c; });
    var one = cities.length === 1 ? cities[0] : '';
    var cut = o.priceOld > o.priceNew;
    var pct = cut ? Math.round((1 - o.priceNew / o.priceOld) * 100) : 0;
    return '<div class="slip rv">' + (pct ? '<span class="pct">-' + pct + '%</span>' : '') +
      '<span class="k">' + esc(CAT[o.category] || 'Tratament') + '</span><h3>' + esc(o.title) + '</h3>' +
      '<div class="pr"><b data-count="' + Math.round(o.priceNew) + '" data-suffix=" lei">' + lei(o.priceNew) + '</b>' + (cut ? '<s>' + lei(o.priceOld) + '</s>' : '') + '</div>' +
      (cut ? '<span class="save">Economisești ' + lei(o.priceOld - o.priceNew) + '</span>' : '') +
      '<span class="where">' + esc(cities.length ? cities.join(' și ') : 'Timișoara și Arad') + '</span>' +
      '<button type="button" class="btn book" data-book data-book-service="' + esc(o.key) + '"' + (one ? ' data-book-city="' + esc(one) + '"' : '') + '>Rezervă oferta' + ARROW + '</button></div>';
  }
  var boxes = $$('[data-offers]');
  if (boxes.length) {
    fetch('/api/offers-public').then(function (r) { return r.json(); }).then(function (d) {
      var list = (d.offers || d || []).filter(function (o) { return o && o.title; });
      boxes.forEach(function (box) {
        var cat = box.getAttribute('data-offers');
        var mine = cat === 'all' ? list : list.filter(function (o) { return cat.split(',').indexOf(o.category) >= 0; });
        box.innerHTML = mine.length ? mine.map(slip).join('') : '<p class="fine">Acum nu e nicio ofertă activă aici. La consultația gratuită îți spunem prețul exact.</p>';
      });
      wire(); tick();
    }).catch(function () { boxes.forEach(function (b) { b.innerHTML = '<p class="fine">Ofertele se încarcă. <a href="/oferte.html">Vezi ofertele</a></p>'; }); });
  }

  // ---------- live: the next real free hour (a consultation, per clinic), from the Calendar
  var DAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  var MON = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
  function nice(date) {
    var d = new Date(date + 'T12:00:00Z'), t = new Date().toISOString().slice(0, 10), tm = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    if (date === t) return 'azi';
    if (date === tm) return 'mâine';
    return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()];
  }
  var slotEls = $$('[data-slot]');
  if (slotEls.length) {
    var found = {};
    Promise.all(['Timișoara', 'Arad'].map(function (c) {
      return fetch('/api/booking?city=' + encodeURIComponent(c) + '&service=consult').then(function (r) { return r.json(); }).then(function (d) {
        var day = (d.days || []).find(function (x) { return x.slots && x.slots.length; });
        if (day) found[c] = { when: nice(day.date), time: day.slots[0] };
      }, function () {});
    })).then(function () {
      slotEls.forEach(function (el) {
        var want = el.getAttribute('data-slot');
        var pick = want && found[want] ? want : (found['Timișoara'] ? 'Timișoara' : found.Arad ? 'Arad' : '');
        if (!pick) { if (el.getAttribute('data-slot-mode') !== 'dock') el.style.visibility = 'hidden'; return; }
        var f = found[pick];
        el.innerHTML = el.getAttribute('data-slot-mode') === 'dock'
          ? '<b>Consultație gratuită</b>Liber: ' + esc(f.when) + ', ' + esc(f.time)
          : '<span class="dot"></span><span>Prima oră liberă la ' + esc(pick) + ': <b>' + esc(f.when) + ', ' + esc(f.time) + '</b></span>';
      });
    });
  }

  // ---------- motion: split words
  function split(el, cls) {
    var walk = function (node) {
      $$(':scope > *', node).forEach(walk);
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType !== 3 || !n.textContent.trim()) return;
        var frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(function (p) {
          if (!p) return;
          if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
          var s = document.createElement('span'); s.className = cls; s.textContent = p; frag.appendChild(s);
        });
        node.replaceChild(frag, n);
      });
    };
    walk(el);
    return $$('.' + cls.split(' ')[0], el);
  }
  $$('[data-words]').forEach(function (el) {
    split(el, 'w').forEach(function (w, i) { w.style.transitionDelay = (120 + i * 55) + 'ms'; });
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('in'); }); });
  });
  var scrubs = $$('[data-scrub]').map(function (el) {
    var ws = split(el, 'w');
    ws.forEach(function (w) { if (w.closest('em')) w.classList.add('t'); });
    return { el: el, ws: ws };
  });

  // ---------- motion: numbers that count up
  function countUp(el) {
    if (el._done) return; el._done = true;
    var to = parseFloat(el.getAttribute('data-count')), dec = (el.getAttribute('data-count').split('.')[1] || '').length;
    var pre = el.getAttribute('data-prefix') || '', suf = el.getAttribute('data-suffix') || '', t0 = 0, dur = 1400;
    var fmt = function (v) { return pre + (dec ? v.toFixed(dec).replace('.', ',') : Math.round(v).toLocaleString('ro-RO')) + suf; };
    if (reduce) { el.textContent = fmt(to); return; }
    var step = function (t) { if (!t0) t0 = t; var k = Math.min(1, (t - t0) / dur); el.textContent = fmt(to * (1 - Math.pow(1 - k, 4))); if (k < 1) requestAnimationFrame(step); };
    el.textContent = fmt(0); requestAnimationFrame(step);
  }

  // ---------- motion: everything driven by scroll, in one frame
  var top = document.querySelector('.top'), bar = document.querySelector('.progress'), dock = document.querySelector('.dock');
  var heroCta = document.querySelector('.hero .btn.book'), endSec = document.querySelector('.end');
  var lastY = scrollY, ticking = false;
  function tick() {
    ticking = false;
    var h = innerHeight, y = scrollY;
    $$('.rv:not(.in), .case:not(.in), .score:not(.in), .fit .card:not(.in)').forEach(function (el, i) {
      if (el.getBoundingClientRect().top < h * 0.9) { el.style.transitionDelay = Math.min(i, 3) * 70 + 'ms'; el.classList.add('in'); }
    });
    $$('[data-count]').forEach(function (el) { var r = el.getBoundingClientRect(); if (r.top < h * 0.92 && r.bottom > 0) countUp(el); });
    scrubs.forEach(function (s) {
      var r = s.el.getBoundingClientRect(), k = Math.min(1, Math.max(0, (h * 0.85 - r.top) / (r.height + h * 0.35)));
      var n = Math.round(k * s.ws.length);
      s.ws.forEach(function (w, i) { w.classList.toggle('on', i < n); });
    });
    $$('[data-tl]').forEach(function (tl) {
      var r = tl.getBoundingClientRect(), mid = h * 0.6, k = Math.min(1, Math.max(0, (mid - r.top) / r.height));
      tl.style.setProperty('--p', k.toFixed(4));
      $$('li', tl).forEach(function (li) { li.classList.toggle('on', li.getBoundingClientRect().top + 8 < mid); });
    });
    $$('.proc').forEach(function (p) { var r = p.getBoundingClientRect(); var vis = r.top < h * 0.85 && r.bottom > h * 0.1; if (vis && !p.classList.contains('on')) { p.classList.add('on'); p._t0 = performance.now(); procLoop(); } });
    if (bar) { var max = document.documentElement.scrollHeight - h; bar.style.transform = 'scaleX(' + (max > 0 ? y / max : 0).toFixed(4) + ')'; }
    if (top) { if (y > 240 && y > lastY + 4) top.classList.add('away'); else if (y < lastY - 4 || y < 240) top.classList.remove('away'); }
    if (dock && heroCta) {
      var past = heroCta.getBoundingClientRect().bottom < 0, atEnd = endSec && endSec.getBoundingClientRect().top < h * 0.7;
      dock.classList.toggle('in', past && !atEnd);
    }
    lastY = y;
  }
  var onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(tick); } };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  setTimeout(function () { $$('.rv, .case, .score, .fit .card').forEach(function (el) { el.classList.add('in'); }); }, 4500);

  // ---------- the explainer: the three steps follow the animation (7 s loop)
  var procRaf = 0;
  function procLoop() {
    if (procRaf) return;
    var run = function () {
      procRaf = 0; var any = false;
      $$('.proc.on').forEach(function (p) {
        any = true;
        var cut = (p.getAttribute('data-steps') || '.4,.64').split(',').map(Number);
        var k = ((performance.now() - p._t0) % 7000) / 7000, step = k < cut[0] ? 0 : k < cut[1] ? 1 : 2;
        var ol = p.querySelector('.psteps');
        if (ol) { ol.style.setProperty('--p', k.toFixed(3)); $$('li', ol).forEach(function (li, i) { li.classList.toggle('on', i === step); }); }
      });
      if (any) procRaf = requestAnimationFrame(run);
    };
    procRaf = requestAnimationFrame(run);
  }

  // ---------- interactions (also re-run after the offers arrive)
  function wire() {
    $$('.slip:not([data-w])').forEach(function (el) {
      el.setAttribute('data-w', '1');
      el.addEventListener('pointermove', function (e) { var r = el.getBoundingClientRect(); el.style.setProperty('--mx', (e.clientX - r.left) + 'px'); el.style.setProperty('--my', (e.clientY - r.top) + 'px'); });
    });
  }
  wire();

  // the booking button: a small, soft burst of teal light on press
  document.addEventListener('pointerdown', function (e) {
    var b = e.target.closest && e.target.closest('.btn.book');
    if (!b || reduce) return;
    for (var i = 0; i < 10; i++) {
      var s = document.createElement('i'); s.className = 'spark'; s.style.left = e.clientX + 'px'; s.style.top = e.clientY + 'px';
      if (i % 2) s.style.background = '#fff';
      document.body.appendChild(s);
      var a = (Math.PI * 2 * i) / 10 + Math.random() * 0.4, d = 26 + Math.random() * 26;
      s.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + Math.cos(a) * d + 'px,' + Math.sin(a) * d + 'px) scale(.2)', opacity: 0 }],
        { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)' }).onfinish = (function (x) { return function () { x.remove(); }; })(s);
    }
  }, { passive: true });

  // Nuki: talks, and answers a tap
  $$('.nuki').forEach(function (n) {
    var bub = n.parentNode.querySelector('.bubble'), lines = [], i = 0;
    try { lines = JSON.parse(n.getAttribute('data-lines') || '[]'); } catch (e) {}
    var show = function () { if (!bub || !lines.length) return; bub.classList.remove('in'); setTimeout(function () { bub.innerHTML = '<b>Nuki</b>' + esc(lines[i % lines.length]); bub.classList.add('in'); i++; }, bub.classList.contains('in') ? 220 : 0); };
    setTimeout(show, 1400);
    n.addEventListener('click', function () { n.classList.remove('boing'); void n.offsetWidth; n.classList.add('boing'); show(); });
  });

  // the results: drag with the mouse, dots follow
  $$('.cases').forEach(function (c) {
    var dots = c.parentNode.querySelector('.dots'), items = $$('.case', c);
    if (dots) dots.innerHTML = items.map(function () { return '<i></i>'; }).join('');
    var mark = function () {
      if (!dots) return; var mid = c.scrollLeft + c.clientWidth / 2, best = 0, bd = 1e9;
      items.forEach(function (it, k) { var d = Math.abs(it.offsetLeft + it.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = k; } });
      $$('i', dots).forEach(function (d, k) { d.classList.toggle('on', k === best); });
    };
    c.addEventListener('scroll', function () { requestAnimationFrame(mark); }, { passive: true }); mark();
    var down = false, sx = 0, sl = 0;
    c.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') return; down = true; sx = e.clientX; sl = c.scrollLeft; c.classList.add('drag'); });
    addEventListener('pointermove', function (e) { if (down) c.scrollLeft = sl - (e.clientX - sx); });
    addEventListener('pointerup', function () { if (!down) return; down = false; c.classList.remove('drag'); });
  });

  // the questions
  $$('.q > button').forEach(function (b) {
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', function () { var q = b.parentNode, open = !q.classList.contains('open'); q.classList.toggle('open', open); b.setAttribute('aria-expanded', String(open)); });
  });

  tick();

  // ---------- the gift form
  var f = document.getElementById('lead');
  if (f) f.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = f.querySelector('.err'), nume = f.nume.value.trim(), tel = f.tel.value.replace(/[^\d+]/g, '');
    if (nume.length < 2) { err.textContent = 'Scrie-ne numele tău.'; return; }
    if (tel.replace(/\D/g, '').length < 10) { err.textContent = 'Scrie un număr de telefon valid.'; return; }
    if (!f.ok.checked) { err.textContent = 'Bifează acordul ca să te putem contacta.'; return; }
    err.textContent = ''; var b = f.querySelector('button'); b.disabled = true; b.textContent = 'Se trimite…';
    var payload = { nume: nume, telefon: tel, email: '', interes_principal: f.interes.value, zona: '', oras: f.oras.value,
      sursa: f.getAttribute('data-sursa') || 'Website v2 - Masaj Cadou', consimtamant_whatsapp: true, pagina: location.href };
    var send = function (u) { return fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(function (r) { return r.ok; }, function () { return false; }); };
    Promise.all([send('https://services.leadconnectorhq.com/hooks/vusqnbSprML4DKUMJ9QB/webhook-trigger/a5d2d666-96b0-47b9-87ab-f685ecf28e68'), send('/api/site-lead')]).then(function (r) {
      if (r[0] || r[1]) location.href = '/multumesc-cadou' + (/arad/i.test(payload.oras) ? '?oras=arad' : '');
      else { b.disabled = false; b.textContent = 'Vreau consultația și cadoul'; err.textContent = 'Nu am putut trimite. Încearcă din nou.'; }
    });
  });
})();
