/* „Află în 30 de secunde ce ți se potrivește”: the lead filter on the site (the owner, 21.11), the same chain as the Facebook
   forms: the clinic, the zone, what bothers her, when she wants the result, then the zone's four packages (the highest first,
   „cele mai multe aleg asta” on the one most take), then her name and phone. The lead goes into the same lead filter
   (api/site-lead.js → the WhatsApp with her package's picture, the call for the big ones, the push). Any [data-lf] opens it
   (data-lf-zone / data-lf-city preselect), grown out of the button and gone back into it; ?lf=1 or #pachet opens it at once,
   ?zona= or ?din=<topic> preselects the zone. It uses the card window's look (cs-buy.css) plus lf.css. Classes: lfs-. */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ARROW = '<svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>';
  var TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var CITIES = ['Timișoara', 'Arad'];
  // the preview only (/v2/): the owner's open question that belongs to this step
  var PROP = location.pathname.indexOf('/v2/') === 0 ? '<details class="lfs-prop"><summary>De confirmat: plata online aici?</summary><p>Propunere: plata online direct din acest pas, pentru pachetele de 390 și 990 lei (și 190 la gușă), ca HIFU gușă plătit cu cardul care a vândut 90 într-o zi. Cine plătește online are locul rezervat pe loc și primește un bonus ales de tine (de exemplu un tratament facial Restart). Prețul rămâne cel întreg. Trebuie câte un PayLink myPOS pe pachet. O pornim?</p></details>' : '';
  // a topic from a link (?din=gusa, a reel's word) → the zone
  var TOPIC = { gusa: 'gusa-contur', 'barbie-dubla': 'gusa-contur', barbie: 'gusa-contur', contur: 'gusa-contur', gat: 'gusa-contur',
    abdomen: 'abdomen-talie', talie: 'abdomen-talie', burta: 'abdomen-talie', burtica: 'abdomen-talie', grasime: 'abdomen-talie',
    coapse: 'coapse-fese', fese: 'coapse-fese', celulita: 'coapse-fese', picioare: 'coapse-fese', brate: 'brate',
    fata: 'fata', riduri: 'fata', ten: 'fata', lifting: 'fata', par: 'par-nedorit', laser: 'par-nedorit', epilare: 'par-nedorit' };
  var lei = function (n) { return Math.round(Number(n) || 0).toLocaleString('ro-RO') + ' lei'; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fold = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); };
  var fev = function (n) { try { if (window.C360P) window.C360P.ev(n); } catch (e) {} };
  var px = function (name, data, eid) { try { if (window.fbq) window.fbq('track', name, data || {}, eid ? { eventID: eid } : undefined); } catch (e) {} };

  var offer = null, loading = null;
  var st = {}, root, panel, sc, ft, from = null, busy = false;
  function load() {
    if (offer) return Promise.resolve(offer);
    if (!loading) loading = fetch('/api/site-lead?lf=1').then(function (r) { return r.json(); }).then(function (d) { if (d && d.ok) offer = d; return offer; }).catch(function () { loading = null; return null; });
    return loading;
  }
  var zonesOf = function (city) { return (offer && offer.cities && offer.cities[city]) || []; };
  // before she says the clinic (it's the last question now, the owner 21.11): both clinics' zones in one list; a package's
  // value the lower of the two, an item that differs said for each („EMS la Timișoara, radiofrecvență la Arad”)
  function both() {
    var tm = zonesOf('Timișoara'), ar = zonesOf('Arad');
    var words = function (l) { return String(l || '').split(' '); };
    var mix = function (a, b) { if (!b || a.label === b.label) return a; var x = words(a.label), y = words(b.label), k = 0; while (k < x.length && k < y.length && x[k] === y[k]) k++;
      return { label: x.join(' ') + ' la Timișoara, ' + y.slice(k).join(' ') + ' la Arad', qty: a.qty }; };
    return tm.map(function (z) {
      var a = ar.filter(function (x) { return x.key === z.key; })[0];
      if (!a) return z;
      var packs = {};
      Object.keys(z.packs || {}).forEach(function (t) {
        var p = z.packs[t], q = a.packs[t];
        packs[t] = !q ? p : Object.assign({}, p, { items: (p.items || []).map(function (it, i) { return mix(it, (q.items || [])[i]); }), value: Math.min(p.value || 0, q.value || 0), valueFrom: (p.value || 0) !== (q.value || 0) });
      });
      return Object.assign({}, z, { packs: packs });
    }).concat(ar.filter(function (a) { return !tm.some(function (z) { return z.key === a.key; }); }));
  }
  var zonesNow = function () { return st.city ? zonesOf(st.city) : both(); };
  var zoneOf = function () { return zonesNow().filter(function (z) { return z.key === st.zone; })[0] || null; };
  var ONLY = { 'par-nedorit': 'Timișoara' }; // a zone one clinic has: its clinic, without asking
  function zoneCity() {
    if (ONLY[st.zone]) { if (!st.cityFixed || st.cityAuto) { st.city = ONLY[st.zone]; st.cityFixed = true; st.cityAuto = true; } }
    else if (st.cityAuto) { st.city = ''; st.cityFixed = false; st.cityAuto = false; }
  }
  // the steps she still has to go through, in order
  function steps() {
    // zone → problem → when → package → clinic → her details (the clinic last, the owner 21.11)
    var s = [];
    if (!st.zoneFixed) s.push('zone');
    s.push('problem', 'when', 'pack');
    if (!st.cityFixed) s.push('city');
    s.push('contact');
    return s;
  }

  function build() {
    root = document.createElement('div');
    root.className = 'csb lfs'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'lfs-t'); root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '<div class="csb-bg" data-lfs-close></div><div class="csb-p" tabindex="-1"><span class="csb-grab" aria-hidden="true"></span><div class="csb-in">' +
      '<div class="csb-h"><button type="button" class="lfs-back" data-lfs-back aria-label="Înapoi">' + BACK + '</button><h2 id="lfs-t">Ce ți se <em>potrivește?</em></h2><button type="button" class="csb-x" data-lfs-close aria-label="Închide"><i></i><i></i></button></div>' +
      '<div class="lfs-bar" aria-hidden="true"><i></i></div>' +
      '<div class="csb-sc"></div><div class="csb-ft"></div><div class="csb-done" aria-live="polite"></div></div></div>';
    document.body.appendChild(root);
    panel = root.querySelector('.csb-p'); sc = root.querySelector('.csb-sc'); ft = root.querySelector('.csb-ft');
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-lfs-close]')) { close(); return; }
      if (e.target.closest('[data-lfs-back]')) { back(); return; }
      var r = e.target.closest('[data-sel]');
      if (r) { st.sel = r.getAttribute('data-sel'); var l = sc.querySelector('.lfs-packs'); if (l) { l.innerHTML = packs(zoneOf()); var m = l.querySelector('.lfs-more'); if (m && !reduce && m.animate) m.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)' }); } return; }
      var o = e.target.closest('[data-pick]');
      if (o) pick(o.getAttribute('data-pick'), o.getAttribute('data-v'));
    });
    addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('open')) close(); });
  }

  function pick(what, v) {
    if (what === 'city') st.city = v;
    else if (what === 'zone') { st.zone = v; st.problem = ''; st.tier = ''; st.sel = ''; zoneCity(); }
    else if (what === 'problem') st.problem = v;
    else if (what === 'when') st.when = v;
    else if (what === 'pack') st.tier = v;
    if (!st.started) { st.started = true; fev('start'); }
    go(1);
  }
  function back() { go(-1); }
  function go(dir) {
    var s = steps(), i = Math.max(0, Math.min(s.length - 1, s.indexOf(st.step) + dir));
    show(s[i], dir);
  }

  function show(step, dir) {
    st.step = step;
    var s = steps(), i = s.indexOf(step);
    root.querySelector('.lfs-bar i').style.transform = 'scaleX(' + ((i + 1) / s.length) + ')';
    root.querySelector('[data-lfs-back]').hidden = i <= 0;
    var z = zoneOf(), html = '', foot = '';
    if (step === 'city') {
      html = q('Unde vrei să vii?', 'Avem două clinici.') + '<div class="lfs-two">' + CITIES.map(function (c) { return opt('city', c, '<b>' + c + '</b>' + (c === 'Timișoara' ? '<small>Str. Bucegi 7</small>' : '<small>Str. Ioan Alexandru 16-18</small>'), st.city === c); }).join('') + '</div>';
    } else if (step === 'zone') {
      html = q('Ce zonă vrei să schimbi cel mai mult?') + '<div class="lfs-list">' + zonesNow().map(function (x) { return opt('zone', x.key, '<b>' + esc(x.label) + '</b>', st.zone === x.key); }).join('') + '</div>';
    } else if (step === 'problem') {
      html = proof(st.zone) + q('Ce te deranjează cel mai mult?', z ? esc(z.label) : '') + '<div class="lfs-list">' + ((z && z.problems) || []).map(function (p) { return opt('problem', p.key, '<b>' + esc(p.label) + '</b>', st.problem === p.key); }).join('') + '</div>';
    } else if (step === 'when') {
      html = q('Când vrei să vezi rezultatul?') + '<div class="lfs-list">' + ((offer && offer.timeline) || []).map(function (t) { return opt('when', t.key, '<b>' + esc(t.label) + '</b>', st.when === t.key); }).join('') + '</div>';
    } else if (step === 'pack') {
      html = q('Ce variantă ți se potrivește?') + '<div class="lfs-packs" role="radiogroup" aria-label="Variantele">' + packs(z) + '</div>' +
        '<p class="lfs-safe">Consultația e gratuită. Plătești doar la clinică, după consultație.</p>';
    } else if (step === 'contact') {
      var p = z && z.packs[st.tier];
      html = q('Unde îți trimitem detaliile?', 'Pe WhatsApp primești acum tot ce include pachetul. Nu plătești nimic acum.') +
        '<p class="csb-chips lfs-chips"><span>' + esc(z ? z.label : '') + '</span>' + (p ? '<span>' + lei(p.price) + ' · ' + esc(p.name) + '</span>' : '') + '<span>' + esc(st.city) + '</span></p>' +
        '<form class="csb-f lfs-f" novalidate><div class="csb-two"><div><span class="csb-l">Numele tău</span><input type="text" name="name" autocomplete="name" placeholder="ex: Maria Popescu"></div>' +
        '<div><span class="csb-l">Telefon (WhatsApp)</span><input type="tel" name="phone" inputmode="tel" autocomplete="tel" placeholder="07xx xxx xxx"></div></div>' +
        '<label class="csb-hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>' +
        '<label class="csb-ok"><input type="checkbox" name="consent"><i>' + TICK + '</i><span>Sunt de acord să fiu contactată telefonic sau pe WhatsApp de Centrul360.</span></label></form>';
      foot = '<p class="csb-err" role="alert"></p><button type="button" class="btn book lfs-go">Trimite-mi detaliile' + ARROW + '</button><p class="csb-note">Consultația e gratuită. Datele tale rămân la noi.</p>';
    }
    sc.innerHTML = '<div class="lfs-step">' + html + '</div>';
    ft.innerHTML = foot; ft.hidden = !foot;
    sc.scrollTop = 0;
    if (step === 'contact') {
      var f = sc.querySelector('form');
      f.addEventListener('submit', function (e) { e.preventDefault(); send(); });
      f.addEventListener('input', function () { ft.querySelector('.csb-err').textContent = ''; });
      ft.querySelector('.lfs-go').addEventListener('click', send);
    }
    var el = sc.firstChild;
    if (!reduce && dir && el.animate) el.animate([{ opacity: 0, transform: 'translateX(' + (dir > 0 ? 28 : -28) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' });
  }
  // above „Ce te deranjează?”: a real result of her zone (the owner, 22.11; only the homepage's approved cases, the strongest
  // per zone), small beside its caption; arms have no case in the set (no photo); hair removal shows its guarantee instead
  var BA = {
    'abdomen-talie': ['cazul-39-hifu-abdomen-tm.webp', 1400, 946, 'HIFU abdomen', '1 ședință'],
    'coapse-fese': ['cazul-05-liposonix-solduri.webp', 1400, 944, 'Liposonix șolduri', '1 ședință'],
    'gusa-contur': ['cazul-16-hifu-gusa-tm-4.webp', 1283, 1400, 'HIFU gușă', '1 ședință'],
    'fata': ['cazul-23-hifu-periocular-tm.webp', 1400, 946, 'HIFU periocular', '1 ședință'],
  };
  function proof(zone) {
    if (zone === 'par-nedorit') return '<div class="lfs-gar"><b>Garanție scrisă</b>Dacă, după protocolul complet recomandat de noi, părul crește la loc ca înainte, continuăm gratuit până nu mai e nevoie.</div>';
    var c = BA[zone]; if (!c) return '';
    return '<figure class="lfs-ba"><img src="/brand_asset/catalog/' + c[0] + '" alt="Înainte și după: ' + esc(c[3]) + '" width="' + c[1] + '" height="' + c[2] + '" decoding="async">' +
      '<figcaption><b>Rezultat real</b>' + esc(c[3]) + ' · ' + esc(c[4]) + '<small>Clientele noastre, fotografiate la noi. Rezultatele diferă de la o persoană la alta.</small></figcaption></figure>';
  }
  function q(t, sub) { return '<div class="lfs-q"><h3>' + t + '</h3>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>'; }
  function opt(what, v, inner, on) { return '<button type="button" class="lfs-o' + (on ? ' on' : '') + '" data-pick="' + what + '" data-v="' + esc(v) + '"><span>' + inner + '</span>' + ARROW + '</button>'; }
  // the packages (the owner, 21.11 evening: the anchor works by comparison, not by filling the screen): all four as calm rows,
  // the highest first; the chosen one (at first the one most take) open, with what's in it and its button; a tap on another
  // row opens that one instead. The lowest is the easy start.
  // one of them: „ședințe LipoSonix” → „ședință LipoSonix”, „tratamente faciale” → „tratament facial”
  function one(l) { return String(l || '').replace(/^ședințe\b/, 'ședință').replace(/^tratamente faciale\b/, 'tratament facial').replace(/^tratamente\b/, 'tratament'); }
  function packs(z) {
    var tiers = (z && z.tiers) || [];
    if (!st.sel || tiers.indexOf(st.sel) < 0) st.sel = st.tier || tiers.filter(function (t) { return z.packs[t] && z.packs[t].popular; })[0] || tiers[tiers.length - 1];
    return tiers.map(function (t, i) { return pack(t, z.packs[t], i === tiers.length - 1); }).join('');
  }
  function pack(t, p, last) {
    if (!p) return '';
    var on = st.sel === t, sh = fold(p.short) === fold(p.name) ? '' : (p.short || '');
    var head = '<button type="button" class="lfs-row" role="radio" aria-checked="' + on + '" data-sel="' + esc(t) + '">' +
      '<span class="lfs-rd" aria-hidden="true"></span>' +
      '<span class="lfs-rt"><b>' + lei(p.price) + '</b><strong>' + esc(p.name) + '</strong>' +
      '<small>' + esc(sh) + (p.value > p.price ? (sh ? ' · ' : '') + 'valoare ' + (p.valueFrom ? 'de la ' : '') + lei(p.value) : '') + '</small></span>' +
      (p.popular ? '<em class="lfs-pop">Cele mai multe aleg asta</em>' : last ? '<em class="lfs-start">Vreau doar să încep</em>' : '') + '</button>';
    var body = '';
    if (on) {
      var items = (p.items || []).slice(0, 3).map(function (x) { return '<li>' + (x.qty > 1 ? x.qty + ' × ' + esc(x.label) : x.qty === 1 ? '1 ' + esc(one(x.label)) : esc(x.label)) + '</li>'; })
        .concat((p.bonuses || []).slice(0, 1).map(function (b) { return '<li class="b">' + esc(b) + '</li>'; })).join('');
      body = '<div class="lfs-more"><ul>' + items + '</ul>' +
        (p.guarantee && p.guarantee.short ? '<span class="lfs-g">' + esc((p.guarantee.short.charAt(0) + p.guarantee.short.slice(1).toLowerCase()).replace(/\*+$/, '')) + '</span>' : '') +
        '<button type="button" class="btn book lfs-take" data-pick="pack" data-v="' + esc(t) + '">Aleg varianta asta · ' + lei(p.price) + ARROW + '</button>' + PROP + '</div>';
    }
    return '<div class="lfs-pk' + (p.popular ? ' pop' : '') + (on ? ' on' : '') + (last ? ' low' : '') + '">' + head + body + '</div>';
  }

  var MSG = { missing_fields: 'Scrie numele și un telefon valid.', missing_city: 'Alege clinica.', missing_consent: 'Bifează acordul, ca să te putem contacta.', too_many: 'Prea multe încercări. Încearcă din nou în câteva minute.', bad_zone: 'Alege zona din nou.', bad_tier: 'Alege pachetul din nou.' };
  function send() {
    if (busy) return;
    var f = sc.querySelector('form'), err = ft.querySelector('.csb-err');
    var v = function (n) { var el = f.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
    if (v('name').length < 2) { err.textContent = 'Scrie numele tău.'; return; }
    if (v('phone').replace(/\D/g, '').length < 9) { err.textContent = 'Scrie un număr de telefon valid.'; return; }
    if (!f.consent.checked) { err.textContent = MSG.missing_consent; return; }
    var eid = window.C360_CONSENT === true ? 'lead.' + Date.now().toString(36) + '.' + Math.random().toString(36).slice(2, 10) : '';
    var body = { lf: { zone: st.zone, problem: st.problem, when: st.when, tier: st.tier }, nume: v('name'), telefon: v('phone'), oras: st.city, consimtamant_whatsapp: true,
      website: v('website'), sursa: (window.C360P && window.C360P.src) || 'site', pagina: location.href.slice(0, 200), event_id: eid || undefined };
    busy = true; var b = ft.querySelector('.lfs-go'); b.disabled = true; b.innerHTML = '<span class="csb-spin" aria-hidden="true"></span>Se trimite…';
    fetch('/api/site-lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) throw new Error(MSG[d && d.error] || 'Nu am putut trimite. Încearcă din nou.');
      var p = (zoneOf() || { packs: {} }).packs[st.tier] || {};
      px('Lead', { content_name: 'Lead filter · ' + ((zoneOf() || {}).label || ''), value: Number(st.tier) || 0, currency: 'RON' }, eid);
      fev('lead');
      done(v('name'), p, !!d.hot);
    }).catch(function (x) {
      busy = false; b.disabled = false; b.innerHTML = 'Trimite-mi detaliile' + ARROW;
      err.textContent = x && x.message && !/^(Failed|NetworkError|Load)/.test(x.message) ? x.message : 'Nu am putut trimite. Încearcă din nou.';
    });
  }
  function done(name, p, hot) {
    busy = false;
    var fn = String(name || '').split(/\s+/)[0];
    root.querySelector('.csb-done').innerHTML = '<span class="csb-tick">' + TICK + '</span><h3>Gata' + (fn ? ', ' + esc(fn) : '') + '!</h3>' +
      '<p class="csb-chips"><span>' + esc((zoneOf() || {}).label || '') + '</span><span>' + lei(p.price) + ' · ' + esc(p.name || '') + '</span><span>' + esc(st.city) + '</span></p>' +
      '<ol class="csb-next"><li><span><b>Primești acum pe WhatsApp</b>Tot ce include pachetul, cu poza lui.</span></li>' +
      '<li><span><b>' + (hot ? 'Te sunăm în câteva minute' : 'Te sunăm în cel mai scurt timp') + '</b>Ca să-ți găsim o oră pentru consultația gratuită, la ' + esc(st.city) + '.</span></li>' +
      '<li><span><b>Plătești doar la clinică</b>După consultație, dacă e varianta potrivită pentru tine.</span></li></ol>' +
      '<button type="button" class="btn book" data-book data-book-service="consult" data-book-city="' + esc(st.city) + '" data-lfs-close>Vreau să-mi aleg acum ora' + ARROW + '</button>' +
      '<button type="button" class="cta-lnk lfs-close" data-lfs-close>Închide</button>';
    root.classList.add('sent');
    root.querySelector('.lfs-bar i').style.transform = 'scaleX(1)';
    root.querySelector('[data-lfs-back]').hidden = true;
  }

  function fly(open) {
    if (reduce || !panel.animate) return Promise.resolve();
    var r1 = panel.getBoundingClientRect(), r0 = from && from.isConnected ? from.getBoundingClientRect() : null;
    var a = r0 && r0.width ? 'translate(' + (r0.left + r0.width / 2 - (r1.left + r1.width / 2)) + 'px,' + (r0.top + r0.height / 2 - (r1.top + r1.height / 2)) + 'px) scale(' +
      Math.max(0.05, r0.width / r1.width) + ',' + Math.max(0.03, r0.height / r1.height) + ')' : 'translateY(24px) scale(.96)';
    var k = open ? [{ transform: a, opacity: 0.6 }, { transform: 'none', opacity: 1 }] : [{ transform: 'none', opacity: 1 }, { transform: a, opacity: 0 }];
    return new Promise(function (res) { var an = panel.animate(k, { duration: open ? 560 : 420, easing: 'cubic-bezier(.16,1,.3,1)' }); an.onfinish = res; an.oncancel = res; });
  }
  function open(btn, opts) {
    if (!root) build();
    from = btn || null;
    var o = opts || {};
    var city = o.city || (btn && btn.getAttribute('data-lf-city')) || '';
    city = CITIES.filter(function (c) { return fold(c) === fold(city); })[0] || '';
    var zone = o.zone || (btn && btn.getAttribute('data-lf-zone')) || '';
    st = { city: city, cityFixed: !!city, cityAuto: false, zone: zone, zoneFixed: false, problem: '', when: '', tier: '', started: false, step: '' };
    root.classList.remove('sent', 'shown');
    sc.innerHTML = '<div class="lfs-wait"><span class="csb-spin csb-spin-big" aria-hidden="true"></span></div>'; ft.hidden = true;
    root.classList.add('open'); root.setAttribute('aria-hidden', 'false'); document.documentElement.classList.add('csb-lock');
    fly(true).then(function () { root.classList.add('shown'); });
    panel.focus({ preventScroll: true });
    fev('open');
    load().then(function (d) {
      if (!d) { sc.innerHTML = '<div class="lfs-q"><h3>Nu am putut încărca variantele.</h3><p>Încearcă din nou peste un minut sau programează direct consultația gratuită.</p></div>'; return; }
      // the zone is known (the page's or the link's) and is at that clinic: it isn't asked again
      if (st.zone) st.zoneFixed = !st.city || zonesOf(st.city).some(function (z) { return z.key === st.zone; });
      if (st.zoneFixed) zoneCity();
      if (st.zone && !st.zoneFixed) st.zone = '';
      show(steps()[0], 0);
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

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-lf]');
    if (!b) return;
    e.preventDefault();
    open(b);
  });
  // from a link: ?lf=1 or #pachet opens it, ?zona= / ?din= preselects the zone, ?oras= the clinic
  var qs = {}; try { new URLSearchParams(location.search).forEach(function (v, k) { qs[k] = v; }); } catch (e) {}
  var linkZone = qs.zona || TOPIC[fold(qs.din || '').replace(/[^a-z-]/g, '')] || '';
  window.C360LF = { open: open, close: close, zone: linkZone, topic: TOPIC, load: load };
  if (qs.lf || /#pachet\b/.test(location.hash)) addEventListener('load', function () { open(null, { zone: linkZone, city: qs.oras || '' }); });
  // the phone dock waits until she has scrolled past the lead filter section (the owner, 21.11): on the card block and on
  // the section the page's own actions are in sight; once the section's bottom has gone up out of view the dock comes,
  // and goes again if she scrolls back above it. Pages without the section keep the kit's own rule.
  var sec = document.querySelector('.lfs-sec');
  if (sec) {
    var hold = function () { document.documentElement.classList.toggle('dock-hold', sec.getBoundingClientRect().bottom > 0); };
    var tk = false; var onS = function () { if (!tk) { tk = true; requestAnimationFrame(function () { tk = false; hold(); }); } };
    addEventListener('scroll', onS, { passive: true }); addEventListener('resize', onS); hold();
  }
  // the offer, ready before she taps (when the page is idle); the buttons that say „de la N lei” get the zone's real lowest price
  (window.requestIdleCallback || function (f) { setTimeout(f, 1500); })(function () {
    load().then(function (d) {
      if (!d) return;
      [].slice.call(document.querySelectorAll('[data-lf-from]')).forEach(function (el) {
        // a zone's key, or * for every zone; data-lf-fmt says how ({n} = the price), else „, de la N lei”
        var z = el.getAttribute('data-lf-from'), min = Infinity;
        CITIES.forEach(function (c) { zonesOf(c).forEach(function (x) { if (z === '*' || x.key === z) Object.keys(x.packs || {}).forEach(function (t) { min = Math.min(min, Number(x.packs[t].price) || Infinity); }); }); });
        if (isFinite(min)) el.textContent = (el.getAttribute('data-lf-fmt') || ', de la {n}').replace('{n}', lei(min));
      });
    });
  });
})();
