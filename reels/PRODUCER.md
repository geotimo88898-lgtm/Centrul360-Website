# Producătorul: cum predai lotul săptămânii

Sesiunea producătorului face reels și carusele cu `reels/engine` și le predă adminului **o săptămână întreagă odată**
(decizia proprietarului, 12.11). Adminul le împarte pe rețele, proprietarul le verifică duminica în Admin → Conținut
(„Aprobă” sau „Refă” cu o notă) și ceasul postează **doar ce e aprobat**, cât timp postarea automată e pornită.

Adresa: `https://admin.centrul360.com/api/content-intake`
Cheia: antetul `Authorization: Bearer $CREATIVE_SSO_SECRET` (aceeași cheie ca la `/api/lead-health`). Nu o scrie
niciodată în fișiere, commituri sau loguri.

## Când rulezi
- **Sâmbătă, pe la 18:00**: lotul pentru săptămâna care vine (luni 00:00 până duminică 23:59, ora României). La 20:00,
  dacă încă lipsește ceva, proprietarul primește „SĂPTĂMÂNA NU E GATA ⚠️” cu câte lipsesc.
  Proprietarul primește „SĂPTĂMÂNA E GATA DE VERIFICAT 🎬” când tot ce trebuie e urcat, iar duminică la 12:00 i se
  amintește ce n-a aprobat încă.
- **În orice zi**: materialele trimise înapoi la refăcut (`redo` din stare). Le refaci cât mai repede: până le refaci,
  locurile lor din săptămână stau goale.
- Nu faci nimic altceva între timp: nu există coadă de umplut zilnic.

## Starea: ce faci
```bash
H="Authorization: Bearer $CREATIVE_SSO_SECRET"
U=https://admin.centrul360.com/api/content-intake
curl -s -H "$H" "$U?action=status"
```
Răspunsul (prescurtat):
```json
{ "on": true, "today": "2026-11-14",
  "next":    { "week": "2026-11-16", "n": 1, "need": { "reel": 7, "carousel": 1 }, "have": { "reel": 4, "carousel": 0 },
               "missing": { "reel": 3, "carousel": 1 }, "drafts": 0, "approved": 0, "pending": 4, "redo": 0,
               "slots": { "tt": { "reel": { "quota": 7, "planned": 4 }, "slideshow": { "quota": 1, "planned": 0 } }, "...": {} },
               "short": { "tt": { "reel": 3, "slideshow": 1 }, "...": {} } },
  "current": { "...": "la fel, pentru săptămâna în curs" },
  "redo":    [ { "id": "…", "kind": "reel", "topic": "…", "rubric": "…", "week": "2026-11-16", "redoNote": "Vocea prea rapidă", "replacing": false } ],
  "drafts":  [ { "id": "…", "week": "…", "files": ["reel.mp4"] } ],
  "made":    [ { "topic": "…", "rubric": "…", "kind": "reel", "week": "…", "at": "…" } ],
  "analysis": { "week": "2026-11-09", "label": "9-15.11", "at": "…", "summary": "Cazurile cu cârlig șocant au dus săptămâna",
                "changes": [ "Fă 2 cazuri cu cârlig șocant în primele 2 secunde.", "Ține reels-urile sub 25 de secunde.", "…" ] },
  "ideas":   [ { "id": "…", "text": "Nuki pregătește bradul și încurcă luminițele", "rubric": "Nuki", "at": "…" },
               { "id": "…", "text": "Doare HIFU pe gușă?", "rubric": "Întrebarea zilei", "at": "…", "source": "comentarii" } ],
  "season":  [ { "id": "craciun-2026", "name": "Crăciun și petrecerile de sfârșit de an", "from": "2026-12-01", "to": "2026-12-24",
                 "angle": "…", "ideas": ["…"], "rubrics": ["Cazuri", "Nuki"], "note": "" } ],
  "recycle": [ { "id": "…", "topic": "HIFU pe gușă, 3 luni după", "topicTag": "hifu-gusa", "rubric": "Cazuri", "hook": "…", "hookType": "socant",
                 "keyword": "GUȘĂ", "score": 2.4, "postedAt": "…", "url": "…" } ],
  "learn":   { "n": 43,
               "rubrics":   [ { "rubric": "Cazuri", "score": 1.4, "n": 11 } ],
               "topics":    [ { "topic": "HIFU gușă", "score": 1.6, "n": 6 } ],
               "worst":     [ { "topic": "RF față", "score": 0.7, "n": 4 } ],
               "hooks":     [ { "hookType": "socant", "score": 1.4, "n": 11 } ],
               "hours":     { "ig": [ { "at": "12:30", "score": 1.3, "n": 9 } ] },
               "more_like": [ { "id": "…", "topic": "…", "topicTag": "…", "rubric": "…", "hook": "…", "hookType": "…", "score": 2.7 } ] } }
```
- `next.missing`: **exact câte faci** pentru săptămâna care vine (`reel` reels și `carousel` carusele). Zero și zero:
  lotul e complet, nu mai faci nimic pentru ea.
- `need`: cât cere săptămâna (rețeaua cu cea mai mare cotă: TikTok are 7 reels în săptămânile 1-2, 14 de la a 3-a).
  `have`: câte sunt deja gata. `n`: a câta săptămână e (1 și 2 sunt de încălzire, cu cote mai mici).
- `redo`: ce a trimis proprietarul înapoi, cu nota lui (`redoNote`). Le refaci (pașii de mai jos), nu faci altele noi
  în locul lor: `have` le numără deja.
