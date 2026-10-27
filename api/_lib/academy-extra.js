// Traininguri, the parts beyond the three manuals (api/_lib/academy.js): the Consultația manual (from the
// owner's "Ghid de utilizare · Program recomandat și oferte financiare"), a short test after every chapter,
// the list prices the offer calculator uses (centrul360.com/preturi), one sheet per treatment ("Scheme de
// tratament"), the combinations that make sense, practice cases and the first-week path for a new hire.
//
// Schemes, combinations and cases are DRAFTS until the owner marks them checked ("Verificat"): only then
// does the team see them. Device settings are never written here; the clinic fills them in.
// Contraindications come from the clinic's own client sheets (De printat).

const L = (s) => s.trim().split('\n').map((x) => x.trim()).filter(Boolean);

// ------------------------------------------------------------------ Consultația (for cosmeticians)
const CONSULTATIE = {
  id: 'consultatie', area: 'vanzari', roles: ['cosmetician'],
  title: 'Consultația',
  icon: 'listCheck',
  lede: 'Programul recomandat și cele 4 oferte, pas cu pas, cum le prezinți și cum le calculezi. Pentru cosmeticiene.',
  chapters: [
    {
      id: 'k-flux', title: 'Fluxul consultației, pas cu pas', summary: 'Opt pași, în aceeași ordine, de la salut până la oferta pe care o semnează.',
      body: L(`
Folosești documentul „Program recomandat și ofertă” (De printat). Are 5 pagini. Pagina 1 e programul recomandat și rămâne la clientă, capsată de fișa ei. Paginile 2-5 sunt ofertele, de la cea mai avantajoasă ca reducere la cea mai accesibilă ca sumă.
1. Completezi sus: Client, Data consultației și Specialist. (pagina 1)
2. Afli ce o deranjează și scrii obiectivul ei în caseta Obiectiv, cu cuvintele ei. (pagina 1)
3. Scrii tratamentele recomandate, câte o linie pentru fiecare procedură: zona, numărul de ședințe, intervalul, prețul de listă pe ședință și subtotalul. (pagina 1)
4. Completezi durata estimată și rezultatul estimat. Capsezi pagina 1 de fișa de client. (pagina 1)
5. Prezinți prima ofertă: pachetul complet, plata integrală. Îi dai doar această pagină. (pagina 2)
6. Dacă nu îi convine, iei pagina înapoi și îi dai oferta cu plata în 4 tranșe. (pagina 3)
7. Dacă nici asta nu îi convine, propui jumătate din pachet, cu plata integrală. (pagina 4)
8. Dacă nu, aceeași jumătate de pachet, cu plata în 4 tranșe. (pagina 5)
! Un singur exemplar pe masă. Nu arăți și nu pomenești paginile următoare. Clienta trebuie să se gândească serios la oferta pe care o are în față.
## Cum vorbești la pașii 1-2
Discuția de la început e cea din Manualul de vânzări → „Consultația gratuită, pas cu pas” și „Întrebările care vând”. Întâi asculți, abia apoi scrii programul.
## Calculatorul de ofertă
În Traininguri → Calculator ofertă scrii tratamentele și ședințele, iar portalul îți calculează totalul și toate cele 4 oferte. Îl poți folosi și la masă, pe tabletă.
`),
    },
    {
      id: 'k-program', title: 'Pagina 1: programul recomandat', summary: 'Ce scrii pe fiecare linie, cum calculezi totalul și minimul pentru corp și față.',
      body: L(`
Pagina 1 e planul clientei. O completezi cu ea de față și i-o explici pe rând.
## Obiectiv
Scrii ce vrea ea, cu cuvintele ei: „Vreau să mă simt bine în costum de baie vara asta.”
## Tratamente recomandate
- O linie pentru fiecare procedură.
- Zona: abdomen, coapse, față, gușă.
- Numărul de ședințe și intervalul dintre ele.
- Prețul de listă pe ședință, de pe centrul360.com (îl ai și în Calculator ofertă).
- Subtotal = ședințe × preț de listă.
- Total la preț de listă = suma subtotalurilor.
## Minimul programului
! Program pentru corp: totalul la preț de listă, înainte de reducere, e de minimum 9.500 lei.
! Program pentru față: minimum 4.000 lei.
Excepție: clienta cu foarte puțină grăsime. Atunci recomanzi mai puține proceduri și totalul poate fi mai mic. Nu îi vinzi ce nu îi trebuie.
## Durata și rezultatul
- Durata estimată: cât ține tot programul, din numărul de ședințe și intervale.
- Rezultatul estimat: ce poate să vadă, spus simplu. Rezultatele sunt estimate, nu garantate.
> De obicei, după programul ăsta clientele văd [rezultatul]. La fiecare e puțin diferit, așa că urmărim împreună cum răspunde corpul tău.
`),
    },
    {
      id: 'k-oferte', title: 'Cele 4 oferte, pe rând', summary: 'Ce oferi pe fiecare pagină, cu ce reducere și cum o calculezi.',
      body: L(`
Ofertele vin în ordine. Treci la următoarea doar dacă cea de acum nu îi convine.
1. Pagina 2: pachetul complet, plată integrală, 50% reducere. Total listă × 0,50.
2. Pagina 3: pachetul complet, 4 tranșe, 30% reducere. Total listă × 0,70, apoi împarți la 4.
3. Pagina 4: jumătate din ședințe, plată integrală, 50% reducere. Total listă al pachetului redus × 0,50.
4. Pagina 5: jumătate din ședințe, 4 tranșe, 30% reducere. Total listă al pachetului redus × 0,70, apoi împarți la 4.
## Ce spui la pagina 2
> Ăsta e programul care te duce la [obiectivul ei]. La preț de listă ar fi [total]. Dacă plătești azi integral, ai 50% reducere, deci [suma].
## Dacă nu îi convine
Iei pagina înapoi și îi dai următoarea. Nu le pui una lângă alta.
> Te înțeleg. Avem și varianta în 4 tranșe: [suma pe tranșă], plătești la ședințe.
## Pachetul redus
Jumătate din ședințele fiecărei proceduri, fără rotunjire: 3 ședințe devin 1,5.
`),
    },
    {
      id: 'k-reguli', title: 'Regulile ofertei', summary: 'Ce trebuie respectat la fiecare ofertă, ca să nu existe neînțelegeri.',
      body: L(`
- Oferta e valabilă doar în ziua consultației.
- Procentul de reducere îl scrii tu în „Reducere acordată (%)”, apoi calculezi valoarea în lei.
- Programezi toate ședințele pe loc, în tabelul „Programarea ședințelor”.
- La plata în tranșe scrii în „Se achită la” ședința la care se plătește fiecare tranșă (tranșa 2 la ședința 2 și așa mai departe). „Data ședinței” o completezi după programare.
- Pachetul redus: jumătate din ședințele fiecărei proceduri, fără rotunjire. Scrii numărul exact în „Ședințe oferite” (3 devin 1,5).
! Anulare sau reprogramare cu mai puțin de 24 de ore înainte: ședința se consideră efectuată. Spune-i clar asta înainte să semneze.
! Rezultatele sunt estimate, nu garantate. Nu promiți rezultate concrete.
> Încă un lucru important: dacă anulezi sau muți o ședință cu mai puțin de 24 de ore înainte, ședința se consideră făcută. Așa ținem locul doar pentru tine.
`),
    },
    {
      id: 'k-exemplu', title: 'Exemplu de calcul', summary: 'Un program pentru abdomen, calculat pe toate cele 4 pagini.',
      body: L(`
Obiectiv: grăsimea de pe abdomen. EMS și împachetarea la cald sunt doar în Timișoara.
## Programul (prețuri de listă pe ședință)
- Cavitație: 8 ședințe × 280 = 2.240 lei (jumătate: 4 ședințe, 1.120 lei)
- EMS: 8 ședințe × 250 = 2.000 lei (jumătate: 4 ședințe, 1.000 lei)
- Împachetare la cald: 8 ședințe × 190 = 1.520 lei (jumătate: 4 ședințe, 760 lei)
- Liposonix: 6 ședințe × 640 = 3.840 lei (jumătate: 3 ședințe, 1.920 lei)
Total listă: 9.600 lei. Pachetul redus: 4.800 lei.
## Ofertele
1. Pagina 2, plată integrală: 9.600 × 0,50 = 4.800 lei.
2. Pagina 3, 4 tranșe: 9.600 × 0,70 = 6.720 lei, adică 1.680 lei pe tranșă.
3. Pagina 4, ½ pachet, integral: 4.800 × 0,50 = 2.400 lei.
4. Pagina 5, ½ pachet, 4 tranșe: 4.800 × 0,70 = 3.360 lei, adică 840 lei pe tranșă.
Același calcul îl face Calculatorul de ofertă, pe orice program.
`),
    },
    {
      id: 'k-semnare', title: 'Înainte de semnare: verifică', summary: 'Lista de verificat înainte ca ea și tu să semnați.',
      body: L(`
1. La programele pentru corp, totalul la preț de listă e de minimum 9.500 lei (sau e un caz cu foarte puțină grăsime). La față, minimum 4.000 lei.
2. Toate câmpurile paginii sunt completate: reducerea în %, reducerea în lei, totalul de plată.
3. Programarea ședințelor e completată.
4. La plata în tranșe: coloana „Se achită la” și valoarea fiecărei tranșe sunt completate.
5. Clienta a citit condițiile și a semnat. Semnezi și tu.
6. Pagina 1 și pagina acceptată sunt capsate de fișa de client. Un exemplar rămâne la centru, o copie primește clienta.
`),
    },
  ],
};

