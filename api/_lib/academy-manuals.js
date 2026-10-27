// Traininguri, the manuals, by role and part of the tab:
//   Vânzări · recepție       "Apelul de vânzare" (the clinic's call script for leads from the ads, SOP 01) and
//                            "După apel" (booking, confirmations, cancellations, clients who come back)
//   Vânzări · cosmeticiană   "Consultația" (the program and the 4 offers, academy-extra.js) and "Vânzarea la consultație"
//   Tratamente · cosmeticiană "În cabină" (before, during, after a treatment; hygiene), next to the treatment sheets
// A chapter body is one line per block: "## " sub-heading · "- " bullet · "1. " step · "> " what to say ·
// "! " important rule · anything else a paragraph. Prices are never written here: they come from Oferte.

const L = (s) => s.trim().split('\n').map((x) => x.trim()).filter(Boolean);

const APEL = {
  id: 'apel', area: 'vanzari', roles: ['receptie'], icon: 'phone',
  title: 'Apelul de vânzare',
  lede: 'Leadul din reclame, de la primul „bună ziua” până la programarea confirmată. Pentru recepție.',
  chapters: [
    { id: 't-principiu', title: 'Principiul: faci triaj, nu convingi', summary: 'Afli dacă e un caz pe care îl putem rezolva și îi ții un loc. Și ce faci înainte să formezi numărul.',
      body: L(`
Obiectivul apelului: o programare confirmată la o singură ședință, fără avans. Durata: 6-8 minute.
## Principiul
Nu ești agent de vânzări. Ești triaj.
Treaba ta nu e să convingi pe cineva să vină. E să afli dacă persoana e un caz pe care îl putem rezolva și să-i ții un loc dacă da.
Cine încearcă să convingă vorbește mult și cere permisiunea. Cine face triaj pune întrebări, ascultă și recomandă. A doua variantă închide de două ori mai des.
## Înainte să formezi numărul
- Deschide fișa leadului: numele, ce a bifat în formular (obiectivul, zona, orașul).
- Verifică două ore libere concrete în următoarele 72 de ore, în orașul ei. Nu suna fără ele: „vă caut și vă sun eu” pierde clienta.
- Sună în maximum 5 minute de la formular. După o jumătate de oră, șansa să răspundă scade mult.
- Nu răspunde: trei încercări în prima zi (imediat, peste două ore, apoi între 18:00 și 19:00). Abia după aceea WhatsApp.
`) },
    { id: 't-deschidere', title: 'Deschiderea și cadrul', summary: 'Primele 40 de secunde: îi amintești că ea ne-a căutat și nu ceri permisiunea.',
      body: L(`
> Bună ziua, [Nume]? … Bună, sunt [prenumele tău] de la Centrul360. Ne-ați lăsat acum puțin timp datele la un anunț de-al nostru de pe [Facebook / Instagram], pentru [ce cerea reclama]. V-am prins într-un moment bun să vedem exact ce vi se potrivește?
Îi spui numele (primul „da”), îi amintești că ea ne-a căutat și nu ceri permisiunea. „Aveți două minute?” îți dă un NU gratuit înainte să fi spus ceva de valoare.
! Spune platforma corectă, din fișă: Facebook sau Instagram. Leadurile din reclame nu vin de pe site.
! Nu pomeni „ofertă”, „voucher” sau prețul în primele 30 de secunde.
## Dacă spune „nu am timp acum”
> Perfect, nu vă rețin deloc. Vă sun eu: vă e mai bine pe la 14:00 sau după 18:00?
## Cadrul
> Ca să nu vă pierd timpul: vă pun câteva întrebări scurte, să înțeleg exact ce aveți nevoie. Dacă e ceva ce chiar putem rezolva, vă spun exact ce recomandăm și cât costă. Dacă nu sunteți un caz pentru noi, vă spun sincer și nu vă mai deranjez. Sună corect?
Ultima propoziție e cea mai puternică din apel: când spui că s-ar putea să nu-i vinzi nimic, nu mai ești o amenințare.
`) },
    { id: 't-diagnostic', title: 'Întrebările: ce își dorește', summary: 'Cinci întrebări, după fiecare o singură întrebare de aprofundare. Apoi taci.',
      body: L(`
## Regula tonului
Întrebăm despre ce își dorește, niciodată despre ce e în neregulă cu ea. Nu numi tu problema. Las-o pe ea s-o numească, dacă vrea.
1. Am văzut că ne-ați scris pentru [ce cerea reclama]. Povestiți-mi un pic: ce v-ar plăcea să se schimbe? Apoi: Și de când vă gândiți la asta?
2. Ați mai încercat ceva pentru asta până acum? Dacă da: Și cum a mers? Ce credeți că a lipsit ca să țină? Dacă nu: Și ce a lipsit ca să începeți până acum?
3. Dacă peste trei luni ar arăta exact cum v-ați dori, ce ar fi diferit pentru dumneavoastră?
4. Există un moment până la care v-ați dori să vedeți o diferență? O ocazie, o vacanță?
5. De obicei, la lucrurile astea decideți singură sau mai vorbiți și acasă?
Notează răspunsurile, mai ales „ce a lipsit” și data ocaziei. Le folosești la închidere și le citește specialista înainte de consultație.
! Regula tăcerii: după fiecare întrebare taci și numeri până la trei în gând.
## Formulări de evitat
- Nu „Ce vă deranjează când vă uitați în oglindă?”, ci „Ce v-ar plăcea să se schimbe?”
- Nu „De cât timp aveți problema asta?”, ci „De când vă gândiți la asta?”
- Nu „Ce v-a oprit până acum?”, ci „Ce a lipsit ca să începeți până acum?”
- Nu „Cum vă afectează în viața de zi cu zi?”, ci „Dacă ar arăta cum v-ați dori, ce ar fi diferit?”
- Nu întrebi „Aveți multă celulită / grăsime / riduri?”. Evaluarea o face specialista.
- Nu confirmi niciodată un defect. Confirmi ce își dorește.
`) },
    { id: 't-recomandare', title: 'Rezumatul și recomandarea', summary: 'Repeți cu cuvintele ei, apoi recomanzi o singură ședință. Prețul vine ultimul.',
      body: L(`
## Rezumatul
> Deci, ca să fiu sigură că am înțeles bine: v-ați dori [X, în cuvintele ei], vă gândiți la asta de vreo [Y] luni, ați încercat [Z] și nu a ținut cât ați fi vrut, și v-ar plăcea să vedeți o diferență până la [ocazie]. Am prins corect?
Folosește cuvintele ei, nu ale noastre. Dacă a spus „să nu mai arăt obosită”, spui „să nu mai arătați obosită”.
## Recomandarea
Niciodată „avem o ofertă”. Întotdeauna „vă recomand”.
> Pentru ce mi-ați descris, primul pas la noi nu e un pachet și nu e o decizie mare. E o singură ședință de [tratamentul de intrare], ca să vedeți pe pielea dumneavoastră dacă funcționează, înainte să investiți în ceva mai serios.
Apoi, în ordinea asta:
1. Ce vede după ședință.
2. De ce va funcționa: aparatură certificată medical, 5 stele din peste 300 de recenzii pe Google.
3. Cât durează și că nu are nevoie de recuperare.
4. Ce i se cere: nimic de pregătit, evaluarea e gratuită.
5. Prețul, cu ancoră: prețul de listă, apoi prețul din campanie (din Oferte).
## Stiva, imediat după preț
Spui tot ce intră în preț, pe rând. La Restart: evaluarea gratuită, apoi cele opt etape (demachiere, tonifiere, curățare cu ultrasunete, gomaj, radiofrecvență, masaj facial, mască aleasă pentru pielea ei, cremă de final), iar la final recomandarea pentru mai departe, fără nicio obligație.
Enumerarea face mai mult decât orice adjectiv: clienta numără singură etapele în cap.
`) },
    { id: 't-inchidere', title: 'Fără avans, locurile reale și închiderea', summary: 'Riscul ei devine zero, locurile sunt cele reale, închizi cu două ore concrete.',
      body: L(`
## Fără avans
> Și ca să fie foarte clar: nu vă cerem niciun avans și nu plătiți nimic acum. Plătiți doar la salon, după ce ați văzut locul, ați cunoscut specialista și ați făcut tratamentul. Iar dacă la evaluare vedem că nu sunteți un caz potrivit, v-o spunem și nu vă lăsăm să plătiți degeaba.
## Locurile, cele reale
> Avem un număr limitat de ședințe pe săptămână pe aparatul ăsta, iar locurile la prețul de campanie se dau în ordinea programărilor. Săptămâna asta mai am [N] locuri libere la [oraș].
! [N] e numărul real. O cifră inventată, prinsă o singură dată, costă clienta și recenzia.
## Închiderea, în trei pași
1. Restrânge ziua: „Vă prind mai bine dimineața sau după-amiaza?”
2. Două ore concrete: „Am liber marți la 11:30 sau joi la 17:00. Care vă e mai la îndemână?”
3. Treci la fapt: „V-am trecut marți, [data], ora 11:30. Îmi confirmați numele complet, să fie corect în fișă?”
Din momentul în care își dictează numele, programarea e a ei.
! Interzis la închidere: „Când ați fi pregătită?”, „Ce ziceți?”, „Vă interesează?”, „Vreți să vă programez?”.
`) },
    { id: 't-confirmare', title: 'Ritualul de confirmare și după apel', summary: 'Fără avans, confirmarea e tot ce stă între tine și un loc gol. Nu se sare niciun pas.',
      body: L(`
1. Angajamentul: „[Nume], vă rezerv locul pe numele dumneavoastră și îl scot din program pentru altcineva. Pot să contez pe dumneavoastră marți la 11:30?” Aștepți un „da” clar. „Cred că da” nu e „da”.
2. Drumul: „Aveți cum să ajungeți? Suntem pe [adresă]. Vă trimit locația pe hartă.”
3. Rugămintea: „Dacă intervine ceva, dați-mi un mesaj cu măcar patru ore înainte, să pot da locul altcuiva. Sunteți de acord?”
4. WhatsApp în timpul apelului: „Vă trimit chiar acum confirmarea pe WhatsApp. Îmi răspundeți cu «Confirm», să știu că a ajuns?”
5. Închiderea caldă: „Perfect. Ne vedem marți la 11:30, [Nume]. Vă așteptăm cu drag.”
## După apel
- Reamintirile pleacă singure din portal, cu 24 de ore și cu 2 ore înainte. Tu o suni pe cea care nu a răspuns la reamintirea de 24 de ore.
- Dacă nu a venit: o suni în aceeași zi, fără reproș: „V-am ținut locul și nu ați ajuns, s-a întâmplat ceva? Vă vreau în continuare în program, când vă e bine?”
! Programarea nu e venit. Prezența e venit.
`) },
    { id: 't-oferte', title: 'Ce recomanzi, după ce a bifat', summary: 'Ședința de intrare după formular, cele două oferte care nu se amestecă și consultația gratuită ca ultimă variantă.',
      body: L(`
Structura apelului nu se schimbă. Se schimbă doar recomandarea, după ce a bifat în formular. Prețurile le iei din Oferte.
- Ten fără strălucire, riduri fine: Tratament facial Restart.
- Gușă, bărbie dublă: HIFU gușă.
- Riduri, lifting facial: HIFU Full Face.
- Grăsime localizată, abdomen: Liposonix 2 zone.
- Celulită: Anticelulită (radiofrecvență).
- Epilare laser: Full Body Elysion Pro, doar în Timișoara.
- Retenție de apă, detox: Împachetare la cald + EMS, doar în Timișoara.
Pachetele (Mini Belly, Abdomen 360, Gușă 360 și celelalte) le recomandă specialista în salon. Nu le pomenești la telefon.
! Mini Belly, Detox, Celulită & Lifting, Celulită 360 și Abdomen 360 sunt doar în Timișoara.
## Cele două oferte care nu se amestecă
- Formularul de pe site: consultație gratuită și masaj facial cadou.
- Reclamele de pe Facebook și Instagram: prețul de campanie la ședința de intrare.
! Unei cliente din reclame nu îi spui niciodată „masaj facial cadou”. Masajul e un pas din Restart: „urmează masajul facial”.
## Consultația gratuită, ca ultimă variantă
Doar după ce a spus „nu” de două ori la ședința de intrare:
> Bun, atunci hai să facem altfel. Veniți doar la o evaluare gratuită, fără tratament și fără nicio plată. Vă uitați la clinică, vă cunoașteți specialista, vă spune ea ce vede. Dacă după aceea vreți să faceți ceva, faceți. Dacă nu, nu. Marți la 11:30 sau joi la 17:00?
Notezi în fișă „venit pe consultație gratuită”.
`) },
    { id: 't-obiectii', title: 'Obiecțiile și ce răspunzi', summary: 'Accepți, reîncadrezi, închizi din nou. Niciodată nu o contrazici.',
      body: L(`
! De fiecare dată: accepți, reîncadrezi, închizi din nou. Nu lași nicio obiecție fără o închidere după ea.
## „E prea scump” sau „nu am bani acum”
> Vă înțeleg perfect, și tocmai de aceea nici nu vă cer să investiți într-un pachet acum. [Prețul] e singura sumă despre care vorbim astăzi. Nu plătiți nimic în avans, plătiți la salon, după tratament. Marți la 11:30 sau joi la 17:00?
## „Mă mai gândesc”
> Absolut, e normal. Ca să vă pot ajuta: ce anume vă face să ezitați? Prețul, timpul, sau nu sunteți sigură că funcționează pentru dumneavoastră?
„Mă mai gândesc” nu e niciodată obiecția reală. Afli ce e de fapt și răspunzi la asta.
## „Trebuie să vorbesc cu soțul”
> Sigur, e normal. Ca să aveți ce să-i spuneți: nu e o decizie financiară mare, fără avans, plătiți la fața locului. Vă țin totuși un loc provizoriu pentru marți, vorbiți diseară, și dacă nu merge îmi dați un mesaj mâine dimineață și îl eliberez. E în regulă așa?
## „Doare?”
> Nu. Majoritatea clientelor spun că e mai degrabă relaxant. Și oricum, specialista lucrează cu dumneavoastră: dacă simțiți disconfort, spuneți și oprim.
## „Chiar funcționează?”
> E o întrebare corectă. Exact de asta nu vă vindem un pachet la telefon. Faceți o ședință, vedeți rezultatul pe pielea dumneavoastră și abia apoi decideți. Avem 5 stele din peste 300 de recenzii pe Google, vi le trimit pe WhatsApp.
## „Cât durează până văd rezultate?”
> La Restart, hidratarea și luminozitatea se văd chiar în ziua respectivă. Pentru schimbări de durată e nevoie de un plan pe câteva ședințe, dar despre asta vorbim după ce vedeți prima.
## „Sunt departe”
> Unde sunteți? Avem două clinici: Timișoara, Str. Bucegi 7, și Arad, Str. Ioan Alexandru 16-18. Care vă e mai la îndemână? Vă trimit locația pe WhatsApp.
## „Trimiteți-mi pe WhatsApp și vă spun eu”
> Vi le trimit imediat. Doar că locurile la prețul ăsta se dau în ordinea programărilor. Hai să vă țin un loc acum, vă trimit tot pe WhatsApp, și dacă vă răzgândiți până mâine îmi dați un mesaj. Nu e niciun avans.
## „Nu am timp, sunt foarte ocupată”
> Vă înțeleg, de asta durează o oră și nu aveți nevoie de recuperare după. Vă e mai ușor dimineața devreme sau seara după program?
## „De unde aveți numărul meu?”
> L-ați lăsat dumneavoastră, acum [X zile], la un anunț de-al nostru de pe [Facebook / Instagram]. Dacă a fost din greșeală, vă scot imediat din listă și nu vă mai deranjăm. Vreți să fac asta?
## „Am făcut la altcineva și nu a mers”
> Îmi pare rău că ați trecut prin asta, și e exact motivul pentru care la noi evaluarea e gratuită. Ce anume ați făcut acolo? … Atunci hai să vedem întâi ce vede specialista noastră, înainte să plătiți ceva.
## „Sunt însărcinată”, „alăptez” sau „am o afecțiune”
> Mulțumesc că mi-ați spus, e important. În cazul ăsta nu vă programez la tratament, ar fi incorect din partea mea. Vă notez și vă sun eu când e sigur pentru dumneavoastră, dacă doriți.
Vânzarea la care renunți aici e cea mai profitabilă din tot apelul: așa se adună recenziile de 5 stele.
`) },
    { id: 't-interzis', title: 'Ce nu se spune niciodată', summary: 'Frazele care pierd clienta sau ne fac probleme.',
      body: L(`
- „Aveți timp pentru câteva întrebări?”: ceri permisiunea și îi dai un NU gratuit.
- „Ar fi în regulă să vă spun despre tratament?”: încă o cerere de permisiune.
- „Când ați fi pregătită să începem?”: întrebare deschisă la închidere. Dai două ore concrete.
- „Ați solicitat un voucher de 50%”: prețul în prima frază sună scump oricât ar fi.
- „Mai am doar 2 locuri!” când sunt 9: limitarea e reală, spui cifra reală.
- „Rezultate garantate 100%”, „slăbiți sigur 5 cm”: nu promitem rezultate.
- Pachetele mari, la telefon: se vând în salon, de specialistă, după ce clienta a văzut un rezultat.
- „Masaj facial cadou” unei cliente din reclame: cadoul e doar pentru formularul de pe site.
- „Vă dorim o zi minunată” ca ultimă propoziție: ultima propoziție e ziua și ora. „Ne vedem marți la 11:30.”
`) },
  ],
};