- `drafts`: elemente create dar nedate gata (o rulare întreruptă): le termini sau le lași, nu le dublezi.
- `made`: ce s-a făcut deja; nu repeți un subiect din ultimele 30 de zile.
- `analysis`: analiza săptămânii trecute (lunea, după cifre): `changes` sunt 3-5 schimbări concrete pentru lotul tău.
- `ideas`, `season`, `recycle`, `learn`: ce faci și în ce ordine (mai jos).

## Ce faci, în ordinea asta
Adminul învață singur din cifre: fiecare postare primește un scor (vizualizări + 5 × salvări + 5 × distribuiri + 3 ×
comentarii), împărțit la mediana rețelei ei, ca TikTok, YouTube, Instagram și Facebook să se compare. `score` 1 e o
postare obișnuită, 2 e de două ori mai bună. Doar postările de cel puțin 3 zile intră în socoteală.
1. **`redo`**: tot ce a trimis proprietarul înapoi, primul.
2. **`analysis`**: primul lucru pe care îl citești după `redo`. Aplici fiecare punct din `analysis.changes` pe tot
   lotul (cârlige, lungimi, rubrici, ore, subiecte); când contrazice `learn`, câștigă analiza (e mai nouă și a citit
   tot: cifrele pe postare, pâlnia, publicul, comentariile). Lipsește (`null`): treci mai departe.
3. **`ideas`**: ideile proprietarului (Admin → Conținut → „Idei pentru săptămânile următoare”), toate, înaintea
   oricărui subiect ales de tine. Trimiți `ideaId` la `create`: ideea iese din listă (dacă scoți ciorna, revine).
   Cele cu `source: "comentarii"` sunt întrebări care se repetă în comentarii (adminul le adaugă singur): le faci
   după ideile proprietarului, cel mult 2 pe săptămână, de obicei ca „Întrebarea zilei”, tot cu `ideaId`.
4. **`season`**: momentele care prind săptămâna care vine (`reels/calendar.json`). Cel puțin un material pe moment,
   cu unghiul lui (`angle`), tot fără preț, ofertă sau programare. `note` are restricțiile (epilarea doar Timișoara).
5. **`recycle`** (cel mult 2 pe săptămână): câștigătoare postate acum 60+ zile. Faci o variantă **nouă** (alt cârlig,
   alt început, aceeași temă), cu `variantOf` = id-ul originalului. Niciodată același fișier din nou.
6. Restul săptămânii: **cam 40% „mai mult din ce merge”** (`learn.more_like`, `learn.topics`, `learn.rubrics`,
   `learn.hooks`: același subiect sau aceeași rubrică, alt material, alt cârlig; tipul de cârlig care câștigă) și
   **cam 60% subiecte noi** (`topics.json`, nefolosite în 30 de zile; încerci și rubrici sau cârlige mai slabe, dar
   nu ce e în `learn.worst` de două ori la rând).
7. Cât timp `learn.n` e sub 10, nu e destul ca să tragi concluzii: rotația normală a rubricilor, Cazuri de cel puțin
   2 ori pe săptămână. Rubricile prin rotație (README.md), Cazuri de cel puțin 2 ori pe săptămână, oricum.

## Cum scrii un reel (v2, din 12.11)
Schema și biblioteca de scene: `README.md` („Cum se face un reel v2”). Tonul: `README.md` („Vocea”): o femeie care
îi povestește ceva unei prietene, nu o reclamă. Pe scurt:
0. **Gândește înainte** (14.11, regula proprietarului: „Vreau să te gândești foarte bine înainte să compui un reel, să
   iasă foarte foarte bine… poate fi insane să fie ceva natural”). Referințele sunt o bibliotecă din care înveți, nu o
   listă de bifat: pentru fiecare reel alegi doar ideile și elementele care i se potrivesc. Înainte de orice text, voce
   sau vizual scrii în `script.json` blocul `"concept"`:
   - `"who"`: pentru cine e;
   - `"oneThing"`: singurul lucru pe care ea îl înțelege sau îl simte la final;
   - `"tone"`: emoția sau tonul (calm și premium, cald, pielea de găină, spontan);
   - `"formats"`: un format, cel mult două combinate, din cele douăsprezece;
   - `"borrowed"`: 2-3 elemente precise din bibliotecă, fiecare cu de ce servește mesajul acesta
     (`{"element", "ref", "why"}`; ex. punctul de lumină-ghid din referința 10, pastilele care se adună din 12,
     clepsidra din 11, glisorul înainte/după, bara de progres din 8);
   - `"notUsed"`: cel puțin 3 elemente tentante lăsate deliberat deoparte (reținerea e o decizie, nu un accident);
   - `"track"`: piesa și de ce (`{"file", "why"}`);
   - `"different"`: ce îl face diferit de ultimele 10 reels.
   **Fiecare element își câștigă locul**: servește mesajul sau nu intră; nimic „pentru că putem”. Mai puțin, făcut
   perfect, bate mai mult. Întâi firescul: reel-ul trebuie să pară fără efort, ca un om care explică frumos un singur
   lucru, nu o vitrină de efecte.
   **Autocritica**, după storyboard și din nou după randare, scrisă cinstit în `"critique"`
   (`{"storyboard": {...}, "render": {...}}`, aceleași cinci întrebări, răspunsuri care încep cu „da” sau „nu”, apoi
   motivul):
   - `"scroll"`: m-ar opri din derulat în primele 2 secunde?
   - `"serves"`: fiecare element servește singurul mesaj?
   - `"effects"`: pare ceva un efect de dragul efectului? (aici răspunsul bun e „nu”)
   - `"natural"`: sună și arată firesc?
   - `"owner"`: l-ar pune proprietarul azi pe contul lui?
   Refaci până când toate răspunsurile sunt bune. `check2.cjs` avertizează când lipsește `concept` sau `critique`, când
   sunt numite peste două formate, când `notUsed` are sub 3 elemente sau când un răspuns din `critique` nu e cel bun.