// ------------------------------------------------------------------ tests (3 questions per chapter)
// [question, [options], index of the right one, why]
const Q = (q, options, answer, why) => ({ q, options, answer, why });
const QUIZ = {
  't-principiu': [
    Q('Care e obiectivul apelului?', ['Să vinzi pachetul', 'O programare confirmată la o singură ședință, fără avans', 'Să trimiți oferta pe WhatsApp'], 1, 'Pachetul îl recomandă specialista, în salon.'),
    Q('Ce verifici înainte să suni?', ['Două ore libere concrete în următoarele 72 de ore, în orașul ei', 'Prețul pachetelor', 'Nimic, suni direct'], 0, '„Vă caut și vă sun eu” pierde clienta.'),
    Q('Nu răspunde. Ce faci în prima zi?', ['Trimiți imediat WhatsApp', 'Trei încercări (imediat, peste 2 ore, între 18 și 19), apoi WhatsApp', 'O treci la Pierdut'], 1, 'Abia după a treia încercare, WhatsApp.'),
  ],
  't-deschidere': [
    Q('Ce NU spui la începutul apelului?', ['Numele ei', 'De unde ne-a lăsat datele', '„Aveți două minute?”'], 2, 'Ceri permisiunea și îi dai un NU gratuit.'),
    Q('Când spui prețul?', ['În primele 30 de secunde', 'După întrebări, la recomandare', 'Doar dacă întreabă de trei ori'], 1, 'Preț primul înseamnă că suni ca o reclamă.'),
    Q('Leadul vine din reclama de pe Instagram. Ce spui?', ['„Ați completat formularul pe site”', '„Ne-ați lăsat datele la un anunț de-al nostru de pe Instagram”', 'Nu spui de unde'], 1, 'Spui platforma reală, din fișă.'),
  ],
  't-diagnostic': [
    Q('Care întrebare e corectă?', ['„Ce vă deranjează când vă uitați în oglindă?”', '„Ce v-ar plăcea să se schimbe?”', '„Aveți multă celulită?”'], 1, 'Întrebi despre ce își dorește, nu despre ce e în neregulă.'),
    Q('Ce faci după fiecare întrebare?', ['Treci imediat la următoarea', 'Taci și numeri până la trei în gând', 'Explici tratamentul'], 1, 'În pauze apar răspunsurile adevărate.'),
    Q('De ce întrebi „decideți singură sau mai vorbiți și acasă?”', ['Ca să afli cât câștigă soțul', 'Ca „trebuie să vorbesc cu soțul” să apară acum, nu la final', 'Nu se întreabă'], 1, 'O afli din timp, nu când e prea târziu.'),
  ],
  't-recomandare': [
    Q('Cum începi recomandarea?', ['„Avem o ofertă”', '„Vă recomand”', '„Avem reduceri mari”'], 1, 'Recomanzi, nu vinzi o ofertă.'),
    Q('Ce vine ultimul în recomandare?', ['Prețul', 'Ce vede după ședință', 'Cât durează'], 0, 'Întâi rezultatul, de ce merge, cât durează, ce i se cere. Prețul la final.'),
    Q('Ce faci imediat după ce spui prețul?', ['Taci și aștepți', 'Spui tot ce intră în preț, pe rând', 'Oferi o reducere'], 1, 'Enumerarea etapelor face mai mult decât orice adjectiv.'),
  ],
  't-inchidere': [
    Q('Clienta întreabă de avans. Ce spui?', ['Că e 50 de lei', 'Că nu e niciun avans: plătește la salon, după tratament', 'Că depinde de tratament'], 1, 'Fără avans e o decizie, o spui ca pe o decizie.'),
    Q('Mai ai 9 locuri săptămâna asta. Ce spui?', ['„Mai am doar 2 locuri”', '„Mai am 9 locuri”', 'Nimic despre locuri'], 1, 'Limitarea e reală, spui cifra reală.'),
    Q('Care e o închidere corectă?', ['„Vreți să vă programez?”', '„Am liber marți la 11:30 sau joi la 17:00”', '„Când ați fi pregătită?”'], 1, 'Două ore concrete, niciodată o întrebare deschisă.'),
  ],
  't-confirmare': [
    Q('Ce faci încă în timpul apelului, ca să vină?', ['Îi trimiți confirmarea pe WhatsApp și aștepți „Confirm”', 'Nimic', 'Îi ceri avans'], 0, 'O acțiune făcută cât e pe fir e cel mai bun semn că vine.'),
    Q('Nu a răspuns la reamintirea de 24 de ore. Ce faci?', ['O suni', 'Ștergi programarea', 'Aștepți să vină'], 0, 'Un apel de un minut costă mai puțin decât un loc gol.'),
    Q('Nu a venit. Cum o suni?', ['Fără reproș, și îi propui altă zi', 'Îi spui că a pierdut locul', 'Nu o mai suni'], 0, 'Cam una din trei se reprogramează dacă apelul e cald.'),
  ],
  't-oferte': [
    Q('Unei cliente din reclame îi spui „masaj facial cadou”?', ['Da', 'Nu, cadoul e doar pentru formularul de pe site', 'Doar dacă ezită'], 1, 'Masajul e un pas din Restart: „urmează masajul facial”.'),
    Q('Când oferi consultația gratuită unei cliente din reclame?', ['De la început', 'După ce a spus „nu” de două ori la ședința de intrare', 'Niciodată'], 1, 'Dacă o oferi prea devreme, nimeni nu mai plătește ședința.'),
    Q('O clientă din Arad vrea Mini Belly. Ce faci?', ['O programezi la Arad', 'Îi spui că Mini Belly e doar în Timișoara', 'Îi faci o reducere'], 1, 'Pachetele cu EMS sunt doar în Timișoara.'),
  ],
  't-obiectii': [
    Q('Care e structura la orice obiecție?', ['O contrazici politicos', 'Accepți, reîncadrezi, închizi din nou', 'Treci peste ea'], 1, 'Niciodată nu lași o obiecție fără o închidere după ea.'),
    Q('„Mă mai gândesc” înseamnă de obicei...', ['Că nu vrea', 'Că ceva nu e clar: o întrebi ce o face să ezite', 'Că revine ea'], 1, 'Afli ce e de fapt și răspunzi la asta.'),
    Q('„Sunt însărcinată.” Ce faci?', ['O programezi la ceva ușor', 'Nu o programezi și îi notezi să o suni mai târziu', 'O chemi la consultație'], 1, 'Vânzarea la care renunți aici aduce recenziile de 5 stele.'),
  ],
  't-interzis': [
    Q('Care e ultima propoziție a apelului?', ['„Vă dorim o zi minunată”', 'Ziua și ora: „Ne vedem marți la 11:30”', '„Mai vorbim”'], 1, 'Ultimul lucru pe care îl aude e programarea.'),
    Q('Poți promite „slăbiți sigur 5 cm”?', ['Da', 'Nu', 'Doar la Liposonix'], 1, 'Spui ce se vede și în cât timp, nu ce garantezi.'),
    Q('Vinzi pachetul mare la telefon?', ['Da, dacă întreabă', 'Nu, îl recomandă specialista în salon', 'Doar cu reducere'], 1, 'La telefon e doar ședința de intrare.'),
  ],
  'v-mentalitate': [
    Q('Ce cumpără de fapt clienta?', ['Ședințe cât mai ieftine', 'Rezultatul pe care și-l dorește', 'Cel mai mic preț din oraș'], 1, 'Nu cumpără ședințe. Cumpără rezultatul: să se simtă bine în haine, să nu se mai ascundă în poze.'),
    Q('Clienta spune „mă mai gândesc”. Ce înseamnă de obicei?', ['Nu are bani deloc', 'Lipsește unul din cele 4 lucruri care o fac să spună DA', 'Nu îi place de tine'], 1, 'Treaba ta e să afli care lipsește și să-l completezi.'),
    Q('Cum vorbești cu clienta?', ['Cu termeni medicali, ca să pari specialistă', 'Simplu, ca între prietene, și întrebi mult despre ea', 'Mult despre noi și despre aparate'], 1, 'Puțin vorbit de noi, mult întrebat despre ea.'),
  ],
  'v-consultatie': [
    Q('Ce faci imediat după primire?', ['Spui prețul', 'Întrebi ce vrea și ce o deranjează', 'Îi arăți aparatele'], 1, 'Întâi asculți. Prețul vine abia după ce știe planul.'),
    Q('Cum închizi consultația?', ['„Vrei să te programez?”', 'Propui o dată: „Când îți vine mai bine?”', 'Îi dai un pliant și aștepți să te sune'], 1, 'Nu întrebi dacă vrea, întrebi când îi vine mai bine.'),
    Q('Când o programezi?', ['Pe loc, în Calendar, înainte să plece', 'A doua zi, când o suni', 'Când îți scrie ea'], 0, 'O consultație fără programare e o consultație pierdută.'),
  ],
  'v-intrebari': [
    Q('De ce pui întrebări în loc să explici?', ['Ca să treacă timpul', 'Clienta se convinge singură când își aude propriile răspunsuri', 'Ca să afli cât câștigă'], 1, 'Tu pui întrebările bune și asculți.'),
    Q('Clienta spune „nu mă mai simt bine în pielea mea”. Ce faci?', ['Treci repede la ofertă', 'Spui „te înțeleg” și o lași să continue', 'Schimbi subiectul'], 1, 'Nu treci repede peste ce simte.'),
    Q('Ce notezi în timp ce asculți?', ['Nimic', 'Două-trei cuvinte de-ale ei, ca să le folosești când îi explici planul', 'Tot, cuvânt cu cuvânt'], 1, 'Cuvintele ei („burtica”, „nunta”) fac planul să sune despre ea.'),
  ],
  'v-pret': [
    Q('Când spui prețul?', ['La început, ca să nu pierzi timpul', 'După ce știe rezultatul și planul', 'Doar dacă întreabă de trei ori'], 1, 'Prețul spus prea devreme sperie.'),
    Q('Ce faci imediat după ce spui prețul?', ['Explici de ce e scump', 'Taci și o lași pe ea să vorbească', 'Oferi o reducere'], 1, 'Prima care vorbește după preț pierde.'),
    Q('Poți face o reducere pe loc, ca să închizi?', ['Da', 'Nu, nu negociem și nu inventăm reduceri', 'Da, dacă plătește cash'], 1, 'Oferta e deja cea mai bună.'),
  ],
  'v-obiectii': [
    Q('„E scump” înseamnă de obicei că...', ['Nu are bani', 'Nu e încă sigură că o să meargă la ea', 'Vrea reducere'], 1, 'Problema e încrederea: arată-i rezultate și explică încă o dată.'),
    Q('Care e regula la orice obiecție?', ['Răspunzi imediat cu argumente', 'Îi dai dreptate, pui o întrebare, apoi răspunzi', 'Treci peste ea'], 1, 'O obiecție e o întrebare la care încă nu a primit răspuns.'),
    Q('Banii chiar sunt problema. Ce faci?', ['Îi faci o reducere', 'Treci la oferta următoare: 4 tranșe, apoi jumătate de pachet', 'O lași să revină luna viitoare'], 1, 'Ofertele sunt cele 4 din Consultația, în ordine. Nu inventezi reduceri.'),
  ],
  'v-inchidere': [
    Q('Clienta zice „te sun eu”. Ce faci?', ['O lași să plece', 'Propui două zile concrete', 'Îi trimiți oferta pe e-mail'], 1, 'Nu lași clienta să plece cu „te sun eu”.'),
    Q('Dacă tot nu se hotărăște?', ['O ștergi din listă', 'Îi lași programul pe hârtie, o suni a doua zi și pui follow-up în Pipeline', 'Îi spui că oferta expiră în 10 minute'], 1, 'Follow-up-ul pus pe loc, ca să nu se piardă.'),
    Q('Câte ședințe programezi la consultație?', ['Doar prima', 'Toate, pe loc', 'Niciuna, le face recepția'], 1, 'Toate ședințele se programează pe loc, respectând intervalele.'),
  ],
  'v-pachete': [
    Q('Ce e o recomandare în plus bună?', ['Să vinzi cât mai mult', 'Ce o ajută să ajungă mai repede la rezultatul ei', 'Toate tratamentele pe care le avem'], 1, 'Recomanzi doar ce are legătură cu ce vrea ea.'),
    Q('Câte recomandări în plus faci?', ['O listă cu tot', 'Una singură', 'Niciuna'], 1, 'O singură recomandare, nu o listă.'),
    Q('Clientă din Arad. Poți să-i propui EMS?', ['Da', 'Nu, EMS e doar la Timișoara', 'Doar sâmbăta'], 1, 'EMS și epilarea doar la Timișoara, cavitația 1+1 doar la Arad.'),
  ],
  'v-recomandari': [
    Q('Când ceri o recenzie?', ['După fiecare ședință, oricum', 'Când e mulțumită sau vede o diferență', 'Când a avut o problemă'], 1, 'Momentul bun e când îți spune că e mulțumită.'),
    Q('Cum ceri o recomandare?', ['„Dă-ne like pe Facebook”', 'Întrebi dacă are o prietenă care s-ar bucura de o consultație gratuită', 'Nu ceri niciodată'], 1, 'Cea mai ieftină clientă nouă e prietena unei cliente mulțumite.'),
    Q('Clienta a avut o problemă nerezolvată. Îi ceri recenzie?', ['Da', 'Nu', 'Doar pe WhatsApp'], 1, 'Niciodată când a avut o problemă nerezolvată.'),
  ],
  'v-reguli': [
    Q('La ce tratament există garanția banilor înapoi?', ['La toate', 'Doar la epilarea laser', 'La Liposonix'], 1, 'La celelalte tratamente nu promitem garanție.'),
    Q('Putem promite „minus 5 cm în talie”?', ['Da, dacă face toate ședințele', 'Nu, nu promitem centimetri sau kilograme', 'Doar la EMS'], 1, 'Rezultatele diferă de la o persoană la alta.'),
    Q('Clienta e însărcinată și întreabă ce poate face. Ce răspunzi?', ['Îi recomanzi ce crezi tu', 'Îi spui să întrebe medicul', 'Îi faci un tratament ușor'], 1, 'Nu dăm sfaturi medicale.'),
  ],
  'p-5min': [
    Q('În cât timp suni un lead nou?', ['În maxim 5 minute', 'În aceeași zi', 'A doua zi dimineață'], 0, 'Peste o oră se gândește deja la altceva.'),
    Q('Leadul nu răspunde. Ce faci în prima zi?', ['Îl treci la Pierdut', 'Mai suni peste 2 ore și între 18 și 19, apoi îi scrii pe WhatsApp', 'Aștepți să sune el'], 1, 'Trei încercări în prima zi, abia apoi WhatsApp.'),
    Q('Cine se sună primul?', ['Leadurile noi', 'Leadurile vechi', 'Cele din Arad'], 0, 'Întâi cele apărute acum.'),
  ],
  'p-telefon': [
    Q('Ce vinzi la telefon?', ['Pachetul complet', 'Consultația, adică venirea la clinică', 'Produse'], 1, 'Tratamentul se vinde la clinică.'),
    Q('Cum propui ora?', ['„Când ai timp?”', 'Două variante concrete', 'Îi trimiți un link'], 1, 'Îți vine mai bine mâine la 17 sau joi la 11?'),
    Q('O clientă din Arad vrea epilare laser. Ce faci?', ['O programezi la Arad', 'Îi spui că epilarea e doar la Timișoara', 'Îi spui să revină peste o lună'], 1, 'Verifici mereu orașul.'),
  ],
  'p-programare': [
    Q('Ce e obligatoriu în orice programare?', ['Telefonul clientei', 'Adresa de e-mail', 'Data nașterii'], 0, 'Fără telefon nu o putem confirma.'),
    Q('Ce regulă de anulare îi spui?', ['Să anunțe cu 24 de ore înainte', 'Nu are regulă', 'Să anunțe cu o săptămână înainte'], 0, 'Ca să dăm locul altcuiva.'),
    Q('E a treia ședință dintr-un pachet deja cumpărat. Ce bifezi?', ['Nimic', '„Ședință din pachet”', 'Confirmată'], 1, 'Așa primește doar reamintirile, fără confirmarea programării și fără cererea de recenzie.'),
  ],
  'p-confirmari': [
    Q('Cine trimite reamintirile de 24 și de 2 ore?', ['Tu, de mână', 'Portalul, singur', 'Cosmeticiana'], 1, 'Tu urmărești cine nu a răspuns.'),
    Q('Nu a răspuns la reamintirea de 24 de ore. Ce faci?', ['O suni', 'Îi anulezi programarea', 'O lași în pace'], 0, 'Un telefon scurt salvează locul.'),
    Q('Nu confirmă și nu răspunde. Ce faci?', ['Ștergi programarea', 'Mai încerci dimineața, nu ștergi', 'Dai locul altcuiva imediat'], 1, 'Nu ștergi programarea fără să mai încerci.'),
  ],
  'p-anulari': [
    Q('Clienta anulează. Care e scopul tău?', ['Să închei repede discuția', 'Să muți programarea în altă zi', 'Să-i explici că pierde bani'], 1, 'De cele mai multe ori nu renunță, doar nu poate atunci.'),
    Q('Nu a venit și nu a anunțat. Cum o suni?', ['Cu reproș', 'Calm, fără reproș, și propui o nouă dată', 'Nu o mai suni'], 1, 'Sper că e totul bine! Vrei să-ți găsesc o altă zi?'),
    Q('Nu vrea să aleagă acum altă zi. Ce faci?', ['Pui follow-up în Pipeline la ziua spusă', 'O treci la Pierdut', 'Nimic'], 0, 'Ca să nu se piardă.'),
  ],
  'p-revenire': [
    Q('Pe cine cauți săptămânal?', ['Clientele care nu au mai venit de peste 30 de zile și nu au programare', 'Doar leadurile noi', 'Clientele care au plătit tot'], 0, 'Sunt cea mai ușoară vânzare.'),
    Q('Ce fel de mesaj le trimiți?', ['Personal, nu de reclamă', 'Oferta zilei', 'Un link'], 0, 'Scrii ca un om care se gândește la ea.'),
    Q('De ce sunt cea mai ușoară vânzare?', ['Ne cunosc deja', 'Au bani mulți', 'Sunt prietene cu noi'], 0, 'Au fost deja la noi și știu cum lucrăm.'),
  ],
  'p-mesaje': [
    Q('Cum scrii mesajele?', ['Ca o firmă, formal', 'Ca un om, simplu și cald', 'Cât mai lung'], 1, 'Copiezi, completezi și trimiți.'),
    Q('După consultație nu s-a programat. Ce îi scrii?', ['Că i-ai ținut locul până mâine la 12', 'Că oferta a expirat', 'Nimic'], 0, 'Îmi spui dacă îl păstrăm?'),
    Q('Când îi scrii „Cum te simți după ședința de ieri?”', ['A doua zi după prima ședință', 'După o lună', 'Niciodată'], 0, 'Arată că ne pasă de ea.'),
  ],
  'c-inainte': [
    Q('Ai un dubiu dacă tratamentul e potrivit. Ce faci?', ['Faci tratamentul mai ușor', 'Nu îl faci și ceri părerea managementului sau a medicului', 'O întrebi pe clientă ce vrea'], 1, 'Când nu ești sigură, nu faci.'),
    Q('Care dintre acestea e o contraindicație de verificat?', ['Sarcina sau alăptarea', 'Culoarea ochilor', 'Vârsta peste 30 de ani'], 0, 'Le verifici pe toate din fișa clientei.'),
    Q('Faci poze înainte fără acordul clientei?', ['Da', 'Nu, doar cu acordul ei', 'Doar la corp'], 1, 'Și le faci în aceeași lumină și poziție.'),
  ],
  'c-explici': [
    Q('Cum explici un tratament?', ['Cu termeni tehnici', 'Simplu: ce face, ce simte, când vede diferența', 'Nu îl explici'], 1, 'Ca să înțeleagă și să aibă încredere.'),
    Q('De ce e nevoie de mai multe ședințe de epilare laser?', ['Firele cresc în etape', 'Aparatul e slab', 'Ca să plătească mai mult'], 0, 'Laserul prinde doar firele care cresc atunci.'),
    Q('Ce simte clienta la radiofrecvență?', ['O căldură plăcută', 'Înțepături de ac', 'Frig'], 0, 'Spune-i dinainte ce o să simtă.'),
  ],
  'c-protocol': [
    Q('Clienta cere „mai tare”. Ce faci?', ['Dai mai tare', 'Parametrii rămân după manualul producătorului și tipul de piele', 'Dublezi timpul'], 1, 'Nu după dorința de „mai tare”.'),
    Q('Ce faci înainte de fiecare etapă?', ['Îi spui ce urmează să simtă', 'Nimic', 'Îi ceri să semneze'], 0, 'Fără surprize, clienta stă liniștită.'),
    Q('În timpul tratamentului...', ['Nu vorbești deloc', 'O întrebi cum se simte și ajustezi dacă e nevoie', 'Răspunzi la telefon'], 1, 'Confortul ei vine primul.'),
  ],
  'c-vanzare': [
    Q('Când vorbești despre seria următoare?', ['Spre finalul ședinței', 'La început', 'Niciodată, e treaba recepției'], 0, 'Tu vezi zona și ai încrederea ei.'),
    Q('Câte combinații recomanzi?', ['Una singură, doar dacă o ajută', 'Trei', 'Toate'], 0, 'O recomandare, legată de rezultatul ei.'),
    Q('Cât e comisionul tău la un upsell de 3.000 lei?', ['300 lei (10% din tot)', '120 lei (minus 60% cheltuieli, apoi 10% din rest)', '60 lei fix'], 1, '3.000 - 60% = 1.200 lei, din care 10% = 120 lei, după aprobarea administratorului.'),
  ],
  'c-dupa': [
    Q('Câte recomandări îi dai după tratament?', ['2-3, simple', '10', 'Niciuna'], 0, 'Puține, clare și scrise.'),
    Q('Cum te asiguri că nu le uită?', ['I le trimiți pe WhatsApp', 'I le spui de două ori', 'Nu e treaba ta'], 0, 'Le are scrise pe telefon.'),
    Q('Ce evită 48 de ore după tratamentele de față și laser?', ['Apa', 'Soarele direct și sauna', 'Somnul'], 1, 'Și folosește SPF zilnic după tratamentele de ten.'),
  ],
  'c-igiena': [
    Q('Când dezinfectezi aparatul și piesele de mână?', ['După fiecare clientă', 'La sfârșitul zilei', 'O dată pe săptămână'], 0, 'Cabina curată e prima dovadă de profesionalism.'),
    Q('Aparatul pare defect. Ce faci?', ['Îl folosești cu grijă', 'Îl oprești și anunți imediat managementul', 'Încerci să-l repari'], 1, 'Nu folosești un aparat care pare defect.'),
    Q('Consumabilele sunt pe terminate. Ce faci?', ['Anunți managementul din timp', 'Aștepți să se termine', 'Le cumperi tu'], 0, 'Din timp, ca să nu rămâi fără în mijlocul zilei.'),
  ],
  'k-flux': [
    Q('Ce faci după ce afli obiectivul clientei?', ['Spui prețul', 'Scrii tratamentele recomandate pe pagina 1', 'Îi dai pagina 2'], 1, 'Întâi programul, apoi ofertele.'),
    Q('Ce ofertă prezinți prima?', ['Plata în 4 tranșe', 'Pachetul complet, plată integrală', 'Jumătate de pachet'], 1, 'Pagina 2 e prima.'),
    Q('Clienta refuză pagina 2. Ce îi dai?', ['Pagina 3: același pachet, în 4 tranșe', 'Pagina 5', 'O reducere în plus'], 0, 'Ofertele vin în ordine, câte una.'),
  ],
  'k-program': [
    Q('Cum calculezi subtotalul unei linii?', ['Ședințe × preț de listă', 'Preț × 0,5', 'Ședințe + preț'], 0, 'Totalul e suma subtotalurilor.'),
    Q('Care e minimul unui program pentru corp, la preț de listă?', ['4.000 lei', '9.500 lei', '1.000 lei'], 1, 'Excepție: clienta cu foarte puțină grăsime.'),
    Q('Și al unui program pentru față?', ['4.000 lei', '9.500 lei', 'Nu are minim'], 0, 'Minimul se aplică programului de pe pagina 1.'),
  ],
  'k-oferte': [
    Q('Totalul de listă e 10.000 lei. Cât plătește integral, pe pagina 2?', ['5.000 lei', '7.000 lei', '10.000 lei'], 0, '10.000 × 0,50 = 5.000 lei.'),
    Q('Totalul de listă e 10.000 lei. Cât e o tranșă pe pagina 3?', ['2.500 lei', '1.750 lei', '1.250 lei'], 1, '10.000 × 0,70 = 7.000 lei, împărțit la 4 = 1.750 lei.'),
    Q('Câte pagini de ofertă are clienta în față odată?', ['Una singură', 'Toate patru', 'Două'], 0, 'Un singur exemplar pe masă.'),
  ],
  'k-reguli': [
    Q('Cât timp e valabilă oferta?', ['O săptămână', 'Doar în ziua consultației', 'O lună'], 1, 'Spune-i asta clar.'),
    Q('În pachetul complet sunt 3 ședințe de cavitație. Câte scrii în pachetul redus?', ['1', '1,5', '2'], 1, 'Jumătate, fără rotunjire.'),
    Q('Clienta anulează cu 10 ore înainte. Ce se întâmplă cu ședința?', ['Se mută gratuit', 'Se consideră efectuată', 'Se dublează'], 1, 'Sub 24 de ore, ședința se consideră efectuată.'),
  ],
  'k-exemplu': [
    Q('Totalul de listă e 9.600 lei. Cât e pe pagina 4 (jumătate de pachet, integral)?', ['2.400 lei', '4.800 lei', '3.360 lei'], 0, 'Pachetul redus 4.800 × 0,50 = 2.400 lei.'),
    Q('Și o tranșă pe pagina 5?', ['840 lei', '1.680 lei', '600 lei'], 0, '4.800 × 0,70 = 3.360 lei, împărțit la 4 = 840 lei.'),
    Q('EMS și împachetarea la cald se fac...', ['În ambele orașe', 'Doar în Timișoara', 'Doar în Arad'], 1, 'Nu le pui în programul unei cliente din Arad.'),
  ],
  'k-semnare': [
    Q('Ce capsezi de fișa de client?', ['Pagina 1 și pagina acceptată', 'Toate paginile', 'Nimic'], 0, 'Un exemplar rămâne la centru, o copie primește clienta.'),
    Q('La plata în tranșe, ce mai completezi?', ['Coloana „Se achită la” și valoarea fiecărei tranșe', 'Numărul cardului', 'Nimic'], 0, 'Tranșa 2 la ședința 2 și așa mai departe.'),
    Q('Cine semnează?', ['Doar clienta', 'Clienta și specialista', 'Managerul'], 1, 'Amândouă, după ce clienta a citit condițiile.'),
  ],
};

