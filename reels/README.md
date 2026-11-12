# Reels: mașina de video scurte organice

Reels (și un carusel de rezultate) pentru TikTok, Instagram Reels, Facebook Reels și YouTube Shorts, predate o
săptămână odată (cotele pe rețea sunt în Admin → Conținut → Setări). Educative, cu umor fin, valoare gratuită, fără
să arate a reclamă: fără preț, fără ofertă, fără „programează-te”. Totul animat (fără filmare). Vocea în română.
Din 12.11 se fac doar reels **v2** (mai jos); v1 (`stage.html`, `engine.js`) rămâne doar ca să se poată randa
reels-urile vechi (`mit-gusa-kilograme`, `fapt-hifu-gusa`, `nuki-abdomene-burtica`, `caz-18-hifu-gusa`).

## Direcția proprietarului (12.11)
- Animații foarte curate, ca video-urile virale făcute cu AI: **tot ce se spune e ilustrat** de o animație.
- Cârligul e vizual și sonor deodată: în primele 3 secunde se întâmplă ceva care îl face pe privitor să-și pună o
  întrebare (buclă deschisă); răspunsul vine la final.
- Tranziții cu sunete „wow”, efecte fine (swoosh, click de aparat foto, taste), muzică dedesubt.
- Reels-urile nu seamănă între ele: altă temă (culori, fonturi, fundal), alte animații, alt final.
- Finalul diferă după video: buclă (fără CTA), cuvânt în comentarii (doar când o conversație chiar adaugă ceva),
  site (un browser curat tastează centrul360.com și arată pagina reală) sau o întrebare către public.

## Vocea (cum vorbim; regula proprietarului, 12.11)
Vocea e a unei femei din România, de vreo 30 de ani, deșteaptă și caldă, care îi povestește ceva interesant unei
prietene, față în față. Carisma vine din claritate, ritm, un dram de umor și surpriză, nu din cuvinte mari.
- **O conversație, nu o reclamă.** Fiecare replică sună ca vorbită: întrebări înapoi („Știi zona aia…?”), mici
  reacții („Știu, și eu credeam asta”), pauze firești. Niciodată slogan, niciodată listă citită cu voce tare.
- **Umorul** vine din observații reale (telefonul, „sună logic, nu?”): cel mult o glumă ușoară pe reel, restul e
  conținut solid. Fără glume forțate, fără meme răsuflate.
- **Fără** expresii populare de umplutură (le-am încercat și sună a parodie: „cai verzi pe pereți”, „bați apa-n
  piuă”, „cioara vopsită”, „la Paștele cailor”, „ca la carte”, „să vezi minune”, „pe bune”, „ca între noi”), fără
  argou, fără entuziasm forțat („wow”, „super tare”, „bombă”), fără „hei, dragele mele”, fără „fetelor”.
- **Fără limbaj de reclamă:** „descoperă”, „transformă”, „rezultate spectaculoase”, „revoluționar”, „incredibil”,
  „nu rata”, „ofertă”, „reducere”, „programează-te”, „garantat”, „100%”, „minune”. `check2.cjs` le caută
  (listele `AD` și `CRINGE`) și oprește reel-ul.
- Nu vorbim despre defectul privitorului („Ai gușă?”), vorbim despre subiect; nu luăm în râs corpul nimănui.
- Tehnic: Gemini TTS, vocea **Callirrhoe** pe `gemini-2.5-pro-preview-tts` (alegerea proprietarului din 5 mostre,
  12.11), stilul în `engine/voice.json` (cârligul puțin mai viu, răspunsul cu o pauză firească înainte). Mostrele:
  `out/voices/`. Nuki rămâne mascota din imagine (ipostaze, reacții), nu are voce.

