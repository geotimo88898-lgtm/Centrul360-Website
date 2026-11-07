// Traininguri → „Portalul”: how to use the portal, lesson by lesson, for the receptionist and for the cosmetician
// (the owner, 7.11: „o secțiune la traininguri cu cum se folosește portalul, pe lângă alea 3”). Every label in
// „quotes” is the exact text on the screen, so what she reads here is what she sees there. Each lesson ends with a
// button that opens the section itself.
//   window.C360Guide.lessons(role) → [lesson] · .html(role, cur, done, icon) → markup · .KEY (what she learned, this device)
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const R = 'receptie', C = 'cosmetician';
  // id, title, icon, roles, the section it opens (a menu id, or 'account' / 'notif'), the button's words,
  // what it is for, the steps, good to know, never; a function of the role where the two differ
  const L = [
    { id: 'start', t: 'Intri în portal', ic: 'key', roles: [R, C], go: 'account', goL: 'Deschide „Contul meu”',
      what: 'Portalul e locul unde lucrezi toată ziua: programări, cliente, mesaje și bani.',
      do: ['Deschide staff.centrul360.com sau aplicația Centrul360 de pe telefon.', 'Scrie „Utilizator” și „Parolă”, apoi apasă „Intră în portal”.',
        'Prima dată îți schimbi parola: apasă pe cercul cu inițialele tale, sus în dreapta, apoi „Contul meu” → „Schimbă parola”. Pe telefon: „Meniu”, jos, apoi „Contul meu”.',
        'Tot din „Contul meu” îți pui poza și alegi „Pagina de start”.'],
      know: ['Rămâi conectată 90 de zile, cât timp folosești portalul.', 'După 5 parole greșite aștepți 15 minute.', 'Datele se actualizează singure. Pe telefon tragi de sus în jos ca să reîncarci.'],
      never: 'Nu dai parola nimănui. Dacă ai uitat-o, ceri una nouă de la administrator.' },
    { id: 'telefon', t: 'Portalul pe telefon', ic: 'bell', roles: [R, C], go: 'notif', goL: 'Deschide notificările',
      what: 'Pui portalul pe telefon ca o aplicație și primești notificări cu leadurile, programările și răspunsurile.',
      do: ['iPhone: deschide portalul în Safari, apasă „Distribuie” (pătratul cu săgeata în sus), apoi „Adaugă pe ecranul principal” și „Adaugă”.',
        'Android: apasă „Descarcă aplicația Centrul360”, deschide fișierul „centrul360.apk” și apasă „Instalează”.',
        'Deschide „Centrul360” de pe ecran și intră în cont.', 'Apasă „Pornește” la notificări. Primești imediat o notificare de test.'],
      know: ['Pe iPhone notificările merg doar din aplicația pusă pe ecranul principal.', 'O apăsare pe notificare te duce exact la secțiunea ei.', 'Toate notificările le găsești și în clopoțelul de sus.'] },
    { id: 'panou', t: 'Panoul', ic: 'target', roles: [R, C], go: 'panou', goL: 'Deschide Panoul',
      what: (r) => (r === R ? 'Ziua ta dintr-o privire: ce e de încasat, de confirmat și de sunat azi.' : 'Ziua ta dintr-o privire: clientele tale de azi și comisionul.'),
      do: (r) => (r === R
        ? ['Citește rândul de sus: câte programări ai azi și câte sunt de confirmat. Fiecare bucată se apasă.', 'Butoanele mari: „Încasare”, „Programare”, „Lead”, „Coada de apeluri”.',
          'Cifrele „Încasat azi”, „De confirmat”, „Programări azi” și „De sunat acum” se apasă și te duc la listă.', '„Ziua de azi”: apasă pe o programare ca s-o deschizi în Calendar.']
        : ['Butoanele mari: „Calendarul meu”, „Fișe și poze”, „Salariul meu”, „Traininguri”.', '„Clientele mele azi”: apasă pe o clientă ca să vezi programarea.',
          'Cifrele de sus („Clientele mele azi”, „Comision luna aceasta”, „În așteptare”) se apasă și te duc la detalii.']),
      know: ['Panoul se actualizează singur în fiecare minut.', 'Din „Personalizează” alegi ce cifre vezi sus.'] },
    { id: 'calendar', t: 'Calendarul', ic: 'calendar', roles: [R, C], go: 'programari', goL: 'Deschide Calendarul',
      what: (r) => (r === R ? 'Calendarul comun al celor două clinici. Aici faci, confirmi și muți programările.' : 'Programările clinicii tale. Le face și le modifică recepția, tu le vezi.'),
      do: (r) => (r === R
        ? ['Apasă „Programare” sau pe o oră liberă. Completezi „Client”, „Telefon”, ora, „Locație”, „Tratament” și „Cosmeticiană”, apoi apeși „Programează”.',
          'Ca să confirmi: apasă pe programare și alege „Confirmată”. Cele albastre sunt încă neconfirmate.',
          'Ca s-o muți: o tragi pe altă oră. Pe telefon ții apăsat puțin, apoi tragi.',
          'Dacă se anulează, alegi „Anulată”. „Șterge” e doar pentru greșeli.', '„Blochează timp” pentru pauze sau ore în care nu se lucrează.']
        : ['Alege „Doar ale mele” ca să vezi doar clientele tale.', '„Zi” sau „Săptămână”, iar cu săgețile schimbi ziua.',
          'Apasă pe o programare: vezi tratamentul, ora și observațiile.', 'Din programare apasă „Fișa clientei și pozele”.']),
      know: (r) => (r === R
        ? ['Clienta primește singură confirmarea, apoi cu o zi înainte, la 9:00, un mesaj cu „Da, ajung” și „Nu ajung”, apoi cu 2 ore înainte un mesaj cu parcarea.',
          'Dacă răspunde „Da, ajung”, programarea devine Confirmată singură. Dacă răspunde „Nu ajung”, devine Anulată și primești notificare.', 'Programările făcute de clienți pe site apar cu „Online”.']
        : ['Dacă trebuie schimbat ceva la o programare, îi spui recepției.']) },
    { id: 'mesaje', t: 'Mesaje', ic: 'chat', roles: [R, C], go: 'mesaje', goL: 'Deschide Mesaje',
      what: 'WhatsApp-ul clinicilor, plus Instagram și Facebook, într-un singur loc.',
      do: (r) => ['Alege conversația din listă. „Necitite” îți arată ce n-ai văzut încă.', 'Scrii în „Scrie un mesaj…” și trimiți cu săgeata.',
        '„+” are mesajele rapide. „{prenume}” se completează singur cu prenumele ei.', 'Dacă au trecut 24 de ore de la ultimul ei mesaj, îi poți scrie doar cu „Trimite un șablon”.']
        .concat(r === R ? ['Sus, în conversație: „Sună”, „Programează” (cu datele ei deja completate) și „Deschide leadul”.'] : ['Sus, în conversație: „Sună”.']),
      know: ['Bifele arată Trimis, Livrat și Văzut. Un mesaj nelivrat dă alertă.', 'Poți trimite „Catalogul de rezultate” direct din conversație.'] },
    { id: 'pipeline', t: 'Leadurile (Pipeline)', ic: 'trend', roles: [R], go: 'pipeline', goL: 'Deschide Pipeline',
      what: 'Leadurile, pe etape, de la primul telefon până devin cliente.',
      do: ['Apasă „Coada de apeluri”: se deschide primul lead de sunat. Apasă „Sună”.',
        'După apel alegi cum a mers (de exemplu „Vrea programare” sau „Nu răspunde”), scrii pe scurt ce a spus și alegi „Revin la ea”.',
        'Apasă „Salvează contactul”: trece singur la următorul lead.', 'Dacă vrea programare, butonul mare „Programează” îi completează datele.',
        '„Lead nou” e pentru cineva care a sunat sau a venit direct la clinică.'],
      know: ['Leadurile din Facebook și de pe site apar singure, cu notificarea „LEAD NOU”.', 'O programare mută singură leadul în „Programare stabilită”.',
        'Salvarea contactului nu mută etapa: etapa o muți tu.'],
      never: 'Nu lași un lead nou nesunat. Suni în primele 5 minute.' },
    { id: 'sarcini', t: 'Sarcini', ic: 'listCheck', roles: [R], go: 'automatizari', goL: 'Deschide Sarcini',
      what: 'Lista ta de făcut azi și leadurile de sunat azi.',
      do: ['„Adaugă sarcină”: scrii ce trebuie făcut, alegi „Când” și apeși „Adaugă”.', 'Bifezi cu „Gata” ce ai terminat.',
        '„De sunat azi” arată leadurile la care ai ales „Revin la ea” pentru azi.'],
      know: ['Un lead iese singur din „De sunat azi” după ce îi salvezi contactul în Pipeline.'] },
    { id: 'incasari', t: 'Încasări', ic: 'wallet', roles: [R], go: 'incasari', goL: 'Deschide Încasări',
      what: 'Banii încasați. Orice încasare pornește de la o programare.',
      do: ['Apasă „Încasare” sau „Încasează” din programare.', 'Alegi orașul, ziua și programarea.',
        'Scrii cât a plătit. Bifezi „Upsell” dacă a cumpărat ceva în plus.', 'Alegi cum a plătit: Card, Cash, Transfer sau Cash + card.',
        'Alegi cine a făcut tratamentul și apeși „Încasează”.'],
      know: ['Programarea devine „Finalizată” singură.', 'Ce mai e de plătit din pachete vezi la „Rest de plată din pachete”.'],
      never: 'O încasare greșită o corectează doar administratorul. Spune-i ce trebuie schimbat.' },
    { id: 'contacte', t: 'Fișe și poze', ic: 'image', roles: [R, C], go: 'contacte', goL: 'Deschide Contacte',
      what: 'Fișa fiecărei cliente: fișe scanate, mențiuni, poze înainte și după, istoric.',
      do: ['În „Contacte” cauți clienta după nume sau telefon.', '„Fișe & mențiuni” → „Scanează fișa”: fotografiezi fiecare pagină a fișei semnate.',
        '„Poze înainte / după” → „Începe Ședința 1” (sau „Adaugă Ședința N”), apoi apeși pe ÎNAINTE și pe DUPĂ.',
        '„Acord pentru publicarea pozelor”: alegi ce a spus ea.', '„Trimite rezultatele” îi trimite pozele pe WhatsApp.'],
      know: ['Imaginea înainte și după se face singură când ai ambele poze.', '„Istoric” arată ultima vizită, programările și ce a plătit.'],
      never: 'Fără acordul ei, pozele nu se publică nicăieri.' },
    { id: 'calculator', t: 'Calculatorul și fișele', ic: 'percent', roles: [C], go: 'calculator', goL: 'Deschide Calculatorul',
      what: 'Faci programul clientei și cele 4 oferte, apoi printezi fișa.',
      do: ['În „Calculator ofertă” alegi Față, Corp sau Epilare laser, apeși pe tratament și pui ședințele cu − și +.',
        'Jos apar totalul și cele 4 oferte, în ordinea în care i le arăți.', '„Salvează la clientă” pune programul în fișa ei din Contacte.',
        'În „Fișe de printat” alegi fișa și apeși „Deschide PDF”.'],
      know: ['Prețurile vin singure, după orașul tău.', 'Cum se completează fiecare pagină a fișei e explicat la ușa „Consultația”.'] },
    { id: 'salariu', t: 'Salariu', ic: 'cash', roles: [R, C], go: 'comision', goL: 'Deschide Salariu',
      what: (r) => (r === R ? 'Cât iei luna asta: salariul de bază, orele suplimentare și bonusul de programări.' : 'Cât iei luna asta: salariul de bază, orele suplimentare și comisionul.'),
      do: (r) => ['Vezi „Salariul tău” pe luna curentă. Cu săgețile vezi lunile trecute.'].concat(r === R
        ? ['Cardul „Bonusul de programări” îți arată cât mai ai până la următorul prag.']
        : ['Comisionul apare după ce îl aprobă administratorul.', 'Dacă lipsește un upsell: „Adaugă comision”, completezi ce ai vândut și apeși „Trimite la aprobare”.']),
      know: (r) => (r === R ? ['Bonusul vine singur, cu notificarea „BONUS”.', 'Media pe zi se calculează doar din zilele în care ai pontat sosirea.']
        : ['Primești notificarea „COMISION ✅” sau „COMISION ❌”.']) },
    { id: 'condica', t: 'Condică', ic: 'clock', roles: [R, C], go: 'condica', goL: 'Deschide Condica',
      what: 'Pontajul, orele și concediile tale.',
      do: ['Când vii: „Pontează sosirea”. Când pleci: „Pontează plecarea”.', 'Concediu: „Cererile mele” → „Cerere nouă”, alegi tipul și datele, apoi „Trimite cererea”.',
        '„Orele mele” arată orele de recuperat, orele suplimentare și zilele de concediu.'],
      know: ['Programul e luni-vineri, 8 ore cu pauza. Cu 15 minute în plus sau în minus, ziua merge la aprobare.', 'Dacă n-ai pontat sosirea până la 13:00, portalul îți amintește.'] },
    { id: 'oferte', t: 'Ofertele', ic: 'tag', roles: [R, C], go: 'ofertele', goL: 'Deschide Ofertele',
      what: 'Ofertele active, exact ca pe site.',
      do: ['Caută oferta.', 'Apasă butonul de copiere: textul e gata de trimis pe WhatsApp.'],
      know: ['Ofertele le schimbă doar administratorul. Aici apar singure.'] },
  ];
  const val = (v, r) => (typeof v === 'function' ? v(r) : v);
  function lessons(role) {
    return L.filter((x) => x.roles.includes(role)).map((x) => ({ id: x.id, t: x.t, ic: x.ic, go: x.go, goL: x.goL, what: val(x.what, role), do: val(x.do, role) || [], know: val(x.know, role) || [], never: val(x.never, role) || '' }));
  }
  const KEY = 'c360_guide_done_v1';
  function html(role, cur, done, icon) {
    const list = lessons(role);
    const n = list.filter((x) => done.has(x.id)).length;
    const i = Math.max(0, Math.min(list.length - 1, cur));
    const x = list[i];
    return '<div class="tr-jhead"><div><b>' + n + ' din ' + list.length + '</b><span>lecții învățate</span></div><div class="tr-jbar"><i style="--w:' + Math.round(n / list.length * 100) + '%"></i></div></div>' +
      '<div class="gd-list">' + list.map((l, k) => '<button type="button" class="gd-l' + (done.has(l.id) ? ' is-done' : '') + (k === i ? ' is-cur' : '') + '" data-glesson="' + k + '" style="--i:' + k + '">' +
        '<span class="gd-ic">' + (done.has(l.id) ? icon('check') : icon(l.ic)) + '</span><b>' + esc(l.t) + '</b></button>').join('') + '</div>' +
      '<div class="tr-step gd-step" data-gsheet>' +
        '<div class="tr-step-top"><span class="tr-step-stage">Portalul</span><span class="tr-step-n">Lecția ' + (i + 1) + ' din ' + list.length + '</span></div>' +
        '<h3 class="tr-step-t"><span>' + icon(x.ic) + '</span>' + esc(x.t) + '</h3>' +
        '<div class="tr-whybox"><b>La ce e bun?</b><span>' + esc(x.what) + '</span></div>' +
        '<ul class="tr-dos">' + x.do.map((d, k) => '<li style="--k:' + k + '"><i>' + (k + 1) + '</i>' + esc(d) + '</li>').join('') + '</ul>' +
        (x.know.length ? '<div class="tr-more"><b>' + icon('info') + 'Bine de știut</b><ul>' + x.know.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul></div>' : '') +
        (x.never ? '<div class="tr-never">' + icon('alert') + '<span>' + esc(x.never) + '</span></div>' : '') +
        '<div class="tr-golinks"><button type="button" class="k-btn is-outline" data-ggo="' + esc(x.go) + '">' + esc(x.goL) + icon('right') + '</button></div>' +
        '<div class="tr-step-nav"><button type="button" class="k-btn is-ghost" data-glesson="' + (i - 1) + '"' + (i ? '' : ' disabled') + '>' + icon('left') + 'Înapoi</button><span class="k-grow"></span>' +
          '<button type="button" class="k-btn is-primary is-lg tr-got" data-gdone="' + i + '">' + (done.has(x.id) ? icon('check') + 'Învățat' : 'Am înțeles') + (i < list.length - 1 ? icon('right') : '') + '</button></div>' +
      '</div>';
  }
  window.C360Guide = { lessons, html, KEY };
})();
