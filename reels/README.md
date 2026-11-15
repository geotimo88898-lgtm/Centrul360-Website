# Reels: mașina de video scurte organice

Reels (și un carusel de rezultate) pentru TikTok, Instagram Reels, Facebook Reels și YouTube Shorts, predate o
săptămână odată (cotele pe rețea sunt în Admin → Conținut → Setări). Educative, cu umor fin, valoare gratuită, fără
să arate a reclamă: fără preț, fără ofertă, fără „programează-te”. Totul animat (fără filmare). Vocea în română.
Din 12.11 se fac doar reels **v2** (mai jos); v1 (`stage.html`, `engine.js`) rămâne doar ca să se poată randa
reels-urile vechi (scripturile fără `"v": 2` din `scripts/`; cele cu ștampila veche nu se mai postează, regula din 13.11).

## Direcția proprietarului (12.11)
**Citește întâi `GUST.md`**: jurnalul cu verdictele proprietarului și principiile de montaj învățate din ele (din 15.11).

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
- **Finalul nu se oprește brusc**: după răspuns vine rezolvarea (2-3 lucruri practice, reale, utile, spuse în
  propoziții, fără întrebarea retorică „Și atunci, ce faci?”, scoasă pe 14.11; dacă se potrivește, variantele non-invazive spuse firesc, fără preț și fără promisiuni), apoi o replică
  caldă de încheiere cu un vizual care rezolvă „?”-ul de la început (devine bifă sau inimă) și un acord muzical final,
  apoi tipul de final. Mereu o formă de CTA, potrivită video-ului: blând (rezolvarea însăși, „uite cum arată pe
  centrul360.com”, „salvează-l”), de conversație („Scrie 360 și-ți spun ce s-ar potrivi la tine”) sau, la buclă, o
  ultimă replică ce invită la revedere. 30-45 s în total.
- **Cuvântul din comentarii e mereu 360.**
- **Niciodată cuvântul „mit” și nici formatul „Mit sau adevăr?”** (fără ștampilă, fără întrebarea asta, fără rubrica
  asta). Aceeași idee se împachetează captivant: „Ce nu-ți spune nimeni despre…”, „Unde se duce, de fapt, …”,
  „Experimentul” (o simulare spusă clar, fără rezultate inventate), un cârlig contraintuitiv, un POV, o cursă.
- **Cazurile** urmează același stil: rezultatul real se vede devreme (o privire la „după”, apoi înainte → după, cu o
  lovitură sonoră), cu o propoziție clară despre ce s-a întâmplat (din 14.11, nu o întrebare), povestea curge spre soluție (ce o
  frământa, spus general; ce s-a făcut și de ce merge, desenat), apoi dezvăluirea completă, rezolvarea și finalul.