const PROGRAMARE = {
  id: 'programare', area: 'vanzari', roles: ['receptie'], icon: 'calendar',
  title: 'După apel: programări și confirmări',
  lede: 'Leadul nou, programarea corectă, confirmările, anulările și clientele care revin. Pentru recepție.',
  chapters: [
    { id: 'p-5min', title: 'Leadul nou: regula celor 5 minute', summary: 'Un lead sunat în primele 5 minute se programează de câteva ori mai des decât unul sunat după o oră.',
      body: L(`
Leadul a completat formularul acum câteva minute. Încă se gândește la noi. Peste o oră se gândește la altceva.
1. Sună în maximum 5 minute de la apariția leadului (Apelul de vânzare).
2. Nu răspunde? Mai încerci peste două ore și apoi între 18:00 și 19:00.
3. După a treia încercare fără răspuns: mesajul de WhatsApp de mai jos.
4. Notează fiecare încercare în fișa din Pipeline.
! Leadurile noi se sună primele. Cele vechi după.
## Dacă nici după asta nu răspunde
- A doua zi la 10:00, încă un apel.
- Peste 3 zile, ultimul.
- Apoi Pierdut, cu motivul notat.
## WhatsApp după trei încercări
> Bună, [nume]! Sunt [numele tău] de la Centrul360 [oraș]. Ne-ați lăsat datele la anunțul nostru pentru [tratament]. V-am sunat, dar nu am reușit să vă prind. Când e un moment bun să vorbim 2 minute?
`) },
    { id: 'p-programare', title: 'Programarea corectă', summary: 'Ce trebuie să conțină fiecare programare, ca să nu avem surprize.',
      body: L(`
O programare bine făcută înseamnă o clientă care vine și o cosmeticiană pregătită.
1. Tratamentul și oferta exactă, din Oferte.
2. Orașul corect: EMS, împachetarea la cald și epilarea laser doar în Timișoara, cavitația 1+1 doar în Arad.
3. Telefonul clientei, obligatoriu.
4. Cosmeticiana alocată.
5. Ce ți-a spus la telefon (ce își dorește, ce a mai încercat, ocazia), scris în notă. Specialista o citește înainte de consultație.
6. Dacă e o ședință dintr-un pachet deja cumpărat, bifezi „Ședință din pachet”.
! Fără avans. Clienta plătește la salon, după tratament.
## Ce pleacă singur pe WhatsApp
- Confirmarea programării, imediat (nu și la ședințele din pachet).
- Reamintirea cu 24 de ore înainte și cea cu 2 ore înainte, cu recomandările de dinainte de tratament.
- După tratament, cererea de recenzie (nu și la ședințele din pachet).
`) },
    { id: 'p-confirmari', title: 'Confirmări și mai puține neprezentări', summary: 'Fiecare clientă care nu vine e un loc gol și bani pierduți.',
      body: L(`
Reamintirile pleacă singure din portal. Treaba ta e să le urmărești.
1. Dimineața, uită-te la programările de mâine: cine nu a răspuns la reamintirea de 24 de ore?
2. Pe ele le suni. Un apel de un minut costă mai puțin decât un loc gol de o oră.
3. Când confirmă, o marchezi Confirmată în Calendar.
4. Dacă vrea altă zi, o muți pe loc (reamintirile se mută singure).
## Ce spui la telefon
> Bună, [nume]! Sunt [numele tău] de la Centrul360. Vă sun doar să confirm programarea de mâine, la [oră]. Vă așteptăm?
! Dacă nu confirmă și nici nu răspunde, nu ștergi programarea. Mai încerci dimineața.
`) },
    { id: 'p-anulari', title: 'Anulări și reprogramări', summary: 'Când o clientă anulează, nu închei discuția: muți programarea.',
      body: L(`
Când clienta anulează, de cele mai multe ori nu renunță la tratament. Doar nu poate atunci. Treaba ta e să găsești altă zi pe loc.
## Ce spui
> Nicio problemă, se mai întâmplă. Hai să găsim altă zi, să nu pierzi locul și oferta. Îți vine mai bine [zi] sau [zi]?
## Dacă nu vrea să aleagă acum
> Bine. Te sun eu [zi] să găsim un moment. Mulțumesc că m-ai anunțat!
Pune follow-up în Pipeline la ziua spusă.
## Neprezentare fără anunț
1. Sun-o în aceeași zi, calm, fără reproș.
2. Propune o nouă dată.
3. Explică politica de anulare dacă e cazul.
> Bună, [nume], te-am așteptat azi la [oră]. Sper că e totul bine! Vrei să-ți găsesc o altă zi?
`) },
    { id: 'p-revenire', title: 'Clientele care nu s-au mai întors', summary: 'O clientă care a fost deja la noi se programează mult mai ușor decât una nouă.',
      body: L(`
Clientele care au făcut o ședință și nu au mai revenit sunt cea mai ușoară vânzare: ne cunosc deja.
1. Săptămânal, caută clientele care nu au mai venit de peste 30 de zile și nu au programare.
2. Trimite-le un mesaj personal, nu de reclamă.
3. Dacă răspund, programează-le pe loc.
## Mesaj de revenire
> Bună, [nume]! Sunt [numele tău] de la Centrul360. Mă gândeam la tine: cum a mers după [tratament]? Ca să vezi rezultatul complet, ar fi bine să continuăm. Îți găsesc un loc săptămâna asta?
## Mesaj după un tratament de întreținere
> Bună, [nume]! A trecut o lună de la ultimul tău [tratament]. E momentul bun pentru ședința de întreținere. Îți țin un loc?
`) },
    { id: 'p-mesaje', title: 'Mesaje WhatsApp gata de copiat', summary: 'Mesajele folosite cel mai des, scrise simplu și cald.',
      body: L(`
Copiază, completează ce e între paranteze și trimite. Scrie ca un om, nu ca o firmă. Cele mai folosite le ai și în Mesaje, la snippeturi.
## Lead nou
> Bună, [nume]! Sunt [numele tău] de la Centrul360 [oraș]. Am văzut că te interesează [tratament]. Când pot să te sun 2 minute?
## După consultație, dacă nu s-a programat
> Bună, [nume]! Mulțumesc că ai trecut pe la noi azi. Ți-am ținut locul pentru [zi, oră] până mâine la 12. Îmi spui dacă îl păstrăm?
## După prima ședință
> Bună, [nume]! Cum te simți după ședința de ieri? Dacă ai orice întrebare, sunt aici. 😊
## Cerere de recenzie
> Mă bucur mult că ești mulțumită! Ne-ar ajuta enorm o recenzie pe Google: [link]. Durează un minut. Mulțumim! 💗
`) },
  ],
};

