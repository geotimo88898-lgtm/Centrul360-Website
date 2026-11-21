// Conversia banilor din contul de reclame în lei (api/_lib/ads-fx.js, meta-ads.js inLei / budLei / cents) și garda pe
// cifre în CAD: `node qa/fx-checks.cjs`. Iese cu 1 la prima regulă care nu se ține.
const assert = require('assert');
const M = require('../api/_lib/meta-ads');
const F = require('../api/_lib/ads-fx');
const G = require('../api/_lib/ads-guard');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };

// cursul din XML-ul BNR (cu și fără multiplicator) și din BCE
ok(F.bnrRate('<Rate currency="CAD">3.2912</Rate>', 'CAD') === 3.2912, 'BNR CAD');
ok(F.bnrRate('<Rate currency="HUF" multiplier="100">1.2234</Rate>', 'HUF') === 0.012234, 'BNR multiplicator');
ok(Math.abs(F.ecbRate("<Cube currency='RON' rate='4.9750'/><Cube currency='CAD' rate='1.5100'/>", 'CAD') - 3.2947) < 0.001, 'BCE cross');
ok(F.bnrRate('', 'CAD') === null, 'fără XML');

// RON: nimic nu se schimbă
const ron = { adAccountId: 'act_4502494523405059' }; Object.defineProperty(ron, 'fx', { value: 1 });
ok(M.inLei(ron, '40') === 40 && M.budLei(ron, '5000') === 50 && M.cents(ron, 50) === '5000', 'RON factor 1');
// CAD la 3,3
const cad = { adAccountId: 'act_1136609638911845' }; Object.defineProperty(cad, 'fx', { value: 3.3 });
ok(M.inLei(cad, '13') === 42.9, '13 CAD = 42,90 lei');
ok(M.budLei(cad, '1000') === 33, 'buget 10 CAD = 33 lei');
ok(M.cents(cad, 33) === '1000', '33 lei = 10 CAD (1000 de cenți)');
ok(M.cents(cad, 150) === '4545', 'plafonul de 150 lei = 45,45 CAD');
// o copie a conexiunii fără fx: cursul de rezervă, niciodată 1 pe CAD
ok(M.FX({ adAccountId: 'act_1136609638911845' }) === 3.3, 'copie fără fx pe CAD');
ok(M.FX({ adAccountId: 'act_4502494523405059' }) === 1, 'copie fără fx pe RON');

// garda pe cifre venite în CAD (convertite la intrare)
ok(G.losing(M.inLei(cad, 13), 0) === true, '13 CAD fără lead → oprește (42,90 lei ≥ 40)');
ok(G.losing(M.inLei(cad, 13), 0) !== G.losing(13, 0), 'fără conversie, 13 ar fi trecut');
ok(G.losing(M.inLei(cad, 12), 4) === false, '3 CAD pe lead (9,90 lei) pe 4 leaduri → rămâne');
const cpl = M.inLei(cad, 12) / 4; ok(cpl <= G.SCALE.cpl7, '3 CAD pe lead e sub pragul de creștere de ' + G.SCALE.cpl7 + ' lei');
ok(G.losing(M.inLei(cad, 30), 1) === true, '30 CAD (99 lei) cu 1 lead → oprește');
console.log('fx-checks: ' + n + ' verificări trecute');
