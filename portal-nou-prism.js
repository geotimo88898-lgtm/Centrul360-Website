// Centrul360 portal, aspectul nou: scena de sus din Panou → KPI (doar sub html.ui-nou, doar admin).
// Ca la adminul Summit Lane, în WebGL (three.js r128, de pe cdnjs, încărcat doar când se deschide KPI):
// fiecare cosmeticiană care a încasat azi e o lumină; din ea pleacă raza ei (mai groasă cu cât a adus mai mult) spre o prismă
// de sticlă care se rotește încet; din prismă iese spectrul, în evantai, spre totalul zilei, care numără în sus.
// La o încasare nouă: un puls pleacă de la cosmeticiana care a făcut tratamentul, prisma se aprinde, totalul crește.
// Pe telefon, scena se înclină după cum ții telefonul (unde se poate fără întrebare); merge doar cât e pe ecran,
// fără WebGL rămâne o variantă simplă (aceleași cifre, desen plat). Doar desen: nu schimbă nimic din portal.
(function () {
  'use strict';
  var html = document.documentElement;
  if (!html.classList.contains('ui-nou')) return;
  var THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  var calm = function () { return html.classList.contains('c360-reduce') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var K = function () { return window.K; };
  var D = function () { return window.K && window.K.data; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var lei = function (n) { return K() && K().lei ? K().lei(n) : Math.round(n) + ' lei'; };
  var today = function () { return K() && K().today ? K().today() : new Date().toISOString().slice(0, 10); };
  var ini = function (n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); };
  var first = function (n) { return String(n || '').trim().split(/\s+/)[0]; };

  // ------------------------------------------------------------------ who brought what today
  function model() {
    var d = D(); if (!d) return null;
    var t = today();
    var emps = (d.admin && d.admin.employees) || d.activeEmployees || [];
    var name = function (id) { var e = emps.find(function (x) { return x.id === id; }); return e ? e.name : ''; };
    var city = function (id) { var e = emps.find(function (x) { return x.id === id; }); return e ? e.location : ''; };
    var inc = (d.incasari || []).filter(function (s) { return s.date === t; });
    var by = {};
    inc.forEach(function (s) {
      var id = s.performedBy || s.employeeId || 'x';
      if (!by[id]) by[id] = { id: id, name: name(id) || 'Echipa', city: city(id) || s.location || '', sum: 0, n: 0 };
      by[id].sum += Number(s.amount) || 0; by[id].n++;
    });
    // who works today without a payment yet still gets her (dim) light
    ((d.appointmentsToday && d.appointmentsToday.list) || []).forEach(function (a) {
      if (a.cosmeticianId && !by[a.cosmeticianId] && a.status !== 'anulata') by[a.cosmeticianId] = { id: a.cosmeticianId, name: a.cosmeticianName || name(a.cosmeticianId), city: a.location || city(a.cosmeticianId), sum: 0, n: 0 };
    });
    var list = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return (a.city || '').localeCompare(b.city || '') || b.sum - a.sum; });
    var total = inc.reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0);
    return { list: list.slice(0, 10), total: total, n: inc.length, ids: inc.map(function (s) { return s.id; }), inc: inc };
  }

  // ------------------------------------------------------------------ the block
  var box = null, three = null, S = null, shown = 0, seen = null;
  function loadThree() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (three) return three;
    three = new Promise(function (ok, no) { var s = document.createElement('script'); s.src = THREE_URL; s.async = true; s.onload = function () { ok(window.THREE); }; s.onerror = no; document.head.appendChild(s); });
    return three;
  }
  function hasGL() { try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }

  function mount(root) {
    box = document.createElement('section');
    box.className = 'n-p3';
    box.innerHTML = '<div class="n-p3-stage" data-stage></div>' +
      '<div class="n-p3-total"><small>Încasat azi</small><b data-total>0 lei</b><span data-sub></span></div>' +
      '<div class="n-p3-names" data-names></div>';
    var kr = root.querySelector('[data-kpi-root]');
    root.insertBefore(box, kr || null);
    var m = model();
    paintText(m, true);
    if (calm() || !hasGL()) { box.classList.add('is-flat'); flat(m); return; }
    loadThree().then(function (T) { if (box && box.isConnected) build(T, m); }, function () { box.classList.add('is-flat'); flat(m); });
  }
  function paintText(m, firstTime) {
    if (!box || !m) return;
    var el = box.querySelector('[data-total]');
    var from = firstTime ? 0 : shown; shown = m.total;
    var t0 = performance.now(), ms = firstTime ? 2200 : 1400;
    (function step(t) {
      var p = Math.min(1, (t - t0) / ms), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = lei(Math.round(from + (m.total - from) * e));
      if (p < 1 && !calm()) requestAnimationFrame(step); else el.textContent = lei(m.total);
    })(t0);
    box.querySelector('[data-sub]').textContent = m.n + (m.n === 1 ? ' încasare' : ' încasări') + ' · ' + m.list.filter(function (x) { return x.sum; }).length + ' cosmeticiene';
  }
  function flat(m) {
    box.querySelector('[data-stage]').innerHTML = '<div class="n-p3-flat">' + m.list.map(function (x) { return '<span style="--w:' + (m.total ? Math.max(6, Math.round(x.sum / m.total * 100)) : 6) + '%"><b>' + esc(first(x.name)) + '</b><em>' + esc(lei(x.sum)) + '</em><i></i></span>'; }).join('') + '</div>';
  }

  // ------------------------------------------------------------------ the 3D scene
  function build(T, m) {
    var stage = box.querySelector('[data-stage]');
    var W = stage.clientWidth || 800, H = stage.clientHeight || 380, phone = W < 640;
    var renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(phone ? 1.5 : 2, window.devicePixelRatio || 1));
    renderer.setSize(W, H);
    stage.appendChild(renderer.domElement);
    var scene = new T.Scene();
    var cam = new T.PerspectiveCamera(36, W / H, 0.1, 100);
    cam.position.set(0, 0.4, phone ? 15 : 12.5);
    var cs = getComputedStyle(html);
    var ACC = new T.Color(cs.getPropertyValue('--accent').trim() || '#14a596');
    var ACC2 = new T.Color(cs.getPropertyValue('--accent-2').trim() || '#5fd4c6');
    var dark = html.getAttribute('data-theme') !== 'light';
    // light adds up to white on a white page: there the lights are drawn normally, in colour
    var BL = dark ? T.AdditiveBlending : T.NormalBlending, WHITE = dark ? 0xffffff : ACC.getHex();
    var glowTex = (function () { var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d'); var r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c); })();
    var glow = function (col, s, o) { var sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: col, transparent: true, opacity: o == null ? 0.9 : o, blending: BL, depthWrite: false })); sp.scale.set(s, s, 1); return sp; };

    // the prism: glass (transparent faces, bright edges, a light inside)
    var prism = new T.Group();
    var geo = new T.CylinderGeometry(1.35, 1.35, 3.2, 3, 1);
    prism.add(new T.Mesh(geo, new T.MeshPhongMaterial({ color: dark ? 0x9fb4ff : 0xffffff, emissive: ACC.clone().multiplyScalar(0.25), specular: 0xffffff, shininess: 120, transparent: true, opacity: dark ? 0.22 : 0.35, side: T.DoubleSide, depthWrite: false })));
    prism.add(new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({ color: dark ? 0xffffff : ACC.getHex(), transparent: true, opacity: 0.95 })));
    var core = glow(ACC2, 3.2, 0.8); prism.add(core);
    prism.rotation.set(0.15, 0.3, Math.PI / 2 + 0.1);
    var px = phone ? 0.6 : 0.4;
    prism.position.set(px, 0, 0);
    scene.add(prism);
    scene.add(new T.AmbientLight(0xffffff, 0.7));
    var dl = new T.DirectionalLight(0xffffff, 1.1); dl.position.set(3, 5, 6); scene.add(dl);

    // the spectrum, out of the prism, fanning to the total (top right)
    var SPEC = [0xff5a6e, 0xffa24a, 0xffe066, 0x5ee39a, 0x4cc3ff, 0x7b6bff, 0xc06bff];
    var target = new T.Vector3(phone ? 2.6 : 5.6, phone ? -3.0 : 0.2, 0);
    var spec = SPEC.map(function (c, i) {
      var f = (i - 3) * (phone ? 0.16 : 0.22);
      var curve = new T.QuadraticBezierCurve3(new T.Vector3(px + 0.9, 0, 0), new T.Vector3(px + 2.4, f * 1.8, 0.2), new T.Vector3(target.x, target.y + f * 0.6, 0));
      var mesh = new T.Mesh(new T.TubeGeometry(curve, 40, 0.045, 6, false), new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, blending: BL, depthWrite: false }));
      scene.add(mesh);
      return mesh;
    });
    var flare = glow(WHITE, 2.4, 0.7); flare.position.copy(target); scene.add(flare);

    // the cosmeticians: a light each (a disc with her initials), her ray into the prism
    var tex = function (txt, col) {
      var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d');
      g.fillStyle = col; g.beginPath(); g.arc(64, 64, 58, 0, 6.283); g.fill();
      g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,.9)'; g.stroke();
      g.fillStyle = '#fff'; g.font = '700 46px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 64, 68);
      return new T.CanvasTexture(c);
    };
    var HUES = ['#4f8fd6', '#2bb3a3', '#c9a227', '#e0835a', '#e05a7a', '#8b6fd0', '#2f9d62', '#d97757', '#6fa8d6'];
    var hue = function (s) { var h = 0; String(s).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return HUES[h % HUES.length]; };
    var people = [];
    var n = m.list.length, max = Math.max.apply(null, m.list.map(function (x) { return x.sum; }).concat([1]));
    m.list.forEach(function (x, i) {
      var a = n === 1 ? 0 : (i / (n - 1) - 0.5);
      var pos = phone ? new T.Vector3(-2.45 + (i % 2) * 0.55, 3.3 - i * (5.2 / Math.max(1, n)), 0) : new T.Vector3(-5.6 + Math.abs(a) * 1.6, a * 5.6, (i % 2 ? -0.8 : 0.6));
      var col = new T.Color(hue(x.name));
      var node = new T.Sprite(new T.SpriteMaterial({ map: tex(ini(x.name), hue(x.name)), transparent: true }));
      node.scale.set(0.85, 0.85, 1); node.position.copy(pos); scene.add(node);
      var halo = glow(col, 1.8, x.sum ? 0.65 : 0.25); halo.position.copy(pos); scene.add(halo);
      var w = x.sum ? 0.02 + 0.07 * (x.sum / max) : 0.012;
      var curve = new T.QuadraticBezierCurve3(pos.clone(), new T.Vector3((pos.x + px) / 2, pos.y * 0.35 + 0.6, 0.5), new T.Vector3(px - 0.8, 0, 0));
      var ray = new T.Mesh(new T.TubeGeometry(curve, 48, w, 6, false), new T.MeshBasicMaterial({ color: col.clone().lerp(new T.Color(0xffffff), 0.35), transparent: true, opacity: x.sum ? 0.55 : 0.18, blending: BL, depthWrite: false }));
      scene.add(ray);
      // particles running along her ray: more when she brought more
      var count = x.sum ? 6 + Math.round(18 * x.sum / max) : 2;
      var pts = [];
      for (var k = 0; k < count; k++) { var sp = glow(col.clone().lerp(new T.Color(0xffffff), 0.5), 0.32, 0.9); sp.userData.t = k / count; scene.add(sp); pts.push(sp); }
      people.push({ x: x, pos: pos, node: node, halo: halo, ray: ray, curve: curve, pts: pts, speed: 0.12 + 0.25 * (x.sum / max), pulse: 0 });
    });
    // names, as quiet HTML labels next to the lights
    var names = box.querySelector('[data-names]');
    names.innerHTML = people.map(function (p) { return '<span>' + esc(first(p.x.name)) + '<em>' + esc(lei(p.x.sum)) + '</em></span>'; }).join('');
    var labels = names.querySelectorAll('span');

    // a field of slow dust, for depth
    var dust = new T.BufferGeometry(), N = phone ? 120 : 260, arr = new Float32Array(N * 3);
    for (var q = 0; q < N; q++) { arr[q * 3] = (Math.random() - 0.5) * 22; arr[q * 3 + 1] = (Math.random() - 0.5) * 10; arr[q * 3 + 2] = (Math.random() - 0.5) * 8 - 2; }
    dust.setAttribute('position', new T.BufferAttribute(arr, 3));
    var dustP = new T.Points(dust, new T.PointsMaterial({ color: ACC2, size: 0.05, transparent: true, opacity: dark ? 0.6 : 0.4, depthWrite: false }));
    scene.add(dustP);

    // the pointer (or the phone's tilt) moves the camera a little
    var aim = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
    box.addEventListener('pointermove', function (e) { var r = box.getBoundingClientRect(); aim.x = (e.clientX - r.left) / r.width - 0.5; aim.y = (e.clientY - r.top) / r.height - 0.5; }, { passive: true });
    window.addEventListener('deviceorientation', function (e) { if (e.gamma == null) return; aim.x = Math.max(-0.5, Math.min(0.5, e.gamma / 60)); aim.y = Math.max(-0.5, Math.min(0.5, (e.beta - 45) / 90)); }, { passive: true });

    var visible = true, flash = 0, raf = 0, t0 = performance.now();
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) go(); }, { threshold: 0.02 }).observe(box);
    var v = new T.Vector3();
    function frame(now) {
      raf = 0;
      if (!box.isConnected || !visible || document.hidden) return;
      var t = (now - t0) / 1000;
      cur.x += (aim.x - cur.x) * 0.05; cur.y += (aim.y - cur.y) * 0.05;
      cam.position.x = cur.x * 2.2; cam.position.y = 0.4 - cur.y * 1.4; cam.lookAt(0.6, 0, 0);
      prism.rotation.y = 0.3 + t * 0.35;
      prism.rotation.x = 0.15 + Math.sin(t * 0.6) * 0.12;
      flash *= 0.94;
      core.material.opacity = 0.55 + 0.25 * Math.sin(t * 2) + flash;
      core.scale.setScalar(3.2 + flash * 3);
      spec.forEach(function (s, i) { s.material.opacity = 0.45 + 0.35 * Math.sin(t * 2.2 + i * 0.7) + flash * 0.5; });
      flare.material.opacity = 0.5 + 0.2 * Math.sin(t * 3) + flash;
      flare.scale.setScalar(2.4 + flash * 4);
      people.forEach(function (p, i) {
        p.pulse *= 0.93;
        p.node.scale.setScalar(0.85 + 0.05 * Math.sin(t * 2 + i) + p.pulse * 0.6);
        p.halo.material.opacity = (p.x.sum ? 0.55 : 0.2) + 0.15 * Math.sin(t * 1.7 + i) + p.pulse;
        p.ray.material.opacity = (p.x.sum ? 0.45 : 0.15) + p.pulse * 0.6;
        p.pts.forEach(function (sp) {
          sp.userData.t = (sp.userData.t + p.speed * 0.016 * (1 + p.pulse * 6)) % 1;
          p.curve.getPoint(sp.userData.t, sp.position);
          sp.material.opacity = Math.sin(sp.userData.t * Math.PI) * (0.6 + p.pulse);
          sp.scale.setScalar(0.3 + p.pulse * 0.5);
        });
        // her label follows her light on screen
        v.copy(p.pos); v.project(cam);
        if (labels[i]) labels[i].style.transform = 'translate(' + Math.round((v.x * 0.5 + 0.5) * W + 26) + 'px,' + Math.round((-v.y * 0.5 + 0.5) * H - 10) + 'px)';
      });
      dustP.rotation.y = t * 0.02;
      renderer.render(scene, cam);
      raf = requestAnimationFrame(frame);
    }
    function go() { if (!raf) raf = requestAnimationFrame(frame); }
    go();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) go(); });
    window.addEventListener('resize', function () {
      W = stage.clientWidth || W; H = stage.clientHeight || H;
      renderer.setSize(W, H); cam.aspect = W / H; cam.updateProjectionMatrix();
    }, { passive: true });
    S = {
      pay: function (s) {
        var id = s.performedBy || s.employeeId;
        var p = people.find(function (x) { return x.x.id === id; }) || people[0];
        if (p) p.pulse = 1;
        setTimeout(function () { flash = 0.9; }, 700);
      }
    };
  }

  // ------------------------------------------------------------------ data: a new payment pulses from her light
  function onData() {
    var m = model(); if (!m) return;
    if (seen === null) { seen = new Set(m.ids); return; }
    var fresh = m.inc.filter(function (s) { return !seen.has(s.id); });
    m.ids.forEach(function (x) { seen.add(x); });
    if (!fresh.length || !box || !box.isConnected) return;
    fresh.forEach(function (s, i) { setTimeout(function () { if (S) S.pay(s); }, i * 600); });
    setTimeout(function () { paintText(m, false); var el = box.querySelector('[data-names]'); if (el && S) { /* names update with the next opening */ } }, 900);
  }

  // ------------------------------------------------------------------ wiring: when the Panou shows KPI
  function place() {
    var d = D(); if (!d || !d.isAdmin) return;
    var root = document.querySelector('#panel-panou .db-root');
    var kr = root && root.querySelector('[data-kpi-root]');
    if (!kr) { if (box && !box.isConnected) box = null; return; }
    if (box && box.isConnected) return;
    mount(root);
  }
  function start() {
    var k = K(); if (!k) return;
    var panel = document.getElementById('panel-panou');
    if (panel) new MutationObserver(function () { place(); }).observe(panel, { childList: true, subtree: true });
    if (k.on) k.on('data', function () { setTimeout(function () { place(); onData(); }, 120); });
    var t = setInterval(function () { if (D()) { clearInterval(t); place(); onData(); } }, 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
