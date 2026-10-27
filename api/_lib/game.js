// Game Mode (admins only): the clinic played as a game. Nothing is invented: every number is the portal's own (the
// KPI model of _lib/kpi.js from START on, the payroll of _lib/payroll.js, Meta's spend), and what the owner writes in
// the game's settings (fixed costs, goals).
//
//   level      XP = lei cashed in / 10 + the missions claimed + the trophies won; titles Salon … Legendă
//   engine     a month's profit: cashed in - salaries - ads - fixed costs (the current month projected at today's pace)
//   goals      the garage: a car, a house, a watch… unlocked when the business can pay for it on its own: N locations,
//              lei per employee, the profit covering the monthly rate X times, M months in a row; with the month it
//              should unlock at today's pace
//   missions   daily and weekly, built from the clinic's own pace; claimed by a tap (XP)
//   trophies   for good, from the first 50.000 lei month to the tenth location
//   season     each quarter a boss: the quarter's target; every leu cashed in is a hit
//   race       this month against last month (or against the boss's pace while there is no last month)
//   team       a player card per person, rated on the last 30 days
//   map        the cities with a clinic, and the next ones, locked, with how ready the business is to open them
//
// The game's own document: data/game.json { goals, settings, claims, trophies, unlocked, seasons, seen, adsMonths }.

const { bucharestDay } = require('./ads-funnel');
const PAY = require('./payroll');
const TB = require('./timebank');

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
const median = (list) => { if (!list.length) return null; const s = list.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const median0 = (list) => median(list.filter((x) => Number.isFinite(x)));

// the hour of the day in Romania, as a fraction of the day (DST-safe)
function dayFraction(now) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const h = Number((p.find((x) => x.type === 'hour') || {}).value) || 0, m = Number((p.find((x) => x.type === 'minute') || {}).value) || 0;
  return (h * 60 + m) / 1440;
}

// ---------------------------------------------------------------- the map: the clinics' cities and the next ones
const KNOWN_CITIES = ['Timișoara', 'Arad', 'Oradea', 'Deva', 'Cluj-Napoca', 'Sibiu', 'Brașov', 'București', 'Iași', 'Constanța', 'Craiova', 'Baia Mare', 'Suceava', 'Galați', 'Pitești', 'Târgu Mureș'];
const EXPANSION = ['Oradea', 'Deva', 'Cluj-Napoca', 'Sibiu', 'Brașov', 'București', 'Iași', 'Constanța', 'Craiova', 'Târgu Mureș', 'Baia Mare', 'Pitești', 'Galați', 'Suceava'];
const cityName = (s) => {
  const f = fold(s).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!f) return '';
  const hit = KNOWN_CITIES.find((c) => { const k = fold(c).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' '); return f === k || f.includes(k) || (k.startsWith('cluj') && f.includes('cluj')) || (k.startsWith('timi') && f.startsWith('timi')); });
  return hit || String(s).trim();
};

// ---------------------------------------------------------------- the garage, until the owner writes his own
const GOALS = [
  { id: 'vacanta', name: 'Vacanță în Maldive', kind: 'trip', img: 'vacanta', price: 45000, cover: 3, minLocations: 2, minRevPerEmp: 0, months: 2 },
  { id: 'rolex', name: 'Rolex Submariner', kind: 'watch', img: 'rolex', price: 70000, cover: 3, minLocations: 2, minRevPerEmp: 0, months: 3 },
  { id: 'm4', name: 'BMW M4 Competition', kind: 'car', img: 'm4', monthly: 12000, cover: 3, minLocations: 2, minRevPerEmp: 25000, months: 3 },
  { id: 'gt3', name: 'Porsche 911 GT3', kind: 'car', img: 'gt3', monthly: 20000, cover: 3, minLocations: 3, minRevPerEmp: 28000, months: 3 },
  { id: 'g63', name: 'Mercedes-AMG G 63', kind: 'car', img: 'g63', monthly: 22000, cover: 3, minLocations: 3, minRevPerEmp: 30000, months: 3 },
  { id: 'casa', name: 'Casa cu piscină', kind: 'house', img: 'casa', monthly: 30000, cover: 3, minLocations: 4, minRevPerEmp: 30000, months: 6 },
  { id: 'lambo', name: 'Lamborghini Revuelto', kind: 'car', img: 'lambo', monthly: 45000, cover: 3, minLocations: 5, minRevPerEmp: 32000, months: 6 },
  { id: 'cullinan', name: 'Rolls-Royce Cullinan', kind: 'car', img: 'cullinan', monthly: 50000, cover: 3, minLocations: 6, minRevPerEmp: 35000, months: 6 },
];
const LIBRARY = ['vacanta', 'rolex', 'm4', 'gt3', 'g63', 'casa', 'lambo', 'cullinan'];
const KINDS = ['car', 'house', 'watch', 'trip', 'other'];
const monthlyOf = (g) => (Number(g.monthly) > 0 ? Number(g.monthly) : Number(g.price) > 0 ? Number(g.price) / 12 : 0);

// ---------------------------------------------------------------- levels
const xpFor = (L) => Math.round(1000 * Math.pow(Math.max(0, L - 1), 1.8));
const TITLES = [[50, 'Legendă', 5], [30, 'Imperiu', 4], [20, 'Brand național', 3], [10, 'Rețea', 2], [5, 'Clinică', 1], [1, 'Salon', 0]];
function levelOf(xp) {
  let L = 1;
  while (xpFor(L + 1) <= xp && L < 200) L++;
  const t = TITLES.find((x) => L >= x[0]);
  const from = xpFor(L), to = xpFor(L + 1);
  return { level: L, title: t[1], tier: t[2], xp: Math.round(xp), from, to, progress: clamp((xp - from) / Math.max(1, to - from), 0, 1),
    nextTitle: (TITLES.slice().reverse().find((x) => x[0] > L) || [])[1] || '', nextTitleAt: (TITLES.slice().reverse().find((x) => x[0] > L) || [])[0] || null };
}