// ------------------------------------------------------------------ list prices (per session, centrul360.com/preturi)
// group: fata · corp · epilare; city: both · tm (EMS, împachetarea, epilarea sunt doar în Timișoara)
const P = (id, name, group, price, city, minutes) => ({ id, name, group, price, city: city || 'both', minutes: minutes || 0 });
const PRICES = [
  P('restart', 'Tratament facial Restart', 'fata', 300, 'both', 50),
  P('hidratare', 'Hidratare profundă', 'fata', 350, 'both', 60),
  P('antirid', 'Tratament intensiv antirid', 'fata', 370, 'both', 60),
  P('redness', 'Redness Relief Protocol', 'fata', 300, 'both', 50),
  P('sebum', 'Sebum Off Protocol', 'fata', 420, 'both', 110),
  P('mn-pdrn', 'Microneedling Exozomi PDRN', 'fata', 520, 'both', 60),
  P('mn-ochi', 'Microneedling corector periocular', 'fata', 520, 'both', 30),
  P('hifu-mic', 'HIFU · o zonă mică facială', 'fata', 290, 'both', 20),
  P('hifu-ff', 'HIFU · Full Face', 'fata', 1020, 'both', 90),
  P('rf-mic', 'Radiofrecvență · o zonă mică facială', 'fata', 170, 'both', 15),
  P('rf-ff', 'Radiofrecvență · Full Face', 'fata', 280, 'both', 30),
  P('rfs-gusa', 'RF Sculpt · gușă și contur mandibular', 'fata', 210, 'both', 30),
  P('rfs-ff', 'RF Sculpt · Full Face', 'fata', 350, 'both', 90),
  P('lipo', 'Liposonix · o zonă', 'corp', 640, 'both', 45),
  P('cav', 'Cavitație', 'corp', 280, 'both', 0),
  P('ems-1', 'EMS · o zonă', 'corp', 250, 'tm', 30),
  P('ems-2', 'EMS · 2 zone', 'corp', 390, 'tm', 60),
  P('impachetare', 'Împachetare la cald', 'corp', 190, 'tm', 50),
  P('rf-corp', 'Radiofrecvență · o zonă corporală', 'corp', 280, 'both', 30),
  P('hifu-corp', 'HIFU · o zonă corporală', 'corp', 620, 'both', 50),
  P('epi-fb', 'Epilare · Full Body (axile, inghinal total, brațe, picior lung)', 'epilare', 920, 'tm', 0),
  P('epi-axile', 'Epilare · axile', 'epilare', 120, 'tm', 10),
  P('epi-inghinal', 'Epilare · inghinal total', 'epilare', 220, 'tm', 15),
  P('epi-bikini', 'Epilare · linie bikini', 'epilare', 120, 'tm', 10),
  P('epi-picior-lung', 'Epilare · picior lung', 'epilare', 390, 'tm', 60),
  P('epi-picior-scurt', 'Epilare · picior scurt', 'epilare', 240, 'tm', 20),
  P('epi-brate', 'Epilare · brațe total', 'epilare', 190, 'tm', 25),
  P('epi-antebrate', 'Epilare · antebrațe', 'epilare', 150, 'tm', 15),
  P('epi-fata', 'Epilare · față complet', 'epilare', 200, 'tm', 20),
  P('epi-zona-fata', 'Epilare · o zonă facială (mustață, bărbie, perciuni)', 'epilare', 70, 'tm', 5),
  P('epi-abdomen', 'Epilare · abdomen', 'epilare', 170, 'tm', 15),
  P('epi-linia-alba', 'Epilare · linia albă', 'epilare', 80, 'tm', 5),
  P('epi-spate', 'Epilare · spate integral', 'epilare', 250, 'tm', 25),
  P('epi-lombara', 'Epilare · zona lombară', 'epilare', 160, 'tm', 15),
  P('epi-fese', 'Epilare · fese', 'epilare', 160, 'tm', 10),
  P('epi-maini', 'Epilare · mâini sau laba piciorului', 'epilare', 80, 'tm', 10),
  P('epi-piept', 'Epilare · piept', 'epilare', 150, 'tm', 15),
  P('epi-areole', 'Epilare · areole', 'epilare', 70, 'tm', 5),
  P('epi-labii', 'Epilare · labii sau interfesieri', 'epilare', 90, 'tm', 5),
];

