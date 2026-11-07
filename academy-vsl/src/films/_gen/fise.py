#!/usr/bin/env python3
"""Writes the scripts of the three client-sheet films (corporale, faciale, epilare) from the sheets in
portal-academy-fisa.js (their pages, the boxes of each part, the example in pen) and the words below.
No client names, phones or e-mails are written on the pages (the example in pen keeps only dates, ticks and notes).
  python3 fise.py"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..', '..', '..')
src = open(os.path.join(ROOT, 'portal-academy-fisa.js'), encoding='utf8').read()
CLIENT = json.loads(re.search(r'const CLIENT = (\{.*?\});\n', src).group(1))

# what may stay written on the page (no names, phones, e-mails, birth dates)
DROP = re.compile(r'(Pop|Ionescu|Dinu|0722|@|M\. I\.|1990|1985|1994)')


def fills(page, focus):
    """the pen on a page, each piece written when its part is explained"""
    out = []
    for f in page['fills']:
        x, y, t = f[0], f[1], f[2]
        cls = f[3] if len(f) > 3 else ''
        if DROP.search(t):
            continue
        if cls == 'is-sig':
            t = 'semnat'
        at = 0
        for k, fo in enumerate(focus):
            top, hh = fo['box']
            if top - 1 <= y <= top + hh + 1:
                at = fo['at'] + 0.35
                break
        out.append([x, y, t, cls, at])
    return out


def B(say, pose=None, tts=None, cap=None, hold=None):
    b = {'say': say}
    if pose: b['pose'] = pose
    if tts: b['tts'] = tts
    if cap: b['cap'] = cap
    if hold: b['hold'] = hold
    return b


SMALL_NUKI = {('corporale', 0), ('faciale', 0), ('faciale', 3), ('epilare', 0), ('epilare', 3)}


def sheet_scene(film, pi, page, parts, head, kicker, pose='fisa'):
    """parts: [(title, short text, [beats], box override or None)] in the order of the page's notes"""
    focus, beats = [], []
    for k, (t, d, bb, box) in enumerate(parts):
        n = page['notes'][k]
        focus.append(dict({'box': box or n['box'], 't': t, 'd': d, 'at': len(beats), 'n': k + 1}, **({'x': 2, 'w': 96} if page.get('land') else {})))
        beats += bb
    sc = {'type': 'sheet', 'kicker': kicker, 'head': head, 'img': 'academy-fisa/%s-p%d.webp' % (film, pi + 1), 'pose': pose,
          'land': bool(page.get('land')), 'focus': focus, 'fills': fills(page, focus), 'beats': beats, 'backAt': len(beats) - 0.4}
    if (film, pi) in SMALL_NUKI:
        sc['nuki'] = 'rs'
    return sc


def page_title(n, of, title, ic, beats, pose='fisa'):
    return {'type': 'title', 'kicker': 'Pagina %d din %d' % (n, of), 'title': title, 'ic': ic, 'pose': pose, 'beats': beats}


def intro(title, sub, beats):
    return {'type': 'intro', 'kicker': 'Fișa clientei · Training', 'title': title, 'sub': sub, 'pose': 'salut-pa', 'beats': beats}


def checklist(items, beats):
    return {'type': 'list', 'kicker': 'La final', 'head': 'Verifică *fișa*', 'pose': 'aprobare',
            'items': [{'ic': 'check', 't': t, 'at': i * len(beats) / len(items) if len(beats) > 1 else 0.2 + i * 0.12} for i, t in enumerate(items)], 'beats': beats}


def outro(items, beats):
    return {'type': 'outro', 'kicker': 'Gata', 'title': '*Bravo!*', 'chap': 'Recapitulare', 'pose': 'bucurie',
            'items': [{'t': t, 'at': 1 + i * 0.35} for i, t in enumerate(items)], 'beats': beats}