0b. **Structura** (14.11, standardul pentru toate reels-urile): Hook → Lead → Body 1 → Open loop → Body 2 → Open loop →
   Body 3 → CTA; la 30-50 s se poate strânge la Hook → Lead → Body → Open loop → Body → CTA. Lead-ul promite ce vor
   afla și se termină înainte de secunda 10; fiecare body aduce o singură valoare reală; open loop-ul e o afirmație
   (niciodată o întrebare) pe care o închide doar blocul următor, cu un vizual de tensiune fără „?”; CTA-ul (salvare,
   „360” sau site) o dată, calm. Pui `"role"` pe fiecare replică (`hook`, `lead`, `body`, `loop`, `cta`); `check2.cjs`
   avertizează la lipsuri. Vocea e grăbită x1,18 după cache și pauzele sunt scurte (README, „Ritmul”).
   **Scheletul nu se vede niciodată** („dacă mă uit la 10 reels, să nu-mi dau seama că sunt repetitive”): variezi
   lead-ul (promisiune, fapt surprinzător sau deloc), numărul și locul buclelor (0, 1 sau 2), unde cade răspunsul, tipul
   de CTA (salvare, trimite unei prietene, comentariu, site, niciunul) și forma propozițiilor; fără fraze de șablon
   („partea cea mai importantă”, „dar asta nu e tot”, „uite ce”, „îți arăt / îți explic” ca formulă, „și acum vine
   partea interesantă”, „rămâi până la final”), fără două bucle care încep cu „Dar” / „Iar”; buclele sună ca o
   propoziție firească dintr-o explicație și au vizualuri diferite. **Pasul de scris**: după ce scrii textul, rulezi
   `node variety.cjs <id>` (îl compară cu ultimele 10 scripturi; cu `--history <fișier.json>` și cu istoria din `made`)
   și rescrii până iese „clean”, apoi `node check.cjs <id>`.
1. **Scrie cum vorbește o femeie din România cu o prietenă, nu cum traduci** (14.11): citești fiecare replică cu voce
   tare; fără calcuri („La multe femei, X apare”) și fără cuvinte de carte („rareori”, „focalizează”, „deci” în
   mijlocul propoziției, „stă”); verbe simple (e, are, pleacă, se vede); legături din vorbire (așa că, doar că, iar, de
   obicei). Ultima trecere la pasul de scris: „ar spune-o exact așa o femeie din Timișoara?”; rescrii fiecare replică
   (și fiecare etichetă de pe ecran) care nu trece.
   **Citești tot scriptul cu voce tare, ca o singură explicație**: fiecare propoziție decurge din cea de dinainte; dacă o
   replică pare un salt, o rescrii sau schimbi ordinea. **Vocea e o singură înregistrare** a întregului script, citită
   legat (`voice.json` `"mode": "continuous"`), tăiată apoi în replici; nu se mai fac replici separate cu stiluri și
   tempo diferite. Verifici cu `python3 listen.py <id> --judge` (cuvânt cu cuvânt și părerea ascultătorului).
   **Abrevierile se citesc românește**: ca un cuvânt când se poate (HIFU = „hifu”, cu „i” ca în „film”; SMAS = „smas”),
   altfel literă cu literă cu numele românești (RF = „er-ef”, EMS = „e-em-es”); numele de tratamente tot românește
   (Liposonix). O abreviere nouă o adaugi în `voice.json` (`"pronounce"` și, dacă e riscantă, `"pronounce_check"`).
   **O afirmație precisă întâi** (din 14.11, nu o întrebare). Cârligul spune un fapt surprinzător, care te face să
   vrei să înțelegi („La multe femei slabe, gușa nu ține de kilograme.”); la un caz, o propoziție clară despre ce s-a
   întâmplat. Se spune în primele 3 secunde, peste o scenă care se mișcă din primul cadru. Nicio replică nu are „?”.
2. **Propoziții întregi, fiecare cu scena ei.** O replică = o idee = un vizual (`visual`) sau un pas al scenei curente
   (`step`). Explici, nu enumeri: niciodată „fără bisturiu, fără recuperare”, ci de ce și ce înseamnă pentru ea.
   Alegi scena care arată ce spui, nu una decorativă: un depozit de grăsime → `zoom`; pielea care își pierde
   fermitatea → `skin`; energia în stratul profund → `beam`; celulele de grăsime → `cells`; o credință greșită →
   `dissolve` (niciodată cuvântul „mit” sau o ștampilă). Nu repeta aceeași scenă de două ori la rând; schimbă
   tranziția și camera (motorul le rotește din temă dacă nu le scrii). Un singur lucru învățat bine, cu un detaliu
   concret pe care lumea nu-l știe, doar din surse (`topics.json`, site, catalog); ce lipsește din surse e o întrebare
   pentru proprietar. Textul spus se trimite spre aprobare înainte de voce și randare.
3. **Mini-dezvăluiri la 3-5 secunde**: fiecare replică aduce un lucru nou, legat firesc de cel dinainte („Cu anii”,
   „De aceea”, „Un lucru bun de știut”), fără formule de suspans goale.
