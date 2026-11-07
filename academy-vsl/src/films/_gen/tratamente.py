#!/usr/bin/env python3
"""Writes the 17 treatment films (one per scheme in api/_lib/academy-extra.js), only from what the scheme says:
what, for whom, benefits, steps, what she says, contraindications, after, sessions, interval, combinations.
No prices, no device settings, nothing invented.  node -e (see make.sh) → schemes.json, then: python3 tratamente.py"""
import json, os
from fise import B

HERE = os.path.dirname(os.path.abspath(__file__))
SCH = {s['id']: s for s in json.load(open(os.path.join(HERE, 'schemes.json'), encoding='utf8'))}
NAME = {k: v['name'] for k, v in SCH.items()}

# the name with its accent word, Nuki's pose, the icon, and the numbers said in words
META = {
    'restart': ('Tratament facial *Restart*', 'facial', 'sparkles', 'șaizeci de minute', 'una, apoi întreținere', 'o dată pe lună'),
    'hidratare': ('Hidratare *profundă*', 'facial', 'droplets', 'șaizeci de minute', 'două până la patru', ''),
    'antirid': ('Tratament *antirid*', 'facial', 'sparkles', 'șaizeci de minute', 'patru', ''),
    'redness': ('Redness *Relief*', 'facial', 'flower-2', 'cincizeci de minute', 'patru', ''),
    'sebum': ('Sebum *Off*', 'facial', 'scan-face', 'o sută zece minute', 'patru până la șase', ''),
    'mn-pdrn': ('Microneedling *Exozomi PDRN*', 'facial', 'syringe', 'șaizeci de minute', 'trei până la șase', 'la patru până la șase săptămâni'),
    'mn-ochi': ('Microneedling *periocular*', 'facial', 'eye', 'treizeci de minute', 'trei', 'la patru până la șase săptămâni'),
    'hifu-fata': ('HIFU *față*', 'hifu-fata', 'radio', 'nouăzeci de minute', 'una', 'întreținere la douăsprezece până la optsprezece luni'),
    'rf-fata': ('Radiofrecvență *față*', 'facial', 'thermometer', 'treizeci de minute', 'șase până la opt', 'una sau două pe săptămână'),
    'rf-sculpt': ('RF Sculpt *față*', 'facial', 'thermometer', 'nouăzeci de minute', 'șase până la nouă', 'una sau două pe săptămână'),
    'liposonix': ('*Liposonix*', 'liposonix', 'waves', 'patruzeci și cinci de minute', '', 'minimum opt până la douăsprezece săptămâni pe aceeași zonă'),
    'cavitatie': ('*Cavitație*', 'cavitatie', 'waves', '', 'opt', ''),
    'ems': ('EMS, *tonifiere*', 'ems', 'zap', 'treizeci de minute', 'șase până la opt', 'două pe săptămână'),
    'impachetare': ('Împachetare *la cald*', 'liniste', 'flame', 'cincizeci de minute', 'șase până la opt', ''),
    'rf-corp': ('Radiofrecvență *corp*', 'prezinta', 'thermometer', 'treizeci de minute', 'șase până la opt', 'una sau două pe săptămână'),
    'hifu-corp': ('HIFU *corp*', 'hifu-fata', 'radio', 'cincizeci de minute', 'una sau două', ''),
    'epilare': ('Epilare laser *Elysion Pro*', 'laser', 'zap', '', 'șase până la opt', 'la patru până la șase săptămâni'),
}
STEP_IC = ['1', '2', '3', '4', '5', '6', '7', '8']


def spoken(s):
    """what the voice says for a line that has abbreviations"""
    r = s
    for a, b in [('SPF', 'protecție solară'), ('1-2 zile', 'una-două zile'), ('24-48 de ore', 'douăzeci și patru până la patruzeci și opt de ore'),
                 ('48 de ore', 'patruzeci și opt de ore'), ('2 săptămâni', 'două săptămâni'), ('30 de minute', 'treizeci de minute'), ('2 litri', 'doi litri'),
                 ('6 luni', 'șase luni'), ('7 zile', 'șapte zile'), ('2-4 săptămâni', 'două până la patru săptămâni'), ('4 săptămâni', 'patru săptămâni'), ('8 etape', 'opt etape')]:
        r = r.replace(a, b)
    return r if r != s else None