- **Muzica** (13.11, înlocuită pe 14.11 de „Muzica și postarea”): originală (Lyria), cu energia muzicii care merge acum (house anilor '90, UK garage, nu-disco, afro
  house, lo-fi house), niciodată o melodie, un text sau un titlu copiat; fiecare reel altă piesă (`musicClip`);
  lovitură pe cârlig; din 14.11 fără automatizări de volum (vezi „Muzica și postarea”). Referința
  proprietarului (un clasic house din anii '90) a fost doar măsurată, pentru stil: ~123 BPM, fa major, un intro scurt
  și apoi un groove constant, plin de energie.
- **Excepție, decizia proprietarului (13.11):** pentru `v2-gusa-slabe` și `v2-caz-real` patul muzical e chiar piesa
  aleasă de el („Free”, Ultra Naté), riscul de drepturi asumat de el pentru conturile lui. Fișierul stă doar local, în
  `engine/music/owner-free.wav` (folder ignorat de git; nu se comite niciodată). În script: `"music"` (eticheta
  pentru admin), `"musicFile"`, `"musicStart"` (secunda din piesă; implicit 0,395 s, primul downbeat, începutul piesei) și `"beat":
  {"bpm"}`. `python3 beats.py music/<fișier>.wav` măsoară tempoul (125 BPM), grila și frazele de 8 măsuri și propune
  și refrenele (77,2 s și 169,3 s), dar din 14.11 reels-urile pornesc de la începutul piesei. Reel-ul începe pe un downbeat (lovitura cârligului cade pe
  el), fiecare tăietură se mută pe bătaia cea mai apropiată (sau pe jumătatea ei), vocea rămâne pe timpii ei.
  Mixul: din 14.11 muzica stă constantă (mai sus, „Muzica și postarea”); `mix.py` raportează „voice over music” (dB). Pe rețele, o piesă comercială poate fi redusă la tăcere sau blocată, iar conturile de
  business nu au voie la muzică comercială în postări; asta e riscul asumat.

## Regulile proprietarului din 14.11: brandul, super clean, fiecare reel altfel
- **Doar culorile brandului**, două teme (`engine/themes.json`), nimic altceva (`check2.cjs` refuză orice altă temă):
  `brand-light` (alb cu turcoaz) și `brand-teal` (turcoaz cu alb). Turcoazul site-ului (#14a596, #0f8a7e, nuanțele
  #eef7f6 și #dcf2ef), cerneala #12201f și **rose gold doar ca accent** (gradientul #fbe3d9 → #eab5a5 → #cf8f7d de pe
  pastila Black Friday și butoanele „Rezervă oferta” din `v2/kit.css`): evidențieri, cifre cheie, bila cronologiei,
  steagul liderului, o lumină de contur; niciodată suprafețe mari. Temele vechi (aurora, burgundy, obsidian…) nu mai există.
- **Super clean, cu bun simț și bun gust**: mult spațiu alb, puține elemente pe ecran, tipografie fără efecte (fără
  strălucire, fără umbre pe text), linii fine, umbre moi, mișcări calme și precise (scenele de date fără „bounce”),
  totul aliniat pe grilă. Dacă ceva pare încărcat pe foaia de contact, se scoate. Logo-ul nu stă pe ecran; apare doar
  unde e firesc (browserul finalului `site`, cu capturi reale). Nuki apare de câteva ori, cu sens, niciodată de umplutură.
- **Scene de date** (`engine/v2/dataviz.js`, după o referință UI pe care proprietarul a ales-o): `race` (bare lucioase
  extrudate, cu teșitură, față laterală, reflex și umbră moale, care cresc și își schimbă locul pe o cronologie;
  liderul în rose gold, cu un steag), `scrubber` (o cronologie cu bilă, diviziuni etichetate, o cifră uriașă „fantomă”
  în spate, un interval marcat în rose gold), `cardrow` (cărți portret cu insignă de rang și etichetă de stare). Doar
  cifre reale (topics.json, site-ul); altfel scena spune „Ilustrativ” și nu arată cifre.
- **Niciun reel la fel** („nu vreau să fie la fel niciunul”): între reels variază tema, cârligul (particule, privire la
  poza reală, contor…), scenele-semnătură (race, scrubber, cardrow, căutarea pe site, straturile pielii), aranjarea
  (`"layout": {"anchor": "top" | "center" | "bottom", "typeScale": 0.9-1.1}`; totul rămâne centrat), ritmul,
  setul de tranziții (`"transitions": [...]` în script), unde și cum apare Nuki, finalul și partea din muzică.
  `check2.cjs` refuză un reel cu aceeași temă + cârlig + scene-semnătură + final ca altul și avertizează când peste
  jumătate din scene sunt de același fel ca la reel-ul precedent.
- **Când nu e sigur, întreabă** (regula proprietarului): o afirmație despre un tratament, o cifră, ce poză se poate
  arăta, o alegere de stil care poate merge în două feluri: se notează întrebarea cu variantele și se întreabă
  proprietarul, în loc să se ghicească.

## Încă trei reguli din 14.11 (după a doua previzualizare)
- **Totul centrat** pe axa verticală a cadrului (x 540): scena vizuală e 110..970, textul stă într-o coloană de 760 px
  (160..920, dreapta de 160 px rămâne liberă pentru butoanele aplicațiilor). Nu mai există aliniere la stânga.
- **Grila cu chenare din fundal e semnătura** fiecărui reel, în ambele teme, discretă și nemișcată (ca formele să poată
  sta exact pe pătratele ei).
- **Turcoazul mai aprins al site-ului**: fundalul `brand-teal` e #14a596, #5fd4c6 pentru evidențieri, #0b7f74 doar
  pentru adâncime; în `brand-light` accentul e #14a596. Textul mic alb de pe turcoaz are o umbră foarte fină.
- **„?”-ul de deschidere și rezolvarea lui** (`engine/v2/hooks.js`), „mult mai clean, ceva chiar profi”: am încercat
  două variante (`out/hook-test-grid.mp4`, `out/hook-test-stroke.mp4`): `gridq`, „?”-ul construit din pătratele grilei,
  care se aprind și se extrudează în cascadă, și `strokeq`, un „?” vectorial desenat de o linie fină și umplut ca sticla,
  cu punctul ca o sferă rose gold, iar pătratele grilei peste care trece linia se aprind scurt în urma ei. Standardul e
  `strokeq` (forma e mai curată și mai „premium”; grila rămâne prezentă prin urma de pătrate); rezolvarea de la final
  (bifă sau inimă) folosește aceeași scenă (`to`). `gridq` rămâne în bibliotecă, pentru variație.

## Muzica și postarea (regulile proprietarului din 14.11)
- **Muzica stă constantă tot timpul**: un singur nivel pe tot reel-ul, „semi tare” în fundal, iar vocea vorbește peste
  ea. Fără ducking, fără sidechain, fără automatizări de volum, fără filtre care se deschid, fără fade la acord; doar o
  coadă fără clic de 0,3 s pe ultimele cadre și o mică scobitură statică de -3 dB la 2,5 kHz, unde stă vorbirea.
- **Partea din piesă**: începutul ei („pune partea de început”), de la primul downbeat (0,395 s), la toate reels-urile;
  tăieturile rămân pe bătăi. Piesa își păstrează dinamica (intro mai încet, refren mai plin): câștigul fix se calculează
  pe momentele ei mai tari, ca vocea să rămână clară peste tot.
- **Nivelul** (`MUSIC_UNDER_VOICE` în `mix.py`, implicit 4,5): întâi nivelul la care vocea se înțelege clar (8 dB de
  voce peste muzică în banda vorbirii, 1-4 kHz, cât vorbește, și ascultătorul automat aude fiecare cuvânt: `python3
  listen.py <id>` transcrie mixul final și numără cuvintele greșite), apoi „puțin mai tare”: +2 dB de muzică (6 dB), apoi,
  după a treia previzualizare, „dă puțintel mai tare la muzică”: încă +1,5 dB. Deci 4,5 dB în banda vorbirii, măsurat pe
  momentele mai tari ale piesei. Se verifică pe fiecare reel cu `listen.py` (WER sub ~2 %).
- **Postare din aplicație**: proprietarul postează singur, din aplicații, și pune acolo sunetul licențiat. De aceea
  fiecare reel iese în două fișiere (`./make.sh <id>` le face pe amândouă): `out/<id>.mp4`, previzualizarea, cu piesa
  aleasă de el („Free”, `engine/music/owner-free.wav`, ignorată de git, nu se comite niciodată; fără ea, previzualizarea
  iese fără muzică, niciodată cu o piesă generată), și `out/<id>-clean.mp4`, același video doar cu vocea și efectele,
  pentru postare. Amândouă la -14 LUFS, vârf real sub -1 dBTP. Lovitura de pe primul cadru e puțin mai încet sub
  primele cuvinte, ca să nu le acopere.

## Animații diferite (a treia previzualizare, 14.11: „ai grijă la animațiile prea asemănătoare”)
- **Într-un reel**: niciun fel de scenă și nicio metaforă vizuală de mai mult de două ori și niciodată același fel de
  două ori la rând. Felurile: textul cinetic (`type-*`) e unul singur; „?”-ul, inima și bifa (`qmark`, `gridq`,
  `strokeq`) sunt „glyph”; aceeași poză reală e aceeași metaforă. Nici o scenă lungă nu se umple cu încă trei etichete
  pe același desen (secțiunea pielii apărea de patru ori într-un reel): ideea următoare primește alt dispozitiv.
- **Între reels**: fiecare are vizualul lui pentru mecanism. Gușa: secțiunea pielii o dată (`skin`), apoi HIFU și
  radiofrecvența pe o stivă de straturi de sticlă (`beam`); cazul Liposonix: un câmp 3D de celule de grăsime cu conul de
  ultrasunete (`cells`). `check2.cjs` refuză repetările din reel și avertizează când mecanismul unui reel e același cu al
  unuia din ultimele trei (`"core"` în script îl numește; altfel se ia din scene).
- **Finalul**: „?”-ul de la început nu se mai repetă la încheiere; încheierea desenează direct răspunsul (`strokeq` cu
  `"glyph": "heart"` sau `"check"`), cu același tratament (linie fină, umplere de sticlă).
- **Cazul real**: cel mai bun înainte/după cu Liposonix dintr-o singură ședință e cazul 05 (șolduri, Timișoara, o
  ședință, publicat cu acordul clientei, ales de proprietar și pentru caruselul de pe prima pagină). Pachetele
  (Liposonix + EMS) nu sunt „o singură ședință”, iar grilele de 4 poze nu-i plac. În cârlig se vede întâi „după”, din
  blur în clar, aproape pe șolduri (`"split": "h"`, `"focus": [0.75, 0.6]`, `"zoom"`, `"crop"`), apoi poza întreagă.

## Formate viitoare (referințele proprietarului din 14.11; pentru materiale noi, nu pentru reels-urile aprobate)
Proprietarul a trimis patru referințe ca idei pentru loturile următoare. Reels-urile existente nu se refac în stilurile
lor. Toate rămân în culorile brandului, centrate, super clean, cu grila ca semnătură, doar cu date și poze reale.

**(i) Data-viz cu „chrome”** (instagram.com/reel/DfkCsRMknwQ). Cum arată: un singur obiect proiectat de la un capăt la
altul. Un „chrome” al cadrului stă tot reel-ul: sus o bandă subțire cu eticheta secțiunii (majuscule, spațiate) în
stânga și pasul în dreapta, peste o linie fină; jos o cronologie a întregului reel (diviziuni 01…N, o bilă care
înaintează, „Ilustrativ” când valorile nu sunt măsurate, „Pasul 3 din 10”); în spate cifre uriașe, foarte palide. Fiecare
idee e un obiect 3D tactil, ca de plastic sau lut, cu teșituri și umbre moi: bare lucioase extrudate, taste groase ca de
tastatură, comutatoare, o monedă mare, etichete ștampilate, cărți care se așază una peste alta, curbe care se
întrec, la final o tastă 3D uriașă ca CTA. Obiectele cad, se apasă, se stivuiesc, alunecă; o idee nouă la 1-2 secunde.
Subtitrarea, groasă, sub obiect, cuvânt cu cuvânt, cuvântul cheie într-o pastilă colorată. La noi: eticheta de ex.
„CE SE ÎNTÂMPLĂ SUB BĂRBIE” | „PASUL 2”, cronologia pe pașii reel-ului sau pe săptămâni (Liposonix), obiectele în
turcoaz, alb și rose gold, tasta finală „360” pentru un final `comment`. Ce există deja: `engine/v2/chrome.js`
(banda de sus, cronologia, cifra fantomă; pornește doar cu `"chrome": {"title": "…", "unit": "Pasul"}` și `"hdr"` pe
fiecare scenă), scenele `race`, `scrubber`, `cardrow`, `beam`, `cells`. De construit: tastele, comutatorul, moneda,
eticheta ștampilată, cărțile stivuite, tasta finală.

**(ii) Filmul de brand** (instagram.com/reel/DfkzkKbRinb). Cum arată: 12-30 s fără voce, condus de muzică, cu un design
de sunet precis; lumini difuze ca o auroră; text care iese din blur; un panou de sticlă cu iconițe; un tunel 3D de
ecrane prin care zboară camera, cu o replică scurtă centrată în mijloc; ecrane care trec pe lângă cameră; un contor
într-o pastilă de sticlă, cu curbe luminoase; cuvinte care se adaugă pe rând („Pro” → „Pro Workflow” → „Pro Workflow
Unleashed”); logo-ul la final, apoi tăietură pe alb. O idee nouă la 0,5-1 s. La noi: lumina în turcoaz și rose gold;
panouri de sticlă cu paginile site-ului (capturi `site.cjs`, fără prețuri) și pozele clinicii (`brand_asset/g-tm-*`,
`g-ar-*`, `loc-*`); tunelul; contoare doar cu cifre reale de pe site (de ex. nota și numărul recenziilor Google, cum
sunt pe site în ziua randării); cuvinte care se construiesc („Corp.” → „Corp. Față.” → „Corp. Față. Epilare laser.”,
„Timișoara și Arad”, „Consultația e gratuită” doar dacă site-ul o spune); cazuri înainte/după doar din catalog, cu
„Publicat cu acordul clientei. Rezultatele diferă de la o persoană la alta.”; Nuki o singură dată; logo-ul la final
(singurul format în care logo-ul își are locul), apoi centrul360.com ca bară de căutare sau un card final curat.
Ocazional: cel mult unul pe săptămână, niciodată două la rând. De construit: un fel nou `"kind": "brand"` (scene cu
durate, fără replici de voce), un tunel 3D în CSS, mixul doar cu muzică și efecte (-14 LUFS), iar în `check2.cjs`
regulile lui (fără voce, 20-30 s, logo doar în ultimele secunde, nicio afirmație medicală în afara site-ului, nu două la
rând).

**(iii) Eroul aparatului** (instagram.com/reel/Dd35XZ0RyzY). Cum arată: un produs filmat macro, cinematic, pe întuneric,
cu lumină caldă de contur; rotiri lente; o vedere explodată (carcasa se desface în straturi); explozii de particule
aurii în jurul produsului; subtitrări mici, centrate; un card final cu sloganul și logo-ul (referința are și scurte
glume; la noi, umor doar după ce proprietarul spune da). La noi: doar pozele reale ale aparatelor clinicii, niciodată
aparate generate (`brand_asset/g-tm-laser.webp`, Elysion-pro; `g-tm-810.webp`, piesa de mână 810 nm;
`g-tm-aparate.webp`, laserul și aparatul HIFU; `g-tm-fiole.webp`, fiolele profesionale); tratament 2.5D: poza tăiată în
planuri de adâncime cu paralaxă, apropiere lentă, focus care trece de pe un plan pe altul, lumini care alunecă pe
suprafețe; explozii de particule cu bun gust, lumină turcoaz cu scântei rose gold; replici scurte doar cu fapte de pe site
(„Laser cu diodă 810 nm”, „Elysion-pro”, „Epilare laser · Timișoara”); tema turcoaz poate folosi #0b7f74 pentru
adâncime; cardul final cu logo-ul. Aceleași reguli ca filmul de brand.

**(iv) Scheciul cu personaj 3D**. Cum arată: o mini poveste amuzantă, în care publicul se regăsește, cu un personaj 3D
(Nuki sau o clientă stilizată, niciodată o persoană reală inventată ca „clientă”), câteva momente scurte, poanta, apoi
un card cu logo-ul. Fără afirmații medicale, umor cu bun gust. **În așteptare**: proprietarul n-a ales încă între
imagini Gemini animate 2.5D (ieftin, personaj constant) și video Veo (mai multă mișcare, cost mai mare); nu se începe
până nu alege.

**(v) Manifestul tipografic** (instagram.com/reel/De9F95tu1vT, trimis 14.11). Cum arată: 8-12 s, doar cuvinte, câte unul
pe ecran, mari, centrate, pe ritmul muzicii (un cuvânt pe bătaie sau pe jumătate de bătaie); fundalul alternează la
fiecare tăietură între deschis și închis; un singur cuvânt cheie are culoarea de accent și e mai mare („just code”);
un cuvânt se construiește literă cu literă ca la tastat („la” → „laun.” → „launch.”); la final logo-ul. Fără voce, fără
alte elemente. La noi: alternanța alb / turcoaz (#14a596), accentul rose gold pe un singur cuvânt, de ex. „Noi” ·
„nu promitem.” · „Îți arătăm.” (sloganul site-ului) · „Corp.” · „Față.” · „Epilare laser.” · „Te întorci
imediat la ziua ta.” (o propoziție întreagă, construită cuvânt cu cuvânt; niciodată o listă „fără ace, fără
operație”, exact formularea care nu-i place proprietarului) · „grijă” · „precizie” · „Timișoara” · „Arad”, apoi „centrul360.com” tastat și logo-ul. Cuvintele doar din
ce spune site-ul. Același tip `"kind": "brand"` ca (ii), cu un set de scene `word` (cuvânt pe bătaie, fundal alternant,
tastare) sincronizat pe bătăile piesei proprietarului (125 BPM: o bătaie la 0,48 s).

**(vi) Suspansul minimalist** (instagram.com/reel/DftJwhfJ4_3, trimis 14.11). Cum arată: aproape 30 s cu un singur
obiect hipnotic, o picătură de cerneală neagră lucioasă care se formează încet la vârful unei pipete, pe un fundal
alb-cald, cu o vignetă fină. Sus, în stânga, un cronometru mic numără secundele reale privite. În centru, un contor
mare, cu litere subțiri, urcă încet, cu tensiune. Sub el, câte o replică pe rând, calmă și conștientă de sine („Ai
privit o picătură care nu cade.”, apoi picătura devine un contur punctat: „Nici n-a fost reală.”, „Și încă aștepți.”),
apoi „Acum imaginează-ți că era produsul tău.”: aceeași picătură într-o machetă de telefon, ca o postare, cu replica
brandului; la final picătura cade într-o stropire, tăietură pe negru, cardul cu logo-ul („Ai privit toate cele 24 de
secunde.”) și domeniul. Aproape nimic nu se mișcă în afară de picătură, cifre și text. La noi: o picătură de ser care
se formează la vârful unei pipete de sticlă sau la gâtul uneia din fiolele reale ale clinicii (`brand_asset/g-tm-fiole.webp`),
pe fundal alb, transparentă sau turcoaz, cu o sclipire rose gold. Cronometrul numără secundele reale (cinstit);
orice alt contor e real sau clar simbolic, niciodată o măsurătoare inventată („tensiune superficială” cu procente
false nu merge pentru o clinică). Replicile, în română, calme și istețe, niciodată de vânzare, despre atenție și
răbdare (de ex. rezultatele care vin treptat, în 6-8 săptămâni). Un final blând spre site sau „360”, logo-ul doar la
sfârșit. Aceleași reguli ca filmele de brand (`"kind": "brand"`): ocazional, fără voce (sau o singură replică foarte
încet), piesa proprietarului.
Primul nostru (15.11): `scripts/v2-suspans-hifu`, scena `suspans` (`engine/v2/s-suspans.js`), 18,2 s pe „WE ON GO II”.
Ideea: „O ședință de HIFU. Apoi, liniște.” Un cadru alb, câteva rânduri scurte pe centru și un singur obiect: o
clepsidră uriașă, tăiată de cadru, din sticlă alb-negru cu nisip turcoaz. Primul și ultimul rând sunt mari (98 px),
intră cuvânt cu cuvânt din blur și nu stau pe loc: cadrul se apropie încet și o lumină de fereastră trece peste alb
(un rând mic și nemișcat pe alb nu oprește scroll-ul). Rândurile de deasupra clepsidrei au 58 px, ca să se citească pe
telefon; nimic sub ~33 px. Boabele cad câte unul și fiecare aterizează pe o bătaie, cu
tick-ul lui pe același cadru; contorul „Săptămâna 1” … „Săptămâna 8” urcă pe loviturile de bas, boabele vin tot mai des,
apoi șuvoi; când sus se termină nisipul, piesa tace, cade încet un singur bob rose gold, iar cadrul în care aterizează
e lovitura piesei: poza reală „înainte”, peste care trece o cortină de nisip și rămâne „după” (mișcarea doar a acestui
reel), apoi cele două alături, cu rândurile din catalog. Ultima propoziție e a site-ului („Colagenul are nevoie de
timp.”), iar punctul ei e bobul rose gold. Contorul se oprește unde spune catalogul la acel caz (6-8 săptămâni).
Tipul lui în script e `"kind": "silent"`: un reel fără voce care duce o idee cu text pe ecran și un caz real;
`check2.cjs` sare regulile de poveste ca la brand, nu cere logo la final și primește un sunet moale pe cadrul 0 în loc
de lovitură. Fișierul curat al unui asemenea reel iese sub -14 LUFS (aproape tot e liniște): e normal, nu se forțează.

**(vii) Lansarea** (instagram.com/reel/DeO1Rh7x5Qm, trimis 14.11; referința e în 16:9, la noi 9:16). Cum arată: un film
de lansare calm și premium, de la problemă la soluție, fără voce, cam 20 s: câmpuri de gradient difuze, ca o auroră,
care trec din deschis în închis și apoi în viu; cărți 3D stivuite (notițe de hârtie și o carte de sticlă cu grilă) care se
rotesc încet, lângă un text subțire, italic, pe două rânduri, al doilea în culoarea de accent („Too many notes. / Too
many ideas.”); un laptop pe birou, realist, cu o întrebare pe ecran și cuvinte uriașe, fantomă, în spate; cuvinte care
ies pe rând din blur („Finding what you need / shouldn't feel like a chore.”); un moment întunecat („meet” → numele);
interfața produsului, un panou de sticlă care trece din blur în clar; un ultim cuvânt care se rotește („Capture your
ideas / thoughts / creativity”); „Everything connected”, cu al doilea cuvânt mai sus; „All With” care se transformă în
logo. La noi: același arc în 9:16 și în paleta noastră, din alb în turcoaz, turcoazul adânc #0b7f74 pentru momentul
întunecat, rose gold doar pe un singur accent. Cărțile stivuite sunt lucruri reale: o poză din clinică, o carte
înainte/după din catalog cu linia despre acordul clientei, o carte în stilul ofertelor de pe site. Problema, calmă și
adevărată („Prea multe diete. / Prea multe promisiuni.”); echivalentul lui „chore” („Să afli ce ți se potrivește / n-ar
trebui să fie complicat.”); momentul întunecat „Cunoaște” → „Centrul360.” (sau numele unui tratament); dezvăluirea din
blur în clar pe o pagină reală a site-ului (`site.cjs`); cuvântul care se rotește („Grijă pentru corp / față / piele”);
finalul „Totul” → „într-un singur loc.”, care se transformă în logo. Fără întrebări în text (regula din 14.11), doar
afirmații adevărate de pe site. Aceeași familie ocazională `"kind": "brand"`; se combină bine cu (ii) și (v).

**(viii) Explicația în blocuri** (instagram.com/reel/De1_SdZt527, trimis 14.11). Cum arată: blocuri 3D de sticlă care se
așază unul câte unul într-o structură, fiecare cu culoarea lui și un număr mic (01-08); la final toată stiva revine ca
recapitulare. Sus, o bară de progres pe segmente, câte unul pe capitol, în culoarea capitolului, care se umple pe
măsură ce reel-ul avansează (un instrument puternic de retenție, care poate deveni opțional un element standard al
oricărui reel educațional). Pe fiecare capitol: un titlu mare și un singur obiect simplu (graficul de retenție care
urcă la „10.0 s”, cubul „VALUE” pe inele, un „?” într-un inel de încărcare cu bucla deschisă tastată într-o carte).
Subtitrarea jos, cuvânt cu cuvânt, cu cuvântul curent subliniat. La final, „Saved”, cu cursorul care apasă. La noi: în
paleta noastră (alb sau turcoaz, accent rose gold), niciodată neonul lor întunecat; de ex. cei 4 pași ai programului,
straturile pielii (epidermă, derm, grăsime, SMAS), „cum decurge o consultație”; fără „?” pe ecran (bucla e o
afirmație), finalul cu semnul nostru de salvare (`bookmark`), nu butonul lor cu cursor. Se combină cu (iv) și (vi).

**(ix) Conversația** (instagram.com/reel/Dd7LoTKSsbT, trimis 14.11; referința e în 16:9, la noi 9:16). Cum arată: o
poveste pe chat e cârligul. Un chat întunecat, ca pe WhatsApp, se construiește mesaj cu mesaj („Hello!”, „your video
is ready..”, un link, „What do you think?”); camera se retrage și stă pe punctele de tastare, cu tensiune; clientul
răspunde „its good butt...” (o falsă plângere), apoi „BRO WHY YOU COOK SO HARD 🔥🔥”. Urmează un montaj rapid al
muncii (un slide tipografic, o interfață de chat AI, cărți, un grafic care crește, un inel la 89 %, cod, o siluetă) și
finalul pe brand. Fără voce: muzică, sunetele mesajelor și tastarea. La noi: chatul real de WhatsApp al clinicii, în
stilul nostru deschis (alb sau turcoaz, nu întunecat), **doar cu mesaje reale ale clientelor, folosite cu acordul lor
scris; fără nume, fără telefon, poza de profil estompată sau înlocuită cu inițiale; niciodată un mesaj inventat (regulă
fermă)**. Falsa plângere („Sunt bune, dar…” → un răspuns entuziast real) merge doar dacă mesajul real chiar spune asta.
Montajul: cazuri reale înainte/după din catalog, fiecare cu linia despre acord, plus imagini scurte din clinică și de pe
site. Finalul: logo-ul sau bara de căutare cu site-ul. Varianta fără mesaje de la cliente: chatul dintre privitor și
Nuki, în care Nuki explică un lucru în 2-3 bule scurte (vorbește brandul, nu e o recenzie; textul doar de pe site).
Sursa: proprietarul trimite mesajele reale ca capturi, cu acord; motorul primește o listă `{who, text, time}` și nu
generează niciodată mesaje. Se combină cu (iv) și (vi).

**(x) Colajul editorial** (instagram.com/reel/DfCs7OyCasp, trimis 14.11; referința arată trei mini-reels alăturate
doar ca portofoliu, la noi e un singur cadru 9:16). Cum arată: un colaj editorial pe hârtie crem (textură fină, pe
alocuri o grilă de puncte halftone), o singură culoare de accent și mult spațiu gol. Câte o fotografie decupată,
simbolică, pe fiecare idee: o clepsidră cu nisip colorat (timpul), un creier roz (mintea), un bust grecesc cu o bandă
peste ochi, un fluture legat cu o sfoară de o piatră (greutatea față de ușurință), două piese de puzzle, siluete mici
de oameni văzute de sus, două figuri sub o coloană înaltă. Tipografie mixtă: majuscule serif mari, spațiate („WAITS”,
„SIDE BY SIDE” pe o bandă de accent), un italic serif mic („what if?”), un rând ca de mașină de scris cu un cuvânt într-o
pastilă de accent („Some [SPEND] it”), un bloc mic de text justificat jos, ca textură, și un cuvânt care se schimbă pe
loc („WAITS” → „RETURNS”). Mișcare: apropieri lente și derive pe obiecte, sfoara care se desenează, nisipul care
curge, cuvinte care se schimbă sau se tastează; scenele se schimbă eșalonat, nu toate pe aceeași bătaie; whoosh-uri și
pulsuri moi pe schimbări. La noi, în paleta noastră (hârtie albă cu textură discretă, turcoazul ca culoare principală,
rose gold ca singurul accent; niciodată portocaliul sau maroul lor): câte o metaforă pe propoziție, fiecare cu un obiect
decupat: o clepsidră cu nisip turcoaz pentru „rezultatul se vede după 6-8 săptămâni”; o pană legată cu o sfoară rose
gold de o piatră pentru „grăsimea care nu pleacă nici cu dietă și sport”; două piese de puzzle, albă și turcoaz, pentru
„gușa = grăsime + piele lăsată”; un bust clasic cu o bandă rose gold pe linia maxilarului pentru „conturul bărbiei”;
siluete mici pentru „multe femei”. Tipografia: un serif de afișaj cu diacritice românești, plus fontul site-ului pentru
textul mic; rândul de mașină de scris cu pastila de accent, ex. „Unele [ÎNCEARCĂ] totul”. Obiectele se generează o dată
cu `imagen.py`, în același stil (fotografie decupată, umbră moale, fundalul neutru scos), și stau într-o bibliotecă mică
(câțiva cenți pe obiect; prima serie doar după OK-ul proprietarului). Reguli: doar afirmații reale în text; niciun bust
sau chip care seamănă cu o persoană reală; obiectele nu sunt niciodată „dovadă” de înainte/după (rezultatele reale
rămân poze reale). Se combină cu (iv), cu structura în 8 blocuri și cu (viii) (bara de progres); vocea poate rămâne sau
poate lipsi (doar muzică și text).

**(x-b) Colaj pe birou** (instagram.com/reel/DekGW1-tCoi, trimis 14.11), o variantă luminoasă a lui (x). Cum arată: un
birou de hârtie gri-deschis, cu linii fine de schiță tehnică și semne de coordonate; obiecte fotografiate de sus, cu
umbre reale (ochelari rotunzi peste cuvinte, o coloană grecească, o foaie de carnețel ruptă, prinsă cu un ac, cu un pix
alături, un zid de cărămidă cu o lupă, o cheie veche, o broșură într-un cerc punctat). Tipografie: majuscule condensate,
groase, colorate, amestecate cu un sans subțire și un italic serif; un bloc ca o definiție de dicționar, ca textură.
Tranziții: împingeri cu blur rapid între obiecte, cu un puls sonor pe fiecare obiect nou. La noi: hârtie albă sau
gri-deschis, turcoazul ca culoare principală; markerul roșu devine rose gold sau turcoaz închis, niciodată roșu (roșul
sună a alarmă într-o clinică). Obiectele vin din `imagen.py`, din aceeași bibliotecă cu (x), doar obiecte generice (o
lupă, un carnețel, o clepsidră, o cheie, o riglă sau un metru de croitorie, o oglindă), fără chipuri. Cele trei
dispozitive refolosibile (obiectul care lucrează pe text, blocul-definiție, CTA-ul cu cuvânt în comentarii) sunt și în
„Montajul”, mai jos.

**(xi) Faceless curat** (instagram.com/reel/Da0DayIpsie, trimis 14.11, „super clean”; 26 s, cu voce). Foarte aproape de
stilul nostru educațional: fundal alb, o singură culoare de accent, text cinetic pe voce. Ce face bine: (1) fiecare
cuvânt-cheie intră exact când e spus, centrat: un cuvânt mare vine uriaș și în blur, apoi se retrage la mărimea lui
(„Attention” → „Attention is expensive”, cuvântul de accent colorat, cu o lumină moale de accent în spate); cuvintele
accentuate trec în **italic serif** în culoarea de accent, restul rămâne sans; (2) obiecte uriașe, tăiate de cadru,
pentru scară (un cadran de ceas din care se vede doar un arc și acele, care se rotește pe „every second”); (3) colțuri
de vizor care încadrează un subiect (un rând de iconițe de oameni, una evidențiată, pe „your audience”); (4) un inel de
numărătoare cu o cifră care urcă 5 → 10 → 15; (5) noduri cu iconițe și linii de legătură care apar pe rând, fiecare cu
o etichetă mică (ca o mică hartă a ideilor); (6) pastile care se adună pentru o listă: fiecare beneficiu spus adaugă o
pastilă (plină și conturată, alternativ), într-un șir care curge; vocea spune propoziții întregi, ecranul strânge
cuvintele-cheie (exact cum arătăm o listă fără ca vocea să recite „fără X, fără Y”); (7) fundal alb cu inele de accent
foarte moi, în blur, care plutesc în colțuri; mult spațiu alb; o singură idee pe ecran. La noi: turcoaz în loc de
verde, rose gold pe cel mult un element; pastile doar cu fraze adevărate și de pe site; iconițele de oameni sunt
generice, niciodată o persoană reală. Rafinările intră și în stilul nostru educațional implicit (mai jos, „Montajul”).

**(xii) Logo-ancoră** (instagram.com/reel/DfuNd8fNcAs, trimis 14.11: „și așa ceva putem face cu logoul nostru pt
branding”). Cum arată: logo-ul stă fix, exact în același loc (centru, treimea de sus) tot clipul, iar lumea din spatele
lui se schimbă pe fiecare bătaie, cam 4 tăieturi pe secundă (pe o carte de sticlă ținută în mână, pe o lumină difuză, pe
o carte de hârtie în lumina ferestrei, între cuvinte uriașe, pe o firmă, pe o fișă tehnică, pe o geacă, pe o piatră
plutitoare, ca iconiță de aplicație, pe hârtie, pe un ecran, pe o cască, pe o grilă elvețiană), totul într-o singură
paletă, fiecare tăietură pe bătaie; identitatea pare să trăiască peste tot, fără niciun cuvânt. La noi (`"kind":
"brand"`, fără voce; singurul loc unde logo-ul e chiar subiectul; merge și ca intro sau outro): logo-ul real (semnul și
CENTRUL360.COM, din `brand_asset`), fix ca loc și mărime; în spate, mai ales lucruri reale: pozele clinicii (recepția,
sălile, aparatele, fiolele, raftul, monstera), în alb-negru adevărat (proprietarul, 15.11: „alb negru cu accente
turcoaz, logoul negru pe alb”), cu o apropiere lentă, și site-ul pe un telefon (`site.cjs`); plus suprafețe desenate din cod: o carte de sticlă, hârtie în lumina ferestrei cu umbre, un cuvânt
uriaș în spate („CORP”, „FAȚĂ”, „PIELE”), o fișă tehnică și o grilă elvețiană doar cu date reale (Timișoara · Arad,
centrul360.com, anul, serviciile de pe site). Fără merchandise inventat (cască, geacă, sacoșă pe care nu le avem).
Ritmul: tăieturi de la o bătaie (~0,46 s), apoi la jumătate de bătaie (~0,23 s), apoi finalul ținut ~2 s pe logo, pe
alb curat. Varianta aprobată ca direcție (15.11): logo-ul negru stă pe o bandă albă fixă, cu o etichetă turcoaz în
stânga (orașul pozei) și un contor de cadre în dreapta; fiecare schimbare e o expunere: o cortină coboară în trei-patru
cadre și se aude declanșatorul (`shutter`, pe cadrul schimbării, la fiecare slide); cuvintele uriașe sunt turcoaz,
condensate; la final banda albă se deschide peste tot cadrul cu un swoosh (`swoosh_end`, vârful pe cadru) și o linie
turcoaz se trage sub logo. Fără strobe: slide-urile luminoase și pozele sunt grupate, pozele sunt aduse la aceeași
luminozitate și schimbarea alb ↔ poză ține patru cadre (verificarea de flash: cel mult 3 salturi mari pe secundă).
Motorul: scena `logoanchor` (`engine/v2/brand.js`, felurile `photo`, `word`, `paper`, `glass`, `grid`); exemplul:
`scripts/v2-brand-logo-01`.

**Combinații** (principiul proprietarului din 14.11: „poți să le și combini una cu alta, creativitatea e limita, iar în
cazul nostru nu cred că avem limite”). Cele douăsprezece formate sunt piese de construcție, nu șabloane. Un reel le poate
amesteca: un reel data-viz cu „chrome” al cărui răspuns e un moment de erou al aparatului; un manifest tipografic care
se termină cu picătura suspansului minimalist; un reel educațional care începe cu picătura și apoi explică; un film de
brand cu obiectele 3D tactile. Garda de varietate tratează o combinație nouă ca o semnătură nouă. Regulile fixe rămân:
culorile brandului, totul centrat, super clean, doar fapte reale, niciun logo permanent în afara filmelor de brand,
muzica la nivel constant, cele două fișiere.

## Gândește înainte (regula proprietarului din 14.11)
Referințele sunt o bibliotecă din care învățăm, nu o listă de bifat: la fiecare reel alegem doar ce i se potrivește.
„Vreau să te gândești foarte bine înainte să compui un reel, să iasă foarte foarte bine… poate fi insane să fie ceva
natural.” Înainte de text, voce sau vizual, scriptul primește un bloc `"concept"` (pentru cine, singurul lucru înțeles
la final, tonul, unul sau cel mult două formate, 2-3 elemente împrumutate cu motivul lor, cel puțin 3 elemente lăsate
deliberat deoparte, piesa și de ce, ce îl face diferit de ultimele 10). Fiecare element își câștigă locul; mai puțin,
făcut perfect, bate mai mult; întâi firescul. După storyboard și după randare, o autocritică cinstită în `"critique"`
(oprește derularea în 2 s? servește totul mesajul? e ceva efect de dragul efectului? e firesc? l-ar pune proprietarul
azi?), refăcută până la răspunsurile bune. Pașii exacți: `PRODUCER.md`, pasul 0; `check2.cjs` avertizează la lipsuri.

## Muzica proprietarului (doar pentru previzualizări)
Piesele alese de proprietar stau doar local, în `engine/music/` (ignorat de git; nu se comit niciodată). Se folosesc
numai în previzualizări: proprietarul postează din aplicații fișierul `-clean`, cu sunetul licențiat pus acolo. În script:
`"musicFile"` (numele fără `.wav`), `"musicStart"` (secunda din piesă) și `"beat": {"bpm"}` (tăieturile pe bătăi).

| fișier | starea | pentru ce formate | de unde pornește |
|---|---|---|---|
| `owner-free.wav` („Free”, Ultra Naté) | house anii '90, cald, cu energie constantă | reels-urile educative (data-viz, explicația în blocuri), cazurile | de la început: primul downbeat, 0,395 s; 125,01 BPM |
| `owner-weongo.wav` („WE ON GO II”, feat. Denzel Curry, 3:16) | „unexpected edits”, pielea de găină | (vi) suspansul minimalist, (xii) logo-ancora, scheciul 3D, o dezvăluire dramatică, un înainte/după puternic | partea cu „honorable” (alegerea proprietarului): 0,1-11,8 s (măsurată la `v2-brand-logo-01`; „Honorable, honorable” la 0-1,5 s, apoi ad-lib-uri, „Here we go” de la ~12 s); primul downbeat 0,114 s, 131,01 BPM; basul cade rar, la bătăile 3, 5, 8, 9,5, 10,5, 13, 14,5, 16 și apoi la fel la fiecare 16 bătăi (19, 21, 24 …), toate la aproape același nivel; cel mai lung gol e înaintea bătăilor 8, 24 și 40 (lovitura de la 11,094 s e dezvăluirea din `v2-suspans-hifu`); după ~24 s versurile devin explicite: nu se folosesc |
| `owner-trainingseason.wav` („Training Season”, live, Royal Albert Hall, 3:41) | „loved by our audience”, spontan, ușor | reels-urile spontane, edit-uri ușoare: Nuki, din culise, un sfat rapid | la lovitura muzicii, 10,17 s (primele ~10 s sunt intro live care se stinge, -19 → -35 dB); 123,01 BPM; din intro doar dacă reel-ul vrea atmosfera de concert |
| `owner-toomuch.wav` („Too Much For Me”, SELKER, extended, 4:34; adăugată 15.11) | house, catchy, energic | montaje pe ritm, „unexpected edit” (un început calm pe breakdown, apoi BUM pe drop), cazuri și rezultate pe bas, reels-uri spontane cu energie | 128,0 BPM (măsurat din nou pe 15.11; nu 129,2); intro cu bas 0-15 s; **breakdown calm 15-44 s** (fără bas), apoi **drop la ~44-45 s** (de măsurat la cadru cu `beats.py` / onset); alt breakdown scurt ~104-112 s cu drop la ~112,7 s și ~180-187 s cu drop la ~187,7 s |

Alegerea: piesa după starea reel-ului, și niciodată aceeași piesă la două reels la rând (`check2.cjs` avertizează când
reel-ul precedent folosește aceeași piesă). Nivelul rămâne cel constant de mai jos, în „Muzica și postarea”.

## Vocea (cum vorbim; regula proprietarului, 12.11)
Vocea e a unei femei din România, de vreo 30 de ani, deșteaptă și caldă, care îi povestește ceva interesant unei
prietene, față în față. Carisma vine din claritate, ritm, un dram de umor și surpriză, nu din cuvinte mari.
- **Un video educațional calitativ, nu o reclamă ieftină** (regula proprietarului din 14.11, după a treia
  previzualizare: „nu mai pune întrebări doar așa la care și răspunzi după, și nu spune doar «fără recuperare, fără
  ace», vorbește în propoziții”). De acum:
  1. **Fără întrebări retorice** la care vocea răspunde singură („Și atunci, ce faci?”, „Și dacă te regăsești?”) și
     fără cârlige-întrebare. Cârligul e o afirmație precisă și surprinzătoare, care te face să vrei să înțelegi („La
     multe femei slabe, gușa nu ține de kilograme.”); la un caz, o propoziție clară despre ce s-a întâmplat în cazul
     acela. `check2.cjs` refuză orice „?” într-o replică spusă.
  2. **Fără liste de fragmente ca în reclame** („fără bisturiu, fără recuperare”, „fără ace, fără operație”). Vorbim
     în propoziții întregi, firești, care explică: „Ultrasunetele lucrează doar în stratul de grăsime, așa că pielea de
     deasupra rămâne neatinsă și te întorci imediat la ce aveai de făcut.” `check2.cjs` refuză două sau mai multe
     „fără …” într-o replică și propozițiile scurte fără verb.
  3. **Învățăm un singur lucru, bine**: ce se întâmplă de fapt sub bărbie (depozitul de grăsime, pielea care își
     pierde fermitatea, genetica, postura) sau cum distrug ultrasunetele focalizate celulele de grăsime și cum le
     elimină corpul în săptămânile următoare. Cuvintele precise, dar simple, pe care un medic bun le-ar folosi cu o
     prietenă; un detaliu concret pe care lumea nu-l știe; calm și sigur pe ce spune. Fără cuvinte de hype, fără
     „incredibil”, fără semne de exclamare (refuzate în `check2.cjs`).
  4. **Clinica apare doar ca ultim pas firesc** (site-ul sau „360” în comentarii), o singură dată, încet.
  5. **Doar fapte din surse**: `topics.json`, paginile site-ului (`v2/src/`) și catalogul. Când o replică are nevoie de
     un fapt pe care nu-l avem (de ex. cât durează eliminarea celulelor), folosim doar ce spune site-ul (6-8
     săptămâni); dacă nici site-ul nu-l are, îl scriem ca întrebare pentru proprietar, nu-l inventăm.
  6. **Textul spus se aprobă înainte de voce și randare**: se trimite replică cu replică, apoi se înregistrează.
- **Structura** (14.11, referința proprietarului pentru short-form, instagram.com/reel/De1_SdZt527; standardul pentru
  toate reels-urile de acum): Hook → Lead → Body 1 → Open loop → Body 2 → Open loop → Body 3 → CTA.
  - **Hook**: rupe tiparul derulării în primele 3 s (o afirmație precisă, nu o întrebare).
  - **Lead**: îi ține până la secunda 10, cu promisiunea a ce vor afla („Îți arăt ce se află de fapt sub bărbie…”).
  - **Body**: câte o singură valoare reală pe bloc.
  - **Open loop**: o singură replică ce creează curiozitate și pe care o închide doar blocul următor. La noi e o
    **afirmație, niciodată o întrebare** („Dar grăsimea e doar jumătate din explicație.”, „Partea cea mai importantă
    vine însă după ședință.”); niciodată „Știai că…?” sau „Dar stai, că nu e tot!”, nimic care sună a reclamă ieftină.
    Pe ecran are un vizual care ține tensiunea o secundă, fără „?” (`halfline`, `depth`, `tease`, `curtain`).
  - **CTA**: îi duce pe cei mai interesați la pasul următor (salvare, comentariu „360” sau site), o dată, calm.
  - La 30-50 s structura se poate strânge: Hook → Lead → Body → Open loop → Body → CTA. `check2.cjs` lasă un reel pe
    schelet până la 50 s cu o buclă și până la 55 s cu două (fără roluri, tot 30-45 s); mai scurt e mai bine.
  - **Un schelet pe care nu-l vede nimeni** (condiția proprietarului: „dacă mă uit la 10 reels de-ale noastre, să nu-mi
    dau seama că sunt repetitive; urmează structura, dar natural și frumos”). De la un reel la altul variază: lead-ul
    (o promisiune, un fapt surprinzător sau niciun lead separat, cârligul continuă singur), buclele (0, 1 sau 2, în
    locuri diferite), unde cade răspunsul, tipul de CTA (salvare, trimite unei prietene, comentariu, site sau niciunul,
    cu final în buclă) și forma propozițiilor. Fără fraze de șablon: „partea cea mai importantă”, „dar asta nu e tot”,
    „uite ce”, „îți arăt / îți explic” ca formulă, „și acum vine partea interesantă”, „rămâi până la final”; nicio replică
    ce deschide cu „Dar” / „Iar” în două bucle din același reel. O buclă sună ca următoarea propoziție firească dintr-o
    explicație, nu ca un cârlig de retenție. Și vizualurile buclelor diferă: nu există un „vizual de buclă” care revine.
    `check2.cjs` refuză frazele de șablon și cele două bucle cu „Dar” / „Iar”; `node variety.cjs <id>` compară scriptul
    cu ultimele 10 și avertizează când se repetă primele 3 cuvinte ale lead-ului, ale unei bucle sau ale CTA-ului, același
    tip de CTA în 3 din ultimele 5, același număr de bucle în 4 din 5, răspunsul în aceeași zecime din reel în 4 din 5
    sau același vizual de deschidere.
  - În script, fiecare replică poate avea `"role"`: `hook`, `lead`, `body`, `loop`, `cta`; `check2.cjs` avertizează
    (fără să oprească) când lipsește un `loop`, când `lead` se termină după 10 s sau când ultima replică nu e `cta`.
- **Ritmul** (din 14.11, în modul vechi, replică cu replică; cu înregistrarea continuă, mai sus, ritmul se cere în text și
  se grăbește uniform doar sub ~190 de cuvinte pe minut, cel mult x1,08). În modul vechi (14.11, „vocea e cam încetă … cele din reelurile astea cam toate is mai rapide”),
  fiecare replică e grăbită după cache cu `atempo` (aceeași înălțime), implicit x1,18 (`"tempo"` în `engine/voice.json`, sau în script);
  pauzele dintre replici sunt scurte (`"gaps"` în script: `line` 0,05 s, `payoff` 0,3, `resolve` 0,1, `outro` 0,1).
  O replică își poate pune propria limită (`"tempo": 1.05` pe replică): numele site-ului rămâne la x1,05, pentru că
  peste x1,1 „centrul” își pierde „l”-ul și se aude „centru”. Când vocii i se scrie un cuvânt fonetic („es-em-a-es”
  pentru SMAS), harta `PHONETIC` din `voice.py` spune cum se scrie el pe ecran, ca înregistrarea să fie acceptată, nu
  refăcută la fiecare rulare.
  Ritmul nostru măsurat: 176 de cuvinte pe minut cât vorbește, înainte; ~208 după. Referința în română a
  proprietarului: ~200 pe tot clipul; reel-ul cu date (engleză): ~265. Mai repede de x1,2 nu, ca femeile de 40+ să
  înțeleagă fiecare cuvânt (se verifică cu `python3 listen.py <id>`).
- **Scrie cum vorbește o femeie din România cu o prietenă, nu cum traduci** (regula proprietarului din 14.11, după
  „La multe femei…”, care nu sună românește). Citești fiecare replică cu voce tare. Fără calcuri („La multe femei, X
  apare”) și fără cuvinte de carte („rareori”, „focalizează”, „deci” în mijlocul propoziției, „stă”). Verbe simple:
  e, are, pleacă, se vede. Legături din vorbire: așa că, doar că, iar, de obicei. La pasul de scris, o ultimă trecere:
  „ar spune-o exact așa o femeie din Timișoara?”; fiecare replică ce nu trece se rescrie. La fel etichetele de pe ecran.
- **O singură înregistrare, citită ca o explicație legată** (regula proprietarului din 14.11: „intonația și tot trebuie
  să aibă sens împreună cu propozițiile”). Înainte, fiecare replică era o înregistrare separată, cu stilul ei și cu alt
  tempo, lipită de celelalte la 0,05 s: fiecare propoziție se termina ca una singură, viteza sărea, respirația dintre idei
  dispărea. Acum (`"mode": "continuous"` în `engine/voice.json`, implicit): tot scriptul e citit o dată, într-un singur
  stil (cel de bază plus „explici ceva unei prietene, legat, cu intonație firească de la o propoziție la alta, ritm
  viu”), cu ritmul cerut în text (~190 de cuvinte pe minut); înregistrarea trebuie să spună textul exact (cu doi
  ascultători), apoi e tăiată în replici la pauzele dintre propoziții, aliniată la text și verificată replică cu replică;
  dacă tăietura nu se potrivește, se oprește cu un mesaj (fără întoarcere tăcută la replici separate). Un singur tempo
  pentru toată înregistrarea, doar dacă e sub ~190 de cuvinte pe minut, cel mult x1,08. Pauzele firești rămân (în
  replici; motorul nu mai adaugă pauze); doar cele de peste 0,45 s scad la ~0,3 s. `"voiceNote"` în script adaugă o
  indicație de pronunție (ex. numele site-ului rar și clar). `python3 voice.py <id> --retake` face o înregistrare nouă;
  `python3 listen.py <id> --judge` cere și părerea ascultătorului: sună ca o narațiune continuă și firească, are
  îmbinări tăiate, intonație ciudată sau o propoziție fără sens?
- **Abrevierile și numele se citesc românește, niciodată englezește** (regula proprietarului din 14.11, după „hai-fu”
  și „es em ei es”). Cele care se pot citi ca un cuvânt se citesc ca un cuvânt românesc: HIFU = „hifu”, cu „i” ca în
  „film”; SMAS = „smas”; LED = „led”. Celelalte, literă cu literă, cu numele românești ale literelor („a”, nu „ei”;
  „i”, nu „ai”): RF = „er-ef”, EMS = „e-em-es”, PDRN = „pe-de-er-en”, SPF = „es-pe-ef”. Numele de tratamente și branduri
  tot românește: Liposonix = „liposonix”. Harta e în `engine/voice.json` (`"pronounce"`: scrierea de pe ecran → cum i se
  scrie vocii) și se aplică textului trimis la voce; stilul înregistrării cere același lucru; după fiecare înregistrare,
  ascultătorul e întrebat cum a sunat fiecare termen (`"pronounce_check"`) și se reface (cel mult 3 încercări, cu
  scrierile din `"pronounce_variants"`, ex. „hifu”, „hí-fu”, „hi fu”) până sună românește. Pe ecran și în verificarea
  cuvânt cu cuvânt rămâne scrierea obișnuită (HIFU, SMAS). Răspunsul ascultătorului la „hi-fu sau hai-fu?” se schimbă
  cu muzica și cu felul întrebării, așa că vocala se și măsoară: `python3 vowel.py <fișierul replicii> [start] [durată]`
  urmărește formanții: „i” românesc stă închis (F1 ~250-350 Hz, F2 peste ~2500), „ai” englezesc pornește deschis
  (F1 ~700-1000 Hz) și urcă.
- **Citești tot scriptul cu voce tare, ca o singură explicație**: fiecare propoziție trebuie să decurgă din cea de
  dinainte; dacă o replică pare un salt, o rescrii sau schimbi ordinea.
- **Firesc, ca vorbit**: mici legături („Cu anii”, „De aceea”, „Un lucru bun de știut”), pauze firești. Niciodată
  slogan, niciodată listă citită cu voce tare.
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
  "hook":   { "say": "O afirmație precisă, care te face să vrei să înțelegi.", "visual": { "type": "counter", "…": "…" } },
  "beats":  [ { "say": "…", "visual": { "type": "skin", "…": "…" } },
              { "say": "…", "step": "ce se schimbă în aceeași scenă" } ],
  "payoff": [ { "say": "…", "visual": { "type": "dissolve", "…": "…" } } ],
  "resolve": [ { "say": "un lucru practic, real, spus în propoziție", "visual": { "…": "…" } }, { "say": "încă unul", "visual": { "…": "…" } } ],
  "outro":  { "say": "o încheiere caldă", "cta": "soft | talk | loop", "visual": { "type": "qmark", "to": "heart", "q": false } },
  "end":    { "type": "loop | comment | site | ask", "say": "…", "cta": "…", "…": "…" } }
```
- **Fiecare replică** (`say`; `tts` dacă se citește altfel, `cap` dacă subtitrarea e altfel; `*cuvânt*` = accent,
  animat în subtitrare și în textul cinetic) are fie `visual` (o scenă nouă), fie `step` (o schimbare a scenei
  curente: un pas din `seq`, o piesă, un cip). `pause`/`pre`: secunde în plus după/înainte.
- **hook**: 0-3 s, o afirmație (din 14.11 fără „?”; `q` nu mai e cerut). Primul cadru e deja în mișcare (scena cârligului începe
  cu 0,3 s înainte), lovitură sonoră pe cadrul 0.
- **beats**: o mini-dezvăluire la 3-5 s, o schimbare vizuală cel mult la 2,5 s.
- **payoff**: răspunsul. Înainte, o pauză firească (0,5 s) și un riser; pe dezvăluire (`revealAt` al pozei,
  `snapAt` al puzzle-ului, `breakAt` al geamului) impact + sub drop + strălucire.
- **resolve**: 2-3 replici după răspuns, lucruri practice spuse în propoziții (fără întrebarea retorică), fiecare cu
  ecranul ei.
- **outro**: încheierea caldă, cu `cta` și un vizual care încheie (`strokeq` cu `"glyph": "heart"` sau `"check"`).
- O replică poate avea `nuki`: `{pose, at: peek-l | peek-b | bl | br | tl | tr, react: nod | bounce | point | wow, flip}`.
- **end**: `save` (CTA-ul e chiar ultima replică, „salvează clipul”, cu `bookmark`; reel-ul se oprește pe semnul umplut),
  `loop` (ultimul cadru curge în primul; fără voce), `comment` (cuvântul 360 tastat în bara de comentariu,
  trimis, apare comentariul), `site` (`pages`: secțiuni reale, capturate cu `node site.cjs <id>`), `ask` (`q`,
  `options`). Când se alege fiecare: `PRODUCER.md`.
- **theme**: `brand-light` sau `brand-teal` (din 14.11, doar acestea două); fiecare din `engine/themes.json` are:
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
`stamp` (un cuvânt ștampilat; niciodată „mit”), `beam` (`mech.js`: stiva 3D de straturi de sticlă, piele, grăsime,
mușchi, care se înclină; energia focalizată coboară într-un punct, cu marcajul de adâncime; `chips`), `cells` (`mech.js`:
câmpul 3D de celule de grăsime, conul de ultrasunete care se îngustează într-un punct, marcajul stratului; celulele din
focar se topesc încet), `strokeq` / `gridq` (`hooks.js`: „?”-ul; `"glyph": "heart" | "check"` desenează direct
răspunsul), buclele deschise (`loops.js`: `halfline`, o linie care se oprește la jumătate; `depth`, o linie care coboară
prin straturi și se oprește adânc; `tease`, cuvântul următor ținut în blur; `curtain`, două panouri de sticlă care se
depărtează puțin), `bookmark` (`loops.js`: CTA-ul „salvează”, semnul de carte care se umple pe cuvânt, cu finalul
`save`), `race` cu `"qual": true` (doar componentele, fără valori, axe sau ranguri), `dissolve` (o credință pe un card de sticlă se destramă în particule care
se întind pe o siluetă abstractă), `photo` (poza reală din catalog: `glimpse` (întâi „după”, din blur în clar, apoi
întreaga poză), `tease`, `reveal` cu mască `diagonal`/`circle`/`wipe`, `slider` (din 14.11, pentru răspuns: cele două jumătăți reale ale
pozei în același cadru, „înainte” întâi, apoi o linie fină trece peste cadru și descoperă „după”, pe cuvinte, `from`/`to`;
fără „?” și fără acoperământ),
`chips`), `nuki` (ipostaze pe replici, squash/stretch, balon), `panel` (ilustrație AI cu ken burns / mască / parallax).
Orice scenă poate avea `bg` (un decor AI în spate, `{name, prompt}`), `tr` (tranziția de intrare), `cam`
(`push`, `pull`, `drift`, `rise`, `dolly`, `parallax`, `none`), iar o replică poate avea `nuki` (Nuki mic într-un colț).
Tranziții (`look.js`): `push`, `push-up`, `fly-through`, `zoom-element`, `pan`, `morph-key`, `whip`, `zoom-through`,
`mask-wipe`, `shape-morph`, `glitch-lite`, `slide-stack`, `iris`, `page-flip`, `blur-push`, `match-cut` (pe culoare),
`spin-zoom` (`cut` doar în cazuri speciale: între idei, check-ul cere o tranziție reală).

### Montajul (meșteșugul, din 14.11; referința proprietarului: instagram.com/reel/DaIq2aZTlln, „foarte clean, cu gust, cu sincronizare imagine-sunet”)
Pentru toate reels-urile noi (`"sound": "v3"`, implicit; `v2-gusa-slabe` și `v2-caz-real` rămân pe `"sound": "v2"`, cum
le-a aprobat proprietarul):
- **Fiecare eveniment vizual are sunetul lui, aliniat la cadru**: un text care apare primește tic-uri moi (`tick_soft`,
  câte unul pe cuvânt), un panou sau o carte care aterizează primește un „tap” (`tap`), o tăietură primește un whoosh
  al cărui vârf cade exact pe tăietură (`whoosh_cut`, așezat de `mix.py` după vârful lui), un obiect-erou are un singur
  sunet-semnătură (punctul-ghid: `dot`). Biblioteca e setul premium din `engine/sfx/v3` (`python3 sfx.py --v3`, vezi mai
  jos); fără efecte de desen animat. Stă sub voce: vocea rămâne perfect clară, muzica la nivelul hotărât de proprietar, fără
  ducking. `mix.py` raportează sincronizarea: câte tăieturi au un whoosh cu vârful pe ele (±1 cadru) și câte intrări
  importante au sunetul lor (±1 cadru).
- **Un motiv-ghid** (`"motif": "dot"`): un punct mic de lumină rose gold duce privirea dintr-o scenă în alta; la fiecare
  tăietură trece de la elementul principal vechi la cel nou și se topește în el (o tăietură prin punctul comun).
- **Reținere**: o singură culoare-erou plus alb sau turcoaz, text mic, mult spațiu gol, o idee pe bătaie.
- **Ritm**: intrările eșalonate stau pe grila muzicii (`R.grid(t)`, un sfert de bătaie din `beats.py`), nu la întâmplare.
- **Fluiditate**: 30 de cadre pe secundă (Instagram primește și 60, dar la aceeași mărime de fișier fiecare cadru pierde
  din calitate și randarea durează dublu; rămânem la 30), blur de mișcare pe mișcările rapide, așezări cu ease-out.
- **Un final ținut**: compoziția finală stă nemișcată 2-3 s, doar cu micro-mișcare, ca să se poată citi (`check2.cjs`
  avertizează sub 2 s).
- **Adâncime prin straturi**: un obiect peste text (de ex. o carte înainte/după care acoperă puțin un titlu mare).
- **Rafinările din „Faceless curat”** (formatul xi), pentru stilul educațional implicit: cuvântul-cheie intră exact când
  e spus, centrat, uriaș și în blur, apoi se retrage la mărimea lui; cuvintele accentuate în italic serif turcoaz (cel
  mult unul în rose gold), restul sans, cu o lumină moale de accent în spate; obiecte uriașe tăiate de cadru, pentru
  scară (un cadran de ceas care se rotește pe „săptămâni”); colțuri de vizor care încadrează subiectul; un inel de
  numărătoare pentru cifre reale; noduri cu iconițe și linii care apar pe rând; o listă spusă în propoziții, iar pe ecran
  pastilele cuvintelor-cheie care se adună (plin, conturat, alternativ); fundal alb cu inele de accent foarte moi, în
  blur, în colțuri; o singură idee pe ecran.
- **Trei dispozitive din „Colaj pe birou”** (formatul x-b), refolosibile: (1) obiectul lucrează pe text: lentila unei
  lupe alunecă peste un rând și mărește cuvântul-cheie, lentila ochelarilor mărește textul de sub ea, un cerc de marker
  (rose gold sau turcoaz închis, niciodată roșu) se desenează în jurul cuvântului, o linie taie un cuvânt; (2) un bloc
  ca o definiție de dicționar pentru termenul explicat (ex. „SMAS · stratul profund de sub piele…”), doar cu formularea
  de pe site; arată educațional și premium; (3) un CTA cu cuvânt în comentarii: rândul cu cererea, apoi o pastilă de
  comentariu care tastează cuvântul. **Dependență**: partea cu mesajul în privat merge doar când mesajele Instagram sunt
  legate și avem o resursă reală de trimis (de ex. catalogul de rezultate sau un ghid real); până atunci folosim doar
  CTA-uri pe care le putem onora. Cuvântul din comentarii rămâne **360** (regula proprietarului din 13.11), dacă el nu
  hotărăște altfel.
- Scenele noi pentru asta (`engine/v2/edit.js`): `writeon` (un rând mic scris de punctul de lumină, cu tic pe cuvânt),
  `panels` (panouri verticale care intră una după alta pe grilă, cu tap), `titlecard` (titlul mare, accentul, cele trei
  rânduri și cartea reală care îl acoperă, cu linia despre acord; ținut).
- **Setul premium de sunete** (15.11, proprietarul: „fă-le cu sound effects nice, nu doar așa”; `engine/sfx/v3`, făcut
  de `python3 sfx.py --v3`): fiecare sunet e din straturi (un tranzient, un corp, o coadă), cu puțină cameră, stereo, în
  3-8 variante, niciodată un bip. Numele categoriilor sunt stabile: `shutter` (oglinda, cele două cortine, întoarcerea,
  motorul; modelat după declanșatorul din referința 13), `tick_soft`, `tap`, `dot`, `whoosh_cut`, `swoosh_end`,
  `whoosh_through` (trecerea camerei printr-un obiect), `riser_soft`, `card_flip`, `shimmer_soft`, `grain` (un bob de
  nisip pe sticlă), `sand_flow` (șuvoi care se îngroașă), `pulse` (o bătaie joasă, moale), `suck_in`, `hit_deep`
  (lovitura). `mix.py` (sunet `v3`) ia întâi `sfx/v3`, apoi, dacă există, un sunet real din `sfx/ov` pentru aceeași
  categorie. Fișierele nu au fade la început, ca tranzientul să cadă pe cadrul lui; un sunet cu `peak: true` (whoosh,
  swoosh, riser) e așezat cu vârful pe cadrul evenimentului. `shutter`, `tick_soft`, `tap`, `grain`, `card_flip` nu se
  răresc niciodată: câte evenimente se văd, atâtea se aud. Sunetele se judecă din măsurători (spectru, anvelopă, cadru),
  nu cu modelul care ascultă: el descrie aproape orice efect scurt ca pe un clic.
- **Fără lovitură pusă din oficiu pe cadrul 0**: `"hookHit": false` în script, pentru un reel care începe cu sunetul
  lui (declanșatorul, un tick moale). Altfel motorul pune singur un `impact` pe primul cadru.
- **Piesa de demonstrație** (15.11, proprietarul: „mult mult mai clean și foarte profesional, cu un zoom in poate insane,
  cu lumină foarte nice și movement constant, și chenare 3D etc. care dau în animații crazy”): `scripts/v2-demo-sfx`
  (`"kind": "demo"`, nu se postează), scena `showpiece` (`engine/v2/s-demo.js`), `out/v2-demo-sfx.mp4`. E ștacheta pentru
  orice scenă nouă: o cameră care nu se oprește niciodată (împinge sau plutește mereu); un singur zoom mare (camera zboară
  prin bucla unei litere, cu blur de mișcare din viteza ei și profunzime de câmp); lumină dintr-o parte, cu umbre moi
  sub fiecare obiect și reflexii care trec; cărți 3D cu grosime, din materiale (hârtie, poză reală alb-negru, sticlă
  turcoaz, negru lucios), care se întorc, stau în evantai și trec pe lângă obiectiv; puține elemente, mari, perfect
  aliniate și centrate; alb, negru și un accent turcoaz. Tehnic: o lume CSS 3D cu `perspective` și transformarea inversă
  a camerei, totul funcție pură de timp; blur-ul se pune pe fețele cărții, nu pe containerul 3D (opacitatea sau filtrul
  pe el îl turtește).
- **Reel numărat înapoi de la lovitură** (15.11, `v2-suspans-hifu`): măsori loviturile piesei (`beats.py`, apoi începutul
  fiecărei lovituri la milisecundă), alegi lovitura dezvăluirii și pui `"musicStart"` astfel încât ea să cadă exact pe
  începutul unui cadru; tot ce e înainte se programează de la ea înapoi, pe bătăile piesei (un bob care cade pleacă de
  sus cu atât mai devreme cu cât durează căderea, ca să aterizeze pe bătaie). Liniștea dinaintea loviturii rămâne
  liniște: fără riser, fără suck-in.
- **Sunete reale** (`engine/openverse.py`): caută în Openverse doar sunete CC0 sau Public Domain Mark (fără obligații,
  merg comercial) și le pune în `engine/sfx/ov/<categorie>_<id>.wav`; proveniența (sursa, autorul, licența) stă în
  `openverse-library.json`, comis; fișierele audio nu se comit (`sfx/` e ignorat; `python3 openverse.py fetch` le reface).
  `mix.py` (sunet `v3`) folosește un sunet din `sfx/ov` când există pentru categoria lui, altfel pe cel sintetizat de
  `sfx.py`. Deocamdată descărcările de la Freesound (aproape toate efectele din Openverse) sunt refuzate de CDN-ul lor
  pe mașina asta, așa că rămân sunetele sintetizate.

### Camera (zoom-urile, din 15.11; referința proprietarului: instagram.com/reel/Dfuh4vxo-kz, „și zoom-urile astea sunt importante”)
Referința ia un singur desen și îl arată de două ori, unul sub altul: sus fără cameră, jos cu cameră („Great drawing.”
/ „Great camera.” / „Now watch the camera.”). Apoi trece pe tot ecranul și face trei mișcări numite, fiecare cu rostul
ei: **pull back** (dezvăluie ce e în jur), **dolly zoom** (subiectul rămâne la fel, lumea din spatele lui crește),
**crane up** (urcă de-a lungul subiectului până la detaliul care contează) și la final un **zoom prin lumină** pe acel
detaliu, din care apare cifra. Ce am măsurat cadru cu cadru și ținem ca regulă:
- **Pornește pe bătaie.** Fiecare mișcare începe exact pe o bătaie de bas (129 BPM acolo, o mișcare la patru bătăi), cu
  o dâră de lumină de 2-4 cadre și cu cel mai puternic sunet al măsurii. Fără bătaie, nu pornește.
- **Repede la început, lin la sfârșit.** Două cadre de pornire, cea mai mare viteză în cadrele 3-6, apoi alunecă până
  la oprire; toată mișcarea ține 0,5-0,8 s (urcarea lungă 1,2 s). Niciodată zoom liniar și niciodată zoom lent continuu
  pe post de mișcare principală (`R.cam.ease`).
- **Apoi stă.** După oprire cadrul rămâne nemișcat restul măsurii (cam trei bătăi). Viața vine din lucruri mici din
  imagine (o lumină care se rotește, apa, un contor), nu din cameră. Textul mișcării intră în timpul ei, rând cu rând,
  și se citește în pauză.
- **Straturile se mișcă după adâncime.** Ce e departe se mișcă puțin, ce e aproape se mișcă mult; la dolly zoom subiectul
  nu își schimbă mărimea, iar fundalul crește (`R.cam.layer`, `R.cam.dolly`). O poză plată mărită nu e mișcare de cameră.
- **Fiecare zoom are o țintă.** Camera pleacă de la ansamblu și ajunge pe detaliul despre care urmează să vorbim; colțuri
  de vizor se strâng pe el cu o clipă înainte. După ce aterizează, imaginea se întunecă ușor și vine mesajul (cifra,
  cuvântul-cheie) exact acolo unde a rămas privirea.
- **Zoom prin lumină la momentul cel mai important.** Două cadre până la alb pe bătaie, iar cadrul apropiat e deja sub
  lumină, cu textul în el; lumina se stinge în ~0,25 s (`R.cam.flash`). E cel mai tare sunet din tot reelul. O singură
  dată pe reel.
- **Lumina se schimbă odată cu mișcarea** (subiectul trece din siluetă în lumină pe urcare), ca fiecare oprire să arate
  altfel decât cea dinainte.
- **Bucla.** Finalul se întoarce la cadrul de început (cele două variante, una sub alta), cu chemarea la comentariu pe
  el, așa că reelul se leagă singur de la capăt.

La noi: mișcările se fac pe materialul nostru real (o poză din clinică, un caz înainte/după, aparatul, o pagină de pe
site), tăiat în straturi sau așezat în 3D; fără etichetele de film ale referinței („REC”, numele mișcărilor), care sunt
tema lor, nu a noastră. Sunetul unei mișcări: `whoosh_cut` cu vârful pe pornire și `hit_deep` pe aceeași bătaie; la
zoom-ul prin lumină, `hit_deep` plus `shimmer_soft`. Ca orice referință, e o unealtă din bibliotecă: o folosim unde
servește mesajul (o dezvăluire, un detaliu, o cifră), nu în fiecare reel.

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