## Cum se face un reel v2
`scripts/<id>/script.json` cu `"v": 2`:
```json
{ "v": 2, "id": "v2-exemplu", "rubric": "Mit sau adevăr?", "theme": "swiss", "keyword": "BURTICĂ",
  "topic": "…", "topicTag": "liposonix-abdomen", "hookType": "mit", "sources": "de unde vin faptele", "post": "…",
  "hook":   { "say": "Asta topește *burtica*?", "q": "…?", "visual": { "type": "counter", "…": "…" } },
  "beats":  [ { "say": "…", "visual": { "type": "skin", "…": "…" } },
              { "say": "…", "step": "ce se schimbă în aceeași scenă" } ],
  "payoff": [ { "say": "…", "visual": { "type": "shatter", "…": "…" } } ],
  "end":    { "type": "loop | comment | site | ask", "say": "…", "…": "…" } }
```
- **Fiecare replică** (`say`; `tts` dacă se citește altfel, `cap` dacă subtitrarea e altfel; `*cuvânt*` = accent,
  animat în subtitrare și în textul cinetic) are fie `visual` (o scenă nouă), fie `step` (o schimbare a scenei
  curente: un pas din `seq`, o piesă, un cip). `pause`/`pre`: secunde în plus după/înainte.
- **hook**: 0-3 s, cu `q` (întrebarea care deschide bucla). Primul cadru e deja în mișcare (scena cârligului începe
  cu 0,3 s înainte), lovitură sonoră pe cadrul 0.
- **beats**: o mini-dezvăluire la 3-5 s, o schimbare vizuală cel mult la 2,5 s.
- **payoff**: răspunsul. Înainte, o pauză firească (0,5 s) și un riser; pe dezvăluire (`revealAt` al pozei,
  `snapAt` al puzzle-ului, `breakAt` al geamului) impact + sub drop + strălucire.
- **end**: `loop` (ultimul cadru curge în primul; fără voce), `comment` (`keyword` tastat în bara de comentariu,
  trimis, apare comentariul), `site` (`pages`: secțiuni reale, capturate cu `node site.cjs <id>`), `ask` (`q`,
  `options`). Când se alege fiecare: `PRODUCER.md`.
- **theme**: una din `engine/themes.json` (9: aurora, paper, swiss, clay, neon, mint, sunset, blueprint, noir):
  paleta, fundalul (mesh, grain, grilă, hârtie, sticlă întunecată, lut pastel, inele neon, blueprint), fonturile
  (`@fontsource`, cu ș/ț), subtitrările (pill, box, outline, serif, glow, mono, sticker, under), tranzițiile,
  camera, aroma sunetelor și starea muzicii.

Comenzile (`cd engine`): `./make.sh <id>` face tot: capturile site-ului (dacă finalul e `site`), imaginile AI
(`imagen.py`, cel mult 8, în cache), vocea (`voice.py`), verificarea (`check.cjs`), cadrele (`render.cjs`), sunetul
(`mix.py`) și fișierul final (`encode.sh`: H.264 + AAC, ≤ 8 Mbit/s, copertă, verificarea de flash, LUFS și vârf).
→ `out/<id>.mp4` (1080×1920, 30 fps) și `out/<id>.jpg`. Cadre de control: `node snap.cjs <id> <folder> [secunde…]`
(`--debug` arată zonele interzise). Prima dată pe o mașină: `npm i`, `python3 sfx.py`, `python3 music.py all`.

### Biblioteca de scene (`engine/v2/visuals.js`, `visuals2.js`)
Text cinetic: `type-pop`, `type-mask`, `type-cascade` (litere care cad), `type-highlight` (marker), `type-flip` (3D);
opțiuni `kicker`, `sub`, `strike` (cuvântul accentuat tăiat), `then` (alt text pe pasul următor). `big` (cifră sau
frază). `qmark` („?” din particule, întrebarea dedesubt). `skin` (pielea în secțiune: `seq` cu `focus`, `energy`,
`shrink`, `sag`, `collagen`, `cream`, `pulse`, `calm`; `mode` hifu/liposonix). `counter`, `gauge`, `timeline`,
`split` (comparație cu VS și câștigător), `puzzle` (felii care se îmbină; `payoff: true`), `morph` (o formă devine
alta: fat, muscle, drop, heart…), `icons` (grilă în ritm, `pick`, `cross`), `checklist`, `cards`, `scale` (balanță),
`dna`, `tilt` (postura cu telefonul), `bars`, `zoom` (lupă, apoi plonjare în detaliu), `pin` (hartă desenată),
`energy` (celulele dau energie unei baterii), `shatter` (un card de sticlă crapă și se sparge; adevărul e în spate),
`stamp` (MIT / ADEVĂR), `photo` (poza reală din catalog: `tease`, `reveal` cu mască `diagonal`/`circle`/`wipe`,
`chips`), `nuki` (ipostaze pe replici, squash/stretch, balon), `panel` (ilustrație AI cu ken burns / mască / parallax).
Orice scenă poate avea `bg` (un decor AI în spate, `{name, prompt}`), `tr` (tranziția de intrare), `cam`
(`push`, `pull`, `drift`, `rise`, `dolly`, `parallax`, `none`), iar o replică poate avea `nuki` (Nuki mic într-un colț).
Tranziții (`look.js`): `whip`, `zoom-through`, `mask-wipe`, `shape-morph`, `glitch-lite`, `slide-stack`, `iris`,
`page-flip`, `blur-push`, `match-cut` (pe culoare, din elementul principal în următorul), `spin-zoom`, `cut`.

