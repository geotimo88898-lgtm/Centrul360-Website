// Traininguri → Vânzări → Fișa consultației: the "Program recomandat și ofertă" sheet, page by page, explained on
// the page itself, the way the owner's "Ghid de utilizare" explains it. Each page is the real sheet (academy-fisa/
// p1-p5.webp, rendered from fise/program-recomandat-si-oferta.pdf) with the guide's worked example written in on it
// in pen (the 9.600 lei abdomen program) and numbered marks on its parts; next to it, what each part is for and how
// to fill it in. A tap on a mark lights its explanation, a tap on an explanation lights its part of the page.
//   window.C360Fisa.html(state) → markup · window.C360Fisa.bind(root, state, repaint)
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BOX_X = 7.6, BOX_W = 84.8; // every part spans the page's width

  // pen on the page: [left %, top %, text, extra class]
  const DAY = '15.10.2026';
  const sched = (rows, tops) => rows.map((r, i) => [[17.6, tops[i], r[0]], [53, tops[i], r[1]], [76.6, tops[i], r[2]]]).flat();
  const SCHED = [['Liposonix, cavitație, EMS, împachetare', '16.10.2026', '10:00'], ['Cavitație, EMS, împachetare', '23.10.2026', '10:00'],
    ['Liposonix, cavitație, EMS, împachetare', '30.10.2026', '10:00'], ['Cavitație, EMS, împachetare', '06.11.2026', '10:00']];
  const sign = (top1, top2) => [[24.5, top1, 'A. Pop', 'is-sig'], [66.5, top1, 'Ioana', 'is-sig'], [24.5, top2, DAY], [66.5, top2, 'Ioana']];
  const HALF = (top) => [
    ['Cavitație · abdomen', '8', '4', '280', '1.120'], ['EMS · abdomen', '8', '4', '250', '1.000'],
    ['Împachetare · abdomen', '8', '4', '190', '760'], ['Liposonix · abdomen', '6', '3', '640', '1.920'],
  ].map((r, i) => [[9, top + i * 2.1, r[0]], [41, top + i * 2.1, r[1]], [54, top + i * 2.1, r[2]], [66, top + i * 2.1, r[3]], [80, top + i * 2.1, r[4]]]).flat();
  const money = (tops, vals) => tops.map((t, i) => [62, t, vals[i]]);

  const PAGES = [
    {
      tab: 'Programul', head: 'Programul recomandat', tone: '',
      role: 'Rămâne la clientă. La sfârșit o capsezi de fișa ei de client.',
      fills: [
        [24.5, 12.9, 'Andreea Pop'], [66.5, 12.9, DAY], [24.5, 15.6, 'Ioana'],
        [9.2, 26.1, 'Să scape de grăsimea de pe abdomen, să se simtă bine în costum de baie.'],
        ...[['Cavitație', 'abdomen', '8', '280', '2.240'], ['EMS', 'abdomen', '8', '250', '2.000'], ['Împachetare la cald', 'abdomen', '8', '190', '1.520'], ['Liposonix', 'abdomen', '6', '640', '3.840']]
          .map((r, i) => { const t = [39.0, 41.8, 44.7, 47.5][i]; return [[13.2, t, r[0]], [36, t, r[1]], [48.5, t, r[2]], [66, t, r[3]], [79.2, t, r[4]]]; }).flat(),
        [64, 65.5, '9.600', 'is-big'],
        [53, 73.6, 'aproximativ 3 luni'],
        [9.2, 80.3, 'Abdomen mai plat și mai ferm. Rezultatul diferă de la o persoană la alta.'],
      ],
      notes: [
        { box: [12.2, 5.3], t: 'Clienta, data, tu', d: 'Completezi sus numele clientei, data consultației și numele tău la Specialist.' },
        { box: [22.6, 6.9], t: 'Obiectivul ei', d: 'Întâi afli ce o deranjează. Apoi scrii obiectivul ei, cu cuvintele ei.' },
        { box: [34.7, 29.2], t: 'Tratamentele recomandate', d: 'O linie pentru fiecare procedură: zona, numărul de ședințe, intervalul dintre ședințe (din schema tratamentului) și prețul de listă pe ședință. Subtotal = ședințe × preț de listă.' },
        { box: [65, 2.9], t: 'Totalul la preț de listă', d: 'Suma subtotalurilor. La programele pentru corp: minimum 9.500 lei. Excepție doar clienta cu foarte puțină grăsime, când recomanzi mai puține proceduri.' },
        { box: [73.1, 10.9], t: 'Durata și rezultatul', d: 'Durata estimată a programului și rezultatul estimat. Rezultatele sunt estimate, nu garantate: nu promiți nimic concret.' },
      ],
      next: 'Programul e gata? Prezinți prima ofertă: pagina 2.',
    },
    {
      tab: 'Integral', badge: '-50%', head: 'Oferta 1 · pachet complet, plată integrală', tone: 'is-a',
      role: 'Prima ofertă, cea mai avantajoasă ca reducere. Pe masă e doar pagina asta: nu arăți și nu pomenești paginile următoare.',
      fills: [
        ...money([8.6, 11.2, 14.0, 16.6], ['9.600', '50', '4.800', '4.800']),
        [18.1, 22.0, '✓', 'is-tick'], [24.5, 25.4, DAY], [66.5, 25.4, '4.800'],
        ...sched(SCHED.slice(0, 2), [34.3, 36.9]),
        ...sign(75.9, 79.5),
      ],
      notes: [
        { box: [7.8, 10.9], t: 'Calculul ofertei', d: 'Total la preț de listă = totalul din pagina 1. Reducerea de 50% o scrii tu la „Reducere acordată (%)”, apoi valoarea ei în lei. Total de plată = total listă × 0,50.' },
        { box: [22.3, 4.9], t: 'Plata', d: 'Bifezi cum plătește și scrii data achitării și suma achitată.' },
        { box: [31.2, 26], t: 'Programarea ședințelor', d: 'Programezi toate ședințele pe loc, cu data și ora, respectând intervalele recomandate.' },
        { box: [58.4, 11.7], t: 'Condițiile', d: 'Oferta e valabilă doar în ziua consultației. Spune-i clar, înainte să semneze: anularea sau mutarea cu mai puțin de 24 de ore înainte face ca ședința să fie considerată efectuată.' },
        { box: [74.5, 6.9], t: 'Semnăturile', d: 'Semnează clienta și semnezi tu. Pagina 1 și pagina acceptată se capsează de fișa clientei. Un exemplar rămâne la centru, clienta primește o copie.' },
      ],
      next: 'Nu îi convine? Iei pagina înapoi și îi dai pagina 3.',
    },
    {
      tab: '4 tranșe', badge: '-30%', head: 'Oferta 2 · pachet complet, plata în 4 tranșe', tone: 'is-b',
      role: 'A doua ofertă, doar dacă prima nu i-a convenit. Pagina 2 nu mai e pe masă.',
      fills: [
        ...money([8.6, 11.2, 14.0, 16.6, 19.4], ['9.600', '30', '2.880', '6.720', '1.680']),
        ...[0, 1, 2, 3].map((i) => { const t = [28.5, 31.1, 33.7, 36.4][i]; return [[21, t, 'ședința ' + (i + 1)], [36.2, t, '1.680'], [53, t, SCHED[i][1]]].concat(i === 0 ? [[73.4, t, '16.10 ✓']] : []); }).flat(),
        ...sched(SCHED, [45.3, 47.9, 50.5, 53.1]),
        ...sign(75.5, 79.1),
      ],
      notes: [
        { box: [7.8, 13.6], t: 'Calculul ofertei', d: 'Reducerea e de 30%. Total de plată = total listă × 0,70. Valoarea unei tranșe = totalul de plată împărțit la 4.' },
        { box: [25.2, 13.1], t: 'Calendarul tranșelor', d: 'La „Se achită la” scrii ședința la care plătește fiecare tranșă: tranșa 1 la ședința 1, tranșa 2 la ședința 2 și tot așa. „Data ședinței” o completezi după ce programezi. La fiecare plată se completează „Achitat”.' },
        { box: [42.3, 12.8], t: 'Programarea ședințelor', d: 'Toate ședințele, programate pe loc, cu data și ora.' },
        { box: [58.2, 11.8], t: 'Condițiile', d: 'Aceleași ca la oferta 1, plus una: fiecare tranșă se achită la ședința ei.' },
        { box: [74.1, 6.9], t: 'Semnăturile', d: 'Clienta și tu. Capsezi pagina 1 și pagina asta de fișa clientei.' },
      ],
      next: 'Nu îi convine? Îi propui jumătate din pachet: pagina 4.',
    },
    {
      tab: '½ integral', badge: '-50%', head: 'Oferta 3 · jumătate din pachet, plată integrală', tone: 'is-c',
      role: 'Jumătate din ședințele programului din pagina 1, cu aceeași reducere ca prima ofertă.',
      fills: [
        ...HALF(8.3),
        ...money([18.3, 20.9, 23.6, 26.4], ['4.800', '50', '2.400', '2.400']),
        [18.1, 31.6, '✓', 'is-tick'], [24.5, 35.1, DAY], [66.5, 35.1, '2.400'],
        ...sched(SCHED.slice(0, 2), [43.9, 46.6]),
        ...sign(73.4, 77.1),
      ],
      notes: [
        { box: [4.1, 12.2], t: 'Pachetul redus', d: 'Jumătate din ședințele fiecărei proceduri, fără rotunjire: scrii numărul exact (3 ședințe devin 1,5). Subtotal = ședințe oferite × preț de listă.' },
        { box: [17.5, 10.9], t: 'Calculul ofertei', d: 'Total listă pachet redus = suma subtotalurilor de mai sus. Reducere 50%. Total de plată = total listă pachet redus × 0,50.' },
        { box: [31.6, 5.3], t: 'Plata', d: 'Cum plătește, data și suma achitată.' },
        { box: [40.9, 15.5], t: 'Programarea ședințelor', d: 'Toate ședințele pachetului redus, programate pe loc.' },
        { box: [58.8, 20.1], t: 'Condițiile și semnăturile', d: 'Ca la oferta 1: valabilă doar azi, regula de 24 de ore spusă clar, semnează clienta și tu.' },
      ],
      next: 'Nu îi convine? Ultima variantă: pagina 5.',
    },
    {
      tab: '½ în tranșe', badge: '-30%', head: 'Oferta 4 · jumătate din pachet, plata în 4 tranșe', tone: 'is-d',
      role: 'Cea mai accesibilă ca sumă. Același pachet redus ca pe pagina 4, plătit în 4 tranșe.',
      fills: [
        ...HALF(8.3),
        ...money([18.3, 20.9, 23.6, 26.4, 29.1], ['4.800', '30', '1.440', '3.360', '840']),
        ...[0, 1, 2, 3].map((i) => { const t = [38.2, 40.8, 43.4, 46.0][i]; return [[21, t, 'ședința ' + (i + 1)], [36.2, t, '840'], [53, t, SCHED[i][1]]].concat(i === 0 ? [[73.4, t, '16.10 ✓']] : []); }).flat(),
        ...sched(SCHED.slice(0, 2), [55.1, 57.7]),
        ...sign(78.3, 81.9),
      ],
      notes: [
        { box: [4.1, 12.2], t: 'Pachetul redus', d: 'Aceleași ședințe ca pe pagina 4: jumătate din fiecare procedură, fără rotunjire.' },
        { box: [17.5, 13.6], t: 'Calculul ofertei', d: 'Reducere 30%. Total de plată = total listă pachet redus × 0,70. Valoarea unei tranșe = totalul de plată împărțit la 4.' },
        { box: [35, 13], t: 'Calendarul tranșelor', d: 'Tranșa 1 la ședința 1, tranșa 2 la ședința 2 și tot așa. Data ședinței după programare, „Achitat” la fiecare plată.' },
        { box: [51.9, 7.7], t: 'Programarea ședințelor', d: 'Toate ședințele, programate pe loc.' },
        { box: [61.2, 22.7], t: 'Condițiile și semnăturile', d: 'Valabilă doar azi, fiecare tranșă la ședința ei, regula de 24 de ore spusă clar. Semnează clienta și tu.' },
      ],
      next: '',
    },
  ];
  const CHECK = [
    'La programele pentru corp, totalul la preț de listă e de minimum 9.500 lei (sau e cazul rar cu foarte puțină grăsime).',
    'Toate câmpurile paginii acceptate sunt completate: reducerea în %, reducerea în lei, totalul de plată.',
    'Programarea ședințelor e completată.',
    'La plata în tranșe: „Se achită la” și valoarea fiecărei tranșe sunt completate.',
    'Clienta a citit condițiile și a semnat, la fel și tu.',
    'Pagina 1 și pagina acceptată sunt capsate de fișa clientei. Un exemplar rămâne la centru, clienta primește o copie.',
  ];

  const sheet = (pg, i, st, big) => '<div class="tr-sheet' + (st.ink ? '' : ' no-ink') + (big ? ' is-big' : '') + '" style="background-image:url(/academy-fisa/p' + (i + 1) + '.webp)" role="img" aria-label="Pagina ' + (i + 1) + ' din fișă">' +
    pg.fills.map(([x, y, t, cls]) => '<span class="tr-ink' + (cls ? ' ' + cls : '') + '" style="left:' + x + '%;top:' + y + '%">' + esc(t) + '</span>').join('') +
    pg.notes.map((n, k) => '<span class="tr-hl' + (st.on === k ? ' is-on' : '') + '" style="left:' + BOX_X + '%;top:' + n.box[0] + '%;width:' + BOX_W + '%;height:' + n.box[1] + '%"></span>' +
      '<button type="button" class="tr-mark' + (st.on === k ? ' is-on' : '') + '" data-fs-mark="' + k + '" style="top:' + (n.box[0] + 0.6) + '%" aria-label="' + esc(n.t) + '">' + (k + 1) + '</button>').join('') +
    '</div>';

  function html(st) {
    const i = st.page, pg = PAGES[i];
    return '<div class="tr-fisa">' +
      '<div class="tr-fs-flow" role="tablist">' + PAGES.map((p, k) => (k ? '<span class="tr-fs-arrow" aria-hidden="true">›</span>' : '') +
        '<button type="button" role="tab" class="tr-fs-tab ' + p.tone + (k === i ? ' is-on' : '') + '" data-fs-page="' + k + '" aria-selected="' + (k === i) + '"><b>' + (k + 1) + '</b><span>' + esc(p.tab) + (p.badge ? '<em>' + esc(p.badge) + '</em>' : '') + '</span></button>').join('') + '</div>' +
      '<div class="tr-fs-body">' +
        '<div class="tr-fs-page">' + sheet(pg, i, st) +
          '<div class="tr-fs-tools"><label class="tr-fs-ink"><input type="checkbox" data-fs-ink' + (st.ink ? ' checked' : '') + '><span>Exemplu completat</span></label>' +
          '<button type="button" class="k-btn is-ghost is-sm" data-fs-zoom>Mărește pagina</button></div></div>' +
        '<div class="tr-fs-notes">' +
          '<div class="tr-fs-head"><small>Pagina ' + (i + 1) + ' din 5</small><h4>' + esc(pg.head) + '</h4><p>' + esc(pg.role) + '</p></div>' +
          '<ol>' + pg.notes.map((n, k) => '<li><button type="button" class="tr-fs-note' + (st.on === k ? ' is-on' : '') + '" data-fs-note="' + k + '"><span class="tr-fs-n">' + (k + 1) + '</span><span><b>' + esc(n.t) + '</b>' + esc(n.d) + '</span></button></li>').join('') + '</ol>' +
          (pg.next ? '<button type="button" class="tr-fs-next" data-fs-page="' + (i + 1) + '"><span>' + esc(pg.next) + '</span><b>›</b></button>' : '') +
        '</div>' +
      '</div>' +
      '<section class="tr-fs-check"><h4>Înainte de semnare, verifică</h4><ul>' + CHECK.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>' +
        '<div class="tr-fs-files"><a class="k-btn is-outline is-sm" href="/fise/program-recomandat-si-oferta.pdf" target="_blank" rel="noopener">Fișa (PDF)</a>' +
        '<a class="k-btn is-ghost is-sm" href="/fise/ghid-program-recomandat.pdf" target="_blank" rel="noopener">Ghidul (PDF)</a></div></section>' +
    '</div>';
  }

  // the page large, to read every line (a phone too: it scrolls sideways)
  function zoom(st) {
    const i = st.page;
    window.K.drawer({
      title: 'Pagina ' + (i + 1) + ' · ' + PAGES[i].head, icon: 'file', width: 980,
      body: '<div class="tr-fs-zoom">' + sheet(PAGES[i], i, Object.assign({}, st, { on: -1 }), true) + '</div>',
    });
  }

  function bind(root, st, repaint) {
    const box = root.querySelector('.tr-fisa');
    if (!box || box.__fs) return;
    box.__fs = true;
    const light = (k, from) => {
      st.on = st.on === k ? -1 : k;
      box.querySelectorAll('[data-fs-mark]').forEach((b) => b.classList.toggle('is-on', +b.dataset.fsMark === st.on));
      box.querySelectorAll('.tr-hl').forEach((h, n) => h.classList.toggle('is-on', n === st.on));
      box.querySelectorAll('[data-fs-note]').forEach((b) => b.classList.toggle('is-on', +b.dataset.fsNote === st.on));
      if (st.on < 0) return;
      // bring the other side into view when it isn't
      const target = from === 'note' ? box.querySelector('.tr-hl.is-on') : box.querySelector('[data-fs-note="' + st.on + '"]');
      if (!target) return;
      const r = target.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 20) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    box.addEventListener('click', (e) => {
      const p = e.target.closest('[data-fs-page]');
      if (p) { st.page = +p.dataset.fsPage; st.on = -1; repaint(); const t = root.querySelector('.tr-fs-flow'); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const m = e.target.closest('[data-fs-mark]');
      if (m) return light(+m.dataset.fsMark, 'mark');
      const n = e.target.closest('[data-fs-note]');
      if (n) return light(+n.dataset.fsNote, 'note');
      if (e.target.closest('[data-fs-zoom]')) zoom(st);
    });
    box.addEventListener('change', (e) => { if (e.target.matches('[data-fs-ink]')) { st.ink = e.target.checked; box.querySelectorAll('.tr-sheet').forEach((s) => s.classList.toggle('no-ink', !st.ink)); } });
    const tab = box.querySelector('.tr-fs-tab.is-on');
    if (tab && tab.scrollIntoView) { const fl = box.querySelector('.tr-fs-flow'); fl.scrollLeft = Math.max(0, tab.offsetLeft - 16); }
  }

  window.C360Fisa = { html, bind, pages: PAGES.length };
})();
