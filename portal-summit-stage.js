// Centrul360 portal, aspectul nou: primul ecran din Panou → Azi, pentru admin (doar sub html.ui-nou).
// Scena de bani: „Bună seara, George.” (salutul după ora zilei, numele din cont), încasat azi (numără), față de ieri la ora asta,
// luna asta, reclamele de azi (cheltuit, cost pe lead, cost pe clientă, câte ori se întoarce leul), reclama care merge și cea care
// cheltuie fără rezultat, banda cu încasările zilei. În dreapta, Nuki în lumină, într-un HUD de inele care se rotesc. La o încasare
// nouă: o cometă intră în Nuki, banii explodează din cifră, Nuki sare de bucurie. Totul din datele portalului (K.data) și din
// /api/kpi?period=today; ce nu există azi nu se arată (fără „-”). Doar transform și opacity; nimic nu rulează când nu se vede.
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
  function greeting() { var h = new Date().getHours(); return h < 11 ? 'Bună dimineața' : h < 18 ? 'Bună ziua' : 'Bună seara'; }
  function firstName() { var d = D(); return String((d && d.me && d.me.name) || '').trim().split(/\s+/)[0]; }

  // ------------------------------------------------------------------ the block
  var st = null, shown = 0, seen = null, lineI = 0;
  function rings() {
    var t = '';
    for (var i = 0; i < 72; i++) { var a = i * 5 * Math.PI / 180, r1 = 238, r2 = i % 6 ? 244 : 252; t += '<line x1="' + (250 + Math.cos(a) * r1).toFixed(1) + '" y1="' + (250 + Math.sin(a) * r1).toFixed(1) + '" x2="' + (250 + Math.cos(a) * r2).toFixed(1) + '" y2="' + (250 + Math.sin(a) * r2).toFixed(1) + '"/>'; }
    return '<svg viewBox="0 0 500 500" aria-hidden="true" fill="none">' +
      '<g class="r1" stroke="rgba(191,248,240,.32)" stroke-width="1">' + t + '</g>' +
      '<g class="r2"><circle cx="250" cy="250" r="214" stroke="rgba(47,214,195,.55)" stroke-width="1.4" stroke-dasharray="120 40 8 40 260 60" stroke-linecap="round"/></g>' +
      '<g class="r3"><circle cx="250" cy="250" r="190" stroke="rgba(255,255,255,.12)" stroke-width="1" stroke-dasharray="2 6"/></g>' +
      '<g class="r4"><circle cx="250" cy="250" r="168" stroke="rgba(191,248,240,.5)" stroke-width="2.2" stroke-dasharray="60 470" stroke-linecap="round"/>' +
        '<circle cx="250" cy="250" r="168" stroke="rgba(47,214,195,.35)" stroke-width="1" stroke-dasharray="14 18"/></g>' +
      '</svg>';
  }
  function motes() {
    var s = '';
    for (var i = 0; i < 18; i++) s += '<i style="--x:' + ((i * 53) % 100) + '%;--s:' + (1.5 + (i % 4) * 0.9) + 'px;--t:' + (7 + (i % 5) * 1.6) + 's;--d:-' + ((i * 1.37) % 9).toFixed(2) + 's;--o:' + (0.35 + (i % 3) * 0.2) + ';--dx:' + (((i * 29) % 60) - 30) + 'px"></i>';
    return s;
  }
  function mount(panel) {
    st = document.createElement('section');
    st.className = 'sx-stage';
    st.setAttribute('aria-label', 'Banii de azi');
    st.innerHTML =
      '<div class="sx-s-copy">' +
        '<div class="sx-s-eye"><i></i><span data-date></span></div>' +
        '<h1 class="sx-s-hi" data-hi></h1>' +
        '<div class="sx-s-lbl"><span>Încasat azi</span> <span class="sx-s-delta" data-delta hidden></span></div>' +
        '<div class="sx-s-num" data-num><span data-v>0</span><small>lei</small></div>' +
        '<div class="sx-s-sub" data-sub></div>' +
        '<div class="sx-hud" data-hud></div>' +
        '<div class="sx-ads" data-ads></div>' +
        '<div class="sx-feed" data-feed hidden><div></div></div>' +
        '<div class="sx-acts">' +
          '<button type="button" data-proxy="incasari">' + ICON.wallet + 'Încasare</button>' +
          '<button type="button" data-proxy="programari">' + ICON.cal + 'Programare</button>' +
          '<button type="button" data-proxy="pipeline">' + ICON.lead + 'Lead</button>' +
        '</div>' +
      '</div>' +
      '<div class="sx-s-scene">' +
        '<div class="sx-motes" aria-hidden="true">' + motes() + '</div>' +
        '<div class="sx-beam" aria-hidden="true"></div>' +
        '<div class="sx-core" aria-hidden="true"></div>' +
        '<div class="sx-hudrings" aria-hidden="true">' + rings() + '</div>' +
        '<div class="sx-floor" aria-hidden="true"></div>' +
        '<button type="button" class="sx-nuki" aria-label="Nuki"><span class="fl"><img alt="" decoding="async" src="' + POSE + 'bucurie.webp"></span></button>' +
        '<div class="sx-say" data-say aria-live="polite"></div>' +
      '</div>';
    panel.insertBefore(st, panel.firstChild);
    panel.classList.add('sx-host');
    // the old hero's buttons (still there, hidden): the same actions, the same code path
    st.querySelector('.sx-acts').addEventListener('click', function (e) {
      var b = e.target.closest('[data-proxy]'); if (!b) return;
      var o = document.querySelector('#panel-panou .db-hero [data-go="' + b.dataset.proxy + '"]');
      if (o) o.click(); else { var t = document.querySelector('#tabsNav button[data-tab="' + b.dataset.proxy + '"]'); if (t) t.click(); }
    });
    st.querySelector('.sx-nuki').addEventListener('click', function (e) { lineI++; jump(); say(); burst(e.clientX, e.clientY, 14); });
    paint(true);
    setTimeout(say, 1400);
    kpi(function () { paint(false); say(); });
  }

  function paint(first) {
    if (!st || !st.isConnected) return;
    var m = model(); if (!m) return;
    var d = D();
    st.querySelector('[data-date]').textContent = (K().dateLong ? K().dateLong(today()) : today()) + ' · în timp real';
    st.querySelector('[data-hi]').innerHTML = esc(greeting()) + (firstName() ? ', <em>' + esc(firstName()) + '</em>.' : '.');
    countTo(m.total, first);
    var dl = st.querySelector('[data-delta]');
    if (m.yday != null && (m.yday || m.total)) {
      var diff = m.total - m.yday, pc = m.yday ? Math.round(diff / m.yday * 100) : null;
      dl.hidden = false; dl.className = 'sx-s-delta ' + (diff >= 0 ? 'up' : 'down');
      dl.textContent = (diff >= 0 ? '↑ ' : '↓ ') + (pc != null ? Math.abs(pc) + '% ' : lei(Math.abs(diff)) + ' ') + 'față de ieri'; dl.title = 'Față de ieri, la aceeași oră';
    } else dl.hidden = true;
    st.querySelector('[data-sub]').innerHTML = '<b>' + m.n + '</b> ' + (m.n === 1 ? 'încasare' : 'încasări') + ' azi' + (m.n ? ' · bon mediu <b>' + esc(lei(m.total / m.n)) + '</b>' : '');
    // the HUD: only what exists
    var cells = [['Luna asta', lei(m.month), m.monthDays ? m.monthDays + (m.monthDays === 1 ? ' zi cu încasări' : ' zile cu încasări') : '']];
    var a = KPI.d && KPI.d.ads, tot = a && a.totals;
    if (tot && tot.spend) {
      cells.push(['Reclame azi', lei(tot.spend), tot.metaLeads ? tot.metaLeads + ' leaduri de la Meta' : '']);
      if (tot.cpl) cells.push(['Cost pe lead', lei(tot.cpl), tot.clicks ? num(tot.clicks) + ' clicuri' : '']);
      if (tot.cpa) cells.push(['Cost pe clientă', lei(tot.cpa), tot.clients ? tot.clients + ' cliente din reclame' : '']);
      else if (tot.perBooked) cells.push(['Cost pe programare', lei(tot.perBooked), tot.booked ? tot.booked + ' programări' : '']);
      if (tot.roas) cells.push(['Leul se întoarce', String(tot.roas).replace('.', ',') + '×', tot.revenue ? lei(tot.revenue) + ' din reclame' : '']);
    } else if (KPI.d && KPI.d.money && KPI.d.money.ticket) cells.push(['Bon mediu', lei(KPI.d.money.ticket), '']);
    if (cells.length < 4 && KPI.d && KPI.d.funnel && KPI.d.funnel.leads) cells.push(['Leaduri azi', num(KPI.d.funnel.leads), KPI.d.funnel.ads ? KPI.d.funnel.ads + ' din reclame' : '']);
    if (cells.length < 4 && d && d.appointmentsToday) { var ap = (d.appointmentsToday.list || []).filter(function (x) { return x.status !== 'anulata'; }).length; if (ap) cells.push(['Programări azi', num(ap), '']); }
    st.querySelector('[data-hud]').innerHTML = cells.slice(0, 4).map(function (c) { return '<div><small>' + esc(c[0]) + '</small><b>' + esc(c[1]) + '</b>' + (c[2] ? '<span>' + esc(c[2]) + '</span>' : '') + '</div>'; }).join('');
    // the ads: the best and the one that spends without a result
    var ads = '';
    if (a && a.rows) {
      var rows = a.rows.filter(function (r) { return r.spend > 0; });
      var best = rows.filter(function (r) { return r.roas || r.clients; }).sort(function (x, y) { return (y.roas || 0) - (x.roas || 0) || (y.clients || 0) - (x.clients || 0); })[0]
        || rows.filter(function (r) { return r.metaLeads; }).sort(function (x, y) { return (x.cpl || 1e9) - (y.cpl || 1e9); })[0];
      var idle = rows.filter(function (r) { return !r.clients && !r.metaLeads && r !== best; }).sort(function (x, y) { return y.spend - x.spend; })[0];
      if (best) ads += '<div class="sx-ad best"><i></i><em>Merge</em><b>' + esc(best.name || best.campaign || '') + '</b><span>' + (best.roas ? String(best.roas).replace('.', ',') + '×' : best.cpl ? esc(lei(best.cpl)) + ' / lead' : esc(lei(best.spend))) + '</span></div>';
      if (idle) ads += '<div class="sx-ad idle"><i></i><em>Fără rezultat</em><b>' + esc(idle.name || idle.campaign || '') + '</b><span>' + esc(lei(idle.spend)) + '</span></div>';
    }
    st.querySelector('[data-ads]').innerHTML = ads;
    // the live band: today's payments (amount and treatment; never the client's name)
    var feed = st.querySelector('[data-feed]');
    var items = m.day.slice().sort(function (x, y) { return String(y.createdAt || y.time || '') < String(x.createdAt || x.time || '') ? -1 : 1; }).slice(0, 12)
      .map(function (s) { return '<span><i></i><b>+' + esc(lei(s.amount)) + '</b>' + esc(s.treatment || '') + (s.location ? ' · ' + esc(s.location) : '') + '</span>'; }).join('');
    if (items) { var key = m.ids.join(','); if (feed.dataset.key !== key) { feed.dataset.key = key; feed.firstChild.innerHTML = items + items; feed.firstChild.style.setProperty('--dur', Math.max(24, m.day.length * 6) + 's'); } feed.hidden = false; }
    else feed.hidden = true;
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
    var out = [], tot = KPI.d && KPI.d.ads && KPI.d.ads.totals;
    var diff = m.yday == null ? null : m.total - m.yday;
    out.push({ p: diff != null && diff < 0 ? 'gandeste' : 'bucurie', t: 'Azi: <b>' + esc(lei(m.total)) + '</b>' + (diff == null ? '.' : diff >= 0 ? ', cu <b>' + esc(lei(diff)) + '</b> peste ieri la ora asta.' : ', cu ' + esc(lei(-diff)) + ' sub ieri la ora asta.') });
    out.push({ p: 'cadou', t: 'Luna asta: <b>' + esc(lei(m.month)) + '</b> încasați.' });
    if (tot && tot.spend) out.push({ p: 'aparat-foto', t: 'Reclamele azi: <b>' + esc(lei(tot.spend)) + '</b>' + (tot.cpl ? ', <b>' + esc(lei(tot.cpl)) + '</b> pe lead' : '') + (tot.roas ? ', leul se întoarce de <b>' + String(tot.roas).replace('.', ',') + '</b> ori' : '') + '.' });
    return out;
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
    var cols = ['#bff8f0', '#2fd6c3', '#ffd27a', '#ffffff', '#8be9ff'];
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
    if (fresh.length) pay(); else paint(false);
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