### Sunetul
`sfx.py` sintetizează biblioteca (numpy/scipy, fără mostre): whoosh scurt/lung/invers, swoosh sus/jos, aparat foto,
click, taste, pop, bulă, tic, riser, impact, boom, sub drop, shimmer, sparkle, glitch, hârtie, snap magnetic, chime,
sticlă spartă, câte 3-8 variante. Motorul pune singur sunetele din animații (fiecare intrare, tranziție, tic de
contor, tastă), plus lovitura cârligului și riser + impact pe răspuns. `mix.py` alege varianta (niciodată aceeași de
două ori la rând), tonul (±5 %) și nivelul (±1,5 dB) după aroma temei, rărește ce se suprapune (1-3 pe secundă,
tastele separat), pune muzica stării temei (`music.py`: pop, chill, tension, future, cinematic, funky; Lyria),
coborâtă sub voce (sidechain), apoi -14 LUFS și un limitator de vârf real (-2,2 dBTP; fișierul final ≤ -1 dBTP).

### Imaginile AI (`imagen.py`)
Pentru scenele `panel` și decorurile `bg`: stilul temei (`imagery` + paleta), cache după hash-ul promptului
(`engine/img/`), cel mult 8 pe reel. Imagen 4 nu e activ pe cheia noastră (404, 12.11), așa că se folosește
`gemini-2.5-flash-image` (~0,04 $ imaginea). **Niciodată oameni, fețe sau corpuri** (nici ca „rezultat”, nici
înainte/după): straturi abstracte, aparate, obiecte, decoruri. Fără imagine: scena se desenează din cod.

## Regulile
- `check.cjs` (v2: `check2.cjs`) oprește reel-ul dacă: întrebarea cârligului nu e pe ecran până la 3 s, primul
  cadru stă pe loc, lipsește lovitura sonoră din cadrele 0-3, răspunsul nu e în ultimul sfert al poveștii (finalul,
  un CTA, nu intră în poveste), o porțiune trece de 2,5 s fără schimbare vizuală, o replică nu are vizual sau nu se
  mișcă nimic când începe, un text iese din zona sigură sau stă peste alt text, apar cuvinte de reclamă sau
  expresii interzise, durata iese din 25-40 s, sunt peste 8 imagini AI, lipsesc capturile pentru finalul `site`.
- Zonele sigure: nimic scris în primii 220 px de sus, în ultimii 380 px de jos și în ultimii 160 px din dreapta.
- Subtitrări cuvânt cu cuvânt (cel mult 3 cuvinte pe ecran), în stilul temei; cuvintele accentuate se animă.
- Fără preț, ofertă, „programează-te” sau „consultație gratuită”. Domeniul centrul360.com apare doar în finalul
  `site`, într-un browser fictiv, cu capturi reale ale paginilor live, doar secțiuni fără prețuri sau oferte.
- Fapte corecte, fără promisiuni; sursa faptelor se scrie în `sources`. Formulări sigure din
  `centrul360-creative-machine/knowledge/meta-ads-rules.md` („grăsime localizată”, „conturare”, „fără operație”).
- Înainte/după doar din `brand_asset/catalog` (cazuri publicate cu acordul clientei), puse exact cum sunt (scena
  `photo` nu taie și nu retușează poza; jumătatea „după” poate sta sub un capac până la dezvăluire), cu
  „Publicat cu acordul clientei. Rezultatele diferă de la o persoană la alta.” Niciodată generate sau inventate.
- Fără nume de cliente, fără liniuțe lungi, cu diacritice (ș, ț cu virgulă). Epilarea și EMS doar Timișoara.

