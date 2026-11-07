// Centrul360 portal, aspectul nou: mișcarea și mascotele (doar sub html.ui-nou, altfel nu face nimic).
// Nimic de aici nu schimbă ce face portalul: doar ascultă (datele, clicurile) și desenează deasupra.
//  - Panou: Nuki în hero, cu replica potrivită zilei (leaduri de sunat, aprobări, programări) și banda live a zilei.
//  - Cardurile cu cifre: lumina care urmărește mouse-ul și o înclinare fină; cele „fierbinți” cu un inel care se rotește.
//  - Confetti și Jerry la o încasare nouă; o mică explozie la fiecare veste bună (toast de succes).
//  - Nuki mic lângă titlul fiecărei secțiuni (apasă-l: îți spune ceva util); Jerry apare din colț, rar, cu un sfat.
//  - Unda la apăsare pe butoane, graficele care se desenează. Doar transform / opacity; liniște pentru „mai puțină mișcare”.
(function () {
  'use strict';
  var html = document.documentElement;
  if (!html.classList.contains('ui-nou')) return;
  var POSE = '/brand_asset/mascota/ipostaze/';
  var JERRY = '/brand_asset/mascota/soricel/ipostaze/';
  var calm = function () { return html.classList.contains('c360-reduce') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var fine = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
  var phone = function () { return window.innerWidth <= 720; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var K = function () { return window.K; };
  var D = function () { return window.K && window.K.data; };
  var lei = function (n) { return (window.K && K().lei) ? K().lei(n) : Math.round(n) + ' lei'; };
  var today = function () { return (window.K && K().today) ? K().today() : new Date().toISOString().slice(0, 10); };
  var badgeOf = function (tab) { var b = document.querySelector('#tabsNav button[data-tab="' + tab + '"] .k-nav-badge'); return b ? (parseInt(b.textContent, 10) || 0) : 0; };
  var first = function (n) { return String(n || '').trim().split(/\s+/)[0]; };
  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };

  // ================================================================ confetti (one canvas, only while it falls)
  var COLORS = function () {
    var cs = getComputedStyle(html);
    return [cs.getPropertyValue('--accent').trim() || '#14a596', cs.getPropertyValue('--accent-2').trim() || '#5fd4c6', '#ffc94d', '#ff8fb1', '#ffffff'];
  };
  var cv = null, parts = [], raf = 0;
  function confetti(x, y, n, spread) {
    if (calm()) return;
    if (!cv) {
      cv = document.createElement('canvas');
      cv.className = 'n-confetti';
      document.body.appendChild(cv);
    }
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== innerWidth * dpr) { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; }
    var col = COLORS();
    for (var i = 0; i < n; i++) {
      var a = (spread ? -Math.PI / 2 + (Math.random() - .5) * spread : Math.random() * Math.PI * 2);
      var v = (spread ? 7 + Math.random() * 9 : 3 + Math.random() * 6) * dpr;
      parts.push({ x: x * dpr, y: y * dpr, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: (3 + Math.random() * 4) * dpr, c: col[i % col.length], t: 0, life: 70 + Math.random() * 50, rot: Math.random() * 6, vr: (Math.random() - .5) * .4, sq: Math.random() < .5 });
    }
    if (!raf) raf = requestAnimationFrame(step);
  }
  function step() {
    var c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    parts = parts.filter(function (p) { return p.t < p.life; });
    parts.forEach(function (p) {
      p.t++; p.vy += .32; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      c.globalAlpha = Math.max(0, 1 - p.t / p.life);
      c.fillStyle = p.c;
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      if (p.sq) c.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); else { c.beginPath(); c.arc(0, 0, p.r / 1.4, 0, 6.3); c.fill(); }
      c.restore();
    });
    if (parts.length) raf = requestAnimationFrame(step);
    else { raf = 0; cv.remove(); cv = null; }
  }
  window.C360Fx = { confetti: confetti };

  // ================================================================ a speech bubble (Nuki / Jerry)
  function say(host, text, ms) {
    var b = host.querySelector('.n-say');
    if (!b) { b = document.createElement('span'); b.className = 'n-say'; host.appendChild(b); }
    b.innerHTML = text;
    b.classList.remove('in');
    void b.offsetWidth;
    b.classList.add('in');
    clearTimeout(b._t);
    b._t = setTimeout(function () { b.classList.remove('in'); }, ms || 5200);
  }
  function boing(el) { el.classList.remove('n-boing'); void el.offsetWidth; el.classList.add('n-boing'); }

  // ================================================================ PANOU: Nuki in the hero
  // what the day looks like, in one line, with the pose that goes with it
  function moodLines() {
    var d = D(); if (!d) return [{ pose: 'salut-pa', t: 'Salut! Sunt aici dacă ai nevoie.' }];
    var out = [];
    var h = new Date().getHours();
    var call = badgeOf('pipeline'), appr = badgeOf('aprobari'), msg = d.waUnread || 0;
    var appts = ((d.appointmentsToday && d.appointmentsToday.list) || []).filter(function (a) { return a.status !== 'anulata'; });
    var mine = d.me && d.me.role === 'cosmetician' ? appts.filter(function (a) { return a.cosmeticianId === d.me.id; }) : appts;
    var inc = (d.incasari || []).filter(function (s) { return s.date === today(); });
    var sum = inc.reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0);
    var next = mine.filter(function (a) { return a.status !== 'finalizata' && a.time && a.time >= (('0' + h).slice(-2) + ':' + ('0' + new Date().getMinutes()).slice(-2)); }).sort(function (a, b) { return a.time < b.time ? -1 : 1; })[0];
    if (h < 10) out.push({ pose: 'salut-pa', t: '<b>Bună dimineața!</b> Cafeaua e gata? Azi avem ' + mine.length + (mine.length === 1 ? ' programare.' : ' programări.') });
    if (call) out.push({ pose: 'telefon', t: '<b>' + call + (call === 1 ? ' lead de sunat' : ' leaduri de sunat') + '</b> acum. Hai să le prindem cât sunt calde!' });
    if (appr) out.push({ pose: 'aprobare', t: '<b>' + appr + ' aprobări</b> te așteaptă. Un clic și sunt gata.' });
    if (msg) out.push({ pose: 'telefon', t: '<b>' + msg + (msg === 1 ? ' conversație necitită' : ' conversații necitite') + '</b> în Mesaje.' });
    if (next) out.push({ pose: 'calendar', t: 'Următoarea: <b>' + esc(next.time) + '</b>, ' + esc(next.treatment || 'programare') + '.' });
    if (sum) out.push({ pose: 'bucurie', t: 'Azi s-au încasat deja <b>' + esc(lei(sum)) + '</b>. Super!' });
    if (!out.length) out.push({ pose: 'prezinta', t: 'Totul e la zi. Respiră, e o zi frumoasă.' });
    out.push({ pose: 'mana-inima', t: 'Mulțumesc că ai grijă de cliente. Se vede.' });
    return out;
  }
  function heroNuki(hero) {
    hero.setAttribute('data-nk', '1');
    var lines = moodLines(), i = 0;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'n-hn';
    b.setAttribute('aria-label', 'Nuki');
    b.innerHTML = '<span class="n-hn-fl"><img alt="" decoding="async" src="' + POSE + lines[0].pose + '.webp"></span>';
    hero.appendChild(b);
    var img = b.querySelector('img');
    var show = function () {
      var l = lines[i % lines.length];
      if (img.getAttribute('src').indexOf(l.pose) < 0) { img.classList.add('n-swap'); setTimeout(function () { img.src = POSE + l.pose + '.webp'; img.classList.remove('n-swap'); }, 180); }
      say(b, l.t, 6500);
    };
    b.addEventListener('click', function (e) { e.stopPropagation(); i++; lines = moodLines(); boing(b); show(); confetti(e.clientX, e.clientY, 14); });
    setTimeout(show, 1100);
  }

  // ================================================================ PANOU: the day, live, as a moving band
  function tickerItems() {
    var d = D(); if (!d) return [];
    var out = [];
    var t = today();
    (d.incasari || []).filter(function (s) { return s.date === t; }).slice(-8).reverse().forEach(function (s) {
      out.push('<i class="is-pay"></i><b>+' + esc(lei(Number(s.amount) || 0)) + '</b> ' + esc(first(s.client)) + (s.treatment ? ' · ' + esc(s.treatment) : ''));
    });
    ((d.appointmentsToday && d.appointmentsToday.list) || []).filter(function (a) { return a.status !== 'anulata' && a.status !== 'finalizata'; }).slice(0, 8).forEach(function (a) {
      out.push('<i class="is-cal"></i><b>' + esc(a.time || '') + '</b> ' + esc(first(a.clientName)) + (a.treatment ? ' · ' + esc(a.treatment) : '') + (a.location ? ' · ' + esc(a.location) : ''));
    });
    var call = badgeOf('pipeline'); if (call) out.push('<i class="is-hot"></i><b>' + call + '</b> leaduri de sunat');
    if (d.waUnread) out.push('<i class="is-msg"></i><b>' + d.waUnread + '</b> conversații necitite');
    return out;
  }
  function ticker(hero) {
    var items = tickerItems();
    var key = items.join('|');
    var t = hero.querySelector('.n-tick');
    if (!items.length) { if (t) t.remove(); hero.classList.remove('has-tick'); return; }
    if (t && t.dataset.key === key) return;
    if (!t) { t = document.createElement('div'); t.className = 'n-tick'; t.setAttribute('aria-hidden', 'true'); hero.appendChild(t); hero.classList.add('has-tick'); }
    t.dataset.key = key;
    var row = '<span>' + items.map(function (x) { return '<em>' + x + '</em>'; }).join('') + '</span>';
    t.innerHTML = '<div class="n-tick-in" style="--n-dur:' + Math.max(18, items.length * 5) + 's">' + row + row + '</div>';
  }

  // ================================================================ celebrations: a new payment, live
  var seen = null;
  function watchData() {
    var d = D(); if (!d) return;
    var t = today();
    var inc = (d.incasari || []).filter(function (s) { return s.date === t; });
    var ids = inc.map(function (s) { return s.id; });
    if (seen === null) { seen = new Set(ids); return; }
    var fresh = inc.filter(function (s) { return !seen.has(s.id); });
    ids.forEach(function (x) { seen.add(x); });
    if (!fresh.length) return;
    var sum = fresh.reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0);
    confetti(innerWidth / 2, innerHeight * .32, 130, Math.PI * 1.1);
    jerryRun('<b>Ka-ching!</b> +' + esc(lei(sum)));
    document.querySelectorAll('.db-hero').forEach(function (h) { h.classList.remove('n-glow'); void h.offsetWidth; h.classList.add('n-glow'); });
  }

  // ================================================================ Jerry: runs across with the good news
  function jerryRun(text) {
    if (calm()) return;
    var j = document.createElement('div');
    j.className = 'n-jrun';
    j.innerHTML = '<img alt="" src="' + JERRY + 'bucurie.webp"><span class="n-say in">' + text + '</span>';
    document.body.appendChild(j);
    setTimeout(function () { j.remove(); }, 4200);
  }

  // ================================================================ Jerry peeks from the corner, now and then, with a tip
  var TIPS = [
    'Psst… <b>Ctrl K</b> găsește orice: o clientă, un lead, o pagină.',
    'Pe telefon, trage pagina în jos și se reîncarcă tot.',
    'În Pipeline poți <b>trage cardurile</b> dintr-o coloană în alta.',
    '<b>Alt + 1…9</b> te duce direct la secțiuni.',
    'Apasă pe Nuki din Panou, are mereu ceva de zis.',
    'Un clopoțel cu număr? Acolo sunt noutățile tale.',
    'Ce bine arăți azi! Bine, nu văd, dar sigur e adevărat.'
  ];
  var lastInput = Date.now(), lastPeek = Date.now() - 60e3, tipI = Math.floor(Math.random() * TIPS.length);
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (ev) { addEventListener(ev, function () { lastInput = Date.now(); }, { passive: true, capture: true }); });
  function busy() { return document.hidden || !!document.querySelector('.k-drawer-root.is-open, .c360-dialog-root, .c360-palette-root, .k-menu, .pl-drawer-root.is-open, .n-jpeek, .n-hello') || html.classList.contains('gm-on') || html.classList.contains('c360-mnav-open'); }
  function peek() {
    if (calm() || busy() || Date.now() - lastInput < 15e3 || Date.now() - lastPeek < 4 * 60e3) return;
    lastPeek = Date.now();
    var j = document.createElement('button');
    j.type = 'button';
    j.className = 'n-jpeek';
    j.setAttribute('aria-label', 'Jerry');
    j.innerHTML = '<img alt="" src="' + JERRY + 'arata.webp"><span class="n-say">' + TIPS[tipI++ % TIPS.length] + '</span>';
    document.body.appendChild(j);
    requestAnimationFrame(function () { requestAnimationFrame(function () { j.classList.add('in'); setTimeout(function () { j.querySelector('.n-say').classList.add('in'); }, 600); }); });
    var gone = false;
    var hide = function () { if (gone) return; gone = true; j.classList.remove('in'); j.classList.add('out'); setTimeout(function () { j.remove(); }, 700); };
    j.addEventListener('click', function (e) { j.querySelector('img').src = JERRY + 'bucurie.webp'; boing(j); confetti(e.clientX, e.clientY, 18); setTimeout(hide, 650); });
    setTimeout(hide, 9000);
  }
  setInterval(peek, 20e3);

  // ================================================================ a small Nuki by every section's title
  var SEC = {
    programari: ['calendar', 'Apasă pe o oră liberă și faci o programare pe loc.'],
    mesaje: ['telefon', 'Răspunde repede: clientele iubesc asta.'],
    incasari: ['cadou', 'Fiecare încasare aici e o clientă fericită.'],
    pipeline: ['receptie', 'Sună întâi leadurile proaspete, sunt cele mai calde.'],
    contacte: ['fisa', 'Pozele înainte / după stau în fișa clientei.'],
    automatizari: ['aprobare', 'Bifează ce ai făcut: lista se golește singură.'],
    comision: ['bucurie', 'Fiecare upsell aprobat urcă aici.'],
    traininguri: ['prezinta', 'Câte un capitol pe zi și ești expertă.'],
    fise: ['fisa', 'Fișele se printează curat, direct din browser.'],
    calculator: ['centimetru', 'Alegi tratamentul, eu fac socoteala.'],
    condica: ['liniste', 'Pontezi sosirea și plecarea, restul e automat.'],
    ofertele: ['cadou', 'Ofertele active, cu prețurile la zi.'],
    aprobari: ['aprobare', 'Aprobă tot dintr-o apăsare, sus în dreapta.'],
    activitate: ['oglinda', 'Tot ce s-a schimbat, cine și când.'],
    angajati: ['mana-inima', 'Echipa ta, salariile și condica, într-un loc.'],
    fluxuri: ['gandeste', 'Automatizările lucrează și când dormi.'],
    integrari: ['gandeste', 'Verde înseamnă conectat. Restul așteaptă un clic.'],
    oferte: ['cadou', 'O ofertă nouă apare pe site imediat.'],
    reclame: ['aparat-foto', 'Reclamele bune încep cu o poză bună.']
  };
  function secNuki(h2) {
    var p = h2.closest('.panel'); if (!p) return;
    var id = p.id.replace('panel-', ''), s = SEC[id];
    h2.setAttribute('data-nk', '1');
    if (!s) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'n-sn';
    b.setAttribute('aria-label', 'Nuki');
    b.innerHTML = '<img alt="" decoding="async" src="' + POSE + s[0] + '.webp">';
    b.addEventListener('click', function (e) { e.stopPropagation(); boing(b); say(b, s[1], 4500); confetti(e.clientX, e.clientY, 10); });
    h2.appendChild(b);
  }

  // ================================================================ the cards: light under the mouse, a fine tilt
  var spot = null, sx = 0, sy = 0, sraf = 0;
  if (fine) {
    document.addEventListener('pointermove', function (e) {
      var el = e.target.closest && e.target.closest('main .k-stat, main .pl-stat, main .card, main .k-card, main .tr-door, main .of-card');
      if (spot && spot !== el) { spot.classList.remove('n-spot'); spot.style.removeProperty('--n-rx'); spot.style.removeProperty('--n-ry'); }
      spot = el;
      if (!el || calm()) return;
      sx = e.clientX; sy = e.clientY;
      if (!sraf) sraf = requestAnimationFrame(function () {
        sraf = 0;
        if (!spot) return;
        var r = spot.getBoundingClientRect();
        var px = (sx - r.left) / r.width, py = (sy - r.top) / r.height;
        spot.style.setProperty('--n-mx', (px * 100).toFixed(1) + '%');
        spot.style.setProperty('--n-my', (py * 100).toFixed(1) + '%');
        if (spot.matches('.k-stat, .pl-stat')) { spot.style.setProperty('--n-rx', ((.5 - py) * 7).toFixed(2) + 'deg'); spot.style.setProperty('--n-ry', ((px - .5) * 9).toFixed(2) + 'deg'); }
        spot.classList.add('n-spot');
      });
    }, { passive: true });
  }

  // ================================================================ a ripple where the finger lands
  document.addEventListener('pointerdown', function (e) {
    if (calm()) return;
    var b = e.target.closest && e.target.closest('.k-btn, .pl-btn, .k-chip, .pl-chip, .c360-tabbar button, nav.tabs button, .k-seg button, .ct-row, .mx-row, .pl-card');
    if (!b || b.disabled) return;
    var r = b.getBoundingClientRect();
    var w = document.createElement('span');
    w.className = 'n-rip-w';
    var d = Math.max(r.width, r.height) * 2.2;
    w.innerHTML = '<i style="width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px"></i>';
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    b.appendChild(w);
    setTimeout(function () { w.remove(); }, 650);
  }, { passive: true, capture: true });

  // ================================================================ good news from anywhere: a small burst at the toast
  function toastBurst(t) {
    if (!t.classList.contains('is-success') || t.dataset.fx) return;
    t.dataset.fx = '1';
    setTimeout(function () { var r = t.getBoundingClientRect(); if (r.width) confetti(r.left + 26, r.top + r.height / 2, 26); }, 120);
  }

  // ================================================================ charts draw themselves in
  function drawChart(svg) {
    svg.setAttribute('data-nk', '1');
    if (calm()) return;
    svg.querySelectorAll('path, polyline').forEach(function (p, i) {
      var fill = getComputedStyle(p).fill;
      if (fill && fill !== 'none' && fill !== 'rgba(0, 0, 0, 0)') { p.classList.add('n-fadein'); return; }
      p.setAttribute('pathLength', '1');
      p.style.strokeDasharray = '1';
      p.style.strokeDashoffset = '1';
      p.style.animation = 'n-draw 1.4s var(--e) ' + (i * 0.12).toFixed(2) + 's forwards';
    });
  }

  // ================================================================ wiring
  function scan(root) {
    if (!root.querySelectorAll) return;
    var q = function (sel, fn) { if (root.matches && root.matches(sel)) fn(root); root.querySelectorAll(sel).forEach(fn); };
    q('.db-hero:not([data-nk])', heroNuki);
    q('.panel .k-head h2:not([data-nk]), .panel .pl-head h2:not([data-nk])', secNuki);
    q('.c360-toast.is-success:not([data-fx])', toastBurst);
    q('.k-chart svg:not([data-nk]), .kp svg:not([data-nk])', drawChart);
  }
  var queue = [], tick = 0;
  new MutationObserver(function (list) {
    list.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) queue.push(n); }); });
    if (tick) return;
    tick = requestAnimationFrame(function () {
      tick = 0;
      var q = queue; queue = [];
      q.forEach(function (n) { if (n.isConnected) scan(n); });
      document.querySelectorAll('.db-hero').forEach(ticker);
    });
  }).observe(document.body, { childList: true, subtree: true });
  function start() {
    scan(document.body);
    var k = K();
    watchData();
    if (k && k.on) { k.on('data', function () { setTimeout(function () { watchData(); document.querySelectorAll('.db-hero').forEach(ticker); }, 60); }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
