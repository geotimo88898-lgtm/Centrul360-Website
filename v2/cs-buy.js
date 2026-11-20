/* Cardul de Sărbători: the checkout in a window, on every page (v2/cs-buy.css). Any [data-cs-buy] opens it
   ([data-cs-tier] picks the card, 990 otherwise), grown out of the button and gone back into it. One screen, one button.
   Online payment is our own checkout with the myPOS card form inside it (the Embedded SDK, like Stripe Elements; only
   the money goes to myPOS): the order is made on the server first (our orderID, the sum made there), the form shows for
   that sum, „Plătește X lei” saves her details and pays; myPOS tells the server, the window asks it. Without the form set
   up (MYPOS_EMBED_* on the server): „Rezervă cardul, plătești în salon”. The page never decides a sum. */
(function () {
  'use strict';
  var TIERS = [[290, 500, '1,7'], [490, 1000, '2'], [990, 2500, '2,5']];
  var MAXQ = 5, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lei = function (n) { return Math.round(n).toLocaleString('ro-RO') + ' lei'; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ARROW = '<svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>';
  var st = { tier: 990, qty: 1, gift: false, online: false, open: true, left: 10, loaded: false, draft: '', pay: null, made: '' };
  var root, panel, form, from = null, busy = false, timer = 0, sdk = null;
  var post = function (b) { return fetch('/api/card-sarbatori', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(function (r) { return r.json(); }); };

  function load() {
    return fetch('/api/card-sarbatori').then(function (r) { return r.json(); }).then(function (d) {
      if (d && typeof d.left === 'number') { st.online = !!d.online; st.open = d.open !== false; st.left = d.left; st.loaded = true; }
    }).catch(function () {});
  }
  function loadSdk() {
    if (window.MyPOSEmbedded) return Promise.resolve();
    if (sdk) return sdk;
    sdk = new Promise(function (ok, no) { var s = document.createElement('script'); s.src = '/v2/mypos-embedded-sdk.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    return sdk;
  }

  function build() {
    root = document.createElement('div');
    root.className = 'csb'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'csb-t'); root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<div class="csb-bg" data-csb-close></div><div class="csb-p" tabindex="-1"><span class="csb-grab" aria-hidden="true"></span><div class="csb-in">' +
      '<div class="csb-h"><h2 id="csb-t">Cardul de <em>Sărbători</em></h2><button type="button" class="csb-x" data-csb-close aria-label="Închide"><i></i><i></i></button></div>' +
      '<div class="csb-sc"><form class="csb-f" novalidate>' +
        '<div><span class="csb-l" id="csb-l1">Alege cardul</span><div class="csb-tiers" role="radiogroup" aria-labelledby="csb-l1">' +
        TIERS.map(function (t) {
          return '<label class="csb-t">' + (t[0] === 990 ? '<em class="best">Cea mai bună valoare</em>' : '') + '<input type="radio" name="tier" value="' + t[0] + '">' +
            '<small>Plătești</small><b>' + lei(t[0]) + '</b><span>primești <strong>' + lei(t[1]) + '</strong> în tratamente</span><em class="x">x' + t[2] + '</em></label>';
        }).join('') + '</div></div>' +
        '<div class="csb-q"><div><span class="csb-l" id="csb-l2">Câte carduri?</span><small>Până la 5.</small></div>' +
          '<div class="csb-st" role="group" aria-labelledby="csb-l2"><button type="button" data-q="-1" aria-label="Mai puține">−</button><output aria-live="polite">1</output><button type="button" data-q="1" aria-label="Mai multe">+</button></div></div>' +
        '<div><span class="csb-l" id="csb-l4">Pentru cine e?</span><div class="csb-seg" role="radiogroup" aria-labelledby="csb-l4"><label><input type="radio" name="for" value="me" checked>Pentru mine</label><label><input type="radio" name="for" value="gift">Cadou</label></div>' +
          '<div class="csb-nm"></div></div>' +
        '<div class="csb-two"><div><span class="csb-l">Numele tău</span><input type="text" name="name" autocomplete="name" placeholder="ex: Maria Popescu"></div>' +
          '<div><span class="csb-l">Telefon (WhatsApp)</span><input type="tel" name="phone" inputmode="tel" autocomplete="tel" placeholder="07xx xxx xxx"></div></div>' +
        '<div><span class="csb-l" id="csb-l3">Clinica</span><div class="csb-seg" role="radiogroup" aria-labelledby="csb-l3"><label><input type="radio" name="city" value="Timișoara">Timișoara</label><label><input type="radio" name="city" value="Arad">Arad</label></div></div>' +
        '<div class="csb-pay" hidden><span class="csb-l"><span class="csb-lk">' + LOCK + '</span>Cardul bancar</span><div class="csb-mp" id="csbPayForm"></div><p class="csb-wait">Se încarcă plata securizată…</p></div>' +
        '<label class="csb-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>' +
        '<label class="csb-ok"><input type="checkbox" name="consent"><i>' + TICK + '</i><span>Sunt de acord să fiu contactat/ă telefonic sau pe WhatsApp de Centrul360 pentru card.</span></label>' +
      '</form></div>' +
      '<div class="csb-ft"><p class="csb-sum"><span class="p">Plătești <b data-csb-pay></b></span><span class="g">primești <b data-csb-get></b> în tratamente</span></p><p class="csb-err" role="alert"></p>' +
        '<button type="button" class="btn book csb-go"></button><p class="csb-note"></p></div>' +
      '<div class="csb-done" aria-live="polite"></div>' +
    '</div></div>';
    document.body.appendChild(root);
    panel = root.querySelector('.csb-p'); form = root.querySelector('form');
    root.addEventListener('click', function (e) { if (e.target.closest('[data-csb-close]')) close(); });
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('open')) close(); });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'tier') { st.tier = Number(e.target.value); paint(); intent(); if (window.CSC && window.CSC.tier) window.CSC.tier(st.tier); else { try { localStorage.setItem('c360_cs_tier', String(st.tier)); } catch (x) {} } }
      if (e.target.name === 'for') { st.gift = e.target.value === 'gift'; paint(); if (st.gift) { var f = form.querySelector('[name="n0"]'); if (f) f.focus(); } }
    });
    form.addEventListener('input', function () { root.querySelector('.csb-err').textContent = ''; });
    root.querySelector('.csb-st').addEventListener('click', function (e) {
      var b = e.target.closest('[data-q]'); if (!b) return;
      var q = Math.min(MAXQ, Math.max(1, st.qty + Number(b.getAttribute('data-q'))));
      if (q !== st.qty) { st.qty = q; paint(); intent(); }
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); send(); });
    root.querySelector('.csb-go').addEventListener('click', send);
  }

  // the totals, the names (one field per card, for a gift), the button and its line
  function paint() {
    form.querySelector('input[name="tier"][value="' + st.tier + '"]').checked = true;
    var t = TIERS.filter(function (x) { return x[0] === st.tier; })[0];
    root.querySelector('[data-csb-pay]').textContent = lei(t[0] * st.qty);
    root.querySelector('[data-csb-get]').textContent = lei(t[1] * st.qty);
    root.querySelector('.csb-st output').textContent = st.qty;
    root.querySelector('[data-q="-1"]').disabled = st.qty <= 1;
    root.querySelector('[data-q="1"]').disabled = st.qty >= Math.min(MAXQ, st.left || MAXQ);
    var box = root.querySelector('.csb-nm'), have = box.querySelectorAll('input').length;
    for (var i = have; i < MAXQ; i++) { var inp = document.createElement('input'); inp.type = 'text'; inp.name = 'n' + i; inp.autocomplete = 'off'; box.appendChild(inp); }
    box.hidden = !st.gift;
    [].slice.call(box.querySelectorAll('input')).forEach(function (inp, k) { inp.hidden = k >= st.qty; inp.placeholder = st.qty > 1 ? 'Cardul ' + (k + 1) + ' pe numele' : 'Numele ei, pe card'; });
    root.querySelector('.csb-pay').hidden = !st.online;
    var go = root.querySelector('.csb-go');
    if (!busy) go.innerHTML = (st.online ? 'Plătește ' + lei(t[0] * st.qty) : 'Rezervă cardul, plătești în salon') + ARROW;
    root.querySelector('.csb-note').textContent = st.online
      ? 'Plată securizată prin myPOS.' + (st.tier === 990 ? ' Plătit online, fiecare card de 990 lei aduce și un Tratament Restart cadou.' : '')
      : 'Nu plătești nimic acum: te sună recepția, plătești în clinică. Clubul 360 e inclus.';
  }

  // online: the order on the server for this card and quantity, then myPOS's card form for that sum
  function intent() {
    if (!st.online) return;
    clearTimeout(timer);
    timer = setTimeout(function () {
      var want = st.tier + 'x' + st.qty;
      st.pay = null; st.made = want;
      var mount = root.querySelector('.csb-mp'), wait = root.querySelector('.csb-wait');
      wait.hidden = false; mount.innerHTML = '';
      Promise.all([post({ action: 'intent', tier: st.tier, qty: st.qty, id: st.draft }), loadSdk()]).then(function (r) {
        var d = r[0];
        if (st.made !== want) return; // changed meanwhile: the newer one renders
        if (d.error === 'sold_out' || d.error === 'closed') { gone(d.error); return; }
        if (!d.ok || !d.checkout) { st.online = false; paint(); return; } // no form: the reservation in the clinic
        st.draft = d.id;
        render(d.checkout);
      }).catch(function () { st.online = false; paint(); });
    }, 250);
  }
  function render(c) {
    var mount = root.querySelector('.csb-mp'), wait = root.querySelector('.csb-wait');
    mount.innerHTML = '';
    var params = { sid: c.sid, ipcLanguage: c.ipcLanguage, walletNumber: c.walletNumber, amount: c.amount, currency: c.currency, orderID: c.orderID,
      urlNotify: c.urlNotify, urlOk: location.href, urlCancel: location.href, keyIndex: c.keyIndex, cartItems: c.cartItems };
    // an error before she pressed „Plătește” is myPOS refusing the form itself (e.g. the store not approved): no online payment then
    var callbacks = { isSandbox: !!c.isSandbox, onSuccess: function () { confirmPaid(); }, onError: function () { if (st.paying) failed(); else unavailable(); }, onMessageReceived: function () {} };
    var look = { formBackgroundColor: '#ffffff', labelFontSize: '13px', labelColor: '#262a30', inputBorderRadius: '14px' };
    window.MyPOSEmbedded.createPaymentForm('csbPayForm', params, callbacks, look).then(function (p) { st.pay = p; st.order = c; wait.hidden = true; paint(); });
    // myPOS refused the form (its error page is a few lines, the card form is 600 px and more): the reservation in the clinic
    var made = st.made;
    setTimeout(function () {
      var f = mount.querySelector('iframe');
      if (st.made !== made || (f && f.getBoundingClientRect().height > 300)) return;
      unavailable();
    }, 15000);
  }

  // grows out of the button, goes back into it (transform only)
  function fly(open) {
    if (reduce || !panel.animate) return Promise.resolve();
    var r1 = panel.getBoundingClientRect(), r0 = from && from.isConnected ? from.getBoundingClientRect() : null;
    var a = r0 && r0.width ? 'translate(' + (r0.left + r0.width / 2 - (r1.left + r1.width / 2)) + 'px,' + (r0.top + r0.height / 2 - (r1.top + r1.height / 2)) + 'px) scale(' +
      Math.max(0.05, r0.width / r1.width) + ',' + Math.max(0.03, r0.height / r1.height) + ')' : 'translateY(24px) scale(.96)';
    var k = open ? [{ transform: a, opacity: 0.6 }, { transform: 'none', opacity: 1 }] : [{ transform: 'none', opacity: 1 }, { transform: a, opacity: 0 }];
    return new Promise(function (res) { var an = panel.animate(k, { duration: open ? 560 : 420, easing: 'cubic-bezier(.16,1,.3,1)' }); an.onfinish = res; an.oncancel = res; });
  }
  function open(btn) {
    if (!root) build();
    from = btn || null;
    var t = Number(btn && btn.getAttribute('data-cs-tier'));
    if (!t) { try { t = Number(localStorage.getItem('c360_cs_tier')); } catch (e) {} } // the card chosen on another page
    st.tier = TIERS.some(function (x) { return x[0] === t; }) ? t : 990;
    root.classList.remove('sent', 'shown');
    paint();
    root.classList.add('open'); root.setAttribute('aria-hidden', 'false'); document.documentElement.classList.add('csb-lock');
    fly(true).then(function () { root.classList.add('shown'); });
    panel.focus({ preventScroll: true });
    (st.loaded ? Promise.resolve() : load()).then(function () {
      if (!st.open) { gone(st.left <= 0 ? 'sold_out' : 'closed'); return; }
      paint(); intent();
    });
  }
  function close() {
    if (!root || !root.classList.contains('open')) return;
    root.classList.remove('shown');
    fly(false).then(function () {
      root.classList.remove('open'); root.setAttribute('aria-hidden', 'true'); document.documentElement.classList.remove('csb-lock');
      if (from && from.focus) from.focus({ preventScroll: true });
    });
  }
  function gone(why) {
    root.classList.add('sent');
    root.querySelector('.csb-done').innerHTML = '<h3>' + (why === 'sold_out' ? 'Cardurile s-au terminat.' : 'Oferta s-a încheiat.') + '</h3><p class="lead" style="font-size:16px">Mulțumim! La consultația gratuită îți spunem ce ți se potrivește.</p>' +
      '<button type="button" class="btn ghost" data-csb-close>Închide</button>';
  }

  var MSG = { missing_name: 'Scrie numele tău.', bad_phone: 'Scrie un număr de telefon valid.', missing_city: 'Alege clinica.', missing_consent: 'Bifează acordul, ca să te putem contacta.',
    too_many: 'Prea multe încercări. Încearcă din nou în câteva minute.', too_many_cards: 'Pe acest număr sunt deja multe carduri. Te sunăm noi.', bad_tier: 'Alege cardul.', bad_qty: 'Alege câte carduri.' };
  function setBusy(on, label) {
    busy = on; var go = root.querySelector('.csb-go'); go.disabled = on;
    if (on) go.innerHTML = '<span class="csb-spin" aria-hidden="true"></span>' + label; else paint();
  }
  function send() {
    if (busy) return;
    var err = root.querySelector('.csb-err'), v = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
    var city = (form.querySelector('input[name="city"]:checked') || {}).value || '';
    var names = []; for (var i = 0; i < st.qty; i++) names.push(st.gift ? v('n' + i) : v('name'));
    var online = st.online && st.pay && st.made === st.tier + 'x' + st.qty;
    var body = { tier: st.tier, qty: st.qty, names: names, name: v('name'), phone: v('phone'), city: city, pay: online ? 'online' : 'salon', draft: online ? st.draft : '', consent: form.consent.checked, website: v('website'), page: location.href };
    if (body.name.length < 2) { err.textContent = MSG.missing_name; return; }
    if (body.phone.replace(/\D/g, '').length < 9) { err.textContent = MSG.bad_phone; return; }
    if (!city) { err.textContent = MSG.missing_city; return; }
    if (!body.consent) { err.textContent = MSG.missing_consent; return; }
    if (st.online && !online) { err.textContent = 'Plata securizată se încarcă. Încearcă din nou într-o clipă.'; return; }
    if (window.C360_CONSENT === true) body.event_id = 'lead.' + Date.now().toString(36) + '.' + Math.random().toString(36).slice(2, 10);
    setBusy(true, online ? 'Se procesează plata…' : 'Se trimite…');
    post(body).then(function (d) {
      if (d.error === 'sold_out' || d.error === 'closed') { busy = false; gone(d.error); return; }
      if (d.error === 'not_enough') throw new Error('Mai sunt doar ' + d.left + ' carduri. Alege mai puține.');
      if (!d.ok || !d.reservation) throw new Error(MSG[d.error] || 'Nu am putut trimite. Încearcă din nou.');
      if (typeof d.left === 'number') { st.left = d.left; if (window.CSC && window.CSC.state) window.CSC.set(Object.assign({}, window.CSC.state, { left: d.left })); }
      st.res = d.reservation;
      if (d.reservation.pay !== 'online' || !d.checkout || !st.pay) { done(d.reservation, false); return; }
      st.paying = true;
      st.pay.processPayment(); // myPOS: the card, 3-D Secure in the form; then onSuccess / onError
    }).catch(function (x) {
      setBusy(false);
      err.textContent = x && x.message && !/^(Failed|NetworkError|Load)/.test(x.message) ? x.message : 'Nu am putut trimite. Încearcă din nou.';
    });
  }
  // the browser says paid: the server's word (myPOS's notification) decides; it is asked for a minute
  function confirmPaid() {
    var r = st.res, n = 0;
    root.classList.add('sent');
    root.querySelector('.csb-done').innerHTML = '<span class="csb-spin csb-spin-big" aria-hidden="true"></span><h3>Se confirmă plata…</h3><p class="lead" style="font-size:16px">Durează câteva secunde.</p>';
    var ask = function () {
      post({ action: 'status', id: r.id }).then(function (d) {
        if (d && d.paid) { busy = false; done(Object.assign({}, r, d.order), false, true); return; }
        if (++n < 30) setTimeout(ask, 2000);
        else { busy = false; done(r, false, false, true); }
      }, function () { if (++n < 30) setTimeout(ask, 3000); });
    };
    ask();
  }
  // myPOS's form did not come: the reservation with payment in the clinic, said once
  function unavailable() {
    if (!st.online) return;
    st.online = false; st.pay = null; st.made = '';
    var mount = root.querySelector('.csb-mp'); if (mount) mount.innerHTML = '';
    paint();
    root.querySelector('.csb-err').textContent = 'Plata online nu e disponibilă acum. Rezervă cardul și plătești în clinică.';
  }
  function failed() {
    st.paying = false;
    setBusy(false);
    root.querySelector('.csb-err').textContent = 'Plata nu a trecut. Verifică datele cardului sau încearcă alt card. Cardul rămâne rezervat pe numele tău.';
    st.draft = st.res ? st.res.id : st.draft; intent(); // a new orderID for the next try
  }
  function done(r, payFailed, paid, pending) {
    busy = false;
    var named = (r.names || []).filter(Boolean);
    var steps = paid
      ? '<li><span><b>Plata a ajuns</b>Mulțumim! ' + lei(r.amount) + ' plătiți online.</span></li><li><span><b>Primești ' + (r.qty > 1 ? 'cardurile' : 'cardul') + ' pe WhatsApp</b>Cu numele de pe card și un cod unic.</span></li>' +
        (Number(r.tier) === 990 ? '<li><span><b>Tratamentul Restart e cadou</b>Pe fiecare card de 990 lei.</span></li>' : '')
      : pending
      ? '<li><span><b>Plata se confirmă</b>Îți scriem pe WhatsApp imediat ce myPOS o confirmă.</span></li><li><span><b>Primești cardul pe WhatsApp</b>Cu numele de pe card și un cod unic.</span></li>'
      : '<li><span><b>Te sună recepția</b>Confirmăm datele' + (named.length ? ' și numele de pe card' : '') + '.</span></li>' +
        '<li><span><b>Plătești ' + lei(r.amount) + ' în clinică</b>' + (r.city === 'Arad' ? 'Arad, Str. Ioan Alexandru 16-18.' : 'Timișoara, Str. Bucegi 7.') + '</span></li>' +
        '<li><span><b>Primești cardul pe WhatsApp</b>Cu numele de pe card și un cod unic, legat la recepție de nume și telefon.</span></li>';
    root.querySelector('.csb-done').innerHTML = '<span class="csb-tick">' + TICK + '</span><h3>' + (paid ? 'Plata a ajuns.' : r.qty > 1 ? 'Cardurile sunt rezervate.' : 'Cardul e rezervat.') + '</h3>' +
      '<p class="csb-chips"><span>' + r.qty + ' × ' + lei(r.tier) + '</span><span>Plătești ' + lei(r.amount) + '</span><span>Primești ' + lei(r.credit) + '</span><span>' + esc(r.city) + '</span></p>' +
      '<ol class="csb-next">' + steps + '<li><span><b>Locul în Clubul 360 e rezervat</b>Te anunțăm când se deschide.</span></li></ol>' +
      '<button type="button" class="btn ghost" data-csb-close>Gata</button>';
    root.classList.add('sent');
    form.reset(); st.qty = 1; st.gift = false; st.draft = ''; st.pay = null; st.made = ''; paint();
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-cs-buy]');
    if (!b) return;
    e.preventDefault(); open(b);
  });
  // a link with #cumpara opens it at once (from a post or a message)
  if (/#cumpara\b/.test(location.hash)) addEventListener('load', function () { open(null); });
  window.CSB = { open: open, close: close };
})();
