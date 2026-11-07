// Traininguri → Vânzări → Consultația: the "Program recomandat și ofertă" sheet, page by page, explained on
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
      say: ['„Pentru că începeți azi tot programul, aveți 50% reducere, cu plata integrală. Practic, plătiți jumătate.”'],
      tip: 'Cel mai bine e ca totul să se oprească aici. Paginile următoare sunt doar dacă ea spune că e prea mult.',
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
      next: 'Spune că e prea mult? Nu insiști. Iei pagina înapoi și treci firesc la pagina 3.',
    },
    {
      tab: '4 tranșe', badge: '-30%', head: 'Oferta 2 · pachet complet, plata în 4 tranșe', tone: 'is-b',
      role: 'A doua ofertă, doar dacă prima i s-a părut prea mult. Pagina 2 nu mai e pe masă.',
      say: ['„Înțeleg. Atunci ce putem face pentru dvs. este o reducere puțin mai mică, de 30%, și puteți achita în 4 tranșe, câte una la fiecare ședință.”'],
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
      next: 'Tot e greu pentru ea? Treci firesc la pagina 4.',
    },
    {
      tab: '½ integral', badge: '-50%', head: 'Oferta 3 · jumătate din pachet, plată integrală', tone: 'is-c',
      role: 'Jumătate din ședințele programului din pagina 1, cu aceeași reducere ca prima ofertă. Nu e un „pachet mai mic”: e un început.',
      say: ['„Înțeleg perfect. Atunci corect din partea noastră ar fi să vă oferim ocazia să puneți un picior pe ușă: începeți cu jumătate din program, tot cu 50% reducere.”', '„Așa vă obișnuiți cu noi și vedem împreună cum răspunde corpul dvs. la aparate.”'],
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
      next: 'Tot e greu pentru ea? Ultima variantă: pagina 5.',
    },
    {
      tab: '½ în tranșe', badge: '-30%', head: 'Oferta 4 · jumătate din pachet, plata în 4 tranșe', tone: 'is-d',
      role: 'Cea mai accesibilă ca sumă. Același început ca pe pagina 4, plătit în 4 tranșe.',
      say: ['„Și ca să fie cât mai ușor pentru dvs.: aceeași jumătate de program, cu 30% reducere, în 4 tranșe, câte una la fiecare ședință.”'],
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

  // the three client sheets (fise/fisa-client-*.pdf), the same way (the owner, 5.11): the example written in pen is
  // made up (a client, a date), the marks sit on the sheet's own sections; the pages lying sideways are marked land
  const CLIENT = {"corporale": [{"tab": "Pagina 1", "head": "Cine e clienta și ce vrea", "tone": "", "role": "Prima pagină. O completezi împreună cu clienta, la începutul consultației, înainte să vorbiți de tratamente.", "fills": [[75.5, 4.8, "0142"], [75.5, 6.9, "15.10.2026"], [75.5, 8.9, "Ioana"], [24.5, 15.2, "Andreea Pop"], [66.5, 15.2, "12.03.1990"], [24.5, 17.4, "0722 000 000"], [66.5, 17.4, "andreea@exemplu.ro"], [24.5, 20.1, "15.10.2026"], [66.5, 20.1, "Reclamă Facebook"], [61.93, 24.47, "✓", "is-box"], [31.26, 41.09, "✓", "is-box"], [46.3, 41.09, "✓", "is-box"], [43.7, 43.23, "✓", "is-box"], [24.5, 45.7, "20-27.12, concediu"], [9.2, 33.9, "Grăsime pe abdomen după sarcină. A încercat diete, fără rezultat."], [87.94, 54.72, "✓", "is-box"], [87.94, 57.04, "✓", "is-box"], [87.94, 59.35, "✓", "is-box"], [87.94, 61.67, "✓", "is-box"], [87.94, 63.98, "✓", "is-box"], [87.94, 66.42, "✓", "is-box"], [87.94, 68.74, "✓", "is-box"], [87.94, 71.05, "✓", "is-box"], [87.94, 73.37, "✓", "is-box"], [87.94, 75.68, "✓", "is-box"], [87.94, 78.0, "✓", "is-box"], [87.94, 80.31, "✓", "is-box"]], "notes": [{"box": [4.6, 7.2], "t": "Sus, în colț", "d": "Numărul fișei, data de azi și numele tău la „Specialist”."}, {"box": [12.0, 14.7], "t": "Cine este ea", "d": "Numele, data nașterii, telefonul și e-mailul. „Data primei vizite” e azi. O întrebi: „De unde ați aflat de noi?”. Dacă are sub 18 ani, bifezi „da” și un părinte completează pagina 3."}, {"box": [26.8, 9.8], "t": "De ce a venit", "d": "O întrebi: „Ce vă deranjează?” și „Ce ați încercat până acum?”. Scrii cu cuvintele ei: zonele, dietele, procedurile, suplimentele."}, {"box": [36.8, 11.2], "t": "Când poate veni", "d": "Bifezi zilele și orele care îi convin. Scrii când nu poate (concediu, plecări). Așa îi faci programările repede."}, {"box": [48.2, 41.3], "t": "Sănătatea ei", "d": "Îi citești fiecare întrebare și bifezi „Da” sau „Nu”. Dacă e un singur „Da”: scrii detaliile jos și nu începi tratamentul până nu întrebi dacă se poate face."}], "next": "Gata? Întoarce foaia: pagina 2."}, {"tab": "Pagina 2", "head": "Corpul ei, măsurat", "tone": "", "role": "Aici scrii cum arată corpul ei azi. Peste câteva ședințe măsori din nou și îi arăți cât a progresat.", "fills": [[24.5, 7.8, "abdomen mai plat"], [66.5, 7.8, "mers pe jos, 2×/săpt."], [24.5, 10.6, "68"], [66.5, 10.6, "165"], [24.5, 12.7, "25"], [66.5, 12.7, "birou, stă mult jos"], [24.5, 19.3, "32"], [66.5, 19.3, "7"], [24.5, 22.7, "43"], [66.5, 22.7, "50"], [24.5, 25.4, "3"], [66.5, 25.4, "1,5"], [24.5, 28.1, "7"], [66.5, 28.1, "nu / rar"], [29.9, 37.0, "78"], [29.9, 39.1, "86"], [29.9, 41.2, "92"], [29.9, 43.4, "102"], [29.9, 45.5, "58"], [29.9, 47.6, "58"], [87.94, 61.07, "✓", "is-box"], [87.94, 63.39, "✓", "is-box"], [87.94, 65.71, "✓", "is-box"], [87.94, 68.02, "✓", "is-box"], [87.94, 70.34, "✓", "is-box"], [87.94, 72.65, "✓", "is-box"], [87.94, 74.97, "✓", "is-box"], [9.2, 81.7, "Piele elastică, grăsime moale pe abdomen. Recomand programul pentru abdomen."]], "notes": [{"box": [4.0, 11.2], "t": "Ce vrea și cât cântărește", "d": "Obiectivul ei, cât se mișcă, greutatea și înălțimea. IMC = greutatea împărțită la (înălțimea în metri × înălțimea în metri). Exemplu: 68 ÷ (1,65 × 1,65) = 25."}, {"box": [15.4, 15.8], "t": "Cântarul și obiceiurile", "d": "Grăsimea, mușchii și apa le copiezi de pe cântarul de analiză corporală. Apoi o întrebi: câte mese pe zi, câtă apă bea, cât doarme, dacă fumează."}, {"box": [31.5, 23.0], "t": "Centimetrul", "d": "Măsori cu centimetrul fiecare zonă și scrii la „Inițial”. Măsori din nou la ședința 5, la ședința 10 și la final. La „Diferență” scrii câți cm a dat jos. Asta o bucură cel mai mult!"}, {"box": [54.6, 22.6], "t": "Întrebări pentru corp", "d": "La fel ca pe pagina 1: citești, bifezi „Da” sau „Nu”. Un singur „Da” = nu începi până nu întrebi dacă se poate."}, {"box": [77.4, 12.1], "t": "Ce vezi tu", "d": "Ce observi la ea și ce îi recomanzi. Apoi treci la fișa „Program recomandat și ofertă”."}], "next": "Mai departe: pagina 3, acordul ei."}, {"tab": "Pagina 3", "head": "Acordul și semnăturile", "tone": "", "role": "Pagina pe care clienta își dă acordul. O citește ea, tu îi explici.", "fills": [[8.15, 18.29, "✓", "is-box"], [8.15, 21.67, "✓", "is-box"], [8.7, 49.0, "15.10.2026"], [25.7, 49.0, "abdomen"], [51.0, 49.0, "față, profil"], [72.2, 49.0, "IMG_0142"], [24.5, 83.7, "A. Pop", "is-sig"], [66.5, 83.7, "Ioana", "is-sig"], [24.5, 86.7, "15.10.2026"], [66.5, 86.7, "Ioana"]], "notes": [{"box": [4.0, 21.0], "t": "Acordul ei", "d": "Îi dai foaia să citească. Bifează ea ce vrea: poze pentru evidență, poze pentru reclamă (fără față), mesaje pentru programări, oferte. Ce nu bifează, nu facem."}, {"box": [25.2, 18.2], "t": "Ce face înainte și după", "d": "I le spui pe scurt, cu voce tare. Sunt sfaturile care o ajută să aibă rezultate bune și pielea liniștită."}, {"box": [43.6, 12.4], "t": "Pozele", "d": "Ori de câte ori faci poze: data, zona, din ce parte (față, profil) și numele fișierului. Faci poze doar dacă a bifat acordul de sus."}, {"box": [63.9, 14.4], "t": "Doar sub 18 ani", "d": "Dacă are sub 18 ani, un părinte scrie aici numele, telefonul și semnează. Dacă e adultă, lași gol."}, {"box": [78.5, 11.0], "t": "Semnăturile", "d": "Semnează ea, semnezi tu. Scrii data și numele tău. Fără semnături, fișa nu e gata."}], "next": "Ultima pagină: ședințele."}, {"tab": "Pagina 4", "land": 1, "head": "Ședințele, una câte una", "tone": "", "role": "Foaia care se completează la fiecare ședință, de la prima până la ultima.", "fills": [[8.8, 11.0, "Andreea Pop"], [34.3, 11.0, "8"], [52, 11.0, "15.10.2026"], [5.6, 18.0, "15.10.2026"], [14.5, 18.0, "1"], [18.1, 18.0, "Cavitație"], [30.2, 18.0, "abdomen"], [56.5, 18.0, "45 min"], [62.2, 18.0, "ușor roșu, ok"], [77.7, 18.0, "Ioana"], [86.8, 18.0, "A. Pop", "is-sig"]], "notes": [{"box": [4.5, 9.1], "t": "Sus", "d": "Numele ei, câte ședințe are în pachet și data primei ședințe."}, {"box": [13.8, 74.2], "t": "La fiecare ședință", "d": "O linie nouă de fiecare dată: data, a câta ședință e, procedura, zona, aparatul și setările, cât a durat și cum a reacționat pielea. La final semnezi tu și semnează ea."}], "next": ""}], "faciale": [{"tab": "Pagina 1", "head": "Cine e clienta și ce vrea", "tone": "", "role": "Prima pagină. O completezi împreună cu clienta, la începutul consultației, înainte să vorbiți de tratamente.", "fills": [[75.5, 4.8, "0142"], [75.5, 6.9, "15.10.2026"], [75.5, 8.9, "Ioana"], [24.5, 15.2, "Maria Ionescu"], [66.5, 15.2, "04.07.1985"], [24.5, 17.4, "0722 000 000"], [66.5, 17.4, "maria@exemplu.ro"], [24.5, 20.1, "15.10.2026"], [66.5, 20.1, "Instagram"], [61.93, 24.47, "✓", "is-box"], [31.26, 42.52, "✓", "is-box"], [46.3, 42.52, "✓", "is-box"], [43.7, 44.66, "✓", "is-box"], [24.5, 47.2, "20-27.12, concediu"], [9.2, 34.6, "Pete pe pomeți și riduri fine. Peeling acum 2 ani."], [87.94, 56.15, "✓", "is-box"], [87.94, 58.46, "✓", "is-box"], [87.94, 60.78, "✓", "is-box"], [87.94, 63.09, "✓", "is-box"], [87.94, 65.41, "✓", "is-box"], [87.94, 67.84, "✓", "is-box"], [87.94, 70.16, "✓", "is-box"], [87.94, 72.48, "✓", "is-box"], [87.94, 74.79, "✓", "is-box"], [87.94, 77.11, "✓", "is-box"], [87.94, 79.42, "✓", "is-box"]], "notes": [{"box": [4.6, 7.2], "t": "Sus, în colț", "d": "Numărul fișei, data de azi și numele tău la „Specialist”."}, {"box": [12.0, 14.7], "t": "Cine este ea", "d": "Numele, data nașterii, telefonul și e-mailul. „Data primei vizite” e azi. O întrebi: „De unde ați aflat de noi?”. Dacă are sub 18 ani, bifezi „da” și un părinte completează pagina 3."}, {"box": [26.8, 11.2], "t": "De ce a venit", "d": "O întrebi: „Ce vă deranjează la ten?” și „Ce tratamente ați mai făcut și când?” (peeling, filler, botox, laser). Scrii cu cuvintele ei."}, {"box": [38.2, 11.2], "t": "Când poate veni", "d": "Bifezi zilele și orele care îi convin. Scrii când nu poate (concediu, plecări). Așa îi faci programările repede."}, {"box": [49.6, 39.9], "t": "Sănătatea ei", "d": "Îi citești fiecare întrebare și bifezi „Da” sau „Nu”. Dacă e un singur „Da”: scrii detaliile jos și nu începi tratamentul până nu întrebi dacă se poate face."}], "next": "Gata? Întoarce foaia: pagina 2."}, {"tab": "Pagina 2", "head": "Tenul ei", "tone": "", "role": "Aici te uiți atent la pielea ei, afli ce face acasă și scrii ce îi recomanzi.", "fills": [[37.73, 8.25, "✓", "is-box"], [32.44, 10.39, "✓", "is-box"], [43.61, 10.39, "✓", "is-box"], [32.18, 12.53, "✓", "is-box"], [34.62, 15.2, "✓", "is-box"], [24.5, 20.8, "gel de curățare"], [66.5, 20.8, "cremă hidratantă"], [24.5, 22.9, "nimic"], [66.5, 22.9, "nu folosește"], [24.5, 29.6, "nu"], [66.5, 29.6, "vara, mult"], [24.5, 26.9, "1"], [66.5, 26.9, "6"], [8.7, 37.6, "Microneedling"], [37.5, 37.6, "față"], [64.6, 37.6, "3"], [78.9, 37.6, "4 săpt."], [87.94, 54.84, "✓", "is-box"], [87.94, 57.16, "✓", "is-box"], [87.94, 59.47, "✓", "is-box"], [87.94, 61.79, "✓", "is-box"], [87.94, 64.1, "✓", "is-box"], [87.94, 66.42, "✓", "is-box"], [87.94, 68.74, "✓", "is-box"], [87.94, 71.05, "✓", "is-box"], [87.94, 73.37, "✓", "is-box"], [9.2, 80.1, "Pete pe pomeți, nu pune SPF zilnic. Îi recomand SPF 50 în fiecare dimineață."]], "notes": [{"box": [4.0, 13.3], "t": "Cum e pielea ei", "d": "Te uiți la ten și bifezi ce tip e și ce probleme are. Fototipul arată cât de deschisă e pielea: I = foarte albă, se arde mereu; VI = foarte închisă. Apoi o întrebi dacă pune cremă cu SPF în fiecare zi."}, {"box": [17.5, 14.6], "t": "Ce face acasă", "d": "O întrebi cu ce se spală pe față, cu ce se hidratează, dacă folosește retinol sau acizi și ce SPF. Apoi: câtă apă bea, cât doarme, dacă fumează, cât stă la soare."}, {"box": [32.3, 15.8], "t": "Ce îi recomanzi", "d": "Procedura, zona, câte ședințe și la ce interval. Numărul de ședințe și intervalul le iei din schema tratamentului."}, {"box": [48.3, 27.3], "t": "Întrebări pentru față", "d": "Citești, bifezi „Da” sau „Nu”. Un singur „Da” = nu începi până nu întrebi dacă se poate."}, {"box": [75.8, 13.7], "t": "Ce vezi tu", "d": "Ce observi la tenul ei și ce sfat îi dai pentru acasă. Apoi treci la fișa „Program recomandat și ofertă”."}], "next": "Mai departe: pagina 3, acordul ei."}, {"tab": "Pagina 3", "head": "Acordul și semnăturile", "tone": "", "role": "Pagina pe care clienta își dă acordul. O citește ea, tu îi explici.", "fills": [[8.15, 18.29, "✓", "is-box"], [8.15, 21.67, "✓", "is-box"], [8.7, 50.3, "15.10.2026"], [25.7, 50.3, "față"], [51.0, 50.3, "față, profil"], [72.2, 50.3, "IMG_0143"], [24.5, 82.3, "M. I.", "is-sig"], [66.5, 82.4, "Ioana", "is-sig"], [24.5, 85.4, "15.10.2026"], [66.5, 85.4, "Ioana"]], "notes": [{"box": [4.0, 21.0], "t": "Acordul ei", "d": "Îi dai foaia să citească. Bifează ea ce vrea: poze pentru evidență, poze pentru reclamă (fără față), mesaje pentru programări, oferte. Ce nu bifează, nu facem."}, {"box": [25.2, 19.6], "t": "Ce face înainte și după", "d": "I le spui pe scurt, cu voce tare. Sunt sfaturile care o ajută să aibă rezultate bune și pielea liniștită."}, {"box": [45.0, 10.4], "t": "Pozele", "d": "Ori de câte ori faci poze: data, zona, din ce parte (față, profil) și numele fișierului. Faci poze doar dacă a bifat acordul de sus."}, {"box": [62.3, 14.6], "t": "Doar sub 18 ani", "d": "Dacă are sub 18 ani, un părinte scrie aici numele, telefonul și semnează. Dacă e adultă, lași gol."}, {"box": [77.1, 12.4], "t": "Semnăturile", "d": "Semnează ea, semnezi tu. Scrii data și numele tău. Fără semnături, fișa nu e gata."}], "next": "Ultima pagină: ședințele."}, {"tab": "Pagina 4", "land": 1, "head": "Ședințele, una câte una", "tone": "", "role": "Foaia care se completează la fiecare ședință, de la prima până la ultima.", "fills": [[8.8, 11.0, "Maria Ionescu"], [34.3, 11.0, "3"], [52, 11.0, "15.10.2026"], [5.6, 18.0, "15.10.2026"], [14.4, 18.0, "1"], [17.9, 18.0, "Microneedling"], [46.1, 18.0, "60 min"], [51.7, 18.0, "roșeață ușoară"], [66.1, 18.0, "SPF 50"], [79.7, 18.0, "Ioana"], [87.8, 18.0, "M. I.", "is-sig"]], "notes": [{"box": [4.5, 9.1], "t": "Sus", "d": "Numele ei, câte ședințe are în pachet și data primei ședințe."}, {"box": [13.8, 74.2], "t": "La fiecare ședință", "d": "O linie nouă de fiecare dată: data, a câta ședință e, procedura, produsele folosite, cât a durat, cum a reacționat pielea și ce îi spui să facă acasă. La final semnezi tu și semnează ea."}], "next": ""}], "epilare": [{"tab": "Pagina 1", "head": "Cine e clienta și ce vrea", "tone": "", "role": "Prima pagină. O completezi împreună cu clienta, la începutul consultației, înainte să vorbiți de tratamente.", "fills": [[75.5, 4.8, "0142"], [75.5, 6.9, "15.10.2026"], [75.5, 8.9, "Ioana"], [24.5, 15.2, "Elena Dinu"], [66.5, 15.2, "21.11.1994"], [24.5, 17.4, "0722 000 000"], [66.5, 17.4, "elena@exemplu.ro"], [24.5, 20.1, "15.10.2026"], [66.5, 20.1, "Recomandare"], [61.93, 24.47, "✓", "is-box"], [31.26, 43.94, "✓", "is-box"], [46.3, 43.94, "✓", "is-box"], [43.7, 46.08, "✓", "is-box"], [24.5, 48.5, "20-27.12, concediu"], [9.2, 33.0, "axilă, picioare complet"], [24.5, 35.7, "ceară"], [66.5, 35.7, "01.10.2026"], [87.94, 57.57, "✓", "is-box"], [87.94, 59.89, "✓", "is-box"], [87.94, 62.2, "✓", "is-box"], [87.94, 64.52, "✓", "is-box"], [87.94, 66.83, "✓", "is-box"], [87.94, 69.15, "✓", "is-box"], [87.94, 71.47, "✓", "is-box"], [87.94, 73.78, "✓", "is-box"], [87.94, 76.22, "✓", "is-box"], [87.94, 78.53, "✓", "is-box"], [87.94, 80.85, "✓", "is-box"]], "notes": [{"box": [4.6, 7.0], "t": "Sus, în colț", "d": "Numărul fișei, data de azi și numele tău la „Specialist”."}, {"box": [11.8, 14.6], "t": "Cine este ea", "d": "Numele, data nașterii, telefonul și e-mailul. „Data primei vizite” e azi. O întrebi: „De unde ați aflat de noi?”. Dacă are sub 18 ani, bifezi „da” și un părinte completează pagina 3."}, {"box": [26.6, 12.6], "t": "Ce vrea să epileze", "d": "Zonele pe care le vrea. O întrebi cum s-a epilat până acum și când ultima dată. Dacă a folosit ceară sau pensetă de curând, laserul mai așteaptă: firul trebuie să fie în piele."}, {"box": [39.4, 11.3], "t": "Când poate veni", "d": "Bifezi zilele și orele care îi convin. Scrii când nu poate (concediu, plecări). Așa îi faci programările repede."}, {"box": [50.9, 38.6], "t": "Sănătatea ei", "d": "Îi citești fiecare întrebare și bifezi „Da” sau „Nu”. Dacă e un singur „Da”: scrii detaliile jos și nu începi tratamentul până nu întrebi dacă se poate face."}], "next": "Gata? Întoarce foaia: pagina 2."}, {"tab": "Pagina 2", "head": "Pielea și firul de păr", "tone": "", "role": "Laserul vede culoarea firului. De aceea te uiți atent la piele și la păr înainte de orice.", "fills": [[32.18, 8.25, "✓", "is-box"], [25.46, 10.39, "✓", "is-box"], [37.39, 12.53, "✓", "is-box"], [30.08, 14.55, "✓", "is-box"], [32.86, 16.69, "✓", "is-box"], [11.3, 23.7, "axilă"], [37.5, 23.7, "6-8"], [52.7, 23.7, "normală"], [11.3, 25.7, "picioare complet"], [37.5, 25.7, "6-8"], [52.7, 25.7, "mare"], [87.94, 52.76, "✓", "is-box"], [87.94, 55.08, "✓", "is-box"], [87.94, 57.39, "✓", "is-box"], [87.94, 59.71, "✓", "is-box"], [87.94, 62.02, "✓", "is-box"], [87.94, 64.34, "✓", "is-box"], [87.94, 66.66, "✓", "is-box"], [87.94, 68.97, "✓", "is-box"], [87.94, 71.29, "✓", "is-box"], [9.2, 78.0, "Fir negru și gros, piele deschisă: rezultate foarte bune. Test la prima ședință."]], "notes": [{"box": [3.8, 14.5], "t": "Pielea și firul", "d": "Bifezi: cât de deschisă e pielea (fototip I = foarte albă, VI = foarte închisă), ce culoare are firul, cât e de gros, cât de des crește și ce tip de piele are. Firul negru pe piele deschisă iese cel mai bine. Firul blond, alb sau roșcat iese greu: îi spui sincer."}, {"box": [18.5, 27.4], "t": "Zonele", "d": "Pe fiecare rând o zonă: câte ședințe crezi că îi trebuie (de obicei 6-8), cât de sensibilă e acolo și ce observi."}, {"box": [46.1, 27.4], "t": "Întrebări pentru laser", "d": "Citești, bifezi „Da” sau „Nu”. Foarte important: soarele și solarul din ultimele 4 săptămâni. Un singur „Da” = nu începi până nu întrebi dacă se poate."}, {"box": [73.7, 15.8], "t": "Ce vezi tu", "d": "Ce observi la piele și la fir și ce îi recomanzi."}], "next": "Mai departe: pagina 3, acordul ei."}, {"tab": "Pagina 3", "head": "Acordul și semnăturile", "tone": "", "role": "Pagina pe care clienta își dă acordul. O citește ea, tu îi explici.", "fills": [[8.15, 18.29, "✓", "is-box"], [8.15, 21.67, "✓", "is-box"], [8.7, 50.3, "15.10.2026"], [23.1, 50.3, "axilă"], [61.2, 50.3, "ok, ușor roșu"], [81.5, 50.3, "Ioana"], [24.5, 82.3, "E. Dinu", "is-sig"], [66.5, 82.4, "Ioana", "is-sig"], [24.5, 85.4, "15.10.2026"], [66.5, 85.4, "Ioana"]], "notes": [{"box": [3.8, 21.2], "t": "Acordul ei", "d": "Îi dai foaia să citească. Bifează ea ce vrea: poze pentru evidență, poze pentru reclamă (fără față), mesaje pentru programări, oferte. Ce nu bifează, nu facem."}, {"box": [25.2, 19.5], "t": "Ce face înainte și după", "d": "I le spui pe scurt, cu voce tare. Sunt sfaturile care o ajută să aibă rezultate bune și pielea liniștită."}, {"box": [44.9, 10.5], "t": "Testul de probă", "d": "La prima ședință încerci laserul pe o bucățică mică de piele. Scrii data, zona și setările. A doua zi o întrebi cum arată pielea și scrii la „Reacție după 24 h”."}, {"box": [62.1, 14.6], "t": "Doar sub 18 ani", "d": "Dacă are sub 18 ani, un părinte scrie aici numele, telefonul și semnează. Dacă e adultă, lași gol."}, {"box": [76.9, 12.6], "t": "Semnăturile", "d": "Semnează ea, semnezi tu. Scrii data și numele tău. Fără semnături, fișa nu e gata."}], "next": "Ultima pagină: ședințele."}, {"tab": "Pagina 4", "head": "Despre aparat", "tone": "", "role": "Pagina asta e pentru clientă. I-o arăți și îi explici pe scurt, cu cuvintele tale.", "fills": [], "notes": [{"box": [4.1, 29.8], "t": "Cum merge laserul", "d": "Lumina laserului intră în fir și se face căldură. Căldura oprește rădăcina firului. Firul crește pe rând, nu toate deodată, de aceea e nevoie de mai multe ședințe."}, {"box": [34.1, 10.5], "t": "De ce e bun aparatul", "d": "Răcește pielea, deci doare puțin. Merge pe orice culoare de piele. E aparat medical certificat."}, {"box": [44.8, 20.0], "t": "Când vine din nou", "d": "Prima ședință azi, apoi la 6, 6, 8, 8 și 8-10 săptămâni. Îi spui: dacă vine la timp, după 5 ședințe aproape toate firele au dispărut, în majoritatea cazurilor."}, {"box": [65.0, 24.5], "t": "Ce întreabă clientele", "d": "Doare? De câte ședințe e nevoie? Merge pe părul blond? Se poate vara? Răspunsurile sunt aici. Citește-le de două ori, ca să le știi pe de rost."}], "next": "Ultima pagină: ședințele."}, {"tab": "Pagina 5", "land": 1, "head": "Ședințele, una câte una", "tone": "", "role": "Foaia care se completează la fiecare ședință. Aici scrii și setările aparatului.", "fills": [[8.8, 11.0, "Elena Dinu"], [34.3, 11.0, "8"], [52, 11.0, "15.10.2026"], [5.6, 17.8, "15.10.2026"], [14.4, 17.8, "1"], [17.3, 17.8, "axilă"], [28.8, 17.8, "Elysion Pro"], [64.3, 17.8, "ok"], [77.9, 17.8, "Ioana"], [86.9, 17.8, "E. Dinu", "is-sig"]], "notes": [{"box": [4.5, 9.1], "t": "Sus", "d": "Numele ei, câte ședințe are în pachet și data primei ședințe."}, {"box": [13.8, 74.2], "t": "La fiecare ședință", "d": "O linie nouă de fiecare dată: data, a câta ședință e, zona și setările de pe ecranul aparatului (lungimea de undă, fluența, pulsul, spotul și răcirea). Apoi cum a reacționat pielea. Semnezi tu, semnează ea."}], "next": ""}]};
  const CCHECK = {
    corporale: ['Pagina 1 și pagina 2 sunt completate, rubrică cu rubrică.', 'Fiecare întrebare de sănătate are „Da” sau „Nu”. La un „Da” ai întrebat dacă se poate, înainte de tratament.', 'Ai măsurat cu centimetrul și ai scris la „Inițial”.', 'Ea a bifat acordurile pe care le vrea și a semnat. Ai semnat și tu.', 'Pozele „înainte” le faci doar dacă a bifat acordul.', 'La fiecare ședință completezi o linie pe pagina 4.'],
    faciale: ['Pagina 1 și pagina 2 sunt completate, rubrică cu rubrică.', 'Fiecare întrebare de sănătate are „Da” sau „Nu”. La un „Da” ai întrebat dacă se poate, înainte de tratament.', 'Ai scris planul: procedura, ședințele și intervalul.', 'Ea a bifat acordurile pe care le vrea și a semnat. Ai semnat și tu.', 'Pozele „înainte” le faci doar dacă a bifat acordul.', 'La fiecare ședință completezi o linie pe pagina 4.'],
    epilare: ['Pagina 1 și pagina 2 sunt completate, rubrică cu rubrică.', 'Fiecare întrebare are „Da” sau „Nu”. Mai ales soarele și ceara din ultimele 4 săptămâni.', 'Ai bifat fototipul și firul. Dacă firul e blond, alb sau roșcat, i-ai spus sincer.', 'Ea a bifat acordurile pe care le vrea și a semnat. Ai semnat și tu.', 'La prima ședință ai făcut testul de probă.', 'La fiecare ședință scrii setările aparatului pe pagina 5.'],
  };
  const SHEETS = [
    { id: 'corporale', kind: 'Fișa clientei', title: 'Corp', sub: 'Remodelare, slăbire, celulită', icon: 'flame', hue: 'a', pages: CLIENT.corporale, check: CCHECK.corporale, pdf: '/fise/fisa-client-proceduri-corporale.pdf' },
    { id: 'faciale', kind: 'Fișa clientei', title: 'Față', sub: 'Ten, pete, riduri', icon: 'sparkles', hue: 'b', pages: CLIENT.faciale, check: CCHECK.faciale, pdf: '/fise/fisa-client-proceduri-faciale.pdf' },
    { id: 'epilare', kind: 'Fișa clientei', title: 'Epilare laser', sub: 'Piele, fir, zone', icon: 'sun', hue: 'c', pages: CLIENT.epilare, check: CCHECK.epilare, pdf: '/fise/fisa-client-epilare-laser.pdf' },
    { id: 'program', kind: 'După fișă', title: 'Programul și oferta', sub: 'Ce îi recomanzi și cât costă', icon: 'wallet', hue: 'd', pages: PAGES, check: CHECK, pdf: '/fise/program-recomandat-si-oferta.pdf', guide: '/fise/ghid-program-recomandat.pdf', checkHead: 'Înainte de semnare, verifică' },
  ];
  const cur = (st) => SHEETS.find((x) => x.id === st.sheet) || SHEETS[0];
  const img = (S, i) => '/academy-fisa/' + (S.id === 'program' ? '' : S.id + '-') + 'p' + (i + 1) + '.webp';

  const sheet = (pg, i, st, big, S) => '<div class="tr-sheet' + (pg.land ? ' is-land' : '') + (st.ink ? '' : ' no-ink') + (big ? ' is-big' : '') + '" style="background-image:url(' + img(S || cur(st), i) + ')" role="img" aria-label="Pagina ' + (i + 1) + ' din fișă">' +
    pg.fills.map(([x, y, t, cls]) => '<span class="tr-ink' + (cls ? ' ' + cls : '') + '" style="left:' + x + '%;top:' + y + '%">' + esc(t) + '</span>').join('') +
    pg.notes.map((n, k) => '<span class="tr-hl' + (st.on === k ? ' is-on' : '') + '" style="left:' + BOX_X + '%;top:' + n.box[0] + '%;width:' + BOX_W + '%;height:' + n.box[1] + '%"></span>' +
      '<button type="button" class="tr-mark' + (st.on === k ? ' is-on' : '') + '" data-fs-mark="' + k + '" style="top:' + (n.box[0] + 0.6) + '%" aria-label="' + esc(n.t) + '">' + (k + 1) + '</button>').join('') +
    '</div>';

  const icon = (n) => (window.K && window.K.icon ? window.K.icon(n) : '');

  // the training films (academy-vsl/<id>.mp4, made with academy-vsl/src): the ones that exist, with their length.
  // C360Vsl.html(id, title, soon) → the player, or `soon` (the "Vine în curând" card) when the film is not made yet
  const VSL = { parcurs: '9 min' };
  window.C360Vsl = {
    has: (id) => !!VSL[id],
    html: (id, title, soon) => (VSL[id] ? '<figure class="tr-vsl is-on"><video src="/academy-vsl/' + id + '.mp4" poster="/academy-vsl/' + id + '.webp" controls playsinline preload="none"></video>' +
      '<figcaption><b>' + esc(title) + '</b><span>' + VSL[id] + ' · explicat de Nuki, cu exemple</span></figcaption></figure>' : soon),
  };
  // "Vreau să învăț": the four sheets of a consultation, in the order they are filled in
  const picker = (st, big) => '<div class="tr-fpick' + (big ? ' is-big' : '') + '"><div class="tr-fpick-l">Vreau să învăț:</div><div class="tr-fpick-row" role="tablist">' +
    SHEETS.map((S, k) => '<button type="button" role="tab" aria-selected="' + (!big && S === cur(st)) + '" class="tr-fpick-c is-' + S.hue + (!big && S === cur(st) ? ' is-on' : '') + '" data-fs-sheet="' + S.id + '" style="--k:' + k + '">' +
      '<span class="tr-fpick-ic">' + icon(S.icon) + '</span><small>' + esc(S.kind) + '</small><b>' + esc(S.title) + '</b><span class="tr-fpick-s">' + esc(S.sub) + '</span>' +
      '<span class="tr-fpick-n">' + S.pages.length + ' pagini</span></button>').join('') + '</div></div>';

  function html(st) {
    if (!st.chosen) return '<div class="tr-fisa is-pick">' + picker(st, true) + '</div>';
    const S = cur(st), PG = S.pages;
    if (!(st.page >= 0 && st.page < PG.length)) st.page = 0;
    const i = st.page, pg = PG[i];
    return '<div class="tr-fisa">' +
      '<div class="tr-fs-top"><button type="button" class="k-btn is-ghost is-sm" data-fs-back>' + icon('left') + 'Toate fișele</button>' +
        '<span class="tr-fs-who is-' + S.hue + '"><i>' + icon(S.icon) + '</i><b>' + esc(S.kind + ' · ' + S.title) + '</b></span></div>' +
      window.C360Vsl.html('fisa-' + S.id, 'Filmulețul: ' + (S.id === 'program' ? S.title : S.kind + ' · ' + S.title), '<div class="tr-vsl"><span class="tr-vsl-play">' + icon('video') + '</span><div><b>Filmulețul: ' + esc(S.title) + '</b><span>Totul explicat pe înțeles, cu exemple. Vine în curând.</span></div></div>') +
      '<div class="tr-fs-flow" role="tablist">' + PG.map((p, k) => (k ? '<span class="tr-fs-arrow" aria-hidden="true">›</span>' : '') +
        '<button type="button" role="tab" class="tr-fs-tab ' + p.tone + (k === i ? ' is-on' : '') + '" data-fs-page="' + k + '" aria-selected="' + (k === i) + '"><b>' + (k + 1) + '</b><span>' + esc(p.tab) + (p.badge ? '<em>' + esc(p.badge) + '</em>' : '') + '</span></button>').join('') + '</div>' +
      '<div class="tr-fs-body">' +
        '<div class="tr-fs-page">' + sheet(pg, i, st, false, S) +
          '<div class="tr-fs-tools"><label class="tr-fs-ink"><input type="checkbox" data-fs-ink' + (st.ink ? ' checked' : '') + '><span>Exemplu completat</span></label>' +
          '<button type="button" class="k-btn is-ghost is-sm" data-fs-zoom>Mărește pagina</button></div></div>' +
        '<div class="tr-fs-notes">' +
          '<div class="tr-fs-head"><small>' + esc(S.kind + ' · ' + S.title) + ' · pagina ' + (i + 1) + ' din ' + PG.length + '</small><h4>' + esc(pg.head) + '</h4><p>' + esc(pg.role) + '</p></div>' +
          (pg.say ? '<div class="tr-fs-say"><b>Cum o spui</b>' + pg.say.map((q) => '<blockquote>' + esc(q) + '</blockquote>').join('') +
            '<small>Ca într-o conversație: o asculți, o înțelegi, îi propui. Nu sună niciodată a „reducere de ultim moment”.</small>' + (pg.tip ? '<p class="tr-fs-tip">' + esc(pg.tip) + '</p>' : '') + '</div>' : '') +
          '<ol>' + pg.notes.map((n, k) => '<li><button type="button" class="tr-fs-note' + (st.on === k ? ' is-on' : '') + '" data-fs-note="' + k + '"><span class="tr-fs-n">' + (k + 1) + '</span><span><b>' + esc(n.t) + '</b>' + esc(n.d) + '</span></button></li>').join('') + '</ol>' +
          (pg.next ? '<button type="button" class="tr-fs-next" data-fs-page="' + (i + 1) + '"><span>' + esc(pg.next) + '</span><b>›</b></button>' : '') +
        '</div>' +
      '</div>' +
      '<section class="tr-fs-check"><h4>' + esc(S.checkHead || 'La final, verifică') + '</h4><ul>' + S.check.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>' +
        '<div class="tr-fs-files"><a class="k-btn is-outline is-sm" href="' + S.pdf + '" target="_blank" rel="noopener">Fișa (PDF)</a>' +
        (S.guide ? '<a class="k-btn is-ghost is-sm" href="' + S.guide + '" target="_blank" rel="noopener">Ghidul (PDF)</a>' : '') + '</div></section>' +
    '</div>';
  }

  // the page large, to read every line (a phone too: it scrolls sideways)
  function zoom(st) {
    const i = st.page, S = cur(st), pg = S.pages[i];
    window.K.drawer({
      title: 'Pagina ' + (i + 1) + ' · ' + pg.head, icon: 'file', width: pg.land ? 1200 : 980,
      body: '<div class="tr-fs-zoom">' + sheet(pg, i, Object.assign({}, st, { on: -1 }), true, S) + '</div>',
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
      const sh = e.target.closest('[data-fs-sheet]');
      if (sh) { st.sheet = sh.dataset.fsSheet; st.page = 0; st.on = -1; st.chosen = true; repaint(); const t = root.querySelector('.tr-fisa'); if (t && t.getBoundingClientRect().top < 0) t.scrollIntoView({ block: 'start' }); return; }
      if (e.target.closest('[data-fs-back]')) { st.chosen = false; st.on = -1; repaint(); return; }
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

  window.C360Fisa = { html, bind, pages: PAGES.length, sheets: SHEETS.map((x) => x.id) };
})();
