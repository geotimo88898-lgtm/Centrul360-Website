// Centrul360 portal, aspectul nou: Admin → Site (doar sub html.ui-nou, doar pentru admin).
// Site-ul, viu: cine e pe site chiar acum și pe ce pagină (punctele se mută când trec de la o pagină la alta), vizitele de azi
// oră cu oră și pe 30 de zile, ce a adus site-ul (formulare, programări online, din Pipeline), paginile cele mai văzute, de unde
// vin, telefon sau calculator, cât de repede se încarcă la ei, și sănătatea paginilor (răspuns, timp, mărime), cu istoric.
// Datele vin din /api/site-pulse (contorul fără cookie din /site-pulse.js); doar citește.
(function () {
  'use strict';
  var html = document.documentElement;
  if (!html.classList.contains('ui-nou')) return;
  var K = function () { return window.K; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ic = function (n) { return K() && K().icon ? K().icon(n) : ''; };
  var num = function (n) { return (Number(n) || 0).toLocaleString('ro-RO'); };
  var sec = function (ms) { return ms == null ? '-' : (ms / 1000).toLocaleString('ro-RO', { maximumFractionDigits: 1 }) + ' s'; };
  var pct = function (a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; };
  var NAV_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>';
  // the site, as the stations a visit goes through
  var ZONES = [
    { k: 'home', t: 'Acasă', re: /^\/(v2\/?)?(index)?$/ },
    { k: 'trat', t: 'Tratamente', re: /(grasime|celulita|tonifiere|detox|riduri|gusa|pete|ten-|epilare)/ },
    { k: 'rez', t: 'Rezultate și prețuri', re: /(rezultate|catalog|preturi|echipa|timisoara|arad)/ },
    { k: 'of', t: 'Oferte', re: /oferte/ },
    { k: 'prog', t: 'Programare', re: /(programare|multumesc|avans)/ }
  ];
  var zoneOf = function (p) { for (var i = 0; i < ZONES.length; i++) if (ZONES[i].re.test(p || '/')) return ZONES[i].k; return 'home'; };
  var NAMES = { '': 'Acasă', index: 'Acasă', 'grasime-localizata': 'Grăsime localizată', celulita: 'Celulită', 'tonifiere-musculara': 'Tonifiere musculară', 'detox-drenaj': 'Detox și drenaj',
    'riduri-linii-fine': 'Riduri și linii fine', 'gusa-barbie-dubla': 'Gușă și bărbie dublă', 'pete-pigmentare': 'Pete și pigmentare', 'ten-problematic': 'Ten problematic',
    'ten-lipsit-de-stralucire': 'Ten fără strălucire', 'epilare-laser': 'Epilare laser', oferte: 'Oferte', preturi: 'Prețuri', rezultate: 'Rezultate', 'catalog-rezultate': 'Catalog rezultate',
    echipa: 'Echipa', timisoara: 'Timișoara', arad: 'Arad', programare: 'Programare', multumesc: 'Mulțumim', 'multumesc-cadou': 'Mulțumim (cadou)', 'sitemap.xml': 'Sitemap', 'robots.txt': 'Robots',
    'api/offers-public': 'Ofertele (pentru site)' };
  var pageName = function (p) {
    p = String(p || '/');
    var v2 = /^\/v2(\/|$)/.test(p);
    var k = p.replace(/^\/v2/, '').replace(/^\//, '').replace(/\.html$/, '').replace(/\/$/, '');
    var n = NAMES[k] || k.replace(/-/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
    return v2 ? n + ' (site nou)' : n;
  };

  var panel = null, timer = 0, htimer = 0, S = { d: null, h: null, dots: {} };

  // ------------------------------------------------------------------ the menu entry and the page
  function addNav() {
    var nav = document.getElementById('tabsNav');
    if (!nav || nav.querySelector('[data-tab="site"]')) return;
    var ref = nav.querySelector('button[data-tab="reclame"]');
    var b = document.createElement('button');
    b.setAttribute('data-tab', 'site');
    b.className = 'admin-only' + (K() && K().data && K().data.isAdmin ? '' : ' hidden');
    b.setAttribute('data-label', 'Site');
    b.innerHTML = NAV_SVG + '<span class="c360-nav-label">Site</span>';
    if (ref) ref.parentNode.insertBefore(b, ref); else nav.appendChild(b);
    var main = document.querySelector('main');
    if (main && !document.getElementById('panel-site')) {
      var p = document.createElement('section');
      p.className = 'panel admin-only' + (K() && K().data && K().data.isAdmin ? '' : ' hidden');
      p.id = 'panel-site';
      main.appendChild(p);
    }
  }
  function syncRole() {
    var on = !!(K() && K().data && K().data.isAdmin);
    document.querySelectorAll('#tabsNav [data-tab="site"], #panel-site').forEach(function (el) { el.classList.toggle('hidden', !on); });
  }

  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'st2');
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Marketing</div><h2>Site</h2></div><div class="k-head-actions">' +
        '<a class="k-btn is-outline" href="https://www.centrul360.com/" target="_blank" rel="noopener">' + ic('globe') + 'Deschide site-ul</a>' +
        '<button type="button" class="k-btn is-accent" data-act="check">' + ic('refresh') + 'Verifică acum</button></div></div>' +
      '<section class="st2-globe" data-globe><div class="st2-globe-stage" data-gstage></div><div class="st2-globe-side"><div class="st2-globe-n"><span class="n-live-dot"></span><b data-gn>0</b><small>pe site acum</small></div><ol data-gplaces></ol></div></section>' +
      '<div data-body><div class="k-skel" style="height:260px;border-radius:28px"></div><div class="k-skel" style="height:120px;margin-top:1rem"></div></div>';
    panel.addEventListener('click', function (e) {
      if (e.target.closest('[data-act="check"]')) { health(true); stats(); }
    });
  }
  function show() {
    stats(); health(false);
    clearInterval(timer); clearInterval(htimer);
    timer = setInterval(function () { if (K().isActive('site') && !document.hidden) stats(); else clearInterval(timer); }, 15000);
    htimer = setInterval(function () { if (K().isActive('site') && !document.hidden) health(false); else clearInterval(htimer); }, 60000);
  }

  // ------------------------------------------------------------------ data
  function stats() {
    return K().api('/api/site-pulse?view=stats').then(function (d) { S.d = d; draw(); }, function (e) { S.err = K().errText ? K().errText(e) : 'Nu am putut citi site-ul.'; draw(); });
  }
  function health(btn) {
    var b = panel && panel.querySelector('[data-act="check"]');
    if (btn && b) b.classList.add('is-busy');
    return K().api('/api/site-pulse?view=health').then(function (h) { S.h = h; draw(); }, function () {}).then(function () { if (b) b.classList.remove('is-busy'); });
  }

  // ------------------------------------------------------------------ drawing
  function tile(icn, label, value, sub, cls) {
    return '<div class="k-stat st2-t ' + (cls || '') + '"><div class="k-stat-top"><span class="k-stat-ic">' + ic(icn) + '</span>' + esc(label) + '</div><div class="k-stat-value">' + value + '</div><div class="k-stat-sub">' + sub + '</div></div>';
  }
  function bars(list, total) {
    if (!list || !list.length) return '<p class="st2-none">Încă nimic.</p>';
    var max = Math.max.apply(null, list.map(function (x) { return x.n; }));
    return '<ol class="st2-bars">' + list.map(function (x, i) {
      return '<li style="--w:' + Math.max(4, Math.round(x.n / max * 100)) + '%;--i:' + i + '"><span>' + esc(x.label || x.k) + '</span><b>' + num(x.n) + '</b><i></i></li>';
    }).join('') + '</ol>';
  }
  function draw() {
    if (!panel) return;
    var body = panel.querySelector('[data-body]');
    var d = S.d, h = S.h;
    if (!d) { if (S.err) body.innerHTML = K().empty('alert', 'Nu am putut citi site-ul', esc(S.err)); return; }
    var t = d.today, w = d.week;
    var conv = pct(d.brought.week.forms + d.brought.week.books, w.visitors);
    var up = h && h.history && h.history.length ? Math.round(h.history.reduce(function (a, c) { return a + c.ok / c.n; }, 0) / h.history.length * 1000) / 10 : null;
    var key = JSON.stringify([d.today, d.week, d.brought, d.counting, h && h.check]);
    if (body.dataset.key !== key || !body.querySelector('.st2-live')) {
      body.dataset.key = key;
      body.innerHTML =
        // ---- live: the site's stations, a dot for every visitor on it now
        '<section class="st2-live">' +
          '<div class="st2-map">' + ZONES.map(function (z, i) { return '<div class="st2-zone" data-z="' + z.k + '" style="--i:' + i + '"><b>' + esc(z.t) + '</b><div class="st2-dots" data-dots></div><small data-zn>0</small></div>'; }).join('<i class="st2-path"></i>') + '</div>' +
          '<div class="st2-hours" aria-label="Vizitele de azi, pe ore">' + t.hours.map(function (v, i) {
            var mx = Math.max.apply(null, t.hours.concat([1]));
            return '<span style="--h:' + Math.max(3, Math.round(v / mx * 100)) + '%;--i:' + i + '" title="' + i + ':00 · ' + v + ' vizualizări"' + (i === new Date().getHours() ? ' class="is-now"' : '') + '></span>';
          }).join('') + '</div><div class="st2-hours-l"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div></section>' +
        // ---- the numbers
        '<div class="st2-kpis">' +
          tile('users', 'Vizitatori azi', '<span data-count="' + t.visitors + '">' + num(t.visitors) + '</span>', num(t.views) + ' pagini văzute', 'is-accent') +
          tile('trend', 'Vizitatori 7 zile', num(w.visitors), num(w.views) + ' pagini · ' + num(d.month.visitors) + ' în 30 de zile') +
          tile('file', 'Formulare de pe site', num(d.brought.week.forms), d.brought.today.forms + ' azi · ' + d.brought.month.forms + ' în 30 de zile', 'is-good') +
          tile('calendar', 'Programări online', num(d.brought.week.books), d.brought.today.books + ' azi · ' + d.brought.month.books + ' în 30 de zile', 'is-good') +
          tile('zap', 'Conversie 7 zile', conv.toLocaleString('ro-RO') + '%', 'formulare + programări din vizitatori') +
          tile('clock', 'Se încarcă în', sec(w.load), 'media la vizitatori, 7 zile', w.load && w.load > 4000 ? 'is-warn' : '') +
        '</div>' +
        // ---- 30 days
        '<section class="k-card st2-card"><div class="k-card-head"><h3>' + ic('trend') + 'Ultimele 30 de zile</h3></div><div data-chart></div></section>' +
        '<div class="st2-row">' +
          '<section class="k-card st2-card"><div class="k-card-head"><h3>' + ic('file') + 'Paginile cele mai văzute</h3><small>7 zile</small></div>' + bars(w.pages.map(function (x) { return { k: x.k, label: pageName(x.k), n: x.n }; })) + '</section>' +
          '<section class="k-card st2-card"><div class="k-card-head"><h3>' + ic('send') + 'De unde vin</h3><small>7 zile</small></div>' + bars(w.from) +
            '<div class="st2-dev">' + devSplit(w.dev) + '</div></section>' +
        '</div>' +
        // ---- health
        '<section class="k-card st2-card st2-health"><div class="k-card-head"><h3>' + ic('shield') + 'Sănătatea site-ului</h3><small>' + (h ? (h.check.ok === h.check.n ? 'Toate paginile răspund' : (h.check.n - h.check.ok) + ' pagini nu răspund') + ' · ' + (up != null ? up.toLocaleString('ro-RO') + '% disponibil în istoric' : '') : 'se verifică…') + '</small></div>' +
          (h ? '<div class="st2-checks">' + h.rows.map(function (r, i) {
            var ok = r.status >= 200 && r.status < 400;
            return '<div class="st2-check ' + (ok ? 'is-ok' : 'is-bad') + '" style="--i:' + i + '"><i></i><b>' + esc(pageName(r.p)) + '</b><span>' + (ok ? r.ms + ' ms · ' + r.kb.toLocaleString('ro-RO') + ' KB' : (r.err || 'cod ' + r.status)) + '</span></div>';
          }).join('') + '</div><div class="st2-spark" data-hspark></div>' : '<div class="k-skel" style="height:120px"></div>') +
        '</section>';
      var box = body.querySelector('[data-chart]');
      if (box) K().chart(box, {
        labels: d.days.map(function (x) { return K().dateShort ? K().dateShort(x.d) : x.d.slice(5); }), height: 220, axis: function (v) { return Math.round(v); },
        series: [
          { name: 'Vizitatori', values: d.days.map(function (x) { return x.visitors; }), color: 'var(--accent)' },
          { name: 'Formulare + programări', values: d.days.map(function (x) { return x.forms + x.books; }), color: 'var(--good)' }
        ]
      });
      var sp = body.querySelector('[data-hspark]');
      if (sp && h && h.history.length > 1 && K().spark) sp.innerHTML = '<small>Timpul de răspuns, ultimele verificări</small>' + K().spark(h.history.map(function (c) { return c.ms; }), { color: 'var(--accent)' });
    }
    live(d.live || []);
    globe(d);
  }
  function devSplit(dv) {
    var m = (dv && dv.m) || 0, c = (dv && dv.d) || 0, tot = m + c;
    if (!tot) return '';
    return '<div class="st2-split"><i style="--w:' + pct(m, tot) + '%"></i></div><div class="st2-split-l"><span><b>' + Math.round(pct(m, tot)) + '%</b> telefon</span><span><b>' + Math.round(pct(c, tot)) + '%</b> calculator</span></div>';
  }
  // the dots: one per visitor; a visitor who moved to another page glides there
  function live(list) {
    var map = panel.querySelector('.st2-map'); if (!map) return;
    var seen = {};
    var counts = {};
    list.forEach(function (v, i) {
      var id = (v.at + '|' + v.dev + '|' + (v.from || '') + '|' + i);
      var z = zoneOf(v.path);
      counts[z] = (counts[z] || 0) + 1;
      seen[id] = 1;
      var zone = map.querySelector('[data-z="' + z + '"] [data-dots]');
      var dot = S.dots[id];
      if (!dot || !dot.isConnected) {
        dot = document.createElement('i');
        dot.className = 'st2-dot is-new' + (v.dev === 'm' ? ' is-m' : '');
        dot.title = pageName(v.path) + (v.from ? ' · din ' + v.from : '');
        S.dots[id] = dot;
        zone.appendChild(dot);
        setTimeout(function () { dot.classList.remove('is-new'); }, 900);
      } else if (dot.parentNode !== zone) {
        // FLIP: from where it was to the new page, gliding
        var a = dot.getBoundingClientRect();
        zone.appendChild(dot);
        var b = dot.getBoundingClientRect();
        dot.animate([{ transform: 'translate(' + (a.left - b.left) + 'px,' + (a.top - b.top) + 'px)' }, { transform: 'none' }], { duration: 900, easing: 'cubic-bezier(.16,1,.3,1)' });
      }
    });
    Object.keys(S.dots).forEach(function (id) {
      if (seen[id]) return;
      var dt = S.dots[id]; delete S.dots[id];
      if (dt && dt.isConnected) { dt.classList.add('is-gone'); setTimeout(function () { dt.remove(); }, 600); }
    });
    map.querySelectorAll('.st2-zone').forEach(function (z) { var n = counts[z.dataset.z] || 0; z.querySelector('[data-zn]').textContent = n ? n + (n === 1 ? ' vizitator' : ' vizitatori') : ''; z.classList.toggle('is-on', !!n); });
    var n = panel.querySelector('[data-live-n]');
    if (n && n.textContent !== String(list.length)) { n.textContent = list.length; n.classList.remove('n-bump'); void n.offsetWidth; n.classList.add('n-bump'); }
  }

  // ------------------------------------------------------------------ the live globe (WebGL, three.js; the city Cloudflare gives each visit)
  var G = null, gload = null;
  var CLINICS = [{ t: 'Timișoara', la: 45.75, lo: 21.23 }, { t: 'Arad', la: 46.18, lo: 21.31 }];
  function three() {
    if (window.THREE) return Promise.resolve(window.THREE);
    if (gload) return gload;
    gload = new Promise(function (ok, no) { var sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'; sc.onload = function () { ok(window.THREE); }; sc.onerror = no; document.head.appendChild(sc); });
    return gload;
  }
  function globe(d) {
    var host = panel && panel.querySelector('[data-globe]'); if (!host) return;
    var live = (d.live || []);
    var places = {};
    live.forEach(function (v) { var g = v.geo; var k = g ? (g[1] || g[0]) + (g[1] ? ', ' + g[0] : '') : 'Fără locație'; places[k] = (places[k] || 0) + 1; });
    var top = Object.keys(places).map(function (k) { return [k, places[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6);
    var n = host.querySelector('[data-gn]');
    if (n.textContent !== String(live.length)) { n.textContent = live.length; n.classList.remove('n-bump'); void n.offsetWidth; n.classList.add('n-bump'); }
    host.querySelector('[data-gplaces]').innerHTML = top.map(function (x, i) { return '<li style="--i:' + i + '"><span>' + esc(x[0]) + '</span><b>' + x[1] + '</b></li>'; }).join('');
    if (G) { G.pins(live); return; }
    if (G === false) return;
    var hasGL = false; try { var c = document.createElement('canvas'); hasGL = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { /* none */ }
    if (!hasGL) { G = false; host.classList.add('is-flat'); return; }
    G = false;
    three().then(function (T) { G = makeGlobe(T, host.querySelector('[data-gstage]')); G.pins(live); }, function () { host.classList.add('is-flat'); });
  }
  function makeGlobe(T, stage) {
    var W = stage.clientWidth || 600, H = stage.clientHeight || 420;
    var r = new T.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(W < 500 ? 1.5 : 2, window.devicePixelRatio || 1)); r.setSize(W, H);
    stage.appendChild(r.domElement);
    var scene = new T.Scene(), cam = new T.PerspectiveCamera(32, W / H, 0.1, 100);
    cam.position.set(0, 0, W < 500 ? 9 : 7.6);
    var cs = getComputedStyle(document.documentElement);
    var ACC = new T.Color(cs.getPropertyValue('--accent').trim() || '#14a596'), FG = new T.Color(cs.getPropertyValue('--fg').trim() || '#0b0b0d');
    var dark = document.documentElement.getAttribute('data-theme') !== 'light';
    var R = 2;
    var vec = function (la, lo, rr) { var ph = (90 - la) * Math.PI / 180, th = (lo + 180) * Math.PI / 180, q = rr || R; return new T.Vector3(-q * Math.sin(ph) * Math.cos(th), q * Math.cos(ph), q * Math.sin(ph) * Math.sin(th)); };
    var world = new T.Group(); scene.add(world);
    world.add(new T.Mesh(new T.SphereGeometry(R * 0.995, 64, 48), new T.MeshBasicMaterial({ color: dark ? 0x0c1020 : 0xffffff, transparent: true, opacity: dark ? 0.9 : 0.85 })));
    var gtex = (function () { var c = document.createElement('canvas'); c.width = c.height = 128; var g = c.getContext('2d'); var rg = g.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(.3, 'rgba(255,255,255,.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c); })();
    var halo = new T.Sprite(new T.SpriteMaterial({ map: gtex, color: ACC, transparent: true, opacity: dark ? 0.55 : 0.35, depthWrite: false })); halo.scale.set(R * 3.3, R * 3.3, 1); scene.add(halo); halo.position.z = -1;
    // the land, as dots
    fetch('/portal-globe-land.json').then(function (x) { return x.json(); }).then(function (a) {
      var pos = new Float32Array(a.length / 2 * 3);
      for (var i = 0; i < a.length; i += 2) { var v = vec(a[i] / 10, a[i + 1] / 10, R * 1.002); pos[i / 2 * 3] = v.x; pos[i / 2 * 3 + 1] = v.y; pos[i / 2 * 3 + 2] = v.z; }
      var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
      world.add(new T.Points(g, new T.PointsMaterial({ color: dark ? 0x9aa4c4 : FG.clone().lerp(new T.Color(0xffffff), 0.55), size: 0.035, transparent: true, opacity: 0.9 })));
    }).catch(function () {});
    // the two clinics
    CLINICS.forEach(function (c) { var p = vec(c.la, c.lo, R * 1.01); var s = new T.Sprite(new T.SpriteMaterial({ map: gtex, color: ACC, transparent: true, depthWrite: false })); s.scale.set(0.42, 0.42, 1); s.position.copy(p); world.add(s); });
    // start on Romania, then a slow turn; a drag turns it by hand
    world.rotation.y = -(90 + 22) * Math.PI / 180; world.rotation.x = 40 * Math.PI / 180;
    var drag = null, spin = 0.0012, idle = 0;
    stage.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, ry: world.rotation.y, rx: world.rotation.x }; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', function (e) { if (!drag) return; world.rotation.y = drag.ry + (e.clientX - drag.x) * 0.008; world.rotation.x = Math.max(-1.2, Math.min(1.2, drag.rx + (e.clientY - drag.y) * 0.006)); idle = performance.now(); });
    stage.addEventListener('pointerup', function () { drag = null; });
    // the visitors: a pulsing pin each, an arc to the clinic for whoever is on Programare
    var pins = {};
    function pinsFor(list) {
      var seenK = {};
      list.forEach(function (v, i) {
        if (!v.geo || (!v.geo[2] && !v.geo[3])) return;
        var k = v.geo.join('|') + '|' + i; seenK[k] = 1;
        if (pins[k]) return;
        var p = vec(v.geo[2], v.geo[3], R * 1.012);
        var grp = new T.Group(); grp.position.copy(p); grp.lookAt(0, 0, 0);
        var dot = new T.Mesh(new T.CircleGeometry(0.045, 16), new T.MeshBasicMaterial({ color: 0xff5a6e, side: T.DoubleSide }));
        var ring = new T.Mesh(new T.RingGeometry(0.06, 0.075, 32), new T.MeshBasicMaterial({ color: 0xff5a6e, transparent: true, side: T.DoubleSide }));
        grp.add(dot); grp.add(ring);
        grp.userData = { ring: ring, t: Math.random() };
        world.add(grp);
        if (/programare|multumesc|avans/.test(v.path || '')) {
          var c = CLINICS[0], a = p.clone(), b = vec(c.la, c.lo, R * 1.01), mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R * (1.15 + a.distanceTo(b) * 0.25));
          var curve = new T.QuadraticBezierCurve3(a, mid, b);
          var arc = new T.Mesh(new T.TubeGeometry(curve, 40, 0.012, 6, false), new T.MeshBasicMaterial({ color: ACC, transparent: true, opacity: 0.85 }));
          var spark = new T.Sprite(new T.SpriteMaterial({ map: gtex, color: 0xffffff, transparent: true, depthWrite: false })); spark.scale.set(0.18, 0.18, 1);
          world.add(arc); world.add(spark);
          grp.userData.arc = arc; grp.userData.curve = curve; grp.userData.spark = spark;
        }
        pins[k] = grp;
      });
      Object.keys(pins).forEach(function (k) { if (seenK[k]) return; var g = pins[k]; world.remove(g); if (g.userData.arc) { world.remove(g.userData.arc); world.remove(g.userData.spark); } delete pins[k]; });
    }
    var visible = true, raf = 0;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) go(); }, { threshold: 0.02 }).observe(stage);
    function frame(now) {
      raf = 0;
      if (!stage.isConnected || !visible || document.hidden) return;
      if (!drag && now - idle > 2500) world.rotation.y += spin;
      Object.keys(pins).forEach(function (k) {
        var u = pins[k].userData; u.t = (u.t + 0.012) % 1;
        u.ring.scale.setScalar(1 + u.t * 3); u.ring.material.opacity = 1 - u.t;
        if (u.spark) u.curve.getPoint((now / 1600) % 1, u.spark.position);
      });
      r.render(scene, cam);
      raf = requestAnimationFrame(frame);
    }
    function go() { if (!raf) raf = requestAnimationFrame(frame); }
    go();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) go(); });
    addEventListener('resize', function () { W = stage.clientWidth || W; H = stage.clientHeight || H; r.setSize(W, H); cam.aspect = W / H; cam.updateProjectionMatrix(); }, { passive: true });
    return { pins: function (l) { pinsFor(l); go(); } };
  }

  // ------------------------------------------------------------------ wiring
  function start() {
    var k = K(); if (!k) return;
    addNav();
    k.section('site', { mount: mount, show: show });
    if (k.on) k.on('data', function () { addNav(); syncRole(); });
    syncRole();
    // a link straight to #site, opened before this page was there: open it now
    var t = setInterval(function () { if (k.data) { clearInterval(t); syncRole(); if (location.hash === '#site' && !k.isActive('site')) k.go('site'); } }, 200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
