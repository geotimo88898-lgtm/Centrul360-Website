#!/usr/bin/env python3
"""The script of the "Programul recomandat și oferta" film: page 1 (the program) and the four offers, said as one
natural conversation (the owner's exact lines). The example in pen keeps no prices (they change in Admin), no
client name: only treatments, sessions, percentages, dates and ticks.  python3 program.py"""
import json, os
from fise import B

HERE = os.path.dirname(os.path.abspath(__file__))
DAY = '15.10.2026'
SCHED = [['Liposonix, cavitație, EMS, împachetare', '16.10.2026', '10:00'], ['Cavitație, EMS, împachetare', '23.10.2026', '10:00'],
         ['Liposonix, cavitație, EMS, împachetare', '30.10.2026', '10:00'], ['Cavitație, EMS, împachetare', '06.11.2026', '10:00']]


def sched(rows, tops, at):
    return [x for i, r in enumerate(rows) for x in ([17.6, tops[i], r[0], '', at], [53, tops[i], r[1], '', at], [76.6, tops[i], r[2], '', at])]


def sign(t1, t2, at):
    return [[24.5, t1, 'semnat', 'is-sig', at], [66.5, t1, 'semnat', 'is-sig', at], [24.5, t2, DAY, '', at]]


def half(top, at):
    rows = [['Cavitație · abdomen', '8', '4'], ['EMS · abdomen', '8', '4'], ['Împachetare · abdomen', '8', '4'], ['Liposonix · abdomen', '6', '3']]
    return [x for i, r in enumerate(rows) for x in ([9, top + i * 2.1, r[0], '', at], [41, top + i * 2.1, r[1], '', at], [54, top + i * 2.1, r[2], '', at])]


def tranches(tops, at):
    return [x for i, t in enumerate(tops) for x in ([[21, t, 'ședința %d' % (i + 1), '', at], [53, t, SCHED[i][1], '', at]] + ([[73.4, t, '16.10 ✓', '', at]] if i == 0 else []))]


def sheet(n, head, kicker, focus, fills, beats, pose='fisa'):
    return {'type': 'sheet', 'kicker': kicker, 'head': head, 'img': 'academy-fisa/p%d.webp' % n, 'pose': pose, 'focus': focus, 'fills': fills, 'beats': beats, 'backAt': len(beats) - 0.4}


def F(box, t, d, at):
    return {'box': box, 't': t, 'd': d, 'at': at}


SAY1 = 'Pentru că începeți azi tot programul, aveți 50% reducere, cu plata integrală.'
SAY2 = 'Înțeleg. Atunci ce putem face pentru dvs. este o reducere puțin mai mică, de 30%, și puteți achita în 4 tranșe.'
SAY3a = 'Înțeleg perfect. Corect din partea noastră ar fi să puneți un picior pe ușă: începeți cu jumătate din program, tot cu 50% reducere.'
SAY3b = 'Vă obișnuiți cu noi și vedem cum răspunde corpul dvs. la aparate.'
SAY4 = 'Ca să fie cât mai ușor: aceeași jumătate de program, cu 30% reducere, în 4 tranșe.'


def spoken(s):
    return (s.replace('50%', 'cincizeci la sută').replace('30%', 'treizeci la sută').replace('dvs.', 'dumneavoastră').replace('în 4 tranșe', 'în patru tranșe'))


