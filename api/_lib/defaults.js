// Default config.json seed — used the first time the portal runs (before the owner has
// adjusted anything in Setări). All of this is editable later through the portal UI
// (commission %, race bonus, company goal) or through the Setări → Conținut tab
// (resources). Nothing here is hardcoded into the pages themselves.

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function defaultConfig() {
  return {
    // % commission on the sale amount, per treatment category.
    commissionRates: {
      'epilare-laser': 10,
      'hifu': 10,
      'liposonix': 10,
      'ems-tonifiere': 10,
      'radiofrecventa': 10,
      'microneedling': 10,
      'tratament-facial': 10,
      'celulita': 10,
      'detox-drenaj': 10,
      'altele': 10,
    },
    // % commission on retail / home-care product upsells (separate, usually higher).
    retailRate: 15,
    // Monthly "race bonus": whoever logs the most approved sales in `category` by
    // `target` count during `month` gets `reward` RON. The leaderboard in Panou shows
    // live progress toward `target` for everyone, regardless of who's ahead.
    raceBonus: {
      category: 'hifu',
      target: 10,
      reward: 150,
      month: currentMonth(),
    },
    // Company-wide revenue goal for the current month, across both locations. When the
    // sum of all *approved* sales in `month` reaches `target`, every active employee
    // gets `reward` RON. PLACEHOLDER VALUES — the owner must adjust these in Setări.
    companyGoal: {
      target: 25000, // PLACEHOLDER — owner must set a real monthly target
      reward: 100,
      month: currentMonth(),
    },
    // Read-only reference material shown in the "Resurse" tab, editable as plain text
    // from Setări → Conținut (no code changes ever needed to update these).
    resources: {
      upsellPackages: [
        'HIFU full face → propune pachet de 3 ședințe cu reducere 10% la achiziția integrală; menționează rezultatul vizibil progresiv la 2-3 luni.',
        'Epilare laser (Elysion Pro) → upsell firesc spre pachet de zonă extinsă (ex: subsuori + bikini + picior inferior) cu discount pe pachet față de ședințe separate.',
        'Liposonix / RF Sculpt → recomandă cură completă (4-6 ședințe) + produs de îngrijire post-tratament (cremă fermitate) ca upsell retail.',
        'Microneedling → combinație cu ser cu acid hialuronic sau vitamina C vândut acasă pentru client, explicând rolul lui în recuperare.',
        'Tratamente faciale (hidratare / ten problematic / anti-pigmentare) → propune abonament lunar de întreținere (1 ședință/lună) cu preț preferențial.',
        'Celulită / detox-drenaj → pachet dublu: ședințe în clinică + produs de drenaj limfatic de uz casnic.',
        'EMS tonifiere → upsell spre pachet combinat cu RF Sculpt pentru zone cu țesut adipos + tonus muscular scăzut.',
      ],
      upcomingOffers: [
        'Actualizează această secțiune din Setări → Conținut cu ofertele active (campanii sezoniere, reduceri de lansare, pachete cadou).',
        'Exemplu: "Reducere 15% la pachete HIFU full face în luna curentă — valabil doar la plata integrală în avans."',
      ],
      receptionScripts: [
        'Preluare telefonică programare: "Bună ziua, ați sunat la Centrul360. Cu ce vă pot ajuta? Pentru ce tratament doriți să vă programați și la ce locație — Timișoara sau Arad?"',
        'Confirmare programare: repetă data, ora, tratamentul și locația; menționează avansul de 49 RON dacă e cazul și explică politica de anulare/reprogramare.',
        'Client nehotărât la recepție: prezintă pe scurt 2-3 opțiuni de tratament potrivite nevoii descrise, oferă o fișă de informare și propune o consultație gratuită.',
        'Reclamație / nemulțumire: ascultă complet fără a întrerupe, mulțumește pentru feedback, notează detaliile și anunță imediat managementul; nu promite compensații pe loc.',
        'Follow-up post-tratament: sună sau trimite mesaj la 2-3 zile după prima ședință pentru a întreba cum se simte clientul și a reaminti programarea următoare.',
      ],
      treatmentProtocols: [
        'HIFU full face: curățare ten → marcaj zone tratament → aplicare gel conductor → treceri conform protocolului aparatului pe fiecare zonă (frunte, obraji, maxilar, gât) → calmare cu mască/cremă post-tratament. Rezultat vizibil progresiv 2-3 luni.',
        'Liposonix: evaluare zonă țintă și grosime strat adipos → marcaj grilă de tratament → aplicare conform protocolului aparatului → hidratare zonă. Recomandare: minim 8-12 săptămâni între ședințe pe aceeași zonă.',
        'EMS tonifiere: poziționare electrozi pe grupele musculare țintă → selectare program/intensitate progresivă → ședință 20-30 min → hidratare post-ședință. Recomandare: 2 ședințe/săptămână pentru rezultate vizibile.',
        'RF Sculpt (radiofrecvență): curățare + gel conductor → treceri circulare pe zona țintă la temperatura recomandată de aparat → menținere temperatură constantă câteva minute per zonă → calmare. Se poate combina cu masaj drenant.',
        'Epilare laser (Elysion Pro): verificare ten/păr compatibil → setare parametri pe tip de piele și zonă → test pe porțiune mică dacă e primă ședință → treceri conform protocolului → calmare cu gel post-epilare.',
        'Microneedling: dezinfectare → anestezic topic (timp de acțiune conform produsului) → treceri cu dispozitivul pe adâncimea potrivită zonei → aplicare ser activ → mască calmantă. Se evită expunerea la soare 48h.',
      ],
      // Per-treatment reference cards for the phone/reception desk. Rendered as a block
      // per treatment: a line starting with "## " is the treatment name/heading, every
      // other line under it is a bullet (duration, who it's for, FAQ...). Editable as
      // plain text from Setări → Conținut, same one-line-per-bullet convention as the
      // sections above — no code changes needed to update these.
      treatmentReference: [
        '## Epilare laser (Elysion Pro)',
        'Durată: 10-45 min în funcție de zonă (ex: subsuori ~10 min, picior întreg ~40-45 min).',
        'Pentru cine: păr nedorit pe orice zonă a corpului, ten și fototip compatibile cu laserul cu diodă.',
        'Cât durează o cură? De obicei 6-8 ședințe la 4-6 săptămâni interval, pentru reducere permanentă vizibilă.',
        'Doare? Senzație de căldură/înțepătură ușoară, se poate aplica gel calmant după.',
        '## HIFU full face',
        'Durată: 60-90 min pentru o ședință completă de față.',
        'Pentru cine: lifting non-invaziv, fermitate, ten lăsat ușor-mediu, fără intervenție chirurgicală.',
        'Când se văd rezultatele? Progresiv în 2-3 luni, pe măsură ce colagenul se reface; efectul ține 12-18 luni.',
        'Cât de des? O ședință la 12-18 luni este suficientă pentru întreținere.',
        '## Liposonix',
        'Durată: 45-60 min per zonă tratată.',
        'Pentru cine: grăsime localizată rezistentă la dietă/sport (abdomen, șolduri, flancuri).',
        'E non-invaziv? Da, ultrasunete focalizate care distrug celulele adipoase, fără operație.',
        'Interval recomandat: minim 8-12 săptămâni între ședințe pe aceeași zonă.',
        '## EMS tonifiere',
        'Durată: 20-30 min per ședință.',
        'Pentru cine: tonifiere musculară (abdomen, fesieri, brațe) fără efort fizic activ din partea clientului.',
        'Cât de des? Ideal 2 ședințe/săptămână pentru rezultate vizibile în 4-6 săptămâni.',
        'Doare? Nu, se simt contracții musculare ritmice, intensitatea e reglabilă.',
        '## RF Sculpt (radiofrecvență)',
        'Durată: 30-45 min per zonă.',
        'Pentru cine: fermitate piele, remodelare corporală, combate lăsarea țesutului.',
        'Se poate combina? Da, frecvent cu Liposonix sau masaj de drenaj pentru rezultate mai rapide.',
        'Câte ședințe? Cură de 6-8 ședințe, 1-2/săptămână, apoi întreținere lunară.',
        '## Microneedling',
        'Durată: 45-60 min, plus timpul de acțiune al anestezicului topic (~20 min înainte).',
        'Pentru cine: textură neuniformă, cicatrici de acnee, pori dilatați, luminozitate ten.',
        'Recuperare: roșeață 1-2 zile; se evită soarele și machiajul 24-48h.',
        'Cât de des? La 4-6 săptămâni interval, cură de 3-6 ședințe.',
        '## Tratamente faciale (hidratare / ten problematic / anti-pigmentare)',
        'Durată: 45-60 min în funcție de protocolul ales.',
        'Pentru cine: orice tip de ten — personalizat după nevoie (hidratare, acnee, pete pigmentare).',
        'Se poate face lunar? Da, recomandat ca întreținere 1 ședință/lună între curele intensive.',
        '## Celulită',
        'Durată: 30-45 min per ședință.',
        'Pentru cine: celulită de orice grad, zone cu aspect de "coajă de portocală" (coapse, fese, abdomen).',
        'Se combină cu detox-drenaj pentru rezultate mai bune și mai rapide.',
        'Câte ședințe? Cură de 8-10 ședințe, 1-2/săptămână.',
        '## Detox / drenaj',
        'Durată: 45-60 min.',
        'Pentru cine: retenție de lichide, picioare grele, susținere post-tratamente de celulită/remodelare.',
        'E dureros? Nu, masaj/aparatură de presopunctură cu senzație plăcută de relaxare.',
        'Recomandare: cură de 6-8 ședințe, poate fi combinată cu alte tratamente corporale.',
      ],
    },
  };
}

