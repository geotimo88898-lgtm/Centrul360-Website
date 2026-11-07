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

## Lumea (WORLDS.md, echivalentul pentru o clinică)
- Lumea: **clinica lui Nuki**, fișa clientei și dosarul de rezultate. Hârtie de fișă, rigla de
  centimetru, etichete de fișă medicală, ecusonul clinicii.
- Mascota: **Nuki** (porțelan alb, uniforma Centrul360, fular ADN turcoaz, plutește), 26 de ipostaze
  decupate în `brand_asset/mascota/ipostaze/`. Ramă: ecusonul clinicii pe șnur (o singură ramă).
- Fonturi: Fraunces (titluri, prețuri, replicile lui Nuki) + JetBrains Mono (etichete de fișă,
  butoane mici) + DM Sans (text).
- Culori: porțelan #F6F4EF, cerneală #13201F, turcoaz #1F9E8F (accent), turcoaz închis #0E3B37 (benzi
  închise), culoarea de programare (doar pe butoanele de programare) #FF7A59.
- Etichete în limba lumii: „Fișa 01 · consultație gratuită”, „Din recenziile Google”, „Protocolul”,
  „Nu e vina ta”, „Ce primești”, „Verificat”, „La recepție: întrebări”, „Nuki spune”.
- Butonul: „Programează-mă” / „Vreau consultația gratuită”.

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
4. VSL-uri: scripturile pe tratament la aprobare (fără sume rostite, doar pe ecran), apoi randarea
   cu motorul din `produse/kit/vsl` și vocea Pulcherrima. Nu se randează fără „da”.
5. Când aprobă tot: `v2/` devine site-ul (redirecturi păstrate, SEO păstrat).
