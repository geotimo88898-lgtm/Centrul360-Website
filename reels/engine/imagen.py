#!/usr/bin/env python3
"""Ilustrațiile AI ale unui reel v2 (scenele "panel"): python3 imagen.py <id> [--dry]
Fiecare vizual cu "prompt" (de obicei type "panel", cu "name") primește o imagine în stilul temei (themes.json →
imagery + paleta). Cache după hash-ul promptului (engine/img/<hash>.png, local); scripts/<id>/images.json leagă
numele de fișier. Limită: cel mult 8 imagini pe reel (MAX_IMAGES); numărul se scrie în log.
Modelul: Imagen pe Vertex (IMAGEN_MODEL) dacă proiectul îl are, altfel Gemini image (gemini-2.5-flash-image), cu
aceeași cheie VERTEX_API_KEY (niciodată afișată). Pe cheia noastră (12.11) Imagen 4 răspunde 404, deci se folosește
Gemini image (~0,04 $ imaginea).
NICIODATĂ oameni, fețe sau corpuri (nici ca „rezultat”, nici înainte/după): doar straturi abstracte de piele, aparate,
obiecte, iconițe, decoruri. Fără text în imagine. Dacă generarea dă greș, motorul desenează scena din cod."""
import base64, hashlib, json, os, sys, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
MAX_IMAGES = 8
KEY = os.environ.get('VERTEX_API_KEY', '')
IMAGEN_MODEL = os.environ.get('IMAGEN_MODEL', 'imagen-4.0-generate-001')
GEMINI_IMAGE = os.environ.get('GEMINI_IMAGE_MODEL', 'gemini-2.5-flash-image')
RULES = ('Absolutely no people, no faces, no human bodies or body parts, no hands, no skin of a person, no before/after, '
         'no text, no letters, no numbers, no logos, no watermark. Clean composition, one clear subject, lots of empty space '
         'around it, soft depth of field, vertical format.')


def call(url, body):
    for k in range(5):
        try:
            return json.load(urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}), timeout=180))
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:200]
            if e.code in (429, 500, 503) and k < 4: time.sleep(6 * (k + 1)); continue
            raise RuntimeError('HTTP %d %s' % (e.code, msg))


def gen_imagen(prompt, ar):
    url = 'https://aiplatform.googleapis.com/v1/publishers/google/models/%s:predict?key=%s' % (IMAGEN_MODEL, KEY)
    r = call(url, {'instances': [{'prompt': prompt}], 'parameters': {'sampleCount': 1, 'aspectRatio': ar, 'personGeneration': 'dont_allow'}})
    return base64.b64decode(r['predictions'][0]['bytesBase64Encoded'])


def gen_gemini(prompt, ar):
    url = 'https://aiplatform.googleapis.com/v1/publishers/google/models/%s:generateContent?key=%s' % (GEMINI_IMAGE, KEY)
    body = {'contents': [{'role': 'user', 'parts': [{'text': prompt}]}],
            'generationConfig': {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': ar}}}
    r = call(url, body)
    for p in r['candidates'][0]['content']['parts']:
        if 'inlineData' in p: return base64.b64decode(p['inlineData']['data'])
    raise RuntimeError('no image in the answer')


def panels(S):
    out = []
    def walk(o):
        if isinstance(o, dict):
            if o.get('prompt') and o.get('name'): out.append(o)
            for v in o.values(): walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk(S)
    return out


def main():
    rid = sys.argv[1]; dry = '--dry' in sys.argv
    base = os.path.join(HERE, '..', 'scripts', rid)
    S = json.load(open(os.path.join(base, 'script.json')))
    TH = json.load(open(os.path.join(HERE, 'themes.json')))['themes'][S['theme']]
    P = panels(S)
    if len(P) > MAX_IMAGES: sys.exit('%d images asked, the limit is %d per reel' % (len(P), MAX_IMAGES))
    os.makedirs(os.path.join(HERE, 'img'), exist_ok=True)
    pal = TH['palette']
    style = TH.get('imagery', '') + '. Colour palette: background %s, accents %s and %s.' % (pal['bg'], pal['acc'], pal['acc2'])
    mp = os.path.join(base, 'images.json')
    M = json.load(open(mp)) if os.path.exists(mp) else {}
    made = cached = 0
    for p in P:
        ar = p.get('ar', '3:4' if p.get('fit') != 'full' else '9:16')
        prompt = p['prompt'].rstrip('.') + '. Style: ' + style + ' ' + RULES
        h = hashlib.sha1((prompt + ar).encode()).hexdigest()[:16]
        f = h + '.png'; path = os.path.join(HERE, 'img', f)
        if os.path.exists(path): cached += 1
        elif dry: print('would make', p['name'], ar, '|', p['prompt'][:90]); continue
        else:
            if not KEY: sys.exit('VERTEX_API_KEY is missing')
            data = None
            for fn in (gen_imagen, gen_gemini):
                try: data = fn(prompt, ar); print('  %s via %s' % (p['name'], fn.__name__)); break
                except Exception as e: print('  %s: %s failed: %s' % (p['name'], fn.__name__, str(e)[:16]))
            if not data: print('  %s: no image, the engine draws it from code' % p['name']); continue
            open(path, 'wb').write(data); made += 1
        M[p['name']] = {'file': f, 'prompt': p['prompt'], 'ar': ar}
    json.dump(M, open(mp, 'w'), ensure_ascii=False, indent=1)
    print('%s: %d panels, %d made now, %d from cache (limit %d)' % (rid, len(P), made, cached, MAX_IMAGES))


if __name__ == '__main__':
    main()