P = {}
# ------------------------------------------------------------------ corp
C = CLIENT['corporale']
P['fisa-corporale'] = {'id': 'fisa-corporale', 'title': 'Fișa *corp*', 'short': 'Fișa clientei: corp', 'chap': 'Fișa corp', 'scenes': [
    intro('Fișa *corp*', 'Remodelare, slăbire, celulită. Pagină cu pagină.', [
        B('Bună! Eu sunt Nuki.', 'salut-pa'),
        B('Azi învățăm fișa pentru corp. O folosești la remodelare, slăbire și celulită.', 'fisa'),
        B('Are patru pagini. Le luăm pe rând, cu un exemplu completat.', 'prezinta')]),
    {'type': 'note', 'variant': 'tip', 'label': 'Regula de aur', 'text': 'O completezi *tu, împreună cu ea*.', 'pose': 'fisa',
     'extra': {'ic': 'message-circle', 't': 'O întrebi rubrică cu rubrică și scrii tu.', 'at': 1}, 'beats': [
        B('Înainte de toate, o regulă de aur.', 'surprins'),
        B('Fișa nu i-o dai clientei să o completeze singură. Stai lângă ea, o întrebi și scrii tu.', 'fisa')]},
    page_title(1, 4, 'Cine e clienta *și ce vrea*', 'user-round', [
        B('Pagina unu: cine e clienta și ce vrea.', 'prezinta'),
        B('O completați la începutul consultației, înainte să vorbiți de tratamente.', 'fisa')]),
    sheet_scene('corporale', 0, C[0], [
        ('Sus, în colț', 'Numărul fișei, data de azi și numele tău.', [
            B('Sus, în colț, scrii numărul fișei, data de azi și numele tău, la „Specialist”.', 'fisa')], None),
        ('Cine este ea', 'Nume, data nașterii, telefon, e-mail.', [
            B('Apoi datele ei: numele, data nașterii, telefonul și e-mailul.', 'prezinta'),
            B('„Data primei vizite” e azi. Și o întrebi: „De unde ați aflat de noi?”', 'gandeste'),
            B('Dacă are sub optsprezece ani, bifezi „da”. Atunci un părinte completează pagina trei.', 'arata-jos', cap='Dacă are sub 18 ani, bifezi „da”. Atunci un părinte completează pagina 3.')], None),
        ('De ce a venit', 'Ce o deranjează și ce a încercat. Cu cuvintele ei.', [
            B('La „Motivul vizitei” o întrebi: „Ce vă deranjează?” și „Ce ați încercat până acum?”', 'gandeste'),
            B('Notezi cu cuvintele ei. De exemplu: „Grăsime pe abdomen după sarcină. A încercat diete, fără rezultat.”', 'fisa')], None),
        ('Când poate veni', 'Zilele, orele și când nu poate.', [
            B('Bifezi zilele și orele care îi convin.', 'calendar'),
            B('Și scrii când nu poate, de exemplu un concediu. Așa, programările se fac repede.', 'aprobare')], None),
        ('Sănătatea ei', 'Citești fiecare întrebare. Bifezi „Da” sau „Nu”.', [
            B('Jos sunt întrebările de sănătate. I le citești pe rând.', 'fisa'),
            B('La fiecare bifezi „Da” sau „Nu”.', 'prezinta'),
            B('Dacă e un singur „Da”, scrii detaliile jos. Și nu începi tratamentul până nu întrebi dacă se poate face.', 'arata-jos')], None),
    ], 'Cine e clienta *și ce vrea*', 'Pagina 1'),
    {'type': 'chat', 'kicker': 'Exemplu', 'head': 'Așa *o întrebi*', 'pose': 'mana-inima', 'lines': [
        {'who': 'me', 't': 'Ce vă deranjează cel mai mult?', 'at': 0.1},
        {'who': 'her', 't': 'Burtica. A rămas după sarcină.', 'at': 0.6},
        {'who': 'me', 't': 'Ce ați încercat până acum?', 'at': 1.1},
        {'who': 'her', 't': 'Diete și sală. Dar nu pleacă.', 'at': 1.6}], 'beats': [
        B('Uite cum sună o discuție. Tu întrebi, ea răspunde.', 'prezinta'),
        B('Și tu scrii exact cu cuvintele ei. Așa se simte ascultată.', 'mana-inima')]},
    page_title(2, 4, 'Corpul ei, *măsurat*', 'ruler', [
        B('Pagina doi: corpul ei, măsurat.', 'centimetru'),
        B('Aici scrii cum arată corpul ei azi. Peste câteva ședințe măsori din nou și îi arăți cât a progresat.', 'prezinta')], 'centimetru'),
    sheet_scene('corporale', 1, C[1], [
        ('Ce vrea și cât cântărește', 'Obiectivul, mișcarea, greutatea, înălțimea, IMC.', [
            B('Sus scrii obiectivul ei și cât se mișcă. Apoi greutatea și înălțimea.', 'fisa'),
            B('Și calculezi IMC-ul. Îți arăt imediat cum.', 'gandeste', tts='Și calculezi indicele de masă corporală. Îți arăt imediat cum.')], None),
        ('Cântarul și obiceiurile', 'Grăsimea, mușchii, apa. Mesele, apa, somnul.', [
            B('Grăsimea, mușchii și apa le copiezi de pe cântarul de analiză corporală.', 'prezinta'),
            B('Apoi o întrebi câte mese mănâncă pe zi, câtă apă bea, cât doarme și dacă fumează.', 'apa')], None),
        ('Centimetrul', 'Fiecare zonă, la „Inițial”.', [
            B('Cu centimetrul măsori fiecare zonă și scrii la „Inițial”.', 'centimetru')], None),
        ('Întrebări pentru corp', '„Da” sau „Nu”, la fiecare.', [
            B('Apoi întrebările pentru corp. La fel ca pe pagina unu: citești și bifezi „Da” sau „Nu”.', 'fisa'),
            B('Un singur „Da” înseamnă: nu începi până nu întrebi dacă se poate.', 'arata-jos')], None),
        ('Ce vezi tu', 'Ce observi și ce îi recomanzi.', [
            B('Jos scrii ce observi tu și ce îi recomanzi.', 'gandeste'),
            B('De exemplu: „Piele elastică, grăsime moale pe abdomen. Recomand programul pentru abdomen.”', 'fisa')], None),
    ], 'Corpul ei, *măsurat*', 'Pagina 2'),
    {'type': 'big', 'kicker': 'Exemplu: IMC', 'value': 25, 'from': 0, 'label': '68 kg ÷ (1,65 m × 1,65 m)', 'sub': 'Greutatea, împărțită la înălțimea în metri înmulțită cu ea însăși.', 'pose': 'gandeste', 'subAt': 1, 'beats': [
        B('Un exemplu. Clienta are 68 de kilograme și 1,65 metri.', 'prezinta', tts='Un exemplu. Clienta are șaizeci și opt de kilograme și un metru șaizeci și cinci.'),
        B('Împarți 68 la 1,65 înmulțit cu 1,65.', 'gandeste', tts='Împarți șaizeci și opt la unu virgulă șaizeci și cinci, înmulțit cu unu virgulă șaizeci și cinci.'),
        B('Îți iese 25. Asta scrii la IMC.', 'bucurie', tts='Îți iese douăzeci și cinci. Asta scrii la indicele de masă corporală.')]},
    {'type': 'rail', 'kicker': 'Centimetrul', 'head': 'Măsori de *patru ori*', 'pose': 'centimetru', 'items': [
        {'t': 'Azi, la „Inițial”', 'at': 0.3}, {'t': 'La ședința 5', 'at': 1}, {'t': 'La ședința 10', 'at': 1.4}, {'t': 'La final', 'at': 1.8}], 'beats': [
        B('Azi măsori prima dată și scrii la „Inițial”.', 'centimetru'),
        B('Apoi măsori din nou la ședința cinci, la ședința zece și la final.', 'calendar', cap='Apoi măsori din nou la ședința 5, la ședința 10 și la final.'),
        B('La „Diferență” scrii câți centimetri a dat jos. Asta o bucură cel mai mult!', 'bucurie')]},
    page_title(3, 4, 'Acordul *și semnăturile*', 'pen-line', [
        B('Pagina trei: acordul și semnăturile.', 'fisa'),
        B('Pe pagina asta clienta își dă acordul. O citește ea, tu îi explici.', 'prezinta')]),
    sheet_scene('corporale', 2, C[2], [
        ('Acordul ei', 'Bifează ea ce vrea. Ce nu bifează, nu facem.', [
            B('Îi dai foaia să citească.', 'fisa'),
            B('Ea bifează ce vrea: poze pentru evidență, poze pentru reclamă fără față, mesaje pentru programări și oferte.', 'prezinta'),
            B('Ce nu bifează, nu facem.', 'arata-jos')], None),
        ('Înainte și după', 'Sfaturile, spuse pe scurt, cu voce tare.', [
            B('Apoi îi spui pe scurt, cu voce tare, ce face înainte și după tratament.', 'apa'),
            B('Sunt sfaturile care o ajută să aibă rezultate bune.', 'mana-inima')], None),
        ('Pozele', 'Data, zona, din ce parte, fișierul.', [
            B('Când faci poze, scrii aici data, zona, din ce parte și numele fișierului.', 'aparat-foto'),
            B('Faci poze doar dacă a bifat acordul de sus.', 'arata-jos')], None),
        ('Doar sub 18 ani', 'Un părinte completează. Adultă: lași gol.', [
            B('Partea asta e doar pentru clientele sub optsprezece ani. Atunci un părinte scrie numele, telefonul și semnează.', 'prezinta', cap='Partea asta e doar pentru clientele sub 18 ani. Atunci un părinte scrie numele, telefonul și semnează.'),
            B('Dacă e adultă, o lași goală.', 'aprobare')], None),
        ('Semnăturile', 'Semnează ea, semnezi tu.', [
            B('Jos semnează ea și semnezi tu. Scrii data și numele tău.', 'fisa'),
            B('Fără semnături, fișa nu e gata.', 'arata-jos')], None),
    ], 'Acordul *și semnăturile*', 'Pagina 3'),
    page_title(4, 4, 'Ședințele, *una câte una*', 'calendar-days', [
        B('Pagina patru: ședințele, una câte una.', 'calendar'),
        B('Pe ea scrii la fiecare ședință, de la prima până la ultima.', 'fisa')], 'calendar'),
    sheet_scene('corporale', 3, C[3], [
        ('Sus', 'Numele ei, ședințele din pachet, prima dată.', [
            B('Sus treci numele ei, câte ședințe are în pachet și data primei ședințe.', 'fisa')], None),
        ('La fiecare ședință', 'Un rând nou: data, procedura, zona, aparatul, cum a reacționat pielea.', [
            B('La fiecare ședință completezi un rând nou.', 'prezinta'),
            B('Data, a câta ședință e, procedura și zona.', 'fisa'),
            B('Aparatul și setările, cât a durat și cum a reacționat pielea.', 'liposonix'),
            B('La final semnezi tu și semnează ea.', 'aprobare')], [13.8, 9.5]),
    ], 'Ședințele, *una câte una*', 'Pagina 4', 'fisa'),
    checklist(['Paginile 1 și 2, completate rubrică cu rubrică.', 'Fiecare întrebare are „Da” sau „Nu”.', 'Ai măsurat cu centimetrul, la „Inițial”.', 'Ea a bifat acordurile și a semnat. Și tu.', 'Pozele, doar cu acordul ei.', 'La fiecare ședință, un rând pe pagina 4.'], [
        B('La final, verifici fișa.', 'aprobare'),
        B('Paginile unu și doi sunt completate. Fiecare întrebare are „Da” sau „Nu”.', 'fisa'),
        B('Ai măsurat cu centimetrul. Ea a bifat acordurile și a semnat, și tu la fel.', 'centimetru'),
        B('Pozele le faci doar cu acordul ei. Și la fiecare ședință completezi un rând pe pagina patru.', 'aparat-foto')]),
    outro(['Împreună cu ea', 'Un „Da” = întrebi', 'Centimetrul, de 4 ori', 'Semnături'], [
        B('Bravo! Acum știi fișa pentru corp.', 'bucurie'),
        B('O completezi împreună cu ea, măsori cu grijă și nu începi nimic fără semnături.', 'aprobare'),
        B('Ne vedem în filmul următor!', 'salut-pa')]),
]}

