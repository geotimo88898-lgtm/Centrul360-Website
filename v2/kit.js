/* Centrul360 v2: the live parts of every page.
   - [data-offers="cat|all"]: the active offers of Admin → Oferte (/api/offers-public), as offer slips.
   - [data-slot]: the next real free hour of a clinic (/api/booking, the portal's Calendar), e.g. "miercuri 11 nov, 10:30".
   - .rv: comes in on scroll; anything already passed shows at once and nothing stays hidden.
   - #lead: the gift form (the same as the old home page: HighLevel + /api/site-lead, then /multumesc-cadou).
   Booking buttons are plain [data-book] buttons: /c360-book.js opens the booking on top of the page. */
(function () {
  'use strict';
  var CAT = { epilare: 'Epilare laser', faciale: 'Față', remodelare: 'Corp' };
  var CITY = { timisoara: 'Timișoara', arad: 'Arad' };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var lei = function (n) { return Math.round(n).toLocaleString('ro-RO') + ' lei'; };

  // ---- offers
  function slip(o) {
    var cities = (o.locations || []).map(function (c) { return CITY[c] || c; });
    var one = cities.length === 1 ? cities[0] : '';
    var cut = o.priceOld > o.priceNew;
    var pct = cut ? Math.round((1 - o.priceNew / o.priceOld) * 100) : 0;
    return '<div class="slip rv">' + (pct ? '<span class="pct">-' + pct + '%</span>' : '') +
      '<span class="k">Oferta din fișă · ' + esc(CAT[o.category] || 'Tratament') + '</span><h3>' + esc(o.title) + '</h3>' +
      '<div class="pr"><b>' + lei(o.priceNew) + '</b>' + (cut ? '<s>' + lei(o.priceOld) + '</s>' : '') + '</div>' +
      (cut ? '<span class="save">Economisești ' + lei(o.priceOld - o.priceNew) + '</span>' : '') +
      '<span class="where">' + esc(cities.length ? cities.join(' și ') : 'Timișoara și Arad') + '</span>' +
      '<button type="button" class="btn book" data-book data-book-service="' + esc(o.key) + '"' + (one ? ' data-book-city="' + esc(one) + '"' : '') + '>Rezervă oferta</button></div>';
  }
  var boxes = document.querySelectorAll('[data-offers]');
  if (boxes.length) {
    fetch('/api/offers-public').then(function (r) { return r.json(); }).then(function (d) {
      var list = (d.offers || d || []).filter(function (o) { return o && o.title; });
      boxes.forEach(function (box) {
        var cat = box.getAttribute('data-offers');
        var mine = cat === 'all' ? list : list.filter(function (o) { return cat.split(',').indexOf(o.category) >= 0; });
        box.innerHTML = mine.length ? mine.map(slip).join('') : '<p class="fine">Acum nu e nicio ofertă activă aici. La consultația gratuită îți spunem prețul exact.</p>';
      });
      reveal();
    }).catch(function () { boxes.forEach(function (b) { b.innerHTML = '<p class="fine">Ofertele se încarcă. <a href="/oferte.html">Vezi ofertele</a></p>'; }); });
  }

  // ---- the next real free hour (a consultation, per clinic), from the Calendar
  var DAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  var MON = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
  function nice(date) {
    var d = new Date(date + 'T12:00:00Z'), today = new Date(), t = today.toISOString().slice(0, 10);
    var tm = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    if (date === t) return 'azi';
    if (date === tm) return 'mâine';
    return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MON[d.getUTCMonth()];
  }
  var slotEls = document.querySelectorAll('[data-slot]');
  if (slotEls.length) {
    var cities = ['Timișoara', 'Arad'], found = {};
    Promise.all(cities.map(function (c) {
      return fetch('/api/booking?city=' + encodeURIComponent(c) + '&service=consult').then(function (r) { return r.json(); }).then(function (d) {
        var day = (d.days || []).find(function (x) { return x.slots && x.slots.length; });
        if (day) found[c] = { when: nice(day.date), time: day.slots[0], left: day.slots.length };
      }, function () {});
    })).then(function () {
      slotEls.forEach(function (el) {
        var want = el.getAttribute('data-slot');
        var pick = want && found[want] ? want : (found['Timișoara'] ? 'Timișoara' : found.Arad ? 'Arad' : '');
        if (!pick) { el.hidden = true; return; }
        var f = found[pick], mode = el.getAttribute('data-slot-mode');
        el.innerHTML = mode === 'bar'
          ? '<span class="dot"></span><span class="long">Consultație gratuită + masaj facial cadou · </span>Prima oră liberă<span class="long"> la ' + esc(pick) + '</span>: <b>' + esc(f.when) + ', ' + esc(f.time) + '</b>'
          : 'Prima oră liberă la ' + esc(pick) + ': <b>' + esc(f.when) + ', ' + esc(f.time) + '</b>';
      });
    });
  }

  // ---- motion
  function reveal() {
    var h = window.innerHeight;
    document.querySelectorAll('.rv:not(.in)').forEach(function (el, i) {
      if (el.getBoundingClientRect().top < h * 0.92) { el.style.transitionDelay = Math.min(i, 4) * 60 + 'ms'; el.classList.add('in'); }
    });
  }
  window.addEventListener('scroll', reveal, { passive: true });
  window.addEventListener('resize', reveal);
  setTimeout(function () { document.querySelectorAll('.rv').forEach(function (el) { el.classList.add('in'); }); }, 4000);
  reveal();

  // ---- the gift form
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
