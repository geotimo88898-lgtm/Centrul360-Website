// Centrul360, the preview's one reason per card (the owner, 27.11: „un singur bullet point, în care să incluzi mai multe lucruri,
// cele relevante, că arată mai bine vizual și mai curat”): the card's reasons said in one line under one tick („Elimină grăsimea
// localizată, contur mai suplu”). Only the /v2/ preview loads it (v2/build.py, next to v2/m3.css); the shop's cards on the live
// site (v2/shop.js) stay as they are until the owner says yes. The cards are drawn by the shop's script (and drawn again on a
// filter or a tap): every list that appears is joined as it arrives, before the browser paints it.
(function () {
  'use strict';
  // the line of each treatment, the same reasons said once (no word twice); any other card: its reasons joined by commas
  var ONE = {
    liposonix: 'Elimină grăsimea localizată, contur mai suplu', hifu: 'Strânge pielea lăsată, aspect de lifting',
    restart: 'Ten luminos, curat și odihnit, imediat', biolifting: 'Piele mai fermă, mai puține riduri fine',
    ems: 'Tonifiază mușchii, abdomen mai ferm', 'hifu-corp': 'Strânge pielea lăsată și o face mai fermă',
    radiofrecventa: 'Reduce celulita, strânge și netezește pielea', cavitatie: 'Reduce grăsimea localizată, piele mai netedă',
    impachetare: 'Reduce retenția de apă, picioare ușoare', hidratare: 'Hidratare în profunzime, ten fin și catifelat',
    antirid: 'Diminuează ridurile, piele mai fermă', redness: 'Calmează roșeața, ten mai uniform',
    'sebum-off': 'Curăță porii în profunzime, ten fără luciu', 'masaj-facial': 'Relaxare profundă, ten odihnit'
  };
  // the next reason starts in lower case after the comma, a name in capitals stays (HIFU, EMS); a first word said again goes
  var low = function (s) { var w = s.split(' ')[0]; return /^[A-ZĂÂÎȘȚ0-9]{2,}$/.test(w) ? s : s.charAt(0).toLowerCase() + s.slice(1); };
  function join(ul) {
    var li = ul.querySelectorAll(':scope > li');
    if (li.length < 2) return;
    var parts = [].map.call(li, function (x) { var s = x.querySelector('span'); return (s ? s.textContent : x.textContent).trim().replace(/\.$/, ''); }).filter(Boolean);
    var sp = li[0].querySelector('span');
    if (!sp || !parts.length) return;
    var card = ul.closest('[data-p]'), id = card ? card.getAttribute('data-p') : '';
    var w0 = parts[0].split(' ')[0].toLowerCase();
    sp.textContent = ONE[id] || parts[0] + parts.slice(1).map(function (t) { var x = low(t); return ', ' + (x.split(' ')[0].toLowerCase() === w0 && x.indexOf(' ') > 0 ? x.slice(x.indexOf(' ') + 1) : x); }).join('');
    for (var i = 1; i < li.length; i++) li[i].remove();
    ul.classList.add('one');
  }
  var all = function (root) { if (root.querySelectorAll) root.querySelectorAll('.bft-l').forEach(join); };

  // ---- no black left over in a card (the owner, 27.11: „elimină acum spațiul negru inutil”, then „încă e puțin mai mult spațiu
  // negru inutil, rezolvă să arate bine tot cadranul”). The cards of a row are as tall as each other; a card with fewer words
  // used to keep a black hole between its reason and its price. Now each card's photo takes exactly what its words leave: the
  // row's height is the least that shows every subject whole (how far down each one goes, as a share of the card's 4:5 photo,
  // measured on the photos, 27.11) above all its words, and every card fills it with its own photo, so the price and the
  // button sit at the foot of each card with nothing empty above them. A photo not measured keeps its whole 4:5.
  var DEPTH = { liposonix: 0.58, hifu: 0.64, restart: 0.72, biolifting: 0.79, ems: 0.59, 'hifu-corp': 0.78, radiofrecventa: 0.59, cavitatie: 0.67,
    impachetare: 0.55, hidratare: 0.56, antirid: 0.51, redness: 0.59, 'sebum-off': 0.55, 'masaj-facial': 0.72 };
  var EDGE = 0.08; // under the subject: room for the photo to fade into the card
  function cut(grid) {
    var cards = [].slice.call(grid.querySelectorAll(':scope > .bft')).filter(function (c) { return c.offsetParent; });
    if (!cards.length) return;
    // each card's words at their own height (the row not stretching them while measured)
    grid.classList.add('m3-measure');
    var rows = {};
    cards.forEach(function (c) { var t = Math.round(c.offsetTop); (rows[t] = rows[t] || []).push(c); });
    var set = [];
    Object.keys(rows).forEach(function (t) {
      var r = rows[t];
      var need = r.map(function (c) {
        var body = c.querySelector(':scope > .bft-b'), v = DEPTH[c.getAttribute('data-p')], w = c.offsetWidth * 1.25;
        var words = body ? body.offsetHeight : 0;
        return { c: c, w: w, words: words, min: w * Math.min(1, v == null ? 1 : v + EDGE) };
      });
      var tall = Math.max.apply(null, need.map(function (n) { return n.min + n.words; }));
      need.forEach(function (n) { set.push([n.c, Math.max(n.min, tall - n.words) / n.w]); });
    });
    grid.classList.remove('m3-measure');
    set.forEach(function (x) { x[0].style.setProperty('--cut', Math.min(1.3, x[1]).toFixed(3)); });
  }
  var cutAll = function () { document.querySelectorAll('.bfo-g.tiles').forEach(cut); };
  var soon = 0;
  var later = function () { cancelAnimationFrame(soon); soon = requestAnimationFrame(cutAll); };
  addEventListener('resize', later, { passive: true });

  new MutationObserver(function (ms) {
    var cards = false;
    ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType !== 1) return; if (n.matches('.bft-l')) join(n); else all(n); if (n.matches('.bft, .bfo-g') || (n.querySelector && n.querySelector('.bft'))) cards = true; }); });
    if (cards) cutAll();
  }).observe(document.documentElement, { childList: true, subtree: true });
  all(document);
  cutAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(later);
})();