4. **Răspunsul (payoff)** după 40 % din reel, cu o dezvăluire (poza, puzzle-ul care se îmbină, credința care se
   destramă). Motorul pune pauza, riserul și impactul. Apoi **rezolvarea** (2-3 lucruri
   practice, reale) și **încheierea** caldă, cu un CTA potrivit (`cta`: `soft`, `talk`, `loop`) și un vizual care încheie
   (inima sau bifa desenată). Clinica apare doar aici, ca ultim pas firesc, o singură dată, încet. Niciodată un final
   care se oprește brusc. 30-45 s.
4b. **Tranziții**: fiecare idee nouă pe un ecran nou (`visual`), cel mult un pas (`step`) în aceeași idee; motorul
   rotește tranzițiile temei (push, fly-through, zoom-element, pan, morph-key, whip…), niciodată aceeași de două ori.
4c. **Nuki** în 2-4 replici (`nuki`), mic, într-un colț liber; brandul e el, nu logo-ul (care nu mai apare pe ecran).
4d. **Muzica** (14.11): previzualizările folosesc doar piesa proprietarului (`musicFile` implicit `owner-free`), din altă
   parte a ei la fiecare reel (`musicStart`: un început de frază, vezi `python3 beats.py music/owner-free.wav`); niciodată
   o piesă generată. Clipurile Lyria vechi nu se mai folosesc.
5. **Finalul**, după reel:
   - `loop` pentru curiozitate: ultimul cadru curge în primul; ultima replică invită firesc la revedere (bucla crește
     timpul vizionat);
   - `comment` doar când o conversație chiar adaugă ceva (un ghid trimis în privat), **cel mult 1 din 3 materiale**
     din săptămână; cuvântul e **mereu 360**, spus devreme în replică, ca tastarea să curgă pe voce;
   - `site` când o pagină reală răspunde cel mai bine (cazuri, „cum funcționează”): `pages` cu secțiuni fără
     prețuri sau oferte (`#rezultate`, `#cum`), capturate cu `node site.cjs <id>`;
   - `ask` altfel: o întrebare simplă către public, fără cuvânt cheie.
5b. **Montajul** (14.11, referința proprietarului pentru meșteșug): fiecare eveniment vizual are sunetul lui, la cadru
   (tic moale pe text, tap pe un panou sau o carte, whoosh cu vârful pe tăietură, un singur sunet-semnătură pentru
   obiectul-erou), sub voce, fără ducking; un motiv-ghid (`"motif": "dot"`) care duce privirea de la o scenă la alta;
   o culoare-erou, text mic, mult spațiu, o idee pe bătaie; intrările eșalonate pe grila muzicii (`R.grid`); un final
   ținut 2-3 s; adâncime prin straturi (un obiect peste text). Implicit pentru reels-urile noi (`"sound": "v3"`); te uiți
   la raportul de sincronizare din `mix.py` (tăieturi pe vârf, intrări cu sunet, ±1 cadru). Rafinările din „Faceless
   curat” (formatul xi) intră în stilul educațional implicit: cuvântul-cheie intră exact când e spus, centrat, uriaș și
   în blur, apoi se retrage; accentul în italic serif turcoaz (rose gold pe cel mult un element); obiecte uriașe tăiate
   de cadru pentru scară; colțuri de vizor pe subiect; inel de numărătoare doar pentru cifre reale; noduri cu iconițe și
   linii care apar pe rând; o listă spusă în propoziții, cu pastilele cuvintelor-cheie adunate pe ecran (doar fraze
   adevărate, de pe site); fundal alb cu inele moi de accent în colțuri; o idee pe ecran; iconițe de oameni generice.
   Din „Colaj pe birou” (x-b): obiectul lucrează pe text (lupa sau ochelarii măresc cuvântul-cheie, un cerc de marker
   rose gold sau turcoaz închis, niciodată roșu, o linie care taie un cuvânt); un bloc-definiție de dicționar doar cu
   formularea de pe site; CTA cu cuvânt în comentarii (cuvântul rămâne 360), dar mesajul în privat abia când mesajele
   Instagram sunt legate și avem o resursă reală de trimis; până atunci doar CTA-uri pe care le putem onora.
   Din 15.11: sunetele vin din setul premium `engine/sfx/v3` (`python3 sfx.py --v3`: fiecare e din straturi, cu puțină
   cameră, stereo, în 3-8 variante; pe lângă cele vechi: `shutter`, `swoosh_end`, `whoosh_through`, `card_flip`,
   `grain`, `sand_flow`, `pulse`, `suck_in`, `hit_deep`); câte evenimente se văd, atâtea se aud, pe cadrul lor. Un reel
   care începe cu sunetul lui scrie `"hookHit": false` (altfel motorul pune singur un impact pe cadrul 0). O dezvăluire
   pe lovitura piesei se numără înapoi de la ea: `beats.py`, apoi începutul loviturii la milisecundă, `"musicStart"`
   care o pune pe începutul unui cadru; liniștea dinainte rămâne liniște (fără riser). Ștacheta vizuală pentru orice
   scenă nouă e piesa de demonstrație (`scripts/v2-demo-sfx`, scena `showpiece`): o cameră care nu se oprește, un singur
   zoom mare, lumină dintr-o parte cu umbre moi, cărți 3D cu grosime, puține elemente, mari și centrate; nimic nu stă pe
   loc, nici un rând ținut (alunecă încet, cu lumina care trece). Textul se citește pe telefon: rândurile care contează
   de la 58 px în sus, nimic sub ~33 px.
   Detaliile: README, „Montajul”.
