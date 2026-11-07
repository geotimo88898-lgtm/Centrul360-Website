// Centrul360 portal, aspectul nou: Panou → KPI, deschiderea cinematică (doar admin, doar sub html.ui-nou).
// Cifrele importante ale perioadei alese, ca un HUD: încasările (cifra se derulează și numără, graficul zilelor se desenează),
// programările, rata de prezentare (arcul se rotește în poziție), clientele și leadurile, reclamele (cheltuit, cost pe lead,
// cost pe programare, de câte ori se întoarce leul) și cursa cosmeticienelor (barele aleargă). Datele: /api/kpi?period=<aceeași
// perioadă ca mai jos> și încasările din portal; ce nu are valoare în perioada aleasă nu apare (fără „-”).
// Mișcare doar cu transform și opacity; liniște pentru „mai puțină mișcare”.
(function () {
  'use strict';
  var html = document.documentElement;
  if (!html.classList.contains('ui-nou')) return;
  var calm = function () { return html.classList.contains('c360-reduce') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
  var K = function () { return window.K; };
  var D = function () { return window.K && window.K.data; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var num = function (n, dec) { return (Number(n) || 0).toLocaleString('ro-RO', { maximumFractionDigits: dec || 0, minimumFractionDigits: 0 }); };
  var HUES = ['#2fd6c3', '#48d6ff', '#ffd27a', '#ff9f6b', '#5cf2a0', '#ff6f91', '#7fb2ff', '#ffe45c', '#9ff2e8'];

  var deck = null, period = '', busy = false, key = '';
  function curPeriod(panel) {
    var on = panel.querySelector('[data-kp-period].is-on');
    return on ? { k: on.dataset.kpPeriod, l: on.textContent.trim() } : { k: 'today', l: 'Azi' };
  }
  function custom(panel) {
    var f = panel.querySelector('[data-kp-range]'); if (!f) return '';
    var a = f.querySelector('[name=since]'), b = f.querySelector('[name=until]');
    return a && b && a.value && b.value ? '&since=' + a.value + '&until=' + b.value : '';
  }

  // ------------------------------------------------------------------ the tiles, only what has a value
  function tiles(r, pl) {
    var out = [], m = r.money || {}, v = r.visits || {}, b = r.bookings || {}, f = r.funnel || {}, a = r.ads && r.ads.totals;
    var trend = (r.trend || []).map(function (x) { return x.revenue || 0; });
    out.push({ cls: 'hero', html:
      '<small>Încasări · ' + esc(pl) + '</small>' +
      '<div class="row"><b class="big" data-count="' + (m.revenue || 0) + '">0</b><em class="unit">lei</em></div>' +
      '<p>' + num(m.payments) + ' ' + (m.payments === 1 ? 'plată' : 'plăți') + (m.ticket ? ' · bon mediu <b>' + num(m.ticket) + ' lei</b>' : '') + (m.upsell ? ' · upsell <b>' + num(m.upsell) + ' lei</b>' : '') + '</p>' +
      (trend.length > 1 ? spark(trend) : hourly(r.range) ) });
    var made = b.made || 0, sch = v.scheduled || 0;
    if (made || sch) out.push({ cls: '', html: '<small>Programări</small><b data-count="' + (made || sch) + '">0</b><p>' + (made ? (b.confirmed ? num(b.confirmed) + ' confirmate' : 'făcute în perioadă') + (b.cancelled ? ' · ' + num(b.cancelled) + ' anulate' : '') : 'în calendar') + '</p>' });
    var rate = v.rate != null ? v.rate : b.rates && b.rates.came;
    if (rate != null) out.push({ cls: 'gauge', html: '<small>Rata de prezentare</small>' + gauge(rate) + '<b class="mid" data-count="' + Math.round(rate) + '" data-suf="%">0</b><p>' + num(v.came || b.came) + ' au venit din ' + num(v.due || b.due) + '</p>' });
    if (m.clients || f.leads) out.push({ cls: '', html: '<small>' + (m.clients ? 'Cliente care au plătit' : 'Leaduri') + '</small><b data-count="' + (m.clients || f.leads) + '">0</b><p>' + (m.clients && f.leads ? num(f.leads) + ' leaduri noi' + (f.ads ? ', ' + num(f.ads) + ' din reclame' : '') : f.organic ? num(f.organic) + ' organic' : '') + '</p>' });
    if (a && a.spend) {
      var rows = [['Cheltuit', num(a.spend) + ' lei']];
      if (a.cpl) rows.push(['Cost pe lead', num(a.cpl, 2) + ' lei']);
      if (a.perBooked) rows.push(['Cost pe programare', num(a.perBooked, 2) + ' lei']);
      if (a.cpa) rows.push(['Cost pe clientă', num(a.cpa, 2) + ' lei']);
      if (a.roas) rows.push(['Leul se întoarce', num(a.roas, 2) + '×']);
      out.push({ cls: 'ads', html: '<small>Reclame Meta</small><b data-count="' + Math.round(a.spend) + '" data-suf=" lei">0</b>' +
        '<ul>' + rows.slice(1).map(function (x, i) { return '<li style="--i:' + i + '"><span>' + esc(x[0]) + '</span><em>' + esc(x[1]) + '</em></li>'; }).join('') + '</ul>' +
        (a.metaLeads || a.clicks ? '<p>' + (a.metaLeads ? num(a.metaLeads) + ' leaduri' : '') + (a.metaLeads && a.clicks ? ' · ' : '') + (a.clicks ? num(a.clicks) + ' clicuri' : '') + '</p>' : '') });
    }
    var race = top(r.range);
    if (race.length) {
      var max = race[0].sum || 1;
      out.push({ cls: 'race', html: '<small>Cursa cosmeticienelor</small><ol>' + race.map(function (x, i) {
        return '<li style="--i:' + i + ';--c:' + HUES[i % HUES.length] + '"><span>' + esc(x.name) + '</span><em>' + num(x.sum) + ' lei</em><i><u style="--w:' + (x.sum / max).toFixed(3) + '"></u></i></li>';
      }).join('') + '</ol>' });
    }
    return out;
  }
  function top(range) {
    var d = D(); if (!d || !range) return [];
    var names = {}; ((d.admin && d.admin.employees) || d.activeEmployees || []).forEach(function (e) { names[e.id] = e.name; });
    var by = {};
    (d.incasari || []).forEach(function (s) { if (s.date >= range.since && s.date <= range.until) { var id = s.performedBy || s.employeeId; if (!names[id]) return; by[id] = (by[id] || 0) + (Number(s.amount) || 0); } });
    return Object.keys(by).map(function (id) { return { name: names[id], sum: by[id] }; }).filter(function (x) { return x.sum > 0; }).sort(function (a, b) { return b.sum - a.sum; }).slice(0, 5);
  }
  // one day: the money as it came in, hour by hour (cumulative), from the portal's own payments
  function hourly(range) {
    var d = D(); if (!d || !range) return '';
    var h = []; for (var i = 0; i < 24; i++) h.push(0);
    (d.incasari || []).forEach(function (s) { if (s.date < range.since || s.date > range.until) return; var t = s.time || (s.createdAt ? new Date(s.createdAt).toTimeString().slice(0, 5) : ''); var hh = parseInt(t, 10); if (!isNaN(hh)) h[hh] += Number(s.amount) || 0; });
    var first = h.findIndex(function (x) { return x; }); if (first < 0) return '';
    var last = 23; while (last > first && !h[last]) last--;
    var now = new Date().getHours(); if (range.until === (K().today ? K().today() : '') && now > last) last = now;
    var acc = 0, vals = []; for (var j = Math.max(0, first - 1); j <= last; j++) { acc += h[j]; vals.push(acc); }
    return vals.length > 1 ? spark(vals) : '';
  }
  function spark(vals) {
    var W = 600, H = 120, max = Math.max.apply(null, vals) || 1, n = vals.length;
    var pts = vals.map(function (v, i) { return [(i / (n - 1)) * W, H - 8 - (v / max) * (H - 20)]; });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var last = pts[pts.length - 1];
    return '<div class="sx-spark"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="sxsg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fd6c3" stop-opacity=".45"/><stop offset="1" stop-color="#2fd6c3" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + d + ' L' + W + ' ' + H + ' L0 ' + H + ' Z" fill="url(#sxsg)"/><path d="' + d + '" fill="none" stroke="#bff8f0" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>' +
      '<span class="dot" style="left:' + (last[0] / W * 100).toFixed(2) + '%;top:' + (last[1] / H * 100).toFixed(2) + '%"></span><span class="cover"></span></div>';
  }
  function gauge(p) {
    var C = 2 * Math.PI * 52, v = Math.max(0, Math.min(100, p)) / 100;
    return '<svg class="sx-gauge" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="7"/>' +
      '<g class="arc"><circle cx="60" cy="60" r="52" fill="none" stroke="url(#sxgg)" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + (C * v).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 60 60)"/></g>' +
      '<defs><linearGradient id="sxgg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5cf2a0"/><stop offset="1" stop-color="#2fd6c3"/></linearGradient></defs>' +
      '<g class="ticks">' + Array.apply(null, Array(36)).map(function (x, i) { var a = i * 10 * Math.PI / 180; return '<line x1="' + (60 + Math.cos(a) * 58).toFixed(1) + '" y1="' + (60 + Math.sin(a) * 58).toFixed(1) + '" x2="' + (60 + Math.cos(a) * 61).toFixed(1) + '" y2="' + (60 + Math.sin(a) * 61).toFixed(1) + '"/>'; }).join('') + '</g></svg>';
  }

  // ------------------------------------------------------------------ the show
  function play() {
    var nodes = deck.querySelectorAll('[data-count]');
    Array.prototype.forEach.call(nodes, function (el, i) {
      var to = Number(el.dataset.count) || 0, suf = el.dataset.suf || '';
      if (calm()) { el.textContent = num(to) + suf; return; }
      var t0 = performance.now() + 250 + i * 110, ms = 1600, digits = String(Math.round(to)).length;
      (function step(t) {
        if (t < t0) { requestAnimationFrame(step); return; }
        var p = Math.min(1, (t - t0) / ms), e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        // the first moments: the digits spin like a counter, then it lands on the real number
        if (p < 0.18 && to > 9) { var s = ''; for (var k = 0; k < digits; k++) s += Math.floor(Math.random() * 10); el.textContent = num(Number(s)) + suf; }
        else el.textContent = num(to * e) + suf;
        if (p < 1) requestAnimationFrame(step); else el.textContent = num(to) + suf;
      })(performance.now());
    });
    deck.classList.remove('go'); void deck.offsetWidth; deck.classList.add('go');
  }
  function render(r, pl) {
    var t = tiles(r, pl);
    deck.innerHTML = '<div class="sx-d-scan" aria-hidden="true"></div>' +
      '<div class="sx-d-head"><span><i></i>KPI · ' + esc(pl) + '</span><span>' + esc(r.range ? (r.range.since === r.range.until ? r.range.since : r.range.since + ' → ' + r.range.until) : '') + '</span></div>' +
      '<div class="sx-d-grid">' + t.map(function (x, i) { return '<article class="sx-t ' + x.cls + '" style="--i:' + i + '"><b class="cn tl"></b><b class="cn tr"></b><b class="cn bl"></b><b class="cn br"></b>' + x.html + '</article>'; }).join('') + '</div>';
    play();
  }
  function load(panel) {
    var p = curPeriod(panel), q = p.k + (p.k === 'custom' ? custom(panel) : '');
    if (busy || (q === period && deck.isConnected && deck.childElementCount)) return;
    busy = true;
    K().api('/api/kpi?period=' + q).then(function (r) {
      busy = false; period = q;
      var k2 = q + '|' + JSON.stringify([r.money, r.visits && r.visits.rate, r.bookings && r.bookings.made, r.ads && r.ads.totals && r.ads.totals.spend]);
      if (k2 === key && deck.childElementCount) return;
      key = k2;
      render(r, p.l);
    }, function () { busy = false; });
  }

  // ------------------------------------------------------------------ wiring: the deck sits above the KPI page when it is open
  function place() {
    var d = D(); if (!d || !d.isAdmin) return;
    var panel = document.getElementById('panel-panou'); if (!panel) return;
    var kr = panel.querySelector('[data-kpi-root]');
    if (!kr) { if (deck && deck.isConnected) { deck.remove(); period = ''; key = ''; } return; }
    if (!deck) { deck = document.createElement('section'); deck.className = 'sx-deck'; deck.setAttribute('aria-label', 'KPI'); }
    if (!deck.isConnected) { panel.insertBefore(deck, panel.firstChild); period = ''; key = ''; }
    load(panel);
  }
  function start() {
    var panel = document.getElementById('panel-panou');
    if (!panel) return;
    var q = 0;
    new MutationObserver(function () { if (q) return; q = requestAnimationFrame(function () { q = 0; place(); }); }).observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    panel.addEventListener('click', function (e) { if (e.target.closest('[data-kp-period]')) setTimeout(place, 60); });
    panel.addEventListener('submit', function () { setTimeout(place, 60); }, true);
    var t = setInterval(function () { if (D()) { clearInterval(t); place(); } }, 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
