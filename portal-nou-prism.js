// Centrul360 portal, aspectul nou: prisma cosmeticienelor, ÎN blocul de bani din Panou → Azi (portal-summit-stage.js, doar admin).
// Un singur bloc, un singur „Încasat azi”: cosmeticienele (toate cele active, cu suma de azi) stau în stânga (pe telefon, un rând
// care se derulează sus); din fiecare pleacă o dungă de spectru (mai groasă și mai vie cu cât a adus mai mult) care intră în logoul
// Centrul360 (prisma), din care iese raza albă spre numărul mare al blocului. La o încasare nouă: un puls pleacă de la cosmeticiana
// care a făcut tratamentul, trece prin prismă și ajunge la număr; acolo blocul preia (cometa spre Nuki, monedele, numărul).
// Canvas 2D (fără biblioteci, fără filtre pe ce se mișcă), merge doar cât e pe ecran; liniște pentru „mai puțină mișcare”.
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

  // ------------------------------------------------------------------ the scene, inside the stage's [data-flow]
  var box = null, cv = null, ctx = null, beams = [], logo = null, out = null, raf = 0, visible = true, flash = 0, comets = [], dpr = 1, acc = '', accRGB = '47,214,195';
  function mount(flow) {
    var m = model(); if (!m) return;
    box = flow;
    var c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true'); c.className = 'sx-p-cv';
    var ol = document.createElement('ol'); ol.className = 'sx-p-people'; ol.setAttribute('data-people', ''); ol.setAttribute('aria-label', 'Cosmeticienele, azi');
    var lg = document.createElement('div'); lg.className = 'sx-p-logo'; lg.setAttribute('aria-hidden', 'true'); lg.innerHTML = MARK;
    flow.insertBefore(lg, flow.firstChild); flow.insertBefore(ol, flow.firstChild); flow.insertBefore(c, flow.firstChild);
    cv = c; ctx = cv.getContext('2d');
    people(m);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) go(); }, { threshold: 0.02 }).observe(box);
    if ('ResizeObserver' in window) new ResizeObserver(function () { layout(); go(); }).observe(box); else addEventListener('resize', layout, { passive: true });
    // the phone's row scrolls sideways: the bands follow it (one layout per frame at most)
    var q = 0; ol.addEventListener('scroll', function () { if (!q) q = requestAnimationFrame(function () { q = 0; layout(); }); }, { passive: true });
    new MutationObserver(function () { if (accent() !== acc) { spr = null; layout(); } }).observe(html, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
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
  // the accent, as rgb (whatever form --accent takes: read back from a 1px canvas)
  function accent() { return (getComputedStyle(html).getPropertyValue('--accent') || '').trim(); }
  function readAccent() {
    acc = accent();
    try { var c = document.createElement('canvas'); c.width = c.height = 1; var g = c.getContext('2d'); g.fillStyle = acc || '#2fd6c3'; g.fillRect(0, 0, 1, 1); var d = g.getImageData(0, 0, 1, 1).data; accRGB = d[0] + ',' + d[1] + ',' + d[2]; } catch (e) {}
  }
  // where the light starts (the dot of each chip), meets (the logo, a prism) and ends (the big number). The geometry of every
  // band is built once here as Path2D, so a frame only strokes it (smooth on phones).
  var SPEC = ['#ff4f6d', '#ff9f43', '#ffe45c', '#5cf2a0', '#48d6ff', '#5b8cff'];
  var spr = null, sprC = null, fan = [];
  function sprite(r, stops) { var c = document.createElement('canvas'); c.width = c.height = r * 2; var g = c.getContext('2d'); var rg = g.createRadialGradient(r, r, 0, r, r, r); stops.forEach(function (s) { rg.addColorStop(s[0], s[1]); }); g.fillStyle = rg; g.fillRect(0, 0, r * 2, r * 2); return c; }
  function sprites() {
    if (spr) return;
    readAccent();
    spr = sprite(32, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(' + accRGB + ',.5)'], [1, 'rgba(' + accRGB + ',0)']]);
    // the prism's glass: a ring of spectrum, turned each frame (the blur is baked once into the sprite, never per frame)
    sprC = document.createElement('canvas'); sprC.width = sprC.height = 256;
    var g = sprC.getContext('2d');
    if (g.createConicGradient) { var cg = g.createConicGradient(0, 128, 128); SPEC.concat([SPEC[0]]).forEach(function (c, i, a) { cg.addColorStop(i / (a.length - 1), c); }); g.strokeStyle = cg; }
    else g.strokeStyle = 'rgb(' + accRGB + ')';
    g.lineWidth = 10; g.globalAlpha = 0.55; g.filter = 'blur(6px)'; g.beginPath(); g.arc(128, 128, 96, 0, 6.283); g.stroke();
    g.filter = 'none'; g.globalAlpha = 0.9; g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 96, 0, 6.283); g.stroke();
  }
  var phone = function () { return box && box.clientWidth < 700; };
  function layout() {
    if (!box || !cv || !box.isConnected) return;
    sprites();
    var r = box.getBoundingClientRect(); if (!r.width) return;
    dpr = Math.min(window.innerWidth < 700 ? 1 : 2, window.devicePixelRatio || 1); // a phone draws at 1x: soft light, a quarter of the pixels
    var m = model() || { list: [] }, max = Math.max.apply(null, m.list.map(function (x) { return x.sum; }).concat([1]));
    var L = box.querySelector('.sx-p-logo').getBoundingClientRect();
    var ph = phone();
    var T = box.querySelector(ph ? '.sx-s-lbl' : '[data-num]'); if (!T) return; T = T.getBoundingClientRect();
    logo = { x: L.left - r.left + L.width / 2, y: L.top - r.top + L.height / 2, r: L.width / 2 };
    out = ph ? { x: r.width / 2, y: T.top - r.top - 8 } : { x: T.left - r.left - 18, y: T.top - r.top + T.height * 0.55 };
    // on a phone the light only lives between the chips and the number: the canvas stops there (fewer pixels to composite each frame)
    var ch = ph ? Math.min(r.height, out.y + 34) : r.height;
    var w = Math.round(r.width * dpr), h = Math.round(ch * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; cv.style.width = r.width + 'px'; cv.style.height = ch + 'px'; }
    beams = Array.prototype.map.call(box.querySelectorAll('[data-people] li[data-id]'), function (li) {
      var u = li.querySelector('u').getBoundingClientRect();
      var x = m.list.find(function (p) { return p.id === li.dataset.id; }) || { sum: 0, name: '' };
      var old = beams.find(function (b) { return b.id === li.dataset.id; });
      // a chip scrolled out of the phone's row: its band comes in from the edge
      var x0 = Math.max(6, Math.min(r.width - 6, u.left - r.left + u.width / 2));
      var b = { id: li.dataset.id, x0: x0, y0: u.top - r.top + u.height / 2, col: hue(x.name), w: x.sum ? 1 + 2.6 * (x.sum / max) : 0.5, k: x.sum ? 0.5 + 0.5 * (x.sum / max) : 0.2,
        parts: old ? old.parts : [], rate: x.sum ? 0.04 + 0.2 * (x.sum / max) : 0.01, li: li };
      // the ribbon: SPEC bands side by side, narrow at her end, open on the way, joined into one white line inside the prism
      b.core = new Path2D(); b.bands = SPEC.map(function () { return new Path2D(); });
      var N = 30, spread = (ph ? 2.2 : 3.4) * (b.w + 0.8);
      for (var i = 0; i <= N; i++) {
        var t = i / N, p = pt(b, t), q = pt(b, Math.min(1, t + 0.01)), dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        var s = spread * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1.25 - t * 0.5);
        if (i) b.core.lineTo(p.x, p.y); else b.core.moveTo(p.x, p.y);
        b.bands.forEach(function (path, k) { var o = (k - (SPEC.length - 1) / 2) * s; if (i) path.lineTo(p.x + nx * o, p.y + ny * o); else path.moveTo(p.x + nx * o, p.y + ny * o); });
      }
      return b;
    });
    // out of the prism: one white ray to the number, and the spectrum fanning around it
    var ang = Math.atan2(out.y - logo.y, out.x - logo.x), len = Math.hypot(out.x - logo.x, out.y - logo.y);
    fan = SPEC.map(function (c, k) { var a = ang + (k - (SPEC.length - 1) / 2) * 0.05, p = new Path2D(); p.moveTo(logo.x, logo.y); p.lineTo(logo.x + Math.cos(a) * len * 0.82, logo.y + Math.sin(a) * len * 0.82); return { p: p, c: c }; });
    if (calm()) drawCalm();
  }
  // a point on her curve, t in 0..1 (from her to the logo)
  function pt(b, t) {
    var ph = phone();
    var cx = ph ? b.x0 : (b.x0 + logo.x) / 2, cy = ph ? (b.y0 + logo.y) / 2 : b.y0;
    var c2x = ph ? logo.x : (b.x0 + logo.x) / 2, c2y = ph ? (b.y0 + logo.y) / 2 : logo.y;
    var u = 1 - t;
    return { x: u * u * u * b.x0 + 3 * u * u * t * cx + 3 * u * t * t * c2x + t * t * t * logo.x, y: u * u * u * b.y0 + 3 * u * u * t * cy + 3 * u * t * t * c2y + t * t * t * logo.y };
  }
  var lastF = 0;
  function frame(now) {
    raf = 0;
    if (!box || !box.isConnected || !visible || document.hidden || !logo) return;
    var W = cv.width / dpr, H = cv.height / dpr, t = now / 1000, small = W < 700;
    // a phone draws the light at 30 fps (every other frame, everything moves twice as far): the scroll keeps the other half
    if (small && now - lastF < 28) { raf = requestAnimationFrame(frame); return; }
    var sp = small ? 2 : 1; lastF = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    beams.forEach(function (b, i) {
      var br = (0.82 + 0.18 * Math.sin(t * 1.5 + i)) * b.k;
      if (!small) { ctx.globalAlpha = 0.07 * br; ctx.lineWidth = b.w * 14; ctx.strokeStyle = 'rgb(' + accRGB + ')'; ctx.stroke(b.core); }
      ctx.lineWidth = Math.max(1, b.w * 0.9);
      for (var k = small ? 1 : 0; k < SPEC.length; k += small ? 2 : 1) { ctx.globalAlpha = 0.75 * br; ctx.strokeStyle = SPEC[k]; ctx.stroke(b.bands[k]); }
      ctx.globalAlpha = 0.55 * br; ctx.lineWidth = Math.max(0.8, b.w * 0.6); ctx.strokeStyle = '#ffffff'; ctx.stroke(b.core);
      // light running along it
      if (b.parts.length < (small ? 2 : 6) && Math.random() < b.rate * 5 * sp) b.parts.push({ t: 0, v: 0.006 + Math.random() * 0.006 + b.rate * 0.02, s: 6 + Math.random() * 8 });
      for (var j = b.parts.length - 1; j >= 0; j--) {
        var p = b.parts[j]; p.t += p.v * sp; if (p.t >= 1) { b.parts.splice(j, 1); continue; }
        var q = pt(b, p.t); ctx.globalAlpha = Math.sin(p.t * Math.PI) * (0.5 + b.k * 0.5); ctx.drawImage(spr, q.x - p.s, q.y - p.s, p.s * 2, p.s * 2);
      }
    });
    // out of the prism: the spectrum fan, then the white ray
    var br = 0.8 + 0.2 * Math.sin(t * 2.1) + flash;
    ctx.lineWidth = 1.6;
    fan.forEach(function (f, k) { ctx.globalAlpha = (0.22 + 0.12 * Math.sin(t * 2 + k)) * br; ctx.strokeStyle = f.c; ctx.stroke(f.p); });
    [[18, 0.06, 'rgb(' + accRGB + ')'], [7, 0.18, '#eafffb'], [2.4, 0.95, '#ffffff']].forEach(function (z) { ctx.globalAlpha = Math.min(1, z[1] * br); ctx.lineWidth = z[0] * (1 + flash); ctx.strokeStyle = z[2]; ctx.beginPath(); ctx.moveTo(logo.x, logo.y); ctx.lineTo(out.x, out.y); ctx.stroke(); });
    var gs = 18 + flash * 30; ctx.globalAlpha = 0.9; ctx.drawImage(spr, out.x - gs, out.y - gs, gs * 2, gs * 2);
    // the prism: its glass ring of spectrum turns, the core glows (brighter for a moment on a payment)
    var R = logo.r * 1.55;
    ctx.save(); ctx.translate(logo.x, logo.y); ctx.rotate(t * 0.6); ctx.globalAlpha = 0.65 + flash * 0.35; ctx.drawImage(sprC, -R, -R, R * 2, R * 2); ctx.restore();
    var G = logo.r * (2.6 + flash * 2); ctx.globalAlpha = 0.55 + flash * 0.45; ctx.drawImage(spr, logo.x - G, logo.y - G, G * 2, G * 2);
    // a payment's pulse: from her, through the prism, to the number; there the stage takes over
    for (var c = comets.length - 1; c >= 0; c--) {
      var cm = comets[c]; cm.t += 0.022 * sp; if (cm.t >= 2) { comets.splice(c, 1); if (cm.done) cm.done(); continue; }
      var q2 = cm.t < 1 ? pt(cm.b, cm.t) : { x: logo.x + (out.x - logo.x) * (cm.t - 1), y: logo.y + (out.y - logo.y) * (cm.t - 1) };
      if (cm.t >= 1 && !cm.hit) { cm.hit = 1; flash = 1; }
      ctx.globalAlpha = 1; ctx.drawImage(spr, q2.x - 30, q2.y - 30, 60, 60);
    }
    flash *= small ? 0.88 : 0.94;
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

  // ------------------------------------------------------------------ new payments (called by the stage): one pulse each, then done()
  // returns false when the scene can't show it now (not on screen, calm, no cosmeticians): the stage then does its part at once
  function send(sales, done) {
    if (!box || !box.isConnected || !visible || document.hidden || calm() || !beams.length) return false;
    var m = model(); if (m) people(m);
    sales.forEach(function (s, i) {
      setTimeout(function () {
        var id = s.performedBy || s.employeeId;
        var b = beams.find(function (x) { return x.id === id; }) || beams[0];
        if (b.li) { b.li.classList.remove('sx-p-hit'); void b.li.offsetWidth; b.li.classList.add('sx-p-hit'); }
        comets.push({ b: b, t: 0, done: done }); go();
      }, i * 700);
    });
    return true;
  }

  // ------------------------------------------------------------------ wiring: when the stage is on the Panou
  function place() {
    var d = D(); if (!d || !d.isAdmin) return;
    var flow = document.querySelector('#panel-panou .sx-stage [data-flow]');
    if (!flow || (box === flow && box.isConnected)) return;
    mount(flow);
  }
  function start() {
    var k = K(); if (!k) return;
    var panel = document.getElementById('panel-panou');
    if (panel) new MutationObserver(function () { place(); }).observe(panel, { childList: true });
    if (k.on) k.on('data', function () { setTimeout(function () { place(); var m = model(); if (m && box) people(m); }, 120); });
    var t = setInterval(function () { if (D()) { clearInterval(t); place(); } }, 300);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) go(); });
    window.C360Prism = { send: send, place: place };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