const VANZARI = {
  id: 'vanzari', area: 'vanzari', roles: ['cosmetician'], icon: 'trend',
  title: 'Vânzarea la consultație',
  lede: 'Cum o asculți, cum îi arăți drumul și cum închizi, la consultație și în cabină. Pentru cosmeticiene.',
  chapters: [
    { id: 'v-mentalitate', title: 'De ce vindem', summary: 'Vânzarea înseamnă să o ajuți pe clientă să ia o decizie bună pentru ea.',
      body: L(`
Clienta vine la noi pentru că are o problemă care o deranjează: burtica de după sarcină, pielea lăsată, părul nedorit, tenul obosit. Dacă pleacă fără plan, problema rămâne. Dacă pleacă cu un plan clar și programată, o ajutăm cu adevărat.
! Nu vindem ce vrem noi. Vindem ce o ajută pe ea să ajungă la rezultatul pe care și-l dorește.
## Ce cumpără de fapt clienta
- Nu cumpără „ședințe”. Cumpără rezultatul: să se simtă bine în haine, să nu se mai ascundă în poze, să se vadă odihnită.
- Cumpără încrederea că la noi chiar se întâmplă: recenziile de 5,0, rezultatele altor cliente, felul în care îi vorbești.
- Cumpără ușurința: fără operație, fără recuperare, fără durere mare, aproape de casă.
## Cele 4 lucruri care o fac să spună DA
1. Vrea foarte tare rezultatul. Întreabă-o și las-o să ți-l spună cu cuvintele ei.
2. Crede că o să meargă la ea. Arată-i rezultate reale și explică-i simplu cum funcționează.
3. Nu durează mult. Spune-i când începe să vadă diferența.
4. Nu e greu pentru ea. Fără ace, fără pauză, se întoarce la treabă în aceeași zi.
Când una din astea lipsește, clienta spune „mă mai gândesc”. Treaba ta e să afli care lipsește și s-o completezi.
## Cum vorbim
- Simplu, ca între prietene. Fără cuvinte complicate și fără termeni medicali de care nu are nevoie.
- Puțin vorbit de noi, mult întrebat despre ea.
- Calm și sigur. Dacă tu crezi în tratament, crede și ea.
`) },
    { id: 'v-consultatie', title: 'Consultația, ca discuție', summary: 'Ordinea discuției, de la salut până la programul recomandat.',
      body: L(`
Consultația e locul unde se face vânzarea. Discuția urmează mereu aceiași pași. Hârtiile și ofertele sunt în manualul Consultația.
1. Primire caldă. Salut pe nume, apă, fișa clientei. Spune-i ce urmează: „Stăm de vorbă 10 minute, vedem zona și îți spun sincer ce ți-ar folosi.”
2. Citește înainte ce a notat recepția la telefon (ce își dorește, ce a încercat, ocazia).
3. Întreabă ce vrea. Ce zonă, de cât timp, ce a mai încercat.
4. Întreabă de ce acum. Ce s-a întâmplat de a venit tocmai acum (o nuntă, vara, o poză care nu i-a plăcut).
5. Repetă cu cuvintele ei. „Deci te deranjează burtica de după a doua sarcină și vrei să te simți bine în rochie la nunta din august. Am înțeles bine?”
6. Arată-i drumul: programul recomandat, pe pagina 1.
7. Spune prețul și oferta (vezi capitolul despre preț) și taci.
8. Programezi toate ședințele pe loc, în Calendar, înainte să plece.
! Masajul facial cadou e doar pentru clientele venite din formularul de pe site. Clientele din reclame îl primesc ca pas din Restart.
## Ce spui la început
> Mă bucur că ai venit! Înainte să-ți spun ceva despre tratamente, vreau să te ascult pe tine. Ce te-a făcut să ne scrii?
## Ce spui când îi arăți drumul
> Pentru ce mi-ai spus tu, eu aș face așa: [tratamentele], [număr] ședințe, la [interval]. Diferența începi s-o vezi după [când]. Fără ace și fără pauză, te întorci la treabă în aceeași zi.
`) },
    { id: 'v-intrebari', title: 'Întrebările care vând', summary: 'Cine pune întrebările conduce discuția. Lista de întrebări de folosit la fiecare consultație.',
      body: L(`
Clienta se convinge singură când își aude propriile răspunsuri. Tu doar pui întrebările bune și asculți.
## Despre ce își dorește
> Ce v-ar plăcea să se schimbe?
> De când vă gândiți la asta?
> Ce ai mai încercat până acum? Cum a mers?
## Despre de ce acum
> Ce s-a întâmplat de te-ai hotărât să vii acum?
> Ai un eveniment pentru care vrei să arăți bine? Când e?
## Despre rezultatul dorit
> Cum ar arăta pentru tine un rezultat de care să fii mulțumită?
> Ce ai face diferit dacă zona asta n-ar mai fi o problemă?
## Despre cât o costă să nu facă nimic
> Și dacă mai lași un an așa, cum te-ai simți?
## Cum asculți
- Las-o să termine. Nu sări cu oferta după prima propoziție.
- Notează două-trei cuvinte de-ale ei („burtica”, „nunta”, „poze”) și folosește-le mai târziu, când îi explici planul.
- Dacă spune ceva emoțional („nu mă mai simt bine în pielea mea”), nu trece repede peste. Spune „te înțeleg, e mai des decât crezi” și las-o să continue.
`) },
    { id: 'v-pret', title: 'Cum spui prețul', summary: 'Prețul se spune clar, după ce clienta știe ce primește. Apoi taci.',
      body: L(`
Prețul nu sperie. Sperie prețul spus prea devreme, fără să știe ce primește, sau spus cu jenă.
1. Întâi rezultatul și programul (pagina 1).
2. Totalul la preț de listă, apoi oferta de pe pagina 2: pachetul complet, plată integrală.
3. Spune ce intră: tratamentele, zonele, ședințele.
4. După preț: taci. Las-o pe ea să vorbească.
! Nu negociem și nu inventăm reduceri. Ofertele sunt cele 4 din Consultația, pe rând, în ordine.
## Ce spui
> La preț de listă, programul ăsta ar fi [total]. Dacă plătești azi integral, ai [reducerea], deci [suma]. Intră [ce intră].
## Ce NU faci
- Nu spui „e cam scump, știu”.
- Nu dai o reducere ca să închizi.
- Nu spui prețul pe hol sau din mers. Doar la consultație, după ce ai ascultat-o.
`) },
    { id: 'v-obiectii', title: 'Obiecțiile și ce răspunzi', summary: '„E scump”, „mă mai gândesc”, „întreb soțul”: ce înseamnă de fapt și ce spui.',
      body: L(`
O obiecție nu e un NU. E o întrebare la care încă nu a primit răspuns. Regula: întâi îi dai dreptate, apoi pui o întrebare, apoi răspunzi.
## „E scump”
De obicei înseamnă: nu e încă sigură că o să meargă la ea.
> Te înțeleg, e o sumă. Hai să vedem: dacă ai fi sigură că rezultatul e cel pe care mi l-ai spus, ți s-ar mai părea scump?
Dacă spune că nu, problema e încrederea: arată-i rezultate și explică încă o dată cum funcționează. Dacă banii chiar sunt problema, treci la oferta următoare: 4 tranșe, apoi jumătate de pachet. Nu inventezi o reducere.
## „Mă mai gândesc”
Înseamnă că ceva nu e clar.
> Sigur. Ca să te ajut să te gândești: ce anume te face să stai pe gânduri? Prețul, dacă o să meargă la tine sau programul?
Apoi răspunzi exact la ce spune.
## „Întreb soțul / partenerul”
> Normal, e bine să vorbiți. Ce crezi că o să te întrebe? Hai să-ți dau răspunsurile, să ai tot ce-ți trebuie.
! Oferta e valabilă doar în ziua consultației. Spune-i asta calm, fără presiune.
## „Nu am timp”
> Ședința durează [cât], fără pauză după. Poți veni în pauza de prânz și te întorci direct la treabă.
## „Mi-e frică să nu doară”
> Se simte [senzația reală, ex. căldură]. Îți spun eu înainte ce urmează și ne oprim oricând vrei.
## „Am mai încercat și n-a mers”
> Ce ai încercat? [Ascultă.] Diferența la noi e [aparatul, protocolul, numărul de ședințe]. Și îți spun sincer de la început ce să aștepți.
`) },
    { id: 'v-inchidere', title: 'Închiderea și programarea pe loc', summary: 'Nicio clientă nu pleacă fără ședințele în Calendar.',
      body: L(`
O consultație fără programare e o consultație pierdută. Nu lăsa clienta să plece cu „te sun eu”.
1. Propune două variante de zi pentru prima ședință, nu întreba dacă vrea.
2. Programezi toate ședințele pe loc, în Calendar, cât e lângă tine.
3. Completezi oferta acceptată și o semnați amândouă (Consultația → Înainte de semnare).
4. Confirmarea pleacă singură pe WhatsApp. Spune-i să răspundă la ea.
## Ce spui
> Hai să-ți rezervăm prima ședință. Îți vine mai bine marți la 17 sau joi la 10?
> Perfect, te-am trecut joi la 10 și am pus și celelalte ședințe. Îți vine acum confirmarea pe WhatsApp.
## Dacă tot nu se hotărăște
> Te înțeleg. Programul îl ai pe hârtie, cu tot ce ți-am explicat. Te sun eu mâine să vedem ce ai hotărât.
Pune imediat follow-up în Pipeline, ca să nu se piardă.
`) },
    { id: 'v-pachete', title: 'Pachete și recomandări suplimentare', summary: 'Recomanzi un tratament în plus doar când o ajută să ajungă mai repede la rezultat.',
      body: L(`
Upsell-ul bun nu e „mai vinde ceva”. E „uite ce te ajută să ajungi mai repede unde vrei”.
- Recomandă doar ce are legătură cu ce ți-a spus ea că vrea.
- Explică de ce: ce face în plus și cum se leagă de rezultatul ei.
- O singură recomandare, nu o listă.
## Combinații care au sens
- Grăsime localizată → plus tonifiere (EMS) sau fermitate (radiofrecvență), ca zona să arate și mai fermă.
- Celulită → plus drenaj, ca rezultatul să vină mai repede.
- Facial → întreținere lunară, ca tenul să rămână luminos.
- Epilare pe o zonă → zonele vecine în același pachet.
Toate combinațiile, pe larg: Tratamente → Combinații.
## Ce spui
> Pentru ce vrei tu, ce ar ajuta mult e să combinăm cu [tratament]: [ce face]. Nu e obligatoriu, dar rezultatul vine mai repede.
! Verifică mereu dacă tratamentul e disponibil în orașul clientei (EMS, împachetarea la cald și epilarea doar în Timișoara, cavitația 1+1 doar în Arad).
`) },
    { id: 'c-vanzare', title: 'Vânzarea din cabină: seria următoare', summary: 'Tu vezi zona și ai încrederea ei. Recomandarea ta valorează cel mai mult.',
      body: L(`
Clienta are cea mai mare încredere în cosmeticiana care o tratează. Ce spui tu în cabină contează mai mult decât orice reclamă.
1. Spre finalul ședinței, spune-i ce ai observat și cum a reacționat zona.
2. Spune-i planul: câte ședințe mai sunt până la rezultatul pe care l-a spus ea și la ce interval.
3. Recomandă o singură combinație, doar dacă o ajută (vezi Pachete și recomandări suplimentare).
4. Condu-o la recepție și spune-i recepționerei, de față cu clienta, ce ședință urmează și când.
## Ce spui
> Zona a răspuns foarte bine azi. Ca să ajungi la ce mi-ai spus, [rezultatul ei], ne mai trebuie [număr] ședințe, la [interval]. Hai să-ți rezervăm acum următoarea, să ai locul sigur.
## La recepție, de față cu clienta
> [Recepționera], [clienta] continuă cu [tratament], următoarea ședință în [interval]. Îi găsești un loc?
! Dacă clienta a cumpărat un pachet sau un tratament în plus la recomandarea ta, la încasare se bifează „Upsell efectuat” cu valoarea vândută. Comisionul tău: valoarea minus 60% cheltuieli, apoi 10% din rest (la 3.000 lei, 120 lei). Devine oficial după aprobarea administratorului.
`) },
    { id: 'v-recomandari', title: 'Recenzii și recomandări', summary: 'Cea mai ieftină clientă nouă e prietena unei cliente mulțumite.',
      body: L(`
Când clienta e mulțumită, e momentul să ceri două lucruri: o recenzie și o recomandare.
## Când ceri
- Când îți spune că e mulțumită sau când vede o diferență.
- Niciodată când a avut o problemă nerezolvată.
## Recenzia Google
> Mă bucur mult că îți place! Ne-ar ajuta enorm o recenzie pe Google, durează un minut. Îți trimit linkul pe WhatsApp?
## Recomandarea
> Ai vreo prietenă sau soră care s-ar bucura și ea de o consultație gratuită? Îi fac eu programarea, doar spune-mi numele ei.
`) },
    { id: 'v-reguli', title: 'Ce nu spunem niciodată', summary: 'Regulile care ne feresc de reclamații, de Meta și de cliente dezamăgite.',
      body: L(`
! Garanția banilor înapoi există doar la epilarea laser. La celelalte tratamente nu promitem garanție.
- Nu promitem centimetri, kilograme sau „rezultat garantat” la tratamentele corporale și faciale.
- Nu spunem nimic urât despre corpul sau fața clientei. Vorbim despre ce își dorește ea, nu despre ce „are greșit”.
- Nu negociem prețul și nu inventăm reduceri. Ofertele sunt cele din Consultația.
- Nu vorbim urât de alte clinici.
- Nu dăm sfaturi medicale. La boli, sarcină sau tratamente medicale, recomandăm să întrebe medicul.
- Nu folosim poze cu clientele fără acordul lor scris.
`) },
  ],
};

