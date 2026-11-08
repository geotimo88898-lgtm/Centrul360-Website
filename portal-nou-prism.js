// Centrul360 portal, aspectul nou: prisma cosmeticienelor, ÎN blocul de bani din Panou → Azi (portal-summit-stage.js, doar admin).
// Un singur bloc, un singur „Încasat azi”: sus un rând cu cosmeticienele (toate cele active, cu suma de azi); dedesubt, fixe în
// mijloc, logoul Centrul360 (prisma) și numărul mare. Din fiecare card vizibil pleacă o dungă de spectru (mai groasă și mai vie cu cât
// a adus mai mult) care intră în prismă; din prismă iese raza albă spre număr. Când nu încap toate, rândul e o buclă fără capăt: se
// trage cu degetul (sau cu rotița laterală), cu inerție și oprire pe card, pornește cu cosmeticiana din mijlocul listei centrată deasupra
// prismei, iar razele urmăresc derularea. Când încap, stau centrate, fără buclă. La o încasare nouă rândul se centrează pe cosmeticiana
// care a încasat, apoi pulsul pleacă de la ea prin prismă la număr; acolo blocul preia (cometa spre Nuki, monedele, numărul).
// Canvas 2D (fără biblioteci, fără filtre pe ce se mișcă), cardurile doar cu transform și opacity; nimic nu rulează când nu se vede.
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
  // a steady order (city, then name): a payment changes a sum, never her place in the row
  function model() {
    var d = D(); if (!d) return null;
    var t = today();
    var emps = ((d.admin && d.admin.employees) || d.activeEmployees || []).filter(function (e) { return e.role === 'cosmetician' && e.active !== false; });
    var inc = (d.incasari || []).filter(function (s) { return s.date === t; });
    var sumOf = function (id) { return inc.filter(function (s) { return (s.performedBy || s.employeeId) === id; }).reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0); };
    var list = emps.map(function (e) { return { id: e.id, name: e.name || '', city: e.location || '', photo: e.photo || '', sum: sumOf(e.id) }; })
      .sort(function (a, b) { return a.city.localeCompare(b.city) || a.name.localeCompare(b.name); });
    return { list: list, inc: inc };
  }

  // ------------------------------------------------------------------ the scene, inside the stage's [data-flow]
  var box = null, row = null, ol = null, cv = null, ctx = null, beams = [], logo = null, out = null, raf = 0, visible = true, flash = 0, comets = [], dpr = 1, acc = '', accRGB = '47,214,195';
  // the row: x is the track's translation; chips[] = {el, id, l (left in the track), w}; setW = one copy's width with its gap
  var car = { loop: false, x: 0, setW: 0, n: 0, W: 0, gap: 10, chips: [], h: 0, top: 0, left: 0, v: 0, drag: null, anim: 0, snapT: 0, vert: false, cw: 0 };
  // on a computer the scene is horizontal: the cards in a column on the left (a vertical loop when they don't fit), the prism in the
  // middle, the number on the right; on a phone or a tablet it stands up: the cards in a row on top, the prism, the number below
  var WIDE = window.matchMedia ? matchMedia('(min-width:1024px)') : { matches: false };
  var COLH = 420; // the column's height when it loops (about seven cards)
  function mount(flow) {
    var m = model(); if (!m) return;
    box = flow;
    var c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true'); c.className = 'sx-p-cv';
    row = document.createElement('div'); row.className = 'sx-p-row';
    ol = document.createElement('ol'); ol.className = 'sx-p-people'; ol.setAttribute('data-people', ''); ol.setAttribute('aria-label', 'Cosmeticienele, azi');
    row.appendChild(ol);
    var lg = document.createElement('div'); lg.className = 'sx-p-logo'; lg.setAttribute('aria-hidden', 'true'); lg.innerHTML = MARK;
    flow.insertBefore(lg, flow.firstChild); flow.insertBefore(row, flow.firstChild); flow.insertBefore(c, flow.firstChild);
    cv = c; ctx = cv.getContext('2d');
    people(m, true);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) go(); }, { threshold: 0.02 }).observe(box);
    var lw = 0;
    if (WIDE.addEventListener) WIDE.addEventListener('change', function () { var mm = model(); if (mm) people(mm, true); });
    if ('ResizeObserver' in window) new ResizeObserver(function () { var w = box.clientWidth; if (w !== lw) { lw = w; var mm = model(); if (mm) people(mm, true); } else layout(); go(); }).observe(box);
    else addEventListener('resize', function () { var mm = model(); if (mm) people(mm, true); }, { passive: true });
    new MutationObserver(function () { if (accent() !== acc) { spr = null; layout(); } }).observe(html, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
    drag();
    // the cards are measured in px: once the fonts arrive their widths change, so measure again (the centred one stays centred)
    if (document.fonts) { var again = function () { var mm = model(); if (mm && box && box.isConnected) people(mm, true); }; document.fonts.ready.then(again); document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', again); }
    requestAnimationFrame(function () { layout(); go(); });
  }
  function chipHtml(x, i, ghost) {
    return '<li data-id="' + esc(x.id) + '" style="--c:' + hue(x.name) + '"' + (x.sum ? '' : ' class="is-zero"') + (ghost ? ' aria-hidden="true"' : '') + '>' +
      (x.photo ? '<img alt="" src="' + esc(x.photo) + '">' : '<i>' + esc(ini(x.name)) + '</i>') +
      '<span><b>' + esc(x.name) + '</b><em>' + esc(lei(x.sum)) + '</em></span><u></u></li>';
  }
  // (re)build the row; keeps the cosmetician who is centred now in the centre
  function people(m, force) {
    var key = m.list.map(function (x) { return x.id + ':' + x.sum; }).join(',') + '|' + box.clientWidth + (WIDE.matches ? 'v' : 'h');
    if (!force && ol.dataset.key === key) return;
    var keepId = centredId();
    ol.dataset.key = key;
    if (!m.list.length) { ol.innerHTML = '<li class="is-zero"><span><b>Nicio cosmeticiană activă</b></span></li>'; car.chips = []; car.loop = false; place0(); layout(); return; }
    // one copy first, to measure; three copies when they don't fit (a loop: the middle one is the real one)
    ol.innerHTML = m.list.map(function (x, i) { return chipHtml(x, i, false); }).join('');
    car.vert = WIDE.matches; row.classList.toggle('is-col', car.vert); row.style.height = '';
    car.W = car.vert ? COLH : row.clientWidth; car.cw = row.clientWidth;
    var cs = getComputedStyle(ol); car.gap = parseFloat(car.vert ? cs.rowGap : cs.columnGap) || 10;
    var one = Array.prototype.map.call(ol.children, function (li) { return car.vert ? { l: li.offsetTop, w: li.offsetHeight } : { l: li.offsetLeft, w: li.offsetWidth }; });
    var last = one[one.length - 1], setW = last.l + last.w + car.gap;
    car.n = m.list.length; car.setW = setW; car.loop = setW - car.gap > car.W + 1;
    if (car.vert) { if (!car.loop) car.W = setW - car.gap; row.style.height = car.W + 'px'; }
    if (car.loop) ol.innerHTML = [0, 1, 2].map(function (k) { return m.list.map(function (x, i) { return chipHtml(x, i, k !== 1); }).join(''); }).join('');
    car.chips = Array.prototype.map.call(ol.children, function (li, j) { var o = one[j % car.n]; return { el: li, id: li.dataset.id, l: o.l + Math.floor(j / car.n) * setW, w: o.w, k: j }; });
    car.h = car.vert ? ol.children[0].offsetWidth : ol.children[0].offsetHeight;
    var cx = car.W / 2;
    if (!car.loop) car.x = (car.W - (setW - car.gap)) / 2;
    else {
      var ci = Math.max(0, m.list.findIndex(function (x) { return x.id === keepId; }));
      if (!keepId || ci < 0) ci = Math.floor((car.n - 1) / 2);
      var ch = car.chips[car.n + ci]; car.x = cx - (ch.l + ch.w / 2);
    }
    row.classList.toggle('is-loop', car.loop);
    apply(); layout();
  }
  function place0() { car.x = 0; ol.style.transform = ''; }
  function centredId() {
    if (!car.chips.length) return '';
    var cx = car.W / 2, best = null, bd = 1e9;
    car.chips.forEach(function (c) { var d = Math.abs(car.x + c.l + c.w / 2 - cx); if (d < bd) { bd = d; best = c; } });
    return best ? best.id : '';
  }
  // the track moves (transform only); a loop wraps by one copy; each chip's depth from the centre (opacity and scale)
  function apply() {
    if (car.loop) { var base = car.W / 2 - car.setW * 1.5; while (car.x > base + car.setW / 2) car.x -= car.setW; while (car.x < base - car.setW / 2) car.x += car.setW; }
    ol.style.transform = car.vert ? 'translate3d(0,' + car.x.toFixed(2) + 'px,0)' : 'translate3d(' + car.x.toFixed(2) + 'px,0,0)';
    var cx = car.W / 2, span = Math.max(220, car.W * 0.55);
    car.chips.forEach(function (c) {
      var d = Math.min(1, Math.abs(car.x + c.l + c.w / 2 - cx) / span);
      var o = car.loop ? 1 - d * 0.55 : 1, sc = car.loop ? 1 - d * 0.06 : 1;
      if (c.o !== o) { c.el.style.opacity = o.toFixed(3); c.el.style.transform = sc < 1 ? 'scale(' + sc.toFixed(3) + ')' : ''; c.o = o; }
    });
    geo();
  }
  // the gestures: a finger or a mouse drags (horizontal only, the page still scrolls up and down), the wheel sideways, then inertia and the snap
  function drag() {
    var samples = [];
    row.addEventListener('pointerdown', function (e) {
      if (!car.loop || (e.pointerType === 'mouse' && e.button !== 0)) return;
      stop(); car.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, cx: car.x, on: false }; samples = [[car.vert ? e.clientY : e.clientX, performance.now()]];
    });
    row.addEventListener('pointermove', function (e) {
      var g = car.drag; if (!g || g.id !== e.pointerId) return;
      var dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (car.vert) { var t = dx; dx = dy; dy = t; } // along the row's own axis
      if (!g.on) { if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; if (Math.abs(dy) > Math.abs(dx)) { car.drag = null; return; } g.on = true; try { row.setPointerCapture(e.pointerId); } catch (x) {} row.classList.add('is-drag'); }
      car.x = g.cx + dx; apply(); go();
      samples.push([car.vert ? e.clientY : e.clientX, performance.now()]); if (samples.length > 6) samples.shift();
    });
    var up = function (e) {
      var g = car.drag; if (!g || g.id !== e.pointerId) return; car.drag = null; row.classList.remove('is-drag');
      if (!g.on) return;
      var a = samples[0], b = samples[samples.length - 1], dt = b[1] - a[1];
      car.v = dt > 0 && performance.now() - b[1] < 80 ? (b[0] - a[0]) / dt : 0;
      glide();
    };
    row.addEventListener('pointerup', up); row.addEventListener('pointercancel', up);
    row.addEventListener('wheel', function (e) {
      var d = car.vert ? e.deltaY : e.deltaX;
      if (!car.loop || (!car.vert && Math.abs(e.deltaX) <= Math.abs(e.deltaY))) return;
      e.preventDefault(); stop(); car.x -= d; apply(); go();
      clearTimeout(car.snapT); car.snapT = setTimeout(function () { snapTo(null); }, 140);
    }, { passive: false });
  }
  function stop() { if (car.anim) cancelAnimationFrame(car.anim); car.anim = 0; }
  // inertia: the speed fades (about 6% a frame), then the nearest card glides into the centre
  function glide() {
    stop();
    if (calm() || Math.abs(car.v) < 0.05) { snapTo(null); return; }
    var t0 = performance.now();
    (function step(t) {
      var dt = Math.min(40, t - t0); t0 = t;
      car.x += car.v * dt; car.v *= Math.pow(0.996, dt);
      apply(); go();
      if (Math.abs(car.v) < 0.08) { car.anim = 0; snapTo(null); return; }
      car.anim = requestAnimationFrame(step);
    })(t0);
  }
  // glide so that a card is centred: the given one (an id, the copy nearest the centre) or the nearest one
  function snapTo(id, done) {
    stop();
    if (!car.loop || !car.chips.length) { if (done) done(); return; }
    var cx = car.W / 2, best = null, bd = 1e9;
    car.chips.forEach(function (c) { if (id && c.id !== id) return; var d = cx - (car.x + c.l + c.w / 2); if (Math.abs(d) < Math.abs(bd)) { bd = d; best = c; } });
    if (!best) { if (done) done(); return; }
    if (calm() || Math.abs(bd) < 0.5) { car.x += bd; apply(); go(); if (done) done(); return; }
    var x0 = car.x, t0 = performance.now(), ms = id ? 520 : 360;
    (function step(t) {
      var p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      car.x = x0 + bd * e; apply(); go();
      if (p < 1) car.anim = requestAnimationFrame(step); else { car.anim = 0; if (done) done(); }
    })(t0);
  }

  // the accent, as rgb (whatever form --accent takes: read back from a 1px canvas)
  function accent() { return (getComputedStyle(html).getPropertyValue('--accent') || '').trim(); }
  function readAccent() {
    acc = accent();
    try { var c = document.createElement('canvas'); c.width = c.height = 1; var g = c.getContext('2d'); g.fillStyle = acc || '#2fd6c3'; g.fillRect(0, 0, 1, 1); var d = g.getImageData(0, 0, 1, 1).data; accRGB = d[0] + ',' + d[1] + ',' + d[2]; } catch (e) {}
  }
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
  var small = function () { return window.innerWidth < 700; };
  // the fixed points (the logo, the number) and the canvas size: read from the page once per layout; the bands are built by geo()
  function layout() {
    if (!box || !cv || !box.isConnected) return;
    sprites();
    var r = box.getBoundingClientRect(); if (!r.width) return;
    dpr = Math.min(small() ? 1 : 2, window.devicePixelRatio || 1);
    var L = box.querySelector('.sx-p-logo').getBoundingClientRect();
    var T = box.querySelector(car.vert ? '[data-num]' : '.sx-s-lbl'); if (!T) return; T = T.getBoundingClientRect();
    var R = row.getBoundingClientRect();
    car.top = R.top - r.top; car.left = R.left - r.left; car.cw = row.clientWidth; if (!car.vert) car.W = row.clientWidth || car.W;
    logo = { x: L.left - r.left + L.width / 2, y: L.top - r.top + L.height / 2, r: L.width / 2 };
    out = car.vert ? { x: T.left - r.left - 18, y: T.top - r.top + T.height * 0.55 } : { x: logo.x, y: T.top - r.top - 8 };
    // the light lives between the cards and the number: standing up, the canvas stops at the number (fewer pixels to composite each frame)
    var ch = car.vert ? r.height : Math.min(r.height, out.y + 34);
    var w = Math.round(r.width * dpr), h = Math.round(ch * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; cv.style.width = r.width + 'px'; cv.style.height = ch + 'px'; }
    var ang = Math.atan2(out.y - logo.y, out.x - logo.x), len = Math.hypot(out.x - logo.x, out.y - logo.y);
    fan = SPEC.map(function (c, k) { var a = ang + (k - (SPEC.length - 1) / 2) * (car.vert ? Math.max(0.05, Math.min(0.09, 7 / Math.max(1, len))) : 0.085), p = new Path2D(); p.moveTo(logo.x, logo.y); p.lineTo(logo.x + Math.cos(a) * len * 0.82, logo.y + Math.sin(a) * len * 0.82); return { p: p, c: c }; });
    geo();
  }
  // one band per card on screen, from the dot under it to the prism (pure arithmetic: no reading the page while it moves)
  function geo() {
    if (!logo || !box) return;
    var m = model() || { list: [] }, max = Math.max.apply(null, m.list.map(function (x) { return x.sum; }).concat([1]));
    var sums = {}; m.list.forEach(function (x) { sums[x.id] = x; });
    var old = {}; beams.forEach(function (b) { old[b.key] = b; });
    var W = car.W, nb = [];
    car.chips.forEach(function (c) {
      var cxr = car.x + c.l + c.w / 2; if (cxr < -40 || cxr > W + 40) return;
      var edge = Math.max(0, Math.min(1, Math.min(cxr + 10, W + 10 - cxr) / 70)); // a band fades in from the edge
      if (edge <= 0) return;
      var x = sums[c.id] || { sum: 0 };
      var sc = c.o != null && c.o < 1 ? 1 - (1 - c.o) / 0.55 * 0.06 : 1;
      var o = old[c.k] || {};
      var b = { key: c.k, id: c.id, x0: car.vert ? car.left + car.cw - 12 * sc : car.left + cxr, y0: car.vert ? car.top + cxr : car.top + car.h / 2 + (car.h / 2) * sc + 4, col: hue(x.name || ''), w: x.sum ? 1 + 2.6 * (x.sum / max) : 0.5,
        k: (x.sum ? 0.5 + 0.5 * (x.sum / max) : 0.2) * edge * (c.o != null ? 0.4 + 0.6 * c.o : 1), parts: o.parts || [], rate: x.sum ? 0.04 + 0.2 * (x.sum / max) : 0.01, li: c.el };
      b.core = new Path2D(); b.bands = SPEC.map(function () { return new Path2D(); });
      var N = 24, run = Math.abs(logo.x - b.x0), spread = (car.vert ? Math.max(2.4, Math.min(5, run / 90)) : 3.4) * (b.w + 0.8); // a longer run opens a wider fan // standing up (a phone) the fan opens wider over the longer drop
      for (var i = 0; i <= N; i++) {
        var t = i / N, p = pt(b, t), q = pt(b, Math.min(1, t + 0.01)), dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        var s = spread * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1.25 - t * 0.5);
        if (i) b.core.lineTo(p.x, p.y); else b.core.moveTo(p.x, p.y);
        b.bands.forEach(function (path, k) { var oo = (k - (SPEC.length - 1) / 2) * s; if (i) path.lineTo(p.x + nx * oo, p.y + ny * oo); else path.moveTo(p.x + nx * oo, p.y + ny * oo); });
      }
      nb.push(b);
    });
    beams = nb;
    if (calm()) drawCalm();
  }
  // a point on her curve, t in 0..1 (from her card down into the logo)
  function pt(b, t) {
    var mx = (b.x0 + logo.x) / 2, my = (b.y0 + logo.y) / 2;
    var cx = car.vert ? mx : b.x0, cy = car.vert ? b.y0 : my, c2x = car.vert ? mx : logo.x, c2y = car.vert ? logo.y : my, u = 1 - t;
    return { x: u * u * u * b.x0 + 3 * u * u * t * cx + 3 * u * t * t * c2x + t * t * t * logo.x, y: u * u * u * b.y0 + 3 * u * u * t * cy + 3 * u * t * t * c2y + t * t * t * logo.y };
  }
  var lastF = 0;
  function frame(now) {
    raf = 0;
    if (!box || !box.isConnected || !visible || document.hidden || !logo) return;
    var W = cv.width / dpr, H = cv.height / dpr, t = now / 1000, sm = small();
    // a phone draws the light at 30 fps (every other frame, everything moves twice as far): the scroll keeps the other half
    if (sm && now - lastF < 28) { raf = requestAnimationFrame(frame); return; }
    var sp = sm ? 2 : 1; lastF = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (sm && !car.vert) { phone(t); ctx.globalCompositeOperation = 'source-over'; raf = requestAnimationFrame(frame); return; }
    beams.forEach(function (b, i) {
      var br = (0.82 + 0.18 * Math.sin(t * 1.5 + i)) * b.k;
      if (!sm) { ctx.globalAlpha = 0.07 * br; ctx.lineWidth = b.w * 14; ctx.strokeStyle = 'rgb(' + accRGB + ')'; ctx.stroke(b.core); }
      ctx.lineWidth = Math.max(1, b.w * 0.9);
      for (var k = sm ? 1 : 0; k < SPEC.length; k += sm ? 2 : 1) { ctx.globalAlpha = 0.75 * br; ctx.strokeStyle = SPEC[k]; ctx.stroke(b.bands[k]); }
      ctx.globalAlpha = 0.55 * br; ctx.lineWidth = Math.max(0.8, b.w * 0.6); ctx.strokeStyle = '#ffffff'; ctx.stroke(b.core);
      // light running along it
      if (b.parts.length < (sm ? 2 : 5) && Math.random() < b.rate * 5 * sp) b.parts.push({ t: 0, v: 0.006 + Math.random() * 0.006 + b.rate * 0.02, s: 6 + Math.random() * 8 });
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
    // a payment's pulse: from her card (wherever it is now), through the prism, to the number; there the stage takes over
    for (var c = comets.length - 1; c >= 0; c--) {
      var cm = comets[c]; cm.t += 0.022 * sp; if (cm.t >= 2) { comets.splice(c, 1); if (cm.done) cm.done(); continue; }
      var b2 = beams.find(function (x) { return x.key === cm.key; }) || beams.find(function (x) { return x.id === cm.id; }) || (car.vert ? { x0: car.left + car.cw, y0: logo.y } : { x0: logo.x, y0: car.top + car.h });
      var q2 = cm.t < 1 ? pt(b2, cm.t) : { x: logo.x + (out.x - logo.x) * (cm.t - 1), y: logo.y + (out.y - logo.y) * (cm.t - 1) };
      if (cm.t >= 1 && !cm.hit) { cm.hit = 1; flash = 1; }
      ctx.globalAlpha = 1; ctx.drawImage(spr, q2.x - 30, q2.y - 30, 60, 60);
    }
    flash *= sm ? 0.88 : 0.94;
    ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(frame);
  }
  // ------------------------------------------------------------------ the phone: one smooth ray per card in her colour, one light running down each
  // in turn, into the logo at one point; out of it a short beam that widens softly into the number (strokes and fills only, 30 fps)
  var dots = {};
  function dot(c) { return dots[c] || (dots[c] = sprite(16, [[0, 'rgba(255,255,255,1)'], [0.3, c], [1, 'rgba(0,0,0,0)']])); }
  var ease = function (u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; };
  function phone(t) {
    var P = 2.8; // every ray gets its light once in P seconds, the rays in turn
    beams.forEach(function (b, i) {
      var br = (0.86 + 0.14 * Math.sin(t * 1.3 + i)) * b.k, th = 2.8 + 1.1 * (b.w - 0.5);
      ctx.strokeStyle = b.col;
      [[th * 6, 0.05], [th * 3, 0.12], [th * 1.4, 0.5]].forEach(function (z) { ctx.globalAlpha = z[1] * br; ctx.lineWidth = z[0]; ctx.stroke(b.core); });
      ctx.globalAlpha = 0.55 * br; ctx.lineWidth = Math.max(0.8, th * 0.4); ctx.strokeStyle = '#ffffff'; ctx.stroke(b.core);
      // the impulse: a head with a short fading tail, the rays staggered so they never pulse together
      var ph = ((t + b.key * 0.61) % P) / P; if (ph > 0.6 || b.k < 0.15) return;
      var head = ease(ph / 0.6), sp2 = dot(b.col), sz = 5 + th * 1.6;
      for (var j = 0; j < 7; j++) { var u = head - j * 0.022; if (u <= 0) break; var q = pt(b, u); ctx.globalAlpha = (1 - j / 7) * Math.sin(Math.min(1, head) * Math.PI * 0.98 + 0.05) * (0.55 + 0.45 * b.k); var r2 = sz * (1 - j * 0.09); ctx.drawImage(sp2, q.x - r2, q.y - r2, r2 * 2, r2 * 2); }
    });
    // out of the logo: a soft beam, narrow at the logo, wide and faded at the number
    var br = 0.85 + 0.15 * Math.sin(t * 1.7) + flash, y0 = logo.y + logo.r * 0.95, y1 = out.y + 6, x = logo.x;
    if (y1 > y0 + 4) {
      var g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, 'rgba(' + accRGB + ',' + (0.55 * br) + ')'); g.addColorStop(0.55, 'rgba(' + accRGB + ',' + (0.14 * br) + ')'); g.addColorStop(1, 'rgba(' + accRGB + ',0)');
      var w0 = 2.5, w1 = 54 + flash * 30; ctx.globalAlpha = 1; ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x - w0, y0); ctx.bezierCurveTo(x - w0, y0 + (y1 - y0) * 0.5, x - w1 * 0.7, y1 - (y1 - y0) * 0.25, x - w1, y1); ctx.lineTo(x + w1, y1); ctx.bezierCurveTo(x + w1 * 0.7, y1 - (y1 - y0) * 0.25, x + w0, y0 + (y1 - y0) * 0.5, x + w0, y0); ctx.closePath(); ctx.fill();
      var gc = ctx.createLinearGradient(0, y0, 0, y1); gc.addColorStop(0, 'rgba(255,255,255,' + (0.7 * Math.min(1, br)) + ')'); gc.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = gc; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + (y1 - y0) * 0.7); ctx.stroke();
    }
    // the halo: discreet, in the accent (brighter for a moment on a payment)
    var G = logo.r * (2.3 + flash * 1.5); ctx.globalAlpha = 0.42 + flash * 0.5; ctx.drawImage(spr, logo.x - G, logo.y - G, G * 2, G * 2);
    for (var c = comets.length - 1; c >= 0; c--) {
      var cm = comets[c]; cm.t += 0.044; if (cm.t >= 2) { comets.splice(c, 1); if (cm.done) cm.done(); continue; }
      var b2 = beams.find(function (x) { return x.key === cm.key; }) || beams.find(function (x) { return x.id === cm.id; }) || { x0: logo.x, y0: car.top + car.h, col: '#fff' };
      var q2 = cm.t < 1 ? pt(b2, ease(cm.t)) : { x: logo.x, y: y0 + (y1 - y0) * (cm.t - 1) };
      if (cm.t >= 1 && !cm.hit) { cm.hit = 1; flash = 1; }
      ctx.globalAlpha = cm.t < 1 ? 1 : 2 - cm.t; ctx.drawImage(dot(b2.col || '#ffffff'), q2.x - 22, q2.y - 22, 44, 44);
    }
    flash *= 0.88;
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

  // ------------------------------------------------------------------ new payments (called by the stage): the row centres on her, one pulse each, then done()
  // returns false when the scene can't show it now (not on screen, calm, no cosmeticians): the stage then does its part at once
  function send(sales, done) {
    if (!box || !box.isConnected || !visible || document.hidden || calm() || !car.chips.length) return false;
    var m = model(); if (m) people(m);
    var i = 0;
    (function next() {
      var s = sales[i++]; if (!s) return;
      var id = s.performedBy || s.employeeId;
      if (!car.chips.some(function (c) { return c.id === id; })) id = car.chips[0].id;
      snapTo(id, function () {
        var cx = car.W / 2, c = null, bd = 1e9;
        car.chips.forEach(function (x) { if (x.id !== id) return; var d = Math.abs(car.x + x.l + x.w / 2 - cx); if (d < bd) { bd = d; c = x; } });
        if (c) { c.el.classList.remove('sx-p-hit'); void c.el.offsetWidth; c.el.classList.add('sx-p-hit'); }
        comets.push({ key: c ? c.k : -1, id: id, t: 0, done: done }); go();
        setTimeout(next, 900);
      });
    })();
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
