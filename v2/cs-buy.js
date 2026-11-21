/* Cardul de Sărbători: buying, on every page (the owner, 21.11). Any [data-cs-buy] opens a small step in the window (v2/cs-buy.css),
   grown out of the button and gone back into it: the card, for her or a gift (the name on it), her name, phone (WhatsApp),
   the clinic, then „Continuă la plată (X lei)”: the order is made on the server and she goes to that card's myPOS PayLink.
   „Rezervă cardul, plătești în clinică” ([data-cs-reserve], or the second button in the window): how many, the names, paid in the
   clinic after reception calls; only the credit (the gift and Clubul 360 come with the online payment). The sums are made on
   the server; the page never decides one. */
(function () {
  'use strict';
  var TIERS = [[290, 500, '1,7'], [490, 1000, '2'], [990, 2500, '2,5']];
  var MAXQ = 5, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lei = function (n) { return Math.round(n).toLocaleString('ro-RO') + ' lei'; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ARROW = '<svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var st = { tier: 990, qty: 1, gift: false, open: true, left: 10, loaded: false, links: {}, mode: 'online' };
  var root, panel, form, from = null, busy = false;
  // Meta pixel (the owner, 21.11: „tracking cu absolut totul”): it only queues until „Accept” loads it (_shell.html);
  // the Lead's event id is the one the server's Conversions API copy carries, so Meta counts it once
  var px = function (name, data, eid) { try { if (window.fbq) window.fbq('track', name, data || {}, eid ? { eventID: eid } : undefined); } catch (e) {} };
  var item = function (tier) { return { content_name: 'Card de Sărbători ' + tier + ' lei', content_ids: ['card-' + tier], content_type: 'product', value: Number(tier) || 0, currency: 'RON' }; };
  // the site's funnel (site-pulse.js): the window opened, the form sent, the way to pay / the reservation
  var fev = function (n) { try { if (window.C360P) window.C360P.ev(n); } catch (e) {} };
  var post = function (b) { return fetch('/api/card-sarbatori', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(function (r) { return r.json(); }); };

  function load() {
    return fetch('/api/card-sarbatori').then(function (r) { return r.json(); }).then(function (d) {
      if (d && typeof d.left === 'number') { st.open = d.open !== false; st.left = d.left; st.links = d.links || {}; st.loaded = true; }
    }).catch(function () {});
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
        '<div class="csb-q" data-csb-clin><div><span class="csb-l" id="csb-l2">Câte carduri?</span><small>Până la 5.</small></div>' +
          '<div class="csb-st" role="group" aria-labelledby="csb-l2"><button type="button" data-q="-1" aria-label="Mai puține">−</button><output aria-live="polite">1</output><button type="button" data-q="1" aria-label="Mai multe">+</button></div></div>' +
        '<div><span class="csb-l" id="csb-l4">Pentru cine e?</span><div class="csb-seg" role="radiogroup" aria-labelledby="csb-l4"><label><input type="radio" name="for" value="me" checked>Pentru mine</label><label><input type="radio" name="for" value="gift">Cadou</label></div>' +
          '<div class="csb-nm"></div></div>' +
        '<div class="csb-two"><div><span class="csb-l">Numele tău</span><input type="text" name="name" autocomplete="name" placeholder="ex: Maria Popescu"></div>' +
          '<div><span class="csb-l">Telefon (WhatsApp)</span><input type="tel" name="phone" inputmode="tel" autocomplete="tel" placeholder="07xx xxx xxx"></div></div>' +
        '<div><span class="csb-l" id="csb-l3">Clinica</span><div class="csb-seg" role="radiogroup" aria-labelledby="csb-l3"><label><input type="radio" name="city" value="Timișoara">Timișoara</label><label><input type="radio" name="city" value="Arad">Arad</label></div></div>' +
        '<label class="csb-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>' +
        '<label class="csb-ok"><input type="checkbox" name="consent"><i>' + TICK + '</i><span>Sunt de acord să fiu contactat/ă telefonic sau pe WhatsApp de Centrul360 pentru card.</span></label>' +
      '</form></div>' +
      '<div class="csb-ft"><p class="csb-sum"><span class="p">Plătești <b data-csb-pay></b> <small class="cur">lei (RON)</small></span><span class="g">primești <b data-csb-get></b> în tratamente</span></p><p class="csb-bonus" data-csb-bonus></p><p class="csb-err" role="alert"></p>' +
        '<button type="button" class="btn book csb-go"></button><button type="button" class="btn ghost csb-alt" data-csb-switch></button><p class="csb-note"></p></div>' +
      '<div class="csb-done" aria-live="polite"></div>' +
    '</div></div>';
    document.body.appendChild(root);
    panel = root.querySelector('.csb-p'); form = root.querySelector('form');
    root.addEventListener('click', function (e) { if (e.target.closest('[data-csb-close]')) close(); });
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('open')) close(); });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'tier') { st.tier = Number(e.target.value); paint(); if (window.CSC && window.CSC.tier) window.CSC.tier(st.tier); else { try { localStorage.setItem('c360_cs_tier', String(st.tier)); } catch (x) {} } }
      if (e.target.name === 'for') { st.gift = e.target.value === 'gift'; paint(); if (st.gift) { var f = form.querySelector('[name="n0"]'); if (f) f.focus(); } }
    });
    form.addEventListener('input', function () { root.querySelector('.csb-err').textContent = ''; });
    root.querySelector('.csb-st').addEventListener('click', function (e) {
      var b = e.target.closest('[data-q]'); if (!b) return;
      var q = Math.min(MAXQ, Math.max(1, st.qty + Number(b.getAttribute('data-q'))));
      if (q !== st.qty) { st.qty = q; paint(); }
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); send(); });
    root.querySelector('.csb-go').addEventListener('click', send);
    // the other way to pay, in the same window
    root.querySelector('[data-csb-switch]').addEventListener('click', function () {
      st.mode = st.mode === 'online' ? 'clinica' : 'online';
      if (st.mode === 'online' && !(st.links && st.links[st.tier])) st.mode = 'clinica';
      root.querySelector('.csb-err').textContent = ''; paint();
    });
    form.addEventListener('change', function (e) { if (e.target.name === 'city') paint(); });
  }

  // the totals, the names (one field per card, for a gift), the button and its line
  function paint() {
    form.querySelector('input[name="tier"][value="' + st.tier + '"]').checked = true;
    var t = TIERS.filter(function (x) { return x[0] === st.tier; })[0];
    root.querySelector('[data-csb-pay]').textContent = Math.round(t[0] * st.qty).toLocaleString('ro-RO');
    root.querySelector('[data-csb-get]').textContent = lei(t[1] * st.qty);
    root.querySelector('.csb-st output').textContent = st.qty;
    root.querySelector('[data-q="-1"]').disabled = st.qty <= 1;
    root.querySelector('[data-q="1"]').disabled = st.qty >= Math.min(MAXQ, st.left || MAXQ);
    var box = root.querySelector('.csb-nm'), have = box.querySelectorAll('input').length;
    for (var i = have; i < MAXQ; i++) { var inp = document.createElement('input'); inp.type = 'text'; inp.name = 'n' + i; inp.autocomplete = 'off'; box.appendChild(inp); }
    box.hidden = !st.gift;
    [].slice.call(box.querySelectorAll('input')).forEach(function (inp, k) { inp.hidden = k >= st.qty; inp.placeholder = st.qty > 1 ? 'Cardul ' + (k + 1) + ' pe numele' : 'Numele ei, pe card'; });
    var hasLink = !!(st.links && st.links[st.tier]);
    if (st.mode === 'online' && !hasLink) st.mode = 'clinica';
    var online = st.mode === 'online', city = (form.querySelector('input[name="city"]:checked') || {}).value || '';
    if (online && st.qty !== 1) { st.qty = 1; root.querySelector('.csb-st output').textContent = 1; }
    root.querySelector('[data-csb-clin]').hidden = online;
    if (online) { var t1 = TIERS.filter(function (x) { return x[0] === st.tier; })[0]; root.querySelector('[data-csb-pay]').textContent = Math.round(t1[0]).toLocaleString('ro-RO'); root.querySelector('[data-csb-get]').textContent = lei(t1[1]); }
    [].slice.call(box.querySelectorAll('input')).forEach(function (inp, k) { if (online) { inp.hidden = k > 0; inp.placeholder = 'Numele ei, pe card'; } });
    var gift = city === 'Arad' ? 'un Tratament Restart cadou' : city === 'Timișoara' ? 'o ședință de EMS cadou' : 'cadou: ședință EMS la Timișoara, Tratament Restart la Arad';
    root.querySelector('[data-csb-bonus]').innerHTML = online ? '<b>+ ' + esc(city ? gift : gift.charAt(0).toUpperCase() + gift.slice(1)) + '</b> și locul în Clubul 360' : 'Doar creditul cardului. Cadoul și Clubul 360 vin cu plata online.';
    root.querySelector('[data-csb-bonus]').classList.toggle('off', !online);
    var go = root.querySelector('.csb-go');
    var t2 = TIERS.filter(function (x) { return x[0] === st.tier; })[0];
    if (!busy) go.innerHTML = (online ? 'Continuă la plată (' + lei(t2[0]) + ')' : 'Rezervă cardul, plătești în clinică') + ARROW;
    var sw = root.querySelector('[data-csb-switch]');
    sw.hidden = !hasLink; sw.textContent = online ? 'Rezervă cardul, plătești în clinică' : 'Plătește online acum (' + lei(t2[0]) + ')';
    root.querySelector('.csb-note').textContent = online ? 'Plata se face pe pagina securizată myPOS. Cardul vine pe WhatsApp imediat ce se confirmă plata.' : 'Nu plătești nimic acum: te sună recepția și plătești în clinică. Cardul se emite la plată.';
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
  function open(btn, mode) {
    if (!root) build();
    from = btn || null;
    st.mode = mode === 'clinica' ? 'clinica' : 'online';
    var t = Number(btn && btn.getAttribute('data-cs-tier'));
    if (!t) { try { t = Number(localStorage.getItem('c360_cs_tier')); } catch (e) {} } // the card chosen on another page
    st.tier = TIERS.some(function (x) { return x[0] === t; }) ? t : 990;
    root.classList.remove('sent', 'shown');
    paint();
    px('ViewContent', item(st.tier)); fev('open');
    root.classList.add('open'); root.setAttribute('aria-hidden', 'false'); document.documentElement.classList.add('csb-lock');
    fly(true).then(function () { root.classList.add('shown'); });
    panel.focus({ preventScroll: true });
    (st.loaded ? Promise.resolve() : load()).then(function () {
      if (!st.open) { gone(st.left <= 0 ? 'sold_out' : 'closed'); return; }
      paint();
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
    missing_recipient: 'Scrie numele de pe card (al celei care primește cadoul).',
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
    var online = st.mode === 'online';
    var body = { tier: st.tier, qty: online ? 1 : st.qty, names: online ? names.slice(0, 1) : names, forWho: st.gift ? 'cadou' : 'eu', recipient: st.gift ? v('n0') : '', name: v('name'), phone: v('phone'), city: city, pay: online ? 'online' : 'clinica', consent: form.consent.checked, website: v('website'), page: location.href };
    if (online && st.gift && body.recipient.length < 2) { err.textContent = MSG.missing_recipient; return; }
    if (body.name.length < 2) { err.textContent = MSG.missing_name; return; }
    if (body.phone.replace(/\D/g, '').length < 9) { err.textContent = MSG.bad_phone; return; }
    if (!city) { err.textContent = MSG.missing_city; return; }
    if (!body.consent) { err.textContent = MSG.missing_consent; return; }
    if (window.C360_CONSENT === true) body.event_id = 'lead.' + Date.now().toString(36) + '.' + Math.random().toString(36).slice(2, 10);
    var val = Object.assign(item(st.tier), { value: (Number(st.tier) || 0) * (body.qty || 1), num_items: body.qty || 1 });
    px(online ? 'InitiateCheckout' : 'AddToCart', val); fev('start');
    setBusy(true, online ? 'Spre plata securizată…' : 'Se trimite…');
    post(body).then(function (d) {
      if (d.error === 'sold_out' || d.error === 'closed') { busy = false; gone(d.error); return; }
      if (d.error === 'no_link') { busy = false; st.links[st.tier] = null; st.mode = 'clinica'; paint(); err.textContent = 'Plata online nu e disponibilă acum pentru acest card. Îl poți rezerva și plăti în clinică.'; return; }
      if (d.ok && (d.link || d.reservation)) px('Lead', val, body.event_id);
      if (online && d.ok && d.link) { fev('pay'); try { sessionStorage.setItem('c360_cs_order', d.id || ''); } catch (x) {} location.href = d.link; return; }
      if (d.error === 'not_enough') throw new Error('Mai sunt doar ' + d.left + ' carduri. Alege mai puține.');
      if (!d.ok || !d.reservation) throw new Error(MSG[d.error] || 'Nu am putut trimite. Încearcă din nou.');
      if (typeof d.left === 'number') { st.left = d.left; if (window.CSC && window.CSC.state) window.CSC.set(Object.assign({}, window.CSC.state, { left: d.left })); }
      fev('lead'); done(d.reservation);
    }).catch(function (x) {
      setBusy(false);
      err.textContent = x && x.message && !/^(Failed|NetworkError|Load)/.test(x.message) ? x.message : 'Nu am putut trimite. Încearcă din nou.';
    });
  }
  function done(r) {
    busy = false;
    var named = (r.names || []).filter(Boolean);
    var steps = '<li><span><b>Te sună recepția</b>Confirmăm datele' + (named.length ? ' și numele de pe card' : '') + '.</span></li>' +
        '<li><span><b>Plătești ' + lei(r.amount) + ' în clinică</b>' + (r.city === 'Arad' ? 'Arad, Str. Ioan Alexandru 16-18.' : 'Timișoara, Str. Bucegi 7.') + '</span></li>' +
        '<li><span><b>Primești cardul pe WhatsApp</b>După plată: cu numele de pe card și un cod unic.</span></li>';
    root.querySelector('.csb-done').innerHTML = '<span class="csb-tick">' + TICK + '</span><h3>' + (r.qty > 1 ? 'Cardurile sunt rezervate.' : 'Cardul e rezervat.') + '</h3>' +
      '<p class="csb-chips"><span>' + r.qty + ' × ' + lei(r.tier) + '</span><span>Plătești ' + lei(r.amount) + '</span><span>Primești ' + lei(r.credit) + '</span><span>' + esc(r.city) + '</span></p>' +
      '<ol class="csb-next">' + steps + '</ol>' +
      '<button type="button" class="btn ghost" data-csb-close>Gata</button>';
    root.classList.add('sent');
    form.reset(); st.qty = 1; st.gift = false; paint();
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-cs-buy], [data-cs-reserve]');
    if (!b) return;
    e.preventDefault();
    if (b.hasAttribute('data-cs-reserve')) { (st.loaded ? Promise.resolve() : load()).then(function () { open(b, 'clinica'); }); return; }
    (st.loaded ? Promise.resolve() : load()).then(function () { open(b, 'online'); });
  });
  // a link with #cumpara opens it at once (from a post or a message)
  if (/#cumpara\b/.test(location.hash)) addEventListener('load', function () { load().then(function () { open(null, 'online'); }); });
  window.CSB = { open: open, close: close };
})();