const RULES = { bodyMin: 9500, faceMin: 4000, full: 50, inst: 30, parts: 4 };

// ------------------------------------------------------------------ treatment sheets (drafts until checked)
const C_GENERAL = ['Sarcină sau alăptare.', 'Stimulator cardiac, implanturi metalice sau electronice.', 'Cancer sau tratament oncologic, acum sau în trecut.',
  'Boli autoimune sau imunitate scăzută.', 'Tulburări de coagulare, anticoagulante sau tendință la vânătăi.', 'Boli cronice (diabet, afecțiuni cardiace, renale, hepatice, tiroidiene).'];
const C_BODY = ['Varice, tromboză sau tulburări de circulație.', 'Liposucție sau abdominoplastie în ultimele 6 luni.', 'Hernii sau cicatrici recente în zona tratată.',
  'Infecții sau leziuni ale pielii în zona tratată.', 'Menstruația în desfășurare (pentru unele proceduri).'];
const C_FACE = ['Isotretinoin (Roaccutane) în ultimele 6 luni.', 'Acnee inflamatorie activă, herpes sau infecție în zonă.', 'Expunere solară intensă sau bronz recent.',
  'Retinoizi sau acizi exfolianți în ultimele 7 zile.', 'Fillere sau botox în ultimele 2-4 săptămâni.', 'Piele iritată, arsuri solare sau răni deschise.'];
const C_LASER = ['Soare, solar sau autobronzant în ultimele 4 săptămâni.', 'Tatuaj sau aluniță suspectă în zona de tratat.', 'Herpes activ sau infecție în zonă.',
  'Medicamente care sensibilizează la lumină (unele antibiotice, retinoizi, sunătoare).', 'Isotretinoin în ultimele 6 luni.', 'Ceară sau pensetă în ultimele 4 săptămâni (laserul are nevoie de rădăcina firului).',
  'Epilepsie sau sensibilitate la lumină intensă.'];
const AFTER_BODY = ['Bea multă apă în zilele următoare (cam 2 litri pe zi).', 'Fără saună, baie fierbinte sau soare intens în ziua procedurii.', 'Mișcarea ușoară și plimbările ajută rezultatul.',
  'O ușoară înroșire sau sensibilitate e normală. Dacă nu trece, ne scrie.'];
const AFTER_FACE = ['SPF în fiecare zi.', 'Fără soare direct și saună 48 de ore.', 'Fără produse cu acizi sau retinol câteva zile, dacă nu i-ai spus altfel.',
  'O ușoară roșeață e normală. Dacă nu trece, ne scrie.'];

