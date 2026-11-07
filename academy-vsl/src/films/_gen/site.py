#!/usr/bin/env python3
"""The three website films (16:9, 1920×1080, 60-100 s; FMT = '45' for the old 4:5), from the words already on the site (v2): home, Grăsime localizată,
Gușă și bărbie dublă. Real photos only (brand_asset/catalog), the real rating (5,0, 300+ Google reviews),
no prices, "rezultatele diferă".  python3 site.py"""
import json, os
from fise import B

HERE = os.path.dirname(os.path.abspath(__file__))
CAT = 'brand_asset/catalog/'


def intro(kicker, title, sub, beats):
    return {'type': 'intro', 'kicker': kicker, 'title': title, 'sub': sub, 'nuki': 'r', 'pose': 'salut-pa', 'beats': beats}


def proof(items, beats, jerry=None):
    sc = {'type': 'compare', 'kicker': 'Poze reale din clinică', 'head': 'Nu promitem. *Îți arătăm.*', 'nuki': 'off', 'ih': 560 if FMT == '45' else 430,
          'items': [{'img': CAT + f, 't': t, 'at': a} for f, t, a in items], 'beats': beats, 'fit': 'contain'}
    if jerry: sc['jerry'] = jerry
    return sc


def stars(beats, jerry):
    return {'type': 'big', 'kicker': 'Google', 'value': 5, 'from': 0, 'dec': 1, 'label': 'din *300+ recenzii*', 'sub': 'Timișoara și Arad', 'subAt': 0.5,
            'nuki': 'l', 'pose': 'stea-google', 'beats': beats, 'jerry': jerry}


def cta(beats, items):
    return {'type': 'outro', 'kicker': 'Primul pas', 'title': 'Consultația *gratuită*', 'chap': 'Programează-te', 'nuki': 'l', 'pose': 'cadou',
            'brandSub': 'Timișoara · Arad', 'endLine': 'Programează-te chiar pe pagina asta.',
            'items': [{'t': t, 'at': 0.4 + i * 0.35} for i, t in enumerate(items)], 'beats': beats,
            'jerry': {'pose': 'bucurie', 'say': 'Te așteptăm!', 'at': 1, 'x': 470}}


FMT = '169'  # the website films are landscape (16:9); '45' makes them 1080×1350
F = {}
F['site-acasa'] = {'id': 'site-acasa', 'fmt': FMT, 'title': 'Centrul360', 'short': 'Centrul360', 'chap': 'Centrul360', 'scenes': [
    intro('Timișoara și Arad', 'Rezultate pe care le *vezi*', 'Medicină estetică non-invazivă, pentru corp și față.', [
        B('Bună! Eu sunt Nuki, de la Centrul360.', 'salut-pa', tts='Bună! Eu sunt Nuki, de la Centrul trei sute șaizeci.'),
        B('Ai încercat tratamente care promit mult, dar nu se văd?', 'gandeste')]),
    {'type': 'note', 'variant': 'why', 'label': 'Nu e vina ta', 'text': 'Nu trebuie să știi dinainte *ce tratament îți trebuie*.', 'nuki': 'l', 'pose': 'mana-inima', 'beats': [
        B('Nu e vina ta. Nu trebuie să știi dinainte ce tratament îți trebuie.', 'mana-inima'),
        B('La consultația gratuită ne uităm la ce vrei tu și îți propunem ce ți se potrivește.', 'fisa')]},
    {'type': 'list', 'kicker': 'Ce facem', 'head': 'Corp, față *și epilare laser*', 'nuki': 'off', 'pose': 'prezinta', 'items': [
        {'ic': 'person-standing', 't': 'Corp: grăsime localizată, celulită, tonifiere', 'at': 0.2, 'noTick': True},
        {'ic': 'smile', 't': 'Față: riduri, gușă, pete, ten', 'at': 0.5, 'noTick': True},
        {'ic': 'zap', 't': 'Epilare laser, în Timișoara', 'at': 0.8, 'noTick': True}], 'beats': [
        B('Lucrăm pentru corp, pentru față și facem epilare laser, cu aparatură medicală certificată.', 'prezinta')]},
    {'type': 'list', 'kicker': 'Fără grijă', 'head': 'Totul *fără*', 'nuki': 'off', 'pose': 'aprobare', 'items': [
        {'ic': 'syringe', 't': 'Fără ace', 'at': 0.3, 'noTick': True}, {'ic': 'scissors', 't': 'Fără operație', 'at': 0.55, 'noTick': True},
        {'ic': 'bed-double', 't': 'Fără anestezie', 'at': 0.8, 'noTick': True}, {'ic': 'calendar-check', 't': 'Fără recuperare', 'at': 1, 'noTick': True}], 'beats': [
        B('Fără ace, fără operație, fără anestezie.', 'aprobare'),
        B('Și fără recuperare. Pleci și îți vezi de zi.', 'bucurie')]},
    proof([('cazul-04-liposonix-abdomen.webp', 'Abdomen · Liposonix', 0.3), ('cazul-02-hifu-gusa.webp', 'Gușă · HIFU', 0.8)], [
        B('Nu promitem. Îți arătăm. Acestea sunt cliente de-ale noastre, fotografiate la noi.', 'prezinta'),
        B('Rezultatele diferă de la o persoană la alta.', 'liniste')]),
    stars([B('Avem nota cinci pe Google, din peste trei sute de recenzii.', 'stea-google', cap='Avem nota 5,0 pe Google, din peste 300 de recenzii.')],
          {'pose': 'surprins', 'say': 'Cinci?!', 'at': 0.4, 'x': 470}),
    {'type': 'note', 'variant': 'tip', 'label': 'Cadoul tău', 'text': 'Consultația e gratuită. *Masajul facial e cadou.*', 'ic': 'gift', 'nuki': 'r', 'pose': 'cadou', 'beats': [
        B('Consultația e gratuită, fără nicio obligație. Iar masajul facial e cadou.', 'cadou')]},
    cta([B('Te programezi chiar aici, pe pagina asta, în câteva secunde.', 'telefon'),
         B('Alegi clinica, ziua și ora, iar confirmarea îți vine pe WhatsApp. Te așteptăm!', 'salut-pa')],
        ['Consultație gratuită', 'Masaj facial cadou', 'Confirmare pe WhatsApp']),
]}

