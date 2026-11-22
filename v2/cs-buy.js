/* Cardul de Sărbători: buying, on every page (the owner, 21.11). No form, no window.
   The card block (card page and home page) has her phone and the clinic right under the three cards; both its buttons use
   them: „Plătesc online X lei” makes the order on the server and she goes to that card's myPOS PayLink in the same tab;
   „Rezerv și plătesc în clinică” reserves the card at once (reception calls her, she pays in the clinic) and the block
   says so in place. A missing or wrong phone: the button puts her in the field, with one short line. Any other buy button
   ([data-cs-buy], [data-cs-reserve]) carries her to that block (scrolls to it, the card chosen there); on a page without
   it, to the card page. The name on the card is asked on WhatsApp after the payment (api/_lib/card-sarbatori.js).
   Back from the PayLink without paying (the order of this tab in sessionStorage, not paid): a small window, grown out of
   the button she paid with, asks once „Plata nu s-a finalizat?” (retry, card declined, no card at hand, did not understand
   the page, the clinic, changed her mind); her answer goes on the order. The sums are made on the server, never here.
   The card's funnel (site-pulse.js, Admin → Campanii): 'cs-seen' the block came into view, 'cs-buy' / 'cs-res' a tap on
   „Plătesc online” / „Rezerv în clinică” (even when the phone is still missing), 'pay' sent to myPOS, 'cs-sent' the
   reservation made; the order carries her personal link's token (site-pulse.js C360P.tok), when she came with one. */