const S = (o) => Object.assign({ city: 'both', minutes: 0, prices: [], what: '', forWho: [], benefits: [], phone: [], contra: [], steps: [], settings: [], say: [], after: [], sessions: '', interval: '', combos: [], media: [], verified: false }, o, { benefits: BENEFITS[o.id] || [], phone: PHONE[o.id] || [] });
// for reception: what she gets out of it, and how to say it on the phone (the call script's own words where it has them)
const BENEFITS = {
  restart: ['Ten hidratat și luminos chiar din prima ședință.', 'Opt etape într-o oră, cu aparat: ultrasunete și radiofrecvență.', 'Fără ace, fără durere, fără recuperare: își vede de zi imediat.'],
  hidratare: ['Pielea își recapătă apa și elasticitatea.', 'Ten catifelat de la prima ședință.', 'Potrivit înainte de un eveniment.'],
  antirid: ['Liniile fine se văd mai puțin.', 'Pielea se reface și arată mai fermă.', 'Rezultatul crește de la o ședință la alta.'],
  redness: ['Calmează roșeața și pielea reactivă.', 'Potrivit pentru tenul sensibil și cu cuperoză.', 'Lucrează blând, fără iritații.'],
  sebum: ['Pori mai curați și mai puțin vizibili.', 'Mai puțin sebum, mai puține imperfecțiuni.', 'Ten curat, fără să-l mai acopere cu fond de ten.'],
  'mn-pdrn': ['Urmele de acnee se estompează.', 'Textura pielii devine mai fină.', 'Piele mai fermă și mai luminoasă.'],
  'mn-ochi': ['Cearcănele se văd mai puțin.', 'Liniile fine din jurul ochilor se netezesc.', 'Privire mai odihnită.'],
  'hifu-fata': ['Lifting fără bisturiu: pielea se strânge singură.', 'Contur mai clar la gușă și mandibulă.', 'Rezultat progresiv în 2-3 luni, poate ține până la doi ani.'],
  'rf-fata': ['Piele mai fermă.', 'Ridurile fine se văd mai puțin.', 'Senzație plăcută, de căldură.'],
  'rf-sculpt': ['Gușă mai puțin vizibilă, contur mandibular mai clar.', 'Tonus pe toată fața.', 'Împreună cu HIFU, rezultat mai complet.'],
  liposonix: ['Scade grăsimea localizată care nu pleacă nici cu dietă, nici cu sport.', 'Fără incizii, fără anestezie, fără recuperare.', 'Rezultatul se vede în câteva săptămâni.'],
  cavitatie: ['Lucrează pe grăsimea localizată.', 'Fără durere și fără recuperare.', 'Merge foarte bine împreună cu EMS.'],
  ems: ['Mușchi tonifiați, fără efort din partea ei.', 'Abdomen mai ferm, inclusiv după sarcină.', 'Doar 30 de minute pe zonă.'],
  impachetare: ['Picioare mai ușoare, mai puțină apă reținută.', 'Piele mai netedă.', 'Foarte relaxant.'],
  'rf-corp': ['Piele mai fermă pe corp.', 'Celulită mai puțin vizibilă.', 'Senzație plăcută, de căldură.'],
  'hifu-corp': ['Piele mai strânsă pe abdomen, brațe sau coapse.', 'Potrivit după slăbit sau după sarcină.', 'Fără recuperare.'],
  epilare: ['Scapă de păr pe termen lung, din rădăcină.', 'Laser cu diodă, certificat medical.', 'Garanția banilor înapoi.'],
};
const PHONE = {
  restart: ['E o oră, cu opt etape: demachiere, tonifiere, curățare cu ultrasunete, gomaj, radiofrecvență pentru fermitate, masaj facial, o mască aleasă special pentru pielea dumneavoastră și crema de final. Fără ace, fără durere, fără recuperare: ieșiți și vă vedeți de zi.',
    '„Se vede că am făcut ceva?” Se vede că aveți pielea odihnită. Nu se vede că ați fost la salon.',
    '„Trebuie să fac ceva înainte?” Nu. Veniți cum sunteți. Dacă sunteți machiată, vă demachiem noi, e chiar primul pas.'],
  'hifu-fata': ['HIFU înseamnă ultrasunete focalizate. Aparatul trimite energie fix în straturile de sub piele, acolo unde ar lucra un chirurg la un lifting, și le încălzește punctual. Pielea produce colagen nou și se strânge singură în săptămânile următoare.',
    'La suprafață nu se atinge nimic: fără ace, fără tăieturi, fără nimic de vindecat după. Se simte ca niște înțepături calde și scurte.',
    'Rezultatul se vede progresiv, în două-trei luni, și poate ține până la doi ani.'],
  liposonix: ['Liposonix folosește ultrasunete care merg adânc, în stratul de grăsime. Încălzesc punctual celulele de grăsime din zona lucrată, iar corpul le elimină singur, natural, în săptămânile de după.',
    'Nu e o dietă și nu înlocuiește mișcarea: lucrează exact pe grăsimea localizată care nu pleacă nici atunci când slăbiți în rest.',
    'Fără incizii, fără anestezie, fără recuperare. Rezultatul se vede în câteva săptămâni.'],
};
const SCHEMES = [
  S({ id: 'restart', name: 'Tratament facial Restart', group: 'fata', minutes: 60, prices: ['restart'],
    what: 'Tratament facial în 8 etape, cu ultrasunete și radiofrecvență. Tenul arată odihnit și luminos de la prima ședință.',
    forWho: ['Ten obosit, tern sau deshidratat.', 'Prima vizită: e tratamentul de intrare cel mai ușor de ales.', 'Întreținere lunară între curele intensive.'],
    contra: C_GENERAL.concat(C_FACE),
    steps: ['Demachiere.', 'Tonifiere.', 'Curățare cu ultrasunete.', 'Gomaj.', 'Secvență de radiofrecvență.', 'Masaj.', 'Mască personalizată, aleasă după evaluare.', 'Cremă de final.'],
    say: ['Curățăm în profunzime, exfoliem blând și hidratăm. Tenul arată odihnit și luminos chiar de la prima ședință.', 'Acum vine o spatulă care vibrează și scoate impuritățile din pori. Nu se stoarce nimic, majoritatea spun că gâdilă un pic.', 'Radiofrecvența încălzește plăcut straturile mai adânci. Se simte ca o căldură care se plimbă pe față.'],
    after: AFTER_FACE, sessions: '1, apoi întreținere', interval: 'o dată pe lună', combos: ['hidratare', 'antirid'] }),
  S({ id: 'hidratare', name: 'Hidratare profundă', group: 'fata', minutes: 60, prices: ['hidratare'],
    what: 'Reface nivelul de apă al pielii și întărește bariera ei.', forWho: ['Ten uscat, deshidratat sau tras.', 'Înainte de un eveniment, pentru un ten luminos.'],
    contra: C_GENERAL.concat(C_FACE), steps: ['Demachiere și curățare.', 'Exfoliere blândă.', 'Ser și mască hidratantă.', 'Masaj.', 'Cremă și SPF.'],
    say: ['Pielea ta primește înapoi apa pe care a pierdut-o. Se simte mai catifelată chiar de azi.'], after: AFTER_FACE, sessions: '2-4', combos: ['restart', 'mn-pdrn'] }),
  S({ id: 'antirid', name: 'Tratament intensiv antirid', group: 'fata', minutes: 60, prices: ['antirid'],
    what: 'Diminuează ridurile și liniile fine și ajută pielea să se regenereze.', forWho: ['Riduri fine și piele care și-a pierdut din fermitate.'],
    contra: C_GENERAL.concat(C_FACE), steps: ['Demachiere și curățare.', 'Exfoliere.', 'Seruri active anti-age.', 'Mască.', 'Cremă și SPF.'],
    say: ['Lucrăm pe liniile fine și pe fermitate. Rezultatul se adună de la o ședință la alta.'], after: AFTER_FACE, sessions: '4', combos: ['hifu-fata', 'rf-sculpt'] }),
  S({ id: 'redness', name: 'Redness Relief Protocol', group: 'fata', minutes: 50, prices: ['redness'],
    what: 'Calmează roșeața și reechilibrează pielea sensibilă, reactivă sau cu cuperoză.', forWho: ['Ten sensibil, reactiv, cu roșeață sau cuperoză.'],
    contra: C_GENERAL.concat(C_FACE), steps: ['Curățare blândă.', 'Produse calmante.', 'Mască.', 'Cremă și SPF.'],
    say: ['Lucrăm blând, fără să irităm. Pielea se liniștește de la o ședință la alta.'], after: AFTER_FACE, sessions: '4' }),
  S({ id: 'sebum', name: 'Sebum Off Protocol', group: 'fata', minutes: 110, prices: ['sebum'],
    what: 'Reglează sebumul, curăță porii și reduce imperfecțiunile.', forWho: ['Ten gras sau mixt, pori dilatați, imperfecțiuni.'],
    contra: C_GENERAL.concat(C_FACE), steps: ['Demachiere și curățare.', 'Curățare profundă a porilor.', 'Produse care reglează sebumul.', 'Mască.', 'Cremă și SPF.'],
    say: ['Curățăm porii în profunzime și liniștim pielea, ca să producă mai puțin sebum.'], after: AFTER_FACE, sessions: '4-6', combos: ['mn-pdrn'] }),
  S({ id: 'mn-pdrn', name: 'Microneedling Exozomi PDRN', group: 'fata', minutes: 60, prices: ['mn-pdrn'],
    what: 'Microperforații care pornesc regenerarea pielii: urme de acnee, textură și fermitate.', forWho: ['Urme și cicatrici după acnee.', 'Textură neuniformă, pori, lipsă de luminozitate.'],
    contra: C_GENERAL.concat(C_FACE, ['Tendință la cicatrici cheloide.']),
    steps: ['Dezinfectare.', 'Anestezic local, cu timpul de acțiune al produsului.', 'Treceri cu dispozitivul, la adâncimea potrivită zonei.', 'Ser activ.', 'Mască calmantă.'],
    say: ['Facem microperforații foarte fine, iar pielea se reface singură, mai netedă și mai fermă.'],
    after: ['Roșeață 1-2 zile, e normal.', 'Fără soare și machiaj 24-48 de ore.', 'SPF zilnic.'], sessions: '3-6', interval: 'la 4-6 săptămâni', combos: ['sebum', 'hidratare'] }),
  S({ id: 'mn-ochi', name: 'Microneedling corector periocular', group: 'fata', minutes: 30, prices: ['mn-ochi'],
    what: 'Microneedling țintit pe zona ochilor: cearcăne, hidratare și linii fine.', forWho: ['Cearcăne, linii fine în jurul ochilor.'],
    contra: C_GENERAL.concat(C_FACE, ['Tendință la cicatrici cheloide.']), steps: ['Dezinfectare.', 'Anestezic local.', 'Treceri fine în jurul ochilor.', 'Ser activ.', 'Mască calmantă.'],
    say: ['Lucrăm doar pe zona ochilor, foarte fin, ca privirea să arate mai odihnită.'], after: ['Roșeață ușoară 1-2 zile.', 'Fără machiaj 24-48 de ore.', 'SPF zilnic.'], sessions: '3', interval: 'la 4-6 săptămâni' }),
  S({ id: 'hifu-fata', name: 'HIFU față', group: 'fata', minutes: 90, prices: ['hifu-mic', 'hifu-ff'],
    what: 'Ultrasunete focalizate care strâng straturile adânci ale pielii. Colagenul nou face pielea mai fermă în lunile următoare.',
    forWho: ['Piele lăsată ușor sau mediu, contur șters.', 'Gușă, gât, contur mandibular (o zonă mică).'],
    contra: C_GENERAL.concat(C_FACE),
    steps: ['Curățarea tenului.', 'Marcarea zonelor.', 'Gel conductor.', 'Treceri după protocolul aparatului, pe fiecare zonă (frunte, obraji, maxilar, gât).', 'Calmare cu mască sau cremă.'],
    say: ['Energia ajunge în straturile adânci ale pielii și o face să se strângă. Pielea arată tot mai fermă în următoarele luni.', 'Se simte ca niște înțepături calde și scurte.'],
    after: AFTER_FACE, sessions: '1', interval: 'întreținere la 12-18 luni', combos: ['rf-sculpt', 'antirid'] }),
  S({ id: 'rf-fata', name: 'Radiofrecvență față', group: 'fata', minutes: 30, prices: ['rf-mic', 'rf-ff'],
    what: 'Căldură controlată care stimulează colagenul: fermitate și riduri mai puțin vizibile.', forWho: ['Piele care și-a pierdut elasticitatea.', 'Riduri fine.'],
    contra: C_GENERAL.concat(C_FACE), steps: ['Curățare.', 'Gel conductor.', 'Treceri circulare pe zonă, la temperatura recomandată de aparat.', 'Menținerea temperaturii câteva minute pe fiecare zonă.', 'Calmare.'],
    say: ['Încălzește pielea în profunzime, ca să se strângă și să producă colagen. Se simte ca o căldură plăcută.'], after: AFTER_FACE, sessions: '6-8', interval: '1-2 pe săptămână' }),
  S({ id: 'rf-sculpt', name: 'RF Sculpt față', group: 'fata', minutes: 90, prices: ['rfs-gusa', 'rfs-ff'],
    what: 'Radiofrecvență cu masaj modelator: gușă, contur mandibular și tonusul întregii fețe.', forWho: ['Gușă și contur mandibular șters.', 'Față care și-a pierdut tonusul.'],
    contra: C_GENERAL.concat(C_FACE), steps: ['Curățare.', 'Gel conductor.', 'Radiofrecvență pe zonă, la temperatura recomandată de aparat.', 'Masaj modelator.', 'Calmare.'],
    say: ['Căldură plăcută și masaj, ca pielea să se strângă și conturul să se vadă mai bine.'], after: AFTER_FACE, sessions: '6-9', interval: '1-2 pe săptămână', combos: ['hifu-fata'] }),
  S({ id: 'liposonix', name: 'Liposonix', group: 'corp', minutes: 45, prices: ['lipo'],
    what: 'Ultrasunete focalizate care distrug celulele de grăsime din zona tratată. Corpul le elimină singur în săptămânile următoare.',
    forWho: ['Grăsime localizată care nu pleacă cu dietă și sport: abdomen, flancuri, coapse, brațe.'],
    contra: C_GENERAL.concat(C_BODY),
    steps: ['Evaluarea zonei și a stratului de grăsime.', 'Marcarea grilei de tratament.', 'Aplicarea după protocolul aparatului.', 'Hidratarea zonei.'],
    say: ['Ultrasunetele ajung în stratul de grăsime fără să afecteze pielea. Celulele de grăsime se distrug, iar corpul le elimină singur în săptămânile următoare.', 'Nu e o dietă și nu înlocuiește mișcarea. Lucrează pe grăsimea care nu pleacă nici când slăbești în rest.'],
    after: AFTER_BODY, sessions: '', interval: 'minim 8-12 săptămâni pe aceeași zonă', combos: ['ems', 'cavitatie'] }),
  S({ id: 'cavitatie', name: 'Cavitație', group: 'corp', prices: ['cav'],
    what: 'Ultrasunete de joasă frecvență pentru grăsimea localizată și conturul siluetei, fără durere și fără recuperare.',
    forWho: ['Grăsime localizată: abdomen, flancuri, coapse.', 'Celulită, împreună cu alte tratamente.'], contra: C_GENERAL.concat(C_BODY),
    steps: ['Evaluarea zonei.', 'Gel conductor.', 'Lucrul pe zonă după protocolul aparatului.', 'Curățarea și hidratarea zonei.'],
    say: ['Ultrasunete care lucrează pe depozitele de grăsime din zonă. Se simte o vibrație și uneori un sunet ușor în ureche.'],
    after: AFTER_BODY, sessions: '8', combos: ['ems', 'liposonix', 'impachetare'] }),
  S({ id: 'ems', name: 'EMS (tonifiere)', group: 'corp', city: 'tm', minutes: 30, prices: ['ems-1', 'ems-2'],
    what: 'Contracții musculare puternice și controlate: tonifiere, fermitate și zone mai definite.', forWho: ['Abdomen, fese, brațe sau coapse fără tonus.', 'Mușchi abdominali slăbiți după sarcină.'],
    contra: C_GENERAL.concat(C_BODY), steps: ['Poziționarea pe grupele musculare țintă.', 'Program și intensitate care cresc treptat.', 'Ședința propriu-zisă, 30 de minute pe zonă.', 'Hidratare.'],
    say: ['Face mușchiul să se contracte de foarte multe ori, mult mai mult decât la sală. Tu stai întinsă, mușchiul lucrează.', 'Nu doare. Simți contracții ritmice, iar intensitatea o reglăm împreună.'],
    after: AFTER_BODY, sessions: '6-8', interval: '2 pe săptămână', combos: ['cavitatie', 'liposonix', 'impachetare'] }),
  S({ id: 'impachetare', name: 'Împachetare la cald', group: 'corp', city: 'tm', minutes: 50, prices: ['impachetare'],
    what: 'Tratament relaxant și detoxifiant: circulație, drenaj și absorbția ingredientelor active.', forWho: ['Celulită, retenție de apă, picioare grele.', 'Susține tratamentele de remodelare.'],
    contra: C_GENERAL.concat(C_BODY), steps: ['Pregătirea pielii.', 'Aplicarea produsului pe zone.', 'Împachetarea și căldura, după protocol.', 'Îndepărtarea produsului și hidratare.'],
    say: ['Căldura pornește circulația și ajută corpul să elimine lichidele. E și foarte relaxant.'], after: AFTER_BODY, sessions: '6-8', combos: ['ems', 'cavitatie'] }),
  S({ id: 'rf-corp', name: 'Radiofrecvență corp', group: 'corp', minutes: 30, prices: ['rf-corp'],
    what: 'Căldură controlată care stimulează colagenul: fermitate, celulită și depozite mici de grăsime.', forWho: ['Piele lăsată pe abdomen, brațe, coapse.', 'Celulită.'],
    contra: C_GENERAL.concat(C_BODY), steps: ['Curățare.', 'Gel conductor.', 'Treceri circulare pe zonă, la temperatura recomandată de aparat.', 'Menținerea temperaturii câteva minute.', 'Calmare.'],
    say: ['Încălzește pielea în profunzime, ca să se strângă. Se simte ca o căldură plăcută.'], after: AFTER_BODY, sessions: '6-8', interval: '1-2 pe săptămână', combos: ['cavitatie', 'liposonix'] }),
  S({ id: 'hifu-corp', name: 'HIFU corp', group: 'corp', minutes: 50, prices: ['hifu-corp'],
    what: 'Ultrasunete focalizate pentru fermitate pe corp: abdomen, brațe, coapse, genunchi.', forWho: ['Piele lăsată pe corp, după slăbit sau după sarcină.'],
    contra: C_GENERAL.concat(C_BODY), steps: ['Curățarea zonei.', 'Marcare.', 'Gel conductor.', 'Treceri după protocolul aparatului.', 'Hidratare.'],
    say: ['Energia strânge straturile adânci, iar pielea devine mai fermă în lunile următoare.'], after: AFTER_BODY, sessions: '1-2', combos: ['ems', 'rf-corp'] }),
  S({ id: 'epilare', name: 'Epilare laser Elysion Pro', group: 'epilare', city: 'tm', prices: ['epi-fb', 'epi-axile', 'epi-inghinal', 'epi-picior-lung'],
    what: 'Laser cu diodă care oprește firul să mai crească, din rădăcină.', forWho: ['Păr nedorit pe orice zonă, la fototip și păr compatibile.'],
    contra: C_GENERAL.concat(C_LASER),
    steps: ['Verifici tenul și firul (fototip, culoare, grosime).', 'Setezi parametrii după tipul de piele și zonă.', 'La prima ședință, test pe o porțiune mică.', 'Treceri după protocol.', 'Gel calmant după.'],
    say: ['Lumina laserului ajunge la rădăcina firului și o oprește să mai crească. Firele cresc în etape, de aceea sunt mai multe ședințe.', 'Simți o căldură scurtă, ca o înțepătură ușoară.'],
    after: ['Fără soare direct și solar 2 săptămâni, SPF zilnic.', 'Fără ceară sau pensetă între ședințe, doar aparat de ras.', 'Gel calmant dacă pielea e caldă.'], sessions: '6-8', interval: 'la 4-6 săptămâni' }),
];

