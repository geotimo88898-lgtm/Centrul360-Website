# Reels: mașina de video scurte organice

Reels (și un carusel de rezultate) pentru TikTok, Instagram Reels, Facebook Reels și YouTube Shorts, predate o
săptămână odată (cotele pe rețea sunt în Admin → Conținut → Setări). Educative, cu umor fin, valoare gratuită, fără
să arate a reclamă: fără preț, fără ofertă, fără „programează-te”. Totul animat (fără filmare). Vocea în română.
Din 12.11 se fac doar reels **v2** (mai jos); v1 (`stage.html`, `engine.js`) rămâne doar ca să se poată randa
reels-urile vechi (scripturile fără `"v": 2` din `scripts/`; cele cu ștampila veche nu se mai postează, regula din 13.11).

## Direcția proprietarului (12.11)
- Animații foarte curate, ca video-urile virale făcute cu AI: **tot ce se spune e ilustrat** de o animație.
- Cârligul e vizual și sonor deodată: în primele 3 secunde se întâmplă ceva care îl face pe privitor să-și pună o
  întrebare (buclă deschisă); răspunsul vine la final.
- Tranziții cu sunete „wow”, efecte fine (swoosh, click de aparat foto, taste), muzică dedesubt.
- Reels-urile nu seamănă între ele: altă temă (culori, fonturi, fundal), alte animații, alt final.
- Finalul diferă după video: buclă (fără CTA), cuvânt în comentarii (doar când o conversație chiar adaugă ceva),
  site (un browser curat tastează centrul360.com și arată pagina reală) sau o întrebare către public.

## Regulile proprietarului din 13.11 (după primul reel v2: „foarte bun, ai înțeles ideea”)
- **Fiecare idee nouă = un ecran nou**, cu o tranziție reală, foarte lină: push cu motion blur, zbor al camerei prin
  elementul principal (`fly-through`), zoom prin elementul vechi în scena nouă (`zoom-element`), pan pe o pânză lungă
  cu parallax (`pan`), whip, match-cut pe culoare, elementul principal care se transformă în cel nou (`morph-key`).
  Curbe expo/cubice cu o mică depășire, 350-600 ms, pe un whoosh. În aceeași idee: cel mult un pas mic. Variate pe reel.
- **Culori dramatice**: întunecat bogat cu accente vii (midnight + magenta + cyan, obsidian + auriu, teal adânc + coral,
  ink blue + lime neon, burgundy + piersică) și 1-2 luminoase îndrăznețe (citrus, swiss); vignetă, bloom pe accente,
  o rază de lumină după fiecare tăietură, grain fin. Fiecare reel ia tema cea mai dramatică potrivită.
- **Fără logo pe ecran.** Brandul e Nuki (plus semnătura de sunet și tranziții); logo-ul apare doar unde e firesc (în
  browserul finalului `site`).
- **Nuki, discret, în 2-4 cadre**: se uită dintr-un colț, reacționează (surprins, aprobă din cap, arată spre elementul
  principal), mic, luminat ca tema, intră cu un mic bounce; niciodată peste elementul principal sau peste subtitrări.
- **Finalul nu se oprește brusc**: după răspuns vine rezolvarea („Și atunci, ce faci?” + 2-3 lucruri practice, reale,
  utile; dacă se potrivește, variantele non-invazive spuse firesc, fără preț și fără promisiuni), apoi o replică
  caldă de încheiere cu un vizual care rezolvă „?”-ul de la început (devine bifă sau inimă) și un acord muzical final,
  apoi tipul de final. Mereu o formă de CTA, potrivită video-ului: blând (rezolvarea însăși, „uite cum arată pe
  centrul360.com”, „salvează-l”), de conversație („Scrie 360 și-ți spun ce s-ar potrivi la tine”) sau, la buclă, o
  ultimă replică ce invită la revedere. 30-45 s în total.
- **Cuvântul din comentarii e mereu 360.**
- **Niciodată cuvântul „mit” și nici formatul „Mit sau adevăr?”** (fără ștampilă, fără întrebarea asta, fără rubrica
  asta). Aceeași idee se împachetează captivant: „Ce nu-ți spune nimeni despre…”, „Unde se duce, de fapt, …”,
  „Experimentul” (o simulare spusă clar, fără rezultate inventate), un cârlig contraintuitiv, un POV, o cursă.
