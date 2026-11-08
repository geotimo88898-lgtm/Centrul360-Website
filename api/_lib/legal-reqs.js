// What a Centrul360 salon and each employee need on paper (Admin → Acte și autorizații, api/portal-legal.js).
// Each item: id, group, title, who (who issues or checks it), basis (the law), docs (the papers it takes), renew (how
// often), months (its usual validity, to suggest an expiry date), applies ('both' | 'Timișoara' | 'Arad'), note,
// src (official sources). Gathered from the official texts on 8.11.2026; where an authority decides case by case, the
// note says so and who to ask. Only facts from the sources; nothing here is legal advice.

const GROUPS = {
  firma: 'Firmă și punct de lucru',
  dsp: 'Sănătate publică (DSP)',
  primarie: 'Primărie',
  isu: 'Pompieri (ISU)',
  aparate: 'Aparatură',
  contracte: 'Contracte de servicii',
  fiscal: 'Fiscal',
  munca: 'Securitate în muncă',
  date: 'Date personale (GDPR)',
  clienti: 'Protecția consumatorului',
  personal: 'Dosarul angajatului',
  instruire: 'Instruiri și sănătate',
  alte: 'Alte documente',
};

const SALON = [];
const EMPLOYEE = [
  { id: 'cim', group: 'personal', title: 'Contract individual de muncă', who: 'Angajatorul, semnat de ambele părți',
    basis: 'Codul muncii (Legea 53/2003), art. 16', docs: ['CIM în formă scrisă, în limba română, semnat înainte de prima zi de lucru', 'Un exemplar înmânat angajatului'],
    renew: 'Act adițional la fiecare schimbare (salariu, program, funcție)' },
  { id: 'revisal', group: 'personal', title: 'Înregistrare în REVISAL', who: 'Angajatorul, transmis la Inspectoratul Teritorial de Muncă',
    basis: 'HG 905/2017 privind registrul general de evidență a salariaților', docs: ['Dovada transmiterii în REVISAL, cel târziu în ziua lucrătoare dinaintea începerii activității'],
    renew: 'La fiecare modificare a contractului' },
  { id: 'fisa-post', group: 'personal', title: 'Fișa postului', who: 'Angajatorul', basis: 'Codul muncii, art. 17 (atribuțiile postului)', docs: ['Fișa postului semnată de angajat, anexă la contract'], renew: 'Când se schimbă atribuțiile' },
  { id: 'ci', group: 'personal', title: 'Copie act de identitate', who: 'Angajatul', docs: ['Copie după buletin sau carte de identitate, valabil'] },
  { id: 'studii', group: 'personal', title: 'Diplome și certificate de calificare', who: 'Angajatul', roles: ['cosmetician'],
    docs: ['Certificatul de calificare profesională de cosmetician (ANC) sau diploma echivalentă', 'Certificatele cursurilor de specializare (de exemplu epilare laser, aparatură)'] },
  { id: 'instruire-aparate', group: 'personal', title: 'Instruire pe aparatură', who: 'Producătorul sau distribuitorul aparatului', roles: ['cosmetician'],
    docs: ['Dovada instruirii pentru fiecare aparat folosit (laser, HIFU, LipoSonix, RF, EMS)'] },
  { id: 'medicina', group: 'instruire', title: 'Fișa de aptitudine (medicina muncii)', who: 'Medicul de medicina muncii',
    basis: 'HG 355/2007 privind supravegherea sănătății lucrătorilor', docs: ['Fișa de aptitudine „apt”, la angajare', 'Apoi la controlul medical periodic'],
    renew: 'La angajare, apoi periodic (de regulă anual)', months: 12 },
  { id: 'ssm', group: 'instruire', title: 'Fișa individuală de instruire SSM', who: 'Angajatorul sau serviciul extern de SSM',
    basis: 'Legea 319/2006 și HG 1425/2006 (normele metodologice)', docs: ['Instruirea introductiv-generală și cea la locul de muncă, la angajare', 'Instruirile periodice, semnate în fișă'],
    renew: 'Periodic: cel mult la 6 luni (la personalul administrativ, cel mult la 12 luni)', months: 6 },
  { id: 'psi', group: 'instruire', title: 'Fișa individuală de instruire PSI', who: 'Angajatorul sau cadrul tehnic PSI',
    basis: 'Legea 307/2006 și OMAI 163/2007', docs: ['Instruirea la angajare și instruirile periodice, semnate în fișă'], renew: 'Periodic, după programul de instruire al firmei', months: 12 },
  { id: 'gdpr', group: 'personal', title: 'Informare GDPR pentru angajat', who: 'Angajatorul', basis: 'Regulamentul (UE) 2016/679, art. 13',
    docs: ['Nota de informare despre datele angajatului, semnată de luare la cunoștință'] },
  { id: 'confidentialitate', group: 'personal', title: 'Angajament de confidențialitate', who: 'Angajatorul', basis: 'Regulamentul (UE) 2016/679, art. 29 și 32',
    docs: ['Angajamentul de a păstra confidențiale datele clientelor (fișe, poze, sănătate)'] },
  { id: 'regulament', group: 'personal', title: 'Regulament intern, luat la cunoștință', who: 'Angajatorul', basis: 'Codul muncii, art. 241-246',
    docs: ['Semnătura angajatului că a primit și a citit regulamentul intern'] },
];

module.exports = { GROUPS, SALON, EMPLOYEE };
