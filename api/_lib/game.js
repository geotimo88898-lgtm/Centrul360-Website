// Game Mode (admins only): the clinic played as a game. Nothing is invented and nothing is set by hand: every
// number is the portal's own (the KPI model of _lib/kpi.js from START on, the payroll of _lib/payroll.js, Meta's
// spend), and the rules are declared once, here, the same for everyone (Alex Hormozi's principles where he has one,
// industry standards otherwise). The owner plays; he cannot move the goalposts.
//
//   stage      the business's stage on Hormozi's Scaling Roadmap, by its yearly revenue pace
//   level      XP = lei cashed in / 10 + missions claimed + badges won; levels 1 … 100 inside the stages
//   treasury   the profit the business has made since the game started (cashed in - salaries - a manager's salary
//              for the owner - ads - the real costs of the clinics - consumables - the cost of opening a new
//              clinic), after a 16% tax, minus the debts to the state the business had (GAME_DEBT_LEI, a fact kept
//              out of the code): what the garage is bought with
//   garage     "if you can't buy it twice, don't buy it once" (Hormozi): a car unlocks when the treasury holds twice
//              its price and the network's profit buys it in 3 months at most (the owner's rule: 2 months, 3 at
//              most); more clinics, more profit: the way to the cars; with the month it should happen
//   map        the clinics (stars by monthly revenue, occupancy, team, top treatments) and the next city, unlocked
//              by a declared checklist (full calendars, margin, a healthy profit per clinic, the 30-day CAC, the
//              reserve after the debts, a complete team; margin and profit 3 months in a row)
//   season     each quarter a boss: last quarter + 20% (the first quarter: its own pace + 15%), fixed once set
//   missions   daily and weekly, built from the clinic's own pace; claimed by a tap (XP)
//   badges     hundreds, each one measured on one real number (_lib/game-badges.js)
//   team       a player card per person, rated on the last 30 days; the derby: Timișoara vs Arad, this week
//   constraint the one weakest link of the funnel against its benchmark (Hormozi: fix the bottleneck first)
//
// The game's own document: data/game.json { v, claims, badges, unlocked, seasons, seen, adsMonths, payMonths, best,
// cities } (memory only).
// v 2: the first game's unlocks, trophies and seasons were won under rules the owner could set; they start over.

const { bucharestDay } = require('./ads-funnel');
const PAY = require('./payroll');
const TB = require('./timebank');
const BADGES = require('./game-badges');

const DAY = 864e5;
const KEY = 'data/game.json';
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const addDay = (day, n) => bucharestDay(Date.parse(day + 'T12:00:00Z') + n * DAY);
const dayIndex = (day) => Math.round(Date.parse(day + 'T12:00:00Z') / DAY);
const dim = (month) => new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
const monthAdd = (month, n) => new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1)).toISOString().slice(0, 7);
const MONTHS_RO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const monthLabel = (m) => MONTHS_RO[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
const roLei = (n) => Math.round(Number(n) || 0).toLocaleString('ro-RO') + ' lei';
const nDe = (n, noun) => { const a = Math.abs(n), r = a % 100; return n + (a >= 20 && (r === 0 || r >= 20) ? ' de ' : ' ') + noun; }; // 24 de programări
const median = (list) => { const l = list.filter((x) => Number.isFinite(x)); if (!l.length) return null; const s = l.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const toMin = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
function dayFraction(now) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const h = Number((p.find((x) => x.type === 'hour') || {}).value) || 0, m = Number((p.find((x) => x.type === 'minute') || {}).value) || 0;
  return (h * 60 + m) / 1440;
}

// ================================================================ the declared rules (nobody edits these)
const USD_LEI = 4.6;
// Hormozi's Scaling Roadmap (Acquisition.com): ten stages, from $0 to $100M a year. The official roadmap names each
// stage by its headcount, its bottom line and how one graduates; the yearly revenue bands are derived from it at about
// $200k per person, in lei
const STAGES = [
  { i: 0, name: 'Improvizare', en: 'Improvise', min: 0, focus: 'Faci oamenii să-și dorească ce oferi: testezi și strângi dovezi.' },
  { i: 1, name: 'Monetizare', en: 'Monetize', min: 10e3 * USD_LEI, focus: 'Prima vânzare: oferta e destul de bună încât oamenii plătesc.' },
  { i: 2, name: 'Promovare', en: 'Advertise', min: 50e3 * USD_LEI, focus: 'Clientele noi vin neregulat. Fă să afle mai mulți oameni de tine.' },
  { i: 3, name: 'Stabilizare', en: 'Stabilize', min: 200e3 * USD_LEI, focus: 'E prea mult pentru un singur om: angajezi și instruiești echipa.' },
  { i: 4, name: 'Prioritizare', en: 'Prioritize', min: 1e6 * USD_LEI, focus: 'Nu mai încerci să fii totul pentru toți: servești clientele cele mai bune.' },
  { i: 5, name: 'Productizare', en: 'Productize', min: 2e6 * USD_LEI, focus: 'Câștigi prea puțin pe clientă: vinzi al doilea produs premium.' },
  { i: 6, name: 'Optimizare', en: 'Optimize', min: 4e6 * USD_LEI, focus: 'Totul e ineficient: faci mai bine, nu mai mult. Răbdare.' },
  { i: 7, name: 'Categorizare', en: 'Categorize', min: 10e6 * USD_LEI, focus: 'Sistemele sunt copleșite: pui ordine în produse, echipe și drumul clientei.' },
  { i: 8, name: 'Specializare', en: 'Specialize', min: 20e6 * USD_LEI, focus: 'Nimeni nu le mai știe pe toate: echipe dedicate pe fiecare sarcină.' },
  { i: 9, name: 'Capitalizare', en: 'Capitalize', min: 50e6 * USD_LEI, focus: 'De unde vine următoarea creștere mare: un pariu mare pe viitor.' },
];
// the real costs of the clinics, as the owner gave them (October 2026), a month; a city with no figure yet (a new one)
// costs as much as the dearest there is
const COSTS = {
  rent: { 'Timișoara': 3250, 'Arad': 1500 }, // the rent, with the utilities
  accounting: 600,                           // the whole business
  leasing: 11500, leasingUntil: '2026-12',   // the devices' leasing: the last rate in December 2026
};
const rentOf = (c) => (COSTS.rent[c] != null ? COSTS.rent[c] : Math.max(...Object.values(COSTS.rent)));
const sharedCosts = (m) => COSTS.accounting + (m <= COSTS.leasingUntil ? COSTS.leasing : 0);
const fixedFor = (m, list) => list.reduce((n, c) => n + rentOf(c), 0) + sharedCosts(m);
// the standard costs, where the portal has no real figure (Romania 2026 estimates, declared once)
const STD = {
  consumables: 0.08,      // gels, cartridges, disposables: share of what is cashed in (no injectables)
  newClinic: 32000,       // opening a location: 6.000 € (the owner's real cost; more is invested along the way, from its profit)
  healthyProfit: 25000,   // a healthy clinic's profit a month (Gym Launch, Hormozi's company: grow only past it)
  ownerSalary: 8000,      // a manager's market salary for the owner (Hormozi: profit is what is left after paying yourself)
  tax: 0.16,              // the tax on the profit taken out
  adsRatio: 0.12,         // the ads, when Meta can't be read and no month is known yet: a share of what is cashed in
};
// the debts to the state the business had when the game started: a fact, kept in the environment (not in this public code)
const DEBT = Math.max(0, Number(process.env.GAME_DEBT_LEI) || 0);
// opening the next city: all of these (margin and profit per clinic 3 months in a row)
const EXPAND = {
  occupancy: 0.8,         // the calendars are 80% full: the demand is already bigger than the clinics (healthy 70-85%)
  margin: 0.2,            // net margin after salaries, ads and costs (a mature clinic: 15-25%)
  cacPayback: 1,          // a new client's first 30 days pay back what it cost to bring her (Hormozi)
  reserveNew: 6,          // the treasury holds the investment + 6 months of the new clinic's costs
  reserveOld: 3,          //   + 3 months of the clinics there are
  months: 3,
};
// a clinic's stars, by its monthly revenue (lei)
const STARS = [30000, 60000, 100000, 160000, 250000];
// the garage: "if you can't buy it twice, don't buy it once" (Hormozi), and the network's profit (after the tax, the
// last 3 months) buys the car in 3 months at most; the clinics it takes at a healthy clinic's 25.000 lei a month show
// the way; three cars for now; the prices: Romania, October 2026 (the M4 new at the dealer; the GT3 RS and the SVJ at
// what a buyer really pays for a near-new or collector car)
const GARAGE_MONTHS = 3;
const GOALS = [
  { id: 'm4', name: 'BMW M4 Competition', kind: 'car', price: 600000 },
  { id: 'gt3rs', name: 'Porsche 911 GT3 RS', kind: 'car', price: 1700000 },
  { id: 'svj', name: 'Lamborghini Aventador SVJ', kind: 'car', price: 3750000 },
].map((g) => Object.assign(g, { clinics: Math.max(1, Math.ceil(g.price / (STD.healthyProfit * (1 - STD.tax) * GARAGE_MONTHS))) }));
const RULES_TEXT = {
  garage: '„Dacă nu-l poți cumpăra de două ori, nu-l cumpăra nici măcar o dată.” (Alex Hormozi) O mașină se deblochează când seiful are de două ori prețul ei și profitul rețelei (după impozit, media ultimelor 3 luni) o plătește în cel mult ' + GARAGE_MONTHS + ' luni. Clinicile arătate sunt cele de care e nevoie la ' + roLei(STD.healthyProfit) + ' profit pe lună de clinică (o clinică sănătoasă): mai multe clinici, mai mult profit, ele sunt drumul spre mașini. Prețurile sunt cele din România, 2026.',
  treasury: 'Seiful = încasări - salariile echipei - un salariu de manager pentru tine (' + roLei(STD.ownerSalary) + ' pe lună) - reclame (când Meta nu poate fi citit: estimate din ultima lună cunoscută sau ' + Math.round(STD.adsRatio * 100) + '% din încasări) - costurile reale ale clinicilor (chiria cu utilitățile: ' + Object.keys(COSTS.rent).map((c) => c + ' ' + roLei(COSTS.rent[c])).join(', ') + '; contabilitatea ' + roLei(COSTS.accounting) + '; leasingul aparatelor ' + roLei(COSTS.leasing) + ' pe lună până în ' + monthLabel(COSTS.leasingUntil) + ') - ' + Math.round(STD.consumables * 100) + '% consumabile - deschiderea unei clinici noi (' + roLei(STD.newClinic) + '), apoi impozit ' + Math.round(STD.tax * 100) + '% pe profit și minus datoriile la stat. Doar banii făcuți deja, de când a pornit jocul.',
  stage: 'Etapa vine din ritmul anual al încasărilor (ultimele 90 de zile), pe Scaling Roadmap-ul lui Alex Hormozi: zece etape, de la 0 la 100 de milioane de dolari pe an.',
  expand: 'Un oraș nou are sens când nu mai ai unde crește în clinicile de acum (Hormozi: mai mult și mai bine, abia apoi nou): calendare pline (' + Math.round(EXPAND.occupancy * 100) + '%), fiecare clinică face ' + roLei(STD.healthyProfit) + ' profit pe lună și marja netă e de ' + Math.round(EXPAND.margin * 100) + '% (amândouă ' + EXPAND.months + ' luni la rând), clienta nouă își plătește reclama în primele 30 de zile, seiful (după datorii) are deschiderea (' + roLei(STD.newClinic) + ') plus ' + EXPAND.reserveNew + ' luni de costuri ale clinicii noi și ' + EXPAND.reserveOld + ' luni ale celor de acum, iar fiecare clinică are echipă completă.',
  expand_short: 'Profit de ' + roLei(STD.healthyProfit) + ' pe lună în fiecare clinică și marjă netă de ' + Math.round(EXPAND.margin * 100) + '%, ' + EXPAND.months + ' luni la rând; socotit din salariile reale ale echipei și costurile reale ale clinicilor',
  boss: 'Bossul fiecărui trimestru: încasările trimestrului trecut + 20% (dacă jocul l-a prins doar în parte, ritmul lui + 20%). Primul trimestru: ritmul primelor zile lucrătoare + 15%. Nu se mai schimbă după ce apare.',
};

// ================================================================ the map
const KNOWN_CITIES = ['Timișoara', 'Arad', 'Oradea', 'Deva', 'Cluj-Napoca', 'Sibiu', 'Brașov', 'București', 'Iași', 'Constanța', 'Craiova', 'Baia Mare', 'Suceava', 'Galați', 'Pitești', 'Târgu Mureș'];
// the next cities, by distance from the clinics there are (the west first) and size
const EXPANSION = ['Oradea', 'Deva', 'Cluj-Napoca', 'Sibiu', 'Târgu Mureș', 'Brașov', 'Craiova', 'Pitești', 'București', 'Baia Mare', 'Iași', 'Suceava', 'Galați', 'Constanța'];
const cityName = (s) => {
  const f = fold(s).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!f) return '';
  const hit = KNOWN_CITIES.find((c) => { const k = fold(c).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' '); return f === k || f.includes(k) || (k.startsWith('cluj') && f.includes('cluj')) || (k.startsWith('timi') && f.startsWith('timi')); });
  return hit || String(s).trim();
};