// ---------------------------------------------------------------- trophies
const RARITY = { comun: 0, rar: 1, epic: 2, legendar: 3, mitic: 4 };
const TROPHIES = [
  ['m50k', 'bani', 'Prima lună de 50.000 lei', 'O lună cu peste 50.000 lei încasați.', 'rar', 300, 'coins', (c) => [c.bestMonth, 50000]],
  ['m100k', 'bani', 'Clubul de 100.000', 'O lună cu peste 100.000 lei încasați.', 'epic', 700, 'coins', (c) => [c.bestMonth, 100000]],
  ['m250k', 'bani', 'Un sfert de milion', 'O lună cu peste 250.000 lei încasați.', 'legendar', 1500, 'crown', (c) => [c.bestMonth, 250000]],
  ['m500k', 'bani', 'Jumătate de milion', 'O lună cu peste 500.000 lei încasați.', 'mitic', 3000, 'crown', (c) => [c.bestMonth, 500000]],
  ['m1m', 'bani', 'Milionarul', 'O lună cu peste 1.000.000 lei încasați.', 'mitic', 6000, 'diamond', (c) => [c.bestMonth, 1000000]],
  ['d5k', 'bani', 'Zi de 5.000', 'O zi cu peste 5.000 lei încasați.', 'comun', 100, 'bolt', (c) => [c.bestDay, 5000]],
  ['d10k', 'bani', 'Zi de 10.000', 'O zi cu peste 10.000 lei încasați.', 'rar', 250, 'bolt', (c) => [c.bestDay, 10000]],
  ['d20k', 'bani', 'Zi de foc', 'O zi cu peste 20.000 lei încasați.', 'epic', 600, 'flame', (c) => [c.bestDay, 20000]],
  ['p1', 'profit', 'Prima lună pe plus', 'O lună încheiată pe profit, cu costurile fixe trecute.', 'rar', 400, 'trend', (c) => [c.bestProfit > 0 ? 1 : 0, 1]],
  ['p50k', 'profit', 'Profit de 50.000', 'O lună încheiată cu peste 50.000 lei profit.', 'epic', 1000, 'trend', (c) => [c.bestProfit, 50000]],
  ['p100k', 'profit', 'Profit de 100.000', 'O lună încheiată cu peste 100.000 lei profit.', 'legendar', 2500, 'gem', (c) => [c.bestProfit, 100000]],
  ['c100', 'clienti', 'O sută de vizite', '100 de cliente venite la tratament.', 'comun', 150, 'users', (c) => [c.came, 100]],
  ['c500', 'clienti', 'Cinci sute de vizite', '500 de cliente venite la tratament.', 'rar', 400, 'users', (c) => [c.came, 500]],
  ['c1000', 'clienti', 'O mie de vizite', '1.000 de cliente venite la tratament.', 'epic', 800, 'users', (c) => [c.came, 1000]],
  ['c5000', 'clienti', 'Cinci mii de vizite', '5.000 de cliente venite la tratament.', 'legendar', 2000, 'crown', (c) => [c.came, 5000]],
  ['l100', 'clienti', 'Telefonul sună', '100 de leaduri noi.', 'comun', 100, 'phone', (c) => [c.leads, 100]],
  ['l1000', 'clienti', 'O mie de leaduri', '1.000 de leaduri noi.', 'rar', 400, 'phone', (c) => [c.leads, 1000]],
  ['l5000', 'clienti', 'Magnetul', '5.000 de leaduri noi.', 'epic', 1000, 'magnet', (c) => [c.leads, 5000]],
  ['u10', 'vanzari', 'Primele 10 upselluri', '10 upselluri făcute.', 'comun', 150, 'rocket', (c) => [c.upsells, 10]],
  ['u50', 'vanzari', 'Maestrul upsellului', '50 de upselluri făcute.', 'rar', 400, 'rocket', (c) => [c.upsells, 50]],
  ['u200', 'vanzari', 'Mașina de upselluri', '200 de upselluri făcute.', 'epic', 1000, 'rocket', (c) => [c.upsells, 200]],
  ['r3', 'reclame', 'ROAS 3x', 'O lună în care reclamele au adus de 3 ori cât au costat.', 'rar', 400, 'target', (c) => [c.bestRoas, 3]],
  ['r5', 'reclame', 'ROAS 5x', 'O lună în care reclamele au adus de 5 ori cât au costat.', 'epic', 800, 'target', (c) => [c.bestRoas, 5]],
  ['r10', 'reclame', 'ROAS 10x', 'O lună în care reclamele au adus de 10 ori cât au costat.', 'legendar', 2000, 'target', (c) => [c.bestRoas, 10]],
  ['fast', 'echipa', 'Fulgerul', 'Leadurile unei săptămâni sunate în medie în sub 5 minute (minim 10).', 'rar', 300, 'bolt', (c) => [c.fastWeek ? 1 : 0, 1]],
  ['show90', 'echipa', 'Toată lumea vine', 'O săptămână cu peste 90% din cliente venite (minim 20 programări).', 'epic', 600, 'check', (c) => [c.showWeek ? 1 : 0, 1]],
  ['t5', 'echipa', 'Echipă de 5', '5 oameni în echipă.', 'comun', 150, 'users', (c) => [c.team, 5]],
  ['t10', 'echipa', 'Echipă de 10', '10 oameni în echipă.', 'rar', 400, 'users', (c) => [c.team, 10]],
  ['t20', 'echipa', 'Armata', '20 de oameni în echipă.', 'epic', 1000, 'shield', (c) => [c.team, 20]],
  ['loc2', 'imperiu', 'Două orașe', 'Două locații deschise.', 'rar', 500, 'map', (c) => [c.locations, 2]],
  ['loc3', 'imperiu', 'Trei orașe', 'Trei locații deschise.', 'epic', 1000, 'map', (c) => [c.locations, 3]],
  ['loc5', 'imperiu', 'Rețeaua', 'Cinci locații deschise.', 'legendar', 2500, 'globe', (c) => [c.locations, 5]],
  ['loc10', 'imperiu', 'Imperiul', 'Zece locații deschise.', 'mitic', 6000, 'crown', (c) => [c.locations, 10]],
  ['mis10', 'joc', 'Jucătorul', '10 misiuni revendicate.', 'comun', 100, 'flag', (c) => [c.missions, 10]],
  ['mis50', 'joc', 'Veteranul', '50 de misiuni revendicate.', 'rar', 300, 'flag', (c) => [c.missions, 50]],
  ['mis200', 'joc', 'Neoprit', '200 de misiuni revendicate.', 'epic', 800, 'flag', (c) => [c.missions, 200]],
  ['boss1', 'joc', 'Primul boss', 'Ținta unui sezon atinsă.', 'epic', 1000, 'sword', (c) => [c.bosses, 1]],
  ['boss4', 'joc', 'Patru sezoane', 'Patru sezoane câștigate.', 'legendar', 3000, 'sword', (c) => [c.bosses, 4]],
  ['goal1', 'joc', 'Primul trofeu din garaj', 'Primul obiectiv deblocat.', 'epic', 1000, 'key', (c) => [c.goals, 1]],
  ['goal3', 'joc', 'Colecționarul', 'Trei obiective deblocate.', 'legendar', 2500, 'key', (c) => [c.goals, 3]],
].map(([id, cat, name, desc, rarity, xp, icon, prog]) => ({ id, cat, name, desc, rarity, xp, icon, prog }));
const CATS = { bani: 'Bani', profit: 'Profit', clienti: 'Cliente', vanzari: 'Vânzări', reclame: 'Reclame', echipa: 'Echipa', imperiu: 'Imperiu', joc: 'Joc' };

