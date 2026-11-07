// Centrul360 portal, aspectul nou: „Banii de azi” pe Panou și contorul live de lângă „Site” (doar sub html.ui-nou).
// Ca la Summit Lane: cele două clinici (Timișoara, Arad) trimit lumină într-o prismă de sticlă; din ea iese totalul încasat azi,
// care numără în sus de la ultima lui valoare (1 - 2^(-10p)). Sub el: față de ieri la aceeași oră, card / cash / transfer și ultima
// încasare. Desenul (canvas 2D, fără biblioteci) merge doar cât se vede pe ecran; liniște pentru „mai puțină mișcare”.
(function () {
  'use strict';
  var html = document.documentElement;
  if (!html.classList.contains('ui-nou')) return;
  var calm = function () { return html.classList.contains('c360-reduce') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var K = function () { return window.K; };
  var D = function () { return window.K && window.K.data; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var lei = function (n) { return K() && K().lei ? K().lei(n) : Math.round(n) + ' lei'; };
  var today = function () { return K() && K().today ? K().today() : new Date().toISOString().slice(0, 10); };
  // the cities are the ones the team works in (from the data, not written here)
  var CITIES = [];
  function syncCities(d) {
    var seen = {}, l = [];
    (((d.admin && d.admin.employees) || d.activeEmployees || [])).forEach(function (e) { var c = String(e.location || '').trim(); if (e.active === false || !c || c === '-' || seen[c]) return; seen[c] = 1; l.push(c); });
    (d.incasari || []).forEach(function (s) { var c = String(s.location || '').trim(); if (c && !seen[c]) { seen[c] = 1; l.push(c); } });
    if (l.length) CITIES = l;
  }

  // ------------------------------------------------------------------ the day's money
  function model() {
    var d = D(); if (!d) return null;
    syncCities(d);
    var t = today();
    var y = K().addDays ? K().addDays(t, -1) : '';
    var inc = d.incasari || [];
    var now = new Date(), hm = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    var day = inc.filter(function (s) { return s.date === t; });
    // yesterday until this same hour (the payment's time, or when it was saved); without times, no comparison is shown
    var tm = function (s) { if (s.time) return s.time; if (!s.createdAt) return ''; var dd = new Date(s.createdAt); return isNaN(dd) ? '' : ('0' + dd.getHours()).slice(-2) + ':' + ('0' + dd.getMinutes()).slice(-2); };
    var yAll = inc.filter(function (s) { return s.date === y; });
    var timed = yAll.length && yAll.every(function (s) { return tm(s); });
    var yday = timed ? yAll.filter(function (s) { return tm(s) <= hm; }) : null;
    var sum = function (a) { return a.reduce(function (x, s) { return x + (Number(s.amount) || 0); }, 0); };
    var by = {};
    CITIES.forEach(function (c) { by[c] = sum(day.filter(function (s) { return (s.location || '') === c; })); });
    var meth = { card: 0, cash: 0, transfer: 0 };
    day.forEach(function (s) { var m = String(s.method || '').toLowerCase(); var k = /card|pos/.test(m) ? 'card' : /cash|numerar/.test(m) ? 'cash' : /transfer|bank|op/.test(m) ? 'transfer' : ''; if (k) meth[k] += Number(s.amount) || 0; });
    var last = day.slice().sort(function (a, b) { return String(a.createdAt || a.time || '') < String(b.createdAt || b.time || '') ? 1 : -1; })[0];
    return { total: sum(day), n: day.length, yday: yday ? sum(yday) : null, by: by, meth: meth, last: last };
  }

  // ------------------------------------------------------------------ the block
  var root = null, cv = null, ctx = null, raf = 0, visible = false, shown = 0, parts = [], lastT = 0, srcs = [], prism = null, out = null;
  function mount(panel) {
    if (root && root.isConnected) return;
    if (D()) syncCities(D());
    root = document.createElement('section');
    root.className = 'n-money';
    root.setAttribute('aria-label', 'Încasat azi');
    root.innerHTML =
      '<canvas aria-hidden="true"></canvas>' +
      '<div class="n-m-src">' + CITIES.map(function (c, i) { return '<div class="n-m-city" data-city="' + esc(c) + '" style="--i:' + i + '"><i></i><b>' + esc(c) + '</b><span data-csum>0 lei</span></div>'; }).join('') + '</div>' +
      '<svg class="n-m-prism" viewBox="0 0 120 120" aria-hidden="true"><defs>' +
        '<linearGradient id="nmg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="var(--n-teal3)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity=".55"/></linearGradient>' +
        '<linearGradient id="nmg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>' +
        '<g class="n-m-p"><path d="M60 8 L112 104 L8 104 Z" fill="url(#nmg1)" stroke="rgba(255,255,255,.9)" stroke-width="1.5"/><path d="M60 8 L60 104" stroke="rgba(255,255,255,.55)" stroke-width="1"/><path d="M60 8 L34 104" stroke="rgba(255,255,255,.35)" stroke-width=".8"/><path d="M60 14 L20 98" stroke="url(#nmg2)" stroke-width="3" stroke-linecap="round" opacity=".7"/></g></svg>' +
      '<div class="n-m-out"><small>Încasat azi</small><b data-total>0 lei</b><div class="n-m-meta"><span data-delta></span><span data-count></span></div>' +
        '<div class="n-m-break" data-break></div><div class="n-m-last" data-last></div></div>';
    panel.appendChild(root);
    cv = root.querySelector('canvas'); ctx = cv.getContext('2d');
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) loop(); }, { threshold: 0.05 }).observe(root);
    else visible = true;
    addEventListener('resize', layout, { passive: true });
    layout(); paint(true); loop();
  }
  function layout() {
    if (!root || !cv) return;
    var r = root.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var at = function (el) { var b = el.getBoundingClientRect(); return { x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height }; };
    srcs = Array.prototype.map.call(root.querySelectorAll('.n-m-city i'), function (el) { var b = at(el); return { x: b.x + b.w / 2, y: b.y + b.h / 2, city: el.parentNode.dataset.city }; });
    var p = at(root.querySelector('.n-m-prism'));
    prism = { x: p.x + p.w * 0.42, y: p.y + p.h * 0.62, rx: p.x + p.w * 0.66, ry: p.y + p.h * 0.6 };
    var o = at(root.querySelector('[data-total]'));
    out = { x: o.x - 6, y: o.y + o.h / 2 };
  }
  function paint(first) {
    if (!root || !root.isConnected) return;
    var m = model(); if (!m) return;
    CITIES.forEach(function (c) { var el = root.querySelector('[data-city="' + c + '"] [data-csum]'); if (el) el.textContent = lei(m.by[c] || 0); });
    countTo(root.querySelector('[data-total]'), m.total);
    var dl = root.querySelector('[data-delta]');
    var diff = m.yday == null ? 0 : m.total - m.yday, pc = m.yday ? Math.round(diff / m.yday * 100) : null;
    dl.className = diff >= 0 ? 'is-up' : 'is-down';
    dl.textContent = m.yday != null && (m.yday || m.total) ? (diff >= 0 ? '↑ ' : '↓ ') + lei(Math.abs(diff)) + (pc != null ? ' (' + (diff >= 0 ? '+' : '') + pc + '%)' : '') + ' față de ieri, la ora asta' : '';
    root.querySelector('[data-count]').textContent = m.n + (m.n === 1 ? ' încasare' : ' încasări');
    var mt = m.meth, tot = mt.card + mt.cash + mt.transfer;
    root.querySelector('[data-break]').innerHTML = tot ? [['card', 'Card'], ['cash', 'Cash'], ['transfer', 'Transfer']].map(function (x) {
      return '<span><i class="is-' + x[0] + '" style="--w:' + Math.round(mt[x[0]] / tot * 100) + '%"></i><em>' + x[1] + '</em><b>' + esc(lei(mt[x[0]])) + '</b></span>';
    }).join('') : '';
    var l = m.last;
    root.querySelector('[data-last]').innerHTML = l ? 'Ultima: <b>+' + esc(lei(Number(l.amount) || 0)) + '</b> · ' + esc(l.treatment || '') + (l.location ? ' · ' + esc(l.location) : '') : '';
    if (!first) burst(m);
  }
  // the total counts from its last value, fast then gently (1 - 2^(-10p))
  function countTo(el, to) {
    var from = shown; shown = to;
    if (calm() || from === to) { el.textContent = lei(to); return; }
    var t0 = performance.now(), ms = 1600;
    (function step(t) {
      var p = Math.min(1, (t - t0) / ms), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = lei(Math.round(from + (to - from) * e));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  // a new payment: a thicker stream from its city for a moment
  var boost = {};
  function burst(m) { CITIES.forEach(function (c) { boost[c] = (boost[c] || 0) + 40; }); }

  // ------------------------------------------------------------------ the light
  function col(a) { var cs = getComputedStyle(html); return [cs.getPropertyValue('--accent').trim() || '#14a596', cs.getPropertyValue('--n-teal3').trim() || cs.getPropertyValue('--accent-2').trim() || '#5fd4c6', '#ffd56b'][a]; }
  function spawn(s) {
    var m = model(); var w = m && m.total ? (m.by[s.city] || 0) / m.total : 0.5;
    var rate = 0.22 + w * 0.9 + (boost[s.city] ? 1.2 : 0);
    if (Math.random() < rate) parts.push({ s: s, t: 0, v: 0.008 + Math.random() * 0.008, o: (Math.random() - 0.5) * 22, c: col(Math.random() < 0.6 ? 0 : 1), r: 1.6 + Math.random() * 2.4 });
    if (boost[s.city]) boost[s.city]--;
  }
  function loop() {
    if (raf || calm()) { if (calm()) drawStatic(); return; }
    raf = requestAnimationFrame(frame);
  }
  function frame(t) {
    raf = 0;
    if (!root || !root.isConnected || !visible || document.hidden) return;
    if (!srcs.length) layout();
    var W = cv.width / Math.min(2, window.devicePixelRatio || 1), H = cv.height / Math.min(2, window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, W, H);
    srcs.forEach(spawn);
    ctx.globalCompositeOperation = 'lighter';
    parts = parts.filter(function (p) { return p.t < 1; });
    parts.forEach(function (p) {
      p.t += p.v;
      var s = p.s, cx = (s.x + prism.x) / 2, cy = Math.min(s.y, prism.y) - 30 + p.o;
      var u = 1 - p.t, x = u * u * s.x + 2 * u * p.t * cx + p.t * p.t * prism.x, y = u * u * s.y + 2 * u * p.t * cy + p.t * p.t * prism.y;
      ctx.globalAlpha = Math.sin(p.t * Math.PI);
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(x, y, p.r, 0, 6.283); ctx.fill();
    });
    // out of the prism: one beam, breathing, into the total
    var br = 0.55 + 0.25 * Math.sin(t / 600);
    var g = ctx.createLinearGradient(prism.rx, prism.ry, out.x, out.y);
    g.addColorStop(0, 'rgba(255,255,255,' + (0.9 * br) + ')'); g.addColorStop(0.3, col(1)); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.85; ctx.strokeStyle = g; ctx.lineCap = 'round';
    for (var k = 0; k < 3; k++) { ctx.lineWidth = [10, 4, 1.5][k] * br; ctx.globalAlpha = [0.12, 0.35, 0.9][k]; ctx.beginPath(); ctx.moveTo(prism.rx, prism.ry); ctx.lineTo(out.x, out.y); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(frame);
  }
  function drawStatic() {
    if (!ctx || !prism) return;
    var W = cv.width, H = cv.height; ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = col(1); ctx.globalAlpha = 0.6; ctx.lineWidth = 3;
    srcs.forEach(function (s) { ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo((s.x + prism.x) / 2, Math.min(s.y, prism.y) - 30, prism.x, prism.y); ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(prism.rx, prism.ry); ctx.lineTo(out.x, out.y); ctx.stroke(); ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ the live count next to „Site” in the menu (admin)
  var liveT = 0;
  function liveCount() {
    clearTimeout(liveT);
    liveT = setTimeout(liveCount, 15000);
    var d = D(); if (!d || !d.isAdmin || document.hidden) return;
    K().api('/api/site-pulse?view=stats').then(function (s) {
      var b = document.querySelector('#tabsNav button[data-tab="site"]'); if (!b) return;
      var n = (s.live || []).length;
      var el = b.querySelector('.n-navlive');
      if (!el) { el = document.createElement('span'); el.className = 'n-navlive'; b.appendChild(el); }
      el.hidden = !n;
      if (el.textContent !== String(n)) { el.innerHTML = '<i></i>' + n; el.classList.remove('n-bump'); void el.offsetWidth; el.classList.add('n-bump'); }
    }, function () {});
  }

  // ------------------------------------------------------------------ wiring (the same host as Clinica live: under the hero)
  function place() {
    var panel = document.getElementById('panel-panou');
    var dbr = panel && panel.querySelector('.db-root');
    var on = !!(dbr && dbr.querySelector('.db-hero')) && !!(D() && (D().isAdmin || (D().me && D().me.role === 'receptie')));
    if (!on) { if (root) root.hidden = true; return; }
    panel.classList.add('n-live-host');
    if (!root || !root.isConnected) mount(panel);
    root.hidden = false;
  }
  function start() {
    var k = K(); if (!k) return;
    if (k.on) k.on('data', function () { setTimeout(function () { place(); paint(false); }, 90); });
    var panel = document.getElementById('panel-panou');
    if (panel) new MutationObserver(place).observe(panel, { childList: true });
    var t = setInterval(function () { if (D()) { clearInterval(t); place(); liveCount(); } }, 300);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { loop(); liveCount(); } });
    if (k.on) k.on('section', function (id) { if (id === 'panou') { setTimeout(function () { layout(); loop(); }, 400); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
