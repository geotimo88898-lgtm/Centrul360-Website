/* Cardul de Sărbători: the card's life on its page and on the home page.
   - the name on the card changes softly (Pentru tine, Pentru mama, ...) until a page chooses one (CSC.name)
   - on a computer the card leans towards the pointer
   - the cards left: 100 minus the real reservations not cancelled (/api/card-sarbatori); nothing is shown without it
   - the time left until 24 December 2026, 23:59 (Romania), every second
   - Black Friday (the owner, 24.11): while /api/card-sarbatori's bf is on, the 990 card paid online gives its bf credit
     (3.000 lei; in the clinic it stays 2.500), drawn black and gold over the first screen (cs-card.css, .cs-bf); off, nothing */
(function () {
  'use strict';
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DEADLINE = Date.parse('2026-12-24T21:59:59Z');
  var NAMES = ['Pentru tine', 'Pentru mama', 'Pentru sora ta', 'Pentru prietena ta'];
  var CSC = window.CSC = { state: null, subs: [], fixed: false };
  var BF = null; // { start, end, tier, credit, old } while Black Friday is on (bfRead)

  // ---- the name on the card
  function setName(el, text) {
    if (el.textContent === text) return;
    if (reduce) { el.textContent = text; return; }
    el.classList.add('out');
    setTimeout(function () {
      el.textContent = text; el.classList.remove('out'); el.classList.add('pre');
      void el.offsetWidth; el.classList.remove('pre');
    }, 260);
  }
  CSC.name = function (text) { CSC.fixed = true; $$('[data-csc-name]').forEach(function (el) { setName(el, text); }); };
  var ni = 0;
  if ($$('[data-csc-name]').length) setInterval(function () {
    if (CSC.fixed || document.hidden) return;
    ni = (ni + 1) % NAMES.length;
    $$('[data-csc-name]').forEach(function (el) { setName(el, NAMES[ni]); });
  }, 3200);

  // ---- leans towards the pointer (a mouse only)
  if (!reduce && matchMedia('(hover: hover) and (pointer: fine)').matches) $$('.csc-stage').forEach(function (st) {
    var t = st.querySelector('.csc-tilt'); if (!t) return;
    st.addEventListener('pointermove', function (e) {
      var r = st.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      t.style.setProperty('--ry', (x * 14).toFixed(2) + 'deg'); t.style.setProperty('--rx', (-y * 12).toFixed(2) + 'deg');
    });
    st.addEventListener('pointerleave', function () { t.style.setProperty('--ry', '0deg'); t.style.setProperty('--rx', '0deg'); });
  });

  // ---- the cards left
  CSC.on = function (fn) { CSC.subs.push(fn); if (CSC.state) fn(CSC.state); };
  CSC.set = function (s) {
    // the checkout in the page (switched on, or the preview ?plata=test, /v2/): every card is paid online, the VIP 10% off
    if (s && (s.embedded || /^\/v2\//.test(location.pathname) || /[?&]plata=test\b/.test(location.search))) {
      s = Object.assign({}, s, { links: Object.assign({}, s.links), online: Object.assign({}, s.online) });
      SALE.forEach(function (t) { if (!s.links[t]) s.links[t] = '#plata'; });
      s.online[VIP] = Math.round(VIP * 0.9);
    }
    CSC.state = s;
    bfRead(s);
    $$('[data-cs-left]').forEach(function (el) {
      el.textContent = String(s.left);
      // „1 card”, „2 carduri” (the text after the number is the next text node: „ carduri”)
      var n = el.nextSibling;
      if (n && n.nodeType === 3 && /^\s*card(uri)?\b/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/^(\s*)card(uri)?/, '$1' + (s.left === 1 ? 'card' : 'carduri'));
    });
    $$('[data-cs-bar]').forEach(function (el) { el.style.setProperty('--k', (s.left / s.total).toFixed(3)); });
    $$('[data-cs-live]').forEach(function (el) { el.hidden = false; });
    CSC.subs.forEach(function (fn) { try { fn(s); } catch (e) {} });
    if (CSC.tier && CSC.current) CSC.tier(CSC.current, true);
  };
  fetch('/api/card-sarbatori').then(function (r) { if (!r.ok) throw new Error('card'); return r.json(); }).then(function (d) {
    if (d && typeof d.left === 'number') CSC.set(d);
  }).catch(function () {});

  // ---- the snow of the first screen: fine flakes, rose and gold, that fall slowly (none with reduced motion)
  var FLAKE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10"/><path d="M9.5 3.5 12 6l2.5-2.5M9.5 20.5 12 18l2.5 2.5"/></svg>';
  var DOT = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>';
  var TINTS = ['rgba(214,122,134,.6)', 'rgba(201,160,74,.65)', 'rgba(236,135,166,.55)', 'rgba(227,194,122,.7)']; // rose and gold: no blue round the card (the owner, 20.11)
  if (!reduce) $$('.csc-snow').forEach(function (box) {
    // never over the words: on a computer they fall on the card's side; on a phone only around the card (cs-card.css)
    var wide = innerWidth > 920, n = innerWidth < 640 ? 16 : 24, html = '';
    for (var i = 0; i < n; i++) {
      var dot = i % 3 === 2, s = dot ? 4 + Math.random() * 4 : 10 + Math.random() * 10;
      html += '<i style="left:' + (wide ? 46 + Math.random() * 54 : Math.random() * 100).toFixed(1) + '%;--s:' + s.toFixed(1) + 'px;--d:' + (13 + Math.random() * 12).toFixed(1) + 's;--w:-' + (Math.random() * 24).toFixed(1) +
        's;--x:' + (Math.random() * 60 - 30).toFixed(0) + 'px;--o:' + (dot ? 0.7 : 0.85) + ';--c:' + TINTS[i % TINTS.length] + '">' + (dot ? DOT : FLAKE) + '</i>';
    }
    box.innerHTML = html;
    var size = function () { box.style.setProperty('--h', (box.offsetHeight + 30) + 'px'); };
    size(); addEventListener('resize', size);
  });

  // ---- the card chosen (490 / 990 / VIP): everything that depends on it changes at once, and it is kept from page to page
  // On sale (the owner, 22.11): 490, 990 (chosen first, „Cel mai cumpărat”) and the VIP one, „Cardul VIP Transformarea
  // 360”: 9.900 lei → 30.000 lei, for her and all her family, 5 per clinic. The 290 lei card is out of sale (its orders
  // and cards keep working on the server); vipShape() brings an older block (the live pages until a swap) to these three.
  var TIERS = { 290: [500, '1,7'], 490: [1000, '2'], 990: [2500, '2,5'], 9900: [30000, '3'] }, SALE = [490, 990, 9900], VIP = 9900, KEY = 'c360_cs_tier';
  var fmt = function (n) { return Math.round(n).toLocaleString('ro-RO'); };
  var saved = 990;
  // every visit starts on 990 (the owner, 23.11: „preselectat cel de 990”), not on the card chosen last time
  var VIP_K = 'VIP · Transformarea 360', VIP_SUB = 'pentru tine și cei dragi';
  var tierBox = function (t, best) {
    var g = TIERS[t];
    return '<label class="cst-t' + (best ? ' best' : '') + (t === VIP ? ' vip' : '') + '">' + (best ? '<em class="cst-best">Cel mai cumpărat</em>' : t === VIP ? '<em class="cst-vk">VIP</em>' : '') +
      '<input type="radio" name="cst" value="' + t + '"' + (t === 990 ? ' checked' : '') + '><small>Plătești</small><b>' + fmt(t) + ' lei</b><span>primești <strong>' + fmt(g[0]) + ' lei</strong></span><em class="cst-x">x' + g[1] + '</em></label>';
  };
  var VIP_TIER = '<div class="card cs-tier rv in vip"><span class="cs-best cs-vk">VIP · Transformarea 360</span><small>Plătești</small><b class="cs-tp">9.900 lei</b><p class="cs-tg">Primești <strong>30.000 lei</strong> în tratamente</p>' +
    '<p class="cs-ts"><span>Economisești 20.100 lei</span><span class="cs-mul">x3</span></p><ul class="cs-tb"><li>Pentru tine și cei dragi, oricâte persoane</li><li>Începi cu revizia completă și planul tău personal</li>' +
    '<li>La plata online: 10% reducere (8.910 lei) și Clubul 360</li></ul><button type="button" class="btn ghost" data-cs-buy data-cs-tier="9900">Vreau cardul VIP</button></div>';
  var ROW = function (icon, title, text) { return '<div class="cs-row" data-cs-only="9900" hidden><i>' + icon + '</i><div><b>' + title + '</b><p>' + text + '</p></div><span class="cs-v inc">inclus</span></div>'; };
  var I_FAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.8.2 5 2.5 5 5.8"/></svg>';
  var I_PLAN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 3.5h6v3H9zM8.5 11.5l2 2 4-4M8.5 17h7"/></svg>';
  function vipShape() {
    // the three cards of the block
    $$('[data-cst]').forEach(function (box) {
      if (box.querySelector('input[value="9900"]')) return;
      box.innerHTML = tierBox(490) + tierBox(990, true) + tierBox(VIP);
    });
    // the three cards lower on the page: the 290 one gives its place to the VIP one (last)
    $$('.cs-tiers').forEach(function (row) {
      if (row.querySelector('[data-cs-tier="9900"]')) return;
      var old = row.querySelector('[data-cs-tier="290"]'), c = old && old.closest('.cs-tier');
      if (c) c.parentNode.removeChild(c);
      row.insertAdjacentHTML('beforeend', VIP_TIER);
    });
    // the card's rows, with what the VIP one has more
    $$('.cs-stack').forEach(function (st) {
      if (st.querySelector('[data-cs-only="9900"]')) return;
      var tot = st.querySelector('.cs-tot');
      if (tot) tot.insertAdjacentHTML('beforebegin', ROW(I_PLAN, 'Revizia completă și planul tău personal', 'Doar la cardul VIP: la început, o revizie completă și planul tău, făcut pentru tine.') +
        ROW(I_FAM, 'Pentru tine și cei dragi', 'Doar la cardul VIP: îl pot folosi și cei dragi ai tăi, oricâte persoane.'));
    });
    // the scarcity line: its VIP words beside the others (per clinic, vipLine)
    $$('.cst-urg').forEach(function (u) { if (!u.querySelector('.cst-vipl')) u.insertAdjacentHTML('beforeend', '<span class="cst-vipl" hidden></span>'); });
    // the line in place of „Plătesc online” while the VIP card has no PayLink
    $$('.cst-go').forEach(function (g) {
      var pb = g.querySelector('[data-cs-buy]');
      if (pb && !g.querySelector('[data-cs-call]')) pb.insertAdjacentHTML('beforebegin', '<p class="cst-call" data-cs-call hidden>Pentru cardul VIP te sunăm noi</p>');
    });
    // the page's words that still name the 290 one (its steps, its questions)
    var SAY = [['290, 490 sau 990 lei, pentru tine sau cadou, câte vrei.', '490, 990 sau 9.900 lei (VIP), pentru tine sau cadou, până la 5 deodată.'],
      ['Trei: plătești 290 lei și primești 500 lei în tratamente; plătești 490 lei și primești 1.000 lei; plătești 990 lei și primești 2.500 lei.',
        'Trei: plătești 490 lei și primești 1.000 lei în tratamente; plătești 990 lei și primești 2.500 lei; cardul VIP: plătești 9.900 lei și primești 30.000 lei, pentru tine și cei dragi, cu revizia completă și planul tău personal la început.']];
    $$('.tl p, .q .a p').forEach(function (p) { SAY.forEach(function (x) { if (p.children.length === 0 && p.textContent.indexOf(x[0]) >= 0) p.textContent = p.textContent.replace(x[0], x[1]); }); });
    // the VIP card paid online costs 10% less (the owner, 22.11), when its 10% PayLink is set (CSC.state.online), and has no
    // gift; the 490 and 990 ones keep the BioLifting gift online. Their words kept here to come back to (CSC.tier)
    $$('.cst-go [data-cs-buy] [data-cs-v="pay"]').forEach(function (el) { el.setAttribute('data-cs-v', 'payon'); });
    $$('.cst-pts [data-cs-v="save"]').forEach(function (el) { if (!el.parentNode.querySelector('[data-cs-svon]')) el.insertAdjacentHTML('afterend', '<span data-cs-svon hidden> la plata online</span>'); });
    $$('[data-cs-gift]').forEach(function (el) { if (el._h == null) el._h = el.innerHTML; });
    // the VIP one's reasons, under its savings (the owner, 22.11: the sales arguments we had and did not use): shared with
    // her people (30.000 lei at 5 people = 6.000 lei each), the full review first, the long validity
    $$('[data-cs-pts]').forEach(function (ul) {
      if (ul.querySelector('[data-cs-vipr]')) return;
      var first = ul.querySelector('li'), tk = first && first.querySelector('i') ? first.querySelector('i').outerHTML : '';
      var li = function (h) { return '<li data-cs-vipr data-cs-only="9900" hidden>' + tk + '<span>' + h + '</span></li>'; };
      var html = li('Îl împarți cu cei dragi: la 5 persoane, <b>6.000 lei</b> de tratamente fiecare') +
        li('Începi cu <b>revizia completă</b> și planul tău personal');
      if (first) first.insertAdjacentHTML('afterend', html); else ul.insertAdjacentHTML('afterbegin', html);
    });
    $$('.cst-pts li span').forEach(function (sp) { if (/^La plata online/.test(sp.textContent) && sp._t == null) sp._t = sp.textContent; });
    // the ideas' sum: the 990 card's when the VIP is chosen (they are its ideas)
    $$('#exemple .eye [data-cs-v="get"]').forEach(function (el) { el.setAttribute('data-cs-v', 'getx'); });
    // the card's own words, kept to come back to
    $$('.csc-k').forEach(function (k) { var tn = [].slice.call(k.childNodes).filter(function (n) { return n.nodeType === 3 && n.nodeValue.trim(); })[0]; if (tn && !k._t) k._t = { n: tn, v: tn.nodeValue }; });
    $$('.csc-val small').forEach(function (el) { if (el._t == null) el._t = el.textContent; });
  }
  // the clinic chosen in the block ('' before she chooses)
  var cityOf = function () { var c = document.querySelector('input[name="cst-city"]:checked'); return c ? c.value : ''; };
  // „Doar 5 carduri VIP pe clinică · au mai rămas N” (her clinic's, or both before she chooses); a clinic sold out: „epuizat”
  function vipLine(on) {
    var v = CSC.state && CSC.state.vip, city = cityOf();
    $$('.cst-urg').forEach(function (u) {
      var other = [].slice.call(u.children).filter(function (x) { return !x.classList.contains('dot') && !x.classList.contains('cst-vipl'); });
      var mine = u.querySelector('.cst-vipl');
      other.forEach(function (x) { x.hidden = !!on; });
      if (!mine) return;
      mine.hidden = !on;
      if (!on || !v) return;
      var T = v['Timișoara'] || { left: 0 }, A = v.Arad || { left: 0 };
      // one line (the owner, 22.11): „Au mai rămas doar N carduri VIP” (her clinic's; before she chooses, the clinic with the most left: the count is per clinic)
      var n = city ? (v[city] || { left: 0 }).left : Math.max(0, T.left, A.left); // per clinic, never both added up
      mine.innerHTML = n > 0 ? 'Au mai rămas doar <b>' + n + '</b> ' + (n === 1 ? 'card VIP' : 'carduri VIP') : 'Cardurile VIP s-au epuizat' + (city ? ' la ' + city : '');
    });
    // a clinic with no VIP card left: „epuizat” on its button
    $$('[data-cs-city] label').forEach(function (l) {
      var i = l.querySelector('input'), x = v && v[i.value], out = !!(on && x && x.left <= 0);
      var tag = l.querySelector('.cst-out');
      if (out && !tag) l.insertAdjacentHTML('beforeend', '<small class="cst-out">epuizat</small>');
      if (!out && tag) tag.parentNode.removeChild(tag);
      l.classList.toggle('is-out', out);
    });
  }
  document.addEventListener('change', function (e) { if (e.target && e.target.name === 'cst-city' && CSC.current === VIP) vipLine(true); });
  vipShape();
  function setCredit(el, text) {
    if (el.textContent === text) return;
    if (reduce) { el.textContent = text; return; }
    el.classList.add('out');
    setTimeout(function () { el.textContent = text; el.classList.remove('out'); el.classList.add('pre'); void el.offsetWidth; el.classList.remove('pre'); }, 120);
  }
  CSC.tier = function (t, quiet) {
    t = Number(t); if (SALE.indexOf(t) < 0) return;
    CSC.current = t;
    var vip = t === VIP;
    var get = creditOf(t), worth = get; // the gift has no value in lei said (22.11); Black Friday: the 990 card's online credit
    var on = (CSC.state && CSC.state.online) || {}, d = Number(on[t]) || 0; // the VIP's price online, when its 10% link is set
    var val = { getx: fmt(TIERS[vip ? 990 : t][0]) + ' lei', pay: fmt(t) + ' lei', get: fmt(get) + ' lei', payd: fmt(t) + ' lei.', getd: fmt(get) + ' lei.', save: fmt(get - (d || t)) + ' lei', save2: fmt(worth - t) + ' lei', worth: fmt(worth) + ' lei', mul: 'x' + TIERS[t][1] };
    $$('[data-cs-v]').forEach(function (el) { var k = el.getAttribute('data-cs-v'); if (val[k] != null && el.textContent !== val[k]) el.textContent = val[k]; });
    $$('[data-csc-credit]').forEach(function (el) { setCredit(el, fmt(get)); });
    $$('[data-cs-only]').forEach(function (el) { el.hidden = el.getAttribute('data-cs-only').split(',').indexOf(String(t)) < 0; });
    $$('[data-cs-ex]').forEach(function (el) { el.hidden = el.getAttribute('data-cs-ex') !== String(vip ? 990 : t); }); // the VIP one: the 990 card's ideas
    $$('[data-cs-follow]').forEach(function (el) { el.setAttribute('data-cs-tier', String(t)); });
    $$('[data-cst] input').forEach(function (i) { i.checked = Number(i.value) === t; });
    var link = CSC.state && (CSC.state.open || vip) && CSC.state.links && CSC.state.links[t];
    $$('[data-cs-if-link]').forEach(function (el) { el.hidden = !link; }); // the PayLink of this card: „Rezervă cardul” as the second way
    // the VIP one: its card (black and gold), its words, its line of cards left; with no PayLink yet, „te sunăm noi” in place
    // of „Plătesc online” and „Rezerv și plătesc în clinică” the main button
    $$('.csc-stage').forEach(function (s) { if (s.querySelector('[data-csc-credit]')) s.classList.toggle('is-vip', vip); });
    $$('.csc-k').forEach(function (k) { if (k._t) k._t.n.nodeValue = vip ? VIP_K : k._t.v; });
    $$('.csc-val small').forEach(function (el) { if (el._t != null) el.textContent = vip ? VIP_SUB : el._t; });
    vipLine(vip);
    var call = vip && !link;
    $$('.cst-go, .cs-c').forEach(function (g) {
      g.classList.toggle('cs-vipcall', call);
      g.classList.toggle('cs-vipon', vip); // the VIP one: gold „Plătesc online”, black „Rezerv” (the owner, 22.11)
      var r = g.querySelector('[data-cs-reserve]');
      if (r && r.classList.contains('ghost') === call) { r.classList.toggle('ghost', !call); r.classList.toggle('book', call); }
    });
    $$('[data-cs-call]').forEach(function (el) { el.hidden = !call; });
    $$('[data-cs-pts] li').forEach(function (li) { if (/myPOS/.test(li.textContent)) li.hidden = call; });
    // online: the VIP 10% less (its full price struck through) and no gift; the others as they were
    $$('[data-cs-v="payon"]').forEach(function (el) { var h = d ? '<s>' + fmt(t) + ' lei</s> ' + fmt(d) + ' lei' : fmt(t) + ' lei'; if (el.innerHTML !== h) el.innerHTML = h; });
    $$('[data-cs-gift]').forEach(function (el) { var h = vip ? '−10% și Clubul 360 la plata online' : el._h; if (h != null && el.innerHTML !== h) el.innerHTML = h; el.hidden = vip && !(d && link); });
    $$('[data-cs-svon]').forEach(function (el) { el.hidden = !d; });
    $$('.cst-pts li span').forEach(function (sp) { if (sp._t != null) sp.textContent = !vip ? sp._t : d ? 'La plata online: 10% reducere și acces în Clubul 360' : 'La plata online: acces în Clubul 360'; });
    $$('.cs-stack .cs-row').forEach(function (r) { var b = r.querySelector('b'); if (b && /BioLifting/.test(b.textContent)) r.hidden = vip; });
    bfPaint(t);
    if (!quiet) { try { localStorage.setItem(KEY, String(t)); } catch (e) {} }
  };
  $$('[data-cst]').forEach(function (box) { box.addEventListener('change', function (e) { if (e.target.name === 'cst') CSC.tier(e.target.value); }); });
  // a button for one card (the three cards lower on the page) chooses it too
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-cs-buy][data-cs-tier]:not([data-cs-follow])'); if (b) CSC.tier(b.getAttribute('data-cs-tier')); }, true);
  CSC.tier(saved, true);
  CSC.VIP = VIP; CSC.SALE = SALE;

  // ---- the time left
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  function clock() {
    var ms = Math.max(0, DEADLINE - Date.now()), s = Math.floor(ms / 1000);
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    $$('[data-cs-time]').forEach(function (el) { el.textContent = ms ? d + 'z ' + two(h) + 'h ' + two(m) + 'm ' + two(x) + 's' : 'încheiată'; });
    $$('[data-cs-cd]').forEach(function (el) {
      var put = function (k, v) { var b = el.querySelector('[data-' + k + ']'); if (b && b.textContent !== v) b.textContent = v; };
      put('d', String(d)); put('h', two(h)); put('m', two(m)); put('s', two(x));
    });
    CSC.ended = !ms;
    bfClock();
  }
  clock(); setInterval(clock, 1000);

  // ---- Black Friday (the owner, 24.11: from today until Sunday 29.11, 23:59 in Romania). Its terms come from the server
  // (/api/card-sarbatori -> bf, made by api/_lib/card-terms.js): { on, start, until, tier: 990, creditOnline: 3000,
  // creditClinic: 2500 }. While it is on, that card paid online gives creditOnline; reserved and paid in the clinic, creditClinic. Everything of it is drawn
  // here and only while it is on (html.cs-bf, the bf- parts, cs-card.css); off, or when it ends with the page open, the page
  // is exactly as it was. The preview (/v2/...?bf=test) shows it before the server has it.
  function creditOf(t) { return bfLive() && Number(t) === BF.tier ? BF.credit : TIERS[t][0]; }
  CSC.creditOf = creditOf; // the payment sheet's first numbers (v2/cs-buy.js) can ask here
  function bfOf(s) {
    var b = s && s.bf;
    if (b && b.on !== true && /^\/v2\//.test(location.pathname) && /[?&]bf=test\b/.test(location.search)) b = Object.assign({}, b, { on: true }); // the preview, before the switch
    if (!b && /^\/v2\//.test(location.pathname) && /[?&]bf=test\b/.test(location.search)) b = { on: true, start: '2026-11-24T08:00:00Z', until: '2026-11-29T21:59:59Z', tier: 990, creditOnline: 3000, creditClinic: 2500 };
    if (!b || b.on !== true) return null;
    var tier = Number(b.tier) || 990; if (!TIERS[tier]) return null;
    var c = b.creditOnline != null ? b.creditOnline : b.credit != null ? b.credit : b.online;
    if (c && typeof c === 'object') c = c[tier];
    if (c && typeof c === 'object') c = c.online != null ? c.online : c.credit;
    var credit = Number(c) || 0, old = Number(b.creditClinic) || TIERS[tier][0];
    var start = Date.parse(b.start || b.from || '') || 0, end = Date.parse(b.end || b.until || b.to || '') || Date.parse('2026-11-29T21:59:59Z');
    return credit > old ? { start: start, end: end, tier: tier, credit: credit, old: old } : null;
  }
  function bfLive() { var n = Date.now(); return !!BF && n >= BF.start && n < BF.end; }
  CSC.bfLive = bfLive;
  function bfRead(s) { var was = document.documentElement.classList.contains('cs-bf'); BF = bfOf(s); if (bfLive() || was) bfApply(true); }
  function bfApply(fromSet) {
    var on = bfLive();
    if (on) bfBuild();
    document.documentElement.classList.toggle('cs-bf', on);
    bfClock();
    if (!fromSet && CSC.current) CSC.tier(CSC.current, true);
  }
  // the time left, and the end with the page open (it goes back to the page as it was)
  function bfClock() {
    if (!BF) return;
    var on = bfLive();
    if (on !== document.documentElement.classList.contains('cs-bf')) { bfApply(); return; }
    if (!on) return;
    var s = Math.floor(Math.max(0, BF.end - Date.now()) / 1000), two2 = function (n) { return (n < 10 ? '0' : '') + n; };
    $$('[data-bf-cd]').forEach(function (el) {
      var put = function (k, v) { var b = el.querySelector('[data-' + k + ']'); if (b && b.textContent !== v) b.textContent = v; };
      put('d', String(Math.floor(s / 86400))); put('h', String(Math.floor(s % 86400 / 3600))); put('m', two2(Math.floor(s % 3600 / 60)));
    });
  }
  var CARD_I = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/></svg>';
  var BOLT_I = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>';
  var built = false;
  function bfBuild() {
    if (built) return; built = true;
    var lei = function (n) { return fmt(n) + ' lei'; };
    var get = BF.credit, old = BF.old, T = BF.tier;
    var item = '<span><b>Black Friday</b><i>✦</i>Doar la plata online<i>✦</i>Până duminică, 29 noiembrie<i>✦</i>Plătești ' + lei(T) + ', primești ' + lei(get) + '<i>✦</i></span>';
    $$('.csc-xmas').forEach(function (sec) {
      if (!sec.querySelector('[data-cst]')) return;
      sec.insertAdjacentHTML('afterbegin', '<div class="bf-rib" aria-hidden="true"><div class="bf-rib-t">' + item + item + item + '</div><div class="bf-rib-t">' + item + item + item + '</div></div>');
      var txt = sec.querySelector('.txt');
      if (txt) txt.insertAdjacentHTML('afterbegin', '<div class="bf-head"><p class="bf-mark">BLACK FRIDAY</p><div class="bf-row">' +
        '<span class="bf-badge">' + BOLT_I + '<span><b>Doar la plata online</b><i> · </i><span>până duminică, 29 noiembrie</span></span></span>' +
        '<div class="bf-cd" data-bf-cd role="timer"><span class="bf-cd-l"><i class="bf-live" aria-hidden="true"></i>Se termină în</span><span class="bf-tiles">' +
        '<span class="bf-tile"><b data-d></b><small>z</small></span><span class="bf-tile"><b data-h></b><small>h</small></span><span class="bf-tile"><b data-m></b><small>m</small></span></span></div></div></div>');
      var h1 = sec.querySelector('h1');
      if (h1) h1.insertAdjacentHTML('afterend', '<p class="bf-only" data-bf990><i>' + CARD_I + '</i><span><b>Doar dacă plătești online, cu cardul.</b> Dacă rezervi și plătești în clinică, rămâne ' + lei(old) + '.</span></p>');
      $$('.csc-float', sec).forEach(function (f) { var st = f.closest('.csc-stage'); if (st && st.querySelector('[data-csc-credit]')) f.insertAdjacentHTML('beforeend', '<span class="bf-seal" data-bf990 aria-hidden="true"><small>BLACK FRIDAY</small><b>+' + fmt(get - old) + '</b><em>LEI</em><i>la plata online</i></span>'); });
      var inp = sec.querySelector('.cst-t input[value="' + T + '"]'), box = inp && inp.closest('.cst-t');
      if (box) box.insertAdjacentHTML('beforeend', '<span class="bf-tier">primești <s>' + lei(old) + '</s><span class="bf-now"><em>Online:</em> ' + lei(get) + '</span><span class="bf-cl">rezervi și plătești în clinică: <em>' + lei(old) + '</em></span></span>');
      $$('.cst-go [data-cs-buy][data-cs-follow]', sec).forEach(function (b) { var l = b.querySelector('span'); if (l) l.insertAdjacentHTML('beforeend', '<span class="bf-get" data-bf990> → primesc ' + lei(get) + '</span>'); });
      $$('.cst-go [data-cs-reserve]', sec).forEach(function (r) { r.insertAdjacentHTML('afterend', '<p class="bf-note" data-bf990>Dacă rezervi și plătești în clinică, rămâne ' + lei(old) + '.</p>'); });
    });
    // lower on the card's page: a line under the card's rows, and its card among the three
    $$('.cs-stack').forEach(function (st) { st.insertAdjacentHTML('afterend', '<p class="bf-fine" data-bf990><b>Black Friday, până duminică, 29 noiembrie:</b> cu plata online, cardul de ' + lei(T) + ' vine cu ' + lei(get) + ' în tratamente. Dacă rezervi și plătești în clinică, rămâne ' + lei(old) + '.</p>'); });
    $$('.cs-tier').forEach(function (c) {
      if (!c.querySelector('[data-cs-tier="' + T + '"]')) return;
      var tg = c.querySelector('.cs-tg'), ts = c.querySelector('.cs-ts span');
      if (tg) tg._bf = [tg.innerHTML, 'Primești <strong><s>' + lei(old) + '</s> ' + lei(get) + '</strong> în tratamente, la plata online'];
      if (ts) ts._bf = [ts.innerHTML, 'Economisești ' + lei(get - T)];
    });
  }
  function bfPaint(t) {
    var on = bfLive(), mine = on && Number(t) === BF.tier;
    document.documentElement.classList.toggle('cs-bf', on);
    $$('[data-bf990]').forEach(function (el) { el.hidden = !mine; });
    if (mine) $$('h1 [data-cs-v="getd"], h2 [data-cs-v="getd"]').forEach(function (el) { el.innerHTML = '<s class="bf-old">' + fmt(BF.old) + '</s> ' + fmt(BF.credit) + ' lei.'; });
    $$('.cst-best').forEach(function (el) { if (el._t == null) el._t = el.textContent; var v = on ? 'Black Friday' : el._t; if (el.textContent !== v) el.textContent = v; });
    $$('.cs-tier .cs-tg, .cs-tier .cs-ts span').forEach(function (el) { if (!el._bf) return; var v = el._bf[on ? 1 : 0]; if (el.innerHTML !== v) el.innerHTML = v; });
  }
})();
