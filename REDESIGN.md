# Refacerea site-ului centrul360.com în stilul Summit Lane

Cererea proprietarului (7 nov): tot site-ul refăcut complet în stilul aplicațiilor Summit Lane
(`geotimo88898-lgtm/produse`: `kit/WORLDS.md`, `CONVERSION.md`, `QC.md`), cu mascota, cu personalitate,
făcut să convertească, plus VSL-uri la tratamente. Tot conținutul real vine din site-ul de acum.

## Reguli care nu se schimbă
- Nimic nu înlocuiește site-ul de acum până nu aprobă el. Noul site se construiește în `v2/`
  (www.centrul360.com/v2/...), fără index în Google, fără linkuri din site-ul vechi.
- Doar date reale: prețuri din Admin → Oferte (`/api/offers-public`), nota Google 5,0 și 300+ recenzii,
  recenziile reale de pe site, poze înainte/după reale ale clinicii, echipa reală. Nimic inventat.
- Reclamele merg pe Facebook Lead Form; site-ul convertește prin programarea online (`c360-book.js`,
  `/api/booking`) și formularul cu cadou (`/api/site-lead` + HighLevel), exact ca acum.
- Urgență doar reală: orele libere reale din calendar (`/api/booking`), ofertele active acum. Fără
  cronometre inventate.
- Fără liniuțe lungi. Telefonul primul (390x844), apoi 1440x900. Fără scroll lateral.
- Meta-safe: fără promisiuni de vindecare sau cifre de slăbit inventate; „rezultatele diferă”.

## Stilul (decizia lui din 7 nov, după prima variantă: „prea multă culoare, înghesuit, logo groaznic, fără animații”)
- Curat, premium, Apple / Vercel: alb cu un gradient turcoaz foarte fin în fundal (aură care se mișcă lent), mult spațiu alb.
- Fonturile site-ului de acum: Inter (titluri 800, strâns) + Fraunces italic pe cuvintele accent; logo-ul real (Montserrat
  „CENTRUL360.COM” + semnul cu inelul și cele două elipse), animat: inelul se desenează, elipsele se rotesc ca un giroscop.
- Culoare doar pe butonul de programare (turcoaz, cu luciu și halou animat). Restul: cerneală, gri, alb.
- Doar animații curate (aceeași curbă peste tot, doar transform și opacity): titlul vine cuvânt cu cuvânt, secțiunile urcă și
  se clarifică, cifrele cresc, fraza „Nu e vina ta” se umple la derulare, linia protocolului se umple, animația care arată cum
  lucrează aparatul, pozele se dezvăluie, întrebările se deschid lin, o mică explozie de lumină la apăsarea butonului.
- Nuki plutește, respiră și răspunde la atingere (sare și spune altă replică). Fereastra de programare e în același stil alb.
- VSL-uri la tratamente: nu acum (decizia lui din 7 nov). Pe pagini nu apare niciun loc „video în curând”.

## Structura unei pagini de tratament (după CONVERSION.md)
1. Bara subțire de sus, lipită: cadoul + următoarea oră liberă reală.
2. Primul ecran: pentru cine (h1 cu „cine” evidențiat), VSL în ramă (poster cu hook-ul), buton, 2-3
   rânduri de încredere (consultație gratuită, fără obligații, 5,0 Google).
3. Rezultate reale înainte/după (cu titlul rezultatului).
4. Nu e vina ta (de ce dieta/sala nu ajung) + Nuki.
5. Protocolul (pașii, câte ședințe, ce simți), Ziua 1 vs final.
6. Oferta activă din Admin (preț tăiat, economie, oraș), lângă ea Nuki și garanția/condițiile reale.
7. Recenziile Google reale, cu titlul rezultatului copiat exact.
8. Pentru cine e / pentru cine nu e (contraindicațiile reale).
9. Întrebări (FAQ real din pagina de acum).
10. Final: Nuki mare + buton. Pe telefon: bara de jos fixă (oferta + „Programează-mă”).

## Pașii
1. Baza comună `v2/kit.css`, `v2/kit.js` (bare, ramă Nuki, oferte live, ore libere, programare,
   apariții la derulare) + prima pagină `v2/index.html`.
2. Pagina model de tratament `v2/grasime-localizata.html`, aprobată de el.
3. Celelalte 9 tratamente din model, cu conținutul real al fiecăreia; apoi oferte, prețuri,
   rezultate, echipa, Timișoara, Arad, programare, mulțumire.
4. VSL-uri la tratamente: doar când spune el.
5. Când aprobă tot: `v2/` devine site-ul (redirecturi păstrate, SEO păstrat).
