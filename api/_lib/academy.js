// Traininguri (the "Academia"): the team's sales, booking and treatment-room manuals. Shown in the
// "Traininguri" tab; every chapter is a card the team reads in the portal or downloads as a PDF.
// This is the first version written for Centrul360; the owner edits any chapter in place (admin).
//
// Chapter body: one line per block.
//   "## Titlu"     sub-heading
//   "- text"       bullet
//   "1. text"      numbered step
//   "> text"       what to SAY (shown as a quote the girls can copy)
//   "! text"       important rule (highlighted box)
//   anything else  a paragraph
// Prices are never written here: they come from Oferte active, the same list as the site.

const L = (s) => s.trim().split('\n').map((x) => x.trim()).filter(Boolean);

function defaultAcademy() {
  return {
    manuals: [
      {
        id: 'vanzari',
        title: 'Manualul de vânzări',
        icon: 'trend',
        lede: 'Cum transformăm o consultație gratuită într-o clientă care își face tot tratamentul la noi. Pentru toată echipa: recepție și cosmeticiene.',
        chapters: [
          {
            id: 'v-mentalitate', title: 'De ce vindem', summary: 'Vânzarea înseamnă să o ajuți pe clientă să ia o decizie bună pentru ea.',
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
`),
          },
          {
            id: 'v-consultatie', title: 'Consultația gratuită, pas cu pas', summary: 'Structura fixă a fiecărei consultații: de la salut până la programare.',
            body: L(`
Consultația gratuită e locul unde se face vânzarea. Urmează mereu aceiași pași, în aceeași ordine.
1. Primire caldă. Salut pe nume, apă, fișa clientei. Spune-i ce urmează: „Stăm de vorbă 10 minute, vedem zona și îți spun sincer ce ți-ar folosi.”
2. Întreabă ce vrea. Ce zonă o deranjează, de cât timp, ce a mai încercat.
3. Întreabă de ce acum. Ce s-a întâmplat de a venit tocmai acum (o nuntă, vara, o poză care nu i-a plăcut).
4. Repetă cu cuvintele ei. „Deci te deranjează burtica de după a doua sarcină și vrei să te simți bine în rochie la nunta din august. Am înțeles bine?”
5. Arată-i drumul. Explică pe scurt tratamentul potrivit, câte ședințe, la ce interval, când vede diferența.
6. Spune prețul clar (vezi capitolul despre preț) și taci.
7. Închide: propune data primei ședințe. Nu întreba „vrei?”, întreabă „când îți vine mai bine?”.
8. Programeaz-o pe loc, în Calendar, înainte să plece.
! Cadoul de la consultație (masajul facial) i-l oferi oricum. Nu e condiționat de cumpărare.
## Ce spui la început
> Mă bucur că ai venit! Înainte să-ți spun ceva despre tratamente, vreau să te ascult pe tine. Ce te-a făcut să ne scrii?
## Ce spui când îi arăți drumul
> Pentru ce mi-ai spus tu, eu aș face așa: [tratamentul], [număr] ședințe, la [interval]. Diferența începi s-o vezi după [când]. Fără ace și fără pauză, te întorci la treabă în aceeași zi.
`),
          },
          {
            id: 'v-intrebari', title: 'Întrebările care vând', summary: 'Cine pune întrebările conduce discuția. Lista de întrebări de folosit la fiecare consultație.',
            body: L(`
Clienta se convinge singură când își aude propriile răspunsuri. Tu doar pui întrebările bune și asculți.
## Despre problemă
> Ce zonă te deranjează cel mai mult?
> De cât timp te deranjează?
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
`),
          },
          {
            id: 'v-pret', title: 'Cum spui prețul', summary: 'Prețul se spune clar, după ce clienta știe ce primește. Apoi taci.',
            body: L(`
Prețul nu sperie. Sperie prețul spus prea devreme, fără să știe ce primește, sau spus cu jenă.
1. Întâi rezultatul și planul, abia apoi prețul.
2. Spune prețul vechi, apoi prețul de acum, din Oferte active.
3. Spune ce intră în preț (zone, ședințe).
4. După preț: taci. Prima care vorbește după preț pierde. Las-o pe ea să întrebe.
! Prețurile corecte sunt doar cele din Oferte active. Nu negociem și nu inventăm reduceri pe loc.
## Ce spui
> Prețul normal e [preț vechi]. Acum, în oferta din această perioadă, e [preț nou] și intră [ce intră].
## Când pachetul e mai bun
> Poți lua și ședință cu ședință. Dar dacă vrei rezultatul complet, pachetul te costă mai puțin pe ședință și ai locurile rezervate.
## Ce NU faci
- Nu spui „e cam scump, știu”.
- Nu dai reducere ca să închizi. Oferta e deja cea mai bună.
- Nu spui prețul pe hol sau din mers. Doar la consultație, după ce ai ascultat-o.
`),
          },
          {
            id: 'v-obiectii', title: 'Obiecțiile și ce răspunzi', summary: '„E scump”, „mă mai gândesc”, „întreb soțul”: ce înseamnă de fapt și ce spui.',
            body: L(`
O obiecție nu e un NU. E o întrebare la care încă nu a primit răspuns. Regula: întâi îi dai dreptate, apoi pui o întrebare, apoi răspunzi.
## „E scump”
De obicei înseamnă: nu e încă sigură că o să meargă la ea.
> Te înțeleg, e o sumă. Hai să vedem: dacă ai fi sigură că rezultatul e cel pe care mi l-ai spus, ți s-ar mai părea scump?
Dacă spune că nu, problema e încrederea: arată-i rezultate și explică încă o dată cum funcționează. Dacă banii chiar sunt problema, propune o variantă mai mică (o zonă, mai puține ședințe), nu o reducere.
## „Mă mai gândesc”
Înseamnă că ceva nu e clar.
> Sigur. Ca să te ajut să te gândești: ce anume te face să stai pe gânduri? Prețul, dacă o să meargă la tine sau programul?
Apoi răspunzi exact la ce spune.
## „Întreb soțul / partenerul”
> Normal, e bine să vorbiți. Ce crezi că o să te întrebe? Hai să-ți dau răspunsurile, să ai tot ce-ți trebuie.
Propune o programare provizorie: „Îți țin locul până mâine la ora 12. Dacă vă hotărâți altfel, îmi scrii.”
## „Nu am timp”
> Ședința durează [cât], fără pauză după. Poți veni în pauza de prânz și te întorci direct la treabă.
## „Mi-e frică să nu doară”
> Se simte [senzația reală, ex. căldură]. Îți spun eu înainte ce urmează și ne oprim oricând vrei.
## „Am mai încercat și n-a mers”
> Ce ai încercat? [Ascultă.] Diferența la noi e [aparatul, protocolul, numărul de ședințe]. Și îți spun sincer de la început ce să aștepți.
## „Vin mai încolo”
> Sigur. Doar să știi că oferta e valabilă acum și locurile sunt puține. Dacă vrei rezultatul pentru [evenimentul ei], ar trebui să începem în [interval].
`),
          },
          {
            id: 'v-inchidere', title: 'Închiderea și programarea pe loc', summary: 'Nicio clientă nu pleacă fără o dată în Calendar.',
            body: L(`
O consultație fără programare e o consultație pierdută. Nu lăsa clienta să plece cu „te sun eu”.
1. Propune două variante de zi, nu întreba dacă vrea.
2. Pune programarea în Calendar cât e lângă tine.
3. Dacă oferta cere avans, explică-l simplu și ia-l pe loc.
4. Trimite-i confirmarea pe WhatsApp înainte să iasă pe ușă.
## Ce spui
> Hai să-ți rezervăm prima ședință. Îți vine mai bine marți la 17 sau joi la 10?
> Perfect, te-am trecut joi la 10. Îți trimit acum confirmarea pe WhatsApp.
## Dacă tot nu se hotărăște
> Îți țin locul până mâine la 12, fără nicio obligație. Te sun eu mâine dimineață să vedem.
Pune imediat follow-up în Pipeline, ca să nu se piardă.
`),
          },
          {
            id: 'v-pachete', title: 'Pachete și recomandări suplimentare', summary: 'Recomanzi un tratament în plus doar când o ajută să ajungă mai repede la rezultat.',
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
## Ce spui
> Pentru ce vrei tu, ce ar ajuta mult e să combinăm cu [tratament]: [ce face]. Nu e obligatoriu, dar rezultatul vine mai repede.
! Verifică mereu în Oferte active dacă tratamentul e disponibil în orașul clientei (EMS și epilarea doar la Timișoara, cavitația 1+1 doar la Arad).
`),
          },
          {
            id: 'v-recomandari', title: 'Recenzii și recomandări', summary: 'Cea mai ieftină clientă nouă e prietena unei cliente mulțumite.',
            body: L(`
Când clienta e mulțumită, e momentul să ceri două lucruri: o recenzie și o recomandare.
## Când ceri
- Când îți spune că e mulțumită sau când vede o diferență.
- Niciodată când a avut o problemă nerezolvată.
## Recenzia Google
> Mă bucur mult că îți place! Ne-ar ajuta enorm o recenzie pe Google, durează un minut. Îți trimit linkul pe WhatsApp?
## Recomandarea
> Ai vreo prietenă sau soră care s-ar bucura și ea de o consultație gratuită? Îi fac eu programarea, doar spune-mi numele ei.
`),
          },
          {
            id: 'v-reguli', title: 'Ce nu spunem niciodată', summary: 'Regulile care ne feresc de reclamații, de Meta și de cliente dezamăgite.',
            body: L(`
! Garanția banilor înapoi există doar la epilarea laser. La celelalte tratamente nu promitem garanție.
- Nu promitem centimetri, kilograme sau „rezultat garantat” la tratamentele corporale și faciale.
- Nu spunem nimic urât despre corpul sau fața clientei. Vorbim despre ce își dorește ea, nu despre ce „are greșit”.
- Nu negociem prețul și nu inventăm reduceri. Prețurile sunt doar cele din Oferte active.
- Nu vorbim urât de alte clinici.
- Nu dăm sfaturi medicale. La boli, sarcină sau tratamente medicale, recomandăm să întrebe medicul.
- Nu folosim poze cu clientele fără acordul lor scris.
`),
          },
        ],
      },
      {
        id: 'programare',
        title: 'Programarea clientelor',
        icon: 'calendar',
        lede: 'De la lead la clientă în cabină: primul telefon, programarea, confirmarea și cum salvezi o anulare. Pentru recepție.',
        chapters: [
          {
            id: 'p-5min', title: 'Leadul nou: regula celor 5 minute', summary: 'Un lead sunat în primele 5 minute se programează de câteva ori mai des decât unul sunat după o oră.',
            body: L(`
Leadul a completat formularul acum câteva minute. Încă se gândește la noi. Peste o oră se gândește la altceva.
1. Sună în maxim 5 minute de la apariția leadului.
2. Nu răspunde? Trimite imediat mesajul de WhatsApp de mai jos.
3. Notează rezultatul în fișa din Pipeline.
4. Revino după ritmul de mai jos.
! Leadurile vechi se sună după cele noi. Întâi cele apărute acum.
## Ritmul de revenire
- Peste 2 ore.
- A doua zi la 10:00.
- Peste 3 zile.
- După 3 încercări fără răspuns: Pierdut, cu motivul notat.
## WhatsApp când nu răspunde
> Bună, [nume]! Sunt [numele tău] de la Centrul360 [oraș]. Am văzut că te interesează [tratament]. Te-am sunat acum, dar nu am reușit să te prind. Când e un moment bun să vorbim 2 minute?
`),
          },
          {
            id: 'p-telefon', title: 'Primul telefon, cuvânt cu cuvânt', summary: 'Scopul telefonului nu e să vinzi tratamentul. E să o programezi la consultația gratuită.',
            body: L(`
La telefon nu vinzi pachetul. Vinzi consultația gratuită. Tratamentul se vinde la clinică.
## 1. Deschiderea
> Bună, [nume]! Sunt [numele tău] de la Centrul360 [oraș]. Ai completat formularul pentru [tratament]. Ai două minute?
## 2. Întreabă, nu explica
> Ce zonă te interesează cel mai mult?
> De cât timp te gândești la asta?
## 3. Invitația
> Cel mai bine e să vii la o consultație gratuită: vedem zona, îți spunem sincer ce ți-ar folosi și primești și un masaj facial cadou. Durează cam 20 de minute.
## 4. Programarea (două variante)
> Îți vine mai bine mâine la 17 sau joi la 11?
## 5. Confirmarea
> Super, te-am trecut [zi], ora [oră], la noi în [oraș], [adresă]. Îți trimit acum pe WhatsApp confirmarea și locația.
## Dacă întreabă de preț
> Oferta din această perioadă e [preț nou] în loc de [preț vechi]. La consultație vedem exact de ce ai nevoie, ca să nu plătești nimic în plus.
! Verifică orașul: EMS și epilarea laser doar la Timișoara, cavitația 1+1 doar la Arad.
`),
          },
          {
            id: 'p-programare', title: 'Programarea corectă', summary: 'Ce trebuie să conțină fiecare programare, ca să nu avem surprize.',
            body: L(`
O programare bine făcută înseamnă o clientă care vine și o cosmeticiană pregătită.
1. Tratamentul și oferta exactă, din Oferte active.
2. Orașul corect (vezi regulile de oraș).
3. Telefonul clientei, obligatoriu.
4. Cosmeticiana alocată.
5. Dacă oferta cere avans: explică-l și cere-l.
6. Trimite confirmarea pe WhatsApp, cu ora, adresa și locația pe hartă.
7. Spune-i politica de anulare: „Dacă intervine ceva, anunță-ne cu 24 de ore înainte, ca să dăm locul altcuiva.”
## Mesaj de confirmare
> Bună, [nume]! Te așteptăm [zi], [dată], la ora [oră], la Centrul360 [oraș], [adresă]. Dacă intervine ceva, scrie-ne cu 24 de ore înainte. Ne vedem! 💗
`),
          },
          {
            id: 'p-confirmari', title: 'Confirmări și mai puține neprezentări', summary: 'Fiecare clientă care nu vine e un loc gol și bani pierduți.',
            body: L(`
1. Cu o zi înainte, până la 16:00: trimite reminderul tuturor programărilor de mâine.
2. Când răspunde „da”: marcheaz-o Confirmată.
3. Cine nu a răspuns până la 18:00: sun-o.
4. În ziua programării, cu 3 ore înainte: un mesaj scurt.
## Reminder pentru mâine
> Bună, [nume]! Îți amintesc că mâine, la ora [oră], te așteptăm la Centrul360 [oraș]. Îmi confirmi cu un „da”? 😊
## Reminder în ziua programării
> Ne vedem azi la [oră]! Dacă ai nevoie de locație: [link hartă].
! Dacă cineva nu confirmă și nici nu răspunde la telefon, nu șterge programarea. Mai încearcă dimineața.
`),
          },
          {
            id: 'p-anulari', title: 'Anulări și reprogramări', summary: 'Când o clientă anulează, nu închei discuția: muți programarea.',
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
`),
          },
          {
            id: 'p-revenire', title: 'Clientele care nu s-au mai întors', summary: 'O clientă care a fost deja la noi se programează mult mai ușor decât una nouă.',
            body: L(`
Clientele care au făcut o ședință și nu au mai revenit sunt cea mai ușoară vânzare: ne cunosc deja.
1. Săptămânal, caută clientele care nu au mai venit de peste 30 de zile și nu au programare.
2. Trimite-le un mesaj personal, nu de reclamă.
3. Dacă răspund, programează-le pe loc.
## Mesaj de revenire
> Bună, [nume]! Sunt [numele tău] de la Centrul360. Mă gândeam la tine: cum a mers după [tratament]? Ca să vezi rezultatul complet, ar fi bine să continuăm. Îți găsesc un loc săptămâna asta?
## Mesaj după un tratament de întreținere
> Bună, [nume]! A trecut o lună de la ultimul tău [tratament]. E momentul bun pentru ședința de întreținere. Îți țin un loc?
`),
          },
          {
            id: 'p-mesaje', title: 'Mesaje WhatsApp gata de copiat', summary: 'Mesajele folosite cel mai des, scrise simplu și cald.',
            body: L(`
Copiază, completează ce e între paranteze și trimite. Scrie ca un om, nu ca o firmă.
## Lead nou
> Bună, [nume]! Sunt [numele tău] de la Centrul360 [oraș]. Am văzut că te interesează [tratament]. Când pot să te sun 2 minute?
## După consultație, dacă nu s-a programat
> Bună, [nume]! Mulțumesc că ai trecut pe la noi azi. Ți-am ținut locul pentru [zi, oră] până mâine la 12. Îmi spui dacă îl păstrăm?
## După prima ședință
> Bună, [nume]! Cum te simți după ședința de ieri? Dacă ai orice întrebare, sunt aici. 😊
## Cerere de recenzie
> Mă bucur mult că ești mulțumită! Ne-ar ajuta enorm o recenzie pe Google: [link]. Durează un minut. Mulțumim! 💗
`),
          },
        ],
      },
      {
        id: 'cabina',
        title: 'Proceduri în cabină',
        icon: 'sparkles',
        lede: 'Ce se întâmplă de când clienta intră în cabină până pleacă programată la următoarea ședință. Pentru cosmeticiene.',
        chapters: [
          {
            id: 'c-inainte', title: 'Înainte de tratament: fișa și siguranța', summary: 'Fișa completată, contraindicațiile verificate, clienta liniștită.',
            body: L(`
1. Verifică fișa clientei (Fișe de printat). La prima vizită o completează și o semnează.
2. Întreabă de contraindicații: sarcină sau alăptare, stimulator cardiac sau implanturi metalice în zonă, boli de piele active în zonă, tratamente recente (laser, peeling, injectabile), medicamente care sensibilizează pielea.
3. Dacă ai orice dubiu: nu faci tratamentul și ceri părerea managementului sau a medicului.
4. Fotografii înainte doar cu acordul clientei, în aceleași condiții de lumină și poziție.
! Siguranța clientei e mai importantă decât orice vânzare. Când nu ești sigură, nu faci.
## Ce spui
> Înainte să începem, îți pun câteva întrebări scurte, ca să fiu sigură că tratamentul e potrivit pentru tine.
`),
          },
          {
            id: 'c-explici', title: 'Cum explici tratamentul pe limba ei', summary: 'O propoziție simplă pentru fiecare tratament, ca să înțeleagă și să aibă încredere.',
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
`),
          },
          {
            id: 'c-protocol', title: 'În timpul tratamentului', summary: 'Protocolul aparatului, confortul clientei și ce îi spui pe parcurs.',
            body: L(`
1. Urmează protocolul aparatului (Protocoale aparate): parametri, timp, zone. Nu improviza.
2. Spune-i înainte ce urmează să simtă.
3. Întreab-o din când în când cum se simte și ajustează intensitatea dacă e nevoie.
4. Ține conversația ușoară. E un moment bun să afli mai multe despre ce își dorește (ajută la planul următor).
! Parametrii aparatului se aleg după manualul producătorului și după tipul de piele, nu după dorința clientei de „mai tare”.
## Ce spui
> Acum o să simți [senzația]. Dacă e prea mult, îmi spui și reglez imediat.
`),
          },
          {
            id: 'c-vanzare', title: 'Vânzarea din cabină: seria următoare', summary: 'Tu vezi zona și ai încrederea ei. Recomandarea ta valorează cel mai mult.',
            body: L(`
Clienta are cea mai mare încredere în cosmeticiana care o tratează. Ce spui tu în cabină contează mai mult decât orice reclamă.
1. Spre finalul ședinței, spune-i ce ai observat și cum a reacționat zona.
2. Spune-i planul: câte ședințe mai sunt până la rezultatul pe care l-a spus ea și la ce interval.
3. Recomandă o singură combinație, doar dacă o ajută (vezi Manualul de vânzări → Pachete).
4. Condu-o la recepție și spune-i recepționerei, de față cu clienta, ce ședință urmează și când.
## Ce spui
> Zona a răspuns foarte bine azi. Ca să ajungi la ce mi-ai spus, [rezultatul ei], ne mai trebuie [număr] ședințe, la [interval]. Hai să-ți rezervăm acum următoarea, să ai locul sigur.
## La recepție, de față cu clienta
> [Recepționera], [clienta] continuă cu [tratament], următoarea ședință în [interval]. Îi găsești un loc?
! Dacă clienta a cumpărat un pachet sau un tratament în plus la recomandarea ta, la încasare se bifează „Upsell efectuat” cu valoarea vândută. Comisionul tău: valoarea minus 60% cheltuieli, apoi 10% din rest (la 3.000 lei, 120 lei). Devine oficial după aprobarea administratorului.
`),
          },
          {
            id: 'c-dupa', title: 'După tratament', summary: 'Recomandări clare, puține și scrise, ca rezultatul să fie cel mai bun.',
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
`),
          },
          {
            id: 'c-igiena', title: 'Igienă și cabina', summary: 'Cabina curată e prima dovadă de profesionalism pe care o vede clienta.',
            body: L(`
1. Dezinfectează aparatul, piesele de mână și suprafețele după fiecare clientă.
2. Prosoape și consumabile curate pentru fiecare clientă.
3. Cabina aerisită și ordonată înainte să intre următoarea.
4. Consumabile pe terminate: anunță managementul din timp.
! Nu folosești un aparat care pare defect. Îl oprești și anunți imediat managementul.
`),
          },
        ],
      },
    ],
  };
}

// Admin edits from the Traininguri tab: { manualId, chapters:[{id,title,summary,body[]}] } replaces
// that manual's chapters; manuals not sent are left untouched.
function cleanAcademy(input, current) {
  const out = JSON.parse(JSON.stringify(current || defaultAcademy()));
  const m = out.manuals.find((x) => x.id === (input && input.manualId));
  if (!m || !Array.isArray(input.chapters)) return out;
  m.chapters = input.chapters.slice(0, 40).map((c, i) => ({
    id: /^[a-z0-9-]{1,40}$/.test(c && c.id) ? c.id : m.id.charAt(0) + '-' + Date.now().toString(36) + i,
    title: String((c && c.title) || '').trim().slice(0, 120) || 'Capitol fără titlu',
    summary: String((c && c.summary) || '').trim().slice(0, 300),
    body: (Array.isArray(c && c.body) ? c.body : String((c && c.body) || '').split('\n')).map((x) => String(x).trim().slice(0, 1200)).filter(Boolean).slice(0, 200),
  }));
  return out;
}

module.exports = { defaultAcademy, cleanAcademy };
