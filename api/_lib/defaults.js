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
    },
  };
}

module.exports = { defaultConfig, currentMonth };
