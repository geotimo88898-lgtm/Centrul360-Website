// Centrul360 portal, aspectul nou: „Clinica live” pe Panou (doar sub html.ui-nou).
// Ziua de azi, desenată ca o clinică văzută de sus, câte un etaj pentru fiecare oraș: intrarea, recepția, câte un
// cabinet pentru fiecare cosmeticiană care lucrează azi și casa (Încasări). Totul din datele pe care portalul le are deja:
//  - cosmeticiana stă în cabinetul ei cu clienta cât ține programarea (inelul arată cât a trecut din ea);
//  - clientele care vin în următoarea oră așteaptă la recepție;
//  - la o încasare nouă, cosmeticiana care a făcut tratamentul merge la casă, banii zboară în casă, suma crește, apoi se întoarce.
// Doar desen: nu schimbă nimic din portal. Mișcare doar cu transform / opacity; liniște pentru „mai puțină mișcare”.
(function () {
  'use strict';
  var html = document.documentElement;
  if (!html.classList.contains('ui-nou')) return;
  var calm = function () { return html.classList.contains('c360-reduce') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var K = function () { return window.K; };
  var D = function () { return window.K && window.K.data; };
  var CITIES = ['Timișoara', 'Arad'];
  var HUES = ['#4f8fd6', '#2bb3a3', '#c9a227', '#e0835a', '#e05a7a', '#8b6fd0', '#2f9d62', '#d97757', '#6fa8d6'];
  var hue = function (s) { var h = 0; String(s).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return HUES[h % HUES.length]; };
  var ini = function (n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); };
  var first = function (n) { return String(n || '').trim().split(/\s+/)[0]; };
  var lei = function (n) { return K() && K().lei ? K().lei(n) : Math.round(n) + ' lei'; };
  var today = function () { return K() && K().today ? K().today() : new Date().toISOString().slice(0, 10); };
  var mins = function (t) { var m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
  var nowMin = function () { var d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; };

  var root = null, floors = {}, seen = null, figs = {}, queue = [], busyWalk = false;

  // ------------------------------------------------------------------ what the day looks like, per city
  function model() {
    var d = D(); if (!d) return null;
    var t = today(), now = nowMin();
    var appts = ((d.appointmentsToday && d.appointmentsToday.list) || []).filter(function (a) { return a.date === t || !a.date; });
    var inc = (d.incasari || []).filter(function (s) { return s.date === t; });
    var staff = d.activeEmployees || (d.admin && d.admin.employees) || [];
    var out = {};
    CITIES.forEach(function (c) {
      var A = appts.filter(function (a) { return (a.location || '') === c && a.status !== 'anulata'; });
      var cos = {};
      A.forEach(function (a) { if (a.cosmeticianId) cos[a.cosmeticianId] = cos[a.cosmeticianId] || { id: a.cosmeticianId, name: a.cosmeticianName || '', now: null }; });
      staff.forEach(function (e) { if (e.role === 'cosmetician' && e.location === c && !cos[e.id] && inc.some(function (s) { return s.performedBy === e.id; })) cos[e.id] = { id: e.id, name: e.name, now: null }; });
      A.forEach(function (a) {
        var s = mins(a.time), e = mins(a.endTime) || (s != null ? s + 60 : null);
        if (s != null && s <= now && now < e && a.status !== 'finalizata' && cos[a.cosmeticianId]) cos[a.cosmeticianId].now = { client: a.clientName, p: (now - s) / Math.max(1, e - s), treatment: a.treatment, end: a.endTime };
      });
      var waiting = A.filter(function (a) { var s = mins(a.time); return s != null && s > now && s - now <= 60 && a.status !== 'finalizata'; });
      var front = staff.filter(function (e) { return e.role === 'receptie' && e.location === c; });
      var paid = inc.filter(function (s) { return (s.location || '') === c; });
      out[c] = { cos: Object.keys(cos).map(function (k) { return cos[k]; }), waiting: waiting, front: front, sum: paid.reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0), n: paid.length, done: A.filter(function (a) { return a.status === 'finalizata'; }).length, total: A.length };
    });
    return out;
  }

  // ------------------------------------------------------------------ drawing
  function figHtml(name, cls) {
    return '<span class="n-fig ' + (cls || '') + '" style="--c:' + hue(name) + '"><span class="n-fig-b"><i class="n-fig-h">' + esc(ini(name)) + '</i><i class="n-fig-s"></i></span><em>' + esc(first(name)) + '</em></span>';
  }
  function floorHtml(c, m) {
    return '<div class="n-floor" data-city="' + esc(c) + '">' +
      '<div class="n-fl-head"><b>' + esc(c) + '</b><span data-f-stat></span></div>' +
      '<div class="n-fl-row">' +
        '<div class="n-st is-door"><span class="n-st-ic"><svg viewBox="0 0 24 24"><path d="M14 3h5v18h-5M10 17l5-5-5-5M15 12H3"/></svg></span><small>Intrare</small></div>' +
        '<div class="n-st is-desk"><span class="n-st-ic"><svg viewBox="0 0 24 24"><path d="M3 10h18v4H3zM6 14v6M18 14v6"/></svg></span><small>Recepție</small><div class="n-front" data-front></div><div class="n-wait" data-wait></div></div>' +
        '<div class="n-rooms" data-rooms></div>' +
        '<div class="n-st is-till"><span class="n-st-ic"><svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M7 8V5h10v3M7 13h4"/></svg></span><small>Încasări</small><b class="n-till" data-till>0 lei</b><img class="n-till-nuki" alt="" src="/brand_asset/mascota/ipostaze/cadou.webp"></div>' +
      '</div></div>';
  }
  function mount(panel) {
    if (root && root.isConnected) return;
    var m = model(); if (!m) return;
    root = document.createElement('section');
    root.className = 'n-live';
    root.setAttribute('aria-label', 'Clinica live');
    root.innerHTML = '<div class="n-live-head"><div><span class="n-live-dot"></span><b>Clinica live</b></div><small data-live-sum></small></div>' +
      CITIES.map(function (c) { return floorHtml(c, m[c]); }).join('');
    panel.appendChild(root);
    floors = {};
    root.querySelectorAll('.n-floor').forEach(function (f) { floors[f.dataset.city] = f; });
    figs = {};
    paint(true);
  }
  var tills = {};
  function paint(isFirst) {
    if (!root || !root.isConnected) return;
    var m = model(); if (!m) return;
    var all = { sum: 0, inRoom: 0, waiting: 0 };
    CITIES.forEach(function (c) {
      var f = floors[c], x = m[c]; if (!f) return;
      all.sum += x.sum; all.waiting += x.waiting.length;
      f.hidden = !x.total && !x.n && !x.front.length;
      // the rooms: one per cosmetician working today
      var rooms = f.querySelector('[data-rooms]');
      var key = x.cos.map(function (k) { return k.id; }).join(',');
      if (rooms.dataset.key !== key) {
        rooms.dataset.key = key;
        rooms.innerHTML = x.cos.length ? x.cos.map(function (k) {
          return '<div class="n-room" data-room="' + esc(k.id) + '"><svg class="n-bed" viewBox="0 0 64 24" aria-hidden="true"><rect x="4" y="8" width="56" height="9" rx="4.5"/><rect x="6" y="5" width="13" height="6" rx="3"/><path d="M10 17v5M54 17v5"/></svg><svg class="n-ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/><circle class="n-ring-p" cx="20" cy="20" r="17" pathLength="100"/></svg>' +
            figHtml(k.name, 'is-cos') + '<span class="n-client" data-client></span><small data-room-t></small></div>';
        }).join('') : '<div class="n-room is-empty"><small>Niciun cabinet ocupat azi</small></div>';
        rooms.querySelectorAll('[data-room]').forEach(function (r) { figs[r.dataset.room] = r.querySelector('.n-fig'); });
      }
      x.cos.forEach(function (k) {
        var r = rooms.querySelector('[data-room="' + CSS.escape(k.id) + '"]'); if (!r) return;
        r.classList.toggle('is-busy', !!k.now);
        if (k.now) all.inRoom++;
        r.style.setProperty('--p', k.now ? Math.round(Math.min(1, k.now.p) * 100) : 0);
        var cl = r.querySelector('[data-client]');
        cl.textContent = k.now ? ini(k.now.client) : '';
        cl.title = k.now ? first(k.now.client) + (k.now.treatment ? ' · ' + k.now.treatment : '') : '';
        r.querySelector('[data-room-t]').textContent = k.now ? (k.now.treatment || 'în tratament') + (k.now.end ? ' · până la ' + k.now.end : '') : 'liberă';
      });
      // reception: who is at the desk, who waits
      var fr = f.querySelector('[data-front]');
      var fk = x.front.map(function (e) { return e.id; }).join(',');
      if (fr.dataset.key !== fk) { fr.dataset.key = fk; fr.innerHTML = x.front.map(function (e) { return figHtml(e.name, 'is-front'); }).join(''); }
      var w = f.querySelector('[data-wait]');
      var wk = x.waiting.map(function (a) { return a.id; }).join(',');
      if (w.dataset.key !== wk) {
        w.dataset.key = wk;
        w.innerHTML = x.waiting.slice(0, 5).map(function (a, i) { return '<i class="n-guest" style="--i:' + i + '" title="' + esc(first(a.clientName) + ' · ' + (a.time || '')) + '">' + esc(ini(a.clientName)) + '</i>'; }).join('') + (x.waiting.length > 5 ? '<i class="n-guest is-more">+' + (x.waiting.length - 5) + '</i>' : '');
      }
      f.querySelector('[data-f-stat]').textContent = x.done + ' din ' + x.total + ' programări gata · ' + x.n + (x.n === 1 ? ' încasare' : ' încasări');
      // the till: counts up from 0 the first time, then follows
      var till = f.querySelector('[data-till]');
      if (isFirst) { tills[c] = 0; countTo(till, c, x.sum, 1400); } else if (!busyWalk && tills[c] !== x.sum && !queue.length) countTo(till, c, x.sum, 700);
    });
    var s = root.querySelector('[data-live-sum]');
    s.textContent = all.inRoom + ' în cabinet acum · ' + all.waiting + ' vin în următoarea oră · ' + lei(all.sum) + ' încasat azi';
  }
  function countTo(el, c, to, ms) {
    var from = tills[c] || 0; tills[c] = to;
    if (calm() || from === to) { el.textContent = lei(to); return; }
    var t0 = performance.now();
    (function step(t) {
      var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      el.textContent = lei(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
      else { el.classList.remove('n-bump'); void el.offsetWidth; el.classList.add('n-bump'); }
    })(t0);
  }

  // ------------------------------------------------------------------ a payment: she walks to the till, the money flies in
  function walkPay(s) {
    var c = s.location || CITIES[0], f = floors[c];
    if (!f || f.hidden) return Promise.resolve();
    var till = f.querySelector('.is-till .n-st-ic');
    var fig = figs[s.performedBy] || figs[s.employeeId];
    var from = fig && fig.isConnected ? fig : f.querySelector('.is-desk .n-st-ic');
    var a = from.getBoundingClientRect(), b = till.getBoundingClientRect();
    var dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top - a.top;
    return new Promise(function (done) {
      if (calm()) { done(); return; }
      var walker = fig && fig.isConnected ? fig : null;
      var go = function () {
        // the money: a coin with the sum, in an arc to the till
        var coin = document.createElement('span');
        coin.className = 'n-coin';
        coin.textContent = '+' + lei(Number(s.amount) || 0);
        f.appendChild(coin);
        var fr = f.getBoundingClientRect(), st = (walker || from).getBoundingClientRect();
        var x0 = st.left - fr.left + st.width / 2, y0 = st.top - fr.top;
        var x1 = b.left - fr.left + b.width / 2, y1 = b.top - fr.top;
        coin.animate([
          { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(.6)', opacity: 0 },
          { transform: 'translate(' + (x0 + (x1 - x0) * .5) + 'px,' + (Math.min(y0, y1) - 46) + 'px) scale(1.15)', opacity: 1, offset: .45 },
          { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(.7)', opacity: 0 }
        ], { duration: 1100, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'forwards' }).onfinish = function () {
          coin.remove();
          till.parentNode.classList.remove('n-ding'); void till.offsetWidth; till.parentNode.classList.add('n-ding');
          var nk = till.parentNode.querySelector('.n-till-nuki');
          if (nk) { nk.src = '/brand_asset/mascota/ipostaze/bucurie.webp'; clearTimeout(nk._t); nk._t = setTimeout(function () { nk.src = '/brand_asset/mascota/ipostaze/cadou.webp'; }, 2600); }
          var x = (model() || {})[c] || { sum: 0 };
          countTo(f.querySelector('[data-till]'), c, x.sum, 650);
          if (window.C360Fx) { var r = till.getBoundingClientRect(); window.C360Fx.confetti(r.left + r.width / 2, r.top, 22); }
        };
      };
      if (!walker) { go(); setTimeout(done, 1300); return; }
      walker.classList.add('is-walking');
      walker.style.transform = 'translate(' + Math.round(dx - 30) + 'px,' + Math.round(dy) + 'px)';
      setTimeout(function () {
        go();
        setTimeout(function () {
          walker.style.transform = '';
          setTimeout(function () { walker.classList.remove('is-walking'); done(); }, 1500);
        }, 900);
      }, 1500);
    });
  }
  function drain() {
    if (busyWalk || !queue.length) return;
    busyWalk = true;
    walkPay(queue.shift()).then(function () { busyWalk = false; drain(); });
  }
  function onData() {
    var d = D(); if (!d) return;
    var inc = (d.incasari || []).filter(function (s) { return s.date === today(); });
    if (seen === null) { seen = new Set(inc.map(function (s) { return s.id; })); return; }
    inc.forEach(function (s) { if (!seen.has(s.id)) { seen.add(s.id); queue.push(s); } });
    paint(false);
    drain();
  }

  // ------------------------------------------------------------------ ambient: a free cosmetician stretches, the receptionist waves
  setInterval(function () {
    if (!root || !root.isConnected || document.hidden || calm()) return;
    var free = Array.prototype.slice.call(root.querySelectorAll('.n-room:not(.is-busy) .n-fig, .n-front .n-fig'));
    if (!free.length) return;
    var f = free[Math.floor(Math.random() * free.length)];
    f.classList.remove('n-idle'); void f.offsetWidth; f.classList.add('n-idle');
  }, 3500);
  setInterval(function () { if (root && root.isConnected && !document.hidden) paint(false); }, 30e3);

  // ------------------------------------------------------------------ wiring: on the Panou, under the hero (only on „Azi”)
  function place() {
    var panel = document.getElementById('panel-panou');
    var dbr = panel && panel.querySelector('.db-root');
    var on = !!(dbr && dbr.querySelector('.db-hero'));
    if (!on) { if (root) root.hidden = true; return; }
    panel.classList.add('n-live-host');
    if (!root || !root.isConnected) mount(panel);
    if (root) root.hidden = false;
  }
  function start() {
    var k = K(); if (!k) return;
    if (k.on) k.on('data', function () { setTimeout(function () { place(); onData(); }, 80); });
    var panel = document.getElementById('panel-panou');
    if (panel) new MutationObserver(function () { place(); }).observe(panel, { childList: true, subtree: false });
    var t = setInterval(function () { if (D()) { place(); onData(); clearInterval(t); } }, 300);
    window.C360Live = { pay: function (s) { queue.push(s); drain(); } };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
