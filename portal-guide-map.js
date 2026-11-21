// The portal's map, one source of truth for the guide in Traininguri („Portalul”) and for Nuki (George, 16.11: Nuki
// helps everyone find their way, with the answer right for their role and a button that takes them there).
//   PLACES  id → { title, roles, go: { tab, sub?, emit?, call? }, glow? }: a place someone can be taken to; `title` is what
//           the button and Nuki call it (the menu's words, „Secțiune → ce e acolo”)
//   LESSONS the guide's lessons (portal-academy-guide.js draws them): what for, the steps, good to know, never; `place`
//           is the place its button opens; a field can be a function of the role where the roles differ
//   FAQ     the questions people ask, answered per role, each with the place it sends to (none: a plain answer)
//   forRole(role) → { places, lessons, faq } for that role only; promptText(role) → the map as Nuki reads it
// Every label in „quotes” is the exact text on the screen (qa/nuki-map.cjs checks it). Texts the team reads have no
// titles and no names to say whom to go to (CLAUDE.md, 16.11): „Nu e în contul tău.”, „Se mută din Calendar.”
// Works in the browser (window.C360GuideMap) and on the server (require, api/portal-nuki.js).
(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make();
  else root.C360GuideMap = make();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const A = 'admin', M = 'manager', R = 'receptie', C = 'cosmetician';
  const ALL = [A, M, R, C], STAFF = [M, R, C], FRONT = [A, M, R], BOSS = [A, M];
  const ROLE_LABEL = { admin: 'Admin', manager: 'Manager (ambele clinici, face și recepție)', receptie: 'Recepție', cosmetician: 'Cosmeticiană' };

  // ------------------------------------------------------------------ the places
  const P = (title, roles, go, glow) => ({ title, roles, go, glow: glow || '' });
  const PLACES = {
    account: P('Contul meu', ALL, { call: 'account' }),
    notif: P('Notificările', ALL, { call: 'notif' }),
    panou: P('Panou', ALL, { tab: 'panou' }),
    'panou.azi': P('Panou → Azi', BOSS, { tab: 'panou', sub: 'azi' }),
    'panou.kpi': P('Panou → KPI', BOSS, { tab: 'panou', sub: 'kpi' }),
    programari: P('Calendar', ALL, { tab: 'programari' }),
    'programari.new': P('Calendar → Programare nouă', FRONT, { tab: 'programari', emit: 'calendar:new' }),
    'programari.pauza': P('Calendar → pauzele de azi', ALL, { tab: 'programari', sub: 'pauza' }, '.cal-team-brk, .cal-brk'),
    'programari.echipa': P('Calendar → Program echipă', BOSS, { tab: 'programari', sub: 'echipa' }),
    'programari.orelibere': P('Calendar → Ore libere', BOSS, { tab: 'programari', sub: 'orelibere' }),
    'programari.pachete': P('Calendar → Pachete fără programare', BOSS, { tab: 'programari', sub: 'pachete' }),
    'programari.resunat': P('Calendar → De resunat', BOSS, { tab: 'programari', sub: 'resunat' }),
    mesaje: P('Mesaje', ALL, { tab: 'mesaje' }),
    'mesaje.wait': P('Mesaje → Fără răspuns', ALL, { tab: 'mesaje', sub: 'wait' }),
    incasari: P('Încasări', ALL, { tab: 'incasari' }),
    'incasari.new': P('Încasări → Încasare nouă', FRONT, { tab: 'incasari', emit: 'incasari:new' }),
    'incasari.dues': P('Încasări → Rest de plată din pachete', ALL, { tab: 'incasari', sub: 'dues' }, 'section:has(> [data-dues])'),
    pipeline: P('Pipeline', ALL, { tab: 'pipeline' }),
    'pipeline.coada': P('Pipeline → Coada de apeluri', FRONT, { tab: 'pipeline', sub: 'coada' }),
    'pipeline.angajari': P('Pipeline → Angajări', BOSS, { tab: 'pipeline', sub: 'angajari' }),
    contacte: P('Contacte', ALL, { tab: 'contacte' }),
    automatizari: P('Sarcini', [M, R], { tab: 'automatizari' }),
    comision: P('Salariu', STAFF, { tab: 'comision' }),
    'comision.bonus': P('Salariu → Bonusul', [M, R], { tab: 'comision', sub: 'bonus' }, '.sl-bonus, .mg-bonus'),
    'comision.costuri': P('Salariu → Costuri variabile ale lunii', [M], { tab: 'comision', sub: 'costuri' }, '.mg-prop'),
    'comision.adauga': P('Salariu → Adaugă comision', [C], { tab: 'comision', sub: 'adauga' }),
    traininguri: P('Traininguri', ALL, { tab: 'traininguri' }),
    'traininguri.portal': P('Traininguri → Portalul', ALL, { tab: 'traininguri', sub: 'portal' }),
    fise: P('Fișe de printat', ALL, { tab: 'fise' }),
    calculator: P('Calculator ofertă', ALL, { tab: 'calculator' }),
    condica: P('Condică', STAFF, { tab: 'condica' }),
    'condica.cereri': P('Condică → Cererile mele', STAFF, { tab: 'condica', sub: 'cereri' }, 'section:has(> [data-new-leave])'),
    'condica.noua': P('Condică → Cerere nouă', STAFF, { tab: 'condica', sub: 'noua' }),
    'condica.ore': P('Condică → Orele mele', STAFF, { tab: 'condica', sub: 'ore' }, '.cd-hours'),
    'condica.derezolvat': P('Condică → De rezolvat', [M], { tab: 'condica', sub: 'derezolvat' }, '.cd-fix'),
    acte: P('Acte și autorizații', BOSS, { tab: 'acte' }),
    ofertele: P('Oferte', STAFF, { tab: 'ofertele' }),
    regulament: P('Regulament intern', ALL, { tab: 'regulament' }),
    fisapost: P('Fișa postului', [A, M, C], { tab: 'fisapost' }),
    manager: P('Manager', BOSS, { tab: 'manager' }),
    'manager.cifre': P('Manager → Cifre', BOSS, { tab: 'manager', sub: 'cifre' }),
    'manager.echipa': P('Manager → Echipa', BOSS, { tab: 'manager', sub: 'echipa' }),
    'manager.casa': P('Manager → Casa', BOSS, { tab: 'manager', sub: 'casa' }),
    'manager.rapoarte': P('Manager → Rapoarte', BOSS, { tab: 'manager', sub: 'rapoarte' }),
    'manager.reguli': P('Manager → Reguli', BOSS, { tab: 'manager', sub: 'reguli' }),
    'manager.inchide': P('Închide ziua', BOSS, { tab: 'manager', call: 'closeDay' }),
    // the owner's own pages
    aprobari: P('Aprobări', [A], { tab: 'aprobari' }),
    angajati: P('Echipa', [A], { tab: 'angajati' }),
    'angajati.salarii': P('Echipa → Salarii', [A], { tab: 'angajati', sub: 'salarii' }),
    'angajati.manual': P('Echipa → Ajustări', [A], { tab: 'angajati', sub: 'manual' }),
    'angajati.condica': P('Echipa → Condică', [A], { tab: 'angajati', sub: 'condica' }),
    cheltuieli: P('Cheltuieli', [A], { tab: 'cheltuieli' }),
    'cheltuieli.propunere': P('Cheltuieli → costurile trimise', [A], { tab: 'cheltuieli', sub: 'propunere' }),
    oferte: P('Oferte (Admin)', [A], { tab: 'oferte' }),
    activitate: P('Activitate', [A], { tab: 'activitate' }),
    integrari: P('Integrări', [A], { tab: 'integrari' }),
    fluxuri: P('Automatizări', [A], { tab: 'fluxuri' }),
    reclame: P('Reclame', [A], { tab: 'reclame' }),
    transformare: P('Campanie TRANSFORMARE', [A], { tab: 'transformare' }),
    continut: P('Content', [A], { tab: 'continut' }),
  };

  // ------------------------------------------------------------------ the lessons
  // id, t (title), ic (icon), roles, place (its button opens it), goL (the button's words); what / do / know / never,
  // each a value or a function of the role
  const LESSONS = [
    { id: 'start', t: 'Intri în portal', ic: 'key', roles: STAFF, place: 'account', goL: 'Deschide „Contul meu”',
      what: 'Portalul e locul unde lucrezi toată ziua: programări, cliente, mesaje și bani.',
      do: ['Deschide staff.centrul360.com sau aplicația Centrul360 de pe telefon.', 'Scrie „Utilizator” și „Parolă”, apoi apasă „Intră în portal”.',
        'Prima dată îți schimbi parola: apasă pe cercul cu inițialele tale, sus în dreapta, apoi „Contul meu” → „Schimbă parola”. Pe telefon: „Meniu”, jos, apoi „Contul meu”.',
        'Tot din „Contul meu” îți pui poza și alegi „Pagina de start”.'],
      know: ['Rămâi conectată 90 de zile, cât timp folosești portalul.', 'După 5 parole greșite aștepți 15 minute.', 'Datele se actualizează singure. Pe telefon tragi de sus în jos ca să reîncarci.'],
      never: 'Nu dai parola nimănui. Dacă ai uitat-o, spune și primești una nouă.' },
    { id: 'telefon', t: 'Portalul pe telefon', ic: 'bell', roles: ALL, place: 'notif', goL: 'Deschide notificările',
      what: 'Pui portalul pe telefon ca o aplicație și primești notificări cu leadurile, programările și răspunsurile.',
      do: ['iPhone: deschide portalul în Safari, apasă „Distribuie” (pătratul cu săgeata în sus), apoi „Adaugă pe ecranul principal” și „Adaugă”.',
        'Android: apasă „Descarcă aplicația Centrul360”, deschide fișierul „centrul360.apk” și apasă „Instalează”.',
        'Deschide „Centrul360” de pe ecran și intră în cont.', 'Apasă „Pornește” la notificări. Primești imediat o notificare de test.'],
      know: ['Pe iPhone notificările merg doar din aplicația pusă pe ecranul principal.', 'O apăsare pe notificare te duce exact la secțiunea ei.', 'Toate notificările le găsești și în clopoțelul de sus.'] },
    { id: 'panou', t: 'Panoul', ic: 'target', roles: [R, C], place: 'panou', goL: 'Deschide Panoul',
      what: (r) => (r === R ? 'Ziua ta dintr-o privire: ce e de încasat, de confirmat și de sunat azi.' : 'Ziua ta dintr-o privire: clientele tale de azi și comisionul.'),
      do: (r) => (r === R
        ? ['Citește rândul de sus: câte programări ai azi și câte sunt de confirmat. Fiecare bucată se apasă.', 'Butoanele mari: „Încasare”, „Programare”, „Lead”, „Coada de apeluri”.',
          'Cifrele „Încasat azi”, „De confirmat”, „Programări azi” și „De sunat acum” se apasă și te duc la listă.', '„Ziua de azi”: apasă pe o programare ca s-o deschizi în Calendar.']
        : ['Butoanele mari: „Calendarul meu”, „Fișe și poze”, „Salariul meu”, „Traininguri”.', '„Clientele mele azi”: apasă pe o clientă ca să vezi programarea.',
          'Cifrele de sus („Clientele mele azi”, „Comision luna aceasta”, „În așteptare”) se apasă și te duc la detalii.']),
      know: ['Panoul se actualizează singur în fiecare minut.', 'Din „Personalizează” alegi ce cifre vezi sus.'] },
    { id: 'calendar', t: 'Calendarul', ic: 'calendar', roles: [R, C], place: 'programari', goL: 'Deschide Calendarul',
      what: (r) => (r === R ? 'Calendarul comun al celor două clinici. Aici faci, confirmi și muți programările.' : 'Programările clinicii tale. Le face și le modifică recepția, tu le vezi.'),
      do: (r) => (r === R
        ? ['Apasă „Programare” sau pe o oră liberă. Completezi „Client”, „Telefon”, ora, „Locație”, „Tratament” și „Cosmeticiană”, apoi apeși „Programează”.',
          'Ca să confirmi: apasă pe programare și alege „Confirmată”. Cele albastre sunt încă neconfirmate.',
          'Ca s-o muți: o tragi pe altă oră. Pe telefon ții apăsat puțin, apoi tragi.',
          'Dacă se anulează, alegi „Anulată”. „Șterge” e doar pentru greșeli.', '„Blochează timp” pentru ore în care nu se lucrează.',
          'Alege o cosmeticiană din listă: orele în care nu lucrează sunt gri („Liberă”, „Concediu”, „În Arad”). Orele ei suplimentare sunt violet și se programează ca orice oră a ei.']
        : ['Alege-te din lista cosmeticienelor ca să vezi doar clientele tale.', 'Gri sunt orele în care nu lucrezi. Violet sunt orele tale suplimentare.', '„Zi” sau „Săptămână”, iar cu săgețile schimbi ziua.',
          'Apasă pe o programare: vezi tratamentul, ora și observațiile.', 'Din programare apasă „Fișa clientei și pozele”.']),
      know: (r) => (r === R
        ? ['Clienta primește singură confirmarea, apoi cu o zi înainte, la 9:00, un mesaj cu „Da, ajung” și „Nu ajung”, apoi cu 2 ore înainte un mesaj cu parcarea.',
          'Dacă răspunde „Da, ajung”, programarea devine Confirmată singură. Dacă răspunde „Nu ajung”, devine Anulată și primești notificare.', 'Programările făcute de clienți pe site apar cu „Online”.']
        : ['O programare nu se mută din contul tău: dacă trebuie schimbat ceva, spune la recepție.']) },
    { id: 'pauza', t: 'Pauza de 30 de minute', ic: 'clock', roles: ALL, place: 'programari.pauza', goL: 'Vezi pauzele de azi',
      what: 'Fiecare cosmeticiană are în fiecare zi o pauză de 30 de minute, pusă singură la mijlocul programului ei.',
      do: (r) => (r === A || r === M
        ? ['Pauza apare în Calendar, în coloana fiecărei cosmeticiene. Apasă pe ea.', 'La „Mută pauza” alegi altă jumătate de oră liberă din programul ei, doar pentru ziua aceea.',
          '„Fără pauză azi” o scoate pentru ziua aceea. „Înapoi la mijloc” o pune la loc.', 'Pe calculator o poți și trage pe altă oră.']
        : r === R
          ? ['Pauza apare singură în Calendar, în coloana fiecărei cosmeticiene.', 'Când clienta vrea exact la ora pauzei, faci programarea ca de obicei: apare „Mută pauza la” cu orele libere apropiate. Alegi una.',
            'Dacă nu alegi nimic, în ziua aceea ea rămâne fără pauză.']
          : ['Pauza ta apare singură în Calendar, la mijlocul programului tău.', 'Apasă pe ea ca să vezi când e și de ce e acolo.']),
      know: (r) => (r === C ? ['Pauza se mută doar din Calendar, de cine are drept. Dacă trebuie mutată, spune la recepție.']
        : r === R ? ['Pauza în sine nu o muți din Calendar; o muți doar când programezi peste ea, cu „Mută pauza la”.']
          : ['Mutarea ține doar pentru ziua aleasă. A doua zi pauza e iar la mijloc.']) },
    { id: 'mesaje', t: 'Mesaje', ic: 'chat', roles: [R, C], place: 'mesaje', goL: 'Deschide Mesaje',
      what: 'WhatsApp-ul clinicilor, plus Instagram și Facebook, într-un singur loc.',
      do: (r) => ['Alege conversația din listă. „Necitite” îți arată ce n-ai văzut încă.', 'Scrii în „Scrie un mesaj…” și trimiți cu săgeata.',
        '„+” are mesajele rapide. „{prenume}” se completează singur cu prenumele ei.', 'Dacă au trecut 24 de ore de la ultimul ei mesaj, îi poți scrie doar cu „Trimite un șablon”.']
        .concat(r === R ? ['Sus, în conversație: „Sună”, „Programează” (cu datele ei deja completate) și „Deschide leadul”.'] : ['Sus, în conversație: „Sună”.']),
      know: ['Bifele arată Trimis, Livrat și Văzut. Un mesaj nelivrat dă alertă.', 'Poți trimite „Catalogul de rezultate” direct din conversație.'] },
    { id: 'pipeline', t: 'Leadurile (Pipeline)', ic: 'trend', roles: [R], place: 'pipeline.coada', goL: 'Deschide Coada de apeluri',
      what: 'Leadurile, pe etape, de la primul telefon până devin cliente.',
      do: ['Apasă „Coada de apeluri”: se deschide primul lead de sunat. Apasă „Sună”.',
        'După apel alegi cum a mers (de exemplu „Vrea programare” sau „Nu răspunde”), scrii pe scurt ce a spus și alegi „Revin la ea”.',
        'Apasă „Salvează contactul”: trece singur la următorul lead.', 'Dacă vrea programare, butonul mare „Programează” îi completează datele.',
        '„Lead nou” e pentru cineva care a sunat sau a venit direct la clinică.'],
      know: ['Leadurile din Facebook și de pe site apar singure, cu notificarea „LEAD NOU”.', 'O programare mută singură leadul în „Programare stabilită”.',
        'Salvarea contactului nu mută etapa: etapa o muți tu.'],
      never: 'Nu lași un lead nou nesunat. Suni în primele 5 minute.' },
    { id: 'sarcini', t: 'Sarcini', ic: 'listCheck', roles: [R], place: 'automatizari', goL: 'Deschide Sarcini',
      what: 'Lista ta de făcut azi și leadurile de sunat azi.',
      do: ['„Adaugă sarcină”: scrii ce trebuie făcut, alegi „Când” și apeși „Adaugă”.', 'Bifezi cu „Gata” ce ai terminat.',
        '„De sunat azi” arată leadurile la care ai ales „Revin la ea” pentru azi.'],
      know: ['Pentru o programare făcută pe site apare singură sarcina „Sună și confirmă programarea”. Dispare singură când programarea e confirmată.', 'Un lead iese singur din „De sunat azi” după ce îi salvezi contactul în Pipeline.'] },
    { id: 'incasari', t: 'Încasări', ic: 'wallet', roles: [R], place: 'incasari.new', goL: 'Fă o încasare',
      what: 'Banii încasați. Orice încasare pornește de la o programare.',
      do: ['Apasă „Încasare” sau „Încasează” din programare.', 'Alegi orașul, ziua și programarea.',
        'Scrii cât a plătit. Bifezi „Upsell” dacă a cumpărat ceva în plus.', 'Alegi cum a plătit: Card, Cash, Transfer sau Cash + card.',
        'Alegi cine a făcut tratamentul și apeși „Încasează”.'],
      know: ['Programarea devine „Finalizată” singură.', 'Ce mai e de plătit din pachete vezi la „Rest de plată din pachete”. Când plătește restul, faci o încasare nouă la programarea ei.'],
      never: 'Rambursările și corecturile nu se fac din contul tău. Ai văzut o greșeală? Spune ce trebuie corectat și se rezolvă.' },
    { id: 'contacte', t: 'Fișe și poze', ic: 'image', roles: [R, C], place: 'contacte', goL: 'Deschide Contacte',
      what: 'Fișa fiecărei cliente: fișe scanate, mențiuni, poze înainte și după, istoric.',
      do: ['În „Contacte” cauți clienta după nume sau telefon.', '„Fișe & mențiuni” → „Scanează fișa”: fotografiezi fiecare pagină a fișei semnate.',
        '„Poze înainte / după” → „Începe Ședința 1” (sau „Adaugă Ședința N”), apoi apeși pe ÎNAINTE și pe DUPĂ.',
        '„Acord pentru publicarea pozelor”: alegi ce a spus ea.', '„Trimite rezultatele” îi trimite pozele pe WhatsApp.'],
      know: ['Imaginea înainte și după se face singură când ai ambele poze.', '„Istoric” arată restul de plată, ultima vizită, programările, încasările și rambursările.'],
      never: 'Fără acordul ei, pozele nu se publică nicăieri.' },
    { id: 'calculator', t: 'Calculatorul și fișele', ic: 'percent', roles: [C], place: 'calculator', goL: 'Deschide Calculatorul',
      what: 'Faci programul clientei și cele 4 oferte, apoi printezi fișa.',
      do: ['În „Calculator ofertă” alegi Față, Corp sau Epilare laser, apeși pe tratament și pui ședințele cu − și +.',
        'Jos apar totalul și cele 4 oferte, în ordinea în care i le arăți.', '„Salvează la clientă” pune programul în fișa ei din Contacte.',
        'În „Fișe de printat” alegi fișa și apeși „Deschide PDF”.'],
      know: ['Prețurile vin singure, după orașul tău.', 'Cum se completează fiecare pagină a fișei e explicat la ușa „Consultația”.'] },
    { id: 'salariu', t: 'Salariu', ic: 'cash', roles: [R, C], place: (r) => (r === R ? 'comision.bonus' : 'comision'), goL: 'Deschide Salariu',
      what: (r) => (r === R ? 'Cât iei luna asta: salariul de bază, orele suplimentare și bonusul de programări.' : 'Cât iei luna asta: salariul de bază, orele suplimentare și comisionul.'),
      do: (r) => ['Vezi „Salariul tău” pe luna curentă. Cu săgețile vezi lunile trecute.'].concat(r === R
        ? ['Cardul „Bonusul de programări” îți arată cât mai ai până la următorul prag.']
        : ['Comisionul e 4% din fiecare plată încasată pentru un upsell al tău. Fiecare upsell se aprobă o singură dată; după aceea, fiecare plată nouă din el îți aduce 4%, singură.',
          'Dacă lipsește un upsell: „Adaugă comision”, completezi ce ai vândut și apeși „Trimite la aprobare”.']),
      know: (r) => (r === R ? ['Bonusul vine singur, cu notificarea „BONUS”.', 'Media pe zi se calculează doar din zilele în care ai pontat sosirea.']
        : ['Până se aprobă upsellul, comisionul lui apare „În așteptare”.', 'Primești notificarea „COMISION ✅” sau „COMISION ❌”.', 'O rambursare scade 4% din banii dați înapoi, în luna rambursării.']) },
    { id: 'condica', t: 'Condică', ic: 'clock', roles: [R, C], place: 'condica', goL: 'Deschide Condica',
      what: 'Pontajul, orele și concediile tale.',
      do: ['Când vii: „Pontează sosirea”. Când pleci: „Pontează plecarea”.', 'Concediu: „Cererile mele” → „Cerere nouă”, alegi tipul și datele, apoi „Trimite cererea”.',
        '„Orele mele” arată orele de recuperat, orele suplimentare și zilele de concediu.',
        'Ai greșit sau ai uitat un pontaj? „Cere corectarea”: alegi ziua, pui orele reale și scrii de ce. Se aprobă din Condică.'],
      know: ['Programul e luni-vineri, 8 ore cu pauza. Cu 15 minute în plus sau în minus, ziua merge la aprobare.', 'Dacă n-ai pontat sosirea până la 13:00, portalul îți amintește.',
        'Fiecare corectare rămâne în istoric: cine, când și de ce.'] },
    { id: 'oferte', t: 'Ofertele', ic: 'tag', roles: [R, C], place: 'ofertele', goL: 'Deschide Ofertele',
      what: 'Ofertele active, exact ca pe site.',
      do: ['Caută oferta.', 'Apasă butonul de copiere: textul e gata de trimis pe WhatsApp.'],
      know: ['Ofertele nu se schimbă de aici: apar singure, exact ca pe site.'] },

    // ---- the manager (15.11): both clinics, the team, the till, the reports
    { id: 'm-zi', t: 'Ziua ta', ic: 'listCheck', roles: [M], place: 'panou', goL: 'Deschide Panoul',
      what: 'Ordinea în care treci prin portal în fiecare zi, pentru clinicile tale.',
      do: ['Dimineața: „Panou” → „KPI” → „Țintele lunii”. Vezi cifrele fiecărei clinici.',
        '„Calendar”: ziua de azi și de mâine. Cele albastre sunt neconfirmate: le suni.', '„Sarcini”: „Sună și confirmă programarea”, apoi „Gata”.',
        '„Mesaje” → „Fără răspuns”: nicio clientă nu rămâne fără răspuns.', '„Pipeline” → „Coada de apeluri”: fiecare lead nou e sunat în 5 minute.',
        'Seara, pentru fiecare clinică: „Închide ziua”.'],
      know: ['Notificările îți vin pentru clinicile tale: leaduri noi, programări, mesaje fără răspuns, cereri de concediu, candidați, acte care expiră.',
        'Ținte: peste 1.500 lei pe zi lucrată pentru fiecare cosmeticiană; calendarul plin plus cele care n-au venit în ultimele 60 de zile; jumătate din consultații cu upsell; toate leadurile sunate în 5 minute; niciun mesaj fără răspuns la închidere.'] },
    { id: 'm-pagina', t: 'Pagina Manager', ic: 'target', roles: [M], place: 'manager', goL: 'Deschide pagina Manager',
      what: 'Cifrele lunii, echipa, casa și rapoartele, pe clinicile tale. O deschizi din „Panou” → „KPI” → „Țintele lunii”.',
      do: ['Sus alegi clinica sau pe amândouă.',
        '„Cifre”: calendarul față de țintă, consultațiile cu upsell, leadurile sunate în 5 minute și încasatul pe zi lucrată pentru fiecare cosmeticiană.',
        '„Echipa” → „De decis”: zilele peste sau sub program și cererile de concediu ale colegelor. Apeși „Aprobă” sau „Respinge”.',
        '„Echipa” → „Program echipă”: orele fiecăreia pe săptămână. „Notează concediu”: un concediu stabilit pe loc.',
        '„Casa”: închiderile zilei și plățile cu cardul de pe POS.', '„Rapoarte”: raportul săptămânal.'],
      know: ['Pontajul și concediile tale nu le decizi tu: apar cu eticheta lor și se decid separat.',
        '„Trimite feedback pentru reclame”: când leadurile sunt mult prea multe sau prea puține față de calendar. Alegi cât de multe sunt, cum e calitatea leadurilor și scrii de ce.'],
      never: 'Salariile și comisioanele colegelor, profitul și reclamele nu le discuți cu echipa și nu promiți nimănui bani.' },
    { id: 'm-urmarire', t: 'Ore libere și pe cine suni', ic: 'sunrise', roles: [M], place: 'programari.orelibere', goL: 'Deschide Ore libere',
      what: 'Orele libere din următoarele 7 zile și clientele pe care le suni ca să le umpli.',
      do: ['„Ore libere”: în Calendar, lângă „Program echipă”, sau sub fiecare clinică în Manager → „Cifre”. Alegi ziua: vezi orele libere ale fiecărei cosmeticiene.',
        'Atingi o oră liberă, apoi „Programează” la clienta din „Pe cine suni”. Programarea se face direct la ora aleasă.',
        '„Pachete fără programare”: clientele care au început un pachet și nu au nimic în calendar. Le suni și le programezi. Dacă nu mai vine sau revine ea, „Rezolvat” și alegi motivul.',
        '„Nu răspunde” când nu răspunde: clienta trece la „De resunat”. „A răspuns” când ați vorbit.'],
      know: ['O programare nouă scoate singură clienta de pe liste.', 'Ținta calendarului e 100% plus cele care n-au venit în ultimele 60 de zile: orele libere sunt locurile de umplut până acolo.'] },
    { id: 'm-1on1', t: 'Discuția lunară', ic: 'users', roles: [M], place: 'manager.echipa', goL: 'Deschide Echipa',
      what: 'O discuție pe lună cu fiecare cosmeticiană, pe cifrele ei.',
      do: ['Manager → „Echipa” → „Discuția lunară”: alegi cosmeticiana.',
        'Fișa arată luna ei față de luna trecută: lei pe zi lucrată, zilele lucrate, consultațiile cu upsell, clientele care n-au venit, anulările.',
        'Scrii ce merge bine, ce are de îmbunătățit și ce stabiliți, apoi „Salvează”.'],
      know: ['Ținta ei: peste 1.500 lei pe zi lucrată. Fișa îți spune cât îi lipsește.'] },
    { id: 'm-calendar', t: 'Calendarul și programul echipei', ic: 'calendar', roles: [A, M], place: 'programari.echipa', goL: 'Deschide Program echipă',
      what: 'Calendarul comun al clinicilor. Faci, confirmi, muți programările și împarți clientele pe cosmeticiene.',
      do: ['„Programare” sau o oră liberă: completezi „Client”, „Telefon”, ora, „Locație”, „Tratament” și „Cosmeticiană”, apoi „Programează”.',
        'Ca să confirmi: apeși pe programare și alegi „Confirmată”. Ca s-o muți: o tragi pe altă oră. Pe telefon ții apăsat puțin, apoi tragi.',
        'Dacă se anulează: „Anulată”, apoi o suni și îi propui altă zi. „Șterge” e doar pentru greșeli.',
        '„Program echipă”: orele fiecărei cosmeticiene și ale recepției, pe săptămână. Doar orele cosmeticienelor fac locuri pentru cliente.',
        '„Pe săptămâni”: alegi săptămâna cu săgețile și orașul, apoi orele fiecărei cosmeticiene în zilele ei, și „Salvează săptămâna”. „Copiază săptămâna trecută” și „Repetă” (la fel sau „Alternează”, până la 12 săptămâni) fac rotația dintr-o atingere. „Programul de bază” rămâne săptămâna obișnuită.',
        '„Blochează timp” pentru ore în care nu se lucrează.',
        'Ore suplimentare: în „Pe săptămâni”, „+” de lângă zi, alegi orele (fix sau la jumătate), o notă dacă vrei, apoi „Salvează”. Din Calendar: alegi cosmeticiana, apoi „Ore suplimentare” sus, lângă orele ei.'],
      know: ['Clienta primește singură confirmarea, apoi cu o zi înainte, la 9:00, un mesaj cu „Da, ajung” și „Nu ajung”.',
        'Pauza de 30 de minute a fiecărei cosmeticiene se pune singură, după „Program echipă”.',
        'Când alegi o cosmeticiană în Calendar, orele în care nu lucrează sunt gri. Orele suplimentare sunt violet: recepția le programează, pe site nu apar, iar ea primește notificare.',
        'La pontaj, orele suplimentare nu schimbă programul ei: ce lucrează în ele iese peste program și merge la aprobare, cu orele cerute alături.'] },
    { id: 'm-clienti', t: 'Leaduri și mesaje', ic: 'trend', roles: [M], place: 'pipeline.coada', goL: 'Deschide Coada de apeluri',
      what: 'Leadurile și conversațiile clinicilor tale. Tu te asiguri că nimeni nu așteaptă.',
      do: ['„Pipeline” → „Coada de apeluri”: se deschide primul lead de sunat. „Sună”, apoi alegi cum a mers și „Salvează contactul”.',
        'Sus alegi clinica sau pe amândouă.', 'Dacă vrea programare, butonul „Programează” îi completează datele.',
        '„Mesaje” → „Fără răspuns”: cele care așteaptă, cea mai veche prima. „Rezolvat” dacă ai vorbit cu ea altfel.',
        'Dacă au trecut 24 de ore de la ultimul ei mesaj, îi scrii doar cu „Trimite un șablon”.'],
      know: ['Leadurile din Facebook și de pe site apar singure, cu notificarea „LEAD NOU”.', 'La 10:00 și la 17:00 primești câte cliente așteaptă răspuns.'],
      never: 'Niciun lead nou nesunat peste 5 minute și niciun mesaj fără răspuns la închidere.' },
    { id: 'm-angajari', t: 'Angajări', ic: 'userPlus', roles: [M], place: 'pipeline.angajari', goL: 'Deschide Angajări',
      what: 'Candidații de la reclamele de angajare, pentru clinicile tale. Îi suni, faci interviul și o recomanzi pe cea potrivită.',
      do: ['„Pipeline” → „Angajări”: candidații pe etape.',
        'Pe card: telefonul, răspunsurile ei și CV-ul, când l-a trimis pe WhatsApp.',
        'Muți etapa din lista de pe card. Creionul adaugă o notă: ce a spus, cum a fost interviul, când poate începe.',
        'După interviu, dacă e bună: „Recomandat”. Se trimite notificarea și angajarea se decide separat.',
        '„Mesaje” → „Angajări”: conversațiile cu candidații.'],
      know: ['Când aplică cineva pentru clinicile tale, primești notificarea „CANDIDAT NOU”.', 'Nicio etapă nu face cont, contract sau salariu.'],
      never: 'Nu promiți salariu, contract sau dată de început. Spui doar ce scrie în anunț.' },
    { id: 'm-bani', t: 'Încasări și închiderea zilei', ic: 'wallet', roles: [M], place: 'manager.inchide', goL: 'Închide ziua',
      what: 'Fiecare plată pe clienta potrivită și casa care se potrivește cu sistemul.',
      do: ['„Încasare” sau „Încasează” din programare: suma, „Upsell” dacă a cumpărat ceva în plus, cum a plătit și cine a făcut tratamentul.',
        'În fiecare zi verifici în „Încasări” că fiecare plată e la clienta ei.',
        'Seara: „Închide ziua”, alegi clinica, scrii „Cash numărat” și „Card pe POS”. Portalul îți arată diferența față de sistem.',
        'La „Ce s-a întâmplat cu cash-ul”: „Păstrat pentru ridicare” sau „Depus în contul firmei”, cu suma depusă.'],
      know: ['Ce mai e de plătit din pachete vezi la „Rest de plată din pachete”.', 'Fiecare plată are bon fiscal sau factură.'],
      never: 'Corecturile și ștergerile de încasări nu se fac din contul tău. Rambursările da, pentru clinicile tale (lecția „Rambursări”).' },
    { id: 'rambursare', t: 'Rambursări', ic: 'undo', roles: [A, M], place: 'incasari', goL: 'Deschide Încasări',
      what: (r) => (r === A ? 'Banii dați înapoi unei cliente, pe plata ei, cu motivul.' : 'Banii dați înapoi unei cliente, pe plata ei, cu motivul. Le faci pentru clinicile tale.'),
      do: ['„Încasări”: apasă pe plata clientei.', 'Jos: „Rambursare”. Alegi „Plata asta” sau „Tot pachetul”, suma și motivul.',
        'Confirmi. Rambursarea apare în listă, iar comisionul scade singur cu 4% din banii dați înapoi.',
        'Greșită? Deschizi rambursarea din listă și o anulezi.'],
      know: (r) => (r === A ? ['Corectura sau ștergerea unei încasări se face tot din plata ei: „Salvează” sau „Șterge”. Le faci doar tu.']
        : ['Corectura sau ștergerea unei încasări nu e în contul tău: spui ce trebuie schimbat și se rezolvă.', 'La fiecare rambursare pleacă singură o notificare.']) },
    { id: 'm-fise', t: 'Fișe, calculator și oferte', ic: 'percent', roles: [M], place: 'calculator', goL: 'Deschide Calculatorul',
      what: 'Consultația se încheie cu un plan și o ofertă din „Calculator ofertă”, cu prețurile din „Oferte”.',
      do: ['În „Contacte” cauți clienta: fișele scanate, pozele înainte și după, istoricul.',
        '„Calculator ofertă”: alegi Față, Corp sau Epilare laser, tratamentul și ședințele; jos apar totalul și cele 4 oferte.',
        '„Salvează la clientă” pune programul în fișa ei. „Fișe de printat” → „Deschide PDF”.', '„Oferte”: ofertele active, cu butonul de copiere pentru WhatsApp.'],
      know: ['Cum se face consultația, pas cu pas, e la ușa „Consultația” din Traininguri.'],
      never: 'Nu dai prețuri sau oferte în afara celor din „Oferte”.' },
    { id: 'm-acte', t: 'Acte și autorizații', ic: 'file', roles: [M], place: 'acte', goL: 'Deschide Actele',
      what: 'Autorizațiile clinicilor tale și dosarul fiecărui om din echipă: ce e în regulă, ce lipsește, ce expiră.',
      do: ['Sus alegi clinica sau „Echipa”.', 'Apeși pe un document: alegi starea, scrii numărul, data emiterii și data expirării.',
        'Fotografiezi sau încarci actul. Notițele rămân la document.'],
      know: ['Primești notificare cu 30 de zile, cu 7 zile și în ziua în care expiră un act.', 'Contractul, REGES și actele adiționale ale colegelor nu le vezi: vezi doar dacă sunt în regulă.'] },
    { id: 'm-eu', t: 'Condica: a ta și a echipei', ic: 'clock', roles: [M], place: 'condica.derezolvat', goL: 'Deschide De rezolvat',
      what: 'Pontajul tău și pontajul de corectat al colegelor din clinicile tale.',
      do: ['Când vii: „Pontează sosirea”. Când pleci: „Pontează plecarea”.', 'Concediu: „Cererile mele” → „Cerere nouă”, apoi „Trimite cererea”.',
        '„De rezolvat”: zilele fără plecare, zilele de lucru fără pontaj, întârzierile și cererile de corectare ale colegelor. Apeși pe rând: „Corectează” (sau „Vezi” la o cerere).',
        'O zi lipsă: „Adaugă ziua”, cu orele ei din program. Dacă nu a lucrat: „Nu a lucrat”. O întârziere reală: „E corect”.',
        'Pontajul tău: „Cere corectarea”; nu îl corectezi singură.'],
      know: ['Fiecare corectare cere motivul și rămâne în istoric: cine, când, înainte și după.', 'Zilele peste sau sub program și concediile colegelor le decizi în Manager → „Echipa” → „De decis”.'] },
    { id: 'm-bonus', t: 'Bonusul tău și costurile variabile', ic: 'trophy', roles: [M], place: 'comision.bonus', goL: 'Deschide Bonusul',
      what: 'Bonusul tău e 5% din profitul clinicilor, în lunile în care toată echipa merge bine.',
      do: ['Condiția: fiecare cosmeticiană care a terminat trainingul încasează peste 1.500 lei pe zi lucrată. Cele încă în training nu intră în calcul.',
        '„Salariu” → „Bonusul”: vezi cine e peste și cine sub, apoi „Dacă luna se închide azi”: profitul estimat și bonusul.',
        '„Costuri variabile ale lunii”: la închiderea lunii scrii consumabilele și alte costuri, apoi „Trimite”. După verificare intră în calcul.'],
      know: ['Bonusul se calculează după ce se trec costurile lunii. Suma finală se confirmă la închiderea lunii.'] },

    // ---- the owner's pages (16.11)
    { id: 'a-aprobari', t: 'Aprobări', ic: 'checkCircle', roles: [A], place: 'aprobari', goL: 'Deschide Aprobări',
      what: 'Upsellurile cosmeticienelor care așteaptă, plus pontajul peste sau sub program și cererile de concediu.',
      do: ['Fiecare upsell: „Aprobă” sau „Respinge” (cu motivul, îl vede în „Salariu”). „Aprobă toate” când sunt mai multe.',
        'Comisionul e 4% din fiecare plată încasată pentru upsell. Aprobi o singură dată: plățile care vin după din el intră singure.',
        '„Pontaj: ore peste / sub program” și „Cereri de concediu”: aprobi sau respingi.'],
      know: ['Scurtături: A aprobă, R respinge primul upsell din listă.', '„Comision de plătit dacă aprobi” arată cât adaugă lista de acum.'] },
    { id: 'a-echipa', t: 'Echipa', ic: 'users', roles: [A], place: 'angajati', goL: 'Deschide Echipa',
      what: 'Oamenii, salariile, ajustările și condica tuturor.',
      do: ['„Oameni”: apeși pe cineva pentru profil, salariu, condică și vânzări. „Angajat nou” face contul.',
        '„Intră în cont”: vezi portalul exact cum îl vede ea, doar pentru privit.',
        '„Salarii”: salariul fiecăruia pe lună. La bonusul pe profit: „Confirmă la închiderea lunii”.',
        '„Ajustări”: comision sau ore adăugate de mână. „Condică”: pontajul tuturor. Candidații sunt în Pipeline → „Angajări”.'],
      know: ['Parola nouă o pui din profilul ei; o poate folosi imediat.'] },
    { id: 'a-cheltuieli', t: 'Cheltuieli', ic: 'receipt', roles: [A], place: 'cheltuieli', goL: 'Deschide Cheltuieli',
      what: 'Toate costurile lunii, într-o singură pagină: plățile fixe, taxele, salariile, consumabilele.',
      do: ['Alegi luna. Rândurile neplătite sau întârziate apar primele.', 'Apeși pe un rând ca să pui suma sau să-l bifezi plătit.',
        'Costurile trimise pentru bonusul pe profit apar sus: „Folosește” sau „Nu”.'],
      know: ['Profitul lunii și bonusul pe profit se calculează din costurile de aici.'] },
    { id: 'a-oferte', t: 'Oferte', ic: 'tag', roles: [A], place: 'oferte', goL: 'Deschide Oferte',
      what: 'Ofertele de pe site, din portal și din reclame, într-un singur loc.',
      do: ['Apeși pe o ofertă ca s-o schimbi: titlul, prețul, orașele, poza.', 'O ofertă oprită dispare de peste tot, dar rămâne aici.'],
      know: ['Echipa le vede singure în „Oferte”, iar Nuki le folosește în răspunsuri.'] },
    { id: 'a-activitate', t: 'Activitate', ic: 'clock', roles: [A], place: 'activitate', goL: 'Deschide Activitate',
      what: 'Cine a schimbat ce în portal: programări, încasări, setări, conținut.',
      do: ['Alegi „Azi”, „7 zile” sau „30 zile”.', 'Filtrezi după om sau după zonă. Apeși pe un rând ca să mergi la locul schimbării.'] },
    { id: 'a-integrari', t: 'Integrări', ic: 'layers', roles: [A], place: 'integrari', goL: 'Deschide Integrări',
      what: 'Legăturile portalului cu WhatsApp, Meta, myPOS și celelalte.',
      do: ['„Integrări”: starea fiecărei legături și butoanele ei.', '„Formulare Facebook” și „Șabloane WhatsApp” sunt în tab-urile de sus.'] },
  ];

  // ------------------------------------------------------------------ the questions people ask
  // q: how it is asked; by role: [answer, place id or ''] (no place: no button); a role missing: not in that account
  const NOT_MINE = 'Nu e în contul tău.';
  const FAQ = [
    { q: 'cum pun ore suplimentare? / cum văd când lucrează o cosmeticiană?', by: {
      admin: ['În Program echipă → „Pe săptămâni”, „+” de lângă zi: alegi orele și „Salvează”. În Calendar apar violet; gri sunt orele în care nu lucrează.', 'programari.echipa'],
      manager: ['În Program echipă → „Pe săptămâni”, „+” de lângă zi: alegi orele și „Salvează”. În Calendar apar violet; gri sunt orele în care nu lucrează.', 'programari.echipa'],
      receptie: ['Alege cosmeticiana din lista din Calendar: gri sunt orele în care nu lucrează, violet orele ei suplimentare, în care o poți programa. Orele suplimentare le pune cine face programul.', 'programari'],
      cosmetician: ['În Calendar, gri sunt orele în care nu lucrezi, violet orele tale suplimentare. Când primești ore suplimentare, primești notificare.', 'programari'] } },
    { q: 'unde mut pauza? / clienta vrea exact la ora pauzei', by: {
      admin: ['În Calendar apeși pe pauza cosmeticienei: „Mută pauza” pe altă jumătate de oră, „Fără pauză azi” sau „Înapoi la mijloc”.', 'programari.pauza'],
      manager: ['În Calendar apeși pe pauza cosmeticienei: „Mută pauza” pe altă jumătate de oră, „Fără pauză azi” sau „Înapoi la mijloc”.', 'programari.pauza'],
      receptie: ['Pauza se pune singură. Când clienta vrea la ora pauzei, faci programarea ca de obicei și alegi „Mută pauza la” una din orele propuse.', 'programari.new'],
      cosmetician: ['Pauza ta de 30 de minute apare singură în Calendar, la mijlocul programului. Se mută doar din Calendar, de cine are drept; dacă trebuie mutată, spune la recepție.', 'programari.pauza'] } },
    { q: 'cum fac o rambursare? / cum corectez sau șterg o încasare?', by: {
      admin: ['În Încasări apeși pe plată: „Rambursare” (plata asta sau tot pachetul, cu motivul). Corectura: schimbi și „Salvează”; ștergerea: „Șterge”.', 'incasari'],
      manager: ['Rambursarea, pentru clinicile tale: în Încasări apeși pe plată, apoi „Rambursare”. Corectura sau ștergerea unei încasări nu e în contul tău: spui ce trebuie schimbat și se rezolvă.', 'incasari'],
      receptie: [NOT_MINE + ' Spune ce s-a întâmplat (clienta, suma, motivul) și se rezolvă.', ''],
      cosmetician: [NOT_MINE + ' Spune la recepție ce s-a întâmplat.', ''] } },
    { q: 'lipsește un upsell de-al meu din comision', by: {
      cosmetician: ['În Salariu: „Adaugă comision”, completezi ce ai vândut și „Trimite la aprobare”.', 'comision.adauga'] } },
    { q: 'am vândut eu un pachet (la telefon): cum îl trec pe mine?', by: {
      manager: ['La încasarea clientei (prima ei vizită, chiar cu 0 lei acum): bifezi „Upsell” și la „Cine a vândut upsell-ul?” te alegi pe tine. Comisionul se aprobă separat și apare în Salariu.', 'incasari'],
      receptie: ['La încasarea clientei: bifezi „Upsell” și la „Cine a vândut upsell-ul?” alegi cine l-a vândut.', 'incasari'],
      admin: ['La încasare: „Upsell”, apoi „Cine a vândut upsell-ul?”. Comisionul apare în „Aprobări”.', 'incasari'] } },
    { q: 'de unde văd comisionul meu?', by: {
      cosmetician: ['În Salariu: comisionul e 4% din fiecare plată încasată pentru upsellurile tale; fiecare upsell se aprobă o singură dată.', 'comision'],
      receptie: ['Recepția nu are comision pe upselluri: are „Bonusul de programări”, în Salariu.', 'comision.bonus'],
      manager: ['Tu ai bonusul pe profit, în Salariu → „Bonusul”. Upsellurile vândute de tine aduc comision ca la cosmeticiene (4% din fiecare plată, după aprobare), tot în Salariu.', 'comision.bonus'],
      admin: ['Comisioanele echipei: „Aprobări” pentru upsellurile care așteaptă, „Echipa” → „Salarii” pentru sume.', 'aprobari'] } },
    { q: 'cât mai am până la bonus?', by: {
      receptie: ['În Salariu, cardul „Bonusul de programări” îți arată cât mai ai până la următorul prag.', 'comision.bonus'],
      manager: ['În Salariu → „Bonusul”: cine e peste 1.500 lei pe zi lucrată și „Dacă luna se închide azi”.', 'comision.bonus'],
      cosmetician: ['Tu ai comision, nu bonus: îl vezi în Salariu.', 'comision'],
      admin: ['Bonusul pe profit: „Echipa” → „Salarii”.', 'angajati.salarii'] } },
    { q: 'cum programez o clientă?', by: {
      admin: ['Calendar → „Programare”, completezi clienta, ora, locația, tratamentul și cosmeticiana, apoi „Programează”.', 'programari.new'],
      manager: ['Calendar → „Programare”, completezi clienta, ora, locația, tratamentul și cosmeticiana, apoi „Programează”.', 'programari.new'],
      receptie: ['Calendar → „Programare” (sau o oră liberă), completezi datele și „Programează”.', 'programari.new'],
      cosmetician: ['Programările le face recepția; tu le vezi în Calendar. Dacă o clientă vrea o programare, spune la recepție.', 'programari'] } },
    { q: 'unde încasez? / rest de plată din pachet', by: {
      admin: ['Încasări → „Încasare”. Restul din pachete e la „Rest de plată din pachete”.', 'incasari.new'],
      manager: ['Încasări → „Încasare”. Restul din pachete e la „Rest de plată din pachete”.', 'incasari.new'],
      receptie: ['Încasări → „Încasare” (sau „Încasează” din programare). Ce mai are de plătit din pachet vezi la „Rest de plată din pachete”.', 'incasari.new'],
      cosmetician: ['Încasările le face recepția.', ''] } },
    { q: 'ce mai are de plătit din pachet?', by: {
      admin: ['„Rest de plată din pachete”, în Încasări.', 'incasari.dues'], manager: ['„Rest de plată din pachete”, în Încasări.', 'incasari.dues'],
      receptie: ['„Rest de plată din pachete”, în Încasări. Când plătește, faci o încasare la programarea ei.', 'incasari.dues'],
      cosmetician: ['„Rest de plată din pachete”, în Încasări.', 'incasari.dues'] } },
    { q: 'programul pe o săptămână anume / tura de dimineață și de după-amiază / rotația fetelor', by: {
      admin: ['Calendar → „Program echipă” → „Pe săptămâni”: alegi săptămâna, schimbi orele, „Salvează săptămâna”. Pentru rotație: „Repetă” → „Alternează”.', 'programari.echipa'],
      manager: ['Calendar → „Program echipă” → „Pe săptămâni”: alegi săptămâna, schimbi orele, „Salvează săptămâna”. Pentru rotație: „Repetă” → „Alternează”.', 'programari.echipa'],
      receptie: ['Orele fiecărei cosmeticiene se văd în Calendar, pe zi.', 'programari'], cosmetician: ['Programul tău se vede în Calendar.', 'programari'] } },
    { q: 'programul fetelor / orele echipei pe săptămână', by: {
      admin: ['Calendar → „Program echipă”.', 'programari.echipa'], manager: ['Calendar → „Program echipă”.', 'programari.echipa'],
      receptie: ['Orele fiecărei cosmeticiene se văd în Calendar, pe zi.', 'programari'], cosmetician: ['Programul tău se vede în Calendar.', 'programari'] } },
    { q: 'aprob concedii și pontajul colegelor', by: {
      admin: ['„Aprobări”: „Pontaj: ore peste / sub program” și „Cereri de concediu”.', 'aprobari'],
      manager: ['Manager → „Echipa” → „De decis”: „Aprobă” sau „Respinge”. Pontajul de corectat e în Condică → „De rezolvat”.', 'manager.echipa'],
      receptie: [NOT_MINE, ''], cosmetician: [NOT_MINE, ''] } },
    { q: 'cum închid ziua / casa?', by: {
      admin: ['Manager → „Închide ziua”: clinica, „Cash numărat” și „Card pe POS”.', 'manager.inchide'],
      manager: ['„Închide ziua”: alegi clinica, scrii „Cash numărat” și „Card pe POS”.', 'manager.inchide'] } },
    { q: 'pe cine sun ca să umplu calendarul? / ore libere / clientele de sunat', by: {
      admin: ['Calendar → „Ore libere”: orele libere și „Pe cine suni”.', 'programari.orelibere'],
      manager: ['Calendar → „Ore libere”: orele libere și „Pe cine suni”.', 'programari.orelibere'],
      receptie: ['Leadurile de sunat sunt în Pipeline → „Coada de apeluri”.', 'pipeline.coada'] } },
    { q: 'candidații / angajări', by: {
      admin: ['Pipeline → „Angajări”: candidații pe etape; la cea angajată, „Creează contul”.', 'pipeline.angajari'],
      manager: ['Pipeline → „Angajări”: candidații pe etape.', 'pipeline.angajari'],
      receptie: [NOT_MINE, ''], cosmetician: [NOT_MINE, ''] } },
    { q: 'sun leadurile / leaduri noi', by: {
      admin: ['Pipeline → „Coada de apeluri”.', 'pipeline.coada'], manager: ['Pipeline → „Coada de apeluri”.', 'pipeline.coada'],
      receptie: ['Pipeline → „Coada de apeluri”: primul lead de sunat se deschide singur.', 'pipeline.coada'] } },
    { q: 'ce am de făcut azi?', by: {
      receptie: ['„Sarcini”: lista ta de azi și „De sunat azi”.', 'automatizari'], manager: ['„Sarcini”: lista ta de azi și „De sunat azi”.', 'automatizari'],
      cosmetician: ['Panoul: „Clientele mele azi”.', 'panou'], admin: ['Panou → „Azi”.', 'panou.azi'] } },
    { q: 'unde e regulamentul? / regulamentul intern', by: {
      receptie: ['Meniu → „Regulament intern”: îl citești în portal sau apeși „Descarcă”. La o versiune nouă confirmi o singură dată, la final, cu „Am citit regulamentul”.', 'regulament'], cosmetician: ['Meniu → „Regulament intern”: îl citești în portal sau apeși „Descarcă”. La o versiune nouă confirmi o singură dată, la final, cu „Am citit regulamentul”.', 'regulament'],
      manager: ['„Regulament intern”: textul în vigoare, cine a confirmat și cine nu încă. O versiune nouă (PDF): „Versiune nouă”, iar cele de dinainte rămân, cu data lor. Confirmarea ta: la final, „Am citit regulamentul”.', 'regulament'], admin: ['„Regulament intern”: textul în vigoare, cine a confirmat și cine nu încă. O versiune nouă (PDF): „Versiune nouă”, iar cele de dinainte rămân, cu data lor.', 'regulament'] } },
    { q: 'pot să programez eu? / pot muta sau anula o programare?', by: {
      cosmetician: ['Nu. Programările le face, le mută și le anulează doar recepția, iar clientei nu-i propui tu ore. Tu marchezi ședințele tale „Finalizată” sau „Nu a venit”, scrii notițe, pui pozele și fișa și faci oferta.', 'programari'],
      receptie: ['Doar recepția programează, mută și anulează programările: Calendar → „Programare” sau o oră liberă.', 'programari.new'], manager: ['Doar recepția programează, mută și anulează programările: Calendar → „Programare” sau o oră liberă.', 'programari.new'], admin: ['Doar recepția programează, mută și anulează programările: Calendar → „Programare” sau o oră liberă.', 'programari.new'] } },
    { q: 'ce fac dacă s-a decalat programul? / am întârziere cu clientele', by: {
      cosmetician: ['Faci doar consultația, cu fișa completată în cabină și scanată în aceeași zi. Procedura o programează recepția în altă zi.', 'programari'],
      receptie: ['Dacă programul s-a decalat, cosmeticiana face doar consultația, iar procedura o programezi în altă zi: Calendar → „Programare”.', 'programari.new'], manager: ['Dacă programul s-a decalat, cosmeticiana face doar consultația, iar procedura o programezi în altă zi: Calendar → „Programare”.', 'programari.new'], admin: ['Dacă programul s-a decalat, cosmeticiana face doar consultația, iar procedura o programezi în altă zi: Calendar → „Programare”.', 'programari.new'] } },
    { q: 'cu cât timp înainte cer concediul?', by: {
      receptie: ['Cu cel puțin 2 luni înainte, din Condică → „Cerere nouă”: formularul îți arată „Cel mai devreme”. Mai devreme doar ca „Situație specială”, cu motivul scris. Concediul medical nu intră aici.', 'condica.noua'], cosmetician: ['Cu cel puțin 2 luni înainte, din Condică → „Cerere nouă”: formularul îți arată „Cel mai devreme”. Mai devreme doar ca „Situație specială”, cu motivul scris. Concediul medical nu intră aici.', 'condica.noua'], manager: ['Cu cel puțin 2 luni înainte, din Condică → „Cerere nouă”: formularul îți arată „Cel mai devreme”. Mai devreme doar ca „Situație specială”, cu motivul scris. Concediul medical nu intră aici. Cererile echipei sub 2 luni vin marcate „sub 2 luni”, cu motivul.', 'condica.noua'],
      admin: ['Concediul de odihnă se cere cu cel puțin 2 luni înainte. Cererile mai târzii vin marcate „sub 2 luni”, cu motivul, în „Aprobări”.', 'aprobari'] } },
    { q: 'unde văd orele de recuperat?', by: {
      receptie: ['Condică → „Orele mele”: cât ai de recuperat și ce ai lucrat în plus. Le recuperezi în intervalele stabilite pentru tine.', 'condica.ore'],
      cosmetician: ['Condică → „Orele mele”: cât ai de recuperat și ce ai lucrat în plus. Le recuperezi în intervalele stabilite pentru tine.', 'condica.ore'],
      manager: ['Manager → „Reguli”: întârzierile față de Program echipă, turele fără pontaj, vizitele nemarcate, fișele și pozele lipsă, concediile sub 2 luni și orele de recuperat, azi sau pe 7 zile. Apeși pe un rând și ajungi unde se rezolvă.', 'manager.reguli'], admin: ['Manager → „Reguli”: întârzierile față de Program echipă, turele fără pontaj, vizitele nemarcate, fișele și pozele lipsă, concediile sub 2 luni și orele de recuperat, azi sau pe 7 zile. Apeși pe un rând și ajungi unde se rezolvă.', 'manager.reguli'] } },
    { q: 'se respectă regulamentul? / întârzieri, vizite nemarcate, fișe lipsă', by: {
      manager: ['Manager → „Reguli”: întârzierile față de Program echipă, turele fără pontaj, vizitele nemarcate, fișele și pozele lipsă, concediile sub 2 luni și orele de recuperat, azi sau pe 7 zile. Apeși pe un rând și ajungi unde se rezolvă.', 'manager.reguli'], admin: ['Manager → „Reguli”: întârzierile față de Program echipă, turele fără pontaj, vizitele nemarcate, fișele și pozele lipsă, concediile sub 2 luni și orele de recuperat, azi sau pe 7 zile. Apeși pe un rând și ajungi unde se rezolvă.', 'manager.reguli'] } },
    { q: 'vreau concediu', by: {
      receptie: ['Condică → „Cererile mele” → „Cerere nouă”, apoi „Trimite cererea”. Concediul se cere cu cel puțin 2 luni înainte.', 'condica.noua'],
      cosmetician: ['Condică → „Cererile mele” → „Cerere nouă”, apoi „Trimite cererea”. Concediul se cere cu cel puțin 2 luni înainte.', 'condica.noua'],
      manager: ['Condică → „Cererile mele” → „Cerere nouă”, apoi „Trimite cererea”. Concediul se cere cu cel puțin 2 luni înainte.', 'condica.noua'],
      admin: ['Concediile echipei: „Aprobări” → „Cereri de concediu”.', 'aprobari'] } },
    { q: 'cum pontez?', by: {
      receptie: ['Panou sau Condică: „Pontează sosirea” când vii, „Pontează plecarea” când pleci.', 'condica'],
      cosmetician: ['Panou sau Condică: „Pontează sosirea” când vii, „Pontează plecarea” când pleci.', 'condica'],
      manager: ['Panou sau Condică: „Pontează sosirea” și „Pontează plecarea”.', 'condica'],
      admin: ['Pontajul tuturor: „Echipa” → „Condică”.', 'angajati.condica'] } },
    { q: 'am uitat să pontez / am uitat să mă pontez / mi-a ieșit greșit pontajul', by: {
      receptie: ['În aceeași zi: Condică → „Cere corectarea”, alegi ziua, pui orele reale și scrii de ce. Se aprobă din Condică.', 'condica'],
      cosmetician: ['În aceeași zi: Condică → „Cere corectarea”, alegi ziua, pui orele reale și scrii de ce. Se aprobă din Condică.', 'condica'],
      manager: ['Pentru pontajul tău, în aceeași zi: Condică → „Cere corectarea”, cu orele reale și motivul.', 'condica'],
      admin: ['„Echipa” → „Condică”: „De rezolvat”, apoi „Corectează”.', 'angajati.condica'] } },
    { q: 'corectez pontajul colegelor / o zi fără pontaj / cererile de corectare', by: {
      manager: ['Condică → „De rezolvat”: apeși pe rând și „Corectează” (la o cerere „Vezi”). O zi lipsă: „Adaugă ziua”. Motivul e obligatoriu și rămâne în istoric.', 'condica.derezolvat'],
      admin: ['„Echipa” → „Condică” → „De rezolvat”: „Corectează”, sau „Vezi” la o cerere.', 'angajati.condica'],
      receptie: [NOT_MINE + ' Pentru o zi a ta: Condică → „Cere corectarea”.', 'condica'], cosmetician: [NOT_MINE + ' Pentru o zi a ta: Condică → „Cere corectarea”.', 'condica'] } },
    { q: 'au trecut 24 de ore, nu-i mai pot scrie clientei', by: {
      admin: ['În conversație: „Trimite un șablon”. După ce răspunde, scrii normal.', 'mesaje'], manager: ['În conversație: „Trimite un șablon”. După ce răspunde, scrii normal.', 'mesaje'],
      receptie: ['În conversație: „Trimite un șablon”. După ce răspunde, scrii normal.', 'mesaje'], cosmetician: ['În conversație: „Trimite un șablon”. După ce răspunde, scrii normal.', 'mesaje'] } },
    { q: 'poze înainte/după / scanez fișa', by: {
      admin: ['Contacte → clienta → „Poze înainte / după” sau „Fișe & mențiuni” → „Scanează fișa”.', 'contacte'],
      manager: ['Contacte → clienta → „Poze înainte / după” sau „Fișe & mențiuni” → „Scanează fișa”.', 'contacte'],
      receptie: ['Contacte → clienta → „Poze înainte / după” sau „Fișe & mențiuni” → „Scanează fișa”.', 'contacte'],
      cosmetician: ['Contacte → clienta → „Poze înainte / după” sau „Fișe & mențiuni” → „Scanează fișa”.', 'contacte'] } },
    { q: 'oferta pentru clientă / calculez prețul', by: {
      admin: ['„Calculator ofertă”.', 'calculator'], manager: ['„Calculator ofertă”, cu prețurile din „Oferte”.', 'calculator'],
      receptie: ['„Calculator ofertă”, cu prețurile din „Oferte”.', 'calculator'], cosmetician: ['„Calculator ofertă”: programul și cele 4 oferte, apoi „Salvează la clientă”.', 'calculator'] } },
    { q: 'mut o programare', by: {
      admin: ['În Calendar o tragi pe altă oră (pe telefon ții apăsat, apoi tragi).', 'programari'], manager: ['În Calendar o tragi pe altă oră (pe telefon ții apăsat, apoi tragi).', 'programari'],
      receptie: ['În Calendar o tragi pe altă oră (pe telefon ții apăsat, apoi tragi).', 'programari'],
      cosmetician: [NOT_MINE + ' Programările le mută recepția: spune-i ce trebuie schimbat.', ''] } },
    { q: 'cât câștigă colegele / profitul / salariile colegelor', by: {
      admin: ['„Echipa” → „Salarii”; profitul lunii e în „Cheltuieli”.', 'angajati.salarii'],
      manager: [NOT_MINE + ' Salariile și comisioanele colegelor și profitul clinicii nu se văd din contul tău.', ''],
      receptie: [NOT_MINE + ' Vezi doar salariul tău, în Salariu.', ''], cosmetician: [NOT_MINE + ' Vezi doar salariul tău, în Salariu.', ''] } },
    { q: 'consumabilele / costurile lunii', by: {
      manager: ['Salariu → „Costuri variabile ale lunii”: scrii consumabilele și alte costuri, apoi „Trimite”.', 'comision.costuri'],
      admin: ['„Cheltuieli”: toate costurile lunii. Costurile trimise pentru bonus apar sus, cu „Folosește”.', 'cheltuieli'] } },
    { q: 'propunerea de costuri trimisă pentru bonus', by: { admin: ['„Cheltuieli”, sus: „Folosește” sau „Nu”.', 'cheltuieli.propunere'] } },
    { q: 'aprob comisioanele / upsellurile', by: { admin: ['„Aprobări”: „Aprobă” sau „Respinge” la fiecare upsell; „Aprobă toate” când sunt mai multe.', 'aprobari'],
      manager: [NOT_MINE + ' Comisionul upsellurilor vândute de tine se aprobă separat, nu din contul tău.', ''], receptie: [NOT_MINE, ''], cosmetician: ['Upsellurile tale se aprobă separat; până atunci comisionul apare „În așteptare”, în Salariu.', 'comision'] } },
    { q: 'salariile / confirm bonusul pe profit al colegei care conduce clinicile', by: { admin: ['„Echipa” → „Salarii”. Bonusul pe profit: „Confirmă la închiderea lunii”.', 'angajati.salarii'] } },
    { q: 'văd portalul ca o colegă', by: { admin: ['„Echipa”: apeși pe ea, apoi „Intră în cont”.', 'angajati'] } },
    { q: 'cine a schimbat ceva?', by: { admin: ['„Activitate”: cine a schimbat ce, pe zile.', 'activitate'] } },
    { q: 'oferte și prețuri: unde le schimb?', by: { admin: ['„Oferte” din meniul Admin.', 'oferte'],
      manager: ['Ofertele nu se schimbă din contul tău; le vezi în „Oferte”.', 'ofertele'], receptie: ['Ofertele nu se schimbă din contul tău; le vezi în „Oferte”.', 'ofertele'],
      cosmetician: ['Ofertele nu se schimbă din contul tău; le vezi în „Oferte”.', 'ofertele'] } },
  ];

  // ------------------------------------------------------------------ helpers
  const val = (v, r) => (typeof v === 'function' ? v(r) : v);
  const can = (id, role) => !!(PLACES[id] && PLACES[id].roles.includes(role));
  function lessonsFor(role) {
    return LESSONS.filter((x) => x.roles.includes(role)).map((x) => ({ id: x.id, t: x.t, ic: x.ic, place: val(x.place, role), goL: x.goL,
      what: val(x.what, role), do: val(x.do, role) || [], know: val(x.know, role) || [], never: val(x.never, role) || '' }));
  }
  function faqFor(role) {
    return FAQ.filter((f) => f.by[role]).map((f) => ({ q: f.q, a: f.by[role][0], place: f.by[role][1] || '' }));
  }
  function forRole(role) {
    const places = {};
    Object.keys(PLACES).forEach((id) => { if (can(id, role)) places[id] = PLACES[id]; });
    return { places, lessons: lessonsFor(role), faq: faqFor(role) };
  }
  // the map as Nuki reads it (api/portal-nuki.js): this role's places, lessons and answers, nothing of another role's
  function promptText(role) {
    const m = forRole(role);
    const out = ['Harta portalului pentru contul ' + (ROLE_LABEL[role] || role) + '. E tot ce există în contul ăsta; altceva nu e în contul ăsta.', '',
      'Locurile (id: unde e):'];
    Object.keys(m.places).forEach((id) => out.push('- ' + id + ': ' + m.places[id].title));
    out.push('', 'Lecțiile (ce scrie pe ecran, pas cu pas):');
    m.lessons.forEach((l) => {
      out.push('', '## ' + l.t + ' [' + l.place + ']', 'La ce e bun: ' + l.what);
      l.do.forEach((d, i) => out.push((i + 1) + '. ' + d));
      if (l.know.length) out.push('Bine de știut: ' + l.know.join(' '));
      if (l.never) out.push('Niciodată: ' + l.never);
    });
    out.push('', 'Întrebări frecvente (răspunsul potrivit acestui cont, apoi locul):');
    m.faq.forEach((f) => out.push('- „' + f.q + '” → ' + f.a + (f.place ? ' [[du:' + f.place + ']]' : ' (fără buton)')));
    return out.join('\n');
  }
  return { PLACES, LESSONS, FAQ, ROLES: ALL, ROLE_LABEL, can, forRole, promptText, lessons: lessonsFor, faq: faqFor };
});