// ---------------------------------------------------------------- the season's boss
const BOSSES = ['Regele Iernii', 'Titanul Primăverii', 'Dragonul Verii', 'Colosul de Sărbători'];
const quarterOf = (day) => { const q = Math.floor((+day.slice(5, 7) - 1) / 3); return { id: day.slice(0, 4) + '-Q' + (q + 1), q, start: day.slice(0, 4) + '-' + String(q * 3 + 1).padStart(2, '0') + '-01' }; };

// ---------------------------------------------------------------- the document
function cleanDoc(d) {
  d = d && typeof d === 'object' ? d : {};
  return {
    goals: Array.isArray(d.goals) && d.goals.length ? d.goals : GOALS.map((g) => Object.assign({}, g)),
    settings: Object.assign({ costs: {}, expandAt: 100000, next: [] }, d.settings || {}),
    claims: d.claims && typeof d.claims === 'object' ? d.claims : {},
    trophies: d.trophies && typeof d.trophies === 'object' ? d.trophies : {},
    unlocked: d.unlocked && typeof d.unlocked === 'object' ? d.unlocked : {},
    seasons: d.seasons && typeof d.seasons === 'object' ? d.seasons : {},
    seen: Object.assign({ level: 0, goals: [], trophies: [], seasons: [] }, d.seen || {}),
    adsMonths: d.adsMonths && typeof d.adsMonths === 'object' ? d.adsMonths : {},
  };
}
const fixedOf = (settings, city) => { const c = (settings.costs || {})[city] || {}; return ['chirie', 'utilitati', 'consumabile', 'altele'].reduce((n, k) => n + Math.max(0, Number(c[k]) || 0), 0); };

