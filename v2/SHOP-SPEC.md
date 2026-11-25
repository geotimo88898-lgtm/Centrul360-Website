# Magazinul Black Friday: specificația (sesiunea de reclame, 25.11)

Sursa adevărului: cererile lui George, citite integral din sesiunea care a lucrat înainte. Doar mesajele lui contează. Mesajele mai noi bat mesajele mai vechi.

## Ce e de construit
Site-ul devine magazin online. Toate ședințele din Lista de prețuri sunt la -50%, doar la plata online cu cardul, până vineri 27.11, ora 23:59 (timerul e același pentru toată lumea). Nu există rezervare cu plata în clinică. Leadurile din reclamele cu formular rămân. Tot traficul din reclame vine aici, deci totul trebuie gândit pentru conversie, să arate impecabil și telefonul e prioritar.

### Reguli de conținut (fără excepții)
- **Doar ședințe individuale.** Fără oferte combinate (Cav+EMS, Gușă+Contur etc.) și fără bonusuri de volum.
- **Fără pachete inventate.** „Transformă în pachet” apare doar cu pachetele pe care le dă George.
- **Prețul** = prețul ședinței din Lista de prețuri × 50%. Exemplu: Liposonix 640 lei pe zonă, deci 2 zone = 1.280 lei înainte de reducere. Cavitația la 280 lei pe ședință e încă de confirmat cu George.
- **Numele:** scurte, fără subtitlu („HIFU Gușă”, „Liposonix Abdomen”). Zona aleasă completează numele.
- **Bullet-urile** spun concret ce face ședința („strânge pielea lăsată”, „topește grăsimea localizată”). Cifre doar dacă sunt reale și scrise deja pe site.
- **Înainte/după** doar din setul aprobat de pe prima pagină: cazurile 02, 05, 08, 11, 16, 23, 24, 35, 37, 39 (fișierele în brand_asset/catalog/cazul-NN-*.webp). Pe pagina unui tratament apar doar cazurile ACELUIAȘI tratament. Niciun alt caz, chiar dacă e real.
- **Recenzii:** doar nota reală de pe Google (5,0, 300+) și recenziile reale deja de pe site. Niciun citat inventat.
- **Garanția:** rămâne doar cea de bază de la epilarea laser, pe homepage, după recenzii.
- **BioLifting** = radiofrecvența pentru față, peste tot. Pentru corp rămâne „Radiofrecvență”. În Lista de prețuri: Masaj facial clasic, 30 min, 120 lei.
- **Cardul de Sărbători** are oferta lui. Nu se vinde în coș și nu se cumulează. Apare doar în meniu, ca pastilă evidențiată.
- **Texte:** în română, simple ca pentru un copil de 5 ani, cu argumente de vânzare solide. Fără text inutil, fără liniuțe lungi (em sau en dash).

## Homepage (v2/src/home-bf.html → la swap devine index)
Homepage-ul vechi rămâne, cu următoarele schimbări:
1. **Primul ecran, Black Friday** (singurul loc dramatic, negru):
   - titlul mare și lizibil: „Prețuri de 2X mai mici / la TOATE tratamentele / la plata ONLINE”, fără alt subtitlu;
   - timerul în căsuțe (zile, ore, min, sec), nu în formatul „2 zile 22:41:05”, pe care George l-a găsit confuz;
   - un slider cu 3 carduri vizibile, cel din mijloc în față, în buclă;
   - butonul „Vezi toate ofertele”.
2. **Trecerea** de la hero spre secțiunea următoare (deschisă la culoare) e un fade curat și subtil.
3. **Apoi:** rezultatele (primele), recenziile, garanția la epilare și restul homepage-ului vechi.
4. **Scoase de pe homepage:**
   - blocul Card de Sărbători și vechea secțiune Black Friday;
   - „Nu-ți ghici tratamentul”;
   - rândul „-50% până vineri 27.11, la 23:59”.

## Cardul de ofertă (componenta principală)
Copiază exact cardurile BF live care i-au plăcut lui George (`.slip.has-pic`):
- card închis la culoare, cu poza decupată în colțul din dreapta sus și pastila „-50%”;
- deasupra titlului, „BLACK FRIDAY · CORP”;
- titlul, 2 bullet-uri, selectorul de ședințe (1×/3×/6×, iar 1×/2×/3× la HIFU, HIFU Full Face, HIFU corp și Liposonix), prețul nou mare și prețul vechi tăiat;
- butonul „Rezervă oferta →”, exact ca cel live: rose-gold, înălțime normală, nu gras.

Ce schimbi față de cardurile live:
- **Mai mic.** Pe telefon cardul nu umple ecranul (max ~70% din înălțime), are aer în jur și are un look premium.
- **Ce ai voie să adaugi:** doar titlul, bullet-urile, prețul și butonul.
- **Animația:** lină, nu stângace.
- **Poza:** fiecare tratament are poza lui, generată și decupată curat (vezi Imagini). Fără siluete desenate și fără poze în cerc.
- **La apăsare:** apăsarea pe card (în afara butonului) deschide pagina tratamentului.

## Toate ofertele (v2/src/oferte-bf.html → la swap devine oferte)
- Pagina e **deschisă la culoare**. Negrul rămâne doar pe carduri și într-un hero scurt. George: „nu vreau site-ul tot negru, am folosit negrul pentru efectul dramatic”.
- **Filtrele:**
  - Cele mai cerute, Corp, Gușă, Față, Epilare;
  - un segmented control curat;
  - pe telefon intră complet în pagină (fără să iasă în marginea din stânga).