// Standard operating procedures, one set per role (+ one for everyone). Shown in
// "SOP & Resurse"; the owner edits them in place from the same screen. Each SOP is a
// short "when" line and numbered steps — written to be followed, not read once.
function defaultSops() {
  return {
    receptie: [
      { id: 'r-deschidere', title: 'Deschiderea zilei', icon: 'sunrise', when: 'Zilnic, înainte de primul client (15 min)', steps: [
        'Deschide Panoul: vezi programările de azi, leadurile de sunat și sarcinile.',
        'Calendar → Azi: verifică că fiecare programare are telefon și cosmeticiană alocată.',
        'Sarcini: trimite reminderul WhatsApp tuturor programărilor de azi care nu l-au primit.',
        'Pipeline → Coada de apeluri: sună întâi leadurile întârziate, apoi pe cele noi.',
      ] },
      { id: 'r-lead', title: 'Lead nou din Facebook — regula celor 5 minute', icon: 'zap', when: 'De fiecare dată când apare un lead nou', steps: [
        'Sună în maxim 5 minute — după 1 oră șansa de programare scade drastic.',
        'Nu răspunde? Trimite imediat WhatsApp-ul pregătit din fișa leadului.',
        'Notează rezultatul în fișă (A răspuns / Nu răspunde / Vrea programare…). Follow-up-ul se propune singur.',
        'Ritmul de revenire: peste 2 ore → mâine 10:00 → peste 3 zile. După 3 încercări fără răspuns: Pierdut, cu motiv.',
        'Nu promite rezultate și nu da prețuri diferite de cele din Oferte active.',
      ] },
      { id: 'r-programare', title: 'Programarea', icon: 'calendar', when: 'La telefon, WhatsApp sau la recepție', steps: [
        'Confirmă tratamentul și oferta exactă (vezi Oferte active — prețul de acolo e singurul corect).',
        'Verifică locația: EMS și epilarea laser doar la Timișoara; Cavitația 1+1 doar la Arad.',
        'Din fișa leadului apasă Programează (sau Calendar → click pe slot liber). Telefonul e obligatoriu.',
        'Trimite confirmarea pe WhatsApp din fișa programării.',
        'Explică politica de anulare: anunță cu minim 24 de ore înainte.',
      ] },
      { id: 'r-confirmari', title: 'Confirmări pentru ziua următoare', icon: 'checkCircle', when: 'Zilnic, până la ora 16:00', steps: [
        'Calendar → Mâine: pentru fiecare programare albastră (Programată) trimite Confirmare WhatsApp.',
        'Când clienta răspunde DA: status Confirmată (un click în fișa programării).',
        'Neconfirmate la 18:00: sună. Dacă anulează, marchează Anulată și propune altă zi.',
      ] },
      { id: 'r-primire', title: 'Primirea clientei', icon: 'users', when: 'La sosire', steps: [
        'Salut pe nume, ofertă de apă, check-in pe programare.',
        'Prima vizită: fișa de client completată și semnată (Fișe de printat).',
        'Anunță cosmeticiana și condu clienta în cabină.',
      ] },
      { id: 'r-incasare', title: 'Încasarea și următoarea programare', icon: 'wallet', when: 'La finalul tratamentului', steps: [
        'Din fișa programării apasă Încasează — clientul, tratamentul și cosmeticiana se completează singure.',
        'Alege oferta din chips (prețul se pune automat) și metoda de plată.',
        'Programarea trece automat pe Finalizată.',
        'Înainte să plece: propune și pune în Calendar următoarea ședință.',
      ] },
      { id: 'r-inchidere', title: 'Închiderea zilei', icon: 'moon', when: 'Zilnic, la final', steps: [
        'Încasări → Azi: totalul din portal = cash + POS + transferuri din ziua respectivă.',
        'Programările de mâine sunt confirmate sau sunate.',
        'Pipeline fără leaduri întârziate; Sarcini bifate.',
      ] },
      { id: 'r-reclamatie', title: 'Reclamații', icon: 'alert', when: 'Când o clientă e nemulțumită', steps: [
        'Ascultă până la capăt, fără să întrerupi; mulțumește pentru feedback.',
        'Notează detaliile (în Pipeline, ca notă, dacă e lead) și anunță imediat managementul.',
        'Nu promite compensații pe loc — revii tu cu răspunsul în aceeași zi.',
      ] },
    ],
    cosmetician: [
      { id: 'c-pregatire', title: 'Înainte de prima clientă', icon: 'sunrise', when: 'Zilnic, cu 15 minute înainte', steps: [
        'Calendar → filtrul „Doar ale mele”: vezi clientele tale de azi și tratamentele.',
        'Pregătește cabina și aparatele pentru primul tratament; verifică consumabilele.',
        'Citește protocolul aparatului dacă ai un tratament pe care nu l-ai mai făcut de mult (Protocoale).',
      ] },
      { id: 'c-consultatie', title: 'Consultația și fișa', icon: 'file', when: 'La fiecare clientă nouă', steps: [
        'Întreabă obiectivul clientei, în cuvintele ei.',
        'Verifică contraindicațiile (sarcină, implanturi metalice, boli de piele active, tratamente recente).',
        'Laser: stabilește fototipul și fă test pe o zonă mică la prima ședință.',
        'Fotografii înainte doar cu acordul clientei.',
      ] },
      { id: 'c-tratament', title: 'Tratamentul', icon: 'sparkles', when: 'În cabină', steps: [
        'Urmează protocolul aparatului (Protocoale) — parametri, timp, zone.',
        'Spune-i clientei ce urmează să simtă; verifică confortul pe parcurs.',
        'Igienă: dezinfectare aparat și suprafețe după fiecare clientă.',
      ] },
      { id: 'c-dupa', title: 'După tratament', icon: 'checkCircle', when: 'Înainte ca clienta să iasă din cabină', steps: [
        'Recomandări post-tratament (soare, sport, hidratare) — pe scurt și clar.',
        'Spune-i recepției ce ședință urmează și când, ca să fie programată pe loc.',
        'Dacă ai recomandat un pachet sau produs și clienta l-a cumpărat: Comisionul meu → Loghează vânzarea, în aceeași zi.',
      ] },
      { id: 'c-upsell', title: 'Upsell etic', icon: 'gift', when: 'Doar când ajută clienta', steps: [
        'Recomandă doar ce rezolvă obiectivul spus de clientă (vezi Upsell).',
        'Explică de ce: rezultatul, numărul de ședințe, intervalul.',
        'Fără presiune — o recomandare bună vinde singură.',
      ] },
      { id: 'c-inchidere', title: 'Final de zi', icon: 'moon', when: 'Zilnic', steps: [
        'Aparate oprite și curățate, cabina pregătită pentru mâine.',
        'Consumabile pe terminate: anunță managementul.',
        'Verifică în Comisionul meu că toate vânzările zilei sunt logate.',
      ] },
    ],
    toti: [
      { id: 't-reguli', title: 'Regulile de aur', icon: 'star', when: 'Mereu', steps: [
        'Prețurile corecte sunt cele din Oferte active — nimic negociat pe loc.',
        'EMS și epilarea laser doar la Timișoara; Cavitația 1+1 doar la Arad.',
        'Garanția banilor înapoi există doar la epilarea laser.',
        'Nu promitem rezultate garantate pentru tratamentele corporale și faciale.',
        'Fotografiile clientelor nu ies din clinică fără acordul lor scris.',
      ] },
      { id: 't-anulare', title: 'Politica de anulare', icon: 'calendar', when: 'La programare și la reprogramare', steps: [
        'Anularea sau reprogramarea se anunță cu minim 24 de ore înainte.',
        'Neprezentare fără anunț: avansul nu se returnează.',
        'Reprogramarea se face din Calendar (tragi programarea pe noua oră) sau din fișa programării.',
      ] },
    ],
  };
}

module.exports = { defaultConfig, currentMonth, defaultSops };
