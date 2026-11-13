#!/usr/bin/env python3
"""Fondul muzical al reels-urilor: clipuri instrumentale de la Lyria (Vertex), ~32 s fiecare, pe stări (moods).
Fiecare temă (themes.json) cere o stare; mix.py ia un clip din starea ei (ales după id) și îl leagă cu crossfade dacă
reel-ul e mai lung. Clipurile existente nu se refac (se plătesc: ~0,06 $ clipul).
  python3 music.py <mood> [n]   → music/<mood>00.wav ...   (mood: pop, chill, tension, future, cinematic, funky)
  python3 music.py <n>          → ca înainte: n clipuri pop
  python3 music.py all [n]      → n clipuri (implicit 2) din fiecare stare care nu are încă
Cheia din VERTEX_API_KEY, niciodată afișată."""
import base64, json, os, sys, urllib.request, time

HERE = os.path.dirname(os.path.abspath(__file__))
TAIL = ' Steady groove from the first second, no long intro, no build-ups, no big drops, no vocals, clean modern mix.'
MOODS = {
    'pop': ('Light, upbeat, catchy modern pop instrumental for a fun short social video. Bouncy plucked synths, bright claps, '
            'finger snaps, punchy but soft kick, warm bass, playful and positive, TikTok style, clean mix. '
            '112 BPM, major key, steady groove from the first second, no long intro, no build-ups, no drops, no vocals.'),
    'chill': ('Smooth lo-fi chillhop instrumental for a calm explainer video: mellow Rhodes keys, soft vinyl texture, '
              'laid-back dusty drums, warm round bass, gentle and catchy, 88 BPM, major seventh chords.' + TAIL),
    'tension': ('Curious, light suspense electronic underscore for a mystery explainer: ticking hi-hats, plucked minor '
                'arpeggio, soft deep bass pulse, subtle clock-like percussion, intriguing but friendly, never scary, 100 BPM.' + TAIL),
    'future': ('Airy melodic future-house instrumental: shimmering pads, soft side-chained chords, crisp claps, glassy plucks, '
               'uplifting and modern, premium tech feel, 120 BPM.' + TAIL),
    'cinematic': ('Elegant minimal cinematic-pop underscore for a premium beauty explainer: soft piano ostinato, pulsing staccato '
                  'strings, gentle percussion, warm and curious, 104 BPM.' + TAIL),
    'funky': ('Playful funky upbeat instrumental for a fun myth-busting video: slap bass, muted funk guitar, claps, '
              'soft brass stabs, groovy and cheeky, 110 BPM.' + TAIL),
}
MOODS.update({
    # original, catchy, trending-feeling grooves (the owner, 13.11); never a specific song's melody, lyrics or title
    # the reference the owner likes (a 90s house classic) measured on 13.11, as a style reference only (nothing of its audio
    # is used): ~123 BPM, F major, a short intro then a steady high-energy groove. The prompt asks for that feel, never its melody.
    'house90': ('Uplifting 90s-inspired house groove in a major key: bright gospel-style piano chord stabs, warm organ, punchy '
                'four-on-the-floor kick, bouncy round bass on the off-beats, crisp open hi-hats with a light shuffle, catchy wordless '
                'vocal chops, feel-good summer energy, 123 BPM. Steady groove from the first second, no long intro, no lyrics, '
                'clean modern mix.'),
    'garage': ('UK garage 2-step shuffle: swung hi-hats, skippy kick and snare, deep warm sub bass, glossy chord stabs, catchy '
               'pitched wordless vocal chops, feel-good late-night energy, 132 BPM. Steady from the first second, no long intro, '
               'no lyrics, clean modern mix.'),
    'nudisco': ('Nu-disco groove with a funky clean guitar riff, slap-style bass, four-on-the-floor kick, claps, shimmering strings, '
                'warm and catchy, 118 BPM. Steady from the first second, no lyrics, clean modern mix.'),
    'afrohouse': ('Afro house groove: rolling percussive toms and shakers, deep warm bass, airy marimba hook, hypnotic and catchy, '
                  '122 BPM. Steady from the first second, no lyrics, clean modern mix.'),
    'lofihouse': ('Lo-fi house with a filtered catchy chord hook, dusty drums, warm tape saturation, mellow and groovy, 120 BPM. '
                  'Steady from the first second, no lyrics, clean modern mix.'),
})
NEG = 'vocals, singing, voice, choir, heavy drums, distortion, aggressive, sad, horror, slow intro, sudden changes, silence'
NEG_CHOPS = 'lyrics, words, spoken voice, rap, singing words, distortion, aggressive, sad, horror, slow intro, sudden changes, silence'


def make(mood, n):
    key = os.environ['VERTEX_API_KEY']
    url = 'https://aiplatform.googleapis.com/v1/publishers/google/models/lyria-002:predict?key=' + key
    os.makedirs(os.path.join(HERE, 'music'), exist_ok=True)
    made = 0
    for i in range(n):
        out = os.path.join(HERE, 'music', '%s%02d.wav' % (mood, i))
        if os.path.exists(out): continue
        neg = NEG_CHOPS if 'vocal chops' in MOODS[mood] else NEG
        body = {'instances': [{'prompt': MOODS[mood], 'negative_prompt': neg, 'seed': 360 + i + 17 * len(mood)}], 'parameters': {}}
        for k in range(4):
            try:
                r = json.load(urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'}), timeout=240))
                open(out, 'wb').write(base64.b64decode(r['predictions'][0]['bytesBase64Encoded'])); print('ok', out); made += 1; break
            except Exception as e:
                print('retry', mood, i, str(e)[:120]); time.sleep(5)
    return made


if __name__ == '__main__':
    a = sys.argv[1:] or ['3']
    if a[0].isdigit(): print('clips made:', make('pop', int(a[0])))
    elif a[0] == 'all': print('clips made:', sum(make(m, int(a[1]) if len(a) > 1 else 2) for m in MOODS))
    else: print('clips made:', make(a[0], int(a[1]) if len(a) > 1 else 2))
