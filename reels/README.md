# Reels: mașina de video scurte organice

Reels (și un carusel de rezultate) pentru TikTok, Instagram Reels, Facebook Reels și YouTube Shorts, predate o
săptămână odată (cotele pe rețea sunt în Admin → Conținut → Setări). Educative și amuzante, valoare gratuită,
fără să arate a reclamă: fără preț, fără ofertă, fără „programează-te”. Totul animat (fără filmare): text cinetic, Nuki,
grafică în mișcare și, la cazuri, pozele reale din catalog. Vocea în română. La final, doar invitația la comentariu:
„Scrie «GUȘĂ» în comentarii și îți trimitem tot ce trebuie să știi” (un cuvânt per subiect).

## Cum se face un reel
1. `scripts/<id>/script.json`: scenele. Fiecare scenă are un `type` și replici (`beats`): `say` e ce se aude,
   `tts` (opțional) cum se citește (numere în litere), `cap` (opțional) subtitlul, `pose` ipostaza lui Nuki
   (`brand_asset/mascota/ipostaze/`). Sus: `rubric`, `keyword`, `post` (textul de sub video, cu hashtag-uri).
2. `cd engine && ./make.sh <id>` → `out/<id>.mp4` (1080×1920, 30 fps, H.264 + AAC) și `out/<id>.jpg` (coperta).
   Pașii: `voice.py` (vocea filmelor Academiei, Gemini TTS pe Vertex, fiecare replică ascultată înapoi și refăcută dacă
   nu e exactă, apoi grăbită ușor x1.14) → `check.cjs` → `render.cjs` → `mix.py` → `encode.sh` (cu verificarea de flash).
3. Te uiți la cadre: `node snap.cjs <id> <folder> [secunde...] [--debug]` (`--debug` arată zonele interzise cu roșu).

Prima dată pe o mașină: `npm i`, `python3 sfx.py`, `python3 music.py 3` (în `engine/`, cu `VERTEX_API_KEY`).
Vocea, randările, muzica și sunetele rămân locale (`.gitignore`); `timing.json` se păstrează.

Tipuri de scene: `hook` (titlul, opțional cu jumătatea „înainte” a unei poze din catalog), `stamp` (MIT / ADEVĂR /
PE JUMĂTATE), `cards` (1-3 fapte, cu ✓ sau ✗ tăiat), `big` (o cifră sau o frază mare), `layers` (pielea în secțiune:
aplicatorul, punctele de energie, SMAS, colagenul), `photo` (caz real din catalog, cu dezvăluire „înainte → după”),
`stage` (Nuki vedeta: `crunch` cu numărătoare, `jump` cu confetti), `body` (energia din tot corpul), `end` (cuvântul
scris în bara de comentariu).

## Rubricile
1. **Cazuri** (rubrica principală, cererea proprietarului din 12.11): povestea unui caz real din catalog, spusă de
   Nuki: situația (zona, orașul, câte ședințe), ce s-a făcut, rezultatul cu poza reală înainte/după. Fără nume.
2. **Mit sau adevăr?**: un mit, ștampila, adevărul în 3-4 fapte.
3. **Ce se întâmplă de fapt**: ce face HIFU / Liposonix / laserul sub piele, desenat.
4. **Întrebarea zilei**: o întrebare reală a clientelor, un răspuns scurt.
5. **Nuki**: un sketch amuzant care se termină cu adevărul.
6. **Top 3 / greșeli**: trei lucruri, numărate.

Exemple: `mit-gusa-kilograme`, `fapt-hifu-gusa`, `nuki-abdomene-burtica`, `caz-18-hifu-gusa`.

## Regulile
- Cârligul e și vizual, și sonor: textul e pe ecran din primul cadru, cuvintele intră cu lovitură, imaginea „crește”
  în cadru în 0,5 s, iar pe primele cuvinte se aude `hit` + `whoosh`. Primele cuvinte se spun înainte de 0,4 s.
- 20-35 s. O tăietură sau o schimbare vizuală cel puțin la 4 s (motorul adaugă un puls unde ar sta pe loc).
- Zonele sigure: nimic scris în primii 220 px de sus, în ultimii 380 px de jos și în ultimii 160 px din dreapta.
  `check.cjs` verifică, plus suprapuneri, subtitrări peste Nuki, lungimea, vocea, cârligul.
- Subtitrări mari, cuvânt cu cuvânt (cuvântul spus e evidențiat), cel mult 3 cuvinte pe ecran.
- Fără preț, ofertă, „programează-te”, link sau „consultație gratuită”. `check.cjs` caută cuvintele astea.
- Fapte corecte, fără promisiuni: fără „garantat”, fără „slăbești X kg”, fără diagnostice. Formulări sigure din
  `centrul360-creative-machine/knowledge/meta-ads-rules.md` („grăsime localizată”, „conturare”, „fără operație”).
  Fără „Ai gușă?”: nu vorbim despre defectul privitorului, vorbim despre subiect.
- Înainte/după doar din `brand_asset/catalog` (cazuri publicate cu acordul clientei), puse exact cum sunt, cu
  „Publicat cu acordul clientei. Rezultatele diferă de la o persoană la alta.” Niciodată generate sau inventate.
- Fără nume de cliente, fără liniuțe lungi, cu diacritice (ș, ț cu virgulă). Epilarea și EMS doar Timișoara.

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