def line(say, pose=None, cap=None):
    t = spoken(say)
    return B(say, pose, tts=t, cap=cap)


def low(s):
    return s[0].lower() + s[1:] if s else s


def film(sid):
    s = SCH[sid]
    title, pose, ic, mins, ses, inter = META[sid]
    name = s['name']
    sc = []
    what = s['what']
    sc.append({'type': 'intro', 'kicker': 'Tratament · Training', 'title': title, 'sub': what, 'pose': 'salut-pa', 'chap': name, 'beats': [
        B('Bună! Eu sunt Nuki.', 'salut-pa'),
        line('Azi învățăm ' + name + '.', 'prezinta'),
        line('Pe scurt: ' + low(what), pose)]})
    # for whom + what she gets
    fw = s['forWho'][:3]
    sc.append({'type': 'list', 'kicker': 'Pentru cine e', 'head': 'Cui *îi recomanzi*', 'pose': 'gandeste',
               'items': [{'ic': 'user-round', 't': x, 'at': i + 1} for i, x in enumerate(fw)],
               'beats': [B('Pentru cine e?', 'gandeste')] + [line(x, ['prezinta', 'fisa', 'aprobare'][i % 3]) for i, x in enumerate(fw)]})
    if s.get('benefits'):
        bn = s['benefits'][:3]
        sc.append({'type': 'list', 'kicker': 'Ce câștigă ea', 'head': 'Ce *îi aduce*', 'pose': 'bucurie',
                   'items': [{'ic': ['sparkles', 'heart', 'star'][i], 't': x, 'at': i + 1, 'noTick': True} for i, x in enumerate(bn)],
                   'beats': [B('Și ce câștigă ea?', 'bucurie')] + [line(x, ['mana-inima', 'aprobare', 'bucurie'][i % 3]) for i, x in enumerate(bn)]})
    # the steps
    st = s['steps']
    if len(st) > 5:  # two steps per line
        pairs = [st[i:i + 2] for i in range(0, len(st), 2)]
        beats = [B('Acum, pas cu pas. Sunt ' + {6: 'șase', 7: 'șapte', 8: 'opt'}[len(st)] + ' pași.', 'prezinta')]
        items = []
        for k, p in enumerate(pairs):
            beats.append(line(' '.join(p), [pose, 'prezinta'][k % 2]))
            for j, x in enumerate(p):
                items.append({'t': x, 'at': k + 1 + j * 0.45})
    else:
        beats = [B('Acum, pas cu pas.', 'prezinta')] + [line(x, [pose, 'prezinta', 'fisa'][k % 3]) for k, x in enumerate(st)]
        items = [{'t': x, 'at': k + 1} for k, x in enumerate(st)]
    sc.append({'type': 'rail', 'kicker': 'Pas cu pas', 'head': 'Cum *îl faci*', 'pose': pose, 'items': items, 'beats': beats})
    sc.append({'type': 'note', 'variant': 'tip', 'label': 'Setările aparatului', 'text': 'Le iei din *protocolul aparatului*. Nu le ghicești.', 'pose': 'fisa', 'ic': 'settings',
               'extra': {'ic': 'pen-line', 't': 'Le scrii pe fișa ei, la fiecare ședință.', 'at': 1}, 'beats': [
        B('Setările aparatului le iei din protocolul aparatului. Nu le ghicești.', 'fisa'),
        B('Și le scrii pe fișa ei, la fiecare ședință.', 'aprobare')]})
    # what she says
    says = s['say'][:4]
    for k in range(0, len(says), 2):
        part = says[k:k + 2]
        first = k == 0
        sc.append({'type': 'chat', 'kicker': 'Ce îi spui', 'head': 'Pe înțeles, *în timpul tratamentului*', 'pose': 'mana-inima',
                   'lines': [{'who': 'me', 't': x, 'at': i + (1 if first else 0), 'small': len(x) > 110} for i, x in enumerate(part)],
                   'beats': ([B('Ce îi spui în timpul tratamentului? Ceva simplu, care o liniștește.', 'mana-inima')] if first else []) + [line('„' + x + '”', ['prezinta', 'mana-inima', 'liniste'][i % 3]) for i, x in enumerate(part)]})
    # contraindications
    co = s['contra']
    sc.append({'type': 'contra', 'kicker': 'Atenție', 'head': 'Când *nu începi*', 'pose': 'arata-jos', 'items': co, 'at': 0.5, 'step': 0.1,
               'rule': {'t': 'Are una dintre ele? Nu începi. *Întâi întrebi dacă se poate.*', 'at': 2}, 'beats': [
        B('Foarte important: când nu începi tratamentul.', 'arata-jos'),
        B('Le vezi aici, pe ecran. Le găsești și pe fișa ei, la întrebările de sănătate.', 'fisa'),
        B('Dacă are una dintre ele, nu începi. Întâi întrebi dacă se poate.', 'arata-jos')]})
    # after
    af = s['after'][:4]
    sc.append({'type': 'list', 'kicker': 'După tratament', 'head': 'Ce îi spui *să facă acasă*', 'pose': 'apa',
               'items': [{'ic': 'house', 't': x, 'at': i + 1} for i, x in enumerate(af)],
               'beats': [B('La final îi spui ce să facă acasă.', 'spf')] + [line(x, ['apa', 'spf', 'liniste', 'mana-inima'][i % 4]) for i, x in enumerate(af)]})
    # sessions and interval
    facts, beats = [], [B('Câte ședințe îi trebuie?', 'calendar')]
    if s['sessions']:
        facts.append({'ic': 'repeat', 'k': 'Ședințe', 'v': s['sessions'], 'at': 1})
        beats.append(B('Ședințe: ' + s['sessions'] + '.', 'calendar', tts='Ședințe: ' + ses + '.'))
    if s['interval']:
        facts.append({'ic': 'calendar-days', 'k': 'Interval', 'v': s['interval'], 'at': len(beats)})
        beats.append(B('Interval: ' + s['interval'] + '.', 'prezinta', tts='Interval: ' + inter + '.'))
    if s['minutes']:
        facts.append({'ic': 'timer', 'k': 'Durata', 'v': str(s['minutes']) + ' de minute', 'at': len(beats)})
        beats.append(B('O ședință durează ' + str(s['minutes']) + ' de minute.', 'liniste', tts='O ședință durează ' + mins + '.'))
    beats.append(B('Durata și intervalul le spui recepției, când o conduci. Recepția face programările.', 'receptie'))
    sc.append({'type': 'sessions', 'kicker': 'Ședințele', 'head': 'Cât *și cât de des*', 'pose': 'calendar', 'dots': 0, 'facts': facts, 'beats': beats})
    # combinations
    cb = [c for c in s.get('combos', []) if c in NAME]
    if cb:
        sc.append({'type': 'cards', 'kicker': 'Merge bine cu', 'head': 'Se *combină* cu', 'pose': 'aprobare',
                   'items': [{'ic': 'plus', 't': NAME[c], 'at': 0.4 + i * 0.3} for i, c in enumerate(cb)], 'beats': [
            line('Merge bine împreună cu ' + ' și cu '.join(NAME[c] for c in cb) + '.', 'aprobare'),
            B('Când le combini, le găsești pe toate în programul ei.', 'fisa')]})
    rec = ['Pentru cine e', 'Pas cu pas', 'Când nu începi', 'Ce face acasă']
    sc.append({'type': 'outro', 'kicker': 'Gata', 'title': '*Bravo!*', 'chap': 'Recapitulare', 'pose': 'bucurie',
               'items': [{'t': x, 'at': 1 + i * 0.3} for i, x in enumerate(rec)], 'beats': [
        line('Bravo! Acum știi ' + name + '.', 'bucurie'),
        B('Ține minte: întâi fișa și întrebările de sănătate. Apoi tratamentul, pas cu pas.', 'aprobare'),
        B('Ne vedem în filmul următor!', 'salut-pa')]})
    # sessions scene: dots only when the number is simple
    return {'id': 't-' + sid, 'title': title, 'short': name, 'chap': name, 'verified': bool(s.get('verified')), 'scenes': sc}


def main():
    for sid in SCH:
        S = film(sid)
        d = os.path.join(HERE, '..', S['id'])
        os.makedirs(d, exist_ok=True)
        txt = json.dumps(S, ensure_ascii=False, indent=1)
        assert '—' not in txt and '–' not in txt, sid
        open(os.path.join(d, 'script.json'), 'w', encoding='utf8').write(txt)
        print(S['id'], len(S['scenes']), 'scenes', sum(len(x['beats']) for x in S['scenes']), 'lines', '' if S['verified'] else '(scheme not verified)')


if __name__ == '__main__':
    main()