// combinations from the clinic's own packages (when, in what order and how far apart: the clinic fills in)
const CB = (id, a, b, why, packs) => ({ id, a, b, why, packs, sameDay: '', order: '', gap: '', verified: false });
const COMBOS = [
  CB('cav-ems', 'cavitatie', 'ems', 'Cavitația lucrează pe grăsime, EMS pe mușchi. Zona devine mai mică și mai fermă.', 'Oferta Cavitație + EMS (Timișoara), Celulită 360, Abdomen 360'),
  CB('lipo-ems', 'liposonix', 'ems', 'Liposonix scade grăsimea, EMS tonifică mușchiul de sub ea.', 'Mini Belly, Abdomen 360'),
  CB('lipo-cav', 'liposonix', 'cavitatie', 'Două tratamente pe grăsime, pe straturi și cu ritmuri diferite.', 'Abdomen 360'),
  CB('ems-imp', 'ems', 'impachetare', 'EMS tonifică, împachetarea ajută drenajul și circulația.', 'Detox'),
  CB('cav-imp', 'cavitatie', 'impachetare', 'Grăsimea scade, iar împachetarea ajută corpul să elimine.', 'Exemplul din ghidul consultației'),
  CB('hifu-rfs', 'hifu-fata', 'rf-sculpt', 'HIFU strânge în profunzime, RF Sculpt lucrează la suprafață și pe contur.', 'Mini Gușă, Gușă 360, Lifting 360, Mini Lifting, oferta HIFU + RF Sculpt'),
  CB('rf-cav', 'rf-corp', 'cavitatie', 'Grăsime mai puțină și piele mai fermă pe aceeași zonă.', 'Recomandarea din Manualul de vânzări: grăsime localizată plus fermitate'),
  CB('sebum-mn', 'sebum', 'mn-pdrn', 'Întâi se liniștește pielea, apoi microneedling-ul lucrează pe urme.', 'Ten problematic, apoi urme de acnee'),
];

