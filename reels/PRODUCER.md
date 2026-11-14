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
1. **Întrebarea întâi.** Alegi întrebarea pe care și-o pune privitorul și la care răspunzi abia la final
   („De ce unele femei slabe au totuși gușă?”). Ea e `hook.q`, se spune și se vede în primele 3 secunde, peste o
   scenă care se mișcă din primul cadru (particule, un contor care pornește, poza reală pe jumătate acoperită).
2. **Replici scurte, fiecare cu scena ei.** O replică = o idee = un vizual (`visual`) sau un pas al scenei curente
   (`step`). Alegi scena care arată ce spui, nu una decorativă: un depozit de grăsime → `skin` cu `focus`; „din tot
   corpul” → `energy`; o comparație → `split`; o credință greșită → `dissolve` (niciodată cuvântul „mit” sau o
   ștampilă). Nu repeta aceeași scenă de două ori
   la rând; schimbă tranziția și camera (motorul le rotește din temă dacă nu le scrii).
3. **Mini-dezvăluiri la 3-5 secunde**, tensiune spre răspuns: „Stai, că e mai interesant”, „Bun, acum să vedem”.
4. **Răspunsul (payoff)** după 40 % din reel, cu o dezvăluire (poza, puzzle-ul care se îmbină, credința care se
   destramă). Motorul pune pauza, riserul și impactul. Apoi **rezolvarea** („Și atunci, ce faci?” + 2-3 lucruri
   practice, reale) și **încheierea** caldă, cu un CTA potrivit (`cta`: `soft`, `talk`, `loop`) și „?”-ul care se
   rezolvă (bifă sau inimă). Niciodată un final care se oprește brusc. 30-45 s.
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
6. **Tema și varietatea** (14.11): doar `brand-light` (alb cu turcoaz) sau `brand-teal` (turcoaz cu alb), alternate
   (niciodată aceeași de două ori la rând; citești `made`). Rose gold doar ca accent. Și, pentru că „nu vreau să fie la
   fel niciunul”, de la un reel la altul schimbi: cârligul (particule, privirea la poza reală, contorul, o întrebare
   tipărită…), scenele-semnătură (race, scrubber, cardrow, căutarea pe site, straturile pielii; cel puțin una de date
   când povestea are cifre în timp, doar cu cifre reale sau marcată „Ilustrativ”), aranjarea (`layout`: sus, mijloc sau
   jos, mărimea textului; totul rămâne centrat pe axa cadrului), ritmul, setul de tranziții (`transitions`), unde apare
   Nuki și finalul. Muzica previzualizării: începutul piesei proprietarului, la toate. `check2.cjs` refuză aceeași combinație temă + cârlig + scene + final și avertizează la peste
   jumătate scene de același fel ca reel-ul precedent. Super clean: puține elemente, fără efecte pe text; dacă ceva e
   încărcat, se scoate.
6c. **Muzica și postarea** (14.11): muzica stă constantă, „semi tare”, vocea peste ea (fără ducking sau alte
   automatizări; nivelul din `mix.py`, verificat cu `python3 listen.py <id>`). Fiecare reel are două fișiere:
   `out/<id>.mp4` (previzualizarea, cu piesa proprietarului) și `out/<id>-clean.mp4` (doar voce și efecte). La
   predare urci AMÂNDOUĂ: previzualizarea ca `reel.mp4` (fără `role`; doar pentru aprobare, nu se postează niciodată)
   și fișierul fără muzică ca `clean.mp4` cu `&role=clean` (ăsta pleacă: proprietarul îl postează din aplicații, cu
   „Distribuie” din Conținut → De postat, și pune acolo sunetul licențiat). Piesa (`engine/music/owner-free.wav`) nu se comite niciodată.
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
