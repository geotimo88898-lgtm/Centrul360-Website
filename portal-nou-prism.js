// Centrul360 portal, aspectul nou: scena cosmeticienelor din Panou → Azi, sub salut (doar admin). Prismatică, ca prisma Summitlane:
// fiecare rază e o dungă de spectru care se unește în logoul Centrul360 (prisma), din care iese raza albă spre „Încasat azi”.
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
    root.appendChild(box);
    cv = box.querySelector('canvas'); ctx = cv.getContext('2d');
    people(m);
    count(m, true);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) go(); }, { threshold: 0.02 }).observe(box);
    addEventListener('resize', function () { layout(); }, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(function () { layout(); go(); }).observe(box);
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
  // where the light starts (the dot after each name), meets (the logo, a prism) and ends (the total). The geometry of every
  // band is built once here as Path2D, so a frame only strokes it (smooth on phones).
  var SPEC = ['#ff4f6d', '#ff9f43', '#ffe45c', '#5cf2a0', '#48d6ff', '#5b8cff'];
  var spr = null, sprC = null, fan = [];
  function sprite(r, stops) { var c = document.createElement('canvas'); c.width = c.height = r * 2; var g = c.getContext('2d'); var rg = g.createRadialGradient(r, r, 0, r, r, r); stops.forEach(function (s) { rg.addColorStop(s[0], s[1]); }); g.fillStyle = rg; g.fillRect(0, 0, r * 2, r * 2); return c; }
  function sprites() {
    if (spr) return;
    spr = sprite(32, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(220,255,250,.55)'], [1, 'rgba(47,214,195,0)']]);
    // the prism's glass: a ring of spectrum, turned each frame
    sprC = document.createElement('canvas'); sprC.width = sprC.height = 256;
    var g = sprC.getContext('2d');
    if (g.createConicGradient) { var cg = g.createConicGradient(0, 128, 128); SPEC.concat([SPEC[0]]).forEach(function (c, i, a) { cg.addColorStop(i / (a.length - 1), c); }); g.strokeStyle = cg; }
    else g.strokeStyle = '#bff8f0';
    g.lineWidth = 10; g.globalAlpha = 0.55; g.filter = 'blur(6px)'; g.beginPath(); g.arc(128, 128, 96, 0, 6.283); g.stroke();
    g.filter = 'none'; g.globalAlpha = 0.9; g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 96, 0, 6.283); g.stroke();
  }
  function layout() {
    if (!box || !cv) return;
    sprites();
    var r = box.getBoundingClientRect(); if (!r.width) return;
    dpr = Math.min(window.innerWidth < 640 ? 1.5 : 2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    var m = model() || { list: [] }, max = Math.max.apply(null, m.list.map(function (x) { return x.sum; }).concat([1]));
    var L = box.querySelector('.n-p3-logo').getBoundingClientRect(), T = box.querySelector('[data-total]').getBoundingClientRect();
    logo = { x: L.left - r.left + L.width / 2, y: L.top - r.top + L.height / 2, r: L.width / 2 };
    var phone = r.width < 640;
    out = phone ? { x: T.left - r.left + T.width / 2, y: T.top - r.top - 10 } : { x: T.left - r.left - 16, y: T.top - r.top + T.height / 2 };
    beams = Array.prototype.map.call(box.querySelectorAll('[data-people] li[data-id]'), function (li) {
      var u = li.querySelector('u').getBoundingClientRect();
      var x = m.list.find(function (p) { return p.id === li.dataset.id; }) || { sum: 0, name: '' };
      var old = beams.find(function (b) { return b.id === li.dataset.id; });
      var b = { id: li.dataset.id, x0: u.left - r.left + u.width / 2, y0: u.top - r.top + u.height / 2, col: hue(x.name), w: x.sum ? 1 + 2.6 * (x.sum / max) : 0.5, k: x.sum ? 0.5 + 0.5 * (x.sum / max) : 0.2,
        parts: old ? old.parts : [], rate: x.sum ? 0.04 + 0.2 * (x.sum / max) : 0.01, li: li };
      // the ribbon: SPEC bands side by side, wide at her end, joined into one white line inside the prism
      b.core = new Path2D(); b.bands = SPEC.map(function () { return new Path2D(); });
      var N = 30, spread = (phone ? 2.6 : 3.4) * (b.w + 0.8);
      for (var i = 0; i <= N; i++) {
        var t = i / N, p = pt(b, t), q = pt(b, Math.min(1, t + 0.01)), dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        var s = spread * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1.25 - t * 0.5); // narrow at her, the spectrum opens on the way, joined again in the prism
        if (i) b.core.lineTo(p.x, p.y); else b.core.moveTo(p.x, p.y);
        b.bands.forEach(function (path, k) { var o = (k - (SPEC.length - 1) / 2) * s; if (i) path.lineTo(p.x + nx * o, p.y + ny * o); else path.moveTo(p.x + nx * o, p.y + ny * o); });
      }
      return b;
    });
    // out of the prism: one white ray to the total, and the spectrum fanning around it
    var ang = Math.atan2(out.y - logo.y, out.x - logo.x), len = Math.hypot(out.x - logo.x, out.y - logo.y);
    fan = SPEC.map(function (c, k) { var a = ang + (k - (SPEC.length - 1) / 2) * 0.05, p = new Path2D(); p.moveTo(logo.x, logo.y); p.lineTo(logo.x + Math.cos(a) * len * 0.82, logo.y + Math.sin(a) * len * 0.82); return { p: p, c: c }; });
    if (calm()) drawCalm();
  }
  // a point on her curve, t in 0..1 (from her to the logo)
  function pt(b, t) {
    var phone = box.clientWidth < 640;
    var cx = phone ? b.x0 : (b.x0 + logo.x) / 2, cy = phone ? (b.y0 + logo.y) / 2 : b.y0;
    var c2x = phone ? logo.x : (b.x0 + logo.x) / 2, c2y = phone ? (b.y0 + logo.y) / 2 : logo.y;
    var u = 1 - t;
    return { x: u * u * u * b.x0 + 3 * u * u * t * cx + 3 * u * t * t * c2x + t * t * t * logo.x, y: u * u * u * b.y0 + 3 * u * u * t * cy + 3 * u * t * t * c2y + t * t * t * logo.y };
  }
  function frame(now) {
    raf = 0;
    if (!box || !box.isConnected || !visible || document.hidden || !logo) return;
    var W = cv.width / dpr, H = cv.height / dpr, t = now / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    beams.forEach(function (b, i) {
      var br = (0.82 + 0.18 * Math.sin(t * 1.5 + i)) * b.k;
      ctx.globalAlpha = 0.07 * br; ctx.lineWidth = b.w * 14; ctx.strokeStyle = '#bff8f0'; ctx.stroke(b.core);
      ctx.lineWidth = Math.max(1, b.w * 0.9);
      for (var k = 0; k < SPEC.length; k++) { ctx.globalAlpha = 0.75 * br; ctx.strokeStyle = SPEC[k]; ctx.stroke(b.bands[k]); }
      ctx.globalAlpha = 0.55 * br; ctx.lineWidth = Math.max(0.8, b.w * 0.6); ctx.strokeStyle = '#ffffff'; ctx.stroke(b.core);
      // light running along it
      if (b.parts.length < 6 && Math.random() < b.rate * 5) b.parts.push({ t: 0, v: 0.006 + Math.random() * 0.006 + b.rate * 0.02, s: 6 + Math.random() * 8 });
      for (var j = b.parts.length - 1; j >= 0; j--) {
        var p = b.parts[j]; p.t += p.v; if (p.t >= 1) { b.parts.splice(j, 1); continue; }
        var q = pt(b, p.t); ctx.globalAlpha = Math.sin(p.t * Math.PI) * (0.5 + b.k * 0.5); ctx.drawImage(spr, q.x - p.s, q.y - p.s, p.s * 2, p.s * 2);
      }
    });
    // out of the prism: the spectrum fan, then the white ray
    var br = 0.8 + 0.2 * Math.sin(t * 2.1) + flash;
    ctx.lineWidth = 1.6;
    fan.forEach(function (f, k) { ctx.globalAlpha = (0.22 + 0.12 * Math.sin(t * 2 + k)) * br; ctx.strokeStyle = f.c; ctx.stroke(f.p); });
    [[18, 0.06, '#bff8f0'], [7, 0.18, '#dffcf8'], [2.4, 0.95, '#ffffff']].forEach(function (z) { ctx.globalAlpha = Math.min(1, z[1] * br); ctx.lineWidth = z[0] * (1 + flash); ctx.strokeStyle = z[2]; ctx.beginPath(); ctx.moveTo(logo.x, logo.y); ctx.lineTo(out.x, out.y); ctx.stroke(); });
    var gs = 18 + flash * 30; ctx.globalAlpha = 0.9; ctx.drawImage(spr, out.x - gs, out.y - gs, gs * 2, gs * 2);
    // the prism: its glass ring of spectrum turns, the core glows (brighter for a moment on a payment)
    var R = logo.r * 1.55;
    ctx.save(); ctx.translate(logo.x, logo.y); ctx.rotate(t * 0.6); ctx.globalAlpha = 0.65 + flash * 0.35; ctx.drawImage(sprC, -R, -R, R * 2, R * 2); ctx.restore();
    var G = logo.r * (2.6 + flash * 2); ctx.globalAlpha = 0.55 + flash * 0.45; ctx.drawImage(spr, logo.x - G, logo.y - G, G * 2, G * 2);
    // a payment's comet: from her, through the prism, to the total
    for (var c = comets.length - 1; c >= 0; c--) {
      var cm = comets[c]; cm.t += 0.02; if (cm.t >= 2) { comets.splice(c, 1); continue; }
      var q2 = cm.t < 1 ? pt(cm.b, cm.t) : { x: logo.x + (out.x - logo.x) * (cm.t - 1), y: logo.y + (out.y - logo.y) * (cm.t - 1) };
      if (cm.t >= 1 && !cm.hit) { cm.hit = 1; flash = 1; }
      if (cm.t >= 1.95 && !cm.done) { cm.done = 1; var mm = model(); if (mm) count(mm, false); box.classList.remove('n-p3-ding'); void box.offsetWidth; box.classList.add('n-p3-ding'); }
      ctx.globalAlpha = 1; ctx.drawImage(spr, q2.x - 30, q2.y - 30, 60, 60);
    }
    flash *= 0.94;
    ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(frame);
  }
  function go() { if (calm()) { drawCalm(); return; } if (!raf && box) raf = requestAnimationFrame(frame); }
  function drawCalm() {
    if (!ctx || !logo) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    beams.forEach(function (b) { ctx.lineWidth = Math.max(1, b.w * 0.9); SPEC.forEach(function (c, k) { ctx.globalAlpha = 0.6 * b.k + 0.15; ctx.strokeStyle = c; ctx.stroke(b.bands[k]); }); });
    ctx.globalAlpha = 0.9; ctx.lineWidth = 2.4; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(logo.x, logo.y); ctx.lineTo(out.x, out.y); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
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
    var root = document.getElementById('panel-panou');
    if (!root || !root.querySelector('.db-root')) return;
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
