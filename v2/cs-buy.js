/* Cardul de Sărbători: buying, on every page (the owner, 21.11).
   Online, no window and no form: the card block (card page and home page) has her phone and the clinic right under the
   three cards; „Plătesc online X lei” makes the order on the server and she goes to that card's myPOS PayLink in the same
   tab. Any other buy button ([data-cs-buy]) carries her to that block (scrolls to it, the card chosen there); on a page
   without it, to the card page. The name on the card is asked on WhatsApp after the payment (api/_lib/card-sarbatori.js).
   „Rezervă cardul, plătești în clinică” ([data-cs-reserve]) opens a small step in the window (v2/cs-buy.css), grown out of
   the button and gone back into it: how many, the names, her name, phone, clinic; only the credit (the gift and Clubul 360
   come with the online payment).
   Back from the PayLink without paying (the order of this tab in sessionStorage, not paid): the same window asks once
   „Plata nu s-a finalizat?” (retry, card declined, no card at hand, did not understand the page, the clinic, changed her
   mind), her answer goes on the order. The sums are made on the server; the page never decides one. */
(function () {
  'use strict';
  var TIERS = [[290, 500, '1,7'], [490, 1000, '2'], [990, 2500, '2,5']];
  var MAXQ = 5, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lei = function (n) { return Math.round(n).toLocaleString('ro-RO') + ' lei'; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ARROW = '<svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  var TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var SPIN = '<span class="csb-spin" data-spin aria-hidden="true"></span>';
  var st = { tier: 990, qty: 1, gift: false, open: true, left: 10, loaded: false, links: {}, mode: 'clinica', from: '' };
  var root, panel, form, from = null, busy = false;
  var K_ORDER = 'c360_cs_order', K_ASKED = 'c360_cs_asked', K_PHONE = 'c360_cs_phone', K_CITY = 'c360_cs_city';
  var get = function (s, k) { try { return s.getItem(k) || ''; } catch (e) { return ''; } };
  var put = function (s, k, v) { try { if (v == null) s.removeItem(k); else s.setItem(k, v); } catch (e) {} };
  // Meta pixel (the owner, 21.11: „tracking cu absolut totul”): it only queues until „Accept” loads it (_shell.html);
  // the Lead's event id is the one the server's Conversions API copy carries, so Meta counts it once
  var px = function (name, data, eid) { try { if (window.fbq) window.fbq('track', name, data || {}, eid ? { eventID: eid } : undefined); } catch (e) {} };
  var item = function (tier) { return { content_name: 'Card de Sărbători ' + tier + ' lei', content_ids: ['card-' + tier], content_type: 'product', value: Number(tier) || 0, currency: 'RON' }; };
  // the site's funnel (site-pulse.js): the window opened, the form sent, the way to pay / the reservation
  var fev = function (n) { try { if (window.C360P) window.C360P.ev(n); } catch (e) {} };
  var post = function (b) { return fetch('/api/card-sarbatori', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(function (r) { return r.json(); }); };
  var tierOf = function (t) { return TIERS.filter(function (x) { return x[0] === Number(t); })[0] || TIERS[2]; };
  // a Romanian mobile, however she writes it: 07xx xxx xxx, +40 7xx, 0040 7xx
  function mobile(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.indexOf('0040') === 0) d = '0' + d.slice(4); else if (d.indexOf('40') === 0 && d.length === 11) d = '0' + d.slice(2); else if (d.length === 9 && d[0] === '7') d = '0' + d;
    return /^07\d{8}$/.test(d) ? d : '';
  }

  function load() {
    return fetch('/api/card-sarbatori').then(function (r) { return r.json(); }).then(function (d) {
      if (d && typeof d.left === 'number') { st.open = d.open !== false; st.left = d.left; st.links = d.links || {}; st.loaded = true; }
    }).catch(function () {});
  }

  // ------------------------------------------------------------------ online: her phone in the card block
  var blk = function () { return document.querySelector('[data-cs-ph]'); };
  var payBtn = function () { var b = blk(); var g = b && b.closest('.cst-go'); return g ? g.querySelector('[data-cs-buy]') : null; };
  function phMsg(text, el) {
    var b = blk(); if (!b) return;
    var m = b.querySelector('[data-cs-phmsg]'); m.textContent = ''; void m.offsetWidth; m.textContent = text || '';
    b.querySelector('[data-cs-phone]').classList.toggle('bad', el === 'phone');
    b.querySelector('[data-cs-city]').classList.toggle('bad', el === 'city');
  }
  function initBlock() {
    var b = blk(); if (!b) return;
    var inp = b.querySelector('[data-cs-phone]');
    var ph = get(localStorage, K_PHONE), city = get(localStorage, K_CITY);
    if (ph && !inp.value) inp.value = ph;
    if (city) { var r = b.querySelector('input[name="cst-city"][value="' + city + '"]'); if (r) r.checked = true; }
    inp.addEventListener('input', function () { phMsg(''); var m = mobile(inp.value); if (m) put(localStorage, K_PHONE, m); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var pb = payBtn(); if (pb) pb.click(); } });
    b.querySelector('[data-cs-city]').addEventListener('change', function (e) { phMsg(''); put(localStorage, K_CITY, e.target.value); });
  }
  function spin(btn, on) {
    if (!btn) return;
    var s = btn.querySelector('[data-spin]');
    if (on) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); if (!s) btn.insertAdjacentHTML('afterbegin', SPIN); }
    else { btn.disabled = false; btn.removeAttribute('aria-busy'); if (s) s.remove(); }
  }
  // a buy button away from the block: carried to it (the card chosen there), the field or the button in focus
  function carry(tier) {
    var b = blk();
    if (!b) { location.href = (location.pathname.indexOf('/v2/') === 0 ? '/v2/' : '/') + 'card-sarbatori#cumpara'; return; }
    if (tier && window.CSC && window.CSC.tier) window.CSC.tier(tier);
    var inp = b.querySelector('[data-cs-phone]');
    var target = mobile(inp.value) ? payBtn() : inp;
    b.closest('.cst-go').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    setTimeout(function () { if (target) target.focus({ preventScroll: true }); }, reduce ? 0 : 520);
  }
  var PMSG = { bad_phone: 'Scrie un număr de mobil valid (07xx xxx xxx).', missing_city: 'Alege clinica: Timișoara sau Arad.', too_many: 'Prea multe încercări. Încearcă din nou în câteva minute.',
    too_many_cards: 'Pe acest număr sunt deja multe carduri. Te sunăm noi.', sold_out: 'Cardurile s-au terminat.', closed: 'Oferta s-a încheiat.',
    no_link: 'Plata online nu e disponibilă acum. Rezervă cardul mai jos și plătești în clinică.' };
  function payInline(btn) {
    var b = blk(); if (!b || busy) return;
    var inp = b.querySelector('[data-cs-phone]');
    var phone = mobile(inp.value), city = (b.querySelector('input[name="cst-city"]:checked') || {}).value || '';
    var tier = Number(btn.getAttribute('data-cs-tier')) || (window.CSC && window.CSC.current) || 990;
    if (!phone) { phMsg(inp.value.trim() ? PMSG.bad_phone : 'Scrie numărul tău de mobil: pe el îți trimitem cardul.', 'phone'); inp.focus(); return; }
    if (!city) { phMsg(PMSG.missing_city, 'city'); b.querySelector('input[name="cst-city"]').focus(); return; }
    put(localStorage, K_PHONE, phone); put(localStorage, K_CITY, city);
    busy = true; spin(btn, true); phMsg('');
    var stop = function (text) { busy = false; spin(btn, false); if (text) phMsg(text); };
    (st.loaded ? Promise.resolve() : load()).then(function () {
      if (!st.open) { stop(st.left <= 0 ? PMSG.sold_out : PMSG.closed); return; }
      if (!(st.links && st.links[tier])) { stop(PMSG.no_link); return; }
      var body = { tier: tier, qty: 1, pay: 'online', forWho: 'eu', phone: phone, city: city, consent: true, website: '', page: location.href };
      if (window.C360_CONSENT === true) body.event_id = 'lead.' + Date.now().toString(36) + '.' + Math.random().toString(36).slice(2, 10);
      var val = Object.assign(item(tier), { value: tier, num_items: 1 });
      px('InitiateCheckout', val); fev('start');
      return post(body).then(function (d) {
        if (d.ok && d.link) { px('Lead', val, body.event_id); fev('pay'); put(sessionStorage, K_ORDER, d.id || ''); location.href = d.link; return; }
        if (d.error === 'no_link') st.links[tier] = null;
        stop(PMSG[d.error] || 'Nu am putut trimite. Încearcă din nou.');
      });
    }).catch(function () { stop('Nu am putut trimite. Încearcă din nou.'); });
  }

  // ------------------------------------------------------------------ the window: the clinic form, and the question on return
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
      '<div class="csb-ret" aria-live="polite"></div>' +
    '</div></div>';
    document.body.appendChild(root);
    panel = root.querySelector('.csb-p'); form = root.querySelector('form');
    root.addEventListener('click', function (e) { if (e.target.closest('[data-csb-close]')) close(); });
    root.querySelector('.csb-ret').addEventListener('click', function (e) { var b = e.target.closest('[data-ret]'); if (b) reply(b.getAttribute('data-ret'), b); });
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('open')) close(); });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'tier') { st.tier = Number(e.target.value); paint(); if (window.CSC && window.CSC.tier) window.CSC.tier(st.tier); else put(localStorage, 'c360_cs_tier', String(st.tier)); }
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
    // the online way, from the clinic form: back to her phone in the card block
    root.querySelector('[data-csb-switch]').addEventListener('click', function () { var t = st.tier; close(); setTimeout(function () { carry(t); }, reduce ? 0 : 440); });
  }

  // the totals, the names (one field per card, for a gift), the button and its line (the clinic form)
  function paint() {
    form.querySelector('input[name="tier"][value="' + st.tier + '"]').checked = true;
    var t = tierOf(st.tier);
    root.querySelector('[data-csb-pay]').textContent = Math.round(t[0] * st.qty).toLocaleString('ro-RO');
    root.querySelector('[data-csb-get]').textContent = lei(t[1] * st.qty);
    root.querySelector('.csb-st output').textContent = st.qty;
    root.querySelector('[data-q="-1"]').disabled = st.qty <= 1;
    root.querySelector('[data-q="1"]').disabled = st.qty >= Math.min(MAXQ, st.left || MAXQ);
    var box = root.querySelector('.csb-nm'), have = box.querySelectorAll('input').length;
    for (var i = have; i < MAXQ; i++) { var inp = document.createElement('input'); inp.type = 'text'; inp.name = 'n' + i; inp.autocomplete = 'off'; box.appendChild(inp); }
    box.hidden = !st.gift;
    [].slice.call(box.querySelectorAll('input')).forEach(function (inp, k) { inp.hidden = k >= st.qty; inp.placeholder = st.qty > 1 ? 'Cardul ' + (k + 1) + ' pe numele' : 'Numele ei, pe card'; });
    root.querySelector('[data-csb-clin]').hidden = false;
    var bonus = root.querySelector('[data-csb-bonus]');
    bonus.innerHTML = 'Doar creditul cardului. Cadoul și Clubul 360 vin cu plata online.'; bonus.classList.add('off');
    if (!busy) root.querySelector('.csb-go').innerHTML = 'Rezervă cardul, plătești în clinică' + ARROW;
    var sw = root.querySelector('[data-csb-switch]');
    sw.hidden = !(st.links && st.links[st.tier]) || !blk(); sw.textContent = 'Plătește online acum (' + lei(t[0]) + ')';
    root.querySelector('.csb-note').textContent = 'Nu plătești nimic acum: te sună recepția și plătești în clinică. Cardul se emite la plată.';
  }

  // grows out of the button, goes back into it (transform only)
  function fly(open) {
    if (reduce || !panel.animate) return Promise.resolve();
    var r1 = panel.getBoundingClientRect(), r0 = from && from.isConnected ? from.getBoundingClientRect() : null;
    var a = r0 && r0.width && r0.bottom > 0 && r0.top < innerHeight ? 'translate(' + (r0.left + r0.width / 2 - (r1.left + r1.width / 2)) + 'px,' + (r0.top + r0.height / 2 - (r1.top + r1.height / 2)) + 'px) scale(' +
      Math.max(0.05, r0.width / r1.width) + ',' + Math.max(0.03, r0.height / r1.height) + ')' : 'translateY(24px) scale(.96)';
    var k = open ? [{ transform: a, opacity: 0.6 }, { transform: 'none', opacity: 1 }] : [{ transform: 'none', opacity: 1 }, { transform: a, opacity: 0 }];
    return new Promise(function (res) { var an = panel.animate(k, { duration: open ? 560 : 420, easing: 'cubic-bezier(.16,1,.3,1)' }); an.onfinish = res; an.oncancel = res; });
  }
  function title(ret) { root.querySelector('#csb-t').innerHTML = ret ? 'Plata nu s-a <em>finalizat?</em>' : 'Cardul de <em>Sărbători</em>'; }
  // the clinic form, her phone and clinic already in it when she typed them in the card block
  function prefill() {
    var ph = form.querySelector('[name="phone"]'), mine = get(localStorage, K_PHONE), city = get(localStorage, K_CITY);
    if (mine && !ph.value) ph.value = mine;
    if (city && !form.querySelector('input[name="city"]:checked')) { var c = form.querySelector('input[name="city"][value="' + city + '"]'); if (c) c.checked = true; }
  }
  function open(btn, mode) {
    if (!root) build();
    from = btn || null;
    st.mode = 'clinica';
    var ret = mode === 'ret';
    if (!ret) {
      var t = Number(btn && btn.getAttribute('data-cs-tier'));
      if (!t) t = (window.CSC && window.CSC.current) || Number(get(localStorage, 'c360_cs_tier')); // the card chosen on another page
      st.tier = tierOf(t)[0];
      st.from = '';
    }
    root.classList.remove('sent', 'shown', 'ret');
    if (ret) root.classList.add('ret');
    title(ret);
    paint(); prefill();
    if (!ret) { px('ViewContent', item(st.tier)); fev('open'); }
    root.classList.add('open'); root.setAttribute('aria-hidden', 'false'); document.documentElement.classList.add('csb-lock');
    fly(true).then(function () { root.classList.add('shown'); });
    panel.focus({ preventScroll: true });
    if (!ret) (st.loaded ? Promise.resolve() : load()).then(function () {
      if (!st.open) { gone(st.left <= 0 ? 'sold_out' : 'closed'); return; }
      paint();
    });
  }
  function close() {
    if (!root || !root.classList.contains('open')) return;
    root.classList.remove('shown');
    fly(false).then(function () {
      root.classList.remove('open', 'ret'); root.setAttribute('aria-hidden', 'true'); document.documentElement.classList.remove('csb-lock');
      if (from && from.focus) from.focus({ preventScroll: true });
    });
  }
  function gone(why) {
    root.classList.remove('ret'); root.classList.add('sent');
    root.querySelector('.csb-done').innerHTML = '<h3>' + (why === 'sold_out' ? 'Cardurile s-au terminat.' : 'Oferta s-a încheiat.') + '</h3><p class="lead" style="font-size:16px">Mulțumim! La consultația gratuită îți spunem ce ți se potrivește.</p>' +
      '<button type="button" class="btn ghost" data-csb-close>Închide</button>';
  }

  var MSG = { missing_name: 'Scrie numele tău.', bad_phone: 'Scrie un număr de telefon valid.', missing_city: 'Alege clinica.', missing_consent: 'Bifează acordul, ca să te putem contacta.',
    too_many: 'Prea multe încercări. Încearcă din nou în câteva minute.', too_many_cards: 'Pe acest număr sunt deja multe carduri. Te sunăm noi.', bad_tier: 'Alege cardul.', bad_qty: 'Alege câte carduri.' };
  function setBusy(on, label) {
    busy = on; var go = root.querySelector('.csb-go'); go.disabled = on;
    if (on) go.innerHTML = '<span class="csb-spin" aria-hidden="true"></span>' + label; else paint();
  }
  // the clinic reservation (and, from the question on return, the online order it replaces: from)
  function send() {
    if (busy) return;
    var err = root.querySelector('.csb-err'), v = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
    var city = (form.querySelector('input[name="city"]:checked') || {}).value || '';
    var names = []; for (var i = 0; i < st.qty; i++) names.push(st.gift ? v('n' + i) : v('name'));
    var body = { tier: st.tier, qty: st.qty, names: names, forWho: st.gift ? 'cadou' : 'eu', recipient: '', name: v('name'), phone: v('phone'), city: city, pay: 'clinica', consent: form.consent.checked, website: v('website'), page: location.href };
    if (st.from) body.from = st.from;
    if (body.name.length < 2) { err.textContent = MSG.missing_name; return; }
    if (body.phone.replace(/\D/g, '').length < 9) { err.textContent = MSG.bad_phone; return; }
    if (!city) { err.textContent = MSG.missing_city; return; }
    if (!body.consent) { err.textContent = MSG.missing_consent; return; }
    if (window.C360_CONSENT === true) body.event_id = 'lead.' + Date.now().toString(36) + '.' + Math.random().toString(36).slice(2, 10);
    var val = Object.assign(item(st.tier), { value: (Number(st.tier) || 0) * (body.qty || 1), num_items: body.qty || 1 });
    px('AddToCart', val); fev('start');
    setBusy(true, 'Se trimite…');
    post(body).then(function (d) {
      if (d.error === 'sold_out' || d.error === 'closed') { busy = false; gone(d.error); return; }
      if (d.ok && d.reservation) px('Lead', val, body.event_id);
      if (d.error === 'not_enough') throw new Error('Mai sunt doar ' + d.left + ' carduri. Alege mai puține.');
      if (!d.ok || !d.reservation) throw new Error(MSG[d.error] || 'Nu am putut trimite. Încearcă din nou.');
      if (typeof d.left === 'number') { st.left = d.left; if (window.CSC && window.CSC.state) window.CSC.set(Object.assign({}, window.CSC.state, { left: d.left })); }
      if (mobile(body.phone)) put(localStorage, K_PHONE, mobile(body.phone));
      st.from = '';
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
    root.classList.remove('ret'); root.classList.add('sent');
    title(false);
    form.reset(); st.qty = 1; st.gift = false; paint();
  }

  // ------------------------------------------------------------------ back from the PayLink, not paid
  var ret = null; // { id, tier, credit, amount, city, held, until }
  var hhmm = function (iso) { var t = Date.parse(iso); return t ? new Date(t).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }) : ''; };
  function retScreen(html) { var box = root.querySelector('.csb-ret'); box.innerHTML = '<div class="csb-rs">' + html + '</div>'; }
  var opt = function (k, text) { return '<button type="button" class="csb-o" data-ret="' + k + '"><span>' + text + '</span>' + CHEV + '</button>'; };
  var again = function () { return '<button type="button" class="btn book" data-ret="retry">Încerc din nou (' + lei(ret.amount) + ')' + ARROW + '</button>'; };
  function ask() {
    var t = tierOf(ret.tier);
    retScreen('<p class="csb-rl">' + (ret.held && ret.until ? 'Cardul de <b>' + lei(t[0]) + '</b>, cu ' + lei(t[1]) + ' în tratamente, e păstrat pentru tine până la <b>' + hhmm(ret.until) + '</b>.' :
        'Cardul de <b>' + lei(t[0]) + '</b>, cu ' + lei(t[1]) + ' în tratamente: îl poți plăti acum sau îl rezervi și plătești în clinică.') + '</p>' +
      '<div class="csb-ch">' + again() + opt('declined', 'Cardul a fost refuzat') + opt('nocard', 'N-am avut cardul la mine') + opt('confusing', 'N-am înțeles pagina de plată') +
        opt('clinic', 'Prefer să plătesc în clinică') + opt('no', 'M-am răzgândit') + '</div>' +
      '<p class="csb-err" role="alert"></p><p class="csb-note">Dacă ai plătit deja, cardul îți vine pe WhatsApp în câteva minute.</p>');
  }
  // after an answer: a short word and the two ways left
  var HELP = {
    declined: ['Se întâmplă des.', 'Uneori banca cere o confirmare în aplicația ei sau cardul are o limită pentru plăți online. Poți încerca din nou, cu alt card, sau îl rezervi și plătești în clinică, cash sau card.'],
    nocard: ['Nicio grabă.', 'Revii când ai cardul la îndemână, sau îl rezervi acum și plătești în clinică, cash sau card.'],
    confusing: ['Îți explicăm pe scurt.', 'Pe pagina myPOS suma e deja completată: scrii datele cardului (numărul, data și codul de pe spate) și confirmi plata. Dacă preferi, îl rezervi și plătești în clinică.'],
  };
  function reply(k, btn) {
    if (!ret || btn.disabled) return;
    if (k === 'close') { close(); return; }
    var all = [].slice.call(root.querySelectorAll('.csb-ret [data-ret]'));
    all.forEach(function (b) { b.disabled = true; });
    if (k !== 'no') btn.insertAdjacentHTML('afterbegin', SPIN);
    var err = root.querySelector('.csb-ret .csb-err');
    post({ action: 'answer', id: ret.id, reason: k }).then(function (d) {
      if (d && d.paid) { retScreen('<span class="csb-tick">' + TICK + '</span><h3>Plata a ajuns.</h3><p class="csb-rl">Cardul îți vine pe WhatsApp în câteva minute.</p><button type="button" class="btn ghost" data-ret="close">Gata</button>'); return; }
      if (k === 'retry') {
        if (d && d.link) { location.href = d.link; return; }
        throw new Error(d && d.error === 'sold_out' ? 'Cardurile s-au terminat între timp.' : d && d.error === 'closed' ? 'Oferta s-a încheiat.' : 'Plata online nu merge acum. Îl poți rezerva și plăti în clinică.');
      }
      if (d && d.error) throw new Error('Nu am putut trimite. Încearcă din nou.');
      if (k === 'clinic') {
        // the clinic form, in the same window, with her phone and the card she chose
        st.from = ret.id; st.tier = ret.tier; st.qty = 1;
        if (ret.city) { var c = form.querySelector('input[name="city"][value="' + ret.city + '"]'); if (c) c.checked = true; }
        prefill();
        root.classList.remove('ret'); title(false); paint();
        root.querySelector('.csb-sc').scrollTop = 0;
        var nm = form.querySelector('[name="name"]'); if (nm) setTimeout(function () { nm.focus({ preventScroll: true }); }, 320);
        return;
      }
      if (k === 'no') { retScreen('<h3>Am înțeles. Mulțumim!</h3><p class="csb-rl">Dacă te răzgândești, cardul e aici până pe 24 decembrie, cât mai sunt carduri.</p><button type="button" class="btn ghost" data-ret="close">Închide</button>'); return; }
      var h = HELP[k] || HELP.nocard;
      retScreen('<h3>' + h[0] + '</h3><p class="csb-rl">' + h[1] + '</p><div class="csb-ch">' + again() + opt('clinic', 'Rezerv și plătesc în clinică') + '</div><p class="csb-err" role="alert"></p>');
    }).catch(function (x) {
      all.forEach(function (b) { b.disabled = false; var s = b.querySelector('[data-spin]'); if (s) s.remove(); });
      if (err) err.textContent = x && x.message && !/^(Failed|NetworkError|Load)/.test(x.message) ? x.message : 'Nu am putut trimite. Încearcă din nou.';
    });
  }
  // the button she paid with when it is on the screen, else the top band: the window grows out of it
  function origin() {
    var list = [payBtn(), document.querySelector('[data-cs-buy]')].filter(Boolean);
    for (var i = 0; i < list.length; i++) { var r = list[i].getBoundingClientRect(); if (r.width && r.bottom > 0 && r.top < innerHeight) return list[i]; }
    return null;
  }
  function asked(id) { return get(localStorage, K_ASKED).split(',').indexOf(id) >= 0; }
  function forget(id, ask) {
    put(sessionStorage, K_ORDER, null);
    if (ask) { var a = get(localStorage, K_ASKED).split(',').filter(Boolean); if (a.indexOf(id) < 0) a.push(id); put(localStorage, K_ASKED, a.slice(-10).join(',')); }
  }
  function back(persisted) {
    // from the browser's memory: the button she tapped still turns
    if (persisted) { busy = false; spin(payBtn(), false); [].slice.call(document.querySelectorAll('[data-cs-buy][aria-busy]')).forEach(function (b) { spin(b, false); }); }
    var id = get(sessionStorage, K_ORDER);
    if (!id) return;
    if (!/^[0-9a-f-]{36}$/.test(id) || asked(id)) { forget(id); return; }
    post({ action: 'back', id: id }).then(function (d) {
      if (!d || !d.ok || d.paid || d.gone || d.checking || !d.ask) { forget(id); return; } // paid (or nothing to ask): silently
      forget(id, true); // asked once, never twice for this order
      ret = { id: id, tier: d.tier, credit: d.credit, amount: d.amount, city: d.city, held: d.held, until: d.until };
      if (!root) build();
      var was = root.classList.contains('open');
      root.querySelector('.csb-ret').innerHTML = ''; ask();
      if (was) { root.classList.remove('sent'); root.classList.add('ret'); title(true); return; } // already open: changes in place
      open(origin(), 'ret');
    }).catch(function () {});
  }
  addEventListener('pageshow', function (e) { back(e.persisted); });

  // ------------------------------------------------------------------ the buttons
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-cs-buy], [data-cs-reserve]');
    if (!b) return;
    e.preventDefault();
    if (b.hasAttribute('data-cs-reserve')) { (st.loaded ? Promise.resolve() : load()).then(function () { open(b, 'clinica'); }); return; }
    var g = blk() && blk().closest('.cst-go');
    if (g && g.contains(b)) payInline(b);
    else carry(Number(b.getAttribute('data-cs-tier')) || 0);
  });
  initBlock();
  // a link with #cumpara: to her phone in the card block (from a post or a message)
  if (/#cumpara\b/.test(location.hash)) addEventListener('load', function () { setTimeout(function () { carry(0); }, 300); });
  load();
  window.CSB = { open: open, close: close, carry: carry };
})();