// ================================================================ levels, inside the stages
const xpFor = (L) => Math.round(1000 * Math.pow(Math.max(0, L - 1), 1.8));
function levelOf(xp) {
  let L = 1;
  while (xpFor(L + 1) <= xp && L < 100) L++;
  const from = xpFor(L), to = xpFor(L + 1);
  return { level: L, xp: Math.round(xp), from, to, progress: clamp((xp - from) / Math.max(1, to - from), 0, 1) };
}
const RARITY_XP = { comun: 50, rar: 150, epic: 400, legendar: 1000, mitic: 2500 };
const RANK = { comun: 0, rar: 1, epic: 2, legendar: 3, mitic: 4 };
const CATS = { bani: 'Bani', profit: 'Profit', clienti: 'Cliente', vanzari: 'Vânzări', reclame: 'Reclame', echipa: 'Echipa', imperiu: 'Imperiu', joc: 'Joc', serii: 'Serii', tratamente: 'Tratamente' };
const BOSSES = ['Regele Iernii', 'Titanul Primăverii', 'Dragonul Verii', 'Colosul de Sărbători'];
const quarterOf = (day) => { const q = Math.floor((+day.slice(5, 7) - 1) / 3); return { id: day.slice(0, 4) + '-Q' + (q + 1), q, start: day.slice(0, 4) + '-' + String(q * 3 + 1).padStart(2, '0') + '-01' }; };

const DOC_V = 2;
function cleanDoc(d) {
  d = d && typeof d === 'object' ? d : {};
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const old = d.v !== DOC_V; // a first-game document: only the claimed missions and the ads months carry over
  const seen = old ? {} : obj(d.seen);
  return {
    v: DOC_V,
    claims: obj(d.claims), badges: old ? {} : obj(d.badges), unlocked: old ? {} : obj(d.unlocked), seasons: old ? {} : obj(d.seasons),
    seen: Object.assign({ level: 0, goals: [], badges: [], seasons: [], stage: -1, intro: false }, seen, {
      goals: Array.isArray(seen.goals) ? seen.goals : [], badges: Array.isArray(seen.badges) ? seen.badges : [], seasons: Array.isArray(seen.seasons) ? seen.seasons : [] }),
    adsMonths: obj(d.adsMonths), payMonths: old ? {} : obj(d.payMonths), best: old ? {} : obj(d.best),
    cities: old ? {} : obj(d.cities), // city → the month it opened ('start': it was there when the game began)
  };
}

// two copies of the document written by requests that overlapped: nothing earned is lost (a claim made while a GET was
// computing, a badge, an unlock, a season's target, what the owner has already seen)
function mergeDoc(latest, mine) {
  const a = cleanDoc(latest), b = cleanDoc(mine);
  const earliest = (x, y) => { const o = Object.assign({}, y, x); Object.keys(y).forEach((k) => { if (x[k] && y[k] && String(y[k]) < String(x[k])) o[k] = y[k]; }); return o; };
  const seasons = Object.assign({}, b.seasons, a.seasons);
  Object.keys(b.seasons).forEach((k) => { if (a.seasons[k] && b.seasons[k] && b.seasons[k].defeatedAt && !a.seasons[k].defeatedAt) seasons[k] = Object.assign({}, a.seasons[k], { defeatedAt: b.seasons[k].defeatedAt }); });
  const union = (x, y) => [...new Set([].concat(x || [], y || []))].slice(-1000);
  return {
    v: DOC_V,
    claims: Object.assign({}, b.claims, a.claims), badges: earliest(a.badges, b.badges), unlocked: earliest(a.unlocked, b.unlocked), seasons,
    seen: { level: Math.max(a.seen.level || 0, b.seen.level || 0), stage: Math.max(a.seen.stage, b.seen.stage), intro: !!(a.seen.intro || b.seen.intro),
      goals: union(a.seen.goals, b.seen.goals), badges: union(a.seen.badges, b.seen.badges), seasons: union(a.seen.seasons, b.seen.seasons) },
    adsMonths: Object.assign({}, a.adsMonths, b.adsMonths), payMonths: Object.assign({}, a.payMonths, b.payMonths),
    best: { stage: Math.max(Number(a.best.stage) || 0, Number(b.best.stage) || 0) }, cities: Object.assign({}, b.cities, a.cities),
  };
}