S = {'id': 'fisa-program', 'title': 'Programul *și oferta*', 'short': 'Programul recomandat și oferta', 'chap': 'Programul și oferta', 'scenes': [
    {'type': 'intro', 'kicker': 'După fișă · Training', 'title': 'Programul *și oferta*', 'sub': 'Ce îi recomanzi și cum îi prezinți oferta.', 'pose': 'salut-pa', 'beats': [
        B('Bună! Eu sunt Nuki.', 'salut-pa'),
        B('Azi învățăm fișa „Program recomandat și ofertă”. O completezi după fișa clientei și după poze.', 'fisa'),
        B('Are cinci pagini. Pagina unu e programul. Paginile doi, trei, patru și cinci sunt ofertele.', 'prezinta', cap='Are 5 pagini. Pagina 1 e programul. Paginile 2, 3, 4 și 5 sunt ofertele.')]},
    {'type': 'cards', 'kicker': 'Pe scurt', 'head': 'Cinci pagini, *în ordine*', 'pose': 'prezinta', 'cols': 2, 'items': [
        {'ic': 'clipboard-list', 't': 'Pagina 1', 's': 'Programul recomandat', 'at': 0.2},
        {'ic': 'badge-percent', 't': 'Pagina 2 · Oferta 1', 's': 'Tot programul, plătit azi, 50%', 'at': 1},
        {'ic': 'calendar-days', 't': 'Pagina 3 · Oferta 2', 's': 'Tot programul, 4 tranșe, 30%', 'at': 1.25},
        {'ic': 'footprints', 't': 'Pagina 4 · Oferta 3', 's': 'Jumătate de program, plătit azi, 50%', 'at': 1.5},
        {'ic': 'repeat', 't': 'Pagina 5 · Oferta 4', 's': 'Jumătate de program, 4 tranșe, 30%', 'at': 1.75}], 'beats': [
        B('Întâi faci programul, pe pagina unu.', 'fisa'),
        B('Apoi ofertele, una câte una, de la cea mai avantajoasă ca reducere la cea mai ușoară ca sumă.', 'prezinta')]},
    {'type': 'title', 'kicker': 'Pagina 1 din 5', 'title': 'Programul *recomandat*', 'ic': 'clipboard-list', 'pose': 'fisa', 'beats': [
        B('Pagina unu: programul recomandat.', 'fisa'),
        B('Rămâne la clientă. La sfârșit o capsezi de fișa ei.', 'prezinta')]},
    sheet(1, 'Programul *recomandat*', 'Pagina 1', [
        F([12.2, 5.3], 'Clienta, data, tu', 'Numele ei, data de azi, numele tău.', 0),
        F([22.6, 6.9], 'Obiectivul ei', 'Ce vrea ea, cu cuvintele ei.', 1),
        F([34.7, 29.2], 'Tratamentele', 'O linie pe procedură: zona, ședințele, intervalul.', 3),
        F([65, 2.9], 'Totalul', 'Suma liniilor. O face calculatorul.', 6),
        F([73.1, 10.9], 'Durata și rezultatul', 'Cât ține. Ce poate vedea, estimat.', 7)],
        [[9.2, 26.1, 'Să scape de grăsimea de pe abdomen, să se simtă bine în costum de baie.', '', 1.4]] +
        [x for i, r in enumerate([['Cavitație', 'abdomen', '8'], ['EMS', 'abdomen', '8'], ['Împachetare la cald', 'abdomen', '8'], ['Liposonix', 'abdomen', '6']])
         for x in ([13.2, [39.0, 41.8, 44.7, 47.5][i], r[0], '', 4 + i * 0.25], [36, [39.0, 41.8, 44.7, 47.5][i], r[1], '', 4 + i * 0.25], [48.5, [39.0, 41.8, 44.7, 47.5][i], r[2], '', 4 + i * 0.25])] +
        [[53, 73.6, 'aproximativ 3 luni', '', 7.4], [9.2, 80.3, 'Abdomen mai plat și mai ferm. Rezultatul diferă de la o persoană la alta.', '', 8.2], [66.5, 12.9, DAY, '', 0.4]],
        [B('Sus treci numele ei, data consultației și numele tău, la „Specialist”.', 'fisa'),
         B('Întâi afli ce o deranjează. Apoi scrii obiectivul ei, cu cuvintele ei.', 'gandeste'),
         B('De exemplu: „Să scape de grăsimea de pe abdomen, să se simtă bine în costum de baie.”', 'fisa'),
         B('Apoi tratamentele. O linie pentru fiecare procedură: zona, câte ședințe și intervalul dintre ele.', 'prezinta'),
         B('De exemplu: cavitație, EMS, împachetare și Liposonix, toate pe abdomen.', 'cavitatie'),
         B('Intervalul îl iei din schema fiecărui tratament.', 'fisa'),
         B('Totalul e suma liniilor. Îl face calculatorul de ofertă, și tot el îți spune dacă programul trece de minim.', 'telefon'),
         B('Jos scrii cât ține programul, de exemplu „aproximativ trei luni”.', 'calendar', cap='Jos scrii cât ține programul, de exemplu „aproximativ 3 luni”.'),
         B('Și rezultatul estimat, spus simplu. Rezultatele sunt estimate, nu garantate.', 'mana-inima')]),
    {'type': 'chat', 'kicker': 'Cum o spui', 'head': 'Programul, *pe înțeles*', 'pose': 'mana-inima', 'lines': [
        {'who': 'me', 't': 'De obicei, după programul ăsta clientele văd un abdomen mai plat și mai ferm.', 'at': 0.2},
        {'who': 'me', 't': 'La fiecare e puțin diferit, așa că urmărim împreună cum răspunde corpul dvs.', 'at': 1}], 'beats': [
        B('Îi spui așa: „De obicei, după programul ăsta clientele văd un abdomen mai plat și mai ferm.”', 'prezinta'),
        B('„La fiecare e puțin diferit, așa că urmărim împreună cum răspunde corpul dumneavoastră.”', 'mana-inima', cap='„La fiecare e puțin diferit, așa că urmărim împreună cum răspunde corpul dvs.”'),
        B('Nu promiți nimic concret. Spui ce văd de obicei clientele.', 'arata-jos')]},
    {'type': 'title', 'kicker': 'Paginile 2-5', 'title': 'Ofertele, *ca o conversație*', 'ic': 'message-circle', 'pose': 'mana-inima', 'sub': 'Niciodată „reducere de ultim moment”. O asculți, o înțelegi, îi propui.', 'subAt': 1, 'beats': [
        B('Acum, ofertele. Aici e cel mai important lucru.', 'surprins'),
        B('Ofertele nu sună niciodată a „reducere, ia sau lasă”. Sunt o conversație: o asculți, o înțelegi și îi propui.', 'mana-inima'),
        B('Iar cel mai bine e să vă opriți la prima ofertă.', 'aprobare')]},
    {'type': 'note', 'variant': 'never', 'label': 'Regula mesei', 'text': 'Pe masă e mereu *o singură* ofertă.', 'pose': 'arata-jos',
     'extra': {'ic': 'undo-2', 't': 'Nu arăți și nu pomenești paginile următoare.', 'at': 1}, 'beats': [
        B('Pe masă e mereu o singură ofertă.', 'arata-jos'),
        B('Nu arăți și nu pomenești paginile următoare. Clienta se gândește doar la oferta din fața ei.', 'gandeste')]},

    {'type': 'big', 'kicker': 'Oferta 1 · Pagina 2', 'value': 50, 'from': 0, 'suffix': '%', 'label': 'Tot programul, *plătit azi*', 'pose': 'cadou', 'beats': [
        B('Oferta unu: tot programul, plătit azi, cu cincizeci la sută reducere.', 'cadou', cap='Oferta 1: tot programul, plătit azi, cu 50% reducere.')]},
    {'type': 'chat', 'kicker': 'Oferta 1', 'head': 'Cum *o spui*', 'pose': 'prezinta', 'lines': [
        {'who': 'me', 't': SAY1, 'at': 0.3}], 'beats': [
        B('Spui simplu: „' + SAY1 + '”', 'prezinta', tts='Spui simplu: „' + spoken(SAY1) + '”'),
        B('Și te oprești. O lași să se gândească.', 'liniste')]},
    sheet(2, 'Oferta 1 · *50%*', 'Pagina 2', [
        F([7.8, 10.9], 'Calculul', 'Reducerea: 50%. Plătește jumătate din total.', 0),
        F([22.3, 4.9], 'Plata', 'Cum plătește, data, suma.', 1),
        F([31.2, 26], 'Ședințele', 'Toate, pe loc, cu data și ora.', 2),
        F([58.4, 11.7], 'Condițiile', 'Doar azi. Regula de 24 de ore.', 3),
        F([74.5, 6.9], 'Semnăturile', 'Ea și tu. Capsezi de fișă.', 5)],
        [[62, 11.2, '50', '', 0.3], [18.1, 22.0, '✓', 'is-tick', 1.3], [24.5, 25.4, DAY, '', 1.3]] + sched(SCHED[:2], [34.3, 36.9], 2.3) + sign(75.9, 79.5, 5.3),
        [B('Pe pagină scrii reducerea, cincizeci la sută. Calculatorul îți dă totalul de plată.', 'fisa', cap='Pe pagină scrii reducerea, 50%. Calculatorul îți dă totalul de plată.'),
         B('Bifezi felul în care plătește și notezi data plății.', 'aprobare'),
         B('Ședințele se programează toate pe loc, cu data și ora. Recepția le face.', 'receptie'),
         B('Apoi condițiile. Oferta e valabilă doar azi, în ziua consultației.', 'calendar'),
         B('Și îi spui clar: dacă anulează sau mută cu mai puțin de douăzeci și patru de ore înainte, ședința se consideră făcută.', 'arata-jos', cap='Și îi spui clar: dacă anulează sau mută cu mai puțin de 24 de ore înainte, ședința se consideră făcută.'),
         B('La final semnează ea și semnezi tu. Pagina unu și pagina aleasă le capsezi de fișa ei.', 'fisa')]),
    {'type': 'chat', 'kicker': 'Oferta 2', 'head': 'Dacă e *prea mult*', 'pose': 'gandeste', 'lines': [
        {'who': 'her', 't': 'E cam mult pentru mine acum.', 'at': 0.2},
        {'who': 'me', 't': SAY2, 'at': 1.1}], 'beats': [
        B('Dar dacă spune că e prea mult? Nu insiști. Iei pagina înapoi.', 'gandeste'),
        B('Și continui firesc: „' + SAY2 + '”', 'prezinta', tts='Și continui firesc: „' + spoken(SAY2) + '”')]},
    {'type': 'big', 'kicker': 'Oferta 2 · Pagina 3', 'value': 30, 'from': 0, 'suffix': '%', 'label': 'Tot programul, *în 4 tranșe*', 'sub': 'O tranșă la fiecare dintre primele 4 ședințe.', 'subAt': 1, 'pose': 'calendar', 'beats': [
        B('Oferta doi: tot programul, cu treizeci la sută reducere, în patru tranșe.', 'calendar', cap='Oferta 2: tot programul, cu 30% reducere, în 4 tranșe.'),
        B('Plătește câte o tranșă la fiecare ședință: tranșa unu la ședința unu, tranșa doi la ședința doi, și tot așa.', 'prezinta', cap='Plătește câte o tranșă la fiecare ședință: tranșa 1 la ședința 1, tranșa 2 la ședința 2, și tot așa.')]},
    sheet(3, 'Oferta 2 · *30%, 4 tranșe*', 'Pagina 3', [
        F([7.8, 13.6], 'Calculul', 'Reducerea: 30%. Totalul împărțit la 4.', 0),
        F([25.2, 13.1], 'Calendarul tranșelor', 'Fiecare tranșă, la ședința ei.', 1),
        F([42.3, 12.8], 'Ședințele', 'Toate, programate pe loc.', 2),
        F([58.2, 11.8], 'Condițiile', 'Ca la oferta 1, plus tranșa la ședința ei.', 3),
        F([74.1, 6.9], 'Semnăturile', 'Ea și tu.', 4)],
        [[62, 11.2, '30', '', 0.3]] + tranches([28.5, 31.1, 33.7, 36.4], 1.3) + sched(SCHED, [45.3, 47.9, 50.5, 53.1], 2.3) + sign(75.5, 79.1, 4.3),
        [B('Notezi reducerea: treizeci la sută. Calculatorul îți dă totalul și cât face o tranșă.', 'fisa', cap='Notezi reducerea: 30%. Calculatorul îți dă totalul și cât face o tranșă.'),
         B('La calendarul tranșelor scrii la ce ședință plătește fiecare. La fiecare plată se bifează „Achitat”.', 'calendar'),
         B('Ședințele, toate programate pe loc.', 'receptie'),
         B('Condițiile sunt ca la oferta unu, plus una: fiecare tranșă se plătește la ședința ei.', 'arata-jos', cap='Condițiile sunt ca la oferta 1, plus una: fiecare tranșă se plătește la ședința ei.'),
         B('Și semnați amândouă.', 'aprobare')]),
    {'type': 'chat', 'kicker': 'Oferta 3', 'head': 'Un *picior pe ușă*', 'pose': 'mana-inima', 'lines': [
        {'who': 'her', 't': 'Tot e greu pentru mine.', 'at': 0.2},
        {'who': 'me', 't': SAY3a, 'at': 1.1},
        {'who': 'me', 't': SAY3b, 'at': 2.1}], 'beats': [
        B('Tot e greu pentru ea? Iei pagina înapoi și îi propui un început.', 'gandeste'),
        B('„' + SAY3a + '”', 'mana-inima', tts='„' + spoken(SAY3a) + '”'),
        B('„' + SAY3b + '”', 'prezinta', tts='„' + spoken(SAY3b) + '”')]},
    {'type': 'note', 'variant': 'tip', 'label': 'Nu e un pachet mai mic', 'text': 'E *un început*. Jumătate din ședințe, aceeași reducere de 50%.', 'pose': 'aprobare', 'beats': [
        B('Oferta trei nu e un pachet mai mic. E un început: jumătate din ședințele programului, cu aceeași reducere de cincizeci la sută.', 'aprobare', cap='Oferta 3 nu e un pachet mai mic. E un început: jumătate din ședințele programului, cu aceeași reducere de 50%.')]},
    sheet(4, 'Oferta 3 · *jumătate, 50%*', 'Pagina 4', [
        F([4.1, 12.2], 'Pachetul redus', 'Jumătate din fiecare procedură. 3 devin 1,5.', 0),
        F([17.5, 10.9], 'Calculul', 'Reducerea: 50%.', 2),
        F([31.6, 5.3], 'Plata', 'Cum plătește, data, suma.', 3),
        F([40.9, 15.5], 'Ședințele', 'Toate, programate pe loc.', 3.5),
        F([58.8, 20.1], 'Condițiile și semnăturile', 'Doar azi, regula de 24 de ore, semnături.', 4)],
        half(8.3, 0.3) + [[62, 20.9, '50', '', 2.3], [18.1, 31.6, '✓', 'is-tick', 3.3]] + sched(SCHED[:2], [43.9, 46.6], 3.8) + sign(73.4, 77.1, 4.3),
        [B('Pe pagina patru scrii jumătate din ședințele fiecărei proceduri. Opt ședințe devin patru, șase devin trei.', 'fisa', cap='Pe pagina 4 scrii jumătate din ședințele fiecărei proceduri. 8 ședințe devin 4, 6 devin 3.'),
         B('Fără rotunjire: dacă sunt trei ședințe, scrii unu virgulă cinci.', 'gandeste', cap='Fără rotunjire: dacă sunt 3 ședințe, scrii 1,5.'),
         B('Reducerea e tot cincizeci la sută.', 'cadou', cap='Reducerea e tot 50%.'),
         B('Plata, data și ședințele programate pe loc.', 'receptie'),
         B('Condițiile ca la oferta unu, și semnați amândouă.', 'aprobare', cap='Condițiile ca la oferta 1, și semnați amândouă.')]),
    {'type': 'chat', 'kicker': 'Oferta 4', 'head': 'Cea mai *ușoară*', 'pose': 'mana-inima', 'lines': [
        {'who': 'her', 't': 'Și așa e mult deodată.', 'at': 0.2},
        {'who': 'me', 't': SAY4, 'at': 1.1}], 'beats': [
        B('Și dacă tot e greu, ultima variantă.', 'gandeste'),
        B('„' + SAY4 + '”', 'mana-inima', tts='„' + spoken(SAY4) + '”')]},
    sheet(5, 'Oferta 4 · *jumătate, 4 tranșe*', 'Pagina 5', [
        F([4.1, 12.2], 'Pachetul redus', 'Aceleași ședințe ca la oferta 3.', 0),
        F([17.5, 13.6], 'Calculul', 'Reducerea: 30%. Totalul împărțit la 4.', 1),
        F([35, 13], 'Calendarul tranșelor', 'Fiecare tranșă, la ședința ei.', 2),
        F([51.9, 7.7], 'Ședințele', 'Toate, programate pe loc.', 3),
        F([61.2, 22.7], 'Condițiile și semnăturile', 'Doar azi, tranșa la ședința ei, semnături.', 3.5)],
        half(8.3, 0.3) + [[62, 20.9, '30', '', 1.3]] + tranches([38.2, 40.8, 43.4, 46.0], 2.3) + sched(SCHED[:2], [55.1, 57.7], 3.3) + sign(78.3, 81.9, 3.8),
        [B('Pe pagina cinci: aceleași ședințe ca la oferta trei.', 'fisa', cap='Pe pagina 5: aceleași ședințe ca la oferta 3.'),
         B('Reducerea e treizeci la sută, iar totalul se împarte în patru tranșe.', 'calendar', cap='Reducerea e 30%, iar totalul se împarte în 4 tranșe.'),
         B('Fiecare tranșă se plătește la ședința ei.', 'prezinta'),
         B('Ședințele, programate pe loc. Condițiile, spuse clar. Și semnați amândouă.', 'aprobare')]),
    {'type': 'yn', 'kicker': 'Tonul', 'head': 'Așa da, *așa nu*', 'pose': 'gandeste', 'cols': [
        {'ic': 'check', 't': 'Așa da', 'items': ['O asculți. O înțelegi. Îi propui.', '„Înțeleg. Atunci ce putem face pentru dvs. este…”'], 'at': 0.3},
        {'ic': 'x', 't': 'Așa nu', 'items': ['„Ultima reducere! Acum sau niciodată!”', 'Toate ofertele pe masă deodată.'], 'dark': True, 'at': 1.2}], 'beats': [
        B('Așa da: o asculți, o înțelegi și îi propui, ca între prietene.', 'mana-inima'),
        B('Așa nu: „Ultima reducere, acum sau niciodată!” Sau toate ofertele pe masă deodată.', 'arata-jos')]},
    {'type': 'list', 'kicker': 'Înainte de semnare', 'head': 'Verifică', 'pose': 'aprobare', 'items': [
        {'ic': 'calculator', 't': 'Programul trece de minimul din calculator.', 'at': 0.3},
        {'ic': 'file-check', 't': 'Pagina aleasă are reducerea și totalul scrise.', 'at': 0.9},
        {'ic': 'calendar-days', 't': 'Ședințele sunt programate.', 'at': 1.4},
        {'ic': 'repeat', 't': 'La tranșe: fiecare tranșă, la ședința ei.', 'at': 1.8},
        {'ic': 'pen-line', 't': 'Ea a citit condițiile și a semnat. Și tu.', 'at': 2.3},
        {'ic': 'paperclip', 't': 'Pagina 1 și pagina aleasă, capsate de fișă.', 'at': 2.8}], 'beats': [
        B('Înainte de semnare, verifici.', 'aprobare'),
        B('Programul trece de minimul din calculator. Pagina aleasă are reducerea și totalul scrise.', 'telefon'),
        B('Ședințele sunt programate. La tranșe, fiecare tranșă e la ședința ei.', 'calendar'),
        B('Ea a citit condițiile și a semnat, și tu la fel. Iar pagina unu și pagina aleasă le capsezi de fișa ei. Ea primește o copie.', 'fisa', cap='Ea a citit condițiile și a semnat, și tu la fel. Iar pagina 1 și pagina aleasă le capsezi de fișa ei. Ea primește o copie.')]},
    {'type': 'outro', 'kicker': 'Gata', 'title': '*Bravo!*', 'chap': 'Recapitulare', 'pose': 'bucurie', 'items': [
        {'t': 'Programul, pe pagina 1', 'at': 1}, {'t': 'O singură ofertă pe masă', 'at': 1.35}, {'t': 'Ca o conversație', 'at': 1.7}, {'t': 'Ideal: oferta 1', 'at': 2.05}], 'beats': [
        B('Bravo! Acum știi programul și ofertele.', 'bucurie'),
        B('Pe masă e mereu o singură ofertă, spusă ca într-o conversație. Și cel mai bine e să vă opriți la prima.', 'mana-inima'),
        B('Ne vedem în filmul următor!', 'salut-pa')]},
]}

d = os.path.join(HERE, '..', 'fisa-program')
os.makedirs(d, exist_ok=True)
txt = json.dumps(S, ensure_ascii=False, indent=1)
assert '—' not in txt and '–' not in txt
open(os.path.join(d, 'script.json'), 'w', encoding='utf8').write(txt)
print('fisa-program', len(S['scenes']), 'scenes', sum(len(s.get('beats', [])) for s in S['scenes']), 'lines')
