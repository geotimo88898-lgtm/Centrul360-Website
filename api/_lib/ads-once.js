// One-off budget changes the owners asked for, done once by the automations' clock (api/automation-tick.js) and then
// never again; the guard (api/_lib/ads-guard.js) keeps its own rules and watches these campaigns like any other.
//   24.10: Timișoara has more bookings than room (done the same day: 7 campaigns -40%); Arad has room, so its LipoSonix /
//   gușă campaigns get +30% (at most 150 lei a day).
// data/ads-once.json: { done: { <job id>: <when> }, log: [{ job, at, campaignId, campaignName, budgetId, from, to }] }

const { readJSON, writeJSON } = require('./store');
const { loadConnection } = require('./facebook');
const ads = require('./meta-ads');
const AC = require('./ads-cache');
const { notifyMany } = require('./notify');

const KEY = 'data/ads-once.json';
const JOBS = [
  // 23.11, George: „ACUM ÎN RECLAME FIECARE FINAL DE FORMULAR VREAU SĂ DUCĂ PE SITE, PE HOMEPAGE”. A published form can't
  // change: HIFU Gușă 190 · Timișoara is copied as it is (questions, answers, privacy, language, title of the questions
  // page), only its ending now sends her to the home page; the running ad moves to the copy (same texts, same picture)
  { id: 'form-home-hifu-tm-2026-11-23', why: 'Finalul formularului duce pe site: HIFU gușă TM', formSite: {
    formId: '1604290084129939', name: 'HIFU Gușă 190 · Timișoara · site', adId: '120250715948280149', campaign: 'C360 · TM · HIFU G · sezon',
    page: { title: '⚠️ ÎNCĂ NU AI TERMINAT!', body: 'Mai ai un pas 👇 Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.', button_type: 'VIEW_WEBSITE', button_text: 'VREAU SĂ PROFIT 🎁',
      website_url: 'https://www.centrul360.com/?utm_source=facebook&utm_medium=leadform&utm_campaign=hifu-gusa-tm' } } },
  // 23.11, George: every new form ends the same way, on the home page (Formulare → Setări formulare)
  { id: 'form-template-home-2026-11-23', why: 'Formularele noi se termină pe site', template: {
    ending: { title: '⚠️ ÎNCĂ NU AI TERMINAT!', body: 'Mai ai un pas 👇 Până pe 24 decembrie, ce plătești acum valorează de până la 3 ori mai mult în tratamente. După, revine la normal.' },
    cta: { type: 'VIEW_WEBSITE', text: 'VREAU SĂ PROFIT 🎁', url: 'https://www.centrul360.com/?utm_source=facebook&utm_medium=leadform' } } },
  // 21.11 ~20:45, George: always „Plătești 990 lei” first, then „Primești 2.500 lei”: the A6 ads with the reversed
  // order go off (their corrected v2 is already live in the same ad sets)
  { id: 'card-a6-order-2026-11-21', why: 'Întâi ce plătești, apoi ce primești: A6 cu ordinea inversă se oprește', actions: [
    { campaignId: '120260600117080112', name: 'CARD · FORM · A6_valoare (ordinea inversă)', status: 'PAUSED', why: 'înlocuită de A6 v2' },
    { campaignId: '120260600831800112', name: 'CARD · VÂNZARE · HOME · A6_valoare (ordinea inversă)', status: 'PAUSED', why: 'înlocuită de A6 v2' },
  ] },
  // 21.11 ~19:00, George: the card ads' destination is the home page: the 4 sales ads to /card-sarbatori go off, the same
  // 4 to the home page (already live in the same ad set) take their place
  { id: 'card-home-2026-11-21', why: 'Reclamele de vânzare ale cardului duc pe prima pagină', actions: [
    { campaignId: '120260600035920112', name: 'CARD · VÂNZARE · A3 prietena (pagina cardului)', status: 'PAUSED', why: 'înlocuită de aceeași reclamă spre prima pagină' },
    { campaignId: '120260600119500112', name: 'CARD · VÂNZARE · A4 tine (pagina cardului)', status: 'PAUSED', why: 'înlocuită de aceeași reclamă spre prima pagină' },
    { campaignId: '120260600120440112', name: 'CARD · VÂNZARE · A2 mama (pagina cardului)', status: 'PAUSED', why: 'înlocuită de aceeași reclamă spre prima pagină' },
    { campaignId: '120260600120910112', name: 'CARD · VÂNZARE · A6 valoare (pagina cardului)', status: 'PAUSED', why: 'înlocuită de aceeași reclamă spre prima pagină' },
  ] },
  // 21.11 ~18:30, George: HIFU gușă TM at 50, the two 190 doors at 30 each; the card in 3 campaigns of 4 creatives,
  // 50 lei each, Timișoara and Arad together, women only (Meta picks the creative); the old card ad off
  { id: 'george-budgets-2026-11-21', why: 'Bugetele lui George: gușă 50, ușile 30, cardul 3 campanii x 50 lei', actions: [
    { campaignId: '120260595784720112', name: 'BK · TM · HIFU G · sezon (contul vechi)', daily: 50, why: 'George: 50 lei' },
    { campaignId: '120260597251670112', name: 'LF · TM · HIFU G 190 · ușa', daily: 30, why: 'George: 30 lei' },
    { campaignId: '120260597253050112', name: 'LF · AR · HIFU G 190 · ușa', daily: 30, why: 'George: 30 lei' },
    { campaignId: '120260599181780112', name: 'CARD · FORM · feed (4 creative)', daily: 50, why: 'George: 50 lei pe campanie' },
    { campaignId: '120260600033830112', name: 'CARD · VÂNZARE · feed (4 creative)', daily: 50, why: 'George: 50 lei pe campanie' },
    { campaignId: '120260600760170112', name: 'CARD · FORM · STORIES (4 creative 9:16)', daily: 50, why: 'George: 50 lei pe campanie' },
    { campaignId: '120260591688440112', name: 'CARD · CALD · 2.500 lei în tratamente ca astea', status: 'PAUSED', why: 'cardul rămâne doar în cele 3 campanii noi' },
  ] },
  // 21.11 ~18:00, George: „reclamele cu cardul sunt cu obiectiv de achiziție?”: the card page campaign was optimised for
  // page views; it's replaced by the same ad optimised for the pixel's Purchase (the card paid in myPOS goes back to Meta)
  { id: 'card-sales-2026-11-21', why: 'Reclama cardului pe site caută acum cumpărători (Purchase), nu vizite', actions: [
    { campaignId: '120260599182800112', name: 'CARD · SITE · Plătești 290 lei (vizite)', status: 'PAUSED', why: 'optimizată pe vizite, înlocuită de cea pe cumpărare' },
    { campaignId: '120260600034500112', name: 'CARD · VÂNZARE (setul)', status: 'ACTIVE', why: 'pornit cu campania' },
    { campaignId: '120260600035920112', name: 'CARD · VÂNZARE (reclama)', status: 'ACTIVE', why: 'pornit cu campania' },
    { campaignId: '120260600033830112', name: 'CARD · VÂNZARE · Plătești 290 lei. Ea primește 500 lei', status: 'ACTIVE', why: 'cardul pe site, optimizat pe cumpărare' },
  ] },
  // 21.11 ~17:20, George: „da, pornește-le”: the Card de Sărbători gets the money (two destinations side by side: the
  // reservation form and the card page); the lead filter ads without cheap leads stop; per day the total stays the same
  { id: 'card-on-2026-11-21', why: 'Cardul de Sărbători primește banii (formular și pagina cardului), totalul pe zi rămâne același', actions: [
    { campaignId: '120260591748260112', name: 'LF · TM · P2 · O singură ședință', status: 'PAUSED', why: '21 lei pe lead, banii merg la card' },
    { campaignId: '120260591767590112', name: 'LF · AR · C2 · Corp sau față?', status: 'PAUSED', why: '22 lei pe lead, banii merg la card' },
    { campaignId: '120260595786020112', name: 'BK · AR · VIDEO · HIFU abdomen · vid 8 (contul vechi)', status: 'PAUSED', why: '12 lei, niciun lead, banii merg la card' },
    { campaignId: '120260599181870112', name: 'CARD · FORM (setul)', status: 'ACTIVE', why: 'pornit cu campania' },
    { campaignId: '120260599182200112', name: 'CARD · FORM (reclama)', status: 'ACTIVE', why: 'pornit cu campania' },
    { campaignId: '120260599181780112', name: 'CARD · FORM · Tu plătești 990 lei. Ea primește 2.500 lei', daily: 40, why: 'cardul, formularul de rezervare' },
    { campaignId: '120260599181780112', name: 'CARD · FORM · Tu plătești 990 lei. Ea primește 2.500 lei', status: 'ACTIVE', why: 'cardul, formularul de rezervare' },
    { campaignId: '120260599183110112', name: 'CARD · SITE (setul)', status: 'ACTIVE', why: 'pornit cu campania' },
    { campaignId: '120260599183950112', name: 'CARD · SITE (reclama)', status: 'ACTIVE', why: 'pornit cu campania' },
    { campaignId: '120260599182800112', name: 'CARD · SITE · Plătești 290 lei. Ea primește 500 lei', daily: 40, why: 'cardul, direct pe pagina cardului' },
    { campaignId: '120260599182800112', name: 'CARD · SITE · Plătești 290 lei. Ea primește 500 lei', status: 'ACTIVE', why: 'cardul, direct pe pagina cardului' },
  ] },
  // 21.11 ~14:30: the lead filter's door for gușă: the proven HIFU gușă 190 ads of the old account, now into a lead-filter
  // form (14.900 / 4.990 / 990 / 190, no review screen). AR's door takes the budget of „Căutăm 8 doamne din Arad” (0 leads)
  { id: 'lf-door-190-2026-11-21', why: 'Ușa de 190 în lead filter: HIFU gușă, reclama dovedită, în formularul cu pachete', actions: [
    { campaignId: '120260591756890112', name: 'LF · AR · P1 · Căutăm 8 doamne din Arad', status: 'PAUSED', why: '16 lei, 0 leaduri: banii merg la ușa de 190 din Arad' },
    { campaignId: '120260597253050112', name: 'LF · AR · HIFU G 190 · ușa', daily: 40, why: 'reclama HIFU gușă câștigătoare din Arad, în lead filter' },
    { campaignId: '120260597251670112', name: 'LF · TM · HIFU G 190 · ușa', daily: 30, why: 'a doua reclamă HIFU gușă câștigătoare din Timișoara, în lead filter' },
  ] },
  // 21.11 ~14:15, George: „de ce avem buget așa de mic pe astea, așa nu o să fie leaduri”: the TM HIFU gușă backup is the
  // account's best (2 leads, 2 bookings, ~3.5 lei a lead) and gets the money; per city the total stays the same
  { id: 'bk-up-2026-11-21', why: 'Rezervele primesc banii: HIFU gușă TM programează la 3,5 lei pe lead', actions: [
    { campaignId: '120260595784720112', name: 'BK · TM · HIFU G · sezon (contul vechi)', daily: 45, why: '2 leaduri, 2 programări, 3,5 lei pe lead' },
    { campaignId: '120260591751460112', name: 'LF · TM · A2 · Talie definită. Fără efort', status: 'PAUSED', why: '21 lei pe lead, banii merg la HIFU gușă TM' },
    { campaignId: '120260591748260112', name: 'LF · TM · P2 · O singură ședință', daily: 25, why: 'lead filter TM: 14 lei pe lead, rămâne' },
    { campaignId: '120260595786020112', name: 'BK · AR · VIDEO · HIFU abdomen · vid 8 (contul vechi)', daily: 25, why: 'rezerva AR primește buget să poată aduce leaduri' },
    { campaignId: '120260591767590112', name: 'LF · AR · C2 · Corp sau față?', daily: 30, why: 'lead filter AR: 16 lei pe lead' },
  ] },
  // 21.11 ~13:00, George: „dacă mai văd leaduri la lead filter îi plătesc cu mare drag; dacă nu, ne mutăm pe alt cont”: the
  // ~170 lei left before the threshold go mostly to the lead filter (its 4 best at 40 lei), the backups kept small
  { id: 'lf-first-2026-11-21', why: 'Banii rămași până la prag merg întâi pe lead filter', actions: [
    { campaignId: '120260591751460112', name: 'LF · TM · A2 · Talie definită. Fără efort', daily: 40, why: 'lead filter: a adus un 990' },
    { campaignId: '120260591748260112', name: 'LF · TM · P2 · O singură ședință', daily: 40, why: 'lead filter: a adus un 990' },
    { campaignId: '120260591767590112', name: 'LF · AR · C2 · Corp sau față?', daily: 40, why: 'lead filter: a adus un lead' },
    { campaignId: '120260591756890112', name: 'LF · AR · P1 · Căutăm 8 doamne din Arad', daily: 40, why: 'lead filter: cele mai multe clicuri la Arad' },
    { campaignId: '120260595784720112', name: 'BK · TM · HIFU G · sezon (contul vechi)', daily: 20, why: 'rezerva: a dovedit contul (lead la 2,5 lei), restul banilor la lead filter' },
    { campaignId: '120260595786020112', name: 'BK · AR · VIDEO · HIFU abdomen · vid 8 (contul vechi)', daily: 15, why: 'rezerva, mică: banii la lead filter' },
  ] },
  // 21.11 ~12:10: 250 lei, 3 leads; ~180 lei (~55 CAD) left before George's ~131 CAD threshold. Many clicks and few forms
  // sent on the long lead-filter forms, so the money tilts to what has proven cheap leads: the two backups from the old
  // account to 50 lei a day, the lead filter on its 4 best (the 3 with a lead + Căutăm 8 doamne Arad, the most clicks)
  { id: 'focus-before-threshold-2026-11-21', why: 'Înainte de prag: mai mulți bani pe rezervele dovedite, lead filter pe cele 4 bune', actions: [
    { campaignId: '120260595784720112', name: 'BK · TM · HIFU G · sezon (contul vechi)', daily: 50, why: 'rezerva dovedită: lead ~8 lei pe contul vechi' },
    { campaignId: '120260595786020112', name: 'BK · AR · VIDEO · HIFU abdomen · vid 8 (contul vechi)', daily: 50, why: 'rezerva dovedită: lead ~16 lei pe contul vechi' },
    { campaignId: '120260591746950112', name: 'LF · TM · P1 · Căutăm 10 doamne din Timișoara', status: 'PAUSED', why: '12,7 lei, 3 clicuri, niciun lead' },
    { campaignId: '120260591760900112', name: 'LF · AR · P8 · Talie mai definită', status: 'PAUSED', why: '14 lei, 4 clicuri, niciun lead' },
  ] },
  // 21.11 ~11:00, George: 25 campaigns split the money; before the ~131 CAD threshold he wants to see many leads, so the
  // money goes on 6 angles: the 3 that brought a lead (abdomen: Talie definită TM, O singură ședință TM, Corp sau față AR)
  // and the strongest proven mechanisms (Căutăm N doamne TM and AR, the Arad waist case), 35 lei a day each; the rest off
  // (they stay ready to come back); at the card only the real-results ad (the most clicks)
  { id: 'lf-focus-6-2026-11-21', why: 'Bugetul concentrat pe 6 unghiuri, ca să vedem leaduri multe înainte de prag', actions: [
    { campaignId: '120260591746950112', name: "LF · TM · P1 · Căutăm 10 doamne din Timișoara", daily: 35, why: 'unul din cele 6 unghiuri păstrate, cu bugetul concentrat' },
    { campaignId: '120260591748260112', name: "LF · TM · P2 · O singură ședință", daily: 35, why: 'unul din cele 6 unghiuri păstrate, cu bugetul concentrat' },
    { campaignId: '120260591749750112', name: "LF · TM · P6 · Grăsimea care nu pleacă cu sala", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591750380112', name: "LF · TM · P3 · Lifting fără bisturiu", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591751460112', name: "LF · TM · A2 · Talie definită. Fără efort", daily: 35, why: 'unul din cele 6 unghiuri păstrate, cu bugetul concentrat' },
    { campaignId: '120260591752540112', name: "LF · TM · N2 · Se vede ceva după o singură ședință?", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591754420112', name: "LF · TM · C2 · Corp sau față?", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591755990112', name: "LF · TM · P4 · 40 de cazuri. Toate reale", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591756890112', name: "LF · AR · P1 · Căutăm 8 doamne din Arad", daily: 35, why: 'unul din cele 6 unghiuri păstrate, cu bugetul concentrat' },
    { campaignId: '120260591759170112', name: "LF · AR · P2 · O singură ședință", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591760900112', name: "LF · AR · P8 · Talie mai definită", daily: 35, why: 'unul din cele 6 unghiuri păstrate, cu bugetul concentrat' },
    { campaignId: '120260591763580112', name: "LF · AR · A3 · Conturul feței, redefinit", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591767590112', name: "LF · AR · C2 · Corp sau față?", daily: 35, why: 'unul din cele 6 unghiuri păstrate, cu bugetul concentrat' },
    { campaignId: '120260591771370112', name: "LF · AR · P4 · 40 de cazuri. Toate reale", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593926700112', name: "LF · TM · P9 · Ridurile din jurul ochilor, mai fine", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593929940112', name: "LF · TM · A6 · Tu stai întinsă. Aparatul lucrează", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593932270112', name: "LF · TM · P7 · Mămici din Timișoara", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593935070112', name: "LF · TM · A1 · Rochia de Revelion", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593937620112', name: "LF · TM · N1 · Ce am învățat după 40 de cazuri:", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593940630112', name: "LF · AR · P10 · Un ten mai luminos", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593942970112', name: "LF · AR · A5 · La 50 de ani, fără bisturiu", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260593947280112', name: "LF · AR · N3 · 3 lucruri despre gușă pe care nu le spun", status: 'PAUSED', why: 'bugetul concentrat pe 6 unghiuri (George, 21.11)' },
    { campaignId: '120260591674640112', name: 'CARD · CALD · Alegi cât plătești (K5)', status: 'PAUSED', why: 'la card rămâne doar reclama cu cazurile reale (cele mai multe clicuri)' },
    { campaignId: '120260591684390112', name: 'CARD · CALD · Plătești 990 (K1)', status: 'PAUSED', why: 'la card rămâne doar reclama cu cazurile reale (cele mai multe clicuri)' },
  ] },
  // 21.11 ~11:00, George: „ai grijă la adspent, la 131 CAD se opresc” and he wants a winner on this account first: the test
  // keeps its breadth (22 lead-filter angles) at a pace the money lasts: 10 lei a day each (15 on the three with a lead
  // already), the cold card test off; ~260 lei (~80 CAD) a day instead of ~710
  { id: 'lf-test-budget-2026-11-21', why: 'Bugetul de test pe contul nou: mai multe unghiuri, mai puțini bani pe fiecare', actions: [
    { campaignId: '120260591746950112', name: "LF · TM · P1 · Căutăm 10 doamne din Timișoara", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591748260112', name: "LF · TM · P2 · O singură ședință", daily: 15, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591749750112', name: "LF · TM · P6 · Grăsimea care nu pleacă cu sala", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591750380112', name: "LF · TM · P3 · Lifting fără bisturiu", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591751460112', name: "LF · TM · A2 · Talie definită. Fără efort", daily: 15, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591752540112', name: "LF · TM · N2 · Se vede ceva după o singură ședință?", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591754420112', name: "LF · TM · C2 · Corp sau față?", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591755990112', name: "LF · TM · P4 · 40 de cazuri. Toate reale", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591756890112', name: "LF · AR · P1 · Căutăm 8 doamne din Arad", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591759170112', name: "LF · AR · P2 · O singură ședință", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591760900112', name: "LF · AR · P8 · Talie mai definită", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591763580112', name: "LF · AR · A3 · Conturul feței, redefinit", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591767590112', name: "LF · AR · C2 · Corp sau față?", daily: 15, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591771370112', name: "LF · AR · P4 · 40 de cazuri. Toate reale", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593926700112', name: "LF · TM · P9 · Ridurile din jurul ochilor, mai fine", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593929940112', name: "LF · TM · A6 · Tu stai întinsă. Aparatul lucrează", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593932270112', name: "LF · TM · P7 · Mămici din Timișoara", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593935070112', name: "LF · TM · A1 · Rochia de Revelion", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593937620112', name: "LF · TM · N1 · Ce am învățat după 40 de cazuri:", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593940630112', name: "LF · AR · P10 · Un ten mai luminos", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593942970112', name: "LF · AR · A5 · La 50 de ani, fără bisturiu", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260593947280112', name: "LF · AR · N3 · 3 lucruri despre gușă pe care nu le spun", daily: 10, why: 'bugetul de test pe contul nou (George: ~131 CAD)' },
    { campaignId: '120260591689740112', name: 'CARD · RECE · Cadoul… oglindă (K2)', status: 'PAUSED', why: 'publicul rece la card, cel mai puțin probabil; banii merg pe lead filter' },
    { campaignId: '120260591690580112', name: 'CARD · RECE · Pentru mama (K3)', status: 'PAUSED', why: 'publicul rece la card, cel mai puțin probabil; banii merg pe lead filter' },
    { campaignId: '120260591692210112', name: 'CARD · RECE · Moș Crăciun (K4)', status: 'PAUSED', why: 'publicul rece la card, cel mai puțin probabil; banii merg pe lead filter' },
  ] },
  // 20.11 19:47: TM LipoSonix isn't in the Timișoara plan (laser and HIFU gușă only), and spent 14 lei today with no lead
  { id: 'lipo-off-2026-11-20', why: 'LipoSonix nu e în planul TM', actions: [
    { campaignId: '120252015088300103', name: 'TM LIPO · stai întinsă v2', status: 'PAUSED', why: 'în afara planului TM, 14 lei azi fără lead' },
  ] },
  // 20.11 16:05, George: „stinge RF gușă la Arad și aprinde HIFU gușă la Arad”. RF off; the two Arad HIFU „sezon” back on
  // (23 and 17 bookings, 19 and 10 clients in October), next to a new ad with a real Arad HIFU case (H5 Arad)
  { id: 'arad-hifu-2026-11-20', why: 'Arad: RF gușă oprit, HIFU gușă pornit', actions: [
    { campaignId: '120251992601670103', name: 'AR RF GUSA · căutăm 8 doamne (port TM)', status: 'PAUSED', why: 'Arad trece pe HIFU gușă (George, 20.11)' },
    { campaignId: '120252030180490103', name: 'AR RF GUSA · căutăm 8 doamne contur (U1)', status: 'PAUSED', why: 'Arad trece pe HIFU gușă (George, 20.11)' },
    { campaignId: '120252030190520103', name: 'AR RF GUSA · bărbia dublă fără operație (U3)', status: 'PAUSED', why: 'Arad trece pe HIFU gușă (George, 20.11)' },
    { campaignId: '120252030191620103', name: 'AR RF GUSA · până de sărbători (U4)', status: 'PAUSED', why: 'Arad trece pe HIFU gușă (George, 20.11)' },
    { campaignId: '120251962566280103', name: 'AR RF GUSA · copertă 3', status: 'PAUSED', why: 'Arad trece pe HIFU gușă (George, 20.11)' },
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', status: 'ACTIVE', why: '23 programări, 19 cliente' },
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', daily: 100, why: 'repornită' },
    { campaignId: '120251418133050103', name: 'AR HIFU G · sezon (2)', status: 'ACTIVE', why: '17 programări, 10 cliente' },
    { campaignId: '120251418133050103', name: 'AR HIFU G · sezon (2)', daily: 80, why: 'repornită' },
  ] },
  // 20.11 15:10: the best ad of all time on HIFU (the iPad video with the real cases: 29 bookings, 12 clients) back on
  { id: 'video-back-2026-11-20', why: 'cea mai bună reclamă HIFU din istoric, cu cazuri reale', actions: [
    { campaignId: '120251585544900103', name: 'TM VIDEO · HIFU gușă · iPad', status: 'ACTIVE', why: '29 programări, 12 cliente, lead la 10 lei' },
    { campaignId: '120251585544900103', name: 'TM VIDEO · HIFU gușă · iPad', daily: 60, why: 'repornită' },
  ] },
  // 20.11 13:47, the hourly check: AR RF T3 at 9 lei a lead today (8 over 3 days), the cheapest of all: back to 110
  { id: 'h1347-2026-11-20', why: 'AR T3 lead la 8-9 lei', actions: [
    { campaignId: '120251992601670103', name: 'AR RF GUSA · căutăm 8 doamne (port TM)', daily: 110, why: 'lead la 9 lei azi, 8 lei pe 3 zile' },
  ] },
  // 20.11 13:00, George: „reclamele merg ca naiba”. Off what spent two days with no lead (laser E2 32 lei, E3 31 lei,
  // HIFU sezon v2 26 lei); the money stays on what brings leads
  // 20.11 13:20: TM HIFU „stai întinsă” at 28 lei a lead over two days (TM ~9): off; the winning „sezon” creative goes on fresh
  { id: 'noon-hifu-2026-11-20', why: 'lead la 28 lei, de 3 ori media TM', actions: [
    { campaignId: '120252019828940103', name: 'TM HIFU G · stai întinsă', status: 'PAUSED', why: '28 lei, 1 lead în 2 zile' },
  ] },
  // 20.11 13:10: TM laser E1 spent 41 lei today with no lead; its creative goes on fresh (E1 reluat) next to E4, published now
  { id: 'noon-e1-2026-11-20', why: '41 lei azi fără lead, înlocuită cu E1 reluat și E4', actions: [
    { campaignId: '120252019959160103', name: 'TM LASER · căutăm 15 doamne', status: 'PAUSED', why: '41 lei azi, 0 leaduri' },
  ] },
  { id: 'noon-stop-2026-11-20', why: 'zero leaduri în două zile', actions: [
    { campaignId: '120252019966140103', name: 'TM LASER · fără ras pentru totdeauna', status: 'PAUSED', why: '32 lei, 0 leaduri în 2 zile' },
    { campaignId: '120252019962330103', name: 'TM LASER · stai întinsă', status: 'PAUSED', why: '31 lei, 0 leaduri în 2 zile' },
    { campaignId: '120252019815200103', name: 'TM HIFU G · sezon v2', status: 'PAUSED', why: '26 lei, 0 leaduri în 2 zile' },
  ] },
  // Friday 20.11, the owner („până atunci o putem ține mai lowkey… ca să avem capital pentru consumabile”): the real push
  // starts Saturday morning, so the weekend books Monday and the week. Friday only the winners, smaller, still learning:
  // laser „căutăm 15 doamne” (7 leads for 34 lei) stays, the rest down
  { id: 'friday-lowkey-2026-11-20', why: 'vineri mai puțin, push-ul începe sâmbătă dimineață', actions: [
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', daily: 120, why: 'vineri lowkey' },
    { campaignId: '120252019962330103', name: 'TM LASER · stai întinsă', daily: 40, why: 'vineri lowkey, 0 leaduri încă' },
    { campaignId: '120252019966140103', name: 'TM LASER · fără ras pentru totdeauna', daily: 40, why: 'vineri lowkey, 0 leaduri încă' },
    { campaignId: '120252019815200103', name: 'TM HIFU G · sezon v2', daily: 30, why: 'vineri lowkey' },
    { campaignId: '120252019824130103', name: 'TM HIFU G · căutăm 10 doamne', daily: 40, why: 'vineri lowkey' },
    { campaignId: '120252019828940103', name: 'TM HIFU G · stai întinsă', daily: 30, why: 'vineri lowkey' },
    { campaignId: '120251992601670103', name: 'AR RF GUSA · căutăm 8 doamne (port TM)', daily: 80, why: 'vineri lowkey' },
  ] },
  // 19.11 22:47, the routine: AR RF „stai întinsă” (T2) at ~30 lei a lead over two days (T3 „căutăm 8 doamne” at ~7) off,
  // its money to T3 (+50%); the new TM laser „căutăm 15 doamne” (E1) brought 5 leads for 20 lei in its first hours: +50%
  { id: 'night-2026-11-19', why: 'lead scump la AR RF stai întinsă; banii pe ce aduce leaduri ieftine', actions: [
    { campaignId: '120251992596850103', name: 'AR RF GUSA · stai întinsă (port TM)', status: 'PAUSED', why: '~30 lei pe lead, de 4 ori cât T3' },
    { campaignId: '120251992601670103', name: 'AR RF GUSA · căutăm 8 doamne (port TM)', daily: 110, why: 'lead la ~7 lei, programează' },
    { campaignId: '120252019959160103', name: 'TM LASER · căutăm 15 doamne', daily: 105, why: '5 leaduri la 20 lei în primele ore' },
  ] },
  // 19.11 evening, the owner („STINGE RESTART, avem nevoie doar de overflow de HIFU gușă și epilare laser”): from next
  // week Mădălina does laser consultations non-stop (2 an hour, 16 a day) and Bianca + Raluca HIFU gușă (about 17 a day)
  // with the package pitch; every Restart ad off and the Timișoara LipoSonix too, the money goes to HIFU gușă and laser.
  // HIFU sezon (a lead at ~8 lei) to 200 lei a day now; the laser ones scale once their first day shows the lead's price
  { id: 'focus-hifu-laser-2026-11-19', why: 'doar HIFU gușă și epilare laser: Restart și LipoSonix TM oprite, cerut de voi pe 19.11', actions: [
    { campaignId: '120251418278340103', name: 'TM RESTART · fără ace', status: 'PAUSED', why: 'planul: doar HIFU gușă și laser' },
    { campaignId: '120251400568370103', name: 'TM RESTART · local', status: 'PAUSED', why: 'planul: doar HIFU gușă și laser' },
    { campaignId: '120251992594590103', name: 'AR RESTART · căutăm 8 doamne (port TM)', status: 'PAUSED', why: 'planul: fără Restart' },
    { campaignId: '120252015088300103', name: 'TM LIPO · stai întinsă v2', status: 'PAUSED', why: 'planul: doar HIFU gușă și laser' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', daily: 200, why: 'overflow HIFU gușă, lead ~8 lei' },
  ] },
  // 19.11 afternoon, the owner („avem nevoie de lead overflow, principal HIFU gușă la Timișoara, foarte tare”): the
  // clinic's best ad, HIFU sezon (ROAS 11, a lead at ~8 lei), to 150 lei a day; 3 new HIFU gușă ads published next to it
  { id: 'tm-hifu-overflow-2026-11-19', why: 'HIFU gușă Timișoara: lead overflow, cerut de voi pe 19.11', actions: [
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', daily: 150, why: 'cea mai bună reclamă (ROAS 11, lead ~8 lei), overflow cerut' },
  ] },
  // 19.11 midday (Claude, George's rule of 19.11): TM video iPad's lead went to 46 lei (18.11) and 20 lei today, off
  // (a new LipoSonix „Stai întinsă” v2 takes its place, published at 50 lei); Arad's RF „Căutăm 8 doamne” books (6 leads,
  // 2 bookings, ~7 lei a lead), to 75 lei for Friday's 77%
  { id: 'midday-2026-11-19', why: 'TM video iPad oprit (lead scump), AR RF „Căutăm 8 doamne” la 75 lei (programează)', actions: [
    { campaignId: '120251585544900103', name: 'TM VIDEO · HIFU gușă · iPad', status: 'PAUSED', why: 'lead 46 lei pe 18.11' },
    { campaignId: '120251992601670103', name: 'AR RF GUSA · căutăm 8 doamne (port TM)', daily: 75, why: '6 leaduri, 2 programări, ~7 lei/lead' },
  ] },
  // 19.11 morning (Claude, George's rule of 19.11: the calendar full at its target): Timișoara at 75-77% today and
  // tomorrow against 126%, ~15 hours missing; no paused winner left with cheap leads to recycle, so the two cheapest
  // running ones get more: HIFU sezon (a lead at ~8 lei, 3 clients this week) and Restart fără ace (~10 lei, 8 bookings)
  { id: 'tm-scale-2026-11-19', why: 'Timișoara: buget mai mare pe cele mai ieftine două reclame, calendarul e la 75-77%', actions: [
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', daily: 110, why: 'lead ~8 lei, calendarul TM la 75-77%' },
    { campaignId: '120251418278340103', name: 'TM RESTART · fără ace', daily: 75, why: 'lead ~10 lei, 8 programări în 3 zile' },
  ] },
  // 18.11 evening, the owner in his main session („da”): Timișoara's Restart local back on at 50 lei a day, for Thursday
  // and Friday's calendar (75-77% against 125%); ROAS 4,1, 5 clients, a lead at 8 lei when it last ran
  { id: 'tm-restart-local-on-2026-11-18', why: 'TM Restart local pornit la 50 lei/zi pentru calendarul de joi și vineri, cerut de voi pe 18.11', actions: [
    { campaignId: '120251400568370103', name: 'TM RESTART · local', daily: 50, why: 'calendarul TM joi-vineri la 75-77%' },
    { campaignId: '120251400568370103', name: 'TM RESTART · local', status: 'PAUSED', why: 'oprită o clipă (repornire curată)' },
    { campaignId: '120251400568370103', name: 'TM RESTART · local', status: 'ACTIVE', why: 'calendarul TM joi-vineri la 75-77%' },
  ] },
  // 18.11 evening: Meta paused every running campaign („Reclamele au fost puse în pauză din cauza unui cont compromis”,
  // issue 4134001) after the owner's Facebook security check; „O poți reactiva pentru a relua livrarea”: off and on again.
  // TM HIFU copertă 50+ stays off (24 lei without a lead today, 52 lei for one lead yesterday).
  { id: 'reactivate-compromised-2026-11-18', why: 'reclamele repornite după pauza Meta „cont compromis” din 18.11', actions: [
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', status: 'PAUSED', why: 'reactivare după „cont compromis”: oprită o clipă' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', status: 'ACTIVE', why: 'reactivată după „cont compromis”' },
    { campaignId: '120251418278340103', name: 'TM RESTART · fără ace', status: 'PAUSED', why: 'reactivare după „cont compromis”: oprită o clipă' },
    { campaignId: '120251418278340103', name: 'TM RESTART · fără ace', status: 'ACTIVE', why: 'reactivată după „cont compromis”' },
    { campaignId: '120251585544900103', name: 'TM VIDEO · HIFU gușă · iPad', status: 'PAUSED', why: 'reactivare după „cont compromis”: oprită o clipă' },
    { campaignId: '120251585544900103', name: 'TM VIDEO · HIFU gușă · iPad', status: 'ACTIVE', why: 'reactivată după „cont compromis”' },
    { campaignId: '120251992594590103', name: 'AR RESTART · căutăm 8 doamne (port TM)', status: 'PAUSED', why: 'reactivare după „cont compromis”: oprită o clipă' },
    { campaignId: '120251992594590103', name: 'AR RESTART · căutăm 8 doamne (port TM)', status: 'ACTIVE', why: 'reactivată după „cont compromis”' },
    { campaignId: '120251992596850103', name: 'AR RF GUSA · stai întinsă (port TM)', status: 'PAUSED', why: 'reactivare după „cont compromis”: oprită o clipă' },
    { campaignId: '120251992596850103', name: 'AR RF GUSA · stai întinsă (port TM)', status: 'ACTIVE', why: 'reactivată după „cont compromis”' },
    { campaignId: '120251992601670103', name: 'AR RF GUSA · căutăm 8 doamne (port TM)', status: 'PAUSED', why: 'reactivare după „cont compromis”: oprită o clipă' },
    { campaignId: '120251992601670103', name: 'AR RF GUSA · căutăm 8 doamne (port TM)', status: 'ACTIVE', why: 'reactivată după „cont compromis”' },
    { campaignId: '120251796512940103', name: 'TM HIFU G · copertă 50+', status: 'PAUSED', why: 'lead la 52 lei ieri, niciunul azi la 24 lei' },
  ] },
  // 18.11, the owner in his main session (Arad's dark covers bring leads that don't come: „reclamele sunt problema...
  // dacă astea nu merg, facem altele diferite”): three new Arad ads published from Timișoara's winners (Restart „Căutăm 8
  // doamne”, RF gușă „Stai întinsă” and „Căutăm 8 doamne”), the old dark ones off. Arad stays at 150 lei a day.
  { id: 'ar-dark-off-2026-11-18', why: 'Arad: reclamele dark înlocuite cu 3 noi după câștigătoarele din Timișoara, cerut de voi pe 18.11', actions: [
    { campaignId: '120251788054780103', name: 'AR RF GUSA · copertă 40+', status: 'PAUSED', why: 'vin puține din cele programate (6 din 16)' },
    { campaignId: '120251962578980103', name: 'AR RESTART · invitație 10 doamne', status: 'PAUSED', why: 'înlocuită de Restart „Căutăm 8 doamne” (port TM)' },
    { campaignId: '120251962566280103', name: 'AR RF GUSA · copertă 3', status: 'PAUSED', why: 'înlocuită de reclamele noi RF gușă (port TM)' },
  ] },
  // 18.11 night, the owner in his main session („e puțin ciudat că la Arad se cheltuie mai mult ca la Timișoara...
  // rezolvă totul să aibă sens”): Arad has about half Timișoara's hours, so its spend follows what books. Kept: RF copertă 3,
  // RF 40+, Restart invitație (7 bookings from 18 leads since 16.11); off: RF 50+ (1 booking from 7 leads, 28 lei a lead
  // on 17.11) and Restart local (no booking from 4 leads). Arad goes from 250 to 150 lei a day.
  { id: 'ar-trim-2026-11-18', why: 'Arad: rămân doar reclamele care aduc programări (150 lei/zi), cerut de voi pe 18.11', actions: [
    { campaignId: '120251788054230103', name: 'AR RF GUSA · copertă 50+', status: 'PAUSED', why: '1 programare din 7 leaduri de la 16.11' },
    { campaignId: '120251389243100103', name: 'AR RESTART · local', status: 'PAUSED', why: 'nicio programare din 4 leaduri de la 16.11' },
  ] },
  // 16.11 evening, the owner in his main session (Arad's calendar at 33-57% for the next 2 days: „da, ce putem face să
  // fie full la AR”): the 40+ cover back on at 50 lei a day, the cheapest leads in Arad (13 on 13.11 for 85 lei)
  { id: 'ar-rf40-on-2026-11-16', why: 'Arad RF gușă copertă 40+ pornită din nou la 50 lei/zi, pentru calendar, cerut de voi pe 16.11', actions: [
    { campaignId: '120251788054780103', name: 'AR RF GUSA · copertă 40+', daily: 50, why: 'cele mai ieftine leaduri din Arad, calendarul la 33-57%' },
    { campaignId: '120251788054780103', name: 'AR RF GUSA · copertă 40+', status: 'ACTIVE', why: 'cele mai ieftine leaduri din Arad, calendarul la 33-57%' },
  ] },
  // 16.11, the owner in his main session (few leads in Arad, only RF gușă 50+ running: „pornește restart”): Arad's
  // Restart „Căutăm 10 doamne din Arad.” back on at 50 lei a day (ROAS 3,3, 5 clients since 16.10)
  { id: 'ar-restart-on-2026-11-16', why: 'Restart Arad pornit din nou la 50 lei/zi, cerut de voi pe 16.11', actions: [
    { campaignId: '120251389243100103', name: 'AR RESTART · local', daily: 50, why: 'ROAS 3,3, 5 cliente; Arad are puține leaduri' },
    { campaignId: '120251389243100103', name: 'AR RESTART · local', status: 'ACTIVE', why: 'ROAS 3,3, 5 cliente; Arad are puține leaduri' },
  ] },
  // 15.11 night, the owner in his main session (from the full report: „pornește doar asta”): Timișoara's HIFU gușă
  // „hifu gușă” back on at 50 lei a day (ROAS 5,1, 14 clients, a lead at 8 lei on its last days)
  { id: 'tm-hifu-gusa-on-2026-11-15', why: 'TM HIFU gușă pornită din nou la 50 lei/zi, cerut de voi pe 15.11', actions: [
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', daily: 50, why: 'ROAS 5,1, 14 cliente, lead 8 lei' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', status: 'ACTIVE', why: 'ROAS 5,1, 14 cliente, lead 8 lei' },
  ] },
  // 15.11, the owner in his main session (Arad RF gușă: „okay super și asta pornește-o”): the 40+ cover off (ROAS 1,2),
  // the 50+ cover back on at 50 lei a day (ROAS 3, 6 clients since 8.11)
  { id: 'ar-rf-swap-2026-11-15', why: 'Arad RF gușă: copertă 50+ pornită, 40+ oprită, cerut de voi pe 15.11', actions: [
    { campaignId: '120251788054780103', name: 'AR RF GUSA · copertă 40+', status: 'PAUSED', why: 'ROAS 1,2' },
    { campaignId: '120251788054230103', name: 'AR RF GUSA · copertă 50+', daily: 50, why: 'ROAS 3, 6 cliente, pornită la 50 lei/zi' },
    { campaignId: '120251788054230103', name: 'AR RF GUSA · copertă 50+', status: 'ACTIVE', why: 'ROAS 3, 6 cliente, pornită la 50 lei/zi' },
  ] },
  // 10.11 afternoon, the owner („ok”): abdomen video 3 back on after the guard stopped it (no lead after 40 lei in 7 days);
  // switched back on by hand, the guard leaves it for 7 days unless a lead costs 40 lei or more
  { id: 'tm-vid3-on-2026-11-10', why: 'pornită din nou pe 10.11 după oprirea paznicului, cerut de voi', actions: [
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', status: 'ACTIVE', why: 'ROAS 4,9x de la 16.10' },
  ] },
  // 10.11, the owner in his main session (Timișoara's best return since 16.10: „aprinde 2. și 3. și 7.”, then „aprinde și 5.”):
  // four Timișoara campaigns back on, each at the budget it has
  { id: 'tm-best-roas-on-2026-11-10', why: 'pornite din nou pe 10.11, cele mai bune ROAS din Timișoara, cerut de voi', actions: [
    { campaignId: '120251505897650103', name: 'TM LIPO · fără efort', status: 'ACTIVE', why: 'ROAS 11,2x' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon (Până la sărbători)', status: 'ACTIVE', why: 'ROAS 10,1x, 12 cliente' },
    { campaignId: '120251418278340103', name: 'TM RESTART · fără ace', status: 'ACTIVE', why: 'ROAS 6,7x' },
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', status: 'ACTIVE', why: 'ROAS 4,9x, 4.090 lei încasați' },
  ] },
  // 7.11 night, the owner in his main session („doar active”: in Arad only the Restart, the two LipoSonix 30 and 33 and the
  // two RF gușă): the third LipoSonix (36) off, and the old static LipoSonix ad that still shows „with issues”
  { id: 'ar-only-five-2026-11-07', why: 'Arad: rămân active doar Restart, 2 LipoSonix și 2 RF gușă, cerut de voi pe 7.11', actions: [
    { campaignId: '120251787710030103', name: 'AR LIPO · 640 erou', status: 'PAUSED', why: 'Arad: rămân doar 2 LipoSonix (30 și 33)' },
    { campaignId: '120250873662240103', name: 'STATICS LIPO AR (reclama)', status: 'PAUSED', why: 'Arad: reclamă veche cu probleme, fără livrare' },
  ] },
  // 7.11 night, the owner in his main session (the Restart ad with the best return, at 60, then „da”): Arad's Restart
  // ad „Căutăm 10 doamne din Arad.” back on at 60 lei a day, only this campaign
  { id: 'ar-restart-on-2026-11-07', why: 'Restart Arad pornit din nou la 60 lei/zi, cerut de voi pe 7.11', actions: [
    { campaignId: '120251389243100103', name: 'AR RESTART · local', daily: 60, why: 'Arad Restart: cel mai bun randament, pornit din nou la 60 lei/zi' },
    { campaignId: '120251389243100103', name: 'AR RESTART · local', status: 'ACTIVE', why: 'Arad Restart: cel mai bun randament, pornit din nou la 60 lei/zi' },
  ] },
  // 5.11 afternoon, the owner ("stinge toate reclamele active temporar"): every running campaign off (the hiring one was
  // already off); they come back on when the owner says so, in Reclame or by a new job here
  { id: 'stop-all-2026-11-05', why: 'oprite toate temporar pe 5.11, cerut de voi', actions: [
    { campaignId: '120251585544900103', name: 'TM VIDEO · HIFU gușă · iPad', status: 'PAUSED', why: 'oprită temporar, cerut de voi' },
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', status: 'PAUSED', why: 'oprită temporar, cerut de voi' },
    { campaignId: '120251418158480103', name: 'tm vid 8 - copie', status: 'PAUSED', why: 'oprită temporar, cerut de voi' },
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', status: 'PAUSED', why: 'oprită temporar, cerut de voi' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', status: 'PAUSED', why: 'oprită temporar, cerut de voi' },
  ] },
  // 1.11 afternoon, the owner ("stinge ce nu merge, poate s-au saturat și alea bune, fă cum crezi, doar să nu se cheltuie aiurea"):
  // by the days' numbers, Arad's second gușă ad is saturated (frequency 2.2, the last three days 129 lei for 4 leads, a lead at
  // 32 lei against 12-15 before, a booking over the 30 line); abdomen video 3 shows the same fatigue (the last two days a lead at
  // 26 lei against 8-12, today 69 lei for one) but its visits pay ~690 lei each, so it is cut to 70, not stopped
  { id: 'stop-2026-11-01-b', why: 'saturate pe 1.11: oprită cea de-a doua gușă din Arad, abdomenul video 3 la 70', actions: [
    { campaignId: '120251418133050103', name: 'AR HIFU G · sezon', status: 'PAUSED', why: 'Arad gușă (a doua): saturată, 129 lei pentru 4 lead-uri în 3 zile' },
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', daily: 70, why: 'TM abdomen video 3: lead-ul a ajuns la 26 lei, 70 lei/zi până se echilibrează' },
  ] },
  // 1.11, the owner ("oprește ce nu merge, că se cheltuie aiurea"): Arad's abdomen video 8 after 4 days: 128 lei, 8 leads, 1 booking
  // from 6 (65 lei one, over the 60 line), the leads' price up to 31 lei today; the others book under their lines or have
  // a clear return, so they stay
  { id: 'stop-2026-11-01', why: 'oprită pe 1.11: 65 lei pe programare, 1 din 6 lead-uri', actions: [
    { campaignId: '120251598142680103', name: 'AR VIDEO · HIFU abdomen · vid 8', status: 'PAUSED', why: 'Arad abdomen video 8: 128 lei, o programare din 6 lead-uri' },
  ] },
  // 31.10 evening, the owner ("cele cu ROAS clar la normal, restul pe economie"): the ads with a clear return keep their normal
  // budgets (abdomen video 3 at 100, hifu gușă 50); video 8 has no visit paid yet, so it goes to the economical 40
  { id: 'plan-2026-10-31-b', why: 'cele fără ROAS încă, pe economie, cerut de voi pe 31.10', actions: [
    { campaignId: '120251418158480103', name: 'tm vid 8 - copie', daily: 40, why: 'TM abdomen video 8: nicio venire plătită încă, 40 lei/zi' },
  ] },
  // 31.10 evening, the owner (the economical variant for next week; "dai push la 100 la abdomenul care merge", "cele care merg
  // extrem de bine, lasă-le la bugetul normal"): the four Timișoara HIFU gușă / abdomen ads that book cheaply back on at the
  // budgets they already have (hifu gușă 50, gușă iPad 48, abdomen video 3 at 100, abdomen video 8 at 50); Arad stays as it is
  { id: 'plan-2026-10-31', why: 'săptămâna viitoare: reclamele din Timișoara pornite din nou, la bugetele lor, cerut de voi pe 31.10', actions: [
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', status: 'ACTIVE', why: 'TM gușă: programarea la 17 lei' },
    { campaignId: '120251585544900103', name: 'TM VIDEO · HIFU gușă · iPad', status: 'ACTIVE', why: 'TM gușă: programarea la 11 lei' },
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', daily: 100, why: 'TM abdomen: cel mai bun, 100 lei/zi' },
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', status: 'ACTIVE', why: 'TM abdomen: cel mai bun, 100 lei/zi' },
    { campaignId: '120251418158480103', name: 'tm vid 8 - copie', status: 'ACTIVE', why: 'TM abdomen: programarea la 24-30 lei' },
  ] },
  // 29.10 evening, the owner ("aprinde"): Arad's best gușă ad, found off (not by the portal), back on at its budget
  { id: 'ar-gusa80-on-2026-10-29', why: 'pornită din nou pe 29.10, cerut de voi', actions: [
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', status: 'ACTIVE', why: 'Arad gușă: cea mai bună din Arad (15 programări, 8 venite)' },
  ] },
  // 29.10 afternoon, the owner ("die nicht gut laufen, ausschalten"): the three Arad gușă ads turned back on this morning
  // by the rule (gușă under 30 lei a booking) are over it now, a lead between them today, and they share Arad's women
  // with the two that work
  { id: 'stop-2026-10-29', why: 'oprite pe 29.10: peste regula de 30 lei pe programare la gușă', actions: [
    { campaignId: '120251401198430103', name: 'AR HIFU G · fără efort', status: 'PAUSED', why: 'Arad gușă: 39 lei pe programare, niciun lead azi' },
    { campaignId: '120251401230830103', name: 'AR HIFU G · orașul', status: 'PAUSED', why: 'Arad gușă: 40 lei pe programare' },
    { campaignId: '120251418148270103', name: 'AR HIFU G · vrei bărbia mai definită', status: 'PAUSED', why: 'Arad gușă: 31 lei pe programare, niciun lead azi' },
  ] },
  // 29.10, the owner: "on: whatever books under 30 lei, under 40 if it's LipoSonix", HIFU gușă and HIFU abdomen /
  // LipoSonix only (no Restart); the paused ones that pass, at their own budgets (bookings counted since the portal keeps them)
  { id: 'rule-2026-10-29', why: 'regula voastră din 29.10: gușă sub 30 lei, abdomen sub 40 lei pe programare', actions: [
    { campaignId: '120251401198430103', name: 'AR HIFU G · fără efort', status: 'ACTIVE', why: 'Arad gușă: 2 programări la 20 lei' },
    { campaignId: '120251401230830103', name: 'AR HIFU G · orașul', status: 'ACTIVE', why: 'Arad gușă: 2 programări la 20 lei, au venit amândouă' },
    { campaignId: '120251418148270103', name: 'AR HIFU G · vrei bărbia mai definită', status: 'ACTIVE', why: 'Arad gușă: o programare la 25 lei' },
    { campaignId: '120251505897650103', name: 'TM LIPO · fără efort', status: 'ACTIVE', why: 'TM abdomen: 2 programări la ~31 lei' },
    { campaignId: '120251497737010103', name: 'AR LIPO · raritate', status: 'ACTIVE', why: 'Arad abdomen: o programare la 35 lei' },
  ] },
  // 28.10 evening, the owner ("hai să încercăm cu alea"): the side-view LipoSonix / HIFU abdomen video (vid 8, the cheapest
  // abdomen leads in September) back on in Timișoara next to vid 3, a new face for the same women
  { id: 'tm-vid8-2026-10-28', why: 'vid 8 pornit din nou, cerut de voi pe 28.10', actions: [
    { campaignId: '120251418158480103', name: 'tm vid 8 - copie', daily: 50, why: 'TM abdomen: al doilea video, cele mai ieftine lead-uri în septembrie' },
    { campaignId: '120251418158480103', name: 'tm vid 8 - copie', status: 'ACTIVE', why: 'TM abdomen: al doilea video, cele mai ieftine lead-uri în septembrie' },
  ] },
  // 28.10, the owner (plan 1 after the calendars: both clinics have room for about twice the bookings, with ~50% coming):
  // more to what brings bookings cheaply, the two best TM gușă ads back on, off what brings almost nothing
  { id: 'plan-2026-10-28', why: 'planul 1, aprobat de voi pe 28.10', actions: [
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', daily: 100, why: 'TM abdomen: programarea la ~29 lei, loc în calendar' },
    { campaignId: '120251418133050103', name: 'AR HIFU G · sezon', daily: 95, why: 'Arad gușă: programarea la ~30 lei, vin 65%' },
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', daily: 80, why: 'Arad gușă: programarea la ~30 lei, vin 65%' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', daily: 50, why: 'TM gușă pornită din nou: programarea la 21 lei' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', status: 'ACTIVE', why: 'TM gușă pornită din nou: programarea la 21 lei' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', daily: 50, why: 'TM gușă pornită din nou: programarea la 27 lei' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', status: 'ACTIVE', why: 'TM gușă pornită din nou: programarea la 27 lei' },
    { campaignId: '120251505897650103', name: 'TM LIPO · fără efort', status: 'PAUSED', why: 'leaduri scumpe, nicio venire' },
    { campaignId: '120251497423510103', name: 'AR LIPO · raritate', status: 'PAUSED', why: 'o programare din 9 leaduri; LipoSonix nu se mai face' },
  ] },
  // 27.10 night, the owner: Arad's Restart off; what runs is the LipoSonix TM that works at 75 lei a day (it had been put
  // back to 50 by hand), its two 25 lei tests, Arad's two gușă and its LipoSonix; the job ad stays on
  { id: 'plan-2026-10-27', why: 'cerut de voi pe 27.10', actions: [
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', daily: 75, why: 'TM: LipoSonix care merge, 75 lei/zi' },
    { campaignId: '120251418285690103', name: 'AR RESTART · fără ace', status: 'PAUSED', why: 'Arad: Restart oprit' },
    { campaignId: '120251389243100103', name: 'AR RESTART · local', status: 'PAUSED', why: 'Arad: Restart oprit' },
  ] },
  // 26.10 night: the other new LipoSonix ad in Timișoara too, 25 lei a day ("Fără efort. Fără diete stricte.")
  { id: 'tm-lipo-new2-2026-10-26', why: 'cerut de voi pe 26.10', actions: [
    { campaignId: '120251505980700103', name: 'TM LIPO · fără diete', status: 'ACTIVE', why: 'TM: încă o reclamă LipoSonix, 25 lei/zi' },
    { campaignId: '120251505980700103', name: 'TM LIPO · fără diete', daily: 25, why: 'TM: încă o reclamă LipoSonix, 25 lei/zi' },
  ] },
  // 26.10 night: one more LipoSonix ad in Timișoara, 25 lei a day: the "Stai întinsă" one made today (paused before it ran)
  { id: 'tm-lipo-new-2026-10-26', why: 'cerut de voi pe 26.10', actions: [
    { campaignId: '120251505897650103', name: 'TM LIPO · stai întinsă', daily: 25, why: 'TM: încă o reclamă LipoSonix, 25 lei/zi' },
    { campaignId: '120251505897650103', name: 'TM LIPO · stai întinsă', status: 'ACTIVE', why: 'TM: încă o reclamă LipoSonix, 25 lei/zi' },
  ] },
  // 26.10 evening, the owners: Timișoara one campaign only, the LipoSonix one that works (75 lei a day), the job ad off;
  // Arad proper leads: its 2 new gușă ads on, the good ones +20%, the day's cuts taken back.
  { id: 'plan-2026-10-26-b', why: 'decizia voastră din 26.10 seara', actions: [
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', daily: 75, why: 'TM: singura campanie, LipoSonix care merge' },
    { campaignId: '120251498280800103', name: 'TM ANGAJARE · Cosmeticiană', status: 'PAUSED', why: 'angajarea oprită' },
    { campaignId: '120251418158480103', name: 'tm vid 8 - copie', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251401225110103', name: 'TM HIFU G · rezultat real', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251505897650103', name: 'TM LIPO · stai întinsă', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251505980700103', name: 'TM LIPO · fără efort', status: 'PAUSED', why: 'TM: o singură campanie (LipoSonix vid 3)' },
    { campaignId: '120251497570950103', name: 'AR GUSA · fără efort', status: 'ACTIVE', why: 'Arad: mai multe leaduri' },
    { campaignId: '120251497422680103', name: 'AR GUSA · fără ace', status: 'ACTIVE', why: 'Arad: mai multe leaduri' },
    { campaignId: '120251418133050103', name: 'AR HIFU G · sezon', factor: 1.2, why: 'Arad: mai mult (programarea la 34 lei)' },
    { campaignId: '120251418285690103', name: 'AR RESTART · fără ace', factor: 1.2, why: 'Arad: mai mult (programarea la 31 lei)' },
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', daily: 65, why: 'Arad: bugetul de dimineață înapoi' },
    { campaignId: '120251389243100103', name: 'AR RESTART · local', daily: 60, why: 'Arad: bugetul de dimineață înapoi' },
  ] },
  // 26.10, the owner: Timișoara only LipoSonix and gușă (Restart off); what works very well gets more, so-so less.
  // Last 7 days, a booking's cost against the offer's price (15% very good, 30% bad):
  { id: 'plan-2026-10-26', why: 'decizia voastră din 26.10', actions: [
    { campaignId: '120251418278340103', name: 'TM RESTART · fără ace', status: 'PAUSED', why: 'TM: doar LipoSonix și gușă (Restart oprit)' },
    { campaignId: '120251400568370103', name: 'TM RESTART · local', status: 'PAUSED', why: 'TM: doar LipoSonix și gușă (Restart oprit)' },
    { campaignId: '120251401215320103', name: 'TM HIFU G · sezon', factor: 1.2, why: 'merge foarte bine: programarea la 21 lei (10 din 24 de leaduri)' },
    { campaignId: '120251400890520103', name: 'TM HIFU G · hifu gușă', factor: 1.2, why: 'merge foarte bine: programarea la 27 lei (10 din 29), 3 au venit' },
    { campaignId: '120251418156000103', name: 'tm vid 3 lipo 09.09 - copie', factor: 1.2, why: 'LipoSonix TM: 640 lei încasați din 199 cheltuiți' },
    { campaignId: '120251418098280103', name: 'AR HIFU G · sezon', factor: 0.8, why: 'merge so-so: programarea la 47 lei (5 din 20)' },
    { campaignId: '120251389243100103', name: 'AR RESTART · local', factor: 0.8, why: 'merge so-so săptămâna asta: programarea la 58 lei (4 din 20)' },
  ] },
  { id: 'ar-lipo-gusa-2026-10-24', city: /(^|[^a-z])ar([^a-z]|$)|arad/i, match: /lipo|gu[sș][aă]|b[aă]rbi|hifu/i, factor: 1.3, cap: 150,
    why: 'Arad are loc de programări: mai mult buget la LipoSonix și gușă (cerut de voi pe 24.10)' },
];

// who hears about it: the admin account named George (as the guard; api/_lib/notify.js ownerIds)
const { ownerIds } = require('./notify');
const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date(t));
// a job's day is in its id; one still undone 3 days later is given up (its intent is stale by then), with a word
const dayOf = (j) => (String(j.id).match(/\d{4}-\d{2}-\d{2}/) || [''])[0];
const expired = (j) => !!dayOf(j) && Date.now() - Date.parse(dayOf(j) + 'T00:00:00+02:00') > 3 * 864e5;
const short = (s) => String(s || '').replace(/^(TM|AR) /, '').slice(0, 40);
const same = (a, b) => Math.round(Number(a) * 100) === Math.round(Number(b) * 100);

async function run() {
  // a read that fails throws: nothing is applied and nothing overwritten this hour (a doc read as empty would apply
  // every job again, on an account that is already as the owners want it)
  const doc = Object.assign({ done: {}, log: [] }, (await readJSON(KEY, {})) || {});
  const todo = JOBS.filter((j) => !doc.done[j.id]);
  if (!todo.length) return { skipped: 'nothing' };
  // one run at a time: two clocks landing together (GitHub's late run and Vercel's cron) would apply a job twice
  if (doc.running && Date.now() - Date.parse(doc.running) < 5 * 60e3) return { skipped: 'running' };
  doc.running = new Date().toISOString();
  await writeJSON(KEY, doc, { quiet: true });
  const save = () => writeJSON(KEY, doc, { quiet: true });
  const out = [], problems = [];
  try {
    const conn = await loadConnection(readJSON);
    if (!conn.userToken || !conn.adAccountId) return { skipped: 'not_connected' };
    const ids = await ownerIds({ readJSON });
    // a word to the owner, each tag once a day (a refusal that lasts isn't repeated every hour)
    const tell = async (n) => {
      doc.told = doc.told || {};
      if (doc.told[n.tag] === day(Date.now())) return;
      doc.told[n.tag] = day(Date.now());
      await save();
      return notifyMany({ readJSON, writeJSON }, ids, Object.assign({ kind: 'alert', go: 'reclame', ownerPush: n.tone === 'bad' }, n)).catch((e) => console.error('ads-once tell:', e.message));
    };
    const logged = (j, a) => doc.log.some((e) => e.job === j.id && e.campaignId === a.campaignId && (e.status || 'budget') === (a.status || 'budget')); // a budget and a switch on the same campaign are two
    // a list of decided changes: a campaign switched on / off, or its budget (a number, or times a factor; 10 to 150 lei).
    // Every change is written down the moment Meta confirms it (a run cut short never repeats it); one already in
    // place is written down as such (not shown as a change); a refused one is told once, and tried again next hour
    for (const j of todo.filter((x) => x.actions)) {
      const failed = [];
      for (const a of j.actions) {
        if (logged(j, a)) continue;
        const base = { job: j.id, at: new Date().toISOString(), campaignId: a.campaignId, campaignName: a.name, why: a.why };
        if (a.status) {
          const r = await ads.act(conn, { action: 'status', id: a.campaignId, status: a.status });
          if (r.error) { failed.push(short(a.name) + ': ' + r.error); console.error('ads-once:', a.campaignId, r.error); continue; }
          await AC.switched(a.campaignId, a.status).catch(() => {});
          doc.log.push(Object.assign(base, { status: a.status }));
          out.push(a.campaignId);
        } else {
          const b = await ads.budgetOf(conn, a.campaignId);
          if (b.error) { failed.push(short(a.name) + ': ' + b.error); console.error('ads-once:', a.campaignId, b.error); continue; }
          const to = Math.max(10, Math.min(150, a.daily || Math.round(b.daily * a.factor)));
          if (same(b.daily, to)) { doc.log.push(Object.assign(base, { budgetId: b.id, from: b.daily, to, unchanged: true })); await save(); continue; }
          const r = await ads.act(conn, { action: 'budget', id: b.id, daily: to });
          if (r.error) { failed.push(short(a.name) + ': ' + r.error); console.error('ads-once:', a.campaignId, r.error); continue; }
          doc.log.push(Object.assign(base, { budgetId: b.id, from: b.daily, to }));
          out.push(a.campaignId);
        }
        await save();
      }
      if (!failed.length) {
        doc.done[j.id] = new Date().toISOString();
        await save();
        // one word when the whole list is done: what changed (a job that found everything already in place says nothing)
        const did = doc.log.filter((e) => e.job === j.id && !e.unchanged);
        if (did.length) await tell({ tone: 'good', tag: 'once-done-' + j.id, title: 'FĂCUT ✅ - ' + (j.why || 'ce ați cerut'),
          text: did.map((e) => short(e.campaignName) + ': ' + (e.status ? (e.status === 'ACTIVE' ? 'pornită' : 'oprită') : e.to + ' lei/zi')).join(' · ') });
      } else if (expired(j)) {
        doc.done[j.id] = new Date().toISOString();
        doc.log.push({ job: j.id, at: new Date().toISOString(), expired: true, why: failed.join(' · ') });
        await save();
        await tell({ tone: 'bad', tag: 'once-expired-' + j.id, title: 'NEFĂCUT ⚠️ - ' + (j.why || 'ce ați cerut'), text: 'Meta a refuzat 3 zile la rând, renunț: ' + failed.join(' · ') });
      } else {
        problems.push(...failed);
        await tell({ tone: 'bad', tag: 'once-fail-' + j.id, title: 'NU ÎNCĂ ⚠️ - ' + (j.why || 'ce ați cerut'), text: 'Meta a refuzat, mai încerc din oră în oră: ' + failed.join(' · ') });
      }
    }
    // a form's ending changed (23.11): the form copied with the new ending, registered like the old one (its leads come in
    // the same way), the offer's form for that city moved to it, then the ad switched to it (same texts and picture)
    for (const j of todo.filter((x) => x.formSite)) {
      const f = j.formSite;
      doc.forms = doc.forms || {};
      const st = doc.forms[j.id] = doc.forms[j.id] || {};
      const store = { readJSON, writeJSON };
      const fail = async (why) => {
        st.error = why; st.tries = (st.tries || 0) + 1; await save();
        console.error('ads-once form:', j.id, why);
        if (expired(j) || st.tries >= 6) {
          doc.done[j.id] = new Date().toISOString(); doc.log.push({ job: j.id, at: new Date().toISOString(), expired: true, why }); await save();
          await tell({ tone: 'bad', tag: 'once-expired-' + j.id, title: 'NEFĂCUT ⚠️ - ' + j.why, text: why });
        } else { problems.push(why); await tell({ tone: 'bad', tag: 'once-fail-' + j.id, title: 'NU ÎNCĂ ⚠️ - ' + j.why, text: 'Mai încerc din oră în oră: ' + why }); }
      };
      if (!st.newId) {
        const reg = ((await readJSON('data/fb-forms.json', {})).forms || {})[f.formId] || {};
        if (reg.replacedBy && reg.replacedBy !== f.formId) st.newId = reg.replacedBy; // made on a run cut short
        else {
          const FCp = require('./fb-form-copy');
          let r = await FCp.copyOne(store, f.formId, null, { name: f.name, page: f.page });
          // a button Meta doesn't take with the emoji: the same words without it
          if (r.error && !/are deja copie/.test(r.error)) r = await FCp.copyOne(store, f.formId, null, { name: f.name, page: Object.assign({}, f.page, { button_text: String(f.page.button_text).replace(/[^\p{L}\p{N} .,!?]/gu, '').trim() }) });
          if (r.error) { await fail('formularul: ' + r.error); continue; }
          st.newId = r.id; st.button = r.button;
        }
        st.madeAt = new Date().toISOString();
        await save();
        doc.log.push({ job: j.id, at: new Date().toISOString(), formId: f.formId, newFormId: st.newId, why: 'formularul copiat, finalul pe site' });
        await save();
      }
      if (!st.offers) {
        // the offer's form for this city (the publish window offers it; the leads keep the procedure by the form's own offerId)
        const offers = await readJSON('data/offers.json', null);
        const moved = [];
        if (Array.isArray(offers)) offers.forEach((o) => Object.keys((o && o.forms) || {}).forEach((c) => { if (String(o.forms[c]) === f.formId) { o.forms[c] = st.newId; moved.push(o.id + '/' + c); } }));
        if (moved.length) await writeJSON('data/offers.json', offers);
        const lf = await readJSON('data/leadfilter.json', null);
        if (lf && lf.forms) {
          let ch = false;
          Object.keys(lf.forms).forEach((c) => Object.keys(lf.forms[c] || {}).forEach((k) => { if (String(lf.forms[c][k]) === f.formId) { lf.forms[c][k] = st.newId; moved.push('leadfilter/' + c + '/' + k); ch = true; } }));
          if (ch) await writeJSON('data/leadfilter.json', lf);
        }
        st.offers = moved.length ? moved : ['-'];
        await save();
      }
      if (f.adId && !st.adDone) {
        const AE = require('./ads-edit');
        const cr = await AE.creativeOf(conn, f.adId);
        if (cr.error) { await fail('reclama: ' + cr.error); continue; }
        const p = AE.partsOf({ object_story_spec: cr.spec || {}, asset_feed_spec: cr.feed || null });
        if (p.formId !== st.newId) {
          if ((st.edits || 0) >= 2) { await fail('reclama nu a trecut pe formularul nou (' + p.formId + ')'); continue; }
          const fd = cr.feed || null;
          const list = (k) => (fd && Array.isArray(fd[k]) ? fd[k].map((x) => x.text).filter(Boolean) : null);
          st.edits = (st.edits || 0) + 1; await save();
          const r = await AE.editAd(conn, { adId: f.adId, texts: list('bodies') || p.texts, headlines: list('titles') || p.headlines, descriptions: list('descriptions') || p.descriptions, cta: p.cta, formId: st.newId });
          if (r.error) { await fail('reclama: ' + r.error); continue; }
          st.creativeId = r.creativeId;
          const back = await AE.creativeOf(conn, f.adId);
          const p2 = back.error ? {} : AE.partsOf({ object_story_spec: back.spec || {}, asset_feed_spec: back.feed || null });
          if (p2.formId !== st.newId) { await fail('reclama arată încă formularul ' + (p2.formId || '?')); continue; }
        }
        st.adDone = new Date().toISOString();
        doc.log.push({ job: j.id, at: new Date().toISOString(), adId: f.adId, campaignName: f.campaign, formId: st.newId, why: 'reclama trimite în formularul nou' });
        await save();
        out.push(f.adId);
      }
      doc.done[j.id] = new Date().toISOString();
      delete st.error;
      await save();
      await tell({ tone: 'good', tag: 'once-done-' + j.id, title: 'FĂCUT ✅ - ' + j.why, text: f.name + ' (' + st.newId + ')' + (f.adId ? ' · reclama ' + short(f.campaign) + ' trimite acum în el' : '') });
    }
    // the template every new form starts from (Formulare → Setări formulare)
    for (const j of todo.filter((x) => x.template)) {
      const T = require('./fb-form-template');
      await T.getTemplate({ readJSON, writeJSON }); // kept once, so the save starts from what runs
      const r = await T.saveTemplate({ readJSON, writeJSON }, j.template);
      if (r.error) { problems.push(r.error); console.error('ads-once template:', r.error); if (expired(j)) { doc.done[j.id] = new Date().toISOString(); await save(); } continue; }
      doc.done[j.id] = new Date().toISOString();
      doc.log.push({ job: j.id, at: new Date().toISOString(), template: { cta: r.template.cta, ending: r.template.ending }, why: j.why });
      await save();
    }
    // a rule over the campaigns that spent this week (the running ones and those paused a moment ago): its budget times a
    // factor, up to a cap
    const rules = todo.filter((x) => !x.actions && !x.formSite && !x.template);
    if (rules.length) {
      const days = await ads.campaignDays(conn, { since: day(Date.now() - 6 * 864e5), until: day(Date.now()) });
      if (days.error) return { changed: out.length, error: days.error };
      const camps = new Map();
      days.rows.forEach((d) => { if (d.spend > 0) camps.set(d.campaignId, d.campaignName); });
      for (const j of rules) {
        const did = new Set(doc.log.filter((e) => e.job === j.id).map((e) => e.campaignId));
        let failed = 0;
        for (const [id, name] of camps) {
          if (did.has(id) || !j.city.test(name) || !j.match.test(name)) continue;
          const b = await ads.budgetOf(conn, id);
          if (b.error || !(b.daily > 0) || b.daily >= j.cap) continue;
          const to = Math.min(j.cap, Math.round(b.daily * j.factor));
          if (to <= b.daily) continue;
          const r = await ads.act(conn, { action: 'budget', id: b.id, daily: to });
          if (r.error) { failed++; console.error('ads-once:', id, r.error); continue; }
          doc.log.push({ job: j.id, at: new Date().toISOString(), campaignId: id, campaignName: name, budgetId: b.id, from: b.daily, to, why: j.why });
          await save();
          out.push(name + ' ' + b.daily + ' → ' + to);
          await tell({ tone: 'good', tag: 'once-' + j.id + '-' + id, title: 'BUGET MĂRIT 📈 - ' + String(name).slice(0, 50), text: b.daily + ' → ' + to + ' lei/zi. ' + j.why + '.' });
        }
        if (!failed || expired(j)) { doc.done[j.id] = new Date().toISOString(); await save(); } // a refused one is tried again on the next tick
      }
    }
    return { changed: out.length, failed: problems.length || undefined };
  } finally {
    doc.running = null;
    await save().catch((e) => console.error('ads-once save:', e.message));
    if (out.length) await AC.clear().catch(() => {});
  }
}

module.exports = { run, JOBS };
