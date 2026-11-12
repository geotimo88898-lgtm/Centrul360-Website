# Producătorul: cum predai lotul săptămânii

Sesiunea producătorului face reels și carusele cu `reels/engine` și le predă adminului **o săptămână întreagă odată**
(decizia proprietarului, 12.11). Adminul le împarte pe rețele, proprietarul le verifică duminica în Admin → Conținut
(„Aprobă” sau „Refă” cu o notă) și ceasul postează **doar ce e aprobat**, cât timp postarea automată e pornită.

Adresa: `https://admin.centrul360.com/api/content-intake`
Cheia: antetul `Authorization: Bearer $CREATIVE_SSO_SECRET` (aceeași cheie ca la `/api/lead-health`). Nu o scrie
niciodată în fișiere, commituri sau loguri.

## Când rulezi
- **Sâmbătă, pe la 18:00**: lotul pentru săptămâna care vine (luni 00:00 până duminică 23:59, ora României).
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
  "made":    [ { "topic": "…", "rubric": "…", "kind": "reel", "week": "…", "at": "…" } ] }
```
- `next.missing`: **exact câte faci** pentru săptămâna care vine (`reel` reels și `carousel` carusele). Zero și zero:
  lotul e complet, nu mai faci nimic pentru ea.
- `need`: cât cere săptămâna (rețeaua cu cea mai mare cotă: TikTok are 7 reels în săptămânile 1-2, 14 de la a 3-a).
  `have`: câte sunt deja gata. `n`: a câta săptămână e (1 și 2 sunt de încălzire, cu cote mai mici).
- `redo`: ce a trimis proprietarul înapoi, cu nota lui (`redoNote`). Le refaci (pașii de mai jos), nu faci altele noi
  în locul lor: `have` le numără deja.
- `drafts`: elemente create dar nedate gata (o rulare întreruptă): le termini sau le lași, nu le dublezi.
- `made`: ce s-a făcut deja; nu repeți un subiect din ultimele 30 de zile.
- Rubricile prin rotație (README.md), Cazuri de cel puțin 2 ori pe săptămână.

## Pașii pentru un material nou
```bash
# 1. elementul (fără fișiere încă), cu săptămâna lui și textul pe fiecare rețea
ID=$(curl -s -H "$H" -H 'Content-Type: application/json' -X POST "$U" -d '{
  "action":"create",
  "item":{"kind":"reel","week":"2026-11-16","rubric":"Cazuri","topic":"HIFU pe gușă, 3 luni după","keyword":"GUȘĂ",
          "captions":{
            "tt":"3 luni după HIFU pe gușă 👀 #hifu #gusa #timisoara #centrul360",
            "yt":"HIFU pe gușă: cum arată după 3 luni #shorts",
            "ig":"Cum arată gușa la 3 luni după o ședință de HIFU …\n\n#centrul360 #timisoara #hifu #gusa",
            "fb":"Ne-ați întrebat des ce se întâmplă după HIFU pe gușă. Uite un caz real, 3 luni după …"}}
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

# 2. fișierele, ca octeți bruți (maxim 60 MB fiecare)
curl -s -H "$H" -X PUT -H 'Content-Type: video/mp4' --data-binary @out/<id>.mp4 "$U?action=file&id=$ID&name=reel.mp4"
curl -s -H "$H" -X PUT -H 'Content-Type: image/jpeg' --data-binary @out/<id>.jpg "$U?action=file&id=$ID&name=cover.jpg"

# 3. gata: se verifică și intră în săptămâna lui
curl -s -H "$H" -H 'Content-Type: application/json' -X POST "$U" -d "{\"action\":\"ready\",\"id\":\"$ID\"}"
# → { ok, plan:[{net,kind,at,state}], week, info:{need,have,missing,…} }   sau 422 { error:"invalid_item", problems:[...] }
```
Dacă `ready` dă 422, citești `problems`, repari, urci din nou fișierul cu același nume (se înlocuiește) și dai `ready`
din nou. `week` lipsă înseamnă săptămâna care vine; o dată din mijlocul săptămânii se mută pe lunea ei; o săptămână
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
| `rubric` | rubrica (Cazuri, Mit sau adevăr?, Ce se întâmplă de fapt, Întrebarea zilei, Nuki, Top 3) |
| `topic` | subiectul, scurt (apare în admin și în topul săptămânii) |
| `keyword` | cuvântul din invitația la comentariu (GUȘĂ), când există |
| `captions` | textul pentru fiecare rețea: `tt`, `yt`, `ig`, `fb` (regulile mai jos) |
| `caption` | rezerva: merge pe rețelele fără text propriu. Trimite `captions` pentru toate rețelele, nu te baza pe ea |

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
  proprietarului topul săptămânii („de pus ca reclamă”).
- Starea completă, pentru verificare: `GET https://admin.centrul360.com/api/lead-health?content=1` (aceeași cheie).