- **Cazurile** urmează același stil: rezultatul real se vede devreme (o privire la „după”, apoi înainte → după, cu o
  lovitură sonoră), întrebarea din capul privitorului devine „cum a reușit?”, povestea curge spre soluție (ce o
  frământa, spus general; ce s-a făcut și de ce merge, desenat), apoi dezvăluirea completă, rezolvarea și finalul.
- **Muzica**: originală (Lyria), cu energia muzicii care merge acum (house anilor '90, UK garage, nu-disco, afro
  house, lo-fi house), niciodată o melodie, un text sau un titlu copiat; fiecare reel altă piesă (`musicClip`);
  lovitură pe cârlig, creștere pe răspuns (un filtru care se deschide, apoi „drop”-ul), rezolvare la final. Referința
  proprietarului (un clasic house din anii '90) a fost doar măsurată, pentru stil: ~123 BPM, fa major, un intro scurt
  și apoi un groove constant, plin de energie.
- **Excepție, decizia proprietarului (13.11):** pentru `v2-gusa-slabe` și `v2-caz-real` patul muzical e chiar piesa
  aleasă de el („Free”, Ultra Naté), riscul de drepturi asumat de el pentru conturile lui. Fișierul stă doar local, în
  `engine/music/owner-free.wav` (folder ignorat de git; nu se comite niciodată). În script: `"music"` (eticheta
  pentru admin), `"musicFile"`, `"musicStart"` (secunda din piesă: un downbeat la începutul refrenului) și `"beat":
  {"bpm"}`. `python3 beats.py music/<fișier>.wav` măsoară tempoul (125 BPM), grila și frazele de 8 măsuri și propune
  partea cea mai „catchy” (refrenul: 77,2 s și 169,3 s). Reel-ul începe pe un downbeat (lovitura cârligului cade pe
  el), fiecare tăietură se mută pe bătaia cea mai apropiată (sau pe jumătatea ei), vocea rămâne pe timpii ei.
  Mixul: banda 0,9-4 kHz a piesei se retrage cât vorbește vocea, plus sidechain; `mix.py` raportează „voice over
  music” (dB) cât vorbește. Pe rețele, o piesă comercială poate fi redusă la tăcere sau blocată, iar conturile de
  business nu au voie la muzică comercială în postări; asta e riscul asumat.

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
{ "v": 2, "id": "v2-exemplu", "rubric": "Unde se duce, de fapt", "theme": "inklime", "music": "house90", "musicClip": "house9001",
  "topic": "…", "topicTag": "liposonix-abdomen", "hookType": "intrebare", "sources": "de unde vin faptele", "post": "…",
  "hook":   { "say": "Asta topește *burtica*?", "q": "…?", "visual": { "type": "counter", "…": "…" } },
  "beats":  [ { "say": "…", "visual": { "type": "skin", "…": "…" } },
              { "say": "…", "step": "ce se schimbă în aceeași scenă" } ],
  "payoff": [ { "say": "…", "visual": { "type": "dissolve", "…": "…" } } ],
  "resolve": [ { "say": "Și atunci, ce faci?", "visual": { "…": "…" } }, { "say": "un lucru practic, real", "visual": { "…": "…" } } ],
  "outro":  { "say": "o încheiere caldă", "cta": "soft | talk | loop", "visual": { "type": "qmark", "to": "heart", "q": false } },
  "end":    { "type": "loop | comment | site | ask", "say": "…", "cta": "…", "…": "…" } }
```
- **Fiecare replică** (`say`; `tts` dacă se citește altfel, `cap` dacă subtitrarea e altfel; `*cuvânt*` = accent,
  animat în subtitrare și în textul cinetic) are fie `visual` (o scenă nouă), fie `step` (o schimbare a scenei
  curente: un pas din `seq`, o piesă, un cip). `pause`/`pre`: secunde în plus după/înainte.
- **hook**: 0-3 s, cu `q` (întrebarea care deschide bucla). Primul cadru e deja în mișcare (scena cârligului începe
  cu 0,3 s înainte), lovitură sonoră pe cadrul 0.
- **beats**: o mini-dezvăluire la 3-5 s, o schimbare vizuală cel mult la 2,5 s.
- **payoff**: răspunsul. Înainte, o pauză firească (0,5 s) și un riser; pe dezvăluire (`revealAt` al pozei,
  `snapAt` al puzzle-ului, `breakAt` al geamului) impact + sub drop + strălucire.
- **resolve**: 2-3 replici după răspuns („Și atunci, ce faci?” + lucruri practice), fiecare cu ecranul ei.
- **outro**: încheierea caldă, cu `cta` și un vizual care rezolvă „?”-ul (`qmark` cu `to`: `check` sau `heart`).
- O replică poate avea `nuki`: `{pose, at: peek-l | peek-b | bl | br | tl | tr, react: nod | bounce | point | wow, flip}`.
- **end**: `loop` (ultimul cadru curge în primul; fără voce), `comment` (cuvântul 360 tastat în bara de comentariu,
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
`stamp` (un cuvânt ștampilat; niciodată „mit”), `dissolve` (o credință pe un card de sticlă se destramă în particule care
se întind pe o siluetă abstractă), `photo` (poza reală din catalog: `glimpse` (întâi „după”, din blur în clar, apoi
întreaga poză), `tease`, `reveal` cu mască `diagonal`/`circle`/`wipe`,
`chips`), `nuki` (ipostaze pe replici, squash/stretch, balon), `panel` (ilustrație AI cu ken burns / mască / parallax).
Orice scenă poate avea `bg` (un decor AI în spate, `{name, prompt}`), `tr` (tranziția de intrare), `cam`
(`push`, `pull`, `drift`, `rise`, `dolly`, `parallax`, `none`), iar o replică poate avea `nuki` (Nuki mic într-un colț).
Tranziții (`look.js`): `push`, `push-up`, `fly-through`, `zoom-element`, `pan`, `morph-key`, `whip`, `zoom-through`,
`mask-wipe`, `shape-morph`, `glitch-lite`, `slide-stack`, `iris`, `page-flip`, `blur-push`, `match-cut` (pe culoare),
`spin-zoom` (`cut` doar în cazuri speciale: între idei, check-ul cere o tranziție reală).

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
- `check2.cjs` mai cere (13.11): rezolvarea (2-3 replici) și încheierea, o tranziție reală la fiecare idee nouă
  (nu de două ori aceeași la rând, cel mult un pas pe ecran), Nuki de 2-4 ori fără să acopere textul, subtitrările sau
  elementul principal, o replică CTA și un vizual care rezolvă în ultimele 5 s, cuvântul 360 la comentarii, răspunsul
  după 40 % din reel, 30-45 s, niciodată „mit”.
- `check.cjs` (v2: `check2.cjs`) oprește reel-ul dacă: întrebarea cârligului nu e pe ecran până la 3 s, primul
  cadru stă pe loc, lipsește lovitura sonoră din cadrele 0-3, răspunsul nu e în ultimul sfert al poveștii (finalul,
  un CTA, nu intră în poveste; din 13.11: după 40 % din reel), o porțiune trece de 2,5 s fără schimbare vizuală, o replică nu are vizual sau nu se
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
2. **Ce nu-ți spune nimeni / Unde se duce, de fapt / Experimentul**: o credință des întâlnită, desfăcută cu o
   întorsătură vizuală (fără cuvântul „mit”, fără ștampile).
3. **Ce se întâmplă de fapt**: ce face HIFU / Liposonix / laserul sub piele, desenat.
4. **Întrebarea zilei**: o întrebare reală a clientelor, un răspuns scurt.
5. **Nuki**: un sketch cu mascota care se termină cu adevărul.
6. **Top 3 / greșeli**: trei lucruri, fiecare cu scena lui.

Exemple v2: `v2-gusa-slabe` (buclă, aurora, house), `v2-caz-real` (site, burgundy, house), `v2-abdomene-energie`
(comentariu 360, inklime; scris, încă nerandat).

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
