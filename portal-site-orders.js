// Centrul360 portal, Admin → Site → Comenzi și plăți (the owner, 27.11: „o rubrică cu comenzi sau plăți unde văd fiecare plată
// încercată / reușită, de unde a venit, cât a plătit, orice detaliu important; la cele încercate și nereușite aceleași detalii
// și un buton Trimite mesaj, care trimite mesajul de readucere”).
// Admin → Site gets a switch on top: Comenzi și plăți | Trafic (the page as it was, portal-nou-site.js). The orders come from
// /api/portal-orders (admin only): the totals of the days chosen, the list (search, a filter), and one order's drawer with all
// of it: what she chose, her phone, where she came from, what happened step by step, her booking, the message, myPOS.
(function () {
  'use strict';
  var html = document.documentElement;
  if (!html.classList.contains('ui-nou')) return;
  var K = function () { return window.K; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ic = function (n) { return K() && K().icon ? K().icon(n) : ''; };
  var lei = function (n) { return K() && K().lei ? K().lei(n) : Math.round(Number(n) || 0) + ' lei'; };
  var mem = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return v; };
  var hm = function (iso) { return new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); };
  var dayOf = function (ms) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); };
  var when = function (iso) {
    if (!iso) return '';
    var t = Date.parse(iso), d = dayOf(t), today = dayOf(Date.now()), y = dayOf(Date.now() - 864e5);
    if (d === today) return 'azi, ' + hm(iso);
    if (d === y) return 'ieri, ' + hm(iso);
    return Number(d.slice(8, 10)) + '.' + d.slice(5, 7) + ', ' + hm(iso);
  };
  var TONE = { paid: 'is-good', checking: 'is-warn', refused: 'is-bad', unfinished: 'is-bad', open: 'is-accent', later: '', clinic: '', double: '' };
  var FILTERS = [['all', 'Toate'], ['paid', 'Plătite'], ['lost', 'Neterminate'], ['checking', 'De verificat']];
  var DAYS = [['1', 'Azi'], ['7', '7 zile'], ['30', '30 de zile']];
  var inFilter = function (r, f) { return f === 'all' || (f === 'paid' ? r.state === 'paid' : f === 'lost' ? ['unfinished', 'refused', 'open'].indexOf(r.state) > -1 : r.state === 'checking'); };

  var S = { view: mem('c360.site.view') === 'traffic' ? 'traffic' : 'orders', days: ['1', '7', '30'].indexOf(mem('c360.orders.days')) > -1 ? mem('c360.orders.days') : '7', filter: 'all', q: '', d: null, err: null, seq: 0, at: 0 };
  var panel = null, box = null, timer = 0;

  // ------------------------------------------------------------------ the switch on top of Admin → Site
  function attach(p) {
    panel = p;
    if (panel.querySelector('[data-so-views]')) return;
    var head = panel.querySelector('.k-head');
    if (!head) return;
    var traffic = document.createElement('div');
    traffic.setAttribute('data-traffic', '');
    while (head.nextSibling) traffic.appendChild(head.nextSibling);
    var views = document.createElement('div');
    views.className = 'so-views';
    views.setAttribute('data-so-views', '');
    views.innerHTML = '<div class="k-seg so-seg" role="tablist" aria-label="Ce vezi">' + [['orders', 'Comenzi și plăți', 'card'], ['traffic', 'Trafic', 'trend']].map(function (x) {
      return '<button type="button" role="tab" data-so-view="' + x[0] + '" class="' + (S.view === x[0] ? 'is-on' : '') + '" aria-selected="' + (S.view === x[0]) + '">' + ic(x[2]) + '<span>' + x[1] + '</span></button>';
    }).join('') + '</div>';
    box = document.createElement('div');
    box.className = 'so';
    box.setAttribute('data-orders', '');
    panel.appendChild(views); panel.appendChild(box); panel.appendChild(traffic);
    panel.addEventListener('click', onClick);
    panel.addEventListener('input', function (e) { if (e.target.matches('[data-so-q]')) { S.q = e.target.value; list(); } });
    apply();
  }
  function apply() {
    if (!panel) return;
    var t = panel.querySelector('[data-traffic]');
    if (t) t.hidden = S.view !== 'traffic';
    box.hidden = S.view !== 'orders';
    panel.querySelectorAll('[data-so-view]').forEach(function (b) { var on = b.getAttribute('data-so-view') === S.view; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
    var chk = panel.querySelector('.k-head [data-act="check"]');
    if (chk) chk.hidden = S.view !== 'traffic';
    if (S.view === 'orders') { if (!S.d) draw(); load(); }
  }
  // the section shown again (portal-nou-site.js show): fresh numbers, then every minute while it is on screen
  function shown() {
    if (S.view === 'orders') load();
    clearInterval(timer);
    timer = setInterval(function () {
      if (!K() || !K().isActive('site')) { clearInterval(timer); return; }
      if (!document.hidden && S.view === 'orders' && !K().drawerOpen) load();
    }, 60000);
  }

  // ------------------------------------------------------------------ data
  function load() {
    var my = ++S.seq;
    return K().api('/api/portal-orders?days=' + S.days).then(function (d) {
      if (my !== S.seq) return; S.d = d; S.err = null; S.at = Date.now(); draw();
    }, function (e) { if (my !== S.seq) return; S.err = K().errText ? K().errText(e) : 'Nu am putut citi comenzile.'; draw(); });
  }

  // ------------------------------------------------------------------ drawing
  function tile(icn, label, value, sub, cls, f) {
    return '<button type="button" class="k-stat so-t ' + (cls || '') + (f && S.filter === f ? ' is-on' : '') + '"' + (f ? ' data-so-f="' + f + '"' : '') + '><div class="k-stat-top"><span class="k-stat-ic">' + ic(icn) + '</span>' + esc(label) +
      '</div><div class="k-stat-value">' + value + '</div><div class="k-stat-sub">' + sub + '</div></button>';
  }
  function draw() {
    if (!box) return;
    var d = S.d;
    var bar = '<div class="so-bar"><div class="k-seg so-days" role="tablist" aria-label="Perioada">' + DAYS.map(function (x) {
      return '<button type="button" data-so-days="' + x[0] + '" class="' + (S.days === x[0] ? 'is-on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' +
      '<button type="button" class="k-btn is-outline is-sm" data-so-reload>' + ic('refresh') + 'Reîncarcă</button></div>';
    if (!d) { box.innerHTML = bar + (S.err ? K().empty('alert', 'Nu am putut citi comenzile', esc(S.err)) : '<div class="k-skel" style="height:110px;border-radius:18px"></div><div class="k-skel" style="height:320px;margin-top:1rem;border-radius:18px"></div>'); return; }
    var t = d.totals;
    box.innerHTML = bar +
      '<div class="so-tiles">' +
        tile('wallet', 'Plătite online', lei(t.paidLei), t.paid + (t.paid === 1 ? ' comandă' : ' comenzi'), 'is-good', 'paid') +
        tile('alert', 'Neterminate', lei(t.lostLei), t.lost + (t.lost === 1 ? ' comandă, ' : ' comenzi, ') + t.lostPeople + (t.lostPeople === 1 ? ' clientă' : ' cliente') + (t.messaged ? ', ' + t.messaged + ' cu mesaj' : ''), 'is-bad', 'lost') +
        tile('clock', 'De verificat în myPOS', String(t.checking), t.checking ? 'bani intrați, de potrivit' : 'nimic de verificat', t.checking ? 'is-warn' : '', 'checking') +
        tile('gift', 'Cadouri date', String(t.gifts), t.open ? t.open + ' în curs acum' : 'după mesajul de readucere', '', '') +
      '</div>' +
      '<div class="so-tools"><div class="k-seg so-f" role="tablist" aria-label="Filtru">' + FILTERS.map(function (x) {
        return '<button type="button" data-so-f="' + x[0] + '" class="' + (S.filter === x[0] ? 'is-on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' +
        '<label class="so-q">' + ic('search') + '<input type="search" data-so-q placeholder="Caută nume sau telefon" value="' + esc(S.q) + '" autocomplete="off"></label></div>' +
      '<div class="k-card so-list" data-so-list></div>';
    list();
  }
  function list() {
    var el = box && box.querySelector('[data-so-list]');
    if (!el || !S.d) return;
    var q = S.q.trim().toLowerCase(), qd = q.replace(/\D/g, '');
    var rows = S.d.rows.filter(function (r) {
      if (!inFilter(r, S.filter)) return false;
      if (!q) return true;
      return String(r.name).toLowerCase().indexOf(q) > -1 || (qd.length >= 3 && String(r.phone).replace(/\D/g, '').indexOf(qd) > -1) || String(r.title).toLowerCase().indexOf(q) > -1;
    });
    if (!rows.length) { el.innerHTML = K().empty('card', q ? 'Nimic pentru „' + esc(S.q) + '”' : 'Nicio comandă aici', S.days === '1' ? 'Azi încă nimic. Alege 7 zile sau 30 de zile.' : ''); return; }
    el.innerHTML = '<ul class="so-rows">' + rows.map(function (r) {
      var meta = [when(r.at), r.city, r.src, r.tries > 1 ? r.tries + ' încercări' : ''].filter(Boolean).map(esc).join(' · ');
      var msg = r.msg ? '<span class="so-msg">' + ic('chat') + 'Mesaj ' + esc(when(r.msg.at)) + '</span>' : '';
      return '<li class="so-r" data-so-id="' + esc(r.id) + '" tabindex="0" role="button" aria-label="' + esc((r.name || 'Comandă') + ', ' + r.stateLabel) + '">' +
        '<div class="so-r-a"><b>' + esc(r.name || 'Fără nume') + '</b><span class="so-r-w">' + esc(String(r.title || '').toLowerCase().indexOf(String(r.kindLabel).toLowerCase()) > -1 ? r.title : r.kindLabel + ': ' + (r.title || '')) + '</span><small>' + meta + '</small></div>' +
        '<div class="so-r-b"><span class="so-sum"><b>' + lei(r.amount) + '</b>' + (r.full > r.amount ? '<s>' + lei(r.full) + '</s>' : '') + '</span>' +
          '<span class="k-tag ' + (TONE[r.state] || '') + '">' + esc(r.stateLabel) + '</span>' + (r.gift ? '<span class="k-tag is-good">' + ic('gift') + 'Cadou</span>' : '') + msg +
          (r.canMsg ? '<button type="button" class="k-btn is-sm is-accent so-send" data-so-send="' + esc(r.id) + '">' + ic('chat') + 'Trimite mesaj</button>' : '') + '</div></li>';
    }).join('') + '</ul>';
  }

  // ------------------------------------------------------------------ one order, all of it
  function kv(rows) {
    rows = rows.filter(function (x) { return x && x[1]; });
    return rows.length ? '<dl class="so-kv">' + rows.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + x[1] + '</dd>'; }).join('') + '</dl>' : '';
  }
  function sec(title, icn, inner) { return inner ? '<section class="so-sec"><h4>' + ic(icn) + esc(title) + '</h4>' + inner + '</section>' : ''; }
  function open(id, from) {
    var row = S.d && S.d.rows.filter(function (r) { return r.id === id; })[0];
    var h = K().drawer({ title: row ? row.name || 'Comandă' : 'Comandă', subtitle: row ? esc(row.stateLabel) + ' · ' + lei(row.amount) : '', icon: 'card', width: 560, from: from,
      body: '<div class="k-skel" style="height:220px;border-radius:16px"></div><div class="k-skel" style="height:160px;margin-top:1rem;border-radius:16px"></div>' });
    K().api('/api/portal-orders?id=' + encodeURIComponent(id)).then(function (d) { fill(h, d); }, function (e) { h.set({ body: K().empty('alert', 'Nu am putut citi comanda', esc(K().errText ? K().errText(e) : '')) }); });
  }
  function fill(h, d) {
    var r = d.row, s = d.source || {}, b = d.booking;
    var lines = (d.lines || []).map(function (l) { return '<li><span>' + esc(l.name) + '</span><span>' + (l.full && l.full > l.price ? '<s>' + lei(l.full) + '</s>' : '') + '<b>' + lei(l.price) + '</b></span></li>'; }).join('');
    var steps = (d.steps || []).map(function (x) { return '<li class="' + (x.tone ? 'is-' + x.tone : '') + '"><time>' + esc(when(x.at)) + '</time><span>' + esc(x.t) + (x.d ? '<small>' + esc(x.d) + '</small>' : '') + '</span></li>'; }).join('');
    var others = (d.others || []).map(function (x) { return '<li><span>' + esc(when(x.at)) + ' · ' + esc(x.title) + '</span><span>' + lei(x.amount) + ' · ' + esc(x.state) + '</span></li>'; }).join('');
    var body =
      sec('Ce a ales', 'card', (lines ? '<ul class="so-lines">' + lines + '</ul>' : '') + kv([
        ['Total', '<b>' + lei(r.amount) + '</b>' + (r.full > r.amount ? ' <s>' + lei(r.full) + '</s>' : '')], ['Clinica', esc(r.city)], ['Ora ținută', esc(d.hour)],
        ['Felul', esc(r.kindLabel)], ['Reducerea', esc(d.pay.bonus)]])) +
      sec('Clienta', 'users', kv([['Nume', esc(r.name)], ['Telefon', r.phone ? '<a href="' + K().tel(r.phone) + '">' + esc(r.phone) + '</a>' : '']]) +
        (r.phone ? '<div class="so-acts"><a class="k-btn is-outline is-sm" href="' + K().tel(r.phone) + '">' + ic('phone') + 'Sună</a><a class="k-btn is-outline is-sm" href="' + K().wa(r.phone) + '" target="_blank" rel="noopener">' + ic('chat') + 'WhatsApp</a>' +
          (r.lead ? '<button type="button" class="k-btn is-outline is-sm" data-so-lead="' + esc(r.lead) + '">' + ic('users') + 'Deschide în Pipeline</button>' : '') + '</div>' : '')) +
      sec('De unde a venit', 'link', kv([['Sursa', esc(s.from)], ['Campania', esc(s.campaign)], ['Reclama', esc(s.content || (s.ad ? 'id ' + s.ad : ''))], ['Prima pagină', esc(s.land)],
        ['Venită de pe', esc(s.ref)], ['Aplicația', esc(s.app)], ['Prima vizită', esc(when(s.at))]])) +
      sec('Ce s-a întâmplat', 'clock', steps ? '<ol class="so-steps">' + steps + '</ol>' : '') +
      sec('Programarea', 'clock', b ? kv([['Ziua', esc(b.date ? Number(b.date.slice(8, 10)) + '.' + b.date.slice(5, 7) + '.' + b.date.slice(0, 4) : '')], ['Ora', esc(b.time)],
        ['Starea', esc(b.held ? 'oră ținută, încă nefăcută programare' : b.status)], ['Nota', esc(b.note)]]) : '') +
      sec('Alte comenzi ale ei', 'listCheck', others ? '<ul class="so-others">' + others + '</ul>' : '') +
      sec('Plata', 'wallet', kv([['Prin', esc(d.pay.provider)], ['Pagina myPOS', d.pay.hasPage ? 'făcută' : 'nefăcută'], ['Acord WhatsApp', d.pay.consent ? 'da' : '']]) + '<p class="so-said" data-so-said></p>') +
      (d.message ? sec('Mesajul de readucere', 'chat', '<blockquote class="so-quote">' + esc(d.message) + '<small>Buton: Finalizează plata (comanda ei salvată, cu masajul facial cadou dacă plătește azi)</small></blockquote>') : '');
    var foot = (r.state !== 'paid' ? '<button type="button" class="k-btn is-outline" data-so-check="' + esc(r.id) + '">' + ic('refresh') + 'Verifică în myPOS</button>' : '') +
      (r.canMsg ? '<button type="button" class="k-btn is-accent" data-so-send="' + esc(r.id) + '">' + ic('chat') + 'Trimite mesajul</button>' : (r.msg ? '<span class="so-note">' + ic('chat') + 'Mesaj trimis ' + esc(when(r.msg.at)) + '</span>' : ''));
    h.set({ title: r.name || 'Comandă', subtitle: esc(r.stateLabel) + ' · ' + lei(r.amount) + ' · ' + esc(when(r.at)), body: body, footer: foot || null,
      onMount: function (el) {
        el.addEventListener('click', function (e) {
          var c = e.target.closest('[data-so-check]'); if (c) check(c.getAttribute('data-so-check'), c, el);
          var m = e.target.closest('[data-so-send]'); if (m) send(m.getAttribute('data-so-send'), m, h);
          var ld = e.target.closest('[data-so-lead]');
          if (ld) { var lid = ld.getAttribute('data-so-lead'); h.close(); K().go('pipeline'); setTimeout(function () { if (window.C360Pipeline) window.C360Pipeline.openLead(lid); }, 400); }
        });
      } });
  }

  // ------------------------------------------------------------------ the two actions
  function send(id, btn, h) {
    var r = S.d && S.d.rows.filter(function (x) { return x.id === id; })[0];
    var who = r ? (r.name || 'clienta') : 'clienta';
    K().ui().confirm({ title: 'Trimiți mesajul de readucere?', message: who + ' primește pe WhatsApp mesajul cu comanda ei salvată și masajul facial cadou dacă plătește azi. Un singur mesaj pe zi la un telefon.', confirmText: 'Trimite' })
      .then(function (yes) {
        if (!yes) return;
        return K().busy(btn, function () {
          return K().api('/api/portal-orders', { action: 'winback', id: id }).then(function (x) {
            K().ui().toast('Mesaj trimis' + (x.city ? ' de pe numărul din ' + x.city : '') + '.');
            if (h && h.close) h.close();
            load();
          }, function (e) { K().ui().toast((e && e.data && e.data.message) || (K().errText ? K().errText(e) : 'Nu s-a putut trimite.')); });
        });
      });
  }
  function check(id, btn, el) {
    K().busy(btn, function () {
      return K().api('/api/portal-orders', { action: 'check', id: id }).then(function (x) {
        var p = el.querySelector('[data-so-said]');
        if (p) p.textContent = x.state === 'paid' ? 'myPOS: plătită. Am trecut-o ca plătită.' : 'myPOS spune: ' + (x.said || 'neplătită') + '.';
        if (x.state === 'paid') load();
      }, function (e) { K().ui().toast((e && e.data && e.data.message) || 'myPOS nu a răspuns.'); });
    });
  }

  function onClick(e) {
    var v = e.target.closest('[data-so-view]');
    if (v) { S.view = v.getAttribute('data-so-view'); mem('c360.site.view', S.view); apply(); return; }
    if (!box || !box.contains(e.target)) return;
    var dd = e.target.closest('[data-so-days]');
    if (dd) { S.days = dd.getAttribute('data-so-days'); mem('c360.orders.days', S.days); S.d = null; draw(); load(); return; }
    if (e.target.closest('[data-so-reload]')) { var rb = e.target.closest('[data-so-reload]'); K().busy(rb, load); return; }
    var f = e.target.closest('[data-so-f]');
    if (f && f.getAttribute('data-so-f')) { S.filter = S.filter === f.getAttribute('data-so-f') && f.classList.contains('so-t') ? 'all' : f.getAttribute('data-so-f'); draw(); return; }
    var m = e.target.closest('[data-so-send]');
    if (m) { e.stopPropagation(); send(m.getAttribute('data-so-send'), m, null); return; }
    var row = e.target.closest('[data-so-id]');
    if (row) open(row.getAttribute('data-so-id'), row);
  }
  document.addEventListener('keydown', function (e) {
    if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.matches || !e.target.matches('.so-r')) return;
    e.preventDefault(); open(e.target.getAttribute('data-so-id'), e.target);
  });

  window.C360SiteOrders = { attach: attach, shown: shown };
})();