## Rubricile
1. **Cazuri** (rubrica principală): povestea unui caz real din catalog, cu tensiune, dezvăluirea pozei reale.
2. **Mit sau adevăr?**: un mit, o întorsătură vizuală mare, adevărul.
3. **Ce se întâmplă de fapt**: ce face HIFU / Liposonix / laserul sub piele, desenat.
4. **Întrebarea zilei**: o întrebare reală a clientelor, un răspuns scurt.
5. **Nuki**: un sketch cu mascota care se termină cu adevărul.
6. **Top 3 / greșeli**: trei lucruri, fiecare cu scena lui.

Exemple v2: `v2-gusa-slabe` (buclă, aurora), `v2-caz-real` (site, paper), `v2-mit-abdomene` (comentariu, swiss).

## Faza 2: generatorul zilnic (de construit)
- **Predarea și postarea sunt gata** (12.11): lotul pe săptămână, împărțirea pe rețele, aprobarea de duminică,
  postarea automată a ce e aprobat, cifrele și Admin → Conținut. Producătorul urmează `PRODUCER.md`.
- **Mașina învață** (12.11): din cifre, ce rubrici, subiecte, cârlige și ore merg (`learn` în starea intake, tabul
  Rezultate din Admin → Conținut), ideile proprietarului (făcute primele), momentele anului (`calendar.json`, de
  completat în fiecare noiembrie), câștigătoarele vechi refăcute cu alt cârlig, verificarea textelor înainte de postare,
  urmăritorii zilnic și raportul lunii.
- **Insights** (12.11, `api/_lib/content-insights.js`, Admin → Conținut → Rezultate, ecranul principal): pe fiecare
  postare cât se uită, cât rămân după 3 secunde și la jumătate, urmăritorii aduși, creșterea în primele ore; „MERGE TARE
  🔥” (de 3 ori peste obișnuit în prima zi); pâlnia organică până la încasări; publicul și orele recomandate; ce spun
  oamenii în comentarii (întrebările devin idei); analiza săptămânii, lunea, pe care producătorul o citește prima
  (`analysis` în stare); țintele lunare.
- **Ceasul**: un job zilnic (Cron-ul Workerului sau GitHub Actions cu `workflow_dispatch` + `schedule`) pornește la
  ora fixă. Cum randarea cere Chromium și ffmpeg, rulează în GitHub Actions (ubuntu, `npx playwright install chromium`).
- **Subiectele**: `topics.json` (40 de subiecte de pornire: HIFU gușă/față, Liposonix, RF, epilare laser, ten). Fiecare
  zi ia următoarele 3 rubrici din `rotation` (Cazuri apare de 2 ori pe săptămână cel puțin) și, pentru fiecare, un
  subiect nefolosit în ultimele 30 de zile (`used`). Faptele subiectului și paginile site-ului sunt singura sursă.
- **Scriptul**: Claude (API) primește rubrica, subiectul, faptele, schema `script.json`, exemplele din `scripts/` și
  regulile de mai sus; scrie 3 scripturi. Pentru Cazuri primește doar datele din catalog (oraș, zonă, ședințe, intervalul
  pozei de după) și poza. Apoi `check.cjs` + un al doilea pas Claude care verifică faptele și tonul; ce nu trece se
  rescrie (max 2 runde) sau se sare.
- **Randarea**: `make.sh` pe fiecare (vocea în cache după text), cadrele de control urcate ca artefacte.
- **Programarea** (făcută de admin, `api/_lib/content-plan.js`): fiecare reel o dată pe fiecare rețea care are loc,
  niciodată pe două rețele în aceeași zi, rotit cu câte două zile între rețele, deci în fiecare zi rețelele arată
  reels diferite; cota fiecărei rețele împărțită egal pe zile. Urcarea prin API-urile oficiale (TikTok Content Posting,
  Instagram Graph / Facebook Pages pentru Reels, YouTube Data API), cu `post` ca descriere.
- **Comentariile**: cuvântul cheie din `keyword` declanșează un mesaj automat în privat cu ghidul subiectului
  (ManyChat sau Graph API pe Instagram/Facebook); mesajul trimite la conținut gratuit, nu la ofertă.
- **Aprobarea**: lotul săptămânii ajunge la proprietar în Admin → Conținut (sâmbătă seara); el aprobă duminica sau
  trimite înapoi la refăcut cu o notă. Nimic nu se publică neaprobat.