// ------------------------------------------------------------------ practice cases (drafts until checked)
// options: what she could recommend (one right); program: the right plan, at list prices (calculator lines)
const O = (text, ok, why) => ({ text, ok: !!ok, why });
const line = (price, sessions, zone, interval) => ({ price, sessions, zone: zone || '', interval: interval || '' });
const K = (o) => Object.assign({ city: 'both', profile: [], wants: '', ask: [], options: [], program: [], low: false, duration: '', result: '', present: [], watch: [], media: [], verified: false }, o);
const CASES = [
  K({ id: 'caz-abdomen-tm', title: '34 de ani, burtica de după sarcină', group: 'corp', city: 'tm',
    profile: ['Are doi copii, cel mic are 2 ani.', 'Merge la sală de două ori pe săptămână și mănâncă destul de atent.', 'Are grăsime pe abdomen care nu pleacă și mușchii abdominali slăbiți după sarcini.'],
    wants: 'Vrea să se simtă bine în costum de baie vara asta.',
    ask: ['Ce zonă te deranjează cel mai mult?', 'De cât timp și ce ai încercat până acum?', 'Ai o dată anume în minte?', 'Ai avut cezariană sau vreo operație în zonă? Când?'],
    options: [O('Cavitație 8 + EMS 8 + Împachetare la cald 8 + Liposonix 6, pe abdomen', true, 'Lucrează pe grăsime (Liposonix, cavitație), pe mușchi (EMS) și pe circulație (împachetare). Totalul de listă trece de 9.500 lei.'),
      O('Doar Liposonix, o ședință', false, 'O ședință nu o duce la rezultatul dorit și nu lucrează pe mușchii slăbiți.'),
      O('Tratament facial Restart, ca să înceapă cu ceva ieftin', false, 'Nu are legătură cu ce vrea ea.')],
    program: [line('cav', 8, 'abdomen'), line('ems-1', 8, 'abdomen'), line('impachetare', 8, 'abdomen'), line('lipo', 6, 'abdomen')],
    duration: 'Aproximativ 3 luni', result: 'Abdomen mai plat și mai ferm. Rezultatul diferă de la o persoană la alta.',
    present: ['Pentru ce mi-ai spus, ca să te simți bine în costum de baie, eu aș lucra pe trei lucruri: grăsimea, mușchiul și circulația.'],
    watch: ['Cicatrice recentă de cezariană sau hernie: verifică fișa.', 'EMS și împachetarea sunt doar în Timișoara.'] }),
  K({ id: 'caz-abdomen-ar', title: '41 de ani, grăsime pe abdomen și flancuri, din Arad', group: 'corp', city: 'ar',
    profile: ['Lucrează la birou, stă mult pe scaun.', 'A slăbit 6 kg anul trecut, dar abdomenul și flancurile au rămas.'],
    wants: 'Vrea să încapă din nou în blugii preferați.',
    ask: ['Ce zone te deranjează?', 'Ce ai încercat până acum?', 'Cât de des poți veni?'],
    options: [O('Liposonix 8 + Cavitație 10 + Radiofrecvență corporală 6', true, 'Toate se fac în Arad. Grăsimea scade, pielea rămâne fermă. Totalul trece de 9.500 lei.'),
      O('Același program ca la Timișoara, cu EMS și împachetare', false, 'În Arad nu avem EMS și împachetare la cald.'),
      O('Liposonix 2 ședințe și gata', false, 'Totalul e sub 9.500 lei fără motiv, iar clienta are grăsime pe două zone.')],
    program: [line('lipo', 8, 'abdomen și flancuri'), line('cav', 10, 'abdomen și flancuri'), line('rf-corp', 6, 'abdomen')],
    duration: 'Aproximativ 3-4 luni', result: 'Talie mai subțire și abdomen mai ferm. Rezultatul diferă de la o persoană la alta.',
    present: ['Pentru blugii tăi, aș lucra pe grăsime cu Liposonix și cavitație, iar la final cu radiofrecvență, ca pielea să rămână fermă.'],
    watch: ['În Arad nu avem EMS și împachetare la cald. Nu le promite.'] }),
  K({ id: 'caz-riduri-50', title: '52 de ani, riduri și piele lăsată pe față', group: 'fata',
    profile: ['Pielea și-a pierdut din fermitate, conturul feței s-a șters.', 'Are riduri pe frunte și în jurul ochilor.', 'Nu vrea operație sau ace.'],
    wants: 'Vrea să arate mai odihnită și mai fermă, fără operație.',
    ask: ['Ce te deranjează cel mai mult când te uiți în oglindă?', 'Ai făcut fillere sau botox? Când?', 'Ce folosești pe ten acasă?'],
    options: [O('HIFU Full Face 1 + RF Sculpt Full Face 6 + Tratament antirid 4', true, 'HIFU strânge în profunzime, RF Sculpt și antirid lucrează pe tonus și pe riduri. Totalul trece de 4.000 lei.'),
      O('Sebum Off Protocol', false, 'E pentru ten gras și acneic, nu pentru fermitate.'),
      O('O singură ședință de RF Sculpt', false, 'Prea puțin pentru ce vrea ea și sub minimul de 4.000 lei.')],
    program: [line('hifu-ff', 1, 'față'), line('rfs-ff', 6, 'față'), line('antirid', 4, 'față')],
    duration: 'Aproximativ 2-3 luni', result: 'Piele mai fermă și contur mai clar, din ce în ce mai vizibil în lunile următoare. Rezultatul diferă de la o persoană la alta.',
    present: ['HIFU lucrează în profunzime și efectul crește în următoarele 2-3 luni. Între timp, RF Sculpt și tratamentul antirid lucrează pe tonus și pe riduri.'],
    watch: ['Fillere sau botox în ultimele 2-4 săptămâni: verifică fișa.', 'Spune-i de la început că rezultatul HIFU vine treptat.'] }),
  K({ id: 'caz-gusa', title: '45 de ani, gușă și contur mandibular șters', group: 'fata',
    profile: ['Greutate normală, dar are gușă de câțiva ani.', 'Se vede mai ales în pozele din profil.'],
    wants: 'Vrea un contur al feței mai clar în poze.',
    ask: ['De când te deranjează?', 'Te deranjează doar gușa sau și restul feței?'],
    options: [O('HIFU pe gușă 6 + RF Sculpt gușă și contur 12', true, 'HIFU strânge în profunzime, RF Sculpt modelează conturul. Totalul trece de 4.000 lei.'),
      O('Liposonix pe gușă', false, 'Liposonix e pentru corp.'),
      O('Microneedling periocular', false, 'Lucrează pe zona ochilor, nu pe gușă.')],
    program: [line('hifu-mic', 6, 'gușă'), line('rfs-gusa', 12, 'gușă și contur mandibular')],
    duration: 'Aproximativ 3 luni', result: 'Contur mandibular mai definit și gușă mai puțin vizibilă. Rezultatul diferă de la o persoană la alta.',
    present: ['Aș lucra pe două lucruri: HIFU strânge pielea în profunzime, iar RF Sculpt modelează conturul.'], watch: ['Verifică fișa pentru afecțiuni tiroidiene.'] }),
  K({ id: 'caz-acnee', title: '24 de ani, ten gras, acnee și pori dilatați', group: 'fata',
    profile: ['Are acnee de la 16 ani și urme pe obraji.', 'A luat Roaccutane acum doi ani.'],
    wants: 'Vrea un ten curat, fără să-l mai acopere cu fond de ten.',
    ask: ['Ai luat Roaccutane? Când ai terminat?', 'Ce produse folosești acum?', 'Ai acum coșuri inflamate?'],
    options: [O('Sebum Off Protocol 6, apoi Microneedling Exozomi PDRN 3 pentru urme', true, 'Întâi liniștești pielea și reglezi sebumul, apoi lucrezi pe urme. Totalul trece de 4.000 lei.'),
      O('HIFU Full Face', false, 'HIFU e pentru fermitate, nu pentru acnee.'),
      O('Microneedling direct, pe acneea activă', false, 'Acneea inflamatorie activă e contraindicație la microneedling.')],
    program: [line('sebum', 6, 'față'), line('mn-pdrn', 3, 'obraji', 'la 4-6 săptămâni')],
    duration: 'Aproximativ 4 luni', result: 'Mai puține imperfecțiuni și urme mai estompate. Rezultatul diferă de la o persoană la alta.',
    present: ['Întâi liniștim pielea și reglăm sebumul. Abia apoi lucrăm pe urme, ca să nu irităm.'],
    watch: ['Isotretinoin (Roaccutane) în ultimele 6 luni: fără microneedling.', 'Acnee inflamatorie activă: întâi Sebum Off, microneedling-ul după.'] }),
  K({ id: 'caz-celulita-tm', title: '38 de ani, celulită pe coapse și fese', group: 'corp', city: 'tm',
    profile: ['Are celulită de câțiva ani, mai vizibilă vara.', 'Picioarele se simt grele seara.'],
    wants: 'Vrea să poarte pantaloni scurți fără să se gândească la celulită.',
    ask: ['Ai varice sau probleme de circulație?', 'Cât bei apă pe zi?', 'Cât de des poți veni?'],
    options: [O('Cavitație 8 + EMS 2 zone 8 + Împachetare la cald 8 + Radiofrecvență corporală 10', true, 'Lucrează pe grăsime, mușchi, circulație și fermitatea pielii. Totalul trece de 9.500 lei.'),
      O('Doar împachetare la cald 6', false, 'Ajută circulația, dar singură nu lucrează pe celulită și pe fermitate.'),
      O('HIFU Full Face', false, 'Nu are legătură cu ce vrea ea.')],
    program: [line('cav', 8, 'coapse și fese'), line('ems-2', 8, 'coapse și fese'), line('impachetare', 8, 'picioare'), line('rf-corp', 10, 'coapse')],
    duration: 'Aproximativ 3 luni', result: 'Piele mai netedă și picioare mai ușoare. Rezultatul diferă de la o persoană la alta.',
    present: ['Celulita are mai multe cauze, așa că lucrăm pe toate: grăsime, mușchi, circulație și piele.'],
    watch: ['Varice sau tulburări de circulație: verifică fișa.', 'Menstruația poate fi contraindicație pentru unele proceduri: întreab-o.'] }),
  K({ id: 'caz-slaba', title: '29 de ani, slabă, doar puțină grăsime pe flancuri', group: 'corp', low: true,
    profile: ['Greutate mică, face sport.', 'Are o mică zonă de grăsime pe flancuri care o deranjează.'],
    wants: 'Vrea doar să scape de „colăcei”.',
    ask: ['Ce zonă exact te deranjează?', 'Ce sport faci?'],
    options: [O('Program mic: Liposonix 2 + Cavitație 4, chiar dacă totalul e sub 9.500 lei', true, 'Regula are o excepție: clienta cu foarte puțină grăsime. Nu îi vinzi ce nu îi trebuie.'),
      O('Programul complet de 9.500 lei, ca să respecți regula', false, 'Ar plăti pentru tratamente de care nu are nevoie.'),
      O('Îi spui că nu poți face nimic pentru ea', false, 'Putem lucra țintit pe zona mică.')],
    program: [line('lipo', 2, 'flancuri'), line('cav', 4, 'flancuri')],
    duration: 'Aproximativ 1-2 luni', result: 'Flancuri mai fine. Rezultatul diferă de la o persoană la alta.',
    present: ['Tu ai foarte puțin de lucrat, așa că îți recomand un program mic, doar pe flancuri.'], watch: ['Notează în fișă de ce programul e sub minim.'] }),
  K({ id: 'caz-sarcina', title: '31 de ani, însărcinată în 4 luni, vrea Liposonix', group: 'corp',
    profile: ['E însărcinată în 4 luni.', 'A auzit de Liposonix de la o prietenă.'],
    wants: 'Vrea să „prevină” grăsimea pe abdomen.',
    ask: ['Ești însărcinată sau alăptezi? (din fișă)'],
    options: [O('Nu faci tratamentul. Îi spui cu căldură că reveniți după naștere și alăptare și îi pui un follow-up.', true, 'Sarcina și alăptarea sunt contraindicații.'),
      O('Faci o ședință ușoară', false, 'Nu există variantă ușoară: sarcina e contraindicație.'),
      O('Îi recomanzi EMS în loc', false, 'Sarcina e contraindicație și la EMS.')],
    present: ['Acum tu și bebelușul sunteți pe primul loc. Ne vedem după ce termini alăptarea și facem un plan atunci. Îți scriu eu să ne auzim.'],
    watch: ['Sarcina și alăptarea sunt contraindicații pentru tratamentele cu aparat.', 'Pune follow-up în Pipeline, peste câteva luni.'] }),
  K({ id: 'caz-pacemaker', title: '63 de ani, are stimulator cardiac, vrea tonifiere', group: 'corp', city: 'tm',
    profile: ['Are stimulator cardiac de 3 ani.', 'Vrea să-și tonifieze abdomenul.'],
    wants: 'A văzut EMS într-o reclamă.',
    ask: ['Ai stimulator cardiac sau implanturi? (din fișă)'],
    options: [O('Nu faci EMS. Îi explici de ce și o îndrumi să întrebe medicul.', true, 'Stimulatorul cardiac e contraindicație.'),
      O('Faci EMS la intensitate mică', false, 'Nu contează intensitatea: e contraindicație.'),
      O('Faci EMS doar pe picioare', false, 'E contraindicație oricare ar fi zona.')],
    present: ['Pentru siguranța ta, EMS nu e potrivit cu stimulatorul cardiac. Te rog să vorbești cu medicul tău, iar noi îți spunem sincer ce se poate face.'],
    watch: ['Stimulator cardiac, implanturi metalice sau electronice: contraindicație.'] }),
  K({ id: 'caz-arad-ems', title: '36 de ani, din Arad, a văzut EMS în reclamă', group: 'corp', city: 'ar',
    profile: ['Locuiește în Arad.', 'Vrea tonifiere pe abdomen și fese.'], wants: 'Vrea EMS.',
    ask: ['În ce oraș vrei să vii?', 'Poți ajunge și în Timișoara?'],
    options: [O('Îi spui că EMS e doar în Timișoara. Dacă poate ajunge acolo, o programezi la Timișoara. Dacă nu, îi propui ce avem în Arad pentru ce își dorește.', true, 'Orașul se verifică mereu.'),
      O('O programezi la EMS în Arad', false, 'În Arad nu avem EMS.'),
      O('Îi spui că nu avem nimic pentru ea', false, 'Avem alte tratamente în Arad.')],
    present: ['EMS îl avem doar în Timișoara. Dacă poți ajunge acolo, îți găsesc acum un loc. Dacă nu, îți arăt ce avem aici în Arad pentru ce vrei tu.'],
    watch: ['EMS, împachetarea la cald și epilarea laser sunt doar în Timișoara.'] }),
  K({ id: 'caz-epilare', title: '27 de ani, păr închis, piele deschisă, vrea epilare full body', group: 'epilare', city: 'tm',
    profile: ['Păr negru, gros.', 'Piele deschisă la culoare, nu e bronzată.', 'Până acum s-a epilat cu ceară.'],
    wants: 'Vrea să scape de ceară pentru totdeauna.',
    ask: ['Când te-ai epilat ultima dată cu ceară?', 'Ai fost la soare sau la solar în ultima lună?', 'Iei medicamente?'],
    options: [O('Full Body, 6 ședințe la 4-6 săptămâni', true, 'Firele cresc în etape, de aceea e nevoie de 6-8 ședințe la interval.'),
      O('O singură ședință, e definitiv', false, 'Laserul prinde doar firele care cresc atunci.'),
      O('Full Body o dată pe săptămână', false, 'Intervalul e de 4-6 săptămâni.')],
    program: [line('epi-fb', 6, 'full body', 'la 4-6 săptămâni')],
    duration: 'Aproximativ 6-8 luni', result: 'Păr mult mai puțin și mai fin, după toată seria. Rezultatul diferă de la o persoană la alta.',
    present: ['Firele cresc în etape, așa că facem 6 ședințe, la 4-6 săptămâni. Între ședințe, doar aparat de ras, fără ceară.'],
    watch: ['Ceară sau pensetă în ultimele 4 săptămâni: amâni.', 'Soare, solar sau autobronzant în ultimele 4 săptămâni: amâni.', 'Epilarea laser e doar în Timișoara.'] }),
  K({ id: 'caz-ten-tern', title: '47 de ani, ten tern, pete și cearcăne, nuntă peste 2 luni', group: 'fata',
    profile: ['Se mărită fiica ei peste 2 luni.', 'Tenul arată obosit, are pete ușoare și cearcăne.'],
    wants: 'Vrea să arate odihnită și luminoasă la nuntă.',
    ask: ['Când e nunta exact?', 'Ai fost la soare în ultima vreme?', 'Ai mai făcut microneedling?'],
    options: [O('Hidratare profundă 4 + Microneedling PDRN 2 + Microneedling periocular 2 + Restart 2, planificate înainte de nuntă', true, 'Încape în 2 luni, lucrează pe ten, pete și cearcăne. Totalul trece de 4.000 lei.'),
      O('Microneedling PDRN 6 ședințe', false, 'La 4-6 săptămâni interval nu încap 6 ședințe în 2 luni.'),
      O('HIFU pe gușă', false, 'Nu are legătură cu ce vrea ea.')],
    program: [line('hidratare', 4, 'față'), line('mn-pdrn', 2, 'față', 'la 4-6 săptămâni'), line('mn-ochi', 2, 'zona ochilor', 'la 4-6 săptămâni'), line('restart', 2, 'față')],
    duration: '2 luni', result: 'Ten mai luminos și privire mai odihnită. Rezultatul diferă de la o persoană la alta.',
    present: ['Avem 2 luni, așa că planificăm totul înapoi de la ziua nunții, ca pielea să fie liniștită și luminoasă atunci.'],
    watch: ['Planifică ultimele ședințe din timp: după microneedling e normală roșeața 1-2 zile.', 'Expunere solară intensă sau bronz recent: verifică fișa.'] }),
];