// ================================================================ the whole game, from the data
// input: { M (kpi model), employees, sales, attendance, tbAll, appointments, adsDaily, adsOk, adsFrom (the first day Meta was
// read for), doc, now, photoOf }
function build(input) {
  const { M, employees = [], sales = [], attendance = [], tbAll = { payouts: [] }, appointments = [], adsDaily = [], adsOk = false, photoOf = () => '' } = input;
  const now = input.now || Date.now();
  const doc = cleanDoc(input.doc);
  let changed = !input.doc || input.doc.v !== DOC_V;
  const today = bucharestDay(now), month = today.slice(0, 7);
  const firstDay = bucharestDay(M.start), startMonth = firstDay.slice(0, 7);
  const frac = dayFraction(now);
  const inR = (d, a, b) => d >= a && d <= b;
  const d30 = addDay(today, -29) < firstDay ? firstDay : addDay(today, -29);

  // ---- money by day, by city, by category; upsells; the payments as they were written
  const P = M.P.filter((p) => p.counts);
  const rawSale = new Map(sales.filter((s) => s && s.source === 'incasare').map((s) => [s.id, s]));
  const revDay = new Map(), revDayCity = new Map(), upsDay = new Map(), catRev = { 'epilare-laser': 0, faciale: 0, corporale: 0 };
  const add = (map, k, v) => map.set(k, (map.get(k) || 0) + v);
  P.forEach((p) => {
    add(revDay, p.day, p.amount);
    const c = cityName(p.city) || 'Fără oraș';
    add(revDayCity, p.day + '|' + c, p.amount);
    if (p.upsell > 0) add(upsDay, p.day, 1);
    const s = rawSale.get(p.id), cats = (s && s.categories && s.categories.length ? s.categories : s && s.category ? [s.category] : []).filter((x) => x in catRev);
    cats.forEach((k) => { catRev[k] += p.amount / cats.length; });
  });
  sales.forEach((s) => { if (s && s.source === 'comision' && s.origin === 'manual' && s.status !== 'rejected' && String(s.date) >= firstDay) add(upsDay, s.date, 1); });
  const spendDay = new Map((adsDaily || []).map((d) => [d.day, Number(d.spend) || 0]));
  const sumDays = (map, from, to) => { let n = 0; map.forEach((v, d) => { if (d >= from && d <= to) n += v; }); return n; };
  const cityDays = (c) => { const m = new Map(); revDayCity.forEach((v, k) => { const [d, cc] = k.split('|'); if (cc === c) m.set(d, v); }); return m; };

  // ---- the team and the clinics
  const staffAll = employees.filter((e) => e && e.id !== 'admin' && e.role !== 'admin');
  const staff = staffAll.filter((e) => e.active !== false);
  const staffCount = Math.max(1, staff.length);
  const cities = [...new Set(staff.map((e) => cityName(e.location)).filter(Boolean)
    .concat([...revDayCity.keys()].filter((k) => k.split('|')[0] >= addDay(today, -60)).map((k) => k.split('|')[1]).filter((c) => c !== 'Fără oraș')))];
  const locations = Math.max(1, cities.length);
  const firstSeen = !Object.keys(doc.cities).length;
  cities.forEach((c) => { if (!doc.cities[c]) { doc.cities[c] = firstSeen ? 'start' : month; changed = true; } });

  // ---- month by month: cashed in, salaries, ads, standard costs, profit (the current month projected)
  // someone who left counts only in the months she still worked (a payment, a clock-in, a booking of hers)
  const inMonth = (d, m) => String(d || '').slice(0, 7) === m;
  const workedIn = (e, m) => sales.some((x) => x && (x.performedBy === e.id || x.employeeId === e.id) && inMonth(x.date, m))
    || attendance.some((a) => a && a.employeeId === e.id && a.checkIn && inMonth(a.date, m))
    || appointments.some((a) => a && (a.createdBy === e.id || a.cosmeticianId === e.id) && inMonth(a.date, m));
  const payrollOf = (m, list) => (list || staffAll).reduce((n, e) => {
    if (e.active === false && !workedIn(e, m)) return n;
    const pay = PAY.monthPay({ emp: e, month: m, isCurrent: m === month, sales, payouts: tbAll.payouts || [], bank: m === month ? TB.ledger(e.id, tbAll) : null, attendance, appointments });
    return n + pay.total;
  }, 0);
  // the salaries of a month that ended more than 5 days ago are kept (the payroll is heavy to recompute every time)
  const payrollMonth = (m, last) => {
    const settled = m !== month && addDay(last, 5) < today;
    if (settled && doc.payMonths[m] != null) return Number(doc.payMonths[m]) || 0;
    const v = payrollOf(m);
    if (settled) { doc.payMonths[m] = r2(v); changed = true; }
    return v;
  };
  const adsFrom = input.adsFrom || firstDay;
  const months = [];
  const net = (v) => (v > 0 ? v * (1 - STD.tax) : v); // the profit after the tax (a loss is not taxed)
  let adsRatioKnown = null; // ads / cashed in of the last month Meta could be read for: the estimate when it can't be
  for (let m = startMonth; m <= month; m = monthAdd(m, 1)) {
    const first = m === startMonth ? firstDay : m + '-01', last = m + '-' + String(dim(m)).padStart(2, '0');
    const windowDays = dayIndex(last) - dayIndex(first) + 1;
    const share = windowDays / dim(m); // the first month counts from START's day: its costs too
    const current = m === month;
    const elapsed = current ? Math.max(0.5, dayIndex(today) - dayIndex(first) + frac) : windowDays;
    const revenue = sumDays(revDay, first, current ? today : last);
    let ads = sumDays(spendDay, first, current ? today : last);
    // Meta is read for the last ~110 days: a month wholly inside that window is counted (and kept); an older one uses
    // what was kept while it was inside
    const covered = adsOk && first >= adsFrom;
    if (!current) {
      if (doc.adsMonths[m] != null && (!covered || !(ads > 0))) ads = Number(doc.adsMonths[m]) || 0;
      else if (covered && doc.adsMonths[m] !== r2(ads)) { doc.adsMonths[m] = r2(ads); changed = true; }
    }
    // Meta could not be read: the ads are estimated (never counted as nothing, that would inflate the profit)
    const adsKnown = current ? adsOk : covered || doc.adsMonths[m] != null;
    if (!adsKnown) ads = revenue * (adsRatioKnown != null ? adsRatioKnown : STD.adsRatio);
    else if (revenue > 0 && ads > 0) adsRatioKnown = ads / revenue;
    const byCity = {};
    revDayCity.forEach((v, k) => { const [d, c] = k.split('|'); if (d >= first && d <= last) byCity[c] = (byCity[c] || 0) + v; });
    // the clinics of that month: those that cashed in (the current month: the clinics there are now)
    const then = Object.keys(byCity).filter((c) => c !== 'Fără oraș' && byCity[c] > 0);
    const clinicsThen = current || !then.length ? cities : then;
    const payroll = payrollMonth(m, last) * share;
    const fixed = fixedFor(m, clinicsThen) * share;
    const owner = STD.ownerSalary * share;
    let projected = current ? revenue / elapsed * windowDays : revenue;
    let adsProjected = current ? ads / elapsed * windowDays : ads;
    const prev = months[months.length - 1];
    if (current && elapsed < 5 && prev && prev.revenue > 0) { const w = elapsed / 5; projected = projected * w + prev.revenue / prev.share * share * (1 - w); adsProjected = adsProjected * w + prev.ads / prev.share * share * (1 - w); }
    const rev = current ? projected : revenue, adsM = current ? adsProjected : ads;
    const consumables = rev * STD.consumables;
    // what the month has really made so far (the treasury counts this, not the projection)
    const soFarShare = current ? elapsed / windowDays : 1;
    const opened = Object.values(doc.cities).filter((x) => x === m).length * STD.newClinic; // the clinics opened this month
    const realProfit = revenue - (payroll + fixed + owner) * soFarShare - ads - revenue * STD.consumables - opened;
    months.push({ month: m, label: monthLabel(m), first, last, share, windowDays, elapsed: r2(elapsed), current, complete: !current,
      revenue: r2(revenue), projected: r2(projected), payroll: r2(payroll), owner: r2(owner), ads: r2(adsM), adsSoFar: r2(ads), adsKnown, adsStd: !adsKnown && adsRatioKnown == null, opened, fixed: r2(fixed), consumables: r2(consumables),
      profit: r2(rev - payroll - owner - adsM - fixed - consumables), realProfit: r2(realProfit), margin: rev > 0 ? r2((rev - payroll - owner - adsM - fixed - consumables) / rev) : null,
      revPerEmp: r2(rev / share / staffCount), byCity });
  }
  const cur = months[months.length - 1];
  const complete = months.filter((m) => m.complete);
  const grossTreasury = months.reduce((n, m) => n + m.realProfit, 0);
  const treasury = r2(net(grossTreasury) - DEBT);
  const fullMonthProfit = cur.profit / cur.share; // a whole month at today's pace
  const fullMonthRev = cur.projected / cur.share;

  // ---- the stage: the yearly pace of the last 90 days (or since the start)
  const paceFrom = addDay(today, -89) < firstDay ? firstDay : addDay(today, -89);
  const paceDays = Math.max(1, dayIndex(today) - dayIndex(paceFrom) + frac);
  const yearPace = r2(sumDays(revDay, paceFrom, today) / paceDays * 365);
  const stageOf = (v) => STAGES.slice().reverse().find((s) => v >= s.min) || STAGES[0];
  const stage = stageOf(yearPace);
  const nextStage = STAGES[stage.i + 1] || null;
  if (!(doc.best.stage >= stage.i)) { doc.best.stage = stage.i; changed = true; }

  // ---- growth of the last weeks (the forecasts use it; unknown at first: a prudent 3% a month)
  const avgDays = (from, to) => { const n = dayIndex(to) - dayIndex(from) + 1; return n > 0 ? sumDays(revDay, from, to) / n : 0; };
  let growth = 0.03, growthKnown = false;
  if (dayIndex(today) - dayIndex(firstDay) >= 28) {
    const a = avgDays(addDay(today, -14), addDay(today, -1)), b = avgDays(addDay(today, -28), addDay(today, -15));
    if (b > 0) { growth = clamp(Math.pow(a / b, 30 / 14) - 1, -0.05, 0.1); growthKnown = true; }
  }
  // months until a monthly amount (revenue-like) reaches a target at this growth, max 20 years
  const monthsUntil = (startVal, target, perMonthAdd) => {
    if (startVal >= target) return 0;
    let v = startVal, acc = 0;
    for (let k = 1; k <= 240; k++) {
      if (perMonthAdd) { acc += perMonthAdd(k); if (acc >= target - startVal) return k; }
      else { v *= 1 + growth; if (v >= target) return k; }
    }
    return null;
  };
  // the treasury in k months: today's + each month's profit at the growing pace
  const adsRatio = cur.projected > 0 ? cur.ads / cur.projected : 0;
  const costBase = (k) => cur.payroll / cur.share + fixedFor(monthAdd(month, k), cities) + STD.ownerSalary; // the leasing ends
  const profitIn = (k) => { const rev = fullMonthRev * Math.pow(1 + growth, k); return rev * (1 - adsRatio - STD.consumables) - costBase(k); };
  const monthsToTreasury = (target) => {
    if (treasury >= target) return 0;
    let g = grossTreasury;
    for (let k = 0; k <= 240; k++) { g += profitIn(k) * (k === 0 ? Math.max(0, cur.windowDays - cur.elapsed) / dim(cur.month) : 1); if (net(g) - DEBT >= target) return k; }
    return null;
  };
  const monthsToStage = (si) => { const need = STAGES[si].min; if (yearPace >= need) return 0; return monthsUntil(yearPace, need); };

  // ---- the garage: the network's monthly profit after the tax, the last 3 months (the current one at its pace)
  const recent = months.slice(-GARAGE_MONTHS);
  const profitPace = r2(net(recent.reduce((n, m) => n + m.profit / m.share, 0) / recent.length));
  const monthsToProfit = (target) => { for (let k = 0; k <= 240; k++) if (net(profitIn(k)) >= target) return k; return null; };
  const goals = GOALS.map((g, gi) => {
    const need = g.price * 2, profitNeed = Math.ceil(g.price / GARAGE_MONTHS);
    const okProfit = profitPace >= profitNeed;
    const okMoney = treasury >= need;
    if (okProfit && okMoney && !doc.unlocked[g.id]) { doc.unlocked[g.id] = new Date(now).toISOString(); changed = true; }
    const unlocked = !!doc.unlocked[g.id];
    const pMoney = clamp(Math.max(0, treasury) / need, 0, 1), pProfit = clamp(Math.max(0, profitPace) / profitNeed, 0, 1);
    const progress = unlocked ? 1 : r2(Math.min(pMoney, pProfit)); // the weakest condition holds it back
    let eta = null;
    if (!unlocked) {
      const a = monthsToTreasury(need), b = okProfit ? 0 : monthsToProfit(profitNeed), k = a == null || b == null ? null : Math.max(a, b);
      eta = k == null ? { month: null, label: 'nu se apropie în ritmul de acum', clinicsShort: Math.max(0, g.clinics - locations) }
        : { month: monthAdd(month, k), label: monthLabel(monthAdd(month, k)), inMonths: k, years: Math.floor(k / 12), clinicsShort: Math.max(0, g.clinics - locations) };
    }
    return { id: g.id, name: g.name, kind: g.kind, img: g.id, price: g.price, need, clinics: g.clinics, order: gi,
      conditions: [
        { key: 'money', label: 'Seiful: de două ori prețul', value: Math.max(0, treasury), target: need, unit: 'lei', ok: okMoney, progress: r2(pMoney) },
        { key: 'profit', label: 'Profitul pe lună: prețul în ' + GARAGE_MONTHS + ' luni', value: Math.max(0, profitPace), target: profitNeed, unit: 'lei', ok: okProfit, progress: r2(pProfit) },
      ],
      progress, unlocked, unlockedAt: doc.unlocked[g.id] || null, isNew: unlocked && !doc.seen.goals.includes(g.id), eta };
  });

  // ---- the team: a card per person, on the last 30 days
  const d7 = addDay(today, -6), d14 = addDay(today, -13);
  const nameOf = new Map(employees.map((e) => [e.id, String(e.name || '').trim()]));
  const clocking = attendance.some((a) => a && a.checkIn && String(a.date) >= d30);
  const raw = staff.map((e) => {
    const name = nameOf.get(e.id);
    const pays = P.filter((p) => p.by === e.id);
    const rev30 = pays.filter((p) => inR(p.day, d30, today)).reduce((n, p) => n + p.amount, 0);
    const rev7 = pays.filter((p) => inR(p.day, d7, today)).reduce((n, p) => n + p.amount, 0);
    const revPrev7 = pays.filter((p) => inR(p.day, d14, addDay(d7, -1))).reduce((n, p) => n + p.amount, 0);
    const ups = pays.filter((p) => inR(p.day, d30, today) && p.upsell > 0);
    const upsManual = sales.filter((s) => s && s.source === 'comision' && s.origin === 'manual' && s.status === 'approved' && s.employeeId === e.id && inR(String(s.date), d30, today));
    const upsValue = ups.reduce((n, p) => n + p.upsell, 0) + upsManual.reduce((n, s) => n + (Number(s.amount) || 0), 0);
    const made = M.A.filter((a) => a.fresh && a.createdBy === e.id && inR(a.madeDay, d30, today));
    const made7 = made.filter((a) => inR(a.madeDay, d7, today)).length, madePrev7 = made.filter((a) => inR(a.madeDay, d14, addDay(d7, -1))).length;
    const mine = M.A.filter((a) => (e.role === 'cosmetician' ? a.cosmeticianId === e.id : a.createdBy === e.id) && a.fresh && a.due && inR(a.date, d30, today));
    const showRate = mine.length >= 3 ? mine.filter((a) => a.came).length / mine.length : null;
    const contacts = M.L.filter((l) => l.fresh && l.contactBy && fold(l.contactBy) === fold(name) && inR(l.day, d30, today) && l.firstContact).map((l) => (l.firstContact - l.at) / 60000);
    const speed = median(contacts);
    const workDays = TB.weekdaysBetween(d30, today).length;
    const present = new Set(attendance.filter((a) => a.employeeId === e.id && a.checkIn && inR(String(a.date), d30, today)).map((a) => a.date)).size;
    const clients = new Set(pays.filter((p) => inR(p.day, d30, today)).map((p) => p.clientId).filter(Boolean)).size;
    const allRev = pays.reduce((n, p) => n + p.amount, 0), allMade = M.A.filter((a) => a.fresh && a.createdBy === e.id).length;
    return { e, name, rev30, rev7, revPrev7, upsCount: ups.length + upsManual.length, upsValue, made: made.length, made7, madePrev7, showRate, speed,
      presence: clocking && workDays ? clamp(present / workDays, 0, 1) : null, clients, xp: allRev / 10 + allMade * 20 + (ups.length + upsManual.length) * 50 };
  });
  const maxOf = (k) => Math.max(1, ...raw.map((x) => Number(x[k]) || 0));
  const sc = (v) => Math.round(45 + 54 * clamp(v, 0, 1));
  const team = raw.map((x) => {
    const days = Math.max(1, Math.min(30, dayIndex(today) - dayIndex(firstDay) + 1));
    const attrs = x.e.role === 'cosmetician'
      ? [['ÎNC', 'Încasări', sc(x.rev30 / maxOf('rev30'))], ['UPS', 'Upselluri', sc(x.upsValue / maxOf('upsValue'))], ['VEN', 'Cliente venite', x.showRate == null ? 60 : sc((x.showRate - 0.5) / 0.5)],
        ['CLI', 'Cliente', sc(x.clients / maxOf('clients'))], ['PRZ', 'Prezență', x.presence == null ? 60 : sc(x.presence)]]
      : [['PRG', 'Programări', sc((x.made / days) / 30)], ['VEN', 'Cliente venite', x.showRate == null ? 60 : sc((x.showRate - 0.5) / 0.5)],
        ['VIT', 'Viteza la leaduri', x.speed == null ? 60 : sc(1 - clamp((x.speed - 5) / 115, 0, 1))], ['UPS', 'Upselluri', sc(x.upsValue / maxOf('upsValue'))], ['PRZ', 'Prezență', x.presence == null ? 60 : sc(x.presence)]];
    const w = x.e.role === 'cosmetician' ? [0.32, 0.26, 0.16, 0.12, 0.14] : [0.34, 0.2, 0.2, 0.12, 0.14];
    const rating = Math.round(attrs.reduce((n, a, i) => n + a[2] * w[i], 0));
    const formNow = x.e.role === 'cosmetician' ? x.rev7 : x.made7, formPrev = x.e.role === 'cosmetician' ? x.revPrev7 : x.madePrev7;
    const lv = (() => { let L = 1; while (Math.round(300 * Math.pow(L, 1.6)) <= x.xp && L < 99) L++; return L; })();
    return { id: x.e.id, name: x.name, role: x.e.role, pos: x.e.role === 'cosmetician' ? 'COS' : x.e.role === 'receptie' ? 'REC' : 'ECH', city: cityName(x.e.location), photo: photoOf(x.e),
      rating, tier: rating >= 88 ? 'icon' : rating >= 80 ? 'gold' : rating >= 70 ? 'silver' : 'bronze', attrs: attrs.map(([k, label, v]) => ({ k, label, v })),
      form: formNow > formPrev * 1.1 ? 'up' : formNow < formPrev * 0.9 ? 'down' : 'flat', level: lv,
      stats: { rev30: r2(x.rev30), ups: x.upsCount, upsValue: r2(x.upsValue), made: x.made, showRate: x.showRate == null ? null : Math.round(x.showRate * 100), speed: x.speed == null ? null : Math.round(x.speed), presence: x.presence == null ? null : Math.round(x.presence * 100), clients: x.clients } };
  }).sort((a, b) => b.rating - a.rating || b.stats.rev30 - a.stats.rev30);
  if (team.length) team[0].mvp = true;

  // ---- the clinics: occupancy (booked hours / the cosmeticians' hours, last 30 days), stars, details
  const workdays30 = TB.weekdaysBetween(d30, today).length; // the clinics work Monday to Friday
  const apptsOf = (c) => appointments.filter((a) => a && cityName(a.location) === c && !a.block && a.status !== 'concediu' && a.status !== 'anulata' && inR(String(a.date), d30, today));
  const cityInfo = cities.map((c) => {
    const rd = cityDays(c);
    const mRev = sumDays(rd, cur.first, today);
    const people = staff.filter((e) => cityName(e.location) === c);
    const cosm = people.filter((e) => e.role === 'cosmetician').length, rec = people.filter((e) => e.role === 'receptie').length;
    const appts = apptsOf(c);
    const booked = appts.reduce((n, a) => { const s = toMin(a.time), e = toMin(a.endTime); return n + (s != null && e != null && e > s ? Math.min(e - s, 300) : 60); }, 0);
    const capacity = Math.max(1, cosm) * 8 * 60 * Math.max(1, workdays30);
    const occupancy = clamp(booked / capacity, 0, 1.5);
    const due = M.A.filter((a) => a.fresh && a.city === c && a.due && inR(a.date, d30, today));
    const showRate = due.length >= 5 ? due.filter((a) => a.came).length / due.length : null;
    const projectedFull = cur.revenue > 0 ? fullMonthRev * (mRev / cur.revenue) : 0;
    const peoplePay = payrollOf(cur.month, staffAll.filter((e) => cityName(e.location) === c)); // the month's salaries of its people
    const adsShare = cur.revenue > 0 ? (cur.ads / cur.share) * (mRev / cur.revenue) : 0;
    const profit = projectedFull - peoplePay - adsShare - rentOf(c) - sharedCosts(month) / locations - STD.ownerSalary / locations - projectedFull * STD.consumables;
    const treat = new Map();
    P.filter((p) => cityName(p.city) === c && inR(p.day, d30, today)).forEach((p) => { const s = rawSale.get(p.id); const t = String((s && s.treatment) || (p.appt && p.appt.treatment) || '').split(/[·,(]/)[0].trim(); if (t) treat.set(t, (treat.get(t) || 0) + p.amount); });
    const top = [...treat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name, lei]) => ({ name, lei: r2(lei) }));
    const spark = []; for (let d = addDay(today, -29); d <= today; d = addDay(d, 1)) spark.push(r2(rd.get(d) || 0));
    const stars = STARS.filter((s) => projectedFull >= s).length;
    const best = team.filter((t) => t.city === c)[0];
    return { name: c, revenue: r2(mRev), today: r2(rd.get(today) || 0), projected: r2(projectedFull), share: cur.revenue > 0 ? r2(mRev / cur.revenue) : 0,
      staff: people.length, cosm, rec, people: team.filter((t) => t.city === c).map((t) => ({ id: t.id, name: t.name, pos: t.pos, rating: t.rating, tier: t.tier, photo: t.photo })),
      occupancy: r2(occupancy), showRate: showRate == null ? null : Math.round(showRate * 100), profit: r2(profit), margin: projectedFull > 0 ? r2(profit / projectedFull) : null,
      stars, nextStar: STARS[stars] || null, top, spark, best: best ? { name: best.name, rating: best.rating } : null,
      leads30: M.L.filter((l) => l.fresh && l.city === c && inR(l.day, d30, today)).length, visits30: due.filter((a) => a.came).length };
  }).sort((a, b) => b.revenue - a.revenue);

  // ---- the next city: the declared checklist
  const profitNeed = STD.healthyProfit;
  const lastMonths = complete.slice(-EXPAND.months);
  const monthOk = (m) => {
    const clinicsOk = cities.every((c) => m.revenue > 0 && m.profit / m.share * ((m.byCity[c] || 0) / m.revenue) >= profitNeed);
    return clinicsOk && m.margin != null && m.margin >= EXPAND.margin;
  };
  let expStreak = 0;
  for (let i = complete.length - 1; i >= 0 && monthOk(complete[i]); i--) expStreak++;
  const minOcc = cityInfo.length ? Math.min(...cityInfo.map((c) => c.occupancy)) : 0;
  const marginNow = lastMonths.length ? lastMonths.reduce((n, m) => n + (m.margin || 0), 0) / lastMonths.length : (cur.margin || 0);
  const minClinicProfit = cityInfo.length ? Math.min(...cityInfo.map((c) => c.profit)) : 0;
  const reserveNeed = STD.newClinic + EXPAND.reserveNew * rentOf(EXPANSION.find((c) => !cities.includes(c))) + EXPAND.reserveOld * fixedFor(month, cities);
  const teamOk = cityInfo.length ? cityInfo.filter((c) => c.rec >= 1 && c.cosm >= 2).length / cityInfo.length : 0;
  // the 30-day CAC: what a new client brings in her first 30 days (gross) against what the ads paid to bring her; a
  // client from before the game (an appointment brought from HighLevel or made before the start, an old lead) is not new
  const firstPay = new Map(); P.forEach((p) => { if (p.clientId && (!firstPay.has(p.clientId) || p.day < firstPay.get(p.clientId))) firstPay.set(p.clientId, p.day); });
  const oldClients = new Set(sales.filter((x) => x && x.source === 'incasare' && x.clientId && String(x.date) < firstDay).map((x) => x.clientId));
  M.A.forEach((a) => { if (!a.fresh && a.clientId) oldClients.add(a.clientId); });
  P.forEach((p) => { if (p.key === 'org:old' && p.clientId) oldClients.add(p.clientId); });
  const newClients = [...firstPay.entries()].filter(([id, d]) => inR(d, d30, today) && !oldClients.has(id));
  const newGross = newClients.reduce((n, [id, d]) => n + P.filter((p) => p.clientId === id && inR(p.day, d, addDay(d, 29))).reduce((x, p) => x + p.amount, 0), 0) * (1 - STD.consumables);
  const spend30 = adsOk ? sumDays(spendDay, d30, today) : 0;
  const cacRatio = adsOk && newClients.length >= 10 && spend30 > 0 ? (newGross / newClients.length) / (spend30 / newClients.length) : null;
  // what each clinic has to cash in a month for the next one to make sense: solved from the real salaries and the
  // standard costs (its team, its fixed costs, its share of the manager's salary, the ads and consumables ratios) for
  // both the healthy profit and the margin
  const kept = 1 - adsRatio - STD.consumables;
  const costsPerClinic = cur.payroll / cur.share / locations + fixedFor(month, cities) / locations + STD.ownerSalary / locations;
  const needA = kept > 0 ? (profitNeed + costsPerClinic) / kept : Infinity;
  const needB = kept - EXPAND.margin > 0 ? costsPerClinic / (kept - EXPAND.margin) : Infinity;
  const revPerClinicNeed = Number.isFinite(Math.max(needA, needB)) ? Math.ceil(Math.max(needA, needB) / 1000) * 1000 : null;
  const checklist = [
    { key: 'occ', label: 'Calendare pline', value: r2(minOcc), target: EXPAND.occupancy, unit: '%', ok: minOcc >= EXPAND.occupancy, why: 'Cererea e deja mai mare decât clinicile de acum. Sub ' + Math.round(EXPAND.occupancy * 100) + '% e încă loc liber de umplut, nu e nevoie de oraș nou.' },
    { key: 'margin', label: 'Marjă netă', value: r2(marginNow), target: EXPAND.margin, unit: '%', ok: marginNow >= EXPAND.margin, why: 'Fiecare clinică lasă bani după toate costurile, inclusiv salariul tău.' },
    { key: 'profit', label: 'Profit pe clinică pe lună', value: r2(minClinicProfit), target: profitNeed, unit: 'lei', ok: minClinicProfit >= profitNeed, why: 'Pragul unei clinici sănătoase: abia peste el are sens încă una.' },
    { key: 'cac', label: 'Clienta nouă plătește reclama în 30 de zile', value: cacRatio == null ? null : r2(cacRatio), target: EXPAND.cacPayback, unit: 'x', ok: cacRatio != null && cacRatio >= EXPAND.cacPayback, why: 'Hormozi: recuperezi costul clientei în prima lună, altfel creșterea mănâncă banii. Se măsoară de la 10 cliente noi, pe cheltuiala citită din Meta.' },
    { key: 'reserve', label: 'Seiful, după datorii', value: Math.max(0, treasury), target: reserveNeed, unit: 'lei', ok: treasury >= reserveNeed, why: 'Deschiderea (' + roLei(STD.newClinic) + ') plus ' + EXPAND.reserveNew + ' luni de costuri ale clinicii noi și ' + EXPAND.reserveOld + ' ale celor de acum, fără credit și fără datorii la stat.' },
    { key: 'team', label: 'Echipă completă în fiecare clinică', value: r2(teamOk), target: 1, unit: '%', ok: teamOk >= 1, why: 'Recepție și minim două cosmeticiene: clinica merge fără tine.' },
    { key: 'streak', label: 'Luni la rând cu profit și marjă', value: expStreak, target: EXPAND.months, unit: '', ok: expStreak >= EXPAND.months, why: 'O lună bună e noroc, trei sunt un sistem.' },
  ];
  checklist.forEach((x) => { x.progress = r2(clamp(x.target && x.value != null ? x.value / x.target : 0, 0, 1)); });
  const readiness = r2(checklist.reduce((n, x) => n + x.progress, 0) / checklist.length);
  const order = EXPANSION.filter((c) => !cities.includes(c));
  const expMonths = (() => { const a = monthsToTreasury(reserveNeed); const b = revPerClinicNeed == null ? null : monthsUntil(fullMonthRev / Math.max(1, locations), revPerClinicNeed); return a == null || b == null ? null : Math.max(a, b, EXPAND.months); })();
  const map = { active: cityInfo, locked: order.slice(0, 10), next: order[0] || null, readiness, ready: checklist.every((x) => x.ok), checklist,
    revPerClinicNeed, investment: STD.newClinic, eta: expMonths == null ? null : { month: monthAdd(month, expMonths), label: monthLabel(monthAdd(month, expMonths)), inMonths: expMonths }, stars: STARS };

  // ---- the season (the quarter), its boss and its target (declared, fixed once set)
  const Q = quarterOf(today);
  const qStart = Q.start < firstDay ? firstDay : Q.start;
  const qLast = addDay(monthAdd(Q.start.slice(0, 7), 3) + '-01', -1);
  const qDays = dayIndex(qLast) - dayIndex(qStart) + 1;
  const qDone = sumDays(revDay, qStart, today);
  const qElapsed = Math.max(0.5, dayIndex(today) - dayIndex(qStart) + frac);
  let season = doc.seasons[Q.id];
  if (!season || !(season.target > 0) || season.manual) {
    // last quarter + 20%; a last quarter the game saw only in part: its pace + 20%; the very first quarter: its own
    // pace + 15%, once it has a week and a half of working days
    const prevQ = quarterOf(addDay(Q.start, -1));
    const pFrom = prevQ.start < firstDay ? firstDay : prevQ.start, pTo = addDay(Q.start, -1);
    const prevDays = pFrom <= pTo ? dayIndex(pTo) - dayIndex(pFrom) + 1 : 0;
    const prevDone = prevDays ? sumDays(revDay, pFrom, pTo) : 0;
    const prevQDays = dayIndex(pTo) - dayIndex(prevQ.start) + 1;
    let base = null;
    if (prevDone > 0 && prevQ.start >= firstDay) base = prevDone * 1.2;
    else if (prevDone > 0 && prevDays >= 30) base = prevDone / prevDays * prevQDays * 1.2;
    else if (TB.weekdaysBetween(qStart, today).length >= 7) base = qDone / qElapsed * qDays * 1.15;
    if (base != null) {
      season = { target: Math.max(10000, Math.ceil(base / 5000) * 5000), setAt: new Date(now).toISOString() };
      doc.seasons[Q.id] = season; changed = true;
    }
  }
  const target = season && season.target > 0 ? season.target : null;
  if (target && qDone >= target && !season.defeatedAt) { season.defeatedAt = new Date(now).toISOString(); changed = true; }
  // a boss beaten at the end of a quarter the game was not opened in still counts
  Object.keys(doc.seasons).forEach((id) => {
    const x = doc.seasons[id], mm = /^(\d{4})-Q([1-4])$/.exec(id);
    if (id === Q.id || !mm || !x || !(x.target > 0) || x.defeatedAt) return;
    const st = mm[1] + '-' + String((+mm[2] - 1) * 3 + 1).padStart(2, '0') + '-01', en = addDay(monthAdd(st.slice(0, 7), 3) + '-01', -1);
    if (en >= today) return;
    if (sumDays(revDay, st < firstDay ? firstDay : st, en) >= x.target) { x.defeatedAt = new Date(Date.parse(en + 'T19:00:00Z')).toISOString(); changed = true; }
  });
  const bosses = Object.values(doc.seasons).filter((s) => s && s.defeatedAt).length;
  const seasonOut = { id: Q.id, label: 'Sezonul ' + (Q.q + 1) + ' · ' + Q.id.slice(0, 4), boss: BOSSES[Q.q], start: qStart, end: qLast, days: qDays,
    daysLeft: Math.max(0, dayIndex(qLast) - dayIndex(today)), target, done: r2(qDone), pct: target ? clamp(qDone / target, 0, 1) : 0,
    today: r2(revDay.get(today) || 0), needPerDay: target ? r2(Math.max(0, target - qDone) / Math.max(1, dayIndex(qLast) - dayIndex(today) + 1)) : null,
    pace: r2(qDone / qElapsed * qDays), defeated: !!(season && season.defeatedAt), defeatedAt: (season && season.defeatedAt) || null };

  // ---- the race: this month against last month (or the boss's pace)
  const mDays = dim(month), dayNo = dayIndex(today) - dayIndex(month + '-01') + 1;
  const you = [];
  let acc = 0;
  for (let d = 1; d <= dayNo; d++) { const day = month + '-' + String(d).padStart(2, '0'); if (day >= cur.first) acc += revDay.get(day) || 0; you.push(r2(acc)); }
  const pm = monthAdd(month, -1), pmRow = months.find((x) => x.month === pm);
  let rival = [], rivalLabel = '', rivalMode = '';
  if (pmRow && pmRow.complete && pmRow.windowDays >= 20) {
    rivalMode = 'ghost'; rivalLabel = monthLabel(pm).split(' ')[0];
    let a = 0;
    for (let d = 1; d <= mDays; d++) { if (d <= dim(pm)) a += revDay.get(pm + '-' + String(d).padStart(2, '0')) || 0; rival.push(r2(a)); }
  } else if (target) {
    rivalMode = 'boss'; rivalLabel = 'ritmul bossului';
    const perDay = target / qDays;
    for (let d = 1; d <= mDays; d++) { const day = month + '-' + String(d).padStart(2, '0'); rival.push(r2(day < cur.first ? 0 : (dayIndex(day) - dayIndex(cur.first) + 1) * perDay)); }
  }
  const race = { mode: rivalMode, rivalLabel, days: mDays, dayNo, you, rival, lead: rival.length ? r2(acc - (rival[dayNo - 1] || 0)) : null, rivalEnd: rival.length ? rival[mDays - 1] : null };

  // ---- the derby: the clinics against each other, this week (Monday on)
  const dow = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const wStart = addDay(today, -dow), lwStart = addDay(wStart, -7), lwEnd = addDay(wStart, -1);
  const derby = cities.length >= 2 ? cityInfo.slice(0, 2).map((c) => {
    const rd = cityDays(c.name);
    return { name: c.name, revenue: r2(sumDays(rd, wStart, today)), booked: M.A.filter((a) => a.fresh && a.city === c.name && inR(a.madeDay, wStart, today)).length,
      came: M.A.filter((a) => a.fresh && a.city === c.name && a.came && inR(a.date, wStart, today)).length,
      upsells: P.filter((p) => cityName(p.city) === c.name && p.upsell > 0 && inR(p.day, wStart, today)).length };
  }) : null;
  if (derby) {
    const pts = [0, 0];
    ['revenue', 'booked', 'came', 'upsells'].forEach((k) => { if (derby[0][k] > derby[1][k]) pts[0]++; else if (derby[1][k] > derby[0][k]) pts[1]++; });
    derby.forEach((d, i) => { d.points = pts[i]; });
  }

  // ---- the constraint: the funnel of the last 30 days against its benchmarks; the weakest one is the job
  const L30 = M.L.filter((l) => l.fresh && inR(l.day, d30, today));
  const contacted = L30.filter((l) => l.firstContact);
  const speed30 = median(contacted.map((l) => (l.firstContact - l.at) / 60000));
  const booked30 = L30.filter((l) => l.appts.length).length;
  const due30 = M.A.filter((a) => a.fresh && a.due && inR(a.date, d30, today)), came30 = due30.filter((a) => a.came);
  const ups30 = came30.filter((a) => a.pays.some((p) => p.upsell > 0)).length;
  const links = [
    { key: 'speed', label: 'Viteza la leaduri', value: speed30, target: 5, unit: 'min', lower: true, n: contacted.length, min: 10, tip: 'Leadul sunat în primele 5 minute se programează de câteva ori mai des.' },
    { key: 'book', label: 'Leaduri programate', value: L30.length ? booked30 / L30.length * 100 : null, target: 40, unit: '%', n: L30.length, min: 20, tip: 'Din 10 leaduri, 4 ar trebui să ajungă în calendar.' },
    { key: 'show', label: 'Cliente care vin', value: due30.length ? came30.length / due30.length * 100 : null, target: 80, unit: '%', n: due30.length, min: 15, tip: 'Reamintirile și confirmarea din ziua dinainte țin calendarul plin.' },
    { key: 'ups', label: 'Upsell la vizită', value: came30.length ? ups30 / came30.length * 100 : null, target: 25, unit: '%', n: came30.length, min: 15, tip: 'Una din patru cliente venite pleacă cu ceva în plus.' },
  ].filter((x) => x.value != null && x.n >= x.min).map((x) => Object.assign(x, { value: r2(x.value), score: x.lower ? x.target / Math.max(0.1, x.value) : x.value / x.target }));
  const constraint = links.length ? links.slice().sort((a, b) => a.score - b.score)[0] : null;

  // ---- missions: today's and this week's, from the clinic's own pace
  const baseFrom = addDay(today, -14) < firstDay ? firstDay : addDay(today, -14), baseTo = addDay(today, -1);
  const baseDays = Math.max(0, dayIndex(baseTo) - dayIndex(baseFrom) + 1);
  const avgRev = baseDays >= 3 ? sumDays(revDay, baseFrom, baseTo) / baseDays : 0;
  const madeBy = (from, to) => M.A.filter((a) => a.fresh && inR(a.madeDay, from, to)).length;
  const cameBy = (from, to) => M.A.filter((a) => a.fresh && a.came && inR(a.date, from, to)).length;
  const avgMade = baseDays >= 3 ? madeBy(baseFrom, baseTo) / baseDays : 0, avgCame = baseDays >= 3 ? cameBy(baseFrom, baseTo) / baseDays : 0;
  const up100 = (v) => Math.ceil(v / 100) * 100, up500 = (v) => Math.ceil(v / 500) * 500;
  const leadsToday = M.L.filter((l) => l.fresh && l.day === today);
  const fastToday = leadsToday.filter((l) => l.firstContact && l.firstContact - l.at <= 15 * 60000).length;
  const doy = dayIndex(today);
  const daily = [
    { key: 'rev', icon: 'coins', title: 'Încasează azi ' + roLei(Math.max(1000, up100(avgRev * 1.1))), value: r2(revDay.get(today) || 0), target: Math.max(1000, up100(avgRev * 1.1)), unit: 'lei', xp: 150 },
    { key: 'book', icon: 'calendar', title: 'Fă ' + nDe(Math.max(3, Math.ceil(avgMade * 1.1)), 'programări noi azi'), value: madeBy(today, today), target: Math.max(3, Math.ceil(avgMade * 1.1)), unit: '', xp: 100 },
    [
      { key: 'speed', icon: 'bolt', title: 'Sună fiecare lead de azi în sub 15 minute', value: fastToday, target: Math.max(3, leadsToday.length), unit: '', xp: 120, hint: 'minim 3 leaduri' },
      { key: 'ups', icon: 'rocket', title: 'Fă un upsell azi', value: upsDay.get(today) || 0, target: 1, unit: '', xp: 150 },
      { key: 'came', icon: 'users', title: nDe(Math.max(3, Math.ceil(avgCame * 1.05)), 'cliente venite azi'), value: cameBy(today, today), target: Math.max(3, Math.ceil(avgCame * 1.05)), unit: '', xp: 100 },
    ][doy % 3],
  ].map((x) => Object.assign(x, { id: 'd:' + today + ':' + x.key }));
  const wRev = sumDays(revDay, wStart, today), lwRev = sumDays(revDay, lwStart, lwEnd);
  const wUps = sumDays(upsDay, wStart, today), lwUps = sumDays(upsDay, lwStart, lwEnd);
  const wLeads = M.L.filter((l) => l.fresh && inR(l.day, wStart, today));
  const wBooked = wLeads.filter((l) => l.appts.length).length;
  const wRevTarget = Math.max(5000, up500(Math.max(lwRev, avgRev * 7) * 1.05));
  const weekly = [
    { key: 'wrev', icon: 'coins', title: 'Încasează ' + roLei(wRevTarget) + ' săptămâna asta', value: r2(wRev), target: wRevTarget, unit: 'lei', xp: 600 },
    { key: 'wups', icon: 'rocket', title: nDe(Math.max(3, lwUps + 1), 'upselluri săptămâna asta'), value: wUps, target: Math.max(3, lwUps + 1), unit: '', xp: 500 },
    { key: 'wbook', icon: 'target', title: 'Programează 40% din leadurile săptămânii', value: wLeads.length ? Math.round(wBooked / wLeads.length * 100) : 0, target: 40, unit: '%', xp: 500, hint: 'minim 10 leaduri', min: wLeads.length >= 10 },
  ].map((x) => Object.assign(x, { id: 'w:' + wStart + ':' + x.key }));
  const missionState = (x) => Object.assign(x, { done: x.value >= x.target && x.min !== false, claimed: !!doc.claims[x.id], progress: r2(clamp(x.target ? x.value / x.target : 0, 0, 1)) });
  daily.forEach(missionState); weekly.forEach(missionState);
  const msToMidnight = Math.max(1000, Math.round((1 - frac) * DAY));
  const missions = { daily, weekly, dailyResetIn: msToMidnight, weeklyResetIn: msToMidnight + (6 - dow) * DAY, claimable: daily.concat(weekly).filter((x) => x.done && !x.claimed).length };

  // ---- the badges: the numbers they are measured on
  const days = []; for (let d = firstDay; d <= today; d = addDay(d, 1)) days.push(d);
  const weeks = []; for (let w = addDay(firstDay, -((new Date(firstDay + 'T12:00:00Z').getUTCDay() + 6) % 7)); w <= today; w = addDay(w, 7)) weeks.push([w, addDay(w, 6)]);
  const weekend = (d) => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w === 0 || w === 6; };
  let streak = 0, run = 0; days.forEach((d) => { if ((revDay.get(d) || 0) > 0) { run++; streak = Math.max(streak, run); } else if (d !== today && !weekend(d)) run = 0; }); // working days in a row
  const weekRev = weeks.map(([a, b]) => sumDays(revDay, a, b));
  let wGrowth = 0, wrun = 0; for (let i = 1; i < weekRev.length; i++) { if (weekRev[i] > weekRev[i - 1] && weekRev[i - 1] > 0) { wrun++; wGrowth = Math.max(wGrowth, wrun); } else if (i < weekRev.length - 1) wrun = 0; }
  const payDays = new Map(); P.forEach((p) => { if (!p.clientId) return; const s = payDays.get(p.clientId) || new Set(); s.add(p.day); payDays.set(p.clientId, s); });
  const leadDay = new Map(), madeDay = new Map(), cameDay = new Map();
  const adLeadDay = new Map();
  M.L.forEach((l) => { if (l.fresh) { add(leadDay, l.day, 1); if (l.fromAds) add(adLeadDay, l.day, 1); } });
  M.A.forEach((a) => { if (a.fresh) { add(madeDay, a.madeDay, 1); if (a.came) add(cameDay, a.date, 1); } });
  const best = (map) => Math.max(0, ...map.values());
  const monthOfDay = (map) => { const m = new Map(); map.forEach((v, d) => add(m, d.slice(0, 7), v)); return m; };
  const adLeadsMonth = monthOfDay(adLeadDay);
  const cplBest = (() => { let b = null; months.forEach((m) => { if (!m.adsKnown) return; const n = adLeadsMonth.get(m.month) || 0, spend = m.current ? m.adsSoFar : m.ads; if (n >= 20 && spend > 0) { const v = spend / n; if (b == null || v < b) b = v; } }); return b; })();
  const weekStat = (fn) => weeks.map(fn).filter((x) => x != null);
  const ctx = {
    revLifetime: P.reduce((n, p) => n + p.amount, 0), revBestMonth: Math.max(0, ...months.map((m) => m.revenue)), revBestWeek: Math.max(0, ...weekRev), revBestDay: best(revDay),
    profitLifetime: Math.max(0, treasury), profitBestMonth: Math.max(0, ...complete.map((m) => m.profit)),
    leads: M.L.filter((l) => l.fresh).length, leadsBestDay: best(leadDay), leadsBestWeek: Math.max(0, ...weeks.map(([a, b]) => sumDays(leadDay, a, b))),
    booked: M.A.filter((a) => a.fresh).length, bookedBestDay: best(madeDay), came: M.A.filter((a) => a.fresh && a.came).length, cameBestDay: best(cameDay),
    upsells: [...upsDay.values()].reduce((n, v) => n + v, 0), upsellValue: P.reduce((n, p) => n + p.upsell, 0), upsellBest: Math.max(0, ...P.map((p) => p.upsell)),
    clients: new Set(P.map((p) => p.clientId).filter(Boolean)).size, returning: [...payDays.values()].filter((s) => s.size >= 2).length, payments: P.length,
    ticketMax: Math.max(0, ...P.map((p) => p.amount)), ticketAvgBestMonth: Math.max(0, ...months.map((m) => { const l = P.filter((p) => p.day >= m.first && p.day <= m.last); return l.length >= 10 ? l.reduce((n, p) => n + p.amount, 0) / l.length : 0; })),
    packages: P.filter((p) => { const s = rawSale.get(p.id); return s && Number(s.packageTotal) > 0; }).length, // a package starts with its first payment
    roasBestMonth: Math.max(0, ...months.map((m) => { if (!m.adsKnown) return 0; const adsRev = P.filter((p) => p.day >= m.first && p.day <= m.last && !String(p.key).startsWith('org:')).reduce((n, p) => n + p.amount, 0); const spend = m.current ? m.adsSoFar : m.ads; return spend >= 1000 ? adsRev / spend : 0; })),
    cplBestMonth: cplBest,
    showRateBestWeek: Math.max(0, ...weekStat(([a, b]) => { const due = M.A.filter((x) => x.fresh && x.due && inR(x.date, a, b)); return due.length >= 20 ? due.filter((x) => x.came).length / due.length * 100 : null; })),
    bookRateBestWeek: Math.max(0, ...weekStat(([a, b]) => { const l = M.L.filter((x) => x.fresh && inR(x.day, a, b)); return l.length >= 20 ? l.filter((x) => x.appts.length).length / l.length * 100 : null; })),
    speedBestWeek: (() => { const v = weekStat(([a, b]) => { const l = M.L.filter((x) => x.fresh && inR(x.day, a, b) && x.firstContact); return l.length >= 10 ? median(l.map((x) => (x.firstContact - x.at) / 60000)) : null; }); return v.length ? Math.min(...v) : null; })(),
    streakDays: streak, streakWeeksGrowth: wGrowth, saturdays: days.filter((d) => new Date(d + 'T12:00:00Z').getUTCDay() === 6 && (revDay.get(d) || 0) > 0).length,
    cities: locations, team: staff.length, goldCards: team.filter((t) => t.rating >= 80).length, iconCards: team.filter((t) => t.rating >= 88).length,
    revEpilare: catRev['epilare-laser'], revFaciale: catRev.faciale, revCorporale: catRev.corporale,
    cityBestMonth: Math.max(0, ...months.map((m) => Math.max(0, ...Object.values(m.byCity)))),
    missions: Object.keys(doc.claims).length, bosses, goals: GOALS.filter((g) => doc.unlocked[g.id]).length, stage: Math.max(stage.i, doc.best.stage || 0),
  };
  const xpRevenue = ctx.revLifetime / 10, xpMissions = Object.values(doc.claims).reduce((n, c) => n + (Number(c.xp) || 0), 0);
  // the level comes before the badges that need it: the badges' XP is added in a second pass
  const badgeOf = (b) => {
    const v = ctx[b.metric];
    const got = v != null && (b.op === 'lte' ? v > 0 && v <= b.target : v >= b.target);
    if (got && !doc.badges[b.id]) { doc.badges[b.id] = new Date(now).toISOString(); changed = true; }
    const has = !!doc.badges[b.id];
    const progress = v == null ? 0 : b.op === 'lte' ? (v > 0 ? clamp(b.target / v, 0, 1) : 0) : clamp(v / b.target, 0, 1);
    return { id: b.id, cat: b.cat, catLabel: CATS[b.cat] || b.cat, name: b.name, desc: b.desc, rarity: b.rarity, rank: RANK[b.rarity] || 0, xp: RARITY_XP[b.rarity] || 50, icon: b.icon,
      secret: !!b.secret, got: has, at: doc.badges[b.id] || null, isNew: has && !doc.seen.badges.includes(b.id), value: v == null ? null : r2(v), target: b.target, op: b.op, progress: r2(progress) };
  };
  // the badges measured on the level come last: the level they read includes the XP of all the others
  const byId = new Map(BADGES.filter((b) => b.metric !== 'level').map((b) => [b.id, badgeOf(b)]));
  const xpOthers = [...byId.values()].filter((b) => b.got).reduce((n, b) => n + b.xp, 0);
  ctx.level = levelOf(xpRevenue + xpMissions + xpOthers).level;
  BADGES.filter((b) => b.metric === 'level').forEach((b) => byId.set(b.id, badgeOf(b)));
  const badges = BADGES.map((b) => byId.get(b.id));
  const xpBadges = badges.filter((b) => b.got).reduce((n, b) => n + b.xp, 0);
  const level = levelOf(xpRevenue + xpMissions + xpBadges);
  level.sources = { revenue: Math.round(xpRevenue), missions: xpMissions, badges: xpBadges };

  // ---- what happened since the last look (the ceremonies)
  const events = {
    levelUp: doc.seen.level && level.level > doc.seen.level ? { from: doc.seen.level, to: level.level } : null,
    stageUp: doc.seen.stage >= 0 && stage.i > doc.seen.stage ? { from: doc.seen.stage, to: stage.i, name: stage.name } : null,
    goals: goals.filter((g) => g.isNew).map((g) => g.id),
    badges: badges.filter((b) => b.isNew).map((b) => b.id),
    boss: (() => {
      const id = Object.keys(doc.seasons).sort().find((k) => doc.seasons[k] && doc.seasons[k].defeatedAt && !doc.seen.seasons.includes(k));
      if (!id) return null;
      const qq = /-Q([1-4])$/.exec(id), x = doc.seasons[id];
      return { id, boss: BOSSES[(qq ? +qq[1] : 1) - 1], target: x.target, label: 'Sezonul ' + (qq ? qq[1] : '') + ' · ' + id.slice(0, 4) };
    })(),
    intro: !doc.seen.intro,
  };
  if (!doc.seen.level) { doc.seen.level = level.level; changed = true; }
  if (doc.seen.stage < 0) { doc.seen.stage = stage.i; changed = true; }

  const nextGoal = goals.filter((g) => !g.unlocked).sort((a, b) => b.progress - a.progress || a.order - b.order)[0] || null;
  return {
    changed, doc,
    state: {
      now: new Date(now).toISOString(), today, month, monthLabel: monthLabel(month), start: firstDay,
      level, stage: { i: stage.i, name: stage.name, en: stage.en, focus: stage.focus, yearPace, next: nextStage ? { i: nextStage.i, name: nextStage.name, min: nextStage.min, progress: r2(clamp(yearPace / nextStage.min, 0, 1)), eta: (() => { const k = monthsToStage(nextStage.i); return k == null ? null : { label: monthLabel(monthAdd(month, k)), inMonths: k }; })() } : null, all: STAGES.map((s) => ({ i: s.i, name: s.name, min: s.min })) },
      treasury, debt: DEBT, season: seasonOut, race, goals, nextGoal: nextGoal ? nextGoal.id : null, team, missions, badges, map, derby, constraint, events,
      money: { today: r2(revDay.get(today) || 0), month: cur.revenue, projected: cur.projected, lifetime: r2(ctx.revLifetime), yesterday: r2(revDay.get(addDay(today, -1)) || 0) },
      engine: { month: cur.month, label: cur.label, partial: cur.share < 1, from: cur.first, revenue: cur.projected, soFar: cur.revenue, payroll: cur.payroll, owner: cur.owner, ads: cur.ads, fixed: cur.fixed, consumables: cur.consumables,
        profit: cur.profit, margin: cur.margin == null ? null : r2(cur.margin * 100), adsOk, adsEstimated: !cur.adsKnown, adsStd: cur.adsStd, fullMonthProfit: r2(fullMonthProfit), fullMonthNet: r2(net(fullMonthProfit)) },
      months: months.map((m) => ({ month: m.month, label: m.label, revenue: m.revenue, projected: m.projected, profit: m.profit, realProfit: m.realProfit, opened: m.opened, current: m.current, share: r2(m.share) })),
      growth: { rate: r2(growth * 100), known: growthKnown }, locations, staff: staff.length, rules: Object.assign({ std: STD, costs: COSTS, garageMonths: GARAGE_MONTHS, profitPace, expand: EXPAND, stars: STARS, tax: STD.tax }, RULES_TEXT),
    },
  };
}

module.exports = { KEY, GOALS, STAGES, STD, COSTS, EXPAND, STARS, BADGES, KNOWN_CITIES, EXPANSION, build, cleanDoc, mergeDoc, levelOf, xpFor, cityName, quarterOf };
