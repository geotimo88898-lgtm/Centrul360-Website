/* ============================================================
   Centrul360, the Black Friday shop (the owner, 24-25.11). Every treatment of the price list, one session at -50%, paid online
   by card, until Friday 27.11 23:59:59 in Romania (the same end for everyone). The look: Apple / glass / Tesla / Nike and
   Summitlane; the motion: „Tap. Don't cut. Carry.” (what opens grows from the button that opened it and goes back into it).
   The sums are always the server's (/api/shop); the payment is api/shop.js hold → c360-pay.js kind 'shop'.

   On a page:
     [data-bfs]          the first screen's slider: the middle card in front, its two neighbours smaller, round and round
     [data-bfo]          all the offers: a segmented filter (Cele mai cerute, Corp, Gușă, Față, Epilare), the cards, the laser zones
     [data-pp="<id>"]    a treatment's buy box (zone, sessions, price, „Rezervă oferta”) + [data-pp-hi], [data-pp-pairs]
     [data-shop-ids="a,b,c"]  a content page's own offers: the shop's cards for those products (data-city: only that clinic's)
     [data-tm]           the timer: days, hours, minutes, seconds in equal cells
     [data-cart]         any element: opens the cart (the header's bag has it)

   The API, stable (v2/pp.js and the header use it):
     C360Shop.add({ id, zone, qty }, originEl)  puts it in the cart (qty = sessions 1-10; zone = one of the product's zones,
                                               else its first) and opens „Adăugat în coș” growing from originEl
                                               → Promise<boolean> (false: unknown id, or no catalog)
     C360Shop.open(originEl)                    opens the cart sheet (growing from originEl when given) → Promise
     C360Shop.price(id, zone, qty)              → { amount, full, saved, unit, unitFull, pct, qty, zone, name } at this
                                               moment's prices, or null (no catalog yet, unknown id)
     C360Shop.catalog()                         → Promise<{ terms, products } | null> (pictures from v2/art.json applied)
     C360Shop.count()                           → the lines in the cart
     C360Shop.lines()                           → [{ id, zone, qty }], what is in the cart now (a line per zone)
     document events: 'c360:cart' (detail { n, amount }) when the cart changes; 'c360:shop' when the catalog is here.
   „In the cart” is per zone (Liposonix Abdomen and Liposonix Coapse are two lines); „+ Încă o zonă” in the popup and on a cart
   line adds a zone not in the cart yet. The clinic is one choice everywhere: the offers' filter, ?oras=, the checkout; unknown,
   the checkout asks (nothing preselected); a clinic that does not do a line (EMS, Împachetare, the laser in Arad) offers to
   take it out or to switch.
   Card → treatment page: a View Transition where the browser has it (@view-transition in shop.css and in the shell's
   head). The treatment page names its hero picture `view-transition-name: pic-<product id>`; the
   tapped card's picture takes the same name just before leaving, so the photo carries over; back on the list, the same
   card takes it again (pagereveal). One name per page: the card never keeps it after the transition.
   Kept on this device only: her cart and her clinic (localStorage 'c360-shop3'; the header reads the count from it).
   ============================================================ */
