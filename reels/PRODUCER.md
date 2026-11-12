# Producătorul de noapte: cum predai conținutul

Sesiunea de noapte face reels (și mai târziu carusele și story-uri) cu `reels/engine` și le predă adminului.
Adminul le programează singur pe rețele, le postează la ore fixe fără aprobare (decizia proprietarului) și le
citește cifrele. Proprietarul are în Admin → Conținut butonul de oprire.

Adresa: `https://admin.centrul360.com/api/content-intake`
Cheia: antetul `Authorization: Bearer $CREATIVE_SSO_SECRET` (aceeași cheie ca la `/api/lead-health`). Nu o scrie
niciodată în fișiere, commituri sau loguri.

## Regula cozii
1. Întâi întrebi starea: `GET ?action=status`.
2. Ținta: cel puțin 6 zile de conținut în față pe fiecare rețea pornită.
   - `daysAhead` sub 6: faci `want` (mai mult de 3, cât să recuperezi).
   - `daysAhead` între 6 și 14: faci 3.
   - `daysAhead` 14 sau peste: nu faci nimic în noaptea asta.
   `want` din răspuns e deja calculat după regula asta; îl urmezi.
3. Rubricile prin rotație (README.md), Cazuri de cel puțin 2 ori pe săptămână.

## Pașii pentru un reel
```bash
H="Authorization: Bearer $CREATIVE_SSO_SECRET"
U=https://admin.centrul360.com/api/content-intake

# 1. starea cozii
curl -s -H "$H" "$U?action=status"
# → { on, slots, nets, counts:{planned,posted,error,...}, queued, daysAhead, until, nextFree:{ig,fb}, want }

# 2. elementul nou (fără fișiere încă)
ID=$(curl -s -H "$H" -H 'Content-Type: application/json' -X POST "$U" -d '{
  "action":"create",
  "item":{"kind":"reel","rubric":"Cazuri","topic":"HIFU pe gușă, 3 luni după","keyword":"GUȘĂ",
          "caption":"Textul de sub postare, cu invitația la comentariu.\n\n#centrul360 #timisoara #hifu"}
}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["id"])')

# 3. fișierele, ca octeți bruți (maxim 60 MB fiecare)
curl -s -H "$H" -X PUT -H 'Content-Type: video/mp4' --data-binary @out/<id>.mp4 "$U?action=file&id=$ID&name=reel.mp4"
curl -s -H "$H" -X PUT -H 'Content-Type: image/jpeg' --data-binary @out/<id>.jpg "$U?action=file&id=$ID&name=cover.jpg"

# 4. gata: se verifică și se programează
curl -s -H "$H" -H 'Content-Type: application/json' -X POST "$U" -d "{\"action\":\"ready\",\"id\":\"$ID\"}"
# → { ok, plan:[{net,at,state}] }   sau 422 { error:"invalid_item", problems:[...] }
```
Dacă `ready` dă 422, citești `problems`, repari fișierul, îl urci din nou cu același nume (se înlocuiește) și dai
`ready` din nou. După `ready` fișierele nu se mai schimbă.

## Câmpurile
| Câmp | Ce e |
|---|---|
| `kind` | `reel`, `carousel` sau `story` |
| `rubric` | rubrica (Cazuri, Mit sau adevăr?, Ce se întâmplă de fapt, Întrebarea zilei, Nuki, Top 3) |
| `topic` | subiectul, scurt (apare în admin și în topul săptămânii) |
| `keyword` | cuvântul din invitația la comentariu (GUȘĂ) |
| `caption` | textul de sub postare, cu hashtag-uri (cel mult 2200 de caractere); obligatoriu la reel și carusel |

Fișierele (nume: litere, cifre, `-`, `_`, extensia `.mp4`, `.jpg` sau `.png`; tipul trimis cu `Content-Type`
sau `&mime=`):
- **reel**: exact un MP4 9:16 (1080×1920), 3-90 s, plus exact o copertă JPG.
- **carousel**: 2-10 poze, toate 4:5 (1080×1350) sau toate 1:1, numite `01.jpg`, `02.jpg` … (ordinea de pe rețea).
  Doar JPG: Instagram nu primește PNG (un carusel cu PNG merge doar pe Facebook).
- **story**: un MP4 9:16 de cel mult 60 s, sau o poză JPG 9:16.

Mărimea și durata se citesc din fișier; nu trebuie trimise.

## Ce face adminul după
- Fiecare zi are orele din setări (implicit 10:00, 14:00, 19:00, ora României); fiecare rețea primește cel mult un
  element pe oră și cel mult atâtea pe zi.
- Un element nou merge întâi pe rețeaua rămasă cel mai în urmă, apoi pe celelalte, la cel puțin 2 zile una de alta,
  niciodată pe două rețele în aceeași zi. TikTok și YouTube primesc locul lor („așteaptă acces”) până se leagă.
- Ceasul (la :17 în fiecare oră) postează ce e la rând, citește cifrele zilnic și lunea trimite proprietarului topul
  săptămânii („de pus ca reclamă”).
- Starea completă, pentru verificare: `GET https://admin.centrul360.com/api/lead-health?content=1` (aceeași cheie).