(function () {
  'use strict';
  // the 290 one is out of sale (22.11), still known here for an order of it (back from its PayLink); 9900: the VIP card
  var TIERS = [[290, 500], [490, 1000], [990, 2500], [9900, 30000]], VIP = 9900;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lei = function (n) { return Math.round(n).toLocaleString('ro-RO') + ' lei'; };
  var ARROW = '<svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  var TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var SPIN = '<span class="csb-spin" data-spin aria-hidden="true"></span>';
  var ADDR = { 'Timișoara': 'Timișoara, Str. Bucegi 7', Arad: 'Arad, Str. Ioan Alexandru 16-18' };
  var st = { open: true, left: 10, loaded: false, links: {}, vip: null };
  var busy = false;
  var K_ORDER = 'c360_cs_order', K_ASKED = 'c360_cs_asked', K_PHONE = 'c360_cs_phone', K_CITY = 'c360_cs_city';
  var get = function (s, k) { try { return s.getItem(k) || ''; } catch (e) { return ''; } };
  var put = function (s, k, v) { try { if (v == null) s.removeItem(k); else s.setItem(k, v); } catch (e) {} };
  // Meta pixel (the owner, 21.11: „tracking cu absolut totul”): it only queues until „Accept” loads it (_shell.html);
  // the Lead's event id is the one the server's Conversions API copy carries, so Meta counts it once
  var px = function (name, data, eid) { try { if (window.fbq) window.fbq('track', name, data || {}, eid ? { eventID: eid } : undefined); } catch (e) {} };
  var item = function (tier) { return { content_name: Number(tier) === VIP ? 'Card VIP Transformarea 360' : 'Card de Sărbători ' + tier + ' lei', content_ids: ['card-' + tier], content_type: 'product', value: Number(tier) || 0, currency: 'RON', num_items: 1 }; };
  // the site's funnel (site-pulse.js): the order started, the payment page / the reservation
  var fev = function (n) { try { if (window.C360P) window.C360P.ev(n); } catch (e) {} };
  var post = function (b) { return fetch('/api/card-sarbatori', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(function (r) { return r.json(); }); };
  var tierOf = function (t) { return TIERS.filter(function (x) { return x[0] === Number(t); })[0] || TIERS[2]; };
  var cardOf = function (t) { return Number(t) === VIP ? 'Cardul VIP' : 'Cardul de ' + lei(t); };
  var hourRo = function () { return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hourCycle: 'h23' }).format(new Date())); };
  // a Romanian mobile, however she writes it: 07xx xxx xxx, +40 7xx, 0040 7xx
  function mobile(v) {
    var d = String(v || '').replace(/\D/g, '');
    if (d.indexOf('0040') === 0) d = '0' + d.slice(4); else if (d.indexOf('40') === 0 && d.length === 11) d = '0' + d.slice(2); else if (d.length === 9 && d[0] === '7') d = '0' + d;
    return /^07\d{8}$/.test(d) ? d : '';
  }
  function load() {
    return fetch('/api/card-sarbatori').then(function (r) { return r.json(); }).then(function (d) {
      if (d && typeof d.left === 'number') { st.open = d.open !== false; st.left = d.left; st.links = d.links || {}; st.vip = d.vip || null; st.loaded = true; }
    }).catch(function () {});
  }

  // ------------------------------------------------------------------ her phone in the card block
  // The block's own parts, written here once and put in by shape() on any page whose markup is older (the live pages
  // until a swap), so every page has the same block: her phone and the clinic, the buttons, a few short lines with a tick.
  var TK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
  // under the buttons: short lines with a tick, nothing that reads like a warning (the saving follows the card chosen)
  var POINTS = '<ul class="cst-pts" data-cs-pts><li><i>' + TK + '</i><span>Economisești <b data-cs-v="save">1.510 lei</b></span></li>' +
    '<li><i>' + TK + '</i><span>La plata online: o ședință de BioLifting cadou și acces în Clubul 360</span></li>' +
    '<li><i>' + TK + '</i><span>Plătești cu cardul pe pagina securizată myPOS</span></li></ul>';
  // the phone and the clinic, put in when a page does not have them
  var FIELD = '<div class="cst-ph" data-cs-ph><label class="cst-pl" for="cst-tel">Telefonul tău · îți trimitem cardul pe WhatsApp</label>' +
    '<div class="cst-pr"><input id="cst-tel" class="cst-in" type="tel" inputmode="numeric" autocomplete="tel" placeholder="07xx xxx xxx" maxlength="16" data-cs-phone>' +
    '<div class="cst-city" role="radiogroup" aria-label="Clinica" data-cs-city><label><input type="radio" name="cst-city" value="Timișoara">Timișoara</label><label><input type="radio" name="cst-city" value="Arad">Arad</label></div></div>' +
    '<p class="cst-msg" data-cs-phmsg role="alert"></p><p class="cst-note">Îți scriem pe WhatsApp doar pentru card.</p></div>';
  // any block brought to that shape (nothing changes when it already has it)
  function shape() {
    var g = document.querySelector('.cst-go'), pb0 = g && g.querySelector('[data-cs-buy]');
    if (!g || !pb0) return;
    if (!g.querySelector('[data-cs-ph]')) pb0.insertAdjacentHTML('beforebegin', FIELD);
    var ph = g.querySelector('[data-cs-ph]');
    // no name field on the page (the owner, 21.11): an older one goes (her name comes from our files or on WhatsApp)
    [].slice.call(ph.querySelectorAll('[data-cs-nmw], [data-cs-nm1]')).forEach(function (el) { el.parentNode.removeChild(el); });
    // the long paragraph under the buttons gives its place to the short lines (in the same spot); a clinic link it held
    // stays, on its own short line under them
    var sub = g.querySelector('.cst-sub');
    if (!g.parentNode.querySelector('[data-cs-pts]')) {
      if (sub) sub.insertAdjacentHTML('beforebegin', POINTS);
      else ([].slice.call(g.children).filter(function (x) { return x.classList.contains('btn') && (x.hasAttribute('data-cs-buy') || x.hasAttribute('data-cs-reserve')); }).pop() || pb0).insertAdjacentHTML('afterend', POINTS);
    }
    if (sub) {
      var res = sub.querySelector('[data-cs-reserve]');
      if (res) { var alt = document.createElement('p'); alt.className = 'cst-alt'; alt.appendChild(document.createTextNode('Preferi la clinică? ')); alt.appendChild(res); g.parentNode.querySelector('[data-cs-pts]').insertAdjacentElement('afterend', alt); }
      sub.parentNode.removeChild(sub);
    }
    // the Google rating first, right under the buttons, then the short lines (the owner, 21.11): they go under it, in its
    // line of the hero (.meta), the clinic link with them
    var meta = [].slice.call(g.parentNode.children).filter(function (c) { return c.classList.contains('meta'); })[0];
    var pts = g.parentNode.querySelector('[data-cs-pts]');
    if (meta && pts && pts.parentNode !== meta) { var alt2 = g.querySelector('.cst-alt'); meta.appendChild(pts); if (alt2) meta.appendChild(alt2); }
    // under „Plătesc online”, one quiet line for when the payment page does not take her card (the owner, 21.11): WhatsApp to
    // her clinic for another link (helpLink)
    // the gift of the online payment, right on „Plătesc online” (the owner, 22.11): the clinic button stays plain
    if (!g.querySelector('[data-cs-gift]')) pb0.insertAdjacentHTML('beforebegin', '<p class="cst-gift" data-cs-gift><span aria-hidden="true">🎁</span> + BioLifting cadou și Clubul 360 la plata online</p>');
    if (!g.querySelector('[data-cs-help]')) pb0.insertAdjacentHTML('afterend', '<p class="cst-help" data-cs-help>Nu te descurci cu plata? <a href="#" target="_blank" rel="noopener" data-cs-wa>Scrie-ne pe WhatsApp</a> și te ajutăm.</p>');
    // one „Au mai rămas” line: the one above the phone (the second, under the block, goes)
    var txt = g.parentNode;
    [].slice.call(txt.querySelectorAll('.meta [data-cs-live]')).forEach(function (el) { el.parentNode.removeChild(el); });
    if (window.CSC && window.CSC.tier && window.CSC.current) window.CSC.tier(window.CSC.current, true); // the saving of the card chosen
  }
  var blk = function () { return document.querySelector('[data-cs-ph]'); };
  var goBox = function () { var b = blk(); return b ? b.closest('.cst-go') : null; };
  var payBtn = function () { var g = goBox(); return g ? g.querySelector('[data-cs-buy]') : null; };
  function phMsg(text, el) {
    var b = blk(); if (!b) return;
    var m = b.querySelector('[data-cs-phmsg]'); m.textContent = ''; void m.offsetWidth; m.textContent = text || '';
    b.querySelector('[data-cs-phone]').classList.toggle('bad', el === 'phone');
    b.querySelector('[data-cs-city]').classList.toggle('bad', el === 'city');
  }
  // the clinic's WhatsApp, read from the page's own contacts (the footer: „Timișoara … tel:”, „Arad … tel:”), never written here
  function clinicNumber(city) {
    var bs = [].slice.call(document.querySelectorAll('.lk b'));
    for (var i = 0; i < bs.length; i++) {
      if (bs[i].textContent.trim() !== city) continue;
      for (var el = bs[i].nextElementSibling; el && el.tagName !== 'B'; el = el.nextElementSibling) if (el.tagName === 'A' && /^tel:/.test(el.getAttribute('href') || '')) return el.getAttribute('href').replace(/\D/g, '');
    }
    return '';
  }
  // her clinic's (Timișoara's before she chose), with a first line written for her
  function helpLink() {
    var a = document.querySelector('[data-cs-wa]'); if (!a) return;
    var b = blk(), city = (b && (b.querySelector('input[name="cst-city"]:checked') || {}).value) || 'Timișoara';
    var n = clinicNumber(city) || clinicNumber('Timișoara');
    var line = a.closest('[data-cs-help]');
    if (!n) { line.hidden = true; return; }
    var tier = (window.CSC && window.CSC.current) || 990;
    a.href = 'https://wa.me/' + n + '?text=' + encodeURIComponent('Bună ziua! Vreau ' + (Number(tier) === VIP ? 'Cardul VIP Transformarea 360 (9.900 lei)' : 'Cardul de Sărbători de ' + tier + ' lei') + ', dar plata online nu merge. Îmi trimiteți alt link?');
  }
  function initBlock() {
    shape();
    helpLink();
    document.addEventListener('change', function (e) { if (e.target && (e.target.name === 'cst-city' || e.target.name === 'cst')) helpLink(); });
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-cs-wa]')) helpLink(); }, true);
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
    else { btn.disabled = false; btn.removeAttribute('aria-busy'); if (s) s.remove(); if (btn._lbl != null) { var l = btn.querySelector('span:not([data-spin])'); if (l) l.innerHTML = btn._lbl; btn._lbl = null; } }
  }
  // the tap felt at once: „Te ducem la plată…” on the button while the payment page loads
  function pressed(btn) {
    spin(btn, true);
    var l = btn.querySelector('span:not([data-spin])');
    if (l && btn._lbl == null) { btn._lbl = l.innerHTML; l.textContent = 'Te ducem la plată…'; }
  }
  // the order's id, made here: she goes to myPOS at once and the order follows (the owner, 22.11: „prea lent”)
  function uuid() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      var a = crypto.getRandomValues(new Uint8Array(16)); a[6] = (a[6] & 15) | 64; a[8] = (a[8] & 63) | 128;
      var h = [].map.call(a, function (x) { return (x + 256).toString(16).slice(1); }).join('');
      return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
    } catch (e) { return ''; }
  }
  // a buy button away from the block: carried to it (the card chosen there), the field or the button in focus
  function carry(tier, clinic) {
    var g = goBox();
    if (!g) {
      if (/card-sarbatori/.test(location.pathname)) return; // the card page with no block: nothing to carry to
      location.href = (location.pathname.indexOf('/v2/') === 0 ? '/v2/' : '/') + 'card-sarbatori#cumpara'; return;
    }
    if (tier && window.CSC && window.CSC.tier) window.CSC.tier(tier);
    var inp = blk().querySelector('[data-cs-phone]');
    var target = !mobile(inp.value) ? inp : clinic ? g.querySelector('[data-cs-reserve]') : payBtn();
    g.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    setTimeout(function () { if (target) target.focus({ preventScroll: true }); }, reduce ? 0 : 520);
  }
  var PMSG = { bad_phone: 'Scrie un număr de mobil valid (07xx xxx xxx).', missing_city: 'Alege clinica: Timișoara sau Arad.', too_many: 'Prea multe încercări. Încearcă din nou în câteva minute.',
    too_many_cards: 'Pe acest număr sunt deja multe carduri. Te sunăm noi.', sold_out: 'Cardurile s-au terminat.', closed: 'Oferta s-a încheiat.', not_enough: 'Cardurile s-au terminat.',
    no_link: 'Plata online nu e disponibilă acum. Rezervă cardul și plătești în clinică.' };
  // the VIP one: 5 per clinic, its own stock
  var vipOut = function (city) {
    var o = city === 'Arad' ? 'Timișoara' : 'Arad', x = st.vip && st.vip[o];
    return 'Cardurile VIP din ' + city + ' s-au epuizat.' + (x && x.left > 0 ? ' La ' + o + ' mai sunt.' : '');
  };
  // both buttons of the block: online → the PayLink; clinic → reserved here, said in place
  function order(btn, clinic) {
    var b = blk(); if (!b || busy) return;
    fev(clinic ? 'cs-res' : 'cs-buy');
    var inp = b.querySelector('[data-cs-phone]');
    var phone = mobile(inp.value), city = (b.querySelector('input[name="cst-city"]:checked') || {}).value || '';
    var tier = (window.CSC && window.CSC.current) || Number(btn.getAttribute('data-cs-tier')) || 990;
    if (!phone) { phMsg(inp.value.trim() ? PMSG.bad_phone : 'Scrie numărul tău de mobil: pe el îți trimitem cardul.', 'phone'); inp.focus(); return; }
    if (!city) { phMsg(PMSG.missing_city, 'city'); b.querySelector('input[name="cst-city"]').focus(); return; }
    put(localStorage, K_PHONE, phone); put(localStorage, K_CITY, city);
    var vip = Number(tier) === VIP;
    // online, its PayLink known and a card there for her: to myPOS now, the order sent on the way (keepalive), not awaited
    // (what cs-card.js already read when this file's own read is not back yet: the same answer)
    var cs = window.CSC && window.CSC.state;
    if (!st.loaded && cs && typeof cs.left === 'number') { st.open = cs.open !== false; st.left = cs.left; st.links = cs.links || {}; st.vip = cs.vip || null; st.loaded = true; }
    var link = !clinic && st.loaded && st.links && st.links[tier], id = link ? uuid() : '';
    if (link && id && (vip ? !(st.vip && st.vip[city] && st.vip[city].left <= 0) : st.open && st.left > 0)) {
      busy = true; pressed(btn); phMsg('');
      var fb = { id: id, tier: tier, qty: 1, pay: 'online', forWho: 'eu', phone: phone, city: city, consent: true, website: '', page: location.href };
      if (window.C360P && window.C360P.tok) fb.ct = window.C360P.tok;
      if (window.C360_CONSENT === true) fb.event_id = 'lead.' + Date.now().toString(36) + '.' + Math.random().toString(36).slice(2, 10);
      var v0 = item(tier);
      px('InitiateCheckout', v0); fev('start'); px('Lead', v0, fb.event_id); fev('pay');
      put(sessionStorage, K_ORDER, id);
      var json = JSON.stringify(fb);
      try { fetch('/api/card-sarbatori', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: json }).catch(function () {}); }
      catch (e) { try { navigator.sendBeacon('/api/card-sarbatori', new Blob([json], { type: 'application/json' })); } catch (e2) {} }
      location.href = link;
      return;
    }
    busy = true; spin(btn, true); phMsg('');
    var stop = function (text) { busy = false; spin(btn, false); if (text) phMsg(text); };
    (st.loaded ? Promise.resolve() : load()).then(function () {
      if (vip && st.vip && st.vip[city] && st.vip[city].left <= 0) { stop(vipOut(city)); return; }
      if (!vip && !st.open) { stop(st.left <= 0 ? PMSG.sold_out : PMSG.closed); return; }
      if (!clinic && !(st.links && st.links[tier])) { stop(PMSG.no_link); return; }
      var body = { tier: tier, qty: 1, pay: clinic ? 'clinica' : 'online', forWho: 'eu', phone: phone, city: city, consent: true, website: '', page: location.href };
      if (window.C360P && window.C360P.tok) body.ct = window.C360P.tok;
      if (window.C360_CONSENT === true) body.event_id = 'lead.' + Date.now().toString(36) + '.' + Math.random().toString(36).slice(2, 10);
      var val = item(tier);
      px(clinic ? 'AddToCart' : 'InitiateCheckout', val); fev('start');
      return post(body).then(function (d) {
        if (!clinic && d.ok && d.link) { px('Lead', val, body.event_id); fev('pay'); put(sessionStorage, K_ORDER, d.id || ''); location.href = d.link; return; }
        if (clinic && d.ok && d.reservation) {
          px('Lead', val, body.event_id); fev('lead'); fev('cs-sent');
          if (d.vip) st.vip = d.vip;
          if (typeof d.left === 'number' && window.CSC && window.CSC.state) window.CSC.set(Object.assign({}, window.CSC.state, vip ? { vip: d.vip || window.CSC.state.vip } : { left: d.left }));
          busy = false; spin(btn, false); reserved(d.reservation); return;
        }
        if (d.error === 'no_link') st.links[tier] = null;
        if (vip && (d.error === 'sold_out' || d.error === 'not_enough')) {
          if (d.vip) { st.vip = d.vip; if (window.CSC && window.CSC.state) window.CSC.set(Object.assign({}, window.CSC.state, { vip: d.vip })); }
          stop(vipOut(city)); return;
        }
        stop(PMSG[d.error] || 'Nu am putut trimite. Încearcă din nou.');
      });
    }).catch(function () { stop('Nu am putut trimite. Încearcă din nou.'); });
  }
  // reserved: the field and the buttons give their place to one line with a tick (the scarcity line stays)
  function reservedText(r) {
    var t = tierOf(r.tier);
    return '<b>' + cardOf(t[0]) + ' e rezervat.</b><span>Te sunăm ' + (hourRo() < 18 ? 'azi' : 'mâine') +
      ' să stabilim plata în clinică (' + (ADDR[r.city] || r.city) + ')' + (t[0] === VIP ? ' și revizia ta completă' : '') + '. Primești ' + lei(t[1]) + ' în tratamente.</span>';
  }
  function reserved(r) {
    var g = goBox(); if (!g) return;
    var box = g.querySelector('.cst-done');
    if (!box) { box = document.createElement('div'); box.className = 'cst-done'; box.setAttribute('role', 'status'); box.setAttribute('tabindex', '-1'); blk().insertAdjacentElement('beforebegin', box); }
    box.innerHTML = '<span class="cst-tick">' + TICK + '</span><div>' + reservedText(r) + '</div>';
    g.classList.add('is-done');
    box.focus({ preventScroll: true });
    var rr = box.getBoundingClientRect();
    if (rr.top < 0 || rr.bottom > innerHeight) box.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  }

  // ------------------------------------------------------------------ back from the PayLink, not paid: the small window
  var root, panel, from = null, ret = null; // ret: { id, tier, credit, amount, city, held, until }
  function build() {
    root = document.createElement('div');
    root.className = 'csb ret'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'csb-t'); root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<div class="csb-bg" data-csb-close></div><div class="csb-p" tabindex="-1"><span class="csb-grab" aria-hidden="true"></span><div class="csb-in">' +
      '<div class="csb-h"><h2 id="csb-t">Plata nu s-a <em>finalizat?</em></h2><button type="button" class="csb-x" data-csb-close aria-label="Închide"><i></i><i></i></button></div>' +
      '<div class="csb-ret" aria-live="polite"></div></div></div>';
    document.body.appendChild(root);
    panel = root.querySelector('.csb-p');
    root.addEventListener('click', function (e) { if (e.target.closest('[data-csb-close]')) close(); });
    root.querySelector('.csb-ret').addEventListener('click', function (e) { var b = e.target.closest('[data-ret]'); if (b) reply(b.getAttribute('data-ret'), b); });
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('open')) close(); });
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
  function open(btn) {
    if (!root) build();
    from = btn || null;
    root.classList.remove('shown');
    root.classList.add('open'); root.setAttribute('aria-hidden', 'false'); document.documentElement.classList.add('csb-lock');
    fly(true).then(function () { root.classList.add('shown'); });
    panel.focus({ preventScroll: true });
  }
  function close() {
    if (!root || !root.classList.contains('open')) return;
    root.classList.remove('shown');
    fly(false).then(function () {
      root.classList.remove('open'); root.setAttribute('aria-hidden', 'true'); document.documentElement.classList.remove('csb-lock');
      if (from && from.focus) from.focus({ preventScroll: true });
    });
  }
  var hhmm = function (iso) { var t = Date.parse(iso); return t ? new Date(t).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }) : ''; };
  function retScreen(html, done) {
    root.querySelector('#csb-t').innerHTML = done ? 'Cardul de <em>Sărbători</em>' : 'Plata nu s-a <em>finalizat?</em>';
    root.querySelector('.csb-ret').innerHTML = '<div class="csb-rs">' + html + '</div>';
  }
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
      if (d && d.paid) { retScreen('<span class="csb-tick">' + TICK + '</span><h3>Plata a ajuns.</h3><p class="csb-rl">Cardul îți vine pe WhatsApp în câteva minute.</p><button type="button" class="btn ghost" data-ret="close">Gata</button>', true); return; }
      if (k === 'retry') {
        if (d && d.link) { fev('pay'); location.href = d.link; return; }
        throw new Error(d && d.error === 'sold_out' ? 'Cardurile s-au terminat între timp.' : d && d.error === 'closed' ? 'Oferta s-a încheiat.' : 'Plata online nu merge acum. Îl poți rezerva și plăti în clinică.');
      }
      if (k === 'clinic') {
        // the same order, now paid in the clinic (her phone is on it): reception calls her
        if (!(d && d.reservation)) throw new Error(d && d.error === 'sold_out' ? 'Cardurile s-au terminat între timp.' : 'Nu am putut trimite. Încearcă din nou.');
        fev('lead'); fev('cs-sent');
        retScreen('<span class="csb-tick">' + TICK + '</span><p class="csb-rd">' + reservedText(d.reservation) + '</p><button type="button" class="btn ghost" data-ret="close">Gata</button>', true);
        return;
      }
      if (d && d.error) throw new Error('Nu am putut trimite. Încearcă din nou.');
      if (k === 'no') { retScreen('<h3>Am înțeles. Mulțumim!</h3><p class="csb-rl">Dacă te răzgândești, cardul e aici până pe 24 decembrie, cât mai sunt carduri.</p><button type="button" class="btn ghost" data-ret="close">Închide</button>', true); return; }
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
    if (persisted) { busy = false; [].slice.call(document.querySelectorAll('[data-cs-buy][aria-busy], [data-cs-reserve][aria-busy]')).forEach(function (b) { spin(b, false); }); }
    var id = get(sessionStorage, K_ORDER);
    if (!id) return;
    if (!/^[0-9a-f-]{36}$/.test(id) || asked(id)) { forget(id); return; }
    post({ action: 'back', id: id }).then(function (d) {
      if (!d || !d.ok || d.paid || d.gone || d.checking || !d.ask) { forget(id); return; } // paid, or nothing to ask: silently
      forget(id, true); // asked once, never twice for this order
      ret = { id: id, tier: d.tier, credit: d.credit, amount: d.amount, city: d.city, held: d.held, until: d.until };
      if (!root) build();
      ask();
      open(origin());
    }).catch(function () {});
  }
  addEventListener('pageshow', function (e) { back(e.persisted); });

  // ------------------------------------------------------------------ the buttons
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-cs-buy], [data-cs-reserve]');
    if (!b) return;
    e.preventDefault();
    var clinic = b.hasAttribute('data-cs-reserve'), g = goBox();
    if (g && (g.contains(b) || b.closest('.cst-alt'))) order(b, clinic); // the block's buttons, and its clinic link under the rating
    else carry(Number(b.getAttribute('data-cs-tier')) || 0, clinic);
  });
  initBlock();
  // the card's block came into view (the funnel's „Au văzut cardul”, Admin → Campanii): once; half of it, or (a block
  // taller than the phone's screen) 40% of the screen filled by it; after the page's scripts (site-pulse.js comes later)
  var watch = function () {
    try {
      var seen = [].slice.call(document.querySelectorAll('[data-cst], .cst-go, .cs-tiers'));
      if (!seen.length || !('IntersectionObserver' in window)) return;
      var io = new IntersectionObserver(function (es) {
        if (es.some(function (x) { return x.isIntersecting && (x.intersectionRatio >= 0.5 || x.intersectionRect.height >= innerHeight * 0.4); })) { fev('cs-seen'); io.disconnect(); }
      }, { threshold: [0, 0.1, 0.25, 0.5] });
      seen.forEach(function (el) { io.observe(el); });
    } catch (e) {}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  // a link with #cumpara: to her phone in the card block (from a post or a message)
  if (/#cumpara\b/.test(location.hash)) addEventListener('load', function () { setTimeout(function () { carry(0); }, 300); });
  load();
  window.CSB = { carry: carry, close: close };
})();