// ---------------------------------------------------------------- the whole game, from the data
// input: { M (kpi model), employees, sales, attendance, tbAll, appointments, adsDaily, adsOk, doc, now, photoOf }
function build(input) {
  const { M, employees = [], sales = [], attendance = [], tbAll = { payouts: [] }, appointments = [], adsDaily = [], adsOk = false, photoOf = () => '' } = input;
  const now = input.now || Date.now();
  const doc = cleanDoc(input.doc);
  let changed = !input.doc || !Array.isArray(input.doc.goals);
  const today = bucharestDay(now), month = today.slice(0, 7);
  const firstDay = bucharestDay(M.start), startMonth = firstDay.slice(0, 7);
  const frac = dayFraction(now);

  // ---- money by day, by city
  const P = M.P.filter((p) => p.counts);
  const revDay = new Map(), revDayCity = new Map(), upsDay = new Map();
  P.forEach((p) => {
    revDay.set(p.day, (revDay.get(p.day) || 0) + p.amount);
    const c = cityName(p.city) || 'Fără oraș';
    const k = p.day + '|' + c; revDayCity.set(k, (revDayCity.get(k) || 0) + p.amount);
    if (p.upsell > 0) upsDay.set(p.day, (upsDay.get(p.day) || 0) + 1);
  });
  // upsells written by hand (Echipa → Vânzări, Comisionul meu) count as upsells too
  sales.forEach((s) => { if (s && s.source === 'comision' && s.origin === 'manual' && s.status !== 'rejected' && s.date >= firstDay) upsDay.set(s.date, (upsDay.get(s.date) || 0) + 1); });
  const spendDay = new Map((adsDaily || []).map((d) => [d.day, Number(d.spend) || 0]));
  const sumDays = (map, from, to) => { let n = 0; map.forEach((v, d) => { if (d >= from && d <= to) n += v; }); return n; };

  // ---- the team
  const staff = employees.filter((e) => e && e.id !== 'admin' && e.role !== 'admin' && e.active !== false);
  const staffCount = Math.max(1, staff.length);
  const cities = [...new Set(staff.map((e) => cityName(e.location)).filter(Boolean)
    .concat([...revDayCity.keys()].filter((k) => k.split('|')[0] >= addDay(today, -60)).map((k) => k.split('|')[1]).filter((c) => c !== 'Fără oraș')))];
  const locations = Math.max(1, cities.length);

  // ---- month by month: cashed in, salaries, ads, fixed costs, profit (the current month projected)
  const fixedAll = cities.reduce((n, c) => n + fixedOf(doc.settings, c), 0);
  const fixedSet = fixedAll > 0;
  const payrollOf = (m) => employees.filter((e) => e && e.id !== 'admin' && e.role !== 'admin').reduce((n, e) => {
    const pay = PAY.monthPay({ emp: e, month: m, isCurrent: m === month, sales, payouts: tbAll.payouts || [], bank: m === month ? TB.ledger(e.id, tbAll) : null, attendance, appointments });
    return n + (e.active === false && !pay.total ? 0 : pay.total);
  }, 0);
  const months = [];
  for (let m = startMonth; m <= month; m = monthAdd(m, 1)) {
    const first = m === startMonth ? firstDay : m + '-01', last = m + '-' + String(dim(m)).padStart(2, '0');
    const windowDays = dayIndex(last) - dayIndex(first) + 1;
    const share = windowDays / dim(m); // the first month counts from START's day: its costs too
    const current = m === month;
    const elapsed = current ? Math.max(0.5, dayIndex(today) - dayIndex(first) + frac) : windowDays;
    const revenue = sumDays(revDay, first, current ? today : last);
    let ads = sumDays(spendDay, first, current ? today : last);
    if (!current) {
      // a finished month's spend is kept: Meta's daily list only reaches ~4 months back
      if (doc.adsMonths[m] != null && !(ads > 0)) ads = Number(doc.adsMonths[m]) || 0;
      else if (adsOk && doc.adsMonths[m] !== r2(ads) && first >= addDay(today, -110)) { doc.adsMonths[m] = r2(ads); changed = true; }
    }
    const payroll = payrollOf(m) * share;
    const fixed = fixedAll * share;
    let projected = current ? revenue / elapsed * windowDays : revenue;
    let adsProjected = current ? ads / elapsed * windowDays : ads;
    // the first days of a month say little: blended with the month before
    const prev = months[months.length - 1];
    if (current && elapsed < 5 && prev && prev.revenue > 0) { const w = elapsed / 5; projected = projected * w + prev.revenue / prev.share * share * (1 - w); adsProjected = adsProjected * w + prev.ads / prev.share * share * (1 - w); }
    const byCity = {};
    revDayCity.forEach((v, k) => { const [d, c] = k.split('|'); if (d >= first && d <= last) byCity[c] = (byCity[c] || 0) + v; });
    months.push({ month: m, label: monthLabel(m), first, last, share: r2(share), windowDays, elapsed: r2(elapsed), current, complete: !current,
      revenue: r2(revenue), projected: r2(projected), payroll: r2(payroll), ads: r2(current ? adsProjected : ads), adsSoFar: r2(ads), fixed: r2(fixed),
      profit: r2((current ? projected : revenue) - payroll - (current ? adsProjected : ads) - fixed),
      revPerEmp: r2((current ? projected : revenue) / share / staffCount), byCity });
  }
  const cur = months[months.length - 1];
  const complete = months.filter((m) => m.complete);

  // ---- the level
  const lifetime = P.reduce((n, p) => n + p.amount, 0);
  const claimXp = Object.values(doc.claims).reduce((n, c) => n + (Number(c.xp) || 0), 0);

  // ---- the season (the quarter), its boss and its target (fixed once set: the boss doesn't move)
  const Q = quarterOf(today);
  const qStart = Q.start < firstDay ? firstDay : Q.start;
  const qEnd = monthAdd(Q.start.slice(0, 7), 3) + '-01'; // first day after
  const qLast = addDay(qEnd, -1);
  const qDays = dayIndex(qLast) - dayIndex(qStart) + 1;
  const qDone = sumDays(revDay, qStart, today);
  const qElapsed = Math.max(0.5, dayIndex(today) - dayIndex(qStart) + frac);
  let season = doc.seasons[Q.id];
  if (!season || !(season.target > 0)) {
    const prevQ = quarterOf(addDay(Q.start, -1));
    const prevStart = prevQ.start < firstDay ? firstDay : prevQ.start;
    const prevDone = sumDays(revDay, prevStart, addDay(Q.start, -1));
    const prevFull = prevQ.start >= firstDay && prevDone > 0;
    const pace = qDone / qElapsed * qDays;
    // still too early to know the pace (under 3 days): the boss waits a little before showing his strength
    if (prevFull || qElapsed >= 3) {
      const base = prevFull ? prevDone * 1.2 : pace * 1.15;
      season = Object.assign({}, season || {}, { target: Math.max(10000, Math.ceil(base / 5000) * 5000), setAt: new Date(now).toISOString() });
      doc.seasons[Q.id] = season; changed = true;
    }
  }
  const target = season && season.target > 0 ? season.target : null;
  if (target && qDone >= target && !season.defeatedAt) { season.defeatedAt = new Date(now).toISOString(); changed = true; }
  const bosses = Object.values(doc.seasons).filter((s) => s && s.defeatedAt).length;
  const seasonOut = { id: Q.id, label: 'Sezonul ' + (Q.q + 1) + ' · ' + Q.id.slice(0, 4), boss: BOSSES[Q.q], start: qStart, end: qLast, days: qDays,
    daysLeft: Math.max(0, dayIndex(qLast) - dayIndex(today)), target, done: r2(qDone), pct: target ? clamp(qDone / target, 0, 1) : 0,
    today: r2(revDay.get(today) || 0), needPerDay: target ? r2(Math.max(0, target - qDone) / Math.max(1, dayIndex(qLast) - dayIndex(today) + 1)) : null,
    pace: r2(qDone / qElapsed * qDays), defeated: !!(season && season.defeatedAt), defeatedAt: season && season.defeatedAt || null, manual: !!(season && season.manual) };

  // ---- the race: this month, day by day, against last month (or the boss's pace)
  const mFirst = cur.first, mDays = dim(month);
  const dayNo = dayIndex(today) - dayIndex(month + '-01') + 1;
  const you = [];
  let acc = 0;
  for (let d = 1; d <= dayNo; d++) { const day = month + '-' + String(d).padStart(2, '0'); if (day >= mFirst) acc += revDay.get(day) || 0; you.push(r2(acc)); }
  const pm = monthAdd(month, -1), pmRow = months.find((x) => x.month === pm);
  let rival = [], rivalLabel = '', rivalMode = '';
  if (pmRow && pmRow.complete && pmRow.windowDays >= 20) {
    rivalMode = 'ghost'; rivalLabel = monthLabel(pm).split(' ')[0];
    let a = 0;
    for (let d = 1; d <= mDays; d++) { const day = pm + '-' + String(Math.min(d, dim(pm))).padStart(2, '0'); if (d <= dim(pm)) a += revDay.get(day) || 0; rival.push(r2(a)); }
  } else if (target) {
    rivalMode = 'boss'; rivalLabel = 'ritmul bossului';
    const perDay = target / qDays;
    for (let d = 1; d <= mDays; d++) { const day = month + '-' + String(d).padStart(2, '0'); rival.push(r2(day < mFirst ? 0 : (dayIndex(day) - dayIndex(mFirst) + 1) * perDay)); }
  }
  const race = { mode: rivalMode, rivalLabel, days: mDays, dayNo, you, rival, lead: rival.length ? r2(acc - (rival[dayNo - 1] || 0)) : null, rivalEnd: rival.length ? rival[mDays - 1] : null };

  // ---- the pace of the last weeks: the growth the forecasts use
  const avgDays = (from, to) => { const n = dayIndex(to) - dayIndex(from) + 1; return n > 0 ? sumDays(revDay, from, to) / n : 0; };
  const histDays = dayIndex(today) - dayIndex(firstDay);
  let growth = 0.05, growthKnown = false;
  if (histDays >= 28) {
    const a = avgDays(addDay(today, -14), addDay(today, -1)), b = avgDays(addDay(today, -28), addDay(today, -15));
    if (b > 0) { growth = clamp(Math.pow(a / b, 30 / 14) - 1, 0, 0.12); growthKnown = true; }
  }

  // ---- the garage: what unlocks when, at today's pace
  const adsRatio = cur.projected > 0 ? cur.ads / cur.projected : 0;
  const costBase = cur.payroll / cur.share + fixedAll; // a full month's salaries and fixed costs
  const fullMonthRev = cur.projected / cur.share;
  const goals = doc.goals.map((g, gi) => {
    const monthly = monthlyOf(g);
    const need = monthly * (Number(g.cover) || 1);
    const minLoc = Math.max(1, Number(g.minLocations) || 1), minRpe = Math.max(0, Number(g.minRevPerEmp) || 0), streakNeed = clamp(Number(g.months) || 1, 1, 24);
    // the finished months in a row (the latest first) where the profit covered it and each person brought enough
    const okMonth = (m) => m.profit >= need * m.share && (!minRpe || m.revPerEmp >= minRpe);
    let streak = 0;
    for (let i = complete.length - 1; i >= 0 && okMonth(complete[i]); i--) streak++;
    const curOk = okMonth(cur);
    const fullProfit = cur.profit / cur.share;
    const conditions = [
      { key: 'loc', label: 'Locații', value: locations, target: minLoc, unit: '', ok: locations >= minLoc },
      ...(minRpe ? [{ key: 'rpe', label: 'Încasări pe angajat pe lună', value: r2(cur.revPerEmp), target: minRpe, unit: 'lei', ok: cur.revPerEmp >= minRpe }] : []),
      { key: 'profit', label: 'Profit lunar (de ' + (Number(g.cover) || 1) + ' ori ' + (Number(g.monthly) > 0 ? 'rata' : 'prețul pe o lună') + ')', value: r2(fullProfit), target: r2(need), unit: 'lei', ok: fullProfit >= need },
      { key: 'streak', label: 'Luni la rând', value: Math.min(streak, streakNeed), target: streakNeed, unit: '', ok: streak >= streakNeed, now: curOk },
    ];
    conditions.forEach((c) => { c.progress = r2(clamp(c.target ? c.value / c.target : 1, 0, 1)); });
    const unlockedNow = locations >= minLoc && streak >= streakNeed;
    if (unlockedNow && !doc.unlocked[g.id]) { doc.unlocked[g.id] = new Date(now).toISOString(); changed = true; }
    const unlocked = !!doc.unlocked[g.id];
    const cp = (k) => (conditions.find((c) => c.key === k) || { progress: 1 }).progress;
    const progress = unlocked ? 1 : r2(0.2 * cp('loc') + (minRpe ? 0.2 * cp('rpe') : 0) + (minRpe ? 0.4 : 0.6) * cp('profit') + 0.2 * cp('streak'));
    // when, at today's pace: the first month the money is there, then the months in a row it asks for
    let eta = null;
    if (!unlocked) {
      let t = null;
      for (let k = 0; k <= 120; k++) {
        const rev = fullMonthRev * Math.pow(1 + growth, k);
        const profit = rev * (1 - adsRatio) - costBase;
        if (profit >= need && (!minRpe || rev / staffCount >= minRpe)) { t = k; break; }
      }
      if (t != null) {
        // this month already counts: the months in a row still missing; otherwise from the first good month on
        const idx = t === 0 && curOk ? Math.max(0, streakNeed - streak - 1) : t + streakNeed - 1;
        const unlockMonth = monthAdd(month, idx);
        eta = { month: unlockMonth, label: monthLabel(unlockMonth), inMonths: idx, money: true };
      } else eta = { month: null, label: 'peste 10 ani în ritmul de acum', money: false };
      if (locations < minLoc) eta.needLocations = minLoc - locations;
    }
    return { id: g.id, name: g.name, kind: g.kind || 'other', img: g.img || '', monthly: Number(g.monthly) || 0, price: Number(g.price) || 0, cover: Number(g.cover) || 1,
      minLocations: minLoc, minRevPerEmp: minRpe, months: streakNeed, order: gi, conditions, progress, unlocked, unlockedAt: doc.unlocked[g.id] || null,
      isNew: unlocked && !doc.seen.goals.includes(g.id), eta, streak };
  });

  // ---- the team: a card per person, on the last 30 days
  const d30 = addDay(today, -29), d7 = addDay(today, -6), d14 = addDay(today, -13);
  const inR = (d, a, b) => d >= a && d <= b;
  const nameOf = new Map(employees.map((e) => [e.id, String(e.name || '').trim()]));
  // the clock-in is used at all (someone clocked in during the 30 days): only then presence counts
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
    const speed = median0(contacts);
    const workDays = TB.weekdaysBetween(d30 < firstDay ? firstDay : d30, today).length;
    const present = new Set(attendance.filter((a) => a.employeeId === e.id && a.checkIn && inR(String(a.date), d30, today)).map((a) => a.date)).size;
    const clients = new Set(pays.filter((p) => inR(p.day, d30, today)).map((p) => p.clientId).filter(Boolean)).size;
    const allRev = pays.reduce((n, p) => n + p.amount, 0), allMade = M.A.filter((a) => a.fresh && a.createdBy === e.id).length;
    return { e, name, rev30, rev7, revPrev7, upsCount: ups.length + upsManual.length, upsValue, made: made.length, made7, madePrev7, showRate, speed, contacts: contacts.length,
      presence: clocking && workDays ? clamp(present / workDays, 0, 1) : null, clients, xp: allRev / 10 + allMade * 20 + (ups.length + upsManual.length) * 50 };
  });
  const maxOf = (k) => Math.max(1, ...raw.map((x) => Number(x[k]) || 0));
  const sc = (v) => Math.round(45 + 54 * clamp(v, 0, 1)); // 45 … 99, like a player's card
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
    const form = formNow > formPrev * 1.1 ? 'up' : formNow < formPrev * 0.9 ? 'down' : 'flat';
    const lv = (() => { let L = 1; while (Math.round(300 * Math.pow(L, 1.6)) <= x.xp && L < 99) L++; return L; })();
    return { id: x.e.id, name: x.name, role: x.e.role, pos: x.e.role === 'cosmetician' ? 'COS' : x.e.role === 'receptie' ? 'REC' : 'ECH', city: cityName(x.e.location), photo: photoOf(x.e),
      rating, tier: rating >= 88 ? 'icon' : rating >= 80 ? 'gold' : rating >= 70 ? 'silver' : 'bronze', attrs: attrs.map(([k, label, v]) => ({ k, label, v })), form, level: lv,
      stats: { rev30: r2(x.rev30), ups: x.upsCount, upsValue: r2(x.upsValue), made: x.made, showRate: x.showRate == null ? null : Math.round(x.showRate * 100), speed: x.speed == null ? null : Math.round(x.speed), presence: x.presence == null ? null : Math.round(x.presence * 100), clients: x.clients } };
  }).sort((a, b) => b.rating - a.rating || b.stats.rev30 - a.stats.rev30);
  if (team.length) team[0].mvp = true;

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
    { key: 'book', icon: 'calendar', title: 'Fă ' + Math.max(3, Math.ceil(avgMade * 1.1)) + ' programări noi azi', value: madeBy(today, today), target: Math.max(3, Math.ceil(avgMade * 1.1)), unit: '', xp: 100 },
    [
      { key: 'speed', icon: 'bolt', title: 'Sună fiecare lead de azi în sub 15 minute', value: fastToday, target: Math.max(3, leadsToday.length), unit: '', xp: 120, hint: 'minim 3 leaduri' },
      { key: 'ups', icon: 'rocket', title: 'Fă un upsell azi', value: upsDay.get(today) || 0, target: 1, unit: '', xp: 150 },
      { key: 'came', icon: 'users', title: Math.max(3, Math.ceil(avgCame * 1.05)) + ' cliente venite azi', value: cameBy(today, today), target: Math.max(3, Math.ceil(avgCame * 1.05)), unit: '', xp: 100 },
    ][doy % 3],
  ].map((x) => Object.assign(x, { id: 'd:' + today + ':' + x.key }));
  const dow = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7; // 0 = Monday
  const wStart = addDay(today, -dow), wEnd = addDay(wStart, 6), lwStart = addDay(wStart, -7), lwEnd = addDay(wStart, -1);
  const wRev = sumDays(revDay, wStart, today), lwRev = sumDays(revDay, lwStart, lwEnd);
  const wUps = sumDays(upsDay, wStart, today), lwUps = sumDays(upsDay, lwStart, lwEnd);
  const wLeads = M.L.filter((l) => l.fresh && inR(l.day, wStart, today));
  const wBooked = wLeads.filter((l) => l.appts.length).length;
  const wRevTarget = Math.max(5000, up500(Math.max(lwRev, avgRev * 7) * 1.05));
  const weekly = [
    { key: 'wrev', icon: 'coins', title: 'Încasează ' + roLei(wRevTarget) + ' săptămâna asta', value: r2(wRev), target: wRevTarget, unit: 'lei', xp: 600 },
    { key: 'wups', icon: 'rocket', title: Math.max(3, lwUps + 1) + ' upselluri săptămâna asta', value: wUps, target: Math.max(3, lwUps + 1), unit: '', xp: 500 },
    { key: 'wbook', icon: 'target', title: 'Programează 40% din leadurile săptămânii', value: wLeads.length ? Math.round(wBooked / wLeads.length * 100) : 0, target: 40, unit: '%', xp: 500, hint: 'minim 10 leaduri', min: wLeads.length >= 10 },
  ].map((x) => Object.assign(x, { id: 'w:' + wStart + ':' + x.key }));
  const missionState = (x) => {
    const done = x.value >= x.target && x.min !== false;
    return Object.assign(x, { done, claimed: !!doc.claims[x.id], progress: r2(clamp(x.target ? x.value / x.target : 0, 0, 1)) });
  };
  daily.forEach(missionState); weekly.forEach(missionState);
  const msToMidnight = Math.max(1000, Math.round((1 - frac) * DAY));
  const missions = { daily, weekly, dailyResetIn: msToMidnight, weeklyResetIn: msToMidnight + (6 - dow) * DAY, claimable: daily.concat(weekly).filter((x) => x.done && !x.claimed).length };

  // ---- trophies
  const weeks = [];
  for (let w = addDay(firstDay, -((new Date(firstDay + 'T12:00:00Z').getUTCDay() + 6) % 7)); w <= today; w = addDay(w, 7)) weeks.push([w, addDay(w, 6)]);
  const ctx = {
    bestMonth: Math.max(0, ...months.map((m) => m.revenue)), bestDay: Math.max(0, ...revDay.values()),
    bestProfit: fixedSet ? Math.max(-Infinity, ...complete.map((m) => m.profit)) : 0,
    came: M.A.filter((a) => a.fresh && a.came).length + 0, leads: M.L.filter((l) => l.fresh).length,
    upsells: [...upsDay.values()].reduce((n, v) => n + v, 0), team: staff.length, locations,
    bestRoas: Math.max(0, ...months.map((m) => {
      const adsRev = P.filter((p) => p.day >= m.first && p.day <= m.last && !String(p.key).startsWith('org:')).reduce((n, p) => n + p.amount, 0);
      const spend = m.current ? m.adsSoFar : m.ads;
      return spend >= 1000 ? adsRev / spend : 0;
    })),
    fastWeek: weeks.some(([a, b]) => { const l = M.L.filter((x) => x.fresh && inR(x.day, a, b) && x.firstContact); return l.length >= 10 && median(l.map((x) => (x.firstContact - x.at) / 60000)) <= 5; }),
    showWeek: weeks.some(([a, b]) => { const due = M.A.filter((x) => x.fresh && x.due && inR(x.date, a, b)); return due.length >= 20 && due.filter((x) => x.came).length / due.length >= 0.9; }),
    missions: Object.keys(doc.claims).length, bosses, goals: Object.keys(doc.unlocked).length,
  };
  if (!Number.isFinite(ctx.bestProfit)) ctx.bestProfit = 0;
  const trophies = TROPHIES.map((t) => {
    const [v, tgt] = t.prog(ctx);
    const got = v >= tgt;
    if (got && !doc.trophies[t.id]) { doc.trophies[t.id] = new Date(now).toISOString(); changed = true; }
    const has = !!doc.trophies[t.id];
    return { id: t.id, cat: t.cat, catLabel: CATS[t.cat], name: t.name, desc: t.desc, rarity: t.rarity, rank: RARITY[t.rarity], xp: t.xp, icon: t.icon, got: has, at: doc.trophies[t.id] || null,
      isNew: has && !doc.seen.trophies.includes(t.id), value: r2(Math.min(v, tgt)), target: tgt, progress: r2(clamp(tgt ? v / tgt : 0, 0, 1)) };
  });
  const trophyXp = trophies.filter((t) => t.got).reduce((n, t) => n + t.xp, 0);
  const level = levelOf(lifetime / 10 + claimXp + trophyXp);
  level.sources = { revenue: Math.round(lifetime / 10), missions: claimXp, trophies: trophyXp };

  // ---- the map
  const active = cities.map((c) => {
    const mRev = sumDays(new Map([...revDayCity].filter(([k]) => k.endsWith('|' + c)).map(([k, v]) => [k.split('|')[0], v])), cur.first, today);
    const people = staff.filter((e) => cityName(e.location) === c);
    const best = team.filter((t) => t.city === c)[0];
    return { name: c, revenue: r2(mRev), today: r2(revDayCity.get(today + '|' + c) || 0), staff: people.length, share: cur.revenue > 0 ? r2(mRev / cur.revenue) : 0,
      projected: r2(cur.revenue > 0 ? cur.projected * (mRev / cur.revenue) : 0), best: best ? { name: best.name, rating: best.rating } : null, fixed: fixedOf(doc.settings, c) };
  }).sort((a, b) => b.revenue - a.revenue);
  const order = (Array.isArray(doc.settings.next) && doc.settings.next.length ? doc.settings.next : EXPANSION).filter((c) => !cities.includes(c));
  const expandAt = Math.max(10000, Number(doc.settings.expandAt) || 100000);
  const cityFull = (c, m) => (m.byCity[c] || 0) / m.share;
  let expStreak = 0;
  for (let i = complete.length - 1; i >= 0 && active.every((a) => cityFull(a.name, complete[i]) >= expandAt); i--) expStreak++;
  const readiness = active.length ? r2(0.7 * Math.min(...active.map((a) => clamp((a.projected / cur.share) / expandAt, 0, 1))) + 0.3 * clamp(expStreak / 3, 0, 1)) : 0;
  const map = { active, locked: order.slice(0, 8), next: order[0] || null, readiness, expandAt, expStreak, ready: readiness >= 1 };

  // ---- what happened since the last look (the ceremonies)
  const events = {
    levelUp: doc.seen.level && level.level > doc.seen.level ? { from: doc.seen.level, to: level.level, title: level.title } : null,
    goals: goals.filter((g) => g.isNew).map((g) => g.id),
    trophies: trophies.filter((t) => t.isNew).map((t) => t.id),
    boss: seasonOut.defeated && !doc.seen.seasons.includes(Q.id) ? Q.id : null,
  };
  if (!doc.seen.level) { doc.seen.level = level.level; changed = true; } // the first visit: no "level up" for the levels already had

  const nextGoal = goals.filter((g) => !g.unlocked).sort((a, b) => b.progress - a.progress)[0] || null;
  return {
    changed, doc,
    state: {
      now: new Date(now).toISOString(), today, month, monthLabel: monthLabel(month), start: firstDay,
      level, season: seasonOut, race, goals, nextGoal: nextGoal ? nextGoal.id : null, team, missions, trophies, map, events,
      money: { today: r2(revDay.get(today) || 0), month: cur.revenue, projected: cur.projected, lifetime: r2(lifetime), yesterday: r2(revDay.get(addDay(today, -1)) || 0) },
      engine: { month: cur.month, label: cur.label, partial: cur.share < 1, from: cur.first, revenue: cur.projected, soFar: cur.revenue, payroll: cur.payroll, ads: cur.ads, fixed: cur.fixed,
        profit: cur.profit, margin: cur.projected > 0 ? r2(cur.profit / cur.projected * 100) : null, fixedSet, adsOk },
      months: months.map((m) => ({ month: m.month, label: m.label, revenue: m.revenue, projected: m.projected, payroll: m.payroll, ads: m.ads, fixed: m.fixed, profit: m.profit, current: m.current, share: m.share })),
      growth: { rate: r2(growth * 100), known: growthKnown },
      locations, staff: staff.length,
      settings: { costs: doc.settings.costs || {}, expandAt, next: order, cities, library: LIBRARY },
    },
  };
}