F['site-grasime-localizata'] = {'id': 'site-grasime-localizata', 'fmt': FMT, 'title': 'Grăsime localizată', 'short': 'Grăsime localizată', 'chap': 'Grăsime localizată', 'scenes': [
    intro('Liposonix · Timișoara și Arad', 'Grăsimea care *nu cedează*', 'Fără bisturiu, fără ace, fără recuperare.', [
        B('Mănânci atent, faci mișcare, dar burtica de jos tot nu pleacă?', 'gandeste'),
        B('Bună, eu sunt Nuki. Îți arăt de ce.', 'salut-pa')]),
    {'type': 'note', 'variant': 'why', 'label': 'Nu e vina ta', 'text': 'Acolo grăsimea e *rezistentă* la dietă și sport.', 'nuki': 'l', 'pose': 'mana-inima', 'beats': [
        B('Abdomenul de jos, colăceii, interiorul coapselor. Acolo grăsimea e rezistentă la dietă și sport.', 'centimetru'),
        B('Poți slăbi peste tot, iar zonele astea rămân. Nu e vina ta.', 'mana-inima')]},
    {'type': 'layers', 'mode': 'lipo', 'kicker': 'Cum funcționează', 'head': 'Ultrasunete care țintesc *doar grăsimea*', 'nuki': 'off',
     'waveAt': 0, 'hitAt': 1, 'goneAt': 2,
     'steps': [{'t': 'Ultrasunetele trec prin piele fără s-o afecteze', 'at': 0}, {'t': 'Celulele de grăsime din zonă sunt distruse', 'at': 1}, {'t': 'Corpul le elimină natural, în săptămânile următoare', 'at': 2}], 'beats': [
        B('Liposonix folosește ultrasunete care trec prin piele fără să o afecteze.', 'liposonix'),
        B('Celulele de grăsime din zona țintită sunt distruse.', 'liposonix'),
        B('Iar corpul le elimină singur, natural, în săptămânile următoare.', 'liposonix')]},
    {'type': 'list', 'kicker': 'Cum se simte', 'head': 'Tu stai întinsă. *Aparatul lucrează.*', 'nuki': 'l', 'pose': 'liniste', 'items': [
        {'ic': 'scissors', 't': 'Fără bisturiu', 'at': 0.2, 'noTick': True}, {'ic': 'syringe', 't': 'Fără ace', 'at': 0.45, 'noTick': True},
        {'ic': 'calendar-check', 't': 'Fără recuperare', 'at': 0.7, 'noTick': True}], 'beats': [
        B('Fără bisturiu, fără ace, fără recuperare.', 'liniste'),
        B('Simți căldură și o presiune ușoară, apoi te întorci imediat la ce aveai de făcut.', 'aprobare')],
     'jerry': {'pose': 'bucurie', 'say': 'Atât de simplu?', 'at': 1, 'x': 470}},
    proof([('cazul-04-liposonix-abdomen.webp', 'Abdomen · Liposonix', 0.3), ('cazul-14-liposonix-abdomen-total-arad.webp', 'Abdomen · Liposonix · Arad', 0.8)], [
        B('Nu promitem. Îți arătăm. Clientele noastre, fotografiate la noi.', 'prezinta'),
        B('Diferența se vede în general la șase-opt săptămâni. Rezultatele diferă de la o persoană la alta.', 'liniste', cap='Diferența se vede în general la 6-8 săptămâni. Rezultatele diferă de la o persoană la alta.')]),
    stars([B('Nota cinci pe Google, din peste trei sute de recenzii.', 'stea-google', cap='Nota 5,0 pe Google, din peste 300 de recenzii.')],
          {'pose': 'surprins', 'say': 'Wow!', 'at': 0.4, 'x': 470}),
    cta([B('Primul pas e consultația gratuită. Măsurăm zona și îți spunem sincer ce ți se potrivește.', 'centimetru'),
         B('Programează-te chiar pe pagina asta. Confirmarea vine pe WhatsApp, iar masajul facial e cadou.', 'cadou')],
        ['Consultație gratuită', 'Măsurăm zona', 'Masaj facial cadou']),
]}