const CABINA = {
  id: 'cabina', area: 'tratamente', roles: ['cosmetician'], icon: 'sparkles',
  title: 'În cabină',
  lede: 'Ce se întâmplă de când clienta intră în cabină până pleacă. Pentru cosmeticiene.',
  chapters: [
    { id: 'c-inainte', title: 'Înainte de tratament: fișa și siguranța', summary: 'Fișa completată, contraindicațiile verificate, clienta liniștită.',
      body: L(`
1. Verifică fișa clientei (De printat). La prima vizită o completează și o semnează.
2. Întreabă de contraindicații: sarcină sau alăptare, stimulator cardiac sau implanturi metalice în zonă, boli de piele active în zonă, tratamente recente (laser, peeling, injectabile), medicamente care sensibilizează pielea. Lista completă e în schema fiecărui tratament.
3. Dacă ai orice dubiu: nu faci tratamentul și ceri părerea managementului sau a medicului.
4. Fotografii înainte doar cu acordul clientei, în aceleași condiții de lumină și poziție.
! Siguranța clientei e mai importantă decât orice vânzare. Când nu ești sigură, nu faci.
## Ce spui
> Înainte să începem, îți pun câteva întrebări scurte, ca să fiu sigură că tratamentul e potrivit pentru tine.
`) },
    { id: 'c-explici', title: 'Cum explici tratamentul pe limba ei', summary: 'O propoziție simplă pentru fiecare tratament, ca să înțeleagă și să aibă încredere.',
      body: L(`
Explică în cuvinte simple: ce face, ce simte, când vede diferența. Fără termeni tehnici.
## Liposonix
> Ultrasunetele ajung în stratul de grăsime fără să afecteze pielea. Celulele de grăsime din zonă se distrug, iar corpul le elimină singur în săptămânile următoare.
## HIFU
> Energia ajunge în straturile adânci ale pielii și o face să se strângă. Apoi se formează colagen nou, așa că pielea arată mai fermă din ce în ce mai mult, în următoarele luni.
## Radiofrecvență
> Încălzește pielea în profunzime, ca să se strângă și să producă colagen. Se simte ca o căldură plăcută.
## EMS (tonifiere)
> Face mușchiul să se contracte de foarte multe ori, mult mai mult decât la sală. Tu stai întinsă, mușchiul lucrează.
## Cavitație
> Ultrasunete care lucrează pe depozitele de grăsime din zonă. Se simte o vibrație și uneori un sunet ușor în ureche.
## Epilare laser
> Lumina laserului ajunge la rădăcina firului și o oprește să mai crească. De aceea e nevoie de mai multe ședințe: firele cresc în etape.
## Presoterapie (drenaj)
> Manșoanele se umflă pe rând, de la gleznă în sus, și împing lichidele spre ganglioni. Picioarele se simt mult mai ușoare.
## Facial Restart
> Curățăm în profunzime, exfoliem blând și hidratăm. Tenul arată odihnit și luminos chiar de la prima ședință.
`) },
    { id: 'c-protocol', title: 'În timpul tratamentului', summary: 'Protocolul aparatului, confortul clientei și ce îi spui pe parcurs.',
      body: L(`
1. Urmează schema tratamentului (Scheme de tratament): pașii, setările, zonele. Nu improviza.
2. Spune-i înainte ce urmează să simtă.
3. Întreab-o din când în când cum se simte și ajustează intensitatea dacă e nevoie.
4. Ține conversația ușoară. E un moment bun să afli mai multe despre ce își dorește (ajută la planul următor).
! Parametrii aparatului se aleg după manualul producătorului și după tipul de piele, nu după dorința clientei de „mai tare”.
## Ce spui
> Acum o să simți [senzația]. Dacă e prea mult, îmi spui și reglez imediat.
`) },
    { id: 'c-dupa', title: 'După tratament', summary: 'Recomandări clare, puține și scrise, ca rezultatul să fie cel mai bun.',
      body: L(`
1. Spune-i 2-3 recomandări, nu 10. Simplu.
2. Trimite-i-le și pe WhatsApp, ca să nu le uite.
3. Spune-i ce e normal să simtă (roșeață ușoară, căldură) și când să ne scrie.
## Recomandări generale (adaptează după tratament)
- Bea multă apă în zilele următoare (mai ales după tratamentele corporale).
- Evită soarele direct și saunele 48 de ore după tratamentele de față și laser.
- Folosește SPF zilnic după tratamentele de ten.
- Mișcare ușoară, plimbări, ajută rezultatul la tratamentele corporale.
## Ce spui
> Ce e normal: [senzația]. Dacă apare ceva ce te îngrijorează, scrie-mi direct. Îți trimit acum recomandările pe WhatsApp.
`) },
    { id: 'c-igiena', title: 'Igienă și cabina', summary: 'Cabina curată e prima dovadă de profesionalism pe care o vede clienta.',
      body: L(`
1. Dezinfectează aparatul, piesele de mână și suprafețele după fiecare clientă.
2. Prosoape și consumabile curate pentru fiecare clientă.
3. Cabina aerisită și ordonată înainte să intre următoarea.
4. Consumabile pe terminate: anunță managementul din timp.
! Nu folosești un aparat care pare defect. Îl oprești și anunți imediat managementul.
`) },
  ],
};

module.exports = { APEL, PROGRAMARE, VANZARI, CABINA };