// ---------------------------------------------------------------- the owner's edits
const clip = (v, n) => String(v == null ? '' : v).replace(/[—–]/g, '-').trim().slice(0, n);
const num = (v, a, b) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, a, b) : 0; };
function cleanGoals(list) {
  if (!Array.isArray(list)) return null;
  const seen = new Set();
  return list.slice(0, 24).map((g) => {
    let id = /^[a-z0-9-]{2,40}$/.test(String(g && g.id || '')) ? String(g.id) : 'g' + Math.random().toString(36).slice(2, 10);
    while (seen.has(id)) id += 'x';
    seen.add(id);
    const img = String(g.img || '');
    const monthly = num(g.monthly, 0, 10000000), price = num(g.price, 0, 100000000);
    return {
      id, name: clip(g.name, 60) || 'Obiectiv', kind: KINDS.includes(g.kind) ? g.kind : 'other',
      img: LIBRARY.includes(img) || /^game\/[\w-]{6,80}\.jpg$/.test(img) ? img : '',
      monthly: monthly > 0 ? Math.round(monthly) : 0, price: monthly > 0 ? 0 : Math.round(price),
      cover: num(g.cover, 1, 20) || 1, minLocations: Math.round(num(g.minLocations, 1, 100)) || 1, minRevPerEmp: Math.round(num(g.minRevPerEmp, 0, 10000000)), months: Math.round(num(g.months, 1, 24)) || 1,
    };
  }).filter((g) => g.monthly > 0 || g.price > 0);
}
function cleanSettings(input, prev) {
  const out = Object.assign({}, prev || {});
  if (input.costs && typeof input.costs === 'object') {
    out.costs = {};
    Object.entries(input.costs).slice(0, 30).forEach(([c, v]) => {
      const city = clip(c, 40);
      if (!city || !v || typeof v !== 'object') return;
      out.costs[city] = { chirie: Math.round(num(v.chirie, 0, 10000000)), utilitati: Math.round(num(v.utilitati, 0, 10000000)), consumabile: Math.round(num(v.consumabile, 0, 10000000)), altele: Math.round(num(v.altele, 0, 10000000)) };
    });
  }
  if (input.expandAt != null) out.expandAt = Math.round(num(input.expandAt, 10000, 100000000)) || 100000;
  if (Array.isArray(input.next)) out.next = input.next.map((c) => clip(c, 40)).filter((c) => KNOWN_CITIES.includes(c)).slice(0, 20);
  return out;
}

module.exports = { KEY, GOALS, LIBRARY, TROPHIES, KNOWN_CITIES, EXPANSION, build, cleanDoc, cleanGoals, cleanSettings, levelOf, xpFor, cityName, quarterOf };
