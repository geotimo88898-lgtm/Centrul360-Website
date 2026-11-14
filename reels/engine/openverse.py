#!/usr/bin/env python3
"""Sunete reale cu licență liberă pentru reels, din Openverse (api.openverse.org, fără cheie).

Doar licențe fără obligații: CC0 și Public Domain Mark (merg comercial, fără atribuire). CC BY doar cu
--allow-by (cere credit în descriere). Niciodată NC, ND sau SA.

  python3 openverse.py search "whoosh" [--max 3.0] [--n 10] [--allow-by]
        caută și afișează (id, durată, licență, autor, titlu)
  python3 openverse.py get <id> --as whoosh_s [--trim 1.2]
        descarcă, taie liniștea de la început, normalizează, scrie sfx/ov/<categorie>_<id8>.wav (48 kHz)
        și adaugă intrarea în openverse-library.json (comis: sursa, autorul, licența)
  python3 openverse.py library [--per 4]
        construiește biblioteca: pentru fiecare categorie din QUERIES ia primele sunete potrivite (durată, licență)
  python3 openverse.py fetch
        refă fișierele din openverse-library.json pe o mașină nouă (sfx/ e în .gitignore)

Fișierele audio nu se comit (sfx/ e ignorat); se comite doar openverse-library.json, ca proveniența să fie clară
și biblioteca să se poată reface oricând."""
import argparse, json, os, subprocess, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'sfx', 'ov')
LIB = os.path.join(HERE, 'openverse-library.json')
API = 'https://api.openverse.org/v1/audio/'
UA = {'User-Agent': 'reels-sfx-fetcher/1.0'}
SAFE = {'cc0', 'pdm'}

# categoriile motorului (aceleași nume ca sfx.py) -> căutări și durata maximă în secunde
QUERIES = {
    'whoosh_s': (['whoosh short', 'swoosh fast', 'swish'], 1.2),
    'whoosh_l': (['whoosh', 'air whoosh', 'woosh transition'], 2.5),
    'swoosh': (['swoosh', 'swipe whoosh'], 1.5),
    'tick': (['tick', 'clock tick single', 'soft tick'], 0.4),
    'click': (['ui click', 'mouse click soft', 'button click'], 0.4),
    'key': (['keyboard key single', 'typing key', 'keystroke'], 0.4),
    'pop': (['pop soft', 'bubble pop', 'mouth pop'], 0.6),
    'riser': (['riser', 'tension riser', 'reverse cymbal'], 4.0),
    'impact': (['impact soft', 'cinematic hit', 'thud deep'], 2.5),
    'shimmer': (['shimmer', 'magic sparkle', 'glitter chime'], 2.5),
    'chime': (['chime', 'bell ding soft', 'notification chime'], 2.0),
    'paper': (['paper flip', 'page turn', 'paper slide'], 1.2),
    'snap': (['snap', 'finger snap', 'magnet snap'], 0.6),
    'shutter': (['camera shutter', 'shutter click'], 0.8),
    'tire': (['tire screech short', 'car drift'], 3.0),
}


def api(params, tries=4):
    url = API + '?' + urllib.parse.urlencode(params)
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and i < tries - 1:
                time.sleep(2 ** (i + 2)); continue
            raise
    return {}


def search(q, max_s=3.0, n=10, allow_by=False):
    lic = 'cc0,pdm,by' if allow_by else 'cc0,pdm'
    d = api({'q': q, 'license': lic, 'source': 'freesound', 'page_size': 20, 'mature': 'false'})
    out = []
    for r in d.get('results', []):
        dur = (r.get('duration') or 0) / 1000
        if not r.get('url') or dur <= 0 or dur > max_s:
            continue
        if r.get('license') not in SAFE and not (allow_by and r.get('license') == 'by'):
            continue
        out.append(r)
        if len(out) >= n:
            break
    return out


def load_lib():
    try:
        return json.load(open(LIB))
    except FileNotFoundError:
        return {'note': 'Sunete Openverse (Freesound), doar CC0/PDM. Fișierele: sfx/ov/ (ignorat); refaci cu: python3 openverse.py fetch', 'sounds': []}