# ------------------------------------------------------------------ față
F = CLIENT['faciale']
P['fisa-faciale'] = {'id': 'fisa-faciale', 'title': 'Fișa *față*', 'short': 'Fișa clientei: față', 'chap': 'Fișa față', 'scenes': [
    intro('Fișa *față*', 'Ten, pete, riduri. Pagină cu pagină.', [
        B('Bună! Eu sunt Nuki.', 'salut-pa'),
        B('Azi învățăm fișa pentru față. O folosești pentru ten, pete și riduri.', 'facial'),
        B('Are patru pagini. Le luăm pe rând, cu un exemplu completat.', 'prezinta')]),
    {'type': 'note', 'variant': 'tip', 'label': 'Regula de aur', 'text': 'O completezi *tu, împreună cu ea*.', 'pose': 'fisa',
     'extra': {'ic': 'message-circle', 't': 'O întrebi rubrică cu rubrică și scrii tu.', 'at': 1}, 'beats': [
        B('Ca la toate fișele, o regulă de aur.', 'surprins'),
        B('Nu îi dai fișa să o completeze singură. Stai lângă ea, o întrebi și scrii tu.', 'fisa')]},
    page_title(1, 4, 'Cine e clienta *și ce vrea*', 'user-round', [
        B('Pagina unu: cine e clienta și ce vrea.', 'prezinta'),
        B('O completați la începutul consultației, înainte să vorbiți de tratamente.', 'fisa')]),
    sheet_scene('faciale', 0, F[0], [
        ('Sus, în colț', 'Numărul fișei, data de azi și numele tău.', [
            B('Sus, în colț, scrii numărul fișei, data de azi și numele tău, la „Specialist”.', 'fisa')], None),
        ('Cine este ea', 'Nume, data nașterii, telefon, e-mail.', [
            B('Apoi datele ei: numele, data nașterii, telefonul și e-mailul.', 'prezinta'),
            B('„Data primei vizite” e azi. Și o întrebi: „De unde ați aflat de noi?”', 'gandeste'),
            B('Dacă are sub optsprezece ani, bifezi „da”. Atunci un părinte completează pagina trei.', 'arata-jos', cap='Dacă are sub 18 ani, bifezi „da”. Atunci un părinte completează pagina 3.')], None),
        ('De ce a venit', 'Ce o deranjează la ten și ce a mai făcut.', [
            B('O întrebi: „Ce vă deranjează la ten?”', 'oglinda'),
            B('Și: „Ce tratamente ați mai făcut și când?” De exemplu peeling, filler, botox sau laser.', 'gandeste'),
            B('Scrii cu cuvintele ei. De exemplu: „Pete pe pomeți și riduri fine. Peeling acum doi ani.”', 'fisa', cap='Scrii cu cuvintele ei. De exemplu: „Pete pe pomeți și riduri fine. Peeling acum 2 ani.”')], None),
        ('Când poate veni', 'Zilele, orele și când nu poate.', [
            B('Bifezi zilele și orele care îi convin, și scrii când nu poate. Așa, programările se fac repede.', 'calendar')], None),
        ('Sănătatea ei', 'Citești fiecare întrebare. Bifezi „Da” sau „Nu”.', [
            B('Jos sunt întrebările de sănătate. I le citești pe rând și bifezi „Da” sau „Nu”.', 'fisa'),
            B('Dacă e un singur „Da”, scrii detaliile jos. Și nu începi tratamentul până nu întrebi dacă se poate face.', 'arata-jos')], None),
    ], 'Cine e clienta *și ce vrea*', 'Pagina 1'),
    page_title(2, 4, 'Tenul *ei*', 'scan-face', [
        B('Pagina doi: tenul ei.', 'oglinda'),
        B('Aici te uiți atent la pielea ei, afli ce face acasă și scrii ce îi recomanzi.', 'prezinta')], 'oglinda'),
    sheet_scene('faciale', 1, F[1], [
        ('Cum e pielea ei', 'Tipul de ten, problemele, fototipul, SPF.', [
            B('Te uiți la ten și bifezi ce tip e și ce probleme are.', 'oglinda'),
            B('Bifezi și fototipul: cât de deschisă e pielea.', 'gandeste'),
            B('Și o întrebi dacă pune cremă cu SPF în fiecare zi.', 'spf', tts='Și o întrebi dacă pune cremă cu protecție solară în fiecare zi.')], None),
        ('Ce face acasă', 'Cu ce se spală, se hidratează, apa, somnul, soarele.', [
            B('O întrebi cu ce se spală pe față, cu ce se hidratează și dacă folosește retinol sau acizi.', 'facial'),
            B('Apoi câtă apă bea, cât doarme, dacă fumează și cât stă la soare.', 'apa')], None),
        ('Ce îi recomanzi', 'Procedura, zona, ședințele, intervalul.', [
            B('Aici scrii ce îi recomanzi: procedura, zona, câte ședințe și la ce interval.', 'fisa'),
            B('Numărul de ședințe și intervalul le iei din schema tratamentului.', 'prezinta')], None),
        ('Întrebări pentru față', '„Da” sau „Nu”, la fiecare.', [
            B('Apoi întrebările pentru față. Citești și bifezi „Da” sau „Nu”. Un singur „Da” înseamnă: întâi întrebi dacă se poate.', 'arata-jos')], None),
        ('Ce vezi tu', 'Ce observi și ce sfat îi dai pentru acasă.', [
            B('Jos scrii ce observi și ce sfat îi dai pentru acasă.', 'gandeste'),
            B('De exemplu: „Pete pe pomeți, nu pune SPF zilnic. Îi recomand SPF 50 în fiecare dimineață.”', 'spf', tts='De exemplu: „Pete pe pomeți, nu pune protecție solară zilnic. Îi recomand protecție cincizeci în fiecare dimineață.”')], None),
    ], 'Tenul *ei*', 'Pagina 2', 'oglinda'),
    {'type': 'cards', 'kicker': 'Fototipul', 'head': 'Cât de *deschisă* e pielea', 'pose': 'gandeste', 'items': [
        {'ic': 'sun', 't': 'Fototip I', 's': 'Foarte albă, se arde mereu', 'at': 0.4},
        {'ic': 'sun-medium', 't': 'Fototip III', 's': 'La mijloc', 'at': 1},
        {'ic': 'sun-dim', 't': 'Fototip VI', 's': 'Foarte închisă', 'at': 1.4}], 'beats': [
        B('Fototipul e ușor. Unu înseamnă piele foarte albă, care se arde mereu la soare.', 'spf', cap='Fototipul e ușor. I înseamnă piele foarte albă, care se arde mereu la soare.'),
        B('Șase înseamnă piele foarte închisă. Restul sunt la mijloc.', 'gandeste', cap='VI înseamnă piele foarte închisă. Restul sunt la mijloc.')]},
    page_title(3, 4, 'Acordul *și semnăturile*', 'pen-line', [
        B('Pagina trei: acordul și semnăturile. O citește ea, tu îi explici.', 'fisa')]),
    sheet_scene('faciale', 2, F[2], [
        ('Acordul ei', 'Bifează ea ce vrea. Ce nu bifează, nu facem.', [
            B('Îi dai foaia să citească. Ea bifează ce vrea: poze pentru evidență, poze pentru reclamă fără față, mesaje și oferte.', 'fisa'),
            B('Ce nu bifează, nu facem.', 'arata-jos')], None),
        ('Înainte și după', 'Sfaturile, spuse pe scurt, cu voce tare.', [
            B('Apoi îi spui pe scurt, cu voce tare, ce face înainte și după. Așa pielea rămâne liniștită.', 'spf')], None),
        ('Pozele', 'Data, zona, din ce parte, fișierul.', [
            B('Când faci poze, scrii data, zona, din ce parte și numele fișierului. Doar dacă a bifat acordul.', 'aparat-foto')], None),
        ('Doar sub 18 ani', 'Un părinte completează. Adultă: lași gol.', [
            B('Partea pentru părinte o completezi doar dacă are sub optsprezece ani.', 'prezinta', cap='Partea pentru părinte o completezi doar dacă are sub 18 ani.')], None),
        ('Semnăturile', 'Semnează ea, semnezi tu.', [
            B('Jos semnează ea și semnezi tu. Fără semnături, fișa nu e gata.', 'aprobare')], None),
    ], 'Acordul *și semnăturile*', 'Pagina 3'),
    page_title(4, 4, 'Ședințele, *una câte una*', 'calendar-days', [
        B('Pagina patru: ședințele, una câte una.', 'calendar')], 'calendar'),
    sheet_scene('faciale', 3, F[3], [
        ('Sus', 'Numele ei, ședințele din pachet, prima dată.', [
            B('Sus treci numele ei, câte ședințe are în pachet și data primei ședințe.', 'fisa')], None),
        ('La fiecare ședință', 'Data, procedura, produsele, durata, cum a reacționat pielea, sfatul.', [
            B('La fiecare ședință, un rând nou: data, a câta ședință e și procedura.', 'prezinta'),
            B('Produsele folosite, cât a durat și cum a reacționat pielea.', 'facial'),
            B('Și ce îi spui să facă acasă. De exemplu: SPF 50. La final semnați amândouă.', 'spf', tts='Și ce îi spui să facă acasă. De exemplu: protecție solară cincizeci. La final semnați amândouă.')], [13.8, 9.5]),
    ], 'Ședințele, *una câte una*', 'Pagina 4'),
    checklist(['Paginile 1 și 2, completate rubrică cu rubrică.', 'Fiecare întrebare are „Da” sau „Nu”.', 'Ai scris planul: procedura, ședințele, intervalul.', 'Ea a bifat acordurile și a semnat. Și tu.', 'Pozele, doar cu acordul ei.', 'La fiecare ședință, un rând pe pagina 4.'], [
        B('La final, verifici fișa.', 'aprobare'),
        B('Paginile unu și doi sunt completate, și fiecare întrebare are „Da” sau „Nu”.', 'fisa'),
        B('Ai scris planul: procedura, ședințele și intervalul.', 'calendar'),
        B('Ea a semnat, tu la fel. Pozele doar cu acordul ei. Și la fiecare ședință, un rând pe pagina patru.', 'aparat-foto')]),
    outro(['Împreună cu ea', 'Fototipul și SPF', 'Planul scris', 'Semnături'], [
        B('Bravo! Acum știi fișa pentru față.', 'bucurie'),
        B('Te uiți atent la ten, întrebi de soare și de SPF, și scrii planul clar.', 'spf', tts='Te uiți atent la ten, întrebi de soare și de protecția solară, și scrii planul clar.'),
        B('Ne vedem în filmul următor!', 'salut-pa')]),
]}

