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
    radiofrecventa: 'Reduce celulita, strânge pielea', cavitatie: 'Reduce grăsimea localizată, piele mai netedă',
    impachetare: 'Reduce retenția de apă, picioare ușoare', hidratare: 'Hidratare în profunzime, ten fin și catifelat',
    antirid: 'Diminuează ridurile, piele mai fermă', redness: 'Calmează roșeața, ten mai uniform',
    'sebum-off': 'Curăță porii, ten fără luciu', 'masaj-facial': 'Relaxare profundă, ten odihnit'
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
  new MutationObserver(function (ms) {
    ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType !== 1) return; if (n.matches('.bft-l')) join(n); else all(n); }); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  all(document);
})();