def save_lib(lib):
    lib['sounds'].sort(key=lambda s: (s['as'], s['id']))
    with open(LIB, 'w') as f:
        json.dump(lib, f, ensure_ascii=False, indent=1)
        f.write('\n')


def download(entry, trim=None):
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, entry['file'])
    tmp = dst + '.src'
    try:
        with urllib.request.urlopen(urllib.request.Request(entry['url'], headers=UA), timeout=60) as r, open(tmp, 'wb') as f:
            f.write(r.read())
    except urllib.error.HTTPError as e:
        if e.code == 403:
            # 14.11: cdn.freesound.org răspunde 403 serverelor din cloud (refuzul vine de la CDN, nu de la proxy).
            # Pe o mașină unde descărcarea merge, comenzile de mai sus funcționează neschimbate.
            raise SystemExit(f"{urllib.parse.urlparse(entry['url']).netloc} refuză descărcarea de pe mașina asta (403)")
        raise
    af = 'silenceremove=start_periods=1:start_threshold=-50dB,loudnorm=I=-20:TP=-3:LRA=11'
    if trim:
        af += f',atrim=0:{trim},afade=t=out:st={max(0, trim - 0.08)}:d=0.08'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', af, '-ar', '48000', '-ac', '2', dst], check=True)
    os.remove(tmp)
    return dst


def entry_of(r, as_, trim=None):
    return {
        'id': r['id'], 'as': as_, 'file': f"{as_}_{r['id'][:8]}.wav", 'title': r.get('title'),
        'creator': r.get('creator'), 'license': r.get('license'), 'license_version': r.get('license_version'),
        'license_url': r.get('license_url'), 'landing': r.get('foreign_landing_url'), 'url': r.get('url'),
        'duration_s': round((r.get('duration') or 0) / 1000, 2), 'trim': trim,
    }


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('search'); s.add_argument('q'); s.add_argument('--max', type=float, default=3.0)
    s.add_argument('--n', type=int, default=10); s.add_argument('--allow-by', action='store_true')
    g = sub.add_parser('get'); g.add_argument('id'); g.add_argument('--as', dest='as_', required=True)
    g.add_argument('--trim', type=float)
    l = sub.add_parser('library'); l.add_argument('--per', type=int, default=4)
    sub.add_parser('fetch')
    a = ap.parse_args()

    if a.cmd == 'search':
        for r in search(a.q, a.max, a.n, a.allow_by):
            print(f"{r['id']}  {r['duration'] / 1000:5.2f}s  {r['license']:4}  {(r.get('creator') or '')[:18]:18}  {(r.get('title') or '')[:60]}")
        return

    lib = load_lib()
    have = {s['id'] for s in lib['sounds']}

    if a.cmd == 'get':
        with urllib.request.urlopen(urllib.request.Request(API + a.id + '/', headers=UA), timeout=30) as r:
            rec = json.load(r)
        if rec.get('license') not in SAFE:
            sys.exit(f"licența {rec.get('license')} nu e CC0/PDM; nu o adaug în bibliotecă")
        e = entry_of(rec, a.as_, a.trim)
        download(e, a.trim)
        if e['id'] not in have:
            lib['sounds'].append(e)
        save_lib(lib)
        print('ok', e['file'])
        return

    if a.cmd == 'library':
        for cat, (qs, max_s) in QUERIES.items():
            got = [s for s in lib['sounds'] if s['as'] == cat]
            for q in qs:
                if len(got) >= a.per:
                    break
                for r in search(q, max_s, a.per * 2):
                    if len(got) >= a.per:
                        break
                    if r['id'] in have:
                        continue
                    e = entry_of(r, cat, max_s)
                    try:
                        download(e, max_s)
                    except Exception as ex:
                        print('skip', r['id'], ex); continue
                    lib['sounds'].append(e); have.add(e['id']); got.append(e)
                time.sleep(1)
            print(f'{cat:10} {len(got)}')
        save_lib(lib)
        return

    if a.cmd == 'fetch':
        for e in lib['sounds']:
            if not os.path.exists(os.path.join(OUT, e['file'])):
                download(e, e.get('trim')); print('ok', e['file'])
        return


if __name__ == '__main__':
    main()