5c. **Camera** (15.11, referința proprietarului pentru zoom-uri; pe larg în `README.md`, „Camera”): o mișcare de cameră
   pornește pe o bătaie, cu o dâră de lumină și cu sunetul ei (`whoosh_cut` + `hit_deep`), face cea mai mare parte din
   drum în prima treime și alunecă până la oprire în 0,5-0,8 s (`R.cam.ease`), apoi cadrul stă restul măsurii. Straturile
   se mișcă după adâncime (`R.cam.layer`; la dolly zoom subiectul rămâne la fel și fundalul crește, `R.cam.dolly`).
   Fiecare zoom are o țintă: detaliul despre care vorbim imediat după. Cel mult un zoom prin lumină pe reel
   (`R.cam.flash`), la momentul cel mai important. Fără zoom liniar, fără zoom lent continuu, fără poză plată mărită.
6. **Tema și varietatea** (14.11): doar `brand-light` (alb cu turcoaz) sau `brand-teal` (turcoaz cu alb), alternate
   (niciodată aceeași de două ori la rând; citești `made`). Rose gold doar ca accent. Și, pentru că „nu vreau să fie la
   fel niciunul”, de la un reel la altul schimbi: cârligul (particule, privirea la poza reală, contorul, o întrebare
   tipărită…), scenele-semnătură (race, scrubber, cardrow, căutarea pe site, straturile pielii; cel puțin una de date
   când povestea are cifre în timp, doar cu cifre reale sau marcată „Ilustrativ”), aranjarea (`layout`: sus, mijloc sau
   jos, mărimea textului; totul rămâne centrat pe axa cadrului), ritmul, setul de tranziții (`transitions`), unde apare
   Nuki și finalul. Muzica previzualizării: începutul piesei proprietarului, la toate. `check2.cjs` refuză aceeași combinație temă + cârlig + scene + final și avertizează la peste
   jumătate scene de același fel ca reel-ul precedent. Super clean: puține elemente, fără efecte pe text; dacă ceva e
   încărcat, se scoate.
6f. **Muzica proprietarului** (doar previzualizări; fișierele în `engine/music/`, ignorate de git, nu se comit):

   | fișier | starea | pentru ce formate | de unde pornește |
   |---|---|---|---|
   | `owner-free` („Free”) | house, cald, constant | educative, cazuri | 0,395 s (primul downbeat), 125,01 BPM |
   | `owner-weongo` („WE ON GO II”) | pielea de găină, „unexpected edits” | (vi) suspansul, (xii) logo-ancora, scheciul 3D, dezvăluiri dramatice, înainte/după puternic | partea cu „honorable”: 0,1-11,8 s (primul downbeat 0,114 s), 131,01 BPM; după ~24 s versuri explicite, nu |
   | `owner-trainingseason` („Training Season”, live) | spontan, ușor, „loved by our audience” | Nuki, din culise, un sfat rapid | 10,17 s, la lovitura muzicii; 123,01 BPM |

   Alegi piesa după starea reel-ului și le rotești: niciodată aceeași piesă la două reels la rând (`musicFile`,
   `musicStart`, `beat` în script; `check2.cjs` avertizează la repetare).
6c. **Muzica și postarea** (14.11): muzica stă constantă, „semi tare”, vocea peste ea (fără ducking sau alte
   automatizări; nivelul din `mix.py`, 4,5 dB de voce peste muzică în banda vorbirii din 14.11, după „dă puțintel mai
   tare la muzică”, verificat cu `python3 listen.py <id>`). Fiecare reel are două fișiere:
   `out/<id>.mp4` (previzualizarea, cu piesa proprietarului) și `out/<id>-clean.mp4` (doar voce și efecte). La
   predare urci AMÂNDOUĂ: previzualizarea ca `reel.mp4` (fără `role`; doar pentru aprobare, nu se postează niciodată)
   și fișierul fără muzică ca `clean.mp4` cu `&role=clean` (ăsta pleacă: proprietarul îl postează din aplicații, cu
   „Distribuie” din Conținut → De postat, și pune acolo sunetul licențiat). Piesa (`engine/music/owner-free.wav`) nu se comite niciodată.
6d. **Animații diferite** (14.11, „ai grijă la animațiile prea asemănătoare”): într-un reel niciun fel de scenă și nicio
   metaforă vizuală de mai mult de două ori, și niciodată același fel de două ori la rând (textul cinetic `type-*`
   contează ca un singur fel; „?”-ul, inima și bifa sunt toate „glyph”; aceeași poză reală e aceeași metaforă). O scenă
   lungă nu se umple cu încă trei etichete pe același desen: după 2-3 secunde, ideea următoare primește alt dispozitiv.
   Între reels, **fiecare are vizualul lui pentru mecanism** (`skin` secțiunea pielii, `beam` stiva de straturi de sticlă
   cu energia focalizată, `cells` câmpul de celule cu conul de ultrasunete, `energy`, `dissolve`, `puzzle`): nu-l
   repeți pe cel din reels-urile recente. `check2.cjs` refuză repetările din reel și avertizează la mecanismul repetat
   (poți scrie `"core": "<scena>"` în script ca să-l numești).