# ------------------------------------------------------------------ epilare
E = CLIENT['epilare']
P['fisa-epilare'] = {'id': 'fisa-epilare', 'title': 'Fișa *epilare laser*', 'short': 'Fișa clientei: epilare laser', 'chap': 'Fișa epilare laser', 'scenes': [
    intro('Fișa *epilare laser*', 'Piele, fir, zone. Pagină cu pagină.', [
        B('Bună! Eu sunt Nuki.', 'salut-pa'),
        B('Azi învățăm fișa pentru epilarea cu laser.', 'laser'),
        B('Are cinci pagini. Le luăm pe rând, cu un exemplu completat.', 'prezinta')]),
    {'type': 'note', 'variant': 'tip', 'label': 'Regula de aur', 'text': 'O completezi *tu, împreună cu ea*.', 'pose': 'fisa', 'beats': [
        B('Și aici, regula de aur: fișa o completezi tu, împreună cu ea. O întrebi și scrii.', 'fisa')]},
    page_title(1, 5, 'Cine e clienta *și ce vrea*', 'user-round', [
        B('Pagina unu: cine e clienta și ce vrea să epileze.', 'prezinta')]),
    sheet_scene('epilare', 0, E[0], [
        ('Sus, în colț', 'Numărul fișei, data de azi și numele tău.', [
            B('Sus scrii numărul fișei, data de azi și numele tău.', 'fisa')], None),
        ('Cine este ea', 'Nume, data nașterii, telefon, e-mail.', [
            B('Apoi datele ei: numele, data nașterii, telefonul și e-mailul. Și o întrebi de unde a aflat de noi.', 'prezinta'),
            B('Dacă are sub optsprezece ani, un părinte completează pagina trei.', 'arata-jos', cap='Dacă are sub 18 ani, un părinte completează pagina 3.')], None),
        ('Ce vrea să epileze', 'Zonele, cum s-a epilat, când ultima dată.', [
            B('Scrii zonele pe care le vrea. De exemplu: axilă și picioare complet.', 'laser'),
            B('O întrebi cum s-a epilat până acum și când ultima dată.', 'gandeste'),
            B('Dacă a folosit ceară sau pensetă de curând, laserul mai așteaptă. Firul trebuie să fie în piele.', 'arata-jos')], None),
        ('Când poate veni', 'Zilele, orele și când nu poate.', [
            B('Bifezi zilele și orele care îi convin, și scrii când nu poate.', 'calendar')], None),
        ('Sănătatea ei', 'Citești fiecare întrebare. Bifezi „Da” sau „Nu”.', [
            B('Jos, întrebările de sănătate. Le citești pe rând și bifezi „Da” sau „Nu”.', 'fisa'),
            B('Un singur „Da” înseamnă: scrii detaliile și nu începi până nu întrebi dacă se poate.', 'arata-jos')], None),
    ], 'Cine e clienta *și ce vrea*', 'Pagina 1'),
    page_title(2, 5, 'Pielea *și firul de păr*', 'scan-search', [
        B('Pagina doi: pielea și firul de păr.', 'laser'),
        B('Laserul vede culoarea firului. De aceea te uiți atent la piele și la păr, înainte de orice.', 'gandeste')], 'laser'),
    sheet_scene('epilare', 1, E[1], [
        ('Pielea și firul', 'Fototipul, culoarea, grosimea, desimea firului.', [
            B('Bifezi cât de deschisă e pielea. Fototipul unu e foarte albă, șase e foarte închisă.', 'gandeste', cap='Bifezi cât de deschisă e pielea. Fototipul I e foarte albă, VI e foarte închisă.'),
            B('Apoi culoarea firului, cât e de gros, cât de des crește și ce tip de piele are.', 'laser')], None),
        ('Zonele', 'Pe fiecare rând o zonă: ședințele, sensibilitatea.', [
            B('Pe fiecare rând scrii o zonă: câte ședințe crezi că îi trebuie, de obicei șase până la opt, și cât de sensibilă e acolo.', 'fisa', cap='Pe fiecare rând scrii o zonă: câte ședințe crezi că îi trebuie (de obicei 6-8) și cât de sensibilă e acolo.')], None),
        ('Întrebări pentru laser', 'Mai ales soarele din ultimele 4 săptămâni.', [
            B('Apoi întrebările pentru laser. Foarte important: soarele și solarul din ultimele patru săptămâni.', 'spf', cap='Apoi întrebările pentru laser. Foarte important: soarele și solarul din ultimele 4 săptămâni.'),
            B('Un singur „Da” înseamnă: nu începi până nu întrebi dacă se poate.', 'arata-jos')], None),
        ('Ce vezi tu', 'Ce observi la piele și la fir.', [
            B('Jos scrii ce observi. De exemplu: „Fir negru și gros, piele deschisă: rezultate foarte bune. Test la prima ședință.”', 'fisa')], None),
    ], 'Pielea *și firul de păr*', 'Pagina 2', 'laser'),
    {'type': 'yn', 'kicker': 'Firul de păr', 'head': 'Ce vede *laserul*', 'pose': 'laser', 'cols': [
        {'ic': 'check', 't': 'Fir negru, piele deschisă', 'items': ['Iese cel mai bine.'], 'at': 0.3},
        {'ic': 'info', 't': 'Fir blond, alb sau roșcat', 'items': ['Iese greu.', 'Îi spui sincer, de la început.'], 'dark': True, 'at': 1}], 'beats': [
        B('Firul negru pe piele deschisă iese cel mai bine.', 'bucurie'),
        B('Firul blond, alb sau roșcat iese greu. Îi spui sincer, de la început.', 'mana-inima')]},
    page_title(3, 5, 'Acordul *și testul*', 'pen-line', [
        B('Pagina trei: acordul, testul de probă și semnăturile.', 'fisa')]),
    sheet_scene('epilare', 2, E[2], [
        ('Acordul ei', 'Bifează ea ce vrea. Ce nu bifează, nu facem.', [
            B('Îi dai foaia să citească și bifează ea ce vrea. Ce nu bifează, nu facem.', 'fisa')], None),
        ('Înainte și după', 'Sfaturile, spuse pe scurt.', [
            B('Îi spui pe scurt ce face înainte și după, ca pielea să rămână liniștită.', 'spf')], None),
        ('Testul de probă', 'Prima dată, pe o bucățică mică de piele.', [
            B('La prima ședință faci un test: încerci laserul pe o bucățică mică de piele.', 'laser'),
            B('Scrii data, zona și setările. A doua zi o întrebi cum arată pielea și scrii la „Reacție după 24 de ore”.', 'telefon', tts='Scrii data, zona și setările. A doua zi o întrebi cum arată pielea și scrii la „Reacție după douăzeci și patru de ore”.', cap='Scrii data, zona și setările. A doua zi o întrebi cum arată pielea și scrii la „Reacție după 24 h”.')], None),
        ('Doar sub 18 ani', 'Un părinte completează. Adultă: lași gol.', [
            B('Partea pentru părinte doar dacă are sub optsprezece ani.', 'prezinta', cap='Partea pentru părinte doar dacă are sub 18 ani.')], None),
        ('Semnăturile', 'Semnează ea, semnezi tu.', [
            B('Și jos semnați amândouă. Fără semnături, fișa nu e gata.', 'aprobare')], None),
    ], 'Acordul *și testul*', 'Pagina 3'),
    page_title(4, 5, 'Despre *aparat*', 'zap', [
        B('Pagina patru e pentru clientă: despre aparat.', 'laser'),
        B('I-o arăți și îi explici pe scurt, cu cuvintele tale.', 'prezinta')], 'laser'),
    sheet_scene('epilare', 3, E[3], [
        ('Cum merge laserul', 'Lumina intră în fir, se face căldură, rădăcina se oprește.', [
            B('Lumina laserului intră în fir și se face căldură. Căldura oprește rădăcina firului.', 'laser'),
            B('Firele cresc pe rând, nu toate deodată. De aceea e nevoie de mai multe ședințe.', 'gandeste')], None),
        ('De ce e bun aparatul', 'Răcește pielea. Orice culoare de piele. Certificat medical.', [
            B('Aparatul răcește pielea, deci doare puțin. Merge pe orice culoare de piele și e aparat medical certificat.', 'aprobare')], None),
        ('Când vine din nou', '6, 6, 8, 8 și 8-10 săptămâni.', [
            B('Prima ședință e azi. Apoi vine din nou după șase, șase, opt, opt și opt până la zece săptămâni.', 'calendar', cap='Prima ședință e azi. Apoi vine din nou după 6, 6, 8, 8 și 8-10 săptămâni.')], None),
        ('Ce întreabă clientele', 'Doare? Câte ședințe? Păr blond? Vara?', [
            B('Jos sunt răspunsurile la ce întreabă clientele: doare, câte ședințe, merge pe păr blond, se poate vara.', 'gandeste'),
            B('Citește-le de două ori, ca să le știi pe de rost.', 'fisa')], None),
    ], 'Despre *aparat*', 'Pagina 4', 'laser'),
    {'type': 'sessions', 'kicker': 'Când vine din nou', 'head': 'Ședințele, *la timp*', 'pose': 'calendar', 'dots': 6, 'gaps': ['6 săpt.', '6 săpt.', '8 săpt.', '8 săpt.', '8-10 săpt.'], 'dotsAt': 0.2,
     'facts': [{'ic': 'sparkles', 'k': 'Dacă vine la timp', 'v': 'După 5 ședințe, aproape toate firele au dispărut', 'at': 1}], 'beats': [
        B('Uite intervalele, pe rând.', 'calendar'),
        B('Îi spui așa: dacă vine la timp, după cinci ședințe aproape toate firele au dispărut, în majoritatea cazurilor.', 'bucurie', cap='Îi spui așa: dacă vine la timp, după 5 ședințe aproape toate firele au dispărut, în majoritatea cazurilor.')]},
    page_title(5, 5, 'Ședințele *și setările*', 'calendar-days', [
        B('Pagina cinci: ședințele, una câte una. Aici scrii și setările aparatului.', 'calendar')], 'calendar'),
    sheet_scene('epilare', 4, E[4], [
        ('Sus', 'Numele ei, ședințele din pachet, prima dată.', [
            B('Sus: numele ei, câte ședințe are în pachet și data primei ședințe.', 'fisa')], None),
        ('La fiecare ședință', 'Data, zona, setările de pe ecran, cum a reacționat pielea.', [
            B('La fiecare ședință, un rând nou: data, a câta ședință e și zona.', 'prezinta'),
            B('Apoi setările de pe ecranul aparatului: lungimea de undă, fluența, pulsul, spotul și răcirea.', 'laser'),
            B('Și cum a reacționat pielea. La final semnați amândouă.', 'aprobare')], [13.8, 9.5]),
    ], 'Ședințele *și setările*', 'Pagina 5', 'laser'),
    checklist(['Paginile 1 și 2, completate.', 'Fiecare întrebare are „Da” sau „Nu”. Mai ales soarele și ceara.', 'Fototipul și firul, bifate. Spus sincer.', 'Ea a bifat acordurile și a semnat. Și tu.', 'Testul de probă, la prima ședință.', 'Setările, pe pagina 5, la fiecare ședință.'], [
        B('La final, verifici fișa.', 'aprobare'),
        B('Fiecare întrebare are „Da” sau „Nu”. Mai ales soarele și ceara din ultimele patru săptămâni.', 'spf', cap='Fiecare întrebare are „Da” sau „Nu”. Mai ales soarele și ceara din ultimele 4 săptămâni.'),
        B('Ai bifat fototipul și firul. Ai făcut testul de probă.', 'laser'),
        B('Și la fiecare ședință scrii setările aparatului pe pagina cinci.', 'fisa', cap='Și la fiecare ședință scrii setările aparatului pe pagina 5.')]),
    outro(['Împreună cu ea', 'Soarele și ceara', 'Testul de probă', 'Setările scrise'], [
        B('Bravo! Acum știi fișa pentru epilarea laser.', 'bucurie'),
        B('Întrebi de soare și de ceară, faci testul de probă și scrii setările de fiecare dată.', 'laser'),
        B('Ne vedem în filmul următor!', 'salut-pa')]),
]}