F['site-gusa-barbie-dubla'] = {'id': 'site-gusa-barbie-dubla', 'fmt': FMT, 'title': 'Gușă și bărbie dublă', 'short': 'Gușă și bărbie dublă', 'chap': 'Gușă și bărbie dublă', 'scenes': [
    intro('HIFU și RF Sculpt · Timișoara și Arad', 'Bărbia dublă, *și fără kilograme în plus*', 'Fără operație, fără cicatrici, fără recuperare.', [
        B('Ai bărbie dublă, deși nu ai kilograme în plus?', 'gandeste'),
        B('Bună, eu sunt Nuki. Uite ce se întâmplă.', 'salut-pa')]),
    {'type': 'note', 'variant': 'why', 'label': 'Nu e vina ta', 'text': 'Grăsime localizată *și piele relaxată*.', 'nuki': 'l', 'pose': 'mana-inima', 'beats': [
        B('Gușa apare dintr-un mix de grăsime localizată și piele relaxată, din genetică sau vârstă.', 'oglinda'),
        B('Sportul singur rareori rezolvă zona asta. Nu e vina ta.', 'mana-inima')]},
    {'type': 'layers', 'mode': 'hifu', 'kicker': 'Cum funcționează', 'head': 'Energie în profunzime. *Contur redefinit.*', 'nuki': 'off',
     'waveAt': 0, 'hitAt': 0.5, 'goneAt': 1,
     'steps': [{'t': 'HIFU: puncte de energie în stratul profund', 'at': 0}, {'t': 'Țesutul se contractă și se ridică', 'at': 1}, {'t': 'Colagen nou: conturul se definește', 'at': 2}], 'beats': [
        B('HIFU trimite puncte de energie în stratul profund al pielii.', 'hifu-fata', tts='Hifu trimite puncte de energie în stratul profund al pielii.'),
        B('Țesutul se contractă și se ridică.', 'hifu-fata'),
        B('Apoi se formează colagen nou, iar conturul se definește în săptămânile următoare.', 'aprobare')]},
    {'type': 'list', 'kicker': 'Cum se simte', 'head': 'Te întorci *imediat* la ale tale', 'nuki': 'l', 'pose': 'liniste', 'items': [
        {'ic': 'scissors', 't': 'Fără operație', 'at': 0.2, 'noTick': True}, {'ic': 'sparkles', 't': 'Fără cicatrici', 'at': 0.45, 'noTick': True},
        {'ic': 'calendar-check', 't': 'Fără recuperare', 'at': 0.7, 'noTick': True}], 'beats': [
        B('Fără operație, fără cicatrici, fără recuperare.', 'liniste'),
        B('Simți căldură și ușoare furnicături, apoi îți vezi de zi.', 'aprobare')],
     'jerry': {'pose': 'bucurie', 'say': 'Fără cicatrici!', 'at': 1, 'x': 470}},
    proof([('cazul-02-hifu-gusa.webp', 'Gușă · HIFU', 0.3), ('cazul-35-rf-sculpt-tm.webp', 'Bărbie și gât · RF Sculpt', 0.8)], [
        B('Nu promitem. Îți arătăm. Clientele noastre, fotografiate la noi.', 'prezinta'),
        B('Conturul se redefinește treptat, cu efect maxim la opt-douăsprezece săptămâni. Rezultatele diferă de la o persoană la alta.', 'liniste', cap='Conturul se redefinește treptat, cu efect maxim la 8-12 săptămâni. Rezultatele diferă de la o persoană la alta.')]),
    stars([B('Nota cinci pe Google, din peste trei sute de recenzii.', 'stea-google', cap='Nota 5,0 pe Google, din peste 300 de recenzii.')],
          {'pose': 'surprins', 'say': 'Wow!', 'at': 0.4, 'x': 470}),
    cta([B('Primul pas e consultația gratuită. Ne uităm la contur și îți spunem sincer ce ți se potrivește.', 'oglinda'),
         B('Programează-te chiar pe pagina asta. Confirmarea vine pe WhatsApp, iar masajul facial e cadou.', 'cadou')],
        ['Consultație gratuită', 'Plan pentru tine', 'Masaj facial cadou']),
]}

for fid, S in F.items():
    if FMT != '45':  # Jerry's x was set for the 1080 wide frame: in 16:9 the engine places him by Nuki's side
        for sc in S['scenes']:
            if 'jerry' in sc: sc['jerry'].pop('x', None)
    d = os.path.join(HERE, '..', fid)
    os.makedirs(d, exist_ok=True)
    txt = json.dumps(S, ensure_ascii=False, indent=1)
    assert '—' not in txt and '–' not in txt
    open(os.path.join(d, 'script.json'), 'w', encoding='utf8').write(txt)
    print(fid, len(S['scenes']), 'scenes', sum(len(x['beats']) for x in S['scenes']), 'lines')