6e. **Formate pentru loturile viitoare** (referințele proprietarului din 14.11; descrise în `README.md`, „Formate
   viitoare”): (i) data-viz cu „chrome” (eticheta secțiunii sus, cronologia întregului reel jos, cifre fantomă, obiecte
   3D tactile), (ii) filmul de brand (tunel, sticlă, contoare cu cifre reale, cuvinte care se construiesc, logo la
   final), (iii) eroul aparatului (pozele reale ale aparatelor, cinematic), (iv) scheciul cu personaj 3D (încă de ales
   de proprietar între imagini Gemini animate 2.5D și video Veo), (v) manifestul tipografic (un cuvânt pe bătaie, fundal
   alternant alb / turcoaz, un cuvânt rose gold, logo la final), (vi) suspansul minimalist (o picătură de ser care se formează la
   vârful unei pipete sau la gâtul unei fiole reale, cronometrul secundelor reale privite, replici calme despre atenție
   și răbdare, niciun contor cu măsurători inventate; primul făcut: `v2-suspans-hifu`, `"kind": "silent"`, scena
   `suspans`: clepsidra uriașă cu nisip turcoaz, fiecare bob cu tick-ul lui pe bătaie, contorul de săptămâni oprit unde
   spune catalogul la acel caz, liniște adevărată, apoi poza reală pe lovitura piesei, cu cortina de nisip peste ea, și
   propoziția site-ului la final), (vii) lansarea (de la problemă la soluție, fără voce: aurora din alb
   în turcoaz, cărți 3D stivuite din lucruri reale, un moment întunecat #0b7f74 „Cunoaște” → „Centrul360.”, o pagină
   reală a site-ului din blur în clar, un cuvânt care se rotește, „Totul” → „într-un singur loc.” care devine logo), (viii) explicația în blocuri (blocuri 3D de sticlă
   numerotate care se stivuiesc, bara de progres pe capitole sus, un titlu mare și un obiect pe capitol, recapitularea
   la final, salvarea cu semnul nostru; ex. straturile pielii, cei 4 pași, cum decurge o consultație), (ix) conversația
   (un chat ca pe WhatsApp, în stilul nostru deschis, construit mesaj cu mesaj, cu tensiunea punctelor de tastare, apoi un
   montaj rapid de cazuri reale, clinică și site, final pe logo sau pe bara de căutare; **doar mesaje reale ale
   clientelor, cu acordul lor scris, fără nume și fără telefon, poza estompată sau inițiale; niciodată un mesaj inventat**;
   motorul primește lista `{who, text, time}` de la proprietar; varianta fără cliente: chatul cu Nuki, textul doar de pe
   site), (x) colajul editorial (hârtie albă cu textură, turcoaz și un singur accent rose gold, câte un obiect decupat
   și simbolic pe propoziție, ex. clepsidra cu nisip turcoaz pentru „6-8 săptămâni”, pana legată de o piatră, piesele de
   puzzle, bustul clasic cu banda rose gold pe maxilar; serif mare spațiat, italic mic, rândul de mașină de scris cu o
   pastilă, un cuvânt care se schimbă pe loc; obiectele generate o dată cu `imagen.py`, după OK-ul proprietarului; doar
   afirmații reale, niciun chip care seamănă cu o persoană reală, obiectele nu sunt niciodată dovadă de înainte/după),
   (x-b) colaj pe birou (varianta luminoasă a lui x: hârtie albă sau gri-deschis cu linii fine de schiță, obiecte generice
   fotografiate de sus cu umbre reale, majuscule condensate turcoaz, markerul rose gold sau turcoaz închis, niciodată
   roșu; obiectul lucrează pe text, blocul-definiție, CTA-ul cu cuvânt în comentarii; tranziții cu blur rapid și un puls
   pe fiecare obiect nou),
   (xi) faceless curat (fundal alb, turcoaz, text cinetic pe voce: cuvântul-cheie intră uriaș și în blur, apoi se
   retrage; accentul în italic serif; obiecte uriașe tăiate de cadru; colțuri de vizor; inel de numărătoare; noduri cu
   iconițe; pastile care se adună pentru o listă spusă în propoziții), (xii) logo-ancora (logo-ul real fix, în același
   loc și mărime, lumea din spate schimbată pe bătaie: pozele clinicii în alb-negru adevărat, cu accente turcoaz și
   logo-ul negru pe o bandă albă (proprietarul, 15.11), sticlă, hârtie în lumina ferestrei, un cuvânt uriaș turcoaz, o
   grilă doar cu date reale; fără merchandise inventat; fiecare schimbare e o expunere, cu declanșatorul pe cadrul ei,
   iar finalul se deschide pe alb cu un swoosh; tăieturi de la o bătaie la jumătate de bătaie, final ținut ~2 s; fără
   strobe; scena `logoanchor`).
   Reels-urile deja aprobate nu se refac în aceste stiluri;
   formatele sunt pentru materiale noi. **Combinații**: cele douăsprezece formate sunt piese de construcție, nu șabloane
   („poți să le și combini una cu alta, creativitatea e limita”): un data-viz al cărui răspuns e un moment de erou al
   aparatului, un manifest care se termină cu picătura, un reel educațional care începe cu picătura și apoi explică, un
   film de brand cu obiectele 3D tactile. O combinație nouă contează ca semnătură nouă la garda de varietate; regulile
   fixe rămân (culorile brandului, centrat, super clean, doar fapte reale, logo doar în filmele de brand, muzica
   constantă, cele două fișiere). Filmele de brand sunt ocazionale (cel mult unul pe săptămână, niciodată
   două la rând).
6b. **Când nu ești sigur, întrebi** (regula proprietarului): o afirmație despre un tratament, o cifră, o poză, o alegere
   de stil care poate merge în două feluri: scrii întrebarea cu variantele în raport, nu ghicești; termini tot ce e clar.
7. `node check.cjs <id>` trebuie să dea „clean” înainte de randare; apoi te uiți la cadre (primele 3 secunde des,
   răspunsul, finalul) și asculți cifrele din `mix.py` / `encode.sh` (-14 LUFS, vârf ≤ -1 dBTP, 1-3 sunete pe secundă).
