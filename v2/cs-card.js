/* Cardul de Sărbători: the card's life on its page and on the home page.
   - the name on the card changes softly (Pentru tine, Pentru mama, ...) until a page chooses one (CSC.name)
   - on a computer the card leans towards the pointer
   - the cards left: 100 minus the real reservations not cancelled (/api/card-sarbatori); nothing is shown without it
   - the time left until 24 December 2026, 23:59 (Romania), every second */
(function () {
  'use strict';
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DEADLINE = Date.parse('2026-12-24T21:59:59Z');
  var NAMES = ['Pentru tine', 'Pentru mama', 'Pentru sora ta', 'Pentru prietena ta'];
  var CSC = window.CSC = { state: null, subs: [], fixed: false };

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
    CSC.state = s;
    $$('[data-cs-left]').forEach(function (el) { el.textContent = String(s.left); });
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
  // On sale (the owner, 22.11): 490, 990 (chosen first, „Cea mai bună valoare”) and the VIP one, „Cardul VIP Transformarea
  // 360”: 9.900 lei → 30.000 lei, for her and all her family, 5 per clinic. The 290 lei card is out of sale (its orders
  // and cards keep working on the server); vipShape() brings an older block (the live pages until a swap) to these three.
  var TIERS = { 290: [500, '1,7'], 490: [1000, '2'], 990: [2500, '2,5'], 9900: [30000, '3'] }, SALE = [490, 990, 9900], VIP = 9900, KEY = 'c360_cs_tier';
  var fmt = function (n) { return Math.round(n).toLocaleString('ro-RO'); };
  var saved = 990;
  try { var v = Number(localStorage.getItem(KEY)); if (SALE.indexOf(v) >= 0) saved = v; } catch (e) {}
  var VIP_WHY = 'Pentru tine și toată familia. Doar 5 carduri pe clinică, ediția de Crăciun.';
  var VIP_K = 'VIP · Transformarea 360', VIP_SUB = 'pentru tine și toată familia';
  var tierBox = function (t, best) {
    var g = TIERS[t];
    return '<label class="cst-t' + (best ? ' best' : '') + (t === VIP ? ' vip' : '') + '">' + (best ? '<em class="cst-best">Cea mai bună valoare</em>' : t === VIP ? '<em class="cst-vk">VIP · Transformarea 360</em>' : '') +
      '<input type="radio" name="cst" value="' + t + '"' + (t === 990 ? ' checked' : '') + '><small>Plătești</small><b>' + fmt(t) + ' lei</b><span>primești <strong>' + fmt(g[0]) + ' lei</strong></span><em class="cst-x">x' + g[1] + '</em></label>';
  };
  var VIP_TIER = '<div class="card cs-tier rv in vip"><span class="cs-best cs-vk">VIP · Transformarea 360</span><small>Plătești</small><b class="cs-tp">9.900 lei</b><p class="cs-tg">Primești <strong>30.000 lei</strong> în tratamente</p>' +
    '<p class="cs-ts"><span>Economisești 20.100 lei</span><span class="cs-mul">x3</span></p><ul class="cs-tb"><li>Pentru tine și toată familia, oricâte persoane</li><li>Începi cu revizia completă și planul tău personal</li>' +
    '<li>Doar 5 carduri pe clinică</li></ul><button type="button" class="btn ghost" data-cs-buy data-cs-tier="9900">Vreau cardul VIP</button></div>';
  var ROW = function (icon, title, text) { return '<div class="cs-row" data-cs-only="9900" hidden><i>' + icon + '</i><div><b>' + title + '</b><p>' + text + '</p></div><span class="cs-v inc">inclus</span></div>'; };
  var I_FAM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.8.2 5 2.5 5 5.8"/></svg>';
  var I_PLAN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 3.5h6v3H9zM8.5 11.5l2 2 4-4M8.5 17h7"/></svg>';
  function vipShape() {
    // the three cards of the block
    $$('[data-cst]').forEach(function (box) {
      if (box.querySelector('input[value="9900"]')) return;
      box.innerHTML = tierBox(490) + tierBox(990, true) + tierBox(VIP);
      // the reason under the headline, only with the VIP chosen
      if (!box.parentNode.querySelector('[data-cs-why]')) box.insertAdjacentHTML('beforebegin', '<p class="cst-why" data-cs-why data-cs-only="9900" hidden>' + VIP_WHY + '</p>');
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
        ROW(I_FAM, 'Pentru tine și toată familia', 'Doar la cardul VIP: îl pot folosi familia și prietenii tăi, oricâte persoane.'));
    });
    // the scarcity line: its VIP words beside the others (per clinic, vipLine)
    $$('.cst-urg').forEach(function (u) { if (!u.querySelector('.cst-vipl')) u.insertAdjacentHTML('beforeend', '<span class="cst-vipl" hidden></span>'); });
    // the line in place of „Plătesc online” while the VIP card has no PayLink
    $$('.cst-go').forEach(function (g) {
      var pb = g.querySelector('[data-cs-buy]');
      if (pb && !g.querySelector('[data-cs-call]')) pb.insertAdjacentHTML('beforebegin', '<p class="cst-call" data-cs-call hidden>Pentru cardul VIP te sunăm noi</p>');
    });
    // the page's words that still name the 290 one (its steps, its questions)
    var SAY = [['290, 490 sau 990 lei, pentru tine sau cadou, câte vrei.', '490, 990 sau 9.900 lei (VIP), pentru tine sau cadou, câte vrei.'],
      ['Trei: plătești 290 lei și primești 500 lei în tratamente; plătești 490 lei și primești 1.000 lei; plătești 990 lei și primești 2.500 lei.',
        'Trei: plătești 490 lei și primești 1.000 lei în tratamente; plătești 990 lei și primești 2.500 lei; cardul VIP: plătești 9.900 lei și primești 30.000 lei, pentru tine și toată familia, cu revizia completă și planul tău personal la început (doar 5 carduri pe clinică).']];
    $$('.tl p, .q .a p').forEach(function (p) { SAY.forEach(function (x) { if (p.children.length === 0 && p.textContent.indexOf(x[0]) >= 0) p.textContent = p.textContent.replace(x[0], x[1]); }); });
    // the gift of the online payment (the owner, 22.11): a BioLifting session in both clinics, no value in lei said
    var GIFT = [['La plata online: acces în Clubul 360 și un tratament cadou (EMS la Timișoara, Restart la Arad)', 'La plata online: o ședință de BioLifting cadou și acces în Clubul 360'],
      ['La plata online: EMS cadou la Timișoara, Restart cadou la Arad, și Clubul 360', 'La plata online: o ședință de BioLifting cadou și Clubul 360'],
      ['La plata online: o ședință de EMS la Timișoara, un Tratament Restart la Arad.', 'La plata online, în ambele clinici: tratament anti-rid sau de prevenție.'],
      ['Bonusurile (la Timișoara o ședință de EMS cadou, la Arad un Tratament Restart cadou, și locul în Clubul 360)', 'Bonusurile (o ședință de BioLifting cadou și locul în Clubul 360)'],
      ['un tratament cadou (la Timișoara o ședință de EMS, la Arad un Tratament Restart)', 'o ședință de BioLifting cadou (tratament anti-rid sau de prevenție)'],
      ['Tratamentul cadou (EMS la Timișoara, Restart la Arad)', 'Ședința de BioLifting cadou']];
    $$('main').forEach(function (m) {
      var w = document.createTreeWalker(m, NodeFilter.SHOW_TEXT), t;
      while ((t = w.nextNode())) { var v = t.nodeValue; if (v.indexOf('EMS') < 0 && v.indexOf('Restart') < 0) continue; GIFT.forEach(function (x) { if (v.indexOf(x[0]) >= 0) v = v.replace(x[0], x[1]); }); if (v !== t.nodeValue) t.nodeValue = v; }
    });
    $$('.cs-stack .cs-row').forEach(function (r) {
      var b = r.querySelector('b'), v = r.querySelector('.cs-v');
      if (b && v && b.textContent.trim() === 'Un tratament cadou') { b.textContent = 'O ședință de BioLifting cadou'; v.textContent = 'cadou'; v.classList.add('inc'); }
    });
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
      var T = v['Timișoara'] || { max: 5, left: 0 }, A = v.Arad || { max: 5, left: 0 };
      var max = city ? (v[city] || { max: 5 }).max : T.max === A.max ? T.max : 0;
      var head = (max ? 'Doar ' + max : 'Doar câteva') + ' carduri VIP pe clinică · ';
      var one = function (c, x) { return x.left > 0 ? 'au mai rămas <b>' + x.left + '</b>' + (city ? '' : ' la ' + c) : c + ': epuizat'; };
      mine.innerHTML = head + (city ? one(city, v[city] || { left: 0 }) : T.left > 0 && A.left > 0 ? 'au mai rămas <b>' + T.left + '</b> la Timișoara și <b>' + A.left + '</b> la Arad' : one('Timișoara', T) + ', ' + one('Arad', A));
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
    var get = TIERS[t][0], worth = get; // the gift has no value in lei said (22.11)
    var val = { getx: fmt(TIERS[vip ? 990 : t][0]) + ' lei', pay: fmt(t) + ' lei', get: fmt(get) + ' lei', payd: fmt(t) + ' lei.', getd: fmt(get) + ' lei.', save: fmt(get - t) + ' lei', save2: fmt(worth - t) + ' lei', worth: fmt(worth) + ' lei', mul: 'x' + TIERS[t][1] };
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
      var r = g.querySelector('[data-cs-reserve]');
      if (r && r.classList.contains('ghost') === call) { r.classList.toggle('ghost', !call); r.classList.toggle('book', call); }
    });
    $$('[data-cs-call]').forEach(function (el) { el.hidden = !call; });
    $$('[data-cs-pts] li').forEach(function (li) { if (/myPOS/.test(li.textContent)) li.hidden = call; });
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
  }
  clock(); setInterval(clock, 1000);
})();