// ------------------------------------------------------------------ first-week path, per role
// kind: read (a chapter "m:<manual>/<chapter>" or a treatment sheet "s:<scheme>") · quiz (a chapter's test)
//       · case (a practice case) · task (done by her, confirmed by the owner)
let n = 0;
const it = (kind, ref, text) => ({ id: 'i' + (++n), kind, ref: ref || '', text: text || '' });
const both = (ref) => [it('read', ref), it('quiz', ref)];
const day = (title, items) => ({ title, items: [].concat(...items) });
const PATHS = {
  receptie: [
    day('Bun venit și începutul apelului', [both('m:apel/t-principiu'), both('m:apel/t-deschidere'), both('m:programare/p-5min'), [it('task', '', 'Stai lângă o colegă la recepție și ascultă cel puțin 5 apeluri.'), it('task', '', 'Învață Calendarul, Contactele și Pipeline-ul cu o colegă.')]]),
    day('Întrebările și recomandarea', [both('m:apel/t-diagnostic'), both('m:apel/t-recomandare'), [it('read', 's:restart'), it('task', '', 'Fă 5 apeluri la leaduri, cu o colegă lângă tine.')]]),
    day('Închiderea și confirmarea', [both('m:apel/t-inchidere'), both('m:apel/t-confirmare'), both('m:programare/p-programare'), both('m:programare/p-confirmari'), [it('task', '', 'Urmărește confirmările pentru programările de mâine și sună-le pe cele care nu au răspuns.')]]),
    day('Ofertele și obiecțiile', [both('m:apel/t-oferte'), both('m:apel/t-obiectii'), [it('read', 's:hifu-fata'), it('read', 's:liposonix'), it('read', 's:epilare'), it('task', '', 'Un apel de probă cu managerul: tu ești la recepție, el e clienta.')]]),
    day('Reguli și cliente care revin', [both('m:apel/t-interzis'), both('m:programare/p-anulari'), both('m:programare/p-revenire'), [it('read', 'm:programare/p-mesaje'), it('task', '', 'O zi întreagă singură la recepție, cu verificare la final.')]]),
  ],
  cosmetician: [
    day('Cabina și siguranța', [both('m:cabina/c-inainte'), both('m:cabina/c-igiena'), both('m:cabina/c-explici'), [it('read', 's:restart'), it('task', '', 'Turul cabinei și al aparatelor, cu o colegă.'), it('task', '', 'Asistă la 2 tratamente.')]]),
    day('Tratamentele de corp', [[it('read', 's:liposonix'), it('read', 's:cavitatie'), it('read', 's:ems'), it('read', 's:impachetare'), it('read', 's:rf-corp'), it('task', '', 'Asistă la 3 tratamente de corp.')]]),
    day('Tratamentele de față', [[it('read', 's:hifu-fata'), it('read', 's:rf-sculpt'), it('read', 's:mn-pdrn'), it('read', 's:hidratare')], both('m:cabina/c-protocol'), both('m:cabina/c-dupa'), [it('task', '', 'Asistă la 2 tratamente faciale.')]]),
    day('Consultația', [both('m:consultatie/k-flux'), both('m:consultatie/k-program'), both('m:consultatie/k-oferte'), both('m:consultatie/k-reguli'), [it('read', 'm:consultatie/k-exemplu'), it('case', 'caz-abdomen-tm'), it('task', '', 'Asistă la 2 consultații.'), it('task', '', 'O consultație de probă cu o colegă, cu Calculatorul de ofertă.')]]),
    day('Vânzarea din cabină', [both('m:vanzari/c-vanzare'), both('m:vanzari/v-obiectii'), both('m:consultatie/k-semnare'), [it('case', 'caz-riduri-50'), it('case', 'caz-slaba'), it('case', 'caz-sarcina'), it('task', '', 'Primul tratament făcut de tine, cu o colegă lângă tine.'), it('task', '', 'Prima consultație reală, cu o colegă lângă tine.')]]),
  ],
};

module.exports = { CONSULTATIE, QUIZ, PRICES, RULES, SCHEMES, COMBOS, CASES, PATHS };