Cheltuiala: vocea și imaginile se plătesc (puțin) și sunt în cache; muzica nouă (`music.py`) doar când lipsește o
stare. Trimiți `theme` (și `endType`) la `create`, ca rotația să se poată citi din `made`.

## Pașii pentru un material nou
```bash
# 1. elementul (fără fișiere încă), cu săptămâna lui și textul pe fiecare rețea
ID=$(curl -s -H "$H" -H 'Content-Type: application/json' -X POST "$U" -d '{
  "action":"create",
  "item":{"kind":"reel","week":"2026-11-16","rubric":"Cazuri","topic":"HIFU pe gușă, 3 luni după","keyword":"GUȘĂ",
          "topicTag":"hifu-gusa","hook":"Gușa asta a plecat fără ac","hookType":"socant",
          "firstComment":"Voi ce ați vrea să aflați despre HIFU pe gușă? 🥰",
          "captions":{
            "tt":"3 luni după HIFU pe gușă 👀 Rezultatele diferă de la o persoană la alta. #hifu #gusa #timisoara #centrul360",
            "yt":"HIFU pe gușă: cum arată după 3 luni #shorts",
            "ig":"Cum arată gușa la 3 luni după o ședință de HIFU …\n\n#centrul360 #timisoara #hifu #gusa",
            "fb":"Ne-ați întrebat des ce se întâmplă după HIFU pe gușă. Uite un caz real, 3 luni după …"}}
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

# 2. fișierele, ca octeți bruți (maxim 60 MB fiecare)
curl -s -H "$H" -X PUT -H 'Content-Type: video/mp4' --data-binary @out/<id>.mp4 "$U?action=file&id=$ID&name=reel.mp4"
curl -s -H "$H" -X PUT -H 'Content-Type: video/mp4' --data-binary @out/<id>-clean.mp4 "$U?action=file&id=$ID&name=clean.mp4&role=clean"
curl -s -H "$H" -X PUT -H 'Content-Type: image/jpeg' --data-binary @out/<id>.jpg "$U?action=file&id=$ID&name=cover.jpg"

# 3. gata: se verifică și intră în săptămâna lui
curl -s -H "$H" -H 'Content-Type: application/json' -X POST "$U" -d "{\"action\":\"ready\",\"id\":\"$ID\"}"
# → { ok, plan:[{net,kind,at,state}], week, info:{need,have,missing,…} }   sau 422 { error:"invalid_item", problems:[...] }
```
Dacă `ready` dă 422, citești `problems`, repari, urci din nou fișierul cu același nume (se înlocuiește) și dai `ready`
din nou. `problems` are și verificarea textelor, pe fiecare rețea („Instagram: „100%”: fără promisiuni absolute”):
limitele (TikTok și Instagram 2200 de caractere, Instagram 30 de hashtag-uri, Facebook 5000, YouTube titlul cu
#shorts 100), „garantat”, kilograme sau centimetri promiși, „vindecă”, „fără riscuri”, „100%”, medici sau dovezi
clinice, „Ai gușă?”, preț, ofertă, programare, link, concurenți, liniuțe lungi, text fără diacritice. Textul nu se
taie: unul prea lung e refuzat și îl scrii din nou. `warnings` din răspunsul lui `ready` nu opresc nimic, dar le
repari când poți („slăbit”, „instant”, prea multe hashtag-uri, cazul de pe TikTok fără „Rezultatele diferă…”). `week` lipsă înseamnă săptămâna care vine; o dată din mijlocul săptămânii se mută pe lunea ei; o săptămână
trecută e refuzată (`past_week`).

## Refacerea (`redo`)
```bash
# 1. îl deschizi din nou (textele noi pot veni aici; "clear":true șterge întâi toate fișierele vechi)
curl -s -H "$H" -H 'Content-Type: application/json' -X POST "$U" -d "{\"action\":\"replace\",\"id\":\"$ID\",\"captions\":{\"tt\":\"…\"}}"
# 2. urci fișierele refăcute cu ACELEAȘI nume (reel.mp4, cover.jpg / 01.jpg …): le înlocuiesc pe cele vechi
# 3. ready → intră înapoi la proprietar („de aprobat”), în aceleași locuri din săptămână
```
Dacă nota cere doar alt text, sari peste pasul 2. Când ai terminat toate refacerile, proprietarul primește
„Am refăcut N materiale”.

## Câmpurile
| Câmp | Ce e |
|---|---|
| `kind` | `reel` sau `carousel` (`slideshow`: doar pentru TikTok; un carusel ajunge oricum și pe TikTok ca slideshow) |
| `week` | lunea săptămânii (`2026-11-16`) |
| `rubric` | rubrica (Cazuri, Ce nu-ți spune nimeni, Unde se duce, de fapt, Experimentul, Ce se întâmplă de fapt, Întrebarea zilei, Nuki, Top 3); niciodată „mit” |
| `topic` | subiectul, scurt (apare în admin și în topul săptămânii) |
| `keyword` | cuvântul din invitația la comentariu: mereu `360` (regula din 13.11), când există |
| `captions` | textul pentru fiecare rețea: `tt`, `yt`, `ig`, `fb` (regulile mai jos) |
| `caption` | rezerva: merge pe rețelele fără text propriu. Trimite `captions` pentru toate rețelele, nu te baza pe ea |
| `hook` | primele cuvinte spuse și scrise în reel (cârligul), exact cum sunt |
| `hookType` | felul cârligului: `intrebare`, `cifra`, `pov`, `socant`, `poveste`, `experiment` (un cuvânt; adminul învață care merge; nu `mit`) |
| `topicTag` | familia subiectului, scurt și la fel de fiecare dată: `hifu-gusa`, `liposonix-abdomen`, `epilare-laser`, `rf-fata` |
| `ideaId` | ideea proprietarului pe care o face materialul (din `ideas`) |
| `variantOf` | id-ul câștigătoarei refăcute (din `recycle`) |
| `theme` | tema reel-ului (`themes.json`), ca să nu repeți tema la rând (adminul o păstrează și o arată în `made`) |
| `endType` | finalul: `loop`, `comment`, `site`, `ask` |
| `firstComment` | primul comentariu, scris de cont sub postare (Instagram, Facebook, YouTube): o întrebare caldă despre subiect, care se termină cu ❤️, 🥰 sau 💞; fără să pomenească AI; cel mult 280 de caractere |

Fișierele (nume: litere, cifre, `-`, `_`, extensia `.mp4` sau `.jpg`; tipul trimis cu `Content-Type` sau `&mime=`):
- **reel**: exact un MP4 9:16 (1080×1920), 3-90 s, plus exact o copertă JPG. Merge pe TikTok, YouTube Shorts,
  Instagram Reels și Facebook Reels.
- **carousel**: 2-10 poze JPG, toate 4:5 (1080×1350) sau toate 1:1, numite `01.jpg`, `02.jpg` … (ordinea de pe rețea).
  Merge pe Instagram și Facebook ca carusel și pe TikTok ca slideshow (fiecare în altă zi). Caruselul săptămânii e
  unul de rezultate.

Mărimea și durata se citesc din fișier; nu trebuie trimise.

## Textele pe rețele
- **Alt text pe fiecare rețea**, scris pentru ea. Niciodată același text copiat pe toate patru.
- **TikTok** (`tt`): scurt, o frază sau două, ton viu, 3-5 hashtag-uri la final.
- **Instagram** (`ig`): mai lung (povestea, ce afli, întrebarea de final), hashtag-urile la sfârșit, după un rând gol.
- **Facebook** (`fb`): conversațional, ca un mesaj către o prietenă, cu o întrebare care cheamă comentarii; fără
  șir de hashtag-uri (cel mult 1-2).
- **YouTube** (`yt`): ca un titlu, cel mult 90 de caractere, cu `#shorts` la final (YouTube taie la 100).
- Invitația cu cuvânt cheie în comentarii („Scrie «GUȘĂ» în comentarii …”) **cel mult la 1 din 3 materiale** din
  săptămână; la celelalte, o întrebare simplă sau nimic.
- **TikTok și înainte/după**: rar (nu mai mult de 1-2 pe săptămână) și întotdeauna cu „Rezultatele diferă de la o
  persoană la alta” în text și pe ecran.
- Restul regulilor din README.md rămân: fără preț, ofertă, „programează-te”, link sau promisiuni; diacritice, fără
  liniuțe lungi (le înlocuiește oricum adminul).

## Ce face adminul după
- Cotele pe săptămână (Admin → Conținut → Setări): săptămânile 1-2 TikTok 7 reels + 1 slideshow, YouTube 7,
  Instagram 5 + 1 carusel, Facebook 5 + 1 carusel; de la săptămâna 3: TikTok 14 + 1, YouTube 10, Instagram 7 + 1,
  Facebook 7 + 1. Orele: TikTok 19:30 (a doua pe zi 12:30), YouTube 17:00 (12:00), Instagram 12:30, Facebook 13:00;
  caruselele și slideshow-ul la ora lor.
- Fiecare reel merge o dată pe fiecare rețea care are loc pentru el, niciodată pe două rețele în aceeași zi; în
  fiecare zi rețelele arată materiale diferite; fiecare rețea își primește cota împărțită egal pe zile.
- Nimic nu se postează până nu aprobă proprietarul. TikTok și YouTube primesc locurile lor („așteaptă acces”) până
  se leagă postarea acolo.
- Ceasul (la :17 în fiecare oră) postează ce e aprobat și la rând, citește cifrele zilnic și lunea trimite
  proprietarului topul săptămânii („de pus ca reclamă”). Înainte de fiecare postare verifică din nou textul (proprietarul
  îl poate schimba): o problemă ține postarea pe loc, cu motivul în Admin → Conținut.
- Zilnic: urmăritorii pe fiecare rețea; pe 1 ale lunii, la 9:00, „RAPORTUL LUNII: conținut” (postări, vizualizări,
  urmăritori câștigați, cel mai bun material). Lunea la 11:00, dacă din săptămâna aprobată nu pleacă nimic în ziua
  aceea (o permisiune, comutatorul oprit), proprietarul e anunțat.
- Admin → Conținut → Rezultate (ecranul principal; „Program” e tabla de aprobat): aceleași cifre pe care le citești
  tu în `learn`, plus cifrele pe fiecare postare (cât se uită, cât rămân după 3 secunde și la jumătate, salvări,
  distribuiri, urmăritori aduși), creșterea în primele ore, pâlnia organică (comentarii cu cuvântul, mesaje, leaduri,
  programări, cliente), publicul, orele recomandate, ce spun oamenii și analiza săptămânii. Un material care în
  primele 24 de ore are de 3 ori mai multe vizualizări decât de obicei e „MERGE TARE 🔥” și proprietarul e anunțat.
  Din orice postare de pe Instagram sau Facebook proprietarul poate face reclamă („Fă reclamă din asta”).
- Starea completă, pentru verificare: `GET https://admin.centrul360.com/api/lead-health?content=1` (aceeași cheie).