(function () {
  'use strict';
  if (window.C360Shop) return;
  var KEY = 'c360-shop3';
  var BASE = /^\/v2\//.test(location.pathname) ? '/v2/' : '/';
  var OFFERS = BASE + (BASE === '/v2/' ? 'oferte-bf' : 'oferte');
  var END0 = '2026-11-27T21:59:59.000Z'; // the server's end (api/_lib/shop.js BF.end); the timer starts with it, the server's word replaces it
  var ADDR = { 'Timișoara': 'Str. Bucegi 7, Timișoara', Arad: 'Str. Ioan Alexandru 16-18, Arad' };
  var MAPS = { 'Timișoara': 'https://www.google.com/maps/search/?api=1&query=Centrul360%20Strada%20Bucegi%207%20Timisoara', Arad: 'https://www.google.com/maps/search/?api=1&query=Centrul360%20Strada%20Ioan%20Alexandru%2016-18%20Arad' };
  var WD = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'];
  var WDL = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  var MO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  var MOS = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sept.', 'oct.', 'nov.', 'dec.'];
  var NEED = { corp: 'Corp', gusa: 'Gușă', fata: 'Față', epilare: 'Epilare' };
  var FILTERS = [['all', 'Toate'], ['top', 'Cele mai cerute'], ['corp', 'Corp'], ['gusa', 'Gușă'], ['fata', 'Față'], ['epilare', 'Epilare']];
  var FILTER_T = { all: 'Toate tratamentele', top: 'Cele mai cerute', corp: 'Corp', gusa: 'Gușă și contur', fata: 'Față', epilare: 'Epilare laser' };
  var SORTS = [['rec', 'Recomandate'], ['asc', 'Preț crescător'], ['desc', 'Preț descrescător'], ['az', 'Nume, A la Z']];
  var svg = function (d, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var I = {
    bag: svg('<path d="M5.2 8.5h13.6l-.9 10.6a2 2 0 0 1-2 1.9H8.1a2 2 0 0 1-2-1.9z"/><path d="M8.8 10.5V7.2a3.2 3.2 0 0 1 6.4 0v3.3"/>', 1.6),
    check: svg('<path d="M20 6L9 17l-5-5"/>', 2.6),
    x: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
    back: svg('<path d="M15 18l-6-6 6-6"/>'),
    arrow: '<svg class="ar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    chev: svg('<path d="M9 6l6 6-6 6"/>'),
    down: svg('<path d="M6 9l6 6 6-6"/>'),
    minus: svg('<path d="M6 12h12"/>', 2.2),
    plus: svg('<path d="M12 6v12M6 12h12"/>', 2.2),
    trash: svg('<path d="M5 7h14M10 11v6M14 11v6M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/>', 1.8),
    pin: svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>', 1.8),
    cal: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', 1.8),
    spark: svg('<path d="M12 3v3M12 18v3M3 12h3M18 12h3M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1"/>', 1.8),
    tag: svg('<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.3"/>', 1.8),
  };
  // why each pair helps (the owner: „să dea soluții complete”)
  var WHY = {
    'liposonix>ems': 'Grăsimea pleacă, mușchiul de sub ea se tonifiază', 'liposonix>radiofrecventa': 'Strânge pielea după ce scade grăsimea', 'liposonix>cavitatie': 'Lucrează și pe celelalte depozite',
    'cavitatie>ems': 'Mai puțină grăsime, mușchi mai definit', 'cavitatie>radiofrecventa': 'Pielea rămâne fermă', 'cavitatie>liposonix': 'Pentru grăsimea cea mai încăpățânată',
    'ems>liposonix': 'Scapi și de grăsimea de deasupra mușchiului', 'ems>cavitatie': 'Mai puțină grăsime, mușchi mai definit', 'ems>impachetare': 'Detox și drenaj după tonifiere',
    'radiofrecventa>liposonix': 'Și grăsimea care nu pleacă cu sportul', 'radiofrecventa>impachetare': 'Celulita, lucrată din două părți', 'radiofrecventa>hifu-corp': 'Lifting mai profund pe aceeași zonă',
    'hifu-corp>radiofrecventa': 'Fermitate și la suprafață', 'hifu-corp>ems': 'Și mușchiul tonifiat', 'hifu-corp>liposonix': 'Și grăsimea redusă',
    'impachetare>radiofrecventa': 'Fermitate după detox', 'impachetare>cavitatie': 'Și grăsimea localizată',
    'hifu>biolifting': 'Piele mai fermă pe aceeași zonă', 'hifu>masaj-facial': 'Relaxare pentru față și gât',
    'biolifting>hifu': 'Lifting mai profund', 'biolifting>masaj-facial': 'Relaxare pentru față și gât',
    'hifu-full-face>biolifting-full-face': 'Fermitate și la suprafață', 'hifu-full-face>restart': 'Ten luminos imediat',
    'biolifting-full-face>hifu-full-face': 'Lifting mai profund', 'biolifting-full-face>restart': 'Ten luminos imediat',
    'restart>masaj-facial': 'Relaxare și ten odihnit', 'restart>biolifting-full-face': 'Și fermitate', 'restart>hidratare': 'Și hidratare în profunzime',
    'masaj-facial>restart': 'Ten luminos imediat', 'masaj-facial>hidratare': 'Hidratare în profunzime',
    'hidratare>masaj-facial': 'Relaxare și ten odihnit', 'hidratare>restart': 'Ten luminos imediat',
    'antirid>biolifting-full-face': 'Colagen pentru riduri', 'antirid>hifu-full-face': 'Lifting fără operație',
    'redness>hidratare': 'Bariera pielii refăcută', 'redness>masaj-facial': 'Relaxare pentru ten sensibil',
    'sebum-off>microneedling': 'Și urmele de acnee', 'sebum-off>restart': 'Ten luminos imediat',
    'microneedling>hidratare': 'Hidratare după regenerare', 'microneedling>restart': 'Ten luminos imediat',
    'periocular>hidratare': 'Hidratare în profunzime', 'periocular>biolifting-full-face': 'Fermitate pe toată fața',
  };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var lei = function (n) { return Math.round(Number(n) || 0).toLocaleString('ro-RO') + ' lei'; };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var fev = function (n) { try { if (window.C360P) window.C360P.ev(n); } catch (e) { /* the funnel never breaks the shop */ } };
  var px = function (name, data) { try { if (window.fbq && window.C360_CONSENT) window.fbq('track', name, data || {}); } catch (e) { /* no pixel */ } };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var emit = function (name, detail) { try { document.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch (e) { /* old browser */ } };

  var D = null, ART = {}, offset = 0;
  var S = { keep: {}, city: '', cart: [], zone: {}, n: {}, step: 'cart', visit: 'first', date: '', time: '', days: null, hold: null, paid: null };
  // her clinic is hers to choose: a city kept before v2 was the old default (Timișoara), not her choice, so it is not trusted
  try { var kept = JSON.parse(localStorage.getItem(KEY) || 'null'); if (kept) { if (kept.v === 2 && (kept.city === 'Arad' || kept.city === 'Timișoara')) S.city = kept.city; if (Array.isArray(kept.cart)) S.cart = kept.cart.filter(function (l) { return l && l.id; }).slice(0, 12); } } catch (e) { /* private mode */ }
  var qs = new URLSearchParams(location.search);
  if (/^arad$/i.test(qs.get('oras') || '')) S.city = 'Arad'; else if (/^tim/i.test(qs.get('oras') || '')) S.city = 'Timișoara';
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify({ v: 2, city: S.city, cart: S.cart })); } catch (e) { /* private mode */ } };
  if (qs.get('oras')) save();
  // this visit only: the offers' order, the slider's card, where the list was (so back from a treatment lands where she was)
  var ss = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* private mode */ } } };

  // ---- the data
  var byId = function (id) { if (!D) return null; var f = function (p) { return p.id === id; }; return D.products.filter(f)[0] || (D.packs || []).filter(f)[0]; };
  // the price list's packages of a treatment (api/_lib/shop.js: <id>-x<N>, pack N), smallest first
  var packsOf = function (p) { return p ? (D.packs || []).filter(function (k) { return k.base === p.id; }).sort(function (a, b) { return a.pack - b.pack; }) : []; };
  // a package's price for one session
  var perSes = function (p) { return Math.round(p.price / (p.pack || p.ses || 1)); };
  // the problem packages that contain a treatment in the cart (api/_lib/shop.js BUNDLES)
  var bundlesOf = function (p) { return (D.packs || []).filter(function (k) { return k.bundle && k.for.indexOf(p.id) > -1; }); };
  // how many sessions bring the result (the owner, 25.11): [the least, said as, per zone]; HIFU: one is enough (no word)
  var REC = { liposonix: [2, '2', 1], cavitatie: [6, '6', 1], ems: [6, '6-8', 1], radiofrecventa: [6, '6-10', 1], biolifting: [4, '4', 1], 'biolifting-full-face': [4, '4', 0],
    restart: [3, '3-4', 0], hidratare: [3, '3-4', 0], 'sebum-off': [4, '4', 0], microneedling: [3, '3', 0], periocular: [3, '3', 0], antirid: [4, '4', 0], redness: [4, '4', 0], impachetare: [4, '4', 0] };
  var recOf = function (p) { var id = p.base || p.id, r = p.need === 'epilare' ? [6, '6-8', 1] : REC[id.replace(/-toate$/, '')]; return r ? r.concat([+String(r[1]).split('-').pop()]) : null; };
  var inCity = function (q) { var c = cityNow(); return !c || q.cities.indexOf(c) > -1; };
  // „Da, vreau rezultate optime” (the owner, 25.11: „să-mi mai bage doar unul în coș, 2 Liposonix Abdomen, e mai logic”): the
  // line goes up to the recommended sessions of the same treatment (a package line goes back to its sessions)
  function optPlan(x) {
    var r = recOf(x.p);
    if (!r || x.qty * (x.p.pack || 1) >= r[0]) return null;
    var base = x.p.pack ? byId(x.p.base) : x.p;
    return base ? { id: base.id, qty: r[0] } : null;
  }
  function optimal(key) {
    var l = lineByKey(key), p = l && byId(l.id);
    if (!p) return;
    var o = optPlan({ p: p, qty: l.qty || 1, zone: l.zone, key: key });
    if (!o) return;
    if (o.id === l.id) { setQty(key, o.qty, true); if (sheetOn && S.step === 'cart') paneCart(); return; }
    toPack(key, o.id, o.qty);
  }
  var zoneOf = function (p) { return p.zones.length ? (S.zone[p.id] && p.zones.indexOf(S.zone[p.id]) > -1 ? S.zone[p.id] : p.zones[0]) : ''; };
  var nameOf = function (p, zone) { return p.bundle ? p.name + (zone ? ', ' + zone : '') : p.pack && zone ? p.name.replace(' · ', ' ' + zone + ' · ') : p.name + (zone ? ' ' + zone : ''); };
  var keyOf = function (id, zone) { return id + '|' + (zone || ''); };
  var lineOf = function (id, zone) { return S.cart.filter(function (l) { return l.id === id && (l.zone || '') === (zone || ''); })[0]; };
  var lineByKey = function (k) { return S.cart.filter(function (l) { return keyOf(l.id, l.zone) === k; })[0]; };
  // „in the cart” is per zone: Liposonix Abdomen in the cart leaves Liposonix Coapse free to add
  var has = function (p) { return !!lineOf(p.id, zoneOf(p)); };
  var freeZone = function (p) { return p.zones.filter(function (z) { return !lineOf(p.id, z); })[0] || ''; };
  var onlyHtml = function (p, cls) { return p.cities.length === 1 ? '<span class="' + cls + '">Doar ' + esc(p.cities[0]) + '</span>' : ''; };
  var lines = function () { return S.cart.map(function (l) { var p = byId(l.id); return p ? { p: p, zone: l.zone || '', qty: l.qty || 1, key: keyOf(l.id, l.zone) } : null; }).filter(Boolean); };
  // the sessions she can pick (the owner: 1×, 3×, 6×, or 1×, 2×, 3× for HIFU, HIFU Full Face, HIFU corp and Liposonix)
  var sessOf = function (p) { return /^(hifu|hifu-full-face|hifu-corp|liposonix)$/.test(p.id) ? [1, 2, 3] : [1, 3, 6]; };
  var nOf = function (p) { var n = S.n[p.id]; return sessOf(p).indexOf(n) > -1 ? n : 1; };
  var urlOf = function (p) { return BASE + 'tratament-' + (p.need === 'epilare' ? 'epilare' : p.home || p.base || p.id); };
  var artOf = function (p) { return ART[p.id] || (p.base && ART[p.base]) || (p.home && ART[p.home]) || (p.need === 'epilare' && ART.epilare) || null; };
  // „Toate zonele”: a treatment with zones has a twin <id>-toate (one session on every zone, its own price)
  var ALLZ = '__toate', twinOf = function (p) { return p && !p.base ? byId(p.id + '-toate') : null; };
  var picOf = function (p) { var a = artOf(p); return (a && a.img) || p.photo; };
  // a whole photo on black (v2/art.json full, the owner 25.11): its focal point goes on every <img> that shows it
  var fullOf = function (p) { var a = artOf(p); return !!(a && a.img && a.full); };
  var posOf = function (p) { var a = artOf(p); return fullOf(p) && a.pos ? ' style="object-position:' + esc(String(a.pos).replace(/[^0-9% .a-z]/g, '')) + '"' : ''; };
  // where the picture is small, a smaller copy of it (v2/tools/pic-sizes.py: <id>-600.webp, <id>-300.webp, listed in art.json "w";
  // the pictures themselves are 966 wide): the 2-up tiles take the 600 one (the big one only on a screen that needs it), the
  // thumbnails the 300 one. A picture without copies stays as it is.
  var picW = function (p, w) { var a = artOf(p), u = picOf(p); return a && a.img && u === a.img && (a.w || []).indexOf(w) > -1 ? u.replace(/\.webp(\?|$)/, '-' + w + '.webp$1') : u; };
  var tileImg = function (p) { var s = picW(p, 600), u = picOf(p); return 'src="' + esc(s) + '"' + (s !== u ? ' srcset="' + esc(s) + ' 600w, ' + esc(u) + ' 966w" sizes="(max-width:640px) calc(50vw - 31px), 270px"' : ''); };
  var sesWord = function (n) { return n === 1 ? '1 ședință' : n + ' ședințe'; };
  var qOf = function (v) { return clamp(Math.floor(Number(v) || 1), 1, 10); };
  // the clinic: hers (the offers' filter, ?oras=, the checkout: one choice everywhere); with no choice, the one clinic her cart
  // can only be done in; else none, and the checkout asks
  function mustCity() {
    var must = '';
    lines().forEach(function (x) { if (x.p.cities.length === 1) must = x.p.cities[0]; });
    return must;
  }
  function cityNow() { return S.city || mustCity(); }
  // the lines her clinic does not do (EMS, Împachetare, the laser in Arad), and the clinic that does them all
  var clashOf = function () { return S.city ? lines().filter(function (x) { return x.p.cities.indexOf(S.city) < 0; }) : []; };
  var fixCity = function () { return ['Timișoara', 'Arad'].filter(function (c) { return c !== S.city && lines().every(function (x) { return x.p.cities.indexOf(c) > -1; }); })[0] || ''; };
  function setCity(c) {
    if (c !== 'Arad' && c !== 'Timișoara') c = '';
    if (c === S.city) return;
    S.city = c; save();
    // the offers' clinic filter follows (and the other way round, in the filter's own handler)
    var dd = $('[data-dd="city"]');
    if (dd && F.city !== c) { F.city = c; ddSet(dd, c); grid(false); }
  }
  function totals() {
    var l = lines(), full = 0, amount = 0, n = 0;
    l.forEach(function (x) { full += x.p.full * x.qty; amount += x.p.price * x.qty; n += x.qty * (x.p.pack || x.p.ses || 1); });
    return { lines: l, full: full, amount: amount, saved: full - amount, n: n };
  }
  var pct = function () { return D ? D.terms.pct : 50; };

  // a number that changes rolls in softly (only transform and opacity)
  function roll(el, text) {
    if (!el || el.textContent === text) return;
    el.textContent = text;
    if (!reduce && el.animate) el.animate([{ transform: 'translateY(35%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' });
  }

  // ================= the timer: equal cells, each with its unit under it =================
  function parts() {
    var end = Date.parse(D ? D.terms.end : END0), ms = end - (Date.now() + offset);
    if (ms <= 0) return null;
    var s = Math.floor(ms / 1000);
    return [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60];
  }
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  var UNITS = [['zi', 'zile'], ['oră', 'ore'], ['min', 'min'], ['sec', 'sec']];
  function tmHtml(v) {
    var p = parts() || [0, 0, 0, 0];
    return '<div class="tm' + (v ? ' ' + v : '') + '" data-tmx role="timer" aria-label="Timpul rămas până la final"><span class="tm-l">' + (v === 's' ? '<b class="tm-p">-' + pct() + '% </b>se încheie în' : 'Oferta se încheie în') + '</span><span class="tm-c">' +
      UNITS.map(function (u, i) { return '<i><b data-tmv="' + i + '">' + two(p[i]) + '</b><small data-tmu="' + i + '">' + (p[i] === 1 ? u[0] : u[1]) + '</small></i>'; }).join('') + '</span></div>';
  }
  var ended = false;
  function tick() {
    var p = parts();
    $$('[data-tm]').forEach(function (el) { if (!el.hasAttribute('data-tmx')) el.outerHTML = tmHtml(el.getAttribute('data-tm')); });
    $$('[data-tmv]').forEach(function (b) { var i = +b.getAttribute('data-tmv'), t = p ? two(p[i]) : '00'; if (b.textContent !== t) { b.textContent = t; if (!reduce) { b.classList.remove('tk'); void b.offsetWidth; b.classList.add('tk'); } } });
    $$('[data-tmu]').forEach(function (u) { var i = +u.getAttribute('data-tmu'); u.textContent = p && p[i] === 1 ? UNITS[i][0] : UNITS[i][1]; });
    if (D && D.terms.bf && !p && !ended) { ended = true; load(true); }
  }

  // ================= the card: the site's Black Friday card =================
  function sesHtml(p, light) {
    var n = nOf(p), list = sessOf(p);
    return '<div class="ses' + (light ? ' l' : '') + '" role="radiogroup" aria-label="Câte ședințe" style="--n:' + list.length + ';--i:' + Math.max(0, list.indexOf(n)) + '">' +
      list.map(function (k) { return '<button type="button" role="radio" data-n="' + k + '" aria-checked="' + (k === n) + '" aria-label="' + sesWord(k) + '">' + k + '×</button>'; }).join('') + '</div>';
  }
  function ctaHtml(mine) { return mine ? I.check + '<span>În coș</span>' : '<span>Rezervă oferta</span>' + I.arrow; }
  // o.wait: the picture waits (data-src) until the card comes near the front of the slider; o.first: the slider's first picture
  function cardHtml(p, o) {
    var z = zoneOf(p), n = nOf(p), mine = has(p), u = urlOf(p);
    o = o || {};
    return '<article class="slip has-pic bfc' + (mine ? ' in' : '') + '" data-p="' + esc(p.id) + '" data-href="' + u + '" data-w="1">' +
      '<span class="pic' + (fullOf(p) ? ' full' : '') + '" aria-hidden="true"><img ' + (o.wait ? 'data-src' : 'src') + '="' + esc(picOf(p)) + '" alt=""' + (o.first ? ' fetchpriority="high"' : ' decoding="async"') + posOf(p) + '></span>' +
      '<span class="pct">-' + pct() + '%</span>' + onlyHtml(p, 'bfc-c') +
      '<span class="k"><b>Black Friday</b> · ' + esc(NEED[p.need] || '') + '</span>' +
      '<h3><a href="' + u + '">' + esc(nameOf(p, z)) + '</a></h3>' +
      '<ul class="bfc-b">' + p.b.slice(0, 2).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
      sesHtml(p) +
      '<div class="pr"><b data-pr>' + lei(p.price * n) + '</b><s data-full>' + lei(p.full * n) + '</s></div>' +
      '<button type="button" class="btn book gold bfc-cta" data-add>' + ctaHtml(mine) + '</button></article>';
  }
  // a card changes in place (the thumb slides, the price rolls; nothing is drawn again)
  function paintCard(card) {
    var p = byId(card.getAttribute('data-p'));
    if (!p) return;
    var n = nOf(p), mine = has(p), list = sessOf(p), ses = $('.ses', card);
    if (ses) { ses.style.setProperty('--i', Math.max(0, list.indexOf(n))); $$('[data-n]', ses).forEach(function (b) { b.setAttribute('aria-checked', String(+b.getAttribute('data-n') === n)); }); }
    roll($('[data-pr]', card), lei(p.price * n));
    var f = $('[data-full]', card); if (f) f.textContent = lei(p.full * n);
    var a = $('h3 a', card); if (a) a.textContent = nameOf(p, zoneOf(p));
    if (card.classList.contains('in') !== mine) { card.classList.toggle('in', mine); $('[data-add]', card).innerHTML = ctaHtml(mine); }
  }
  function repaint(pid) { $$('.bfc[data-p="' + pid + '"]').forEach(paintCard); ppBuy(); }
  var repaintAll = function () { $$('.bfc[data-p]').forEach(paintCard); ppBuy(); epiList(); };
  // the rim's light runs only on the cards in sight
  var seen = window.IntersectionObserver ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (!e.target.closest('.bfs-st')) e.target.classList.toggle('vis', e.isIntersecting); }); }, { rootMargin: '60px' }) : null;
  var watch = function (root) { if (seen) $$('.bfc', root).forEach(function (c) { seen.observe(c); }); };

  // ================= the slider: the middle card in front, its neighbours smaller; it follows the finger =================
  var SL = { el: null, cards: [], n: 0, pos: 0, step: 200, mid: -1, timer: 0, hold: 0, drag: null, dragged: 0, vis: true, over: false };
  function slider() {
    var box = $('[data-bfs]');
    if (!box || !D || box.hasAttribute('data-on')) return;
    var list = D.terms.show.map(byId).filter(Boolean);
    // her clinic known: only what it does (Arad: no EMS, no laser)
    var here = S.city ? list.filter(function (p) { return p.cities.indexOf(S.city) > -1; }) : list;
    if (here.length >= 3) list = here;
    if (!list.length) return;
    box.setAttribute('data-on', '');
    box.setAttribute('aria-roledescription', 'carusel');
    // only the card in front and its two neighbours show at first: the others' pictures load after the page (speed, 25.11)
    box.innerHTML = '<div class="bfs-st">' + list.map(function (p, k) { return cardHtml(p, { wait: Math.min(k, list.length - k) > 1, first: k === 0 }); }).join('') + '</div><div class="bfs-dots">' +
      list.map(function (p, k) { return '<button type="button" data-dot="' + k + '" aria-label="' + esc(p.name) + '"></button>'; }).join('') + '</div>';
    SL.el = box; SL.cards = $$('.bfs-st > .bfc', box); SL.n = SL.cards.length;
    // back on the page in this visit: the card she left in front is in front again
    var was = ss.get('c360-bfs'), at = list.map(function (p) { return p.id; }).indexOf(was);
    if (at > 0) SL.pos = at;
    measure(); layout(true);
    requestAnimationFrame(function () { box.classList.add('on'); });
    box.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      SL.drag = { x: e.clientX, y: e.clientY, pos: SL.pos, on: false, id: e.pointerId, lx: e.clientX, lt: e.timeStamp, v: 0 };
      pause();
    });
    box.addEventListener('pointermove', function (e) {
      var g = SL.drag;
      if (!g || g.id !== e.pointerId) return;
      var dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.on) {
        if (Math.abs(dx) < 7) return;
        if (Math.abs(dy) > Math.abs(dx)) { SL.drag = null; return; }
        g.on = true; box.classList.add('drag');
        try { box.setPointerCapture(e.pointerId); } catch (x) { /* fine */ }
      }
      var dt = e.timeStamp - g.lt;
      if (dt > 0) g.v = 0.6 * g.v + 0.4 * ((e.clientX - g.lx) / dt);
      g.lx = e.clientX; g.lt = e.timeStamp;
      SL.pos = g.pos - dx / SL.step;
      layout();
    });
    var up = function () {
      var g = SL.drag; SL.drag = null;
      if (!g || !g.on) return;
      box.classList.remove('drag');
      var to = Math.round(SL.pos);
      if (to === Math.round(g.pos) && Math.abs(g.v) > 0.35) to += g.v < 0 ? 1 : -1;
      SL.pos = to; SL.dragged = Date.now();
      layout(); pause();
    };
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    box.addEventListener('mouseenter', function () { SL.over = true; });
    box.addEventListener('mouseleave', function () { SL.over = false; });
    addEventListener('resize', function () { measure(); layout(true); });
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { SL.vis = es[0].isIntersecting; }).observe(box);
    if (!reduce) SL.timer = setInterval(function () { if (document.hidden || !SL.vis || SL.over || SL.drag || sheetOn || pop || Date.now() < SL.hold) return; SL.pos += 1; layout(); }, 5200);
    afterLoad(function () { SL.cards.forEach(warm); });
  }
  // a waiting picture starts loading (it comes near the front, or the page has loaded)
  function warm(c) { var i = $('img[data-src]', c); if (i) { i.src = i.getAttribute('data-src'); i.removeAttribute('data-src'); } }
  function afterLoad(fn) { var go = function () { setTimeout(fn, 400); }; if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true }); }
  function measure() {
    var c = SL.cards[0];
    if (!c) return;
    var w = c.offsetWidth, W = innerWidth;
    SL.step = W >= 1024 ? w * 0.58 : W >= 641 ? w * 0.86 : w * 0.8;
    SL.k = W >= 1024 ? 0.1 : 0.14;
  }
  function pose(d) {
    var a = Math.abs(d), s = d < 0 ? -1 : 1;
    var x = s * (Math.min(a, 1) * SL.step + Math.max(a - 1, 0) * SL.step * 0.62);
    var sc = 1 - Math.min(a, 1) * SL.k - Math.max(a - 1, 0) * 0.08;
    var op = a <= 1 ? 1 - a * 0.42 : Math.max(0, 0.58 - (a - 1) * 0.58);
    return { t: 'translate3d(' + x.toFixed(1) + 'px,0,0) scale(' + sc.toFixed(4) + ')', o: op.toFixed(3), z: String(20 - Math.round(a * 4)) };
  }
  function layout(instant) {
    if (!SL.n) return;
    var mid = ((Math.round(SL.pos) % SL.n) + SL.n) % SL.n;
    SL.cards.forEach(function (c, k) {
      var d = k - SL.pos;
      d = ((d % SL.n) + SL.n) % SL.n;
      if (d > SL.n / 2) d -= SL.n;
      var P = pose(d);
      if (instant) c.style.transition = 'none';
      c.style.transform = P.t; c.style.opacity = P.o; c.style.zIndex = P.z;
      c.style.visibility = Math.abs(d) > 2.4 ? 'hidden' : '';
      if (Math.abs(d) < 2) warm(c);
      if (instant) { void c.offsetWidth; c.style.transition = ''; }
    });
    if (mid !== SL.mid) {
      SL.mid = mid;
      SL.cards.forEach(function (c, k) {
        var on = k === mid;
        c.classList.toggle('mid', on); c.classList.toggle('vis', on);
        c.setAttribute('aria-hidden', String(!on));
        $$('a, button', c).forEach(function (b) { if (on) b.removeAttribute('tabindex'); else b.setAttribute('tabindex', '-1'); });
      });
      $$('[data-dot]', SL.el).forEach(function (b, k) { b.setAttribute('aria-current', String(k === mid)); });
      ss.set('c360-bfs', SL.cards[mid].getAttribute('data-p'));
    }
  }
  var pause = function () { SL.hold = Date.now() + 9000; };
  function sliderTo(k) {
    var d = k - SL.pos; d = ((d % SL.n) + SL.n) % SL.n; if (d > SL.n / 2) d -= SL.n;
    SL.pos = Math.round(SL.pos + d); layout(); pause();
  }

  // ================= a content page's offers (Grăsime localizată, Celulită...): the shop's own cards, the same as everywhere =================
  function needGrids() {
    if (!D) return;
    $$('[data-shop-ids]').forEach(function (box) {
      if (box.hasAttribute('data-on')) return;
      var city = box.getAttribute('data-city') || '';
      var list = box.getAttribute('data-shop-ids').split(',').map(function (x) { return byId(x.trim()); })
        .filter(function (p) { return p && (!city || p.cities.indexOf(city) > -1); }).slice(0, 3);
      if (!list.length) return;
      box.setAttribute('data-on', '');
      box.innerHTML = '<div class="shop-ng">' + list.map(cardHtml).join('') + '</div>' +
        '<a class="shop-ng-all" href="' + OFFERS + '">Vezi toate ofertele -' + pct() + '%' + I.arrow + '</a>';
      watch(box);
    });
  }

  // ================= all the offers: a segmented filter, the cards; the laser zones as a clean list =================
  var F = { k: 'all', sort: 'rec', city: '' }, EPI = { g: 'f' };
  var NEED_ORDER = ['corp', 'gusa', 'fata', 'epilare'];
  // the most common problems (the owner, 25.11: „la alte oferte cele mai comune probleme, ca să avem add to cart mare”):
  // [the problem, in her words; the treatment that answers it; its zone]
  var COMMON = [['Gușă, bărbie dublă', 'hifu', 'Gușă'], ['Burtică', 'liposonix', 'Abdomen'], ['Celulită', 'radiofrecventa', 'Coapse'], ['Riduri pe față', 'biolifting-full-face', ''],
    ['Ten obosit, fără strălucire', 'restart', ''], ['Brațe lăsate', 'hifu-corp', 'Brațe'], ['Păr nedorit', 'epilare-axile', ''], ['Roșeață, piele sensibilă', 'redness', '']];
  var CHEV_D = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  function offers() {
    var el = $('[data-bfo]');
    if (!el || !D) return;
    var h = (location.hash || '').slice(1);
    if (FILTERS.some(function (f) { return f[0] === h; })) F.k = h;
    // the clinic is hers (kept, or ?oras=); the order is kept for this visit (back from a treatment, it is as she left it)
    F.city = S.city;
    var so = ss.get('c360-bfo-sort'); if (SORTS.some(function (s) { return s[0] === so; })) F.sort = so;
    el.innerHTML = '<div class="bfo-f"><div class="bfo-cats" role="tablist" aria-label="Categorie">' +
      FILTERS.map(function (f) { return '<button type="button" role="tab" data-f="' + f[0] + '" aria-selected="' + (f[0] === F.k) + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      '<div class="bfo-tools">' +
      ddHtml('city', 'Clinica', CITIES_F, F.city, 'l') + ddHtml('sort', 'Sortează', SORTS, F.sort, 'r') +
      '</div></div>' +
      '<div class="bfo-head"><h2 data-fh></h2><span data-fn></span></div><div class="bfo-g tiles" data-grid></div>';
    el.style.minHeight = '';
    grid(false);
    // back from a treatment (not from the browser's page cache): where she was in the list
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0], y = +ss.get('c360-bfo-y') || 0;
    if (nav && nav.type === 'back_forward' && y > 0) requestAnimationFrame(function () { scrollTo(0, y); });
  }
  addEventListener('pagehide', function () { if ($('[data-grid]')) ss.set('c360-bfo-y', String(Math.round(scrollY))); });
  function ddSet(dd, v) {
    var o = $$('[data-ddo]', dd).filter(function (x) { return x.getAttribute('data-ddo') === v; })[0];
    if (!o) return;
    $$('[data-ddo]', dd).forEach(function (x) { x.setAttribute('aria-selected', String(x === o)); });
    $('[data-ddv]', dd).textContent = $('span', o).textContent;
    $('.bfo-ddb', dd).setAttribute('aria-label', (dd.getAttribute('data-dd') === 'sort' ? 'Sortează' : 'Clinica') + ': ' + $('span', o).textContent);
  }
  var CITIES_F = [['', 'Ambele clinici'], ['Timișoara', 'Timișoara'], ['Arad', 'Arad']];
  function ddHtml(key, label, opts, val, side) {
    var cur = opts.filter(function (o) { return o[0] === val; })[0] || opts[0];
    return '<div class="bfo-dd ' + side + '" data-dd="' + key + '"><button type="button" class="bfo-ddb" aria-haspopup="listbox" aria-expanded="false" aria-label="' + label + ': ' + esc(cur[1]) + '">' +
      '<span data-ddv>' + esc(cur[1]) + '</span>' + CHEV_D + '</button><div class="bfo-ddm" role="listbox" aria-label="' + label + '">' +
      opts.map(function (o) { return '<button type="button" role="option" data-ddo="' + esc(o[0]) + '" aria-selected="' + (o[0] === cur[0]) + '">' + I.check + '<span>' + esc(o[1]) + '</span></button>'; }).join('') + '</div></div>';
  }
  function ddClose(except) { $$('.bfo-dd.open').forEach(function (d) { if (d === except) return; d.classList.remove('open'); $('.bfo-ddb', d).setAttribute('aria-expanded', 'false'); }); }
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t.closest) return;
    var b = t.closest('.bfo-ddb');
    if (b) { var d = b.closest('.bfo-dd'), on = !d.classList.contains('open'); ddClose(d); d.classList.toggle('open', on); b.setAttribute('aria-expanded', String(on)); return; }
    var o = t.closest('[data-ddo]');
    if (o) {
      var dd = o.closest('.bfo-dd'), key = dd.getAttribute('data-dd'), v = o.getAttribute('data-ddo');
      // the clinic picked here is the checkout's clinic too
      if (key === 'sort') { F.sort = v; ss.set('c360-bfo-sort', v); } else { F.city = v; S.city = v; save(); }
      ddSet(dd, v);
      ddClose(); grid(true); return;
    }
    if (!t.closest('.bfo-dd')) ddClose();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') ddClose(); });
  function listFor(k) {
    var list;
    if (k === 'top') list = D.terms.show.map(byId).filter(Boolean);
    else list = D.products.filter(function (p) { return !p.allOf && (k === 'all' || p.need === k) && (p.need !== 'epilare' || p.id === 'epilare-full-body'); });
    if (F.city) list = list.filter(function (p) { return p.cities.indexOf(F.city) > -1; });
    var rank = function (p) { var i = D.terms.show.indexOf(p.id); return i > -1 ? i : 100 + NEED_ORDER.indexOf(p.need) * 50 + D.products.indexOf(p) / 100; };
    var cmp = { rec: function (x, y) { return rank(x) - rank(y); }, asc: function (x, y) { return x.price - y.price; }, desc: function (x, y) { return y.price - x.price; },
      az: function (x, y) { return x.name.localeCompare(y.name, 'ro'); } }[F.sort] || null;
    return cmp && (k !== 'top' || F.sort !== 'rec') ? list.slice().sort(cmp) : list;
  }
  // a small product card for the grid: the picture, -50%, the name, the price, „Rezervă oferta”; a tap on it opens the treatment.
  // The first row's pictures load at once (the first one first), the others when they come near.
  function tileHtml(p, k) {
    var z = zoneOf(p), n = nOf(p), mine = has(p), u = urlOf(p);
    return '<article class="bfc bft' + (mine ? ' in' : '') + '" data-p="' + esc(p.id) + '" data-href="' + u + '" data-w="1">' +
      '<span class="pic" aria-hidden="true"><img ' + tileImg(p) + ' alt=""' + (k === 0 ? ' fetchpriority="high"' : k < 4 ? '' : ' loading="lazy"') + ' decoding="async"' + posOf(p) + '></span>' +
      '<span class="pct">-' + pct() + '%</span>' + onlyHtml(p, 'bft-c') +
      '<div class="bft-b"><h3><a href="' + u + '">' + esc(nameOf(p, z)) + '</a></h3>' +
      '<div class="pr"><b data-pr>' + lei(p.price * n) + '</b><s data-full>' + lei(p.full * n) + '</s></div>' +
      '<button type="button" class="btn book gold bfc-cta" data-add>' + ctaHtml(mine) + '</button></div></article>';
  }
  function grid(anim) {
    var g = $('[data-grid]');
    if (!g) return;
    var list = listFor(F.k), epi = F.k === 'epilare' && F.city !== 'Arad';
    var zones = epi ? D.products.filter(function (p) { return p.need === 'epilare' && p.id !== 'epilare-full-body'; }).length : 0;
    $('[data-fh]').textContent = FILTER_T[F.k];
    $('[data-fn]').textContent = list.length + (list.length === 1 ? ' tratament' : ' tratamente') + (epi ? ' + ' + zones + ' zone' : '');
    g.innerHTML = (list.length ? list.map(tileHtml).join('') : '<p class="bfo-none">Nu e niciun tratament aici' + (F.city ? ' în ' + esc(F.city) : '') + '.</p>') +
      (epi ? '<div class="epi"><div class="epi-h"><b>Pe zone</b><div class="seg" role="radiogroup" aria-label="Pentru"><i class="sg-i" aria-hidden="true"></i><button type="button" role="radio" data-g="f" aria-checked="' + (EPI.g === 'f') + '">Femei</button><button type="button" role="radio" data-g="m" aria-checked="' + (EPI.g === 'm') + '">Bărbați</button></div></div><ul data-epi aria-label="' + zones + ' zone"></ul>' +
      '<a class="epi-more" href="' + BASE + 'tratament-epilare">Tot despre epilarea laser' + I.chev + '</a></div>' : '');
    if (anim && !reduce) $$('.bfc, .epi', g).forEach(function (c, k) { c.style.setProperty('--k', Math.min(k, 8)); c.classList.add('enter'); c.addEventListener('animationend', function () { c.classList.remove('enter'); }, { once: true }); });
    watch(g); epiList(); thumbAll(); smooth(g);
  }
  // the scroll (the owner, 25.11: „uniform și scroll experience nice”): a picture fades in when it arrives (no pop), and the
  // cards under the first screen rise gently into view, once, a row at a time (the first screen shows at once)
  function smooth(g) {
    $$('.bft .pic img', g).forEach(function (im) {
      if (im.complete && im.naturalWidth) return;
      im.classList.add('ld');
      var done = function () { im.classList.toggle('ld', false); };
      im.addEventListener('load', done, { once: true }); im.addEventListener('error', done, { once: true });
    });
    if (reduce || !('IntersectionObserver' in window)) return;
    var cols = (getComputedStyle(g).gridTemplateColumns || '').split(' ').length || 2, vh = innerHeight;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var c = e.target; io.unobserve(c);
        c.classList.add('up');
        setTimeout(function () { c.classList.toggle('rise', false); c.classList.toggle('up', false); }, 1100);
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    $$('.bft', g).forEach(function (c, k) {
      if (c.getBoundingClientRect().top < vh) return;
      c.style.setProperty('--c', k % cols); c.classList.add('rise'); io.observe(c);
    });
  }
  function epiList() {
    var ul = $('[data-epi]');
    if (!ul || !D) return;
    var men = EPI.g === 'm';
    var list = D.products.filter(function (p) { return p.need === 'epilare' && p.id !== 'epilare-full-body' && /bărbați$/.test(p.name) === men; });
    ul.innerHTML = list.map(function (p) {
      var on = has(p);
      return '<li><a href="' + urlOf(p) + '">' + esc(p.name.replace(/^Epilare /, '').replace(/ bărbați$/, '')) + '</a><span class="pz"><s>' + lei(p.full) + '</s><b>' + lei(p.price) + '</b></span>' +
        '<button type="button" class="sh-plus' + (on ? ' in' : '') + '" data-plus="' + esc(p.id) + '" aria-label="' + (on ? 'În coș, scoate' : 'Adaugă ' + esc(p.name)) + '">' + (on ? I.check : I.plus) + '</button></li>';
    }).join('');
  }
  // the light segmented controls: the white thumb sits under the chosen part, and slides to the next one
  function thumb(seg, still) {
    var b = $('[aria-selected="true"], [aria-checked="true"]', seg), i = $('.sg-i', seg);
    if (!b || !i) return;
    if (still) seg.classList.add('still');
    i.style.width = b.offsetWidth + 'px';
    i.style.transform = 'translateX(' + b.offsetLeft + 'px)';
    if (still) { void i.offsetWidth; seg.classList.remove('still'); }
  }
  var thumbAll = function () { $$('.seg').forEach(function (s) { thumb(s, true); }); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(thumbAll);
  addEventListener('resize', thumbAll);

  // ================= a treatment's page: the buy box and what goes well with it =================
  function ppBuy() {
    var box = $('[data-pp]');
    if (!box || !D) return;
    var p = byId(box.getAttribute('data-pp'));
    if (!p) return;
    var z = zoneOf(p), n = nOf(p), mine = has(p);
    box.innerHTML = (p.zones.length ? '<p class="pp-l">Zona</p><div class="seg d wr" role="radiogroup" aria-label="Zona">' + p.zones.map(function (x) { return '<button type="button" role="radio" data-ppz="' + esc(x) + '" aria-checked="' + (x === z) + '">' + esc(x) + '</button>'; }).join('') + '</div>' : '') +
      '<p class="pp-l">Ședințe</p>' + sesHtml(p) +
      '<div class="pp-pr"><b>' + lei(p.price * n) + '</b><s>' + lei(p.full * n) + '</s><span>' + (n > 1 ? lei(p.price) + ' / ședință' : '') + '</span></div>' +
      '<p class="pp-save">Economisești ' + lei((p.full - p.price) * n) + '</p>' +
      '<button type="button" class="btn book gold pp-cta" data-ppadd>' + (mine ? I.check + ' În coș, finalizează' : 'Rezervă oferta' + I.arrow) + '</button>' +
      '<ul class="pp-trust"><li>Plată securizată cu cardul</li><li>Alegi ora după, confirmare pe WhatsApp</li><li>' + (p.cities.length === 1 ? 'Doar în ' + esc(p.cities[0]) : 'Timișoara și Arad') + '</li></ul>';
    var hi = $('[data-pp-hi]');
    if (hi && !hi.childElementCount) hi.innerHTML = p.b.slice(0, 2).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '<li>' + p.minutes + ' min / ședință</li>';
    var pr = $('[data-pp-pairs]');
    if (pr) pr.innerHTML = p.pairs.map(byId).filter(Boolean).map(function (q) { return pairHtml(p, q, true); }).join('');
    ppSticky(p, n, mine);
  }
  // the treatment page's buy bar (phone): appears when the buy box is out of sight
  var ppBar = null;
  function ppSticky(p, n, mine) {
    if (!ppBar) {
      ppBar = document.createElement('div'); ppBar.className = 'pp-bar';
      document.body.appendChild(ppBar);
      var box = $('[data-pp]');
      if (window.IntersectionObserver && box) new IntersectionObserver(function (es) { es.forEach(function (e) { var on = !e.isIntersecting && e.boundingClientRect.top < 0; ppBar.classList.toggle('on', on); document.body.classList.toggle('pp-bar-on', on); }); }).observe(box);
    }
    ppBar.innerHTML = '<div><b>' + esc(nameOf(p, zoneOf(p))) + '</b><span><s>' + lei(p.full * n) + '</s> ' + lei(p.price * n) + '</span></div><button type="button" class="btn book gold" data-ppadd>' + (mine ? 'Finalizează' : 'Rezervă') + I.arrow + '</button>';
  }
  function pairHtml(from, q, dark) {
    var z = q.zones.indexOf(zoneOf(from)) > -1 ? zoneOf(from) : zoneOf(q), on = !!lineOf(q.id, z);
    return '<div class="pair' + (dark ? ' d' : '') + '" data-href="' + urlOf(q) + '"><span class="th"><img src="' + esc(picW(q, 300)) + '" alt="" decoding="async"' + posOf(q) + '></span>' +
      '<div><a href="' + urlOf(q) + '"><b>' + esc(nameOf(q, z)) + '</b></a><small>' + esc(WHY[from.id + '>' + q.id] || 'Se completează bine') + '</small><span class="pz"><s>' + lei(q.full) + '</s> <b>' + lei(q.price) + '</b></span></div>' +
      '<button type="button" class="sh-plus' + (on ? ' in' : '') + '" data-plus="' + esc(q.id) + '" data-pz="' + esc(z) + '" aria-label="' + (on ? 'În coș' : 'Adaugă') + '">' + (on ? I.check : I.plus) + '</button></div>';

  }

  // ================= the cart =================
  function changed(bump) {
    save(); headCart(bump); bar(bump);
    var t = totals(); emit('c360:cart', { n: S.cart.length, amount: t.amount });
  }
  function add(id, zone, qty) {
    var p = byId(id);
    if (!p) return;
    var had = lineOf(id, zone), q = qOf(qty || (had && had.qty));
    if (had) had.qty = q; else S.cart.push({ id: id, zone: zone || '', qty: q });
    fev('cart');
    px('AddToCart', { value: p.price * q, currency: 'RON', content_ids: [id], content_type: 'product', content_name: nameOf(p, zone) });
    changed(true); repaint(id); epiList();
    if (sheetOn && S.step === 'cart') paneCart();
  }
  function setQty(key, d, abs) {
    var l = lineByKey(key);
    if (!l) return;
    l.qty = abs ? qOf(d) : clamp((l.qty || 1) + d, 0, 10);
    if (!l.qty) S.cart = S.cart.filter(function (x) { return x !== l; });
    var p = byId(l.id); if (p && sessOf(p).indexOf(l.qty) > -1) S.n[l.id] = l.qty;
    changed(); repaint(l.id); epiList();
  }
  function setZone(key, zone) {
    var l = lineByKey(key);
    if (!l || l.zone === zone) return;
    var other = lineOf(l.id, zone);
    if (other) { other.qty = qOf((other.qty || 1) + (l.qty || 1)); S.cart = S.cart.filter(function (x) { return x !== l; }); } else l.zone = zone;
    S.zone[l.id] = zone;
    changed(); repaint(l.id);
  }
  function headCart(bump) {
    var n = S.cart.length;
    $$('.hx-cart').forEach(function (b) {
      b.classList.toggle('has', n > 0);
      var i = $('i', b); if (i) i.textContent = n || '';
      b.setAttribute('aria-label', n ? 'Coșul tău, ' + n + (n === 1 ? ' tratament' : ' tratamente') : 'Coșul tău');
      if (bump && n && !reduce) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    });
  }
  function bar(bump) {
    var b = $('.sh-bar');
    if (!b) {
      b = document.createElement('div');
      b.className = 'sh-bar';
      b.innerHTML = '<button type="button" data-cart><span class="ct">' + I.bag + '<i></i></span><span class="tx"><small></small><b></b></span><span class="cta">Finalizează' + I.arrow + '</span></button>';
      document.body.appendChild(b);
    }
    var t = totals();
    // with something in the cart it stays, also on the content pages (above their consultation dock: shop.css); a treatment
    // page's own buy bar takes its place on the phone (pp.css)
    b.classList.toggle('on', t.lines.length > 0 && !sheetOn && !pop);
    $('.ct i', b).textContent = t.lines.length;
    $('.tx small', b).textContent = t.lines.length === 1 ? nameOf(t.lines[0].p, t.lines[0].zone) : t.lines.length + ' tratamente';
    $('.tx b', b).innerHTML = lei(t.amount) + (t.saved > 0 ? '<s>' + lei(t.full) + '</s>' : '');
    if (bump && !reduce) { b.classList.remove('sh-bump'); void b.offsetWidth; b.classList.add('sh-bump'); }
  }

  // ================= motion: a surface grows from the button that opened it, and goes back into it =================
  function rectOf(el) {
    if (!el || !el.isConnected) return null;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null;
    return r;
  }
  function fromBg(el) {
    try { var cs = getComputedStyle(el); if (cs.backgroundImage && cs.backgroundImage !== 'none') return cs.backgroundImage; if (!/rgba\(.*,\s*0\)$|transparent/.test(cs.backgroundColor)) return cs.backgroundColor; } catch (e) { /* none */ }
    return '#fff';
  }
  function morphAt(box, r) {
    var q = box.getBoundingClientRect();
    var w = Math.min(r.width, q.width), h = Math.min(r.height, q.height);
    var ox = r.left + (r.width - w) / 2, oy = r.top + (r.height - h) / 2;
    var cx = clamp(ox - q.left, 0, q.width - w), cy = clamp(oy - q.top, 0, q.height - h);
    var f = function (v) { return v.toFixed(1) + 'px'; };
    return { t: 'translate(' + f(ox - q.left - cx) + ',' + f(oy - q.top - cy) + ')', c: 'inset(' + f(cy) + ' ' + f(q.width - cx - w) + ' ' + f(q.height - cy - h) + ' ' + f(cx) + ' round ' + f(Math.min(w, h) / 2) + ')' };
  }
  var setClip = function (el, v) { el.style.clipPath = v; el.style.webkitClipPath = v; };
  function growIn(box, origin, rad) {
    var r = reduce ? null : rectOf(origin);
    clearTimeout(box._t);
    box.classList.remove('closing', 'slide', 'in');
    if (!r) { box.classList.add('slide', 'on'); void box.offsetWidth; box.classList.add('in'); return; }
    box.style.setProperty('--from', fromBg(origin));
    box.style.transition = 'none';
    box.style.transform = 'none'; setClip(box, 'none');
    box.classList.add('on', 'from');
    var m = morphAt(box, r);
    box.style.transform = m.t; setClip(box, m.c);
    void box.offsetWidth;
    box.style.transition = '';
    box.style.transform = 'translate(0px,0px)'; setClip(box, 'inset(0px 0px 0px 0px round ' + rad + ')');
    requestAnimationFrame(function () { box.classList.remove('from'); });
    box._t = setTimeout(function () { box.style.transition = 'none'; box.style.transform = ''; setClip(box, ''); void box.offsetWidth; box.style.transition = ''; }, 760);
  }
  function growOut(box, origin, rad, done) {
    var r = reduce ? null : rectOf(origin);
    clearTimeout(box._t);
    var end = function () { box.classList.remove('on', 'closing', 'from', 'slide', 'in'); box.style.transition = 'none'; box.style.transform = ''; setClip(box, ''); void box.offsetWidth; box.style.transition = ''; if (done) done(); };
    if (!r) {
      if (!box.classList.contains('slide')) { box.style.transition = 'none'; box.classList.add('slide', 'in'); void box.offsetWidth; box.style.transition = ''; }
      box.classList.remove('in');
      box._t = setTimeout(end, reduce ? 0 : 560);
      return;
    }
    box.style.setProperty('--from', fromBg(origin));
    box.classList.remove('slide', 'in');
    box.style.transition = 'none';
    box.style.transform = 'none'; setClip(box, 'inset(0px 0px 0px 0px round ' + rad + ')');
    var m = morphAt(box, r);
    void box.offsetWidth;
    box.style.transition = '';
    box.classList.add('closing');
    box.style.transform = m.t; setClip(box, m.c);
    box._t = setTimeout(end, 640);
  }

  // ================= „Adăugat în coș”: the zone, the sessions, then finish or add more =================
  var pop = null, veil = null;
  function needVeil() {
    if (!veil) {
      veil = document.createElement('div'); veil.className = 'sh-veil';
      document.body.appendChild(veil);
      veil.addEventListener('click', function () { if (pop) closePop(); else closeSheet(); });
    }
    return veil;
  }
  // the zone chips of a line: its own zone is checked; a zone already in the cart on another line is shown as such and cannot be
  // picked (two lines never merge by surprise); „+ Încă o zonă” adds a new line with a zone not yet in the cart
  function zoneChips(p, zone, attr, k) {
    return p.zones.map(function (x) {
      var other = x !== zone && !!lineOf(p.id, x);
      return '<button type="button" role="radio" ' + attr + '="' + esc(x) + '"' + (k ? ' data-k="' + esc(k) + '"' : '') + ' aria-checked="' + (x === zone) + '"' + (other ? ' disabled class="tk" aria-label="' + esc(x) + ', deja în coș"' : '') + '>' + I.check + esc(x) + '</button>';
    }).join('');
  }
  // the other ways to take a treatment with zones (the owner, 25.11): „Toate zonele” (its twin <id>-toate) and, on the face,
  // „Full Face” (HIFU Full Face, BioLifting Full Face); in the zone chooser only, not as cards of their own
  var FULLF = { hifu: 'hifu-full-face', biolifting: 'biolifting-full-face' };
  function altsOf(bp) {
    var l = [], tw = twinOf(bp), f = FULLF[bp.id] && byId(FULLF[bp.id]);
    if (tw) l.push({ id: tw.id, label: 'Full Body' });
    if (f) l.push({ id: f.id, label: 'Full Face' });
    return l;
  }
  // the treatment with zones behind „Toate zonele” or „Full Face” (null for any other)
  function altBase(p) {
    if (!p) return null;
    if (p.allOf) return byId(p.base);
    for (var k in FULLF) if (FULLF[k] === p.id) return byId(k);
    return null;
  }
  // the popover's zone chooser: her other zones of this treatment as rows, then the zone (the chips left), then „+ Încă o zonă”
  function popZones(p, zone) {
    var ab = altBase(p), bp = ab || p;
    if (!bp || !bp.zones.length) return '';
    var mine = ab ? [] : lines().filter(function (x) { return x.p.id === bp.id && x.zone !== zone; });
    var free = bp.zones.filter(function (z) { return ab || z === zone || !lineOf(bp.id, z); });
    var alts = mine.length ? [] : altsOf(bp);
    return (mine.length ? '<p class="sp-l">Zonele tale</p><div class="sp-zl">' + mine.map(function (x) {
        return '<div class="sp-zr">' + I.check + '<b>' + esc(x.zone) + '</b><small>' + (x.qty === 1 ? '1 ședință' : x.qty + ' ședințe') + '</small>' +
          '<button type="button" class="sh-ic" data-pzrm="' + esc(x.zone) + '" aria-label="Scoate ' + esc(x.zone) + '">' + I.x + '</button></div>';
      }).join('') + '</div>' : '') +
      '<p class="sp-l">' + (mine.length ? 'Zona ' + (mine.length + 1) : 'Alege zona') + '</p><div class="sh-chips" role="radiogroup" aria-label="Zona">' +
      free.map(function (z) { var on = !ab && z === zone; return '<button type="button" role="radio" data-pzone="' + esc(z) + '" aria-checked="' + on + '">' + I.check + esc(z) + '</button>'; }).join('') +
      alts.map(function (o) { return '<button type="button" role="radio" data-palt="' + esc(o.id) + '" aria-checked="' + (o.id === p.id) + '" class="all">' + I.check + esc(o.label) + '</button>'; }).join('') + '</div>' +
      (ab ? '' : '<button type="button" class="sh-addz" data-pzadd' + (freeZone(bp) ? '' : ' hidden') + '>' + I.plus + 'Încă o zonă</button>');
  }
  // the popover's head: the treatment with all her zones of it, and what they cost together
  function popHead(p, zone) {
    var ab = altBase(p), tl = ab ? [] : lines().filter(function (x) { return x.p.id === p.id; });
    if (tl.length < 2) { var l = lineOf(p.id, zone), q = l ? l.qty : 1; return { n: nameOf(p, zone), pr: p.price * q, f: p.full * q }; }
    return { n: p.name + ' ' + tl.map(function (x) { return x.zone; }).join(' + '), pr: tl.reduce(function (s, x) { return s + x.p.price * x.qty; }, 0), f: tl.reduce(function (s, x) { return s + x.p.full * x.qty; }, 0) };
  }
  function popHtml(p, zone, qty) {
    return '<div class="sp-in">' +
      '<div class="sp-h"><span class="sp-ok">' + I.check + '</span><b>Adăugat în coș</b><button type="button" class="sh-ic" data-pop-x aria-label="Închide">' + I.x + '</button></div>' +
      '<div class="sp-it"><span class="th"><img src="' + esc(picW(p, 300)) + '" alt=""' + posOf(p) + '></span><div><b data-sp-n>' + esc(popHead(p, zone).n) + '</b><small>Black Friday -' + pct() + '% · ' + p.minutes + ' min</small>' + onlyHtml(p, 'sp-c') + '</div>' +
      '<div class="pz"><b data-sp-p>' + lei(popHead(p, zone).pr) + '</b><s data-sp-f>' + lei(popHead(p, zone).f) + '</s></div></div>' +
      '<div data-sp-zones>' + popZones(p, zone) + '</div>' +
      '<div class="sp-row"><span>Ședințe<small data-sp-u>' + popUnit(p, zone, qty) + '</small></span>' + stepHtml('pop', qty, 1) + '</div>' +
      // the next step is the clinic and the hour (the cart stays one tap back, with what goes well with it)
      '<button type="button" class="sh-go" data-checkout>Finalizează rezervarea' + I.arrow + '</button>' +
      '<button type="button" class="sh-more" data-pop-x>Mai adaug și altele</button></div>';
  }
  function stepHtml(key, qty, min) {
    return '<div class="sh-step" role="group" aria-label="Ședințe"><button type="button" data-q="-1" data-k="' + esc(key) + '" data-ico="' + (qty <= 1 && !min ? 't' : 'm') + '" aria-label="' + (qty <= 1 && !min ? 'Scoate din coș' : 'O ședință mai puțin') + '"' + (qty <= 1 && min ? ' disabled' : '') + '>' + (qty <= 1 && !min ? I.trash : I.minus) + '</button>' +
      '<output aria-live="polite">' + qty + '</output><button type="button" data-q="1" data-k="' + esc(key) + '" aria-label="Încă o ședință"' + (qty >= 10 ? ' disabled' : '') + '>' + I.plus + '</button></div>';
  }
  function stepPaint(st, qty, min) {
    if (!st) return;
    var m = $('[data-q="-1"]', st), pl = $('[data-q="1"]', st), out = $('output', st), bin = qty <= 1 && !min;
    roll(out, String(qty));
    if (m) { m.disabled = qty <= 1 && !!min; m.setAttribute('aria-label', bin ? 'Scoate din coș' : 'O ședință mai puțin'); if (m.getAttribute('data-ico') !== (bin ? 't' : 'm')) { m.setAttribute('data-ico', bin ? 't' : 'm'); m.innerHTML = bin ? I.trash : I.minus; } }
    if (pl) pl.disabled = qty >= 10;
  }
  function openPop(id, zone, from) {
    var p = byId(id);
    if (!p) return;
    if (pop) { pop.el.remove(); pop = null; }
    needVeil();
    var l = lineOf(id, zone), el = document.createElement('div');
    el.className = 'sh-pop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Adăugat în coș');
    el.innerHTML = popHtml(p, zone, l ? l.qty : 1);
    document.body.appendChild(el);
    pop = { el: el, id: id, zone: zone, from: from };
    // on a wide screen it stands next to its button; on the phone it sits at the bottom, in reach of the thumb
    var r = rectOf(from);
    if (r && innerWidth >= 700) {
      el.classList.add('anchored');
      var h = el.offsetHeight, w = el.offsetWidth;
      var top = r.top - h - 14 > 12 ? r.top - h - 14 : clamp(r.bottom + 14, 12, innerHeight - h - 12);
      el.style.left = clamp(r.left + r.width / 2 - w / 2, 12, innerWidth - w - 12) + 'px';
      el.style.top = top + 'px';
    }
    bar();
    veil.classList.add('on');
    growIn(el, from, '30px');
    setTimeout(function () { var b = $('[data-checkout]', el); if (b && pop && pop.el === el) try { b.focus({ preventScroll: true }); } catch (e) { /* old browser */ } }, 420);
  }
  // the sessions' line: for which zone, when she has more of them
  function popUnit(p, zone, q) {
    var more = !altBase(p) && zone && lines().some(function (x) { return x.p.id === p.id && x.zone !== zone; });
    return more ? 'pentru ' + zone : q > 1 ? lei(p.price) + ' / ședință' : 'o ședință';
  }
  function popPaint() {
    if (!pop) return;
    var p = byId(pop.id), l = lineOf(pop.id, pop.zone), q = l ? l.qty : 1, el = pop.el, h = popHead(p, pop.zone);
    roll($('[data-sp-n]', el), h.n);
    roll($('[data-sp-p]', el), lei(h.pr));
    $('[data-sp-f]', el).textContent = lei(h.f);
    $('[data-sp-u]', el).textContent = popUnit(p, pop.zone, q);
    var zs = $('[data-sp-zones]', el); if (zs) zs.innerHTML = popZones(p, pop.zone);
    stepPaint($('.sh-step', el), q, 1);
  }
  // „+ Încă o zonă”: a new line with the first zone not in the cart; her next tap on a chip changes that new line's zone
  function popMore() {
    if (!pop) return;
    var p = byId(pop.id), z = p && freeZone(p);
    if (!z) return;
    add(p.id, z, 1);
    pop.zone = z; S.zone[p.id] = z;
    popPaint(); repaint(p.id);
  }

  // from one zone to „Toate zonele” and back: the line becomes the other product, with the same sessions
  function popSwap(toId, toZone) {
    var l = lineOf(pop.id, pop.zone), q = l ? l.qty : 1, from = pop.id;
    if (l) setQty(keyOf(pop.id, pop.zone), -99);
    if (!lineOf(toId, toZone)) add(toId, toZone, q);
    pop.id = toId; pop.zone = toZone; if (toZone) S.zone[toId] = toZone;
    var l2 = lineOf(toId, toZone);
    pop.el.innerHTML = popHtml(byId(toId), toZone, l2 ? l2.qty : q);
    repaint(from); repaint(toId);
  }
  function popZone(zone) {
    if (!pop) return;
    var pc = byId(pop.id), ab = altBase(pc);
    if (ab) { popSwap(ab.id, zone); return; }
    if (zone === pop.zone) return;
    setZone(keyOf(pop.id, pop.zone), zone);
    pop.zone = zone; S.zone[pop.id] = zone;
    popPaint();
  }
  function popAlt(id) { if (pop && id !== pop.id && byId(id)) popSwap(id, ''); }
  function popRm(zone) {
    if (!pop) return;
    var p = byId(pop.id);
    if (!p || !lineOf(p.id, zone)) return;
    setQty(keyOf(p.id, zone), -99);
    popPaint(); repaint(p.id);
  }
  function popQty(d) {
    if (!pop) return;
    var l = lineOf(pop.id, pop.zone);
    if (!l) { add(pop.id, pop.zone, 1); l = lineOf(pop.id, pop.zone); }
    setQty(keyOf(pop.id, pop.zone), clamp(l.qty + d, 1, 10), true);
    popPaint();
  }
  function closePop(then) {
    if (!pop) return;
    var p = pop; pop = null;
    if (!then) veil.classList.remove('on');
    if (then) { p.el.style.transition = 'opacity .25s'; p.el.style.opacity = '0'; setTimeout(function () { p.el.remove(); }, 260); then(); return; }
    growOut(p.el, p.from, '30px', function () { p.el.remove(); bar(); });
    try { if (p.from && p.from.isConnected) p.from.focus({ preventScroll: true }); } catch (e) { /* old browser */ }
  }

  // ================= the checkout: the cart, the clinic and the hour, her name and the payment =================
  var sheet = null, sheetOn = false, sheetFrom = null;
  var ORDER = ['cart', 'when', 'pay', 'done'];
  var TITLES = { cart: 'Coșul tău', when: 'Clinica și ora', pay: 'Datele tale și plata', done: 'Gata' };
  var radOf = function () { return innerWidth >= 900 ? '30px' : '30px 30px 0px 0px'; };
  function openSheet(step, from) {
    needVeil();
    if (!sheet) {
      sheet = document.createElement('div'); sheet.className = 'sh-sheet'; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-labelledby', 'shT');
      sheet.innerHTML = '<div class="sh-sh"><button type="button" class="sh-ic" data-back hidden aria-label="Înapoi">' + I.back + '</button><div class="sh-tt"><h3 id="shT"></h3><span class="sh-steps" aria-hidden="true"><i></i><i></i><i></i></span></div><button type="button" class="sh-ic" data-close aria-label="Închide">' + I.x + '</button></div>' +
        '<div class="sh-body">' + ORDER.map(function (s) { return '<div class="sh-pane r" data-pane="' + s + '"></div>'; }).join('') + '</div><div class="sh-foot" data-foot hidden></div>';
      document.body.appendChild(sheet);
    }
    if (sheetOn) { go(step || 'cart'); return; }
    sheetOn = true; sheetFrom = from || null; S.keep = {};
    bar();
    document.body.classList.add('sh-lock');
    go(step || 'cart', true);
    veil.classList.add('on');
    growIn(sheet, from, radOf());
    setTimeout(function () { try { $('[data-close]', sheet).focus({ preventScroll: true }); } catch (e) { /* old browser */ } }, 450);
  }
  function closeSheet() {
    if (!sheet || !sheetOn) return;
    if (S.step === 'pay' && S.hold) release();
    S.payRun = null;
    veil.classList.remove('on');
    sheetOn = false;
    document.body.classList.remove('sh-lock');
    if (S.step === 'done') { S.step = 'cart'; S.paid = null; }
    var bag = $$('.hx-cart').filter(function (b) { return rectOf(b); })[0];
    var from = sheetFrom && rectOf(sheetFrom) ? sheetFrom : bag || null;
    growOut(sheet, from, radOf(), function () { bar(); });
  }
  function foot(html) { var f = $('[data-foot]', sheet); f.innerHTML = html || ''; f.hidden = !html; }
  function go(step, instant) {
    var to = ORDER.indexOf(step);
    if (S.step === 'pay' && step !== 'pay' && step !== 'done' && S.hold) release();
    if (step !== 'pay') S.payRun = null;
    S.step = step;
    $('#shT', sheet).textContent = TITLES[step];
    $('[data-back]', sheet).hidden = step === 'cart' || step === 'done';
    $('.sh-steps', sheet).style.visibility = step === 'done' ? 'hidden' : '';
    $$('.sh-steps i', sheet).forEach(function (i, k) { i.classList.toggle('on', k <= Math.min(to, 2)); });
    ({ cart: paneCart, when: paneWhen, pay: panePay, done: paneDone })[step]();
    $$('.sh-pane', sheet).forEach(function (p) {
      var i = ORDER.indexOf(p.getAttribute('data-pane'));
      if (instant) p.style.transition = 'none';
      p.classList.toggle('l', i < to); p.classList.toggle('r', i > to);
      if (instant) { void p.offsetWidth; p.style.transition = ''; }
    });
    var cur = pane(step); if (cur) cur.scrollTop = 0;
    tick(); thumbAll();
  }
  function pane(s) { return $('[data-pane="' + s + '"]', sheet); }
  // a small card: „Merge super în combinație cu” (with the reason) and the other offers; one tap adds it, the card opens its page
  function miniHtml(q, why, zone, title) {
    var z = zone || zoneOf(q), has = !!lineOf(q.id, z);
    return '<div class="sh-pc sh-card" data-href="' + urlOf(q) + '"><span class="th"><img src="' + esc(picW(q, 600)) + '" alt="" loading="lazy" decoding="async"' + posOf(q) + '></span><b>' + esc(title || nameOf(q, z)) + '</b>' + (why ? '<small>' + esc(why) + '</small>' : '') +
      '<span class="pz"><b>' + lei(q.price) + '</b><s>' + lei(q.full) + '</s></span>' +
      '<button type="button" class="sh-plus' + (has ? ' in' : '') + '" data-plus="' + esc(q.id) + '" data-pz="' + esc(z) + '" aria-label="' + (has ? 'În coș, scoate ' : 'Adaugă ') + esc(nameOf(q, z)) + '">' + (has ? I.check : I.plus) + '</button></div>';
  }
  // „Recomandăm X ședințe pentru rezultate optime” (the owner, 25.11), on a line with fewer sessions than that; „pe zonă” where
  // the sessions are counted per zone
  function recHtml(x) {
    var r = recOf(x.p);
    if (!r || x.qty * (x.p.pack || 1) >= r[0]) return '';
    var o = optPlan(x);
    return '<div class="sh-rec"><p>' + I.spark + '<span>Recomandăm <b>' + r[1] + ' ședințe' + (r[2] ? ' pe zonă' : '') + '</b> pentru rezultate optime</span></p>' +
      (o && x.key ? '<button type="button" class="sh-rec-go" data-opt="' + esc(x.key) + '">Da, vreau rezultate optime</button>' : '') + '</div>';
  }
  // a package that contains her session (the owner, 25.11: „în ce pachet se regăsește ședința”, instead of „merge super cu”):
  // the package, its price, a session's price in it, what she saves against separate sessions; „Trec la pachet” swaps the line
  // what a problem package saves against its treatments one session at a time
  function bundleSave(k) {
    return (k.parts || []).reduce(function (s, x) { var q = byId(x.id), b = q && (q.base ? byId(q.base) : q); return s + (b ? b.price * x.n * (q.pack || 1) : 0); }, 0) - k.price;
  }
  // a package's card (the owner, 25.11: „la pachete șterge «economisești» și pune cu highlight ce are deja în coș”): what it holds,
  // the treatment she already has in the cart marked, its price
  function packHtml(o) {
    var k = o.k, mine = function (id) { return lines().some(function (x) { return x.p.id === id || x.p.base === id; }); };
    var inc = k.bundle ? (k.parts || []).map(function (x) {
      var q = byId(x.id), b = q && (q.base ? byId(q.base) : q), n = x.n * ((q && q.pack) || 1);
      if (!b) return '';
      var t = esc(b.name + ', ' + (n === 1 ? '1 ședință' : n + ' ședințe'));
      return mine(b.id) ? '<mark>' + I.check + t + '</mark>' : '<span>' + t + '</span>';
    }).join('<i>+</i>') : '<mark>' + I.check + esc(byId(k.base) ? byId(k.base).name : k.name) + '</mark><span>' + k.pack + ' ședințe, ' + lei(perSes(k)) + ' ședința</span>';
    return '<div class="sh-pk sh-card"><span class="th"><img src="' + esc(picW(k, 300)) + '" alt="" loading="lazy" decoding="async"' + posOf(k) + '></span>' +
      '<div class="sh-pk-m"><b>' + esc(nameOf(k, o.x.zone)) + '</b><span class="inc">' + inc + '</span></div>' +
      '<div class="pz"><b>' + lei(k.price) + '</b><s>' + lei(k.full) + '</s></div>' +
      '<button type="button" class="sh-pk-go" data-pack="' + esc(k.id) + '" data-pk-from="' + esc(o.x.key) + '">' + (k.bundle ? 'Aleg pachetul' : 'Trec la pachet') + I.arrow + '</button></div>';
  }
  // the line becomes the package, on the same zone (one package; one already in the cart gets one more)
  function toPack(key, packId, n) {
    var l = lineByKey(key), k = byId(packId);
    if (!l || !k) return;
    var from = l.id, z = l.zone || '', had = lineOf(packId, z), i = S.cart.indexOf(l);
    if (had) { had.qty = qOf((had.qty || 1) + (n || 1)); S.cart.splice(i, 1); } else S.cart[i] = { id: packId, zone: z, qty: n || 1 };
    fev('cart');
    px('AddToCart', { value: k.price * (n || 1), currency: 'RON', content_ids: [packId], content_type: 'product', content_name: nameOf(k, z) });
    changed(true); repaint(from); epiList();
    if (sheetOn && S.step === 'cart') paneCart();
  }
  function lineHtml(x) {
    var u = urlOf(x.p);
    return '<li class="sh-li sh-card" data-line="' + esc(x.key) + '"><a class="th" href="' + u + '" aria-hidden="true" tabindex="-1"><img src="' + esc(picW(x.p, 300)) + '" alt=""' + posOf(x.p) + '></a>' +
      '<div class="sh-li-m"><a class="sh-li-n" href="' + u + '">' + esc(x.p.name) + '</a>' +
      (x.p.zones.length ? '<div class="sh-zr"><button type="button" class="sh-zone" data-zk="' + esc(x.key) + '" aria-expanded="false">' + esc(x.zone) + I.down + '</button>' +
        (freeZone(x.p) ? '<button type="button" class="sh-addz s" data-zadd="' + esc(x.p.id) + '">' + I.plus + 'Încă o zonă</button>' : '') + '</div>'
        : '<span class="sh-li-x">' + esc(NEED[x.p.need] || '') + ' · ' + x.p.minutes + ' min</span>') + '</div>' +
      '<div class="pz"><b>' + lei(x.p.price * x.qty) + '</b><s>' + lei(x.p.full * x.qty) + '</s></div>' +
      '<div class="sh-li-b"><small>' + (x.p.bundle ? esc(x.p.inc) : lei(perSes(x.p)) + ' / ședință') + '</small>' + stepHtml(x.key, x.qty, 0) + '</div>' + recHtml(x) +
      (x.p.zones.length ? '<div class="sh-zp"><div><div class="sh-chips" role="radiogroup" aria-label="Zona">' + zoneChips(x.p, x.zone, 'data-lz', x.key) + '</div></div></div>' : '') + '</li>';
  }
  function paneCart() {
    var el = pane('cart'), t = totals();
    if (!t.lines.length) {
      el.innerHTML = '<div class="sh-empty">' + I.bag + '<h4>Coșul e gol</h4><p>Alege un tratament la -' + pct() + '%.</p><a class="sh-go" href="' + OFFERS + '">Vezi ofertele' + I.arrow + '</a></div>';
      foot(''); return;
    }
    // the suggestions: her clinic's (both, while she has not chosen); a treatment already in the cart is offered on a zone not in
    // the cart yet, or left out; one she added from here stays, checked, so she can take it back
    var city = cityNow(), pairs = [];
    var here = function (q) { return !city || q.cities.indexOf(city) > -1; };
    var mine = function (q, z) { return !!lineOf(q.id, z) && !S.keep[keyOf(q.id, z)]; };
    t.lines.forEach(function (x) {
      x.p.pairs.forEach(function (id) {
        var q = byId(id);
        if (!q || !here(q) || pairs.some(function (y) { return y.q === q; })) return;
        var z = q.zones.length ? (q.zones.indexOf(x.zone) > -1 ? x.zone : zoneOf(q)) : '';
        if (mine(q, z)) { if (!q.zones.length || !freeZone(q)) return; z = freeZone(q); }
        pairs.push({ q: q, why: WHY[x.p.id + '>' + q.id] || 'Se completează bine', zone: z });
      });
    });
    pairs = pairs.slice(0, 4);
    var packs = [];
    t.lines.forEach(function (x) {
      if (x.p.allOf || x.p.bundle) return;
      var have = x.qty * (x.p.pack || 1);
      packsOf(x.p.pack ? byId(x.p.base) : x.p).forEach(function (k) {
        if (k.pack > have && here(k) && !lineOf(k.id, x.zone)) packs.push({ x: x, k: k });
      });
      bundlesOf(x.p).forEach(function (k) {
        var z = k.zones.length ? x.zone : '';
        if ((!k.zones.length || k.zones.indexOf(x.zone) > -1) && here(k) && !lineOf(k.id, z) && !packs.some(function (y) { return y.k === k; })) packs.push({ x: x, k: k });
      });
    });
    // the problem packages first (the complete answer), then the price list's
    packs = packs.filter(function (y) { return y.k.bundle; }).concat(packs.filter(function (y) { return !y.k.bundle; })).slice(0, 4);
    var common = COMMON.map(function (c) { var q = byId(c[1]); return q && here(q) && !S.cart.some(function (l) { var lp = byId(l.id); return l.id === q.id || (lp && (lp.base === q.id || (lp.bundle && lp.for.indexOf(q.id) > -1))); }) ? { c: c, q: q } : null; }).filter(Boolean).slice(0, 6);
    var rest = D.terms.show.map(byId).filter(function (p) { return p && here(p) && !pairs.some(function (y) { return y.q === p; }) && !S.cart.some(function (l) { return (l.id === p.id || l.id.indexOf(p.id + '-x') === 0) && !S.keep[keyOf(l.id, l.zone)]; }); }).slice(0, 5);
    el.innerHTML = '<div class="sh-tmw">' + tmHtml('s') + '</div>' +
      '<ul class="sh-lines">' + t.lines.map(lineHtml).join('') + '</ul>' +
      (packs.length ? '<p class="sh-lab">Poți alege pachetul</p><div class="sh-pks">' + packs.map(packHtml).join('') + '</div>' : '') +
      (false ? '<p class="sh-lab">Merge super în combinație cu</p><div class="sh-rail">' + pairs.map(function (y) { return miniHtml(y.q, y.why, y.zone); }).join('') + '</div>' : '') +
      (common.length ? '<p class="sh-lab">Cele mai întâlnite probleme</p><div class="sh-rail">' + common.map(function (y) { return miniHtml(y.q, nameOf(y.q, y.c[2]), y.c[2], y.c[0]); }).join('') + '</div><a class="sh-link" href="' + OFFERS + '">Vezi toate ofertele' + I.chev + '</a>' : '') +
      '<div class="sh-stack sh-card"><div><span>Preț normal</span><s data-t-full>' + lei(t.full) + '</s></div><div class="sv"><span>Black Friday -' + pct() + '%</span><span data-t-saved>-' + lei(t.saved) + '</span></div><div class="tot"><span>Total</span><b data-t-amount>' + lei(t.amount) + '</b></div></div>' +
      (t.saved > 0 ? '<p class="sh-save">' + I.tag + '<span data-t-save>Economisești ' + lei(t.saved) + '</span></p>' : '') +
      '<p class="sh-fine">Plata doar online, cu cardul. Programarea se confirmă după plată.</p>';
    if (window.C360Arrows) window.C360Arrows(el);
    foot('<div class="sh-ft-t"><small data-ft-n>Total, ' + (t.n === 1 ? '1 ședință' : t.n + ' ședințe') + '</small><b><span data-ft-a>' + lei(t.amount) + '</span>' + (t.saved > 0 ? '<s data-ft-f>' + lei(t.full) + '</s>' : '') + '</b></div><button type="button" class="sh-go" data-go="when">Continuă' + I.arrow + '</button>');
  }
  function cartSoft(key) {
    var el = pane('cart'), li = el && $$('.sh-li', el).filter(function (x) { return x.getAttribute('data-line') === key; })[0], l = lineByKey(key);
    if (!li) { paneCart(); return; }
    if (!l) {
      if (reduce || !li.animate) { paneCart(); return; }
      li.style.overflow = 'hidden';
      li.animate([{ opacity: 1, transform: 'none', height: li.offsetHeight + 'px' }, { opacity: 0, transform: 'scale(.96)', height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '-10px' }], { duration: 380, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }).onfinish = paneCart;
      return;
    }
    var p = byId(l.id), q = l.qty, t = totals();
    roll($('.pz b', li), lei(p.price * q)); $('.pz s', li).textContent = lei(p.full * q);
    $('.sh-li-b small', li).textContent = p.bundle ? p.inc : lei(perSes(p)) + ' / ședință';
    var rc = $('.sh-rec', li), rh = recHtml({ p: p, qty: q, zone: l.zone, key: key });
    if (rc) rc.remove();
    if (rh) li.insertAdjacentHTML('beforeend', rh);
    stepPaint($('.sh-step', li), q, 0);
    var set = function (sel, v) { var x = $(sel, el); if (x) roll(x, v); };
    set('[data-t-full]', lei(t.full)); set('[data-t-saved]', '-' + lei(t.saved)); set('[data-t-amount]', lei(t.amount)); set('[data-t-save]', 'Economisești ' + lei(t.saved));
    var fa = $('[data-ft-a]', sheet); if (fa) roll(fa, lei(t.amount));
    var ff = $('[data-ft-f]', sheet); if (ff) ff.textContent = lei(t.full);
    var fn = $('[data-ft-n]', sheet); if (fn) fn.textContent = 'Total, ' + (t.n === 1 ? '1 ședință' : t.n + ' ședințe');
  }
  function mainLine() { return totals().lines.slice().sort(function (a, b) { return b.p.full - a.p.full; })[0]; }
  function whenLine() { if (!S.city) return 'Alege clinica'; if (clashOf().length) return 'Alege ce faci mai sus'; if (!S.time || !S.date) return 'Alege ziua și ora'; var x
 = new Date(S.date + 'T12:00:00'); return WDL[x.getDay()].replace(/^./, function (c) { return c.toUpperCase(); }) + ' ' + x.getDate() + ' ' + MOS[x.getMonth()] + ', ' + S.time; }
  // the clinic first (none chosen: she picks, nothing is preselected), then the day and the hour; the first visit is one line
  function paneWhen() {
    var el = pane('when'), m = mainLine();
    if (!m) { go('cart'); return; }
    S.city = cityNow(); save();
    fev('checkout');
    px('InitiateCheckout', { value: totals().amount, currency: 'RON', num_items: totals().n });
    S.visit = 'first';
    el.innerHTML = '<p class="sh-lab" style="margin-top:10px">Clinica</p><div class="seg sh-seg" role="radiogroup" aria-label="Clinica"><i class="sg-i" aria-hidden="true"></i>' +
      ['Timișoara', 'Arad'].map(function (c) { return '<button type="button" role="radio" data-city="' + c + '" aria-checked="' + (c === S.city) + '">' + c + '</button>'; }).join('') + '</div>' +
      '<p class="sh-addr" data-addr' + (S.city ? '' : ' hidden') + '>' + I.pin + '<span>' + esc(ADDR[S.city] || '') + '</span></p>' +
      '<p class="sh-note" data-pick-c' + (S.city ? ' hidden' : '') + '>Alege clinica și îți arătăm orele libere.</p>' +
      '<p class="sh-note" data-only hidden></p><div data-clash hidden></div>' +
      '<div data-wh' + (S.city ? '' : ' hidden') + '>' +
      // no free consultation any more (the owner, 25.11): her first visit is her first session
      '<p class="sh-note" data-visit-n>' + esc(visitNote()) + '</p>' +
      '<p class="sh-lab">Ziua</p><div data-days><div class="sh-wait">Caut orele libere…</div></div><div data-slots></div></div>';
    foot('<div class="sh-ft-t"><small data-ft-c>' + esc(S.city ? 'Centrul360 ' + S.city : 'Clinica') + '</small><b class="sm" data-when>' + esc(whenLine()) + '</b></div><button type="button" class="sh-go" data-go="pay" disabled>Spre plată' + I.arrow + '</button>');
    whenSync();
  }
  function visitNote() { var m = mainLine(); return S.visit === 'consult' ? '30 de minute, gratuit: îți spunem ce ți se potrivește.' : m ? 'Prima ședință: ' + nameOf(m.p, m.zone) + ', ' + m.p.minutes + ' min.' : ''; }
  // after the clinic changed or a line went: the address, what her clinic does not do, the hours
  function whenSync() {
    var el = pane('when');
    if (!el || S.step !== 'when') return;
    if (!mainLine()) { go('cart'); return; }
    var bad = clashOf(), ok = !!S.city && !bad.length;
    var ad = $('[data-addr]', el); if (ad) { ad.hidden = !S.city; $('span', ad).textContent = ADDR[S.city] || ''; }
    var pc = $('[data-pick-c]', el); if (pc) pc.hidden = !!S.city;
    // why this clinic (the cart has what only it does)
    var only = ok ? lines().filter(function (x) { return x.p.cities.length === 1; }).map(function (x) { return nameOf(x.p, x.zone); }) : [];
    var on1 = $('[data-only]', el); if (on1) { on1.hidden = !only.length; on1.textContent = only.length ? only.join(', ') + (only.length === 1 ? ' se face' : ' se fac') + ' doar în ' + S.city + '.' : ''; }
    var cl = $('[data-clash]', el);
    if (cl) {
      var to = fixCity(), one = bad.length === 1;
      cl.hidden = !bad.length;
      cl.innerHTML = bad.length ? '<div class="sh-clash sh-card"><p><b>' + (one ? 'Se face doar în ' : 'Se fac doar în ') + esc(bad[0].p.cities[0]) + '</b>' + (one ? 'Tratamentul de mai jos nu se face' : 'Tratamentele de mai jos nu se fac') + ' în ' + esc(S.city) + '.</p><ul>' +
        bad.map(function (x) { return '<li><span>' + esc(nameOf(x.p, x.zone)) + (x.qty > 1 ? ' × ' + x.qty : '') + '</span><button type="button" class="sh-rm" data-rm="' + esc(x.key) + '">Scoate</button></li>'; }).join('') + '</ul>' +
        (to ? '<button type="button" class="sh-go l" data-city-to="' + esc(to) + '">Schimbă pe ' + esc(to) + '</button>' : '') + '</div>' : '';
    }
    var wh = $('[data-wh]', el);
    if (wh) { var was = wh.hidden; wh.hidden = !ok; if (was && ok) thumb($('.sh-vis', wh), true); }
    var vn = $('[data-visit-n]', el); if (vn) vn.textContent = visitNote();
    var fc = $('[data-ft-c]', sheet); if (fc) fc.textContent = S.city ? 'Centrul360 ' + S.city : 'Clinica';
    if (ok) days();
    whenFoot();
  }
  // a day tapped: its hours come into sight (on a small phone they are under the fold)
  function slotsInView() {
    var el = pane('when'), sl = el && $('[data-slots]', el);
    if (!sl || !sl.firstChild) return;
    var r = sl.getBoundingClientRect(), pr = el.getBoundingClientRect(), d = Math.min(r.bottom - pr.bottom + 16, r.top - pr.top - 8);
    if (d > 0) { try { el.scrollBy({ top: d, behavior: reduce ? 'auto' : 'smooth' }); } catch (e) { el.scrollTop += d; } }
  }
  var daysKey = '';
  function days() {
    var m = mainLine(), el = pane('when');
    if (!m) return;
    var k = S.city + '|' + S.visit + '|' + (S.visit === 'first' ? m.p.ref : '');
    if (k !== daysKey) { daysKey = k; S.days = null; S.date = ''; S.time = ''; }
    if (S.days) { drawDays(); return; }
    var box = $('[data-days]', el); if (box) box.innerHTML = '<div class="sh-wait">Caut orele libere…</div>';
    var sl = $('[data-slots]', el); if (sl) sl.innerHTML = '';
    var url = '/api/booking?city=' + encodeURIComponent(S.city) + (S.visit === 'consult' ? '&service=consult' : '&service=custom&treatment=' + encodeURIComponent(m.p.ref));
    fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (d) {
      if (k !== daysKey) return;
      S.days = (d && d.on && d.days) || [];
      drawDays();
    }, function () { var x = $('[data-days]', el); if (x) x.innerHTML = '<div class="sh-alert">Nu am putut încărca orele. Verifică internetul și încearcă din nou.</div>'; });
  }
  function drawDays() {
    var el = pane('when'), box = $('[data-days]', el);
    if (!box) return;
    var list = (S.days || []).slice(0, 21), open = list.filter(function (d) { return d.slots && d.slots.length; });
    if (!open.length) { box.innerHTML = '<div class="sh-alert">Nu mai sunt ore libere online în zilele următoare. Încearcă cealaltă variantă de mai sus.</div>'; $('[data-slots]', el).innerHTML = ''; whenFoot(); return; }
    if (!S.date || !open.some(function (d) { return d.date === S.date; })) S.date = open[0].date;
    var keep = $('.sh-days', box), sl = keep ? keep.scrollLeft : 0;
    box.innerHTML = '<div class="sh-days" role="radiogroup" aria-label="Ziua">' + list.map(function (d) {
      var x = new Date(d.date + 'T12:00:00');
      return '<button type="button" role="radio" data-day="' + d.date + '" aria-checked="' + (d.date === S.date) + '"' + (d.slots && d.slots.length ? '' : ' disabled') + ' aria-label="' + esc(nice(d.date)) + '"><small>' + WD[x.getDay()] + '</small><b>' + x.getDate() + '</b><em>' + MOS[x.getMonth()] + '</em></button>';
    }).join('') + '</div>';
    if (sl) $('.sh-days', box).scrollLeft = sl;
    var day = list.filter(function (d) { return d.date === S.date; })[0];
    if (S.time && day.slots.indexOf(S.time) < 0) S.time = '';
    $('[data-slots]', el).innerHTML = '<p class="sh-lab">Ora · ' + esc(nice(S.date)) + '</p><div class="sh-slots" role="radiogroup" aria-label="Ora">' + day.slots.map(function (t) { return '<button type="button" role="radio" data-time="' + t + '" aria-checked="' + (t === S.time) + '">' + t + '</button>'; }).join('') + '</div>';
    whenFoot();
  }
  function whenFoot() { var w = $('[data-when]', sheet); if (w) w.textContent = whenLine(); var b = $('[data-go="pay"]', sheet); if (b) b.disabled = !S.time || !S.city || clashOf().length > 0; }
  function nice(date) { var x = new Date(date + 'T12:00:00'); return WDL[x.getDay()] + ' ' + x.getDate() + ' ' + MO[x.getMonth()]; }

  var payP = null;
  function payScript() {
    if (window.C360Pay) return Promise.resolve(window.C360Pay);
    if (!payP) payP = new Promise(function (ok, no) { var s = document.createElement('script'); s.src = '/c360-pay.js'; s.async = true; s.onload = function () { return window.C360Pay ? ok(window.C360Pay) : no(); }; s.onerror = function () { payP = null; no(); }; document.head.appendChild(s); });
    return payP;
  }
  function release() {
    var h = S.hold; S.hold = null;
    if (h) fetch('/api/booking', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ release: h.id, key: h.key }) }).catch(function () {});
  }
  function panePay() {
    var el = pane('pay'), t = totals(), mine = {};
    S.payRun = mine;
    foot('');
    el.innerHTML = '<div class="sh-sum sh-card"><div><i>' + I.cal + '</i><span><b>' + esc(nice(S.date).replace(/^./, function (c) { return c.toUpperCase(); })) + ', ora ' + esc(S.time) + '</b><small>' + (S.visit === 'consult' ? 'Consultația gratuită, 30 min' : 'Prima ședință') + ' · Centrul360 ' + esc(S.city) + '</small></span></div>' +
      '<div><i>' + I.bag + '</i><span><b>' + t.lines.map(function (x) { return esc(nameOf(x.p, x.zone)) + (x.qty > 1 ? ' × ' + x.qty : ''); }).join('<br>') + '</b><small>' + esc(ADDR[S.city]) + '</small></span></div></div>' +
      '<div data-pay><div class="sh-wait">Pregătesc plata…</div></div>';
    fev('pay');
    var src = null; try { src = window.C360Src ? window.C360Src() : null; } catch (e) { /* none */ }
    var fail = function () { if (S.payRun === mine) $('[data-pay]', el).innerHTML = '<div class="sh-alert">Nu am putut porni plata. Verifică internetul și încearcă din nou.</div><button type="button" class="sh-go" data-go="when" style="margin-top:14px">Înapoi</button>'; };
    payScript().then(function (P) {
      return P.ready().then(function (on) {
        if (S.payRun !== mine) return;
        if (!on) { $('[data-pay]', el).innerHTML = '<div class="sh-alert">Plata online nu e pornită încă pe această pagină.</div>'; return; }
        var holdP = fetch('/api/shop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'hold', city: S.city, items: t.lines.map(function (x) { return { id: x.p.id, zone: x.zone, qty: x.qty }; }), visit: S.visit, date: S.date, time: S.time, page: location.pathname, src: src }) })
          .then(function (r) { return r.json(); }, function () { return { error: 'net' }; })
          .then(function (d) {
            if (S.payRun !== mine) { if (d && d.hold) fetch('/api/booking', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ release: d.hold.id, key: d.hold.key }) }).catch(function () {}); return Promise.reject({ code: 'gone' }); }
            if (!d || !d.hold) return Promise.reject({ code: (d && d.error) || 'net' });
            S.hold = d.hold;
            return d.hold.id;
          });
        var me = null; try { me = JSON.parse(localStorage.getItem('c360-book-me') || 'null'); } catch (e) { /* none */ }
        P.open({
          kind: 'shop', ref: holdP, city: S.city, page: location.pathname, mount: $('[data-pay]', el),
          preview: { amount: t.amount, full: t.full, title: t.lines.map(function (x) { return nameOf(x.p, x.zone) + (x.qty > 1 ? ' × ' + x.qty : ''); }).join(' + '), bonusText: '-' + pct() + '% Black Friday' },
          contact: me && me.name ? { name: me.name, phone: me.phone } : undefined,
          onContact: function (c) { try { localStorage.setItem('c360-book-me', JSON.stringify({ name: c.name, phone: c.phone })); } catch (e) { /* private mode */ } },
          onError: function (code) {
            if (S.payRun !== mine || code === 'gone') return;
            if (code === 'taken') { S.time = ''; S.days = null; daysKey = ''; go('when'); setTimeout(function () { var w = pane('when'); if (w) w.insertAdjacentHTML('afterbegin', '<div class="sh-alert">Ora aleasă tocmai a fost ocupată. Alege, te rog, altă oră.</div>'); }, 300); return; }
            fail();
          },
          onPaid: function (r) {
            if (S.payRun !== mine) return;
            S.paid = { amount: r.amount || t.amount, confirmed: r.confirmed, date: S.date, time: S.time, city: S.city, lines: t.lines.map(function (x) { return nameOf(x.p, x.zone) + ', ' + sesWord(x.qty); }), visit: S.visit };
            S.hold = null; S.cart = []; save(); S.time = ''; S.days = null; daysKey = '';
            go('done'); changed(); repaintAll();
          },
        });
      });
    }, fail);
  }
  function paneDone() {
    var el = pane('done'), p = S.paid;
    if (!p) { el.innerHTML = ''; foot(''); return; }
    el.innerHTML = '<div class="sh-done"><div class="ok">' + I.check + '</div><h2>Plătit. Ne vedem ' + esc(nice(p.date)) + '.</h2><p>' + (p.confirmed ? 'Programarea e confirmată. Îți trimitem confirmarea și pe WhatsApp.' : 'Banca mai confirmă plata câteva clipe. Îți scriem pe WhatsApp imediat ce vine.') + '</p>' +
      '<div class="sh-sum sh-card"><div><i>' + I.cal + '</i><span><b>' + esc(nice(p.date).replace(/^./, function (c) { return c.toUpperCase(); })) + ', ora ' + esc(p.time) + '</b><small>' + (p.visit === 'consult' ? 'Consultația gratuită' : 'Prima ședință') + '</small></span></div>' +
      '<div><i>' + I.bag + '</i><span><b>' + lei(p.amount) + ', plătit online</b><small>' + p.lines.map(esc).join('<br>') + '</small></span></div>' +
      '<div><i>' + I.pin + '</i><span><b>Centrul360 ' + esc(p.city) + '</b><small>' + esc(ADDR[p.city]) + ' · <a href="' + MAPS[p.city] + '" target="_blank" rel="noopener">Vezi pe hartă</a></small></span></div></div></div>';
    foot('<button type="button" class="sh-go" data-close style="flex:1">Închide</button>');
  }

  // ================= the card → its treatment page: the picture and the name carry over (View Transitions) =================
  // the name the treatment page gives its hero picture (v2/tratamente.py): pic-<the product's id> (pic-epilare-full-body on the laser page)
  var vtOf = function (p) { return 'pic-' + String(p.id).replace(/[^a-z0-9-]/g, ''); };
  function vtSet(card, on) {
    var p = byId(card.getAttribute('data-p')), img = $('.pic img', card);
    if (!p || !img) return null;
    var name = vtOf(p);
    if (on) {
      // one name per page: anything else that carries it gives it up to the card that was tapped
      $$('img, picture, figure, [class*="pic"], [style*="view-transition-name"]').forEach(function (x) { if (x !== img && getComputedStyle(x).viewTransitionName === name) x.style.viewTransitionName = 'none'; });
    }
    img.style.viewTransitionName = on ? name : '';
    return img;
  }
  function openCard(card, href) {
    try { sessionStorage.setItem('c360-vt', card.getAttribute('data-p')); } catch (e) { /* private mode */ }
    vtSet(card, true);
    if (!reduce && !('onpagereveal' in window)) card.classList.add('press');
    location.href = href;
  }
  // back from a treatment page: its card takes the name again, so the picture flies back into it
  addEventListener('pagereveal', function (e) {
    var id = ''; try { id = sessionStorage.getItem('c360-vt') || ''; } catch (x) { /* private mode */ }
    $$('.bfc').forEach(function (c) { vtSet(c, false); c.classList.remove('press'); });
    if (!e.viewTransition || !id) return;
    var card = $('.bfs-st > .bfc.mid[data-p="' + id + '"]') || $('.bfo-g > .bfc[data-p="' + id + '"]');
    if (!card) return;
    vtSet(card, true);
    e.viewTransition.finished.then(function () { vtSet(card, false); }, function () { vtSet(card, false); });
  });
  addEventListener('pageshow', function (e) { if (e.persisted) $$('.bfc.press').forEach(function (c) { c.classList.remove('press'); }); });

  // ================= taps =================
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;
    var card = t.closest('.bfc[data-p]');
    if (card && card.closest('.bfs-st')) {
      if (SL.dragged && Date.now() - SL.dragged < 400) { e.preventDefault(); return; }
      if (!card.classList.contains('mid')) { e.preventDefault(); sliderTo(SL.cards.indexOf(card)); return; }
    }
    var dot = t.closest('[data-dot]'); if (dot) { sliderTo(+dot.getAttribute('data-dot')); return; }
    var nb = t.closest('[data-n]');
    if (nb) {
      var host = nb.closest('[data-p]') || nb.closest('[data-pp]'), pid = host && (host.getAttribute('data-p') || host.getAttribute('data-pp'));
      if (pid) { S.n[pid] = +nb.getAttribute('data-n'); var p0 = byId(pid), l0 = lineOf(pid, zoneOf(p0)); if (l0) { l0.qty = S.n[pid]; changed(); } repaint(pid); pause(); }
      return;
    }
    var a = t.closest('[data-add]');
    if (a && card) { var p = byId(card.getAttribute('data-p')), z = zoneOf(p); pause(); if (has(p)) { openSheet('cart', a); return; } add(p.id, z, nOf(p)); openPop(p.id, z, a); return; }
    var ppa = t.closest('[data-ppadd]');
    if (ppa) { var pp = byId($('[data-pp]').getAttribute('data-pp')); if (has(pp)) { openSheet('cart', ppa); return; } add(pp.id, zoneOf(pp), nOf(pp)); openPop(pp.id, zoneOf(pp), ppa); return; }
    var ppz = t.closest('[data-ppz]'); if (ppz) { S.zone[$('[data-pp]').getAttribute('data-pp')] = ppz.getAttribute('data-ppz'); ppBuy(); return; }
    if (card && !t.closest('a, button')) { openCard(card, card.getAttribute('data-href')); return; }
    if (card && t.closest('h3 a')) { e.preventDefault(); openCard(card, t.closest('a').getAttribute('href')); return; }
    var pz = t.closest('[data-pzone]'); if (pz) { if (!pz.disabled) popZone(pz.getAttribute('data-pzone')); return; }
    if (t.closest('[data-pzadd]')) { popMore(); return; }
    var pa = t.closest('[data-palt]'); if (pa) { popAlt(pa.getAttribute('data-palt')); return; }
    var pr = t.closest('[data-pzrm]'); if (pr) { popRm(pr.getAttribute('data-pzrm')); return; }
    var co = t.closest('[data-checkout]'); if (co) { var from = co; closePop(function () { openSheet('cart', from); }); return; }
    if (t.closest('[data-pop-x]')) { closePop(); return; }
    var op = t.closest('[data-opt]'); if (op) { optimal(op.getAttribute('data-opt')); return; }
    var pk = t.closest('[data-pack]'); if (pk) { toPack(pk.getAttribute('data-pk-from'), pk.getAttribute('data-pack')); return; }
    var plus = t.closest('[data-plus]');
    if (plus) {
      var id = plus.getAttribute('data-plus'), q = byId(id), z2 = plus.getAttribute('data-pz') || (q ? zoneOf(q) : ''), had = !!lineOf(id, z2);
      if (sheet && sheet.contains(plus)) S.keep[keyOf(id, z2)] = 1;
      if (had) setQty(keyOf(id, z2), -99); else add(id, z2, 1);
      if (sheetOn && S.step === 'cart') paneCart();
      return;
    }
    var qb = t.closest('[data-q]');
    if (qb) { if (qb.disabled) return; if (qb.getAttribute('data-k') === 'pop') popQty(+qb.getAttribute('data-q')); else { var qk = qb.getAttribute('data-k'); setQty(qk, +qb.getAttribute('data-q')); if (sheetOn && S.step === 'cart') cartSoft(qk); } return; }
    var zk = t.closest('[data-zk]');
    if (zk) { var li = zk.closest('.sh-li'), zp = li && $('.sh-zp', li), open = zk.getAttribute('aria-expanded') !== 'true'; zk.setAttribute('aria-expanded', String(open)); if (zp) zp.classList.toggle('open', open); return; }
    var lz = t.closest('[data-lz]'); if (lz) { if (!lz.disabled) { setZone(lz.getAttribute('data-k'), lz.getAttribute('data-lz')); paneCart(); } return; }
    // „+ Încă o zonă” on a cart line: a new line with a zone not in the cart yet, its zone picker open so she can choose it
    var za = t.closest('[data-zadd]');
    if (za) {
      var zq = byId(za.getAttribute('data-zadd')), nz = zq && freeZone(zq);
      if (!nz) return;
      add(zq.id, nz, 1);
      if (S.step !== 'cart') return;
      paneCart();
      var nk = keyOf(zq.id, nz), nli = $$('.sh-li', pane('cart')).filter(function (x) { return x.getAttribute('data-line') === nk; })[0];
      if (nli) {
        var nb2 = $('[data-zk]', nli), np = $('.sh-zp', nli);
        if (nb2) nb2.setAttribute('aria-expanded', 'true'); if (np) np.classList.add('open');
        setTimeout(function () { try { nli.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); } catch (x) { /* old browser */ } }, 120);
      }
      return;
    }
    var fb = t.closest('[data-f]');
    if (fb) {
      var k = fb.getAttribute('data-f'); if (k === F.k) return;
      F.k = k; $$('[data-f]').forEach(function (b) { b.setAttribute('aria-selected', String(b === fb)); }); if (fb.closest('.seg')) thumb(fb.closest('.seg'));
      try { history.replaceState(null, '', '#' + k); } catch (x) { /* fine */ }
      grid(true);
      var f = $('.bfo-f'); if (f && f.getBoundingClientRect().top < 90) scrollTo({ top: $('[data-bfo]').getBoundingClientRect().top + scrollY - 90, behavior: reduce ? 'auto' : 'smooth' });
      return;
    }
    var g = t.closest('[data-g]'); if (g) { EPI.g = g.getAttribute('data-g'); $$('[data-g]').forEach(function (b) { b.setAttribute('aria-checked', String(b === g)); }); thumb(g.closest('.seg')); epiList(); return; }
    var cartB = t.closest('[data-cart]'); if (cartB) { openSheet('cart', cartB); return; }
    if (t.closest('[data-close]')) { closeSheet(); return; }
    if (t.closest('[data-back]')) { go(ORDER[Math.max(0, ORDER.indexOf(S.step) - 1)]); return; }
    var gg = t.closest('[data-go]'); if (gg && sheet && sheet.contains(gg)) { if (!gg.disabled) go(gg.getAttribute('data-go')); return; }
    var c = t.closest('[data-city]') || t.closest('[data-city-to]');
    if (c && !c.disabled && sheet && sheet.contains(c)) {
      setCity(c.getAttribute('data-city') || c.getAttribute('data-city-to'));
      $$('[data-city]', sheet).forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-city') === S.city)); }); thumb($('.sh-seg', sheet));
      whenSync(); return;
    }
    // the clinic does not do it: one tap takes it out of the cart
    var rm = t.closest('[data-rm]');
    if (rm && sheet && sheet.contains(rm)) { setQty(rm.getAttribute('data-rm'), -99); whenSync(); return; }
    var v = t.closest('[data-visit]');
    if (v) {
      S.visit = v.getAttribute('data-visit');
      $$('[data-visit]', sheet).forEach(function (b) { b.setAttribute('aria-checked', String(b === v)); }); thumb(v.closest('.seg'));
      var vn = $('[data-visit-n]', sheet); if (vn) vn.textContent = visitNote();
      days(); return;
    }
    var dy = t.closest('[data-day]'); if (dy) { S.date = dy.getAttribute('data-day'); S.time = ''; drawDays(); slotsInView(); return; }
    var tm = t.closest('[data-time]'); if (tm) { S.time = tm.getAttribute('data-time'); $$('[data-time]', sheet).forEach(function (b) { b.setAttribute('aria-checked', String(b === tm)); }); whenFoot(); return; }
    // a whole suggestion card opens its treatment's page
    var row = t.closest('[data-href]'); if (row && !t.closest('a,button')) { location.href = row.getAttribute('data-href'); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (pop) closePop(); else if (sheetOn) closeSheet(); } });

  // ================= the catalog =================
  var CAT = null, catOk = null;
  CAT = new Promise(function (ok) { catOk = ok; });
  // the first time, the answers the page's head already asked for (window.C360Pre, v2/build.py: the shop's pages ask from the
  // head, before the styles, so the first screen does not wait for this script); again later (fresh), new ones
  function load(fresh) {
    var pre = fresh !== true && window.C360Pre;
    var art = (pre && pre.art ? pre.art : fetch('/v2/art.json', { headers: { Accept: 'application/json' } }).then(function (r) { return r.ok ? r.json() : {}; })).catch(function () { return {}; });
    var api = pre && pre.shop ? pre.shop.catch(function () { return fetch('/api/shop', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }); })
      : fetch('/api/shop', { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); });
    return Promise.all([api, art]).then(function (x) {
      var d = x[0];
      if (!d || !d.ok) throw new Error('shop');
      ART = x[1] && typeof x[1] === 'object' ? x[1] : {};
      D = d; offset = d.terms.now - Date.now();
      S.cart = S.cart.filter(function (l) { return l && byId(l.id); });
      slider(); offers(); needGrids(); ppBuy(); watch(document); headCart(); bar(); tick();
      catOk(D);
      emit('c360:shop', { terms: D.terms, products: D.products });
      if (/[?&#]cos\b/.test(location.search + location.hash) && lines().length) openSheet('cart');
    }).catch(function () {
      var g = $('[data-bfo]') || $('[data-bfs]') || $('[data-shop-ids]');
      if (g) g.innerHTML = '<div class="sh-alert" style="max-width:420px;margin:0 auto">Nu am putut încărca ofertele. Reîncarcă pagina.</div>';
      catOk(null);
    });
  }

  window.C360Shop = {
    add: function (o, from) {
      o = o || {};
      return CAT.then(function () {
        var p = byId(o.id); if (!p) return false;
        var z = p.zones.indexOf(o.zone) > -1 ? o.zone : zoneOf(p);
        add(p.id, z, qOf(o.qty)); openPop(p.id, z, from);
        return true;
      });
    },
    open: function (from) { return CAT.then(function () { if (D) openSheet('cart', from); }); },
    price: function (id, zone, qty) {
      var p = byId(id); if (!p) return null;
      var q = qOf(qty), z = p.zones.indexOf(zone) > -1 ? zone : zoneOf(p);
      return { amount: p.price * q, full: p.full * q, saved: (p.full - p.price) * q, unit: p.price, unitFull: p.full, pct: pct(), qty: q, zone: z, name: nameOf(p, z) };
    },
    catalog: function () { return CAT.then(function () { return D ? { terms: D.terms, products: D.products.map(function (p) { return Object.assign({}, p, { photo: picOf(p) }); }) } : null; }); },
    count: function () { return S.cart.length; },
    lines: function () { return S.cart.map(function (l) { return { id: l.id, zone: l.zone || '', qty: l.qty || 1 }; }); },
  };
  tick();
  headCart();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
  setInterval(tick, 1000);
  addEventListener('pagehide', function () { if (S.hold) release(); });
})();
