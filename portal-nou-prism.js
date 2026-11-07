// Centrul360 portal, aspectul nou: scena de sus din Panou → KPI (doar sub html.ui-nou, doar admin).
// Ca pe Acasă la adminul Summit Lane, doar că în locul aplicațiilor sunt cosmeticienele: toate cele active, mereu, în stânga,
// cu suma de azi lângă nume. Din fiecare pleacă o rază de lumină (mai groasă și mai vie cu cât a adus mai mult; la 0 lei
// subțire, dar vizibilă) care se adună la mijloc în logoul Centrul360; din logo iese o singură rază spre „Încasat azi”, care numără.
// La o încasare nouă: un puls pleacă de la cosmeticiana care a făcut tratamentul, trece prin logo și ajunge la total.
// Canvas 2D cu strălucire (fără biblioteci), merge doar cât e pe ecran; liniște pentru „mai puțină mișcare”.
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
  var ini = function (n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); };
  var HUES = ['#5b8cff', '#2bd4c0', '#ffb547', '#ff7a59', '#ff5c8a', '#a77bff', '#3fd17a', '#ff9466', '#6fc3ff'];
  var hue = function (s) { var h = 0; String(s).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return HUES[h % HUES.length]; };
  var MARK = '<svg viewBox="130 130 550 550" aria-hidden="true" fill="none" stroke="currentColor"><circle class="r" cx="405" cy="405" r="262" stroke-width="3" vector-effect="non-scaling-stroke"/>' +
    '<ellipse class="v" cx="405" cy="405" rx="104" ry="207" stroke-width="3" vector-effect="non-scaling-stroke"/><ellipse class="h" cx="405" cy="405" rx="207" ry="113" stroke-width="3" vector-effect="non-scaling-stroke"/></svg>';

  // ------------------------------------------------------------------ every active cosmetician, with what she brought today
  function model() {
    var d = D(); if (!d) return null;
    var t = today();
    var emps = ((d.admin && d.admin.employees) || d.activeEmployees || []).filter(function (e) { return e.role === 'cosmetician' && e.active !== false; });
    var inc = (d.incasari || []).filter(function (s) { return s.date === t; });
    var sumOf = function (id) { return inc.filter(function (s) { return (s.performedBy || s.employeeId) === id; }).reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0); };
    var list = emps.map(function (e) { return { id: e.id, name: e.name || '', city: e.location || '', photo: e.photo || '', sum: sumOf(e.id) }; })
      .sort(function (a, b) { return b.sum - a.sum || a.name.localeCompare(b.name); });
    var total = inc.reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0);
    return { list: list, total: total, n: inc.length, inc: inc, ids: inc.map(function (s) { return s.id; }) };
  }

  // ------------------------------------------------------------------ the block
  var box = null, cv = null, ctx = null, shown = 0, seen = null, beams = [], logo = null, out = null, raf = 0, visible = true, flash = 0, comets = [], dpr = 1;
  function mount(root) {
    var m = model(); if (!m) return;
    box = document.createElement('section');
    box.className = 'n-p3';
    box.innerHTML = '<canvas aria-hidden="true"></canvas>' +
      '<ol class="n-p3-people" data-people></ol>' +
      '<div class="n-p3-logo" aria-hidden="true">' + MARK + '</div>' +
      '<div class="n-p3-total"><small>Încasat azi</small><b data-total>0 lei</b><span data-sub></span></div>';
    var kr = root.querySelector('[data-kpi-root]');
    root.insertBefore(box, kr || null);
    cv = box.querySelector('canvas'); ctx = cv.getContext('2d');
    people(m);
    count(m, true);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) go(); }, { threshold: 0.02 }).observe(box);
    addEventListener('resize', function () { layout(); }, { passive: true });
    requestAnimationFrame(function () { layout(); go(); });
  }
  function people(m) {
    var ol = box.querySelector('[data-people]');
    var key = m.list.map(function (x) { return x.id + ':' + x.sum; }).join(',');
    if (ol.dataset.key === key) return;
    ol.dataset.key = key;
    ol.innerHTML = m.list.length ? m.list.map(function (x, i) {
      return '<li data-id="' + esc(x.id) + '" style="--c:' + hue(x.name) + ';--i:' + i + '"' + (x.sum ? '' : ' class="is-zero"') + '>' +
        (x.photo ? '<img alt="" src="' + esc(x.photo) + '">' : '<i>' + esc(ini(x.name)) + '</i>') +
        '<span><b>' + esc(x.name) + '</b><small>' + esc(x.city) + '</small></span><em>' + esc(lei(x.sum)) + '</em><u></u></li>';
    }).join('') : '<li class="is-zero"><span><b>Nicio cosmeticiană activă</b></span></li>';
    layout();
  }
  function count(m, firstTime) {
    var el = box.querySelector('[data-total]');
    var from = firstTime ? 0 : shown; shown = m.total;
    var t0 = performance.now(), ms = firstTime ? 2200 : 1400;
    (function step(t) {
      var p = Math.min(1, (t - t0) / ms), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = lei(Math.round(from + (m.total - from) * e));
      if (p < 1 && !calm()) requestAnimationFrame(step); else el.textContent = lei(m.total);
    })(t0);
    var who = m.list.filter(function (x) { return x.sum; }).length;
    box.querySelector('[data-sub]').textContent = m.n + (m.n === 1 ? ' încasare' : ' încasări') + ' · ' + who + ' din ' + m.list.length + ' cosmeticiene';
  }
  // where the light starts (the dot after each name), meets (the logo) and ends (the total)
  function layout() {
    if (!box || !cv) return;
    var r = box.getBoundingClientRect(); dpr = Math.min(window.innerWidth < 640 ? 1.5 : 2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    var m = model() || { list: [] }, max = Math.max.apply(null, m.list.map(function (x) { return x.sum; }).concat([1]));
    var L = box.querySelector('.n-p3-logo').getBoundingClientRect(), T = box.querySelector('[data-total]').getBoundingClientRect();
    logo = { x: L.left - r.left + L.width / 2, y: L.top - r.top + L.height / 2, r: L.width / 2 };
    var phone = r.width < 640;
    out = phone ? { x: T.left - r.left + T.width / 2, y: T.top - r.top - 8 } : { x: T.left - r.left - 14, y: T.top - r.top + T.height / 2 };
    beams = Array.prototype.map.call(box.querySelectorAll('[data-people] li[data-id]'), function (li, i) {
      var u = li.querySelector('u').getBoundingClientRect();
      var x = m.list.find(function (p) { return p.id === li.dataset.id; }) || { sum: 0, name: '' };
      var old = beams.find(function (b) { return b.id === li.dataset.id; });
      return { id: li.dataset.id, x0: u.left - r.left + u.width / 2, y0: u.top - r.top + u.height / 2, col: hue(x.name), w: x.sum ? 1.2 + 3.4 * (x.sum / max) : 0.6, k: x.sum ? 0.45 + 0.55 * (x.sum / max) : 0.18,
        parts: old ? old.parts : [], rate: x.sum ? 0.05 + 0.25 * (x.sum / max) : 0.012, li: li };
    });
  }
  // a point on her curve, t in 0..1 (from her to the logo)
  function pt(b, t) {
    var phone = box.clientWidth < 640;
    var cx = phone ? b.x0 : (b.x0 + logo.x) / 2, cy = phone ? (b.y0 + logo.y) / 2 : b.y0;
    var c2x = phone ? logo.x : (b.x0 + logo.x) / 2, c2y = phone ? (b.y0 + logo.y) / 2 : logo.y;
    var u = 1 - t;
    return { x: u * u * u * b.x0 + 3 * u * u * t * cx + 3 * u * t * t * c2x + t * t * t * logo.x, y: u * u * u * b.y0 + 3 * u * u * t * cy + 3 * u * t * t * c2y + t * t * t * logo.y };
  }
  function strokeBeam(b, alpha, width, col) {
    ctx.beginPath();
    for (var i = 0; i <= 40; i++) { var p = pt(b, i / 40); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }
    ctx.globalAlpha = alpha; ctx.lineWidth = width; ctx.strokeStyle = col; ctx.stroke();
  }
  function frame(now) {
    raf = 0;
    if (!box || !box.isConnected || !visible || document.hidden) return;
    var W = cv.width / dpr, H = cv.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    var t = now / 1000;
    beams.forEach(function (b, i) {
      var breathe = 0.85 + 0.15 * Math.sin(t * 1.6 + i);
      var g = ctx.createLinearGradient(b.x0, b.y0, logo.x, logo.y); g.addColorStop(0, b.col); g.addColorStop(1, '#ffffff');
      // the glow: wide and faint, then narrower and brighter, then the core
      strokeBeam(b, 0.05 * b.k * breathe, b.w * 9, b.col);
      strokeBeam(b, 0.14 * b.k * breathe, b.w * 4, b.col);
      strokeBeam(b, 0.85 * b.k * breathe, b.w, g);
      // light running along it
      if (Math.random() < b.rate * 6) b.parts.push({ t: 0, v: 0.005 + Math.random() * 0.006 + b.rate * 0.02, s: 0.8 + Math.random() * 1.6 });
      b.parts = b.parts.filter(function (p) { return p.t < 1; });
      b.parts.forEach(function (p) {
        p.t += p.v; var q = pt(b, p.t);
        var rg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, p.s * 5);
        rg.addColorStop(0, 'rgba(255,255,255,' + (0.9 * b.k + 0.1) + ')'); rg.addColorStop(0.4, b.col); rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = Math.sin(p.t * Math.PI); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(q.x, q.y, p.s * 5, 0, 6.283); ctx.fill();
      });
    });
    // the light out of the logo, into the total
    var br = 0.75 + 0.2 * Math.sin(t * 2.1) + flash;
    var o = ctx.createLinearGradient(logo.x, logo.y, out.x, out.y);
    o.addColorStop(0, 'rgba(255,255,255,.95)'); o.addColorStop(0.5, getComputedStyle(html).getPropertyValue('--accent').trim() || '#8c78ff'); o.addColorStop(1, 'rgba(255,255,255,0)');
    [[16, 0.07], [7, 0.2], [2.4, 0.95]].forEach(function (z) { ctx.globalAlpha = z[1] * br; ctx.lineWidth = z[0] * (1 + flash); ctx.strokeStyle = o; ctx.beginPath(); ctx.moveTo(logo.x, logo.y); ctx.lineTo(out.x, out.y); ctx.stroke(); });
    // the logo's own glow
    var lg = ctx.createRadialGradient(logo.x, logo.y, 0, logo.x, logo.y, logo.r * (2.4 + flash * 2));
    lg.addColorStop(0, 'rgba(255,255,255,' + (0.55 + flash * 0.4) + ')'); lg.addColorStop(0.35, 'rgba(160,140,255,.25)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(logo.x, logo.y, logo.r * (2.4 + flash * 2), 0, 6.283); ctx.fill();
    // a payment's comet: from her, through the logo, to the total
    comets = comets.filter(function (c) { return c.t < 2; });
    comets.forEach(function (c) {
      c.t += 0.018;
      var q = c.t < 1 ? pt(c.b, c.t) : { x: logo.x + (out.x - logo.x) * (c.t - 1), y: logo.y + (out.y - logo.y) * (c.t - 1) };
      if (c.t >= 1 && !c.hit) { c.hit = 1; flash = 1; }
      if (c.t >= 1.95 && !c.done) { c.done = 1; var m = model(); if (m) count(m, false); box.classList.remove('n-p3-ding'); void box.offsetWidth; box.classList.add('n-p3-ding'); }
      var rg = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 26);
      rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, c.b.col); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(q.x, q.y, 26, 0, 6.283); ctx.fill();
    });
    flash *= 0.95;
    ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(frame);
  }
  function go() { if (calm()) { drawCalm(); return; } if (!raf && box) raf = requestAnimationFrame(frame); }
  function drawCalm() {
    if (!ctx || !logo) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    beams.forEach(function (b) { strokeBeam(b, 0.6 * b.k + 0.2, b.w, b.col); });
    ctx.globalAlpha = 0.9; ctx.lineWidth = 2.4; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(logo.x, logo.y); ctx.lineTo(out.x, out.y); ctx.stroke();
  }

  // ------------------------------------------------------------------ data: a new payment sends its comet
  function onData() {
    var m = model(); if (!m) return;
    if (seen === null) { seen = new Set(m.ids); return; }
    var fresh = m.inc.filter(function (s) { return !seen.has(s.id); });
    m.ids.forEach(function (x) { seen.add(x); });
    if (!box || !box.isConnected) return;
    people(m);
    if (!fresh.length) return;
    fresh.forEach(function (s, i) {
      setTimeout(function () {
        var id = s.performedBy || s.employeeId;
        var b = beams.find(function (x) { return x.id === id; }) || beams[0];
        if (!b) { count(m, false); return; }
        if (b.li) { b.li.classList.remove('n-p3-hit'); void b.li.offsetWidth; b.li.classList.add('n-p3-hit'); }
        if (calm()) { count(m, false); return; }
        comets.push({ b: b, t: 0 }); go();
      }, i * 700);
    });
  }

  // ------------------------------------------------------------------ wiring: when the Panou shows KPI
  function place() {
    var d = D(); if (!d || !d.isAdmin) return;
    var root = document.querySelector('#panel-panou .db-root');
    var kr = root && root.querySelector('[data-kpi-root]');
    if (!kr) return;
    if (box && box.isConnected) return;
    mount(root);
  }
  function start() {
    var k = K(); if (!k) return;
    var panel = document.getElementById('panel-panou');
    if (panel) new MutationObserver(function () { place(); }).observe(panel, { childList: true, subtree: true });
    if (k.on) k.on('data', function () { setTimeout(function () { place(); onData(); }, 120); });
    var t = setInterval(function () { if (D()) { clearInterval(t); place(); onData(); } }, 300);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) go(); });
    window.C360Prism = { pay: function (s) { var m = model(); if (!m) return; var b = beams.find(function (x) { return x.id === (s.performedBy || s.employeeId); }) || beams[0]; if (b) { comets.push({ b: b, t: 0 }); go(); } } };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
