// Centrul360 portal, aspectul nou (previzualizare). Pornit doar cu ?ui=nou (ținut în localStorage c360_ui; ?ui=vechi îl oprește).
// Fără comutator nu face nimic. Nu schimbă logica portalului: doar pune logo-ul adevărat, comutatorul înapoi în meniul
// avatarului și mascotele (Nuki și Jerry, prietenul lui), câte o replică, în momentul potrivit, fără aglomerație.
(function () {
  'use strict';
  var html = document.documentElement;
  if (!html.classList.contains('ui-nou')) return;

  var POSE = '/brand_asset/mascota/ipostaze/';
  var JERRY = '/brand_asset/mascota/soricel/ipostaze/';
  var MARK = '<svg class="mk" viewBox="130 130 550 550" aria-hidden="true" fill="none" stroke="currentColor">' +
    '<circle class="ring" cx="405" cy="405" r="262" stroke-width="1.6" vector-effect="non-scaling-stroke" pathLength="100"/>' +
    '<ellipse class="ev" cx="405" cy="405" rx="104" ry="207" stroke-width="1.6" vector-effect="non-scaling-stroke"/>' +
    '<ellipse class="eh" cx="405" cy="405" rx="207" ry="113" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>';
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  };
  var reduce = function () { return html.classList.contains('c360-reduce') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // ------------------------------------------------------------------ the real logo: the ring and the two crossed ellipses
  function brand() {
    var b = document.querySelector('header.topbar .brand');
    if (!b || b.querySelector('.n-brand') || !b.querySelector('.brand-logo')) return false;
    var a = document.createElement('button');
    a.type = 'button';
    a.className = 'n-brand';
    a.setAttribute('aria-label', 'Centrul360, Panou');
    a.innerHTML = MARK + '<span class="wm">CENTRUL360<span>.COM</span></span>';
    a.addEventListener('click', function () { var p = document.querySelector('#tabsNav button[data-tab="panou"]'); if (p) p.click(); });
    var pic = b.querySelector('picture') || b.querySelector('.brand-logo');
    pic.parentNode.insertBefore(a, pic.nextSibling);
    return true;
  }

  // ------------------------------------------------------------------ the way back (avatar menu)
  function addSwitch(menu) {
    if (!menu || menu.querySelector('.n-ui-sw')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'k-menu-item n-ui-sw';
    b.innerHTML = '<svg class="k-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>Înapoi la aspectul vechi';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      try { localStorage.removeItem('c360_ui'); } catch (x) { /* storage off */ }
      location.reload();
    });
    var logout = menu.querySelector('[data-act="logout"]');
    menu.insertBefore(b, logout || null);
  }

  // ------------------------------------------------------------------ Nuki in the empty states
  // the right pose for what is empty: an empty calendar, no messages, nothing to approve, ...
  function poseFor(el) {
    var p = el.closest('.panel');
    var id = p ? p.id.replace('panel-', '') : '';
    var t = (el.textContent || '').toLowerCase();
    if (/eroare|nu am putut|nu s-a putut/.test(t)) return { src: POSE + 'gandeste.webp' };
    if (/caut|găsit|rezultat/.test(t)) return { src: POSE + 'gandeste.webp' };
    if (/aprob|gata|totul|la zi|nimic de/.test(t) || id === 'aprobari') return { src: POSE + 'aprobare.webp' };
    if (id === 'programari' || /programăr|calendar/.test(t)) return { src: POSE + 'calendar.webp' };
    if (id === 'mesaje' || /mesaj|conversa/.test(t)) return { src: POSE + 'telefon.webp' };
    if (id === 'pipeline' || /lead|apel/.test(t)) return { src: POSE + 'receptie.webp' };
    if (id === 'incasari' || id === 'comision' || /încas|plăți|bani/.test(t)) return { src: POSE + 'cadou.webp' };
    if (id === 'contacte' || /client|contact/.test(t)) return { src: POSE + 'fisa.webp' };
    if (id === 'traininguri' || id === 'fise') return { src: POSE + 'prezinta.webp' };
    if (id === 'condica') return { src: POSE + 'liniste.webp' };
    if (id === 'activitate') return { src: POSE + 'oglinda.webp' };
    if (id === 'oferte' || id === 'ofertele') return { src: POSE + 'cadou.webp' };
    if (id === 'automatizari' || id === 'fluxuri') return { src: POSE + 'aprobare.webp' };
    return { src: POSE + 'prezinta.webp' };
  }
  function dressEmpty(el) {
    if (el.dataset.nuki) return;
    el.dataset.nuki = '1';
    // a tiny box (a drawer list, a side card) gets the small Jerry, a page gets Nuki
    var small = el.offsetWidth && el.offsetWidth < 300;
    var img = new Image();
    img.className = 'n-mascot' + (small ? ' is-sm' : '');
    img.alt = '';
    img.decoding = 'async';
    img.src = small ? JERRY + 'zambeste.webp' : poseFor(el).src;
    img.onload = function () { el.classList.add('has-nuki'); };
    el.insertBefore(img, el.firstChild);
  }

  // ------------------------------------------------------------------ Jerry on the good news (toasts)
  function dressToast(t) {
    if (t.dataset.nuki) return;
    t.dataset.nuki = '1';
    var good = t.classList.contains('is-success');
    var bad = t.classList.contains('is-error');
    if (!good && !bad) return;
    var img = new Image();
    img.className = 'n-jerry';
    img.alt = '';
    img.src = JERRY + (good ? 'bucurie' : 'surprins') + '.webp';
    t.insertBefore(img, t.firstChild);
  }

  // ------------------------------------------------------------------ first open of the day: Nuki says hello, once
  function greet() {
    var K = window.K;
    var me = K && K.data && K.data.me;
    if (!me || !me.name) return;
    var today = new Date().toISOString().slice(0, 10);
    var key = 'c360_nou_hi_' + (me.id || '');
    if (store.get(key) === today) return;
    store.set(key, today);
    var h = new Date().getHours();
    var hi = h < 11 ? 'Bună dimineața' : h < 18 ? 'Bună ziua' : 'Bună seara';
    var first = String(me.name).split(/\s+/)[0];
    var line = h < 11 ? 'O zi frumoasă începe acum.' : h < 18 ? 'Hai să facem o zi bună.' : 'Încă puțin și e gata ziua.';
    var el = document.createElement('div');
    el.className = 'n-hello';
    el.setAttribute('role', 'status');
    el.innerHTML = '<img src="' + POSE + 'salut-pa.webp" alt=""><div><b>' + esc(hi) + ', ' + esc(first) + '!</b><span>' + esc(line) + '</span></div>' +
      '<button type="button" aria-label="Închide"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
    document.body.appendChild(el);
    var close = function () { el.classList.remove('in'); setTimeout(function () { el.remove(); }, 700); };
    el.querySelector('button').addEventListener('click', close);
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('in'); }); });
    setTimeout(close, 5200);
  }

  // ------------------------------------------------------------------ a slow first load: Jerry waits with her
  function waiting() {
    var ls = document.getElementById('loadingScreen');
    if (!ls) return;
    setTimeout(function () {
      if (ls.classList.contains('hidden') || ls.classList.contains('is-error') || document.querySelector('.n-wait')) return;
      var w = document.createElement('div');
      w.className = 'n-wait';
      w.innerHTML = '<img src="' + JERRY + 'arata.webp" alt=""><span>Aproape gata…</span>';
      document.body.appendChild(w);
      requestAnimationFrame(function () { w.classList.add('in'); });
      var gone = new MutationObserver(function () { if (ls.classList.contains('hidden') || ls.classList.contains('is-error')) { w.remove(); gone.disconnect(); } });
      gone.observe(ls, { attributes: true, attributeFilter: ['class'] });
    }, 1400);
  }

  // ------------------------------------------------------------------ wiring
  var greeted = false;
  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('.k-empty')) dressEmpty(root);
    root.querySelectorAll('.k-empty:not([data-nuki])').forEach(dressEmpty);
    if (root.matches && root.matches('.c360-toast')) dressToast(root);
    root.querySelectorAll('.c360-toast:not([data-nuki])').forEach(dressToast);
    if (root.matches && root.matches('.k-menu.has-acc')) addSwitch(root);
    root.querySelectorAll('.db-hero h2:not([data-n])').forEach(accentName);
    root.querySelectorAll('.tr-door:not([data-n])').forEach(dressDoor);
  }
  // Traininguri: Nuki stands at each door, in the pose of what is learned behind it
  var DOOR = { parcurs: 'receptie', consult: 'fisa', tratamente: 'facial' };
  function dressDoor(d) {
    d.setAttribute('data-n', '1');
    var img = new Image();
    img.className = 'n-door-nuki';
    img.alt = '';
    img.decoding = 'async';
    img.src = POSE + (DOOR[d.dataset.zone] || 'prezinta') + '.webp';
    d.appendChild(img);
  }
  // "Bună ziua, Ana": the name in the site's italic serif, the one accent of the title
  function accentName(h) {
    h.setAttribute('data-n', '1');
    var t = h.textContent, i = t.lastIndexOf(', ');
    if (i < 0) return;
    h.innerHTML = esc(t.slice(0, i + 2)) + '<em>' + esc(t.slice(i + 2)) + '</em>';
  }
  var queued = [];
  var tick = 0;
  var mo = new MutationObserver(function (list) {
    for (var i = 0; i < list.length; i++) for (var j = 0; j < list[i].addedNodes.length; j++) { var n = list[i].addedNodes[j]; if (n.nodeType === 1) queued.push(n); }
    if (tick) return;
    tick = requestAnimationFrame(function () {
      tick = 0;
      var q = queued; queued = [];
      for (var k = 0; k < q.length; k++) if (q[k].isConnected) scan(q[k]);
      brand();
      if (!greeted && window.K && window.K.data && !document.getElementById('app').classList.contains('hidden')) { greeted = true; setTimeout(greet, 900); }
    });
  });
  function start() {
    brand();
    waiting();
    scan(document.body);
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
