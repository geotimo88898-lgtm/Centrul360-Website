// Centrul360 portal, aspectul nou: primul ecran din Panou → Azi, pentru admin (doar sub html.ui-nou). UN singur bloc, fără card,
// direct pe fundalul portalului: sus „Bună seara, George.” (salutul după ora zilei, numele din cont) și Nuki, mic, cu bula lui;
// dedesubt scena: cosmeticienele (portal-nou-prism.js le pune în [data-flow]) trimit dungi de spectru în prismă, raza albă iese spre
// numărul mare „Încasat azi” (numără), cu „față de ieri” la ora asta și „N încasări · bon mediu”; apoi butoanele, luna asta și,
// doar când există date, reclamele de azi, reclama care merge și cea fără rezultat, banda încasărilor. La o încasare nouă: pulsul
// pleacă de la cosmeticiană prin prismă la număr, apoi cometa intră în Nuki, banii explodează din cifră, Nuki sare. Totul din datele
// portalului (K.data) și din /api/kpi?period=today; ce nu există azi nu se arată. Doar transform și opacity; nimic nu rulează când nu se vede.
(function () {
  'use strict';
  var html = document.documentElement;
  if (!html.classList.contains('ui-nou')) return;
  var calm = function () { return html.classList.contains('c360-reduce') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var K = function () { return window.K; };
  var D = function () { return window.K && window.K.data; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var num = function (n) { return Math.round(Number(n) || 0).toLocaleString('ro-RO'); };
  var lei = function (n) { return num(n) + ' lei'; };
  var today = function () { return K() && K().today ? K().today() : new Date().toISOString().slice(0, 10); };
  var POSE = '/brand_asset/mascota/ipostaze/';
  var ICON = {
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3h-4a2 2 0 0 0 0 4h4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    lead: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/></svg>'
  };

  // ------------------------------------------------------------------ the numbers
  var KPI = { d: null, at: 0, busy: false };
  function kpi(cb) {
    if (KPI.busy || Date.now() - KPI.at < 3 * 60e3) return;
    KPI.busy = true;
    K().api('/api/kpi?period=today').then(function (x) { KPI.d = x; KPI.at = Date.now(); KPI.busy = false; cb(); }, function () { KPI.busy = false; KPI.at = Date.now(); });
  }
  var tm = function (s) { if (s.time) return s.time; var dd = s.createdAt ? new Date(s.createdAt) : null; return dd && !isNaN(dd) ? ('0' + dd.getHours()).slice(-2) + ':' + ('0' + dd.getMinutes()).slice(-2) : ''; };
  function model() {
    var d = D(); if (!d) return null;
    var t = today(), y = K().addDays ? K().addDays(t, -1) : '', mo = t.slice(0, 7);
    var now = new Date(), hm = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    var inc = d.incasari || [], sum = function (a) { return a.reduce(function (x, s) { return x + (Number(s.amount) || 0); }, 0); };
    var day = inc.filter(function (s) { return s.date === t; });
    var yAll = inc.filter(function (s) { return s.date === y; });
    var timed = yAll.length && yAll.every(function (s) { return tm(s); });
    var month = inc.filter(function (s) { return String(s.date || '').slice(0, 7) === mo; });
    var days = {}; month.forEach(function (s) { days[s.date] = 1; });
    return {
      total: sum(day), n: day.length, day: day,
      yday: timed ? sum(yAll.filter(function (s) { return tm(s) <= hm; })) : null,
      month: sum(month), monthDays: Object.keys(days).length,
      ids: day.map(function (s) { return s.id; })
    };
  }
  function greeting() { return K() && K().salut ? K().salut() : 'Bună ziua'; } // the hour in Romania (K.salut, portal-kit.js)
  function firstName() { var d = D(); return String((d && d.me && d.me.name) || '').trim().split(/\s+/)[0]; }

  // ------------------------------------------------------------------ the block
  var st = null, ad = null, shown = 0, seen = null, lineI = 0, inflight = 0;
  var small = function () { return window.innerWidth < 700; };
  function mount(panel) {
    st = document.createElement('section');
    st.className = 'sx-stage';
    st.setAttribute('aria-label', 'Banii de azi');
    st.innerHTML =
      '<div class="sx-s-head">' +
        '<div class="sx-s-hello">' +
          '<div class="sx-s-eye"><i></i><span data-date></span></div>' +
          '<h1 class="sx-s-hi" data-hi></h1>' +
        '</div>' +
        '<div class="sx-s-nk">' +
          '<span class="sx-s-glow" aria-hidden="true"></span>' +
          '<button type="button" class="sx-nuki" aria-label="Nuki"><span class="fl"><img alt="" decoding="async" src="' + POSE + 'bucurie.webp"></span></button>' +
          '<div class="sx-say" data-say aria-live="polite"></div>' +
        '</div>' +
      '</div>' +
      '<div class="sx-flow" data-flow>' +
        '<div class="sx-s-money">' +
          '<div class="sx-s-lbl"><span>Încasat azi</span> <span class="sx-s-delta" data-delta hidden></span></div>' +
          '<div class="sx-s-num" data-num><span data-v>0</span><small>lei</small></div>' +
          // the glass card with the details, as Summitlane's „Încasări azi” card: the count and the ticket, this month, the last payment
          '<div class="sx-mcard">' +
            '<div class="sx-s-sub" data-sub></div>' +
            '<div class="sx-hud" data-hud></div>' +
            '<div class="sx-last" data-last hidden></div>' +
          '</div>' +
          '<div class="sx-acts">' +
            '<button type="button" data-proxy="incasari">' + ICON.wallet + 'Încasare</button>' +
            '<button type="button" data-proxy="programari">' + ICON.cal + 'Programare</button>' +
            '<button type="button" data-proxy="pipeline">' + ICON.lead + 'Lead</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    panel.insertBefore(st, panel.firstChild);
    panel.classList.add('sx-host');
    // the ads of today: their own section further down the story (after what comes next today), only when there are numbers
    ad = document.createElement('section');
    ad.className = 'sx-adsec'; ad.hidden = true; ad.setAttribute('aria-label', 'Reclamele de azi');
    panel.appendChild(ad);
    reveal(panel);
    // the old hero's buttons (still there, hidden): the same actions, the same code path
    st.querySelector('.sx-acts').addEventListener('click', function (e) {
      var b = e.target.closest('[data-proxy]'); if (!b) return;
      var o = document.querySelector('#panel-panou .db-hero [data-go="' + b.dataset.proxy + '"]');
      if (o) o.click(); else { var t = document.querySelector('#tabsNav button[data-tab="' + b.dataset.proxy + '"]'); if (t) t.click(); }
    });
    st.querySelector('.sx-nuki').addEventListener('click', function (e) { lineI++; jump(); say(); burst(e.clientX, e.clientY, 14); });
    paint(true);
    // on a phone the bubble waits for a tap (it would cover the cosmeticians); on a computer it greets once
    if (!small()) setTimeout(say, 1400);
    kpi(function () { paintAds(); });
    if (window.C360Prism) window.C360Prism.place();
  }

  function paint(first) {
    if (!st || !st.isConnected) return;
    var m = model(); if (!m) return;
    var d = D();
    st.querySelector('[data-date]').innerHTML = esc(K().dateLong ? K().dateLong(today()) : today()) + '<span class="sx-rt"> · în timp real</span>';
    st.querySelector('[data-hi]').innerHTML = esc(greeting()) + (firstName() ? ', <em>' + esc(firstName()) + '</em>.' : '.');
    if (inflight && !first) return; // a pulse is on its way: the number, the % and the count change when it lands
    countTo(m.total, first);
    var dl = st.querySelector('[data-delta]');
    if (m.yday != null && (m.yday || m.total)) {
      var diff = m.total - m.yday, pc = m.yday ? Math.round(diff / m.yday * 100) : null;
      dl.hidden = false; dl.className = 'sx-s-delta ' + (diff >= 0 ? 'up' : 'down');
      dl.textContent = (diff >= 0 ? '↑ ' : '↓ ') + (pc != null ? Math.abs(pc) + '% ' : lei(Math.abs(diff)) + ' ') + 'față de ieri'; dl.title = 'Față de ieri, la aceeași oră';
    } else dl.hidden = true;
    st.querySelector('[data-sub]').innerHTML = '<b>' + m.n + '</b> ' + (m.n === 1 ? 'încasare' : 'încasări') + ' azi' + (m.n ? ' · bon mediu <b>' + esc(lei(m.total / m.n)) + '</b>' : '');
    // under the number: this month (the ads have their own section)
    var hud = st.querySelector('[data-hud]');
    hud.dataset.n = 1;
    hud.innerHTML = '<div><small>Luna asta</small><b>' + esc(lei(m.month)) + '</b>' + (m.monthDays ? '<span>' + m.monthDays + (m.monthDays === 1 ? ' zi cu încasări' : ' zile cu încasări') + '</span>' : '') + '</div>';
    // the last payment of today: what, where, when (never the client's name)
    var last = m.day.slice().sort(function (x, y) { return String(y.createdAt || y.time || '') < String(x.createdAt || x.time || '') ? -1 : 1; })[0];
    var le = st.querySelector('[data-last]');
    if (last) {
      var at = last.createdAt ? new Date(last.createdAt) : null, ago = at && !isNaN(at) ? Math.max(0, Math.round((Date.now() - at) / 60000)) : null;
      var when = ago == null ? tm(last) : ago < 1 ? 'acum' : ago < 60 ? 'acum ' + ago + ' min' : 'la ' + tm(last);
      le.innerHTML = '<span>Ultima: <b>' + esc(last.treatment || 'încasare') + '</b>' + (last.location ? ' · ' + esc(last.location) : '') + (when ? ' · ' + esc(when) : '') + '</span><em>+' + esc(lei(last.amount)) + '</em>';
      le.hidden = false;
    } else le.hidden = true;
    paintAds();
  }
  // the ads of today: spent, the costs, how many times the leu comes back; the ad that works and the one that spends without a result
  function paintAds() {
    if (!ad || !ad.isConnected) return;
    var a = KPI.d && KPI.d.ads, tot = a && a.totals;
    if (!tot || !tot.spend) { ad.hidden = true; ad.innerHTML = ''; return; }
    var cells = [['Cheltuit azi', lei(tot.spend), tot.metaLeads ? tot.metaLeads + ' leaduri de la Meta' : '', tot.spend]];
    if (tot.cpl) cells.push(['Cost pe lead', lei(tot.cpl), tot.clicks ? num(tot.clicks) + ' clicuri' : '', tot.cpl]);
    if (tot.cpa) cells.push(['Cost pe clientă', lei(tot.cpa), tot.clients ? tot.clients + ' cliente din reclame' : '', tot.cpa]);
    else if (tot.perBooked) cells.push(['Cost pe programare', lei(tot.perBooked), tot.booked ? tot.booked + ' programări' : '', tot.perBooked]);
    if (tot.roas) cells.push(['Leul se întoarce', String(tot.roas).replace('.', ',') + '×', tot.revenue ? lei(tot.revenue) + ' din reclame' : '', 0]);
    var rows = '';
    if (a.rows) {
      var rr = a.rows.filter(function (r) { return r.spend > 0; });
      var best = rr.filter(function (r) { return r.roas || r.clients; }).sort(function (x, y) { return (y.roas || 0) - (x.roas || 0) || (y.clients || 0) - (x.clients || 0); })[0]
        || rr.filter(function (r) { return r.metaLeads; }).sort(function (x, y) { return (x.cpl || 1e9) - (y.cpl || 1e9); })[0];
      var idle = rr.filter(function (r) { return !r.clients && !r.metaLeads && r !== best; }).sort(function (x, y) { return y.spend - x.spend; })[0];
      if (best) rows += '<div class="sx-ad best"><i></i><em>Merge</em><b>' + esc(best.name || best.campaign || '') + '</b><span>' + (best.roas ? String(best.roas).replace('.', ',') + '×' : best.cpl ? esc(lei(best.cpl)) + ' / lead' : esc(lei(best.spend))) + '</span></div>';
      if (idle) rows += '<div class="sx-ad idle"><i></i><em>Fără rezultat</em><b>' + esc(idle.name || idle.campaign || '') + '</b><span>' + esc(lei(idle.spend)) + '</span></div>';
    }
    var key = JSON.stringify(cells) + rows;
    if (ad.dataset.key === key) return;
    ad.dataset.key = key;
    ad.innerHTML = '<h3 class="sx-sec-h"><i></i>Reclame azi</h3>' +
      '<div class="sx-ad-nums" data-n="' + cells.length + '">' + cells.map(function (c) { return '<div><small>' + esc(c[0]) + '</small><b' + (c[3] ? ' data-sx-n="' + Math.round(c[3]) + '"' : '') + '>' + esc(c[1]) + '</b>' + (c[2] ? '<span>' + esc(c[2]) + '</span>' : '') + '</div>'; }).join('') + '</div>' +
      (rows ? '<div class="sx-ads">' + rows + '</div>' : '');
    ad.hidden = false;
  }

  // ------------------------------------------------------------------ the story below the block: each section rises in once, its numbers count up
  var seenSec = typeof WeakSet === 'function' ? new WeakSet() : null, io = null;
  function countUp(el) {
    var to = Number(el.dataset.sxN); if (!to || calm()) return;
    var txt = el.textContent, t0 = performance.now();
    (function step(t) {
      var p = Math.min(1, (t - t0) / 1100), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = p === 1 ? txt : num(to * e) + ' lei';
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }
  function reveal(panel) {
    if (calm() || !('IntersectionObserver' in window) || !seenSec) return;
    io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (!e.isIntersecting) return; var el = e.target; io.unobserve(el); seenSec.add(el); el.classList.add('sx-up'); Array.prototype.forEach.call(el.querySelectorAll('[data-sx-n]'), countUp); });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    var watch = function () {
      Array.prototype.forEach.call(panel.querySelectorAll('.db-b, .sx-adsec'), function (el) {
        if (seenSec.has(el) || el.classList.contains('sx-rise')) return;
        var r = el.getBoundingClientRect();
        if (r.top < innerHeight * 0.9) { seenSec.add(el); return; } // already on screen: no entrance, no flash
        el.classList.add('sx-rise'); io.observe(el);
      });
    };
    watch();
    new MutationObserver(watch).observe(panel, { childList: true, subtree: true });
  }

  // the total counts from where it was (1 - 2^(-10p)); a bigger total pops
  function countTo(to, first) {
    var el = st.querySelector('[data-v]'), from = first ? 0 : shown;
    if (to === shown && !first) return;
    shown = to;
    if (calm()) { el.textContent = num(to); return; }
    var t0 = performance.now(), ms = first ? 2400 : 1500;
    (function step(t) {
      var p = Math.min(1, (t - t0) / ms), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = num(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  // ------------------------------------------------------------------ Nuki speaks only of money and ads
  function lines() {
    var m = model(); if (!m) return [];
    var diff = m.yday == null ? null : m.total - m.yday;
    if (diff == null || (!m.yday && !m.total)) return [];
    // the number and the % are already on screen: Nuki says the lei behind the %
    return [{ p: diff < 0 ? 'gandeste' : 'bucurie', t: diff >= 0 ? '<b>' + esc(lei(diff)) + '</b> peste ieri la ora asta.' : '<b>' + esc(lei(-diff)) + '</b> sub ieri la ora asta.' }];
  }
  function say() {
    if (!st) return;
    var L = lines(); if (!L.length) return;
    var l = L[lineI % L.length], b = st.querySelector('[data-say]'), img = st.querySelector('.sx-nuki img');
    if (img.getAttribute('src').indexOf(l.p) < 0) { img.classList.add('swap'); setTimeout(function () { img.src = POSE + l.p + '.webp'; img.classList.remove('swap'); }, 200); }
    b.innerHTML = '<small>NUKI</small>' + l.t;
    b.classList.remove('in'); void b.offsetWidth; b.classList.add('in');
    clearTimeout(b._t); b._t = setTimeout(function () { b.classList.remove('in'); }, 7000);
  }
  function jump() { var n = st.querySelector('.sx-nuki'); n.classList.remove('jump'); void n.offsetWidth; n.classList.add('jump'); }

  // ------------------------------------------------------------------ the money explosion (spans, transform and opacity only)
  function burst(x, y, n, coins) {
    if (calm() || !st) return;
    var r = st.getBoundingClientRect();
    var b = document.createElement('div');
    b.className = 'sx-burst';
    b.style.transform = 'translate3d(' + (x - r.left) + 'px,' + (y - r.top) + 'px,0)';
    var ac = (getComputedStyle(html).getPropertyValue('--accent') || '#2fd6c3').trim(), ac3 = (getComputedStyle(html).getPropertyValue('--accent-3') || '#bff8f0').trim();
    var cols = [ac3, ac, '#ffd27a', '#ffffff', ac];
    for (var i = 0; i < n; i++) {
      var s = document.createElement('i');
      var coin = coins && i % 3 === 0;
      if (coin) s.className = 'coin'; else s.style.setProperty('--c', cols[i % cols.length]);
      b.appendChild(s);
      var a = Math.random() * Math.PI * 2, v = 60 + Math.random() * (coins ? 170 : 110);
      var dx = Math.cos(a) * v, dy = Math.sin(a) * v - (coins ? 60 : 20);
      s.animate([
        { transform: 'translate3d(0,0,0) scale(.4)', opacity: 1 },
        { transform: 'translate3d(' + dx * 0.7 + 'px,' + dy * 0.7 + 'px,0) scale(1)', opacity: 1, offset: 0.45 },
        { transform: 'translate3d(' + dx + 'px,' + (dy + (coins ? 90 : 30)) + 'px,0) scale(.6) rotate(' + (coin ? 360 : 0) + 'deg)', opacity: 0 }
      ], { duration: 900 + Math.random() * 600, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });
    }
    st.appendChild(b);
    setTimeout(function () { b.remove(); }, 1700);
  }
  // a new payment: a comet from the left edge into Nuki, then the coins burst out of the number
  function pay() {
    if (!st || calm()) { paint(false); return; }
    var r = st.getBoundingClientRect(), nk = st.querySelector('.sx-nuki').getBoundingClientRect(), nb = st.querySelector('[data-num]').getBoundingClientRect();
    var x0 = nb.left - r.left + nb.width * 0.4, y0 = nb.top - r.top - 40, x1 = nk.left - r.left + nk.width / 2, y1 = nk.top - r.top + nk.height * 0.45;
    var ang = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
    var c = document.createElement('div'); c.className = 'sx-comet'; st.appendChild(c);
    c.animate([
      { transform: 'translate3d(' + x0 + 'px,' + y0 + 'px,0) rotate(' + ang + 'deg) scaleX(.2)', opacity: 0 },
      { transform: 'translate3d(' + ((x0 + x1) / 2) + 'px,' + ((y0 + y1) / 2 - 30) + 'px,0) rotate(' + ang + 'deg) scaleX(1)', opacity: 1, offset: 0.5 },
      { transform: 'translate3d(' + x1 + 'px,' + y1 + 'px,0) rotate(' + ang + 'deg) scaleX(.3)', opacity: 0 }
    ], { duration: 800, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }).onfinish = function () {
      c.remove(); jump();
      lineI = 0; paint(false); say();
      var n = st.querySelector('[data-num]'); n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop');
      var q = n.getBoundingClientRect(); burst(q.left + q.width * 0.45, q.top + q.height * 0.5, 30, true);
    };
  }
  window.C360Stage = { pay: pay };

  // ------------------------------------------------------------------ wiring
  function place() {
    var d = D(); if (!d || !d.isAdmin) return;
    var panel = document.getElementById('panel-panou'); if (!panel) return;
    if (!st || !st.isConnected) mount(panel);
  }
  function onData() {
    var m = model(); if (!m) return;
    place();
    if (seen === null) { seen = new Set(m.ids); return; }
    var fresh = m.ids.filter(function (x) { return !seen.has(x); });
    m.ids.forEach(function (x) { seen.add(x); });
    if (fresh.length) {
      var sales = m.day.filter(function (s) { return fresh.indexOf(s.id) >= 0; });
      // while a pulse travels from her to the number, the number waits for it (each arrival counts on)
      // each arrival: the number counts on, and the burst „+N lei” in the accent (as Summitlane's), with who did it
      var q = sales.slice(), boom = function (sl) { if (window.C360Fx && sl) window.C360Fx.cash(lei(sl.amount), sl.treatment || ''); };
      var land = function () { inflight = Math.max(0, inflight - 1); boom(q.shift()); pay(); };
      if (window.C360Prism && window.C360Prism.send(sales, land)) inflight += sales.length; else { pay(); sales.forEach(function (sl, i) { setTimeout(function () { boom(sl); }, i * 900); }); }
    } else paint(false);
    KPI.at = Math.min(KPI.at, Date.now() - 3 * 60e3 + 30e3);
    kpi(function () { paint(false); });
  }
  function start() {
    var k = K(); if (!k) return;
    if (k.on) k.on('data', function () { setTimeout(onData, 80); });
    var t = setInterval(function () { if (D()) { clearInterval(t); onData(); } }, 250);
    setInterval(function () { if (st && st.isConnected && !document.hidden) { var h = st.querySelector('[data-hi]'); if (h && h.textContent.indexOf(greeting()) < 0) paint(false); } }, 60e3);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