JERRY = {
    'fisa-corporale': [(lambda s: s['type'] == 'note', {'pose': 'surprins', 'say': 'Împreună!', 'at': 1}),
                       (lambda s: s['type'] == 'big', {'pose': 'bucurie', 'say': 'Ușor!', 'at': 2}),
                       (lambda s: s['type'] == 'rail', {'pose': 'arata', 'say': 'De 4 ori!', 'at': 1}),
                       (lambda s: s['type'] == 'list', {'pose': 'arata', 'say': 'Verifică!', 'at': 0}),
                       (lambda s: s['type'] == 'outro', {'pose': 'bucurie', 'say': 'Bravo!', 'at': 0})],
    'fisa-faciale': [(lambda s: s['type'] == 'note', {'pose': 'surprins', 'say': 'Împreună!', 'at': 1}),
                     (lambda s: s['type'] == 'cards', {'pose': 'zambeste', 'say': 'De la I la VI', 'at': 1}),
                     (lambda s: s['type'] == 'list', {'pose': 'arata', 'say': 'Verifică!', 'at': 0}),
                     (lambda s: s['type'] == 'outro', {'pose': 'bucurie', 'say': 'Bravo!', 'at': 0})],
    'fisa-epilare': [(lambda s: s['type'] == 'yn', {'pose': 'surprins', 'say': 'Sincer!', 'at': 1}),
                     (lambda s: s['type'] == 'sessions', {'pose': 'bucurie', 'say': 'La timp!', 'at': 1}),
                     (lambda s: s['type'] == 'list', {'pose': 'arata', 'say': 'Verifică!', 'at': 0}),
                     (lambda s: s['type'] == 'outro', {'pose': 'bucurie', 'say': 'Bravo!', 'at': 0})],
}


def jerry(fid, S):
    for pred, j in JERRY.get(fid, []):
        for sc in S['scenes']:
            if pred(sc) and 'jerry' not in sc:
                sc['jerry'] = dict(j, x=520)
                break


def main():
  for fid, S in P.items():
      jerry(fid, S)
      d = os.path.join(HERE, '..', fid)
      os.makedirs(d, exist_ok=True)
      txt = json.dumps(S, ensure_ascii=False, indent=1)
      assert '—' not in txt and '–' not in txt
      open(os.path.join(d, 'script.json'), 'w', encoding='utf8').write(txt)
      n = sum(len(sc.get('beats', [])) for sc in S['scenes'])
      print(fid, len(S['scenes']), 'scenes', n, 'lines')


if __name__ == '__main__':
    main()