- **Fără gradientul urât.** Pastila -50% stă pe card, în locul ei firesc.
- **Grila:** carduri compacte, cu spațiu între ele. La apăsare deschid pagina tratamentului.

## Pagina de tratament (21, v2/src/tratament-<id>.html, făcute de v2/tratamente.py)
Nivelul vizat: cele mai bune magazine online (Apple, Nike, Tesla, mărci DTC de top). Fondul e deschis, iar accentele închise vin din momentele Black Friday.
1. **Hero:**
   - poza unică a tratamentului;
   - numele;
   - promisiunea într-un rând;
   - 3 bullet-uri concrete;
   - selectorul de zonă și de ședințe, apoi prețul -50% cu economia;
   - butonul „Rezervă oferta”;
   - rândul de încredere: 5,0 Google, plată securizată, Timișoara/Arad.
2. **Bara de cumpărare lipită jos pe telefon** (prețul și butonul), care apare după hero.
3. **„Ce face, pe scurt”:** 3 plăci mari, cu iconiță și o propoziție fiecare.
4. **Rezultate reale:** doar din setul aprobat, același tratament. Dacă nu există, secțiunea lipsește. Nu pui altceva în loc.
5. **Cum funcționează:**
   - o animație explicativă (SVG/CSS, pas cu pas, se pornește la scroll), diferită pe tratament;
   - plus un video scurt, unde există (vezi Imagini și video).
6. **Zone:** o hartă a corpului sau a feței cu zonele tratabile, pe care le poți apăsa (alegi zona direct de acolo).
7. **Ce rezolvă / pentru cine e:** problemele, în cuvintele clientei.
8. **Ședința:** durata, ce simți, recuperarea, câte ședințe și când se vede.
9. **Merge super în combinație cu:** 2-3 tratamente, cu motivul. La apăsare deschid pagina lor.
10. **Întrebări frecvente.**
11. **Recenzii** (doar cele reale) și butonul final.
- **Conținutul:** doar din paginile reale ale site-ului (v2/src/*.html), din Lista de prețuri și din knowledge al creative-machine. Unde lipsește o informație, nu o inventezi: o scrii simplu și sigur, sau lași secțiunea afară.

## Header, coș, checkout
- **Header:**
  - pe telefon: logo în stânga, iar în dreapta iconița de coș (cu numărul de produse) și meniul, la margine;
  - pe calculator: logo, linkuri, pastila „Oferte -50%”, Card de Sărbători evidențiat și coșul;
  - aspect glass: blur, chenar fin.
- **După „Rezervă oferta”:** se deschide un pop-up din buton, cu alegerea zonei (dacă tratamentul are zone), apoi două variante: „Mai adaug și altele” sau „Finalizează rezervarea”.
- **Coșul și checkout-ul:**
  - sheet deschis la culoare (glass);
  - fiecare produs are o miniatură, numele, zona într-o pastilă și un stepper de cantitate curat (− 1 +);
  - „Merge super în combinație cu”: carduri mici cu motivul, adăugate dintr-un singur tap, iar la apăsare deschid tratamentul; apoi „Alte oferte”;
  - totalul afișează economia.
- **Pașii checkout-ului:**
  1. Clinica: segmented control. Fără albastru de link nicăieri; verifici pe iPhone/WebKit.
  2. Ziua și ora: chips stilizate.
  3. Nume și telefon.
  4. Plata myPOS: butonul lipit jos.
- **Mișcarea:** „Tap. Don't cut. Carry.”: sheet-urile și pop-up-urile pornesc din butonul lor, iar cardul crește în pagina tratamentului (View Transitions unde există).

## Design
- **Limbajul vizual:** Summitlane.app și adminurile lui George (Apple, glass, Tesla, Nike).
  - mult spațiu alb;
  - titluri mari, strânse (tracking -0,03em);
  - eticheta de deasupra: mică, monospace, cu o linie înainte;
  - butoane pastilă;
  - nimic gras, nimic aruncat, nimic butucănos.
- **Culorile:**
  - baza site-ului rămâne cea de acum (deschisă, accent teal, serif italic pe cuvintele-cheie);
  - momentele Black Friday sunt negru și rose-gold (ca butonul „Rezervă oferta” care i-a plăcut).
- **Ce nu apare deloc:** albastru de link, chenare implicite de input, emoji în interfață.

## Imagini și video
- O poză diferită pentru fiecare tratament, generată cu Gemini (api/_lib/site-art.js, cheia de pe server, plafon de 60 de generări).
  - stilul cut-out-urilor din brand_asset/oferte/*.webp: fotografie reală de studio, decupată curat, fundal transparent, aceeași lumină pe toate;
  - de fiecare dată altă persoană sau altă zonă a corpului;
  - fără înainte/după generat și fără „rezultate” inventate.
- Video explicativ: un loop scurt pentru fiecare tratament principal, ilustrativ (cum funcționează), nu cu rezultate. Costul se raportează.

## Tehnic
- **Unde se lucrează:** v2/src (previzualizarea /v2). Live doar după „da”-ul lui George: home-bf → index, oferte-bf → oferte.
- **Prețurile și programarea pe server:**
  - prețul îl calculează serverul (api/_lib/shop.js quote);
  - programarea se confirmă doar după plata myPOS (pay.js kind 'shop', testat în qa/shop.cjs).
- **Înainte de orice publicare:**
  - `node qa/overflow.cjs --quick` iese curat;
  - capturi la 390x844 (WebKit și Chromium) și la 1440x900.
- **Reguli de repo** (repo-ul e public): fără date de cliente, fără chei, fără Vercel.
